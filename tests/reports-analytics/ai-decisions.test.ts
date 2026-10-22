// Looking ahead and AI signals (TEACHING-12): "Add for review" and "Not a
// concern" work for every kind of suggestion, through the real server action.
// "May be thinking of leaving" keys carry the areas joined with "+", which the
// action once refused ("That suggestion was not found.").
// The signed-in person is swapped in for the server action; everything else
// (the permission check, the walls, the audit log) is the real code.
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Current } from "@/lib/current";

const who = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/current", async (orig) => {
  const real = await orig<typeof import("@/lib/current")>();
  const { requirePermission } = await import("@/lib/permissions");
  const requireCurrent = async () => who.current as Current;
  return {
    ...real,
    requireCurrent,
    requireAction: async (module: Parameters<typeof requirePermission>[1], action: Parameters<typeof requirePermission>[2]) => {
      const current = await requireCurrent();
      return { current, reach: requirePermission(current.permissions, module, action) };
    },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined }));
vi.mock("@/lib/flash", () => ({ flash: async () => undefined }));

import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { LEAVING_WITH_FEES } from "@/lib/reports/forecasts";
import { SIGNAL_KEY_RE } from "@/lib/reports/warnings";
import { aiDecisionAction } from "@/app/(school)/reports-analytics/actions";
import { feature } from "../fees/fixture";
import { makeAttendanceSchool, type Fixture } from "../attendance/fixture";

let f: Fixture;
const month = new Date().toISOString().slice(0, 7);
const today = new Date().toISOString().slice(0, 10);

async function currentFor(userId: string): Promise<Current> {
  const access = await accessIn(userId, f.school.id);
  return { ...access!, ctx: { schoolId: f.school.id, userId }, user: { id: userId, displayName: "Test" }, menu: [], schools: [], session: null } as unknown as Current;
}

/** One stored suggestion of each kind Looking ahead makes (forecasts.ts), keyed the same way. */
function kinds() {
  const [a, b, c, d] = f.studentsA;
  const year = f.year.id;
  return [
    { key: `att-proj:${a.id}:${month}`, area: "attendance", studentId: a.id, title: `${a.name} may end the year below the attendance threshold` },
    { key: `marks-proj:${b.id}:${f.year.id}`, area: "marks", studentId: b.id, title: `${b.name} may do worse in the next exam` },
    { key: `class-proj:${f.cls.id}:${year}`, area: "marks", studentId: null, title: "Class 5 may do worse in the next exam" },
    { key: `fee-late:${month}`, area: "fees", studentId: null, title: "Fees likely to come late this month" },
    { key: `leaving:${c.id}:attendance+marks:${month}`, area: "students", studentId: c.id, title: `${c.name} (Class 5 A) may be thinking of leaving` },
    { key: `${LEAVING_WITH_FEES}${d.id}:attendance+fees+marks:${month}`, area: "students", studentId: d.id, title: `${d.name} (Class 5 A) may be thinking of leaving` },
    { key: `seats-over:${year}:${f.cls.id}`, area: "admissions", studentId: null, title: "Class 5 may have more children than seats" },
    { key: `seats-empty:${year}:${f.cls.id}`, area: "admissions", studentId: null, title: "Seats in Class 5 may stay empty" },
    { key: `subs:${today}`, area: "staff", studentId: null, title: "Periods may go without a substitute" },
    { key: `cash:${month}`, area: "finance", studentId: null, title: "Cash may run short" },
  ];
}

beforeAll(async () => {
  f = await makeAttendanceSchool("AI Decisions School");
  const ctx = { schoolId: f.school.id, userId: null };
  for (const k of ["ai-assistant", "ai-forecasts"]) await feature(ctx, k);
  await withSchool(ctx, async (tx) => {
    for (const s of kinds()) {
      await tx.forecastSignal.create({ data: { schoolId: f.school.id, key: s.key, area: s.area, strength: "WATCH", title: s.title, body: "Suggestion.", source: "test records", studentId: s.studentId } });
    }
  });
  who.current = await currentFor(f.principal.id);
}, 180_000);

