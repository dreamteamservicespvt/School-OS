// The "Fee received" message carries the receipt (HANDOFF 3a): every posted
// payment, cash too, has a secret receipt address made with the server key.
// Message History keeps a placeholder; the address is worked out only when the
// message goes out. On an approved WhatsApp template the line with the link
// becomes an "Open receipt" button, and the message fills the button's end of
// address. Schools made before keep their own words unless they are still the
// ready ones and never went to WhatsApp.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }));

import { withSchool } from "@/lib/db";
import { appUrl, readReceiptKey, receiptKeyFor, receiptKeyIn, receiptPlaceholderFor, receiptUrl, withHiddenLinks, withRealLinks } from "@/lib/parent-link/token";
import { whatsappParts } from "@/lib/messaging/blanks";
import { templateComponents } from "@/lib/messaging/providers/whatsapp";
import { READY_TEMPLATES, smsParts } from "@/lib/messaging/templates";
import { GET } from "@/app/r/[key]/route";
import { collect, dues, makeFeeSchool, R, type FeeSchool } from "./fixture";

const SCHOOL = "11111111-1111-1111-1111-111111111111";
const PAYMENT = "22222222-2222-2222-2222-222222222222";
const READY = READY_TEMPLATES.find((t) => t.key === "fee-paid" && t.channel === "whatsapp")!.texts.en;
const OLD = "Dear {guardian_name}, we have received {paid_amount} for {student_name} on {payment_date}. Receipt number {receipt_number}. Thank you. - {school_name}";
const open = (key: string) => GET(new Request(`http://localhost/r/${key}`), { params: Promise.resolve({ key }) });

describe("the receipt address", () => {
  it("is one part after /r/, and opens only for the school and payment it was made for", () => {
    const key = receiptKeyFor(SCHOOL, PAYMENT);
    expect(key).toMatch(/^[0-9a-f]{64}[A-Za-z0-9_-]{22}$/);
    expect(receiptUrl(SCHOOL, PAYMENT)).toBe(`${appUrl()}/r/${key}`);
    expect(readReceiptKey(key)).toEqual({ schoolId: SCHOOL, paymentId: PAYMENT });
    // Another payment's id with this secret, a changed secret or a cut address: not a receipt.
    expect(readReceiptKey(key.replace("2222", "3333"))).toBeNull();
    expect(readReceiptKey(`${key.slice(0, -1)}${key.endsWith("A") ? "B" : "A"}`)).toBeNull();
    expect(readReceiptKey(key.slice(0, -1))).toBeNull();
    expect(readReceiptKey("../../etc/passwd")).toBeNull();
  });

  it("stays a placeholder in Message History and becomes the link only when it goes out", () => {
    const ph = receiptPlaceholderFor(SCHOOL, PAYMENT);
    expect(ph).not.toContain("/r/");
    expect(withHiddenLinks(`Open your receipt: ${ph}`)).toBe("Open your receipt: [receipt link]");
    expect(withRealLinks(`Open your receipt: ${ph}`)).toBe(`Open your receipt: ${receiptUrl(SCHOOL, PAYMENT)}`);
    expect(receiptKeyIn(ph)).toBe(receiptKeyFor(SCHOOL, PAYMENT));
    expect(receiptKeyIn("no link here")).toBeNull();
    // An SMS is counted with the real link in it.
    expect(smsParts(`Receipt: ${ph}`)).toBe(smsParts(withRealLinks(`Receipt: ${ph}`)));
  });
});

describe("the WhatsApp template", () => {
  it("goes to WhatsApp without the link line, with an Open receipt button", () => {
    const parts = whatsappParts(READY);
    expect(parts.text).toBe(`${OLD}.`);
    expect(parts.variables).toEqual(["guardian_name", "paid_amount", "student_name", "payment_date", "receipt_number", "school_name"]);
    expect(parts.button).toEqual({ blank: "receipt_link", label: "Open receipt" });
    const [body, buttons] = templateComponents(READY) as [{ text: string }, { buttons: { type: string; text: string; url: string; example: string[] }[] }];
    expect(body.text).toBe("Dear {{1}}, we have received {{2}} for {{3}} on {{4}}. Receipt number {{5}}. Thank you. - {{6}}.");
    expect(buttons.buttons).toEqual([{ type: "URL", text: "Open receipt", url: `${appUrl()}/r/{{1}}`, example: [expect.stringMatching(new RegExp(`^${appUrl()}/r/[0-9A-Za-z]{86}$`))] }]);
  });

  it("is unchanged for a text with no button blank, apart from never ending on a blank", () => {
    expect(whatsappParts("Hello {guardian_name}, see you. - {school_name}")).toEqual({ text: "Hello {guardian_name}, see you. - {school_name}.", variables: ["guardian_name", "school_name"], button: null });
    expect(whatsappParts("Hello {guardian_name}. Thank you.")).toEqual({ text: "Hello {guardian_name}. Thank you.", variables: ["guardian_name"], button: null });
    expect(templateComponents("Hello {guardian_name}. Thank you.")).toHaveLength(1);
  });
});

