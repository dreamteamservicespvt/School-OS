import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { fileLink } from "@/lib/files";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader, Detail } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ActionButton, ConfirmAction } from "@/components/students/confirm-action";
import { blockMessage, isCleared } from "@/lib/students/leaving";
import { BASE, studentPage, todayIso } from "../../_lib/page";
import { askWaiverAction, cancelLeavingAction, completeLeavingAction, refreshClearanceAction } from "../../_actions/leaving";
import { CERT_LABEL, CHECK_LABEL, CHECK_TONE, LEAVING_TYPE_LABEL, studentFacts } from "../load";

export const metadata: Metadata = { title: "Leaving" };

const STATUS = { IN_PROGRESS: { label: "In progress", tone: "warning" }, LEFT: { label: "Left", tone: "neutral" }, CANCELLED: { label: "Cancelled", tone: "neutral" } } as const;

/** One leaving request: clearance checks with a way to settle each, waiver through Approvals, TC, mark as left, cancel. */
export default async function LeavingRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { current, can, tz } = await studentPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await withSchool(current.ctx, async (tx) => {
    const req = await tx.leavingRequest.findUnique({ where: { id }, include: { checks: { orderBy: { name: "asc" } } } });
    if (!req) return null;
    const [facts, certs, people] = await Promise.all([
      studentFacts(tx, [req.studentId]),
      tx.certificate.findMany({ where: { leavingRequestId: id }, orderBy: { createdAt: "desc" } }),
      tx.userLogin.findMany({ where: { id: { in: [req.createdById].filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } }),
    ]);
    return { req, student: facts.get(req.studentId), certs, people };
  });
  if (!data || !data.student) notFound();
  const { req, student } = data;
  const cleared = isCleared(req.checks);
  const block = blockMessage(req.checks);
  const open = req.status === "IN_PROGRESS";
  const due = req.lastDate.toISOString().slice(0, 10) <= todayIso(tz);
  const tc = data.certs.find((c) => c.type === "TC" && c.status !== "CANCELLED");

  return (
    <>
      <PageHeader title={`${student.name} is ${open ? "leaving" : req.status === "LEFT" ? "left" : "not leaving (cancelled)"}`} href={`${BASE}/leaving/${id}`} userId={current.user.id}>
        <ButtonLink href={`${BASE}/students/${req.studentId}`} size="sm">Student Profile</ButtonLink>
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          {open && (cleared
            ? <Alert tone="success" title="Clearance passed">{tc ? `The TC is ${CERT_LABEL[tc.status].toLowerCase()}${tc.number ? ` (${tc.number})` : ""}.` : "The TC can be issued now."}</Alert>
            : <Alert tone="warning" title="Clearance pending">{block}. Settle each one below, or ask for a waiver with a reason.</Alert>)}
          <Card>
            <CardHeader title="Clearance" description="Checked when leaving started and each time you check again. Only modules that are switched on are checked."
              action={open && can.manage ? <ActionButton action={refreshClearanceAction} fields={{ id }}>Check again</ActionButton> : undefined} />
            <CardBody>
              {req.checks.length === 0 ? (
                <p className="text-ink-2">Nothing to check yet: fee dues and library books are checked here once Fee Management and Library Management are in use. Clearance passes.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {req.checks.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="font-medium">{c.name} <Badge tone={CHECK_TONE[c.status]}>{CHECK_LABEL[c.status]}</Badge></p>
                        <p className="text-sm text-ink-2">{c.detail}{c.waiverReason ? ` · Waiver reason: ${c.waiverReason}` : ""} · checked {formatDateTime(c.checkedAt, tz)}</p>
                      </div>
                      {open && can.manage && c.status === "PENDING" && (
                        <div className="flex flex-wrap gap-2">
                          {c.actionHref && <ButtonLink href={c.actionHref} size="sm" variant="primary">{c.actionLabel ?? "Settle"}</ButtonLink>}
                          <ConfirmAction action={askWaiverAction} fields={{ checkId: c.id }} trigger="Ask for waiver" triggerVariant="secondary"
                            title={`Waive ${c.name} for ${student.name}?`} confirmLabel="Send for approval" reason={{ label: "Reason", min: 5 }}>
                            {c.detail}. The waiver goes to Approvals; someone allowed to approve it decides. The check stays pending until then.
                          </ConfirmAction>
                        </div>
                      )}
                      {c.status === "WAIVER_ASKED" && c.approvalId && <Link href="/approvals" className="text-sm font-medium text-brand-text underline">See in Approvals</Link>}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Certificates" />
            <CardBody>
              {data.certs.length === 0 ? <p className="text-ink-2">No TC yet.</p> : (
                <ul className="divide-y divide-line">
                  {data.certs.map((c) => (
                    <li key={c.id} className="flex flex-wrap justify-between gap-2 py-2">
                      <Link className="font-medium hover:underline" href={`${BASE}/certificates/${c.id}`}>{c.type === "TC" ? "Transfer certificate" : c.type}{c.number ? ` ${c.number}` : ""}{c.isDuplicate ? " (duplicate)" : ""}</Link>
                      <Badge tone={c.status === "ISSUED" ? "success" : c.status === "CANCELLED" ? "neutral" : "warning"}>{CERT_LABEL[c.status]}</Badge>
                    </li>
                  ))}
                </ul>
              )}
              {open && can.manage && !tc && (
                cleared
                  ? <ButtonLink href={`${BASE}/certificates/new?student=${req.studentId}&type=TC`} variant="primary" className="mt-3">Issue TC</ButtonLink>
                  : <p className="mt-3 text-sm text-ink-2">The TC can be issued when every check is clear or waived.</p>
              )}
            </CardBody>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Details" action={<Badge tone={STATUS[req.status].tone}>{STATUS[req.status].label}</Badge>} />
            <CardBody className="space-y-3">
              <Detail label="Student">{student.name} · {student.admissionNo}{student.cls ? ` · ${student.cls}` : ""}</Detail>
              <Detail label="Type">{LEAVING_TYPE_LABEL[req.type]}</Detail>
              <Detail label="Reason">{req.reason}</Detail>
              <Detail label="Last date">{formatDate(req.lastDate, tz)}</Detail>
              {req.destinationSchool && <Detail label="Destination school">{req.destinationSchool}</Detail>}
              {req.cancelReason && <Detail label="Why cancelled">{req.cancelReason}</Detail>}
              <Detail label="Started">{formatDateTime(req.createdAt, tz)} by {data.people[0]?.displayName ?? "someone"}</Detail>
              {req.documentFileIds.length > 0 && (
                <Detail label="Documents">
                  <ul>{req.documentFileIds.map((f, i) => <li key={f}><a className="text-brand-text underline" href={fileLink(f, current.ctx.schoolId)} target="_blank" rel="noreferrer">Document {i + 1}</a></li>)}</ul>
                </Detail>
              )}
            </CardBody>
          </Card>
          {open && can.manage && (
            <Card>
              <CardBody className="flex flex-wrap gap-2">
                {due ? (
                  <ConfirmAction action={completeLeavingAction} fields={{ id }} trigger="Mark as left" triggerVariant="primary"
                    title={`Mark ${student.name} as left?`} confirmLabel="Mark as left">
                    The status changes to {req.type === "TRANSFER" ? "Transferred" : req.type === "GRADUATION" ? "Graduated" : "Withdrawn"} from {formatDate(req.lastDate, tz)}. The record stays, and the student no longer shows in class lists.
                  </ConfirmAction>
                ) : <p className="w-full text-sm text-ink-2">The status changes by itself on {formatDate(req.lastDate, tz)}.</p>}
                <ConfirmAction action={cancelLeavingAction} fields={{ id }} trigger="Cancel leaving" triggerVariant="danger-outline"
                  title="Cancel this leaving request?" confirmLabel="Cancel leaving" confirmVariant="danger" reason={{ label: "Reason", min: 5, placeholder: "For example: the family decided to stay." }}>
                  {student.name} stays in the class. A TC that is waiting for approval is cancelled too.
                </ConfirmAction>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
