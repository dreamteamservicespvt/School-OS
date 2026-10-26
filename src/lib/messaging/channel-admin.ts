// A school's SMS, WhatsApp and email connections. DREAM TEAM connects each
// channel to a provider from the console (keys stored encrypted, never shown
// again), sends a test, and sets the DLT entity ID, sender header and credits
// (07-super-admin.md §3.8). The school itself only switches a connected channel
// on or off and sets its low-credit alert (saveChannelChoices).
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { channelSecrets, channelSetups, encryptSecrets, PROVIDER_FIELDS, PROVIDERS, type ProviderChannel } from "./channels";
import { providerFor } from "./providers";
import { SMTP_PORTS } from "./providers/smtp";
import { META_ID } from "./providers/whatsapp";
import { publicHostProblem } from "../net/public-address";

export class ChannelProblem extends Error {}

export type ChannelInput = {
  provider: string;
  live: boolean;
  isOn: boolean;
  config: Record<string, string>;
  /** Only the secrets typed now; blank ones keep what is stored. */
  secrets: Record<string, string>;
  lowCreditAlert: number;
};

/** Checks a channel form; errors by field key. */
export async function checkChannel(tx: Tx, ctx: SchoolContext, channel: ProviderChannel, input: ChannelInput): Promise<Record<string, string>> {
  const e: Record<string, string> = {};
  if (!PROVIDERS[channel].some((p) => p.key === input.provider)) e.provider = "Choose a provider.";
  const fields = PROVIDER_FIELDS[input.provider] ?? [];
  const setups = await channelSetups(tx, ctx);
  const keepSecrets = setups[channel].provider === input.provider && setups[channel].hasSecrets;
  for (const f of fields) {
    const v = (f.secret ? input.secrets[f.key] : input.config[f.key])?.trim() ?? "";
    if (f.required && !v && !(f.secret && keepSecrets)) e[f.key] = `Enter the ${f.label.toLowerCase()}.`;
    if (v.length > 500) e[f.key] = `${f.label} is too long.`;
  }
  if (input.provider === "msg91" && input.config.senderId && !/^[A-Za-z]{6}$/.test(input.config.senderId.trim())) e.senderId = "The sender ID is exactly 6 letters.";
  if (input.provider === "smtp") {
    if (input.config.port && !(SMTP_PORTS as readonly number[]).includes(Number(input.config.port.trim()))) e.port = "Enter the port your email provider gives: 587, 465, 25 or 2525.";
    // The server name must be on the public internet (08-platform-security.md §7); it is looked up and checked again when used.
    const hostProblem = input.config.host?.trim() ? publicHostProblem(input.config.host) : null;
    if (hostProblem) e.host = hostProblem;
    if (input.config.fromAddress && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.config.fromAddress.trim())) e.fromAddress = "Enter an email address like office@school.in.";
  }
  if (input.provider === "meta-cloud") {
    // Numbers only: these go into the address School OS calls at Meta (08-platform-security.md §7).
    if (input.config.phoneNumberId?.trim() && !META_ID.test(input.config.phoneNumberId.trim())) e.phoneNumberId = "The phone number ID has only numbers, as shown in Meta Business Manager, WhatsApp, API setup.";
    if (input.config.businessAccountId?.trim() && !META_ID.test(input.config.businessAccountId.trim())) e.businessAccountId = "The WhatsApp Business account ID has only numbers, as shown in Meta Business Manager.";
  }
  if (input.provider === "meta-cloud" && input.config.displayNumber && !/^[6-9]\d{9}$/.test(input.config.displayNumber.replace(/\D/g, "").slice(-10))) e.displayNumber = "Enter a 10-digit mobile number.";
  if (!Number.isInteger(input.lowCreditAlert) || input.lowCreditAlert < 0 || input.lowCreditAlert > 100000) e.lowCreditAlert = "Enter a number of credits from 0 to 100000.";
  if (channel === "sms" && input.isOn) {
    const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { smsDltEntityId: true, smsSenderHeader: true } });
    if (!school.smsDltEntityId || !school.smsSenderHeader) e.isOn = "Add the DLT entity ID and sender header below before switching SMS on.";
  }
  if (input.live && input.provider === "sandbox") e.live = "Choose a real provider to send for real.";
  return e;
}

