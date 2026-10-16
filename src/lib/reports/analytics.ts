// Analytics (19 §2): trends in students, results, fees, expenses, staff and
// teacher workload, with numbers you can open. Every number that opens a list
// (drill-down) is worked out from the same rows as that list, so the list has
// exactly the count that was tapped. Money and results numbers come from the
// report catalogue (the modules' own report functions), so they agree with
// All Reports and with each module's pages.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { attendanceSummary } from "../attendance/summary";
import { teacherWorkloads } from "../academic/allocation";
import { progressBoard } from "../academic/syllabus";
import { formatRupees, formatRupeesShort } from "../format";
import { reportAccess, moduleOpen, type ReportAccess } from "./access";
import { entryAllowed, findEntry } from "./catalogue";
import { readFilters, type PeriodSetupLike, type Raw } from "./filters";
import { runEntry } from "./run";
import type { Cell, Column, ReportViewer, Row, Table } from "./types";
import { periodFromSearch, type DayRange } from "../periods";

export type AreaKey = "students" | "results" | "finance" | "hr" | "workload" | "teachers" | "admissions";
export const AREA_LABEL: Record<AreaKey, string> = {
  students: "Students", results: "Results", finance: "Finance", hr: "Staff", workload: "Teacher workload", teachers: "Syllabus & teachers", admissions: "Admissions",
};
const AREA_ORDER: AreaKey[] = ["students", "results", "admissions", "finance", "hr", "workload", "teachers"];

/** Areas each ready role sees (prototype AREAS_BY_ROLE); the rest by the modules open to the person. */
const AREAS_BY_ROLE: Record<string, AreaKey[]> = {
  accountant: ["finance"], hr: ["hr"], "academic-head": ["students", "results", "workload", "teachers"], "exam-in-charge": ["results"],
  "admission-counsellor": ["admissions"], "vice-principal": ["students", "results", "admissions", "finance", "hr", "workload"],
  principal: AREA_ORDER, "school-admin": ["students", "results", "admissions", "finance", "hr", "workload"],
};

export function analyticsAreas(who: ReportViewer, a: ReportAccess = reportAccess(who)): AreaKey[] {
  if (!a.pages.analytics) return [];
  const byRole = new Set<AreaKey>();
  for (const k of a.roleKeys) for (const x of AREAS_BY_ROLE[k] ?? []) byRole.add(x);
  if (!a.roleKeys.some((k) => AREAS_BY_ROLE[k])) AREA_ORDER.filter((x) => x !== "teachers").forEach((x) => byRole.add(x));
  return AREA_ORDER.filter((x) => byRole.has(x)).filter((x) => {
    if (x === "students") return moduleOpen(who, "student-management") && who.permissions["student-management"].see === "all";
    if (x === "results") return moduleOpen(who, "examination-results");
    if (x === "finance") return a.fees || a.finance !== null;
    if (x === "hr") return moduleOpen(who, "staff-hr-management") && who.permissions["staff-hr-management"].see === "all";
    if (x === "workload") return moduleOpen(who, "academic-management");
    if (x === "teachers") return a.teacherResults && moduleOpen(who, "academic-management");
    if (x === "admissions") return a.cats.includes("Admissions");
    return false;
  });
}

export type Tone = "ok" | "warn" | "bad" | "info" | "brand";
export type AStat = { label: string; value: string; sub: string; tone?: Tone; icon: string; drill?: string };
export type AChart = {
  key: string; title: string; sub: string; icon: string;
  kind: "hbars" | "bars" | "table" | "empty";
  hbars?: { k: string; v: number; label?: string }[]; max?: number; goal?: number; lowBelow?: number; labelWidth?: number; unit?: string;
  bars?: { k: string; v: number; v2?: number; tone?: Tone }[]; ticks?: number[];
  legend?: [string, string][];
  table?: Table;
  note?: string;
  /** Buttons under the chart that open a list (a class, a teacher). */
  drills?: { label: string; drill: string }[];
  empty?: string;
  /** The chart's data, for "Export the chart data". */
  data: Table;
};
export type Drill = { title: string; sub: string; table: Table; basis: string };
export type AreaView = { stats: AStat[]; charts: AChart[]; drills: Record<string, Drill>; note?: string; banner?: { title: string; body: string } };

export type AnalyticsInput = { tx: Tx; who: ReportViewer; range: DayRange; setup: PeriodSetupLike; today: Date; campusId: string | null; compare: boolean };

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const n = (x: number) => x.toLocaleString("en-IN");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthKey = (x: Date) => x.toISOString().slice(0, 7);
const monthShort = (k: string) => MON[Number(k.slice(5, 7)) - 1];
function monthsBetween(from: Date, to: Date) {
  const out: string[] = [];
  const c = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  while (c <= to && out.length < 36) { out.push(monthKey(c)); c.setUTCMonth(c.getUTCMonth() + 1); }
  return out;
}
const lakhs = (paise: bigint) => Math.round(Number(paise) / 1e7 * 10) / 10; // paise to lakhs of rupees
const tableOf = (columns: Column[], rows: Row[], totals?: Row | null): Table => ({ columns, rows, totals: totals ?? null });
const num = (c: Cell | undefined) => (typeof c === "number" ? c : typeof c === "bigint" ? Number(c) : typeof c === "string" ? Number(c.replace(/[^\d.-]/g, "")) || 0 : 0);
const big = (c: Cell | undefined) => (typeof c === "bigint" ? c : typeof c === "number" ? BigInt(Math.round(c)) : BigInt(0));

