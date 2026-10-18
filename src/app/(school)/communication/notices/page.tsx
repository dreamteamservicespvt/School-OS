import type { Metadata } from "next";
import Link from "next/link";
import { Megaphone, Plus } from "lucide-react";
import { withSchool } from "@/lib/db";
import { commPage } from "@/lib/communication/access";
import { readListParams, skipTake, listHref, PAGE_SIZE } from "@/lib/list";
import { formatDate } from "@/lib/format";
import { boardFor, PRIORITY_LABEL, STATUS_LABEL } from "@/lib/communication/notices";
import { NOTICE_FILTERS, NOTICE_GROUPS, noticeCampusWhere, noticeCounts, noticeWhere, type NoticeGroup } from "@/lib/communication/notice-list";
import { Card, CardHeader } from "@/components/ui/card";
import { Toolbar } from "@/components/ui/toolbar";
import { DataList } from "@/components/ui/data-list";
import { Pill, type PillTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Progress } from "@/components/ui/charts";
import { Split } from "@/components/ui/split";
import { cx } from "@/components/ui/cx";
import { UrlSearch, UrlSegmented, UrlSelect } from "@/components/ui/url-filters";
import { PeriodFilter } from "@/components/list/period-filter";
import { EmptyState } from "@/components/empty-state";
import { ExportMenu } from "@/components/communication/export-menu";
import { CommHead } from "../_components/comm-head";

export const metadata: Metadata = { title: "Notice Board" };

