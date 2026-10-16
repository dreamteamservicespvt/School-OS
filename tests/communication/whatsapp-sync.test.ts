// WhatsApp template statuses follow the real WhatsApp account
// (templates-admin.ts, syncWhatsappApprovals): a template "approved" in test
// mode that WhatsApp has never seen goes back to Not submitted, so it is not
// sent as plain text; a pending one becomes Approved when WhatsApp says so;
// and a failed read changes nothing.
import { afterEach, describe, expect, it, vi } from "vitest";
import { withSchool } from "@/lib/db";
import { encryptSecrets } from "@/lib/messaging/channels";
import { ensureReadyTemplates, templateByKey } from "@/lib/messaging/templates";
import { syncWhatsappApprovals } from "@/lib/communication/templates-admin";
import { makeSchool } from "../helpers";

afterEach(() => vi.unstubAllGlobals());

async function setUp() {
  const school = await makeSchool("WhatsApp Sync School");
  const ctx = { schoolId: school.id, userId: null };
  const ids = await withSchool(ctx, async (tx) => {
    await tx.messagingChannel.create({ data: { schoolId: school.id, channel: "whatsapp", provider: "meta-cloud", isOn: true, environment: "live", config: { phoneNumberId: "1", businessAccountId: "2" }, ...encryptSecrets({ accessToken: "token" }) } });
    await ensureReadyTemplates(tx, ctx);
    const fee = await templateByKey(tx, ctx, "fee-due", "whatsapp");
    const absence = await templateByKey(tx, ctx, "absence", "whatsapp");
    await tx.templateVersion.updateMany({ where: { templateId: fee!.id, isCurrent: true, language: "en" }, data: { whatsappName: "fee_reminder_test", whatsappStatus: "APPROVED", whatsappNote: "Test mode: approved straight away." } });
    await tx.templateVersion.updateMany({ where: { templateId: absence!.id, isCurrent: true, language: "en" }, data: { whatsappName: "absent_today_test", whatsappStatus: "PENDING" } });
    return { fee: fee!.id, absence: absence!.id };
  });
  const status = (templateId: string) => withSchool(ctx, (tx) => tx.templateVersion.findFirstOrThrow({ where: { templateId, isCurrent: true, language: "en" } }));
  return { ctx, ids, status };
}

describe("WhatsApp template statuses follow the real account", () => {
  it("resets test-mode approvals WhatsApp does not have, and picks up WhatsApp's approvals", async () => {
    const { ctx, ids, status } = await setUp();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: [{ name: "absent_today_test", language: "en", status: "APPROVED" }, { name: "gym_payment_due", language: "en", status: "APPROVED" }] })));
    const r = await withSchool(ctx, (tx) => syncWhatsappApprovals(tx, ctx));
    expect(r?.changed).toBeGreaterThanOrEqual(2);
    expect((await status(ids.fee)).whatsappStatus).toBe("NOT_SUBMITTED");
    expect((await status(ids.absence)).whatsappStatus).toBe("APPROVED");
  });

  it("changes nothing when WhatsApp cannot be read", async () => {
    const { ctx, ids, status } = await setUp();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 500 })));
    expect(await withSchool(ctx, (tx) => syncWhatsappApprovals(tx, ctx))).toBeNull();
    expect((await status(ids.fee)).whatsappStatus).toBe("APPROVED");
  });
});
