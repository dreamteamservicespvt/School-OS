// Management brief (01 Dashboard "Principal summary": Summarise today, Summarise
// this week; 19 Reports & Analytics sends principal summaries; gap list G26).
// A short brief for the Principal and the School Admin each school morning, and
// on Monday for the week just gone:
// - what happened: attendance, fees collected against what was expected, admissions;
// - what may happen next: Early Warnings that need a closer look, and the most
//   important Looking ahead suggestions;
// - what needs a decision: approvals waiting.
// Every line says where its number comes from and links to the list behind it.
// Every number is the school's own record, read with the person's own
// permissions; forecasts are labelled "Suggestion". The words are made by rules
// here, not by an outside AI. If an AI service is added later it may only
// rephrase these lines, never add a fact.
//
// Shown on the Dashboard as "Today's brief" and sent at 7:30 AM school time
// (never later than 11 AM, never on a Sunday or a holiday) as a notification,
// with copies by the channels each person chose for "Today's brief" in My
// profile. Switched on per school: Settings, Modules On/Off, AI features,
// Principal summary. Each brief is kept (Management Brief), so the one sent and
// the one on screen are the same, and a brief is never sent twice.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { notify } from "../notifications";
import { approvalsFor } from "../approvals";
import { schoolDays } from "../attendance/calendar";
import { classWise } from "../attendance/classwise";
import { currentYear } from "../academic/years";
import { inCampus, personCampusId } from "../campus";
import { feeStudentFilter } from "../fees/access";
import { forecast as feeForecast } from "../fees/dashboard";
import { loginsWithRole } from "../front-office/people";
import { formatDate } from "../format";
import { addDays, todayIn } from "../staff/dates";
import { minuteIn } from "../dashboard/common";
import { moduleOpen, reportAccess } from "./access";
import { viewerOf } from "./run";
import { aiSignals, dashboardWarnings, ACT_NOW_HREF } from "./warnings";
import { closerLookWords } from "./strength";
import { lookingAheadView } from "./looking-ahead";
import { wholeRupees } from "./forecasts";
import type { ReportViewer } from "./types";
import { aiAllowed, DEFAULT_AI_ROLES } from "../settings/switch-rules";

/** The School Feature that switches the brief on (Settings, Modules On/Off, AI features). */
export const BRIEF_FEATURE = "ai-principal-summary";
/** Who gets it. */
export const BRIEF_ROLES = ["principal", "school-admin"];
/** Sent from 7:30 AM, school time... */
export const BRIEF_FROM_MINUTE = 7 * 60 + 30;
/** ...and never after 11 AM: a brief the job could not send in the morning waits on the Dashboard instead. */
export const BRIEF_UNTIL_MINUTE = 11 * 60;

export type BriefKind = "DAILY" | "WEEKLY";
export type BriefSection = "happened" | "next" | "decide";
export const BRIEF_SECTION_LABEL: Record<BriefSection, string> = { happened: "What happened", next: "What may need you next", decide: "Waiting for your decision" };
export type BriefLine = { section: BriefSection; text: string; href?: string; suggestion?: boolean; basis?: string };
export type Brief = { kind: BriefKind; forDate: Date; title: string; period: string; lines: BriefLine[] };

/** Monday mornings are the weekly brief; other school mornings the daily one. */
export function briefKind(today: Date): BriefKind {
  return today.getUTCDay() === 1 ? "WEEKLY" : "DAILY";
}

/** Is it time to send this morning's brief? From 7:30 to 11 AM, school time, on a school day. */
export function briefTime(minute: number, schoolDay: boolean) {
  return schoolDay && minute >= BRIEF_FROM_MINUTE && minute < BRIEF_UNTIL_MINUTE;
}

