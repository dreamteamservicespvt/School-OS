// Looking ahead (19 Early Warnings, AI forecasts; 00-global §2.1): what may
// happen next in the school, worked out from its own records, so the Principal
// and the office hear about a problem while there is still time to act.
//
// - Attendance: students above the threshold today whose recent pace would take
//   them below it by the end of the year.
// - Marks: students whose results are falling and would go below the pass mark
//   in the next exam at the same pace; classes whose pass % fell 10 points or
//   more (with how sure that is); the marks a student needs in the remaining
//   exams to pass each subject for the year (forecasts-more.ts).
// - Fees: dues falling in the next 30 days from students who usually pay late.
// - Students: who may be thinking of leaving, from combined evidence only
//   (attendance falling three months or many unexplained absences, plus marks
//   or fees; or a family that stopped paying after paying on time).
// - Admissions: seats each class is likely to fill next year, from the class
//   below and the school's own continuation and joining rates.
// - Staff: the coming week's leave and the periods still without a substitute.
// - Finance: cash for the next 8 weeks with salary on pay day, only when the
//   cash and bank books can be trusted (forecasts-more.ts).
// - Syllabus, message credits and guardians who cannot be reached (forecasts-more.ts).
// - Unusual activity: attendance edits and fee changes against each person's
//   own usual (unusual.ts; with Student insights switched on).
//
// Rules, not a black box: every signal is plain arithmetic on the school's own
// records, says which numbers it used and how sure it is, and is labelled
// "Suggestion". Nothing changes until a person adds it for review or says it
// is not a concern. Fixed traits (gender, caste, religion, category, income,
// address) are never used. Worked out by a background job and stored, so pages
// read it cheaply, most important first; the school's leaders are told once
// when something new appears.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { currentYears } from "../academic/years";
import { attendanceSettings } from "../attendance/settings";
import { attendanceSummary } from "../attendance/summary";
import { schoolDays } from "../attendance/calendar";
import { UNEXPLAINED_ALONE } from "./absence-signals";
import { mostlyUnexplained, reasonMix, unexplained } from "../attendance/absence-reasons";
import { examSettings } from "../exams/settings";
import { promisesAhead } from "../fees/promises";
import { admissionYear, loadSettings as admissionSettings } from "../admission/settings";
import { loginsWithRole } from "../front-office/people";
import { notify } from "../notifications";
import { formatDate, formatRupees, formatRupeesShort } from "../format";
import { addDays, DAY_MS, todayIn } from "../staff/dates";
import { BUILT_MODULES } from "../modules";

export type ForecastArea = "attendance" | "marks" | "fees" | "students" | "admissions" | "staff" | "finance" | "academic" | "messages" | "activity";
export const FORECAST_AREA_LABEL: Record<ForecastArea, string> = {
  attendance: "Attendance", marks: "Marks", fees: "Fees", students: "Students", admissions: "Admissions", staff: "Staff", finance: "Finance",
  academic: "Syllabus", messages: "Messages", activity: "Unusual activity",
};

/** How sure a suggestion is, from how much of the school's own record it rests on. */
export type Certainty = "high" | "medium" | "low";
export const CERTAINTY_LABEL: Record<Certainty, string> = { high: "Fairly sure", medium: "Likely", low: "Early sign" };

export type Forecast = {
  key: string; area: ForecastArea; strength: "WATCH" | "ACT_NOW";
  title: string; body: string; source: string;
  href?: string; hrefLabel?: string; studentId?: string; value?: number;
  /** How much it matters (0 to 100: people or money affected, how soon); orders Looking ahead with the strength and certainty. */
  score?: number;
  certainty?: Certainty;
};

/** Money in text, in whole rupees. */
export const wholeRupees = (paise: bigint) => formatRupees(BigInt(Math.round(Number(paise) / 100)) * BigInt(100));

/** Keys of unusual fee-change signals (unusual.ts) start with this, so only people with the school's fees see them. */
export const UNUSUAL_FEE = "unusual-fee:";

/** The feature switch (Settings, Modules On/Off, AI features: Forecasts). */
export const FORECAST_FEATURE = "ai-forecasts";
/** At most this many student signals of one kind, the most urgent first, so the list stays readable. */
const MAX_STUDENTS = 15;
/** Worked out again at most this often by the hourly job. */
const EVERY_MS = 3 * 60 * 60 * 1000;
/** Leaders who hear about new signals. */
const LEADER_ROLES = ["principal", "school-admin"];

const pct = (n: number) => `${Math.round(n * 10) / 10}%`;
const month = (d: Date) => d.toISOString().slice(0, 7);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* ---------- the arithmetic (pure, tested on its own) ---------- */

/**
 * End-of-year attendance % if the student keeps the pace of recent weeks for
 * the school days left: (present so far + recent rate × days left) / (days so far + days left).
 */
export function projectAttendance(x: { present: number; counted: number; recentPresent: number; recentCounted: number; daysLeft: number }): number | null {
  if (x.counted <= 0 || x.recentCounted <= 0) return null;
  const rate = x.recentPresent / x.recentCounted;
  return ((x.present + rate * x.daysLeft) / (x.counted + x.daysLeft)) * 100;
}

/** The next exam's % at the same pace: the last result plus the average change between results (needs 2+ results). */
export function projectNext(percents: number[]): number | null {
  if (percents.length < 2) return null;
  const last = percents.slice(-3);
  const steps = last.slice(1).map((p, i) => p - last[i]);
  const avg = steps.reduce((a, b) => a + b, 0) / steps.length;
  return Math.max(0, Math.min(100, last[last.length - 1] + avg));
}

/** A student's paying habit from days late on past dues: "usually late" when the middle value is over `lateDays` (needs 2+ dues). */
export function payHabit(daysLate: number[], lateDays = 15): { usuallyLate: boolean; typical: number | null } {
  if (daysLate.length < 2) return { usuallyLate: false, typical: null };
  const s = [...daysLate].sort((a, b) => a - b);
  const mid = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  return { usuallyLate: mid > lateDays, typical: Math.round(mid) };
}

/**
 * Seats likely filled: students already in the class + those moving up from
 * the class below at the school's own continuation rate + approved admissions
 * + the open pipeline at the school's own joining rate. Without a continuation
 * rate everyone moving up is counted (the best case).
 */
export function seatForecast(x: { seats: number; inClass: number; movingUp?: number; continueRate?: number | null; approved: number; pipeline: number; joinRate: number | null }) {
  const fromPipeline = x.joinRate === null ? 0 : Math.round(x.pipeline * x.joinRate);
  const moving = x.movingUp ? Math.round(x.movingUp * (x.continueRate ?? 1)) : 0;
  const expected = x.inClass + moving + x.approved + fromPipeline;
  return { expected, fromPipeline, moving, empty: x.seats - expected };
}

