// Day and month names inside a date written in words ("Thursday, 22 October"), in the screen's
// language. Numeric dates stay DD-MM-YYYY everywhere (formatDate, 00-global.md P17).
import type { T } from "./t";

const NAMES = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
];
const WORD = new RegExp(`\\b(${NAMES.join("|")})\\b`, "g");
// "Sat 17 Oct 2026" (Events & Calendar): the short names are shown as the full name.
const SHORT = new Map(NAMES.map((n) => [n.slice(0, 3), n]));
const SHORT_WORD = new RegExp(`\\b(${[...SHORT.keys()].join("|")})\\b`, "g");

/** "Thursday, 22 October" becomes "गुरुवार, 22 अक्टूबर" on a Hindi screen; "Sat 17 Oct" too. */
export function dayWords(t: T, text: string): string {
  if (t.lang === "en") return text;
  return text.replace(WORD, (name) => t.any(name)).replace(SHORT_WORD, (s) => t.any(SHORT.get(s) ?? s));
}
