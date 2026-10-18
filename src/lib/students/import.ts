// Student imports through the shared importer (P10): the CSV import and the
// UDISE+ import. Good rows import while bad rows are listed with their
// problems in plain words; the whole import can be undone from its history.
//
// Nothing is merged on a guess (workflow 15, "The same student is imported
// twice"): a row that may be a child already on record, or whose parent's
// phone is on record under another name, waits for a person's choice
// (same student: update / brother or sister in the same family / a new
// student). A parent with the same phone is linked by itself only when the
// names match (close spellings allowed, see name-match.ts).
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { defineImport, RowProblem, type ImportColumn, type ImportKind, type RowChoice, type RowResult } from "../importer";
import { writeAudit } from "../audit";
import { currentYear } from "../academic/years";
import { checkIndianMobile } from "../format";
import { createStudent, admissionHolder, admissionNoTaken, findDuplicates, nextRollNo, seatsLeft, StudentProblem, DuplicateFound, type DuplicateMatch } from "./students";
import { GENDERS, OPTIONAL_FORM_FIELDS } from "./labels";
import { getStudentSettings } from "./settings";
import { namesAlike } from "./name-match";
import { parseDate } from "./parse-date";
import { studentUpdateImport, type StudentUpdate } from "./update-import";

export { parseDate };

export const STUDENT_IMPORT = "students";
export const UDISE_IMPORT = "students-udise";

const CSV_COLUMNS: ImportColumn[] = [
  { key: "fullName", label: "Full name", required: true, example: "Arjun Rao", aliases: ["name", "student name"] },
  { key: "className", label: "Class", example: "Class 5", help: "Leave empty to use the class chosen on the screen." },
  { key: "sectionName", label: "Section", example: "A" },
  { key: "dateOfBirth", label: "Date of birth", required: true, example: "14-03-2016", help: "DD-MM-YYYY", aliases: ["dob", "birth date"] },
  { key: "gender", label: "Gender", required: true, example: "Male" },
  { key: "guardianName", label: "Father's or guardian's name", required: true, example: "Srinivas Rao", aliases: ["father name", "father's name", "guardian name", "parent name"] },
  { key: "guardianRelation", label: "Relation", example: "Father" },
  { key: "guardianPhone", label: "Parent's phone", required: true, example: "9876543210", aliases: ["phone", "mobile", "parent phone", "father phone", "mobile number"] },
  { key: "motherName", label: "Mother's name", example: "Lakshmi Rao" },
  { key: "motherPhone", label: "Mother's phone", example: "" },
  { key: "admissionNo", label: "Admission number", example: "", help: "Leave empty for the next number.", aliases: ["admission no", "adm no"] },
  { key: "rollNo", label: "Roll number", example: "", aliases: ["roll no"] },
  { key: "admissionDate", label: "Admission date", example: "", help: "DD-MM-YYYY; empty means today." },
  { key: "bloodGroup", label: "Blood group", example: "B+" },
  { key: "category", label: "Category", example: "General" },
  { key: "religion", label: "Religion", example: "" },
  { key: "motherTongue", label: "Mother tongue", example: "Telugu" },
  { key: "address", label: "Address", example: "12-4, Ameerpet, Hyderabad" },
  { key: "aadhaar", label: "Aadhaar number", example: "" },
  { key: "apaarId", label: "APAAR ID", example: "" },
  { key: "pen", label: "PEN", example: "" },
  { key: "previousSchool", label: "Previous school", example: "" },
  { key: "siblingAdmissionNo", label: "Sibling admission number", example: "", help: "A brother's or sister's admission number links the same parents.", aliases: ["sibling", "sibling admission no"] },
];

