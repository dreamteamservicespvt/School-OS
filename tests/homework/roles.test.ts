// Homework & Learning on the server (17-homework-learning.md "Done when",
// 05-roles.md, owner's duty rules of 13 and 14 Oct in src/lib/duty.ts):
// a subject teacher works only with their own classes and subjects; the
// Principal, School Admin and Vice Principal watch and remind but do no desk
// work; a student sees only their own work; a score above the maximum is
// refused; refused actions are refused by the server, not only hidden.
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

import { randomUUID } from "node:crypto";
import { todayIn } from "@/lib/academic/common";
import { homeworkLevel } from "@/lib/homework/access";
import { homeworkScope, mayRead, type HomeworkScope } from "@/lib/homework/scope";
import { giveHomework, homeworkDetail, listHomework, type GiveInput } from "@/lib/homework/homework";
import { gradeSubmission } from "@/lib/homework/submissions";
import { createQuiz } from "@/lib/homework/quizzes";
import { remindTeacher } from "@/lib/homework/overview";
import { homeworkSettings } from "@/lib/homework/settings";
import { optionalPageAction, saveSettingsAction } from "@/app/(school)/homework-learning/settings/actions";
import { remindTeacherAction } from "@/app/(school)/homework-learning/actions";
import { makeUser } from "../helpers";
import { academicSchool } from "../academic/fixture";

let f: Awaited<ReturnType<typeof academicSchool>>;
const people = {} as Record<"teacher" | "principal" | "admin" | "vp" | "accountant" | "student", Current>;
let students5a: string[] = [];
let student6a = "";
const today = todayIn("Asia/Kolkata");
const day = (n: number) => new Date(today.getTime() + n * 86_400_000);

const as = (c: Current) => { who.current = c; };
const form = (o: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.append(k, v); return fd; };
const scopeOf = (c: Current) => f.run((tx) => homeworkScope(tx, c, today));
const give = (sectionId: string, code: string): GiveInput => ({
  sectionId, subjectId: f.subjects[code], title: `Exercise ${code} ${randomUUID().slice(0, 4)}`, instructions: "Do questions 1 to 10", givenTo: "SECTION", studentIds: [],
  startDate: today, dueDate: day(2), maxMarks: 20, onlineSubmission: true, fromSuggestion: false, attachments: [],
});
/** Runs as one person, inside their school, with their scope. */
const asScope = <T>(c: Current, fn: (tx: Parameters<Parameters<typeof f.run>[0]>[0], s: HomeworkScope) => Promise<T>) =>
  f.run(async (tx) => fn(tx, await homeworkScope(tx, c, today)));

beforeAll(async () => {
  f = await academicSchool();
  const studentUser = await makeUser({ schools: [{ id: f.school.id, roleKeys: ["student"] }] });
  await f.run(async (tx) => {
    await tx.role.updateMany({ where: { key: { in: ["student", "vice-principal"] } }, data: { isEnabled: true } });
    let n = 0;
    const add = async (sectionId: string, classId: string, login?: string) => {
      n++;
      const st = await tx.student.create({ data: { schoolId: f.school.id, campusId: f.campusId, admissionNo: `HW-${n}-${randomUUID().slice(0, 4)}`, firstName: `Kid${n}`, lastName: "Test", fullName: `Kid${n} Test`, status: "ACTIVE", userLoginId: login } });
      await tx.enrolment.create({ data: { schoolId: f.school.id, studentId: st.id, academicYearId: f.year.id, classId, sectionId, rollNo: n } });
      return st.id;
    };
    students5a = [await add(f.s5a.id, f.c5.id, studentUser.id), await add(f.s5a.id, f.c5.id), await add(f.s5a.id, f.c5.id)];
    student6a = await add(f.s6a.id, f.c6.id);
    await add(f.s5b.id, f.c5.id);
    await homeworkSettings(tx, f.ctx);
  });
  const make = async (key: string) => f.currentFor((await makeUser({ schools: [{ id: f.school.id, roleKeys: [key] }] })).id);
  people.teacher = await f.currentFor(f.teacherUser.id);
  people.principal = await f.currentFor(f.principal.id);
  people.admin = await make("school-admin");
  people.vp = await make("vice-principal");
  people.accountant = await make("accountant");
  people.student = await f.currentFor(studentUser.id);
}, 180_000);

