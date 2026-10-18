// Early Warnings (19 §2): students who may need help, from attendance, marks
// and fees, for a person to review. The rules come from the modules' own
// settings (Attendance Settings threshold and absent-in-a-row, Exam Settings
// pass mark, the fee overdue days here), plus the marks-drop rule the
// Principal sets on this page. A flag is only a signal: nothing happens to a
// student until a person reviews it, and every planned action (a Task or a
// counselling referral) is made by that review, with the reviewer's note.
//
// Attendance is flagged once (gap list P1.6): the Attendance Flag that A4
// raises (05 §4) is the one record of a student's attendance concern. Early
// Warnings lists it as the student's attendance row and records the review on
// it, so a review here shows in Attendance and on the Dashboard, and a flag
// that clears in Attendance closes here. A Risk Flag is raised for attendance
// only where no Attendance Flag covers the student (the Watch line above the
// threshold, or a school with the threshold alert off); once an Attendance
// Flag is raised, that Risk Flag joins it (joinAttendanceFlags) with its
// reviews, and is closed with a link, never deleted.
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
import { currentYear, currentYears } from "../academic/years";
import { ownSectionIds } from "../people";
import { attendanceSettings } from "../attendance/settings";
import { attendanceSummary } from "../attendance/summary";
import { flagStatusOf, OPEN_ATTENDANCE_FLAG } from "../attendance/flags";
import { examSettings } from "../exams/settings";
import type { SubjectResult } from "../exams/compute";
import { defaulters } from "../fees/defaulters";
import { formatDate, formatRupees } from "../format";
import { addDays, DAY_MS, todayIn } from "../staff/dates";
import { dayStartUtc } from "../periods";
import { addTask, assignable, taskAccess } from "../dashboard/tasks";
import { referToCounselling } from "../students/behaviour";
import { BUILT_MODULES } from "../modules";
import { forecastsFor, type Certainty, type ForecastArea } from "./forecasts";
import { withAbsenceReasons } from "./absence-signals";
import { BASE, type ReportAccess } from "./access";
import { attendanceFlagRows, coveredStudents, joinAttendanceFlags, JOINED, riskRow, type BaseRow } from "./attendance-rows";
import { belowThresholdStrength, closerLook, FAILS_FOR_ACT_NOW, marksStrength, withTwoAreas } from "./strength";
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

/**
 * Attendance signals for students no Attendance Flag covers: within the watch
 * margin above the threshold (Watch), or below it where Attendance has not
 * flagged them (Act now; the threshold alert may be off). Students with an
 * Attendance Flag not yet cleared are left out: that flag is their attendance
 * row (attendanceFlagRows), even when a person closed it as not a concern.
 */
async function attendanceSignals(tx: Tx, ctx: SchoolContext, year: { id: string; startDate: Date }, enrol: Map<string, string>, today: Date, rules: Awaited<ReturnType<typeof warningRules>>, covered: Set<string>): Promise<Signal[]> {
  const ids = [...enrol.keys()].filter((id) => !covered.has(id));
  if (!ids.length || today < year.startDate) return [];
  const recentFrom = addDays(today, -29) < year.startDate ? year.startDate : addDays(today, -29);
  const [sum, recent] = await Promise.all([
    attendanceSummary(tx, ctx, { studentIds: ids, from: year.startDate, to: today, today }),
    attendanceSummary(tx, ctx, { studentIds: ids, from: recentFrom, to: today, today }),
  ]);
  const since = `${formatDate(year.startDate, "UTC")} to ${formatDate(today, "UTC")}`;
  const out: Signal[] = [];
  for (const id of ids) {
    const p = sum.people.get(id)?.percent ?? null;
    if (p === null || sum.people.get(id)!.countedDays < 5) continue;
    if (p < rules.threshold) {
      // Act now only on strong evidence: falling lately, or well below the threshold (strength.ts).
      const r = recent.people.get(id);
      const s = belowThresholdStrength({ percent: p, recent: r && r.countedDays >= 5 ? r.percent : null, threshold: rules.threshold });
      out.push({ studentId: id, sectionId: enrol.get(id) ?? null, area: "attendance", strength: s.strength, reason: [`Attendance ${pctText(p)} this year (threshold ${rules.threshold}%)`, ...(s.line ? [s.line] : [])].join("\n"), basis: [`Attendance, ${since} · threshold ${rules.threshold}% (Attendance Settings)${s.note ? ` · ${s.note}` : ""}`, ...(s.line ? ["Attendance in the last 30 days against the year so far"] : [])].join("\n"), value: p });
    } else if (p < rules.watch) out.push({ studentId: id, sectionId: enrol.get(id) ?? null, area: "attendance", strength: "WATCH", reason: `Attendance ${pctText(p)} this year (watch line ${rules.watch}%, threshold ${rules.threshold}%)`, basis: `Attendance, ${since}`, value: p });
  }
  return out;
}

