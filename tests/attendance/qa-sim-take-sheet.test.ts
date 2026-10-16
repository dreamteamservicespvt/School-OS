// QA (Chaitanya EM School audit), SIM-01 and SIM-02: Take Attendance never
// shows a student as present who has no saved mark. The school's default
// (Present) is only a starting point for a register nobody has saved yet that
// the person may still save; the banner then says nothing is saved.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { loadSheet } from "@/lib/attendance/marks";
import { startMarks, unsavedCount } from "@/app/(school)/attendance-management/_components/sheet-start";
import { accessFor, as, at, d, TZ } from "./fixture";
import { makeSimSchool, TODAY, type SimFixture } from "./qa-sim-fixture";

let f: SimFixture;

beforeAll(async () => {
  f = await makeSimSchool("Attendance QA Take Sheet School");
}, 120_000);

describe("Take Attendance after the lock", () => {
  it("SIM-01: a student with no saved mark is Not marked, not Present", async () => {
    // QA (Chaitanya EM School audit), SIM-01: Grade 5 A after the 11:00 lock showed "18 Present" while 16 were saved; 2 unmarked new students were counted as Present.
    const access = await accessFor(f, f.teacherA.id);
    const sheet = await withSchool(as(f, f.teacherA.id), (tx) => loadSheet(tx, as(f, f.teacherA.id), access, { sectionId: f.sectionA.id, date: d(TODAY), periodNo: 0, now: at(TODAY, "11:30"), timeZone: TZ }));
    expect(sheet.saved).toBe(true);
    expect(sheet.lock.locked).toBe(true);
    // The transferred student is not on the sheet; the newcomer is, with no mark.
    expect(sheet.students.map((s) => s.studentId)).not.toContain(f.leaverId);
    const rows = sheet.students.map((s) => ({ id: s.studentId, statusKey: s.statusKey, note: s.note, leave: s.leave }));
    for (const readOnly of [true, false]) {
      const marks = startMarks(rows, { saved: true, readOnly, defaultStatus: "present" });
      expect(marks[f.newcomerId].statusKey).toBeNull();
      // Only Rohan has a saved Present mark.
      expect(Object.values(marks).filter((m) => m.statusKey === "present").length).toBe(1);
    }
    expect(unsavedCount(rows)).toBe(1);
  });

  it("SIM-02: a past day with nothing saved shows nobody as present on a locked register", () => {
    // QA (Chaitanya EM School audit), SIM-02: /attendance-management?date=2026-10-13 had 0 marks saved but showed "20 Present".
    const rows = f.studentsB.map((s) => ({ id: s.id, statusKey: null, note: null, leave: null }));
    const locked = startMarks(rows, { saved: false, readOnly: true, defaultStatus: "present" });
    expect(Object.values(locked).every((m) => m.statusKey === null)).toBe(true);
    expect(unsavedCount(rows)).toBe(5);
    // A register not saved yet that the person may still save starts as Present (05 §2); the banner says nothing is saved.
    const open = startMarks(rows, { saved: false, readOnly: false, defaultStatus: "present" });
    expect(Object.values(open).every((m) => m.statusKey === "present")).toBe(true);
    // Approved full-day leave starts as Leave either way (marked in advance).
    const withLeave = startMarks([{ id: "x", statusKey: null, note: null, leave: { halfDay: false } }], { saved: false, readOnly: true, defaultStatus: "present" });
    expect(withLeave.x.statusKey).toBe("leave");
  });
});
