// Student imports through the shared importer (P10): the CSV import and the
// UDISE+ import. Good rows import while bad rows are listed with their
// problems in plain words; the whole import can be undone from its history.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { defineImport, type ImportColumn, type ImportKind, type RowResult } from "../importer";
import { writeAudit } from "../audit";
import { currentYear } from "../academic/years";
import { checkIndianMobile } from "../format";
import { createStudent, admissionNoTaken, findDuplicates, seatsLeft, StudentProblem, DuplicateFound } from "./students";
import { GENDERS } from "./labels";

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

type Value = {
  fullName: string; sectionId: string; dateOfBirth: Date; gender: string; guardianName: string; guardianRelation: string; guardianPhone: string;
  motherName: string | null; motherPhone: string | null; admissionNo: string | null; rollNo: number | null; admissionDate: Date;
  bloodGroup: string | null; category: string | null; religion: string | null; motherTongue: string | null; address: string | null;
  aadhaar: string | null; apaarId: string | null; pen: string | null; previousSchool: string | null; siblingId: string | null;
};

/** DD-MM-YYYY, DD/MM/YYYY or YYYY-MM-DD; null when it is not a real date. */
export function parseDate(text: string): Date | null {
  const t = text.trim();
  let y: number, m: number, d: number;
  let match = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (match) { d = +match[1]; m = +match[2]; y = +match[3]; }
  else if ((match = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) { y = +match[1]; m = +match[2]; d = +match[3]; }
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

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

function makeKind(key: string, label: string, columns: ImportColumn[], opts: ImportOptions): ImportKind<Value> {
  // Class lookups are remembered for one check of one file only (`seen` is new
  // each time), so a class added since, or another school, never gets a stale answer.
  const caches = new WeakMap<Set<string>, Map<string, string | null>>();
  return {
    key,
    label,
    columns,
    async check(tx, ctx, row, seen): Promise<RowResult<Value>> {
      const problems: string[] = [];
      const fullName = row.fullName.replace(/\s+/g, " ").trim();
      const titleName = fullName === fullName.toUpperCase() ? fullName.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : fullName;
      const dob = parseDate(row.dateOfBirth);
      if (!dob) { if (row.dateOfBirth) problems.push(`Date of birth ${row.dateOfBirth} is not a real date. Write it as DD-MM-YYYY.`); }
      else if (dob > new Date()) problems.push(`Date of birth ${row.dateOfBirth} is in the future.`);
      const gender = genderOf(row.gender);
      if (!gender && row.gender) problems.push(`Gender "${row.gender}" is not one of ${GENDERS.join(", ")}.`);
      const phoneProblem = row.guardianPhone ? checkIndianMobile(row.guardianPhone) : null;
      if (phoneProblem) problems.push(`Parent's phone: ${phoneProblem}`);
      const phone = row.guardianPhone.replace(/[^\d]/g, "").replace(/^91(?=\d{10}$)/, "");
      const motherPhone = row.motherPhone ? row.motherPhone.replace(/[^\d]/g, "").replace(/^91(?=\d{10}$)/, "") : null;
      if (motherPhone && checkIndianMobile(motherPhone)) problems.push(`Mother's phone: ${checkIndianMobile(motherPhone)}`);
      const admissionDate = row.admissionDate ? parseDate(row.admissionDate) : new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
      if (!admissionDate) problems.push(`Admission date ${row.admissionDate} is not a real date.`);
      const rollNo = row.rollNo ? Number(row.rollNo) : null;
      if (row.rollNo && (!Number.isInteger(rollNo) || rollNo! < 1)) problems.push(`Roll number ${row.rollNo} must be a whole number.`);

      // Class and section: the row's own, or the one chosen on the screen.
      let sectionId = opts.sectionId;
      if (row.className) {
        let sectionCache = caches.get(seen);
        if (!sectionCache) caches.set(seen, (sectionCache = new Map()));
        const k = `${ctx.schoolId}|${row.className}|${row.sectionName}`;
        if (!sectionCache.has(k)) {
          const year = await currentYear(tx, ctx);
          const cls = row.className.trim();
          const names = [cls, `Class ${cls}`, cls.replace(/^class\s*/i, "Class ")];
          const sec = year ? await tx.section.findFirst({
            where: { academicYearId: year.id, archivedAt: null, name: { equals: (row.sectionName || "A").trim(), mode: "insensitive" }, schoolClass: { name: { in: names, mode: "insensitive" } } },
          }) : null;
          sectionCache.set(k, sec?.id ?? null);
        }
        sectionId = sectionCache.get(k) ?? null;
        if (!sectionId) problems.push(`Class ${row.className} ${row.sectionName || "A"} is not set up this year. Add it in Academic Management or fix the class.`);
      }
      if (!sectionId && !row.className) problems.push("Class is empty. Choose a class on the screen or fill the Class column.");

      if (sectionId) {
        const key = `seat:${sectionId}`;
        let used = 0;
        while (seen.has(`${key}:${used}`)) used++;
        if ((await seatsLeft(tx, sectionId)) - used <= 0) problems.push("The section is full. Add seats in Academic Management or choose another section.");
        else seen.add(`${key}:${used}`);
      }

      const admissionNo = row.admissionNo?.trim() || null;
      if (admissionNo) {
        const taken = await admissionNoTaken(tx, admissionNo);
        if (taken) problems.push(taken);
        if (seen.has(`adm:${admissionNo.toLowerCase()}`)) problems.push(`Admission number ${admissionNo} appears twice in this file.`);
        seen.add(`adm:${admissionNo.toLowerCase()}`);
      }
      if (dob) {
        const k = `dup:${titleName.toLowerCase()}|${dob.toISOString().slice(0, 10)}`;
        if (seen.has(k)) problems.push(`${titleName} with this date of birth appears twice in this file.`);
        seen.add(k);
        const dups = await findDuplicates(tx, { fullName: titleName, dateOfBirth: dob, guardianPhone: phone });
        if (dups.length) problems.push(`May already be on record: ${dups[0].fullName}, ${dups[0].admissionNo} (${dups[0].why}). Add this student on the Add student screen with a reason if they are different children.`);
      }
      let siblingId: string | null = null;
      if (row.siblingAdmissionNo) {
        const sib = await tx.student.findFirst({ where: { admissionNo: { equals: row.siblingAdmissionNo.trim(), mode: "insensitive" }, archivedAt: null } });
        if (!sib) problems.push(`Sibling admission number ${row.siblingAdmissionNo} was not found.`);
        siblingId = sib?.id ?? null;
      }
      const aadhaar = row.aadhaar?.replace(/\s+/g, "") || null;
      if (aadhaar && !/^\d{12}$/.test(aadhaar)) problems.push("Aadhaar number must have 12 digits.");
      if (problems.length) return { ok: false, problems };
      const cat = row.category ? uncode(row.category) : null;
      return {
        ok: true,
        value: {
          fullName: titleName, sectionId: sectionId!, dateOfBirth: dob!, gender: gender!, guardianName: row.guardianName.trim(),
          guardianRelation: row.guardianRelation?.trim() || "Father", guardianPhone: phone, motherName: row.motherName?.trim() || null,
          motherPhone, admissionNo, rollNo, admissionDate: admissionDate!, bloodGroup: row.bloodGroup?.trim() || null,
          category: cat ? CATEGORY_WORDS[cat.toLowerCase()] ?? cat : null, religion: row.religion ? uncode(row.religion) : null,
          motherTongue: row.motherTongue?.trim() || null, address: row.address?.trim() || null, aadhaar,
          apaarId: row.apaarId?.trim() || null, pen: row.pen?.trim() || null, previousSchool: row.previousSchool?.trim() || null, siblingId,
        },
      };
    },
    async save(tx, ctx, v) {
      // Brothers and sisters share the parent record: the sibling's, or the parent already on record with this phone ("Done when" 3).
      let linkGuardianId: string | null = null;
      if (v.siblingId) {
        linkGuardianId = (await tx.studentGuardian.findFirst({ where: { studentId: v.siblingId, isPrimary: true, archivedAt: null } }))?.guardianId ?? null;
      }
      linkGuardianId ??= (await tx.guardian.findFirst({ where: { phone: v.guardianPhone, archivedAt: null }, orderBy: { createdAt: "asc" } }))?.id ?? null;
      let created;
      try {
        created = await createStudent(tx, ctx, {
          ...v, linkGuardianId, applyFeePlan: opts.applyFeePlan, how: "imported",
          duplicateReason: "Checked in the import preview",
        });
      } catch (e) {
        if (e instanceof DuplicateFound || e instanceof StudentProblem) throw new Error(`${v.fullName}: ${e.message}`);
        throw e;
      }
      const { student } = created;
      if (v.apaarId || v.pen) await tx.student.update({ where: { id: student.id }, data: { apaarId: v.apaarId, pen: v.pen } });
      // The sibling's other parents are linked too.
      if (v.siblingId) {
        const others = await tx.studentGuardian.findMany({ where: { studentId: v.siblingId, archivedAt: null, guardianId: { not: linkGuardianId ?? undefined } } });
        for (const o of others) {
          await tx.studentGuardian.create({ data: { schoolId: ctx.schoolId, studentId: student.id, guardianId: o.guardianId, relationship: o.relationship, emergencyOrder: o.emergencyOrder, canPickUp: o.canPickUp, restriction: o.restriction } });
        }
      } else if (v.motherName) {
        const existing = v.motherPhone ? await tx.guardian.findFirst({ where: { phone: v.motherPhone, archivedAt: null } }) : null;
        const mother = existing ?? await tx.guardian.create({ data: { schoolId: ctx.schoolId, name: v.motherName, relationship: "Mother", phone: v.motherPhone ?? v.guardianPhone, createdById: ctx.userId } });
        await tx.studentGuardian.create({ data: { schoolId: ctx.schoolId, studentId: student.id, guardianId: mother.id, relationship: "Mother", emergencyOrder: 2 } });
      }
      return { id: student.id, created: true };
    },
    async undo(tx, ctx, ids) {
      await undoStudents(tx, ctx, ids);
    },
  };
}

/** Archives the students an import made, with their enrolments and links, and parents left with no child. */
export async function undoStudents(tx: Tx, ctx: SchoolContext, ids: string[]) {
  const now = new Date();
  for (const id of ids) {
    const s = await tx.student.findUnique({ where: { id } });
    if (!s || s.archivedAt) continue;
    await tx.student.update({ where: { id }, data: { archivedAt: now } });
    await tx.enrolment.updateMany({ where: { studentId: id, archivedAt: null }, data: { archivedAt: now } });
    const links = await tx.studentGuardian.findMany({ where: { studentId: id, archivedAt: null } });
    await tx.studentGuardian.updateMany({ where: { studentId: id, archivedAt: null }, data: { archivedAt: now } });
    for (const l of links) {
      const still = await tx.studentGuardian.count({ where: { guardianId: l.guardianId, archivedAt: null } });
      if (still === 0) await tx.guardian.update({ where: { id: l.guardianId }, data: { archivedAt: now } });
    }
  }
  await writeAudit(tx, ctx, { action: "archived", recordType: "Student", recordId: null, after: { reason: "Import undone", students: ids.length } });
}

export function studentImport(kind: string, opts: ImportOptions) {
  if (kind === UDISE_IMPORT) return makeKind(UDISE_IMPORT, "UDISE+ students", UDISE_COLUMNS, opts);
  return makeKind(STUDENT_IMPORT, "Students", CSV_COLUMNS, opts);
}

// Registered so the import history can undo these imports and show their templates.
defineImport(studentImport(STUDENT_IMPORT, { sectionId: null, applyFeePlan: true }));
defineImport(studentImport(UDISE_IMPORT, { sectionId: null, applyFeePlan: true }));
