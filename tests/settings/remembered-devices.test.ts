// Remembered devices (decided by the owner, 22 October 2026; 08-platform-security.md §2,
// 00-global.md §1.4): after the password and the right two-step code, the device is
// remembered with no tick, and signing in there again with the password does not ask
// for a code, even after the session ended from being idle. Signing out there forgets
// it; so do Sign out everywhere, a password change, a switched-off login and a two-step
// reset. "Shared computer: ask for the code every time" keeps a device from being
// remembered. A code typed instead of the password never makes a remembered device.
// A device not used for 180 days asks for the code again.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const jar = new Map<string, string>();
  return {
    jar,
    who: { current: null as unknown },
    device: { userAgent: "Remembered browser", ipAddress: "10.0.7.1", deviceId: "device-one-aaaaaaaaaaaaaaaaaaaaaa" },
    cookies: {
      get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined),
      set: (n: string, v: string) => void jar.set(n, v),
      delete: (n: string | { name: string }) => void jar.delete(typeof n === "string" ? n : n.name),
    },
  };
});
vi.mock("next/headers", () => ({ cookies: async () => h.cookies, headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw Object.assign(new Error(`redirect to ${to}`), { to }); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/current", () => ({
  requireCurrent: async () => h.who.current,
  deviceInfo: async () => ({ ipAddress: h.device.ipAddress, userAgent: h.device.userAgent }),
  signInDevice: async () => ({ ...h.device }),
  clearSessionCookie: async () => void h.jar.delete("session"),
  setSessionCookie: async (token: string) => void h.jar.set("session", token),
  setAppearanceCookies: async () => {},
}));

import { prisma, withSchool } from "@/lib/db";
import { afterRightCode, signIn, startCodeSignIn } from "@/lib/auth/sign-in";
import { findSession, revokeAllSessions } from "@/lib/auth/sessions";
import { deviceKeyOf } from "@/lib/auth/tokens";
import { verifyChallenge } from "@/lib/auth/two-step";
import { isRememberedDevice, rememberDevice, rememberedDevices, REMEMBER_DAYS, REMEMBERED_COOKIE } from "@/lib/auth/remembered";
import { disableUser } from "@/lib/settings/users";
import { makeSchool, makeUser, noSleep, PASSWORD } from "../helpers";

const { signInAction, verifyCodeAction, codeSignInAction } = await import("@/app/sign-in/actions");
const { signOut, signOutEverywhere, signOutDevice } = await import("@/app/(school)/actions");

const DAY = 86_400_000;
let school: Awaited<ReturnType<typeof makeSchool>>;
let admin: { id: string };

/** Every code the server writes to its log in development, newest last. */
const codes: string[] = [];
vi.spyOn(console, "info").mockImplementation((line: unknown) => {
  const m = String(line).match(/one-time code .*: (\d{6})$/);
  if (m) codes.push(m[1]);
});

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

/** Runs a server action and says where it sent the person, or what it answered. */
async function run(p: Promise<unknown>): Promise<{ to?: string; result?: unknown }> {
  try {
    return { result: await p };
  } catch (e) {
    const to = (e as { to?: string }).to;
    if (to) return { to };
    throw e;
  }
}

const passwordStep = (username: string, extra: Record<string, string> = { remember: "on" }) => run(signInAction(null, form({ username, password: PASSWORD, ...extra })));
const codeStep = (extra: Record<string, string> = {}) => run(verifyCodeAction(null, form({ code: codes.at(-1)!, ...extra })));

/** A browser with its own device id and no cookies yet. */
function newBrowser(name: string, ip: string) {
  h.jar.clear();
  h.device.deviceId = `device-${name}-${"a".repeat(24)}`;
  h.device.userAgent = `Browser ${name}`;
  h.device.ipAddress = ip;
}

/** Signs this browser in fully (password, then the code) and makes it the current person. */
async function signInHere(user: { id: string; username: string }, extra: Record<string, string> = {}) {
  expect((await passwordStep(user.username)).to).toBe("/sign-in/code");
  expect((await codeStep(extra)).to).toBe("/dashboard");
  await setCurrent(user.id);
}

async function setCurrent(userId: string) {
  const session = await findSession(h.jar.get("session"));
  h.who.current = { user: { id: userId }, session, ctx: { schoolId: school.id, userId } };
}

async function newPrincipal(email: string) {
  const user = await makeUser({ schools: [{ id: school.id, roleKeys: ["principal"] }], name: "Remembered Principal" });
  await prisma.userLogin.update({ where: { id: user.id }, data: { email } });
  return user;
}

