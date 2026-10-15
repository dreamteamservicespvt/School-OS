import Link from "next/link";
import { CirclePlay, ListChecks, Medal, PartyPopper, Pencil, Plus } from "lucide-react";
import { withSchool } from "@/lib/db";
import { todayIn } from "@/lib/academic/common";
import { rangeWords } from "@/lib/periods";
import { bankQuestions, listQuizzes, quizResults, type QuizRow } from "@/lib/homework/quizzes";
import { mayWork, workSections, workSubjects } from "@/lib/homework/scope";
import { momentWords, plural, QUIZ_TONE, shortDay } from "@/lib/homework/words";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Chips } from "@/components/ui/chips";
import { cx } from "@/components/ui/cx";
import { UrlSheet } from "@/components/ui/url-sheet";
import { ExportButton } from "@/components/ui/export-button";
import { PeriodFilter } from "@/components/list/period-filter";
import { DataList, Empty, Stack, Toolbar } from "@/components/money/kit";
import { UrlSearch } from "@/components/money/url-filters";
import { HomeworkHead } from "../_components/homework-head";
import { SubIcon, subjectIcon, subjectTone } from "../_components/bits";
import { BASE, homeworkGuard, homeworkPeriod, localInput, one, qs, UUID, type HomeworkPage, type SearchParams } from "../_lib/page";
import { ArchiveQuizSheet, CloseQuizButton, MarkShortSheet, OpenQuizButton, QuizSheet, type BankQuestion, type QDraft, type QuizSection } from "./sheets";

export const metadata = { title: "Quizzes" };

const HREF = `${BASE}/quizzes`;
const DAY = 86_400_000;
const WORDS = ["Open", "Scheduled", "Draft", "Closed"] as const;
type Sp = Record<string, string | string[] | undefined>;

const limitWords = (m: number | null) => (m ? `${m} min` : "No limit");

/** Quizzes (17 §2): quizzes that mark themselves for practice and class tests; a student's open and done quizzes. */
export default async function QuizzesPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await homeworkGuard("quizzes");
  const sp = await searchParams;
  if (p.student) return <StudentQuizzes p={p} sp={sp} />;
  return <StaffQuizzes p={p} sp={sp} />;
}

function closesWords(z: QuizRow, tz: string) {
  if (z.word === "Draft") return "Not open yet";
  if (z.word === "Scheduled") return z.opensAt ? `Opens ${momentWords(z.opensAt, tz)}` : "";
  if (z.word === "Closed") return z.closesAt ? `Closed ${shortDay(todayIn(tz, z.closesAt))}` : "Closed";
  return z.closesAt ? `Closes ${momentWords(z.closesAt, tz)}` : "Open";
}

