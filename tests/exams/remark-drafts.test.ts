// Report card remark suggestions (gap G30, browser finding TEACHING-10): built
// only from evidence in the student's own records, each sentence with its
// source, in words for the period, and no suggestion at all without marks.
import { describe, expect, it } from "vitest";
import { draftRemark, type RemarkEvidence } from "@/lib/exams/remark-drafts";

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
