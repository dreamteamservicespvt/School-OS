// Signing in, with slow-down and lock after wrong passwords
// (08-platform-security.md §2).

import { prisma, withSchool } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { formatDateTime } from "../format";
import { describeDevice } from "../data-security/audit-view";
import { burnPasswordCheck, verifyPassword } from "./password";
import { createSession, deviceKeyOf, type DeviceInfo } from "./sessions";
import { schoolsFor } from "./access";
import { codeChannels, needsTwoStep, startChallenge, type Deliver, type SignInPurpose } from "./two-step";
import { isRememberedDevice } from "./remembered";
import { securityAlert } from "./security-alert";
import { startFirstChange } from "./invites";
import { passwordExpired, passwordRulesForLogin } from "./password-rules";
import { hitLimit } from "../rate-limit";
import { noteAdminSignIn } from "../console/admin-sign-in";

/** Wrong passwords before the login is locked (inferred). */
export const MAX_FAILED_ATTEMPTS = 5;
/** How long a locked login stays locked (inferred: 15 minutes). */
export const LOCK_MS = 15 * 60 * 1000;
/** From this many wrong passwords on, each try is slowed down. */
export const SLOW_DOWN_AFTER = 3;

export type SignInResult =
  /** `remembered`: the code was skipped because this is a remembered device (its cookie is renewed). */
  | { ok: true; token: string; userLoginId: string; schoolId: string; remembered?: boolean }
  | { ok: false; message: string; twoStep?: undefined; firstChange?: undefined }
  /** The password is a temporary one from the school: the person chooses their own first, on the invite page with this token. */
  | { ok: false; message: string; twoStep?: undefined; firstChange: string }
  /** The password is right, but a one-time code is needed first (two-step login). */
  | { ok: false; message: string; twoStep: { userLoginId: string; schoolId: string }; firstChange?: undefined };

const WRONG = "The login or password is wrong. Check both and try again.";
/** After 3 wrong passwords in a row: a warning, with no countdown on the screen (owner, 2026-11-05). */
export const WRONG_NEAR_LOCK = "The login or password is wrong. Check both and try again. A few more wrong tries will lock this login. If you are not sure of it, use 'Forgot password' below.";
/**
 * Said while the login is locked after too many wrong passwords. The lock itself
 * stays (08-platform-security.md §2), but the screen shows no timer: the person
 * is pointed to the one-time code, which still works while the password is locked.
 */
export const LOCKED = "Too many wrong passwords, so this login is locked for now. Use 'Forgot password' below to sign in with a one-time code and set a new password, or ask your School Admin.";
const NOT_SET_UP = "This login has not been set up yet. Open the invite link your school sent you to set your password.";

/** Logins sharing one email or mobile number whose passwords are tried, at most. */
export const MAX_SHARED_LOGINS = 5;
/** Sign-in tries on one shared email or mobile number per lock window, at most. */
const SHARED_TRIES = 10;

/**
 * A login typed as a username, an email or a mobile number. Email and mobile
 * only count when exactly one login has them, so nobody signs in as someone else.
 */
export async function findLogin(input: string) {
  const list = await lookUpLogins(input);
  return list.length === 1 ? list[0] : null;
}

/**
 * Every live login the typed words can mean: the one with that username, else
 * every login with that email or mobile number (one number is often on several
 * logins, for example a school office phone, or test staff sharing phones).
 */
async function lookUpLogins(input: string) {
  const typed = input.trim().toLowerCase();
  if (!typed) return [];
  const byName = await prisma.userLogin.findUnique({ where: { username: typed } });
  // An archived login (a cancelled invite) keeps its username; the person's live login may have the same mobile.
  if (byName && !byName.archivedAt) return [byName];
  if (typed.includes("@")) {
    return prisma.userLogin.findMany({ where: { email: { equals: typed, mode: "insensitive" }, archivedAt: null }, orderBy: { createdAt: "asc" }, take: MAX_SHARED_LOGINS + 1 });
  }
  const digits = typed.replace(/\D/g, "");
  if (digits.length >= 10 && digits.length <= 13 && /^[+\d\s()-]+$/.test(typed)) {
    const last10 = digits.slice(-10);
    // Numbers are stored as typed ("+91 98480 12345"), so compare digits only.
    const near = await prisma.userLogin.findMany({ where: { phone: { endsWith: last10.slice(-4) }, archivedAt: null }, orderBy: { createdAt: "asc" }, take: 200 });
    return near.filter((u) => (u.phone ?? "").replace(/\D/g, "").endsWith(last10));
  }
  return [];
}

