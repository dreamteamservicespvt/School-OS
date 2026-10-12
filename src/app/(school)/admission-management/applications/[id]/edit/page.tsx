import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { workPage, BASE } from "@/lib/admission/page";
import { UUID_RE } from "@/lib/admission/act";
import { OPEN_STAGES, RELATIONS } from "@/lib/admission/applications";
import { applicationChoices } from "@/lib/admission/choices";
import type { CustomValues } from "@/lib/custom-field-rules";
import { PageHeader } from "@/components/shell/page-header";
import { ApplicationForm } from "../../application-form";
import { BackLink } from "../../../_components/pills";

export const metadata: Metadata = { title: "Edit application" };

export default async function EditApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { current, viewer, settings } = await workPage("edit");
  if (viewer.change !== "all") redirect(`${BASE}/applications/${id}`);
  const data = await withSchool(current.ctx, async (tx) => {
    const app = await tx.application.findFirst({ where: { id, archivedAt: null } });
    if (!app) return null;
    return { app, choices: await applicationChoices(tx, current, settings, app.academicYearId) };
  });
  if (!data) notFound();
  const { app } = data;
  if (!OPEN_STAGES.includes(app.stage) && app.stage !== "WAITING_LIST") redirect(`${BASE}/applications/${id}`);
  const prefs = (app.preferences ?? {}) as { secondLanguage?: string | null; transportNeeded?: boolean; transportStop?: string | null; hostelNeeded?: boolean };
  return (
    <>
      <BackLink href={`${BASE}/applications/${id}`} label="Application" sub={app.applicationNo} />
      <PageHeader title={`Edit ${app.fullName}`} href={`${BASE}/applications/${id}/edit`} userId={current.user.id} sub="Changes are kept in the history of the application." />
      <ApplicationForm
        classes={data.choices.classes} years={data.choices.years} relations={RELATIONS} categories={data.choices.categories}
        restricted={viewer.restricted} customFields={data.choices.customFields} cancelHref={`${BASE}/applications/${id}`} applicationNo={app.applicationNo}
        values={{
          id: app.id, yearId: app.academicYearId, classId: app.classId, firstName: app.firstName, lastName: app.lastName, dateOfBirth: app.dateOfBirth.toISOString().slice(0, 10),
          gender: app.gender, fatherName: app.fatherName, motherName: app.motherName, guardianName: app.guardianName, guardianRelation: app.guardianRelation,
          phone: app.phone, altPhone: app.altPhone, email: app.email, address: app.address, previousSchool: app.previousSchool, previousClass: app.previousClass,
          previousMarks: app.previousMarks, secondLanguage: prefs.secondLanguage ?? null, transportStop: prefs.transportStop ?? null, transportNeeded: prefs.transportNeeded, hostelNeeded: prefs.hostelNeeded,
          category: app.category, religion: app.religion, motherTongue: app.motherTongue, occupation: app.occupation, customFields: (app.customFields ?? {}) as CustomValues,
        }}
      />
    </>
  );
}
