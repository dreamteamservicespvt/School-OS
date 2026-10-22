import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { admissionPage, BASE } from "@/lib/admission/page";
import { PLACES } from "@/lib/imports/places";
import { PageHeader } from "@/components/shell/page-header";
import { FileReview } from "@/components/import/file-review";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Check a file · Import enquiries") };
}

/** One enquiries file: match, fix, choose for rows that may already be on record, and bring in the good ones. */
export default async function EnquiryImportFilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { current, viewer } = await admissionPage("create");
  if (viewer.change !== "all") redirect(`${BASE}/enquiries`);
  return (
    <>
      <PageHeader title="Import enquiries" href={`${BASE}/enquiries/import`} userId={current.user.id} />
      <FileReview current={current} place={PLACES.enquiries} id={(await params).id} sp={await searchParams} />
    </>
  );
}
