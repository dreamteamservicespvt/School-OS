import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, PartyPopper, Plus, Settings2, Smile, Users } from "lucide-react";
import { withSchool } from "@/lib/db";
import { commOfficePage } from "@/lib/communication/access";
import { COMM_FEATURES } from "@/lib/communication/features";
import { readListParams, skipTake, listHref, PAGE_SIZE } from "@/lib/list";
import { formatDate } from "@/lib/format";
import { shownStatus, SURVEY_EXAMPLES, SURVEY_FILTERS, surveyCampusWhere, surveyWhere } from "@/lib/communication/surveys";
import { Card, CardHeader } from "@/components/ui/card";
import { Toolbar } from "@/components/ui/toolbar";
import { DataList } from "@/components/ui/data-list";
import { Pill } from "@/components/ui/badge";
import { STATUS_LABEL, STATUS_TONE } from "./status";
import { ButtonLink } from "@/components/ui/button";
import { Progress } from "@/components/ui/charts";
import { UrlSearch, UrlSegmented } from "@/components/ui/url-filters";
import { PeriodFilter } from "@/components/list/period-filter";
import { EmptyState } from "@/components/empty-state";
import { ExportMenu } from "@/components/communication/export-menu";
import { CommHead } from "../_components/comm-head";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Surveys" };

