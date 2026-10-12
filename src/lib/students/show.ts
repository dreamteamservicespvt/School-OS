// Small display helpers shared by the Student Management and Staff & HR screens.

/** "9849560211" → "98495 60211" (how Indian mobiles are read out). */
export function phoneShow(phone: string | null | undefined): string {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  return d.length === 10 ? `${d.slice(0, 5)} ${d.slice(5)}` : phone;
}

/** "Class 7" + "B" → "7 B"; "Nursery" + "A" → "Nursery A" (design: students.jsx lab()). */
export function classShort(className: string, sectionName?: string | null): string {
  const c = className.startsWith("Class ") ? className.slice(6) : className;
  return sectionName ? `${c} ${sectionName}` : c;
}

/** "14 March 2014" style dates for read-only details (design words); forms and lists keep DD-MM-YYYY. */
export function longDate(date: Date, timeZone = "Asia/Kolkata"): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "long", year: "numeric" }).format(date);
}

/** "9 Oct" for dates in the current year, "9 Oct 2025" otherwise. */
export function shortDate(date: Date, timeZone = "Asia/Kolkata", now = new Date()): string {
  const y = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric" }).format(d);
  const sameYear = y(date) === y(now);
  return new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) }).format(date);
}

/** Whole years between a date of birth and today. */
export function ageOn(dob: Date, today = new Date()): number {
  let a = today.getUTCFullYear() - dob.getUTCFullYear();
  const m = today.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < dob.getUTCDate())) a -= 1;
  return a;
}

/** How many rows a list shows: 25 more each time "Show more" is pressed, at most 500. */
export function shownCount(raw: Record<string, string | string[] | undefined>, step = 25) {
  const v = Array.isArray(raw.n) ? raw.n[0] : raw.n;
  return Math.min(500, Math.max(step, Number.parseInt(String(v ?? ""), 10) || step));
}