/** Runs a catalogue report with the analytics filters; null when the person may not see it. */
async function catalogue(inp: AnalyticsInput, key: string, extra: Record<string, string> = {}, dated = true): Promise<Table | null> {
  const entry = findEntry(key);
  if (!entry || !entryAllowed(entry, reportAccess(inp.who), inp.who)) return null;
  const sp: Raw = { ...extra, ...(inp.campusId ? { campus: inp.campusId } : {}) };
  if (dated && entry.dated) Object.assign(sp, { period: "custom", from: inp.range.from, to: inp.range.to });
  const f = await readFilters(inp.tx, inp.who.ctx, entry, sp, inp.setup, inp.today, inp.campusId);
  return runEntry(inp.tx, inp.who, entry, f);
}

async function yearOf(tx: Tx, today: Date) {
  return tx.academicYear.findFirst({ where: { archivedAt: null, startDate: { lte: today }, endDate: { gte: today } } }) ?? tx.academicYear.findFirst({ where: { archivedAt: null, startDate: { lte: today } }, orderBy: { startDate: "desc" } });
}

/* ---------- Students ---------- */
async function students(inp: AnalyticsInput): Promise<AreaView> {
  const { tx, today } = inp;
  const year = await yearOf(tx, today);
  if (!year) return { stats: [], charts: [], drills: {}, banner: { title: "No academic year yet.", body: "Set up the year in Academics first." } };
  const from = d(inp.range.from), to = d(inp.range.to);
  const enrol = await tx.enrolment.findMany({
    where: { academicYearId: year.id, archivedAt: null, status: "STUDYING", student: { archivedAt: null, ...(inp.campusId ? { campusId: inp.campusId } : {}) } },
    select: { studentId: true, sectionId: true, classId: true, student: { select: { fullName: true, admissionNo: true, gender: true, category: true } } },
  });
  const classes = await tx.schoolClass.findMany({ where: { id: { in: [...new Set(enrol.map((e) => e.classId))] } }, select: { id: true, name: true, sortOrder: true } });
  classes.sort((a, b) => a.sortOrder - b.sortOrder);
  const sections = new Map((await tx.section.findMany({ where: { id: { in: [...new Set(enrol.map((e) => e.sectionId))] } }, include: { schoolClass: { select: { name: true } } } })).map((s) => [s.id, `${s.schoolClass.name.replace(/^Class\s+/i, "")} ${s.name}`]));
  const byClass = classes.map((c) => ({ c, list: enrol.filter((e) => e.classId === c.id) }));
  const total = enrol.length;
  const drills: Record<string, Drill> = {};
  drills["students-by-class"] = {
    title: "Students by class", sub: `${n(total)} on the rolls today`, basis: `Student Management, ${year.name}`,
    table: tableOf([{ key: "cls", label: "Class" }, { key: "n", label: "Students", kind: "number" }], byClass.map((x) => ({ cls: x.c.name, n: x.list.length })), { cls: "All classes", n: total }),
  };

  // Admitted and left in the dates.
  const ids = enrol.map((e) => e.studentId);
  const [joined, left] = await Promise.all([
    tx.student.findMany({ where: { archivedAt: null, joiningDate: { gte: from, lte: to }, ...(inp.campusId ? { campusId: inp.campusId } : {}) }, select: { id: true, fullName: true, admissionNo: true, joiningDate: true } }),
    tx.student.findMany({ where: { leavingDate: { gte: from, lte: to }, ...(inp.campusId ? { campusId: inp.campusId } : {}) }, select: { id: true, fullName: true, admissionNo: true, leavingDate: true, leavingReason: true } }),
  ]);
  drills.admitted = {
    title: `Admitted, ${inp.range.label.toLowerCase()}`, sub: `${joined.length} students`, basis: "Student Management, date of joining",
    table: tableOf([{ key: "name", label: "Student" }, { key: "adm", label: "Admission no." }, { key: "on", label: "Joined", kind: "date" }], joined.sort((a, b) => a.joiningDate!.getTime() - b.joiningDate!.getTime()).map((s) => ({ name: s.fullName, adm: s.admissionNo, on: s.joiningDate }))),
  };

  // Attendance today and in the dates, from Attendance Management's own summary.
  const [day, span] = await Promise.all([
    ids.length ? attendanceSummary(tx, inp.who.ctx, { studentIds: ids, from: today, to: today, today }) : null,
    ids.length ? attendanceSummary(tx, inp.who.ctx, { studentIds: ids, from: from < year.startDate ? year.startDate : from, to, today }) : null,
  ]);
  const absentToday = enrol.filter((e) => { const s = day?.people.get(e.studentId); return s && s.countedDays > 0 && s.absent > 0; });
  const lateToday = enrol.filter((e) => (day?.people.get(e.studentId)?.late ?? 0) > 0).length;
  drills["absent-today"] = {
    title: "Absent today by class", sub: `${absentToday.length} students`, basis: "Attendance register, today",
    table: tableOf([{ key: "name", label: "Student" }, { key: "cls", label: "Class" }], absentToday.map((e) => ({ name: e.student.fullName, cls: sections.get(e.sectionId) ?? "" })).sort((a, b) => String(a.cls).localeCompare(String(b.cls), "en-IN", { numeric: true }))),
  };
  const attRows = byClass.map((x) => {
    let present = 0, counted = 0;
    const absentees: Row[] = [];
    for (const e of x.list) {
      const s = span?.people.get(e.studentId);
      if (!s) continue;
      present += s.present; counted += s.countedDays;
      if (s.absent > 0) absentees.push({ name: e.student.fullName, cls: sections.get(e.sectionId) ?? "", days: s.absent });
    }
    const p = counted ? Math.round((present / counted) * 1000) / 10 : null;
    drills[`att-class:${x.c.id}`] = {
      title: `${x.c.name} · ${p === null ? "not marked" : `${p}%`}`, sub: `${absentees.length} students absent on one or more days, ${inp.range.label.toLowerCase()}`, basis: "Attendance register, the dates chosen",
      table: tableOf([{ key: "name", label: "Student" }, { key: "cls", label: "Section" }, { key: "days", label: "Days absent", kind: "number" }], absentees.sort((a, b) => num(b.days) - num(a.days))),
    };
    return { id: x.c.id, k: x.c.name.replace(/^Class\s+/i, ""), name: x.c.name, v: p };
  });
  const marked = attRows.filter((r) => r.v !== null);
  const dayPct = day && day.overall.countedDays ? day.overall.percent : null;

  // Strength over the years: students on the rolls in each year.
  const years = await tx.academicYear.findMany({ where: { archivedAt: null, startDate: { lte: today } }, orderBy: { startDate: "desc" }, take: 5 });
  const strength = await Promise.all(years.reverse().map(async (y) => ({ k: y.name.replace(/^20(\d\d)-(20)?(\d\d)$/, "$1–$3"), v: await tx.enrolment.count({ where: { academicYearId: y.id, archivedAt: null, ...(inp.campusId ? { student: { campusId: inp.campusId } } : {}) } }) })));

  const months = monthsBetween(from, to);
  const moves = months.map((m) => ({ k: monthShort(m), v: joined.filter((s) => monthKey(s.joiningDate!) === m).length, v2: left.filter((s) => monthKey(s.leavingDate!) === m).length }));
  const girls = enrol.filter((e) => e.student.gender === "Female").length;
  const cats = new Map<string, number>();
  for (const e of enrol) cats.set(e.student.category || "Not recorded", (cats.get(e.student.category || "Not recorded") ?? 0) + 1);
  const catRows = [...cats.entries()].sort((a, b) => b[1] - a[1]);
  const catMax = Math.max(1, ...catRows.map((c) => pct(c[1], total)));

  return {
    drills,
    stats: [
      { label: "Students", value: n(total), sub: inp.compare && strength.length > 1 ? `${total - strength[strength.length - 2].v >= 0 ? "+" : ""}${total - strength[strength.length - 2].v} on last year` : "On the rolls today", icon: "GraduationCap", drill: "students-by-class" },
      { label: "Admitted", value: n(joined.length), sub: `${left.length} left · ${inp.range.label}`, icon: "UserPlus", tone: "ok", drill: "admitted" },
      { label: "Attendance today", value: dayPct === null ? "Not marked" : `${dayPct}%`, sub: `${absentToday.length} absent, ${lateToday} late`, icon: "CalendarCheck2", drill: "absent-today" },
      { label: "Girls", value: `${Math.round(pct(girls, total))}%`, sub: `${n(girls)} of ${n(total)}`, icon: "Users" },
    ],
    charts: [
      { key: "students.strength", title: "Strength over the years", sub: `Students on the rolls each year · ${year.name} today`, icon: "ChartColumn", kind: strength.length ? "bars" : "empty", bars: strength, max: Math.max(10, ...strength.map((s) => s.v)) * 1.1, data: tableOf([{ key: "year", label: "Year" }, { key: "n", label: "Students", kind: "number" }], strength.map((s) => ({ year: s.k, n: s.v }))), empty: "No earlier years yet." },
      {
        key: "students.attendance", title: "Attendance by class", sub: `${inp.range.label} · goal 90% · tap a class to see who was absent`, icon: "CalendarCheck2", kind: marked.length ? "hbars" : "empty",
        hbars: marked.map((r) => ({ k: r.k, v: r.v! })), goal: 90, lowBelow: 90, drills: marked.map((r) => ({ label: r.k, drill: `att-class:${r.id}` })),
        data: tableOf([{ key: "cls", label: "Class" }, { key: "p", label: "Present %", kind: "percent" }], attRows.map((r) => ({ cls: r.name, p: r.v }))), empty: "Attendance is not marked in these dates.",
      },
      {
        key: "students.moves", title: "Admissions and leavers", sub: `By month · ${inp.range.label}`, icon: "UserPlus", kind: joined.length + left.length ? "bars" : "empty", bars: moves, max: Math.max(5, ...moves.map((m) => Math.max(m.v, m.v2))) * 1.15,
        legend: [["bg-brand", `Admitted, ${joined.length}`], ["bg-ink3/30", `Left, ${left.length}`]],
        data: tableOf([{ key: "m", label: "Month" }, { key: "a", label: "Admitted", kind: "number" }, { key: "l", label: "Left", kind: "number" }], months.map((m, i) => ({ m: `${monthShort(m)} ${m.slice(0, 4)}`, a: moves[i].v, l: moves[i].v2 }))), empty: "No admissions or leavers in these dates.",
      },
      { key: "students.category", title: "Social category", sub: `All ${n(total)} students`, icon: "Users", kind: total ? "hbars" : "empty", hbars: catRows.map(([k, v]) => ({ k, v: pct(v, total), label: n(v) })), max: Math.ceil(catMax / 10) * 10, labelWidth: 96, data: tableOf([{ key: "c", label: "Category" }, { key: "n", label: "Students", kind: "number" }, { key: "p", label: "Share", kind: "percent" }], catRows.map(([k, v]) => ({ c: k, n: v, p: pct(v, total) }))), empty: "No students yet." },
    ],
  };
}

