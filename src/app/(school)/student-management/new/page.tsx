import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { BackLink } from "@/components/ui/module-head";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { previewAdmissionNo, nextRollNo } from "@/lib/students/students";
import { feePlanApplies } from "@/lib/students/hooks";
import { BASE, studentPage, todayIso } from "../_lib/page";
import { sectionOptions } from "../_lib/queries";
import { AddStudentForm } from "./add-student-form";

export const metadata: Metadata = { title: "Add student" };

export default async function AddStudentPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const { current, settings, year, can, tz } = await studentPage();
  if (!can.manage) redirect(`/no-access?m=student-management`);
  const sp = await searchParams;
  const data = await withSchool(current.ctx, async (tx) => {
    const sections = await sectionOptions(tx, current, year?.id);
    const nextRolls: Record<string, number> = {};
    if (year) for (const s of sections) nextRolls[s.value] = await nextRollNo(tx, s.value, year.id);
    return { sections, nextAdmissionNo: await previewAdmissionNo(tx, current.ctx), nextRolls };
  });

  return (
    <>
      <BackLink href={BASE} label="Students" />
      <PageHeader title="Add student" href={`${BASE}/new`} userId={current.user.id} />
      <p className="-mt-3 mb-5 max-w-prose text-ink-2">
        For students who did not come through Admission Management, for example when moving from your old software. Only the main details are needed now; the rest is filled on the profile.
      </p>
      {!year || data.sections.length === 0 ? (
        <EmptyState title="No class sections to add students to">
          <p>Open the academic year and add classes and sections in <Link href="/academic-management" className="font-medium text-brand-text underline">Academic Management</Link>, then come back.</p>
        </EmptyState>
      ) : (
        <Card className="max-w-3xl">
          <CardBody>
            <AddStudentForm sections={data.sections} defaultSection={data.sections.some((s) => s.value === sp.section) ? sp.section! : ""}
              today={todayIso(tz)} nextAdmissionNo={data.nextAdmissionNo} nextRolls={data.nextRolls}
              feePlanNote={feePlanApplies() ? "Adds this year's fees for the class to the student's dues." : "The class fee plan is added when Fee Management is set up; this choice is kept."}
              required={settings.requiredFields} showAadhaar={can.seeRestricted} />
          </CardBody>
        </Card>
      )}
    </>
  );
}
