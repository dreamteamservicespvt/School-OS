// Day and month names inside a date written in words ("Thursday, 22 October"), in the screen's
// language. Numeric dates stay DD-MM-YYYY everywhere (formatDate, 00-global.md P17).
import type { T } from "./t";

const NAMES = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
  "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December",
];
const WORD = new RegExp(`\\b(${NAMES.join("|")})\\b`, "g");

/** "Thursday, 22 October" becomes "गुरुवार, 22 अक्टूबर" on a Hindi screen. */
export function dayWords(t: T, text: string): string {
  if (t.lang === "en") return text;
  return text.replace(WORD, (name) => t.any(name));
}
