// Take Attendance rules (05 §5, rules 17 and 18, Done when 2 to 5, and
// 08-platform-security.md §10): holidays off, one mark per student per day,
// one absence message per absence, leave in advance, the lock and
// corrections through Approvals, and offline saves.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { decide } from "@/lib/approvals";
import "@/lib/attendance/handlers";
import { saveClassAttendance, loadSheet, LockedError, type Entry } from "@/lib/attendance/marks";
import { requestCorrection } from "@/lib/attendance/corrections";
import { afterAttendanceSaved } from "@/lib/attendance/alerts";
import { attendanceSummary } from "@/lib/attendance/summary";
import { recordStudentLeave } from "@/lib/attendance/student-leave";
import { OffDayError } from "@/lib/attendance/calendar";
import { NotYoursError } from "@/lib/attendance/access";
import { accessFor, as, at, d, makeAttendanceSchool, TZ, type Fixture } from "./fixture";

let f: Fixture;
beforeAll(async () => { f = await makeAttendanceSchool(); });

const allPresent = (list: { id: string }[], except: Record<string, string> = {}): Entry[] => list.map((s) => ({ studentId: s.id, statusKey: except[s.id] ?? "present" }));

async function save(userId: string, input: { sectionId: string; date: Date; entries: Entry[]; now: Date; offline?: { clientId: string; takenAt: Date; clientNow: Date }; clientId?: string }) {
  const access = await accessFor(f, userId);
  return withSchool(as(f, userId), (tx) => saveClassAttendance(tx, as(f, userId), access, { periodNo: 0, timeZone: TZ, ...input }));
}

describe("holidays switch attendance off (rule 18, Done when 5)", () => {
  it("refuses to save on a School Calendar holiday, with the holiday's name", async () => {
    await expect(save(f.teacherA.id, { sectionId: f.sectionA.id, date: d("2026-10-02"), entries: allPresent(f.studentsA), now: at("2026-10-02", "09:00") }))
      .rejects.toThrow(/Holiday: Gandhi Jayanti\. Attendance is off for 02-10-2026/);
  });

  it("refuses Sundays", async () => {
    await expect(save(f.teacherA.id, { sectionId: f.sectionA.id, date: d("2026-10-04"), entries: allPresent(f.studentsA), now: at("2026-10-04", "09:00") })).rejects.toBeInstanceOf(OffDayError);
  });

  it("allows a holiday when the School Calendar says the school opens that day", async () => {
    await withSchool(as(f, f.principal.id), (tx) => tx.calendarEntry.create({ data: { schoolId: f.school.id, academicYearId: f.year.id, type: "event", title: "Sports practice", startDate: d("2026-10-11"), endDate: d("2026-10-11"), attendanceOn: true } }));
    const r = await save(f.teacherA.id, { sectionId: f.sectionA.id, date: d("2026-10-11"), entries: allPresent(f.studentsA), now: at("2026-10-11", "09:00") });
    expect(r.outcome).toBe("saved");
  });

  it("leaves holidays and Sundays out of the % and the working days", async () => {
    await save(f.teacherA.id, { sectionId: f.sectionA.id, date: d("2026-10-01"), entries: allPresent(f.studentsA), now: at("2026-10-01", "09:00") });
    await save(f.teacherA.id, { sectionId: f.sectionA.id, date: d("2026-10-03"), entries: allPresent(f.studentsA, { [f.studentsA[0].id]: "absent" }), now: at("2026-10-03", "09:00") });
    const sum = await withSchool(as(f, f.principal.id), (tx) => attendanceSummary(tx, as(f, f.principal.id), { studentId: f.studentsA[0].id, from: d("2026-10-01"), to: d("2026-10-04") }));
    // 1 Oct (Thu), 2 Oct holiday, 3 Oct (Sat), 4 Oct Sunday.
    expect(sum.workingDays).toBe(2);
    expect(sum.people.get(f.studentsA[0].id)).toMatchObject({ countedDays: 2, present: 1, absent: 1, percent: 50 });
  });
});

