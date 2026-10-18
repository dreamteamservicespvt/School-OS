// Looking ahead (19 Early Warnings, AI forecasts; 00-global §2.1): what may
// happen next in the school, worked out from its own records, so the Principal
// and the office hear about a problem while there is still time to act.
//
// - Attendance: students above the threshold today whose recent pace would take
//   them below it by the end of the year.
// - Marks: students whose results are falling and would go below the pass mark
//   in the next exam at the same pace; classes whose pass % keeps falling.
// - Fees: dues falling in the next 30 days from students who usually pay late.
// - Students: students with open flags in two or more areas (attendance, marks,
//   fees), who may be thinking of leaving.
// - Admissions: seats each class is likely to fill in the admission year.
// - Staff: the coming week's leave and the periods still without a substitute.
// - Finance: cash and bank after the next 30 days of expected fees and usual spending.
//
// Rules, not a black box: every signal is plain arithmetic on the school's own
// records, says which numbers it used, and is labelled "Suggestion". Nothing
// changes until a person adds it for review or says it is not a concern. Fixed
// traits (gender, caste, religion, category, income, address) are never used.
// Worked out by a background job and stored, so pages read it cheaply; the
// school's leaders are told once when something new appears.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { currentYear, currentYears } from "../academic/years";
import { mainCampus } from "../campus";
import { attendanceSettings } from "../attendance/settings";
import { attendanceSummary } from "../attendance/summary";
import { schoolDays } from "../attendance/calendar";
import { leavingWeights, leavingWhy } from "./absence-signals";
import { OPEN_ATTENDANCE_FLAG } from "../attendance/flags";
import { examSettings } from "../exams/settings";
import { forecast as feeForecast } from "../fees/dashboard";
import { promisesAhead } from "../fees/promises";
import { accountBalances } from "../finance/daybook";
import { admissionYear, loadSettings as admissionSettings } from "../admission/settings";
import { loginsWithRole } from "../front-office/people";
import { notify } from "../notifications";
import { formatDate, formatRupees, formatRupeesShort } from "../format";
import { wordList } from "../academic/common";
import { addDays, DAY_MS, todayIn } from "../staff/dates";
import { BUILT_MODULES } from "../modules";

export type ForecastArea = "attendance" | "marks" | "fees" | "students" | "admissions" | "staff" | "finance";
export const FORECAST_AREA_LABEL: Record<ForecastArea, string> = {
  attendance: "Attendance", marks: "Marks", fees: "Fees", students: "Students", admissions: "Admissions", staff: "Staff", finance: "Finance",
};

export type Forecast = {
  key: string; area: ForecastArea; strength: "WATCH" | "ACT_NOW";
  title: string; body: string; source: string;
  href?: string; hrefLabel?: string; studentId?: string; value?: number;
};

/** The feature switch (Settings, Modules On/Off, AI features: Forecasts). */
export const FORECAST_FEATURE = "ai-forecasts";
/** At most this many student signals of one kind, the most urgent first, so the list stays readable. */
const MAX_STUDENTS = 15;
/** Worked out again at most this often by the hourly job. */
const EVERY_MS = 3 * 60 * 60 * 1000;
/** Leaders who hear about new signals. */
const LEADER_ROLES = ["principal", "school-admin"];

const pct = (n: number) => `${Math.round(n * 10) / 10}%`;
/** An estimate in whole rupees: "about ₹9,92,347", never paise (TEACHING-20). */
export const aboutRupees = (paise: bigint) => formatRupees(BigInt(Math.round(Number(paise) / 100)) * BigInt(100));
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

/** Seats likely filled: students already in (or moving up) + approved + the open pipeline at the school's own joining rate. */
export function seatForecast(x: { seats: number; inClass: number; approved: number; pipeline: number; joinRate: number | null }) {
  const fromPipeline = x.joinRate === null ? 0 : Math.round(x.pipeline * x.joinRate);
  const expected = x.inClass + x.approved + fromPipeline;
  return { expected, fromPipeline, empty: x.seats - expected };
}

/* ---------- the signals ---------- */

