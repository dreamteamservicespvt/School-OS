// Getting WhatsApp templates approved (src/lib/communication/whatsapp-ready.ts).
// WhatsApp lets a school start a chat only from an approved template, and Meta
// refuses words that end with a blank. Every ready WhatsApp text must pass the
// check; a school still holding School OS's first words gets today's words with
// "Make ready for WhatsApp" (a new version, the old one kept); a text the school
// changed is never replaced; and only ready, never-sent texts are offered for
// "Send N templates to WhatsApp for approval".
import { describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { ensureReadyTemplates, READY_TEMPLATES, templateByKey, whatsappProblems } from "@/lib/messaging/templates";
import { PAST_READY_WHATSAPP } from "@/lib/messaging/ready-history";
import { readyCard } from "@/lib/messaging/ready-whatsapp";
import { makeReadyForWhatsapp, newReadyWords, readyWhatsappWords, whatsappReadiness } from "@/lib/communication/whatsapp-ready";
import { submitForApproval } from "@/lib/communication/templates-admin";
import { makeSchool } from "../helpers";

const readyWhatsapp = READY_TEMPLATES.filter((t) => t.channel === "whatsapp").flatMap((t) => Object.entries(t.texts).map(([language, body]) => ({ name: `${t.key} (${language})`, key: t.key, language, body })));

describe("every ready WhatsApp text, in every language", () => {
  // Each with its card (header, buttons): a card's link line is its button.
  it.each(readyWhatsapp)("$name is a text WhatsApp takes", ({ key, language, body }) => {
    expect(whatsappProblems(body, readyCard(key, language))).toEqual([]);
  });

  // Everything that sends a WhatsApp message to parents (or staff) by itself uses one of these keys.
  const SENDERS = [
    "absence", "late", "fee-due", "fee-paid", "homework-set", "homework-pending", "exam-reminder", "result", "notice",
    "parent-link", "parent-link-code", "consent-request", "admission-welcome", "admission-consent-code", "query-number",
    "query-rating", "ptm", "birthday-student", "birthday-staff", "behaviour-note", "general", "staff-message", "staff-invite",
    "bus-pickup", "bus-drop", "bus-arriving",
  ];
  it.each(SENDERS)("%s has a ready WhatsApp text that passes", (key) => {
    const t = READY_TEMPLATES.find((x) => x.key === key && x.channel === "whatsapp");
    expect(t, key).toBeTruthy();
    for (const [language, body] of Object.entries(t!.texts)) expect(whatsappProblems(body, readyCard(key, language)), key).toEqual([]);
  });
});

describe("School OS's first words", () => {
  const past = Object.entries(PAST_READY_WHATSAPP).flatMap(([k, list]) => list.map((body) => ({ k, body })));

  it.each(past)("$k: an old text becomes today's ready words", ({ k, body }) => {
    const [key, language] = k.split("|");
    const now = readyWhatsappWords(key, language);
    expect(now).toBeTruthy();
    expect(body).not.toBe(now);
    expect(newReadyWords(key, language, body)).toBe(now);
    expect(newReadyWords(key, language, body.replace(/\n/g, "\r\n") + "  ")).toBe(now);
  });

  it("holds the words the live test school still had (they end with a blank)", () => {
    const absent = "Dear {guardian_name}, {student_name} ({class}) is absent from school today, {date}. If this is not expected, please call the school on {school_phone}. - {school_name}";
    expect(whatsappProblems(absent).join(" ")).toMatch(/End the text with words/);
    expect(newReadyWords("absence", "en", absent)).toBe(readyWhatsappWords("absence", "en"));
    expect(newReadyWords("general", "en", "Dear {guardian_name}, {message} - {school_name}")).toBe(readyWhatsappWords("general", "en"));
  });

  it("never replaces a text the school changed, or one already in today's words", () => {
    expect(newReadyWords("absence", "en", "Dear {guardian_name}, {student_name} is absent today. - {school_name}")).toBeNull();
    expect(newReadyWords("absence", "en", readyWhatsappWords("absence", "en")!)).toBeNull();
    expect(newReadyWords(null, "en", "Dear {guardian_name}, {message} - {school_name}")).toBeNull();
    expect(newReadyWords("absence", "ta", "anything")).toBeNull();
  });
});

describe("Make ready for WhatsApp, and sending for approval", () => {
  async function setUp() {
    const school = await makeSchool("WhatsApp Ready School");
    const ctx = { schoolId: school.id, userId: null };
    const ids = await withSchool(ctx, async (tx) => {
      await ensureReadyTemplates(tx, ctx);
      const id = async (key: string) => (await templateByKey(tx, ctx, key, "whatsapp"))!.id;
      const [absence, general, late, ptm, result] = await Promise.all(["absence", "general", "late", "ptm", "result"].map(id));
      const set = (templateId: string, data: Record<string, unknown>) => tx.templateVersion.updateMany({ where: { templateId, isCurrent: true, language: "en" }, data });
      // As a school made before the ready texts were reworded: old words, back to Not submitted.
      await set(absence, { body: PAST_READY_WHATSAPP["absence|en"][0], whatsappStatus: "NOT_SUBMITTED" });
      await set(ptm, { body: PAST_READY_WHATSAPP["ptm|en"][0], whatsappStatus: "REJECTED", whatsappName: "ptm_reminder_x", whatsappNote: "Variables can't be at the start or end" });
      // Old words WhatsApp already approved: since the cards they get the card too, and keep going until it is approved.
      await set(general, { body: PAST_READY_WHATSAPP["general|en"][0], whatsappStatus: "APPROVED", whatsappName: "general_x" });
      // Words the school changed itself, which WhatsApp would refuse.
      await set(late, { body: "Dear {guardian_name}, {student_name} came late today. - {school_name}" });
      // Waiting for WhatsApp: never sent again.
      await set(result, { whatsappStatus: "PENDING", whatsappName: "result_x" });
      return { absence, general, late, ptm, result };
    });
    const current = (templateId: string) => withSchool(ctx, (tx) => tx.templateVersion.findFirstOrThrow({ where: { templateId, isCurrent: true, language: "en" } }));
    return { ctx, ids, current };
  }

  it("lists what to make ready, what to send and what to edit", async () => {
    const { ctx, ids } = await setUp();
    const r = await withSchool(ctx, (tx) => whatsappReadiness(tx, ctx));
    expect(r.fixable.map((x) => x.templateId).sort()).toEqual([ids.absence, ids.general, ids.ptm].sort());
    expect(r.toEdit.map((x) => x.templateId)).toEqual([ids.late]);
    expect(r.toEdit[0].problems.join(" ")).toMatch(/End the text with words/);
    // Only the English texts were changed above; Hindi and Telugu of "Absent today" are in today's words.
    const sending = r.toSend.filter((x) => x.language === "en").map((x) => x.templateId);
    for (const id of Object.values(ids)) expect(sending).not.toContain(id);
    expect(r.toSend.filter((x) => x.templateId === ids.absence).map((x) => x.language).sort()).toEqual(["hi", "te"]);
    expect(r.toSend.length).toBeGreaterThan(15);
    expect(r.approved).toBe(1);
    expect(r.pending).toBe(1);
  });

  it("saves today's words as a new version, keeps the old one, writes the audit log, and leaves the rest alone", async () => {
    const { ctx, ids, current } = await setUp();
    const before = { absence: await current(ids.absence), general: await current(ids.general), late: await current(ids.late) };
    const done = await withSchool(ctx, (tx) => makeReadyForWhatsapp(tx, ctx, null));
    expect(done.map((d) => d.templateId).sort()).toEqual([ids.absence, ids.general, ids.ptm].sort());

    const absence = await current(ids.absence);
    expect(absence.body).toBe(readyWhatsappWords("absence", "en"));
    expect(absence.version).toBe(before.absence.version + 1);
    expect(absence.whatsappStatus).toBe("NOT_SUBMITTED");
    expect(whatsappProblems(absence.body)).toEqual([]);
    const old = await withSchool(ctx, (tx) => tx.templateVersion.findUniqueOrThrow({ where: { id: before.absence.id } }));
    expect(old.isCurrent).toBe(false);
    expect(old.body).toBe(before.absence.body);

    const ptm = await current(ids.ptm);
    expect(ptm.body).toBe(readyWhatsappWords("ptm", "en"));
    expect(ptm.whatsappStatus).toBe("NOT_SUBMITTED");
    expect(ptm.whatsappName).toBeNull();

    // The approved old words get the card as a new version; the approved one stays for sending until then.
    const general = await current(ids.general);
    expect(general.body).toBe(readyWhatsappWords("general", "en"));
    expect(general.whatsappCard).toMatchObject({ header: { type: "text", text: "Message from school" }, buttons: [{ type: "PHONE", text: "Call school" }] });
    const approvedOld = await withSchool(ctx, (tx) => tx.templateVersion.findUniqueOrThrow({ where: { id: before.general.id } }));
    expect(approvedOld).toMatchObject({ isCurrent: false, whatsappStatus: "APPROVED", whatsappName: "general_x" });
    expect((await current(ids.late)).id).toBe(before.late.id);

    const audit = await withSchool(ctx, (tx) => tx.auditLogEntry.findMany({ where: { recordType: "Template", recordId: ids.absence } }));
    expect(audit.map((a) => a.actorNote).join(" ")).toMatch(/made ready for WhatsApp; new version for en/);

    // Once is enough: a second click changes nothing.
    expect(await withSchool(ctx, (tx) => makeReadyForWhatsapp(tx, ctx, null))).toEqual([]);
  });

  it("makes one template ready from its own page", async () => {
    const { ctx, ids, current } = await setUp();
    const done = await withSchool(ctx, (tx) => makeReadyForWhatsapp(tx, ctx, ids.absence));
    expect(done.map((d) => d.templateId)).toEqual([ids.absence]);
    expect((await current(ids.ptm)).body).toBe(PAST_READY_WHATSAPP["ptm|en"][0]);
  });

  it("after making ready, every text offered for sending goes through, and none is offered twice", async () => {
    const { ctx } = await setUp();
    await withSchool(ctx, (tx) => makeReadyForWhatsapp(tx, ctx, null));
    const r = await withSchool(ctx, (tx) => whatsappReadiness(tx, ctx));
    expect(r.fixable).toEqual([]);
    for (const v of r.toSend) {
      expect(await withSchool(ctx, (tx) => submitForApproval(tx, ctx, v.versionId))).toBe("APPROVED"); // test mode
    }
    const after = await withSchool(ctx, (tx) => whatsappReadiness(tx, ctx));
    expect(after.toSend).toEqual([]);
    expect(after.toEdit.length).toBe(1);
    expect(after.approved).toBe(r.approved + r.toSend.length);
    // About 90 texts now (cards in three languages, Front Office), each sent one at a time.
  }, 120_000);
});
