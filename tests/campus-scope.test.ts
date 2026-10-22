// One campus (00-global.md §5, 05-roles.md, 20-settings.md Users & Permissions):
// a login whose School Access has the scope "One campus" sees and changes only
// that campus's students, staff, fees, classes and the work in them, in every
// list, search, export, report and action. A whole-school login sees both.
// This is a limit inside one school, kept by the app (row-level security keeps
// schools apart, tests/isolation.test.ts).
//
// The school also has two campuses whose school years start on different dates
// (main campus 1 April, North campus 1 June): each campus's work uses its own
// year, and the second campus is never read from or written into the other's.
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

import { withSchool, type SchoolContext, type Tx } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { currentEnrolments, currentYears, studentYear, yearsFor } from "@/lib/academic/years";
import { personCampusId } from "@/lib/campus";
import { loadVisibleStudent, studentScope, visibleStudentIds } from "@/lib/students/access";
import { findStudents } from "@/lib/students/find";
import { changeSection } from "@/lib/students/students";
import { reportIncident } from "@/lib/students/behaviour";
import { canChangeStaff, canOpenStaff, staffScope, viewerFor } from "@/lib/staff/access";
import { canSeeStudent, feeViewer, studentScope as feeStudentScope } from "@/lib/fees/access";
import { attendanceAccess, registerSections } from "@/lib/attendance/access";
import { examScope, seesSection, writesReportCards } from "@/lib/exams/scope";
import { academicScope } from "@/lib/academic/scope";
import { pageYear } from "@/lib/academic/page-campus";
import { homeworkScope, mayRead } from "@/lib/homework/scope";
import { readFilters } from "@/lib/reports/filters";
import { approvalsFor, decide } from "@/lib/approvals";
import { reachSections } from "@/lib/reports/run";
import { readListParams } from "@/lib/list";
import { getStudentSettings } from "@/lib/students/settings";
import { classTiles, LIST_FILTERS, sectionOptions, studentListInclude, studentListWhere } from "@/app/(school)/student-management/_lib/queries";
import { addStudent as addStudentAction, changeSectionAction } from "@/app/(school)/student-management/_actions/students";
import { GET as searchGet } from "@/app/api/v1/search/route";
import { GET as studentExport } from "@/app/(school)/student-management/export/route";
import { sectionsForCurrentYears } from "@/lib/academic";
import { setupSteps } from "@/lib/dashboard/setup";
import { addHostel, currentFeePlans, saveFeePlan } from "@/lib/hostel/settings";
import { addRoom } from "@/lib/hostel/rooms";
import { allocate } from "@/lib/hostel/allocation";
import { genderFits } from "@/lib/hostel/words";
import { currentEnrolment } from "@/lib/academic/years";
import { studentRecord } from "@/lib/documents/records";
import { searchStudents as pickupSearch } from "@/lib/front-office/pickup";
import { searchCounterStudents } from "@/lib/inventory/lookup";
import { searchMembers } from "@/lib/library/members";
import { librarySettings } from "@/lib/library/settings";
import { makeSchool, makeUser } from "./helpers";
import { addStudent } from "./students/fixtures";

const day = (s: string) => new Date(`${s}T00:00:00Z`);

let school: Awaited<ReturnType<typeof makeSchool>>;
let ctx: SchoolContext;
const run = <T>(fn: (tx: Tx) => Promise<T>) => withSchool(ctx, fn, { timeout: 60_000 });
let main: { campusId: string; yearId: string; classId: string; sectionId: string; staffId: string; studentId: string };
let north: { campusId: string; yearId: string; classId: string; sectionId: string; sectionB: string; staffId: string; studentId: string };
let users: { admin: string; northAdmin: string; accountant: string; northAccountant: string; northTeacher: string };
let cur: Record<keyof typeof users, Current>;

async function currentFor(userId: string): Promise<Current> {
  const access = await accessIn(userId, school.id);
  return { ...access!, ctx: { schoolId: school.id, userId }, user: { id: userId, displayName: "Test" }, menu: [], schools: [], session: null, support: null } as unknown as Current;
}

