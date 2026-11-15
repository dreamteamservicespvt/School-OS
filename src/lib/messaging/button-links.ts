// The end of a WhatsApp link button's address (docs/design/whatsapp-messages.md
// 5.3): a card's "Open Parent Link", "Pay fee", "Open receipt" or "Open School
// OS" button is https://<app>/p/{{1}}, /r/{{1}} or /invite/{{1}}, and only the
// person's own secret goes in the blank. Message texts keep placeholders, never
// a link that opens; the secret is worked out here only when the message is
// handed to WhatsApp (src/lib/parent-link/token.ts).
import "server-only";

import type { LinkTarget } from "./card";
import { appUrl, inviteTokenFor, receiptKeyIn, tokenFor } from "../parent-link/token";

/**
 * What a button gets when the person has no link of that kind (a parent with
 * no Parent Link yet): an end of address that opens School OS's own "This link
 * does not work … ask the school for a new one" page, never a missing blank
 * (WhatsApp would refuse the whole message).
 */
export const NO_LINK_SUFFIX = "ask-the-school";

const PARENT = /⟦parent-link:([0-9a-f-]{36})⟧/;
const INVITE = /⟦invite:([0-9a-f-]{36}):([A-Za-z0-9_-]{16,64})⟧/;

/** The end of the button's address for this value (a placeholder, or a real link to the same page). */
export function buttonSuffix(target: LinkTarget, value: string | null | undefined): string {
  const v = value ?? "";
  if (target === "parent-link") {
    const m = PARENT.exec(v);
    if (m) return tokenFor(m[1]);
  } else if (target === "invite") {
    const m = INVITE.exec(v);
    if (m) return inviteTokenFor(m[1], m[2]);
  } else {
    const key = receiptKeyIn(v);
    if (key) return key;
  }
  // Already a real link to the same kind of page: its last part.
  const prefix = `${appUrl()}/${target === "parent-link" ? "p" : target === "receipt" ? "r" : "invite"}/`;
  const at = v.indexOf(prefix);
  if (at >= 0) {
    const rest = v.slice(at + prefix.length).match(/^[A-Za-z0-9_-]+/)?.[0];
    if (rest) return rest;
  }
  return NO_LINK_SUFFIX;
}

/** The payment a fee receipt placeholder in these values is for, or null. */
export function receiptPaymentIn(values: Record<string, string>): { schoolId: string; paymentId: string } | null {
  for (const v of Object.values(values)) {
    const m = /⟦receipt:([0-9a-f-]{36}):([0-9a-f-]{36})⟧/.exec(String(v ?? ""));
    if (m) return { schoolId: m[1], paymentId: m[2] };
  }
  return null;
}
