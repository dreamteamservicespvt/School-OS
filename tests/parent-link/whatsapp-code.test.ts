// The owner's test parent could not open their Parent Link (live test school,
// 15 Nov 2026): WhatsApp connected for real, SMS not connected, and Meta had
// rejected the "Parent Link code" template (INCORRECT_CATEGORY: it went as
// Utility). Now the rejected code template goes again as an Authentication
// template, the code goes in the body and the copy-code button, and the code
// screen names the channel that really carries it, or says to call the school.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { withSchool } from "@/lib/db";
import { callSchoolWords, createLink, openLink, sendCode } from "@/lib/parent-link/links";
import { tokenFor } from "@/lib/parent-link/token";
import { deliverMessage } from "@/lib/messaging/deliver";
import { submitForApproval } from "@/lib/communication/templates-admin";
import { whatsappReadiness } from "@/lib/communication/whatsapp-ready";
import { PARENT_CODE_NOT_SENT } from "@/lib/dev-codes";
import { EN } from "@/lib/i18n/catalogues/en";
import { hi } from "@/lib/i18n/catalogues/hi";
import { te } from "@/lib/i18n/catalogues/te";
import { makeCommSchool, templateId } from "../communication/fixture";

let s: Awaited<ReturnType<typeof makeCommSchool>>;
let token = "";
let linkId = "";
const device = { userAgent: null, ipAddress: null };

type Call = { url: string; body: Record<string, unknown> };
function stubMeta() {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });
    const json = url.includes("/message_templates") ? { id: "1234", status: "PENDING" } : { messages: [{ id: `wamid.${calls.length}` }] };
    return new Response(JSON.stringify(json), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

const codeVersion = async () => {
  const t = await templateId(s.ctx, "parent-link-code", "whatsapp");
  return withSchool(s.ctx, (tx) => tx.templateVersion.findFirstOrThrow({ where: { templateId: t, isCurrent: true, language: "en" } }));
};

beforeAll(async () => {
  s = await makeCommSchool();
  await withSchool(s.ctx, async (tx) => {
    // WhatsApp connected for real; SMS not connected.
    await tx.messagingChannel.update({ where: { schoolId_channel: { schoolId: s.school.id, channel: "whatsapp" } }, data: { provider: "meta-cloud", environment: "live", config: { phoneNumberId: "1", businessAccountId: "2" } } });
    await tx.messagingChannel.update({ where: { schoolId_channel: { schoolId: s.school.id, channel: "sms" } }, data: { isOn: false } });
  });
  const v = await codeVersion();
  // As on the live school: sent as Utility, rejected.
  await withSchool(s.ctx, (tx) => tx.templateVersion.update({ where: { id: v.id }, data: { whatsappStatus: "REJECTED", whatsappName: "parent_link_code_abc123", whatsappNote: "INCORRECT_CATEGORY" } }));
  const link = await withSchool(s.ctx, (tx) => createLink(tx, s.ctx, s.father.id));
  linkId = link.id;
  token = tokenFor(link.id);
});

describe("a Parent Link code on a real WhatsApp account", () => {
  it("with no channel that can carry it, the screen says to call the school office on its number", async () => {
    const state = await openLink(token, null, device);
    expect(state).toMatchObject({ state: "verify", codeChannel: null, schoolPhone: "9876500001" });
    await expect(withSchool({ schoolId: s.school.id, userId: null }, (tx) => sendCode(tx, { schoolId: s.school.id, userId: null }, linkId, "device"))).rejects.toThrow(PARENT_CODE_NOT_SENT);
    expect(callSchoolWords("9876500001")).toBe("The school could not send your code. Please call the school office on 9876500001.");
    expect(callSchoolWords(null)).toBe(PARENT_CODE_NOT_SENT);
  });

  it("the rejected code template is listed to go again, and goes as an Authentication template under a new name", async () => {
    const v = await codeVersion();
    const ready = await withSchool(s.ctx, (tx) => whatsappReadiness(tx, s.ctx));
    expect(ready.toSend.find((r) => r.versionId === v.id)).toMatchObject({ again: "wrong-type" });
    expect(ready.toEdit.some((r) => r.name === "Parent Link code")).toBe(false);

    const calls = stubMeta();
    const status = await withSchool(s.ctx, (tx) => submitForApproval(tx, s.ctx, v.id));
    expect(status).toBe("PENDING");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toMatch(/\/2\/message_templates$/);
    expect(calls[0].body).toEqual({
      name: expect.stringMatching(/^parent_link_code_[0-9a-f]{6}_otp$/),
      language: "en",
      category: "AUTHENTICATION",
      components: [
        { type: "BODY", add_security_recommendation: true },
        { type: "FOOTER", code_expiration_minutes: 10 },
        { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE" }] },
      ],
    });
    expect((await codeVersion()).whatsappName).toBe(calls[0].body.name);
  });

  it("a Utility template still goes with its own words", async () => {
    const t = await templateId(s.ctx, "absence", "whatsapp");
    const v = await withSchool(s.ctx, (tx) => tx.templateVersion.findFirstOrThrow({ where: { templateId: t, isCurrent: true, language: "en" } }));
    const calls = stubMeta();
    await withSchool(s.ctx, (tx) => submitForApproval(tx, s.ctx, v.id));
    expect(calls[0].body).toMatchObject({ category: "UTILITY", name: expect.not.stringMatching(/_otp$/) });
    // A card: its header first, then its own words.
    expect((calls[0].body.components as { type: string; text?: string }[]).find((c) => c.type === "BODY")).toMatchObject({ type: "BODY", text: expect.stringContaining("{{1}}") });
  });

  it("once approved, the screen says WhatsApp, and the code goes in the body and the copy-code button", async () => {
    const v = await codeVersion();
    await withSchool(s.ctx, (tx) => tx.templateVersion.update({ where: { id: v.id }, data: { whatsappStatus: "APPROVED" } }));
    expect(await openLink(token, null, device)).toMatchObject({ state: "verify", codeChannel: "whatsapp" });

    const job = { schoolId: s.school.id, userId: null };
    const sent = await withSchool(job, (tx) => sendCode(tx, job, linkId, "device", { keyHash: "k" }));
    expect(sent.channel).toBe("whatsapp");
    const calls = stubMeta();
    await withSchool(job, (tx) => deliverMessage(tx, job, { messageId: sent.messageId!, round: "0", chunk: 0 }));
    const msg = calls.find((c) => c.url.endsWith("/1/messages"));
    expect(msg).toBeTruthy();
    const tpl = msg!.body.template as { name: string; components: { type: string; sub_type?: string; index?: string; parameters: { type: string; text: string }[] }[] };
    expect(tpl.name).toBe(v.whatsappName);
    expect(tpl.components).toHaveLength(2);
    const [body, button] = tpl.components;
    expect(body).toMatchObject({ type: "body", parameters: [{ type: "text", text: expect.stringMatching(/^\d{6}$/) }] });
    expect(button).toMatchObject({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: body.parameters[0].text }] });
  });

  it("the new screen words are in English, Hindi and Telugu", () => {
    for (const k of [
      "This link is being opened on a new phone. We will send a 6-digit code on WhatsApp to {phone}.",
      "We sent a 6-digit code on WhatsApp to {phone}.",
      "We sent a 6-digit code by SMS to {phone}.",
      "The school could not send your code. Please call the school office on {phone}.",
      "Rejected by WhatsApp: wrong type. Sent again as a code message.",
    ] as const) {
      expect(EN).toContain(k);
      expect(hi[k], k).toBeTruthy();
      expect(te[k], k).toBeTruthy();
    }
  });
});
