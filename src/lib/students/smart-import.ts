// Smart Import (03 §2, optional): for a spreadsheet from an old system, suggests which
// column is which and points out likely fixes (a date in another format, a phone number
// with +91, a class written in Roman numerals). Everything here is a rule the school can
// read: it needs no outside service. Every suggestion is shown as "Suggestion" and is
// used only when a person confirms it. Empty cells stay empty; nothing is guessed.
import type { ImportColumn } from "../importer";
import { parseDate } from "./import";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const words = (s: string) => new Set(norm(s).split(" ").filter((w) => w.length > 1 || /\d/.test(w)));

/** Words people use in their own sheets for each column. */
const EXTRA_WORDS: Record<string, string[]> = {
  fullName: ["student", "pupil", "child", "name"],
  className: ["class", "std", "standard", "grade"],
  sectionName: ["section", "sec", "div", "division"],
  dateOfBirth: ["birth", "dob", "born"],
  gender: ["gender", "sex"],
  guardianName: ["father", "guardian", "parent"],
  guardianPhone: ["phone", "mobile", "mob", "contact", "cell", "whatsapp"],
  motherName: ["mother"],
  motherPhone: ["mother", "phone", "mobile"],
  admissionNo: ["admission", "adm", "admn", "enrolment", "sr", "gr"],
  rollNo: ["roll"],
  admissionDate: ["admission", "joining", "doa", "joined"],
  bloodGroup: ["blood"],
  category: ["category", "caste"],
  religion: ["religion"],
  motherTongue: ["tongue", "language"],
  address: ["address", "residence", "village", "locality"],
  aadhaar: ["aadhaar", "aadhar", "uid"],
  apaarId: ["apaar"],
  pen: ["pen"],
  previousSchool: ["previous", "last", "school"],
};

export type MatchSuggestion = { key: string; label: string; index: number; header: string; why: string };

/** What the values in a column look like. */
function sniff(values: string[]) {
  const v = values.map((x) => x.trim()).filter(Boolean).slice(0, 50);
  if (!v.length) return null;
  const share = (re: RegExp) => v.filter((x) => re.test(x)).length / v.length;
  if (share(/^(\+?91[\s-]?)?0?[6-9]\d{4}[\s-]?\d{5}$/) > 0.7) return "phone";
  if (v.filter((x) => parseDate(x) || fixDate(x)).length / v.length > 0.7) return "date";
  if (share(/^(m|f|male|female|boy|girl|\d\s*-\s*(male|female))$/i) > 0.7) return "gender";
  if (share(/^\d{4}\s?\d{4}\s?\d{4}$/) > 0.7) return "aadhaar";
  if (share(/^(a|b|ab|o)[+-]$|^(a|b|ab|o)\s?(pos|neg|positive|negative)$/i) > 0.7) return "blood";
  return null;
}

/**
 * For each column of School OS that the plain match did not find, the heading in the
 * file that most likely holds it, with the reason in plain words.
 */
