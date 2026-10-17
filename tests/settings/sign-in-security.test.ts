// Sign-in security defaults (gap list G03; 08-platform-security.md §2, 00-global.md §4 and §5):
// - two-step login is on for every new school, and the update switches it on for schools
//   that already exist without locking anyone out;
// - a one-time code alone never replaces both the password and the second step for a role
//   that needs two-step login;
// - a sign-in from a new device, and a changed password, are told to the person;
// - after a code sign-in ("Forgot password?") a new password can be set without the old one.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const who = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/current", () => ({
  requireCurrent: async () => who.current,
  deviceInfo: async () => ({ ipAddress: "10.0.0.21", userAgent: "vitest" }),
  clearSessionCookie: async () => {},
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { prisma, withSchool } from "@/lib/db";
import { afterRightCode, CODE_ALONE_WORDS, completeSignIn, signIn, startCodeSignIn, startSecondStep } from "@/lib/auth/sign-in";
import { createSession, findSession, mayResetWithoutOld, NEW_PASSWORD_AFTER_CODE_MS } from "@/lib/auth/sessions";
import { roleNeedsTwoStep, TWO_STEP_FEATURE, verifyChallenge, type Deliver } from "@/lib/auth/two-step";
import { verifyPassword } from "@/lib/auth/password";
import { NEW_SCHOOL_TWO_STEP_FEATURE } from "@/lib/schools";
import { chosenCopyChannels } from "@/lib/notification-channels";
import { makeSchool, makeUser, noSleep, PASSWORD } from "../helpers";

const { changePassword } = await import("@/app/(school)/actions");

const device = { userAgent: "Security browser", ipAddress: "10.0.0.20" };
const as = (schoolId: string) => ({ schoolId, userId: null });

/** Catches each code and where it was sent, instead of sending it. */
function catcher() {
  const sent: { code: string; email: string | null; phone: string | null }[] = [];
  const deliver: Deliver = async (to, code) => {
    sent.push({ code, email: to.email, phone: to.phone });
    return to.email ? { channel: "email", sentTo: "pr•••@example.com" } : { channel: "sms", sentTo: "•••••4321" };
  };
  return { sent, deliver };
}

const audits = (schoolId: string, userLoginId: string, action: string) =>
  withSchool(as(schoolId), (tx) => tx.auditLogEntry.findMany({ where: { recordId: userLoginId, action } }));
const securityNotes = (schoolId: string, userLoginId: string) =>
  withSchool(as(schoolId), (tx) => tx.notification.findMany({ where: { userLoginId, type: "security" }, orderBy: { createdAt: "asc" } }));

let school: Awaited<ReturnType<typeof makeSchool>>;

beforeAll(async () => {
  school = await makeSchool("Safe Sign-in School");
});

describe("two-step login is on from the first day", () => {
  it("for a new school: School Admin, Principal and Accountant need a code; a Teacher does not", async () => {
    expect(NEW_SCHOOL_TWO_STEP_FEATURE).toBe(TWO_STEP_FEATURE);
    const feature = await withSchool(as(school.id), (tx) => tx.schoolFeature.findUnique({ where: { schoolId_featureKey: { schoolId: school.id, featureKey: TWO_STEP_FEATURE } } }));
    expect(feature?.isOn).toBe(true);
    for (const roleKey of ["school-admin", "principal", "accountant"]) {
      const u = await makeUser({ schools: [{ id: school.id, roleKeys: [roleKey] }] });
      expect(await roleNeedsTwoStep(u.id, school.id)).toBe(true);
      const r = await signIn(u.username, PASSWORD, device, { sleep: noSleep });
      expect(!r.ok && r.twoStep).toEqual({ userLoginId: u.id, schoolId: school.id });
    }
    const teacher = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }] });
    expect(await roleNeedsTwoStep(teacher.id, school.id)).toBe(false);
    expect((await signIn(teacher.username, PASSWORD, device, { sleep: noSleep })).ok).toBe(true);
  });
});

