// Extra encryption for highly sensitive fields (08-platform-security.md §3):
// Aadhaar number, bank account number, payment gateway and messaging keys.
// AES-256-GCM with a key from the secret store (FIELD_ENCRYPTION_KEY).

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

function key(): Buffer {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) throw new Error("FIELD_ENCRYPTION_KEY is not set");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("FIELD_ENCRYPTION_KEY must be 32 bytes, base64");
  return buf;
}

export function encryptField(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), data.toString("base64")].join(":");
}

export function decryptField(stored: string): string {
  const [version, iv, tag, data] = stored.split(":");
  if (version !== VERSION || !iv || !tag || !data) throw new Error("This value was not encrypted by School OS");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

/** Shown to everyone except those allowed to see the full value: only the last 4 characters. */
export function maskLast4(value: string): string {
  const clean = value.replace(/\s+/g, "");
  if (clean.length <= 4) return "•".repeat(clean.length);
  return "•".repeat(clean.length - 4) + clean.slice(-4);
}
