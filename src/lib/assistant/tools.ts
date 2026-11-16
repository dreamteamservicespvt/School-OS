// The assistant's READ tools (docs/assistant/plan.md Layer 1). Each one is
// the module's own list function run for the person who asks, with their
// own reach: Ask's ready-made answers (src/lib/ask/answer.ts: the Absent
// list, Defaulters, the report catalogue...), the one student search with
// studentScope(), the attendance register's mayViewStudent(), Homework's
// homeworkScope(), the School Calendar and the Approvals inbox's
// approvalsFor(). So a tool can never show a row, a class, a campus or a
// school the person's own screen would not. Nothing here writes.
//
// A tool returns:
// - `facts`: what the model may talk about: counts, names and labels already
//   on the person's own list (first rows only), never a phone or a hidden field;
// - `sentence`: the code's own plain sentence in the conversation language,
//   shown when the model is not used or wrote a number not in the facts;
// - `link`: the screen behind the answer ("Open the full screen").
import "server-only";

import type { Tx } from "../db";
import type { Viewer } from "../dashboard/types";
import { catalogueFor, makeT } from "../i18n/server";
import { translator, type T } from "../i18n/t";
import { formatDate } from "../format";
import { todayFor } from "../periods";
import { moduleOpen } from "../reports/access";
import { yearsFor } from "../academic/years";
import { answerQuestion, offeredQuestions, type AskAnswer, type AskClock } from "../ask/answer";
import { readClass, WHENS, type AskWhen, type QuestionKey } from "../ask/questions";
import { studentScope } from "../students/access";
import { findStudents } from "../students/find";
import { STUDYING } from "../students/labels";
import { attendanceAccess, type AccessSource } from "../attendance/access";
import { attendanceSettings } from "../attendance/settings";
import { mayViewStudent } from "../attendance/calendar-months";
import { attendanceSummary, percentText } from "../attendance/summary";
import { homeworkScope } from "../homework/scope";
import { listHomework } from "../homework/homework";
import { calendarItems } from "../events/calendar";
import { approvalsFor, requestLabel } from "../approvals";
import type { AssistantLang, TeluguStyle } from "./language";
import { TE_MIX } from "./te-mix";
import { words } from "./words";

export const TOOL_NAMES = [
  "absent_students", "absent_streak", "below_attendance", "attendance_not_taken",
  "staff_late", "staff_absent", "staff_on_leave",
  "fee_collection", "fee_defaulters", "below_pass_mark", "birthdays",
  "student_details", "homework_not_submitted", "upcoming_calendar", "approvals_waiting",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];
export const isToolName = (v: unknown): v is ToolName => typeof v === "string" && (TOOL_NAMES as readonly string[]).includes(v);

/** What a tool may be asked with. Every value is checked again before use. */
export type ToolArgs = { cls?: string | null; when?: AskWhen | null; amount?: number | null; name?: string | null; days?: number | null };
export type ToolLink = { href: string; label: string };

export type ToolResult = {
  tool: ToolName;
  ok: boolean;
  sentence: string;
  facts: Record<string, unknown>;
  scope: string | null;
  link: ToolLink | null;
  total: number | null;
  /** Good news for the person ("nobody is absent", "nothing waiting", a birthday today): the mascot and the voice are glad. */
  good?: boolean;
};

/** `style`: how the person talks Telugu; "mixed" (the default) answers in everyday Telugu with English school words (te-mix.ts). */
export type ToolContext = { tx: Tx; who: Viewer; clock: AskClock; lang: AssistantLang; style?: TeluguStyle };

let mixed: T | null = null;
/** The words for Ask's answers in the conversation's language and the person's way of talking. */
export function answerWords(lang: AssistantLang, style?: TeluguStyle): T {
  if (lang !== "te" || style === "pure") return makeT(lang);
  mixed ??= translator("te", { ...catalogueFor("te"), ...TE_MIX });
  return mixed;
}

/** Lists where an empty answer is good news; a birthday today is good news too. */
const GOOD_WHEN_EMPTY: readonly QuestionKey[] = ["absent-today", "absent-streak", "below-attendance", "not-marked", "late-staff", "staff-absent", "fees-overdue", "below-pass"];

type ToolDef = {
  /** For the model: what it answers, in plain English (the model reads English best; it replies in the person's language). */
  about: string;
  takes: readonly ("cls" | "when" | "amount" | "name" | "days")[];
  whens?: readonly AskWhen[];
  offered: (who: Viewer) => boolean;
  run: (c: ToolContext, a: ToolArgs) => Promise<ToolResult>;
};