/** Marks signals from published results: below the pass mark in two or more subjects (Act now) or one (Watch), and a fall between the last two exams (Watch). */
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
    let dropped = false;
    if (failed.length) {
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
      dropped = true;
    }
    // Act now for fails in two or more subjects; one fail or a fall is Watch (strength.ts).
    const strength = marksStrength(failed.length, dropped);
    if (strength === "ACT_NOW") basis[0] = `${basis[0]} · Act now: below the pass mark in ${FAILS_FOR_ACT_NOW} or more subjects`;
    if (strength) out.push({ studentId: id, sectionId: enrol.get(id) ?? null, area: "marks", strength, reason: reasons.join("\n"), basis: basis.join("\n"), value: last.percent });
  }
  return out;
}

/**
 * Fee signals from the same Defaulters list as Fee Management: overdue longer
 * than the rule. Always Watch: overdue fees are an accounts matter, followed up
 * from Fee Defaulters, never "Act now" on their own (strength.ts).
 */
async function feeSignals(tx: Tx, ctx: SchoolContext, year: { id: string }, enrol: Map<string, string>, today: Date, rules: Awaited<ReturnType<typeof warningRules>>): Promise<Signal[]> {
  if (!BUILT_MODULES.has("fee-management")) return [];
  const d = await defaulters(tx, ctx, { userId: "", see: "all", change: "none", roleKeys: [], sectionIds: null, yearId: year.id }, today);
  return d.rows.filter((r) => r.daysOverdue > rules.feeDays && enrol.has(r.studentId)).map((r) => ({
    studentId: r.studentId, sectionId: enrol.get(r.studentId) ?? null, area: "fees" as const,
    strength: "WATCH" as const,
    reason: `Fees overdue ${r.daysOverdue} days: ${formatRupees(r.overduePaise)} (${r.heads})`,
    basis: `Fee Defaulters · flag after ${rules.feeDays} days · an accounts matter, followed up in Fee Management`, value: r.daysOverdue,
  }));
}

/**
 * Works out every signal again and keeps one open flag per student and area:
 * new signals become New flags (the class teacher is told about Act now ones),
 * changed numbers update the open flag, and flags whose numbers are back
 * within the rules close by themselves with that reason. Attendance Flags are
 * not copied: an attendance Risk Flag whose student has one joins it first.
 * Safe to run twice.
 */
