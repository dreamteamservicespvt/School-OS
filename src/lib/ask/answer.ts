// Ask's answers (gap list G27, 00-global.md §2 Ask). Each ready-made question
// is answered by the module's own list function, run for the person who asks
// with their own reach: the Absent list, the report catalogue (Chronic
// absence, Students near the attendance line, Daily attendance, Students
// below the pass mark, Collection details), Defaulters, Staff Attendance and
// the Dashboard's birthdays. So an answer can never show a row, a class or a
// field the person's own list would not, and its count is always the count
// of that list. The answer is a number, one plain sentence, the rows behind
// it and a link to the full page. Nothing is guessed: a day without school,
// attendance not taken yet or an exam with no results is said in words.
import "server-only";

import type { Tx } from "../db";
import type { Viewer } from "../dashboard/types";
import { formatDate, formatRupees, formatTime } from "../format";
import { yearsFor } from "../academic/years";
import { periodRange, todayFor, type DayRange } from "../periods";
import { attendanceAccess, attendancePages, registerSections, type AccessSource, type AttendanceAccess } from "../attendance/access";
import { attendanceSettings } from "../attendance/settings";
import { absentList, mayOpenAbsentList, REASONS_FEATURE } from "../attendance/absence-reasons";
import { attendanceToday } from "../attendance/integrations";
import { registerChoices } from "../attendance/register";
import { schoolDays, offDayMessage } from "../attendance/calendar";
import { staffDay } from "../attendance/staff";
import { minutesText } from "../attendance/time";
import { feePageAllowedFor, feeViewer } from "../fees/access";
import { defaulters } from "../fees/defaulters";
import { pageMode } from "../duty";
import { moduleOpen, reportAccess } from "../reports/access";
import { entryAllowed, findEntry } from "../reports/catalogue";
import { readFilters, type PeriodSetupLike } from "../reports/filters";
import { cellText, reachSections, ReportProblem, runEntry } from "../reports/run";
import type { Row, Table } from "../reports/types";
import { loadWidgetsIn, widgetsOpenTo } from "../dashboard/compose";
import { askHref, classKey, classWords, cleanParams, QUESTION_KEYS, questionTitle, readClass, type AskParams, type AskWhen, type QuestionKey } from "./questions";

export type AskColumn = { key: string; label: string; right?: boolean };
export type AskTable = { columns: AskColumn[]; rows: Record<string, string>[] };
export type AskLink = { href: string; label: string };

export type AskAnswer =
  | {
      ok: true; key: QuestionKey; title: string;
      /** The number, in words a person reads first ("12", "₹45,600", "No school"). */
      big: string;
      /** What the number counts ("students absent"). */
      bigLabel: string;
      /** One plain sentence with the numbers. */
      sentence: string;
      /** Which records it used: "Your classes only · 22-10-2026". */
      scope: string;
      table: AskTable;
      /** Rows in the list behind it (the table shows them all, or the first 50). */
      total: number;
      link: AskLink;
      note: string | null;
    }
  | { ok: false; key: QuestionKey; title: string; problem: string; link: AskLink | null };

/** The day, the school's dates (week start, terms) and when it is, for one answer. */
export type AskClock = { now: Date; setup: PeriodSetupLike };

export const SHOW_ROWS = 50;
const BIRTHDAY_WIDGETS = ["students.birthdays", "staff.birthdays"] as const;

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (d: Date) => formatDate(d, "UTC");
const back = (d: Date, n: number) => new Date(d.getTime() - n * 86_400_000);
const qs = (base: string, p: Record<string, string | null | undefined>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) u.set(k, v);
  const s = u.toString();
  return s ? `${base}?${s}` : base;
};
const roleKeysOf = (who: Pick<Viewer, "roles">) => who.roles.map((r) => r.key).filter((k): k is string => Boolean(k));

/* ---------- Who is offered which question (from the person alone, no database) ---------- */

function catalogueOpen(who: Viewer, key: string) {
  const e = findEntry(key);
  return Boolean(e && entryAllowed(e, reportAccess(who), who));
}

