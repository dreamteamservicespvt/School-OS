import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrent } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { formatDateTime, formatRupees } from "@/lib/format";
import { OPEN_STATUSES, canDecide, mayReject, requestLabel, ruleStepCount, stepWords } from "@/lib/approvals";
import { approvalFacts } from "@/lib/approval-facts";
import { ACTION_WORDS, canSeeApproval, statusWords, type HistoryLine } from "@/lib/approvals-inbox";
import { approvalRecordLink } from "@/lib/approval-links";
import { askerJobs, profileLinks } from "@/lib/approval-people";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader, Detail } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import * as I from "lucide-react";
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
    const lines = ((a.history as HistoryLine[]) ?? []);
    // Older requests may have no lines; the asking itself is always the first.
    const history: HistoryLine[] = lines.length ? lines : [{ action: "asked", by: a.askedById, at: a.createdAt.toISOString(), note: null }];
    const ids = [...new Set([a.askedById, a.currentApproverId, a.decidedById, ...history.map((h) => h.by)].filter((x): x is string => Boolean(x)))];
    const [people, roles, mayDecide, mayRejectIt, jobs, links, steps] = await Promise.all([
      tx.userLogin.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }),
      tx.role.findMany({ select: { key: true, name: true } }),
      canDecide(tx, current.ctx, a),
      mayReject(tx, current.ctx, a.type),
      askerJobs(tx, [a.askedById]),
      profileLinks(tx, current.permissions, a),
      ruleStepCount(tx, current.ctx.schoolId, a.type),
    ]);
    // What the approver needs to see before deciding: the leave balance, the change asked for.
    const facts = (await approvalFacts(tx, current.ctx, [a])).get(a.id) ?? [];
    return { a, history, mayDecide, mayRejectIt, job: jobs.get(a.askedById) ?? null, links, steps, facts, people: new Map(people.map((p) => [p.id, p.displayName])), roles: new Map(roles.map((r) => [r.key, r.name])) };
  });
  // Not found and not allowed look the same, so nobody learns what exists.
  if (!data) notFound();
  const { a, history, mayDecide, mayRejectIt, job, links, steps, facts, people, roles } = data;
  const step = stepWords(a.step, steps);
  const open = OPEN_STATUSES.includes(a.status);
  const status = statusWords(a.status, a.history);
  const name = (uid: string | null) => (uid ? (uid === current.user.id ? "You" : people.get(uid) ?? "Someone no longer here") : "School OS");
  const waitingFor = a.currentApproverId ? name(a.currentApproverId) : a.currentApproverRole ? `anyone with the ${roles.get(a.currentApproverRole) ?? a.currentApproverRole} role` : "nobody";
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const record = approvalRecordLink(a);
  const mine = a.askedById === current.user.id;

  return (
    <div className="pb-32 sm:pb-0">
      <PageHeader title={a.summary} href={`/approvals/${a.id}`} userId={current.user.id}
        crumbs={<><Link href="/approvals" className="font-semibold text-brand hover:underline">Approvals</Link><I.ChevronRight size={14} aria-hidden="true" /><span>{requestLabel(a.type)}</span></>}>
        <Badge tone={status.tone}>{status.label}</Badge>
      </PageHeader>
      <div className="space-y-5">
        {open && mine && <Alert tone="info">This is your request, so you cannot approve it. It is waiting for {waitingFor === "You" ? "you" : waitingFor}.</Alert>}
        {open && !mine && !mayDecide && <Alert tone="info">This request is waiting for {waitingFor}. You can see it but not decide it.</Alert>}
        {!open && a.decisionReason && <Alert tone={a.status === "APPROVED" ? "success" : "warning"} title={status.label}>{a.decisionReason}</Alert>}
        <Card>
          <div className="flex items-center gap-3 px-5 pt-5 pb-1">
            <Avatar name={name(a.askedById)} size={44} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[15px] truncate">{name(a.askedById)}</p>
              {job && <p className="text-[13px] text-ink2">{job}</p>}
              <p className="text-[13px] text-ink3 tnum">Asked {formatDateTime(a.createdAt, tz)}</p>
            </div>
            {a.amountPaise !== null && <p className="font-display text-xl font-semibold tnum">{formatRupees(a.amountPaise)}</p>}
          </div>
          {links.length > 0 && (
            <div className="flex flex-wrap gap-2 px-5 pt-3">
              {links.map((l) => (
                <Link key={l.href} href={l.href} className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-line px-3 text-[13.5px] font-semibold text-ink2 hover:bg-sunken">
                  {l.kind === "student" ? <I.GraduationCap size={15} aria-hidden="true" /> : <I.UserRound size={15} aria-hidden="true" />}{l.label}
                </Link>
              ))}
            </div>
          )}
          <CardHeader title="The request" />
          <CardBody>
            <dl className="grid gap-4 sm:grid-cols-3">
              <Detail label="Kind">{requestLabel(a.type)}</Detail>
              {open && <Detail label="Waiting for">{cap(waitingFor)}{a.status === "ESCALATED" ? " (moved on after nobody decided in time)" : ""}</Detail>}
              {!open && a.decidedById && <Detail label={a.status === "WITHDRAWN" ? "Withdrawn by" : "Decided by"}>{name(a.decidedById)}{a.decidedAt ? `, ${formatDateTime(a.decidedAt, tz)}` : ""}</Detail>}
              {step && <Detail label="Step">{step}</Detail>}
              {facts.map((f) => <Detail key={f.label} label={f.label}>{f.value}</Detail>)}
            </dl>
            {a.reason && <div className="mt-4 rounded-xl bg-sunken/60 px-4 py-3"><p className="text-[12.5px] text-ink3">Reason given</p><p className="whitespace-pre-line text-[14.5px] mt-0.5">{a.reason}</p></div>}
            {record && <p className="mt-4"><Link href={record.href} className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-brand hover:underline"><I.ExternalLink size={16} aria-hidden="true" />{record.label}</Link></p>}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="History" />
          <CardBody>
            <ol className="relative">
              {history.map((h, i) => (
                <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < history.length - 1 && <span className="absolute left-[7px] top-5 bottom-0 w-px bg-line" aria-hidden="true" />}
                  <span className={`mt-1.5 size-[15px] shrink-0 rounded-full border-[3px] border-surface ring-1 ${i === history.length - 1 ? "bg-brand ring-brand/40" : "bg-line ring-line"}`} aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="font-semibold text-[14.5px]">{ACTION_WORDS[h.action] ?? h.action}</p>
                    <p className="text-[13px] text-ink3 tnum">{name(h.by)} · {formatDateTime(new Date(h.at), tz)}</p>
                    {h.note && <p className="text-[14px] text-ink2 mt-1">{h.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>

        <DecisionBar id={a.id} summary={a.summary} canDecide={mayDecide} canReject={mayRejectIt} canWithdraw={open && mine} />
      </div>
    </div>
  );
}
