// Fee reminders (06 §2 Defaulters, A7): sent to one, selected or everyone on
// a list in one go, with a preview of the count and credit cost first (P4).
// Parents who opted out are skipped and counted. Automatic reminders go on
// the days set in Fee Settings, once per installment per scheduled day.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate, formatRupees } from "../format";
import { addDays } from "../staff/dates";
import { MoneyProblem } from "./problem";
import { openDues, studentCard } from "./dues";
import { feeSettings, gatewayFor } from "./settings";
import { creditsLeft, creditsPerMessage, sendParentMessage } from "./notify-parents";
import { createPaymentLink, payPath } from "./online";
import { TEMPLATE_VARIABLES } from "./words";

const ZERO = BigInt(0);

export function fillTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{([a-z_]+)\}/g, (m, k: string) => (k in values ? values[k] : m));
}

export function checkTemplate(template: string) {
  const t = template.trim();
  if (t.length < 20) throw new MoneyProblem("The message is too short. Say what is due and when.", "template");
  if (t.length > 900) throw new MoneyProblem("The message can be at most 900 characters.", "template");
  const unknown = [...t.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]).filter((k) => !(TEMPLATE_VARIABLES as readonly string[]).includes(k));
  if (unknown.length) throw new MoneyProblem(`{${unknown[0]}} is not a variable. Use ${TEMPLATE_VARIABLES.map((v) => `{${v}}`).join(", ")}.`, "template");
  return t;
}

export type ReminderPreview = {
  recipients: number;
  skippedOptedOut: number;
  skippedNoPhone: number;
  skippedNothingDue: number;
  creditsNeeded: number;
  creditsLeft: number;
  enough: boolean;
  sample: string | null;
  linkAvailable: boolean;
};

async function plan(tx: Tx, ctx: SchoolContext, studentIds: string[]) {
  const out: { studentId: string; card: NonNullable<Awaited<ReturnType<typeof studentCard>>>; due: bigint; dueDate: Date; dueIds: string[] }[] = [];
  let optedOut = 0, noPhone = 0, nothing = 0;
  for (const id of studentIds) {
    const card = await studentCard(tx, ctx, id);
    if (!card) continue;
    const dues = await openDues(tx, id);
    const due = dues.reduce((s, d) => s + d.balancePaise, ZERO);
    if (due <= ZERO) { nothing++; continue; }
    const g = card.primaryGuardian;
    if (!g || !g.phone) { noPhone++; continue; }
    if (g.optedOut) { optedOut++; continue; }
    out.push({ studentId: id, card, due, dueDate: dues[0].dueDate, dueIds: dues.map((d) => d.id) });
  }
  return { out, optedOut, noPhone, nothing };
}

/** P4 preview: how many get it, how many are skipped and why, and the credit cost. */
export async function previewReminders(tx: Tx, ctx: SchoolContext, input: { studentIds: string[]; channel: string; template: string; includeLink: boolean }): Promise<ReminderPreview> {
  if (!input.studentIds.length) throw new MoneyProblem("Choose at least one student.", "studentIds");
  const p = await plan(tx, ctx, input.studentIds);
  const left = await creditsLeft(tx, ctx, input.channel);
  const needed = p.out.length * creditsPerMessage(input.channel);
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { name: true } });
  const first = p.out[0];
  const gateway = await gatewayFor(tx, ctx, first?.card.classId ?? null);
  return {
    recipients: p.out.length,
    skippedOptedOut: p.optedOut,
    skippedNoPhone: p.noPhone,
    skippedNothingDue: p.nothing,
    creditsNeeded: needed,
    creditsLeft: Number.isFinite(left) ? left : -1,
    enough: needed <= left,
    sample: first ? fillTemplate(input.template, { student_name: first.card.name, class: first.card.classSection, due_amount: formatRupees(first.due), due_date: formatDate(first.dueDate), link: input.includeLink && gateway ? "(payment link)" : "the school office", school_name: school.name }) : null,
    linkAvailable: Boolean(gateway),
  };
}

