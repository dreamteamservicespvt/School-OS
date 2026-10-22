import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { hrPage, BASE } from "@/lib/staff/page";
import { campusStaffWhere, offCampus } from "@/lib/staff/list";
import { exitTypeLabel } from "@/lib/staff/exit";
import { UUID_RE } from "@/lib/staff/act";
import { BackLink } from "@/components/ui/module-head";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader, Detail } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { EXIT_STATUS } from "../exit-status";
import { AddHandoverForm, CancelExitForm, ClearanceForm, CompleteExitButton, HandOverForm, SettlementForm } from "../exit-forms";
import { addHandoverAction, cancelExitAction, clearanceAction, completeExitAction, handOverAction, settlementAction } from "../actions";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Staff Exit" };

type Props = { params: Promise<{ exitId: string }> };

const SETTLEMENT = { NOT_SENT: "Not sent yet", SENT: "Sent to Salary Management", DONE: "Done" } as Record<string, string>;

export default async function ExitPage({ params }: Props) {
  const { exitId } = await params;
  if (!UUID_RE.test(exitId)) notFound();
  const { current, viewer, tz } = await hrPage();
  const data = await withSchool(current.ctx, async (tx) => {
    const exit = await tx.exitCase.findFirst({ where: { id: exitId }, include: { handover: { orderBy: [{ kind: "asc" }, { createdAt: "asc" }] }, clearance: { orderBy: { key: "asc" } } } });
    // One campus: another campus's exit is not found.
    if (!exit || offCampus(viewer, exit.staffId)) return null;
    const [staff, teachers, approval] = await Promise.all([
      tx.staff.findUnique({ where: { id: exit.staffId }, include: { department: true } }),
      tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] }, staffType: "Teaching", id: { not: exit.staffId }, AND: [campusStaffWhere(viewer)] }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
      exit.approvalId ? tx.approval.findUnique({ where: { id: exit.approvalId } }) : null,
    ]);
    const names = await tx.staff.findMany({ where: { id: { in: exit.handover.map((h) => h.toStaffId).filter((x): x is string => Boolean(x)) } }, select: { id: true, fullName: true } });
    return { exit, staff, teachers, approval, names };
  });
  if (!data || !data.staff) notFound();
  const { exit, staff } = data;
  const hr = viewer.change === "all";
  const open = exit.status === "IN_PROGRESS" || exit.status === "WAITING_APPROVAL";
  const handed = exit.handover.filter((h) => h.doneAt).length;
  const pending = exit.clearance.filter((c) => c.status === "PENDING").length;
  const teacherOptions = data.teachers.map((t) => ({ value: t.id, label: t.fullName }));

  return (
    <>
      <BackLink href={`${BASE}/exit`} label="Staff Exit" />
      <PageHeader title={`${exitTypeLabel(exit.type)}: ${staff.fullName}`} href={`${BASE}/exit/${exit.id}`} userId={current.user.id} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Badge tone={EXIT_STATUS[exit.status].tone}>{EXIT_STATUS[exit.status].label}</Badge>
        <Link href={`${BASE}/${staff.id}`} className="text-brand-text hover:underline"><Words k="Open profile" /></Link>
      </div>
      {exit.status === "WAITING_APPROVAL" && <Alert tone="warning" className="mb-4"><Words k="Waiting for the Principal's approval" />{data.approval ? ` (asked ${formatDate(data.approval.createdAt, tz)})` : ""}<Words k=". The handover can start now." /></Alert>}
      {exit.loginDisabledAt && <Alert tone="info" className="mb-4"><Words k="The login was switched off on" /> {formatDateTime(exit.loginDisabledAt, tz)}. {staff.fullName} <Words k="now shows as" /> {staff.status.toLowerCase()} <Words k="in the Staff List." /></Alert>}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Details" />
          <CardBody>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Detail label="Staff">{staff.fullName} ({staff.staffCode})</Detail>
              <Detail label="Designation">{staff.designation}{staff.department ? ` · ${staff.department.name}` : ""}</Detail>
              <Detail label="Type">{exitTypeLabel(exit.type)}</Detail>
              <Detail label="Date received">{formatDate(exit.receivedOn, tz)}</Detail>
              <Detail label="Last working day">{formatDate(exit.lastWorkingDay, tz)}</Detail>
              <Detail label="Letter">{exit.letterFileId ? <a href={`${BASE}/files/${exit.letterFileId}`} target="_blank" rel="noopener" className="text-brand-text underline"><Words k="Open letter" /></a> : null}</Detail>
              <div className="sm:col-span-2"><Detail label="Reason">{exit.reason}</Detail></div>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Final settlement" description={SETTLEMENT[exit.settlementStatus] ?? exit.settlementStatus} />
          <CardBody className="space-y-3">
            {exit.settlementNote && <p className="text-sm text-ink-2">{exit.settlementNote}</p>}
            {hr && open && exit.status !== "WAITING_APPROVAL" && exit.settlementStatus !== "DONE" && <SettlementForm exitId={exit.id} sent={exit.settlementStatus === "SENT"} action={settlementAction} />}
            {exit.status !== "WAITING_APPROVAL" && exit.status !== "CANCELLED" && (
              <div>
                <a className={buttonClass("secondary", "sm")} href={`${BASE}/exit/${exit.id}/letter`} target="_blank" rel="noopener">{exit.experienceLetterNo ? `Experience letter ${exit.experienceLetterNo}` : "Issue experience letter"}</a>
                <p className="mt-1 text-sm text-ink-2"><Words k="A PDF on the school letterhead with the Principal's signature. The number stays the same when printed again." /></p>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Handover" description={`${handed} of ${exit.handover.length} handed over`} action={hr && open ? <AddHandoverForm exitId={exit.id} action={addHandoverAction} /> : undefined} />
          <CardBody>
            {exit.handover.length === 0 ? <p className="text-ink-2"><Words k="Nothing to hand over. Add assets, books or files if needed." /></p> : (
              <ul className="divide-y divide-line">
                {exit.handover.map((h) => {
                  const to = data.names.find((n) => n.id === h.toStaffId);
                  return (
                    <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>{h.label}</span>
                      {h.doneAt ? <Badge tone="success">{to ? `To ${to.fullName}` : "Handed over"}</Badge>
                        : hr && open ? <HandOverForm itemId={h.id} label={h.label} teaching={h.kind === "allocation" || h.kind === "class-teacher"} staff={teacherOptions} action={handOverAction} />
                          : <Badge tone="warning"><Words k="Not handed over" /></Badge>}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Clearance" description={pending ? `${pending} pending` : "All checks done"} />
          <CardBody>
            <ul className="divide-y divide-line">
              {exit.clearance.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{c.label}{c.note ? <span className="block text-sm text-ink-2">{c.note}</span> : null}</span>
                  <span className="flex items-center gap-2">
                    <Badge tone={c.status === "CLEARED" ? "success" : c.status === "PENDING" ? "warning" : "neutral"}>{c.status === "CLEARED" ? "Cleared" : c.status === "PENDING" ? "Pending" : "Not needed"}</Badge>
                    {hr && open && <ClearanceForm checkId={c.id} label={c.label} status={c.status} action={clearanceAction} />}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      {hr && open && (
        <div className="mt-5 flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-line bg-surface p-4">
          <div>
            <p className="font-medium"><Words k="Finish" /></p>
            <p className="text-sm text-ink-2"><Words k="Complete the exit after the last working day, when everything is handed over and cleared." /></p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!exit.loginDisabledAt && <CancelExitForm exitId={exit.id} action={cancelExitAction} />}
            {exit.status === "IN_PROGRESS" && <CompleteExitButton exitId={exit.id} action={completeExitAction} />}
          </div>
        </div>
      )}
    </>
  );
}
