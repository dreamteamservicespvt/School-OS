// What the assistant understands from the words alone, beyond Ask's ready-made
// questions (src/lib/ask/questions.ts), so it is useful while the AI service
// is not connected (layman test 16 Nov 2026: "hi", "thank you", homework,
// holidays and approvals all got "Sorry, I did not get that").
// - small talk: a greeting or thanks gets a friendly line, never "sorry";
// - the three lists that are not Ask questions: homework not handed in, the
//   School Calendar, Approvals waiting;
// - an enquiry to add: the way to the form (the AI fills the card when connected).
// English, Telugu (Telugu letters, English words in Telugu letters, and
// Telugu in English letters) and Hindi. No database and no server code.
import { plainWords, readClass, type AskWhen } from "../ask/questions";

export type SmallTalk = "hello" | "thanks";
export type WordsIntent =
  | { kind: "talk"; talk: SmallTalk }
  | { kind: "tool"; tool: "homework_not_submitted" | "upcoming_calendar" | "approvals_waiting"; days: number | null; cls: string | null }
  | { kind: "enquiry" };

const has = (words: string[], list: readonly string[]) => {
  const joined = ` ${words.join(" ")} `;
  return list.some((w) => (w.includes(" ") ? joined.includes(` ${w} `) : words.includes(w)));
};

const HELLO = ["hi", "hii", "hiii", "hello", "helo", "hey", "namaste", "namaskaram", "namaskar", "good morning", "good afternoon", "good evening", "gm",
  "నమస్తే", "నమస్కారం", "నమస్కారాలు", "హాయ్", "హలో", "शुभ", "नमस्ते", "नमस्कार", "हेलो", "हाय"];
const THANKS = ["thanks", "thank", "thankyou", "thanku", "tq", "ty", "thx", "dhanyavadalu", "dhanyavad", "shukriya", "super", "great", "awesome",
  "ధన్యవాదాలు", "ధన్యవాదములు", "సూపర్", "బాగుంది", "धन्यवाद", "शुक्रिया", "बढ़िया"];
/** Small talk only when the message is short and names no school list. */
const LIST_WORDS = ["absent", "attendance", "fee", "fees", "homework", "holiday", "holidays", "leave", "late", "marks", "birthday", "approvals", "enquiry", "students", "staff"];

const HOMEWORK = ["homework", "home work", "hw", "assignment", "assignments", "హోంవర్క్", "होमवर्क", "गृहकार्य"];
const CALENDAR = ["holiday", "holidays", "event", "events", "calendar", "ptm", "festival", "function", "programme", "program", "datesheet", "exam dates", "exam date", "upcoming",
  "sports day", "annual day", "పండుగ", "పండగ", "సెలవులు ఎప్పుడు", "కార్యక్రమం", "छुट्टियाँ", "छुट्टियां", "त्योहार", "कार्यक्रम"];
const APPROVALS = ["approval", "approvals", "approve", "requests", "request", "permissions", "అనుమతులు", "అనుమతి", "मंज़ूरी", "मंजूरी", "अनुमति"];
const ENQUIRY = ["enquiry", "enquiries", "inquiry", "admission enquiry", "విచారణ", "पूछताछ"];
const ADD = ["add", "new", "create", "make", "kotta", "cheyyi", "cheyandi", "chey", "కొత్త", "చెయ్యి", "చేయండి", "చేయి", "add చెయ్యి", "जोड़ो", "जोड़ें", "नई", "नया"];

function daysOf(when: AskWhen | null, words: string[]): number | null {
  if (when === "thismonth" || has(words, ["month", "nela", "నెల", "महीने", "महीना"])) return 30;
  if (when === "thisweek" || has(words, ["week", "vaaram", "varam", "వారం", "हफ़्ते", "हफ्ते"])) return 7;
  if (has(words, ["tomorrow", "repu", "రేపు", "कल"])) return 2;
  return null;
}

function classOf(words: string[]): string | null {
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const m = /^(\d{1,2})(st|nd|rd|th|వ)?$/.exec(w);
    if (m && (m[2] || /^(class|std|తరగతి|క్లాస్|कक्षा)$/.test(words[i + 1] ?? "") || /^(class|std|తరగతి|క్లాస్|कक्षा)$/.test(words[i - 1] ?? ""))) {
      const c = readClass(m[1]);
      if (c) return c.words;
    }
    if (/^(lkg|ukg)$/.test(w)) return readClass(w)?.words ?? null;
  }
  return null;
}

/** What the words ask for, when they are not one of Ask's ready-made questions. Null: leave it to the AI (or say "not understood"). */
export function wordsIntent(text: string, when: AskWhen | null = null): WordsIntent | null {
  const words = plainWords(String(text ?? "").slice(0, 300));
  if (!words.length) return null;
  if (has(words, HOMEWORK)) return { kind: "tool", tool: "homework_not_submitted", days: daysOf(when, words), cls: classOf(words) };
  if (has(words, CALENDAR)) return { kind: "tool", tool: "upcoming_calendar", days: daysOf(when, words), cls: null };
  if (has(words, APPROVALS) && !has(words, ENQUIRY)) return { kind: "tool", tool: "approvals_waiting", days: null, cls: null };
  if (has(words, ENQUIRY) && (has(words, ADD) || words.length <= 3)) return { kind: "enquiry" };
  if (words.length <= 5 && !has(words, LIST_WORDS)) {
    if (has(words, THANKS)) return { kind: "talk", talk: "thanks" };
    if (has(words, HELLO)) return { kind: "talk", talk: "hello" };
  }
  return null;
}
