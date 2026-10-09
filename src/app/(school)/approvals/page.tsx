import type { Metadata } from "next";
import Link from "next/link";
import type { ApprovalStatus, Prisma } from "@prisma/client";
import { requireCurrent } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { formatDateTime, formatRupees } from "@/lib/format";
import { listHref, readListParams, skipTake, PAGE_SIZE } from "@/lib/list";
import { OPEN_STATUSES, REQUEST_TYPES, requestLabel, workingDaysBetween } from "@/lib/approvals";
import { VIEWS, decidableIds, inboxWhere, isOverseer, statusWords, type HistoryLine, type InboxView } from "@/lib/approvals-inbox";
import { rulesInUse } from "@/lib/settings/approval-rules";
import { PageHeader } from "@/components/shell/page-header";
import { ListToolbar } from "@/components/list/list-toolbar";
import { EmptyState } from "@/components/empty-state";
import { ApprovalIcon } from "@/components/icons";
import { ApprovalList, type ApprovalRow } from "./approval-list";

export const metadata: Metadata = { title: "Approvals" };

const STATUS_FILTER: Record<string, ApprovalStatus[]> = {
  open: ["WAITING", "ESCALATED"],
  approved: ["APPROVED"],
  rejected: ["REJECTED"],
  withdrawn: ["WITHDRAWN"],
};

