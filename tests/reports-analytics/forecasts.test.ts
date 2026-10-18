// Looking ahead (forecasts.ts): the arithmetic on its own, then the stored
// signals for real schools: attendance that will end below the threshold,
// fees likely to come late, seats likely to stay empty; leaders told once;
// nothing changes until a person decides.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { aboutRupees, payHabit, projectAttendance, projectNext, refreshForecasts, seatForecast, forecastsFor } from "@/lib/reports/forecasts";
import { aiSignals, decideAiSignal, refreshFlags } from "@/lib/reports/warnings";
import { reportAccess } from "@/lib/reports/access";
import { viewerOf } from "@/lib/reports/run";
import type { ReportViewer } from "@/lib/reports/types";
import { collect, dues, feature, makeFeeSchool, R, type FeeSchool } from "../fees/fixture";
import { at, d, makeAttendanceSchool, type Fixture } from "../attendance/fixture";

async function viewer(schoolId: string, userId: string): Promise<ReportViewer> {
  const v = await withSchool({ schoolId, userId }, (tx) => viewerOf(tx, userId, schoolId));
  if (!v) throw new Error("no access");
  return v;
}

/** Monday to Friday from `from` to `to`, as YYYY-MM-DD. */
function weekdays(from: string, to: string) {
  const out: string[] = [];
  for (let t = d(from).getTime(); t <= d(to).getTime(); t += 86_400_000) {
    const x = new Date(t);
    if (x.getUTCDay() >= 1 && x.getUTCDay() <= 5 && x.toISOString().slice(0, 10) !== "2026-10-02") out.push(x.toISOString().slice(0, 10));
  }
  return out;
}

describe("the arithmetic", () => {
  it("projects end-of-year attendance from the recent pace", () => {
    // 30 of 38 days so far (78.9%), 10 of 18 lately: 100 days left at 55.6% end near 62%.
    const end = projectAttendance({ present: 30, counted: 38, recentPresent: 10, recentCounted: 18, daysLeft: 100 })!;
    expect(end).toBeGreaterThan(61);
    expect(end).toBeLessThan(63);
    expect(projectAttendance({ present: 0, counted: 0, recentPresent: 0, recentCounted: 0, daysLeft: 10 })).toBeNull();
  });

  it("projects the next exam from the average change, within 0 to 100", () => {
    expect(projectNext([70, 60])).toBe(50);
    expect(projectNext([80, 70, 66])).toBe(59);
    expect(projectNext([10, 2])).toBe(0);
    expect(projectNext([55])).toBeNull();
  });

  it("calls a student usually late only from two or more dues, on the middle value", () => {
    expect(payHabit([40])).toEqual({ usuallyLate: false, typical: null });
    expect(payHabit([0, 3, 40])).toEqual({ usuallyLate: false, typical: 3 });
    expect(payHabit([20, 35])).toEqual({ usuallyLate: true, typical: 28 });
  });

  it("counts the open pipeline only when the school has its own joining rate", () => {
    expect(seatForecast({ seats: 40, inClass: 20, approved: 2, pipeline: 10, joinRate: null })).toEqual({ expected: 22, fromPipeline: 0, empty: 18 });
    expect(seatForecast({ seats: 40, inClass: 30, approved: 5, pipeline: 20, joinRate: 0.4 })).toEqual({ expected: 43, fromPipeline: 8, empty: -3 });
  });
});

let att: Fixture;
let fee: FeeSchool;
const ATT_NOW = at("2026-10-09", "20:00");
const FEE_NOW = at("2026-09-20", "20:00");