type Ctx = { tx: Tx; ctx: SchoolContext; today: Date; year: { id: string; startDate: Date; endDate: Date } };

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
    key: `att-proj:${f.e.studentId}:${month(c.today)}`, area: "attendance", strength: f.end < threshold - 10 ? "ACT_NOW" : "WATCH",
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
      title: `${who.get(f.id) ?? "A student"} (${cls.get(section.get(f.id)!) ?? "class"}) may fall below the pass mark in the next exam`,
      body: `Results: ${shown.map((r) => `${exams.get(r.examId!)!.title} ${pct(r.percent!)}`).join(", ")}. At the same pace the next one would be about ${pct(f.next)}, below the ${pass}% pass mark. Extra help in the weak subjects may help; you decide.`,
      source: `published results of ${shown.map((r) => exams.get(r.examId!)!.title).join(", ")} and the ${pass}% pass mark (Exam Settings)`,
      href: `/student-management/students/${f.id}`, hrefLabel: "Open profile",
    });
  }

  // Classes: the pass % fell between the last two exams.
  const byClass = new Map<string, Map<string, { n: number; pass: number }>>();
  for (const r of results) {
    if (!exams.has(r.examId!)) continue;
    const m = byClass.get(r.classId) ?? new Map();
    const cur = m.get(r.examId!) ?? { n: 0, pass: 0 };
    cur.n++;
    if (r.outcome === "Pass") cur.pass++;
    m.set(r.examId!, cur);
    byClass.set(r.classId, m);
  }
  const classNames = new Map((await c.tx.schoolClass.findMany({ where: { id: { in: [...byClass.keys()] } }, select: { id: true, name: true } })).map((x) => [x.id, x.name]));
  for (const [classId, m] of byClass) {
    const list = [...m.entries()].sort((x, y) => when(x[0]) - when(y[0]));
    if (list.length < 2) continue;
    const [pe, pv] = list[list.length - 2];
    const [le, lv] = list[list.length - 1];
    if (pv.n < 5 || lv.n < 5) continue;
    const p1 = (pv.pass / pv.n) * 100, p2 = (lv.pass / lv.n) * 100;
    if (p1 - p2 < 3) continue;
    const next = projectNext([p1, p2])!;
    out.push({
      key: `class-proj:${classId}:${le}`, area: "marks", strength: next < 60 ? "ACT_NOW" : "WATCH", value: next,
      title: `${classNames.get(classId) ?? "A class"} may do worse in the next exam`,
      body: `The pass % fell from ${pct(p1)} in ${exams.get(pe)!.title} to ${pct(p2)} in ${exams.get(le)!.title}. If nothing changes it may be about ${pct(next)} next time. Extra classes for students near the pass mark may help; you decide.`,
      source: `${exams.get(pe)!.title} and ${exams.get(le)!.title} results of ${classNames.get(classId) ?? "the class"}`,
      href: "/reports-analytics/analytics?area=exams", hrefLabel: "Open Analytics",
    });
  }
  return out;
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
    key: `fee-late:${month(c.today)}`, area: "fees", strength: share >= 25 ? "ACT_NOW" : "WATCH", value: share,
    title: `${formatRupees(atRisk)} of the next 30 days’ fees may come in late`,
    body: `${formatRupeesShort(total)} falls due by ${formatDate(addDays(c.today, 30), "UTC")}. ${plural(risky.length, "student")} owing ${formatRupeesShort(atRisk)} (${share}%) usually pay well after the due date: ${risky.slice(0, 5).map((r) => `${who.get(r.id) ?? "a student"} (${formatRupees(r.amount)}, usually ~${r.typical} days late)`).join("; ")}${risky.length > 5 ? "; and others" : ""}.${promised.words} A friendly reminder or a call before the due date may help; you decide.`,
    source: `fee dues falling due in the next 30 days, and when each of these students cleared their dues in the last 12 months${promised.source}`,
    href: "/fee-management/dashboard", hrefLabel: "Open Fee Dashboard",
  }];
}

/** Leaving signals that count a fee flag carry this key start, so only people with the school's fees see them. */
export const LEAVING_WITH_FEES = "leaving-f:";

