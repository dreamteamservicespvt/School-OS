import { notFound, redirect } from "next/navigation";
import { UUID_RE } from "@/lib/admission/act";
import { workPage, BASE } from "@/lib/admission/page";

/** Old test links open the scores sheet on the Test & Interview page. */
export default async function TestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  await workPage();
  redirect(`${BASE}/tests?score=${id}`);
}
