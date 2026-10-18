// Predictions people can trust (the lead's review of the demo school, 18 Oct
// 2026; gap list G25 and G29): "Act now" only on strong evidence, never fees
// alone; the Dashboard says what it counts; next year's seats from the class
// below and the school's own continuation rate; no cash forecast from books
// that cannot be right; "may be thinking of leaving" only from combined
// evidence; class predictions only for a real fall, with how sure they are; one
// ranked Looking ahead view; unusual activity against each person's own usual;
// and the new forecasts (marks needed, syllabus, message credits, guardians who
// cannot be reached, cash for 8 weeks).
import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { withSchool, type SchoolContext } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { buildHome } from "@/lib/dashboard/compose";
import type { Current } from "@/lib/current";
import { reportAccess } from "@/lib/reports/access";
import { viewerOf } from "@/lib/reports/run";
import type { ReportViewer } from "@/lib/reports/types";
import { aiSignals, dashboardWarnings, decideAiSignal, listFlags, refreshFlags } from "@/lib/reports/warnings";
import {
  classDrop, computeForecasts, continuationRate, fallingThreeMonths, forecastsFor, leavingScore, rankOf, refreshForecasts, seatForecast, stoppedPaying, type Ctx,
} from "@/lib/reports/forecasts";
import { cashForecasts, cashWeeks, creditDaysLeft, creditForecasts, daysToFinish, marksNeeded, payDayOf, reachForecasts } from "@/lib/reports/forecasts-more";
import { levelOf, unusualAgainstUsual } from "@/lib/reports/unusual";
import { belowThresholdStrength, closerLook, closerLookWords, marksStrength, withTwoAreas } from "@/lib/reports/strength";
import { lookingAheadView, TOP_COUNT } from "@/lib/reports/looking-ahead";
import { makeSchool } from "../helpers";
import { examSettings } from "@/lib/exams/settings";
import { feature, makeFeeSchool, R, type FeeSchool } from "../fees/fixture";
import { at, d, makeAttendanceSchool, type Fixture } from "../attendance/fixture";

async function viewer(schoolId: string, userId: string): Promise<ReportViewer> {
  const v = await withSchool({ schoolId, userId }, (tx) => viewerOf(tx, userId, schoolId));
  if (!v) throw new Error("no access");
  return v;
}
async function home(schoolId: string, userId: string, now: Date) {
  const view = await accessIn(userId, schoolId);
  const v = { ...view!, ctx: { schoolId, userId }, user: { id: userId, displayName: "Test" }, menu: [], schools: [], session: null } as unknown as Current;
  return buildHome(v, { now });
}

/** Monday to Friday from `from` to `to`, as YYYY-MM-DD, leaving out 2 October (a holiday in the fixture). */
function weekdays(from: string, to: string) {
  const out: string[] = [];
  for (let t = d(from).getTime(); t <= d(to).getTime(); t += 86_400_000) {
    const x = new Date(t);
    const iso = x.toISOString().slice(0, 10);
    if (x.getUTCDay() >= 1 && x.getUTCDay() <= 5 && iso !== "2026-10-02") out.push(iso);
  }
  return out;
}

/* ---------- the rules on their own ---------- */

