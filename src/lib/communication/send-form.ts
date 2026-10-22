// The Send Message form, read on the server (the browser checks the same
// things first). Shared by "Check and send" and "Send now".
import "server-only";

import { CHANNEL_LABEL, isChannel, type Channel } from "../messaging/channels";
import { RECIPIENT_KINDS, type AudienceRule, type RecipientKind } from "../messaging/recipients";
import { BACKUP_TYPES, type BackupType } from "../messaging/settings";
import { MAX_TEXT, type Plan, type SendInput } from "../messaging/send";
import { withHiddenLinks } from "../parent-link/token";
import { smsParts } from "../messaging/templates";
import { localToUtc } from "./time";

const ids = (form: FormData, key: string) => [...new Set(form.getAll(key).map(String).filter((v) => /^[0-9a-f-]{36}$/.test(v)))];
const keys = (form: FormData, key: string) => [...new Set(form.getAll(key).map(String).filter((v) => /^[a-z0-9-]{1,40}$/.test(v)))];

export type ReadSend = { ok: true; input: SendInput; errors: Record<string, string> } | { ok: false; errors: Record<string, string> };

/** The "who" part of the form; null when nobody is chosen. */
export function readAudienceForm(form: FormData): AudienceRule | null {
  const kinds = keys(form, "kinds").filter((k): k is RecipientKind => RECIPIENT_KINDS.some((r) => r.key === k));
  const to: AudienceRule = {
    kinds,
    classIds: ids(form, "classIds"),
    sectionIds: ids(form, "sectionIds"),
    roleKeys: keys(form, "roleKeys"),
    departmentIds: ids(form, "departmentIds"),
    groupId: ids(form, "groupId")[0],
    allGuardians: form.get("allGuardians") === "on",
    guardianIds: ids(form, "guardianIds"),
    studentIds: ids(form, "studentIds"),
    staffIds: ids(form, "staffIds"),
    guardiansOf: ids(form, "guardiansOf"),
  };
  if (!kinds.length && !to.groupId && !to.guardianIds!.length && !to.studentIds!.length && !to.staffIds!.length && !to.guardiansOf!.length) return null;
  return to;
}

export function readSendForm(form: FormData, timeZone: string, now = new Date()): ReadSend {
  const errors: Record<string, string> = {};
  const to = readAudienceForm(form) ?? { kinds: [] };
  if (!readAudienceForm(form)) errors.kinds = "Choose who gets the message.";
  const channels = form.getAll("channels").map(String).filter(isChannel);
  if (!channels.length) errors.channels = "Choose at least one channel.";
  const templates: Partial<Record<Channel, string | null>> = {};
  for (const ch of channels) {
    const t = String(form.get(`template_${ch}`) ?? "");
    templates[ch] = /^[0-9a-f-]{36}$/.test(t) ? t : null;
  }
  if (channels.includes("sms") && !templates.sms) errors.template_sms = "Choose an SMS template. An SMS can only be sent from a template with a DLT template ID.";
  const text = String(form.get("text") ?? "").trim();
  const title = String(form.get("title") ?? "").trim();
  if (text.length > MAX_TEXT) errors.text = `The message has ${text.length} characters. It can have at most ${MAX_TEXT}.`;
  if (title.length > 120) errors.title = "The title can be at most 120 characters.";
  for (const ch of channels) {
    if (ch !== "sms" && !templates[ch] && !text) errors.text = `Type the message, or choose a ${CHANNEL_LABEL[ch]} template.`;
  }
  if (channels.some((c) => (c === "app" || c === "email") && !templates[c]) && !title) errors.title = "Give the message a title. App notifications and emails show it first.";
  const typeRaw = String(form.get("messageType") ?? "general");
  const messageType = (BACKUP_TYPES as readonly string[]).includes(typeRaw) ? (typeRaw as BackupType) : "general";
  const smsBackup = form.get("smsBackup") === "on" && messageType !== "general";
  const backupTemplateId = ids(form, "backupTemplateId")[0] ?? null;
  let scheduledAt: Date | null = null;
  if (form.get("when") === "later") {
    scheduledAt = localToUtc(String(form.get("scheduledAt") ?? ""), timeZone);
    if (!scheduledAt) errors.scheduledAt = "Choose the date and time to send.";
    else if (scheduledAt.getTime() < now.getTime() + 60_000) errors.scheduledAt = "Choose a time at least a minute from now.";
    else if (scheduledAt.getTime() > now.getTime() + 90 * 86400_000) errors.scheduledAt = "Choose a time within the next 90 days.";
  }
  const emergency = form.get("emergency") === "on";
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    errors,
    input: { to, channels, templates, text: text || null, title: title || null, messageType, smsBackup, backupTemplateId, emergency, scheduledAt },
  };
}

export type PreviewRow = { name: string; description: string; channel: string; title: string | null; text: string; parts: number | null };
export type SendPreview = {
  people: number;
  messages: number;
  audienceLabel: string;
  /** test: the channel is in test mode, so these credits are not used (nothing is sent). */
  cost: { channel: string; credits: number; test?: boolean }[];
  backupCost: number;
  /** The SMS backup's credits are not used either when SMS is in test mode. */
  backupTest?: boolean;
  /** Channels in test mode this message would use, by name ("WhatsApp"): nobody receives what goes on them. */
  testMode: string[];
  balances: { whatsapp: number; sms: number };
  creditProblem: string | null;
  problems: string[];
  /** notSent: no channel can carry it to them (kept as Not sent if sent anyway). */
  skipped: { reason: string; count: number; names: string[]; notSent?: boolean }[];
  samples: PreviewRow[];
  scheduledAt: string | null;
  emergency: boolean;
  fingerprint: string;
};

/** What the sender sees before sending: count, cost, who is left out and a real preview. */
export function previewOf(plan: Plan, input: SendInput): SendPreview {
  return {
    people: plan.people,
    messages: plan.rows.length,
    audienceLabel: plan.audienceLabel,
    cost: Object.entries(plan.cost).map(([channel, credits]) => ({ channel: CHANNEL_LABEL[channel as Channel], credits: credits ?? 0, ...(plan.testMode.includes(channel as Channel) ? { test: true } : {}) })),
    backupCost: plan.backupCost,
    ...(plan.backupCost && plan.testMode.includes("sms") ? { backupTest: true } : {}),
    testMode: plan.testMode.map((c) => CHANNEL_LABEL[c]),
    balances: plan.balances,
    creditProblem: plan.creditProblem,
    problems: plan.problems,
    skipped: plan.skipped.map((g) => ({ reason: g.reason, count: g.count, names: g.names.slice(0, 8), ...(g.notSent ? { notSent: true } : {}) })),
    samples: plan.rows.slice(0, 25).map((r) => ({
      name: r.candidate.name,
      description: r.candidate.description,
      channel: CHANNEL_LABEL[r.channel],
      title: r.title,
      text: withHiddenLinks(r.text),
      parts: r.channel === "sms" ? smsParts(r.text) : null,
    })),
    scheduledAt: input.scheduledAt ? input.scheduledAt.toISOString() : null,
    emergency: Boolean(input.emergency),
    fingerprint: `${plan.people}:${plan.rows.length}:${Object.values(plan.cost).join(",")}`,
  };
}