const pct = (n: number) => `${Math.round(n * 10) / 10}%`;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The days a brief looks back on: the last school day (daily), or the 7 days before (weekly). Null when there was no school day lately. */
async function lookBack(tx: Tx, ctx: SchoolContext, today: Date, kind: BriefKind, campusId: string | null) {
  if (kind === "WEEKLY") {
    const from = addDays(today, -7), to = addDays(today, -1);
    return { from, to, words: `last week, ${formatDate(from, "UTC")} to ${formatDate(to, "UTC")}`, short: "last week" };
  }
  const days = await schoolDays(tx, ctx, addDays(today, -14), addDays(today, -1), campusId);
  const last = days.working[days.working.length - 1];
  if (!last) return null;
  const yesterday = iso(last) === iso(addDays(today, -1));
  return { from: last, to: last, words: yesterday ? `yesterday, ${formatDate(last, "UTC")}` : `the last school day, ${formatDate(last, "UTC")}`, short: yesterday ? "yesterday" : `on ${formatDate(last, "UTC")}` };
}

/**
 * One person's brief for this morning, from the records they may see. `kind`
 * defaults to today's (weekly on Monday). Pure reading: nothing changes.
 */
export async function composeBrief(tx: Tx, who: ReportViewer, now = new Date(), kind?: BriefKind): Promise<Brief> {
  const ctx = who.ctx;
  const today = todayIn(who.school.timeZone, now);
  const k = kind ?? briefKind(today);
  const a = reportAccess(who);
  // The person's own campus's year; a "One campus" login reads only its campus's money and admissions.
  const year = await currentYear(tx, ctx, await personCampusId(tx, ctx, who));
  const only = await feeStudentFilter(tx, { campusId: who.campusId ?? null });
  const campus = inCampus(who);
  const back = await lookBack(tx, ctx, today, k, year?.campusId ?? who.campusId ?? null);
  const lines: BriefLine[] = [];
  const range = back ? `from=${iso(back.from)}&to=${iso(back.to)}` : "";

  // What happened.
  if (back && year && moduleOpen(who, "attendance-management") && who.permissions["attendance-management"].see === "all") {
    const [cw, usual] = await Promise.all([
      classWise(tx, ctx, { yearId: year.id, from: back.from, to: back.to, today, campusId: year.campusId }),
      classWise(tx, ctx, { yearId: year.id, from: addDays(back.from, -28) < year.startDate ? year.startDate : addDays(back.from, -28), to: addDays(back.from, -1), today, campusId: year.campusId }),
    ]);
    if (cw.totals.percent !== null) {
      const u = usual.totals.percent;
      lines.push({
        section: "happened", href: `/reports-analytics/r/at-daily?period=custom&${range}`,
        text: `Attendance ${back.short}: ${pct(cw.totals.percent)}, ${plural(cw.totals.absent, "student")} absent${u !== null ? ` (usually ${pct(u)} over the 4 weeks before)` : ""}.`,
        basis: "the attendance register, as in Attendance Reports",
      });
    }
  }
  if (back && a.fees && moduleOpen(who, "fee-management")) {
    const [paid, fc] = await Promise.all([
      tx.payment.aggregate({ where: { status: "POSTED", broughtIn: false, paymentDate: { gte: back.from, lte: back.to }, ...only }, _sum: { amountPaise: true }, _count: { _all: true } }),
      feeForecast(tx, today, { only }),
    ]);
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const month = await tx.payment.aggregate({ where: { status: "POSTED", broughtIn: false, paymentDate: { gte: monthStart, lte: today }, ...only }, _sum: { amountPaise: true } });
    const expected = fc.months[0]?.expected ?? null;
    lines.push({
      section: "happened", href: `/fee-management/dashboard?period=custom&${range}&status=POSTED&kind=all`,
      text: `Fees collected ${back.short}: ${wholeRupees(paid._sum.amountPaise ?? BigInt(0))} in ${plural(paid._count._all, "payment")}.`,
      basis: "posted payments (Fee Management)",
    });
    if (expected !== null) {
      lines.push({
        section: "happened", href: "/fee-management/dashboard?period=thismonth&status=POSTED&kind=all", suggestion: true,
        text: `This month so far: ${wholeRupees(month._sum.amountPaise ?? BigInt(0))} collected, of about ${wholeRupees(expected)} expected this month.`,
        basis: "the expected amount is a Suggestion: this month's dues at the share your families usually pay (Fee Dashboard)",
      });
    }
  }
  if (back && moduleOpen(who, "admission-management") && who.permissions["admission-management"].see === "all") {
    const end = addDays(back.to, 1);
    const [enquiries, applications, admitted] = await Promise.all([
      tx.enquiry.count({ where: { archivedAt: null, createdAt: { gte: back.from, lt: end }, ...campus } }),
      tx.application.count({ where: { archivedAt: null, createdAt: { gte: back.from, lt: end }, ...campus } }),
      tx.application.count({ where: { archivedAt: null, admittedAt: { gte: back.from, lt: end }, ...campus } }),
    ]);
    if (enquiries + applications + admitted > 0) {
      lines.push({
        section: "happened", href: `/admission-management/enquiries?period=custom&${range}`,
        text: `Admissions ${back.short}: ${plural(enquiries, "new enquiry", "new enquiries")}, ${plural(applications, "application")}, ${admitted} admitted.`,
        basis: "enquiries and applications (Admission Management)",
      });
    }
  }

  // What may need you next.
  const warnings = await dashboardWarnings(tx, who, a);
  if (warnings && warnings.look.students > 0) {
    lines.push({ section: "next", href: ACT_NOW_HREF, text: `Early warnings: ${closerLookWords(warnings.look)}.`, basis: "Early Warnings rules (Attendance, Exam and Fee Settings); fee follow-up stays in Fee Defaulters" });
  }
  if (a.ai.forecasts || a.ai.insights) {
    const view = lookingAheadView(await aiSignals(tx, who, a));
    for (const s of view.top.slice(0, k === "WEEKLY" ? 5 : 3)) {
      lines.push({ section: "next", href: s.href ?? "/reports-analytics/early-warnings#looking-ahead", suggestion: true, text: s.title, basis: s.source });
    }
    if (view.total > (k === "WEEKLY" ? 5 : 3)) {
      lines.push({ section: "next", href: "/reports-analytics/early-warnings?ahead=all#looking-ahead", text: `${plural(view.total, "Looking ahead suggestion")} in all.`, basis: "Looking ahead, most important first" });
    }
  }

  // Waiting for your decision.
  const where = await approvalsFor(tx, ctx, who.roles.map((r) => r.key));
  const [waiting, old] = await Promise.all([
    tx.approval.count({ where }),
    tx.approval.count({ where: { AND: [where, { createdAt: { lt: new Date(now.getTime() - 2 * 86_400_000) } }] } }),
  ]);
  lines.push({
    section: "decide", href: "/approvals",
    text: waiting ? `${plural(waiting, "approval")} waiting for you${old ? `, ${old} for more than 2 days` : ""}.` : "Nothing waiting for your approval.",
    basis: "Approvals",
  });

  return { kind: k, forDate: today, lines, title: titleOf(k), period: periodOf(back) };
}

