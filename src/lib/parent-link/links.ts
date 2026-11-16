// Parent Link (11-communication.md, Parent Link; 04-data-model.md rule 31).
//
// - One active link per guardian, covering all their children in the school.
// - The secret in the link is never stored. It is worked out from the link's
//   id with a server key (HMAC), and only its hash is kept, so a copy of the
//   database alone can open nothing. The same link can be sent again; a
//   revoked link stops working at once.
// - In message texts the link is kept as a placeholder and put in only when
//   the message is handed to WhatsApp or SMS.
// - A new phone must be confirmed by the guardian's registered mobile: by SMS
//   a 6-digit code to type; on WhatsApp a tap ("tap to confirm"): the
//   guardian's own Parent Link card comes again with a one-time secret in its
//   "Open Parent Link" button (/p/<token>.<secret>), and the browser that
//   opens it is remembered. Meta does not deliver code (Authentication)
//   messages to WhatsApp users on +91 numbers (live test 16 Nov 2026: the code
//   never came), so on WhatsApp no code is sent. The phone then keeps a random
//   key (cookie); only its hash is kept, for 180 days by default.
import "server-only";

import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { hashToken, placeholderFor, tokenFor } from "./token";
import { prisma, withSchool, type SchoolContext, type Tx } from "../db";
import { writeAudit } from "../audit";
import { sendMessage, MessagingProblem, type SendResult } from "../messaging/send";
import { channelSetups, offeredChannels, SMS_OFFERED, whatsappIsLive, type Channel } from "../messaging/channels";
import { inTestMode } from "../messaging/providers";
import { ensureReadyTemplates, templateByKey } from "../messaging/templates";
import { messageSettings } from "../messaging/settings";
import type { AudienceRule } from "../messaging/recipients";
import { OPEN_LINK } from "../students/guardian-access";
import { codeNotSentParentWords, logCodeSentBy, mayLogCode, PARENT_CODE_NOT_SENT } from "../dev-codes";
import { CODE_MASK } from "../messaging/one-time-code";
import { linkUrl as linkUrlOf } from "./token";

export class ParentLinkProblem extends Error {}

/** "+91 ••••• ••210" (11-communication.md §5); "Phone missing" for a parent with no phone. */
export function maskPhone(phone: string | null) {
  const d = (phone ?? "").replace(/\D/g, "").slice(-10);
  if (!d) return "Phone missing";
  return `+91 ••••• ••${d.slice(-3)}`;
}

/** Owner decision 15 (15-11-2026): a parent with no phone gets no Parent Link until a phone is added. */
export const NO_PHONE_LINK = "Add a phone first. Parent Link cannot be sent to a parent with no phone.";
const noPhoneWords = (name: string) => `Add a phone first. ${name} has no phone, so Parent Link cannot be sent.`;

/** Of these guardians, the ones with a phone (a link can go to them); the rest are "Phone missing". */
export async function guardiansWithPhone(tx: Tx, guardianIds: string[]) {
  if (!guardianIds.length) return [];
  const have = new Set((await tx.guardian.findMany({ where: { id: { in: guardianIds }, phone: { not: null } }, select: { id: true } })).map((g) => g.id));
  return guardianIds.filter((id) => have.has(id));
}

async function requirePhone(tx: Tx, guardianId: string) {
  const g = await tx.guardian.findUnique({ where: { id: guardianId }, select: { name: true, phone: true } });
  if (g && !g.phone) throw new ParentLinkProblem(noPhoneWords(g.name));
}

/** Makes a guardian's link. One active link per guardian (enforced by the database too). */
export async function createLink(tx: Tx, ctx: SchoolContext, guardianId: string) {
  const g = await tx.guardian.findFirst({ where: { id: guardianId, schoolId: ctx.schoolId, archivedAt: null } });
  if (!g) throw new ParentLinkProblem("This parent was not found.");
  if (!g.phone) throw new ParentLinkProblem(noPhoneWords(g.name));
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
  // The current version, or the last approved one while a new version waits for WhatsApp (withLastApproved, 15 Nov).
  const ok = await tx.templateVersion.count({ where: { templateId, whatsappStatus: "APPROVED", whatsappName: { not: null }, OR: [{ whatsappNote: null }, { NOT: { whatsappNote: { startsWith: "Test mode" } } }] } });
  return ok ? null : SMS_OFFERED ? "WhatsApp has not approved the template yet. Send it for approval in Message Templates, or send by SMS." : "WhatsApp has not approved the template yet. Send it for approval in Message Templates.";
}

