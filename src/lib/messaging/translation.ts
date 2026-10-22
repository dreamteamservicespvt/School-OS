// Translation of a typed message into each parent's language (gap list G40;
// 11-communication.md, Send Message, Translation; 00-global.md §2.1).
//
// - Only a typed message is translated, never a template: templates use their
//   own approved language versions.
// - Only on channels that carry free text to a parent: WhatsApp, email and the
//   app. An SMS goes as typed: its words sit in a DLT-registered template, and
//   Indian scripts cost two to three times the SMS credits.
// - The sender reads and may edit each translation before sending; only then
//   is it used. The parent's copy ends with "Translated from English" in their
//   own language and in English.
// - Blanks such as {student_name} must come back exactly as they went: a
//   translation that drops, adds or changes one is refused.
// Plain functions with no database, so the Send Message form can check an
// edited translation in the browser while the server checks it again.
import { strayBlanks } from "./blanks";

/** The languages a typed message can be translated into (the school's message languages other than English). */
export const TRANSLATION_LANGUAGES = ["hi", "te", "ta", "kn", "ml", "mr", "bn"] as const;
export type TranslationLanguage = (typeof TRANSLATION_LANGUAGES)[number];

export const isTranslationLanguage = (v: unknown): v is TranslationLanguage => typeof v === "string" && (TRANSLATION_LANGUAGES as readonly string[]).includes(v);

export const TRANSLATION_LANGUAGE_NAME: Record<TranslationLanguage, string> = {
  hi: "Hindi", te: "Telugu", ta: "Tamil", kn: "Kannada", ml: "Malayalam", mr: "Marathi", bn: "Bengali",
};

/** "Translated from English" in each language, written once here (not by the AI service), so it is always the same. */
export const TRANSLATED_FROM_ENGLISH: Record<TranslationLanguage, string> = {
  hi: "अंग्रेज़ी से अनुवादित",
  te: "ఇంగ్లీష్ నుండి అనువదించబడింది",
  ta: "ஆங்கிலத்திலிருந்து மொழிபெயர்க்கப்பட்டது",
  kn: "ಇಂಗ್ಲಿಷ್‌ನಿಂದ ಅನುವಾದಿಸಲಾಗಿದೆ",
  ml: "ഇംഗ്ലീഷിൽ നിന്ന് വിവർത്തനം ചെയ്തത്",
  mr: "इंग्रजीतून अनुवादित",
  bn: "ইংরেজি থেকে অনূদিত",
};

/** The last line of a translated message: "(ఇంగ్లీష్ నుండి అనువదించబడింది · Translated from English)". */
export const translatedLabel = (lang: TranslationLanguage) => `(${TRANSLATED_FROM_ENGLISH[lang]} · Translated from English)`;

/** The text a parent gets: the confirmed translation with the label on its own line. */
export const withTranslatedLabel = (text: string, lang: TranslationLanguage) => `${text.trim()}\n\n${translatedLabel(lang)}`;

/** Channels whose typed text may be translated. Never SMS. */
export const TRANSLATED_CHANNELS: ReadonlySet<string> = new Set(["whatsapp", "email", "app"]);

/** One language version the sender confirmed. */
export type Translation = { text: string; title: string | null; edited?: boolean };
export type Translations = Partial<Record<TranslationLanguage, Translation>>;

/** Every blank in a text, with repeats, sorted: two texts with the same list keep the same blanks. */
const blankList = (text: string) => [...text.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]).sort();

/**
 * Why a translation cannot be used, or null: it must keep exactly the blanks of
 * the English text ({student_name} stays {student_name}, not translated, lost
 * or added), have no stray braces, and not be empty.
 */
export function translationProblem(english: { text: string; title?: string | null }, t: { text: string; title?: string | null }, lang: TranslationLanguage): string | null {
  const name = TRANSLATION_LANGUAGE_NAME[lang];
  if (!t.text.trim()) return `The ${name} version is empty. Type it, or send in English.`;
  if (t.text.length > 1000) return `The ${name} version has ${t.text.length} characters. It can have at most 1,000.`;
  if ((t.title ?? "").length > 120) return `The ${name} title can be at most 120 characters.`;
  if (english.title?.trim() && !t.title?.trim()) return `The ${name} version has no title. Type it, or send in English.`;
  for (const [en, tr] of [[english.text, t.text], [english.title ?? "", t.title ?? ""]] as const) {
    const a = blankList(en);
    const b = blankList(tr);
    if (a.join() !== b.join()) {
      const lost = [...new Set(a.filter((k) => b.filter((x) => x === k).length < a.filter((x) => x === k).length))];
      const added = [...new Set(b.filter((k) => a.filter((x) => x === k).length < b.filter((x) => x === k).length))];
      const words = [
        ...(lost.length ? [`lost ${lost.map((k) => `{${k}}`).join(", ")}`] : []),
        ...(added.length ? [`has ${added.map((k) => `{${k}}`).join(", ")} that the English does not`] : []),
      ].join(" and ");
      return `The ${name} version ${words}. Blanks stay exactly as in English, in braces. Put them back as they are in English, or send in English.`;
    }
    const stray = strayBlanks(tr);
    if (stray.length) return `The ${name} version has braces that are not a blank: ${stray.join(", ")}. Blanks stay exactly as in English, such as {student_name}.`;
  }
  return null;
}

/** A short fingerprint of the English the translations were made from, so a change to it after translating is noticed. */
export function translationKey(text: string, title: string | null | undefined): string {
  const s = `${text.trim()}\u0000${(title ?? "").trim()}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length}-${(h >>> 0).toString(36)}`;
}

/** The form fields the Send Message form uses for the confirmed translations. */
export const TR_FIELDS = {
  on: "translate",
  from: "translatedFrom",
  text: (l: string) => `tr_text_${l}`,
  title: (l: string) => `tr_title_${l}`,
  edited: (l: string) => `tr_edited_${l}`,
};

export type ReadTranslations = { ok: true; translations: Translations | null } | { ok: false; problem: string };

/**
 * The confirmed translations sent with the form, checked: made from the English
 * as it now stands, and each keeping its blanks. Null when none were confirmed.
 */
export function readTranslations(form: FormData, english: { text: string | null; title: string | null }): ReadTranslations {
  if (form.get(TR_FIELDS.on) !== "on") return { ok: true, translations: null };
  const text = (english.text ?? "").trim();
  if (!text) return { ok: true, translations: null };
  if (String(form.get(TR_FIELDS.from) ?? "") !== translationKey(text, english.title)) {
    return { ok: false, problem: "The message changed after it was translated. Translate it again, or send in English." };
  }
  const out: Translations = {};
  for (const lang of TRANSLATION_LANGUAGES) {
    const raw = form.get(TR_FIELDS.text(lang));
    if (raw === null) continue;
    const t: Translation = { text: String(raw).trim(), title: String(form.get(TR_FIELDS.title(lang)) ?? "").trim() || null, edited: form.get(TR_FIELDS.edited(lang)) === "on" };
    const p = translationProblem({ text, title: english.title }, t, lang);
    if (p) return { ok: false, problem: p };
    out[lang] = t;
  }
  return { ok: true, translations: Object.keys(out).length ? out : null };
}
