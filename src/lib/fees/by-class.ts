// Fees by class (owner's prototype changes of 13 Oct 2026, fees-classwise.jsx):
// every section with what has fallen due so far, what came in, what is still
// pending (not late yet) and overdue, and its class teacher; one section's
// students one by one. This is the one per-class source for fee totals: the
// Fee Dashboard band, Fees by class, the class-wise Fee Report and the
// Dashboard's fee numbers all add up these same rows, so they always agree.
//
// "Due so far" is every open fee row due by the end of the billing window
// (today + 30 days, the same window as "Pending" on the Fee Dashboard) for this
// year, plus any older row still unpaid. Removed rows never count. Students not
// in a section this year (left, or not placed yet) come in one extra row, so
// the class rows still add up to the school's totals.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { Tx } from "../db";
import { addDays, DAY_MS } from "../staff/dates";
import { classGroups, type ClassGroup } from "../attendance/classwise";
import { DUE_WINDOW_DAYS, netAmount } from "./dues";
import { feeStudentFilter, type FeeViewer } from "./access";
import { OPEN_LINK } from "../students/guardian-access";
import { sectionInCampus } from "../campus";

const ZERO = BigInt(0);
export const NO_SECTION = "none";

export type FeeTotals = {
  students: number;
  due: bigint;
  paid: bigint;
  /** Everything still to pay on rows due so far (not late + overdue). */
  pending: bigint;
  /** Still to pay, due date not passed yet. */
  notLate: bigint;
  overdue: bigint;
  /** Students who still owe something. */
  owe: number;
  /** Students with something overdue. */
  overdueStudents: number;
  /** Students more than 30 days overdue. */
  over30: number;
  /** Paid ÷ due × 100, one decimal; 100 when nothing is due. */
  percent: number;
};

export type StudentFees = {
  studentId: string; name: string; admissionNo: string; rollNo: number | null;
  due: bigint; paid: bigint; pending: bigint; overdue: bigint;
  /** Days the oldest overdue row is late (0 when nothing is overdue). */
  daysLate: number;
  /** The oldest overdue row, else the next row to pay. */
  oldest: { label: string; dueDate: Date } | null;
};

export type SectionFees = FeeTotals & {
  sectionId: string;
  name: string;
  classId: string | null;
  sort: number;
  group: ClassGroup | null;
  teacher: { staffId: string; name: string; userLoginId: string | null } | null;
};

export type FeesByClass = { sections: SectionFees[]; groups: ClassGroup[]; totals: FeeTotals; nextDue: Date | null };

type Row = { studentId: string; label: string; dueDate: Date; net: bigint; paid: bigint; balance: bigint };

function emptyTotals(): FeeTotals {
  return { students: 0, due: ZERO, paid: ZERO, pending: ZERO, notLate: ZERO, overdue: ZERO, owe: 0, overdueStudents: 0, over30: 0, percent: 100 };
}

function addStudent(t: FeeTotals, s: StudentFees) {
  t.students++;
  t.due += s.due; t.paid += s.paid; t.pending += s.pending; t.overdue += s.overdue; t.notLate += s.pending - s.overdue;
  if (s.pending > ZERO) t.owe++;
  if (s.overdue > ZERO) t.overdueStudents++;
  if (s.daysLate > 30) t.over30++;
}

function finishTotals(t: FeeTotals) {
  t.percent = t.due > ZERO ? Math.round((Number(t.paid) / Number(t.due)) * 1000) / 10 : 100;
  return t;
}

/**
 * The fee rows that count, for these students (or everyone the viewer may see:
 * the whole school, or their campus). "This year" is each campus's current year
 * (`yearIds`), or the one year asked for.
 */
async function dueRows(tx: Tx, viewer: Pick<FeeViewer, "yearIds" | "campusId">, today: Date, studentIds: string[] | null): Promise<Row[]> {
  const horizon = addDays(today, DUE_WINDOW_DAYS);
  const archived = (await tx.student.findMany({ where: { archivedAt: { not: null } }, select: { id: true } })).map((s) => s.id);
  const where: Prisma.StudentFeeDueWhereInput = {
    state: "OPEN",
    dueDate: { lte: horizon },
    // An archived student's rows are not counted, as on Defaulters (fees/defaulters.ts). Archived students are few.
    ...(archived.length ? { NOT: { studentId: { in: archived } } } : {}),
    ...(viewer.yearIds.length ? { OR: [{ academicYearId: { in: viewer.yearIds } }, { balancePaise: { gt: 0 } }] } : {}),
    ...(studentIds ? { studentId: { in: studentIds } } : await feeStudentFilter(tx, viewer)),
  };
  const rows = await tx.studentFeeDue.findMany({ where, select: { studentId: true, label: true, dueDate: true, amountPaise: true, concessionPaise: true, adjustmentPaise: true, paidPaise: true, balancePaise: true } });
  return rows.map((r) => ({ studentId: r.studentId, label: r.label, dueDate: r.dueDate, net: netAmount(r), paid: r.paidPaise, balance: r.balancePaise > ZERO ? r.balancePaise : ZERO }));
}