const titleOf = (k: BriefKind) => (k === "WEEKLY" ? "This week's brief" : "Today's brief");
const periodOf = (back: { words: string } | null) => (back ? `Looking back on ${back.words}` : "No school day in the last two weeks to look back on");

/** The short text sent as the notification (and its WhatsApp, SMS or email copy): counts only, no student names. */
export function briefNote(b: Brief, schoolName: string) {
  const next = b.lines.filter((l) => l.section === "next" && l.suggestion).length;
  const facts = b.lines.filter((l) => l.section === "happened" && !l.suggestion).map((l) => l.text.replace(/\.$/, ""));
  const decide = b.lines.find((l) => l.section === "decide")?.text.replace(/\.$/, "");
  return `${b.title} for ${schoolName}: ${[...facts, next ? `${next} ${next === 1 ? "suggestion" : "suggestions"} to look at` : null, decide].filter(Boolean).join("; ")}. Open the Dashboard in School OS to see it all.`.slice(0, 900);
}

/** Is the brief on for this school? Needs the AI assistant and the Principal summary switch. */
export async function briefOn(tx: Tx, ctx: SchoolContext) {
  const on = await tx.schoolFeature.count({ where: { schoolId: ctx.schoolId, isOn: true, featureKey: { in: ["ai-assistant", BRIEF_FEATURE] } } });
  return on === 2;
}

