// Adopt item 3 (docs/research/inkwelly-2026-11-15.md), Take Attendance:
// the live counter "N of M marked · x present · y absent", approved leave
// pre-set to Leave with a small note (days and who approved it), and the
// "Saved · N parents told" line that counts only parents a message reached.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import "@/lib/attendance/handlers";
import { loadSheet, saveClassAttendance, type Entry } from "@/lib/attendance/marks";
import { afterAttendanceSaved } from "@/lib/attendance/alerts";
import { recordStudentLeave } from "@/lib/attendance/student-leave";
import { leaveFacts, leaveRowNote } from "@/lib/attendance/leave-row";
import { parentsTold, toldLine, whyNotTold } from "@/lib/attendance/told";
import { sheetCounter, startMarks } from "@/app/(school)/attendance-management/_components/sheet-start";
import { accessFor, as, at, d, makeAttendanceSchool, TZ, type Fixture } from "./fixture";

let f: Fixture;
const sys = () => ({ schoolId: f.school.id, userId: null });
const STATUSES = [
  { key: "present", name: "Present" }, { key: "absent", name: "Absent" }, { key: "late", name: "Late" },
  { key: "half-day", name: "Half-day" }, { key: "leave", name: "Leave" },
];

beforeAll(async () => {
  f = await makeAttendanceSchool("Adopt Take Sheet School");
}, 120_000);

describe("the live counter", () => {
  it("says how many are marked, and present and absent even at 0", () => {
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    const none = sheetCounter(rows, {}, STATUSES);
    expect(none.text).toBe("0 of 4 marked · 0 present · 0 absent");
    const some = sheetCounter(rows, { a: { statusKey: "present" }, b: { statusKey: "absent" }, c: { statusKey: "late" }, d: { statusKey: null } }, STATUSES);
    expect(some).toMatchObject({ marked: 3, total: 4 });
    expect(some.text).toBe("3 of 4 marked · 1 present · 1 absent · 1 late");
  });

  it("names other statuses only when used", () => {
    const rows = [{ id: "a" }, { id: "b" }];
    expect(sheetCounter(rows, { a: { statusKey: "half-day" }, b: { statusKey: "leave" } }, STATUSES).text).toBe("2 of 2 marked · 0 present · 0 absent · 1 half-day · 1 leave");
  });
});

describe("approved leave in the row", () => {
  it("is pre-set to Leave and says the days and who approved it", async () => {
    const kid = f.studentsB[0];
    const principal = await accessFor(f, f.principal.id);
    await withSchool(as(f, f.principal.id), (tx) => recordStudentLeave(tx, as(f, f.principal.id), principal, {
      studentId: kid.id, leaveTypeId: f.medical.id, from: d("2026-11-10"), to: d("2026-11-11"), halfDay: false, reason: "Viral fever", documentFileId: null, approveNow: true,
    }));
    const access = await accessFor(f, f.teacherB.id);
    const sheet = await withSchool(as(f, f.teacherB.id), (tx) => loadSheet(tx, as(f, f.teacherB.id), access, { sectionId: f.sectionB.id, date: d("2026-11-10"), periodNo: 0, now: at("2026-11-10", "08:30"), timeZone: TZ }));
    const row = sheet.students.find((s) => s.studentId === kid.id)!;
    expect(row.leave).toMatchObject({ halfDay: false, reason: "Viral fever" });
    // Pre-set: Leave before anything is saved, and the counter counts it.
    const rows = sheet.students.map((s) => ({ id: s.studentId, statusKey: s.statusKey, note: s.note, leave: s.leave }));
    const marks = startMarks(rows, { saved: false, readOnly: false, defaultStatus: "present" });
    expect(marks[kid.id].statusKey).toBe("leave");
    expect(sheetCounter(rows, marks, STATUSES).text).toBe("5 of 5 marked · 4 present · 0 absent · 1 leave");
    // The small note: days and the approver, from the leave request itself.
    const facts = await withSchool(as(f, f.teacherB.id), (tx) => leaveFacts(tx, [row.leave!.id]));
    expect(leaveRowNote(row.leave!, facts.get(row.leave!.id))).toBe("On approved leave · 10-11-2026 to 11-11-2026 · Viral fever · approved by Principal Person");
  });

  it("a half-day leave says so, and one day is one date", () => {
    const facts = { fromDate: d("2026-11-12"), toDate: d("2026-11-12"), by: null };
    expect(leaveRowNote({ typeName: "Medical", halfDay: true, reason: null }, facts)).toBe("Half-day leave approved · 12-11-2026 · Medical");
  });
});

