// Reading a date typed in a student file: DD-MM-YYYY, DD/MM/YYYY or YYYY-MM-DD.

/** DD-MM-YYYY, DD/MM/YYYY or YYYY-MM-DD; null when it is not a real date. */
export function parseDate(text: string): Date | null {
  const t = text.trim();
  let y: number, m: number, d: number;
  let match = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (match) { d = +match[1]; m = +match[2]; y = +match[3]; }
  else if ((match = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) { y = +match[1]; m = +match[2]; d = +match[3]; }
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}