/** One list of every request: waiting for me, asked by me, and all I may see (00-global.md §3). */
export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const current = await requireCurrent();
  const params = readListParams(await searchParams, ["view", "type", "status"]);
  const view: InboxView = VIEWS.some((v) => v.value === params.filters.view) ? (params.filters.view as InboxView) : "mine";
  const roleKeys = current.roles.map((r) => r.key);
  const tz = current.school.timeZone;
  const { skip, take } = skipTake(params);

  const data = await withSchool(current.ctx, async (tx) => {
    const base = await inboxWhere(tx, current.ctx, roleKeys, view);
    const extra: Prisma.ApprovalWhereInput[] = [];
    if (params.filters.type) extra.push({ type: params.filters.type });
    if (params.filters.status && STATUS_FILTER[params.filters.status]) extra.push({ status: { in: STATUS_FILTER[params.filters.status] } });
    if (params.q) extra.push({ summary: { contains: params.q, mode: "insensitive" } });
    const where: Prisma.ApprovalWhereInput = { AND: [base, ...extra] };
    const [rows, total, counts, rules] = await Promise.all([
      tx.approval.findMany({ where, orderBy: [{ status: "asc" }, { createdAt: view === "mine" ? "asc" : "desc" }], skip, take }),
      tx.approval.count({ where }),
      Promise.all(VIEWS.map(async (v) => [v.value, await tx.approval.count({ where: { AND: [await inboxWhere(tx, current.ctx, roleKeys, v.value), { status: { in: OPEN_STATUSES } }] } })] as const)),
      rulesInUse(tx, current.school.id),
    ]);
    const decidable = await decidableIds(tx, current.ctx, rows);
    const ids = [...new Set(rows.flatMap((r) => [r.askedById, r.currentApproverId].filter((x): x is string => Boolean(x))))];
    const people = await tx.userLogin.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } });
    const roles = await tx.role.findMany({ select: { key: true, name: true } });
    return { rows, total, counts: new Map(counts), rules, decidable, people: new Map(people.map((p) => [p.id, p.displayName])), roles: new Map(roles.map((r) => [r.key, r.name])) };
  });

  const now = new Date();
  const rows: ApprovalRow[] = data.rows.map((a) => {
    const open = OPEN_STATUSES.includes(a.status);
    const last = [...((a.history as HistoryLine[]) ?? [])].reverse()[0];
    const days = data.rules.find((r) => r.type === a.type)?.escalateAfterDays ?? 2;
    return {
      id: a.id,
      summary: a.summary,
      typeLabel: requestLabel(a.type),
      amount: a.amountPaise !== null ? formatRupees(a.amountPaise) : null,
      amountPaise: a.amountPaise?.toString() ?? null,
      askedBy: a.askedById === current.user.id ? "you" : data.people.get(a.askedById) ?? "someone",
      asked: formatDateTime(a.createdAt, tz),
      status: statusWords(a.status, a.history),
      waitingFor: open ? (a.currentApproverId ? (a.currentApproverId === current.user.id ? "you" : data.people.get(a.currentApproverId) ?? "a person") : a.currentApproverRole ? `the ${data.roles.get(a.currentApproverRole) ?? a.currentApproverRole}` : null) : null,
      decidable: data.decidable.has(a.id),
      overdue: open && workingDaysBetween(new Date(last?.at ?? a.createdAt), now) >= days,
    };
  });
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const filtered = Boolean(params.q || params.filters.type || params.filters.status);

  return (
    <>
      <PageHeader title="Approvals" href="/approvals" userId={current.user.id} />
      <nav aria-label="Which requests" className="mb-4 flex flex-wrap gap-2 text-sm">
        {VIEWS.map((v) => (
          <Link key={v.value} href={listHref("/approvals", { ...params, page: 1 }, { view: v.value === "mine" ? null : v.value })} aria-current={view === v.value ? "page" : undefined}
            className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 ${view === v.value ? "border-brand bg-brand-soft font-medium text-brand-text" : "border-line bg-surface hover:border-brand"}`}>
            {v.value === "all" && isOverseer(roleKeys) ? "All requests" : v.label}
            <span className="rounded-full bg-surface-3 px-2 text-xs text-ink">{data.counts.get(v.value) ?? 0}</span>
          </Link>
        ))}
      </nav>
      <ListToolbar placeholder="Search requests" showArchived={false} filters={[
        { key: "status", label: "Status", options: [{ value: "open", label: "Waiting" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected or sent back" }, { value: "withdrawn", label: "Withdrawn" }] },
        { key: "type", label: "Kind", options: REQUEST_TYPES.map((t) => ({ value: t.key, label: t.label })) },
      ]} />
      {rows.length === 0 ? (
        filtered ? (
          <EmptyState title="Nothing matches these filters">Change the search or <Link href={view === "mine" ? "/approvals" : `/approvals?view=${view}`} className="font-medium text-brand-text underline">reset the filters</Link>.</EmptyState>
        ) : view === "mine" ? (
          <EmptyState title="Nothing is waiting for you" icon={<ApprovalIcon className="size-6" />}>
            Leave, refunds, discounts, admissions, certificates and other requests that need your yes or no appear here, with a count on the top bar.
          </EmptyState>
        ) : view === "asked" ? (
          <EmptyState title="You have not asked for anything yet">Requests you send, such as leave or a refund, appear here so you can follow them.</EmptyState>
        ) : (
          <EmptyState title="No requests yet" icon={<ApprovalIcon className="size-6" />}>Requests from every module appear here once people start asking.</EmptyState>
        )
      ) : (
        <>
          <ApprovalList rows={rows} />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-2">
            <span>{data.total} request{data.total === 1 ? "" : "s"}{pages > 1 ? ` · page ${params.page} of ${pages}` : ""}</span>
            {pages > 1 && (
              <span className="flex gap-2">
                {params.page > 1 && <Link href={listHref("/approvals", params, { page: params.page - 1 })} className="inline-flex min-h-11 items-center rounded-lg border border-line-strong px-3 font-medium text-ink hover:bg-surface-2">Previous</Link>}
                {params.page < pages && <Link href={listHref("/approvals", params, { page: params.page + 1 })} className="inline-flex min-h-11 items-center rounded-lg border border-line-strong px-3 font-medium text-ink hover:bg-surface-2">Next</Link>}
              </span>
            )}
          </div>
        </>
      )}
      {isOverseer(roleKeys) && <p className="mt-4 text-sm text-ink-2">Who approves what is set in <Link href="/settings/forms-approvals" className="underline">Settings, Forms &amp; Approvals</Link>.</p>}
    </>
  );
}
