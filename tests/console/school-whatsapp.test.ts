// WhatsApp for a school, chosen in the console (testing 2026-11-05, B1 and B2):
// Add School offers DREAM TEAM's shared number (the default; IDs and token from
// the server's environment, never the database) or the school's own WhatsApp
// Business number (its access token stored encrypted, never in the Audit Log).
// The sender uses the right credentials for each school, Meta's reports for
// the shared number reach the school message they belong to, and the console
// card counts the school's WhatsApp: number, status, sent, failed, credits used
// and the last error.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ "user-agent": "vitest" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

import { createHmac, randomUUID } from "node:crypto";
import type { SuperAdminUser } from "@prisma/client";
import { withConsole, withSchool } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { actorOf } from "@/lib/console/auth";
import { addSchool, ConsoleProblem, type AddSchoolInput } from "@/lib/console/schools";
import { measureSchool } from "@/lib/console/measure";
import { readWhatsappChoice, whatsappChoiceProblem, type SchoolWhatsappChoice } from "@/lib/console/school-whatsapp";
import { istStarts, readWhatsappSummary, whatsappHealth, type WhatsappSummary } from "@/lib/console/whatsapp-usage";
import { channelSecrets, channelSetups, whatsappIsLive } from "@/lib/messaging/channels";
import { inTestMode, providerFor } from "@/lib/messaging/providers";
import { PASSWORD } from "../helpers";

let onboarding: SuperAdminUser;
const mobile = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
const own = (x: Partial<SchoolWhatsappChoice> = {}): SchoolWhatsappChoice => ({ mode: "own", phoneNumberId: "123456789012345", businessAccountId: "998877665544332", displayNumber: "9876543210", accessToken: "EAAG-own-token-9876", appSecret: "", verifyToken: "", ...x });
const input = (whatsapp?: SchoolWhatsappChoice): AddSchoolInput => ({
  name: `WhatsApp Public School ${randomUUID().slice(0, 6)}`, city: "Warangal", state: "Telangana", board: "CBSE", schoolType: "Day school",
  phone: mobile(), email: null, approxStudents: 200, groupId: null, newGroupName: null,
  adminName: "Anjali Rao", adminMobile: mobile(), adminEmail: null, adminRole: "school-admin", channels: ["sms"],
  startAs: "TRIAL", planKey: "essential", hostel: false, optionalOn: [], whatsapp,
});
const ctxOf = (schoolId: string) => ({ schoolId, userId: null });

