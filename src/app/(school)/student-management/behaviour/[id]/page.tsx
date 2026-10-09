import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { fileLink } from "@/lib/files";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader, Detail } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ActionForm, FormText } from "@/components/students/action-form";
import { ConfirmAction } from "@/components/students/confirm-action";
import { loadVisibleStudent } from "@/lib/students/access";
import { BEHAVIOUR_KIND_LABEL, isPositive, type BehaviourKind } from "@/lib/students/labels";
import { BASE, studentPage } from "../../_lib/page";
import { archiveIncidentAction, closeIncidentAction } from "../../_actions/behaviour";

export const metadata: Metadata = { title: "Behaviour record" };

export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { current, can, settings, tz } = await studentPage();
  if (!can.seeBehaviour || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await withSchool(current.ctx, async (tx) => {
    const inc = await tx.behaviourIncident.findFirst({ where: { id }, include: { students: true } });
    if (!inc) return null;
    // Every student on the record must be within the person's reach.
    for (const s of inc.students) if (!(await loadVisibleStudent(tx, current, s.studentId).catch(() => null))) return null;
    const students = await tx.student.findMany({ where: { id: { in: inc.students.map((s) => s.studentId) } }, select: { id: true, fullName: true, admissionNo: true } });
    const reporter = inc.reportedById ? await tx.userLogin.findUnique({ where: { id: inc.reportedById }, select: { displayName: true } }) : null;
    const points = await tx.behaviourPointEntry.findMany({ where: { incidentId: id } });
    return { inc, students, reporter, points };
  });
  if (!data) notFound();
  const { inc } = data;
  const typeLabel = settings.incidentTypes.find((t) => t.key === inc.typeKey)?.label ?? BEHAVIOUR_KIND_LABEL[inc.kind as BehaviourKind];
  const path = `${BASE}/behaviour/${id}`;
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm text-ink-2"><Link className="hover:underline" href={`${BASE}/behaviour`}>Incidents &amp; rewards</Link></nav>
      <PageHeader title={typeLabel} href={path} userId={current.user.id}>
        <div className="flex flex-wrap gap-2">
          {settings.counsellingOn && can.contribute && !inc.archivedAt && !isPositive(inc.kind) && data.students.length === 1 && (
            <ButtonLink href={`${BASE}/behaviour/counselling/new?student=${data.students[0].id}&incident=${id}`}>Refer to counselling</ButtonLink>
          )}
          {can.manage && !inc.archivedAt && (
            <ConfirmAction action={archiveIncidentAction} fields={{ id }} trigger="Archive" triggerVariant="danger-outline" title="Archive this record?" confirmLabel="Archive record" confirmVariant="danger">
              It leaves the behaviour timeline. Points it gave are reversed with a new entry; nothing is deleted.
            </ConfirmAction>
          )}
        </div>
      </PageHeader>
      <div className="grid max-w-5xl gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="What happened" description={<span className="flex flex-wrap gap-1"><Badge tone={isPositive(inc.kind) ? "success" : inc.kind === "suspension" ? "danger" : "warning"}>{BEHAVIOUR_KIND_LABEL[inc.kind as BehaviourKind]}</Badge><Badge tone={inc.status === "OPEN" ? "warning" : "neutral"}>{inc.status === "OPEN" ? "Open" : "Closed"}</Badge>{inc.archivedAt && <Badge tone="danger">Archived</Badge>}</span>} />
          <CardBody className="space-y-4">
            <p className="whitespace-pre-line">{inc.description}</p>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Detail label="Date">{formatDate(inc.date, tz)}</Detail>
              <Detail label="Reported by">{data.reporter?.displayName ?? null}</Detail>
              <Detail label="Recorded">{formatDateTime(inc.createdAt, tz)}</Detail>
              <Detail label="Parent informed">{inc.parentInformed ? "Yes" : "No"}</Detail>
              {inc.kind === "suspension" && <Detail label="Suspended">{inc.suspensionFrom && inc.suspensionTo ? `${formatDate(inc.suspensionFrom, tz)} to ${formatDate(inc.suspensionTo, tz)}` : null}</Detail>}
              {inc.kind === "suspension" && <Detail label="Approved by">{inc.approvedBy}</Detail>}
              <Detail label="Action taken">{inc.actionTaken}</Detail>
            </dl>
            {/* eslint-disable-next-line @next/next/no-img-element -- private signed link */}
            {inc.photoFileId && <img src={fileLink(inc.photoFileId, current.ctx.schoolId)} alt="Photo with the record" className="max-h-80 rounded-xl border border-line" />}
            {can.contribute && !inc.archivedAt && (
              <ActionForm action={closeIncidentAction.bind(null, id)} submitLabel={inc.status === "OPEN" ? "Close" : "Reopen"} submitVariant={inc.status === "OPEN" ? "primary" : "secondary"} pendingText="Saving…" className="space-y-3 border-t border-line pt-4">
                <FormText name="actionTaken" label="Action taken" defaultValue={inc.actionTaken} />
              </ActionForm>
            )}
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title={data.students.length === 1 ? "Student" : `${data.students.length} students`} />
            <CardBody>
              <ul className="space-y-1">{data.students.map((s) => <li key={s.id}><Link className="font-medium text-brand-text hover:underline" href={`${BASE}/students/${s.id}?tab=behaviour`}>{s.fullName}</Link> <span className="text-sm text-ink-2">{s.admissionNo}</span></li>)}</ul>
            </CardBody>
          </Card>
          {data.points.length > 0 && (
            <Card>
              <CardHeader title="Points" />
              <CardBody><ul className="space-y-1 text-[15px]">{data.points.map((p) => <li key={p.id} className="flex justify-between gap-2"><span>{data.students.find((s) => s.id === p.studentId)?.fullName}</span><strong>{p.points > 0 ? `+${p.points}` : p.points}</strong></li>)}</ul></CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
