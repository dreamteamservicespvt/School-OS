import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "@/lib/approval-handlers";
import { requireCurrent } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { formatDateTime, formatRupees } from "@/lib/format";
import { OPEN_STATUSES, canDecide, requestLabel } from "@/lib/approvals";
import { ACTION_WORDS, canSeeApproval, statusWords, type HistoryLine } from "@/lib/approvals-inbox";
import { approvalRecordLink } from "@/lib/approval-links";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader, Detail } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { DecisionBar } from "./decision-bar";

export const metadata: Metadata = { title: "Request" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  const current = await requireCurrent();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const roleKeys = current.roles.map((r) => r.key);
  const tz = current.school.timeZone;
  const data = await withSchool(current.ctx, async (tx) => {
    const a = await tx.approval.findUnique({ where: { id } });
    if (!a || !canSeeApproval(a, current.ctx, roleKeys)) return null;
    const history = ((a.history as HistoryLine[]) ?? []);
    const ids = [...new Set([a.askedById, a.currentApproverId, a.decidedById, ...history.map((h) => h.by)].filter((x): x is string => Boolean(x)))];
    const [people, roles, mayDecide] = await Promise.all([
      tx.userLogin.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }),
      tx.role.findMany({ select: { key: true, name: true } }),
      canDecide(tx, current.ctx, a),
    ]);
    return { a, history, mayDecide, people: new Map(people.map((p) => [p.id, p.displayName])), roles: new Map(roles.map((r) => [r.key, r.name])) };
  });
  // Not found and not allowed look the same, so nobody learns what exists.
  if (!data) notFound();
  const { a, history, mayDecide, people, roles } = data;
  const open = OPEN_STATUSES.includes(a.status);
  const status = statusWords(a.status, a.history);
  const name = (uid: string | null) => (uid ? (uid === current.user.id ? "You" : people.get(uid) ?? "Someone no longer here") : "School OS");
  const waitingFor = a.currentApproverId ? name(a.currentApproverId) : a.currentApproverRole ? `anyone with the ${roles.get(a.currentApproverRole) ?? a.currentApproverRole} role` : "nobody";
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const record = approvalRecordLink(a);
  const mine = a.askedById === current.user.id;

  return (
    <div className="pb-32 sm:pb-0">
      <Link href="/approvals" className="mb-2 inline-flex min-h-11 items-center text-sm font-medium text-brand-text hover:underline">← Approvals</Link>
      <PageHeader title={a.summary} href={`/approvals/${a.id}`} userId={current.user.id}>
        <Badge tone={status.tone}>{status.label}</Badge>
      </PageHeader>
      <div className="space-y-5">
        {open && mine && <Alert tone="info">This is your request, so you cannot approve it. It is waiting for {waitingFor === "You" ? "you" : waitingFor}.</Alert>}
        {open && !mine && !mayDecide && <Alert tone="info">This request is waiting for {waitingFor}. You can see it but not decide it.</Alert>}
        {!open && a.decisionReason && <Alert tone={a.status === "APPROVED" ? "success" : "warning"} title={status.label}>{a.decisionReason}</Alert>}
        <Card>
          <CardHeader title="The request" />
          <CardBody>
            <dl className="grid gap-4 sm:grid-cols-3">
              <Detail label="Kind">{requestLabel(a.type)}</Detail>
              {a.amountPaise !== null && <Detail label="Amount">{formatRupees(a.amountPaise)}</Detail>}
              <Detail label="Asked by">{name(a.askedById)}</Detail>
              <Detail label="Asked">{formatDateTime(a.createdAt, tz)}</Detail>
              {open && <Detail label="Waiting for">{cap(waitingFor)}{a.status === "ESCALATED" ? " (moved on after nobody decided in time)" : ""}</Detail>}
              {!open && a.decidedById && <Detail label={a.status === "WITHDRAWN" ? "Withdrawn by" : "Decided by"}>{name(a.decidedById)}{a.decidedAt ? `, ${formatDateTime(a.decidedAt, tz)}` : ""}</Detail>}
              <Detail label="Step">{a.step}</Detail>
            </dl>
            {a.reason && <div className="mt-4"><p className="text-sm text-ink-2">Reason given</p><p className="whitespace-pre-line">{a.reason}</p></div>}
            {record && <p className="mt-4"><Link href={record.href} className="inline-flex min-h-11 items-center font-medium text-brand-text underline">{record.label}</Link></p>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="History" />
          <CardBody>
            <ol className="space-y-3">
              {history.map((h, i) => (
                <li key={i} className="border-l-2 border-line pl-3">
                  <p className="font-medium">{ACTION_WORDS[h.action] ?? h.action}</p>
                  <p className="text-sm text-ink-2">{name(h.by)} · {formatDateTime(new Date(h.at), tz)}</p>
                  {h.note && <p className="text-sm">{h.note}</p>}
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>

        <DecisionBar id={a.id} summary={a.summary} canDecide={mayDecide} canWithdraw={open && mine} />
      </div>
    </div>
  );
}
