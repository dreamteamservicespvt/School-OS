// Sending WhatsApp cards on a real WhatsApp account (Meta's API stubbed):
// - a card goes for approval with the school's name in the footer and its phone in "Call school",
//   and the parts given to Meta are saved with the version;
// - each link button gets the parent's own secret, at the button's own position;
// - a parent whose language version is not approved gets the approved English card, never plain text
//   (live test 15 Nov 2026, item 7); with no approved version at all nothing is sent and the reason says why;
// - a Front Office message goes in its own approved card, never as plain text.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { withSchool } from "@/lib/db";
import { sendAutomatic } from "@/lib/messaging";
import { deliverMessage } from "@/lib/messaging/deliver";
import { submitForApproval } from "@/lib/communication/templates-admin";
import { tokenFor } from "@/lib/parent-link/token";
import { NO_LINK_SUFFIX } from "@/lib/messaging/button-links";
import { messageVisitor } from "@/lib/front-office/notify";
import { makeCommSchool, templateId } from "../communication/fixture";

let s: Awaited<ReturnType<typeof makeCommSchool>>;
type Call = { url: string; body: Record<string, unknown> };
let calls: Call[] = [];

function stubMeta() {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    let body: Record<string, unknown> = {};
    try { body = JSON.parse(String(init?.body ?? "{}")); } catch { /* not JSON */ }
    calls.push({ url: String(url), body });
    const json = String(url).includes("/message_templates") ? { id: "1234", status: "APPROVED" } : { messages: [{ id: `wamid.${calls.length}` }] };
    return new Response(JSON.stringify(json), { status: 200, headers: { "Content-Type": "application/json" } });
  }));
}
afterEach(() => vi.unstubAllGlobals());

const versionOf = async (key: string, language: string) => {
  const t = await templateId(s.ctx, key, "whatsapp");
  return withSchool(s.ctx, (tx) => tx.templateVersion.findFirstOrThrow({ where: { templateId: t, isCurrent: true, language } }));
};
const approve = async (key: string, language: string) => {
  stubMeta();
  const v = await versionOf(key, language);
  expect(await withSchool(s.ctx, (tx) => submitForApproval(tx, s.ctx, v.id))).toBe("APPROVED");
  return calls.find((c) => c.url.includes("/message_templates"))!.body;
};
const deliver = async (messageId: string) => {
  stubMeta();
  await withSchool({ schoolId: s.school.id, userId: null }, (tx) => deliverMessage(tx, { schoolId: s.school.id, userId: null }, { messageId, round: "0", chunk: 0 }), { timeout: 20_000 });
  return calls.filter((c) => c.url.endsWith("/messages")).map((c) => c.body as { type: string; template?: { name: string; language: { code: string }; components: Record<string, unknown>[] } });
};
const sendResult = (studentId: string, n: string) => withSchool(s.ctx, (tx) => sendAutomatic(tx, s.ctx, { rule: "result", event: { key: `result:${n}:${studentId}`, label: "Results" }, to: { guardiansOf: [studentId] }, values: { exam_name: "Half Yearly Exam" } }));

beforeAll(async () => {
  s = await makeCommSchool();
  await withSchool(s.ctx, (tx) => tx.messagingChannel.update({ where: { schoolId_channel: { schoolId: s.school.id, channel: "whatsapp" } }, data: { provider: "meta-cloud", environment: "live", config: { phoneNumberId: "1", businessAccountId: "2" } } }));
  await withSchool(s.ctx, (tx) => tx.school.update({ where: { id: s.school.id }, data: { name: "Chaitanya School" } }));
});

