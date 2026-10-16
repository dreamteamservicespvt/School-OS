import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/shell/page-header";
import { BackLink } from "@/components/ui/module-head";
import { CalendarClock, FolderHeart, Lock, NotebookPen } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Col, DL, Split, Timeline } from "@/components/ui/blocks";
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
      <BackLink href={`${BASE}/behaviour/counselling`} label="Counselling" sub={data.student?.fullName} />
      <PageHeader title={`Counselling: ${data.student?.fullName ?? ""}`} sub={`Opened ${formatDate(c.openedOn, tz)} · ${c.status === "OPEN" ? "open" : "closed"}${c.nextSessionOn ? ` · next session ${formatDate(c.nextSessionOn, tz)}` : ""}`} href={path} userId={current.user.id} />
      <Split side={380}>
        <Col>
          <Card>
            <CardHeader title="Sessions" icon={NotebookPen} description={notes ? "Confidential notes are encrypted and seen only by the Counsellor." : "Confidential notes are seen only by the Counsellor."} />
            <CardBody className="space-y-4">
              {c.status === "OPEN" && (
                <ActionForm action={addSessionAction.bind(null, id)} submitLabel="Record session" pendingText="Saving…" resetOnSuccess className="grid gap-3 sm:grid-cols-2">
                  <FormText name="date" label="Date" type="date" required defaultValue={todayIso(tz)} max={todayIso(tz)} />
                  <FormText name="followUpOn" label="Follow-up on" type="date" />
                  <FormArea name="summary" label="What was done" required rows={2} className="sm:col-span-2" help="A line seen by everyone who may open the case." />
                  {notes && <FormArea name="confidential" label="Confidential notes" rows={4} className="sm:col-span-2" help="Highly restricted." />}
                </ActionForm>
              )}
              {c.sessions.length === 0 ? <p className="text-[14px] text-ink3">No sessions yet.</p> : (
                <div className={c.status === "OPEN" ? "border-t border-line pt-4" : ""}>
                  <Timeline items={c.sessions.map((s) => {
                    const secret = readConfidential(s.confidentialEnc, notes);
                    return {
                      icon: CalendarClock, tone: "brand" as const,
                      what: <>
                        {s.summary}
                        {secret && <span className="mt-2 block whitespace-pre-line rounded-xl bg-sunken/70 px-3 py-2 text-[14px]"><span className="sr-only">Confidential: </span>{secret}</span>}
                        {!notes && s.confidentialEnc && <span className="mt-1 flex items-center gap-1.5 text-[13px] italic text-ink3"><Lock size={13} aria-hidden="true" />Private: confidential notes recorded (only the Counsellor can read them)</span>}
                      </>,
                      when: `${formatDate(s.date, tz)}${s.followUpOn ? ` · follow-up ${formatDate(s.followUpOn, tz)}` : ""}`,
                    };
                  })} />
                </div>
              )}
            </CardBody>
          </Card>
        </Col>
        <Col>
          <Card>
            <CardHeader title="Case" icon={FolderHeart} action={<Badge tone={c.status === "OPEN" ? "warning" : "neutral"}>{c.status === "OPEN" ? "Open" : "Closed"}</Badge>} />
            <DL cols={1} rows={[
              ["Student", data.student ? <Link className="font-semibold text-brand hover:underline" href={`${BASE}/students/${data.student.id}`}>{data.student.fullName}</Link> : null],
              ["Reason", c.reason],
              ["Referred by", data.referredBy?.displayName ?? null],
              ["Opened", formatDate(c.openedOn, tz)],
              ...(c.incidentId ? [["From", <Link key="f" className="font-semibold text-brand hover:underline" href={`${BASE}/behaviour/${c.incidentId}`}>The behaviour record</Link>] as [string, React.ReactNode]] : []),
            ]} />
            <CardBody className="space-y-4">
              <ActionForm action={saveCaseAction.bind(null, id)} submitLabel="Save case" pendingText="Saving…" className="space-y-3 border-t border-line pt-4">
                <FormSelect name="status" label="Status" options={[{ value: "OPEN", label: "Open" }, { value: "CLOSED", label: "Closed" }]} defaultValue={c.status} />
                {data.people.length > 0 && <FormSelect name="counsellorId" label="Counsellor" placeholder="Not given yet" options={data.people.map((p) => ({ value: p.id, label: p.displayName }))} defaultValue={c.counsellorId} />}
                <FormText name="nextSessionOn" label="Next session" type="date" defaultValue={c.nextSessionOn ? c.nextSessionOn.toISOString().slice(0, 10) : ""} />
                <FormArea name="actionPlan" label="Action plan and follow-ups" rows={3} defaultValue={c.actionPlan} />
                <FormArea name="outsideReferral" label="Outside referral" rows={2} defaultValue={c.outsideReferral} help="For example a child psychologist or a clinic." />
              </ActionForm>
            </CardBody>
          </Card>
        </Col>
      </Split>
    </>
  );
}
