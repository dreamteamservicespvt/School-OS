// Remark suggestions reworded by the AI assistant (gap G30), the pure part:
// what is sent (no name, nothing private) and what is kept from the answer
// (only remarks that cite their evidence, with no number, name or word that
// the evidence does not hold). No database, no network.
import { describe, expect, it } from "vitest";
import { draftRemark, type RemarkEvidence } from "@/lib/exams/remark-drafts";
import { readRemarkAnswer, remarkProblem, remarkQuestion } from "@/lib/exams/remark-words";
import { minimise } from "@/lib/ai/minimise";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const exam = (title: string, subjects: [string, number, number][]) => ({ title, subjects: subjects.map(([name, marks, max]) => ({ name, marks, max })), notWritten: [] });
const ev = (o: Partial<RemarkEvidence>): RemarkEvidence => ({
  studentId: "22222222-2222-2222-2222-222222222222", firstName: "Meera", period: { kind: "exam", examTitle: "Half Yearly" },
  exams: [exam("Half Yearly", [["Mathematics", 45, 50], ["English", 30, 50]])], previous: exam("Unit Test 2", [["Mathematics", 15, 25], ["English", 20, 25]]),
  passOverall: 33, passSubject: 33, attendance: { present: 99, working: 100, fromRegister: true, from: d("2026-04-01"), to: d("2026-10-16") }, attendanceThreshold: 75, homework: null,
  coScholastic: [{ area: "Health and Physical Education", grade: "A", best: true }], ...o,
});
const names = new Map([["22222222-2222-2222-2222-222222222222", "Meera"]]);

describe("what is sent to the AI service", () => {
  it("evidence only: no name, no student id, no private field; numbers and sources as the rules wrote them", () => {
    const draft = draftRemark(ev({}));
    const q = remarkQuestion([draft], names);
    const text = JSON.stringify(q.question);
    expect(text).not.toMatch(/Meera/);
    expect(text).not.toMatch(/2222/);
    expect(text).not.toMatch(/gender|caste|religion|income|health_|aadhaar|phone|address|admission/i);
    expect(q.question.students[0].key).toBe("S1");
    expect(q.question.students[0].evidence[0]).toEqual({ ref: "E1", sentence: expect.stringMatching(/^\{name\} has done/), source: "Marks in Half Yearly: 75 of 100 (75%)" });
    // The gateway's own wall finds nothing to hide or refuse in it.
    expect(minimise(q.question)).toMatchObject({ masked: 0, refused: [] });
  });

  it("a student with no suggestion is not sent at all", () => {
    const none = draftRemark(ev({ exams: [], previous: null }));
    expect(remarkQuestion([none], names).question.students).toEqual([]);
  });
});

describe("what is kept from the answer", () => {
  const draft = draftRemark(ev({}));
  const q = remarkQuestion([draft], names);
  const refOf = (fact: string) => `E${draft.lines.findIndex((l) => l.fact === fact) + 1}`;

  it("a remark that cites its evidence is shown with the student's name and those sources", () => {
    const got = readRemarkAnswer(q, { students: [{ key: "S1", remarks: [{ text: "{name} has worked hard and Mathematics went from 60% to 90% since Unit Test 2.", refs: [refOf("improved")] }] }] }, names);
    const o = got.get(draft.studentId)!;
    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({ byAi: true, text: "Meera has worked hard and Mathematics went from 60% to 90% since Unit Test 2." });
    expect(o[0].lines.map((l) => l.source)).toEqual(["Marks: Mathematics 60% in Unit Test 2, 90% in Half Yearly"]);
  });

  it("drops remarks with an invented number, a made-up name, no evidence, unknown evidence or words about the child", () => {
    const bad = [
      { text: "{name} scored 95% in Mathematics.", refs: [refOf("improved")] },
      { text: "Well done, {name}; like Ravi, keep it up.", refs: [refOf("improved")] },
      { text: "{name} has done well this term.", refs: [] },
      { text: "{name} has done well this term.", refs: ["E99"] },
      { text: "{name} is a gifted child who did well.", refs: ["E1"] },
      { text: "{name} did well for a girl.", refs: ["E1"] },
      { text: "{name} did well despite poor health.", refs: ["E1"] },
    ];
    expect(readRemarkAnswer(q, { students: [{ key: "S1", remarks: bad }] }, names).get(draft.studentId)).toBeUndefined();
    // An unknown student key is ignored.
    expect(readRemarkAnswer(q, { students: [{ key: "S9", remarks: [{ text: "{name} has done well.", refs: ["E1"] }] }] }, names).size).toBe(0);
  });

  it("words that come from the evidence itself (an area called Health and Physical Education) are allowed", () => {
    expect(remarkProblem("{name} does well in Health and Physical Education.", [draft.lines.find((l) => l.fact === "coScholastic")!])).toBeNull();
  });
});
