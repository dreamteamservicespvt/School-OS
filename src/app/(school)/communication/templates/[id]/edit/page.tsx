import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { commOfficePage } from "@/lib/communication/access";
import { PageHeader } from "@/components/shell/page-header";
import { Alert } from "@/components/ui/alert";
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
      <p className="mb-2 text-sm"><Link href={`/communication/templates/${id}`} className="text-brand-text hover:underline">← {data.name}</Link></p>
      <PageHeader title={`Edit ${data.name}`} href={`/communication/templates/${id}/edit`} userId={access.current.user.id} />
      {access.full ? (
        <>
          <p className="-mt-3 mb-4 text-ink-2">Saving makes a new version of each changed language. Messages already sent keep the version they used.</p>
          <TemplateForm data={data} />
        </>
      ) : <Alert tone="info">Only the Principal and School Admin can change message templates.</Alert>}
    </>
  );
}
