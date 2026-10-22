import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, CheckCheck, CircleAlert, Eye, History as HistoryIcon, Megaphone, Send, Users, Zap } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { commPage } from "@/lib/communication/access";
import { readListParams, skipTake, listHref, PAGE_SIZE } from "@/lib/list";
import { formatDate, formatDateTime } from "@/lib/format";
import { countsFor, DELIVERY_LABEL, HISTORY_FILTERS, historyWhere, inTestMode, messageCampusWhere, recipientCampusWhere, senderNames, senderWords } from "@/lib/communication/history";
import { Card } from "@/components/ui/card";
import { Stats } from "@/components/ui/stats";
import { Toolbar } from "@/components/ui/toolbar";
import { DataList } from "@/components/ui/data-list";
import { Pill } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink } from "@/components/ui/button";
import { Timeline, type TimelineItem } from "@/components/ui/timeline";
import { UrlSearch, UrlSegmented, UrlSelect } from "@/components/ui/url-filters";
import { EmptyState } from "@/components/empty-state";
import { ExportMenu } from "@/components/communication/export-menu";
import { PeriodFilter } from "@/components/list/period-filter";
import { CommHead } from "../_components/comm-head";
import { ChannelPills, CHANNEL_ICON, CHANNEL_NAME } from "../_components/channel-pills";

export const metadata: Metadata = { title: "Message History" };

type Search = Promise<Record<string, string | string[] | undefined>>;
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "–");