describe("own classes only (reach limits)", () => {
  it("a class teacher cannot take another section's attendance", async () => {
    await expect(save(f.teacherA.id, { sectionId: f.sectionB.id, date: d("2026-10-05"), entries: allPresent(f.studentsB), now: at("2026-10-05", "09:00") })).rejects.toBeInstanceOf(NotYoursError);
  });

  it("the HR template sees staff attendance only, the office template student leave only", async () => {
    const hr = await accessFor(f, f.hrLogin.id);
    expect(hr.students).toBe("none");
    expect(hr.staff).toBe("all");
    const office = await accessFor(f, f.officeLogin.id);
    expect(office.students).toBe("none");
    expect(office.studentLeave).toBe("all");
    await expect(save(f.hrLogin.id, { sectionId: f.sectionA.id, date: d("2026-10-05"), entries: allPresent(f.studentsA), now: at("2026-10-05", "09:00") })).rejects.toBeInstanceOf(NotYoursError);
  });

  it("a class teacher may not open another class's sheet either", async () => {
    const access = await accessFor(f, f.teacherA.id);
    await expect(withSchool(as(f, f.teacherA.id), (tx) => loadSheet(tx, as(f, f.teacherA.id), access, { sectionId: f.sectionB.id, date: d("2026-10-05"), periodNo: 0, now: at("2026-10-05", "09:00"), timeZone: TZ }))).rejects.toBeInstanceOf(NotYoursError);
  });
});

describe("one mark per student per day, one message per absence (Done when 2)", () => {
  const date = d("2026-10-05");
  it("saving twice updates the marks and never duplicates them", async () => {
    const absent = f.studentsA[1].id;
    const r1 = await save(f.teacherA.id, { sectionId: f.sectionA.id, date, entries: allPresent(f.studentsA, { [absent]: "absent" }), now: at("2026-10-05", "08:50") });
    expect(r1.outcome).toBe("saved");
    expect(r1.counts).toEqual({ present: 4, absent: 1 });
    expect(r1.messagesAt?.toISOString()).toBe(at("2026-10-05", "09:05").toISOString());
    const r2 = await save(f.teacherA.id, { sectionId: f.sectionA.id, date, entries: allPresent(f.studentsA, { [absent]: "absent", [f.studentsA[2].id]: "late" }), now: at("2026-10-05", "08:55") });
    expect(r2.changed).toBe(1);
    const marks = await withSchool(as(f, f.principal.id), (tx) => tx.attendanceMark.findMany({ where: { sectionId: f.sectionA.id, date } }));
    expect(marks).toHaveLength(5);
  });

  it("with no WhatsApp or SMS connected, saving does not promise an absence message (QA ACAD)", async () => {
    const sys = { schoolId: f.school.id, userId: null };
    await withSchool(sys, (tx) => tx.messagingChannel.updateMany({ data: { isOn: false } }));
    try {
      const r = await save(f.teacherB.id, { sectionId: f.sectionB.id, date: d("2026-10-06"), entries: allPresent(f.studentsB, { [f.studentsB[0].id]: "absent" }), now: at("2026-10-06", "08:50") });
      expect(r.messagesAt).toBeNull();
      expect(r.noChannel).toBe(true);
    } finally {
      await withSchool(sys, (tx) => tx.messagingChannel.updateMany({ data: { isOn: true } }));
    }
  });

  it("the parent of the absent student gets exactly one message, even when the automation runs twice", async () => {
    const ctx = as(f, null as unknown as string);
    const sys = { schoolId: f.school.id, userId: null };
    await withSchool(sys, (tx) => afterAttendanceSaved(tx, sys, { sectionId: f.sectionA.id, date: "2026-10-05" }));
    await withSchool(sys, (tx) => afterAttendanceSaved(tx, sys, { sectionId: f.sectionA.id, date: "2026-10-05" }));
    const alerts = await withSchool(sys, (tx) => tx.attendanceAlert.findMany({ where: { date, kind: "absence" } }));
    expect(ctx.schoolId).toBe(f.school.id);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].studentId).toBe(f.studentsA[1].id);
    expect(alerts[0].guardianId).toBe(f.studentsA[1].guardianId);
    expect(alerts[0].text).toBe("Diya Reddy (Class 5 A) absent on 05-10-2026");
    expect(alerts[0].note).toBeNull();
    expect(alerts[0].status).toBe("sent");
    // Sent through Communication: one message to that parent, not two.
    const sent = await withSchool(sys, (tx) => tx.messageRecipient.findMany({ where: { guardianId: f.studentsA[1].guardianId } }));
    expect(sent).toHaveLength(1);
    expect(sent[0].channel).toBe("whatsapp");
  });

  it("a student marked absent then corrected before the wait gets no message", async () => {
    const date2 = d("2026-10-06");
    const s = f.studentsA[3].id;
    await save(f.teacherA.id, { sectionId: f.sectionA.id, date: date2, entries: allPresent(f.studentsA, { [s]: "absent" }), now: at("2026-10-06", "08:50") });
    await save(f.teacherA.id, { sectionId: f.sectionA.id, date: date2, entries: allPresent(f.studentsA), now: at("2026-10-06", "08:52") });
    const sys = { schoolId: f.school.id, userId: null };
    await withSchool(sys, (tx) => afterAttendanceSaved(tx, sys, { sectionId: f.sectionA.id, date: "2026-10-06" }));
    expect(await withSchool(sys, (tx) => tx.attendanceAlert.count({ where: { date: date2, kind: "absence" } }))).toBe(0);
  });
});

