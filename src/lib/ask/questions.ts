// Ask in plain words, rule-based first (gap list G27; 00-global.md §2 and
// §1.1 "Search by intent"). The ready-made questions School OS can answer,
// and the word table that turns what a person types ("absent today", "fees
// due class 5", "brithday", "late staff") into one of them with its class,
// dates and amount filled in. Indian school words and small typos are
// understood. Nothing here reads a record: the answer always comes from the
// module's own list (src/lib/ask/answer.ts), with the person's own reach.
// No database and no server code, so the Search box uses it while typing.

export const QUESTION_KEYS = [
  "absent-today", "absent-streak", "below-attendance", "not-marked",
  "late-staff", "staff-absent", "staff-on-leave",
  "fees-collected", "fees-overdue", "below-pass", "birthdays",
] as const;
export type QuestionKey = (typeof QUESTION_KEYS)[number];

/** Date words a question may take. */
export const WHENS = ["today", "yesterday", "thisweek", "lastweek", "thismonth", "lastmonth"] as const;
export type AskWhen = (typeof WHENS)[number];

/** What a question is asked about: a class (as typed: "5", "5 A", "UKG"), a time, an amount in whole rupees. */
export type AskParams = { cls?: string | null; when?: AskWhen | null; amount?: number | null };

type Def = {
  /** Which words of AskParams it uses. */
  takes: readonly ("cls" | "when" | "amount")[];
  /** The times it understands, the first being its default. */
  whens?: readonly AskWhen[];
  title: (p: AskParams) => string;
};

const WHEN_WORDS: Record<AskWhen, string> = {
  today: "today", yesterday: "yesterday", thisweek: "this week", lastweek: "last week", thismonth: "this month", lastmonth: "last month",
};
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const inClass = (p: AskParams) => (p.cls ? ` in ${classWords(p.cls)}` : "");
const dayOf = (d: Def, p: AskParams) => (p.when && d.whens?.includes(p.when) ? p.when : d.whens?.[0] ?? "today");

export const QUESTIONS: Record<QuestionKey, Def> = {
  "absent-today": {
    takes: ["cls", "when"], whens: ["today", "yesterday"],
    title: (p) => `Who ${dayOf(QUESTIONS["absent-today"], p) === "yesterday" ? "was absent yesterday" : "is absent today"}${inClass(p)}?`,
  },
  "absent-streak": { takes: ["cls"], title: (p) => `Who has been absent several days in a row${inClass(p)}?` },
  "below-attendance": { takes: ["cls"], title: (p) => `Who is below the attendance line${inClass(p)}?` },
  "not-marked": { takes: [], title: () => "Which classes have not taken attendance today?" },
  "late-staff": { takes: ["when"], whens: ["today", "yesterday"], title: (p) => `Which staff came late ${WHEN_WORDS[dayOf(QUESTIONS["late-staff"], p)]}?` },
  "staff-absent": { takes: ["when"], whens: ["today", "yesterday"], title: (p) => `Which staff ${dayOf(QUESTIONS["staff-absent"], p) === "yesterday" ? "were" : "are"} absent ${WHEN_WORDS[dayOf(QUESTIONS["staff-absent"], p)]}?` },
  "staff-on-leave": { takes: ["when"], whens: ["today", "yesterday"], title: (p) => `Which staff ${dayOf(QUESTIONS["staff-on-leave"], p) === "yesterday" ? "were" : "are"} on leave ${WHEN_WORDS[dayOf(QUESTIONS["staff-on-leave"], p)]}?` },
  "fees-collected": {
    takes: ["cls", "when"], whens: ["thisweek", "today", "yesterday", "lastweek", "thismonth", "lastmonth"],
    title: (p) => `How much fee was collected ${WHEN_WORDS[dayOf(QUESTIONS["fees-collected"], p)]}${inClass(p)}?`,
  },
  "fees-overdue": {
    takes: ["cls", "amount"],
    title: (p) => (p.amount ? `Who owes ${rupees(p.amount)} or more${inClass(p)}?` : `Who has fees overdue${inClass(p)}?`),
  },
  "below-pass": { takes: ["cls"], title: (p) => (p.cls ? `Who is below the pass mark in ${classWords(p.cls)}?` : "Which classes have marks below the pass mark?") },
  "birthdays": { takes: ["when"], whens: ["thisweek", "today"], title: (p) => (dayOf(QUESTIONS.birthdays, p) === "today" ? "Whose birthday is today?" : "Whose birthday is coming up this week?") },
};

