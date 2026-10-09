import type { Metadata } from "next";
import Link from "next/link";
import { commPage } from "@/lib/communication/access";
import { PageHeader } from "@/components/shell/page-header";
import { Alert } from "@/components/ui/alert";
import { TemplateForm } from "../template-form";
import { templateFormData } from "../form-data";

export const metadata: Metadata = { title: "Add template" };

export default async function NewTemplatePage() {
  const access = await commPage("create");
  const data = access.full ? await templateFormData(access.current.ctx, null, "en") : null;
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/communication/templates" className="text-brand-text hover:underline">← Message Templates</Link></p>
      <PageHeader title="Add template" href="/communication/templates/new" userId={access.current.user.id} />
      {data ? <TemplateForm data={data} /> : <Alert tone="info">Only the Principal and School Admin can add message templates. You can use the existing ones in Send Message.</Alert>}
    </>
  );
}