/* ---------- Results ---------- */
async function results(inp: AnalyticsInput, exam?: string): Promise<AreaView> {
  const extra: Record<string, string> = exam ? { exam } : {};
  const [byClass, subjects, below] = await Promise.all([catalogue(inp, "ex-results", extra, false), catalogue(inp, "ex-subjects", extra, false), catalogue(inp, "ex-below", extra, false)]);
  if (!byClass || !byClass.rows.length) return { stats: [], charts: [], drills: {}, banner: { title: "No exam results yet this year.", body: "Charts appear when the first exam's marks are entered." } };
  const t = byClass.totals ?? {};
  const examName = byClass.note?.split(".")[0] ?? "Latest exam";
  const subj = new Map<string, { sum: number; n: number }>();
  for (const r of subjects?.rows ?? []) { const k = String(r.subject); const c = subj.get(k) ?? { sum: 0, n: 0 }; c.sum += num(r.average) * num(r.students); c.n += num(r.students); subj.set(k, c); }
  const subjRows = [...subj.entries()].map(([k, v]) => ({ k, v: v.n ? Math.round(v.sum / v.n) : 0 }));
  const next = await inp.tx.exam.findFirst({ where: { archivedAt: null, startDate: { gt: inp.today }, status: { not: "DRAFT" } }, orderBy: { startDate: "asc" }, select: { title: true, startDate: true } });
  const drills: Record<string, Drill> = {};
  if (below) drills.below = { title: "Below the pass mark in a subject", sub: `${below.rows.length} students · ${examName}`, table: below, basis: below.note ?? examName };
  return {
    drills,
    stats: [
      { label: `Pass %, ${examName}`, value: `${num(t.passPercent)}%`, sub: `${n(num(t.wrote))} wrote`, icon: "CircleCheck", tone: "ok" },
      { label: "Average", value: `${num(t.average)}%`, sub: "All classes", icon: "ChartLine" },
      { label: "Below the pass mark", value: n(below?.rows.length ?? 0), sub: "Tap to see them", icon: "TriangleAlert", tone: "warn", drill: below ? "below" : undefined },
      { label: "Next exam", value: next?.title ?? "None planned", sub: next ? `Starts ${next.startDate.toISOString().slice(0, 10).split("-").reverse().join("-")}` : "Plan one in Examination & Results", icon: "CalendarDays" },
    ],
    charts: [
      { key: "results.pass", title: "Pass % by class", sub: examName, icon: "ClipboardCheck", kind: "hbars", hbars: byClass.rows.map((r) => ({ k: String(r.cls), v: num(r.passPercent) })), goal: 90, lowBelow: 90, labelWidth: 80, data: byClass },
      { key: "results.subjects", title: "Average by subject", sub: examName, icon: "ChartColumn", kind: subjRows.length ? "bars" : "empty", bars: subjRows.map((s) => ({ k: s.k.slice(0, 4), v: s.v, tone: s.v < 60 ? "warn" as const : undefined })), max: 100, ticks: [0, 33, 66], unit: "%", legend: [["bg-brand", "Average %"], ["bg-warn", "Below 60%"]], data: tableOf([{ key: "s", label: "Subject" }, { key: "a", label: "Average", kind: "percent" }], subjRows.map((s) => ({ s: s.k, a: s.v }))), empty: "No subject marks yet." },
    ],
  };
}

