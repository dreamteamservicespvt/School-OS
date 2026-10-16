// A report's filters from the page address (P2), read the same way for the
// screen, every file, the background run and the scheduled email, so a file
// always matches what was shown. Money reports use the financial year
// (default April to March, Finance Settings), kept apart from the academic
// year (decided 9 October 2026).
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { currentYear } from "../academic/years";
import { chosenFinancialYear } from "../finance/years";
import { formatDate } from "../format";
import { periodFromSearch, type PeriodKey, type SchoolCalendar } from "../periods";
import type { ReportEntry, ReportFilters } from "./types";

export type Raw = Record<string, string | string[] | undefined>;
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const uuidOr = (v: string, fallback: string | null = null) => (UUID.test(v) ? v : fallback);

/** Page-address words that are filters, not the report's own options. */
const COMMON = new Set(["period", "from", "to", "year", "fy", "class", "section", "campus", "sort", "dir", "format", "run", "open", "all"]);

export type PeriodSetupLike = { timeZone: string; weekStart: "monday" | "sunday"; calendar: SchoolCalendar };

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (x: Date) => x.toISOString().slice(0, 10);

/** Reads one report's filters. Own-reach people may only pick among their own sections (checked again by each report). */
export async function readFilters(tx: Tx, ctx: SchoolContext, entry: Pick<ReportEntry, "dated" | "money" | "fallback">, sp: Raw, setup: PeriodSetupLike, today: Date, campusId: string | null = null): Promise<ReportFilters> {
  const yearParam = uuidOr(one(sp.year));
  const year = (yearParam ? await tx.academicYear.findFirst({ where: { id: yearParam, archivedAt: null } }) : null) ?? (await currentYear(tx, ctx, campusId));
  let fy: ReportFilters["fy"] = null;
  let range: ReportFilters["range"] = null;
  if (entry.money) {
    const chosen = uuidOr(one(sp.fy));
    fy = await chosenFinancialYear(tx, ctx, chosen, today);
    if (entry.dated) {
      // A chosen past year with no dates shows that whole year; otherwise the dates, kept inside the year.
      const picked = one(sp.period) || one(sp.from);
      const r = picked ? periodFromSearch(sp, { ...setup, fallback: entry.fallback ?? "thismonth" }) : chosen ? { period: "custom" as PeriodKey, from: iso(fy.startDate), to: iso(fy.endDate), label: `Financial year ${fy.name}` } : periodFromSearch(sp, { ...setup, fallback: entry.fallback ?? "thismonth" });
      if (r) {
        const end = fy.endDate < today ? fy.endDate : today;
        const from = d(r.from) > fy.startDate ? d(r.from) : fy.startDate;
        const to0 = d(r.to) < end ? d(r.to) : end;
        const to = to0 < from ? from : to0;
        range = { ...r, from: iso(from), to: iso(to) };
      }
    }
  } else if (entry.dated) {
    range = periodFromSearch(sp, { ...setup, fallback: entry.fallback ?? "thismonth" });
  }
  const from = range ? d(range.from) : entry.money && fy ? fy.startDate : year?.startDate ?? today;
  const to = range ? d(range.to) : today;
  const extra: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) if (!COMMON.has(k) && one(v) && /^[\w-]{1,64}$/.test(k)) extra[k] = one(v).slice(0, 100);
  const dir = one(sp.dir) === "desc" ? "desc" : "asc";
  return {
    range, from, to,
    year: year ? { id: year.id, name: year.name, startDate: year.startDate, endDate: year.endDate } : null,
    fy: fy ? { id: fy.id, name: fy.name, startDate: fy.startDate, endDate: fy.endDate } : null,
    classId: uuidOr(one(sp.class)),
    sectionId: uuidOr(one(sp.section)),
    campusId: uuidOr(one(sp.campus), campusId),
    extra,
    sort: /^[\w-]{1,40}$/.test(one(sp.sort)) ? one(sp.sort) : null,
    dir,
    today,
  };
}

/** The filters as page-address words, to keep them on links and re-run the same report. */
export function filterParams(f: ReportFilters, entry: Pick<ReportEntry, "dated" | "money">): Record<string, string> {
  const out: Record<string, string> = {};
  if (entry.dated && f.range) {
    if (f.range.period === "custom" || f.range.period === "month") { out.period = f.range.period; out.from = f.range.from; out.to = f.range.to; if (f.range.month) out.month = f.range.month; }
    else out.period = f.range.period;
  }
  if (entry.money && f.fy) out.fy = f.fy.id;
  else if (f.year) out.year = f.year.id;
  if (f.classId) out.class = f.classId;
  if (f.sectionId) out.section = f.sectionId;
  if (f.campusId) out.campus = f.campusId;
  for (const [k, v] of Object.entries(f.extra)) out[k] = v;
  if (f.sort) { out.sort = f.sort; out.dir = f.dir; }
  return out;
}

/** "01-04-2026 to 31-03-2027". */
export const span = (a: Date, b: Date) => `${formatDate(a, "UTC")} to ${formatDate(b, "UTC")}`;

/** When the report is for, in words: dates, the financial year, or the academic year. */
export function whenWords(f: ReportFilters, entry: Pick<ReportEntry, "dated" | "money">) {
  if (entry.dated && f.range) return `${f.range.label} (${span(f.from, f.to)})${entry.money && f.fy ? `, financial year ${f.fy.name}` : ""}`;
  if (entry.money && f.fy) return `Financial year ${f.fy.name} (${span(f.fy.startDate, f.fy.endDate)}), as on ${formatDate(f.today, "UTC")}`;
  return `${f.year?.name ?? "This year"}, as on ${formatDate(f.today, "UTC")}`;
}

/** "Class 5, 2026-27, 01-09-2026 to 30-09-2026": printed on the screen and in every file (19 §5). */
export function filterWords(f: ReportFilters, entry: Pick<ReportEntry, "dated" | "money" | "byClass">, names: { cls?: string | null; campus?: string | null; extra?: string[] }) {
  return [entry.byClass ? names.cls ?? "All classes" : "Whole school", whenWords(f, entry), names.campus ? `${names.campus} campus` : null, ...(names.extra ?? [])].filter(Boolean).join(" · ");
}
