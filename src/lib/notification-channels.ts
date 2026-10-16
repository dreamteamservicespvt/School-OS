// Copies of a staff notification on the extra channels the person chose in
// My profile (UserLogin.notificationPrefs: { [kind]: ["app", "whatsapp", "sms", "email"] },
// 00-global.md §4 rule 6), sent through Communication's messaging API
// (docs/BUILDING.md §5). A channel is used only when the school has it
// switched on; WhatsApp and SMS go from the "Message to staff" template of
// that channel (an SMS template needs its DLT template ID, rule 34).
// Nothing here ever stops the change that caused the notification: when a
// copy cannot go (no credits, no number, no template) it is simply not sent.
import "server-only";

import type { SchoolContext, Tx } from "./db";

export const COPY_CHANNELS = ["whatsapp", "sms", "email"] as const;
export type NotificationCopyChannel = (typeof COPY_CHANNELS)[number];

/** The extra channels one person chose for one kind of notification. */
export function chosenCopyChannels(prefs: unknown, kind: string): NotificationCopyChannel[] {
  if (!prefs || typeof prefs !== "object") return [];
  const list = (prefs as Record<string, unknown>)[kind];
  if (!Array.isArray(list)) return [];
  return COPY_CHANNELS.filter((c) => list.includes(c));
}

export async function sendNotificationCopies(
  tx: Tx,
  ctx: SchoolContext,
  n: { id: string; userLoginId: string; type: string; text: string },
): Promise<{ messageId: string | null; channels: NotificationCopyChannel[] } | null> {
  const login = await tx.userLogin.findUnique({ where: { id: n.userLoginId }, select: { notificationPrefs: true, displayName: true } });
  const chosen = chosenCopyChannels(login?.notificationPrefs, n.type);
  if (!login || !chosen.length) return null;
  // Loaded here so the messaging code (which itself notifies staff) is not a static import cycle.
  const [{ channelSetups }, { MessagingProblem, sendMessage }, { ensureReadyTemplates, templateByKey }] = await Promise.all([
    import("./messaging/channels"),
    import("./messaging/send"),
    import("./messaging/templates"),
  ]);
  const setups = await channelSetups(tx, ctx);
  const on = chosen.filter((c) => setups[c].isOn);
  if (!on.length) return null;
  await ensureReadyTemplates(tx, ctx);
  const templates: Partial<Record<NotificationCopyChannel, string>> = {};
  for (const c of on) {
    if (c === "email") continue;
    const t = await templateByKey(tx, ctx, "staff-message", c);
    if (t) templates[c] = t.id;
  }
  const channels = on.filter((c) => c === "email" || templates[c]);
  if (channels.includes("sms")) {
    const dlt = await tx.templateVersion.count({ where: { schoolId: ctx.schoolId, templateId: templates.sms!, isCurrent: true, dltTemplateId: { not: null } } });
    if (!dlt) channels.splice(channels.indexOf("sms"), 1);
  }
  if (!channels.length) return null;
  try {
    const r = await sendMessage(tx, ctx, {
      to: { loginIds: [n.userLoginId] },
      channels,
      templates,
      values: { message: n.text, staff_name: login.displayName },
      text: n.text,
      title: "School OS notification",
      single: true,
      trigger: `Notification: ${n.type}`,
      source: { type: "Notification", id: n.id },
      audienceLabel: `${login.displayName} (notification copy)`,
      idempotencyKey: `notification:${n.id}`,
      onNoCredits: "fail",
    });
    return { messageId: r.messageId ?? null, channels };
  } catch (e) {
    if (e instanceof MessagingProblem) return null;
    throw e;
  }
}