// UDISE+ student data (India). The file has 66 columns; these are the ones School OS keeps.
const UDISE_COLUMNS: ImportColumn[] = [
  { key: "fullName", label: "Student Name", required: true, example: "ARJUN RAO", aliases: ["name of student", "student name as per school record"] },
  { key: "className", label: "Class", example: "5", aliases: ["present class", "class studying"] },
  { key: "sectionName", label: "Section", example: "A" },
  { key: "dateOfBirth", label: "Date of Birth", required: true, example: "14/03/2016", aliases: ["dob (dd/mm/yyyy)", "dob"] },
  { key: "gender", label: "Gender", required: true, example: "1-Male" },
  { key: "guardianName", label: "Father's Name", required: true, example: "SRINIVAS RAO", aliases: ["father name"] },
  { key: "motherName", label: "Mother's Name", example: "LAKSHMI RAO", aliases: ["mother name"] },
  { key: "guardianPhone", label: "Mobile Number", required: true, example: "9876543210", aliases: ["mobile number of father/mother/guardian", "contact number"] },
  { key: "admissionNo", label: "Admission Number", example: "", aliases: ["admission number in present school"] },
  { key: "admissionDate", label: "Date of Admission", example: "", aliases: ["admission date"] },
  { key: "category", label: "Social Category", example: "1-General" },
  { key: "religion", label: "Religion", example: "1-Hindu" },
  { key: "motherTongue", label: "Mother Tongue", example: "Telugu" },
  { key: "bloodGroup", label: "Blood Group", example: "B+" },
  { key: "address", label: "Address", example: "" },
  { key: "aadhaar", label: "Aadhaar Number", example: "", aliases: ["aadhaar no of student"] },
  { key: "pen", label: "PEN", example: "", aliases: ["student pen", "permanent education number"] },
  { key: "apaarId", label: "APAAR ID", example: "" },
  { key: "rollNo", label: "Roll Number", example: "" },
];

export type ImportOptions = { sectionId: string | null; applyFeePlan: boolean };

type NewRow = {
  mode: "create";
  fullName: string; sectionId: string; dateOfBirth: Date; gender: string; guardianName: string; guardianRelation: string; guardianPhone: string;
  motherName: string | null; motherPhone: string | null; admissionNo: string | null; rollNo: number | null; admissionDate: Date;
  bloodGroup: string | null; category: string | null; religion: string | null; motherTongue: string | null; address: string | null;
  aadhaar: string | null; apaarId: string | null; pen: string | null; previousSchool: string | null; siblingId: string | null;
  /** The parent chosen on screen for a phone already on record under another name ("same family"). */
  linkGuardianId: string | null;
  /** "Same family as row N": the parent added for that earlier row of the file. */
  linkParentName: string | null;
  /** Why the row is saved although it looked like a child already on record. */
  newReason: string | null;
};
/** "Same student: update": the row brings changes to a student already on record. */
type UpdateRow = { mode: "update"; fullName: string; update: StudentUpdate };
type Value = NewRow | UpdateRow;

/** "1-Male" → "Male" (UDISE+ codes), and plain words tidied. */
const uncode = (v: string) => v.replace(/^\s*\d+\s*[-.)]\s*/, "").trim();
function genderOf(v: string) {
  const g = uncode(v).toLowerCase();
  if (["m", "male", "boy"].includes(g)) return "Male";
  if (["f", "female", "girl"].includes(g)) return "Female";
  if (["other", "transgender", "t"].includes(g)) return "Other";
  return null;
}
const CATEGORY_WORDS: Record<string, string> = { general: "General", gen: "General", obc: "OBC", sc: "SC", st: "ST", ews: "EWS" };
const cleanPhone = (v: string) => v.replace(/[^\d]/g, "").replace(/^91(?=\d{10}$)/, "");
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** What a choice made for a row does, in plain words, to show beside the row. */
export function decisionWords(raw: string) {
  const d = readDecision(raw);
  if (d.update) return "Updates the student already on record with this row's details; names stay as they are.";
  if (d.family) return "A new student, linked to the family already on record.";
  if (d.familyRow) return `A new student in the same family as row ${d.familyRow}.`;
  if (d.isNew) return "A new student, with their own parent record.";
  // Enquiries (src/lib/admission/import.ts): a phone on record under another parent's name.
  if (d.sibling) return "A brother or sister: one more enquiry, linked to the family's enquiry.";
  if (d.otherFamily) return "A different family with the same phone: its own enquiry.";
  return "";
}

/** The choice made for a row, read back from its stored value. */
export function readDecision(raw: string | undefined) {
  const d = (raw ?? "").trim();
  return {
    update: new RegExp(`^update:(${UUID})$`, "i").exec(d)?.[1] ?? null,
    family: new RegExp(`^family:(${UUID})$`, "i").exec(d)?.[1] ?? null,
    familyRow: Number(/^family-row:(\d{1,6})$/.exec(d)?.[1] ?? 0) || null,
    isNew: d === "new",
    sibling: d === "sibling",
    otherFamily: d === "other-family",
  };
}

