// Each student's fees due ("Fees due" on screen): status, balance, and the
// student details every fee screen shows (photo, class, section, father).
import "server-only";

import type { StudentFeeDue } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { addDays } from "../staff/dates";
import { currentEnrolment, currentEnrolments } from "../academic/years";

/** A row is "Due" from this many days before its due date (inferred: the current period). */
export const DUE_WINDOW_DAYS = 30;

export type DueStatus = "NOT_DUE" | "DUE" | "OVERDUE" | "PAID" | "REMOVED";

export function dueStatus(d: Pick<StudentFeeDue, "state" | "balancePaise" | "dueDate">, today: Date): DueStatus {
  if (d.state === "REMOVED") return "REMOVED";
  if (d.balancePaise <= BigInt(0)) return "PAID";
  if (d.dueDate < today) return "OVERDUE";
  if (d.dueDate <= addDays(today, DUE_WINDOW_DAYS)) return "DUE";
  return "NOT_DUE";
}

/** What the student owes on this row after concessions and adjustments (before payments). */
export function netAmount(d: Pick<StudentFeeDue, "amountPaise" | "concessionPaise" | "adjustmentPaise">) {
  return d.amountPaise - d.concessionPaise + d.adjustmentPaise;
}

/** Keeps balance = amount - concession + adjustment - paid, after any change to a row. */
export async function refreshBalances(tx: Tx, dueIds: string[]) {
  if (dueIds.length === 0) return;
  await tx.$executeRaw`UPDATE student_fee_due SET balance_paise = amount_paise - concession_paise + adjustment_paise - paid_paise, updated_at = now() WHERE id = ANY(${dueIds}::uuid[])`;
}

/** Locks the rows for this change, so two payments at the same moment cannot both take the same balance. */
export async function lockDues(tx: Tx, dueIds: string[]) {
  if (dueIds.length === 0) return;
  await tx.$queryRaw`SELECT id FROM student_fee_due WHERE id = ANY(${dueIds}::uuid[]) FOR UPDATE`;
}

export async function changeDue(tx: Tx, dueId: string, change: { paid?: bigint; concession?: bigint; adjustment?: bigint }) {
  await tx.studentFeeDue.update({
    where: { id: dueId },
    data: {
      ...(change.paid ? { paidPaise: { increment: change.paid } } : {}),
      ...(change.concession ? { concessionPaise: { increment: change.concession } } : {}),
      ...(change.adjustment ? { adjustmentPaise: { increment: change.adjustment } } : {}),
    },
  });
  await refreshBalances(tx, [dueId]);
}

/** A student's open rows with something still to pay, oldest first. */
export async function openDues(tx: Tx, studentId: string) {
  return tx.studentFeeDue.findMany({
    where: { studentId, state: "OPEN", balancePaise: { gt: 0 } },
    orderBy: [{ dueDate: "asc" }, { kind: "asc" }, { createdAt: "asc" }],
  });
}

/** Every row of a student, oldest first. */
export async function allDues(tx: Tx, studentId: string, opts: { includeRemoved?: boolean } = {}) {
  return tx.studentFeeDue.findMany({
    where: { studentId, ...(opts.includeRemoved ? {} : { state: "OPEN" }) },
    orderBy: [{ dueDate: "asc" }, { kind: "asc" }, { createdAt: "asc" }],
  });
}

/** Totals for the student card: total fees for the year, paid, balance. */
export function totalsOf(dues: Pick<StudentFeeDue, "amountPaise" | "concessionPaise" | "adjustmentPaise" | "paidPaise" | "balancePaise" | "state">[]) {
  let total = BigInt(0), paid = BigInt(0), balance = BigInt(0);
  for (const d of dues) {
    if (d.state === "REMOVED") continue;
    total += netAmount(d);
    paid += d.paidPaise;
    balance += d.balancePaise;
  }
  return { total, paid, balance };
}

/** Advance held for a student: extra paid and not yet used for a due or refunded. */
export async function advanceHeld(tx: Tx, studentId: string) {
  const [paid, used, refunded] = await Promise.all([
    tx.payment.aggregate({ where: { studentId, status: "POSTED" }, _sum: { advancePaise: true } }),
    tx.paymentAllocation.aggregate({ where: { fromAdvance: true, payment: { studentId, status: "POSTED" } }, _sum: { amountPaise: true } }),
    tx.refund.aggregate({ where: { studentId, status: "REFUNDED" }, _sum: { advanceUsedPaise: true } }),
  ]);
  return (paid._sum.advancePaise ?? BigInt(0)) - (used._sum.amountPaise ?? BigInt(0)) - (refunded._sum.advanceUsedPaise ?? BigInt(0));
}

export type StudentCard = Awaited<ReturnType<typeof studentCard>>;

