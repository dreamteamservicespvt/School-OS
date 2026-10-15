// The Inventory Reports page's filters, read from the page address the same
// way for the screen and every file: the dates (this financial year unless
// chosen), a class (issues and book sets), a store and category (stock and
// movements), and how purchases are grouped.
import "server-only";

import type { DayRange } from "@/lib/periods";
import { INVENTORY_REPORT_LIST, type InvFilter } from "@/lib/inventory/reports";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

export type ReportPick = (typeof INVENTORY_REPORT_LIST)[number] | null;
export const STORE_REPORTS = new Set<string>(["inv-stock", "inv-movements"]);

export function readReportFilter(get: (k: string) => string, range: DayRange | null, today: Date) {
  const sec = UUID.test(get("sec")) ? get("sec") : "";
  const store = UUID.test(get("store")) ? get("store") : "";
  const cat = UUID.test(get("cat")) ? get("cat") : "";
  const group = ["vendor", "item", "month"].includes(get("group")) ? get("group") : "vendor";
  const report = INVENTORY_REPORT_LIST.find((r) => r.key === get("r")) ?? null;
  const f: InvFilter = { from: range ? day(range.from) : null, to: range ? day(range.to) : null, today, sectionIds: sec ? [sec] : null, locationId: store || null, categoryId: cat || null, group };
  /** The filter for one report: undated reports ignore the dates, and only class reports take the class. */
  const forReport = (r: NonNullable<ReportPick>): InvFilter => ({
    ...f, from: r.dated ? f.from : null, to: r.dated ? f.to : null, sectionIds: r.byClass ? f.sectionIds : null,
    locationId: STORE_REPORTS.has(r.key) ? f.locationId : null, categoryId: STORE_REPORTS.has(r.key) ? f.categoryId : null,
  });
  return { sec, store, cat, group, report, f, forReport };
}
