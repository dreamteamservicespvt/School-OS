// Messages Student Management sends to parents, through Communication's
// messaging API (docs/BUILDING.md §5), in the caller's transaction.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { formatDate } from "../format";
import type { Channel } from "../messaging/channels";
import { MessagingProblem, sendMessage, skippedWords } from "../messaging/send";
import { ensureReadyTemplates, templateByKey } from "../messaging/templates";

export const BEHAVIOUR_TEMPLATE = "behaviour-note";

export type ParentMessage = { sent: boolean; people: number; note: string | null; messageId: string | null };

/**
 * "Inform parent" on a behaviour record: the primary contact of each student
 * gets the school's "Behaviour note" template (what happened stays in the
 * school's record: the message names only the type and the date, because one
 * record can be about several children). WhatsApp when it can carry it (on
 * a real WhatsApp account, once WhatsApp approved the template), else SMS with
 * a DLT template ID. The same record never sends twice.
 */
export async function tellParentsAboutIncident(
  tx: Tx,
  ctx: SchoolContext,
  incident: { id: string; studentIds: string[]; typeLabel: string; date: Date },
): Promise<ParentMessage> {
  await ensureReadyTemplates(tx, ctx);
  const templates: Partial<Record<Channel, string>> = {};
  for (const ch of ["whatsapp", "sms"] as const) {
    const t = await templateByKey(tx, ctx, BEHAVIOUR_TEMPLATE, ch);
    if (t) templates[ch] = t.id;
  }
  const date = formatDate(incident.date, "UTC");
  try {
    const r = await sendMessage(tx, ctx, {
      to: { guardiansOf: incident.studentIds },
      // Each parent on the first of WhatsApp and SMS that can carry it.
      channels: [],
      fallback: ["whatsapp", "sms"],
      templates,
      perStudent: Object.fromEntries(incident.studentIds.map((id) => [id, { title: incident.typeLabel, date }])),
      trigger: `Behaviour record: ${incident.typeLabel}`,
      source: { type: "Behaviour Incident", id: incident.id },
      idempotencyKey: `behaviour:${incident.id}`,
    });
    return { sent: true, people: r.people, note: r.skipped.length ? `Not told: ${skippedWords(r.skipped)}.` : null, messageId: r.messageId };
  } catch (e) {
    if (e instanceof MessagingProblem) return { sent: false, people: 0, note: `The parent was not told: ${e.message}`, messageId: null };
    throw e;
  }
}
