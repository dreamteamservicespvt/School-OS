import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { BackLink } from "@/components/ui/module-head";
import { Card, CardBody } from "@/components/ui/card";
import { BASE, studentPage, todayIso } from "../../_lib/page";
import { sectionOptions } from "../../_lib/queries";
import { IncidentForm } from "./incident-form";
import { loadVisibleStudent } from "@/lib/students/access";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Report incident") };
}

export default async function ReportIncidentPage({ searchParams }: { searchParams: Promise<{ student?: string }> }) {
  const { current, settings, yearIds, can, tz } = await studentPage();
  if (!can.contribute || !can.seeBehaviour) redirect(`${BASE}/behaviour`);
  const { student } = await searchParams;
  const data = await withSchool(current.ctx, async (tx) => {
    const sections = await sectionOptions(tx, current, yearIds, { own: can.reach === "own" });
    let initial: { id: string; name: string; admissionNo: string; cls: string }[] = [];
    if (student) {
      const s = await loadVisibleStudent(tx, current, student).catch(() => null);
      if (s) {
        const e = yearIds.length ? await tx.enrolment.findFirst({ where: { studentId: s.id, academicYearId: { in: yearIds }, archivedAt: null } }) : null;
        initial = [{ id: s.id, name: s.fullName, admissionNo: s.admissionNo, cls: e ? sections.find((x) => x.value === e.sectionId)?.label ?? "" : "" }];
      }
    }
    return { sections, initial };
  });
  return (
    <>
      <BackLink href={`${BASE}/behaviour`} label="Behaviour & Counselling" />
      <PageHeader title="Report incident" sub={<><Words k="Also for a warning, a suspension, a reward or recognition." /></>} href={`${BASE}/behaviour/new`} userId={current.user.id} />
      <Card className="max-w-3xl">
        <CardBody>
          <IncidentForm types={settings.incidentTypes} sections={data.sections.map((s) => ({ value: s.value, label: s.label }))} initial={data.initial}
            today={todayIso(tz)} pointsOn={settings.pointsOn} back={student ? "profile" : "list"} />
        </CardBody>
      </Card>
    </>
  );
}
