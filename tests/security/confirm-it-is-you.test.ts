// Owner decision 3 (15 Nov 2026): changing your own mobile number or email, or
// switching off two-step login, first asks for the current password (or a one-time
// code to the current contact when the person has no password), and after a new
// mobile or email the OLD one is told ("Your School OS mobile number was changed.
// If this was not you, contact your school."). Calls the real My profile actions.
import { beforeAll, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const jar = new Map<string, string>();
  return {
    jar,
    current: null as unknown,
    cookies: {
      get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined),
      set: (n: string, v: string) => void jar.set(n, v),
      delete: (n: string | { name: string }) => void jar.delete(typeof n === "string" ? n : n.name),
    },
  };
});
vi.mock("next/headers", () => ({ cookies: async () => h.cookies, headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/current", () => ({
  requireCurrent: async () => h.current,
  deviceInfo: async () => ({ ipAddress: "10.0.8.1", userAgent: "Confirm browser" }),
}));

import { prisma, withSchool } from "@/lib/db";
import { CONFIRM_COOKIE, CONFIRM_WORDS, checkProof, confirmWay } from "@/lib/auth/confirm-me";
import { OLD_CONTACT_WORDS, tellOldContact } from "@/lib/auth/contact-alert";
import { cleanMobile } from "@/lib/auth/two-step";
import { makeSchool, makeUser, PASSWORD, takeLoggedCode, watchLoggedCodes } from "../helpers";

const profile = await import("@/app/(school)/profile/actions");

let school: Awaited<ReturnType<typeof makeSchool>>;
let seq = 0;
const uniquePhone = () => `9${String(Date.now() + ++seq * 7919).slice(-9)}`;
const form = (o: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.set(k, v); return fd; };

async function signedIn(opts: { phone?: string | null; email?: string | null; noPassword?: boolean; twoStep?: boolean } = {}) {
  const u = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }], name: `Confirm Person ${++seq}` });
  const user = await prisma.userLogin.update({
    where: { id: u.id },
    data: { phone: opts.phone ?? null, email: opts.email ?? null, ...(opts.noPassword ? { passwordHash: null } : {}), twoStepChosen: Boolean(opts.twoStep) },
  });
  h.jar.clear();
  h.current = { user, school: { id: school.id, name: "Confirm School" }, ctx: { schoolId: school.id, userId: user.id }, session: { id: "none" }, support: null };
  return user;
}
const notes = (userLoginId: string) => withSchool({ schoolId: school.id, userId: null }, (tx) => tx.notification.findMany({ where: { userLoginId }, select: { text: true } }));
const audits = (userLoginId: string, action: string) => withSchool({ schoolId: school.id, userId: null }, (tx) => tx.auditLogEntry.findMany({ where: { recordId: userLoginId, action } }));
const contactCodes = (userLoginId: string) => prisma.twoStepChallenge.count({ where: { userLoginId, purpose: { in: ["phone", "email"] } } });

beforeAll(async () => {
  watchLoggedCodes();
  school = await makeSchool("Confirm It Is You School");
}, 120_000);

