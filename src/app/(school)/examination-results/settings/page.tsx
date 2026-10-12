import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Award, ListChecks, Palette, Scale, SlidersHorizontal, Sigma, ToggleRight } from "lucide-react";
import { withSchool } from "@/lib/db";
import { reachFor, type PermissionMap } from "@/lib/permissions";
import { PRESETS } from "@/lib/exams/grades";
import { examSettings, gradeScales } from "@/lib/exams/settings";
import { Card, CardHeader } from "@/components/ui/card";
import { examPage, type SearchParams } from "../_lib/page";
import { PageTop } from "../_components/page-top";
import { EXAM_FEATURES, FEATURE_WORDS } from "./features";
import { AreasList, FeatureSwitch, NameList, RulesForm, ScaleEditor, WeightsEditor } from "./settings-ui";

export const metadata: Metadata = { title: "Exam Settings" };
const PATH = "/examination-results/settings";

export default async function ExamSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const page = await examPage(raw);
  if (!page.scope.manage) redirect("/no-access");
  const canEdit = page.writable || (!page.year && page.scope.manage);
  const ctx = page.current.ctx;

  const data = await withSchool(ctx, async (tx) => {
    const settings = await examSettings(tx, ctx);
    const [scales, types, categories, areas, roles, features] = await Promise.all([
      gradeScales(tx, ctx),
      tx.examType.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
      tx.markCategory.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
      tx.coScholasticArea.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, kind: true, grades: true, description: true } }),
      tx.role.findMany({ where: { archivedAt: null, isEnabled: true, key: { not: null } }, orderBy: { name: "asc" }, select: { key: true, name: true, permissions: true } }),
      tx.schoolFeature.findMany({ where: { featureKey: { in: [...EXAM_FEATURES] } }, select: { featureKey: true, isOn: true } }),
    ]);
    return { settings, scales, types, categories, areas, roles, features };
  });

  const s = data.settings;
  const publishers = data.roles
    .filter((r) => reachFor(r.permissions as unknown as PermissionMap, "examination-results", "edit") === "all" || s.publishRoles.includes(r.key!))
    .map((r) => ({ key: r.key!, name: r.name }))
    .filter((r, i, all) => all.findIndex((x) => x.key === r.key) === i);
  const weights = Object.fromEntries(s.finalWeights.map((w) => [w.examTypeId, w.weight]));
  const on = (k: string) => data.features.some((f) => f.featureKey === k && f.isOn);
  const schoolScale = data.scales.find((x) => x.id === s.defaultScaleId);

  return (
    <>
      <PageTop page={page} href={PATH} sub="Exam types, mark categories, grade scale, pass rules and the final result" />
      <div className="flex max-w-5xl flex-col gap-5 lg:gap-6">
        <Card>
          <CardHeader title="Exam types" description="Offered when adding a datesheet" icon={ListChecks} />
          <NameList kind="examType" items={data.types} canEdit={canEdit} what="exam type" example="For example FA 1, Olympiad practice or Slip test" />
        </Card>

        <Card>
          <CardHeader title="Grade scale" icon={Scale}
            description={`${schoolScale ? `${schoolScale.name} is the school's scale. ` : ""}Changing it never changes results already published.`} />
          <ScaleEditor canEdit={canEdit} pass={s.passPercentSubject} schoolScaleId={s.defaultScaleId}
            scales={data.scales.map((x) => ({ id: x.id, name: x.name, preset: x.preset, version: x.version, bands: x.bands }))}
            presets={PRESETS.map((p) => ({ key: p.key, name: p.name, bands: p.bands }))} />
        </Card>

        <div className="grid gap-5 lg:gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader title="Mark categories" description="Parts a subject's marks can be split into on a datesheet, such as Theory 80 and Internal 20" icon={SlidersHorizontal} />
            <NameList kind="markCategory" items={data.categories} canEdit={canEdit} what="mark category" example="For example Oral or Lab record" />
          </Card>
          <Card>
            <CardHeader title="Final result weights" description="How exams add up to the year's result" icon={Sigma} />
            <WeightsEditor types={data.types} weights={weights} canEdit={canEdit} />
          </Card>
        </div>

        <Card>
          <CardHeader title="Rules" description="Pass marks, ranks, who publishes and when marks are due" icon={Award} />
          <RulesForm canEdit={canEdit} scales={data.scales.map((x) => ({ id: x.id, name: x.name }))} roles={publishers}
            v={{ ranksOn: s.ranksOn, tieRule: s.tieRule, passPercentSubject: s.passPercentSubject, passPercentOverall: s.passPercentOverall, graceMarks: s.graceMarks, compartmentSubjects: s.compartmentSubjects, absentRule: s.absentRule, gradeOnlyGrades: s.gradeOnlyGrades, publishRoles: s.publishRoles, marksDueDays: s.marksDueDays, reminderDaysBefore: s.reminderDaysBefore, gpaOn: s.gpaOn, defaultScaleId: s.defaultScaleId }} />
        </Card>

        <Card>
          <CardHeader title="Co-scholastic areas" description="Graded on report cards, such as Work education and Discipline" icon={Palette} />
          <AreasList areas={data.areas} canEdit={canEdit} on={on("exam-co-scholastic")} />
        </Card>

        <Card>
          <CardHeader title="Switched on for this school" description="Parts of Examination & Results the school can use or leave off" icon={ToggleRight} divided />
          {EXAM_FEATURES.map((k) => <FeatureSwitch key={k} k={k} title={FEATURE_WORDS[k].title} sub={FEATURE_WORDS[k].sub} on={on(k)} canEdit={canEdit} />)}
        </Card>
      </div>
    </>
  );
}
