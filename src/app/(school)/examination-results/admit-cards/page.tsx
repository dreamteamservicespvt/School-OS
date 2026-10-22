import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Lock, Printer } from "lucide-react";
import { periodSetup } from "@/lib/period-setup";
import { periodFromSearch } from "@/lib/periods";
import { PeriodFilter } from "@/components/list/period-filter";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { fileLink } from "@/lib/files";
import { plural } from "@/lib/academic/common";
import { ADMIT_BATCH, admitRoster } from "@/lib/exams/admit";
import { EXAM_STATUS_TONE, ExamRuleError, shownExamStatus } from "@/lib/exams/common";
import { sitters } from "@/lib/exams/roster";
import { currentDesign } from "@/lib/documents/designs";
import { EmptyState } from "@/components/empty-state";
import { Pill } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/kit";
import { UrlSelect } from "@/components/ui/kit-client";
import { cx } from "@/components/ui/cx";
import { examOverlaps } from "../_lib/period";
import { examPage, one, withYear, type SearchParams } from "../_lib/page";
import { NoYear, PageTop } from "../_components/page-top";
import { AdmitPreview, AdmitWorkspace, type AdmitHead, type AdmitPaper, type AdmitStudent } from "./admit-ui";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Admit Cards") };
}
const PATH = "/examination-results/admit-cards";
const short = (n: string) => n.replace(/^Class /, "");

