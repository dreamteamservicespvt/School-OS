// Time Table (04 §9 Done when 4, 5 and 7): no teacher in two places at once,
// "Make automatically" gives a clash-free draft and leaves the published one
// alone, publishing with an effective date, and no periods on a holiday.
import { beforeAll, describe, expect, it } from "vitest";
import { autoFill, clashCheck, effectiveVersion, makeDraft, periodsForStaffOnDate, publishVersion, removePeriod, restorePeriod, savePeriod } from "@/lib/academic/timetable";
import { academicSchool, d } from "./fixture";

let s: Awaited<ReturnType<typeof academicSchool>>;
let draftId: string;
const today = d("2026-10-09");

beforeAll(async () => {
  s = await academicSchool();
  draftId = (await s.run((tx) => makeDraft(tx, s.ctx, s.year.id, s.campusId, today))).version.id;
});

const period = (over: Partial<Parameters<typeof savePeriod>[2]> = {}) => ({
  versionId: draftId, sectionId: s.s5b.id, dayOfWeek: 1, periodNo: 1, startTime: "08:45", endTime: "09:25",
  subjectId: s.subjects.MAT, staffId: s.staff[0].id, room: null, isBreak: false, label: null, wholeWeek: false, ...over,
});

describe("clash check", () => {
  it("blocks a teacher booked twice at the same time, naming the other class", async () => {
    // Asha already teaches 5 A in period 1 on Monday.
    await expect(s.run((tx) => savePeriod(tx, s.ctx, period()))).rejects.toThrow("Asha Rao is already in Class 5 A, period 1 on Monday.");
  });

  it("blocks a room booked twice", async () => {
    await expect(s.run((tx) => savePeriod(tx, s.ctx, period({ staffId: s.staff[3].id, periodNo: 3, room: "101" })))).resolves.toBeTruthy();
    await expect(s.run((tx) => savePeriod(tx, s.ctx, period({ sectionId: s.s6a.id, staffId: s.staff[1].id, subjectId: s.subjects.ENG, periodNo: 3, room: "101" })))).rejects.toThrow(/Room 101 is already booked for Class 5 B, period 3 on Monday/);
  });

  it("only allows subjects mapped to the class", async () => {
    const art = await s.run((tx) => tx.subject.create({ data: { schoolId: s.school.id, code: "ART", name: "Art" } }));
    await expect(s.run((tx) => savePeriod(tx, s.ctx, period({ subjectId: art.id, periodNo: 5 })))).rejects.toThrow("That subject is not taught in Class 5. Map it in Subjects first.");
  });

  it("never changes the published Time Table", async () => {
    await expect(s.run((tx) => savePeriod(tx, s.ctx, period({ versionId: s.version.id, periodNo: 6 })))).rejects.toThrow(/Only a draft can be changed/);
  });

  it("a removed period can come back with Undo, unless the teacher was booked since", async () => {
    const p = await s.run((tx) => tx.timetablePeriod.findFirstOrThrow({ where: { versionId: draftId, sectionId: s.s5a.id, dayOfWeek: 2, periodNo: 1 } }));
    await s.run((tx) => removePeriod(tx, s.ctx, p.id));
    await s.run((tx) => savePeriod(tx, s.ctx, period({ dayOfWeek: 2, periodNo: 1 })));
    await expect(s.run((tx) => restorePeriod(tx, s.ctx, p.id))).rejects.toThrow(/cannot come back: Asha Rao is already in Class 5 B/);
  });
});

describe("make automatically", () => {
  it("makes a draft for one class with no clashes, and the published Time Table stays as it was", async () => {
    const publishedBefore = await s.run((tx) => tx.timetablePeriod.findMany({ where: { versionId: s.version.id }, orderBy: { id: "asc" } }));
    const r = await s.run((tx) => autoFill(tx, s.ctx, draftId, [s.s5a.id, s.s5b.id], today));
    expect(r.sections).toBe(2);
    expect(r.placed).toBeGreaterThan(20);
    const hard = (await s.run((tx) => clashCheck(tx, s.ctx, draftId))).filter((c) => c.hard);
    expect(hard).toEqual([]);
    const publishedAfter = await s.run((tx) => tx.timetablePeriod.findMany({ where: { versionId: s.version.id }, orderBy: { id: "asc" } }));
    expect(publishedAfter).toEqual(publishedBefore);
    expect((await s.run((tx) => effectiveVersion(tx, s.ctx, s.campusId, today)))?.id).toBe(s.version.id);
  });
});

describe("publish", () => {
  it("needs a date from today on, then takes over from that date and tells the teachers", async () => {
    await expect(s.run((tx) => publishVersion(tx, s.ctx, draftId, d("2026-10-01"), today))).rejects.toThrow("The effective date cannot be in the past. Choose today or a later date.");
    const r = await s.run((tx) => publishVersion(tx, s.ctx, draftId, d("2026-10-12"), today));
    expect(r.effectiveFrom).toEqual(d("2026-10-12"));
    expect((await s.run((tx) => effectiveVersion(tx, s.ctx, s.campusId, d("2026-10-10"))))?.id).toBe(s.version.id);
    expect((await s.run((tx) => effectiveVersion(tx, s.ctx, s.campusId, d("2026-10-12"))))?.id).toBe(draftId);
    const told = await s.run((tx) => tx.notification.count({ where: { userLoginId: s.teacherUser.id, type: "timetable-published" } }));
    expect(told).toBe(1);
  });
});

describe("holidays", () => {
  it("shows no periods on a holiday in the School Calendar", async () => {
    const monday = d("2026-11-02");
    expect((await s.run((tx) => periodsForStaffOnDate(tx, s.ctx, s.staff[1].id, monday))).periods.length).toBeGreaterThan(0);
    await s.run((tx) => tx.calendarEntry.create({ data: { schoolId: s.school.id, campusId: s.campusId, academicYearId: s.year.id, type: "holiday", title: "Local holiday", startDate: monday, endDate: monday, attendanceOn: false } }));
    const day = await s.run((tx) => periodsForStaffOnDate(tx, s.ctx, s.staff[1].id, monday));
    expect(day.periods).toEqual([]);
    expect(day.off?.title).toBe("Local holiday");
  });
});
