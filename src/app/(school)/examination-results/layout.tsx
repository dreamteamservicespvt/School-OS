import { Suspense } from "react";
import { requirePage } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { currentYear } from "@/lib/academic/years";
import { examScope } from "@/lib/exams/scope";
import { ExamTabs, type ExamTab } from "./_components/exam-tabs";

const BASE = "/examination-results";

export default async function ExamLayout({ children }: { children: React.ReactNode }) {
  const current = await requirePage("examination-results");
  const scope = await withSchool(current.ctx, async (tx) => {
    const year = await currentYear(tx, current.ctx, null);
    return examScope(tx, current, year?.id ?? null);
  });
  const teaches = scope.teaches === null || scope.teaches.length > 0;
  const tabs: ExamTab[] = [
    { href: `${BASE}/datesheet`, label: "Datesheet" },
    ...(scope.datesheets || scope.manage ? [{ href: `${BASE}/admit-cards`, label: "Admit Cards" }] : []),
    ...(teaches && !scope.office ? [{ href: `${BASE}/marks-entry`, label: "Marks Entry" }] : []),
    ...(scope.results ? [{ href: `${BASE}/results`, label: "Results" }] : []),
    ...(scope.manage || scope.classTeacherOf.length ? [{ href: `${BASE}/report-cards`, label: "Report Cards" }] : []),
    ...(current.features.has("exam-question-papers") && (scope.manage || teaches) && !scope.office ? [{ href: `${BASE}/question-papers`, label: "Question Papers" }] : []),
    ...(scope.results ? [{ href: `${BASE}/analysis`, label: "Exam Analysis" }] : []),
    ...(scope.manage ? [{ href: `${BASE}/settings`, label: "Exam Settings" }] : []),
  ];
  return (
    <>
      <Suspense fallback={<div className="mb-5 h-11 border-b border-line" />}>
        <ExamTabs tabs={tabs} />
      </Suspense>
      {children}
    </>
  );
}
