// The console Dashboard (07-super-admin.md §3.1): what needs DREAM TEAM today,
// schools at a glance, and whether the service is working. Built from the
// console's own records and the counts kept on each school's card.
import "server-only";

import { prisma, withConsole } from "../db";
import { formatDate, formatRupees, formatTime } from "../format";
import { platformRazorpay } from "../payments/razorpay";
import { addDays, daysBetween, GRACE_DAYS, istDay } from "./billing";
import { maskMobile } from "./activity";
import { NOT_OPENED_MS, SETUP_STUCK_DAYS } from "./schools";
import { CHANNEL_LABEL, channelIsSetUp, type ConsoleChannel } from "./outbox";
import type { ConsoleAction } from "./roles";

export type AttentionKind = "never" | "expired" | "stuck" | "trial" | "grace" | "over" | "alert";
export type Attention = {
  id: string;
  kind: AttentionKind;
  tone: "warn" | "bad" | "info";
  title: string;
  detail: string;
  /** The button's words, the action it needs, and what it targets. */
  action: string;
  needs: ConsoleAction | null;
  schoolId: string | null;
  schoolName: string | null;
  targetId: string | null;
};

export type ChannelStats = Record<string, { sentToday: number; stuck: number; failed: number }>;

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
const channelWords = (list: string[]) => {
  const words = list.map((c) => CHANNEL_LABEL[c as ConsoleChannel] ?? (c === "sms" ? "SMS" : c));
  return words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}` : words[0] ?? "";
};
type StepRow = { label: string; done: boolean; skipped?: boolean };
export const nextStep = (steps: unknown) => (Array.isArray(steps) ? (steps as StepRow[]).find((s) => !s.done && !s.skipped)?.label ?? null : null);

/** Everything that needs a person today, most urgent first. */
export async function attentionItems(now = new Date()): Promise<Attention[]> {
  const today = istDay(now);
  const notOpenedBefore = new Date(now.getTime() - NOT_OPENED_MS);
  const stuckBefore = new Date(now.getTime() - SETUP_STUCK_DAYS * 86_400_000);
  return withConsole(async (tx) => {
    const [invites, stuck, trials, grace, subs, cards] = await Promise.all([
      tx.schoolInvite.findMany({
        where: { usedAt: null, cancelledAt: null, replacedAt: null, openedAt: null, OR: [{ sentAt: { lt: notOpenedBefore } }, { expiresAt: { lte: now } }], expiresAt: { gt: new Date(now.getTime() - 30 * 86_400_000) } },
        orderBy: { sentAt: "asc" },
        take: 20,
      }),
      tx.consoleSchool.findMany({ where: { status: { in: ["TRIAL", "ACTIVE"] }, adminSignedIn: true, setupChangedAt: { lt: stuckBefore } }, take: 20 }),
      tx.consoleSchool.findMany({ where: { status: "TRIAL", trialEndsOn: { lte: addDays(today, 7) } }, orderBy: { trialEndsOn: "asc" }, take: 20 }),
      tx.platformInvoice.findMany({ where: { status: "UNPAID", kind: { in: ["RENEWAL", "SECOND_HALF", "NEW"] }, dueOn: { lt: today } }, orderBy: { dueOn: "asc" }, take: 20 }),
      tx.subscription.findMany({ select: { forSchoolId: true, studentsPaidFor: true, pricePerStudentPaise: true } }),
      tx.consoleSchool.findMany({ where: { status: { not: "CLOSED" } }, select: { id: true, name: true, status: true, activeStudents: true, setupDone: true, setupTotal: true, adminName: true, channelStats: true } }),
    ]);
    const byId = new Map(cards.map((c) => [c.id, c]));
    const pendingTopups = new Set((await tx.platformInvoice.findMany({ where: { kind: "TOPUP", status: { in: ["WAITING", "UNPAID"] } }, select: { forSchoolId: true } })).map((i) => i.forSchoolId));
    const out: Attention[] = [];

    for (const i of invites) {
      const card = byId.get(i.forSchoolId);
      if (!card) continue;
      const expired = i.expiresAt <= now;
      const ago = daysBetween(i.sentAt, now);
      out.push(expired
        ? { id: `expired:${i.id}`, kind: "expired", tone: "bad", title: `${card.name}: ${i.kind === "RESET" ? "reset" : "invite"} link expired ${daysBetween(i.expiresAt, now) <= 1 ? "yesterday" : `${daysBetween(i.expiresAt, now)} days ago`}.`, detail: `${i.name} · sent ${formatDate(i.sentAt)}, never opened`, action: "Send new invite", needs: "invite", schoolId: card.id, schoolName: card.name, targetId: i.id }
        : { id: `never:${i.id}`, kind: "never", tone: "warn", title: `${card.name}: admin ${i.kind === "RESET" ? "reset link" : "invite"} sent ${plural(ago, "day")} ago, not opened.`, detail: `${i.name} · +91 ${maskMobile(i.phone)} · sent on ${channelWords(i.channels)}${i.sentByName ? ` by ${i.sentByName}` : ""}`, action: "Resend invite", needs: "invite", schoolId: card.id, schoolName: card.name, targetId: i.id });
    }

    for (const s of stuck) {
      if (s.setupDone >= s.setupTotal || !s.setupChangedAt) continue;
      const days = daysBetween(s.setupChangedAt, now);
      const step = nextStep(s.setupSteps);
      out.push({ id: `stuck:${s.id}`, kind: "stuck", tone: "warn", title: `${s.name}: setup ${s.setupDone} of ${s.setupTotal} steps, no change for ${plural(days, "day")}.`, detail: `${step ? `Stuck at ${step}` : "Setup not finished"}${s.adminName ? ` · School Admin ${s.adminName}` : ""}`, action: "Call the admin", needs: null, schoolId: s.id, schoolName: s.name, targetId: s.id });
    }

    for (const s of trials) {
      if (!s.trialEndsOn) continue;
      const left = daysBetween(today, s.trialEndsOn);
      const hasPlan = subs.some((x) => x.forSchoolId === s.id);
      out.push({ id: `trial:${s.id}`, kind: "trial", tone: "info", title: `${s.name}: trial ${left > 1 ? `ends in ${left} days` : left === 1 ? "ends tomorrow" : left === 0 ? "ends today" : "has ended"}.`, detail: `Ends ${formatDate(s.trialEndsOn)} · setup ${s.setupDone} of ${s.setupTotal} · ${plural(s.activeStudents, "student")}${hasPlan ? "" : " · no plan chosen yet"}`, action: "Open school", needs: null, schoolId: s.id, schoolName: s.name, targetId: s.id });
    }

    for (const inv of grace) {
      const card = byId.get(inv.forSchoolId);
      if (!card || card.status === "SUSPENDED") continue;
      const endsOn = addDays(inv.dueOn, GRACE_DAYS);
      const left = Math.max(0, daysBetween(today, endsOn));
      out.push({ id: `grace:${inv.id}`, kind: "grace", tone: "bad", title: `${card.name}: ${inv.kind === "NEW" ? "first-year invoice" : "renewal"} unpaid, ${plural(left, "day")} of grace left.`, detail: `Invoice ${inv.number} · ${formatRupees(inv.totalPaise)} · suspends by itself on ${formatDate(endsOn)} if unpaid`, action: "Resend invoice", needs: "invoice", schoolId: card.id, schoolName: card.name, targetId: inv.id });
    }

    for (const sub of subs) {
      const card = byId.get(sub.forSchoolId);
      if (!card || card.status !== "ACTIVE" || pendingTopups.has(card.id)) continue;
      const extra = card.activeStudents - sub.studentsPaidFor;
      if (extra <= 0) continue;
      const pct = Math.round((extra * 100) / Math.max(1, sub.studentsPaidFor));
      out.push({ id: `over:${card.id}`, kind: "over", tone: "warn", title: `${card.name}: ${card.activeStudents.toLocaleString("en-IN")} active students, ${sub.studentsPaidFor.toLocaleString("en-IN")} paid for.`, detail: `${extra.toLocaleString("en-IN")} more than paid for (${pct}%). Top-up is half the yearly rate (${formatRupees(sub.pricePerStudentPaise / 2n)} each) for the rest of the year.`, action: "Make top-up invoice", needs: "topup", schoolId: card.id, schoolName: card.name, targetId: card.id });
    }

    const alert = await systemProblem(cards);
    if (alert) out.push({ id: "alert", kind: "alert", tone: "bad", title: alert.title, detail: alert.schools.join(", "), action: "Open System alerts", needs: null, schoolId: null, schoolName: null, targetId: null });

    const order: AttentionKind[] = ["alert", "grace", "expired", "never", "over", "stuck", "trial"];
    return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  });
}

type CardStats = { name: string; channelStats: unknown };
function stuckBy(cards: CardStats[], channel: string) {
  const hit = cards.filter((c) => ((c.channelStats as ChannelStats)?.[channel]?.stuck ?? 0) > 0);
  return { schools: hit.map((c) => c.name), waiting: hit.reduce((t, c) => t + ((c.channelStats as ChannelStats)[channel]?.stuck ?? 0), 0) };
}

async function systemProblem(cards: CardStats[]) {
  for (const ch of ["whatsapp", "sms"]) {
    const s = stuckBy(cards, ch);
    if (s.waiting > 0) return { title: `${ch === "sms" ? "SMS" : CHANNEL_LABEL[ch as ConsoleChannel]} messages not going out, ${plural(s.schools.length, "school")} affected.`, schools: s.schools, waiting: s.waiting, channel: ch };
  }
  return null;
}

export type Check = { key: string; label: string; ok: boolean; text: string };

/** The System alerts card: one line per part of the service. */
export async function systemChecks(now = new Date()) {
  const hourAgo = new Date(now.getTime() - 60 * 60_000);
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const [cards, errorsHour, errorSchools, backup, restore, lastRazorpay, consoleFails] = await Promise.all([
    withConsole((tx) => tx.consoleSchool.findMany({ where: { status: { not: "CLOSED" } }, select: { name: true, channelStats: true, jobsFailed: true, measuredAt: true } })),
    prisma.errorEvent.count({ where: { at: { gte: hourAgo } } }),
    prisma.errorEvent.findMany({ where: { at: { gte: hourAgo }, schoolCode: { not: null } }, distinct: ["schoolCode"], select: { schoolCode: true }, take: 5 }),
    prisma.backupRun.findFirst({ where: { kind: "nightly" }, orderBy: { finishedAt: "desc" } }),
    prisma.backupRun.findFirst({ where: { restoreTestedAt: { not: null } }, orderBy: { restoreTestedAt: "desc" } }),
    withConsole((tx) => tx.platformInvoice.findFirst({ where: { paidVia: "RAZORPAY" }, orderBy: { paidAt: "desc" }, select: { paidAt: true } })),
    withConsole((tx) => tx.consoleMessage.count({ where: { status: "FAILED", createdAt: { gte: dayAgo } } })),
  ]);
  const sum = (ch: string, k: "sentToday" | "stuck" | "failed") => cards.reduce((t, c) => t + ((c.channelStats as ChannelStats)?.[ch]?.[k] ?? 0), 0);
  const when = (d: Date) => (istDay(d).getTime() === istDay(now).getTime() ? `Today, ${formatTime(d)}` : formatDate(d));
  const checks: Check[] = [];
  checks.push(errorsHour === 0
    ? { key: "errors", label: "Errors", ok: true, text: "Normal · no errors in the last hour" }
    : { key: "errors", label: "Errors", ok: errorsHour < 20, text: `${plural(errorsHour, "error")} in the last hour${errorSchools.length ? ` · ${errorSchools.map((e) => e.schoolCode).join(", ")}` : ""}` });
  const consoleWhatsapp = await channelIsSetUp("whatsapp");
  for (const ch of ["whatsapp", "sms"] as const) {
    const stuck = sum(ch, "stuck");
    const sent = sum(ch, "sentToday");
    const failed = sum(ch, "failed");
    const label = ch === "sms" ? "SMS" : CHANNEL_LABEL[ch];
    checks.push(stuck > 0
      ? { key: ch, label, ok: false, text: `Not going out · ${stuck.toLocaleString("en-IN")} waiting` }
      : { key: ch, label, ok: true, text: `Working · ${sent.toLocaleString("en-IN")} sent today${failed ? `, ${failed.toLocaleString("en-IN")} failed` : ""}${ch === "whatsapp" && !consoleWhatsapp ? " · console messages in test mode" : ""}` });
  }
  checks.push(platformRazorpay()
    ? { key: "razorpay", label: "Razorpay payments", ok: true, text: lastRazorpay?.paidAt ? `Working · last payment ${when(lastRazorpay.paidAt)}` : "Working · no payment yet" }
    : { key: "razorpay", label: "Razorpay payments", ok: false, text: "Not set up · invoices go without a payment link" });
  const jobs = cards.reduce((t, c) => t + c.jobsFailed, 0);
  checks.push({ key: "jobs", label: "Background jobs", ok: jobs === 0 && consoleFails === 0, text: jobs === 0 ? `None failed in the last day${consoleFails ? ` · ${plural(consoleFails, "console message")} not sent` : ""}` : `${plural(jobs, "job")} failed in the last day` });
  const backupOk = Boolean(backup && backup.finishedAt > new Date(now.getTime() - 26 * 60 * 60_000));
  checks.push({ key: "backup", label: "Last backup", ok: backupOk, text: backup ? `${when(backup.finishedAt)} · nightly copy${backupOk ? "" : " · older than a day"}` : "No backup recorded yet" });
  const restoreOk = Boolean(restore?.restoreTestedAt && restore.restoreTestedAt > new Date(now.getTime() - 35 * 86_400_000));
  checks.push({ key: "restore", label: "Last restore test", ok: restoreOk, text: restore?.restoreTestedAt ? `${formatDate(restore.restoreTestedAt)} · ${restoreOk ? "passed" : "older than a month, test again"}` : "No restore test recorded yet" });
  const problem = await systemProblem(cards);
  return { checks, problem, measuredAt: cards.reduce<Date | null>((m, c) => (c.measuredAt && (!m || c.measuredAt < m) ? c.measuredAt : m), null) };
}

/** Counts for the Schools at a glance band. */
export async function glance(now = new Date()) {
  const today = istDay(now);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  return withConsole(async (tx) => {
    const [by, students, fresh, nextTrial, total] = await Promise.all([
      tx.consoleSchool.groupBy({ by: ["status"], _count: true }),
      tx.consoleSchool.aggregate({ where: { status: "ACTIVE" }, _sum: { activeStudents: true } }),
      tx.consoleSchool.count({ where: { createdAt: { gte: monthStart } } }),
      tx.consoleSchool.findFirst({ where: { status: "TRIAL", trialEndsOn: { not: null } }, orderBy: { trialEndsOn: "asc" }, select: { name: true, trialEndsOn: true } }),
      tx.consoleSchool.count(),
    ]);
    const n = (s: string) => by.find((b) => b.status === s)?._count ?? 0;
    return { trial: n("TRIAL"), active: n("ACTIVE"), suspended: n("SUSPENDED"), closed: n("CLOSED"), students: students._sum.activeStudents ?? 0, fresh, nextTrial, total };
  });
}
