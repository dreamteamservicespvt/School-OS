import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, History as HistoryIcon, Info, Lock, MessagesSquare, Plus, Send, TriangleAlert } from "lucide-react";
import { withSchool } from "@/lib/db";
import { commPage } from "@/lib/communication/access";
import { formatDateTime } from "@/lib/format";
import { CAME_BY, QUERY_PRIORITIES, QUERY_STATUS_LABEL, QUERY_TYPE_LABEL, queryWhere, replyChannels } from "@/lib/communication/queries";
import { queryLabels } from "@/lib/communication/query-list";
import { CHANNEL_LABEL, onChannels } from "@/lib/messaging/channels";
import type { QueryType } from "@/lib/messaging/settings";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill, type PillTone } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { Timeline, type TimelineItem } from "@/components/ui/timeline";
import { BackLink, Col, DL, RecordHead, Split } from "@/components/ui/split";
import { cx } from "@/components/ui/cx";
import { QueryComposer, QueryHeadActions, QuerySide } from "./query-panel";
import { ownerOptions } from "../owners";

export const metadata: Metadata = { title: "Query" };

const STATUS_TONE: Record<string, PillTone> = { OPEN: "brand", IN_PROGRESS: "warn", RESOLVED: "ok", CLOSED: "neutral" };
const PRIORITY_TONE: Record<string, PillTone> = { low: "neutral", normal: "neutral", high: "warn", urgent: "bad" };