describe("approved leave shows in advance, with no absence message (Done when 3)", () => {
  it("shows Leave in Take Attendance and keeps it Leave when saved", async () => {
    const student = f.studentsA[4];
    const access = await accessFor(f, f.teacherA.id);
    const r = await withSchool(as(f, f.teacherA.id), (tx) => recordStudentLeave(tx, as(f, f.teacherA.id), access, { studentId: student.id, leaveTypeId: f.medical.id, from: d("2026-10-07"), to: d("2026-10-08"), halfDay: false, reason: "Fever, doctor's note", documentFileId: null, approveNow: true }));
    expect(r.approved).toBe(true);
    const sheet = await withSchool(as(f, f.teacherA.id), (tx) => loadSheet(tx, as(f, f.teacherA.id), access, { sectionId: f.sectionA.id, date: d("2026-10-07"), periodNo: 0, now: at("2026-10-07", "08:30"), timeZone: TZ }));
    expect(sheet.students.find((s) => s.studentId === student.id)?.leave?.typeName).toBe("Medical");
    // Even if the phone sends Absent for them, they stay on Leave.
    await save(f.teacherA.id, { sectionId: f.sectionA.id, date: d("2026-10-07"), entries: allPresent(f.studentsA, { [student.id]: "absent" }), now: at("2026-10-07", "08:50") });
    const sys = { schoolId: f.school.id, userId: null };
    await withSchool(sys, (tx) => afterAttendanceSaved(tx, sys, { sectionId: f.sectionA.id, date: "2026-10-07" }));
    const mark = await withSchool(sys, (tx) => tx.attendanceMark.findFirst({ where: { studentId: student.id, date: d("2026-10-07") } }));
    expect(mark?.statusKey).toBe("leave");
    expect(await withSchool(sys, (tx) => tx.attendanceAlert.count({ where: { studentId: student.id, date: d("2026-10-07") } }))).toBe(0);
  });
});

