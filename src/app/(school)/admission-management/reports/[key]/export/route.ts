// One Admission Report as Excel, CSV or PDF, with the filters on screen (P8).
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport } from "@/lib/exports";
import { viewerFor } from "@/lib/admission/access";
import { exportFormatOf } from "@/lib/admission/list";
import { admissionYear, loadSettings } from "@/lib/admission/settings";
import { REPORTS, report, type ReportKey } from "@/lib/admission/reports";
import { names } from "@/lib/admission/choices";
import { describeFilters, readFilters } from "../../filters";

type Row = Record<string, string | number>;

export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const meta = REPORTS.find((r) => r.key === key);
  if (!meta) return new Response("This report was not found.", { status: 404 });
  const { current } = await requireAction("admission-management", "export");
  const url = new URL(req.url);
  const format = exportFormatOf(url);
  return withSchool(current.ctx, async (tx) => {
    const v = await viewerFor(tx, current.ctx, current);
    if (v.see !== "all") return new Response("Only the admission team can export admission reports.", { status: 403 });
    const s = await loadSettings(tx, current.ctx);
    const year = await admissionYear(tx, current.ctx, s);
    const f = readFilters(Object.fromEntries(url.searchParams.entries()), s, year?.id ?? null);
    if (!f) return new Response("No academic year is set up yet.", { status: 400 });
    const n = await names(tx);
    const r = await report(tx, s, v, key as ReportKey, f, n);
    const years = new Map((await tx.academicYear.findMany({ select: { id: true, name: true } })).map((y) => [y.id, y.name]));
    const filters = describeFilters(f, { ...n, years, sources: new Map(s.sourceList.map((x) => [x.key, x.label])) });
    const file = await buildExport<Row>(format, r.columns.map((c) => ({ label: c.label, value: (row: Row) => row[c.key] })), r.rows, { title: meta.title, schoolName: current.school.name, filters, exportedBy: current.user.displayName, timeZone: current.school.timeZone });
    await logExport(tx, current.ctx, { title: `Admission report: ${meta.title}`, format, filters, rows: r.rows.length });
    return exportResponse(file);
  }, { timeout: 60_000 });
}
