// A message to chosen staff from the Staff List (09-staff-hr-management.md,
// bulk actions). Staff with a login get it in School OS (Notifications);
// WhatsApp and SMS copies to their phones go through Communication's
// messaging API (docs/BUILDING.md §5), in the same transaction.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { channelSetups, CHANNEL_LABEL } from "../messaging/channels";
import { MessagingProblem, sendMessage, skippedWords, type SendResult } from "../messaging/send";
import { ensureReadyTemplates, templateByKey } from "../messaging/templates";

export const STAFF_MESSAGE_TEMPLATE = "staff-message";
export type CopyChannel = "whatsapp" | "sms";
export const COPY_CHANNELS: CopyChannel[] = ["whatsapp", "sms"];

export class StaffMessageProblem extends Error {
  constructor(message: string, public field?: string) {
    super(message);
  }
}

/** The phone channels the school has switched on, for the "Also send by" choice. */
export async function copyChannelsOn(tx: Tx, ctx: SchoolContext): Promise<CopyChannel[]> {
  const setups = await channelSetups(tx, ctx);
  return COPY_CHANNELS.filter((c) => setups[c].isOn);
}

export type StaffMessageResult = { staff: number; inApp: number; noLogin: number; channels: CopyChannel[]; copies: SendResult | null };

export async function messageStaff(
  tx: Tx,
  ctx: SchoolContext,
  input: { staffIds: string[]; text: string; channels: CopyChannel[]; senderName: string; key: string; campusId?: string | null },
): Promise<StaffMessageResult> {
  // One campus (src/lib/campus.ts): only that campus's staff are found.
  const staff = await tx.staff.findMany({ where: { schoolId: ctx.schoolId, id: { in: input.staffIds }, archivedAt: null, ...(input.campusId ? { campusId: input.campusId } : {}) }, select: { id: true, userLoginId: true } });
  if (!staff.length) throw new StaffMessageProblem("None of the chosen staff were found. Reload the page and choose again.");

  let copies: SendResult | null = null;
  const channels = [...new Set(input.channels)].filter((c) => COPY_CHANNELS.includes(c));
  if (channels.length) {
    await ensureReadyTemplates(tx, ctx);
    const on = await copyChannelsOn(tx, ctx);
    const off = channels.find((c) => !on.includes(c));
    if (off) throw new StaffMessageProblem(`${CHANNEL_LABEL[off]} is switched off. Switch it on in Settings, SMS, WhatsApp & Email, or untick it.`, "channels");
    const templates: Partial<Record<CopyChannel, string>> = {};
    for (const c of channels) {
      const t = await templateByKey(tx, ctx, STAFF_MESSAGE_TEMPLATE, c);
      if (t) templates[c] = t.id;
    }
    if (channels.includes("sms") && !templates.sms) throw new StaffMessageProblem("An SMS can only be sent from a template. Add a \"Message to staff (SMS)\" template in Communication, Message Templates.", "channels");
    try {
      copies = await sendMessage(tx, ctx, {
        to: { staffIds: staff.map((s) => s.id) },
        channels,
        templates,
        values: { message: input.text },
        title: `Message from ${input.senderName}`,
        trigger: "Staff List, Send message",
        audienceLabel: `${staff.length} staff member${staff.length === 1 ? "" : "s"} (Staff & HR)`,
        idempotencyKey: `staff-message:${input.key}`,
      });
    } catch (e) {
      if (e instanceof MessagingProblem) throw new StaffMessageProblem(e.message, "channels");
      throw e;
    }
  }

  let inApp = 0;
  for (const s of staff) {
    if (!s.userLoginId) continue;
    await notify(tx, ctx, { to: s.userLoginId, type: "staff-message", text: `${input.senderName}: ${input.text}`, link: `/staff-hr-management/${s.id}` });
    inApp++;
  }
  await writeAudit(tx, ctx, {
    action: "messaged",
    recordType: "Staff",
    recordId: null,
    after: { staff: staff.length, inApp, channels, message: copies?.messageId ?? null, text: input.text },
  });
  return { staff: staff.length, inApp, noLogin: staff.length - inApp, channels, copies };
}

/** "Message sent to 12 staff in School OS; 10 by WhatsApp. 2 skipped: no mobile number." */
export function staffMessageWords(r: StaffMessageResult): string {
  const parts = [`Message sent to ${r.inApp} staff in School OS${r.noLogin && !r.copies ? `, ${r.noLogin} skipped: no login yet` : ""}`];
  if (r.copies) {
    parts.push(`${r.copies.people} by ${r.channels.map((c) => CHANNEL_LABEL[c]).join(" and ")}`);
    if (r.copies.skipped.length) parts.push(`not by phone: ${skippedWords(r.copies.skipped)}`);
  }
  return `${parts.join("; ")}.`;
}
