import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { BASE, studentPage } from "../_lib/page";
import { PhotosForm } from "./photos-form";

export const metadata: Metadata = { title: "Bulk profile photos" };

/** Bulk profile photos: many photos at once, matched to students by admission number in the file name. */
export default async function BulkPhotosPage() {
  const { current, can } = await studentPage();
  if (!can.manage) redirect(BASE);
  return (
    <>
      <PageHeader title="Bulk profile photos" href={`${BASE}/bulk-photos`} userId={current.user.id} />
      <p className="-mt-3 mb-5 max-w-prose text-ink-2">Photos are made smaller for phones. Students who already have a photo keep it unless you choose to replace it.</p>
      <Card className="max-w-3xl"><CardBody><PhotosForm /></CardBody></Card>
    </>
  );
}
