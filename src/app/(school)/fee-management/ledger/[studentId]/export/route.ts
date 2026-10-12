import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn, type ExportFormat } from "@/lib/exports";
import { formatDate, formatRupees } from "@/lib/format";
import { PermissionDeniedError } from "@/lib/permissions";
import { periodFromSearch } from "@/lib/periods";
import { periodSetup } from "@/lib/period-setup";
import { todayIn } from "@/lib/staff/dates";
import { admissionOnly, canSeeStudent, feeViewer } from "@/lib/fees/access";
import { studentLedger, type LedgerEntry } from "@/lib/fees/ledger";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = {
  opening: "Opening balance", charge: "Fee raised", concession: "Concession", receipt: "Receipt", reversal: "Reversal", late: "Late fee", adjust: "Adjustment", refund: "Refund",
};

/** The ledger statement of one student, with the dates on screen (P8). Logged as an export. */
export async function GET(req: Request, { params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  let current;
  try {
    ({ current } = await requireAction("fee-management", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("You do not have permission to export fee ledgers.", { status: 403 });
    throw e;
  }
  if (!/^[0-9a-f-]{36}$/i.test(studentId)) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const f = url.searchParams.get("format") ?? "";
  const format = (["csv", "xlsx", "pdf"].includes(f) ? f : "xlsx") as ExportFormat;
  const tz = current.school.timeZone;
  const today = todayIn(tz);
  const range = periodFromSearch(Object.fromEntries(url.searchParams), await periodSetup(current));
  const data = await withSchool(current.ctx, async (tx) => {
    const viewer = await feeViewer(tx, current.ctx, current);
    if (admissionOnly(viewer) || !(await canSeeStudent(tx, viewer, studentId))) return null;
    const student = await tx.student.findFirst({ where: { id: studentId }, select: { fullName: true, admissionNo: true } });
    if (!student) return null;
    const L = await studentLedger(tx, studentId, today, tz);
    const from = range ? new Date(`${range.from}T00:00:00Z`) : null;
    const to = range ? new Date(`${range.to}T00:00:00Z`) : null;
    const rows = L.entries.filter((e) => !from || !to || (e.date >= from && e.date <= to));
    const filters = `${student.fullName} (${student.admissionNo})${range ? `, ${formatDate(from!)} to ${formatDate(to!)}` : ""}`;
    await logExport(tx, current.ctx, { title: "Fee ledger statement", format, filters, rows: rows.length });
    return { rows, filters, name: student.fullName };
  });
  if (!data) return new Response("Not found", { status: 404 });
  const columns: ExportColumn<LedgerEntry>[] = [
    { label: "Date", value: (e) => formatDate(e.date) },
    { label: "Entry", value: (e) => e.title },
    { label: "Kind", value: (e) => (e.cancelled ? "Cancelled" : e.waiting ? "Waiting for verification" : KIND[e.kind] ?? e.kind) },
    { label: "Details", value: (e) => (e.cancelled ? `${e.cancelled.reason} (cancelled ${formatDate(e.cancelled.when, tz)})` : e.sub) },
    { label: "Reference", value: (e) => e.ref ?? "" },
    { label: "Charged", value: (e) => (e.debit > BigInt(0) ? formatRupees(e.debit) : "") },
    { label: "Paid or reduced", value: (e) => (e.credit > BigInt(0) ? formatRupees(e.credit) : "") },
    { label: "Balance", value: (e) => formatRupees(e.balance) },
  ];
  return exportResponse(await buildExport(format, columns, data.rows, { title: `Fee ledger: ${data.name}`, schoolName: current.school.name, filters: data.filters, exportedBy: current.user.displayName, timeZone: tz }));
}
