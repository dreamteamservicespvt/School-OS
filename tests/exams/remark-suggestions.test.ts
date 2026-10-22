// Report-card remark suggestions grounded in evidence (gap G30), end to end
// through the server actions, with the AI service always a test stand-in:
// - with AI off, the rule suggestions still work and nothing goes to the AI;
// - with AI on, the AI only rewords: it is sent the evidence, never the
//   student's name or anything private, and every reworded remark lists its
//   evidence; the call is logged;
// - nothing is saved until the teacher saves, and the saved remark records
//   whether it started from a suggestion (and which evidence it showed).
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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

import { useAiProvider, type AiProvider, type AiRequest } from "@/lib/ai";
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
let termId = "";
let period = "";
const kids: string[] = [];
const names: string[] = [];

const as = async (userId: string) => { who.current = await s.currentFor(userId); };
const mark = (studentId: string, n: number) => ({ studentId, parts: { Marks: n } as Record<string, number | null>, absent: false, medical: false, grade: null, remark: null });
const USAGE = { inputTokens: 900, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0 };

/** A stand-in AI service: keeps what it was sent, and rewords each student's first piece of evidence. */
function fake(reply?: (q: { students: { key: string; evidence: { ref: string }[] }[] }) => unknown) {
  const sent: AiRequest[] = [];
  const provider: AiProvider = {
    name: "fake",
    ask: async (req) => {
      sent.push(req);
      const q = JSON.parse(req.text) as { students: { key: string; evidence: { ref: string }[] }[] };
      const data = reply ? reply(q) : { students: q.students.map((x) => ({ key: x.key, remarks: [{ text: "{name} is making good progress; keep practising every day.", refs: [x.evidence[0].ref] }] })) };
      return { outcome: "ok", data, usage: USAGE, model: "claude-opus-5-5" };
    },
  };
  return { provider, sent };
}
afterEach(() => useAiProvider(null));

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
  for (let i = 0; i < 4; i++) {
    const st = (await addStudent(s.ctx, s.s5a.id, { applyFeePlan: false })).student;
    kids.push(st.id);
  }
  await s.run(async (tx) => {
    for (const id of kids) names.push((await tx.student.findUniqueOrThrow({ where: { id } })).fullName.split(" ")[0]);
    termId = (await tx.term.create({ data: { schoolId: s.school.id, academicYearId: s.year.id, name: "Term 1", startDate: d("2026-04-01"), endDate: d("2026-12-31"), sortOrder: 1 } })).id;
    await examSettings(tx, s.ctx);
    // Remark suggestions switched on in Exam Settings; the AI assistant off for now.
    await tx.schoolFeature.create({ data: { schoolId: s.school.id, featureKey: "exam-remark-suggestions", isOn: true } });
  });
  principal = await s.run(async (tx) => examScope(tx, await s.currentFor(s.principal.id), s.year.id));
  const [a, b, c, dd] = kids;
  const ut = await exam("Unit Test 2", "Unit Test 1", [["MAT", "2026-09-07"], ["ENG", "2026-09-08"]]);
  await s.run((tx) => saveMarks(tx, s.ctx, principal, { entryId: ut.entry("MAT"), sectionId: s.s5a.id, rows: [mark(a, 26), mark(b, 40), mark(c, 30), mark(dd, 20)] }));
  await s.run((tx) => saveMarks(tx, s.ctx, principal, { entryId: ut.entry("ENG"), sectionId: s.s5a.id, rows: [mark(a, 35), mark(b, 40), mark(c, 30), mark(dd, 22)] }));
  await s.run((tx) => publishResults(tx, s.ctx, principal, { key: examKey(ut.id), sectionIds: [s.s5a.id], publishOn: new Date(), messageParents: false }));
  const hy = await exam("Half Yearly", "Half Yearly", [["MAT", "2026-10-12"], ["ENG", "2026-10-13"]]);
  // Aarav (a): Mathematics up from 52% to 90%, well above the class.
  await s.run((tx) => saveMarks(tx, s.ctx, principal, { entryId: hy.entry("MAT"), sectionId: s.s5a.id, rows: [mark(a, 45), mark(b, 30), mark(c, 25), mark(dd, 20)] }));
  await s.run((tx) => saveMarks(tx, s.ctx, principal, { entryId: hy.entry("ENG"), sectionId: s.s5a.id, rows: [mark(a, 36), mark(b, 41), mark(c, 30), mark(dd, 24)] }));
  await s.run((tx) => publishResults(tx, s.ctx, principal, { key: examKey(hy.id), sectionIds: [s.s5a.id], publishOn: new Date(), messageParents: false }));
  period = `exam:${hy.id}`;
}, 240_000);

