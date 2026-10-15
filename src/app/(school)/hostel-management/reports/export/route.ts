// One Hostel report as Excel, CSV or PDF with the dates on screen: the same
// Table the page and Reports & Analytics show. A warden's file holds their
// own hostel only.
import { withSchool } from "@/lib/db";
import { exportResponse, logExport } from "@/lib/exports";
import { reportFile } from "@/lib/reports/run";
import { HOSTEL_REPORTS } from "@/lib/reports/catalogue/hostel";
import { HOSTEL_REPORT_LIST } from "@/lib/hostel/reports";
import { hostelRoute, plain, rangeWords } from "../../_lib/route";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const x = await hostelRoute(req, "reports");
  if (x instanceof Response) return x;
  const report = HOSTEL_REPORT_LIST.find((r) => r.key === x.get("r"));
  if (!report) return plain("Choose a report to export.", 400);
  const entry = HOSTEL_REPORTS.find((e) => e.key === report.key)!;
  const range = await x.range("thismonth");
  const out = await withSchool(x.current.ctx, async (tx) => {
    const t = await report.run(tx, x.current.ctx, { from: range ? new Date(`${range.from}T00:00:00Z`) : null, to: range ? new Date(`${range.to}T00:00:00Z`) : null, today: x.today, hostelIds: x.mine, tz: x.tz, now: x.now, phones: x.can.outings });
    const names = x.mine === null ? "" : (await tx.hostel.findMany({ where: { id: { in: x.mine } }, select: { name: true } })).map((h) => h.name).join(", ");
    const filters = [report.dated ? rangeWords(range) : "As on today", names ? `Hostel: ${names}` : ""].filter(Boolean).join(" · ");
    await logExport(tx, x.current.ctx, { title: report.name, format: x.format, filters, rows: t.rows.length });
    return reportFile(t, entry, x.format, { schoolName: x.current.school.name, exportedBy: x.current.user.displayName, timeZone: x.tz, filters });
  }, { timeout: 120_000 });
  return exportResponse(out);
}