describe("who reaches Homework & Learning, and on which pages", () => {
  it("the Accountant has no Homework & Learning", () => {
    expect(homeworkLevel(people.accountant.permissions, people.accountant.roles)).toBeNull();
  });

  it("the Principal watches: Homework, Learning Progress and Settings to read, no teaching pages", async () => {
    const s = await scopeOf(people.principal);
    expect(s.level).toBe("full");
    expect(s.modes).toMatchObject({ homework: "view", "learning-progress": "view", settings: "view", submissions: null, "study-material": null, quizzes: null, discussions: null, "online-classes": null });
  });

  it("the School Admin reads homework and progress, and runs Homework Settings", async () => {
    const s = await scopeOf(people.admin);
    expect(s.modes).toMatchObject({ homework: "view", "learning-progress": "view", settings: "edit", submissions: null, quizzes: null });
  });

  it("the Vice Principal reads every teaching page but works on none", async () => {
    const s = await scopeOf(people.vp);
    expect(s.modes).toMatchObject({ homework: "view", submissions: "view", "study-material": "view", quizzes: "view", discussions: "view", "online-classes": "view" });
  });

  it("a teacher works on every teaching page but not Settings; a student has only their own pages", async () => {
    const t = await scopeOf(people.teacher);
    expect(t.level).toBe("own");
    expect(t.modes).toMatchObject({ homework: "edit", submissions: "edit", quizzes: "edit", settings: null });
    const st = await scopeOf(people.student);
    expect(st.level).toBe("student");
    expect(st.student?.id).toBe(students5a[0]);
    expect(st.modes).toMatchObject({ homework: "edit", submissions: null, "learning-progress": null, settings: null });
  });
});

describe("a subject teacher works only with their own classes and subjects", () => {
  it("gives Mathematics to 5 A, with one submission per student, and cannot give English to 5 A or Mathematics to 6 A", async () => {
    const r = await asScope(people.teacher, (tx, s) => giveHomework(tx, s, give(f.s5a.id, "MAT"), today));
    expect(r.made).toHaveLength(1);
    expect(r.made[0].students).toBe(3);
    await expect(asScope(people.teacher, (tx, s) => giveHomework(tx, s, give(f.s5a.id, "ENG"), today))).rejects.toThrow(/do not teach/i);
    await expect(asScope(people.teacher, (tx, s) => giveHomework(tx, s, give(f.s6a.id, "MAT"), today))).rejects.toThrow(/your classes/i);
  });

  it("cannot mark another teacher's homework, even as class teacher of the section", async () => {
    const english = await f.currentFor((await makeUser({ schools: [{ id: f.school.id, roleKeys: ["teacher"] }] })).id);
    await f.run((tx) => tx.staff.update({ where: { id: f.staff[1].id }, data: { userLoginId: english.ctx.userId } }));
    const eng = await asScope(english, (tx, s) => giveHomework(tx, s, give(f.s5a.id, "ENG"), today));
    const sub = await f.run((tx) => tx.submission.findFirstOrThrow({ where: { homeworkId: eng.made[0].id } }));
    const s = await scopeOf(people.teacher);
    // The class teacher reads every subject of 5 A, but the English teacher marks English.
    expect(mayRead(s, { sectionId: f.s5a.id, subjectId: f.subjects.ENG })).toBe(true);
    await expect(asScope(people.teacher, (tx, sc) => gradeSubmission(tx, sc, sub.id, { result: "COMPLETE", score: "5", grade: "", feedback: "", allowResubmit: false, resubmitUntil: null }, today))).rejects.toThrow(/Only the teacher/i);
  });

  it("refuses a score above the homework's maximum marks", async () => {
    const r = await asScope(people.teacher, (tx, s) => giveHomework(tx, s, give(f.s5a.id, "MAT"), today));
    const sub = await f.run((tx) => tx.submission.findFirstOrThrow({ where: { homeworkId: r.made[0].id } }));
    await expect(asScope(people.teacher, (tx, s) => gradeSubmission(tx, s, sub.id, { result: "COMPLETE", score: "25", grade: "", feedback: "", allowResubmit: false, resubmitUntil: null }, today))).rejects.toThrow(/20/);
    const ok = await asScope(people.teacher, (tx, s) => gradeSubmission(tx, s, sub.id, { result: "COMPLETE", score: "18", grade: "", feedback: "Good", allowResubmit: false, resubmitUntil: null }, today));
    expect(ok).toMatchObject({ status: "GRADED", score: 18, grade: "A" });
  });
});

