import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn, type ExportFormat } from "@/lib/exports";
import { formatDate, formatRupees } from "@/lib/format";
import { PermissionDeniedError } from "@/lib/permissions";
import { periodFromSearch } from "@/lib/periods";
import { periodSetup } from "@/lib/period-setup";
import { incomeRows, type IncomeRow } from "@/lib/finance/income-list";
import { financeModeLabel, INCOME_STATUS_WORDS } from "@/lib/finance/words";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

/** The Income list with the filters on screen (P8). */
export async function GET(req: Request) {
  let current;
  try {
    ({ current } = await requireAction("finance-management", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("You do not have permission to export income.", { status: 403 });
    throw e;
  }
  const url = new URL(req.url);
  const g = (k: string) => url.searchParams.get(k) ?? "";
  const format = (["csv", "xlsx", "pdf"].includes(g("format")) ? g("format") : "xlsx") as ExportFormat;
  const range = periodFromSearch(Object.fromEntries(url.searchParams), await periodSetup(current));
  const status = ["DRAFT", "POSTED", "CANCELLED"].includes(g("status")) ? g("status") : null;
  const filter = { q: g("q").trim().slice(0, 80) || null, range, status, headId: UUID.test(g("head")) ? g("head") : null, mode: g("mode") || null };
  const data = await withSchool(current.ctx, async (tx) => {
    const list = await incomeRows(tx, filter, 20000);
    const words = [
      range ? `${formatDate(new Date(`${range.from}T00:00:00Z`))} to ${formatDate(new Date(`${range.to}T00:00:00Z`))}` : "Any date",
      filter.q && `search "${filter.q}"`, status && INCOME_STATUS_WORDS[status]?.label, filter.headId && "one income head", filter.mode && financeModeLabel(filter.mode),
    ].filter(Boolean).join(", ");
    await logExport(tx, current.ctx, { title: "Income", format, filters: words, rows: list.rows.length });
    return { list, words };
  });
  const columns: ExportColumn<IncomeRow>[] = [
    { label: "Date", value: (r) => formatDate(r.date) },
    { label: "Number", value: (r) => r.receiptNo ?? "Draft" },
    { label: "Income head", value: (r) => r.headName },
    { label: "Received from", value: (r) => r.receivedFrom },
    { label: "Amount", value: (r) => formatRupees(r.amountPaise) },
    { label: "Mode", value: (r) => financeModeLabel(r.mode) },
    { label: "Reference", value: (r) => r.reference ?? "" },
    { label: "Into", value: (r) => r.accountName },
    { label: "Status", value: (r) => INCOME_STATUS_WORDS[r.status]?.label ?? r.status },
    { label: "Recorded by", value: (r) => r.recordedBy },
    { label: "Cancel reason", value: (r) => r.cancelReason ?? "" },
    { label: "Note", value: (r) => r.note ?? "" },
  ];
  return exportResponse(await buildExport(format, columns, data.list.rows, { title: "Income", schoolName: current.school.name, exportedBy: current.user.displayName, timeZone: current.school.timeZone, filters: data.words }));
}