describe("the rules on their own", () => {
  it("keeps Act now for attendance below the threshold that is falling or well below it", () => {
    expect(belowThresholdStrength({ percent: 72, recent: 71, threshold: 75 }).strength).toBe("WATCH");
    expect(belowThresholdStrength({ percent: 72, recent: 60, threshold: 75 })).toMatchObject({ strength: "ACT_NOW", line: "Falling: 60% in the last 30 days" });
    expect(belowThresholdStrength({ percent: 50, recent: 50, threshold: 75 }).strength).toBe("ACT_NOW");
    expect(marksStrength(1, false)).toBe("WATCH");
    expect(marksStrength(2, false)).toBe("ACT_NOW");
    expect(marksStrength(0, true)).toBe("WATCH");
    expect(marksStrength(0, false)).toBeNull();
  });

  it("makes concerns in two areas Act now, but never a fee flag", () => {
    const s = (studentId: string, area: string) => ({ studentId, area, strength: "WATCH" as const, reason: "r", basis: "b" });
    const out = withTwoAreas([s("x", "attendance"), s("x", "marks"), s("x", "fees"), s("y", "marks"), s("y", "fees")], new Set(["z"]));
    expect(out.map((o) => o.strength)).toEqual(["ACT_NOW", "ACT_NOW", "WATCH", "WATCH", "WATCH"]);
    expect(out[1].reason).toBe("r\nAlso a concern: attendance");
    // An open Attendance Flag counts as the attendance concern.
    expect(withTwoAreas([s("z", "marks")], new Set(["z"]))[0].strength).toBe("ACT_NOW");
  });

  it("counts students who need a closer look once, by area, never fee rows", () => {
    const rows = [
      { studentId: "a", area: "attendance", strength: "ACT_NOW" }, { studentId: "b", area: "marks", strength: "ACT_NOW" },
      { studentId: "c", area: "attendance", strength: "ACT_NOW" }, { studentId: "c", area: "marks", strength: "ACT_NOW" },
      { studentId: "d", area: "fees", strength: "ACT_NOW" }, { studentId: "e", area: "marks", strength: "WATCH" },
    ];
    const look = closerLook(rows);
    expect(look).toEqual({ students: 3, attendance: 1, marks: 1, both: 1 });
    expect(closerLookWords(look)).toBe("3 students need a closer look: 1 attendance, 1 marks, 1 in two areas");
  });

  it("raises a class prediction only for a fall of 10 points or more, and says how sure it is", () => {
    expect(classDrop([80, 77])).toBeNull();
    expect(classDrop([90, 70])).toMatchObject({ drop: 20, certainty: "low", words: "Based on only 2 tests, so this is an early sign" });
    expect(classDrop([95, 85, 70])).toMatchObject({ certainty: "medium", words: "Based on 3 tests, falling each time" });
  });

  it("forecasts next year's class from the class below and the school's own continuation rate", () => {
    expect(continuationRate(19, 19)).toBeNull();
    expect(continuationRate(40, 36)).toBe(0.9);
    expect(seatForecast({ seats: 40, inClass: 0, movingUp: 30, continueRate: 0.9, approved: 2, pipeline: 10, joinRate: 0.3 })).toEqual({ expected: 32, fromPipeline: 3, moving: 27, empty: 8 });
  });

  it("needs combined evidence before saying a family may be thinking of leaving", () => {
    const none = { falling: false, unknown: false, marks: false, fees: false, stoppedPaying: false };
    expect(leavingScore({ ...none, marks: true, fees: true })).toBeNull(); // a low mark and fees due: not enough
    expect(leavingScore({ ...none, unknown: true })).toBeNull();
    expect(leavingScore({ ...none, falling: true, marks: true })).toBe(3);
    expect(leavingScore({ ...none, falling: true, unknown: true })).toBe(4);
    expect(leavingScore({ ...none, stoppedPaying: true })).toBe(2);
    expect(stoppedPaying([{ daysLate: 2, open: false }, { daysLate: 10, open: false }, { daysLate: 45, open: true }])).toBe(true);
    expect(stoppedPaying([{ daysLate: 40, open: false }, { daysLate: 10, open: false }, { daysLate: 45, open: true }])).toBe(false);
    expect(stoppedPaying([{ daysLate: 191, open: true }, { daysLate: 100, open: true }])).toBe(false);
    expect(fallingThreeMonths([100, 86, 64], 80)).toBe(true);
    expect(fallingThreeMonths([99, 98, 97], 80)).toBe(false);
    expect(fallingThreeMonths([100, null, 60], 80)).toBe(false);
  });

  it("works out the marks needed, the syllabus pace, credits, cash weeks and pay day", () => {
    expect(marksNeeded([{ weight: 20, percent: 25 }, { weight: 20, percent: 20 }], 60, 33)).toBe(40);
    expect(marksNeeded([], 60, 33)).toBeNull();
    expect(daysToFinish({ done: 10, total: 40, daysTaught: 50 })).toBe(150);
    expect(daysToFinish({ done: 2, total: 40, daysTaught: 50 })).toBeNull();
    expect(creditDaysLeft({ balance: 100, usedLast30: 900, scheduled: 10 })).toBe(3);
    expect(creditDaysLeft({ balance: 100, usedLast30: 0, scheduled: 150 })).toBe(0);
    const w = cashWeeks(R(1000), [{ inflow: R(100), outflow: R(200), salary: BigInt(0) }, { inflow: R(0), outflow: R(200), salary: R(900) }]);
    expect(w.ends).toEqual([R(900), R(-200)]);
    expect(w.lowWeek).toBe(1);
    expect(payDayOf(d("2026-10-01"), "last-working").toISOString().slice(0, 10)).toBe("2026-10-31");
    expect(payDayOf(d("2026-05-01"), "last-working").toISOString().slice(0, 10)).toBe("2026-05-30"); // 31 May is a Sunday
    expect(payDayOf(d("2026-10-01"), "7").toISOString().slice(0, 10)).toBe("2026-10-07");
  });

  it("calls a person's changes unusual only against their own usual, and keys them by level", () => {
    expect(unusualAgainstUsual(12, 8, 6)).toEqual({ perWeek: 1 }); // 2 weeks usually 2, now 12
    expect(unusualAgainstUsual(12, 40, 6)).toBeNull(); // usually 10 in 2 weeks
    expect(unusualAgainstUsual(4, 0, 6)).toBeNull();
    expect([levelOf(6, 6), levelOf(11, 6), levelOf(12, 6), levelOf(30, 6)]).toEqual([1, 1, 2, 3]);
  });

  it("shows the most important few first, no more than two of one area, and every area with its count", () => {
    const items = [
      ...Array.from({ length: 12 }, (_, i) => ({ key: `l${i}`, area: "students", strength: i < 2 ? "ACT_NOW" : "WATCH" })),
      { key: "c", area: "finance", strength: "ACT_NOW" }, { key: "m", area: "marks", strength: "WATCH" }, { key: "s", area: "admissions", strength: "WATCH" },
    ];
    const v = lookingAheadView(items);
    expect(v.top.map((x) => x.key)).toEqual(["l0", "l1", "c", "m", "s"]);
    expect(v.top).toHaveLength(TOP_COUNT);
    expect(v.groups[0]).toMatchObject({ area: "students", count: 12, actNow: 2, more: 9 });
    expect(lookingAheadView(items, { area: "students" }).groups[0].items).toHaveLength(12);
    // Ranking: how much it matters, how soon and how sure.
    expect(rankOf({ strength: "ACT_NOW", score: 90, certainty: "medium" })).toBeGreaterThan(rankOf({ strength: "WATCH", score: 30, certainty: "high" }));
  });
});

