import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { workPage, BASE } from "@/lib/admission/page";
import { UUID_RE } from "@/lib/admission/act";
import { blockers } from "@/lib/admission/convert";
import { bestSection, seatsFor } from "@/lib/admission/seats";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Facts } from "../../../_components/bits";
import { ConfirmForm } from "../../decision-forms";

export const metadata: Metadata = { title: "Confirm admission" };

export default async function ConfirmPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { current, viewer, today } = await workPage("create");
  if (viewer.change !== "all") redirect(`${BASE}/decision`);
  const data = await withSchool(current.ctx, async (tx) => {
    const app = await tx.application.findFirst({ where: { id, archivedAt: null } });
    if (!app) return null;
    if (app.studentId) return { admitted: true as const };
    const [cls, year, seats, problems, sibling] = await Promise.all([
      tx.schoolClass.findUnique({ where: { id: app.classId }, select: { name: true } }),
      tx.academicYear.findUnique({ where: { id: app.academicYearId }, select: { name: true } }),
      seatsFor(tx, app.academicYearId, [app.classId]),
      blockers(tx, current.ctx, app),
      app.siblingStudentId ? tx.student.findUnique({ where: { id: app.siblingStudentId }, select: { fullName: true, admissionNo: true } }) : null,
    ]);
    const guardians = await tx.guardian.count({ where: { archivedAt: null, phone: { in: [app.phone, app.altPhone].filter((p): p is string => Boolean(p)) } } });
    return { admitted: false as const, app, cls, year, seats: seats.get(app.classId), problems, sibling, guardians };
  });
  if (!data) notFound();
  if (data.admitted) redirect(`${BASE}/decision/${id}/admitted`);
  const { app, seats } = data;
  const best = seats ? bestSection(seats) : null;
  const sections = (seats?.sections ?? []).map((s) => ({ value: s.id, label: `${seats!.className} ${s.name}: ${s.free > 0 ? `${s.free} of ${s.seats} seats left` : "full"}` }));
  return (
    <>
      <PageHeader title={`Confirm admission: ${app.fullName}`} href={`${BASE}/decision/${id}/confirm`} userId={current.user.id} />
      <Link href={`${BASE}/decision?tab=approved`} className="mb-3 inline-flex min-h-11 items-center text-sm text-brand-text hover:underline">← Approved, to admit</Link>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Application" />
          <CardBody>
            <Facts items={[
              ["Application no.", app.applicationNo],
              ["Child", app.fullName],
              ["Date of birth", formatDate(app.dateOfBirth, "UTC")],
              ["Class", data.cls?.name ?? ""],
              ["Academic year", data.year?.name ?? ""],
              ["Parents", [app.fatherName, app.motherName, app.guardianName].filter(Boolean).join(", ")],
              ["Phone", app.phone],
              ["Sibling in school", data.sibling ? `${data.sibling.fullName} (${data.sibling.admissionNo})` : "No"],
            ]} />
            {data.guardians > 0 && <p className="mt-3 text-sm text-ink-2">A parent with this phone is already in the school. Their record is reused and linked, so the family sees both children together.</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Admit" description="This makes the student record with an admission number, the parent records, their consent and Parent Links, the fee plan for the class, and sends the welcome message." />
          <CardBody>
            {data.problems.length > 0 ? (
              <Alert tone="warning" title="This admission cannot be confirmed yet">
                <ul className="ml-5 list-disc">{data.problems.map((p) => <li key={p}>{p}</li>)}</ul>
                <Link href={`${BASE}/applications/${id}`} className="mt-2 inline-block font-medium underline">Open application</Link>
              </Alert>
            ) : sections.length === 0 ? (
              <Alert tone="warning">{data.cls?.name ?? "This class"} has no sections in this year. Add them in Academic Management, Classes &amp; Sections.</Alert>
            ) : (
              <ConfirmForm id={id} sections={sections} defaultSection={best?.id ?? null} today={today} />
            )}
            <p className="mt-3 text-sm text-ink-2">The admission number follows the format in Student Settings.</p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
