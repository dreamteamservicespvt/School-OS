import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { buttonClass } from "@/components/ui/button";
import { ActionForm, FormCheck, FormChoice, FormSelect } from "@/components/students/action-form";
import { loadVisibleStudent, StudentNotFound } from "@/lib/students/access";
import { RELATIONS } from "@/lib/students/labels";
import { BASE, studentPage } from "../../_lib/page";
import { linkExistingAction } from "../../_actions/guardians";

export const metadata: Metadata = { title: "Link existing parent" };

/** Link a parent already on record (a brother's or sister's) to a student, found by phone or name. */
export default async function LinkGuardianPage({ searchParams }: { searchParams: Promise<{ student?: string; q?: string; guardian?: string }> }) {
  const { current, can } = await studentPage();
  if (!can.manage) redirect(`${BASE}/guardians`);
  const sp = await searchParams;
  if (!sp.student) notFound();
  const q = (sp.q ?? "").trim().slice(0, 60);
  let data;
  try {
    data = await withSchool(current.ctx, async (tx) => {
      const student = await loadVisibleStudent(tx, current, sp.student!);
      const linked = await tx.studentGuardian.findMany({ where: { studentId: student.id, archivedAt: null }, select: { guardianId: true } });
      const digits = q.replace(/\D/g, "");
      const where = sp.guardian && /^[0-9a-f-]{36}$/i.test(sp.guardian)
        ? { id: sp.guardian }
        : q.length >= 3 ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : [])] } : null;
      const found = where ? await tx.guardian.findMany({
        where: { AND: [where, { archivedAt: null, id: { notIn: linked.map((l) => l.guardianId) } }] },
        include: { students: { where: { archivedAt: null }, include: { student: { select: { fullName: true } } } } },
        take: 20,
      }) : [];
      return { student, found };
    });
  } catch (e) {
    if (e instanceof StudentNotFound) notFound();
    throw e;
  }
  const back = `${BASE}/students/${data.student.id}`;
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm text-ink-2"><Link href={back} className="hover:underline">{data.student.fullName}</Link> / Link existing parent</nav>
      <PageHeader title="Link existing parent" href={`${BASE}/guardians/link`} userId={current.user.id} />
      <div className="grid max-w-4xl gap-4">
        <Card>
          <CardHeader title="Find the parent" description="By phone or name. Brothers and sisters then share one parent record." />
          <CardBody>
            <form method="get" className="flex flex-wrap gap-2">
              <input type="hidden" name="student" value={data.student.id} />
              <label className="min-w-0 flex-1 basis-60"><span className="sr-only">Phone or name</span>
                <input name="q" type="search" defaultValue={q} placeholder="Phone or name" className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-base" />
              </label>
              <button type="submit" className={buttonClass("secondary")}>Find</button>
            </form>
          </CardBody>
        </Card>
        {(q || sp.guardian) && (
          data.found.length === 0 ? (
            <EmptyState title="No parent found">
              <p>Check the number, or <Link className="font-medium text-brand-text underline" href={`${BASE}/guardians/new?student=${data.student.id}`}>add a new parent</Link>.</p>
            </EmptyState>
          ) : (
            <Card>
              <CardHeader title={`Link to ${data.student.fullName}`} />
              <CardBody>
                <ActionForm action={linkExistingAction.bind(null, data.student.id)} submitLabel="Link parent" pendingText="Linking…"
                  footer={<Link href={back} className="inline-flex min-h-11 items-center rounded-lg px-4 font-medium text-brand-text hover:bg-surface-2">Cancel</Link>}>
                  <FormChoice name="guardianId" label="Parent" columns={2} defaultValue={data.found.length === 1 ? data.found[0].id : undefined}
                    options={data.found.map((g) => ({ value: g.id, label: `${g.name} (${g.relationship})`, help: `${g.phone}${g.students.length ? ` · parent of ${g.students.map((s) => s.student.fullName).join(", ")}` : ""}` }))} />
                  <FormSelect name="relationship" label={`Relation to ${data.student.fullName}`} required options={RELATIONS.map((r) => ({ value: r, label: r }))} defaultValue={data.found.length === 1 ? data.found[0].relationship : "Father"} />
                  <FormCheck name="emergency" label="Emergency contact" defaultChecked />
                </ActionForm>
              </CardBody>
            </Card>
          )
        )}
      </div>
    </>
  );
}
