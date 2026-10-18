// Absence reasons (gap list P1.8, 05 §2 Take Attendance and Attendance
// Register): why a student was absent, so the school can act on the right
// thing and Early Warnings can tell an unexplained absence from a sick day.
// Switched on per school (School Feature attendance-absence-reasons).
//
// Where a reason comes from, without slowing the one-tap register:
// - Take Attendance: optional after marking Absent; "Not known yet" by default.
// - Student Leave: approved leave fills it for days already marked absent.
// - Later, from the day's absent list in the Attendance Register, by the class
//   teacher or the office (for example after the parent calls back). Audited.
// A "Fees dispute" reason is seen only by people with the whole school's fees;
// everyone else sees "Other". Marks from before have no reason (not recorded).
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate } from "../format";
import { assertYearOpen } from "../academic/years";
import { isoDay } from "../staff/dates";
import { AttendanceProblem, NotYoursError, registerSections, sectionAllowed, sectionLimit, type AttendanceAccess } from "./access";
import { attendanceFeatures, statusList, statusesFor } from "./settings";

export const REASONS_FEATURE = "attendance-absence-reasons" as const;

export const ABSENCE_REASONS = [
  { key: "not-known", label: "Not known yet" },
  { key: "sick", label: "Sick" },
  { key: "family-function", label: "Family function" },
  { key: "travel", label: "Travel" },
  { key: "fees-dispute", label: "Fees dispute" },
  { key: "other", label: "Other" },
] as const;
export type AbsenceReason = (typeof ABSENCE_REASONS)[number]["key"];
export const DEFAULT_REASON: AbsenceReason = "not-known";
/** The reason only people with the school's fees may see or choose. */
export const FEE_REASON: AbsenceReason = "fees-dispute";
export const NOTE_MAX = 100;

export const SOURCE_WORDS: Record<string, string> = { register: "Take Attendance", later: "Set later", leave: "Approved leave" };

const LABEL = new Map<string, string>(ABSENCE_REASONS.map((r) => [r.key, r.label]));
export const isReason = (k: unknown): k is AbsenceReason => typeof k === "string" && LABEL.has(k);
export const reasonLabel = (k: string | null | undefined) => (k ? LABEL.get(k) ?? k : "Not recorded");

/** The reasons a person may choose: "Fees dispute" only with the school's fees. */
export function reasonChoices(seesFees: boolean) {
  return ABSENCE_REASONS.filter((r) => seesFees || r.key !== FEE_REASON).map((r) => ({ key: r.key, label: r.label }));
}

export type StoredReason = { absenceReason: string | null; absenceNote: string | null; reasonSource?: string | null };
export type ShownReason = { key: string; label: string; note: string | null; source: string | null };

/** What a person sees of a mark's reason: "Fees dispute" is shown as "Other", without its note, to people without the school's fees. */
export function shownReason(r: StoredReason, seesFees: boolean): ShownReason | null {
  if (!r.absenceReason) return null;
  if (r.absenceReason === FEE_REASON && !seesFees) return { key: "other", label: "Other", note: null, source: r.reasonSource ?? null };
  return { key: r.absenceReason, label: reasonLabel(r.absenceReason), note: r.absenceNote, source: r.reasonSource ?? null };
}

export const cleanNote = (s: unknown) => (typeof s === "string" ? s.trim().replace(/\s+/g, " ").slice(0, NOTE_MAX) : "") || null;

/** The status keys that count as absent (the school's own ones too). */
export async function absentKeys(tx: Tx, ctx: SchoolContext): Promise<Set<string>> {
  const list = statusesFor(await statusList(tx, ctx, { includeArchived: true }), "students");
  return new Set(list.filter((s) => s.counts === "absent").map((s) => s.key));
}

export async function reasonsOn(tx: Tx, ctx: SchoolContext) {
  return (await attendanceFeatures(tx, ctx)).has(REASONS_FEATURE);
}

/** The reason approved leave gives an absent day: Medical is Sick, Holiday is Travel, anything else Other with the leave type. */
export function reasonFromLeave(leave: { typeCode?: string | null; typeName: string; reason?: string | null }): { absenceReason: AbsenceReason; absenceNote: string | null } {
  const code = (leave.typeCode ?? "").toUpperCase();
  const name = leave.typeName.toLowerCase();
  const why = leave.reason?.trim() ? `: ${leave.reason.trim()}` : "";
  if (code === "MED" || name === "medical") return { absenceReason: "sick", absenceNote: cleanNote(`${leave.typeName} leave${why}`) };
  if (code === "HOL" || name === "holiday") return { absenceReason: "travel", absenceNote: cleanNote(`${leave.typeName} leave${why}`) };
  return { absenceReason: "other", absenceNote: cleanNote(`${leave.typeName} leave${why}`) };
}

