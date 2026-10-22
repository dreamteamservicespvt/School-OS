import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { admissionPage, BASE } from "@/lib/admission/page";
import { PLACES } from "@/lib/imports/places";
import { PageHeader } from "@/components/shell/page-header";
import { ImportHome } from "@/components/import/import-home";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Import enquiries") };
}

const ABOUT = {
  "admission-enquiries": "One row for each child: open enquiries from your old software or a spreadsheet. Each one gets an owner and a follow-up. A child already in School OS is flagged and skipped, and a brother or sister with the same phone and parent is added, linked to the family. A phone on record under another parent's name asks you first.",
};

/** Workflow 15, step 8: open enquiries brought in by the admission team, on the same engine as Switching to School OS. */
export default async function ImportEnquiriesPage() {
  const { current, viewer } = await admissionPage("create");
  if (viewer.change !== "all") redirect(`${BASE}/enquiries`);
  return (
    <>
      <PageHeader title="Import enquiries" href={`${BASE}/enquiries/import`} userId={current.user.id} />
      <ImportHome current={current} place={PLACES.enquiries} about={ABOUT} />
    </>
  );
}
