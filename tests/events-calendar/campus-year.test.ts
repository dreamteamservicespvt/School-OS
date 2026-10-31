// Each campus has its own school years (04 Academic Management). In a school
// whose second campus runs a year that overlaps the main one, Co-curricular,
// Daily Activities and PTM work goes in the year of the campus it is for:
// a student's own campus, a class's campus; a club or a meeting spans both.
// The main campus's year 2026-27 runs 1 Apr to 31 Mar; North's runs 1 Jun to
// 30 Apr, so 15 Oct falls in both. Each check works on both campuses, so it
// holds whichever year the database happens to list first.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { saveEventsSettings } from "@/lib/events/settings";
import { addMembers, correctCredits, recordAchievements, recordFitness, recordSession, removeMember, saveClub } from "@/lib/events/cocurricular";
import { assignActivity } from "@/lib/events/daily";
import { planPtm } from "@/lib/events/ptm";
import { EventsProblem } from "@/lib/events/problem";
import { TODAY, as, day, makeEventsSchool, type EvFixture } from "./fixture";

let f: EvFixture;
let north: { campusId: string; yearId: string; classId: string; ukgSectionId: string; nehaId: string; ishaId: string };
let mainUkg = "";

beforeAll(async () => {
  f = await makeEventsSchool("Two Campus Years School");
  const sid = f.school.id;
  north = await withSchool(as(f, null), async (tx) => {
    const campus = await tx.campus.create({ data: { schoolId: sid, name: "North Campus" } });
    const year = await tx.academicYear.create({ data: { schoolId: sid, campusId: campus.id, name: "2026-27 North", startDate: day("2026-06-01"), endDate: day("2027-04-30"), status: "ACTIVE" } });
    const cls = await tx.schoolClass.create({ data: { schoolId: sid, campusId: campus.id, name: "Class 5", sortOrder: 5 } });
    const sec = await tx.section.create({ data: { schoolId: sid, classId: cls.id, academicYearId: year.id, name: "A", classTeacherId: f.ravi.id } });
    const ukg = await tx.schoolClass.create({ data: { schoolId: sid, campusId: campus.id, name: "UKG", sortOrder: 0, level: "Pre-primary" } });
    const ukgSec = await tx.section.create({ data: { schoolId: sid, classId: ukg.id, academicYearId: year.id, name: "A", classTeacherId: f.meena.id } });
    const kid = async (n: number, first: string, classId: string, sectionId: string) => {
      const st = await tx.student.create({ data: { schoolId: sid, campusId: campus.id, admissionNo: `NC-${n}`, firstName: first, lastName: "Singh", fullName: `${first} Singh`, status: "ACTIVE" } });
      await tx.enrolment.create({ data: { schoolId: sid, studentId: st.id, academicYearId: year.id, classId, sectionId, rollNo: n } });
      return st.id;
    };
    return { campusId: campus.id, yearId: year.id, classId: cls.id, ukgSectionId: ukgSec.id, nehaId: await kid(1, "Neha", cls.id, sec.id), ishaId: await kid(2, "Isha", ukg.id, ukgSec.id) };
  });
  // A pre-primary section on the main campus too, with the same class teacher.
  mainUkg = await withSchool(as(f, null), async (tx) => {
    const ukg = await tx.schoolClass.create({ data: { schoolId: sid, campusId: f.school.campus.id, name: "UKG", sortOrder: 0, level: "Pre-primary" } });
    return (await tx.section.create({ data: { schoolId: sid, classId: ukg.id, academicYearId: f.yearId, name: "A", classTeacherId: f.meena.id } })).id;
  });
  const p = as(f, f.principal.id);
  await withSchool(p, (tx) => saveEventsSettings(tx, p, { creditsOn: true, clubsOn: true, sportsOn: true, dailyOn: true }));
});

