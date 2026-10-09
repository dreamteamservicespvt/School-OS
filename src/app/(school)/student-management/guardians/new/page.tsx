import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { loadVisibleStudent, StudentNotFound } from "@/lib/students/access";
import { BASE, studentPage } from "../../_lib/page";
import { saveGuardianAction } from "../../_actions/guardians";
import { GuardianForm } from "../guardian-form";

export const metadata: Metadata = { title: "Add parent" };

export default async function NewGuardianPage({ searchParams }: { searchParams: Promise<{ student?: string }> }) {
  const { current, can } = await studentPage();
  if (!can.manage) redirect(`${BASE}/guardians`);
  const { student: studentId } = await searchParams;
  let student: { id: string; fullName: string } | null = null;
  if (studentId) {
    try {
      student = await withSchool(current.ctx, (tx) => loadVisibleStudent(tx, current, studentId));
    } catch (e) {
      if (e instanceof StudentNotFound) notFound();
      throw e;
    }
  }
  return (
    <>
      <PageHeader title={student ? `Add parent for ${student.fullName}` : "Add parent"} href={`${BASE}/guardians/new`} userId={current.user.id} />
      {student && <p className="-mt-3 mb-5 text-ink-2">A brother&apos;s or sister&apos;s parent already on record? Use <a className="font-medium text-brand-text underline" href={`${BASE}/guardians/link?student=${student.id}`}>Link existing parent</a> instead.</p>}
      <Card className="max-w-3xl">
        <CardBody>
          <GuardianForm action={saveGuardianAction.bind(null, null, student?.id ?? null)} studentId={student?.id ?? null} canRestrict={can.seeRestricted}
            cancelHref={student ? `${BASE}/students/${student.id}` : `${BASE}/guardians`} />
        </CardBody>
      </Card>
    </>
  );
}
