import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { withSchool } from "@/lib/db";
import { commOfficePage } from "@/lib/communication/access";
import { BackLink, RecordHead } from "@/components/ui/split";
import { EmptyState } from "@/components/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { NoticeForm } from "../../notice-form";
import { noticeFormData } from "../../form-data";

export const metadata: Metadata = { title: "Change notice" };

export default async function EditNoticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const access = await commOfficePage("edit");
  const n = await withSchool(access.current.ctx, (tx) => tx.notice.findFirst({ where: { id, schoolId: access.current.ctx.schoolId, ...(access.full ? {} : { createdById: access.current.user.id }) } }));
  if (!n) notFound();
  const back = <BackLink href={`/communication/notices/${id}`} label={n.title} sub="Change" />;
  if (n.status !== "DRAFT") {
    return (
      <>
        {back}
        <EmptyState title="This notice can no longer be changed">
          Only a draft can be changed. Archive this notice and write a new one.
          <div className="mt-4"><ButtonLink href={`/communication/notices/${id}`}>Back to the notice</ButtonLink></div>
        </EmptyState>
      </>
    );
  }
  const data = await noticeFormData(access, n);
  return (
    <>
      {back}
      <RecordHead title="Change notice" />
      <NoticeForm data={data} />
    </>
  );
}
