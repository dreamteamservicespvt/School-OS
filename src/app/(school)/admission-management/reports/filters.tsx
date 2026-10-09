// The filters shared by Admission Reports and their exports: admission year,
// class, source, owner and campus, read from the page address.
import Link from "next/link";
import { UUID_RE } from "@/lib/admission/act";
import type { Filters } from "@/lib/admission/reports";
import type { Settings } from "@/lib/admission/settings";

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const idOrNull = (v: string) => (UUID_RE.test(v) ? v : null);

export function readFilters(raw: Raw, s: Settings, defaultYearId: string | null): Filters | null {
  const yearId = idOrNull(one(raw.year)) ?? defaultYearId;
  if (!yearId) return null;
  const source = one(raw.source);
  return {
    yearId,
    classId: idOrNull(one(raw.class)),
    source: s.sourceList.some((x) => x.key === source) ? source : null,
    ownerStaffId: idOrNull(one(raw.owner)),
    campusId: idOrNull(one(raw.campus)),
  };
}

export function filterQuery(f: Filters) {
  return new URLSearchParams(Object.entries({ year: f.yearId, class: f.classId, source: f.source, owner: f.ownerStaffId, campus: f.campusId }).filter((e): e is [string, string] => Boolean(e[1]))).toString();
}

export function describeFilters(f: Filters, n: { classes: Map<string, string>; staff: Map<string, string>; years: Map<string, string>; sources: Map<string, string> }) {
  return [
    `Admission year: ${n.years.get(f.yearId) ?? ""}`,
    f.classId && `Class: ${n.classes.get(f.classId) ?? ""}`,
    f.source && `Source: ${n.sources.get(f.source) ?? f.source}`,
    f.ownerStaffId && `Owner: ${n.staff.get(f.ownerStaffId) ?? ""}`,
  ].filter(Boolean).join(" · ");
}

type Opt = { value: string; label: string };

export function FilterBar({ action, f, years, classes, sources, owners, campuses }: { action: string; f: Filters; years: Opt[]; classes: Opt[]; sources: Opt[]; owners: Opt[]; campuses: Opt[] }) {
  const cls = "h-11 max-w-full rounded-lg border border-line-strong bg-surface px-3 text-[15px]";
  const sel = (name: string, label: string, options: Opt[], value: string | null | undefined, all?: string) => (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-ink-2">{label}</span>
      <select name={name} defaultValue={value ?? ""} className={cls}>
        {all && <option value="">{all}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
  return (
    <form method="get" action={action} className="mb-4 flex flex-wrap items-end gap-3" aria-label="Filters">
      {sel("year", "Admission year", years, f.yearId)}
      {sel("class", "Class", classes, f.classId, "All classes")}
      {sel("source", "Source", sources, f.source, "All sources")}
      {sel("owner", "Owner", owners, f.ownerStaffId, "All owners")}
      {campuses.length > 1 && sel("campus", "Campus", campuses, f.campusId, "All campuses")}
      <button type="submit" className="inline-flex min-h-11 items-center rounded-lg border border-line-strong bg-surface px-4 font-medium hover:bg-surface-2">Apply</button>
      <Link href={action} className="inline-flex min-h-11 items-center px-2 text-sm text-brand-text hover:underline">Reset</Link>
    </form>
  );
}
