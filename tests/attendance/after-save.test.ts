// Automation A4 after every way a student's mark is written (gap list G08):
// device punches, approved corrections and approved leave queue it too; the
// absence message is Communication's "Absent today" (one setting), and a
// save never promises a message that cannot go; skipped messages are shown
// with why; a gate punch against a register Absent holds the message and
// asks the class teacher; a late punch never changes a staff mark set by
// hand or locked. Also: approved leave turns saved days into Leave
// (browser finding TEACHING-02) and a correction shows its change on the
// request (TEACHING-17).
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { decide, stepWords } from "@/lib/approvals";
import "@/lib/attendance/handlers";
// Loaded before the first decision, so loading every module's follow-ups never eats the decision's transaction time.
import "@/lib/approval-handlers";
import { approvalFacts } from "@/lib/approval-facts";
import { addDevice, mapUser, receivePunches } from "@/lib/attendance/devices";
import { saveClassAttendance, type Entry } from "@/lib/attendance/marks";
import { absenceMessagesOn, afterAttendanceSaved, messageCountText } from "@/lib/attendance/alerts";
import { requestCorrection } from "@/lib/attendance/corrections";
import { recordStudentLeave } from "@/lib/attendance/student-leave";
import { saveStaffAttendance } from "@/lib/attendance/staff";
import { setAttendanceFeature } from "@/lib/attendance/settings";
import { attendanceSummary } from "@/lib/attendance/summary";
import { accessFor, as, at, d, makeAttendanceSchool, TZ, type Fixture } from "./fixture";

let f: Fixture;
let deviceId: string;
const sys = () => ({ schoolId: f.school.id, userId: null });
const allPresent = (list: { id: string }[], except: Record<string, string> = {}): Entry[] => list.map((s) => ({ studentId: s.id, statusKey: except[s.id] ?? "present" }));

async function save(sectionId: string, students: { id: string }[], date: string, except: Record<string, string> = {}, userId = f.teacherA.id) {
  const access = await accessFor(f, userId);
  return withSchool(as(f, userId), (tx) => saveClassAttendance(tx, as(f, userId), access, { sectionId, date: d(date), periodNo: 0, timeZone: TZ, entries: allPresent(students, except), now: at(date, "09:30") }));
}
async function punch(list: { punchNo: string; userNo: string; time: string }[], now: Date) {
  return withSchool(sys(), async (tx) => receivePunches(tx, sys(), await tx.attendanceDevice.findUniqueOrThrow({ where: { id: deviceId } }), list, now, TZ));
}
const jobsFor = (date: string) => withSchool(sys(), async (tx) => (await tx.backgroundJob.findMany({ where: { kind: "attendance-after-save" } })).filter((j) => (j.payload as { date?: string }).date === date));
const run = (sectionId: string, date: string) => withSchool(sys(), (tx) => afterAttendanceSaved(tx, sys(), { sectionId, date }));
const alertOf = (studentId: string, date: string, kind = "absence") => withSchool(sys(), (tx) => tx.attendanceAlert.findFirst({ where: { studentId, date: d(date), kind } }));

beforeAll(async () => {
  f = await makeAttendanceSchool("After Save School");
  const access = await accessFor(f, f.principal.id);
  const ctx = as(f, f.principal.id);
  deviceId = await withSchool(ctx, async (tx) => {
    await setAttendanceFeature(tx, ctx, "attendance-devices", true);
    await tx.attendanceSetting.update({ where: { schoolId: f.school.id }, data: { staffMethods: ["register", "device"], studentMethods: ["register", "device"], lateAlertOn: true } });
    const r = await addDevice(tx, ctx, access, { name: "Gate", serialNo: "GATE-1", location: null, campusId: f.school.campus.id, deviceType: "rfid", allowedUsers: "both", ipAddress: null, connectionNote: null });
    await mapUser(tx, ctx, access, { deviceId: r.device.id, deviceUserNo: "S-1", who: `student:${f.studentsA[0].id}` });
    await mapUser(tx, ctx, access, { deviceId: r.device.id, deviceUserNo: "S-2", who: `student:${f.studentsA[1].id}` });
    await mapUser(tx, ctx, access, { deviceId: r.device.id, deviceUserNo: "T-2", who: `staff:${f.staffB.id}` });
    await mapUser(tx, ctx, access, { deviceId: r.device.id, deviceUserNo: "T-5", who: `staff:${f.staffOther.id}` });
    return r.device.id;
  });
});

