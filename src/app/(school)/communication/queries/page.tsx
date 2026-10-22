import type { Metadata } from "next";
import { ChartColumn, CircleCheck, Clock, Inbox, LoaderCircle, MessageSquareText, Plus, Star, Timer, TriangleAlert } from "lucide-react";
import { withSchool } from "@/lib/db";
import { commPage } from "@/lib/communication/access";
import { readListParams, skipTake, listHref, PAGE_SIZE } from "@/lib/list";
import { formatDateTime } from "@/lib/format";
import { messageSettings } from "@/lib/messaging/settings";
import { QUERY_PRIORITIES, QUERY_STATUS_LABEL, QUERY_TYPE_LABEL, queryWhere, ensureTopics } from "@/lib/communication/queries";
import { ageWords, QUERY_FILTERS, queryLabels, queryListWhere } from "@/lib/communication/query-list";
import type { QueryType } from "@/lib/messaging/settings";
import { Card, CardHeader } from "@/components/ui/card";
import { Stats } from "@/components/ui/stats";
import { Toolbar } from "@/components/ui/toolbar";
import { DataList } from "@/components/ui/data-list";
import { HBars } from "@/components/ui/charts";
import { Pill, type PillTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { UrlChips, UrlSearch, UrlSegmented, UrlSelect } from "@/components/ui/url-filters";
import { PeriodFilter } from "@/components/list/period-filter";
import { EmptyState } from "@/components/empty-state";
import { ExportMenu } from "@/components/communication/export-menu";
import { CommHead } from "../_components/comm-head";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Feedback & Queries" };

const STATUS_TONE: Record<string, PillTone> = { OPEN: "warn", IN_PROGRESS: "info", RESOLVED: "ok", CLOSED: "neutral" };
const PRIORITY_TONE: Record<string, PillTone> = { low: "neutral", normal: "neutral", high: "warn", urgent: "bad" };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function QueriesPage({ searchParams }: { searchParams: Search }) {
  const access = await commPage();
  const { current } = access;
  const tz = current.school.timeZone;
  const params = readListParams(await searchParams, QUERY_FILTERS);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const data = await withSchool(current.ctx, async (tx) => {
    await ensureTopics(tx, current.ctx);
    const base = await queryWhere(tx, current.ctx, access.full ? "all" : "own", access.scope.campusId);
    const where = queryListWhere(base, current.ctx, params, now, tz);
    const [rows, total, topics, depts, byStatus, overdue, resolvedMonth, resolvedTimes, ratings, byTopic, settings] = await Promise.all([
      tx.query.findMany({ where, orderBy: params.sort === "due" ? { dueBy: params.dir } : { createdAt: "desc" }, ...skipTake(params) }),
      tx.query.count({ where }),
      tx.queryTopic.findMany({ where: { schoolId: current.ctx.schoolId, archivedAt: null }, orderBy: { sortOrder: "asc" } }),
      tx.department.findMany({ where: { schoolId: current.ctx.schoolId, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      tx.query.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
      tx.query.count({ where: { AND: [base, { dueBy: { lt: now }, status: { in: ["OPEN", "IN_PROGRESS"] } }] } }),
      tx.query.count({ where: { AND: [base, { resolvedAt: { gte: monthStart } }] } }),
      tx.query.findMany({ where: { AND: [base, { resolvedAt: { not: null } }] }, select: { createdAt: true, resolvedAt: true }, orderBy: { resolvedAt: "desc" }, take: 200 }),
      tx.query.aggregate({ where: { AND: [base, { rating: { not: null } }] }, _avg: { rating: true }, _count: { rating: true } }),
      tx.query.groupBy({ by: ["topicId"], where: { AND: [base, { createdAt: { gte: new Date(now.getTime() - 120 * 86400_000) } }] }, _count: { _all: true } }),
      messageSettings(tx, current.ctx),
    ]);
    return { rows, total, topics, depts, byStatus, overdue, resolvedMonth, resolvedTimes, ratings, byTopic, settings, labels: await queryLabels(tx, rows) };
  });
  const { labels } = data;
  const count = (st: string) => data.byStatus.find((b) => b.status === st)?._count._all ?? 0;
  const avgDays = data.resolvedTimes.length ? data.resolvedTimes.reduce((a, q) => a + (q.resolvedAt!.getTime() - q.createdAt.getTime()), 0) / data.resolvedTimes.length / 86400_000 : null;
  const topicName = new Map(data.topics.map((t) => [t.id, t.name]));
  const topicRows = data.byTopic.map((b) => ({ k: b.topicId ? topicName.get(b.topicId) ?? "Other" : "No topic", v: b._count._all })).sort((a, b) => b.v - a.v).slice(0, 8);
  const targets = data.settings.queryTargets;
  const status = params.filters.status ?? "active";
  const filtered = Boolean(params.q || params.filters.type || params.filters.topic || params.filters.owner || params.filters.priority || params.filters.period || params.filters.from);
  const isOverdue = (q: (typeof data.rows)[number]) => Boolean(q.dueBy && q.dueBy < now && (q.status === "OPEN" || q.status === "IN_PROGRESS"));

  return (
    <>
      <CommHead access={access} page="Feedback & Queries" href="/communication/queries"
        sub={access.full ? "Questions and complaints from parents, students and staff. Each gets a number, an owner and a status." : "Queries given to you or your department, and those you logged."}
        actions={<ButtonLink href="/communication/queries/new" variant="primary" icon={Plus}><Words k="Log a query" /></ButtonLink>} />
      <div className="flex flex-col gap-5 lg:gap-6">
        <Stats items={[
          { label: "Open", value: count("OPEN").toLocaleString("en-IN"), icon: Inbox, tone: "warn", href: "/communication/queries" },
          { label: "In progress", value: count("IN_PROGRESS").toLocaleString("en-IN"), icon: LoaderCircle, tone: "info", href: "/communication/queries" },
          { label: "Overdue", value: data.overdue.toLocaleString("en-IN"), icon: Clock, tone: data.overdue ? "bad" : undefined, sub: targets.on ? "Sent up the line" : "Reply targets are off", href: "/communication/queries?status=overdue" },
          { label: "Resolved this month", value: data.resolvedMonth.toLocaleString("en-IN"), icon: CircleCheck, tone: "ok", href: "/communication/queries?status=done" },
          { label: "Time to resolve", value: avgDays === null ? "–" : `${avgDays < 1 ? avgDays.toFixed(1) : Math.round(avgDays * 10) / 10} days`, icon: Timer, sub: "Average" },
          { label: "Satisfaction", value: data.ratings._count.rating ? `${(data.ratings._avg.rating ?? 0).toFixed(1)} of 5` : "–", icon: Star, sub: `${data.ratings._count.rating} ${data.ratings._count.rating === 1 ? "rating" : "ratings"}` },
        ]} />
        <Card className="overflow-hidden min-w-0">
          <Toolbar className="flex-wrap">
            <UrlSearch placeholder="Ticket no., name or details" className="min-w-[14rem]" />
            <UrlSegmented param="status" label="Status" options={[{ value: "active", label: "Open" }, { value: "overdue", label: "Overdue" }, { value: "done", label: "Resolved" }, { value: "all", label: "All" }]} />
            <UrlSelect param="topic" label="Topic" className="md:w-40" options={[{ value: "", label: "Any topic" }, ...data.topics.map((t) => ({ value: t.id, label: t.name }))]} />
            <UrlSelect param="owner" label="Owner" className="md:w-44" options={[{ value: "", label: "Any owner" }, { value: "me", label: "Me" }, { value: "unassigned", label: "Not picked up" }, ...data.depts.map((d) => ({ value: d.id, label: d.name }))]} />
            <PeriodFilter timeZone={tz} />
          </Toolbar>
          <div className="px-3 py-2.5 border-b border-line flex items-center gap-2 flex-wrap">
            <UrlChips param="type" label="Type" options={[{ value: "", label: "All" }, ...Object.entries(QUERY_TYPE_LABEL).map(([value, label]) => ({ value, label }))]} />
            {data.total > 0 && <ExportMenu href={listHref("/communication/queries/export", { ...params, page: 1 }, {})} className="ml-auto" />}
          </div>
          <DataList
            caption="Queries and complaints"
            rows={data.rows}
            rowKey={(q) => q.id}
            href={(q) => `/communication/queries/${q.id}`}
            minWidth={880}
            paging={{ page: params.page, pageSize: PAGE_SIZE, total: data.total, href: (p) => listHref("/communication/queries", params, { page: p }) }}
            empty={
              <EmptyState bare Icon={Inbox} title={filtered || status !== "active" ? "No queries here" : "No open queries"}
                action={filtered ? <ButtonLink href="/communication/queries?status=all"><Words k="Show all" /></ButtonLink> : undefined}>
                {filtered || status !== "active" ? "Nothing matches this filter." : "Queries and complaints from calls, visits, WhatsApp or staff are logged here, each with a ticket number, an owner and a status."}
              </EmptyState>
            }
            columns={[
              { key: "id", label: "Ticket", nowrap: true, render: (q) => <span className="font-mono text-[12.5px]">{q.number}</span> },
              { key: "from", label: "From", render: (q) => <div><p className="font-semibold leading-tight">{q.fromName}</p><p className="text-[12.5px] text-ink3">{labels.about(q) || q.details.slice(0, 40)}</p></div> },
              { key: "type", label: "Type", render: (q) => <span className="text-[13px]">{QUERY_TYPE_LABEL[q.type as QueryType] ?? q.type}<span className="block text-ink3 text-[12px]">{labels.topic(q)}</span></span> },
              { key: "pri", label: "Priority", render: (q) => <Pill tone={PRIORITY_TONE[q.priority] ?? "neutral"}>{QUERY_PRIORITIES.find((p) => p.key === q.priority)?.label ?? q.priority}</Pill> },
              { key: "owner", label: "Owner", render: (q) => <span className="text-[13px]">{labels.owner(q)}</span> },
              { key: "status", label: "Status", render: (q) => <Pill tone={STATUS_TONE[q.status]} dot>{QUERY_STATUS_LABEL[q.status]}</Pill> },
              { key: "due", label: "Due by", nowrap: true, render: (q) => <span className={cx("text-[13px]", isOverdue(q) && "text-bad font-semibold")}>{q.dueBy ? formatDateTime(q.dueBy, tz) : "–"}<span className="block text-ink3 text-[12px] font-normal">{ageWords(q.createdAt, now)} <Words k="old" /></span></span> },
            ]}
            mobile={(q) => ({
              title: `${q.fromName}${labels.topic(q) ? ` · ${labels.topic(q)}` : ""}`, sub: `${q.number} · ${labels.about(q) || ageWords(q.createdAt, now)}`,
              icon: q.type === "complaint" ? TriangleAlert : MessageSquareText, iconTone: isOverdue(q) ? "bad" : (STATUS_TONE[q.status] as "warn"),
              pills: [
                <Pill key="s" tone={STATUS_TONE[q.status]} className="!h-[22px] !text-[11.5px]">{QUERY_STATUS_LABEL[q.status]}</Pill>,
                isOverdue(q) ? <Pill key="o" tone="bad" className="!h-[22px] !text-[11.5px]"><Words k="Overdue" /></Pill> : null,
                q.priority !== "normal" ? <Pill key="p" tone={PRIORITY_TONE[q.priority] ?? "neutral"} className="!h-[22px] !text-[11.5px]">{QUERY_PRIORITIES.find((p) => p.key === q.priority)?.label ?? q.priority}</Pill> : null,
              ],
            })}
          />
        </Card>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 lg:gap-6 items-start">
          <Card>
            <CardHeader title="Feedback by topic" description="All queries and feedback in the last four months" icon={ChartColumn} />
            <div className="px-5 pb-5">{topicRows.length ? <HBars rows={topicRows} unit="" labelWidth={90} ariaLabel="Queries by topic" /> : <p className="text-[13.5px] text-ink3"><Words k="No queries yet." /></p>}</div>
          </Card>
          <Card>
            <CardHeader title="Reply time targets" description={targets.on ? "Overdue queries go to the next person" : "Off. Switch them on in Message Settings."} icon={Timer} />
            <ul className="px-5 pb-4 flex flex-col gap-2 text-[13.5px]">
              {(Object.keys(QUERY_TYPE_LABEL) as QueryType[]).map((k) => (
                <li key={k} className="flex justify-between gap-3 py-1 border-b border-line/70 last:border-0">
                  <b className="font-semibold">{QUERY_TYPE_LABEL[k]}</b>
                  <span className={cx("tnum whitespace-nowrap", !targets.on && "text-ink3")}>{targets.hours[k]} <Words k="hours" /></span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
