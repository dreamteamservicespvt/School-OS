// The Parent Link's secret, worked out from the link's id with a server key
// (HMAC). It is never stored; the database keeps only its hash (rule 31).
import { createHash, createHmac } from "node:crypto";

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

/** Puts the real links in a text, just before it is handed to a provider. */
export const withRealLinks = (text: string) =>
  text
    .replace(PLACEHOLDER, (_, id: string) => linkUrl(id))
    .replace(INVITE_PLACEHOLDER, (_, id: string, nonce: string) => inviteUrl(id, nonce))
    .replace(SURVEY_PLACEHOLDER, (_, school: string, id: string) => surveyUrl(school, id));
/** How a text with a link is shown on screen: never the link itself. */
export const withHiddenLinks = (text: string) =>
  text.replace(PLACEHOLDER, "[personal Parent Link]").replace(INVITE_PLACEHOLDER, "[personal invite link]").replace(SURVEY_PLACEHOLDER, "[personal survey link]");