/** Student attendance for this person: the whole school, or their own classes as a teacher. */
function studentAttendance(who: Viewer) {
  const att = who.permissions["attendance-management"];
  if (!moduleOpen(who, "attendance-management")) return false;
  return att.see === "all" || (att.see === "own" && roleKeysOf(who).some((k) => k !== "hr" && k !== "office-staff"));
}

/** The whole staff's attendance (Staff Attendance page). */
function staffAttendance(who: Viewer) {
  const att = who.permissions["attendance-management"];
  if (!moduleOpen(who, "attendance-management")) return false;
  return (att.see === "all" || (att.see === "own" && roleKeysOf(who).includes("hr"))) && attendancePages(who).staff !== "hidden";
}

function defaultersOpen(who: Viewer) {
  return moduleOpen(who, "fee-management") && feePageAllowedFor(who, "defaulters") && pageMode(who, "fee-management", "defaulters") !== "hidden";
}

const OFFER: Record<QuestionKey, (who: Viewer) => boolean> = {
  "absent-today": (who) => studentAttendance(who) || (moduleOpen(who, "attendance-management") && who.permissions["attendance-management"].see === "own" && roleKeysOf(who).includes("office-staff")),
  "absent-streak": (who) => studentAttendance(who) && catalogueOpen(who, "at-chronic"),
  "below-attendance": (who) => catalogueOpen(who, "at-low"),
  "not-marked": (who) => catalogueOpen(who, "at-daily"),
  "late-staff": staffAttendance,
  "staff-absent": staffAttendance,
  "staff-on-leave": staffAttendance,
  "fees-collected": (who) => catalogueOpen(who, "fe-receipts"),
  "fees-overdue": defaultersOpen,
  "below-pass": (who) => catalogueOpen(who, "ex-below"),
  birthdays: (who) => widgetsOpenTo(who, BIRTHDAY_WIDGETS).length > 0,
};

/** The questions this person may ask: only about lists their own role already opens. */
export function offeredQuestions(who: Viewer): QuestionKey[] {
  return QUESTION_KEYS.filter((k) => OFFER[k](who));
}

type Ready = { key: QuestionKey; p?: AskParams };
const LEADER: Ready[] = [{ key: "absent-today" }, { key: "fees-collected", p: { when: "thisweek" } }, { key: "below-pass" }, { key: "late-staff" }, { key: "absent-streak" }, { key: "fees-overdue", p: { amount: 10000 } }];
const TEACHING: Ready[] = [{ key: "absent-today" }, { key: "absent-streak" }, { key: "below-attendance" }, { key: "below-pass" }, { key: "birthdays", p: { when: "today" } }];
/** Ready-made questions by role, in order (inferred: the questions per role, 00-global.md §2). */
const READY_BY_ROLE: Record<string, Ready[]> = {
  principal: LEADER,
  "school-admin": LEADER,
  "vice-principal": [{ key: "absent-today" }, { key: "absent-streak" }, { key: "below-pass" }, { key: "late-staff" }, { key: "not-marked" }, { key: "fees-overdue", p: { amount: 10000 } }],
  accountant: [{ key: "fees-collected", p: { when: "today" } }, { key: "fees-collected", p: { when: "thisweek" } }, { key: "fees-overdue", p: { amount: 10000 } }, { key: "fees-overdue" }, { key: "fees-collected", p: { when: "thismonth" } }],
  teacher: TEACHING,
  "class-teacher": TEACHING,
  hr: [{ key: "late-staff" }, { key: "staff-absent" }, { key: "staff-on-leave" }, { key: "birthdays" }],
  "office-staff": [{ key: "absent-today" }, { key: "birthdays" }],
  "academic-head": [{ key: "below-pass" }, { key: "below-attendance" }, { key: "absent-today" }, { key: "not-marked" }],
  "exam-in-charge": [{ key: "below-pass" }],
};

export type ReadyQuestion = { key: QuestionKey; title: string; href: string };

