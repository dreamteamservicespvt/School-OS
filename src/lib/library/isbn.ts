// ISBN format check on entry (13 §2 Add book): 10 or 13 digits, the last of
// a 10-digit ISBN may be X, with a valid check digit; hyphens and spaces are
// ignored. Shared by the form in the browser and the server.

export const ISBN_INVALID = "This ISBN is not valid. Check the number on the back cover.";

/** The ISBN without hyphens or spaces, upper-case X. */
export function cleanIsbn(raw: string | null | undefined) {
  return (raw ?? "").replace(/[\s-]/g, "").toUpperCase();
}

/** True when the ISBN (cleaned) has 10 or 13 digits and a correct check digit. */
export function isbnValid(raw: string | null | undefined) {
  const s = cleanIsbn(raw);
  if (/^\d{9}[\dX]$/.test(s)) {
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += (s[i] === "X" ? 10 : Number(s[i])) * (10 - i);
    return sum % 11 === 0;
  }
  if (/^\d{13}$/.test(s)) {
    let sum = 0;
    for (let i = 0; i < 13; i++) sum += Number(s[i]) * (i % 2 === 0 ? 1 : 3);
    return sum % 10 === 0;
  }
  return false;
}

/** "978-81-7371-146-6" style for showing; the stored value stays plain. */
export function showIsbn(s: string | null | undefined) {
  if (!s) return "";
  if (s.length === 13) return `${s.slice(0, 3)}-${s.slice(3, 5)}-${s.slice(5, 9)}-${s.slice(9, 12)}-${s.slice(12)}`;
  if (s.length === 10) return `${s.slice(0, 2)}-${s.slice(2, 6)}-${s.slice(6, 9)}-${s.slice(9)}`;
  return s;
}
