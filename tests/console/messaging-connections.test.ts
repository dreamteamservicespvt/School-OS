// DREAM TEAM sets up a school's SMS, WhatsApp and email from the console
// (07-super-admin.md §3.6): only the Owner and Onboarding may, the Audit Log
// names the DREAM TEAM person, and the school's own Settings only switches a
// channel on or off. DLT template IDs come from the console, and the school's
// own template save keeps them while the text is unchanged.
import { beforeAll, describe, expect, it, vi } from "vitest";

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
import { withConsole, withSchool } from "@/lib/db";
import { hashToken, newToken } from "@/lib/auth/tokens";
import { hashPassword } from "@/lib/auth/password";
import { CONSOLE_COOKIE } from "@/lib/console/auth";
import { saveTemplate } from "@/lib/communication/templates-admin";
import { saveChannelChoices } from "@/lib/messaging/channel-admin";
import { channelSecrets } from "@/lib/messaging/channels";
import { addCreditsAction, saveChannelAction, saveSmsDltIdAction } from "@/app/console/(app)/schools/[id]/connections/actions";
import { makeCommSchool } from "../communication/fixture";
import { PASSWORD } from "../helpers";

let s: Awaited<ReturnType<typeof makeCommSchool>>;
const people = {} as Record<ConsoleRole, SuperAdminUser>;
const mobile = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;

async function asConsole(u: SuperAdminUser) {
  const token = newToken();
  await withConsole((tx) => tx.consoleSession.create({ data: { userId: u.id, tokenHash: hashToken(token), lastUsedAt: new Date(), expiresAt: new Date(Date.now() + 30 * 60_000) } }));
  jar.clear();
  jar.set(CONSOLE_COOKIE, token);
}

const whatsapp = { provider: "meta-cloud", live: false, isOn: true, config: { phoneNumberId: "123456789012345", businessAccountId: "998877665544332", displayNumber: "9876543210" }, secrets: { accessToken: "EAAG-token-secret-4321" }, lowCreditAlert: 100 };

beforeAll(async () => {
  s = await makeCommSchool();
  for (const r of ["OWNER", "ONBOARDING", "SUPPORT"] as ConsoleRole[]) {
    people[r] = await withConsole(async (tx) => tx.superAdminUser.create({ data: { name: `${r} ${randomUUID().slice(0, 4)}`, phone: mobile(), role: r, status: "ACTIVE", passwordHash: await hashPassword(PASSWORD) } }));
  }
});

