// Examination & Results on the guardian's Parent Link (08 §3, D4): the
// published datesheet of the chosen child, and report cards once results
// are published, never before. Imported by src/lib/parent-link/section-list.ts.
import "server-only";

import { registerSection, type GuardianView } from "../parent-link/sections";
import { todayIn } from "../academic/common";
import { parentDatesheets, parentReportCards, type ParentDatesheet, type ParentReportCard } from "./parent-link";

registerSection<ParentDatesheet[]>({
  key: "exam-datesheet",
  label: "Exam datesheet",
  description: "Published datesheets: each paper's date, time and maximum marks",
  order: 30,
  load: async (tx, ctx, view) => {
    const rows = await parentDatesheets(tx, ctx, [view.child.id], todayIn(view.timeZone));
    return rows.length ? rows : null;
  },
  Render: DatesheetSection,
});

registerSection<ParentReportCard[]>({
  key: "report-cards",
  label: "Report cards",
  description: "Report cards to download once results are published",
  order: 35,
  load: async (tx, ctx, view) => {
    const rows = await parentReportCards(tx, ctx, [view.child.id]);
    return rows.length ? rows : null;
  },
  Render: ReportCardsSection,
});

function DatesheetSection({ data, view }: { data: ParentDatesheet[]; view: GuardianView }) {
  return (
    <section aria-labelledby="pl-exams" className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <h2 id="pl-exams" className="text-lg font-semibold">Exams for {view.child.firstName}</h2>
      {data.map((x) => (
        <div key={x.examId} className="mt-3">
          <p className="font-medium">{x.title} <span className="font-normal text-ink-2">· {x.from} to {x.to}</span></p>
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
            {x.papers.map((p) => (
              <li key={`${p.date}-${p.subject}`} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2">
                <span className="font-medium">{p.subject}</span>
                <span className="text-sm text-ink-2">{p.day} {p.date}, {p.time}{p.maxMarks !== "Graded" ? ` · out of ${p.maxMarks}` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function ReportCardsSection({ data, view }: { data: ParentReportCard[]; view: GuardianView }) {
  const href = (r: ParentReportCard) => `/p/${view.token}/report-card?child=${view.child.id}&year=${r.yearId}&period=${encodeURIComponent(r.period)}`;
  return (
    <section aria-labelledby="pl-report-cards" className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <h2 id="pl-report-cards" className="text-lg font-semibold">Report cards</h2>
      <ul className="mt-2 divide-y divide-line">
        {data.map((r) => (
          <li key={`${r.yearId}-${r.period}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span><span className="font-medium">{r.label}</span> <span className="text-sm text-ink-2">{r.year}{r.publishedOn ? ` · published ${r.publishedOn}` : ""}</span></span>
            {view.preview || !view.token
              ? <span className="text-sm text-ink-2">Download (shown to the parent)</span>
              : <a href={href(r)} className="inline-flex min-h-11 items-center rounded-lg border border-line-strong px-3 font-medium text-brand-text hover:bg-surface-2">Download PDF</a>}
          </li>
        ))}
      </ul>
    </section>
  );
}
