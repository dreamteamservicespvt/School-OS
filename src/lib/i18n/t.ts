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

/** A translator for one language from its catalogue; English (the key) where it has no entry. */
export function translator(lang: Lang, dict: Readonly<Record<string, string>>): T {
  const word = (key: string, vars?: Vars) => {
    const own = dict[key];
    return fill(own && own.trim() ? own : englishOf(key), vars);
  };
  const t = ((key: MessageKey, vars?: Vars) => word(key, vars)) as T;
  t.any = word;
  t.lang = lang;
  return t;
}

/** English, for code that runs before a language is known. */
export const englishT: T = translator("en", {});
