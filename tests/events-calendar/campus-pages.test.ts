// The Events pages in a school whose two campuses run overlapping years (as in
// campus-year.test.ts: the main year runs 1 Apr to 31 Mar, North's 1 Jun to
// 30 Apr, so 15 Oct falls in both). The pages picked "this year" by date alone,
// so they showed one campus's year, whichever the database listed first, and a
// person kept to one campus saw every campus's achievements. Now a page works
// in each campus's year on the day (evYears), and a person kept to one campus
// in theirs only.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { saveEventsSettings } from "@/lib/events/settings";
import { evYears } from "@/lib/events/campus";
import { assignHouses, leaderboard, recordAchievements, saveHouse } from "@/lib/events/cocurricular";
import { preSectionsIn } from "@/lib/events/daily";
import { achievementList, pickStudents } from "@/app/(school)/events-calendar/_lib/co";
import { TODAY, as, day, makeEventsSchool, type EvFixture } from "./fixture";

let f: EvFixture;
let north: { campusId: string; yearId: string; nehaId: string };
let houseId = "";

beforeAll(async () => {
  f = await makeEventsSchool("Two Campus Pages School");
  const sid = f.school.id;
  north = await withSchool(as(f, null), async (tx) => {
    const campus = await tx.campus.create({ data: { schoolId: sid, name: "North Campus" } });
    const year = await tx.academicYear.create({ data: { schoolId: sid, campusId: campus.id, name: "2026-27 North", startDate: day("2026-06-01"), endDate: day("2027-04-30"), status: "ACTIVE" } });
    const cls = await tx.schoolClass.create({ data: { schoolId: sid, campusId: campus.id, name: "Class 5", sortOrder: 5 } });
    const sec = await tx.section.create({ data: { schoolId: sid, classId: cls.id, academicYearId: year.id, name: "A", classTeacherId: f.ravi.id } });
    const ukg = await tx.schoolClass.create({ data: { schoolId: sid, campusId: campus.id, name: "UKG", sortOrder: 0, level: "Pre-primary" } });
    await tx.section.create({ data: { schoolId: sid, classId: ukg.id, academicYearId: year.id, name: "A", classTeacherId: f.meena.id } });
    const st = await tx.student.create({ data: { schoolId: sid, campusId: campus.id, admissionNo: "NC-1", firstName: "Neha", lastName: "Singh", fullName: "Neha Singh", status: "ACTIVE" } });
    await tx.enrolment.create({ data: { schoolId: sid, studentId: st.id, academicYearId: year.id, classId: cls.id, sectionId: sec.id, rollNo: 1 } });
    return { campusId: campus.id, yearId: year.id, nehaId: st.id };
  });
  await withSchool(as(f, null), async (tx) => {
    const ukg = await tx.schoolClass.create({ data: { schoolId: sid, campusId: f.school.campus.id, name: "UKG", sortOrder: 0, level: "Pre-primary" } });
    await tx.section.create({ data: { schoolId: sid, classId: ukg.id, academicYearId: f.yearId, name: "A", classTeacherId: f.meena.id } });
  });
  const p = as(f, f.principal.id);
  await withSchool(p, (tx) => saveEventsSettings(tx, p, { housesOn: true, dailyOn: true }));
  await withSchool(p, (tx) => recordAchievements(tx, p, { studentIds: [f.aarav.id, north.nehaId], activity: "Inter-school quiz", kind: "Olympiad", level: "School", position: null, won: false, date: TODAY, certificate: false }, TODAY));
  houseId = (await withSchool(p, (tx) => saveHouse(tx, p, { name: "Ganga", colour: "info", captainStudentId: null }))).id;
  await withSchool(p, (tx) => assignHouses(tx, p, { mode: "hand", houseId, studentIds: [f.aarav.id, north.nehaId] }, TODAY));
});

const both = () => [f.yearId, north.yearId].sort();

describe("an Events page works in each campus's year on the day", () => {
  it("a whole-school page has both campuses' years; a page for someone kept to North has North's only", async () => {
    const p = as(f, f.principal.id);
    const all = await withSchool(p, (tx) => evYears(tx, TODAY, null));
    const mine = await withSchool(p, (tx) => evYears(tx, TODAY, { campusId: north.campusId }));
    expect(all.map((y) => y.id).sort()).toEqual(both());
    expect(mine.map((y) => y.id)).toEqual([north.yearId]);
  });

  it("the student pickers list each campus's students with their class, and only North's for North", async () => {
    const p = as(f, f.principal.id);
    const all = await withSchool(p, (tx) => pickStudents(tx, both()));
    expect(all.find((s) => s.id === north.nehaId)?.place).toBe("5 A");
    expect(all.some((s) => s.id === f.aarav.id)).toBe(true);
    const mine = await withSchool(p, (tx) => pickStudents(tx, [north.yearId]));
    expect(mine.map((s) => s.id)).toEqual([north.nehaId]);
  });

  it("the house leaderboard counts the house's members of both campuses", async () => {
    const p = as(f, f.principal.id);
    const board = await withSchool(p, (tx) => leaderboard(tx, both()));
    expect(board.find((h) => h.id === houseId)?.students).toBe(2);
  });

  it("the achievements list keeps to the years it is given", async () => {
    const p = as(f, f.principal.id);
    const all = await withSchool(p, (tx) => achievementList(tx, null, {}));
    expect(new Set(all.map((a) => a.studentId))).toEqual(new Set([f.aarav.id, north.nehaId]));
    const mine = await withSchool(p, (tx) => achievementList(tx, null, { yearIds: [north.yearId] }));
    expect(mine.map((a) => a.studentId)).toEqual([north.nehaId]);
    expect(mine[0].place).toBe("5 A");
  });

  it("Daily Activities lists each campus's pre-primary classes, each in its own year and named with its campus", async () => {
    const p = as(f, f.principal.id);
    const pre = await withSchool(p, (tx) => preSectionsIn(tx, both()));
    const ukg = pre.filter((s) => s.className === "UKG");
    expect(ukg.map((s) => s.yearId).sort()).toEqual(both());
    expect(ukg.find((s) => s.yearId === north.yearId)?.label).toBe("UKG A, North Campus");
    const one = await withSchool(p, (tx) => preSectionsIn(tx, [north.yearId]));
    expect(one.map((s) => s.label)).toEqual(["UKG A"]);
  });
});