export default async function MessageHistoryPage({ searchParams }: { searchParams: Search }) {
  const access = await commPage();
  const { current } = access;
  const sp = await searchParams;
  const mode = sp.mode === "person" ? "person" : "all";
  const params = readListParams(sp, HISTORY_FILTERS);
  const tz = current.school.timeZone;
  const where = historyWhere(current.ctx, access.full, params, tz);
  const mineOnly: Prisma.MessageWhereInput = { schoolId: current.ctx.schoolId, ...(access.full ? {} : { sentById: current.ctx.userId }) };

  const data = await withSchool(current.ctx, async (tx) => {
    // A person limited to one campus sees the messages about their campus (and the people of it) only.
    const campus = await messageCampusWhere(tx, current.ctx, access.scope.campusId);
    const ofCampus = await recipientCampusWhere(tx, current.ctx, access.scope.campusId);
    const listWhere: Prisma.MessageWhereInput = { AND: [where, campus] };
    const mine: Prisma.MessageWhereInput = { AND: [mineOnly, campus] };
    // The people reached: every recipient is of a message of this school, so with full access and the whole school
    // there is nothing to check on the message (G37: joining every recipient to its message took seconds at a big school).
    const ofMine: Prisma.MessageRecipientWhereInput = access.full && !access.scope.campusId ? {} : { message: mine };
    const [rows, total, sentCount, reach, firstSent, testMode] = await Promise.all([
      tx.message.findMany({ where: listWhere, orderBy: { createdAt: params.sort === "date" && params.dir === "asc" ? "asc" : "desc" }, ...skipTake(params) }),
      tx.message.count({ where: listWhere }),
      tx.message.count({ where: { AND: [mine], status: { in: ["SENT", "QUEUED"] } } }),
      tx.messageRecipient.groupBy({ by: ["status", "provider"], where: { schoolId: current.ctx.schoolId, isBackup: false, ...ofMine, AND: [ofCampus] }, _count: { _all: true } }),
      tx.message.findFirst({ where: mine, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
      // Test mode (no provider connected yet): only recorded, nothing reached anyone, so never counted as delivered.
      tx.messageRecipient.count({ where: { schoolId: current.ctx.schoolId, isBackup: false, provider: "sandbox", status: { in: ["SENT", "DELIVERED", "READ"] }, ...ofMine, AND: [ofCampus] } }),
    ]);
    // "One person": everyone this sender has messaged, found by name; then their messages, newest first.
    const who = typeof sp.who === "string" ? sp.who.trim().slice(0, 60) : "";
    const people = mode === "person" && who.length >= 2
      ? await tx.messageRecipient.findMany({
          where: { schoolId: current.ctx.schoolId, name: { contains: who, mode: "insensitive" }, message: mine, AND: [ofCampus] },
          distinct: ["recipientType", "guardianId", "studentId", "staffId"], take: 8, orderBy: { queuedAt: "desc" },
          select: { recipientType: true, guardianId: true, studentId: true, staffId: true, name: true, description: true },
        })
      : [];
    const person = params.filters.person ?? null;
    let timeline: { name: string; description: string | null; items: Prisma.MessageRecipientGetPayload<{ include: { message: { select: { id: true; title: true; trigger: true; sourceType: true } } } }>[] } | null = null;
    if (mode === "person" && person && /^(guardian|student|staff):[0-9a-f-]{36}$/.test(person)) {
      const [type, id] = person.split(":");
      const items = await tx.messageRecipient.findMany({
        where: { schoolId: current.ctx.schoolId, message: mine, AND: [ofCampus], ...(type === "guardian" ? { guardianId: id } : type === "student" ? { studentId: id } : { staffId: id }) },
        include: { message: { select: { id: true, title: true, trigger: true, sourceType: true } } },
        orderBy: { queuedAt: "desc" }, take: 60,
      });
      timeline = { name: items[0]?.name ?? "", description: items[0]?.description ?? null, items };
    }
    return { rows, total, sentCount, reach, firstSent, testMode, people, timeline, counts: await countsFor(tx, current.ctx, rows.map((r) => r.id)), names: await senderNames(tx, rows.map((r) => r.sentById)) };
  });

  const by = (s: string) => data.reach.filter((r) => r.status === s && !inTestMode(r)).reduce((a, r) => a + r._count._all, 0);
  const reached = data.reach.reduce((a, r) => a + r._count._all, 0);
  const delivered = by("DELIVERED") + by("READ");
  const read = by("READ");
  const failed = by("FAILED");
  const retryLimit = 3;
  const exportHref = listHref("/communication/history/export", { ...params, page: 1 }, {});
  const anyFilter = Boolean(params.q || Object.keys(params.filters).length);
  const sender = (m: (typeof data.rows)[number]) => senderWords(m, data.names).replace(/^Rule: /, "");

  return (
    <>
      <CommHead access={access} page="Message History" href="/communication/history"
        sub={access.full ? "Everything sent: by people, by automatic rules and with notices. Open one to see each person’s status." : "Only messages you sent. Open one to see each person’s status."}
        actions={<ButtonLink href="/communication" variant="primary" icon={Send}>Send message</ButtonLink>} />
      <div className="flex flex-col gap-5 lg:gap-6">
        <Stats items={[
          { label: "Messages sent", value: data.sentCount.toLocaleString("en-IN"), sub: data.firstSent ? `Since ${formatDate(data.firstSent.createdAt, tz)}` : "None yet", icon: Send },
          { label: "People reached", value: reached.toLocaleString("en-IN"), sub: "One line per person", icon: Users },
          { label: "Delivered", value: pct(delivered, reached), sub: data.testMode ? `${delivered.toLocaleString("en-IN")} people; ${data.testMode.toLocaleString("en-IN")} only recorded in test mode` : `${delivered.toLocaleString("en-IN")} people`, tone: "ok", icon: CheckCheck },
          { label: "Read", value: reached ? `${Math.round((read / reached) * 100)}%` : "–", sub: `${read.toLocaleString("en-IN")} people`, icon: Eye },
          { label: "Failed", value: failed.toLocaleString("en-IN"), sub: `Retry up to ${retryLimit} times`, tone: failed ? "bad" : undefined, icon: CircleAlert, href: failed ? "/communication/history?status=failed" : undefined },
        ]} />
        {data.testMode > 0 && (
          <Alert tone="warning" title="Some messages were sent in test mode">
            {data.testMode.toLocaleString("en-IN")} {data.testMode === 1 ? "message was" : "messages were"} only recorded, because the channel is in test mode in Settings, SMS, WhatsApp &amp; Email. Nobody received them, so they are not counted as delivered. Open a message to see which.
          </Alert>
        )}
        <Card className="overflow-hidden">
          <Toolbar className="flex-wrap">
            <UrlSegmented param="mode" label="Show" options={[{ value: "all", label: "All messages" }, { value: "person", label: "One person" }]} />
            {mode === "all" ? (
              <>
                <UrlSearch placeholder="Title, message or sender" className="min-w-[14rem]" />
                <UrlSelect param="channel" label="Channel" className="md:w-44" options={[{ value: "", label: "All channels" }, { value: "whatsapp", label: "WhatsApp" }, { value: "sms", label: "SMS" }, { value: "email", label: "Email" }, { value: "app", label: "App notice" }]} />
                <UrlSelect param="status" label="Status" className="md:w-40" options={[{ value: "", label: "Any status" }, { value: "failed", label: "Has failed" }, { value: "SCHEDULED", label: "Scheduled" }, { value: "QUEUED", label: "Sending" }, { value: "SENT", label: "Sent" }, { value: "CANCELLED", label: "Cancelled" }]} />
                {access.full && <UrlSelect param="sender" label="Sent by" className="md:w-44" options={[{ value: "", label: "Anyone" }, { value: "me", label: "Me" }, { value: "people", label: "People" }, { value: "rules", label: "Automatic rules" }, { value: "notices", label: "Notices" }]} />}
                <PeriodFilter timeZone={tz} />
                {data.total > 0 && <ExportMenu href={exportHref} />}
              </>
            ) : (
              <UrlSearch param="who" placeholder="Parent, student or staff" />
            )}
          </Toolbar>
          {mode === "person" ? (
            <div className="p-4 md:p-5 grid lg:grid-cols-[280px_minmax(0,1fr)] gap-5 items-start">
              <div className="flex flex-col gap-2">
                {data.people.map((p) => {
                  const key = `${p.recipientType}:${p.guardianId ?? p.studentId ?? p.staffId}`;
                  return (
                    <Link key={key} href={`/communication/history?mode=person&person=${key}`} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-sunken/70">
                      <Avatar name={p.name} size={38} />
                      <span className="min-w-0 flex-1"><span className="block font-semibold text-[14.5px] truncate">{p.name}</span><span className="block text-[12.5px] text-ink3 truncate">{p.description}</span></span>
                    </Link>
                  );
                })}
                {typeof sp.who === "string" && sp.who.trim().length >= 2 && data.people.length === 0 && <p className="text-[13.5px] text-ink3 px-1">Nobody by that name has been sent a message.</p>}
                {data.timeline?.name && (
                  <div className="rounded-xl border border-line p-3 flex items-center gap-3 mt-1">
                    <Avatar name={data.timeline.name} size={40} />
                    <div className="min-w-0"><p className="font-semibold text-[14.5px]">{data.timeline.name}</p><p className="text-[12.5px] text-ink3">{data.timeline.description}</p></div>
                  </div>
                )}
                <p className="text-[12.5px] text-ink3">All channels, newest first. Also on the student’s profile.</p>
              </div>
              {data.timeline && data.timeline.items.length ? (
                <Timeline items={data.timeline.items.map((r): TimelineItem => ({
                  icon: r.message.sourceType === "Notice" ? Megaphone : CHANNEL_ICON[r.channel] ?? Send,
                  tone: r.status === "FAILED" ? "bad" : r.isBackup ? "warn" : r.status === "READ" || r.status === "DELIVERED" ? "ok" : "neutral",
                  what: <Link href={`/communication/history/${r.message.id}`} className="hover:underline">{CHANNEL_NAME[r.channel] ?? r.channel}{r.isBackup ? " by SMS backup" : ""}: {r.message.title ?? r.message.trigger ?? r.text.slice(0, 80)} · {(DELIVERY_LABEL[r.status] ?? r.status).toLowerCase()}{r.failReason ? ` (${r.failReason})` : ""}</Link>,
                  when: `${formatDateTime(r.queuedAt, tz)}${r.readAt ? ` · read ${formatDateTime(r.readAt, tz)}` : ""}`,
                }))} />
              ) : (
                <EmptyState bare Icon={HistoryIcon} title="Find a person">Search for a parent, student or staff member to see every message they were sent.</EmptyState>
              )}
            </div>
          ) : (
            <DataList
              caption="Messages sent"
              rows={data.rows}
              rowKey={(m) => m.id}
              href={(m) => `/communication/history/${m.id}`}
              minWidth={880}
              paging={{ page: params.page, pageSize: PAGE_SIZE, total: data.total, href: (p) => listHref("/communication/history", params, { page: p }) }}
              empty={
                <EmptyState bare Icon={HistoryIcon} title={anyFilter ? "Nothing matches" : "You have not sent any messages yet"}
                  action={!anyFilter && access.canChange ? <ButtonLink href="/communication" icon={Send}>Send a message</ButtonLink> : undefined}>
                  {anyFilter ? "Try another channel or status." : "Messages you send show up here with each person’s status."}
                </EmptyState>
              }
              columns={[
                { key: "at", label: "When", nowrap: true, render: (m) => <span className="tnum text-[13px]">{formatDateTime(m.scheduledAt && m.status === "SCHEDULED" ? m.scheduledAt : m.createdAt, tz)}</span> },
                { key: "title", label: "Message", render: (m) => <div className="max-w-[260px]"><p className="font-semibold leading-snug truncate">{m.title ?? m.trigger ?? m.body.slice(0, 60)}</p><p className="text-[12.5px] text-ink3 flex items-center gap-1 truncate">{m.ruleKey && <Zap size={12} aria-hidden="true" />}{sender(m)}</p></div> },
                { key: "ch", label: "Channel", render: (m) => <ChannelPills channels={m.channels} backup={m.smsBackup} /> },
                { key: "n", label: "To", align: "right", render: (m) => m.recipientCount.toLocaleString("en-IN") },
                { key: "del", label: "Delivered", align: "right", render: (m) => m.status === "SCHEDULED" ? <Pill tone="info">Scheduled</Pill> : m.status === "CANCELLED" ? <Pill tone="neutral">Cancelled</Pill> : (data.counts.get(m.id)?.testMode ?? 0) > 0 && !data.counts.get(m.id)?.delivered ? <Pill tone="warn">Test mode</Pill> : <span className="text-ok font-semibold">{(data.counts.get(m.id)?.delivered ?? 0).toLocaleString("en-IN")}</span> },
                { key: "read", label: "Read", align: "right", render: (m) => (m.status === "SCHEDULED" || m.status === "CANCELLED" ? "–" : (data.counts.get(m.id)?.read ?? 0).toLocaleString("en-IN")) },
                { key: "fail", label: "Failed", align: "right", render: (m) => { const f = data.counts.get(m.id)?.failed ?? 0; return f ? <span className="text-bad font-semibold">{f}</span> : <span className="text-ink3">0</span>; } },
                { key: "cost", label: "Credits", align: "right", render: (m) => (m.creditCost ? m.creditCost.toLocaleString("en-IN") : "Free") },
              ]}
              mobile={(m) => {
                const c = data.counts.get(m.id);
                const Ic = m.channels.includes("whatsapp") ? CHANNEL_ICON.whatsapp : m.channels.includes("email") ? CHANNEL_ICON.email : m.status === "SCHEDULED" ? CalendarClock : CHANNEL_ICON.app;
                return {
                  title: m.title ?? m.trigger ?? m.body.slice(0, 60),
                  sub: `${formatDateTime(m.scheduledAt && m.status === "SCHEDULED" ? m.scheduledAt : m.createdAt, tz)} · ${sender(m)}`,
                  icon: Ic, iconTone: c?.failed ? "bad" : "ok",
                  pills: m.status === "SCHEDULED"
                    ? [<Pill key="s" tone="info" className="!h-[22px] !text-[11.5px]">Scheduled · {m.recipientCount}</Pill>]
                    : [c?.testMode && !c.delivered ? <Pill key="d" tone="warn" className="!h-[22px] !text-[11.5px]">Test mode · not sent</Pill> : <Pill key="d" tone="ok" className="!h-[22px] !text-[11.5px]">{c?.delivered ?? 0} of {m.recipientCount} delivered</Pill>, c?.failed ? <Pill key="f" tone="bad" className="!h-[22px] !text-[11.5px]">{c.failed} failed</Pill> : null],
                };
              }}
            />
          )}
        </Card>
      </div>
    </>
  );
}
