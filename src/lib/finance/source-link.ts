// Where a Day Book entry came from (07 §2 Day Book, "Open an entry: shows
// where it came from (the payment and receipt, the expense and bill, the
// payroll run) with a link"). One place for every kind of entry, so the Day
// Book sheet, the general ledger and the entry's own link all open the same
// record. Each link is offered only to people who may open that page.

export type SourceLinkEntry = {
  sourceType: string;
  sourceId: string;
  /** Cash or bank account the money is in (opening balances open that account's book). */
  accountId?: string | null;
  /** For an application fee: the application it was paid on. */
  applicationId?: string | null;
  /** For an expense payment or its cancelling: the expense it paid. */
  expenseId?: string | null;
  /** For a PF, ESI, Professional Tax or TDS payment or its cancelling: the salary month it was taken from. */
  runId?: string | null;
};

export type SourceLinkAccess = {
  /** Fee Management, Payments (receipts). */
  payments: boolean;
  /** Fee Management, Concessions & Refunds. */
  refunds: boolean;
  /** Admission Management, Applications. */
  applications: boolean;
  /** Salary Management, Generate Salary (a month's payroll). */
  salaryRuns: boolean;
  /** Salary Management, Advances & Loans. */
  advances: boolean;
};

const F = "/finance-management";

/** [button words, link] for the record behind a Day Book entry, or null when there is none this person may open. */
export function dayBookSourceLink(e: SourceLinkEntry, can: SourceLinkAccess): [string, string] | null {
  const t = e.sourceType;
  if (t === "payment" || t === "payment-cancel") return can.payments ? [t === "payment-cancel" ? "Open the cancelled receipt in Fees" : "Open the payment in Fees", `/fee-management/payments/${e.sourceId}`] : null;
  if (t === "refund") return can.refunds ? ["Open the refund in Fees", `/fee-management/concessions?tab=refunds&open=${e.sourceId}`] : null;
  if (t.startsWith("application-fee")) return can.applications && e.applicationId ? ["Open the application in Admissions", `/admission-management/applications/${e.applicationId}`] : null;
  if (t === "income" || t === "income-cancel") return ["Open in Income", `${F}/income?open=${e.sourceId}`];
  // The Day Book keeps the expense payment; the expense and its bill are one step up.
  if (t === "expense-payment" || t === "expense-cancel") return e.expenseId ? ["Open the expense and bill", `${F}/expenses?open=${e.expenseId}`] : null;
  if (t === "payroll" || t === "payroll-reversal") return can.salaryRuns ? ["Open the month's salary", `/salary-management/generate?run=${e.sourceId}`] : null;
  if (t === "statutory-payment" || t === "statutory-cancel") return can.salaryRuns && e.runId ? ["Open the month's salary", `/salary-management/generate?run=${e.runId}`] : null;
  if (t === "salary-advance") return can.advances ? ["Open the advance or loan", `/salary-management/advances?open=${e.sourceId}`] : null;
  if (t === "transfer" || t === "transfer-cancel") return ["Open the money move in Cash & Bank", `${F}/cash-bank?t=${e.sourceId}`];
  if (t === "opening-balance") return ["Open the book in Cash & Bank", e.accountId ? `${F}/cash-bank?book=${e.accountId}` : `${F}/cash-bank`];
  return null;
}
