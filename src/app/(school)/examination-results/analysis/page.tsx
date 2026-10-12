import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Award, Calculator, ChartColumn, ChartLine, ChartNoAxesColumn, CircleCheck, ClipboardList, TrendingDown, TrendingUp, TriangleAlert, Trophy, Users, X } from "lucide-react";
import { withSchool } from "@/lib/db";
import { periodFromSearch } from "@/lib/periods";
import { examKey, finalKey } from "@/lib/exams/common";
import { analyse, entryStatus, studentProgress, studentsBehind, type Drill } from "@/lib/exams/analysis";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/empty-state";
import { Bars, DataList, HBars, ListEmpty, Split, Stats, Toolbar, TrendLine, type StatItem } from "@/components/ui/kit";
import { ExportMenu, UrlSelect } from "@/components/ui/kit-client";
import { PeriodFilter } from "@/components/list/period-filter";
import { cx } from "@/components/ui/cx";
import { examPage, one, sectionOptions, withYear, type SearchParams } from "../_lib/page";
import { examOverlaps, periodQuery } from "../_lib/period";
import { NoYear, PageTop } from "../_components/page-top";

export const metadata: Metadata = { title: "Exam Analysis" };
const PATH = "/examination-results/analysis";
const DRILLS: Drill["kind"][] = ["all", "pass", "fail", "grade", "section", "subject-pass", "subject-fail", "top", "help"];
const pctTxt = (v: number | null | undefined) => (v === null || v === undefined ? "–" : `${Number.isInteger(v) ? v : v.toFixed(1)}%`);
const OUTCOME_TONE: Record<string, "ok" | "bad" | "warn"> = { Pass: "ok", Fail: "bad", Compartment: "warn" };

