// The filter row on Admission Reports and each report: admission year, date
// range, class, source and owner, all kept in the page address (P2).
import { PeriodFilter } from "@/components/list/period-filter";
import { ExportMenu, UrlSegmented, UrlSelect } from "@/components/ui/url-filters";

type Opt = { value: string; label: string };

export function ReportToolbar({ years, classes, sources, owners, campuses, tz, exportHref }: { years: Opt[]; classes: Opt[]; sources: Opt[]; owners: Opt[]; campuses: Opt[]; tz: string; exportHref: string | null }) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2 justify-between flex-wrap">
        {years.length > 1 ? (years.length > 3
          ? <UrlSelect param="year" label="Admission year" allLabel={years[0].label} options={years.slice(1)} className="w-48" />
          : <UrlSegmented param="year" label="Admission year" options={years} />) : <span />}
        {exportHref && <ExportMenu href={exportHref} />}
      </div>
      <div className="grid grid-cols-2 md:flex gap-2 md:flex-wrap">
        <PeriodFilter timeZone={tz} allLabel="Any date added" className="col-span-2 md:w-56" />
        <UrlSelect param="class" label="Class" allLabel="All classes" options={classes} className="md:w-40" />
        <UrlSelect param="source" label="Source" allLabel="All sources" options={sources} className="md:w-40" />
        <UrlSelect param="owner" label="Owner" allLabel="All owners" options={owners} className="md:w-44" />
        {campuses.length > 1 && <UrlSelect param="campus" label="Campus" allLabel="All campuses" options={campuses} className="md:w-40" />}
      </div>
    </div>
  );
}
