import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate, formatRupees } from "@/lib/format";
import { PageHeader } from "@/components/shell/page-header";
import { BackLink } from "@/components/ui/module-head";
import { GraduationCap, HandHeart, Plus, UserRound, Users } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Col, DL, Row, Split } from "@/components/ui/blocks";
import { ButtonLink } from "@/components/ui/button";
import { ActionForm, FormArea, FormCheck, FormText } from "@/components/students/action-form";
import { BASE, studentPage, todayIso } from "../../../_lib/page";
import { campusAllows } from "@/lib/campus";
import { addDonationAction, saveAlumniAction } from "../../../_actions/leaving";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Alumni record" };

/** One alumnus: contact, career, higher education, achievements, donations and the students they mentor. */
export default async function AlumniRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { current, settings, can, tz } = await studentPage();
  if (!settings.alumniOn) redirect(`${BASE}/leaving`);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await withSchool(current.ctx, async (tx) => {
    const a = await tx.alumniRecord.findFirst({ where: { id, archivedAt: null }, include: { donations: { orderBy: { date: "desc" } }, mentorings: { where: { archivedAt: null } } } });
    if (!a) return null;
    // One campus: that campus's alumni only.
    const st = await tx.student.findFirst({ where: { id: a.studentId }, select: { campusId: true } });
    if (!campusAllows(current, st?.campusId)) return null;
    const students = await tx.student.findMany({ where: { id: { in: [a.studentId, ...a.mentorings.map((m) => m.studentId)] } }, select: { id: true, fullName: true, admissionNo: true } });
    return { a, students };
  });
  if (!data) notFound();
  const { a } = data;
  const me = data.students.find((s) => s.id === a.studentId);
  const total = a.donations.reduce((sum, d) => sum + d.amountPaise, BigInt(0));

  return (
    <>
      <BackLink href={`${BASE}/leaving/alumni`} label="Alumni" sub={me?.fullName} />
      <PageHeader title={me?.fullName ?? "Alumni record"} sub={<><Words k="Batch" /> {a.graduationYear}{me?.admissionNo ? <> · <span className="font-mono">{me.admissionNo}</span></> : null}{a.career ? ` · ${a.career}` : ""}</>} href={`${BASE}/leaving/alumni/${id}`} userId={current.user.id}>
        <ButtonLink href={`${BASE}/students/${a.studentId}`} icon={UserRound}><Words k="Student Profile" /></ButtonLink>
      </PageHeader>
      <Split side={380}>
        <Card>
          <CardHeader title="Alumni details" icon={GraduationCap} description={`Graduated ${a.graduationYear} · ${me?.admissionNo ?? ""}`} />
          <CardBody>
            {can.manage ? (
              <ActionForm action={saveAlumniAction.bind(null, id)} submitLabel="Save" pendingText="Saving…">
                <FormText name="phone" label="Phone" type="tel" inputMode="numeric" defaultValue={a.phone} />
                <FormText name="email" label="Email" type="email" defaultValue={a.email} />
                <FormText name="career" label="Career" defaultValue={a.career} help="For example: Software engineer at a Hyderabad company." />
                <FormText name="higherEducation" label="Higher education" defaultValue={a.higherEducation} />
                <FormArea name="achievements" label="Achievements" rows={3} defaultValue={a.achievements} />
                <FormCheck name="isMentor" label="Willing to mentor current students" defaultChecked={a.isMentor} />
              </ActionForm>
            ) : (
              <DL className="!px-0 !pb-0" rows={[
                ["Phone", a.phone ?? "Not given"], ["Email", a.email ?? "Not given"], ["Career", a.career ?? "Not given"],
                ["Higher education", a.higherEducation ?? "Not given"], ["Achievements", a.achievements ?? "Not given"],
              ]} />
            )}
          </CardBody>
        </Card>
        <Col>
          <Card>
            <CardHeader title="Donations" icon={HandHeart} />
            {a.donations.length > 0 && <div className="px-5 pb-3"><p className="font-display text-[26px] font-semibold tnum">{formatRupees(total)}</p><p className="text-[12.5px] text-ink3">{a.donations.length} <Words k="donation" />{a.donations.length === 1 ? "" : "s"} <Words k="· receipts through Finance, Income" /></p></div>}
            <CardBody>
              {a.donations.length === 0 ? <p className="text-[14px] text-ink3"><Words k="No donations recorded." /></p> : (
                <ul className="-mx-3 mb-4">
                  {a.donations.map((d) => (
                    <Row key={d.id} icon={HandHeart} iconTone="ok" title={d.purpose} sub={`${formatDate(d.date, tz)}${d.receiptRef ? ` · receipt ${d.receiptRef}` : ""}`}
                      right={<span className="text-[13.5px] font-semibold tnum">{formatRupees(d.amountPaise)}</span>} />
                  ))}
                </ul>
              )}
              {can.manage && (
                <details className="rounded-2xl border border-line px-4 py-3">
                  <summary className="flex cursor-pointer items-center gap-1.5 text-[14px] font-semibold text-brand"><Plus size={16} aria-hidden="true" /><Words k="Record a donation" /></summary>
                  <ActionForm action={addDonationAction} submitLabel="Record donation" pendingText="Saving…" resetOnSuccess className="mt-3 space-y-4">
                    <input type="hidden" name="alumniId" value={id} />
                    <FormText name="amount" label="Amount (₹)" required inputMode="decimal" />
                    <FormText name="date" label="Date" type="date" required defaultValue={todayIso(tz)} />
                    <FormText name="purpose" label="Purpose" required help="For example: library books, scholarship fund." />
                    <FormText name="receiptRef" label="Receipt number" help="From Finance, Income, when the receipt is made there." />
                  </ActionForm>
                </details>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Mentoring" icon={Users} />
            {a.mentorings.length === 0 ? <p className="px-5 pb-5 text-[14px] text-ink3"><Words k="Not mentoring anyone yet. Link a student on the Alumni page." /></p> : (
              <ul className="px-2 pb-2">
                {a.mentorings.map((m) => { const n = data.students.find((s) => s.id === m.studentId)?.fullName ?? "Student"; return <Row key={m.id} avatar={n} title={n} sub={m.note ?? undefined} href={`${BASE}/students/${m.studentId}`} />; })}
              </ul>
            )}
          </Card>
        </Col>
      </Split>
    </>
  );
}
