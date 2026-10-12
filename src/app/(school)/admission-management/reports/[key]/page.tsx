import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { withSchool } from "@/lib/db";
import { fullPage, BASE } from "@/lib/admission/page";
import { REPORTS, report, type ReportKey } from "@/lib/admission/reports";
import { openYears } from "@/lib/admission/settings";
import { enquiryChoices, names } from "@/lib/admission/choices";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/empty-state";
import { ExportLinks } from "../../_components/bits";
import { FilterBar, filterQuery, readFilters } from "../filters";

export const metadata: Metadata = { title: "Admission report" };

type Props = { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ReportPage({ params, searchParams }: Props) {
  const { key } = await params;
  const meta = REPORTS.find((r) => r.key === key);
  if (!meta) notFound();
  const { current, viewer, settings, year, tz } = await fullPage();
  const f = readFilters(await searchParams, settings, year?.id ?? null);
  const data = await withSchool(current.ctx, async (tx) => {
    const [n, years, choices, campuses] = await Promise.all([
      names(tx), openYears(tx), enquiryChoices(tx, current.ctx, current, settings, tz),
      tx.campus.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ]);
    const r = f ? await report(tx, settings, viewer, key as ReportKey, f, n) : null;
    return { years, choices, campuses, r };
  });
  const path = `${BASE}/reports/${key}`;
  return (
    <>
      <PageHeader title={meta.title} href={path} userId={current.user.id}>
        {f && <ExportLinks href={`${path}/export?${filterQuery(f)}`} />}
      </PageHeader>
      <Link href={`${BASE}/reports${f ? `?${filterQuery(f)}` : ""}`} className="mb-3 inline-flex min-h-11 items-center text-sm text-brand-text hover:underline">← All admission reports</Link>
      <p className="mb-4 text-ink-2">{meta.about}</p>
      {!f || !data.r ? (
        <p className="rounded-xl border border-warn/40 bg-warn-bg p-3 text-warn-text">No academic year is set up yet.</p>
      ) : (
        <>
          <FilterBar action={path} f={f} years={data.years.map((y) => ({ value: y.id, label: y.name }))} classes={data.choices.classes}
            sources={settings.sourceList.map((s) => ({ value: s.key, label: s.label }))} owners={data.choices.owners} campuses={data.campuses.map((c) => ({ value: c.id, label: c.name }))} />
          <p className="mb-3 text-lg font-medium">{data.r.headline}</p>
          {data.r.rows.length === 0 ? (
            <EmptyState title="Nothing to show for these filters"><p>Try another year or class.</p></EmptyState>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="w-full text-left">
                <caption className="sr-only">{meta.title}</caption>
                <thead className="bg-surface-2 text-sm text-ink-2">
                  <tr>{data.r.columns.map((c) => <th key={c.key} scope="col" className={`px-4 py-2 font-medium ${c.align === "right" ? "text-right" : ""}`}>{c.label}</th>)}</tr>
                </thead>
                <tbody>
                  {data.r.rows.map((row, i) => (
                    <tr key={i} className="border-t border-line">
                      {data.r!.columns.map((c, j) => j === 0
                        ? <th key={c.key} scope="row" className="px-4 py-2 font-normal">{row[c.key]}</th>
                        : <td key={c.key} className={`px-4 py-2 ${c.align === "right" ? "text-right tabular-nums" : ""}`}>{row[c.key]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
