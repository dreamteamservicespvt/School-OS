import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { BackLink } from "@/components/ui/module-head";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { buttonClass } from "@/components/ui/button";
import { ConfirmAction } from "@/components/students/confirm-action";
import { consentRows, consentState } from "@/lib/students/consent";
import { OPEN_LINK } from "@/lib/students/guardian-access";
import { CONSENT_TYPES } from "@/lib/students/labels";
import { BASE, studentPage } from "../../_lib/page";
import { sectionOptions } from "../../_lib/queries";
import { consentRequestAction } from "../../_actions/guardians";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Send consent request") };
}

/**
 * Bulk consent request (03 §2, D8a): to chosen parents, to the parents of a
 * section, or to every parent who has not given consent (after switching to School OS).
 */
export default async function ConsentRequestPage({ searchParams }: { searchParams: Promise<{ ids?: string; section?: string; scope?: string }> }) {
  const { current, yearIds, can } = await studentPage();
  if (!can.manage) redirect(`${BASE}/guardians`);
  const sp = await searchParams;
  const ids = (sp.ids ?? "").split(",").filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  const data = await withSchool(current.ctx, async (tx) => {
    const sections = await sectionOptions(tx, current, yearIds);
    // One campus: only the parents of that campus's students.
    const campus = current.campusId ? { campusId: current.campusId } : {};
    let where: object | null = null;
    if (ids.length) where = { id: { in: ids } };
    else if (sp.section && yearIds.length) where = { students: { some: { ...OPEN_LINK, student: { ...campus, enrolments: { some: { sectionId: sp.section, academicYearId: { in: yearIds }, archivedAt: null } } } } } };
    else if (sp.scope === "all") where = { students: { some: { ...OPEN_LINK, student: { ...campus, status: { in: ["ADMITTED", "ACTIVE", "PROMOTED"] } } } } };
    const inCampus = current.campusId ? [{ students: { some: { ...OPEN_LINK, student: campus } } }] : [];
    const guardians = where ? await tx.guardian.findMany({ where: { AND: [where, { archivedAt: null }, ...inCampus] }, select: { id: true, name: true }, take: 5000 }) : [];
    const consents = guardians.length ? await consentRows(tx, current.ctx, { guardianIds: guardians.map((g) => g.id) }) : [];
    // Only the consents the school asks for (a type with a current text).
    const asked = new Set((await tx.consentText.findMany({ where: { isCurrent: true }, select: { consentType: true } })).map((t) => t.consentType));
    const pending = guardians.filter((g) => CONSENT_TYPES.some((t) => asked.has(t.key) && consentState(consents.filter((c) => c.guardianId === g.id), t.key) !== "GIVEN"));
    return { sections, guardians, pending };
  });
  const label = ids.length ? `${ids.length} chosen parents` : sp.section ? `the parents of ${data.sections.find((s) => s.value === sp.section)?.label ?? "the section"}` : sp.scope === "all" ? "every parent of current students" : null;

  return (
    <>
      <BackLink href={`${BASE}/guardians`} label="Parents & Guardians" />
      <PageHeader title="Send consent request" sub={<span className="block max-w-prose"><Words k="Each parent gets a request through Parent Link and agrees with a one-time code sent to their registered mobile. Staff never tick consent for a parent. Consents already given are left as they are." /></span>} href={`${BASE}/guardians/consent`} userId={current.user.id} />
      <div className="grid max-w-3xl gap-4">
        <Card>
          <CardHeader title="Who gets it" />
          <CardBody>
            <form method="get" className="flex flex-wrap items-end gap-2">
              <label className="min-w-0 flex-1 basis-52">
                <span className="mb-1 block text-[13px] font-semibold text-ink2"><Words k="Parents of a section" /></span>
                <select name="section" defaultValue={sp.section ?? ""} className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-base">
                  <option value="">Choose</option>
                  {data.sections.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
              <button type="submit" className={buttonClass("secondary")}><Words k="Choose section" /></button>
              <Link href={`${BASE}/guardians/consent?scope=all`} className={buttonClass("ghost")}><Words k="Every parent" /></Link>
            </form>
          </CardBody>
        </Card>
        {label && (
          data.guardians.length === 0 ? <EmptyState title="No parents found"><Words k="Choose another section." /></EmptyState> : (
            <Card>
              <CardHeader title={`Send to ${label}`} />
              <CardBody className="space-y-3">
                <p>{data.guardians.length} {data.guardians.length === 1 ? "parent" : "parents"}; <strong>{data.pending.length}</strong> <Words k="still" /> {data.pending.length === 1 ? "has" : "have"} <Words k="a consent not given." /></p>
                {data.pending.length === 0 ? <p className="text-ink2"><Words k="Everyone here has already given consent. Nothing to send." /></p> : (
                  <ConfirmAction action={consentRequestAction} fields={{ ids: data.pending.map((g) => g.id).join(","), types: "" }} trigger={`Send to ${data.pending.length} ${data.pending.length === 1 ? "parent" : "parents"}`} triggerVariant="primary"
                    title={`Send a consent request to ${data.pending.length} ${data.pending.length === 1 ? "parent" : "parents"}?`} confirmLabel={`Send to ${data.pending.length}`}>
                    <Words k="They get a request for each consent the school asks for (data, photo and APAAR consent where set up), for each of their children, through Parent Link." />
                  </ConfirmAction>
                )}
              </CardBody>
            </Card>
          )
        )}
      </div>
    </>
  );
}
