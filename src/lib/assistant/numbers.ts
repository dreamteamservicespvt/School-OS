// The no-invention guard (00-global.md §2.1 rule 2). The model writes the
// reply in the person's language, but it may only use numbers that are in
// the records the tools returned (or in the person's own words, or today's
// date). A reply with any other number is never shown: the code's own
// sentences from the same records are shown instead.
// No database and no server code, so it is tested on its own.

/** Telugu (౦-౯) and Devanagari (०-९) digits as 0-9. */
export function asciiDigits(text: string): string {
  return text.replace(/[౦-౯]/g, (c) => String(c.charCodeAt(0) - 0x0c66)).replace(/[०-९]/g, (c) => String(c.charCodeAt(0) - 0x0966));
}

/** Every number in a text, as written without grouping commas: "₹1,20,000" -> "120000", "92.5%" -> "92.5", "2026-11-15" -> 2026, 11, 15. */
export function numbersIn(text: string): string[] {
  const t = asciiDigits(String(text ?? "")).replace(/(\d),(?=\d)/g, "$1");
  return (t.match(/\d+(?:\.\d+)?/g) ?? []).map(canon);
}

/** "05" and "5", "45600.00" and "45600" are the same number. */
const canon = (n: string): string => String(Number(n));

/** The numbers a reply may use: those in the records, the person's words and today's date. */
export function allowedNumbers(sources: readonly unknown[], today?: Date): Set<string> {
  const out = new Set<string>();
  for (const s of sources) for (const n of numbersIn(typeof s === "string" ? s : JSON.stringify(s, (_k, v) => (typeof v === "bigint" ? v.toString() : v)) ?? "")) out.add(n);
  if (today) {
    const iso = today.toISOString().slice(0, 10);
    for (const n of numbersIn(iso)) out.add(n);
  }
  return out;
}

/** Numbers in the reply that are in none of the records: the reply must not be shown when this is not empty. */
export function inventedNumbers(reply: string, allowed: ReadonlySet<string>): string[] {
  return [...new Set(numbersIn(reply).filter((n) => !allowed.has(n)))];
}
