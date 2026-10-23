// The Parent Link's secret, worked out from the link's id with a server key
// (HMAC). It is never stored; the database keeps only its hash (rule 31).
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

function secret(): Buffer {
  const raw = process.env.PARENT_LINK_SECRET ?? process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) throw new Error("PARENT_LINK_SECRET is not set");
  return Buffer.from(raw);
}

/** The link's secret, worked out from its id. Never stored. */
export function tokenFor(linkId: string): string {
  return createHmac("sha256", secret()).update(`parent-link:${linkId}`).digest("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function linkUrl(linkId: string) {
  return `${appUrl()}/p/${tokenFor(linkId)}`;
}

/**
 * The secret of a fee payment link started from Parent Link's Pay button,
 * worked out from the Payment Link's id, so a second tap can be sent to the
 * same open link (src/lib/fees/online.ts). Only its hash is stored.
 */
export function payLinkTokenFor(paymentLinkId: string): string {
  return createHmac("sha256", secret()).update(`pay-link:${paymentLinkId}`).digest("base64url");
}

/** What message texts keep instead of the link itself. */
export const PLACEHOLDER = /⟦parent-link:([0-9a-f-]{36})⟧/g;
export const placeholderFor = (linkId: string) => `⟦parent-link:${linkId}⟧`;

// Invite links for School OS logins (Settings, Users & Permissions) travel the
// same way: the message keeps a placeholder, and the link's secret is worked
// out from the login's id and a random nonce with the server key, so nobody
// reading Message History can open someone else's invite.
const INVITE_NONCE = /^[A-Za-z0-9_-]{16,64}$/;
/** The invite link's secret for a login and nonce. Only its hash is stored on the login. */
export function inviteTokenFor(userLoginId: string, nonce: string): string {
  if (!INVITE_NONCE.test(nonce)) throw new Error("Bad invite nonce");
  return createHmac("sha256", secret()).update(`staff-invite:${userLoginId}:${nonce}`).digest("base64url");
}
export const INVITE_PLACEHOLDER = /⟦invite:([0-9a-f-]{36}):([A-Za-z0-9_-]{16,64})⟧/g;
export const invitePlaceholderFor = (userLoginId: string, nonce: string) => `⟦invite:${userLoginId}:${nonce}⟧`;
export const inviteUrl = (userLoginId: string, nonce: string) => `${appUrl()}/invite/${inviteTokenFor(userLoginId, nonce)}`;

// Survey links (Communication, Surveys): one per invited person, worked out the same way from the
// invite's id. The school's id is in the address so the answer page can look inside its walls.
export const surveyTokenFor = (inviteId: string) => createHmac("sha256", secret()).update(`survey:${inviteId}`).digest("base64url");
export const SURVEY_PLACEHOLDER = /⟦survey:([0-9a-f-]{36}):([0-9a-f-]{36})⟧/g;
export const surveyPlaceholderFor = (schoolId: string, inviteId: string) => `⟦survey:${schoolId}:${inviteId}⟧`;
export const surveyUrl = (schoolId: string, inviteId: string) => `${appUrl()}/s/${schoolId}/${surveyTokenFor(inviteId)}`;

// Fee payment links in reminders (06 §2, gap list G11): the message keeps a placeholder with the
// school and the Payment Link's id; the secret is worked out with the server key only when the
// message is handed to the provider, so Message History never holds a link that pays.
export const PAY_PLACEHOLDER = /⟦pay-link:([0-9a-f-]{36}):([0-9a-f-]{36})⟧/g;
export const payPlaceholderFor = (schoolId: string, paymentLinkId: string) => `⟦pay-link:${schoolId}:${paymentLinkId}⟧`;
export const payLinkUrl = (schoolId: string, paymentLinkId: string) => `${appUrl()}/pay/${schoolId}/${payLinkTokenFor(paymentLinkId)}`;

// Receipt links in the "Fee received" message (HANDOFF 3a): one for every posted payment, cash
// too, made the same way. The address is a single part, the school's id without dashes, the
// payment's id without dashes and the secret, so it fits the end of WhatsApp's "Open receipt"
// button (https://…/r/{{1}}).
export const RECEIPT_PLACEHOLDER = /⟦receipt:([0-9a-f-]{36}):([0-9a-f-]{36})⟧/g;
export const receiptPlaceholderFor = (schoolId: string, paymentId: string) => `⟦receipt:${schoolId}:${paymentId}⟧`;
const receiptSecret = (schoolId: string, paymentId: string) => createHmac("sha256", secret()).update(`receipt:${schoolId}:${paymentId}`).digest("base64url").slice(0, 22);
/** The end of a receipt's address, after /r/. */
export const receiptKeyFor = (schoolId: string, paymentId: string) => `${schoolId.replace(/-/g, "")}${paymentId.replace(/-/g, "")}${receiptSecret(schoolId, paymentId)}`;
export const receiptUrl = (schoolId: string, paymentId: string) => `${appUrl()}/r/${receiptKeyFor(schoolId, paymentId)}`;
const RECEIPT_KEY = /^([0-9a-f]{32})([0-9a-f]{32})([A-Za-z0-9_-]{22})$/;
const asUuid = (hex: string) => `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
/** The school and payment a receipt address is for, or null when it is not a real one. */
export function readReceiptKey(key: string): { schoolId: string; paymentId: string } | null {
  const m = RECEIPT_KEY.exec(key);
  if (!m) return null;
  const schoolId = asUuid(m[1]);
  const paymentId = asUuid(m[2]);
  const want = Buffer.from(receiptSecret(schoolId, paymentId));
  const got = Buffer.from(m[3]);
  return want.length === got.length && timingSafeEqual(want, got) ? { schoolId, paymentId } : null;
}

/** Puts the real links in a text, just before it is handed to a provider. */
export const withRealLinks = (text: string) =>
  text
    .replace(PLACEHOLDER, (_, id: string) => linkUrl(id))
    .replace(PAY_PLACEHOLDER, (_, school: string, id: string) => payLinkUrl(school, id))
    .replace(INVITE_PLACEHOLDER, (_, id: string, nonce: string) => inviteUrl(id, nonce))
    .replace(SURVEY_PLACEHOLDER, (_, school: string, id: string) => surveyUrl(school, id))
    .replace(RECEIPT_PLACEHOLDER, (_, school: string, id: string) => receiptUrl(school, id));
/** The end of the receipt address in a text (for WhatsApp's "Open receipt" button), or null. */
export function receiptKeyIn(text: string): string | null {
  const m = [...text.matchAll(RECEIPT_PLACEHOLDER)][0];
  return m ? receiptKeyFor(m[1], m[2]) : null;
}
/** The personal links in a text, as they would be sent (for the server log on a tester's computer). */
export function linksIn(text: string): { what: string; url: string }[] {
  return [
    ...[...text.matchAll(PLACEHOLDER)].map((m) => ({ what: "Parent Link", url: linkUrl(m[1]) })),
    ...[...text.matchAll(PAY_PLACEHOLDER)].map((m) => ({ what: "payment link", url: payLinkUrl(m[1], m[2]) })),
    ...[...text.matchAll(INVITE_PLACEHOLDER)].map((m) => ({ what: "invite link", url: inviteUrl(m[1], m[2]) })),
    ...[...text.matchAll(SURVEY_PLACEHOLDER)].map((m) => ({ what: "survey link", url: surveyUrl(m[1], m[2]) })),
    ...[...text.matchAll(RECEIPT_PLACEHOLDER)].map((m) => ({ what: "receipt link", url: receiptUrl(m[1], m[2]) })),
  ];
}
/** How a text with a link is shown on screen: never the link itself. */
export const withHiddenLinks = (text: string) =>
  text.replace(PLACEHOLDER, "[personal Parent Link]").replace(PAY_PLACEHOLDER, "[payment link]").replace(INVITE_PLACEHOLDER, "[personal invite link]").replace(SURVEY_PLACEHOLDER, "[personal survey link]").replace(RECEIPT_PLACEHOLDER, "[receipt link]");

