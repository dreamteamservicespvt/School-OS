import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { withSchool } from "@/lib/db";
import { commPage } from "@/lib/communication/access";
import { formatDateTime } from "@/lib/format";
import { CAME_BY, QUERY_PRIORITIES, QUERY_STATUS_LABEL, QUERY_TYPE_LABEL, queryWhere, replyChannels } from "@/lib/communication/queries";
import { queryLabels } from "@/lib/communication/query-list";
import { CHANNEL_LABEL, onChannels } from "@/lib/messaging/channels";
import type { QueryType } from "@/lib/messaging/settings";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, Detail } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { QueryPanel } from "./query-panel";
import { ownerOptions } from "../owners";

export const metadata: Metadata = { title: "Query" };

export default async function QueryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const access = await commPage();
  const { current } = access;
  const tz = current.school.timeZone;
  const data = await withSchool(current.ctx, async (tx) => {
    const q = await tx.query.findFirst({ where: { AND: [{ id }, await queryWhere(tx, current.ctx, access.full ? "all" : "own")] } });
    if (!q) return null;
    const notes = await tx.queryNote.findMany({ where: { queryId: q.id }, orderBy: { createdAt: "asc" } });
    const authors = await tx.userLogin.findMany({ where: { id: { in: notes.map((n) => n.createdById).filter(Boolean) as string[] } }, select: { id: true, displayName: true } });
    const staff = current.user.id ? await tx.staff.findFirst({ where: { schoolId: current.ctx.schoolId, userLoginId: current.user.id }, select: { departmentId: true } }) : null;
    const on = await onChannels(tx, current.ctx);
    return { q, notes, authors: new Map(authors.map((a) => [a.id, a.displayName])), labels: await queryLabels(tx, [q]), owners: await ownerOptions(tx, current.ctx), myDept: staff?.departmentId ?? null, on };
  });
  if (!data) notFound();
  const { q, labels } = data;
  const channels = replyChannels(q).filter((c) => data.on.has(c)).filter((c) => c !== "app" || q.fromType !== "guardian");
  const overdue = q.dueBy && q.dueBy < new Date() && (q.status === "OPEN" || q.status === "IN_PROGRESS");

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/communication/queries" className="text-brand-text hover:underline">← Feedback &amp; Queries</Link></p>
      <PageHeader title={`${q.number} · ${QUERY_TYPE_LABEL[q.type as QueryType] ?? q.type}`} href={`/communication/queries/${q.id}`} userId={current.user.id}>
        <Badge tone={q.status === "OPEN" ? "brand" : q.status === "IN_PROGRESS" ? "warning" : q.status === "RESOLVED" ? "success" : "neutral"}>{QUERY_STATUS_LABEL[q.status]}</Badge>
      </PageHeader>
      {overdue && <Alert tone="danger" className="mb-4">Past its reply time limit ({formatDateTime(q.dueBy!, tz)}).</Alert>}
      {q.escalatedAt && <Alert tone="warning" className="mb-4">Escalated on {formatDateTime(q.escalatedAt, tz)} because it was overdue.</Alert>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardBody>
              <dl className="mb-4 grid gap-3 sm:grid-cols-3">
                <Detail label="From">{q.fromName}{q.fromPhone ? ` · ${q.fromPhone}` : ""}</Detail>
                <Detail label="About">{[labels.about(q), labels.topic(q)].filter(Boolean).join(" · ") || "General"}</Detail>
                <Detail label="Came by">{CAME_BY.find((c) => c.key === q.cameBy)?.label ?? q.cameBy}</Detail>
                <Detail label="Owner">{labels.owner(q)}</Detail>
                <Detail label="Priority">{QUERY_PRIORITIES.find((p) => p.key === q.priority)?.label ?? q.priority}</Detail>
                <Detail label="Logged">{formatDateTime(q.createdAt, tz)}</Detail>
              </dl>
              <h2 className="text-sm font-medium text-ink-2">The request</h2>
              <p className="mt-1 whitespace-pre-line">{q.details}</p>
              {q.resolution && (
                <div className="mt-4 rounded-xl bg-success-soft p-3">
                  <p className="text-sm font-medium text-success">Resolution{q.resolvedAt ? `, ${formatDateTime(q.resolvedAt, tz)}` : ""}</p>
                  <p className="whitespace-pre-line">{q.resolution}</p>
                </div>
              )}
            </CardBody>
          </Card>

          <section aria-labelledby="conv">
            <h2 id="conv" className="mb-2 text-lg font-semibold">Conversation and history</h2>
            {data.notes.length === 0 ? <p className="text-ink-2">No replies or notes yet.</p> : (
              <ol className="space-y-2">
                {data.notes.map((n) => (
                  <li key={n.id} className={n.kind === "change" ? "px-3 text-sm text-ink-2" : `rounded-xl border p-3 ${n.kind === "internal" ? "border-warn/40 bg-warn-bg" : "border-line bg-surface"}`}>
                    {n.kind === "change" ? (
                      <span>{formatDateTime(n.createdAt, tz)} · {n.text}{n.createdById ? ` (${data.authors.get(n.createdById) ?? "staff"})` : ""}</span>
                    ) : (
                      <>
                        <p className={`text-sm font-medium ${n.kind === "internal" ? "text-warn-text" : "text-ink-2"}`}>
                          {n.kind === "internal" ? "🔒 Internal note, hidden from the requester" : "Reply sent"} · {data.authors.get(n.createdById ?? "") ?? "Staff"} · {formatDateTime(n.createdAt, tz)}
                        </p>
                        <p className="mt-1 whitespace-pre-line">{n.text}</p>
                        {n.messageId && <Link href={`/communication/history/${n.messageId}`} className="text-sm text-brand-text underline">Delivery</Link>}
                      </>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
        {access.canChange && (
          <QueryPanel id={q.id} status={q.status} priority={q.priority} rating={q.rating}
            canPickUp={!q.ownerId && (access.full || (q.departmentId !== null && q.departmentId === data.myDept))}
            replyChannels={channels.map((c) => ({ value: c, label: CHANNEL_LABEL[c] }))}
            owners={data.owners} priorities={QUERY_PRIORITIES.map((p) => ({ value: p.key, label: p.label }))} />
        )}
      </div>
    </>
  );
}
