import { notFound, redirect } from "next/navigation";
import { UUID_RE } from "@/lib/admission/act";

/** An enquiry opens beside the list (design: Enquiries with the panel). Old links land there. */
export default async function EnquiryLink({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  redirect(`/admission-management/enquiries?id=${id}`);
}
