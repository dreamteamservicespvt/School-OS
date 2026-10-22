// One rule for "is this a school day" (gap list G32, browser finding
// TEACHING-01): the campus's working days (Academic Settings), the Saturdays
// off (Events Settings), School Calendar holidays for the whole school or
// the campus, and "allow attendance on this date" typed into the School
// Calendar. Take Attendance, the register, every %, report cards and student
// and staff leave all use it, so they agree.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { isSchoolDay, loadSchoolCalendar } from "@/lib/calendar/school-days";
import { saveClassAttendance, takeChoices, type Entry } from "@/lib/attendance/marks";
import { OffDayError } from "@/lib/attendance/calendar";
import { attendanceSummary } from "@/lib/attendance/summary";
import { registerDays } from "@/lib/attendance/report-card-source";
import { checkStudentLeave } from "@/lib/attendance/student-leave";
import { countLeaveDays, offDaySet } from "@/lib/staff/leave";
import { notWorkingDay } from "@/lib/events/calendar";
import { accessFor, as, at, d, makeAttendanceSchool, TZ, type Fixture } from "./fixture";

let f: Fixture;
let campusB: string;
let class7: string;
let studentB: string;
const sys = () => ({ schoolId: f.school.id, userId: null });
const allPresent = (list: { id: string }[], except: Record<string, string> = {}): Entry[] => list.map((s) => ({ studentId: s.id, statusKey: except[s.id] ?? "present" }));

async function save(date: string) {
  const access = await accessFor(f, f.teacherA.id);
  return withSchool(as(f, f.teacherA.id), (tx) => saveClassAttendance(tx, as(f, f.teacherA.id), access, { sectionId: f.sectionA.id, date: d(date), periodNo: 0, timeZone: TZ, entries: allPresent(f.studentsA), now: at(date, "09:00") }));
}

beforeAll(async () => {
  f = await makeAttendanceSchool("School Days School");
  await withSchool(sys(), async (tx) => {
    // A second campus that works Monday to Friday, with its own holiday on Wednesday 7 October.
    const b = await tx.campus.create({ data: { schoolId: f.school.id, name: "North campus" } });
    campusB = b.id;
    await tx.academicSettings.create({ data: { schoolId: f.school.id, campusId: b.id, workingDays: [1, 2, 3, 4, 5] } });
    const cls = await tx.schoolClass.create({ data: { schoolId: f.school.id, campusId: b.id, name: "Class 7", sortOrder: 7 } });
    class7 = cls.id;
    const sec = await tx.section.create({ data: { schoolId: f.school.id, classId: cls.id, academicYearId: f.year.id, name: "A" } });
    const st = await tx.student.create({ data: { schoolId: f.school.id, campusId: b.id, admissionNo: "ADM-N01", firstName: "Nila", lastName: "Rao", fullName: "Nila Rao", status: "ACTIVE" } });
    studentB = st.id;
    await tx.enrolment.create({ data: { schoolId: f.school.id, studentId: st.id, academicYearId: f.year.id, classId: cls.id, sectionId: sec.id, rollNo: 1 } });
    await tx.calendarEntry.create({ data: { schoolId: f.school.id, campusId: b.id, academicYearId: f.year.id, type: "holiday", title: "North campus foundation day", startDate: d("2026-10-07"), endDate: d("2026-10-07") } });
    // The school has the second Saturday off (Events Settings, Weekends).
    await tx.eventsSetting.create({ data: { schoolId: f.school.id, secondSaturdayOff: true } });
  });
});

describe("one rule, per campus and per class", () => {
  it("puts working days, Saturdays off and campus holidays together", async () => {
    const cal = await withSchool(sys(), (tx) => loadSchoolCalendar(tx, sys(), d("2026-10-01"), d("2026-10-31")));
    const main = cal.campus(f.school.campus.id);
    const north = cal.campus(campusB);
    // Saturday 3 October: a school day on the main campus (Monday to Saturday), not on the Monday-to-Friday campus.
    expect(main.info(d("2026-10-03")).on).toBe(true);
    expect(north.info(d("2026-10-03"))).toMatchObject({ on: false, reason: "weekend", title: "Saturday" });
    // Saturday 10 October is the second Saturday: off everywhere.
    expect(main.info(d("2026-10-10"))).toMatchObject({ on: false, reason: "weekend", title: "Second Saturday" });
    // The north campus's holiday is not the main campus's.
    expect(north.info(d("2026-10-07"))).toMatchObject({ on: false, reason: "holiday", title: "North campus foundation day" });
    expect(main.info(d("2026-10-07")).on).toBe(true);
    expect(main.info(d("2026-10-04"))).toMatchObject({ on: false, reason: "sunday" });
    // No campus given: the main campus, never every campus's holidays together.
    expect(cal.campus(null).info(d("2026-10-07")).on).toBe(true);
  });

  it("the PTM and daily-diary check uses the same rule", async () => {
    expect(await withSchool(sys(), (tx) => notWorkingDay(tx, sys(), "2026-10-07", campusB))).toMatch(/holiday \(North campus foundation day\)/);
    expect(await withSchool(sys(), (tx) => notWorkingDay(tx, sys(), "2026-10-07", f.school.campus.id))).toBeNull();
    expect(await withSchool(sys(), (tx) => notWorkingDay(tx, sys(), "2026-10-10", f.school.campus.id))).toMatch(/second Saturday, not a working day/);
  });
});

