import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader, Detail } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionForm, FormArea, FormSelect, FormText } from "@/components/students/action-form";
import { counsellors, readConfidential } from "@/lib/students/behaviour";
import { BASE, studentPage, todayIso } from "../../../_lib/page";
import { addSessionAction, saveCaseAction } from "../../../_actions/behaviour";

export const metadata: Metadata = { title: "Counselling case" };

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { current, can, settings, tz } = await studentPage();
  if (!settings.counsellingOn) redirect(`${BASE}/behaviour`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await withSchool(current.ctx, async (tx) => {
    const c = await tx.counsellingCase.findFirst({ where: { id, archivedAt: null }, include: { sessions: { orderBy: { date: "desc" } } } });
    // Only allowed staff, or the counsellor the case is given to (checked on the server).
    if (!c || (!can.seeCounselling && c.counsellorId !== current.ctx.userId)) return null;
    const student = await tx.student.findUnique({ where: { id: c.studentId }, select: { id: true, fullName: true, admissionNo: true } });
    const people = await counsellors(tx, current.ctx);
    const referredBy = c.referredById ? await tx.userLogin.findUnique({ where: { id: c.referredById }, select: { displayName: true } }) : null;
    return { c, student, people, referredBy };
  });
  if (!data) notFound();
  const { c } = data;
  const path = `${BASE}/behaviour/counselling/${id}`;
  const notes = can.seeCounsellingNotes;
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm text-ink-2"><Link className="hover:underline" href={`${BASE}/behaviour/counselling`}>Counselling</Link></nav>
      <PageHeader title={`Counselling: ${data.student?.fullName ?? ""}`} href={path} userId={current.user.id} />
      <div className="grid max-w-6xl gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Sessions" description={notes ? "Confidential notes are encrypted and seen only by the Counsellor." : "Confidential notes are seen only by the Counsellor."} />
            <CardBody className="space-y-4">
              {c.status === "OPEN" && (
                <ActionForm action={addSessionAction.bind(null, id)} submitLabel="Record session" pendingText="Saving…" resetOnSuccess className="grid gap-3 sm:grid-cols-2">
                  <FormText name="date" label="Date" type="date" required defaultValue={todayIso(tz)} max={todayIso(tz)} />
                  <FormText name="followUpOn" label="Follow-up on" type="date" />
                  <FormArea name="summary" label="What was done" required rows={2} className="sm:col-span-2" help="A line seen by everyone who may open the case." />
                  {notes && <FormArea name="confidential" label="Confidential notes" rows={4} className="sm:col-span-2" help="Highly restricted." />}
                </ActionForm>
              )}
              {c.sessions.length === 0 ? <p className="text-ink-2">No sessions yet.</p> : (
                <ol className="divide-y divide-line">
                  {c.sessions.map((s) => {
                    const secret = readConfidential(s.confidentialEnc, notes);
                    return (
                      <li key={s.id} className="py-3">
                        <p className="text-sm text-ink-2">{formatDate(s.date, tz)}{s.followUpOn ? ` · follow-up ${formatDate(s.followUpOn, tz)}` : ""}</p>
                        <p>{s.summary}</p>
                        {secret && <p className="mt-2 whitespace-pre-line rounded-lg bg-surface-2 p-3 text-[15px]"><span className="sr-only">Confidential: </span>{secret}</p>}
                        {!notes && s.confidentialEnc && <p className="mt-1 text-sm text-ink-2">Confidential notes recorded.</p>}
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardBody>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Case" description={<Badge tone={c.status === "OPEN" ? "warning" : "neutral"}>{c.status === "OPEN" ? "Open" : "Closed"}</Badge>} />
            <CardBody className="space-y-4">
              <dl className="grid gap-3">
                <Detail label="Student">{data.student ? <Link className="text-brand-text hover:underline" href={`${BASE}/students/${data.student.id}`}>{data.student.fullName}</Link> : null}</Detail>
                <Detail label="Reason">{c.reason}</Detail>
                <Detail label="Referred by">{data.referredBy?.displayName ?? null}</Detail>
                <Detail label="Opened">{formatDate(c.openedOn, tz)}</Detail>
                {c.incidentId && <Detail label="From"><Link className="text-brand-text hover:underline" href={`${BASE}/behaviour/${c.incidentId}`}>The behaviour record</Link></Detail>}
              </dl>
              <ActionForm action={saveCaseAction.bind(null, id)} submitLabel="Save case" pendingText="Saving…" className="space-y-3 border-t border-line pt-4">
                <FormSelect name="status" label="Status" options={[{ value: "OPEN", label: "Open" }, { value: "CLOSED", label: "Closed" }]} defaultValue={c.status} />
                {data.people.length > 0 && <FormSelect name="counsellorId" label="Counsellor" placeholder="Not given yet" options={data.people.map((p) => ({ value: p.id, label: p.displayName }))} defaultValue={c.counsellorId} />}
                <FormText name="nextSessionOn" label="Next session" type="date" defaultValue={c.nextSessionOn ? c.nextSessionOn.toISOString().slice(0, 10) : ""} />
                <FormArea name="actionPlan" label="Action plan and follow-ups" rows={3} defaultValue={c.actionPlan} />
                <FormArea name="outsideReferral" label="Outside referral" rows={2} defaultValue={c.outsideReferral} help="For example a child psychologist or a clinic." />
              </ActionForm>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
