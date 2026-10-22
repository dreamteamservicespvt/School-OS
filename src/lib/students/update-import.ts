// Updating students already on record from a sheet (P10, "added, updated,
// skipped"): a school corrects phones, addresses or ID numbers in Excel and
// brings the changes back. Rows are found by admission number; an empty cell
// leaves the value as it is. The preview lists each change, and Undo puts the
// old values back unless someone has changed that value again since.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { defineImport, type ImportColumn, type ImportKind, type UpdatedRow } from "../importer";
import { writeAudit } from "../audit";
import { checkIndianMobile, formatDate } from "../format";
import { splitName } from "./students";
import { GENDERS } from "./labels";
import { parseDate } from "./parse-date";
import { campusLimitOf } from "../staff/campus-logins";

export const STUDENT_UPDATE_IMPORT = "students-update";

const COLUMNS: ImportColumn[] = [
  { key: "admissionNo", label: "Admission number", required: true, example: "A1024", help: "Finds the student. It is not changed.", aliases: ["admission no", "adm no"] },
  { key: "fullName", label: "Full name", example: "", help: "Empty cells leave the value as it is.", aliases: ["name", "student name"] },
  { key: "dateOfBirth", label: "Date of birth", example: "", help: "DD-MM-YYYY", aliases: ["dob", "birth date"] },
  { key: "gender", label: "Gender", example: "" },
  { key: "guardianName", label: "Father's or guardian's name", example: "", aliases: ["father name", "father's name", "guardian name", "parent name"] },
  { key: "guardianPhone", label: "Parent's phone", example: "9876543210", aliases: ["phone", "mobile", "parent phone", "father phone", "mobile number"] },
  { key: "address", label: "Address", example: "12-4, Ameerpet, Hyderabad" },
  { key: "bloodGroup", label: "Blood group", example: "" },
  { key: "category", label: "Category", example: "" },
  { key: "religion", label: "Religion", example: "" },
  { key: "motherTongue", label: "Mother tongue", example: "" },
  { key: "apaarId", label: "APAAR ID", example: "" },
  { key: "pen", label: "PEN", example: "" },
  { key: "previousSchool", label: "Previous school", example: "" },
];

/** Student fields this import may change, with the words used in the preview. */
const STUDENT_FIELDS = {
  fullName: "Name", dateOfBirth: "Date of birth", gender: "Gender", address: "Address", bloodGroup: "Blood group", category: "Category",
  religion: "Religion", motherTongue: "Mother tongue", apaarId: "APAAR ID", pen: "PEN", previousSchool: "Previous school",
} as const;
type StudentField = keyof typeof STUDENT_FIELDS;
const GUARDIAN_FIELDS = { name: "Parent's name", phone: "Parent's phone" } as const;
type GuardianField = keyof typeof GUARDIAN_FIELDS;

type Values = { student: Partial<Record<StudentField, string>>; guardian: Partial<Record<GuardianField, string>> };
export type StudentUpdate = {
  studentId: string;
  guardianId: string | null;
  before: Values;
  after: Values;
  /** What the preview shows: "Parent's phone: 98480 22222 → 97000 11111". */
  changes: { label: string; from: string; to: string }[];
};

const uncode = (v: string) => v.replace(/^\s*\d+\s*[-.)]\s*/, "").trim();
const CATEGORY_WORDS: Record<string, string> = { general: "General", gen: "General", obc: "OBC", sc: "SC", st: "ST", ews: "EWS" };
function genderOf(v: string) {
  const g = uncode(v).toLowerCase();
  if (["m", "male", "boy"].includes(g)) return "Male";
  if (["f", "female", "girl"].includes(g)) return "Female";
  if (["other", "transgender", "t"].includes(g)) return "Other";
  return null;
}
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const shown = (k: string, v: string) => (v === "" ? "empty" : k === "dateOfBirth" ? formatDate(new Date(`${v}T00:00:00Z`), "UTC") : v);