describe("deciding on suggestions", () => {
  it("accepts every key the suggestions use, and nothing odd", () => {
    for (const s of kinds()) expect(SIGNAL_KEY_RE.test(s.key)).toBe(true);
    const [a] = f.studentsA;
    expect(SIGNAL_KEY_RE.test(`dropout:${a.id}:${month}`)).toBe(true);
    expect(SIGNAL_KEY_RE.test(`unusual-att:${a.id}:${today}`)).toBe(true);
    expect(SIGNAL_KEY_RE.test(`unusual-fee:${a.id}:${today}`)).toBe(true);
    expect(SIGNAL_KEY_RE.test("a b")).toBe(false);
    expect(SIGNAL_KEY_RE.test("x".repeat(201))).toBe(false);
    expect(SIGNAL_KEY_RE.test("<script>")).toBe(false);
  });

  it("adds each kind for review or closes it as not a concern, recorded in the audit log", async () => {
    const list = kinds();
    for (const [i, s] of list.entries()) {
      const decision = i % 2 === 0 ? "FLAGGED" : "DISMISSED";
      expect(await aiDecisionAction(s.key, decision), s.key).toBeNull();
    }
    const ctx = { schoolId: f.school.id, userId: null };
    const decided = await withSchool(ctx, (tx) => tx.aiSignalDecision.findMany());
    expect(decided.map((x) => x.signalKey).sort()).toEqual(list.map((s) => s.key).sort());
    const audits = await withSchool(ctx, (tx) => tx.auditLogEntry.count({ where: { recordType: "AI Signal", action: { in: ["suggestion-added", "suggestion-dismissed"] } } }));
    expect(audits).toBe(list.length);
  });

  it("sends a 'may be thinking of leaving' suggestion for review as a Watch flag on the student", async () => {
    const leaving = kinds().find((s) => s.key.startsWith("leaving:"))!;
    const ctx = { schoolId: f.school.id, userId: null };
    const decision = await withSchool(ctx, (tx) => tx.aiSignalDecision.findFirstOrThrow({ where: { signalKey: leaving.key } }));
    expect(decision.decision).toBe("FLAGGED");
    const flag = await withSchool(ctx, (tx) => tx.riskFlag.findFirstOrThrow({ where: { id: decision.flagId! } }));
    expect(flag).toMatchObject({ studentId: leaving.studentId, strength: "WATCH", closedAt: null });
  });

  it("says plainly when a suggestion is no longer there, and changes nothing", async () => {
    expect(await aiDecisionAction(kinds()[4].key, "DISMISSED")).toBe("This suggestion is no longer there.");
    expect(await aiDecisionAction("leaving:not a key", "DISMISSED")).toBe("That suggestion was not found.");
  });

  it("is not open to a class teacher, who has no Looking ahead", async () => {
    const ctx = { schoolId: f.school.id, userId: null };
    await withSchool(ctx, (tx) => tx.forecastSignal.create({ data: { schoolId: f.school.id, key: `leaving:${f.studentsB[0].id}:attendance+fees:${month}`, area: "students", title: "Another may be thinking of leaving", body: "Suggestion.", source: "test records", studentId: f.studentsB[0].id } }));
    who.current = await currentFor(f.teacherA.id);
    try {
      expect(await aiDecisionAction(`leaving:${f.studentsB[0].id}:attendance+fees:${month}`, "DISMISSED")).not.toBeNull();
      expect(await withSchool(ctx, (tx) => tx.aiSignalDecision.count({ where: { signalKey: `leaving:${f.studentsB[0].id}:attendance+fees:${month}` } }))).toBe(0);
    } finally {
      who.current = await currentFor(f.principal.id);
    }
  });
});