type Login = Awaited<ReturnType<typeof lookUpLogins>>[number];

/**
 * Several logins share the email or mobile number typed: the password picks
 * the one. Each is checked the same slow way; exactly one must match, else the
 * answer is the same "wrong" as for any wrong password, so the screen never
 * tells that the number is shared (security review 2026-11-05).
 */
async function pickByPassword(list: Login[], typed: string, password: string, now: Date): Promise<Login | null> {
  // Tries on one shared contact are counted, so it cannot be used to guess past each login's own lock.
  const contact = typed.includes("@") ? typed.trim().toLowerCase() : typed.replace(/\D/g, "").slice(-10);
  if (!(await hitLimit(`sign-in:shared:${contact}`, SHARED_TRIES, LOCK_MS / 1000, now)).ok) {
    await burnPasswordCheck(password);
    return null;
  }
  const matches: Login[] = [];
  for (const u of list.slice(0, MAX_SHARED_LOGINS)) {
    if (u.passwordHash && (await verifyPassword(u.passwordHash, password))) matches.push(u);
  }
  return matches.length === 1 ? matches[0] : null;
}

type Options = { now?: Date; sleep?: (ms: number) => Promise<void>; /** The browser's remembered-device token, if any (remembered.ts). */ trustedDevice?: string | null };
const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function signIn(usernameInput: string, password: string, device: DeviceInfo, opts: Options = {}): Promise<SignInResult> {
  const now = opts.now ?? new Date();
  const sleep = opts.sleep ?? realSleep;
  const found = await lookUpLogins(usernameInput);
  const ready = found.filter((u) => u.passwordHash);
  if (ready.length === 0) {
    await burnPasswordCheck(password);
    if (found.length === 1 && found[0].status === "INVITED") return { ok: false, message: NOT_SET_UP };
    return { ok: false, message: WRONG };
  }

  let user: Login;
  // Shared by several logins (even if only one has a password yet): no one login's wrong-password count is touched.
  if (found.length > 1) {
    const picked = await pickByPassword(ready, usernameInput, password, now);
    if (!picked) return { ok: false, message: WRONG };
    if (picked.lockedUntil && picked.lockedUntil > now) return { ok: false, message: LOCKED };
    user = picked;
  } else {
    user = ready[0];
    if (user.lockedUntil && user.lockedUntil > now) return { ok: false, message: LOCKED };

    // A short pause on the server only (at most 2 seconds), never shown as a timer.
    if (user.failedAttempts >= SLOW_DOWN_AFTER) {
      await sleep(Math.min(user.failedAttempts - SLOW_DOWN_AFTER + 1, 4) * 500);
    }

    const passwordOk = await verifyPassword(user.passwordHash!, password);

    if (!passwordOk) {
      const failedAttempts = user.failedAttempts + 1;
      const locks = failedAttempts >= MAX_FAILED_ATTEMPTS;
      await prisma.userLogin.update({
        where: { id: user.id },
        data: { failedAttempts: locks ? 0 : failedAttempts, lockedUntil: locks ? new Date(now.getTime() + LOCK_MS) : null },
      });
      await reportFailure(user.id, device);
      if (locks) {
        await reportLock(user.id, user.displayName, device);
        return { ok: false, message: LOCKED };
      }
      return { ok: false, message: MAX_FAILED_ATTEMPTS - failedAttempts <= 2 ? WRONG_NEAR_LOCK : WRONG };
    }
  }

  if (user.status !== "ACTIVE") {
    return { ok: false, message: "This login is switched off. Ask your School Admin, or DREAM TEAM support, to switch it on." };
  }

  const schools = await schoolsFor(user.id);
  if (schools.length === 0) {
    return { ok: false, message: "Your login is not linked to any school yet. Ask your School Admin, or DREAM TEAM support, to give you access." };
  }
  const schoolId = schools[0].id;

  await prisma.userLogin.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lockedUntil: null },
  });
  // A temporary password from the school (09 Add Staff) only opens the page to choose their own (08 §2).
  if (user.mustChangePassword) {
    return { ok: false, message: "Choose your own password to finish signing in.", firstChange: await startFirstChange(user.id, now) };
  }
  // A password older than the school allows (Password Policy expiry): a new one first, on the same page (08 §2).
  const rules = await passwordRulesForLogin(user.id);
  if (passwordExpired(user, rules, now)) {
    return { ok: false, message: `Your password is older than ${rules.expiryDays} days. Choose a new one to finish signing in.`, firstChange: await startFirstChange(user.id, now) };
  }
  let remembered = false;
  if (await needsTwoStepInAny(user.id, schools)) {
    remembered = await isRememberedDevice(user.id, opts.trustedDevice, now);
    if (!remembered) return { ok: false, message: "Type the one-time code to finish signing in.", twoStep: { userLoginId: user.id, schoolId } };
  }
  const { token } = await completeSignIn(user.id, schoolId, device, now);
  return { ok: true, token, userLoginId: user.id, schoolId, ...(remembered ? { remembered } : {}) };
}

