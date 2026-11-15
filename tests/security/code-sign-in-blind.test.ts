// Owner decision 2 (15 Nov 2026): "Sign in with a one-time code" always shows the same
// message ("If this number has a School OS login, a code is on its way."), whether or
// not the mobile number, email or username has a login, and whether or not a code can
// be sent; at the same speed (the login is looked up and the code sent after the answer
// has gone); and the rate limits stay. Calls the real sign-in server actions.
import { beforeAll, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const jar = new Map<string, string>();
  return {
    jar,
    device: { userAgent: "Blind browser", ipAddress: "10.0.9.1", deviceId: "device-blind-aaaaaaaaaaaaaaaaaaaaaa" },
    cookies: {
      get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined),
      set: (n: string, v: string) => void jar.set(n, v),
      delete: (n: string | { name: string }) => void jar.delete(typeof n === "string" ? n : n.name),
    },
    sets: [] as string[],
  };
});
vi.mock("next/headers", () => ({
  cookies: async () => ({ ...h.cookies, set: (n: string, v: string) => { h.sets.push(n); h.cookies.set(n, v); } }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw Object.assign(new Error(`redirect to ${to}`), { to }); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/current", () => ({
  requireCurrent: async () => null,
  deviceInfo: async () => ({ ipAddress: h.device.ipAddress, userAgent: h.device.userAgent }),
  signInDevice: async () => ({ ...h.device }),
  clearSessionCookie: async () => void h.jar.delete("session"),
  setSessionCookie: async (token: string) => void h.jar.set("session", token),
  setAppearanceCookies: async () => {},
}));

import { prisma, withSchool } from "@/lib/db";
import { CHALLENGE_COOKIE, TWO_STEP_FEATURE } from "@/lib/auth/two-step";
import { CODE_SIGN_IN_NOTICE, CODE_SIGN_IN_RESENT, innerToken, isDecoyToken, kindOf, typedKind } from "@/lib/auth/decoy";
import { afterAnswer, atLeast } from "@/lib/auth/code-sign-in";
import { hashToken } from "@/lib/auth/tokens";
import { makeSchool, makeUser, takeLoggedCode, watchLoggedCodes } from "../helpers";

const { codeSignInAction, verifyCodeAction, resendCodeAction } = await import("@/app/sign-in/actions");

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
async function run(p: Promise<unknown>): Promise<{ to?: string; result?: unknown }> {
  try {
    return { result: await p };
  } catch (e) {
    const to = (e as { to?: string }).to;
    if (to) return { to };
    throw e;
  }
}
let ip = 10;
function newBrowser() {
  h.jar.clear();
  h.sets.length = 0;
  ip += 1;
  h.device.ipAddress = `10.0.9.${ip}`;
}
const held = () => h.jar.get(CHALLENGE_COOKIE);
/** How many sign-in codes this login has had made. */
const codesFor = (userLoginId: string) => prisma.twoStepChallenge.count({ where: { userLoginId, purpose: { in: ["code-sign-in", "code-sign-in-second", "sign-in"] } } });

let school: Awaited<ReturnType<typeof makeSchool>>;
let teacher: { id: string; username: string };
let n = 0;
/** A new Teacher login with an email, so each test has its own code limits. */
async function newTeacher() {
  const t = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }], name: `Blind Teacher ${++n}` });
  await prisma.userLogin.update({ where: { id: t.id }, data: { email: `blind.teacher.${n}.${Date.now()}@example.com` } });
  return t;
}
let principal: { id: string; username: string };

beforeAll(async () => {
  watchLoggedCodes();
  school = await makeSchool("Blind Code School");
  teacher = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }], name: "Blind Teacher" });
  await prisma.userLogin.update({ where: { id: teacher.id }, data: { email: `blind.teacher.${Date.now()}@example.com` } });
  // A Principal whose role needs two codes but who has only an email: a code alone cannot sign them in.
  principal = await makeUser({ schools: [{ id: school.id, roleKeys: ["principal"] }], name: "Blind Principal" });
  await prisma.userLogin.update({ where: { id: principal.id }, data: { email: `blind.principal.${Date.now()}@example.com`, phone: null } });
  await withSchool({ schoolId: school.id, userId: null }, async (tx) => {
    await tx.schoolFeature.upsert({ where: { schoolId_featureKey: { schoolId: school.id, featureKey: TWO_STEP_FEATURE } }, update: { isOn: true }, create: { schoolId: school.id, featureKey: TWO_STEP_FEATURE, isOn: true } });
    await tx.role.updateMany({ where: { schoolId: school.id, key: "principal" }, data: { requiresTwoStep: true } });
  });
}, 120_000);

