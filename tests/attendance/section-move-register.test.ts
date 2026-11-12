// Self-test B7 (2026-11-12): after a student moved from 5 A to 5 B, 5 B's register showed her "not marked" on
// the days before the move, when she was in 5 A and marked there. The new section's register starts on the day
// of the move; the old section keeps her history up to that day.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { saveClassAttendance } from "@/lib/attendance/marks";
import { registerBook } from "@/lib/attendance/on-register";
import { registerMonth } from "@/lib/attendance/register";
import { accessFor, as, at, d, makeAttendanceSchool, TZ, type Fixture } from "./fixture";

let f: Fixture;
let mover: string;
const BEFORE = ["2026-10-12", "2026-10-13"];
const MOVE = "2026-10-14";

beforeAll(async () => {
  f = await makeAttendanceSchool("Section Move Register School");
  const ctx = as(f, f.teacherA.id);
  const access = await accessFor(f, f.teacherA.id);
  for (const day of BEFORE) {
    await withSchool(ctx, (tx) => saveClassAttendance(tx, ctx, access, {
      sectionId: f.sectionA.id, date: d(day), periodNo: 0, timeZone: TZ, now: at(day, "09:00"),
      entries: f.studentsA.map((s) => ({ studentId: s.id, statusKey: "present" })),
    }));
  }
  mover = f.studentsA[0].id;
  // What Change section does (src/lib/students/students.ts): the enrolment moves, a Section Change is kept.
  await withSchool({ schoolId: f.school.id, userId: null }, async (tx) => {
    const e = await tx.enrolment.findFirstOrThrow({ where: { studentId: mover } });
    await tx.enrolment.update({ where: { id: e.id }, data: { sectionId: f.sectionB.id, rollNo: 99 } });
    await tx.sectionChange.create({ data: { schoolId: f.school.id, studentId: mover, enrolmentId: e.id, fromSectionId: f.sectionA.id, toSectionId: f.sectionB.id, fromRollNo: 1, toRollNo: 99, reason: "Test", createdAt: at(MOVE, "10:00") } });
  });
}, 120_000);

describe("a student who changed section", () => {
  it("is on the new section's register only from the day of the move", async () => {
    const ctx = as(f, f.principal.id);
    const book = await withSchool(ctx, (tx) => registerBook(tx, [f.sectionA.id, f.sectionB.id]));
    expect(book.has(f.sectionB.id, mover, "2026-10-13")).toBe(false);
    expect(book.has(f.sectionB.id, mover, MOVE)).toBe(true);
    expect(book.has(f.sectionB.id, mover, "2026-10-20")).toBe(true);
    expect(book.countOn(f.sectionB.id, "2026-10-13")).toBe(f.studentsB.length);
    expect(book.countOn(f.sectionB.id, "2026-10-15")).toBe(f.studentsB.length + 1);
    expect(book.current(f.sectionB.id).has(mover)).toBe(true);
    // The old section keeps her up to the move.
    expect(book.has(f.sectionA.id, mover, "2026-10-13")).toBe(true);
    expect(book.has(f.sectionA.id, mover, "2026-10-15")).toBe(false);
  });

  it("the new section's monthly register says from which day she is on it", async () => {
    const ctx = as(f, f.principal.id);
    const grid = await withSchool(ctx, (tx) => registerMonth(tx, ctx, { sectionId: f.sectionB.id, month: d("2026-10-01"), today: d("2026-10-20") }));
    const row = grid!.rows.find((r) => r.id === mover)!;
    expect(row.from).toBe(MOVE);
    expect(row.days["2026-10-12"]).toBeUndefined();
    const other = grid!.rows.find((r) => r.id === f.studentsB[0].id)!;
    expect(other.from).toBeNull();
  });

  it("the old section's register keeps her marks from before the move", async () => {
    const ctx = as(f, f.principal.id);
    const grid = await withSchool(ctx, (tx) => registerMonth(tx, ctx, { sectionId: f.sectionA.id, month: d("2026-10-01"), today: d("2026-10-20") }));
    const row = grid!.rows.find((r) => r.id === mover)!;
    expect(Object.keys(row.days).sort()).toEqual(BEFORE);
    expect(row.summary.present).toBe(2);
  });
});
