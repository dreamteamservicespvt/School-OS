import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { commPage } from "@/lib/communication/access";
import { readListParams, skipTake } from "@/lib/list";
import { formatDateTime } from "@/lib/format";
import { CHANNEL_LABEL, onChannels, type Channel } from "@/lib/messaging/channels";
import { retryableFailures } from "@/lib/messaging/deliver";
import { RULES } from "@/lib/messaging/automatic";
import { withHiddenLinks } from "@/lib/parent-link/token";
import { countsFor, DELIVERY_LABEL, MESSAGE_STATUS_LABEL, senderNames } from "@/lib/communication/history";
import { PageHeader } from "@/components/shell/page-header";
import { ListToolbar } from "@/components/list/list-toolbar";
import { DataTable } from "@/components/list/data-table";
import { EmptyState } from "@/components/empty-state";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card, CardBody, Detail } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { MessageActions } from "./message-actions";

export const metadata: Metadata = { title: "Message" };

const TONE: Record<string, BadgeTone> = { QUEUED: "neutral", SENDING: "neutral", SENT: "brand", DELIVERED: "success", READ: "success", FAILED: "danger" };
const PAGE = 50;

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** A one-time code is never shown to staff once real messages are sent. */
function shownText(text: string, sourceType: string | null, provider: string | null) {
  const t = withHiddenLinks(text);
  if (sourceType === "Parent Link Code" && provider && provider !== "sandbox") return t.replace(/\b\d{6}\b/g, "••••••");
  return t;
}

