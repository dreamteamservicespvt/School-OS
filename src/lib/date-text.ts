// Reading and showing dates and times in the date and time boxes
// (src/components/ui/date-input.tsx). On screen: DD-MM-YYYY and 12-hour times
// (00-global.md P17). To the form: YYYY-MM-DD and HH:MM, as the browser's own boxes sent.
// Dates are plain calendar days; nothing here depends on the computer's time zone.

import { formatClock } from "./format";

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

const pad = (n: number) => String(n).padStart(2, "0");

export function isoOf(year: number, month0: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${pad(month0 + 1)}-${pad(day)}`;
}

/** The parts of a real YYYY-MM-DD date (month0: 0 = January), or null. */
export function isoParts(iso: string | undefined | null): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
  return mo >= 0 && mo < 12 && d >= 1 && d <= daysIn(y, mo) ? { y, m: mo, d } : null;
}

export function daysIn(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

function fromUtc(t: number): string {
  const d = new Date(t);
  return isoOf(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function addDays(iso: string, days: number): string {
  const p = isoParts(iso)!;
  return fromUtc(Date.UTC(p.y, p.m, p.d + days));
}

/** A month later or earlier; the 31st becomes the last day of a shorter month. */
export function addMonths(iso: string, months: number): string {
  const p = isoParts(iso)!;
  const total = p.y * 12 + p.m + months;
  const y = Math.floor(total / 12), m = total - y * 12;
  return isoOf(y, m, Math.min(p.d, daysIn(y, m)));
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayOf(iso: string): number {
  const p = isoParts(iso)!;
  return (new Date(Date.UTC(p.y, p.m, p.d)).getUTCDay() + 6) % 7;
}

/** Six weeks from the Monday on or before the 1st, so the calendar never changes height. */
export function monthCells(year: number, month0: number): string[] {
  const first = isoOf(year, month0, 1);
  const start = addDays(first, -weekdayOf(first));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function showDate(iso: string | undefined | null): string {
  const p = isoParts(iso);
  return p ? `${pad(p.d)}-${pad(p.m + 1)}-${p.y}` : "";
}

function fullYear(text: string, today: string): number | null {
  if (text.length === 4) return Number(text);
  if (text.length !== 2) return null;
  const now = Number(today.slice(0, 4));
  const y = 2000 + Number(text);
  return y <= now + 10 ? y : y - 100;
}

function monthFromWord(word: string): number {
  const w = word.toLowerCase().replace(/\.$/, "");
  if (w.length < 3) return -1;
  return MONTHS.findIndex((m) => m.startsWith(w));
}

function checked(y: number | null, m0: number, d: number): string | null {
  if (y === null || y < 1 || m0 < 0 || m0 > 11 || d < 1 || d > daysIn(y, m0)) return null;
  return isoOf(y, m0, d);
}

type Read = { y: number | null; m0: number; d: number };

/** The year, month and day in typed text, before checking that the day exists. */
function readDate(s: string, today: string): Read | null {
  const thisYear = Number(today.slice(0, 4));
  let m = /^(\d{1,2})[-/. ](\d{1,2})(?:[-/. ](\d{2}|\d{4}))?$/.exec(s);
  if (m) return { y: m[3] ? fullYear(m[3], today) : thisYear, m0: Number(m[2]) - 1, d: Number(m[1]) };

  m = /^(\d{2})(\d{2})(\d{2}|\d{4})$/.exec(s);
  if (m) return { y: fullYear(m[3], today), m0: Number(m[2]) - 1, d: Number(m[1]) };

  m = /^(\d{1,2})(?:st|nd|rd|th)? ?-? ?([a-z]+\.?) ?-? ?(\d{2}|\d{4})?$/.exec(s);
  if (m) return { y: m[3] ? fullYear(m[3], today) : thisYear, m0: monthFromWord(m[2]), d: Number(m[1]) };

  m = /^([a-z]+\.?) (\d{1,2})(?:st|nd|rd|th)?(?: (\d{2}|\d{4}))?$/.exec(s);
  if (m) return { y: m[3] ? fullYear(m[3], today) : thisYear, m0: monthFromWord(m[1]), d: Number(m[2]) };

  return null;
}

const tidy = (text: string) => text.trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ");

/**
 * A date typed in any common way, as YYYY-MM-DD: "14-05-2012", "14/5/12", "14052012",
 * "14 May 2012", "May 14 2012", "14-5" (this year), "today". "" for an empty box, null
 * when it is not a real date. `today` is YYYY-MM-DD in the school's time zone.
 */
export function parseDateText(text: string, today: string): string | null {
  const s = tidy(text);
  if (!s) return "";
  if (s === "today") return today;
  if (s === "tomorrow") return addDays(today, 1);
  if (s === "yesterday") return addDays(today, -1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return isoParts(s) ? s : null;
  // Year first with other marks ("2026/12/31", "2026.12.31"), as copied from another program.
  const yf = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (yf) return checked(Number(yf[1]), Number(yf[2]) - 1, Number(yf[3]));
  const r = readDate(s, today);
  return r && checked(r.y, r.m0, r.d);
}

/**
 * When the text is a clear day, month and year but that month has no such day
 * ("31-02-2026", "30 Feb 2027"), the day, month and year as numbers, so the box can say
 * so rather than ask for the format again. Else null.
 */
export function missingDay(text: string, today: string): { d: number; m0: number; y: number } | null {
  const r = readDate(tidy(text), today);
  if (!r || r.y === null || r.y < 1 || r.m0 < 0 || r.m0 > 11 || r.d < 1 || r.d <= daysIn(r.y, r.m0)) return null;
  return { d: r.d, m0: r.m0, y: r.y };
}

/**
 * A date pasted year first, as other programs and spreadsheets copy it ("2026-12-31",
 * "2026/12/31", "2026-12-31T10:00", "20261231"), turned round to DD-MM-YYYY; else null.
 * It was cut into "20-26-12" (layman test LE3). Eight digits are read year first only
 * when they are not a real day-month-year date ("20122012" stays 20-12-2012). The day
 * needs both its digits: "2026-12-3" is still being typed, and turning it round then
 * made the next digit start a new date.
 */
function yearFirst(text: string): string | null {
  const t = text.trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{2})(?:[T ][\d:.]*(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(t);
  if (!m) {
    m = /^((?:19|20)\d{2})(\d{2})(\d{2})$/.exec(t);
    if (!m || checked(Number(t.slice(4)), Number(t.slice(2, 4)) - 1, Number(t.slice(0, 2)))) return null;
    if (!checked(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) return null;
  }
  return `${pad(Number(m[3]))}-${pad(Number(m[2]))}-${m[1]}`;
}

/**
 * The date given as the example in "Type the date as DD-MM-YYYY, for example …": one the box
 * takes. A due date or a leave from today on got a date in 2012 as its example (layman test
 * LE3), so a box that starts today or later gets one two weeks after its first day.
 */
export function exampleDate(min: string, max: string, today: string): string {
  const classic = "2012-05-14";
  if (min && min >= today) { const d = addDays(min, 14); return max && d > max ? max : d; }
  if (min && classic < min) return min;
  if (max && classic > max) return max;
  return classic;
}

/**
 * The text a date box shows after a change. Typing at the end goes through maskDate. When the
 * box held a whole date and more is typed after it (one click into a filled box, then typing),
 * maskDate cut the new digits off and the old date stayed with no message (layman test LD2):
 * the new typing starts a new date instead. A date pasted after it is read the same way.
 */
export function typedDate(before: string, raw: string, atEnd: boolean): string {
  if (!atEnd) return raw;
  const masked = maskDate(raw);
  if (before && raw.length > before.length && raw.startsWith(before) && masked === maskDate(before)) {
    return maskDate(raw.slice(before.length));
  }
  return masked;
}

/**
 * Puts the dashes in while digits are typed: "1405" shows "14-05", "14052012" shows
 * "14-05-2012". A dash typed early ("1-5-2012") is kept. Text with letters is left alone.
 */
export function maskDate(text: string): string {
  const yf = yearFirst(text);
  if (yf) return yf;
  // Year first, still being typed ("2026-12-3"): left as typed, and read when the box is left.
  if (/^\d{4}[-/.]/.test(text.trim())) return text;
  if (!/^[\d\-/. ]*$/.test(text)) return text;
  const groups: string[] = [];
  for (let part of text.split(/[-/. ]/)) {
    while (groups.length < 2 && part.length > 2) {
      groups.push(part.slice(0, 2));
      part = part.slice(2);
    }
    groups.push(part);
  }
  const [d = "", mo, y] = groups;
  return [d, mo, y === undefined ? undefined : y.slice(0, 4)].filter((g) => g !== undefined).join("-");
}

/** "21:45" as "9:45 PM". */
export function showTime(hhmm: string | undefined | null): string {
  const m = /^(\d{2}:\d{2})/.exec(hhmm ?? "");
  return m ? formatClock(m[1]) : "";
}

/** A time typed as "9:30", "930", "9.30 pm", "21:30" or "9 PM", as HH:MM; "" when empty, null when not a time. */
export function parseTimeText(text: string): string | null {
  const s = text.trim().toLowerCase().replace(/([ap])\.?\s*m\.?$/, "$1m").replace(/\s+/g, "");
  if (!s) return "";
  let h: number, min: number, half: string | undefined;
  let m = /^(\d{1,2})[:.](\d{2})(am|pm)?$/.exec(s);
  if (m) {
    h = Number(m[1]); min = Number(m[2]); half = m[3];
  } else if ((m = /^(\d{1,4})(am|pm)?$/.exec(s))) {
    const d = m[1];
    half = m[2];
    if (d.length <= 2) { h = Number(d); min = 0; }
    else if (d.length === 3) { h = Number(d[0]); min = Number(d.slice(1)); }
    else { h = Number(d.slice(0, 2)); min = Number(d.slice(2)); }
  } else return null;
  if (min > 59) return null;
  if (half) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (half === "pm" ? 12 : 0);
  } else if (h > 23) return null;
  return `${pad(h)}:${pad(min)}`;
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** The times offered in the list: every `step` minutes of the day, inside min and max. */
export function timeChoices(step: number, min?: string, max?: string): string[] {
  const lo = min && /^\d{2}:\d{2}/.test(min) ? minutes(min) : 0;
  const hi = max && /^\d{2}:\d{2}/.test(max) ? minutes(max) : 24 * 60 - 1;
  const out: string[] = [];
  for (let t = 0; t < 24 * 60; t += step) if (t >= lo && t <= hi) out.push(`${pad(Math.floor(t / 60))}:${pad(t % 60)}`);
  return out;
}

/** Today as YYYY-MM-DD in a time zone (the school's; India by default). */
export function todayIn(timeZone = "Asia/Kolkata"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
