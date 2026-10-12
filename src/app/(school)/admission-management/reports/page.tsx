import type { Metadata } from "next";
import { AlarmClock, CircleX, FileClock, Filter, Hourglass, Megaphone, Repeat, Timer, TrendingUp, type LucideIcon } from "lucide-react";
import { withSchool } from "@/lib/db";
import { can } from "@/lib/permissions";
import { fullPage, BASE } from "@/lib/admission/page";
import { REPORTS, report, type Report, type ReportKey } from "@/lib/admission/reports";
import { openYears } from "@/lib/admission/settings";
import { enquiryChoices, names } from "@/lib/admission/choices";
import { Card, CardHeader } from "@/components/ui/card";
import { Stats } from "@/components/ui/stats";
import { HBars, Legend, OpenLink } from "@/components/ui/rows";
import { Bars } from "@/components/ui/bars";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { cx } from "@/components/ui/cx";
import { AdmissionHead } from "../_components/head";
import { filterQuery, readFilters } from "./filters";
import { ReportToolbar } from "./toolbar";

export const metadata: Metadata = { title: "Admission Reports" };

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const PATH = `${BASE}/reports`;
const ICONS: Record<ReportKey, LucideIcon> = { pipeline: Filter, sources: Megaphone, conversion: Repeat, processing: Timer, pending: FileClock, "follow-ups": AlarmClock, loss: CircleX };
const SUBS: Record<ReportKey, string> = {
  pipeline: "Enquiries by class", sources: "Admitted of enquiries, by first source", conversion: "Applications against enquiries by month",
  processing: "Average days, start to finish", pending: "Oldest first, with what is missing", "follow-ups": "Done and overdue, by owner", loss: "Lost enquiries by reason",
};
const num = (v: string | number | undefined) => Number(v ?? 0) || 0;
const weighted = (rows: Report["rows"], count: string, value: string) => {
  const n = rows.reduce((p, r) => p + num(r[count]), 0);
  return n ? Math.round((rows.reduce((p, r) => p + num(r[count]) * num(r[value]), 0) / n) * 10) / 10 : null;
};
const days = (d: number | null) => (d === null ? "None yet" : `${d} ${d === 1 ? "day" : "days"}`);

