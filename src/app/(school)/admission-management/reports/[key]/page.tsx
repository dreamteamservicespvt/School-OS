import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileClock } from "lucide-react";
import { withSchool } from "@/lib/db";
import { can } from "@/lib/permissions";
import { fullPage, BASE } from "@/lib/admission/page";
import { REPORTS, report, type ReportKey } from "@/lib/admission/reports";
import { openYears } from "@/lib/admission/settings";
import { enquiryChoices, names } from "@/lib/admission/choices";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { cx } from "@/components/ui/cx";
import { BackLink } from "../../_components/pills";
import { filterQuery, readFilters } from "../filters";
import { ReportToolbar } from "../toolbar";

export const metadata: Metadata = { title: "Admission report" };

type Props = { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ReportPage({ params, searchParams }: Props) {
  const { key } = await params;
  const meta = REPORTS.find((r) => r.key === key);
  if (!meta) notFound();
  const { current, viewer, settings, year, tz } = await fullPage();
  const raw = await searchParams;
  const read = readFilters(raw, settings, year?.id ?? null, tz);
  const data = await withSchool(current.ctx, async (tx) => {
    const [n, years, choices, campuses] = await Promise.all([
      names(tx), openYears(tx), enquiryChoices(tx, current.ctx, current, settings, tz),
      tx.campus.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ]);
    const r = read ? await report(tx, settings, viewer, key as ReportKey, read.f, n) : null;
    return { years, choices, campuses, r };
  });
  const path = `${BASE}/reports/${key}`;
  const q = filterQuery(raw);
  const yearOpts = [...data.years].sort((a, b) => (a.id === year?.id ? -1 : b.id === year?.id ? 1 : 0)).map((y) => ({ value: y.id, label: y.status === "ACTIVE" && year && y.id !== year.id ? `${y.name} mid-year` : y.name }));
  const canExport = can(current.permissions, "admission-management", "export");
  const r = data.r;
  return (
    <>
      <BackLink href={`${BASE}/reports${q ? `?${q}` : ""}`} label="Admission Reports" />
      <PageHeader title={meta.title} href={path} userId={current.user.id} sub={meta.about} />
      {!read || !r ? (
        <Card><EmptyState bare Icon={FileClock} title="No academic year is set up yet">Reports appear once an admission year is open.</EmptyState></Card>
      ) : (
        <div className="flex flex-col gap-5">
          <ReportToolbar years={yearOpts} classes={data.choices.classes} sources={settings.sourceList.map((s) => ({ value: s.key, label: s.label }))} owners={data.choices.owners}
            campuses={data.campuses.map((c) => ({ value: c.id, label: c.name }))} tz={tz} exportHref={canExport ? `${path}/export${q ? `?${q}` : ""}` : null} />
          <Card className="overflow-hidden">
            <CardHeader title={r.headline} description={read.range ? `Added ${read.range.label.toLowerCase()}` : undefined} />
            {r.rows.length === 0 ? (
              <EmptyState bare Icon={FileClock} title="Nothing to show for these filters">Try another year, date range or class.</EmptyState>
            ) : (
              <div className="overflow-x-auto scroll-thin border-t border-line/70">
                <table className="w-full text-[14px]" style={{ minWidth: Math.max(460, r.columns.length * 120) }}>
                  <caption className="sr-only">{meta.title}</caption>
                  <thead>
                    <tr className="text-[12px] text-ink3 text-left border-b border-line">
                      {r.columns.map((c) => <th key={c.key} scope="col" className={cx("py-2.5 px-4 font-semibold", c.align === "right" && "text-right")}>{c.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {r.rows.map((row, i) => (
                      <tr key={i} className="border-b border-line/70 last:border-0 hover:bg-sunken/40">
                        {r.columns.map((c, j) => j === 0
                          ? <th key={c.key} scope="row" className="py-2.5 px-4 font-medium text-left">{row[c.key]}</th>
                          : <td key={c.key} className={cx("py-2.5 px-4", c.align === "right" && "text-right tnum")}>{row[c.key]}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
