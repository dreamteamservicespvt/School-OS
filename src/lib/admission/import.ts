// Import enquiries (02 §2, D7; workflow 15 "Switching to School OS"): open
// enquiries from the old software or a spreadsheet, through the one shared
// importer (P10). The duplicate check runs on every row; rows matching an
// existing phone are flagged, not added twice (02 Done when 12). Each
// enquiry gets an owner and a follow-up. Imported by src/lib/import-registry.ts.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { defineImport } from "../importer";
import { writeAudit } from "../audit";
import { AdmissionProblem, checkMobile, todayIn, zonedToInstant } from "./act";
import { CLOSED_STATUSES, admissionYear, live, loadSettings } from "./settings";
import { defaultFollowUp, findDuplicates, pickOwner } from "./enquiries";

type Row = {
  childName: string; parentName: string; phone: string; email: string | null; classId: string | null;
  source: string; status: string; ownerStaffId: string | null; followUp: string | null; nextAction: string | null; notes: string | null;
};

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
  async check(tx, ctx, row, seen) {
    const s = await loadSettings(tx, ctx);
    const problems: string[] = [];
    let phone = "";
    try {
      phone = checkMobile(row.phone, "phone");
    } catch (e) {
      problems.push(e instanceof AdmissionProblem ? e.message : "Phone does not look right.");
    }
    const email = row.email.trim().toLowerCase() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push("Email does not look right.");
    if (phone) {
      if (seen.has(`p:${phone}`)) problems.push("This phone is on another row of the file.");
      else {
        seen.add(`p:${phone}`);
        const matches = await findDuplicates(tx, { phone, email });
        if (matches.length) problems.push(`Already in School OS: ${matches[0].text}. Not added twice.`);
      }
    }
    let classId: string | null = null;
    if (row.className) {
      const classes = await tx.schoolClass.findMany({ where: { archivedAt: null }, select: { id: true, name: true } });
      const c = classes.find((x) => same(x.name, row.className) || same(x.name, `Class ${row.className}`));
      if (!c) problems.push(`Class "${row.className}" is not a class of this school.`);
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
      const staff = await tx.staff.findMany({ where: { archivedAt: null, fullName: { equals: row.owner.trim(), mode: "insensitive" } }, select: { id: true } });
      if (staff.length === 0) problems.push(`No staff member is called "${row.owner}".`);
      else if (staff.length > 1) problems.push(`More than one staff member is called "${row.owner}". Leave Owner empty and reassign after the import.`);
      else ownerStaffId = staff[0].id;
    }
    const followUp = row.followUp ? importDate(row.followUp) : null;
    if (row.followUp && !followUp) problems.push("Next follow-up is not a date like 15-10-2026.");
    if (row.childName.length > 120 || row.parentName.length > 120) problems.push("Names can be at most 120 letters.");
    if (problems.length) return { ok: false, problems };
    return {
      ok: true,
      value: { childName: row.childName.trim(), parentName: row.parentName.trim(), phone, email, classId, source, status, ownerStaffId, followUp, nextAction: row.nextAction.trim().slice(0, 200) || null, notes: row.notes.trim().slice(0, 2000) || null },
    };
  },
  async save(tx: Tx, ctx: SchoolContext, v: Row) {
    const s = await loadSettings(tx, ctx);
    const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { timeZone: true } });
    const year = await admissionYear(tx, ctx, s);
    if (!year) throw new AdmissionProblem("Set up an academic year before importing enquiries.");
    const campus = await tx.campus.findFirst({ where: { archivedAt: null }, orderBy: [{ isMain: "desc" }, { createdAt: "asc" }], select: { id: true } });
    if (!campus) throw new AdmissionProblem("Add a campus before importing enquiries.");
    const me = ctx.userId ? await tx.staff.findFirst({ where: { userLoginId: ctx.userId, archivedAt: null }, select: { id: true } }) : null;
    const owner = v.ownerStaffId ?? (await pickOwner(tx, ctx, s, { classId: v.classId, adderStaffId: me?.id ?? null, today: todayIn(school.timeZone) }));
    const nextFollowUpAt = v.followUp ? zonedToInstant(`${v.followUp}T11:00`, school.timeZone) : await defaultFollowUp(tx, school.timeZone);
    const e = await tx.enquiry.create({
      data: {
        schoolId: ctx.schoolId, campusId: campus.id, academicYearId: year.id,
        childName: v.childName, parentName: v.parentName, phone: v.phone, email: v.email, classId: v.classId,
        source: v.source, firstSource: v.source, status: v.status, ownerStaffId: owner, nextFollowUpAt, nextAction: v.nextAction, notes: v.notes,
        createdById: ctx.userId, updatedById: ctx.userId,
      },
    });
    await tx.enquiryActivity.create({ data: { schoolId: ctx.schoolId, enquiryId: e.id, kind: "created", text: "Enquiry imported from a spreadsheet.", byId: ctx.userId } });
    if (v.notes) await tx.enquiryActivity.create({ data: { schoolId: ctx.schoolId, enquiryId: e.id, kind: "note", text: v.notes, byId: ctx.userId } });
    await writeAudit(tx, ctx, { action: "imported", recordType: "Enquiry", recordId: e.id, after: { childName: e.childName, phone: e.phone, status: e.status, owner } });
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