describe("an event does not open a day off unless a person says so (TEACHING-01)", () => {
  beforeAll(async () => {
    await withSchool(sys(), async (tx) => {
      await tx.calendarEntry.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, type: "vacation", title: "Dasara holidays", startDate: d("2026-10-17"), endDate: d("2026-10-25") } });
      // The form's default now: "allow attendance" off.
      await tx.calendarEntry.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, type: "event", title: "Fire drill", startDate: d("2026-10-18"), endDate: d("2026-10-18"), attendanceOn: false } });
      // An event made on its own page: never opens or closes a day, whatever it says.
      await tx.calendarEntry.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, type: "event", title: "Staff meeting", startDate: d("2026-10-21"), endDate: d("2026-10-21"), attendanceOn: true, source: "event:00000000-0000-0000-0000-000000000001" } });
    });
  });

  it("Take Attendance stays off on a Sunday in the vacation with an event on it, and inside the vacation", async () => {
    await expect(save("2026-10-18")).rejects.toBeInstanceOf(OffDayError);
    await expect(save("2026-10-21")).rejects.toThrow(/Holiday: Dasara holidays\. Attendance is off for 21-10-2026/);
    const access = await accessFor(f, f.teacherA.id);
    expect(await withSchool(as(f, f.teacherA.id), (tx) => takeChoices(tx, as(f, f.teacherA.id), access, d("2026-10-21")))).toEqual([]);
  });

  it("a Sunday leave is not counted as a day of school", async () => {
    const access = await accessFor(f, f.teacherA.id);
    const c = await withSchool(as(f, f.teacherA.id), (tx) => checkStudentLeave(tx, as(f, f.teacherA.id), access, { studentId: f.studentsA[0].id, leaveTypeId: f.medical.id, from: d("2026-10-26"), to: d("2026-11-02"), halfDay: false, reason: "Family travel" }));
    // Mon 26 to Mon 2 Nov: Sun 1 Nov is left out; Saturday 31 Oct (fifth Saturday) is a school day.
    expect(c.days).toBe(7);
  });

  it("a person allowing attendance on a Sunday opens it, for the classes chosen only", async () => {
    await withSchool(sys(), (tx) => tx.calendarEntry.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, type: "event", title: "Annual day rehearsal", startDate: d("2026-11-08"), endDate: d("2026-11-08"), attendanceOn: true, classIds: [class7] } }));
    const sunday = d("2026-11-08");
    expect((await withSchool(sys(), (tx) => isSchoolDay(tx, sys(), sunday, { campusId: campusB, classId: class7 }))).opened).toBe("Annual day rehearsal");
    expect((await withSchool(sys(), (tx) => isSchoolDay(tx, sys(), sunday, { campusId: f.school.campus.id, classId: f.cls.id }))).on).toBe(false);
    // Staff and whole-campus counts follow only entries for the whole school or campus.
    expect((await withSchool(sys(), (tx) => isSchoolDay(tx, sys(), sunday, { campusId: campusB }))).on).toBe(false);
  });
});

describe("the % and the report card count the same school days (G32)", () => {
  it("a Monday-to-Friday campus does not count Saturdays, and its holiday is its own", async () => {
    await save("2026-10-05");
    await save("2026-10-06");
    await save("2026-10-07");
    await save("2026-10-08");
    await save("2026-10-09");
    // Mon 5 to Sat 10 October.
    const main = await withSchool(sys(), (tx) => attendanceSummary(tx, sys(), { studentId: f.studentsA[0].id, from: d("2026-10-05"), to: d("2026-10-10") }));
    const north = await withSchool(sys(), (tx) => attendanceSummary(tx, sys(), { studentId: studentB, from: d("2026-10-05"), to: d("2026-10-10") }));
    expect(main.people.get(f.studentsA[0].id)?.workingDays).toBe(5); // Saturday 10 is the second Saturday.
    expect(north.people.get(studentB)?.workingDays).toBe(4); // Monday to Friday, less the campus holiday.
  });

  it("the report card's working days are the register's, with no campus given", async () => {
    const card = await withSchool(sys(), (tx) => registerDays(tx, sys(), [f.studentsA[0].id], { from: d("2026-10-05"), to: d("2026-10-09") }, d("2026-10-09")));
    const register = await withSchool(sys(), (tx) => attendanceSummary(tx, sys(), { sectionId: f.sectionA.id, from: d("2026-10-05"), to: d("2026-10-09"), today: d("2026-10-09") }));
    expect(card.get(f.studentsA[0].id)).toEqual({ present: 5, working: 5 });
    expect(register.workingDays).toBe(5);
  });
});

describe("leave days follow the same rule", () => {
  it("staff leave leaves out the second Saturday and Sunday", async () => {
    const off = await withSchool(sys(), (tx) => offDaySet(tx, sys(), d("2026-10-09"), d("2026-10-12"), f.school.campus.id));
    expect([...off].sort()).toEqual(["2026-10-10", "2026-10-11"]);
    expect(countLeaveDays(d("2026-10-09"), d("2026-10-12"), off)).toBe(2);
    // A Monday-to-Friday campus: every Saturday is off.
    const north = await withSchool(sys(), (tx) => offDaySet(tx, sys(), d("2026-10-02"), d("2026-10-05"), campusB));
    expect(countLeaveDays(d("2026-10-02"), d("2026-10-05"), north)).toBe(2);
  });

  it("student leave leaves out the class's days off", async () => {
    const access = await accessFor(f, f.principal.id);
    const c = await withSchool(as(f, f.principal.id), (tx) => checkStudentLeave(tx, as(f, f.principal.id), access, { studentId: studentB, leaveTypeId: f.medical.id, from: d("2026-10-02"), to: d("2026-10-07"), halfDay: false, reason: "Fever" }));
    // Fri 2 Oct is Gandhi Jayanti only on the main campus; Sat, Sun off; Mon, Tue; Wed 7 is the north campus holiday.
    expect(c.days).toBe(3);
  });
});