/** 4 to 6 questions for the empty Search box: the person's roles' questions they may ask, then any other they may. */
export function readyMadeFor(who: Viewer, offered: readonly QuestionKey[] = offeredQuestions(who)): ReadyQuestion[] {
  const out: ReadyQuestion[] = [];
  const add = (r: Ready) => {
    if (!offered.includes(r.key)) return;
    const href = askHref(r.key, r.p ?? {});
    if (!out.some((x) => x.href === href)) out.push({ key: r.key, title: questionTitle(r.key, r.p ?? {}), href });
  };
  for (const k of roleKeysOf(who)) for (const r of READY_BY_ROLE[k] ?? []) add(r);
  if (out.length < 4) for (const key of offered) add({ key });
  return out.slice(0, 6);
}

/* ---------- Class words to the school's own classes ---------- */

type ClassPick = { label: string; classId: string | null; sectionId: string | null; sectionIds: string[] };

/** "5 A", "V", "UKG" to the sections of the current year (the person's campus when limited to one). */
async function findClass(tx: Tx, who: Viewer, words: string): Promise<ClassPick | "none" | "two-campuses"> {
  const c = readClass(words);
  if (!c) return "none";
  const years = (await yearsFor(tx, who.ctx, who.campusId ?? null)).map((y) => y.id);
  if (!years.length) return "none";
  const sections = await tx.section.findMany({ where: { academicYearId: { in: years }, archivedAt: null }, include: { schoolClass: { select: { name: true } } } });
  const hit = sections.filter((s) => classKey(s.schoolClass.name) === c.cls && (!c.section || s.name.trim().toUpperCase() === c.section));
  if (!hit.length) return "none";
  const classIds = [...new Set(hit.map((s) => s.classId))];
  if (classIds.length > 1) return "two-campuses";
  return { label: classWords(words), classId: classIds[0], sectionId: c.section && hit.length === 1 ? hit[0].id : null, sectionIds: hit.map((s) => s.id) };
}

/* ---------- Answers ---------- */

type Ctx = { tx: Tx; who: Viewer; key: QuestionKey; p: AskParams; title: string; today: Date; clock: AskClock; cls: ClassPick | null };

const refuse = (c: Pick<Ctx, "key" | "title">, problem: string, link: AskLink | null = null): AskAnswer => ({ ok: false, key: c.key, title: c.title, problem, link });
const OWN_ONLY = "You can see your own classes only. Ask about one of your classes, or leave the class out.";

function tableOf(t: Table, keys: string[], rows: Row[] = t.rows): AskTable {
  const cols = keys.map((k) => t.columns.find((c) => c.key === k)).filter((c): c is NonNullable<typeof c> => Boolean(c));
  return {
    columns: cols.map((c) => ({ key: c.key, label: c.label, right: c.kind === "money" || c.kind === "number" || c.kind === "percent" })),
    rows: rows.slice(0, SHOW_ROWS).map((r) => Object.fromEntries(cols.map((c) => [c.key, cellText(r[c.key], c.kind)]))),
  };
}

/** The days a time word covers, in the school's zone and week. */
function rangeOf(c: Ctx, when: AskWhen): DayRange {
  return periodRange({ period: when }, { ...c.clock.setup, now: c.clock.now })!;
}

/** Runs one catalogue report for the person, with their reach; a refusal comes back as words. */
async function catalogue(c: Ctx, key: string, sp: Record<string, string>) {
  const e = findEntry(key)!;
  const f = await readFilters(c.tx, c.who.ctx, e, sp, c.clock.setup, c.today, c.who.campusId ?? null);
  // A class outside the person's reach is refused, never answered with an empty list.
  if (c.cls) {
    const a = reportAccess(c.who);
    const reach = await reachSections(c.tx, c.who.ctx, a.own, f.year?.id ?? null, c.who.campusId ?? null);
    if (reach && !c.cls.sectionIds.some((s) => reach.includes(s))) throw new ReportProblem(OWN_ONLY);
  }
  return { e, f, t: await runEntry(c.tx, c.who, e, f) };
}

const classParams = (c: Ctx) => ({ class: c.cls?.classId ?? "", section: c.cls?.sectionId ?? "" });
const reportLink = (key: string, p: Record<string, string | null | undefined>, label = "Open the full report") => ({ href: qs(`/reports-analytics/r/${key}`, p), label });
const own = (who: Viewer) => reportAccess(who).own;

