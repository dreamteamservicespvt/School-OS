import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDateTime, formatRupees } from "@/lib/format";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/field";
import { EmptyState } from "@/components/empty-state";
import { promotionPreview, type Preview } from "@/lib/students/promotion";
import { StudentProblem } from "@/lib/students/students";
import { BASE, studentPage } from "../_lib/page";
import { classOptions, sectionOptions } from "../_lib/queries";
import { PromotionReview, type ReviewRow } from "./review";

export const metadata: Metadata = { title: "Promotion" };

const isId = (v?: string) => Boolean(v && /^[0-9a-f-]{36}$/i.test(v));

/** Promotion (03 §2): choose, review the batch, confirm. Past batches below with who confirmed them. */
export default async function PromotionPage({ searchParams }: { searchParams: Promise<{ fromYear?: string; from?: string; toYear?: string; toClass?: string }> }) {
  const { current, year, can, tz } = await studentPage();
  if (!can.manage) redirect(BASE);
  const sp = await searchParams;

  const data = await withSchool(current.ctx, async (tx) => {
    const years = await tx.academicYear.findMany({ where: { archivedAt: null }, orderBy: { startDate: "asc" } });
    const fromYear = years.find((y) => y.id === sp.fromYear && y.status !== "CLOSED") ?? (year && year.status !== "CLOSED" ? year : years.find((y) => y.status !== "CLOSED")) ?? null;
    const sections = await sectionOptions(tx, current, fromYear?.id);
    const classes = await classOptions(tx);
    let preview: Preview | null = null;
    let error: { message: string; field?: string } | null = null;
    if (isId(sp.from)) {
      try {
        preview = await promotionPreview(tx, current.ctx, { fromSectionId: sp.from!, toYearId: isId(sp.toYear) ? sp.toYear : null, toClassId: isId(sp.toClass) ? sp.toClass : null });
      } catch (e) {
        if (e instanceof StudentProblem) error = { message: e.message, field: e.field };
        else throw e;
      }
    }
    const batches = await tx.promotionBatch.findMany({ orderBy: { confirmedAt: "desc" }, take: 30 });
    const sectionIds = batches.map((b) => b.fromSectionId);
    const batchSections = await tx.section.findMany({ where: { id: { in: sectionIds } }, include: { schoolClass: true, academicYear: true } });
    const people = await tx.userLogin.findMany({ where: { id: { in: batches.map((b) => b.confirmedById).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } });
    return { years, fromYear, sections, classes, preview, error, batches, batchSections, people };
  });

  const p = data.preview;
  const laterYears = data.years.filter((y) => y.status !== "CLOSED" && data.fromYear && y.startDate > data.fromYear.startDate);
  const rows: ReviewRow[] = (p?.rows ?? []).map((r) => ({
    studentId: r.studentId, fullName: r.fullName, admissionNo: r.admissionNo, rollNo: r.rollNo, suggested: r.suggested, why: r.why,
    result: r.facts.resultText ?? (r.facts.result ? (r.facts.result === "pass" ? "Pass" : "Fail") : null),
    attendance: r.facts.attendancePct != null ? `${Math.round(r.facts.attendancePct)}%` : null,
    feeDue: r.facts.feeDuePaise ? formatRupees(r.facts.feeDuePaise) : null,
    alreadyIn: r.alreadyIn,
  }));

  return (
    <>
      <PageHeader title="Promotion" href={`${BASE}/promotion`} userId={current.user.id} />
      <div className="space-y-6">
        <Card>
          <CardHeader title="1. Choose the class" description="By default the students move to the next class in order, in the same section name, in the next academic year." />
          <CardBody>
            {!data.fromYear ? (
              <EmptyState title="No open academic year">Open an academic year in Academic Management, then return.</EmptyState>
            ) : (
              <form method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
                <SelectField name="fromYear" label="From year" required defaultValue={data.fromYear.id}
                  options={data.years.filter((y) => y.status !== "CLOSED").map((y) => ({ value: y.id, label: y.name }))} />
                <SelectField name="from" label="Class and section" required defaultValue={p?.from.id ?? sp.from ?? ""} placeholder="Choose…"
                  error={data.error?.field === "fromSectionId" ? data.error.message : undefined}
                  options={data.sections.map((s) => ({ value: s.value, label: `${s.label} (${s.filled} students)` }))} />
                <SelectField name="toYear" label="Target year" defaultValue={p?.toYear.id ?? sp.toYear ?? ""} placeholder="Next year"
                  error={data.error?.field === "toYearId" ? data.error.message : undefined}
                  options={laterYears.map((y) => ({ value: y.id, label: y.name }))} />
                <SelectField name="toClass" label="Target class" defaultValue={sp.toClass ?? ""} placeholder="Next class"
                  options={data.classes} />
                <div className="sm:col-span-2 lg:col-span-4"><Button type="submit">Show the students</Button></div>
              </form>
            )}
            {data.error && !data.error.field && <Alert tone="danger" className="mt-4">{data.error.message}</Alert>}
            {data.error?.field === "toYearId" && (
              <Alert tone="warning" className="mt-4" action={<Link className="font-medium underline" href="/academic-management">Open Academic Management</Link>}>{data.error.message}</Alert>
            )}
          </CardBody>
        </Card>

        {p && (
          <Card>
            <CardHeader title={`2. Review ${p.from.label} (${p.from.year.name})`}
              description={p.finalClass
                ? `${p.from.className} is the final class. Students can be detained or marked Leaving (graduating).`
                : `Moving to ${p.toClass?.name ?? ""} in ${p.toYear.name}. Rules: ${p.rules.passRequired ? "pass required" : "pass not required"}${p.rules.minAttendancePct != null ? `, at least ${p.rules.minAttendancePct}% attendance` : ""}${p.rules.feeDuesAllowed ? ", fee dues shown as a warning only" : ", no fee dues allowed"}${p.policyVersion ? ` (promotion policy version ${p.policyVersion})` : ""}.`} />
            <CardBody>
              {rows.length === 0 ? (
                <EmptyState title="No students in this section">Students who are studying in {p.from.label} show here.</EmptyState>
              ) : (
                <PromotionReview key={`${p.from.id}-${p.toYear.id}-${p.toClass?.id ?? ""}`} rows={rows} fromSectionId={p.from.id} fromLabel={p.from.label} fromYear={p.from.year.name}
                  toYearId={p.toYear.id} toYearName={p.toYear.name} toClassId={p.toClass?.id ?? null} toClassName={p.toClass?.name ?? null}
                  targetSections={p.targetSections.map((s) => ({ id: s.id, name: s.name }))} detainSections={p.detainSections.map((s) => ({ id: s.id, name: s.name }))}
                  defaultSectionName={p.defaultSectionName} finalClass={p.finalClass} hasFacts={p.hasFacts} />
              )}
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader title="Promotion history" />
          <CardBody>
            {data.batches.length === 0 ? <p className="text-ink-2">No promotions yet. Batches you confirm show here with who confirmed them.</p> : (
              <ul className="divide-y divide-line">
                {data.batches.map((b) => {
                  const s = data.batchSections.find((x) => x.id === b.fromSectionId);
                  return (
                    <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <div>
                        <Link href={`${BASE}/promotion/${b.id}`} className="font-medium hover:underline">{s ? `${s.schoolClass.name} ${s.name} (${s.academicYear.name})` : "Class"}</Link>
                        <p className="text-sm text-ink-2">{b.summary} · {formatDateTime(b.confirmedAt, tz)} by {data.people.find((x) => x.id === b.confirmedById)?.displayName ?? "someone"}</p>
                      </div>
                      {b.undoneAt ? <Badge tone="neutral">Undone</Badge> : <Badge tone="success">Saved</Badge>}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
