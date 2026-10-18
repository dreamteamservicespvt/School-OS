// The whole school's attendance for the people who look after it (owner's
// prototype changes of 13 Oct 2026): one per-section source for every total,
// Remind for sections not marked (audited, a real notification), and the desk
// pages hidden from the Principal, School Admin and Vice Principal while the
// server still follows 05-roles.md.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { saveClassAttendance } from "@/lib/attendance/marks";
import { attendanceToday } from "@/lib/attendance/integrations";
import { classWise } from "@/lib/attendance/classwise";
import { runReport } from "@/lib/attendance/reports";
import { notMarkedOn, remindNotMarked, REMIND_ACTION } from "@/lib/attendance/remind";
import { attendancePages } from "@/lib/attendance/access";
import { pageMode } from "@/lib/duty";
import { makeUser } from "../helpers";
import { accessFor, as, at, d, makeAttendanceSchool, TZ, type Fixture } from "./fixture";

let f: Fixture;
let vp: { id: string };
let head: { id: string };
const DAY = "2026-10-07";

const pagesFor = async (userId: string) => {
  const view = await accessIn(userId, f.school.id);
  return attendancePages(view!);
};

beforeAll(async () => {
  f = await makeAttendanceSchool("Attendance Class-wise School");
  await withSchool({ schoolId: f.school.id, userId: null }, (tx) => tx.role.updateMany({ where: { key: { in: ["vice-principal", "academic-head"] } }, data: { isEnabled: true } }));
  vp = await makeUser({ schools: [{ id: f.school.id, roleKeys: ["vice-principal"] }], name: "Vice Principal Person" });
  head = await makeUser({ schools: [{ id: f.school.id, roleKeys: ["academic-head"] }], name: "Academic Head Person" });
  // Section A: four present, one absent. Section B is not taken.
  const access = await accessFor(f, f.teacherA.id);
  await withSchool(as(f, f.teacherA.id), (tx) => saveClassAttendance(tx, as(f, f.teacherA.id), access, {
    sectionId: f.sectionA.id, date: d(DAY), periodNo: 0, timeZone: TZ, now: at(DAY, "09:00"),
    entries: f.studentsA.map((s, i) => ({ studentId: s.id, statusKey: i === 0 ? "absent" : "present" })),
  }));
}, 120_000);

