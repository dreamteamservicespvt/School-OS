// How the assistant SAYS a reply (layman test 16 Nov 2026: the voice read
// "16-11-2026" digit by digit, "(01-11-2026 to 16-11-2026)" in full, and every
// reply in the same flat tone). The text on screen stays exact; only the
// spoken copy is made the way a person would say it:
// - today's and yesterday's dates become "today" / "yesterday" in the language;
//   other dates become "16 November" (the year only when it is not this year);
// - a date range in brackets is not read out (the screen shows it);
// - "₹1,55,202" is read as "1,55,202 rupees";
// - the tone follows the feeling: brighter for happy news and a finished
//   change, slower and lower for "sorry".
// No database and no server code: the panel and the tests use it.
import type { AssistantLang } from "./language";
import type { ReplyFeel } from "./mascot-state";

const MONTHS: Record<AssistantLang, string[]> = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  te: ["జనవరి", "ఫిబ్రవరి", "మార్చి", "ఏప్రిల్", "మే", "జూన్", "జులై", "ఆగస్టు", "సెప్టెంబర్", "అక్టోబర్", "నవంబర్", "డిసెంబర్"],
  hi: ["जनवरी", "फ़रवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"],
};
const TODAY: Record<AssistantLang, string> = { en: "today", te: "ఈరోజు", hi: "आज" };
const YESTERDAY: Record<AssistantLang, string> = { en: "yesterday", te: "నిన్న", hi: "कल" };
const RUPEES: Record<AssistantLang, string> = { en: "rupees", te: "రూపాయలు", hi: "रुपये" };

const DATE = /\b(\d{2})-(\d{2})-(\d{4})\b/g;
const ymd = (d: Date) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

/** The school's today as a local date (its day in the school's time zone), for "today" / "yesterday". */
export function schoolToday(timeZone: string, now: Date = new Date()): Date {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now).split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Other ways the replies already write the day ("ఈ రోజు" on the plain Telugu screens), so "today (today)" is said once. */
const TODAY_FORMS: Record<AssistantLang, string[]> = { en: ["today"], te: ["ఈరోజు", "ఈ రోజు"], hi: ["आज"] };
const YESTERDAY_FORMS: Record<AssistantLang, string[]> = { en: ["yesterday"], te: ["నిన్న"], hi: ["कल"] };
/**
 * A date with the little word for "on" around it, which "today" does not need:
 * "on 17-11-2026", "17-11-2026 న" / "17-11-2026న", "17-11-2026 को".
 * Not "నాటికి" or "నుంచి" (a Telugu letter follows the న).
 */
const DATE_ON = /(\bon\s+)?\b(\d{2})-(\d{2})-(\d{4})\b(\s?(?:న|को)(?![ऀ-ॿఀ-౿]))?/g;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Stands in, inside writtenText only, for a date that repeats the day word written just before it. */
const REPEATED = "\u0001";

/**
 * The written reply with today's date as "today" and yesterday's as
 * "yesterday" in the conversation's language (live test 17 Nov 2026:
 * "17-11-2026 attendance ఇంకా తీసుకోలేదు" should say "ఈరోజు"). Every other
 * date stays exactly as it is, and so does a date range in brackets
 * ("this week (16-11-2026 to 17-11-2026)"): there the exact dates are the point.
 * `today` is the school's day as a local date (schoolToday()).
 */
export function writtenText(reply: string, lang: AssistantLang, today: Date): string {
  const text = String(reply ?? "");
  const yest = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  // Brackets that hold a range (two dates or more) keep their dates.
  const kept = [...text.matchAll(/\([^()]*\)/g)].filter((m) => (m[0].match(DATE) ?? []).length >= 2).map((m) => [m.index!, m.index! + m[0].length]);
  let s = text.replace(DATE_ON, (all: string, _on: string | undefined, dd: string, mm: string, yyyy: string, _post: string | undefined, at: number) => {
    if (kept.some(([from, to]) => at >= from && at < to)) return all;
    const d = Number(dd), m = Number(mm), y = Number(yyyy);
    if (m < 1 || m > 12 || d < 1 || d > 31) return all;
    const n = y * 10000 + m * 100 + d;
    const word = n === ymd(today) ? TODAY[lang] : n === ymd(yest) ? YESTERDAY[lang] : null;
    if (!word) return all;
    // "No fees were collected today, 17-11-2026." must not become "today, today" (live test 17 Nov 2026):
    // a date that only repeats the day word just before it is dropped, with its comma.
    const same = n === ymd(today) ? TODAY_FORMS[lang] : YESTERDAY_FORMS[lang];
    if (new RegExp(`(?:${same.map(escape).join("|")})(?:\\s*[,;:–-])?\\s+$`, "iu").test(text.slice(0, at))) return REPEATED;
    // At the start of a sentence: "Today ...".
    return lang === "en" && (at === 0 || /[.!?]\s+$/.test(text.slice(0, at))) ? word[0].toUpperCase() + word.slice(1) : word;
  });
  // "today (17-11-2026)" became "today (today)": once is enough.
  for (const [forms, word] of [[TODAY_FORMS[lang], TODAY[lang]], [YESTERDAY_FORMS[lang], YESTERDAY[lang]]] as const) {
    s = s.replace(new RegExp(`(${forms.map(escape).join("|")})\\s*\\(${escape(word)}\\)`, "gi"), "$1");
  }
  return s.replace(new RegExp(`(?:\\s*[,;:–-])?\\s+${REPEATED}`, "gu"), "").replaceAll(REPEATED, "");
}

/** The reply as it should be spoken. `today` is the device's date (the school's day for its staff). */
export function spokenText(reply: string, lang: AssistantLang, today: Date = new Date()): string {
  const yest = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  let s = String(reply ?? "");
  // A bracket that holds only dates (a range) is for the eyes, not the ears.
  s = s.replace(/\s*\((?=[^)]*\d{2}-\d{2}-\d{4})[^)]*\)/g, "");
  s = s.replace(DATE, (all, dd: string, mm: string, yyyy: string) => {
    const d = Number(dd), m = Number(mm), y = Number(yyyy);
    if (m < 1 || m > 12 || d < 1 || d > 31) return all;
    const n = y * 10000 + m * 100 + d;
    if (n === ymd(today)) return TODAY[lang];
    if (n === ymd(yest)) return YESTERDAY[lang];
    const month = MONTHS[lang][m - 1];
    return y === today.getFullYear() ? `${d} ${month}` : `${d} ${month} ${y}`;
  });
  // "today న" / "ఈరోజు న" reads oddly: the date word already says "on".
  s = s.replace(/(ఈరోజు|నిన్న) న /g, "$1 ");
  s = s.replace(/\bon (today|yesterday)\b/g, "$1");
  s = s.replace(/₹\s?([\d,]+(?:\.\d+)?)/g, (_, n: string) => `${n} ${RUPEES[lang]}`);
  return s.replace(/\s{2,}/g, " ").trim();
}

/** The voice's tone for a feeling: pitch is added to the character's own pitch, rate is the speed. */
export function toneFor(feel: ReplyFeel, lang: AssistantLang): { pitch: number; rate: number } {
  const base = { answer: { pitch: 0, rate: 1 }, happy: { pitch: 0.14, rate: 1.06 }, done: { pitch: 0.1, rate: 1.03 }, sorry: { pitch: -0.12, rate: 0.9 } }[feel];
  // Telugu and Hindi voices run fast for long words: a little slower is clearer.
  return { pitch: base.pitch, rate: lang === "en" ? base.rate : Math.round(base.rate * 0.93 * 100) / 100 };
}
