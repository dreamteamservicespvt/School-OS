// Which language a screen is shown in, and its translator, on the server.
//
//  - A signed-in person: their own choice in My profile, if the school has that language
//    switched on; otherwise the school's default language (00-global.md §1.4).
//  - Pages with no sign-in (Parent Link, the admission form, sign-in): the language this
//    browser chose, if the school has it on; then the language the page suggests (a parent's
//    message language); then the school's default language.
import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { getCurrent } from "../current";
import { withSchool } from "../db";
import { LANG_COOKIE, cleanLang, pickLanguage, schoolLanguages, type Lang, SCREEN_LANGUAGES } from "./languages";
import { translator, type Catalogue, type T } from "./t";
import { hi } from "./catalogues/hi";
import { te } from "./catalogues/te";
import { ta } from "./catalogues/ta";
import { kn } from "./catalogues/kn";
import { ml } from "./catalogues/ml";
import { mr } from "./catalogues/mr";
import { bn } from "./catalogues/bn";

export const CATALOGUES: Record<Lang, Catalogue> = { en: {}, hi, te, ta, kn, ml, mr, bn };

/** One language's words, to hand to <I18nProvider> for the browser components of a page. */
export function catalogueFor(lang: Lang): Record<string, string> {
  return CATALOGUES[lang] as Record<string, string>;
}

/** The translator for one language. */
export function makeT(lang: Lang): T {
  return translator(lang, catalogueFor(lang));
}

/** A signed-in person's screen language (their choice, kept within the school's languages). */
export function personLanguage(person: { language: string | null }, school: { languages: string[]; defaultLanguage: string }): Lang {
  return pickLanguage([person.language], schoolLanguages(school.languages, school.defaultLanguage), school.defaultLanguage);
}

/** The language this browser chose last (sign-in page, Parent Link, admission form), if any. */
export async function browserLanguage(): Promise<Lang | null> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return v && (SCREEN_LANGUAGES as readonly string[]).includes(v) ? cleanLang(v) : null;
}

/**
 * The language of a page with no sign-in, for one school: this browser's choice, then the
 * suggested language (e.g. the guardian's message language), then the school's default.
 */
export async function publicLanguage(school: { languages: string[]; defaultLanguage: string }, suggested?: string | null): Promise<{ lang: Lang; choices: Lang[] }> {
  const choices = schoolLanguages(school.languages, school.defaultLanguage);
  return { lang: pickLanguage([await browserLanguage(), suggested], choices, school.defaultLanguage), choices };
}

/** The screen language of this request: the signed-in person's, or this browser's choice, or English. */
export const screenLanguage = cache(async (): Promise<Lang> => {
  const current = await getCurrent().catch(() => null);
  if (current) return personLanguage(current.user, current.school);
  return (await browserLanguage()) ?? "en";
});

/** The translator for this request's screen language. */
export async function getT(): Promise<T> {
  return makeT(await screenLanguage());
}

/**
 * A page's browser-tab title in the screen language: the whole title when the catalogue has
 * it, else each " · " part ("Import books · Library Management"). English stays as written.
 */
export async function pageTitle(text: string): Promise<string> {
  const lang = await screenLanguage();
  if (lang === "en") return text;
  const t = makeT(lang);
  const dict = catalogueFor(lang);
  if (dict[text]) return t.any(text);
  return text.split(" · ").map((part) => t.any(part)).join(" · ");
}

/** Keeps a chosen language on this browser for a year (pages with no sign-in use it). */
export async function rememberLanguage(lang: Lang) {
  (await cookies()).set(LANG_COOKIE, lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}

/** The language of a school's public page (the admission form, its status page): this browser's choice, else the school's default. */
export async function schoolPageLanguage(schoolId: string): Promise<{ lang: Lang; choices: Lang[]; t: T }> {
  const school = await withSchool({ schoolId, userId: null }, (tx) => tx.school.findUnique({ where: { id: schoolId }, select: { languages: true, defaultLanguage: true } }));
  const { lang, choices } = await publicLanguage(school ?? { languages: ["en"], defaultLanguage: "en" });
  return { lang, choices, t: makeT(lang) };
}