async function leavingForecasts(c: Ctx, enrolled: Enrolled[]): Promise<Forecast[]> {
  const open = [
    ...await c.tx.riskFlag.findMany({ where: { closedAt: null, academicYearId: c.year.id }, select: { studentId: true, area: true } }),
    // Attendance concerns live on the Attendance Flag (one record; see warnings.ts).
    ...(await c.tx.attendanceFlag.findMany({ where: OPEN_ATTENDANCE_FLAG, select: { studentId: true } })).map((f) => ({ studentId: f.studentId, area: "attendance" })),
  ];
  const enrolledIds = new Set(enrolled.map((e) => e.studentId));
  const areas = new Map<string, Set<string>>();
  for (const f of open) if (enrolledIds.has(f.studentId)) areas.set(f.studentId, (areas.get(f.studentId) ?? new Set()).add(f.area));
  // Weighed by the absence reasons (./absence-signals.ts): unexplained absences count more, sick days less, "Fees dispute" as fees.
  const weights = await leavingWeights(c.tx, c.ctx, areas, c.year.startDate, c.today);
  const many = [...areas.keys()].map((id) => [id, weights.get(id)!.counted] as const).filter(([id]) => weights.get(id)!.score >= 2).slice(0, MAX_STUDENTS);
  if (!many.length) return [];
  const who = await names(c.tx, many.map(([id]) => id));
  const sectionOf = new Map(enrolled.map((e) => [e.studentId, e.sectionId]));
  const cls = await classLabels(c.tx, many.map(([id]) => sectionOf.get(id)!));
  const words: Record<string, string> = { attendance: "attendance", marks: "marks", fees: "fees" };
  return many.map(([id, a]) => {
    // Always in the same order, as a proper list: "attendance, marks and fees" (TEACHING-20).
    const order = Object.keys(words);
    const list = [...a].sort((x, y) => (order.indexOf(x) + 1 || 99) - (order.indexOf(y) + 1 || 99)).map((x) => words[x] ?? x);
    const w = weights.get(id)!;
    return {
      key: `${a.has("fees") ? LEAVING_WITH_FEES : "leaving:"}${id}:${[...a].sort().join("+")}:${month(c.today)}`, area: "students" as const, strength: w.score >= 3 ? "ACT_NOW" as const : "WATCH" as const, studentId: id,
      title: `${who.get(id) ?? "A student"} (${cls.get(sectionOf.get(id)!) ?? "class"}) may be thinking of leaving`,
      body: `There are open early warnings in ${a.size} ${a.size === 1 ? "area" : "areas"}${list.length ? ` (${wordList(list)})` : ""}.${leavingWhy(w)} Problems in two or more areas at once, or many absences nobody can explain, often come before a family moves their child. A friendly talk with the family may help; you decide.`,
      source: leavingWhy(w) ? "open Early Warning flags and the absence reasons this year" : "open Early Warning flags this year",
      href: `/student-management/students/${id}`, hrefLabel: "Open profile",
    };
  });
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
  const classes = await c.tx.schoolClass.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
  const nextYear = year.id !== c.year.id;
  const [inYear, nowIn, approved, apps, enquiries, closed] = await Promise.all([
    c.tx.enrolment.groupBy({ by: ["classId"], where: { academicYearId: year.id, archivedAt: null, status: "STUDYING" }, _count: { _all: true } }),
    nextYear ? c.tx.enrolment.groupBy({ by: ["classId"], where: { academicYearId: c.year.id, archivedAt: null, status: "STUDYING" }, _count: { _all: true } }) : Promise.resolve([]),
    c.tx.application.groupBy({ by: ["classId"], where: { academicYearId: year.id, archivedAt: null, stage: "APPROVED" }, _count: { _all: true } }),
    c.tx.application.groupBy({ by: ["classId"], where: { academicYearId: year.id, archivedAt: null, stage: { in: ["SUBMITTED", "SUBMITTED_ONLINE", "REVIEWED", "DOCUMENTS", "TEST_INTERVIEW", "DECISION", "WAITING_LIST"] } }, _count: { _all: true } }),
    c.tx.enquiry.groupBy({ by: ["classId"], where: { academicYearId: year.id, archivedAt: null, closedAt: null, status: { notIn: ["applied", "admitted", "lost"] } }, _count: { _all: true } }),
    // The school's own joining rate: enquiries of the last 12 months that are settled, and how many were admitted.
    c.tx.enquiry.groupBy({ by: ["status"], where: { archivedAt: null, createdAt: { gte: new Date(c.today.getTime() - 365 * DAY_MS) }, status: { in: ["admitted", "lost", "applied"] } }, _count: { _all: true } }),
  ]);
  const count = (rows: { classId: string | null; _count: { _all: number } }[], id: string) => rows.find((r) => r.classId === id)?._count._all ?? 0;
  const settled = closed.reduce((a, r) => a + r._count._all, 0);
  const joined = closed.find((r) => r.status === "admitted")?._count._all ?? 0;
  const joinRate = settled >= 10 ? joined / settled : null;
  const yearHasStudents = inYear.some((r) => r._count._all > 0);
  const out: Forecast[] = [];
  classes.forEach((cl, i) => {
    const capacity = seats.get(cl.id);
    if (!capacity) return;
    // Next year before promotion: the class below moves up into this one.
    const movingUp = nextYear && !yearHasStudents && i > 0 ? count(nowIn, classes[i - 1].id) : 0;
    const already = count(inYear, cl.id) + movingUp;
    const pipeline = count(apps, cl.id) + count(enquiries, cl.id);
    const f = seatForecast({ seats: capacity, inClass: already, approved: count(approved, cl.id), pipeline, joinRate });
    const basis = `${already} ${movingUp ? `moving up from ${classes[i - 1].name}` : "already in the class"}, ${count(approved, cl.id)} approved, ${pipeline} open enquiries and applications${joinRate !== null ? ` (about ${Math.round(joinRate * 100)}% of enquiries join, from the last 12 months)` : ""}`;
    if (f.empty < 0) {
      out.push({
        key: `seats-over:${year.id}:${cl.id}`, area: "admissions", strength: "ACT_NOW", value: f.expected,
        title: `${cl.name} may need ${-f.empty} more ${-f.empty === 1 ? "seat" : "seats"} in ${year.name}`,
        body: `Expected about ${f.expected} students for ${capacity} seats: ${basis}. Another section or a waiting list may be needed; you decide.`,
        source: `sections and seats of ${year.name}, enrolments, applications and enquiries`, href: "/admission-management/applications", hrefLabel: "Open Applications",
      });
    } else if (pipeline + already > 0 && f.empty >= Math.max(5, Math.round(capacity * 0.2))) {
      out.push({
        key: `seats-empty:${year.id}:${cl.id}`, area: "admissions", strength: "WATCH", value: f.empty,
        title: `About ${f.empty} of ${capacity} seats in ${cl.name} may stay empty in ${year.name}`,
        body: `Expected about ${f.expected} students: ${basis}${joinRate === null ? ". There are not yet enough settled enquiries to know how many join, so open ones are not counted" : ""}. Following up open enquiries may help; you decide.`,
        source: `sections and seats of ${year.name}, enrolments, applications and enquiries`, href: "/admission-management/enquiries", hrefLabel: "Open Enquiries",
      });
    }
  });
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
    key: `subs:${c.today.toISOString().slice(0, 10)}`, area: "staff", strength: uncovered.length >= 6 ? "ACT_NOW" : "WATCH", value: uncovered.length,
    title: `${plural(uncovered.length, "period")} in the next 7 days ${uncovered.length === 1 ? "has" : "have"} no substitute yet`,
    body: `${plural(staffOut.size, "staff member")} on approved leave. The busiest day is ${formatDate(new Date(`${worstDay}T00:00:00Z`), "UTC")} with ${plural(worst, "period")} to cover. Arranging cover now avoids empty classrooms; you decide.`,
    source: "approved staff leave and the substitutions still needed for the next 7 days",
    href: "/academic-management/substitutions", hrefLabel: "Open Substitution",
  }];
}

