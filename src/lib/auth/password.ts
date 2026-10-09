// Passwords are hashed with Argon2id (08-platform-security.md §2): stored so
// that nobody, including DREAM TEAM, can read them back.

import { hash, verify } from "@node-rs/argon2";

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

/** Password rules (inferred until Settings, Users & Permissions sets them): at least 8 characters, with a letter and a number. */
export function checkNewPassword(password: string): string | null {
  if (password.length < 8) return "Use at least 8 characters.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Use at least one letter and one number.";
  if (password.length > 200) return "Use at most 200 characters.";
  return null;
}
