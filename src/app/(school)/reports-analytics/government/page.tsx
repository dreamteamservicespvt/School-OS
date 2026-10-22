import Link from "next/link";
import { Building2, Download, Globe, GraduationCap, History, IdCard, Landmark, ListChecks, Play, RefreshCw, TriangleAlert, Users } from "lucide-react";
import { withSchool } from "@/lib/db";
import { can } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { momentWhere, periodFromSearch, rangeWords } from "@/lib/periods";
import { checkReturn, codesCard, govChoice, pastExports } from "@/lib/reports/government";
import { Card, CardHeader } from "@/components/ui/card";
import { Banner, Col, DataList, IconTile, Split, Toolbar } from "@/components/ui/kit";
import { Pill } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Empty } from "@/components/money/kit";
import { UrlSelect } from "@/components/money/url-filters";
import { PeriodFilter } from "@/components/list/period-filter";
import { CloseSheetButton, UrlSheet } from "@/components/ui/url-sheet";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { cx } from "@/components/ui/cx";
import { RepHead, ICON, iconOr } from "../_components/head";
import { BASE, MODULE, one, qs, repGuard, withQ, type SearchParams } from "../_lib/page";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata() {
  return { title: await pageTitle("Government Reports") };
}

const HREF = `${BASE}/government`;