/** The channel and template for sending links: WhatsApp if it can carry it, else SMS (with a DLT ID). */
async function linkChannel(tx: Tx, ctx: SchoolContext, wanted?: Channel | null): Promise<{ channel: Channel; templateId: string }> {
  await ensureReadyTemplates(tx, ctx);
  const setups = await channelSetups(tx, ctx);
  // Links never go by SMS while it is not offered (SMS_OFFERED, owner 15 Nov 2026).
  if (wanted === "sms" && !SMS_OFFERED) wanted = null;
  const order: Channel[] = wanted ? [wanted] : offeredChannels<Channel>(["whatsapp", "sms"]);
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
  throw new ParentLinkProblem(wanted ? `${wanted === "sms" ? "SMS" : "WhatsApp"} is switched off. Switch it on in Settings, SMS, WhatsApp & Email.` : SMS_OFFERED ? "Neither WhatsApp nor SMS is switched on, so links cannot be sent. Switch one on in Settings, SMS, WhatsApp & Email." : "WhatsApp is switched off, so links cannot be sent. Switch it on in Settings, SMS, WhatsApp & Email.");
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
    // The link is the guardian's own key to their children's records: it goes even to parents who opted out of
    // general messages. Sent by School OS, not an emergency broadcast (QA LABEL-01).
    systemMessage: "parent-link",
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
  await requirePhone(tx, link.guardianId);
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
  const before = await tx.parentLink.findFirst({ where: { id: linkId, schoolId: ctx.schoolId }, select: { guardianId: true } });
  if (before) await requirePhone(tx, before.guardianId);
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
  const without = await guardiansWithoutLinks(tx, ctx, guardianIds);
  if (!without.length) throw new ParentLinkProblem("Every parent chosen already has an active link. Use Resend for one parent.");
  // Parents with no phone are left out and counted (owner decision 15).
  const todo = await guardiansWithPhone(tx, without);
  const noPhone = without.length - todo.length;
  if (!todo.length) throw new ParentLinkProblem(noPhone === 1 ? NO_PHONE_LINK : `Add a phone first. The ${noPhone} parents chosen without a link have no phone, so Parent Link cannot be sent.`);
  await linkChannel(tx, ctx, opts.channel); // fail early, before making links
  const links = [];
  for (const g of todo) links.push(await createLink(tx, ctx, g));
  const result = await sendLinks(tx, ctx, links, { channel: opts.channel, scheduledAt: opts.scheduledAt, trigger: "Parent Links sent to existing families", audienceLabel: opts.audienceLabel });
  return { made: links.length, alreadyHad: guardianIds.length - without.length, noPhone, result };
}

/** A2: when an admission is approved, the guardians get their links without anyone typing them. */
export async function sendLinksOnAdmission(tx: Tx, ctx: SchoolContext, studentId: string) {
  const settings = await messageSettings(tx, ctx);
  if (!settings.parentLink.on || !settings.parentLink.autoSendOnAdmission) return { made: 0 };
  // Not a guardian with a custody restriction for this child.
  const guardians = await tx.studentGuardian.findMany({ where: { studentId, ...OPEN_LINK, guardian: { archivedAt: null } }, select: { guardianId: true } });
  // A parent with no phone gets their link once a phone is added (owner decision 15).
  const todo = await guardiansWithPhone(tx, await guardiansWithoutLinks(tx, ctx, guardians.map((g) => g.guardianId)));
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

/** How a code or tap secret is kept: only its hash, tied to the link. */
export const codeHash = (code: string, linkId: string) => createHash("sha256").update(`${linkId}:${code}`).digest("hex");

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
  | { state: "verify"; schoolName: string; schoolPhone: string | null; maskedPhone: string; linkId: string; schoolId: string; codeSentAt: Date | null; codeChannel: "sms" | "whatsapp" | null; tap: boolean }
  | { state: "open"; schoolName: string; linkId: string; schoolId: string; guardianId: string; deviceId: string };

/**
 * Whether a link can be used now: it is active, the school has Parent Link
 * switched on and is not suspended or closed, and the guardian is still on
 * record. Shared by opening the page and by every guardian action.
 */
async function linkCheck(tx: Tx, ctx: SchoolContext, linkId: string) {
  const link = await tx.parentLink.findUniqueOrThrow({ where: { id: linkId } });
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { name: true, phone: true, status: true, timeZone: true } });
  if (link.status !== "ACTIVE") return { state: "gone" as const, link, school };
  const settings = await messageSettings(tx, ctx);
  if (!settings.parentLink.on || school.status === "SUSPENDED" || school.status === "CLOSED") return { state: "off" as const, link, school };
  const guardian = await tx.guardian.findUniqueOrThrow({ where: { id: link.guardianId }, select: { phone: true, archivedAt: true } });
  if (guardian.archivedAt) return { state: "gone" as const, link, school };
  return { state: "ok" as const, link, school, settings, guardian };
}

