// Ask in plain words, rule-based first (gap list G27): each ready-made
// question answers the same count as the module's own list behind it, for
// the person who asks, with their reach. A teacher cannot get another class,
// the Accountant gets no marks and a teacher no fees, and each role gets its
// own 4 to 6 ready-made questions.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { saveClassAttendance } from "@/lib/attendance/marks";
import { afterAttendanceSaved } from "@/lib/attendance/alerts";
import { absentList } from "@/lib/attendance/absence-reasons";
import { attendanceAccess, type AccessSource } from "@/lib/attendance/access";
import { saveStaffAttendance, staffDay } from "@/lib/attendance/staff";
import { attendanceSettings } from "@/lib/attendance/settings";
import { feeViewer } from "@/lib/fees/access";
import { defaulters } from "@/lib/fees/defaulters";
import { findEntry } from "@/lib/reports/catalogue";
import { readFilters } from "@/lib/reports/filters";
import { runEntry, viewerOf } from "@/lib/reports/run";
import type { ReportViewer } from "@/lib/reports/types";
import { todayFor } from "@/lib/periods";
import { formatRupees } from "@/lib/format";
import { answerQuestion, offeredQuestions, readyMadeFor, type AskAnswer } from "@/lib/ask/answer";
import { makeUser } from "../helpers";
import { collect, dues, makeFeeSchool, R, type FeeSchool } from "../fees/fixture";
import { accessFor, as, at, d, makeAttendanceSchool, TZ, type Fixture } from "../attendance/fixture";

const SETUP = { timeZone: TZ, weekStart: "monday" as const, calendar: {} };
const DAYS = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"];
const TODAY = d("2026-10-09");
const NOW = at("2026-10-09", "12:00");
const clock = { now: NOW, setup: SETUP };

let att: Fixture;
let fee: FeeSchool;
let feeTeacher: { id: string };

async function viewer(schoolId: string, userId: string): Promise<ReportViewer> {
  const v = await withSchool({ schoolId, userId }, (tx) => viewerOf(tx, userId, schoolId));
  if (!v) throw new Error("no access");
  return v;
}
const ask = (who: ReportViewer, key: Parameters<typeof answerQuestion>[2], p: Parameters<typeof answerQuestion>[3] = {}, c = clock) => withSchool(who.ctx, (tx) => answerQuestion(tx, who, key, p, c));
function ok(a: AskAnswer) {
  if (!a.ok) throw new Error(`Refused: ${a.problem}`);
  return a;
}
/** A catalogue report run for the person, the way its own page runs it. */
const report = (who: ReportViewer, key: string, sp: Record<string, string> = {}) => withSchool(who.ctx, async (tx) => {
  const e = findEntry(key)!;
  return runEntry(tx, who, e, await readFilters(tx, who.ctx, e, sp, SETUP, TODAY, who.campusId ?? null));
});

