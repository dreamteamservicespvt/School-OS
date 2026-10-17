// Early Warnings (19 §2): students who may need help, from attendance, marks
// and fees, for a person to review. The rules come from the modules' own
// settings (Attendance Settings threshold and absent-in-a-row, Exam Settings
// pass mark, the fee overdue days here), plus the marks-drop rule the
// Principal sets on this page. A flag is only a signal: nothing happens to a
// student until a person reviews it, and every planned action (a Task or a
// counselling referral) is made by that review, with the reviewer's note.
//
// Who does what (05-roles.md and the owner's prototype changes of 13-14 Oct):
// class teachers and teachers review the flags of their own students; the
// Principal, School Admin and Vice Principal watch every flag and Remind the
// person who should act; the Academic Head watches without fee signals. Fee
// signals never reach a role without the whole school's fees.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { remindedSince, sendReminder } from "../reminders";
import { currentYear } from "../academic/years";
import { ownSectionIds } from "../people";
import { attendanceSettings } from "../attendance/settings";
import { attendanceSummary } from "../attendance/summary";
import { examSettings } from "../exams/settings";
import type { SubjectResult } from "../exams/compute";
import { defaulters } from "../fees/defaulters";
import { formatDate, formatRupees } from "../format";
import { addDays, DAY_MS, todayIn } from "../staff/dates";
import { dayStartUtc } from "../periods";
import { addTask, taskAccess } from "../dashboard/tasks";
import { referToCounselling } from "../students/behaviour";
import { BUILT_MODULES } from "../modules";
import { forecastsFor, type ForecastArea } from "./forecasts";
import { dropoutReasons, withAbsenceReasons } from "./absence-signals";
import { BASE, type ReportAccess } from "./access";
import type { ReportViewer } from "./types";

export const WARNINGS_HREF = `${BASE}/early-warnings`;

export class WarningProblem extends Error {
  constructor(message: string, readonly field?: string) { super(message); this.name = "WarningProblem"; }
}

export type Area = "attendance" | "marks" | "fees";
export const AREAS: { value: Area; label: string }[] = [
  { value: "attendance", label: "Attendance" }, { value: "marks", label: "Marks" }, { value: "fees", label: "Fees" },
];
export type FlagStatus = "NEW" | "REVIEWED" | "ACTION_PLANNED" | "CLOSED";
export const STATUS_LABEL: Record<FlagStatus, string> = { NEW: "New", REVIEWED: "Reviewed", ACTION_PLANNED: "Action planned", CLOSED: "Closed" };
export const STATUS_TONE: Record<FlagStatus, "info" | "brand" | "warning" | "neutral"> = { NEW: "info", REVIEWED: "brand", ACTION_PLANNED: "warning", CLOSED: "neutral" };
export const STRENGTH_LABEL: Record<string, string> = { ACT_NOW: "Act now", WATCH: "Watch" };
export type Decision = "REVIEWED" | "ACTION_PLANNED" | "NOT_A_CONCERN";
export const DECISION_LABEL: Record<Decision, string> = { REVIEWED: "Reviewed", ACTION_PLANNED: "Action planned", NOT_A_CONCERN: "Not a concern" };

/** Actions a review can plan; each makes a Task or a counselling referral (inferred links). */
export const ACTIONS = [
  { key: "call-parent", label: "Call the parent", fees: false },
  { key: "meet-parent", label: "Meet the parent with the class teacher", fees: false },
  { key: "counsellor", label: "Refer to the counsellor", fees: false },
  { key: "extra-classes", label: "Extra classes", fees: false },
  { key: "fee-follow-up", label: "Fee follow-up by accounts", fees: true },
] as const;
export type ActionKey = (typeof ACTIONS)[number]["key"];

/** Marks-drop rule limits (Principal, on this page). */
export const DROP_MIN = 5;
export const DROP_MAX = 50;
/** A flag a person closed is not raised again for the same reason for this many days. */
const QUIET_DAYS = 30;
const CLEARED = "Cleared: the numbers are back within the rules.";
const SUGGESTION_BASIS = "Suggestion · based on";

export async function warningSettings(tx: Tx, ctx: SchoolContext) {
  return tx.earlyWarningSetting.upsert({ where: { schoolId: ctx.schoolId }, create: { schoolId: ctx.schoolId }, update: {} });
}

/** The rules behind the flags, as the page lists them, from each module's settings. */
export async function warningRules(tx: Tx, ctx: SchoolContext) {
  const [w, att, ex] = await Promise.all([warningSettings(tx, ctx), attendanceSettings(tx, ctx), examSettings(tx, ctx)]);
  return {
    threshold: att.thresholdPercent, watch: Math.min(100, att.thresholdPercent + w.watchMargin), streakDays: att.chronicDays,
    pass: ex.passPercentSubject, drop: w.marksDropPercent, feeDays: w.feeOverdueDays, lastRefreshAt: w.lastRefreshAt,
  };
}

