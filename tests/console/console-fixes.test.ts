// Console bugs fixed with gap G35 (07-super-admin.md §3.1, §3.5, §3.6, §5):
// - a console person can change their own password (the check had its two values swapped);
// - a top-up raises the students paid for only when it is paid, never while it waits or once cancelled;
// - paying reactivates only a school the software suspended for an overdue invoice, and only when nothing else is overdue;
// - adding an admin again after they were disabled (or their invite cancelled) gives them a working invite;
// - the billing day carries on past a school it cannot finish, and never makes a year invoice twice;
// - an invite that was opened but never finished shows in Needs attention.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

import { createHmac, randomUUID } from "node:crypto";
import type { SuperAdminUser } from "@prisma/client";
import { prisma, withConsole, withConsoleSchool } from "@/lib/db";
import { hashToken, newToken } from "@/lib/auth/tokens";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { actorOf, CONSOLE_COOKIE } from "@/lib/console/auth";
import { addDays, cancelInvoice, istDay, markPaid, runBillingDay, startSubscription, topupInvoice, invoiceFor } from "@/lib/console/billing";
import { addAdmin, cancelInvite, changeStatus, disableAdmin } from "@/lib/console/schools";
import { attentionItems } from "@/lib/console/dashboard";
import { changePasswordAction } from "@/app/console/(app)/profile/actions";
import { makeSchool, makeUser, PASSWORD } from "../helpers";

let owner: SuperAdminUser;

const mobile = () => `9${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`;
const form = (o: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.set(k, v); return fd; };
const today = () => istDay(new Date());

async function teamMember(role: "OWNER" | "SUPPORT") {
  return withConsole(async (tx) => tx.superAdminUser.create({ data: { name: `${role} ${randomUUID().slice(0, 4)}`, phone: mobile(), role, status: "ACTIVE", passwordHash: await hashPassword(PASSWORD) } }));
}

async function asConsole(u: SuperAdminUser) {
  const token = newToken();
  const s = await withConsole((tx) => tx.consoleSession.create({ data: { userId: u.id, tokenHash: hashToken(token), lastUsedAt: new Date(), expiresAt: new Date(Date.now() + 30 * 60_000) } }));
  jar.clear();
  jar.set(CONSOLE_COOKIE, token);
  return s.id;
}

async function schoolWithCard(name: string, activeStudents = 0) {
  const s = await makeSchool(name);
  await withConsoleSchool(s.id, (tx) => tx.consoleSchool.create({ data: { id: s.id, code: s.code, name: s.name, city: "Nagpur", state: "Maharashtra", status: "ACTIVE", statusSince: new Date(), startedAs: "ACTIVE", activeStudents } }));
  return s;
}

const sub = (schoolId: string) => withConsole((tx) => tx.subscription.findUniqueOrThrow({ where: { forSchoolId: schoolId } }));
const status = async (schoolId: string) => (await withConsole((tx) => tx.consoleSchool.findUniqueOrThrow({ where: { id: schoolId } }))).status;
const invoices = (schoolId: string, kind: string) => withConsole((tx) => tx.platformInvoice.findMany({ where: { forSchoolId: schoolId, kind }, orderBy: { createdAt: "asc" } }));

/** A year invoice already sent and now overdue past its grace. */
async function overdueYearInvoice(schoolId: string, kind: "NEW" | "SECOND_HALF" | "RENEWAL", daysLate = 20) {
  const due = addDays(today(), -daysLate);
  return withConsole((tx) => tx.platformInvoice.create({
    data: { number: `T/${randomUUID().slice(0, 8)}`, forSchoolId: schoolId, kind, items: [], subtotalPaise: 100_000n, gstPaise: 18_000n, totalPaise: 118_000n, periodFrom: addDays(due, -1), issuedOn: addDays(due, -14), dueOn: due, status: "UNPAID", sentAt: addDays(due, -14) },
  }));
}

beforeAll(async () => {
  owner = await teamMember("OWNER");
});

beforeEach(() => jar.clear());

