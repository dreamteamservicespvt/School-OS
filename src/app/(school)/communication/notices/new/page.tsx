import type { Metadata } from "next";
import Link from "next/link";
import { commOfficePage } from "@/lib/communication/access";
import { PageHeader } from "@/components/shell/page-header";
import { NoticeForm } from "../notice-form";
import { noticeFormData } from "../form-data";

export const metadata: Metadata = { title: "New notice" };

export default async function NewNoticePage() {
  const access = await commOfficePage("create");
  const data = await noticeFormData(access, null);
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/communication/notices" className="text-brand-text hover:underline">← Notice Board</Link></p>
      <PageHeader title="New notice" href="/communication/notices/new" userId={access.current.user.id} />
      <NoticeForm data={data} />
    </>
  );
}
