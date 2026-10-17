// The rules of the one student search (src/lib/students/find.ts), kept apart
// from the database so they can be read and tested on their own.
//
// A typed search matches a student by:
//   - admission number: exact, then the start of it, then any part of it
//     ("0012" finds ADM/2024/0012); dashes, slashes and spaces are ignored.
//     Students brought in from old software keep their old admission number;
//   - name: every typed word starts a word of the name, in any order, and a
//     single letter is an initial ("K. Rao" finds Kiran Rao); or the search is
//     any part of the name ("avi" finds Ravi), as before;
//   - one letter wrong, missing, extra or swapped in a name word of 4 letters
//     or more ("Sirnivas", "Srinvas" find Srinivas); never in numbers;
//   - roll number in a class: "5 A 12", "Class 5-A 12" or "LKG B roll 3";
//   - a parent's name (also with one letter wrong), or a parent's phone: the
//     whole number, or 4 digits or more of it (usually the last 4).
// Results are ranked by RANK below. find.ts looks for close spellings only
// when what was typed finds too few.

/** Lower is better. Ties go to studying students, then by name. */
export const RANK = {
  admissionExact: 0,
  nameExact: 1,
  rollOrFullPhone: 2,
  nameWords: 3,
  namePrefix: 4,
  partOrParent: 5,
  nameClose: 6,
  parentClose: 7,
} as const;

/** Close spellings rank at or after this. */
export const CLOSE_RANK = RANK.nameClose;

export type ParsedQuery = {
  /** Trimmed, spaces collapsed, at most 60 characters, lower case. */
  lower: string;
  /** Letters and digits only, for admission numbers typed without their slashes; empty without a digit. */
  compact: string;
  /** Words of the search (at most 5). Never contain punctuation or spaces. */
  tokens: string[];
  /** The search looks like a phone number: its digits (the last 10). */
  digits: string | null;
  /** "5 A 12": the class and section (letters and digits only) and the roll number. */
  roll: { label: string; rollNo: number } | null;
};

/** Spaces, punctuation and symbols separate words, the same as in the database's prefilter. */
const SEPARATORS = /[\s\p{P}\p{S}]+/u;
const ROLL_WORDS = new Set(["class", "std", "standard", "grade", "section", "sec", "roll", "no", "number"]);

export function words(text: string): string[] {
  return text.toLowerCase().split(SEPARATORS).filter(Boolean);
}

/** Letters and digits only, lower case: "ADM/2024-12" becomes "adm202412". */
export function compactOf(text: string): string {
  return words(text).join("");
}

/** A class and section written the way people type it: "Class 5" + "A" becomes "5a". */
export function sectionLabel(className: string, sectionName: string): string {
  return compactOf(`${className.replace(/^\s*(class|std\.?|standard|grade)\b/i, "")} ${sectionName}`);
}

export function parseQuery(raw: string): ParsedQuery {
  const lower = raw.trim().replace(/\s+/g, " ").slice(0, 60).toLowerCase();
  const tokens = words(lower).slice(0, 5);
  const allDigits = lower.replace(/\D/g, "");
  const digits = /^[+\d\s()-]+$/.test(lower) && allDigits.length >= 4 ? allDigits.slice(-10) : null;
  let roll: ParsedQuery["roll"] = null;
  const last = tokens[tokens.length - 1];
  if (tokens.length >= 2 && /^\d{1,4}$/.test(last)) {
    const label = tokens.slice(0, -1).filter((t) => !ROLL_WORDS.has(t)).join("");
    if (label) roll = { label, rollNo: Number(last) };
  }
  const compact = /\d/.test(lower) ? compactOf(lower) : "";
  return { lower, compact, tokens, digits, roll };
}

/** One letter wrong, missing, extra, or two next to each other swapped. */
export function oneEditApart(a: string, b: string): boolean {
  if (a === b) return true;
  const x = Array.from(a);
  const y = Array.from(b);
  if (Math.abs(x.length - y.length) > 1) return false;
  let i = 0;
  while (i < x.length && i < y.length && x[i] === y[i]) i++;
  const rest = (p: string[], from: number) => p.slice(from).join("");
  if (x.length === y.length) {
    if (rest(x, i + 1) === rest(y, i + 1)) return true; // one letter wrong
    return x[i] === y[i + 1] && x[i + 1] === y[i] && rest(x, i + 2) === rest(y, i + 2); // two swapped
  }
  const [long, short] = x.length > y.length ? [x, y] : [y, x];
  return rest(long, i + 1) === rest(short, i); // one letter missing or extra
}

