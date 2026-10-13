import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn, type ExportFormat } from "@/lib/exports";
import { formatDate, formatRupees } from "@/lib/format";
import { PermissionDeniedError } from "@/lib/permissions";
import { periodSetup } from "@/lib/period-setup";
import { periodFromSearch } from "@/lib/periods";
import { salaryLevel } from "@/lib/salary/access";
import { balanceOf } from "@/lib/salary/advances";
import { ADVANCE_STATUS_LABEL, monthName, payModeLabel } from "@/lib/salary/words";

export const dynamic = "force-dynamic";
const OPEN = ["WAITING", "APPROVED", "ACTIVE"];

/** Advances and loans with the filters on screen (P8): status, search and the date given. Full Salary Management only. */
export async function GET(req: Request) {
  let current;
  try {
    ({ current } = await requireAction("salary-management", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("You do not have permission to export salary.", { status: 403 });
    throw e;
  }
  if (salaryLevel(current.permissions) !== "full") return new Response("Only the Accountant, the Principal or the School Admin can export advances and loans.", { status: 403 });
  const url = new URL(req.url);
  const g = (k: string) => url.searchParams.get(k) ?? "";
  const format = (["csv", "xlsx", "pdf"].includes(g("format")) ? g("format") : "xlsx") as ExportFormat;
  const show = ["closed", "all"].includes(g("show")) ? g("show") : "active";
  const q = g("q").trim().toLowerCase().slice(0, 80);
  const dates = await periodSetup(current);
  const range = periodFromSearch(Object.fromEntries(url.searchParams), { ...dates, fallback: null, prefix: "" });
  const from = range ? new Date(`${range.from}T00:00:00Z`) : null;
  const to = range ? new Date(`${range.to}T23:59:59.999Z`) : null;
  const data = await withSchool(current.ctx, async (tx) => {
    const all = await tx.salaryAdvance.findMany({ orderBy: { createdAt: "desc" } });
    const staff = await tx.staff.findMany({ where: { id: { in: all.map((a) => a.staffId) } }, select: { id: true, fullName: true, staffCode: true } });
    const by = new Map(staff.map((s) => [s.id, s]));
    const rows = all.map((a) => ({ a, s: by.get(a.staffId) }))
      .filter(({ a }) => { const d = a.paidOn ?? a.createdAt; return !from || !to || (d >= from && d <= to); })
      .filter(({ a }) => show === "all" || (show === "active" ? OPEN.includes(a.status) : !OPEN.includes(a.status)))
      .filter(({ a, s }) => !q || [s?.fullName, s?.staffCode, a.number, a.reason].some((v) => v?.toLowerCase().includes(q)));
    const words = [{ active: "Active", closed: "Closed", all: "All" }[show], range?.label ? `given ${range.label}` : null, q && `search "${q}"`].filter(Boolean).join(", ");
    await logExport(tx, current.ctx, { title: "Advances and loans", format, filters: words, rows: rows.length });
    return { rows, words };
  });
  type R = (typeof data.rows)[number];
  const columns: ExportColumn<R>[] = [
    { label: "Number", value: (x) => x.a.number },
    { label: "Staff ID", value: (x) => x.s?.staffCode ?? "" },
    { label: "Staff member", value: (x) => x.s?.fullName ?? "" },
    { label: "Type", value: (x) => (x.a.type === "LOAN" ? "Loan" : "Advance") },
    { label: "Amount", value: (x) => formatRupees(x.a.amountPaise) },
    { label: "Each month", value: (x) => formatRupees(x.a.installmentPaise) },
    { label: "Recovery from", value: (x) => monthName(x.a.startMonth) },
    { label: "Paid on", value: (x) => (x.a.paidOn ? formatDate(x.a.paidOn) : "") },
    { label: "Paid by", value: (x) => payModeLabel(x.a.payMode) },
    { label: "Recovered", value: (x) => formatRupees(x.a.recoveredPaise) },
    { label: "Balance", value: (x) => formatRupees(balanceOf(x.a)) },
    { label: "Status", value: (x) => (x.a.status === "ACTIVE" && x.a.paused ? "Paused" : ADVANCE_STATUS_LABEL[x.a.status]) },
    { label: "Reason", value: (x) => x.a.reason },
  ];
  return exportResponse(await buildExport(format, columns, data.rows, { title: "Advances and loans", schoolName: current.school.name, exportedBy: current.user.displayName, timeZone: current.school.timeZone, filters: data.words }));
}