describe("the same answer for every login", () => {
  it("sends a real login, an unknown one and one no code can sign in to the same code page, with a blind token each", async () => {
    const answers: { to?: string; result?: unknown; blind: boolean; kind: string }[] = [];
    for (const username of [teacher.username, `nobody-${Date.now()}`, principal.username]) {
      newBrowser();
      const r = await run(codeSignInAction(null, form({ username, remember: "on" })));
      answers.push({ ...r, blind: isDecoyToken(held()), kind: kindOf(held()!) });
      expect(h.sets).toEqual([CHALLENGE_COOKIE, "sos_remember"]);
    }
    expect(answers.map((a) => a.to)).toEqual(["/sign-in/code", "/sign-in/code", "/sign-in/code"]);
    expect(answers.every((a) => a.blind && a.result === undefined && a.kind === "u")).toBe(true);
    // Only the real login that a code alone can sign in got a code; nothing told the others apart.
    expect(await codesFor(principal.id)).toBe(0);
  });

  it("says the same words, by what was typed, and never a masked contact", () => {
    expect(CODE_SIGN_IN_NOTICE.n).toBe("If this number has a School OS login, a code is on its way.");
    expect(typedKind("98480 12345")).toBe("n");
    expect(typedKind("+91 98480-12345")).toBe("n");
    expect(typedKind("name@school.in")).toBe("e");
    expect(typedKind("ravi.k")).toBe("u");
    for (const words of [...Object.values(CODE_SIGN_IN_NOTICE), CODE_SIGN_IN_RESENT]) expect(words).not.toMatch(/\d{3}|•|@/);
  });

  it("signs the real login in with the code it was sent, through the blind token", async () => {
    newBrowser();
    await run(codeSignInAction(null, form({ username: teacher.username })));
    const token = held()!;
    const live = await prisma.twoStepChallenge.findUnique({ where: { tokenHash: hashToken(innerToken(token)) } });
    expect(live?.userLoginId).toBe(teacher.id);
    expect(live?.purpose).toBe("code-sign-in");
    expect((await run(verifyCodeAction(null, form({ code: takeLoggedCode() })))).to).toBe("/profile?newPassword=1#password");
    expect(h.jar.get("session")).toBeTruthy();
  });

  it("answers a wrong code the same way for a real and an unknown login, and sets the cookie again for both", async () => {
    const answers: unknown[][] = [];
    for (const username of [(await newTeacher()).username, `nobody-wrong-${Date.now()}`]) {
      newBrowser();
      await run(codeSignInAction(null, form({ username })));
      const wrong = takeSafe() === "000000" ? "111111" : "000000";
      const list: unknown[] = [];
      for (let i = 0; i < 5; i++) {
        h.sets.length = 0;
        const r = await run(verifyCodeAction(null, form({ code: wrong })));
        list.push({ r: r.result, cookieSet: h.sets.includes(CHALLENGE_COOKIE), kept: held() !== undefined });
      }
      answers.push(list);
    }
    expect(answers[0]).toEqual(answers[1]);
    expect((answers[0][0] as { r: { message: string } }).r.message).toBe("That code is not right. 4 more tries.");
    expect((answers[0][4] as { r: { restart: boolean } }).r.restart).toBe(true);
  });

  it("answers Send a new code the same way; the real login gets a new code and the old one stops working", async () => {
    const said: unknown[] = [];
    const real = await newTeacher();
    for (const username of [real.username, `nobody-resend-${Date.now()}`]) {
      newBrowser();
      await run(codeSignInAction(null, form({ username })));
      said.push(await resendCodeAction());
      expect(isDecoyToken(held())).toBe(true);
    }
    expect(said[0]).toEqual(said[1]);
    expect(said[0]).toEqual({ message: CODE_SIGN_IN_RESENT, sent: true });
    // The teacher's last browser was replaced by the unknown one; sign the teacher in again to use the new code.
    newBrowser();
    await run(codeSignInAction(null, form({ username: real.username })));
    const first = takeSafe();
    await resendCodeAction();
    expect((await run(verifyCodeAction(null, form({ code: first })))).result).toMatchObject({ message: expect.stringMatching(/not right|already been used/) });
    expect((await run(verifyCodeAction(null, form({ code: takeLoggedCode() })))).to).toBe("/profile?newPassword=1#password");
  });

  it("keeps the limits: per device, and per login typed, the same for a real and an unknown one", async () => {
    for (const username of [(await newTeacher()).username, `nobody-limit-${Date.now()}`]) {
      const said: string[] = [];
      for (let i = 0; i < 6; i++) {
        newBrowser();
        const r = await run(codeSignInAction(null, form({ username })));
        said.push(r.to ?? (r.result as { message: string }).message);
      }
      expect(said.slice(0, 5)).toEqual(Array(5).fill("/sign-in/code"));
      expect(said[5]).toBe("Too many tries in a short time. Try again a little later.");
    }
  });
});

describe("the timing helpers", () => {
  it("atLeast waits out the rest of the floor, also when the work throws", async () => {
    let clock = 0;
    const slept: number[] = [];
    const sleep = async (ms: number) => { slept.push(ms); clock += ms; };
    expect(await atLeast(600, async () => { clock += 150; return "done"; }, sleep, () => clock)).toBe("done");
    expect(slept).toEqual([450]);
    await expect(atLeast(600, async () => { clock += 100; throw new Error("redirect"); }, sleep, () => clock)).rejects.toThrow("redirect");
    expect(slept).toEqual([450, 500]);
    await atLeast(600, async () => { clock += 900; }, sleep, () => clock);
    expect(slept).toHaveLength(2);
  });

  it("afterAnswer leaves the work for after the answer, and runs it now outside a request", async () => {
    const later: (() => Promise<void>)[] = [];
    let done = 0;
    await afterAnswer(async () => { done += 1; }, (task) => { later.push(task); });
    expect(done).toBe(0);
    await later[0]();
    expect(done).toBe(1);
    await afterAnswer(async () => { done += 1; }, () => { throw new Error("outside a request scope"); });
    expect(done).toBe(2);
    // A failure is only written to the log.
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(afterAnswer(async () => { throw new Error("SMS down"); }, () => { throw new Error("outside"); })).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

/** Takes the newest logged code if there is one (so a later takeLoggedCode is the next code), else "". */
function takeSafe(): string {
  try {
    return takeLoggedCode();
  } catch {
    return "";
  }
}