beforeAll(async () => {
  school = await makeSchool("Remembered Devices School");
  admin = await makeUser({ schools: [{ id: school.id, roleKeys: ["school-admin"] }], name: "Remembered Admin" });
});

beforeEach(() => {
  h.who.current = null;
});

describe("a device is remembered after the code", () => {
  it("the first sign-in asks for the code; then the device is remembered with no tick, and the next sign-in there does not ask, even after the session ended from being idle", async () => {
    const principal = await newPrincipal("remember.one@example.com");
    newBrowser("one", "10.0.7.1");
    await signInHere(principal);
    const token = h.jar.get(REMEMBERED_COOKIE);
    expect(token).toBeTruthy();
    const rows = await prisma.trustedDevice.findMany({ where: { userLoginId: principal.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ deviceKey: deviceKeyOf(h.device.deviceId), revokedAt: null });

    // The session ends after a week without use; the device is still remembered.
    await prisma.session.updateMany({ where: { userLoginId: principal.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    h.jar.delete("session");
    const sent = codes.length;
    expect((await passwordStep(principal.username)).to).toBe("/dashboard");
    expect(codes.length).toBe(sent);
    expect(await findSession(h.jar.get("session"))).not.toBeNull();
    expect(h.jar.get(REMEMBERED_COOKIE)).toBe(token);
    // Each use moves the 180 days on.
    const after = await prisma.trustedDevice.findUniqueOrThrow({ where: { id: rows[0].id } });
    expect(after.expiresAt.getTime()).toBeGreaterThan(Date.now() + (REMEMBER_DAYS - 1) * DAY);

    // Another browser is new: the code is asked there.
    newBrowser("two", "10.0.7.2");
    expect((await passwordStep(principal.username)).to).toBe("/sign-in/code");
  });

  it("signing out there forgets it: the next sign-in on that device asks for the code again", async () => {
    const principal = await newPrincipal("remember.two@example.com");
    newBrowser("three", "10.0.7.3");
    await signInHere(principal);
    const token = h.jar.get(REMEMBERED_COOKIE)!;
    expect((await run(signOut())).to).toBe("/sign-in");
    expect(h.jar.get(REMEMBERED_COOKIE)).toBeUndefined();
    expect(await isRememberedDevice(principal.id, token)).toBe(false);
    expect((await passwordStep(principal.username)).to).toBe("/sign-in/code");
    // Even with the old cookie put back, it is forgotten.
    h.jar.set(REMEMBERED_COOKIE, token);
    expect((await passwordStep(principal.username)).to).toBe("/sign-in/code");
  });

  it("\"Shared computer: ask for the code every time\" keeps the device from being remembered", async () => {
    const principal = await newPrincipal("remember.shared@example.com");
    newBrowser("shared", "10.0.7.4");
    await signInHere(principal, { shared: "on" });
    expect(h.jar.get(REMEMBERED_COOKIE)).toBeUndefined();
    expect(await prisma.trustedDevice.count({ where: { userLoginId: principal.id, revokedAt: null } })).toBe(0);
    h.jar.delete("session");
    expect((await passwordStep(principal.username)).to).toBe("/sign-in/code");
  });

  it("a code typed instead of the password (a forgotten password) never makes a remembered device", async () => {
    const teacher = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }] });
    await prisma.userLogin.update({ where: { id: teacher.id }, data: { email: "remember.code@example.com" } });
    newBrowser("code", "10.0.7.5");
    expect((await run(codeSignInAction(null, form({ username: teacher.username, remember: "on" })))).to).toBe("/sign-in/code");
    expect((await codeStep()).to).toBe("/profile?newPassword=1#password");
    expect(h.jar.get(REMEMBERED_COOKIE)).toBeUndefined();
    expect(await prisma.trustedDevice.count({ where: { userLoginId: teacher.id } })).toBe(0);

    // The same rule in the sign-in library: one code instead of the password may not remember.
    const started = await startCodeSignIn(teacher.username, h.device);
    if (!started.ok) throw new Error(started.message);
    const v = await verifyChallenge(started.token, codes.at(-1)!, h.device);
    if (!v.ok) throw new Error(v.message);
    expect(await afterRightCode(v, h.device)).toMatchObject({ kind: "signed-in", mayRemember: false });
  });
});