export const isQuestionKey = (v: unknown): v is QuestionKey => typeof v === "string" && (QUESTION_KEYS as readonly string[]).includes(v);
export const isWhen = (v: unknown): v is AskWhen => typeof v === "string" && (WHENS as readonly string[]).includes(v);

/** Only the words a question takes, each checked; the time is one the question understands. */
export function cleanParams(key: QuestionKey, p: AskParams): AskParams {
  const d = QUESTIONS[key];
  const out: AskParams = {};
  if (d.takes.includes("cls") && p.cls) { const c = readClass(p.cls); if (c) out.cls = c.words; }
  if (d.takes.includes("when")) out.when = dayOf(d, p);
  if (d.takes.includes("amount") && p.amount && Number.isInteger(p.amount) && p.amount > 0 && p.amount <= 100_000_000) out.amount = p.amount;
  return out;
}

export const questionTitle = (key: QuestionKey, p: AskParams = {}) => QUESTIONS[key].title(cleanParams(key, p));

/** How an answer was reached, for the page and the Audit Log. */
export type AskVia = "ready-made" | "words" | "ai";

/** The answer page for a question: /ask?q=absent-today&cls=5+A&when=yesterday. */
export function askHref(key: QuestionKey, p: AskParams = {}, via: AskVia = "ready-made") {
  const c = cleanParams(key, p);
  const u = new URLSearchParams({ q: key });
  if (c.cls) u.set("cls", c.cls);
  if (c.when && c.when !== QUESTIONS[key].whens?.[0]) u.set("when", c.when);
  if (c.amount) u.set("amount", String(c.amount));
  if (via !== "ready-made") u.set("via", via);
  return `/ask?${u.toString()}`;
}

/* ---------- Classes as people type them ---------- */

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };
const PRE: Record<string, string> = { lkg: "LKG", ukg: "UKG", nursery: "Nursery", nur: "Nursery", kg: "KG", prekg: "Pre-KG", pkg: "Pre-KG", playgroup: "Playgroup" };

/**
 * One way of writing a class, so "Class 5", "5th", "Std V", "V" and "5" are
 * the same class, and "LKG" and "L.K.G." too. Null for words that are not a class.
 */
export function classKey(name: string): string | null {
  const t = name.toLowerCase().replace(/\./g, "").replace(/\b(class|std|standard|grade|cls)\b/g, " ").replace(/[\s-]+/g, " ").trim();
  if (!t) return null;
  const pre = PRE[t.replace(/\s/g, "")];
  if (pre) return pre.toLowerCase();
  const n = /^(\d{1,2})(st|nd|rd|th)?$/.exec(t);
  if (n) return String(Number(n[1]));
  if (ROMAN[t]) return String(ROMAN[t]);
  return t;
}

/** A typed class with an optional section letter: "5 A", "5a", "Class V-B", "UKG". */
export function readClass(raw: string): { cls: string; section: string | null; words: string } | null {
  const t = raw.trim().toLowerCase().replace(/\./g, "").replace(/\b(class|std|standard|grade|cls)\b/g, " ").replace(/\s+/g, " ").trim();
  const m = /^(\d{1,2}(?:st|nd|rd|th)?|[ivx]{1,4}|lkg|ukg|nursery|nur|kg|pre ?kg|pkg|playgroup)(?:\s*[-/ ]?\s*([a-h]))?$/.exec(t);
  if (!m) return null;
  const key = classKey(m[1].replace(/\s/g, ""));
  if (!key || (/^\d+$/.test(key) && (Number(key) < 1 || Number(key) > 12)) || (/^[ivx]+$/.test(m[1]) && !ROMAN[m[1]])) return null;
  const shown = PRE[key] ?? (/^\d+$/.test(key) ? key : null);
  if (!shown) return null;
  const section = m[2] ? m[2].toUpperCase() : null;
  return { cls: key, section, words: section ? `${shown} ${section}` : shown };
}

