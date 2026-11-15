import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { BackLink } from "@/components/ui/module-head";
import { Card, CardBody } from "@/components/ui/card";
import { BASE, NO_ACCESS, studentPage } from "../../../_lib/page";
import { saveGuardianAction } from "../../../_actions/guardians";
import { GuardianForm } from "../../guardian-form";
import { visibleChildNames, visibleGuardianFor } from "../../load";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Edit parent") };
}

export default async function EditGuardianPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ student?: string }> }) {
  const { id } = await params;
  // Opened from a child's profile (?student=): saving and Cancel go back to that child.
  const sp = await searchParams;
  const from = typeof sp.student === "string" && /^[0-9a-f-]{36}$/i.test(sp.student) ? sp.student : null;
  const { current, can } = await studentPage();
  if (!can.manage) redirect(NO_ACCESS);
  const { g, kids } = await withSchool(current.ctx, async (tx) => {
    const g = await visibleGuardianFor(tx, current, id);
    return { g, kids: g ? await visibleChildNames(tx, current, id) : [] };
  });
  if (!g) notFound();
  // Layman loop 2: one parent record serves every child; say so before the change is made.
  const both = kids.length > 1 ? `Parent of ${kids.slice(0, -1).join(", ")} and ${kids[kids.length - 1]}. Changes apply to ${kids.length === 2 ? "both" : `all ${kids.length}`}.` : null;
  return (
    <>
      <BackLink href={from ? `${BASE}/students/${from}` : `${BASE}/guardians/${id}`} label={g.name} />
      <PageHeader title={`Edit ${g.name}`} href={`${BASE}/guardians/${id}/edit`} userId={current.user.id} />
      <Card className="max-w-3xl">
        <CardBody>
          {both && <p className="mb-4 rounded-xl bg-info/10 px-3.5 py-2.5 text-[13.5px] text-ink2" role="note">{both}</p>}
          <GuardianForm action={saveGuardianAction.bind(null, id, from)} g={g} studentId={null} canRestrict={false} cancelHref={from ? `${BASE}/students/${from}` : `${BASE}/guardians/${id}`} />
          <p className="mt-4 text-[13.5px] text-ink2"><Words k="Custody restrictions are set on each child's link, from the child's profile." /></p>
        </CardBody>
      </Card>
    </>
  );
}
