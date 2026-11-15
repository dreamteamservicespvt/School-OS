// "Tap to confirm" (live test 16 Nov 2026): Meta does not deliver code
// (Authentication) messages to WhatsApp users on +91 numbers, so a Parent Link
// code never came and no parent could open their link. On WhatsApp the
// parent's own Parent Link card comes again, its button carrying a one-time
// secret (/p/<token>.<secret>); the browser that opens it and taps is
// confirmed, or the consent the parent asked for is recorded. SMS keeps the
// 6-digit code.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { withSchool } from "@/lib/db";
import {
  ACCESS_WORDS, checkCode, confirmedDevice, createLink, findLink, newDeviceKey, openLink, revokeLink, sendCode, splitTap, TAP_GONE, TAP_SECRET, tokenFor,
} from "@/lib/parent-link/links";
import { askConsentCode } from "@/lib/parent-link/consent";
import { confirmTap, tapView } from "@/lib/parent-link/tap";
import { deliverMessage } from "@/lib/messaging/deliver";
import { whatsappReason } from "@/lib/messaging/providers/whatsapp";
import { hashToken } from "@/lib/parent-link/token";
import { EN } from "@/lib/i18n/catalogues/en";
import { hi } from "@/lib/i18n/catalogues/hi";
import { te } from "@/lib/i18n/catalogues/te";
import { PARENT_BROWSER_WORDS } from "@/lib/parent-link/words";
import { makeCommSchool, templateId } from "../communication/fixture";

