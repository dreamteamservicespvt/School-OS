// Signing in with a username, an email or a mobile number (design: "Mobile number or email").
import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { CANNOT_SEND, findLogin, signIn, startCodeSignIn } from "@/lib/auth/sign-in";
import { makeSchool, makeUser, noSleep, PASSWORD } from "./helpers";

const device = { userAgent: "Test browser", ipAddress: "10.0.0.9" };
let user: Awaited<ReturnType<typeof makeUser>>;
let schoolId: string;
const tag = randomUUID().slice(0, 8);
const phone = `9${String(Date.now()).slice(-9)}`;
const WRONG = "The login or password is wrong. Check both and try again.";

beforeAll(async () => {
  const school = await makeSchool();
  schoolId = school.id;
  user = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }], name: "Mobile Teacher" });
  await prisma.userLogin.update({ where: { id: user.id }, data: { email: `t.${tag}@school.in`, phone: `+91 ${phone.slice(0, 5)} ${phone.slice(5)}` } });
});

describe("the login a person types", () => {
  it("finds the login by email, any case", async () => {
    expect((await findLogin(`T.${tag}@School.in`))?.id).toBe(user.id);
  });

  it("finds the login by mobile number, with or without spaces and +91", async () => {
    expect((await findLogin(phone))?.id).toBe(user.id);
    expect((await findLogin(`+91 ${phone}`))?.id).toBe(user.id);
    expect((await findLogin(` 0${phone} `))?.id).toBe(user.id);
  });

  it("signs in with the mobile number and the right password", async () => {
    const result = await signIn(phone, PASSWORD, device, { sleep: noSleep });
    expect(result.ok).toBe(true);
  });
});

describe("a mobile number or email on several logins (test staff share phones)", () => {
  it("lets the password pick the login, and never says the number is shared", async () => {
    const twin = await makeUser({ schools: [{ id: schoolId, roleKeys: ["teacher"] }], name: "Twin" });
    const other = "Other-password-77";
    await prisma.userLogin.update({ where: { id: twin.id }, data: { email: `t.${tag}@school.in`, phone: `${phone}`, passwordHash: await hashPassword(other) } });
    try {
      // findLogin (codes) still never picks one of two.
      expect(await findLogin(`t.${tag}@school.in`)).toBeNull();
      // Each person's own password signs in their own login, by email or by mobile.
      const mine = await signIn(`t.${tag}@school.in`, PASSWORD, device, { sleep: noSleep });
      expect(mine.ok && mine.userLoginId).toBe(user.id);
      const theirs = await signIn(`+91 ${phone}`, other, device, { sleep: noSleep });
      expect(theirs.ok && theirs.userLoginId).toBe(twin.id);
      // A wrong password gets the same words as for any login, nothing about sharing.
      const wrong = await signIn(phone, "Nobody-has-this-9", device, { sleep: noSleep });
      expect(wrong).toEqual({ ok: false, message: WRONG });
      // Both logins with the same password: it cannot tell, so the same wrong words (the username works).
      await prisma.userLogin.update({ where: { id: twin.id }, data: { passwordHash: await hashPassword(PASSWORD) } });
      expect(await signIn(phone, PASSWORD, device, { sleep: noSleep })).toEqual({ ok: false, message: WRONG });
      expect((await signIn(twin.username, PASSWORD, device, { sleep: noSleep })).ok).toBe(true);
      // A code cannot be sent to a shared number either; the words point to the username.
      expect(await startCodeSignIn(phone, device)).toEqual({ ok: false, message: CANNOT_SEND });
      expect(CANNOT_SEND).toMatch(/type your username/);
    } finally {
      await prisma.userLogin.update({ where: { id: twin.id }, data: { email: null, phone: null } });
    }
  });

  it("an archived login keeping a username does not hide the live login with that mobile", async () => {
    const mobile = `8${String(Date.now()).slice(-9)}`;
    const old = await makeUser({ schools: [], name: "Old invite" });
    await prisma.userLogin.update({ where: { id: old.id }, data: { username: mobile, archivedAt: new Date() } });
    const live = await makeUser({ schools: [{ id: schoolId, roleKeys: ["teacher"] }], name: "Live login" });
    await prisma.userLogin.update({ where: { id: live.id }, data: { phone: `+91 ${mobile}` } });
    const r = await signIn(mobile, PASSWORD, device, { sleep: noSleep });
    expect(r.ok && r.userLoginId).toBe(live.id);
  });
});

describe("a locked login cannot be guessed through a shared mobile number (security review 2026-11-05)", () => {
  it("answers the plain wrong words, even with that login's right password, while it is locked", async () => {
    const shared = `7${String(Date.now()).slice(-9)}`;
    const locked = await makeUser({ schools: [{ id: schoolId, roleKeys: ["teacher"] }], name: "Locked twin" });
    const other = await makeUser({ schools: [{ id: schoolId, roleKeys: ["teacher"] }], name: "Open twin" });
    await prisma.userLogin.update({ where: { id: locked.id }, data: { phone: shared, lockedUntil: new Date(Date.now() + 15 * 60_000) } });
    await prisma.userLogin.update({ where: { id: other.id }, data: { phone: shared, passwordHash: await hashPassword("Another-pass-123") } });
    expect(await signIn(shared, PASSWORD, device, { sleep: noSleep })).toEqual({ ok: false, message: WRONG });
    // The unlocked twin still signs in with their own password.
    const r = await signIn(shared, "Another-pass-123", device, { sleep: noSleep });
    expect(r.ok && r.userLoginId).toBe(other.id);
  });
});