beforeAll(async () => {
  school = await makeSchool("Two Campus School");
  const make = (roleKeys: string[], name: string) => makeUser({ schools: [{ id: school.id, roleKeys }], name });
  users = {
    admin: (await make(["school-admin"], "Whole Admin")).id,
    northAdmin: (await make(["school-admin"], "North Admin")).id,
    accountant: (await make(["accountant"], "Whole Accountant")).id,
    northAccountant: (await make(["accountant"], "North Accountant")).id,
    northTeacher: (await make(["class-teacher"], "North Teacher")).id,
  };
  ctx = { schoolId: school.id, userId: users.admin };
  const sid = school.id;
  const made = await run(async (tx) => {
    const mainCampus = school.campus.id;
    const northCampus = (await tx.campus.create({ data: { schoolId: sid, name: "North Campus" } })).id;
    // The main campus's year starts in April; North's in June, so "the newest year" alone is North's.
    const mainYear = await tx.academicYear.create({ data: { schoolId: sid, campusId: mainCampus, name: "2026-27", startDate: day("2026-04-01"), endDate: day("2027-03-31"), status: "ACTIVE" } });
    const northYear = await tx.academicYear.create({ data: { schoolId: sid, campusId: northCampus, name: "2026-27", startDate: day("2026-06-01"), endDate: day("2027-05-31"), status: "ACTIVE" } });
    const staff = (campusId: string, name: string, userLoginId?: string) => tx.staff.create({ data: { schoolId: sid, campusId, staffCode: `S-${randomUUID().slice(0, 6)}`, firstName: name.split(" ")[0], lastName: name.split(" ")[1], fullName: name, phone: `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`, designation: "Teacher", staffType: "Teaching", joiningDate: day("2020-06-01"), userLoginId } });
    const mainStaff = await staff(mainCampus, "Meena Main");
    const northStaff = await staff(northCampus, "Naveen North", users.northTeacher);
    const mainClass = await tx.schoolClass.create({ data: { schoolId: sid, campusId: mainCampus, name: "Class 5", sortOrder: 5 } });
    const northClass = await tx.schoolClass.create({ data: { schoolId: sid, campusId: northCampus, name: "Class 5", sortOrder: 5 } });
    const mainSec = await tx.section.create({ data: { schoolId: sid, classId: mainClass.id, academicYearId: mainYear.id, name: "A", seats: 40 } });
    const northSec = await tx.section.create({ data: { schoolId: sid, classId: northClass.id, academicYearId: northYear.id, name: "A", seats: 40, classTeacherId: northStaff.id } });
    const northSecB = await tx.section.create({ data: { schoolId: sid, classId: northClass.id, academicYearId: northYear.id, name: "B", seats: 40 } });
    // "One campus" for the North logins (Settings, Users & Permissions).
    await tx.schoolAccess.updateMany({ where: { schoolId: sid, userLoginId: { in: [users.northAdmin, users.northAccountant] } }, data: { scope: "CAMPUS", campusId: northCampus } });
    return { mainCampus, northCampus, mainYear: mainYear.id, northYear: northYear.id, mainClass: mainClass.id, northClass: northClass.id, mainSec: mainSec.id, northSec: northSec.id, northSecB: northSecB.id, mainStaff: mainStaff.id, northStaff: northStaff.id };
  });
  const mainStudent = await addStudent(ctx, made.mainSec, { fullName: "Mohan Kumar", applyFeePlan: false });
  const northStudent = await addStudent(ctx, made.northSec, { fullName: "Neha Kumar", applyFeePlan: false });
  main = { campusId: made.mainCampus, yearId: made.mainYear, classId: made.mainClass, sectionId: made.mainSec, staffId: made.mainStaff, studentId: mainStudent.student.id };
  north = { campusId: made.northCampus, yearId: made.northYear, classId: made.northClass, sectionId: made.northSec, sectionB: made.northSecB, staffId: made.northStaff, studentId: northStudent.student.id };
  cur = Object.fromEntries(await Promise.all(Object.entries(users).map(async ([k, id]) => [k, await currentFor(id)]))) as Record<keyof typeof users, Current>;
}, 180_000);

