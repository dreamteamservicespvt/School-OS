// Live test 16 Nov: the Fee received card went without its receipt PDF and nobody was told. The sample
// PDF upload now says which step failed, and the template is sent with a note saying so. The four texts
// Meta refused (INCORRECT_CATEGORY) are reworded, and the passes have their own blanks.
import { afterEach, describe, expect, it, vi } from "vitest";
import { submitWhatsappTemplate, uploadTemplateSample } from "@/lib/messaging/providers/whatsapp";
import { readyCard, READY_WHATSAPP } from "@/lib/messaging/ready-whatsapp";
import { variablesIn } from "@/lib/messaging/blanks";

vi.mock("server-only", () => ({}));

const p = { config: { businessAccountId: "123456789" }, secrets: { accessToken: "token" } };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => { vi.unstubAllGlobals(); delete process.env.WHATSAPP_APP_ID; });

describe("the receipt card's sample PDF", () => {
  it("finds the Meta app through debug_token when /app does not answer", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      seen.push(url);
      if (url.endsWith("/app")) return json(400, { error: { message: "no app" } });
      if (url.includes("/debug_token")) return json(200, { data: { app_id: "555666777" } });
      if (url.includes("/555666777/uploads")) return json(200, { id: "upload:abc123" });
      return json(200, { h: "4::handle" });
    }));
    expect(await uploadTemplateSample(p)).toEqual({ handle: "4::handle" });
    expect(seen.some((u) => u.includes("/debug_token"))).toBe(true);
  });

  it("says which step failed, in WhatsApp's words", async () => {
    process.env.WHATSAPP_APP_ID = "555666777";
    vi.stubGlobal("fetch", vi.fn(async () => json(403, { error: { message: "(#200) Permission denied" } })));
    expect(await uploadTemplateSample(p)).toEqual({ problem: "WhatsApp did not open the upload ((#200) Permission denied)" });
  });

  it("a receipt card sent without its PDF carries a note saying why", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.includes("/message_templates") ? json(200, { id: "1", status: "PENDING" }) : json(400, { error: { message: "nope" } }))));
    const card = readyCard("fee-paid", "en");
    const t = READY_WHATSAPP.find((x) => x.key === "fee-paid")!;
    const r = await submitWhatsappTemplate(p, { name: "fee_received", language: "en", category: "UTILITY", body: t.texts.en!, card, school: { name: "Chaitanya", phone: "9876500001" } });
    expect(r).toMatchObject({ ok: true });
    expect(r.ok && r.note).toMatch(/^Sent without the receipt PDF on top: the Meta app could not be found/);
  });
});

describe("texts Meta refused as the wrong category", () => {
  it("have no warm or sign-in words", () => {
    for (const key of ["admission-welcome", "staff-invite"]) for (const words of Object.values(READY_WHATSAPP.find((t) => t.key === key)!.texts))
      expect(words!, key).not.toMatch(/welcome|wonderful|works once|do not share|password|sign in|account/i);
  });
  it("passes have their own blanks, not one {message}", () => {
    expect(variablesIn(READY_WHATSAPP.find((t) => t.key === "visitor-pass")!.texts.en!)).toEqual(["visitor_name", "pass_no", "valid_until"]);
    expect(variablesIn(READY_WHATSAPP.find((t) => t.key === "gate-pass")!.texts.en!)).toEqual(["visitor_name", "student_name", "time", "pass_no"]);
  });
});
