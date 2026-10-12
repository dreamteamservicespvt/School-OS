import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { fullPage, BASE } from "@/lib/admission/page";
import { UUID_RE } from "@/lib/admission/act";
import { OPEN_STAGES } from "@/lib/admission/applications";
import { names } from "@/lib/admission/choices";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Facts } from "../../_components/bits";
import { AddToTest, ScoreSheet } from "../test-forms";

export const metadata: Metadata = { title: "Admission test" };

export default async function TestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { current, viewer, tz } = await fullPage();
  const data = await withSchool(current.ctx, async (tx) => {
    const test = await tx.admissionTest.findFirst({
      where: { id, archivedAt: null },
      include: { bookings: { where: { archivedAt: null }, orderBy: { createdAt: "asc" }, include: { application: { select: { id: true, fullName: true, applicationNo: true, classId: true } } } } },
    });
    if (!test) return null;
    const booked = new Set(test.bookings.map((b) => b.applicationId));
    const open = await tx.application.findMany({ where: { archivedAt: null, academicYearId: test.academicYearId, stage: { in: OPEN_STAGES }, ...(test.classId ? { classId: test.classId } : {}) }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, applicationNo: true, classId: true } });
    return { test, n: await names(tx), more: open.filter((a) => !booked.has(a.id)) };
  });
  if (!data) notFound();
  const { test, n } = data;
  const canChange = viewer.change === "all";
  const scored = test.bookings.filter((b) => b.marks !== null || b.absent).length;
  return (
    <>
      <PageHeader title={test.title} href={`${BASE}/tests/${id}`} userId={current.user.id}>
        {canChange && data.more.length > 0 && <AddToTest testId={test.id} applicants={data.more.map((a) => ({ id: a.id, name: a.fullName, meta: `${n.classes.get(a.classId) ?? ""} · ${a.applicationNo}` }))} />}
      </PageHeader>
      <Link href={`${BASE}/tests`} className="mb-3 inline-flex min-h-11 items-center text-sm text-brand-text hover:underline">← All tests</Link>
      <Card className="mb-6">
        <CardBody>
          <Facts items={[
            ["Date and time", formatDateTime(test.startsAt, tz)],
            ["Venue", test.venue ?? "Not set"],
            ["Class", test.classId ? n.classes.get(test.classId) ?? "" : "Any class"],
            ["Maximum marks", String(test.maxMarks)],
            ["Scores entered", `${scored} of ${test.bookings.length}`],
          ]} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Scores and remarks" description="Leave marks empty until the paper is checked. Tick absent for a child who did not come." />
        <CardBody>
          {test.bookings.length === 0 ? <p className="text-ink-2">No applicant is booked for this test.</p> : canChange ? (
            <ScoreSheet testId={test.id} maxMarks={test.maxMarks} lines={test.bookings.map((b) => ({ applicationId: b.applicationId, name: b.application.fullName, number: b.application.applicationNo, marks: b.marks?.toString() ?? "", absent: b.absent, remarks: b.remarks ?? "" }))} />
          ) : (
            <ul className="divide-y divide-line">
              {test.bookings.map((b) => (
                <li key={b.id} className="py-2">
                  <Link href={`${BASE}/applications/${b.applicationId}`} className="font-medium text-brand-text hover:underline">{b.application.fullName}</Link>
                  <span className="block text-sm text-ink-2">{b.absent ? "Absent" : b.marks !== null ? `${b.marks.toString()} of ${test.maxMarks}` : "Not scored yet"}{b.remarks ? ` · ${b.remarks}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