describe("a login limited to one campus", () => {
  it("is loaded with its campus; a whole-school login has none", () => {
    expect(cur.northAdmin.scope).toBe("CAMPUS");
    expect(cur.northAdmin.campusId).toBe(north.campusId);
    expect(cur.admin.campusId).toBeNull();
  });

  it("sees and opens only its campus's students; the whole school sees both", async () => {
    await expect(run((tx) => loadVisibleStudent(tx, cur.northAdmin, main.studentId))).rejects.toThrow("not found");
    expect((await run((tx) => loadVisibleStudent(tx, cur.northAdmin, north.studentId))).id).toBe(north.studentId);
    expect((await run((tx) => loadVisibleStudent(tx, cur.admin, main.studentId))).id).toBe(main.studentId);
    expect(await run((tx) => visibleStudentIds(tx, cur.northAdmin))).toEqual([north.studentId]);
    expect(await run((tx) => visibleStudentIds(tx, cur.admin))).toBeNull();

    const listed = async (c: Current) => run(async (tx) => {
      const settings = await getStudentSettings(tx, ctx);
      const yearIds = (await yearsFor(tx, ctx, c.campusId)).map((y) => y.id);
      const where = await studentListWhere(tx, c, readListParams({}, LIST_FILTERS), yearIds, null, settings);
      return (await tx.student.findMany({ where, select: { id: true } })).map((s) => s.id).sort();
    });
    expect(await listed(cur.northAdmin)).toEqual([north.studentId]);
    expect(await listed(cur.admin)).toEqual([main.studentId, north.studentId].sort());
  });

  it("finds only its campus's students in the one student search", async () => {
    const names = async (c: Current) => run(async (tx) => (await findStudents(tx, "Kumar", { scope: await studentScope(tx, c), yearId: null, statuses: "any" })).map((h) => h.name).sort());
    expect(await names(cur.northAdmin)).toEqual(["Neha Kumar"]);
    expect(await names(cur.admin)).toEqual(["Mohan Kumar", "Neha Kumar"]);
  });

  it("gets only its campus's sections and classes to choose from", async () => {
    const yearsOf = async (c: Current) => run(async (tx) => (await yearsFor(tx, ctx, c.campusId)).map((y) => y.id));
    const north_ = await run(async (tx) => sectionOptions(tx, cur.northAdmin, await yearsOf(cur.northAdmin)));
    expect(north_.map((s) => s.value).sort()).toEqual([north.sectionId, north.sectionB].sort());
    const all = await run(async (tx) => sectionOptions(tx, cur.admin, await yearsOf(cur.admin)));
    expect(all).toHaveLength(3);
    // Two campuses in one list: each class is named with its campus.
    expect(all.map((s) => s.label)).toContain("North Campus · Class 5 A");
  });

  it("opens and changes only its campus's staff (and always its own record)", async () => {
    const v = await run((tx) => viewerFor(tx, ctx, cur.northAdmin));
    expect(canOpenStaff(v, main.staffId)).toBe(false);
    expect(canChangeStaff(v, main.staffId)).toBe(false);
    expect(canOpenStaff(v, north.staffId)).toBe(true);
    const listed = await run((tx) => tx.staff.findMany({ where: staffScope(v), select: { id: true } }));
    expect(listed.map((s) => s.id)).toEqual([north.staffId]);
    const whole = await run((tx) => viewerFor(tx, ctx, cur.admin));
    expect(canOpenStaff(whole, main.staffId)).toBe(true);
    expect((await run((tx) => tx.staff.findMany({ where: staffScope(whole), select: { id: true } }))).length).toBe(2);
  });

  it("sees only its campus's students' fees", async () => {
    const v = await run((tx) => feeViewer(tx, ctx, cur.northAccountant));
    expect(v.campusId).toBe(north.campusId);
    expect(await run((tx) => canSeeStudent(tx, v, main.studentId))).toBe(false);
    expect(await run((tx) => canSeeStudent(tx, v, north.studentId))).toBe(true);
    expect((await run((tx) => tx.student.findMany({ where: feeStudentScope(v), select: { id: true } }))).map((s) => s.id)).toEqual([north.studentId]);
    const whole = await run((tx) => feeViewer(tx, ctx, cur.accountant));
    expect(await run((tx) => canSeeStudent(tx, whole, main.studentId))).toBe(true);
    expect(whole.yearIds.sort()).toEqual([main.yearId, north.yearId].sort());
  });

  it("opens only its campus's attendance registers", async () => {
    const a = await run((tx) => attendanceAccess(tx, ctx, cur.northAdmin));
    const sections = registerSections(a);
    expect(sections === "all" ? sections : [...sections].sort()).toEqual([north.sectionId, north.sectionB].sort());
    expect(registerSections(await run((tx) => attendanceAccess(tx, ctx, cur.admin)))).toBe("all");
  });

  it("works only in its campus's classes in Examination & Results, Academic Management and Homework", async () => {
    const exams = await run((tx) => examScope(tx, cur.northAdmin, north.yearId));
    expect(exams.sectionIds?.sort()).toEqual([north.sectionId, north.sectionB].sort());
    expect(seesSection(exams, main.sectionId)).toBe(false);
    expect(writesReportCards(exams, main.sectionId)).toBe(false);
    expect(writesReportCards(exams, north.sectionId)).toBe(true);
    expect((await run((tx) => examScope(tx, cur.admin, main.yearId))).sectionIds).toBeNull();

    expect((await run((tx) => academicScope(tx, cur.northAdmin, north.yearId))).sectionIds?.sort()).toEqual([north.sectionId, north.sectionB].sort());
    // A page address naming the main campus's year still opens North's for them.
    const page = await run((tx) => pageYear(tx, ctx, cur.northAdmin, main.yearId));
    expect(page).toMatchObject({ campusId: north.campusId, year: { id: north.yearId } });
    expect((await run((tx) => pageYear(tx, ctx, cur.admin, main.yearId))).campusId).toBe(main.campusId);

    const hw = await run((tx) => homeworkScope(tx, cur.northAdmin, day("2026-10-01")));
    expect(mayRead(hw, { sectionId: main.sectionId, subjectId: randomUUID() })).toBe(false);
    expect(mayRead(hw, { sectionId: north.sectionId, subjectId: randomUUID() })).toBe(true);
  });

  it("finds only its campus's students, parents and staff in the Search box", async () => {
    const search = async (c: Current, q: string) => {
      who.current = c;
      return (await searchGet(new Request(`http://school.test/api/v1/search?q=${encodeURIComponent(q)}`))).json() as Promise<{ students: { name: string }[]; staff: { name: string }[] }>;
    };
    expect((await search(cur.northAdmin, "Kumar")).students.map((s) => s.name)).toEqual(["Neha Kumar"]);
    expect((await search(cur.admin, "Kumar")).students.map((s) => s.name).sort()).toEqual(["Mohan Kumar", "Neha Kumar"]);
    expect((await search(cur.northAdmin, "Meena")).staff).toEqual([]);
    expect((await search(cur.northAdmin, "Naveen")).staff.map((s) => s.name)).toEqual(["Naveen North"]);
  });

  it("exports only its campus's students", async () => {
    const exported = async (c: Current) => {
      who.current = c;
      const res = await studentExport(new Request("http://school.test/student-management/export?format=csv&f=name"));
      expect(res.status).toBe(200);
      return res.text();
    };
    const north_ = await exported(cur.northAdmin);
    expect(north_).toContain("Neha Kumar");
    expect(north_).not.toContain("Mohan Kumar");
    const all = await exported(cur.admin);
    expect(all).toContain("Neha Kumar");
    expect(all).toContain("Mohan Kumar");
  });

  it("reads reports for its own campus only, whatever the page address says", async () => {
    const setup = { timeZone: "Asia/Kolkata", weekStart: "monday" as const, calendar: { yearStart: day("2026-04-01"), yearEnd: day("2027-03-31"), fyStart: day("2026-04-01"), fyEnd: day("2027-03-31") } } as unknown as Parameters<typeof readFilters>[4];
    const entry = { dated: false, money: false };
    const f = await run((tx) => readFilters(tx, ctx, entry, { campus: main.campusId, year: main.yearId }, setup, day("2026-10-01"), cur.northAdmin.campusId ?? null));
    expect(f.campusId).toBe(north.campusId);
    expect(f.year?.id).toBe(north.yearId);
    const sections = await run((tx) => reachSections(tx, ctx, false, f.year!.id, north.campusId));
    expect(sections?.sort()).toEqual([north.sectionId, north.sectionB].sort());
    // The whole school may choose a campus.
    const g = await run((tx) => readFilters(tx, ctx, entry, { campus: main.campusId }, setup, day("2026-10-01"), null));
    expect(g.campusId).toBe(main.campusId);
    expect(g.year?.id).toBe(main.yearId);
  });

  it("sees and decides only requests about its campus's records in Approvals", async () => {
    const ask = (studentId: string) => run((tx) => tx.approval.create({ data: { schoolId: school.id, type: "re-admission", recordType: "Student", recordId: studentId, summary: "Re-admission", askedById: users.northTeacher, currentApproverRole: "school-admin" } }));
    const mainAsk = await ask(main.studentId);
    const northAsk = await ask(north.studentId);
    const waiting = async (c: Current) => run(async (tx) => (await tx.approval.findMany({ where: await approvalsFor(tx, c.ctx, c.roles.map((r) => r.key)), select: { id: true } })).map((a) => a.id));
    const forNorth = await waiting(cur.northAdmin);
    expect(forNorth).toContain(northAsk.id);
    expect(forNorth).not.toContain(mainAsk.id);
    expect(await waiting(cur.admin)).toEqual(expect.arrayContaining([mainAsk.id, northAsk.id]));
    await expect(withSchool(cur.northAdmin.ctx, (tx) => decide(tx, cur.northAdmin.ctx, mainAsk.id, "approve", null))).rejects.toThrow("This request was not found.");
  });

  it("finds only its campus's students at the gate, the store counter and the library desk", async () => {
    const names = (rows: { name: string }[]) => rows.map((r) => r.name).sort();
    expect(names(await run((tx) => pickupSearch(tx, ctx, "Kumar", 8, cur.northAdmin)))).toEqual(["Neha Kumar"]);
    expect(names(await run((tx) => pickupSearch(tx, ctx, "Kumar", 8, cur.admin)))).toEqual(["Mohan Kumar", "Neha Kumar"]);
    expect(names(await run((tx) => searchCounterStudents(tx, ctx, "Kumar", 8, cur.northAdmin)))).toEqual(["Neha Kumar"]);
    const members = async (c: Current, q: string) => run(async (tx) => (await searchMembers(tx, ctx, await librarySettings(tx, ctx), q, 8, c)).map((m) => m.name).sort());
    expect(await members(cur.northAdmin, "Kumar")).toEqual(["Neha Kumar"]);
    expect(await members(cur.admin, "Kumar")).toEqual(["Mohan Kumar", "Neha Kumar"]);
    expect(await members(cur.northAdmin, "Meena")).toEqual([]);
  });

  it("cannot add a student to another campus's class or move one it cannot see", async () => {
    who.current = cur.northAdmin;
    const fd = new FormData();
    for (const [k, v] of Object.entries({ fullName: "Other Campus Child", sectionId: main.sectionId, dateOfBirth: "2016-05-05", gender: "Female", guardianName: "Some Parent", guardianRelation: "Father", guardianPhone: "9812345670", admissionDate: "2026-06-10", rollNo: "", bloodGroup: "", category: "", aadhaar: "", religion: "", motherTongue: "", address: "", previousSchool: "", admissionNo: "", duplicateReason: "" })) fd.set(k, v);
    const r = await addStudentAction({ ok: true }, fd);
    expect(r?.ok).toBe(false);
    expect(r?.message).toContain("your campus");
    expect(await run((tx) => tx.student.count({ where: { fullName: "Other Campus Child" } }))).toBe(0);

    const move = new FormData();
    move.set("sectionId", main.sectionId);
    const m = await changeSectionAction(main.studentId, { ok: true }, move);
    expect(m?.ok).toBe(false);
    expect(m?.message).toContain("not found");
  });
});

