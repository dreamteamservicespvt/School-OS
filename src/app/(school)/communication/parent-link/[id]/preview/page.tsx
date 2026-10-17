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
    // Children left off this guardian's page because of a custody or access restriction.
    const restricted = await tx.studentGuardian.findMany({ where: { schoolId: current.ctx.schoolId, guardianId: link.guardianId, archivedAt: null, restriction: { not: null }, student: { archivedAt: null } }, select: { student: { select: { fullName: true } } } });
    return { link, view, restricted: restricted.map((r) => r.student.fullName), sections: view ? await loadSections(tx, current.ctx, { ...view, month: typeof month === "string" ? month : null }) : [], phone: school.phone };
  });
  if (!data) notFound();

  return (
    <>
      <BackLink href={`/communication/parent-link/${id}`} label="Parent Link" sub="What they see" />
      <RecordHead title="What guardians see" />
      <Banner tone="info" title="A preview of this guardian’s page." className="mb-5">Buttons do nothing here, and this visit is not counted as an open.</Banner>
      {data.restricted.length > 0 && (
        <Banner tone="bad" title="Custody restriction." className="mb-5">
          Not shown to this guardian: {data.restricted.join(", ")}. They cannot pay, give consent or book for {data.restricted.length === 1 ? "this child" : "these children"} here, and get none of {data.restricted.length === 1 ? "the child’s" : "their"} messages.
        </Banner>
      )}
      <div className="mx-auto w-full max-w-[400px] sm:rounded-[40px] sm:border-[10px] sm:border-ink/90 sm:shadow-pop overflow-hidden bg-bg">
        <div className="sm:h-[780px] sm:overflow-y-auto scroll-thin">
          {data.view ? (
            <GuardianPage framed view={data.view} sections={data.sections} schoolPhone={data.phone} basePath={`/communication/parent-link/${id}/preview`} />
          ) : (
            <p className="py-8 px-6 text-center text-ink3">This guardian has no children studying in the school now, so the page shows &ldquo;Please contact the school&rdquo;.</p>
          )}
        </div>
      </div>
    </>
  );
}
