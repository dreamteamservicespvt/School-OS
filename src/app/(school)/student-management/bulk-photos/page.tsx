import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { BackLink } from "@/components/ui/module-head";
import { Card, CardBody } from "@/components/ui/card";
import { BASE, studentPage } from "../_lib/page";
import { PhotosForm } from "./photos-form";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Bulk profile photos") };
}

/** Bulk profile photos: many photos at once, matched to students by admission number in the file name. */
export default async function BulkPhotosPage() {
  const { current, can } = await studentPage();
  if (!can.manage) redirect(BASE);
  return (
    <>
      <BackLink href={BASE} label="Students" />
      <PageHeader title="Bulk profile photos" sub={<><Words k="Photos are made smaller for phones. Students who already have a photo keep it unless you choose to replace it." /></>} href={`${BASE}/bulk-photos`} userId={current.user.id} />
      <Card className="max-w-3xl"><CardBody><PhotosForm /></CardBody></Card>
    </>
  );
}
