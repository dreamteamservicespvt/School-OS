// Homework & Learning "Done when" (17-homework-learning.md §9), against the
// real database rules: due date from the Time Table, classes with no students
// never offered, counts that match the submissions table, bulk Complete with
// undo, on-time and late hand-ins, and a quiz that marks itself and shows in
// Learning Progress.
import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { Current } from "@/lib/current";
import { todayIn } from "@/lib/academic/common";
import { homeworkScope, workSections, type HomeworkScope } from "@/lib/homework/scope";
import { countsFor, giveHomework, givenWords, nextClassDay, type GiveInput } from "@/lib/homework/homework";
import { bulkComplete, bulkPreview, submitWork, undoBulkComplete } from "@/lib/homework/submissions";
import { createQuiz, startAttempt, submitAttempt } from "@/lib/homework/quizzes";
import { classProgress } from "@/lib/homework/progress";
import { lateAfter } from "@/lib/homework/settings";
import { makeUser } from "../helpers";
import { academicSchool } from "../academic/fixture";

const TZ = "Asia/Kolkata";
let f: Awaited<ReturnType<typeof academicSchool>>;
let teacher: Current;
let student: Current;
const kids: string[] = [];
const today = todayIn(TZ);
const day = (n: number) => new Date(today.getTime() + n * 86_400_000);
const as = <T>(c: Current, fn: (tx: Parameters<Parameters<typeof f.run>[0]>[0], s: HomeworkScope) => Promise<T>) =>
  f.run(async (tx) => fn(tx, await homeworkScope(tx, c, today)));
const give = (over: Partial<GiveInput> = {}): GiveInput => ({
  sectionId: f.s5a.id, subjectId: f.subjects.MAT, title: `Exercise ${randomUUID().slice(0, 4)}`, instructions: "Questions 1 to 10", givenTo: "SECTION", studentIds: [],
  startDate: today, dueDate: day(2), maxMarks: 10, onlineSubmission: true, fromSuggestion: false, attachments: [], ...over,
});

beforeAll(async () => {
  f = await academicSchool();
  const login = await makeUser({ schools: [{ id: f.school.id, roleKeys: ["student"] }] });
  await f.run(async (tx) => {
    await tx.role.updateMany({ where: { key: "student" }, data: { isEnabled: true } });
    for (let i = 0; i < 30; i++) {
      const st = await tx.student.create({ data: { schoolId: f.school.id, campusId: f.campusId, admissionNo: `DW-${i}-${randomUUID().slice(0, 4)}`, firstName: `Kid${i}`, lastName: "Test", fullName: `Kid${i} Test`, status: "ACTIVE", userLoginId: i === 0 ? login.id : undefined } });
      await tx.enrolment.create({ data: { schoolId: f.school.id, studentId: st.id, academicYearId: f.year.id, classId: f.c5.id, sectionId: f.s5a.id, rollNo: i + 1 } });
      kids.push(st.id);
    }
  });
  teacher = await f.currentFor(f.teacherUser.id);
  student = await f.currentFor(login.id);
}, 180_000);

describe("setting homework", () => {
  it("fills the due date with the next day Mathematics is taught to 5 A (rule 1)", async () => {
    const due = await f.run((tx) => nextClassDay(tx, f.ctx, f.s5a.id, f.subjects.MAT, today));
    expect(due.fromTimetable).toBe(true);
    expect(due.date.getTime()).toBeGreaterThan(today.getTime());
    expect([1, 2, 3, 4, 5]).toContain(due.date.getUTCDay());
    expect(due.words).toMatch(/period 1/);
  });

  it("never offers a class with no students (rule 2)", async () => {
    const sections = await as(teacher, (tx, s) => workSections(tx, s));
    expect(sections.map((x) => x.id)).toEqual([f.s5a.id]); // 5 B is the teacher's too, but has no students
    await expect(as(teacher, (tx, s) => giveHomework(tx, s, give({ sectionId: f.s5b.id }), today))).rejects.toThrow(/has students/);
  });

  it("shows assigned and submitted counts that match the submissions table (rule 3)", async () => {
    const r = await as(teacher, (tx, s) => giveHomework(tx, s, give(), today));
    const id = r.made[0].id;
    await f.run((tx) => tx.submission.updateMany({ where: { homeworkId: id, studentId: { in: kids.slice(0, 4) } }, data: { status: "SUBMITTED", submittedAt: new Date() } }));
    const c = (await f.run((tx) => countsFor(tx, [id]))).get(id)!;
    const table = await f.run((tx) => tx.submission.groupBy({ by: ["status"], where: { homeworkId: id, archivedAt: null }, _count: true }));
    expect(c.assigned).toBe(table.reduce((n, x) => n + x._count, 0));
    expect(c.assigned).toBe(30);
    expect(c.submitted).toBe(4);
  });

  it("tells the teacher only what really happened: no WhatsApp promise when parents are not messaged (ACADEMICS-16)", async () => {
    const r = await as(teacher, (tx, s) => giveHomework(tx, s, give(), today));
    expect(r.made[0].students).toBe(30);
    expect(r.made[0].parents).not.toBe("sent");
    const words = givenWords(r.made);
    expect(words).toMatch(/^Homework sent to .+ \(30 students\)\./);
    expect(words).not.toMatch(/WhatsApp\.$|get it on WhatsApp/);
    expect(words).toMatch(/Parents were not messaged/);
    expect(givenWords([{ sectionLabel: "5 A", students: 2, notified: 1, parents: "sent" }])).toBe("Homework sent to 5 A (2 students). 1 student notified in the app. Parents were messaged.");
  });
});

