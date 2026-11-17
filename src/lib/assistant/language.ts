// The School OS Assistant's language rule (owner, 15 Nov 2026): the language
// follows the person. The first message sets the conversation's language and
// it is kept; it changes only when the person clearly switches (two messages
// in a row in the new language, or an explicit "speak in English/Telugu").
//
// Detection per message, with no extra paid call:
// - Telugu letters (U+0C00-U+0C7F) -> te; Devanagari (U+0900-U+097F) -> hi.
// - Latin letters -> en, unless enough romanised Telugu or Hindi words are in
//   it ("ee roju absent evaru?", "aaj kaun absent hai").
// - When the words decide nothing, the model's own judgement from the same
//   call that picks the tools is used (nextLanguage's `model` input).
// No database and no server code: the panel and the tests use it as is.
import { plainWords, wordsOf } from "../ask/questions";

export const ASSISTANT_LANGS = ["en", "te", "hi"] as const;
export type AssistantLang = (typeof ASSISTANT_LANGS)[number];
export const isAssistantLang = (v: unknown): v is AssistantLang => typeof v === "string" && (ASSISTANT_LANGS as readonly string[]).includes(v);

/** How sure a detection is: by script (sure), by romanised words (fairly sure), Latin with no hint (weak), or nothing to go on. */
export type Detected = { lang: AssistantLang | null; by: "script" | "words" | "latin" | "none" };

/** Romanised Telugu words staff type and say (Latin letters). Short, common, and rare in English sentences. */
const TELUGU_WORDS = new Set([
  "ee", "roju", "eeroju", "ivvala", "ivala", "ninna", "repu", "evaru", "evarevaru", "enti", "emiti", "enta", "entha", "enni", "ela", "elaa",
  "ekkada", "eppudu", "enduku", "cheppu", "cheppandi", "chepandi", "chupinchu", "choopinchu", "chupinchandi", "chudu", "chudandi",
  "ledu", "levu", "raledu", "raaledu", "vachindi", "vacharu", "vachaaru", "vachina", "unnaru", "unnayi", "undi", "unda", "kavali", "kaavali",
  "nenu", "meeru", "mee", "maa", "naaku", "naku", "memu", "vallu", "vaallu", "pillalu", "abbayi", "ammayi", "gurinchi", "tarvata", "taruvata",
  "chesi", "cheyyi", "cheyandi", "cheyali", "cheyyandi", "baaki", "bakaayi", "katti", "kattaru", "kattaledu", "intiki", "matladu", "matladandi",
  "telugulo", "inglishlo", "englishlo", "lo", "ki", "ni", "nu", "kuda", "kooda", "inka", "mari", "ante", "avunu", "kaadu", "sare", "chala",
  "naa", "emaina", "emanna", "unnaya", "unnayi", "rojulu", "varam", "nela", "sankhya", "hajaru", "gairhajaru", "selavu", "fee", // "fee" alone never decides: see below
  "unna", "unnavallu", "mandi", "ivvu", "ivvandi", "evaridi", "takkuva", "thakkuva", "kattani", "kattaledu", "vachina", "vachindi", "ayina", "ayyina",
  "ayyindi", "ayindi", "aindi", "teesukoledu", "rani", "raaledu", "vaaram", "poyina", "ninnati", "ivala", "namaskaram", "dhanyavadalu", "chupinchandi",
]);

/** Romanised Hindi words (Latin letters). */
const HINDI_WORDS = new Set([
  "aaj", "kal", "parso", "kaun", "kon", "kitna", "kitne", "kitni", "kya", "kab", "kahan", "kaise", "kyun", "kyon", "hai", "hain", "tha", "the",
  "nahi", "nahin", "nai", "batao", "bataiye", "bataye", "dikhao", "dikhaiye", "abhi", "sab", "sabhi", "wale", "wala", "wali", "mujhe", "humein",
  "hame", "chahiye", "aaya", "aaye", "aayi", "gaya", "gaye", "hua", "hue", "karo", "kijiye", "kariye", "liye", "mein", "bhi", "aur", "yeh", "ye",
  "woh", "wo", "din", "hafte", "mahine", "bacche", "bachche", "baccho", "bachon", "paise", "jama", "baaki", "baki", "bakaya", "chutti", "chhutti",
  "hindi", "bolo", "boliye", "baat", "ka", "ke", "ki", "ko", "se", "par",
]);

/** Words both lists hold, or English words that look alike: they never count on their own. */
const SHARED = new Set(["fee", "ki", "baaki", "baki", "lo", "ni", "nu", "ye", "the", "par", "hindi", "maa"]);

