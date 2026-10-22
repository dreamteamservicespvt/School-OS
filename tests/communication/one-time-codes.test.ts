// One-time codes through Communication (QA SEC-01, P0). Message History showed
// "981016 is your School OS sign-in code…" to anyone who could open it, the
// code was saved in plain text on the Message Recipient, and the message was
// an "Emergency broadcast" sent by the person signing in.
//
// Now, for every kind of code (two-step sign-in, a new mobile number, Parent
// Link new phone and consent, admission consent, pickup): no message or
// recipient row holds the code; the provider still gets it; it is never
// retried or resent; it still reaches a person who opted out; it is not an
// emergency broadcast, nobody is its sender, and the Audit Log says
// "one-time-code-sent" without the code. The export never shows it either.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Current } from "@/lib/current";

const who = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/current", async (orig) => {
  const real = await orig<typeof import("@/lib/current")>();
  const { requirePermission } = await import("@/lib/permissions");
  const requireCurrent = async () => who.current as Current;
  return {
    ...real,
    getCurrent: requireCurrent,
    requireCurrent,
    requirePage: requireCurrent,
    requireAction: async (module: Parameters<typeof requirePermission>[1], action: Parameters<typeof requirePermission>[2]) => {
      const current = await requireCurrent();
      return { current, reach: requirePermission(current.permissions, module, action) };
    },
  };
});