describe("the lock and corrections (rule 17, Done when 4)", () => {
  const date = d("2026-10-09");
  it("a teacher cannot change a mark after the lock time; the message names the rule", async () => {
    await save(f.teacherA.id, { sectionId: f.sectionA.id, date, entries: allPresent(f.studentsA), now: at("2026-10-09", "09:00") });
    const err = await save(f.teacherA.id, { sectionId: f.sectionA.id, date, entries: allPresent(f.studentsA, { [f.studentsA[0].id]: "absent" }), now: at("2026-10-09", "11:30") }).catch((e) => e);
    expect(err).toBeInstanceOf(LockedError);
    expect(err.message).toBe("Attendance for 09-10-2026 locked at 11:00 AM (Attendance Settings). Request a correction.");
  });

  it("a correction goes to Approvals; when approved the register changes and the audit log keeps the original", async () => {
    const access = await accessFor(f, f.teacherA.id);
    const student = f.studentsA[0].id;
    const c = await withSchool(as(f, f.teacherA.id), (tx) => requestCorrection(tx, as(f, f.teacherA.id), access, { forWhom: "student", sectionId: f.sectionA.id, date, periodNo: 0, changes: [{ id: student, to: "absent" }], reason: "Left after the first period, mother came" }));
    const approval = await withSchool(as(f, f.principal.id), (tx) => tx.approval.findUniqueOrThrow({ where: { id: c.approvalId! } }));
    expect(approval.type).toBe("attendance-correction");
    expect(approval.status).toBe("WAITING");
    // Still the original until decided.
    expect((await withSchool(as(f, f.principal.id), (tx) => tx.attendanceMark.findFirst({ where: { studentId: student, date } })))?.statusKey).toBe("present");
    await withSchool(as(f, f.principal.id), (tx) => decide(tx, as(f, f.principal.id), approval.id, "approve", null));
    const mark = await withSchool(as(f, f.principal.id), (tx) => tx.attendanceMark.findFirst({ where: { studentId: student, date } }));
    expect(mark?.statusKey).toBe("absent");
    const audit = await withSchool(as(f, f.principal.id), (tx) => tx.auditLogEntry.findFirst({ where: { action: "attendance-corrected", recordId: c.id } }));
    expect(audit?.before).toEqual([{ name: "Aarav Sharma", status: "present" }]);
    const corr = await withSchool(as(f, f.principal.id), (tx) => tx.attendanceCorrection.findUnique({ where: { id: c.id } }));
    expect(corr?.status).toBe("APPROVED");
  });

  it("a correction is only for a school day that has come, inside the year (QA ACAD)", async () => {
    const access = await accessFor(f, f.teacherA.id);
    const ask = (day: string) => withSchool(as(f, f.teacherA.id), (tx) => requestCorrection(tx, as(f, f.teacherA.id), access, {
      forWhom: "student", sectionId: f.sectionA.id, date: d(day), periodNo: 0, changes: [{ id: f.studentsA[1].id, to: "absent" }], reason: "Paper register entered later", today: d("2026-10-16"),
    }));
    await expect(ask("2026-12-01")).rejects.toThrow(/has not come yet/);
    await expect(ask("2026-10-04")).rejects.toThrow(/Sunday|off/i);
    await expect(ask("2026-10-02")).rejects.toThrow(/Holiday: Gandhi Jayanti/);
    await expect(ask("2026-03-10")).rejects.toThrow(/outside the academic year/);
    const none = await withSchool(as(f, f.principal.id), (tx) => tx.attendanceCorrection.count({ where: { date: { in: [d("2026-12-01"), d("2026-10-04"), d("2026-10-02"), d("2026-03-10")] } } }));
    expect(none).toBe(0);
  });

  it("a subject teacher cannot correct the class teacher's daily register (QA ACAD)", async () => {
    const access = { ...(await accessFor(f, f.teacherB.id)), teachingSections: [f.sectionA.id] };
    await expect(withSchool(as(f, f.teacherB.id), (tx) => requestCorrection(tx, as(f, f.teacherB.id), access, {
      forWhom: "student", sectionId: f.sectionA.id, date: d("2026-10-09"), periodNo: 0, changes: [{ id: f.studentsA[1].id, to: "absent" }], reason: "Not my class register", today: d("2026-10-16"),
    }))).rejects.toBeInstanceOf(NotYoursError);
  });

  it("the principal (lock override in Attendance Settings) may still change it, and it is audited", async () => {
    const r = await save(f.principal.id, { sectionId: f.sectionA.id, date, entries: allPresent(f.studentsA, { [f.studentsA[2].id]: "late" }), now: at("2026-10-09", "12:00") });
    expect(r.outcome).toBe("saved");
    const audit = await withSchool(as(f, f.principal.id), (tx) => tx.auditLogEntry.findFirst({ where: { action: "attendance-changed-after-lock" }, orderBy: { at: "desc" } }));
    expect(audit).not.toBeNull();
  });
});

