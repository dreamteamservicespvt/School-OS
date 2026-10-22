// "Translate for parents" on Send Message (gap list G40): the typed message is
// translated through the one AI gateway, once for each language the chosen
// parents really need. What is sent is only the typed words, the title and the
// language: never a parent's name, phone number or anything about the
// children. Each request is logged as an AI Call (src/lib/ai/index.ts).
//
// A translation is a suggestion: the sender reads it, may edit it, and it is
// used only when they confirm and send. A translation that loses, adds or
// changes a blank such as {student_name} is refused here and never offered.
import "server-only";

import * as z from "zod/v4";
import type { SchoolContext } from "../db";
import { aiTask } from "../ai";
import { TRANSLATION_LANGUAGE_NAME, translationProblem, type TranslationLanguage } from "../messaging/translation";

export const TRANSLATE_SYSTEM = [
  "You translate a short message from an Indian school to parents, from English into the language asked.",
  "Write it the way a school office would write to parents in that language: simple, polite and clear, in that language's own script.",
  "Translate the meaning faithfully. Do not add, leave out or explain anything.",
  "Words in curly braces, such as {student_name} or {date}, are blanks the school fills in later for each parent. Copy every blank exactly as it is, braces and English letters included, the same number of times. Never translate, change or drop a blank.",
  "Keep numbers, dates, times, amounts and links as they are.",
  "If there is a title, translate it too; if the title is empty, answer with an empty title.",
  "Answer only with the translated text and title.",
].join("\n");

export const translateAnswer = z.object({ text: z.string(), title: z.string() });

/** What goes to the AI service for one language: the typed words and the language, nothing else. */
export const translateInput = (english: { text: string; title: string | null }, lang: TranslationLanguage) => ({
  into: TRANSLATION_LANGUAGE_NAME[lang],
  text: english.text,
  title: english.title ?? "",
});

const STOPS = new Set(["assistant-off", "feature-off", "not-built", "role-not-allowed", "not-connected", "daily-limit", "restricted-data"]);

export type TranslatedVersion = { language: TranslationLanguage; name: string; text: string; title: string | null; problem: string | null };

/**
 * One translation per language, in turn. A language the AI service could not do, or did with a blank
 * changed, comes back empty with the reason; the sender may type it, or those parents get English.
 */
export async function translateTyped(ctx: SchoolContext, english: { text: string; title: string | null }, languages: readonly TranslationLanguage[]): Promise<TranslatedVersion[]> {
  const out: TranslatedVersion[] = [];
  let stop: string | null = null;
  for (const lang of languages) {
    const name = TRANSLATION_LANGUAGE_NAME[lang];
    // Switched off, not connected or the day's requests used: the other languages are not asked either.
    if (stop) { out.push({ language: lang, name, text: "", title: null, problem: stop }); continue; }
    const r = await aiTask(ctx, { feature: "ai-translation", purpose: `Translate a typed message into ${name}`, system: TRANSLATE_SYSTEM, input: translateInput(english, lang), schema: translateAnswer, effort: "low", maxTokens: 3000 });
    if (!r.ok) {
      if (STOPS.has(r.reason)) stop = r.words;
      out.push({ language: lang, name, text: "", title: null, problem: r.words });
      continue;
    }
    const t = { text: r.data.text.trim(), title: r.data.title.trim() || null };
    const p = translationProblem(english, t, lang);
    if (p) {
      const blank = /\{|braces/.test(p);
      out.push({ language: lang, name, text: "", title: null, problem: blank ? `The AI service changed a blank in the ${name} version, so it is not used. Type the ${name} version yourself, or send in English.` : `The AI service gave no usable ${name} version. Type it yourself, or send in English.` });
      continue;
    }
    out.push({ language: lang, name, text: t.text, title: t.title, problem: null });
  }
  return out;
}
