import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import * as I from "lucide-react";
import { requireCurrent } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { listHref, readListParams } from "@/lib/list";
import { momentWhere, periodFromSearch } from "@/lib/periods";
import { periodSetup } from "@/lib/period-setup";
import { PageHeader } from "@/components/shell/page-header";
import { ListToolbar } from "@/components/list/list-toolbar";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { isUnread, notificationPage, UNREAD } from "@/lib/notifications";
import { markAllNotificationsRead, openNotification } from "../actions";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Notifications") };
}

const PAGE = 30;

/** An icon for each kind of alert, so the list can be scanned (kit.jsx NotifPanel). */
function iconFor(type: string) {
  if (/approv|request/.test(type)) return I.CircleCheckBig;
  if (/fee|pay|salary|money/.test(type)) return I.IndianRupee;
  if (/attend|leave|absent/.test(type)) return I.CalendarCheck;
  if (/exam|result|mark/.test(type)) return I.ClipboardList;
  if (/sign|security|password|device/.test(type)) return I.ShieldCheck;
  if (/message|notice|communication/.test(type)) return I.MessageSquare;
  if (/task|substitut/.test(type)) return I.ListTodo;
  if (/import|export|backup/.test(type)) return I.FileUp;
  return I.Bell;
}

/** Unread first, newest first, with "Mark all read" (00-global.md §4). Opening one marks it read. */
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const current = await requireCurrent();
  const sp = await searchParams;
  const params = readListParams(sp, ["show", "period", "from", "to"]);
  const tz = current.school.timeZone;
  const dates = await periodSetup(current);
  const range = periodFromSearch(sp, dates);
  const where: Prisma.NotificationWhereInput = {
    userLoginId: current.user.id,
    ...(params.filters.show === "unread" ? UNREAD : {}),
    ...(range ? { createdAt: momentWhere(range, tz) } : {}),
    ...(params.q ? { text: { contains: params.q, mode: "insensitive" } } : {}),
  };
  const data = await withSchool(current.ctx, async (tx) => {
    const [notes, total, unread] = await Promise.all([
      notificationPage(tx, where, (params.page - 1) * PAGE, PAGE),
      tx.notification.count({ where }),
      tx.notification.count({ where: { userLoginId: current.user.id, ...UNREAD } }),
    ]);
    return { notes, total, unread };
  });
  const filtered = Boolean(params.q || params.filters.show || range);
  const pages = Math.max(1, Math.ceil(data.total / PAGE));

  return (
    <>
      <PageHeader title="Notifications" href="/notifications" userId={current.user.id}
        sub={data.unread ? `${data.unread} new` : "You are all caught up"}>
        {data.unread > 0 && (
          <form action={markAllNotificationsRead}>
            <Button type="submit" variant="secondary" icon={I.CheckCheck}><Words k="Mark all read" /></Button>
          </form>
        )}
      </PageHeader>
      <ListToolbar placeholder="Search notifications" showArchived={false} period={dates}
        filters={[{ key: "show", label: "Show", allLabel: "All notifications", options: [{ value: "unread", label: "New only" }] }]} />
      {data.notes.length === 0 ? (
        <EmptyState title={filtered ? "No notifications match" : "No notifications"} Icon={filtered ? I.SearchX : I.Bell}
          action={filtered ? <Link href="/notifications" className="text-sm font-semibold text-brand hover:underline"><Words k="Clear the filters" /></Link> : undefined}>
          {filtered ? "Change the search, the dates or the filter." : "Alerts meant for you, such as requests waiting for your approval, appear here. Each one opens the right screen."}
        </EmptyState>
      ) : (
        <>
          <ul className="bg-surface rounded-2xl border border-line/70 shadow-card divide-y divide-line/70 overflow-hidden">
            {data.notes.map((n) => {
              const Icon = iconFor(n.type);
              const fresh = isUnread(n);
              return (
                <li key={n.id}>
                  <form action={openNotification}>
                    <input type="hidden" name="id" value={n.id} />
                    <button type="submit" className={cx("w-full text-left flex items-start gap-3 px-4 md:px-5 py-3.5 transition hover:bg-sunken/70", fresh && "bg-brand/[0.04]")}>
                      <span className={cx("mt-0.5 size-10 shrink-0 rounded-xl grid place-items-center", !fresh ? "bg-sunken text-ink3" : "bg-brand/10 text-brand")} aria-hidden="true">
                        <Icon size={19} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cx("block text-[14.5px] leading-snug", !fresh ? "text-ink2" : "font-semibold text-ink")}>
                          {fresh && <span className="sr-only"><Words k="New." /> </span>}{n.text}
                          {n.count > 1 && <span className="ml-1.5 tnum text-ink3 font-medium">×{n.count}</span>}
                        </span>
                        <span className="block text-[12.5px] text-ink3 mt-1 tnum">{formatDateTime(n.createdAt, tz)}</span>
                      </span>
                      {fresh && <span className="mt-2 size-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />}
                      <I.ChevronRight size={17} className="mt-2.5 shrink-0 text-ink3" aria-hidden="true" />
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
          {pages > 1 && (
            <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-3 text-sm">
              <span className="text-ink3 tnum"><Words k="Page" /> {params.page} <Words k="of" /> {pages} · {data.total} <Words k="notifications" /></span>
              <span className="flex gap-2">
                {params.page > 1 && <Link className="h-10 px-3.5 inline-flex items-center gap-1 rounded-xl border border-line bg-surface font-semibold hover:border-ink3/50" href={listHref("/notifications", params, { page: params.page - 1 })}><I.ChevronLeft size={16} aria-hidden="true" /><Words k="Newer" /></Link>}
                {params.page < pages && <Link className="h-10 px-3.5 inline-flex items-center gap-1 rounded-xl border border-line bg-surface font-semibold hover:border-ink3/50" href={listHref("/notifications", params, { page: params.page + 1 })}><Words k="Older" /><I.ChevronRight size={16} aria-hidden="true" /></Link>}
              </span>
            </nav>
          )}
        </>
      )}
    </>
  );
}
