// What really happened to a message, per channel, in words for the screen (self-test B1, 2026-11-12).
// Same rules as confirmInviteSent (src/lib/settings/invite-message.ts): only a provider that took it counts as
// sent; Test mode (sandbox rows) never does; a message still in the queue is "on its way".

export type DeliveryRow = { channel: string; status: string; provider: string | null; failReason: string | null };
export type Delivery = { sentBy: string[]; pending: string[]; test: string[]; failed: string[] };

const WORD: Record<string, string> = { whatsapp: "WhatsApp", sms: "SMS", email: "email", app: "School OS" };
const TAKEN = new Set(["SENT", "DELIVERED", "READ"]);
/** Recorded by Test mode: nobody got it (same rule as inTestMode in communication/history.ts). */
const inTestMode = (r: DeliveryRow) => r.provider === "sandbox" && r.status !== "FAILED" && r.status !== "QUEUED" && r.status !== "SENDING";

export function classifyDelivery(rows: DeliveryRow[]): Delivery {
  const out: Delivery = { sentBy: [], pending: [], test: [], failed: [] };
  for (const channel of [...new Set(rows.map((r) => r.channel))]) {
    const mine = rows.filter((r) => r.channel === channel);
    const word = WORD[channel] ?? channel;
    if (mine.some((r) => TAKEN.has(r.status) && !inTestMode(r))) out.sentBy.push(word);
    else if (mine.some(inTestMode)) out.test.push(word);
    else if (mine.every((r) => r.status === "FAILED")) out.failed.push(`${word} did not take it (${(mine.find((r) => r.failReason)?.failReason ?? "the provider refused it").replace(/\.$/, "")})`);
    else out.pending.push(word);
  }
  return out;
}

const and = (xs: string[]) => xs.join(" and ");

/** The line under "₹5,000 received" on the Collect fee success sheet. */
export function receiptSentWords(studentName: string, d: Delivery | null): string {
  if (!d || (!d.sentBy.length && !d.pending.length && !d.test.length && !d.failed.length)) return "The receipt is ready to print. No message was sent to the parents.";
  const parts: string[] = [];
  if (d.sentBy.length) parts.push(`${studentName}’s parents got the receipt on ${and(d.sentBy)}.`);
  if (d.pending.length) parts.push(`The receipt is on its way to ${studentName}’s parents by ${and(d.pending)}: check Message History in a minute.`);
  if (d.test.length) parts.push(`${parts.length ? "" : "Receipt saved. "}${and(d.test)} ${d.test.length === 1 ? "is" : "are"} in Test mode, so the parents were not messaged${parts.length ? ` by ${d.test.length === 1 ? "it" : "them"}` : ""}.`);
  if (d.failed.length) parts.push(`The receipt was not sent: ${d.failed.join("; ")}. Print or resend it.`);
  return parts.join(" ");
}
