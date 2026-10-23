// The Dashboard's filters (01-dashboard.md §2 Controls): a campus, for people
// who see more than one; and, on the control centre, the dates (one day or a
// range from–to), the academic year and a class. All are kept in the page
// address; the cards and the lists they open follow them (gap list G36).
import Link from "next/link";
import { UrlDate, UrlSelect } from "@/components/ui/url-controls";
import { Words } from "@/lib/i18n/client";
import { PhoneFilters } from "./phone-filters";

export function DashFilterBar({ campuses, dates, today, years, classes, showing }: {
  campuses: { id: string; name: string }[];
  /** The dates chosen ("" for today), or null when the home has no date filters. */
  dates: { from: string; to: string } | null;
  today: string;
  /** The years to choose from (the current one first is marked), or empty for no year filter. */
  years: { id: string; name: string; current: boolean }[];
  /** The classes to choose from, or empty for no class filter. */
  classes: { id: string; name: string }[];
  /** Words for the filters in use, such as "North Campus · 09-10-2026"; empty for none. */
  showing: string;
}) {
  if (!campuses.length && dates === null && years.length < 2 && !classes.length) return null;
  const current = years.find((y) => y.current)?.id ?? "";
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-wrap">
      <PhoneFilters summary={showing}>
      {campuses.length > 0 && (
        <UrlSelect param="campus" label="Campus" className="sm:w-56"
          options={[{ value: "", label: "All campuses" }, ...campuses.map((c) => ({ value: c.id, label: c.name }))]} />
      )}
      {years.length > 1 && (
        <UrlSelect param="year" label="Academic year" className="sm:w-40" value={current}
          options={years.map((y) => ({ value: y.id, label: y.name }))} />
      )}
      {dates !== null && (
        <div className="flex items-center gap-2">
          <UrlDate param="from" label="From" value={dates.from || dates.to || today} max={dates.to || today} className="sm:w-44" />
          <span className="text-[13px] text-ink3"><Words k="to" /></span>
          <UrlDate param="to" label="To" value={dates.to || today} max={today} className="sm:w-44" />
        </div>
      )}
      {classes.length > 0 && (
        <UrlSelect param="class" label="Class" className="sm:w-44"
          options={[{ value: "", label: "All classes" }, ...classes.map((c) => ({ value: c.id, label: c.name }))]} />
      )}
      </PhoneFilters>
      {showing && (
        <p className="text-[13px] text-ink2">
          <Words k="Showing" /> {showing}<Words k=". Each number opens its list with the same filter." />{" "}
          <Link href="/dashboard?view=dashboard" className="font-semibold text-brand hover:underline"><Words k="Reset" /></Link>
        </p>
      )}
    </div>
  );
}