/** Checks a link and a phone's key. Writes "opened" to the log when it opens. */
export async function openLink(token: string, deviceKey: string | null, device: { userAgent: string | null; ipAddress: string | null }, now = new Date()): Promise<OpenState> {
  const found = await findLink(token);
  if (!found) return { state: "invalid" };
  const ctx: SchoolContext = { schoolId: found.schoolId, userId: null };
  return withSchool(ctx, async (tx) => {
    const check = await linkCheck(tx, ctx, found.linkId);
    const { link, school } = check;
    if (check.state === "gone") return { state: "revoked" as const, schoolName: school.name, schoolPhone: school.phone };
    if (check.state === "off") return { state: "off" as const, schoolName: school.name, schoolPhone: school.phone };
    const { guardian } = check;
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
    // The screen names the channel that will really carry the code ("on WhatsApp", "by SMS"), or says to call the school.
    const carrier = await codeCarrier(tx, ctx);
    return { state: "verify" as const, schoolName: school.name, schoolPhone: school.phone, maskedPhone: maskPhone(guardian.phone), linkId: link.id, schoolId: found.schoolId, codeSentAt: pending?.createdAt ?? null, codeChannel: carrier?.channel ?? null, tap: carrier?.mode === "tap" };
  });
}

/**
 * The channel that really carries a Parent Link confirmation now, and its
 * template: SMS first, with a 6-digit code ("code"); else WhatsApp, with the
 * guardian's own Parent Link card and a one-time secret in its button ("tap";
 * Meta does not deliver code messages to +91 numbers; in Test mode, which never
 * reaches a phone, the 6-digit code as before). Each only when it can
 * carry it (SMS: a DLT template ID; a real WhatsApp account: the Parent Link
 * template approved). Null when neither can: the parent is told to call the school.
 */
async function codeCarrier(tx: Tx, ctx: SchoolContext, setups?: Awaited<ReturnType<typeof channelSetups>>): Promise<{ channel: "sms" | "whatsapp"; templateId: string; mode: "code" | "tap" } | null> {
  await ensureReadyTemplates(tx, ctx);
  const s = setups ?? await channelSetups(tx, ctx);
  for (const ch of ["sms", "whatsapp"] as const) {
    if (!s[ch].isOn) continue;
    // Test mode never reaches a phone: the code to type stays (read from the log on a tester's computer).
    const mode = ch === "whatsapp" && whatsappIsLive(s.whatsapp) ? "tap" : "code";
    const t = await templateByKey(tx, ctx, mode === "tap" ? "parent-link" : "parent-link-code", ch);
    if (!t) continue;
    if (await cannotCarry(tx, ctx, ch, t.id, s)) continue;
    return { channel: ch, templateId: t.id, mode };
  }
  return null;
}

/** A tap secret: 18 random bytes, base64url (24 characters). */
export const TAP_SECRET = /^[A-Za-z0-9_-]{24}$/;

/**
 * "/p/<token>.<secret>" from a tapped WhatsApp button: the link's own token and
 * the one-time secret; a secret only when it has the right shape.
 */
export function splitTap(raw: string): { token: string; secret: string | null } {
  const dot = raw.lastIndexOf(".");
  if (dot < 0) return { token: raw, secret: null };
  const secret = raw.slice(dot + 1);
  return TAP_SECRET.test(secret) ? { token: raw.slice(0, dot), secret } : { token: raw, secret: null };
}

/** The parent's words when no code could go: call the school office (on its number, when the school has one). */
export function callSchoolWords(schoolPhone: string | null | undefined) {
  return schoolPhone ? `The school could not send your code. Please call the school office on ${schoolPhone}.` : PARENT_CODE_NOT_SENT;
}