/* ---------- Finance ---------- */
async function finance(inp: AnalyticsInput): Promise<AreaView> {
  const [byClass, collected, ie, defaulters] = await Promise.all([
    catalogue(inp, "fe-collection"), catalogue(inp, "fe-collection-period", { group: "month" }), catalogue(inp, "fi-ie", { group: "month" }), catalogue(inp, "fe-defaulter"),
  ]);
  const drills: Record<string, Drill> = {};
  const stats: AStat[] = [];
  const charts: AChart[] = [];
  if (byClass?.totals) {
    const due = big(byClass.totals.due), paid = big(byClass.totals.paid), overdue = big(byClass.totals.overdue);
    drills["collected-by-class"] = { title: "Collected by class", sub: `${formatRupeesShort(paid)} of ${formatRupeesShort(due)}`, table: byClass, basis: "Fee Management, Fees by class (the same numbers)" };
    stats.push({ label: "Due so far", value: formatRupeesShort(due), sub: "This financial year", icon: "IndianRupee" });
    stats.push({ label: "Collected", value: formatRupeesShort(paid), sub: `${due ? Math.round(Number((paid * BigInt(1000)) / due) / 10) : 0}%`, tone: "ok", icon: "CircleCheck", drill: "collected-by-class" });
    if (defaulters) drills.overdue = { title: "Overdue fees", sub: `${defaulters.rows.length} students · ${formatRupees(overdue)}`, table: defaulters, basis: "Fee Defaulters, today" };
    stats.push({ label: "Overdue today", value: formatRupeesShort(overdue), sub: `${num(byClass.totals.overdueStudents)} students`, tone: "bad", icon: "TriangleAlert", drill: defaulters ? "overdue" : undefined });
    charts.push({ key: "finance.classes", title: "Collected by class", sub: "Share of what is due so far", icon: "IndianRupee", kind: "hbars", hbars: byClass.rows.map((r) => ({ k: String(r.class).replace(/^Class\s+/i, ""), v: num(r.percent), label: `${Math.round(num(r.percent))}%` })), labelWidth: 72, data: byClass });
  }
  if (collected) {
    const months = monthsBetween(d(inp.range.from), d(inp.range.to));
    const byM = new Map(collected.rows.map((r) => [String(r.period), big(r.amount)]));
    const keyOf = (m: string) => [...byM.keys()].find((k) => k.startsWith(MON[Number(m.slice(5, 7)) - 1]) || k.includes(m)) ?? "";
    const bars = months.map((m) => ({ k: monthShort(m), v: lakhs(byM.get(keyOf(m)) ?? BigInt(0)) }));
    charts.push({ key: "finance.collected", title: "Collected by month", sub: `In lakhs · ${inp.range.label}`, icon: "IndianRupee", kind: collected.rows.length ? "bars" : "empty", bars, max: Math.max(1, ...bars.map((b) => b.v)) * 1.15, unit: "L", data: collected, empty: "No payments in these dates." });
  }
  if (ie) {
    const by = new Map<string, { inc: bigint; exp: bigint }>();
    const heads = new Map<string, bigint>();
    for (const r of ie.rows) {
      const k = String(r.period);
      const c = by.get(k) ?? { inc: BigInt(0), exp: BigInt(0) };
      c.inc += big(r.income); c.exp += big(r.expense);
      by.set(k, c);
      if (r.expense !== null && r.expense !== undefined) heads.set(String(r.head), (heads.get(String(r.head)) ?? BigInt(0)) + big(r.expense));
    }
    const spent = [...by.values()].reduce((s, x) => s + x.exp, BigInt(0));
    stats.push({ label: "Spent", value: formatRupeesShort(spent), sub: inp.range.label, icon: "Wallet" });
    const rows = [...by.entries()];
    charts.push({ key: "finance.ie", title: "Income and expense", sub: `By month, in lakhs · ${inp.range.label}`, icon: "ChartLine", kind: rows.length ? "bars" : "empty", bars: rows.map(([k, v]) => ({ k: k.slice(0, 3), v: lakhs(v.inc), v2: lakhs(v.exp) })), max: Math.max(1, ...rows.map(([, v]) => Math.max(lakhs(v.inc), lakhs(v.exp)))) * 1.15, unit: "L", legend: [["bg-brand", "Income"], ["bg-ink3/30", "Expense"]], data: tableOf([{ key: "m", label: "Month" }, { key: "i", label: "Income", kind: "money" }, { key: "e", label: "Expense", kind: "money" }], rows.map(([k, v]) => ({ m: k, i: v.inc, e: v.exp }))), empty: "No income or expense in these dates." });
    const hs = [...heads.entries()].sort((a, b) => (b[1] > a[1] ? 1 : -1));
    charts.push({ key: "finance.heads", title: "Expenses by head", sub: `${inp.range.label} · ${formatRupeesShort(spent)}`, icon: "Wallet", kind: hs.length ? "hbars" : "empty", hbars: hs.slice(0, 8).map(([k, v]) => ({ k, v: spent ? Math.round(Number((v * BigInt(1000)) / spent) / 10) : 0, label: formatRupeesShort(v) })), labelWidth: 110, data: tableOf([{ key: "h", label: "Head" }, { key: "a", label: "Spent", kind: "money" }], hs.map(([k, v]) => ({ h: k, a: v }))), empty: "No expenses in these dates." });
  }
  return { stats, charts, drills };
}

