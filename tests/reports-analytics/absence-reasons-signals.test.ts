// Absence reasons in Early Warnings and Looking ahead (gap list P1.8): the
// basis shows the reason mix; many "Not known yet" absences are a stronger
// signal than sick days or approved leave; "Fees dispute" absences are fee
// signals (Watch, like every fee flag), seen only by people with the school's fees.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { listFlags, refreshFlags } from "@/lib/reports/warnings";
import { forecastsFor, LEAVING_WITH_FEES, refreshForecasts } from "@/lib/reports/forecasts";
import { reportAccess } from "@/lib/reports/access";
import { viewerOf } from "@/lib/reports/run";
import type { ReportViewer } from "@/lib/reports/types";
import { feature } from "../fees/fixture";
import { at, d, makeAttendanceSchool, type Fixture } from "../attendance/fixture";

let f: Fixture;
const NOW = at("2026-10-16", "20:00");

async function viewer(userId: string): Promise<ReportViewer> {
  const v = await withSchool({ schoolId: f.school.id, userId }, (tx) => viewerOf(tx, userId, f.school.id));
  if (!v) throw new Error("no access");
  return v;
}

/** The 25 school days from 11-09-2026 to 16-10-2026 (2 October is a holiday). */
function schoolDays() {
  const out: string[] = [];
  for (let t = d("2026-09-11").getTime(); t <= d("2026-10-16").getTime(); t += 86_400_000) {
    const x = new Date(t);
    const iso = x.toISOString().slice(0, 10);
    if (x.getUTCDay() >= 1 && x.getUTCDay() <= 5 && iso !== "2026-10-02") out.push(iso);
  }
  return out;
}

beforeAll(async () => {
  f = await makeAttendanceSchool("Absence Reasons Signals School");
  const ctx = { schoolId: f.school.id, userId: null };
  for (const k of ["ai-assistant", "ai-forecasts", "attendance-absence-reasons"]) await feature(ctx, k);
  const days = schoolDays();
  expect(days).toHaveLength(25);
  const absentLast = days.slice(-6); // 6 of 25 absent: 76%, between the 75% threshold and the 80% watch line
  // Each student: their absent days' reasons, newest last.
  const plan: Record<number, string[] | null> = {
    0: ["not-known", "not-known", "not-known", "not-known", "not-known", "not-known"], // X
    1: ["sick", "sick", "sick", "sick", "sick", "sick"], // Y
    2: ["sick", "sick", "sick", "sick", "sick", "sick"], // Z, with an absent streak
    3: ["fees-dispute"], // W: one day only
    4: ["not-known", "not-known", "not-known", "not-known", "not-known", "fees-dispute"], // V
  };
  await withSchool(ctx, async (tx) => {
    await tx.attendanceMark.createMany({
      data: days.flatMap((day) => f.studentsA.map((s, i) => {
        const reasons = plan[i] ?? [];
        const k = (i === 3 ? days.slice(-1) : absentLast).indexOf(day);
        const absent = k >= 0 && k < reasons.length;
        return {
          schoolId: f.school.id, academicYearId: f.year.id, studentId: s.id, sectionId: f.sectionA.id, date: d(day), periodNo: 0,
          statusKey: absent ? "absent" : "present", absenceReason: absent ? reasons[k] : null, reasonSource: absent ? "later" : null,
        };
      })),
    });
    await tx.attendanceFlag.create({ data: { schoolId: f.school.id, studentId: f.studentsA[2].id, kind: "absent-streak", value: 6, raisedOn: d("2026-10-16") } });
  });
  await withSchool(ctx, (tx) => refreshFlags(tx, ctx, NOW));
});

