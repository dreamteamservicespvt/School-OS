// Report card remark suggestions (gap G30, browser finding TEACHING-10): built
// only from evidence in the student's own records, each sentence with its
// source, in words for the period, and no suggestion at all without marks.
import { describe, expect, it } from "vitest";
import { classAverages, draftRemark, type RemarkEvidence } from "@/lib/exams/remark-drafts";
import { checkPhrase, cleanPhrases, DEFAULT_PHRASES, readPhrases } from "@/lib/exams/remark-phrases";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const base = (o: Partial<RemarkEvidence> = {}): RemarkEvidence => ({
  studentId: "11111111-1111-1111-1111-111111111111", firstName: "Ananya", period: { kind: "exam", examTitle: "Class Test October" },
  exams: [], previous: null, passOverall: 33, passSubject: 33, attendance: null, attendanceThreshold: 75, homework: null, coScholastic: [], ...o,
});
const exam = (title: string, subjects: [string, number, number][], notWritten: string[] = []) => ({ title, subjects: subjects.map(([name, marks, max]) => ({ name, marks, max })), notWritten });

describe("a student with no marks for the period", () => {
  it("absent (AB) or on medical leave (ML) for every paper gets no remark, only a note to write one", () => {
    for (const code of ["AB", "ML"]) {
      const r = draftRemark(base({ exams: [exam("Class Test October", [], [`Mathematics (${code})`])], previous: exam("Unit Test 2", [["Mathematics", 48, 50]]), attendance: { present: 60, working: 60, fromRegister: true, from: d("2026-06-01"), to: d("2026-10-16") } }));
      expect(r.text).toBeNull();
      expect(r.lines).toEqual([]);
      expect(r.why).toBe("No marks for this exam: write your own remark.");
    }
  });

  it("a student who joined after the exam gets none either, with the period's own words", () => {
    expect(draftRemark(base({ period: { kind: "term" } })).why).toBe("No marks for this term: write your own remark.");
    expect(draftRemark(base({ period: { kind: "year" } })).why).toBe("No marks for this year: write your own remark.");
  });

  it("marks not all in yet: says so instead of judging", () => {
    expect(draftRemark(base({ waiting: true })).why).toMatch(/not all in yet/);
  });
});