/** The share of last year's students who are on this year's roll (needs 20 or more), or null. */
export function continuationRate(lastYear: number, continued: number): number | null {
  return lastYear >= 20 ? Math.min(1, continued / lastYear) : null;
}

/** Days before next year starts from which classes with no class below (new admissions only) are forecast. */
export const ENTRY_CLASS_DAYS = 120;

/* ---------- the signals ---------- */

export type Ctx = { tx: Tx; ctx: SchoolContext; today: Date; year: { id: string; startDate: Date; endDate: Date; campusId: string } };

type Enrolled = { studentId: string; sectionId: string; classId: string };

async function names(tx: Tx, ids: string[]) {
  return new Map((await tx.student.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })).map((s) => [s.id, s.fullName]));
}

async function classLabels(tx: Tx, sectionIds: string[]) {
  const sections = await tx.section.findMany({ where: { id: { in: sectionIds } }, select: { id: true, name: true, schoolClass: { select: { name: true } } } });
  return new Map(sections.map((s) => [s.id, `${s.schoolClass.name} ${s.name}`]));
}

async function attendanceForecasts(c: Ctx, enrolled: Enrolled[]): Promise<Forecast[]> {
  if (!enrolled.length || c.today < c.year.startDate || c.today >= c.year.endDate) return [];
  const settings = await attendanceSettings(c.tx, c.ctx);
  const threshold = settings.thresholdPercent;
  const ids = enrolled.map((e) => e.studentId);
  const recentFrom = addDays(c.today, -30) < c.year.startDate ? c.year.startDate : addDays(c.today, -30);
  const [all, recent, left] = await Promise.all([
    attendanceSummary(c.tx, c.ctx, { studentIds: ids, from: c.year.startDate, to: c.today, today: c.today }),
    attendanceSummary(c.tx, c.ctx, { studentIds: ids, from: recentFrom, to: c.today, today: c.today }),
    schoolDays(c.tx, c.ctx, addDays(c.today, 1), c.year.endDate),
  ]);
  const daysLeft = left.working.length;
  if (daysLeft < 10) return [];
  const found: { e: Enrolled; now: number; end: number; recent: number }[] = [];
  for (const e of enrolled) {
    const p = all.people.get(e.studentId);
    const r = recent.people.get(e.studentId);
    if (!p || !r || p.percent === null || p.countedDays < 10 || r.countedDays < 5) continue;
    if (p.percent < threshold) continue; // already below: an Early Warning flag, not a forecast
    const end = projectAttendance({ present: p.present, counted: p.countedDays, recentPresent: r.present, recentCounted: r.countedDays, daysLeft });
    if (end === null || end >= threshold) continue;
    found.push({ e, now: p.percent, end, recent: (r.present / r.countedDays) * 100 });
  }
  found.sort((a, b) => a.end - b.end);
  const top = found.slice(0, MAX_STUDENTS);
  const who = await names(c.tx, top.map((f) => f.e.studentId));
  const cls = await classLabels(c.tx, top.map((f) => f.e.sectionId));
  return top.map((f) => ({
    key: `att-proj:${f.e.studentId}:${month(c.today)}`, area: "attendance", strength: f.end < threshold - 10 ? "ACT_NOW" : "WATCH", score: 25, certainty: daysLeft > 60 ? "low" : "medium",
    studentId: f.e.studentId, value: f.end,
    title: `${who.get(f.e.studentId) ?? "A student"} (${cls.get(f.e.sectionId) ?? "class"}) may end the year below ${threshold}% attendance`,
    body: `Attendance is ${pct(f.now)} so far, but ${pct(f.recent)} in the last 30 days. At that pace it would be about ${pct(f.end)} by ${formatDate(c.year.endDate, "UTC")}, with ${daysLeft} school days left. A word with the family now may help; you decide.`,
    source: `the attendance register from ${formatDate(c.year.startDate, "UTC")} to ${formatDate(c.today, "UTC")}, the last 30 days, the School Calendar and the ${threshold}% threshold (Attendance Settings)`,
    href: `/student-management/students/${f.e.studentId}`, hrefLabel: "Open profile",
  }));
}

