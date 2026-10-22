import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { withSchool } from "@/lib/db";
import { commPage } from "@/lib/communication/access";
import { noticeOnCampus } from "@/lib/communication/notices";
import { BackLink, RecordHead } from "@/components/ui/split";
import { EmptyState } from "@/components/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { NoticeForm } from "../../notice-form";
import { noticeFormData } from "../../form-data";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Change notice") };
}

export default async function EditNoticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const access = await commPage("edit");
  const n = await withSchool(access.current.ctx, (tx) => tx.notice.findFirst({ where: { id, schoolId: access.current.ctx.schoolId, ...(access.full ? {} : { createdById: access.current.user.id }) } }));
  // A notice for other campuses only is not found for a person limited to one campus.
  if (!n || !noticeOnCampus(n, access.scope.campusId, access.current.user.id)) notFound();
  const back = <BackLink href={`/communication/notices/${id}`} label={n.title} sub="Change" />;
  if (n.status !== "DRAFT") {
    return (
      <>
        {back}
        <EmptyState title="This notice can no longer be changed">
          <Words k="Only a draft can be changed. Archive this notice and write a new one." />
          <div className="mt-4"><ButtonLink href={`/communication/notices/${id}`}><Words k="Back to the notice" /></ButtonLink></div>
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
