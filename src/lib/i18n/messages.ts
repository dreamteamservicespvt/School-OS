// Messages that come back from the rules (a form error, a refused code) in the screen's
// language. Fixed messages come from the catalogue; the common ones with a name or a number in
// them are matched here. A message the catalogue does not have stays in English, never blank.
import type { T } from "./t";
import { dayWords } from "./dates";

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
  // Dashboard cards (src/lib/dashboard/widgets): sentences with a class, an exam or a day in them (layman loop 3).
  [/^(\d[\d,]*) students? in (.+) below 50% or not passing in (.+)$/, (t, m) => t("{n} students in {section} below 50% or not passing in {exam}", { n: m[1], section: m[2], exam: m[3] })],
  [/^(\d[\d,]*) students? below 50% or not passing in (.+)$/, (t, m) => t("{n} students below 50% or not passing in {exam}", { n: m[1], exam: m[2] })],
  [/^My class: (.+)$/, (t, m) => t("My class: {section}", { section: m[1] })],
  [/^Take attendance for (.+)$/, (t, m) => t("Take attendance for {section}", { section: m[1] })],
  [/^Attendance for (.+) was not taken$/, (t, m) => t("Attendance for {section} was not taken", { section: m[1] })],
  [/^Back on (.+)$/, (t, m) => t("Back on {day}", { day: dayWords(t, m[1]) })],
  [/^due (\w{3}(?: \d{1,2} \w{3})?)$/, (t, m) => t("due {day}", { day: dayWords(t, m[1]) })],
  [/^Holiday: (.+)$/, (t, m) => t("Holiday: {title}", { title: m[1] })],
  [/^Vacation: (.+)$/, (t, m) => t("Vacation: {title}", { title: m[1] })],
  // Notifications in the bell (layman loop 4): the sign-in alert said whole in the reader's language.
  [/^New sign-in to (.+?) on (.+), (\d{2}-\d{2}-\d{4},? \d{1,2}:\d{2} [AP]M)\. Not you\? Sign out everywhere in My profile and change your password\.$/,
    (t, m) => t("New sign-in to {school} on {where}, {when}. Not you? Sign out everywhere in My profile and change your password.", { school: m[1], where: m[2], when: m[3] })],
  [/^Enquiry added for (.+)\.$/, (t, m) => t("Enquiry added for {name}.", { name: m[1] })],
  [/^Homework sent to (.+) \((\d[\d,]*) students?\)\.$/, (t, m) => t("Homework sent to {class} ({n} students).", { class: m[1], n: m[2] })],
  [/^Parents of (.+)$/, (t, m) => t("Parents of {class}", { class: m[1] })],
  [/^(.+) and (\d[\d,]*) more$/, (t, m) => t("{names} and {n} more", { names: m[1], n: m[2] })],
  // "Sanjay Verma (V-0240) and Deepika Rao (V-0232) and 4 more." (Front Office dashboard card, layman loop 4).
  [/^(.+) and (\d[\d,]*) more\.$/, (t, m) => t("{names} and {n} more.", { names: m[1].split(" and ").join(", "), n: m[2] })],
  [/^Was due (.+)$/, (t, m) => t("Was due {day}", { day: dayWords(t, m[1]) })],
  // Where a staff member is now (Front Office, src/lib/front-office/staff.ts), layman loop 4.
  [/^Teaching (.+) till (\d{1,2}:\d{2} [AP]M)$/, (t, m) => t("Teaching {class} till {time}", { class: m[1], time: m[2] })],
  [/^Teaching (.+)$/, (t, m) => t("Teaching {class}", { class: m[1] })],
  // An enquiry's history line "Enquiry added. Source: Walk-in. Owner: Divya Menon." (each sentence alone).
  [/^Source: (.+)\.$/, (t, m) => t("Source: {source}.", { source: t.any(m[1]) })],
  [/^Owner: (.+)\.$/, (t, m) => t("Owner: {name}.", { name: m[1] })],
  // Parent messages card (src/lib/dashboard/widgets/communication.ts) and the Analytics Students tile.
  [/^Parent messages: (\d[\d,]*) open$/, (t, m) => t("Parent messages: {n} open", { n: m[1] })],
  [/^(\d[\d,]*) past the reply time$/, (t, m) => t("{n} past the reply time", { n: m[1] })],
  [/^(\d[\d,]*) not in a class yet$/, (t, m) => t("{n} not in a class yet", { n: m[1] })],
];

const TESTER = " (On this tester's computer the code is in the server log.)";

export function screenMessage(t: T, message: string): string;
export function screenMessage(t: T, message: string | null | undefined): string | undefined;
export function screenMessage(t: T, message: string | null | undefined): string | undefined {
  if (!message) return message ?? undefined;
  if (t.lang === "en") return message;
  if (message.endsWith(TESTER)) return `${screenMessage(t, message.slice(0, -TESTER.length))} ${t("(On this tester's computer the code is in the server log.)")}`;
  // Words the catalogue has whole come first ("Back on shelf" is not "Back on {day}").
  const whole = t.any(message);
  if (whole !== message) return whole;
  for (const [re, say] of PATTERNS) {
    const m = re.exec(message);
    if (m) return say(t, m);
  }
  return message;
}

/**
 * A line made of " · " parts or short sentences (a dashboard card's detail, a tile's foot): each part
 * in the screen's language, with day and month names too; names and numbers stay as they are.
 */
export function screenLine(t: T, text: string): string;
export function screenLine(t: T, text: string | null | undefined): string | undefined;
export function screenLine(t: T, text: string | null | undefined): string | undefined {
  if (!text || t.lang === "en") return text ?? undefined;
  const whole = screenMessage(t, text);
  if (whole !== text) return whole;
  const part = (p: string) => dayWords(t, screenMessage(t, p));
  return text.split(" · ").map((p) => (p.includes(". ") ? p.replace(/\. /g, ".\u0000").split("\u0000").map(part).join(" ") : part(p))).join(" · ");
}