/* ---------- a school where most families owe fees ---------- */

let fee: FeeSchool;
const FEE_NOW = at("2026-10-09", "18:00");

describe("A school where most families owe fees", () => {
  beforeAll(async () => {
    fee = await makeFeeSchool();
    // Nobody has paid: every family is 191 days overdue, like the demo school.
    await withSchool({ schoolId: fee.school.id, userId: null }, (tx) => refreshFlags(tx, { schoolId: fee.school.id, userId: null }, FEE_NOW));
  }, 180_000);

  it("keeps fee flags as Watch, an accounts matter, never Act now", async () => {
    const principal = await viewer(fee.school.id, fee.principal.id);
    const { list, counts } = await withSchool(principal.ctx, (tx) => listFlags(tx, principal, reportAccess(principal), { status: "open", area: "all", q: "", raisedFrom: null, raisedTo: null }));
    expect(list.filter((f) => f.area === "fees")).toHaveLength(3);
    expect(list.every((f) => f.strength === "WATCH")).toBe(true);
    expect(list[0].reason).toMatch(/^Fees overdue \d+ days: ₹/);
    expect(list[0].basis).toMatch(/an accounts matter/);
    expect(counts.actNow).toBe(0);
  });

  it("does not put fee defaulters into the Dashboard's Early Warnings number", async () => {
    const principal = await viewer(fee.school.id, fee.principal.id);
    const w = await withSchool(principal.ctx, (tx) => dashboardWarnings(tx, principal, reportAccess(principal)));
    expect(w?.look).toEqual({ students: 0, attendance: 0, marks: 0, both: 0 });
    expect(w?.toReview).toBe(0);
    const h = await home(fee.school.id, fee.principal.id, FEE_NOW);
    expect(h.attention.some((x) => x.id === "reports.early-warnings")).toBe(false);
  });
});

/* ---------- strong evidence, the Dashboard card, leaving, class predictions, marks needed, syllabus ---------- */

let f: Fixture;
let sys: SchoolContext;
const NOW = at("2026-10-16", "20:00");
let annualId: string;