const STATUS_TONE: Record<string, PillTone> = { DRAFT: "neutral", WAITING_APPROVAL: "warn", SCHEDULED: "info", PUBLISHED: "ok", EXPIRED: "neutral", ARCHIVED: "neutral" };
const PRIORITY_TONE: Record<string, PillTone> = { NORMAL: "neutral", HIGH: "warn", CRITICAL: "bad" };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function NoticeBoardPage({ searchParams }: { searchParams: Search }) {
  const access = await commPage();
  const { current } = access;
  const raw = await searchParams;
  const tz = current.school.timeZone;
  const params = readListParams(raw, NOTICE_FILTERS);
  const group: NoticeGroup = params.filters.group === "waiting" || params.filters.group === "archive" ? params.filters.group : "current";
  const listParams = { ...params, filters: { ...params.filters, group } };
  const where = noticeWhere(current.ctx, access.full, listParams, tz);
  const mineWhere = noticeWhere(current.ctx, access.full, { ...params, q: "", filters: {} }, tz);

  const data = await withSchool(current.ctx, async (tx) => {
    // A person limited to one campus does not see notices for other campuses only.
    const campus = await noticeCampusWhere(tx, current.ctx, access.scope.campusId);
    const [rows, total, byStatus, board] = await Promise.all([
      tx.notice.findMany({ where: { AND: [where, campus] }, orderBy: { createdAt: "desc" }, ...skipTake(params) }),
      tx.notice.count({ where: { AND: [where, campus] } }),
      tx.notice.groupBy({ by: ["status"], where: { AND: [mineWhere, campus, { status: { not: "ARCHIVED" } }] }, _count: { _all: true } }),
      boardFor(tx, current.ctx, current.user.id, access.roleKeys),
    ]);
    return { rows, total, byStatus, board, counts: await noticeCounts(tx, rows) };
  });
  const groupCount = (g: NoticeGroup) => data.byStatus.filter((s) => (NOTICE_GROUPS[g] as readonly string[]).includes(s.status)).reduce((a, s) => a + s._count._all, 0);
  const rank = { CRITICAL: 0, HIGH: 1, NORMAL: 2 } as const;
  const board = [...data.board].sort((a, b) => rank[a.priority] - rank[b.priority]);
  const filtered = Boolean(params.q || params.filters.priority || params.filters.period || params.filters.from || params.filters.to);
  const seenCell = (n: (typeof data.rows)[number]) => {
    const c = data.counts.get(n.id);
    if (n.guardianCount) {
      const seen = c?.seen ?? 0;
      return <span className="tnum text-[13px]"><b className="font-semibold">{seen.toLocaleString("en-IN")}</b><span className="text-ink3"> of {n.guardianCount.toLocaleString("en-IN")}</span><Progress value={(seen / n.guardianCount) * 100} className="mt-1 w-20 ml-auto" /></span>;
    }
    if (n.staffCount) return <span className="tnum text-[13px]"><b className="font-semibold">{c?.read ?? 0}</b><span className="text-ink3"> of {n.staffCount}</span></span>;
    return <span className="text-ink3">–</span>;
  };
  const published = (n: (typeof data.rows)[number]) => (n.publishedAt ? formatDate(n.publishedAt, tz) : n.publishAt ? `Due ${formatDate(n.publishAt, tz)}` : "Not yet");

  return (
    <>
      <CommHead access={access} page="Notice Board" href="/communication/notices"
        sub={access.full ? "Circulars and notices with read tracking. Notices to parents go for approval first, unless you approve them yourself." : access.canChange ? "Notices for you are on the board, with the notices you wrote. Notices to parents go for approval first." : "Notices for you are on the board."}
        actions={access.canChange ? <ButtonLink href="/communication/notices/new" variant="primary" icon={Plus}>New notice</ButtonLink> : undefined} />
      <Split side={340}>
        <Card className="overflow-hidden min-w-0">
          <Toolbar className="flex-wrap">
            <UrlSearch placeholder="Notice title or audience" className="min-w-[14rem]" />
            <UrlSegmented param="group" label="Show" options={[{ value: "current", label: `Current · ${groupCount("current")}` }, { value: "waiting", label: `Waiting · ${groupCount("waiting")}` }, { value: "archive", label: "Archive" }]} />
            <UrlSelect param="priority" label="Priority" className="md:w-40" options={[{ value: "", label: "Any priority" }, ...Object.entries(PRIORITY_LABEL).map(([value, label]) => ({ value, label }))]} />
            <PeriodFilter timeZone={tz} />
            {data.total > 0 && <ExportMenu href={listHref("/communication/notices/export", { ...listParams, page: 1 }, {})} />}
          </Toolbar>
          <DataList
            caption="Notices"
            rows={data.rows}
            rowKey={(n) => n.id}
            href={(n) => `/communication/notices/${n.id}`}
            minWidth={620}
            paging={{ page: params.page, pageSize: PAGE_SIZE, total: data.total, href: (p) => listHref("/communication/notices", listParams, { page: p }) }}
            empty={
              <EmptyState bare Icon={Megaphone} title={filtered ? "No notices here" : group === "waiting" ? "Nothing waiting" : "No notices here"}
                action={access.canChange ? <ButtonLink href="/communication/notices/new" icon={Plus}>New notice</ButtonLink> : undefined}>
                {group === "waiting" ? "Drafts, scheduled notices and those waiting for approval show here." : "Try another search, or write a new notice."}
              </EmptyState>
            }
            columns={[
              { key: "title", label: "Notice", render: (n) => <div className="min-w-[230px]"><p className="font-semibold leading-snug">{n.title}</p><p className="text-[12.5px] text-ink3 mt-0.5 flex items-center gap-1.5 flex-wrap">{n.priority !== "NORMAL" && <Pill tone={PRIORITY_TONE[n.priority]} className="!h-5 !text-[11px]">{PRIORITY_LABEL[n.priority]}</Pill>}{n.audienceLabel}</p></div> },
              { key: "pub", label: "Published", nowrap: true, render: (n) => <span className="tnum text-[13px]">{published(n)}{n.expiresOn && <span className="block text-[12px] text-ink3">until {formatDate(n.expiresOn, "UTC")}</span>}</span> },
              { key: "status", label: "Status", nowrap: true, render: (n) => <Pill tone={STATUS_TONE[n.status]} dot>{STATUS_LABEL[n.status]}</Pill> },
              { key: "seen", label: "Seen / read", align: "right", nowrap: true, render: seenCell },
            ]}
            mobile={(n) => ({
              title: n.title, sub: `${n.audienceLabel} · ${published(n)}`, icon: Megaphone, iconTone: n.priority === "NORMAL" ? "brand" : PRIORITY_TONE[n.priority] as "warn" | "bad",
              pills: [
                <Pill key="s" tone={STATUS_TONE[n.status]} className="!h-[22px] !text-[11.5px]">{STATUS_LABEL[n.status]}</Pill>,
                n.priority !== "NORMAL" ? <Pill key="p" tone={PRIORITY_TONE[n.priority]} className="!h-[22px] !text-[11.5px]">{PRIORITY_LABEL[n.priority]}</Pill> : null,
                n.guardianCount ? <Pill key="seen" tone="neutral" className="!h-[22px] !text-[11.5px]">Seen {data.counts.get(n.id)?.seen ?? 0} of {n.guardianCount}</Pill> : null,
              ],
            })}
          />
        </Card>
        <Card>
          <CardHeader title="On the board now" description="As you see it: Critical first" icon={Megaphone} />
          <ul className="px-3 pb-3 flex flex-col gap-1.5">
            {board.slice(0, 6).map((n) => (
              <li key={n.id}>
                <Link href={`/communication/notices/${n.id}`} className={cx("block w-full text-left rounded-xl px-3 py-2.5 hover:bg-sunken/70 transition border-l-[3px]", n.priority === "CRITICAL" ? "border-bad bg-bad/[.04]" : n.priority === "HIGH" ? "border-warn bg-warn/[.05]" : "border-line")}>
                  <p className="font-semibold text-[14px] leading-snug">{n.title}</p>
                  <p className="text-[12.5px] text-ink3 mt-0.5">{n.audienceLabel}{n.publishedAt ? ` · ${formatDate(n.publishedAt, tz)}` : ""}{n.askAck ? " · Please acknowledge" : ""}</p>
                </Link>
              </li>
            ))}
            {!board.length && <li className="text-[13.5px] text-ink3 px-3 py-4">Nothing published for you yet.</li>}
            {board.length > 6 && <li className="px-3 pt-1 text-[12.5px] text-ink3">and {board.length - 6} more</li>}
          </ul>
        </Card>
      </Split>
    </>
  );
}
