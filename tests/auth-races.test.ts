// Security review 2026-11-15: counters that were read, then written, so tries sent at the same
// moment all passed the limit; and a "Reset password" link that left the old sessions open.
//  - wrong passwords (school and console sign-in) are counted in one statement, so a burst locks;
//  - a one-time code takes at most five tries, however many arrive at once;
//  - a sign-in link works once, and on a reset signs the login out everywhere, writes
//    "changed-password" and tells the person.
import { createHash, randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));

import { prisma, withConsole, withSchool } from "@/lib/db";
import { signIn, MAX_FAILED_ATTEMPTS } from "@/lib/auth/sign-in";
import { createSession, findSession } from "@/lib/auth/sessions";
import { acceptInvite, createInvite } from "@/lib/auth/invites";
import { MAX_CODE_TRIES, verifyChallenge } from "@/lib/auth/two-step";
import { hashPassword } from "@/lib/auth/password";
import { hashToken, newToken } from "@/lib/auth/tokens";
import { checkConsoleCode, consoleSignIn } from "@/lib/console/auth";
import { makeSchool, makeUser, noSleep, PASSWORD } from "./helpers";

const device = { userAgent: "Race test", ipAddress: null };
let school: Awaited<ReturnType<typeof makeSchool>>;
beforeAll(async () => { school = await makeSchool("Race School"); }, 120_000);

describe("wrong passwords sent at the same moment", () => {
  it("lock a school login after the fifth, even all at once", async () => {
    const user = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }] });
    await Promise.all(Array.from({ length: MAX_FAILED_ATTEMPTS + 3 }, () => signIn(user.username, "Wrong-pass-1", device, { sleep: noSleep })));
    const after = await prisma.userLogin.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.lockedUntil?.getTime() ?? 0).toBeGreaterThan(Date.now());
    expect(await signIn(user.username, PASSWORD, device, { sleep: noSleep })).toMatchObject({ ok: false });
  }, 120_000);

  it("lock a console login after the fifth, even all at once", async () => {
    const phone = `9${String(Date.now()).slice(-9)}`;
    const admin = await withConsole(async (tx) => tx.superAdminUser.create({ data: { name: `Race ${randomUUID().slice(0, 4)}`, phone, role: "SUPPORT", status: "ACTIVE", passwordHash: await hashPassword(PASSWORD) } }));
    await Promise.all(Array.from({ length: 8 }, (_, i) => consoleSignIn(phone, "Wrong-pass-1", { userAgent: "Race test", ipAddress: `10.9.${i}.1` }, { sleep: noSleep })));
    const after = await withConsole((tx) => tx.superAdminUser.findUniqueOrThrow({ where: { id: admin.id } }));
    expect(after.lockedUntil?.getTime() ?? 0).toBeGreaterThan(Date.now());
  }, 120_000);
});

describe("one-time codes sent at the same moment", () => {
  const hash = (token: string, code: string) => createHash("sha256").update(`${token}:${code}`).digest("hex");
  const wrongTries = (rs: { ok: boolean; message?: string }[]) => rs.filter((r) => !r.ok && /not right/.test(r.message ?? "")).length;

  it("get at most five tries at a school two-step code", async () => {
    const user = await makeUser({ schools: [{ id: school.id, roleKeys: ["principal"] }] });
    const token = newToken();
    await prisma.twoStepChallenge.create({ data: { userLoginId: user.id, tokenHash: hashToken(token), codeHash: hash(token, "123456"), channel: "sms", sentTo: "98•••", schoolId: school.id, expiresAt: new Date(Date.now() + 600_000) } });
    const rs = await Promise.all(Array.from({ length: 12 }, (_, i) => verifyChallenge(token, String(200000 + i), device)));
    expect(wrongTries(rs)).toBeLessThanOrEqual(MAX_CODE_TRIES);
    const row = await prisma.twoStepChallenge.findUniqueOrThrow({ where: { tokenHash: hashToken(token) } });
    expect(row.attempts).toBeLessThanOrEqual(MAX_CODE_TRIES);
    // The right code no longer works after five wrong tries.
    expect(await verifyChallenge(token, "123456", device)).toMatchObject({ ok: false });
  }, 120_000);

  it("get at most five tries at a console code", async () => {
    const admin = await withConsole(async (tx) => tx.superAdminUser.create({ data: { name: `Code ${randomUUID().slice(0, 4)}`, phone: `8${String(Date.now()).slice(-9)}`, role: "SUPPORT", status: "ACTIVE", passwordHash: await hashPassword(PASSWORD) } }));
    const challenge = newToken();
    await withConsole((tx) => tx.consoleCode.create({ data: { userId: admin.id, purpose: "sign-in", challengeHash: hashToken(challenge), codeHash: hash(challenge, "654321"), sentTo: "98•••", expiresAt: new Date(Date.now() + 600_000) } }));
    const rs = await Promise.all(Array.from({ length: 12 }, (_, i) => checkConsoleCode(challenge, String(300000 + i), "sign-in")));
    expect(wrongTries(rs)).toBeLessThanOrEqual(5);
    expect(await checkConsoleCode(challenge, "654321", "sign-in")).toMatchObject({ ok: false });
  }, 120_000);
});

describe("a sign-in link (invite, or Reset password)", () => {
  it("works once, even when two tabs send it at the same moment", async () => {
    const user = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }], status: "INVITED" });
    const token = await createInvite(user.id);
    const rs = await Promise.all([acceptInvite(token, "First-own-pass-71"), acceptInvite(token, "Second-own-pass-72")]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
  }, 120_000);

  it("on a reset signs the login out everywhere, writes changed-password and tells the person", async () => {
    const user = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }] });
    const session = await createSession(user.id, school.id, device);
    const token = await createInvite(user.id);
    expect(await acceptInvite(token, "Reset-own-pass-73", new Date(), device)).toMatchObject({ ok: true });
    expect(await findSession(session.token)).toBeNull();
    await withSchool({ schoolId: school.id, userId: null }, async (tx) => {
      expect(await tx.auditLogEntry.count({ where: { action: "changed-password", recordId: user.id } })).toBe(1);
      expect(await tx.notification.count({ where: { userLoginId: user.id, type: "security" } })).toBeGreaterThan(0);
    });
  }, 120_000);
});