async function attendanceFor(c: Ctx) {
  const settings = await attendanceSettings(c.tx, c.who.ctx);
  return { settings, access: await attendanceAccess(c.tx, c.who.ctx, c.who as unknown as AccessSource, settings.lockOverrideRoles) };
}

/** Sections whose absent list the person may read (the Absent list's own rule). */
function absentReach(a: AttendanceAccess): string[] | "all" {
  if (a.students === "all" || a.studentLeave === "all") return a.limitSections ?? "all";
  return registerSections(a);
}

async function absentToday(c: Ctx): Promise<AskAnswer> {
  const { access } = await attendanceFor(c);
  if (!mayOpenAbsentList(access)) return refuse(c, "Student attendance is not part of your role.");
  const date = c.p.when === "yesterday" ? back(c.today, 1) : c.today;
  const reach = absentReach(access);
  let sections: string[] | null = null;
  if (c.cls) {
    sections = reach === "all" ? c.cls.sectionIds : c.cls.sectionIds.filter((s) => reach.includes(s));
    if (!sections.length) return refuse(c, OWN_ONLY);
  } else if (reach !== "all") sections = reach;
  if (sections && !sections.length) return refuse(c, "You have no class this year, so there is no absent list for you.");
  const reasonsOn = c.who.features.has(REASONS_FEATURE);
  const link = { href: reasonsOn ? qs("/attendance-management/register/absences", { date: iso(date), section: c.cls?.sectionId }) : qs("/attendance-management/register", { section: c.cls?.sectionId }), label: reasonsOn ? "Open the Absent list" : "Open the Attendance Register" };
  const scope = [c.cls ? c.cls.label : reach === "all" ? "Whole school" : "Your classes only", day(date)].join(" · ");
  const today = await attendanceToday(c.tx, c.who.ctx, date, { sectionIds: sections, campusId: access.campusLimit });
  if (today.off) {
    const info = (await schoolDays(c.tx, c.who.ctx, date, date, access.campusId)).info(date);
    return { ok: true, key: c.key, title: c.title, big: "No school", bigLabel: day(date), sentence: info.on ? `${day(date)} is not a school day.` : offDayMessage(info, date), scope, table: { columns: [], rows: [] }, total: 0, link, note: null };
  }
  if (today.students.marked === 0) {
    return { ok: true, key: c.key, title: c.title, big: "Not taken", bigLabel: "attendance", sentence: `Attendance for ${day(date)} has not been taken yet${c.cls ? ` in ${c.cls.label}` : ""}, so nobody can be counted absent.`, scope, table: { columns: [], rows: [] }, total: 0, link, note: null };
  }
  const all = await absentList(c.tx, c.who.ctx, access, { date, sectionId: c.cls?.sectionId ?? null });
  const rows = sections ? all.filter((r) => r.sectionId && sections!.includes(r.sectionId)) : all;
  const byClass = new Map<string, number>();
  for (const r of rows) byClass.set(r.className, (byClass.get(r.className) ?? 0) + 1);
  const notTaken = today.classes.notMarked;
  const sentence = rows.length
    ? `${plural(rows.length, "student is", "students are")} absent on ${day(date)}${byClass.size > 1 ? `: ${[...byClass].slice(0, 6).map(([k, n]) => `${n} in ${k}`).join(", ")}${byClass.size > 6 ? " and more" : ""}` : byClass.size === 1 ? ` in ${[...byClass.keys()][0]}` : ""}.`
    : `Nobody is marked absent on ${day(date)}${c.cls ? ` in ${c.cls.label}` : ""}.`;
  const withReason = rows.some((r) => r.reason);
  return {
    ok: true, key: c.key, title: c.title, big: rows.length.toLocaleString("en-IN"), bigLabel: rows.length === 1 ? "student absent" : "students absent",
    sentence: notTaken ? `${sentence} ${plural(notTaken, "class has", "classes have")} not taken attendance yet, so the number may still go up.` : sentence,
    scope,
    table: {
      columns: [{ key: "name", label: "Student" }, { key: "cls", label: "Class" }, { key: "roll", label: "Roll no.", right: true }, { key: "how", label: "Absent" }, ...(withReason ? [{ key: "reason", label: "Reason" }] : []), { key: "leave", label: "Leave" }],
      rows: rows.slice(0, SHOW_ROWS).map((r) => ({ name: r.name, cls: r.className, roll: r.rollNo ? String(r.rollNo) : "", how: r.periods.length ? `Periods ${r.periods.join(", ")}` : r.statusName, reason: r.reason?.label ?? "", leave: r.leave ?? "" })),
    },
    total: rows.length, link, note: null,
  };
}

