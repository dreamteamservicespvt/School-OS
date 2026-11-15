// One rule for a person's name, used by Add Student (student and parent), the
// student's and parent's profile, and Add Staff (layman loop 4: "😀 Chintu" and
// "12345" were saved as names). A name starts with a letter in any script
// (Hindi, Telugu, English ...), so an emoji, a digit or a dot first is refused.
// Safe in the browser, so a form can check it before Save.
import { text } from "./forms";

/** True when the name, after leading spaces, starts with a letter of any language. */
export function startsWithLetter(name: string): boolean {
  const first = Array.from(name.trim())[0];
  return Boolean(first && /\p{L}/u.test(first));
}

/** The problem with a name typed in a box, or null when it is fine. */
export function nameProblem(label: string, name: string): string | null {
  if (!name.trim()) return null; // "is needed" comes from the box being required
  return startsWithLetter(name) ? null : `${label} must start with a letter.`;
}

/** A required name field for a form schema: needed, at most `max` characters, starting with a letter. */
export const personName = (label: string, max = 120) =>
  text(label, max).refine((v) => startsWithLetter(v), { message: `${label} must start with a letter.` });

