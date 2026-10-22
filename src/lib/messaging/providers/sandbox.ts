// Test mode: nothing leaves School OS. Every message is marked Delivered and
// its exact text stays visible in Message History, so a school can try every
// screen before connecting a real provider. One-time codes are hidden there
// too (QA SEC-01); on a tester's computer they are in the server log (dev-codes.ts).
import { randomUUID } from "node:crypto";
import type { Outgoing, Provider, SendResult } from "./types";

export const sandboxProvider: Provider = {
  key: "sandbox",
  async send(msg: Outgoing): Promise<SendResult> {
    if (!msg.to) return { ok: false, retryable: false, reason: "No phone number or email address." };
    return { ok: true, providerMessageId: `test-${randomUUID()}`, status: "DELIVERED" };
  },
};
