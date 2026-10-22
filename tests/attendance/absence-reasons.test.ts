// Absence reasons (gap list P1.8): optional on Take Attendance ("Not known
// yet" by default), filled from approved Student Leave, set later from the
// day's absent list (audited, also after the lock), shown in the register and
// the reports, and "Fees dispute" kept from people without the school's fees.
// Marks from before keep working with no reason saved, shown and counted as
// "Not known yet", one word everywhere (browser finding TEACHING-04).
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { decide } from "@/lib/approvals";
import "@/lib/attendance/handlers";
// Loaded before the first decision, so loading every module's follow-ups never eats the decision's transaction time.
import "@/lib/approval-handlers";
import { loadSheet, saveClassAttendance, type Entry } from "@/lib/attendance/marks";
import { requestCorrection } from "@/lib/attendance/corrections";
import { cancelStudentLeave, recordStudentLeave } from "@/lib/attendance/student-leave";
import { registerMonth } from "@/lib/attendance/register";
import { readReportInput, reportsFor, runReport, withDates } from "@/lib/attendance/reports";
import { NotYoursError } from "@/lib/attendance/access";
import {
  absentList, mixText, mostlyExplained, mostlyUnexplained, nextReason, reasonFromLeave, reasonMix, setAbsenceReason, shownReason, studentAbsences,
} from "@/lib/attendance/absence-reasons";
import { accessFor, as, at, d, makeAttendanceSchool, TZ, type Fixture } from "./fixture";
import { feature } from "../fees/fixture";

let f: Fixture;
beforeAll(async () => { f = await makeAttendanceSchool("Absence Reasons School"); });

const sys = () => ({ schoolId: f.school.id, userId: null });
const allPresent = (list: { id: string }[], except: Record<string, Partial<Entry> & { statusKey: string }> = {}): Entry[] =>
  list.map((s) => ({ studentId: s.id, ...(except[s.id] ?? { statusKey: "present" }) }));

async function save(userId: string, date: string, entries: Entry[], hhmm = "09:00") {
  const access = await accessFor(f, userId);
  return withSchool(as(f, userId), (tx) => saveClassAttendance(tx, as(f, userId), access, { sectionId: f.sectionA.id, date: d(date), periodNo: 0, entries, now: at(date, hhmm), timeZone: TZ }));
}
const markOf = (studentId: string, date: string) => withSchool(sys(), (tx) => tx.attendanceMark.findFirstOrThrow({ where: { studentId, date: d(date), periodNo: 0 } }));
const reasonsOn = (on: boolean) => feature(sys(), "attendance-absence-reasons", on);

