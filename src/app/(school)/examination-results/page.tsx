import { redirect } from "next/navigation";
import { requirePage } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { pageYear } from "@/lib/academic/page-campus";
import { examScope } from "@/lib/exams/scope";

/** The module opens on the page each person uses most: teachers on Marks Entry, everyone else on the Datesheet. */
export default async function ExamHome() {
  const current = await requirePage("examination-results");
  // The person's own campus's year (in a school with two campuses, each has its own).
  const scope = await withSchool(current.ctx, async (tx) => examScope(tx, current, (await pageYear(tx, current.ctx, current)).year?.id ?? null));
  redirect(!scope.manage && !scope.office && scope.teaches && scope.teaches.length > 0 ? "/examination-results/marks" : "/examination-results/datesheet");
}
