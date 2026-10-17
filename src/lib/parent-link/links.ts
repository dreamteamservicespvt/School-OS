// Parent Link (11-communication.md, Parent Link; 04-data-model.md rule 31).
//
// - One active link per guardian, covering all their children in the school.
// - The secret in the link is never stored. It is worked out from the link's
//   id with a server key (HMAC), and only its hash is kept, so a copy of the
//   database alone can open nothing. The same link can be sent again; a
//   revoked link stops working at once.
// - In message texts the link is kept as a placeholder and put in only when
//   the message is handed to WhatsApp or SMS.
// - A new phone must be confirmed with a one-time code to the guardian's
//   registered mobile. The phone then keeps a random key (cookie); only its
//   hash is kept, for 180 days by default.
import "server-only";

import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { hashToken, placeholderFor, tokenFor } from "./token";
import { prisma, withSchool, type SchoolContext, type Tx } from "../db";
import { writeAudit } from "../audit";
import { sendMessage, MessagingProblem, type SendResult } from "../messaging/send";
import { channelSetups, whatsappIsLive, type Channel } from "../messaging/channels";
import { ensureReadyTemplates, templateByKey } from "../messaging/templates";
import { messageSettings } from "../messaging/settings";
import type { AudienceRule } from "../messaging/recipients";

export class ParentLinkProblem extends Error {}

/** "+91 ••••• ••210" (11-communication.md §5). */
export function maskPhone(phone: string) {
  const d = phone.replace(/\D/g, "").slice(-10);
  return `+91 ••••• ••${d.slice(-3)}`;
}

