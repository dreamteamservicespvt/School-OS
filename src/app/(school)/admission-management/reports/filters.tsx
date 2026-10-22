// The filters shared by Admission Reports and their exports: admission year,
// date range (P2), class, source, owner and campus, read from the page address.
import { UUID_RE } from "@/lib/admission/act";
import type { Filters } from "@/lib/admission/reports";
import { withCampus, type Settings } from "@/lib/admission/settings";
import { momentWhere, periodFromSearch, type DayRange } from "@/lib/periods";

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const idOrNull = (v: string) => (UUID_RE.test(v) ? v : null);

/** The address keys the report filters use; links between report pages keep them. */
export const REPORT_KEYS = ["year", "class", "source", "owner", "campus", "period", "from", "to"] as const;

type YearRow = { id: string; name: string; status: string; campusId: string };

/**
 * The admission year shown by default: the one of the campus chosen, else
 * each campus's (a school with two campuses has two, each with its own years).
 * `admitting`: admissionYears() for the person (only their campus's when limited to one).
 */
export function defaultYears(admitting: { id: string; campusId: string }[], raw: Raw): string | string[] | null {
  const campus = idOrNull(one(raw.campus));
  const pick = campus ? admitting.filter((y) => y.campusId === campus) : admitting;
  return pick.length === 0 ? null : pick.length === 1 ? pick[0].id : pick.map((y) => y.id);
}

/** The year choices: the default first ("Admission year" when it covers several campuses), then the other open years. */
export function yearOptions(years: YearRow[], admitting: YearRow[], def: string | string[] | null, campus: Map<string, string>) {
  const mid = (y: YearRow) => y.status === "ACTIVE" && admitting.some((a) => a.campusId === y.campusId && a.id !== y.id);
  const first = Array.isArray(def) ? [{ value: "", label: "Admission year" }] : [];
  const sorted = [...years].sort((a, b) => (a.id === def ? -1 : b.id === def ? 1 : 0));
  return [...first, ...sorted.map((y) => ({ value: y.id, label: withCampus(campus, mid(y) ? `${y.name} mid-year` : y.name, y.campusId) }))];
}

export function readFilters(raw: Raw, s: Settings, defaultYearId: string | string[] | null, timeZone: string): { f: Filters; range: DayRange | null } | null {
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
    `Admission year: ${[...new Set((Array.isArray(f.yearId) ? f.yearId : [f.yearId]).map((y) => n.years.get(y) ?? ""))].join(", ")}`,
    range && `Added: ${range.label}${range.period === "custom" ? "" : ` (${range.from} to ${range.to})`}`,
    f.classId && `Class: ${n.classes.get(f.classId) ?? ""}`,
    f.source && `Source: ${n.sources.get(f.source) ?? f.source}`,
    f.ownerStaffId && `Owner: ${n.staff.get(f.ownerStaffId) ?? ""}`,
  ].filter(Boolean).join(" · ");
}