describe("with AI off", () => {
  it("suggests from the rules, with the evidence: the change since the exam before and the class average", async () => {
    await as(s.teacherUser.id);
    const r = await draftRemarksAction(s.s5a.id, period);
    expect(r.ok).toBe(true);
    const a = r.drafts.find((x) => x.studentId === kids[0])!;
    expect(a.options.length).toBeGreaterThanOrEqual(2);
    expect(a.lines.find((l) => l.fact === "improved")!.source).toBe("Marks: Mathematics 52% in Unit Test 2, 90% in Half Yearly");
    expect(a.lines.find((l) => l.fact === "aboveClass")!.source).toBe("Marks in Half Yearly: Mathematics 90%, class average 60% (4 students)");
  });

  it("asking the AI to reword changes nothing and sends nothing: the rule suggestions come back with the reason", async () => {
    const f = fake();
    useAiProvider(f.provider);
    await as(s.teacherUser.id);
    const r = await draftRemarksAction(s.s5a.id, period, undefined, { reword: true });
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/from the rules only/);
    expect(r.drafts.flatMap((x) => x.options).some((o) => o.byAi)).toBe(false);
    expect(f.sent).toHaveLength(0);
  });
});

describe("with AI on (a stand-in AI service)", () => {
  beforeAll(async () => {
    await s.run(async (tx) => {
      await saveAssistant(tx, s.ctx, { on: true, roles: ["principal", "teacher"] });
      await tx.schoolFeature.create({ data: { schoolId: s.school.id, featureKey: "ai-teacher-assistant", isOn: true } });
    });
  });

  it("sends only the evidence: no names, no ids, nothing private; each reworded remark lists its evidence; the call is logged", async () => {
    const f = fake();
    useAiProvider(f.provider);
    await as(s.teacherUser.id);
    const calls = await s.run((tx) => tx.aiCall.count());
    const r = await draftRemarksAction(s.s5a.id, period, undefined, { reword: true });
    expect(r.ok).toBe(true);
    expect(f.sent).toHaveLength(1);
    const text = f.sent[0].text;
    for (const n of names) expect(text).not.toContain(n);
    for (const id of kids) expect(text).not.toContain(id);
    expect(text).not.toMatch(/gender|caste|religion|income|health|aadhaar|admission|phone|guardian|address|birth/i);
    expect(text).toMatch(/Half Yearly/);
    const a = r.drafts.find((x) => x.studentId === kids[0])!;
    const ai = a.options.find((o) => o.byAi)!;
    expect(ai.text).toBe(`${names[0]} is making good progress; keep practising every day.`);
    expect(ai.lines).toHaveLength(1);
    expect(ai.lines[0].source).toMatch(/^Marks in Half Yearly/);
    // The rule suggestions are still there, first.
    expect(a.options[0].byAi).toBeFalsy();
    const log = await s.run((tx) => tx.aiCall.findMany({ orderBy: { createdAt: "desc" }, take: 1 }));
    expect(await s.run((tx) => tx.aiCall.count())).toBe(calls + 1);
    expect(log[0]).toMatchObject({ feature: "ai-teacher-assistant", purpose: "Reword report card remarks", outcome: "ok" });
  });

  it("a reworded remark with an invented number is never shown", async () => {
    const f = fake((q) => ({ students: q.students.map((x) => ({ key: x.key, remarks: [{ text: "{name} scored 99% this time.", refs: [x.evidence[0].ref] }] })) }));
    useAiProvider(f.provider);
    await as(s.teacherUser.id);
    const r = await draftRemarksAction(s.s5a.id, period, [kids[0]], { reword: true });
    expect(r.drafts.flatMap((x) => x.options).some((o) => o.byAi)).toBe(false);
  });

  it("nothing is saved by suggesting: no remark, no report card change", async () => {
    useAiProvider(fake().provider);
    await as(s.teacherUser.id);
    const before = await s.run((tx) => tx.reportCard.findMany({ where: { period }, select: { studentId: true, classTeacherRemark: true, updatedAt: true } }));
    const audits = await s.run((tx) => tx.auditLogEntry.count({ where: { action: "report-card-remarks" } }));
    await draftRemarksAction(s.s5a.id, period, undefined, { reword: true });
    const after = await s.run((tx) => tx.reportCard.findMany({ where: { period }, select: { studentId: true, classTeacherRemark: true, updatedAt: true } }));
    expect(after).toEqual(before);
    expect(after.every((c) => c.classTeacherRemark === null)).toBe(true);
    expect(await s.run((tx) => tx.auditLogEntry.count({ where: { action: "report-card-remarks" } }))).toBe(audits);
  });
});

