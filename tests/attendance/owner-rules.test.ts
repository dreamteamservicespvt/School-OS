// Owner's rules of 12 Oct 2026 for Attendance: HR decides staff attendance
// corrections (never one about their own attendance), and Parent Link's
// attendance calendar goes back only to the start of the current school year.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { withSchool } from "@/lib/db";
import { decide } from "@/lib/approvals";
import { requestCorrection } from "@/lib/attendance/corrections";
import { parseMonth, studentCalendar } from "@/lib/attendance/calendar-months";
import { allSections } from "@/lib/parent-link/section-list";
import type { GuardianView } from "@/lib/parent-link/sections";
import "@/lib/attendance/handlers";
import { accessFor, as, d, makeAttendanceSchool, type Fixture } from "./fixture";

let f: Fixture;
const today = d("2026-10-12");

beforeAll(async () => {
  f = await makeAttendanceSchool("Attendance Owner Rules School");
  await withSchool({ schoolId: f.school.id, userId: null }, async (tx) => {
    const past = await tx.academicYear.create({ data: { schoolId: f.school.id, campusId: f.school.campus.id, name: "2025-26", startDate: d("2025-04-01"), endDate: d("2026-03-31"), status: "CLOSED" } });
    const cls = await tx.schoolClass.create({ data: { schoolId: f.school.id, campusId: f.school.campus.id, name: "Class 4", sortOrder: 4 } });
    const sec = await tx.section.create({ data: { schoolId: f.school.id, classId: cls.id, academicYearId: past.id, name: "A" } });
    await tx.enrolment.create({ data: { schoolId: f.school.id, studentId: f.studentsA[0].id, academicYearId: past.id, classId: cls.id, sectionId: sec.id, rollNo: 1, status: "PROMOTED" } });
    await tx.attendanceMark.createMany({ data: [
      { schoolId: f.school.id, academicYearId: past.id, studentId: f.studentsA[0].id, sectionId: sec.id, date: d("2025-10-06"), statusKey: "absent" },
      { schoolId: f.school.id, academicYearId: f.year.id, studentId: f.studentsA[0].id, sectionId: f.sectionA.id, date: d("2026-06-15"), statusKey: "late" },
    ] });
  });
}, 120_000);

afterAll(() => { vi.useRealTimers(); });

describe("staff attendance corrections go to HR", () => {
  const correct = async (staffId: string) => {
    const access = await accessFor(f, f.admin.id);
    return withSchool(as(f, f.admin.id), (tx) => requestCorrection(tx, as(f, f.admin.id), access, { forWhom: "staff", sectionId: null, date: d("2026-10-09"), periodNo: 0, changes: [{ id: staffId, to: "present" }], reason: "Was at the district training" }));
  };

  it("HR decides a teacher's correction", async () => {
    const c = await correct(f.staffA.id);
    const approval = await withSchool(as(f, f.hrLogin.id), (tx) => tx.approval.findUniqueOrThrow({ where: { id: c.approvalId! } }));
    expect(approval.currentApproverRole).toBe("hr");
    await withSchool(as(f, f.hrLogin.id), (tx) => decide(tx, as(f, f.hrLogin.id), approval.id, "approve", null));
    const after = await withSchool(as(f, f.hrLogin.id), (tx) => tx.attendanceCorrection.findUniqueOrThrow({ where: { id: c.id } }));
    expect(after.status).toBe("APPROVED");
  });

  it("HR's own attendance goes past HR, and the person themselves is refused", async () => {
    const c = await correct(f.staffHr.id);
    const approval = await withSchool(as(f, f.hrLogin.id), (tx) => tx.approval.findUniqueOrThrow({ where: { id: c.approvalId! } }));
    expect(approval.currentApproverRole).toBe("principal");
    await expect(withSchool(as(f, f.hrLogin.id), (tx) => decide(tx, as(f, f.hrLogin.id), approval.id, "approve", null))).rejects.toThrow(/about you/);
  });

  it("the Principal's own attendance is not the Principal's to decide", async () => {
    const c = await correct(f.staffPrincipal.id);
    const approval = await withSchool(as(f, f.principal.id), (tx) => tx.approval.findUniqueOrThrow({ where: { id: c.approvalId! } }));
    await expect(withSchool(as(f, f.principal.id), (tx) => decide(tx, as(f, f.principal.id), approval.id, "approve", null))).rejects.toThrow(/about you/);
  });
});

describe("Parent Link attendance goes back to the start of this school year", () => {
  it("staff screens reach last year; Parent Link stops at April of this year", async () => {
    const ctx = as(f, f.principal.id);
    const staff = await withSchool(ctx, (tx) => studentCalendar(tx, ctx, f.studentsA[0].id, parseMonth("2025-10"), today));
    expect(staff.bounds.min).toBe("2025-04");
    const parent = await withSchool(ctx, (tx) => studentCalendar(tx, ctx, f.studentsA[0].id, parseMonth("2025-10"), today, "current-year"));
    expect(parent.bounds).toEqual({ min: "2026-04", max: "2026-10" });
    expect(parent.view.month).toBe("2026-04");
  });

  it("the Parent Link section itself never shows last year's months", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-12T06:00:00Z"));
    const section = allSections().find((s) => s.key === "attendance")!;
    const child = { id: f.studentsA[0].id, name: f.studentsA[0].name, firstName: "Aarav", classLabel: "Class 5 A", sectionId: f.sectionA.id, classId: f.cls.id, admissionNo: "ADM-001", photoFileId: null };
    const view = { schoolId: f.school.id, schoolName: "School", timeZone: "Asia/Kolkata", linkId: "x", guardianId: f.studentsA[0].guardianId, guardianName: "Parent", language: "en", children: [child], child, token: "", academicYearId: f.year.id, month: "2025-10" } as unknown as GuardianView;
    const sys = { schoolId: f.school.id, userId: null };
    const data = await withSchool(sys, (tx) => section.load(tx, sys, view)) as { bounds: { min: string }; view: { month: string } };
    vi.useRealTimers();
    expect(data.bounds.min).toBe("2026-04");
    expect(data.view.month).toBe("2026-04");
  });
});
