import Link from "next/link";
import { Award, BookOpenCheck, Calculator, FileText, Lightbulb, ListChecks, NotebookPen, Users } from "lucide-react";
import { withSchool } from "@/lib/db";
import { rangeWords } from "@/lib/periods";
import { certificateCandidates, classProgress, struggles } from "@/lib/homework/progress";
import { shortSection } from "@/lib/homework/scope";
import { mayWork } from "@/lib/homework/scope";
import { plural } from "@/lib/homework/words";
import { Card, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { ExportButton } from "@/components/ui/export-button";
import { PeriodFilter } from "@/components/list/period-filter";
import { Col, DataList, Empty, Progress, Split, Stack, Stats, Toolbar } from "@/components/money/kit";
import { UrlSearch, UrlSelect } from "@/components/money/url-filters";
import { HomeworkHead } from "../_components/homework-head";
import { BASE, homeworkGuard, homeworkPeriod, one, qs, UUID, type SearchParams } from "../_lib/page";
import { IssueSheet } from "./sheets";

export const metadata = { title: "Learning Progress" };

const HREF = `${BASE}/learning-progress`;

/** Learning Progress (17 §2): homework done, scores, quizzes and lessons for each student of a class, over any dates. */
export default async function LearningProgressPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await homeworkGuard("learning-progress");
  const sp = await searchParams;
  const s = p.scope;
  const per = homeworkPeriod(sp, p.dates, "thismonth");
  const q = one(sp.q).trim().toLowerCase().slice(0, 80);
  const doing = one(sp.do);
  const certCourse = UUID.test(one(sp.course)) ? one(sp.course) : "";
  const profiles = (p.current.permissions["student-management"]?.see ?? "none") !== "none";

  const data = await withSchool(p.current.ctx, async (tx) => {
    const sectionIds = s.level === "full" ? null : [...new Set([...s.pairs.map((x) => x.sectionId), ...s.ctSections])];
    const sections = s.yearId ? await tx.section.findMany({
      where: { academicYearId: s.yearId, archivedAt: null, ...(sectionIds ? { id: { in: sectionIds } } : {}) },
      include: { schoolClass: { select: { name: true, sortOrder: true } } }, orderBy: [{ schoolClass: { sortOrder: "asc" } }, { name: "asc" }],
    }) : [];
    const sectionId = sections.find((x) => x.id === one(sp.section))?.id ?? (s.pairs[0] && sections.find((x) => x.id === s.pairs[0].sectionId)?.id) ?? sections[0]?.id ?? null;
    if (!sectionId) return { sections, sectionId: null };
    const allSubjects = s.level === "full" || s.ctSections.includes(sectionId);
    const alloc = await tx.teacherAllocation.findMany({ where: { sectionId, academicYearId: s.yearId!, archivedAt: null }, select: { subjectId: true } });
    const subjectIds = allSubjects ? [...new Set(alloc.map((a) => a.subjectId))] : s.pairs.filter((x) => x.sectionId === sectionId).map((x) => x.subjectId);
    const subjects = await tx.subject.findMany({ where: { id: { in: subjectIds } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
    const wanted = one(sp.subject);
    const subjectId = subjects.some((x) => x.id === wanted) ? wanted : !allSubjects && subjects.length === 1 ? subjects[0].id : null;
    const [progress, low] = await Promise.all([
      classProgress(tx, s, sectionId, subjectId, per.from, per.to, p.today),
      struggles(tx, s, sectionId, subjectId, per.from, per.to),
    ]);
    const courses = await tx.course.findMany({ where: { sectionId, archivedAt: null, subjectId: subjectId ? subjectId : { in: subjects.map((x) => x.id) } } });
    const certs = [];
    for (const c of courses) {
      const cand = await certificateCandidates(tx, s, c.id);
      if (cand && cand.lessons) certs.push({ ...cand, subject: subjects.find((x) => x.id === c.subjectId)?.name ?? "", canIssue: p.edits("learning-progress") && mayWork(s, c, "learning-progress") });
    }
    return { sections, sectionId, subjects, subjectId, allSubjects, progress, low, certs };
  });

  const head = <HomeworkHead page="learning-progress" pageName="Learning Progress" sub={p.own ? "Homework, quizzes and lessons for your classes" : "Homework done, quiz scores and lessons for each student"}
    viewActions={data.sectionId ? <ExportButton href={qs(`${HREF}/export`, { ...per.keep, section: data.sectionId, subject: data.subjectId ?? null, q: q || null })} label="Export homework report" /> : undefined} />;
  if (!data.sectionId || !data.progress) {
    return <div>{head}<Card><Empty icon={Users} title="No classes to show" body={p.own ? "Progress shows for your own classes. Ask the school office to add your teaching allocations for this year." : "Add sections and students for this academic year first."} /></Card></div>;
  }

  const pr = data.progress;
  const t = pr.totals;
  const rows = pr.rows.filter((r) => !q || r.name.toLowerCase().includes(q) || String(r.rollNo ?? "") === q);
  const range = per.range ? rangeWords(per.range.from, per.range.to) : "";
  const keep = { ...per.keep, section: data.sectionId, subject: data.subjectId ?? null, q: q || null };
  const here = (extra: Record<string, string | null> = {}) => qs(HREF, { ...keep, ...extra });
  const issuing = data.certs?.find((c) => c.course.id === certCourse && c.canIssue);
  const subjectOpts = [
    ...(data.allSubjects ? [{ value: "", label: s.level === "own" ? "All subjects (class teacher)" : "All subjects" }] : data.subjects!.length > 1 ? [{ value: "", label: "All your subjects" }] : []),
    ...data.subjects!.map((x) => ({ value: x.id, label: x.name })),
  ];

  return (
    <div>
      {head}
      <Stack>
        <Card>
          <Toolbar>
            <UrlSelect param="section" id="lp-cls" label="Class" className="md:w-40" options={data.sections.map((x) => ({ value: x.id, label: `Class ${shortSection(x.schoolClass.name, x.name)}` }))} />
            {subjectOpts.length > 1 && <UrlSelect param="subject" id="lp-sub" label="Subject" className="md:w-60" options={subjectOpts} />}
            <PeriodFilter {...p.dates} fallback="thismonth" className="w-full md:w-auto" />
          </Toolbar>
        </Card>
        <Stats items={[
          { label: "Homework done", value: `${t.donePct}%`, sub: `${t.donePerStudent} of ${t.givenPerStudent} per student`, icon: NotebookPen },
          { label: "Homework score", value: t.scorePct !== null ? `${t.scorePct}%` : "—", sub: "Average of checked work", icon: Calculator },
          { label: "Quizzes", value: t.quizPct !== null ? `${t.quizPct}%` : "—", sub: `${t.quizzesPerStudent} taken per student`, icon: ListChecks },
          { label: "Lessons done", value: `${t.lessonsPerStudent} of ${t.lessons}`, sub: "Study Material", icon: BookOpenCheck },
        ]} />
        <Split side={380}>
          <Card className="overflow-hidden">
            <CardHeader title={`Students · Class ${pr.section.label}`} description={profiles ? "Tap a student to open their profile" : `${per.label}${range ? ` · ${range}` : ""}`} icon={Users} />
            <div className="px-3 pb-3"><UrlSearch id="lp-search" placeholder="Student name or roll" label="Search students" /></div>
            <DataList rows={rows} rowKey={(r) => r.id} rowHref={profiles ? (r) => `/student-management/students/${r.id}?tab=homework` : undefined} minWidth={580} caption={`Learning progress, Class ${pr.section.label}`}
              footer={`Showing ${rows.length} of ${pr.rows.length} · ${per.label}${range ? ` · ${range}` : ""}`}
              empty={<Empty icon={Users} title="No student matches" body="Try another name or roll number." />}
              columns={[
                { key: "n", label: "Student", render: (r) => <span className="whitespace-nowrap"><span className="text-ink3 tnum inline-block w-6">{r.rollNo ?? ""}</span><span className="font-semibold">{r.name}</span></span> },
                { key: "h", label: "Homework done", render: (r) => <div className="w-28"><Progress value={r.given ? (r.done / r.given) * 100 : 0} tone={r.given && r.done / r.given < 0.75 ? "warn" : "brand"} /><span className="text-[12.5px] text-ink3 tnum">{r.done} of {r.given}{r.missing ? ` · ${r.missing} missing` : ""}</span></div> },
                { key: "s", label: "Avg score", align: "right", render: (r) => <span className="tnum">{r.scorePct !== null ? `${r.scorePct}%` : "—"}</span> },
                { key: "q", label: "Quizzes", align: "right", render: (r) => <span className="tnum">{r.quizzes}{r.quizPct !== null ? ` · ${r.quizPct}%` : ""}</span> },
                { key: "l", label: "Lessons", align: "right", render: (r) => <span className="tnum">{r.lessonsDone} of {t.lessons}</span> },
              ]}
              phone={(r) => ({ avatar: r.name, title: `${r.rollNo ?? ""}. ${r.name}`, sub: `Homework ${r.done} of ${r.given}${r.quizPct !== null ? ` · quizzes ${r.quizPct}%` : ""}`, right: <span className={cx("font-semibold tnum text-[14px]", r.given > 0 && r.done / r.given < 0.75 && "text-warn")}>{r.scorePct !== null ? `${r.scorePct}%` : "—"}</span> })} />
          </Card>
          <Col>
            <Card>
              <CardHeader title="Where students struggle" description={`Lowest correct answers in quizzes${range ? ` · ${range}` : ""}`} icon={Lightbulb} />
              {data.low!.length ? (
                <ul className="px-5 pb-5 flex flex-col gap-2" aria-label="Quiz questions with the fewest right answers">
                  {data.low!.map((x) => (
                    <li key={x.key}>
                      <Link href={x.href} className="block group">
                        <span className="flex justify-between gap-2 text-[13px]"><span className="min-w-0"><span className="block truncate group-hover:underline">{x.label}</span><span className="block truncate text-[12px] text-ink3">{x.quiz}</span></span><b className="font-semibold tnum">{x.pct}%</b></span>
                        <span className="block h-2 rounded-full bg-sunken mt-1 overflow-hidden"><span className={cx("block h-full rounded-full", x.pct < 60 ? "bg-warn" : "bg-brand")} style={{ width: `${Math.max(2, x.pct)}%` }} /></span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <p className="px-5 pb-5 text-[13.5px] text-ink3">Shows once at least three students have taken a quiz in these dates.</p>}
            </Card>
            <Card>
              <CardHeader title="Course certificates" description="For finishing a learning path" icon={Award} />
              <div className="px-5 pb-5 flex flex-col gap-3">
                {data.certs!.length === 0 && <p className="text-[13.5px] text-ink3">No course in this class has visible lessons yet.</p>}
                {data.certs!.map((c) => (
                  <div key={c.course.id} className="rounded-2xl border border-line p-3.5">
                    <p className="font-semibold text-[14.5px]">{c.subject} · Class {pr.section.label}</p>
                    <p className="text-[12.5px] text-ink3">{plural(c.lessons, "lesson")} · {c.finished.length} finished every lesson · {c.issued.length} issued</p>
                    {c.issued.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {c.issued.slice(0, 6).map((x) => <li key={x.id}><a href={`${HREF}/certificate/${x.id}`} target="_blank" rel="noopener noreferrer" className="h-7 px-2.5 rounded-lg bg-sunken text-[12px] inline-flex items-center gap-1 hover:text-brand"><FileText size={12} aria-hidden="true" />{x.number}</a></li>)}
                        {c.issued.length > 6 && <li className="text-[12px] text-ink3 self-center">and {c.issued.length - 6} more</li>}
                      </ul>
                    )}
                    {c.canIssue && c.ready.length > 0 && <ButtonLink href={here({ do: "issue", course: c.course.id })} scroll={false} size="sm" variant="soft" icon={Award} className="mt-2">Issue {plural(c.ready.length, "certificate")}</ButtonLink>}
                  </div>
                ))}
                <p className="text-[12.5px] text-ink3">Design from Settings, Document Designs, Course certificate.</p>
              </div>
            </Card>
          </Col>
        </Split>
      </Stack>
      {doing === "issue" && issuing && <IssueSheet closeHref={here({ do: null, course: null })} courseId={issuing.course.id} course={`${issuing.subject}, Class ${pr.section.label}`} names={issuing.ready.map((x) => x.name)} />}
    </div>
  );
}
