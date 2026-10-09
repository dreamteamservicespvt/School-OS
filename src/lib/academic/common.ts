// Small shared pieces for Academic Management: plain-words rule errors,
// date-only helpers in the school's time zone, and day and time words.

/** A rule from 04 Academic Management §5 stopped the change. The message is shown as it is. */
export class AcademicRuleError extends Error {
  constructor(message: string, readonly field?: string) {
    super(message);
    this.name = "AcademicRuleError";
  }
}

export const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const DAY_SHORT = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Today's date in the school's time zone, as a date-only value (midnight UTC). */
export function todayIn(timeZone = "Asia/Kolkata", now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return new Date(`${parts}T00:00:00Z`);
}

/** A "YYYY-MM-DD" string to a date-only value, or null when it is not a real date. */
export function parseDay(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : d;
}

export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** 1 = Monday ... 7 = Sunday, for a date-only value. */
export function weekday(date: Date): number {
  const d = date.getUTCDay();
  return d === 0 ? 7 : d;
}

/** Monday of the week holding the date. */
export function weekStart(date: Date): Date {
  return addDays(date, 1 - weekday(date));
}

export function daysBetween(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

/** "08:45" to "8:45 AM" (P17: 12-hour times). */
export function time12(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

export function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Plain-words list: "A, B and C". */
export function wordList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
}

/** Guesses the level from a class name (Pre-primary, Primary, Middle, Secondary, Senior secondary). Inferred. */
export function guessLevel(name: string): string | null {
  const n = name.trim().toLowerCase();
  if (/(play|pre|nursery|lkg|ukg|kg|jr|sr\.? kg)/.test(n)) return "Pre-primary";
  if (/(b\.?\s?a|b\.?\s?sc|b\.?\s?com|degree|college|m\.?\s?sc|m\.?\s?a)\b/.test(n)) return "College";
  const num = /(\d{1,2})/.exec(n)?.[1] ?? romanNumber(n);
  if (num === null || num === undefined) return null;
  const k = Number(num);
  if (k >= 1 && k <= 5) return "Primary";
  if (k >= 6 && k <= 8) return "Middle";
  if (k >= 9 && k <= 10) return "Secondary";
  if (k >= 11 && k <= 12) return "Senior secondary";
  return null;
}

function romanNumber(n: string): string | null {
  const m = /\b(xii|xi|x|ix|viii|vii|vi|v|iv|iii|ii|i)\b/.exec(n);
  if (!m) return null;
  const map: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };
  return String(map[m[1]]);
}

export const LEVELS = ["Pre-primary", "Primary", "Middle", "Secondary", "Senior secondary", "College"] as const;

/** "A, B, C" or "A-D" to ["A", "B", "C", "D"]. */
export function parseSectionNames(input: string): string[] {
  const out: string[] = [];
  for (const raw of input.split(/[,\n;]+/)) {
    const part = raw.trim();
    if (!part) continue;
    const range = /^([A-Za-z])\s*(?:-|to)\s*([A-Za-z])$/.exec(part);
    if (range) {
      const a = range[1].toUpperCase().charCodeAt(0);
      const b = range[2].toUpperCase().charCodeAt(0);
      for (let c = Math.min(a, b); c <= Math.max(a, b); c++) out.push(String.fromCharCode(c));
    } else out.push(part.length <= 3 ? part.toUpperCase() : part);
  }
  return [...new Set(out)];
}

/** The next section letter after the ones in use: A, B, C ... */
export function nextSectionName(existing: string[]): string {
  const used = new Set(existing.map((s) => s.toUpperCase()));
  for (let c = 65; c <= 90; c++) if (!used.has(String.fromCharCode(c))) return String.fromCharCode(c);
  return `S${existing.length + 1}`;
}

/** "Class 1 to Class 12", "1-12" or one name per line, to class names. */
export function parseClassNames(input: string): string[] {
  const out: string[] = [];
  for (const raw of input.split(/[\n,;]+/)) {
    const part = raw.trim();
    if (!part) continue;
    const range = /^(.*?)(\d{1,2})\s*(?:-|to)\s*(?:\1)?(\d{1,2})$/i.exec(part);
    if (range) {
      const prefix = range[1];
      const a = Number(range[2]);
      const b = Number(range[3]);
      if (b >= a && b - a < 30) {
        for (let k = a; k <= b; k++) out.push(`${prefix || "Class "}${k}`.replace(/\s+/g, " ").trim());
        continue;
      }
    }
    out.push(part.replace(/\s+/g, " "));
  }
  return [...new Set(out)];
}
