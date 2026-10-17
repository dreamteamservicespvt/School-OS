import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { CheckCheck, CircleAlert, Coins, Eye, Info, MessageSquareText, Users } from "lucide-react";
import { withSchool } from "@/lib/db";
import { commPage } from "@/lib/communication/access";
import { readListParams, skipTake, listHref } from "@/lib/list";
import { formatDateTime } from "@/lib/format";
import { CHANNEL_LABEL, onChannels, type Channel } from "@/lib/messaging/channels";
import { retryableFailures } from "@/lib/messaging/deliver";
import { NOT_SENT } from "@/lib/messaging/send";
import { RULES } from "@/lib/messaging/automatic";
import { withHiddenLinks } from "@/lib/parent-link/token";
import { countsFor, DELIVERY_LABEL, MESSAGE_STATUS_LABEL, senderNames } from "@/lib/communication/history";
import { EmptyState } from "@/components/empty-state";
import { Pill, type PillTone } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Banner } from "@/components/ui/banner";
import { Stats } from "@/components/ui/stats";
import { Toolbar } from "@/components/ui/toolbar";
import { DataList } from "@/components/ui/data-list";
import { BackLink, Col, DL, RecordHead, Split } from "@/components/ui/split";
import { UrlSearch, UrlSelect } from "@/components/ui/url-filters";
import { ChannelPills } from "../../_components/channel-pills";
import { MessageActions } from "./message-actions";

export const metadata: Metadata = { title: "Message" };