/** "Class 5 A", "UKG B". */
export function classWords(words: string) {
  const c = readClass(words);
  if (!c) return words;
  const name = PRE[c.cls] ?? `Class ${c.cls}`;
  return c.section ? `${name} ${c.section}` : name;
}

/* ---------- The word table ---------- */

/** Words for each idea, as Indian school staff write them (a few Hindi words too). Two-word phrases match in order. */
const CONCEPTS = {
  absent: ["absent", "absents", "absentee", "absentees", "absence", "absences", "not present", "not come", "not came", "didnt come", "did not come", "not coming", "missing", "bunk", "bunked", "gairhazir", "ghairhazir", "nahi aaye", "nahi aya",
    "raledu", "raaledu", "rani", "ranivallu", "gairhajaru",
    "अनुपस्थित", "गैरहाज़िर", "गैरहाजिर", "नहीं आए", "नहीं आया", "नहीं आई", "గైర్హాజరు", "గైర్హాజరైన", "గైర్హాజరయ్యారు", "రాలేదు", "రానివారు", "రాని", "రానివాళ్ళు", "రాలేదా", "வரவில்லை", "வராதவர்கள்", "ಗೈರುಹಾಜರಿ", "ಬರಲಿಲ್ಲ", "ഹാജരില്ല", "വന്നില്ല", "गैरहजर", "অনুপস্থিত"],
  streak: ["running", "in a row", "continuous", "continuously", "consecutive", "straight", "streak", "chronic", "regularly", "days running", "back to back", "lagatar", "varusaga", "लगातार", "వరుసగా", "தொடர்ந்து", "ಸತತ", "തുടർച്ചയായി", "सलग", "টানা"],
  attendance: ["attendance", "attendence", "atendance", "present", "percent", "percentage", "presence", "haziri", "hazri", "hajaru", "उपस्थिति", "हाज़िरी", "हाजिरी", "హాజరు", "வருகை", "ಹಾಜರಾತಿ", "ഹാജർ", "उपस्थिती", "উপস্থিতি"],
  low: ["below", "under", "less", "lesser", "low", "lower", "short", "shortage", "poor", "weak", "lowest", "kam", "takkuva", "thakkuva", "takkuvaga", "कम", "नीचे", "తక్కువ", "తక్కువగా", "குறைவு", "குறைவான", "ಕಡಿಮೆ", "കുറവ്", "कमी", "কম"],
  late: ["late", "latecomer", "latecomers", "latecoming", "delay", "delayed", "der", "alasyam", "aalasyam", "देर", "देरी", "लेट", "ఆలస్యం", "ఆలస్యంగా", "தாமதம்", "ತಡ", "വൈകി", "उशीर", "उशिरा", "দেরি"],
  staff: ["staff", "staffs", "teacher", "teachers", "employee", "employees", "faculty", "sir", "madam", "maam", "sirs", "teaching staff", "non teaching", "स्टाफ़", "स्टाफ", "शिक्षक", "अध्यापक", "సిబ్బంది", "టీచర్లు", "టీచర్", "ఉపాధ్యాయులు", "ஆசிரியர்கள்", "ஊழியர்கள்", "ಸಿಬ್ಬಂದಿ", "ಶಿಕ್ಷಕರು", "ജീവനക്കാർ", "അധ്യാപകർ", "कर्मचारी", "কর্মী", "শিক্ষক"],
  leave: ["leave", "leaves", "chutti", "chhutti", "on leave", "selavu", "selavulo", "छुट्टी", "సెలవు", "సెలవులో", "விடுப்பு", "ರಜೆ", "അവധി", "रजा", "ছুটি"],
  fee: ["fee", "fees", "fess", "feez", "payment", "payments", "money", "tuition", "amount", "rupees", "rs", "inr", "paisa", "cash", "फ़ीस", "फीस", "शुल्क", "ఫీజు", "ఫీజులు", "கட்டணம்", "ಶುಲ್ಕ", "ഫീസ്", "फी", "ফি"],
  collected: ["collected", "collection", "collections", "collect", "received", "receipts", "came in", "come in", "paid", "deposited", "earned", "jama", "aaya", "kattaru", "जमा", "वसूल", "వసూలు", "వసూలైన", "వసూలైంది", "వసూలయ్యింది", "కట్టారు", "வசூல்", "ಸಂಗ್ರಹ", "പിരിച്ചത്", "আদায়"],
  owe: ["owe", "owes", "owing", "outstanding", "defaulter", "defaulters", "unpaid", "not paid", "baki", "baaki", "bakaya", "arrears", "overdue", "not yet paid", "kattani", "kattaledu", "kattanivallu", "kattalsina",
    "बकाया", "बाकी", "బాకీ", "బకాయి", "బాకీదారులు", "కట్టని", "కట్టనివాళ్ళు", "కట్టనివారు", "కట్టలేదు", "కట్టాల్సిన", "நிலுவை", "ಬಾಕಿ", "കുടിശ്ശിക", "थकबाकी", "বকেয়া"],
  /** Words that mean owing only next to a fee word ("homework due" is not about fees). */
  dueWord: ["due", "dues", "pending", "balance", "remaining"],
  /** Words that mean money came in only next to a fee word ("how much money came", "ninna fees entha vachindi"). */
  cameWord: ["came", "come", "vachindi", "vachayi", "vachaayi", "వచ్చింది", "వచ్చాయి", "వచ్చినది"],
  marks: ["marks", "mark", "result", "results", "exam", "exams", "score", "scores", "scored", "grade", "grades", "test", "tests", "subject", "subjects", "percentage marks", "अंक", "नंबर", "परिणाम", "परीक्षा", "మార్కులు", "ఫలితాలు", "పరీక్ష", "மதிப்பெண்", "ಅಂಕ", "മാർക്ക്", "गुण", "নম্বর"],
  fail: ["fail", "failed", "failing", "fails", "pass mark", "below pass", "not passed", "did not pass", "didnt pass", "passing marks", "fail hue", "फेल", "फ़ेल", "अनुत्तीर्ण", "ఫెయిల్", "தோல்வி", "ಅನುತ್ತೀರ್ಣ", "തോറ്റ", "नापास", "ফেল"],
  birthday: ["birthday", "birthdays", "bday", "birth day", "date of birth", "dob", "born", "janamdin", "janmdin", "janmadin", "puttinaroju", "puttina roju", "जन्मदिन", "పుట్టినరోజు", "పుట్టినరోజులు", "பிறந்தநாள்", "ಹುಟ್ಟುಹಬ್ಬ", "ജന്മദിനം", "वाढदिवस", "জন্মদিন"],
  notTaken: ["not taken", "not marked", "not done", "not yet", "unmarked", "missed", "nobody marked", "not filled", "pending", "teesukoledu", "tiskoledu", "veyaledu", "नहीं ली", "नहीं लगी", "తీసుకోలేదు", "తీసుకోని", "వేయలేదు", "వేయని", "తీయలేదు"],
} as const;
type Concept = keyof typeof CONCEPTS;

