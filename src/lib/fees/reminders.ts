// Fee reminders (06 §2 Defaulters, A7): sent to one, selected or everyone on
// a list in one go, with a preview of the count and credit cost first (P4).
// Messages go through Communication (src/lib/messaging): opted-out parents,
// missing numbers, templates, languages, credits and SMS backup are handled
// there. Each reminder is also logged here, against the student, so the
// Defaulters list can show reminder history and the "once per installment per
// scheduled day" rule holds.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate, formatRupees } from "../format";
import { addDays } from "../staff/dates";
import { currentEnrolments } from "../academic/years";
import { appUrl } from "../parent-link/token";
import { MoneyProblem } from "./problem";
import { openDues } from "./dues";
import { feeSettings, gatewayFor } from "./settings";
import { feeMessageInput, planMessage, sendAutomatic, sendMessage } from "./notify-parents";
import { createPaymentLink, payPath } from "./online";
import { pausedByPromise } from "./promises";
import { REMINDER_CHANNELS, TEMPLATE_VARIABLES } from "./words";

const ZERO = BigInt(0);
type ReminderChannel = (typeof REMINDER_CHANNELS)[number]["value"];

export function fillTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{([a-z_]+)\}/g, (m, k: string) => (k in values ? values[k] : m));
}

export function checkTemplate(template: string) {
  const t = template.trim();
  if (t.length < 20) throw new MoneyProblem("The message is too short. Say what is due and when.", "text");
  if (t.length > 900) throw new MoneyProblem("The message can be at most 900 characters.", "text");
  const unknown = [...t.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]).filter((k) => !(TEMPLATE_VARIABLES as readonly string[]).includes(k));
  if (unknown.length) throw new MoneyProblem(`{${unknown[0]}} is not a blank you can use. Use ${TEMPLATE_VARIABLES.map((v) => `{${v}}`).join(", ")}.`, "text");
  return t;
}

export function isReminderChannel(v: string): v is ReminderChannel {
  return REMINDER_CHANNELS.some((c) => c.value === v);
}

