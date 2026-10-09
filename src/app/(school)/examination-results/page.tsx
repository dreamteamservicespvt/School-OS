import { redirect } from "next/navigation";
import { requirePage } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { currentYear } from "@/lib/academic/years";
import { examScope } from "@/lib/exams/scope";

/** The module opens on the page each person uses most: teachers on Marks Entry, everyone else on the Datesheet. */
export default async function ExamHome() {
  const current = await requirePage("examination-results");
  const scope = await withSchool(current.ctx, async (tx) => examScope(tx, current, (await currentYear(tx, current.ctx, null))?.id ?? null));
  redirect(!scope.manage && !scope.office && scope.teaches && scope.teaches.length > 0 ? "/examination-results/marks-entry" : "/examination-results/datesheet");
}
