// The shared date filter (P2) on exam lists: an exam is in a period when any
// of its days falls inside it.
import type { DayRange } from "@/lib/periods";
import { dateWhere } from "@/lib/periods";

type Raw = Record<string, string | string[] | undefined>;

/** Prisma filter for exams whose dates overlap the chosen period; empty for all dates. */
export function examOverlaps(range: DayRange | null) {
  if (!range) return {};
  const d = dateWhere(range);
  return { startDate: { lte: d.lte }, endDate: { gte: d.gte } };
}

/** The date filter's own search params, to carry into links and exports. */
export function periodQuery(raw: Raw, prefix = ""): [string, string][] {
  const out: [string, string][] = [];
  for (const k of ["period", "from", "to"]) {
    const v = raw[`${prefix}${k}`];
    const one = Array.isArray(v) ? v[0] : v;
    if (one) out.push([`${prefix}${k}`, one]);
  }
  return out;
}