describe("the rules on their own", () => {
  it("gives an absent student \"Not known yet\" when nothing is chosen, and no reason to anyone not absent", () => {
    expect(nextReason({ on: true, absent: true, seesFees: false, existing: null })).toEqual({ absenceReason: "not-known", absenceNote: null, reasonSource: "register" });
    expect(nextReason({ on: true, absent: false, seesFees: false, wanted: "sick", existing: null })).toEqual({ absenceReason: null, absenceNote: null, reasonSource: null });
    expect(nextReason({ on: false, absent: true, seesFees: false, existing: null }).absenceReason).toBeNull();
    expect(nextReason({ on: true, absent: true, seesFees: false, existing: { absenceReason: "travel", absenceNote: null, reasonSource: "later" } }).absenceReason).toBe("travel");
  });

  it("refuses Fees dispute without the school's fees, and keeps it when such a person leaves the Other they see", () => {
    expect(() => nextReason({ on: true, absent: true, seesFees: false, wanted: "fees-dispute", existing: null })).toThrow(/Choose the reason/);
    const stored = { absenceReason: "fees-dispute", absenceNote: "Father disputes the bus fee", reasonSource: "later" };
    expect(shownReason(stored, false)).toMatchObject({ key: "other", label: "Other", note: null });
    expect(shownReason(stored, true)).toMatchObject({ key: "fees-dispute", label: "Fees dispute", note: "Father disputes the bus fee" });
    expect(nextReason({ on: true, absent: true, seesFees: false, wanted: "other", existing: stored })).toEqual(stored);
    expect(nextReason({ on: true, absent: true, seesFees: false, wanted: "sick", existing: stored }).absenceReason).toBe("sick");
  });

  it("turns approved leave into a reason: Medical is Sick, Holiday is Travel, others Other with the type", () => {
    expect(reasonFromLeave({ typeCode: "MED", typeName: "Medical", reason: "Fever" })).toEqual({ absenceReason: "sick", absenceNote: "Medical leave: Fever" });
    expect(reasonFromLeave({ typeCode: "HOL", typeName: "Holiday", reason: null }).absenceReason).toBe("travel");
    expect(reasonFromLeave({ typeCode: "EMG", typeName: "Emergency", reason: "" })).toEqual({ absenceReason: "other", absenceNote: "Emergency leave" });
  });

  it("describes the reason mix, folding Fees dispute into Other for people without fees", () => {
    const mix = { absent: 8, by: { "not-known": 4, sick: 2, "fees-dispute": 1, none: 1 }, coveredByLeave: 2 };
    expect(mixText(mix, true)).toBe("5 not known yet, 2 sick, 1 fees dispute; 2 covered by approved leave");
    expect(mixText(mix, false)).toBe("5 not known yet, 2 sick, 1 other; 2 covered by approved leave");
    expect(mixText({ absent: 3, by: { none: 3 }, coveredByLeave: 0 }, true)).toBe("");
    expect(mostlyUnexplained(mix, 3)).toBe(true);
    expect(mostlyUnexplained(mix, 5)).toBe(false);
    expect(mostlyExplained({ absent: 4, by: { sick: 3, "not-known": 1 }, coveredByLeave: 0 })).toBe(true);
  });
});

