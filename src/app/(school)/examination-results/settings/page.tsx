import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Award, Layers, ListChecks, MessageSquareText, Palette, Scale, SlidersHorizontal, Sigma, Target, ToggleRight } from "lucide-react";
import { withSchool } from "@/lib/db";
import { inCampus } from "@/lib/campus";
import { reachFor, type PermissionMap } from "@/lib/permissions";
import { PRESETS } from "@/lib/exams/grades";
import { PATTERNS } from "@/lib/exams/common";
import { BASES } from "@/lib/documents/designs-shared";
import { boardsInUse, examSettings, gradeScales, LATE_JOIN_RULES, LATE_MARKS, REPORT_FORMATS } from "@/lib/exams/settings";
import { Card, CardHeader } from "@/components/ui/card";
import { examPage, type SearchParams } from "../_lib/page";
import { PageTop } from "../_components/page-top";
import { EXAM_FEATURES, FEATURE_WORDS } from "./features";
import { AreasList, BoardsEditor, ClassPatternsEditor, CompetencyList, FeatureSwitch, NameList, RemarkPhrasesEditor, RulesForm, ScaleEditor, WeightsEditor } from "./settings-ui";
import { readPhrases } from "@/lib/exams/remark-phrases";
import { schoolRoles } from "@/lib/school-roles";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Exam Settings") };
}
const PATH = "/examination-results/settings";

export default async function ExamSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const page = await examPage(raw);
  if (!page.scope.manage) redirect("/no-access");
  const canEdit = page.writable || (!page.year && page.scope.manage);
  const ctx = page.current.ctx;

  const data = await withSchool(ctx, async (tx) => {
    const settings = await examSettings(tx, ctx);
    const [scales, types, categories, areas, roles, features, classes, boards, competencies, subjects] = await Promise.all([
      gradeScales(tx, ctx),
      tx.examType.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
      tx.markCategory.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
      tx.coScholasticArea.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, kind: true, grades: true, description: true } }),
      schoolRoles(tx, ctx, { where: { archivedAt: null, isEnabled: true, key: { not: null } }, orderBy: { name: "asc" }, select: { key: true, name: true, permissions: true } }),
      tx.schoolFeature.findMany({ where: { featureKey: { in: [...EXAM_FEATURES] } }, select: { featureKey: true, isOn: true } }),
      // One campus: the exam pattern of that campus's classes only.
      tx.schoolClass.findMany({ where: { archivedAt: null, ...inCampus(page.current) }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
      boardsInUse(tx, ctx),
      tx.competency.findMany({ where: { archivedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, subjectId: true, name: true, levels: true } }),
      tx.subject.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ]);
    return { settings, scales, types, categories, areas, roles, features, classes, boards, competencies, subjects };
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
      <PageTop page={page} href={PATH} sub="Exam types, mark categories, grade scale, pass rules, patterns, boards and the final result" />
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
            lateMarks={LATE_MARKS.map((o) => ({ ...o }))} lateJoin={LATE_JOIN_RULES.map((o) => ({ ...o }))}
            v={{ ranksOn: s.ranksOn, tieRule: s.tieRule, passPercentSubject: s.passPercentSubject, passPercentOverall: s.passPercentOverall, graceMarks: s.graceMarks, compartmentSubjects: s.compartmentSubjects, absentRule: s.absentRule, gradeOnlyGrades: s.gradeOnlyGrades, publishRoles: s.publishRoles, marksDueDays: s.marksDueDays, reminderDaysBefore: s.reminderDaysBefore, gpaOn: s.gpaOn, defaultScaleId: s.defaultScaleId, lateMarks: s.lateMarks, lateJoinRule: s.lateJoinRule }} />
        </Card>

        <div className="grid gap-5 lg:gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader title="Exam pattern per class" description="The pattern a new datesheet starts with: Percentage, Grading or CGPA. Each exam can still choose its own." icon={Layers} />
            <ClassPatternsEditor classes={data.classes} patterns={s.classPatterns} options={PATTERNS.map((p) => ({ value: p.value, label: p.label }))} canEdit={canEdit} />
          </Card>
          <Card>
            <CardHeader title="Per board" description="For schools running two boards: a grade scale and a report card format for each board. A class follows its own board, set in Academic Management." icon={Scale} />
            <BoardsEditor boards={data.boards} values={s.boards} on={on("exam-boards")} canEdit={canEdit} schoolScale={schoolScale?.name ?? "not set"}
              scales={data.scales.map((x) => ({ id: x.id, name: x.name }))}
              formats={BASES.filter((b) => (REPORT_FORMATS as readonly string[]).includes(b.key)).map((b) => ({ value: b.key, label: b.label }))} />
          </Card>
        </div>

        <Card>
          <CardHeader title="Co-scholastic areas" description="Graded on report cards, such as Work education and Discipline" icon={Palette} />
          <AreasList areas={data.areas} canEdit={canEdit} on={on("exam-co-scholastic")} />
        </Card>

        <Card>
          <CardHeader title="Competencies" description="Competency-based assessment: competencies per subject and their levels, graded on report cards" icon={Target} />
          <CompetencyList items={data.competencies} subjects={data.subjects} canEdit={canEdit} on={on("exam-competencies")} />
        </Card>

        <Card>
          <CardHeader title="Remark phrases" description="The sentences remark suggestions are made of. Each suggestion shows the marks, attendance or homework behind every sentence" icon={MessageSquareText} />
          <RemarkPhrasesEditor bank={readPhrases(s.remarkPhrases)} canEdit={canEdit} on={on("exam-remark-suggestions")} />
        </Card>

        <Card>
          <CardHeader title="Switched on for this school" description="Parts of Examination & Results the school can use or leave off" icon={ToggleRight} divided />
          {EXAM_FEATURES.map((k) => <FeatureSwitch key={k} k={k} title={FEATURE_WORDS[k].title} sub={FEATURE_WORDS[k].sub} on={on(k)} canEdit={canEdit} />)}
        </Card>
      </div>
    </>
  );
}