describe("offline saves (08-platform-security.md §10)", () => {
  it("the same offline save sent twice counts once", async () => {
    const date = d("2026-10-12");
    const offline = { clientId: "phone-1-save-1", takenAt: at("2026-10-12", "08:40"), clientNow: at("2026-10-12", "10:00") };
    const r1 = await save(f.teacherB.id, { sectionId: f.sectionB.id, date, entries: allPresent(f.studentsB, { [f.studentsB[0].id]: "absent" }), now: at("2026-10-12", "10:00"), offline });
    const r2 = await save(f.teacherB.id, { sectionId: f.sectionB.id, date, entries: allPresent(f.studentsB, { [f.studentsB[0].id]: "absent" }), now: at("2026-10-12", "10:01"), offline });
    expect(r1.outcome).toBe("saved");
    expect(r2.outcome).toBe("unchanged");
    expect(await withSchool(as(f, f.principal.id), (tx) => tx.attendanceMark.count({ where: { sectionId: f.sectionB.id, date } }))).toBe(5);
    expect(await withSchool(as(f, f.principal.id), (tx) => tx.attendanceSubmission.count({ where: { clientId: "phone-1-save-1" } }))).toBe(1);
  });

  it("two people marking one register offline: the first is saved, the second becomes a correction showing both versions", async () => {
    const date = d("2026-10-13");
    await save(f.teacherB.id, { sectionId: f.sectionB.id, date, entries: allPresent(f.studentsB), now: at("2026-10-13", "09:30"), offline: { clientId: "b-1", takenAt: at("2026-10-13", "08:45"), clientNow: at("2026-10-13", "09:30") } });
    const r = await save(f.principal.id, { sectionId: f.sectionB.id, date, entries: allPresent(f.studentsB, { [f.studentsB[1].id]: "absent" }), now: at("2026-10-13", "09:40"), offline: { clientId: "p-1", takenAt: at("2026-10-13", "08:50"), clientNow: at("2026-10-13", "09:40") } });
    expect(r.outcome).toBe("correction");
    const c = await withSchool(as(f, f.principal.id), (tx) => tx.attendanceCorrection.findUniqueOrThrow({ where: { id: r.correctionId! } }));
    expect(c.kind).toBe("offline-conflict");
    expect((c.versions as { saved: unknown[]; second: unknown[] }).saved).toHaveLength(5);
    expect((c.versions as { saved: unknown[]; second: unknown[] }).second).toHaveLength(5);
    expect(c.entries).toEqual([{ id: f.studentsB[1].id, name: "Diya Reddy", from: "present", to: "absent", note: null }]);
    // The first version stays.
    expect((await withSchool(as(f, f.principal.id), (tx) => tx.attendanceMark.findFirst({ where: { studentId: f.studentsB[1].id, date } })))?.statusKey).toBe("present");
  });

  it("the lock is judged by when it was taken on the phone, if it arrives the same day", async () => {
    const date = d("2026-10-14");
    const r = await save(f.teacherB.id, { sectionId: f.sectionB.id, date, entries: allPresent(f.studentsB), now: at("2026-10-14", "15:00"), offline: { clientId: "b-14", takenAt: at("2026-10-14", "08:45"), clientNow: at("2026-10-14", "15:00") } });
    expect(r.outcome).toBe("saved");
  });

  it("arriving on a later day makes it a correction", async () => {
    const date = d("2026-10-15");
    const r = await save(f.teacherB.id, { sectionId: f.sectionB.id, date, entries: allPresent(f.studentsB), now: at("2026-10-16", "08:00"), offline: { clientId: "b-15", takenAt: at("2026-10-15", "08:45"), clientNow: at("2026-10-16", "08:00") } });
    expect(r.outcome).toBe("correction");
    const c = await withSchool(as(f, f.principal.id), (tx) => tx.attendanceCorrection.findUniqueOrThrow({ where: { id: r.correctionId! } }));
    expect(c.kind).toBe("offline-late");
  });

  it("a phone clock far off is flagged and the server's time is used", async () => {
    const date = d("2026-10-16");
    // The phone thinks it is 08:00 when the server says 11:30: 3.5 hours behind.
    const r = await save(f.teacherB.id, { sectionId: f.sectionB.id, date, entries: allPresent(f.studentsB), now: at("2026-10-16", "11:30"), offline: { clientId: "b-16", takenAt: at("2026-10-16", "07:50"), clientNow: at("2026-10-16", "08:00") } });
    expect(r.clockFlagged).toBe(true);
    // Taken at 07:50 by the phone's clock = 11:20 by the server's, after the 11:00 lock.
    expect(r.outcome).toBe("correction");
    const sub = await withSchool(as(f, f.principal.id), (tx) => tx.attendanceSubmission.findFirst({ where: { clientId: "b-16" } }));
    expect(sub?.clockFlagged).toBe(true);
    expect(sub?.clockSkewSeconds).toBe(3.5 * 3600);
  });
});
