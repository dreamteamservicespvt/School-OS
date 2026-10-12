import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn, type ExportFormat } from "@/lib/exports";
import { formatDate, formatRupees, formatTime } from "@/lib/format";
import { PermissionDeniedError } from "@/lib/permissions";
import { addDays, monthStart, todayIn } from "@/lib/staff/dates";
import { feeViewer } from "@/lib/fees/access";
import { recentPayments } from "@/lib/fees/dashboard";
import { modeWord } from "../../_components/bits";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { POSTED: "Posted", WAITING: "Waiting for verification", CANCELLED: "Cancelled", FAILED: "Failed" };

/** Recent payments (Fee Dashboard) with the filters on screen (P8). */
export async function GET(req: Request) {
  let current;
  try {
    ({ current } = await requireAction("fee-management", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("You do not have permission to export payments.", { status: 403 });
    throw e;
  }
  const url = new URL(req.url);
  const g = (k: string) => url.searchParams.get(k) ?? "";
  const format = (["csv", "xlsx", "pdf"].includes(g("format")) ? g("format") : "xlsx") as ExportFormat;
  const tz = current.school.timeZone;
  const today = todayIn(tz);
  const when = g("when") || "today";
  const from = when === "week" ? addDays(today, -6) : when === "month" ? monthStart(today) : today;
  const filter = {
    from, to: today,
    status: ["POSTED", "WAITING", "CANCELLED", "FAILED"].includes(g("status")) ? g("status") : null,
    mode: g("mode") || null,
    partial: g("kind") === "partial" ? true : g("kind") === "full" ? false : null,
    q: g("q").slice(0, 80) || null,
  };
  const data = await withSchool(current.ctx, async (tx) => {
    const viewer = await feeViewer(tx, current.ctx, current);
    const list = await recentPayments(tx, viewer, filter, 10000, 0);
    const filters = [`${formatDate(from)} to ${formatDate(today)}`, filter.status && `status: ${STATUS[filter.status]}`, filter.mode && `mode: ${modeWord(filter.mode)}`, filter.partial && "partial payments", filter.q && `search "${filter.q}"`].filter(Boolean).join(", ");
    await logExport(tx, current.ctx, { title: "Fee payments", format, filters, rows: list.rows.length });
    return { list, filters };
  });
  type Row = (typeof data.list.rows)[number];
  const columns: ExportColumn<Row>[] = [
    { label: "Date", value: (r) => formatDate(r.paymentDate) },
    { label: "Time", value: (r) => formatTime(r.paidAt, tz) },
    { label: "Student", value: (r) => r.student?.fullName ?? "" },
    { label: "Admission no.", value: (r) => r.student?.admissionNo ?? "" },
    { label: "Class", value: (r) => r.classLabel },
    { label: "Fee heads", value: (r) => r.heads },
    { label: "Amount", value: (r) => formatRupees(r.amountPaise) },
    { label: "Mode", value: (r) => modeWord(r.mode) },
    { label: "Receipt", value: (r) => r.receiptNo ?? "" },
    { label: "Reference", value: (r) => r.reference ?? r.chequeNo ?? r.gatewayPaymentId ?? "" },
    { label: "Part payment", value: (r) => (r.isPartial ? "Yes" : "No") },
    { label: "Status", value: (r) => STATUS[r.status] ?? r.status },
    { label: "Cancel reason", value: (r) => r.cancelReason ?? "" },
  ];
  return exportResponse(await buildExport(format, columns, data.list.rows, { title: "Fee payments", schoolName: current.school.name, filters: data.filters, exportedBy: current.user.displayName, timeZone: tz }));
}
