import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDateTime, formatRupees } from "@/lib/format";
import { PageHeader } from "@/components/shell/page-header";
import { BackLink } from "@/components/ui/module-head";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ConfirmAction } from "@/components/students/confirm-action";
import { BASE, studentPage } from "../../_lib/page";
import { undoPromotionAction } from "../../_actions/promotion";
import { seesStudentFees } from "@/lib/fees/access";
import { seesResults } from "@/lib/exams/scope";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Promotion batch") };
}

const LABEL = { PROMOTE: "Promoted", DETAIN: "Detained", LEAVING: "Leaving" } as const;
const TONE = { PROMOTE: "success", DETAIN: "warning", LEAVING: "neutral" } as const;

/** One saved promotion batch: every decision, and Undo while nothing is recorded in the new year. */
export default async function PromotionBatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { current, can, tz } = await studentPage();
  if (!can.manage) redirect(BASE);
  const seeFees = seesStudentFees(current);
  const seeResults = seesResults(current);
  const { batchId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(batchId)) notFound();
  const data = await withSchool(current.ctx, async (tx) => {
    const batch = await tx.promotionBatch.findUnique({ where: { id: batchId }, include: { decisions: true } });
    if (!batch) return null;
    // One campus: that campus's batches only.
    if (current.campusId && !(await tx.academicYear.count({ where: { id: batch.fromYearId, campusId: current.campusId } }))) return null;
    const [students, sections, years, people] = await Promise.all([
      tx.student.findMany({ where: { id: { in: batch.decisions.map((d) => d.studentId) } }, select: { id: true, fullName: true, admissionNo: true } }),
      tx.section.findMany({ where: { id: { in: [batch.fromSectionId, ...batch.decisions.map((d) => d.toSectionId).filter((x): x is string => Boolean(x))] } }, include: { schoolClass: true } }),
      tx.academicYear.findMany({ where: { id: { in: [batch.fromYearId, batch.toYearId] } } }),
      tx.userLogin.findMany({ where: { id: { in: [batch.confirmedById, batch.undoneById].filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } }),
    ]);
    return { batch, students, sections, years, people };
  });
  if (!data) notFound();
  const { batch } = data;
  const sec = (id: string | null) => { const s = data.sections.find((x) => x.id === id); return s ? `${s.schoolClass.name} ${s.name}` : ""; };
  const yearName = (id: string) => data.years.find((y) => y.id === id)?.name ?? "";
  const who = (id: string | null) => data.people.find((p) => p.id === id)?.displayName ?? "someone";
  const decisions = [...batch.decisions].sort((a, b) => (data.students.find((s) => s.id === a.studentId)?.fullName ?? "").localeCompare(data.students.find((s) => s.id === b.studentId)?.fullName ?? ""));

  return (
    <>
      <BackLink href={`${BASE}/promotion`} label="Promotion" />
      <PageHeader title={`Promotion of ${sec(batch.fromSectionId)} (${yearName(batch.fromYearId)})`} href={`${BASE}/promotion/${batch.id}`} userId={current.user.id}>
        <ButtonLink href={`${BASE}/promotion`} size="sm"><Words k="Back to Promotion" /></ButtonLink>
      </PageHeader>
      <div className="space-y-4">
        <Card>
          <CardHeader title={batch.summary} description={`Saved ${formatDateTime(batch.confirmedAt, tz)} by ${who(batch.confirmedById)}. To ${yearName(batch.toYearId)}.`}
            action={batch.undoneAt ? <Badge><Words k="Undone" /></Badge> : (
              <ConfirmAction action={undoPromotionAction} fields={{ batchId: batch.id }} trigger="Undo this promotion" triggerVariant="danger-outline"
                title="Undo this promotion?" confirmLabel="Undo promotion" confirmVariant="danger">
                <Words k="The" /> {batch.decisions.length} <Words k="students go back to" /> {sec(batch.fromSectionId)} <Words k="in" /> {yearName(batch.fromYearId)} <Words k="and their new-year class is removed. This works only while nothing is recorded for them in" /> {yearName(batch.toYearId)}<Words k=". The batch stays in the history." />
              </ConfirmAction>
            )} />
          {batch.undoneAt && <CardBody><p className="text-ink2"><Words k="Undone" /> {formatDateTime(batch.undoneAt, tz)} <Words k="by" /> {who(batch.undoneById)}.</p></CardBody>}
        </Card>
        <Card>
          <CardHeader title="Decisions" />
          <CardBody>
            <ul className="divide-y divide-line">
              {decisions.map((d) => {
                const s = data.students.find((x) => x.id === d.studentId);
                const facts = d.facts as { resultText?: string; attendancePct?: number; feeDuePaise?: string | number };
                return (
                  <li key={d.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                    <div className="min-w-0">
                      <Link href={`${BASE}/students/${d.studentId}`} className="font-medium hover:underline">{s?.fullName ?? "Student"}</Link> <span className="text-[13.5px] text-ink2">{s?.admissionNo}</span>
                      <p className="text-[13.5px] text-ink2">
                        {[seeResults ? facts.resultText : null, facts.attendancePct != null ? `Attendance ${Math.round(facts.attendancePct)}%` : null, seeFees && facts.feeDuePaise && BigInt(facts.feeDuePaise) > BigInt(0) ? `Fees due ${formatRupees(BigInt(facts.feeDuePaise))}` : null].filter(Boolean).join(" · ")}
                      </p>
                      {d.decision !== d.suggested && <p className="text-[13.5px]"><Words k="Suggested" /> {LABEL[d.suggested].toLowerCase()}<Words k="; changed because:" /> {d.reason}</p>}
                    </div>
                    <span className="flex items-center gap-2">
                      <Badge tone={TONE[d.decision]}>{LABEL[d.decision]}</Badge>
                      {d.toSectionId && <span className="text-[13.5px]">{sec(d.toSectionId)}</span>}
                      {d.leavingRequestId && <Link className="text-[13.5px] underline" href={`${BASE}/leaving/${d.leavingRequestId}`}><Words k="Leaving" /></Link>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
