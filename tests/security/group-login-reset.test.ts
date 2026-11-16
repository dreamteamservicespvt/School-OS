// Owner decisions 1 and 4 (15 Nov 2026).
// 4: a login used in more than one school (a group login) has one two-step login for
//    every school, so only DREAM TEAM resets it, from the console; a School Admin of
//    one school sees "This login is used in more than one school. Ask School OS
//    support to reset it." and the server refuses it too.
// 1: Staff & HR cannot reset a Teacher's login: no new sign-in link (proved in
//    tests/staff-hr/login-ceiling.test.ts) and, here, no two-step reset either.
// Calls the real Users & Permissions server action as each person.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { prisma, withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { requirePermission } from "@/lib/permissions";
import { GROUP_LOGIN_RESET_WORDS, groupLoginsOf, isGroupLogin, resetGroupTwoStep } from "@/lib/auth/group-login";
import { ConsoleProblem } from "@/lib/console/schools";
import { makeSchool, makeUser } from "../helpers";

const who = vi.hoisted(() => ({ userId: "", schoolId: "" }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/flash", async (original) => ({ ...(await original<typeof import("@/lib/flash")>()), flash: async () => {} }));
vi.mock("@/lib/current", async (original) => ({
  ...(await original<typeof import("@/lib/current")>()),
  requireAction: async (module: string, action: string) => {
    const view = await accessIn(who.userId, who.schoolId);
    if (!view) throw new Error("no access");
    const current = { ...view, user: { id: who.userId, displayName: "Tester" }, ctx: { schoolId: who.schoolId, userId: who.userId }, school: { ...view.school, timeZone: "Asia/Kolkata", name: "Group School" } };
    const reach = requirePermission(view.permissions, module as never, action as never);
    return { current, reach };
  },
}));

const users = await import("@/app/(school)/settings/users/actions");

const form = (o: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.set(k, v); return fd; };
const resetForm = (userId: string) => form({ userId, reason: "lost-phone", checkDone: "In person at the office, with their ID card" });
const resetAt = async (id: string) => (await prisma.userLogin.findUniqueOrThrow({ where: { id }, select: { twoStepResetAt: true } })).twoStepResetAt;
const actor = { id: null, name: "Support Person", role: null } as const;

let a: Awaited<ReturnType<typeof makeSchool>>;
let b: Awaited<ReturnType<typeof makeSchool>>;
let adminA: { id: string };
let groupLogin: { id: string };
let teacher: { id: string };

beforeAll(async () => {
  a = await makeSchool("Group School A");
  b = await makeSchool("Group School B");
  adminA = await makeUser({ schools: [{ id: a.id, roleKeys: ["school-admin"] }], name: "Admin of A" });
  groupLogin = await makeUser({ schools: [{ id: a.id, roleKeys: ["principal"] }, { id: b.id, roleKeys: ["principal"] }], name: "Group Owner" });
  teacher = await makeUser({ schools: [{ id: a.id, roleKeys: ["teacher"] }], name: "Only-A Teacher" });
}, 120_000);

describe("a group login's two-step reset", () => {
  it("is refused to a School Admin of one school, on the server, with the words to ask support", async () => {
    expect(await isGroupLogin(groupLogin.id)).toBe(true);
    who.userId = adminA.id; who.schoolId = a.id;
    const r = await users.twoStepAction(null, resetForm(groupLogin.id));
    expect(r).toMatchObject({ ok: false, message: GROUP_LOGIN_RESET_WORDS });
    expect(await resetAt(groupLogin.id)).toBeNull();
    // A login of this school only is reset as before.
    expect(await users.twoStepAction(null, resetForm(teacher.id))).toMatchObject({ ok: true });
    expect(await resetAt(teacher.id)).not.toBeNull();
  });

  it("is done by DREAM TEAM from the console: every school's Audit Log gets it and the person is told", async () => {
    const listed = await groupLoginsOf(a.id);
    expect(listed.map((g) => g.userLoginId)).toEqual([groupLogin.id]);
    expect(listed[0].schools).toEqual(expect.arrayContaining(["Group School A", "Group School B"]));

    await expect(resetGroupTwoStep(actor, a.id, groupLogin.id, { reason: "lost" })).rejects.toThrow(ConsoleProblem);
    await expect(resetGroupTwoStep(actor, a.id, teacher.id, { reason: "Lost phone, called the school office back" })).rejects.toThrow(/this school only/);
    const r = await resetGroupTwoStep(actor, a.id, groupLogin.id, { reason: "Lost phone, called the school office back" });
    expect(r).toEqual({ name: "Group Owner", schools: 2 });
    expect(await resetAt(groupLogin.id)).not.toBeNull();
    for (const s of [a, b]) {
      const rows = await withSchool({ schoolId: s.id, userId: null }, (tx) => tx.auditLogEntry.findMany({ where: { recordId: groupLogin.id, action: "reset-two-step" } }));
      expect(rows).toHaveLength(1);
      expect(rows[0].actorNote).toBe("DREAM TEAM support: Support Person");
      const notes = await withSchool({ schoolId: s.id, userId: null }, (tx) => tx.notification.count({ where: { userLoginId: groupLogin.id, type: "security" } }));
      expect(notes).toBe(1);
    }
  });

  it("refuses a login that is not in the school the console is looking at", async () => {
    const elsewhere = await makeUser({ schools: [{ id: b.id, roleKeys: ["teacher"] }], name: "Only-B Teacher" });
    await expect(resetGroupTwoStep(actor, a.id, elsewhere.id, { reason: "Lost phone, called the school office back" })).rejects.toThrow(/not found in this school/);
  });
});

describe("decision 1: Staff & HR cannot reset a Teacher's login", () => {
  it("refuses HR a two-step reset of a Teacher's login", async () => {
    await withSchool({ schoolId: a.id, userId: null }, (tx) => tx.role.updateMany({ where: { schoolId: a.id, key: "hr" }, data: { isEnabled: true } }));
    const hr = await makeUser({ schools: [{ id: a.id, roleKeys: ["hr"] }], name: "HR of A" });
    const t2 = await makeUser({ schools: [{ id: a.id, roleKeys: ["teacher"] }], name: "Second Teacher" });
    who.userId = hr.id; who.schoolId = a.id;
    const r = await users.twoStepAction(null, resetForm(t2.id));
    expect(r?.ok).toBe(false);
    expect(await resetAt(t2.id)).toBeNull();
  });
});