describe("a fee paid at the counter", () => {
  let f: FeeSchool;
  let other: FeeSchool;
  let paymentId: string;
  beforeAll(async () => {
    f = await makeFeeSchool();
    other = await makeFeeSchool();
    const [first] = await dues(f.ctx, f.ravi.id);
    const r = await collect(f.ctx, { studentId: f.ravi.id, dueIds: [first.id], amountPaise: R(6000) });
    paymentId = r.payment.id;
  }, 120_000);

  it("tells the parent with a link to that payment's receipt", async () => {
    const text = await withSchool(f.ctx, async (tx) => {
      const m = await tx.message.findFirstOrThrow({ where: { sourceType: "Payment", sourceId: paymentId } });
      return (await tx.messageRecipient.findFirstOrThrow({ where: { messageId: m.id, guardianId: f.ravi.guardian.id } })).text;
    });
    expect(text).toContain(`Open your receipt: ${receiptPlaceholderFor(f.school.id, paymentId)}`);
    expect(text).not.toContain("http");
  });

  it.skipIf(!process.env.CHROMIUM_PATH)("opens the parent copy of the receipt from the link", async () => {
    const res = await open(receiptKeyFor(f.school.id, paymentId));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
  }, 60_000);

  it("is not found with a wrong secret, or for another school's id", async () => {
    expect((await open(`${receiptKeyFor(f.school.id, paymentId).slice(0, -2)}xx`)).status).toBe(404);
    // A real secret for this payment id under the other school: that school has no such receipt.
    expect((await open(receiptKeyFor(other.school.id, paymentId))).status).toBe(404);
    expect((await open(receiptKeyFor(f.school.id, randomUUID()))).status).toBe(404);
  });
});

describe("ready Fee received templates of schools made before", () => {
  async function runUpdate() {
    const dir = path.resolve("prisma/schema/migrations");
    const name = readdirSync(dir).find((x) => x.endsWith("_fee_paid_receipt_link"));
    if (!name) throw new Error("migration not found");
    const sql = readFileSync(path.join(dir, name, "migration.sql"), "utf8");
    const statements = sql.split(/;\s*\r?\n/).map((x) => x.trim()).filter((x) => x.replace(/^--.*$/gm, "").trim());
    const owner = new PrismaClient({ datasourceUrl: process.env.MIGRATION_DATABASE_URL });
    try {
      await owner.$transaction(async (tx) => { for (const x of statements) await tx.$executeRawUnsafe(x); });
    } finally {
      await owner.$disconnect();
    }
  }
  const asBefore = (s: FeeSchool, body: string, whatsappStatus: string) => withSchool(s.ctx, async (tx) => {
    const wa = await tx.template.findFirstOrThrow({ where: { key: "fee-paid", channel: "whatsapp" } });
    await tx.templateVersion.updateMany({ where: { templateId: wa.id }, data: { body, whatsappStatus } });
  });
  const versions = (s: FeeSchool) => withSchool(s.ctx, (tx) => tx.templateVersion.findMany({
    where: { template: { key: "fee-paid" } }, orderBy: [{ templateId: "asc" }, { version: "asc" }],
    select: { version: true, isCurrent: true, body: true, variables: true, template: { select: { channel: true } } },
  }));

  let untouched: FeeSchool;
  let approved: FeeSchool;
  let edited: FeeSchool;
  beforeAll(async () => {
    [untouched, approved, edited] = [await makeFeeSchool(), await makeFeeSchool(), await makeFeeSchool()];
    await asBefore(untouched, OLD, "NOT_SUBMITTED");
    await asBefore(approved, OLD, "APPROVED");
    await asBefore(edited, "Thank you {guardian_name}, {paid_amount} received. - {school_name}", "NOT_SUBMITTED");
    await runUpdate();
    await runUpdate();
  }, 180_000);

  it("get the receipt link as a new version where the words are still the ready ones", async () => {
    const wa = (await versions(untouched)).filter((v) => v.template.channel === "whatsapp");
    expect(wa.map((v) => [v.version, v.isCurrent, v.body])).toEqual([[1, false, OLD], [2, true, READY]]);
    expect(wa[1].variables).toEqual(["guardian_name", "paid_amount", "student_name", "payment_date", "receipt_number", "school_name", "receipt_link"]);
    // The SMS words are registered on the DLT portal, so they stay.
    expect((await versions(untouched)).filter((v) => v.template.channel === "sms").every((v) => !v.body.includes("{receipt_link}"))).toBe(true);
  });

  it("are left alone once WhatsApp knows them, or where the school changed the words", async () => {
    for (const s of [approved, edited]) {
      const wa = (await versions(s)).filter((v) => v.template.channel === "whatsapp");
      expect(wa).toHaveLength(1);
      expect(wa[0].body).not.toContain("{receipt_link}");
    }
  });
});
