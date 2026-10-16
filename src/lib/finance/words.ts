// School words for Finance Management screens. Safe to use in the browser.

export const FINANCE_FEATURES = [
  { key: "finance-budget", label: "Budget", about: "Yearly budgets by head and department, with budget against actual and alerts at 80% and 100%." },
  { key: "finance-accounts", label: "Accounts", about: "Journal entries, the general ledger, trial balance, payables and receivables, for schools keeping full accounts." },
  { key: "finance-cost-centres", label: "Cost centres", about: "Tag expenses and budgets to departments or units." },
  { key: "finance-vendor-bills", label: "Vendor bills", about: "Record a vendor's bill with bill number and due date, and pay it later in parts." },
  { key: "finance-brought-in", label: "Import past expenses", about: "For a school starting part way through the year: earlier expenses come in read-only as Brought in and never reach the Day Book." },
  { key: "finance-tally", label: "Tally export", about: "Map heads to Tally ledgers and download vouchers for Tally." },
] as const;
export type FinanceFeature = (typeof FINANCE_FEATURES)[number]["key"];

export const INCOME_MODES = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CHEQUE", label: "Cheque" },
] as const;
export const EXPENSE_MODES = [...INCOME_MODES, { value: "CARD", label: "Card" }] as const;
export const financeModeLabel = (m: string) =>
  ({ CASH: "Cash", UPI: "UPI", BANK_TRANSFER: "Bank transfer", CHEQUE: "Cheque", CARD: "Card", NET_BANKING: "Net banking", GATEWAY: "Online (gateway)", TRANSFER: "Transfer", OPENING: "Opening balance" } as Record<string, string>)[m] ?? m;

export const EXPENSE_STATUS_WORDS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" | "brand" }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  WAITING: { label: "Waiting for approval", tone: "warning" },
  APPROVED: { label: "Approved", tone: "brand" },
  PAID: { label: "Paid", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};
export const INCOME_STATUS_WORDS: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  POSTED: { label: "Posted", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

/** Day Book sections (07 §2), in the order shown. */
export const DAY_BOOK_SECTIONS = [
  { key: "fees-full", label: "Fee payments (full)", empty: "No full fee payments on this date." },
  { key: "fees-partial", label: "Partial payments", empty: "No partial payments on this date." },
  { key: "other-fees", label: "Other fee types", empty: "No other fee types on this date." },
  { key: "other-income", label: "Other income", empty: "No other income on this date." },
  { key: "expense", label: "Expenses", empty: "No expenses paid on this date." },
  { key: "salary", label: "Salary", empty: "No salary paid on this date." },
  { key: "refunds", label: "Refunds and reversals", empty: "No refunds or reversals on this date." },
] as const;

export const sectionLabel = (key: string) =>
  ({ "fees-full": "Fee payment", "fees-partial": "Partial payment", "other-fees": "Other fee", "other-income": "Other income", expense: "Expense", salary: "Salary", "salary-advance": "Salary advance", refund: "Refund", reversal: "Reversal", opening: "Opening balance", transfer: "Money moved" } as Record<string, string>)[key] ?? key;