describe("Take Attendance", () => {
  it("with reasons off, saves as before and records no reason", async () => {
    await reasonsOn(false);
    const absent = f.studentsA[0].id;
    const r = await save(f.teacherA.id, "2026-10-05", allPresent(f.studentsA, { [absent]: { statusKey: "absent", reason: "sick" } }));
    expect(r.outcome).toBe("saved");
    expect((await markOf(absent, "2026-10-05")).absenceReason).toBeNull();
    const access = await accessFor(f, f.teacherA.id);
    const sheet = await withSchool(as(f, f.teacherA.id), (tx) => loadSheet(tx, as(f, f.teacherA.id), access, { sectionId: f.sectionA.id, date: d("2026-10-05"), periodNo: 0, now: at("2026-10-05", "09:10"), timeZone: TZ }));
    expect(sheet.reasons).toBeNull();
  });

  it("with reasons on, still saves with no reason: absent students get Not known yet, the rest none", async () => {
    await reasonsOn(true);
    const absent = f.studentsA[1].id;
    const r = await save(f.teacherA.id, "2026-10-06", allPresent(f.studentsA, { [absent]: { statusKey: "absent" } }));
    expect(r.outcome).toBe("saved");
    expect(await markOf(absent, "2026-10-06")).toMatchObject({ absenceReason: "not-known", reasonSource: "register" });
    expect((await markOf(f.studentsA[0].id, "2026-10-06")).absenceReason).toBeNull();
  });

  it("keeps a reason picked on the register, and a later save without one leaves it", async () => {
    const absent = f.studentsA[2].id;
    await save(f.teacherA.id, "2026-10-07", allPresent(f.studentsA, { [absent]: { statusKey: "absent", reason: "family-function", reasonNote: "Cousin's wedding" } }));
    expect(await markOf(absent, "2026-10-07")).toMatchObject({ absenceReason: "family-function", absenceNote: "Cousin's wedding" });
    const again = await save(f.teacherA.id, "2026-10-07", allPresent(f.studentsA, { [absent]: { statusKey: "absent" } }), "09:30");
    expect(again.outcome).toBe("unchanged");
    expect((await markOf(absent, "2026-10-07")).absenceReason).toBe("family-function");
    // Marked present after all: the reason goes.
    await save(f.teacherA.id, "2026-10-07", allPresent(f.studentsA), "09:40");
    expect((await markOf(absent, "2026-10-07")).absenceReason).toBeNull();
  });

  it("does not let a teacher choose Fees dispute", async () => {
    const absent = f.studentsA[3].id;
    await expect(save(f.teacherA.id, "2026-10-08", allPresent(f.studentsA, { [absent]: { statusKey: "absent", reason: "fees-dispute" } }))).rejects.toThrow(/Choose the reason/);
  });

  it("marks from before reasons were on keep no saved reason, show as Not known yet everywhere, and saving them again after the lock is not a change", async () => {
    await reasonsOn(false);
    const absent = f.studentsA[4].id;
    await save(f.teacherA.id, "2026-10-09", allPresent(f.studentsA, { [absent]: { statusKey: "absent" } }));
    await reasonsOn(true);
    const r = await save(f.teacherA.id, "2026-10-09", allPresent(f.studentsA, { [absent]: { statusKey: "absent" } }), "15:00");
    expect(r.outcome).toBe("unchanged");
    expect((await markOf(absent, "2026-10-09")).absenceReason).toBeNull();
    // One word for one mark: the Absent list, the register and the profile all say "Not known yet" (TEACHING-04).
    const teacher = await accessFor(f, f.teacherA.id);
    const list = await withSchool(as(f, f.teacherA.id), (tx) => absentList(tx, as(f, f.teacherA.id), teacher, { date: d("2026-10-09") }));
    expect(list.find((x) => x.studentId === absent)?.reason).toMatchObject({ key: "not-known", label: "Not known yet" });
    const grid = await withSchool(as(f, f.teacherA.id), (tx) => registerMonth(tx, as(f, f.teacherA.id), { sectionId: f.sectionA.id, month: d("2026-10-01"), today: d("2026-10-17"), reasons: { seesFees: false } }));
    expect(grid!.rows.find((x) => x.id === absent)?.reasons["2026-10-09"]?.label).toBe("Not known yet");
    const days = await withSchool(sys(), (tx) => studentAbsences(tx, sys(), absent, d("2026-10-01"), d("2026-10-17"), false));
    expect(days.find((x) => x.date.toISOString().startsWith("2026-10-09"))?.reason.label).toBe("Not known yet");
  });
});