// Other console tests count the active Owners; this file's Owner leaves when it is done.
afterAll(async () => {
  await withConsole((tx) => tx.superAdminUser.update({ where: { id: owner.id }, data: { status: "DISABLED", disabledAt: new Date(), disabledReason: "test finished" } }));
});

describe("a console person's own password", () => {
  it("changes with the right current password, and other devices are signed out", async () => {
    const me = await teamMember("SUPPORT");
    const other = await withConsole((tx) => tx.consoleSession.create({ data: { userId: me.id, tokenHash: hashToken(newToken()), lastUsedAt: new Date(), expiresAt: new Date(Date.now() + 30 * 60_000) } }));
    const mine = await asConsole(me);
    const wrong = (await changePasswordAction(null, form({ current: "Not-my-pass-1", next: "Brand-new-77", again: "Brand-new-77" }))) as { ok: boolean; message?: string };
    expect(wrong.ok).toBe(false);
    expect(wrong.message).toMatch(/current password is not right/);
    const same = (await changePasswordAction(null, form({ current: PASSWORD, next: PASSWORD, again: PASSWORD }))) as { ok: boolean; message?: string };
    expect(same.ok).toBe(false);
    expect(same.message).toMatch(/not used here/);
    const ok = (await changePasswordAction(null, form({ current: PASSWORD, next: "Brand-new-77", again: "Brand-new-77" }))) as { ok: boolean; message?: string };
    expect(ok.ok, ok.message).toBe(true);
    const after = await withConsole((tx) => tx.superAdminUser.findUniqueOrThrow({ where: { id: me.id } }));
    expect(await verifyPassword(after.passwordHash!, "Brand-new-77")).toBe(true);
    expect(await verifyPassword(after.passwordHash!, PASSWORD)).toBe(false);
    expect((await withConsole((tx) => tx.consoleSession.findUniqueOrThrow({ where: { id: other.id } }))).revokedAt).not.toBeNull();
    expect((await withConsole((tx) => tx.consoleSession.findUniqueOrThrow({ where: { id: mine } }))).revokedAt).toBeNull();
  });
});

describe("top-up invoices", () => {
  it("raise the students paid for when paid, never while waiting or once cancelled", async () => {
    const s = await schoolWithCard("Topup Public School");
    await startSubscription(actorOf(owner), s.id, { planKey: "essential", hostel: false, buses: 0, students: 400, payIn: "YEARLY" });
    await withConsole((tx) => tx.consoleSchool.update({ where: { id: s.id }, data: { activeStudents: 450 } }));
    expect((await sub(s.id)).studentsPaidFor).toBe(400);

    const waiting = await topupInvoice(actorOf(owner), s.id, { waitForOk: true });
    expect((await sub(s.id)).studentsPaidFor).toBe(400);
    await cancelInvoice(actorOf(owner), waiting.invoiceId, "Made by mistake, checking numbers");
    expect((await sub(s.id)).studentsPaidFor).toBe(400);
    // With the top-up cancelled, "more students than paid for" is back in Needs attention.
    expect((await attentionItems()).some((a) => a.id === `over:${s.id}`)).toBe(true);

    const sent = await topupInvoice(actorOf(owner), s.id, { waitForOk: false });
    expect((await sub(s.id)).studentsPaidFor).toBe(400);
    await markPaid(actorOf(owner), sent.invoiceId, { via: "BANK", ref: "UTR77881122", receivedOn: today() });
    expect((await sub(s.id)).studentsPaidFor).toBe(450);
  });
});

