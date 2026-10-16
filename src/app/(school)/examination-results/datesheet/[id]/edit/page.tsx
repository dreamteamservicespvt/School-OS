import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { examPage, type SearchParams } from "../../../_lib/page";
import { BackLink } from "../../../_components/page-top";
import { datesheetFormData } from "../../form-data";
import { DatesheetForm } from "../../datesheet-form";

export const metadata: Metadata = { title: "Change datesheet" };

export default async function EditDatesheetPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const page = await examPage(await searchParams);
  if (!page.scope.datesheets) redirect("/no-access");
  if (!page.writable || !page.year) redirect(`/examination-results/datesheet/${id}`);
  const data = await datesheetFormData(page, id);
  if (!data?.exam) notFound();
  return (
    <>
      <BackLink page={page} href={`/examination-results/datesheet/${id}`} label={data.exam.title} sub="Change datesheet" />
      <div className="mb-5">
        <h1 className="font-display text-[26px] md:text-[30px] font-semibold tracking-tight leading-tight">Change {data.exam.title}</h1>
        {data.exam.status !== "DRAFT" && !data.exam.locked && <p className="text-[14px] text-ink2 mt-1">This datesheet is published. Changes show on the School Calendar, the Time Table and Parent Link straight away.</p>}
      </div>
      <DatesheetForm data={data} />
    </>
  );
}
