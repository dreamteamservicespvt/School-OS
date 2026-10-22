import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PLACES } from "@/lib/imports/places";
import { PageHeader } from "@/components/shell/page-header";
import { BackLink } from "@/components/ui/module-head";
import { FileReview } from "@/components/import/file-review";
import { BASE, studentPage } from "../../../_lib/page";

export const metadata: Metadata = { title: "Check a file · Import students" };

/** One file of students: match, fix, choose for rows that may already be on record, and bring in the good ones. */
export default async function StudentImportFilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { current, can } = await studentPage();
  if (!can.manage) redirect(BASE);
  return (
    <>
      <BackLink href={`${BASE}/import`} label="Import students" />
      <PageHeader title="Import students" href={`${BASE}/import`} userId={current.user.id} />
      <FileReview current={current} place={PLACES.students} id={(await params).id} sp={await searchParams} />
    </>
  );
}
