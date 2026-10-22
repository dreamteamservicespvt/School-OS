import { createHash, randomBytes } from "node:crypto";

/** A random secret for a cookie or an invite link. Only its hash is stored. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The stored form of a browser's device id (see signInDevice in lib/current.ts). */
export const deviceKeyOf = (deviceId: string | null | undefined) => (deviceId ? hashToken(`device:${deviceId}`) : null);