describe("the saved remark records where it started", () => {
  it("kept from an AI rewording: recorded with its evidence, logged prepared by AI, confirmed by the teacher", async () => {
    useAiProvider(fake().provider);
    await as(s.teacherUser.id);
    const r = await draftRemarksAction(s.s5a.id, period, [kids[0]], { reword: true });
    const ai = r.drafts[0].options.find((o) => o.byAi)!;
    const rule = await draftRemarksAction(s.s5a.id, period, [kids[1]]);
    const ruleOption = rule.drafts[0].options[0];
    const saved = await saveRemarksAction(s.s5a.id, period, [
      { studentId: kids[0], classTeacherRemark: ai.text, suggestion: "kept", byAi: true, evidence: ai.lines },
      { studentId: kids[1], classTeacherRemark: `${ruleOption.text} Well done.`, suggestion: "edited", evidence: ruleOption.lines },
      { studentId: kids[2], classTeacherRemark: "Typed by the teacher." },
    ]);
    expect(saved.ok).toBe(true);
    const cards = await s.run((tx) => tx.reportCard.findMany({ where: { period, studentId: { in: kids.slice(0, 3) } } }));
    const card = (id: string) => cards.find((c) => c.studentId === id)!;
    expect(card(kids[0])).toMatchObject({ classTeacherRemark: ai.text, classTeacherRemarkFrom: "ai" });
    expect(card(kids[0]).classTeacherRemarkEvidence).toEqual(ai.lines.map((l) => ({ text: l.text, source: l.source })));
    expect(card(kids[1]).classTeacherRemarkFrom).toBe("suggestion-edited");
    expect(card(kids[2])).toMatchObject({ classTeacherRemarkFrom: null, classTeacherRemarkEvidence: null });
    const entry = await s.run((tx) => tx.auditLogEntry.findFirstOrThrow({ where: { action: "report-card-remarks" }, orderBy: { at: "desc" } }));
    expect(entry.actorNote).toBe("Prepared by AI, confirmed by Test: 1 class teacher remark; Started from a suggestion, confirmed by Test: 1 class teacher remark (1 edited before saving)");
  });

  it("edited by hand later: still says it started from a suggestion; cleared: says nothing", async () => {
    await as(s.teacherUser.id);
    await saveRemarksAction(s.s5a.id, period, [{ studentId: kids[0], classTeacherRemark: "Changed by hand." }]);
    let card = await s.run((tx) => tx.reportCard.findFirstOrThrow({ where: { period, studentId: kids[0] } }));
    expect(card.classTeacherRemarkFrom).toBe("ai-edited");
    expect(card.classTeacherRemarkEvidence).not.toBeNull();
    await saveRemarksAction(s.s5a.id, period, [{ studentId: kids[0], classTeacherRemark: "" }]);
    card = await s.run((tx) => tx.reportCard.findFirstOrThrow({ where: { period, studentId: kids[0] } }));
    expect(card).toMatchObject({ classTeacherRemark: null, classTeacherRemarkFrom: null, classTeacherRemarkEvidence: null });
  });

  it("only those who write the remark may ask: not a teacher of another section", async () => {
    await as(s.teacherUser.id);
    const r = await draftRemarksAction(s.s5b.id, period);
    expect(r).toMatchObject({ ok: false, drafts: [] });
  });
});
