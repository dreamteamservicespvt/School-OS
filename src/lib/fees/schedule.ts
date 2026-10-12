// Installment schedules (06, Fee Structure): due dates generated from the
// frequency and the year start, on the 10th of each period (inferred), and
// amounts that always add up to the row total (rule 11). No database here.

import { formatRupees } from "../format";
import type { FrequencyValue } from "./words";

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type Period = { label: string; dueDate: Date };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const tenth = (y: number, m: number) => new Date(Date.UTC(y, m, 10));

/** The periods of a year for a frequency: labels and default due dates. Terms come from the year's terms when given. */
export function periodsFor(frequency: FrequencyValue, yearStart: Date, terms: { name: string; startDate: Date }[] = []): Period[] {
  const y = yearStart.getUTCFullYear();
  const m = yearStart.getUTCMonth();
  const monthAt = (k: number) => { const t = m + k; return { y: y + Math.floor(t / 12), m: t % 12 }; };
  switch (frequency) {
    case "MONTHLY":
      return Array.from({ length: 12 }, (_, k) => { const p = monthAt(k); return { label: `${SHORT[p.m]} ${p.y}`, dueDate: tenth(p.y, p.m) }; });
    case "QUARTERLY":
      return Array.from({ length: 4 }, (_, k) => { const a = monthAt(k * 3), b = monthAt(k * 3 + 2); return { label: `Quarter ${k + 1} (${SHORT[a.m]} to ${SHORT[b.m]})`, dueDate: tenth(a.y, a.m) }; });
    case "HALF_YEARLY":
      return Array.from({ length: 2 }, (_, k) => { const a = monthAt(k * 6), b = monthAt(k * 6 + 5); return { label: `Half ${k + 1} (${SHORT[a.m]} to ${SHORT[b.m]})`, dueDate: tenth(a.y, a.m) }; });
    case "TERM": {
      if (terms.length) return terms.map((t) => ({ label: t.name, dueDate: tenth(t.startDate.getUTCFullYear(), t.startDate.getUTCMonth()) }));
      return Array.from({ length: 2 }, (_, k) => { const a = monthAt(k * 6); return { label: `Term ${k + 1}`, dueDate: tenth(a.y, a.m) }; });
    }
    case "YEARLY":
      return [{ label: `Year ${y}-${String((y + 1) % 100).padStart(2, "0")}`, dueDate: tenth(y, m) }];
    case "ONE_TIME":
    default:
      return [{ label: "One-time", dueDate: tenth(y, m) }];
  }
}

/** Splits a total into n parts that add up exactly; whole rupees where possible, the rest on the last. */
export function splitTotal(total: bigint, n: number): bigint[] {
  if (n <= 0) return [];
  const rupee = BigInt(100);
  const each = (total / BigInt(n) / rupee) * rupee;
  const parts = Array.from({ length: n }, () => each);
  parts[n - 1] = total - each * BigInt(n - 1);
  return parts;
}

export type InstallmentDraft = { label: string; dueDate: Date; amountPaise: bigint };

/** Checks a schedule: at least one row, every amount above zero, real dates, and the sum equals the total. */
export function checkSchedule(total: bigint, rows: InstallmentDraft[]): string | null {
  if (rows.length === 0) return "Add at least one installment.";
  if (rows.some((r) => r.amountPaise <= BigInt(0))) return "Every installment needs an amount above ₹0.";
  if (rows.some((r) => Number.isNaN(r.dueDate.getTime()))) return "Every installment needs a due date.";
  if (rows.some((r) => !r.label.trim())) return "Every installment needs a name, such as Apr 2026.";
  const sum = rows.reduce((s, r) => s + r.amountPaise, BigInt(0));
  if (sum !== total) return `Installments add up to ${formatRupees(sum)}. Total is ${formatRupees(total)}.`;
  return null;
}

export function defaultSchedule(frequency: FrequencyValue, total: bigint, yearStart: Date, terms: { name: string; startDate: Date }[] = []): InstallmentDraft[] {
  const periods = periodsFor(frequency, yearStart, terms);
  const parts = splitTotal(total, periods.length);
  return periods.map((p, i) => ({ label: p.label, dueDate: p.dueDate, amountPaise: parts[i] }));
}

export { iso as isoDate };