/**
 * Two-step login is decided once, at sign-in, for every school the person can
 * open: the School switcher opens their other schools without asking again, so
 * a Teacher in one school who is the Principal in another types the code too.
 */
async function needsTwoStepInAny(userLoginId: string, schools: { id: string }[]): Promise<boolean> {
  for (const school of schools) if (await needsTwoStep(userLoginId, school.id)) return true;
  return false;
}

/** Sessions from before browsers had their own device id are matched by browser name for this long. */
const OLD_SESSION_MATCH_MS = 30 * 86_400_000;

/** Whether this browser has signed in as this person before. */
async function knownDevice(userLoginId: string, device: DeviceInfo, now: Date): Promise<boolean> {
  const ua = device.userAgent?.slice(0, 400) ?? null;
  const key = deviceKeyOf(device.deviceId);
  if (!key) return ua ? (await prisma.session.count({ where: { userLoginId, userAgent: ua } })) > 0 : true;
  const count = await prisma.session.count({
    where: {
      userLoginId,
      OR: [
        { deviceKey: key },
        // A session from before device ids, on a browser with the same name, used lately.
        ...(ua ? [{ deviceKey: null, userAgent: ua, lastUsedAt: { gte: new Date(now.getTime() - OLD_SESSION_MATCH_MS) } }] : []),
      ],
    },
  });
  return count > 0;
}

export type CompleteOptions = {
  /** Signed in with a one-time code instead of the password. */
  byCode?: boolean;
  /** Two-step login was needed but no code could reach the person: why. */
  withoutTwoStep?: string | null;
};

/**
 * The last step of signing in (after the password, and the one-time code
 * when needed): a new session, written to the audit log. A sign-in from a
 * browser this person has not used before is marked as a new device, and the
 * person is told at once, in the app and by email (00-global.md §4, rule 7).
 */
export async function completeSignIn(userLoginId: string, schoolId: string, device: DeviceInfo, now = new Date(), opts: CompleteOptions = {}) {
  const earlier = await prisma.session.count({ where: { userLoginId } });
  const isNew = earlier > 0 && !(await knownDevice(userLoginId, device, now));
  // A code typed instead of the password proves the person: a password lock from wrong tries ends.
  await prisma.userLogin.update({ where: { id: userLoginId }, data: { lastSignInAt: now, ...(opts.byCode ? { failedAttempts: 0, lockedUntil: null } : {}) } });
  const { token } = await createSession(userLoginId, schoolId, device, now, { signedInWithCode: opts.byCode });
  const ctx = { schoolId, userId: userLoginId };
  const afterSave = await withSchool(ctx, async (tx) => {
    await writeAudit(tx, ctx, {
      action: isNew ? "signed-in-new-device" : "signed-in",
      recordType: "User Login",
      recordId: userLoginId,
      after: opts.byCode ? { with: "one-time code" } : undefined,
      device: device.userAgent,
      ipAddress: device.ipAddress,
    });
    if (opts.withoutTwoStep) {
      await writeAudit(tx, ctx, { action: "signed-in-without-two-step", recordType: "User Login", recordId: userLoginId, after: { reason: opts.withoutTwoStep }, device: device.userAgent, ipAddress: device.ipAddress });
    }
    if (!isNew) return null;
    const school = await tx.school.findUnique({ where: { id: schoolId }, select: { name: true, timeZone: true } });
    const where = `${describeDevice(device.userAgent)}${device.ipAddress ? ` (${device.ipAddress})` : ""}`;
    return securityAlert(tx, schoolId, userLoginId, {
      subject: "New sign-in to School OS",
      text: `New sign-in to ${school?.name ?? "School OS"} on ${where}, ${formatDateTime(now, school?.timeZone)}. Not you? Sign out everywhere in My profile and change your password.`,
      link: "/profile#devices",
    });
  });
  if (afterSave) await afterSave();
  // The console shows at once that the School Admin has signed in (console/admin-sign-in.ts).
  await noteAdminSignIn(userLoginId, (await schoolsFor(userLoginId)).map((s) => s.id), now);
  return { token };
}

