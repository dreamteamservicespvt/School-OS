// Attendance Register (05 §2): one section's month as a grid, the same totals
// on screen, in the export and in the printed register (Done when 9).
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { eachDay, isoDay, monthEnd, monthLabel, monthStart } from "../staff/dates";
import { registerSections, type AttendanceAccess } from "./access";
import { schoolDays } from "./calendar";
import { roster, sectionInfo } from "./marks";
import { attendanceSettings, statusList, statusesFor } from "./settings";
import { attendanceSummary, type PersonSummary } from "./summary";

export type RegisterDate = { iso: string; day: number; weekday: string; off: string | null; future: boolean };
export type RegisterRow = { id: string; roll: number | null; name: string; admissionNo: string; days: Record<string, string>; summary: PersonSummary };

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** The sections this person may open in the register, in class order, for the current year. */
export async function registerChoices(tx: Tx, access: AttendanceAccess) {
  const allowed = registerSections(access);
  if (!access.yearId || (allowed !== "all" && allowed.length === 0)) return [];
  const rows = await tx.section.findMany({
    where: { academicYearId: access.yearId, archivedAt: null, ...(allowed === "all" ? {} : { id: { in: allowed } }) },
    include: { schoolClass: { select: { name: true, sortOrder: true } } },
  });
  rows.sort((a, b) => a.schoolClass.sortOrder - b.schoolClass.sortOrder || a.name.localeCompare(b.name));
  return rows.map((s) => ({ id: s.id, name: `${s.schoolClass.name} ${s.name}` }));
}

/** "2026-10" → the first of that month, or null. */
export function readMonth(v: string | undefined | null): Date | null {
  if (!v || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return null;
  return new Date(`${v}-01T00:00:00Z`);
}

export async function registerMonth(tx: Tx, ctx: SchoolContext, input: { sectionId: string; month: Date; today: Date; status?: string | null }) {
  const section = await sectionInfo(tx, input.sectionId);
  if (!section) return null;
  const from = monthStart(input.month);
  const to = monthEnd(input.month);
  const settings = await attendanceSettings(tx, ctx);
  const [students, days, sum, list] = await Promise.all([
    roster(tx, section.id, section.academicYearId, settings.registerOrder),
    schoolDays(tx, ctx, from, to, section.campusId),
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
  let rows: RegisterRow[] = people.map((p) => ({
    ...p,
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
