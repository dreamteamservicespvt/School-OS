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

/** What message texts keep instead of the link itself. */
export const PLACEHOLDER = /⟦parent-link:([0-9a-f-]{36})⟧/g;
export const placeholderFor = (linkId: string) => `⟦parent-link:${linkId}⟧`;
/** Puts the real link in a text, just before it is handed to a provider. */
export const withRealLinks = (text: string) => text.replace(PLACEHOLDER, (_, id: string) => linkUrl(id));
/** How a text with a link is shown on screen: never the link itself. */
export const withHiddenLinks = (text: string) => text.replace(PLACEHOLDER, "[personal Parent Link]");

