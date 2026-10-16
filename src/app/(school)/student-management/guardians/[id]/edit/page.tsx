import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { BackLink } from "@/components/ui/module-head";
import { Card, CardBody } from "@/components/ui/card";
import { BASE, studentPage } from "../../../_lib/page";
import { saveGuardianAction } from "../../../_actions/guardians";
import { GuardianForm } from "../../guardian-form";
import { visibleGuardianFor } from "../../load";

export const metadata: Metadata = { title: "Edit parent" };

export default async function EditGuardianPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { current, can } = await studentPage();
  if (!can.manage) redirect(`${BASE}/guardians/${id}`);
  const g = await withSchool(current.ctx, (tx) => visibleGuardianFor(tx, current, id));
  if (!g) notFound();
  return (
    <>
      <BackLink href={`${BASE}/guardians/${id}`} label={g.name} />
      <PageHeader title={`Edit ${g.name}`} href={`${BASE}/guardians/${id}/edit`} userId={current.user.id} />
      <Card className="max-w-3xl">
        <CardBody>
          <GuardianForm action={saveGuardianAction.bind(null, id, null)} g={g} studentId={null} canRestrict={false} cancelHref={`${BASE}/guardians/${id}`} />
          <p className="mt-4 text-[13.5px] text-ink2">Custody restrictions are set on each child&apos;s link, from the child&apos;s profile.</p>
        </CardBody>
      </Card>
    </>
  );
}