describe("checking work", () => {
  it("marks 30 students Complete in one action after a preview, and undoes it (rule 4)", async () => {
    const r = await as(teacher, (tx, s) => giveHomework(tx, s, give(), today));
    const id = r.made[0].id;
    const preview = await as(teacher, (tx, s) => bulkPreview(tx, s, id, kids));
    expect(preview.change).toHaveLength(30);
    const done = await as(teacher, (tx, s) => bulkComplete(tx, s, id, kids));
    expect(done.count).toBe(30);
    expect(await f.run((tx) => tx.submission.count({ where: { homeworkId: id, status: "GRADED", checkResult: "COMPLETE" } }))).toBe(30);
    const restored = await as(teacher, (tx, s) => undoBulkComplete(tx, s, done.undoId));
    expect(restored).toBe(30);
    expect(await f.run((tx) => tx.submission.count({ where: { homeworkId: id, status: "ASSIGNED" } }))).toBe(30);
  });
});

describe("a student hands in", () => {
  it("before the due date it is Submitted; after the due date (and grace time) it is Late (rule 6)", async () => {
    const onTime = await as(teacher, (tx, s) => giveHomework(tx, s, give({ dueDate: day(2) }), today));
    const r1 = await as(student, (tx, s) => submitWork(tx, s, onTime.made[0].id, { files: [], note: "My answers" }, new Date(), today, TZ));
    expect(r1).toMatchObject({ status: "SUBMITTED", late: false });

    // Given three days ago, due yesterday (homework cannot be given with a due date already past).
    const passed = await as(teacher, (tx, s) => giveHomework(tx, s, give({ startDate: day(-3), dueDate: day(-1) }), day(-3)));
    const r2 = await as(student, (tx, s) => submitWork(tx, s, passed.made[0].id, { files: [], note: "Sorry, late" }, new Date(), today, TZ));
    expect(r2).toMatchObject({ status: "LATE", late: true });

    // A due date already past is refused, as the screen refuses it (QA ACADEMICS-20).
    await expect(as(teacher, (tx, s) => giveHomework(tx, s, give({ startDate: day(-3), dueDate: day(-1) }), today))).rejects.toThrow(/already passed/);

    // Late means after 11:59 PM on the due date in the school's time zone, plus the grace time.
    const edge = lateAfter(new Date("2026-10-15T00:00:00Z"), TZ, 30);
    expect(edge.toISOString()).toBe("2026-10-15T19:00:00.000Z"); // 16 Oct 00:00 IST = 15 Oct 18:30 UTC, plus 30 minutes
  });
});

describe("quizzes", () => {
  it("a quiz marks itself and the score shows in Learning Progress (rule 8)", async () => {
    const quiz = await as(teacher, (tx, s) => createQuiz(tx, s, {
      sectionId: f.s5a.id, subjectId: f.subjects.MAT, title: "Fractions check", opensAt: new Date(Date.now() - 60_000), closesAt: day(3), timeLimitMin: null, attemptsAllowed: 1, showAnswers: true,
      questions: [
        { kind: "CHOICE", text: "1/2 + 1/4 = ?", options: ["3/4", "2/6", "1/8"], correctIndex: 0, marks: 2 },
        { kind: "TRUE_FALSE", text: "3/8 is more than 5/8.", options: ["True", "False"], correctIndex: 1, marks: 1 },
      ],
    }, true, new Date(), today));
    const attempt = await as(student, (tx, s) => startAttempt(tx, s, quiz.quiz.id, new Date()));
    const qs = await f.run((tx) => tx.quizQuestion.findMany({ where: { quizId: quiz.quiz.id }, orderBy: { sortOrder: "asc" } }));
    const res = await as(student, (tx, s) => submitAttempt(tx, s, attempt.id, { [qs[0].id]: 0, [qs[1].id]: 0 }, new Date()));
    expect(res).toMatchObject({ score: 2, max: 3, waiting: false });
    const pr = await as(teacher, (tx, s) => classProgress(tx, s, f.s5a.id, f.subjects.MAT, null, null, today));
    const row = pr!.rows.find((r) => r.id === kids[0])!;
    expect(row.quizzes).toBe(1);
    expect(row.quizPct).toBe(67);
  });
});

describe("where Homework & Learning shows outside its pages", () => {
  it("adds a Homework tab (order 60) to the Student Profile for staff, not for a student, and its Dashboard widgets", async () => {
    await import("@/lib/homework/profile-tab");
    const { profileTabsFor } = await import("@/lib/students/profile-tabs");
    const tab = profileTabsFor(teacher).find((t) => t.key === "homework");
    expect(tab?.order).toBe(60);
    expect(profileTabsFor(student).some((t) => t.key === "homework")).toBe(false);
    const { WIDGETS } = await import("@/lib/dashboard/registry");
    expect(WIDGETS.map((w) => w.id)).toEqual(expect.arrayContaining(["homework.to-check", "homework.piling-up", "homework.handed-in", "homework.online-today"]));
  });
});
