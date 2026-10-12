import type { Metadata } from "next";
import Link from "next/link";
import { withSchool } from "@/lib/db";
import { fullPage, BASE } from "@/lib/admission/page";
import { REPORTS, report } from "@/lib/admission/reports";
import { openYears } from "@/lib/admission/settings";
import { enquiryChoices, names } from "@/lib/admission/choices";
import { PageHeader } from "@/components/shell/page-header";
import { FilterBar, filterQuery, readFilters } from "./filters";

export const metadata: Metadata = { title: "Admission Reports" };

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ReportsPage({ searchParams }: Search) {
  const { current, viewer, settings, year, tz } = await fullPage();
  const f = readFilters(await searchParams, settings, year?.id ?? null);
  const data = await withSchool(current.ctx, async (tx) => {
    const [n, years, choices, campuses] = await Promise.all([
      names(tx), openYears(tx), enquiryChoices(tx, current.ctx, current, settings, tz),
      tx.campus.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ]);
    const cards = f ? await Promise.all(REPORTS.map(async (r) => ({ ...r, headline: (await report(tx, settings, viewer, r.key, f, n)).headline }))) : [];
    return { n, years, choices, campuses, cards };
  });
  return (
    <>
      <PageHeader title="Admission Reports" href={`${BASE}/reports`} userId={current.user.id} />
      {!f ? (
        <p className="rounded-xl border border-warn/40 bg-warn-bg p-3 text-warn-text">No academic year is set up yet.</p>
      ) : (
        <>
          <FilterBar action={`${BASE}/reports`} f={f} years={data.years.map((y) => ({ value: y.id, label: y.name }))} classes={data.choices.classes}
            sources={settings.sourceList.map((s) => ({ value: s.key, label: s.label }))} owners={data.choices.owners} campuses={data.campuses.map((c) => ({ value: c.id, label: c.name }))} />
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.cards.map((c) => (
              <li key={c.key}>
                <Link href={`${BASE}/reports/${c.key}?${filterQuery(f)}`} className="flex h-full flex-col rounded-2xl border border-line bg-surface p-4 shadow-card hover:border-brand">
                  <span className="font-semibold">{c.title}</span>
                  <span className="mt-1 text-lg">{c.headline}</span>
                  <span className="mt-2 text-sm text-ink-2">{c.about}</span>
                  <span className="mt-auto pt-3 text-sm font-medium text-brand-text">Open report</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