beforeAll(async () => {
  att = await makeAttendanceSchool("Looking Ahead Attendance School");
  const actx = { schoolId: att.school.id, userId: null };
  for (const k of ["ai-assistant", "ai-forecasts"]) await feature(actx, k);
  // 5 A: Diya was present every day until 25 September, then away; the others were present every day.
  const days = [...weekdays("2026-08-03", "2026-08-28"), ...weekdays("2026-09-14", "2026-10-09")];
  await withSchool(actx, (tx) => tx.attendanceMark.createMany({
    data: days.flatMap((day) => att.studentsA.map((s, i) => ({
      schoolId: att.school.id, academicYearId: att.year.id, studentId: s.id, sectionId: att.sectionA.id, date: d(day), periodNo: 0,
      statusKey: i === 1 && day > "2026-09-25" ? "absent" : "present",
    }))),
  }));

  fee = await makeFeeSchool();
  for (const k of ["ai-assistant", "ai-forecasts"]) await feature(fee.ctx, k);
  // Ravi pays April and July on time; Sita pays both about six weeks late; Anil has not paid.
  const pay = async (studentId: string, dueId: string, date: string) => {
    await collect(fee.pctx, { studentId, dueIds: [dueId], amountPaise: R(6000), confirmDuplicate: true, paidAt: at(date, "11:00") }, ["principal"]);
  };
  const ravi = await dues(fee.ctx, fee.ravi.id);
  await pay(fee.ravi.id, ravi[0].id, "2026-04-03");
  await pay(fee.ravi.id, ravi[1].id, "2026-07-02");
  const sita = await dues(fee.ctx, fee.sita.id);
  await pay(fee.sita.id, sita[0].id, "2026-05-12");
  await pay(fee.sita.id, sita[1].id, "2026-08-20");
}, 180_000);

