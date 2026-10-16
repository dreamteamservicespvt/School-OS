// The Student Leave list and its export (05 §2): a class teacher's "own" reach
// is applied in the query, the date filter keeps leave that touches the
// period, and roles that may not decide or open a page are refused on the server.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { reachFor } from "@/lib/permissions";
import "@/lib/attendance/handlers";
import { decideStudentLeave, recordStudentLeave } from "@/lib/attendance/student-leave";
import { studentLeaveDetail, studentLeaveList } from "@/lib/attendance/student-leave-list";
import { periodFromSearch } from "@/lib/periods";
import { accessFor, as, d, makeAttendanceSchool, TZ, type Fixture } from "./fixture";

let f: Fixture;
const ids: Record<string, string> = {};
beforeAll(async () => {
  f = await makeAttendanceSchool("Leave List School");
  const office = await accessFor(f, f.officeLogin.id);
  const principal = await accessFor(f, f.principal.id);
  const rec = (who: string, access: typeof office, studentId: string, from: string, to: string, approveNow = false) =>
    withSchool(as(f, who), (tx) => recordStudentLeave(tx, as(f, who), access, { studentId, leaveTypeId: f.medical.id, from: d(from), to: d(to), halfDay: false, reason: "Fever", documentFileId: null, approveNow }));
  ids.a = (await rec(f.officeLogin.id, office, f.studentsA[0].id, "2026-10-21", "2026-10-22")).request.id;
  ids.b = (await rec(f.officeLogin.id, office, f.studentsB[1].id, "2026-11-02", "2026-11-03")).request.id;
  ids.approved = (await rec(f.principal.id, principal, f.studentsA[1].id, "2026-10-26", "2026-10-26", true)).request.id;
});

const list = async (userId: string, extra: Partial<Parameters<typeof studentLeaveList>[3]> = {}) => {
  const access = await accessFor(f, userId);
  return withSchool(as(f, userId), (tx) => studentLeaveList(tx, as(f, userId), access, { status: "all", skip: 0, take: 50, ...extra }));
};

describe("Student Leave list", () => {
  it("shows the office every student's leave, with counts by status", async () => {
    const r = await list(f.officeLogin.id);
    expect(r.rows.map((x) => x.id).sort()).toEqual([ids.a, ids.b, ids.approved].sort());
    expect(r.counts).toEqual({ WAITING: 2, APPROVED: 1 });
    expect(r.classOf.get(f.studentsB[1].id)).toBe("Class 5 B");
  });

  it("limits a class teacher to their own section in the query, even when another section is asked for", async () => {
    const own = await list(f.teacherA.id);
    expect(own.rows.map((x) => x.id).sort()).toEqual([ids.a, ids.approved].sort());
    const other = await list(f.teacherA.id, { section: f.sectionB.id });
    expect(other.rows).toHaveLength(0);
    expect(other.total).toBe(0);
  });

  it("keeps leave that touches any day of the chosen dates", async () => {
    const range = periodFromSearch({ period: "custom", from: "2026-10-22", to: "2026-10-30" }, { timeZone: TZ });
    const r = await list(f.officeLogin.id, { range });
    expect(r.rows.map((x) => x.id).sort()).toEqual([ids.a, ids.approved].sort());
    const waiting = await list(f.officeLogin.id, { range, status: "WAITING" });
    expect(waiting.rows.map((x) => x.id)).toEqual([ids.a]);
  });

  it("filters by search on name or admission number", async () => {
    const r = await list(f.officeLogin.id, { q: "ADM-007" });
    expect(r.rows.map((x) => x.id)).toEqual([ids.b]);
  });

  it("opens the detail only within reach", async () => {
    const access = await accessFor(f, f.teacherA.id);
    const mine = await withSchool(as(f, f.teacherA.id), (tx) => studentLeaveDetail(tx, as(f, f.teacherA.id), access, ids.a));
    expect(mine?.r.id).toBe(ids.a);
    expect(mine?.waitingFor).toBe("Ravi Teja");
    const other = await withSchool(as(f, f.teacherA.id), (tx) => studentLeaveDetail(tx, as(f, f.teacherA.id), access, ids.b));
    expect(other).toBeNull();
  });

  it("marks only the requests this person may decide", async () => {
    const teacher = await list(f.teacherA.id, { status: "WAITING" });
    expect([...teacher.decidable]).toEqual([ids.a]);
    const office = await list(f.officeLogin.id, { status: "WAITING" });
    expect(office.decidable.size).toBe(0);
  });
});

describe("role checks on the server", () => {
  it("refuses a decision from someone outside the request's reach", async () => {
    const teacherA = await accessFor(f, f.teacherA.id);
    await expect(withSchool(as(f, f.teacherA.id), (tx) => decideStudentLeave(tx, as(f, f.teacherA.id), teacherA, ids.b, "approve", null))).rejects.toThrow();
    const office = await accessFor(f, f.officeLogin.id);
    await expect(withSchool(as(f, f.officeLogin.id), (tx) => decideStudentLeave(tx, as(f, f.officeLogin.id), office, ids.a, "approve", null))).rejects.toThrow();
    const still = await withSchool(as(f, f.principal.id), (tx) => tx.leaveRequest.findUniqueOrThrow({ where: { id: ids.a } }));
    expect(still.status).toBe("WAITING");
  });

  it("gives Settings and Devices & QR only to full access, Staff Attendance only to HR, self or full", async () => {
    const [principal, teacher, office, hr] = await Promise.all([f.principal.id, f.teacherA.id, f.officeLogin.id, f.hrLogin.id].map((u) => accessFor(f, u)));
    expect(principal.admin).toBe(true);
    expect(teacher.admin).toBe(false);
    expect(office.admin).toBe(false);
    expect(hr.admin).toBe(false);
    expect(teacher.staff).toBe("self");
    expect(office.staff).toBe("none");
    expect(hr.staff).toBe("all");
    expect(hr.studentLeave).toBe("none");
    expect(teacher.studentLeave).toBe("own");
    expect(office.studentLeave).toBe("all");
  });

  it("the roles table keeps HR and the office from approving or exporting outside their reach", async () => {
    const office = await accessIn(f.officeLogin.id, f.school.id);
    const principal = await accessIn(f.principal.id, f.school.id);
    expect(reachFor(principal!.permissions, "attendance-management", "approve")).toBe("all");
    expect(reachFor(office!.permissions, "attendance-management", "approve")).not.toBe("all");
  });
});