/** The fee templates a person can pick for a channel (Communication, Templates, category Fees). */
export async function feeTemplates(tx: Tx, ctx: SchoolContext, channel: ReminderChannel) {
  return tx.template.findMany({
    where: { schoolId: ctx.schoolId, channel, category: "fees", archivedAt: null },
    orderBy: [{ key: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, key: true },
  });
}

export type ReminderInput = {
  studentIds: string[];
  channel: string;
  /** A Communication template (fees category). Required for SMS. */
  templateId: string | null;
  /** Own wording, for WhatsApp and email only. */
  text: string | null;
  includeLink: boolean;
  scheduledAt?: Date | null;
  /** The school's today: what is overdue is worked out from it, as on Defaulters. */
  today: Date;
};

type Planned = { studentId: string; due: bigint; dueDate: Date; dueIds: string[]; classId: string | null };

type OpenRow = { id: string; dueDate: Date; balancePaise: bigint };

/**
 * What one reminder is about, so the amount and the date in the message are
 * about the same rows: everything overdue (as on Defaulters: due before today)
 * with the oldest overdue date; when nothing is overdue yet, the rows of the
 * next due date. Rows falling due later (a late fee due today, the next
 * installment) are not added to an overdue reminder.
 */
export function reminderRows<T extends OpenRow>(rows: T[], today: Date): { rows: T[]; due: bigint; dueDate: Date } | null {
  const open = rows.filter((r) => r.balancePaise > ZERO).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  if (!open.length) return null;
  const overdue = open.filter((r) => r.dueDate < today);
  const chosen = overdue.length ? overdue : open.filter((r) => r.dueDate.getTime() === open[0].dueDate.getTime());
  return { rows: chosen, due: chosen.reduce((s, r) => s + r.balancePaise, ZERO), dueDate: chosen[0].dueDate };
}

/** The students on the list who still owe something, with what the reminder is about. */
async function whoOwes(tx: Tx, studentIds: string[], today: Date) {
  const out: Planned[] = [];
  let nothing = 0;
  const unique = [...new Set(studentIds)];
  const enrolments = await currentEnrolments(tx, unique);
  for (const id of unique) {
    const r = reminderRows(await openDues(tx, id), today);
    if (!r || r.due <= ZERO) { nothing++; continue; }
    out.push({ studentId: id, due: r.due, dueDate: r.dueDate, dueIds: r.rows.map((d) => d.id), classId: enrolments.get(id)?.classId ?? null });
  }
  return { out, nothing };
}

async function checkInput(tx: Tx, ctx: SchoolContext, input: ReminderInput) {
  if (!input.studentIds.length) throw new MoneyProblem("Choose at least one student.", "studentIds");
  if (!isReminderChannel(input.channel)) throw new MoneyProblem("Choose WhatsApp, SMS or email.", "channel");
  const channel = input.channel;
  if (input.templateId) {
    const t = await tx.template.findFirst({ where: { id: input.templateId, schoolId: ctx.schoolId, channel, archivedAt: null } });
    if (!t) throw new MoneyProblem("That template is not available for this channel. Choose another.", "templateId");
    return { channel, templateId: t.id, text: null as string | null };
  }
  if (channel === "sms") throw new MoneyProblem("SMS can only use an approved template. Choose one.", "templateId");
  return { channel, templateId: null, text: checkTemplate(input.text ?? "") };
}

function valuesFor(r: Planned, link: string) {
  return { due_amount: formatRupees(r.due), due_date: formatDate(r.dueDate), link };
}

export type ReminderPreview = {
  recipients: number;
  skipped: { reason: string; count: number; names: string[] }[];
  skippedNothingDue: number;
  cost: number;
  creditProblem: string | null;
  problems: string[];
  sample: string | null;
  linkAvailable: boolean;
};

/** P4 preview: how many get it, how many are skipped and why, and the credit cost. Saves nothing. */
export async function previewReminders(tx: Tx, ctx: SchoolContext, input: ReminderInput): Promise<ReminderPreview> {
  const c = await checkInput(tx, ctx, input);
  const p = await whoOwes(tx, input.studentIds, input.today);
  const linkAvailable = p.out.length > 0 && Boolean(await gatewayFor(tx, ctx, p.out[0].classId));
  if (!p.out.length) return { recipients: 0, skipped: [], skippedNothingDue: p.nothing, cost: 0, creditProblem: null, problems: [], sample: null, linkAvailable };
  const link = input.includeLink && linkAvailable ? `${appUrl()}/pay/…` : "the school office";
  const plan = await planMessage(tx, ctx, feeMessageInput({
    studentIds: p.out.map((r) => r.studentId), channel: c.channel, templateId: c.templateId, text: c.text,
    perStudent: Object.fromEntries(p.out.map((r) => [r.studentId, valuesFor(r, link)])), trigger: "Fee reminder", scheduledAt: input.scheduledAt ?? null,
  }));
  return {
    recipients: plan.people,
    skipped: plan.skipped.map((s) => ({ reason: s.reason, count: s.count, names: s.names })),
    skippedNothingDue: p.nothing,
    cost: plan.cost[c.channel] ?? 0,
    creditProblem: plan.creditProblem,
    problems: plan.problems,
    sample: plan.rows[0]?.text ?? null,
    linkAvailable,
  };
}

/** Sends the reminders now (or at the chosen time). Each student's reminder is logged in their reminder history. */
export async function sendReminders(tx: Tx, ctx: SchoolContext, input: ReminderInput) {
  const c = await checkInput(tx, ctx, input);
  const p = await whoOwes(tx, input.studentIds, input.today);
  if (!p.out.length) throw new MoneyProblem("None of these students owe anything now. Nothing was sent.");
  const links = new Map<string, string>();
  for (const r of p.out) {
    let link = "the school office";
    if (input.includeLink && (await gatewayFor(tx, ctx, r.classId))) {
      const made = await createPaymentLink(tx, ctx, { studentId: r.studentId, dueIds: r.dueIds, source: "LINK", channel: c.channel });
      link = `${appUrl()}${payPath(ctx.schoolId, made.token)}`;
    }
    links.set(r.studentId, link);
  }
  const send = feeMessageInput({
    studentIds: p.out.map((r) => r.studentId), channel: c.channel, templateId: c.templateId, text: c.text,
    perStudent: Object.fromEntries(p.out.map((r) => [r.studentId, valuesFor(r, links.get(r.studentId)!)])),
    trigger: "Fee reminder", scheduledAt: input.scheduledAt ?? null,
  });
  const plan = await planMessage(tx, ctx, send);
  if (plan.problems.length) throw new MoneyProblem(plan.problems[0]);
  if (plan.creditProblem) throw new MoneyProblem(plan.creditProblem);
  if (!plan.rows.length) throw new MoneyProblem(`Nobody can get this message: ${plan.skipped.map((s) => `${s.count} ${s.reason.toLowerCase()}`).join(", ")}.`);
  const result = await sendMessage(tx, ctx, send);
  const reached = new Set(plan.rows.map((r) => r.studentId));
  for (const r of p.out) {
    const row = plan.rows.find((x) => x.studentId === r.studentId);
    await tx.feeReminder.create({
      data: {
        schoolId: ctx.schoolId, studentId: r.studentId, dueId: r.dueIds[0] ?? null, channel: c.channel, template: c.templateId ? "template" : "own wording",
        text: row?.text ?? "Not sent", phone: row?.address ?? null, amountPaise: r.due,
        status: !reached.has(r.studentId) ? "skipped" : result.scheduled ? "scheduled" : "queued",
        automatic: false, messageId: reached.has(r.studentId) ? result.messageId : null, sentById: ctx.userId,
      },
    });
  }
  const skipped = plan.skipped.reduce((s, g) => s + g.count, 0);
  await writeAudit(tx, ctx, { action: "sent-reminders", recordType: "Fee Reminder", recordId: null, after: { students: reached.size, people: plan.people, skipped, channel: c.channel, scheduledAt: input.scheduledAt?.toISOString() ?? null } });
  return { sent: plan.people, students: reached.size, skipped: plan.skipped, skippedNothingDue: p.nothing, scheduled: result.scheduled, messageId: result.messageId };
}

/**
 * A7: the scheduled reminders for today. For each day in Fee Settings (for
 * example 3 days before, on the day, 7 days after) the parents of students
 * with an unpaid row due on that day get one reminder, only once. The rule's
 * on/off switch, channels and template are in Communication, Message Settings
 * (rule "Fee reminder"). A family with an open Promise to Pay dated today or
 * later is skipped: their reminders pause until the promised date.
 */
export async function automaticReminders(tx: Tx, ctx: SchoolContext, today: Date) {
  const s = await feeSettings(tx, ctx);
  if (!s.remindersOn) return { sent: 0 };
  let sent = 0;
  for (const offset of s.reminderDays) {
    const dueDate = addDays(today, -offset);
    const day = dueDate.toISOString().slice(0, 10);
    const rows = await tx.studentFeeDue.findMany({ where: { state: "OPEN", balancePaise: { gt: 0 }, kind: { in: ["FEE", "CHARGE", "LATE_FEE"] }, dueDate }, select: { studentId: true } });
    let studentIds = [...new Set(rows.map((r) => r.studentId))];
    const onceKey = (id: string) => `auto:${id}:${day}:${offset}`;
    const done = new Set((await tx.feeReminder.findMany({ where: { onceKey: { in: studentIds.map(onceKey) } }, select: { onceKey: true } })).map((r) => r.onceKey));
    studentIds = studentIds.filter((id) => !done.has(onceKey(id)));
    const paused = await pausedByPromise(tx, ctx, studentIds, today);
    studentIds = studentIds.filter((id) => !paused.has(id));
    if (!studentIds.length) continue;
    const p = await whoOwes(tx, studentIds, today);
    if (!p.out.length) continue;
    const r = await sendAutomatic(tx, ctx, {
      rule: "fee-due",
      event: { key: `fee-due:${day}:${offset}`, label: `Fee due on ${formatDate(dueDate)}` },
      to: { guardiansOf: p.out.map((x) => x.studentId) },
      perStudent: Object.fromEntries(p.out.map((x) => [x.studentId, valuesFor(x, "your Parent Link")])),
      source: null,
    });
    if (r.status === "off" || r.status === "no-channel") return { sent, status: r.status };
    if (r.status !== "sent") continue;
    sent += r.result.people;
    await tx.feeReminder.createMany({
      data: p.out.map((x) => ({
        schoolId: ctx.schoolId, studentId: x.studentId, dueId: x.dueIds[0] ?? null, onceKey: onceKey(x.studentId), channel: "automatic", template: "fee-due",
        text: `Fee reminder for ${formatRupees(x.due)} due on ${formatDate(x.dueDate)}`, amountPaise: x.due, status: "queued", automatic: true, messageId: r.result.messageId,
      })),
      skipDuplicates: true,
    });
  }
  return { sent };
}

const RECIPIENT_STATUS: Record<string, string> = { QUEUED: "Waiting", SENDING: "Sending", SENT: "Sent", DELIVERED: "Delivered", READ: "Read", FAILED: "Failed" };

/** One student's reminder history: date, channel, template and delivery status (from Communication). */
export async function reminderHistory(tx: Tx, studentId: string) {
  const rows = await tx.feeReminder.findMany({ where: { studentId }, orderBy: { sentAt: "desc" }, take: 50 });
  const ids = rows.map((r) => r.messageId).filter((x): x is string => Boolean(x));
  const recipients = ids.length ? await tx.messageRecipient.findMany({ where: { messageId: { in: ids }, studentId }, select: { messageId: true, status: true, channel: true } }) : [];
  return rows.map((r) => {
    const mine = recipients.filter((x) => x.messageId === r.messageId);
    const status = !r.messageId ? (r.status === "skipped" ? "Skipped" : "Not sent") : mine.length ? [...new Set(mine.map((m) => RECIPIENT_STATUS[m.status] ?? m.status))].join(", ") : r.status === "scheduled" ? "Scheduled" : "Waiting";
    return { ...r, deliveryStatus: status, channels: [...new Set(mine.map((m) => m.channel))] };
  });
}
