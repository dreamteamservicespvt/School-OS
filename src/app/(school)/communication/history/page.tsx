import type { Metadata } from "next";
import Link from "next/link";
import { withSchool } from "@/lib/db";
import { commPage } from "@/lib/communication/access";
import { readListParams, skipTake, listHref } from "@/lib/list";
import { formatDateTime } from "@/lib/format";
import { CHANNEL_LABEL, type Channel } from "@/lib/messaging/channels";
import { RULES } from "@/lib/messaging/automatic";
import { countsFor, HISTORY_FILTERS, historyWhere, MESSAGE_STATUS_LABEL, senderNames } from "@/lib/communication/history";
import { PageHeader } from "@/components/shell/page-header";
import { ListToolbar } from "@/components/list/list-toolbar";
import { DataTable } from "@/components/list/data-table";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { MessageIcon } from "@/components/icons";
import { ExportMenu } from "@/components/communication/export-menu";
import { DateRange } from "@/components/communication/date-range";

export const metadata: Metadata = { title: "Message History" };

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function MessageHistoryPage({ searchParams }: { searchParams: Search }) {
  const access = await commPage();
  const { current } = access;
  const params = readListParams(await searchParams, HISTORY_FILTERS);
  const tz = current.school.timeZone;
  const where = historyWhere(current.ctx, access.full, params, tz);
  const { rows, total, counts, names, person } = await withSchool(current.ctx, async (tx) => {
    const [rows, total] = await Promise.all([
      tx.message.findMany({ where, orderBy: { createdAt: params.sort === "date" && params.dir === "asc" ? "asc" : "desc" }, ...skipTake(params) }),
      tx.message.count({ where }),
    ]);
    let person: string | null = null;
    if (params.filters.person) {
      const [type, id] = params.filters.person.split(":");
      const r = await tx.messageRecipient.findFirst({ where: type === "guardian" ? { guardianId: id } : type === "student" ? { studentId: id } : { staffId: id }, select: { name: true } });
      person = r?.name ?? null;
    }
    return { rows, total, counts: await countsFor(tx, current.ctx, rows.map((r) => r.id)), names: await senderNames(tx, rows.map((r) => r.sentById)), person };
  });
  const exportHref = listHref("/communication/history/export", { ...params, page: 1 }, {});
  const anyFilter = Boolean(params.q || Object.keys(params.filters).length);

  return (
    <>
      <PageHeader title="Message History" href="/communication/history" userId={current.user.id}>
        <div className="flex gap-2">
          {total > 0 && <ExportMenu href={exportHref} />}
          {access.canChange && <ButtonLink href="/communication" variant="primary">Send Message</ButtonLink>}
        </div>
      </PageHeader>
      {person && (
        <p className="mb-3 rounded-xl bg-brand-soft px-4 py-2 text-brand-text">
          Every message to {person}. <Link className="font-medium underline" href={listHref("/communication/history", params, { person: null })}>Show all messages</Link>
        </p>
      )}
      <ListToolbar
        placeholder="Search title, message or audience"
        showArchived={false}
        filters={[
          { key: "channel", label: "Channel", options: (Object.keys(CHANNEL_LABEL) as Channel[]).map((c) => ({ value: c, label: CHANNEL_LABEL[c] })) },
          { key: "status", label: "Status", options: [...Object.entries(MESSAGE_STATUS_LABEL).map(([value, label]) => ({ value, label })), { value: "failed", label: "Has failed" }] },
          { key: "sender", label: "Sent by", options: [{ value: "me", label: "Me" }, ...(access.full ? [{ value: "people", label: "People" }, { value: "rules", label: "Automatic rules" }, { value: "notices", label: "Notices" }] : [])] },
          ...(access.full ? [{ key: "rule", label: "Rule", options: RULES.map((r) => ({ value: r.key, label: r.label })) }] : []),
        ]}
      >
        <DateRange />
      </ListToolbar>
      <DataTable
        caption="Messages sent"
        rows={rows}
        total={total}
        params={params}
        path="/communication/history"
        rowKey={(m) => m.id}
        rowHref={(m) => `/communication/history/${m.id}`}
        empty={
          <EmptyState title={anyFilter ? "No messages match these filters" : "No messages sent yet"} icon={<MessageIcon className="size-6" />}>
            {anyFilter ? "Change the search or filters, or reset them." : access.full ? "Messages sent by people, automatic rules and notices will be listed here with each person's delivery status." : "Messages you send will be listed here with each person's delivery status."}
            {!anyFilter && access.canChange && <div className="mt-4"><ButtonLink href="/communication" variant="primary">Send Message</ButtonLink></div>}
          </EmptyState>
        }
        columns={[
          { key: "date", label: "Date and time", sortable: true, phone: "meta", cell: (m) => formatDateTime(m.scheduledAt && m.status === "SCHEDULED" ? m.scheduledAt : m.createdAt, tz) },
          { key: "title", label: "Title or template", phone: "title", cell: (m) => <span className="font-medium">{m.title ?? m.trigger ?? m.body.slice(0, 60)}</span> },
          { key: "sender", label: "Sent by", phone: "meta", cell: (m) => (m.ruleKey ? `Rule: ${RULES.find((r) => r.key === m.ruleKey)?.label ?? m.ruleKey}` : m.sourceType === "Notice" ? "Notice" : names.get(m.sentById ?? "") ?? "School") },
          { key: "channel", label: "Channel", phone: "meta", cell: (m) => m.channels.map((c) => CHANNEL_LABEL[c as Channel] ?? c).join(", ") },
          { key: "recipients", label: "Recipients", className: "text-right", cell: (m) => m.recipientCount },
          { key: "delivered", label: "Delivered", className: "text-right", cell: (m) => counts.get(m.id)?.delivered ?? 0 },
          { key: "read", label: "Read", className: "text-right", cell: (m) => counts.get(m.id)?.read ?? 0 },
          { key: "failed", label: "Failed", className: "text-right", cell: (m) => { const f = counts.get(m.id)?.failed ?? 0; return f ? <span className="font-medium text-danger">{f}</span> : 0; } },
          { key: "cost", label: "Cost", className: "text-right", cell: (m) => (m.creditCost ? `${m.creditCost} credits` : "Free") },
          { key: "status", label: "Status", phone: "badge", cell: (m) => {
            const f = counts.get(m.id)?.failed ?? 0;
            return <Badge tone={m.status === "CANCELLED" ? "neutral" : m.status === "SCHEDULED" ? "brand" : f ? "danger" : m.status === "SENT" ? "success" : "warning"}>{f && m.status === "SENT" ? `${f} failed` : MESSAGE_STATUS_LABEL[m.status]}</Badge>;
          } },
        ]}
      />
    </>
  );
}
