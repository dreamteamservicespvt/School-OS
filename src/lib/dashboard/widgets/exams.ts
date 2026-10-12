// Examination & Results on the Dashboard: exams coming up, marks waiting to
// be entered, the latest exam's averages and students who need help. Reach
// follows Examination & Results (src/lib/exams/scope.ts): full roles see the
// whole school; a teacher sees only the sections and subjects given to them,
// and a class teacher also their own class.
import "server-only";

import { examScope, type ExamScope } from "../../exams/scope";
import { papersFor } from "../../exams/marks";
import { classRange } from "../../exams/common";
import { addDays, dayWord, n, plural, someNames } from "../common";
import type { AgendaItem, AttentionItem, BarRow, DashContext, Widget } from "../types";

const BASE = "/examination-results";

type View = { scope: ExamScope; yearId: string; sectionIds: string[]; classIds: string[]; sections: { id: string; label: string; classId: string; className: string; sort: number }[] };

/** The person's exam reach this year: their scope and the sections and classes in it. */
function examView(c: DashContext): Promise<View | null> {
  return c.memo("exam-view", async () => {
    if (!c.year) return null;
    const scope = await examScope(c.tx, c.viewer, c.year.id);
    const rows = await c.tx.section.findMany({
      where: { academicYearId: c.year.id, archivedAt: null, ...(scope.sectionIds ? { id: { in: scope.sectionIds } } : {}) },
      include: { schoolClass: { select: { name: true, sortOrder: true } } },
    });
    const sections = rows.map((s) => ({ id: s.id, label: `${s.schoolClass.name} ${s.name}`, classId: s.classId, className: s.schoolClass.name, sort: s.schoolClass.sortOrder }))
      .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label));
    return { scope, yearId: c.year.id, sections, sectionIds: sections.map((s) => s.id), classIds: [...new Set(sections.map((s) => s.classId))] };
  });
}

/** The latest exam with worked-out results in the person's sections. */
async function latestResults(c: DashContext, v: View) {
  return c.memo("exam-latest", async () => {
    if (!v.sectionIds.length) return null;
    const withResults = await c.tx.result.groupBy({ by: ["examId"], where: { academicYearId: v.yearId, examId: { not: null }, sectionId: { in: v.sectionIds }, complete: true }, _count: true });
    if (!withResults.length) return null;
    const exam = await c.tx.exam.findFirst({ where: { id: { in: withResults.map((r) => r.examId!) }, archivedAt: null }, orderBy: { startDate: "desc" }, select: { id: true, title: true } });
    if (!exam) return null;
    const results = await c.tx.result.findMany({ where: { key: `exam:${exam.id}`, sectionId: { in: v.sectionIds }, complete: true }, select: { studentId: true, sectionId: true, classId: true, percent: true, outcome: true } });
    return { exam, results };
  });
}

const endWord = (d: Date, today: Date) => { const w = dayWord(d, today); return w === "Today" || w === "Tomorrow" ? w.toLowerCase() : w; };
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);

/** Exams starting or running in the next 7 days, in the person's classes; a teacher's invigilation duties. */
const upcoming: Widget<"agenda"> = {
  id: "exams.upcoming",
  module: "examination-results",
  kind: "agenda",
  homes: ["leader", "academic-head", "exam", "office", "teacher", "class-teacher"],
  async load(c) {
    const v = await examView(c);
    if (!v || !v.classIds.length) return [];
    const until = addDays(c.today, 7);
    const exams = await c.tx.exam.findMany({
      where: { academicYearId: v.yearId, archivedAt: null, status: { not: "DRAFT" }, startDate: { lte: until }, endDate: { gte: c.today }, classIds: { hasSome: v.classIds } },
      orderBy: { startDate: "asc" }, take: 3,
    });
    const classNames = new Map(v.sections.map((s) => [s.classId, s.className]));
    const out: AgendaItem[] = exams.map((e) => {
      const mine = e.classIds.filter((id) => classNames.has(id)).map((id) => classNames.get(id)!);
      const started = e.startDate <= c.today;
      return {
        id: `exam:${e.id}`, time: started ? "Now" : dayWord(e.startDate, c.today), tone: "bad",
        title: started ? `${e.title} is on` : `${e.title} starts`,
        where: `${[...new Set(mine)].length ? classRange([...new Set(mine)]) : "Your classes"}${started ? ` · ends ${endWord(e.endDate, c.today)}` : ""}`,
        href: `${BASE}/datesheet/${e.id}`, sort: started ? -1 : 1440 * Math.max(1, Math.round((e.startDate.getTime() - c.today.getTime()) / 86_400_000)) + 1,
      };
    });
    // Invigilation duties are the person's own, whoever they are.
    if (v.scope.staffId) {
      const duties = await c.tx.datesheetEntry.findMany({
        where: { invigilatorId: v.scope.staffId, archivedAt: null, date: { gte: c.today, lte: until }, exam: { archivedAt: null, status: { not: "DRAFT" }, academicYearId: v.yearId } },
        include: { exam: { select: { id: true, title: true } } }, orderBy: [{ date: "asc" }, { startTime: "asc" }], take: 3,
      });
      const [subjects, classes] = await Promise.all([
        c.tx.subject.findMany({ where: { id: { in: duties.map((d) => d.subjectId) } }, select: { id: true, name: true } }),
        c.tx.schoolClass.findMany({ where: { id: { in: duties.map((d) => d.classId) } }, select: { id: true, name: true } }),
      ]);
      for (const d of duties) {
        const days = Math.round((d.date.getTime() - c.today.getTime()) / 86_400_000);
        const [h, m] = d.startTime.split(":").map(Number);
        out.push({
          id: `invigilation:${d.id}`, time: dayWord(d.date, c.today), tone: "warn",
          title: `Invigilation: ${subjects.find((s) => s.id === d.subjectId)?.name ?? "Paper"}, ${classes.find((x) => x.id === d.classId)?.name ?? ""}`.trim(),
          where: [d.exam.title, d.room ? `Room ${d.room}` : null, `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`].filter(Boolean).join(" · "),
          href: `${BASE}/datesheet/${d.exam.id}`, sort: days * 1440 + h * 60 + m,
        });
      }
    }
    return out;
  },
};