describe("a student with marks", () => {
  it("each sentence has its source, and the wording fits the period", () => {
    const r = draftRemark(base({ exams: [exam("Class Test October", [["Mathematics", 45, 50]])] }));
    expect(r.text).toMatch(/^Ananya has done (very well|excellent work) in Class Test October\.$/);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].source).toBe("Marks in Class Test October: 45 of 50 (90%)");
    const term = draftRemark(base({ period: { kind: "term" }, exams: [exam("Unit Test 1", [["Mathematics", 35, 50]]), exam("Half Yearly", [["Mathematics", 36, 50]])] }));
    expect(term.lines[0].text).toMatch(/this term/);
    expect(term.lines[0].text).not.toMatch(/this year|in Unit/);
    expect(term.lines[0].source).toBe("Marks in Unit Test 1 and Half Yearly: 71 of 100 (71%)");
  });

  it("an absent paper is left out of the marks, never counted as a low mark", () => {
    const r = draftRemark(base({ exams: [exam("Half Yearly", [["English", 46, 50]], ["Mathematics (AB)"])] }));
    expect(r.lines[0].text).toMatch(/very well|excellent/);
    expect(r.lines[0].source).toMatch(/Mathematics \(AB\) not written, left out/);
  });

  it("below the pass mark says so, with the pass mark in the source", () => {
    const r = draftRemark(base({ exams: [exam("Class Test October", [["Mathematics", 10, 50]])] }));
    expect(r.lines[0].text).toMatch(/pass mark/);
    expect(r.lines[0].source).toBe("Marks in Class Test October: 10 of 50 (20%), pass mark 33%");
  });

  it("the change in a subject since the exam before is named, with both marks", () => {
    const r = draftRemark(base({ exams: [exam("Half Yearly", [["Mathematics", 45, 50], ["English", 30, 50]])], previous: exam("Unit Test 2", [["Mathematics", 15, 25], ["English", 20, 25]]) }));
    const up = r.lines.find((l) => /improved/.test(l.text))!;
    expect(up.text).toBe("Has improved in Mathematics since Unit Test 2.");
    expect(up.source).toBe("Marks: Mathematics 60% in Unit Test 2, 90% in Half Yearly");
    const down = r.lines.find((l) => /come down/.test(l.text))!;
    expect(down.text).toMatch(/English/);
    expect(down.source).toBe("Marks: English 80% in Unit Test 2, 60% in Half Yearly");
  });

  it("attendance, homework and co-scholastic grades each add a sentence with its numbers", () => {
    const r = draftRemark(base({
      exams: [exam("Class Test October", [["Mathematics", 40, 50]])],
      attendance: { present: 98, working: 100, fromRegister: true, from: d("2026-04-01"), to: d("2026-10-16") },
      homework: { given: 10, done: 10, from: d("2026-04-01"), to: d("2026-10-16") },
      coScholastic: [{ area: "Art Education", grade: "A", best: true }, { area: "Work Education", grade: "B", best: false }],
    }));
    expect(r.lines.map((l) => l.text)).toEqual(expect.arrayContaining(["Regular in attendance.", "Hands in homework regularly.", "Does well in Art Education."]));
    expect(r.lines.find((l) => l.text === "Regular in attendance.")!.source).toBe("Attendance register, 01-04-2026 to 16-10-2026: 98 of 100 days (98%)");
    expect(r.lines.find((l) => /homework/.test(l.text))!.source).toBe("Homework due 01-04-2026 to 16-10-2026: 10 of 10 handed in (100%)");
    expect(r.lines.find((l) => /Art/.test(l.text))!.source).toBe("Co-scholastic grades: Art Education A");
    expect(r.text).toBe(r.lines.map((l) => l.text).join(" "));
  });

  it("low attendance names the threshold; ordinary attendance and few homework say nothing", () => {
    const low = draftRemark(base({ exams: [exam("Class Test October", [["Mathematics", 40, 50]])], attendance: { present: 60, working: 100, fromRegister: false, from: d("2026-04-01"), to: d("2026-10-16") } }));
    expect(low.lines.find((l) => /Attendance is low/.test(l.text))!.source).toBe("Attendance typed on this report card: 60 of 100 days (60%), below 75%");
    const plain = draftRemark(base({ exams: [exam("Class Test October", [["Mathematics", 40, 50]])], attendance: { present: 85, working: 100, fromRegister: true, from: d("2026-04-01"), to: d("2026-10-16") }, homework: { given: 2, done: 0, from: d("2026-04-01"), to: d("2026-10-16") } }));
    expect(plain.lines).toHaveLength(1);
  });
});

describe("against the class average (gap G30)", () => {
  it("names a subject well above or below the class average, with both numbers and how many students", () => {
    const avg = classAverages([
      [exam("Half Yearly", [["Mathematics", 20, 50], ["English", 40, 50]])],
      [exam("Half Yearly", [["Mathematics", 25, 50], ["English", 40, 50]])],
      [exam("Half Yearly", [["Mathematics", 30, 50], ["English", 45, 50]])],
    ]);
    expect(avg.find((a) => a.subject === "Mathematics")).toEqual({ subject: "Mathematics", average: 50, students: 3 });
    const r = draftRemark(base({ exams: [exam("Half Yearly", [["Mathematics", 40, 50], ["English", 30, 50]])], classAverages: avg }));
    const above = r.lines.find((l) => l.fact === "aboveClass")!;
    expect(above.text).toBe("Above the class average in Mathematics.");
    expect(above.source).toBe("Marks in Half Yearly: Mathematics 80%, class average 50% (3 students)");
    const below = r.lines.find((l) => l.fact === "belowClass")!;
    expect(below.text).toMatch(/^Below the class average in English/);
    expect(below.source).toBe("Marks in Half Yearly: English 60%, class average 83.3% (3 students)");
  });

  it("says nothing about the class when fewer than 3 students wrote the subject", () => {
    const avg = classAverages([[exam("Half Yearly", [["Mathematics", 10, 50]])], [exam("Half Yearly", [["Mathematics", 12, 50]])]]);
    expect(avg).toEqual([]);
    const r = draftRemark(base({ exams: [exam("Half Yearly", [["Mathematics", 45, 50]])], classAverages: [{ subject: "Mathematics", average: 20, students: 2 }] }));
    expect(r.lines.some((l) => /class average/.test(l.source))).toBe(false);
  });
});