async function absentStreak(c: Ctx): Promise<AskAnswer> {
  const { settings, access } = await attendanceFor(c);
  const { t } = await catalogue(c, "at-chronic", {});
  let rows = t.rows.filter((r) => r.kind === "Absent days in a row");
  if (c.cls) {
    const names = new Set((await registerChoices(c.tx, access)).filter((s) => c.cls!.sectionIds.includes(s.id)).map((s) => s.name));
    rows = rows.filter((r) => names.has(String(r.class)));
  }
  const n = new Set(rows.map((r) => `${r.who}|${r.class}`)).size;
  return {
    ok: true, key: c.key, title: c.title, big: n.toLocaleString("en-IN"), bigLabel: n === 1 ? "student" : "students",
    sentence: n
      ? `${plural(n, "student has", "students have")} been absent ${settings.chronicDays} or more school days in a row and the flag is still open. Call the parents; the flag goes when they are marked present.`
      : `Nobody has been absent ${settings.chronicDays} school days in a row${c.cls ? ` in ${c.cls.label}` : ""}.`,
    scope: [c.cls?.label ?? (own(c.who) ? "Your classes only" : "Whole school"), `${settings.chronicDays} days in a row (Attendance Settings)`].join(" · "),
    table: tableOf(t, ["who", "class", "value", "since", "review"], rows), total: rows.length,
    link: reportLink("at-chronic", {}), note: null,
  };
}

async function belowAttendance(c: Ctx): Promise<AskAnswer> {
  const { settings } = await attendanceFor(c);
  const { t, f } = await catalogue(c, "at-low", classParams(c));
  if (!t.rows.length && t.empty && !t.columns.length) return refuse(c, t.empty);
  const below = t.rows.filter((r) => typeof r.percent === "number" && r.percent < settings.thresholdPercent);
  const close = t.rows.length - below.length;
  return {
    ok: true, key: c.key, title: c.title, big: below.length.toLocaleString("en-IN"), bigLabel: below.length === 1 ? "student below the line" : "students below the line",
    sentence: `${plural(below.length, "student is", "students are")} below ${settings.thresholdPercent}% attendance this year${c.cls ? ` in ${c.cls.label}` : ""}${close ? `; ${plural(close, "more is", "more are")} close to it` : ""}.`,
    scope: [c.cls?.label ?? (own(c.who) ? "Your classes only" : "Whole school"), f.year?.name ?? null, `Threshold ${settings.thresholdPercent}% (Attendance Settings)`].filter(Boolean).join(" · "),
    table: tableOf(t, ["name", "cls", "percent", "absent", "teacher"], below), total: below.length,
    link: reportLink("at-low", classParams(c)), note: null,
  };
}

async function notMarked(c: Ctx): Promise<AskAnswer> {
  const { t } = await catalogue(c, "at-daily", { period: "custom", from: iso(c.today), to: iso(c.today) });
  if (!t.rows.length && t.empty) {
    return { ok: true, key: c.key, title: c.title, big: "No school", bigLabel: day(c.today), sentence: t.empty, scope: day(c.today), table: { columns: [], rows: [] }, total: 0, link: reportLink("at-daily", { period: "today" }), note: null };
  }
  const rows = t.rows.filter((r) => typeof r.notMarked === "number" && r.notMarked > 0);
  const whole = rows.filter((r) => r.notMarked === r.roll).length;
  return {
    ok: true, key: c.key, title: c.title, big: rows.length.toLocaleString("en-IN"), bigLabel: rows.length === 1 ? "class not finished" : "classes not finished",
    sentence: rows.length
      ? `${plural(rows.length, "class has", "classes have")} students without a mark today${whole ? `; ${plural(whole, "class has", "classes have")} not taken attendance at all` : ""}.`
      : "Every class has taken attendance today.",
    scope: [own(c.who) ? "Your classes only" : "Whole school", day(c.today)].join(" · "),
    table: tableOf(t, ["cls", "roll", "notMarked", "present", "absent"], rows), total: rows.length,
    link: reportLink("at-daily", { period: "today" }), note: null,
  };
}