beforeAll(async () => {
  att = await makeAttendanceSchool("Ask Attendance School");
  // Five school days in 5 A: Aarav absent every day, Diya absent on the last day. 5 B on the last day: Rohan absent.
  const accessA = await accessFor(att, att.teacherA.id);
  for (const day of DAYS) {
    await withSchool(as(att, att.teacherA.id), (tx) => saveClassAttendance(tx, as(att, att.teacherA.id), accessA, {
      sectionId: att.sectionA.id, date: d(day), periodNo: 0, timeZone: TZ, now: at(day, "09:00"),
      entries: att.studentsA.map((s, i) => ({ studentId: s.id, statusKey: i === 0 || (i === 1 && day === DAYS[4]) ? "absent" : "present" })),
    }));
  }
  const accessB = await accessFor(att, att.teacherB.id);
  await withSchool(as(att, att.teacherB.id), (tx) => saveClassAttendance(tx, as(att, att.teacherB.id), accessB, {
    sectionId: att.sectionB.id, date: TODAY, periodNo: 0, timeZone: TZ, now: at(DAYS[4], "09:00"),
    entries: att.studentsB.map((s, i) => ({ studentId: s.id, statusKey: i === 4 ? "absent" : "present" })),
  }));
  await withSchool({ schoolId: att.school.id, userId: null }, (tx) => afterAttendanceSaved(tx, { schoolId: att.school.id, userId: null }, { sectionId: att.sectionA.id, date: DAYS[4], messages: false }));

  // Staff today: Ganesh came late at 09:40, Kavitha is absent.
  const hrAccess = await accessFor(att, att.hrLogin.id);
  await withSchool(as(att, att.hrLogin.id), (tx) => saveStaffAttendance(tx, as(att, att.hrLogin.id), hrAccess, {
    date: TODAY, now: at(DAYS[4], "10:00"), timeZone: TZ,
    entries: [{ staffId: att.staffOther.id, statusKey: "late", inTime: "09:40" }, { staffId: att.staffB.id, statusKey: "absent" }, { staffId: att.staffA.id, statusKey: "present", inTime: "08:30" }],
  }));

  // Half-yearly results: Aarav (5 A) is below the pass mark in Maths, Rohan (5 B) in English.
  await withSchool({ schoolId: att.school.id, userId: null }, async (tx) => {
    const sid = att.school.id;
    const term = await tx.term.findFirstOrThrow({ where: { schoolId: sid, name: "Term 1" } });
    const type = await tx.examType.create({ data: { schoolId: sid, name: "Half-yearly" } });
    const exam = await tx.exam.create({ data: { schoolId: sid, academicYearId: att.year.id, termId: term.id, examTypeId: type.id, title: "Half-yearly 2026", classIds: [att.cls.id], startDate: d("2026-09-14"), endDate: d("2026-09-19"), status: "PUBLISHED", publishedAt: d("2026-09-01") } });
    const subj = (name: string, percent: number) => ({ subjectId: `00000000-0000-0000-0000-00000000000${name === "Mathematics" ? 1 : 2}`, name, max: 100, marks: percent, absent: false, gradeOnly: false, grade: null, points: null, percent, passed: percent >= 33 });
    const rows = [
      { s: att.studentsA[0], sec: att.sectionA, m: 20, e: 60 },
      { s: att.studentsA[1], sec: att.sectionA, m: 70, e: 65 },
      { s: att.studentsB[4], sec: att.sectionB, m: 55, e: 25 },
      { s: att.studentsB[0], sec: att.sectionB, m: 80, e: 85 },
    ];
    for (const r of rows) {
      const percent = (r.m + r.e) / 2;
      await tx.result.create({ data: { schoolId: sid, academicYearId: att.year.id, examId: exam.id, key: `exam:${exam.id}`, studentId: r.s.id, classId: att.cls.id, sectionId: r.sec.id, total: r.m + r.e, maxTotal: 200, percent, outcome: r.m >= 33 && r.e >= 33 ? "Pass" : "Fail", complete: true, subjects: [subj("Mathematics", r.m), subj("English", r.e)] } });
    }
    // Diya's birthday is today (the Dashboard shows the next 7 days).
    await tx.student.update({ where: { id: att.studentsA[1].id }, data: { dateOfBirth: d(`2016-${todayFor(TZ).toISOString().slice(5, 10)}`) } });
  });

  fee = await makeFeeSchool();
  feeTeacher = await makeUser({ schools: [{ id: fee.school.id, roleKeys: ["class-teacher"] }], name: "Fee School Teacher" });
  // Ravi pays the first two quarters today; Sita and Anil pay nothing.
  const rows = await dues(fee.ctx, fee.ravi.id);
  await collect(fee.ctx, { studentId: fee.ravi.id, dueIds: rows.slice(0, 2).map((r) => r.id), amountPaise: R(12000) });
}, 240_000);

