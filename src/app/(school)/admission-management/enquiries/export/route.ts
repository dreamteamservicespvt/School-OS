// Enquiries export (P8): Excel, CSV or PDF with the filters on screen. People
// with "own" reach export only their own enquiries.
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { readListParams } from "@/lib/list";
import { buildExport, exportResponse, logExport } from "@/lib/exports";
import { formatDate, formatDateTime } from "@/lib/format";
import { viewerFor } from "@/lib/admission/access";
import { describeEnquiryFilters, ENQUIRY_FILTERS, enquiryOrder, enquiryWhere, exportFormatOf } from "@/lib/admission/list";
import { admissionYear, label, loadSettings } from "@/lib/admission/settings";
import { names } from "@/lib/admission/choices";

export async function GET(req: Request) {
  const { current } = await requireAction("admission-management", "export");
  const url = new URL(req.url);
  const format = exportFormatOf(url);
  const params = readListParams(Object.fromEntries(url.searchParams.entries()), ENQUIRY_FILTERS);
  const tz = current.school.timeZone;
  return withSchool(current.ctx, async (tx) => {
    const v = await viewerFor(tx, current.ctx, current);
    const s = await loadSettings(tx, current.ctx);
    const year = await admissionYear(tx, current.ctx, s);
    const where = enquiryWhere(params, v, { yearId: year?.id ?? "00000000-0000-0000-0000-000000000000", timeZone: tz });
    const rows = await tx.enquiry.findMany({ where, orderBy: enquiryOrder(params), take: 5000, include: { campaign: { select: { name: true } } } });
    const n = await names(tx);
    const years = new Map((await tx.academicYear.findMany({ select: { id: true, name: true } })).map((y) => [y.id, y.name]));
    const filters = describeEnquiryFilters(params, s, { ...n, years });
    type Row = (typeof rows)[number];
    const file = await buildExport<Row>(format, [
      { label: "Child's name", value: (r) => r.childName },
      { label: "Parent's name", value: (r) => r.parentName },
      { label: "Phone", value: (r) => r.phone },
      { label: "Email", value: (r) => r.email ?? "" },
      { label: "Class wanted", value: (r) => (r.classId ? n.classes.get(r.classId) ?? "" : "") },
      { label: "Source", value: (r) => label(s.sourceList, r.source) },
      { label: "First recorded source", value: (r) => label(s.sourceList, r.firstSource) },
      { label: "Status", value: (r) => label(s.statusList, r.status) },
      { label: "Owner", value: (r) => (r.ownerStaffId ? n.staff.get(r.ownerStaffId) ?? "" : "") },
      { label: "Next follow-up", value: (r) => (r.nextFollowUpAt ? formatDateTime(r.nextFollowUpAt, tz) : "") },
      { label: "Next action", value: (r) => r.nextAction ?? "" },
      { label: "Lost reason", value: (r) => (r.lostReason ? label(s.lossList, r.lostReason) : "") },
      ...(s.campaignsOn ? [{ label: "Campaign", value: (r: Row) => r.campaign?.name ?? "" }] : []),
      { label: "Created", value: (r) => formatDate(r.createdAt, tz) },
    ], rows, { title: "Enquiries", schoolName: current.school.name, filters, exportedBy: current.user.displayName, timeZone: tz });
    await logExport(tx, current.ctx, { title: "Enquiries", format, filters, rows: rows.length });
    return exportResponse(file);
  }, { timeout: 60_000 });
}