describe("a new mobile number or email", () => {
  it("needs the current password before any code goes to the new number, then tells the old number", async () => {
    const old = cleanMobile(uniquePhone())!;
    const user = await signedIn({ phone: old });
    const next = uniquePhone();
    const none = await profile.sendContactCode(null, form({ kind: "phone", value: next }));
    expect(none).toMatchObject({ ok: false, step: "type", field: "confirmPassword", message: CONFIRM_WORDS.password });
    const wrong = await profile.sendContactCode(null, form({ kind: "phone", value: next, confirmPassword: "not-my-password-1" }));
    expect(wrong).toMatchObject({ ok: false, field: "confirmPassword", message: CONFIRM_WORDS.wrongPassword });
    expect(await contactCodes(user.id)).toBe(0);

    const sent = await profile.sendContactCode(null, form({ kind: "phone", value: next, confirmPassword: PASSWORD }));
    expect(sent).toMatchObject({ ok: true, step: "code" });
    const done = await profile.confirmContactCode(null, form({ kind: "phone", value: next, code: takeLoggedCode() }));
    expect(done).toMatchObject({ ok: true, step: "done" });
    expect((await prisma.userLogin.findUniqueOrThrow({ where: { id: user.id } })).phone).toBe(cleanMobile(next));

    // The old number is told (here no WhatsApp or SMS is connected, so the app notice and the Audit Log say it).
    expect((await notes(user.id)).map((n) => n.text)).toContain(OLD_CONTACT_WORDS.phone);
    const told = await audits(user.id, "told-old-contact");
    expect(told).toHaveLength(1);
    expect(JSON.stringify(told[0].after)).toContain(old.replace(/\D/g, "").slice(-4));
    expect(JSON.stringify(told[0].after)).not.toContain(old.replace(/\D/g, "").slice(0, 6));
  }, 60_000);

  it("a person with no password confirms with a code to their current email; the code works once", async () => {
    const user = await signedIn({ email: `confirm.${Date.now()}@example.com`, noPassword: true });
    expect(confirmWay(user)).toMatchObject({ kind: "code" });
    const next = uniquePhone();
    expect(await profile.sendContactCode(null, form({ kind: "phone", value: next }))).toMatchObject({ ok: false, field: "confirmCode", message: CONFIRM_WORDS.sendCode });
    expect(await profile.sendConfirmCodeAction()).toMatchObject({ ok: true });
    expect(h.jar.get(CONFIRM_COOKIE)).toBeTruthy();
    const code = takeLoggedCode();
    const token = h.jar.get(CONFIRM_COOKIE)!;
    expect(await profile.sendContactCode(null, form({ kind: "phone", value: next, confirmCode: code === "000000" ? "111111" : "000000" }))).toMatchObject({ ok: false, field: "confirmCode" });
    expect(await profile.sendContactCode(null, form({ kind: "phone", value: next, confirmCode: code }))).toMatchObject({ ok: true, step: "code" });
    // Used up, and the cookie is gone: the same code cannot confirm a second change.
    expect(h.jar.get(CONFIRM_COOKIE)).toBeUndefined();
    expect(await checkProof(user.id, { token, code })).toMatchObject({ ok: false, field: "confirmCode" });
  }, 60_000);

  it("a typed password does not stand in for the code for a person with no password, nor the other way round", async () => {
    const withPassword = await signedIn({ email: `confirm.pw.${Date.now()}@example.com` });
    expect(confirmWay(withPassword)).toEqual({ kind: "password" });
    expect(await profile.sendConfirmCodeAction()).toMatchObject({ ok: false, message: CONFIRM_WORDS.noPassword });
    const noPassword = await signedIn({ email: `confirm.nopw.${Date.now()}@example.com`, noPassword: true });
    expect(await checkProof(noPassword.id, { password: PASSWORD })).toMatchObject({ ok: false, field: "confirmCode" });
  });
});

describe("switching off two-step login", () => {
  it("asks for the current password first, then tells the person", async () => {
    const user = await signedIn({ email: `confirm.twostep.${Date.now()}@example.com`, twoStep: true });
    expect(await profile.setTwoStep(false)).toMatchObject({ ok: false });
    expect(await profile.switchOffTwoStep(null, form({}))).toMatchObject({ ok: false, field: "confirmPassword" });
    expect(await profile.switchOffTwoStep(null, form({ confirmPassword: "wrong-password-9" }))).toMatchObject({ ok: false, message: CONFIRM_WORDS.wrongPassword });
    expect((await prisma.userLogin.findUniqueOrThrow({ where: { id: user.id } })).twoStepChosen).toBe(true);

    expect(await profile.switchOffTwoStep(null, form({ confirmPassword: PASSWORD }))).toMatchObject({ ok: true });
    expect((await prisma.userLogin.findUniqueOrThrow({ where: { id: user.id } })).twoStepChosen).toBe(false);
    expect((await notes(user.id)).map((n) => n.text)).toContain("Two-step login was switched off on your School OS login. If this was not you, contact your school.");
    expect(await audits(user.id, "two-step-switched-off")).toHaveLength(1);
    // Switching it on again needs nothing more.
    expect(await profile.setTwoStep(true)).toMatchObject({ ok: true });
  }, 60_000);
});

describe("telling the old contact", () => {
  it("sends an old email by School OS's mail first, else through the school's messaging; an old mobile through messaging", async () => {
    const user = await signedIn({ email: "now@example.com" });
    const calls: string[] = [];
    const mail = async (j: { old: string }) => { calls.push(`mail:${j.old}`); return false; };
    const messaging = async (j: { old: string; text: string }) => { calls.push(`messaging:${j.old}:${j.text}`); return true; };
    expect(await tellOldContact({ schoolId: school.id, userLoginId: user.id, name: user.displayName, kind: "email", old: "was@example.com" }, { mail, messaging })).toEqual(["messaging"]);
    expect(await tellOldContact({ schoolId: school.id, userLoginId: user.id, name: user.displayName, kind: "phone", old: "+91 98480 12345" }, { mail, messaging })).toEqual(["messaging"]);
    expect(calls).toEqual(["mail:was@example.com", `messaging:was@example.com:${OLD_CONTACT_WORDS.email}`, `messaging:+91 98480 12345:${OLD_CONTACT_WORDS.phone}`]);
    // No old contact (a first mobile number): only the app notice.
    calls.length = 0;
    expect(await tellOldContact({ schoolId: school.id, userLoginId: user.id, name: user.displayName, kind: "phone", old: null }, { mail, messaging })).toEqual([]);
    expect(calls).toEqual([]);
    expect((await notes(user.id)).filter((n) => n.text === OLD_CONTACT_WORDS.phone)).toHaveLength(2);
  });
});