const SHOW_TO_MODEL = 10;
const day = (d: Date) => formatDate(d, "UTC");
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const isoOf = (d: Date) => d.toISOString().slice(0, 10);

/* ---------- Ask's ready-made answers, as tools ---------- */

/** An Ask answer as facts: the count, what it counts, the scope and the first rows, labelled. */
function askFacts(a: Extract<AskAnswer, { ok: true }>) {
  const rows = a.table.rows.slice(0, SHOW_TO_MODEL).map((r) => Object.fromEntries(a.table.columns.map((c) => [c.label, r[c.key] ?? ""]).filter(([, v]) => v !== "")));
  return { count: a.big, counts: a.bigLabel, scope: a.scope, total: a.total, rows, moreRows: Math.max(0, a.total - rows.length), note: a.note };
}

function askTool(tool: ToolName, key: QuestionKey, about: string, takes: ToolDef["takes"], whens?: readonly AskWhen[]): ToolDef {
  return {
    about, takes, whens,
    offered: (who) => offeredQuestions(who).includes(key),
    run: async (c, args) => {
      const t = answerWords(c.lang, c.style);
      const a = await answerQuestion(c.tx, c.who, key, { cls: args.cls ?? null, when: args.when ?? null, amount: args.amount ?? null }, c.clock, t);
      const link = a.link ? { href: a.link.href, label: t.any(a.link.label) } : null;
      if (!a.ok) return { tool, ok: false, sentence: a.problem, facts: { problem: a.problem }, scope: null, link, total: null };
      const nothingYet = a.big === t("Not taken") || a.big === t("No school");
      const good = key === "birthdays" ? a.total > 0 : GOOD_WHEN_EMPTY.includes(key) && a.total === 0 && !nothingYet;
      // The scope line ("Whole school · 16-11-2026") in the conversation's language too.
      const scope = a.scope ? a.scope.split(" · ").map((part) => t.any(part)).join(" · ") : a.scope;
      return { tool, ok: true, sentence: a.sentence, facts: { answer: a.sentence, ...askFacts(a) }, scope, link, total: a.total, good };
    },
  };
}

/* ---------- One student: details and attendance ---------- */

