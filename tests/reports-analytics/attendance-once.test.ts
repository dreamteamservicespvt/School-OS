// Attendance is flagged once (gap list P1.6): the Attendance Flag A4 raises is
// the one record of a student's attendance concern. Early Warnings lists it
// (no second Risk Flag), an older attendance Risk Flag joins it with its
// review, a review in Early Warnings shows in Attendance and on the Dashboard,
// a flag that clears in Attendance closes in Early Warnings, the Dashboard
// counts the child once (on the Early Warnings card, which says what it
// counts), and an open Attendance Flag counts as the attendance concern when
// marks are a concern too (two areas at once).
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { buildHome } from "@/lib/dashboard/compose";
import type { Current } from "@/lib/current";
import { saveClassAttendance } from "@/lib/attendance/marks";
import { afterAttendanceSaved } from "@/lib/attendance/alerts";
import { studentAttendanceTab } from "@/lib/attendance/integrations";
import { CLEARED_REASON } from "@/lib/attendance/flags";
import { reportAccess } from "@/lib/reports/access";
import { viewerOf } from "@/lib/reports/run";
import { listFlags, refreshFlags, reviewFlag } from "@/lib/reports/warnings";
import { JOINED } from "@/lib/reports/attendance-rows";
import { forecastsFor, refreshForecasts } from "@/lib/reports/forecasts";
import type { ReportViewer } from "@/lib/reports/types";
import { feature } from "../fees/fixture";
import { accessFor, as, at, d, makeAttendanceSchool, TZ, type Fixture } from "../attendance/fixture";

const DAYS = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"];
const NOW = at("2026-10-09", "18:00");
let f: Fixture;
let sys: { schoolId: string; userId: null };

async function reportViewer(userId: string): Promise<ReportViewer> {
  const v = await withSchool({ schoolId: f.school.id, userId }, (tx) => viewerOf(tx, userId, f.school.id));
  if (!v) throw new Error("no access");
  return v;
}
async function home(userId: string) {
  const view = await accessIn(userId, f.school.id);
  const viewer = { ...view!, ctx: { schoolId: f.school.id, userId }, user: { id: userId, displayName: "Test" }, menu: [], schools: [], session: null } as unknown as Current;
  return buildHome(viewer, { now: at("2026-10-09", "19:00") });
}
async function open(userId: string, studentId: string, status: "open" | "CLOSED" = "open") {
  const v = await reportViewer(userId);
  const { list } = await withSchool(v.ctx, (tx) => listFlags(tx, v, reportAccess(v), { status, area: "all", q: "", raisedFrom: null, raisedTo: null }));
  return list.filter((r) => r.studentId === studentId);
}
async function mark(section: "A" | "B", day: string, absent: string[]) {
  const teacher = section === "A" ? f.teacherA : f.teacherB;
  const students = section === "A" ? f.studentsA : f.studentsB;
  const access = await accessFor(f, teacher.id);
  await withSchool(as(f, teacher.id), (tx) => saveClassAttendance(tx, as(f, teacher.id), access, {
    sectionId: (section === "A" ? f.sectionA : f.sectionB).id, date: d(day), periodNo: 0, timeZone: TZ, now: at(day, "09:00"),
    entries: students.map((s) => ({ studentId: s.id, statusKey: absent.includes(s.id) ? "absent" : "present" })),
  }));
}

beforeAll(async () => {
  f = await makeAttendanceSchool("Flagged Once School");
  sys = { schoolId: f.school.id, userId: null };
  // 5 A: Aarav is away on four of the five days (20%), never three in a row; the others are present.
  const aarav = f.studentsA[0].id;
  for (const day of DAYS) await mark("A", day, day === "2026-10-07" ? [] : [aarav]);
  // Before this change Early Warnings raised its own flag: the hourly check runs before A4 has flagged him.
  await withSchool(sys, (tx) => refreshFlags(tx, sys, NOW));
}, 180_000);

