// The translator every screen uses, on the server and in the browser.
//
// Keys are the English words themselves, so a screen reads naturally in the code and a missing
// translation shows the English words, never a blank or a key. Blanks are written {name}.
// The same English words that need two different translations carry a note after "@@",
// e.g. "Issue@@library"; the English screen shows only the part before "@@".
//
// Only types come from the catalogues here, so a browser page carries one language's words
// (sent by the server, src/lib/i18n/server.ts), never all eight catalogues.
import type { MessageKey } from "./catalogues/en";
import type { Lang } from "./languages";
import { dateBlank } from "./dates";

export type { MessageKey };
export type Catalogue = Partial<Record<MessageKey, string>>;
export type Vars = Record<string, string | number | bigint | null | undefined>;

export type T = {
  (key: MessageKey, vars?: Vars): string;
  /** Words that come from data or settings (a menu label, a section name): translated when the catalogue has them. */
  any: (text: string, vars?: Vars) => string;
  lang: Lang;
};

/** The English words of a key: the part before "@@". */
export function englishOf(key: string): string {
  const at = key.indexOf("@@");
  return at < 0 ? key : key.slice(0, at);
}

/** Puts values into the {blanks}. A blank with no value stays as it is, so the gap is visible. */
export function fill(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = vars[name];
    return v === null || v === undefined ? whole : String(v);
  });
}

/** The {blanks} in a text, sorted, for checking that every language has the same ones. */
export function blanksOf(text: string): string[] {
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
}

// Amounts, dates, clock times and plain numbers inside words that come from data or the rules.
// A comma after a number ("dropped for 3, marks for 9") is not part of it.
// No lookbehind: this file reaches the browser, and iOS Safari before 16.4 cannot parse one (every
// page would stop working). The character before a bare number is captured and put back instead.
const PIECES = /(₹\d(?:[\d,]*\d)?(?:\.\d+)?)|(\b\d{2}-\d{2}-\d{4}\b)|(\b\d{1,2}:\d{2} [AP]M\b)|(^|[^\w.₹])(\d(?:[\d,]*\d)?(?:\.\d+)?)(?!\w)/g;

/**
 * "72 pieces of homework to check" as the catalogue keeps it: "{n} pieces of homework to check"
 * (also {amount}, {date}, {time}; a second one is {n2}). Null when the words have no numbers.
 */
export function withBlanks(text: string): { key: string; vars: Record<string, string> } | null {
  const vars: Record<string, string> = {};
  const used: Record<string, number> = {};
  const blank = (p: string, kind: string) => {
    const i = (used[kind] = (used[kind] ?? 0) + 1);
    const name = i === 1 ? kind : `${kind}${i}`;
    vars[name] = p;
    return `{${name}}`;
  };
  const key = text.replace(PIECES, (_m: string, amount?: string, date?: string, time?: string, before?: string, n?: string) =>
    amount ? blank(amount, "amount") : date ? blank(date, "date") : time ? blank(time, "time") : `${before ?? ""}${blank(n ?? "", "n")}`);
  return key === text ? null : { key, vars };
}

/** A translator for one language from its catalogue; English (the key) where it has no entry. */
export function translator(lang: Lang, dict: Readonly<Record<string, string>>): T {
  const has = (key: string) => Boolean(dict[key]?.trim());
  // A date in words put into a blank ("Attendance opens again on {day}.") is said in the language too.
  const local = (vars?: Vars): Vars | undefined => {
    if (!vars || lang === "en") return vars;
    const out: Vars = {};
    for (const [k, v] of Object.entries(vars)) out[k] = typeof v === "string" ? dateBlank(t, v) : v;
    return out;
  };
  const word = (key: string, vars?: Vars) => fill(has(key) ? dict[key] : englishOf(key), has(key) ? local(vars) : vars);
  const t = ((key: MessageKey, vars?: Vars) => word(key, vars)) as T;
  // Words from data or the rules with a number in them are found by their blanks, so the dashboard's
  // "72 pieces of homework to check" is said whole in the screen's language (layman loop 3).
  t.any = (text, vars) => {
    if (lang === "en" || has(text)) return word(text, vars);
    const b = withBlanks(text);
    return b && has(b.key) ? fill(dict[b.key], { ...b.vars, ...vars }) : word(text, vars);
  };
  t.lang = lang;
  return t;
}

/** English, for code that runs before a language is known. */
export const englishT: T = translator("en", {});