/* ---------- Staff ---------- */
async function hr(inp: AnalyticsInput): Promise<AreaView> {
  const { tx, today } = inp;
  const staff = await tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] }, ...(inp.campusId ? { campusId: inp.campusId } : {}) }, select: { id: true, staffType: true, department: { select: { name: true } } } });
  const [moves, leave] = await Promise.all([catalogue(inp, "hr-moves"), catalogue(inp, "hr-leave")]);
  const day = staff.length ? await attendanceSummary(tx, inp.who.ctx, { staffIds: staff.map((s) => s.id), from: today, to: today, today }) : null;
  let present = 0, late = 0, onLeave = 0, marked = 0;
  for (const s of day?.people.values() ?? []) { if (s.countedDays || s.leave) marked++; if (s.countedDays && s.absent === 0) present++; if (s.late) late++; if (s.leave) onLeave++; }
  const depts = new Map<string, number>();
  for (const s of staff) depts.set(s.department?.name ?? "No department", (depts.get(s.department?.name ?? "No department") ?? 0) + 1);
  const dr = [...depts.entries()].sort((a, b) => b[1] - a[1]);
  const leaveDays = leave?.totals ? num(leave.totals.total) : 0;
  const lv = await tx.leaveRequest.findMany({ where: { staffId: { not: null }, status: "APPROVED", archivedAt: null, fromDate: { lte: d(inp.range.to) }, toDate: { gte: d(inp.range.from) } }, select: { fromDate: true, days: true } });
  const months = monthsBetween(d(inp.range.from), d(inp.range.to));
  const lvBars = months.map((m) => ({ k: monthShort(m), v: lv.filter((l) => monthKey(l.fromDate) === m).reduce((s, l) => s + Number(l.days), 0) }));
  const joined = moves?.rows.filter((r) => r.what === "Joined").length ?? 0;
  const drills: Record<string, Drill> = {};
  if (moves) drills.moves = { title: `Joiners and leavers, ${inp.range.label.toLowerCase()}`, sub: moves.note ?? "", table: moves, basis: "Staff & HR, joining and leaving dates" };
  return {
    drills,
    stats: [
      { label: "Staff", value: n(staff.length), sub: `${staff.filter((s) => s.staffType === "Teaching").length} teaching`, icon: "Users" },
      { label: "Joined", value: n(joined), sub: `${(moves?.rows.length ?? 0) - joined} left · ${inp.range.label}`, icon: "UserPlus", drill: moves ? "moves" : undefined },
      { label: "Present today", value: marked ? n(present) : "Not marked", sub: `${late} late, ${onLeave} on leave`, icon: "CalendarCheck2", tone: "ok" },
      { label: "Leave taken", value: `${n(leaveDays)} days`, sub: `All staff · ${inp.range.label}`, icon: "CalendarDays" },
    ],
    charts: [
      { key: "hr.departments", title: "Staff by department", sub: `${n(staff.length)} on the rolls`, icon: "Users", kind: dr.length ? "hbars" : "empty", hbars: dr.map(([k, v]) => ({ k, v, label: String(v) })), max: Math.max(1, ...dr.map((x) => x[1])), unit: "", labelWidth: 96, data: tableOf([{ key: "d", label: "Department" }, { key: "n", label: "Staff", kind: "number" }], dr.map(([k, v]) => ({ d: k, n: v }))), empty: "No staff yet." },
      { key: "hr.leave", title: "Leave taken by month", sub: `Days, all staff · ${inp.range.label}`, icon: "CalendarDays", kind: lvBars.some((b) => b.v) ? "bars" : "empty", bars: lvBars, max: Math.max(5, ...lvBars.map((b) => b.v)) * 1.15, data: tableOf([{ key: "m", label: "Month" }, { key: "d", label: "Days", kind: "number" }], months.map((m, i) => ({ m: `${monthShort(m)} ${m.slice(0, 4)}`, d: lvBars[i].v }))), empty: "Nobody was on leave in these dates." },
    ],
  };
}