describe("Strong evidence only", () => {
  beforeAll(async () => {
    f = await makeAttendanceSchool("Trust School");
    sys = { schoolId: f.school.id, userId: null };
    for (const k of ["ai-assistant", "ai-forecasts", "ai-insights"]) await feature(sys, k);
    const days = weekdays("2026-08-03", "2026-10-16");
    const sep = days.filter((x) => x.startsWith("2026-09"));
    const oct = days.filter((x) => x.startsWith("2026-10"));
    // Aarav and Ishaan: every day in August, 3 days away in September, 4 in October: falling three months, still 87% this year.
    const falling = new Set([...sep.slice(0, 3), ...oct.slice(0, 4)]);
    // Meera: away every fourth or fifth day all along, 78%: just under the 80% watch line, not falling.
    const steady = new Set(days.filter((_, i) => i % 9 === 0 || i % 9 === 4));
    const absent = (i: number, day: string) => (i === 0 || i === 2 ? falling.has(day) : i === 3 ? steady.has(day) : false);
    await withSchool(sys, (tx) => tx.attendanceMark.createMany({
      data: days.flatMap((day) => [...f.studentsA.map((s, i) => ({ s, absent: absent(i, day), sec: f.sectionA.id })), ...f.studentsB.map((s) => ({ s, absent: false, sec: f.sectionB.id }))].map((x) => ({
        schoolId: f.school.id, academicYearId: f.year.id, studentId: x.s.id, sectionId: x.sec, date: d(day), periodNo: 0, statusKey: x.absent ? "absent" : "present",
      }))),
    }));
    // Two exams of Class 5 and the Annual exam still to come; FA 1 and FA 2 count 20 each, the Annual 60.
    await withSchool(sys, async (tx) => {
      const term = await tx.term.findFirstOrThrow({ where: { academicYearId: f.year.id, name: "Term 1" } });
      const [fa1t, fa2t, annt] = await Promise.all(["FA 1", "FA 2", "Annual"].map((name, i) => tx.examType.create({ data: { schoolId: f.school.id, name, sortOrder: i } })));
      await examSettings(tx, sys);
      await tx.examSettings.update({ where: { schoolId: f.school.id }, data: { finalWeights: [{ examTypeId: fa1t.id, weight: 20 }, { examTypeId: fa2t.id, weight: 20 }, { examTypeId: annt.id, weight: 60 }] } });
      const exam = (title: string, typeId: string, start: string, end: string, status: "PUBLISHED" | "RESULTS_PUBLISHED") => tx.exam.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, termId: term.id, examTypeId: typeId, title, classIds: [f.cls.id], startDate: d(start), endDate: d(end), status } });
      const fa1 = await exam("FA 1", fa1t.id, "2026-07-20", "2026-07-24", "RESULTS_PUBLISHED");
      const fa2 = await exam("FA 2", fa2t.id, "2026-09-21", "2026-09-25", "RESULTS_PUBLISHED");
      annualId = (await exam("Annual exam", annt.id, "2027-03-01", "2027-03-12", "PUBLISHED")).id;
      const subj = (name: string, percent: number) => ({ subjectId: `s-${name}`, name, max: 100, marks: percent, absent: false, gradeOnly: false, grade: null, points: null, percent, passed: percent >= 33, grace: 0, missing: false });
      const all = [...f.studentsA.map((s) => ({ s, sec: f.sectionA.id })), ...f.studentsB.map((s) => ({ s, sec: f.sectionB.id }))];
      // FA 1: Rohan (Maths) and the last student of 5 B fail. FA 2: Meera fails Maths, Rohan Maths and Science, Bhavya (B0) Maths.
      const plan: Record<string, { fa1: [number, number]; fa2: [number, number] }> = {
        [f.studentsA[3].id]: { fa1: [60, 62], fa2: [30, 60] },
        [f.studentsA[4].id]: { fa1: [25, 40], fa2: [20, 25] },
        [f.studentsB[0].id]: { fa1: [55, 70], fa2: [30, 68] },
        [f.studentsB[4].id]: { fa1: [20, 25], fa2: [70, 70] },
      };
      for (const [examId, key] of [[fa1.id, "fa1"], [fa2.id, "fa2"]] as const) {
        for (const x of all) {
          const [m, sci] = plan[x.s.id]?.[key] ?? [75, 75];
          const subjects = [subj("Maths", m), subj("Science", sci)];
          const pass = subjects.every((s) => s.passed);
          await tx.result.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, examId, key: `exam:${examId}`, studentId: x.s.id, classId: f.cls.id, sectionId: x.sec, total: m + sci, maxTotal: 200, percent: (m + sci) / 2, outcome: pass ? "Pass" : "Fail", complete: true, subjects, status: "PUBLISHED", publishedAt: d(key === "fa1" ? "2026-07-30" : "2026-09-30") } });
        }
      }
    });
    await withSchool(sys, (tx) => refreshFlags(tx, sys, NOW));
    // Open concerns the rules above do not raise (added by a person from a suggestion, so the next check keeps them).
    await withSchool(sys, async (tx) => {
      // Diya: a low mark and fees due, as open flags (the old leaving signal's whole evidence).
      for (const area of ["marks", "fees"]) await tx.riskFlag.create({ data: { schoolId: f.school.id, studentId: f.studentsA[1].id, academicYearId: f.year.id, sectionId: f.sectionA.id, area, strength: "WATCH", reason: area === "fees" ? "Fees overdue 70 days: ₹6,000 (Tuition fee)" : "FA 2: below the pass mark in Maths", basis: "Suggestion · based on a test", raisedAt: NOW } });
      // Aarav: a marks concern too.
      await tx.riskFlag.create({ data: { schoolId: f.school.id, studentId: f.studentsA[0].id, academicYearId: f.year.id, sectionId: f.sectionA.id, area: "marks", strength: "WATCH", reason: "Marks fell 20% from FA 1 to FA 2", basis: "Suggestion · based on a test", raisedAt: NOW } });
    });
    await withSchool(sys, (tx) => refreshForecasts(tx, sys, NOW, { force: true }));
  }, 300_000);

  it("is Act now for fails in two subjects, and for concerns in two areas; one fail alone is Watch", async () => {
    const principal = await viewer(f.school.id, f.principal.id);
    const { list } = await withSchool(principal.ctx, (tx) => listFlags(tx, principal, reportAccess(principal), { status: "open", area: "all", q: "", raisedFrom: null, raisedTo: null }));
    const of = (id: string, area: string) => list.find((r) => r.studentId === id && r.area === area);
    expect(of(f.studentsA[4].id, "marks")?.strength).toBe("ACT_NOW"); // Rohan: Maths and Science
    expect(of(f.studentsB[0].id, "marks")?.strength).toBe("WATCH"); // Bhavya: Maths only
    // Meera: just under the watch line and one fail: two areas, both Act now.
    expect(of(f.studentsA[3].id, "attendance")).toMatchObject({ strength: "ACT_NOW" });
    expect(of(f.studentsA[3].id, "attendance")!.reason).toMatch(/Also a concern: marks/);
    expect(of(f.studentsA[3].id, "marks")).toMatchObject({ strength: "ACT_NOW" });
  });

  it("says on the Dashboard what the number is, and the list it opens has the same students", async () => {
    const h = await home(f.school.id, f.principal.id, NOW);
    const card = h.attention.find((x) => x.id === "reports.early-warnings")!;
    expect(card.title).toBe("Early warnings: 2 students need a closer look: 1 marks, 1 in two areas");
    expect(card.href).toBe("/reports-analytics/early-warnings?strength=ACT_NOW&period=all");
    const principal = await viewer(f.school.id, f.principal.id);
    const { list } = await withSchool(principal.ctx, (tx) => listFlags(tx, principal, reportAccess(principal), { status: "open", area: "all", q: "", raisedFrom: null, raisedTo: null, strength: "ACT_NOW" }));
    expect(new Set(list.map((r) => r.studentId))).toEqual(new Set([f.studentsA[3].id, f.studentsA[4].id]));
  });

  it("says a family may be thinking of leaving only on combined evidence", async () => {
    const all = await withSchool(sys, (tx) => forecastsFor(tx, { fees: true, finance: true, forecasts: true, insights: true }));
    const leaving = all.filter((x) => x.area === "students");
    // Aarav: attendance fell three months in a row, and a marks concern.
    const aarav = leaving.find((x) => x.studentId === f.studentsA[0].id)!;
    expect(aarav.body).toMatch(/attendance fell three months in a row \(August 100%, September 86\.4%, October 63\.6%\)/);
    expect(aarav.body).toMatch(/there is an open marks flag/);
    expect(aarav.strength).toBe("WATCH");
    // Diya: a low mark and fees due: not enough. Ishaan: falling, nothing else: not enough.
    expect(leaving.some((x) => x.studentId === f.studentsA[1].id || x.studentId === f.studentsA[2].id)).toBe(false);
  });

  it("raises the class prediction for a real fall, saying it rests on only 2 tests, counting complete results only", async () => {
    const all = await withSchool(sys, (tx) => forecastsFor(tx, { fees: true, finance: true }));
    const cls = all.find((x) => x.key.startsWith("class-proj:"))!;
    expect(cls.title).toBe("Class 5 may do worse in the next exam");
    // FA 1: Rohan and one more below the pass mark (8 of 10); FA 2: three (7 of 10). Exactly 10 points: raised.
    expect(cls.body).toMatch(/80% in FA 1 \(8 of 10\), then 70% in FA 2 \(7 of 10\): down 10 points/);
    expect(cls.body).toMatch(/Based on only 2 tests/);
    expect(cls.certainty).toBe("low");
    expect(cls.strength).toBe("WATCH");
  });

  it("says the marks a student needs in the remaining exams to pass each subject", async () => {
    const all = await withSchool(sys, (tx) => forecastsFor(tx, { fees: true, finance: true }));
    const rohan = all.find((x) => x.key.startsWith("marks-need:") && x.studentId === f.studentsA[4].id)!;
    // Maths: (33 × 100 − 20 × 25 − 20 × 20) ÷ 60 = 40%. Science: (3300 − 800 − 500) ÷ 60 = 33.3%, the pass mark itself: not listed.
    expect(rohan.title).toMatch(/^Rohan Das \(Class 5 A\) needs about 40% in Maths/);
    expect(rohan.title).toMatch(/in Annual exam to reach the 33% pass mark for the year/);
    expect(rohan.source).toMatch(/weight of each exam in the final result/);
    // Students comfortably above the pass mark are not listed.
    expect(all.some((x) => x.key.startsWith("marks-need:") && x.studentId === f.studentsA[0].id)).toBe(false);
    expect(annualId).toBeTruthy();
  });

  it("orders Looking ahead by importance and keeps decisions: Not a concern stays quiet", async () => {
    const principal = await viewer(f.school.id, f.principal.id);
    const a = reportAccess(principal);
    const list = await withSchool(principal.ctx, (tx) => aiSignals(tx, principal, a));
    const ranks = list.map((s) => rankOf({ strength: s.strength ?? "WATCH", score: s.score, certainty: s.certainty }));
    expect([...ranks].sort((x, y) => y - x)).toEqual(ranks);
    const cls = list.find((s) => s.key.startsWith("class-proj:"))!;
    await withSchool(principal.ctx, (tx) => decideAiSignal(tx, principal, a, cls.key, "DISMISSED", NOW));
    await withSchool(sys, (tx) => refreshForecasts(tx, sys, new Date(NOW.getTime() + 86_400_000), { force: true }));
    const after = await withSchool(principal.ctx, (tx) => aiSignals(tx, principal, a));
    expect(after.some((s) => s.key === cls.key)).toBe(false);
  });

  it("forecasts when a section would finish the syllabus at its pace so far", async () => {
    await withSchool(sys, async (tx) => {
      const subject = await tx.subject.create({ data: { schoolId: f.school.id, name: "Social Science", code: "SST" } });
      const items = await Promise.all(Array.from({ length: 40 }, (_, i) => tx.syllabusItem.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, classId: f.cls.id, subjectId: subject.id, kind: "TOPIC", title: `Topic ${i + 1}`, sortOrder: i, plannedTo: d("2027-01-31") } })));
      // 5 topics in 5 A since 3 August: far too slow to finish by 31 January.
      for (const [i, day] of ["2026-08-03", "2026-08-24", "2026-09-07", "2026-09-28", "2026-10-12"].entries()) {
        await tx.syllabusProgressEntry.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, sectionId: f.sectionA.id, itemId: items[i].id, date: d(day), status: "completed" } });
      }
    });
    const list = await withSchool(sys, (tx) => computeForecasts(tx, sys, NOW));
    const s = list.find((x) => x.area === "academic")!;
    expect(s.title).toMatch(/^Class 5 A may finish Social Science about [\d,]+ school days late$/);
    expect(s.body).toMatch(/5 of 40 topics taught in \d+ school days since 03-08-2026/);
    expect(s.body).toMatch(/after the last planned date, 31-01-2027/);
  });
});