export default async function QueryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const access = await commPage();
  const { current } = access;
  const tz = current.school.timeZone;
  const data = await withSchool(current.ctx, async (tx) => {
    const q = await tx.query.findFirst({ where: { AND: [{ id }, await queryWhere(tx, current.ctx, access.full ? "all" : "own", access.scope.campusId)] } });
    if (!q) return null;
    const notes = await tx.queryNote.findMany({ where: { queryId: q.id }, orderBy: { createdAt: "asc" } });
    const ids = [...notes.map((n) => n.createdById), q.createdById].filter(Boolean) as string[];
    const authors = await tx.userLogin.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } });
    const staff = current.user.id ? await tx.staff.findFirst({ where: { schoolId: current.ctx.schoolId, userLoginId: current.user.id }, select: { departmentId: true } }) : null;
    const on = await onChannels(tx, current.ctx);
    return { q, notes, authors: new Map(authors.map((a) => [a.id, a.displayName])), labels: await queryLabels(tx, [q]), owners: await ownerOptions(tx, current.ctx, access.scope.campusId), myDept: staff?.departmentId ?? null, on };
  });
  if (!data) notFound();
  const { q, labels } = data;
  const channels = replyChannels(q).filter((c) => data.on.has(c)).filter((c) => c !== "app" || q.fromType !== "guardian");
  const open = q.status === "OPEN" || q.status === "IN_PROGRESS";
  const overdue = Boolean(q.dueBy && q.dueBy < new Date() && open);
  const type = QUERY_TYPE_LABEL[q.type as QueryType] ?? q.type;
  const topic = labels.topic(q);
  const cameBy = CAME_BY.find((c) => c.key === q.cameBy)?.label ?? q.cameBy;
  const priority = QUERY_PRIORITIES.find((p) => p.key === q.priority)?.label ?? q.priority;
  const who = (uid: string | null) => (uid ? data.authors.get(uid) ?? "Staff" : "School OS");
  const canPickUp = !q.ownerId && (access.full || (q.departmentId !== null && q.departmentId === data.myDept));

  const thread = data.notes.filter((n) => n.kind !== "change");
  const history: TimelineItem[] = [
    ...data.notes.filter((n) => n.kind === "change").reverse().map((n) => ({
      icon: /resolved/i.test(n.text) ? CircleCheck : /escalat/i.test(n.text) ? TriangleAlert : HistoryIcon,
      tone: (/resolved/i.test(n.text) ? "ok" : /escalat/i.test(n.text) ? "bad" : "neutral") as TimelineItem["tone"],
      what: <>{n.text}{n.createdById ? <span className="text-ink3"> · {who(n.createdById)}</span> : null}</>,
      when: formatDateTime(n.createdAt, tz),
    })),
    { icon: Plus, tone: "brand", what: `Logged from ${cameBy.toLowerCase()}${q.createdById ? ` by ${who(q.createdById)}` : ""}`, when: formatDateTime(q.createdAt, tz) },
  ];
  const details: [string, React.ReactNode][] = [
    ["From", [q.fromName, q.fromPhone].filter(Boolean).join(" · ")],
    ["About", labels.about(q) || "General"],
    ["Type and topic", [type, topic].filter(Boolean).join(" · ")],
    ["Owner", labels.owner(q)],
    ["Came by", cameBy],
    ...(access.canChange && open ? [] : [["Priority", priority] as [string, React.ReactNode]]),
    ["Due by", q.dueBy ? <span key="d" className={cx("tnum", overdue && "text-bad font-semibold")}>{formatDateTime(q.dueBy, tz)}</span> : "No limit"],
  ];
  if (q.rating) details.push(["Rating", `${q.rating} of 5`]);

  return (
    <>
      <BackLink href="/communication/queries" label="Feedback & Queries" sub={q.number} />
      <RecordHead title={`${topic ? `${topic}: ` : ""}${type.toLowerCase()} from ${q.fromName}`}
        sub={<>
          <Pill tone={STATUS_TONE[q.status]} dot>{QUERY_STATUS_LABEL[q.status]}</Pill>
          <Pill tone={PRIORITY_TONE[q.priority] ?? "neutral"}>{priority} priority</Pill>
          {overdue && <Pill tone="bad">Overdue</Pill>}
        </>}
        actions={access.canChange ? <QueryHeadActions id={q.id} status={q.status} canPickUp={canPickUp} owners={data.owners} /> : undefined} />

      <div className="flex flex-col gap-5 lg:gap-6">
        {overdue && <Banner tone="bad" title="Past its reply time limit.">It was due by {formatDateTime(q.dueBy!, tz)}.</Banner>}
        {q.escalatedAt && <Banner tone="warn" title="Escalated.">On {formatDateTime(q.escalatedAt, tz)}, because it was overdue.</Banner>}
        {q.resolution && <Banner tone="ok" icon={CircleCheck} title={`Resolved${q.resolvedAt ? ` on ${formatDateTime(q.resolvedAt, tz)}` : ""}.`}><span className="whitespace-pre-line">{q.resolution}</span></Banner>}
        <Split side={340}>
          <Card className="min-w-0">
            <CardHeader title="Conversation" description="Internal notes never leave School OS" icon={MessagesSquare} />
            <ol className="px-5 pb-5 flex flex-col gap-3">
              <li className="rounded-2xl p-3.5 text-[14px] bg-sunken/70 mr-6">
                <p className="text-[12.5px] font-semibold flex items-center gap-1.5 mb-1 flex-wrap">{q.fromName}<span className="text-ink3 font-normal ml-auto">{formatDateTime(q.createdAt, tz)} · {cameBy}</span></p>
                <p className="leading-relaxed whitespace-pre-line break-words">{q.details}</p>
              </li>
              {thread.map((n) => (
                <li key={n.id} className={cx("rounded-2xl p-3.5 text-[14px]", n.kind === "internal" ? "bg-warn/8 border border-warn/25" : "bg-brand/8 ml-6")}>
                  <p className="text-[12.5px] font-semibold flex items-center gap-1.5 mb-1 flex-wrap">
                    {n.kind === "internal" ? <Lock size={13} className="text-warn" aria-hidden="true" /> : <Send size={13} className="text-brand" aria-hidden="true" />}
                    {who(n.createdById)}
                    {n.kind === "internal" && <span className="text-warn">· Internal note</span>}
                    <span className="text-ink3 font-normal ml-auto">{formatDateTime(n.createdAt, tz)}</span>
                  </p>
                  <p className="leading-relaxed whitespace-pre-line break-words">{n.text}</p>
                  {n.messageId && <Link href={`/communication/history/${n.messageId}`} className="mt-1.5 inline-block text-[12.5px] font-semibold text-brand hover:underline">See delivery</Link>}
                </li>
              ))}
            </ol>
            {access.canChange && open && <QueryComposer id={q.id} fromName={q.fromName} replyChannels={channels.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))} />}
          </Card>
          <Col>
            <Card>
              <CardHeader title="Details" icon={Info} />
              <DL cols={1} rows={details} />
              {access.canChange && <QuerySide id={q.id} status={q.status} priority={q.priority} rating={q.rating} priorities={QUERY_PRIORITIES.map((p) => ({ value: p.key, label: p.label }))} />}
            </Card>
            <Card>
              <CardHeader title="History" icon={HistoryIcon} />
              <div className="px-5 pb-5"><Timeline items={history} /></div>
            </Card>
          </Col>
        </Split>
      </div>
    </>
  );
}
