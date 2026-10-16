// Tidy-ups (workflow 15, step 4): the small fixes a person would otherwise
// make by hand in every row of an old file. Each one is shown on screen as
// "what we changed" and can be switched off. Nothing here guesses a value
// that is not in the file: when a value cannot be read it is left as it was,
// and the row's check explains the problem.

import { ddmmyyyy } from "./read";

/** "ARJUN K.RAO" or "arjun k rao" → "Arjun K. Rao"; names already in mixed case keep their capitals. */
export function tidyName(v: string): string {
  const s = v.replace(/\s+/g, " ").replace(/\.(?=[^\s.])/g, ". ").replace(/\s+,/g, ",").trim();
  const letters = s.replace(/[^A-Za-z]/g, "");
  if (!letters || (letters !== letters.toUpperCase() && letters !== letters.toLowerCase())) return s;
  return s.toLowerCase().replace(/(^|[\s.'(-])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase());
}

/**
 * An Indian mobile number as 10 digits: "+91 98765-43210", "098765 43210",
 * "919876543210" and "9.87654321E+09" (Excel) all become "9876543210". When a
 * cell holds two numbers the first is kept. Not a mobile number → unchanged.
 */
export function tidyPhone(v: string): string {
  const t = v.trim();
  if (!t) return t;
  const sci = /^(\d)\.(\d+)e\+?(\d+)$/i.exec(t.replace(/\s/g, ""));
  if (sci) {
    const digits = sci[1] + sci[2];
    const exp = Number(sci[3]);
    if (digits.length === exp + 1) return tidyPhone(digits);
    return t; // Excel cut digits off; the row's check asks for the real number.
  }
  const first = t.split(/\s*(?:[,/;&]|\bor\b|\band\b)\s*/i).find((p) => /\d{6}/.test(p.replace(/\D/g, ""))) ?? t;
  let d = first.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  else if (d.length === 13 && d.startsWith("091")) d = d.slice(3);
  return /^[6-9]\d{9}$/.test(d) ? d : t;
}

export type DateOrder = "DMY" | "MDY";

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

/** Whether a date column is day-first (India) or month-first (some exports): any day over 12 settles it. */
export function dateOrder(values: string[]): DateOrder {
  let dmy = 0;
  let mdy = 0;
  for (const v of values) {
    const m = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})$/.exec(v.trim());
    if (!m) continue;
    if (+m[1] > 12 && +m[2] <= 12) dmy++;
    if (+m[2] > 12 && +m[1] <= 12) mdy++;
  }
  return mdy > dmy ? "MDY" : "DMY";
}

const CENTURY_PIVOT = (new Date().getUTCFullYear() % 100) + 1;

function make(y: number, m: number, d: number): Date | null {
  if (y < 100) y += y < CENTURY_PIVOT ? 2000 : 1900;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  if (y < 1900 || y > 2100) return null;
  return date;
}

/** Reads a date written any common way; null when it is not a real date. */
export function readDate(v: string, order: DateOrder = "DMY"): Date | null {
  const t = v.trim().replace(/(\d)(st|nd|rd|th)\b/gi, "$1").replace(/,/g, " ").replace(/\s+/g, " ");
  if (!t) return null;
  let m: RegExpExecArray | null;
  // An Excel day number (a date cell saved as a plain number): 1 = 1 Jan 1900.
  if ((m = /^(\d{5})(?:\.0+)?$/.exec(t)) && +m[1] > 3000 && +m[1] < 80000) {
    return new Date(Date.UTC(1899, 11, 30) + +m[1] * 86_400_000);
  }
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/.exec(t))) return make(+m[1], +m[2], +m[3]);
  if ((m = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2}|\d{4})(?: .*)?$/.exec(t))) {
    return order === "MDY" ? make(+m[3], +m[1], +m[2]) : make(+m[3], +m[2], +m[1]);
  }
  if ((m = /^(\d{1,2})[-/. ]?([a-z]{3,9})\.?[-/. ]?(\d{2}|\d{4})$/i.exec(t)) && MONTHS[m[2].toLowerCase()]) {
    return make(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  }
  if ((m = /^([a-z]{3,9})\.? (\d{1,2}) (\d{4})$/i.exec(t)) && MONTHS[m[1].toLowerCase()]) {
    return make(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
  }
  if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(t))) return make(+m[1], +m[2], +m[3]);
  return null;
}

/** A date as DD-MM-YYYY, which every School OS import reads; unchanged when it cannot be read. */
export function tidyDate(v: string, order: DateOrder = "DMY"): string {
  const d = readDate(v, order);
  return d ? ddmmyyyy(d) : v.trim();
}

const uncode = (v: string) => v.replace(/^\s*\d+\s*[-.)]\s*/, "").trim();