/** The data part of the update that switched two-step login on, run again as the database owner. */
async function runUpdate() {
  const dir = path.resolve("prisma/schema/migrations");
  const name = readdirSync(dir).find((d) => d.endsWith("_two_step_on_by_default"));
  if (!name) throw new Error("migration not found");
  const sql = readFileSync(path.join(dir, name, "migration.sql"), "utf8");
  const from = sql.indexOf('ALTER TABLE "school" NO FORCE ROW LEVEL SECURITY;');
  const statements = sql.slice(from).split(/;\s*\r?\n/).map((s) => s.trim()).filter((s) => s.replace(/^--.*$/gm, "").trim());
  const owner = new PrismaClient({ datasourceUrl: process.env.MIGRATION_DATABASE_URL });
  try {
    await owner.$transaction(async (tx) => { for (const s of statements) await tx.$executeRawUnsafe(s); });
  } finally {
    await owner.$disconnect();
  }
}

describe("schools that already exist", () => {
  let older: Awaited<ReturnType<typeof makeSchool>>;
  let admin: Awaited<ReturnType<typeof makeUser>>;

  beforeAll(async () => {
    older = await makeSchool("School From Before");
    admin = await makeUser({ schools: [{ id: older.id, roleKeys: ["school-admin"] }], name: "Older School Admin" });
    // As a school made before this change: no two-step row at all.
    const owner = new PrismaClient({ datasourceUrl: process.env.MIGRATION_DATABASE_URL });
    try {
      await owner.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.school_id', ${older.id}, true)`;
        await tx.$executeRaw`DELETE FROM school_feature WHERE school_id = ${older.id}::uuid AND feature_key = 'two-step-login'`;
      });
    } finally {
      await owner.$disconnect();
    }
  });

  it("get it switched on by the update, are told, and a school that switched it off keeps it off", async () => {
    const chose = await makeSchool("School That Chose Off");
    await withSchool(as(chose.id), (tx) => tx.schoolFeature.update({ where: { schoolId_featureKey: { schoolId: chose.id, featureKey: TWO_STEP_FEATURE } }, data: { isOn: false } }));
    expect(await roleNeedsTwoStep(admin.id, older.id)).toBe(false);

    await runUpdate();

    expect(await roleNeedsTwoStep(admin.id, older.id)).toBe(true);
    const off = await withSchool(as(chose.id), (tx) => tx.schoolFeature.findUnique({ where: { schoolId_featureKey: { schoolId: chose.id, featureKey: TWO_STEP_FEATURE } } }));
    expect(off?.isOn).toBe(false);
    const line = await withSchool(as(older.id), (tx) => tx.auditLogEntry.findFirst({ where: { action: "feature-switched", recordType: "School Feature" } }));
    expect(line?.after).toEqual({ feature: "two-step-login", isOn: true });
    expect(line?.actorNote).toMatch(/School OS update/);
    const told = await securityNotes(older.id, admin.id);
    expect(told.map((n) => n.link)).toEqual(["/settings/data-security"]);
    // Running it again changes nothing and tells nobody twice.
    await runUpdate();
    expect(await securityNotes(older.id, admin.id)).toHaveLength(1);
  });

  it("lock nobody out: a School Admin no code can reach signs in with the password, it is written down, and My profile says how to fix it", async () => {
    const withPhone = await makeUser({ schools: [{ id: older.id, roleKeys: ["principal"] }], name: "Phone Only Principal" });
    await prisma.userLogin.update({ where: { id: withPhone.id }, data: { phone: "+91 98480 55501" } });
    // As on the live server: no email server, the school's SMS not set up, nothing goes to a log.
    vi.stubEnv("NODE_ENV", "production");
    try {
      for (const person of [admin, withPhone]) {
        const r = await signIn(person.username, PASSWORD, device, { sleep: noSleep });
        if (r.ok || !r.twoStep) throw new Error("two-step login should be needed");
        const step = await startSecondStep(r.twoStep.userLoginId, r.twoStep.schoolId, device);
        expect(step.kind).toBe("signed-in");
        if (step.kind !== "signed-in") return;
        expect((await findSession(step.token))?.userLoginId).toBe(person.id);
        const lines = await audits(older.id, person.id, "signed-in-without-two-step");
        expect(lines).toHaveLength(1);
        expect((lines[0].after as { reason: string }).reason).toBe(step.why);
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("a code that cannot go for a passing reason does not let anyone in", async () => {
    const r = await startSecondStep(admin.id, older.id, device, { deliver: async () => ({ problem: "The code could not be sent by email just now. Please try again in a minute." }) });
    expect(r).toEqual({ kind: "problem", message: expect.stringMatching(/try again/) });
  });

  it("a person a code can reach must type it", async () => {
    const c = catcher();
    await prisma.userLogin.update({ where: { id: admin.id }, data: { email: "older.admin@example.com" } });
    const r = await startSecondStep(admin.id, older.id, device, { deliver: c.deliver });
    expect(r).toMatchObject({ kind: "code", sentTo: "pr•••@example.com" });
    expect(c.sent).toHaveLength(1);
  });
});

describe("signing in with a one-time code instead of the password", () => {
  it("a Teacher: one code signs in, and a new password can then be set without the old one, once", async () => {
    const teacher = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }] });
    await prisma.userLogin.update({ where: { id: teacher.id }, data: { email: "code.teacher@example.com" } });
    const c = catcher();
    const started = await startCodeSignIn(teacher.username, device, { deliver: c.deliver });
    if (!started.ok) throw new Error(started.message);
    const v = await verifyChallenge(started.token, c.sent[0].code, device);
    if (!v.ok) throw new Error(v.message);
    expect(v.purpose).toBe("code-sign-in");
    const done = await afterRightCode(v, device, { deliver: c.deliver });
    expect(done).toMatchObject({ kind: "signed-in", mayTrust: false });
    if (done.kind !== "signed-in") return;
    const session = await findSession(done.token);
    expect(session?.signedInWithCode).toBe(true);
    expect(mayResetWithoutOld(session!)).toBe(true);
    expect(mayResetWithoutOld(session!, new Date(session!.createdAt.getTime() + NEW_PASSWORD_AFTER_CODE_MS + 1000))).toBe(false);

    who.current = { user: { id: teacher.id }, ctx: { schoolId: school.id, userId: teacher.id }, session };
    const fd = new FormData();
    fd.set("currentPassword", "");
    fd.set("newPassword", "Fresh-start#22");
    fd.set("confirmPassword", "Fresh-start#22");
    expect(await changePassword(null, fd)).toMatchObject({ ok: true });
    const stored = await prisma.userLogin.findUniqueOrThrow({ where: { id: teacher.id } });
    expect(await verifyPassword(stored.passwordHash!, "Fresh-start#22")).toBe(true);
    expect((await audits(school.id, teacher.id, "changed-password"))[0].after).toEqual({ with: "one-time code sign-in" });
    // Used once: the next change needs the password again.
    who.current = { user: { id: teacher.id }, ctx: { schoolId: school.id, userId: teacher.id }, session: await findSession(done.token) };
    fd.set("newPassword", "Second-try#33");
    fd.set("confirmPassword", "Second-try#33");
    expect(await changePassword(null, fd)).toMatchObject({ ok: false, message: expect.stringMatching(/current password is not right/) });
  });

  it("a Principal: the first code (by email) does not sign in; a second code goes to the mobile, and only then", async () => {
    const principal = await makeUser({ schools: [{ id: school.id, roleKeys: ["principal"] }] });
    await prisma.userLogin.update({ where: { id: principal.id }, data: { email: "code.principal@example.com", phone: "+91 98480 54321" } });
    const c = catcher();
    const started = await startCodeSignIn(principal.username, device, { deliver: c.deliver });
    if (!started.ok) throw new Error(started.message);
    expect(c.sent[0]).toMatchObject({ phone: null, email: "code.principal@example.com" });

    const sessionsBefore = await prisma.session.count({ where: { userLoginId: principal.id } });
    const first = await verifyChallenge(started.token, c.sent[0].code, device);
    if (!first.ok) throw new Error(first.message);
    const next = await afterRightCode(first, device, { deliver: c.deliver });
    expect(next.kind).toBe("second-code");
    if (next.kind !== "second-code") return;
    expect(c.sent[1]).toMatchObject({ email: null, phone: "+91 98480 54321" });
    expect(await prisma.session.count({ where: { userLoginId: principal.id } })).toBe(sessionsBefore);
    // The first code cannot be used again to skip the second.
    expect(await verifyChallenge(started.token, c.sent[0].code, device)).toMatchObject({ ok: false, restart: true });

    const second = await verifyChallenge(next.token, c.sent[1].code, device);
    if (!second.ok) throw new Error(second.message);
    expect(second.purpose).toBe("code-sign-in-second");
    const done = await afterRightCode(second, device, { deliver: c.deliver });
    expect(done).toMatchObject({ kind: "signed-in", mayTrust: true });
    if (done.kind === "signed-in") expect((await findSession(done.token))?.userLoginId).toBe(principal.id);
  });

  it("a Principal with only one contact, or a mobile no code can reach, is told how to get back in, and no code is sent", async () => {
    const principal = await makeUser({ schools: [{ id: school.id, roleKeys: ["principal"] }] });
    await prisma.userLogin.update({ where: { id: principal.id }, data: { phone: "+91 98480 54322" } });
    const c = catcher();
    expect(await startCodeSignIn(principal.username, device, { deliver: c.deliver })).toEqual({ ok: false, message: CODE_ALONE_WORDS });

    await prisma.userLogin.update({ where: { id: principal.id }, data: { email: "two.contacts@example.com" } });
    const smsNotSetUp = async () => ({ email: true, phone: false });
    expect(await startCodeSignIn(principal.username, device, { deliver: c.deliver, channels: smsNotSetUp })).toEqual({ ok: false, message: CODE_ALONE_WORDS });
    expect(c.sent).toHaveLength(0);
    expect(CODE_ALONE_WORDS).toMatch(/new sign-in link/);
  });
});