/* ---------- next year's seats ---------- */

describe("Next year's seats", () => {
  let school: Awaited<ReturnType<typeof makeSchool>>;
  let ctx: SchoolContext;
  let lastYearId: string;
  const TODAY = at("2026-10-18", "12:00");
  beforeAll(async () => {
    school = await makeSchool("Seats School");
    ctx = { schoolId: school.id, userId: null };
    await withSchool(ctx, async (tx) => {
      const campusId = school.campus.id;
      const y = (name: string, s: string, e: string, status: "CLOSED" | "ACTIVE" | "UPCOMING") => tx.academicYear.create({ data: { schoolId: school.id, campusId, name, startDate: d(s), endDate: d(e), status } });
      const last = await y("2025-26", "2025-04-01", "2026-03-31", "CLOSED");
      const now = await y("2026-27", "2026-04-01", "2027-03-31", "ACTIVE");
      const next = await y("2027-28", "2027-04-01", "2028-03-31", "UPCOMING");
      lastYearId = last.id;
      const c6 = await tx.schoolClass.create({ data: { schoolId: school.id, campusId, name: "Class 6", sortOrder: 6 } });
      const c7 = await tx.schoolClass.create({ data: { schoolId: school.id, campusId, name: "Class 7", sortOrder: 7 } });
      const sec = async (cls: string, year: string) => tx.section.create({ data: { schoolId: school.id, classId: cls, academicYearId: year, name: "A", seats: 40 } });
      const [l6, n6, n7, x6] = [await sec(c6.id, last.id), await sec(c6.id, now.id), await sec(c7.id, now.id), await sec(c6.id, next.id)];
      await sec(c7.id, next.id);
      const kid = async (i: number) => tx.student.create({ data: { schoolId: school.id, campusId, admissionNo: `S${i}-${randomUUID().slice(0, 4)}`, firstName: `Kid${i}`, fullName: `Kid ${i}` } });
      // Last year 40 in Class 6; 36 of them are in Class 7 now (90% continued).
      for (let i = 0; i < 40; i++) {
        const k = await kid(i);
        await tx.enrolment.create({ data: { schoolId: school.id, studentId: k.id, academicYearId: last.id, classId: c6.id, sectionId: l6.id, status: i < 36 ? "PROMOTED" : "LEFT" } });
        if (i < 36) await tx.enrolment.create({ data: { schoolId: school.id, studentId: k.id, academicYearId: now.id, classId: c7.id, sectionId: n7.id } });
      }
      // 30 in Class 6 now.
      for (let i = 40; i < 70; i++) {
        const k = await kid(i);
        await tx.enrolment.create({ data: { schoolId: school.id, studentId: k.id, academicYearId: now.id, classId: c6.id, sectionId: n6.id } });
      }
      // Two new admissions already on next year's roll in Class 6 (like the demo school): they must not stop the class below moving up.
      for (let i = 70; i < 72; i++) {
        const k = await kid(i);
        await tx.enrolment.create({ data: { schoolId: school.id, studentId: k.id, academicYearId: next.id, classId: c6.id, sectionId: x6.id } });
      }
    });
    for (const k of ["ai-assistant", "ai-forecasts"]) await feature(ctx, k);
  }, 180_000);

  it("counts this year's Class 6 moving up at the school's own continuation rate", async () => {
    const list = await withSchool(ctx, (tx) => computeForecasts(tx, ctx, TODAY));
    const c7 = list.find((x) => x.area === "admissions" && x.title.includes("Class 7"))!;
    expect(c7.title).toBe("About 13 of 40 seats in Class 7 may stay empty in 2027-28");
    expect(c7.body).toMatch(/about 27 of the 30 in Class 6 now \(about 90% of students continue to the next year \(36 of 40 from 2025-26\)\)/);
    // Class 6 is filled by new admissions only: too early in the season to say (the year starts in more than 120 days).
    expect(list.some((x) => x.area === "admissions" && x.title.includes("Class 6"))).toBe(false);
  });

  it("without promotion history, says so and warns only if seats stay empty even if everyone moves up", async () => {
    await withSchool(ctx, (tx) => tx.academicYear.update({ where: { id: lastYearId }, data: { archivedAt: new Date() } }));
    const list = await withSchool(ctx, (tx) => computeForecasts(tx, ctx, TODAY));
    const c7 = list.find((x) => x.area === "admissions" && x.title.includes("Class 7"))!;
    expect(c7.title).toBe("At least 10 of 40 seats in Class 7 may stay empty in 2027-28");
    expect(c7.body).toMatch(/There is no promotion history in School OS yet/);
    await withSchool(ctx, (tx) => tx.academicYear.update({ where: { id: lastYearId }, data: { archivedAt: null } }));
  });
});

