// Password rules (Settings, Users & Permissions, "Password and session rules";
// 20-settings.md "Set password format rules", gap list G45): the shortest
// password, earlier passwords that may not be used again and an optional expiry,
// within safe bounds; always a letter and a number and never a common password.
// Applied wherever a password is set. A school that saved nothing keeps the rules
// every school had before, and every existing password keeps working.
import { beforeAll, describe, expect, it } from "vitest";
import { prisma, withSchool } from "@/lib/db";
import { signIn } from "@/lib/auth/sign-in";
import { acceptInvite, createInvite } from "@/lib/auth/invites";
import { checkNewPassword, hashPassword } from "@/lib/auth/password";
import { isCommonPassword } from "@/lib/auth/common-passwords";
import {
  DEFAULT_PASSWORD_RULES, keepOldPassword, newPasswordProblem, passwordExpired, passwordRulesForLogin, passwordRuleWords, readPasswordRules,
  savePasswordRules, strictest,
} from "@/lib/auth/password-rules";
import { makeSchool, makeUser, noSleep, PASSWORD } from "../helpers";

const DAY = 86_400_000;
const device = { userAgent: "Rules browser", ipAddress: "10.0.8.1" };
let school: Awaited<ReturnType<typeof makeSchool>>;
let second: Awaited<ReturnType<typeof makeSchool>>;
let admin: Awaited<ReturnType<typeof makeUser>>;
const ctx = () => ({ schoolId: school.id, userId: admin.id });
const save = (input: { minLength: number; history: number; expiryDays: number | null }, now?: Date) =>
  withSchool(ctx(), (tx) => savePasswordRules(tx, ctx(), input, now));

beforeAll(async () => {
  school = await makeSchool("Password Rules School");
  second = await makeSchool("Second Rules School");
  admin = await makeUser({ schools: [{ id: school.id, roleKeys: ["school-admin"] }], name: "Rules Admin" });
  for (const s of [school, second]) {
    await withSchool({ schoolId: s.id, userId: null }, (tx) => tx.schoolFeature.update({ where: { schoolId_featureKey: { schoolId: s.id, featureKey: "two-step-login" } }, data: { isOn: false } }));
  }
});

describe("every new password", () => {
  it("needs a letter and a number and may not be a common password, whatever the school chose", () => {
    for (const weak of ["Password@123", "P@ssw0rd1", "welcome1", "Qwerty123", "abcd1234", "a1234567", "aaaa1111", "India@2024", "School123", "Sairam123", "Cricket#99"]) {
      expect(isCommonPassword(weak), weak).toBe(true);
      expect(checkNewPassword(weak), weak).toMatch(/too common/);
    }
    for (const fine of [PASSWORD, "Kite-river-2026", "My-own-pass-9", "letters123", "Brand-new#Pass1"]) {
      expect(isCommonPassword(fine), fine).toBe(false);
      expect(checkNewPassword(fine), fine).toBeNull();
    }
    expect(checkNewPassword("onlyletters")).toMatch(/letter and one number/);
    expect(checkNewPassword("short1")).toMatch(/8 characters/);
  });
});

describe("a school that saved no password rules", () => {
  it("keeps the rules every school had before", async () => {
    expect(await withSchool({ schoolId: second.id, userId: null }, (tx) => readPasswordRules(tx, second.id))).toEqual({ ...DEFAULT_PASSWORD_RULES, saved: false });
    const user = await makeUser({ schools: [{ id: second.id, roleKeys: ["teacher"] }] });
    expect(await passwordRulesForLogin(user.id)).toEqual(DEFAULT_PASSWORD_RULES);
    expect(await newPasswordProblem(user.id, PASSWORD)).toBeNull();
    expect(passwordExpired(user, DEFAULT_PASSWORD_RULES, new Date(Date.now() + 5000 * DAY))).toBe(false);
  });
});

