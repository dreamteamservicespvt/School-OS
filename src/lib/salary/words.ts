// Words used on the Salary Management screens (10 §2), in the order of the run.

export const RUN_STEPS = [
  ["OPEN", "Open"],
  ["CALCULATED", "Calculated"],
  ["WAITING", "Waiting for approval"],
  ["APPROVED", "Approved"],
  ["PAID", "Paid"],
  ["LOCKED", "Locked"],
] as const;

export type RunStatus = (typeof RUN_STEPS)[number][0];

export const RUN_STATUS_LABEL: Record<string, string> = Object.fromEntries(RUN_STEPS);
export const RUN_STATUS_TONE: Record<string, "neutral" | "info" | "warn" | "brand" | "ok"> = { OPEN: "neutral", CALCULATED: "info", WAITING: "warn", APPROVED: "brand", PAID: "ok", LOCKED: "neutral" };

export const ADJUSTMENT_TYPES = [
  { value: "BONUS", label: "Bonus" },
  { value: "ARREARS", label: "Arrears" },
  { value: "DEDUCTION", label: "Deduction" },
  { value: "OTHER", label: "Other" },
] as const;
export const adjustmentLabel = (t: string) => ADJUSTMENT_TYPES.find((a) => a.value === t)?.label ?? t;

export const PAY_MODES = [
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "CASH", label: "Cash" },
] as const;
export const payModeLabel = (m: string | null | undefined) => PAY_MODES.find((x) => x.value === m)?.label ?? m ?? "";

export const ADVANCE_STATUS_LABEL: Record<string, string> = { WAITING: "Waiting for approval", APPROVED: "Not paid yet", ACTIVE: "Active", CLOSED: "Closed", REJECTED: "Not approved", CANCELLED: "Cancelled" };
export const ADVANCE_STATUS_TONE: Record<string, "ok" | "warn" | "neutral" | "bad" | "info"> = { WAITING: "warn", APPROVED: "warn", ACTIVE: "ok", CLOSED: "neutral", REJECTED: "bad", CANCELLED: "neutral" };

export const SLIP_STATUS_LABEL: Record<string, string> = { MADE: "Made", SENT: "Sent", DOWNLOADED: "Downloaded" };
export const SLIP_STATUS_TONE: Record<string, "ok" | "info" | "warn"> = { MADE: "warn", SENT: "info", DOWNLOADED: "ok" };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "October 2026" for a month's first day. */
export const monthName = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
export const monthShort = (d: Date) => SHORT[d.getUTCMonth()];
/** "Wed 30 Sep". */
export const dayShort = (d: Date) => `${WEEK[d.getUTCDay()]} ${d.getUTCDate()} ${SHORT[d.getUTCMonth()]}`;
/** "2026-10" for URLs. */
export const monthKey = (d: Date) => d.toISOString().slice(0, 7);
export const firstOfMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
export const lastOfMonth = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
export const addMonths = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
export function parseMonthKey(v: string | null | undefined): Date | null {
  if (!v || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return null;
  return new Date(`${v}-01T00:00:00Z`);
}

/** Days as words: "1 day", "2.5 days", "½". */
export function daysWord(n: number) {
  return `${n % 1 ? n.toFixed(1) : n} ${n === 1 ? "day" : "days"}`;
}
export const dayNum = (n: number) => (n % 1 ? (n === 0.5 ? "½" : n.toFixed(1)) : String(n));