/** Makes a guardian's link. One active link per guardian (enforced by the database too). */
export async function createLink(tx: Tx, ctx: SchoolContext, guardianId: string) {
  const g = await tx.guardian.findFirst({ where: { id: guardianId, schoolId: ctx.schoolId, archivedAt: null } });
  if (!g) throw new ParentLinkProblem("This parent was not found.");
  const active = await tx.parentLink.findFirst({ where: { guardianId, status: "ACTIVE" } });
  if (active) throw new ParentLinkProblem(`${g.name} already has an active Parent Link. Use Resend or Reissue instead.`);
  const id = crypto.randomUUID();
  const token = tokenFor(id);
  const link = await tx.parentLink.create({ data: { id, schoolId: ctx.schoolId, guardianId, tokenHash: hashToken(token), tokenHint: token.slice(-4), createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Parent Link", recordId: link.id, after: { guardian: g.name } });
  return link;
}

/**
 * Why a template cannot go on a channel right now, or null when it can: SMS
 * needs the school's DLT entity ID and sender header and a template with a
 * DLT template ID; a real WhatsApp account needs a template WhatsApp approved.
 */
async function cannotCarry(tx: Tx, ctx: SchoolContext, ch: "whatsapp" | "sms", templateId: string, setups: Awaited<ReturnType<typeof channelSetups>>): Promise<string | null> {
  if (ch === "sms") {
    const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { smsDltEntityId: true, smsSenderHeader: true } });
    if (!school.smsDltEntityId || !school.smsSenderHeader) return "Add your DLT entity ID and sender header in Settings, SMS, WhatsApp & Email before sending SMS.";
    const ok = await tx.templateVersion.count({ where: { templateId, isCurrent: true, dltTemplateId: { not: null } } });
    return ok ? null : "The SMS template has no DLT template ID. Add it in Message Templates, or send by WhatsApp.";
  }
  if (!whatsappIsLive(setups.whatsapp)) return null;
  const ok = await tx.templateVersion.count({ where: { templateId, isCurrent: true, whatsappStatus: "APPROVED", whatsappName: { not: null } } });
  return ok ? null : "WhatsApp has not approved the template yet. Send it for approval in Message Templates, or send by SMS.";
}

/** The channel and template for sending links: WhatsApp if it can carry it, else SMS (with a DLT ID). */
async function linkChannel(tx: Tx, ctx: SchoolContext, wanted?: Channel | null): Promise<{ channel: Channel; templateId: string }> {
  await ensureReadyTemplates(tx, ctx);
  const setups = await channelSetups(tx, ctx);
  const order: Channel[] = wanted ? [wanted] : ["whatsapp", "sms"];
  let why: string | null = null;
  for (const ch of order) {
    if (ch !== "whatsapp" && ch !== "sms") continue;
    if (!setups[ch].isOn) continue;
    const t = await templateByKey(tx, ctx, "parent-link", ch);
    if (!t) continue;
    const no = await cannotCarry(tx, ctx, ch, t.id, setups);
    if (no) { if (wanted) throw new ParentLinkProblem(no); why ??= no; continue; }
    return { channel: ch, templateId: t.id };
  }
  if (why) throw new ParentLinkProblem(`Links cannot be sent: ${why}`);
  throw new ParentLinkProblem(wanted ? `${wanted === "sms" ? "SMS" : "WhatsApp"} is switched off. Switch it on in Settings, SMS, WhatsApp & Email.` : "Neither WhatsApp nor SMS is switched on, so links cannot be sent. Switch one on in Settings, SMS, WhatsApp & Email.");
}

/** Sends links (as placeholders) to guardians in one Message. */
export async function sendLinks(tx: Tx, ctx: SchoolContext, links: { id: string; guardianId: string }[], opts: { channel?: Channel | null; scheduledAt?: Date | null; trigger: string; audienceLabel?: string; dryRun?: boolean }): Promise<SendResult | null> {
  if (!links.length) return null;
  const { channel, templateId } = await linkChannel(tx, ctx, opts.channel);
  const perPerson = Object.fromEntries(links.map((l) => [l.guardianId, { link: placeholderFor(l.id) }]));
  const result = await sendMessage(tx, ctx, {
    to: { guardianIds: links.map((l) => l.guardianId) },
    channels: [channel],
    templates: { [channel]: templateId },
    perPerson,
    // The link is the guardian's own key to their children's records: it goes even to parents who opted out of general messages.
    emergency: true,
    trigger: opts.trigger,
    source: links.length === 1 ? { type: "Parent Link", id: links[0].id } : null,
    scheduledAt: opts.scheduledAt ?? null,
    audienceLabel: opts.audienceLabel,
  });
  await tx.parentLink.updateMany({ where: { id: { in: links.map((l) => l.id) } }, data: { lastSentAt: new Date() } });
  for (const l of links) await writeAudit(tx, ctx, { action: "sent", recordType: "Parent Link", recordId: l.id, after: { channel, message: result.messageId } });
  return result;
}

export async function createAndSend(tx: Tx, ctx: SchoolContext, guardianId: string, channel?: Channel | null) {
  const link = await createLink(tx, ctx, guardianId);
  await sendLinks(tx, ctx, [link], { channel, trigger: "Parent Link created" });
  return link;
}

/** Resend: the same link again, for a guardian who lost the message. Confirmed phones stay confirmed. */
export async function resendLink(tx: Tx, ctx: SchoolContext, linkId: string, channel?: Channel | null) {
  const link = await tx.parentLink.findFirst({ where: { id: linkId, schoolId: ctx.schoolId } });
  if (!link || link.status !== "ACTIVE") throw new ParentLinkProblem("Only an active link can be resent. Reissue it instead.");
  return sendLinks(tx, ctx, [link], { channel, trigger: "Parent Link resent" });
}

export const REVOKE_REASONS = ["Lost phone", "Link shared with someone else", "Guardian changed mobile", "Other"] as const;

/** Revoke: the link stops working at once, on every phone. The reason is logged. */
export async function revokeLink(tx: Tx, ctx: SchoolContext, linkId: string, reason: string) {
  const link = await tx.parentLink.findFirst({ where: { id: linkId, schoolId: ctx.schoolId } });
  if (!link) throw new ParentLinkProblem("This link was not found.");
  if (link.status === "REVOKED") throw new ParentLinkProblem("This link is already revoked.");
  const now = new Date();
  await tx.parentLink.update({ where: { id: link.id }, data: { status: "REVOKED", revokedAt: now, revokedById: ctx.userId, revokeReason: reason } });
  await tx.parentLinkDevice.updateMany({ where: { parentLinkId: link.id, revokedAt: null }, data: { revokedAt: now } });
  await writeAudit(tx, ctx, { action: "revoked", recordType: "Parent Link", recordId: link.id, before: { status: "ACTIVE" }, after: { status: "REVOKED", reason } });
  return link;
}

/** Reissue: revokes the old link and sends a new one to the registered mobile. */
export async function reissueLink(tx: Tx, ctx: SchoolContext, linkId: string, reason: string, channel?: Channel | null) {
  const old = await revokeLink(tx, ctx, linkId, reason);
  const fresh = await createLink(tx, ctx, old.guardianId);
  await tx.parentLink.update({ where: { id: old.id }, data: { replacedById: fresh.id } });
  await writeAudit(tx, ctx, { action: "reissued", recordType: "Parent Link", recordId: fresh.id, after: { replaces: old.id, reason } });
  await sendLinks(tx, ctx, [fresh], { channel, trigger: "Parent Link reissued" });
  return fresh;
}

/**
 * Send to existing families: makes links for guardians in the audience who
 * have none and sends them in one message (P11: preview first, summary after).
 */
export async function guardiansWithoutLinks(tx: Tx, ctx: SchoolContext, guardianIds: string[]) {
  const have = new Set((await tx.parentLink.findMany({ where: { schoolId: ctx.schoolId, guardianId: { in: guardianIds }, status: "ACTIVE" }, select: { guardianId: true } })).map((l) => l.guardianId));
  return guardianIds.filter((id) => !have.has(id));
}

export async function sendToFamilies(tx: Tx, ctx: SchoolContext, guardianIds: string[], opts: { channel?: Channel | null; scheduledAt?: Date | null; audienceLabel: string }) {
  const todo = await guardiansWithoutLinks(tx, ctx, guardianIds);
  if (!todo.length) throw new ParentLinkProblem("Every parent chosen already has an active link. Use Resend for one parent.");
  await linkChannel(tx, ctx, opts.channel); // fail early, before making links
  const links = [];
  for (const g of todo) links.push(await createLink(tx, ctx, g));
  const result = await sendLinks(tx, ctx, links, { channel: opts.channel, scheduledAt: opts.scheduledAt, trigger: "Parent Links sent to existing families", audienceLabel: opts.audienceLabel });
  return { made: links.length, alreadyHad: guardianIds.length - todo.length, result };
}

/** A2: when an admission is approved, the guardians get their links without anyone typing them. */
export async function sendLinksOnAdmission(tx: Tx, ctx: SchoolContext, studentId: string) {
  const settings = await messageSettings(tx, ctx);
  if (!settings.parentLink.on || !settings.parentLink.autoSendOnAdmission) return { made: 0 };
  const guardians = await tx.studentGuardian.findMany({ where: { studentId, archivedAt: null }, select: { guardianId: true } });
  const todo = await guardiansWithoutLinks(tx, ctx, guardians.map((g) => g.guardianId));
  const links = [];
  for (const g of todo) links.push(await createLink(tx, ctx, g));
  try {
    await sendLinks(tx, ctx, links, { trigger: "Admission approved" });
  } catch (e) {
    // The links are made either way; staff can send them from the Parent Link page.
    if (!(e instanceof ParentLinkProblem || e instanceof MessagingProblem)) throw e;
  }
  return { made: links.length };
}

// ── The guardian's side (no login) ────────────────────────────────────────

export const CODE_TRIES = 5;

export type LinkFound = { linkId: string; schoolId: string };

/** Finds which school a link belongs to, from the token alone. */
export async function findLink(token: string): Promise<LinkFound | null> {
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(token)) return null;
  const rows = await prisma.$queryRaw<{ link_id: string; link_school_id: string }[]>`SELECT * FROM find_parent_link(${hashToken(token)})`;
  const row = rows[0];
  if (!row) return null;
  // The token must be the one worked out from this link's id: guards against a stale hash.
  const expected = Buffer.from(tokenFor(row.link_id));
  const given = Buffer.from(token);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return { linkId: row.link_id, schoolId: row.link_school_id };
}