type FileParent = { name: string; line: number };
type FileChild = { name: string; line: number };
/** What one check of one file remembers between rows (`seen` is new for each check). */
type Memory = { settings?: Awaited<ReturnType<typeof getStudentSettings>>; sections: Map<string, string | null>; sectionInfo: Map<string, { yearId: string; label: string }>; parents: Map<string, FileParent[]>; children: Map<string, FileChild[]> };

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function makeKind(key: string, label: string, columns: ImportColumn[], opts: ImportOptions): ImportKind<Value> {
  // Lookups are remembered for one check of one file only (`seen` is new
  // each time), so a class added since, or another school, never gets a stale answer.
  const memories = new WeakMap<Set<string>, Memory>();
  const memoryOf = (seen: Set<string>) => {
    let m = memories.get(seen);
    if (!m) memories.set(seen, (m = { sections: new Map(), sectionInfo: new Map(), parents: new Map(), children: new Map() }));
    return m;
  };
  return {
    key,
    label,
    columns,
    async check(tx, ctx, row, seen, place): Promise<RowResult<Value>> {
      const mem = memoryOf(seen);
      const line = place?.line ?? 0;
      const decision = readDecision(place?.decision);
      const problems: string[] = [];
      const choices: RowChoice[] = [];
      const offer = (c: RowChoice) => { if (!choices.some((x) => x.value === c.value)) choices.push(c); };
      const fullName = row.fullName.replace(/\s+/g, " ").trim();
      const titleName = fullName === fullName.toUpperCase() ? fullName.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : fullName;
      const guardianName = (row.guardianName ?? "").replace(/\s+/g, " ").trim();
      const dob = parseDate(row.dateOfBirth);
      if (!dob) { if (row.dateOfBirth) problems.push(`Date of birth ${row.dateOfBirth} is not a real date. Write it as DD-MM-YYYY.`); }
      else if (dob > new Date()) problems.push(`Date of birth ${row.dateOfBirth} is in the future.`);
      const gender = genderOf(row.gender);
      if (!gender && row.gender) problems.push(`Gender "${row.gender}" is not one of ${GENDERS.join(", ")}.`);
      const phoneProblem = row.guardianPhone ? checkIndianMobile(row.guardianPhone) : null;
      if (phoneProblem) problems.push(`Parent's phone: ${phoneProblem}`);
      const phone = cleanPhone(row.guardianPhone);
      const motherPhone = row.motherPhone ? cleanPhone(row.motherPhone) : null;
      const motherProblem = motherPhone ? checkIndianMobile(motherPhone) : null;
      if (motherProblem) problems.push(`Mother's phone: ${motherProblem}`);
      const admissionNo = row.admissionNo?.trim() || null;
      /** Problems with the values themselves; they also stop an update. */
      const valueProblems = [...problems];

      // ── The same child already on record? By admission number, or a similar
      // name with the same date of birth or the same parent's phone.
      let target: { id: string; fullName: string; admissionNo: string } | null = null;
      const familyIds = new Set<string>();
      if (admissionNo) {
        if (seen.has(`adm:${admissionNo.toLowerCase()}`)) problems.push(`Admission number ${admissionNo} appears twice in this file.`);
        seen.add(`adm:${admissionNo.toLowerCase()}`);
        const holder = await admissionHolder(tx, admissionNo);
        if (holder && !holder.archivedAt && decision.update === holder.id) target = holder;
        else if (holder) {
          problems.push((await admissionNoTaken(tx, admissionNo))!);
          if (!holder.archivedAt) offer({ value: `update:${holder.id}`, label: `Same student: update ${holder.fullName} (${holder.admissionNo}) with this row's details` });
        }
      }
      let dups: DuplicateMatch[] = [];
      if (!target && (dob || phone)) {
        dups = (await findDuplicates(tx, { fullName: titleName, dateOfBirth: dob, guardianPhone: phoneProblem ? null : phone, phones: [motherProblem ? null : motherPhone] }))
          .filter((d) => !choices.some((c) => c.value === `update:${d.id}`));
        const picked = dups.find((d) => d.id === decision.update);
        if (picked) target = picked;
        else if (dups.length) {
          for (const d of dups) if (d.primaryGuardianId) familyIds.add(d.primaryGuardianId);
          if (!decision.isNew && !decision.family) {
            const list = dups.slice(0, 3).map((d) => `${d.fullName}, ${d.admissionNo}${d.classSection ? `, ${d.classSection}` : ""} (${d.why})`).join("; ");
            problems.push(`May already be on record: ${list}.`);
          }
          for (const d of dups.slice(0, 3)) offer({ value: `update:${d.id}`, label: `Same student: update ${d.fullName} (${d.admissionNo}) with this row's details` });
          const first = dups.find((d) => d.primaryGuardianId);
          if (first) offer({ value: `family:${first.primaryGuardianId}`, label: `Brother or sister of ${first.fullName}: add as a new student with the same parents` });
          offer({ value: "new", label: "A different child: add as a new student" });
        }
      }

      // ── Same student: the row's details go onto the student already here.
      if (target) {
        const keep: RowChoice[] = [{ value: `update:${target.id}`, label: `Same student: update ${target.fullName} (${target.admissionNo}) with this row's details` }, ...choices];
        if (valueProblems.length) return { ok: false, problems: valueProblems, choices: keep };
        const r = await studentUpdateImport.check(tx, ctx, {
          // Names stay as on record (the child's and the parent's): the match says it is this child, written another way. Names are corrected on the profile.
          admissionNo: target.admissionNo, fullName: "", dateOfBirth: row.dateOfBirth ?? "", gender: row.gender ?? "",
          guardianName: "", guardianPhone: row.guardianPhone ?? "", address: row.address ?? "", bloodGroup: row.bloodGroup ?? "",
          category: row.category ?? "", religion: row.religion ?? "", motherTongue: row.motherTongue ?? "", apaarId: row.apaarId ?? "", pen: row.pen ?? "",
          previousSchool: row.previousSchool ?? "",
        }, seen);
        if (!r.ok) return { ok: false, problems: [...r.problems.map((p) => p.replace(/^Nothing to change for (.+?): the record already has these values\.$/, "$1 already has these details, so there is nothing to update. Leave this row out."))], choices: keep };
        return { ok: true, value: { mode: "update", fullName: target.fullName, update: r.value } };
      }

      // ── A new student from here on.
      const admissionDate = row.admissionDate ? parseDate(row.admissionDate) : new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
      if (!admissionDate) problems.push(`Admission date ${row.admissionDate} is not a real date.`);
      const rollNo = row.rollNo ? Number(row.rollNo) : null;
      if (row.rollNo && (!Number.isInteger(rollNo) || rollNo! < 1)) problems.push(`Roll number ${row.rollNo} must be a whole number from 1.`);

      // Class and section: the row's own, or the one chosen on the screen.
      let sectionId = opts.sectionId;
      if (row.className) {
        const k = `${ctx.schoolId}|${row.className}|${row.sectionName}`;
        if (!mem.sections.has(k)) {
          const year = await currentYear(tx, ctx);
          const cls = row.className.trim();
          const names = [cls, `Class ${cls}`, cls.replace(/^class\s*/i, "Class ")];
          const sec = year ? await tx.section.findFirst({
            where: { academicYearId: year.id, archivedAt: null, name: { equals: (row.sectionName || "A").trim(), mode: "insensitive" }, schoolClass: { name: { in: names, mode: "insensitive" } } },
          }) : null;
          mem.sections.set(k, sec?.id ?? null);
        }
        sectionId = mem.sections.get(k) ?? null;
        if (!sectionId) problems.push(`Class ${row.className} ${row.sectionName || "A"} is not set up this year. Add it in Academic Management or fix the class.`);
      }
      if (!sectionId && !row.className) problems.push("Class is empty. Choose a class on the screen or fill the Class column.");

      if (sectionId) {
        const seatKey = `seat:${sectionId}`;
        let used = 0;
        while (seen.has(`${seatKey}:${used}`)) used++;
        if ((await seatsLeft(tx, sectionId)) - used <= 0) problems.push("The section is full. Add seats in Academic Management or choose another section.");
        else seen.add(`${seatKey}:${used}`);
        // Roll numbers are one per student in the section this year (as on Add student).
        if (rollNo && Number.isInteger(rollNo) && rollNo > 0) {
          if (!mem.sectionInfo.has(sectionId)) {
            const sec = await tx.section.findUnique({ where: { id: sectionId }, include: { schoolClass: true } });
            if (sec) mem.sectionInfo.set(sectionId, { yearId: sec.academicYearId, label: `${sec.schoolClass.name} ${sec.name}` });
          }
          const info = mem.sectionInfo.get(sectionId);
          if (info) {
            const rollKey = `roll:${sectionId}:${rollNo}`;
            if (seen.has(rollKey)) problems.push(`Roll number ${rollNo} is on another row of this file for ${info.label}.`);
            else {
              const clash = await tx.enrolment.findFirst({ where: { sectionId, academicYearId: info.yearId, rollNo, archivedAt: null }, select: { id: true } });
              if (clash) problems.push(`Roll number ${rollNo} is already used in ${info.label}. The next free number is ${await nextRollNo(tx, sectionId, info.yearId)}; leave the roll number empty to give it.`);
              else seen.add(rollKey);
            }
          }
        }
      }

      // Brothers and sisters in the same file: a similar name with the same date of birth twice is one child.
      if (dob) {
        const k = dob.toISOString().slice(0, 10);
        const earlier = (mem.children.get(k) ?? []).find((c) => namesAlike(c.name, titleName));
        if (earlier && !decision.isNew) {
          problems.push(`Row ${earlier.line} has the same child (${earlier.name}, same date of birth). Keep one row, or choose that they are different children.`);
          offer({ value: "new", label: "Different children (twins or namesakes): add both" });
        }
      }

      const aadhaar = row.aadhaar?.replace(/\s+/g, "") || null;
      if (aadhaar && !/^\d{12}$/.test(aadhaar)) problems.push("Aadhaar number must have 12 digits.");
      const cat = row.category ? uncode(row.category) : null;
      const filled: Record<string, string | null> = {
        bloodGroup: row.bloodGroup?.trim() || null, category: cat ? CATEGORY_WORDS[cat.toLowerCase()] ?? cat : null, religion: row.religion ? uncode(row.religion) || null : null,
        motherTongue: row.motherTongue?.trim() || null, address: row.address?.trim() || null, aadhaar, previousSchool: row.previousSchool?.trim() || null,
      };
      // Fields this school's Student Settings make required, as on Add student.
      const settings = (mem.settings ??= await getStudentSettings(tx, ctx));
      for (const f of settings.requiredFields) {
        if (f in filled && !filled[f]) problems.push(`${OPTIONAL_FORM_FIELDS.find((o) => o.key === f)?.label ?? f} is required in this school (Student Settings).`);
      }

      let siblingId: string | null = null;
      if (row.siblingAdmissionNo) {
        const sib = await tx.student.findFirst({ where: { admissionNo: { equals: row.siblingAdmissionNo.trim(), mode: "insensitive" }, archivedAt: null } });
        if (!sib) problems.push(`Sibling admission number ${row.siblingAdmissionNo} was not found.`);
        siblingId = sib?.id ?? null;
      }

      // ── The parent's phone: on record under another name is never linked on a guess.
      let linkGuardianId: string | null = null;
      let linkParentName: string | null = null;
      if (!siblingId && phone && !phoneProblem && guardianName) {
        const onRecord = await tx.guardian.findMany({
          where: { phone, archivedAt: null }, orderBy: { createdAt: "asc" }, take: 6,
          include: { students: { where: { archivedAt: null, student: { archivedAt: null } }, include: { student: { select: { fullName: true } } }, take: 3 } },
        });
        for (const g of onRecord) familyIds.add(g.id);
        const sameName = onRecord.find((g) => namesAlike(g.name, guardianName));
        if (decision.family && familyIds.has(decision.family)) linkGuardianId = decision.family;
        else if (!sameName && onRecord.length) {
          if (!decision.isNew) problems.push(`Parent's phone ${phone} is already on record for ${onRecord.slice(0, 3).map((g) => g.name).join(", ")}, not ${guardianName}. Say whether this is the same family.`);
          for (const g of onRecord.slice(0, 3)) {
            const kids = g.students.map((s) => s.student.fullName);
            offer({ value: `family:${g.id}`, label: `Same family: link to ${g.name}${kids.length ? ` (parent of ${kids.join(", ")})` : ""}` });
          }
          offer({ value: "new", label: dups.length ? "A different child: add as a new student" : `A different family: add ${guardianName} as a new parent with this phone` });
        } else if (!onRecord.length) {
          // Not on record yet, but maybe on an earlier row of this file.
          const earlier = mem.parents.get(phone) ?? [];
          if (earlier.length && !earlier.some((p) => namesAlike(p.name, guardianName))) {
            const chosen = earlier.find((p) => p.line === decision.familyRow);
            if (chosen) linkParentName = chosen.name;
            else {
              if (!decision.isNew) problems.push(`Row ${earlier[0].line} has this phone with another parent's name (${earlier[0].name}). Say whether this is the same family.`);
              for (const p of earlier.slice(0, 3)) offer({ value: `family-row:${p.line}`, label: `Same family as row ${p.line}: link to ${p.name}` });
              offer({ value: "new", label: `A different family: add ${guardianName} as a new parent with this phone` });
            }
          }
        }
      }
      if (decision.family && !linkGuardianId && !siblingId) {
        if (familyIds.has(decision.family)) linkGuardianId = decision.family;
        else problems.push("The family chosen for this row is not offered any more. Choose again.");
      }

      if (problems.length) return { ok: false, problems, ...(choices.length ? { choices } : {}) };
      // Only rows that will be imported are remembered for the rows after them.
      if (dob) {
        const k = dob.toISOString().slice(0, 10);
        mem.children.set(k, [...(mem.children.get(k) ?? []), { name: titleName, line }]);
      }
      if (phone && guardianName && !linkGuardianId && !linkParentName) {
        const list = mem.parents.get(phone) ?? [];
        if (!list.some((p) => namesAlike(p.name, guardianName))) mem.parents.set(phone, [...list, { name: guardianName, line }]);
      }
      const chosenNew = decision.isNew || Boolean(decision.family) || Boolean(decision.familyRow);
      return {
        ok: true,
        value: {
          mode: "create",
          fullName: titleName, sectionId: sectionId!, dateOfBirth: dob!, gender: gender!, guardianName,
          guardianRelation: row.guardianRelation?.trim() || "Father", guardianPhone: phone, motherName: row.motherName?.replace(/\s+/g, " ").trim() || null,
          motherPhone, admissionNo, rollNo, admissionDate: admissionDate!, bloodGroup: filled.bloodGroup, category: filled.category, religion: filled.religion,
          motherTongue: filled.motherTongue, address: filled.address, aadhaar, apaarId: row.apaarId?.trim() || null, pen: row.pen?.trim() || null,
          previousSchool: filled.previousSchool, siblingId, linkGuardianId, linkParentName,
          newReason: chosenNew && dups.length ? `Chosen in the import preview: a different child from ${dups.map((d) => d.admissionNo).join(", ")}` : null,
        },
      };
    },

    async save(tx, ctx, v) {
      if (v.mode === "update") {
        try {
          return await studentUpdateImport.save(tx, ctx, v.update);
        } catch (e) {
          if (e instanceof StudentProblem) throw new RowProblem(`${v.fullName}: ${e.message}`);
          throw e;
        }
      }
      // The parent: the sibling's; the one chosen on screen; or one already on
      // record with this phone and the same name (never another name on a guess).
      let linkGuardianId: string | null = null;
      if (v.siblingId) {
        linkGuardianId = (await tx.studentGuardian.findFirst({ where: { studentId: v.siblingId, isPrimary: true, archivedAt: null } }))?.guardianId ?? null;
      }
      linkGuardianId ??= v.linkGuardianId;
      if (!linkGuardianId) {
        const onRecord = await tx.guardian.findMany({ where: { phone: v.guardianPhone, archivedAt: null }, orderBy: { createdAt: "asc" }, take: 20 });
        if (v.linkParentName) {
          linkGuardianId = onRecord.find((g) => namesAlike(g.name, v.linkParentName!))?.id ?? null;
          if (!linkGuardianId) throw new RowProblem(`${v.fullName}: the parent of the earlier row (${v.linkParentName}) was not added, so this row could not be linked to them. Bring it in again after that row.`);
        } else {
          linkGuardianId = onRecord.find((g) => namesAlike(g.name, v.guardianName))?.id ?? null;
        }
      }
      let created;
      try {
        created = await createStudent(tx, ctx, {
          ...v, linkGuardianId, applyFeePlan: opts.applyFeePlan, how: "imported",
          duplicateReason: v.newReason ?? "Checked in the import preview",
        });
      } catch (e) {
        if (e instanceof DuplicateFound || e instanceof StudentProblem) throw new RowProblem(`${v.fullName}: ${e.message}`);
        throw e;
      }
      const { student } = created;
      if (v.apaarId || v.pen) await tx.student.update({ where: { id: student.id }, data: { apaarId: v.apaarId, pen: v.pen } });
      const primary = (await tx.studentGuardian.findFirst({ where: { studentId: student.id, isPrimary: true, archivedAt: null } }))?.guardianId ?? null;
      // The sibling's other parents are linked too.
      if (v.siblingId) {
        const others = await tx.studentGuardian.findMany({ where: { studentId: v.siblingId, archivedAt: null, guardianId: { not: primary ?? undefined } } });
        for (const o of others) {
          await linkOnce(tx, ctx, student.id, o.guardianId, { relationship: o.relationship, emergencyOrder: o.emergencyOrder, canPickUp: o.canPickUp, restriction: o.restriction });
        }
      } else if (v.motherName) {
        // The mother: one already on record with her phone and her name (a brother's
        // or sister's mother), else a new record. Never the father's record, even on one shared phone.
        const phone = v.motherPhone ?? v.guardianPhone;
        const onRecord = await tx.guardian.findMany({ where: { phone, archivedAt: null, ...(primary ? { id: { not: primary } } : {}) }, orderBy: { createdAt: "asc" }, take: 20 });
        const mother = onRecord.find((g) => namesAlike(g.name, v.motherName!))
          ?? await tx.guardian.create({ data: { schoolId: ctx.schoolId, name: v.motherName, relationship: "Mother", phone, createdById: ctx.userId } });
        await linkOnce(tx, ctx, student.id, mother.id, { relationship: "Mother", emergencyOrder: 2 });
      }
      return { id: student.id, created: true };
    },

    async undo(tx, ctx, ids) {
      await undoStudents(tx, ctx, ids);
    },

    // A row chosen as "same student: update" is put back the way the students-update import puts it back.
    revert: (tx, ctx, rows) => studentUpdateImport.revert!(tx, ctx, rows),
  };
}

