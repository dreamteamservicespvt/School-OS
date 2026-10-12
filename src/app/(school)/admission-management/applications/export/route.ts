// Applications export (P8): Excel, CSV or PDF with the filters on screen.
// Restricted fields (Aadhaar) are never exported.
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { readListParams } from "@/lib/list";
import { buildExport, exportResponse, logExport } from "@/lib/exports";
import { formatDate } from "@/lib/format";
import { viewerFor } from "@/lib/admission/access";
import { APPLICATION_FILTERS, applicationOrder, applicationWhere, describeApplicationFilters, exportFormatOf } from "@/lib/admission/list";
import { classRules, loadSettings, openYears } from "@/lib/admission/settings";
import { periodFromSearch } from "@/lib/periods";
import { stageLabel } from "@/lib/admission/applications";
import { progressOf } from "@/lib/admission/documents";
import { feeStatus } from "@/lib/admission/fee";
import { names } from "@/lib/admission/choices";

export async function GET(req: Request) {
  const { current } = await requireAction("admission-management", "export");
  const url = new URL(req.url);
  const format = exportFormatOf(url);
  const params = readListParams(Object.fromEntries(url.searchParams.entries()), APPLICATION_FILTERS);
  const tz = current.school.timeZone;
  const range = periodFromSearch(Object.fromEntries(url.searchParams.entries()), { timeZone: tz });
  return withSchool(current.ctx, async (tx) => {
    const v = await viewerFor(tx, current.ctx, current);
    if (v.see !== "all") return new Response("Only the admission team can export applications.", { status: 403 });
    const s = await loadSettings(tx, current.ctx);
    const yearIds = (await openYears(tx)).map((y) => y.id);
    const rows = await tx.application.findMany({
      where: applicationWhere(params, { yearId: yearIds.length ? yearIds : ["00000000-0000-0000-0000-000000000000"], range, timeZone: tz }), orderBy: applicationOrder(params), take: 5000,
      include: { documents: { select: { docType: true, status: true } }, payments: { select: { status: true, amountPaise: true, cancelledAt: true } } },
    });
    const [n, rules] = await Promise.all([names(tx), classRules(tx)]);
    const years = new Map((await tx.academicYear.findMany({ select: { id: true, name: true } })).map((y) => [y.id, y.name]));
    const filters = describeApplicationFilters(params, { ...n, years }, range);
    type Row = (typeof rows)[number];
    const file = await buildExport<Row>(format, [
      { label: "Application no.", value: (r) => r.applicationNo },
      { label: "Child's name", value: (r) => r.fullName },
      { label: "Class applied for", value: (r) => n.classes.get(r.classId) ?? "" },
      { label: "Date of birth", value: (r) => formatDate(r.dateOfBirth, "UTC") },
      { label: "Parent", value: (r) => r.fatherName ?? r.motherName ?? r.guardianName ?? "" },
      { label: "Parent's phone", value: (r) => r.phone },
      { label: "Stage", value: (r) => stageLabel(r.stage) },
      { label: "Documents", value: (r) => { const p = progressOf(r.documents, rules.get(r.classId)?.documents ?? []); return `${p.requiredVerified} of ${p.required} verified`; } },
      ...(s.applicationFeeOn ? [{ label: "Fee paid", value: (r: Row) => feeStatus(r, r.payments).label }] : []),
      { label: "Filled", value: (r) => (r.channel === "online" ? "Online" : "At the counter") },
      { label: "Submitted", value: (r) => formatDate(r.createdAt, tz) },
    ], rows, { title: "Applications", schoolName: current.school.name, filters, exportedBy: current.user.displayName, timeZone: tz });
    await logExport(tx, current.ctx, { title: "Applications", format, filters, rows: rows.length });
    return exportResponse(file);
  }, { timeout: 60_000 });
}
