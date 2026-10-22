// Fee Settings, "What a parent gets" (06 §6; gap list G11): the automatic fee
// reminder exactly as one real family would get it today, worked out by the
// same code that sends it (who is reminded, the template and channel, how to
// pay), with links shown as words. Also says plainly why nothing would go
// (reminders off, the rule off in Message Settings, the school still moving
// in, a closed day) and what is wrong with the words. Saves and sends nothing.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { formatDate, formatRupees } from "../format";
import { previewAutomatic, ruleReady, ruleStates } from "../messaging/automatic";
import { HELD_WORDS } from "../move-in/live";
import { messageSettings } from "../messaging/settings";
import { withHiddenLinks } from "../parent-link/token";
import { currentEnrolments } from "../academic/years";
import { openDues } from "./dues";
import { reminderRows, remindersDueOn } from "./reminders";
import { PAY_WAY_WORDS, payPlan, type PayWay } from "./reminder-pay";
import { feeSettings, gatewayFor } from "./settings";

const ZERO = BigInt(0);
const CHANNEL_WORDS: Record<string, string> = { whatsapp: "WhatsApp", sms: "SMS", email: "Email" };

export type ReminderSettingsPreview = {
  /** Why no automatic reminder goes now, if so, in plain words. Empty when they go. */
  stops: string[];
  /** Today: families who get one, and those left out and why. */
  today: { quiet: boolean; families: number; left: { promise: number; waiting: number; belowMin: number; done: number } };
  /** One real family's message, or null when nobody owes anything. */
  sample: null | { parent: string; students: string[]; channel: string; text: string; way: string; dueWords: string };
  /** Problems with the words or the channel the school should fix. */
  warnings: string[];
  /** How payment works for the school as a whole. */
  online: string;
};

/** The families to show: today's, else anyone who owes something now (a few, to find one the message reaches). */
async function sampleFamilies(tx: Tx, today: Date, todays: string[]) {
  const ids = todays.length ? todays.slice(0, 10) : [...new Set((await tx.studentFeeDue.findMany({
    where: { state: "OPEN", balancePaise: { gt: 0 }, kind: { in: ["FEE", "CHARGE", "LATE_FEE"] } }, select: { studentId: true }, orderBy: [{ dueDate: "asc" }], take: 40,
  })).map((r) => r.studentId))].slice(0, 10);
  const enrol = await currentEnrolments(tx, ids);
  const out = [];
  for (const id of ids) {
    const r = reminderRows(await openDues(tx, id), today);
    if (r && r.due > ZERO) out.push({ studentId: id, due: r.due, dueDate: r.dueDate, dueIds: r.rows.map((x) => x.id), classId: enrol.get(id)?.classId ?? null });
  }
  return out;
}

export async function reminderSettingsPreview(tx: Tx, ctx: SchoolContext, today: Date): Promise<ReminderSettingsPreview> {
  const s = await feeSettings(tx, ctx);
  const rule = await ruleReady(tx, ctx, "fee-due");
  const stops: string[] = [];
  if (!s.remindersOn) stops.push("Reminders are off. They go only when someone sends them from Defaulters.");
  if (!rule.on) stops.push("The “Fee reminder” message is switched off in Message Settings, so nothing goes by itself.");
  if (rule.held) stops.push(HELD_WORDS);
  else if (rule.on && !rule.ready) stops.push("No channel can carry the “Fee reminder” now: switch on WhatsApp or SMS in Settings, SMS, WhatsApp & Email, and check its templates in Message Settings.");

  const day = await remindersDueOn(tx, ctx, s, today);
  const families = await sampleFamilies(tx, today, day.out.map((x) => x.studentId));
  const allGuardians = (await ruleStates(tx, ctx)).find((r) => r.key === "fee-due")?.sendTo === "all";
  const gateway = await gatewayFor(tx, ctx, null);
  const linkOn = (await messageSettings(tx, ctx)).parentLink.on;
  const online = gateway
    ? `Online payment is set up (${gateway.displayName}). Parents with a Parent Link pay there${linkOn ? "" : " (Parent Link is off now)"}; others get a payment link that works for 7 days.`
    : "Online payment is not set up, so reminders say to pay at the school office. Connect Razorpay in Settings, Payment Gateways.";

  const warnings: string[] = [];
  let sample: ReminderSettingsPreview["sample"] = null;
  if (families.length) {
    const pay = await payPlan(tx, ctx, families, { online: true, makeLinks: false, allGuardians });
    const plan = await previewAutomatic(tx, ctx, {
      rule: "fee-due",
      event: { key: `fee-due:preview`, label: "Fee reminder preview" },
      to: { guardiansOf: families.map((x) => x.studentId) },
      perStudent: Object.fromEntries(families.map((x) => [x.studentId, { due_amount: formatRupees(x.due), due_date: formatDate(x.dueDate), ...pay.perStudent[x.studentId] }])),
      perGuardianStudent: pay.perGuardianStudent,
    });
    if (plan.problems.length) warnings.push(plan.problems[0]);
    const order = new Map(families.map((x, i) => [x.studentId, i]));
    const row = [...plan.rows].sort((a, b) => (order.get(a.studentId ?? "") ?? 99) - (order.get(b.studentId ?? "") ?? 99))[0];
    if (row) {
      const studentId = row.studentId ?? row.students?.[0]?.id ?? "";
      const fam = families.find((x) => x.studentId === studentId);
      const way: PayWay = pay.guardianWays.get(`${row.candidate.id}:${studentId}`) ?? pay.ways.get(studentId) ?? "counter";
      sample = {
        parent: row.candidate.name,
        students: (row.students ?? []).map((x) => x.name),
        channel: CHANNEL_WORDS[row.channel] ?? row.channel,
        text: withHiddenLinks(row.text),
        way: PAY_WAY_WORDS[way],
        dueWords: fam ? `${formatRupees(fam.due)}, ${fam.dueDate < today ? `overdue since ${formatDate(fam.dueDate)}` : `due on ${formatDate(fam.dueDate)}`}` : "",
      };
      if (row.version && !row.version.variables.includes("how_to_pay") && !row.version.variables.includes("link")) {
        warnings.push(`The “Fee reminder” ${sample.channel} template has no {how_to_pay}, so parents are not told how to pay. Add {how_to_pay} to it in Message Templates.`);
      }
      if (row.channel !== s.reminderChannel) {
        warnings.push(`${CHANNEL_WORDS[s.reminderChannel] ?? s.reminderChannel} cannot carry it to this parent now, so it goes by ${sample.channel}.`);
      }
    } else if (plan.notSent?.length) {
      warnings.push(`Not sent to ${plan.notSent[0].candidate.name}: ${plan.notSent[0].reason}`);
    }
  }
  return { stops, today: { quiet: day.quiet, families: day.out.length, left: day.left }, sample, warnings, online };
}
