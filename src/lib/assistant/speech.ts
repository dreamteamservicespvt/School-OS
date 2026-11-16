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