describe("messaging connections in the console", () => {
  it("Support cannot connect a channel or add credits, and nothing changes", async () => {
    await asConsole(people.SUPPORT);
    const before = await withSchool(s.ctx, (tx) => tx.messagingChannel.findUnique({ where: { schoolId_channel: { schoolId: s.school.id, channel: "whatsapp" } } }));
    const r = await saveChannelAction(s.school.id, "whatsapp", whatsapp);
    expect(r?.ok).toBe(false);
    expect(r?.message).toMatch(/console role cannot/i);
    expect(await addCreditsAction(s.school.id, "sms", 500, "Pack bought")).toMatch(/console role cannot/i);
    const after = await withSchool(s.ctx, (tx) => tx.messagingChannel.findUnique({ where: { schoolId_channel: { schoolId: s.school.id, channel: "whatsapp" } } }));
    expect(after?.updatedAt).toEqual(before?.updatedAt);
  });

  it("Onboarding connects WhatsApp: the key is encrypted, the Audit Log names DREAM TEAM, and the console logs it", async () => {
    await asConsole(people.ONBOARDING);
    expect(await saveChannelAction(s.school.id, "whatsapp", whatsapp)).toEqual({ ok: true });
    expect((await withSchool(s.ctx, (tx) => channelSecrets(tx, s.ctx, "whatsapp"))).accessToken).toBe("EAAG-token-secret-4321");
    const audit = await withSchool(s.ctx, (tx) => tx.auditLogEntry.findFirstOrThrow({ where: { schoolId: s.school.id, recordType: "Messaging Channel" }, orderBy: { at: "desc" } }));
    expect(audit.userLoginId).toBeNull();
    expect(audit.actorNote).toBe(`DREAM TEAM: ${people.ONBOARDING.name}`);
    expect(JSON.stringify(audit)).not.toContain("EAAG-token-secret-4321");
    const line = await withConsole((tx) => tx.consoleActivityEntry.findFirstOrThrow({ where: { forSchoolId: s.school.id, type: "connect" }, orderBy: { at: "desc" } }));
    expect(line.text).toMatch(/^WhatsApp settings saved .* for /);
    expect(line.actorName).toBe(people.ONBOARDING.name);
  });

  it("the school only switches the channel on or off and sets its alert; the provider and key stay", async () => {
    const errors = await withSchool(s.ctx, (tx) => saveChannelChoices(tx, s.ctx, "whatsapp", { isOn: false, lowCreditAlert: 40 }));
    expect(errors).toEqual({});
    const row = await withSchool(s.ctx, (tx) => tx.messagingChannel.findUniqueOrThrow({ where: { schoolId_channel: { schoolId: s.school.id, channel: "whatsapp" } } }));
    expect([row.provider, row.isOn, row.lowCreditAlert]).toEqual(["meta-cloud", false, 40]);
    expect((await withSchool(s.ctx, (tx) => channelSecrets(tx, s.ctx, "whatsapp"))).accessToken).toBe("EAAG-token-secret-4321");
    expect((await withSchool(s.ctx, (tx) => saveChannelChoices(tx, s.ctx, "whatsapp", { isOn: true, lowCreditAlert: -1 }))).lowCreditAlert).toBeTruthy();
  });

  it("the school cannot switch SMS on before DREAM TEAM adds the DLT registration", async () => {
    const other = await makeCommSchool({ channelsOn: false });
    await withSchool(other.ctx, (tx) => tx.school.update({ where: { id: other.school.id }, data: { smsDltEntityId: null, smsSenderHeader: null } }));
    const errors = await withSchool(other.ctx, (tx) => saveChannelChoices(tx, other.ctx, "sms", { isOn: true, lowCreditAlert: 100 }));
    expect(errors.isOn).toMatch(/DREAM TEAM/);
  });
});

describe("SMS template DLT IDs", () => {
  it("DREAM TEAM adds the ID; the school's save keeps it for the same text and drops it for a changed text", async () => {
    const texts = (body: string) => [{ language: "en", subject: null, body }];
    const { id } = await withSchool(s.ctx, (tx) => saveTemplate(tx, s.ctx, null, { name: `Bus late ${randomUUID().slice(0, 4)}`, category: "transport", channel: "sms", texts: texts("The bus is late today. {school_name}") }));
    const v1 = await withSchool(s.ctx, (tx) => tx.templateVersion.findFirstOrThrow({ where: { templateId: id, isCurrent: true } }));
    expect(v1.dltTemplateId).toBeNull();

    await asConsole(people.SUPPORT);
    expect(await saveSmsDltIdAction(s.school.id, v1.id, "1107161765432109876")).toMatch(/console role cannot/i);
    await asConsole(people.OWNER);
    expect(await saveSmsDltIdAction(s.school.id, v1.id, "bad id!")).toMatch(/only letters and numbers/);
    expect(await saveSmsDltIdAction(s.school.id, v1.id, "1107161765432109876")).toBeUndefined();
    const v2 = await withSchool(s.ctx, (tx) => tx.templateVersion.findFirstOrThrow({ where: { templateId: id, isCurrent: true } }));
    expect([v2.version, v2.dltTemplateId, v2.body]).toEqual([2, "1107161765432109876", v1.body]);

    const same = await withSchool(s.ctx, (tx) => saveTemplate(tx, s.ctx, id, { name: "Bus late", category: "transport", channel: "sms", texts: texts(v1.body) }));
    expect(same.changed).toEqual([]);
    await withSchool(s.ctx, (tx) => saveTemplate(tx, s.ctx, id, { name: "Bus late", category: "transport", channel: "sms", texts: texts("The school bus is late today. {school_name}") }));
    const v3 = await withSchool(s.ctx, (tx) => tx.templateVersion.findFirstOrThrow({ where: { templateId: id, isCurrent: true } }));
    expect([v3.version, v3.dltTemplateId]).toEqual([3, null]);
  });
});
