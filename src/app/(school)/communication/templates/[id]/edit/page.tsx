import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { commOfficePage } from "@/lib/communication/access";
import { BackLink, RecordHead } from "@/components/ui/split";
import { TemplateForm } from "../../template-form";
import { templateFormData } from "../../form-data";

export const metadata: Metadata = { title: "Edit template" };

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const access = await commOfficePage("edit");
  const data = await templateFormData(access.current.ctx, id, "en");
  if (!data) notFound();
  return (
    <>
      <BackLink href={`/communication/templates/${id}`} label={data.name} sub="Edit" />
      <RecordHead title={`Edit ${data.name}`} sub={<span className="text-[14px] text-ink3">Saving makes a new version of each changed language. Messages already sent keep the version they used.</span>} />
      <TemplateForm data={data} />
    </>
  );
}
