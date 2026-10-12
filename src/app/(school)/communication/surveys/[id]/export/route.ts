import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn, type ExportFormat } from "@/lib/exports";
import { formatDate } from "@/lib/format";
import { PermissionDeniedError } from "@/lib/permissions";
import { commOfficeAction, OfficeOnly } from "@/lib/communication/access";
import { COMM_FEATURES } from "@/lib/communication/features";
import { surveyResults, type Answers } from "@/lib/communication/surveys";

export const dynamic = "force-dynamic";

/** One survey's answers: one row per answer sheet, one column per question. Anonymous surveys have no names. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let current;
  try {
    ({ current } = await commOfficeAction("export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError || e instanceof OfficeOnly) return new Response("You do not have permission to export survey answers.", { status: 403 });
    throw e;
  }
  const { id } = await params;
  if (!current.features.has(COMM_FEATURES.surveys) || !/^[0-9a-f-]{36}$/.test(id)) return new Response("Not found.", { status: 404 });
  const tz = current.school.timeZone;
  const url = new URL(req.url);
  const format = (["csv", "xlsx", "pdf"].includes(url.searchParams.get("format") ?? "") ? url.searchParams.get("format") : "xlsx") as ExportFormat;
  const data = await withSchool(current.ctx, async (tx) => {
    const survey = await tx.survey.findFirst({ where: { id, schoolId: current.ctx.schoolId, archivedAt: null } });
    if (!survey) return null;
    const r = await surveyResults(tx, current.ctx, id);
    await logExport(tx, current.ctx, { title: `Survey answers ${survey.number}`, format, filters: survey.title, rows: r.responses.length });
    return { survey, ...r };
  });
  if (!data) return new Response("Not found.", { status: 404 });
  type Row = (typeof data.responses)[number];
  const columns: ExportColumn<Row>[] = [
    { label: "Answered on", value: (r) => formatDate(r.submittedAt, data.survey.anonymous ? "UTC" : tz) },
    ...(data.survey.anonymous ? [] : [{ label: "Name", value: (r: Row) => (r.personId ? data.names.get(r.personId) ?? "" : "") }]),
    ...data.questions.map((q, i) => ({ label: `${i + 1}. ${q.text}`, value: (r: Row) => (r.answers as Answers)[q.id] ?? "" })),
  ];
  return exportResponse(await buildExport(format, columns, data.responses, { title: `Survey answers ${data.survey.number}`, schoolName: current.school.name, filters: data.survey.title, exportedBy: current.user.displayName, timeZone: tz }));
}
