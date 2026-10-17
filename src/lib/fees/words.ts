// School words for Fee Management screens (00-global.md §9). Safe to use in
// the browser: no database here.

export const PAYMENT_MODES = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "CARD", label: "Card" },
  { value: "NET_BANKING", label: "Net banking" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "GATEWAY", label: "Online (gateway)" },
] as const;
export type PaymentModeValue = (typeof PAYMENT_MODES)[number]["value"];
export const modeLabel = (m: string) => PAYMENT_MODES.find((x) => x.value === m)?.label ?? m;
/** Modes that need a transaction or UTR number at the counter. */
export const NEEDS_REFERENCE: readonly string[] = ["UPI", "CARD", "NET_BANKING", "BANK_TRANSFER"];
/** Modes a person may choose at the counter (gateway payments come only from the gateway). */
export const COUNTER_MODES = PAYMENT_MODES.filter((m) => m.value !== "GATEWAY");

export const FREQUENCIES = [
  { value: "MONTHLY", label: "Monthly", per: 12 },
  { value: "QUARTERLY", label: "Quarterly", per: 4 },
  { value: "HALF_YEARLY", label: "Half-yearly", per: 2 },
  { value: "TERM", label: "Term", per: 2 },
  { value: "YEARLY", label: "Yearly", per: 1 },
  { value: "ONE_TIME", label: "One-time", per: 1 },
] as const;
export type FrequencyValue = (typeof FREQUENCIES)[number]["value"];
export const frequencyLabel = (f: string) => FREQUENCIES.find((x) => x.value === f)?.label ?? f;

export const HEAD_KINDS = [
  "tuition", "annual", "admission", "activity", "transport", "exam", "class", "monthly", "hostel", "lab", "sports", "library", "miscellaneous", "other",
] as const;
export const headKindLabel = (k: string) => k.charAt(0).toUpperCase() + k.slice(1);

export const PAYMENT_STATUS_WORDS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  POSTED: { label: "Posted", tone: "success" },
  WAITING: { label: "Waiting for verification", tone: "warning" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  FAILED: { label: "Failed", tone: "danger" },
};

export const DUE_STATUS_WORDS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  NOT_DUE: { label: "Not due", tone: "neutral" },
  DUE: { label: "Due", tone: "warning" },
  OVERDUE: { label: "Overdue", tone: "danger" },
  PAID: { label: "Paid", tone: "success" },
  REMOVED: { label: "Removed", tone: "neutral" },
};

export const CONCESSION_TYPES = [
  { value: "DISCOUNT", label: "Discount" },
  { value: "SCHOLARSHIP", label: "Scholarship" },
  { value: "SIBLING", label: "Sibling" },
  { value: "STAFF_CHILD", label: "Staff child" },
  { value: "BULK_DISCOUNT", label: "Bulk discount" },
  { value: "LATE_FEE_WAIVER", label: "Late fee waiver" },
] as const;
export const concessionTypeLabel = (t: string) => CONCESSION_TYPES.find((x) => x.value === t)?.label ?? t;
export const CONCESSION_STATUS_WORDS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  WAITING: { label: "Waiting", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  APPLIED: { label: "Applied", tone: "success" },
};
export const REFUND_STATUS_WORDS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  WAITING: { label: "Waiting", tone: "warning" },
  APPROVED: { label: "Approved, to pay", tone: "warning" },
  REJECTED: { label: "Rejected", tone: "danger" },
  REFUNDED: { label: "Refunded", tone: "success" },
};

export const CANCEL_REASONS = ["Wrong student", "Wrong amount", "Cheque bounced", "Duplicate", "Other"] as const;
export const REFUND_MODES = PAYMENT_MODES.filter((m) => ["CASH", "BANK_TRANSFER", "CHEQUE", "UPI"].includes(m.value));

/** Counter permissions (06 §6): shown in Fee Settings. None go to Office Staff or Class Teacher by default. */
export const COUNTER_PERMISSIONS = [
  { key: "give-discount", label: "Give discount at the counter" },
  { key: "waive-late-fee", label: "Waive late fee" },
  { key: "change-payment-date", label: "Change payment date" },
  { key: "manage-structure", label: "Manage class fee structure" },
  { key: "assign-fees", label: "Assign or unassign fees" },
  { key: "edit-student-fees", label: "Edit a student's fee structure" },
] as const;
export type CounterPermission = (typeof COUNTER_PERMISSIONS)[number]["key"];

export const DEFAULT_AGEING = [
  { from: 0, to: 30 },
  { from: 31, to: 60 },
  { from: 61, to: 90 },
  { from: 91, to: null },
] as const;
export type AgeingGroup = { from: number; to: number | null };
export const ageingLabel = (g: AgeingGroup) => (g.to === null ? `Over ${g.from - 1} days` : `${g.from} to ${g.to} days`);

/** Fee Management's optional parts, switched on school by school (School Feature records). */
export const FEE_FEATURES = [
  { key: "fee-advance", label: "Advance payments", about: "Parents may pay more than the current dues; the extra is held as advance and used for the next installments." },
  { key: "fee-verification", label: "Verify payments before posting", about: "Payments in the modes you choose arrive as Waiting for verification until approved." },
  { key: "fee-bank-accounts", label: "Fees into different bank accounts", about: "Each fee head goes to a chosen bank account; receipts and the Day Book show it." },
  { key: "fee-category-fees", label: "Category-wise fees", about: "Different fee amounts for different student categories." },
  { key: "fee-scholarships", label: "Scholarships", about: "Scholarship types, applied to a student's fees as a reduction." },
  { key: "fee-forecast", label: "Collection forecast", about: "A suggested collection for the next 3 months from installments due and past payments." },
  { key: "fee-promises", label: "Promise to pay", about: "On a call, note the date (and amount) a family promises to pay. Automatic reminders to them pause until then; a broken promise puts them back at the top of Defaulters." },
] as const;
export type FeeFeature = (typeof FEE_FEATURES)[number]["key"];

export const REMINDER_CHANNELS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "sms", label: "SMS" },
  { value: "email", label: "Email" },
] as const;

export const DEFAULT_REMINDER_TEMPLATE =
  "Dear parent, fees of {due_amount} for {student_name} ({class}) are due on {due_date}. Please pay at the school office or online: {link}. Thank you, {school_name}.";
export const TEMPLATE_VARIABLES = ["guardian_name", "student_name", "class", "due_amount", "due_date", "link", "school_name"] as const;

/** Whole days a payment status word for Days overdue. */
export function daysWord(n: number) {
  return n === 1 ? "1 day" : `${n} days`;
}

/** Percent in basis points as words: 1800 → "18%". */
export function percentWord(bp: number) {
  return `${(bp / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}%`;
}
