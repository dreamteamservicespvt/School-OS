// The eight screen languages (00-global.md P17; 20-settings.md, School Profile, Language and region).
// Shared by server and browser code: no catalogues here, so it is small.

export const SCREEN_LANGUAGES = ["en", "hi", "te", "ta", "kn", "ml", "mr", "bn"] as const;
export type Lang = (typeof SCREEN_LANGUAGES)[number];

/** Each language in its own script, so a person finds theirs even when the screen is in another. */
export const LANGUAGE_OWN_NAME: Record<Lang, string> = {
  en: "English",
  hi: "हिन्दी",
  te: "తెలుగు",
  ta: "தமிழ்",
  kn: "ಕನ್ನಡ",
  ml: "മലയാളം",
  mr: "मराठी",
  bn: "বাংলা",
};

/** The English name, for staff screens and the audit log. */
export const LANGUAGE_ENGLISH_NAME: Record<Lang, string> = {
  en: "English",
  hi: "Hindi",
  te: "Telugu",
  ta: "Tamil",
  kn: "Kannada",
  ml: "Malayalam",
  mr: "Marathi",
  bn: "Bengali",
};

/** "తెలుగు (Telugu)": the own name, with the English name when they differ. */
export function languageChoiceLabel(lang: Lang): string {
  return lang === "en" ? "English" : `${LANGUAGE_OWN_NAME[lang]} (${LANGUAGE_ENGLISH_NAME[lang]})`;
}

/** The browser's chosen language for pages without a sign-in (Parent Link, the admission form, sign-in). */
export const LANG_COOKIE = "sos_lang";

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (SCREEN_LANGUAGES as readonly string[]).includes(value);
}

export function cleanLang(value: unknown, fallback: Lang = "en"): Lang {
  return isLang(value) ? value : fallback;
}

/**
 * The languages a school has switched on, always with its default language and in the fixed
 * order above. English is used when a school has none recorded.
 */
export function schoolLanguages(languages: readonly string[] | null | undefined, defaultLanguage?: string | null): Lang[] {
  const on = new Set<string>([...(languages ?? []), ...(defaultLanguage ? [defaultLanguage] : [])]);
  const list = SCREEN_LANGUAGES.filter((l) => on.has(l));
  return list.length ? list : ["en"];
}

/**
 * The language a screen is shown in: the first wanted language the school has switched on,
 * otherwise the school's default language, otherwise English.
 */
export function pickLanguage(wanted: readonly (string | null | undefined)[], enabled: readonly Lang[], defaultLanguage?: string | null): Lang {
  for (const w of wanted) if (isLang(w) && enabled.includes(w)) return w;
  if (isLang(defaultLanguage) && enabled.includes(defaultLanguage)) return defaultLanguage;
  return enabled.includes("en") ? "en" : enabled[0] ?? "en";
}