let s: Awaited<ReturnType<typeof makeCommSchool>>;
let other: Awaited<ReturnType<typeof makeCommSchool>>;
let linkId = "";
let token = "";
const device = { userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/120", ipAddress: "10.0.0.9" };
const job = () => ({ schoolId: s.school.id, userId: null });

type Call = { url: string; body: Record<string, unknown> };
function stubMeta() {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
    return new Response(JSON.stringify({ messages: [{ id: `wamid.${calls.length}` }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

type Tpl = { name: string; components: { type: string; sub_type?: string; index?: string; parameters: { type: string; text: string }[] }[] };

/** Sends the confirmation and hands it to (stubbed) WhatsApp: the template sent, and the secret from its button. */
async function sendTap(send: () => Promise<{ messageId: string | null; mode: string }>) {
  const sent = await send();
  expect(sent.mode).toBe("tap");
  const calls = stubMeta();
  await withSchool(job(), (tx) => deliverMessage(tx, job(), { messageId: sent.messageId!, round: "0", chunk: 0 }));
  const msg = calls.find((c) => c.url.endsWith("/1/messages"));
  expect(msg).toBeTruthy();
  const tpl = msg!.body.template as Tpl;
  const button = tpl.components.find((c) => c.type === "button");
  const value = button!.parameters[0].text;
  const tap = splitTap(value);
  expect(tap.token).toBe(token);
  expect(tap.secret).toMatch(TAP_SECRET);
  // Nothing stored holds the secret: the message, its recipient row and its values keep the link code and the mask.
  const stored = await withSchool(s.ctx, async (tx) => {
    const m = await tx.message.findUniqueOrThrow({ where: { id: sent.messageId! } });
    const r = await tx.messageRecipient.findMany({ where: { messageId: m.id } });
    const codes = await tx.parentLinkCode.findMany({ where: { messageId: m.id } });
    return JSON.stringify({ m, r, codes });
  });
  expect(stored).not.toContain(tap.secret!);
  expect(stored).not.toContain(token);
  expect(stored).toContain("••••••");
  // The body's words never carry it either.
  for (const c of tpl.components.filter((x) => x.type !== "button")) expect(JSON.stringify(c)).not.toContain(tap.secret!);
  return { secret: tap.secret!, tpl };
}

beforeAll(async () => {
  s = await makeCommSchool();
  other = await makeCommSchool();
  await withSchool(s.ctx, async (tx) => {
    // WhatsApp connected for real; SMS switched off: WhatsApp carries the confirmation.
    await tx.messagingChannel.update({ where: { schoolId_channel: { schoolId: s.school.id, channel: "whatsapp" } }, data: { provider: "meta-cloud", environment: "live", config: { phoneNumberId: "1", businessAccountId: "2" } } });
    await tx.messagingChannel.update({ where: { schoolId_channel: { schoolId: s.school.id, channel: "sms" } }, data: { isOn: false } });
  });
  const link = await withSchool(s.ctx, (tx) => createLink(tx, s.ctx, s.father.id));
  linkId = link.id;
  token = tokenFor(link.id);
});

describe("tap to confirm a new phone on WhatsApp", () => {
  it("cannot go before WhatsApp approved the Parent Link card: the parent is told to call the school", async () => {
    expect(await openLink(token, null, device)).toMatchObject({ state: "verify", codeChannel: null, tap: false });
  });

  it("once the card is approved, the parent's own Parent Link goes with a one-time secret in its button", async () => {
    const t = await templateId(s.ctx, "parent-link", "whatsapp");
    await withSchool(s.ctx, (tx) => tx.templateVersion.updateMany({ where: { templateId: t, isCurrent: true }, data: { whatsappStatus: "APPROVED", whatsappName: "parent_link_abc123", whatsappNote: null } }));
    expect(await openLink(token, null, device)).toMatchObject({ state: "verify", codeChannel: "whatsapp", tap: true });
    const { tpl } = await sendTap(() => withSchool(job(), (tx) => sendCode(tx, job(), linkId, "device", { keyHash: "asking-phone" })));
    expect(tpl.name).toBe("parent_link_abc123");
  });

  it("the browser that opens it and taps is confirmed, once; the page alone changes nothing", async () => {
    const { secret } = await sendTap(() => withSchool(job(), (tx) => sendCode(tx, job(), linkId, "device", { keyHash: "asking-phone" })));
    // Opening the page only reads (a link preview changes nothing).
    expect(await withSchool(s.ctx, (tx) => tapView(tx, linkId, secret))).toMatchObject({ kind: "device", sameBrowser: false });
    expect(await withSchool(s.ctx, (tx) => tapView(tx, linkId, secret))).toMatchObject({ kind: "device", sameBrowser: false });

    const found = (await findLink(token))!;
    // A wrong secret of the right shape does nothing.
    const wrong = secret.slice(0, -1) + (secret.endsWith("A") ? "B" : "A");
    expect(await confirmTap(found, wrong, newDeviceKey(), device)).toEqual({ ok: false, message: TAP_GONE });
    // A typed 6-digit guess cannot use it.
    expect((await withSchool(s.ctx, (tx) => checkCode(tx, s.ctx, linkId, "device", "123456", null))).ok).toBe(false);

    const key = newDeviceKey();
    expect(await confirmTap(found, secret, key, device)).toMatchObject({ ok: true, kind: "device" });
    expect(await withSchool(s.ctx, (tx) => confirmedDevice(tx, linkId, key))).toBeTruthy();
    expect(await openLink(token, key, device)).toMatchObject({ state: "open" });
    const audit = await withSchool(s.ctx, (tx) => tx.auditLogEntry.findFirstOrThrow({ where: { recordId: linkId, action: "phone-confirmed" }, orderBy: { at: "desc" } }));
    expect(JSON.stringify(audit.after)).toContain("by a tap on the school's WhatsApp message");

    // Used once.
    expect(await confirmTap(found, secret, newDeviceKey(), device)).toEqual({ ok: false, message: TAP_GONE });
    expect(await withSchool(s.ctx, (tx) => tapView(tx, linkId, secret))).toBeNull();
  });

  it("warns unless the tapping browser is the one that asked, naming the phone that asked", async () => {
    const key = "k".repeat(43);
    const { secret } = await sendTap(() => withSchool(job(), (tx) => sendCode(tx, job(), linkId, "device", { keyHash: hashToken(key), detail: { asked: "Android phone, Chrome" } })));
    expect(await withSchool(s.ctx, (tx) => tapView(tx, linkId, secret, key))).toMatchObject({ kind: "device", sameBrowser: true, askedOn: "Android phone, Chrome" });
    expect(await withSchool(s.ctx, (tx) => tapView(tx, linkId, secret, "x".repeat(43)))).toMatchObject({ kind: "device", sameBrowser: false, askedOn: "Android phone, Chrome", askedMinutesAgo: 0 });
    expect(await withSchool(s.ctx, (tx) => tapView(tx, linkId, secret, null))).toMatchObject({ sameBrowser: false });
  });

  it("a WhatsApp failure reason never keeps a Parent Link address", () => {
    expect(whatsappReason(999, "Bad value https://x.app/p/AbCdEf0123456789xyz.SECRETsecret0123456789ab").reason).not.toMatch(/AbCdEf|SECRET/);
  });

  it("runs out with the code minutes, and a newer one replaces it", async () => {
    const { secret: first } = await sendTap(() => withSchool(job(), (tx) => sendCode(tx, job(), linkId, "device")));
    const found = (await findLink(token))!;
    const later = new Date(Date.now() + 60 * 60_000);
    expect(await confirmTap(found, first, newDeviceKey(), device, later)).toEqual({ ok: false, message: TAP_GONE });
    const { secret: second } = await sendTap(() => withSchool(job(), (tx) => sendCode(tx, job(), linkId, "device")));
    expect(await confirmTap(found, first, newDeviceKey(), device)).toEqual({ ok: false, message: TAP_GONE });
    expect(await confirmTap(found, second, newDeviceKey(), device)).toMatchObject({ ok: true, kind: "device" });
  });

  it("never works for another school's link", async () => {
    const { secret } = await sendTap(() => withSchool(job(), (tx) => sendCode(tx, job(), linkId, "device")));
    const theirs = await withSchool(other.ctx, (tx) => createLink(tx, other.ctx, other.father.id));
    const found = (await findLink(tokenFor(theirs.id)))!;
    expect(found.schoolId).toBe(other.school.id);
    expect(await confirmTap(found, secret, newDeviceKey(), device)).toEqual({ ok: false, message: TAP_GONE });
    expect(await withSchool(other.ctx, (tx) => tapView(tx, theirs.id, secret))).toBeNull();
  });

  it("stops at once when the link is revoked", async () => {
    const { secret } = await sendTap(() => withSchool(job(), (tx) => sendCode(tx, job(), linkId, "device")));
    await withSchool(s.ctx, (tx) => revokeLink(tx, s.ctx, linkId, "Lost phone"));
    expect(await confirmTap({ linkId, schoolId: s.school.id }, secret, newDeviceKey(), device)).toEqual({ ok: false, message: ACCESS_WORDS.gone });
    // A new link for the next tests.
    const link = await withSchool(s.ctx, (tx) => createLink(tx, s.ctx, s.father.id));
    linkId = link.id;
    token = tokenFor(link.id);
  });
});

describe("tap to confirm a consent on WhatsApp", () => {
  it("shows what is being agreed, then records it once, for the parent's own children", async () => {
    const text = await withSchool(s.ctx, (tx) => tx.consentText.create({ data: { schoolId: s.school.id, consentType: "photo", title: "Photos of my child", version: 1, text: { en: "We may use photos." } } }));
    const { secret } = await sendTap(() => withSchool(job(), (tx) => askConsentCode(tx, job(), linkId, s.father.id, { consentTextId: text.id, studentIds: [s.ravi.id], action: "give" })));
    expect(await withSchool(s.ctx, (tx) => tapView(tx, linkId, secret))).toEqual({ kind: "consent", title: "Photos of my child", action: "give" });
    const found = (await findLink(token))!;
    expect(await confirmTap(found, secret, newDeviceKey(), device)).toEqual({ ok: true, kind: "consent", title: "Photos of my child", action: "give" });
    const recs = await withSchool(s.ctx, (tx) => tx.consentRecord.findMany({ where: { guardianId: s.father.id, consentTextId: text.id } }));
    expect(recs.map((r) => r.studentId)).toEqual([s.ravi.id]);
    const audit = await withSchool(s.ctx, (tx) => tx.auditLogEntry.findFirstOrThrow({ where: { recordId: recs[0].id, action: "consent-given" } }));
    expect(JSON.stringify(audit.after)).toContain("confirmed by a tap on the school's WhatsApp message");
    expect(await confirmTap(found, secret, newDeviceKey(), device)).toEqual({ ok: false, message: TAP_GONE });
  });
});

describe("SMS keeps the 6-digit code", () => {
  it("with SMS on, the code goes by SMS, to type", async () => {
    await withSchool(s.ctx, (tx) => tx.messagingChannel.update({ where: { schoolId_channel: { schoolId: s.school.id, channel: "sms" } }, data: { isOn: true } }));
    const sms = await templateId(s.ctx, "parent-link-code", "sms");
    await withSchool(s.ctx, (tx) => tx.templateVersion.updateMany({ where: { templateId: sms, isCurrent: true }, data: { dltTemplateId: "1207000000000000001" } }));
    expect(await openLink(token, null, device)).toMatchObject({ codeChannel: "sms", tap: false });
    const sent = await withSchool(job(), (tx) => sendCode(tx, job(), linkId, "device"));
    expect(sent).toMatchObject({ channel: "sms", mode: "code" });
    await withSchool(s.ctx, (tx) => tx.messagingChannel.update({ where: { schoolId_channel: { schoolId: s.school.id, channel: "sms" } }, data: { isOn: false } }));
  });
});

describe("the tap's address and words", () => {
  it("only a 24-character secret after the last dot is a tap", () => {
    expect(splitTap("abc")).toEqual({ token: "abc", secret: null });
    expect(splitTap("abc.short")).toEqual({ token: "abc.short", secret: null });
    expect(splitTap("abc.AAAAAAAAAAAAAAAAAAAAAAAA")).toEqual({ token: "abc", secret: "AAAAAAAAAAAAAAAAAAAAAAAA" });
    expect(splitTap("abc.AAAAAAAAAAAAAAAAAAAAAAA!")).toEqual({ token: "abc.AAAAAAAAAAAAAAAAAAAAAAA!", secret: null });
  });

  it("the parent's new words are in English, Hindi and Telugu, and reach the phone", () => {
    for (const k of [
      "Open your Parent Link on this phone",
      "Open my Parent Link",
      "Opening your Parent Link",
      "Send to my WhatsApp",
      "Send it again",
      "We sent your Parent Link to your WhatsApp ({phone}). Open that new message on this phone and tap Open Parent Link.",
      "This link is being opened on a new phone. To confirm it’s you, we will send your Parent Link to your WhatsApp ({phone}).",
      TAP_GONE,
    ]) {
      expect(EN).toContain(k);
      expect((hi as Record<string, string>)[k], k).toBeTruthy();
      expect((te as Record<string, string>)[k], k).toBeTruthy();
      expect(PARENT_BROWSER_WORDS, k).toContain(k);
    }
  });
});
