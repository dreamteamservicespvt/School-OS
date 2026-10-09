import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { fullPage, BASE } from "@/lib/admission/page";
import { UUID_RE } from "@/lib/admission/act";
import { GENDERS, RELATIONS } from "@/lib/admission/applications";
import { applicationChoices } from "@/lib/admission/choices";
import { PageHeader } from "@/components/shell/page-header";
import { Alert } from "@/components/ui/alert";
import { ApplicationForm, type ApplicationValues } from "../application-form";

export const metadata: Metadata = { title: "New application" };

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function NewApplicationPage({ searchParams }: Search) {
  const { current, viewer, settings, year } = await fullPage("create");
  if (viewer.change !== "all") redirect(`${BASE}/applications`);
  const sp = await searchParams;
  const enquiryId = typeof sp.enquiry === "string" && UUID_RE.test(sp.enquiry) ? sp.enquiry : null;
  const data = await withSchool(current.ctx, async (tx) => {
    const enquiry = enquiryId ? await tx.enquiry.findFirst({ where: { id: enquiryId, archivedAt: null } }) : null;
    const choices = await applicationChoices(tx, current, settings, enquiry?.academicYearId ?? year?.id ?? null);
    return { enquiry, choices };
  });
  const e = data.enquiry;
  // Everything known from the enquiry is filled, so nothing is typed twice (02 Done when 4).
  const [firstName, ...rest] = (e?.childName ?? "").split(/\s+/);
  const values: ApplicationValues = {
    enquiryId: e?.id ?? null,
    yearId: e?.academicYearId ?? year?.id ?? null,
    classId: e?.classId ?? null,
    firstName: firstName || null,
    lastName: rest.join(" ") || null,
    dateOfBirth: e?.childDob ? e.childDob.toISOString().slice(0, 10) : null,
    fatherName: e?.parentName ?? null,
    phone: e?.phone ?? null,
    email: e?.email ?? null,
    previousSchool: e?.currentSchool ?? null,
  };
  return (
    <>
      <PageHeader title="New application" href={`${BASE}/applications/new`} userId={current.user.id} />
      {e && <Alert tone="info" className="mb-4">Filled from the enquiry for {e.childName}. Check each part and add what is missing.</Alert>}
      {enquiryId && !e && <Alert tone="warning" className="mb-4">The enquiry was not found, so the form starts empty.</Alert>}
      <ApplicationForm
        classes={data.choices.classes} years={data.choices.years} genders={GENDERS} relations={RELATIONS} categories={data.choices.categories}
        restricted={viewer.restricted} customFields={data.choices.customFields} values={values}
        parentHint={e?.parentName ?? null} cancelHref={e ? `${BASE}/enquiries/${e.id}` : `${BASE}/applications`}
      />
    </>
  );
}
