import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { withSchool } from "@/lib/db";
import { commPage } from "@/lib/communication/access";
import { loadGuardianView } from "@/lib/parent-link/view";
import { loadSections } from "@/lib/parent-link/render";
import { GuardianPage } from "@/components/parent-link/guardian-page";
import { Banner } from "@/components/ui/banner";
import { BackLink, RecordHead } from "@/components/ui/split";

export const metadata: Metadata = { title: "What guardians see" };

/** "What guardians see": the page exactly as one real guardian sees it. Nothing on it acts, and opens are not counted. */
export default async function PreviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ child?: string }> }) {
  const { id } = await params;
  const { child } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const access = await commPage();
  const { current } = access;
  const data = await withSchool(current.ctx, async (tx) => {
    const link = await tx.parentLink.findFirst({ where: { id, schoolId: current.ctx.schoolId } });
    if (!link) return null;
    const view = await loadGuardianView(tx, current.ctx, { linkId: link.id, guardianId: link.guardianId, childId: typeof child === "string" ? child : null, token: "", preview: true });
    const school = await tx.school.findUniqueOrThrow({ where: { id: current.ctx.schoolId }, select: { phone: true } });
    return { link, view, sections: view ? await loadSections(tx, current.ctx, view) : [], phone: school.phone };
  });
  if (!data) notFound();

  return (
    <>
      <BackLink href={`/communication/parent-link/${id}`} label="Parent Link" sub="What they see" />
      <RecordHead title="What guardians see" />
      <Banner tone="info" title="A preview of this guardian’s page." className="mb-5">Buttons do nothing here, and this visit is not counted as an open.</Banner>
      <div className="mx-auto max-w-md overflow-hidden rounded-[2rem] border-8 border-ink/10 bg-bg shadow-pop">
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
