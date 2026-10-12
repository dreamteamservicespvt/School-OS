import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { examPage, type SearchParams } from "../../../_lib/page";
import { PageTop } from "../../../_components/page-top";
import { datesheetFormData } from "../../form-data";
import { DatesheetForm } from "../../datesheet-form";

export const metadata: Metadata = { title: "Change datesheet" };

export default async function EditDatesheetPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const page = await examPage(await searchParams);
  if (!page.scope.datesheets || !page.writable || !page.year) redirect(`/examination-results/datesheet/${id}`);
  const data = await datesheetFormData(page, id);
  if (!data?.exam) notFound();
  return (
    <>
      <PageTop page={page} title={`Change ${data.exam.title}`} href={`/examination-results/datesheet/${id}/edit`} showYear={false} />
      {data.exam.status !== "DRAFT" && !data.exam.locked && <p className="-mt-3 mb-5 text-ink-2">This datesheet is published. Changes show on the School Calendar, the Time Table and Parent Link straight away.</p>}
      <DatesheetForm data={data} />
    </>
  );
}
