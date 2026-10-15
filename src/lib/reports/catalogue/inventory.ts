// Inventory reports in the catalogue (14 §7): the same tables as the
// Inventory Reports page (src/lib/inventory/reports.ts), so both show the
// same rows. The Accountant reads them too (purchases and bills that reach
// Finance), with the module's View.
import "server-only";

import { INVENTORY_REPORT_LIST, type InvFilter } from "../../inventory/reports";
import type { ReportEntry, RunCtx } from "../types";
import { scopeSections } from "./util";

async function invFilter(rc: RunCtx, byClass: boolean, dated: boolean): Promise<InvFilter> {
  const narrowed = byClass && (rc.f.classId || rc.f.sectionId || rc.f.campusId);
  return {
    from: dated && rc.f.range ? rc.f.from : null,
    to: dated && rc.f.range ? rc.f.to : null,
    today: rc.f.today,
    sectionIds: narrowed ? (await scopeSections(rc)) ?? null : null,
    group: rc.f.extra.group ?? null,
  };
}

export const INVENTORY_REPORTS: ReportEntry[] = INVENTORY_REPORT_LIST.map((r) => ({
  key: r.key,
  category: "Inventory",
  name: r.name,
  sub: r.sub,
  dated: r.dated,
  fallback: r.dated ? "thismonth" : undefined,
  byClass: r.byClass,
  allowed: (_a, who) => (who.permissions["inventory-management"]?.see ?? "none") === "all",
  ...(r.key === "inv-purchases"
    ? {
        options: async (rc) => [{ param: "group", label: "Group by", value: rc.f?.extra.group ?? "vendor", options: [{ value: "vendor", label: "Vendor" }, { value: "item", label: "Item" }, { value: "month", label: "Month" }] }],
      }
    : {}),
  async run(rc) {
    return r.run(rc.tx, rc.ctx, await invFilter(rc, r.byClass, r.dated));
  },
}));
