// Homework & Learning's tab on the Student Profile (03 §2, order 60): the
// student's homework this year with its status and score, quizzes taken and
// lessons done. A teacher sees only the homework of their own classes and
// subjects (a class teacher, every subject of their section).
// Registered through src/lib/students/profile-tab-modules.ts.
import "server-only";

import Link from "next/link";
import { withSchool } from "../db";
import { todayIn } from "../academic/common";
import { studentYear } from "../academic/years";
import { registerProfileTab, type ProfileTabArgs, type SummaryItem } from "../students/profile-tabs";
import { homeworkLevel } from "./access";
import { studentHomework } from "./progress";
import { homeworkScope, mayRead } from "./scope";
import { dayDate, isPastDue, pct, SUB_TONE, submissionWord, type SubmissionWord } from "./words";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";

const SHOWN = 30;
const BASE = "/homework-learning";

type TabData = {
  rows: { id: string; homeworkId: string; title: string; subject: string; due: Date; word: SubmissionWord; score: string | null }[];
  total: number;
  /** Homework past its due date or already handed in (not yet due and excused work left out). */
  counted: number; done: number; missing: number; toCheck: number; scorePct: number | null;
  quizzes: { taken: number; pct: number | null };
  lessons: number;
};

async function load({ current, studentId, academicYearId }: ProfileTabArgs): Promise<TabData | null> {
  const today = todayIn(current.school.timeZone);
  return withSchool(current.ctx, async (tx) => {
    const s = await homeworkScope(tx, current, today);
    // The year shown on the profile, else the student's own campus's current year. Another campus's homework is never read.
    const yearId = academicYearId ?? (await studentYear(tx, current.ctx, studentId))?.id ?? null;
    const all = (await studentHomework(tx, studentId, yearId, 400)).filter((x) => mayRead(s, x.homework));
    if (!all.length) return null;
    const scored = all.filter((x) => x.score !== null && x.homework.maxMarks > 0);
    const subjects = new Set(all.map((x) => `${x.homework.sectionId}:${x.homework.subjectId}`));
    const readable = (r: { sectionId: string; subjectId: string; teacherId?: string | null }) => mayRead(s, r) && subjects.has(`${r.sectionId}:${r.subjectId}`);
    const [attempts, progress] = await Promise.all([
      tx.quizAttempt.findMany({ where: { studentId, submittedAt: { not: null }, quiz: { archivedAt: null, ...(yearId ? { academicYearId: yearId } : {}) } }, select: { score: true, maxScore: true, quiz: { select: { sectionId: true, subjectId: true, teacherId: true } } } }),
      tx.lessonView.findMany({ where: { studentId, doneAt: { not: null }, lesson: { archivedAt: null } }, select: { lesson: { select: { course: { select: { sectionId: true, subjectId: true, teacherId: true } } } } } }),
    ]);
    const quiz = attempts.filter((a) => readable(a.quiz));
    const quizMax = quiz.reduce((n, a) => n + (a.maxScore), 0);
    const handedIn = (w: SubmissionWord) => w === "Submitted" || w === "Late" || w === "Graded";
    const rows = all.map((x) => {
      const word = submissionWord(x.status, isPastDue(x.homework.dueDate, today));
      return { id: x.id, homeworkId: x.homework.id, title: x.homework.title, subject: x.subject, due: x.homework.dueDate, word, score: x.score !== null ? `${x.score} / ${x.homework.maxMarks}${x.grade ? ` · ${x.grade}` : ""}` : null };
    });
    return {
      rows: rows.slice(0, SHOWN), total: rows.length, counted: rows.filter((r) => r.word !== "Assigned" && r.word !== "Excused").length,
      done: rows.filter((r) => handedIn(r.word)).length,
      missing: rows.filter((r) => r.word === "Missing").length,
      toCheck: rows.filter((r) => r.word === "Submitted" || r.word === "Late").length,
      scorePct: scored.length ? Math.round(scored.reduce((n, x) => n + (x.score! / x.homework.maxMarks) * 100, 0) / scored.length) : null,
      quizzes: { taken: quiz.length, pct: quizMax ? pct(quiz.reduce((n, a) => n + (a.score ?? 0), 0), quizMax) : null },
      lessons: progress.filter((p) => readable(p.lesson.course)).length,
    };
  });
}

registerProfileTab({
  key: "homework",
  label: "Homework",
  module: "homework-learning",
  order: 60,
  // Students do not open other students' profiles; staff with Homework reach do.
  allowed: (c) => homeworkLevel(c.permissions, c.roles ?? []) !== "student",
  load: async (args) => <HomeworkTab data={await load(args)} />,
  summary: async (args): Promise<SummaryItem[]> => {
    const d = await load(args);
    if (!d || !d.total) return [];
    if (!d.counted) return [];
    const share = pct(d.done, d.counted);
    return [{ label: "Homework done", value: `${share}%`, sub: d.missing ? `${d.missing} missing` : `${d.done} of ${d.counted}`, tone: d.missing ? (share < 75 ? "danger" : "warning") : "success" }];
  },
});

function HomeworkTab({ data }: { data: TabData | null }) {
  if (!data) return <p className="rounded-2xl border border-line bg-surface p-5 text-ink-2">No homework given to this student this year, in the classes and subjects you can see.</p>;
  const stats = [
    { label: "Homework done", value: `${data.done} of ${data.counted}`, sub: data.missing ? `${data.missing} missing` : "None missing" },
    { label: "Average score", value: data.scorePct !== null ? `${data.scorePct}%` : "—", sub: data.toCheck ? `${data.toCheck} waiting to be checked` : "Checked work" },
    { label: "Quizzes", value: String(data.quizzes.taken), sub: data.quizzes.pct !== null ? `Average ${data.quizzes.pct}%` : "None taken" },
    { label: "Lessons done", value: String(data.lessons), sub: "Study Material" },
  ];
  return (
    <div className="space-y-5">
      <ul className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((x) => (
          <li key={x.label} className="rounded-2xl border border-line bg-surface p-4">
            <p className="text-[12.5px] text-ink3">{x.label}</p>
            <p className="text-[20px] font-semibold tnum mt-0.5">{x.value}</p>
            <p className="text-[12.5px] text-ink3">{x.sub}</p>
          </li>
        ))}
      </ul>
      <Card>
        <CardHeader title="Homework this year" description={data.total > data.rows.length ? `The latest ${data.rows.length} of ${data.total}` : "Newest first"} />
        <ul className="divide-y divide-line/70 border-t border-line/70">
          {data.rows.map((r) => (
            <li key={r.id}>
              <Link href={`${BASE}/homework/${r.homeworkId}`} className="flex items-center gap-3 px-5 py-3 min-h-12 hover:bg-sunken/60">
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-[14px] truncate">{r.title}</span>
                  <span className="block text-[12.5px] text-ink3">{r.subject} · due {dayDate(r.due)}</span>
                </span>
                {r.score && <span className="text-[13px] tnum text-ink2 whitespace-nowrap">{r.score}</span>}
                <Pill tone={SUB_TONE[r.word]}>{r.word}</Pill>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
