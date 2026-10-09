// Bulk changes on the Student List (03 §2, P11): a field for many students
// with a before-and-after preview and Undo from the history; section changes;
// profile photos matched by admission number, with clashes listed first.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { currentYear, assertYearOpen } from "../academic/years";
import { checkIndianMobile } from "../format";
import { saveFile, IMAGE_TYPES } from "../files";
import { admissionNoTaken, changeSection, StudentProblem } from "./students";
import { BULK_FIELDS, BLOOD_GROUPS } from "./labels";

export type BulkRow = { studentId: string; fullName: string; admissionNo: string; before: string | null; after: string | null; problem: string | null };

/** Reads the current value of a bulk field for one student. */
async function readField(tx: Tx, field: string, studentId: string, yearId: string | null): Promise<string | null> {
  if (field === "rollNo") {
    const e = yearId ? await tx.enrolment.findFirst({ where: { studentId, academicYearId: yearId, archivedAt: null } }) : null;
    return e?.rollNo != null ? String(e.rollNo) : null;
  }
  if (field === "phone") {
    const link = await tx.studentGuardian.findFirst({ where: { studentId, isPrimary: true, archivedAt: null }, include: { guardian: true } });
    return link?.guardian.phone ?? null;
  }
  const s = await tx.student.findUniqueOrThrow({ where: { id: studentId } });
  const v = (s as Record<string, unknown>)[field];
  return v === null || v === undefined ? null : String(v);
}

function normalise(field: string, raw: string): { value: string | null; problem: string | null } {
  const v = raw.trim();
  if (v === "") return field === "admissionNo" || field === "phone" || field === "rollNo" ? { value: null, problem: "A value is needed." } : { value: null, problem: null };
  if (field === "rollNo") return /^\d{1,4}$/.test(v) && Number(v) > 0 ? { value: String(Number(v)), problem: null } : { value: v, problem: `${v} is not a whole number.` };
  if (field === "phone") {
    const p = checkIndianMobile(v);
    return p ? { value: v, problem: p } : { value: v.replace(/[^\d]/g, "").replace(/^91(?=\d{10}$)/, ""), problem: null };
  }
  if (field === "bloodGroup") return (BLOOD_GROUPS as readonly string[]).includes(v.toUpperCase()) ? { value: v.toUpperCase(), problem: null } : { value: v, problem: `${v} is not a blood group like B+.` };
  if (field === "apaarId") return /^\d{12}$/.test(v) ? { value: v, problem: null } : { value: v, problem: "APAAR ID has 12 digits." };
  if (field === "pen") return /^\d{11}$/.test(v) ? { value: v, problem: null } : { value: v, problem: "PEN has 11 digits." };
  return { value: v.slice(0, 300), problem: null };
}

/** Step 1: the before-and-after preview. Nothing is saved. */
export async function previewBulkUpdate(tx: Tx, ctx: SchoolContext, field: string, values: { studentId: string; value: string }[]): Promise<BulkRow[]> {
  if (!BULK_FIELDS.some((f) => f.key === field)) throw new StudentProblem("Choose a field to update.", "field");
  const year = await currentYear(tx, ctx);
  const rows: BulkRow[] = [];
  const seen = new Map<string, string>();
  for (const { studentId, value } of values) {
    const s = await tx.student.findFirst({ where: { id: studentId, archivedAt: null } });
    if (!s) continue;
    const before = await readField(tx, field, studentId, year?.id ?? null);
    const n = normalise(field, value);
    let problem = n.problem;
    if (!problem && field === "admissionNo" && n.value) {
      problem = await admissionNoTaken(tx, n.value, studentId);
      const other = seen.get(`adm:${n.value.toLowerCase()}`);
      if (!problem && other) problem = `The same number is given to ${other}.`;
      seen.set(`adm:${n.value.toLowerCase()}`, s.fullName);
    }
    if (!problem && field === "rollNo" && n.value && year) {
      const enr = await tx.enrolment.findFirst({ where: { studentId, academicYearId: year.id, archivedAt: null } });
      if (!enr) problem = "No class this year.";
      else {
        const key = `roll:${enr.sectionId}:${n.value}`;
        if (seen.has(key)) problem = `Roll number ${n.value} is also given to ${seen.get(key)}.`;
        seen.set(key, s.fullName);
      }
    }
    rows.push({ studentId, fullName: s.fullName, admissionNo: s.admissionNo, before, after: n.value, problem });
  }
  // Roll numbers must not clash with students left as they are.
  if (field === "rollNo" && year) {
    const changing = new Set(rows.map((r) => r.studentId));
    for (const r of rows.filter((x) => !x.problem && x.after)) {
      const enr = await tx.enrolment.findFirst({ where: { studentId: r.studentId, academicYearId: year.id, archivedAt: null } });
      const clash = enr && (await tx.enrolment.findFirst({ where: { sectionId: enr.sectionId, academicYearId: year.id, rollNo: Number(r.after), archivedAt: null, studentId: { notIn: [...changing] } }, include: { student: true } }));
      if (clash) r.problem = `Roll number ${r.after} already belongs to ${clash.student.fullName}.`;
    }
  }
  return rows;
}

