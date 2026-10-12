// The filters shared by Admission Reports and their exports: admission year,
// date range (P2), class, source, owner and campus, read from the page address.
import { UUID_RE } from "@/lib/admission/act";
import type { Filters } from "@/lib/admission/reports";
import type { Settings } from "@/lib/admission/settings";
import { momentWhere, periodFromSearch, type DayRange } from "@/lib/periods";

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const idOrNull = (v: string) => (UUID_RE.test(v) ? v : null);

/** The address keys the report filters use; links between report pages keep them. */
export const REPORT_KEYS = ["year", "class", "source", "owner", "campus", "period", "from", "to"] as const;

export function readFilters(raw: Raw, s: Settings, defaultYearId: string | null, timeZone: string): { f: Filters; range: DayRange | null } | null {
  const yearId = idOrNull(one(raw.year)) ?? defaultYearId;
  if (!yearId) return null;
  const source = one(raw.source);
  const range = periodFromSearch(raw, { timeZone });
  return {
    range,
    f: {
      yearId,
      classId: idOrNull(one(raw.class)),
      source: s.sourceList.some((x) => x.key === source) ? source : null,
      ownerStaffId: idOrNull(one(raw.owner)),
      campusId: idOrNull(one(raw.campus)),
      created: range ? momentWhere(range, timeZone) : null,
    },
  };
}

/** The current report filters as a query string (without the leading "?"). */
export function filterQuery(raw: Raw) {
  const q = new URLSearchParams();
  for (const k of REPORT_KEYS) { const v = one(raw[k]); if (v) q.set(k, v); }
  return q.toString();
}

export function describeFilters(f: Filters, range: DayRange | null, n: { classes: Map<string, string>; staff: Map<string, string>; years: Map<string, string>; sources: Map<string, string> }) {
  return [
    `Admission year: ${n.years.get(f.yearId) ?? ""}`,
    range && `Added: ${range.label}${range.period === "custom" ? "" : ` (${range.from} to ${range.to})`}`,
    f.classId && `Class: ${n.classes.get(f.classId) ?? ""}`,
    f.source && `Source: ${n.sources.get(f.source) ?? f.source}`,
    f.ownerStaffId && `Owner: ${n.staff.get(f.ownerStaffId) ?? ""}`,
  ].filter(Boolean).join(" · ");
}
