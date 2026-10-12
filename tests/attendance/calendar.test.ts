// Every attendance calendar pages back to earlier months of the year, and to
// earlier years for people who may see them, up to this month; earlier months
// load their real marks, holidays and leave (owner's rule, 12 Oct 2026). Who
// may open a student's calendar is checked on the server.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { NotYoursError } from "@/lib/attendance/access";
import { clampMonth, parseMonth, studentCalendar, studentCalendarFor } from "@/lib/attendance/calendar-months";
import { registerChoices, registerMonth, registerYears } from "@/lib/attendance/register";
import { accessFor, as, d, makeAttendanceSchool, type Fixture } from "./fixture";

let f: Fixture;
let pastSectionA: string;
const today = d("2026-10-12");

beforeAll(async () => {
  f = await makeAttendanceSchool("Attendance Calendar School");
  const sys = { schoolId: f.school.id, userId: null };
  await withSchool(sys, async (tx) => {
    const past = await tx.academicYear.create({ data: { schoolId: f.school.id, campusId: f.school.campus.id, name: "2025-26", startDate: d("2025-04-01"), endDate: d("2026-03-31"), status: "CLOSED" } });
    const cls4 = await tx.schoolClass.create({ data: { schoolId: f.school.id, campusId: f.school.campus.id, name: "Class 4", sortOrder: 4 } });
    const sec = await tx.section.create({ data: { schoolId: f.school.id, classId: cls4.id, academicYearId: past.id, name: "A", classTeacherId: f.staffA.id } });
    pastSectionA = sec.id;
    const kid = f.studentsA[0];
    await tx.enrolment.create({ data: { schoolId: f.school.id, studentId: kid.id, academicYearId: past.id, classId: cls4.id, sectionId: sec.id, rollNo: 1, status: "PROMOTED" } });
    await tx.calendarEntry.create({ data: { schoolId: f.school.id, academicYearId: past.id, type: "holiday", title: "Diwali", startDate: d("2025-10-20"), endDate: d("2025-10-20") } });
    await tx.attendanceMark.createMany({ data: [
      { schoolId: f.school.id, academicYearId: past.id, studentId: kid.id, sectionId: sec.id, date: d("2025-10-06"), statusKey: "absent" },
      { schoolId: f.school.id, academicYearId: past.id, studentId: kid.id, sectionId: sec.id, date: d("2025-10-07"), statusKey: "present" },
      { schoolId: f.school.id, academicYearId: past.id, studentId: kid.id, sectionId: sec.id, date: d("2025-10-08"), statusKey: "leave" },
      { schoolId: f.school.id, academicYearId: f.year.id, studentId: kid.id, sectionId: f.sectionA.id, date: d("2026-08-03"), statusKey: "late" },
    ] });
  });
});

describe("a student's calendar pages through earlier months (owner's rule 4)", () => {
  it("loads an earlier month of this year with its real marks", async () => {
    const access = await accessFor(f, f.principal.id);
    const cal = await withSchool(as(f, f.principal.id), (tx) => studentCalendarFor(tx, as(f, f.principal.id), access, f.studentsA[0].id, parseMonth("2026-08"), today));
    expect(cal.view.month).toBe("2026-08");
    expect(cal.view.cells.find((c) => c.date === "2026-08-03")?.statusKey).toBe("late");
    expect(cal.bounds.max).toBe("2026-10");
  });

  it("goes back to last year for whole-school roles, with marks, holidays and leave", async () => {
    const access = await accessFor(f, f.principal.id);
    const cal = await withSchool(as(f, f.principal.id), (tx) => studentCalendarFor(tx, as(f, f.principal.id), access, f.studentsA[0].id, parseMonth("2025-10"), today));
    expect(cal.bounds.min).toBe("2025-04");
    expect(cal.view.month).toBe("2025-10");
    const cell = (iso: string) => cal.view.cells.find((c) => c.date === iso);
    expect(cell("2025-10-06")?.statusKey).toBe("absent");
    expect(cell("2025-10-08")?.statusKey).toBe("leave");
    expect(cell("2025-10-20")?.off).toBe("Diwali");
    expect(cell("2025-10-05")?.off).toBe("Sunday");
  });

  it("never pages past this month", async () => {
    const cal = await withSchool(as(f, f.principal.id), (tx) => studentCalendar(tx, as(f, f.principal.id), f.studentsA[0].id, parseMonth("2027-01"), today, { allYears: true }));
    expect(cal.view.month).toBe("2026-10");
    expect(clampMonth(d("2020-01-01"), cal.bounds).toISOString().slice(0, 7)).toBe("2025-04");
  });

  it("a class teacher sees their own student's months of this year only", async () => {
    const access = await accessFor(f, f.teacherA.id);
    const cal = await withSchool(as(f, f.teacherA.id), (tx) => studentCalendarFor(tx, as(f, f.teacherA.id), access, f.studentsA[0].id, parseMonth("2025-10"), today));
    expect(cal.bounds.min).toBe("2026-04");
    expect(cal.view.month).toBe("2026-04");
  });

  it("refuses a teacher another class's student, on the server", async () => {
    const access = await accessFor(f, f.teacherB.id);
    await expect(withSchool(as(f, f.teacherB.id), (tx) => studentCalendarFor(tx, as(f, f.teacherB.id), access, f.studentsA[0].id, null, today))).rejects.toBeInstanceOf(NotYoursError);
  });
});

describe("the class register pages back to earlier years", () => {
  it("whole-school roles see last year's sections and their marks", async () => {
    const access = await accessFor(f, f.principal.id);
    const r = await withSchool(as(f, f.principal.id), async (tx) => {
      const { years, bounds } = await registerYears(tx, access, today);
      const past = years.find((y) => y.name === "2025-26")!;
      const sections = await registerChoices(tx, access, past.id);
      const grid = await registerMonth(tx, as(f, f.principal.id), { sectionId: pastSectionA, month: d("2025-10-01"), today });
      return { years, bounds, sections, grid };
    });
    expect(r.bounds).toEqual({ min: "2025-04", max: "2026-10" });
    expect(r.sections.map((s) => s.id)).toContain(pastSectionA);
    expect(r.grid?.rows[0].days["2025-10-06"]).toBe("absent");
    expect(r.grid?.rows[0].roll).toBe(1);
    expect(r.grid?.rows[0].name).not.toContain("(left)");
    expect(r.grid?.dates.find((x) => x.iso === "2025-10-20")?.off).toBe("Diwali");
  });

  it("a teacher sees last year's sections they taught, not others", async () => {
    const a = await accessFor(f, f.teacherA.id);
    const b = await accessFor(f, f.teacherB.id);
    const r = await withSchool(as(f, f.principal.id), async (tx) => {
      const past = await tx.academicYear.findFirstOrThrow({ where: { name: "2025-26" } });
      return { a: await registerChoices(tx, a, past.id), b: await registerChoices(tx, b, past.id), bYears: await registerYears(tx, b, today) };
    });
    expect(r.a.map((s) => s.id)).toEqual([pastSectionA]);
    expect(r.b).toEqual([]);
    expect(r.bYears.bounds.min).toBe("2026-04");
  });
});
