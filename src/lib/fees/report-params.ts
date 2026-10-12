// Fee Reports read their filters from the page address (P2), the same way on
// the screen and in the export, so an export always matches what was shown.
import { periodFromSearch, type PeriodOptions } from "../periods";
import { PAYMENT_MODES } from "./words";
import type { ReportFilter } from "./reports";

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const UUID = /^[0-9a-f-]{36}$/i;

/** The filter for a report: the chosen dates, else the academic year so far. */
export function reportFilter(sp: Raw, opts: PeriodOptions & { today: Date; yearStart: Date | null }) {
  const range = periodFromSearch(sp, opts);
  const from = range ? new Date(`${range.from}T00:00:00Z`) : opts.yearStart ?? new Date(Date.UTC(opts.today.getUTCFullYear(), 3, 1));
  const to = range ? new Date(`${range.to}T00:00:00Z`) : opts.today;
  const group = (["day", "month", "year"].includes(one(sp.group)) ? one(sp.group) : "month") as ReportFilter["group"];
  const mode = PAYMENT_MODES.some((m) => m.value === one(sp.mode)) ? one(sp.mode) : null;
  const f: ReportFilter = {
    from,
    to,
    classId: UUID.test(one(sp.class)) ? one(sp.class) : null,
    feeHeadId: UUID.test(one(sp.head)) ? one(sp.head) : null,
    mode,
    collectorId: UUID.test(one(sp.by)) ? one(sp.by) : null,
    group,
    today: opts.today,
  };
  return { f, range };
}
