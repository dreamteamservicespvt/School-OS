// One Library report as Excel, CSV or PDF with the dates, class and stock
// check on screen: the same Table the page and Reports & Analytics show.
import { withSchool } from "@/lib/db";
import { exportResponse, logExport } from "@/lib/exports";
import { reportFile } from "@/lib/reports/run";
import { LIBRARY_REPORTS } from "@/lib/reports/catalogue/library";
import { libRoute, plain, rangeWords } from "../../_lib/route";
import { readReportFilter } from "../../_lib/reports";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const x = await libRoute(req, "reports");
  if (x instanceof Response) return x;
  const range = await x.range("acyear");
  const r = readReportFilter(x.get, range, x.today);
  if (!r.report) return plain("Choose a report to export.", 400);
  const report = r.report;
  const entry = LIBRARY_REPORTS.find((e) => e.key === report.key)!;
  const out = await withSchool(x.current.ctx, async (tx) => {
    const t = await report.run(tx, x.current.ctx, r.forReport(report));
    const sec = report.byClass && r.sec ? await tx.section.findFirst({ where: { id: r.sec }, select: { name: true, schoolClass: { select: { name: true } } } }) : null;
    const session = report.key === "lib-stock" && r.session ? await tx.stockCheckSession.findFirst({ where: { id: r.session }, select: { name: true } }) : null;
    const filters = [report.dated ? rangeWords(range) : "As on today", sec ? `Class: ${sec.schoolClass.name} ${sec.name}` : "", session ? `Stock check: ${session.name}` : ""].filter(Boolean).join(" · ");
    await logExport(tx, x.current.ctx, { title: report.name, format: x.format, filters, rows: t.rows.length });
    return reportFile(t, entry, x.format, { schoolName: x.current.school.name, exportedBy: x.current.user.displayName, timeZone: x.tz, filters });
  }, { timeout: 120_000 });
  return exportResponse(out);
}
