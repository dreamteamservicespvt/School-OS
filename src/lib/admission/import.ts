// Import enquiries (02 §2, D7; workflow 15 "Switching to School OS"): open
// enquiries from the old software or a spreadsheet, through the one shared
// importer (P10). The duplicate check runs on every row: a child already on
// record (same phone or email, same child's name) is flagged, not added twice
// (02 Done when 12). A brother or sister (same phone, same parent, another
// child) is one enquiry per child, linked to the family's enquiry. A phone on
// record under another parent's name is never linked silently: the person
// says whether it is the same family. Each enquiry gets an owner and a
// follow-up. Imported by src/lib/import-registry.ts.
import "server-only";
import { nextEnquiryNo } from "./enquiries";

import type { SchoolContext, Tx } from "../db";
import { defineImport, type RowChoice } from "../importer";
import { writeAudit } from "../audit";
import { namesAlike } from "../students/name-match";
import { AdmissionProblem, checkMobile, todayIn, zonedToInstant } from "./act";
import { CLOSED_STATUSES, admissionYear, live, loadSettings } from "./settings";
import { defaultFollowUp, pickOwner } from "./enquiries";
import { personCampusId } from "../campus";

type Row = {
  childName: string; parentName: string; phone: string; email: string | null; classId: string | null;
  source: string; status: string; ownerStaffId: string | null; followUp: string | null; nextAction: string | null; notes: string | null;
  /** A brother or sister of an enquiry already in School OS, or of an earlier row (linked when saved). */
  sibling: boolean;
};

/** One family already on record with this phone or email: its parent names and children. */
type Known = { text: string; parents: string[]; children: string[]; enquiryId: string | null };

/**
 * The campus the importing person is limited to ("One campus" in Users &
 * Permissions), read from their School Access by the same rule as accessIn()
 * in src/lib/auth/access.ts (their widest scope counts); null for the whole
 * school. The shared importer passes no person, so it is read here, once per
 * transaction.
 */
const limits = new WeakMap<Tx, Promise<string | null>>();
export function importCampusLimit(tx: Tx, ctx: SchoolContext): Promise<string | null> {
  if (!ctx.userId) return Promise.resolve(null);
  const have = limits.get(tx);
  if (have) return have;
  const p = (async () => {
    const rows = await tx.schoolAccess.findMany({ where: { userLoginId: ctx.userId!, schoolId: ctx.schoolId, archivedAt: null }, select: { scope: true, campusId: true } });
    const ORDER = ["OWN", "CHOSEN_CLASSES", "CAMPUS", "WHOLE_SCHOOL"];
    const widest = rows.map((r) => r.scope).sort((x, y) => ORDER.indexOf(y) - ORDER.indexOf(x))[0];
    return widest === "CAMPUS" ? rows.find((r) => r.scope === "CAMPUS")?.campusId ?? null : null;
  })();
  limits.set(tx, p);
  return p;
}

/** Open enquiries, open applications and current parents with this phone or email, with their names (of one campus when limited). */
async function onRecord(tx: Tx, phone: string, email: string | null, campusId: string | null): Promise<Known[]> {
  const or = <T>(p: T, e: T) => [p, ...(email ? [e] : [])];
  const campus = campusId ? { campusId } : {};
  const [enquiries, applications, guardians] = await Promise.all([
    tx.enquiry.findMany({ where: { archivedAt: null, status: { notIn: [...CLOSED_STATUSES] }, ...campus, OR: or({ phone }, { email: { equals: email!, mode: "insensitive" as const } }) }, orderBy: { createdAt: "asc" }, take: 10 }),
    tx.application.findMany({ where: { archivedAt: null, stage: { notIn: ["REJECTED", "WITHDRAWN", "ADMITTED"] }, ...campus, OR: or({ phone }, { email: { equals: email!, mode: "insensitive" as const } }) }, take: 10 }),
    tx.guardian.findMany({
      where: { archivedAt: null, OR: or({ phone }, { email: { equals: email!, mode: "insensitive" as const } }) }, take: 5,
      include: { students: { where: { archivedAt: null, student: { archivedAt: null, status: { in: ["ACTIVE", "ADMITTED"] }, ...campus } }, include: { student: { select: { fullName: true } } } } },
    }),
  ]);
  return [
    ...enquiries.map((e) => ({ text: `an open enquiry for ${e.childName}, from ${e.parentName}`, parents: [e.parentName], children: [e.childName], enquiryId: e.id })),
    ...applications.map((a) => ({ text: `application ${a.applicationNo} for ${a.fullName}`, parents: [a.fatherName, a.motherName, a.guardianName].filter((x): x is string => Boolean(x)), children: [a.fullName], enquiryId: a.enquiryId })),
    ...guardians.filter((g) => g.students.length).map((g) => ({ text: `${g.name}, parent of ${g.students.map((s) => s.student.fullName).join(" and ")}`, parents: [g.name], children: g.students.map((s) => s.student.fullName), enquiryId: null })),
  ];
}

