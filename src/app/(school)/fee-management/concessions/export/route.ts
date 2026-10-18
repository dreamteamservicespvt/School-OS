import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn, type ExportFormat } from "@/lib/exports";
import { formatDate, formatRupees } from "@/lib/format";
import { PermissionDeniedError } from "@/lib/permissions";
import { periodFromSearch } from "@/lib/periods";
import { periodSetup } from "@/lib/period-setup";
import { feePageAllowed, feeStudentFilter, feeViewer } from "@/lib/fees/access";
import { concessionRows, refundRows, type ConcessionRow, type RefundRow } from "@/lib/fees/concession-list";
import { modeLabel } from "@/lib/fees/words";

export const dynamic = "force-dynamic";

const C_WORDS: Record<string, string> = { WAITING: "Waiting", APPLIED: "Applied", REJECTED: "Rejected", TAKEN_OFF: "Taken off", APPROVED: "Approved, to pay", REFUNDED: "Refunded" };

/** Concessions, scholarships or refunds with the filters on screen (P8). */
export async function GET(req: Request) {
  let current;
  try {
    ({ current } = await requireAction("fee-management", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("You do not have permission to export concessions and refunds.", { status: 403 });
    throw e;
  }
  const url = new URL(req.url);
  const g = (k: string) => url.searchParams.get(k) ?? "";
  const format = (["csv", "xlsx", "pdf"].includes(g("format")) ? g("format") : "xlsx") as ExportFormat;
  const tz = current.school.timeZone;
  const range = periodFromSearch(Object.fromEntries(url.searchParams), await periodSetup(current));
  const tab = g("tab") === "refunds" ? "refunds" : g("tab") === "scholarships" ? "scholarships" : "concessions";
  const filter = { q: g("q").slice(0, 80) || null, status: g("st") || null, range, timeZone: tz, scholarship: tab === "scholarships" };
  const data = await withSchool(current.ctx, async (tx) => {
    const viewer = await feeViewer(tx, current.ctx, current);
    if (!feePageAllowed(viewer, "concessions")) return null;
    const words = [range ? `asked ${range.label}` : null, filter.q && `search "${filter.q}"`, filter.status && C_WORDS[filter.status]].filter(Boolean).join(", ") || "All";
    // A person limited to one campus exports that campus's students' records only.
    const only = await feeStudentFilter(tx, viewer);
    if (tab === "refunds") {
      const r = await refundRows(tx, { ...filter, only }, 10000);
      await logExport(tx, current.ctx, { title: "Refunds", format, filters: words, rows: r.rows.length });
      return { kind: "refunds" as const, rows: r.rows, words };
    }
    const c = await concessionRows(tx, { ...filter, only }, 10000);
    const title = tab === "scholarships" ? "Scholarships" : "Concessions";
    await logExport(tx, current.ctx, { title, format, filters: words, rows: c.rows.length });
    return { kind: "concessions" as const, title, rows: c.rows, words };
  });
  if (!data) return new Response("Your role does not see concessions and refunds.", { status: 403 });
  const meta = { schoolName: current.school.name, exportedBy: current.user.displayName, timeZone: tz, filters: data.words };
  if (data.kind === "refunds") {
    const cols: ExportColumn<RefundRow>[] = [
      { label: "Asked on", value: (r) => formatDate(r.createdAt, tz) },
      { label: "Student", value: (r) => r.name },
      { label: "Class", value: (r) => r.classLabel },
      { label: "Receipt", value: (r) => r.receipt },
      { label: "Paid", value: (r) => formatRupees(r.paidPaise) },
      { label: "Refund", value: (r) => formatRupees(r.amountPaise) },
      { label: "Mode", value: (r) => modeLabel(r.mode) },
      { label: "Reference", value: (r) => r.reference ?? "" },
      { label: "Refunded on", value: (r) => (r.refundedOn ? formatDate(r.refundedOn) : "") },
      { label: "Reason", value: (r) => r.reason },
      { label: "Asked by", value: (r) => r.askedBy },
      { label: "Status", value: (r) => C_WORDS[r.status] ?? r.status },
    ];
    return exportResponse(await buildExport(format, cols, data.rows, { ...meta, title: "Refunds" }));
  }
  const cols: ExportColumn<ConcessionRow>[] = [
    { label: "Asked on", value: (r) => formatDate(r.createdAt, tz) },
    { label: "Student", value: (r) => r.name },
    { label: "Admission no.", value: (r) => r.admissionNo },
    { label: "Class", value: (r) => r.classLabel },
    { label: "Type", value: (r) => r.scholarshipType ?? r.typeLabel },
    { label: "Amount or %", value: (r) => r.value },
    { label: "Amount", value: (r) => formatRupees(r.amountPaise) },
    { label: "Fee heads", value: (r) => r.heads },
    { label: "Reason", value: (r) => r.reason },
    { label: "Asked by", value: (r) => r.askedBy },
    { label: "Approved by", value: (r) => r.decidedBy ?? "" },
    { label: "Status", value: (r) => C_WORDS[r.status] ?? r.status },
  ];
  return exportResponse(await buildExport(format, cols, data.rows, { ...meta, title: data.title }));
}