export function suggestMatch(columns: ImportColumn[], headers: string[], rows: string[][], current: Record<string, number>): MatchSuggestion[] {
  const used = new Set(Object.values(current));
  const out: MatchSuggestion[] = [];
  const kinds = headers.map((_, i) => sniff(rows.map((r) => r[i] ?? "")));
  for (const c of columns) {
    if (current[c.key] !== undefined) continue;
    const want = new Set([...words(c.label), ...(EXTRA_WORDS[c.key] ?? [])]);
    let best: { index: number; score: number; why: string } | null = null;
    headers.forEach((h, i) => {
      if (used.has(i) || !h.trim()) return;
      const have = words(h);
      const common = [...have].filter((w) => want.has(w)).length;
      let score = common / Math.max(1, have.size);
      // The contents agree with the column: a strong hint, and sometimes the only one.
      const kind = kinds[i];
      const fits = (c.key.endsWith("Phone") && kind === "phone") || ((c.key === "dateOfBirth" || c.key === "admissionDate") && kind === "date")
        || (c.key === "gender" && kind === "gender") || (c.key === "aadhaar" && kind === "aadhaar") || (c.key === "bloodGroup" && kind === "blood");
      if (fits) score += 0.5;
      // Mother's columns only go to the mother's fields, and the other way round.
      if (/mother/i.test(h) !== /mother/i.test(c.label)) score = 0;
      if (score >= 0.5 && (!best || score > best.score)) {
        best = { index: i, score, why: common && fits ? "The heading and the values fit" : common ? "The heading is close" : "The values look like this field" };
      }
    });
    if (best) {
      const b = best as { index: number; score: number; why: string };
      used.add(b.index);
      out.push({ key: c.key, label: c.label, index: b.index, header: headers[b.index], why: b.why });
    }
  }
  return out;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const two = (n: number) => String(n).padStart(2, "0");
const ddmmyyyy = (d: number, m: number, y: number) => {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${two(d)}-${two(m)}-${y}`;
};

/** A date written another way, as DD-MM-YYYY; null when it is already fine or cannot be read for sure. */
export function fixDate(text: string, thisYear = new Date().getUTCFullYear()): string | null {
  const t = text.trim();
  if (!t || parseDate(t)) return null;
  let m = t.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/);
  if (m) return ddmmyyyy(+m[3], +m[2], +m[1]);
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
  if (m) { const yy = +m[3]; const y = yy + (2000 + yy > thisYear ? 1900 : 2000); return ddmmyyyy(+m[1], +m[2], y); }
  m = t.match(/^(\d{1,2})[\s-]+([a-z]{3,9})[\s,-]+(\d{4})$/i);
  if (m) { const mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()); return mo >= 0 ? ddmmyyyy(+m[1], mo + 1, +m[3]) : null; }
  m = t.match(/^([a-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (m) { const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()); return mo >= 0 ? ddmmyyyy(+m[2], mo + 1, +m[3]) : null; }
  // A spreadsheet's day number (days since 30-12-1899), for dates between 1982 and 2064.
  if (/^\d{5}$/.test(t) && +t > 30000 && +t < 60000) {
    const d = new Date(Date.UTC(1899, 11, 30) + +t * 86_400_000);
    return `${two(d.getUTCDate())}-${two(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
  }
  return null;
}

/** A 10-digit Indian mobile number written with +91, a leading 0, spaces or dashes. */
export function fixPhone(text: string): string | null {
  const t = text.trim();
  if (!t || /^[6-9]\d{9}$/.test(t)) return null;
  const digits = t.replace(/[\s\-().]/g, "").replace(/^\+?91(?=\d{10}$)/, "").replace(/^0(?=\d{10}$)/, "");
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

const ROMAN: Record<string, string> = { i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7", viii: "8", ix: "9", x: "10", xi: "11", xii: "12" };
/** A class written as VII, 7th or Std 7, as 7. */
export function fixClass(text: string): string | null {
  const raw = text.trim();
  if (!raw || /^(class\s*)?\d{1,2}$/i.test(raw)) return null;
  const t = raw.toLowerCase().replace(/^(std\.?|standard|grade|class)\s*/, "");
  if (ROMAN[t]) return ROMAN[t];
  const m = t.match(/^(\d{1,2})(st|nd|rd|th)?$/);
  return m && +m[1] >= 1 && +m[1] <= 12 ? m[1] : null;
}

/** NAMES IN CAPITALS as Names In Capitals. */
export function fixName(text: string): string | null {
  const t = text.trim();
  if (!t || t !== t.toUpperCase() || !/[A-Z]{2}/.test(t)) return null;
  return t.toLowerCase().replace(/(^|[\s.'-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
}

type Rule = { rule: string; keys: string[]; what: string; fix: (v: string) => string | null };
const RULES: Rule[] = [
  { rule: "date", keys: ["dateOfBirth", "admissionDate"], what: "Dates written another way, as DD-MM-YYYY", fix: (v) => fixDate(v) },
  { rule: "phone", keys: ["guardianPhone", "motherPhone"], what: "Phone numbers with +91, 0, spaces or dashes, as 10 digits", fix: fixPhone },
  { rule: "class", keys: ["className"], what: "Classes written as VII, 7th or Std 7, as 7", fix: fixClass },
  { rule: "caps", keys: ["fullName", "guardianName", "motherName"], what: "Names in capitals, as Names In Capitals", fix: fixName },
];

export type FixSuggestion = { id: string; key: string; label: string; what: string; count: number; examples: { line: number; from: string; to: string }[] };

/** The fixes this file would need, one per column and rule, with how many cells and a few examples. */
export function suggestFixes(columns: ImportColumn[], rows: string[][], match: Record<string, number>): FixSuggestion[] {
  const out: FixSuggestion[] = [];
  for (const r of RULES) {
    for (const key of r.keys) {
      const i = match[key];
      const col = columns.find((c) => c.key === key);
      if (i === undefined || !col) continue;
      const examples: FixSuggestion["examples"] = [];
      let count = 0;
      rows.forEach((row, n) => {
        const v = row[i] ?? "";
        const to = r.fix(v);
        if (to !== null && to !== v.trim()) { count++; if (examples.length < 3) examples.push({ line: n + 2, from: v.trim(), to }); }
      });
      if (count) out.push({ id: `${key}:${r.rule}`, key, label: col.label, what: r.what, count, examples });
    }
  }
  return out;
}

/** The rows with the fixes the person confirmed. Cells a rule cannot read for sure, and empty cells, stay as they are. */
export function applyFixes(rows: string[][], match: Record<string, number>, accepted: ReadonlySet<string>): string[][] {
  if (!accepted.size) return rows;
  const jobs: { i: number; fix: (v: string) => string | null }[] = [];
  for (const id of accepted) {
    const [key, rule] = id.split(":");
    const r = RULES.find((x) => x.rule === rule && x.keys.includes(key));
    if (r && match[key] !== undefined) jobs.push({ i: match[key], fix: r.fix });
  }
  return rows.map((row) => {
    const next = [...row];
    for (const j of jobs) { const v = next[j.i] ?? ""; const to = v.trim() ? j.fix(v) : null; if (to !== null) next[j.i] = to; }
    return next;
  });
}

/** The confirmed fixes from the page address or the form ("fix=dateOfBirth:date,guardianPhone:phone"). */
export function acceptedFixes(value: string | null | undefined): Set<string> {
  return new Set(String(value ?? "").split(",").map((s) => s.trim()).filter((s) => /^[a-zA-Z]+:[a-z]+$/.test(s)).slice(0, 40));
}
