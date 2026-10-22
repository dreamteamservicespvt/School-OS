import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { commOfficePage } from "@/lib/communication/access";
import { BackLink, RecordHead } from "@/components/ui/split";
import { SurveyForm } from "../../survey-form";
import { requireSurveys, surveyFormData } from "../../form-data";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Change survey" };

export default async function EditSurveyPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await commOfficePage("edit");
  requireSurveys(access);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const data = await surveyFormData(access.current.ctx, access.current.school.timeZone, id, null, access.scope.campusId);
  if (!data) notFound();
  return (
    <>
      <BackLink href={`/communication/surveys/${id}`} label="Survey" />
      <RecordHead title={`Survey: ${data.title}`} sub={<span className="text-[14px] text-ink3"><Words k="A draft can be changed until it is sent." /></span>} />
      <SurveyForm data={data} />
    </>
  );
}
