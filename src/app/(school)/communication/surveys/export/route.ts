import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn, type ExportFormat } from "@/lib/exports";
import { readListParams } from "@/lib/list";
import { formatDate } from "@/lib/format";
import { PermissionDeniedError } from "@/lib/permissions";
import { commOfficeAction, OfficeOnly } from "@/lib/communication/access";
import { COMM_FEATURES } from "@/lib/communication/features";
import { shownStatus, SURVEY_FILTERS, surveyWhere } from "@/lib/communication/surveys";
import { STATUS_LABEL } from "../status";

export const dynamic = "force-dynamic";

/** The Surveys list (P8), with the filters and dates on screen. */
export async function GET(req: Request) {
  let current;
  try {
    ({ current } = await commOfficeAction("export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError || e instanceof OfficeOnly) return new Response("You do not have permission to export surveys.", { status: 403 });
    throw e;
  }
  if (!current.features.has(COMM_FEATURES.surveys)) return new Response("Surveys are switched off for this school.", { status: 404 });
  const tz = current.school.timeZone;
  const url = new URL(req.url);
  const params = readListParams(Object.fromEntries(url.searchParams), SURVEY_FILTERS);
  const format = (["csv", "xlsx", "pdf"].includes(url.searchParams.get("format") ?? "") ? url.searchParams.get("format") : "xlsx") as ExportFormat;
  const data = await withSchool(current.ctx, async (tx) => {
    const rows = await tx.survey.findMany({ where: surveyWhere(current.ctx, params, tz), orderBy: { createdAt: "desc" }, take: 5000 });
    const answered = rows.length ? await tx.surveyInvite.groupBy({ by: ["surveyId"], where: { schoolId: current.ctx.schoolId, surveyId: { in: rows.map((r) => r.id) }, answeredAt: { not: null } }, _count: { _all: true } }) : [];
    const filters = [params.q && `search "${params.q}"`, ...Object.entries(params.filters).map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join(", ") || "All surveys";
    await logExport(tx, current.ctx, { title: "Surveys", format, filters, rows: rows.length });
    return { rows, filters, answered: new Map(answered.map((a) => [a.surveyId, a._count._all])) };
  });
  type Row = (typeof data.rows)[number];
  const columns: ExportColumn<Row>[] = [
    { label: "Number", value: (r) => r.number },
    { label: "Survey", value: (r) => r.title },
    { label: "Sent to", value: (r) => r.audienceLabel },
    { label: "Anonymous", value: (r) => (r.anonymous ? "Yes" : "No") },
    { label: "Sent", value: (r) => (r.sentAt ? formatDate(r.sentAt, tz) : "") },
    { label: "Closes", value: (r) => (r.closesOn ? formatDate(r.closesOn, "UTC") : "") },
    { label: "Invited", value: (r) => r.invitedCount },
    { label: "Answered", value: (r) => data.answered.get(r.id) ?? 0 },
    { label: "Status", value: (r) => STATUS_LABEL[shownStatus(r, tz)] },
  ];
  return exportResponse(await buildExport(format, columns, data.rows, { title: "Surveys", schoolName: current.school.name, filters: data.filters, exportedBy: current.user.displayName, timeZone: tz }));
}