async function marksForecasts(c: Ctx, enrolled: Enrolled[]): Promise<Forecast[]> {
  if (!enrolled.length || !BUILT_MODULES.has("examination-results")) return [];
  const pass = (await examSettings(c.tx, c.ctx)).passPercentSubject;
  const section = new Map(enrolled.map((e) => [e.studentId, e.sectionId]));
  const results = await c.tx.result.findMany({ where: { academicYearId: c.year.id, status: "PUBLISHED", examId: { not: null } }, select: { studentId: true, classId: true, examId: true, percent: true, outcome: true } });
  const exams = new Map((await c.tx.exam.findMany({ where: { id: { in: [...new Set(results.map((r) => r.examId!))] } }, select: { id: true, title: true, endDate: true } })).map((e) => [e.id, e]));
  const when = (examId: string | null) => exams.get(examId!)?.endDate.getTime() ?? 0;
  const out: Forecast[] = [];

  // Students: still at or above the pass mark, but falling towards it.
  const byStudent = new Map<string, typeof results>();
  for (const r of results) if (section.has(r.studentId) && r.percent !== null && exams.has(r.examId!)) byStudent.set(r.studentId, [...(byStudent.get(r.studentId) ?? []), r]);
  const falling: { id: string; list: typeof results; next: number }[] = [];
  for (const [id, list] of byStudent) {
    list.sort((a, b) => when(a.examId) - when(b.examId));
    const ps = list.map((r) => r.percent!);
    const last = ps[ps.length - 1];
    const next = projectNext(ps);
    if (next === null || last < pass || next >= pass || last - next < 3) continue;
    falling.push({ id, list, next });
  }
  falling.sort((a, b) => a.next - b.next);
  const top = falling.slice(0, MAX_STUDENTS);
  const who = await names(c.tx, top.map((f) => f.id));
  const cls = await classLabels(c.tx, top.map((f) => section.get(f.id)!));
  for (const f of top) {
    const shown = f.list.slice(-3);
    out.push({
      key: `marks-proj:${f.id}:${shown[shown.length - 1].examId}`, area: "marks", strength: "WATCH", studentId: f.id, value: f.next,
      score: 25, certainty: shown.length >= 3 ? "medium" : "low",
      title: `${who.get(f.id) ?? "A student"} (${cls.get(section.get(f.id)!) ?? "class"}) may fall below the pass mark in the next exam`,
      body: `Results: ${shown.map((r) => `${exams.get(r.examId!)!.title} ${pct(r.percent!)}`).join(", ")}. At the same pace the next one would be about ${pct(f.next)}, below the ${pass}% pass mark. Extra help in the weak subjects may help; you decide.`,
      source: `published results of ${shown.map((r) => exams.get(r.examId!)!.title).join(", ")} and the ${pass}% pass mark (Exam Settings)`,
      href: `/student-management/students/${f.id}`, hrefLabel: "Open profile",
    });
  }

  // Classes: the pass % fell by a meaningful amount between the last two exams (classDrop).
  const byClass = new Map<string, Map<string, { n: number; pass: number }>>();
  for (const r of results) {
    if (!exams.has(r.examId!)) continue;
    // An incomplete result (no outcome yet) is neither a pass nor a fail.
    if (r.outcome === null) continue;
    const m = byClass.get(r.classId) ?? new Map();
    const cur = m.get(r.examId!) ?? { n: 0, pass: 0 };
    cur.n++;
    if (r.outcome === "Pass") cur.pass++;
    m.set(r.examId!, cur);
    byClass.set(r.classId, m);
  }
  const classNames = new Map((await c.tx.schoolClass.findMany({ where: { id: { in: [...byClass.keys()] } }, select: { id: true, name: true } })).map((x) => [x.id, x.name]));
  for (const [classId, m] of byClass) {
    const list = [...m.entries()].filter(([, v]) => v.n >= 5).sort((x, y) => when(x[0]) - when(y[0])).slice(-3);
    const fall = classDrop(list.map(([, v]) => (v.pass / v.n) * 100));
    if (!fall) continue;
    const names = list.map(([e]) => exams.get(e)!.title);
    const ps = list.map(([, v]) => (v.pass / v.n) * 100);
    const cls = classNames.get(classId) ?? "A class";
    out.push({
      key: `class-proj:${classId}:${list[list.length - 1][0]}`, area: "marks", strength: "WATCH", value: fall.next, score: 45, certainty: fall.certainty,
      title: `${cls} may do worse in the next exam`,
      body: `The pass % was ${list.map(([, v], i) => `${i ? "then " : ""}${pct(ps[i])} in ${names[i]} (${v.pass} of ${v.n})`).join(", ")}: down ${Math.round(fall.drop)} points. If nothing changes it may be about ${pct(fall.next)} next time. ${fall.words}. Extra classes for students near the pass mark may help; you decide.`,
      source: `published results of ${names.join(", ")} for ${cls}, complete results only`,
      href: "/reports-analytics/analytics?area=exams", hrefLabel: "Open Analytics",
    });
  }
  return out;
}

/** A class's pass % must fall at least this many points between two exams before it is raised. */
export const CLASS_DROP = 10;

/**
 * A meaningful fall in a class's pass %: the last exam at least CLASS_DROP
 * points below the one before. Says how certain it is: two exams are only an
 * early sign; three falling in a row are likelier to go on.
 */
export function classDrop(percents: number[]): { drop: number; next: number; certainty: Certainty; words: string } | null {
  if (percents.length < 2) return null;
  const drop = percents[percents.length - 2] - percents[percents.length - 1];
  if (drop < CLASS_DROP) return null;
  const fallingTwice = percents.length >= 3 && percents[0] > percents[1];
  const next = projectNext(fallingTwice ? percents : percents.slice(-2))!;
  return fallingTwice
    ? { drop, next, certainty: "medium", words: `Based on ${percents.length} tests, falling each time` }
    : { drop, next, certainty: "low", words: percents.length === 2 ? "Based on only 2 tests, so this is an early sign" : "Based on the last 2 tests only (it was rising before), so this is an early sign" };
}

async function feeForecasts(c: Ctx): Promise<Forecast[]> {
  if (!BUILT_MODULES.has("fee-management")) return [];
  const soon = await c.tx.studentFeeDue.findMany({
    where: { state: "OPEN", kind: { in: ["FEE", "CHARGE"] }, balancePaise: { gt: 0 }, dueDate: { gte: c.today, lte: addDays(c.today, 30) } },
    select: { studentId: true, balancePaise: true },
  });
  if (!soon.length) return [];
  const ids = [...new Set(soon.map((d) => d.studentId))];
  // Each student's past year: how many days after the due date each due was cleared (or is still open).
  const past = await c.tx.studentFeeDue.findMany({
    where: { studentId: { in: ids }, state: "OPEN", kind: { in: ["FEE", "CHARGE"] }, dueDate: { gte: addDays(c.today, -365), lt: c.today } },
    select: { id: true, studentId: true, dueDate: true, balancePaise: true },
  });
  const allocs = await c.tx.paymentAllocation.findMany({ where: { dueId: { in: past.map((d) => d.id) }, payment: { status: "POSTED" } }, select: { dueId: true, payment: { select: { paymentDate: true } } } });
  const lastPay = new Map<string, Date>();
  for (const a of allocs) { const cur = lastPay.get(a.dueId); if (!cur || a.payment.paymentDate > cur) lastPay.set(a.dueId, a.payment.paymentDate); }
  const late = new Map<string, number[]>();
  for (const d of past) {
    const cleared = d.balancePaise <= BigInt(0) ? lastPay.get(d.id) ?? d.dueDate : null;
    const days = Math.max(0, Math.round(((cleared ?? c.today).getTime() - d.dueDate.getTime()) / DAY_MS));
    late.set(d.studentId, [...(late.get(d.studentId) ?? []), days]);
  }
  let total = BigInt(0), atRisk = BigInt(0);
  const risky: { id: string; amount: bigint; typical: number }[] = [];
  const amountOf = new Map<string, bigint>();
  for (const d of soon) { total += d.balancePaise; amountOf.set(d.studentId, (amountOf.get(d.studentId) ?? BigInt(0)) + d.balancePaise); }
  for (const id of ids) {
    const h = payHabit(late.get(id) ?? []);
    if (!h.usuallyLate) continue;
    atRisk += amountOf.get(id)!;
    risky.push({ id, amount: amountOf.get(id)!, typical: h.typical! });
  }
  if (!risky.length) return [];
  risky.sort((a, b) => Number(b.amount - a.amount));
  const who = await names(c.tx, risky.slice(0, 5).map((r) => r.id));
  const share = Math.round((Number(atRisk) / Number(total)) * 100);
  const promised = await promisesAhead(c.tx, c.today, 30, total - atRisk);
  return [{
    key: `fee-late:${month(c.today)}`, area: "fees", strength: share >= 25 ? "ACT_NOW" : "WATCH", value: share, score: 50, certainty: "medium",
    title: `${wholeRupees(atRisk)} of the next 30 days’ fees may come in late`,
    body: `${formatRupeesShort(total)} falls due by ${formatDate(addDays(c.today, 30), "UTC")}. ${plural(risky.length, "student")} owing ${formatRupeesShort(atRisk)} (${share}%) usually pay well after the due date: ${risky.slice(0, 5).map((r) => `${who.get(r.id) ?? "a student"} (${wholeRupees(r.amount)}, usually about ${r.typical} days late)`).join("; ")}${risky.length > 5 ? "; and others" : ""}.${promised.words} A friendly reminder or a call before the due date may help; you decide.`,
    source: `fee dues falling due in the next 30 days, and when each of these students cleared their dues in the last 12 months${promised.source}`,
    href: "/fee-management/dashboard", hrefLabel: "Open Fee Dashboard",
  }];
}