async function financeForecasts(c: Ctx): Promise<Forecast[]> {
  if (!BUILT_MODULES.has("finance-management")) return [];
  const balances = await accountBalances(c.tx, c.ctx);
  if (!balances.size) return [];
  const cash = [...balances.values()].reduce((a, b) => a + b, BigInt(0));
  const from = new Date(Date.UTC(c.today.getUTCFullYear(), c.today.getUTCMonth() - 3, 1));
  const to = addDays(new Date(Date.UTC(c.today.getUTCFullYear(), c.today.getUTCMonth(), 1)), -1);
  const spent = await c.tx.dayBookEntry.groupBy({ by: ["direction"], where: { date: { gte: from, lte: to }, section: { notIn: ["opening", "transfer"] }, sourceType: { notIn: ["opening-balance", "transfer"] } }, _sum: { amountPaise: true } });
  const out3 = spent.find((r) => r.direction === "OUT")?._sum.amountPaise ?? BigInt(0);
  if (out3 <= BigInt(0)) return [];
  const monthlyOut = out3 / BigInt(3);
  const fc = await feeForecast(c.tx, c.today);
  const inflow = fc.months[0]?.expected;
  if (inflow === null || inflow === undefined) return [];
  const after = cash + inflow - monthlyOut;
  const salary = (await c.tx.payrollRun.findFirst({ where: { status: { in: ["APPROVED", "PAID", "LOCKED"] } }, orderBy: { month: "desc" }, select: { netPaise: true } }))?.netPaise ?? BigInt(0);
  const floor = salary > BigInt(0) ? salary : monthlyOut / BigInt(2);
  if (after >= floor) return [];
  return [{
    key: `cash:${month(c.today)}`, area: "finance", strength: after < BigInt(0) ? "ACT_NOW" : "WATCH", value: Number(after) / 100,
    title: after < BigInt(0) ? `Cash may run short by about ${formatRupeesShort(-after)} this month` : `Cash may be low at the end of this month: about ${formatRupeesShort(after)}`,
    body: `Cash and bank now: ${formatRupees(cash)}. Expected fees this month: about ${aboutRupees(inflow)}. Usual spending: about ${aboutRupees(monthlyOut)} a month (average of the last 3 months)${salary > BigInt(0) ? `, and the last salary month was ${formatRupees(salary)}` : ""}. Collecting dues early or moving a payment may help; you decide.`,
    source: `cash and bank balances, the Day Book from ${formatDate(from, "UTC")} to ${formatDate(to, "UTC")} and the fee collection forecast`,
    href: "/finance-management", hrefLabel: "Open Finance Management",
  }];
}

