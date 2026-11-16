// Messages that come back from the rules (a form error, a refused code) in the screen's
// language. Fixed messages come from the catalogue; the common ones with a name or a number in
// them are matched here. A message the catalogue does not have stays in English, never blank.
import type { T } from "./t";
import { dateRuns, dayWords } from "./dates";

/** "class 1 A" with the word "class" in the screen's language; the class name stays as typed (QA L6-44). */
const classWords = (t: T, section: string) => section.replace(/^class /, `${t("class")} `);

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
  [/^Take attendance for (.+)$/, (t, m) => t("Take attendance for {section}", { section: classWords(t, m[1]) })],
  [/^Attendance for (.+) was not taken$/, (t, m) => t("Attendance for {section} was not taken", { section: classWords(t, m[1]) })],
  // Layman loop 6 (QA L6-44, L6-32, L6-54): the lock time, leave-day cover and exam status lines.
  [/^Locks at (\d{1,2}:\d{2} [AP]M)$/, (t, m) => t("Locks at {time}", { time: m[1] })],
  [/^locks (\d{1,2}:\d{2} [AP]M)$/, (t, m) => t("locks {time}", { time: m[1] })],
  [/^You are on leave today: (.+) attendance needs cover$/, (t, m) => t("You are on leave today: {section} attendance needs cover", { section: classWords(t, m[1]) })],
  [/^(.+): class teacher on leave today$/, (t, m) => t("{section}: class teacher on leave today", { section: classWords(t, m[1]) })],
  [/^(.+) is on approved leave\. Give today's attendance and periods to someone\.$/, (t, m) => t("{name} is on approved leave. Give today's attendance and periods to someone.", { name: m[1] })],
  [/^(.+): marks being entered$/, (t, m) => t("{exam}: marks being entered", { exam: m[1] })],
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
  // Only the " and " after a pass number joins two people; one inside a name ("Bread and Butter") stays.
  [/^(.+) and (\d[\d,]*) more\.$/, (t, m) => t("{names} and {n} more.", { names: m[1].split(") and ").join("), "), n: m[2] })],
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
  // A wrong mark on Marks Entry (src/lib/exams/compute.ts and the marks grid), said whole (layman loop 5).
  [/^(.+) must be a number\.$/, (t, m) => t("{field} must be a number.", { field: t.any(m[1]) })],
  [/^(.+) is not a number\.$/, (t, m) => t("{field} is not a number.", { field: t.any(m[1]) })],
  [/^(.+) cannot be below 0\.$/, (t, m) => t("{field} cannot be below 0.", { field: t.any(m[1]) })],
  [/^(.+) is out of (\d+(?:\.\d+)?)\. (\d+(?:\.\d+)?) is too high\.$/, (t, m) => t("{field} is out of {max}. {n} is too high.", { field: t.any(m[1]), max: m[2], n: m[3] })],
  [/^(.+): use whole or half marks, such as 37 or 37\.5\.$/, (t, m) => t("{field}: use whole or half marks, such as 37 or 37.5.", { field: t.any(m[1]) })],
  [/^(.+): a minus sign is not allowed: marks start at 0\.$/, (t, m) => t("{field}: a minus sign is not allowed: marks start at 0.", { field: t.any(m[1]) })],
  [/^(.+): “(.*)” is not a mark\. Type a number such as 37 or 37\.5, or AB for absent and ML for medical leave\.$/,
    (t, m) => t("{field}: “{text}” is not a mark. Type a number such as 37 or 37.5, or AB for absent and ML for medical leave.", { field: t.any(m[1]), text: m[2] })],
  [/^(.+): “(.*)” is not finished\. Type AB for absent, ML for medical leave, or the mark\.$/,
    (t, m) => t("{field}: “{text}” is not finished. Type AB for absent, ML for medical leave, or the mark.", { field: t.any(m[1]), text: m[2] })],
  [/^marked (AB|ML) and also has marks\. Remove one\.$/, (t, m) => t("marked {code} and also has marks. Remove one.", { code: m[1] })],
  [/^choose a grade from (.+)\.$/, (t, m) => t("choose a grade from {grades}.", { grades: m[1] })],
  // A header part "Class teacher Ravi Teja" (Attendance), and "Your classes: 5 A, 5 B" (Students).
  [/^Class teacher (.+)$/, (t, m) => t("Class teacher {name}", { name: m[1] })],
  [/^Your classes: (.+)$/, (t, m) => t("Your classes: {classes}", { classes: m[1] })],
  // Dashboard card lines (src/lib/dashboard/widgets): short money ("₹48.17 L") and a year name in them.
  [/^(₹[\d.,]+(?: Cr| L|k)?) of (₹[\d.,]+(?: Cr| L|k)?) due so far$/, (t, m) => t("{paid} of {due} due so far", { paid: m[1], due: m[2] })],
  [/^Latest in (.+)$/, (t, m) => t("Latest in {year}", { year: m[1] })],
  [/^(.+): nothing due yet$/, (t, m) => t("{year}: nothing due yet", { year: m[1] })],
  [/^(\d[\d,]*) studying in (.+)$/, (t, m) => t("{n} studying in {year}", { n: m[1], year: m[2] })],
  // Communication: whose words a notice or message is, and whom a teacher may message.
  [/^By (.+)$/, (t, m) => t("By {name}", { name: m[1] })],
  [/^Automatic: (.+)$/, (t, m) => t("Automatic: {name}", { name: m[1] })],
  [/^Only the people you may message: (.+)\.$/, (t, m) => t("Only the people you may message: {who}.", { who: t.any(m[1]) })],
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
  // Only the dates in a part get day and month names: "Sat Pal Singh" or a visitor "April" stays as typed.
  const part = (p: string) => dateRuns(t, screenMessage(t, p));
  return text.split(" · ").map((p) => (p.includes(". ") ? p.replace(/\. /g, ".\u0000").split("\u0000").map(part).join(" ") : part(p))).join(" · ");
}
