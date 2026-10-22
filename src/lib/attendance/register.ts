// Attendance Register (05 §2): one section's month as a grid, the same totals
// on screen, in the export and in the printed register (Done when 9).
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { eachDay, isoDay, monthEnd, monthLabel, monthStart } from "../staff/dates";
import { registerSections, type AttendanceAccess } from "./access";
import { schoolDays } from "./calendar";
import { roster, sectionInfo } from "./marks";
import { previousYearStart } from "./calendar-months";
import { attendanceSettings, statusList, statusesFor } from "./settings";
import { attendanceSummary, type PersonSummary } from "./summary";
import { absentKeys, absentReason, type ShownReason } from "./absence-reasons";

export type RegisterDate = { iso: string; day: number; weekday: string; off: string | null; future: boolean };
export type RegisterRow = {
  id: string; roll: number | null; name: string; admissionNo: string; days: Record<string, string>; summary: PersonSummary;
  /** Absence reasons by date, as this person may see them (absence reasons on). */
  reasons: Record<string, ShownReason>;
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * The sections this person may open in the register, in class order: for the
 * current year, or for an earlier year (everyone's for whole-school roles;
 * for teachers, the sections they had in that year).
 */
export async function registerChoices(tx: Tx, access: AttendanceAccess, yearId: string | null = access.yearId) {
  if (!yearId) return [];
  let where: Prisma.SectionWhereInput;
  if (yearId === access.yearId) {
    const allowed = registerSections(access);
    if (allowed !== "all" && allowed.length === 0) return [];
    where = { academicYearId: yearId, ...(allowed === "all" ? {} : { id: { in: allowed } }) };
  } else if (access.students === "all") {
    where = { academicYearId: yearId };
  } else {
    if (access.students === "none" || !access.staffId) return [];
    const taught = await tx.teacherAllocation.findMany({ where: { academicYearId: yearId, staffId: access.staffId, archivedAt: null }, select: { sectionId: true } });
    where = { academicYearId: yearId, OR: [{ classTeacherId: access.staffId }, { id: { in: taught.map((t) => t.sectionId).filter((x): x is string => Boolean(x)) } }] };
  }
  const rows = await tx.section.findMany({ where: { ...where, archivedAt: null }, include: { schoolClass: { select: { name: true, sortOrder: true } } } });
  rows.sort((a, b) => a.schoolClass.sortOrder - b.schoolClass.sortOrder || a.name.localeCompare(b.name));
  return rows.map((s) => ({ id: s.id, name: `${s.schoolClass.name} ${s.name}` }));
}

/**
 * The academic years the register may page through, oldest first, and the
 * month bounds: from the first month of the earliest year with sections this
 * person may see, to this month.
 */
export async function registerYears(tx: Tx, access: AttendanceAccess, today: Date) {
  const years = await tx.academicYear.findMany({ where: { archivedAt: null, startDate: { lte: today } }, orderBy: { startDate: "asc" }, select: { id: true, name: true, startDate: true, endDate: true } });
  const visible = [];
  for (const y of years) if (y.id === access.yearId || (await registerChoices(tx, access, y.id)).length) visible.push(y);
  const max = isoDay(today).slice(0, 7);
  // From the previous academic year's first month (approved CalendarMonth), or the first year this person may see.
  const prev = await previousYearStart(tx, today);
  const shown = visible.filter((y) => !prev || y.endDate >= prev);
  const first = shown[0];
  const from = first ? (prev && prev > first.startDate ? prev : first.startDate) : null;
  const min = from ? isoDay(from).slice(0, 7) : max;
  return { years: shown, bounds: { min: min > max ? max : min, max } };
}

/** "2026-10" → the first of that month, or null. */
export function readMonth(v: string | undefined | null): Date | null {
  if (!v || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return null;
  return new Date(`${v}-01T00:00:00Z`);
}

export async function registerMonth(tx: Tx, ctx: SchoolContext, input: { sectionId: string; month: Date; today: Date; status?: string | null; reasons?: { seesFees: boolean } | null }) {
  const section = await sectionInfo(tx, input.sectionId);
  if (!section) return null;
  const from = monthStart(input.month);
  const to = monthEnd(input.month);
  const settings = await attendanceSettings(tx, ctx);
  const [students, days, sum, list] = await Promise.all([
    tx.academicYear.findUnique({ where: { id: section.academicYearId }, select: { endDate: true } })
      .then((y) => roster(tx, section.id, section.academicYearId, settings.registerOrder, { pastYear: Boolean(y && y.endDate < input.today) })),
    schoolDays(tx, ctx, from, to, section.campusId, { classId: section.classId }),
    attendanceSummary(tx, ctx, { sectionId: section.id, from, to, today: input.today, campusId: section.campusId }),
    statusList(tx, ctx),
  ]);
  // Students who left during the month still appear with their marks.
  const known = new Set(students.map((s) => s.studentId));
  const extraIds = [...sum.people.keys()].filter((id) => !known.has(id) && (sum.people.get(id)?.markedDays ?? 0) > 0);
  const extra = extraIds.length
    ? await tx.student.findMany({ where: { id: { in: extraIds } }, select: { id: true, fullName: true, admissionNo: true } })
    : [];
  const people = [
    ...students.map((s) => ({ id: s.studentId, roll: s.rollNo, name: s.name, admissionNo: s.admissionNo })),
    ...extra.map((s) => ({ id: s.id, roll: null, name: `${s.fullName} (left)`, admissionNo: s.admissionNo })),
  ];
  // Absence reasons (when the school records them): the first reason recorded for each absent day.
  const reasonsBy = new Map<string, Record<string, ShownReason>>();
  if (input.reasons) {
    const keys = await absentKeys(tx, ctx);
    const marks = await tx.attendanceMark.findMany({ where: { sectionId: section.id, date: { gte: from, lte: to }, archivedAt: null, studentId: { not: null }, statusKey: { in: [...keys] } }, orderBy: { periodNo: "asc" }, select: { studentId: true, date: true, absenceReason: true, absenceNote: true, reasonSource: true } });
    for (const m of marks) {
      const per = reasonsBy.get(m.studentId!) ?? {};
      const k = isoDay(m.date);
      // A reason saved in any period wins; an absence with none is "Not known yet" (the dot).
      if (!per[k] || (per[k].key === "not-known" && m.absenceReason)) per[k] = absentReason(m, input.reasons.seesFees);
      reasonsBy.set(m.studentId!, per);
    }
  }
  let rows: RegisterRow[] = people.map((p) => ({
    ...p,
    reasons: reasonsBy.get(p.id) ?? {},
    days: Object.fromEntries(sum.days.get(p.id) ?? new Map()),
    summary: sum.people.get(p.id) ?? { workingDays: sum.workingDays, markedDays: 0, countedDays: 0, present: 0, absent: 0, late: 0, leave: 0, byStatus: {}, percent: null },
  }));
  if (input.status) rows = rows.filter((r) => (r.summary.byStatus[input.status!] ?? 0) > 0);
  const dates: RegisterDate[] = eachDay(from, to).map((d) => {
    const info = days.info(d);
    return { iso: isoDay(d), day: d.getUTCDate(), weekday: WEEKDAYS[d.getUTCDay()], off: info.on ? null : info.title, future: d > input.today };
  });
  return {
    section, label: monthLabel(from), month: isoDay(from).slice(0, 7), from, to, dates, rows,
    workingDays: sum.workingDays, overall: sum.overall,
    statuses: statusesFor(list, "students"),
  };
}

export type RegisterMonth = NonNullable<Awaited<ReturnType<typeof registerMonth>>>;
