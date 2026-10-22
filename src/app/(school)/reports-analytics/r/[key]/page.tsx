import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowUpDown, Download, Filter, Hourglass, Inbox, Info, Lock, PowerOff } from "lucide-react";
import { withSchool } from "@/lib/db";
import { can } from "@/lib/permissions";
import { formatTime } from "@/lib/format";
import { entryAllowed, featureOff, findEntry } from "@/lib/reports/catalogue";
import { EmptyState } from "@/components/empty-state";
import { filterParams, readFilters, uuidOr } from "@/lib/reports/filters";
import { pinsOf, recordUse } from "@/lib/reports/pins";
import { cellText, optionsFor, ReportProblem, runEntry, runWords, SHOW_ROWS } from "@/lib/reports/run";
import { financialYears } from "@/lib/finance/years";
import type { ReportEntry, Row, Table } from "@/lib/reports/types";
import { Card, CardHeader } from "@/components/ui/card";
import { Banner } from "@/components/ui/kit";
import { BackLink } from "@/components/ui/split";
import { Empty, SimpleTable } from "@/components/money/kit";
import { UrlSelect } from "@/components/money/url-filters";
import { PeriodFilter } from "@/components/list/period-filter";
import { ExportButton } from "@/components/ui/export-button";
import { buttonClass } from "@/components/ui/button";
import { Spinner } from "@/components/ui/button";
import { OldSoftwareBanner } from "@/components/money/go-live";
import { RepHead } from "../../_components/head";
import { PrepareButton, ReportMenu } from "../../_components/bits";
import { BASE, one, qs, repGuard, withQ, type SearchParams } from "../../_lib/page";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata() {
  return { title: await pageTitle("Report") };
}

const fieldCls = "flex flex-col gap-1.5 min-w-0";
const labelCls = "text-[13px] font-semibold text-ink2";

/** Who may see a report, in words (prototype "Who can see this report"). */
function whoSees(e: ReportEntry) {
  if (e.money) return "Principal, School Admin and Accountant. Teachers do not see money reports.";
  if (e.category === "Staff and HR" || e.category === "Salary") return "Principal, School Admin and HR.";
  return e.own ? "Principal and School Admin see every class. Teachers see only their own classes." : "Principal, School Admin and the roles this module's reports are for.";
}

