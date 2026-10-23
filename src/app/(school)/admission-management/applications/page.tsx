import type { Metadata } from "next";
import { FilePlus2, FileText, FileWarning, Hourglass, IndianRupee, SearchX } from "lucide-react";
import { withSchool } from "@/lib/db";
import { readListParams, skipTake, listHref, PAGE_SIZE } from "@/lib/list";
import { formatDate } from "@/lib/format";
import { periodFromSearch } from "@/lib/periods";
import { admissionViewYear, fullPage, viewerOnCampus, BASE } from "@/lib/admission/page";
import { backToThisYear } from "@/lib/academic/view-year";
import { ViewYearStrip } from "@/components/view-year-strip";
import { APPLICATION_FILTERS, applicationOrder, applicationWhere } from "@/lib/admission/list";
import { OPEN_STAGES, STAGES } from "@/lib/admission/applications";
import { progressOf } from "@/lib/admission/documents";
import { feeStatus } from "@/lib/admission/fee";
import { admissionYears, campusNames, classList, classRules, listYears, stageOn, withCampus } from "@/lib/admission/settings";
import { applicationScope } from "@/lib/admission/access";
import { names } from "@/lib/admission/choices";
import { phoneWords, whenWords } from "@/lib/admission/words";
import { STAGE_TONE } from "@/lib/admission/tones";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { Chips } from "@/components/ui/chips";
import { Stats } from "@/components/ui/stats";
import { Avatar } from "@/components/ui/avatar";
import { DataList, Pager } from "@/components/ui/data-list";
import { rowList, type ListRow } from "../_components/list-rows";
import { ExportMenu, UrlSearch, UrlSegmented, UrlSelect } from "@/components/ui/url-filters";
import { PeriodFilter } from "@/components/list/period-filter";
import { EmptyState } from "@/components/empty-state";
import { AdmissionHead } from "../_components/head";
import { DocPill, FeePill, StagePill } from "../_components/pills";
import { OnlineLinkButton } from "./online-link";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Applications") };
}

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const PATH = `${BASE}/applications`;
const NONE = "00000000-0000-0000-0000-000000000000";