describe("a School Admin sets the password rules", () => {
  it("only within safe bounds, written in the audit log", async () => {
    await expect(save({ minLength: 6, history: 0, expiryDays: null })).rejects.toThrow(/8 to 32/);
    await expect(save({ minLength: 12, history: 50, expiryDays: null })).rejects.toThrow(/none to 10/);
    await expect(save({ minLength: 12, history: 3, expiryDays: 7 })).rejects.toThrow(/30 to 365/);
    await expect(withSchool(ctx(), (tx) => tx.passwordPolicy.create({ data: { schoolId: school.id, minLength: 4 } }))).rejects.toThrow();

    expect(await save({ minLength: 12, history: 3, expiryDays: null })).toBe(true);
    expect(await save({ minLength: 12, history: 3, expiryDays: null })).toBe(false);
    const audit = await withSchool(ctx(), (tx) => tx.auditLogEntry.findFirst({ where: { action: "changed-password-rules" }, orderBy: { at: "desc" } }));
    expect(audit?.before).toMatchObject({ minLength: 8, history: 0, expiryDays: null });
    expect(audit?.after).toMatchObject({ minLength: 12, history: 3, expiryDays: null });
    expect(passwordRuleWords(await passwordRulesForLogin(admin.id))).toBe("At least 12 characters, with a letter and a number; not a common password; not one of your last 3.");
  });

  it("an existing password shorter than the new rule keeps working", async () => {
    const user = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }] });
    await prisma.userLogin.update({ where: { id: user.id }, data: { passwordHash: await hashPassword("Short-77") } });
    expect((await signIn(user.username, "Short-77", device, { sleep: noSleep })).ok).toBe(true);
  });

  it("an invite link follows the shortest length", async () => {
    const user = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }], status: "INVITED" });
    const token = await createInvite(user.id);
    expect(await acceptInvite(token, "Kite-river1")).toEqual({ ok: false, message: "Use at least 12 characters." });
    expect(await acceptInvite(token, "Password@12345")).toEqual({ ok: false, message: expect.stringContaining("too common") });
    expect(await acceptInvite(token, "Kite-river-2026")).toMatchObject({ ok: true });
  });

  it("a new password may not repeat the last ones the school counts", async () => {
    const user = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }] });
    // Three changes: PASSWORD, then Kite-river-2026, then Blue-mango-7788 now.
    await keepOldPassword(user.id, (await prisma.userLogin.findUniqueOrThrow({ where: { id: user.id } })).passwordHash, new Date(Date.now() - 2 * DAY));
    await keepOldPassword(user.id, await hashPassword("Kite-river-2026"), new Date(Date.now() - DAY));
    await prisma.userLogin.update({ where: { id: user.id }, data: { passwordHash: await hashPassword("Blue-mango-7788") } });
    expect(await newPasswordProblem(user.id, "Blue-mango-7788")).toMatch(/last 3 passwords/);
    expect(await newPasswordProblem(user.id, "Kite-river-2026")).toMatch(/last 3 passwords/);
    expect(await newPasswordProblem(user.id, PASSWORD)).toMatch(/last 3 passwords/);
    expect(await newPasswordProblem(user.id, "Green-lotus-9911")).toBeNull();
    // Counting only the current one, older passwords may come back.
    await save({ minLength: 12, history: 1, expiryDays: null });
    expect(await newPasswordProblem(user.id, PASSWORD)).toBeNull();
    expect(await newPasswordProblem(user.id, "Blue-mango-7788")).toMatch(/different from the one you have now/);
    // Only the hash is kept.
    const rows = await prisma.passwordHistory.findMany({ where: { userLoginId: user.id } });
    expect(rows.every((r) => r.passwordHash.startsWith("$argon2id$"))).toBe(true);
  });

  it("an expired password is changed at sign-in, counted from the day expiry was switched on", async () => {
    const user = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }] });
    // The password was set long ago.
    await prisma.userLogin.update({ where: { id: user.id }, data: { passwordChangedAt: new Date(Date.now() - 400 * DAY) } });
    const on = new Date();
    await save({ minLength: 12, history: 1, expiryDays: 30 }, on);
    // Not caught at once: the 30 days start today.
    expect((await signIn(user.username, PASSWORD, device, { sleep: noSleep })).ok).toBe(true);
    const later = new Date(on.getTime() + 31 * DAY);
    const r = await signIn(user.username, PASSWORD, device, { sleep: noSleep, now: later });
    expect(r).toMatchObject({ ok: false, message: "Your password is older than 30 days. Choose a new one to finish signing in." });
    if (r.ok || !r.firstChange) throw new Error("expected a new password first");
    expect(await acceptInvite(r.firstChange, PASSWORD, later)).toEqual({ ok: false, message: "Choose a new password, not the one you have now." });
    expect(await acceptInvite(r.firstChange, "Green-lotus-9911", later)).toMatchObject({ ok: true });
    expect((await signIn(user.username, "Green-lotus-9911", device, { sleep: noSleep, now: later })).ok).toBe(true);
    // Changing the days keeps the start; switching it off clears it.
    await save({ minLength: 12, history: 1, expiryDays: 60 });
    expect((await withSchool(ctx(), (tx) => readPasswordRules(tx, school.id))).expirySince?.getTime()).toBe(on.getTime());
    await save({ minLength: 12, history: 1, expiryDays: null });
    expect((await withSchool(ctx(), (tx) => readPasswordRules(tx, school.id))).expirySince).toBeNull();
  });

  it("a person in two schools follows the strictest rules of both", async () => {
    await withSchool({ schoolId: second.id, userId: null }, (tx) => savePasswordRules(tx, { schoolId: second.id, userId: null }, { minLength: 16, history: 0, expiryDays: 90 }));
    const both = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }, { id: second.id, roleKeys: ["teacher"] }] });
    expect(await passwordRulesForLogin(both.id)).toMatchObject({ minLength: 16, history: 1, expiryDays: 90 });
    expect(strictest([{ minLength: 10, history: 5, expiryDays: 180, expirySince: null }, { minLength: 14, history: 0, expiryDays: null, expirySince: null }]))
      .toEqual({ minLength: 14, history: 5, expiryDays: 180, expirySince: null });
    expect(await newPasswordProblem(both.id, "Green-lotus-99")).toBe("Use at least 16 characters.");
  });
});