import { prisma, withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { deliverCodeTo } from "@/lib/auth/two-step";
import { startOtp } from "@/lib/admission/consent";
import { createLink, hashToken, newDeviceKey, sendCode } from "@/lib/parent-link/links";
import { askConsentCode } from "@/lib/parent-link/consent";
import { sendPickupCode } from "@/lib/front-office/pickup";
import { deliverMessage, retryableFailures, retryFailed } from "@/lib/messaging/deliver";
import { resendInput, unreadCount } from "@/lib/messaging/resend";
import { sendMessage, recordSend, planMessage } from "@/lib/messaging/send";
import { sandboxProvider } from "@/lib/messaging/providers/sandbox";
import type { Outgoing } from "@/lib/messaging/providers";
import { senderWords } from "@/lib/communication/history";
import { CODE_EXPIRED, CODE_MASK, CODE_NOT_RESENT, hiddenCodeText, ONE_TIME_CODE } from "@/lib/messaging/one-time-code";
import { GET as historyExport } from "@/app/(school)/communication/history/export/route";
import { addDlt, makeCommSchool, templateId } from "./fixture";
import { takeLoggedCode, watchLoggedCodes } from "../helpers";

watchLoggedCodes();

let s: Awaited<ReturnType<typeof makeCommSchool>>;
beforeAll(async () => {
  s = await makeCommSchool();
  await addDlt(s.ctx, "sign-in-code");
  await addDlt(s.ctx, "parent-link-code");
  await prisma.userLogin.update({ where: { id: s.principal.id }, data: { phone: "9876543299", email: null } });
}, 120_000);

type Sent = { messageId: string; code: string; what: string };
const sent: Sent[] = [];

/** Everything kept about one message: the message, its recipients and its Audit Log lines. */
async function rowsOf(messageId: string) {
  return withSchool(s.ctx, async (tx) => ({
    message: await tx.message.findUniqueOrThrow({ where: { id: messageId } }),
    recipients: await tx.messageRecipient.findMany({ where: { messageId } }),
    audit: await tx.auditLogEntry.findMany({ where: { recordType: "Message", recordId: messageId } }),
  }));
}

/** The code, as a number of its own, in a text. */
const has = (text: string, code: string) => new RegExp(`(^|\\D)${code}(\\D|$)`).test(text);
/** Every word kept about a message (not its ids and times; sealed_code is encrypted, never the code). */
const words = (r: Awaited<ReturnType<typeof rowsOf>>) => JSON.stringify([
  r.message.title, r.message.body, r.message.trigger, r.message.audienceLabel, r.message.skipped,
  ...r.recipients.map((p) => [p.name, p.description, p.address, p.text, p.values, p.failReason, p.history]),
  ...r.audit.map((a) => [a.actorNote, a.before, a.after]),
]);
const holds = (r: Awaited<ReturnType<typeof rowsOf>>, code: string) => has(words(r), code);

async function expectHidden(x: Sent) {
  const r = await rowsOf(x.messageId);
  expect(holds(r, x.code), `${x.what}: the code is kept somewhere`).toBe(false);
  expect(r.recipients.length, x.what).toBeGreaterThan(0);
  for (const p of r.recipients) {
    expect(p.text, x.what).toContain(CODE_MASK);
    if (p.sealedCode) expect(p.sealedCode).not.toContain(x.code);
  }
  expect(r.message, x.what).toMatchObject({ messageType: ONE_TIME_CODE, isEmergency: false, sentById: null });
  expect(r.audit.map((a) => a.action), x.what).toEqual(["one-time-code-sent"]);
  return r;
}

describe("one-time codes are never kept in messaging", () => {
  it("two-step sign-in code by SMS", async () => {
    const r = await deliverCodeTo({ email: null, phone: "9876543299", name: "Principal Person", schoolId: s.school.id, userLoginId: s.principal.id, key: "sec01-sign-in" }, "481516");
    expect(r).toMatchObject({ channel: "sms" });
    const m = await withSchool(s.ctx, (tx) => tx.message.findFirstOrThrow({ where: { idempotencyKey: "two-step:sec01-sign-in" } }));
    sent.push({ messageId: m.id, code: "481516", what: "sign-in" });
    const rows = await expectHidden(sent.at(-1)!);
    expect(rows.recipients[0].text).toBe(`${CODE_MASK} is your School OS sign-in code for Comm School. It works for 10 minutes. Do not share it.`);
    expect(rows.audit[0]).toMatchObject({ actorNote: "School OS (sign-in)" });
    takeLoggedCode();
  });

  it("code confirming a new mobile number", async () => {
    await deliverCodeTo({ email: null, phone: "9876500011", name: "Principal Person", schoolId: s.school.id, userLoginId: s.principal.id, key: "sec01-phone" }, "234567", "change-phone");
    const m = await withSchool(s.ctx, (tx) => tx.message.findFirstOrThrow({ where: { idempotencyKey: "change-phone:sec01-phone" } }));
    sent.push({ messageId: m.id, code: "234567", what: "new mobile" });
    const rows = await expectHidden(sent.at(-1)!);
    expect(senderWords(rows.message, new Map())).toBe("School OS (new mobile number)");
    takeLoggedCode();
  });

  it("Parent Link code for a new phone, even to a parent who opted out of messages", async () => {
    const link = await withSchool(s.ctx, (tx) => createLink(tx, s.ctx, s.optFather.id));
    await withSchool(s.ctx, (tx) => sendCode(tx, s.ctx, link.id, "device", { keyHash: hashToken(newDeviceKey()) }));
    const code = takeLoggedCode();
    const row = await withSchool(s.ctx, (tx) => tx.parentLinkCode.findFirstOrThrow({ where: { parentLinkId: link.id, purpose: "device" }, orderBy: { createdAt: "desc" } }));
    sent.push({ messageId: row.messageId!, code, what: "Parent Link new phone" });
    const rows = await expectHidden(sent.at(-1)!);
    // Opt-outs are still ignored for codes: the opted-out father is sent it, not left out.
    expect(rows.recipients.map((p) => p.guardianId)).toEqual([s.optFather.id]);
    expect(rows.message.skipped).toEqual([]);
    expect(senderWords(rows.message, new Map())).toBe("School OS (Parent Link)");
  });

  it("Parent Link consent code", async () => {
    const link = await withSchool(s.ctx, (tx) => createLink(tx, s.ctx, s.father.id));
    const text = await withSchool(s.ctx, (tx) => tx.consentText.create({ data: { schoolId: s.school.id, consentType: "photo", title: "Photo consent", version: 1, text: { en: "We may use photos." } } }));
    await withSchool(s.ctx, (tx) => askConsentCode(tx, s.ctx, link.id, s.father.id, { consentTextId: text.id, studentIds: [s.ravi.id], action: "give" }));
    const code = takeLoggedCode();
    const row = await withSchool(s.ctx, (tx) => tx.parentLinkCode.findFirstOrThrow({ where: { parentLinkId: link.id, purpose: "consent" }, orderBy: { createdAt: "desc" } }));
    sent.push({ messageId: row.messageId!, code, what: "Parent Link consent" });
    await expectHidden(sent.at(-1)!);
  });

  it("admission consent code", async () => {
    await withSchool(s.ctx, (tx) => startOtp(tx, s.ctx, { phone: "9845012399", purpose: "sec01:admission", schoolName: "Comm School", about: null }));
    const code = takeLoggedCode();
    const m = await withSchool(s.ctx, (tx) => tx.message.findFirstOrThrow({ where: { trigger: "Admission consent code" }, orderBy: { createdAt: "desc" } }));
    sent.push({ messageId: m.id, code, what: "admission consent" });
    const rows = await expectHidden(sent.at(-1)!);
    expect(senderWords(rows.message, new Map())).toBe("School OS (admission consent)");
  });

  it("pickup code", async () => {
    await withSchool(s.ctx, (tx) => sendPickupCode(tx, s.ctx, s.ravi.id, s.father.id));
    const code = takeLoggedCode();
    expect(code).toMatch(/^\d{4}$/);
    const m = await withSchool(s.ctx, (tx) => tx.message.findFirstOrThrow({ where: { trigger: "Pickup code" }, orderBy: { createdAt: "desc" } }));
    sent.push({ messageId: m.id, code, what: "pickup" });
    const rows = await expectHidden(sent.at(-1)!);
    expect(rows.recipients[0].text).toMatch(/^Code •••••• to collect Ravi from school\./);
    expect(senderWords(rows.message, new Map())).toBe("School OS (pickup code)");
  });

  it("the provider gets the real code; afterwards nothing of it is left", async () => {
    const got: Outgoing[] = [];
    const spy = vi.spyOn(sandboxProvider, "send").mockImplementation(async (o) => { got.push(o); return { ok: true, providerMessageId: `test-${got.length}`, status: "DELIVERED" }; });
    try {
      for (const x of sent) {
        got.length = 0;
        await withSchool(s.ctx, (tx) => deliverMessage(tx, s.ctx, { messageId: x.messageId, round: "0", chunk: 0 }));
        expect(got.map((o) => o.text).join(" "), x.what).toContain(x.code);
        expect(got.map((o) => o.text).join(" "), x.what).not.toContain(CODE_MASK);
        const r = await rowsOf(x.messageId);
        expect(r.recipients.every((p) => p.sealedCode === null && p.status === "DELIVERED"), x.what).toBe(true);
        expect(holds(r, x.code), x.what).toBe(false);
      }
    } finally {
      spy.mockRestore();
    }
  });

  it("a code is never retried or resent, and Message History offers neither", async () => {
    const x = sent[0];
    await withSchool(s.ctx, (tx) => tx.messageRecipient.updateMany({ where: { messageId: x.messageId }, data: { status: "FAILED", failReason: "Provider said no" } }));
    expect((await withSchool(s.ctx, (tx) => retryableFailures(tx, s.ctx, x.messageId))).rows).toEqual([]);
    await expect(withSchool(s.ctx, (tx) => retryFailed(tx, s.ctx, x.messageId))).rejects.toThrow(CODE_NOT_RESENT);
    for (const whom of ["failed", "unread"] as const) {
      await expect(withSchool(s.ctx, (tx) => resendInput(tx, s.ctx, x.messageId, whom, "preferred", { campusId: null } as never))).rejects.toThrow(CODE_NOT_RESENT);
    }
    expect(await withSchool(s.ctx, (tx) => unreadCount(tx, s.ctx, x.messageId))).toBe(0);
  });

  it("a code put back in the queue is not sent again; nor is one older than 10 minutes", async () => {
    const spy = vi.spyOn(sandboxProvider, "send");
    try {
      // Picked up once already: the sealed code was cleared, so it is never sent a second time.
      const again = sent[1];
      await withSchool(s.ctx, async (tx) => {
        await tx.messageRecipient.updateMany({ where: { messageId: again.messageId }, data: { status: "QUEUED" } });
        await tx.message.update({ where: { id: again.messageId }, data: { status: "QUEUED" } });
      });
      await withSchool(s.ctx, (tx) => deliverMessage(tx, s.ctx, { messageId: again.messageId, round: "x", chunk: 0 }));
      expect((await rowsOf(again.messageId)).recipients[0]).toMatchObject({ status: "FAILED", failReason: CODE_NOT_RESENT });

      // A new code whose delivery job only runs after its 10 minutes: not sent late.
      await deliverCodeTo({ email: null, phone: "9876543299", name: "Principal Person", schoolId: s.school.id, userLoginId: s.principal.id, key: "sec01-late" }, "909192");
      takeLoggedCode();
      const late = await withSchool(s.ctx, (tx) => tx.message.findFirstOrThrow({ where: { idempotencyKey: "two-step:sec01-late" } }));
      await withSchool(s.ctx, (tx) => tx.messageRecipient.updateMany({ where: { messageId: late.id }, data: { queuedAt: new Date(Date.now() - 11 * 60_000) } }));
      await withSchool(s.ctx, (tx) => deliverMessage(tx, s.ctx, { messageId: late.id, round: "0", chunk: 0 }));
      expect((await rowsOf(late.id)).recipients[0]).toMatchObject({ status: "FAILED", failReason: CODE_EXPIRED, sealedCode: null });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("the Message History export never shows a code, and names School OS as the sender", async () => {
    const access = await accessIn(s.principal.id, s.school.id);
    who.current = { ...access!, ctx: s.ctx, user: { id: s.principal.id, displayName: "Principal Person" }, menu: [], schools: [], session: null, support: null } as unknown as Current;
    const res = await historyExport(new Request("http://localhost/communication/history/export?format=csv"));
    expect(res.status).toBe(200);
    // Dates and times are taken out first, so a 4-digit pickup code is not mistaken for a year.
    const csv = (await res.text()).replace(/\d{2}-\d{2}-\d{4}( \d{1,2}:\d{2}( ?[ap]m)?)?/gi, "");
    for (const x of sent) expect(has(csv, x.code), x.what).toBe(false);
    expect(csv).toContain("School OS (sign-in)");
    expect(csv).toContain("School OS (pickup code)");
  });

  it("guard: a code written into a message's text is refused", async () => {
    const plan = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, { to: { guardianIds: [s.father.id] }, channels: ["whatsapp"], text: "Your code is 112233." }));
    await expect(withSchool(s.ctx, (tx) => recordSend(tx, s.ctx, { to: { guardianIds: [s.father.id] }, channels: ["whatsapp"], text: "Your code is 112233.", oneTimeCode: { code: "112233", purpose: "sign-in" } }, plan))).rejects.toThrow(/never be stored/);
    // Through sendMessage the code goes in as the {code} blank, kept as the mask.
    const t = await templateId(s.ctx, "parent-link-code", "whatsapp");
    const r = await withSchool(s.ctx, (tx) => sendMessage(tx, s.ctx, { to: { guardianIds: [s.father.id] }, channels: ["whatsapp"], templates: { whatsapp: t }, single: true, oneTimeCode: { code: "112233", purpose: "parent-link" } }));
    const rows = await rowsOf(r.messageId);
    expect(rows.recipients[0].text).toMatch(/^•••••• is your one-time code for Parent Link of Comm School\./);
    expect(holds(rows, "112233")).toBe(false);
  });

  it("a code-like number in a code message's text is hidden on screen, even in an old row", () => {
    expect(hiddenCodeText("981016 is your School OS sign-in code for Sunrise Public School. It works for 10 minutes.")).toBe(`${CODE_MASK} is your School OS sign-in code for Sunrise Public School. It works for 10 minutes.`);
    expect(hiddenCodeText("Code 0420 to collect Ravi from school.")).toBe(`Code ${CODE_MASK} to collect Ravi from school.`);
  });
});

/** The data part of the update that hides codes already saved, run again as the database owner. */
async function runUpdate() {
  const dir = path.resolve("prisma/schema/migrations");
  const name = readdirSync(dir).find((d) => d.endsWith("_one_time_codes_hidden"));
  if (!name) throw new Error("migration not found");
  const sql = readFileSync(path.join(dir, name, "migration.sql"), "utf8");
  const from = sql.indexOf('ALTER TABLE "message" NO FORCE ROW LEVEL SECURITY;');
  const statements = sql.slice(from).split(/;\s*\r?\n/).map((x) => x.trim()).filter((x) => x.replace(/^--.*$/gm, "").trim());
  const owner = new PrismaClient({ datasourceUrl: process.env.MIGRATION_DATABASE_URL });
  try {
    await owner.$transaction(async (tx) => { for (const x of statements) await tx.$executeRawUnsafe(x); });
  } finally {
    await owner.$disconnect();
  }
}

describe("codes saved before this update", () => {
  it("are hidden, lose the emergency mark and the sender, once, and nothing else changes", async () => {
    const old = await withSchool(s.ctx, async (tx) => {
      const make = async (m: { trigger: string; sourceType: string | null; text: string; values: Record<string, string>; emergency: boolean }) => {
        const msg = await tx.message.create({ data: { schoolId: s.school.id, body: m.text, channels: ["sms"], audienceLabel: "Before", status: "SENT", isEmergency: m.emergency, sentById: s.principal.id, trigger: m.trigger, sourceType: m.sourceType, sourceId: s.principal.id } });
        await tx.messageRecipient.create({ data: { schoolId: s.school.id, messageId: msg.id, recipientType: "login", name: "Someone", channel: "sms", address: "9876543299", text: m.text, values: m.values, status: "DELIVERED", provider: "msg91" } });
        return msg.id;
      };
      return {
        signIn: await make({ trigger: "Sign-in code (two-step login)", sourceType: "User Login", text: "981016 is your School OS sign-in code for Sunrise Public School. It works for 10 minutes. Do not share it.", values: { code: "981016", school_name: "Sunrise Public School" }, emergency: true }),
        pickup: await make({ trigger: "Pickup code", sourceType: "Student", text: "Code 0420 to collect Ravi from school. Give it only to the front desk. It works for 10 minutes.", values: {}, emergency: false }),
        parentLink: await make({ trigger: "Parent Link one-time code (new phone)", sourceType: "Parent Link Code", text: "777123 is your one-time code for Parent Link of Sunrise. It works for 10 minutes.", values: { code: "777123" }, emergency: true }),
        // Not a code: a message with a 6-digit number, sent in an emergency, stays exactly as it was.
        other: await make({ trigger: "Fee receipt", sourceType: "Payment", text: "Receipt 123456 for Rs 5,000. School closed today.", values: { receipt_number: "123456" }, emergency: true }),
      };
    });
    await runUpdate();
    await runUpdate();
    const signIn = await rowsOf(old.signIn);
    expect(signIn.message).toMatchObject({ messageType: ONE_TIME_CODE, isEmergency: false, sentById: null });
    expect(signIn.recipients[0].text).toBe(`${CODE_MASK} is your School OS sign-in code for Sunrise Public School. It works for 10 minutes. Do not share it.`);
    expect(signIn.recipients[0].values).toEqual({ code: CODE_MASK, school_name: "Sunrise Public School" });
    expect(signIn.audit.map((a) => a.action)).toEqual(["one-time-code-hidden"]);
    expect(senderWords(signIn.message, new Map())).toBe("School OS (sign-in)");
    const pickup = await rowsOf(old.pickup);
    expect(pickup.recipients[0].text).toBe(`Code ${CODE_MASK} to collect Ravi from school. Give it only to the front desk. It works for 10 minutes.`);
    expect(pickup.message.body).toBe(pickup.recipients[0].text);
    const parentLink = await rowsOf(old.parentLink);
    expect(holds(parentLink, "777123")).toBe(false);
    expect(parentLink.message).toMatchObject({ messageType: ONE_TIME_CODE, isEmergency: false });
    const other = await rowsOf(old.other);
    expect(other.message).toMatchObject({ messageType: "general", isEmergency: true, sentById: s.principal.id });
    expect(other.recipients[0]).toMatchObject({ text: "Receipt 123456 for Rs 5,000. School closed today.", values: { receipt_number: "123456" } });
    expect(other.audit).toEqual([]);
  });
});