async function belowPass(c: Ctx): Promise<AskAnswer> {
  const { t } = await catalogue(c, "ex-below", classParams(c));
  if (!t.rows.length && t.empty) return refuse(c, t.empty, reportLink("ex-below", classParams(c)));
  const byClass = new Map<string, number>();
  for (const r of t.rows) byClass.set(String(r.cls), (byClass.get(String(r.cls)) ?? 0) + 1);
  const exam = (t.note ?? "").split(". ")[0];
  const classes = [...byClass].sort((a, b) => b[1] - a[1]);
  const asClasses = !c.cls && classes.length > 1;
  return {
    ok: true, key: c.key, title: c.title,
    big: (asClasses ? classes.length : t.rows.length).toLocaleString("en-IN"),
    bigLabel: asClasses ? "classes" : t.rows.length === 1 ? "student below the pass mark" : "students below the pass mark",
    sentence: t.rows.length
      ? `${plural(t.rows.length, "student is", "students are")} below the pass mark in at least one subject in ${exam}${classes.length > 1 ? `, in ${plural(classes.length, "class", "classes")}: ${classes.slice(0, 6).map(([k, n]) => `${k} (${n})`).join(", ")}${classes.length > 6 ? " and more" : ""}` : classes.length === 1 ? `, all in ${classes[0][0]}` : ""}.`
      : `Nobody is below the pass mark in ${exam}${c.cls ? ` in ${c.cls.label}` : ""}.`,
    scope: [c.cls?.label ?? (own(c.who) ? "Your classes and subjects only" : "Whole school"), exam].filter(Boolean).join(" · "),
    table: tableOf(t, ["name", "cls", "subjects", "lowest", "overall"]), total: t.rows.length,
    link: reportLink("ex-below", classParams(c)), note: t.note ?? null,
  };
}

async function feesCollected(c: Ctx): Promise<AskAnswer> {
  const when = (c.p.when ?? "thisweek") as AskWhen;
  const r = rangeOf(c, when);
  const { t, f } = await catalogue(c, "fe-receipts", { period: "custom", from: r.from, to: r.to, ...classParams(c) });
  if (!t.rows.length && t.empty && !t.columns.length) return refuse(c, t.empty);
  const amount = typeof t.totals?.amount === "bigint" ? t.totals.amount : t.rows.reduce((s, x) => s + (typeof x.amount === "bigint" ? x.amount : BigInt(0)), BigInt(0));
  const words = `${r.label.toLowerCase()} (${f.range ? `${day(f.from)} to ${day(f.to)}` : day(c.today)})`;
  const feeReports = feePageAllowedFor(c.who, "reports") && pageMode(c.who, "fee-management", "reports") !== "hidden";
  return {
    ok: true, key: c.key, title: c.title, big: formatRupees(amount), bigLabel: `from ${plural(t.rows.length, "payment")}`,
    sentence: t.rows.length ? `${formatRupees(amount)} was collected ${words}${c.cls ? ` from ${c.cls.label}` : ""}, in ${plural(t.rows.length, "payment")}. Cancelled payments are not counted.` : `No fee was collected ${words}${c.cls ? ` from ${c.cls.label}` : ""}.`,
    scope: [c.cls?.label ?? "Whole school", `${day(f.from)} to ${day(f.to)}`, f.fy ? `Financial year ${f.fy.name}` : null].filter(Boolean).join(" · "),
    table: tableOf(t, ["date", "receipt", "student", "class", "mode", "amount"]), total: t.rows.length,
    link: feeReports
      ? { href: qs("/fee-management/reports", { r: "collection-details", period: when, class: c.cls?.classId }), label: "Open Fee Reports" }
      : reportLink("fe-receipts", { period: when, class: c.cls?.classId }),
    note: null,
  };
}

