import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { CircleHelp, FileText, Lock } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { momentWhere, periodFromSearch } from "@/lib/periods";
import { DIFFICULTIES, bankPairs, difficultyLabel, questionBank, typeLabel } from "@/lib/exams/questions";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { Chips, DataList, ListEmpty, Toolbar } from "@/components/ui/kit";
import { UrlSearch, UrlSelect } from "@/components/ui/kit-client";
import { PeriodFilter } from "@/components/list/period-filter";
import { examPage, one, withYear, type SearchParams } from "../_lib/page";
import { periodQuery } from "../_lib/period";
import { NoYear, PageTop } from "../_components/page-top";
import { AddQuestionButton, ArchiveQuestionButton, BankBar, MakePaperButton, PaperMenu, type Pair } from "./qp-ui";

export const metadata: Metadata = { title: "Question Papers" };
const PATH = "/examination-results/question-papers";
const DIFF_TONE: Record<string, "ok" | "info" | "warn"> = { easy: "ok", medium: "info", hard: "warn" };
const BANK_PAGE = 50;

export default async function QuestionPapersPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const page = await examPage(raw);
  const s = page.scope;
  const teaches = s.teaches === null || s.teaches.length > 0;
  if (!page.current.features.has("exam-question-papers") || s.office || !(s.manage || teaches)) redirect("/no-access");
  if (!page.year) return (<><PageTop page={page} href={PATH} /><NoYear /></>);
  const year = page.year;
  const tab = one(raw.tab) === "bank" ? "bank" : "papers";
  const q = one(raw.q).trim().slice(0, 80);
  const pairKey = one(raw.pair);
  const diff = DIFFICULTIES.some((d) => d.value === one(raw.difficulty)) ? one(raw.difficulty) : "";
  const tz = page.current.school.timeZone;
  const range = tab === "papers" ? periodFromSearch(raw, { timeZone: tz }) : null;
  const pageNo = Math.max(1, Number(one(raw.page)) || 1);

  const data = await withSchool(page.current.ctx, async (tx) => {
    const allowed = await bankPairs(tx, s, year.id);
    let pairs: { classId: string; subjectId: string }[];
    if (allowed) pairs = allowed;
    else {
      const subjectClasses = await tx.subjectClass.findMany({ where: { archivedAt: null, schoolClass: { campusId: page.campusId, archivedAt: null } }, select: { classId: true, subjectId: true } });
      pairs = subjectClasses;
    }
    const [classes, subjects, chapters, exams] = await Promise.all([
      tx.schoolClass.findMany({ where: { id: { in: pairs.map((p) => p.classId) } }, select: { id: true, name: true, sortOrder: true } }),
      tx.subject.findMany({ where: { id: { in: pairs.map((p) => p.subjectId) }, archivedAt: null }, select: { id: true, name: true } }),
      tx.syllabusItem.findMany({ where: { academicYearId: year.id, kind: "CHAPTER", archivedAt: null, classId: { in: pairs.map((p) => p.classId) } }, orderBy: { sortOrder: "asc" }, select: { id: true, title: true, classId: true, subjectId: true } }),
      tx.exam.findMany({ where: { academicYearId: year.id, archivedAt: null }, orderBy: { startDate: "asc" }, select: { id: true, title: true, classIds: true } }),
    ]);
    const options: (Pair & { classId: string; subjectId: string; sort: number })[] = pairs
      .map((p) => {
        const c = classes.find((x) => x.id === p.classId);
        const sub = subjects.find((x) => x.id === p.subjectId);
        if (!c || !sub) return null;
        return { value: `${p.classId}|${p.subjectId}`, label: `${c.name} · ${sub.name}`, classId: p.classId, subjectId: p.subjectId, sort: c.sortOrder, chapters: chapters.filter((x) => x.classId === p.classId && x.subjectId === p.subjectId).map((x) => ({ id: x.id, title: x.title })) };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
      .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
    const chosen = options.find((o) => o.value === pairKey) ?? null;
    const scopePairs = chosen ? [{ classId: chosen.classId, subjectId: chosen.subjectId }] : allowed;

    const span = range ? momentWhere(range, tz) : null;
    const paperWhere = {
      archivedAt: null,
      ...(scopePairs ? { OR: scopePairs.length ? scopePairs.map((p) => ({ classId: p.classId, subjectId: p.subjectId })) : [{ id: { in: [] as string[] } }] } : {}),
      ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
      ...(span ? { createdAt: span } : {}),
    };
    const [papers, bank, counts] = await Promise.all([
      tab === "papers" ? tx.questionPaper.findMany({ where: paperWhere, orderBy: { createdAt: "desc" }, take: 200 }) : Promise.resolve([]),
      tab === "bank" ? questionBank(tx, scopePairs, { q, difficulty: diff || undefined }, { skip: (pageNo - 1) * BANK_PAGE, take: BANK_PAGE }) : Promise.resolve(null),
      tab === "bank" ? tx.question.groupBy({ by: ["difficulty"], where: { archivedAt: null, ...(scopePairs ? { OR: scopePairs.length ? scopePairs.map((p) => ({ classId: p.classId, subjectId: p.subjectId })) : [{ id: { in: [] as string[] } }] } : {}) }, _count: true }) : Promise.resolve([]),
    ]);
    const people = await tx.userLogin.findMany({ where: { id: { in: papers.map((p) => p.createdById).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } });
    return { options, chosen, papers, bank, counts, people, exams };
  });

  const { options, chosen } = data;
  const canWrite = page.writable && options.length > 0;
  const pairLabel = (classId: string, subjectId: string) => options.find((o) => o.value === `${classId}|${subjectId}`)?.label ?? "";
  const examOpts = data.exams.filter((e) => !chosen || e.classIds.includes(chosen.classId)).map((e) => ({ value: e.id, label: e.title }));
  const link = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    const base: Record<string, string> = { tab, pair: pairKey, q, difficulty: diff, ...over };
    for (const [k, v] of Object.entries(base)) if (v && !(k === "tab" && v === "papers")) p.set(k, v);
    if (base.tab !== "bank") for (const [k, v] of periodQuery(raw)) p.set(k, v);
    return withYear(`${PATH}${p.size ? `?${p}` : ""}`, page);
  };
  const sub = s.manage ? "Question bank by chapter and difficulty, and papers made from it" : "Questions and papers for the subjects you teach";

  const toolbar = (
    <Toolbar>
      <Suspense><UrlSearch placeholder={tab === "papers" ? "Search papers" : "Search question text"} /></Suspense>
      {options.length > 1 && <Suspense><UrlSelect name="pair" label="Class and subject" className="md:w-64" reset={["page"]} options={[{ value: "", label: "All classes and subjects" }, ...options.map((o) => ({ value: o.value, label: o.label }))]} /></Suspense>}
      {tab === "papers" && <Suspense><PeriodFilter timeZone={tz} allLabel="Made any time" /></Suspense>}
    </Toolbar>
  );

  let body: React.ReactNode;
  if (options.length === 0) {
    body = (
      <EmptyState title="No subjects to work on" Icon={CircleHelp}>
        <p>{s.manage ? "Add subjects to classes in Academic Management first." : "Question Papers shows the subjects given to you in Teacher Allocation. Ask the Exam In-charge if one is missing."}</p>
      </EmptyState>
    );
  } else if (tab === "papers") {
    const rows = data.papers;
    body = (
      <Card className="overflow-hidden">
        {toolbar}
        <DataList rows={rows} rowKey={(p) => p.id} minWidth={760} caption="Question papers"
          empty={q || range || chosen ? <ListEmpty /> : <ListEmpty icon={FileText} title="No papers yet" body="Add questions to the bank, then make a paper from them." />}
          columns={[
            { key: "t", label: "Paper", render: (p) => <><p className="font-semibold">{p.title}</p><p className="text-[12.5px] text-ink3">{pairLabel(p.classId, p.subjectId)}{p.examId ? ` · ${data.exams.find((e) => e.id === p.examId)?.title ?? ""}` : ""}</p></> },
            { key: "q", label: "Questions", align: "right", render: (p) => p.questionIds.length },
            { key: "m", label: "Total marks", align: "right", render: (p) => p.totalMarks },
            { key: "by", label: "Made by", render: (p) => <><p className="text-[13.5px]">{data.people.find((x) => x.id === p.createdById)?.displayName ?? ""}</p><p className="text-[12px] text-ink3">{formatDate(p.createdAt, tz)}</p></> },
            { key: "s", label: "Status", render: (p) => p.status === "final" ? <Pill tone="ok"><Lock size={12} aria-hidden="true" />Final</Pill> : <Pill tone="neutral">Draft</Pill> },
            { key: "a", label: <span className="sr-only">Actions</span>, align: "right", render: (p) => <PaperMenu id={p.id} title={p.title} status={p.status} canEdit={page.writable} /> },
          ]}
          mobile={(p) => ({ icon: p.status === "final" ? Lock : FileText, iconTone: p.status === "final" ? "ok" : "neutral", title: p.title, sub: `${p.totalMarks} marks · ${pairLabel(p.classId, p.subjectId)}`, right: <PaperMenu id={p.id} title={p.title} status={p.status} canEdit={page.writable} /> })}
          footer={`Showing ${rows.length} paper${rows.length === 1 ? "" : "s"}`} />
      </Card>
    );
  } else {
    const bank = data.bank!;
    const total = data.counts.reduce((n, c) => n + c._count, 0);
    const pages = Math.max(1, Math.ceil(bank.total / BANK_PAGE));
    body = (
      <Card className="overflow-hidden">
        {toolbar}
        <div className="px-3 pt-3">
          <Chips label="Difficulty" value={diff} options={[{ value: "", label: "All levels", count: total, href: link({ difficulty: "", page: "" }) }, ...DIFFICULTIES.map((d) => ({ value: d.value, label: d.label, count: data.counts.find((c) => c.difficulty === d.value)?._count ?? 0, href: link({ difficulty: d.value, page: "" }) }))]} />
        </div>
        {chosen && page.writable && <div className="mt-3"><BankBar form="qp-bank" pairs={options} exams={examOpts} pair={chosen.value} /></div>}
        <DataList rows={bank.rows} rowKey={(x) => x.id} minWidth={820} caption="Question bank"
          select={chosen && page.writable ? { form: "qp-bank", name: "questionIds", label: (x) => `Choose: ${x.text.slice(0, 60)}` } : undefined}
          empty={q || diff ? <ListEmpty /> : <ListEmpty icon={CircleHelp} title="No questions yet" body="Add questions one by one with Add question." />}
          columns={[
            { key: "q", label: "Question", className: "max-w-[440px]", render: (x) => <p className="text-[13.5px] line-clamp-2">{x.text}</p> },
            { key: "ty", label: "Type", nowrap: true, render: (x) => typeLabel(x.type) },
            { key: "ch", label: "Chapter", render: (x) => <><p className="text-[13px]">{x.chapter}</p>{!chosen && <p className="text-[12px] text-ink3">{pairLabel(x.classId, x.subjectId)}</p>}</> },
            { key: "d", label: "Difficulty", render: (x) => <Pill tone={DIFF_TONE[x.difficulty] ?? "neutral"}>{difficultyLabel(x.difficulty)}</Pill> },
            { key: "m", label: "Marks", align: "right", render: (x) => x.marks },
            { key: "u", label: "Used in", render: (x) => <span className="text-[13px] text-ink3">{x.usedIn.length ? x.usedIn.join(", ") : "Not used"}</span> },
            ...(page.writable ? [{ key: "a", label: <span className="sr-only">Actions</span>, align: "right" as const, render: (x: (typeof bank.rows)[number]) => <ArchiveQuestionButton id={x.id} text={x.text} /> }] : []),
          ]}
          mobile={(x) => ({ icon: CircleHelp, title: x.text, sub: `${x.chapter} · ${typeLabel(x.type)} · ${x.marks} mark${x.marks === 1 ? "" : "s"}`, pills: <Pill tone={DIFF_TONE[x.difficulty] ?? "neutral"}>{difficultyLabel(x.difficulty)}</Pill> })}
          footer={<span>Showing {bank.rows.length ? (pageNo - 1) * BANK_PAGE + 1 : 0} to {(pageNo - 1) * BANK_PAGE + bank.rows.length} of {bank.total}{pages > 1 && <> · {pageNo > 1 && <a className="font-semibold text-brand hover:underline" href={link({ page: String(pageNo - 1) })}>Previous</a>}{pageNo > 1 && pageNo < pages && " · "}{pageNo < pages && <a className="font-semibold text-brand hover:underline" href={link({ page: String(pageNo + 1) })}>Next</a>}</>}{!chosen && page.writable ? " · Choose a class and subject to make a paper from ticked questions" : ""}</span>} />
      </Card>
    );
  }

  return (
    <>
      <PageTop page={page} href={PATH} sub={sub}>
        {canWrite && <AddQuestionButton pairs={options} start={chosen?.value ?? ""} />}
        {canWrite && <MakePaperButton pairs={options} exams={examOpts} start={chosen?.value ?? ""} />}
      </PageTop>
      <div className="flex flex-col gap-5 lg:gap-6">
        <Chips label="Show" value={tab} options={[{ value: "papers", label: "Papers", href: link({ tab: "papers", page: "", difficulty: "" }) }, { value: "bank", label: "Question bank", href: link({ tab: "bank", page: "" }) }]} />
        {body}
      </div>
    </>
  );
}