/** Links a parent to a student once: a second link for the same pair is never made. */
async function linkOnce(tx: Tx, ctx: SchoolContext, studentId: string, guardianId: string, data: { relationship: string; emergencyOrder?: number | null; canPickUp?: boolean; restriction?: string | null }) {
  const has = await tx.studentGuardian.findUnique({ where: { studentId_guardianId: { studentId, guardianId } } });
  if (has) {
    if (has.archivedAt) await tx.studentGuardian.update({ where: { id: has.id }, data: { archivedAt: null } });
    return;
  }
  await tx.studentGuardian.create({ data: { schoolId: ctx.schoolId, studentId, guardianId, relationship: data.relationship, emergencyOrder: data.emergencyOrder ?? null, canPickUp: data.canPickUp ?? true, restriction: data.restriction ?? null } });
}

/**
 * Archives the students an import made, with their enrolments and links, and
 * parents left with no child. Refused as a whole once any of them has records
 * made in School OS since (a fee payment, attendance or marks), or old dues or
 * past receipts brought in by a later import (that import is undone first),
 * so real work is never archived with an import. The fee rows the class fee
 * plan gave them and nobody paid are taken off. Their admission numbers are
 * freed (releasedAt), so the corrected file can be brought in again.
 */
export async function undoStudents(tx: Tx, ctx: SchoolContext, ids: string[]) {
  const now = new Date();
  const [paid, marked, results, marks] = await Promise.all([
    tx.payment.findMany({ where: { studentId: { in: ids }, broughtIn: false, status: { in: ["POSTED", "WAITING"] } }, select: { studentId: true }, distinct: ["studentId"] }),
    tx.attendanceMark.findMany({ where: { studentId: { in: ids }, archivedAt: null }, select: { studentId: true }, distinct: ["studentId"] }),
    // "Joined after this exam" rows hold no marks, so they never count as work done (G23).
    tx.result.findMany({ where: { studentId: { in: ids }, leftOut: false }, select: { studentId: true }, distinct: ["studentId"] }),
    tx.marks.findMany({ where: { studentId: { in: ids } }, select: { studentId: true }, distinct: ["studentId"] }),
  ]);
  const used = [...new Set([...paid, ...marked, ...results, ...marks].map((r) => r.studentId!).filter(Boolean))];
  const names = async (list: string[]) => (await tx.student.findMany({ where: { id: { in: list.slice(0, 5) } }, select: { fullName: true } })).map((n) => n.fullName).join(", ") + (list.length > 5 ? " and others" : "");
  if (used.length) {
    throw new StudentProblem(`This import cannot be undone: ${used.length === 1 ? "1 of its students already has" : `${used.length} of its students already have`} fee payments, attendance or marks made in School OS (${await names(used)}). Correct or archive those students one by one instead.`);
  }
  // Old dues and past receipts are their own imports: undo them first, so their totals stay right.
  const [oldDues, receipts] = await Promise.all([
    tx.studentFeeDue.findMany({ where: { studentId: { in: ids }, broughtIn: true, state: { not: "REMOVED" } }, select: { studentId: true }, distinct: ["studentId"] }),
    tx.payment.findMany({ where: { studentId: { in: ids }, broughtIn: true, status: { not: "CANCELLED" } }, select: { studentId: true }, distinct: ["studentId"] }),
  ]);
  const brought = [...new Set([...oldDues, ...receipts].map((r) => r.studentId))];
  if (brought.length) {
    const what = oldDues.length && receipts.length ? "old dues and past receipts" : oldDues.length ? "old dues" : "past receipts";
    throw new StudentProblem(`This import cannot be undone yet: ${brought.length} of its ${plural(brought.length, "student has", "students have")} ${what} brought in (${await names(brought)}). Undo the ${what} ${plural(oldDues.length && receipts.length ? 2 : 1, "import", "imports")} first, then this one.`);
  }
  // Fee rows the class fee plan made and nobody paid go with the students.
  const unpaid = await tx.studentFeeDue.findMany({ where: { studentId: { in: ids }, broughtIn: false, state: "OPEN", paidPaise: 0 }, select: { id: true } });
  if (unpaid.length) await tx.studentFeeDue.updateMany({ where: { id: { in: unpaid.map((d) => d.id) } }, data: { state: "REMOVED", removedReason: "Import undone", removedById: ctx.userId, removedAt: now } });
  const freed: string[] = [];
  for (const id of ids) {
    const s = await tx.student.findUnique({ where: { id } });
    if (!s || s.archivedAt) continue;
    await tx.student.update({ where: { id }, data: { archivedAt: now, releasedAt: now } });
    freed.push(s.admissionNo);
    await tx.enrolment.updateMany({ where: { studentId: id, archivedAt: null }, data: { archivedAt: now } });
    const links = await tx.studentGuardian.findMany({ where: { studentId: id, archivedAt: null } });
    await tx.studentGuardian.updateMany({ where: { studentId: id, archivedAt: null }, data: { archivedAt: now } });
    for (const l of links) {
      const still = await tx.studentGuardian.count({ where: { guardianId: l.guardianId, archivedAt: null } });
      if (still === 0) await tx.guardian.update({ where: { id: l.guardianId }, data: { archivedAt: now } });
    }
  }
  await writeAudit(tx, ctx, { action: "archived", recordType: "Student", recordId: null, after: { reason: "Import undone", students: ids.length, admissionNumbersFreed: freed.slice(0, 50) } });
}

export function studentImport(kind: string, opts: ImportOptions) {
  if (kind === UDISE_IMPORT) return makeKind(UDISE_IMPORT, "UDISE+ students", UDISE_COLUMNS, opts);
  return makeKind(STUDENT_IMPORT, "Students", CSV_COLUMNS, opts);
}

// Registered so the import history can undo these imports and show their templates.
defineImport(studentImport(STUDENT_IMPORT, { sectionId: null, applyFeePlan: true }));
defineImport(studentImport(UDISE_IMPORT, { sectionId: null, applyFeePlan: true }));
