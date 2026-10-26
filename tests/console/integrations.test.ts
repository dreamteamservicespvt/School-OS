// A school's other connections (Google, Microsoft, Tally, printers, CCTV, LMS, IoT,
// webhooks, GPS, attendance devices) are set up by DREAM TEAM from the console
// (07-super-admin.md §3.8). Support cannot change them; Onboarding can, and the
// school's Audit Log says it was DREAM TEAM, with the person's name.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined), set: (name: string, value: string) => { jar.set(name, value); }, delete: (name: string) => { jar.delete(name); } }),
  headers: async () => new Headers({ "user-agent": "vitest" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT ${url}`); },
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

import { randomUUID } from "node:crypto";
import type { ConsoleRole, SuperAdminUser } from "@prisma/client";
import { withConsole, withConsoleSchool, withSchool } from "@/lib/db";
import { hashToken, newToken } from "@/lib/auth/tokens";
import { hashPassword } from "@/lib/auth/password";
import { CONSOLE_COOKIE } from "@/lib/console/auth";
import { connectIntegrationAction, disconnectIntegrationAction, retestIntegrationAction } from "@/app/console/(app)/schools/[id]/connections/integration-actions";
import { makeSchool, PASSWORD } from "../helpers";

type School = Awaited<ReturnType<typeof makeSchool>>;
let school: School;
const people = {} as Record<ConsoleRole, SuperAdminUser>;

const mobile = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;

async function asConsole(u: SuperAdminUser) {
  const token = newToken();
  await withConsole((tx) => tx.consoleSession.create({ data: { userId: u.id, tokenHash: hashToken(token), lastUsedAt: new Date(), expiresAt: new Date(Date.now() + 30 * 60_000) } }));
  jar.clear();
  jar.set(CONSOLE_COOKIE, token);
}

const row = () => withSchool({ schoolId: school.id, userId: null }, (tx) => tx.integration.findUnique({ where: { schoolId_key: { schoolId: school.id, key: "attendance-devices" } } }));
const audits = () => withSchool({ schoolId: school.id, userId: null }, (tx) => tx.auditLogEntry.findMany({ where: { recordType: "Integration" }, orderBy: { at: "asc" } }));
// No web address in these details, so the test makes no outside call.
const DEVICES = { brand: "eSSL", serials: "SN-1001, SN-1002", location: "Main gate" };

beforeAll(async () => {
  school = await makeSchool("Console Integrations School");
  await withConsoleSchool(school.id, (tx) => tx.consoleSchool.create({ data: { id: school.id, code: school.code, name: school.name, city: "Hyderabad", state: "Telangana", status: "TRIAL", statusSince: new Date(), startedAs: "TRIAL" } }));
  for (const r of ["ONBOARDING", "SUPPORT"] as ConsoleRole[]) {
    people[r] = await withConsole(async (tx) => tx.superAdminUser.create({ data: { name: `${r} ${randomUUID().slice(0, 4)}`, phone: mobile(), role: r, status: "ACTIVE", passwordHash: await hashPassword(PASSWORD) } }));
  }
});

beforeEach(() => jar.clear());

describe("console: a school's other connections", () => {
  it("refuses a Support person: nothing is saved", async () => {
    await asConsole(people.SUPPORT);
    const r = await connectIntegrationAction(school.id, "attendance-devices", DEVICES);
    expect(r?.ok).toBe(false);
    expect(r?.message).toMatch(/Your console role cannot do this/);
    expect((await retestIntegrationAction(school.id, "attendance-devices")).message).toMatch(/Your console role cannot do this/);
    expect(await disconnectIntegrationAction(school.id, "attendance-devices")).toMatch(/Your console role cannot do this/);
    expect(await row()).toBeNull();
    expect(await audits()).toHaveLength(0);
  });

  it("refuses a bad school id and an unknown connection", async () => {
    await asConsole(people.ONBOARDING);
    expect((await connectIntegrationAction("not-a-school", "attendance-devices", DEVICES))?.message).toMatch(/school was not found/);
    expect((await connectIntegrationAction(school.id, "no-such-thing", {}))?.message).toMatch(/not found/);
  });

  it("lets Onboarding connect, test and disconnect, each in the school's Audit Log as DREAM TEAM", async () => {
    await asConsole(people.ONBOARDING);
    const missing = await connectIntegrationAction(school.id, "attendance-devices", { brand: "", serials: "" });
    expect(missing?.ok).toBe(false);
    expect(missing?.errors?.brand).toMatch(/needed/);

    const r = await connectIntegrationAction(school.id, "attendance-devices", DEVICES);
    expect(r).toEqual({ ok: true });
    const saved = await row();
    expect(saved?.status).toBe("connected");
    expect(saved?.config).toMatchObject(DEVICES);

    expect((await retestIntegrationAction(school.id, "attendance-devices")).ok).toBe(true);
    expect(await disconnectIntegrationAction(school.id, "attendance-devices")).toBeUndefined();
    expect((await row())?.status).toBe("not-connected");

    const lines = await audits();
    expect(lines.map((l) => l.action)).toEqual(["connected-integration", "tested-integration", "disconnected-integration"]);
    for (const l of lines) {
      expect(l.userLoginId).toBeNull();
      expect(l.actorNote).toBe(`DREAM TEAM: ${people.ONBOARDING.name}`);
    }

    const activity = await withConsole((tx) => tx.consoleActivityEntry.findMany({ where: { forSchoolId: school.id, type: "connect" }, orderBy: { at: "asc" } }));
    expect(activity.map((a) => a.text)).toEqual([
      `Attendance devices details saved (test passed) for ${school.name}.`,
      `Attendance devices test passed for ${school.name}.`,
      `Attendance devices disconnected for ${school.name}.`,
    ]);
    expect(activity.every((a) => a.actorId === people.ONBOARDING.id)).toBe(true);
  });
});
