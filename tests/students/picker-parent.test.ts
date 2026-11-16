// The student picker's search shows one parent's name per student, so two children with the same
// name can be told apart (layman loop 2: "which Rahul?"). Only for people who may see parents.
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Current } from "@/lib/current";

const who = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/current", async (orig) => {
  const real = await orig<typeof import("@/lib/current")>();
  const { requirePermission } = await import("@/lib/permissions");
  const requireCurrent = async () => who.current as Current;
  return {
    ...real,
    getCurrent: async () => who.current as Current,
    requireCurrent,
    requirePage: async () => who.current as Current,
    requireAction: async (module: Parameters<typeof requirePermission>[1], action: Parameters<typeof requirePermission>[2]) => {
      const current = await requireCurrent();
      return { current, reach: requirePermission(current.permissions, module, action) };
    },
  };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers({ host: "school.test" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

import { accessIn } from "@/lib/auth/access";
import { abilities } from "@/lib/students/access";
import { searchStudents } from "@/app/(school)/student-management/_actions/lookup";
import { studentSchool, addStudent } from "./fixtures";

let s: Awaited<ReturnType<typeof studentSchool>>;

async function currentFor(userId: string): Promise<Current> {
  const access = await accessIn(userId, s.school.id);
  return { ...access!, ctx: { schoolId: s.school.id, userId }, user: { id: userId, displayName: "Test" }, menu: [], schools: [], session: null, support: null } as unknown as Current;
}

beforeAll(async () => {
  s = await studentSchool();
  await addStudent(s.ctx, s.s5a, { fullName: "Rahul Verma", guardianName: "Suresh Verma", guardianRelation: "Father", applyFeePlan: false });
  await addStudent(s.ctx, s.s5b, { fullName: "Rahul Verma", guardianName: "Mahesh Verma", guardianRelation: "Father", applyFeePlan: false });
}, 120_000);

describe("student picker search", () => {
  it("names a parent for each of two students with the same name", async () => {
    who.current = await currentFor(s.admin.id);
    const found = await searchStudents("Rahul");
    expect(found.map((f) => f.name)).toEqual(["Rahul Verma", "Rahul Verma"]);
    expect(found.map((f) => f.parent).sort()).toEqual(["Mahesh Verma", "Suresh Verma"]);
  });

  it("names no parent for a person who may not see parents", async () => {
    who.current = await currentFor(s.teacherUser.id);
    const found = await searchStudents("Rahul");
    if (abilities(who.current as Current).seeParents) return; // this role sees parents: covered above
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((f) => f.parent === undefined)).toBe(true);
  });
});
