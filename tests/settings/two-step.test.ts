// Two-step login (08-platform-security.md §2): a 6-digit code, kept only as a
// hash, valid 10 minutes and 5 tries, with a trusted-device option.
import { beforeAll, describe, expect, it } from "vitest";
import { prisma, withSchool } from "@/lib/db";
import { signIn, completeSignIn } from "@/lib/auth/sign-in";
import { findSession } from "@/lib/auth/sessions";
import { CODE_TTL_MS, deliverCode, isTrustedDevice, MAX_CODE_TRIES, maskEmail, needsTwoStep, startChallenge, trustDevice, TWO_STEP_FEATURE, verifyChallenge } from "@/lib/auth/two-step";
import { makeSchool, makeUser, noSleep, PASSWORD } from "../helpers";

const device = { userAgent: "Two-step browser", ipAddress: "10.0.0.9" };
let school: Awaited<ReturnType<typeof makeSchool>>;
let principal: { id: string; username: string };
let teacher: { id: string; username: string };

/** Catches the code instead of sending it. */
function catcher() {
  const sent: string[] = [];
  return { sent, deliver: async (_to: unknown, code: string) => { sent.push(code); return { channel: "email", sentTo: "pr•••@example.com" }; } };
}

const wrongOf = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, "0");

beforeAll(async () => {
  school = await makeSchool("Two-step School");
  principal = await makeUser({ schools: [{ id: school.id, roleKeys: ["principal"] }], name: "Two-step Principal" });
  teacher = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }], name: "Two-step Teacher" });
  await prisma.userLogin.update({ where: { id: principal.id }, data: { email: "principal@example.com" } });
});

async function switchTwoStep(on: boolean) {
  await withSchool({ schoolId: school.id, userId: null }, (tx) =>
    tx.schoolFeature.upsert({ where: { schoolId_featureKey: { schoolId: school.id, featureKey: TWO_STEP_FEATURE } }, create: { schoolId: school.id, featureKey: TWO_STEP_FEATURE, isOn: on }, update: { isOn: on } }),
  );
}

describe("who needs two-step login", () => {
  it("only roles that need it, and only when the school has switched it on", async () => {
    await switchTwoStep(false);
    expect(await needsTwoStep(principal.id, school.id)).toBe(false);
    expect((await signIn(principal.username, PASSWORD, device, { sleep: noSleep })).ok).toBe(true);
    await switchTwoStep(true);
    expect(await needsTwoStep(principal.id, school.id)).toBe(true);
    expect(await needsTwoStep(teacher.id, school.id)).toBe(false);
    expect((await signIn(teacher.username, PASSWORD, device, { sleep: noSleep })).ok).toBe(true);

    const r = await signIn(principal.username, PASSWORD, device, { sleep: noSleep });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.twoStep).toEqual({ userLoginId: principal.id, schoolId: school.id });
  });
});

