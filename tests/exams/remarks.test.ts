// Report Cards, "Suggest remarks" (gap G30, browser finding TEACHING-10),
// through the server actions:
// - A student absent (AB) or on medical leave (ML) for the period's only paper,
//   or who joined after it, gets no suggestion: "No marks for this exam: write
//   your own remark." Never a negative remark with no data behind it.
// - A student with marks gets sentences built from their own marks and the
//   change since the exam before, each with its source.
// - A kept suggestion is logged "started from a suggestion, confirmed by <person>"
//   (no AI was used; "prepared by AI" is kept for remarks the AI reworded).
// - Only the section's class teacher (or the Exam In-charge or Principal) may
//   ask, and only with the teacher assistant on.
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Current } from "@/lib/current";

const who = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/current", async (orig) => {
  const real = await orig<typeof import("@/lib/current")>();
  const { requirePermission } = await import("@/lib/permissions");
  const requireCurrent = async () => who.current as Current;
  return {
    ...real,
    requireCurrent,
    requireAction: async (module: Parameters<typeof requirePermission>[1], action: Parameters<typeof requirePermission>[2]) => {
      const current = await requireCurrent();
      return { current, reach: requirePermission(current.permissions, module, action) };
    },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("@/lib/flash", () => ({ flash: async () => undefined }));

import { examScope, type ExamScope } from "@/lib/exams/scope";
import { createDatesheet, publishDatesheet } from "@/lib/exams/datesheet";
import { saveMarks } from "@/lib/exams/marks";
import { publishResults } from "@/lib/exams/results";
import { examSettings } from "@/lib/exams/settings";
import { examKey } from "@/lib/exams/common";
import { draftRemarksAction, saveRemarksAction } from "@/app/(school)/examination-results/report-cards/actions";
import { saveAssistant } from "@/lib/settings/switches";
import { academicSchool, d } from "../academic/fixture";
import { addStudent } from "../students/fixtures";

let s: Awaited<ReturnType<typeof academicSchool>>;
let principal: ExamScope;
let teacherNow: Current;
let termId = "";
const kids: string[] = [];
let late = "";
let ct = "";

const as = (c: Current) => { who.current = c; };
const mark = (studentId: string, n: number | null, o: { absent?: boolean; medical?: boolean } = {}) => ({ studentId, parts: (o.absent ? {} : { Marks: n }) as Record<string, number | null>, absent: Boolean(o.absent), medical: Boolean(o.medical), grade: null, remark: null });

async function exam(title: string, typeName: string, papers: [string, string][]) {
  const typeId = await s.run(async (tx) => (await tx.examType.findFirstOrThrow({ where: { name: typeName } })).id);
  const r = await s.run((tx) => createDatesheet(tx, s.ctx, s.year.id, {
    title, examTypeId: typeId, pattern: "PERCENTAGE", termId, startDate: d(papers[0][1]), endDate: d(papers[papers.length - 1][1]), classIds: [s.c5.id], gradeScaleId: null,
  }, papers.map(([code, date]) => ({ classId: s.c5.id, subjectId: s.subjects[code], date: d(date), startTime: "09:30", durationMin: 60, room: null, invigilatorId: null, maxMarks: 50, pattern: null }))));
  await s.run((tx) => publishDatesheet(tx, s.ctx, r.exam.id, { tellParents: false }));
  const entries = await s.run((tx) => tx.datesheetEntry.findMany({ where: { examId: r.exam.id } }));
  return { id: r.exam.id, entry: (code: string) => entries.find((e) => e.subjectId === s.subjects[code])!.id };
}

beforeAll(async () => {
  s = await academicSchool();
  for (let i = 0; i < 4; i++) kids.push((await addStudent(s.ctx, s.s5a.id, { applyFeePlan: false })).student.id);
  await s.run(async (tx) => {
    termId = (await tx.term.create({ data: { schoolId: s.school.id, academicYearId: s.year.id, name: "Term 1", startDate: d("2026-04-01"), endDate: d("2026-12-31"), sortOrder: 1 } })).id;
    await examSettings(tx, s.ctx);
    // The AI assistant on for the Principal and teachers (Settings, Modules On/Off), with the teacher assistant.
    await saveAssistant(tx, s.ctx, { on: true, roles: ["principal", "teacher"] });
    await tx.schoolFeature.create({ data: { schoolId: s.school.id, featureKey: "ai-teacher-assistant", isOn: true } });
  });
  principal = await s.run(async (tx) => examScope(tx, await s.currentFor(s.principal.id), s.year.id));
  const [a, b, c, dd] = kids;

  // Unit Test 2: everyone writes Mathematics and English; Ananya (b) tops the class.
  const ut = await exam("Unit Test 2", "Unit Test 1", [["MAT", "2026-09-07"], ["ENG", "2026-09-08"]]);
  await s.run((tx) => saveMarks(tx, s.ctx, principal, { entryId: ut.entry("MAT"), sectionId: s.s5a.id, rows: [mark(a, 30), mark(b, 48), mark(c, 35), mark(dd, 20)] }));
  await s.run((tx) => saveMarks(tx, s.ctx, principal, { entryId: ut.entry("ENG"), sectionId: s.s5a.id, rows: [mark(a, 35), mark(b, 47), mark(c, 30), mark(dd, 22)] }));
  await s.run((tx) => publishResults(tx, s.ctx, principal, { key: examKey(ut.id), sectionIds: [s.s5a.id], publishOn: new Date(), messageParents: false }));

  // Class Test October: one Mathematics paper. b absent, c on medical leave, dd far below the pass mark.
  const test = await exam("Class Test October", "Half Yearly", [["MAT", "2026-10-12"]]);
  ct = test.id;
  await s.run((tx) => saveMarks(tx, s.ctx, principal, { entryId: test.entry("MAT"), sectionId: s.s5a.id, rows: [mark(a, 45), mark(b, null, { absent: true }), mark(c, null, { absent: true, medical: true }), mark(dd, 8)] }));
  await s.run((tx) => publishResults(tx, s.ctx, principal, { key: examKey(ct), sectionIds: [s.s5a.id], publishOn: new Date(), messageParents: false }));
  // Tanvi joins after the test.
  late = (await addStudent(s.ctx, s.s5a.id, { applyFeePlan: false })).student.id;
  teacherNow = await s.currentFor(s.teacherUser.id);
}, 240_000);

describe("Suggest remarks", () => {
  it("gives no remark at all to a student with no marks: absent, medical leave or joined later", async () => {
    as(teacherNow);
    const r = await draftRemarksAction(s.s5a.id, `exam:${ct}`);
    expect(r.ok).toBe(true);
    for (const id of [kids[1], kids[2], late]) {
      const x = r.drafts.find((y) => y.studentId === id)!;
      expect(x.text).toBeNull();
      expect(x.lines).toEqual([]);
      expect(x.why).toBe("No marks for this exam: write your own remark.");
    }
  });

  it("builds the others from their own marks, each sentence with its source", async () => {
    as(teacherNow);
    const r = await draftRemarksAction(s.s5a.id, `exam:${ct}`);
    const a = r.drafts.find((y) => y.studentId === kids[0])!;
    expect(a.text).toMatch(/in Class Test October\./);
    expect(a.lines[0].source).toBe("Marks in Class Test October: 45 of 50 (90%)");
    const up = a.lines.find((l) => /improved/.test(l.text))!;
    expect(up.text).toBe("Has improved in Mathematics since Unit Test 2.");
    expect(up.source).toBe("Marks: Mathematics 60% in Unit Test 2, 90% in Class Test October");
    for (const l of a.lines) expect(l.source.length).toBeGreaterThan(0);
    expect(a.text).not.toMatch(/this term|this year/);

    const low = r.drafts.find((y) => y.studentId === kids[3])!;
    expect(low.lines[0].text).toMatch(/pass mark/);
    expect(low.lines[0].source).toMatch(/8 of 50 \(16%\), pass mark/);
  });

  it("a kept suggestion is logged as started from a suggestion, confirmed by the teacher (no AI used)", async () => {
    as(teacherNow);
    const r = await draftRemarksAction(s.s5a.id, `exam:${ct}`);
    const a = r.drafts.find((y) => y.studentId === kids[0])!;
    const saved = await saveRemarksAction(s.s5a.id, `exam:${ct}`, [
      { studentId: kids[0], classTeacherRemark: a.text, suggestion: "kept" },
      { studentId: kids[1], classTeacherRemark: "Ananya missed this test; she did very well in Unit Test 2." },
    ]);
    expect(saved).toMatchObject({ ok: true });
    const entry = await s.run((tx) => tx.auditLogEntry.findFirstOrThrow({ where: { action: "report-card-remarks" }, orderBy: { at: "desc" } }));
    expect(entry.userLoginId).toBe(s.teacherUser.id);
    expect(entry.actorNote).toBe("Started from a suggestion, confirmed by Test: 1 class teacher remark");
    const changes = (entry.after as { changes: { suggestion?: string }[] }).changes;
    expect(changes.filter((c) => c.suggestion)).toHaveLength(1);
    const card = await s.run((tx) => tx.reportCard.findFirstOrThrow({ where: { studentId: kids[0], period: `exam:${ct}` } }));
    expect(card.classTeacherRemark).toBe(a.text);
  });

  it("an edited suggestion says so; a remark typed by hand has no AI note", async () => {
    as(teacherNow);
    await saveRemarksAction(s.s5a.id, `exam:${ct}`, [{ studentId: kids[0], classTeacherRemark: "Aarav has done very well. Keep practising.", suggestion: "edited" }]);
    const edited = await s.run((tx) => tx.auditLogEntry.findFirstOrThrow({ where: { action: "report-card-remarks" }, orderBy: { at: "desc" } }));
    expect(edited.actorNote).toBe("Started from a suggestion, confirmed by Test: 1 class teacher remark (1 edited before saving)");
    await saveRemarksAction(s.s5a.id, `exam:${ct}`, [{ studentId: kids[3], classTeacherRemark: "Needs help with tables." }]);
    const typed = await s.run((tx) => tx.auditLogEntry.findFirstOrThrow({ where: { action: "report-card-remarks" }, orderBy: { at: "desc" } }));
    expect(typed.actorNote).toBeNull();
  });

  it("is refused for a section the teacher does not teach as class teacher", async () => {
    as(teacherNow);
    const r = await draftRemarksAction(s.s5b.id, `exam:${ct}`);
    expect(r.ok).toBe(false);
    expect(r.drafts).toEqual([]);
  });

  it("is refused when the teacher assistant is off", async () => {
    await s.run((tx) => tx.schoolFeature.updateMany({ where: { featureKey: "ai-teacher-assistant" }, data: { isOn: false } }));
    as(await s.currentFor(s.teacherUser.id));
    const r = await draftRemarksAction(s.s5a.id, `exam:${ct}`);
    expect(r).toMatchObject({ ok: false, message: "Remark suggestions are switched off for this school." });
  });
});

describe("Remark suggestions with AI off (gap G30)", () => {
  it("work from the rules alone once the school switches on Remark suggestions in Exam Settings", async () => {
    await s.run(async (tx) => {
      await tx.schoolFeature.updateMany({ where: { featureKey: "ai-assistant" }, data: { isOn: false } });
      await tx.schoolFeature.create({ data: { schoolId: s.school.id, featureKey: "exam-remark-suggestions", isOn: true } });
    });
    as(await s.currentFor(s.teacherUser.id));
    const r = await draftRemarksAction(s.s5a.id, `exam:${ct}`);
    expect(r.ok).toBe(true);
    const a = r.drafts.find((y) => y.studentId === kids[0])!;
    expect(a.options.length).toBeGreaterThanOrEqual(2);
    expect(a.options.every((o) => !o.byAi)).toBe(true);
    // Asked for one student only: only that student, and nothing saved.
    const before = await s.run((tx) => tx.auditLogEntry.count());
    const one = await draftRemarksAction(s.s5a.id, `exam:${ct}`, [kids[3]]);
    expect(one.drafts.map((d) => d.studentId)).toEqual([kids[3]]);
    expect(await s.run((tx) => tx.auditLogEntry.count())).toBe(before);
  });
});