/** Leaving signals that count fee evidence carry this key start, so only people with the school's fees see them. */
export const LEAVING_WITH_FEES = "leaving-f:";
/** At most this many leaving signals are kept; Looking ahead shows the strongest few and "and N more". */
const MAX_LEAVING = 50;

/** The facts behind "may be thinking of leaving", each from the school's own records. */
export type LeavingEvidence = {
  /** Attendance fell three months in a row, by 5 points or more, to near or below the threshold. */
  falling: boolean;
  /** Many absences with no reason known yet. */
  unknown: boolean;
  /** An open marks flag. */
  marks: boolean;
  /** An open fee flag (fees overdue beyond the rule); only for people with the school's fees. */
  fees: boolean;
  /** A family that paid on time before has stopped paying; only for people with the school's fees. */
  stoppedPaying: boolean;
};

/**
 * "May be thinking of leaving" needs combined evidence: attendance falling for
 * three months or many unexplained absences, plus another area (marks, fees,
 * or both attendance signs); or a family that has stopped paying after paying
 * on time before. A low mark with some fees due is not enough. Returns the
 * strength of the evidence (higher is stronger), or null.
 */
export function leavingScore(e: LeavingEvidence): number | null {
  const attendance = e.falling || e.unknown;
  const other = e.marks || e.fees || (e.falling && e.unknown);
  if (!(attendance && other) && !e.stoppedPaying) return null;
  // Stopped paying already means fees are overdue: the two are not counted twice.
  return (e.falling ? 2 : 0) + (e.unknown ? 2 : 0) + (e.marks ? 1 : 0) + (e.fees && !e.stoppedPaying ? 1 : 0) + (e.stoppedPaying ? 2 : 0);
}
/** Evidence this strong is "Act now". */
export const LEAVING_ACT_NOW = 5;

/**
 * A family that paid on time before and has now stopped: the latest due is 30
 * or more days overdue and unpaid, and the two or more installments before it
 * were each cleared within 15 days of the due date. `dues` are the year's
 * installments (one per due date), oldest first.
 */
export function stoppedPaying(dues: { daysLate: number; open: boolean }[]): boolean {
  const lastOpen = dues.map((d, i) => (d.open && d.daysLate >= 30 ? i : -1)).filter((i) => i >= 0)[0];
  if (lastOpen === undefined) return false;
  const before = dues.slice(0, lastOpen);
  return before.length >= 2 && before.every((d) => !d.open && d.daysLate <= 15);
}

/** Monthly attendance %s, oldest first, fell each month by 5 points or more in all, ending below `near`. */
export function fallingThreeMonths(ps: (number | null)[], near: number): boolean {
  if (ps.length < 3 || ps.some((p) => p === null)) return false;
  const [a, b, c] = ps as number[];
  return a > b && b > c && a - c >= 5 && c < near;
}

async function leavingForecasts(c: Ctx, enrolled: Enrolled[]): Promise<Forecast[]> {
  if (!enrolled.length) return [];
  const ids = enrolled.map((e) => e.studentId);
  const threshold = (await attendanceSettings(c.tx, c.ctx)).thresholdPercent;
  // Attendance by month for the last three months (this one so far).
  const months = [2, 1, 0].map((back) => {
    const s = new Date(Date.UTC(c.today.getUTCFullYear(), c.today.getUTCMonth() - back, 1));
    const e = back === 0 ? c.today : new Date(Date.UTC(c.today.getUTCFullYear(), c.today.getUTCMonth() - back + 1, 0));
    return { s: s < c.year.startDate ? c.year.startDate : s, e };
  });
  const sums = await Promise.all(months.map((m) => (m.e < m.s ? null : attendanceSummary(c.tx, c.ctx, { studentIds: ids, from: m.s, to: m.e, today: c.today }))));
  const [mixes, open] = await Promise.all([
    reasonMix(c.tx, c.ctx, ids, c.year.startDate, c.today),
    c.tx.riskFlag.findMany({ where: { closedAt: null, studentId: { in: ids }, area: { in: ["marks", "fees"] } }, select: { studentId: true, area: true, reason: true } }),
  ]);
  const marks = new Set(open.filter((f) => f.area === "marks").map((f) => f.studentId));
  const feeWords = new Map(open.filter((f) => f.area === "fees").map((f) => [f.studentId, f.reason.split("\n").map((l) => l.charAt(0).toLowerCase() + l.slice(1)).join("; ")]));
  const fees = new Set(feeWords.keys());
  const stopped = BUILT_MODULES.has("fee-management") ? await familiesStoppedPaying(c, [...fees]) : new Set<string>();
  const found: { id: string; e: LeavingEvidence; score: number; feeScore: number | null; ps: (number | null)[] }[] = [];
  for (const id of ids) {
    const ps = sums.map((s) => (s ? (s.people.get(id)?.countedDays ?? 0) >= 5 ? s.people.get(id)!.percent : null : null));
    const e: LeavingEvidence = {
      falling: fallingThreeMonths(ps, threshold + 5),
      unknown: mostlyUnexplained(mixes.get(id), UNEXPLAINED_ALONE),
      marks: marks.has(id), fees: fees.has(id), stoppedPaying: stopped.has(id),
    };
    // Without the fee evidence: what people without the school's fees may see.
    const score = leavingScore({ ...e, fees: false, stoppedPaying: false });
    const feeScore = e.fees || e.stoppedPaying ? leavingScore(e) : null;
    if (score === null && feeScore === null) continue;
    found.push({ id, e, score: score ?? 0, feeScore, ps });
  }
  // Strongest first; at most MAX_LEAVING.
  found.sort((a, b) => Math.max(b.score, b.feeScore ?? 0) - Math.max(a.score, a.feeScore ?? 0));
  const top = found.slice(0, MAX_LEAVING);
  if (!top.length) return [];
  const who = await names(c.tx, top.map((f) => f.id));
  const sectionOf = new Map(enrolled.map((e) => [e.studentId, e.sectionId]));
  const cls = await classLabels(c.tx, top.map((f) => sectionOf.get(f.id)!));
  const monthNames = months.map((m) => new Intl.DateTimeFormat("en-IN", { month: "long", timeZone: "UTC" }).format(m.s));
  const item = (f: (typeof top)[number], withFees: boolean): Forecast => {
    const facts: string[] = [];
    const basis: string[] = [];
    if (f.e.falling) { facts.push(`attendance fell three months in a row (${f.ps.map((p, i) => `${monthNames[i]} ${pct(p!)}`).join(", ")})`); basis.push("attendance by month"); }
    if (f.e.unknown) { const m = mixes.get(f.id)!; facts.push(`${unexplained(m)} of ${m.absent} absent days have no reason known yet`); basis.push("the absence reasons"); }
    if (f.e.marks) { facts.push("there is an open marks flag"); basis.push("open Early Warning flags"); }
    if (withFees && f.e.fees) { facts.push(feeWords.get(f.id)!); basis.push("open fee flags"); }
    if (withFees && f.e.stoppedPaying) { facts.push("the family paid on time before and has now stopped paying"); basis.push("when each due was paid this year"); }
    const score = withFees ? f.feeScore! : f.score;
    return {
      key: `${withFees ? LEAVING_WITH_FEES : "leaving:"}${f.id}`, area: "students", strength: score >= LEAVING_ACT_NOW ? "ACT_NOW" : "WATCH", studentId: f.id, value: score,
      score: 20 + score * 5, certainty: score >= LEAVING_ACT_NOW ? "medium" : "low",
      title: `${who.get(f.id) ?? "A student"} (${cls.get(sectionOf.get(f.id)!) ?? "class"}) may be thinking of leaving`,
      body: `${facts.length > 1 ? "Several signs together" : "One strong sign"}: ${facts.join("; ")}. Signs like these together often come before a family moves their child. A friendly talk with the family may help; you decide.`,
      source: `${[...new Set(basis)].join(", ")} this year`,
      href: `/student-management/students/${f.id}`, hrefLabel: "Open profile",
    };
  };
  const out: Forecast[] = [];
  for (const f of top) {
    if (f.score > 0) out.push(item(f, false));
    // People with the school's fees see the fuller one instead (forecastsFor).
    if (f.feeScore !== null && f.feeScore > f.score) out.push(item(f, true));
  }
  return out;
}

