import type { Metadata } from "next";
import { commPage } from "@/lib/communication/access";
import { BackLink, RecordHead } from "@/components/ui/split";
import { NoticeForm } from "../notice-form";
import { noticeFormData } from "../form-data";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("New notice") };
}

export default async function NewNoticePage() {
  const access = await commPage("create");
  const data = await noticeFormData(access, null);
  const sub = data.needsApproval.all ? "Every notice goes for approval first." : data.needsApproval.parents ? "Notices to parents go for approval first." : null;
  return (
    <>
      <BackLink href="/communication/notices" label="Notice Board" />
      <RecordHead title="New notice" sub={sub ? <span className="text-[14px] text-ink3">{sub}</span> : undefined} />
      <NoticeForm data={data} />
    </>
  );
}
