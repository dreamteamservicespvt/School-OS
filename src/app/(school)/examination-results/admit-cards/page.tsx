import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { periodFromSearch } from "@/lib/periods";
import { PeriodFilter } from "@/components/list/period-filter";
import { examOverlaps } from "../_lib/period";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { plural } from "@/lib/academic/common";
import { ADMIT_BATCH, admitRoster } from "@/lib/exams/admit";
import { EXAM_STATUS_TONE, ExamRuleError, shownExamStatus } from "@/lib/exams/common";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, Detail } from "@/components/ui/card";
import { ParamSelect } from "../../academic-management/_components/pickers";
import { examPage, one, withYear, type SearchParams } from "../_lib/page";
import { NoYear, PageTop } from "../_components/page-top";
import { PrintBatches, StudentCard } from "./admit-ui";

export const metadata: Metadata = { title: "Admit Cards" };
const PATH = "/examination-results/admit-cards";

export default async function AdmitCardsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const page = await examPage(raw);
  if (!page.scope.datesheets && !page.scope.manage) redirect("/no-access");
  if (!page.year) return (<><PageTop page={page} href={PATH} /><NoYear /></>);
  const year = page.year;
  const examId = one(raw.exam);
  const tz = page.current.school.timeZone;
  const range = examId ? null : periodFromSearch(raw, { timeZone: tz });
  const data = await withSchool(page.current.ctx, async (tx) => {
    const exams = await tx.exam.findMany({ where: { academicYearId: year.id, archivedAt: null, status: { not: "DRAFT" }, ...examOverlaps(range) }, include: { entries: { where: { archivedAt: null }, select: { subjectId: true, classId: true } } }, orderBy: { startDate: "desc" } });
    const classes = await tx.schoolClass.findMany({ where: { id: { in: [...new Set(exams.flatMap((e) => e.classIds))] } }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
    const exam = exams.find((e) => e.id === examId) ?? null;
    if (!exam) return { exams, classes, exam: null };
    const sections = await tx.section.findMany({ where: { classId: { in: exam.classIds }, academicYearId: year.id, archivedAt: null }, include: { schoolClass: true }, orderBy: [{ schoolClass: { sortOrder: "asc" } }, { name: "asc" }] });
    const sectionId = sections.some((s) => s.id === one(raw.section)) ? one(raw.section) : sections[0]?.id;
    if (!sectionId) return { exams, classes, exam, sections, roster: null };
    let roster = null;
    let problem: string | null = null;
    try { roster = await admitRoster(tx, exam.id, sectionId); } catch (e) { if (e instanceof ExamRuleError) problem = e.message; else throw e; }
    const [type, prints] = await Promise.all([
      tx.examType.findFirst({ where: { id: exam.examTypeId }, select: { name: true } }),
      tx.admitCardPrint.findMany({ where: { examId: exam.id, sectionId }, orderBy: { printedAt: "desc" }, take: 5 }),
    ]);
    const people = await tx.userLogin.findMany({ where: { id: { in: prints.map((p) => p.printedById).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } });
    return { exams, classes, exam, sections, sectionId, roster, problem, typeName: type?.name ?? "", prints: prints.map((p) => ({ ...p, by: people.find((x) => x.id === p.printedById)?.displayName ?? "" })) };
  });

  if (!data.exam) {
    return (
      <>
        <PageTop page={page} href={PATH} />
        <div className="mb-4"><Suspense><PeriodFilter timeZone={tz} allLabel="All exam dates" /></Suspense></div>
        {data.exams.length === 0 && range ? (
          <EmptyState title="No exams in these dates">Choose other dates, or All exam dates.</EmptyState>
        ) : data.exams.length === 0 ? (
          <EmptyState title="No published datesheets">Admit cards are made from a published datesheet. Publish one on the Datesheet page first.</EmptyState>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Exams with a published schedule">
            {data.exams.map((e) => {
              const status = shownExamStatus(e, page.today);
              const names = data.classes.filter((c) => e.classIds.includes(c.id)).map((c) => c.name);
              return (
                <li key={e.id}>
                  <Link href={withYear(`${PATH}?exam=${e.id}`, page)} className="block h-full rounded-2xl border border-line bg-surface p-4 shadow-card hover:border-brand/50">
                    <div className="flex items-start justify-between gap-2"><h2 className="text-lg font-semibold">{e.title}</h2><Badge tone={EXAM_STATUS_TONE[status]}>{status}</Badge></div>
                    <p className="mt-2">{names.length > 4 ? `${names[0]} to ${names.at(-1)}` : names.join(", ")}</p>
                    <p className="text-sm text-ink-2">{formatDate(e.startDate)} to {formatDate(e.endDate)} · {plural(new Set(e.entries.map((x) => x.subjectId)).size, "subject")}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </>
    );
  }

  const { exam, roster } = data;
  const sectionId = data.sectionId!;
  const label = data.sections?.find((s) => s.id === sectionId);
  const total = roster?.students.length ?? 0;
  const batches = Math.ceil(total / ADMIT_BATCH);
  const pdf = (q: string) => `${PATH}/pdf?exam=${exam.id}&section=${sectionId}&${q}`;

  return (
    <>
      <PageTop page={page} href={PATH} sub={exam.title}>
        <Link href={withYear(PATH, page)} className="inline-flex min-h-11 items-center px-2 font-medium text-brand-text hover:underline">All exams</Link>
      </PageTop>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <ParamSelect name="section" label="Class" current={sectionId} options={(data.sections ?? []).map((s) => ({ value: s.id, label: `${s.schoolClass.name} ${s.name}` }))} />
      </div>
      {data.problem && <EmptyState title="Admit cards are not ready">{data.problem}</EmptyState>}
      {roster && (
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-4">
            {total === 0 ? <EmptyState title="No students in this class">There is nobody to print for in {label ? `${label.schoolClass.name} ${label.name}` : "this class"}.</EmptyState> : (
              <>
                <PrintBatches total={total} batch={ADMIT_BATCH} batches={batches} base={pdf("")} noPhoto={roster.noPhoto.map((s) => ({ id: s.studentId, name: s.name, rollNo: s.rollNo }))} />
                <StudentCard students={roster.students.map((s) => ({ id: s.studentId, name: s.name, rollNo: s.rollNo, admissionNo: s.admissionNo }))} base={pdf("")} />
                <Card>
                  <CardHeader title="Subjects on the admit card" description="From the published datesheet" />
                  <ul className="divide-y divide-line border-t border-line">
                    {roster.detail.entries.filter((e) => e.classId === label?.classId).map((e) => (
                      <li key={e.id} className="flex flex-wrap justify-between gap-2 px-4 py-2 text-[15px]">
                        <span className="font-medium">{e.subjectName}{e.categories.length > 0 && <span className="block text-sm font-normal text-ink-2">{e.categories.map((c) => `${c.name} ${c.max}`).join(", ")}</span>}</span>
                        <span className="text-sm text-ink-2">{e.day} {formatDate(e.date)}, {e.time} · {e.gradeOnly ? "Graded" : `Max ${e.maxMarks}`}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </>
            )}
          </div>
          <div className="space-y-4">
            <Card>
              <CardHeader title="Exam information" />
              <CardBody className="space-y-3">
                <Detail label="Exam">{exam.title}</Detail>
                <Detail label="Class">{label ? `${label.schoolClass.name} ${label.name}` : ""}</Detail>
                <Detail label="Exam type">{data.typeName}</Detail>
                <Detail label="Total students">{total}</Detail>
                <p className="text-sm text-ink-2">The design, instructions and signatory come from <Link className="text-brand-text hover:underline" href="/settings/document-designs">Settings, Document Designs</Link>.</p>
              </CardBody>
            </Card>
            {data.prints && data.prints.length > 0 && (
              <Card>
                <CardHeader title="Printed before" />
                <ul className="divide-y divide-line border-t border-line text-sm">
                  {data.prints.map((p) => <li key={p.id} className="px-4 py-2">{plural(p.count, "card")}{p.studentId ? " (one student)" : ""} by {p.by || "someone"}, {formatDateTime(p.printedAt, page.current.school.timeZone)}</li>)}
                </ul>
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}
