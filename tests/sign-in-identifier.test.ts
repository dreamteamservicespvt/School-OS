// Signing in with a username, an email or a mobile number (design: "Mobile number or email").
import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { findLogin, signIn } from "@/lib/auth/sign-in";
import { makeSchool, makeUser, noSleep, PASSWORD } from "./helpers";

const device = { userAgent: "Test browser", ipAddress: "10.0.0.9" };
let user: Awaited<ReturnType<typeof makeUser>>;
const tag = randomUUID().slice(0, 8);
const phone = `9${String(Date.now()).slice(-9)}`;

beforeAll(async () => {
  const school = await makeSchool();
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
  });

  it("never picks one of two logins that share an email", async () => {
    const twin = await makeUser({ schools: [], name: "Twin" });
    await prisma.userLogin.update({ where: { id: twin.id }, data: { email: `t.${tag}@school.in` } });
    expect(await findLogin(`t.${tag}@school.in`)).toBeNull();
    await prisma.userLogin.update({ where: { id: twin.id }, data: { email: null } });
  });

  it("signs in with the mobile number and the right password", async () => {
    const result = await signIn(phone, PASSWORD, device, { sleep: noSleep });
    expect(result.ok).toBe(true);
  });
});