export default async function ReportsPage({ searchParams }: Search) {
  const { current, viewer, settings, year, tz } = await fullPage();
  const raw = await searchParams;
  const read = readFilters(raw, settings, year?.id ?? null, tz);
  const data = await withSchool(current.ctx, async (tx) => {
    const [n, years, choices, campuses] = await Promise.all([
      names(tx), openYears(tx), enquiryChoices(tx, current.ctx, current, settings, tz),
      tx.campus.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ]);
    const all = read ? await Promise.all(REPORTS.map((r) => report(tx, settings, viewer, r.key, read.f, n))) : [];
    return { years, choices, campuses, reports: new Map(all.map((r) => [r.key as ReportKey, r])) };
  });

  const q = filterQuery(raw);
  const yearOpts = [...data.years].sort((a, b) => (a.id === year?.id ? -1 : b.id === year?.id ? 1 : 0)).map((y) => ({ value: y.id, label: y.status === "ACTIVE" && year && y.id !== year.id ? `${y.name} mid-year` : y.name }));
  const R = (k: ReportKey) => data.reports.get(k)!;

  const body = (k: ReportKey) => {
    const r = R(k);
    if (r.rows.length === 0) return <p className="text-[13.5px] text-ink3 py-2">Nothing yet for these filters.</p>;
    if (k === "pipeline") {
      const by = new Map<string, number>();
      for (const row of r.rows) by.set(String(row.class), (by.get(String(row.class)) ?? 0) + num(row.total));
      return <HBars rows={[...by.entries()].slice(0, 8).map(([c, v]) => ({ k: c, v }))} unit="" labelWidth={80} />;
    }
    if (k === "sources") {
      const top = Math.max(1, ...r.rows.map((x) => num(x.enquiries)));
      return (
        <ul className="flex flex-col gap-2">
          {r.rows.slice(0, 7).map((x) => (
            <li key={String(x.source)} className="grid grid-cols-[84px_1fr_116px] items-center gap-3 text-[13px]">
              <span className="text-ink2 font-medium truncate" title={String(x.source)}>{x.source}</span>
              <span className="relative h-3 rounded-full bg-sunken overflow-hidden" aria-hidden="true">
                <span className="absolute inset-y-0 left-0 rounded-full bg-ink3/25" style={{ width: `${(num(x.enquiries) / top) * 100}%` }} />
                <span className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${(num(x.admitted) / top) * 100}%` }} />
              </span>
              <span className="text-right tnum"><b className="font-semibold">{x.admitted}</b><span className="text-ink3"> of {x.enquiries} · {x.rate}</span></span>
            </li>
          ))}
        </ul>
      );
    }
    if (k === "conversion") {
      const by = new Map<string, { v: number; v2: number }>();
      for (const row of r.rows) { const m = String(row.month).split(" ")[0]; const g = by.get(m) ?? { v: 0, v2: 0 }; g.v += num(row.applications); g.v2 += num(row.enquiries); by.set(m, g); }
      return <><Bars data={[...by.entries()].slice(-6).map(([m, g]) => ({ k: m, ...g }))} ariaLabel="Applications against enquiries by month" /><div className="mt-2"><Legend items={[["bg-brand", "Applications"], ["bg-ink3/25", "Enquiries"]]} /></div></>;
    }
    if (k === "processing") {
      const tiles: [string, string, string][] = [
        [days(weighted(r.rows, "admitted", "toAdmit")), "Enquiry to admission", `${r.rows.reduce((p, x) => p + num(x.admitted), 0)} admitted`],
        [days(weighted(r.rows, "decided", "toDecide")), "Application to decision", `${r.rows.reduce((p, x) => p + num(x.decided), 0)} decided`],
      ];
      return (
        <div className="grid grid-cols-2 gap-3">
          {tiles.map(([v, l, s]) => <div key={l} className="rounded-xl bg-sunken/60 p-3"><p className="font-display font-semibold text-[20px] tnum">{v}</p><p className="text-[12.5px] font-semibold">{l}</p><p className="text-[12px] text-ink3">{s}</p></div>)}
        </div>
      );
    }
    if (k === "pending") {
      return (
        <ul className="flex flex-col divide-y divide-line/70">
          {[...r.rows].sort((a, b) => num(b.age) - num(a.age)).slice(0, 5).map((x) => (
            <li key={String(x.number)} className="flex items-center gap-3 py-2 text-[13.5px]">
              <span className="flex-1 min-w-0"><b className="font-semibold">{x.name}</b> <span className="text-ink3">· {x.class}</span><span className="block text-[12.5px] text-ink3 truncate">{x.missing === "Nothing" ? x.stage : `Missing: ${x.missing}`}</span></span>
              <span className={cx("font-semibold tnum shrink-0", num(x.age) > 14 && "text-warn")}>{x.age} {num(x.age) === 1 ? "day" : "days"}</span>
            </li>
          ))}
        </ul>
      );
    }
    if (k === "follow-ups") {
      return (
        <ul className="flex flex-col gap-2.5">
          {r.rows.slice(0, 5).map((x) => (
            <li key={String(x.owner)} className="flex items-center gap-3 text-[13.5px]">
              <Avatar name={String(x.owner)} size={30} />
              <span className="flex-1 font-semibold truncate">{x.owner}</span>
              <span className="tnum"><b className="font-semibold">{x.done}</b> <span className="text-ink3">done</span></span>
              {num(x.overdue) > 0 ? <Pill tone="bad" className="!h-5 !text-[11px]">{x.overdue} overdue</Pill> : <Pill tone="ok" className="!h-5 !text-[11px]">On time</Pill>}
            </li>
          ))}
        </ul>
      );
    }
    return <HBars rows={r.rows.slice(0, 7).map((x) => ({ k: String(x.reason), v: num(x.count) }))} unit="" labelWidth={104} />;
  };

  let stats = null;
  if (read) {
    const conv = R("conversion").rows;
    const enq = conv.reduce((p, x) => p + num(x.enquiries), 0);
    const adm = conv.reduce((p, x) => p + num(x.admitted), 0);
    const pend = R("pending").rows;
    const proc = R("processing").rows;
    stats = <Stats items={[
      { label: "Conversion", value: enq ? `${Math.round((adm / enq) * 1000) / 10}%` : "0%", sub: `${adm} admitted of ${enq} ${enq === 1 ? "enquiry" : "enquiries"}`, icon: TrendingUp, tone: "brand" },
      { label: "Enquiry to admission", value: days(weighted(proc, "admitted", "toAdmit")), sub: "Average", icon: Timer },
      { label: "Application to decision", value: days(weighted(proc, "decided", "toDecide")), sub: "Average", icon: Hourglass },
      { label: "Pending applications", value: pend.length, sub: `${pend.filter((x) => num(x.age) > 14).length} older than 2 weeks`, icon: FileClock, tone: pend.some((x) => num(x.age) > 14) ? "warn" : undefined, href: `${BASE}/applications` },
    ]} />;
  }

  return (
    <>
      <AdmissionHead href={PATH} sub="Where enquiries come from, how many join, and applications still pending" />
      {!read ? (
        <Card><EmptyState bare Icon={FileClock} title="No academic year is set up yet">Reports appear once an admission year is open.</EmptyState></Card>
      ) : (
        <div className="flex flex-col gap-5 lg:gap-6">
          <ReportToolbar years={yearOpts} classes={data.choices.classes} sources={settings.sourceList.map((s) => ({ value: s.key, label: s.label }))} owners={data.choices.owners}
            campuses={data.campuses.map((c) => ({ value: c.id, label: c.name }))} tz={tz} exportHref={null} />
          {stats}
          <div className="grid lg:grid-cols-2 gap-5 lg:gap-6">
            {REPORTS.map((r) => (
              <Card key={r.key}>
                <CardHeader title={r.title} description={SUBS[r.key]} icon={ICONS[r.key]} action={<OpenLink href={`${PATH}/${r.key}${q ? `?${q}` : ""}`} />} />
                <div className="px-5 pb-5">{body(r.key)}</div>
              </Card>
            ))}
          </div>
          {can(current.permissions, "admission-management", "export") && <p className="text-[12.5px] text-ink3">Open a report to export it to Excel, CSV or PDF with these filters.</p>}
        </div>
      )}
    </>
  );
}