export default async function MessagePage({ params, searchParams }: Props) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const access = await commPage();
  const { current } = access;
  const tz = current.school.timeZone;
  const list = readListParams(await searchParams, ["status", "channel"]);
  const data = await withSchool(current.ctx, async (tx) => {
    const m = await tx.message.findFirst({ where: { id, schoolId: current.ctx.schoolId, ...(access.full ? {} : { sentById: current.user.id }) } });
    if (!m) return null;
    const where: Prisma.MessageRecipientWhereInput = {
      messageId: m.id,
      ...(list.q ? { OR: [{ name: { contains: list.q, mode: "insensitive" } }, { description: { contains: list.q, mode: "insensitive" } }, { address: { contains: list.q } }] } : {}),
      ...(list.filters.status === "backup" ? { isBackup: true } : list.filters.status ? { status: list.filters.status as Prisma.EnumDeliveryStatusFilter["equals"] } : {}),
      ...(list.filters.channel ? { channel: list.filters.channel } : {}),
    };
    const [rows, total] = await Promise.all([
      tx.messageRecipient.findMany({ where, orderBy: [{ status: "asc" }, { name: "asc" }], ...skipTake(list, PAGE) }),
      tx.messageRecipient.count({ where }),
    ]);
    const counts = (await countsFor(tx, current.ctx, [m.id])).get(m.id)!;
    const retry = await retryableFailures(tx, current.ctx, m.id);
    const unread = await tx.messageRecipient.count({ where: { messageId: m.id, isBackup: false, status: { notIn: ["READ"] } } });
    const names = await senderNames(tx, [m.sentById, m.cancelledById]);
    const resendOf = m.resendOfId ? await tx.message.findUnique({ where: { id: m.resendOfId }, select: { id: true, title: true, audienceLabel: true } }) : null;
    const on = [...(await onChannels(tx, current.ctx))];
    const backupWhy = await tx.messageRecipient.groupBy({ by: ["backupReason"], where: { messageId: m.id, isBackup: true }, _count: { _all: true } });
    return { m, rows, total, counts, retry, unread, names, resendOf, on, backupWhy };
  });
  if (!data) notFound();
  const { m, counts } = data;
  const sender = m.ruleKey ? `Rule: ${RULES.find((r) => r.key === m.ruleKey)?.label ?? m.ruleKey}` : m.sourceType === "Notice" ? "Notice" : data.names.get(m.sentById ?? "") ?? "School";
  const skipped = (Array.isArray(m.skipped) ? m.skipped : []) as { reason: string; count: number; names?: string[] }[];
  const sent = m.status === "SENT" || m.status === "QUEUED";

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/communication/history" className="text-brand-text hover:underline">← Message History</Link></p>
      <PageHeader title={m.title ?? m.trigger ?? "Message"} href={`/communication/history/${m.id}`} userId={current.user.id}>
        {access.canChange && (
          <MessageActions id={m.id} canCancel={m.status === "SCHEDULED"}
            scheduledWords={m.scheduledAt ? `Scheduled for ${formatDateTime(m.scheduledAt, tz)}.` : null}
            retryable={m.status === "CANCELLED" ? 0 : data.retry.rows.length} overLimit={data.retry.overLimit} retryLimit={data.retry.retryLimit}
            unread={sent ? data.unread : 0} failed={sent ? counts.failed : 0}
            channels={(["whatsapp", "sms", "email", "app"] as Channel[]).filter((c) => data.on.includes(c))} labels={CHANNEL_LABEL} />
        )}
      </PageHeader>

      {m.status === "SCHEDULED" && m.scheduledAt && <Alert tone="info" className="mb-4">Scheduled for {formatDateTime(m.scheduledAt, tz)}. You can cancel it until then.</Alert>}
      {m.status === "CANCELLED" && <Alert tone="warning" className="mb-4">Cancelled{m.cancelledAt ? ` on ${formatDateTime(m.cancelledAt, tz)}` : ""}{m.cancelledById ? ` by ${data.names.get(m.cancelledById) ?? "staff"}` : ""}. Nobody got it.</Alert>}
      {m.isEmergency && <Alert tone="danger" className="mb-4">Emergency broadcast: sent also to parents who opted out.</Alert>}

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardBody>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Detail label="Sent by">{sender}</Detail>
              <Detail label="When">{formatDateTime(m.sentAt ?? m.scheduledAt ?? m.createdAt, tz)}</Detail>
              <Detail label="To">{m.audienceLabel}</Detail>
              <Detail label="Channel">{m.channels.map((c) => CHANNEL_LABEL[c as Channel] ?? c).join(", ")}</Detail>
              <Detail label="Cost">{m.creditCost ? `${m.creditCost} credits` : "Free"}</Detail>
              <Detail label="Status">{MESSAGE_STATUS_LABEL[m.status]}</Detail>
              {m.trigger && <Detail label="Why">{m.trigger}</Detail>}
              {data.resendOf && <Detail label="Resend of"><Link className="text-brand-text underline" href={`/communication/history/${data.resendOf.id}`}>{data.resendOf.title ?? data.resendOf.audienceLabel}</Link></Detail>}
              {m.smsBackup && <Detail label="SMS backup">{counts.backup ? `${counts.backup} also sent by SMS (${data.backupWhy.map((b) => `${b.backupReason ?? "not delivered"}: ${b._count._all}`).join("; ")})` : "On; none needed yet"}</Detail>}
            </dl>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <dl className="grid grid-cols-2 gap-3">
              <Detail label="Recipients">{counts.total}</Detail>
              <Detail label="Queued">{counts.queued}</Detail>
              <Detail label="Delivered">{counts.delivered}</Detail>
              <Detail label="Read">{counts.read}</Detail>
              <Detail label="Failed"><span className={counts.failed ? "text-danger" : ""}>{counts.failed}</span></Detail>
            </dl>
          </CardBody>
        </Card>
      </div>

      {skipped.length > 0 && (
        <Alert tone="warning" className="mb-5" title={`${skipped.reduce((n, s) => n + s.count, 0)} left out when it was sent`}>
          <ul className="list-disc pl-5">{skipped.map((s) => <li key={s.reason}>{s.reason}: {s.count}{s.names?.length ? ` (${s.names.slice(0, 6).join(", ")}${s.count > 6 ? " and others" : ""})` : ""}</li>)}</ul>
        </Alert>
      )}

      <h2 className="mb-3 text-lg font-semibold">Each person</h2>
      <ListToolbar placeholder="Search name or number" showArchived={false} filters={[
        { key: "status", label: "Status", options: [{ value: "QUEUED", label: "Queued" }, { value: "SENT", label: "Sent" }, { value: "DELIVERED", label: "Delivered" }, { value: "READ", label: "Read" }, { value: "FAILED", label: "Failed" }, { value: "backup", label: "Sent by SMS backup" }] },
        { key: "channel", label: "Channel", options: m.channels.concat(m.smsBackup && !m.channels.includes("sms") ? ["sms"] : []).map((c) => ({ value: c, label: CHANNEL_LABEL[c as Channel] ?? c })) },
      ]} />
      <DataTable
        caption="Delivery status of each person"
        rows={data.rows}
        total={data.total}
        params={list}
        pageSize={PAGE}
        path={`/communication/history/${m.id}`}
        rowKey={(r) => r.id}
        empty={<EmptyState title={list.q || Object.keys(list.filters).length ? "Nobody matches these filters" : "Nobody was sent this message"}>{list.q || Object.keys(list.filters).length ? "Change the search or filters." : "Everyone chosen was left out; see the reasons above."}</EmptyState>}
        columns={[
          { key: "name", label: "Name", phone: "title", cell: (r) => (
            <div>
              <p className="font-medium">{r.name}</p>
              <p className="text-sm text-ink-2">{r.description}</p>
              <details className="mt-1 text-sm">
                <summary className="cursor-pointer text-brand-text">Message text</summary>
                <p className="mt-1 max-w-prose whitespace-pre-line rounded-lg bg-surface-2 p-2">{shownText(r.text, m.sourceType, r.provider)}</p>
              </details>
            </div>
          ) },
          { key: "channel", label: "Channel", phone: "meta", cell: (r) => `${CHANNEL_LABEL[r.channel as Channel] ?? r.channel}${r.isBackup ? " (SMS backup)" : ""}` },
          { key: "to", label: "Sent to", phone: "meta", cell: (r) => r.address },
          { key: "status", label: "Status", phone: "badge", cell: (r) => <Badge tone={TONE[r.status]}>{r.isBackup ? `Sent by SMS backup: ${DELIVERY_LABEL[r.status]}` : DELIVERY_LABEL[r.status]}</Badge> },
          { key: "detail", label: "Detail", phone: "meta", cell: (r) => (
            r.status === "FAILED" ? <span className="text-danger">{r.failReason ?? "Failed"}</span>
              : r.isBackup && r.backupReason ? <span className="text-ink-2">{r.backupReason}</span>
              : <span className="text-ink-2">{r.readAt ? `Read ${formatDateTime(r.readAt, tz)}` : r.deliveredAt ? `Delivered ${formatDateTime(r.deliveredAt, tz)}` : r.sentAt ? `Sent ${formatDateTime(r.sentAt, tz)}` : "Waiting to go"}{r.provider === "sandbox" ? " · test mode" : ""}</span>
          ) },
          { key: "history", label: "Person", cell: (r) => {
            const key = r.guardianId ? `guardian:${r.guardianId}` : r.studentId && r.recipientType === "student" ? `student:${r.studentId}` : r.staffId ? `staff:${r.staffId}` : null;
            return key ? <Link className="text-sm text-brand-text hover:underline" href={`/communication/history?person=${key}`}>All messages</Link> : null;
          } },
        ]}
      />
    </>
  );
}
