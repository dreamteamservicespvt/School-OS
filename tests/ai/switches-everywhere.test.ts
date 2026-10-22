// The AI roles the school chose are kept by the server actions themselves, not
// only by hiding buttons (gap list G24): remark suggestions on report cards
// are refused for a class teacher whose role is not chosen for the AI
// assistant, and given once it is. The signed-in person is swapped in; the
// rest (permissions, scope, transaction) is the real code.
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

import { examSettings } from "@/lib/exams/settings";
import { saveAssistant, setFeature } from "@/lib/settings/switches";
import { draftRemarksAction } from "@/app/(school)/examination-results/report-cards/actions";
import { academicSchool } from "../academic/fixture";

let s: Awaited<ReturnType<typeof academicSchool>>;

beforeAll(async () => {
  s = await academicSchool();
  await s.run(async (tx) => {
    await examSettings(tx, s.ctx);
    await saveAssistant(tx, s.ctx, { on: true, roles: ["principal"] });
    await setFeature(tx, s.ctx, "ai-teacher-assistant", true);
  });
}, 120_000);

describe("remark suggestions follow the AI roles", () => {
  it("are refused to a class teacher whose role the school did not choose for AI", async () => {
    who.current = await s.currentFor(s.teacherUser.id);
    const r = await draftRemarksAction(s.s5a.id, "year");
    expect(r.ok).toBe(false);
    expect(r.message).toBe("Remark suggestions are not used by your role in this school.");
  });

  it("are refused to everyone while the AI assistant is off", async () => {
    await s.run((tx) => saveAssistant(tx, s.ctx, { on: false, roles: ["principal", "teacher"] }));
    who.current = await s.currentFor(s.teacherUser.id);
    const r = await draftRemarksAction(s.s5a.id, "year");
    expect(r).toMatchObject({ ok: false, message: "Remark suggestions are switched off for this school." });
  });

  it("are offered once the teacher's role is chosen (nothing is saved by drafting)", async () => {
    await s.run((tx) => saveAssistant(tx, s.ctx, { on: true, roles: ["principal", "teacher"] }));
    who.current = await s.currentFor(s.teacherUser.id);
    const r = await draftRemarksAction(s.s5a.id, "year");
    // Past the AI check: the period itself is what is missing in this small school.
    expect(r.message).not.toMatch(/AI|switched off|your role/);
  });
});
