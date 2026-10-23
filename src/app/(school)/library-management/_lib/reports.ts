// The Library Reports page's filters, read from the page address the same
// way for the screen and every file: the dates (this academic year unless
// chosen), a class, and the stock check for the stock check result.
import "server-only";

import type { DayRange } from "@/lib/periods";
import { LIBRARY_REPORT_LIST, type LibFilter } from "@/lib/library/reports";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

export type ReportPick = (typeof LIBRARY_REPORT_LIST)[number] | null;

export function readReportFilter(get: (k: string) => string, range: DayRange | null, today: Date) {
  const sec = UUID.test(get("sec")) ? get("sec") : "";
  const session = UUID.test(get("session")) ? get("session") : "";
  const report = LIBRARY_REPORT_LIST.find((r) => r.key === get("r")) ?? null;
  // "More than N days late" on the overdue report (the Dashboard's card opens it with late=7, gap list G36).
  const lateN = /^\d{1,3}$/.test(get("late")) ? Number(get("late")) : 0;
  const late = report?.key === "lib-overdue" && lateN > 0 ? lateN : 0;
  const f: LibFilter = { from: range ? day(range.from) : null, to: range ? day(range.to) : null, today, sectionIds: sec ? [sec] : null, session: session || null, lateMoreThan: late };
  /** The filter for one report: undated reports ignore the dates, and only class reports take the class. */
  const forReport = (r: NonNullable<ReportPick>): LibFilter => ({ ...f, from: r.dated ? f.from : null, to: r.dated ? f.to : null, sectionIds: r.byClass ? f.sectionIds : null });
  return { sec, session, late, report, f, forReport };
}