/** Government Reports (19 §2, mod-reports.jsx GovernmentReports): check the data, then export in the latest format. */
export default async function GovernmentPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await repGuard("government");
  const sp = await searchParams;
  const canExport = can(p.current.permissions, MODULE, "export") && can(p.current.permissions, MODULE, "create");
  const range = periodFromSearch(sp, { ...p.dates, fallback: "last6m" });
  const checking = one(sp.check) === "1";
  const data = await withSchool(p.current.ctx, async (tx) => {
    const c = await govChoice(tx, p.current.ctx, sp, p.current.campusId ?? null);
    const [check, codes, past] = await Promise.all([
      checking && c.year ? checkReturn(tx, p.current.ctx, c.ret, c.version, c.year, c.campus) : null,
      codesCard(tx, p.current.ctx, c.year?.id ?? null),
      pastExports(tx, range ? momentWhere(range, p.tz) : null),
    ]);
    return { ...c, check, codes, past };
  }, { timeout: 60_000 });
  const { ret, version, check } = data;
  const old = version !== ret.versions[0];
  const keep = { return: ret.key === data.returns[0].key ? null : ret.key, version: old ? version : null, year: one(sp.year) || null, campus: one(sp.campus) || null };
  const checkHref = qs(HREF, { ...keep, check: "1" });
  const dates = { period: one(sp.period) || null, from: one(sp.from) || null, to: one(sp.to) || null };
  const problem = check && one(sp.problem) ? check.problems.find((x) => x.key === one(sp.problem)) ?? null : null;
  const anyway = check && one(sp.anyway) === "1" && check.problems.length > 0;
  const exportFields = { return: ret.key, version, year: data.year?.id ?? "", campus: data.campus?.id ?? "" };
  const campusOptions = p.campuses.length > 1 ? [{ value: "", label: "All campuses" }, ...p.campuses.map((c) => ({ value: c.id, label: c.name }))] : [{ value: "", label: p.campuses[0]?.name ?? "This campus" }];

  return (
    <div>
      <RepHead pageName="Government Reports" href={HREF} sub="UDISE+, APAAR and PEN, RTE and CBSE returns in the government’s latest format. Check the data first, then export." />
      <div className="flex flex-col gap-5 lg:gap-6">
        <Split side={340} className="[&>*]:min-w-0">
          <Col>
            <Card>
              <CardHeader title={ret.name} description={ret.sub} icon={iconOr(ICON, ret.icon)} action={<Pill tone={old ? "warn" : "ok"} className="hidden sm:inline-flex"><Words k="Format" /> {version}</Pill>} />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 px-5 pb-4">
                <Labelled label="Academic year">
                  <UrlSelect id="gv-year" param="year" label="Academic year" className="w-full" options={data.years.map((y) => ({ value: y.id === data.year?.id && !one(sp.year) ? "" : y.id, label: `${y.name}${y.status === "CLOSED" ? " (closed)" : ""}` }))} />
                </Labelled>
                <Labelled label="Format version" hint={old ? "An older format. The portal may not accept it." : "Latest, kept up to date by DREAM TEAM SERVICES"}>
                  <UrlSelect id="gv-ver" param="version" label="Format version" className="w-full" options={ret.versions.map((x, i) => ({ value: i === 0 ? "" : x, label: i === 0 ? `${x} (latest)` : x }))} />
                </Labelled>
                <Labelled label="Campus">
                  <UrlSelect id="gv-campus" param="campus" label="Campus" className="w-full" options={campusOptions} />
                </Labelled>
              </div>
              <div className="border-t border-line/70">
                {!check ? (
                  <Empty icon={ListChecks} title="Check the data before you export" body={`Looks for missing or wrong details in the ${version} format, for ${data.year?.name ?? "this year"}.`}
                    action={canExport ? <ButtonLink href={checkHref} scroll={false} variant="primary" icon={Play}><Words k="Run the data check" /></ButtonLink> : <p className="text-[13px] text-ink3"><Words k="You can view only. The office runs these exports." /></p>} />
                ) : check.problems.length === 0 ? (
                  <div className="p-5 flex flex-col gap-4 animate-fade">
                    <Banner tone="ok" title={`${ret.name.split(",")[0]} format ${version}. No problems found.`}><Words k="All" /> {check.rowsWords} <Words k="have every required detail." /></Banner>
                    {canExport && (
                      <div className="flex gap-2 flex-wrap">
                        <ExportForm fields={exportFields} label="Export the file" primary />
                        <ButtonLink href={checkHref} scroll={false} variant="ghost" icon={RefreshCw}><Words k="Check again" /></ButtonLink>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="animate-fade">
                    <div className="p-5 pb-3"><Banner tone="warn" title={`Format ${version}. ${check.problems.length} ${check.problems.length === 1 ? "problem" : "problems"} found.`}><Words k="Fix them and check again, or export anyway with the problems in a separate file." /></Banner></div>
                    <ul className="px-2 pb-2">
                      {check.problems.map((x) => (
                        <li key={x.key} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/60">
                          <IconTile icon={x.who === "staff" ? Users : x.who === "school" ? Building2 : GraduationCap} tone="warn" size={36} />
                          <p className="min-w-0 flex-1 text-[14px] font-semibold leading-snug">{x.text}</p>
                          <ButtonLink href={withQ(HREF, sp, { problem: x.key })} scroll={false} size="sm" variant="secondary"><Words k="Open records" /></ButtonLink>
                        </li>
                      ))}
                    </ul>
                    {canExport && (
                      <div className="px-5 py-4 border-t border-line/70 flex gap-2 flex-wrap">
                        <ButtonLink href={checkHref} scroll={false} variant="primary" icon={RefreshCw}><Words k="Check again" /></ButtonLink>
                        <ButtonLink href={withQ(HREF, sp, { anyway: "1" })} scroll={false} variant="secondary" icon={Download}><Words k="Export anyway" /></ButtonLink>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader title="Past exports" description="Also in the export log, Settings" icon={History} />
              <Toolbar>
                <PeriodFilter {...p.dates} fallback="last6m" className="w-full md:w-auto" />
                <span className="text-[12.5px] text-ink3 self-center"><Words k="Showing:" /> {range ? `${range.label} · ${rangeWords(range.from, range.to)}` : "All dates"}</span>
              </Toolbar>
              <DataList rows={data.past} rowKey={(x) => x.id} minWidth={680}
                empty={<Empty icon={History} title="No exports in these dates" body="Try a longer stretch of dates." action={<Link href={qs(HREF, { ...keep, period: "lastacyear" })} className={buttonClass("secondary")}><Words k="Show last school year" /></Link>} />}
                columns={[
                  { key: "w", label: "Date", nowrap: true, render: (x) => formatDate(x.createdAt, p.tz) },
                  { key: "e", label: "Export", render: (x) => <><b className="font-semibold block leading-tight">{x.title}</b><span className="text-[12.5px] text-ink3">{x.note}</span></> },
                  { key: "v", label: "Format", nowrap: true, render: (x) => x.version },
                  { key: "b", label: "By", nowrap: true, render: (x) => x.by },
                  { key: "f", label: "", nowrap: true, render: (x) => <span className="flex gap-1 justify-end">
                    {x.fileId && <a href={`${HREF}/file/${x.id}`} className={buttonClass("ghost", "sm")}><Download size={15} aria-hidden="true" /><Words k="File" /></a>}
                    {x.problemFileId && <a href={`${HREF}/file/${x.id}?which=problems`} className={buttonClass("ghost", "sm")}><Words k="Problems" /></a>}
                  </span> },
                ]}
                mobile={(x) => ({ title: x.title, sub: `${formatDate(x.createdAt, p.tz)} · ${x.version} · ${x.by}`, icon: Download, right: x.fileId ? <a href={`${HREF}/file/${x.id}`} className={buttonClass("ghost", "sm")} aria-label={`Download ${x.title}`}><Download size={15} aria-hidden="true" /></a> : undefined })}
                footer={`${data.past.length} ${data.past.length === 1 ? "export" : "exports"} in these dates`} />
            </Card>
          </Col>

          <Col>
            <Card>
              <CardHeader title="Government returns" description="Pick one to check and export" icon={Landmark} />
              <ul className="px-2 pb-2">
                {data.returns.map((x) => {
                  const on = x.key === ret.key;
                  const Ic = iconOr(ICON, x.icon);
                  return (
                    <li key={x.key}>
                      <Link href={qs(HREF, { ...dates, return: x.key === data.returns[0].key ? null : x.key, year: keep.year, campus: keep.campus })} scroll={false} aria-current={on ? "true" : undefined}
                        className={cx("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition", on ? "bg-brand/8" : "hover:bg-sunken/70")}>
                        <IconTile icon={Ic} tone={on ? "brand" : "neutral"} size={36} />
                        <span className="min-w-0 flex-1">
                          <span className={cx("block font-semibold text-[14px] leading-tight truncate", on && "text-brand")}>{x.name}</span>
                          <span className="block text-[12px] text-ink3 truncate"><Words k="Format" /> {x.versions[0]}</span>
                        </span>
                        {on && check && <Pill tone={check.problems.length ? "warn" : "ok"} className="!h-5 !text-[11px]">{check.problems.length ? `${check.problems.length} to fix` : "Ready"}</Pill>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
            <Card>
              <CardHeader title="School codes used" icon={IdCard} />
              <ul className="px-5 pb-4 text-[13.5px] divide-y divide-line/70">
                {data.codes.map(([k, v]) => <li key={k} className="flex justify-between gap-3 py-2"><span className="text-ink2">{k}</span><b className="font-semibold tnum font-mono text-[13px] text-right">{v}</b></li>)}
              </ul>
              <p className="px-5 pb-4 text-[12.5px] text-ink3"><Words k="Change these in" /> <Link href="/settings/school-profile" className="font-semibold text-brand hover:underline"><Words k="Settings, School Profile" /></Link>.</p>
            </Card>
            <Card>
              <CardHeader title="Direct upload to the portals" description="Where an official connection exists" icon={Globe} action={<Pill tone="neutral"><Words k="Later" /></Pill>} />
              <p className="px-5 pb-4 text-[13.5px] text-ink2"><Words k="For now, download the file and upload it on the UDISE+, APAAR or CBSE portal. Direct upload will come when the government opens these connections." /></p>
            </Card>
          </Col>
        </Split>
      </div>

      {problem && (
        <UrlSheet wide title={problem.text} sub={problem.count > problem.records.length ? `${problem.count} records · the first ${problem.records.length} are below, all are in the problems file` : `${problem.records.length} ${problem.records.length === 1 ? "record" : "records"}`}
          closeHref={withQ(HREF, sp, { problem: null })} footer={<CloseSheetButton><Words k="Close" /></CloseSheetButton>}>
          <ul className="-mx-2">
            {problem.records.slice(0, 100).map((r) => (
              <li key={`${r.id}-${r.field}`} className="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-sunken/60">
                {problem.who === "school" ? <IconTile icon={Building2} size={36} /> : <Avatar name={r.name} size={36} />}
                <span className="min-w-0 flex-1"><b className="font-semibold text-[14px] block truncate">{r.name}</b><span className="text-[12.5px] text-ink3">{r.where} <Words k="· missing or wrong:" /> {r.field}</span></span>
                <ButtonLink href={r.href} size="sm" variant="secondary">{problem.who === "school" ? "Open School Profile" : "Open profile"}</ButtonLink>
              </li>
            ))}
          </ul>
        </UrlSheet>
      )}
      {anyway && check && canExport && (
        <UrlSheet title={`Export ${ret.name} with ${check.problems.length} problems?`} sub="The file is made with what is there now. The problems go in a separate file so the office can fix them on the portal or here."
          closeHref={withQ(HREF, sp, { anyway: null })}
          footer={<><CloseSheetButton><Words k="Cancel" /></CloseSheetButton><ExportForm fields={{ ...exportFields, anyway: "1" }} label="Export anyway" primary /></>}>
          <ul className="text-[13.5px] text-ink2 flex flex-col gap-1.5 mb-1">
            {check.problems.map((x) => <li key={x.key} className="flex gap-2"><TriangleAlert size={15} className="text-warn shrink-0 mt-0.5" aria-hidden="true" />{x.text}</li>)}
          </ul>
        </UrlSheet>
      )}
    </div>
  );
}

/** A label above a filter, with an optional hint under it. */
function Labelled({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <span className="text-[13px] font-semibold text-ink2" aria-hidden="true">{label}</span>
      {children}
      {hint && <span className="text-[12px] text-ink3">{hint}</span>}
    </div>
  );
}

/** Making the file is a change (it is kept, logged and audited), so it is sent as a form. */
function ExportForm({ fields, label, primary }: { fields: Record<string, string>; label: string; primary?: boolean }) {
  return (
    <form method="post" action={`${HREF}/export`}>
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <SubmitButton variant={primary ? "primary" : "secondary"}><Download size={17} aria-hidden="true" />{label}</SubmitButton>
    </form>
  );
}
