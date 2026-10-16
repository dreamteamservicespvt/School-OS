// One report as Excel, CSV or PDF with the filters on screen (19 §5, P8):
// the school name, the filters, who exported it and when on top, and the
// export logged. Over 2,000 rows the file is made in the background and the
// person is notified with the link.
import { NextResponse } from "next/server";
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { exportResponse, logExport, type ExportFormat } from "@/lib/exports";
import { PermissionDeniedError } from "@/lib/permissions";
import { periodSetup } from "@/lib/period-setup";
import { todayFor } from "@/lib/periods";
import { reportAccess, BASE } from "@/lib/reports/access";
import { closedWords, entryAllowed, findEntry } from "@/lib/reports/catalogue";
import { filterParams, readFilters } from "@/lib/reports/filters";
import { BACKGROUND_ROWS, optionsFor, prepareReport, ReportProblem, reportFile, runEntry, runWords } from "@/lib/reports/run";

export const dynamic = "force-dynamic";

const plain = (m: string, status: number) => new Response(m, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  let current;
  try {
    ({ current } = await requireAction("reports-analytics", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return plain("You do not have permission to export reports.", 403);
    throw e;
  }
  const entry = findEntry(key);
  if (!entry) return plain("This report was not found.", 404);
  if (!entryAllowed(entry, reportAccess(current), current)) return plain(closedWords(entry, reportAccess(current), current), 403);
  const url = new URL(req.url);
  const sp = Object.fromEntries(url.searchParams);
  const format = (["csv", "xlsx", "pdf"].includes(sp.format) ? sp.format : "xlsx") as ExportFormat;
  const tz = current.school.timeZone;
  const setup = await periodSetup(current);
  try {
    const out = await withSchool(current.ctx, async (tx) => {
      const f = await readFilters(tx, current.ctx, entry, sp, setup, todayFor(tz), current.campusId ?? null);
      const options = await optionsFor(tx, current, entry, f);
      const words = await runWords(tx, entry, f, reportAccess(current).own, options);
      const t = await runEntry(tx, current, entry, f);
      if (t.rows.length > BACKGROUND_ROWS) {
        const run = await prepareReport(tx, current, entry, filterParams(f, entry), words, format);
        return { background: run.id, params: filterParams(f, entry) };
      }
      await logExport(tx, current.ctx, { title: entry.name, format, filters: words, rows: t.rows.length });
      return { file: await reportFile(t, entry, format, { schoolName: current.school.name, exportedBy: current.user.displayName, timeZone: tz, filters: words }) };
    }, { timeout: 120_000 });
    if ("background" in out) {
      const back = new URLSearchParams({ ...out.params, run: out.background! });
      return NextResponse.redirect(new URL(`${BASE}/r/${entry.key}?${back.toString()}`, req.url), 303);
    }
    return exportResponse(out.file!);
  } catch (e) {
    if (e instanceof ReportProblem) return plain(e.message, 403);
    throw e;
  }
}