const TONE: Record<string, PillTone> = { QUEUED: "neutral", SENDING: "neutral", SENT: "neutral", DELIVERED: "info", READ: "ok", FAILED: "bad" };
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

  const pct = (a: number) => (counts.total ? `${Math.round((a / counts.total) * 100)}%` : "");
  const sample = data.rows.find((r) => !r.isBackup) ?? data.rows[0];
  const statusCount = (st: string) => st === "backup" ? counts.backup : st === "FAILED" ? counts.failed : st === "READ" ? counts.read : st === "QUEUED" ? counts.queued : 0;
  type R = (typeof data.rows)[number];
  const personKey = (r: R) => r.guardianId ? `guardian:${r.guardianId}` : r.studentId && r.recipientType === "student" ? `student:${r.studentId}` : r.staffId ? `staff:${r.staffId}` : null;
  const when = (r: R) => r.readAt ? formatDateTime(r.readAt, tz) : r.deliveredAt ? formatDateTime(r.deliveredAt, tz) : r.sentAt ? formatDateTime(r.sentAt, tz) : r.failedAt ? formatDateTime(r.failedAt, tz) : "Waiting to go";
  // "Not sent": no channel could carry it to this person (the reason says why); resend once a channel can.
  const notSent = (r: R) => r.status === "FAILED" && Boolean(r.failReason?.startsWith(NOT_SENT));
  const statusWord = (r: R) => (r.isBackup ? "Sent by SMS backup" : notSent(r) ? "Not sent" : DELIVERY_LABEL[r.status]);
  const why = (r: R) => r.status === "FAILED" ? (notSent(r) ? r.failReason!.slice(NOT_SENT.length) : r.failReason ?? "Failed") : r.isBackup && r.backupReason ? r.backupReason : r.provider === "sandbox" ? "Test mode: not really sent" : null;
  const senderName = sender.replace(/^Rule: /, "");
  const details: [string, React.ReactNode][] = [["To", m.audienceLabel], ["Status", MESSAGE_STATUS_LABEL[m.status]]];
  if (m.trigger) details.push(["Why", m.trigger]);
  if (data.resendOf) details.push(["Resend of", <Link key="r" className="text-brand font-semibold hover:underline" href={`/communication/history/${data.resendOf.id}`}>{data.resendOf.title ?? data.resendOf.audienceLabel}</Link>]);
  if (m.smsBackup) details.push(["SMS backup", counts.backup ? `${counts.backup} also sent by SMS (${data.backupWhy.map((b) => `${b.backupReason ?? "not delivered"}: ${b._count._all}`).join("; ")})` : "On; none needed yet"]);
  const filtered = Boolean(list.q || Object.keys(list.filters).length);

  return (
    <>
      <BackLink href="/communication/history" label="Message History" sub={formatDateTime(m.createdAt, tz)} />
      <RecordHead title={m.title ?? m.trigger ?? "Message"}
        sub={<>{formatDateTime(m.sentAt ?? m.scheduledAt ?? m.createdAt, tz)} · {m.ruleKey ? "Automatic rule" : "Sent by"} {senderName} <ChannelPills channels={m.channels} backup={m.smsBackup} /></>}
        actions={access.canChange ? (
          <MessageActions id={m.id} canCancel={m.status === "SCHEDULED"}
            scheduledWords={m.scheduledAt ? `It was going to ${m.recipientCount} people on ${formatDateTime(m.scheduledAt, tz)}.` : null}
            retryable={m.status === "CANCELLED" ? 0 : data.retry.rows.length} overLimit={data.retry.overLimit} retryLimit={data.retry.retryLimit}
            unread={sent ? data.unread : 0} failed={sent ? counts.failed : 0} notSent={sent ? data.retry.notSent : 0}
            channels={(["whatsapp", "sms", "email", "app"] as Channel[]).filter((c) => data.on.includes(c))} labels={CHANNEL_LABEL} />
        ) : m.status === "CANCELLED" ? <Pill tone="neutral">Cancelled · not sent</Pill> : null} />

      <div className="flex flex-col gap-5 lg:gap-6">
        {m.status === "SCHEDULED" && m.scheduledAt && <Banner tone="info" title={`Scheduled for ${formatDateTime(m.scheduledAt, tz)}.`}>Nobody has received it yet. You can cancel it until it goes.</Banner>}
        {m.status === "CANCELLED" && <Banner tone="warn" title="Cancelled.">{m.cancelledAt ? `On ${formatDateTime(m.cancelledAt, tz)}` : ""}{m.cancelledById ? ` by ${data.names.get(m.cancelledById) ?? "staff"}` : ""}. Nobody got it, and no credits were used.</Banner>}
        {m.isEmergency && <Banner tone="bad" title="Emergency broadcast.">Sent also to parents who opted out.</Banner>}
        {data.rows.some((r) => r.provider === "sandbox") && <Banner tone="warn" title="Test mode: not really sent.">The channel is in test mode in Settings, SMS, WhatsApp &amp; Email, so the people marked &ldquo;Test mode&rdquo; below did not receive this message. It is only recorded.</Banner>}
        {skipped.length > 0 && (
          <Banner tone="warn" title={`${skipped.reduce((n, x) => n + x.count, 0)} left out when it was sent:`}>
            {skipped.map((x) => `${x.reason} ${x.count}${x.names?.length ? ` (${x.names.slice(0, 4).join(", ")}${x.count > 4 ? " and others" : ""})` : ""}`).join("; ")}.
          </Banner>
        )}
        <Stats items={[
          { label: "Recipients", value: counts.total.toLocaleString("en-IN"), icon: Users },
          { label: "Delivered", value: counts.delivered.toLocaleString("en-IN"), tone: "ok", icon: CheckCheck, sub: pct(counts.delivered) },
          { label: "Read", value: counts.read.toLocaleString("en-IN"), icon: Eye, sub: pct(counts.read) },
          { label: "Failed", value: counts.failed.toLocaleString("en-IN"), tone: counts.failed ? "bad" : undefined, icon: CircleAlert, sub: counts.backup ? `${counts.backup} also sent by SMS backup` : counts.failed ? "Retry or resend by another channel" : "None" },
          { label: "Credits", value: m.creditCost ? m.creditCost.toLocaleString("en-IN") : "Free", icon: Coins, sub: m.smsBackup ? "Includes SMS backup" : undefined },
        ]} />
        <Split side={340}>
          <Card className="overflow-hidden min-w-0">
            <Toolbar>
              <UrlSearch placeholder="Name or number" />
              <UrlSelect param="status" label="Status" className="md:w-52" options={[
                { value: "", label: `Everyone · ${counts.total}` },
                ...[["READ", "Read"], ["DELIVERED", "Delivered"], ["SENT", "Sent"], ["backup", "Sent by SMS backup"], ["FAILED", "Failed"], ["QUEUED", "Queued"]]
                  .filter(([v]) => v === "DELIVERED" || v === "SENT" || statusCount(v) > 0).map(([v, l]) => ({ value: v, label: statusCount(v) ? `${l} · ${statusCount(v)}` : l })),
              ]} />
              {m.channels.length > 1 && <UrlSelect param="channel" label="Channel" className="md:w-40" options={[{ value: "", label: "All channels" }, ...m.channels.map((c) => ({ value: c, label: CHANNEL_LABEL[c as Channel] ?? c }))]} />}
            </Toolbar>
            <DataList
              caption="Delivery status of each person"
              rows={data.rows}
              rowKey={(r) => r.id}
              href={(r) => { const k = personKey(r); return k ? `/communication/history?mode=person&person=${k}` : `/communication/history/${m.id}`; }}
              minWidth={600}
              paging={{ page: list.page, pageSize: PAGE, total: data.total, href: (p) => listHref(`/communication/history/${m.id}`, list, { page: p }) }}
              empty={<EmptyState bare title={filtered ? "Nobody matches" : "Nobody was sent this message"}>{filtered ? "Try another name or status." : "Everyone chosen was left out; see the reasons above."}</EmptyState>}
              columns={[
                { key: "name", label: "Recipient", render: (r) => <div className="flex items-center gap-2.5"><Avatar name={r.name} size={32} /><div className="min-w-0"><p className="font-semibold leading-tight truncate">{r.name}</p><p className="text-[12.5px] text-ink3 truncate">{r.description ?? r.address}</p></div></div> },
                { key: "ch", label: "Channel", render: (r) => <span className="text-[13px]">{CHANNEL_LABEL[r.channel as Channel] ?? r.channel}</span> },
                { key: "st", label: "Status", render: (r) => <div><Pill tone={TONE[r.status]} dot>{statusWord(r)}</Pill>{why(r) && <p className="text-[12px] text-ink3 mt-0.5">{why(r)}</p>}</div> },
                { key: "t", label: "Time", align: "right", nowrap: true, render: (r) => <span className="text-[13px]">{when(r)}</span> },
              ]}
              mobile={(r) => ({ title: r.name, sub: why(r) ?? r.description ?? r.address, avatar: r.name, right: <Pill tone={TONE[r.status]} className="!h-[22px] !text-[11.5px]">{r.isBackup ? "SMS backup" : notSent(r) ? "Not sent" : DELIVERY_LABEL[r.status]}</Pill> })}
            />
          </Card>
          <Col>
            <Card>
              <CardHeader title="The message" description={m.ruleKey ? `Automatic: ${senderName}` : `By ${senderName}`} icon={MessageSquareText} />
              <div className="px-5 pb-5">
                <div className="rounded-2xl rounded-tl-md bg-sunken/70 p-3.5 text-[14px] leading-relaxed whitespace-pre-line break-words">{sample ? shownText(sample.text, m.sourceType, sample.provider) : withHiddenLinks(m.body)}</div>
                {sample && <p className="text-[12.5px] text-ink3 mt-2">Shown as {sample.name} received it. Each person’s copy fills in their own details.</p>}
              </div>
            </Card>
            <Card>
              <CardHeader title="Details" icon={Info} />
              <DL cols={1} rows={details} />
            </Card>
          </Col>
        </Split>
      </div>
    </>
  );
}
