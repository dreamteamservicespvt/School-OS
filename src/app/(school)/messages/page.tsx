import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireCurrent } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { can } from "@/lib/permissions";
import { readListParams, skipTake, listHref, PAGE_SIZE } from "@/lib/list";
import { formatDateTime } from "@/lib/format";
import { inPeriod, PERIOD_FILTERS } from "@/lib/communication/period";
import { PageHeader } from "@/components/shell/page-header";
import { ListToolbar } from "@/components/list/list-toolbar";
import { EmptyState } from "@/components/empty-state";
import { MessageIcon } from "@/components/icons";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Messages" };

type Search = Promise<Record<string, string | string[] | undefined>>;

/** The signed-in person's own app messages (notices, school messages, replies). Opening this page counts as reading them. */
export default async function MessagesPage({ searchParams }: { searchParams: Search }) {
  const current = await requireCurrent();
  const tz = current.school.timeZone;
  const params = readListParams(await searchParams, ["show", ...PERIOD_FILTERS]);
  const when = inPeriod(params.filters, tz);
  const me = current.user.id;
  const data = await withSchool(current.ctx, async (tx) => {
    const where: Prisma.MessageRecipientWhereInput = {
      schoolId: current.ctx.schoolId, userLoginId: me, channel: "app", status: { in: ["SENT", "DELIVERED", "READ"] },
      ...(params.filters.show === "unread" ? { readAt: null } : {}),
      ...(when ? { sentAt: when } : {}),
      ...(params.q ? { OR: [{ text: { contains: params.q, mode: "insensitive" } }, { message: { title: { contains: params.q, mode: "insensitive" } } }] } : {}),
    };
    const [rows, total, unread] = await Promise.all([
      tx.messageRecipient.findMany({ where, orderBy: { sentAt: "desc" }, ...skipTake(params), include: { message: { select: { title: true, sentById: true, messageType: true } } } }),
      tx.messageRecipient.count({ where }),
      tx.messageRecipient.count({ where: { schoolId: current.ctx.schoolId, userLoginId: me, channel: "app", status: { in: ["SENT", "DELIVERED"] }, readAt: null } }),
    ]);
    const senders = await tx.userLogin.findMany({ where: { id: { in: rows.map((r) => r.message.sentById).filter(Boolean) as string[] } }, select: { id: true, displayName: true } });
    // Shown on screen, so read: the sender sees "Read" in Message History.
    const fresh = rows.filter((r) => !r.readAt).map((r) => r.id);
    if (fresh.length) await tx.messageRecipient.updateMany({ where: { id: { in: fresh } }, data: { status: "READ", readAt: new Date() } });
    return { rows, total, unread, fresh: new Set(fresh), senders: new Map(senders.map((s) => [s.id, s.displayName])) };
  });
  const filtered = Boolean(params.q || params.filters.show);
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <>
      <PageHeader title="Messages" href="/messages" userId={current.user.id}>
        {can(current.permissions, "communication", "create") && <ButtonLink href="/communication" variant="primary">Send a message</ButtonLink>}
      </PageHeader>
      <p className="-mt-3 mb-4 text-ink-2">{data.unread ? `${data.unread} new.` : "Messages sent to you in the app."} Notices for you are on the <Link href="/communication/notices?view=board" className="text-brand-text underline">Notice Board</Link>.</p>
      <ListToolbar period={{ timeZone: tz }} placeholder="Search messages" showArchived={false} filters={[{ key: "show", label: "Show", options: [{ value: "unread", label: "New only" }] }]} />
      {data.rows.length === 0 ? (
        <EmptyState title={filtered ? "No messages match" : "No messages yet"} icon={<MessageIcon className="size-6" />}>
          {filtered ? "Change the search or filter." : "Messages the school sends you in the app, such as salary slips ready or staff announcements, appear here."}
        </EmptyState>
      ) : (
        <>
          <ul className="space-y-2">
            {data.rows.map((r) => (
              <li key={r.id} className={`rounded-2xl border bg-surface p-4 shadow-card ${data.fresh.has(r.id) ? "border-brand" : "border-line"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  {r.message.title && <h2 className="font-semibold">{r.message.title}</h2>}
                  {data.fresh.has(r.id) && <Badge tone="brand">New</Badge>}
                  <span className="ml-auto text-sm text-ink-2">{r.sentAt ? formatDateTime(r.sentAt, tz) : ""}</span>
                </div>
                <p className="mt-1 whitespace-pre-line break-words">{r.text}</p>
                <p className="mt-1 text-sm text-ink-2">From {r.message.sentById ? data.senders.get(r.message.sentById) ?? "the school" : "School OS (automatic)"}</p>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav aria-label="Pages" className="mt-4 flex items-center justify-between text-sm">
              <span className="text-ink-2">Page {params.page} of {pages}</span>
              <span className="flex gap-2">
                {params.page > 1 && <ButtonLink href={listHref("/messages", params, { page: params.page - 1 })} size="sm">Previous</ButtonLink>}
                {params.page < pages && <ButtonLink href={listHref("/messages", params, { page: params.page + 1 })} size="sm">Next</ButtonLink>}
              </span>
            </nav>
          )}
        </>
      )}
    </>
  );
}
