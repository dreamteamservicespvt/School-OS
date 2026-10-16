// Words, numbers and dates (00-global.md P3 and P17).

const wholeRupees = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const withPaise = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });

/** Money is stored in paise. 11640000 paise is shown as ₹1,16,400; 50050 as ₹500.50. */
export function formatRupees(paise: bigint | number): string {
  const p = Number(paise);
  return p % 100 === 0 ? wholeRupees.format(p / 100) : withPaise.format(p / 100);
}

/** Dates show as DD-MM-YYYY, in the school's time zone. */
export function formatDate(date: Date, timeZone = "Asia/Kolkata"): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}-${get("month")}-${get("year")}`;
}

/** Times in 12-hour format with AM and PM (inferred). */
export function formatTime(date: Date, timeZone = "Asia/Kolkata"): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone, hour: "numeric", minute: "2-digit", hour12: true })
    .format(date)
    .replace(/\s?(am|pm)$/i, (m) => ` ${m.trim().toUpperCase()}`);
}

export function formatDateTime(date: Date, timeZone = "Asia/Kolkata"): string {
  return `${formatDate(date, timeZone)}, ${formatTime(date, timeZone)}`;
}

/** Indian mobile numbers: +91 and 10 digits (inferred). Returns an error in plain words, or null. */
export function checkIndianMobile(input: string): string | null {
  const digits = input.replace(/[^\d]/g, "").replace(/^91(?=\d{10}$)/, "");
  if (digits.length !== 10) {
    return `Phone number has ${digits.length} digits. Indian mobile numbers have 10 digits.`;
  }
  if (!/^[6-9]/.test(digits)) return "Indian mobile numbers start with 6, 7, 8 or 9.";
  return null;
}

/** Big amounts in short words for tiles and charts: ₹2.33 Cr, ₹42.3 L, ₹8.4k (paise in). */
export function formatRupeesShort(paise: bigint | number): string {
  const n = Math.round(Number(paise) / 100);
  const neg = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1e7) return `${neg}₹${(a / 1e7).toFixed(2).replace(/\.?0+$/, "")} Cr`;
  if (a >= 1e5) return `${neg}₹${(a / 1e5).toFixed(2).replace(/\.?0+$/, "")} L`;
  if (a >= 1e3) return `${neg}₹${(a / 1e3).toFixed(1).replace(/\.0$/, "")}k`;
  return `${neg}₹${a}`;
}
