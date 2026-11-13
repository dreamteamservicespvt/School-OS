// A staff member's age from the date of birth (layman test LD5). Pure, so the
// Add Staff screen can warn while the person types and the server can check.

/** Under 14 or over 100 cannot be right: refused. */
export const STAFF_MIN_AGE = 14;
export const STAFF_MAX_AGE = 100;
/** Under 18 or over 80 is unusual: a gentle warning, the save goes ahead. */
export const STAFF_USUAL_MIN_AGE = 18;
export const STAFF_USUAL_MAX_AGE = 80;

/** Whole years from the date of birth to `today` (both calendar days, UTC midnight). */
export function ageOn(dateOfBirth: Date, today: Date): number {
  let years = today.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const before = today.getUTCMonth() < dateOfBirth.getUTCMonth() || (today.getUTCMonth() === dateOfBirth.getUTCMonth() && today.getUTCDate() < dateOfBirth.getUTCDate());
  if (before) years--;
  return years;
}

const yearsText = (n: number) => `${n} year${n === 1 ? "" : "s"} old`;

/** The plain-words refusal for a date of birth that cannot be right, or null (also used by the staff import). */
export function staffAgeProblem(dateOfBirth: Date | null, today = new Date()): string | null {
  if (!dateOfBirth || dateOfBirth.getTime() > today.getTime()) return null;
  const age = ageOn(dateOfBirth, today);
  if (age < STAFF_MIN_AGE || age > STAFF_MAX_AGE) return `This date of birth makes them ${yearsText(age)}. Check the year of birth.`;
  return null;
}

/** A gentle warning for an unusual but possible age, or null. */
export function staffAgeWarning(dateOfBirth: Date | null, today = new Date()): string | null {
  if (!dateOfBirth || dateOfBirth.getTime() > today.getTime() || staffAgeProblem(dateOfBirth, today)) return null;
  const age = ageOn(dateOfBirth, today);
  if (age < STAFF_USUAL_MIN_AGE || age > STAFF_USUAL_MAX_AGE) return `This makes them ${yearsText(age)}. Check the year of birth; if it is right, carry on.`;
  return null;
}

/** The same warning for a YYYY-MM-DD value typed in a date box. */
export function staffAgeWarningFor(iso: string, todayIso: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !/^\d{4}-\d{2}-\d{2}$/.test(todayIso)) return null;
  return staffAgeWarning(new Date(`${iso}T00:00:00Z`), new Date(`${todayIso}T00:00:00Z`));
}
