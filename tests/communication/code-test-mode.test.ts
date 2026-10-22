// One-time codes while the school's messages are in Test mode (QA ADMIT-03).
// Test mode only records a message, so no code reaches the phone. The screens
// said "Code sent to +91 98450 12308 by SMS" anyway; now each sender reports
// Test mode and the words say plainly that the code was not sent.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { otpSentWords, startOtp } from "@/lib/admission/consent";
import { createLink, hashToken, newDeviceKey, codeSentWords, sendCode } from "@/lib/parent-link/links";
import { sendPickupCode } from "@/lib/front-office/pickup";
import { codeNotSentWords } from "@/lib/dev-codes";
import { makeCommSchool } from "./fixture";

let s: Awaited<ReturnType<typeof makeCommSchool>>;
beforeAll(async () => { s = await makeCommSchool(); }, 120_000);

describe("one-time codes in Test mode", () => {
  it("the words never say the code was sent", () => {
    const w = codeNotSentWords({ to: "+91 98450 12308", channel: "sms", inLog: false });
    expect(w).toMatch(/^Test mode, not sent: no code went to \+91 98450 12308/);
    expect(w).not.toMatch(/Code sent/);
    expect(codeNotSentWords({ to: "x", channel: "whatsapp", inLog: true })).toContain("On this computer the code is in the server log.");
  });

  it("admission consent code: Test mode is reported, and the screen says it was not sent", async () => {
    const r = await withSchool(s.ctx, (tx) => startOtp(tx, s.ctx, { phone: "9845012308", purpose: "test:test-mode", schoolName: "Test", about: null }));
    expect(r.testMode).toBe(true);
    expect(otpSentWords(r, "+91 98450 12308")).toMatch(/^Test mode, not sent: no code went to \+91 98450 12308/);
    expect(otpSentWords({ ...r, testMode: false }, "+91 98450 12308")).toBe(`Code sent to +91 98450 12308 by ${r.channel === "sms" ? "SMS" : "WhatsApp"}. It works for 10 minutes.`);
  });

  it("Parent Link code: Test mode is reported, and the page says it was not sent", async () => {
    const link = await withSchool(s.ctx, (tx) => createLink(tx, s.ctx, s.mother.id));
    const r = await withSchool(s.ctx, (tx) => sendCode(tx, s.ctx, link.id, "device", { keyHash: hashToken(newDeviceKey()) }));
    expect(r.testMode).toBe(true);
    expect(codeSentWords(r, "Code sent.")).toMatch(/^Test mode, not sent/);
    expect(codeSentWords({ ...r, testMode: false }, "Code sent.")).toBe("Code sent.");
  });

  it("pickup code: Test mode is reported to the front desk", async () => {
    const r = await withSchool(s.ctx, (tx) => sendPickupCode(tx, s.ctx, s.ravi.id, s.father.id));
    expect(r.testMode).toBe(true);
  });
});
