import type { Metadata } from "next";
import { PLACES } from "@/lib/imports/places";
import { ImportHome } from "@/components/import/import-home";
import { academicPage, one, type SearchParams } from "../_lib/page";
import { PageTop } from "../_components/page-top";

export const metadata: Metadata = { title: "Import from Excel · Academic Management" };

const ABOUT: Record<string, string> = {
  "academic-allocations": "One row per class and section, subject and teacher (staff ID or name), with Primary or Secondary and Yes when the teacher is the class teacher. Each row is an assignment as made on Teacher Allocation, from the year's start while you are moving in. A subject that has another teacher, or a section with another class teacher, waits for you to choose Hand over. Undo takes the assignments back.",
  "academic-timetable": "One row per class and section, day and period, with the subject and the teacher (empty: the teacher assigned to the subject). The rows fill this year's draft Time Table, never the published one: check the draft on the Time Table page and publish it from a date. A teacher or room in two places at once, or a period outside the school's period plan, is shown on its row. Undo puts the draft back.",
  "academic-syllabus": "One row per chapter, or per topic of a chapter, for a class and subject, with an optional unit, its order and the month or week it is planned for (July, Week 5, Week 2 of July). Syllabus progress and chapters running late count the plan from the first day. Undo archives what came in.",
};

/** Academic Management's own Import page (gap list G44): Teacher Allocation, the Time Table and the syllabus, on the one import engine. */
export default async function AcademicImportPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  // Teachers (Own) have their own Time Table and syllabus only; the Office Staff template keeps the Time Table.
  const page = await academicPage(raw, { notForOwn: "no-access", arrangerOk: true });
  return (
    <>
      <PageTop page={page} title="Import from Excel" href={PLACES.academic.base} showYear={false} />
      <ImportHome current={page.current} place={PLACES.academic} initial={one(raw.kind) || undefined} about={ABOUT} />
    </>
  );
}