async function StaffQuizzes({ p, sp }: { p: HomeworkPage; sp: Sp }) {
  const s = p.scope;
  const per = homeworkPeriod(sp, p.dates, "last30");
  const f = (WORDS as readonly string[]).includes(one(sp.f)) ? one(sp.f) : "all";
  const q = one(sp.q).trim().slice(0, 80);
  const openId = UUID.test(one(sp.open)) ? one(sp.open) : "";
  const markId = UUID.test(one(sp.mark)) ? one(sp.mark) : "";
  const doing = one(sp.do);
  const editId = UUID.test(one(sp.id)) ? one(sp.id) : "";
  const editsHere = p.edits("quizzes");
  const keep = { ...per.keep, f: f === "all" ? null : f, q: q || null };
  const here = (extra: Record<string, string | null> = {}) => qs(HREF, { ...keep, ...extra });

  const data = await withSchool(p.current.ctx, async (tx) => {
    const list = await listQuizzes(tx, s, p.now, { from: per.from, to: per.to, q });
    const results = openId ? await quizResults(tx, s, openId) : null;
    const sections: QuizSection[] = [];
    const bank: Record<string, BankQuestion[]> = {};
    let start: Parameters<typeof QuizSheet>[0]["start"];
    if (editsHere && (doing === "create" || doing === "edit")) {
      for (const sec of await workSections(tx, s, "quizzes")) {
        const subjects = await workSubjects(tx, s, sec.id, sec.classId, p.today);
        if (!subjects.length) continue;
        sections.push({ id: sec.id, label: sec.label, classId: sec.classId, subjects });
        for (const x of subjects) bank[`${sec.classId}|${x.id}`] = await bankQuestions(tx, sec.classId, x.id);
      }
      if (doing === "edit" && editId) {
        const z = await tx.quiz.findFirst({ where: { id: editId, archivedAt: null }, include: { questions: { where: { archivedAt: null }, orderBy: { sortOrder: "asc" } } } });
        const row = list.find((r) => r.id === editId);
        if (z && mayWork(s, z, "quizzes")) {
          const taken = await tx.quizAttempt.count({ where: { quizId: z.id } });
          start = {
            id: z.id, title: z.title, label: row?.sectionLabel ?? "", kept: taken > 0, showAnswers: z.showAnswers,
            questions: z.questions.map((x): QDraft => ({ kind: x.kind, text: x.text, options: x.options, correctIndex: x.correctIndex, marks: x.marks })),
            opensAt: z.opensAt ? localInput(z.opensAt, p.tz) : "", closesAt: z.closesAt ? localInput(z.closesAt, p.tz) : "",
            timeLimit: z.timeLimitMin ? String(z.timeLimitMin) : "none", attempts: String(z.attemptsAllowed),
          };
        }
      }
    }
    return { list, results, sections, bank, start };
  });

  const counts = Object.fromEntries(WORDS.map((w) => [w, data.list.filter((z) => z.word === w).length]));
  const rows = data.list.filter((z) => f === "all" || z.word === f);
  const range = per.range ? rangeWords(per.range.from, per.range.to) : "";
  const r = data.results;
  const row = r ? data.list.find((z) => z.id === r.quiz.id) ?? null : null;
  const canWorkOpen = !!r && editsHere && mayWork(s, r.quiz, "quizzes");
  const word = row?.word;
  const maxScore = r ? r.quiz.questions.reduce((a, x) => a + x.marks, 0) : 0;
  const shorts = r ? r.quiz.questions.filter((x) => x.kind === "SHORT") : [];
  const marking = r && markId ? r.attempts.find((a) => a.id === markId) : undefined;

  return (
    <div>
      <HomeworkHead page="quizzes" pageName="Quizzes" sub={p.own ? "Quizzes for your classes · they mark themselves" : "Quizzes that mark themselves, for practice and class tests"}
        actions={<ButtonLink href={here({ do: "create" })} scroll={false} variant="primary" icon={Plus}>Create quiz</ButtonLink>} />
      <Card className="overflow-hidden">
        <Toolbar>
          <UrlSearch id="qz-search" placeholder="Search quizzes" label="Search quizzes" />
          <PeriodFilter {...p.dates} fallback="last30" className="w-full md:w-auto" />
          <ExportButton href={qs(`${HREF}/export`, keep)} />
        </Toolbar>
        <div className="px-3 pt-3">
          <Chips value={f} label="Quiz status" options={[
            { value: "all", label: "All", count: data.list.length, href: here({ f: null }) },
            ...WORDS.filter((w) => w !== "Scheduled" || counts[w]).map((w) => ({ value: w, label: w, count: counts[w], href: here({ f: w }) })),
          ]} />
        </div>
        <div className="mt-2 border-t border-line">
          <DataList rows={rows} rowKey={(z) => z.id} rowHref={(z) => here({ open: z.id })} minWidth={860} caption="Quizzes"
            footer={`Showing: ${per.label}${range ? ` · ${range}` : ""} · ${plural(rows.length, "quiz", "quizzes")}`}
            empty={<Empty icon={ListChecks} title="No quizzes in these dates" body="Pick other dates or another filter." action={editsHere ? <ButtonLink href={here({ do: "create" })} scroll={false} variant="primary" icon={Plus}>Create quiz</ButtonLink> : undefined} />}
            columns={[
              { key: "t", label: "Quiz", render: (z) => <div className="flex items-center gap-3"><SubIcon subject={z.subject} size={34} /><div><p className="font-semibold leading-tight">{z.title}</p><p className="text-[12.5px] text-ink3">{z.subject} · {z.sectionLabel}{!p.own && z.teacher ? ` · ${z.teacher}` : ""}</p></div></div> },
              { key: "q", label: "Questions", align: "right", render: (z) => <span className="tnum">{z.questions}</span> },
              { key: "l", label: "Time limit", nowrap: true, render: (z) => limitWords(z.timeLimitMin) },
              { key: "a", label: "Attempts", align: "right", render: (z) => <span className="tnum">{z.attemptsAllowed}</span> },
              { key: "k", label: "Taken", render: (z) => <span className="tnum">{z.taken} of {z.students}{z.toMark ? <span className="block text-[12px] text-warn">{z.toMark} to mark</span> : null}</span> },
              { key: "v", label: "Average", align: "right", render: (z) => <span className="tnum">{z.avg !== null ? `${z.avg} / ${z.maxScore}` : "—"}</span> },
              { key: "s", label: "Status", render: (z) => <><Pill tone={QUIZ_TONE[z.word]}>{z.word}</Pill><span className="block text-[12px] text-ink3 mt-0.5 whitespace-nowrap">{closesWords(z, p.tz)}</span></> },
            ]}
            phone={(z) => ({ icon: subjectIcon(z.subject), iconTone: subjectTone(z.subject), title: z.title, sub: `${z.sectionLabel} · ${plural(z.questions, "question")} · ${z.taken} taken`, pills: <Pill tone={QUIZ_TONE[z.word]} className="!h-[22px] !text-[11.5px]">{z.word}</Pill> })} />
        </div>
      </Card>

      {r && row && !marking && (
        <UrlSheet wide closeHref={here({ open: null })} title={r.quiz.title}
          sub={`${row.subject} · ${row.sectionLabel} · ${plural(row.questions, "question")} · ${limitWords(row.timeLimitMin)} · ${closesWords(row, p.tz)}`}
          footer={<div className="flex flex-wrap justify-end gap-2">
            {canWorkOpen && <ButtonLink href={here({ open: null, do: "archive", id: r.quiz.id })} scroll={false} variant="ghost">Archive</ButtonLink>}
            {canWorkOpen && word === "Draft" && <ButtonLink href={here({ open: null, do: "edit", id: r.quiz.id })} scroll={false} icon={Pencil}>Edit</ButtonLink>}
            {canWorkOpen && word === "Draft" && <OpenQuizButton id={r.quiz.id} label={row.sectionLabel} />}
            {canWorkOpen && (word === "Open" || word === "Scheduled") && <CloseQuizButton id={r.quiz.id} />}
          </div>}>
          {r.best.size === 0 ? (
            <Empty icon={ListChecks} title="Nobody has taken it yet" body={word === "Draft" ? "This quiz is a draft. Open it to let students start." : "Scores show here as students hand in."} />
          ) : (
            <div className="grid md:grid-cols-2 gap-5">
              <div>
                <p className="text-[13px] font-semibold text-ink2 mb-2">Correct answers per question</p>
                <ul className="flex flex-col gap-1.5" aria-label="Correct answers per question">
                  {r.perQuestion.map((x) => (
                    <li key={x.id} className="flex items-center gap-2 text-[13px]" title={x.text}>
                      <span className="w-9 text-ink3 tnum shrink-0">Q{x.no}</span>
                      <span className="flex-1 h-5 rounded-md bg-sunken overflow-hidden"><span className={cx("block h-full rounded-md", x.pct < 50 ? "bg-warn" : "bg-brand")} style={{ width: `${Math.max(2, x.pct)}%` }} /></span>
                      <span className="w-10 text-right font-semibold tnum">{x.pct}%</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[12.5px] text-ink3 mt-2">Questions below 50% show in amber. Worth going over in class.</p>
              </div>
              <div>
                <p className="text-[13px] font-semibold text-ink2 mb-2">{plural(r.best.size, "student")} · average {row.avg ?? "—"} of {maxScore}</p>
                <ul className="max-h-[320px] overflow-y-auto scroll-thin divide-y divide-line/70">
                  {r.students.filter((st) => r.best.has(st.id)).map((st) => {
                    const a = r.best.get(st.id)!;
                    return (
                      <li key={st.id} className="flex items-center gap-3 py-2">
                        <Avatar name={st.name} size={30} /><span className="flex-1 text-[14px] truncate">{st.name}</span>
                        {a.needsMarking && canWorkOpen && shorts.length > 0 && <ButtonLink href={here({ mark: a.id })} scroll={false} size="sm" variant="soft">Mark</ButtonLink>}
                        <b className="font-semibold tnum text-[14px]">{a.score ?? "—"} / {maxScore}</b>
                      </li>
                    );
                  })}
                </ul>
                {r.students.length > r.best.size && <p className="text-[12.5px] text-ink3 mt-2">{r.students.length - r.best.size} have not taken it.</p>}
              </div>
            </div>
          )}
        </UrlSheet>
      )}
      {r && marking && canWorkOpen && (
        <MarkShortSheet closeHref={here({ mark: null })} attemptId={marking.id} name={r.students.find((st) => st.id === marking.studentId)?.name ?? ""}
          items={shorts.map((x) => ({ id: x.id, no: r.quiz.questions.indexOf(x) + 1, text: x.text, answer: String((marking.answers as Record<string, unknown>)[x.id] ?? ""), marks: x.marks, given: (marking.manualMarks as Record<string, number>)[x.id] ?? null }))} />
      )}
      {editsHere && doing === "create" && (data.sections.length
        ? <QuizSheet closeHref={here({ do: null })} sections={data.sections} bank={data.bank} defaults={{ opensAt: localInput(p.now, p.tz), closesAt: localInput(new Date(p.now.getTime() + 7 * DAY), p.tz) }} />
        : <UrlSheet closeHref={here({ do: null })} title="No classes to set a quiz for"><p className="text-[14px] text-ink2">Quizzes go to your own classes and subjects. Ask the school office to add your teaching allocations for this year.</p></UrlSheet>)}
      {editsHere && doing === "edit" && data.start && <QuizSheet edit closeHref={here({ do: null, id: null })} sections={data.sections} bank={data.bank} start={data.start} defaults={{ opensAt: "", closesAt: "" }} />}
      {editsHere && doing === "archive" && editId && (() => { const z = data.list.find((x) => x.id === editId); return z && mayWork(s, z, "quizzes") ? <ArchiveQuizSheet closeHref={here({ do: null, id: null })} id={z.id} title={z.title} /> : null; })()}
    </div>
  );
}

async function StudentQuizzes({ p, sp }: { p: HomeworkPage; sp: Sp }) {
  const s = p.scope;
  const per = homeworkPeriod(sp, p.dates, "last30");
  const data = await withSchool(p.current.ctx, async (tx) => {
    const list = await listQuizzes(tx, s, p.now);
    const attempts = s.student ? await tx.quizAttempt.findMany({ where: { studentId: s.student.id, quizId: { in: list.map((z) => z.id) } }, orderBy: { attemptNo: "asc" } }) : [];
    return { list, attempts };
  });
  const mine = (id: string) => data.attempts.filter((a) => a.quizId === id);
  const open = data.list.filter((z) => z.word === "Open" && (mine(z.id).some((a) => !a.submittedAt) || mine(z.id).filter((a) => a.submittedAt).length < z.attemptsAllowed));
  const done = data.list.flatMap((z) => {
    const subs = mine(z.id).filter((a) => a.submittedAt);
    if (!subs.length) return [];
    const best = subs.reduce((b, a) => ((a.score ?? -1) > (b.score ?? -1) ? a : b));
    const last = subs[subs.length - 1].submittedAt!;
    return [{ z, best, last }];
  }).filter((d) => !per.from || !per.to || (d.last >= per.from && d.last.getTime() < per.to.getTime() + DAY)).sort((a, b) => b.last.getTime() - a.last.getTime());
  const range = per.range ? rangeWords(per.range.from, per.range.to) : "";
  const label = (s.student?.label ?? "").replace(/^Class\s+/i, "");
  const today = (d: Date | null) => !!d && todayIn(p.tz, d).getTime() === p.today.getTime();

  return (
    <div>
      <HomeworkHead page="quizzes" pageName="Quizzes" sub={`Class ${label} · quizzes from your teachers. They mark themselves.`} />
      <Stack>
        <Card>
          <CardHeader title="Open now" description={open.length ? "Finish before they close" : "Nothing open right now"} icon={ListChecks} />
          {open.length ? (
            <ul className="px-2 pb-2">
              {open.map((z) => {
                const running = mine(z.id).some((a) => !a.submittedAt);
                return (
                  <li key={z.id} className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-sunken/60">
                    <SubIcon subject={z.subject} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[14.5px]">{z.title}</p>
                      <p className="text-[12.5px] text-ink3">{z.subject} · {plural(z.questions, "question")} · {limitWords(z.timeLimitMin)} · {plural(z.attemptsAllowed, "attempt")}</p>
                      {z.closesAt && <p className={cx("text-[12.5px] font-semibold", today(z.closesAt) ? "text-warn" : "text-ink3")}>Closes {momentWords(z.closesAt, p.tz)}</p>}
                    </div>
                    <ButtonLink href={`${HREF}/${z.id}`} size="sm" variant="primary" icon={CirclePlay}>{running ? "Carry on" : "Start"}</ButtonLink>
                  </li>
                );
              })}
            </ul>
          ) : <Empty icon={PartyPopper} title="All quizzes done" body="New quizzes show here when a teacher opens one." />}
        </Card>
        <Card>
          <CardHeader title="Done" description={`Your scores · ${per.label}${range ? ` · ${range}` : ""}`} icon={Medal} />
          <div className="px-3 pb-2"><PeriodFilter {...p.dates} fallback="last30" className="w-full md:w-auto" /></div>
          {!done.length && <Empty icon={ListChecks} title="No quizzes done in these dates" body="Pick other dates to see earlier scores." />}
          <ul className="px-2 pb-2">
            {done.map(({ z, best, last }) => (
              <li key={z.id}>
                <Link href={`${HREF}/${z.id}`} className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-sunken/60">
                  <SubIcon subject={z.subject} />
                  <div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px]">{z.title}</p><p className="text-[12.5px] text-ink3">{z.subject} · {shortDay(todayIn(p.tz, last))}{best.needsMarking ? " · written answers being marked" : ""}</p></div>
                  <span className="font-display font-semibold text-[18px] tnum">{best.score ?? "—"}<span className="text-ink3 text-[13px] font-sans"> / {best.maxScore}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </Stack>
    </div>
  );
}