describe("Early Warnings", () => {
  it("many Not known yet absences turn a Watch into Act now, with the reason mix in the basis", async () => {
    const principal = await viewer(f.principal.id);
    const { list } = await withSchool(principal.ctx, (tx) => listFlags(tx, principal, reportAccess(principal), { status: "open", area: "attendance", q: "", raisedFrom: null, raisedTo: null }));
    const x = list.find((r) => r.studentId === f.studentsA[0].id)!;
    expect(x.strength).toBe("ACT_NOW");
    expect(x.reason).toMatch(/6 of 6 absent days have no reason known yet/);
    expect(x.basis).toMatch(/absence reasons: 6 not known yet/);
    // The same % with sick days stays a Watch.
    const y = list.find((r) => r.studentId === f.studentsA[1].id)!;
    expect(y.strength).toBe("WATCH");
    expect(y.basis).toMatch(/absence reasons: 6 sick/);
  });

  it("an absent streak above the threshold is a Watch, not Act now, with the sick days in the basis", async () => {
    const principal = await viewer(f.principal.id);
    const { list } = await withSchool(principal.ctx, (tx) => listFlags(tx, principal, reportAccess(principal), { status: "open", area: "attendance", q: "", raisedFrom: null, raisedTo: null }));
    const z = list.find((r) => r.studentId === f.studentsA[2].id)!;
    expect(z.strength).toBe("WATCH");
    expect(z.basis).toMatch(/absence reasons: 6 sick/);
    // "Based on" in school words, not the record's name (TEACHING-20).
    expect(z.basis).toMatch(/Absent days in a row, flagged on 16-10-2026 · rule: \d+ school days in a row \(Attendance Settings\)/);
    for (const r of list) expect(r.basis).not.toMatch(/Attendance Flag/);
  });

  it("Fees dispute absences are fee flags: the Principal sees them, the class teacher does not, and sees Other in the basis", async () => {
    const principal = await viewer(f.principal.id);
    const fees = await withSchool(principal.ctx, (tx) => listFlags(tx, principal, reportAccess(principal), { status: "open", area: "fees", q: "", raisedFrom: null, raisedTo: null }));
    const w = fees.list.find((r) => r.studentId === f.studentsA[3].id)!;
    expect(w.reason).toBe("Absent 1 school day this year with the reason Fees dispute");
    expect(w.strength).toBe("WATCH");
    const teacher = await viewer(f.teacherA.id);
    const mine = await withSchool(teacher.ctx, (tx) => listFlags(tx, teacher, reportAccess(teacher), { status: "open", area: "all", q: "", raisedFrom: null, raisedTo: null }));
    expect(mine.list.some((r) => r.area === "fees")).toBe(false);
    expect(mine.list.some((r) => /fees dispute/i.test(`${r.reason} ${r.basis}`))).toBe(false);
    const v = mine.list.find((r) => r.studentId === f.studentsA[4].id)!;
    expect(v.basis).toMatch(/5 not known yet, 1 other/);
  });
});

describe("Looking ahead: may be thinking of leaving", () => {
  it("many unexplained absences are one strong sign, not enough alone; with a fee concern it is a fee-only signal; sick days never count", async () => {
    const ctx = { schoolId: f.school.id, userId: null };
    await withSchool(ctx, (tx) => refreshForecasts(tx, ctx, NOW, { force: true }));
    const all = await withSchool(ctx, (tx) => forecastsFor(tx, { fees: true, finance: true }));
    const leaving = all.filter((s) => s.area === "students");
    // X: six absences nobody explained, and nothing else: combined evidence is needed.
    expect(leaving.some((s) => s.studentId === f.studentsA[0].id)).toBe(false);
    expect(leaving.some((s) => s.studentId === f.studentsA[1].id || s.studentId === f.studentsA[2].id)).toBe(false);
    // V: unexplained absences and a Fees dispute: a signal for people with the school's fees only.
    const v = leaving.find((s) => s.studentId === f.studentsA[4].id)!;
    expect(v.key.startsWith(LEAVING_WITH_FEES)).toBe(true);
    expect(v.strength).toBe("WATCH");
    expect(v.body).toMatch(/5 of 6 absent days have no reason known yet/);
    expect(v.body).toMatch(/Fees dispute/);
    const noFees = await withSchool(ctx, (tx) => forecastsFor(tx, { fees: false, finance: false }));
    expect(noFees.some((s) => s.studentId === f.studentsA[4].id && s.area === "students")).toBe(false);
    expect(noFees.some((s) => /fees dispute/i.test(s.body))).toBe(false);
  });
});