describe("one-time codes", () => {
  it("are stored only as a hash, and the right code signs in once", async () => {
    const c = catcher();
    const started = await startChallenge(principal.id, school.id, device, { deliver: c.deliver });
    if (!started.ok) throw new Error(started.message);
    const code = c.sent[0];
    expect(code).toMatch(/^\d{6}$/);
    const row = await prisma.twoStepChallenge.findFirstOrThrow({ where: { userLoginId: principal.id, usedAt: null } });
    expect(row.codeHash).not.toContain(code);
    expect(row.tokenHash).not.toBe(started.token);

    const ok = await verifyChallenge(started.token, ` ${code.slice(0, 3)} ${code.slice(3)} `, device);
    expect(ok).toEqual({ ok: true, userLoginId: principal.id, schoolId: school.id });
    expect(await verifyChallenge(started.token, code, device)).toMatchObject({ ok: false, restart: true });

    const { token } = await completeSignIn(principal.id, school.id, device);
    expect((await findSession(token))?.userLoginId).toBe(principal.id);
    const audit = await withSchool({ schoolId: school.id, userId: null }, (tx) => tx.auditLogEntry.findMany({ where: { recordId: principal.id, action: { in: ["two-step-code-sent", "two-step-passed"] } } }));
    expect(audit.map((a) => a.action).sort()).toEqual(["two-step-code-sent", "two-step-passed"]);
  });

  it("stop working after 10 minutes", async () => {
    const c = catcher();
    const started = await startChallenge(principal.id, school.id, device, { deliver: c.deliver });
    if (!started.ok) throw new Error(started.message);
    const later = new Date(Date.now() + CODE_TTL_MS + 1000);
    expect(await verifyChallenge(started.token, c.sent[0], device, later)).toEqual({ ok: false, message: expect.stringMatching(/expired after 10 minutes/), restart: true });
  });

  it("stop working after 5 wrong tries, even if the right code comes next", async () => {
    const c = catcher();
    const started = await startChallenge(principal.id, school.id, device, { deliver: c.deliver });
    if (!started.ok) throw new Error(started.message);
    const wrong = wrongOf(c.sent[0]);
    for (let i = 1; i < MAX_CODE_TRIES; i++) {
      expect(await verifyChallenge(started.token, wrong, device)).toEqual({ ok: false, message: expect.stringContaining(`${MAX_CODE_TRIES - i} more`) });
    }
    expect(await verifyChallenge(started.token, wrong, device)).toMatchObject({ ok: false, restart: true, message: expect.stringMatching(/Too many wrong codes/) });
    expect(await verifyChallenge(started.token, c.sent[0], device)).toMatchObject({ ok: false, restart: true });
    const locked = await withSchool({ schoolId: school.id, userId: null }, (tx) => tx.auditLogEntry.count({ where: { recordId: principal.id, action: "two-step-locked" } }));
    expect(locked).toBe(1);
  });

  it("a new code ends the earlier one", async () => {
    const c = catcher();
    const first = await startChallenge(principal.id, school.id, device, { deliver: c.deliver });
    const second = await startChallenge(principal.id, school.id, device, { deliver: c.deliver });
    if (!first.ok || !second.ok) throw new Error("not sent");
    expect(await verifyChallenge(first.token, c.sent[0], device)).toMatchObject({ ok: false, restart: true });
    expect(await verifyChallenge(second.token, c.sent[1], device)).toMatchObject({ ok: true });
  });

  it("are not sent too often to one person", async () => {
    const user = await makeUser({ schools: [{ id: school.id, roleKeys: ["accountant"] }] });
    const c = catcher();
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await startChallenge(user.id, school.id, device, { deliver: c.deliver }));
    expect(results.slice(0, 5).every((r) => r.ok)).toBe(true);
    expect(results[5]).toEqual({ ok: false, message: expect.stringMatching(/Too many tries/) });
  });

  it("in development with no email set up, go to the server log; a login with no way to reach it is told plainly", async () => {
    expect(await deliverCode({ email: "x@example.com", phone: null, name: "X" }, "123456")).toMatchObject({ channel: "log" });
    expect(maskEmail("principal@example.com")).toBe("pr•••@example.com");
  });
});

describe("trusted devices", () => {
  it("skip the code for 30 days, until two-step login is reset", async () => {
    const token = await trustDevice(principal.id, device);
    expect(await isTrustedDevice(principal.id, token)).toBe(true);
    expect(await isTrustedDevice(teacher.id, token)).toBe(false);
    expect(await isTrustedDevice(principal.id, token, new Date(Date.now() + 31 * 86_400_000))).toBe(false);
    expect((await signIn(principal.username, PASSWORD, device, { sleep: noSleep, trustedDevice: token })).ok).toBe(true);

    await prisma.userLogin.update({ where: { id: principal.id }, data: { twoStepResetAt: new Date() } });
    expect(await isTrustedDevice(principal.id, token)).toBe(false);
    const r = await signIn(principal.username, PASSWORD, device, { sleep: noSleep, trustedDevice: token });
    expect(!r.ok && r.twoStep).toBeTruthy();
  });
});

describe("sign-in history", () => {
  it("records wrong passwords and sign-ins from a new device", async () => {
    await switchTwoStep(false);
    await signIn(teacher.username, "Wrong-password-1", device, { sleep: noSleep });
    await signIn(teacher.username, PASSWORD, { userAgent: "Brand new phone", ipAddress: "10.0.0.10" }, { sleep: noSleep });
    const rows = await withSchool({ schoolId: school.id, userId: null }, (tx) => tx.auditLogEntry.findMany({ where: { recordId: teacher.id }, orderBy: { at: "asc" } }));
    expect(rows.map((r) => r.action)).toContain("sign-in-failed");
    expect(rows.at(-1)?.action).toBe("signed-in-new-device");
  });
});