/** Explicit requests to change the language ("speak in English", "telugu lo cheppu", "हिंदी में बोलो"). */
const SWITCH_TO: { lang: AssistantLang; test: RegExp }[] = [
  { lang: "en", test: /\b(speak|talk|reply|answer|continue)\s+(in\s+)?english\b|\bin english (please|pls)\b|\benglish\s*(lo|mein|me)\s*(cheppu|cheppandi|matladu|matladandi|bolo|boliye|baat)|\benglish\s+please\b|ఇంగ్లీష్\s*లో|ఇంగ్లీషులో|अंग्रेज़ी में|अंग्रेजी में|इंग्लिश में/i },
  { lang: "te", test: /\b(speak|talk|reply|answer|continue)\s+(in\s+)?telugu\b|\btelugu\s*(lo|mein|me)\s*(cheppu|cheppandi|matladu|matladandi|bolo|boliye|baat)|\btelugulo\b|తెలుగులో\s*(చెప్పు|చెప్పండి|మాట్లాడు|మాట్లాడండి)|तेलुगु में/i },
  { lang: "hi", test: /\b(speak|talk|reply|answer|continue)\s+(in\s+)?hindi\b|\bhindi\s*(mein|me|lo)\s*(bolo|boliye|baat|cheppu|cheppandi|batao)|हिंदी में|హిందీ\s*లో|హిందీలో/i },
];

/**
 * "Explain me about the software, how to use it, in Telugu": a request to ANSWER in that language, said at the end of
 * the message after a word for saying or explaining. Live 17 Nov 2026: this owner question stayed English for the
 * AI's own line while the conversation turned Telugu, so the line was dropped for the stock greeting.
 * A school subject is not a request: "marks in Telugu", "who failed in Hindi".
 */
const ANSWER_IN = /\b(explain|describe|reply|answer|respond|speak|talk|write|say|tell|teach|continue)\b[^.?!]{0,120}?\bin\s+(telugu|hindi|english)\s*(please|pls)?\s*[.?!]*$/i;
const SUBJECT_IN = /\b(marks?|scores?|scored|fail(ed|s|ing)?|pass(ed|es)?|exams?|tests?|subjects?|grades?|results?|weak|teachers?|teaches|period|periods|medium|paper)\s+in\s+(telugu|hindi|english)\b/i;
const NAMED: Record<string, AssistantLang> = { telugu: "te", hindi: "hi", english: "en" };

/** The language the person explicitly asked to switch to, or null. */
export function explicitSwitch(text: string): AssistantLang | null {
  const t = text.slice(0, 300);
  const named = SWITCH_TO.find((s) => s.test.test(t))?.lang;
  if (named) return named;
  const m = ANSWER_IN.exec(t.trim());
  return m && !SUBJECT_IN.test(t) ? NAMED[m[2].toLowerCase()] ?? null : null;
}

const TELUGU = /[ఀ-౿]/g;
const DEVANAGARI = /[ऀ-ॿ]/g;
const LATIN = /[A-Za-z]/g;
const count = (re: RegExp, s: string) => (s.match(re) ?? []).length;