describe("Attendance is flagged once", () => {
  it("joins the older Early Warnings flag to the Attendance Flag, with its review, and never deletes it", async () => {
    const aarav = f.studentsA[0].id;
    const teacher = await reportViewer(f.teacherA.id);
    const old = await withSchool(sys, (tx) => tx.riskFlag.findFirstOrThrow({ where: { studentId: aarav, area: "attendance", closedAt: null } }));
    await withSchool(teacher.ctx, (tx) => reviewFlag(tx, teacher, reportAccess(teacher), old.id, { decision: "REVIEWED", note: "Called the parent; he has had fever.", action: null }, NOW));

    // A4 runs: the Attendance Flag is raised and is now the student's one attendance row.
    const r = await withSchool(sys, (tx) => afterAttendanceSaved(tx, sys, { sectionId: f.sectionA.id, date: DAYS[4] }));
    expect(r.flagged).toBe(1);
    const af = await withSchool(sys, (tx) => tx.attendanceFlag.findFirstOrThrow({ where: { studentId: aarav, kind: "below-threshold" } }));
    const before = await open(f.principal.id, aarav);
    expect(before.map((x) => [x.source, x.id])).toEqual([["attendance", af.id]]);

    // The next check joins the old flag: closed with the reason and the link, the review carried over.
    const run = await withSchool(sys, (tx) => refreshFlags(tx, sys, new Date(NOW.getTime() + 3_600_000)));
    expect(run.joined).toBe(1);
    const joined = await withSchool(sys, (tx) => tx.riskFlag.findUniqueOrThrow({ where: { id: old.id }, include: { reviews: true } }));
    expect(joined).toMatchObject({ status: "CLOSED", closedReason: JOINED, attendanceFlagId: af.id });
    expect(joined.reviews.map((x) => x.attendanceFlagId)).toEqual([af.id]);
    const after = await withSchool(sys, (tx) => tx.attendanceFlag.findUniqueOrThrow({ where: { id: af.id }, include: { reviews: true } }));
    expect(after.status).toBe("REVIEWED");
    expect(after.reviews.map((x) => x.note)).toEqual(["Called the parent; he has had fever."]);
    const audit = await withSchool(sys, (tx) => tx.auditLogEntry.findMany({ where: { recordId: { in: [old.id, af.id] } }, select: { action: true, recordType: true } }));
    expect(audit).toEqual(expect.arrayContaining([{ action: "joined-attendance-flag", recordType: "Risk Flag" }, { action: "review-carried-over", recordType: "Attendance Flag" }]));

    // Safe to run twice: nothing more is joined and no new Risk Flag is raised for him.
    expect((await withSchool(sys, (tx) => refreshFlags(tx, sys, new Date(NOW.getTime() + 7_200_000)))).joined).toBe(0);
    expect(await withSchool(sys, (tx) => tx.riskFlag.count({ where: { studentId: aarav, closedAt: null } }))).toBe(0);
  });

  it("shows one child below the threshold once on the Dashboard and once in Early Warnings, linked", async () => {
    const aarav = f.studentsA[0].id;
    const af = await withSchool(sys, (tx) => tx.attendanceFlag.findFirstOrThrow({ where: { studentId: aarav, kind: "below-threshold" } }));
    // Early Warnings: one row, the Attendance Flag itself, with the review on it.
    const rows = await open(f.principal.id, aarav);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: af.id, source: "attendance", attendanceFlagIds: [af.id], area: "attendance", strength: "ACT_NOW", status: "REVIEWED" });
    expect(rows[0].reason).toBe("Attendance 20% this year (threshold 75%)");
    expect(rows[0].reviews).toHaveLength(1);

    // Dashboard: the Early Warnings card counts him once (20% is well below the threshold: Act now),
    // saying what it counts; the Attendance card does not count him again for people who see Early Warnings.
    for (const who of [f.principal.id, f.teacherA.id]) {
      const h = await home(who);
      const card = h.attention.find((x) => x.id === "reports.early-warnings");
      expect(card, who).toMatchObject({ title: "Early warnings: 1 student needs a closer look: 1 attendance (students counted once, from attendance and marks)", href: "/reports-analytics/early-warnings?strength=ACT_NOW&period=all" });
      expect(h.attention.some((x) => x.id === "attendance.below-threshold"), who).toBe(false);
    }
  });

  it("a review in Early Warnings shows in Attendance; closed as not a concern, it leaves the Dashboard and is not raised again", async () => {
    const aarav = f.studentsA[0].id;
    const teacher = await reportViewer(f.teacherA.id);
    const a = reportAccess(teacher);
    const [row] = await open(f.teacherA.id, aarav);
    const planned = await withSchool(teacher.ctx, (tx) => reviewFlag(tx, teacher, a, row.id, { decision: "ACTION_PLANNED", note: "Meeting the parents on Monday.", action: "meet-parent" }, NOW));
    expect(planned.status).toBe("ACTION_PLANNED");
    const tab = await withSchool(sys, (tx) => studentAttendanceTab(tx, sys, aarav, d("2026-10-09")));
    expect(tab.openFlags).toEqual([expect.objectContaining({ id: row.id, status: "ACTION_PLANNED", action: "Meet the parent with the class teacher" })]);
    expect(await withSchool(sys, (tx) => tx.auditLogEntry.count({ where: { recordType: "Attendance Flag", recordId: row.id, action: "flag-reviewed" } }))).toBe(1);

    await withSchool(teacher.ctx, (tx) => reviewFlag(tx, teacher, a, row.id, { decision: "NOT_A_CONCERN", note: "Long illness; the doctor's note is with the office.", action: null }, NOW));
    expect(await open(f.teacherA.id, aarav)).toHaveLength(0);
    expect((await open(f.teacherA.id, aarav, "CLOSED")).filter((x) => x.source === "attendance").map((x) => x.closedReason)).toEqual(["Long illness; the doctor's note is with the office."]);
    expect((await home(f.principal.id)).attention.some((x) => x.id === "attendance.below-threshold" || x.id === "reports.early-warnings")).toBe(false);
    expect((await withSchool(sys, (tx) => studentAttendanceTab(tx, sys, aarav, d("2026-10-09")))).openFlags).toEqual([]);

    // Still below the threshold: neither Attendance nor Early Warnings raises it again in this drop.
    expect((await withSchool(sys, (tx) => afterAttendanceSaved(tx, sys, { sectionId: f.sectionA.id, date: DAYS[4] }))).flagged).toBe(0);
    await withSchool(sys, (tx) => refreshFlags(tx, sys, new Date(NOW.getTime() + 10_800_000)));
    expect(await withSchool(sys, (tx) => tx.riskFlag.count({ where: { studentId: aarav, closedAt: null } }))).toBe(0);
    expect(await open(f.principal.id, aarav)).toHaveLength(0);
  });

  it("a flag that clears in Attendance closes in Early Warnings", async () => {
    // 5 B: Bhavya is away three days in a row (and below 75%), then comes back on Saturday.
    const bhavya = f.studentsB[0].id;
    for (const day of DAYS) await mark("B", day, day >= "2026-10-07" ? [bhavya] : []);
    await withSchool(sys, (tx) => afterAttendanceSaved(tx, sys, { sectionId: f.sectionB.id, date: DAYS[4] }));
    const both = await open(f.principal.id, bhavya);
    expect(both).toHaveLength(1);
    expect(both[0].attendanceFlagIds).toHaveLength(2);
    expect(both[0].signals.map((s) => s.text)).toEqual([expect.stringMatching(/^Attendance 40% this year/), expect.stringMatching(/^Absent 3 school days in a row/)]);

    await mark("B", "2026-10-10", []);
    const r = await withSchool(sys, (tx) => afterAttendanceSaved(tx, sys, { sectionId: f.sectionB.id, date: "2026-10-10" }));
    expect(r.cleared).toBe(1);
    const streak = await withSchool(sys, (tx) => tx.attendanceFlag.findFirstOrThrow({ where: { studentId: bhavya, kind: "absent-streak" } }));
    expect(streak).toMatchObject({ status: "CLOSED", closedReason: CLEARED_REASON });
    expect(await withSchool(sys, (tx) => tx.auditLogEntry.count({ where: { recordType: "Attendance Flag", recordId: streak.id, action: "cleared" } }))).toBe(1);
    const closed = await open(f.principal.id, bhavya, "CLOSED");
    expect(closed.map((x) => [x.id, x.closedReason])).toEqual([[streak.id, CLEARED_REASON]]);
    // Still below the threshold: that flag stays open, alone in her row.
    const still = await open(f.principal.id, bhavya);
    expect(still.map((x) => x.attendanceFlagIds.length)).toEqual([1]);
    expect(still[0].id).not.toBe(streak.id);
  });

  it("counts an open Attendance Flag as the attendance concern when marks are a concern too; two open flags alone are not a leaving signal", async () => {
    const bhavya = f.studentsB[0].id;
    for (const k of ["ai-assistant", "ai-forecasts"]) await feature(sys, k);
    await withSchool(sys, (tx) => tx.riskFlag.create({ data: { schoolId: f.school.id, studentId: bhavya, academicYearId: f.year.id, sectionId: f.sectionB.id, area: "marks", strength: "WATCH", reason: "FA 1: below the pass mark in Maths", basis: "Suggestion · based on FA 1 marks" } }));
    // Early Warnings: two areas at once, each naming the other.
    const rows = await open(f.principal.id, bhavya);
    expect(rows.find((r) => r.area === "attendance")!.reason).toMatch(/Also a concern: marks/);
    // Looking ahead: two open flags are not, on their own, a sign the family may be leaving (combined evidence only).
    await withSchool(sys, (tx) => refreshForecasts(tx, sys, at("2026-10-10", "20:00"), { force: true }));
    const leaving = (await withSchool(sys, (tx) => forecastsFor(tx, { fees: true, finance: true }))).filter((x) => x.area === "students" && x.studentId === bhavya);
    expect(leaving).toHaveLength(0);
  });
});
