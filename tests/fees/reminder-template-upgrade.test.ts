// Schools made before fee reminders said how to pay (gap list G11): their
// ready "Fee reminder" templates get the {how_to_pay} blank as a new version,
// only where the words are still exactly the ready ones and WhatsApp or the
// DLT portal has never seen them. Changed or approved templates stay as they
// are. Running the update again changes nothing more.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { makeFeeSchool, type FeeSchool } from "./fixture";

const OLD = {
  en: "Dear {guardian_name}, a fee of {due_amount} for {student_name} ({class}) is due on {due_date}. The details are on your Parent Link. Please ignore if already paid. - {school_name}",
  enFirst: "Dear {guardian_name}, a fee of {due_amount} for {student_name} ({class}) is due on {due_date}. You can pay on your Parent Link. Please ignore if already paid. - {school_name}",
  te: "ప్రియమైన {guardian_name}, {student_name} ({class}) ఫీజు {due_amount} {due_date} లోపు చెల్లించాలి. మీ Parent Link లో చెల్లించవచ్చు. - {school_name}",
  sms: "Dear Parent, fee of {due_amount} for {student_name} is due on {due_date}. Please ignore if paid. - {school_name}",
};

async function runUpdate() {
  const dir = path.resolve("prisma/schema/migrations");
  const name = readdirSync(dir).find((x) => x.endsWith("_fee_reminder_how_to_pay"));
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

/** Puts a school's fee reminder templates back to the words they had before, with the given approvals. */
async function asBefore(f: FeeSchool, opts: { whatsappStatus: string; dlt: string | null; en: string }) {
  await withSchool(f.ctx, async (tx) => {
    const wa = await tx.template.findFirstOrThrow({ where: { key: "fee-due", channel: "whatsapp" } });
    const sms = await tx.template.findFirstOrThrow({ where: { key: "fee-due", channel: "sms" } });
    await tx.templateVersion.updateMany({ where: { templateId: wa.id, language: "en" }, data: { body: opts.en, whatsappStatus: opts.whatsappStatus } });
    await tx.templateVersion.updateMany({ where: { templateId: wa.id, language: "te" }, data: { body: OLD.te, whatsappStatus: opts.whatsappStatus } });
    await tx.templateVersion.updateMany({ where: { templateId: sms.id }, data: { body: OLD.sms, dltTemplateId: opts.dlt } });
  });
}

const versions = (f: FeeSchool) => withSchool(f.ctx, (tx) => tx.templateVersion.findMany({
  where: { template: { key: "fee-due" } }, orderBy: [{ templateId: "asc" }, { language: "asc" }, { version: "asc" }],
  select: { language: true, version: true, isCurrent: true, body: true, variables: true, template: { select: { channel: true } } },
}));

let untouched: FeeSchool;
let approved: FeeSchool;
let edited: FeeSchool;

beforeAll(async () => {
  untouched = await makeFeeSchool();
  approved = await makeFeeSchool();
  edited = await makeFeeSchool();
  await asBefore(untouched, { whatsappStatus: "NOT_SUBMITTED", dlt: null, en: OLD.en });
  await asBefore(approved, { whatsappStatus: "APPROVED", dlt: "1207159100000000001", en: OLD.enFirst });
  await asBefore(edited, { whatsappStatus: "NOT_SUBMITTED", dlt: null, en: "Dear parent, please clear {due_amount} for {student_name} by {due_date}. - {school_name}" });
  await runUpdate();
  await runUpdate();
}, 180_000);

describe("ready fee reminder templates of schools made before", () => {
  it("get a new version with {how_to_pay} where the words are still the ready ones", async () => {
    const v = await versions(untouched);
    const current = v.filter((x) => x.isCurrent);
    expect(current).toHaveLength(3);
    for (const c of current) {
      expect(c.version).toBe(2);
      expect(c.body).toContain("{how_to_pay}");
      expect(c.variables).toContain("how_to_pay");
    }
    // The old versions stay on record; running the update twice made only one new version each.
    expect(v.filter((x) => !x.isCurrent).map((x) => x.body).sort()).toEqual([OLD.en, OLD.sms, OLD.te].sort());
    expect(v).toHaveLength(6);
  });

  it("are left alone once WhatsApp approved them or the DLT portal has them", async () => {
    const v = await versions(approved);
    expect(v).toHaveLength(3);
    expect(v.every((x) => x.isCurrent && !x.body.includes("{how_to_pay}"))).toBe(true);
  });

  it("are left alone where the school changed the words", async () => {
    const v = await versions(edited);
    const en = v.filter((x) => x.template.channel === "whatsapp" && x.language === "en");
    expect(en).toHaveLength(1);
    expect(en[0].body).toBe("Dear parent, please clear {due_amount} for {student_name} by {due_date}. - {school_name}");
    // Its Telugu and SMS words were still the ready ones, so those are updated.
    expect(v.filter((x) => x.isCurrent && x.body.includes("{how_to_pay}"))).toHaveLength(2);
  });
});