/* ---------- cash, credits, guardians, unusual activity ---------- */

describe("Money and messages", () => {
  let cash: FeeSchool;
  beforeAll(async () => {
    cash = await makeFeeSchool();
    for (const k of ["ai-assistant", "ai-forecasts", "ai-insights"]) await feature(cash.ctx, k);
    await withSchool(cash.ctx, async (tx) => {
      if (!(await tx.financialYear.count())) await tx.financialYear.create({ data: { schoolId: cash.school.id, name: "2026-27", startDate: d("2026-04-01"), endDate: d("2027-03-31") } });
    });
  }, 180_000);

  const run = <T,>(fn: (cx: Ctx) => Promise<T>) => withSchool(cash.ctx, async (tx) => {
    const year = await tx.academicYear.findFirstOrThrow({ where: { id: cash.year.id } });
    return fn({ tx, ctx: { schoolId: cash.school.id, userId: null }, today: d("2026-10-16"), year });
  });
  const entry = async (amount: number, direction: "IN" | "OUT", date: string, section = "expense", accountKind: "CASH" | "BANK" = "CASH") => withSchool(cash.ctx, async (tx) => {
    const fy = await tx.financialYear.findFirstOrThrow();
    const acct = await tx.bankAccount.findFirstOrThrow({ where: { kind: accountKind } });
    const id = randomUUID();
    await tx.dayBookEntry.create({ data: { schoolId: cash.school.id, financialYearId: fy.id, date: d(date), direction, amountPaise: R(amount), mode: "CASH", section, headName: "Test", accountId: acct.id, sourceType: section === "opening" ? "opening-balance" : "test", sourceId: id, sourceKey: `test:${id}`, partyName: "Test" } });
  });

  it("asks for the opening cash and bank balances instead of predicting a shortfall from books that start at zero", async () => {
    await entry(2_416_897, "OUT", "2026-09-10");
    const out = await run((cx) => cashForecasts(cx));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ key: "cash-setup", title: "Cash forecast needs your opening cash and bank balances", href: "/finance-management/cash-bank" });
    expect(out[0].body).toMatch(/show -₹24,16,897, which cannot be right/);
  });

  it("asks for a check while the books show less than nothing, and forecasts 8 weeks with salary on pay day once they are right", async () => {
    await withSchool(cash.ctx, async (tx) => {
      const fy = await tx.financialYear.findFirstOrThrow();
      const acct = await tx.bankAccount.findFirstOrThrow({ where: { kind: "CASH" } });
      await tx.openingBalance.create({ data: { schoolId: cash.school.id, kind: "CASH", financialYearId: fy.id, date: d("2026-04-01"), accountId: acct.id, amountPaise: R(1_000_000) } });
    });
    await entry(1_000_000, "IN", "2026-04-01", "opening");
    let out = await run((cx) => cashForecasts(cx));
    expect(out[0].title).toBe("Cash forecast needs a check of the cash and bank books");
    // The opening balance was set too low: corrected, the books show ₹12,00,000 less the spending.
    await entry(2_616_897, "IN", "2026-04-01", "opening");
    await withSchool(cash.ctx, (tx) => tx.payrollRun.create({ data: { schoolId: cash.school.id, campusId: cash.school.campus.id, month: d("2026-09-01"), number: "PR-2026-09", status: "PAID", netPaise: R(1_500_000) } }));
    out = await run((cx) => cashForecasts(cx));
    expect(out).toHaveLength(1);
    expect(out[0].title).toMatch(/^Cash may run short by about ₹[\d,]+ in the week of /);
    expect(out[0].body).toMatch(/Cash and bank now: ₹12,00,000/);
    expect(out[0].body).toMatch(/salary of about ₹15,00,000 on 31-10-2026/);
    expect(out[0].body).not.toMatch(/\.\d\d\b/); // whole rupees
  });

  it("says when message credits may run out at the rate of the last 30 days", async () => {
    await withSchool(cash.ctx, (tx) => tx.creditLedgerEntry.create({ data: { schoolId: cash.school.id, channel: "whatsapp", amount: -900, note: "Fee reminders", messageId: randomUUID(), createdAt: at("2026-10-05", "10:00") } }));
    const out = await run((cx) => creditForecasts(cx));
    const wa = out.find((x) => x.key.startsWith("credits:whatsapp"))!;
    expect(wa.title).toBe("WhatsApp credits may run out around 19-10-2026");
    expect(wa.strength).toBe("ACT_NOW");
    expect(wa.body).toMatch(/^100 credits left\. 900 credits used in the last 30 days/);
  });

  it("names guardians whom no message reached lately", async () => {
    await withSchool(cash.ctx, async (tx) => {
      for (let i = 0; i < 2; i++) {
        const m = await tx.message.create({ data: { schoolId: cash.school.id, body: "Fee reminder", channels: ["whatsapp"], audienceLabel: "Sita's father", status: "SENT" } });
        await tx.messageRecipient.create({ data: { schoolId: cash.school.id, messageId: m.id, recipientType: "guardian", guardianId: cash.sita.guardian.id, studentId: cash.sita.id, name: "Mohan Rao", channel: "whatsapp", address: cash.sita.guardian.phone!, text: "x", status: "FAILED", failReason: "Number not on WhatsApp", queuedAt: at("2026-10-0" + (i + 5), "10:00") } });
        await tx.messageRecipient.create({ data: { schoolId: cash.school.id, messageId: m.id, recipientType: "guardian", guardianId: cash.ravi.guardian.id, studentId: cash.ravi.id, name: "Srinivas Kumar", channel: "whatsapp", address: cash.ravi.guardian.phone!, text: "x", status: i ? "FAILED" : "DELIVERED", queuedAt: at("2026-10-0" + (i + 5), "10:00") } });
      }
    });
    const out = await run((cx) => reachForecasts(cx));
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("1 guardian could not be reached by any message in the last 60 days");
    expect(out[0].body).toMatch(/Mohan Rao \(2 failed\)/);
    expect(out[0].body).not.toMatch(/Srinivas/);
  });

  it("finds unusual fee changes from the Audit Log against the person's own usual, kept for people with the school's fees", async () => {
    const NOW = at("2026-10-16", "12:00");
    await withSchool(cash.ctx, (tx) => tx.auditLogEntry.createMany({ data: [
      // Usually about 1 a week: 8 in the 8 weeks before the last two.
      ...Array.from({ length: 8 }, (_, i) => ({ schoolId: cash.school.id, userLoginId: cash.accountant.id, action: "applied", recordType: "Concession", at: new Date(NOW.getTime() - (20 + i * 6) * 86_400_000) })),
      // Now 9 in two weeks: cancelled payments and removed dues.
      ...Array.from({ length: 9 }, (_, i) => ({ schoolId: cash.school.id, userLoginId: cash.accountant.id, action: i % 2 ? "cancelled" : "removed", recordType: i % 2 ? "Payment" : "Student Fee Due", at: new Date(NOW.getTime() - (1 + i) * 86_400_000) })),
    ] }));
    await withSchool(cash.ctx, (tx) => refreshForecasts(tx, { schoolId: cash.school.id, userId: null }, NOW, { force: true }));
    const all = await withSchool(cash.ctx, (tx) => forecastsFor(tx, { fees: true, finance: true, forecasts: true, insights: true }));
    const u = all.find((x) => x.area === "activity")!;
    expect(u.title).toBe("Unusual: Accountant Person made 9 fee changes in two weeks");
    expect(u.body).toMatch(/Usually about 1 a week \(8 in the 8 weeks before\)/);
    expect(u.key).toBe(`unusual-fee:${cash.accountant.id}:1`);
    // Not for people without the school's fees, and not without Student insights.
    expect((await withSchool(cash.ctx, (tx) => forecastsFor(tx, { fees: false, finance: false, forecasts: true, insights: true }))).some((x) => x.area === "activity")).toBe(false);
    expect((await withSchool(cash.ctx, (tx) => forecastsFor(tx, { fees: true, finance: true, forecasts: true, insights: false }))).some((x) => x.area === "activity")).toBe(false);
    // The key is the same the next day, so Not a concern keeps it quiet until the number grows a level.
    await withSchool(cash.ctx, (tx) => refreshForecasts(tx, { schoolId: cash.school.id, userId: null }, new Date(NOW.getTime() + 86_400_000), { force: true }));
    const again = await withSchool(cash.ctx, (tx) => forecastsFor(tx, { fees: true, finance: true, forecasts: true, insights: true }));
    expect(again.find((x) => x.area === "activity")?.key).toBe(u.key);
  });

  it("never names a person or money in the Looking ahead notification's example", async () => {
    const note = await withSchool(cash.ctx, (tx) => tx.notification.findFirst({ where: { type: "looking-ahead", userLoginId: cash.principal.id }, orderBy: { createdAt: "desc" } }));
    expect(note?.text ?? "").not.toMatch(/Accountant Person|₹/);
  });
});

