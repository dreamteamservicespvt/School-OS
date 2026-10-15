// Lists shared by the Co-curricular & Sports page and its export and print
// routes, so what is printed or exported is what is on screen.
import "server-only";

import type { Tx } from "@/lib/db";
import { dateWhere, type DayRange } from "@/lib/periods";
import { placeOrder, placesOf } from "@/lib/events/places";

export const LEVELS_ALL = "all";

/** Achievements in the dates, for a level and a search, with each student's name, class and credits. */
export async function achievementList(tx: Tx, range: DayRange | null, opts: { level?: string; q?: string; ids?: string[] } = {}) {
  const rows = await tx.achievement.findMany({
    where: { archivedAt: null, ...(opts.ids ? { id: { in: opts.ids } } : range ? { date: dateWhere(range) } : {}), ...(opts.level && opts.level !== LEVELS_ALL ? { level: opts.level } : {}) },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 2000,
  });
  const studentIds = [...new Set(rows.map((r) => r.studentId))];
  const [students, credits] = await Promise.all([
    tx.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, fullName: true, admissionNo: true } }),
    rows.length ? tx.activityCreditEntry.groupBy({ by: ["achievementId"], where: { achievementId: { in: rows.map((r) => r.id) } }, _sum: { points: true } }) : Promise.resolve([]),
  ]);
  // Each student's class in the year of the achievement.
  const years = [...new Set(rows.map((r) => r.academicYearId))];
  const places = new Map<string, string>();
  const rolls = new Map<string, number | null>();
  for (const y of years) {
    const m = await placesOf(tx, [...new Set(rows.filter((r) => r.academicYearId === y).map((r) => r.studentId))], y);
    for (const [k, v] of m) { places.set(`${y}:${k}`, v.label.replace(/^Class /, "")); rolls.set(`${y}:${k}`, v.rollNo); }
  }
  const byId = new Map(students.map((s) => [s.id, s]));
  const cr = new Map(credits.map((c) => [c.achievementId, c._sum.points ?? 0]));
  const k = (opts.q ?? "").trim().toLowerCase();
  return rows.map((a) => ({
    ...a, student: byId.get(a.studentId)?.fullName ?? "Student", admissionNo: byId.get(a.studentId)?.admissionNo ?? "",
    place: places.get(`${a.academicYearId}:${a.studentId}`) ?? "", rollNo: rolls.get(`${a.academicYearId}:${a.studentId}`) ?? null, credits: cr.get(a.id) ?? 0,
  })).filter((a) => !k || `${a.student} ${a.activity} ${a.kind} ${a.place}`.toLowerCase().includes(k));
}
export type AchievementRow = Awaited<ReturnType<typeof achievementList>>[number];

/** Students studying this year, for the pickers: name and class, in class and roll order. */
export async function pickStudents(tx: Tx, yearId: string, only?: string[]) {
  const enrol = await tx.enrolment.findMany({ where: { academicYearId: yearId, archivedAt: null, status: "STUDYING", ...(only ? { studentId: { in: only } } : {}) }, select: { studentId: true } });
  const ids = enrol.map((e) => e.studentId);
  const [students, places] = await Promise.all([
    tx.student.findMany({ where: { id: { in: ids }, archivedAt: null }, select: { id: true, fullName: true } }),
    placesOf(tx, ids, yearId),
  ]);
  return students
    .sort((a, b) => placeOrder(places.get(a.id), places.get(b.id)) || a.fullName.localeCompare(b.fullName))
    .map((s) => ({ id: s.id, name: s.fullName, place: places.get(s.id)?.label.replace(/^Class /, "") ?? "" }));
}

/** Staff who can lead a club or coach a team. */
export async function staffOptions(tx: Tx) {
  const staff = await tx.staff.findMany({ where: { archivedAt: null, status: "ACTIVE" }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" }, take: 500 });
  return staff.map((s) => ({ value: s.id, label: s.fullName }));
}
