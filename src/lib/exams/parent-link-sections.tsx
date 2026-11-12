// Examination & Results on the guardian's Parent Link (08 §3, D4): the
// published datesheet of the chosen child, and report cards once results
// are published, never before. Imported by src/lib/parent-link/section-list.ts.
import "server-only";

import { registerSection, type GuardianView } from "../parent-link/sections";
import { todayIn } from "../academic/common";
import { parentDatesheets, parentReportCards, type ParentDatesheet, type ParentReportCard } from "./parent-link";
import { makeT } from "../i18n/server";

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

// The Parent Link page puts each section in its own card under the section's name (guardian-page.tsx),
// so these render only their content: a second card and heading showed "Report cards" twice (QA LC18).
function DatesheetSection({ data, view }: { data: ParentDatesheet[]; view: GuardianView }) {
  const t = makeT(view.lang);
  return (
    <div className="flex flex-col gap-3">
      {data.map((x) => (
        <div key={x.examId}>
          <p className="font-medium">{x.title} <span className="font-normal text-ink-2">· {t("{from} to {to}", { from: x.from, to: x.to })}</span></p>
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
            {x.papers.map((p) => (
              <li key={`${p.date}-${p.subject}`} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2">
                <span className="font-medium">{t.any(p.subject)}</span>
                <span className="text-sm text-ink-2">{t.any(p.day)} {p.date}, {p.time}{p.maxMarks !== "Graded" ? ` · ${t("out of {n}", { n: p.maxMarks })}` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ReportCardsSection({ data, view }: { data: ParentReportCard[]; view: GuardianView }) {
  const t = makeT(view.lang);
  const href = (r: ParentReportCard) => `/p/${view.token}/report-card?child=${view.child.id}&year=${r.yearId}&period=${encodeURIComponent(r.period)}`;
  return (
    <ul className="divide-y divide-line">
        {data.map((r) => (
          <li key={`${r.yearId}-${r.period}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span><span className="font-medium">{r.label}</span> <span className="text-sm text-ink-2">{r.year}{r.publishedOn ? ` · ${t("published {date}", { date: r.publishedOn })}` : ""}</span></span>
            {view.preview || !view.token
              ? <span className="text-sm text-ink-2">{t("Download (shown to the parent)")}</span>
              : <a href={href(r)} className="inline-flex min-h-11 items-center rounded-lg border border-line-strong px-3 font-medium text-brand-text hover:bg-surface-2">{t("Download PDF")}</a>}
          </li>
      ))}
    </ul>
  );
}