describe("leaders watch and remind; they do no desk work", () => {
  it("the Principal and Vice Principal cannot give homework, mark work or make a quiz", async () => {
    for (const c of [people.principal, people.vp]) {
      await expect(asScope(c, (tx, s) => giveHomework(tx, s, give(f.s5a.id, "MAT"), today))).rejects.toThrow(/reads this page|subject teacher/i);
    }
    const quiz = { sectionId: f.s5a.id, subjectId: f.subjects.MAT, title: "Sneaky", questions: [], opensAt: new Date(), closesAt: day(3), timeLimitMin: null, attemptsAllowed: 1, showAnswers: true };
    await expect(asScope(people.vp, (tx, s) => createQuiz(tx, s, quiz, false, new Date(), today))).rejects.toThrow(/reads this page|subject teacher/i);
    await expect(asScope(people.principal, (tx, s) => createQuiz(tx, s, quiz, false, new Date(), today))).rejects.toThrow(/does not include/i);
    const sub = await f.run((tx) => tx.submission.findFirstOrThrow({ where: { homework: { sectionId: f.s5a.id, subjectId: f.subjects.MAT } } }));
    await expect(asScope(people.principal, (tx, s) => gradeSubmission(tx, s, sub.id, { result: "COMPLETE", score: "5", grade: "", feedback: "", allowResubmit: false, resubmitUntil: null }, today))).rejects.toThrow();
  });

  it("the Principal reminds a teacher with work waiting, once a day; a teacher cannot remind", async () => {
    const hw = await f.run((tx) => tx.homework.findFirstOrThrow({ where: { sectionId: f.s5a.id, subjectId: f.subjects.MAT, archivedAt: null } }));
    await f.run((tx) => tx.submission.updateMany({ where: { homeworkId: hw.id, status: "ASSIGNED" }, data: { status: "SUBMITTED", submittedAt: new Date() } }));
    const r = await asScope(people.principal, (tx, s) => remindTeacher(tx, s, f.staff[0].id, today, "Asia/Kolkata"));
    expect(r.waiting).toBeGreaterThan(0);
    await expect(asScope(people.principal, (tx, s) => remindTeacher(tx, s, f.staff[0].id, today, "Asia/Kolkata"))).rejects.toThrow(/already reminded/i);
    as(people.teacher);
    expect(await remindTeacherAction(f.staff[0].id)).toMatch(/Only the Principal/i);
  });

  it("Homework Settings: the Principal is refused by the server; the School Admin saves, and it is audited", async () => {
    as(people.principal);
    const refused = await saveSettingsAction(null, form({ section: "Late marking", graceMinutes: "30", missingOn: "on" }));
    expect(refused?.ok).toBe(false);
    expect(refused?.message).toMatch(/does not change/i);
    expect(await optionalPageAction(form({ feature: "homework-quizzes", on: "1" }))).toMatch(/does not change/i);
    as(people.teacher);
    expect(await optionalPageAction(form({ feature: "homework-quizzes", on: "1" }))).toMatch(/permission|cannot|role|does not change/i);
    as(people.admin);
    const saved = await saveSettingsAction(null, form({ section: "Late marking", graceMinutes: "30", missingOn: "on" }));
    expect(saved?.ok).toBe(true);
    const st = await f.run((tx) => homeworkSettings(tx, f.ctx));
    expect(st.graceMinutes).toBe(30);
    const audit = await f.run((tx) => tx.auditLogEntry.findFirst({ where: { recordType: "Homework Settings", action: "changed" }, orderBy: { at: "desc" } }));
    expect(audit?.after).toMatchObject({ section: "Late marking", graceMinutes: 30 });
    const bad = await saveSettingsAction(null, form({ section: "Grading", gradingShow: "both", defaultMaxMarks: "100", band0grade: "A", band0from: "80" }));
    expect(bad?.ok).toBe(false);
  });
});

describe("a student sees only their own work", () => {
  it("lists only homework given to their own section, and cannot give homework", async () => {
    await asScope(people.teacher, (tx, s) => giveHomework(tx, s, give(f.s5b.id, "MAT"), today));
    const { all: rows } = await asScope(people.student, (tx, s) => listHomework(tx, s, today));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.sectionId === f.s5a.id)).toBe(true);
    await expect(asScope(people.student, (tx, s) => giveHomework(tx, s, give(f.s5a.id, "MAT"), today))).rejects.toThrow();
    const s = await scopeOf(people.student);
    expect(mayRead(s, { sectionId: f.s6a.id, subjectId: f.subjects.MAT })).toBe(false);
    expect(student6a).toBeTruthy();
  });

  it("a homework's details show a student only their own submission, not the class's (ACADEMICS-18)", async () => {
    const r = await asScope(people.teacher, (tx, s) => giveHomework(tx, s, give(f.s5a.id, "MAT"), today));
    const id = r.made[0].id;
    const teacherView = await asScope(people.teacher, (tx, s) => homeworkDetail(tx, s, id, today));
    expect(teacherView!.subs.length).toBe(3);
    const studentView = await asScope(people.student, (tx, s) => homeworkDetail(tx, s, id, today));
    expect(studentView!.subs.map((x) => x.studentId)).toEqual([students5a[0]]);
  });
});