export type SecondStep =
  /** A code was sent; the browser keeps the token until it is typed. */
  | { kind: "code"; token: string; sentTo: string }
  /** No code can reach this person at all: signed in with the password, and told how to fix it. */
  | { kind: "signed-in"; token: string; why: string }
  | { kind: "problem"; message: string };

/**
 * After the right password, for a person who must type a code. Sends the
 * code. When no code can reach them at all (no email or mobile number, or
 * neither email nor SMS set up), they are not locked out: they sign in with
 * the password, it is written to the audit log and Security alerts, and My
 * profile shows them how to add a mobile number or email.
 */
export async function startSecondStep(userLoginId: string, schoolId: string, device: DeviceInfo, opts: { now?: Date; deliver?: Deliver; confirmNow?: boolean } = {}): Promise<SecondStep> {
  const now = opts.now ?? new Date();
  const started = await startChallenge(userLoginId, schoolId, device, { now, deliver: opts.deliver, confirmNow: opts.confirmNow });
  if (started.ok) return { kind: "code", token: started.token, sentTo: started.sentTo };
  if (!started.unreachable) return { kind: "problem", message: started.message };
  const { token } = await completeSignIn(userLoginId, schoolId, device, now, { withoutTwoStep: started.message });
  return { kind: "signed-in", token, why: started.message };
}

/** Also said when the mobile or email typed is on several logins: the username picks one (the same words, so it never tells which). */
export const CANNOT_SEND = "We could not send a code to that login. Check what you typed, or type your username instead. If it still does not work, ask your School Admin to send you a new sign-in link.";
/** Said to a person whose role needs two-step login when a code alone cannot sign them in. */
export const CODE_ALONE_WORDS = "Your role needs your password and a one-time code to sign in, so one code alone is not enough. Signing in with codes needs both an email and a mobile number on your login that codes can reach. If you forgot your password, ask your Principal or another School Admin for a new sign-in link, or call DREAM TEAM support.";

export type CodeSignInStart = { ok: true; token: string } | { ok: false; message: string };

/**
 * "Forgot password? Sign in with a one-time code": a code to the email or
 * mobile on the login stands in for the password. For a person whose role
 * needs two-step login a code alone would be one step only, so the first code
 * goes to their email and, once it is typed, a second code goes to their
 * mobile (afterRightCode). A login that cannot get both is told how else to get in.
 */
export async function startCodeSignIn(typed: string, device: DeviceInfo, opts: { now?: Date; deliver?: Deliver; channels?: typeof codeChannels; confirmNow?: boolean } = {}): Promise<CodeSignInStart> {
  const now = opts.now ?? new Date();
  const user = await findLogin(typed);
  // A login locked after wrong passwords may still sign in with a code: that is the way back in the lock message points to.
  const usable = user && user.status === "ACTIVE" && !user.archivedAt;
  const schools = user && usable ? await schoolsFor(user.id) : [];
  const school = schools[0];
  if (!user || !school || (!user.phone && !user.email)) return { ok: false, message: CANNOT_SEND };
  let only: "email" | undefined;
  if (await needsTwoStepInAny(user.id, schools)) {
    const can = await (opts.channels ?? codeChannels)(user, school.id);
    if (!can.email || !can.phone) return { ok: false, message: CODE_ALONE_WORDS };
    only = "email";
  }
  const started = await startChallenge(user.id, school.id, device, { now, deliver: opts.deliver, purpose: "code-sign-in", only, confirmNow: opts.confirmNow });
  if (!started.ok) return { ok: false, message: started.unreachable ? `${started.message} Sign in with your password, or ask your School Admin or DREAM TEAM support.` : started.message };
  return { ok: true, token: started.token };
}

