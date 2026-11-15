import type { Metadata } from "next";
import { PLACES } from "@/lib/imports/places";
import { ImportHome } from "@/components/import/import-home";
import { academicPage, one, type SearchParams } from "../_lib/page";
import { PageTop } from "../_components/page-top";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Import from Excel · Academic Management") };
}

const ABOUT: Record<string, string> = {
  "academic-allocations": "One row per section, subject and teacher (staff ID or name), with Primary or Secondary, and Yes for the class teacher. A subject that already has a teacher waits for you to choose Hand over. Undo takes the assignments back.",
  "academic-timetable": "One row per section, day and period, with the subject and the teacher (empty: the subject's teacher). The rows fill the draft Time Table, never the published one. Clashes show on their row. Undo puts the draft back.",
  "academic-syllabus": "One row per chapter or topic, for a class and subject, with an optional unit, order and planned month or week (July, Week 5). Undo archives what came in.",
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
