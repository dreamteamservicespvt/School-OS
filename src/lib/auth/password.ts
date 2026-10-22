// Passwords are hashed with Argon2id (08-platform-security.md §2): stored so
// that nobody, including DREAM TEAM, can read them back.

import { hash, verify } from "@node-rs/argon2";
import { isCommonPassword } from "./common-passwords";

const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

/** Used when the username does not exist, so a wrong username takes as long as a wrong password. */
let dummyHash: Promise<string> | null = null;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword("school-os-timing-guard");
  await verifyPassword(await dummyHash, password);
}

/**
 * The rules every new password follows: at least `minLength` characters (8, or
 * more when the school's Password Policy asks, password-rules.ts), a letter and
 * a number, and not a common password (common-passwords.ts).
 */
export function checkNewPassword(password: string, minLength = 8): string | null {
  if (password.length < minLength) return `Use at least ${minLength} characters.`;
  if (password.length > 200) return "Use at most 200 characters.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Use at least one letter and one number.";
  if (isCommonPassword(password)) return "This password is too common and easy to guess. Choose one that is not a common word, name or keyboard pattern.";
  return null;
}
