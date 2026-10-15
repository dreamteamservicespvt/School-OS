// Transport reports in the catalogue (12 §7 "All follow P8 and appear in
// Reports & Analytics"). The same tables as the module's Transport Reports
// page, from lib/transport/reports.ts. Only for people who see the whole of
// Transport; the fee report also needs Fee Reports (fee data never reaches a
// role without Fee Management).
import "server-only";

import { TR_REPORTS } from "../../transport/reports";
import { transportSettings } from "../../transport/settings";
import type { ReportEntry } from "../types";

const seesTransport = (who: { permissions: Record<string, { see: string } | undefined> }) => who.permissions["transport-management"]?.see === "all";

export const TRANSPORT_REPORTS: ReportEntry[] = TR_REPORTS.map((r) => ({
  key: r.key, category: "Transport", name: r.name, sub: r.sub, dated: r.dated, fallback: r.dated ? (r.key === "tr-fees" ? "finyear" : "last30") : undefined,
  allowed: (a, who) => seesTransport(who) && (r.key !== "tr-fees" || a.fees),
  async run(rc) {
    const s = await rc.memo("tr-settings", () => transportSettings(rc.tx, rc.ctx));
    return r.run({ tx: rc.tx, range: r.dated ? rc.f.range : null, tz: rc.tz, today: rc.f.today, lateAfterMin: s.lateAfterMin });
  },
}));
