import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { BackLink } from "@/components/ui/module-head";
import { Card, CardBody } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { ActionForm, FormArea, FormCheck, FormSelect } from "@/components/students/action-form";
import { loadVisibleStudent, StudentNotFound } from "@/lib/students/access";
import { RELATIONS } from "@/lib/students/labels";
import { BASE, studentPage } from "../../../../_lib/page";
import { linkSettingsAction } from "../../../../_actions/guardians";

export const metadata: Metadata = { title: "Parent link settings" };

export default async function LinkSettingsPage({ params }: { params: Promise<{ id: string; linkId: string }> }) {
  const { id, linkId } = await params;
  const { current, can } = await studentPage();
  if (!can.manage) redirect(`${BASE}/students/${id}`);
  let data;
  try {
    data = await withSchool(current.ctx, async (tx) => {
      const student = await loadVisibleStudent(tx, current, id);
      const link = await tx.studentGuardian.findFirst({ where: { id: linkId, studentId: id, archivedAt: null }, include: { guardian: true } });
      return { student, link };
    });
  } catch (e) {
    if (e instanceof StudentNotFound) notFound();
    throw e;
  }
  if (!data.link) notFound();
  const l = data.link;
  const back = `${BASE}/students/${id}`;
  return (
    <>
      <BackLink href={back} label={data.student.fullName} sub={l.guardian.name} />
      <PageHeader title={`${l.guardian.name} and ${data.student.fullName}`} href={`${back}/parents/${linkId}`} userId={current.user.id} />
      <Card className="max-w-2xl">
        <CardBody>
          {l.restriction && <Alert tone="danger" className="mb-4" title="Do not release to this person. See note.">{l.restriction}</Alert>}
          <ActionForm action={linkSettingsAction.bind(null, linkId)} submitLabel="Save" pendingText="Saving…"
            footer={<Link href={back} className="inline-flex min-h-11 items-center rounded-lg px-4 font-medium text-brand-text hover:bg-surface-2">Cancel</Link>}>
            <FormSelect name="relationship" label="Relation to this student" required options={RELATIONS.map((r) => ({ value: r, label: r }))} defaultValue={l.relationship} />
            <fieldset className="space-y-3 rounded-xl border border-danger/30 p-4">
              <legend className="px-1 font-semibold">Custody / access restriction</legend>
              {can.seeRestricted ? (
                <>
                  <FormCheck name="restricted" label="This person must not collect or contact the student" defaultChecked={Boolean(l.restriction)}
                    help="They leave the pickup list, cannot be the primary contact, and show in red in Front Office, Student Pickup." />
                  <FormArea name="restriction" label="Note" rows={2} defaultValue={l.restriction} help="For example: court order dated 03-02-2026; mother has custody." />
                  <FormArea name="reason" label="Reason for the change" rows={2} help="Needed when the restriction is set, changed or removed. Kept in the history." />
                </>
              ) : (
                <p className="text-ink-2">Only the School Admin or Principal can change a restriction.{l.restriction ? " A restriction is set on this link." : ""}</p>
              )}
            </fieldset>
          </ActionForm>
        </CardBody>
      </Card>
    </>
  );
}
