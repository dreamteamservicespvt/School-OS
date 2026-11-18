// Attendance Register, "Not marked yet": what the card offers for a class. Before the lock time a
// reminder helps: the class teacher can still take the register. After the lock it cannot (Take
// Attendance refuses the teacher: "locked at 11:00 AM. Request a correction"), so the card offers what
// works, a correction request for that class and day. Live test 17 Nov 2026 (Principal): "Remind" was
// still offered under "Today · locked at 11:00 AM".
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const load = () => import("@/lib/attendance/not-marked");
const row = (over: Partial<{ teacher: string | null; teacherLogin: string | null; remindedAt: Date | null }> = {}) =>
  ({ sectionId: "11111111-1111-4111-8111-111111111111", name: "Class 5 A", students: 30, teacher: "Kavitha Nair", teacherLogin: "22222222-2222-4222-8222-222222222222", remindedAt: null, ...over });
const DATE = "2026-11-17";
const before = { locked: false, canRemind: true, mayCorrect: true, date: DATE };
const after = { ...before, locked: true };

describe("Not marked yet: the action offered for a class", () => {
  it("before the lock: Remind the class teacher, or the time they were reminded", async () => {
    const { notMarkedOffer } = await load();
    expect(notMarkedOffer(row(), before)).toEqual({ kind: "remind", remindedAt: null });
    const at = new Date("2026-11-17T04:35:00Z");
    expect(notMarkedOffer(row({ remindedAt: at }), before)).toEqual({ kind: "remind", remindedAt: at });
  });

  it("before the lock: says why nobody can be reminded", async () => {
    const { notMarkedOffer } = await load();
    expect(notMarkedOffer(row({ teacherLogin: null }), before)).toEqual({ kind: "note", text: "Cannot sign in" });
    expect(notMarkedOffer(row({ teacher: null, teacherLogin: null }), before)).toEqual({ kind: "note", text: "No class teacher" });
  });

  it("after the lock: never Remind; a correction request for that class and day instead", async () => {
    const { notMarkedOffer } = await load();
    const offer = notMarkedOffer(row(), after);
    expect(offer).toEqual({ kind: "correction", href: "/attendance-management/register/correction?section=11111111-1111-4111-8111-111111111111&date=2026-11-17" });
    // Also for a class with no class teacher, or one who cannot sign in: the person looking can ask for it.
    expect(notMarkedOffer(row({ teacher: null, teacherLogin: null }), after)?.kind).toBe("correction");
    expect(notMarkedOffer(row({ remindedAt: new Date("2026-11-17T04:35:00Z") }), after)?.kind).toBe("correction");
  });

  it("someone who only reads attendance is offered nothing they cannot do", async () => {
    const { notMarkedOffer } = await load();
    expect(notMarkedOffer(row(), { ...after, mayCorrect: false })).toBeNull();
    expect(notMarkedOffer(row(), { ...before, canRemind: false })).toBeNull();
  });

  it("'Remind all' is only for before the lock, with two or more teachers still to remind", async () => {
    const { remindAllFor } = await load();
    const rows = [row(), row({ teacherLogin: "33333333-3333-4333-8333-333333333333" }), row({ remindedAt: new Date() }), row({ teacherLogin: null })];
    expect(remindAllFor(rows, before)).toHaveLength(2);
    expect(remindAllFor(rows, after)).toEqual([]);
    expect(remindAllFor(rows.slice(0, 1), before)).toEqual([]);
    expect(remindAllFor(rows, { ...before, canRemind: false })).toEqual([]);
  });

  it("the card shows exactly that offer", () => {
    const src = readFileSync("src/app/(school)/attendance-management/_components/class-wise.tsx", "utf8");
    expect(src).toMatch(/notMarkedOffer\(r, /);
    expect(src).toMatch(/remindAllFor\(rows, /);
    expect(src).toMatch(/<Words k="Request a correction" \/>/);
  });
});