export default async function ApplicationsPage({ searchParams }: Search) {
  const page = await fullPage();
  const { current, settings, year, tz } = page;
  const raw = await searchParams;
  // One campus chosen on the Dashboard (?campus=): that campus's applications, as the card counted them.
  const viewer = await viewerOnCampus(page, raw.campus);
  // Another year (?year=, from the Dashboard): its applications alone, read-only when it is over (gap list G36).
  const yearView = await admissionViewYear(page, viewer, raw.year);
  const params = readListParams(raw, APPLICATION_FILTERS);
  const range = periodFromSearch(raw, { timeZone: tz });
  const now = new Date();

  const data = await withSchool(current.ctx, async (tx) => {
    // Every open year of each campus the person sees (only their campus's when limited to one).
    const limit = viewer.campusId;
    const [years, admitting, classRows, campus] = await Promise.all([listYears(tx, limit, yearView), admissionYears(tx, current.ctx, settings, limit), classList(tx, limit), campusNames(tx, limit)]);
    const yearIds = years.length ? years.map((y) => y.id) : [NONE];
    const where = applicationWhere(params, { yearId: yearIds, range, timeZone: tz, campusId: limit });
    // Counts for the chips and the numbers on top ignore the stage chosen, so each chip shows its own size.
    const base = applicationWhere({ ...params, filters: { ...params.filters, stage: "" } }, { yearId: yearIds, range, timeZone: tz, campusId: limit });
    const all = { archivedAt: null, academicYearId: { in: yearIds }, ...applicationScope(viewer) };
    const classOptions = classRows.map((c) => ({ value: c.id, label: withCampus(campus, c.name, c.campusId) }));
    const [rows, total, n, rules, byStage, oldestDecision, papersMissing, feeDue, totalYear] = await Promise.all([
      tx.application.findMany({
        where, orderBy: applicationOrder(params), ...skipTake(params),
        include: {
          documents: { select: { docType: true, status: true } },
          payments: { select: { status: true, amountPaise: true, cancelledAt: true } },
          tests: { where: { archivedAt: null }, include: { test: { select: { startsAt: true, maxMarks: true } } } },
          interviews: { where: { cancelledAt: null }, select: { startsAt: true, outcome: true } },
        },
      }),
      tx.application.count({ where }),
      names(tx),
      classRules(tx),
      tx.application.groupBy({ by: ["stage"], where: base, _count: { _all: true } }),
      tx.application.findFirst({ where: { ...all, stage: "DECISION" }, orderBy: { updatedAt: "asc" }, select: { updatedAt: true } }),
      tx.application.count({ where: { ...all, stage: { in: OPEN_STAGES }, documents: { some: { required: true, status: { not: "VERIFIED" } } } } }),
      tx.application.count({ where: { ...all, stage: { notIn: ["WITHDRAWN", "REJECTED"] }, feeDuePaise: { gt: 0 }, payments: { none: { status: "CONFIRMED", cancelledAt: null } } } }),
      tx.application.count({ where: all }),
    ]);
    return { years, admitting, classOptions, rows, total, n, rules, byStage, oldestDecision, papersMissing, feeDue, totalYear };
  });

  type Row = (typeof data.rows)[number];
  const { n } = data;
  const fee = settings.applicationFeeOn;
  const tests = stageOn(settings, "test") || stageOn(settings, "interview");
  const count = (s: string) => data.byStage.find((b) => b.stage === s)?._count._all ?? 0;
  const stageTotal = data.byStage.reduce((a, b) => a + b._count._all, 0);
  // A campus's current year is "mid-year" while its admissions are open for the next year.
  const midYear = data.years.find((y) => y.status === "ACTIVE" && y.id !== year?.id && (!year || y.campusId === year.campusId)) ?? null;
  const isMidYear = (y: { id: string; status: string; campusId: string }) => y.status === "ACTIVE" && data.admitting.some((a) => a.campusId === y.campusId && a.id !== y.id);
  const yearLabel = (id: string) => {
    const y = data.years.find((x) => x.id === id);
    return y ? (isMidYear(y) ? `${y.name} mid-year` : y.name) : "";
  };
  const classes = [...data.classOptions].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
  const filtered = Boolean(params.q || Object.keys(params.filters).length || params.archived);
  const canAdd = viewer.change === "all" && data.years.length > 0 && !yearView?.past;

  const testWords = (r: Row) => {
    const t = r.tests[0];
    if (t) return t.absent ? "Test: absent" : t.marks != null ? `Test ${Number(t.marks)}/${t.test.maxMarks}` : `Test ${whenWords(t.test.startsAt, tz, now)}`;
    const i = r.interviews[0];
    if (i) return i.outcome ? `Interview: ${i.outcome === "RECOMMENDED" ? "recommended" : i.outcome === "NOT_RECOMMENDED" ? "not recommended" : "on hold"}` : `Interview ${whenWords(i.startsAt, tz, now)}`;
    return null;
  };

  const columns = [
    { key: "app", label: "Application" },
    { key: "class", label: "Class", nowrap: true },
    { key: "phone", label: "Parent’s phone", nowrap: true },
    { key: "stage", label: "Stage" },
    { key: "docs", label: "Documents" },
    ...(tests ? [{ key: "test", label: "Test or interview" }] : []),
    ...(fee ? [{ key: "fee", label: "Fee paid" }] : []),
    { key: "sub", label: "Submitted", nowrap: true },
  ];
  const listRows: ListRow[] = data.rows.map((r) => {
    const p = progressOf(r.documents, data.rules.get(r.classId)?.documents ?? []);
    const st = feeStatus(r, r.payments);
    const cls = n.classes.get(r.classId) ?? "";
    const tw = testWords(r);
    return {
      key: r.id, href: `${PATH}/${r.id}`,
      cells: [
        <div key="a" className="flex items-center gap-3 min-w-0"><Avatar name={r.fullName} size={34} /><div className="min-w-0"><p className="font-semibold leading-tight truncate">{r.fullName}{r.channel === "online" && <Pill tone="info" className="ml-2 !h-5 !text-[11px] align-middle"><Words k="Online" /></Pill>}</p><p className="text-[12px] text-ink3 font-mono">{r.applicationNo}</p></div></div>,
        <div key="c"><p className="font-medium">{cls}</p><p className="text-[12px] text-ink3">{yearLabel(r.academicYearId)}</p></div>,
        <span key="p" className="tnum text-[13.5px]">{phoneWords(r.phone)}</span>,
        <StagePill key="s" stage={r.stage} />,
        <DocPill key="d" verified={p.requiredVerified} required={p.required} />,
        ...(tests ? [<span key="t" className="text-[13px] whitespace-nowrap">{tw ?? <span className="text-ink3"><Words k="None" /></span>}</span>] : []),
        ...(fee ? [<FeePill key="f" status={st} />] : []),
        <span key="sub" className="text-[13px] tnum">{formatDate(r.createdAt, tz)}</span>,
      ],
      mobile: {
        title: r.fullName, sub: `${r.applicationNo} · ${cls} · ${formatDate(r.createdAt, tz)}`, avatar: r.fullName,
        pills: [
          <Pill key="s" tone={STAGE_TONE[r.stage] ?? "neutral"} className="!h-[22px] !text-[11.5px]">{STAGES.find((x) => x.value === r.stage)?.label}</Pill>,
          p.required ? <Pill key="d" tone={p.requiredVerified >= p.required ? "ok" : "warn"} className="!h-[22px] !text-[11.5px]"><Words k="Papers" /> {p.requiredVerified}/{p.required}</Pill> : null,
          fee && st.key === "due" ? <Pill key="f" tone="bad" className="!h-[22px] !text-[11.5px]"><Words k="Fee not paid" /></Pill> : null,
        ],
      },
    };
  });

  const chip = (v: string | null) => listHref(PATH, params, { stage: v, page: null });
  const stageChips = [
    { value: "all", label: "All stages", count: stageTotal, href: chip(null) },
    ...STAGES.filter((s) => count(s.value) > 0 || s.value === params.filters.stage).map((s) => ({ value: s.value, label: s.label, count: count(s.value), href: chip(s.value) })),
  ];
  const yearOptions = [
    { value: "", label: "All" },
    ...(year ? [{ value: year.id, label: year.name }] : []),
    ...(midYear ? [{ value: midYear.id, label: "Mid-year" }] : []),
  ];

  const actions = (
    <>
      {settings.onlineOn && !yearView && <OnlineLinkButton code={current.school.code} classes={classes} schoolName={current.school.name} feeOn={fee} yearName={year?.name ?? ""} />}
      {canAdd && <ButtonLink href={`${PATH}/new`} variant="primary" icon={FilePlus2}><Words k="New application" /></ButtonLink>}
    </>
  );

  return (
    <>
      <AdmissionHead href={PATH} sub="Admission forms filled at the counter or online, with previous school, marks and application fee" actions={actions} />
      <ViewYearStrip year={yearView} back={backToThisYear(PATH, raw)} />
      <div className="flex flex-col gap-4">
        <Stats items={[
          { label: "Applications this year", value: data.totalYear, sub: midYear && year ? `${year.name} and mid-year` : year?.name ?? "", icon: FileText },
          { label: "Waiting for a decision", value: count("DECISION"), sub: data.oldestDecision ? `Oldest ${formatDate(data.oldestDecision.updatedAt, tz)}` : "Nobody waiting", tone: count("DECISION") ? "warn" : undefined, icon: Hourglass, href: `${BASE}/decision` },
          { label: "Papers missing", value: data.papersMissing, sub: "Not yet verified", icon: FileWarning, href: listHref(PATH, params, { docs: "missing", page: null }) },
          ...(fee
            ? [{ label: "Application fee not paid", value: data.feeDue, sub: "Collect at the counter or online", tone: data.feeDue ? "bad" as const : undefined, icon: IndianRupee, href: listHref(PATH, params, { fee: "unpaid", page: null }) }]
            : [{ label: "Admitted", value: count("ADMITTED"), sub: "Students added", tone: "ok" as const, icon: FileText, href: chip("ADMITTED") }]),
        ]} />
        <Chips value={params.filters.stage ?? "all"} options={stageChips} label="Stages" />
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-2.5 p-3 md:p-4 border-b border-line/70">
            <div className="flex flex-col md:flex-row gap-2.5 md:items-center">
              <UrlSearch placeholder="Child, application number or phone" />
              {!yearView && yearOptions.length > 2 && <UrlSegmented param="year" label="Admission year" options={yearOptions} />}
              <ExportMenu href={listHref(`${PATH}/export`, params, { page: null })} />
            </div>
            <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2">
              <PeriodFilter timeZone={tz} allLabel="Any date submitted" className="col-span-2 md:col-span-1" />
              <UrlSelect param="class" label="Class" allLabel="All classes" options={classes} className="md:w-36" />
              <UrlSelect param="docs" label="Papers" allLabel="All papers" options={[{ value: "complete", label: "Complete" }, { value: "missing", label: "Missing" }]} className="md:w-36" />
              {fee && <UrlSelect param="fee" label="Fee" allLabel="Any fee" options={[{ value: "paid", label: "Fee paid" }, { value: "unpaid", label: "Not paid" }, { value: "none", label: "Not needed" }]} className="md:w-36" />}
              {settings.onlineOn && <UrlSelect param="channel" label="Filled" allLabel="Counter and online" options={[{ value: "counter", label: "At the counter" }, { value: "online", label: "Online" }]} className="md:w-44" />}
            </div>
          </div>
          <DataList caption="Applications" {...rowList(columns)} rows={listRows} minWidth={1000}
            empty={filtered ? (
              <EmptyState bare Icon={SearchX} title="No applications match" action={<ButtonLink href={PATH} variant="secondary"><Words k="Clear filters" /></ButtonLink>}>
                {params.q ? `Nobody called “${params.q}”. Try the application number or phone.` : "Try another stage, class or fee filter."}
              </EmptyState>
            ) : (
              <EmptyState bare Icon={FileText} title="No applications yet" action={canAdd ? <ButtonLink href={`${PATH}/new`} variant="primary" icon={FilePlus2}><Words k="New application" /></ButtonLink> : undefined}>
                <Words k="Fill an application at the counter, or open an enquiry and convert it, so nothing is typed twice." />
              </EmptyState>
            )}
            footer={<Pager page={params.page} pageSize={PAGE_SIZE} total={data.total} prevHref={listHref(PATH, params, { page: params.page - 1 })} nextHref={listHref(PATH, params, { page: params.page + 1 })} />} />
        </Card>
      </div>
    </>
  );
}
