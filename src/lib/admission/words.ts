// Short words for dates and phones on Admission screens (00-global.md P17):
// "Today, 2:00 PM", "Tomorrow, 11:00 AM", otherwise DD-MM-YYYY with the time.
import { formatDate, formatDateTime, formatTime } from "../format";

function dayKey(d: Date, tz: string) {
  return formatDate(d, tz);
}

export function whenWords(d: Date, tz: string, now = new Date()) {
  const day = dayKey(d, tz);
  if (day === dayKey(now, tz)) return `Today, ${formatTime(d, tz)}`;
  if (day === dayKey(new Date(now.getTime() + 86_400_000), tz)) return `Tomorrow, ${formatTime(d, tz)}`;
  if (day === dayKey(new Date(now.getTime() - 86_400_000), tz)) return `Yesterday, ${formatTime(d, tz)}`;
  return formatDateTime(d, tz);
}

/** 9876543210 as "98765 43210". */
export function phoneWords(p: string) {
  return /^\d{10}$/.test(p) ? `${p.slice(0, 5)} ${p.slice(5)}` : p;
}