describe("each ready-made question answers the same count as its list", () => {
  it("Who is absent today: the Absent list, the whole school for the Principal and own class for the class teacher", async () => {
    const principal = await viewer(att.school.id, att.principal.id);
    const a = ok(await ask(principal, "absent-today"));
    const list = await withSchool(principal.ctx, async (tx) => absentList(tx, principal.ctx, await attendanceAccess(tx, principal.ctx, principal as unknown as AccessSource), { date: TODAY }));
    expect(a.total).toBe(list.length);
    expect(a.total).toBe(3);
    expect(a.big).toBe("3");
    expect(a.table.rows.map((r) => r.name).sort()).toEqual(["Aarav Sharma", "Diya Reddy", "Rohan Das"]);
    expect(a.sentence).toContain("3 students are absent");

    const teacherA = await viewer(att.school.id, att.teacherA.id);
    const mine = ok(await ask(teacherA, "absent-today"));
    expect(mine.total).toBe(2);
    expect(mine.table.rows.map((r) => r.name)).not.toContain("Rohan Das");
    expect(mine.scope).toContain("Your classes only");
  });

  it("Who has been absent several days in a row: the Chronic absence report's streak flags", async () => {
    const principal = await viewer(att.school.id, att.principal.id);
    const a = ok(await ask(principal, "absent-streak"));
    const t = await report(principal, "at-chronic");
    expect(a.total).toBe(t.rows.filter((r) => r.kind === "Absent days in a row").length);
    expect(a.table.rows.map((r) => r.who)).toEqual(["Aarav Sharma"]);
    const s = await withSchool(principal.ctx, (tx) => attendanceSettings(tx, principal.ctx));
    expect(a.sentence).toContain(`${s.chronicDays} or more school days in a row`);
  });

  it("Who is below the attendance line: the rows of Students near the attendance line that are below it", async () => {
    const principal = await viewer(att.school.id, att.principal.id);
    const a = ok(await ask(principal, "below-attendance"));
    const s = await withSchool(principal.ctx, (tx) => attendanceSettings(tx, principal.ctx));
    const t = await report(principal, "at-low");
    expect(a.total).toBe(t.rows.filter((r) => typeof r.percent === "number" && r.percent < s.thresholdPercent).length);
    expect(a.table.rows.map((r) => r.name)).toContain("Aarav Sharma");
  });

  it("Which classes have not taken attendance: the Daily attendance report for today", async () => {
    const principal = await viewer(att.school.id, att.principal.id);
    const a = ok(await ask(principal, "not-marked"));
    const t = await report(principal, "at-daily", { period: "custom", from: DAYS[4], to: DAYS[4] });
    expect(a.total).toBe(t.rows.filter((r) => typeof r.notMarked === "number" && r.notMarked > 0).length);
  });

  it("Which classes have marks below the pass mark: Students below the pass mark, counted by class", async () => {
    const principal = await viewer(att.school.id, att.principal.id);
    const a = ok(await ask(principal, "below-pass"));
    const t = await report(principal, "ex-below");
    expect(a.total).toBe(t.rows.length);
    expect(a.total).toBe(2);
    expect(a.big).toBe("2");
    expect(a.bigLabel).toBe("classes");
    expect(a.sentence).toContain("Half-yearly 2026");
    // The class teacher of 5 A: only Aarav.
    const teacherA = await viewer(att.school.id, att.teacherA.id);
    const mine = ok(await ask(teacherA, "below-pass"));
    expect(mine.table.rows.map((r) => r.name)).toEqual(["Aarav Sharma"]);
  });

  it("Which staff came late, are absent, are on leave: Staff Attendance for the day", async () => {
    const hr = await viewer(att.school.id, att.hrLogin.id);
    const access = await accessFor(att, att.hrLogin.id);
    for (const [key, status] of [["late-staff", "late"], ["staff-absent", "absent"], ["staff-on-leave", "leave"]] as const) {
      const a = ok(await ask(hr, key));
      const rows = await withSchool(hr.ctx, (tx) => staffDay(tx, hr.ctx, access, TODAY, { status }));
      expect(a.total, key).toBe(rows.length);
    }
    const late = ok(await ask(hr, "late-staff"));
    expect(late.table.rows).toEqual([expect.objectContaining({ name: "Ganesh Rao", in: "9:40 AM" })]);
    expect(late.link.href).toBe("/attendance-management/staff?date=2026-10-09&status=late");
  });

  it("Who owes ₹10,000 or more, and who has fees overdue: Defaulters with the same filter", async () => {
    const accountant = await viewer(fee.school.id, fee.accountant.id);
    const today = todayFor(TZ);
    const now = { now: new Date(), setup: SETUP };
    const big = ok(await ask(accountant, "fees-overdue", { amount: 10000 }, now));
    const all = ok(await ask(accountant, "fees-overdue", {}, now));
    const v = await withSchool(accountant.ctx, (tx) => feeViewer(tx, accountant.ctx, accountant as unknown as Parameters<typeof feeViewer>[2]));
    const [listBig, listAll] = await withSchool(accountant.ctx, async (tx) => [
      await defaulters(tx, accountant.ctx, v, today, { amountAbove: R(10000) }),
      await defaulters(tx, accountant.ctx, v, today),
    ]);
    expect(big.total).toBe(listBig.rows.length);
    expect(all.total).toBe(listAll.rows.length);
    expect(big.total).toBeGreaterThan(0);
    expect(big.table.rows.map((r) => r.name)).not.toContain("Ravi Kumar");
    expect(big.link.href).toBe("/fee-management/defaulters?above=10000");
    expect(big.sentence).toContain(formatRupees(listBig.total));
  });

  it("How much fee was collected today: Collection details, the same payments and total", async () => {
    const accountant = await viewer(fee.school.id, fee.accountant.id);
    const today = todayFor(TZ).toISOString().slice(0, 10);
    const a = ok(await ask(accountant, "fees-collected", { when: "today" }, { now: new Date(), setup: SETUP }));
    const t = await withSchool(accountant.ctx, async (tx) => {
      const e = findEntry("fe-receipts")!;
      return runEntry(tx, accountant, e, await readFilters(tx, accountant.ctx, e, { period: "custom", from: today, to: today }, SETUP, todayFor(TZ)));
    });
    expect(a.total).toBe(t.rows.length);
    expect(a.total).toBe(1);
    expect(a.big).toBe(formatRupees(t.totals!.amount as bigint));
    expect(a.big).toBe(formatRupees(R(12000)));
    expect(a.link.href).toBe("/fee-management/reports?r=collection-details&period=today");
  });

  it("Whose birthday is today: the Dashboard's birthdays for the person", async () => {
    const teacherA = await viewer(att.school.id, att.teacherA.id);
    const a = ok(await ask(teacherA, "birthdays", { when: "today" }, { now: new Date(), setup: SETUP }));
    expect(a.table.rows.map((r) => r.name)).toEqual([expect.stringContaining("Diya Reddy")]);
    // The class teacher of 5 B does not see 5 A's student.
    const teacherB = await viewer(att.school.id, att.teacherB.id);
    const b = ok(await ask(teacherB, "birthdays", { when: "today" }, { now: new Date(), setup: SETUP }));
    expect(b.table.rows.map((r) => r.name).join()).not.toContain("Diya");
  });
});