describe("paying and a Suspended school", () => {
  it("a school suspended by hand stays suspended when an invoice is paid", async () => {
    const s = await schoolWithCard("Handheld Suspension School");
    await startSubscription(actorOf(owner), s.id, { planKey: "essential", hostel: false, buses: 0, students: 100, payIn: "YEARLY" });
    const late = await overdueYearInvoice(s.id, "SECOND_HALF");
    await changeStatus(actorOf(owner), s.id, "suspend", { reason: "Asked by the trust in writing, 8 Oct." });
    await invoiceFor(actorOf(owner), s.id, { kind: "CREDITS", credits: 4000 });
    const credits = (await invoices(s.id, "CREDITS"))[0];
    const r1 = await markPaid(actorOf(owner), credits.id, { via: "BANK", ref: "UTR10101010", receivedOn: today() });
    expect(r1.reactivated).toBe(false);
    const r2 = await markPaid(actorOf(owner), late.id, { via: "BANK", ref: "UTR20202020", receivedOn: today() });
    expect(r2.reactivated).toBe(false);
    expect(await status(s.id)).toBe("SUSPENDED");
  });

  it("a school the software suspended comes back when the last overdue invoice is paid, not before", async () => {
    const s = await schoolWithCard("Overdue Twice School");
    await startSubscription(actorOf(owner), s.id, { planKey: "essential", hostel: false, buses: 0, students: 100, payIn: "HALVES" });
    const first = await overdueYearInvoice(s.id, "RENEWAL", 40);
    const second = await overdueYearInvoice(s.id, "SECOND_HALF", 20);
    await changeStatus(null, s.id, "suspend", { reason: `Invoice ${first.number} unpaid 15 days after its date` }, new Date(), { system: true });
    // A credit pack is not the overdue invoice.
    await invoiceFor(actorOf(owner), s.id, { kind: "CREDITS", credits: 4000 });
    const credits = (await invoices(s.id, "CREDITS"))[0];
    expect((await markPaid(actorOf(owner), credits.id, { via: "BANK", ref: "UTR30303030", receivedOn: today() })).reactivated).toBe(false);
    expect((await markPaid(actorOf(owner), first.id, { via: "BANK", ref: "UTR40404040", receivedOn: today() })).reactivated).toBe(false);
    expect(await status(s.id)).toBe("SUSPENDED");
    expect((await markPaid(actorOf(owner), second.id, { via: "BANK", ref: "UTR50505050", receivedOn: today() })).reactivated).toBe(true);
    expect(await status(s.id)).toBe("ACTIVE");
    const school = await withConsoleSchool(s.id, (tx) => tx.school.findUniqueOrThrow({ where: { id: s.id } }));
    expect(school.status).toBe("ACTIVE");
  });
});

describe("adding an admin again", () => {
  it("after they were disabled: their login is switched back on, with no password, and a new invite goes", async () => {
    const s = await schoolWithCard("Readd Admin School");
    await makeUser({ schools: [{ id: s.id, roleKeys: ["school-admin"] }], name: "Stays Admin" });
    const m = mobile();
    await addAdmin(actorOf(owner), s.id, { name: "Leaving Admin", mobile: m, email: null, roleKey: "school-admin", channels: ["sms"], checked: null });
    const login = await prisma.userLogin.findUniqueOrThrow({ where: { username: m } });
    await prisma.userLogin.update({ where: { id: login.id }, data: { status: "ACTIVE", passwordHash: await hashPassword("Old-pass-11") } });
    await disableAdmin(actorOf(owner), s.id, login.id, "Left the school in October");
    expect((await prisma.userLogin.findUniqueOrThrow({ where: { id: login.id } })).status).toBe("DISABLED");

    await addAdmin(actorOf(owner), s.id, { name: "Leaving Admin", mobile: m, email: null, roleKey: "school-admin", channels: ["sms"], checked: null });
    const back = await prisma.userLogin.findUniqueOrThrow({ where: { id: login.id } });
    expect(back.status).toBe("INVITED");
    expect(back.passwordHash).toBeNull();
    const live = await withConsole((tx) => tx.schoolInvite.findMany({ where: { forSchoolId: s.id, userLoginId: login.id, usedAt: null, cancelledAt: null, replacedAt: null } }));
    expect(live).toHaveLength(1);
    const access = await withConsoleSchool(s.id, (tx) => tx.schoolAccess.count({ where: { schoolId: s.id, userLoginId: login.id, archivedAt: null } }));
    expect(access).toBe(1);
  });

  it("after their invite was cancelled: the same number works again", async () => {
    const s = await schoolWithCard("Cancelled Invite School");
    const m = mobile();
    await addAdmin(actorOf(owner), s.id, { name: "Wrong Number", mobile: m, email: null, roleKey: "school-admin", channels: ["sms"], checked: null });
    const inv = await withConsole((tx) => tx.schoolInvite.findFirstOrThrow({ where: { forSchoolId: s.id, phone: m } }));
    await cancelInvite(actorOf(owner), s.id, inv.id, "Sent to the wrong person");
    expect((await prisma.userLogin.findUniqueOrThrow({ where: { username: m } })).archivedAt).not.toBeNull();
    await addAdmin(actorOf(owner), s.id, { name: "Right Person", mobile: m, email: null, roleKey: "principal", channels: ["sms"], checked: null });
    const login = await prisma.userLogin.findUniqueOrThrow({ where: { username: m } });
    expect(login.archivedAt).toBeNull();
    expect(login.status).toBe("INVITED");
    expect(login.displayName).toBe("Right Person");
    expect(await withConsole((tx) => tx.schoolInvite.count({ where: { userLoginId: login.id, usedAt: null, cancelledAt: null, replacedAt: null } }))).toBe(1);
  });
});

