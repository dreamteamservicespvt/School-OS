// When an enquiry's follow-up is "today" and when it is "overdue": by the school's day, not by the
// minute. A call set for 11:00 is still today's work at 3:00 PM; it turns overdue when the day has
// ended in the school's time zone. One rule for the Dashboard card, the Admission Dashboard, the
// Enquiries list and the Follow-up report, the same split the Front Office desk shows
// (src/lib/front-office/calls.ts followUpsDue). Live test 17 Nov 2026: the Dashboard said
// "1 follow-up today" while the Admission Dashboard said "4 overdue · 0 today" for the same enquiries.
import { instantToLocal, zonedToInstant } from "./act";

const DAY = 86_400_000;

/** The school's today as two instants: from `start` up to, not including, `end`. */
export type FollowUpDay = { start: Date; end: Date };

export function followUpDay(timeZone: string, now = new Date()): FollowUpDay {
  const start = zonedToInstant(`${instantToLocal(now, timeZone).slice(0, 10)}T00:00`, timeZone);
  return { start, end: new Date(start.getTime() + DAY) };
}

/** "overdue": its day is over. "today": any time today, passed or still to come. "later": a coming day. */
export function followUpDue(at: Date, day: FollowUpDay): "overdue" | "today" | "later" {
  return at < day.start ? "overdue" : at < day.end ? "today" : "later";
}
