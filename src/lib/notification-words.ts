// Notification words in each reader's language (owner decision 14, 15-11-2026).
//
// A notification is made from an English catalogue sentence with {blanks} (the key) and the
// values for its blanks. The English text is still filled and stored, so search, copies by
// WhatsApp, SMS or email, and old screens keep working. The bell, the Notifications page and the
// push alert say the key in the reader's own language. Names, amounts and dates stay exactly as
// they are; English words from the rules (a status, "3 periods") are written { t: "…" } and said
// in the reader's language too. A notification made before this has no key and shows its text.
import { englishOf, fill, type MessageKey, type T } from "./i18n/t";
import { screenLine } from "./i18n/messages";

/** A blank's value: data said exactly as it is, or English words from the rules ({ t }) said in the reader's language. */
export type NoteValue = string | number | bigint | null | undefined | { t: string };
export type NoteValues = Record<string, NoteValue>;
export type StoredValues = Record<string, string | number | { t: string }>;
/** A catalogue sentence and its values, for words made before the notification (a reminder kept for later too). */
export type NoteWords = { key: MessageKey; values?: NoteValues };

/** English words from the rules, said in the reader's language: word("Approved"), word(plural(3, "period")). */
export const word = (text: string): { t: string } => ({ t: text });

/** The values as they are kept on the notification (JSON): no bigint, no empty values. */
export function storedValues(values?: NoteValues): StoredValues {
  const out: StoredValues = {};
  for (const [k, v] of Object.entries(values ?? {})) {
    if (v === null || v === undefined) out[k] = "";
    else if (typeof v === "bigint") out[k] = v.toString();
    else if (typeof v === "object") out[k] = { t: String(v.t) };
    else out[k] = v;
  }
  return out;
}

function plain(values?: NoteValues): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(storedValues(values))) out[k] = typeof v === "object" ? v.t : v;
  return out;
}

/** The English text of a key and its values: what the notification's text column keeps. */
export function englishNote(key: MessageKey | string, values?: NoteValues): string {
  return fill(englishOf(key), plain(values));
}

function readValues(raw: unknown): StoredValues {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as StoredValues) : {};
}

/**
 * A notification's words in the reader's language. With a key: the catalogue sentence in that
 * language with its values; without one (made before 15-11-2026, or a person's own message): the
 * stored English text, with the sentences the catalogue knows said in the language.
 */
export function noteText(t: T, n: { text: string; textKey?: string | null; textValues?: unknown }): string {
  if (!n.textKey) return screenLine(t, n.text);
  if (t.lang === "en") return n.text;
  const vars: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(readValues(n.textValues))) {
    vars[k] = v && typeof v === "object" ? screenLine(t, String((v as { t: unknown }).t ?? "")) : (v as string | number);
  }
  return t.any(n.textKey, vars);
}
