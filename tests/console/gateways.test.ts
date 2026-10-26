// Console, a school's Connections, Payment gateways (07-super-admin.md §3.8): DREAM TEAM
// adds the school's gateway from the console; the school only sees it. The server refuses
// a console role without "connect" (Support), and an Onboarding person's save lands on the
// school's own rows with their name in the school's Audit Log and one console Activity line.
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
import { saveGateway, switchGateway, testDetails } from "@/app/console/(app)/schools/[id]/connections/gateways/actions";
import { makeSchool, PASSWORD } from "../helpers";

let school: Awaited<ReturnType<typeof makeSchool>>;
const people = {} as Record<ConsoleRole, SuperAdminUser>;
const mobile = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;

async function asConsole(u: SuperAdminUser) {
  const token = newToken();
  await withConsole((tx) => tx.consoleSession.create({ data: { userId: u.id, tokenHash: hashToken(token), lastUsedAt: new Date(), expiresAt: new Date(Date.now() + 30 * 60_000) } }));
  jar.clear();
  jar.set(CONSOLE_COOKIE, token);
}

const gatewayForm = (id: string, name: string) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ id, mode: "new", provider: "razorpay", displayName: name, environment: "test", f_keyId: "rzp_test_1DP5mmOlF5G5ag", f_keySecret: "thisIsTheSecretKey9x2Q", webhookSecret: "webhook-secret-abcd" })) fd.set(k, v);
  return fd;
};
const gateways = () => withSchool({ schoolId: school.id, userId: null }, (tx) => tx.paymentGatewayAccount.findMany());

beforeAll(async () => {
  school = await makeSchool("Console Gateway School");
  await withConsoleSchool(school.id, (tx) => tx.consoleSchool.create({ data: { id: school.id, code: school.code, name: school.name, city: "Hyderabad", state: "Telangana", status: "TRIAL", statusSince: new Date(), startedAs: "TRIAL" } }));
  for (const r of ["ONBOARDING", "SUPPORT"] as ConsoleRole[]) {
    people[r] = await withConsole(async (tx) => tx.superAdminUser.create({ data: { name: `${r} ${randomUUID().slice(0, 4)}`, phone: mobile(), role: r, status: "ACTIVE", passwordHash: await hashPassword(PASSWORD) } }));
  }
});

beforeEach(() => jar.clear());

describe("console payment gateways", () => {
  it("refuses a Support console person: nothing is saved, tested or switched", async () => {
    await asConsole(people.SUPPORT);
    const saved = await saveGateway(school.id, null, gatewayForm(randomUUID(), "Razorpay Support"));
    expect(saved?.ok).toBe(false);
    expect(saved?.message).toMatch(/Your console role cannot do this/);
    expect(JSON.stringify(saved)).not.toContain("thisIsTheSecretKey9x2Q");
    const tested = await testDetails(school.id, null, gatewayForm(randomUUID(), "Razorpay Support"));
    expect(tested?.ok).toBe(false);
    expect(tested?.message).toMatch(/Your console role cannot do this/);
    expect(await switchGateway(school.id, randomUUID(), true, "x")).toMatch(/Your console role cannot do this/);
    expect(await gateways()).toHaveLength(0);
  });

  it("saves for an Onboarding person, switched off, with their name in the school's Audit Log and a console Activity line", async () => {
    await asConsole(people.ONBOARDING);
    const id = randomUUID();
    await expect(saveGateway(school.id, null, gatewayForm(id, "Razorpay"))).rejects.toThrow(`REDIRECT /console/schools/${school.id}/connections/gateways/${id}`);
    const [g] = await gateways();
    expect(g).toMatchObject({ id, displayName: "Razorpay", isActive: false, environment: "test", createdById: null });
    expect(g.secretsEnc).not.toContain("thisIsTheSecretKey9x2Q");
    const audit = await withSchool({ schoolId: school.id, userId: null }, (tx) => tx.auditLogEntry.findMany({ where: { recordId: id } }));
    expect(audit.map((a) => [a.action, a.actorNote, a.userLoginId])).toEqual([["created", `DREAM TEAM: ${people.ONBOARDING.name}`, null]]);
    const log = await withConsole((tx) => tx.consoleActivityEntry.findMany({ where: { forSchoolId: school.id, type: "connect" } }));
    expect(log.map((l) => l.text)).toEqual([`Payment gateway Razorpay added (test mode, switched off) for ${school.name}.`]);
  });

  it("refuses a bad school id before anything runs", async () => {
    await asConsole(people.ONBOARDING);
    const r = await saveGateway("not-a-school", null, gatewayForm(randomUUID(), "Razorpay 2"));
    expect(r?.message).toMatch(/This school was not found/);
  });
});