/** How one typed word matches one name word: 0 the whole word, 1 its start, 2 a close spelling. */
function wordMatch(t: string, w: string): 0 | 1 | 2 | null {
  if (w === t) return 0;
  if (w.startsWith(t)) return 1;
  if (!closeParts(t)) return null;
  const n = Array.from(t).length;
  if (oneEditApart(t, w)) return 2;
  if (n >= 5) {
    // Still typing a long word with a slip: "Srinv" for Srinivas.
    const cps = Array.from(w);
    for (const len of [n - 1, n, n + 1]) if (len < cps.length && oneEditApart(t, cps.slice(0, len).join(""))) return 2;
  }
  return null;
}

export type NameMatch = "exact" | "words" | "prefix" | "close";

/** Every typed word must match a word of the name, in any order. */
export function matchName(tokens: string[], name: string): NameMatch | null {
  if (!tokens.length) return null;
  const ws = words(name);
  let worst = 0;
  for (const t of tokens) {
    let best: number | null = null;
    for (const w of ws) {
      const m = wordMatch(t, w);
      if (m !== null && (best === null || m < best)) best = m;
      if (best === 0) break;
    }
    if (best === null) return null;
    worst = Math.max(worst, best);
  }
  if (worst === 2) return "close";
  if (worst === 1) return "prefix";
  const same = [...tokens].sort().join(" ") === [...ws].sort().join(" ");
  return same ? "exact" : "words";
}

/**
 * What the database sends for each student it found, before ranking. The
 * prefilter in find.ts finds every row these rules can match, and some more.
 */
export type Candidate = {
  fullName: string;
  admissionNo: string;
  rollNo: number | null;
  rollLabel: string | null;
  parents: { name: string; phones: string[] }[];
};

export type Ranked = { rank: number; by: "admission" | "name" | "roll" | "phone" | "parent"; parent: string | null };

/** The best way this student matches the search, or null when it does not. */
export function rankCandidate(q: ParsedQuery, c: Candidate, opts: { byParent: boolean }): Ranked | null {
  let best: Ranked | null = null;
  const offer = (rank: number, by: Ranked["by"], parent: string | null = null) => {
    if (!best || rank < best.rank) best = { rank, by, parent };
  };
  const long = q.lower.length >= 2;

  const adm = c.admissionNo.toLowerCase();
  const admCompact = compactOf(c.admissionNo);
  if (adm === q.lower || (q.compact && admCompact === q.compact)) offer(RANK.admissionExact, "admission");
  else if (adm.startsWith(q.lower) || (q.compact && admCompact.startsWith(q.compact))) offer(RANK.namePrefix, "admission");
  else if (long && (adm.includes(q.lower) || (q.compact && admCompact.includes(q.compact)))) offer(RANK.partOrParent, "admission");

  const name = matchName(q.tokens, c.fullName);
  if (name === "exact") offer(RANK.nameExact, "name");
  else if (name === "words") offer(RANK.nameWords, "name");
  else if (name === "prefix") offer(RANK.namePrefix, "name");
  else if (long && c.fullName.toLowerCase().includes(q.lower)) offer(RANK.partOrParent, "name");
  else if (name === "close") offer(RANK.nameClose, "name");

  if (q.roll && c.rollNo === q.roll.rollNo && c.rollLabel === q.roll.label) offer(RANK.rollOrFullPhone, "roll");

  if (opts.byParent) {
    for (const p of c.parents) {
      if (q.digits) {
        for (const phone of p.phones) {
          if (phone.length >= 10 && q.digits.length === 10 && phone.endsWith(q.digits)) offer(RANK.rollOrFullPhone, "phone", p.name);
          else if (phone.includes(q.digits)) offer(RANK.partOrParent, "phone", p.name);
        }
      }
      const m = matchName(q.tokens, p.name);
      if (m === "close") offer(RANK.parentClose, "parent", p.name);
      else if (m || (long && p.name.toLowerCase().includes(q.lower))) offer(RANK.partOrParent, "parent", p.name);
    }
  }
  return best;
}

/**
 * Which typed words may be close spellings (null: none), and for the
 * database's prefilter: a typed word of 4 letters or more is within one letter
 * of a name word only if the name word starts with its first part, or contains
 * its last part (whichever half the slip is not in).
 */
export function closeParts(t: string): { start: string; part: string } | null {
  const cps = Array.from(t);
  // Numbers are never guessed at: only words of 4 letters or more.
  if (cps.length < 4 || /\d/.test(t)) return null;
  const a = Math.floor((cps.length - 1) / 2);
  return { start: cps.slice(0, a).join(""), part: cps.slice(a + 1).join("") };
}
