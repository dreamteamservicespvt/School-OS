import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate, formatRupees } from "@/lib/format";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader, Detail } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { ActionForm, FormArea, FormCheck, FormText } from "@/components/students/action-form";
import { BASE, studentPage, todayIso } from "../../../_lib/page";
import { addDonationAction, saveAlumniAction } from "../../../_actions/leaving";

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
    const students = await tx.student.findMany({ where: { id: { in: [a.studentId, ...a.mentorings.map((m) => m.studentId)] } }, select: { id: true, fullName: true, admissionNo: true } });
    return { a, students };
  });
  if (!data) notFound();
  const { a } = data;
  const me = data.students.find((s) => s.id === a.studentId);
  const total = a.donations.reduce((sum, d) => sum + d.amountPaise, BigInt(0));

  return (
    <>
      <PageHeader title={me?.fullName ?? "Alumni record"} href={`${BASE}/leaving/alumni/${id}`} userId={current.user.id}>
        <ButtonLink href={`${BASE}/students/${a.studentId}`} size="sm">Student Profile</ButtonLink>
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Alumni details" description={`Graduated ${a.graduationYear} · ${me?.admissionNo ?? ""}`} />
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
              <div className="space-y-3">
                <Detail label="Phone">{a.phone ?? "Not given"}</Detail>
                <Detail label="Email">{a.email ?? "Not given"}</Detail>
                <Detail label="Career">{a.career ?? "Not given"}</Detail>
                <Detail label="Higher education">{a.higherEducation ?? "Not given"}</Detail>
                <Detail label="Achievements">{a.achievements ?? "Not given"}</Detail>
              </div>
            )}
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Donations" description={a.donations.length ? `${formatRupees(total)} in all` : undefined} />
            <CardBody>
              {a.donations.length === 0 ? <p className="text-ink-2">No donations recorded.</p> : (
                <ul className="mb-4 divide-y divide-line">
                  {a.donations.map((d) => (
                    <li key={d.id} className="flex flex-wrap justify-between gap-2 py-2">
                      <span>{d.purpose} · {formatDate(d.date, tz)}{d.receiptRef ? ` · receipt ${d.receiptRef}` : ""}</span>
                      <strong>{formatRupees(d.amountPaise)}</strong>
                    </li>
                  ))}
                </ul>
              )}
              {can.manage && (
                <details className="rounded-lg border border-line p-3">
                  <summary className="cursor-pointer font-medium">Record a donation</summary>
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
            <CardHeader title="Mentoring" />
            <CardBody>
              {a.mentorings.length === 0 ? <p className="text-ink-2">Not mentoring anyone yet. Link a student on the Alumni page.</p> : (
                <ul className="space-y-1">
                  {a.mentorings.map((m) => <li key={m.id}><Link className="hover:underline" href={`${BASE}/students/${m.studentId}`}>{data.students.find((s) => s.id === m.studentId)?.fullName}</Link>{m.note ? ` · ${m.note}` : ""}</li>)}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
