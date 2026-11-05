// Drafts of forms in dialogs and sheets (owner's testing, 2026-11-04): what a person typed
// stays in the form when the dialog is closed by mistake or the page reloads, and comes
// back when it opens again. The draft goes only after a save that worked, or "Clear".
//
// Kept in this browser tab only (sessionStorage), per school and person, never on the
// server. Private values are never kept: passwords, OTP codes, card, UPI/UTR and bank
// references, Aadhaar numbers and the like (see isPrivateField).

import { formatClock } from "./format";

export type DraftValues = Record<string, string | string[]>;

export type Draft = {
  /** What the form showed when it opened. A draft only comes back into the same starting form. */
  base: string;
  values: DraftValues;
  savedAt: number;
};

/** Drafts older than this are dropped. */
export const DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const PREFIX = "sos:draft:";

/** The storage key: the person (school and login), the page and the form. */
export function draftKey(owner: string, page: string, form: string): string {
  return `${PREFIX}${owner}|${page}|${form}`;
}

export function isDraftKey(key: string): boolean {
  return key.startsWith(PREFIX);
}

const PRIVATE_NAME = /pass(word|code)?|pwd|otp|^code$|^pin$|mpin|pinno|cvv|cvc|card(no|number|last)|^card$|upi|utr|imps|neft|rtgs|ifsc|account(no|number)?$|acct|cheque|chq|reference|^ref$|ref(no|number)$|txn|transaction|aadha+r|uidai|^pan$|pan(no|number)$|secret|token|apikey/i;
const PRIVATE_TYPES = new Set(["password", "file", "hidden", "submit", "button", "reset", "image"]);

/**
 * True for fields a draft must never keep: passwords and codes, payment references,
 * identity numbers and secrets, judged by the field's name, type and autocomplete.
 */
export function isPrivateField(name: string, type = "text", autocomplete = ""): boolean {
  if (!name) return true;
  if (PRIVATE_TYPES.has(type.toLowerCase())) return true;
  const ac = autocomplete.toLowerCase();
  if (ac.includes("one-time-code") || ac.includes("password") || ac.startsWith("cc-") || ac.includes(" cc-")) return true;
  return PRIVATE_NAME.test(name.replace(/[\s_.\-[\]]/g, ""));
}

/** A stable text of a form's values, to compare two moments of the same form. */
export function fingerprint(values: DraftValues): string {
  return JSON.stringify(Object.keys(values).sort().map((k) => [k, values[k]]));
}

/** The fields whose values differ from what the form started with. */
export function changedFrom(start: DraftValues, now: DraftValues): DraftValues {
  const out: DraftValues = {};
  for (const [k, v] of Object.entries(now)) {
    if (JSON.stringify(start[k] ?? "") !== JSON.stringify(v)) out[k] = v;
  }
  return out;
}

/** Reads a kept draft; null when there is none, it is broken, too old, or from a different starting form. */
export function readDraft(raw: string | null, base: string, now = Date.now()): Draft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Draft;
    if (!d || typeof d !== "object" || typeof d.base !== "string" || typeof d.savedAt !== "number" || !d.values || typeof d.values !== "object") return null;
    if (now - d.savedAt > DRAFT_MAX_AGE_MS || d.base !== base) return null;
    const values: DraftValues = {};
    for (const [k, v] of Object.entries(d.values)) {
      if (isPrivateField(k)) continue;
      if (typeof v === "string" || (Array.isArray(v) && v.every((x) => typeof x === "string"))) values[k] = v;
    }
    return Object.keys(values).length ? { ...d, values } : null;
  } catch {
    return null;
  }
}

/** The text to keep, or null when nothing was changed (and any old draft should go). */
export function writeDraft(base: string, start: DraftValues, now: DraftValues, at = Date.now()): string | null {
  const values = changedFrom(start, now);
  for (const k of Object.keys(values)) if (isPrivateField(k)) delete values[k];
  if (!Object.keys(values).length) return null;
  return JSON.stringify({ base, values, savedAt: at } satisfies Draft);
}

/** "2026-11-05" as "05-11-2026" for the date box; "15:17" as "3:17 PM" for the time box. */
export function boxText(value: string): string {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (d) return `${d[3]}-${d[2]}-${d[1]}`;
  return /^\d{2}:\d{2}$/.test(value) ? formatClock(value) : value;
}