function studentFees(rows: Row[], today: Date, who: { studentId: string; name: string; admissionNo: string; rollNo: number | null }): StudentFees {
  let due = ZERO, paid = ZERO, pending = ZERO, overdue = ZERO;
  let oldestLate: Row | null = null;
  let next: Row | null = null;
  for (const r of rows) {
    due += r.net; paid += r.paid; pending += r.balance;
    if (r.balance > ZERO && r.dueDate < today) {
      overdue += r.balance;
      if (!oldestLate || r.dueDate < oldestLate.dueDate) oldestLate = r;
    } else if (r.balance > ZERO && (!next || r.dueDate < next.dueDate)) next = r;
  }
  const o = oldestLate ?? next;
  return {
    ...who, due, paid, pending, overdue,
    daysLate: oldestLate ? Math.floor((today.getTime() - oldestLate.dueDate.getTime()) / DAY_MS) : 0,
    oldest: o ? { label: o.label, dueDate: o.dueDate } : null,
  };
}

/**
 * Each student's fees fallen due so far, from the same rows as Fees by class:
 * what is still to pay and how much of it is overdue. A student with nothing
 * fallen due yet is left out of the map. For the Student List and Parent 360.
 */
export async function feesDueOf(tx: Tx, yearId: string | null, today: Date, studentIds: string[]) {
  const out = new Map<string, { pending: bigint; overdue: bigint }>();
  if (!studentIds.length) return out;
  for (const r of await dueRows(tx, { yearIds: yearId ? [yearId] : [], campusId: null }, today, studentIds)) {
    const t = out.get(r.studentId) ?? { pending: ZERO, overdue: ZERO };
    t.pending += r.balance;
    if (r.balance > ZERO && r.dueDate < today) t.overdue += r.balance;
    out.set(r.studentId, t);
  }
  return out;
}

/** Students who still owe fees fallen due so far ("Has dues"), or fees past their due date ("Overdue"): one read for the whole school. */
export async function studentsOwing(tx: Tx, today: Date, kind: "dues" | "overdue") {
  const rows = await tx.studentFeeDue.findMany({
    where: { state: "OPEN", balancePaise: { gt: 0 }, dueDate: kind === "overdue" ? { lt: today } : { lte: addDays(today, DUE_WINDOW_DAYS) } },
    select: { studentId: true },
    distinct: ["studentId"],
  });
  return rows.map((r) => r.studentId);
}

/** Whom the viewer may see: everyone (on their campus, when limited to one), or (Own) their sections' students. */
function sectionFilter(viewer: FeeViewer): Prisma.SectionWhereInput {
  return { ...sectionInCampus(viewer), ...(viewer.see === "all" ? {} : { id: { in: viewer.sectionIds ?? [] } }) };
}

/**
 * Every section of the current year (each campus's own current year) with its
 * fee totals as of today, and the school's totals (which include students not
 * in a section this year). A person limited to one campus sees that campus only.
 */
export async function feesByClass(tx: Tx, viewer: FeeViewer, today: Date): Promise<FeesByClass> {
  if (viewer.see === "none") return { sections: [], groups: [], totals: emptyTotals(), nextDue: null };
  const sections = viewer.yearIds.length
    ? await tx.section.findMany({ where: { academicYearId: { in: viewer.yearIds }, archivedAt: null, ...sectionFilter(viewer) }, include: { schoolClass: { select: { id: true, name: true, sortOrder: true, level: true } } } })
    : [];
  const enrol = viewer.yearIds.length
    ? await tx.enrolment.findMany({ where: { academicYearId: { in: viewer.yearIds }, archivedAt: null, sectionId: { in: sections.map((s) => s.id) }, student: { archivedAt: null } }, select: { studentId: true, sectionId: true } })
    : [];
  const sectionOf = new Map(enrol.map((e) => [e.studentId, e.sectionId]));
  // Own reach: only their sections' students. Full and View: every row in the school.
  const rows = await dueRows(tx, viewer, today, viewer.see === "all" ? null : [...sectionOf.keys()]);
  const byStudent = new Map<string, Row[]>();
  for (const r of rows) byStudent.set(r.studentId, [...(byStudent.get(r.studentId) ?? []), r]);
  // Everyone in a section counts as a student of it, even with nothing due yet.
  for (const id of sectionOf.keys()) if (!byStudent.has(id)) byStudent.set(id, []);

  const teachers = await tx.staff.findMany({ where: { id: { in: sections.map((s) => s.classTeacherId).filter((x): x is string => Boolean(x)) } }, select: { id: true, fullName: true, userLoginId: true } });
  const teacherOf = new Map(teachers.map((t) => [t.id, t]));
  const { groups, groupOf } = classGroups(sections.map((s) => s.schoolClass));
  const per = new Map<string, FeeTotals>(sections.map((s) => [s.id, emptyTotals()]));
  const none = emptyTotals();
  const totals = emptyTotals();
  let nextDue: Date | null = null;
  for (const [studentId, list] of byStudent) {
    const s = studentFees(list, today, { studentId, name: "", admissionNo: "", rollNo: null });
    const t = per.get(sectionOf.get(studentId) ?? "") ?? none;
    // A student with nothing due and not in a section is not counted anywhere.
    if (t === none && list.length === 0) continue;
    addStudent(t, s);
    addStudent(totals, s);
    for (const r of list) if (r.balance > ZERO && r.dueDate >= today && (!nextDue || r.dueDate < nextDue)) nextDue = r.dueDate;
  }
  const out: SectionFees[] = sections.map((sec) => {
    const t = sec.classTeacherId ? teacherOf.get(sec.classTeacherId) : undefined;
    return {
      ...finishTotals(per.get(sec.id)!),
      sectionId: sec.id, name: `${sec.schoolClass.name} ${sec.name}`, classId: sec.schoolClass.id, sort: sec.schoolClass.sortOrder,
      group: groupOf(sec.schoolClass),
      teacher: t ? { staffId: t.id, name: t.fullName, userLoginId: t.userLoginId } : null,
    };
  }).filter((s) => s.students > 0).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "en", { numeric: true }));
  if (none.students > 0) out.push({ ...finishTotals(none), sectionId: NO_SECTION, name: "Not in a class this year", classId: null, sort: 9999, group: null, teacher: null });
  return { sections: out, groups, totals: finishTotals(totals), nextDue };
}

