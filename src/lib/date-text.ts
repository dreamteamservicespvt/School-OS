// Reading and showing dates and times in the date and time boxes
// (src/components/ui/date-input.tsx). On screen: DD-MM-YYYY and 12-hour times
// (00-global.md P17). To the form: YYYY-MM-DD and HH:MM, as the browser's own boxes sent.
// Dates are plain calendar days; nothing here depends on the computer's time zone.

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

/**
 * A date typed in any common way, as YYYY-MM-DD: "14-05-2012", "14/5/12", "14052012",
 * "14 May 2012", "May 14 2012", "14-5" (this year), "today". "" for an empty box, null
 * when it is not a real date. `today` is YYYY-MM-DD in the school's time zone.
 */
export function parseDateText(text: string, today: string): string | null {
  const s = text.trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ");
  if (!s) return "";
  if (s === "today") return today;
  if (s === "tomorrow") return addDays(today, 1);
  if (s === "yesterday") return addDays(today, -1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return isoParts(s) ? s : null;
  const thisYear = Number(today.slice(0, 4));

  let m = /^(\d{1,2})[-/. ](\d{1,2})(?:[-/. ](\d{2}|\d{4}))?$/.exec(s);
  if (m) return checked(m[3] ? fullYear(m[3], today) : thisYear, Number(m[2]) - 1, Number(m[1]));

  m = /^(\d{2})(\d{2})(\d{2}|\d{4})$/.exec(s);
  if (m) return checked(fullYear(m[3], today), Number(m[2]) - 1, Number(m[1]));

  m = /^(\d{1,2})(?:st|nd|rd|th)? ?-? ?([a-z]+\.?) ?-? ?(\d{2}|\d{4})?$/.exec(s);
  if (m) return checked(m[3] ? fullYear(m[3], today) : thisYear, monthFromWord(m[2]), Number(m[1]));

  m = /^([a-z]+\.?) (\d{1,2})(?:st|nd|rd|th)?(?: (\d{2}|\d{4}))?$/.exec(s);
  if (m) return checked(m[3] ? fullYear(m[3], today) : thisYear, monthFromWord(m[1]), Number(m[2]));

  return null;
}

/**
 * Puts the dashes in while digits are typed: "1405" shows "14-05", "14052012" shows
 * "14-05-2012". A dash typed early ("1-5-2012") is kept. Text with letters is left alone.
 */
export function maskDate(text: string): string {
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
  const m = /^(\d{2}):(\d{2})/.exec(hhmm ?? "");
  if (!m) return "";
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
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