/** The student's main parent: the primary one, else the first in emergency order. */
async function mainGuardian(tx: Tx, studentId: string) {
  const link = await tx.studentGuardian.findFirst({
    where: { studentId, archivedAt: null, guardian: { archivedAt: null } },
    orderBy: [{ isPrimary: "desc" }, { emergencyOrder: "asc" }, { createdAt: "asc" }],
    include: { guardian: true },
  });
  return link?.guardian ?? null;
}

const kind: ImportKind<StudentUpdate> = {
  key: STUDENT_UPDATE_IMPORT,
  label: "Update students",
  columns: COLUMNS,
  async check(tx, ctx, row, seen) {
    const problems: string[] = [];
    const admissionNo = row.admissionNo.trim();
    const seenKey = `upd:${admissionNo.toLowerCase()}`;
    if (seen.has(seenKey)) return { ok: false, problems: [`Admission number ${admissionNo} appears twice in this file. Keep one row.`] };
    seen.add(seenKey);
    // One campus: only that campus's students can be updated.
    const limit = await campusLimitOf(tx, ctx);
    const s = await tx.student.findFirst({ where: { admissionNo: { equals: admissionNo, mode: "insensitive" }, archivedAt: null, ...(limit ? { campusId: limit } : {}) } });
    if (!s) return { ok: false, problems: [`No student has admission number ${admissionNo}. To add new students, use Students (CSV or Excel).`] };

    // The new values: only the cells that have something in them.
    const want: Values = { student: {}, guardian: {} };
    const name = row.fullName.replace(/\s+/g, " ").trim();
    if (name) want.student.fullName = name === name.toUpperCase() ? name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : name;
    if (row.dateOfBirth) {
      const dob = parseDate(row.dateOfBirth);
      if (!dob) problems.push(`Date of birth ${row.dateOfBirth} is not a real date. Write it as DD-MM-YYYY.`);
      else if (dob > new Date()) problems.push(`Date of birth ${row.dateOfBirth} is in the future.`);
      else want.student.dateOfBirth = iso(dob);
    }
    if (row.gender) {
      const g = genderOf(row.gender);
      if (!g) problems.push(`Gender "${row.gender}" is not one of ${GENDERS.join(", ")}.`);
      else want.student.gender = g;
    }
    if (row.category) {
      const c = uncode(row.category);
      want.student.category = CATEGORY_WORDS[c.toLowerCase()] ?? c;
    }
    if (row.religion) want.student.religion = uncode(row.religion);
    for (const k of ["address", "bloodGroup", "motherTongue", "apaarId", "pen", "previousSchool"] as const) {
      const v = row[k]?.replace(/\s+/g, " ").trim();
      if (v) want.student[k] = v;
    }
    if (row.guardianPhone) {
      const p = checkIndianMobile(row.guardianPhone);
      if (p) problems.push(`Parent's phone: ${p}`);
      else want.guardian.phone = row.guardianPhone.replace(/[^\d]/g, "").replace(/^91(?=\d{10}$)/, "");
    }
    if (row.guardianName?.trim()) want.guardian.name = row.guardianName.replace(/\s+/g, " ").trim();
    if (problems.length) return { ok: false, problems };

    // What differs from the record.
    const g = Object.keys(want.guardian).length ? await mainGuardian(tx, s.id) : null;
    if (Object.keys(want.guardian).length && !g) return { ok: false, problems: [`${s.fullName} has no parent on record to change. Add one on the student's profile.`] };
    const current: Record<StudentField, string> = {
      fullName: s.fullName, dateOfBirth: iso(s.dateOfBirth), gender: s.gender ?? "", address: s.address ?? "", bloodGroup: s.bloodGroup ?? "",
      category: s.category ?? "", religion: s.religion ?? "", motherTongue: s.motherTongue ?? "", apaarId: s.apaarId ?? "", pen: s.pen ?? "", previousSchool: s.previousSchool ?? "",
    };
    const out: StudentUpdate = { studentId: s.id, guardianId: g?.id ?? null, before: { student: {}, guardian: {} }, after: { student: {}, guardian: {} }, changes: [] };
    // A name written in other capitals is the same name, not a change.
    const same = (k: string, a: string, b: string) => (k === "fullName" || k === "name" ? a.toLowerCase().replace(/\s+/g, " ").trim() === b.toLowerCase() : a === b);
    for (const [k, v] of Object.entries(want.student) as [StudentField, string][]) {
      if (same(k, current[k], v)) continue;
      out.before.student[k] = current[k];
      out.after.student[k] = v;
      out.changes.push({ label: STUDENT_FIELDS[k], from: shown(k, current[k]), to: shown(k, v) });
    }
    if (g) {
      for (const [k, v] of Object.entries(want.guardian) as [GuardianField, string][]) {
        if (same(k, g[k], v)) continue;
        out.before.guardian[k] = g[k];
        out.after.guardian[k] = v;
        out.changes.push({ label: GUARDIAN_FIELDS[k], from: g[k], to: v });
      }
    }
    if (out.changes.length === 0) return { ok: false, problems: [`Nothing to change for ${s.fullName}: the record already has these values.`] };
    return { ok: true, value: out };
  },

  async save(tx, ctx, v) {
    await apply(tx, ctx, v.studentId, v.guardianId, v.after, v.before, "Changed by an import");
    return { id: v.studentId, created: false, before: { ...v.before, guardianId: v.guardianId }, after: { ...v.after, guardianId: v.guardianId } };
  },

  async undo() {
    // This import creates nothing; its changes are put back by revert.
  },

  async revert(tx, ctx, rows: UpdatedRow[]) {
    let putBack = 0;
    for (const r of rows) {
      const before = r.before as Values & { guardianId: string | null };
      const after = r.after as Values & { guardianId: string | null };
      const s = await tx.student.findUnique({ where: { id: r.id } });
      if (!s) continue;
      // Only values still as the import left them go back; a later change by a person stays.
      const now: Record<string, string> = { ...Object.fromEntries(Object.keys(STUDENT_FIELDS).map((k) => [k, k === "dateOfBirth" ? iso(s.dateOfBirth) : ((s as Record<string, unknown>)[k] as string | null) ?? ""])) };
      const back: Values = { student: {}, guardian: {} };
      const from: Values = { student: {}, guardian: {} };
      for (const [k, v] of Object.entries(after.student ?? {}) as [StudentField, string][]) {
        if (now[k] === v) { back.student[k] = before.student[k] ?? ""; from.student[k] = v; }
      }
      const g = after.guardianId ? await tx.guardian.findUnique({ where: { id: after.guardianId } }) : null;
      if (g) {
        for (const [k, v] of Object.entries(after.guardian ?? {}) as [GuardianField, string][]) {
          if (g[k] === v && before.guardian[k]) { back.guardian[k] = before.guardian[k]; from.guardian[k] = v; }
        }
      }
      if (!Object.keys(back.student).length && !Object.keys(back.guardian).length) continue;
      await apply(tx, ctx, r.id, after.guardianId, back, from, "Import undone");
      putBack++;
    }
    return putBack;
  },
};