/**
 * Whether a sign-in by two codes (email, then mobile) instead of the password
 * may make a remembered device. Open owner decision: off for now, as the
 * blueprint says no code typed instead of the password makes one
 * (08-platform-security.md §2). Switching it on is this one line.
 */
export const TWO_CODES_REMEMBER_DEVICE = false;

export type AfterCode =
  /** `mayRemember`: true only after the password and a code; codes typed instead of the password do not (see TWO_CODES_REMEMBER_DEVICE). */
  | { kind: "signed-in"; token: string; userLoginId: string; mayRemember: boolean }
  /** The first of two codes was right; the second went to the person's other contact. */
  | { kind: "second-code"; token: string; sentTo: string }
  | { kind: "problem"; message: string };

/**
 * After a right code. A code typed after the password, or the second of two
 * codes, signs the person in. A code that stood in for the password signs in
 * a person whose role does not need two-step login; for one whose role does,
 * a second code goes to their other contact first.
 */
export async function afterRightCode(
  v: { userLoginId: string; schoolId: string; purpose: SignInPurpose; channel: string },
  device: DeviceInfo,
  opts: { now?: Date; deliver?: Deliver; confirmNow?: boolean } = {},
): Promise<AfterCode> {
  const now = opts.now ?? new Date();
  if (v.purpose === "code-sign-in" && (await needsTwoStepInAny(v.userLoginId, await schoolsFor(v.userLoginId)))) {
    const only = v.channel === "sms" ? "email" : "phone";
    const s = await startChallenge(v.userLoginId, v.schoolId, device, { now, deliver: opts.deliver, purpose: "code-sign-in-second", only, confirmNow: opts.confirmNow });
    if (!s.ok) return { kind: "problem", message: `${s.message} Your role needs a second code ${only === "phone" ? "on your mobile" : "by email"}. Sign in with your password instead, or ask your School Admin or DREAM TEAM support.` };
    return { kind: "second-code", token: s.token, sentTo: s.sentTo };
  }
  const { token } = await completeSignIn(v.userLoginId, v.schoolId, device, now, { byCode: v.purpose !== "sign-in" });
  const mayRemember = v.purpose === "sign-in" || (v.purpose === "code-sign-in-second" && TWO_CODES_REMEMBER_DEVICE);
  return { kind: "signed-in", token, userLoginId: v.userLoginId, mayRemember };
}

/** A wrong password for a real login goes into each of its schools' login history. */
async function reportFailure(userLoginId: string, device: DeviceInfo) {
  for (const school of await schoolsFor(userLoginId)) {
    const ctx = { schoolId: school.id, userId: userLoginId };
    await withSchool(ctx, (tx) => writeAudit(tx, ctx, { action: "sign-in-failed", recordType: "User Login", recordId: userLoginId, device: device.userAgent, ipAddress: device.ipAddress }));
  }
}

/** Tells the person and their schools' School Admins, and writes it to each school's audit log. */
async function reportLock(userLoginId: string, displayName: string, device: DeviceInfo) {
  const schools = await schoolsFor(userLoginId);
  for (const school of schools) {
    const ctx = { schoolId: school.id, userId: null };
    await withSchool(ctx, async (tx) => {
      await writeAudit(tx, ctx, {
        action: "locked-after-wrong-passwords",
        recordType: "User Login",
        recordId: userLoginId,
        device: device.userAgent,
        ipAddress: device.ipAddress,
      });
      const admins = await tx.schoolAccess.findMany({
        where: { schoolId: school.id, archivedAt: null, roles: { some: { role: { key: "school-admin" } } } },
        select: { userLoginId: true },
      });
      const to = new Set([userLoginId, ...admins.map((a) => a.userLoginId)]);
      for (const person of to) {
        await notify(tx, ctx, {
          to: person,
          type: "security",
          text: person === userLoginId
            ? "Your login was locked for 15 minutes after 5 wrong passwords. If this was not you, change your password."
            : `${displayName}'s login was locked for 15 minutes after 5 wrong passwords.`,
          link: person === userLoginId ? "/profile" : "/settings",
        });
      }
    });
  }
}