/** The language of one message. Numbers, names-only and empty messages decide nothing. */
export function detectLanguage(text: string): Detected {
  const t = String(text ?? "").slice(0, 500);
  const te = count(TELUGU, t);
  const hi = count(DEVANAGARI, t);
  if (te >= 2 || hi >= 2) return { lang: te >= hi ? "te" : "hi", by: "script" };
  const latin = count(LATIN, t);
  if (latin < 2) return { lang: null, by: "none" };
  const words = t.toLowerCase().replace(/[’'`]/g, "").split(/[^a-z]+/).filter(Boolean);
  let teHits = 0;
  let hiHits = 0;
  for (const w of words) {
    const both = SHARED.has(w);
    if (TELUGU_WORDS.has(w) && !both) teHits++;
    if (HINDI_WORDS.has(w) && !both) hiHits++;
  }
  // Shared words tip a message only when it already leans one way.
  for (const w of words) {
    if (!SHARED.has(w)) continue;
    if (teHits > hiHits && TELUGU_WORDS.has(w)) teHits++;
    else if (hiHits > teHits && HINDI_WORDS.has(w)) hiHits++;
  }
  const best = Math.max(teHits, hiHits);
  const enough = best >= 2 || (best === 1 && words.length <= 3);
  if (enough && teHits !== hiHits) return { lang: teHits > hiHits ? "te" : "hi", by: "words" };
  // "ok", "yes", "5 A", "Ravi Kumar": too short to say the person changed language.
  if (words.length <= 2) return { lang: null, by: "none" };
  return { lang: "en", by: "latin" };
}

/** What the conversation keeps about its language. */
export type LanguageState = {
  lang: AssistantLang;
  /** A different language seen in the last message, and how many messages in a row used it. */
  pending: { lang: AssistantLang; count: number } | null;
};

/**
 * Messages in a row in a new language before the conversation switches. Owner, 16 Nov 2026: the
 * assistant talks the way the person talks, so one clear message in another language switches at once
 * (it was 2, and a Telugu question in an English conversation got an English answer).
 */
export const SWITCH_AFTER = 1;

/**
 * The conversation's language after one more message.
 * - `state` null: the first message sets it (an explicit request, the detected
 *   language, the model's judgement, the language chosen before the first
 *   voice message, else the person's screen language).
 * - An explicit request switches at once.
 * - Otherwise it changes after SWITCH_AFTER messages in a row in the new language (one: at once).
 * - A message that decides nothing (a number, a name, "ok") changes nothing.
 * `model` is the model's own judgement of this message (same call, no extra cost); it is used only when the
 * words were Latin with no romanised hint, where the model can recognise Telugu or Hindi the word list missed.
 */
export function nextLanguage(state: LanguageState | null, said: string, opts: { model?: AssistantLang | null; chosen?: AssistantLang | null; screen?: AssistantLang } = {}): LanguageState & { detected: AssistantLang | null; switched: boolean } {
  const asked = explicitSwitch(said);
  const d = detectLanguage(said);
  const fromModel = opts.model && isAssistantLang(opts.model) ? opts.model : null;
  const detected: AssistantLang | null = d.by === "script" || d.by === "words" ? d.lang : d.by === "latin" ? (fromModel ?? "en") : null;
  if (!state) {
    const lang = asked ?? detected ?? opts.chosen ?? opts.screen ?? "en";
    return { lang, pending: null, detected, switched: false };
  }
  if (asked) return { lang: asked, pending: null, detected, switched: asked !== state.lang };
  if (!detected || detected === state.lang) return { lang: state.lang, pending: detected ? null : state.pending, detected, switched: false };
  const n = state.pending?.lang === detected ? state.pending.count + 1 : 1;
  if (n >= SWITCH_AFTER) return { lang: detected, pending: null, detected, switched: true };
  return { lang: state.lang, pending: { lang: detected, count: n }, detected, switched: false };
}

/**
 * How a Telugu speaker talks, so the reply talks the same way (owner, 16 Nov 2026):
 * - "mixed": Telugu with English words, the everyday speech of educated Telugu speakers
 *   ("ఈరోజు absent ఎవరు?", "ఈరోజు ఆబ్సెంట్ స్టూడెంట్స్", "ee roju absent evaru?"). The default.
 * - "pure": only Telugu words in Telugu letters ("ఈ రోజు గైర్హాజరు ఎవరు?"): the reply stays in plain Telugu too.
 */
export type TeluguStyle = "mixed" | "pure";
export function teluguStyle(text: string): TeluguStyle {
  const t = String(text ?? "").slice(0, 500);
  if (count(TELUGU, t) < 2) return "mixed";
  if (/[A-Za-z]{2,}/.test(t)) return "mixed";
  const words = wordsOf(t);
  if (words.some((w) => plainWords(w)[0] !== w)) return "mixed";
  return words.length >= 2 ? "pure" : "mixed";
}

/**
 * Is a reply written in the language: Telugu or Devanagari script for te and
 * hi (names, numbers and English words may sit inside), no Indian script for en.
 * Used to refuse a model reply in the wrong language (the code's own words are shown instead).
 */
export function inLanguage(text: string, lang: AssistantLang): boolean {
  const te = count(TELUGU, text);
  const hi = count(DEVANAGARI, text);
  if (lang === "te") return te >= 2 && te >= hi;
  if (lang === "hi") return hi >= 2 && hi >= te;
  return te === 0 && hi === 0;
}

/** Speech recognition and speech voices: never forced to English. */
export const SPEECH_LANG: Record<AssistantLang, string> = { en: "en-IN", te: "te-IN", hi: "hi-IN" };

/** The best voice for the language: the exact Indian locale, then any voice of the language. Null when the device has none. */
export function pickVoice<V extends { lang: string; name: string; localService?: boolean }>(voices: readonly V[], lang: AssistantLang): V | null {
  const want = SPEECH_LANG[lang].toLowerCase();
  const norm = (l: string) => l.replace("_", "-").toLowerCase();
  const exact = voices.filter((v) => norm(v.lang) === want);
  const same = voices.filter((v) => norm(v.lang).split("-")[0] === lang);
  const pool = exact.length ? exact : same;
  if (!pool.length) return null;
  // Prefer a voice on the device (works offline, no audio leaves it), then a "natural" or Google one.
  return [...pool].sort((a, b) => Number(Boolean(b.localService)) - Number(Boolean(a.localService)) || Number(/natural|google/i.test(b.name)) - Number(/natural|google/i.test(a.name)))[0];
}
