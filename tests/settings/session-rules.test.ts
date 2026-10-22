// Session rules (Settings, Users & Permissions, "Password and session rules";
// 20-settings.md, gap list G45): a School Admin sets how long a computer and a
// phone stay signed in without use, and the longest one sign-in lasts, within
// safe bounds. The server applies them to every request; the sign-in page says
// "You were signed out because you were away". A school that saved nothing keeps
// what every school had before, and a remembered device stays remembered.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { prisma, withSchool } from "@/lib/db";
import { signIn } from "@/lib/auth/sign-in";
import { createSession, findSession, whySignedOut } from "@/lib/auth/sessions";
import { isRememberedDevice, rememberDevice } from "@/lib/auth/remembered";
import {
  DEFAULT_SESSION_RULES, forgetSessionRules, isPhone, readSessionRules, saveSessionRules, sessionRulesFor, timedOutWords,
} from "@/lib/auth/session-rules";
import { makeSchool, makeUser, noSleep, PASSWORD } from "../helpers";

const MIN = 60_000;
const computer = { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130", ipAddress: "10.0.9.1", deviceId: "rules-computer-aaaaaaaaaaaaaaaaaaaa" };
const phone = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148", ipAddress: "10.0.9.2" };

let school: Awaited<ReturnType<typeof makeSchool>>;
let other: Awaited<ReturnType<typeof makeSchool>>;
let admin: Awaited<ReturnType<typeof makeUser>>;
const ctx = () => ({ schoolId: school.id, userId: admin.id });

beforeAll(async () => {
  school = await makeSchool("Session Rules School");
  other = await makeSchool("Other Rules School");
  admin = await makeUser({ schools: [{ id: school.id, roleKeys: ["school-admin"] }], name: "Rules Admin" });
  for (const s of [school, other]) {
    await withSchool({ schoolId: s.id, userId: null }, (tx) => tx.schoolFeature.update({ where: { schoolId_featureKey: { schoolId: s.id, featureKey: "two-step-login" } }, data: { isOn: false } }));
  }
});
afterEach(() => forgetSessionRules());

async function signedIn(device: { userAgent: string; ipAddress: string }, now = new Date()) {
  const r = await signIn(admin.username, PASSWORD, device, { sleep: noSleep, now });
  if (!r.ok) throw new Error(r.message);
  return r.token;
}

describe("a school that saved no session rules", () => {
  it("keeps what every school had before: 7 days without use on any device, no longest sign-in", async () => {
    expect(await sessionRulesFor(other.id)).toEqual(DEFAULT_SESSION_RULES);
    const t0 = new Date();
    const { token } = await createSession(admin.id, other.id, computer, t0);
    expect(await findSession(token, new Date(t0.getTime() + 6 * 24 * 60 * MIN))).not.toBeNull();
    expect(await findSession(token, new Date(t0.getTime() + 6 * 24 * 60 * MIN + 7 * 24 * 60 * MIN + MIN))).toBeNull();
  });
});

describe("a School Admin sets the session rules", () => {
  it("only within safe bounds, written in the audit log", async () => {
    await expect(withSchool(ctx(), (tx) => saveSessionRules(tx, ctx(), { idleComputer: 1, idlePhone: 60, maxSession: null }))).rejects.toThrow(/5 minutes to 7 days/);
    await expect(withSchool(ctx(), (tx) => saveSessionRules(tx, ctx(), { idleComputer: 30, idlePhone: 30 * 24 * 60, maxSession: null }))).rejects.toThrow(/phone/);
    await expect(withSchool(ctx(), (tx) => saveSessionRules(tx, ctx(), { idleComputer: 30, idlePhone: 60, maxSession: 10 }))).rejects.toThrow(/1 hour to 90 days/);
    // The database refuses an out-of-bounds row too.
    await expect(withSchool(ctx(), (tx) => tx.passwordPolicy.create({ data: { schoolId: school.id, idleMinutesComputer: 1 } }))).rejects.toThrow();

    expect(await withSchool(ctx(), (tx) => saveSessionRules(tx, ctx(), { idleComputer: 30, idlePhone: 7 * 24 * 60, maxSession: null }))).toBe(true);
    expect(await withSchool(ctx(), (tx) => saveSessionRules(tx, ctx(), { idleComputer: 30, idlePhone: 7 * 24 * 60, maxSession: null }))).toBe(false);
    const audit = await withSchool(ctx(), (tx) => tx.auditLogEntry.findFirst({ where: { action: "changed-session-rules", recordType: "Password Policy" }, orderBy: { at: "desc" } }));
    expect(audit?.before).toMatchObject({ idleComputer: 7 * 24 * 60 });
    expect(audit?.after).toMatchObject({ idleComputer: 30, idlePhone: 7 * 24 * 60, maxSession: null });
    expect(await withSchool(ctx(), (tx) => readSessionRules(tx, school.id))).toMatchObject({ idleComputer: 30, saved: true });
  });

  it("a computer away for longer is signed out on the server, and the sign-in page says why", async () => {
    const t0 = new Date();
    const token = await signedIn(computer, t0);
    // Used after 20 minutes: still signed in, and the 30 minutes start again.
    expect(await findSession(token, new Date(t0.getTime() + 20 * MIN))).not.toBeNull();
    expect(await findSession(token, new Date(t0.getTime() + 45 * MIN))).not.toBeNull();
    // Then away for 31 minutes.
    const later = new Date(t0.getTime() + 76 * MIN);
    expect(await findSession(token, later)).toBeNull();
    const ended = await prisma.session.findFirstOrThrow({ where: { userLoginId: admin.id, revokedAt: { not: null } }, orderBy: { revokedAt: "desc" } });
    expect(ended.revokedReason).toMatch(/without use/);
    expect(await whySignedOut(token, later)).toEqual({ why: "away", minutes: 30 });
    // Once ended, it stays ended.
    expect(await findSession(token, new Date(t0.getTime() + 77 * MIN))).toBeNull();
    expect(timedOutWords("away", "30")).toBe("You were signed out because you were away for 30 minutes. Sign in again to carry on.");
  });

  it("a phone (or the installed app) follows the phone rule", async () => {
    expect(isPhone(phone.userAgent)).toBe(true);
    expect(isPhone(computer.userAgent)).toBe(false);
    const t0 = new Date();
    const token = await signedIn(phone, t0);
    expect(await findSession(token, new Date(t0.getTime() + 3 * 24 * 60 * MIN))).not.toBeNull();
  });

  it("the longest sign-in ends a session even while it is used", async () => {
    await withSchool(ctx(), (tx) => saveSessionRules(tx, ctx(), { idleComputer: 30, idlePhone: 7 * 24 * 60, maxSession: 60 }));
    const t0 = new Date();
    const token = await signedIn(computer, t0);
    for (const m of [20, 40, 55]) expect(await findSession(token, new Date(t0.getTime() + m * MIN))).not.toBeNull();
    const at = new Date(t0.getTime() + 61 * MIN);
    expect(await findSession(token, at)).toBeNull();
    expect(await whySignedOut(token, at)).toEqual({ why: "too-long", minutes: 60 });
    expect(timedOutWords("too-long", "60")).toMatch(/ends every sign-in after 1 hour/);
    await withSchool(ctx(), (tx) => saveSessionRules(tx, ctx(), { idleComputer: 30, idlePhone: 7 * 24 * 60, maxSession: null }));
  });

  it("a shorter rule applies at once to devices already signed in", async () => {
    const t0 = new Date();
    const token = await signedIn(computer, t0);
    await withSchool(ctx(), (tx) => saveSessionRules(tx, ctx(), { idleComputer: 10, idlePhone: 7 * 24 * 60, maxSession: null }));
    forgetSessionRules();
    expect(await findSession(token, new Date(t0.getTime() + 11 * MIN))).toBeNull();
    await withSchool(ctx(), (tx) => saveSessionRules(tx, ctx(), { idleComputer: 30, idlePhone: 7 * 24 * 60, maxSession: null }));
  });

  it("a person signed out for being away keeps their remembered device", async () => {
    const t0 = new Date();
    const token = await signedIn(computer, t0);
    const remembered = await rememberDevice(admin.id, computer, t0);
    expect(await findSession(token, new Date(t0.getTime() + 40 * MIN))).toBeNull();
    expect(await isRememberedDevice(admin.id, remembered, new Date(t0.getTime() + 41 * MIN))).toBe(true);
  });

  it("a sign-out by the person is not called a time-out", async () => {
    const token = await signedIn(computer);
    await prisma.session.updateMany({ where: { userLoginId: admin.id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: "Signed out" } });
    expect(await whySignedOut(token)).toBeNull();
    expect(await whySignedOut("no-such-token")).toBeNull();
  });
});

describe("each school's session rules stay its own", () => {
  it("a school cannot read or write another school's rules", async () => {
    await withSchool({ schoolId: other.id, userId: null }, async (tx) => {
      expect(await tx.passwordPolicy.findUnique({ where: { schoolId: school.id } })).toBeNull();
      await expect(tx.passwordPolicy.create({ data: { schoolId: school.id, idleMinutesComputer: 60 } })).rejects.toThrow();
    });
  });
});