export const deviceCookieName = (linkId: string) => `pl_${linkId.replace(/-/g, "").slice(0, 12)}`;
export const newDeviceKey = () => randomBytes(32).toString("base64url");

const codeHash = (code: string, linkId: string) => createHash("sha256").update(`${linkId}:${code}`).digest("hex");

/** A short description of a phone for the staff screen ("Android phone, Chrome"). */
export function deviceLabel(ua: string | null | undefined) {
  const u = ua ?? "";
  const os = /iPhone|iPad/.test(u) ? "iPhone" : /Android/.test(u) ? "Android phone" : /Windows/.test(u) ? "Windows computer" : /Mac OS/.test(u) ? "Mac" : /Linux/.test(u) ? "Linux computer" : "Phone";
  const browser = /Edg\//.test(u) ? "Edge" : /SamsungBrowser/.test(u) ? "Samsung Internet" : /Chrome\//.test(u) ? "Chrome" : /Firefox\//.test(u) ? "Firefox" : /Safari\//.test(u) ? "Safari" : "browser";
  return `${os}, ${browser}`;
}

export type OpenState =
  | { state: "invalid" }
  | { state: "revoked"; schoolName: string; schoolPhone: string | null }
  | { state: "off"; schoolName: string; schoolPhone: string | null }
  | { state: "verify"; schoolName: string; maskedPhone: string; linkId: string; schoolId: string; codeSentAt: Date | null }
  | { state: "open"; schoolName: string; linkId: string; schoolId: string; guardianId: string; deviceId: string };

