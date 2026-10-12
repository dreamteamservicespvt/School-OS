// Grade calculation (08 §2 Results, 04-data-model.md rules 14 and 15): grade
// scales with no gaps or overlaps, a percentage to its grade, pass and fail
// with grace and compartment, absent and medical leave, rank ties and the
// final result with weights. Pure functions, no database.
import { describe, expect, it } from "vitest";
import { bandFor, checkBands, presetBands, type Band } from "@/lib/exams/grades";
import { checkMark, examResult, finalResult, rankWithTies, subjectResult, type PaperInput, type PassRules } from "@/lib/exams/compute";
import { checkValue } from "@/lib/exams/marks";

const CBSE = presetBands("cbse")!;
const RULES: PassRules = { passPercentSubject: 33, passPercentOverall: 33, graceMarks: 0, compartmentSubjects: 0, absentRule: "zero" };
const paper = (name: string, max: number, total: number | null, extra: Partial<NonNullable<PaperInput["marks"]>> = {}): PaperInput => ({
  subjectId: name, name, max, gradeOnly: false, marks: total === null && !extra.absent ? null : { total, absent: false, grade: null, ...extra },
});

describe("grade scale", () => {
  it("the ready-made scales have no gaps or overlaps", () => {
    for (const key of ["cbse", "icse", "state"]) expect(checkBands(presetBands(key)!)).toBeNull();
  });

  it("finds a gap between two grades", () => {
    const bands: Band[] = CBSE.map((b) => (b.grade === "B1" ? { ...b, from: 72 } : b));
    expect(checkBands(bands)).toMatch(/B2 ends at 70% but B1 starts at 72%/);
  });

  it("finds an overlap between two grades", () => {
    const bands: Band[] = CBSE.map((b) => (b.grade === "A2" ? { ...b, to: 92 } : b));
    expect(checkBands(bands)).toMatch(/falls in two grades/);
  });

  it("must start at 0% and end at 100%", () => {
    expect(checkBands(CBSE.map((b) => (b.grade === "A1" ? { ...b, to: 99 } : b)))).toMatch(/must end at 100%/);
    expect(checkBands(CBSE.map((b) => (b.grade === "E" ? { ...b, from: 1 } : b)))).toMatch(/must start at 0%/);
  });

  it("refuses a grade used twice", () => {
    expect(checkBands(CBSE.map((b) => (b.grade === "A2" ? { ...b, grade: "A1" } : b)))).toMatch(/used twice/);
  });

  it("a percentage takes the grade of the band that holds its whole number", () => {
    expect(bandFor(91, CBSE)?.grade).toBe("A1");
    expect(bandFor(90.6, CBSE)?.grade).toBe("A2");
    expect(bandFor(33, CBSE)?.grade).toBe("D");
    expect(bandFor(32.9, CBSE)?.grade).toBe("E");
    expect(bandFor(0, CBSE)?.grade).toBe("E");
    expect(bandFor(100, CBSE)?.grade).toBe("A1");
  });
});

describe("subject and exam results", () => {
  it("works out percentage, grade, points and pass for a subject", () => {
    const s = subjectResult(paper("Maths", 80, 66), CBSE, RULES);
    expect(s).toMatchObject({ marks: 66, percent: 82.5, grade: "A2", points: 9, passed: true, grace: 0, missing: false });
  });

  it("fails a subject below the pass mark, and gives grace up to the school's limit", () => {
    expect(subjectResult(paper("Maths", 100, 31), CBSE, RULES).passed).toBe(false);
    const graced = subjectResult(paper("Maths", 100, 31), CBSE, { ...RULES, graceMarks: 2 });
    expect(graced).toMatchObject({ passed: true, grace: 2 });
    expect(subjectResult(paper("Maths", 100, 30), CBSE, { ...RULES, graceMarks: 2 }).passed).toBe(false);
  });

  it("totals the exam, and a student failing one subject fails, or gets compartment when allowed", () => {
    const papers = [paper("English", 100, 70), paper("Maths", 100, 20), paper("Science", 100, 60)];
    const r = examResult(papers, CBSE, RULES);
    expect(r).toMatchObject({ total: 150, maxTotal: 300, percent: 50, grade: "C2", outcome: "Fail", complete: true });
    expect(examResult(papers, CBSE, { ...RULES, compartmentSubjects: 1 }).outcome).toBe("Compartment");
  });

  it("an incomplete result has no outcome and counts what is missing", () => {
    const r = examResult([paper("English", 100, 70), paper("Maths", 100, null)], CBSE, RULES);
    expect(r).toMatchObject({ complete: false, missing: 1, outcome: null });
  });

  it("absent (AB) counts as zero, or is left out when the school says so", () => {
    const papers = [paper("English", 100, 80), paper("Maths", 100, null, { absent: true })];
    expect(examResult(papers, CBSE, RULES)).toMatchObject({ total: 80, maxTotal: 200, percent: 40, outcome: "Fail", absentPapers: 1 });
    expect(examResult(papers, CBSE, { ...RULES, absentRule: "leave-out" })).toMatchObject({ total: 80, maxTotal: 100, percent: 80, outcome: "Pass" });
  });

  it("medical leave (ML) is always left out of the total", () => {
    const papers = [paper("English", 100, 80), paper("Maths", 100, null, { absent: true, medical: true })];
    const r = examResult(papers, CBSE, RULES);
    expect(r).toMatchObject({ total: 80, maxTotal: 100, percent: 80, outcome: "Pass", complete: true });
    expect(r.subjects[1]).toMatchObject({ grade: "ML", medical: true, passed: null });
  });

  it("a grade-only subject keeps its grade and is not in the total", () => {
    const art: PaperInput = { subjectId: "art", name: "Art", max: 0, gradeOnly: true, marks: { total: null, absent: false, grade: "A" } };
    const r = examResult([paper("English", 100, 60), art], CBSE, RULES);
    expect(r).toMatchObject({ total: 60, maxTotal: 100, complete: true });
    expect(r.subjects[1]).toMatchObject({ grade: "A", passed: null });
  });
});