/**
 * The reason a saved mark keeps (Take Attendance and corrections). Not absent:
 * no reason. Absent with nothing chosen: the reason it had, else approved
 * half-day leave, else "Not known yet". A person without the school's fees
 * who sees "Other" in place of "Fees dispute" and leaves it does not change it.
 */
export function nextReason(input: {
  on: boolean; absent: boolean; seesFees: boolean;
  wanted?: string | null; note?: string | null;
  existing: StoredReason | null;
  leave?: { absenceReason: AbsenceReason; absenceNote: string | null } | null;
}): { absenceReason: string | null; absenceNote: string | null; reasonSource: string | null } {
  const ex = input.existing;
  const keep = { absenceReason: ex?.absenceReason ?? null, absenceNote: ex?.absenceNote ?? null, reasonSource: ex?.reasonSource ?? null };
  if (!input.absent) return { absenceReason: null, absenceNote: null, reasonSource: null };
  if (!input.on) return keep;
  const note = cleanNote(input.note);
  if (input.wanted === undefined || input.wanted === null || input.wanted === "") {
    if (ex?.absenceReason) return keep;
    if (input.leave) return { ...input.leave, reasonSource: "leave" };
    return { absenceReason: DEFAULT_REASON, absenceNote: null, reasonSource: "register" };
  }
  if (!isReason(input.wanted)) throw new AttendanceProblem("Choose the reason from the list.", "reason");
  if (input.wanted === FEE_REASON && !input.seesFees) throw new AttendanceProblem("Choose the reason from the list.", "reason");
  if (ex?.absenceReason === FEE_REASON && !input.seesFees && input.wanted === "other" && !note) return keep;
  if (ex?.absenceReason === input.wanted && (ex.absenceNote ?? null) === note) return keep;
  return { absenceReason: input.wanted, absenceNote: note, reasonSource: "register" };
}

/**
 * May this person set reasons later for this section? Whole-school reach, the
 * class teacher, or the office (student leave for everyone); on their own
 * campus only when their access is limited to one.
 */
export function mayRecordReasons(access: AttendanceAccess, sectionId: string | null) {
  if (access.change === "none") return false;
  if (access.students === "all" && access.change === "all" && sectionAllowed(access, sectionId)) return true;
  if (access.studentLeave === "all" && sectionAllowed(access, sectionId)) return true;
  return Boolean(sectionId && access.classSections.includes(sectionId));
}

/** May this person open the day's absent list at all? */
export function mayOpenAbsentList(access: AttendanceAccess) {
  return access.students !== "none" || access.studentLeave === "all";
}

function sectionsFor(access: AttendanceAccess): string[] | "all" {
  if (access.students === "all" || access.studentLeave === "all") return access.limitSections ?? "all";
  return registerSections(access);
}

export type AbsentRow = {
  studentId: string; name: string; admissionNo: string; rollNo: number | null; sectionId: string | null; className: string;
  statusName: string; periods: number[]; note: string | null;
  reason: ShownReason | null; mayChange: boolean; leave: string | null;
};