describe("a card on a real WhatsApp account", () => {
  it("goes for approval with the footer, the Call school phone and realistic samples, and keeps what Meta was given", async () => {
    const sent = await approve("result", "en");
    const comps = sent.components as Record<string, unknown>[];
    expect(sent.name).toMatch(/^results_published_[0-9a-f]{6}$/);
    expect(comps[0]).toEqual({ type: "HEADER", format: "TEXT", text: "Results are out" });
    expect(comps.find((c) => c.type === "FOOTER")).toEqual({ type: "FOOTER", text: "Chaitanya School · School OS" });
    expect(JSON.stringify(comps)).not.toMatch(/sample (guardian|student)/);
    expect(comps.find((c) => c.type === "BUTTONS")).toMatchObject({ buttons: [{ type: "URL", text: "See results" }] });
    const v = await versionOf("result", "en");
    expect((v.whatsappCard as { submitted: unknown }).submitted).toEqual({ header: "text", buttons: [{ type: "URL", target: "parent-link", blank: "parent_link" }] });
  });

  it("the Telugu parent gets the Telugu card with their own Parent Link as the button", async () => {
    await approve("result", "te");
    const r = await sendResult(s.priya.id, "a");
    expect(r.status).toBe("sent");
    const link = await withSchool(s.ctx, (tx) => tx.parentLink.findFirstOrThrow({ where: { guardianId: s.teluguMother.id, status: "ACTIVE" } }));
    const [m] = await deliver((r as { result: { messageId: string } }).result.messageId);
    expect(m.type).toBe("template");
    expect(m.template!.language.code).toBe("te");
    expect(m.template!.components).toEqual([
      { type: "body", parameters: [{ type: "text", text: "Padma Reddy" }, { type: "text", text: "Priya Reddy" }, { type: "text", text: expect.stringContaining("5") }, { type: "text", text: "Half Yearly Exam" }] },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: tokenFor(link.id) }] },
    ]);
  });

  it("when the parent's language is no longer approved, the approved English card goes, never plain text", async () => {
    const r = await sendResult(s.priya.id, "b");
    const te = await versionOf("result", "te");
    await withSchool(s.ctx, (tx) => tx.templateVersion.update({ where: { id: te.id }, data: { whatsappStatus: "REJECTED", whatsappNote: "INVALID_FORMAT" } }));
    const [m] = await deliver((r as { result: { messageId: string } }).result.messageId);
    expect(m.type).toBe("template");
    expect(m.template!.language.code).toBe("en");
    expect(m.template!.name).toBe((await versionOf("result", "en")).whatsappName);
  });

  it("with no approved version at all, nothing is sent and the reason says why", async () => {
    const r = await sendResult(s.priya.id, "c");
    const en = await versionOf("result", "en");
    await withSchool(s.ctx, (tx) => tx.templateVersion.updateMany({ where: { templateId: en.templateId }, data: { whatsappStatus: "REJECTED" } }));
    const messages = await deliver((r as { result: { messageId: string } }).result.messageId);
    expect(messages).toEqual([]);
    const rec = await withSchool(s.ctx, (tx) => tx.messageRecipient.findFirstOrThrow({ where: { messageId: (r as { result: { messageId: string } }).result.messageId } }));
    expect(rec.status).toBe("FAILED");
    expect(rec.failReason).toMatch(/has not approved this message's template/);
  });

  it("a link button sits at its own position: index 1 when the phone button comes first", async () => {
    await approve("exam-reminder", "en");
    const v = await versionOf("exam-reminder", "en");
    await withSchool(s.ctx, (tx) => tx.templateVersion.update({ where: { id: v.id }, data: { whatsappCard: { ...(v.whatsappCard as object), submitted: { header: "text", buttons: [{ type: "PHONE" }, { type: "URL", target: "parent-link", blank: "parent_link" }] } } } }));
    const r = await withSchool(s.ctx, (tx) => sendAutomatic(tx, s.ctx, { rule: "exam-reminder", event: { key: `exam:${s.kiran.id}`, label: "Exams" }, to: { guardiansOf: [s.kiran.id] }, values: { exam_name: "Half Yearly Exam", date: "20-11-2026" } }));
    const [m] = await deliver((r as { result: { messageId: string } }).result.messageId);
    const button = m.template!.components.find((c) => c.type === "button") as { index: string; parameters: { text: string }[] };
    expect(button.index).toBe("1");
    expect(button.parameters[0].text).not.toBe(NO_LINK_SUFFIX);
  });
});

describe("Front Office on a real WhatsApp account", () => {
  it("an appointment confirmation waits for its own approved card, and then goes in it", async () => {
    const msg = { to: { name: "Ramesh", phone: "9876543210" }, trigger: "Appointment confirmation" as const, text: "Your appointment with Mrs Aswini is on Mon 16 Nov, 11:00 AM for 30 minutes.", about: { recordType: "Appointment", recordId: s.school.id } };
    const before = await withSchool(s.ctx, (tx) => messageVisitor(tx, s.ctx, msg));
    expect(before.status).toBe("skipped");
    expect(before.note).toMatch(/has not approved the "Appointment confirmation" template/);
    await approve("appointment-confirmed", "en");
    const after = await withSchool(s.ctx, (tx) => messageVisitor(tx, s.ctx, msg));
    expect(after.status).toBe("queued");
    const m = await withSchool(s.ctx, (tx) => tx.message.findFirstOrThrow({ where: { trigger: "Appointment confirmation" }, orderBy: { createdAt: "desc" } }));
    const [sent] = await deliver(m.id);
    expect(sent.type).toBe("template");
    expect(sent.template!.components[0]).toEqual({ type: "body", parameters: [{ type: "text", text: "Ramesh" }, { type: "text", text: msg.text }] });
  });
});
