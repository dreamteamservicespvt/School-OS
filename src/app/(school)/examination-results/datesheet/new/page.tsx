import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { examPage, type SearchParams } from "../../_lib/page";
import { BackLink, NoYear, PageTop } from "../../_components/page-top";
import { datesheetFormData } from "../form-data";
import { DatesheetForm } from "../datesheet-form";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Add datesheet" };

export default async function NewDatesheetPage({ searchParams }: { searchParams: SearchParams }) {
  const page = await examPage(await searchParams);
  if (!page.scope.datesheets) redirect("/no-access");
  if (!page.year) return (<><PageTop page={page} title="Add datesheet" back={{ href: "/examination-results/datesheet", label: "Datesheet" }} href="/examination-results/datesheet/new" showYear={false} /><NoYear /></>);
  if (!page.writable) return (<><PageTop page={page} title="Add datesheet" back={{ href: "/examination-results/datesheet", label: "Datesheet" }} href="/examination-results/datesheet/new" /><EmptyState title="This year is closed"><Words k="Exams can be added only to an open year." /></EmptyState></>);
  const data = await datesheetFormData(page, null);
  if (!data || data.classes.length === 0 || data.terms.length === 0) {
    return (
      <>
        <PageTop page={page} title="Add datesheet" back={{ href: "/examination-results/datesheet", label: "Datesheet" }} href="/examination-results/datesheet/new" showYear={false} />
        <EmptyState title={data?.terms.length === 0 ? "No terms in this year" : "No classes yet"}>
          <p>{data?.terms.length === 0 ? "Exams belong to a term. Add the terms of the year in Academic Settings first." : "Add classes, sections and subjects in Academic Management first."}</p>
          <div className="mt-4"><ButtonLink href="/academic-management" variant="primary"><Words k="Open Academic Management" /></ButtonLink></div>
        </EmptyState>
      </>
    );
  }
  return (
    <>
      <BackLink page={page} href="/examination-results/datesheet" label="Datesheet" sub="Add datesheet" />
      <div className="mb-5">
        <h1 className="font-display text-[26px] md:text-[30px] font-semibold tracking-tight leading-tight"><Words k="Add datesheet" /></h1>
        <p className="text-[14px] text-ink2 mt-1"><Words k="For" /> {data.yearName}<Words k=". Creating the datesheet creates the exam. It stays a draft until you publish it." /></p>
      </div>
      <DatesheetForm data={data} />
    </>
  );
}
