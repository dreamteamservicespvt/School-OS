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
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Add student" };

export default async function AddStudentPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const { current, settings, year, yearIds, can, tz } = await studentPage();
  if (!can.manage) redirect(`/no-access?m=student-management`);
  const sp = await searchParams;
  const data = await withSchool(current.ctx, async (tx) => {
    // Each campus's current year: the class picker lists every campus the person works in, named by campus.
    const sections = await sectionOptions(tx, current, yearIds);
    const nextRolls: Record<string, number> = {};
    for (const s of sections) nextRolls[s.value] = await nextRollNo(tx, s.value, s.yearId);
    return { sections, nextAdmissionNo: await previewAdmissionNo(tx, current.ctx), nextRolls };
  });

  return (
    <>
      <BackLink href={BASE} label="Students" />
      <PageHeader title="Add student" sub={<span className="block max-w-prose"><Words k="For students who did not come through Admission Management, for example when moving from your old software. Only the main details are needed now; the rest is filled on the profile." /></span>} href={`${BASE}/new`} userId={current.user.id} />
      {!year || data.sections.length === 0 ? (
        <EmptyState title="No class sections to add students to">
          <p><Words k="Open the academic year and add classes and sections in" /> <Link href="/academic-management" className="font-semibold text-brand hover:underline"><Words k="Academic Management" /></Link><Words k=", then come back." /></p>
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