/** Checks a link and a phone's key. Writes "opened" to the log when it opens. */
export async function openLink(token: string, deviceKey: string | null, device: { userAgent: string | null; ipAddress: string | null }, now = new Date()): Promise<OpenState> {
  const found = await findLink(token);
  if (!found) return { state: "invalid" };
  const ctx: SchoolContext = { schoolId: found.schoolId, userId: null };
  return withSchool(ctx, async (tx) => {
    const link = await tx.parentLink.findUniqueOrThrow({ where: { id: found.linkId } });
    const school = await tx.school.findUniqueOrThrow({ where: { id: found.schoolId }, select: { name: true, phone: true, status: true } });
    if (link.status === "REVOKED") return { state: "revoked" as const, schoolName: school.name, schoolPhone: school.phone };
    const settings = await messageSettings(tx, ctx);
    if (!settings.parentLink.on || school.status === "SUSPENDED" || school.status === "CLOSED") return { state: "off" as const, schoolName: school.name, schoolPhone: school.phone };
    const guardian = await tx.guardian.findUniqueOrThrow({ where: { id: link.guardianId }, select: { phone: true, archivedAt: true } });
    if (guardian.archivedAt) return { state: "revoked" as const, schoolName: school.name, schoolPhone: school.phone };
    if (deviceKey) {
      const dev = await tx.parentLinkDevice.findFirst({ where: { parentLinkId: link.id, keyHash: hashToken(deviceKey), revokedAt: null, expiresAt: { gt: now } } });
      if (dev) {
        await tx.parentLinkDevice.update({ where: { id: dev.id }, data: { lastUsedAt: now, ipAddress: device.ipAddress } });
        await tx.parentLink.update({ where: { id: link.id }, data: { lastOpenedAt: now } });
        await writeAudit(tx, ctx, { action: "opened", recordType: "Parent Link", recordId: link.id, after: { phone: dev.label }, device: device.userAgent, ipAddress: device.ipAddress });
        return { state: "open" as const, schoolName: school.name, linkId: link.id, schoolId: found.schoolId, guardianId: link.guardianId, deviceId: dev.id };
      }
    }
    const pending = await tx.parentLinkCode.findFirst({ where: { parentLinkId: link.id, purpose: "device", usedAt: null, expiresAt: { gt: now }, ...(deviceKey ? { keyHash: hashToken(deviceKey) } : { keyHash: "-" }) }, orderBy: { createdAt: "desc" } });
    return { state: "verify" as const, schoolName: school.name, maskedPhone: maskPhone(guardian.phone), linkId: link.id, schoolId: found.schoolId, codeSentAt: pending?.createdAt ?? null };
  });
}