describe("the billing day", () => {
  it("carries on past a school it cannot finish, tells the Owner, and makes a renewal once", async () => {
    // A school card and subscription whose school record is gone: refreshing its banner fails.
    const brokenId = randomUUID();
    await withConsole(async (tx) => {
      await tx.consoleSchool.create({ data: { id: brokenId, code: `BRK-${brokenId.slice(0, 6)}`, name: "Broken Card School", status: "ACTIVE", statusSince: new Date(), startedAs: "ACTIVE" } });
      await tx.subscription.create({ data: { forSchoolId: brokenId, planKey: "essential", studentsPaidFor: 100, pricePerStudentPaise: 12000n, startOn: today(), renewOn: addDays(today(), 200) } });
    });
    const good = await schoolWithCard("Renewal Soon School", 120);
    await startSubscription(actorOf(owner), good.id, { planKey: "essential", hostel: false, buses: 0, students: 100, payIn: "YEARLY" });
    const renewOn = addDays(today(), 10);
    await withConsole((tx) => tx.subscription.update({ where: { forSchoolId: good.id }, data: { renewOn } }));

    await expect(runBillingDay()).resolves.toBeDefined();
    expect(await invoices(good.id, "RENEWAL")).toHaveLength(1);
    expect(await withConsole((tx) => tx.consoleNotification.count({ where: { userId: owner.id, text: { contains: "could not finish" } } }))).toBeGreaterThan(0);

    // Run again, and a second renewal for the same period is refused by the database itself.
    await runBillingDay();
    expect(await invoices(good.id, "RENEWAL")).toHaveLength(1);
    const first = (await invoices(good.id, "RENEWAL"))[0];
    await expect(withConsole((tx) => tx.platformInvoice.create({
      data: { number: `T/${randomUUID().slice(0, 8)}`, forSchoolId: good.id, kind: "RENEWAL", items: [], subtotalPaise: 1n, gstPaise: 0n, totalPaise: 1n, periodFrom: first.periodFrom, issuedOn: today(), dueOn: renewOn },
    }))).rejects.toThrow();
    // Making the year's invoice by hand is refused in plain words.
    await expect(invoiceFor(actorOf(owner), good.id, { kind: "YEAR" })).rejects.toThrow(/still unpaid|already covers/);
    // A cancelled one can be replaced.
    await withConsole((tx) => tx.platformInvoice.update({ where: { id: first.id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "test" } }));
    await runBillingDay();
    expect((await invoices(good.id, "RENEWAL")).filter((i) => i.status !== "CANCELLED")).toHaveLength(1);
  });
});

