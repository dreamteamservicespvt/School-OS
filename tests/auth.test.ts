// Logins and passwords (08-platform-security.md §2).
import { beforeAll, describe, expect, it, vi } from "vitest";
import { prisma, withSchool } from "@/lib/db";
import { signIn, MAX_FAILED_ATTEMPTS } from "@/lib/auth/sign-in";
import { findSession, revokeAllSessions } from "@/lib/auth/sessions";
import { acceptInvite, createInvite, findInvite } from "@/lib/auth/invites";
import { checkNewPassword } from "@/lib/auth/password";
import { makeSchool, makeUser, noSleep, PASSWORD } from "./helpers";

const device = { userAgent: "Test browser", ipAddress: "10.0.0.1" };
let school: Awaited<ReturnType<typeof makeSchool>>;
let admin: Awaited<ReturnType<typeof makeUser>>;

beforeAll(async () => {
  school = await makeSchool();
  admin = await makeUser({ schools: [{ id: school.id, roleKeys: ["school-admin"] }], name: "Office Head" });
});

describe("passwords", () => {
  it("are stored hashed, never as typed", async () => {
    const user = await prisma.userLogin.findUniqueOrThrow({ where: { id: admin.id } });
    expect(user.passwordHash).not.toContain(PASSWORD);
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it("must be at least 8 characters with a letter and a number", () => {
    expect(checkNewPassword("short1")).toMatch(/8 characters/);
    expect(checkNewPassword("onlyletters")).toMatch(/letter and one number/);
    expect(checkNewPassword("letters123")).toBeNull();
  });
});

describe("signing in", () => {
  it("works with the right password, and is written to the audit log", async () => {
    const result = await signIn(admin.username.toUpperCase(), PASSWORD, device, { sleep: noSleep });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.schoolId).toBe(school.id);
    const session = await findSession(result.token);
    expect(session?.userLoginId).toBe(admin.id);
    const stored = await prisma.session.findFirstOrThrow({ where: { id: session!.id } });
    expect(stored.tokenHash).not.toBe(result.token);
    const audit = await withSchool({ schoolId: school.id, userId: null }, (tx) =>
      tx.auditLogEntry.findFirst({ where: { action: "signed-in", recordId: admin.id } }),
    );
    expect(audit?.device).toBe("Test browser");
  });

  it("gives the same answer for a wrong username and a wrong password", async () => {
    const wrongUser = await signIn("nobody-here", PASSWORD, device, { sleep: noSleep });
    const wrongPassword = await signIn(admin.username, "Wrong-password-1", device, { sleep: noSleep });
    expect(wrongUser).toEqual({ ok: false, message: expect.stringContaining("username or password is wrong") });
    expect(wrongPassword).toEqual({ ok: false, message: expect.stringContaining("username or password is wrong") });
    await prisma.userLogin.update({ where: { id: admin.id }, data: { failedAttempts: 0 } });
  });

  it("slows down, then locks for 15 minutes after 5 wrong passwords, and tells the School Admin", async () => {
    const user = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }], name: "Ravi Teacher" });
    const sleep = vi.fn(noSleep);
    let last;
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) last = await signIn(user.username, "Wrong-password-1", device, { sleep });
    expect(last).toEqual({ ok: false, message: expect.stringContaining("locked for 15 minutes") });
    expect(sleep).toHaveBeenCalled();

    const locked = await signIn(user.username, PASSWORD, device, { sleep });
    expect(locked).toEqual({ ok: false, message: expect.stringContaining("locked for 15 more minutes") });

    const later = await signIn(user.username, PASSWORD, device, { sleep, now: new Date(Date.now() + 16 * 60 * 1000) });
    expect(later.ok).toBe(true);

    const notes = await withSchool({ schoolId: school.id, userId: null }, (tx) => tx.notification.findMany({ where: { type: "security" } }));
    expect(notes.map((n) => n.userLoginId).sort()).toEqual([admin.id, user.id].sort());
    expect(notes.find((n) => n.userLoginId === admin.id)?.text).toContain("Ravi Teacher");
  });

  it("refuses a switched-off login", async () => {
    const user = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }], status: "DISABLED" });
    expect(await signIn(user.username, PASSWORD, device, { sleep: noSleep })).toEqual({ ok: false, message: expect.stringContaining("switched off") });
  });

  it("refuses a login with no school", async () => {
    const user = await makeUser({ schools: [] });
    expect(await signIn(user.username, PASSWORD, device, { sleep: noSleep })).toEqual({ ok: false, message: expect.stringContaining("not linked to any school") });
  });
});

describe("signed-in devices", () => {
  it("sign out everywhere ends every session at once", async () => {
    const first = await signIn(admin.username, PASSWORD, device, { sleep: noSleep });
    const second = await signIn(admin.username, PASSWORD, { userAgent: "Phone" }, { sleep: noSleep });
    if (!first.ok || !second.ok) throw new Error("sign-in failed");
    await revokeAllSessions(admin.id, "Signed out everywhere");
    expect(await findSession(first.token)).toBeNull();
    expect(await findSession(second.token)).toBeNull();
  });

  it("switching a login off ends its sessions", async () => {
    const user = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }] });
    const result = await signIn(user.username, PASSWORD, device, { sleep: noSleep });
    if (!result.ok) throw new Error("sign-in failed");
    await prisma.userLogin.update({ where: { id: user.id }, data: { status: "DISABLED" } });
    expect(await findSession(result.token)).toBeNull();
  });

  it("a session ends after a week without use", async () => {
    const result = await signIn(admin.username, PASSWORD, device, { sleep: noSleep });
    if (!result.ok) throw new Error("sign-in failed");
    expect(await findSession(result.token, new Date(Date.now() + 8 * 24 * 60 * 60 * 1000))).toBeNull();
  });
});

describe("invites", () => {
  it("lets a new user set their own password once", async () => {
    const user = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }], status: "INVITED" });
    expect(await signIn(user.username, PASSWORD, device, { sleep: noSleep })).toEqual({ ok: false, message: expect.stringContaining("invite link") });

    const token = await createInvite(user.id);
    const stored = await prisma.userLogin.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.inviteTokenHash).not.toBe(token);

    expect(await acceptInvite(token, "short")).toEqual({ ok: false, message: expect.stringContaining("8 characters") });
    expect(await acceptInvite(token, "My-own-pass-9")).toMatchObject({ ok: true });
    expect(await acceptInvite(token, "Another-pass-9")).toEqual({ ok: false, message: expect.stringContaining("expired or was already used") });
    expect((await signIn(user.username, "My-own-pass-9", device, { sleep: noSleep })).ok).toBe(true);
  });

  it("stops working after 7 days", async () => {
    const user = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }], status: "INVITED" });
    const token = await createInvite(user.id);
    expect(await findInvite(token, new Date(Date.now() + 8 * 24 * 60 * 60 * 1000))).toBeNull();
  });
});