/** The Principal's marks-drop rule (5 to 50 points), audited. */
export async function saveDropRule(tx: Tx, ctx: SchoolContext, a: ReportAccess, value: number) {
  if (!a.warnings.rule) throw new WarningProblem("Only the Principal sets the marks-drop rule.");
  if (!Number.isInteger(value) || value < DROP_MIN || value > DROP_MAX) throw new WarningProblem(`Enter a number from ${DROP_MIN} to ${DROP_MAX}.`, "drop");
  const before = await warningSettings(tx, ctx);
  await tx.earlyWarningSetting.update({ where: { schoolId: ctx.schoolId }, data: { marksDropPercent: value, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "changed", recordType: "Early Warning Setting", recordId: ctx.schoolId, before: { marksDropPercent: before.marksDropPercent }, after: { marksDropPercent: value } });
  return value;
}

type Signal = { studentId: string; sectionId: string | null; area: Area; strength: "WATCH" | "ACT_NOW"; reason: string; basis: string; value: number | null };

const pctText = (n: number) => `${Math.round(n * 10) / 10}%`;
const listWords = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** Attendance signals: below the threshold (Act now) or within the watch margin above it (Watch), and absent days in a row. */
async function attendanceSignals(tx: Tx, ctx: SchoolContext, year: { id: string; startDate: Date }, enrol: Map<string, string>, today: Date, rules: Awaited<ReturnType<typeof warningRules>>): Promise<Signal[]> {
  const ids = [...enrol.keys()];
  if (!ids.length || today < year.startDate) return [];
  const sum = await attendanceSummary(tx, ctx, { studentIds: ids, from: year.startDate, to: today, today });
  const streaks = await tx.attendanceFlag.findMany({ where: { studentId: { in: ids }, kind: "absent-streak", clearedAt: null } });
  const since = `${formatDate(year.startDate, "UTC")} to ${formatDate(today, "UTC")}`;
  const out: Signal[] = [];
  for (const id of ids) {
    const p = sum.people.get(id)?.percent ?? null;
    const streak = streaks.find((s) => s.studentId === id);
    const reasons: string[] = [];
    const basis: string[] = [];
    let strength: Signal["strength"] | null = null;
    if (p !== null && sum.people.get(id)!.countedDays >= 5) {
      if (p < rules.threshold) { strength = "ACT_NOW"; reasons.push(`Attendance ${pctText(p)} this year (threshold ${rules.threshold}%)`); basis.push(`Attendance, ${since} · threshold ${rules.threshold}% (Attendance Settings)`); }
      else if (p < rules.watch) { strength = "WATCH"; reasons.push(`Attendance ${pctText(p)} this year (watch line ${rules.watch}%, threshold ${rules.threshold}%)`); basis.push(`Attendance, ${since}`); }
    }
    if (streak) {
      reasons.push(`Absent ${Number(streak.value)} school days in a row, up to ${formatDate(streak.raisedOn, "UTC")}`);
      basis.push(`Attendance register · rule: ${rules.streakDays} days in a row (Attendance Settings)`);
      strength = strength === "ACT_NOW" || (p !== null && p < rules.watch) ? "ACT_NOW" : strength ?? "WATCH";
    }
    if (strength) out.push({ studentId: id, sectionId: enrol.get(id) ?? null, area: "attendance", strength, reason: reasons.join("\n"), basis: basis.join("\n"), value: p });
  }
  return out;
}

/** Marks signals from published results: below the pass mark in a subject (Act now), and a fall between the last two exams (Watch). */
async function marksSignals(tx: Tx, year: { id: string }, enrol: Map<string, string>, rules: Awaited<ReturnType<typeof warningRules>>): Promise<Signal[]> {
  const ids = [...enrol.keys()];
  if (!ids.length) return [];
  const results = await tx.result.findMany({ where: { academicYearId: year.id, studentId: { in: ids }, status: "PUBLISHED", examId: { not: null } }, select: { studentId: true, examId: true, percent: true, subjects: true, publishedAt: true } });
  const exams = new Map((await tx.exam.findMany({ where: { id: { in: [...new Set(results.map((r) => r.examId!))] } }, select: { id: true, title: true, endDate: true } })).map((e) => [e.id, e]));
  const by = new Map<string, typeof results>();
  for (const r of results) by.set(r.studentId, [...(by.get(r.studentId) ?? []), r]);
  const out: Signal[] = [];
  for (const [id, list] of by) {
    const sorted = list.filter((r) => exams.has(r.examId!)).sort((a, b) => exams.get(a.examId!)!.endDate.getTime() - exams.get(b.examId!)!.endDate.getTime());
    const last = sorted[sorted.length - 1];
    if (!last || last.percent === null) continue;
    const exam = exams.get(last.examId!)!;
    const subs = (last.subjects as unknown as SubjectResult[]).filter((s) => s && !s.gradeOnly);
    const failed = subs.filter((s) => s.passed === false && !s.absent);
    const reasons: string[] = [];
    const basis: string[] = [];
    let strength: Signal["strength"] | null = null;
    if (failed.length) {
      strength = "ACT_NOW";
      reasons.push(`${exam.title}: ${pctText(last.percent)} overall, below ${rules.pass}% in ${listWords(failed.map((s) => `${s.name}${s.percent !== null ? ` (${pctText(s.percent)})` : ""}`))}`);
      basis.push(`${exam.title} marks, published${last.publishedAt ? ` ${formatDate(last.publishedAt)}` : ""} · pass mark ${rules.pass}% (Exam Settings)`);
    }
    const prev = sorted[sorted.length - 2];
    if (prev && prev.percent !== null && prev.percent - last.percent >= rules.drop) {
      const prevExam = exams.get(prev.examId!)!;
      const prevSubs = new Map((prev.subjects as unknown as SubjectResult[]).filter((s) => s && s.percent !== null).map((s) => [s.subjectId, s.percent!]));
      const fell = subs.filter((s) => s.percent !== null && prevSubs.has(s.subjectId) && prevSubs.get(s.subjectId)! - s.percent >= rules.drop).map((s) => s.name);
      reasons.push(`Marks fell ${Math.round(prev.percent - last.percent)}% from ${prevExam.title} to ${exam.title}${fell.length ? ` in ${listWords(fell)}` : ""}`);
      basis.push(`${prevExam.title} and ${exam.title} · marks-drop rule ${rules.drop}%`);
      strength = strength ?? "WATCH";
    }
    if (strength) out.push({ studentId: id, sectionId: enrol.get(id) ?? null, area: "marks", strength, reason: reasons.join("\n"), basis: basis.join("\n"), value: last.percent });
  }
  return out;
}

/** Fee signals from the same Defaulters list as Fee Management: overdue longer than the rule (Watch), a month beyond it (Act now). */
async function feeSignals(tx: Tx, ctx: SchoolContext, year: { id: string }, enrol: Map<string, string>, today: Date, rules: Awaited<ReturnType<typeof warningRules>>): Promise<Signal[]> {
  if (!BUILT_MODULES.has("fee-management")) return [];
  const d = await defaulters(tx, ctx, { userId: "", see: "all", change: "none", roleKeys: [], sectionIds: null, yearId: year.id }, today);
  return d.rows.filter((r) => r.daysOverdue > rules.feeDays && enrol.has(r.studentId)).map((r) => ({
    studentId: r.studentId, sectionId: enrol.get(r.studentId) ?? null, area: "fees" as const,
    strength: r.daysOverdue > rules.feeDays + 30 ? "ACT_NOW" as const : "WATCH" as const,
    reason: `Fees overdue ${r.daysOverdue} days: ${formatRupees(r.overduePaise)} (${r.heads})`,
    basis: `Fee Defaulters · flag after ${rules.feeDays} days`, value: r.daysOverdue,
  }));
}

/**
 * Works out every signal again and keeps one open flag per student and area:
 * new signals become New flags (the class teacher is told about Act now ones),
 * changed numbers update the open flag, and flags whose numbers are back
 * within the rules close by themselves with that reason. Safe to run twice.
 */
export async function refreshFlags(tx: Tx, ctx: SchoolContext, now = new Date()) {
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { timeZone: true } });
  const today = todayIn(school.timeZone, now);
  const year = await currentYear(tx, ctx);
  if (!year) return { raised: 0, updated: 0, cleared: 0 };
  const rules = await warningRules(tx, ctx);
  const enrolRows = await tx.enrolment.findMany({ where: { academicYearId: year.id, archivedAt: null, status: "STUDYING", student: { archivedAt: null } }, select: { studentId: true, sectionId: true } });
  const enrol = new Map(enrolRows.map((e) => [e.studentId, e.sectionId]));
  // Absence reasons adjust them (./absence-signals.ts); without recorded reasons nothing changes.
  const signals: Signal[] = await withAbsenceReasons(tx, ctx, [
    ...(await attendanceSignals(tx, ctx, year, enrol, today, rules)),
    ...(await marksSignals(tx, year, enrol, rules)),
    ...(await feeSignals(tx, ctx, year, enrol, today, rules)),
  ], { from: year.startDate, today, enrol, threshold: rules.threshold, streakDays: rules.streakDays });
  const open = await tx.riskFlag.findMany({ where: { closedAt: null } });
  const quiet = await tx.riskFlag.findMany({ where: { closedAt: { gte: new Date(now.getTime() - QUIET_DAYS * DAY_MS) }, status: "CLOSED", NOT: { closedReason: CLEARED } }, select: { studentId: true, area: true, strength: true } });
  const key = (s: { studentId: string; area: string }) => `${s.studentId}:${s.area}`;
  const openBy = new Map(open.map((f) => [key(f), f]));
  const seen = new Set<string>();
  let raised = 0, updated = 0, cleared = 0;
  const newActNow: { flagId: string; studentId: string; sectionId: string | null; reason: string }[] = [];
  for (const s of signals) {
    const k = key(s);
    seen.add(k);
    const f = openBy.get(k);
    if (f) {
      if (f.reason !== s.reason || f.strength !== s.strength || f.basis !== s.basis || f.value !== s.value) {
        await tx.riskFlag.update({ where: { id: f.id }, data: { reason: s.reason, basis: s.basis, strength: s.strength, value: s.value, sectionId: s.sectionId } });
        updated++;
      }
      continue;
    }
    // A person closed this as not a concern lately: not raised again unless it got stronger.
    if (quiet.some((q) => q.studentId === s.studentId && q.area === s.area && (q.strength === s.strength || s.strength === "WATCH"))) continue;
    const flag = await tx.riskFlag.create({ data: { schoolId: ctx.schoolId, studentId: s.studentId, academicYearId: year.id, sectionId: s.sectionId, area: s.area, strength: s.strength, reason: s.reason, basis: s.basis, value: s.value, raisedAt: now } });
    raised++;
    if (s.strength === "ACT_NOW" && s.area !== "fees") newActNow.push({ flagId: flag.id, studentId: s.studentId, sectionId: s.sectionId, reason: s.reason });
  }
  for (const f of open) {
    if (seen.has(key(f))) continue;
    // Added by a person from a suggestion (Looking ahead): it stays until a person closes it.
    if (f.basis.startsWith(SUGGESTION_BASIS)) continue;
    await tx.riskFlag.update({ where: { id: f.id }, data: { status: "CLOSED", closedAt: now, closedReason: CLEARED } });
    cleared++;
  }
  // New Act now flags go to the class teacher (inferred: 19 §4 Sends).
  if (newActNow.length) {
    const sections = await tx.section.findMany({ where: { id: { in: [...new Set(newActNow.map((x) => x.sectionId).filter((x): x is string => Boolean(x)))] } }, select: { id: true, classTeacherId: true } });
    const staff = await tx.staff.findMany({ where: { id: { in: sections.map((s) => s.classTeacherId).filter((x): x is string => Boolean(x)) } }, select: { id: true, userLoginId: true } });
    const names = new Map((await tx.student.findMany({ where: { id: { in: newActNow.map((x) => x.studentId) } }, select: { id: true, fullName: true } })).map((s) => [s.id, s.fullName]));
    for (const x of newActNow) {
      const teacher = staff.find((t) => t.id === sections.find((s) => s.id === x.sectionId)?.classTeacherId)?.userLoginId;
      if (!teacher) continue;
      await notify(tx, { schoolId: ctx.schoolId, userId: null }, { to: teacher, type: "early-warning", text: `Act now: ${names.get(x.studentId) ?? "A student"}. ${x.reason.split("\n")[0]}. Please review.`, link: `${WARNINGS_HREF}?open=${x.flagId}`, groupKey: "early-warning", mergedText: (n) => `${n} new Act now flags for your students. Please review.` });
    }
  }
  await tx.earlyWarningSetting.update({ where: { schoolId: ctx.schoolId }, data: { lastRefreshAt: now } });
  return { raised, updated, cleared };
}

