// The Exams tab of the Student Profile (03 §2): each year's exams with marks
// per subject, the final result and report cards. Imported by
// src/lib/students/profile-tab-modules.ts.
import "server-only";

import Link from "next/link";
import { withSchool } from "../db";
import { registerProfileTab } from "../students/profile-tabs";
import { formatDate } from "../format";
import { examScope } from "./scope";
import { showMarks, showPercent } from "./common";
import { studentExamsTab, type StudentExamsTab } from "./profile";

async function load(current: Parameters<typeof examScope>[1], studentId: string, yearId: string | null) {
  return withSchool(current.ctx, async (tx) => studentExamsTab(tx, current.ctx, await examScope(tx, current, yearId), studentId));
}

registerProfileTab({
  key: "exams",
  label: "Exams",
  module: "examination-results",
  order: 50,
  load: async ({ current, studentId, academicYearId }) => <ExamsTab data={await load(current, studentId, academicYearId)} studentId={studentId} />,
  summary: async ({ current, studentId, academicYearId }) => {
    const data = await load(current, studentId, academicYearId);
    const latest = data?.years[0]?.exams.filter((e) => e.complete).at(-1);
    if (!latest) return [];
    return [{ label: `${latest.title}${latest.status === "DRAFT" ? " (draft)" : ""}`, value: `${showPercent(latest.percent)}${latest.grade ? ` · ${latest.grade}` : ""}`, href: `/examination-results/analysis?view=student&student=${studentId}`, tone: latest.outcome === "Pass" ? "success" : latest.outcome ? "danger" : "neutral" }];
  },
});

function ExamsTab({ data, studentId }: { data: StudentExamsTab | null; studentId: string }) {
  if (!data || data.years.length === 0) {
    return <p className="rounded-2xl border border-line bg-surface p-5 text-ink-2">No exam results yet. Marks show here as teachers enter them.</p>;
  }
  return (
    <div className="space-y-5">
      <p className="text-sm"><Link className="font-medium text-brand-text hover:underline" href={`/examination-results/analysis?view=student&student=${studentId}`}>See progress across exams</Link></p>
      {data.years.map((y) => (
        <section key={y.yearId} className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <h3 className="text-lg font-semibold">{y.year} <span className="font-normal text-ink-2">· {y.section}</span></h3>
          {y.exams.length === 0 && <p className="mt-2 text-ink-2">No exam results in this year yet.</p>}
          {y.exams.map((e) => (
            <details key={e.examId} className="mt-3 rounded-xl border border-line">
              <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="font-medium">{e.title} <span className="text-sm font-normal text-ink-2">{formatDate(e.from)}</span></span>
                <span className="text-sm">
                  {e.complete ? `${showPercent(e.percent)}${e.grade ? ` · ${e.grade}` : ""}${e.rank ? ` · Rank ${e.rank}` : ""}${e.outcome ? ` · ${e.outcome}` : ""}` : "Marks still being entered"}
                  {e.status === "DRAFT" && <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-2">Draft</span>}
                </span>
              </summary>
              <table className="w-full border-t border-line text-left text-[15px]">
                <caption className="sr-only">{e.title} marks</caption>
                <thead className="text-sm text-ink-2"><tr><th className="px-3 py-2 font-medium">Subject</th><th className="px-3 py-2 font-medium">Marks</th><th className="px-3 py-2 font-medium">Grade</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {e.subjects.map((s) => (
                    <tr key={s.subjectId}>
                      <td className="px-3 py-2">{s.name}</td>
                      <td className="px-3 py-2">{s.absent ? "Absent" : s.gradeOnly ? "Graded" : s.marks === null ? "Not entered" : `${showMarks(s.marks)} / ${s.max}`}</td>
                      <td className={`px-3 py-2 ${s.passed === false ? "text-danger" : ""}`}>{s.grade ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          ))}
          {y.final && <p className="mt-3">Final result: <strong>{showPercent(y.final.percent)}{y.final.grade ? ` · ${y.final.grade}` : ""}{y.final.outcome ? ` · ${y.final.outcome}` : ""}</strong>{y.final.status === "DRAFT" && <span className="ml-2 text-sm text-ink-2">(draft)</span>}</p>}
          {y.reportCards.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-medium">Report cards</p>
              <ul className="mt-1 flex flex-wrap gap-2">
                {y.reportCards.map((r) => (
                  <li key={r.period}>
                    {r.ready
                      ? <a className="inline-flex min-h-11 items-center rounded-lg border border-line-strong px-3 text-sm font-medium text-brand-text hover:bg-surface-2" href={`/examination-results/report-cards/pdf?section=${y.sectionId}&period=${encodeURIComponent(r.period)}&student=${studentId}`}>{r.label} ({r.status})</a>
                      : <span className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 text-sm text-ink-2">{r.label}: {r.status}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
