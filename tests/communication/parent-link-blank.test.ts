// The {parent_link} blank (owner's phone test 15 Nov 2026: "Please open your Parent Link to read
// it and agree" reached a parent with no link in it). Every ready text that sends a parent to
// Parent Link carries a link blank; at send time it holds the parent's own Parent Link (made
// first for a parent who has none), stored only as a placeholder; with Parent Link switched off
// it says "Ask the school office for your Parent Link."; and a school whose WhatsApp already
// approved the old words gets the new words as a new version under a new WhatsApp name, while
// the approved words keep going until WhatsApp approves the new ones.
import { describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { READY_TEMPLATES, variablesIn, whatsappProblems } from "@/lib/messaging/templates";
import { PAST_READY_WHATSAPP } from "@/lib/messaging/ready-history";
import { readyCard } from "@/lib/messaging/ready-whatsapp";
import { planMessage, sendAutomatic } from "@/lib/messaging";
import { updateSettings } from "@/lib/messaging/settings";
import { requestConsent } from "@/lib/parent-link/consent";
import { linkUrl, placeholderFor, tokenFor, withHiddenLinks, withRealLinks } from "@/lib/parent-link/token";
import { NO_PARENT_LINK } from "@/lib/parent-link/blank";
import { makeReadyForWhatsapp, readyWhatsappWords, whatsappReadiness } from "@/lib/communication/whatsapp-ready";
import { submitForApproval, whatsappNameFor } from "@/lib/communication/templates-admin";
import { makeCommSchool, templateId } from "./fixture";

const LINK_BLANKS = ["link", "parent_link", "how_to_pay"];
// One-time code texts name Parent Link because the parent is on its page already, typing the code.
const CODE_KEYS = new Set(["parent-link-code"]);

describe("every ready text that sends a parent to Parent Link has a link blank", () => {
  const texts = READY_TEMPLATES.flatMap((t) => Object.entries(t.texts).map(([language, body]) => ({ name: `${t.key} ${t.channel} (${language})`, key: t.key, channel: t.channel, language, body })));
  const mentions = texts.filter((t) => /Parent Link/i.test(t.body) && !CODE_KEYS.has(t.key));

  it("finds the texts the owner's test was about", () => {
    const keys = new Set(mentions.map((t) => t.key));
    for (const k of ["consent-request", "exam-reminder", "result", "notice", "parent-link"]) expect(keys.has(k), k).toBe(true);
  });

  it.each(mentions)("$name has a link blank", ({ body }) => {
    expect(variablesIn(body).some((b) => LINK_BLANKS.includes(b))).toBe(true);
  });

  // A WhatsApp card's link line is its button (src/lib/messaging/card.ts).
  it.each(mentions.filter((t) => t.channel === "whatsapp"))("$name is a text WhatsApp takes", ({ key, language, body }) => {
    expect(whatsappProblems(body, readyCard(key, language))).toEqual([]);
  });

  // Each language of these templates fills the same blanks (else a parent's language would miss one).
  it.each(READY_TEMPLATES.filter((t) => ["consent-request", "exam-reminder", "result", "notice"].includes(t.key)).map((t) => ({ name: `${t.key} ${t.channel}`, t })))("$name has the same blanks in every language", ({ t }) => {
    const sets = Object.values(t.texts).map((b) => [...variablesIn(b)].sort().join(","));
    expect(new Set(sets).size).toBe(1);
  });
});

async function recipientOf(ctx: { schoolId: string; userId: string | null }, messageId: string, guardianId: string) {
  return withSchool(ctx, (tx) => tx.messageRecipient.findFirstOrThrow({ where: { messageId, guardianId } }));
}

describe("at send time", () => {
  it("a consent request carries each parent's own Parent Link, made for a parent who had none, and history keeps only the placeholder", async () => {
    const s = await makeCommSchool();
    const text = await withSchool(s.ctx, (tx) => tx.consentText.create({ data: { schoolId: s.school.id, consentType: "photo", title: "Photos of my child", version: 1, text: { en: "We may use photos." } } }));
    const r = await withSchool(s.ctx, (tx) => requestConsent(tx, s.ctx, { consentTextId: text.id, guardianIds: [s.father.id], audienceLabel: "Class 5", replyBy: new Date(Date.now() + 7 * 86400_000) }));
    const link = await withSchool(s.ctx, (tx) => tx.parentLink.findFirstOrThrow({ where: { guardianId: s.father.id, status: "ACTIVE" } }));
    expect(link.lastSentAt).not.toBeNull();
    const rec = await recipientOf(s.ctx, r.message!.messageId, s.father.id);
    // The WhatsApp card keeps the link on its own last line (sent to WhatsApp as the "Read and answer" button).
    expect(rec.text).toContain("Please read the details on your Parent Link and give your answer there.\n");
    expect(rec.text).toContain(placeholderFor(link.id));
    expect(rec.text).not.toContain(tokenFor(link.id));
    expect(withRealLinks(rec.text)).toContain(linkUrl(link.id));
    expect(withHiddenLinks(rec.text)).toContain("[personal Parent Link]");
    expect((rec.values as Record<string, string>).parent_link).toBe(placeholderFor(link.id));
    const audit = await withSchool(s.ctx, (tx) => tx.auditLogEntry.findMany({ where: { recordType: "Parent Link", recordId: link.id }, select: { action: true } }));
    expect(audit.map((a) => a.action).sort()).toEqual(["created", "sent"]);
  });

  it("an exam reminder and results use the parent's existing link (no second one)", async () => {
    const s = await makeCommSchool();
    for (const [rule, vars] of [["exam-reminder", { exam_name: "Half Yearly", date: "20-11-2026" }], ["result", { exam_name: "Half Yearly" }]] as const) {
      const r = await withSchool(s.ctx, (tx) => sendAutomatic(tx, s.ctx, { rule, event: { key: `${rule}:t:${s.priya.id}`, label: rule }, to: { guardiansOf: [s.priya.id] }, values: { ...vars } }));
      expect(r.status).toBe("sent");
      const links = await withSchool(s.ctx, (tx) => tx.parentLink.findMany({ where: { guardianId: s.teluguMother.id, status: "ACTIVE" } }));
      expect(links).toHaveLength(1);
      const rec = await recipientOf(s.ctx, (r as { result: { messageId: string } }).result.messageId, s.teluguMother.id);
      expect(rec.text).toContain(placeholderFor(links[0].id));
      expect(rec.text).not.toContain(tokenFor(links[0].id));
      expect(withRealLinks(rec.text)).toContain(linkUrl(links[0].id));
      // Padma reads Telugu: the Telugu text, with her link.
      expect(rec.text).toMatch(/Parent Link (లో ఉంది\. శుభాకాంక్షలు!|తెరవండి\.)\n⟦parent-link:/);
    }
  });

  it("with Parent Link switched off, the text says to ask the school office and no link is made", async () => {
    const s = await makeCommSchool();
    await withSchool(s.ctx, (tx) => updateSettings(tx, s.ctx, (v) => ({ ...v, parentLink: { ...v.parentLink, on: false } })));
    const r = await withSchool(s.ctx, (tx) => sendAutomatic(tx, s.ctx, { rule: "result", event: { key: `result:off:${s.kiran.id}`, label: "Results" }, to: { guardiansOf: [s.kiran.id] }, values: { exam_name: "Half Yearly" } }));
    expect(r.status).toBe("sent");
    const rec = await recipientOf(s.ctx, (r as { result: { messageId: string } }).result.messageId, s.otherFather.id);
    expect(rec.text).toContain(`Open your Parent Link to see the full report card.\n${NO_PARENT_LINK}`);
    expect(await withSchool(s.ctx, (tx) => tx.parentLink.count({ where: { guardianId: s.otherFather.id } }))).toBe(0);
  });

  it("a preview makes no link", async () => {
    const s = await makeCommSchool();
    const id = await templateId(s.ctx, "result", "whatsapp");
    const plan = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, { to: { guardiansOf: [s.kiran.id] }, channels: ["whatsapp"], templates: { whatsapp: id }, values: { exam_name: "Half Yearly" } }));
    expect(plan.rows[0].text).toContain(NO_PARENT_LINK);
    expect(await withSchool(s.ctx, (tx) => tx.parentLink.count({ where: { guardianId: s.otherFather.id } }))).toBe(0);
  });
});