export function tidyGender(v: string): string {
  const g = uncode(v).toLowerCase().replace(/[^a-z]/g, "");
  if (["m", "male", "boy", "b", "man", "mr", "son"].includes(g)) return "Male";
  if (["f", "female", "girl", "g", "woman", "ms", "mrs", "daughter"].includes(g)) return "Female";
  if (["o", "other", "others", "t", "transgender", "tg"].includes(g)) return "Other";
  return v.trim();
}

/** "b +ve", "B positive", "O-ve" → "B+", "O-". */
export function tidyBloodGroup(v: string): string {
  const t = v.toUpperCase().replace(/\s+/g, "").replace(/POSITIVE|POS|\+VE|VE\+/g, "+").replace(/NEGATIVE|NEG|-VE|VE-/g, "-");
  const m = /^(A|B|AB|O)([+-])$/.exec(t);
  return m ? m[1] + m[2] : v.trim();
}

/** Aadhaar and other number IDs: spaces and dashes taken out. */
export function tidyDigits(v: string): string {
  const d = v.replace(/[\s-]/g, "");
  return /^\d+$/.test(d) ? d : v.trim();
}

export function tidyYesNo(v: string): string {
  const t = v.trim().toLowerCase();
  if (["y", "yes", "true", "1", "haan", "ha"].includes(t)) return "Yes";
  if (["n", "no", "false", "0", "nahi"].includes(t)) return "No";
  return v.trim();
}

// ── Class and section names ────────────────────────────────────────────────

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };
const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
const EARLY: [RegExp, string][] = [
  [/^(pre ?nursery|pre ?nur|playgroup|play ?group|pg|play|daycare)$/, "playgroup"],
  [/^(nursery|nur|nurs|n)$/, "nursery"],
  [/^(lkg|l ?k ?g|jr ?kg|junior ?kg|kg ?1|kg ?i|pp ?1|pp ?i|pre ?primary ?1|lower ?kg)$/, "lkg"],
  [/^(ukg|u ?k ?g|sr ?kg|senior ?kg|kg ?2|kg ?ii|pp ?2|pp ?ii|pre ?primary ?2|upper ?kg)$/, "ukg"],
  [/^(kg|kindergarten|prep)$/, "kg"],
];

/**
 * The class a name points to, the same however it is written:
 * "Class 5", "5th", "V", "Std. 5", "Grade five" → "5"; "L.K.G", "Jr KG", "PP1" → "lkg".
 * Null when it is not a class name.
 */
export function classKey(v: string): string | null {
  let t = v.toLowerCase().replace(/[._]/g, " ").replace(/\s+/g, " ").trim();
  t = t.replace(/^(class|cls|std|standard|grade|gr|klass|kaksha)\s*[-:]?\s*/i, "").trim();
  t = t.replace(/\s*[-:]?\s*(class|std|standard|grade)$/i, "").trim();
  t = t.replace(/^(\d{1,2})\s*(st|nd|rd|th)$/, "$1");
  if (/^\d{1,2}$/.test(t)) return String(Number(t));
  if (ROMAN[t]) return String(ROMAN[t]);
  if (WORDS[t]) return String(WORDS[t]);
  const compact = t.replace(/-/g, " ").replace(/\s+/g, " ");
  for (const [re, key] of EARLY) if (re.test(compact)) return key;
  return null;
}

const SECTION = /^([A-Za-z]{1,2}|\d{1,2}|[A-Za-z][a-z]{2,15})$/;
const sectionWord = (s: string) => (s.length <= 2 ? s.toUpperCase() : s[0].toUpperCase() + s.slice(1).toLowerCase());

/**
 * Splits "5 A", "5-A", "5A", "V-B", "5th (A)", "Class 5 - Section B", "LKG Rose"
 * into class and section. Null when the value is a class alone or not a class.
 */
export function splitClassSection(v: string): { className: string; sectionName: string } | null {
  const t = v.replace(/\s+/g, " ").trim();
  if (!t || classKey(t)) return null;
  const glued = /^(\d{1,2}(?:st|nd|rd|th)?)([A-Za-z])$/i.exec(t);
  if (glued) return { className: glued[1], sectionName: glued[2].toUpperCase() };
  for (let i = t.length - 1; i > 0; i--) {
    if (!/[\s\-/:(]/.test(t[i])) continue;
    const left = t.slice(0, i).replace(/[\s\-/:(]+$/, "").trim();
    const right = t.slice(i + 1).replace(/^[\s\-/:(]+/, "").replace(/\)$/, "").replace(/^sec(?:tion)?\.?\s*[-:]?\s*/i, "").trim();
    if (left && classKey(left) && SECTION.test(right)) return { className: left, sectionName: sectionWord(right) };
  }
  return null;
}

/** Edit distance, for "Did you mean" on names that do not match. */
export function distance(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y) return 0;
  const prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const cur = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (x[i - 1] === y[j - 1] ? 0 : 1));
      last = cur;
    }
  }
  return prev[y.length];
}

/** Text compared without case, spaces or punctuation. */
export const plain = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
