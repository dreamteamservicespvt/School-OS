// A one-time code is handed to WhatsApp or SMS while the person waits, and the
// screen says what really happened (owner test 2026-11-05: the admission form
// said "Code sent ... by WhatsApp" but WhatsApp refused it, so nothing came).
import { beforeAll, describe, expect, it, vi } from "vitest";
import { prisma, withSchool } from "@/lib/db";
import { startChallenge } from "@/lib/auth/two-step";
import { confirmOtpSent, startOtp } from "@/lib/admission/consent";
import { codeFailedWords, deliverCodeNow } from "@/lib/messaging/code-now";
import { deliverMessage } from "@/lib/messaging/deliver";
import { sandboxProvider } from "@/lib/messaging/providers/sandbox";
import { PARENT_CODE_NOT_SENT } from "@/lib/dev-codes";
import { addDlt, makeCommSchool } from "./fixture";
import { takeLoggedCode, watchLoggedCodes } from "../helpers";

watchLoggedCodes();

let s: Awaited<ReturnType<typeof makeCommSchool>>;
beforeAll(async () => {
  s = await makeCommSchool();
  await addDlt(s.ctx, "sign-in-code");
  await prisma.userLogin.update({ where: { id: s.principal.id }, data: { phone: "9876543297", email: null } });
}, 120_000);

let seq = 0;
async function queueCode() {
  const phone = `98450${String(Date.now() + seq++).slice(-5)}`;
  const r = await withSchool(s.ctx, (tx) => startOtp(tx, s.ctx, { phone, purpose: `code-now:${phone}`, schoolName: "Comm School", about: null }));
  takeLoggedCode();
  expect(r.messageId).toBeTruthy();
  return r;
}
const recipients = (messageId: string) => withSchool(s.ctx, (tx) => tx.messageRecipient.findMany({ where: { messageId } }));
const REFUSED = "WhatsApp allows a typed message only within 24 hours of the parent's last message. Use an approved template.";

describe("a one-time code is sent while the person waits", () => {
  it("says it was not sent, and why, when the provider refuses it", async () => {
    const r = await queueCode();
    const spy = vi.spyOn(sandboxProvider, "send").mockResolvedValue({ ok: false, retryable: false, reason: REFUSED });
    try {
      const out = await deliverCodeNow(s.ctx, r.messageId);
      expect(out).toEqual({ state: "failed", reason: REFUSED.replace(/\.$/, "") });
      expect((await recipients(r.messageId!)).map((p) => p.status)).toEqual(["FAILED"]);
      // The office's words: not "Code sent", with the reason and what to do.
      const said = await confirmOtpSent(s.ctx, { ...(await queueCode()), testMode: false }, "+91 98450 12345");
      expect(said.ok).toBe(false);
      expect(said.message).toMatch(/^The code was not sent by (WhatsApp|SMS): WhatsApp allows a typed message only within 24 hours/);
      expect(said.message).toContain("Send code again");
      // A parent on the online form gets no staff words.
      const parent = await confirmOtpSent(s.ctx, { ...(await queueCode()), testMode: false }, "•••••2345", true);
      expect(parent).toEqual({ ok: false, message: PARENT_CODE_NOT_SENT });
    } finally {
      spy.mockRestore();
    }
    expect(codeFailedWords("whatsapp", "Number not on WhatsApp")).toContain("not sent by WhatsApp: Number not on WhatsApp.");
  });

  it("says sent once the provider took it, and the queued job does not send it twice", async () => {
    const r = await queueCode();
    const spy = vi.spyOn(sandboxProvider, "send").mockResolvedValue({ ok: true, providerMessageId: "test-now", status: "SENT" });
    try {
      expect(await deliverCodeNow(s.ctx, r.messageId)).toEqual({ state: "sent" });
      await withSchool(s.ctx, (tx) => deliverMessage(tx, s.ctx, { messageId: r.messageId!, round: "0", chunk: 0 }));
      expect(spy).toHaveBeenCalledTimes(1);
      const said = await confirmOtpSent(s.ctx, { ...(await queueCode()), testMode: false }, "+91 98450 12345");
      expect(said).toMatchObject({ ok: true, message: expect.stringMatching(/^Code sent to \+91 98450 12345 by /) });
    } finally {
      spy.mockRestore();
    }
  });

  it("a sign-in code the SMS provider refuses is not shown as sent", async () => {
    const device = { userAgent: "Test browser", ipAddress: "10.0.0.41" };
    const spy = vi.spyOn(sandboxProvider, "send").mockResolvedValue({ ok: false, retryable: false, reason: "MSG91 refused the DLT template" });
    try {
      const r = await startChallenge(s.principal.id, s.school.id, device, { confirmNow: true });
      takeLoggedCode();
      expect(r).toEqual({ ok: false, message: expect.stringMatching(/^The sign-in code could not be sent by SMS: MSG91 refused the DLT template\. /) });
      // No code is waiting for a message that never went.
      expect(await prisma.twoStepChallenge.count({ where: { userLoginId: s.principal.id, usedAt: null } })).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("admission consent code uses the school's approved template", () => {
  it("goes in the ready 'Admission consent code' template once it is approved (owner test 2026-11-05)", async () => {
    await queueCode(); // makes the ready templates the school does not have yet
    await addDlt(s.ctx, "admission-consent-code");
    await withSchool(s.ctx, async (tx) => {
      const t = await tx.template.findFirstOrThrow({ where: { schoolId: s.ctx.schoolId, key: "admission-consent-code", channel: "whatsapp" } });
      await tx.templateVersion.updateMany({ where: { templateId: t.id }, data: { whatsappStatus: "APPROVED", whatsappName: "admission_consent_code_1" } });
    });
    const r = await queueCode();
    const [p] = await recipients(r.messageId!);
    expect(p.templateVersionId).toBeTruthy();
    expect(p.text).toMatch(/code to confirm consent for admission at Comm School/);
    expect(p.text).toContain("••••••");
  });
});
