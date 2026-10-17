// The Super Admin console's walls (07-super-admin.md §1, §2, §11; 08-platform-security.md §1):
// - a school login can never open the console, and a console login has no School Access;
// - DREAM TEAM never reads a school's records (students, fees, staff) from the console;
// - console tables are invisible from inside a school;
// - every console action writes an Activity Log line, and the log cannot be changed;
// - each console role is refused on the server for what it may not do;
// - the last active Owner cannot be disabled or demoted.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined), set: (name: string, value: string) => { jar.set(name, value); }, delete: (name: string) => { jar.delete(name); } }),
  headers: async () => new Headers({ "user-agent": "vitest" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

import { randomUUID } from "node:crypto";
import type { ConsoleRole, SuperAdminUser } from "@prisma/client";
import { prisma, withConsole, withConsoleSchool, withSchool } from "@/lib/db";
import { hashToken, newToken } from "@/lib/auth/tokens";
import { createSession } from "@/lib/auth/sessions";
import { hashPassword } from "@/lib/auth/password";
import { CONSOLE_COOKIE, consoleSignIn } from "@/lib/console/auth";
import { requireConsole, requireConsolePage } from "@/lib/console/current";
import { CONSOLE_CAN } from "@/lib/console/roles";
import { findSchoolInvite, finishSchoolInvite, sendSchoolInviteCode } from "@/lib/console/school-invite";
import { addAdmin } from "@/lib/console/schools";
import { actorOf } from "@/lib/console/auth";
import { requireCurrent } from "@/lib/current";
import { changeRoleAction, disableTeamAction, inviteTeamAction, resendTeamAction } from "@/app/console/(app)/team/actions";
import { editDetailsAction, groupAction, noteAction, statusAction } from "@/app/console/(app)/schools/actions";
import { changePricesAction, choosePlanAction, foundingAction } from "@/app/console/(app)/billing/actions";
import { makeSchool, makeUser, noSleep, PASSWORD } from "../helpers";

type School = Awaited<ReturnType<typeof makeSchool>>;
let school: School;
let other: School;
const people = {} as Record<ConsoleRole, SuperAdminUser>;
let schoolAdmin: { id: string; username: string };

const mobile = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;

async function teamMember(role: ConsoleRole, status: "ACTIVE" | "INVITED" = "ACTIVE") {
  return withConsole(async (tx) => tx.superAdminUser.create({ data: { name: `${role} ${randomUUID().slice(0, 4)}`, phone: mobile(), role, status, passwordHash: await hashPassword(PASSWORD) } }));
}

/** Signs a console person in for the next calls (their console cookie). */
async function asConsole(u: SuperAdminUser) {
  const token = newToken();
  await withConsole((tx) => tx.consoleSession.create({ data: { userId: u.id, tokenHash: hashToken(token), lastUsedAt: new Date(), expiresAt: new Date(Date.now() + 30 * 60_000) } }));
  jar.clear();
  jar.set(CONSOLE_COOKIE, token);
}

async function card(s: School) {
  await withConsoleSchool(s.id, (tx) => tx.consoleSchool.create({ data: { id: s.id, code: s.code, name: s.name, city: "Hyderabad", state: "Telangana", status: "TRIAL", statusSince: new Date(), startedAs: "TRIAL" } }));
}

const lines = () => withConsole((tx) => tx.consoleActivityEntry.count());
const form = (o: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.set(k, v); return fd; };

beforeAll(async () => {
  school = await makeSchool("Console Wall School");
  other = await makeSchool("Console Other School");
  await card(school);
  await card(other);
  for (const r of ["OWNER", "ONBOARDING", "SUPPORT"] as ConsoleRole[]) people[r] = await teamMember(r);
  const u = await makeUser({ schools: [{ id: school.id, roleKeys: ["school-admin"] }] });
  schoolAdmin = { id: u.id, username: u.username };
  // A student-like school record the console must never see: the school's own audit trail.
  await withSchool({ schoolId: school.id, userId: null }, (tx) => tx.auditLogEntry.create({ data: { schoolId: school.id, action: "test", recordType: "Student", recordId: "s1" } }));
});

beforeEach(() => jar.clear());

describe("school logins and console logins are separate", () => {
  it("a school login's session cannot open the console", async () => {
    const { token } = await createSession(schoolAdmin.id, school.id, { userAgent: "test" });
    jar.set("sos_session", token);
    jar.set(CONSOLE_COOKIE, token);
    await expect(requireConsole()).rejects.toThrow(/REDIRECT \/console\/sign-in/);
  });

  it("a school username and password are refused at the console sign-in", async () => {
    const r = await consoleSignIn(schoolAdmin.username, PASSWORD, { userAgent: "test" }, { sleep: noSleep });
    expect(r.kind).toBe("error");
  });

  it("a console person has no School Access, so no school page opens for them", async () => {
    await asConsole(people.OWNER);
    jar.set("sos_session", jar.get(CONSOLE_COOKIE)!);
    await expect(requireCurrent()).rejects.toThrow(/REDIRECT \/sign-in/);
  });
});

describe("the console never reads a school's records", () => {
  it("withConsole sees no school, student, staff, fee or audit rows", async () => {
    await withConsole(async (tx) => {
      expect(await tx.school.count()).toBe(0);
      expect(await tx.student.count()).toBe(0);
      expect(await tx.auditLogEntry.count()).toBe(0);
      expect(await tx.schoolAccess.count()).toBe(0);
      expect(await tx.role.count()).toBe(0);
    });
  });

  it("one school's wall in the console shows that school only, never another", async () => {
    await withConsoleSchool(school.id, async (tx) => {
      expect((await tx.school.findMany()).map((s) => s.id)).toEqual([school.id]);
      expect(await tx.auditLogEntry.count({ where: { schoolId: other.id } })).toBe(0);
    });
  });

  it("console tables are invisible from inside a school", async () => {
    await withSchool({ schoolId: school.id, userId: schoolAdmin.id }, async (tx) => {
      const tries = [
        tx.consoleSchool.count(),
        tx.superAdminUser.count(),
        tx.consoleActivityEntry.count(),
        tx.schoolInvite.count(),
        tx.platformInvoice.count(),
        tx.subscription.count(),
        tx.supportAccessRequest.count(),
      ];
      for (const t of tries) expect(await t.catch(() => 0)).toBe(0);
    });
  });
});

describe("the Activity Log", () => {
  it("cannot be changed or deleted, even by the console", async () => {
    await withConsole((tx) => tx.consoleActivityEntry.create({ data: { actorName: "Test", type: "note", text: "kept forever" } }));
    await expect(withConsole((tx) => tx.consoleActivityEntry.updateMany({ data: { text: "changed" } }))).rejects.toThrow();
    await expect(withConsole((tx) => tx.consoleActivityEntry.deleteMany({}))).rejects.toThrow();
  });

  it("gets a line for every console action", async () => {
    await asConsole(people.OWNER);
    const steps: [string, () => Promise<unknown>][] = [
      ["note", () => noteAction(null, form({ schoolId: school.id, text: "Called the principal." }))],
      ["group", () => groupAction(null, form({ schoolId: school.id, group: "new", newGroupName: `Group ${randomUUID().slice(0, 4)}` }))],
      ["details", () => editDetailsAction(null, form({ schoolId: school.id, name: "Console Wall School", city: "Warangal", state: "Telangana", board: "CBSE", schoolType: "Day school", phone: "040 2345 6789" }))],
      ["plan", () => choosePlanAction(null, form({ schoolId: school.id, planKey: "essential", students: "300", payIn: "YEARLY" }))],
      ["founding", () => foundingAction(null, form({ schoolId: school.id }))],
      ["prices", () => changePricesAction(null, form({ essential: "120", complete: "200", hostel: "30", validFrom: "2027-04-01" }))],
      ["invite team", () => inviteTeamAction(null, form({ name: "Pavan Kalyan", mobile: mobile(), role: "SUPPORT" }))],
      ["suspend", () => statusAction(null, form({ schoolId: other.id, move: "suspend", reason: "Asked to pause for the summer." }))],
    ];
    for (const [what, run] of steps) {
      const before = await lines();
      const r = (await run()) as { ok: boolean; message?: string };
      expect(r.ok, `${what}: ${r.message ?? ""}`).toBe(true);
      expect(await lines(), what).toBeGreaterThan(before);
    }
    const last = await withConsole((tx) => tx.consoleActivityEntry.findFirst({ orderBy: { at: "desc" } }));
    expect(last?.actorName).toBe(people.OWNER.name);
  });
});

describe("console roles are checked on the server", () => {
  it("matches 07-super-admin.md: only the Owner manages the team, closes schools and marks payments", () => {
    expect(CONSOLE_CAN.OWNER).toEqual(expect.arrayContaining(["team", "status", "markPaid", "discount", "prices"]));
    for (const r of ["ONBOARDING", "SUPPORT"] as const) {
      for (const a of ["team", "status", "markPaid", "discount", "prices"] as const) expect(CONSOLE_CAN[r]).not.toContain(a);
    }
    expect(CONSOLE_CAN.SUPPORT).not.toContain("add");
  });

  it("Support and Onboarding cannot open the Team page", async () => {
    for (const r of ["ONBOARDING", "SUPPORT"] as const) {
      await asConsole(people[r]);
      await expect(requireConsolePage("team")).rejects.toThrow(/REDIRECT \/console\?denied=1/);
    }
  });

  it("refuses Team, status, price and discount actions for other roles, and changes nothing", async () => {
    for (const r of ["ONBOARDING", "SUPPORT"] as const) {
      await asConsole(people[r]);
      const before = await lines();
      const staff = await withConsole((tx) => tx.superAdminUser.count());
      const tries = [
        inviteTeamAction(null, form({ name: "Not allowed", mobile: mobile(), role: "OWNER" })),
        changeRoleAction(null, form({ userId: people.SUPPORT.id, role: "OWNER" })),
        disableTeamAction(null, form({ userId: people.OWNER.id, reason: "Trying to take over" })),
        statusAction(null, form({ schoolId: school.id, move: "close", reason: "Not my call to make", typedName: "Console Wall School" })),
        changePricesAction(null, form({ essential: "1", complete: "1", hostel: "1", validFrom: "2027-04-01" })),
        foundingAction(null, form({ schoolId: school.id })),
      ];
      for (const t of tries) {
        const res = (await t) as { ok: boolean; message?: string };
        expect(res.ok).toBe(false);
        expect(res.message).toMatch(/role cannot/i);
      }
      expect(await lines()).toBe(before);
      expect(await withConsole((tx) => tx.superAdminUser.count())).toBe(staff);
    }
    const s = await withConsole((tx) => tx.consoleSchool.findUnique({ where: { id: school.id } }));
    expect(s?.status).not.toBe("CLOSED");
  });

  it("Support cannot add a school", () => {
    expect(CONSOLE_CAN.SUPPORT.includes("add")).toBe(false);
    expect(CONSOLE_CAN.ONBOARDING.includes("add")).toBe(true);
  });
});

describe("the Team", () => {
  it("never loses its last active Owner", async () => {
    // Owners made by other test files step aside, so this file's Owner is the only active one.
    await withConsole((tx) => tx.superAdminUser.updateMany({ where: { role: "OWNER", status: "ACTIVE", id: { not: people.OWNER.id } }, data: { status: "DISABLED" } }));
    const lone = await withConsole((tx) => tx.superAdminUser.findMany({ where: { role: "OWNER", status: "ACTIVE" } }));
    expect(lone).toHaveLength(1);
    const helper = await teamMember("OWNER");
    await asConsole(helper);
    // Two Owners: one may be made Onboarding; then the other is the last one.
    expect(((await changeRoleAction(null, form({ userId: helper.id, role: "ONBOARDING" }))) as { ok: boolean }).ok).toBe(true);
    await asConsole(people.OWNER);
    const demote = (await changeRoleAction(null, form({ userId: people.OWNER.id, role: "SUPPORT" }))) as { ok: boolean; message?: string };
    expect(demote.ok).toBe(false);
    expect(demote.message).toMatch(/at least one active Owner/);
    const self = (await disableTeamAction(null, form({ userId: people.OWNER.id, reason: "Leaving the company" }))) as { ok: boolean };
    expect(self.ok).toBe(false);
  });

  it("disabling a member ends their console sessions at once, and Enable again sends a new invite", async () => {
    const m = await teamMember("SUPPORT");
    await asConsole(m);
    const theirCookie = jar.get(CONSOLE_COOKIE)!;
    await asConsole(people.OWNER);
    expect(((await disableTeamAction(null, form({ userId: m.id, reason: "Left DREAM TEAM" }))) as { ok: boolean }).ok).toBe(true);
    jar.clear();
    jar.set(CONSOLE_COOKIE, theirCookie);
    await expect(requireConsole()).rejects.toThrow(/REDIRECT/);
    await asConsole(people.OWNER);
    expect(((await resendTeamAction(null, form({ userId: m.id }))) as { ok: boolean }).ok).toBe(true);
    const after = await withConsole((tx) => tx.superAdminUser.findUnique({ where: { id: m.id } }));
    expect(after?.status).toBe("INVITED");
    expect(after?.passwordHash).toBeNull();
  });
});

describe("a School Admin's invite link", () => {
  it("needs the code on the mobile, sets their own password once, and is logged", async () => {
    const phone = mobile();
    await addAdmin(actorOf(people.ONBOARDING), school.id, { name: "Kavitha Nair", mobile: phone, email: null, roleKey: "school-admin", channels: ["sms"], checked: "Called the school office" });
    const inv = await withConsole((tx) => tx.schoolInvite.findFirstOrThrow({ where: { forSchoolId: school.id, phone }, orderBy: { sentAt: "desc" } }));
    // The link's token is only in the message; give this invite a known one for the test.
    const token = newToken();
    await withConsole((tx) => tx.schoolInvite.update({ where: { id: inv.id }, data: { tokenHash: hashToken(token) } }));
    expect((await findSchoolInvite(token)).state).toBe("ok");
    expect((await sendSchoolInviteCode(token, "127.0.0.1")).ok).toBe(true);
    await withConsole((tx) => tx.schoolInvite.update({ where: { id: inv.id }, data: { codeHash: hashToken(`${inv.id}:123456`) } }));
    const wrong = await finishSchoolInvite(token, "000000", "Good-pass-123", { userAgent: "test" });
    expect(wrong.ok).toBe(false);
    const before = await lines();
    const done = await finishSchoolInvite(token, "123456", "Good-pass-123", { userAgent: "test" });
    expect(done.ok).toBe(true);
    expect(await lines()).toBe(before + 1);
    expect((await findSchoolInvite(token)).state).toBe("used");
    const again = await finishSchoolInvite(token, "123456", "Other-pass-456", { userAgent: "test" });
    expect(again.ok).toBe(false);
    const login = await prisma.userLogin.findUnique({ where: { id: inv.userLoginId } });
    expect(login?.status).toBe("ACTIVE");
  });
});

describe("a paused school", () => {
  it("sends staff to the paused page and lets only its admins reach Settings", async () => {
    const teacher = await makeUser({ schools: [{ id: other.id, roleKeys: ["class-teacher"] }] });
    const admin = await makeUser({ schools: [{ id: other.id, roleKeys: ["school-admin"] }] });
    // "other" was suspended above by the Owner.
    jar.set("sos_session", (await createSession(teacher.id, other.id, { userAgent: "test" })).token);
    await expect(requireCurrent()).rejects.toThrow(/REDIRECT \/paused/);
    await expect(requireCurrent({ paused: "admin" })).rejects.toThrow(/REDIRECT \/paused/);
    jar.set("sos_session", (await createSession(admin.id, other.id, { userAgent: "test" })).token);
    await expect(requireCurrent()).rejects.toThrow(/REDIRECT \/paused/);
    expect((await requireCurrent({ paused: "admin" })).user.id).toBe(admin.id);
  });
});
