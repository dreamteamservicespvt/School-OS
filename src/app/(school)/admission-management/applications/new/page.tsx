import type { Metadata } from "next";
import { withSchool } from "@/lib/db";
import { workPage, BASE } from "@/lib/admission/page";
import { UUID_RE } from "@/lib/admission/act";
import { RELATIONS } from "@/lib/admission/applications";
import { applicationChoices } from "@/lib/admission/choices";
import { admissionConsentTexts, DATA_CONSENT, PHOTO_CONSENT } from "@/lib/admission/consent";
import { PageHeader } from "@/components/shell/page-header";
import { Banner } from "@/components/ui/chips";
import { ApplicationForm, type ApplicationValues } from "../application-form";
import { BackLink } from "../../_components/pills";

export const metadata: Metadata = { title: "New application" };

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function NewApplicationPage({ searchParams }: Search) {
  const { current, viewer, settings, year } = await workPage("create");
  const sp = await searchParams;
  const enquiryId = typeof sp.enquiry === "string" && UUID_RE.test(sp.enquiry) ? sp.enquiry : null;
  const data = await withSchool(current.ctx, async (tx) => {
    const enquiry = enquiryId ? await tx.enquiry.findFirst({ where: { id: enquiryId, archivedAt: null } }) : null;
    const choices = await applicationChoices(tx, current, settings, enquiry?.academicYearId ?? year?.id ?? null);
    const texts = await admissionConsentTexts(tx, current.school.name);
    return { enquiry, choices, texts };
  });
  const e = data.enquiry;
  const dataText = data.texts.find((t) => t.type === DATA_CONSENT);
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
      <BackLink href={e ? `${BASE}/enquiries?id=${e.id}` : `${BASE}/applications`} label={e ? "Enquiry" : "Applications"} sub={e?.enquiryNo ?? undefined} />
      <PageHeader title={e ? `Application for ${e.childName}` : "New application"} href={`${BASE}/applications/new`} userId={current.user.id}
        sub={e ? `Filled from enquiry ${e.enquiryNo ?? ""}. Nothing is typed twice.` : "Filled at the counter. The parent can check it on your screen."} />
      {enquiryId && !e && <Banner tone="warn" className="mb-4">The enquiry was not found, so the form starts empty.</Banner>}
      {data.choices.years.length === 0 ? (
        <Banner tone="warn">No admission year is open. Add the academic year in Academic Management first.</Banner>
      ) : (
        <ApplicationForm
          classes={data.choices.classes} years={data.choices.years} relations={RELATIONS} categories={data.choices.categories}
          restricted={viewer.restricted} customFields={data.choices.customFields} values={values}
          parentHint={e?.parentName ?? null} cancelHref={e ? `${BASE}/enquiries?id=${e.id}` : `${BASE}/applications`}
          consentVersion={dataText?.version ? `version ${dataText.version}` : null}
          photoConsentAsked={data.texts.some((t) => t.type === PHOTO_CONSENT)}
          transportOn={current.modulesOn.has("transport-management")} hostelOn={current.modulesOn.has("hostel-management")}
        />
      )}
    </>
  );
}