async function studentDetails(c: ToolContext, args: ToolArgs): Promise<ToolResult> {
  const tool = "student_details" as const;
  const name = (args.name ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (name.length < 2) return { tool, ok: false, sentence: words(c.lang, "sayMore"), facts: { problem: "No student name was given." }, scope: null, link: null, total: null };
  const years = (await yearsFor(c.tx, c.who.ctx, c.who.campusId ?? null)).map((y) => y.id);
  const scope = await studentScope(c.tx, c.who as unknown as Parameters<typeof studentScope>[1], years);
  // Never by a parent's phone or name: the assistant looks up students by their own name or admission number.
  let hits = await findStudents(c.tx, name, { scope, yearId: years, statuses: STUDYING, byParent: false, take: 6 });
  const cls = args.cls ? readClass(args.cls) : null;
  if (cls) hits = hits.filter((h) => (h.classSection ?? "").toLowerCase().replace(/^class\s+/, "").startsWith(cls.words.toLowerCase()));
  const link = { href: `/student-management?q=${encodeURIComponent(name)}`, label: words(c.lang, "linkStudents") };
  if (!hits.length) return { tool, ok: true, sentence: words(c.lang, "studentNone"), facts: { found: 0, searchedFor: name }, scope: null, link, total: 0 };
  const exact = hits.filter((h) => h.name.toLowerCase() === name.toLowerCase() || h.admissionNo.toLowerCase() === name.toLowerCase());
  const pick = exact.length === 1 ? exact[0] : hits.length === 1 ? hits[0] : null;
  if (!pick) {
    const list = hits.slice(0, 5).map((h) => `${h.name}${h.classSection ? ` (${h.classSection})` : ""}`);
    return { tool, ok: true, sentence: words(c.lang, "studentMany", { n: hits.length, list: list.join(", ") }), facts: { found: hits.length, matches: list, askWhichOne: true }, scope: null, link, total: hits.length };
  }
  const student = { name: pick.name, class: pick.classSection ?? "", admissionNo: pick.admissionNo, rollNo: pick.rollNo ?? null };
  const profile = { href: `/student-management/students/${pick.id}`, label: words(c.lang, "linkProfile") };
  // Attendance only when the person's own register reach covers this student.
  if (!moduleOpen(c.who, "attendance-management")) {
    return { tool, ok: true, sentence: words(c.lang, "studentNoAttendance", { name: student.name, cls: student.class }), facts: { student, attendance: "not part of this person's role" }, scope: null, link: profile, total: 1 };
  }
  const settings = await attendanceSettings(c.tx, c.who.ctx);
  const access = await attendanceAccess(c.tx, c.who.ctx, c.who as unknown as AccessSource, settings.lockOverrideRoles);
  if (!(await mayViewStudent(c.tx, access, pick.id))) {
    return { tool, ok: true, sentence: words(c.lang, "studentNoAttendance", { name: student.name, cls: student.class }), facts: { student, attendance: "not part of this person's role" }, scope: null, link: profile, total: 1 };
  }
  const today = todayFor(c.clock.setup.timeZone, c.clock.now);
  const enrol = await c.tx.enrolment.findFirst({ where: { studentId: pick.id, archivedAt: null, ...(years.length ? { academicYearId: { in: years } } : {}) }, select: { academicYearId: true } });
  const year = enrol ? await c.tx.academicYear.findUnique({ where: { id: enrol.academicYearId }, select: { startDate: true, endDate: true, name: true } }) : null;
  const monthFrom = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const sum = async (from: Date, to: Date) => (await attendanceSummary(c.tx, c.who.ctx, { studentId: pick.id, from, to, today, campusId: access.campusLimit ?? null })).people.get(pick.id) ?? null;
  const [yearSum, monthSum] = await Promise.all([year ? sum(year.startDate, year.endDate) : Promise.resolve(null), sum(monthFrom, today)]);
  const shape = (s: Awaited<ReturnType<typeof sum>>) => (s ? { percent: percentText(s.percent), schoolDays: s.workingDays, present: s.present, absent: s.absent, late: s.late, leave: s.leave, notMarked: s.workingDays - s.markedDays } : null);
  const attendance = { thisYear: year ? { year: year.name, ...shape(yearSum) } : null, thisMonth: shape(monthSum) };
  const y = attendance.thisYear;
  const sentence = y && yearSum
    ? words(c.lang, "studentOne", { name: student.name, cls: student.class, pct: percentText(yearSum.percent), present: yearSum.present, days: yearSum.workingDays })
    : words(c.lang, "studentNoAttendance", { name: student.name, cls: student.class });
  return { tool, ok: true, sentence, facts: { student, attendance }, scope: year?.name ?? null, link: profile, total: 1 };
}

/* ---------- Homework not handed in ---------- */

async function homeworkNotIn(c: ToolContext, args: ToolArgs): Promise<ToolResult> {
  const tool = "homework_not_submitted" as const;
  const today = todayFor(c.clock.setup.timeZone, c.clock.now);
  let s;
  try {
    s = await homeworkScope(c.tx, c.who as unknown as Parameters<typeof homeworkScope>[1], today);
  } catch (e) {
    if (e instanceof Error && e.name === "HomeworkProblem") return { tool, ok: false, sentence: words(c.lang, "notYourRole"), facts: { problem: e.message }, scope: null, link: null, total: null };
    throw e;
  }
  const back = Math.min(Math.max(args.days ?? 7, 1), 31);
  const from = addDays(today, -back);
  const { all } = await listHomework(c.tx, s, today, { from, to: today });
  const cls = args.cls ? readClass(args.cls) : null;
  const rows = all
    .filter((r) => r.dueDate >= from && r.dueDate <= today && r.counts.notIn > 0)
    .filter((r) => !cls || r.sectionLabel.toLowerCase().replace(/^class\s+/, "").startsWith(cls.words.toLowerCase()) || r.className.toLowerCase().endsWith(` ${cls.cls}`));
  const missing = rows.reduce((n, r) => n + r.counts.notIn, 0);
  const link = { href: "/homework-learning/submissions", label: words(c.lang, "linkSubmissions") };
  const range = { from: day(from), to: day(today) };
  const facts = {
    from: range.from, to: range.to, homeworkWithMissing: rows.length, handInsMissing: missing,
    homework: rows.slice(0, SHOW_TO_MODEL).map((r) => ({ title: r.title, class: r.sectionLabel, subject: r.subject, due: day(r.dueDate), notHandedIn: r.counts.notIn, of: r.counts.assigned })),
  };
  return {
    tool, ok: true, facts, scope: answerWords(c.lang, c.style).any("{from} to {to}", range), link, total: rows.length, good: rows.length === 0,
    sentence: rows.length ? words(c.lang, "homework", { n: rows.length, k: missing, ...range }) : words(c.lang, "homeworkNone", range),
  };
}

/* ---------- The School Calendar: events, exams, holidays, PTMs ---------- */

async function upcoming(c: ToolContext, args: ToolArgs): Promise<ToolResult> {
  const tool = "upcoming_calendar" as const;
  const today = todayFor(c.clock.setup.timeZone, c.clock.now);
  const n = Math.min(Math.max(args.days ?? 7, 1), 60);
  const to = addDays(today, n);
  // The person's campus (and the whole school's entries); links only to pages they can open.
  const items = await calendarItems(c.tx, c.who.ctx, isoOf(today), isoOf(to), { campusId: c.who.campusId ?? null, eventLinks: "none", ptmLinks: false });
  const list = items.slice(0, SHOW_TO_MODEL).map((i) => ({ title: i.title, kind: i.source === "datesheet" ? "exam" : i.type, from: day(new Date(`${i.from}T00:00:00Z`)), to: day(new Date(`${i.to}T00:00:00Z`)), time: i.time, where: i.where }));
  const range = { from: day(today), to: day(to) };
  const link = { href: "/events-calendar", label: words(c.lang, "linkCalendar") };
  return {
    tool, ok: true, facts: { ...range, entries: items.length, list, moreEntries: Math.max(0, items.length - list.length) }, scope: answerWords(c.lang, c.style).any("{from} to {to}", range), link, total: items.length,
    sentence: items.length ? words(c.lang, "upcoming", { n: items.length, list: list.slice(0, 4).map((i) => `${i.title} (${i.from})`).join(", "), ...range }) : words(c.lang, "upcomingNone", range),
  };
}

/* ---------- Approvals waiting for this person ---------- */

async function approvalsWaiting(c: ToolContext): Promise<ToolResult> {
  const tool = "approvals_waiting" as const;
  const where = await approvalsFor(c.tx, c.who.ctx, c.who.roles.map((r) => r.key));
  const [n, rows] = await Promise.all([
    // campus: approvalsFor() keeps a person limited to one campus to that campus's requests.
    c.tx.approval.count({ where }),
    // campus: the same where, from approvalsFor().
    c.tx.approval.findMany({ where, orderBy: { createdAt: "asc" }, take: SHOW_TO_MODEL, select: { type: true, summary: true, createdAt: true } }),
  ]);
  const link = { href: "/approvals", label: words(c.lang, "linkApprovals") };
  return {
    tool, ok: true, link, total: n, scope: null, good: n === 0,
    facts: { waiting: n, oldestFirst: rows.map((r) => ({ request: requestLabel(r.type), about: r.summary, since: day(r.createdAt) })), note: "The assistant cannot approve or reject; the person decides on the Approvals screen." },
    sentence: n ? words(c.lang, "approvals", { n }) : words(c.lang, "approvalsNone"),
  };
}

/* ---------- The list ---------- */

const ALL_DAYS: readonly AskWhen[] = WHENS;

export const TOOLS: Record<ToolName, ToolDef> = {
  absent_students: askTool("absent_students", "absent-today", "Students marked absent today or yesterday, by class, from the Absent list. Optional class.", ["cls", "when"], ["today", "yesterday"]),
  absent_streak: askTool("absent_streak", "absent-streak", "Students absent several school days in a row (open flags). Optional class.", ["cls"]),
  below_attendance: askTool("below_attendance", "below-attendance", "Students below the school's attendance line this year. Optional class.", ["cls"]),
  attendance_not_taken: askTool("attendance_not_taken", "not-marked", "Classes that have not taken attendance today.", []),
  staff_late: askTool("staff_late", "late-staff", "Staff who came late today or yesterday.", ["when"], ["today", "yesterday"]),
  staff_absent: askTool("staff_absent", "staff-absent", "Staff absent today or yesterday.", ["when"], ["today", "yesterday"]),
  staff_on_leave: askTool("staff_on_leave", "staff-on-leave", "Staff on leave today or yesterday.", ["when"], ["today", "yesterday"]),
  fee_collection: askTool("fee_collection", "fees-collected", "Fee collected in a period (today, yesterday, this or last week or month), total and payments. Optional class.", ["cls", "when"], ALL_DAYS),
  fee_defaulters: askTool("fee_defaulters", "fees-overdue", "Students with fees overdue (defaulters), optionally owing at least an amount in whole rupees, optionally one class.", ["cls", "amount"]),
  below_pass_mark: askTool("below_pass_mark", "below-pass", "Students below the pass mark in the latest published exam. Optional class.", ["cls"]),
  birthdays: askTool("birthdays", "birthdays", "Birthdays today or in the next 7 days among the people the Dashboard shows.", ["when"], ["thisweek", "today"]),
  student_details: { about: "One student by name or admission number: class, admission number, and attendance this year and this month (when the person's role covers it). Give the name; optional class.", takes: ["name", "cls"], offered: (who) => moduleOpen(who, "student-management"), run: studentDetails },
  homework_not_submitted: { about: "Homework due in the last N days (default 7) that some students have not handed in, with counts. Optional class.", takes: ["days", "cls"], offered: (who) => moduleOpen(who, "homework-learning"), run: homeworkNotIn },
  upcoming_calendar: { about: "What is on the School Calendar in the next N days (default 7): exams from published datesheets, events, holidays, PTMs.", takes: ["days"], offered: (who) => moduleOpen(who, "events-calendar"), run: upcoming },
  approvals_waiting: { about: "Requests waiting for this person's decision in Approvals (count and the oldest few). The assistant never approves.", takes: [], offered: (who) => who.roles.some((r) => r.key), run: (c) => approvalsWaiting(c) },
};

/** Ask's ready-made questions as tools, for words the rules understand without the model. */
export const QUESTION_TOOL: Record<QuestionKey, ToolName> = {
  "absent-today": "absent_students", "absent-streak": "absent_streak", "below-attendance": "below_attendance", "not-marked": "attendance_not_taken",
  "late-staff": "staff_late", "staff-absent": "staff_absent", "staff-on-leave": "staff_on_leave",
  "fees-collected": "fee_collection", "fees-overdue": "fee_defaulters", "below-pass": "below_pass_mark", birthdays: "birthdays",
};

/** The tools this person may use: only lists their role already opens. */
export function offeredTools(who: Viewer): ToolName[] {
  return TOOL_NAMES.filter((n) => TOOLS[n].offered(who));
}

/** Only the arguments the tool takes, each checked. */
export function cleanArgs(name: ToolName, raw: ToolArgs): ToolArgs {
  const d = TOOLS[name];
  const out: ToolArgs = {};
  if (d.takes.includes("cls") && raw.cls && readClass(raw.cls)) out.cls = String(raw.cls).slice(0, 20);
  if (d.takes.includes("when") && raw.when && (d.whens ?? WHENS).includes(raw.when)) out.when = raw.when;
  if (d.takes.includes("amount") && Number.isInteger(raw.amount) && raw.amount! > 0 && raw.amount! <= 100_000_000) out.amount = raw.amount;
  if (d.takes.includes("name") && raw.name) out.name = String(raw.name).replace(/[^\p{L}\p{M}\d .'-]/gu, "").trim().slice(0, 60) || null;
  if (d.takes.includes("days") && Number.isInteger(raw.days) && raw.days! >= 1 && raw.days! <= 60) out.days = raw.days;
  return out;
}

/**
 * Runs one tool for the person. A tool they may not use is refused in plain
 * words (checked here again, whatever the model asked); a failure is a
 * refusal, never a guess.
 */
export async function runTool(c: ToolContext, name: ToolName, raw: ToolArgs): Promise<ToolResult> {
  if (!TOOLS[name].offered(c.who)) return { tool: name, ok: false, sentence: words(c.lang, "notYourRole"), facts: { problem: "This list is not part of the person's role." }, scope: null, link: null, total: null };
  try {
    return await TOOLS[name].run(c, cleanArgs(name, raw));
  } catch (e) {
    console.error(JSON.stringify({ level: "error", event: "assistant-tool-failed", tool: name, schoolId: c.who.ctx.schoolId, error: e instanceof Error ? e.message : String(e) }));
    return { tool: name, ok: false, sentence: words(c.lang, "error"), facts: { problem: "The list could not be read just now." }, scope: null, link: null, total: null };
  }
}
