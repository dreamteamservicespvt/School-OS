import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { BackLink } from "@/components/ui/module-head";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { buttonClass } from "@/components/ui/button";
import { ActionForm, FormChoice } from "@/components/students/action-form";
import { BASE, studentPage } from "../../../_lib/page";
import { mergeAction } from "../../../_actions/guardians";
import { visibleGuardianFor } from "../../load";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Merge parent records") };
}

/** Merge two parent records that are the same person (needed after imports), keeping every link and history. */
export default async function MergeGuardianPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> }) {
  const { id } = await params;
  const { current, can } = await studentPage();
  if (!can.manage) redirect(`${BASE}/guardians/${id}`);
  const q = ((await searchParams).q ?? "").trim().slice(0, 60);
  const data = await withSchool(current.ctx, async (tx) => {
    const keep = await visibleGuardianFor(tx, current, id);
    if (!keep || keep.archivedAt) return null;
    const digits = q.replace(/\D/g, "");
    // Likely duplicates first: the same phone, or the same name.
    const where = q.length >= 3
      ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, ...(digits.length >= 4 ? [{ phone: { contains: digits } }, { altPhone: { contains: digits } }] : [])] }
      : { OR: [{ phone: keep.phone }, { name: { equals: keep.name, mode: "insensitive" as const } }] };
    const found = await tx.guardian.findMany({
      where: { AND: [where, { archivedAt: null, id: { not: id } }] },
      include: { students: { where: { archivedAt: null }, include: { student: { select: { fullName: true } } } } },
      take: 20,
    });
    return { keep, found };
  });
  if (!data) notFound();
  const back = `${BASE}/guardians/${id}`;
  return (
    <>
      <BackLink href={back} label={data.keep.name} sub="Merge" />
      <PageHeader title="Merge parent records" sub={<span className="block max-w-prose"><Words k="Keep" /> <strong>{data.keep.name}</strong> ({data.keep.phone}<Words k=") and move another record's children, consent records and documents to it. The other record is archived, not deleted." /></span>} href={`${back}/merge`} userId={current.user.id} />
      <div className="grid max-w-4xl gap-4">
        <Card>
          <CardBody>
            <form method="get" className="flex flex-wrap gap-2">
              <label className="min-w-0 flex-1 basis-60"><span className="sr-only"><Words k="Phone or name" /></span>
                <input name="q" type="search" defaultValue={q} placeholder="Search another record by phone or name" className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-base" />
              </label>
              <button type="submit" className={buttonClass("secondary")}><Words k="Find" /></button>
            </form>
          </CardBody>
        </Card>
        {data.found.length === 0 ? (
          <EmptyState title="No other record found">{q ? "Try another phone or name." : "No other parent has the same phone or name."}</EmptyState>
        ) : (
          <Card>
            <CardHeader title={q ? "Records found" : "Likely the same person"} />
            <CardBody>
              <ActionForm action={mergeAction.bind(null, id)} submitLabel={`Merge into ${data.keep.name}`} pendingText="Merging…"
                footer={<Link href={back} className="inline-flex h-11 items-center rounded-xl px-4 text-[14px] font-semibold text-ink2 transition hover:bg-sunken hover:text-ink"><Words k="Cancel" /></Link>}>
                <FormChoice name="mergeId" label="Record to merge in" columns={2}
                  options={data.found.map((g) => ({ value: g.id, label: `${g.name} (${g.relationship})`, help: `${g.phone}${g.students.length ? ` · ${g.students.map((s) => s.student.fullName).join(", ")}` : " · no children"}` }))} />
              </ActionForm>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
