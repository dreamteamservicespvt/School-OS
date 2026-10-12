import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { BackLink } from "@/components/ui/module-head";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { ActionForm, FormArea, FormSelect } from "@/components/students/action-form";
import { loadVisibleStudent, StudentNotFound } from "@/lib/students/access";
import { BASE, studentPage } from "../../../_lib/page";
import { sectionOptions } from "../../../_lib/queries";
import { changeSectionAction, placeInSectionAction } from "../../../_actions/students";

export const metadata: Metadata = { title: "Change section" };

export default async function ChangeSectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { current, can, year } = await studentPage();
  if (!can.manage) redirect(`${BASE}/students/${id}`);
  let data;
  try {
    data = await withSchool(current.ctx, async (tx) => {
      const student = await loadVisibleStudent(tx, current, id);
      const now = year ? await tx.enrolment.findFirst({ where: { studentId: id, academicYearId: year.id, archivedAt: null, status: { not: "LEFT" } } }) : null;
      const sections = await sectionOptions(tx, current, year?.id);
      return { student, now, sections };
    });
  } catch (e) {
    if (e instanceof StudentNotFound) notFound();
    throw e;
  }
  const back = `${BASE}/students/${id}`;
  const cancel = <Link href={back} className="inline-flex min-h-11 items-center rounded-lg px-4 font-medium text-brand-text hover:bg-surface-2">Cancel</Link>;
  const current_ = data.now ? data.sections.find((s) => s.value === data.now!.sectionId) : null;
  const sameClass = data.now ? data.sections.filter((s) => s.classId === data.now!.classId && s.value !== data.now!.sectionId) : [];
  const label = (s: (typeof data.sections)[number]) => `${s.label} (${Math.max(0, s.seats - s.filled)} seats left)`;

  return (
    <>
      <BackLink href={back} label={data.student.fullName} sub={data.now ? "Change section" : "Place in a section"} />
      <PageHeader title={data.now ? "Change section" : "Place in a section"} href={`${back}/section`} userId={current.user.id} />
      <Card className="max-w-2xl">
        <CardBody>
          {!year ? (
            <EmptyState title="No academic year is open">Open the year in Academic Management first.</EmptyState>
          ) : data.now ? (
            sameClass.length === 0 ? (
              <EmptyState title={`${current_?.className ?? "This class"} has only one section`}>Add another section in Academic Management to move students between sections. To move class, use Promotion.</EmptyState>
            ) : (
              <ActionForm action={changeSectionAction.bind(null, id)} submitLabel="Change section" pendingText="Moving…" footer={cancel}>
                <p>Now in <strong>{current_?.label}</strong>{data.now.rollNo ? `, roll number ${data.now.rollNo}` : ""}. The student gets the next free roll number in the new section; the old section stays in the history.</p>
                <FormSelect name="sectionId" label="New section" required placeholder="Choose" options={sameClass.map((s) => ({ value: s.value, label: label(s) }))} />
                <FormArea name="reason" label="Reason" rows={2} />
              </ActionForm>
            )
          ) : (
            <ActionForm action={placeInSectionAction.bind(null, id)} submitLabel="Place in section" pendingText="Saving…" footer={cancel}>
              <p>{data.student.fullName} has no class in {year.name}, for example after re-admission. Choose the class and section.</p>
              <FormSelect name="sectionId" label="Class and section" required placeholder="Choose" options={data.sections.map((s) => ({ value: s.value, label: label(s) }))} />
            </ActionForm>
          )}
        </CardBody>
      </Card>
    </>
  );
}