describe("two or three ways of putting it", () => {
  it("full, short and with a next step, each listing its sentences' sources", () => {
    const r = draftRemark(base({
      exams: [exam("Half Yearly", [["Mathematics", 45, 50], ["English", 30, 50]])],
      previous: exam("Unit Test 2", [["Mathematics", 15, 25], ["English", 20, 25]]),
      attendance: { present: 99, working: 100, fromRegister: true, from: d("2026-04-01"), to: d("2026-10-16") },
    }));
    expect(r.options.map((o) => o.id)).toEqual(["full", "short", "next"]);
    expect(r.options[0].text).toBe(r.text);
    const next = r.options.find((o) => o.id === "next")!;
    expect(next.lines.map((l) => l.fact)).toEqual(["levelGood", "improved", "dropped"]);
    for (const o of r.options) {
      expect(o.text).toBe(o.lines.map((l) => l.text).join(" "));
      for (const l of o.lines) expect(l.source.length).toBeGreaterThan(0);
    }
    expect(new Set(r.options.map((o) => o.text)).size).toBe(r.options.length);
  });

  it("only how it went: one suggestion, never padded out", () => {
    const r = draftRemark(base({ exams: [exam("Class Test October", [["Mathematics", 45, 50]])] }));
    expect(r.options).toHaveLength(1);
  });

  it("never longer than the report card takes", () => {
    const long = { ...DEFAULT_PHRASES, levelGood: ["{name} has done well {period}. ".repeat(4).trim()], improved: ["Has improved in {subjects} since {before}, which is very good to see and shows steady effort in class and at home over these weeks."] };
    const r = draftRemark(base({ phrases: long, exams: [exam("Half Yearly", [["Mathematics", 45, 50], ["English", 30, 50]])], previous: exam("Unit Test 2", [["Mathematics", 15, 25], ["English", 20, 25]]), attendance: { present: 99, working: 100, fromRegister: true, from: d("2026-04-01"), to: d("2026-10-16") }, homework: { given: 10, done: 10, from: d("2026-04-01"), to: d("2026-10-16") } }));
    for (const o of r.options) expect(o.text.length).toBeLessThanOrEqual(500);
  });
});

describe("the school's phrase bank", () => {
  it("the school's own words are used, the numbers stay in the source", () => {
    const phrases = readPhrases({ levelExcellent: ["Excellent work by {name} {period}."] });
    const r = draftRemark(base({ phrases, exams: [exam("Class Test October", [["Mathematics", 45, 50]])] }));
    expect(r.text).toBe("Excellent work by Ananya in Class Test October.");
    expect(r.lines[0].source).toBe("Marks in Class Test October: 45 of 50 (90%)");
  });

  it("refuses words about the child rather than their work, sensitive words and unknown blanks", () => {
    expect(checkPhrase("levelSupport", "{name} is lazy and must try harder.")).toMatch(/describes the child/);
    expect(checkPhrase("levelGood", "{name} did well for a girl.")).toMatch(/not for a report card/);
    expect(checkPhrase("levelGood", "{name} did well in {subjects}.")).toMatch(/cannot be used here/);
    expect(checkPhrase("strong", "Strong in maths.")).toMatch(/Keep \{subjects\}/);
    expect(checkPhrase("strong", "Shines in {subjects}.")).toBeNull();
    expect(cleanPhrases({ strong: ["Strong in {subjects}."] }).phrases).toEqual({});
    expect(cleanPhrases({ strong: ["Shines in {subjects}."] }).phrases).toEqual({ strong: ["Shines in {subjects}."] });
  });

  it("an unreadable stored phrase falls back to the ready-made one", () => {
    expect(readPhrases({ strong: ["{name} is lazy."], weak: "not a list" }).strong).toEqual(DEFAULT_PHRASES.strong);
    expect(readPhrases(null)).toEqual(DEFAULT_PHRASES);
  });
});