describe("Co-curricular work goes in the year of the student's own campus", () => {
  it("an achievement for a student of each campus is kept in each one's year", async () => {
    const p = as(f, f.principal.id);
    const r = await withSchool(p, (tx) => recordAchievements(tx, p, { studentIds: [f.aarav.id, north.nehaId], activity: "Inter-school quiz", kind: "Olympiad", level: "School", position: null, won: false, date: TODAY, certificate: false }, TODAY));
    const years = new Map(r.made.map((a) => [a.studentId, a.academicYearId]));
    expect(years.get(f.aarav.id)).toBe(f.yearId);
    expect(years.get(north.nehaId)).toBe(north.yearId);
  });

  it("credits and fitness records for a North student are in North's year", async () => {
    const p = as(f, f.principal.id);
    await withSchool(p, (tx) => correctCredits(tx, p, north.nehaId, 5, "Helped at the sports day", TODAY));
    const credit = await withSchool(p, (tx) => tx.activityCreditEntry.findFirst({ where: { studentId: north.nehaId, reason: "Helped at the sports day" } }));
    expect(credit?.academicYearId).toBe(north.yearId);
    await withSchool(p, (tx) => recordFitness(tx, p, { studentId: north.nehaId, date: TODAY, heightCm: 140, weightKg: 35, runSeconds: null, reachCm: null, note: null }, TODAY));
    const fit = await withSchool(p, (tx) => tx.fitnessRecord.findFirst({ where: { studentId: north.nehaId } }));
    expect(fit?.academicYearId).toBe(north.yearId);
  });

  it("a club takes members of both campuses, each in their own year, and a meeting counts them all", async () => {
    const p = as(f, f.principal.id);
    const club = await withSchool(p, (tx) => saveClub(tx, p, { name: "Chess Club", inChargeId: null, meets: null }));
    const added = await withSchool(p, (tx) => addMembers(tx, p, "club", club.id, [f.aarav.id, north.nehaId], TODAY));
    expect(added.added).toBe(2);
    const rows = await withSchool(p, (tx) => tx.clubMember.findMany({ where: { clubId: club.id, archivedAt: null } }));
    expect(new Map(rows.map((m) => [m.studentId, m.academicYearId]))).toEqual(new Map([[f.aarav.id, f.yearId], [north.nehaId, north.yearId]]));
    const met = await withSchool(p, (tx) => recordSession(tx, p, "club", club.id, { date: TODAY, presentIds: [north.nehaId] }, TODAY));
    expect(met).toMatchObject({ present: 1, of: 2 });
    await withSchool(p, (tx) => removeMember(tx, p, "club", club.id, north.nehaId, TODAY));
    expect(await withSchool(p, (tx) => tx.clubMember.count({ where: { clubId: club.id, archivedAt: null } }))).toBe(1);
  });

  it("a closed year of one campus does not stop the other campus's work", async () => {
    const p = as(f, f.principal.id);
    for (const [closed, studentId] of [[f.yearId, north.nehaId], [north.yearId, f.aarav.id]] as const) {
      await withSchool(as(f, null), (tx) => tx.academicYear.update({ where: { id: closed }, data: { status: "CLOSED" } }));
      try {
        await withSchool(p, (tx) => correctCredits(tx, p, studentId, 2, "Library helper", TODAY));
      } finally {
        await withSchool(as(f, null), (tx) => tx.academicYear.update({ where: { id: closed }, data: { status: "ACTIVE" } }));
      }
    }
  });
});

describe("Daily Activities and PTMs go in the year of the class's campus", () => {
  it("each pre-primary section's activity is kept in its own campus's year", async () => {
    const m = as(f, f.meenaLogin.id);
    for (const [sectionId, yearId] of [[north.ukgSectionId, north.yearId], [mainUkg, f.yearId]] as const) {
      const r = await withSchool(m, (tx) => assignActivity(tx, m, { sectionId, type: "Play", label: "Clay modelling", startMin: 660, dates: ["2026-10-16"] }, TODAY));
      expect(r.made).toBe(1);
      const made = await withSchool(m, (tx) => tx.dailyActivity.findFirst({ where: { sectionId, label: "Clay modelling" } }));
      expect(made?.academicYearId).toBe(yearId);
    }
  });

  it("a PTM for each campus's class is in that campus's year, with its class teacher's slots", async () => {
    const p = as(f, f.principal.id);
    for (const [classId, yearId, date] of [[north.classId, north.yearId, "2026-12-08"], [f.c1, f.yearId, "2026-12-10"]] as const) {
      const r = await withSchool(p, (tx) => planPtm(tx, p, { date, classIds: [classId], startMin: 570, endMin: 630, slotMinutes: 10, venue: null, subjectTeachers: false, breakStartMin: null, breakEndMin: null }, TODAY));
      expect(r.ptm.academicYearId).toBe(yearId);
      expect(await withSchool(p, (tx) => tx.ptmSlot.count({ where: { ptmId: r.ptm.id } }))).toBeGreaterThan(0);
    }
  });

  it("one PTM cannot take classes of two campuses", async () => {
    const p = as(f, f.principal.id);
    await expect(withSchool(p, (tx) => planPtm(tx, p, { date: "2026-12-09", classIds: [f.c1, north.classId], startMin: 570, endMin: 630, slotMinutes: 10, venue: null, subjectTeachers: false, breakStartMin: null, breakEndMin: null }, TODAY))).rejects.toThrow(EventsProblem);
  });
});