export default async function AdmitCardsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const page = await examPage(raw);
  if (!page.scope.datesheets && !page.scope.manage) redirect("/no-access");
  if (!page.year) return (<><PageTop page={page} href={PATH} /><NoYear /></>);
  const year = page.year;
  const dates = await periodSetup(page.current);
  const range = periodFromSearch(raw, dates);
  const schoolId = page.current.ctx.schoolId;
  const data = await withSchool(page.current.ctx, async (tx) => {
    const exams = await tx.exam.findMany({ where: { academicYearId: year.id, archivedAt: null, ...examOverlaps(range) }, include: { entries: { where: { archivedAt: null }, select: { subjectId: true, classId: true } } }, orderBy: { startDate: "desc" } });
    const classes = await tx.schoolClass.findMany({ where: { id: { in: [...new Set(exams.flatMap((e) => e.classIds))] } }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
    const ready = exams.filter((e) => e.status !== "DRAFT");
    const exam = ready.find((e) => e.id === one(raw.exam)) ?? ready[0] ?? null;
    if (!exam) return { exams, classes, exam: null };
    const sections = await tx.section.findMany({ where: { classId: { in: exam.classIds }, academicYearId: year.id, archivedAt: null }, include: { schoolClass: true }, orderBy: [{ schoolClass: { sortOrder: "asc" } }, { name: "asc" }] });
    const sectionId = sections.some((s) => s.id === one(raw.section)) ? one(raw.section)! : sections[0]?.id;
    const [counts, prints] = await Promise.all([
      tx.enrolment.groupBy({ by: ["sectionId"], where: { sectionId: { in: sections.map((s) => s.id) }, academicYearId: year.id, archivedAt: null, status: "STUDYING", student: { archivedAt: null } }, _count: { _all: true } }),
      tx.admitCardPrint.findMany({ where: { examId: exam.id }, orderBy: { printedAt: "desc" } }),
    ]);
    const base = { exams, classes, exam, sections, counts, prints };
    if (!sectionId) return { ...base, sectionId: null, roster: null, problem: null };
    let roster = null;
    let problem: string | null = null;
    try { roster = await admitRoster(tx, exam.id, sectionId); } catch (e) { if (e instanceof ExamRuleError) problem = e.message; else throw e; }
    if (!roster) return { ...base, sectionId, roster, problem };
    const ids = roster.students.map((s) => s.studentId);
    const [school, design, guardians, subjects, people] = await Promise.all([
      tx.school.findFirst({ where: { id: schoolId }, select: { name: true, address: true, board: true, code: true, logoFileId: true } }),
      currentDesign(tx, "admit-card"),
      tx.studentGuardian.findMany({ where: { studentId: { in: ids }, archivedAt: null }, select: { studentId: true, relationship: true, guardian: { select: { name: true } } } }),
      tx.subject.findMany({ where: { id: { in: roster.detail.entries.map((e) => e.subjectId) } }, select: { id: true, type: true } }),
      tx.userLogin.findMany({ where: { id: { in: prints.filter((p) => p.sectionId === sectionId).map((p) => p.printedById).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } }),
    ]);
    return { ...base, sectionId, roster, problem, school, design, guardians, subjects, people };
  });

  const tz = page.current.school.timeZone;
  const chooser = (
    <div className="flex flex-col gap-3">
      <div><Suspense><PeriodFilter {...dates} ahead allLabel="All exam dates" /></Suspense></div>
      {data.exams.length > 0 && (
        <ul className="-mx-4 flex gap-3 overflow-x-auto no-scrollbar px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-3" aria-label="Exams">
          {data.exams.map((e) => {
            const status = shownExamStatus(e, page.today);
            const ready = e.status !== "DRAFT";
            const names = data.classes.filter((c) => e.classIds.includes(c.id)).map((c) => short(c.name));
            const on = data.exam?.id === e.id;
            const inner = (
              <>
                <span className="flex items-center gap-2"><Pill tone={EXAM_STATUS_TONE[status]}>{status}</Pill>{!ready && <Lock size={14} className="text-ink3" aria-hidden="true" />}</span>
                <span className="block font-semibold text-[15px] mt-2">{e.title} · {names.length > 3 ? `Classes ${names[0]}–${names.at(-1)}` : names.length === 1 ? `Class ${names[0]}` : `Classes ${names.join(", ")}`}</span>
                <span className="block text-[12.5px] text-ink3">{formatDate(e.startDate)} <Words k="to" /> {formatDate(e.endDate)} · {plural(new Set(e.entries.map((x) => x.subjectId)).size, "subject")}{!ready ? " · publish the datesheet first" : ""}</span>
              </>
            );
            const cls = cx("block h-full w-full text-left rounded-2xl border-2 bg-surface p-4 shadow-card transition", on ? "border-brand" : "border-transparent hover:border-brand/30", !ready && "opacity-60");
            return (
              <li key={e.id} className={cx("w-[78%] shrink-0 sm:w-auto", on && "order-first sm:order-none")}>
                {ready ? <Link href={withYear(`${PATH}?exam=${e.id}`, page)} aria-current={on ? "true" : undefined} className={cls} scroll={false}>{inner}</Link> : <div className={cls}>{inner}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const sub = page.scope.office ? "Print admit cards for a whole class or one student" : "Only datesheets that are published have admit cards";
  if (!data.exam) {
    return (
      <>
        <PageTop page={page} href={PATH} sub={sub} />
        <div className="flex flex-col gap-5">
          {chooser}
          {data.exams.length === 0 && range ? <EmptyState title="No exams in these dates"><Words k="Choose other dates, or All exam dates." /></EmptyState>
            : <EmptyState title="No published datesheets"><Words k="Admit cards are made from a published datesheet. Publish one on the Datesheet page first." /></EmptyState>}
        </div>
      </>
    );
  }

  const { exam, roster } = data;
  const sections = data.sections ?? [];
  const label = sections.find((s) => s.id === data.sectionId);
  const classLabel = label ? `${short(label.schoolClass.name)} ${label.name}` : "";
  const total = roster?.students.length ?? 0;
  const pdfBase = `${PATH}/pdf?exam=${exam.id}&section=${data.sectionId}&`;
  const countOf = (id: string) => data.counts?.find((c) => c.sectionId === id)?._count._all ?? 0;
  const printedOf = (id: string) => Math.min(countOf(id), (data.prints ?? []).filter((p) => p.sectionId === id && !p.studentId).reduce((n, p) => n + p.count, 0));
  const lastWhole = (data.prints ?? []).find((p) => p.sectionId === data.sectionId && !p.studentId);
  const by = lastWhole && "people" in data ? data.people?.find((x) => x.id === lastWhole.printedById)?.displayName : undefined;
  const printedNote = lastWhole ? `printed for this class on ${formatDateTime(lastWhole.printedAt, tz)}${by ? ` by ${by}` : ""}` : "not printed yet";

  let students: AdmitStudent[] = [];
  let papers: AdmitPaper[] = [];
  let head: AdmitHead | null = null;
  if (roster && label && "school" in data && data.school) {
    const mine = roster.detail.entries.filter((e) => e.classId === label.classId);
    papers = mine.map((e) => ({
      subjectId: e.subjectId, subject: e.subjectName, split: e.categories.map((c) => `${c.name} ${c.max}`).join(" · "),
      day: `${e.day.slice(0, 3)} ${formatDate(e.date)}`, time: e.time, max: e.gradeOnly ? "Graded" : String(e.maxMarks), invigilator: e.invigilator ?? "",
    }));
    students = roster.students.map((s) => {
      const g = data.guardians.filter((x) => x.studentId === s.studentId);
      return {
        id: s.studentId, name: s.name, rollNo: s.rollNo, admissionNo: s.admissionNo, photo: s.photoFileId ? fileLink(s.photoFileId, schoolId) : null,
        father: g.find((x) => /father/i.test(x.relationship))?.guardian.name ?? "", mother: g.find((x) => /mother/i.test(x.relationship))?.guardian.name ?? "",
        skip: mine.filter((e) => { const sub = data.subjects.find((x) => x.id === e.subjectId); return sub ? sitters([s], sub).length === 0 : false; }).map((e) => e.subjectId),
      };
    });
    const sc = data.school;
    head = {
      school: sc.name, place: [sc.address, sc.board, sc.code].filter(Boolean).join(" · "), logo: sc.logoFileId ? fileLink(sc.logoFileId, schoolId) : null,
      title: data.design.options.title || "Admit Card", examLine: `${exam.title} ${year.name}${roster.detail.termName ? ` · ${roster.detail.termName}` : ""}`, classLabel,
      instructions: (data.design.options.body ?? "").replace(/\{\{[^}]*\}\}/g, "").split(/\n+|(?<=\.)\s+/).map((x) => x.trim()).filter(Boolean).slice(0, 6),
      signLines: ["Student", "Class teacher"],
    };
  }
  const typeLine = [roster?.detail.typeName, roster?.detail.termName].filter(Boolean).join(" · ");

  return (
    <>
      <PageTop page={page} href={PATH} sub={sub} />
      <div className="flex flex-col gap-5 lg:gap-6">
        {chooser}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px] items-start">
          <Card className="overflow-hidden min-w-0">
            <div className="p-4 md:p-5 grid grid-cols-2 md:grid-cols-4 gap-3 border-b border-line">
              <div className="min-w-0"><p className="text-[12px] text-ink3 font-semibold"><Words k="Exam" /></p><p className="font-semibold text-[14.5px] truncate">{exam.title} {year.name}</p></div>
              <div className="min-w-0"><p className="text-[12px] text-ink3 font-semibold"><Words k="Class" /></p>
                <Suspense><UrlSelect name="section" label="Class" value={data.sectionId ?? ""} className="mt-0.5 [&_select]:!h-9 [&_select]:!text-[14px]" options={sections.map((s) => ({ value: s.id, label: `${short(s.schoolClass.name)} ${s.name}` }))} /></Suspense>
              </div>
              <div className="min-w-0"><p className="text-[12px] text-ink3 font-semibold"><Words k="Type" /></p><p className="font-semibold text-[14.5px] truncate">{typeLine || "—"}</p></div>
              <div><p className="text-[12px] text-ink3 font-semibold"><Words k="Total students" /></p><p className="font-semibold text-[14.5px] tnum">{total}</p></div>
            </div>
            {data.problem ? <div className="p-4"><EmptyState title="Admit cards are not ready">{data.problem}</EmptyState></div>
              : !roster || !head ? <div className="p-4"><EmptyState title="No sections yet"><Words k="Add sections to these classes in Academic Management first." /></EmptyState></div>
              : total === 0 ? <div className="p-4"><EmptyState title="No students in this class"><Words k="There is nobody to print for in" /> {classLabel}.</EmptyState></div>
              : <AdmitWorkspace students={students} papers={papers} head={head} base={pdfBase} batch={ADMIT_BATCH} printedNote={printedNote} />}
          </Card>
          <div className="flex flex-col gap-5 min-w-0">
            {head && students[0] && <AdmitPreview s={students[0]} papers={papers} head={head} base={pdfBase} />}
            <Card>
              <CardHeader title="Printed so far" description={`${exam.title} · whole-class prints`} icon={Printer} />
              <div className="px-5 pb-5 flex flex-col gap-2.5">
                {sections.map((s) => {
                  const n = countOf(s.id);
                  const done = printedOf(s.id);
                  const full = n > 0 && done >= n;
                  return (
                    <div key={s.id} className="flex items-center gap-3 text-[13.5px]">
                      <span className="w-12 font-semibold">{short(s.schoolClass.name)} {s.name}</span>
                      <Progress value={n ? (done / n) * 100 : 0} tone={full ? "ok" : "warn"} className="flex-1" label={`${short(s.schoolClass.name)} ${s.name}: ${done} of ${n} printed`} />
                      <span className={cx("w-20 text-right tnum", !full && "text-warn font-semibold")}>{done} <Words k="of" /> {n}</span>
                    </div>
                  );
                })}
                <p className="text-[12.5px] text-ink3 mt-1"><Words k="The design, instructions and signatures come from" /> <Link className="text-brand hover:underline" href="/settings/document-designs"><Words k="Settings, Document Designs" /></Link>.</p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
