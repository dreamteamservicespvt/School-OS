// One-time codes sent through Communication (QA SEC-01): the two-step
// sign-in code and the code confirming a new mobile number, Parent Link codes
// (new phone, consent forms, event consent), the admission consent code and
// the pickup code.
//
// A code is stored only as a hash where it is checked (08-platform-security.md).
// In messaging it is never kept in plain text: the message's text and blanks
// hold CODE_MASK, so Message History, its export, a person's timeline, data
// exports and any preview show "••••••". The code itself rides on the
// recipient encrypted (sealed_code) only until the delivery job hands it to
// the provider; the job clears it when it picks the recipient up. A code that
// did not go is never sent again, by a retry, a resend or SMS backup: the
// person asks for a new code.
//
// Such a message is a required system message, not an emergency broadcast:
// it reaches a person who opted out of messages (they asked for the code),
// its Message Type is "one-time-code", nobody is its sender ("School OS"),
// and the Audit Log says "one-time-code-sent" with what the code was for.
import { decryptField, encryptField } from "../crypto";

/** Message.messageType of a one-time code. */
export const ONE_TIME_CODE = "one-time-code";
/** What message texts and blanks keep instead of the code. */
export const CODE_MASK = "••••••";
/** A code that could not go within this time has expired; it is not sent late. */
export const CODE_SEND_WINDOW_MS = 10 * 60_000;
/** Why a code recipient is not sent (again). */
export const CODE_NOT_RESENT = "One-time codes are never sent again. The person asks for a new code.";
export const CODE_EXPIRED = "The code expired before it could go. The person asks for a new code.";
/** How Message History labels a code's text. */
export const CODE_HIDDEN_LABEL = "One-time code (hidden)";

/** What a code is for: shown as its sender, and in the Audit Log. */
export type CodePurpose = "sign-in" | "new-contact" | "parent-link" | "admission-consent" | "pickup";
export type OneTimeCode = { code: string; purpose: CodePurpose };

const SENDER: Record<CodePurpose, string> = {
  "sign-in": "School OS (sign-in)",
  "new-contact": "School OS (new mobile number)",
  "parent-link": "School OS (Parent Link)",
  "admission-consent": "School OS (admission consent)",
  pickup: "School OS (pickup code)",
};
export const codeSenderWords = (purpose: CodePurpose) => SENDER[purpose];

/** The sender shown for a code message, from the record that asked for it. */
export function codeSender(m: { sourceType: string | null; trigger: string | null }): string {
  if (m.sourceType === "Parent Link Code") return SENDER["parent-link"];
  if (m.sourceType === "Application" || m.sourceType === "Enquiry") return SENDER["admission-consent"];
  if (m.trigger === "Pickup code") return SENDER.pickup;
  if (m.trigger?.startsWith("Confirmation code")) return SENDER["new-contact"];
  return SENDER["sign-in"];
}

export const isCodeMessage = (m: { messageType: string | null | undefined }) => m.messageType === ONE_TIME_CODE;

export const sealCode = (code: string) => encryptField(code);
/** The sealed code, or null when it cannot be read (it is then not sent). */
export function unsealCode(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  try {
    return decryptField(sealed);
  } catch {
    return null;
  }
}

/** Puts the real code in a text, just before it is handed to a provider. */
export const withCode = (text: string, code: string | null) => (code ? text.split(CODE_MASK).join(code) : text);

/** Whether a text has the code in it as a number of its own (never in a stored message). */
export function hasCode(text: string, code: string): boolean {
  return new RegExp(`(^|\\D)${code.replace(/\D/g, "")}(\\D|$)`).test(text);
}

/** A code message's text on screen: any code-like number hidden, even in a row kept from before codes were masked. */
export const hiddenCodeText = (text: string) => text.replace(/(^|\D)\d{4,8}(?=\D|$)/g, (_, before: string) => `${before}${CODE_MASK}`);
