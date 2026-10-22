import type { Metadata } from "next";
import { commOfficePage } from "@/lib/communication/access";
import { BackLink, RecordHead } from "@/components/ui/split";
import { SurveyForm } from "../survey-form";
import { requireSurveys, surveyFormData } from "../form-data";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("New survey") };
}

export default async function NewSurveyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await commOfficePage("create");
  requireSurveys(access);
  const raw = await searchParams;
  const example = typeof raw.example === "string" ? raw.example : null;
  const data = await surveyFormData(access.current.ctx, access.current.school.timeZone, null, example, access.scope.campusId);
  return (
    <>
      <BackLink href="/communication/surveys" label="Surveys" />
      <RecordHead title={data?.title ? `Survey: ${data.title}` : "New survey"} sub={<span className="text-[14px] text-ink3"><Words k="Short questions for parents or staff. Each person answers once, through their own link." /></span>} />
      {data && <SurveyForm data={data} />}
    </>
  );
}