/* ---------- Teacher workload ---------- */
async function workload(inp: AnalyticsInput): Promise<AreaView> {
  const { tx, today } = inp;
  const year = await yearOf(tx, today);
  const campus = inp.campusId ?? (await tx.campus.findFirst({ where: { archivedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true } }))?.id;
  if (!year || !campus) return { stats: [], charts: [], drills: {}, banner: { title: "No timetable yet.", body: "Teacher loads appear when subjects are given to teachers in Academics." } };
  const loads = (await teacherWorkloads(tx, inp.who.ctx, year.id, campus, today)).filter((t) => t.periods > 0).sort((a, b) => b.periods - a.periods);
  const subs = await tx.substitution.findMany({ where: { archivedAt: null, substituteStaffId: { not: null }, date: { gte: d(inp.range.from), lte: d(inp.range.to) } }, select: { substituteStaffId: true, date: true, absentStaffId: true, period: { select: { periodNo: true } } } });
  const names = new Map((await tx.staff.findMany({ where: { id: { in: [...new Set(subs.flatMap((s) => [s.substituteStaffId!, s.absentStaffId]))] } }, select: { id: true, fullName: true } })).map((s) => [s.id, s.fullName]));
  const by = new Map<string, typeof subs>();
  for (const s of subs) by.set(s.substituteStaffId!, [...(by.get(s.substituteStaffId!) ?? []), s]);
  const drills: Record<string, Drill> = {};
  for (const [id, list] of by) drills[`subs:${id}`] = {
    title: `${names.get(id) ?? "Teacher"}: ${list.length} substitutions`, sub: inp.range.label, basis: "Academics, Substitutions",
    table: tableOf([{ key: "on", label: "Date", kind: "date" }, { key: "p", label: "Period", kind: "number" }, { key: "for", label: "In place of" }], list.sort((a, b) => a.date.getTime() - b.date.getTime()).map((s) => ({ on: s.date, p: s.period.periodNo, for: names.get(s.absentStaffId) ?? "" }))),
  };
  const avg = loads.length ? Math.round(loads.reduce((s, t) => s + t.periods, 0) / loads.length) : 0;
  const limit = loads[0]?.limit ?? 32;
  const near = loads.filter((t) => t.periods >= t.limit - 2).length;
  const top = [...by.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  return {
    drills,
    stats: [
      { label: "Average load", value: String(avg), sub: `Periods a week, limit ${limit}`, icon: "Clock" },
      { label: "Near the limit", value: String(near), sub: `${limit - 2} or more periods`, tone: near ? "warn" : undefined, icon: "TriangleAlert" },
      { label: "Substitutions", value: String(subs.length), sub: top ? `Most taken: ${names.get(top[0])}, ${top[1].length} · ${inp.range.label}` : inp.range.label, icon: "RefreshCw" },
    ],
    charts: [{
      key: "workload.periods", title: "Periods a week, by teacher", sub: `Line at the ${limit}-period limit`, icon: "Clock", kind: loads.length ? "hbars" : "empty",
      hbars: loads.map((t) => ({ k: t.name, v: t.periods, label: String(t.periods) })), max: Math.max(limit + 4, ...loads.map((t) => t.periods)), goal: limit, unit: "", labelWidth: 132,
      drills: [...by.entries()].sort((a, b) => b[1].length - a[1].length).map(([id, l]) => ({ label: `${(names.get(id) ?? "").split(" ")[0]} · ${l.length}`, drill: `subs:${id}` })),
      note: subs.length ? `Substitutions taken · ${inp.range.label}` : "No substitutions in these dates.",
      data: tableOf([{ key: "t", label: "Teacher" }, { key: "p", label: "Periods a week", kind: "number" }, { key: "l", label: "Limit", kind: "number" }, { key: "s", label: "Substitutions", kind: "number" }], loads.map((t) => ({ t: t.name, p: t.periods, l: t.limit, s: by.get(t.id)?.length ?? 0 }))),
      empty: "No teacher has periods given yet.",
    }],
  };
}

/* ---------- Syllabus & teachers (Principal and Academic Head) ---------- */
async function teachers(inp: AnalyticsInput): Promise<AreaView> {
  const { tx, today } = inp;
  const year = await yearOf(tx, today);
  if (!year) return { stats: [], charts: [], drills: {} };
  const alloc = await tx.teacherAllocation.findMany({ where: { academicYearId: year.id, archivedAt: null, isMain: true, section: { archivedAt: null } }, include: { section: { include: { schoolClass: true } }, subject: true } });
  const staff = new Map((await tx.staff.findMany({ where: { id: { in: [...new Set(alloc.map((a) => a.staffId))] } }, select: { id: true, fullName: true } })).map((s) => [s.id, s.fullName]));
  const board = await progressBoard(tx, year.id, alloc.map((a) => ({ sectionId: a.sectionId, classId: a.section.classId, subjectId: a.subjectId, label: `${a.section.schoolClass.name.replace(/^Class\s+/i, "")} ${a.section.name}`, subject: a.subject.name, teacher: a.staffId })), today);
  // Results of each teacher's classes in their subject, from the latest exam with published results.
  const lastExam = await tx.result.findFirst({ where: { academicYearId: year.id, status: "PUBLISHED", examId: { not: null } }, orderBy: { publishedAt: "desc" }, select: { examId: true } });
  const exam = lastExam ? await tx.exam.findUnique({ where: { id: lastExam.examId! }, select: { title: true } }) : null;
  const res = lastExam ? await tx.result.findMany({ where: { examId: lastExam.examId, status: "PUBLISHED", sectionId: { in: alloc.map((a) => a.sectionId) } }, select: { sectionId: true, subjects: true } }) : [];
  type T = { name: string; subjects: Set<string>; classes: string[]; planned: number; done: number; total: number; sum: number; n: number; passed: number; judged: number };
  const by = new Map<string, T>();
  for (const p of board) {
    const id = p.teacher!;
    const t = by.get(id) ?? { name: staff.get(id) ?? "Teacher", subjects: new Set(), classes: [], planned: 0, done: 0, total: 0, sum: 0, n: 0, passed: 0, judged: 0 };
    t.subjects.add(p.subject); t.classes.push(p.label);
    t.planned += Math.round((p.plannedPct * p.total) / 100); t.done += p.done; t.total += p.total;
    for (const r of res.filter((x) => x.sectionId === p.sectionId)) {
      const s = (r.subjects as { subjectId: string; percent: number | null; passed: boolean | null }[]).find((x) => x.subjectId === p.subjectId);
      if (!s || s.percent === null) continue;
      t.sum += s.percent; t.n++;
      if (s.passed !== null) { t.judged++; if (s.passed) t.passed++; }
    }
    by.set(id, t);
  }
  const rows = [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
  const behind = rows.filter((r) => r.done < r.planned);
  const table = tableOf(
    [{ key: "t", label: "Teacher" }, { key: "s", label: "Subject" }, { key: "c", label: "Classes" }, { key: "done", label: "Syllabus done", kind: "number" }, { key: "planned", label: "Planned by today", kind: "number" }, { key: "avg", label: "Average", kind: "percent" }, { key: "pass", label: "Pass %", kind: "percent" }],
    rows.map((r) => ({ t: r.name, s: [...r.subjects].join(", "), c: r.classes.join(", "), done: r.done, planned: r.planned, avg: r.n ? Math.round(r.sum / r.n) : null, pass: r.judged ? pct(r.passed, r.judged) : null })),
  );
  return {
    drills: {},
    banner: { title: "Facts, not ratings.", body: `Syllabus done against the plan${exam ? `, and how each teacher's classes did in ${exam.title}` : ""}. Seen only by the Principal and the Academic Head.` },
    stats: [],
    charts: [{ key: "teachers.table", title: "Syllabus and results by teacher", sub: `Topics planned by today and done${exam ? ` · ${exam.title} of their classes` : ""}`, icon: "BookOpen", kind: rows.length ? "table" : "empty", table, data: table, note: behind.length ? `${behind.length} ${behind.length === 1 ? "teacher is" : "teachers are"} behind the plan: ${behind.slice(0, 3).map((b) => `${b.name} (${b.planned - b.done} topics)`).join(", ")}.` : rows.length ? "Every teacher is on plan." : undefined, empty: "No syllabus or teacher allocations yet." }],
  };
}

/* ---------- Admissions ---------- */
async function admissions(inp: AnalyticsInput): Promise<AreaView> {
  const [sources, conversion, pending] = await Promise.all([catalogue(inp, "ad-funnel"), catalogue(inp, "ad-conversion"), catalogue(inp, "ad-pending")]);
  if (!sources) return { stats: [], charts: [], drills: {} };
  const enq = sources.rows.reduce((s, r) => s + num(r.enquiries), 0);
  const adm = sources.rows.reduce((s, r) => s + num(r.admitted), 0);
  const byMonth = new Map<string, number>();
  for (const r of conversion?.rows ?? []) byMonth.set(String(r.month), (byMonth.get(String(r.month)) ?? 0) + num(r.admitted));
  const bm = [...byMonth.entries()];
  const drills: Record<string, Drill> = { sources: { title: "Enquiries to admissions", sub: `${enq} enquiries, ${adm} admitted`, table: sources, basis: "Admission Management, Sources report" } };
  if (pending) drills.pending = { title: "Pending applications", sub: `${pending.rows.length} not decided`, table: pending, basis: "Admission Management, Pending applications" };
  return {
    drills,
    stats: [
      { label: "Enquiries", value: n(enq), sub: inp.range.label, icon: "Inbox", drill: "sources" },
      { label: "Admitted", value: n(adm), sub: `${pct(adm, enq)}% of enquiries`, icon: "UserPlus", tone: "ok" },
      { label: "Pending applications", value: n(pending?.rows.length ?? 0), sub: "Not decided yet", icon: "Users", drill: pending ? "pending" : undefined },
    ],
    charts: [
      { key: "admissions.sources", title: "Enquiries to admissions", sub: `By where they came from · ${inp.range.label}`, icon: "UserPlus", kind: sources.rows.length ? "hbars" : "empty", hbars: sources.rows.map((r) => ({ k: String(r.source), v: num(r.rate), label: `${num(r.rate)}%` })), labelWidth: 110, data: sources, empty: "No enquiries in these dates." },
      { key: "admissions.months", title: "Admitted by month", sub: inp.range.label, icon: "CalendarDays", kind: bm.length ? "bars" : "empty", bars: bm.map(([k, v]) => ({ k: k.slice(0, 3), v })), max: Math.max(5, ...bm.map((x) => x[1])) * 1.15, data: tableOf([{ key: "m", label: "Month" }, { key: "a", label: "Admitted", kind: "number" }], bm.map(([k, v]) => ({ m: k, a: v }))), empty: "Nobody admitted in these dates." },
    ],
  };
}

export async function loadArea(inp: AnalyticsInput, area: AreaKey, opts: { exam?: string } = {}): Promise<AreaView> {
  switch (area) {
    case "students": return students(inp);
    case "results": return results(inp, opts.exam);
    case "finance": return finance(inp);
    case "hr": return hr(inp);
    case "workload": return workload(inp);
    case "teachers": return teachers(inp);
    case "admissions": return admissions(inp);
  }
}

/**
 * What the Analytics page shows, read from its address the same way for the
 * page and its exports: the area, the dates (default this academic year; the
 * Accountant's financial year; the Admission Counsellor's last 6 months),
 * compare with last year, and the campus ("both" for side by side).
 */
export function analyticsQuery(who: ReportViewer, sp: Raw, setup: PeriodSetupLike, a: ReportAccess = reportAccess(who)) {
  const areas = analyticsAreas(who, a);
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const area = areas.find((x) => x === one(sp.area)) ?? areas[0] ?? null;
  const only = (k: string) => a.roleKeys.length > 0 && a.roleKeys.every((r) => r === k);
  const fallback = only("accountant") ? "finyear" as const : only("admission-counsellor") ? "last6m" as const : "acyear" as const;
  const range = periodFromSearch(sp, { ...setup, fallback })!;
  const campusRaw = one(sp.campus);
  const both = campusRaw === "both";
  const campusId = /^[0-9a-f-]{36}$/i.test(campusRaw) ? campusRaw : who.campusId ?? null;
  return { areas, area, range, fallback, compare: one(sp.compare) === "1", both, campusId, exam: /^[\w-]{1,64}$/.test(one(sp.exam)) ? one(sp.exam) : undefined };
}

/** The area a chart key belongs to ("finance.ie" is in Finance). */
export const areaOfChart = (key: string) => (key.split(".")[0] as AreaKey);

/** Campuses side by side (school groups): the same numbers, the same dates. */
export async function compareCampuses(inp: AnalyticsInput) {
  const campuses = await inp.tx.campus.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  if (campuses.length < 2) return null;
  const cols = await Promise.all(campuses.map(async (c) => {
    const s = await students({ ...inp, campusId: c.id });
    const staff = await inp.tx.staff.count({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] }, campusId: c.id } });
    return { name: c.name, students: s.stats[0]?.value ?? "0", att: s.stats[2]?.value ?? "", staff: String(staff) };
  }));
  return { columns: [{ key: "k", label: "Number" }, ...campuses.map((c, i) => ({ key: `c${i}`, label: c.name }))] as Column[], rows: [["Students", "students"], ["Attendance today", "att"], ["Staff", "staff"]].map(([label, k]) => ({ k: label, ...Object.fromEntries(cols.map((c, i) => [`c${i}`, c[k as "students"]])) })) as Row[] };
}

/** Pinned charts on the person's Dashboard: each from its area with this year's dates. */
export async function pinnedCharts(tx: Tx, who: ReportViewer, keys: string[], setup: PeriodSetupLike, today: Date, range: DayRange) {
  const areas = analyticsAreas(who);
  const out: AChart[] = [];
  const cache = new Map<AreaKey, AreaView>();
  for (const key of keys) {
    const area = areaOfChart(key);
    if (!areas.includes(area)) continue;
    if (!cache.has(area)) cache.set(area, await loadArea({ tx, who, range, setup, today, campusId: who.campusId ?? null, compare: false }, area));
    const c = cache.get(area)!.charts.find((x) => x.key === key);
    if (c) out.push(c);
  }
  return out;
}

export type { SchoolContext };