describe("device punches run A4 (G08)", () => {
  it("a student's late gate punch queues the after-save step, and the late message is tried", async () => {
    const out = await punch([{ punchNo: "9001", userNo: "S-1", time: "2026-11-02T09:05:00+05:30" }], at("2026-11-02", "09:06"));
    expect(out[0].result).toBe("accepted");
    const jobs = await jobsFor("2026-11-02");
    expect(jobs.map((j) => (j.payload as { sectionId: string }).sectionId)).toEqual([f.sectionA.id]);
    await run(f.sectionA.id, "2026-11-02");
    // Communication's "Late arrival" message is off by default: the alert is kept as not sent, with why.
    expect(await alertOf(f.studentsA[0].id, "2026-11-02", "late")).toMatchObject({ status: "skipped", note: expect.stringMatching(/switched off/) });
  });

  it("a gate punch against a register Absent holds the parent's message and asks the class teacher", async () => {
    await punch([{ punchNo: "9002", userNo: "S-2", time: "2026-11-03T08:40:00+05:30" }], at("2026-11-03", "08:41"));
    await save(f.sectionA.id, f.studentsA, "2026-11-03", { [f.studentsA[1].id]: "absent" });
    await run(f.sectionA.id, "2026-11-03");
    const alert = await alertOf(f.studentsA[1].id, "2026-11-03");
    expect(alert).toMatchObject({ status: "skipped", note: expect.stringMatching(/^Punched in at 8:40 AM/) });
    expect(await withSchool(sys(), (tx) => tx.messageRecipient.count({ where: { guardianId: f.studentsA[1].guardianId } }))).toBe(0);
    const told = await withSchool(sys(), (tx) => tx.notification.findFirst({ where: { userLoginId: f.teacherA.id, text: { contains: "punched in at the gate" } } }));
    expect(told?.text).toMatch(/Diya Reddy punched in at the gate but is marked absent in Class 5 A/);
    // Shown with why, on Take Attendance and the class-wise view.
    const count = await withSchool(sys(), (tx) => absenceMessagesOn(tx, d("2026-11-03"), [f.sectionA.id]));
    expect(messageCountText(count, true)).toBe("Absence messages today: 1 not sent (1 punched in at the gate)");
  });

  it("a status the school made that counts as absent is messaged too", async () => {
    await withSchool(sys(), (tx) => tx.attendanceStatus.create({ data: { schoolId: f.school.id, key: "unexcused", name: "Unexcused", letter: "U", tone: "danger", counts: "absent", forWhom: "students" } }));
    await save(f.sectionA.id, f.studentsA, "2026-11-04", { [f.studentsA[2].id]: "unexcused" });
    await run(f.sectionA.id, "2026-11-04");
    expect(await alertOf(f.studentsA[2].id, "2026-11-04")).toMatchObject({ status: "sent" });
  });

  it("a punch that arrives after the lock never changes a staff mark set by hand; an early punch corrects a device mark, audited", async () => {
    const hr = await accessFor(f, f.principal.id);
    await withSchool(as(f, f.principal.id), (tx) => saveStaffAttendance(tx, as(f, f.principal.id), hr, { date: d("2026-11-02"), entries: [{ staffId: f.staffB.id, statusKey: "absent" }], now: at("2026-11-02", "09:00"), timeZone: TZ }));
    await punch([{ punchNo: "9101", userNo: "T-2", time: "2026-11-02T08:30:00+05:30" }], at("2026-11-02", "12:00"));
    const b = await withSchool(sys(), (tx) => tx.attendanceMark.findFirstOrThrow({ where: { staffId: f.staffB.id, date: d("2026-11-02") } }));
    expect(b.statusKey).toBe("absent");
    expect(b.inTime?.toISOString()).toBe(at("2026-11-02", "08:30").toISOString());
    // A device mark: the late first punch, then an earlier one synced before the lock.
    await punch([{ punchNo: "9102", userNo: "T-5", time: "2026-11-03T09:20:00+05:30" }], at("2026-11-03", "09:21"));
    await punch([{ punchNo: "9103", userNo: "T-5", time: "2026-11-03T08:20:00+05:30" }], at("2026-11-03", "09:40"));
    const o = await withSchool(sys(), (tx) => tx.attendanceMark.findFirstOrThrow({ where: { staffId: f.staffOther.id, date: d("2026-11-03") } }));
    expect(o.statusKey).toBe("present");
    const audit = await withSchool(sys(), (tx) => tx.auditLogEntry.findFirst({ where: { action: "device-punch-applied", recordId: o.id } }));
    expect(audit?.before).toMatchObject({ status: "late" });
    expect(audit?.after).toMatchObject({ status: "present" });
  });
});