describe("Needs attention", () => {
  it("shows an invite that was opened but never finished, before and after it expires", async () => {
    const s = await schoolWithCard("Opened Invite School");
    const now = new Date();
    const day = 86_400_000;
    const [opened, expired] = await withConsole((tx) => Promise.all([
      tx.schoolInvite.create({ data: { forSchoolId: s.id, userLoginId: randomUUID(), name: "Opened Person", phone: mobile(), roleKey: "school-admin", channels: ["sms"], tokenHash: hashToken(newToken()), sentAt: new Date(now.getTime() - 3 * day), openedAt: new Date(now.getTime() - day), expiresAt: new Date(now.getTime() + day) } }),
      tx.schoolInvite.create({ data: { forSchoolId: s.id, userLoginId: randomUUID(), name: "Expired Person", phone: mobile(), roleKey: "school-admin", channels: ["sms"], tokenHash: hashToken(newToken()), sentAt: new Date(now.getTime() - 5 * day), openedAt: new Date(now.getTime() - 4 * day), expiresAt: new Date(now.getTime() - 2 * day) } }),
    ]));
    const items = await attentionItems(now);
    const a = items.find((i) => i.id === `never:${opened.id}`);
    expect(a?.title).toMatch(/opened .* password not set yet/);
    expect(a?.action).toBe("Resend invite");
    const b = items.find((i) => i.id === `expired:${expired.id}`);
    expect(b?.detail).toMatch(/password never set/);
  });
});

