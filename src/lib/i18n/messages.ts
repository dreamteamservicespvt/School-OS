// Messages that come back from the rules (a form error, a refused code) in the screen's
// language. Fixed messages come from the catalogue; the common ones with a name or a number in
// them are matched here. A message the catalogue does not have stays in English, never blank.
import type { T } from "./t";

const PATTERNS: [RegExp, (t: T, m: RegExpExecArray) => string][] = [
  [/^(.+) is needed\.$/, (t, m) => t("{field} is needed.", { field: t.any(m[1]) })],
  [/^(.+) can be at most (\d+) characters\.$/, (t, m) => t("{field} can be at most {n} characters.", { field: t.any(m[1]), n: m[2] })],
  [/^(.+) has (\d+) digits\. Indian mobile numbers have 10 digits\.$/, (t, m) => t("{field} has {n} digits. Indian mobile numbers have 10 digits.", { field: t.any(m[1]), n: m[2] })],
  [/^(.+): Indian mobile numbers start with 6, 7, 8 or 9\.$/, (t, m) => t("{field}: Indian mobile numbers start with 6, 7, 8 or 9.", { field: t.any(m[1]) })],
  [/^Too many tries in a short time\. Please wait (\d+) seconds and try again\.$/, (t, m) => t("Too many tries in a short time. Please wait {n} seconds and try again.", { n: m[1] })],
  [/^Too many tries in a short time\. Please wait (\d+) minutes and try again\.$/, (t, m) => t("Too many tries in a short time. Please wait {n} minutes and try again.", { n: m[1] })],
  [/^That code is not right\. (\d+) (?:try|tries) left\.$/, (t, m) => t("That code is not right. {n} tries left.", { n: m[1] })],
  [/^This date of birth makes them (\d+) years? old\. Check the year of birth\.$/, (t, m) => t("This date of birth makes them {n} years old. Check the year of birth.", { n: m[1] })],
  [/^This makes them (\d+) years? old\. Check the year of birth; if it is right, carry on\.$/, (t, m) => t("This makes them {n} years old. Check the year of birth; if it is right, carry on.", { n: m[1] })],
  [/^Code sent\. It works for (\d+) minutes\.$/, (t, m) => t("Code sent. It works for {n} minutes.", { n: m[1] })],
  // A day with no attendance (offDayMessage in src/lib/attendance/calendar.ts).
  [/^Holiday: (.+)\. Attendance is off for (\d{2}-\d{2}-\d{4})\.$/, (t, m) => t("Holiday: {title}. Attendance is off for {date}.", { title: m[1], date: m[2] })],
  [/^(\d{2}-\d{2}-\d{4}) is a Sunday\. Attendance is off for this date\.$/, (t, m) => t("{date} is a Sunday. Attendance is off for this date.", { date: m[1] })],
  [/^(\d{2}-\d{2}-\d{4}) is a (.+), not a working day\. Attendance is off for this date\.$/, (t, m) => t("{date} is a {day}, not a working day. Attendance is off for this date.", { date: m[1], day: t.any(m[2].charAt(0).toUpperCase() + m[2].slice(1)) })],
  // Times are typed as 12-hour clock times (owner test 2026-11-05, note 2).
  [/^Give the (start|end) time like (\d{1,2}:\d{2} [AP]M)\.$/, (t, m) => (m[1] === "start" ? t("Give the start time like {time}.", { time: m[2] }) : t("Give the end time like {time}.", { time: m[2] }))],
  // Add Staff, step 3 (src/lib/staff/class-picks.ts).
  [/^Step 3: (.+) already has a class teacher, (.+)\. Choose another section, or change it in Academic Management, Classes & Sections\.$/, (t, m) => t("Step 3: {section} already has a class teacher, {name}. Choose another section, or change it in Academic Management, Classes & Sections.", { section: m[1], name: m[2] })],
];

const TESTER = " (On this tester's computer the code is in the server log.)";

export function screenMessage(t: T, message: string): string;
export function screenMessage(t: T, message: string | null | undefined): string | undefined;
export function screenMessage(t: T, message: string | null | undefined): string | undefined {
  if (!message) return message ?? undefined;
  if (t.lang === "en") return message;
  if (message.endsWith(TESTER)) return `${screenMessage(t, message.slice(0, -TESTER.length))} ${t("(On this tester's computer the code is in the server log.)")}`;
  for (const [re, say] of PATTERNS) {
    const m = re.exec(message);
    if (m) return say(t, m);
  }
  return t.any(message);
}
