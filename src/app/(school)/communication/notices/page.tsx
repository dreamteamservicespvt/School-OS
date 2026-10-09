import type { Metadata } from "next";
import Link from "next/link";
import { withSchool } from "@/lib/db";
import { commPage } from "@/lib/communication/access";
import { readListParams, skipTake, listHref } from "@/lib/list";
import { formatDate } from "@/lib/format";
import { boardFor, PRIORITY_LABEL, STATUS_LABEL } from "@/lib/communication/notices";
import { NOTICE_FILTERS, noticeCounts, noticeWhere } from "@/lib/communication/notice-list";
import { PageHeader } from "@/components/shell/page-header";
import { ListToolbar } from "@/components/list/list-toolbar";
import { DataTable } from "@/components/list/data-table";
import { EmptyState } from "@/components/empty-state";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { PinIcon } from "@/components/icons";
import { ExportMenu } from "@/components/communication/export-menu";

export const metadata: Metadata = { title: "Notice Board" };

const STATUS_TONE: Record<string, BadgeTone> = { DRAFT: "neutral", WAITING_APPROVAL: "warning", SCHEDULED: "brand", PUBLISHED: "success", EXPIRED: "neutral", ARCHIVED: "neutral" };
const PRIORITY_TONE: Record<string, BadgeTone> = { NORMAL: "neutral", HIGH: "warning", CRITICAL: "danger" };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function NoticeBoardPage({ searchParams }: { searchParams: Search }) {
  const access = await commPage();
  const { current } = access;
  const raw = await searchParams;
  const view = raw.view === "board" ? "board" : raw.view === "manage" ? "manage" : access.full ? "manage" : "board";
  const tz = current.school.timeZone;
  const params = readListParams(raw, NOTICE_FILTERS);
  const tabs = (
    <nav aria-label="Notice views" className="mb-4 inline-flex rounded-xl border border-line bg-surface p-1">
      {[["board", "Notice board"], ["manage", access.full ? "All notices" : "My notices"]].map(([k, l]) => (
        <Link key={k} href={`/communication/notices?view=${k}`} aria-current={view === k ? "page" : undefined}
          className={`inline-flex min-h-10 items-center rounded-lg px-4 text-[15px] ${view === k ? "bg-brand-soft font-medium text-brand-text" : "text-ink-2 hover:text-ink"}`}>{l}</Link>
      ))}
    </nav>
  );
  const header = (
    <PageHeader title="Notice Board" href="/communication/notices" userId={current.user.id}>
      <div className="flex gap-2">
        {view === "manage" && <ExportMenu href={listHref("/communication/notices/export", { ...params, page: 1 }, {})} />}
        {access.canChange && <ButtonLink href="/communication/notices/new" variant="primary">New notice</ButtonLink>}
      </div>
    </PageHeader>
  );

  if (view === "board") {
    const notices = await withSchool(current.ctx, (tx) => boardFor(tx, current.ctx, current.user.id, access.roleKeys));
    return (
      <>
        {header}
        {tabs}
        {notices.length === 0 ? (
          <EmptyState title="No notices on the board" icon={<PinIcon className="size-6" />}>Notices for you appear here, Critical first, then High, then Normal.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {notices.map((n) => (
              <li key={n.id}>
                <Link href={`/communication/notices/${n.id}`} className={`block rounded-2xl border bg-surface p-4 shadow-card hover:bg-surface-2 ${n.priority === "CRITICAL" ? "border-2 border-danger" : n.priority === "HIGH" ? "border-warn" : "border-line"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    {n.priority !== "NORMAL" && <Badge tone={PRIORITY_TONE[n.priority]}>{PRIORITY_LABEL[n.priority]}</Badge>}
                    <h2 className="font-semibold">{n.title}</h2>
                  </div>
                  <p className="mt-1 line-clamp-2 text-ink-2">{n.body}</p>
                  <p className="mt-1 text-sm text-ink-2">{n.publishedAt ? formatDate(n.publishedAt, tz) : ""}{n.askAck ? " · Please acknowledge" : ""}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  const where = noticeWhere(current.ctx, access.full, params);
  const { rows, total, counts } = await withSchool(current.ctx, async (tx) => {
    const [rows, total] = await Promise.all([tx.notice.findMany({ where, orderBy: { createdAt: "desc" }, ...skipTake(params) }), tx.notice.count({ where })]);
    return { rows, total, counts: await noticeCounts(tx, rows.map((r) => r.id)) };
  });
  const filtered = Boolean(params.q || Object.keys(params.filters).length);
  return (
    <>
      {header}
      {tabs}
      <ListToolbar placeholder="Search notices" filters={[
        { key: "status", label: "Status", options: Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })) },
        { key: "priority", label: "Priority", options: Object.entries(PRIORITY_LABEL).map(([value, label]) => ({ value, label })) },
      ]} />
      <DataTable
        caption="Notices"
        rows={rows}
        total={total}
        params={params}
        path="/communication/notices"
        rowKey={(n) => n.id}
        rowHref={(n) => `/communication/notices/${n.id}`}
        empty={
          <EmptyState title={filtered ? "No notices match these filters" : "No notices yet"} icon={<PinIcon className="size-6" />}>
            {filtered ? "Change the search or filters." : "Write a circular or notice for parents, students or staff, with attachments, a priority and an expiry date."}
            {!filtered && access.canChange && <div className="mt-4"><ButtonLink href="/communication/notices/new" variant="primary">New notice</ButtonLink></div>}
          </EmptyState>
        }
        columns={[
          { key: "title", label: "Title", phone: "title", cell: (n) => <span className="font-medium">{n.title}</span> },
          { key: "audience", label: "Audience", phone: "meta", cell: (n) => n.audienceLabel },
          { key: "priority", label: "Priority", cell: (n) => <Badge tone={PRIORITY_TONE[n.priority]}>{PRIORITY_LABEL[n.priority]}</Badge> },
          { key: "published", label: "Published", phone: "meta", cell: (n) => (n.publishedAt ? formatDate(n.publishedAt, tz) : n.publishAt ? `Due ${formatDate(n.publishAt, tz)}` : "Not yet") },
          { key: "expires", label: "Expires", cell: (n) => (n.expiresOn ? formatDate(n.expiresOn, "UTC") : "") },
          { key: "read", label: "Read", cell: (n) => (n.staffCount ? `${counts.get(n.id)?.read ?? 0} of ${n.staffCount} read` : "") },
          { key: "seen", label: "Seen by parent", phone: "meta", cell: (n) => (n.guardianCount ? `Seen by ${counts.get(n.id)?.seen ?? 0} of ${n.guardianCount}` : "") },
          { key: "status", label: "Status", phone: "badge", cell: (n) => <Badge tone={STATUS_TONE[n.status]}>{STATUS_LABEL[n.status]}</Badge> },
        ]}
      />
    </>
  );
}