describe("a school whose WhatsApp approved the old words", () => {
  it("gets the new words as a new version under a new WhatsApp name, and the approved words keep going until then", async () => {
    const s = await makeCommSchool();
    const id = await templateId(s.ctx, "consent-request", "whatsapp");
    const old = PAST_READY_WHATSAPP["consent-request|en"].at(-1)!;
    const approvedName = whatsappNameFor("Consent request", id);
    await withSchool(s.ctx, async (tx) => {
      // A real WhatsApp account, where the consent text was approved in the old words.
      await tx.messagingChannel.update({ where: { schoolId_channel: { schoolId: s.school.id, channel: "whatsapp" } }, data: { provider: "meta-cloud", environment: "live" } });
      await tx.templateVersion.updateMany({ where: { templateId: id, language: "en", isCurrent: true }, data: { body: old, whatsappStatus: "APPROVED", whatsappName: approvedName } });
      await tx.templateVersion.updateMany({ where: { templateId: id, language: { not: "en" }, isCurrent: true }, data: { isCurrent: false } });
    });
    const before = await withSchool(s.ctx, (tx) => tx.templateVersion.findFirstOrThrow({ where: { templateId: id, language: "en", isCurrent: true } }));

    const r = await withSchool(s.ctx, (tx) => whatsappReadiness(tx, s.ctx));
    expect(r.fixable.map((x) => x.versionId)).toContain(before.id);
    const done = await withSchool(s.ctx, (tx) => makeReadyForWhatsapp(tx, s.ctx, id));
    expect(done.map((d) => d.templateId)).toEqual([id]);
    const now = await withSchool(s.ctx, (tx) => tx.templateVersion.findFirstOrThrow({ where: { templateId: id, language: "en", isCurrent: true } }));
    expect(now.body).toBe(readyWhatsappWords("consent-request", "en"));
    expect(now).toMatchObject({ version: before.version + 1, whatsappStatus: "NOT_SUBMITTED", whatsappName: null });
    const kept = await withSchool(s.ctx, (tx) => tx.templateVersion.findUniqueOrThrow({ where: { id: before.id } }));
    expect(kept).toMatchObject({ isCurrent: false, body: old, whatsappStatus: "APPROVED", whatsappName: approvedName });

    // Until WhatsApp approves the new words, messages go in the approved old words.
    const plan = () => withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, { to: { guardianIds: [s.father.id] }, channels: ["whatsapp"], templates: { whatsapp: id }, values: { title: "Photos" } }));
    const waiting = await plan();
    expect(waiting.rows[0].version?.id).toBe(before.id);
    expect(waiting.rows[0].text).not.toContain("⟦parent-link:");

    // Sent for approval under a new name (WhatsApp refuses other words under a name it has).
    let posted: { name?: string } = {};
    const { vi } = await import("vitest");
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => { posted = JSON.parse(String(init?.body ?? "{}")); return Response.json({ id: "123", status: "PENDING" }); }));
    try {
      await withSchool(s.ctx, async (tx) => {
        await tx.messagingChannel.update({ where: { schoolId_channel: { schoolId: s.school.id, channel: "whatsapp" } }, data: { config: { phoneNumberId: "1", businessAccountId: "2" } } });
        return submitForApproval(tx, s.ctx, now.id);
      });
    } finally {
      vi.unstubAllGlobals();
    }
    const sent = await withSchool(s.ctx, (tx) => tx.templateVersion.findUniqueOrThrow({ where: { id: now.id } }));
    expect(sent.whatsappName).toBe(`${approvedName}_v${now.version}`);
    expect(posted.name).toBe(sent.whatsappName);
    expect(sent.whatsappStatus).toBe("PENDING");
    expect((await plan()).rows[0].version?.id).toBe(before.id);

    // Approved: the new words, with the parent's link, go from now on.
    await withSchool(s.ctx, (tx) => tx.templateVersion.update({ where: { id: now.id }, data: { whatsappStatus: "APPROVED" } }));
    const after = await plan();
    expect(after.rows[0].version?.id).toBe(now.id);
    expect(after.rows[0].text).toContain("give your answer there.\n");
  });
});