/**
 * The morning job (every 15 minutes): from 7:30 to 11 AM on a school day, each
 * Principal and School Admin (when the school chose their role for the AI
 * assistant) gets this morning's brief once, worked out with
 * their own permissions, kept, and sent as a notification (with the copies
 * they chose). Safe to run twice: a brief already sent is not sent again.
 */
export async function sendBriefs(tx: Tx, ctx: SchoolContext, now = new Date()) {
  if (!(await briefOn(tx, ctx))) return { sent: 0, skipped: "off" as const };
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { timeZone: true, name: true } });
  const today = todayIn(school.timeZone, now);
  const day = await schoolDays(tx, ctx, today, today);
  if (!briefTime(minuteIn(school.timeZone, now), day.working.length > 0)) return { sent: 0, skipped: "not-now" as const };
  const kind = briefKind(today);
  const people = new Set<string>();
  for (const role of BRIEF_ROLES) for (const id of await loginsWithRole(tx, ctx, role)) people.add(id);
  let sent = 0;
  for (const userId of people) {
    const have = await tx.managementBrief.findUnique({ where: { schoolId_userLoginId_kind_forDate: { schoolId: ctx.schoolId, userLoginId: userId, kind, forDate: today } } });
    if (have?.sentAt) continue;
    const who = await viewerOf(tx, userId, ctx.schoolId);
    // Only a Principal or School Admin whose role the school chose for the AI assistant.
    if (!who || !briefAllowed(who)) continue;
    const brief = await composeBrief(tx, who, now, kind);
    const lines = brief.lines as unknown as Prisma.InputJsonValue;
    const row = have
      ? await tx.managementBrief.update({ where: { id: have.id }, data: { lines, computedAt: now } })
      : await tx.managementBrief.create({ data: { schoolId: ctx.schoolId, userLoginId: userId, kind, forDate: today, lines, computedAt: now } });
    const note = await notify(tx, { schoolId: ctx.schoolId, userId: null }, { to: userId, type: "management-brief", text: briefNote(brief, school.name), link: "/dashboard#brief" }, now);
    await tx.managementBrief.update({ where: { id: row.id }, data: { sentAt: now, notificationId: note?.id ?? null } });
    sent++;
  }
  return { sent, skipped: null };
}

/** This morning's brief for the Dashboard: the one kept for the person, or worked out now if none is kept yet. */
export async function todaysBrief(tx: Tx, who: ReportViewer, now = new Date()): Promise<Brief> {
  const today = todayIn(who.school.timeZone, now);
  const kept = await tx.managementBrief.findFirst({ where: { userLoginId: who.user.id, forDate: today, archivedAt: null }, orderBy: { computedAt: "desc" } });
  if (kept) {
    // The kept lines are what was sent; the period is worked out again for the same morning.
    const k = kept.kind as BriefKind;
    const year = await currentYear(tx, who.ctx, await personCampusId(tx, who.ctx, who));
    const back = await lookBack(tx, who.ctx, today, k, year?.campusId ?? who.campusId ?? null);
    return { kind: k, forDate: kept.forDate, lines: kept.lines as unknown as BriefLine[], title: titleOf(k), period: periodOf(back) };
  }
  return composeBrief(tx, who, now);
}

/**
 * May this person see the brief? The Principal or School Admin, with the brief
 * switched on, when the school chose that role for the AI assistant (Settings,
 * Modules On/Off; 00-global.md §2.1 rule 8), as for every AI feature.
 */
export function briefAllowed(who: Pick<ReportViewer, "roles" | "features" | "aiRoles">) {
  if (!aiAllowed(who, BRIEF_FEATURE)) return false;
  const allowed = new Set(who.aiRoles ?? DEFAULT_AI_ROLES);
  return who.roles.some((r) => r.key !== null && BRIEF_ROLES.includes(r.key) && allowed.has(r.key));
}
