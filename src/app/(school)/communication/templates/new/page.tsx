import type { Metadata } from "next";
import { commOfficePage } from "@/lib/communication/access";
import { BackLink, RecordHead } from "@/components/ui/split";
import { TemplateForm } from "../template-form";
import { templateFormData } from "../form-data";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "New template" };

export default async function NewTemplatePage() {
  const access = await commOfficePage("create");
  const data = await templateFormData(access.current.ctx, null, "en");
  return (
    <>
      <BackLink href="/communication/templates" label="Message Templates" />
      <RecordHead title="New template" sub={<span className="text-[14px] text-ink3"><Words k="A ready message format with blanks like" /> {"{student_name}"}<Words k=", in each language you use." /></span>} />
      {data && <TemplateForm data={data} />}
    </>
  );
}