/** One report (mod-reports.jsx ReportView): filters, the words of what is shown, the table with its total line, export. */
export default async function ReportPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: SearchParams }) {
  const p = await repGuard("all");
  const { key } = await params;
  const sp = await searchParams;
  const entry = findEntry(key);
  if (!entry) notFound();
  const href = `${BASE}/r/${entry.key}`;

  // A report closed by a School Feature says so and who can switch it on (QA PLATFORM-15).
  // A report this role may not see goes to No access, like any page the role cannot use.
  if (!entryAllowed(entry, p.a, p.current)) {
    const off = featureOff(entry, p.a, p.current, p.current.school.name);
    if (!off) redirect("/no-access?m=reports-analytics");
    return (
      <div>
        <BackLink href={BASE} label="All reports" />
        <div className="max-w-xl mx-auto mt-4 md:mt-10">
          <EmptyState Icon={PowerOff} title={off.title}>{off.body}</EmptyState>
        </div>
      </div>
    );
  }

  const me = p.current.user.id;
  const data = await withSchool(p.current.ctx, async (tx) => {
    const f = await readFilters(tx, p.current.ctx, entry, sp, p.dates, p.today, p.current.campusId ?? null);
    const options = await optionsFor(tx, p.current, entry, f);
    const heavyNow = Boolean(entry.heavy) && !f.classId && !f.sectionId;
    const runId = uuidOr(one(sp.run));
    const run = runId ? await tx.reportRun.findFirst({ where: { id: runId, userId: me, key: entry.key } }) : null;
    let table: Table | null = null;
    let refused: string | null = null;
    if (!heavyNow || run?.status === "READY") {
      try {
        table = await runEntry(tx, p.current, entry, f);
      } catch (e) {
        if (e instanceof ReportProblem) refused = e.message;
        else throw e;
      }
    }
    const [words, classes, years, fys, pins] = await Promise.all([
      runWords(tx, entry, f, p.a.own, options),
      entry.byClass && !p.a.own && f.year ? tx.schoolClass.findMany({ where: { archivedAt: null, ...(f.campusId ? { campusId: f.campusId } : {}) }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }) : [],
      !entry.money ? tx.academicYear.findMany({ where: { archivedAt: null, ...(p.current.campusId ? { campusId: p.current.campusId } : {}) }, orderBy: { startDate: "desc" }, select: { id: true, name: true, status: true } }) : [],
      entry.money ? financialYears(tx) : [],
      pinsOf(tx, p.current.ctx, "report"),
    ]);
    await recordUse(tx, p.current.ctx, entry.key);
    return { f, options, heavyNow, run, table, refused, words, classes, years, fys, pinned: pins.includes(entry.key) };
  });
  const { f, table } = data;
  const keep = filterParams(f, entry);
  const exportHref = qs(`${href}/export`, keep);
  const canExport = can(p.current.permissions, "reports-analytics", "export");
  const scheduleHref = p.a.pages.custom ? qs(`${BASE}/custom`, { schedule: entry.key }) : null;

  // A closed year: an academic year closed at year-end, a closed financial year, or dates before this year.
  const fy = data.fys.find((y) => y.id === f.fy?.id);
  const ay = data.years.find((y) => y.id === f.year?.id);
  const closed = entry.money ? fy?.status === "CLOSED" : entry.dated ? Boolean(p.year && f.to < p.year.startDate) : ay?.status === "CLOSED";

  const clsOptions = p.a.own
    ? [{ value: "", label: p.own.length === 1 ? `My class (${p.own[0].label})` : "My classes" }, ...p.own.map((s) => ({ value: s.id, label: s.label }))]
    : [{ value: "", label: "All classes" }, ...data.classes.map((c) => ({ value: c.id, label: c.name }))];
  const campusOptions = p.campuses.length > 1 ? [{ value: "", label: "All campuses" }, ...p.campuses.map((c) => ({ value: c.id, label: c.name }))] : [{ value: "", label: p.campuses[0]?.name ?? "This campus" }];
  const rows = table?.rows ?? [];
  const shown = rows.slice(0, SHOW_ROWS);
  const sortCol = table?.columns.find((c) => c.key === f.sort) ?? null;
  const numericSort = sortCol && sortCol.kind && sortCol.kind !== "text";

  return (
    <div>
      <BackLink href={BASE} label="All reports" />
      <RepHead title={entry.name} pageName={entry.name} href={href} sub={`${entry.sub} · from ${entry.category}`} tabs={false} />
      <div className="flex flex-col gap-5 lg:gap-6">
        <Card>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4">
            {entry.dated ? (
              <div className={`${fieldCls} col-span-2`}>
                <span className={labelCls}><Words k="Dates" /></span>
                <PeriodFilter {...p.dates} fallback={entry.fallback ?? "thismonth"} className="w-full" />
              </div>
            ) : entry.money ? (
              <LSelect id="rf-fy" param="fy" label="Financial year"
                options={data.fys.map((y) => ({ value: y.id === f.fy?.id && !one(sp.fy) ? "" : y.id, label: `FY ${y.name}${y.status === "CLOSED" ? " (closed)" : ""}` }))} />
            ) : (
              <LSelect id="rf-year" param="year" label="Academic year"
                options={data.years.map((y) => ({ value: y.id === p.year?.id ? "" : y.id, label: `${y.name}${y.id === p.year?.id ? " (this year)" : y.status === "CLOSED" ? " (closed)" : ""}` }))} />
            )}
            {entry.byClass
              ? <LSelect id="rf-cls" param={p.a.own ? "section" : "class"} label="Class" options={clsOptions} />
              : <StaticSelect id="rf-cls-x" label="Class" text="Whole school" />}
            {!entry.dated && <StaticSelect id="rf-dates-x" label="Dates" text="As on today" />}
            {entry.dated && entry.money && data.fys.length > 1 && (
              <LSelect id="rf-fy" param="fy" label="Financial year"
                options={data.fys.map((y) => ({ value: y.id === f.fy?.id && !one(sp.fy) ? "" : y.id, label: `FY ${y.name}${y.status === "CLOSED" ? " (closed)" : ""}` }))} />
            )}
            {p.campuses.length > 1
              ? <LSelect id="rf-campus" param="campus" label="Campus" options={campusOptions} />
              : <StaticSelect id="rf-campus" label="Campus" text={campusOptions[0].label} />}
            {data.options.map((o) => (
              <LSelect key={o.param} id={`rf-${o.param}`} param={o.param} label={o.label}
                options={o.options.map((x, i) => ({ value: i === 0 && !one(sp[o.param]) ? "" : x.value, label: x.label }))} />
            ))}
          </div>
          <div className="px-5 pb-4 -mt-1 flex items-start gap-2 text-[13px] text-ink2">
            <Filter size={15} className="text-ink3 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="min-w-0"><b className="font-semibold"><Words k="Showing:" /></b> {data.words}. {entry.money && "Money reports use the financial year, not the academic year. "}<Words k="Printed on the screen and on every file." /></p>
          </div>
        </Card>

        {closed && <Banner tone="info" title={entry.dated ? "These dates are in a closed year." : `${entry.money ? f.fy?.name : f.year?.name} is closed.`}><Words k="Figures are final and cannot change. Shown with this year’s layout." /></Banner>}
        {entry.money && entry.dated && <OldSoftwareBanner goLive={p.goLive} from={f.from} to={f.to} what="money records" />}

        {data.refused ? (
          <Card><Empty icon={Lock} title="Not open to you" body={data.refused} action={<Link href={href} className={buttonClass("secondary")}><Words k="Show my classes" /></Link>} /></Card>
        ) : data.heavyNow && data.run?.status !== "READY" ? (
          <Card>
            {!data.run || data.run.status === "FAILED" ? (
              <Empty icon={Hourglass} title="This is a large report"
                body={<>{data.run?.status === "FAILED" ? `The last try did not work: ${data.run.problem ?? "please try again"}. ` : ""}<Words k="Every class in one file. It is prepared in the background so your screen does not freeze." /></>}
                action={<div className="flex gap-2 flex-wrap justify-center items-start">
                  {canExport && <PrepareButton reportKey={entry.key} params={keep} words={data.words} href={withQ(href, sp, { run: null })} />}
                  {entry.byClass && clsOptions[1] && <Link href={withQ(href, sp, { [p.a.own ? "section" : "class"]: clsOptions[1].value, run: null })} scroll={false} className={buttonClass("secondary")}><Words k="See one class now" /></Link>}
                </div>} />
            ) : (
              <div className="flex flex-col items-center text-center px-6 py-14 gap-3 animate-fade" role="status">
                <span className="w-14 h-14 rounded-2xl bg-brand/10 text-brand grid place-items-center"><Spinner size={24} /></span>
                <h3 className="font-semibold text-[15px]"><Words k="This report is being prepared. We will notify you." /></h3>
                <p className="text-sm text-ink3 max-w-sm"><Words k="You can leave this page. A notification with the download link arrives when it is ready." /></p>
                <Link href={href + (href.includes("?") ? "&" : "?") + `run=${data.run.id}`} className={buttonClass("ghost", "sm")}><Words k="Check again" /></Link>
              </div>
            )}
          </Card>
        ) : table && (
          <Card className="overflow-hidden">
            <CardHeader title={entry.name} description={`${rows.length.toLocaleString("en-IN")} ${rows.length === 1 ? "row" : "rows"}${data.heavyNow ? " · prepared in the background" : ""}`}
              action={<div className="flex gap-1.5 items-center">
                {canExport && <ExportButton href={exportHref} size="sm" label="Excel" always />}
                {canExport && <a href={`${exportHref}${exportHref.includes("?") ? "&" : "?"}format=pdf`} className={`${buttonClass("secondary", "sm")} hidden sm:inline-flex`} download><Words k="PDF" /></a>}
                <ReportMenu exportHref={exportHref} reportKey={entry.key} name={entry.name} pinned={data.pinned} scheduleHref={scheduleHref} canExport={canExport} />
              </div>} />
            {data.run?.status === "READY" && (
              <Banner tone="ok" className="mx-4 mb-3" title="Ready."
                action={<a href={`${BASE}/runs/${data.run.id}`} className={buttonClass("secondary", "sm")}><Download size={15} aria-hidden="true" /><Words k="Download" /></a>}>
                <Words k="Prepared in the background at" /> {formatTime(data.run.readyAt ?? data.run.createdAt, p.tz)}<Words k=". The first" /> {SHOW_ROWS} <Words k="rows are below." />
              </Banner>
            )}
            {rows.length > 1 && (
              <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
                <span className="text-[12.5px] text-ink3 font-semibold" aria-hidden="true"><Words k="Sort by" /></span>
                <UrlSelect id="rf-sort" param="sort" label="Sort by" className="w-48"
                  options={[{ value: "", label: "As listed" }, ...table.columns.map((c) => ({ value: c.key, label: c.label }))]} />
                {sortCol && (
                  <Link href={withQ(href, sp, { dir: f.dir === "asc" ? "desc" : "asc", run: null })} scroll={false} className={buttonClass("ghost", "sm")}>
                    <ArrowUpDown size={15} aria-hidden="true" />{numericSort ? (f.dir === "asc" ? "Low to high" : "High to low") : (f.dir === "asc" ? "A to Z" : "Z to A")}
                  </Link>
                )}
              </div>
            )}
            {rows.length === 0 ? (
              <Empty icon={Inbox} title="Nothing for these filters"
                body={table.empty ?? "No rows for these filters. That is good news for this report, or try another class or dates."}
                action={<Link href={qs(href, entry.dated ? { period: entry.money ? "finyear" : "acyear" } : {})} scroll={false} className={buttonClass("secondary")}>{p.a.own ? "Show my classes, whole year" : "Show all classes, whole year"}</Link>} />
            ) : (
              <SimpleTable minWidth={Math.max(520, table.columns.length * 120)} caption={entry.name} rows={shown}
                cols={table.columns.map((c, i) => ({ label: c.label, right: c.kind === "money" || c.kind === "number" || c.kind === "percent", nowrap: i !== table.columns.length - 1 || (c.kind !== undefined && c.kind !== "text"), render: (r: Row) => cellText(r[c.key], c.kind) }))}
                foot={table.totals ? table.columns.map((c) => cellText(table.totals?.[c.key] ?? null, c.kind)) : undefined} />
            )}
            {table.note && <p className="px-5 py-3 text-[12.5px] text-ink3 border-t border-line">{table.note}</p>}
            {rows.length > 0 && (
              <div className="px-5 py-3 border-t border-line text-[12.5px] text-ink3 flex items-center justify-between gap-3 flex-wrap">
                <span className="tnum"><Words k="Showing" /> {shown.length} <Words k="of" /> {rows.length.toLocaleString("en-IN")}{rows.length > shown.length ? " · the file has every row" : ""}</span>
                {table.links?.map((l) => <Link key={l.href} href={l.href} className="text-[13px] font-semibold text-brand hover:underline">{l.label}</Link>)}
              </div>
            )}
          </Card>
        )}
        <details className="group self-start">
          <summary className="list-none cursor-pointer text-[13px] font-semibold text-ink2 hover:text-ink inline-flex items-center gap-1.5 [&::-webkit-details-marker]:hidden">
            <Info size={15} aria-hidden="true" /><Words k="Who can see this report" /><span className="group-open:hidden"> ▾</span><span className="hidden group-open:inline"> ▴</span>
          </summary>
          <Banner tone="info" className="mt-3">{whoSees(entry)} <Words k="Every file contains only the rows the person may see." /></Banner>
        </details>
      </div>
    </div>
  );
}

/** A filter select with its label shown above it. */
function LSelect({ id, param, label, options }: { id: string; param: string; label: string; options: { value: string; label: string }[] }) {
  return (
    <div className={fieldCls}>
      <span className={labelCls} aria-hidden="true">{label}</span>
      <UrlSelect id={id} param={param} label={label} options={options} className="w-full" />
    </div>
  );
}

/** A filter with one fixed choice, shown so the filters line up as in the design. */
function StaticSelect({ id, label, text }: { id: string; label: string; text: string }) {
  return (
    <div className={fieldCls}>
      <label htmlFor={id} className={labelCls}>{label}</label>
      <select id={id} className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-[14px] text-ink2 outline-none focus:border-brand">
        <option>{text}</option>
      </select>
    </div>
  );
}
