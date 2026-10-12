import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn, type ExportFormat } from "@/lib/exports";
import { formatDate, formatRupees, formatTime } from "@/lib/format";
import { PermissionDeniedError } from "@/lib/permissions";
import { periodFromSearch } from "@/lib/periods";
import { periodSetup } from "@/lib/period-setup";
import { todayIn } from "@/lib/staff/dates";
import { dayBookView, type DayRow } from "@/lib/finance/daybook-view";
import { financeModeLabel } from "@/lib/finance/words";
import { hiddenPayHeads } from "@/lib/finance/access";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;
const SECTION: Record<string, string> = {
  "fees-full": "Fee payments (full)", "fees-partial": "Partial payments", "other-fees": "Other fee types", daycare: "Daycare payments",
  "other-income": "Other income", expense: "Expenses", salary: "Salary", refunds: "Refunds and reversals",
};

/** The Day Book with the filters on screen (P8), with the totals on the last lines. */
export async function GET(req: Request) {
  let current;
  try {
    ({ current } = await requireAction("finance-management", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("You do not have permission to export the Day Book.", { status: 403 });
    throw e;
  }
  const url = new URL(req.url);
  const g = (k: string) => url.searchParams.get(k) ?? "";
  const format = (["csv", "xlsx", "pdf"].includes(g("format")) ? g("format") : "xlsx") as ExportFormat;
  const tz = current.school.timeZone;
  const today = todayIn(tz);
  const range = periodFromSearch(Object.fromEntries(url.searchParams), { ...(await periodSetup(current)), fallback: "today" });
  const from = range ? new Date(`${range.from}T00:00:00Z`) : today;
  const to = range ? new Date(`${range.to}T00:00:00Z`) : today;
  const classId = UUID.test(g("class")) ? g("class") : null;
  const acct = UUID.test(g("acct")) ? g("acct") : null;
  const waiting = g("waiting") === "1";
  const data = await withSchool(current.ctx, async (tx) => {
    const view = await dayBookView(tx, { from, to, classId, depositAccountId: acct, waiting, hidePay: await hiddenPayHeads(tx, current.permissions) });
    const words = [from.getTime() === to.getTime() ? formatDate(from) : `${formatDate(from)} to ${formatDate(to)}`, classId && "one class", acct && "one bank account", waiting && "with waiting entries"].filter(Boolean).join(", ");
    await logExport(tx, current.ctx, { title: "Day Book", format, filters: words, rows: view.rows.length });
    return { view, words };
  });
  const v = data.view;
  type Line = DayRow | { total: true; label: string; amount: bigint };
  const lines: Line[] = [
    ...v.rows,
    { total: true, label: "Total income", amount: v.totals.income },
    { total: true, label: "Total expense", amount: v.totals.expense },
    { total: true, label: "Net balance", amount: v.totals.net },
  ];
  const isTotal = (r: Line): r is { total: true; label: string; amount: bigint } => "label" in r;
  const columns: ExportColumn<Line>[] = [
    { label: "Section", value: (r) => (isTotal(r) ? r.label : SECTION[r.section] ?? r.section) },
    { label: "Date", value: (r) => (isTotal(r) ? "" : formatDate(r.date)) },
    { label: "Time", value: (r) => (isTotal(r) ? "" : formatTime(r.at, tz)) },
    { label: "Student, payer or vendor", value: (r) => (isTotal(r) ? "" : r.who) },
    { label: "Number", value: (r) => (isTotal(r) ? "" : r.number ?? "") },
    { label: "Class", value: (r) => (isTotal(r) ? "" : r.classLabel) },
    { label: "Fee type or head", value: (r) => (isTotal(r) ? "" : r.head) },
    { label: "Amount", value: (r) => (isTotal(r) ? "" : formatRupees(r.amount)) },
    { label: "Penalty", value: (r) => (isTotal(r) ? "" : formatRupees(r.penalty)) },
    { label: "Total", value: (r) => (isTotal(r) ? formatRupees(r.amount) : `${r.total < BigInt(0) ? "−" : ""}${formatRupees(r.total < BigInt(0) ? -r.total : r.total)}`) },
    { label: "Mode", value: (r) => (isTotal(r) ? "" : financeModeLabel(r.mode)) },
    { label: "Reference", value: (r) => (isTotal(r) ? "" : r.reference ?? "") },
    { label: "Account", value: (r) => (isTotal(r) ? "" : r.depositAccount ?? r.account ?? "") },
    { label: "Notes", value: (r) => (isTotal(r) ? "" : r.waiting ? "Waiting for verification (not counted)" : r.cancelled ? "Cancelled" : r.note ?? "") },
  ];
  return exportResponse(await buildExport(format, columns, lines, { title: "Day Book", schoolName: current.school.name, exportedBy: current.user.displayName, timeZone: tz, filters: data.words }));
}
