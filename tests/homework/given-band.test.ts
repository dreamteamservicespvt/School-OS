// Homework: the first tile counts the homework given in the dates, the same rows "By teacher" lists
// under it, so the two always agree. Live test 17 Nov 2026 (Principal): the tile said "Current · this
// month: 0 · 0 students given homework in 0 classes" above "By teacher · Homework given · this month"
// with teachers at 3 and 1: the tile counted only homework not yet due, the list every homework given.
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));

import type { Current } from "@/lib/current";
import { todayIn } from "@/lib/academic/common";
import { homeworkScope } from "@/lib/homework/scope";
import * as homework from "@/lib/homework/homework";
import { byTeacher } from "@/lib/homework/overview";
import { homeworkSettings } from "@/lib/homework/settings";
import { makeUser } from "../helpers";
import { academicSchool } from "../academic/fixture";

const TZ = "Asia/Kolkata";
const today = todayIn(TZ);
const day = (n: number) => new Date(today.getTime() + n * 86_400_000);

let f: Awaited<ReturnType<typeof academicSchool>>;
let principal: Current, maths: Current, english: Current;

const give = (sectionId: string, code: string, due: number): homework.GiveInput => ({
  sectionId, subjectId: f.subjects[code], title: `Exercise ${code} ${randomUUID().slice(0, 4)}`, instructions: "Do questions 1 to 10", givenTo: "SECTION", studentIds: [],
  startDate: today, dueDate: day(due), maxMarks: 20, onlineSubmission: true, fromSuggestion: false, attachments: [],
});

beforeAll(async () => {
  f = await academicSchool();
  await f.run(async (tx) => {
    let n = 0;
    const add = async (sectionId: string, classId: string) => {
      n++;
      const st = await tx.student.create({ data: { schoolId: f.school.id, campusId: f.campusId, admissionNo: `GB-${n}-${randomUUID().slice(0, 4)}`, firstName: `Kid${n}`, lastName: "Test", fullName: `Kid${n} Test`, status: "ACTIVE" } });
      await tx.enrolment.create({ data: { schoolId: f.school.id, studentId: st.id, academicYearId: f.year.id, classId, sectionId, rollNo: n } });
    };
    await add(f.s5a.id, f.c5.id); await add(f.s5a.id, f.c5.id); await add(f.s5b.id, f.c5.id);
    await homeworkSettings(tx, f.ctx);
  });
  principal = await f.currentFor(f.principal.id);
  maths = await f.currentFor(f.teacherUser.id);
  english = await f.currentFor((await makeUser({ schools: [{ id: f.school.id, roleKeys: ["teacher"] }] })).id);
  await f.run((tx) => tx.staff.update({ where: { id: f.staff[1].id }, data: { userLoginId: english.ctx.userId } }));
  // The Mathematics teacher gives 3 (two to 5 A, one to 5 B), the English teacher 1 (5 A): due in 2 or 3 days.
  const as = (c: Current, input: homework.GiveInput) => f.run(async (tx) => homework.giveHomework(tx, await homeworkScope(tx, c, today), input, today));
  await as(maths, give(f.s5a.id, "MAT", 2));
  await as(maths, give(f.s5a.id, "MAT", 2));
  await as(maths, give(f.s5b.id, "MAT", 3));
  await as(english, give(f.s5a.id, "ENG", 2));
}, 180_000);

/** What the Homework page reads for the dates, as one person on one day: the band and "By teacher". */
const page = (who: Current, on: Date) => f.run(async (tx) => {
  const s = await homeworkScope(tx, who, on);
  const { all } = await homework.listHomework(tx, s, on);
  const band = homework.homeworkBand(all, s);
  const lines = s.level === "full" ? (await byTeacher(tx, all, s, on, TZ)).lines : [];
  return { all, band, given: lines.map((l) => l.given) };
});

describe("Homework: the first tile and By teacher count the same homework", () => {
  it("while the homework is not yet due: 4 given, 4 current, By teacher 3 and 1", async () => {
    const p = await page(principal, today);
    expect(p.given).toEqual([3, 1]);
    expect(p.band.given.given).toBe(4);
    expect(p.band.current.given).toBe(4);
  });

  it("after the due dates: still 4 given (By teacher 3 and 1), none current, never '0 students given homework in 0 classes'", async () => {
    const p = await page(principal, day(6));
    // Past the due date with nothing waiting to be checked, homework is Closed: none of the 4 is Current.
    expect(p.all.map((r) => r.status)).toEqual(["Closed", "Closed", "Closed", "Closed"]);
    expect(p.given).toEqual([3, 1]);
    expect(p.band.given.given).toBe(p.given.reduce((a, b) => a + b, 0));
    // 5 A has 2 students (three homework), 5 B has 1 (one homework): 2 + 2 + 2 + 1, in 2 classes.
    expect({ assigned: p.band.given.assigned, classes: p.band.given.classes }).toEqual({ assigned: 7, classes: 2 });
    expect(p.band.current).toMatchObject({ given: 0, assigned: 0, classes: 0 });
  });

  it("a teacher's own band counts their own homework, not the other subjects of their class", async () => {
    const p = await page(maths, day(6));
    expect(p.band.given.given).toBe(3);
    expect(p.band.current.given).toBe(0);
  });

  it("the Homework page shows that band: 'Homework given' for the dates, and says 'current' where a tile counts only current work", () => {
    const src = readFileSync("src/app/(school)/homework-learning/page.tsx", "utf8");
    expect(src).toMatch(/homeworkBand\(inP, s\)/);
    expect(src).toMatch(/label: `\$\{tr\("Homework given"\)\} · \$\{perWords\.toLowerCase\(\)\}`, big: String\(band\.given\.given\)/);
    expect(src).not.toMatch(/label: `\$\{tr\("Current"\)\} · /);
  });
});
