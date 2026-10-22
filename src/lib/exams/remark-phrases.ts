// The phrase bank for report-card remark suggestions (08 §2 Report Cards, gap
// G30). Every sentence a suggestion uses comes from here; the school can change
// the words in Exam Settings, never the facts: the numbers come from the
// student's own records and are shown as the sentence's source.
// Pure (no database), so the Settings screen and the tests use it directly.

/** Words that describe a child as fixed, rather than what they did; never in a remark (00-global.md §2.1). */
const FIXED_TRAITS = /\b(lazy|careless|dull|dumb|stupid|slow learner|slow child|weak student|weak child|naughty|hopeless|useless|average child|average student|not intelligent|unintelligent|born|gifted|genius|talented child|by nature)\b/i;
/** Never in a remark: caste, religion, gender, family income or health (00-global.md §2.1 rule 7). */
const SENSITIVE = /\b(caste|religion|religious|hindu|muslim|christian|sikh|jain|buddhist|dalit|sc\/st|obc|gender|girl|boy|female|male|income|wealthy|poverty|salary|disease|illness|disability|disabled|medical|health|diagnos\w*|adhd|autis\w*|dyslexi\w*)\b/i;

/** Why a piece of text cannot be a remark sentence, or null when it can. */
export function remarkWordProblem(text: string): string | null {
  const t = FIXED_TRAITS.exec(text);
  if (t) return `"${t[0]}" describes the child, not their work. Say what they did instead.`;
  const s = SENSITIVE.exec(text);
  if (s) return `"${s[0]}" is not for a report card remark.`;
  return null;
}

export const PHRASE_KEYS = [
  "levelExcellent", "levelGood", "levelFair", "levelSupport",
  "strong", "weak", "improved", "dropped", "overallUp", "overallDown",
  "aboveClass", "belowClass", "coScholastic",
  "homeworkGood", "homeworkLow", "attendanceGood", "attendanceLow",
] as const;
export type PhraseKey = (typeof PHRASE_KEYS)[number];
export type PhraseBank = Record<PhraseKey, string[]>;

/** Each phrase, the blanks it may use and when it is used, in the school's words. */
export const PHRASES: Record<PhraseKey, { when: string; blanks: string[]; text: string[] }> = {
  levelExcellent: { when: "Marks 85% or more", blanks: ["name", "period"], text: ["{name} has done very well {period}.", "{name} has done excellent work {period}."] },
  levelGood: { when: "Marks 65% to 84%", blanks: ["name", "period"], text: ["{name} has done well {period}.", "{name} has done good work {period}."] },
  levelFair: { when: "Marks from the pass mark to 64%", blanks: ["name", "period"], text: ["{name} has done fairly {period} and can do better with regular practice.", "{name} can do better with regular practice; the marks {period} are fair."] },
  levelSupport: { when: "Marks below the pass mark", blanks: ["name", "period"], text: ["{name} needs more support and regular practice to reach the pass mark.", "{name} needs regular practice and extra help to reach the pass mark."] },
  strong: { when: "Subjects at 75% or more", blanks: ["name", "subjects"], text: ["Strong in {subjects}."] },
  weak: { when: "Subjects below the pass mark, or well below the student's own average", blanks: ["name", "subjects"], text: ["Should give more time to {subjects}."] },
  improved: { when: "Subjects up 10 points or more since the exam before", blanks: ["name", "subjects", "before"], text: ["Has improved in {subjects} since {before}."] },
  dropped: { when: "Subjects down 10 points or more since the exam before", blanks: ["name", "subjects", "before"], text: ["Needs to work on {subjects}, where the marks have come down since {before}."] },
  overallUp: { when: "All marks up 10 points or more since the exam before (no subject in both)", blanks: ["name", "before"], text: ["The marks have gone up since {before}."] },
  overallDown: { when: "All marks down 10 points or more since the exam before (no subject in both)", blanks: ["name", "before"], text: ["The marks have come down since {before}."] },
  aboveClass: { when: "Subjects 10 points or more above the class average", blanks: ["name", "subjects"], text: ["Above the class average in {subjects}."] },
  belowClass: { when: "Subjects 10 points or more below the class average", blanks: ["name", "subjects"], text: ["Below the class average in {subjects}; regular practice will help."] },
  coScholastic: { when: "Co-scholastic areas with the top grade", blanks: ["name", "areas"], text: ["Does well in {areas}."] },
  homeworkGood: { when: "Homework handed in 90% or more", blanks: ["name"], text: ["Hands in homework regularly."] },
  homeworkLow: { when: "Homework handed in below 60%", blanks: ["name"], text: ["Should hand in homework more regularly."] },
  attendanceGood: { when: "Attendance 95% or more", blanks: ["name"], text: ["Regular in attendance."] },
  attendanceLow: { when: "Attendance below the school's limit", blanks: ["name"], text: ["Attendance is low and needs to improve."] },
};