/** Sends the reminders now. Each is logged in the student's reminder history. */
export async function sendReminders(tx: Tx, ctx: SchoolContext, input: { studentIds: string[]; channel: string; template: string; includeLink: boolean; origin: string; automatic?: boolean; onceKeyFor?: (studentId: string) => string | null }) {
  const template = checkTemplate(input.template);
  const p = await plan(tx, ctx, input.studentIds);
  const left = await creditsLeft(tx, ctx, input.channel);
  const needed = p.out.length * creditsPerMessage(input.channel);
  if (needed > left) throw new MoneyProblem(`These reminders need ${needed} ${input.channel === "sms" ? "SMS" : "WhatsApp"} credits and ${left} are left. Buy credits in Settings, SMS, WhatsApp & Email, or send to fewer parents.`);
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { name: true } });
  let sent = 0;
  for (const r of p.out) {
    const onceKey = input.onceKeyFor?.(r.studentId) ?? null;
    if (onceKey && (await tx.feeReminder.findUnique({ where: { schoolId_onceKey: { schoolId: ctx.schoolId, onceKey } } }))) continue;
    let link = "the school office";
    if (input.includeLink && (await gatewayFor(tx, ctx, r.card.classId))) {
      const made = await createPaymentLink(tx, ctx, { studentId: r.studentId, dueIds: r.dueIds, source: "LINK", channel: input.channel });
      link = `${input.origin}${payPath(ctx.schoolId, made.token)}`;
    }
    const text = fillTemplate(template, { student_name: r.card.name, class: r.card.classSection, due_amount: formatRupees(r.due), due_date: formatDate(r.dueDate), link, school_name: school.name });
    const g = r.card.primaryGuardian!;
    const result = await sendParentMessage(tx, ctx, { guardianId: g.id, phone: g.phone, optedOut: g.optedOut, channel: input.channel, template: "fee-reminder", text, onceKey: onceKey ?? `fee-reminder:${r.studentId}:${Date.now()}` });
    await tx.feeReminder.create({
      data: { schoolId: ctx.schoolId, studentId: r.studentId, dueId: r.dueIds[0] ?? null, onceKey, channel: input.channel, template: "fee-reminder", text, phone: g.phone, amountPaise: r.due, status: result.status, automatic: Boolean(input.automatic), sentById: ctx.userId },
    });
    if (result.status === "queued") sent++;
  }
  if (!input.automatic) await writeAudit(tx, ctx, { action: "sent-reminders", recordType: "Fee Reminder", recordId: null, after: { sent, skippedOptedOut: p.optedOut, skippedNoPhone: p.noPhone, channel: input.channel } });
  return { sent, skippedOptedOut: p.optedOut, skippedNoPhone: p.noPhone, skippedNothingDue: p.nothing };
}

/**
 * A7: the scheduled reminders for today. For each day in Fee Settings (for
 * example 3 days before, on the day, 7 days after) the parents of students
 * with an unpaid row due on that day get one reminder, only once.
 */
export async function automaticReminders(tx: Tx, ctx: SchoolContext, today: Date, origin: string) {
  const s = await feeSettings(tx, ctx);
  if (!s.remindersOn) return { sent: 0 };
  let sent = 0;
  for (const offset of s.reminderDays) {
    const dueDate = addDays(today, -offset);
    const rows = await tx.studentFeeDue.findMany({ where: { state: "OPEN", balancePaise: { gt: 0 }, kind: { in: ["FEE", "CHARGE"] }, dueDate }, select: { studentId: true } });
    const studentIds = [...new Set(rows.map((r) => r.studentId))];
    if (!studentIds.length) continue;
    const left = await creditsLeft(tx, ctx, s.reminderChannel);
    if (studentIds.length * creditsPerMessage(s.reminderChannel) > left) continue;
    const r = await sendReminders(tx, ctx, {
      studentIds,
      channel: s.reminderChannel,
      template: s.reminderTemplate,
      // A link needs the full address of School OS (APP_URL); without it the message says to pay at the office.
      includeLink: Boolean(origin),
      origin,
      automatic: true,
      onceKeyFor: (studentId) => `auto:${studentId}:${dueDate.toISOString().slice(0, 10)}:${offset}`,
    });
    sent += r.sent;
  }
  return { sent };
}

/** One student's reminder history: date, channel, template, delivery status. */
export async function reminderHistory(tx: Tx, studentId: string) {
  return tx.feeReminder.findMany({ where: { studentId }, orderBy: { sentAt: "desc" }, take: 50 });
}
