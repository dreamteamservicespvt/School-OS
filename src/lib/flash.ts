// A short success message after saving, with a link to the result (P15),
// and an Undo for simple changes (P5). Carried to the next page in a cookie.
import "server-only";

import { cookies } from "next/headers";

export const FLASH_COOKIE = "sos_flash";

export type Flash = {
  message: string;
  tone?: "success" | "info" | "danger";
  link?: { href: string; label: string };
  /** An undo action key registered in src/lib/undo.ts, with its argument. */
  undo?: { kind: string; id: string };
};

export async function flash(f: Flash) {
  (await cookies()).set(FLASH_COOKIE, JSON.stringify(f), { path: "/", maxAge: 30, sameSite: "lax", httpOnly: false });
}

export async function readFlash(): Promise<Flash | null> {
  const raw = (await cookies()).get(FLASH_COOKIE)?.value;
  if (!raw) return null;
  try {
    const f = JSON.parse(raw) as Flash;
    return typeof f.message === "string" ? f : null;
  } catch {
    return null;
  }
}