/** The students absent on a date (whole-day mark, or absent in a period), with their reasons, for the sections this person may see. */
export async function absentList(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, input: { date: Date; sectionId?: string | null }) {
  if (!mayOpenAbsentList(access)) throw new NotYoursError("this list");
  const reach = sectionsFor(access);
  if (reach !== "all" && reach.length === 0) return [];
  if (input.sectionId && reach !== "all" && !reach.includes(input.sectionId)) throw new NotYoursError();
  const keys = await absentKeys(tx, ctx);
  const statuses = new Map((await statusList(tx, ctx, { includeArchived: true })).map((s) => [s.key, s.name]));
  const marks = await tx.attendanceMark.findMany({
    where: {
      date: input.date, archivedAt: null, studentId: { not: null }, statusKey: { in: [...keys] },
      ...(input.sectionId ? { sectionId: input.sectionId } : reach === "all" ? {} : { sectionId: { in: reach } }),
    },
    orderBy: { periodNo: "asc" },
  });
  if (!marks.length) return [];
  const ids = [...new Set(marks.map((m) => m.studentId!))];
  const [students, sections, enrol, leave] = await Promise.all([
    tx.student.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, admissionNo: true } }),
    tx.section.findMany({ where: { id: { in: [...new Set(marks.map((m) => m.sectionId).filter((x): x is string => Boolean(x)))] } }, include: { schoolClass: { select: { name: true, sortOrder: true } } } }),
    tx.enrolment.findMany({ where: { studentId: { in: ids }, archivedAt: null, sectionId: { in: [...new Set(marks.map((m) => m.sectionId).filter((x): x is string => Boolean(x)))] } }, select: { studentId: true, sectionId: true, rollNo: true } }),
    tx.leaveRequest.findMany({ where: { studentId: { in: ids }, archivedAt: null, status: { in: ["WAITING", "APPROVED"] }, fromDate: { lte: input.date }, toDate: { gte: input.date } }, select: { studentId: true, status: true, leaveTypeId: true } }),
  ]);
  const types = new Map((await tx.leaveType.findMany({ where: { id: { in: leave.map((l) => l.leaveTypeId) } }, select: { id: true, name: true } })).map((t) => [t.id, t.name]));
  const byStudent = new Map<string, typeof marks>();
  for (const m of marks) byStudent.set(m.studentId!, [...(byStudent.get(m.studentId!) ?? []), m]);
  const rows: { row: AbsentRow; sort: number }[] = [];
  for (const [sid, list] of byStudent) {
    const s = students.find((x) => x.id === sid);
    const first = list[0];
    const sec = sections.find((x) => x.id === first.sectionId);
    const withReason = list.find((m) => m.absenceReason) ?? first;
    const l = leave.find((x) => x.studentId === sid);
    rows.push({ sort: sec?.schoolClass.sortOrder ?? 0, row: {
      studentId: sid, name: s?.fullName ?? "Student", admissionNo: s?.admissionNo ?? "", sectionId: first.sectionId,
      rollNo: enrol.find((e) => e.studentId === sid && e.sectionId === first.sectionId)?.rollNo ?? null,
      className: sec ? `${sec.schoolClass.name} ${sec.name}` : "", statusName: statuses.get(first.statusKey) ?? first.statusKey,
      periods: list.filter((m) => m.periodNo > 0).map((m) => m.periodNo), note: first.note,
      reason: shownReason(withReason, access.seesFees), mayChange: mayRecordReasons(access, first.sectionId),
      leave: l ? `${types.get(l.leaveTypeId) ?? "Leave"} leave ${l.status === "APPROVED" ? "approved" : "waiting"}` : null,
    } });
  }
  rows.sort((a, b) => a.sort - b.sort || a.row.className.localeCompare(b.row.className) || (a.row.rollNo ?? 9999) - (b.row.rollNo ?? 9999) || a.row.name.localeCompare(b.row.name));
  return rows.map((r) => r.row);
}

/**
 * Sets the reason for a student's absence on a date, later (for example after
 * the parent calls back). Changes only the reason, never the mark or the %, so
 * it works after the lock too; every change is in the audit log.
 */
export async function setAbsenceReason(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, input: { studentId: string; date: Date; reason: string; note?: string | null }) {
  if (!(await reasonsOn(tx, ctx))) throw new AttendanceProblem("Absence reasons are switched off for this school (Attendance Settings).");
  if (!isReason(input.reason) || (input.reason === FEE_REASON && !access.seesFees)) throw new AttendanceProblem("Choose the reason from the list.", "reason");
  const note = cleanNote(input.note);
  if (input.reason === "other" && !note) throw new AttendanceProblem("Write a short note for Other, so others understand later.", "note");
  const keys = await absentKeys(tx, ctx);
  const marks = await tx.attendanceMark.findMany({ where: { studentId: input.studentId, date: input.date, archivedAt: null, statusKey: { in: [...keys] }, ...sectionLimit(access) } });
  if (!marks.length) throw new AttendanceProblem(`This student is not marked absent on ${formatDate(input.date, "UTC")}.`);
  if (!mayRecordReasons(access, marks[0].sectionId)) throw new NotYoursError("this student");
  if (marks[0].academicYearId) await assertYearOpen(tx, marks[0].academicYearId);
  const before = marks.find((m) => m.absenceReason) ?? marks[0];
  const student = await tx.student.findUnique({ where: { id: input.studentId }, select: { fullName: true } });
  if (before.absenceReason === input.reason && (before.absenceNote ?? null) === note && marks.every((m) => m.absenceReason === input.reason)) {
    return { changed: false, label: reasonLabel(input.reason), name: student?.fullName ?? "Student" };
  }
  await tx.attendanceMark.updateMany({ where: { id: { in: marks.map((m) => m.id) } }, data: { absenceReason: input.reason, absenceNote: note, reasonSource: "later" } });
  await writeAudit(tx, ctx, {
    action: "absence-reason-set", recordType: "Attendance Mark", recordId: marks[0].id,
    before: { student: student?.fullName ?? null, date: isoDay(input.date), reason: before.absenceReason, note: before.absenceNote, source: before.reasonSource },
    after: { student: student?.fullName ?? null, date: isoDay(input.date), reason: input.reason, note, source: "later", marks: marks.length } as Prisma.InputJsonValue,
  });
  return { changed: true, label: reasonLabel(input.reason), name: student?.fullName ?? "Student" };
}