/** Marks to enter: the person's own papers (teachers), or every paper (full reach), due within 3 days or late. */
const marksDue: Widget<"attention"> = {
  id: "exams.marks-due",
  module: "examination-results",
  kind: "attention",
  homes: ["leader", "exam", "academic-head", "teacher", "class-teacher"],
  async load(c) {
    const v = await examView(c);
    if (!v || (v.scope.office && !v.scope.manage)) return null;
    // A teacher with no sections given has no papers; papersFor already keeps to teachesPaper().
    const papers = (await papersFor(c.tx, c.viewer.ctx, v.scope, v.yearId, {}))
      .filter((p) => p.status !== "SUBMITTED" && p.status !== "LOCKED" && p.date <= c.today && (!p.due || p.due <= addDays(c.today, 3)));
    if (!papers.length) return null;
    const late = papers.filter((p) => p.due && p.due < c.today);
    const exams = [...new Set(papers.map((p) => p.examId))];
    const own = v.scope.teaches !== null;
    return {
      id: own ? "exams.my-marks-due" : "exams.marks-due", tone: late.length ? "bad" : "warn", icon: "ClipboardCheck",
      title: late.length
        ? `${plural(late.length, "paper")} ${own ? "of yours " : ""}past the marks due date`
        : `${plural(papers.length, "paper")} ${own ? "of yours " : ""}waiting for marks`,
      detail: someNames(papers.map((p) => `${p.subjectName} ${p.sectionLabel}`), 3) + (papers[0].due ? ` · due ${dayWord(papers[0].due, c.today).toLowerCase()}` : ""),
      action: own ? "Enter marks" : "See papers",
      href: `${BASE}/marks${exams.length === 1 ? `?exam=${exams[0]}` : ""}`, value: `${papers.length}:${late.length}`,
    };
  },
};

/** Average in the latest exam with results: by class (full reach) or by the person's own sections. */
const average: Widget<"panel"> = {
  id: "exams.average",
  module: "examination-results",
  kind: "panel",
  homes: ["leader", "academic-head", "exam", "teacher", "class-teacher"],
  async load(c) {
    const v = await examView(c);
    if (!v || !v.scope.results) return null;
    const latest = await latestResults(c, v);
    if (!latest) return null;
    const percent = (rs: typeof latest.results) => avg(rs.filter((r) => r.percent !== null).map((r) => r.percent!));
    const href = (scope: string) => `${BASE}/analysis?exam=${latest.exam.id}&scope=${scope}`;
    const rows: BarRow[] = v.scope.sectionIds === null
      ? [...new Map(v.sections.map((s) => [s.classId, s])).values()].map((s) => ({ key: s.classId, label: s.className, value: percent(latest.results.filter((r) => r.classId === s.classId)) ?? -1, href: href(`c:${s.classId}`) }))
      : v.sections.map((s) => ({ key: s.id, label: s.label, value: percent(latest.results.filter((r) => r.sectionId === s.id)) ?? -1, href: href(`s:${s.id}`) }));
    const shown = rows.filter((r) => r.value >= 0);
    if (!shown.length) return null;
    const all = percent(latest.results);
    return {
      slot: "side",
      panel: {
        kind: "bars", title: "Exam results", icon: "Award",
        sub: `${latest.exam.title} · average ${all ?? 0}% · ${plural(latest.results.length, "student")}`,
        rows: shown, lowBelow: 50, href: `${BASE}/analysis?exam=${latest.exam.id}`, linkLabel: "Analysis", empty: "",
      },
    };
  },
};

/** Students below 50% or not passing in the latest exam, in the person's sections. */
const weakStudents: Widget<"attention"> = {
  id: "exams.weak-students",
  module: "examination-results",
  kind: "attention",
  homes: ["leader", "academic-head", "exam", "teacher", "class-teacher"],
  async load(c) {
    const v = await examView(c);
    if (!v || !v.scope.results) return null;
    const latest = await latestResults(c, v);
    if (!latest) return null;
    const weak = latest.results.filter((r) => r.outcome !== "Pass" || (r.percent ?? 0) < 50);
    if (!weak.length) return null;
    const names = await c.tx.student.findMany({ where: { id: { in: weak.slice(0, 3).map((r) => r.studentId) } }, select: { fullName: true } });
    const sections = [...new Set(weak.map((r) => r.sectionId))];
    const where = sections.length === 1 ? ` in ${v.sections.find((s) => s.id === sections[0])?.label ?? "your class"}` : "";
    return {
      id: "exams.weak-students", tone: "bad", icon: "TrendingDown",
      title: `${plural(weak.length, "student")}${where} below 50% or not passing in ${latest.exam.title}`,
      detail: weak.length > 3 ? `${names.map((s) => s.fullName).join(", ")} and ${n(weak.length - 3)} more` : someNames(names.map((s) => s.fullName)),
      action: "See students",
      href: `${BASE}/analysis?exam=${latest.exam.id}${sections.length === 1 && v.scope.sectionIds !== null ? `&scope=s:${sections[0]}` : ""}&drill=help`,
      value: String(weak.length),
    } satisfies AttentionItem;
  },
};

export const EXAM_WIDGETS: Widget[] = [marksDue, weakStudents, upcoming, average] as Widget[];