describe("one setting for the absence message (G08)", () => {
  it("with Communication's \"Absent today\" switched off, saving promises no message, and the alert says why", async () => {
    await withSchool(sys(), (tx) => tx.automaticMessageRule.upsert({ where: { schoolId_key: { schoolId: f.school.id, key: "absence" } }, create: { schoolId: f.school.id, key: "absence", isOn: false }, update: { isOn: false } }));
    try {
      const r = await save(f.sectionB.id, f.studentsB, "2026-11-05", { [f.studentsB[0].id]: "absent" }, f.teacherB.id);
      expect(r.messagesAt).toBeNull();
      expect(r.ruleOff).toBe(true);
      await run(f.sectionB.id, "2026-11-05");
      expect(await alertOf(f.studentsB[0].id, "2026-11-05")).toMatchObject({ status: "skipped", note: expect.stringMatching(/switched off in Message Settings/) });
      const count = await withSchool(sys(), (tx) => absenceMessagesOn(tx, d("2026-11-05"), [f.sectionB.id]));
      expect(messageCountText(count, false)).toBe("Absence messages: 1 not sent (1 message switched off)");
    } finally {
      await withSchool(sys(), (tx) => tx.automaticMessageRule.update({ where: { schoolId_key: { schoolId: f.school.id, key: "absence" } }, data: { isOn: true } }));
    }
  });

  it("one parent's opt-out does not stop the message to another parent who wants it", async () => {
    const kid = f.studentsA[3];
    await withSchool(sys(), async (tx) => {
      await tx.guardian.update({ where: { id: kid.guardianId }, data: { optedOut: true } });
      const mother = await tx.guardian.create({ data: { schoolId: f.school.id, name: "Mother of Meera", relationship: "Mother", phone: "9111122222" } });
      await tx.studentGuardian.create({ data: { schoolId: f.school.id, studentId: kid.id, guardianId: mother.id, relationship: "Mother", isPrimary: false } });
      await tx.automaticMessageRule.upsert({ where: { schoolId_key: { schoolId: f.school.id, key: "absence" } }, create: { schoolId: f.school.id, key: "absence", sendTo: "all" }, update: { sendTo: "all" } });
    });
    await save(f.sectionA.id, f.studentsA, "2026-11-06", { [kid.id]: "absent" });
    await run(f.sectionA.id, "2026-11-06");
    expect(await alertOf(kid.id, "2026-11-06")).toMatchObject({ status: "sent" });
  });
});

describe("corrections and approved leave run A4 too", () => {
  it("an approved correction for a past day moves the flags on without a message, and the request shows the change (TEACHING-17)", async () => {
    const access = await accessFor(f, f.teacherA.id);
    const c = await withSchool(as(f, f.teacherA.id), (tx) => requestCorrection(tx, as(f, f.teacherA.id), access, { forWhom: "student", sectionId: f.sectionA.id, date: d("2026-11-04"), periodNo: 0, changes: [{ id: f.studentsA[3].id, to: "absent" }], reason: "Was not in class after all", today: d("2026-11-06") }));
    const approval = await withSchool(sys(), (tx) => tx.approval.findUniqueOrThrow({ where: { id: c.approvalId! } }));
    const facts = await withSchool(as(f, f.principal.id), (tx) => approvalFacts(tx, as(f, f.principal.id), [approval]));
    expect(facts.get(approval.id)).toEqual([{ label: "Change", value: "Meera Iyer: Present → Absent" }]);
    await withSchool(as(f, f.principal.id), (tx) => decide(tx, as(f, f.principal.id), approval.id, "approve", null));
    const jobs = (await jobsFor("2026-11-04")).filter((j) => j.idempotencyKey.endsWith(":flags"));
    expect(jobs).toHaveLength(1);
    expect(jobs[0].payload).toMatchObject({ sectionId: f.sectionA.id, messages: false });
  });

  it("leave approved after the day was saved turns the saved mark into Leave, counted as leave and audited (TEACHING-02)", async () => {
    const kid = f.studentsA[4];
    const access = await accessFor(f, f.teacherA.id);
    await withSchool(as(f, f.teacherA.id), (tx) => recordStudentLeave(tx, as(f, f.teacherA.id), access, { studentId: kid.id, leaveTypeId: f.medical.id, from: d("2026-11-04"), to: d("2026-11-04"), halfDay: false, reason: "Fever, doctor advised rest", documentFileId: null, approveNow: true }));
    const mark = await withSchool(sys(), (tx) => tx.attendanceMark.findFirstOrThrow({ where: { studentId: kid.id, date: d("2026-11-04") } }));
    expect(mark.statusKey).toBe("leave");
    const sum = await withSchool(sys(), (tx) => attendanceSummary(tx, sys(), { sectionId: f.sectionA.id, from: d("2026-11-04"), to: d("2026-11-04") }));
    expect(sum.people.get(kid.id)).toMatchObject({ leave: 1, countedDays: 0 });
    const audit = await withSchool(sys(), (tx) => tx.auditLogEntry.findFirst({ where: { action: "student-attendance-leave-approved" } }));
    expect(audit?.before).toEqual([{ student: "Rohan Das", date: "2026-11-04", period: null, status: "present" }]);
  });

  it("a one-step request shows no step number", () => {
    expect(stepWords(2, 1)).toBeNull();
    expect(stepWords(2, 3)).toBe("2 of 3");
    expect(stepWords(0, 2)).toBe("1 of 2");
  });
});
