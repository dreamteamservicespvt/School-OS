import type { Metadata } from "next";
import Link from "next/link";
import { requireCurrent } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/empty-state";
import { BellIcon } from "@/components/icons";
import { markAllNotificationsRead } from "../actions";

export const metadata: Metadata = { title: "Notifications" };

/** Unread first, newest first, with "Mark all read" (00-global.md §4). */
export default async function NotificationsPage() {
  const current = await requireCurrent();
  const notes = await withSchool(current.ctx, (tx) =>
    tx.notification.findMany({
      where: { userLoginId: current.user.id },
      orderBy: [{ readAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
      take: 100,
    }),
  );
  const unread = notes.filter((n) => !n.readAt).length;
  return (
    <>
      <PageHeader title="Notifications" href="/notifications" userId={current.user.id}>
        {unread > 0 && (
          <form action={markAllNotificationsRead}>
            <button type="submit" className="min-h-11 rounded-lg border border-line bg-surface px-4 font-medium hover:bg-surface-2">Mark all read</button>
          </form>
        )}
      </PageHeader>
      {notes.length === 0 ? (
        <EmptyState title="No notifications" icon={<BellIcon className="size-6" />}>
          Alerts meant for you, such as requests waiting for your approval, will appear here. Each one opens the right screen.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {notes.map((n) => (
            <li key={n.id}>
              <Link href={n.link} className="flex items-start gap-3 p-4 hover:bg-surface-2">
                <span className={`mt-2 size-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-brand"}`} aria-hidden="true" />
                <span className="flex-1">
                  <span className={n.readAt ? "" : "font-medium"}>{n.text}</span>
                  <span className="block text-sm text-ink-2">
                    {!n.readAt && <span className="sr-only">Unread. </span>}
                    {formatDateTime(n.createdAt, current.school.timeZone)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
