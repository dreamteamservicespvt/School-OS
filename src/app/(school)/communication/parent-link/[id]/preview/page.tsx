import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { withSchool } from "@/lib/db";
import { commPage } from "@/lib/communication/access";
import { loadGuardianView } from "@/lib/parent-link/view";
import { loadSections } from "@/lib/parent-link/render";
import { GuardianPage } from "@/components/parent-link/guardian-page";
import { PageHeader } from "@/components/shell/page-header";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = { title: "What guardians see" };

/** "What guardians see": the page exactly as one real guardian sees it. Nothing on it acts, and opens are not counted. */
export default async function PreviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ child?: string; month?: string }> }) {
  const { id } = await params;
  const { child, month } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const access = await commPage();
  const { current } = access;
  const data = await withSchool(current.ctx, async (tx) => {
    const link = await tx.parentLink.findFirst({ where: { id, schoolId: current.ctx.schoolId } });
    if (!link) return null;
    const view = await loadGuardianView(tx, current.ctx, { linkId: link.id, guardianId: link.guardianId, childId: typeof child === "string" ? child : null, token: "", preview: true });
    const school = await tx.school.findUniqueOrThrow({ where: { id: current.ctx.schoolId }, select: { phone: true } });
    return { link, view, sections: view ? await loadSections(tx, current.ctx, { ...view, month: typeof month === "string" ? month : null }) : [], phone: school.phone };
  });
  if (!data) notFound();

  return (
    <>
      <p className="mb-2 text-sm"><Link href={`/communication/parent-link/${id}`} className="text-brand-text hover:underline">← Back to the link</Link></p>
      <PageHeader title="What guardians see" href={`/communication/parent-link/${id}/preview`} userId={current.user.id} />
      <Alert tone="info" className="mb-4">A preview of this guardian&rsquo;s page. Buttons do nothing here, and this visit is not counted as an open.</Alert>
      <div className="mx-auto max-w-md overflow-hidden rounded-[2rem] border-8 border-surface-3 bg-bg shadow-pop">
        <div className="border-b border-line bg-surface px-4 py-3 text-center font-semibold">{data.view?.schoolName ?? current.school.name}</div>
        <div className="p-4">
          {data.view ? (
            <GuardianPage view={data.view} sections={data.sections} schoolPhone={data.phone} basePath={`/communication/parent-link/${id}/preview`} />
          ) : (
            <p className="py-8 text-center text-ink-2">This guardian has no children studying in the school now, so the page shows &ldquo;Please contact the school&rdquo;.</p>
          )}
        </div>
      </div>
    </>
  );
}