describe("console WhatsApp messages", () => {
  it("are not sent without an approved template, and say why", async () => {
    const { deliver } = await import("@/lib/console/outbox");
    vi.stubEnv("CONSOLE_WHATSAPP_PHONE_NUMBER_ID", "1234567890");
    vi.stubEnv("CONSOLE_WHATSAPP_ACCESS_TOKEN", "test-token");
    vi.stubEnv("CONSOLE_WHATSAPP_TEMPLATE_INVITE", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const [d] = await deliver([{ channel: "whatsapp", to: "9876500001", purpose: "invite", text: "hi", safeText: "hi" }]);
      expect(d.status).toBe("FAILED");
      expect(d.reason).toContain("CONSOLE_WHATSAPP_TEMPLATE_INVITE");
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it("an invite that did not reach the phone says so on the school's page", async () => {
    const { notDeliveredWords } = await import("@/lib/console/outbox");
    expect(notDeliveredWords([])).toBeNull();
    expect(notDeliveredWords([{ channel: "whatsapp", status: "SENT", failReason: null }, { channel: "sms", status: "FAILED", failReason: "x" }])).toBeNull();
    expect(notDeliveredWords([{ channel: "whatsapp", status: "TEST", failReason: null }])).toMatch(/^Not sent: no WhatsApp or SMS is set up/);
    expect(notDeliveredWords([{ channel: "whatsapp", status: "FAILED", failReason: "Number not on WhatsApp." }])).toBe("Not sent: WhatsApp did not go, Number not on WhatsApp.");
    expect(notDeliveredWords([{ channel: "whatsapp", status: "DELIVERED", failReason: null }])).toBeNull();
    expect(notDeliveredWords([{ channel: "whatsapp", status: "READ", failReason: null }])).toBeNull();
  });
});

describe("Meta's delivery reports for console WhatsApp messages", () => {
  const SECRET = "console-app-secret-123";
  const signed = (body: string) => `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
  const report = (id: string, status: string, errors?: { code: number; title: string }[]) =>
    JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "waba", changes: [{ field: "messages", value: { messaging_product: "whatsapp", statuses: [{ id, status, timestamp: "1790000000", recipient_id: "919876500001", ...(errors ? { errors } : {}) }] } }] }] });
  const message = (providerMessageId: string) => withConsole((tx) => tx.consoleMessage.create({ data: { channel: "whatsapp", to: "9876500001", purpose: "invite", text: "invite", status: "SENT", providerMessageId } }));
  const row = (id: string) => withConsole((tx) => tx.consoleMessage.findUniqueOrThrow({ where: { id } }));

  beforeEach(() => {
    vi.stubEnv("CONSOLE_WHATSAPP_APP_SECRET", SECRET);
    vi.stubEnv("CONSOLE_WHATSAPP_VERIFY_TOKEN", "verify-me-please");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("moves a message to Delivered, then Read, and a late failure does not undo it", async () => {
    const { handleConsoleWhatsappWebhook } = await import("@/lib/console/whatsapp-webhook");
    const wamid = `wamid.${randomUUID()}`;
    const m = await message(wamid);
    for (const [s, expected] of [["delivered", "DELIVERED"], ["sent", "DELIVERED"], ["read", "READ"], ["delivered", "READ"], ["failed", "READ"]] as const) {
      const body = report(wamid, s, s === "failed" ? [{ code: 131026, title: "Undeliverable" }] : undefined);
      expect((await handleConsoleWhatsappWebhook(body, signed(body))).status).toBe(200);
      expect((await row(m.id)).status).toBe(expected);
    }
    expect((await row(m.id)).failReason).toBeNull();
  });

  it("an invite Meta accepted but could not deliver shows Meta's reason on the school's page", async () => {
    const { POST } = await import("@/app/api/v1/console/whatsapp/route");
    const { notDeliveredWords } = await import("@/lib/console/outbox");
    const wamid = `wamid.${randomUUID()}`;
    const m = await message(wamid);
    const body = report(wamid, "failed", [{ code: 131049, title: "This message was not delivered to maintain healthy ecosystem engagement." }]);
    const res = await POST(new Request("http://localhost/api/v1/console/whatsapp", { method: "POST", body, headers: { "x-hub-signature-256": signed(body) } }));
    expect(res.status).toBe(200);
    const after = await row(m.id);
    expect(after.status).toBe("FAILED");
    expect(notDeliveredWords([after])).toBe("Not sent: WhatsApp did not go, WhatsApp held this message back to protect the parent from too many messages.");
    // An error code the console does not know keeps Meta's own words.
    const other = await message(`wamid.${randomUUID()}`);
    const odd = report(other.providerMessageId!, "failed", [{ code: 999999, title: "Something new" }]);
    await handleConsoleWhatsappWebhookFor(odd);
    expect((await row(other.id)).failReason).toBe("WhatsApp did not send it: Something new.");
  });

  async function handleConsoleWhatsappWebhookFor(body: string) {
    const { handleConsoleWhatsappWebhook } = await import("@/lib/console/whatsapp-webhook");
    return handleConsoleWhatsappWebhook(body, signed(body));
  }

  it("refuses a report without the right signature, and ignores messages it does not know", async () => {
    const { handleConsoleWhatsappWebhook } = await import("@/lib/console/whatsapp-webhook");
    const wamid = `wamid.${randomUUID()}`;
    const m = await message(wamid);
    const body = report(wamid, "failed", [{ code: 131026, title: "x" }]);
    expect((await handleConsoleWhatsappWebhook(body, null)).status).toBe(401);
    expect((await handleConsoleWhatsappWebhook(body, `sha256=${createHmac("sha256", "wrong").update(body).digest("hex")}`)).status).toBe(401);
    expect((await row(m.id)).status).toBe("SENT");
    expect((await handleConsoleWhatsappWebhookFor(report(`wamid.${randomUUID()}`, "read"))).status).toBe(200);
    expect((await handleConsoleWhatsappWebhook("not json", signed("not json"))).status).toBe(400);
    vi.stubEnv("CONSOLE_WHATSAPP_APP_SECRET", "");
    expect((await handleConsoleWhatsappWebhook(body, signed(body))).status).toBe(404);
    expect((await row(m.id)).status).toBe("SENT");
  });

  it("answers Meta's one-time check only with the verify token", async () => {
    const { GET } = await import("@/app/api/v1/console/whatsapp/route");
    const check = (token: string) => GET(new Request(`http://localhost/api/v1/console/whatsapp?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=4242`));
    const ok = await check("verify-me-please");
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("4242");
    expect((await check("guess")).status).toBe(403);
    vi.stubEnv("CONSOLE_WHATSAPP_VERIFY_TOKEN", "");
    expect((await check("verify-me-please")).status).toBe(404);
  });
});