/**
 * One section's students with their fees, for the class page. Own reach sees
 * only their own sections; a person limited to one campus only its sections.
 * The section is of its own campus's current year.
 */
export async function sectionFees(tx: Tx, viewer: FeeViewer, sectionId: string, today: Date) {
  if (viewer.see === "none" || !viewer.yearIds.length) return null;
  if (viewer.see !== "all" && !(viewer.sectionIds ?? []).includes(sectionId)) return null;
  const sec = await tx.section.findFirst({ where: { id: sectionId, academicYearId: { in: viewer.yearIds }, archivedAt: null, ...sectionInCampus(viewer) }, include: { schoolClass: { select: { id: true, name: true } } } });
  if (!sec) return null;
  const enrol = await tx.enrolment.findMany({
    where: { sectionId, academicYearId: sec.academicYearId, archivedAt: null, student: { archivedAt: null } },
    select: { studentId: true, rollNo: true, student: { select: { fullName: true, admissionNo: true } } },
  });
  const rows = await dueRows(tx, viewer, today, enrol.map((e) => e.studentId));
  const students = enrol.map((e) => studentFees(rows.filter((r) => r.studentId === e.studentId), today, { studentId: e.studentId, name: e.student.fullName, admissionNo: e.student.admissionNo, rollNo: e.rollNo }));
  const totals = emptyTotals();
  for (const s of students) addStudent(totals, s);
  const t = sec.classTeacherId ? await tx.staff.findFirst({ where: { id: sec.classTeacherId }, select: { id: true, fullName: true, userLoginId: true } }) : null;
  const guardians = await tx.studentGuardian.findMany({
    where: { studentId: { in: enrol.map((e) => e.studentId) }, ...OPEN_LINK }, orderBy: [{ isPrimary: "desc" }],
    select: { studentId: true, guardian: { select: { name: true, phone: true } } },
  });
  const parentOf = new Map<string, { name: string; phone: string | null }>();
  for (const g of guardians) if (!parentOf.has(g.studentId)) parentOf.set(g.studentId, g.guardian);
  return {
    sectionId: sec.id, name: `${sec.schoolClass.name} ${sec.name}`,
    teacher: t ? { staffId: t.id, name: t.fullName, userLoginId: t.userLoginId } : null,
    totals: finishTotals(totals),
    students: students.map((s) => ({ ...s, parent: parentOf.get(s.studentId) ?? null })),
  };
}

/** Lowest collected first, most overdue first, most pending first, or class order. */
export type FeeSort = "overdue" | "pending" | "pct" | "class";
export function sortFees<T extends SectionFees>(rows: T[], by: FeeSort) {
  if (by === "class") return rows;
  return [...rows].sort((a, b) => (by === "pct" ? a.percent - b.percent
    : by === "overdue" ? Number(b.overdue - a.overdue) || Number(b.pending - a.pending)
      : Number(b.pending - a.pending)) || a.sort - b.sort);
}

/** Green 90% or more collected, amber 80% to 90%, red below 80% (the approved Fees by class). */
export const feeTone = (percent: number): "ok" | "warn" | "bad" => (percent >= 90 ? "ok" : percent >= 80 ? "warn" : "bad");
