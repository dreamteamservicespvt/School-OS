import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { plural } from "@/lib/academic/common";
import { examDetail, marksExist } from "@/lib/exams/datesheet";
import { EXAM_STATUS_TONE, patternLabel, shownExamStatus } from "@/lib/exams/common";
import { sittings } from "@/lib/exams/seating";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Detail } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { examPage, withYear, type SearchParams } from "../../_lib/page";
import { PageTop } from "../../_components/page-top";
import { ArchiveButton, CategoriesButton, PublishButton, RestoreButton } from "../datesheet-ui";

export const metadata: Metadata = { title: "Datesheet" };

export default async function DatesheetDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const page = await examPage(await searchParams);
  const data = await withSchool(page.current.ctx, async (tx) => {
    const d = await examDetail(tx, id, { archived: true });
    if (!d) return null;
    const [locked, categories, scale, sitList, seated, counts] = await Promise.all([
      marksExist(tx, id),
      tx.markCategory.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: "asc" }, select: { name: true } }),
      d.exam.gradeScaleId ? tx.gradeScale.findFirst({ where: { id: d.exam.gradeScaleId }, select: { name: true } }) : null,
      sittings(tx, id),
      tx.seatAllocation.groupBy({ by: ["date", "startTime"], where: { examId: id, archivedAt: null }, _count: true }),
      tx.enrolment.groupBy({ by: ["classId"], where: { academicYearId: d.exam.academicYearId, classId: { in: d.exam.classIds }, archivedAt: null, status: "STUDYING" }, _count: true }),
    ]);
    // Teachers and class teachers see only the datesheets of their own classes.
    if (page.scope.sectionIds) {
      const mine = await tx.section.findMany({ where: { id: { in: page.scope.sectionIds } }, select: { classId: true } });
      if (!d.exam.classIds.some((c) => mine.some((m) => m.classId === c))) return null;
    }
    return { ...d, locked, categories: categories.map((c) => c.name), scaleName: scale?.name ?? null, sitList, seated: seated.length, students: counts.reduce((s, c) => s + c._count, 0) };
  });
  if (!data) notFound();
  const { exam, entries, classes } = data;
  const status = shownExamStatus(exam, page.today);
  const can = page.scope.datesheets && page.writable && !exam.archivedAt;
  const seatingOn = page.current.features.has("exam-seating");
  const firstDay = entries[0] ? formatDate(entries[0].date) : formatDate(exam.startDate);

  return (
    <>
      <PageTop page={page} title={exam.title} href={`/examination-results/datesheet/${id}`} showYear={false}>
        <a className="inline-flex min-h-11 items-center rounded-lg border border-line-strong bg-surface px-4 font-medium hover:bg-surface-2" href={`/examination-results/datesheet/${id}/print`} target="_blank" rel="noopener">Print</a>
        {can && <ButtonLink href={withYear(`/examination-results/datesheet/${id}/edit`, page)}>{data.locked ? "Change title" : "Edit"}</ButtonLink>}
        {can && exam.status === "DRAFT" && entries.length > 0 && <PublishButton examId={id} title={exam.title} papers={entries.length} firstDay={firstDay} />}
        {exam.status !== "DRAFT" && !exam.archivedAt && (page.scope.datesheets || page.scope.manage) && <ButtonLink href={withYear(`/examination-results/admit-cards?exam=${id}`, page)}>Admit cards</ButtonLink>}
      </PageTop>

      {exam.archivedAt && (
        <Alert tone="warning" className="mb-4" title="This datesheet is archived" action={page.scope.datesheets && page.writable ? <RestoreButton examId={id} /> : undefined}>
          It is not shown to parents or on the School Calendar.
        </Alert>
      )}
      {exam.status === "DRAFT" && !exam.archivedAt && (
        <Alert className="mb-4" title="Draft">Only staff can see this datesheet. Set mark categories if a subject has theory and internal marks, then publish it.</Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          {classes.map((c) => {
            const mine = entries.filter((e) => e.classId === c.id);
            return (
              <Card key={c.id}>
                <CardHeader title={c.name} description={`${plural(mine.length, "paper")}`} />
                {mine.length === 0 ? <p className="px-5 pb-5 text-ink-2">No papers for {c.name}.</p> : (
                  <>
                    <div className="hidden overflow-x-auto md:block">
                      <table className="w-full text-left text-[15px]">
                        <caption className="sr-only">{c.name} papers</caption>
                        <thead className="border-y border-line bg-surface-2 text-sm text-ink-2">
                          <tr><th className="px-4 py-2 font-medium">Date</th><th className="px-4 py-2 font-medium">Time</th><th className="px-4 py-2 font-medium">Subject</th><th className="px-4 py-2 font-medium">Room</th><th className="px-4 py-2 font-medium">Invigilator</th><th className="px-4 py-2 font-medium">Max marks</th><th className="px-4 py-2"><span className="sr-only">Actions</span></th></tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {mine.map((e) => (
                            <tr key={e.id}>
                              <td className="px-4 py-2 whitespace-nowrap">{formatDate(e.date)}<span className="block text-sm text-ink-2">{e.day}</span></td>
                              <td className="px-4 py-2 whitespace-nowrap">{e.time}<span className="block text-sm text-ink-2">{e.duration}</span></td>
                              <td className="px-4 py-2 font-medium">{e.subjectName}{e.pattern && <span className="block text-sm font-normal text-ink-2">{patternLabel(e.pattern)}</span>}</td>
                              <td className="px-4 py-2">{e.room ?? <span className="text-ink-2">Not set</span>}</td>
                              <td className="px-4 py-2">{e.invigilator ?? <span className="text-ink-2">Not set</span>}</td>
                              <td className="px-4 py-2">{e.gradeOnly ? "Graded" : e.maxMarks}{e.categories.length > 0 && <span className="block text-sm text-ink-2">{e.categories.map((x) => `${x.name} ${x.max}`).join(", ")}</span>}</td>
                              <td className="px-4 py-2 text-right">{can && !data.locked && !e.gradeOnly && <CategoriesButton entryId={e.id} subject={e.subjectName} maxMarks={e.maxMarks} current={e.categories} names={data.categories} classes={exam.classIds.length} />}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <ul className="divide-y divide-line border-t border-line md:hidden">
                      {mine.map((e) => (
                        <li key={e.id} className="p-4">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-medium">{e.subjectName}</span>
                            <span className="text-sm">{e.gradeOnly ? "Graded" : `Out of ${e.maxMarks}`}</span>
                          </div>
                          <p className="text-sm text-ink-2">{e.day} {formatDate(e.date)}, {e.time}</p>
                          <p className="text-sm text-ink-2">{e.room ?? "No room"} · {e.invigilator ?? "No invigilator"}</p>
                          {e.categories.length > 0 && <p className="text-sm text-ink-2">{e.categories.map((x) => `${x.name} ${x.max}`).join(", ")}</p>}
                          {can && !data.locked && !e.gradeOnly && <div className="mt-2"><CategoriesButton entryId={e.id} subject={e.subjectName} maxMarks={e.maxMarks} current={e.categories} names={data.categories} classes={exam.classIds.length} /></div>}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Card>
            );
          })}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Exam details" />
            <CardBody className="space-y-3">
              <div><Badge tone={exam.archivedAt ? "danger" : EXAM_STATUS_TONE[status]}>{exam.archivedAt ? "Archived" : status}</Badge></div>
              <Detail label="Exam type">{data.typeName}</Detail>
              <Detail label="Term">{data.termName}</Detail>
              <Detail label="Pattern">{patternLabel(exam.pattern)}</Detail>
              <Detail label="Dates">{formatDate(exam.startDate)} to {formatDate(exam.endDate)}</Detail>
              <Detail label="Students">{data.students}</Detail>
              <Detail label="Grade scale">{data.scaleName ?? "The class's board scale"}</Detail>
              {exam.publishedAt && <Detail label="Published">{formatDateTime(exam.publishedAt, page.current.school.timeZone)}</Detail>}
              {data.locked && <p className="text-sm text-ink-2">Results exist, so only the title can change.</p>}
            </CardBody>
          </Card>
          {seatingOn && exam.status !== "DRAFT" && !exam.archivedAt && (page.scope.datesheets || page.scope.manage) && (
            <Card>
              <CardHeader title="Seating" description={data.seated ? `Seat plans for ${plural(data.seated, "sitting")} of ${data.sitList.length}` : `${plural(data.sitList.length, "sitting")}, no seat plan yet`} />
              <CardBody><ButtonLink href={withYear(`/examination-results/datesheet/${id}/seating`, page)}>Open seating</ButtonLink></CardBody>
            </Card>
          )}
          {can && !data.locked && (
            <Card>
              <CardHeader title="Archive" description="Take this datesheet out of use. Possible until marks are entered." />
              <CardBody><ArchiveButton examId={id} title={exam.title} /></CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
