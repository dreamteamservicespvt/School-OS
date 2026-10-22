import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { withSchool } from "@/lib/db";
import { commPage } from "@/lib/communication/access";
import { linkCampusWhere } from "@/lib/communication/parent-link-admin";
import { loadGuardianView } from "@/lib/parent-link/view";
import { loadSections } from "@/lib/parent-link/render";
import { GuardianPage } from "@/components/parent-link/guardian-page";
import { Banner } from "@/components/ui/banner";
import { BackLink, RecordHead } from "@/components/ui/split";
import { I18nProvider } from "@/lib/i18n/client";
import { catalogueFor } from "@/lib/i18n/server";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "What guardians see" };

/** "What guardians see": the page exactly as one real guardian sees it. Nothing on it acts, and opens are not counted. */
export default async function PreviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ child?: string; month?: string }> }) {
  const { id } = await params;
  const { child, month } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const access = await commPage();
  const { current } = access;
  const data = await withSchool(current.ctx, async (tx) => {
    // Another campus's guardian's link is not found for a person limited to one campus.
    const link = await tx.parentLink.findFirst({ where: { id, schoolId: current.ctx.schoolId, ...(await linkCampusWhere(tx, current.ctx, access.scope.campusId)) } });
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
      <Banner tone="info" title="A preview of this guardian’s page." className="mb-5"><Words k="Buttons do nothing here, and this visit is not counted as an open." /></Banner>
      {data.restricted.length > 0 && (
        <Banner tone="bad" title="Custody restriction." className="mb-5">
          <Words k="Not shown to this guardian:" /> {data.restricted.join(", ")}<Words k=". They cannot pay, give consent or book for" /> {data.restricted.length === 1 ? "this child" : "these children"} <Words k="here, and get none of" /> {data.restricted.length === 1 ? "the child’s" : "their"} <Words k="messages." />
        </Banner>
      )}
      <div className="mx-auto w-full max-w-[400px] sm:rounded-[40px] sm:border-[10px] sm:border-ink/90 sm:shadow-pop overflow-hidden bg-bg">
        <div className="sm:h-[780px] sm:overflow-y-auto scroll-thin">
          {data.view ? (
            // In the guardian's own language, as they see it.
            <I18nProvider lang={data.view.lang} dict={catalogueFor(data.view.lang)} setDocumentLang={false}>
              <div lang={data.view.lang}>
                <GuardianPage framed view={data.view} sections={data.sections} schoolPhone={data.phone} basePath={`/communication/parent-link/${id}/preview`} />
              </div>
            </I18nProvider>
          ) : (
            <p className="py-8 px-6 text-center text-ink3"><Words k="This guardian has no children studying in the school now, so the page shows “Please contact the school”." /></p>
          )}
        </div>
      </div>
    </>
  );
}