describe("a sign-in from a new device", () => {
  it("is told to the person once per device, in the app, with 'Not you? Sign out everywhere'", async () => {
    const teacher = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }] });
    const laptop = { userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0", ipAddress: "10.0.0.31", deviceId: "laptop-device-0123456789abcdef" };
    // Another computer with exactly the same browser: still a new device.
    const other = { ...laptop, ipAddress: "10.0.0.32", deviceId: "other-device-0123456789abcdef" };
    await completeSignIn(teacher.id, school.id, laptop);
    await completeSignIn(teacher.id, school.id, laptop);
    expect(await securityNotes(school.id, teacher.id)).toHaveLength(0);

    await completeSignIn(teacher.id, school.id, other);
    await completeSignIn(teacher.id, school.id, other);
    const notes = await securityNotes(school.id, teacher.id);
    expect(notes).toHaveLength(1);
    expect(notes[0].text).toMatch(/^New sign-in to Safe Sign-in School on Chrome on Windows computer \(10\.0\.0\.32\), .*Not you\? Sign out everywhere in My profile/);
    expect(notes[0].link).toBe("/profile#devices");
    expect(await audits(school.id, teacher.id, "signed-in-new-device")).toHaveLength(1);
  });

  it("a browser already used before device ids came in is not called new", async () => {
    const teacher = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }] });
    const ua = "Mozilla/5.0 (Linux; Android 14) Chrome/129.0 Mobile";
    await createSession(teacher.id, school.id, { userAgent: ua });
    await completeSignIn(teacher.id, school.id, { userAgent: ua, deviceId: "phone-device-0123456789abcdef" });
    expect(await securityNotes(school.id, teacher.id)).toHaveLength(0);
  });

  it("security alerts go by email too unless the person chose otherwise; other kinds follow what was ticked", () => {
    expect(chosenCopyChannels({}, "security")).toEqual(["email"]);
    expect(chosenCopyChannels({}, "privacy")).toEqual(["email"]);
    expect(chosenCopyChannels({ security: ["app", "whatsapp"] }, "security")).toEqual(["whatsapp"]);
    expect(chosenCopyChannels({}, "notice")).toEqual([]);
    // A choice ticked in My profile is saved under the kind ("notices"), not the type ("notice").
    expect(chosenCopyChannels({ notices: ["app", "email"] }, "notice")).toEqual(["email"]);
    expect(chosenCopyChannels({ "leave-decided": ["app", "sms"] }, "leave-decided")).toEqual(["sms"]);
  });

  it("a changed password is told to the person too", async () => {
    const teacher = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }] });
    const { session } = await createSession(teacher.id, school.id, device);
    who.current = { user: { id: teacher.id }, ctx: { schoolId: school.id, userId: teacher.id }, session };
    const fd = new FormData();
    fd.set("currentPassword", PASSWORD);
    fd.set("newPassword", "Changed-now#44");
    fd.set("confirmPassword", "Changed-now#44");
    expect(await changePassword(null, fd)).toMatchObject({ ok: true });
    const notes = await securityNotes(school.id, teacher.id);
    expect(notes.map((n) => n.text)).toEqual([expect.stringMatching(/^Your School OS password was changed on .*Not you\? Tell your School Admin at once\./)]);
  });
});
