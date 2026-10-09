// Message Templates (versions, approved WhatsApp text locked, SMS without a
// DLT ID saved as a draft), channel keys stored encrypted, SMS needing DLT
// details, credits, consent requests and the Parent Link list figures.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { saveTemplate, submitForApproval, TemplateProblem } from "@/lib/communication/templates-admin";
import { addCredits, ChannelProblem, checkChannel, saveChannel, saveDlt } from "@/lib/messaging/channel-admin";
import { channelSecrets } from "@/lib/messaging/channels";
import { creditBalances } from "@/lib/messaging/credits";
import { planMessage } from "@/lib/messaging/send";
import { requestConsent, requestStatus } from "@/lib/parent-link/consent";
import { createLink, revokeLink } from "@/lib/parent-link/links";
import { guardianIdsIn, linkSummary } from "@/lib/communication/parent-link-admin";
import { makeCommSchool } from "./fixture";

let s: Awaited<ReturnType<typeof makeCommSchool>>;

beforeAll(async () => {
  s = await makeCommSchool();
});

describe("message templates", () => {
  it("each save makes a new version and keeps the old one", async () => {
    const { id } = await withSchool(s.ctx, (tx) => saveTemplate(tx, s.ctx, null, { name: "Sports day", category: "events", channel: "whatsapp", texts: [{ language: "en", subject: null, body: "Sports day for {student_name}", dltTemplateId: null }] }));
    const r = await withSchool(s.ctx, (tx) => saveTemplate(tx, s.ctx, id, { name: "Sports day", category: "events", channel: "whatsapp", texts: [{ language: "en", subject: null, body: "Sports day on Friday for {student_name}", dltTemplateId: null }] }));
    expect(r.changed).toEqual(["en"]);
    const versions = await withSchool(s.ctx, (tx) => tx.templateVersion.findMany({ where: { templateId: id }, orderBy: { version: "asc" } }));
    expect(versions.map((v) => [v.version, v.isCurrent])).toEqual([[1, false], [2, true]]);
    expect(versions[0].body).toBe("Sports day for {student_name}");
  });

  it("refuses unknown blanks", async () => {
    await expect(withSchool(s.ctx, (tx) => saveTemplate(tx, s.ctx, null, { name: "Bad", category: "general", channel: "app", texts: [{ language: "en", subject: "x", body: "Hello {studnt_name}", dltTemplateId: null }] }))).rejects.toThrow(/Unknown blank/);
  });

  it("locks approved WhatsApp text", async () => {
    const { id } = await withSchool(s.ctx, (tx) => saveTemplate(tx, s.ctx, null, { name: "Locked one", category: "general", channel: "whatsapp", texts: [{ language: "en", subject: null, body: "Hello {guardian_name}", dltTemplateId: null }] }));
    const v = await withSchool(s.ctx, (tx) => tx.templateVersion.findFirstOrThrow({ where: { templateId: id, isCurrent: true } }));
    expect(await withSchool(s.ctx, (tx) => submitForApproval(tx, s.ctx, v.id))).toBe("APPROVED"); // test mode
    await expect(withSchool(s.ctx, (tx) => saveTemplate(tx, s.ctx, id, { name: "Locked one", category: "general", channel: "whatsapp", texts: [{ language: "en", subject: null, body: "Hi {guardian_name}", dltTemplateId: null }] }))).rejects.toBeInstanceOf(TemplateProblem);
  });

  it("an SMS template without a DLT ID is saved but cannot be used; adding the ID makes it usable", async () => {
    const { id } = await withSchool(s.ctx, (tx) => saveTemplate(tx, s.ctx, null, { name: "SMS draft", category: "general", channel: "sms", texts: [{ language: "en", subject: null, body: "Dear parent, school is closed today.", dltTemplateId: null }] }));
    const input = { to: { guardianIds: [s.father.id] }, channels: ["sms" as const], templates: { sms: id } };
    const draft = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, input));
    expect(draft.problems.join(" ")).toMatch(/has no DLT template ID/);
    await withSchool(s.ctx, (tx) => saveTemplate(tx, s.ctx, id, { name: "SMS draft", category: "general", channel: "sms", texts: [{ language: "en", subject: null, body: "Dear parent, school is closed today.", dltTemplateId: "1107160000010000555" }] }));
    const plan = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, input));
    expect(plan.problems).toEqual([]);
    expect(plan.rows.length).toBe(1);
  });
});

