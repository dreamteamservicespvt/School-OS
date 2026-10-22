import type { Metadata } from "next";
import { PLACES } from "@/lib/imports/places";
import { FileReview } from "@/components/import/file-review";
import { academicPage, type SearchParams } from "../../../_lib/page";
import { PageTop } from "../../../_components/page-top";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Check a file · Import from Excel") };
}

/** One file of Teacher Allocation, Time Table or syllabus rows: match, fix, check every row and bring in the good ones. */
export default async function AcademicImportFilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const sp = await searchParams;
  const page = await academicPage(sp, { notForOwn: "no-access", arrangerOk: true });
  return (
    <>
      <PageTop page={page} title="Import from Excel" href={PLACES.academic.base} showYear={false} />
      <FileReview current={page.current} place={PLACES.academic} id={(await params).id} sp={sp} />
    </>
  );
}
