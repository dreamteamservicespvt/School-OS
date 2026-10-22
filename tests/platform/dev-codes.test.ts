// One-time codes on a tester's own computer (src/lib/dev-codes.ts). Testers
// read every code that is sent from the server log, one line each, on a
// development server, or under `next start` with APP_URL on this computer
// while messages are in Test mode. A production build with real providers, or
// a live server, never writes a code.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const mail = vi.hoisted(() => ({ on: false, sent: [] as string[] }));
vi.mock("@/lib/auth/mail", () => ({ mailIsSetUp: () => mail.on, sendMail: async (to: string) => { mail.sent.push(to); } }));

import { withSchool } from "@/lib/db";
import { contactForLog, logOneTimeCode, mayLogCode } from "@/lib/dev-codes";
import { deliverCodeTo } from "@/lib/auth/two-step";
import { signInSmsTemplate } from "@/lib/auth/two-step-sms";
import { checkCode, createAndSend, createLink, hashToken, newDeviceKey, sendCode, tokenFor } from "@/lib/parent-link/links";
import { runDueJobs } from "@/lib/jobs";
import { DELIVER_JOB } from "@/lib/messaging/send";
import "@/lib/job-registry";
import { addDlt, makeCommSchool } from "../communication/fixture";
import { makeUser } from "../helpers";

const LIVE = "https://app.schoolos.in";
const HERE = "http://localhost:3000";

function server(nodeEnv: "production" | "development", appUrl: string) {
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("APP_URL", appUrl);
}

let lines: string[] = [];
function watchLog() {
  lines = [];
  vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => { lines.push(args.map(String).join(" ")); });
}
const devLines = () => lines.filter((l) => l.startsWith("[dev] "));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  mail.on = false;
});

describe("when a code may be written to the log", () => {
  it("writes one line for each code on a development server", () => {
    watchLog();
    server("development", LIVE);
    expect(logOneTimeCode({ to: "+91 98765 43210", purpose: "sign-in", code: "123456", carriedBy: "real" })).toBe(true);
    expect(lines).toEqual(["[dev] one-time code for xxxxxx3210 (sign-in): 123456"]);
    expect(contactForLog("ravi.kumar@example.com")).toBe("ra***@example.com");
  });

  it("never writes a code a real provider carried on a production build, wherever it runs", () => {
    watchLog();
    for (const url of [LIVE, HERE, ""]) {
      server("production", url);
      expect(mayLogCode("real")).toBe(false);
      expect(logOneTimeCode({ to: "9876543210", purpose: "sign-in", code: "999111", carriedBy: "real" })).toBe(false);
    }
    expect(lines).toEqual([]);
  });

  it("on a production build, writes what Test mode or nothing carried only when APP_URL is this computer", () => {
    for (const url of [LIVE, "", "https://localhost.example.com", "not a url"]) {
      server("production", url);
      expect(mayLogCode("test")).toBe(false);
      expect(mayLogCode("none")).toBe(false);
    }
    for (const url of [HERE, "http://127.0.0.1:3000", "http://school.localhost:3000"]) {
      server("production", url);
      expect(mayLogCode("test")).toBe(true);
      expect(mayLogCode("none")).toBe(true);
    }
  });
});

describe("sign-in codes", () => {
  it("are emailed and never written on a production build, also on this computer", async () => {
    mail.on = true;
    for (const url of [LIVE, HERE]) {
      watchLog();
      server("production", url);
      const r = await deliverCodeTo({ email: "principal@example.com", phone: null, name: "Principal" }, "246810");
      expect(r).toMatchObject({ channel: "email" });
      expect(lines.some((l) => l.includes("246810"))).toBe(false);
    }
  });

  it("with nothing set up: a live server writes nothing and says no code can reach them; this computer writes it", async () => {
    watchLog();
    server("production", LIVE);
    expect(await deliverCodeTo({ email: "principal@example.com", phone: null, name: "Principal" }, "135790")).toMatchObject({ unreachable: true });
    expect(lines.some((l) => l.includes("135790"))).toBe(false);
    server("production", HERE);
    expect(await deliverCodeTo({ email: "principal@example.com", phone: null, name: "Principal" }, "135790")).toMatchObject({ channel: "log" });
    expect(devLines()).toEqual(["[dev] one-time code for pr***@example.com (sign-in): 135790"]);
  });
});