describe("Ask never goes past the person's own lists", () => {
  it("a teacher cannot get another class: refused in words, nothing about it said", async () => {
    const teacherA = await viewer(att.school.id, att.teacherA.id);
    for (const key of ["absent-today", "below-pass", "below-attendance"] as const) {
      const a = await ask(teacherA, key, { cls: "5 B" });
      expect(a.ok, key).toBe(false);
      if (!a.ok) expect(a.problem, key).toContain("own classes");
    }
    // Their own class by name works.
    expect(ok(await ask(teacherA, "absent-today", { cls: "5a" })).total).toBe(2);
  });

  it("the Accountant cannot see marks or attendance; a teacher cannot see fees", async () => {
    const accountant = await viewer(fee.school.id, fee.accountant.id);
    const offeredA = offeredQuestions(accountant);
    expect(offeredA).toEqual(expect.arrayContaining(["fees-collected", "fees-overdue"]));
    for (const k of ["below-pass", "absent-today", "below-attendance", "absent-streak"] as const) expect(offeredA, k).not.toContain(k);
    const marks = await ask(accountant, "below-pass");
    expect(marks.ok).toBe(false);

    const teacher = await viewer(fee.school.id, feeTeacher.id);
    const offeredT = offeredQuestions(teacher);
    for (const k of ["fees-collected", "fees-overdue", "late-staff"] as const) expect(offeredT, k).not.toContain(k);
    const fees = await ask(teacher, "fees-overdue", {}, { now: new Date(), setup: SETUP });
    expect(fees.ok).toBe(false);
    if (!fees.ok) expect(fees.problem).toContain("does not open");
  });

  it("HR gets the staff's attendance but no student marks; a class teacher no staff lists", async () => {
    const hr = await viewer(att.school.id, att.hrLogin.id);
    expect(offeredQuestions(hr)).toEqual(expect.arrayContaining(["late-staff", "staff-absent", "staff-on-leave"]));
    expect(offeredQuestions(hr)).not.toContain("below-pass");
    const teacherA = await viewer(att.school.id, att.teacherA.id);
    expect(offeredQuestions(teacherA)).not.toContain("late-staff");
    expect((await ask(teacherA, "late-staff")).ok).toBe(false);
  });

  it("one school never sees another school's records", async () => {
    // The fee school's principal asks about absences: the attendance school's absences are not there.
    const principal = await viewer(fee.school.id, fee.principal.id);
    const a = ok(await ask(principal, "absent-today"));
    expect(a.table.rows.map((r) => r.name).join()).not.toMatch(/Aarav|Diya|Rohan/);
  });

  it("a class that is not in the school is said so", async () => {
    const principal = await viewer(att.school.id, att.principal.id);
    const a = await ask(principal, "absent-today", { cls: "9 C" });
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.problem).toContain("There is no Class 9 C");
  });
});

describe("ready-made questions per role", () => {
  it("gives each role 4 to 6 questions about its own lists", async () => {
    const principal = readyMadeFor(await viewer(att.school.id, att.principal.id));
    expect(principal.length).toBeGreaterThanOrEqual(4);
    expect(principal.length).toBeLessThanOrEqual(6);
    expect(principal[0].title).toBe("Who is absent today?");

    const accountant = readyMadeFor(await viewer(fee.school.id, fee.accountant.id));
    expect(accountant.map((q) => q.title)).toEqual(expect.arrayContaining(["How much fee was collected today?", "Who owes ₹10,000 or more?"]));
    expect(accountant.every((q) => q.key.startsWith("fees-"))).toBe(true);

    const teacher = readyMadeFor(await viewer(att.school.id, att.teacherA.id));
    expect(teacher.map((q) => q.key)).toEqual(["absent-today", "absent-streak", "below-attendance", "below-pass", "birthdays"]);
    expect(teacher.every((q) => q.href.startsWith("/ask?q="))).toBe(true);
  });
});