/** Writes the values, with one audit entry for the student and one for the parent. */
async function apply(tx: Tx, ctx: SchoolContext, studentId: string, guardianId: string | null, to: Values, from: Values, reason: string) {
  const s = to.student;
  if (Object.keys(s).length) {
    const data: Prisma.StudentUpdateInput = { updatedById: ctx.userId };
    for (const [k, v] of Object.entries(s) as [StudentField, string][]) {
      if (k === "fullName") Object.assign(data, splitName(v));
      else if (k === "dateOfBirth") data.dateOfBirth = v ? new Date(`${v}T00:00:00Z`) : null;
      else (data as Record<string, unknown>)[k] = v === "" ? null : v;
    }
    await tx.student.update({ where: { id: studentId }, data });
    await writeAudit(tx, ctx, { action: "changed", recordType: "Student", recordId: studentId, before: from.student, after: { reason, ...s } });
  }
  if (guardianId && Object.keys(to.guardian).length) {
    await tx.guardian.update({ where: { id: guardianId }, data: { ...to.guardian, updatedById: ctx.userId } });
    await writeAudit(tx, ctx, { action: "changed", recordType: "Guardian", recordId: guardianId, before: from.guardian, after: { reason, ...to.guardian } });
  }
}

export const studentUpdateImport = kind;
defineImport(kind);
