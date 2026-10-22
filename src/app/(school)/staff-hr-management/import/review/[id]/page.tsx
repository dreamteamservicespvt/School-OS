import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hrPage, BASE } from "@/lib/staff/page";
import { PLACES } from "@/lib/imports/places";
import { BackLink } from "@/components/ui/module-head";
import { PageHeader } from "@/components/shell/page-header";
import { FileReview } from "@/components/import/file-review";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Check a file · Import staff") };
}

/** One staff file: match, fix, check every row and bring in the good ones. */
export default async function StaffImportFilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { current, viewer } = await hrPage("create");
  if (viewer.change !== "all") redirect("/no-access?m=staff-hr-management");
  return (
    <>
      <BackLink href={`${BASE}/import`} label="Import staff" />
      <PageHeader title="Import staff" href={`${BASE}/import`} userId={current.user.id} />
      <FileReview current={current} place={PLACES.staff} id={(await params).id} sp={await searchParams} />
    </>
  );
}