async function writeField(tx: Tx, ctx: SchoolContext, field: string, studentId: string, value: string | null, yearId: string | null) {
  if (field === "rollNo") {
    if (!yearId) return;
    await tx.enrolment.updateMany({ where: { studentId, academicYearId: yearId, archivedAt: null }, data: { rollNo: value ? Number(value) : null } });
    return;
  }
  if (field === "phone") {
    const link = await tx.studentGuardian.findFirst({ where: { studentId, isPrimary: true, archivedAt: null } });
    if (link && value) await tx.guardian.update({ where: { id: link.guardianId }, data: { phone: value, updatedById: ctx.userId } });
    return;
  }
  await tx.student.update({ where: { id: studentId }, data: { [field]: value, updatedById: ctx.userId } as Prisma.StudentUpdateInput });
}

/** Step 2: saves the rows without problems; keeps every before value for Undo. */
export async function applyBulkUpdate(tx: Tx, ctx: SchoolContext, field: string, values: { studentId: string; value: string }[]) {
  const rows = await previewBulkUpdate(tx, ctx, field, values);
  const good = rows.filter((r) => !r.problem && r.before !== r.after);
  const year = await currentYear(tx, ctx);
  if (field === "rollNo" && year) {
    await assertYearOpen(tx, year.id);
    // Two passes, so swapping two roll numbers never collides half-way.
    for (const r of good) await tx.enrolment.updateMany({ where: { studentId: r.studentId, academicYearId: year.id }, data: { rollNo: null } });
  }
  for (const r of good) await writeField(tx, ctx, field, r.studentId, r.after, year?.id ?? null);
  const batch = await tx.bulkUpdate.create({
    data: { schoolId: ctx.schoolId, field, changes: good.map((r) => ({ studentId: r.studentId, before: r.before, after: r.after })), createdById: ctx.userId },
  });
  await writeAudit(tx, ctx, {
    action: "bulk-updated",
    recordType: "Student",
    recordId: null,
    before: { field, values: good.map((r) => ({ studentId: r.studentId, value: r.before })) } as Prisma.InputJsonValue,
    after: { field, bulkUpdateId: batch.id, values: good.map((r) => ({ studentId: r.studentId, value: r.after })) } as Prisma.InputJsonValue,
  });
  return { batch, updated: good.length, skipped: rows.length - good.length, rows };
}