describe("remembered devices are forgotten", () => {
  it("by Sign out everywhere, on every device", async () => {
    const principal = await newPrincipal("remember.everywhere@example.com");
    const other = await rememberDevice(principal.id, { userAgent: "Phone", deviceId: "device-phone-aaaaaaaaaaaaaaaaaaaaaa" });
    newBrowser("everywhere", "10.0.7.6");
    await signInHere(principal);
    const here = h.jar.get(REMEMBERED_COOKIE)!;
    expect((await run(signOutEverywhere())).to).toBe("/sign-in?signedOut=everywhere");
    expect(h.jar.get(REMEMBERED_COOKIE)).toBeUndefined();
    expect(await isRememberedDevice(principal.id, here)).toBe(false);
    expect(await isRememberedDevice(principal.id, other)).toBe(false);
  });

  it("by a password change or Sign out everywhere else, except the device the person is using", async () => {
    const principal = await newPrincipal("remember.password@example.com");
    const here = await rememberDevice(principal.id, { userAgent: "Here", deviceId: "device-here-aaaaaaaaaaaaaaaaaaaaaaa" });
    const other = await rememberDevice(principal.id, { userAgent: "Other", deviceId: "device-other-aaaaaaaaaaaaaaaaaaaaaa" });
    const r = await signIn(principal.username, PASSWORD, h.device, { sleep: noSleep, trustedDevice: here });
    if (!r.ok) throw new Error(r.message);
    expect(r.remembered).toBe(true);
    const session = await findSession(r.token);
    await revokeAllSessions(principal.id, "Password changed", session!.id, { keepRememberedToken: here });
    expect(await isRememberedDevice(principal.id, here)).toBe(true);
    expect(await isRememberedDevice(principal.id, other)).toBe(false);
  });

  it("by signing that device out from My profile", async () => {
    const principal = await newPrincipal("remember.profile@example.com");
    newBrowser("lost-phone", "10.0.7.7");
    await signInHere(principal);
    const phoneToken = h.jar.get(REMEMBERED_COOKIE)!;
    const phoneSession = await findSession(h.jar.get("session"));
    newBrowser("office", "10.0.7.8");
    await signInHere(principal);
    const officeToken = h.jar.get(REMEMBERED_COOKIE)!;
    expect((await rememberedDevices(principal.id)).length).toBe(2);
    await signOutDevice(form({ sessionId: phoneSession!.id }));
    expect(await isRememberedDevice(principal.id, phoneToken)).toBe(false);
    expect(await isRememberedDevice(principal.id, officeToken)).toBe(true);
    expect((await rememberedDevices(principal.id)).map((d) => d.userAgent)).toEqual(["Browser office"]);
  });

  it("when the login is switched off", async () => {
    const accountant = await makeUser({ schools: [{ id: school.id, roleKeys: ["accountant"] }] });
    const token = await rememberDevice(accountant.id, h.device);
    await withSchool({ schoolId: school.id, userId: admin.id }, (tx) => disableUser(tx, { schoolId: school.id, userId: admin.id }, accountant.id, [school.id]));
    expect(await isRememberedDevice(accountant.id, token)).toBe(false);
  });

  it("when two-step login is reset by an admin", async () => {
    const principal = await newPrincipal("remember.reset@example.com");
    const token = await rememberDevice(principal.id, h.device, new Date(Date.now() - 1000));
    await prisma.userLogin.update({ where: { id: principal.id }, data: { twoStepResetAt: new Date() } });
    expect(await isRememberedDevice(principal.id, token)).toBe(false);
    expect(await rememberedDevices(principal.id)).toEqual([]);
  });

  it(`after ${REMEMBER_DAYS} days without use; each use moves the ${REMEMBER_DAYS} days on`, async () => {
    const principal = await newPrincipal("remember.cap@example.com");
    const now = Date.now();
    const unused = await rememberDevice(principal.id, h.device, new Date(now));
    expect(await isRememberedDevice(principal.id, unused, new Date(now + (REMEMBER_DAYS + 1) * DAY))).toBe(false);
    const r = await signIn(principal.username, PASSWORD, h.device, { sleep: noSleep, trustedDevice: unused, now: new Date(now + (REMEMBER_DAYS + 1) * DAY) });
    expect(!r.ok && r.twoStep).toBeTruthy();

    const used = await rememberDevice(principal.id, h.device, new Date(now));
    expect(await isRememberedDevice(principal.id, used, new Date(now + (REMEMBER_DAYS - 10) * DAY))).toBe(true);
    expect(await isRememberedDevice(principal.id, used, new Date(now + (2 * REMEMBER_DAYS - 20) * DAY))).toBe(true);
    expect(await isRememberedDevice(principal.id, used, new Date(now + (3 * REMEMBER_DAYS) * DAY))).toBe(false);
  });
});