describe("set later from the day's absent list", () => {
  it("the class teacher sets it after the lock; only the reason changes, and it is audited", async () => {
    const student = f.studentsA[1].id; // absent 06-10, Not known yet
    const access = await accessFor(f, f.teacherA.id);
    const r = await withSchool(as(f, f.teacherA.id), (tx) => setAbsenceReason(tx, as(f, f.teacherA.id), access, { studentId: student, date: d("2026-10-06"), reason: "sick", note: "Parent called: fever" }));
    expect(r.changed).toBe(true);
    const m = await markOf(student, "2026-10-06");
    expect(m).toMatchObject({ statusKey: "absent", absenceReason: "sick", absenceNote: "Parent called: fever", reasonSource: "later" });
    const audit = await withSchool(sys(), (tx) => tx.auditLogEntry.findFirst({ where: { action: "absence-reason-set", recordId: m.id } }));
    expect(audit?.before).toMatchObject({ reason: "not-known" });
    expect(audit?.after).toMatchObject({ reason: "sick", source: "later" });
  });

  it("another class's teacher cannot; the office can; Other needs a note; a student not absent is refused", async () => {
    const student = f.studentsA[1].id;
    const other = await accessFor(f, f.teacherB.id);
    await expect(withSchool(as(f, f.teacherB.id), (tx) => setAbsenceReason(tx, as(f, f.teacherB.id), other, { studentId: student, date: d("2026-10-06"), reason: "travel" }))).rejects.toBeInstanceOf(NotYoursError);
    const office = await accessFor(f, f.officeLogin.id);
    await expect(withSchool(as(f, f.officeLogin.id), (tx) => setAbsenceReason(tx, as(f, f.officeLogin.id), office, { studentId: student, date: d("2026-10-06"), reason: "other" }))).rejects.toThrow(/short note for Other/);
    const ok = await withSchool(as(f, f.officeLogin.id), (tx) => setAbsenceReason(tx, as(f, f.officeLogin.id), office, { studentId: student, date: d("2026-10-06"), reason: "other", note: "Went to the passport office" }));
    expect(ok.changed).toBe(true);
    await expect(withSchool(as(f, f.officeLogin.id), (tx) => setAbsenceReason(tx, as(f, f.officeLogin.id), office, { studentId: f.studentsA[0].id, date: d("2026-10-06"), reason: "sick" }))).rejects.toThrow(/not marked absent/);
    await expect(withSchool(as(f, f.officeLogin.id), (tx) => setAbsenceReason(tx, as(f, f.officeLogin.id), office, { studentId: student, date: d("2026-10-06"), reason: "fees-dispute" }))).rejects.toThrow(/Choose the reason/);
  });

  it("Fees dispute: the Principal records it; a teacher sees Other on the list and the register, and keeps it by leaving Other", async () => {
    const student = f.studentsA[1].id;
    const principal = await accessFor(f, f.principal.id);
    expect(principal.seesFees).toBe(true);
    await withSchool(as(f, f.principal.id), (tx) => setAbsenceReason(tx, as(f, f.principal.id), principal, { studentId: student, date: d("2026-10-06"), reason: "fees-dispute", note: "Disputes the term fee" }));
    const teacher = await accessFor(f, f.teacherA.id);
    expect(teacher.seesFees).toBe(false);
    const list = await withSchool(as(f, f.teacherA.id), (tx) => absentList(tx, as(f, f.teacherA.id), teacher, { date: d("2026-10-06") }));
    expect(list.find((r) => r.studentId === student)?.reason).toMatchObject({ key: "other", label: "Other", note: null });
    const asPrincipal = await withSchool(as(f, f.principal.id), (tx) => absentList(tx, as(f, f.principal.id), principal, { date: d("2026-10-06") }));
    expect(asPrincipal.find((r) => r.studentId === student)?.reason).toMatchObject({ key: "fees-dispute", note: "Disputes the term fee" });
    const grid = await withSchool(as(f, f.teacherA.id), (tx) => registerMonth(tx, as(f, f.teacherA.id), { sectionId: f.sectionA.id, month: d("2026-10-01"), today: d("2026-10-17"), reasons: { seesFees: false } }));
    expect(grid!.rows.find((r) => r.id === student)?.reasons["2026-10-06"]?.label).toBe("Other");
    // The principal (lock override) saves the day again with the teacher's view of it: the reason stays.
    const sheet = await withSchool(as(f, f.teacherA.id), (tx) => loadSheet(tx, as(f, f.teacherA.id), teacher, { sectionId: f.sectionA.id, date: d("2026-10-06"), periodNo: 0, now: at("2026-10-06", "10:00"), timeZone: TZ }));
    const row = sheet.students.find((s) => s.studentId === student)!;
    expect(row.reason?.key).toBe("other");
    expect(sheet.reasons?.some((r) => r.key === "fees-dispute")).toBe(false);
    const r = await withSchool(as(f, f.teacherA.id), (tx) => saveClassAttendance(tx, as(f, f.teacherA.id), teacher, {
      sectionId: f.sectionA.id, date: d("2026-10-06"), periodNo: 0, now: at("2026-10-06", "10:30"), timeZone: TZ,
      entries: sheet.students.map((s) => ({ studentId: s.studentId, statusKey: s.statusKey!, note: s.note, reason: s.reason?.key ?? null })),
    }));
    expect(r.outcome).toBe("unchanged");
    expect((await markOf(student, "2026-10-06")).absenceReason).toBe("fees-dispute");
  });
});

