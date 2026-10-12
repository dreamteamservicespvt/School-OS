import type { Metadata } from "next";
import { withSchool } from "@/lib/db";
import { commPage } from "@/lib/communication/access";
import { readListParams, skipTake, listHref } from "@/lib/list";
import { formatDateTime } from "@/lib/format";
import { QUERY_PRIORITIES, QUERY_STATUS_LABEL, QUERY_TYPE_LABEL, queryWhere, ensureTopics } from "@/lib/communication/queries";
import { ageWords, QUERY_FILTERS, queryLabels, queryListWhere } from "@/lib/communication/query-list";
import type { QueryType } from "@/lib/messaging/settings";
import { PageHeader } from "@/components/shell/page-header";
import { ListToolbar } from "@/components/list/list-toolbar";
import { DataTable } from "@/components/list/data-table";
import { EmptyState } from "@/components/empty-state";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { MessageIcon } from "@/components/icons";
import { ExportMenu } from "@/components/communication/export-menu";

export const metadata: Metadata = { title: "Feedback & Queries" };

const STATUS_TONE: Record<string, BadgeTone> = { OPEN: "brand", IN_PROGRESS: "warning", RESOLVED: "success", CLOSED: "neutral" };
const PRIORITY_TONE: Record<string, BadgeTone> = { low: "neutral", normal: "neutral", high: "warning", urgent: "danger" };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function QueriesPage({ searchParams }: { searchParams: Search }) {
  const access = await commPage();
  const { current } = access;
  const tz = current.school.timeZone;
  const params = readListParams(await searchParams, QUERY_FILTERS);
  const now = new Date();
  const data = await withSchool(current.ctx, async (tx) => {
    await ensureTopics(tx, current.ctx);
    const where = queryListWhere(await queryWhere(tx, current.ctx, access.full ? "all" : "own"), current.ctx, params, now, current.school.timeZone);
    const [rows, total, topics, depts] = await Promise.all([
      tx.query.findMany({ where, orderBy: params.sort === "due" ? { dueBy: params.dir } : { createdAt: params.sort === "age" && params.dir === "asc" ? "desc" : params.sort === "age" ? "asc" : "desc" }, ...skipTake(params) }),
      tx.query.count({ where }),
      tx.queryTopic.findMany({ where: { schoolId: current.ctx.schoolId, archivedAt: null }, orderBy: { sortOrder: "asc" } }),
      tx.department.findMany({ where: { schoolId: current.ctx.schoolId, archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    return { rows, total, topics, depts, labels: await queryLabels(tx, rows) };
  });
  const { labels } = data;
  const filtered = Boolean(params.q || Object.keys(params.filters).length);

  return (
    <>
      <PageHeader title="Feedback & Queries" href="/communication/queries" userId={current.user.id}>
        <div className="flex gap-2">
          {data.total > 0 && <ExportMenu href={listHref("/communication/queries/export", { ...params, page: 1 }, {})} />}
          {access.canChange && <ButtonLink href="/communication/queries/new" variant="primary">Log a query</ButtonLink>}
        </div>
      </PageHeader>
      <ListToolbar period={{ timeZone: current.school.timeZone }} placeholder="Search ticket, name or details" showArchived={false} filters={[
        { key: "status", label: "Status", options: [{ value: "active", label: "Open and In progress" }, ...Object.entries(QUERY_STATUS_LABEL).map(([value, label]) => ({ value, label })), { value: "all", label: "Any status" }] },
        { key: "type", label: "Type", options: Object.entries(QUERY_TYPE_LABEL).map(([value, label]) => ({ value, label })) },
        { key: "priority", label: "Priority", options: QUERY_PRIORITIES.map((p) => ({ value: p.key, label: p.label })) },
        { key: "topic", label: "Topic", options: data.topics.map((t) => ({ value: t.id, label: t.name })) },
        { key: "owner", label: "Owner", options: [{ value: "me", label: "Me" }, { value: "unassigned", label: "Not picked up" }, ...data.depts.map((d) => ({ value: d.id, label: d.name }))] },
        { key: "overdue", label: "Overdue", options: [{ value: "1", label: "Overdue only" }] },
      ]} />
      {!params.filters.status && <p className="-mt-2 mb-3 text-sm text-ink-2">Showing Open and In progress. Choose &ldquo;Any status&rdquo; to see all.</p>}
      <DataTable
        caption="Queries and complaints"
        rows={data.rows}
        total={data.total}
        params={params}
        path="/communication/queries"
        rowKey={(q) => q.id}
        rowHref={(q) => `/communication/queries/${q.id}`}
        empty={
          <EmptyState title={filtered ? "No queries match these filters" : "No open queries"} icon={<MessageIcon className="size-6" />}>
            {filtered ? "Change the search or filters." : "Queries and complaints from phone calls, visits, WhatsApp or staff are logged here, each with a ticket number, an owner and a status."}
            {access.canChange && <div className="mt-4"><ButtonLink href="/communication/queries/new" variant="primary">Log a query</ButtonLink></div>}
          </EmptyState>
        }
        columns={[
          { key: "number", label: "Ticket", phone: "meta", cell: (q) => <span className="font-mono text-sm">{q.number}</span> },
          { key: "from", label: "From", phone: "title", cell: (q) => <span className="font-medium">{q.fromName}</span> },
          { key: "about", label: "About", phone: "meta", cell: (q) => [labels.about(q), labels.topic(q)].filter(Boolean).join(" · ") || q.details.slice(0, 40) },
          { key: "type", label: "Type", cell: (q) => QUERY_TYPE_LABEL[q.type as QueryType] ?? q.type },
          { key: "priority", label: "Priority", cell: (q) => <Badge tone={PRIORITY_TONE[q.priority] ?? "neutral"}>{QUERY_PRIORITIES.find((p) => p.key === q.priority)?.label ?? q.priority}</Badge> },
          { key: "owner", label: "Owner", phone: "meta", cell: (q) => labels.owner(q) },
          { key: "age", label: "Age", sortable: true, cell: (q) => ageWords(q.createdAt, now) },
          { key: "due", label: "Due by", sortable: true, cell: (q) => (q.dueBy ? <span className={q.dueBy < now && (q.status === "OPEN" || q.status === "IN_PROGRESS") ? "font-medium text-danger" : ""}>{formatDateTime(q.dueBy, tz)}</span> : "") },
          { key: "status", label: "Status", phone: "badge", cell: (q) => <Badge tone={STATUS_TONE[q.status]}>{QUERY_STATUS_LABEL[q.status]}</Badge> },
        ]}
      />
    </>
  );
}
