// Exports from Homework & Learning (P8): Excel, CSV or PDF with the filters
// on screen, including the date filter, only what this person may read, and
// a line in the export log.
import "server-only";

import { requireAction, type Current } from "@/lib/current";
import { withSchool, type Tx } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn, type ExportFormat } from "@/lib/exports";
import { PermissionDeniedError } from "@/lib/permissions";
import { periodSetup } from "@/lib/period-setup";
import { periodFromSearch, type PeriodKey } from "@/lib/periods";
import { todayIn } from "@/lib/academic/common";
import { homeworkScope, type HomeworkScope } from "@/lib/homework/scope";
import { homeworkFeatures } from "@/lib/homework/settings";
import { homeworkPageAllowed, type HomeworkPageKey } from "@/lib/homework/access";

export type ExportCtx = {
  tx: Tx; s: HomeworkScope; current: Current; url: URL; g: (k: string) => string; now: Date; today: Date;
  from: Date | null; to: Date | null; periodLabel: string | null;
};

export async function homeworkExport<R>(req: Request, page: HomeworkPageKey, fallback: PeriodKey | null,
  build: (c: ExportCtx) => Promise<{ title: string; rows: R[]; columns: ExportColumn<R>[]; filters: string[] }>) {
  let current: Current;
  try {
    ({ current } = await requireAction("homework-learning", "export"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return new Response("You do not have permission to export from Homework & Learning.", { status: 403 });
    throw e;
  }
  const url = new URL(req.url);
  const g = (k: string) => url.searchParams.get(k) ?? "";
  const format = (["csv", "xlsx", "pdf"].includes(g("format")) ? g("format") : "xlsx") as ExportFormat;
  const dates = await periodSetup(current);
  const range = periodFromSearch(Object.fromEntries(url.searchParams), { ...dates, fallback, prefix: "" });
  const now = new Date();
  const today = todayIn(current.school.timeZone, now);
  const out = await withSchool(current.ctx, async (tx) => {
    const s = await homeworkScope(tx, current, today);
    const features = await homeworkFeatures(tx, current.ctx);
    if (!homeworkPageAllowed(s.modes, features, page) || s.level === "student") return null;
    const r = await build({ tx, s, current, url, g, now, today, from: range ? new Date(`${range.from}T00:00:00Z`) : null, to: range ? new Date(`${range.to}T00:00:00Z`) : null, periodLabel: range?.label ?? null });
    const filters = [range?.label ? `${range.label} (${range.from} to ${range.to})` : null, ...r.filters].filter(Boolean).join(", ");
    await logExport(tx, current.ctx, { title: r.title, format, filters, rows: r.rows.length });
    return { ...r, filters };
  });
  if (!out) return new Response("Your role does not include this page.", { status: 403 });
  return exportResponse(await buildExport(format, out.columns, out.rows, { title: out.title, schoolName: current.school.name, exportedBy: current.user.displayName, timeZone: current.school.timeZone, filters: out.filters }));
}