beforeAll(async () => {
  onboarding = await withConsole(async (tx) => tx.superAdminUser.create({ data: { name: `Onboarding ${randomUUID().slice(0, 4)}`, phone: mobile(), role: "ONBOARDING", status: "ACTIVE", passwordHash: await hashPassword(PASSWORD) } }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("the Add School WhatsApp choice", () => {
  it("reads the form, and checks the school's own number before anything is made", () => {
    const form: Record<string, string> = { whatsapp: "own", waPhoneNumberId: " 12345 ", waBusinessAccountId: "678", waDisplayNumber: "+91 98765 43210", waSecret_accessToken: "tok" };
    const c = readWhatsappChoice((k) => form[k] ?? "");
    expect(c).toMatchObject({ mode: "own", phoneNumberId: "12345", businessAccountId: "678", displayNumber: "9876543210", accessToken: "tok" });
    expect(readWhatsappChoice(() => "").mode).toBe("dream-team");
    expect(whatsappChoiceProblem(own())).toBeNull();
    expect(whatsappChoiceProblem(own({ phoneNumberId: "12ab" }))?.field).toBe("waPhoneNumberId");
    expect(whatsappChoiceProblem(own({ businessAccountId: "" }))?.field).toBe("waBusinessAccountId");
    expect(whatsappChoiceProblem(own({ displayNumber: "12345" }))?.field).toBe("waDisplayNumber");
    expect(whatsappChoiceProblem(own({ accessToken: "" }))?.field).toBe("waSecret_accessToken");
    expect(whatsappChoiceProblem({ ...own({ phoneNumberId: "bad" }), mode: "dream-team" })).toBeNull();
  });

  it("a wrong ID for the school's own number is refused and no school is made", async () => {
    const i = input(own({ phoneNumberId: "not-a-number" }));
    await expect(addSchool(actorOf(onboarding), i)).rejects.toBeInstanceOf(ConsoleProblem);
    expect(await withConsole((tx) => tx.consoleSchool.count({ where: { name: i.name } }))).toBe(0);
  });

  it("the school's own number: sends for real with its own IDs; the token is encrypted and never in the Audit Log", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    const made = await addSchool(actorOf(onboarding), input(own()));
    expect(made.whatsappProblem).toBeNull();
    const ctx = ctxOf(made.schoolId);
    const row = await withSchool(ctx, (tx) => tx.messagingChannel.findUniqueOrThrow({ where: { schoolId_channel: { schoolId: made.schoolId, channel: "whatsapp" } } }));
    expect([row.provider, row.isOn, row.environment]).toEqual(["meta-cloud", true, "live"]);
    expect(row.secretsEnc).not.toContain("EAAG-own-token-9876");
    const setup = (await withSchool(ctx, (tx) => channelSetups(tx, ctx))).whatsapp;
    expect(setup.config).toMatchObject({ phoneNumberId: "123456789012345", businessAccountId: "998877665544332", displayNumber: "9876543210" });
    expect((await withSchool(ctx, (tx) => channelSecrets(tx, ctx, "whatsapp"))).accessToken).toBe("EAAG-own-token-9876");
    const audit = await withSchool(ctx, (tx) => tx.auditLogEntry.findMany({ where: { schoolId: made.schoolId, recordType: "Messaging Channel" } }));
    expect(audit.length).toBeGreaterThan(0);
    expect(JSON.stringify(audit)).not.toContain("EAAG-own-token-9876");
    const line = await withConsole((tx) => tx.consoleActivityEntry.findFirstOrThrow({ where: { forSchoolId: made.schoolId, type: "connect" } }));
    expect(line.text).toMatch(/school's own number/);
  });

  it("DREAM TEAM's number, not set up on the server: chosen, but WhatsApp stays off", async () => {
    vi.stubEnv("CONSOLE_WHATSAPP_PHONE_NUMBER_ID", "");
    vi.stubEnv("CONSOLE_WHATSAPP_ACCESS_TOKEN", "");
    const made = await addSchool(actorOf(onboarding), input());
    const ctx = ctxOf(made.schoolId);
    const setup = (await withSchool(ctx, (tx) => channelSetups(tx, ctx))).whatsapp;
    expect([setup.provider, setup.isOn, setup.environment]).toEqual(["dream-team", false, "test"]);
    expect(inTestMode(setup)).toBe(true);
  });

  it("DREAM TEAM's number, set up: the school sends with the shared IDs and token from the environment, none stored", async () => {
    vi.stubEnv("CONSOLE_WHATSAPP_PHONE_NUMBER_ID", "555000111");
    vi.stubEnv("CONSOLE_WHATSAPP_ACCESS_TOKEN", "shared-token-1234");
    vi.stubEnv("CONSOLE_WHATSAPP_BUSINESS_ACCOUNT_ID", "777000222");
    vi.stubEnv("CONSOLE_WHATSAPP_DISPLAY_NUMBER", "9123456780");
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => { calls.push(String(url)); return new Response(JSON.stringify({ data: [], messages: [{ id: "wamid.shared-1" }] }), { status: 200 }); });
    const made = await addSchool(actorOf(onboarding), input());
    const ctx = ctxOf(made.schoolId);
    const row = await withSchool(ctx, (tx) => tx.messagingChannel.findUniqueOrThrow({ where: { schoolId_channel: { schoolId: made.schoolId, channel: "whatsapp" } } }));
    expect([row.provider, row.isOn, row.environment, row.secretsEnc]).toEqual(["dream-team", true, "live", null]);
    expect(row.config).toEqual({});
    const setup = (await withSchool(ctx, (tx) => channelSetups(tx, ctx))).whatsapp;
    expect(setup.config).toEqual({ phoneNumberId: "555000111", businessAccountId: "777000222", displayNumber: "9123456780" });
    expect(whatsappIsLive(setup)).toBe(true);
    const secrets = await withSchool(ctx, (tx) => channelSecrets(tx, ctx, "whatsapp"));
    expect(secrets).toEqual({ accessToken: "shared-token-1234" });
    // The sender goes to Meta with the shared number.
    const r = await providerFor(setup, secrets).send({ channel: "whatsapp", to: "9876500001", text: "hi", whatsappTemplate: { name: "t", language: "en", params: [] } });
    expect(r.ok).toBe(true);
    expect(calls.at(-1)).toContain("/555000111/messages");
  });
});

describe("the console card's WhatsApp", () => {
  const SECRET = "shared-app-secret-1";
  const signed = (body: string) => `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;

  it("counts sent, failed, credits used and the last error; Meta's report for the shared number reaches the school's message", async () => {
    vi.stubEnv("CONSOLE_WHATSAPP_PHONE_NUMBER_ID", "555000111");
    vi.stubEnv("CONSOLE_WHATSAPP_ACCESS_TOKEN", "shared-token-1234");
    vi.stubEnv("CONSOLE_WHATSAPP_APP_SECRET", SECRET);
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    const made = await addSchool(actorOf(onboarding), input());
    const schoolId = made.schoolId;
    const ctx = ctxOf(schoolId);
    const wamid = `wamid.${randomUUID()}`;
    await withSchool(ctx, async (tx) => {
      const m = await tx.message.create({ data: { schoolId, body: "Holiday tomorrow", channels: ["whatsapp"], audienceLabel: "Test parents", status: "SENT" } });
      await tx.messageRecipient.create({ data: { schoolId, messageId: m.id, recipientType: "guardian", name: "Parent One", channel: "whatsapp", address: "9876500001", text: "Holiday tomorrow", status: "SENT", sentAt: new Date(), providerMessageId: wamid } });
      await tx.messageRecipient.create({ data: { schoolId, messageId: m.id, recipientType: "guardian", name: "Parent Two", channel: "whatsapp", address: "9876500002", text: "Holiday tomorrow", status: "FAILED", failedAt: new Date(), failReason: "Number not on WhatsApp." } });
      await tx.creditLedgerEntry.create({ data: { schoolId, channel: "whatsapp", amount: -2, note: "Holiday", messageId: m.id } });
      await tx.creditLedgerEntry.create({ data: { schoolId, channel: "whatsapp", amount: 1, note: "Back: not sent", messageId: m.id } });
    });
    await measureSchool(schoolId);
    const card = await withConsole((tx) => tx.consoleSchool.findUniqueOrThrow({ where: { id: schoolId } }));
    const w = readWhatsappSummary(card.whatsapp)!;
    expect(w).toMatchObject({ mode: "dream-team", isOn: true, live: true, ready: true, sentToday: 1, sentMonth: 1, failedToday: 1, failedMonth: 1, creditsUsedMonth: 1, lastError: "Number not on WhatsApp." });
    expect(whatsappHealth(w).key).toBe("failing");

    // Meta's delivery report for the shared number comes to the console's webhook address.
    const { handleConsoleWhatsappWebhook } = await import("@/lib/console/whatsapp-webhook");
    const body = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "waba", changes: [{ field: "messages", value: { metadata: { phone_number_id: "555000111" }, statuses: [{ id: wamid, status: "delivered", timestamp: "1790000000" }] } }] }] });
    expect((await handleConsoleWhatsappWebhook(body, signed(body))).status).toBe(200);
    const after = await withSchool(ctx, (tx) => tx.messageRecipient.findFirstOrThrow({ where: { providerMessageId: wamid } }));
    expect(after.status).toBe("DELIVERED");
    // A report for another number on the same Meta app changes nothing here.
    const other = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "waba", changes: [{ field: "messages", value: { metadata: { phone_number_id: "999" }, statuses: [{ id: wamid, status: "read", timestamp: "1790000100" }] } }] }] });
    await handleConsoleWhatsappWebhook(other, signed(other));
    expect((await withSchool(ctx, (tx) => tx.messageRecipient.findFirstOrThrow({ where: { providerMessageId: wamid } }))).status).toBe("DELIVERED");
  });

  it("says working, failing, not set up, test mode or off in plain words", () => {
    const base: WhatsappSummary = { mode: "own", isOn: true, live: true, ready: true, number: null, sentToday: 3, sentMonth: 9, failedToday: 0, failedMonth: 1, creditsUsedMonth: 9, creditsLeft: 400, lastError: null, lastErrorAt: null, lastSentAt: null };
    expect(whatsappHealth(null).label).toBe("Not counted yet");
    expect(readWhatsappSummary({})).toBeNull();
    expect(whatsappHealth(base).label).toBe("Working");
    expect(whatsappHealth({ ...base, failedToday: 3 }).label).toBe("Failing");
    expect(whatsappHealth({ ...base, ready: false }).label).toBe("Not set up");
    expect(whatsappHealth({ ...base, live: false }).label).toBe("Test mode");
    expect(whatsappHealth({ ...base, isOn: false }).label).toBe("Off");
  });

  it("counts today and this month in Indian time", () => {
    const { day, month } = istStarts(new Date("2026-11-05T20:00:00Z")); // 6 Nov, 01:30 in India
    expect(day.toISOString()).toBe("2026-11-05T18:30:00.000Z");
    expect(month.toISOString()).toBe("2026-10-31T18:30:00.000Z");
  });
});
