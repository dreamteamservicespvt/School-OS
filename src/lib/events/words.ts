// Events & Calendar words, colours and small helpers shared by the pages and
// the server (no database here). The names are the blueprint's (18 §2).

export const BASE = "/events-calendar";

/** Calendar Entry types (decided 9 October 2026), as the calendar draws them (mod-events.jsx TYPE). */
export const ENTRY_TYPES = {
  holiday: { label: "Holiday", chip: "bg-bad/12 text-bad", dot: "bg-bad", tone: "bad", attendance: false, icon: "Sun" },
  vacation: { label: "Vacation", chip: "bg-bad/10 text-bad", dot: "bg-bad", tone: "bad", attendance: false, icon: "Palmtree" },
  exam_day: { label: "Exam day", chip: "bg-info/12 text-info", dot: "bg-info", tone: "info", attendance: true, icon: "ClipboardCheck" },
  event: { label: "Event", chip: "bg-ok/12 text-ok", dot: "bg-ok", tone: "ok", attendance: true, icon: "PartyPopper" },
  ptm: { label: "PTM", chip: "bg-brand/12 text-brand", dot: "bg-brand", tone: "brand", attendance: true, icon: "Users" },
  admission_test: { label: "Admission test", chip: "bg-warn/15 text-warn", dot: "bg-warn", tone: "warn", attendance: true, icon: "PencilLine" },
} as const;
export type EntryType = keyof typeof ENTRY_TYPES;
export const ENTRY_TYPE_KEYS = Object.keys(ENTRY_TYPES) as EntryType[];
export const isEntryType = (v: string): v is EntryType => v in ENTRY_TYPES;
export const entryType = (v: string) => ENTRY_TYPES[isEntryType(v) ? v : "event"];
/** Types that close the school (attendance off unless "allow attendance" is on). */
export const CLOSING: readonly EntryType[] = ["holiday", "vacation"];

/** The type chips on the School Calendar ("Holidays" also shows vacations). */
export const TYPE_CHIPS = [
  { value: "all", label: "Everything" },
  { value: "holiday", label: "Holidays" },
  { value: "exam_day", label: "Exams" },
  { value: "event", label: "Events" },
  { value: "ptm", label: "PTMs" },
  { value: "admission_test", label: "Admission tests" },
] as const;

export const EVENT_STATUS: Record<string, { label: string; tone: "info" | "ok" | "neutral" | "bad" }> = {
  PLANNED: { label: "Planned", tone: "info" },
  OPEN: { label: "Open for registration", tone: "ok" },
  DONE: { label: "Done", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "bad" },
};

export const AUDIENCE_KINDS = [
  { value: "school", label: "Whole school" },
  { value: "classes", label: "Chosen classes" },
  { value: "staff", label: "Staff" },
  { value: "parents", label: "Parents" },
  { value: "alumni", label: "Alumni" },
] as const;

export const REMINDERS = [
  { value: "1d", label: "1 day before" },
  { value: "2d", label: "2 days before" },
  { value: "morning", label: "On the morning" },
  { value: "none", label: "No reminder" },
] as const;
export const reminderWords = (v: string) => REMINDERS.find((r) => r.value === v)?.label ?? "1 day before";

/** An icon for an event type, so the list reads at a glance. */
export function eventIcon(type: string, name = ""): string {
  const t = `${type} ${name}`.toLowerCase();
  if (/sport|athlet|race/.test(t)) return "Trophy";
  if (/trip|picnic|visit|excursion/.test(t)) return "Bus";
  if (/drill|fire|safety/.test(t)) return "Flame";
  if (/meeting|ptm/.test(t)) return "Users";
  if (/alumni/.test(t)) return "GraduationCap";
  if (/debate|speech|elocution/.test(t)) return "Mic";
  if (/science|exhibition|expo|fair/.test(t)) return "FlaskConical";
  if (/competition|quiz|olympiad/.test(t)) return "Medal";
  if (/independence|republic|national|flag/.test(t)) return "Flag";
  if (/annual|function|day/.test(t)) return "Sparkles";
  if (/cultur|diwali|festival|celebrat/.test(t)) return "PartyPopper";
  return "CalendarDays";
}

