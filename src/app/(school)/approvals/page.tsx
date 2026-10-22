import type { Metadata } from "next";
import Link from "next/link";
import type { ApprovalStatus, Prisma } from "@prisma/client";
import { requireCurrent } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { formatDateTime, formatRupees } from "@/lib/format";
import { listHref, readListParams, skipTake, PAGE_SIZE } from "@/lib/list";
import { momentWhere, periodFromSearch } from "@/lib/periods";
import { approvalsFor } from "@/lib/approvals";
import { mayApprove } from "@/lib/shell-data";
import { cx } from "@/components/ui/cx";
import { OPEN_STATUSES, REQUEST_TYPES, requestLabel, workingDaysBetween } from "@/lib/approvals";
import { VIEWS, decidableIds, inboxWhere, isOverseer, statusWords, type HistoryLine, type InboxView } from "@/lib/approvals-inbox";
import { rulesInUse } from "@/lib/settings/approval-rules";
import { PageHeader } from "@/components/shell/page-header";
import { periodSetup } from "@/lib/period-setup";
import { ListToolbar } from "@/components/list/list-toolbar";
import { EmptyState } from "@/components/empty-state";
import { CheckCheck, Inbox, SearchX } from "lucide-react";
import { ApprovalList, type ApprovalRow } from "./approval-list";
import { askerJobs } from "@/lib/approval-people";
import { answersSupport, schoolSupportRequests } from "@/lib/console/support";
import { ENDED_WORDS, endsWords, EXPIRED_WORDS, lengthWords, type EndHow } from "@/lib/console/support-entry";
import { SupportRequests, type SupportItem } from "./support-requests";
import { UnfinishedList, type UnfinishedItem } from "./unfinished-list";
import { finishesAny, unfinishedApprovals } from "@/lib/approvals-unfinished";
import { decisionOf } from "@/lib/approval-waiting";
import { approvalRecordLink } from "@/lib/approval-links";
import { approvalFacts } from "@/lib/approval-facts";
import { schoolRoles } from "@/lib/school-roles";

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
  const sp = await searchParams;
  const params = readListParams(sp, ["view", "type", "status", "period", "from", "to"]);
  const focusSupport = typeof sp.support === "string" ? sp.support : null;
  const roleKeys = current.roles.map((r) => r.key);
  const tz = current.school.timeZone;
  const dates = await periodSetup(current);
  const range = periodFromSearch(sp, dates);
  const waitingForMe = await withSchool(current.ctx, async (tx) => tx.approval.count({ where: await approvalsFor(tx, current.ctx, roleKeys) }));
  // People who never approve anything see only the requests they asked for (role-specific screens).
  const approver = mayApprove(current, waitingForMe);
  const views = approver ? VIEWS : VIEWS.filter((v) => v.value === "asked");
  const view: InboxView = views.some((v) => v.value === params.filters.view) ? (params.filters.view as InboxView) : views[0].value;
  const { skip, take } = skipTake(params);

  const data = await withSchool(current.ctx, async (tx) => {
    const base = await inboxWhere(tx, current.ctx, roleKeys, view);
    const extra: Prisma.ApprovalWhereInput[] = [];
    if (params.filters.type) extra.push({ type: params.filters.type });
    if (params.filters.status && STATUS_FILTER[params.filters.status]) extra.push({ status: { in: STATUS_FILTER[params.filters.status] } });
    if (params.q) extra.push({ summary: { contains: params.q, mode: "insensitive" } });
    if (range) extra.push({ createdAt: momentWhere(range, tz) });
    const where: Prisma.ApprovalWhereInput = { AND: [base, ...extra] };
    const [rows, total, counts, rules] = await Promise.all([
      tx.approval.findMany({ where, orderBy: [{ status: "asc" }, { createdAt: view === "mine" ? "asc" : "desc" }], skip, take }),
      tx.approval.count({ where }),
      Promise.all(views.map(async (v) => [v.value, await tx.approval.count({ where: { AND: [await inboxWhere(tx, current.ctx, roleKeys, v.value), { status: { in: OPEN_STATUSES } }] } })] as const)),
      rulesInUse(tx, current.school.id),
    ]);
    const decidable = await decidableIds(tx, current.ctx, rows);
    const ids = [...new Set(rows.flatMap((r) => [r.askedById, r.currentApproverId].filter((x): x is string => Boolean(x))))];
    const people = await tx.userLogin.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } });
    const roles = await schoolRoles(tx, current.ctx, { select: { key: true, name: true } });
    const jobs = await askerJobs(tx, rows.map((r) => r.askedById));
    // Facts only for requests still to decide: what the approver needs to see on the card.
    const facts = await approvalFacts(tx, current.ctx, rows.filter((r) => OPEN_STATUSES.includes(r.status)));
    // Decided requests whose record never moved on: for the person who decided each, and the Principal and School Admin.
    const any = await finishesAny(tx, current.ctx);
    const decidedSome = any || Boolean(await tx.approval.findFirst({ where: { decidedById: current.user.id, status: { in: ["APPROVED", "REJECTED"] } }, select: { id: true } }));
    const unfinished = decidedSome ? await unfinishedApprovals(tx, current.ctx, { any }) : [];
    const deciders = await tx.userLogin.findMany({ where: { id: { in: unfinished.map((a) => a.decidedById).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } });
    return { rows, total, counts: new Map(counts), rules, decidable, jobs, facts, unfinished, deciders: new Map(deciders.map((p) => [p.id, p.displayName])), people: new Map(people.map((p) => [p.id, p.displayName])), roles: new Map(roles.map((r) => [r.key, r.name])) };
  });

  const now = new Date();
  // DREAM TEAM support access (07-super-admin.md §3.4): only the School Admin and Principal answer it.
  const support: SupportItem[] = answersSupport(current)
    ? (await schoolSupportRequests(current.school.id, now, 8)).map((r) => ({
      id: r.id,
      who: `${r.requestedByName} of DREAM TEAM`,
      reason: r.reason,
      length: lengthWords(r.lengthMinutes),
      asked: formatDateTime(r.createdAt, tz),
      status: r.status,
      live: r.live,
      detail: r.status === "DECLINED" ? `Declined by ${r.decidedByName ?? "the school"}${r.declineReason ? `: “${r.declineReason}”` : ""}`
        : r.status === "EXPIRED" ? `${EXPIRED_WORDS}${r.endedAt ? `, ${formatDateTime(r.endedAt, tz)}` : ""}`
        : r.live && r.endsAt ? `Allowed by ${r.decidedByName ?? "the school"} until ${endsWords(r.endsAt, now, tz)}`
        : r.status === "ENDED" || r.status === "ALLOWED" ? `${r.endedHow ? ENDED_WORDS[r.endedHow as EndHow] ?? "Ended" : "Ended at the time given"}${r.endedAt ? `, ${formatDateTime(r.endedAt, tz)}` : r.endsAt ? `, ${formatDateTime(r.endsAt, tz)}` : ""}`
        : null,
      focus: r.id === focusSupport,
    }))
    : [];
  const DECIDED_WORDS = { approve: ["Approved", "approved"], reject: ["Not approved", "not approved"], "ask-change": ["Sent back", "sent back for a change"], withdraw: ["Withdrawn", "withdrawn"] } as const;
  const unfinished: UnfinishedItem[] = data.unfinished.map((a) => {
    const [decided, decidedWords] = DECIDED_WORDS[decisionOf(a) ?? "approve"];
    return {
      id: a.id,
      summary: a.summary,
      typeLabel: requestLabel(a.type),
      decided,
      decidedWords,
      by: a.decidedById === current.user.id ? "you" : (a.decidedById && data.deciders.get(a.decidedById)) || "the approver",
      when: a.decidedAt ? formatDateTime(a.decidedAt, tz) : "",
      record: a.recordType.toLowerCase(),
      link: approvalRecordLink(a),
    };
  });
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
      askedByName: data.people.get(a.askedById) ?? current.user.displayName,
      asked: formatDateTime(a.createdAt, tz),
      status: statusWords(a.status, a.history),
      waitingFor: open ? (a.currentApproverId ? (a.currentApproverId === current.user.id ? "you" : data.people.get(a.currentApproverId) ?? "a person") : a.currentApproverRole ? `the ${data.roles.get(a.currentApproverRole) ?? a.currentApproverRole}` : null) : null,
      decidable: data.decidable.has(a.id),
      job: a.askedById === current.user.id ? null : data.jobs.get(a.askedById) ?? null,
      reason: a.reason,
      facts: data.facts.get(a.id),
      overdue: open && workingDaysBetween(new Date(last?.at ?? a.createdAt), now) >= days,
    };
  });
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const filtered = Boolean(params.q || params.filters.type || params.filters.status || range);
  const first = views[0].value;

  return (
    <div className="max-w-5xl">
      <PageHeader title="Approvals" href="/approvals" userId={current.user.id}
        sub={approver ? "Requests only you can decide, and the ones you asked for" : "Requests you asked for, such as leave, and where each one is"} />
      {support.length > 0 && <SupportRequests items={support} schoolName={current.school.name} />}
      {unfinished.length > 0 && !current.support && <UnfinishedList items={unfinished} />}
      {views.length > 1 && (
        <nav aria-label="Which requests" className="-mx-4 px-4 md:mx-0 md:px-0 mb-4">
          <ul className="flex gap-1 overflow-x-auto no-scrollbar border-b border-line">
            {views.map((v) => {
              const on = view === v.value;
              return (
                <li key={v.value} className="shrink-0">
                  <Link href={listHref("/approvals", { ...params, page: 1 }, { view: v.value === first ? null : v.value })} aria-current={on ? "page" : undefined}
                    className={cx("relative flex items-center h-11 px-3.5 text-sm font-semibold whitespace-nowrap transition", on ? "text-brand" : "text-ink2 hover:text-ink")}>
                    {v.value === "all" && isOverseer(roleKeys) ? "All requests" : v.label}
                    <span className="ml-1.5 text-xs text-ink3 tnum">{data.counts.get(v.value) ?? 0}</span>
                    {on && <span className="absolute left-2 right-2 -bottom-px h-[3px] rounded-t bg-brand" aria-hidden="true" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
      <ListToolbar placeholder="Search requests" showArchived={false} period={dates} filters={[
        { key: "status", label: "Status", options: [{ value: "open", label: "Waiting" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected or sent back" }, { value: "withdrawn", label: "Withdrawn" }] },
        { key: "type", label: "Kind", options: REQUEST_TYPES.map((t) => ({ value: t.key, label: t.label })) },
      ]} />
      {rows.length === 0 ? (
        filtered ? (
            <EmptyState title="Nothing matches these filters" Icon={SearchX}>Change the search or <Link href={view === first ? "/approvals" : `/approvals?view=${view}`} className="font-semibold text-brand underline">reset the filters</Link>.</EmptyState>
          ) : view === "mine" ? (
            <EmptyState title="Nothing waiting" Icon={CheckCheck}>New requests show up here and in your notifications.</EmptyState>
          ) : view === "asked" ? (
            <EmptyState title="You have not asked for anything yet" Icon={Inbox}>Requests you send, such as leave, appear here so you can follow them.</EmptyState>
          ) : (
            <EmptyState title="No requests yet" Icon={Inbox}>Requests from every module appear here once people start asking.</EmptyState>
          )
      ) : (
        <>
          <ApprovalList rows={rows} />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-[13.5px] text-ink3">
            <span className="tnum">{data.total} request{data.total === 1 ? "" : "s"}{pages > 1 ? ` · page ${params.page} of ${pages}` : ""}</span>
            {pages > 1 && (
              <span className="flex gap-2">
                {params.page > 1 && <Link href={listHref("/approvals", params, { page: params.page - 1 })} className="inline-flex h-9 items-center rounded-xl border border-line bg-surface px-3 font-semibold text-ink hover:bg-sunken">Previous</Link>}
                {params.page < pages && <Link href={listHref("/approvals", params, { page: params.page + 1 })} className="inline-flex h-9 items-center rounded-xl border border-line bg-surface px-3 font-semibold text-ink hover:bg-sunken">Next</Link>}
              </span>
            )}
          </div>
        </>
      )}
      {isOverseer(roleKeys) && <p className="mt-4 text-[13px] text-ink3">Who approves what is set in <Link href="/settings/forms-approvals" className="font-semibold text-brand hover:underline">Settings, Forms &amp; Approvals</Link>.</p>}
    </div>
  );
}
