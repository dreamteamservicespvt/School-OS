// Day and month names inside a date written in words ("Thursday, 22 October"), in the screen's
// language. Numeric dates stay DD-MM-YYYY everywhere (formatDate, 00-global.md P17).
// No lookbehind here: this file reaches the browser (tests/no-lookbehind-in-browser.test.ts).
import type { T } from "./t";

const NAMES = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
];
const WORD = new RegExp(`\\b(${NAMES.join("|")})\\b`, "g");
// "Sat 17 Oct 2026" (Events & Calendar): the short names are shown as the full name. "Sept" too.
const SHORT = new Map([...NAMES.map((n): [string, string] => [n.slice(0, 3), n]), ["Sept", "September"]]);
const SHORT_WORD = new RegExp(`\\b(${[...SHORT.keys()].join("|")})\\b`, "g");
const NAME = `(?:${[...NAMES, ...SHORT.keys()].join("|")})`;
// A run of date words and numbers ("Mon 16 Nov", "Thursday, 22 October 2026", "2 Nov"): a lone
// "April" or "Sat" (a visitor's name, "Sat Pal Singh") is never one, because a run needs a number.
const RUN = new RegExp(`\\b(?:${NAME}|\\d{1,4})(?:,? (?:${NAME}|\\d{1,4}))+\\b`, "g");

/** "Thursday, 22 October" becomes "गुरुवार, 22 अक्टूबर" on a Hindi screen; "Sat 17 Oct" too. */
export function dayWords(t: T, text: string): string {
  if (t.lang === "en") return text;
  return text.replace(WORD, (name) => t.any(name)).replace(SHORT_WORD, (s) => t.any(SHORT.get(s) ?? s));
}

const LONE = new RegExp(`^${NAME}(?: \\d{2,4})?$`);
/** A chart's month or day label ("Sept", "Oct", "Mon"): always a date there, so said in the screen's language. */
export function dateLabel(t: T, text: string): string {
  return t.lang !== "en" && LONE.test(text) ? dayWords(t, text) : text;
}

/** Only the dates inside a line ("Was due 2 Nov", "Next class: Mon 16 Nov"); names around them stay as typed. */
export function dateRuns(t: T, text: string): string {
  if (t.lang === "en") return text;
  return text.replace(RUN, (run) => (/\d/.test(run) && new RegExp(NAME).test(run) ? dayWords(t, run) : run));
}

/**
 * A blank's value that is only a date in words ("Monday, 16 November", "Sun 15 Nov", "2 Nov"), in the
 * screen's language; anything else (a name, a title, a lone "April") stays exactly as it is.
 */
export function dateBlank(t: T, value: string): string {
  if (t.lang === "en" || !/[A-Za-z]/.test(value) || !/\d/.test(value)) return value;
  const rest = value.replace(WORD, "").replace(SHORT_WORD, "").replace(/\b[AP]M\b/g, "");
  return /^[\d\s,.:–-]*$/.test(rest) ? dayWords(t, value) : value;
}