describe("codes and links sent through the school's channels", () => {
  let s: Awaited<ReturnType<typeof makeCommSchool>>;
  beforeAll(async () => {
    s = await makeCommSchool();
    await addDlt(s.ctx, "sign-in-code");
  }, 120_000);

  it("two-step by SMS in Test mode: not on a live server (no code would arrive), read from the log on this computer", async () => {
    const person = await makeUser({ schools: [{ id: s.school.id, roleKeys: ["principal"] }], name: "Phone Principal" });
    const ctx = { schoolId: s.school.id, userId: person.id };
    server("production", LIVE);
    expect(await withSchool(ctx, (tx) => signInSmsTemplate(tx, ctx))).toBeNull();
    server("production", HERE);
    expect(await withSchool(ctx, (tx) => signInSmsTemplate(tx, ctx))).not.toBeNull();
    watchLog();
    const r = await deliverCodeTo({ email: null, phone: "+91 98765 43210", name: "Phone Principal", schoolId: s.school.id, userLoginId: person.id, key: `dev-codes-${person.id}`.slice(0, 40) }, "112233");
    expect(r).toMatchObject({ channel: "sms" });
    expect(devLines()).toEqual(["[dev] one-time code for xxxxxx3210 (sign-in): 112233"]);
  });

  it("a Parent Link code in Test mode on this computer: the code in the log confirms the phone; a live server writes none", async () => {
    const link = await withSchool(s.ctx, (tx) => createLink(tx, s.ctx, s.mother.id));
    const key = hashToken(newDeviceKey());
    watchLog();
    server("production", LIVE);
    await withSchool(s.ctx, (tx) => sendCode(tx, s.ctx, link.id, "device", { keyHash: key }));
    expect(devLines()).toEqual([]);
    server("production", HERE);
    await withSchool(s.ctx, (tx) => sendCode(tx, s.ctx, link.id, "device", { keyHash: key }));
    const [line] = devLines();
    expect(line).toMatch(/^\[dev\] one-time code for xxxxxx\d{4} \(Parent Link, new phone\): \d{6}$/);
    const code = line.slice(-6);
    expect(await withSchool(s.ctx, (tx) => checkCode(tx, s.ctx, link.id, "device", code, key))).toMatchObject({ ok: true });
  });

  it("a Parent Link code a real provider carries is never written, even on this computer", async () => {
    const real = await makeCommSchool();
    await addDlt(real.ctx, "parent-link-code");
    await withSchool(real.ctx, (tx) => tx.messagingChannel.update({ where: { schoolId_channel: { schoolId: real.school.id, channel: "sms" } }, data: { provider: "msg91", environment: "live" } }));
    const link = await withSchool(real.ctx, (tx) => createLink(tx, real.ctx, real.father.id));
    watchLog();
    server("production", HERE);
    await withSchool(real.ctx, (tx) => sendCode(tx, real.ctx, link.id, "device", { keyHash: hashToken(newDeviceKey()) }));
    expect(devLines()).toEqual([]);
    // Nothing is ever handed to the real provider from a test.
    await withSchool(real.ctx, (tx) => tx.backgroundJob.updateMany({ where: { status: "queued" }, data: { status: "done" } }));
  });

  it("a Parent Link that Test mode does not send is in the log on this computer, never on a live server", async () => {
    const send = async (guardianId: string) => {
      const link = await withSchool(s.ctx, (tx) => createAndSend(tx, s.ctx, guardianId));
      for (let i = 0; i < 5; i++) if ((await runDueJobs(50, { schoolId: s.school.id, kinds: [DELIVER_JOB] })) === 0) break;
      return link;
    };
    watchLog();
    server("production", LIVE);
    await send(s.teluguMother.id);
    expect(devLines()).toEqual([]);
    server("production", HERE);
    const link = await send(s.otherFather.id);
    expect(devLines()).toEqual([expect.stringMatching(new RegExp(`^\\[dev\\] Parent Link for xxxxxx\\d{4} \\(Test mode, not sent\\): ${HERE}/p/${tokenFor(link.id)}$`))]);
  });
});
