import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn, type ExportFormat } from "@/lib/exports";
import { formatDate, formatRupees } from "@/lib/format";
import { PermissionDeniedError } from "@/lib/permissions";
import { periodFromSearch } from "@/lib/periods";
import { periodSetup } from "@/lib/period-setup";
import { expenseRows, NO_FILTER, type ExpenseRow } from "@/lib/finance/expense-list";
import { EXPENSE_STATUS_WORDS, financeModeLabel } from "@/lib/finance/words";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

/** Expenses (or vendor bills) with the filters on screen (P8). */
export async function GET(req: Request) {
  let current;
  try {
    ({ current } = await requireAction("finance-management", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("You do not have permission to export expenses.", { status: 403 });
    throw e;
  }
  const url = new URL(req.url);
  const g = (k: string) => url.searchParams.get(k) ?? "";
  const format = (["csv", "xlsx", "pdf"].includes(g("format")) ? g("format") : "xlsx") as ExportFormat;
  const tab = g("tab");
  const range = tab === "waiting" || tab === "bills" ? null : periodFromSearch(Object.fromEntries(url.searchParams), { ...(await periodSetup(current)), fallback: "finyear" });
  const above = ["2000", "10000", "50000", "100000"].includes(g("above")) ? g("above") : "";
  const filter = tab === "waiting" ? { ...NO_FILTER, status: "WAITING" }
    : tab === "bills" ? { ...NO_FILTER, vendorBills: true }
    : { q: g("q").trim().slice(0, 80) || null, range, status: g("status") || null, headId: UUID.test(g("head")) ? g("head") : null, costCentreId: UUID.test(g("dept")) ? g("dept") : null, abovePaise: above ? BigInt(above) * BigInt(100) : null };
  const title = tab === "bills" ? "Vendor bills" : tab === "waiting" ? "Expenses waiting for approval" : "Expenses";
  const data = await withSchool(current.ctx, async (tx) => {
    const list = await expenseRows(tx, filter, 20000);
    const words = [
      range ? `${formatDate(new Date(`${range.from}T00:00:00Z`))} to ${formatDate(new Date(`${range.to}T00:00:00Z`))}` : "Any date",
      "q" in filter && filter.q && `search "${filter.q}"`, filter.status && EXPENSE_STATUS_WORDS[filter.status]?.label,
      filter.headId && "one expense head", filter.costCentreId && "one department", above && `above ₹${Number(above).toLocaleString("en-IN")}`,
    ].filter(Boolean).join(", ");
    await logExport(tx, current.ctx, { title, format, filters: words, rows: list.rows.length });
    return { list, words };
  });
  const columns: ExportColumn<ExpenseRow>[] = [
    { label: "Date", value: (r) => formatDate(r.date) },
    { label: "Number", value: (r) => r.number },
    { label: "What was it for", value: (r) => r.what },
    { label: "Expense head", value: (r) => r.headName },
    { label: "Department", value: (r) => r.costCentreName },
    { label: "Vendor", value: (r) => r.vendorName },
    { label: "Bill number", value: (r) => r.billNo ?? "" },
    { label: "Due date", value: (r) => (r.billDueDate ? formatDate(r.billDueDate) : "") },
    { label: "Amount", value: (r) => formatRupees(r.amountPaise) },
    { label: "Paid", value: (r) => formatRupees(r.paidPaise) },
    { label: "Mode", value: (r) => (r.lastPaid ? financeModeLabel(r.lastPaid.mode) : "") },
    { label: "Reference", value: (r) => r.lastPaid?.reference ?? "" },
    { label: "Date paid", value: (r) => (r.lastPaid ? formatDate(r.lastPaid.date) : "") },
    { label: "Bill attached", value: (r) => (r.hasBill ? "Yes" : "No") },
    { label: "Status", value: (r) => (r.broughtIn ? "Brought in" : EXPENSE_STATUS_WORDS[r.status]?.label ?? r.status) },
    { label: "Requested by", value: (r) => r.requestedBy },
    { label: "Approved by", value: (r) => r.approvedBy },
    { label: "Cancel reason", value: (r) => r.cancelReason ?? "" },
  ];
  return exportResponse(await buildExport(format, columns, data.list.rows, { title, schoolName: current.school.name, exportedBy: current.user.displayName, timeZone: current.school.timeZone, filters: data.words }));
}
