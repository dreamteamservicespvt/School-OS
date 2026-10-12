import type { Metadata } from "next";
import { commOfficePage } from "@/lib/communication/access";
import { BackLink, RecordHead } from "@/components/ui/split";
import { NoticeForm } from "../notice-form";
import { noticeFormData } from "../form-data";

export const metadata: Metadata = { title: "New notice" };

export default async function NewNoticePage() {
  const access = await commOfficePage("create");
  const data = await noticeFormData(access, null);
  return (
    <>
      <BackLink href="/communication/notices" label="Notice Board" />
      <RecordHead title="New notice" sub={<span className="text-[14px] text-ink3">Notices to parents go to the Principal for approval first.</span>} />
      <NoticeForm data={data} />
    </>
  );
}
