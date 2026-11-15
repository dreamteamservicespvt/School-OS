// Live test 16 Nov 2026 (deploy 11): the reworded texts never reached the school (their refused
// words were not in the history), a refusal with no reason said nothing, and the approved receipt
// card that went without its PDF could not be tried again.
import { afterEach, describe, expect, it, vi } from "vitest";
import { withSchool } from "@/lib/db";
import { ensureReadyTemplates, templateByKey } from "@/lib/messaging/templates";
import { PAST_READY_WHATSAPP } from "@/lib/messaging/ready-history";
import { readyCard } from "@/lib/messaging/ready-whatsapp";
import { makeReadyForWhatsapp, whatsappReadiness } from "@/lib/communication/whatsapp-ready";
import { rejectedWords } from "@/lib/communication/templates-admin";
import { listWhatsappTemplates } from "@/lib/messaging/providers/whatsapp";
import { makeSchool } from "../helpers";

afterEach(() => vi.unstubAllGlobals());

describe("texts WhatsApp refused, and the receipt PDF", () => {
  it("refused card words are School OS's own, so Make ready rewords them; the receipt card gets one more try", async () => {
    const school = await makeSchool("WhatsApp Refused School");
    const ctx = { schoolId: school.id, userId: null };
    const ids = await withSchool(ctx, async (tx) => {
      await ensureReadyTemplates(tx, ctx);
      const id = async (key: string) => (await templateByKey(tx, ctx, key, "whatsapp"))!.id;
      const [welcome, pass, paid] = await Promise.all(["admission-welcome", "visitor-pass", "fee-paid"].map(id));
      const set = (templateId: string, data: Record<string, unknown>) => tx.templateVersion.updateMany({ where: { templateId, isCurrent: true, language: "en" }, data });
      await set(welcome, { body: PAST_READY_WHATSAPP["admission-welcome|en"][0], whatsappStatus: "REJECTED", whatsappName: "admission_welcome_v3", whatsappNote: "INCORRECT_CATEGORY" });
      await set(pass, { body: PAST_READY_WHATSAPP["visitor-pass|en"].at(-1), whatsappStatus: "REJECTED", whatsappName: "visitor_pass_v2" });
      // Approved, but it went with its text header (no sample PDF then).
      await set(paid, { whatsappStatus: "APPROVED", whatsappName: "fee_paid", whatsappCard: { ...readyCard("fee-paid", "en"), submitted: { header: "text", buttons: [{ type: "URL", target: "receipt", blank: "receipt_link" }] } } });
      return { welcome, pass, paid };
    });
    const r = await withSchool(ctx, (tx) => whatsappReadiness(tx, ctx));
    expect(r.fixable.filter((x) => x.language === "en").map((x) => x.templateId).sort()).toEqual([ids.welcome, ids.pass, ids.paid].sort());
    const done = await withSchool(ctx, (tx) => makeReadyForWhatsapp(tx, ctx, null));
    expect(done.map((d) => d.templateId).sort()).toEqual([ids.welcome, ids.pass, ids.paid].sort());
    // A receipt card that went without its PDF and was told why is not offered again and again.
    await withSchool(ctx, (tx) => tx.templateVersion.updateMany({ where: { templateId: ids.paid, isCurrent: true, language: "en" }, data: { whatsappStatus: "APPROVED", whatsappName: "fee_paid_v2", whatsappNote: "Sent without the receipt PDF on top: the Meta app could not be found.", whatsappCard: { ...readyCard("fee-paid", "en"), submitted: { header: "text", buttons: [] } } } }));
    expect((await withSchool(ctx, (tx) => whatsappReadiness(tx, ctx))).fixable.map((x) => x.templateId)).not.toContain(ids.paid);
  });

  it("a refusal with no reason names the category WhatsApp filed it under", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [{ name: "visitor_pass_v2", language: "en", status: "REJECTED", rejected_reason: "NONE", category: "AUTHENTICATION" }] }), { status: 200 })));
    const known = await listWhatsappTemplates({ config: { businessAccountId: "123" }, secrets: { accessToken: "t" } });
    const note = known!.get("visitor_pass_v2|en")!.note!;
    expect(note).toBe("NO_REASON_GIVEN (filed as AUTHENTICATION)");
    expect(rejectedWords(note)).toBe("WhatsApp refused it without giving a reason; it filed the text as Authentication. Plainer words usually pass, or ask DREAM TEAM support.");
  });
});
