// Library reports in the catalogue (13 §7): the same tables as the Library
// Reports page (src/lib/library/reports.ts), so both show the same rows.
import "server-only";

import { LIBRARY_REPORT_LIST, stockSessions, type LibFilter } from "../../library/reports";
import { formatDate } from "../../format";
import type { ReportEntry, RunCtx } from "../types";
import { scopeSections } from "./util";

async function libFilter(rc: RunCtx, byClass: boolean, dated: boolean): Promise<LibFilter> {
  const narrowed = byClass && (rc.f.classId || rc.f.sectionId || rc.f.campusId);
  return {
    from: dated && rc.f.range ? rc.f.from : null,
    to: dated && rc.f.range ? rc.f.to : null,
    today: rc.f.today,
    sectionIds: narrowed ? (await scopeSections(rc)) ?? null : null,
    session: rc.f.extra.session ?? null,
  };
}

export const LIBRARY_REPORTS: ReportEntry[] = LIBRARY_REPORT_LIST.map((r) => ({
  key: r.key,
  category: "Library",
  name: r.name,
  sub: r.sub,
  dated: r.dated,
  fallback: r.dated ? "acyear" : undefined,
  byClass: r.byClass,
  allowed: (_a, who) => (who.permissions["library-management"]?.see ?? "none") === "all",
  ...(r.key === "lib-stock"
    ? {
        options: async (rc) => {
          const f: LibFilter = { from: rc.f?.range ? rc.f.from : null, to: rc.f?.range ? rc.f.to : null, today: rc.f?.today ?? new Date(), sectionIds: null };
          const sessions = await stockSessions(rc.tx, f);
          return [{ param: "session", label: "Stock check", value: rc.f?.extra.session ?? "", options: [{ value: "", label: "Every check" }, ...sessions.map((x) => ({ value: x.id, label: `${x.name} (${formatDate(x.startedAt, rc.tz)})` }))] }];
        },
      }
    : {}),
  async run(rc) {
    return r.run(rc.tx, rc.ctx, await libFilter(rc, r.byClass, r.dated));
  },
}));