describe("Saved · N parents told", () => {
  const entries = (absent: string): Entry[] => f.studentsA.map((s) => ({ studentId: s.id, statusKey: s.id === absent ? "absent" : "present" }));

  it("counts only parents a message reached: Test mode and waiting are not told", async () => {
    const kid = f.studentsA[1];
    const access = await accessFor(f, f.teacherA.id);
    await withSchool(as(f, f.teacherA.id), (tx) => saveClassAttendance(tx, as(f, f.teacherA.id), access, { sectionId: f.sectionA.id, date: d("2026-11-10"), periodNo: 0, timeZone: TZ, entries: entries(kid.id), now: at("2026-11-10", "09:30") }));
    // Before the absence wait is over nothing is sent: "parents are told at …".
    const before = await withSchool(sys(), (tx) => parentsTold(tx, d("2026-11-10"), f.sectionA.id));
    expect(before).toEqual({ told: 0, waiting: 0, notTold: 0, test: 0 });
    expect(toldLine(before, { absent: 1, why: null, sendAtText: "9:45 AM" })).toBe("parents are told at 9:45 AM");

    await withSchool(sys(), (tx) => afterAttendanceSaved(tx, sys(), { sectionId: f.sectionA.id, date: "2026-11-10" }));
    const alert = await withSchool(sys(), (tx) => tx.attendanceAlert.findFirstOrThrow({ where: { studentId: kid.id, date: d("2026-11-10"), kind: "absence" } }));
    expect(alert.status).toBe("sent");
    // The school's WhatsApp is in Test mode (sandbox): the parent did not get it.
    await withSchool(sys(), (tx) => tx.messageRecipient.updateMany({ where: { messageId: alert.messageRef! }, data: { provider: "sandbox", status: "SENT" } }));
    const test = await withSchool(sys(), (tx) => parentsTold(tx, d("2026-11-10"), f.sectionA.id));
    expect(test).toEqual({ told: 0, waiting: 0, notTold: 0, test: 1 });
    expect(toldLine(test, { absent: 1, why: null, sendAtText: null })).toBe("1 parent not told: Test mode");

    // Still with the provider: waiting, not told.
    await withSchool(sys(), (tx) => tx.messageRecipient.updateMany({ where: { messageId: alert.messageRef! }, data: { provider: null, status: "QUEUED" } }));
    expect(toldLine(await withSchool(sys(), (tx) => parentsTold(tx, d("2026-11-10"), f.sectionA.id)), { absent: 1, why: null, sendAtText: null })).toBe("1 parent waiting to be told");

    // Delivered by a real provider: told, once per parent.
    await withSchool(sys(), (tx) => tx.messageRecipient.updateMany({ where: { messageId: alert.messageRef! }, data: { provider: "meta-cloud", status: "DELIVERED" } }));
    const told = await withSchool(sys(), (tx) => parentsTold(tx, d("2026-11-10"), f.sectionA.id));
    expect(told).toEqual({ told: 1, waiting: 0, notTold: 0, test: 0 });
    expect(toldLine(told, { absent: 1, why: null, sendAtText: null })).toBe("1 parent told");
  });

  it("says why when nobody can be told, and nothing when nobody was absent", async () => {
    const empty = { told: 0, waiting: 0, notTold: 0, test: 0 };
    expect(toldLine(empty, { absent: 0, why: null, sendAtText: null })).toBeNull();
    expect(toldLine(empty, { absent: 2, why: "messages-off", sendAtText: null })).toBe("not told: messages off");
    expect(toldLine(empty, { absent: 2, why: "no-channel", sendAtText: null })).toBe("not told: no message channel is connected");
    expect(toldLine({ ...empty, told: 3, waiting: 1 }, { absent: 4, why: null, sendAtText: null })).toBe("3 parents told, 1 waiting");
    // The school switched absence messages off in Attendance Settings.
    expect(await withSchool(sys(), (tx) => whyNotTold(tx, sys(), { absenceAlertOn: false }))).toBe("messages-off");
  });
});