/** Students whose family paid the year's earlier dues on time and has now stopped (stoppedPaying). */
async function familiesStoppedPaying(c: Ctx, studentIds: string[]): Promise<Set<string>> {
  if (!studentIds.length) return new Set();
  const dues = await c.tx.studentFeeDue.findMany({
    where: { studentId: { in: studentIds }, state: "OPEN", kind: { in: ["FEE", "CHARGE"] }, dueDate: { gte: addDays(c.today, -365), lt: c.today } },
    select: { id: true, studentId: true, dueDate: true, balancePaise: true }, orderBy: { dueDate: "asc" },
  });
  const allocs = await c.tx.paymentAllocation.findMany({ where: { dueId: { in: dues.map((d) => d.id) }, payment: { status: "POSTED" } }, select: { dueId: true, payment: { select: { paymentDate: true } } } });
  const lastPay = new Map<string, Date>();
  for (const a of allocs) { const cur = lastPay.get(a.dueId); if (!cur || a.payment.paymentDate > cur) lastPay.set(a.dueId, a.payment.paymentDate); }
  // One entry per due date (an installment), not per fee head: three heads due on one day are one payment.
  const by = new Map<string, Map<string, { daysLate: number; open: boolean }>>();
  for (const d of dues) {
    const open = d.balancePaise > BigInt(0);
    const until = open ? c.today : lastPay.get(d.id) ?? d.dueDate;
    const late = Math.max(0, Math.round((until.getTime() - d.dueDate.getTime()) / DAY_MS));
    const dates = by.get(d.studentId) ?? new Map<string, { daysLate: number; open: boolean }>();
    const k = d.dueDate.toISOString().slice(0, 10);
    const cur = dates.get(k);
    dates.set(k, { daysLate: Math.max(cur?.daysLate ?? 0, late), open: (cur?.open ?? false) || open });
    by.set(d.studentId, dates);
  }
  return new Set([...by.entries()].filter(([, dates]) => stoppedPaying([...dates.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v))).map(([id]) => id));
}