export async function refreshFlags(tx: Tx, ctx: SchoolContext, now = new Date()) {
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { timeZone: true } });
  const today = todayIn(school.timeZone, now);
  const joined = await joinAttendanceFlags(tx, ctx, now);
  // Every campus's current year (gap list G25): students on each campus get their flags.
  const years = await currentYears(tx, ctx);
  if (!years.length) return { raised: 0, updated: 0, cleared: 0, joined };
  const rules = await warningRules(tx, ctx);
  const covered = await coveredStudents(tx);
  const yearOf = new Map<string, string>();
  const found: Signal[] = [];
  for (const year of years) {
    const enrolRows = await tx.enrolment.findMany({ where: { academicYearId: year.id, archivedAt: null, status: "STUDYING", student: { archivedAt: null } }, select: { studentId: true, sectionId: true } });
    const enrol = new Map(enrolRows.map((e) => [e.studentId, e.sectionId]));
    for (const e of enrolRows) yearOf.set(e.studentId, year.id);
    // Absence reasons adjust them (./absence-signals.ts); without recorded reasons nothing changes.
    // Attendance Flag rows get the same in attendanceFlagRows.
    found.push(...await withAbsenceReasons(tx, ctx, [
      ...(await attendanceSignals(tx, ctx, year, enrol, today, rules, covered)),
      ...(await marksSignals(tx, year, enrol, rules)),
      ...(await feeSignals(tx, ctx, year, enrol, today, rules)),
    ], { from: year.startDate, today, enrol, threshold: rules.threshold, streakDays: rules.streakDays }));
  }
  // Concerns in two areas at once are Act now (strength.ts); an open Attendance Flag counts as the attendance one.
  const attendanceOpen = new Set((await tx.attendanceFlag.findMany({ where: OPEN_ATTENDANCE_FLAG, select: { studentId: true }, distinct: ["studentId"] })).map((f) => f.studentId));
  const signals: Signal[] = withTwoAreas(found, attendanceOpen);
  const open = await tx.riskFlag.findMany({ where: { closedAt: null } });
  const quiet = await tx.riskFlag.findMany({ where: { closedAt: { gte: new Date(now.getTime() - QUIET_DAYS * DAY_MS) }, status: "CLOSED", NOT: { closedReason: { in: [CLEARED, JOINED] } } }, select: { studentId: true, area: true, strength: true } });
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
    const flag = await tx.riskFlag.create({ data: { schoolId: ctx.schoolId, studentId: s.studentId, academicYearId: yearOf.get(s.studentId) ?? years[0].id, sectionId: s.sectionId, area: s.area, strength: s.strength, reason: s.reason, basis: s.basis, value: s.value, raisedAt: now } });
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
  return { raised, updated, cleared, joined };
}

/** Which flags this person sees: their own students for own reach; fee flags only with the whole school's fees. */
export async function flagScope(tx: Tx, who: ReportViewer, a: ReportAccess): Promise<Prisma.RiskFlagWhereInput> {
  return (await scopeOf(tx, who, a)).where;
}

/** The Risk Flag filter, and the sections whose Attendance Flags this person sees (null: every section). */
async function scopeOf(tx: Tx, who: ReportViewer, a: ReportAccess) {
  // The person's campus year for own reach; every campus's current year for people who see the school (gap list G25).
  const year = a.own ? await currentYear(tx, who.ctx, who.campusId) : await currentYears(tx, who.ctx, who.campusId ? [who.campusId] : null);
  if (!a.warnings.on) return { where: { id: "00000000-0000-0000-0000-000000000000" } as Prisma.RiskFlagWhereInput, sectionIds: [] as string[] | null, year };
  const where: Prisma.RiskFlagWhereInput = {};
  if (!a.warnings.fees) where.area = { in: ["attendance", "marks"] };
  let sectionIds: string[] | null = null;
  if (a.own) {
    sectionIds = year && !Array.isArray(year) ? await ownSectionIds(tx, who.ctx, year.id) : [];
    where.sectionId = { in: sectionIds };
  }
  return { where, sectionIds, year };
}

/**
 * Every Early Warnings row this person sees: Risk Flags (marks, fees, and
 * attendance where no Attendance Flag covers the student) and the students'
 * Attendance Flags. An open attendance Risk Flag of a student who has an
 * Attendance Flag is left out (it joins that flag at the next check), so each
 * child has one attendance row.
 */
async function visibleRows(tx: Tx, who: ReportViewer, a: ReportAccess, q: { studentIds?: string[]; openOnly?: boolean; raisedFrom?: Date | null; raisedTo?: Date | null } = {}): Promise<BaseRow[]> {
  if (!a.warnings.on) return [];
  const s = await scopeOf(tx, who, a);
  const raised = q.raisedFrom || q.raisedTo ? { ...(q.raisedFrom ? { gte: q.raisedFrom } : {}), ...(q.raisedTo ? { lt: q.raisedTo } : {}) } : null;
  const risk = await tx.riskFlag.findMany({
    where: { AND: [s.where, q.studentIds ? { studentId: { in: q.studentIds } } : {}, q.openOnly ? { closedAt: null } : {}, raised ? { raisedAt: raised } : {}] },
    include: { reviews: { orderBy: { createdAt: "desc" } } }, orderBy: [{ raisedAt: "desc" }],
  });
  const covered = await coveredStudents(tx, q.studentIds);
  const rules = await warningRules(tx, who.ctx);
  const att = await attendanceFlagRows(tx, who.ctx, { year: s.year, today: todayIn(who.school.timeZone), rules, sectionIds: s.sectionIds, studentIds: q.studentIds, openOnly: q.openOnly });
  return [
    ...risk.filter((f) => !(f.area === "attendance" && f.closedAt === null && covered.has(f.studentId))).map(riskRow),
    ...att.filter((r) => !raised || ((!raised.gte || r.raisedAt >= raised.gte) && (!raised.lt || r.raisedAt < raised.lt))),
  ];
}