/**
 * The student card on fee screens: photo, name, class and section, roll number, father's name, parents' phones.
 * The class is the one in the given year (a payment's year, for history), else the student's class this year.
 */
export async function studentCard(tx: Tx, ctx: SchoolContext, studentId: string, academicYearId?: string | null) {
  const s = await tx.student.findFirst({
    where: { id: studentId },
    include: {
      guardians: { where: { archivedAt: null }, include: { guardian: true }, orderBy: [{ isPrimary: "desc" }, { emergencyOrder: "asc" }] },
    },
  });
  if (!s) return null;
  const e = academicYearId
    ? await tx.enrolment.findFirst({ where: { studentId, academicYearId, archivedAt: null } })
    : await currentEnrolment(tx, studentId);
  const section = e ? await tx.section.findUnique({ where: { id: e.sectionId }, include: { schoolClass: true } }) : null;
  const father = s.guardians.find((g) => /father/i.test(g.relationship))?.guardian ?? null;
  const primary = s.guardians[0]?.guardian ?? null;
  return {
    id: s.id,
    name: s.fullName,
    admissionNo: s.admissionNo,
    photoFileId: s.photoFileId,
    category: s.category,
    campusId: s.campusId,
    status: s.status,
    classId: e?.classId ?? null,
    sectionId: e?.sectionId ?? null,
    academicYearId: e?.academicYearId ?? null,
    className: section?.schoolClass.name ?? null,
    sectionName: section?.name ?? null,
    classSection: section ? `${section.schoolClass.name} ${section.name}` : "No class this year",
    rollNo: e?.rollNo ?? null,
    fatherName: father?.name ?? primary?.name ?? null,
    primaryGuardian: primary ? { id: primary.id, name: primary.name, phone: primary.phone, optedOut: primary.optedOut, language: primary.language } : null,
    guardians: s.guardians.map((g) => ({ id: g.guardian.id, name: g.guardian.name, relationship: g.relationship, phone: g.guardian.phone, optedOut: g.guardian.optedOut })),
  };
}

export type ClassOf = { classId: string; sectionId: string; label: string; className: string };

async function sectionLabels(tx: Tx, sectionIds: string[]) {
  const sections = await tx.section.findMany({ where: { id: { in: [...new Set(sectionIds)] } }, include: { schoolClass: true } });
  return new Map(sections.map((s) => [s.id, { classId: s.classId, sectionId: s.id, label: `${s.schoolClass.name} ${s.name}`, className: s.schoolClass.name } satisfies ClassOf]));
}

/**
 * Class and section names for many students: in the given year, else each
 * student's class this year (lists, reports, Day Book entries), which is in
 * their own campus's current year. A list of years (each campus's current
 * year, FeeViewer.yearIds) means "this year" too.
 */
export async function classOfStudents(tx: Tx, studentIds: string[], academicYearId?: string | readonly string[] | null) {
  const out = new Map<string, ClassOf>();
  if (!studentIds.length) return out;
  const rows = typeof academicYearId === "string"
    ? await tx.enrolment.findMany({ where: { studentId: { in: [...new Set(studentIds)] }, archivedAt: null, academicYearId } })
    : [...(await currentEnrolments(tx, studentIds)).values()];
  const labels = await sectionLabels(tx, rows.map((r) => r.sectionId));
  for (const r of rows) {
    const s = labels.get(r.sectionId);
    if (s) out.set(r.studentId, s);
  }
  return out;
}

/**
 * For records that belong to a year (payments, concessions, refunds, late
 * fees): the student's class in that record's year, so last year's receipt
 * shows last year's class and this year's shows this year's. A record with no
 * year, or a year the student was not enrolled in, shows the class this year.
 */
export async function classInYearOf(tx: Tx, records: { studentId: string; academicYearId?: string | null }[]) {
  const ids = [...new Set(records.map((r) => r.studentId))];
  const all = ids.length ? await tx.enrolment.findMany({ where: { studentId: { in: ids }, archivedAt: null } }) : [];
  const current = await currentEnrolments(tx, ids);
  const labels = await sectionLabels(tx, all.map((r) => r.sectionId));
  const inYear = new Map(all.map((e) => [`${e.studentId}|${e.academicYearId}`, e.sectionId]));
  return (studentId: string, academicYearId?: string | null): ClassOf | null => {
    const sectionId = (academicYearId ? inYear.get(`${studentId}|${academicYearId}`) : undefined) ?? current.get(studentId)?.sectionId;
    return sectionId ? labels.get(sectionId) ?? null : null;
  };
}

/** Class and section names of sections stored on records (a Day Book entry keeps the student's section when posted). */
export async function classOfSections(tx: Tx, sectionIds: string[]) {
  return sectionLabels(tx, sectionIds);
}
