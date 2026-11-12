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

/** An adjustment's name with the month it corrects: "Arrears for September 2026". */
export const correctionLabel = (a: { type: string; forMonth: Date | null }) => `${adjustmentLabel(a.type)}${a.forMonth ? ` for ${monthName(a.forMonth)}` : ""}`;

/**
 * Everyone the pre-send check must name for "no salary structure" (10 §5): the run's lines that
 * were left out for it, and staff on the payroll today with no structure who have no line yet
 * (added after the last calculation). Self-test A13, 2026-11-12: the check said 1 while 6 had none.
 */
export function staffWithoutStructure(lines: { staffId: string; flags: string[] }[], missingNow: string[]) {
  const inRun = new Set(lines.map((l) => l.staffId));
  const flagged = lines.filter((l) => l.flags.includes("No salary structure")).map((l) => l.staffId);
  const notYet = missingNow.filter((id) => !inRun.has(id));
  return { all: [...flagged, ...notYet.filter((id) => !flagged.includes(id))], notYetInRun: notYet };
}

/**
 * The note under the totals when saving an adjustment also brought in attendance and leave
 * (self-test A5): "Net pay also changed by ₹620 because attendance and leave up to 12-11-2026 were brought in."
 */
export function alsoChangedNote(otherChangePaise: bigint, upTo: string, rupees: (p: bigint) => string) {
  if (otherChangePaise === BigInt(0)) return null;
  const by = otherChangePaise < BigInt(0) ? -otherChangePaise : otherChangePaise;
  return `Net pay also ${otherChangePaise < BigInt(0) ? "went down" : "went up"} by ${rupees(by)} because attendance and leave up to ${upTo} were brought in.`;
}