describe("Looking ahead for a real school", () => {
  it("finds a student above the threshold today who will end the year below it at the recent pace", async () => {
    const ctx = { schoolId: att.school.id, userId: null };
    const r = await withSchool(ctx, (tx) => refreshForecasts(tx, ctx, ATT_NOW, { force: true }));
    expect(r.skipped).toBe(false);
    const list = await withSchool(ctx, (tx) => forecastsFor(tx, { fees: true, finance: true }));
    const att1 = list.filter((f) => f.area === "attendance");
    expect(att1.map((f) => f.studentId)).toEqual([att.studentsA[1].id]);
    expect(att1[0].title).toContain("Diya Reddy");
    expect(att1[0].body).toMatch(/in the last 30 days/);
    expect(att1[0].source).toContain("threshold");
  });

  it("tells the Principal and School Admin once, not again on the next run", async () => {
    const ctx = { schoolId: att.school.id, userId: null };
    const count = () => withSchool(ctx, (tx) => tx.notification.count({ where: { type: "looking-ahead", userLoginId: { in: [att.principal.id, att.admin.id] } } }));
    expect(await count()).toBe(2);
    await withSchool(ctx, (tx) => refreshForecasts(tx, ctx, new Date(ATT_NOW.getTime() + 4 * 3_600_000)));
    expect(await count()).toBe(2);
    // Teachers are not told.
    expect(await withSchool(ctx, (tx) => tx.notification.count({ where: { type: "looking-ahead", userLoginId: att.teacherA.id } }))).toBe(0);
  });

  it("a class teacher sees the items about students of their own section, and only those (TEACHING-15)", async () => {
    const mine = await viewer(att.school.id, att.teacherA.id);
    const a = reportAccess(mine);
    expect(a.ai).toMatchObject({ forecasts: true, forecastScope: "own", insights: false });
    const signals = await withSchool(mine.ctx, (tx) => aiSignals(tx, mine, a, ATT_NOW));
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((x) => x.kind === "prediction" && att.studentsA.some((s) => s.id === x.studentId))).toBe(true);
    expect(signals.some((x) => x.studentId === att.studentsA[1].id)).toBe(true);
    // The class teacher of 5 B sees none of 5 A's.
    const other = await viewer(att.school.id, att.teacherB.id);
    const b = reportAccess(other);
    expect(await withSchool(other.ctx, (tx) => aiSignals(tx, other, b, ATT_NOW))).toEqual([]);
  });

  it("changes nothing until a person adds it for review; the flag then stays until a person closes it", async () => {
    const principal = await viewer(att.school.id, att.principal.id);
    const a = reportAccess(principal);
    expect(a.ai.forecasts).toBe(true);
    const flagsBefore = await withSchool(principal.ctx, (tx) => tx.riskFlag.count({ where: { studentId: att.studentsA[1].id } }));
    expect(flagsBefore).toBe(0);
    const signals = await withSchool(principal.ctx, (tx) => aiSignals(tx, principal, a, ATT_NOW));
    const s = signals.find((x) => x.kind === "prediction" && x.studentId === att.studentsA[1].id)!;
    expect(s.area).toBe("attendance");
    await withSchool(principal.ctx, (tx) => decideAiSignal(tx, principal, a, s.key, "FLAGGED", ATT_NOW));
    const ctx = { schoolId: att.school.id, userId: null };
    await withSchool(ctx, (tx) => refreshFlags(tx, ctx, new Date(ATT_NOW.getTime() + 3_600_000)));
    const flag = await withSchool(principal.ctx, (tx) => tx.riskFlag.findFirstOrThrow({ where: { studentId: att.studentsA[1].id } }));
    expect(flag).toMatchObject({ area: "attendance", strength: "WATCH", closedAt: null });
    // Decided: no longer offered.
    const again = await withSchool(principal.ctx, (tx) => aiSignals(tx, principal, a, ATT_NOW));
    expect(again.some((x) => x.key === s.key)).toBe(false);
    const audit = await withSchool(principal.ctx, (tx) => tx.auditLogEntry.count({ where: { recordType: "AI Signal", action: "suggestion-added" } }));
    expect(audit).toBe(1);
  });

  it("says which dues may come late, from each student's own paying habit, only to people with the school's fees", async () => {
    const ctx = { schoolId: fee.school.id, userId: null };
    await withSchool(ctx, (tx) => refreshForecasts(tx, ctx, FEE_NOW, { force: true }));
    const all = await withSchool(ctx, (tx) => forecastsFor(tx, { fees: true, finance: true }));
    const late = all.find((f) => f.area === "fees")!;
    expect(late).toBeTruthy();
    // Sita (about 6 weeks late twice) and Anil (nothing paid) are named; Ravi, who pays on time, is not.
    expect(late.body).toContain("Sita Rao");
    expect(late.body).toContain("Anil Das");
    expect(late.body).not.toContain("Ravi Kumar");
    expect(late.title).toContain("₹12,000");
    const noFees = await withSchool(ctx, (tx) => forecastsFor(tx, { fees: false, finance: false }));
    expect(noFees.some((f) => f.area === "fees")).toBe(false);
  });

  it("warns that seats may stay empty, showing the numbers it used", async () => {
    const ctx = { schoolId: fee.school.id, userId: null };
    const all = await withSchool(ctx, (tx) => forecastsFor(tx, { fees: true, finance: true }));
    const seats = all.find((f) => f.area === "admissions")!;
    expect(seats.title).toBe("About 37 of 40 seats in Class 5 may stay empty in 2026-27");
    expect(seats.body).toContain("3 already in the class");
  });

  it("plain words: estimates in whole rupees, and a proper list of areas (TEACHING-20)", async () => {
    expect(aboutRupees(BigInt(99234654))).toBe("₹9,92,347");
    expect(aboutRupees(BigInt(50000))).toBe("₹500");
    const ctx = { schoolId: att.school.id, userId: null };
    const student = att.studentsA[3];
    await withSchool(ctx, (tx) => tx.riskFlag.createMany({ data: ["attendance", "marks", "fees"].map((area) => ({ schoolId: att.school.id, studentId: student.id, academicYearId: att.year.id, sectionId: att.sectionA.id, area, strength: "WATCH", reason: `Test ${area}`, basis: "Test" })) }));
    await withSchool(ctx, (tx) => refreshForecasts(tx, ctx, new Date(ATT_NOW.getTime() + 8 * 3_600_000), { force: true }));
    const list = await withSchool(ctx, (tx) => forecastsFor(tx, { fees: true, finance: true }));
    const leaving = list.find((f) => f.area === "students" && f.studentId === student.id)!;
    expect(leaving.body).toContain("open early warnings in 3 areas (attendance, marks and fees)");
    expect(leaving.body).not.toContain(" and marks and ");
  });

  it("does nothing for a school that has not switched Forecasts on", async () => {
    const ctx = { schoolId: fee.school.id, userId: null };
    await feature(fee.ctx, "ai-forecasts", false);
    const r = await withSchool(ctx, (tx) => refreshForecasts(tx, ctx, FEE_NOW, { force: true }));
    expect(r.skipped).toBe(true);
    await feature(fee.ctx, "ai-forecasts", true);
  });
});