export default async function AnalysisPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const page = await examPage(raw);
  const s = page.scope;
  if (!s.results) redirect("/no-access");
  if (!page.year) return (<><PageTop page={page} href={PATH} /><NoYear /></>);
  const year = page.year;
  const tz = page.current.school.timeZone;
  const range = periodFromSearch(raw, { timeZone: tz });
  const sections = await sectionOptions(page);
  const classIds = [...new Set(sections.map((x) => x.classId))];

  const exams = await withSchool(page.current.ctx, async (tx) => {
    const list = await tx.exam.findMany({ where: { academicYearId: year.id, archivedAt: null, status: { not: "DRAFT" }, classIds: { hasSome: classIds }, ...examOverlaps(range) }, orderBy: { startDate: "desc" }, select: { id: true, title: true, startDate: true, classIds: true } });
    const withResults = await tx.result.groupBy({ by: ["key"], where: { key: { in: list.map((e) => examKey(e.id)) }, complete: true }, _count: true });
    const hasFinal = await tx.result.count({ where: { key: finalKey(year.id), complete: true, sectionId: { in: sections.map((x) => x.id) } } });
    return { list: list.filter((e) => withResults.some((w) => w.key === examKey(e.id))), hasFinal: hasFinal > 0 };
  });

  const examParam = one(raw.exam);
  const final = examParam === "final" && exams.hasFinal;
  const exam = final ? null : exams.list.find((e) => e.id === examParam) ?? exams.list[0] ?? null;
  const scopeParam = one(raw.scope);
  const classId = scopeParam.startsWith("c:") ? scopeParam.slice(2) : "";
  const sectionId = scopeParam.startsWith("s:") ? scopeParam.slice(2) : "";
  const subjectId = one(raw.subject);
  const drillKind = DRILLS.includes(one(raw.drill) as Drill["kind"]) ? (one(raw.drill) as Drill["kind"]) : null;
  const drill: Drill | null = drillKind ? { kind: drillKind, value: one(raw.value) || undefined } : null;
  const f = { examId: exam?.id ?? null, final, classId: classId || null, sectionId: sectionId || null, subjectId: subjectId || null };

  const link = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    const base: Record<string, string> = { exam: final ? "final" : exam?.id ?? "", scope: scopeParam, subject: subjectId, student: one(raw.student), drill: "", value: "", ...over };
    for (const [k, v] of Object.entries(base)) if (v) p.set(k, v);
    for (const [k, v] of periodQuery(raw)) p.set(k, v);
    return withYear(`${PATH}?${p}`, page);
  };

  const scopeOptions = [
    { value: "", label: sections.length > 1 ? "All my sections" : sections[0]?.label ?? "All sections" },
    ...classIds.filter((c) => sections.filter((x) => x.classId === c).length > 1).map((c) => ({ value: `c:${c}`, label: sections.find((x) => x.classId === c)!.className })),
    ...(sections.length > 1 ? sections.map((x) => ({ value: `s:${x.id}`, label: x.label })) : []),
  ];
  if (s.manage) scopeOptions[0].label = "All classes";

  const toolbar = (
    <Card className="overflow-hidden">
      <Toolbar>
        <Suspense>
          <UrlSelect name="exam" label="Exam" className="md:w-56" value={final ? "final" : exam?.id ?? ""} reset={["drill", "value", "student"]}
            options={[...exams.list.map((e) => ({ value: e.id, label: e.title })), ...(exams.hasFinal ? [{ value: "final", label: "Final result" }] : []), ...(exams.list.length || exams.hasFinal ? [] : [{ value: "", label: "No exam with results" }])]} />
        </Suspense>
        {scopeOptions.length > 1 && <Suspense><UrlSelect name="scope" label="Classes" className="md:w-48" options={scopeOptions} reset={["drill", "value", "student"]} /></Suspense>}
        <Suspense><PeriodFilter timeZone={tz} allLabel="All exam dates" /></Suspense>
        <ExportMenu href={`/examination-results/export?kind=analysis&exam=${final ? "final" : exam?.id ?? ""}${scopeParam ? `&scope=${scopeParam}` : ""}${subjectId ? `&subject=${subjectId}` : ""}${page.yearQuery ? `&${page.yearQuery}` : ""}`} className="hidden md:block" />
      </Toolbar>
    </Card>
  );
  const head = <PageTop page={page} href={PATH} sub={s.manage ? "Subject-wise and class-wise results, toppers and students who need help" : "Results of the sections you teach"} />;

  if (!exam && !final) {
    return (
      <>{head}<div className="flex flex-col gap-5">{toolbar}
        <EmptyState title={range ? "No results in these dates" : "No results to analyse yet"} Icon={ChartColumn}>
          <p>{range ? "Choose other dates, or All exam dates." : "Analysis shows once marks are entered and results are worked out for an exam."}</p>
        </EmptyState></div></>
    );
  }

  const data = await withSchool(page.current.ctx, async (tx) => {
    const a = await analyse(tx, page.current.ctx, s, year.id, f);
    const behind = drill ? await studentsBehind(tx, s, year.id, f, drill) : null;
    // Students who dropped: the same students in the exam before this one.
    let drops: { studentId: string; name: string; section: string; from: number; to: number }[] = [];
    let before: { id: string; title: string } | null = null;
    if (a && exam) {
      const prev = await tx.exam.findFirst({ where: { academicYearId: year.id, archivedAt: null, status: { not: "DRAFT" }, startDate: { lt: exam.startDate }, classIds: { hasSome: exam.classIds } }, orderBy: { startDate: "desc" }, select: { id: true, title: true } });
      if (prev) {
        before = prev;
        const ids = a.sections.map((x) => x.id);
        const [now, then] = await Promise.all([
          tx.result.findMany({ where: { key: examKey(exam.id), sectionId: { in: ids }, complete: true }, select: { studentId: true, percent: true, sectionId: true } }),
          tx.result.findMany({ where: { key: examKey(prev.id), complete: true, sectionId: { in: ids } }, select: { studentId: true, percent: true } }),
        ]);
        const fell = now.map((r) => ({ r, b: then.find((t) => t.studentId === r.studentId) })).filter((x) => x.b && x.r.percent !== null && x.b.percent !== null && x.b.percent - x.r.percent >= 8)
          .sort((p, q) => (q.b!.percent! - q.r.percent!) - (p.b!.percent! - p.r.percent!)).slice(0, 8);
        const names = await tx.student.findMany({ where: { id: { in: fell.map((x) => x.r.studentId) } }, select: { id: true, fullName: true } });
        drops = fell.map((x) => ({ studentId: x.r.studentId, name: names.find((n) => n.id === x.r.studentId)?.fullName ?? "", section: a.sections.find((z) => z.id === x.r.sectionId)?.label ?? "", from: x.b!.percent!, to: x.r.percent! }));
      }
    }
    const studentId = one(raw.student) || a?.overview.top[0]?.studentId || null;
    let progress = null;
    let who: { id: string; fullName: string } | null = null;
    if (studentId && /^[0-9a-f-]{36}$/i.test(studentId)) {
      const inScope = await tx.enrolment.findFirst({ where: { studentId, academicYearId: year.id, archivedAt: null, ...(s.sectionIds ? { sectionId: { in: s.sectionIds } } : {}) } });
      if (inScope) {
        progress = (await studentProgress(tx, studentId)).filter((p) => p.complete);
        who = await tx.student.findFirst({ where: { id: studentId }, select: { id: true, fullName: true } });
      }
    }
    const roster = a ? await tx.enrolment.findMany({ where: { academicYearId: year.id, archivedAt: null, status: "STUDYING", sectionId: { in: a.sections.map((x) => x.id) } }, select: { studentId: true, student: { select: { fullName: true } } }, orderBy: { student: { fullName: "asc" } }, take: 400 }) : [];
    const status = s.manage && exam ? await entryStatus(tx, s, year.id, { examId: exam.id, classId: classId || null }) : null;
    const subjects = a ? a.subjects : [];
    return { a, behind, drops, before, progress, who, roster, status, subjects };
  }, { timeout: 60_000 });

  const a = data.a;
  if (!a || a.overview.students === 0) {
    return (
      <>{head}<div className="flex flex-col gap-5">{toolbar}
        <EmptyState title="No results here yet" Icon={ChartColumn}><p>None of the chosen sections has a worked-out result for {final ? "the final result" : exam!.title}. Results are worked out once marks are entered.</p></EmptyState></div></>
    );
  }

  const o = a.overview;
  const subjectName = data.subjects.find((x) => x.subjectId === subjectId)?.subject;
  const topGrades = o.grades.filter((g) => /^(A1|A2|A\+|A|1|2)$/.test(g.grade)).reduce((n, g) => n + g.count, 0);
  const stats: StatItem[] = [
    { label: "Students", value: o.students, sub: a.sections.length === 1 ? a.sections[0].label : `${a.sections.length} sections`, icon: Users, href: link({ drill: "all" }) },
    { label: "Average", value: pctTxt(o.average), sub: subjectName ?? "All subjects", icon: Calculator },
    { label: "Pass", value: pctTxt(o.passPercent), sub: `${o.passed} of ${o.students}`, tone: "ok", icon: CircleCheck, href: link({ drill: "pass" }) },
    { label: "Top grades", value: topGrades, sub: "A1, A2 or the best grades", tone: "brand", icon: Award, href: link({ drill: "top" }) },
    { label: "Need support", value: o.failed + o.compartment, sub: o.compartment ? `${o.compartment} compartment` : "Did not pass", tone: o.failed + o.compartment ? "bad" : undefined, icon: TriangleAlert, href: link({ drill: "fail" }) },
  ];
  const subjectBars = (subjectId ? a.subjectRows.filter((r) => r.subjectId === subjectId).map((r) => ({ k: r.section, v: Math.round(r.average ?? 0) })) : [...data.subjects].sort((p, q) => p.subject.localeCompare(q.subject)).map((r) => ({ k: r.subject, v: Math.round(r.average ?? 0) })));
  const drillTitle = drill ? ({ all: "Every student", pass: "Students who passed", fail: "Students who did not pass", grade: `Grade ${drill.value ?? ""}`, section: a.sections.find((x) => x.id === drill.value)?.label ?? "One section", "subject-pass": "Passed the subject", "subject-fail": "Failed the subject", top: "Top 10", help: "Students who need help" } as Record<string, string>)[drill.kind] : "";
  const progress = data.progress ?? [];

  return (
    <>
      {head}
      <div className="flex flex-col gap-5 lg:gap-6">
        {toolbar}
        <Stats items={stats} />

        {data.behind && (
          <Card className="overflow-hidden">
            <CardHeader title={`${drillTitle} · ${data.behind.length}`} description={final ? "Final result" : exam!.title} icon={Users} divided
              action={<Link href={link({})} className="grid size-9 place-items-center rounded-xl text-ink3 hover:bg-sunken" aria-label="Close the list"><X size={18} aria-hidden="true" /></Link>} />
            <DataList rows={data.behind} rowKey={(r) => r.studentId} minWidth={640} caption={drillTitle} href={(r) => `/student-management/students/${r.studentId}`}
              empty={<ListEmpty title="Nobody here" body="No student matches this number." />}
              columns={[
                { key: "n", label: "Student", render: (r) => <span className="flex items-center gap-2.5"><Avatar name={r.name} size={30} /><span><span className="block font-semibold">{r.name}</span><span className="block text-[12px] text-ink3">{r.admissionNo}</span></span></span> },
                { key: "s", label: "Section", render: (r) => r.section },
                { key: "p", label: "Percentage", align: "right", render: (r) => pctTxt(r.percent) },
                { key: "g", label: "Grade", align: "center", render: (r) => r.grade ?? "" },
                { key: "r", label: "Rank", align: "right", render: (r) => r.rank ?? "" },
                { key: "o", label: "Result", render: (r) => r.outcome ? <Pill tone={OUTCOME_TONE[r.outcome] ?? "neutral"}>{r.outcome}</Pill> : null },
              ]}
              mobile={(r) => ({ lead: <Avatar name={r.name} size={36} />, title: r.name, sub: `${r.section} · ${pctTxt(r.percent)}${r.grade ? ` · ${r.grade}` : ""}`, pills: r.outcome ? <Pill tone={OUTCOME_TONE[r.outcome] ?? "neutral"}>{r.outcome}</Pill> : undefined })} />
          </Card>
        )}

        <div className="grid gap-5 lg:gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader title={subjectName ? `${subjectName} by section` : "Subject averages"} description="Below 65% shows in amber" icon={ChartColumn} />
            <div className="px-5 pb-3">{subjectBars.length ? <HBars rows={subjectBars} lowBelow={65} labelWidth={110} /> : <p className="text-[13px] text-ink3">No marked subjects.</p>}</div>
            {data.subjects.length > 1 && (
              <div className="flex flex-wrap gap-1.5 px-5 pb-5">
                <Link href={link({ subject: "" })} className={cx("rounded-lg px-2.5 py-1 text-[12.5px] font-semibold", !subjectId ? "bg-ink text-surface" : "bg-sunken text-ink2 hover:text-ink")}>All</Link>
                {[...data.subjects].sort((p, q) => p.subject.localeCompare(q.subject)).map((x) => (
                  <Link key={x.subjectId} href={link({ subject: x.subjectId })} className={cx("rounded-lg px-2.5 py-1 text-[12.5px] font-semibold", subjectId === x.subjectId ? "bg-ink text-surface" : "bg-sunken text-ink2 hover:text-ink")}>{x.subject}</Link>
                ))}
              </div>
            )}
          </Card>
          <Card>
            <CardHeader title="Sections compared" description="Average percentage" icon={ChartNoAxesColumn} />
            <div className="px-5 pb-2"><Bars data={a.classRows.map((r) => ({ k: r.section.replace(/^Class /, ""), v: Math.round(r.average ?? 0), tone: sectionId === r.sectionId ? "brand" : "info" }))} max={100} ticks={[0, 50, 100]} ariaLabel="Average percentage by section" /></div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 px-5 pb-5 text-[12.5px] text-ink3">
              {a.classRows.map((r) => <li key={r.sectionId}><Link href={link({ drill: "section", value: r.sectionId })} className="hover:text-ink hover:underline">{r.section}: pass {pctTxt(r.passPercent)}</Link></li>)}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Grade distribution" description="Students per grade. Open a grade to see who." icon={Award} />
            <div className="px-5 pb-2"><Bars data={o.grades.map((g) => ({ k: g.grade, v: g.count, tone: /^(E|D2|8|9|F)$/.test(g.grade) ? "bad" : /^(D|D1|7)$/.test(g.grade) ? "warn" : "brand" }))} ariaLabel="Students per grade" /></div>
            <ul className="flex flex-wrap gap-1.5 px-5 pb-5">
              {o.grades.map((g) => <li key={g.grade}><Link href={link({ drill: "grade", value: g.grade })} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-[12.5px] font-semibold hover:bg-sunken">{g.grade}<span className="tnum text-ink3">{g.count}</span></Link></li>)}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Toppers" description="Highest percentage" icon={Trophy} action={<Link href={link({ drill: "top" })} className="text-[13px] font-semibold text-brand hover:underline">Top 10</Link>} />
            <ul className="px-2 pb-2">
              {o.top.map((r, i) => (
                <li key={r.studentId}>
                  <Link href={link({ student: r.studentId })} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-sunken/70">
                    <span className={cx("grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-bold tnum", i === 0 ? "bg-warn/15 text-warn" : "bg-sunken text-ink3")}>{i + 1}</span>
                    <Avatar name={r.name} size={34} />
                    <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-[14.5px]">{r.name}</span><span className="block text-[12.5px] text-ink3">{r.section}</span></span>
                    <span className="font-semibold tnum">{pctTxt(r.percent)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Split side={380}>
          <Card>
            <CardHeader title="Students who dropped" icon={TrendingDown} description={data.before ? `Down 8 points or more since ${data.before.title}` : final ? "Choose one exam to compare with the one before" : "There is no earlier exam to compare with"}
              action={data.drops.length > 0 ? <Pill tone="warn">{data.drops.length}</Pill> : undefined} />
            {data.drops.length ? (
              <ul className="px-2 pb-2">
                {data.drops.map((d) => (
                  <li key={d.studentId}>
                    <Link href={link({ student: d.studentId })} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-sunken/70">
                      <Avatar name={d.name} size={34} />
                      <span className="min-w-0 flex-1"><span className="block truncate font-semibold text-[14.5px]">{d.name}</span><span className="block text-[12.5px] text-ink3">{d.section}</span></span>
                      <span className="text-right tnum text-[13px]"><span className="text-ink3">{pctTxt(Math.round(d.from))} →</span> <b className="font-semibold text-bad">{pctTxt(Math.round(d.to))}</b></span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center gap-2 px-5 pb-8 pt-4 text-center">
                <span className="grid size-12 place-items-center rounded-2xl bg-ok/10 text-ok"><TrendingUp size={22} aria-hidden="true" /></span>
                <p className="font-semibold">Nobody dropped sharply</p>
                <p className="text-[13px] text-ink3">No student fell 8 points or more in this view.</p>
              </div>
            )}
          </Card>
          <Card>
            <CardHeader title="Student progress" description={data.who ? `${data.who.fullName} across exams` : "One student across exams"} icon={ChartLine}
              action={data.roster.length > 0 ? <Suspense><UrlSelect name="student" label="Student" className="w-44" value={data.who?.id ?? ""} options={data.roster.map((r) => ({ value: r.studentId, label: r.student.fullName }))} /></Suspense> : undefined} />
            <div className="px-5 pb-5">
              {progress.length === 0 ? <p className="text-[13px] text-ink3">Choose a student to see their results across exams.</p> : (
                <>
                  {(() => {
                    const last = progress.at(-1)!;
                    const prev = progress.at(-2);
                    return (
                      <div className="mb-3 flex items-baseline gap-2">
                        <p className="font-display text-[26px] font-semibold tnum">{pctTxt(last.percent)}</p>
                        {prev && last.percent !== null && prev.percent !== null && <p className={cx("text-[13px] font-semibold", last.percent >= prev.percent ? "text-ok" : "text-bad")}>{last.percent >= prev.percent ? "▲" : "▼"} from {pctTxt(prev.percent)} in {prev.exam}</p>}
                      </div>
                    );
                  })()}
                  <TrendLine points={progress.slice(-6).map((p) => ({ k: p.exam, v: p.percent }))} />
                  <ul className="mt-4 flex flex-col gap-2">
                    {progress.at(-1)!.subjects.filter((x) => !x.gradeOnly).map((x) => (
                      <li key={x.subjectId} className="grid grid-cols-[110px_1fr_56px] items-center gap-2 text-[13px]">
                        <span className="truncate font-medium">{x.name}</span>
                        <span className="relative h-2.5 overflow-hidden rounded-full bg-sunken" aria-hidden="true"><span className={cx("absolute inset-y-0 left-0 rounded-full", x.passed === false ? "bg-bad" : "bg-brand")} style={{ width: `${Math.max(0, Math.min(100, x.percent ?? 0))}%` }} /></span>
                        <span className="text-right font-semibold tnum">{x.absent ? (x.medical ? "ML" : "AB") : pctTxt(x.percent)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </Card>
        </Split>

        {data.status && data.status.teachers.length > 0 && (
          <Card className="overflow-hidden">
            <CardHeader title="Marks entry by teacher" description={`${exam!.title} · papers submitted or locked`} icon={ClipboardList} divided
              action={<Link href={withYear(`/examination-results/marks?exam=${exam!.id}`, page)} className="text-[13px] font-semibold text-brand hover:underline">Marks Entry</Link>} />
            <DataList rows={data.status.teachers} rowKey={(t) => t.teacher} minWidth={520} caption="Marks entry by teacher"
              columns={[
                { key: "t", label: "Teacher", render: (t) => <span className="font-semibold">{t.teacher}</span> },
                { key: "d", label: "Submitted", align: "right", render: (t) => `${t.submitted} of ${t.total}` },
                { key: "p", label: "Pending", align: "right", render: (t) => t.pending ? <span className="font-semibold text-warn">{t.pending}</span> : <span className="text-ok">None</span> },
              ]}
              mobile={(t) => ({ title: t.teacher, sub: `${t.submitted} of ${t.total} submitted`, right: t.pending ? <Pill tone="warn">{t.pending} pending</Pill> : <Pill tone="ok">Done</Pill> })} />
          </Card>
        )}
      </div>
    </>
  );
}