/** Sends a one-time code to the guardian's registered mobile (never to a number typed on the page). */
export async function sendCode(tx: Tx, ctx: SchoolContext, linkId: string, purpose: "device" | "consent", opts: { keyHash?: string | null; detail?: object; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const link = await tx.parentLink.findUniqueOrThrow({ where: { id: linkId } });
  if (link.status !== "ACTIVE") throw new ParentLinkProblem("This link is no longer active. Please ask the school for a new one.");
  const holder = await tx.guardian.findUnique({ where: { id: link.guardianId }, select: { phone: true } });
  if (!holder?.phone) throw new ParentLinkProblem("The school has no phone number for you, so no code can be sent. Please ask the school to add your phone.");
  const settings = await messageSettings(tx, ctx);
  const setups = await channelSetups(tx, ctx);
  const carrier = await codeCarrier(tx, ctx, setups);
  if (!carrier) throw new ParentLinkProblem(PARENT_CODE_NOT_SENT);
  const { channel, templateId, mode } = carrier;
  // An earlier unused code stops working when a new one is sent.
  await tx.parentLinkCode.updateMany({ where: { parentLinkId: linkId, purpose, usedAt: null }, data: { expiresAt: now } });
  // A tap secret is long (144 bits), so it cannot be guessed; a typed code is 6 digits with five tries.
  const code = mode === "tap" ? randomBytes(18).toString("base64url") : String(randomInt(0, 1_000_000)).padStart(6, "0");
  const detail = mode === "tap" ? { ...(opts.detail ?? {}), via: "tap" } : opts.detail ?? {};
  const row = await tx.parentLinkCode.create({
    data: { schoolId: ctx.schoolId, parentLinkId: linkId, purpose, codeHash: codeHash(code, linkId), keyHash: opts.keyHash ?? null, detail, expiresAt: new Date(now.getTime() + settings.parentLink.codeMinutes * 60_000) },
  });
  const sent = await sendMessage(tx, ctx, {
    to: { guardianIds: [link.guardianId] },
    channels: [channel],
    templates: { [channel]: templateId },
    // Tap: the guardian's own Parent Link card; the secret joins the button's link only when the
    // message is handed to WhatsApp (deliver.ts). The text keeps the link code and the mask.
    ...(mode === "tap" ? { perPerson: { [link.guardianId]: { link: `${placeholderFor(linkId)}.${CODE_MASK}` } } } : {}),
    // The code goes only to the provider; Message History keeps "••••••" (QA SEC-01).
    oneTimeCode: { code, purpose: "parent-link" },
    single: true,
    trigger: purpose === "device" ? "Parent Link one-time code (new phone)" : "Parent Link one-time code (consent)",
    source: { type: "Parent Link Code", id: row.id },
    idempotencyKey: `parent-link-code:${row.id}`,
  });
  await tx.parentLinkCode.update({ where: { id: row.id }, data: { messageId: sent.messageId } });
  const testMode = inTestMode(setups[channel]);
  const guardian = await tx.guardian.findUnique({ where: { id: link.guardianId }, select: { phone: true } });
  const inLog = mayLogCode(testMode ? "test" : "real")
    && await logCodeSentBy(tx, ctx, channel, { to: guardian?.phone, purpose: purpose === "device" ? "Parent Link, new phone" : "Parent Link, consent", code: mode === "tap" ? `${linkUrlOf(linkId)}.${code}` : code });
  // Nobody can read a code Test mode kept back (outside a tester's computer): end it, so the page does not wait for it.
  if (testMode && !inLog) await tx.parentLinkCode.update({ where: { id: row.id }, data: { expiresAt: now } });
  await writeAudit(tx, ctx, { action: "code-sent", recordType: "Parent Link", recordId: linkId, after: { purpose, channel } });
  // Test mode only records the message: the page must not say "Code sent" (QA ADMIT-03).
  return { ...row, messageId: sent.messageId, channel, mode, testMode, inLog, sentTo: maskPhone(guardian?.phone ?? "") };
}

/**
 * What the parent's page says once a code has gone, or was kept back by Test mode: no staff
 * words there. A kept-back code is refused (ok false) except on a tester's computer, where
 * the code is in the server log and the page goes on to the code box.
 */
export function codeSentWords(r: { testMode: boolean; inLog: boolean }, sent: string): { ok: boolean; message: string; notSent?: boolean } {
  if (!r.testMode) return { ok: true, message: sent };
  return { ok: r.inLog, message: codeNotSentParentWords(r.inLog), notSent: true };
}

/** A tapped confirmation that was used, ran out or was replaced by a newer one. */
export const TAP_GONE = "This confirmation has run out or was already used. Please open your Parent Link and ask again.";

/**
 * What a tapped confirmation is for, before it is used: a new phone, a
 * consent (a consent form or an event), or a pickup the front desk asked the
 * guardian to approve (../front-office/pickup-tap.ts), with its detail; null
 * when the secret does not match an unused one. Only reads.
 */
export async function tapRequest(tx: Tx, linkId: string, secret: string, now = new Date()) {
  if (!TAP_SECRET.test(secret)) return null;
  const row = await tx.parentLinkCode.findFirst({ where: { parentLinkId: linkId, usedAt: null, expiresAt: { gt: now }, codeHash: codeHash(secret, linkId) }, select: { id: true, purpose: true, detail: true, keyHash: true, createdAt: true } });
  if (!row || (row.detail as { via?: string } | null)?.via !== "tap") return null;
  return { id: row.id, purpose: row.purpose as "device" | "consent" | "pickup", detail: (row.detail ?? {}) as Record<string, unknown>, keyHash: row.keyHash, askedAt: row.createdAt };
}

export type CodeCheck = { ok: true; code: { id: string; detail: unknown } } | { ok: false; message: string };

/**
 * Checks a typed code (five wrong tries and the code stops working), or a tap
 * secret from the WhatsApp button. A tap secret is matched by its hash and is
 * not tied to the phone that asked: the browser that opens the guardian's own
 * WhatsApp message is the one confirmed. Either is used once.
 */
export async function checkCode(tx: Tx, ctx: SchoolContext, linkId: string, purpose: "device" | "consent", typed: string, keyHash: string | null, now = new Date()): Promise<CodeCheck> {
  if (TAP_SECRET.test(typed)) {
    const tapped = await tx.parentLinkCode.findFirst({ where: { parentLinkId: linkId, purpose, usedAt: null, expiresAt: { gt: now }, codeHash: codeHash(typed, linkId) } });
    if (!tapped || (tapped.detail as { via?: string } | null)?.via !== "tap") return { ok: false, message: TAP_GONE };
    const claimed = await tx.parentLinkCode.updateMany({ where: { id: tapped.id, usedAt: null }, data: { usedAt: now, attempts: { increment: 1 } } });
    if (claimed.count !== 1) return { ok: false, message: TAP_GONE };
    return { ok: true, code: { id: tapped.id, detail: tapped.detail } };
  }
  const clean = typed.replace(/\D/g, "");
  const row = await tx.parentLinkCode.findFirst({ where: { parentLinkId: linkId, purpose, usedAt: null, expiresAt: { gt: now }, ...(purpose === "device" ? { keyHash: keyHash ?? "-" } : {}) }, orderBy: { createdAt: "desc" } });
  if (!row) return { ok: false, message: "This code has expired. Tap \"Send a new code\"." };
  if (row.attempts >= CODE_TRIES) return { ok: false, message: "Too many wrong codes. Tap \"Send a new code\"." };
  // The try is counted before the compare, in one statement that refuses a sixth (security review
  // 2026-11-15): codes sent at the same moment cannot all pass the five-try check.
  const counted = await tx.parentLinkCode.updateMany({ where: { id: row.id, usedAt: null, attempts: { lt: CODE_TRIES } }, data: { attempts: { increment: 1 } } });
  if (counted.count === 0) return { ok: false, message: "Too many wrong codes. Tap \"Send a new code\"." };
  const expected = Buffer.from(row.codeHash);
  const given = Buffer.from(codeHash(clean, linkId));
  if (clean.length !== 6 || !timingSafeEqual(expected, given)) {
    const left = CODE_TRIES - (await tx.parentLinkCode.findUniqueOrThrow({ where: { id: row.id }, select: { attempts: true } })).attempts;
    await writeAudit(tx, ctx, { action: "code-wrong", recordType: "Parent Link", recordId: linkId, after: { purpose } });
    return { ok: false, message: left > 0 ? `That code is not right. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong codes. Tap \"Send a new code\"." };
  }
  const claimed = await tx.parentLinkCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
  if (claimed.count !== 1) return { ok: false, message: "This code has expired. Tap \"Send a new code\"." };
  return { ok: true, code: { id: row.id, detail: row.detail } };
}

/** Confirms a new phone: the code was right, so this phone's key is remembered. */
export async function confirmDevice(tx: Tx, ctx: SchoolContext, linkId: string, deviceKey: string, typed: string, device: { userAgent: string | null; ipAddress: string | null }, now = new Date()) {
  const byTap = TAP_SECRET.test(typed);
  const keyHash = hashToken(deviceKey);
  const check = await checkCode(tx, ctx, linkId, "device", typed, keyHash, now);
  if (!check.ok) return check;
  const settings = await messageSettings(tx, ctx);
  const dev = await tx.parentLinkDevice.create({
    data: { schoolId: ctx.schoolId, parentLinkId: linkId, keyHash, label: deviceLabel(device.userAgent), ipAddress: device.ipAddress, verifiedAt: now, lastUsedAt: now, expiresAt: new Date(now.getTime() + settings.parentLink.deviceDays * 86400_000) },
  });
  await writeAudit(tx, ctx, { action: "phone-confirmed", recordType: "Parent Link", recordId: linkId, after: { phone: dev.label, how: byTap ? "by a tap on the school's WhatsApp message" : "by a one-time code" }, device: device.userAgent, ipAddress: device.ipAddress });
  return { ok: true as const, deviceId: dev.id, days: settings.parentLink.deviceDays };
}

/** Is this phone still confirmed for this link? Every guardian action checks it again on the server (see guardianAccess). */
export async function confirmedDevice(tx: Tx, linkId: string, deviceKey: string | null, now = new Date()) {
  if (!deviceKey) return null;
  const link = await tx.parentLink.findUnique({ where: { id: linkId } });
  if (!link || link.status !== "ACTIVE") return null;
  const dev = await tx.parentLinkDevice.findFirst({ where: { parentLinkId: linkId, keyHash: hashToken(deviceKey), revokedAt: null, expiresAt: { gt: now } } });
  return dev ? { link, device: dev } : null;
}

export type AccessRefusal = "gone" | "off" | "device" | "section-off";

/** What the guardian is told when an action is refused. */
export const ACCESS_WORDS: Record<AccessRefusal, string> = {
  gone: "This link is no longer active. Please ask the school for a new one.",
  off: "The school has switched off Parent Link for now. To ask a question, message or call the school.",
  device: "Please confirm this phone again: open your Parent Link and follow the steps there.",
  "section-off": "The school has switched this part of Parent Link off. Please call the school.",
};

export type GuardianAccess =
  | { ok: true; ctx: SchoolContext; linkId: string; guardianId: string; timeZone: string }
  | { ok: false; reason: AccessRefusal; message: string };

const refused = (reason: AccessRefusal): GuardianAccess => ({ ok: false, reason, message: ACCESS_WORDS[reason] });

/**
 * The one check before any guardian action or download on Parent Link (pay,
 * receipts and tax invoices, report cards, consent, event consent, PTM
 * booking), made again on the server as when the page opens: the link is
 * active, the school has Parent Link on and is not suspended or closed, the
 * guardian is still on record, this phone is confirmed, and the switch of the
 * section the action belongs to (Message Settings, Parent Link; a missing
 * switch is on) is on. Unlike openLink, it writes nothing. Each action then
 * checks the child with ../students/guardian-access.ts.
 */
export async function guardianAccess(found: LinkFound, deviceKey: string | null, section: string | null, now = new Date()): Promise<GuardianAccess> {
  const ctx: SchoolContext = { schoolId: found.schoolId, userId: null };
  return withSchool(ctx, async (tx) => {
    const check = await linkCheck(tx, ctx, found.linkId);
    if (check.state !== "ok") return refused(check.state);
    if (!(await confirmedDevice(tx, found.linkId, deviceKey, now))) return refused("device");
    if (section && check.settings.parentLink.shows[section] === false) return refused("section-off");
    return { ok: true as const, ctx, linkId: found.linkId, guardianId: check.link.guardianId, timeZone: check.school.timeZone };
  });
}

/** Before a one-time code for a new phone is sent or checked: the link must be usable (no code while Parent Link is off). */
export async function linkUsable(tx: Tx, ctx: SchoolContext, linkId: string): Promise<AccessRefusal | null> {
  const check = await linkCheck(tx, ctx, linkId);
  return check.state === "ok" ? null : check.state;
}

export type { AudienceRule };
export { hashToken, linkUrl, placeholderFor, tokenFor, withHiddenLinks, withRealLinks, appUrl } from "./token";