async function feesOverdue(c: Ctx): Promise<AskAnswer> {
  if (!defaultersOpen(c.who)) return refuse(c, "Fee defaulters are not part of your role.");
  const viewer = await feeViewer(c.tx, c.who.ctx, c.who as unknown as Parameters<typeof feeViewer>[2]);
  if (c.cls && viewer.sectionIds && !c.cls.sectionIds.some((s) => viewer.sectionIds!.includes(s))) return refuse(c, OWN_ONLY);
  const amount = c.p.amount ?? null;
  const list = await defaulters(c.tx, c.who.ctx, viewer, c.today, { classId: c.cls?.sectionId ? null : c.cls?.classId ?? null, sectionId: c.cls?.sectionId ?? null, amountAbove: amount ? BigInt(amount) * BigInt(100) : null });
  const rows = list.rows;
  const total = list.total;
  const each = amount ? ` (₹${amount.toLocaleString("en-IN")} or more each)` : "";
  return {
    ok: true, key: c.key, title: c.title, big: rows.length.toLocaleString("en-IN"), bigLabel: rows.length === 1 ? "student" : "students",
    sentence: rows.length
      ? `${plural(rows.length, "student has", "students have")} ${formatRupees(total)} overdue${each}${c.cls ? ` in ${c.cls.label}` : ""}. Fees not yet due are not counted.`
      : `Nobody has fees overdue${each}${c.cls ? ` in ${c.cls.label}` : ""}.`,
    scope: [c.cls?.label ?? (viewer.sectionIds ? "Your classes only" : "Whole school"), `As on ${day(c.today)}`].join(" · "),
    table: {
      columns: [{ key: "name", label: "Student" }, { key: "cls", label: "Class" }, { key: "overdue", label: "Overdue", right: true }, { key: "days", label: "Days overdue", right: true }, { key: "heads", label: "Fee heads" }],
      rows: rows.slice(0, SHOW_ROWS).map((r) => ({ name: r.name, cls: r.classLabel, overdue: formatRupees(r.overduePaise), days: String(r.daysOverdue), heads: r.heads })),
    },
    total: rows.length,
    link: { href: qs("/fee-management/defaulters", { above: amount ? String(amount) : null, class: c.cls?.sectionId ? null : c.cls?.classId, section: c.cls?.sectionId }), label: "Open Defaulters" },
    note: null,
  };
}

const STAFF_STATUS: Partial<Record<QuestionKey, { status: string; label: string; none: string }>> = {
  "late-staff": { status: "late", label: "came late", none: "Nobody came late" },
  "staff-absent": { status: "absent", label: "absent", none: "Nobody is marked absent" },
  "staff-on-leave": { status: "leave", label: "on leave", none: "Nobody is on leave" },
};

async function staffToday(c: Ctx): Promise<AskAnswer> {
  const { access } = await attendanceFor(c);
  if (access.staff !== "all" || access.pages.staff === "hidden") return refuse(c, "The staff's attendance is not part of your role.");
  const s = STAFF_STATUS[c.key]!;
  const date = c.p.when === "yesterday" ? back(c.today, 1) : c.today;
  const link = { href: qs("/attendance-management/staff", { date: iso(date), status: s.status }), label: "Open Staff Attendance" };
  const scope = [access.campusLimit ? "Your campus" : "All staff", day(date)].join(" · ");
  const info = (await schoolDays(c.tx, c.who.ctx, date, date, access.campusId)).info(date);
  if (!info.on && s.status !== "leave") return { ok: true, key: c.key, title: c.title, big: "No school", bigLabel: day(date), sentence: offDayMessage(info, date), scope, table: { columns: [], rows: [] }, total: 0, link, note: null };
  const rows = await staffDay(c.tx, c.who.ctx, access, date, { status: s.status });
  const tz = c.who.school.timeZone;
  const late = s.status === "late";
  return {
    ok: true, key: c.key, title: c.title, big: rows.length.toLocaleString("en-IN"), bigLabel: `${rows.length === 1 ? "staff member" : "staff"} ${s.label}`,
    sentence: rows.length ? `${plural(rows.length, "staff member", "staff")} ${s.label} on ${day(date)}.` : `${s.none} on ${day(date)}.`,
    scope,
    table: {
      columns: [{ key: "name", label: "Staff" }, { key: "code", label: "Staff ID" }, { key: "role", label: "Designation" }, ...(late ? [{ key: "in", label: "In at" }, { key: "late", label: "Late by", right: true }] : [])],
      rows: rows.slice(0, SHOW_ROWS).map((r) => ({ name: r.name, code: r.staffCode, role: r.designation, in: r.mark?.inTime ? formatTime(r.mark.inTime, tz) : "", late: r.mark?.lateMinutes ? minutesText(r.mark.lateMinutes) : "" })),
    },
    total: rows.length, link, note: null,
  };
}