export const ALBUM_STATUS: Record<string, { label: string; tone: "ok" | "neutral" }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  PUBLISHED: { label: "Published", tone: "ok" },
  ARCHIVED: { label: "Archived", tone: "neutral" },
};
export const VISIBLE_TO: Record<string, string> = { STAFF: "Staff only", CLASSES: "Chosen classes", EVERYONE: "Everyone" };

/** A photo's consent mark (18 §2 Gallery). */
export const PHOTO_MARK = {
  ok: { label: "All consented", tone: "ok" },
  some: { label: "Some without consent", tone: "warn" },
  untagged: { label: "Not tagged", tone: "neutral" },
  none: { label: "No students", tone: "neutral" },
} as const;
export type PhotoMark = keyof typeof PHOTO_MARK;

/* ---------- Time and dates ---------- */

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "9:30 AM" from minutes after midnight. */
export function clock(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
/** "9:30" without AM or PM (slot grids). */
export const clockShort = (min: number) => clock(min).replace(/ (AM|PM)$/, "");
/** "09:30" for a time input. */
export const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
/** Minutes from "09:30", or null. */
export function minutesFrom(v: string | null | undefined): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec((v ?? "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
export const timeSpan = (start: number, end: number | null | undefined) => (end != null && end > start ? `${clock(start)} – ${clock(end)}` : clock(start));

export const isoOf = (d: Date) => d.toISOString().slice(0, 10);
export const dayOf = (iso: string) => new Date(`${iso}T00:00:00Z`);
export const addDaysIso = (iso: string, n: number) => isoOf(new Date(dayOf(iso).getTime() + n * 86_400_000));
/** "Fri, 9 Oct" */
export const niceDay = (iso: string) => { const d = dayOf(iso); return `${DOW[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`; };
/** "Fri 9 Oct 2026" */
export const longDay = (iso: string) => { const d = dayOf(iso); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`; };
/** "9 Oct 2026" */
export const niceYear = (iso: string) => { const d = dayOf(iso); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`; };
/** "Sat 17 Oct" */
export const shortDay = (iso: string) => { const d = dayOf(iso); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`; };
/** "DD-MM-YYYY" */
export const dmy = (iso: string) => iso.split("-").reverse().join("-");
/** "19 Oct – 25 Oct 2026" for a range, "15 Aug 2026" for one day. */
export const spanWords = (from: string, to: string) => (from === to ? niceYear(from) : `${niceYear(from).replace(/ \d{4}$/, "")} – ${niceYear(to)}`);
export const dayCount = (from: string, to: string) => Math.round((dayOf(to).getTime() - dayOf(from).getTime()) / 86_400_000) + 1;

/** Which weekend a date is: Sunday always; the second and fourth Saturday when the school has them off. */
export function weekendOf(iso: string, w: { secondSaturdayOff: boolean; fourthSaturdayOff: boolean }): string | null {
  const d = dayOf(iso);
  const dow = d.getUTCDay();
  if (dow === 0) return "Sunday";
  if (dow === 6) {
    const n = Math.ceil(d.getUTCDate() / 7);
    if (n === 2 && w.secondSaturdayOff) return "Second Saturday";
    if (n === 4 && w.fourthSaturdayOff) return "Fourth Saturday";
  }
  return null;
}

/** "Classes 6–10", "Class 8", "Nursery to UKG" from class names in order. */
export function classesWords(names: string[]) {
  if (!names.length) return "Whole school";
  if (names.length === 1) return /^class/i.test(names[0]) ? names[0] : `Class ${names[0]}`;
  const short = (n: string) => n.replace(/^class\s*/i, "");
  const first = short(names[0]);
  const last = short(names[names.length - 1]);
  if (/^\d+$/.test(first) && /^\d+$/.test(last)) return `Classes ${first}–${last}`;
  return `${first} to ${last}`;
}