export type FlagFilter = { status: "open" | FlagStatus; area: Area | "all"; q: string; raisedFrom: Date | null; raisedTo: Date | null; strength?: "ACT_NOW" | "WATCH" | "all" };

export async function listFlags(tx: Tx, who: ReportViewer, a: ReportAccess, f: FlagFilter) {
  const all = await visibleRows(tx, who, a, { raisedFrom: f.raisedFrom, raisedTo: f.raisedTo });
  const students = new Map((await tx.student.findMany({ where: { id: { in: [...new Set(all.map((x) => x.studentId))] } }, select: { id: true, fullName: true, admissionNo: true, photoFileId: true } })).map((s) => [s.id, s]));
  const sections = new Map((await tx.section.findMany({ where: { id: { in: [...new Set(all.map((x) => x.sectionId).filter((x): x is string => Boolean(x)))] } }, include: { schoolClass: { select: { name: true } } } })).map((s) => [s.id, `${s.schoolClass.name.replace(/^Class\s+/i, "")} ${s.name}`]));
  const people = new Map((await tx.userLogin.findMany({ where: { id: { in: [...new Set(all.flatMap((x) => x.reviews.map((r) => r.reviewerId)))] } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  const rows = all.map((x) => ({
    ...x,
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
    .filter((r) => !f.strength || f.strength === "all" || r.strength === f.strength)
    .filter((r) => !q || `${r.name} ${r.cls} ${r.admissionNo}`.toLowerCase().includes(q))
    .sort(byStrength);
  return { list, counts };
}
export type FlagRow = Awaited<ReturnType<typeof listFlags>>["list"][number];

/** Act now first, then the newest. */
const byStrength = (x: BaseRow, y: BaseRow) => (x.strength === y.strength ? y.raisedAt.getTime() - x.raisedAt.getTime() : x.strength === "ACT_NOW" ? -1 : 1);

/** Is this the row a link names? A row of Attendance Flags answers to each of its flags' ids. */
export const rowIs = (r: BaseRow, id: string) => r.id === id || (r.source === "attendance" && r.attendanceFlagIds.includes(id));

/** One flag this person may see (a Risk Flag, or a student's Attendance Flags), or a refusal. */
async function visibleFlag(tx: Tx, who: ReportViewer, a: ReportAccess, flagId: string): Promise<BaseRow> {
  if (a.warnings.on) {
    const s = await scopeOf(tx, who, a);
    const f = await tx.riskFlag.findFirst({ where: { AND: [s.where, { id: flagId }] }, include: { reviews: { orderBy: { createdAt: "desc" } } } });
    if (f) return riskRow(f);
    const af = await tx.attendanceFlag.findFirst({ where: { id: flagId }, select: { studentId: true } });
    if (af) {
      const rows = await attendanceFlagRows(tx, who.ctx, { year: s.year, today: todayIn(who.school.timeZone), rules: await warningRules(tx, who.ctx), sectionIds: s.sectionIds, studentIds: [af.studentId] });
      const row = rows.find((r) => rowIs(r, flagId));
      if (row) return row;
    }
  }
  throw new WarningProblem("This flag was not found, or it is not one of your students.");
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

/** The area of a flag by its id: a Risk Flag's own, or attendance for an Attendance Flag. */
export async function flagArea(tx: Tx, flagId: string): Promise<string | null> {
  const f = await tx.riskFlag.findFirst({ where: { id: flagId }, select: { area: true } });
  if (f) return f.area;
  return (await tx.attendanceFlag.findFirst({ where: { id: flagId }, select: { id: true } })) ? "attendance" : null;
}

/**
 * A person's review (required before any action): Reviewed with a note, an
 * action planned (which makes the Task or the counselling referral), or closed
 * as not a concern with the reason. Audited with the decision and note. For a
 * student's attendance row the review is saved on their Attendance Flags, so
 * Attendance and the Dashboard show it too.
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
      // The person who should act: accounts for a fee follow-up, the class teacher for the rest (gap list G25).
      const owner = await actionOwner(tx, who, act.key, f.sectionId);
      const task = await addTask(tx, { ctx: who.ctx, access: taskAccess(who) }, {
        title: `${act.label}: ${student.fullName}${cls ? ` (${cls})` : ""}`.slice(0, 150),
        assignedToId: owner?.id ?? who.ctx.userId, dueAt: new Date(dayStartUtc(due.toISOString().slice(0, 10), school.timeZone).getTime() + 17 * 3600_000), details: `From an early-warning flag. ${f.reason.replace(/\n/g, ". ")}. Review note: ${note}`, remind: true, confirmPast: true,
      }, { now, timeZone: school.timeZone, link: `${WARNINGS_HREF}?open=${f.id}` });
      taskId = task.id;
      made = `Task created: ${task.title}, due ${formatDate(due, "UTC")}, ${owner ? `given to ${owner.name}` : "for you"}.`;
    }
  }
  const statusAfter = (before: string): FlagStatus => (decision === "NOT_A_CONCERN" ? "CLOSED" : decision === "ACTION_PLANNED" ? "ACTION_PLANNED" : before === "ACTION_PLANNED" ? "ACTION_PLANNED" : "REVIEWED");
  const change = (before: string) => {
    const status = statusAfter(before);
    return { status, ...(act ? { action: act.label } : {}), ...(taskId ? { taskId } : {}), ...(counsellingId ? { counsellingId } : {}), ...(status === "CLOSED" ? { closedAt: now, closedReason: note } : {}) };
  };
  if (f.source === "attendance") {
    for (const af of await tx.attendanceFlag.findMany({ where: { id: { in: f.attendanceFlagIds } } })) {
      const before = flagStatusOf(af);
      const data = change(before);
      await tx.flagReview.create({ data: { schoolId: who.ctx.schoolId, attendanceFlagId: af.id, decision, note, action: act?.label ?? null, reviewerId: who.ctx.userId!, createdAt: now } });
      await tx.attendanceFlag.update({ where: { id: af.id }, data });
      await writeAudit(tx, who.ctx, { action: "flag-reviewed", recordType: "Attendance Flag", recordId: af.id, before: { status: before }, after: { status: data.status, decision, note, action: act?.label ?? null, taskId, counsellingId } });
    }
  } else {
    const data = change(f.status);
    await tx.flagReview.create({ data: { schoolId: who.ctx.schoolId, flagId: f.id, decision, note, action: act?.label ?? null, reviewerId: who.ctx.userId! } });
    await tx.riskFlag.update({ where: { id: f.id }, data });
    await writeAudit(tx, who.ctx, { action: "flag-reviewed", recordType: "Risk Flag", recordId: f.id, before: { status: f.status }, after: { status: data.status, decision, note, action: act?.label ?? null, taskId, counsellingId } });
  }
  return { name: student.fullName, status: statusAfter(f.status), decision, made };
}

/**
 * Who a planned action's Task goes to: an accountant for a fee follow-up, the
 * class teacher for the others. Null (the reviewer keeps it) when the reviewer
 * may give tasks only to themselves, when nobody fits, or when it is the
 * reviewer themselves.
 */
async function actionOwner(tx: Tx, who: ReportViewer, action: ActionKey, sectionId: string | null): Promise<{ id: string; name: string } | null> {
  if (taskAccess(who) !== "full") return null;
  const people = await assignable(tx, { ctx: who.ctx, access: "full" });
  const pick = (ids: string[]) => people.find((p) => ids.includes(p.id) && p.id !== who.ctx.userId) ?? null;
  if (action === "fee-follow-up") {
    const rows = await tx.schoolAccess.findMany({ where: { schoolId: who.ctx.schoolId, archivedAt: null, userLogin: { status: "ACTIVE" }, roles: { some: { role: { key: "accountant", archivedAt: null } } } }, select: { userLoginId: true } });
    return pick(rows.map((r) => r.userLoginId));
  }
  if (!sectionId) return null;
  const section = await tx.section.findFirst({ where: { id: sectionId }, select: { classTeacherId: true } });
  const t = section?.classTeacherId ? await tx.staff.findFirst({ where: { id: section.classTeacherId, archivedAt: null }, select: { userLoginId: true } }) : null;
  return t?.userLoginId ? pick([t.userLoginId]) : null;
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
    await sendReminder(tx, who.ctx, { action: "early-warning-reminder", recordType: f.source === "attendance" ? "Attendance Flag" : "Risk Flag", recordId: f.id, to: p.id, text, link: f.area === "fees" ? "/fee-management/defaulters" : `${WARNINGS_HREF}?open=${f.id}` });
  }
  return { names: to.map((p) => p.name), student: student.fullName };
}

/** When each flag was last reminded today. */
export async function remindedToday(tx: Tx, ctx: SchoolContext, flagIds: string[], tz: string) {
  return remindedSince(tx, ctx, "early-warning-reminder", flagIds, dayStartUtc(todayIn(tz).toISOString().slice(0, 10), tz));
}

/** Open flags of one student this person sees, Act now first: for their profile ("today" items). */
export async function studentFlags(tx: Tx, who: ReportViewer, a: ReportAccess, studentId: string) {
  const rows = await visibleRows(tx, who, a, { studentIds: [studentId], openOnly: true });
  return rows.filter((r) => r.status !== "CLOSED").sort(byStrength);
}

/** The Early Warnings list the Dashboard card opens: every open Act now row, whatever day it was raised. */
export const ACT_NOW_HREF = `${WARNINGS_HREF}?strength=ACT_NOW&period=all`;

/**
 * What the Early Warnings card on the Dashboard counts: the students, once
 * each, with an open Act now row this person sees (Risk Flags and Attendance
 * Flags alike), split into attendance, marks and both; and, for people who
 * review, how many students wait for a review. Fee rows are never counted:
 * overdue fees are followed up from Fee Defaulters (strength.ts).
 */
export async function dashboardWarnings(tx: Tx, who: ReportViewer, a: ReportAccess) {
  if (!a.warnings.on) return null;
  const rows = (await visibleRows(tx, who, a, { openOnly: true })).filter((r) => r.status !== "CLOSED" && r.area !== "fees");
  const look = closerLook(rows);
  const toReview = new Set(rows.filter((r) => r.status === "NEW").map((r) => r.studentId)).size;
  const actNowToReview = new Set(rows.filter((r) => r.status === "NEW" && r.strength === "ACT_NOW").map((r) => r.studentId)).size;
  return { look, toReview, actNowToReview };
}

/* ---------- AI signals (optional: Settings, Modules On/Off) ---------- */

export type AiSignal = {
  key: string; kind: "dropout" | "prediction" | "unusual"; title: string; source: string; body: string; studentId?: string; flagId?: string;
  /** Looking ahead: the area, how soon to act, and where to look. */
  area?: ForecastArea; strength?: "WATCH" | "ACT_NOW"; href?: string; hrefLabel?: string;
  /** How sure it is, and how much it matters (orders Looking ahead). */
  certainty?: Certainty; score?: number;
};

/**
 * Looking ahead, for this person: the suggestions the background job worked
 * out from the school's own records (forecasts.ts), most important first, less
 * the ones a person already decided. One list: predictions, who may be
 * thinking of leaving and unusual activity (with Student insights on). Each is
 * labelled "Suggestion" with what it is based on, and never changes anything:
 * a person adds it for review or closes it as not a concern.
 */
export async function aiSignals(tx: Tx, who: ReportViewer, a: ReportAccess): Promise<AiSignal[]> {
  if (!a.ai.insights && !a.ai.forecasts) return [];
  const rows = await forecastsFor(tx, { fees: a.warnings.fees, finance: a.finance !== null, forecasts: a.ai.forecasts, insights: a.ai.insights });
  const out: AiSignal[] = rows.map((f) => ({
    key: f.key, kind: f.area === "activity" ? "unusual" : f.area === "students" ? "dropout" : "prediction",
    area: f.area as ForecastArea, strength: f.strength as "WATCH" | "ACT_NOW", title: f.title, source: f.source, body: f.body,
    studentId: f.studentId ?? undefined, href: f.href ?? undefined, hrefLabel: f.hrefLabel ?? undefined,
    certainty: (f.certainty ?? undefined) as Certainty | undefined, score: f.score ?? undefined,
  }));
  const done = new Set((await tx.aiSignalDecision.findMany({ where: { signalKey: { in: out.map((s) => s.key) } }, select: { signalKey: true } })).map((d) => d.signalKey));
  return out.filter((s) => !done.has(s.key));
}

/** A person's decision on a suggestion: added for review (a Watch flag, or a Task for checks), or not a concern. Audited. */
export async function decideAiSignal(tx: Tx, who: ReportViewer, a: ReportAccess, key: string, decision: "FLAGGED" | "DISMISSED", now = new Date()) {
  const signal = (await aiSignals(tx, who, a)).find((s) => s.key === key);
  if (!signal) throw new WarningProblem("This suggestion is no longer there.");
  let flagId: string | null = signal.flagId ?? null;
  if (decision === "FLAGGED" && !flagId) {
    // The student's own campus year (gap list G25).
    const years = await currentYears(tx, who.ctx);
    const enrol = signal.studentId ? await tx.enrolment.findFirst({ where: { studentId: signal.studentId, academicYearId: { in: years.map((y) => y.id) }, archivedAt: null }, select: { sectionId: true, academicYearId: true } }) : null;
    const year = years.find((y) => y.id === enrol?.academicYearId) ?? years[0];
    if (signal.studentId && year) {
      const area = signal.area === "marks" || signal.area === "fees" ? signal.area : "attendance";
      // One open flag per student and area: a suggestion joins the open one if there is one. For
      // attendance that is the student's Attendance Flag; one a person closed is opened again for review.
      const attendance = area === "attendance" ? await tx.attendanceFlag.findMany({ where: { studentId: signal.studentId, clearedAt: null } }) : [];
      if (attendance.length) {
        flagId = [...attendance].sort((x, y) => (x.kind === y.kind ? 0 : x.kind === "below-threshold" ? -1 : 1))[0].id;
        for (const af of attendance.filter((f) => f.status === "CLOSED")) {
          await tx.attendanceFlag.update({ where: { id: af.id }, data: { status: "NEW", closedAt: null, closedReason: null } });
          await writeAudit(tx, who.ctx, { action: "reopened", recordType: "Attendance Flag", recordId: af.id, before: { status: af.status, closedReason: af.closedReason }, after: { status: "NEW", reason: `Added for review from a suggestion: ${signal.title}` } });
        }
      } else {
        const already = await tx.riskFlag.findFirst({ where: { studentId: signal.studentId, area, closedAt: null } });
        const flag = already ?? await tx.riskFlag.create({ data: { schoolId: who.ctx.schoolId, studentId: signal.studentId, academicYearId: year.id, sectionId: enrol?.sectionId ?? null, area, strength: "WATCH", reason: signal.title, basis: `${SUGGESTION_BASIS} ${signal.source}`, raisedAt: now } });
        flagId = flag.id;
      }
    } else {
      const school = await tx.school.findUniqueOrThrow({ where: { id: who.ctx.schoolId }, select: { timeZone: true } });
      await addTask(tx, { ctx: who.ctx, access: taskAccess(who) }, { title: `Check: ${signal.title}`.slice(0, 150), assignedToId: who.ctx.userId, dueAt: null, details: `Suggestion, based on ${signal.source}. ${signal.body}`, remind: false }, { now, timeZone: school.timeZone, link: WARNINGS_HREF });
    }
  }
  await tx.aiSignalDecision.create({ data: { schoolId: who.ctx.schoolId, signalKey: key, decision, flagId, userId: who.ctx.userId! } });
  await writeAudit(tx, who.ctx, { action: decision === "FLAGGED" ? "suggestion-added" : "suggestion-dismissed", recordType: "AI Signal", recordId: flagId ?? undefined, after: { key, title: signal.title } });
  return { signal, flagId };
}
