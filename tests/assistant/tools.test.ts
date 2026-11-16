// The assistant's read tools run as the person, with their own reach
// (docs/assistant/plan.md §2): a teacher gets no fee data even when the model
// asks for it, sees only their own class, a person kept to one campus sees
// only that campus, and one school never sees another school's records.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { saveClassAttendance } from "@/lib/attendance/marks";
import { viewerOf } from "@/lib/reports/run";
import type { ReportViewer } from "@/lib/reports/types";
import { offeredTools, runTool, type ToolArgs, type ToolName } from "@/lib/assistant/tools";
import type { AssistantLang } from "@/lib/assistant/language";
import { makeUser } from "../helpers";
import { makeFeeSchool, type FeeSchool } from "../fees/fixture";
import { accessFor, as, at, d, makeAttendanceSchool, TZ, type Fixture } from "../attendance/fixture";

const TODAY = "2026-10-09";
const clock = { now: at(TODAY, "12:00"), setup: { timeZone: TZ, weekStart: "monday" as const, calendar: {} } };

let a: Fixture;
let b: Fixture;
let fee: FeeSchool;
let feeTeacher: { id: string };
let northAdmin: { id: string };
let north: { campusId: string; studentName: string };

async function viewer(schoolId: string, userId: string): Promise<ReportViewer> {
  const v = await withSchool({ schoolId, userId }, (tx) => viewerOf(tx, userId, schoolId));
  if (!v) throw new Error("no access");
  return v;
}
const run = (who: ReportViewer, tool: ToolName, args: ToolArgs = {}, lang: AssistantLang = "en") => withSchool(who.ctx, (tx) => runTool({ tx, who, clock, lang }, tool, args));
const text = (x: unknown) => JSON.stringify(x);

beforeAll(async () => {
  a = await makeAttendanceSchool("Assistant Tools School");
  // Today in 5 A: Aarav and Diya absent; in 5 B: Rohan absent.
  const accessA = await accessFor(a, a.teacherA.id);
  await withSchool(as(a, a.teacherA.id), (tx) => saveClassAttendance(tx, as(a, a.teacherA.id), accessA, {
    sectionId: a.sectionA.id, date: d(TODAY), periodNo: 0, timeZone: TZ, now: at(TODAY, "09:00"),
    entries: a.studentsA.map((s, i) => ({ studentId: s.id, statusKey: i <= 1 ? "absent" : "present" })),
  }));
  const accessB = await accessFor(a, a.teacherB.id);
  await withSchool(as(a, a.teacherB.id), (tx) => saveClassAttendance(tx, as(a, a.teacherB.id), accessB, {
    sectionId: a.sectionB.id, date: d(TODAY), periodNo: 0, timeZone: TZ, now: at(TODAY, "09:00"),
    entries: a.studentsB.map((s, i) => ({ studentId: s.id, statusKey: i === 4 ? "absent" : "present" })),
  }));

  // A second campus in school A, with its own student, and an admin kept to it.
  northAdmin = await makeUser({ schools: [{ id: a.school.id, roleKeys: ["school-admin"] }], name: "North Admin" });
  north = await withSchool({ schoolId: a.school.id, userId: null }, async (tx) => {
    const sid = a.school.id;
    const campus = await tx.campus.create({ data: { schoolId: sid, name: "North Campus" } });
    const year = await tx.academicYear.create({ data: { schoolId: sid, campusId: campus.id, name: "2026-27", startDate: d("2026-04-01"), endDate: d("2027-03-31"), status: "ACTIVE" } });
    const cls = await tx.schoolClass.create({ data: { schoolId: sid, campusId: campus.id, name: "Class 7", sortOrder: 7 } });
    const sec = await tx.section.create({ data: { schoolId: sid, classId: cls.id, academicYearId: year.id, name: "A" } });
    const st = await tx.student.create({ data: { schoolId: sid, campusId: campus.id, admissionNo: "N-001", firstName: "Nikhil", lastName: "Varma", fullName: "Nikhil Varma", status: "ACTIVE" } });
    await tx.enrolment.create({ data: { schoolId: sid, studentId: st.id, academicYearId: year.id, classId: cls.id, sectionId: sec.id, rollNo: 1 } });
    await tx.calendarEntry.create({ data: { schoolId: sid, campusId: campus.id, academicYearId: year.id, type: "event", title: "North Sports Day", startDate: d("2026-10-12"), endDate: d("2026-10-12") } });
    await tx.calendarEntry.create({ data: { schoolId: sid, campusId: a.school.campus.id, academicYearId: a.year.id, type: "event", title: "Main Science Fair", startDate: d("2026-10-13"), endDate: d("2026-10-13") } });
    await tx.schoolAccess.updateMany({ where: { schoolId: sid, userLoginId: northAdmin.id }, data: { scope: "CAMPUS", campusId: campus.id } });
    return { campusId: campus.id, studentName: st.fullName };
  });

  // School B: another school, with a student only it has.
  b = await makeAttendanceSchool("Assistant Other School");
  await withSchool({ schoolId: b.school.id, userId: null }, (tx) => tx.student.update({ where: { id: b.studentsA[0].id }, data: { firstName: "Zara", lastName: "Khan", fullName: "Zara Khan" } }));

  fee = await makeFeeSchool();
  feeTeacher = await makeUser({ schools: [{ id: fee.school.id, roleKeys: ["class-teacher"] }], name: "Fee School Teacher" });
}, 240_000);