describe("ranks", () => {
  const items = [
    { id: "a", percent: 90, total: 270, complete: true },
    { id: "b", percent: 90, total: 270, complete: true },
    { id: "c", percent: 80, total: 240, complete: true },
    { id: "d", percent: 95, total: 285, complete: false },
  ];
  it("skips the next rank after a tie by default (1, 1, 3)", () => {
    const r = rankWithTies(items, "skip");
    expect([r.get("a"), r.get("b"), r.get("c")]).toEqual([1, 1, 3]);
  });
  it("gives the next rank after a tie in dense mode (1, 1, 2)", () => {
    const r = rankWithTies(items, "dense");
    expect([r.get("a"), r.get("b"), r.get("c")]).toEqual([1, 1, 2]);
  });
  it("an incomplete result gets no rank", () => {
    expect(rankWithTies(items, "skip").has("d")).toBe(false);
  });
});

describe("final result", () => {
  const exam = (percent: number) => examResult([paper("Maths", 100, percent)], CBSE, RULES);
  it("uses each exam's weight", () => {
    const f = finalResult([{ examId: "ut", weight: 20, result: exam(50) }, { examId: "hy", weight: 30, result: exam(70) }, { examId: "an", weight: 50, result: exam(90) }], CBSE, RULES);
    expect(f.percent).toBe(76);
    expect(f.examsCounted).toBe(3);
    expect(f.subjects[0].percent).toBe(76);
  });
  it("with no weights every exam counts the same", () => {
    expect(finalResult([{ examId: "a", weight: 0, result: exam(60) }, { examId: "b", weight: 0, result: exam(80) }], CBSE, RULES).percent).toBe(70);
  });
  it("leaves out exams with no weight when weights are set, and is incomplete while a counted exam is", () => {
    const f = finalResult([{ examId: "a", weight: 100, result: exam(60) }, { examId: "b", weight: 0, result: exam(10) }], CBSE, RULES);
    expect(f).toMatchObject({ percent: 60, examsCounted: 1, complete: true });
    expect(finalResult([{ examId: "a", weight: 100, result: null }], CBSE, RULES).complete).toBe(false);
  });
});

describe("mark checks", () => {
  const cats = [{ name: "Theory", max: 80 }, { name: "Internal", max: 20 }];
  const st = { name: "Asha" };
  it("refuses marks above the category's maximum, below 0, or not whole or half", () => {
    expect(checkMark("Theory", 80, 81)).toMatch(/out of 80/);
    expect(checkMark("Theory", 80, -1)).toMatch(/below 0/);
    expect(checkMark("Theory", 80, 37.3)).toMatch(/whole or half/);
    expect(checkMark("Theory", 80, 37.5)).toBeNull();
  });
  it("absent or medical leave cannot have marks too", () => {
    expect(checkValue(st, { parts: { Theory: 40 }, absent: true, grade: null, remark: null }, cats, false, [])).toMatch(/marked absent/);
    expect(checkValue(st, { parts: { Theory: 40 }, absent: true, medical: true, grade: null, remark: null }, cats, false, [])).toMatch(/medical leave/);
    expect(checkValue(st, { parts: { Theory: 70, Internal: 18 }, absent: false, grade: null, remark: null }, cats, false, [])).toBeNull();
  });
  it("a grade-only subject takes only the school's grades", () => {
    expect(checkValue(st, { parts: {}, absent: false, grade: "Z", remark: null }, [], true, ["A", "B", "C"])).toMatch(/choose a grade/);
  });
});
