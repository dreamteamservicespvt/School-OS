// Self-test B1 (2026-11-12): after Collect fee the screen said "parents got the receipt on WhatsApp" while the
// school was in Test mode and nothing went. It may say "got it" only when a provider really took the message.
import { describe, expect, it } from "vitest";
import { classifyDelivery, receiptSentWords } from "@/lib/messaging/delivery-words";

describe("what the receipt screen says about the parents' message", () => {
  it("Test mode (sandbox rows) is never 'sent'", () => {
    const d = classifyDelivery([{ channel: "whatsapp", status: "SENT", provider: "sandbox", failReason: null }]);
    expect(d.sentBy).toEqual([]);
    expect(d.test).toEqual(["WhatsApp"]);
    expect(receiptSentWords("Ravi", d)).toBe("Receipt saved. WhatsApp is in Test mode, so the parents were not messaged.");
  });

  it("says the parents got it only when the provider took it", () => {
    const d = classifyDelivery([{ channel: "whatsapp", status: "DELIVERED", provider: "meta", failReason: null }]);
    expect(d.sentBy).toEqual(["WhatsApp"]);
    expect(receiptSentWords("Ravi", d)).toBe("Ravi’s parents got the receipt on WhatsApp.");
  });

  it("a message still waiting for the provider is 'on its way', not 'got it'", () => {
    const d = classifyDelivery([{ channel: "whatsapp", status: "QUEUED", provider: null, failReason: null }]);
    expect(d.pending).toEqual(["WhatsApp"]);
    expect(receiptSentWords("Ravi", d)).toMatch(/^The receipt is on its way to Ravi’s parents by WhatsApp/);
  });

  it("a refused message says so", () => {
    const d = classifyDelivery([{ channel: "whatsapp", status: "FAILED", provider: "meta", failReason: "Template not approved." }]);
    expect(d.failed).toEqual(["WhatsApp did not take it (Template not approved)"]);
    expect(receiptSentWords("Ravi", d)).toBe("The receipt was not sent: WhatsApp did not take it (Template not approved). Print or resend it.");
  });

  it("no message at all: print it", () => {
    expect(receiptSentWords("Ravi", null)).toBe("The receipt is ready to print. No message was sent to the parents.");
  });
});