/** Rows of this file already seen with a phone: "f:<phone>" then line, child and parent. */
const fileKey = (phone: string) => `f:${phone}:`;

/** A date typed as DD-MM-YYYY, DD/MM/YYYY or YYYY-MM-DD, as YYYY-MM-DD; null when it is not a real date. */
export function importDate(v: string): string | null {
  const t = v.trim();
  let y: number, m: number, d: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (r) [y, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(t))) [y, m, d] = [+r[3], +r[2], +r[1]];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

defineImport<Row>({
  key: "admission-enquiries",
  label: "Admission enquiries",
  columns: [
    { key: "childName", label: "Child's name", required: true, example: "Aarav Sharma", aliases: ["child name", "student name", "name"] },
    { key: "parentName", label: "Parent's name", required: true, example: "Rohit Sharma", aliases: ["parent name", "father name", "guardian name"] },
    { key: "phone", label: "Phone", required: true, example: "9876543210", aliases: ["mobile", "phone number", "contact"] },
    { key: "email", label: "Email", example: "rohit@example.com" },
    { key: "className", label: "Class wanted", example: "Class 1", aliases: ["class", "class wanted"] },
    { key: "source", label: "Source", example: "Walk-in", help: "One of the sources in Admission Settings", aliases: ["heard from", "lead source"] },
    { key: "status", label: "Status", example: "Contacted", help: "One of the open statuses in Admission Settings" },
    { key: "owner", label: "Owner", example: "", help: "Staff member's full name; left empty, the rule in Admission Settings picks one", aliases: ["assigned to", "counsellor"] },
    { key: "followUp", label: "Next follow-up", example: "15-10-2026", help: "DD-MM-YYYY; left empty, the next working day", aliases: ["follow up", "follow-up date"] },
    { key: "nextAction", label: "Next action", example: "Call to fix a school visit" },
    { key: "notes", label: "Notes", example: "Interested in the science stream later" },
  ],
  async check(tx, ctx, row, seen, place) {
    const s = await loadSettings(tx, ctx);
    const limit = await importCampusLimit(tx, ctx);
    const problems: string[] = [];
    const choices: RowChoice[] = [];
    let phone = "";
    try {
      phone = checkMobile(row.phone, "phone");
    } catch (e) {
      problems.push(e instanceof AdmissionProblem ? e.message : "Phone does not look right.");
    }
    const email = row.email.trim().toLowerCase() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push("Email does not look right.");
    const child = row.childName.trim();
    const parent = row.parentName.trim();
    let sibling = false;
    let remember: string | null = null;
    if (phone && child && parent) {
      const chose = place?.decision;
      // Earlier rows of this file with the same phone.
      const earlier = [...seen].filter((k) => k.startsWith(fileKey(phone))).map((k) => JSON.parse(k.slice(fileKey(phone).length)) as { line: number; child: string; parent: string });
      const sameChildRow = earlier.find((r) => namesAlike(r.child, child));
      const known = await onRecord(tx, phone, email, limit);
      const sameChild = known.find((k) => k.children.some((c) => namesAlike(c, child)));
      if (sameChildRow) problems.push(`Row ${sameChildRow.line} has the same child (${sameChildRow.child}) with this phone. Keep one row.`);
      else if (sameChild) problems.push(`Already in School OS: ${sameChild.text}. Not added twice.`);
      else if (earlier.length || known.length) {
        // A brother or sister: the same family when a parent's name matches (close spellings allowed).
        const family = earlier.some((r) => namesAlike(r.parent, parent)) || known.some((k) => k.parents.some((n) => namesAlike(n, parent)));
        if (family || chose === "sibling") sibling = true;
        else if (chose !== "other-family") {
          const who = [...known.map((k) => k.text), ...earlier.map((r) => `row ${r.line} (${r.child}, from ${r.parent})`)].slice(0, 3).join("; ");
          problems.push(`This phone is already on record for ${who}, not ${parent}. Say whether this is the same family.`);
          choices.push({ value: "sibling", label: `Same family: add ${child} as a brother or sister` }, { value: "other-family", label: `A different family: add ${child} from ${parent} as its own enquiry` });
        }
      }
      // Remembered for the rows after it only when this row will be imported.
      remember = `${fileKey(phone)}${JSON.stringify({ line: place?.line ?? 0, child, parent })}`;
    }
    let classId: string | null = null;
    if (row.className) {
      // Only the person's campus's classes when limited to one; else the class of their own campus first.
      const classes = await tx.schoolClass.findMany({ where: { archivedAt: null, ...(limit ? { campusId: limit } : {}) }, select: { id: true, name: true, campusId: true } });
      const found = classes.filter((x) => same(x.name, row.className) || same(x.name, `Class ${row.className}`));
      const own = found.length > 1 ? await personCampusId(tx, ctx, { campusId: limit }) : null;
      const c = found.find((x) => x.campusId === own) ?? found[0];
      if (!c) problems.push(limit ? `Class "${row.className}" is not a class of your campus.` : `Class "${row.className}" is not a class of this school.`);
      classId = c?.id ?? null;
    }
    const sources = live(s.sourceList);
    let source = sources.find((x) => x.key === "other")?.key ?? sources[0]?.key ?? "other";
    if (row.source) {
      const f = sources.find((x) => same(x.label, row.source) || same(x.key, row.source));
      if (!f) problems.push(`Source "${row.source}" is not in Admission Settings. Use one of: ${sources.map((x) => x.label).join(", ")}.`);
      else source = f.key;
    }
    const open = live(s.statusList).filter((x) => !CLOSED_STATUSES.includes(x.key));
    let status = "new";
    if (row.status) {
      const f = open.find((x) => same(x.label, row.status) || same(x.key, row.status));
      if (!f) problems.push(`Status "${row.status}" is not an open status. Only open enquiries are imported; use one of: ${open.map((x) => x.label).join(", ")}.`);
      else status = f.key;
    }
    let ownerStaffId: string | null = null;
    if (row.owner) {
      const staff = await tx.staff.findMany({ where: { archivedAt: null, fullName: { equals: row.owner.trim(), mode: "insensitive" }, ...(limit ? { campusId: limit } : {}) }, select: { id: true } });
      if (staff.length === 0) problems.push(`No staff member is called "${row.owner}".`);
      else if (staff.length > 1) problems.push(`More than one staff member is called "${row.owner}". Leave Owner empty and reassign after the import.`);
      else ownerStaffId = staff[0].id;
    }
    const followUp = row.followUp ? importDate(row.followUp) : null;
    if (row.followUp && !followUp) problems.push("Next follow-up is not a date like 15-10-2026.");
    if (row.childName.length > 120 || row.parentName.length > 120) problems.push("Names can be at most 120 letters.");
    if (problems.length) return { ok: false, problems, ...(choices.length ? { choices } : {}) };
    if (remember) seen.add(remember);
    return {
      ok: true,
      value: { childName: child, parentName: parent, phone, email, classId, source, status, ownerStaffId, followUp, nextAction: row.nextAction.trim().slice(0, 200) || null, notes: row.notes.trim().slice(0, 2000) || null, sibling },
    };
  },
  async save(tx: Tx, ctx: SchoolContext, v: Row) {
    const s = await loadSettings(tx, ctx);
    const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { timeZone: true } });
    // The enquiry is for the campus of the class wanted, else the person's own campus, in that campus's admission year.
    const limit = await importCampusLimit(tx, ctx);
    const cls = v.classId ? await tx.schoolClass.findFirst({ where: { id: v.classId }, select: { campusId: true } }) : null;
    const campusId = cls?.campusId ?? (await personCampusId(tx, ctx, { campusId: limit }));
    if (!campusId) throw new AdmissionProblem("Add a campus before importing enquiries.");
    if (limit && campusId !== limit) throw new AdmissionProblem("You can import enquiries only for your own campus.");
    const year = await admissionYear(tx, ctx, s, campusId);
    if (!year) throw new AdmissionProblem("Set up an academic year before importing enquiries.");
    const me = ctx.userId ? await tx.staff.findFirst({ where: { userLoginId: ctx.userId, archivedAt: null }, select: { id: true } }) : null;
    const owner = v.ownerStaffId ?? (await pickOwner(tx, ctx, s, { classId: v.classId, adderStaffId: me?.id ?? null, today: todayIn(school.timeZone) }));
    const nextFollowUpAt = v.followUp ? zonedToInstant(`${v.followUp}T11:00`, school.timeZone) : await defaultFollowUp(tx, school.timeZone);
    // A brother or sister: linked to the family's first open enquiry (in School OS, or saved from an earlier row),
    // found by the parent's name, so another family with the same phone is never linked.
    const fam = v.sibling ? await tx.enquiry.findMany({ where: { phone: v.phone, archivedAt: null, status: { notIn: [...CLOSED_STATUSES] }, ...(limit ? { campusId: limit } : {}) }, orderBy: [{ createdAt: "asc" }, { enquiryNo: "asc" }], select: { id: true, childName: true, parentName: true, siblingOfId: true } }) : [];
    const mine = fam.find((x) => namesAlike(x.parentName, v.parentName)) ?? fam[0] ?? null;
    const first = mine?.siblingOfId ? fam.find((x) => x.id === mine.siblingOfId) ?? mine : mine;
    const e = await tx.enquiry.create({
      data: {
        enquiryNo: await nextEnquiryNo(tx, ctx),
        schoolId: ctx.schoolId, campusId, academicYearId: year.id,
        childName: v.childName, parentName: v.parentName, phone: v.phone, email: v.email, classId: v.classId,
        source: v.source, firstSource: v.source, status: v.status, ownerStaffId: owner, nextFollowUpAt, nextAction: v.nextAction, notes: v.notes,
        siblingOfId: first?.id ?? null, createdById: ctx.userId, updatedById: ctx.userId,
      },
    });
    await tx.enquiryActivity.create({ data: { schoolId: ctx.schoolId, enquiryId: e.id, kind: "created", text: `Enquiry imported from a spreadsheet.${first ? ` Brother or sister of ${first.childName}.` : ""}`, byId: ctx.userId } });
    if (v.notes) await tx.enquiryActivity.create({ data: { schoolId: ctx.schoolId, enquiryId: e.id, kind: "note", text: v.notes, byId: ctx.userId } });
    await writeAudit(tx, ctx, { action: "imported", recordType: "Enquiry", recordId: e.id, after: { childName: e.childName, phone: e.phone, status: e.status, owner, siblingOfId: e.siblingOfId } });
    return { id: e.id, created: true };
  },
  async undo(tx, ctx, ids) {
    const now = new Date();
    for (const id of ids) {
      const e = await tx.enquiry.findFirst({ where: { id, archivedAt: null } });
      if (!e) continue;
      await tx.enquiry.update({ where: { id }, data: { archivedAt: now, updatedById: ctx.userId } });
      await writeAudit(tx, ctx, { action: "archived", recordType: "Enquiry", recordId: id, before: { status: e.status }, after: { reason: "Import undone" } });
    }
  },
});