describe("two campuses whose school years start on different dates", () => {
  it("keeps one current year for each campus", async () => {
    const ids = (await run((tx) => currentYears(tx, ctx))).map((y) => y.id).sort();
    expect(ids).toEqual([main.yearId, north.yearId].sort());
    expect((await run((tx) => studentYear(tx, ctx, main.studentId)))?.id).toBe(main.yearId);
    expect((await run((tx) => studentYear(tx, ctx, north.studentId)))?.id).toBe(north.yearId);
    // A person's own campus: the one they are limited to, else their Staff record's, else the main campus.
    expect(await run((tx) => personCampusId(tx, { schoolId: school.id, userId: users.northTeacher }, cur.northTeacher))).toBe(north.campusId);
    expect(await run((tx) => personCampusId(tx, ctx, cur.admin))).toBe(main.campusId);
  });

  it("gives each student this year's class from their own campus's year, even after next year's class is made", async () => {
    // North's next year is set up and the North student is already placed in it (promotion made early).
    await run(async (tx) => {
      const next = await tx.academicYear.create({ data: { schoolId: school.id, campusId: north.campusId, name: "2027-28", startDate: day("2027-06-01"), endDate: day("2028-05-31"), status: "UPCOMING" } });
      const sec = await tx.section.create({ data: { schoolId: school.id, classId: north.classId, academicYearId: next.id, name: "C", seats: 40 } });
      await tx.enrolment.create({ data: { schoolId: school.id, studentId: north.studentId, academicYearId: next.id, classId: north.classId, sectionId: sec.id } });
    });
    const current = await run((tx) => currentEnrolments(tx, [main.studentId, north.studentId]));
    expect(current.get(main.studentId)?.academicYearId).toBe(main.yearId);
    expect(current.get(north.studentId)?.academicYearId).toBe(north.yearId);
    // Documents (bonafide, TC...) print this year's class, not the enrolment made last.
    expect((await run((tx) => currentEnrolment(tx, north.studentId)))?.sectionId).toBe(north.sectionId);
    const doc = await run((tx) => studentRecord(tx, ctx, north.studentId));
    expect(doc?.fields).toMatchObject({ class_section: "Class 5 A", academic_year: "2026-27" });
  });

  it("puts each new student in their own campus's year", async () => {
    const enrol = await run((tx) => tx.enrolment.findMany({ where: { studentId: { in: [main.studentId, north.studentId] } }, select: { studentId: true, academicYearId: true } }));
    expect(enrol.some((e) => e.studentId === main.studentId && e.academicYearId === main.yearId)).toBe(true);
    expect(enrol.some((e) => e.studentId === north.studentId && e.academicYearId === north.yearId)).toBe(true);
    expect(enrol.some((e) => e.studentId === north.studentId && e.academicYearId === main.yearId)).toBe(false);
  });

  it("changes the section of a student on the campus whose year started later", async () => {
    const extra = await addStudent(ctx, main.sectionId, { fullName: "Main Mover", applyFeePlan: false });
    expect(extra.student.campusId).toBe(main.campusId);
    const moved = await run((tx) => changeSection(tx, ctx, north.studentId, north.sectionB, "Smaller class"));
    expect(moved).toBeTruthy();
    const e = await run((tx) => tx.enrolment.findFirstOrThrow({ where: { studentId: north.studentId, academicYearId: north.yearId } }));
    expect(e.sectionId).toBe(north.sectionB);
    await run((tx) => changeSection(tx, ctx, north.studentId, north.sectionId, null));
  });

  it("records a behaviour incident in the student's own campus's year", async () => {
    const settings = await run((tx) => getStudentSettings(tx, ctx));
    const type = settings.incidentTypes[0];
    const inc = await run((tx) => reportIncident(tx, ctx, { studentIds: [main.studentId], typeKey: type.key, description: "Late to class twice", date: day("2026-07-01"), actionTaken: null, informParent: false, points: null, suspensionFrom: null, suspensionTo: null, approvedBy: "Principal", photoFileId: null }));
    expect(inc.academicYearId).toBe(main.yearId);
  });

  it("offers each campus's classes from its own year in the store, library and report class pickers", async () => {
    const all = await run((tx) => sectionsForCurrentYears(tx, ctx, null));
    expect(all.map((s) => s.id).sort()).toEqual([main.sectionId, north.sectionId, north.sectionB].sort());
    expect(all.map((s) => s.label)).toEqual(expect.arrayContaining(["Main Campus · Class 5 A", "North Campus · Class 5 A"]));
    const mine = await run((tx) => sectionsForCurrentYears(tx, ctx, north.campusId));
    expect(mine.map((s) => s.label).sort()).toEqual(["Class 5 A", "Class 5 B"]);
  });

  it("counts both campuses' classes in the setup steps", async () => {
    const steps = await run((tx) => setupSteps(tx, ctx, { permissions: cur.admin.permissions, modulesOn: new Set() }));
    expect(steps.find((s) => s.key === "classes")?.doneNote).toContain("3 sections");
  });

  it("gives a boarder a hostel fee plan of their own campus's year only", async () => {
    const student = await run((tx) => tx.student.findUniqueOrThrow({ where: { id: north.studentId } }));
    const made = await run(async (tx) => {
      const hostel = await addHostel(tx, ctx, { name: "Campus Hostel", gender: genderFits(student.gender) ?? "BOYS", floors: ["Ground"], note: null });
      await addRoom(tx, ctx, { hostelId: hostel.id, floor: "Ground", roomNo: "H-1", beds: 2, roomType: null });
      const plan = (yearId: string, name: string) => saveFeePlan(tx, ctx, null, { academicYearId: yearId, name, hostelId: null, roomType: null, includesMess: true, note: null, installments: [{ label: "Term 1", dueDate: day("2026-07-10"), amountPaise: BigInt(1000000) }] });
      const mainPlan = await plan(main.yearId, "Main plan");
      const northPlan = await plan(north.yearId, "North plan");
      const bed = await tx.hostelBed.findFirstOrThrow({ where: { room: { hostelId: hostel.id } } });
      return { mainPlan, northPlan, bed: bed.id };
    });
    // Both campuses' current plans are offered, each named with its campus.
    const plans = await run((tx) => currentFeePlans(tx, ctx));
    expect(plans.map((p) => [p.name, p.campusName]).sort()).toEqual([["Main plan", "Main Campus"], ["North plan", "North Campus"]]);
    const give = (feePlanId: string) => run((tx) => allocate(tx, ctx, { studentId: north.studentId, bedId: made.bed, startDate: day("2026-10-01"), checkedIn: false, feePlanId, note: null }, { now: new Date(), assertHostel: () => {} }));
    await expect(give(made.mainPlan)).rejects.toThrow("another campus");
    const ok = await give(made.northPlan);
    expect(ok.allocation.academicYearId).toBe(north.yearId);
    expect(ok.plan?.id).toBe(made.northPlan);
  });

  it("lists every campus's students with their own class for the whole school", async () => {
    const yearIds = (await run((tx) => yearsFor(tx, ctx, null))).map((y) => y.id);
    const rows = await run((tx) => tx.student.findMany({ where: { id: { in: [main.studentId, north.studentId] } }, include: studentListInclude(yearIds) }));
    for (const r of rows) expect(r.enrolments).toHaveLength(1);
    const tiles = await run((tx) => classTiles(tx, cur.admin, yearIds));
    expect(tiles.map((t) => t.name).sort()).toEqual(["Main Campus · Class 5", "North Campus · Class 5"].sort());
    // A login limited to North: North's year and classes only, without a campus name.
    const northTiles = await run(async (tx) => classTiles(tx, cur.northAdmin, (await yearsFor(tx, ctx, north.campusId)).map((y) => y.id)));
    expect(northTiles.map((t) => t.name)).toEqual(["Class 5"]);
  });
});