async function admissionForecasts(c: Ctx): Promise<Forecast[]> {
  if (!BUILT_MODULES.has("admission-management")) return [];
  const s = await admissionSettings(c.tx, c.ctx);
  const year = await admissionYear(c.tx, c.ctx, s);
  if (!year) return [];
  const sections = await c.tx.section.findMany({ where: { academicYearId: year.id, archivedAt: null }, select: { classId: true, seats: true } });
  if (!sections.length) return [];
  const seats = new Map<string, number>();
  for (const x of sections) seats.set(x.classId, (seats.get(x.classId) ?? 0) + x.seats);
  const classes = await c.tx.schoolClass.findMany({ where: { archivedAt: null, campusId: year.campusId }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
  const nextYear = year.id !== c.year.id;
  // Next year's seats are forecast only once there is enough to go on: classes with
  // new admissions only (no class below) from ENTRY_CLASS_DAYS before the year starts.
  const daysToStart = Math.round((year.startDate.getTime() - c.today.getTime()) / DAY_MS);
  const lastYear = nextYear ? await c.tx.academicYear.findFirst({ where: { archivedAt: null, campusId: c.year.campusId, endDate: { lt: c.year.startDate } }, orderBy: { startDate: "desc" }, select: { id: true, name: true } }) : null;
  const [inYear, nowIn, approved, apps, enquiries, closed, history] = await Promise.all([
    c.tx.enrolment.groupBy({ by: ["classId"], where: { academicYearId: year.id, archivedAt: null, status: "STUDYING" }, _count: { _all: true } }),
    // Moving up: this year's students not yet on next year's roll.
    nextYear ? c.tx.enrolment.groupBy({ by: ["classId"], where: { academicYearId: c.year.id, archivedAt: null, status: "STUDYING", student: { archivedAt: null, enrolments: { none: { academicYearId: year.id, archivedAt: null } } } }, _count: { _all: true } }) : Promise.resolve([]),
    c.tx.application.groupBy({ by: ["classId"], where: { academicYearId: year.id, archivedAt: null, stage: "APPROVED" }, _count: { _all: true } }),
    c.tx.application.groupBy({ by: ["classId"], where: { academicYearId: year.id, archivedAt: null, stage: { in: ["SUBMITTED", "SUBMITTED_ONLINE", "REVIEWED", "DOCUMENTS", "TEST_INTERVIEW", "DECISION", "WAITING_LIST"] } }, _count: { _all: true } }),
    c.tx.enquiry.groupBy({ by: ["classId"], where: { academicYearId: year.id, archivedAt: null, closedAt: null, status: { notIn: ["applied", "admitted", "lost"] } }, _count: { _all: true } }),
    // The school's own joining rate: enquiries of the last 12 months that are settled, and how many were admitted.
    c.tx.enquiry.groupBy({ by: ["status"], where: { archivedAt: null, createdAt: { gte: new Date(c.today.getTime() - 365 * DAY_MS) }, status: { in: ["admitted", "lost", "applied"] } }, _count: { _all: true } }),
    // The school's own continuation rate: last year's students, and how many are on this year's roll.
    lastYear ? Promise.all([
      c.tx.enrolment.count({ where: { academicYearId: lastYear.id, archivedAt: null } }),
      c.tx.enrolment.count({ where: { academicYearId: lastYear.id, archivedAt: null, student: { enrolments: { some: { academicYearId: c.year.id, archivedAt: null } } } } }),
    ]) : Promise.resolve([0, 0] as const),
  ]);
  const count = (rows: { classId: string | null; _count: { _all: number } }[], id: string) => rows.find((r) => r.classId === id)?._count._all ?? 0;
  const settled = closed.reduce((a, r) => a + r._count._all, 0);
  const joined = closed.find((r) => r.status === "admitted")?._count._all ?? 0;
  const joinRate = settled >= 10 ? joined / settled : null;
  const contRate = continuationRate(history[0], history[1]);
  const contWords = contRate !== null && lastYear ? `about ${Math.round(contRate * 100)}% of students continue to the next year (${history[1]} of ${history[0]} from ${lastYear.name})` : null;
  const joinWords = joinRate !== null ? ` (about ${Math.round(joinRate * 100)}% of enquiries join, from the last 12 months)` : "";
  const sourceWords = `sections and seats of ${year.name}, this year's roll${contWords ? `, last year's roll` : ""}, approved applications and open enquiries`;
  const out: Forecast[] = [];
  const empties: { name: string; empty: number; capacity: number; atLeast: boolean }[] = [];
  classes.forEach((cl, i) => {
    const capacity = seats.get(cl.id);
    if (!capacity) return;
    const below = nextYear && i > 0 ? classes[i - 1] : null;
    const movingUp = below ? count(nowIn, below.id) : 0;
    const inClass = count(inYear, cl.id);
    const appr = count(approved, cl.id);
    const pipeline = count(apps, cl.id) + count(enquiries, cl.id);
    // Not enough to go on yet: a class filled only by new admissions, early in the season.
    if (nextYear && !movingUp && daysToStart > ENTRY_CLASS_DAYS) return;
    const certain = inClass + appr;
    const f = seatForecast({ seats: capacity, inClass, movingUp, continueRate: contRate, approved: appr, pipeline, joinRate });
    const parts = [
      inClass ? `${inClass} already in the class` : null,
      movingUp ? (contRate !== null ? `about ${f.moving} of the ${movingUp} in ${below!.name} now (${contWords})` : `the ${movingUp} in ${below!.name} now`) : null,
      `${appr} approved`,
      `${pipeline} open enquiries and applications${joinWords}`,
    ].filter(Boolean);
    const basis = parts.join(", ");
    const noHistory = movingUp > 0 && contRate === null;
    if (certain > capacity || (!noHistory && f.empty < 0)) {
      // More students than seats: from the certain numbers alone, or from the school's own rates.
      const expected = certain > capacity ? certain : f.expected;
      out.push({
        key: `seats-over:${year.id}:${cl.id}`, area: "admissions", strength: certain > capacity ? "ACT_NOW" : "WATCH", value: expected,
        score: certain > capacity ? 60 : 35, certainty: certain > capacity ? "high" : "medium",
        title: `${cl.name} may need ${expected - capacity} more ${expected - capacity === 1 ? "seat" : "seats"} in ${year.name}`,
        body: `Expected about ${expected} students for ${capacity} seats: ${basis}. Another section or a waiting list may be needed; you decide.`,
        source: sourceWords, href: "/admission-management/applications", hrefLabel: "Open Applications",
      });
      return;
    }
    if (noHistory) {
      // No promotion history yet: only the best case is certain. Say so, and warn only if seats stay empty even then.
      const best = inClass + movingUp + appr + pipeline;
      const empty = capacity - best;
      if (empty < Math.max(5, Math.round(capacity * 0.2))) return;
      empties.push({ name: cl.name, empty, capacity, atLeast: true });
      out.push({
        key: `seats-empty:${year.id}:${cl.id}`, area: "admissions", strength: "WATCH", value: empty, score: 30, certainty: "medium",
        title: `At least ${empty} of ${capacity} seats in ${cl.name} may stay empty in ${year.name}`,
        body: `Even if all ${movingUp} students in ${below!.name} move up and every open enquiry and application joins, ${cl.name} would have about ${best} students: ${basis}. There is no promotion history in School OS yet to say how many usually continue, so the real number of empty seats may be higher. Following up open enquiries may help; you decide.`,
        source: `${sourceWords}; no earlier year to learn the continuation rate from`, href: "/admission-management/enquiries", hrefLabel: "Open Enquiries",
      });
      return;
    }
    if (certain + movingUp + pipeline > 0 && f.empty >= Math.max(5, Math.round(capacity * 0.2))) {
      empties.push({ name: cl.name, empty: f.empty, capacity, atLeast: false });
      out.push({
        key: `seats-empty:${year.id}:${cl.id}`, area: "admissions", strength: "WATCH", value: f.empty, score: 30, certainty: joinRate === null && pipeline ? "low" : "medium",
        title: `About ${f.empty} of ${capacity} seats in ${cl.name} may stay empty in ${year.name}`,
        body: `Expected about ${f.expected} students: ${basis}${joinRate === null && pipeline ? ". There are not yet enough settled enquiries to know how many join, so open ones are not counted" : ""}. Following up open enquiries may help; you decide.`,
        source: sourceWords, href: "/admission-management/enquiries", hrefLabel: "Open Enquiries",
      });
    }
  });
  // Many classes with empty seats: one suggestion with every class in it, not one each.
  if (empties.length > 3) {
    const total = empties.reduce((a, e) => a + e.empty, 0);
    const seatsAll = empties.reduce((a, e) => a + e.capacity, 0);
    const atLeast = empties.some((e) => e.atLeast);
    return [
      ...out.filter((f) => !f.key.startsWith("seats-empty:")),
      {
        key: `seats-empty:${year.id}:classes`, area: "admissions", strength: "WATCH", value: total, score: 40, certainty: "medium",
        title: `${atLeast ? "At least" : "About"} ${total} of ${seatsAll} seats in ${empties.length} classes may stay empty in ${year.name}`,
        body: `By class: ${empties.map((e) => `${e.name} ${e.atLeast ? "at least" : "about"} ${e.empty} of ${e.capacity}`).join(", ")}. Worked out from the students moving up${contWords ? ` (${contWords})` : ", counting everyone (there is no promotion history in School OS yet)"}, approved admissions and open enquiries${joinWords}. Following up open enquiries, or fewer sections, may help; you decide.`,
        source: sourceWords, href: "/admission-management/enquiries", hrefLabel: "Open Enquiries",
      },
    ];
  }
  return out;
}

async function staffForecasts(c: Ctx): Promise<Forecast[]> {
  const until = addDays(c.today, 7);
  const [leave, uncovered] = await Promise.all([
    c.tx.leaveRequest.findMany({ where: { staffId: { not: null }, status: "APPROVED", archivedAt: null, fromDate: { lte: until }, toDate: { gte: addDays(c.today, 1) } }, select: { staffId: true, fromDate: true, toDate: true } }),
    c.tx.substitution.findMany({ where: { archivedAt: null, status: "NEEDED", date: { gt: c.today, lte: until } }, select: { date: true } }),
  ]);
  if (!uncovered.length) return [];
  const staffOut = new Set(leave.map((l) => l.staffId));
  const byDay = new Map<string, number>();
  for (const u of uncovered) byDay.set(u.date.toISOString().slice(0, 10), (byDay.get(u.date.toISOString().slice(0, 10)) ?? 0) + 1);
  const [worstDay, worst] = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
  return [{
    key: `subs:${c.today.toISOString().slice(0, 10)}`, area: "staff", strength: uncovered.length >= 6 ? "ACT_NOW" : "WATCH", value: uncovered.length, score: 50, certainty: "high",
    title: `${plural(uncovered.length, "period")} in the next 7 days ${uncovered.length === 1 ? "has" : "have"} no substitute yet`,
    body: `${plural(staffOut.size, "staff member")} on approved leave. The busiest day is ${formatDate(new Date(`${worstDay}T00:00:00Z`), "UTC")} with ${plural(worst, "period")} to cover. Arranging cover now avoids empty classrooms; you decide.`,
    source: "approved staff leave and the substitutions still needed for the next 7 days",
    href: "/academic-management/substitutions", hrefLabel: "Open Substitution",
  }];
}

/** The AI switch that keeps unusual activity (Settings, Modules On/Off: Student insights and early warnings). */
export const INSIGHTS_FEATURE = "ai-insights";

/** Which switch each area belongs to: unusual activity is an insight, leaving both, the rest forecasts. */
export function areaSwitch(area: string): "insights" | "both" | "forecasts" {
  return area === "activity" ? "insights" : area === "students" ? "both" : "forecasts";
}

/**
 * Every signal for the school now, for each campus's current year (gap list
 * G25). Each part stands alone: one failing never hides the others. `on` says
 * which AI switches the school has on: forecasts, insights, or both.
 */
export async function computeForecasts(tx: Tx, ctx: SchoolContext, now = new Date(), on: { forecasts: boolean; insights: boolean } = { forecasts: true, insights: true }): Promise<Forecast[]> {
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { timeZone: true } });
  const today = todayIn(school.timeZone, now);
  const years = await currentYears(tx, ctx);
  if (!years.length) return [];
  // The newer parts load only here (the background job), so pages that read stored signals stay light.
  const { cashForecasts, creditForecasts, marksNeededForecasts, reachForecasts, syllabusForecasts } = await import("./forecasts-more");
  const { unusualForecasts } = await import("./unusual");
  const wants = (area: string) => { const s = areaSwitch(area); return s === "both" ? on.forecasts || on.insights : on[s]; };
  const out: Forecast[] = [];
  const run = async (name: string, part: () => Promise<Forecast[]>) => {
    try {
      // Each in a savepoint, so a failing part leaves the transaction usable for the rest.
      await tx.$executeRawUnsafe(`SAVEPOINT forecast_part`);
      out.push(...(await part()));
      await tx.$executeRawUnsafe(`RELEASE SAVEPOINT forecast_part`);
    } catch (e) {
      await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT forecast_part`);
      console.error(JSON.stringify({ level: "error", event: "forecast-part-failed", part: name, schoolId: ctx.schoolId, error: e instanceof Error ? e.message : String(e) }));
    }
  };
  // Parts about students and classes: once for each campus's year.
  for (const year of years) {
    const c: Ctx = { tx, ctx, today, year };
    const enrolled = await tx.enrolment.findMany({ where: { academicYearId: year.id, archivedAt: null, status: "STUDYING", student: { archivedAt: null } }, select: { studentId: true, sectionId: true, classId: true } });
    const parts: [string, ForecastArea, () => Promise<Forecast[]>][] = [
      ["attendance", "attendance", () => attendanceForecasts(c, enrolled)],
      ["marks", "marks", () => marksForecasts(c, enrolled)],
      ["marks-needed", "marks", () => marksNeededForecasts(c, enrolled)],
      ["students", "students", () => leavingForecasts(c, enrolled)],
      ["admissions", "admissions", () => admissionForecasts(c)],
      ["syllabus", "academic", () => syllabusForecasts(c)],
    ];
    for (const [name, area, part] of parts) if (wants(area)) await run(name, part);
  }
  // Parts about the whole school: once.
  const c: Ctx = { tx, ctx, today, year: years[0] };
  const school_parts: [string, ForecastArea, () => Promise<Forecast[]>][] = [
    ["fees", "fees", () => feeForecasts(c)],
    ["staff", "staff", () => staffForecasts(c)],
    ["finance", "finance", () => cashForecasts(c)],
    ["credits", "messages", () => creditForecasts(c)],
    ["reach", "messages", () => reachForecasts(c)],
    ["unusual", "activity", () => unusualForecasts(c, now)],
  ];
  for (const [name, area, part] of school_parts) if (wants(area)) await run(name, part);
  // One signal per key (a student is on one campus's roll only).
  return out.filter((f, i) => out.findIndex((o) => o.key === f.key) === i);
}

/**
 * Works the signals out again and stores them: new ones are added, changed ones
 * updated, and ones the numbers no longer support are cleared. The Principal
 * and School Admin are told once, in one notification, when new ones appear.
 * Only for schools with Forecasts or Student insights switched on (with the AI
 * assistant); at most every 3 hours unless forced.
 */
export async function refreshForecasts(tx: Tx, ctx: SchoolContext, now = new Date(), opts: { force?: boolean } = {}) {
  const switches = new Set((await tx.schoolFeature.findMany({ where: { schoolId: ctx.schoolId, isOn: true, featureKey: { in: ["ai-assistant", FORECAST_FEATURE, INSIGHTS_FEATURE] } }, select: { featureKey: true } })).map((f) => f.featureKey));
  const on = { forecasts: switches.has(FORECAST_FEATURE), insights: switches.has(INSIGHTS_FEATURE) };
  if (!switches.has("ai-assistant") || (!on.forecasts && !on.insights)) return { skipped: true as const, added: 0, cleared: 0 };
  if (!opts.force) {
    const last = await tx.forecastSignal.findFirst({ orderBy: { computedAt: "desc" }, select: { computedAt: true } });
    if (last && now.getTime() - last.computedAt.getTime() < EVERY_MS) return { skipped: true as const, added: 0, cleared: 0 };
  }
  const list = await computeForecasts(tx, ctx, now, on);
  const existing = await tx.forecastSignal.findMany({ where: { archivedAt: null } });
  const byKey = new Map(existing.map((f) => [f.key, f]));
  const keys = new Set(list.map((f) => f.key));
  let added = 0;
  for (const f of list) {
    const data = { area: f.area, strength: f.strength, title: f.title.slice(0, 300), body: f.body.slice(0, 2000), source: f.source.slice(0, 500), href: f.href ?? null, hrefLabel: f.hrefLabel ?? null, studentId: f.studentId ?? null, value: f.value ?? null, score: f.score ?? null, certainty: f.certainty ?? null, computedAt: now, archivedAt: null };
    if (byKey.has(f.key)) await tx.forecastSignal.update({ where: { id: byKey.get(f.key)!.id }, data });
    else {
      await tx.forecastSignal.upsert({ where: { schoolId_key: { schoolId: ctx.schoolId, key: f.key } }, create: { schoolId: ctx.schoolId, key: f.key, firstSeenAt: now, ...data }, update: data });
      added++;
    }
  }
  const gone = existing.filter((f) => !keys.has(f.key));
  if (gone.length) await tx.forecastSignal.updateMany({ where: { id: { in: gone.map((f) => f.id) } }, data: { archivedAt: now } });
  // Mark the run, so a school with nothing to say is not worked out again every hour.
  if (!list.length) await tx.forecastSignal.upsert({ where: { schoolId_key: { schoolId: ctx.schoolId, key: "_run" } }, create: { schoolId: ctx.schoolId, key: "_run", area: "students", title: "", body: "", source: "", computedAt: now, archivedAt: now }, update: { computedAt: now, archivedAt: now } });

  const decided = new Set((await tx.aiSignalDecision.findMany({ where: { signalKey: { in: list.map((f) => f.key) } }, select: { signalKey: true } })).map((d) => d.signalKey));
  const fresh = await tx.forecastSignal.findMany({ where: { archivedAt: null, notifiedAt: null } });
  const toTell = rankSignals(fresh.filter((f) => !decided.has(f.key)));
  if (toTell.length) {
    const people = new Set<string>();
    for (const role of LEADER_ROLES) for (const id of await loginsWithRole(tx, ctx, role)) people.add(id);
    const urgent = toTell.filter((f) => f.strength === "ACT_NOW").length;
    // The example named in the notification is never about money or one person's changes.
    const example = toTell.find((f) => !["fees", "finance", "activity"].includes(f.area) && !f.key.startsWith(LEAVING_WITH_FEES));
    for (const to of people) {
      await notify(tx, { ...ctx, userId: null }, {
        to, type: "looking-ahead", groupKey: "looking-ahead", link: "/reports-analytics/early-warnings#looking-ahead",
        text: `Looking ahead: ${plural(toTell.length, "new suggestion")}${urgent ? `, ${urgent} to act on soon` : ""}.${example ? ` The most important: ${example.title}.` : ""}`,
        mergedText: (n) => `Looking ahead: ${n} updates with new suggestions`,
      }, now);
    }
    await tx.forecastSignal.updateMany({ where: { id: { in: toTell.map((f) => f.id) } }, data: { notifiedAt: now } });
  }
  return { skipped: false as const, added, cleared: gone.length };
}

type Stored = { key: string; area: string; strength: string; studentId: string | null; score?: number | null; certainty?: string | null; firstSeenAt: Date };

const CERTAINTY_WEIGHT: Record<string, number> = { high: 1, medium: 0.8, low: 0.6 };

/** How important a signal is, for ordering: how much it matters, how soon (Act now), and how sure. */
export function rankOf(f: { strength: string; score?: number | null; certainty?: string | null }) {
  return (f.strength === "ACT_NOW" ? 1.5 : 1) * (f.score ?? 25) * (CERTAINTY_WEIGHT[f.certainty ?? "medium"] ?? 0.8);
}

/** Most important first; the newest first among equals. */
export function rankSignals<T extends Stored>(rows: T[]): T[] {
  return [...rows].sort((a, b) => rankOf(b) - rankOf(a) || b.firstSeenAt.getTime() - a.firstSeenAt.getTime());
}

/**
 * Stored signals one person may see, most important first: fee and finance
 * signals (and fee changes, and leaving signals that count fees) only for
 * people with the whole school's money; unusual activity with Student
 * insights on, the rest with Forecasts on (leaving signals with either).
 * People with fees see a student's fuller leaving signal instead of the other.
 */
export async function forecastsFor(tx: Tx, show: { fees: boolean; finance: boolean; forecasts?: boolean; insights?: boolean }) {
  const forecasts = show.forecasts ?? true, insights = show.insights ?? false;
  const rows = await tx.forecastSignal.findMany({ where: { archivedAt: null, NOT: { key: "_run" } }, orderBy: [{ strength: "asc" }, { firstSeenAt: "desc" }] });
  const withFees = new Set(show.fees ? rows.filter((r) => r.key.startsWith(LEAVING_WITH_FEES)).map((r) => r.studentId) : []);
  return rankSignals(rows.filter((r) => {
    const sw = areaSwitch(r.area);
    if (sw === "insights" ? !insights : sw === "forecasts" ? !forecasts : !(forecasts || insights)) return false;
    if (r.area === "fees" && !show.fees) return false;
    if (r.area === "finance" && !show.finance) return false;
    if ((r.key.startsWith(LEAVING_WITH_FEES) || r.key.startsWith(UNUSUAL_FEE)) && !show.fees) return false;
    if (r.key.startsWith("leaving:") && withFees.has(r.studentId)) return false;
    return true;
  }));
}
