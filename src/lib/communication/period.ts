// The shared date filter (src/components/list/period-filter.tsx) on Communication's lists:
// the period, from and to in the page address become a "created in" range in the school's time zone.
import { momentWhere, periodRange } from "../periods";

export const PERIOD_FILTERS = ["period", "from", "to"] as const;

/** { gte, lt } for a date-and-time column, or null when all dates are shown. */
export function inPeriod(filters: Record<string, string | undefined>, timeZone: string) {
  const r = periodRange({ period: filters.period ?? null, from: filters.from ?? null, to: filters.to ?? null }, { timeZone });
  return r ? momentWhere(r, timeZone) : null;
}