export const BLANK_WORDS: Record<string, string> = {
  name: "the student's first name",
  period: "\"in Half Yearly\", \"this term\" or \"this year\"",
  subjects: "the subjects",
  before: "the exam before",
  areas: "the co-scholastic areas",
};

/** The default bank. */
export const DEFAULT_PHRASES: PhraseBank = Object.fromEntries(PHRASE_KEYS.map((k) => [k, [...PHRASES[k].text]])) as PhraseBank;

export const MAX_VARIANTS = 3;
export const MAX_PHRASE = 200;

/** The school's bank: its own words where it changed them, the defaults elsewhere. Anything unreadable falls back. */
export function readPhrases(raw: unknown): PhraseBank {
  const own = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(PHRASE_KEYS.map((k) => {
    const v = own[k];
    const list = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, MAX_VARIANTS) : [];
    return [k, list.length && list.every((x) => !checkPhrase(k, x)) ? list : [...PHRASES[k].text]];
  })) as PhraseBank;
}

/** What is wrong with one phrase the school typed, or null. */
export function checkPhrase(key: PhraseKey, text: string): string | null {
  const t = text.trim();
  if (!t) return "Write the sentence, or leave the default.";
  if (t.length > MAX_PHRASE) return `At most ${MAX_PHRASE} characters.`;
  const blanks = [...t.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]);
  const wrong = blanks.filter((b) => !PHRASES[key].blanks.includes(b));
  if (wrong.length) return `{${wrong[0]}} cannot be used here. Use ${PHRASES[key].blanks.map((b) => `{${b}}`).join(", ")}.`;
  if (/[{}]/.test(t.replace(/\{[^{}]*\}/g, ""))) return "A blank is written {like_this}.";
  for (const need of ["subjects", "areas", "before"]) {
    if (PHRASES[key].blanks.includes(need) && !blanks.includes(need)) return `Keep {${need}} in this sentence, so it says which.`;
  }
  return remarkWordProblem(t.replace(/\{[^{}]*\}/g, ""));
}

/** Checks a whole bank the school saves; keeps only what differs from the defaults. */
export function cleanPhrases(raw: Record<string, string[]>): { phrases: Partial<PhraseBank>; problems: { key: PhraseKey; text: string; problem: string }[] } {
  const phrases: Partial<PhraseBank> = {};
  const problems: { key: PhraseKey; text: string; problem: string }[] = [];
  for (const k of PHRASE_KEYS) {
    const list = (Array.isArray(raw[k]) ? raw[k] : []).map((x) => String(x ?? "").trim()).filter(Boolean);
    if (list.length > MAX_VARIANTS) problems.push({ key: k, text: list[MAX_VARIANTS], problem: `At most ${MAX_VARIANTS} ways of saying it.` });
    for (const t of list.slice(0, MAX_VARIANTS)) {
      const p = checkPhrase(k, t);
      if (p) problems.push({ key: k, text: t, problem: p });
    }
    const kept = list.slice(0, MAX_VARIANTS);
    if (kept.length && JSON.stringify(kept) !== JSON.stringify(PHRASES[k].text)) phrases[k] = kept;
  }
  return { phrases, problems };
}

/** Fills the blanks of a phrase. */
export function fillPhrase(text: string, values: Record<string, string>) {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m).replace(/\s+/g, " ").trim();
}