describe("channels and credits", () => {
  it("stores provider keys encrypted, keeps them when left blank, and never writes them to the audit log", async () => {
    await withSchool(s.ctx, (tx) => saveChannel(tx, s.ctx, "sms", { provider: "msg91", live: false, isOn: true, config: { senderId: "SUNSCH" }, secrets: { authKey: "auth-key-secret-9999", webhookKey: "hook-key-secret-1111" }, lowCreditAlert: 50 }));
    const row = await withSchool(s.ctx, (tx) => tx.messagingChannel.findUniqueOrThrow({ where: { schoolId_channel: { schoolId: s.school.id, channel: "sms" } } }));
    expect(row.secretsEnc).not.toContain("auth-key-secret-9999");
    await withSchool(s.ctx, (tx) => saveChannel(tx, s.ctx, "sms", { provider: "msg91", live: false, isOn: true, config: { senderId: "SUNSCH" }, secrets: { authKey: "" }, lowCreditAlert: 60 }));
    expect((await withSchool(s.ctx, (tx) => channelSecrets(tx, s.ctx, "sms"))).authKey).toBe("auth-key-secret-9999");
    const audit = await withSchool(s.ctx, (tx) => tx.auditLogEntry.findMany({ where: { schoolId: s.school.id, recordType: "Messaging Channel" } }));
    expect(JSON.stringify(audit)).not.toContain("auth-key-secret-9999");
  });

  it("SMS cannot be switched on without the DLT entity ID and sender header", async () => {
    await expect(withSchool(s.ctx, (tx) => saveDlt(tx, s.ctx, "", ""))).rejects.toBeInstanceOf(ChannelProblem);
    const other = await makeCommSchool({ channelsOn: false });
    await withSchool(other.ctx, (tx) => tx.school.update({ where: { id: other.school.id }, data: { smsDltEntityId: null, smsSenderHeader: null } }));
    const errors = await withSchool(other.ctx, (tx) => checkChannel(tx, other.ctx, "sms", { provider: "sandbox", live: false, isOn: true, config: {}, secrets: {}, lowCreditAlert: 100 }));
    expect(errors.isOn).toMatch(/DLT entity ID/);
  });

  it("adds credits and records corrections, never deleting entries", async () => {
    const before = await withSchool(s.ctx, (tx) => creditBalances(tx, s.ctx));
    await withSchool(s.ctx, (tx) => addCredits(tx, s.ctx, "sms", 500, "Invoice 12"));
    await withSchool(s.ctx, (tx) => addCredits(tx, s.ctx, "sms", -20, "typed too many"));
    const after = await withSchool(s.ctx, (tx) => creditBalances(tx, s.ctx));
    expect(after.sms - before.sms).toBe(480);
    await expect(withSchool(s.ctx, (tx) => addCredits(tx, s.ctx, "sms", 0, "nothing"))).rejects.toBeInstanceOf(ChannelProblem);
  });
});

describe("Parent Link for staff", () => {
  it("counts active, revoked and never opened links", async () => {
    const a = await withSchool(s.ctx, (tx) => createLink(tx, s.ctx, s.father.id));
    await withSchool(s.ctx, (tx) => createLink(tx, s.ctx, s.mother.id));
    await withSchool(s.ctx, (tx) => revokeLink(tx, s.ctx, a.id, "Lost phone"));
    const sum = await withSchool(s.ctx, (tx) => linkSummary(tx, s.ctx));
    expect(sum.active).toBe(1);
    expect(sum.revoked).toBe(1);
    expect(sum.never).toBe(1);
  });

  it("picks guardians by section, and a consent request shows given, waiting and withdrawn", async () => {
    const inA = await withSchool(s.ctx, (tx) => guardianIdsIn(tx, s.ctx, { sectionIds: [s.a.id] }));
    expect(inA).toContain(s.teluguMother.id);
    expect(inA).not.toContain(s.otherFather.id);
    const text = await withSchool(s.ctx, (tx) => tx.consentText.create({ data: { schoolId: s.school.id, consentType: "photo", title: "Photo consent", version: 1, text: { en: "We may use photos." } } }));
    const { request } = await withSchool(s.ctx, (tx) => requestConsent(tx, s.ctx, { consentTextId: text.id, guardianIds: inA, audienceLabel: "Class 5 A", replyBy: new Date(Date.now() + 7 * 86400_000) }));
    await withSchool(s.ctx, (tx) => tx.consentRecord.create({ data: { schoolId: s.school.id, guardianId: s.teluguMother.id, studentId: s.priya.id, consentType: "photo", consentTextId: text.id, textVersion: 1, how: "office" } }));
    const st = await withSchool(s.ctx, (tx) => requestStatus(tx, s.ctx, request.id));
    expect(st.given).toEqual([s.teluguMother.id]);
    expect(st.waiting.length).toBe(inA.length - 1);
    expect(st.withdrawn).toEqual([]);
  });
});