describe("approved Student Leave fills the reason", () => {
  it("approving medical half-day leave for a day already marked absent makes it Sick; cancelling the leave takes it back", async () => {
    const student = f.studentsB[0].id;
    const accessB = await accessFor(f, f.teacherB.id);
    await withSchool(as(f, f.teacherB.id), (tx) => saveClassAttendance(tx, as(f, f.teacherB.id), accessB, {
      sectionId: f.sectionB.id, date: d("2026-10-12"), periodNo: 0, now: at("2026-10-12", "09:00"), timeZone: TZ,
      entries: f.studentsB.map((s) => ({ studentId: s.id, statusKey: s.id === student ? "absent" : "present" })),
    }));
    expect((await markOf(student, "2026-10-12")).absenceReason).toBe("not-known");
    const principal = await accessFor(f, f.principal.id);
    const leave = await withSchool(as(f, f.principal.id), (tx) => recordStudentLeave(tx, as(f, f.principal.id), principal, {
      studentId: student, leaveTypeId: f.medical.id, from: d("2026-10-12"), to: d("2026-10-12"), halfDay: true, reason: "Viral fever", documentFileId: null, approveNow: true,
    }));
    expect(leave.approved).toBe(true);
    expect(await markOf(student, "2026-10-12")).toMatchObject({ statusKey: "absent", absenceReason: "sick", absenceNote: "Medical leave: Viral fever", reasonSource: "leave" });
    const mix = await withSchool(sys(), (tx) => reasonMix(tx, sys(), [student], d("2026-10-01"), d("2026-10-17")));
    expect(mix.get(student)).toMatchObject({ absent: 1, by: { sick: 1 }, coveredByLeave: 1 });
    await withSchool(as(f, f.principal.id), (tx) => cancelStudentLeave(tx, as(f, f.principal.id), principal, leave.request.id, "Recorded for the wrong child"));
    expect((await markOf(student, "2026-10-12")).absenceReason).toBe("not-known");
  });

  it("a reason a person chose is not replaced by leave approved later in Approvals", async () => {
    const student = f.studentsB[1].id;
    const accessB = await accessFor(f, f.teacherB.id);
    await withSchool(as(f, f.teacherB.id), (tx) => saveClassAttendance(tx, as(f, f.teacherB.id), accessB, {
      sectionId: f.sectionB.id, date: d("2026-10-13"), periodNo: 0, now: at("2026-10-13", "09:00"), timeZone: TZ,
      entries: f.studentsB.map((s) => ({ studentId: s.id, statusKey: s.id === student ? "absent" : "present", ...(s.id === student ? { reason: "travel" } : {}) })),
    }));
    const office = await accessFor(f, f.officeLogin.id);
    const leave = await withSchool(as(f, f.officeLogin.id), (tx) => recordStudentLeave(tx, as(f, f.officeLogin.id), office, {
      studentId: student, leaveTypeId: f.medical.id, from: d("2026-10-13"), to: d("2026-10-13"), halfDay: true, reason: "Doctor visit", documentFileId: null, approveNow: false,
    }));
    const approval = await withSchool(sys(), (tx) => tx.approval.findFirstOrThrow({ where: { recordId: leave.request.id } }));
    await withSchool(as(f, f.teacherB.id), (tx) => decide(tx, as(f, f.teacherB.id), approval.id, "approve", null));
    expect((await markOf(student, "2026-10-13")).absenceReason).toBe("travel");
  });

  it("full-day leave approved for a day already marked absent turns the day into Leave (TEACHING-02)", async () => {
    const student = f.studentsB[2].id;
    const accessB = await accessFor(f, f.teacherB.id);
    await withSchool(as(f, f.teacherB.id), (tx) => saveClassAttendance(tx, as(f, f.teacherB.id), accessB, {
      sectionId: f.sectionB.id, date: d("2026-10-14"), periodNo: 0, now: at("2026-10-14", "09:00"), timeZone: TZ,
      entries: f.studentsB.map((s) => ({ studentId: s.id, statusKey: s.id === student ? "absent" : "present" })),
    }));
    const principal = await accessFor(f, f.principal.id);
    await withSchool(as(f, f.principal.id), (tx) => recordStudentLeave(tx, as(f, f.principal.id), principal, {
      studentId: student, leaveTypeId: f.medical.id, from: d("2026-10-14"), to: d("2026-10-14"), halfDay: false, reason: "Viral fever", documentFileId: null, approveNow: true,
    }));
    expect(await markOf(student, "2026-10-14")).toMatchObject({ statusKey: "leave", absenceReason: null });
  });
});