export async function undoBulkUpdate(tx: Tx, ctx: SchoolContext, bulkUpdateId: string) {
  const b = await tx.bulkUpdate.findUnique({ where: { id: bulkUpdateId } });
  if (!b) throw new StudentProblem("This bulk update was not found.");
  if (b.undoneAt) throw new StudentProblem("This bulk update was already undone.");
  const changes = b.changes as { studentId: string; before: string | null; after: string | null }[];
  const year = await currentYear(tx, ctx);
  if (b.field === "rollNo" && year) {
    for (const c of changes) await tx.enrolment.updateMany({ where: { studentId: c.studentId, academicYearId: year.id }, data: { rollNo: null } });
  }
  if (b.field === "admissionNo") {
    for (const c of changes) {
      if (c.before && (await admissionNoTaken(tx, c.before, c.studentId))) throw new StudentProblem(`Admission number ${c.before} is now used by another student, so this cannot be undone.`);
    }
  }
  for (const c of changes) await writeField(tx, ctx, b.field, c.studentId, c.before, year?.id ?? null);
  await tx.bulkUpdate.update({ where: { id: b.id }, data: { undoneAt: new Date(), undoneById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "bulk-update-undone", recordType: "Student", recordId: null, after: { field: b.field, bulkUpdateId: b.id, students: changes.length } });
  return changes.length;
}

/** Bulk section change (same class); each student keeps their history. */
export async function bulkChangeSection(tx: Tx, ctx: SchoolContext, studentIds: string[], toSectionId: string) {
  let moved = 0;
  const skipped: string[] = [];
  for (const id of studentIds) {
    try {
      await changeSection(tx, ctx, id, toSectionId, "Bulk section change");
      moved++;
    } catch (e) {
      const s = await tx.student.findUnique({ where: { id }, select: { fullName: true } });
      skipped.push(`${s?.fullName ?? "A student"}: ${e instanceof Error ? e.message : "could not be moved"}`);
    }
  }
  return { moved, skipped };
}

// ---- Bulk profile photos -----------------------------------------------------

export type PhotoMatch = { fileName: string; studentId: string | null; fullName: string | null; problem: string | null; hasPhoto: boolean };

/** Matches photo files to students by admission number in the file name (e.g. "SPS-2026-0145.jpg"). */
export async function matchPhotos(tx: Tx, fileNames: string[]): Promise<PhotoMatch[]> {
  const stem = (n: string) => n.replace(/\.[a-z0-9]+$/i, "").trim().toLowerCase();
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const students = await tx.student.findMany({ where: { archivedAt: null }, select: { id: true, admissionNo: true, fullName: true, photoFileId: true } });
  const byKey = new Map(students.map((s) => [key(s.admissionNo), s]));
  const out: PhotoMatch[] = fileNames.map((fileName) => {
    const s = byKey.get(key(stem(fileName)));
    if (!s) return { fileName, studentId: null, fullName: null, problem: "No student has this admission number.", hasPhoto: false };
    return { fileName, studentId: s.id, fullName: s.fullName, problem: null, hasPhoto: Boolean(s.photoFileId) };
  });
  const count = new Map<string, number>();
  for (const m of out) if (m.studentId) count.set(m.studentId, (count.get(m.studentId) ?? 0) + 1);
  for (const m of out) {
    if (m.studentId && (count.get(m.studentId) ?? 0) > 1) m.problem = `${count.get(m.studentId)} files match ${m.fullName}. Keep one.`;
  }
  return out;
}

/** Saves the chosen photos. Students who already have a photo are replaced only when asked. */
export async function saveBulkPhotos(tx: Tx, ctx: SchoolContext, files: File[], opts: { replaceExisting: boolean; skip: Set<string> }) {
  const matches = await matchPhotos(tx, files.map((f) => f.name));
  let saved = 0;
  const skipped: string[] = [];
  const done = new Set<string>();
  for (const [i, m] of matches.entries()) {
    if (opts.skip.has(m.fileName)) { skipped.push(`${m.fileName}: skipped`); continue; }
    if (!m.studentId) { skipped.push(`${m.fileName}: ${m.problem}`); continue; }
    if (done.has(m.studentId)) { skipped.push(`${m.fileName}: another file was used for ${m.fullName}`); continue; }
    if (m.hasPhoto && !opts.replaceExisting) { skipped.push(`${m.fileName}: ${m.fullName} already has a photo`); continue; }
    const file = await saveFile(tx, ctx, { file: files[i], purpose: "student-photo", allowed: IMAGE_TYPES, maxImageWidth: 600 });
    const before = await tx.student.findUniqueOrThrow({ where: { id: m.studentId }, select: { photoFileId: true } });
    await tx.student.update({ where: { id: m.studentId }, data: { photoFileId: file.id, updatedById: ctx.userId } });
    await writeAudit(tx, ctx, { action: before.photoFileId ? "photo-replaced" : "photo-added", recordType: "Student", recordId: m.studentId, before: { photoFileId: before.photoFileId }, after: { photoFileId: file.id, bulk: true } });
    done.add(m.studentId);
    saved++;
  }
  return { saved, skipped };
}