/** Which flags this person sees: their own students for own reach; fee flags only with the whole school's fees. */
export async function flagScope(tx: Tx, who: ReportViewer, a: ReportAccess): Promise<Prisma.RiskFlagWhereInput> {
  if (!a.warnings.on) return { id: "00000000-0000-0000-0000-000000000000" };
  const where: Prisma.RiskFlagWhereInput = {};
  if (!a.warnings.fees) where.area = { in: ["attendance", "marks"] };
  if (a.own) {
    const year = await currentYear(tx, who.ctx);
    const own = year ? await ownSectionIds(tx, who.ctx, year.id) : [];
    where.sectionId = { in: own };
  }
  return where;
}

export type FlagFilter = { status: "open" | FlagStatus; area: Area | "all"; q: string; raisedFrom: Date | null; raisedTo: Date | null };

export async function listFlags(tx: Tx, who: ReportViewer, a: ReportAccess, f: FlagFilter) {
  const scope = await flagScope(tx, who, a);
  const base: Prisma.RiskFlagWhereInput = {
    ...scope,
    ...(f.raisedFrom || f.raisedTo ? { raisedAt: { ...(f.raisedFrom ? { gte: f.raisedFrom } : {}), ...(f.raisedTo ? { lt: f.raisedTo } : {}) } } : {}),
  };
  const all = await tx.riskFlag.findMany({ where: base, include: { reviews: { orderBy: { createdAt: "desc" } } }, orderBy: [{ raisedAt: "desc" }] });
  const students = new Map((await tx.student.findMany({ where: { id: { in: [...new Set(all.map((x) => x.studentId))] } }, select: { id: true, fullName: true, admissionNo: true, photoFileId: true } })).map((s) => [s.id, s]));
  const sections = new Map((await tx.section.findMany({ where: { id: { in: [...new Set(all.map((x) => x.sectionId).filter((x): x is string => Boolean(x)))] } }, include: { schoolClass: { select: { name: true } } } })).map((s) => [s.id, `${s.schoolClass.name.replace(/^Class\s+/i, "")} ${s.name}`]));
  const people = new Map((await tx.userLogin.findMany({ where: { id: { in: [...new Set(all.flatMap((x) => x.reviews.map((r) => r.reviewerId)))] } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  const rows = all.map((x) => ({
    ...x,
    status: x.status as FlagStatus,
    name: students.get(x.studentId)?.fullName ?? "Student",
    admissionNo: students.get(x.studentId)?.admissionNo ?? "",
    cls: x.sectionId ? sections.get(x.sectionId) ?? "" : "",
    signals: x.reason.split("\n").map((text, i) => ({ text, basis: x.basis.split("\n")[i] ?? x.basis })),
    reviews: x.reviews.map((r) => ({ ...r, who: people.get(r.reviewerId) ?? "Someone" })),
  }));
  const counts = {
    actNow: rows.filter((r) => r.strength === "ACT_NOW" && r.status !== "CLOSED").length,
    watch: rows.filter((r) => r.strength === "WATCH" && r.status !== "CLOSED").length,
    open: rows.filter((r) => r.status !== "CLOSED").length,
    NEW: rows.filter((r) => r.status === "NEW").length,
    REVIEWED: rows.filter((r) => r.status === "REVIEWED").length,
    ACTION_PLANNED: rows.filter((r) => r.status === "ACTION_PLANNED").length,
    CLOSED: rows.filter((r) => r.status === "CLOSED").length,
  };
  const q = f.q.trim().toLowerCase();
  const list = rows
    .filter((r) => (f.status === "open" ? r.status !== "CLOSED" : r.status === f.status))
    .filter((r) => f.area === "all" || r.area === f.area)
    .filter((r) => !q || `${r.name} ${r.cls} ${r.admissionNo}`.toLowerCase().includes(q))
    .sort((x, y) => (x.strength === y.strength ? y.raisedAt.getTime() - x.raisedAt.getTime() : x.strength === "ACT_NOW" ? -1 : 1));
  return { list, counts };
}
export type FlagRow = Awaited<ReturnType<typeof listFlags>>["list"][number];

/** One flag this person may see, or a refusal. */
async function visibleFlag(tx: Tx, who: ReportViewer, a: ReportAccess, flagId: string) {
  const scope = await flagScope(tx, who, a);
  const f = await tx.riskFlag.findFirst({ where: { AND: [scope, { id: flagId }] } });
  if (!f) throw new WarningProblem("This flag was not found, or it is not one of your students.");
  return f;
}

/** May this person review this flag? Teachers their own students; fee flags the people who decide about fees. */
export function mayReview(a: ReportAccess, area: string) {
  if (a.warnings.review === "none") return false;
  return area === "fees" ? a.warnings.feeReview : true;
}

/** Leaders watch and Remind the person who should act (the class teacher, or accounts for fees). */
export function mayRemind(a: ReportAccess) {
  return a.warnings.on && !a.own;
}

/**
 * A person's review (required before any action): Reviewed with a note, an
 * action planned (which makes the Task or the counselling referral), or closed
 * as not a concern with the reason. Audited with the decision and note.
 */
export async function reviewFlag(tx: Tx, who: ReportViewer, a: ReportAccess, flagId: string, input: { decision: string; note: string; action: string | null }, now = new Date()) {
  const f = await visibleFlag(tx, who, a, flagId);
  if (!mayReview(a, f.area)) throw new WarningProblem("Your role watches these flags. The class teacher reviews them; use Remind to ask them.");
  if (f.status === "CLOSED") throw new WarningProblem("This flag is closed.");
  const decision = input.decision as Decision;
  if (!(decision in DECISION_LABEL)) throw new WarningProblem("Choose the decision.", "decision");
  const note = input.note.trim().replace(/\s+/g, " ");
  if (note.length < 5) throw new WarningProblem(decision === "NOT_A_CONCERN" ? "Say why this is not a concern." : "Write a short note, so others understand later.", "note");
  if (note.length > 1000) throw new WarningProblem("Keep the note to 1,000 characters.", "note");
  const act = input.action ? ACTIONS.find((x) => x.key === input.action) : null;
  if (input.action && !act) throw new WarningProblem("Pick the action from the list.", "action");
  if (decision === "ACTION_PLANNED" && !act) throw new WarningProblem("Pick the action to plan.", "action");
  if (act?.fees && f.area !== "fees") throw new WarningProblem("Fee follow-up is for fee flags.", "action");
  if (decision === "NOT_A_CONCERN" && act) throw new WarningProblem("A flag closed as not a concern has no action.", "action");

  const student = await tx.student.findUniqueOrThrow({ where: { id: f.studentId }, select: { fullName: true } });
  const section = f.sectionId ? await tx.section.findFirst({ where: { id: f.sectionId }, include: { schoolClass: { select: { name: true } } } }) : null;
  const cls = section ? `${section.schoolClass.name.replace(/^Class\s+/i, "")} ${section.name}` : "";
  let taskId: string | null = null;
  let counsellingId: string | null = null;
  let made: string | null = null;
  if (act && decision !== "NOT_A_CONCERN") {
    if (act.key === "counsellor") {
      const c = await referToCounselling(tx, who.ctx, { studentId: f.studentId, reason: `Early warning: ${f.reason.split("\n")[0]}. ${note}` });
      counsellingId = c.id;
      made = "Counselling referral sent.";
    } else {
      const school = await tx.school.findUniqueOrThrow({ where: { id: who.ctx.schoolId }, select: { timeZone: true } });
      const due = addDays(todayIn(school.timeZone, now), 3);
      const task = await addTask(tx, { ctx: who.ctx, access: taskAccess(who) }, {
        title: `${act.label}: ${student.fullName}${cls ? ` (${cls})` : ""}`.slice(0, 150),
        assignedToId: who.ctx.userId, dueAt: new Date(dayStartUtc(due.toISOString().slice(0, 10), school.timeZone).getTime() + 17 * 3600_000), details: `From an early-warning flag. ${f.reason.replace(/\n/g, ". ")}. Review note: ${note}`, remind: true, confirmPast: true,
      }, { now, timeZone: school.timeZone, link: `${WARNINGS_HREF}?open=${f.id}` });
      taskId = task.id;
      made = `Task created: ${task.title}, due ${formatDate(due, "UTC")}.`;
    }
  }
  const status: FlagStatus = decision === "NOT_A_CONCERN" ? "CLOSED" : decision === "ACTION_PLANNED" ? "ACTION_PLANNED" : f.status === "ACTION_PLANNED" ? "ACTION_PLANNED" : "REVIEWED";
  await tx.flagReview.create({ data: { schoolId: who.ctx.schoolId, flagId: f.id, decision, note, action: act?.label ?? null, reviewerId: who.ctx.userId! } });
  await tx.riskFlag.update({
    where: { id: f.id },
    data: {
      status, ...(act ? { action: act.label } : {}), ...(taskId ? { taskId } : {}), ...(counsellingId ? { counsellingId } : {}),
      ...(status === "CLOSED" ? { closedAt: now, closedReason: note } : {}),
    },
  });
  await writeAudit(tx, who.ctx, { action: "flag-reviewed", recordType: "Risk Flag", recordId: f.id, before: { status: f.status }, after: { status, decision, note, action: act?.label ?? null, taskId, counsellingId } });
  return { name: student.fullName, status, decision, made };
}

/** Remind the class teacher (attendance and marks) or the accounts team (fees) to look at a flag. */
export async function remindFlag(tx: Tx, who: ReportViewer, a: ReportAccess, flagId: string) {
  if (!mayRemind(a)) throw new WarningProblem("You review these flags yourself.");
  const f = await visibleFlag(tx, who, a, flagId);
  if (f.status === "CLOSED") throw new WarningProblem("This flag is closed.");
  const student = await tx.student.findUniqueOrThrow({ where: { id: f.studentId }, select: { fullName: true } });
  let to: { id: string; name: string }[] = [];
  if (f.area === "fees") {
    const rows = await tx.schoolAccess.findMany({ where: { schoolId: who.ctx.schoolId, archivedAt: null, userLogin: { status: "ACTIVE" }, roles: { some: { role: { key: "accountant", archivedAt: null } } } }, include: { userLogin: { select: { id: true, displayName: true } } } });
    to = rows.map((r) => ({ id: r.userLogin.id, name: r.userLogin.displayName }));
  } else if (f.sectionId) {
    const section = await tx.section.findFirst({ where: { id: f.sectionId }, select: { classTeacherId: true } });
    const t = section?.classTeacherId ? await tx.staff.findFirst({ where: { id: section.classTeacherId, archivedAt: null }, select: { userLoginId: true, fullName: true } }) : null;
    if (t?.userLoginId) to = [{ id: t.userLoginId, name: t.fullName }];
  }
  to = to.filter((p) => p.id !== who.ctx.userId);
  if (!to.length) throw new WarningProblem(f.area === "fees" ? "No accountant with a login to remind." : "This class has no class teacher with a login. Set one in Academics, Classes & Sections.");
  const text = f.area === "fees"
    ? `Please follow up the fees of ${student.fullName}: ${f.reason.split("\n")[0]}.`
    : `Please review the early-warning flag for ${student.fullName}: ${f.reason.split("\n")[0]}.`;
  for (const p of to) {
    await sendReminder(tx, who.ctx, { action: "early-warning-reminder", recordType: "Risk Flag", recordId: f.id, to: p.id, text, link: f.area === "fees" ? "/fee-management/defaulters" : `${WARNINGS_HREF}?open=${f.id}` });
  }
  return { names: to.map((p) => p.name), student: student.fullName };
}

/** When each flag was last reminded today. */
export async function remindedToday(tx: Tx, ctx: SchoolContext, flagIds: string[], tz: string) {
  return remindedSince(tx, ctx, "early-warning-reminder", flagIds, dayStartUtc(todayIn(tz).toISOString().slice(0, 10), tz));
}

/** Open flags of one student for their profile ("today" items) and the Dashboard. */
export async function studentFlags(tx: Tx, studentId: string, area?: Area[]) {
  return tx.riskFlag.findMany({ where: { studentId, closedAt: null, ...(area ? { area: { in: area } } : {}) }, orderBy: [{ strength: "asc" }, { raisedAt: "desc" }] });
}

/* ---------- AI signals (optional: Settings, Modules On/Off) ---------- */

export type AiSignal = {
  key: string; kind: "dropout" | "prediction" | "unusual"; title: string; source: string; body: string; studentId?: string; flagId?: string;
  /** Looking ahead: the area, how soon to act, and where to look. */
  area?: ForecastArea; strength?: "WATCH" | "ACT_NOW"; href?: string; hrefLabel?: string;
};

/**
 * Suggestions from simple patterns in the school's own records. Each is
 * labelled "Suggestion" with what it is based on, and never changes anything:
 * a person adds it for review or closes it as not a concern.
 */
export async function aiSignals(tx: Tx, who: ReportViewer, a: ReportAccess, now = new Date()): Promise<AiSignal[]> {
  if (!a.ai.insights && !a.ai.forecasts) return [];
  const tz = who.school.timeZone;
  const today = todayIn(tz, now);
  const year = await currentYear(tx, who.ctx);
  if (!year) return [];
  const out: AiSignal[] = [];

  if (a.ai.insights) {
    // Dropout risk: attendance falling three months in a row for a student who is already flagged.
    const flagged = await tx.riskFlag.findMany({ where: { closedAt: null, area: "attendance", strength: "ACT_NOW" }, take: 30 });
    const months = [2, 1, 0].map((back) => {
      const s = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - back, 1));
      const e = back === 0 ? today : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - back + 1, 0));
      return { s, e };
    });
    if (flagged.length) {
      const ids = flagged.map((f) => f.studentId);
      const sums = await Promise.all(months.map((m) => attendanceSummary(tx, who.ctx, { studentIds: ids, from: m.s < year.startDate ? year.startDate : m.s, to: m.e, today })));
      const names = new Map((await tx.student.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true } })).map((s) => [s.id, s.fullName]));
      const fees = new Set((await tx.riskFlag.findMany({ where: { closedAt: null, area: "fees", studentId: { in: ids } }, select: { studentId: true } })).map((x) => x.studentId));
      const reasons = await dropoutReasons(tx, who.ctx, ids, months[0].s < year.startDate ? year.startDate : months[0].s, today, a.warnings.fees);
      for (const f of flagged) {
        const ps = sums.map((s) => s.people.get(f.studentId)?.percent ?? null);
        if (ps.some((p) => p === null)) continue;
        const [p1, p2, p3] = ps as number[];
        if (!(p1 > p2 && p2 > p3)) continue;
        const name = names.get(f.studentId) ?? "A student";
        out.push({
          key: `dropout:${f.studentId}:${today.toISOString().slice(0, 7)}`, kind: "dropout", studentId: f.studentId, flagId: f.id,
          title: `${name} may be at risk of leaving`, strength: reasons.get(f.studentId)?.strong ? "ACT_NOW" : undefined,
          source: `attendance for the last three months${reasons.has(f.studentId) ? ", the absence reasons" : ""}${fees.has(f.studentId) ? " and overdue fees" : ""}`,
          body: `Attendance has fallen three months in a row (${pctText(p1)}, ${pctText(p2)}, ${pctText(p3)}).${reasons.get(f.studentId)?.why ?? ""} A call from the class teacher may help; you decide.`,
        });
      }
    }

    // Unusual activity: many late attendance changes by one person, or many fee changes, against their usual.
    const twoWeeks = new Date(now.getTime() - 14 * DAY_MS);
    const late = await tx.attendanceMark.findMany({ where: { studentId: { not: null }, markedAt: { gte: twoWeeks }, takenAt: { not: null }, archivedAt: null }, select: { markedById: true, markedAt: true, takenAt: true, sectionId: true } });
    const byPerson = new Map<string, { n: number; sections: Set<string> }>();
    for (const m of late) {
      if (!m.markedById || !m.takenAt || m.markedAt.getTime() - m.takenAt.getTime() < 6 * 3600_000) continue;
      const cur = byPerson.get(m.markedById) ?? { n: 0, sections: new Set<string>() };
      cur.n++;
      if (m.sectionId) cur.sections.add(m.sectionId);
      byPerson.set(m.markedById, cur);
    }
    const feeEdits = await tx.auditLogEntry.groupBy({ by: ["userLoginId"], where: { at: { gte: twoWeeks }, OR: [{ recordType: "Concession", action: "applied" }, { recordType: "Student Fee Due", action: "adjusted" }] }, _count: { _all: true } });
    const usual = await tx.auditLogEntry.groupBy({ by: ["userLoginId"], where: { at: { gte: new Date(now.getTime() - 70 * DAY_MS), lt: twoWeeks }, OR: [{ recordType: "Concession", action: "applied" }, { recordType: "Student Fee Due", action: "adjusted" }] }, _count: { _all: true } });
    const people = new Map((await tx.userLogin.findMany({ where: { id: { in: [...byPerson.keys(), ...feeEdits.map((f) => f.userLoginId).filter((x): x is string => Boolean(x))] } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
    for (const [pid, v] of byPerson) {
      if (v.n < 10) continue;
      out.push({
        key: `unusual-att:${pid}:${today.toISOString().slice(0, 10)}`, kind: "unusual",
        title: `Unusual: ${v.n} late attendance changes by one login`,
        source: "change times in the attendance register, last 14 days",
        body: `${people.get(pid) ?? "One login"} changed ${v.n} marks more than 6 hours after the register was taken, in ${v.sections.size} ${v.sections.size === 1 ? "class" : "classes"}. Usually there are one or two a week. Please check with the class teacher.`,
      });
    }
    if (a.warnings.fees) {
      for (const e of feeEdits) {
        if (!e.userLoginId) continue;
        const before = (usual.find((u) => u.userLoginId === e.userLoginId)?._count._all ?? 0) / 4; // per two weeks over the 8 weeks before
        if (e._count._all < 5 || e._count._all < before * 3) continue;
        out.push({
          key: `unusual-fee:${e.userLoginId}:${today.toISOString().slice(0, 10)}`, kind: "unusual",
          title: `Unusual: ${e._count._all} fee changes by one person in two weeks`,
          source: "concessions and fee adjustments in the audit log, last 10 weeks",
          body: `${people.get(e.userLoginId) ?? "One person"} made ${e._count._all} concessions or fee adjustments in the last 14 days, against about ${Math.round(before)} usually. Please check them in Fee Management.`,
        });
      }
    }
  }

  if (a.ai.forecasts) {
    // Looking ahead: worked out by the background job and stored (forecasts.ts).
    for (const f of await forecastsFor(tx, { fees: a.warnings.fees, finance: a.finance !== null })) {
      out.push({ key: f.key, kind: "prediction", area: f.area as ForecastArea, strength: f.strength as "WATCH" | "ACT_NOW", title: f.title, source: f.source, body: f.body, studentId: f.studentId ?? undefined, href: f.href ?? undefined, hrefLabel: f.hrefLabel ?? undefined });
    }
  }

  const done = new Set((await tx.aiSignalDecision.findMany({ where: { signalKey: { in: out.map((s) => s.key) } }, select: { signalKey: true } })).map((d) => d.signalKey));
  return out.filter((s) => !done.has(s.key));
}

/** A person's decision on a suggestion: added for review (a Watch flag, or a Task for checks), or not a concern. Audited. */
export async function decideAiSignal(tx: Tx, who: ReportViewer, a: ReportAccess, key: string, decision: "FLAGGED" | "DISMISSED", now = new Date()) {
  const signal = (await aiSignals(tx, who, a, now)).find((s) => s.key === key);
  if (!signal) throw new WarningProblem("This suggestion is no longer there.");
  let flagId: string | null = signal.flagId ?? null;
  if (decision === "FLAGGED" && !flagId) {
    const year = await currentYear(tx, who.ctx);
    if (signal.studentId && year) {
      const enrol = await tx.enrolment.findFirst({ where: { studentId: signal.studentId, academicYearId: year.id, archivedAt: null }, select: { sectionId: true } });
      const area = signal.area === "marks" || signal.area === "fees" ? signal.area : "attendance";
      // One open flag per student and area: a suggestion joins the open one if there is one.
      const already = await tx.riskFlag.findFirst({ where: { studentId: signal.studentId, area, closedAt: null } });
      const flag = already ?? await tx.riskFlag.create({ data: { schoolId: who.ctx.schoolId, studentId: signal.studentId, academicYearId: year.id, sectionId: enrol?.sectionId ?? null, area, strength: "WATCH", reason: signal.title, basis: `${SUGGESTION_BASIS} ${signal.source}`, raisedAt: now } });
      flagId = flag.id;
    } else {
      const school = await tx.school.findUniqueOrThrow({ where: { id: who.ctx.schoolId }, select: { timeZone: true } });
      await addTask(tx, { ctx: who.ctx, access: taskAccess(who) }, { title: `Check: ${signal.title}`.slice(0, 150), assignedToId: who.ctx.userId, dueAt: null, details: `Suggestion, based on ${signal.source}. ${signal.body}`, remind: false }, { now, timeZone: school.timeZone, link: WARNINGS_HREF });
    }
  }
  await tx.aiSignalDecision.create({ data: { schoolId: who.ctx.schoolId, signalKey: key, decision, flagId, userId: who.ctx.userId! } });
  await writeAudit(tx, who.ctx, { action: decision === "FLAGGED" ? "suggestion-added" : "suggestion-dismissed", recordType: "AI Signal", recordId: flagId ?? undefined, after: { key, title: signal.title } });
  return { signal, flagId };
}