/** Every signal for the school now. Each part stands alone: one failing never hides the others. */
export async function computeForecasts(tx: Tx, ctx: SchoolContext, now = new Date()): Promise<Forecast[]> {
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { timeZone: true } });
  const today = todayIn(school.timeZone, now);
  // Each campus's own current year for its students and seats (a school's campuses can start
  // the year on different dates); the school-wide parts once, with the main campus's year.
  const years = await currentYears(tx, ctx);
  if (!years.length) return [];
  const main = (await currentYear(tx, ctx, await mainCampus(tx, ctx))) ?? years[0];
  const parts: [string, () => Promise<Forecast[]>][] = [];
  for (const year of years) {
    const c: Ctx = { tx, ctx, today, year };
    const enrolled = await tx.enrolment.findMany({ where: { academicYearId: year.id, archivedAt: null, status: "STUDYING", student: { archivedAt: null } }, select: { studentId: true, sectionId: true, classId: true } });
    parts.push(
      ["attendance", () => attendanceForecasts(c, enrolled)],
      ["marks", () => marksForecasts(c, enrolled)],
      ["students", () => leavingForecasts(c, enrolled)],
    );
  }
  const c: Ctx = { tx, ctx, today, year: main };
  parts.push(
    ["fees", () => feeForecasts(c)],
    // Seats: the admission year (Admission Settings), once.
    ["admissions", () => admissionForecasts(c)],
    ["staff", () => staffForecasts(c)],
    ["finance", () => financeForecasts(c)],
  );
  const out: Forecast[] = [];
  for (const [name, part] of parts) {
    try {
      // Each in a savepoint, so a failing part leaves the transaction usable for the rest.
      await tx.$executeRawUnsafe(`SAVEPOINT forecast_part`);
      out.push(...(await part()));
      await tx.$executeRawUnsafe(`RELEASE SAVEPOINT forecast_part`);
    } catch (e) {
      await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT forecast_part`);
      console.error(JSON.stringify({ level: "error", event: "forecast-part-failed", part: name, schoolId: ctx.schoolId, error: e instanceof Error ? e.message : String(e) }));
    }
  }
  return out;
}

/**
 * Works the signals out again and stores them: new ones are added, changed ones
 * updated, and ones the numbers no longer support are cleared. The Principal
 * and School Admin are told once, in one notification, when new ones appear.
 * Only for schools with Forecasts switched on; at most every 3 hours unless forced.
 */
export async function refreshForecasts(tx: Tx, ctx: SchoolContext, now = new Date(), opts: { force?: boolean } = {}) {
  const on = await tx.schoolFeature.findMany({ where: { schoolId: ctx.schoolId, isOn: true, featureKey: { in: ["ai-assistant", FORECAST_FEATURE] } }, select: { featureKey: true } });
  if (on.length < 2) return { skipped: true as const, added: 0, cleared: 0 };
  if (!opts.force) {
    const last = await tx.forecastSignal.findFirst({ orderBy: { computedAt: "desc" }, select: { computedAt: true } });
    if (last && now.getTime() - last.computedAt.getTime() < EVERY_MS) return { skipped: true as const, added: 0, cleared: 0 };
  }
  const list = await computeForecasts(tx, ctx, now);
  const existing = await tx.forecastSignal.findMany({ where: { archivedAt: null } });
  const byKey = new Map(existing.map((f) => [f.key, f]));
  const keys = new Set(list.map((f) => f.key));
  let added = 0;
  for (const f of list) {
    const data = { area: f.area, strength: f.strength, title: f.title.slice(0, 300), body: f.body.slice(0, 2000), source: f.source.slice(0, 500), href: f.href ?? null, hrefLabel: f.hrefLabel ?? null, studentId: f.studentId ?? null, value: f.value ?? null, computedAt: now, archivedAt: null };
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
  const toTell = fresh.filter((f) => !decided.has(f.key));
  if (toTell.length) {
    const people = new Set<string>();
    for (const role of LEADER_ROLES) for (const id of await loginsWithRole(tx, ctx, role)) people.add(id);
    const urgent = toTell.filter((f) => f.strength === "ACT_NOW").length;
    for (const to of people) {
      await notify(tx, { ...ctx, userId: null }, {
        to, type: "looking-ahead", groupKey: "looking-ahead", link: "/reports-analytics/early-warnings#looking-ahead",
        text: `Looking ahead: ${plural(toTell.length, "new suggestion")}${urgent ? `, ${urgent} to act on soon` : ""}. For example: ${toTell[0].title}.`,
        mergedText: (n) => `Looking ahead: ${n} updates with new suggestions`,
      }, now);
    }
    await tx.forecastSignal.updateMany({ where: { id: { in: toTell.map((f) => f.id) } }, data: { notifiedAt: now } });
  }
  return { skipped: false as const, added, cleared: gone.length };
}

/** Stored signals one person may see: fee and finance signals only for people with the whole school's money. */
export async function forecastsFor(tx: Tx, show: { fees: boolean; finance: boolean }) {
  const rows = await tx.forecastSignal.findMany({ where: { archivedAt: null, NOT: { key: "_run" } }, orderBy: [{ strength: "asc" }, { firstSeenAt: "desc" }] });
  return rows.filter((r) => (r.area !== "fees" || show.fees) && (r.area !== "finance" || show.finance) && (!r.key.startsWith(LEAVING_WITH_FEES) || show.fees));
}