describe("a person only gets the tools of the lists their role opens", () => {
  it("a class teacher is offered no fee tool, the Principal is", async () => {
    const teacher = await viewer(fee.school.id, feeTeacher.id);
    expect(offeredTools(teacher)).not.toContain("fee_collection");
    expect(offeredTools(teacher)).not.toContain("fee_defaulters");
    const principal = await viewer(a.school.id, a.principal.id);
    expect(offeredTools(principal)).toEqual(expect.arrayContaining(["absent_students", "fee_collection", "fee_defaulters", "student_details", "upcoming_calendar", "approvals_waiting"]));
  });

  it("a teacher cannot read fee data even when the model asks for it", async () => {
    const teacher = await viewer(fee.school.id, feeTeacher.id);
    for (const tool of ["fee_defaulters", "fee_collection"] as const) {
      const r = await run(teacher, tool, { when: "today" });
      expect(r.ok).toBe(false);
      expect(r.sentence).toBe("That is not part of your role, so I cannot show it.");
      expect(text(r.facts)).not.toMatch(/₹|Ravi|Sita|Anil/);
      expect(r.total).toBeNull();
    }
    // In Telugu too.
    expect((await run(teacher, "fee_defaulters", {}, "te")).sentence).toBe("ఇది మీ role లో లేదు, అందుకే చూపించలేను.");
  });
});

describe("answers are the person's own list", () => {
  it("who is absent: the whole school for the Principal, own class for the class teacher", async () => {
    const principal = await viewer(a.school.id, a.principal.id);
    const all = await run(principal, "absent_students");
    expect(all.ok).toBe(true);
    expect(all.total).toBe(3);
    expect(text(all.facts)).toContain("Rohan Das");
    const teacher = await viewer(a.school.id, a.teacherA.id);
    const mine = await run(teacher, "absent_students");
    expect(mine.total).toBe(2);
    expect(text(mine.facts)).not.toContain("Rohan Das");
    // Another class is refused, never answered with an empty list.
    const other = await run(teacher, "absent_students", { cls: "5 B" });
    expect(other.ok).toBe(false);
  });

  it("the Telugu sentence keeps the numbers exact", async () => {
    const principal = await viewer(a.school.id, a.principal.id);
    const r = await run(principal, "absent_students", {}, "te");
    expect(r.sentence).toMatch(/3/);
    expect(r.sentence).not.toMatch(/[a-z]{4,} students/i);
  });

  it("a student's details and attendance, within the person's reach", async () => {
    const principal = await viewer(a.school.id, a.principal.id);
    // Two students share the name (5 A and 5 B): the assistant asks which one, never picks.
    const two = await run(principal, "student_details", { name: "Aarav Sharma" });
    expect(two.facts).toMatchObject({ found: 2, askWhichOne: true });
    const r = await run(principal, "student_details", { name: "Aarav Sharma", cls: "5 A" });
    expect(r.ok).toBe(true);
    expect(r.facts).toMatchObject({ student: { name: "Aarav Sharma", admissionNo: "ADM-001" } });
    expect(text(r.facts)).toContain("thisYear");
    // Teacher A's reach: their own class. Rohan of 5 B is "not found", never shown.
    const teacher = await viewer(a.school.id, a.teacherA.id);
    const notMine = await run(teacher, "student_details", { name: "Rohan Das", cls: "5 B" });
    expect(notMine.facts).toMatchObject({ found: 0 });
    // Never a parent's phone.
    expect(text(r.facts)).not.toMatch(/90000\d{5}/);
  });

  it("homework, the calendar and approvals answer from their own lists", async () => {
    const principal = await viewer(a.school.id, a.principal.id);
    const hw = await run(principal, "homework_not_submitted");
    expect(hw.ok).toBe(true);
    expect(hw.facts).toMatchObject({ homeworkWithMissing: 0 });
    const cal = await run(principal, "upcoming_calendar", { days: 7 });
    expect(cal.ok).toBe(true);
    expect(text(cal.facts)).toContain("Main Science Fair");
    const ap = await run(principal, "approvals_waiting");
    expect(ap).toMatchObject({ ok: true, total: 0, good: true, sentence: "Nothing is waiting for your decision. All clear!" });
  });
});

describe("one campus and one school", () => {
  it("a person kept to one campus sees only that campus's students and calendar", async () => {
    const n = await viewer(a.school.id, northAdmin.id);
    expect((await run(n, "student_details", { name: "Aarav Sharma" })).facts).toMatchObject({ found: 0 });
    expect((await run(n, "student_details", { name: north.studentName })).facts).toMatchObject({ student: { name: "Nikhil Varma" } });
    const cal = text((await run(n, "upcoming_calendar", { days: 7 })).facts);
    expect(cal).toContain("North Sports Day");
    expect(cal).not.toContain("Main Science Fair");
    const absent = await run(n, "absent_students");
    expect(text(absent.facts)).not.toMatch(/Aarav|Diya|Rohan/);
  });

  it("school B never sees school A's records, and A never sees B's", async () => {
    const principalB = await viewer(b.school.id, b.principal.id);
    const absentB = await run(principalB, "absent_students");
    expect(text(absentB.facts)).not.toMatch(/Aarav|Diya|Rohan/);
    expect((await run(principalB, "upcoming_calendar", { days: 7 })).facts).not.toMatchObject({ list: expect.arrayContaining([expect.objectContaining({ title: "Main Science Fair" })]) });
    expect(text((await run(principalB, "upcoming_calendar", { days: 7 })).facts)).not.toContain("Science Fair");
    const principalA = await viewer(a.school.id, a.principal.id);
    expect((await run(principalA, "student_details", { name: "Zara Khan" })).facts).toMatchObject({ found: 0 });
    expect((await run(principalB, "student_details", { name: "Zara Khan" })).facts).toMatchObject({ student: { name: "Zara Khan" } });
  });
});