/**
 * Approved student leave fills the reason of days already marked absent that
 * have no reason yet or only "Not known yet" (a reason a person chose stays).
 * Safe to run twice. Audited when anything changes.
 */
export async function fillReasonsFromLeave(tx: Tx, ctx: SchoolContext, leaveRequestId: string) {
  if (!(await reasonsOn(tx, ctx))) return 0;
  const r = await tx.leaveRequest.findFirst({ where: { id: leaveRequestId, studentId: { not: null }, status: "APPROVED", archivedAt: null } });
  if (!r) return 0;
  const type = await tx.leaveType.findUnique({ where: { id: r.leaveTypeId }, select: { code: true, name: true } });
  const give = reasonFromLeave({ typeCode: type?.code, typeName: type?.name ?? "Leave", reason: r.reason });
  const keys = await absentKeys(tx, ctx);
  const marks = await tx.attendanceMark.findMany({
    where: { studentId: r.studentId, date: { gte: r.fromDate, lte: r.toDate }, archivedAt: null, statusKey: { in: [...keys] }, OR: [{ absenceReason: null }, { absenceReason: DEFAULT_REASON }] },
    select: { id: true, date: true, absenceReason: true },
  });
  if (!marks.length) return 0;
  await tx.attendanceMark.updateMany({ where: { id: { in: marks.map((m) => m.id) } }, data: { ...give, reasonSource: "leave" } });
  await writeAudit(tx, ctx, {
    action: "absence-reason-from-leave", recordType: "Attendance Mark", recordId: r.id,
    before: { dates: [...new Set(marks.map((m) => isoDay(m.date)))], reason: marks[0].absenceReason },
    after: { leaveRequest: r.id, reason: give.absenceReason, note: give.absenceNote, marks: marks.length },
  });
  return marks.length;
}

/** A cancelled leave takes back the reasons it filled: those days are "Not known yet" again. Audited. */
export async function undoReasonsFromLeave(tx: Tx, ctx: SchoolContext, leave: { id: string; studentId: string | null; fromDate: Date; toDate: Date }) {
  if (!leave.studentId) return 0;
  const marks = await tx.attendanceMark.findMany({ where: { studentId: leave.studentId, date: { gte: leave.fromDate, lte: leave.toDate }, archivedAt: null, reasonSource: "leave" }, select: { id: true, date: true, absenceReason: true } });
  if (!marks.length) return 0;
  await tx.attendanceMark.updateMany({ where: { id: { in: marks.map((m) => m.id) } }, data: { absenceReason: DEFAULT_REASON, absenceNote: null, reasonSource: "register" } });
  await writeAudit(tx, ctx, {
    action: "absence-reason-leave-cancelled", recordType: "Attendance Mark", recordId: leave.id,
    before: { dates: [...new Set(marks.map((m) => isoDay(m.date)))], reason: marks[0].absenceReason },
    after: { reason: DEFAULT_REASON, marks: marks.length },
  });
  return marks.length;
}

/** One student's absent days between two dates, newest first, with the reason as this person may see it (Student Profile). */
export async function studentAbsences(tx: Tx, ctx: SchoolContext, studentId: string, from: Date, to: Date, seesFees: boolean) {
  const keys = await absentKeys(tx, ctx);
  const marks = await tx.attendanceMark.findMany({
    where: { studentId, date: { gte: from, lte: to }, archivedAt: null, statusKey: { in: [...keys] } },
    orderBy: [{ date: "desc" }, { periodNo: "asc" }],
    select: { date: true, absenceReason: true, absenceNote: true, reasonSource: true },
  });
  const out = new Map<string, { date: Date; reason: ShownReason | null }>();
  for (const m of marks) {
    const k = isoDay(m.date);
    const cur = out.get(k);
    if (!cur || (!cur.reason && m.absenceReason)) out.set(k, { date: m.date, reason: shownReason(m, seesFees) });
  }
  return [...out.values()];
}