/** Damerau (optimal string alignment) distance, so a swapped pair of letters ("brithday") counts as one slip. */
function slips(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** A typed word is this word: exactly, or with one slip from 5 letters, two from 8. Short words must be exact. */
function sameWord(typed: string, word: string) {
  if (typed === word) return true;
  const allowed = word.length >= 8 ? 2 : word.length >= 5 ? 1 : 0;
  if (!allowed || typed.length < 4) return false;
  return slips(typed, word, allowed) <= allowed;
}

/** The words of a sentence, lower case, apostrophes dropped ("didn't" → "didnt"), ₹ and % kept as words; Indian scripts kept as typed. */
export function wordsOf(text: string) {
  return text.toLowerCase().replace(/[’'`]/g, "").replace(/₹/g, " ₹ ").replace(/%/g, " % ").split(/[^a-z0-9₹%.\u0900-\u0DFF\u200C\u200D]+/).map((w) => w.replace(/^\.+|\.+$/g, "")).filter(Boolean);
}

/**
 * English school words as Telugu speakers write them in Telugu letters, and as Telugu voice typing spells
 * them ("ఆబ్సెంట్ స్టూడెంట్స్" is "absent students"). Owner, 16 Nov 2026: educated Telugu speakers mix
 * English words into Telugu, so these must be understood like the English word. Keys are written without
 * the joiners (U+200C, U+200D) that phones put inside some words ("బర్త్‌డే").
 */
const TE_LOANS: Record<string, string> = {
  "ఆబ్సెంట్": "absent", "ఆబ్సెంటు": "absent", "అబ్సెంట్": "absent", "ఆప్సెంట్": "absent", "ఆబ్సెంట్స్": "absent", "ఆబ్సెంటీస్": "absentees",
  "ప్రెజెంట్": "present", "అటెండెన్స్": "attendance", "అటెండెన్సు": "attendance", "అటెండన్స్": "attendance", "అటెండెంస్": "attendance",
  "స్టూడెంట్స్": "students", "స్టూడెంట్": "student", "స్టూడెంట్లు": "students", "స్టుడెంట్స్": "students",
  "టీచర్స్": "teachers", "స్టాఫ్": "staff", "ఎంప్లాయీస్": "employees",
  "ఫీ": "fee", "ఫీస్": "fees", "ఫీజ్": "fees", "పెండింగ్": "pending", "బ్యాలెన్స్": "balance", "డ్యూ": "due", "డిఫాల్టర్స్": "defaulters", "డిఫాల్టర్లు": "defaulters",
  "కలెక్షన్": "collection", "కలెక్షను": "collection", "కలెక్షన్స్": "collections", "కలెక్ట్": "collect", "పెయిడ్": "paid",
  "లీవ్": "leave", "లీవు": "leave", "లీవ్స్": "leaves", "లేట్": "late", "లేటు": "late",
  "బర్త్డే": "birthday", "బర్తడే": "birthday", "బర్త్డేలు": "birthdays", "బర్త్డేస్": "birthdays", "బర్త్": "birth", "డే": "day",
  "మార్క్స్": "marks", "మార్కు": "mark", "ఫెయిలైన": "failed", "ఫెయిలయ్యారు": "failed", "ఫెయిలైనవాళ్ళు": "failed",
  "ఎగ్జామ్": "exam", "ఎగ్జామ్స్": "exams", "ఎగ్జాం": "exam", "రిజల్ట్స్": "results", "రిజల్ట్": "result", "టెస్ట్": "test",
  "టుడే": "today", "యెస్టర్డే": "yesterday", "వీక్": "week", "మంత్": "month", "లాస్ట్": "last", "దిస్": "this",
  "క్లాసు": "class", "క్లాసులు": "classes", "క్లాసెస్": "classes", "లిస్ట్": "list", "కంటిన్యూగా": "continuously", "కంటిన్యూస్గా": "continuously",
  "హోంవర్క్": "homework", "హోమ్వర్క్": "homework", "హాలిడే": "holiday", "హాలిడేస్": "holidays", "హాలిడేలు": "holidays",
  "ఈవెంట్": "event", "ఈవెంట్స్": "events", "క్యాలెండర్": "calendar", "అప్రూవల్": "approval", "అప్రూవల్స్": "approvals", "రిక్వెస్ట్స్": "requests",
  "ఎంక్వైరీ": "enquiry", "ఎంక్వయిరీ": "enquiry", "ఇంక్వైరీ": "enquiry", "అడ్మిషన్": "admission",
  "హాయ్": "hi", "హలో": "hello", "థాంక్స్": "thanks", "థాంక్యూ": "thanks", "థ్యాంక్స్": "thanks", "థ్యాంక్యూ": "thanks",
};
/** Telugu endings stuck to a word ("లీవ్‌లో", "స్టూడెంట్స్‌కి"), tried off when the whole word is not known. */
const TE_ENDINGS = ["లో", "కి", "కు", "ని", "ను", "లు", "ల", "తో", "గా", "దే"];
const TELUGU_WORD = /^[ఀ-౿‌‍]+$/;

function loanOf(word: string): string {
  if (!TELUGU_WORD.test(word)) return word;
  const w = word.replace(/[‌‍]/g, "");
  if (TE_LOANS[w]) return TE_LOANS[w];
  for (const end of TE_ENDINGS) if (w.endsWith(end) && TE_LOANS[w.slice(0, -end.length)]) return TE_LOANS[w.slice(0, -end.length)];
  return word;
}

/** wordsOf(), with English words written in Telugu letters read as the English word. */
export function plainWords(text: string) {
  return wordsOf(text).map(loanOf);
}

function conceptsIn(words: string[]): Set<Concept> {
  const found = new Set<Concept>();
  for (const [concept, list] of Object.entries(CONCEPTS) as [Concept, readonly string[]][]) {
    for (const phrase of list) {
      const parts = phrase.split(" ");
      const hit = words.some((_, i) => parts.every((p, k) => words[i + k] !== undefined && sameWord(words[i + k], p)));
      if (hit) { found.add(concept); break; }
    }
  }
  // "fees due", "pending fees": owing, when a fee word is there.
  if (found.has("dueWord") && found.has("fee")) found.add("owe");
  // "how much money came", "ninna fees entha vachindi": collected, when a fee word is there.
  if (found.has("cameWord") && found.has("fee")) found.add("collected");
  // "not paid" is owing, not money collected.
  if (found.has("owe") && found.has("collected") && /\b(not|un) ?paid\b|\bnot yet paid\b/.test(words.join(" "))) found.delete("collected");
  // A "%" next to a number ("below 75%") is about attendance unless marks are named.
  if (words.includes("%") && !found.has("marks")) found.add("attendance");
  return found;
}

/** Each question's rule on the ideas found, and how sure the match is (higher wins). */
const RULES: { key: QuestionKey; score: (c: Set<Concept>) => number }[] = [
  { key: "absent-streak", score: (c) => (c.has("absent") && c.has("streak") ? 5 : 0) },
  { key: "staff-absent", score: (c) => (c.has("absent") && c.has("staff") && !c.has("streak") ? 4 : 0) },
  { key: "absent-today", score: (c) => (c.has("absent") && !c.has("staff") && !c.has("streak") ? 3 : 0) },
  { key: "not-marked", score: (c) => (c.has("attendance") && c.has("notTaken") && !c.has("absent") ? 5 : 0) },
  { key: "below-attendance", score: (c) => (c.has("attendance") && c.has("low") && !c.has("marks") && !c.has("fee") ? 4 : 0) },
  { key: "late-staff", score: (c) => (c.has("late") && !c.has("fee") ? (c.has("staff") ? 4 : 3) : 0) },
  { key: "staff-on-leave", score: (c) => (c.has("leave") && !c.has("absent") ? (c.has("staff") ? 4 : 2) : 0) },
  { key: "fees-overdue", score: (c) => (c.has("owe") ? (c.has("fee") ? 5 : 4) : 0) },
  { key: "fees-collected", score: (c) => (c.has("collected") && !c.has("owe") ? (c.has("fee") ? 5 : 3) : 0) },
  { key: "below-pass", score: (c) => (c.has("fail") ? 5 : c.has("marks") && c.has("low") ? 4 : 0) },
  { key: "birthdays", score: (c) => (c.has("birthday") ? 5 : 0) },
];

/* ---------- Class, dates and amount from the words ---------- */

function whenIn(words: string[]): AskWhen | null {
  const s = ` ${words.join(" ")} `;
  if (/ (yesterday|yday|kal|ninna|ninnati|कल|నిన్న|నిన్నటి|நேற்று|ನಿನ್ನೆ|ഇന്നലെ|काल|গতকাল) /.test(s)) return "yesterday";
  if (/ (last|previous|pichle|pichla|poyina|gatha|gata) (week|wk|vaaram|varam) | पिछले (हफ़्ते|हफ्ते|सप्ताह) | (గత|పోయిన) వారం /.test(s)) return "lastweek";
  if (/ (last|previous|pichle|pichla|poyina|gatha|gata) (month|nela) | पिछले महीने | (గత|పోయిన) నెల /.test(s)) return "lastmonth";
  if (/ (this|current|is|ee) (month|nela) | (month|monthly|mahina|mahine|nela|महीने|महीना|నెల) /.test(s)) return "thismonth";
  if (/ (this|current|is|ee) (week|wk|vaaram|varam) | (week|weekly|hafta|hafte|vaaram|varam|हफ़्ते|हफ्ते|सप्ताह|వారం) /.test(s)) return "thisweek";
  if (/ (today|todays|now|aaj|ee roju|eeroju|ivvala|ivala|ఈరోజే|నేడు|आज|ఈ రోజు|ఈరోజు|ఇవాళ|ఇవ్వాళ|ఇవ్వాళ్టి|இன்று|ಇಂದು|ഇന്ന്|আজ) /.test(s)) return "today";
  return null;
}

function classIn(words: string[]): string | null {
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const next = words[i + 1] ?? "";
    const named = /^(class|std|standard|grade|cls|कक्षा|क्लास|తరగతి|క్లాస్|வகுப்பு|ತರಗತಿ|ക്ലാസ്|इयत्ता|শ্রেণি|ক্লাস)$/.test(w);
    if (named && next) {
      const letter = /^[a-h]$/.test(words[i + 2] ?? "") ? ` ${words[i + 2]}` : "";
      const c = readClass(`${next}${letter}`) ?? readClass(next);
      if (c) return c.words;
    }
    // "5a", "5th", "ukg", "lkg b", and "5 a" or "5-a" (two words after splitting)
    if (/^\d{1,2}[a-h]$/.test(w)) { const c = readClass(w); if (c) return c.words; }
    // Telugu: "5వ తరగతి", "5వ class", "5 తరగతి"
    const te = /^(\d{1,2})(వ|వది|వ\.)$/.exec(w) ?? (/^\d{1,2}$/.test(w) && /^(తరగతి|క్లాస్|class)$/.test(next) ? [w, w] : null);
    if (te) { const c = readClass(te[1]); if (c) return c.words; }
    if (/^\d{1,2}$/.test(w) && /^[a-h]$/.test(next) && !/^[a-z]/.test(words[i + 2] ?? "")) { const c = readClass(`${w} ${next}`); if (c) return c.words; }
    if (/^\d{1,2}(st|nd|rd|th)$/.test(w) && !/^(day|days|of|october|november|december|january|february|march|april|may|june|july|august|september)$/.test(next)) {
      const letter = /^[a-h]$/.test(next) ? ` ${next}` : "";
      const c = readClass(`${w}${letter}`);
      if (c) return c.words;
    }
    if (/^(lkg|ukg|nursery)$/.test(w)) { const letter = /^[a-h]$/.test(next) ? ` ${next}` : ""; const c = readClass(`${w}${letter}`); if (c) return c.words; }
  }
  return null;
}

/** "₹10,000", "rs 10000", "10k", "1.5 lakh", "10 thousand": whole rupees. A bare number counts from ₹100. */
function amountIn(text: string): number | null {
  const t = text.toLowerCase().replace(/,/g, "");
  const unitOf = (u: string | undefined) => (u === "k" || u === "thousand" ? 1000 : u?.startsWith("la") ? 100_000 : 1);
  // A rupee sign or word first, then a number with a unit, then "more than 5000".
  const tries: [RegExp, number][] = [
    [/(?:₹|\brs\.?|\binr)\s*(\d+(?:\.\d+)?)\s*(k|thousand|lakh|lakhs|lac|lacs)?/, 1],
    [/(\d+(?:\.\d+)?)\s*(k|thousand|lakh|lakhs|lac|lacs)\b/, 1],
    [/(?:more than|above|over|atleast|at least|greater than|>)\s*(\d+(?:\.\d+)?)/, 100],
    // Telugu and Hindi put the number first: "10000 కంటే ఎక్కువ", "10000 kante ekkuva", "10000 se zyada".
    [/(\d+(?:\.\d+)?)\s*(?:రూపాయల|రూపాయలు|rupees|rupaayala|రూ\.?)?\s*(?:కంటే|కన్నా|kante|kanna|से|se)?\s*(?:ఎక్కువ|పైన|పైగా|ekkuva|paina|ज़्यादा|ज्यादा|अधिक|ऊपर|zyada|jyada|adhik|upar)/, 100],
  ];
  for (const [re, least] of tries) {
    const m = re.exec(t);
    if (!m) continue;
    const n = Math.round(Number(m[1]) * unitOf(m[2]));
    if (Number.isFinite(n) && n >= least && n <= 100_000_000) return n;
  }
  return null;
}

export type IntentMatch = { key: QuestionKey; params: AskParams; score: number; title: string; href: string };

/**
 * The ready-made questions the typed words point to, best first, with their
 * class, time and amount filled in. Only questions in `allowed` (the person's
 * own) are given. Empty when the words name no question.
 */
export function matchIntent(text: string, allowed: readonly QuestionKey[] = QUESTION_KEYS): IntentMatch[] {
  const words = plainWords(text.slice(0, 200));
  if (!words.length) return [];
  const concepts = conceptsIn(words);
  const raw: AskParams = { cls: classIn(words), when: whenIn(words), amount: amountIn(text) };
  return RULES
    .map((r) => ({ key: r.key, score: r.score(concepts) }))
    .filter((r) => r.score > 0 && allowed.includes(r.key))
    .sort((a, b) => b.score - a.score)
    .map((r) => {
      const params = cleanParams(r.key, raw);
      return { key: r.key, params, score: r.score, title: QUESTIONS[r.key].title(params), href: askHref(r.key, params, "words") };
    });
}

/** Words that make typed text look like a question rather than a name. */
export function looksLikeQuestion(text: string) {
  const t = text.trim().toLowerCase();
  return t.endsWith("?") || /^(who|whom|whose|how|which|what|when|where|show|list|tell|give|kitne|kitna|kaun|kab|kya)\b/.test(t)
    || /^(कौन|कितना|कितनी|कितने|क्या|किस|किन|ఎవరు|ఎంత|ఎన్ని|ఏ|யார்|எத்தனை|ಯಾರು|ಎಷ್ಟು|ആര്|എത്ര|कोण|किती|কে|কত)(?=\s|$)/.test(t) || wordsOf(t).length >= 5;
}

/**
 * The closest ready-made questions for words that matched none (AI off, or
 * the AI found none): the questions sharing the most ideas with the words,
 * else the person's own ready-made questions in order.
 */
export function closestQuestions(text: string, allowed: readonly QuestionKey[], fallback: readonly QuestionKey[] = allowed, take = 3): QuestionKey[] {
  const words = plainWords(text.slice(0, 200));
  const found = conceptsIn(words);
  const touches: Record<QuestionKey, Concept[]> = {
    "absent-today": ["absent", "attendance"], "absent-streak": ["absent", "streak"], "below-attendance": ["attendance", "low"], "not-marked": ["attendance", "notTaken"],
    "late-staff": ["late", "staff"], "staff-absent": ["staff", "absent"], "staff-on-leave": ["staff", "leave"],
    "fees-collected": ["fee", "collected"], "fees-overdue": ["fee", "owe"], "below-pass": ["marks", "fail", "low"], birthdays: ["birthday"],
  };
  const ranked = allowed
    .map((k, i) => ({ k, i, n: touches[k].filter((c) => found.has(c)).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map((x) => x.k);
  return [...new Set([...ranked, ...fallback.filter((k) => allowed.includes(k))])].slice(0, take);
}
