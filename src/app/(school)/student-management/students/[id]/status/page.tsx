import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shell/page-header";
import { BackLink } from "@/components/ui/module-head";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionForm, FormArea, FormChoice, FormText } from "@/components/students/action-form";
import { loadVisibleStudent, StudentNotFound } from "@/lib/students/access";
import { PROFILE_CHANGES, STATUS_LABEL, STATUS_TONE, type StudentStatusKey } from "@/lib/students/labels";
import { BASE, studentPage, todayIso } from "../../../_lib/page";
import { changeStatusAction } from "../../../_actions/students";

export const metadata: Metadata = { title: "Change status" };

export default async function ChangeStatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { current, can, tz } = await studentPage();
  if (!can.manage) redirect(`${BASE}/students/${id}`);
  let data;
  try {
    data = await withSchool(current.ctx, async (tx) => {
      const student = await loadVisibleStudent(tx, current, id);
      const history = await tx.studentStatusChange.findMany({ where: { studentId: id }, orderBy: { createdAt: "desc" } });
      const waiting = await tx.approval.findFirst({ where: { type: "re-admission", recordId: id, status: { in: ["WAITING", "ESCALATED"] } } });
      return { student, history, waiting };
    });
  } catch (e) {
    if (e instanceof StudentNotFound) notFound();
    throw e;
  }
  const status = data.student.status as StudentStatusKey;
  const choices = PROFILE_CHANGES[status] ?? [];
  const back = `${BASE}/students/${id}`;
  return (
    <>
      <BackLink href={back} label={data.student.fullName} sub="Change status" />
      <PageHeader title="Change status" href={`${back}/status`} userId={current.user.id} />
      <div className="grid max-w-5xl gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={data.student.fullName} description={<>Now: <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge></>} />
          <CardBody>
            {data.waiting ? (
              <p>A re-admission request is waiting in <Link className="font-medium text-brand-text underline" href="/approvals">Approvals</Link>. The status changes when it is approved.</p>
            ) : choices.length === 0 ? (
              <p className="text-ink-2">No change can be made here. Promotion is done on the Promotion page, and leaving on Leaving &amp; Alumni.</p>
            ) : (
              <ActionForm action={changeStatusAction.bind(null, id)} submitLabel="Change status" pendingText="Saving…"
                footer={<Link href={back} className="inline-flex min-h-11 items-center rounded-lg px-4 font-medium text-brand-text hover:bg-surface-2">Cancel</Link>}>
                <FormChoice name="to" label="New status" defaultValue={choices.length === 1 ? choices[0].to : undefined}
                  options={choices.map((c) => ({ value: c.to, label: c.approval ? `${STATUS_LABEL[c.to]} (re-admission)` : STATUS_LABEL[c.to], help: c.approval ? "Needs approval in Approvals." : undefined }))} />
                <FormText name="effectiveDate" label="Effective date" type="date" required defaultValue={todayIso(tz)} />
                <FormArea name="reason" label="Reason" required rows={2} help="Kept in the student's history." />
              </ActionForm>
            )}
            <p className="mt-4 text-sm text-ink-2">Only the allowed changes are offered. Promotion, transfer, withdrawal and graduation are done on their own pages.</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Status history" />
          <CardBody>
            {data.history.length === 0 ? <p className="text-ink-2">No changes yet.</p> : (
              <ol className="space-y-3">
                {data.history.map((h) => (
                  <li key={h.id}>
                    <p className="font-medium">{h.fromStatus === "NEW" ? "Added" : `${STATUS_LABEL[h.fromStatus as StudentStatusKey] ?? h.fromStatus} to ${STATUS_LABEL[h.toStatus as StudentStatusKey] ?? h.toStatus}`}</p>
                    <p className="text-sm text-ink-2">From {formatDate(h.effectiveDate, tz)} · {h.reason}</p>
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