export async function saveChannel(tx: Tx, ctx: SchoolContext, channel: ProviderChannel, input: ChannelInput) {
  const errors = await checkChannel(tx, ctx, channel, input);
  if (Object.keys(errors).length) throw new ChannelProblem(Object.values(errors)[0]);
  const before = (await channelSetups(tx, ctx))[channel];
  const fields = PROVIDER_FIELDS[input.provider] ?? [];
  const config = Object.fromEntries(fields.filter((f) => !f.secret).map((f) => [f.key, (input.config[f.key] ?? "").trim()]).filter(([, v]) => v));
  const stored = before.provider === input.provider ? await channelSecrets(tx, ctx, channel) : {};
  const secrets = Object.fromEntries(fields.filter((f) => f.secret).map((f) => [f.key, (input.secrets[f.key] ?? "").trim() || stored[f.key] || ""]).filter(([, v]) => v));
  const enc = Object.keys(secrets).length ? encryptSecrets(secrets) : { secretsEnc: null, secretsLast4: null };
  const data = { provider: input.provider, isOn: input.isOn, environment: input.live ? "live" : "test", config, ...enc, lowCreditAlert: input.lowCreditAlert, updatedById: ctx.userId };
  await tx.messagingChannel.upsert({ where: { schoolId_channel: { schoolId: ctx.schoolId, channel } }, create: { schoolId: ctx.schoolId, channel, ...data }, update: data });
  // A real WhatsApp account connected or changed: template statuses must match
  // what that account really has (test-mode approvals were never sent to it).
  if (channel === "whatsapp" && input.provider === "meta-cloud") {
    const { syncWhatsappApprovals } = await import("../communication/templates-admin");
    await syncWhatsappApprovals(tx, ctx);
  }
  const changedSecrets = Object.keys(input.secrets).filter((k) => input.secrets[k]?.trim());
  // Keys are never written to the audit log; only which ones changed.
  await writeAudit(tx, ctx, {
    action: "changed", recordType: "Messaging Channel", recordId: null,
    before: { channel, provider: before.provider, isOn: before.isOn, environment: before.environment, config: before.config },
    after: { channel, provider: input.provider, isOn: input.isOn, environment: data.environment, config, keysChanged: changedSecrets },
  });
}

export type ChannelChoices = { isOn: boolean; lowCreditAlert: number };

/**
 * The school's own choices in Settings, SMS, WhatsApp & Email: a channel on or
 * off, and the low-credit alert. Returns errors by field key; saves when none.
 */
export async function saveChannelChoices(tx: Tx, ctx: SchoolContext, channel: ProviderChannel, input: ChannelChoices): Promise<Record<string, string>> {
  const e: Record<string, string> = {};
  const before = (await channelSetups(tx, ctx))[channel];
  if (!Number.isInteger(input.lowCreditAlert) || input.lowCreditAlert < 0 || input.lowCreditAlert > 100000) e.lowCreditAlert = "Enter a number of credits from 0 to 100000.";
  if (channel === "sms" && input.isOn) {
    const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { smsDltEntityId: true, smsSenderHeader: true } });
    if (!school.smsDltEntityId || !school.smsSenderHeader) e.isOn = "SMS can be switched on once DREAM TEAM has added the school's DLT registration. Please tell DREAM TEAM support.";
  }
  if (Object.keys(e).length) return e;
  const data = { isOn: input.isOn, lowCreditAlert: input.lowCreditAlert, updatedById: ctx.userId };
  await tx.messagingChannel.upsert({ where: { schoolId_channel: { schoolId: ctx.schoolId, channel } }, create: { schoolId: ctx.schoolId, channel, provider: before.provider, ...data }, update: data });
  await writeAudit(tx, ctx, {
    action: "changed", recordType: "Messaging Channel", recordId: null,
    before: { channel, isOn: before.isOn, lowCreditAlert: before.lowCreditAlert },
    after: { channel, isOn: input.isOn, lowCreditAlert: input.lowCreditAlert },
  });
  return {};
}