/** Sends a one-time code to the guardian's registered mobile (never to a number typed on the page). */
export async function sendCode(tx: Tx, ctx: SchoolContext, linkId: string, purpose: "device" | "consent", opts: { keyHash?: string | null; detail?: object; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const link = await tx.parentLink.findUniqueOrThrow({ where: { id: linkId } });
  if (link.status !== "ACTIVE") throw new ParentLinkProblem("This link is no longer active. Please ask the school for a new one.");
  const settings = await messageSettings(tx, ctx);
  await ensureReadyTemplates(tx, ctx);
  const setups = await channelSetups(tx, ctx);
  let channel: Channel | null = null;
  let templateId: string | null = null;
  // SMS first (codes are what SMS is for), else WhatsApp; each only when it can really carry the code.
  for (const ch of ["sms", "whatsapp"] as const) {
    if (!setups[ch].isOn) continue;
    const t = await templateByKey(tx, ctx, "parent-link-code", ch);
    if (!t) continue;
    if (await cannotCarry(tx, ctx, ch, t.id, setups)) continue;
    channel = ch;
    templateId = t.id;
    break;
  }
  if (!channel || !templateId) throw new ParentLinkProblem("The school cannot send codes right now. Please call the school.");
  // An earlier unused code stops working when a new one is sent.
  await tx.parentLinkCode.updateMany({ where: { parentLinkId: linkId, purpose, usedAt: null }, data: { expiresAt: now } });
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const row = await tx.parentLinkCode.create({
    data: { schoolId: ctx.schoolId, parentLinkId: linkId, purpose, codeHash: codeHash(code, linkId), keyHash: opts.keyHash ?? null, detail: opts.detail ?? {}, expiresAt: new Date(now.getTime() + settings.parentLink.codeMinutes * 60_000) },
  });
  const sent = await sendMessage(tx, ctx, {
    to: { guardianIds: [link.guardianId] },
    channels: [channel],
    templates: { [channel]: templateId },
    values: { code },
    single: true,
    emergency: true,
    trigger: purpose === "device" ? "Parent Link one-time code (new phone)" : "Parent Link one-time code (consent)",
    source: { type: "Parent Link Code", id: row.id },
    idempotencyKey: `parent-link-code:${row.id}`,
  });
  await tx.parentLinkCode.update({ where: { id: row.id }, data: { messageId: sent.messageId } });
  await writeAudit(tx, ctx, { action: "code-sent", recordType: "Parent Link", recordId: linkId, after: { purpose, channel } });
  return row;
}

export type CodeCheck = { ok: true; code: { id: string; detail: unknown } } | { ok: false; message: string };

/** Checks a typed code. Five wrong tries and the code stops working. */
export async function checkCode(tx: Tx, ctx: SchoolContext, linkId: string, purpose: "device" | "consent", typed: string, keyHash: string | null, now = new Date()): Promise<CodeCheck> {
  const clean = typed.replace(/\D/g, "");
  const row = await tx.parentLinkCode.findFirst({ where: { parentLinkId: linkId, purpose, usedAt: null, expiresAt: { gt: now }, ...(purpose === "device" ? { keyHash: keyHash ?? "-" } : {}) }, orderBy: { createdAt: "desc" } });
  if (!row) return { ok: false, message: "This code has expired. Tap \"Send a new code\"." };
  if (row.attempts >= CODE_TRIES) return { ok: false, message: "Too many wrong codes. Tap \"Send a new code\"." };
  const expected = Buffer.from(row.codeHash);
  const given = Buffer.from(codeHash(clean, linkId));
  if (clean.length !== 6 || !timingSafeEqual(expected, given)) {
    await tx.parentLinkCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    const left = CODE_TRIES - row.attempts - 1;
    await writeAudit(tx, ctx, { action: "code-wrong", recordType: "Parent Link", recordId: linkId, after: { purpose } });
    return { ok: false, message: left > 0 ? `That code is not right. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong codes. Tap \"Send a new code\"." };
  }
  await tx.parentLinkCode.update({ where: { id: row.id }, data: { usedAt: now } });
  return { ok: true, code: { id: row.id, detail: row.detail } };
}

/** Confirms a new phone: the code was right, so this phone's key is remembered. */
export async function confirmDevice(tx: Tx, ctx: SchoolContext, linkId: string, deviceKey: string, typed: string, device: { userAgent: string | null; ipAddress: string | null }, now = new Date()) {
  const keyHash = hashToken(deviceKey);
  const check = await checkCode(tx, ctx, linkId, "device", typed, keyHash, now);
  if (!check.ok) return check;
  const settings = await messageSettings(tx, ctx);
  const dev = await tx.parentLinkDevice.create({
    data: { schoolId: ctx.schoolId, parentLinkId: linkId, keyHash, label: deviceLabel(device.userAgent), ipAddress: device.ipAddress, verifiedAt: now, lastUsedAt: now, expiresAt: new Date(now.getTime() + settings.parentLink.deviceDays * 86400_000) },
  });
  await writeAudit(tx, ctx, { action: "phone-confirmed", recordType: "Parent Link", recordId: linkId, after: { phone: dev.label }, device: device.userAgent, ipAddress: device.ipAddress });
  return { ok: true as const, deviceId: dev.id, days: settings.parentLink.deviceDays };
}

/** Is this phone still confirmed for this link? Every guardian action checks it again on the server. */
export async function confirmedDevice(tx: Tx, linkId: string, deviceKey: string | null, now = new Date()) {
  if (!deviceKey) return null;
  const link = await tx.parentLink.findUnique({ where: { id: linkId } });
  if (!link || link.status !== "ACTIVE") return null;
  const dev = await tx.parentLinkDevice.findFirst({ where: { parentLinkId: linkId, keyHash: hashToken(deviceKey), revokedAt: null, expiresAt: { gt: now } } });
  return dev ? { link, device: dev } : null;
}

export type { AudienceRule };
export { hashToken, linkUrl, placeholderFor, tokenFor, withHiddenLinks, withRealLinks, appUrl } from "./token";