const EXAMPLE_ICON = { parents: Smile, staff: Users, event: PartyPopper } as const;

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function SurveysPage({ searchParams }: { searchParams: Search }) {
  const access = await commOfficePage();
  const { current } = access;
  const tz = current.school.timeZone;
  const head = (actions?: React.ReactNode) => (
    <CommHead access={access} page="Surveys" href="/communication/surveys" sub="Short surveys for parents and staff. Each person answers once, through a link in a message." actions={actions} />
  );
  if (!current.features.has(COMM_FEATURES.surveys)) {
    return (
      <>
        {head()}
        <Card><EmptyState Icon={ClipboardList} title="Surveys are switched off" action={<ButtonLink href="/communication/settings" icon={Settings2}><Words k="Message Settings" /></ButtonLink>}>
          <Words k="Switch them on under Optional pages in Message Settings." />
        </EmptyState></Card>
      </>
    );
  }
  const raw = await searchParams;
  const params = readListParams(raw, SURVEY_FILTERS);
  const where = surveyWhere(current.ctx, params, tz);
  const now = new Date();
  const data = await withSchool(current.ctx, async (tx) => {
    // A person limited to one campus sees their campus's surveys only.
    const campus = await surveyCampusWhere(tx, current.ctx, access.scope.campusId);
    const [rows, total] = await Promise.all([
      tx.survey.findMany({ where: { AND: [where, campus] }, orderBy: [{ sentAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }], ...skipTake(params) }),
      tx.survey.count({ where: { AND: [where, campus] } }),
    ]);
    const answered = rows.length ? await tx.surveyInvite.groupBy({ by: ["surveyId"], where: { schoolId: current.ctx.schoolId, surveyId: { in: rows.map((r) => r.id) }, answeredAt: { not: null } }, _count: { _all: true } }) : [];
    return { rows, total, answered: new Map(answered.map((a) => [a.surveyId, a._count._all])) };
  });
  const filtered = Boolean(params.q || params.filters.status || params.filters.period || params.filters.from);
  type Row = (typeof data.rows)[number];
  const status = (s: Row) => shownStatus(s, tz, now);
  const resp = (s: Row) => data.answered.get(s.id) ?? 0;
  const sentCell = (s: Row) => (
    <span className="tnum text-[13px]">{s.sentAt ? formatDate(s.sentAt, tz) : "–"}
      <span className="block text-ink3 text-[12px]">{status(s) === "OPEN" ? (s.closesOn ? `closes ${formatDate(s.closesOn, "UTC")}` : "open") : status(s) === "CLOSED" ? `closed ${formatDate(s.closedAt ?? s.closesOn ?? now, s.closedAt ? tz : "UTC")}` : "not sent"}</span>
    </span>
  );

  return (
    <>
      {head(<ButtonLink href="/communication/surveys/new" variant="primary" icon={Plus}><Words k="New survey" /></ButtonLink>)}
      <div className="flex flex-col gap-5 lg:gap-6">
        <div>
          <p className="eyebrow text-ink3 mb-2.5"><Words k="Start from an example" /></p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {SURVEY_EXAMPLES.map((e) => {
              const Icon = EXAMPLE_ICON[e.key as keyof typeof EXAMPLE_ICON] ?? ClipboardList;
              return (
                <Link key={e.key} href={`/communication/surveys/new?example=${e.key}`} className="rounded-2xl border border-line bg-surface shadow-card p-4 flex items-center gap-3 text-left hover:border-brand/40 transition">
                  <span className="w-11 h-11 rounded-xl bg-brand/10 text-brand grid place-items-center shrink-0"><Icon size={20} aria-hidden="true" /></span>
                  <span className="min-w-0"><span className="block font-semibold text-[14.5px]">{e.title}</span><span className="block text-[12.5px] text-ink3">{e.sub}</span></span>
                </Link>
              );
            })}
          </div>
        </div>
        <Card className="overflow-hidden min-w-0">
          <CardHeader title="Surveys" description="Each person answers once · drafts always show" icon={ClipboardList}
            action={data.total > 0 ? <ExportMenu href={listHref("/communication/surveys/export", { ...params, page: 1 }, {})} /> : undefined} />
          <Toolbar className="flex-wrap">
            <UrlSearch placeholder="Survey title or group" className="min-w-[14rem]" />
            <UrlSegmented param="status" label="Status" options={[{ value: "", label: "All" }, { value: "OPEN", label: "Open" }, { value: "DRAFT", label: "Drafts" }, { value: "CLOSED", label: "Closed" }]} />
            <PeriodFilter timeZone={tz} />
          </Toolbar>
          <DataList
            caption="Surveys"
            rows={data.rows}
            rowKey={(s) => s.id}
            href={(s) => `/communication/surveys/${s.id}`}
            minWidth={720}
            paging={{ page: params.page, pageSize: PAGE_SIZE, total: data.total, href: (p) => listHref("/communication/surveys", params, { page: p }) }}
            empty={
              <EmptyState bare Icon={ClipboardList} title={filtered ? "No survey sent in these dates" : "No surveys yet"}
                action={<ButtonLink href="/communication/surveys/new" icon={Plus}><Words k="New survey" /></ButtonLink>}>
                {filtered ? "Pick a longer period, like This year." : "Start from an example above, or write your own."}
              </EmptyState>
            }
            columns={[
              { key: "title", label: "Survey", render: (s) => <div className="min-w-[220px]"><p className="font-semibold">{s.title}</p><p className="text-[12.5px] text-ink3">{s.number} · {s.audienceLabel}{s.anonymous ? " · anonymous" : ""}</p></div> },
              { key: "sent", label: "Sent", nowrap: true, render: sentCell },
              { key: "resp", label: "Responses", render: (s) => s.status === "DRAFT" ? <span className="text-ink3">–</span> : <div className="w-40"><p className="text-[13px] tnum"><b className="font-semibold">{resp(s).toLocaleString("en-IN")}</b> <span className="text-ink3"><Words k="of" /> {s.invitedCount.toLocaleString("en-IN")}</span></p><Progress value={s.invitedCount ? (resp(s) / s.invitedCount) * 100 : 0} className="mt-1" /></div> },
              { key: "status", label: "Status", nowrap: true, render: (s) => <Pill tone={STATUS_TONE[status(s)]} dot>{STATUS_LABEL[status(s)]}</Pill> },
            ]}
            mobile={(s) => ({
              title: s.title,
              sub: s.status === "DRAFT" ? `${s.audienceLabel} · not sent` : `${s.audienceLabel} · ${resp(s).toLocaleString("en-IN")} of ${s.invitedCount.toLocaleString("en-IN")} answered`,
              icon: ClipboardList, iconTone: status(s) === "OPEN" ? "ok" : status(s) === "CLOSED" ? "info" : "brand",
              pills: [<Pill key="s" tone={STATUS_TONE[status(s)]} className="!h-[22px] !text-[11.5px]">{STATUS_LABEL[status(s)]}</Pill>],
            })}
          />
        </Card>
      </div>
    </>
  );
}
