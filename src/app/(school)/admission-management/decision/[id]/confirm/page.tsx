import { notFound, redirect } from "next/navigation";
import { UUID_RE } from "@/lib/admission/act";
import { workPage, BASE } from "@/lib/admission/page";

/** The confirm step is a sheet on Admission Decision; old links land there. */
export default async function ConfirmPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  await workPage("create");
  redirect(`${BASE}/decision?tab=approved&focus=${id}`);
}