describe("corrections, reports and the profile", () => {
  it("a correction to Absent gets Not known yet; one to Present clears the reason", async () => {
    const student = f.studentsA[0].id; // present on 06-10
    const teacher = await accessFor(f, f.teacherA.id);
    const c = await withSchool(as(f, f.teacherA.id), (tx) => requestCorrection(tx, as(f, f.teacherA.id), teacher, { forWhom: "student", sectionId: f.sectionA.id, date: d("2026-10-06"), periodNo: 0, changes: [{ id: student, to: "absent" }], reason: "Left before the register, mother came", today: d("2026-10-17") }));
    const approval = await withSchool(sys(), (tx) => tx.approval.findFirstOrThrow({ where: { recordId: c.id } }));
    await withSchool(as(f, f.principal.id), (tx) => decide(tx, as(f, f.principal.id), approval.id, "approve", null));
    expect(await markOf(student, "2026-10-06")).toMatchObject({ statusKey: "absent", absenceReason: "not-known" });
  });

  it("Attendance Reports group absent days by reason, and list one reason's absences; Fees dispute only for fee roles", async () => {
    const principal = await accessFor(f, f.principal.id);
    const teacher = await accessFor(f, f.teacherA.id);
    const features = new Set(["attendance-absence-reasons"]);
    expect(reportsFor(teacher, features).some((r) => r.key === "reasons")).toBe(true);
    expect(reportsFor(teacher, new Set()).some((r) => r.key === "reasons")).toBe(false);
    const input = (reason: string | null) => withDates(readReportInput((k) => ({ report: "reasons", reason })[k as "report"] ?? null, d("2026-10-17"), ["reasons"]), { from: "2026-10-01", to: "2026-10-17", label: "October" });
    const t = await withSchool(as(f, f.principal.id), (tx) => runReport(tx, as(f, f.principal.id), principal, input(null)));
    const a = t.rows.find((r) => r.who === "Class 5 A")!;
    expect(t.columns.some((c) => c.key === "fees-dispute")).toBe(true);
    expect(a["fees-dispute"]).toBe(1);
    expect(Number(a.absent)).toBeGreaterThanOrEqual(4);
    const tt = await withSchool(as(f, f.teacherA.id), (tx) => runReport(tx, as(f, f.teacherA.id), teacher, input(null)));
    expect(tt.columns.some((c) => c.key === "fees-dispute")).toBe(false);
    expect(tt.rows.find((r) => r.who === "Class 5 A")!.other).toBe(1);
    const one = await withSchool(as(f, f.teacherA.id), (tx) => runReport(tx, as(f, f.teacherA.id), teacher, input("none")));
    expect(one.rows.map((r) => r.date)).toContain("09-10-2026");
  });

  it("the profile lists each absent day with its reason", async () => {
    const list = await withSchool(sys(), (tx) => studentAbsences(tx, sys(), f.studentsA[1].id, d("2026-04-01"), d("2026-10-17"), false));
    expect(list.map((x) => x.reason?.label)).toEqual(["Other"]);
  });
});
