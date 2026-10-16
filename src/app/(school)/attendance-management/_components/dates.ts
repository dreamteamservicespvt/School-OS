// Dates in words for Attendance screens. School dates are date-only (midnight UTC).

/** "Friday, 9 October" */
export const longDay = (d: Date) => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(d);

/** "Fri 9 Oct" */
export const shortDay = (d: Date) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(d).replace(",", "");

/** "9 Oct" */
export const dayMonth = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(d);

/** "October 2026" */
export const monthYear = (d: Date) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);

/** "Mon 12 Oct" for one day, "12–14 Oct" or "30 Sep–2 Oct" for a range. */
export function rangeText(from: Date, to: Date) {
  if (from.getTime() === to.getTime()) return shortDay(from);
  if (from.getUTCMonth() === to.getUTCMonth()) return `${from.getUTCDate()}–${dayMonth(to)}`;
  return `${dayMonth(from)}–${dayMonth(to)}`;
}