/** Sends one test message to the person themself, straight through the provider, and records the result. */
export async function testChannel(tx: Tx, ctx: SchoolContext, channel: ProviderChannel, to: string) {
  const setup = (await channelSetups(tx, ctx))[channel];
  const target = to.trim();
  if (channel === "email" ? !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target) : !/^[6-9]\d{9}$/.test(target)) {
    throw new ChannelProblem(channel === "email" ? "Enter your email address." : "Enter your 10-digit mobile number.");
  }
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { name: true, smsDltEntityId: true, smsSenderHeader: true } });
  const provider = providerFor(setup, await channelSecrets(tx, ctx, channel));
  const text = `Test message from ${school.name} on School OS. If you can read this, ${channel === "sms" ? "SMS" : channel === "whatsapp" ? "WhatsApp" : "email"} is working.`;
  let ok = false;
  let note: string;
  if (channel === "whatsapp" && setup.environment === "live") {
    // WhatsApp only allows approved templates to start a chat; a plain test is not allowed by Meta.
    note = "WhatsApp settings saved. WhatsApp only allows approved templates, so send a test from Send Message with an approved template.";
    ok = Boolean(setup.config.phoneNumberId);
  } else {
    let r;
    try {
      r = await provider.send({ channel, to: target, text, subject: channel === "email" ? `Test message from ${school.name}` : null, dltEntityId: school.smsDltEntityId, senderHeader: school.smsSenderHeader, dltTemplateId: null });
    } catch {
      r = { ok: false as const, reason: "The provider did not answer.", retryable: true };
    }
    ok = r.ok;
    note = r.ok ? (provider.key === "sandbox" ? "Test mode: recorded, nothing was sent." : "Sent. Check your phone or inbox.") : r.reason;
  }
  await tx.messagingChannel.upsert({
    where: { schoolId_channel: { schoolId: ctx.schoolId, channel } },
    create: { schoolId: ctx.schoolId, channel, provider: setup.provider, lastTestAt: new Date(), lastTestOk: ok, lastTestNote: note.slice(0, 300) },
    update: { lastTestAt: new Date(), lastTestOk: ok, lastTestNote: note.slice(0, 300) },
  });
  await writeAudit(tx, ctx, { action: "tested", recordType: "Messaging Channel", recordId: null, after: { channel, ok, note } });
  return { ok, note };
}

/** The DLT entity ID and sender header registered on the telecom DLT portal (rule 34). */
export async function saveDlt(tx: Tx, ctx: SchoolContext, entityId: string, header: string) {
  const e = entityId.trim();
  const h = header.trim().toUpperCase();
  if (e && !/^[A-Za-z0-9]{10,30}$/.test(e)) throw new ChannelProblem("The DLT entity ID has only letters and numbers, as shown on the DLT portal.");
  if (h && !/^[A-Z]{6}$/.test(h)) throw new ChannelProblem("The sender header is exactly 6 letters, for example SUNSPS.");
  const before = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { smsDltEntityId: true, smsSenderHeader: true } });
  if ((!e || !h) && (await channelSetups(tx, ctx)).sms.isOn) throw new ChannelProblem("SMS is switched on, so both the DLT entity ID and the sender header are needed. Switch SMS off first to clear them.");
  await tx.school.update({ where: { id: ctx.schoolId }, data: { smsDltEntityId: e || null, smsSenderHeader: h || null } });
  await writeAudit(tx, ctx, { action: "changed", recordType: "School", recordId: ctx.schoolId, before: { dltEntityId: before.smsDltEntityId, senderHeader: before.smsSenderHeader }, after: { dltEntityId: e || null, senderHeader: h || null } });
}

/** Adds credits bought from the provider. Credits are never removed; a mistake is put right with a correction. */
export async function addCredits(tx: Tx, ctx: SchoolContext, channel: "whatsapp" | "sms", amount: number, note: string) {
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 10_000_000) throw new ChannelProblem("Enter a whole number of credits.");
  const n = note.trim();
  if (n.length < 3) throw new ChannelProblem(amount < 0 ? "Write why credits are being corrected." : "Write a note, for example the invoice number.");
  if (n.length > 200) throw new ChannelProblem("The note can be at most 200 characters.");
  const entry = await tx.creditLedgerEntry.create({ data: { schoolId: ctx.schoolId, channel, amount, note: amount < 0 ? `Correction: ${n}` : n, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: amount < 0 ? "corrected-credits" : "added-credits", recordType: "Credit Ledger Entry", recordId: entry.id, after: { channel, amount, note: n } });
  return entry;
}