async function birthdays(c: Ctx): Promise<AskAnswer> {
  const all = (await loadWidgetsIn(c.tx, c.who, "birthdays", BIRTHDAY_WIDGETS, c.clock.now)).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  const todayOnly = c.p.when === "today";
  const rows = todayOnly ? all.filter((b) => b.sort === c.today.getTime()) : all;
  return {
    ok: true, key: c.key, title: c.title, big: rows.length.toLocaleString("en-IN"), bigLabel: rows.length === 1 ? "birthday" : "birthdays",
    sentence: rows.length ? `${plural(rows.length, "birthday")} ${todayOnly ? "today" : "in the next 7 days"}, among the students, parents and staff your Dashboard shows.` : `No birthday ${todayOnly ? "today" : "in the next 7 days"} among the people your Dashboard shows.`,
    scope: todayOnly ? day(c.today) : `${day(c.today)} to ${day(new Date(c.today.getTime() + 6 * 86_400_000))}`,
    table: { columns: [{ key: "name", label: "Name" }, { key: "when", label: "When" }], rows: rows.slice(0, SHOW_ROWS).map((b) => ({ name: b.name, when: b.when })) },
    total: rows.length, link: { href: "/dashboard", label: "Open the Dashboard" }, note: null,
  };
}

const ANSWER: Record<QuestionKey, (c: Ctx) => Promise<AskAnswer>> = {
  "absent-today": absentToday, "absent-streak": absentStreak, "below-attendance": belowAttendance, "not-marked": notMarked,
  "late-staff": staffToday, "staff-absent": staffToday, "staff-on-leave": staffToday,
  "fees-collected": feesCollected, "fees-overdue": feesOverdue, "below-pass": belowPass, birthdays,
};

/**
 * Answers one ready-made question for the person, from the module's own list
 * with their reach. A question they may not ask, or a class outside their
 * reach, is refused in plain words; nothing about other classes is said.
 */
export async function answerQuestion(tx: Tx, who: Viewer, key: QuestionKey, params: AskParams, clock: AskClock): Promise<AskAnswer> {
  const p = cleanParams(key, params);
  const title = questionTitle(key, p);
  const today = todayFor(clock.setup.timeZone, clock.now);
  const base = { tx, who, key, p, title, today, clock, cls: null as ClassPick | null };
  if (!OFFER[key](who)) return refuse(base, "This question is about a list your role does not open. Ask your School Admin if you need it (Settings, Users & Permissions).");
  if (p.cls) {
    const found = await findClass(tx, who, p.cls);
    if (found === "none") return refuse(base, `There is no ${classWords(p.cls)} in this year's classes. Check the class, or leave it out.`);
    if (found === "two-campuses") return refuse(base, `${classWords(p.cls)} is in more than one campus. Open the full list and choose the campus there.`);
    base.cls = found;
  }
  try {
    return await ANSWER[key](base);
  } catch (e) {
    if (e instanceof ReportProblem) return refuse(base, e.message);
    if (e instanceof Error && e.name === "NotYoursError") return refuse(base, OWN_ONLY);
    throw e;
  }
}
