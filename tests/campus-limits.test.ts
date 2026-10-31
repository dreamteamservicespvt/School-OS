// Security audit run-2, low findings (docs/qa/2026-10-31-security-audit-run-2.md
// section 4): paths that let a person reach records outside what they may
// touch inside one school. Most are the One-campus limit (00-global.md §5):
// a login whose School Access is "One campus" sees and changes only that
// campus's records, on detail pages, previews, files and undo too, not only in
// lists. tests/campus-scope.test.ts covers the lists and searches.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Current } from "@/lib/current";

const who = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/current", async (orig) => {
  const real = await orig<typeof import("@/lib/current")>();
  const { requirePermission } = await import("@/lib/permissions");
  const requireCurrent = async () => who.current as Current;
  return {
    ...real,
    getCurrent: async () => who.current as Current,
    requireCurrent,
    requirePage: async () => who.current as Current,
    requireAction: async (module: Parameters<typeof requirePermission>[1], action: Parameters<typeof requirePermission>[2]) => {
      const current = await requireCurrent();
      return { current, reach: requirePermission(current.permissions, module, action) };
    },
  };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers({ host: "school.test" }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

import { withSchool, type SchoolContext, type Tx } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { examScope } from "@/lib/exams/scope";
import { saveCompetencyLevels } from "@/lib/exams/report-cards";
import { makeSchool, makeUser } from "./helpers";
import { addStudent } from "./students/fixtures";

const day = (s: string) => new Date(`${s}T00:00:00Z`);

let school: Awaited<ReturnType<typeof makeSchool>>;
let ctx: SchoolContext;
const run = <T>(fn: (tx: Tx) => Promise<T>) => withSchool(ctx, fn, { timeout: 60_000 });
let main: { campusId: string; yearId: string; classId: string; sectionId: string; studentId: string };
let north: { campusId: string; yearId: string; classId: string; sectionId: string; sectionB: string; studentId: string; studentB: string };
let users: { admin: string; northAdmin: string };
let cur: Record<keyof typeof users, Current>;

async function currentFor(userId: string): Promise<Current> {
  const access = await accessIn(userId, school.id);
  return { ...access!, ctx: { schoolId: school.id, userId }, user: { id: userId, displayName: "Test" }, menu: [], schools: [], session: null, support: null } as unknown as Current;
}

beforeAll(async () => {
  school = await makeSchool("Two Campus Limits School");
  const make = (roleKeys: string[], name: string) => makeUser({ schools: [{ id: school.id, roleKeys }], name });
  users = {
    admin: (await make(["school-admin"], "Whole Admin")).id,
    northAdmin: (await make(["school-admin"], "North Admin")).id,
  };
  ctx = { schoolId: school.id, userId: users.admin };
  const sid = school.id;
  const made = await run(async (tx) => {
    const mainCampus = school.campus.id;
    const northCampus = (await tx.campus.create({ data: { schoolId: sid, name: "North Campus" } })).id;
    const mainYear = await tx.academicYear.create({ data: { schoolId: sid, campusId: mainCampus, name: "2026-27", startDate: day("2026-04-01"), endDate: day("2027-03-31"), status: "ACTIVE" } });
    const northYear = await tx.academicYear.create({ data: { schoolId: sid, campusId: northCampus, name: "2026-27", startDate: day("2026-06-01"), endDate: day("2027-05-31"), status: "ACTIVE" } });
    const mainClass = await tx.schoolClass.create({ data: { schoolId: sid, campusId: mainCampus, name: "Class 5", sortOrder: 5 } });
    const northClass = await tx.schoolClass.create({ data: { schoolId: sid, campusId: northCampus, name: "Class 5", sortOrder: 5 } });
    const mainSec = await tx.section.create({ data: { schoolId: sid, classId: mainClass.id, academicYearId: mainYear.id, name: "A", seats: 40 } });
    const northSec = await tx.section.create({ data: { schoolId: sid, classId: northClass.id, academicYearId: northYear.id, name: "A", seats: 40 } });
    const northSecB = await tx.section.create({ data: { schoolId: sid, classId: northClass.id, academicYearId: northYear.id, name: "B", seats: 40 } });
    await tx.schoolAccess.updateMany({ where: { schoolId: sid, userLoginId: users.northAdmin }, data: { scope: "CAMPUS", campusId: northCampus } });
    return { mainCampus, northCampus, mainYear: mainYear.id, northYear: northYear.id, mainClass: mainClass.id, northClass: northClass.id, mainSec: mainSec.id, northSec: northSec.id, northSecB: northSecB.id };
  });
  const mainStudent = await addStudent(ctx, made.mainSec, { fullName: "Mohan Kumar", applyFeePlan: false });
  const northStudent = await addStudent(ctx, made.northSec, { fullName: "Neha Kumar", applyFeePlan: false });
  const northStudentB = await addStudent(ctx, made.northSecB, { fullName: "Nikhil Rao", applyFeePlan: false });
  main = { campusId: made.mainCampus, yearId: made.mainYear, classId: made.mainClass, sectionId: made.mainSec, studentId: mainStudent.student.id };
  north = { campusId: made.northCampus, yearId: made.northYear, classId: made.northClass, sectionId: made.northSec, sectionB: made.northSecB, studentId: northStudent.student.id, studentB: northStudentB.student.id };
  cur = Object.fromEntries(await Promise.all(Object.entries(users).map(async ([k, id]) => [k, await currentFor(id)]))) as Record<keyof typeof users, Current>;
}, 240_000);

describe("competency levels are bound to the section's roster", () => {
  let competencyId: string;
  beforeAll(async () => {
    competencyId = await run(async (tx) => {
      const sid = school.id;
      const term = await tx.term.create({ data: { schoolId: sid, academicYearId: north.yearId, name: "Term 1", startDate: day("2026-06-01"), endDate: day("2026-11-30"), sortOrder: 1 } });
      const type = await tx.examType.create({ data: { schoolId: sid, name: "Half-yearly" } });
      await tx.exam.create({ data: { schoolId: sid, academicYearId: north.yearId, termId: term.id, examTypeId: type.id, title: "Half-yearly", startDate: day("2026-10-01"), endDate: day("2026-10-10"), classIds: [north.classId], status: "PUBLISHED" } });
      const subject = await tx.subject.create({ data: { schoolId: sid, name: "English", code: "ENG" } });
      return (await tx.competency.create({ data: { schoolId: sid, subjectId: subject.id, name: "Reads with understanding" } })).id;
    });
  });

  const save = (studentId: string) => run(async (tx) => {
    const scope = await examScope(tx, cur.northAdmin, north.yearId);
    return saveCompetencyLevels(tx, cur.northAdmin.ctx, scope, { sectionId: north.sectionId, period: "year", rows: [{ studentId, competencyId, level: "Proficient" }] });
  });
  const levelOf = (studentId: string) => run((tx) => tx.competencyLevel.findFirst({ where: { studentId, competencyId } }));

  it("saves a level for a student of the section", async () => {
    expect(await save(north.studentId)).toBe(1);
  });

  it("refuses a student of another section of the same campus", async () => {
    await expect(save(north.studentB)).rejects.toThrow(/Reload the page/);
    expect(await levelOf(north.studentB)).toBeNull();
  });

  it("refuses a student of another campus", async () => {
    await expect(save(main.studentId)).rejects.toThrow(/Reload the page/);
    expect(await levelOf(main.studentId)).toBeNull();
  });

  it("refuses a made-up student id", async () => {
    await expect(save(randomUUID())).rejects.toThrow(/Reload the page/);
  });
});

describe("certificate detail page keeps to the viewer's campus", () => {
  const certFor = (studentId: string) => run(async (tx) => (await tx.certificate.create({ data: { schoolId: school.id, studentId, type: "BONAFIDE", issueDate: day("2026-10-01"), verifyCode: randomUUID().slice(0, 12) } })).id);
  const open = async (as: Current, id: string) => {
    who.current = as;
    const { default: Page } = await import("@/app/(school)/student-management/certificates/[id]/page");
    return Page({ params: Promise.resolve({ id }) });
  };

  it("shows a certificate of the viewer's own campus", async () => {
    await expect(open(cur.northAdmin, await certFor(north.studentId))).resolves.toBeTruthy();
  });

  it("shows any campus's certificate to a whole-school viewer", async () => {
    await expect(open(cur.admin, await certFor(main.studentId))).resolves.toBeTruthy();
  });

  it("is not found for a certificate of another campus", async () => {
    await expect(open(cur.northAdmin, await certFor(main.studentId))).rejects.toThrow("NOT_FOUND");
  });
});