describe("Class-wise attendance", () => {
  it("the class-wise rows, the Dashboard numbers and the daily report agree", async () => {
    const ctx = as(f, f.principal.id);
    const access = await accessFor(f, f.principal.id);
    const { cw, today, report } = await withSchool(ctx, async (tx) => ({
      cw: await classWise(tx, ctx, { yearId: f.year.id, from: d(DAY), to: d(DAY), today: d(DAY) }),
      today: await attendanceToday(tx, ctx, d(DAY)),
      report: await runReport(tx, ctx, access, { report: "daily", date: d(DAY), month: d(DAY), from: d(DAY), to: d(DAY), sectionId: null, person: null, period: "month", today: d(DAY) }),
    }));
    const a = cw.sections.find((s) => s.sectionId === f.sectionA.id)!;
    const b = cw.sections.find((s) => s.sectionId === f.sectionB.id)!;
    expect([a.present, a.absent, a.students, a.notMarked]).toEqual([4, 1, 5, false]);
    expect(a.percent).toBe(80);
    expect([b.marked, b.notMarked]).toEqual([0, true]);
    expect(today.students).toMatchObject({ present: 4, absent: 1, total: 10, marked: 5 });
    expect(today.classes.notMarked).toBe(1);
    const rows = report.rows.filter((r) => r.who !== "All staff");
    expect(rows.reduce((s, r) => s + Number(r.present), 0)).toBe(today.students.present);
    expect(rows.reduce((s, r) => s + Number(r.absent), 0)).toBe(today.students.absent);
    expect(rows.reduce((s, r) => s + Number(r.total), 0)).toBe(today.students.total);
  });

  it("\"present of\" counts the same students as the %: a student on leave is in neither (TEACHING-19)", async () => {
    const DAY2 = "2026-10-08";
    const access = await accessFor(f, f.teacherA.id);
    const keys = ["absent", "leave", "present", "present", "late"];
    await withSchool(as(f, f.teacherA.id), (tx) => saveClassAttendance(tx, as(f, f.teacherA.id), access, {
      sectionId: f.sectionA.id, date: d(DAY2), periodNo: 0, timeZone: TZ, now: at(DAY2, "09:00"),
      entries: f.studentsA.map((s, i) => ({ studentId: s.id, statusKey: keys[i] })),
    }));
    const ctx = as(f, f.principal.id);
    const today = await withSchool(ctx, (tx) => attendanceToday(tx, ctx, d(DAY2)));
    expect(today.students).toMatchObject({ marked: 5, present: 3, leave: 1, counted: 4, percent: 75 });
    expect(Math.round((today.students.present / today.students.counted) * 1000) / 10).toBe(today.students.percent);
  });

  it("the Principal reminds the class teacher of a section not marked: a notification and an audit entry", async () => {
    const ctx = as(f, f.principal.id);
    const access = await accessFor(f, f.principal.id);
    const out = await withSchool(ctx, (tx) => remindNotMarked(tx, ctx, access, { sectionIds: [f.sectionA.id, f.sectionB.id], date: d(DAY), now: at(DAY, "09:30"), timeZone: TZ }));
    expect(out.reminded).toEqual(["Kavitha Nair"]);
    expect(out.skipped.map((s) => s.why)).toEqual(["already marked"]);
    const { notes, audit, rows } = await withSchool(ctx, async (tx) => ({
      notes: await tx.notification.findMany({ where: { userLoginId: f.teacherB.id, type: "work-reminder" } }),
      audit: await tx.auditLogEntry.findMany({ where: { action: REMIND_ACTION, recordId: f.sectionB.id } }),
      rows: await notMarkedOn(tx, ctx, access, d(DAY), at(DAY, "00:00")),
    }));
    expect(notes).toHaveLength(1);
    expect(notes[0].text).toMatch(/Please take today's attendance for .*B/);
    expect(audit).toHaveLength(1);
    expect(rows.map((r) => r.sectionId)).toEqual([f.sectionB.id]);
    expect(rows[0].remindedAt).not.toBeNull();
  });

  it("a class teacher cannot send whole-school reminders", async () => {
    const ctx = as(f, f.teacherA.id);
    const access = await accessFor(f, f.teacherA.id);
    await expect(withSchool(ctx, (tx) => remindNotMarked(tx, ctx, access, { sectionIds: [f.sectionB.id], date: d(DAY), now: at(DAY, "09:30"), timeZone: TZ })))
      .rejects.toThrow(/whole school/);
  });

  it("an Academic Head (View in 05-roles) is refused saving attendance by the server", async () => {
    const ctx = as(f, head.id);
    const access = await accessFor(f, head.id);
    expect(access.students).toBe("all");
    await expect(withSchool(ctx, (tx) => saveClassAttendance(tx, ctx, access, {
      sectionId: f.sectionB.id, date: d(DAY), periodNo: 0, timeZone: TZ, now: at(DAY, "09:40"),
      entries: f.studentsB.map((s) => ({ studentId: s.id, statusKey: "present" })),
    }))).rejects.toThrow();
  });
});

describe("Desk pages by role", () => {
  it("Principal, School Admin and Vice Principal do not take attendance or record student leave; they open the class-wise register", async () => {
    for (const id of [f.principal.id, f.admin.id, vp.id]) {
      const p = await pagesFor(id);
      expect(p.take).toBe("hidden");
      expect(p.studentLeave).toBe("hidden");
      expect(p.register).not.toBe("hidden");
      expect((await accessFor(f, id)).classWise).toBe(true);
    }
    expect((await pagesFor(f.admin.id)).register).toBe("view");
  });

  it("the Academic Head reads the register only; a class teacher keeps every desk page", async () => {
    const h = await pagesFor(head.id);
    expect([h.take, h.studentLeave, h.staff]).toEqual(["hidden", "hidden", "hidden"]);
    const t = await pagesFor(f.teacherA.id);
    expect([t.take, t.studentLeave, t.register]).toEqual(["full", "full", "full"]);
    expect((await accessFor(f, f.teacherA.id)).classWise).toBe(false);
  });

  it("a Principal who is also a class teacher keeps taking attendance (the widest role wins)", () => {
    expect(pageMode({ roles: [{ key: "principal" }, { key: "class-teacher" }] }, "attendance-management", "take")).toBe("full");
    expect(pageMode({ roles: [{ key: "principal" }] }, "fee-management", "collect")).toBe("hidden");
    expect(pageMode({ roles: [{ key: "accountant" }, { key: "school-admin" }] }, "fee-management", "collect")).toBe("full");
  });
});