/* ---------- the reason mix, for reports and Early Warnings ---------- */

export type ReasonMix = {
  /** Absent days (a day absent in several periods counts once). */
  absent: number;
  /** Absent days per reason; "none" for days with no reason recorded. */
  by: Record<string, number>;
  /** Absent days with approved leave for that day. */
  coveredByLeave: number;
};

/** Each student's absent days and their reasons between two dates (school days only when `working` is given). */
export async function reasonMix(tx: Tx, ctx: SchoolContext, studentIds: string[], from: Date, to: Date, working?: Set<string>): Promise<Map<string, ReasonMix>> {
  const out = new Map<string, ReasonMix>();
  if (!studentIds.length || to < from) return out;
  const keys = await absentKeys(tx, ctx);
  const marks = await tx.attendanceMark.findMany({
    where: { studentId: { in: studentIds }, date: { gte: from, lte: to }, archivedAt: null, statusKey: { in: [...keys] } },
    select: { studentId: true, date: true, periodNo: true, absenceReason: true },
    orderBy: { periodNo: "asc" },
  });
  const leave = await tx.leaveRequest.findMany({ where: { studentId: { in: studentIds }, status: "APPROVED", archivedAt: null, fromDate: { lte: to }, toDate: { gte: from } }, select: { studentId: true, fromDate: true, toDate: true } });
  const days = new Map<string, Map<string, string | null>>();
  for (const m of marks) {
    const k = isoDay(m.date);
    if (working && !working.has(k)) continue;
    const per = days.get(m.studentId!) ?? new Map<string, string | null>();
    if (!per.has(k) || (!per.get(k) && m.absenceReason)) per.set(k, m.absenceReason);
    days.set(m.studentId!, per);
  }
  for (const [sid, per] of days) {
    const mix: ReasonMix = { absent: 0, by: {}, coveredByLeave: 0 };
    for (const [k, reason] of per) {
      mix.absent++;
      const r = reason ?? "none";
      mix.by[r] = (mix.by[r] ?? 0) + 1;
      const dt = new Date(`${k}T00:00:00Z`);
      if (leave.some((l) => l.studentId === sid && l.fromDate <= dt && l.toDate >= dt)) mix.coveredByLeave++;
    }
    out.set(sid, mix);
  }
  return out;
}

/** "Sick" and approved leave explain an absence; "Not known yet" does not. */
export function unexplained(mix: ReasonMix | undefined) {
  return mix?.by[DEFAULT_REASON] ?? 0;
}

export function explained(mix: ReasonMix | undefined) {
  if (!mix) return 0;
  return Math.max(mix.coveredByLeave, mix.by.sick ?? 0);
}

/** "5 not known yet, 2 sick, 1 other": "Fees dispute" counts as Other for people without the school's fees. Empty when no reasons are recorded. */
export function mixText(mix: ReasonMix | undefined, seesFees: boolean) {
  if (!mix || !mix.absent) return "";
  const by: Record<string, number> = { ...mix.by };
  if (!seesFees && by[FEE_REASON]) { by.other = (by.other ?? 0) + by[FEE_REASON]; delete by[FEE_REASON]; }
  const recorded = Object.keys(by).some((k) => k !== "none");
  if (!recorded) return "";
  const order = [...ABSENCE_REASONS.map((r) => r.key as string), "none"];
  const parts = order.filter((k) => by[k]).map((k) => `${by[k]} ${k === "none" ? "not recorded" : reasonLabel(k).toLowerCase()}`);
  const leave = mix.coveredByLeave ? `; ${mix.coveredByLeave} covered by approved leave` : "";
  return `${parts.join(", ")}${leave}`;
}

/** Many absences with no reason known: at least `min` of them, and at least half of the absent days. */
export function mostlyUnexplained(mix: ReasonMix | undefined, min = 3) {
  const n = unexplained(mix);
  return Boolean(mix && n >= min && n * 2 >= mix.absent);
}

/** Mostly sick days or approved leave: at least three quarters of the absent days. */
export function mostlyExplained(mix: ReasonMix | undefined) {
  return Boolean(mix && mix.absent > 0 && explained(mix) * 4 >= mix.absent * 3);
}
