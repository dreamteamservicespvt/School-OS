// Fee Settings, "What a parent gets" (06 §6; gap list G11): the automatic
// reminder exactly as one real family gets it, with links as words, and in
// plain words why nothing would go and what is wrong with the message.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool, type SchoolContext } from "@/lib/db";
import { automaticReminders } from "@/lib/fees/reminders";
import { reminderSettingsPreview } from "@/lib/fees/reminder-preview";
import { createLink } from "@/lib/parent-link/links";
import { withHiddenLinks } from "@/lib/parent-link/token";
import { makeFeeSchool, type FeeSchool } from "./fixture";
import { d } from "../attendance/fixture";

const job = (f: FeeSchool): SchoolContext => ({ schoolId: f.school.id, userId: null });
const preview = (f: FeeSchool, day: Date) => withSchool(f.ctx, (tx) => reminderSettingsPreview(tx, f.ctx, day));
const JUL10 = d("2026-07-10");

let f: FeeSchool;

beforeAll(async () => {
  f = await makeFeeSchool();
  await withSchool(f.ctx, async (tx) => {
    await tx.paymentGatewayAccount.create({ data: { schoolId: f.school.id, displayName: "Razorpay test", provider: "razorpay", environment: "test", isActive: true, secretsEnc: "unused-in-this-test" } });
    await createLink(tx, f.ctx, f.ravi.guardian.id);
  });
}, 120_000);

describe("What a parent gets", () => {
  it("says reminders are off, and still shows a real family's message", async () => {
    const p = await preview(f, JUL10);
    expect(p.stops).toEqual(["Reminders are off. They go only when someone sends them from Defaulters."]);
    // Anil's father opted out, so the family shown is Ravi's (with a Parent Link) or Sita's (without).
    const ravi = p.sample?.parent === "Srinivas Kumar";
    expect(p.sample?.parent).toBe(ravi ? "Srinivas Kumar" : "Mohan Rao");
    expect(p.sample?.students).toEqual([ravi ? "Ravi Kumar" : "Sita Rao"]);
    expect(p.sample?.text).toContain(ravi ? "Pay online on your Parent Link: [personal Parent Link]" : "Pay online with this link (it works until");
    expect(p.sample?.way).toBe(ravi ? "Pay online on their own Parent Link (Razorpay)" : "A payment link for these fees (Razorpay) that works for 7 days");
    expect(p.online).toContain("Online payment is set up (Razorpay test)");
  });

  it("is exactly the message the parent then gets, links apart", async () => {
    await withSchool(f.ctx, (tx) => tx.feeSetting.update({ where: { schoolId: f.school.id }, data: { remindersOn: true, reminderDays: [0] } }));
    const p = await preview(f, JUL10);
    expect(p.stops).toEqual([]);
    expect(p.today.families).toBe(3);
    // No payment link is made by looking.
    expect(await withSchool(f.ctx, (tx) => tx.paymentLink.count())).toBe(0);
    expect((await withSchool(job(f), (tx) => automaticReminders(tx, job(f), JUL10))).status).toBe("sent");
    const shown = p.sample?.parent === "Srinivas Kumar" ? f.ravi.guardian.id : f.sita.guardian.id;
    const sent = await withSchool(f.ctx, (tx) => tx.messageRecipient.findFirstOrThrow({ where: { guardianId: shown, message: { ruleKey: "fee-due" } } }));
    expect(p.sample?.text).toBe(withHiddenLinks(sent.text));
    const ravi = await withSchool(f.ctx, (tx) => tx.messageRecipient.findFirstOrThrow({ where: { guardianId: f.ravi.guardian.id, message: { ruleKey: "fee-due" } } }));
    expect(withHiddenLinks(ravi.text)).toContain("Pay online on your Parent Link: [personal Parent Link]");
    // A parent without a Parent Link: the preview names the payment link the same way the message does.
    const sita = await withSchool(f.ctx, (tx) => tx.messageRecipient.findFirstOrThrow({ where: { guardianId: f.sita.guardian.id, message: { ruleKey: "fee-due" } } }));
    expect(withHiddenLinks(sita.text)).toContain("Pay online with this link (it works until");
    expect(withHiddenLinks(sita.text)).toContain(": [payment link]");
    // Today they have all been reminded.
    expect((await preview(f, JUL10)).today).toMatchObject({ families: 0, left: { done: 3 } });
  });

  it("says when the rule is off in Message Settings", async () => {
    await withSchool(f.ctx, (tx) => tx.automaticMessageRule.upsert({ where: { schoolId_key: { schoolId: f.school.id, key: "fee-due" } }, create: { schoolId: f.school.id, key: "fee-due", isOn: false }, update: { isOn: false } }));
    const p = await preview(f, JUL10);
    expect(p.stops.join(" ")).toContain("switched off in Message Settings");
    await withSchool(f.ctx, (tx) => tx.automaticMessageRule.update({ where: { schoolId_key: { schoolId: f.school.id, key: "fee-due" } }, data: { isOn: true } }));
  });

  it("warns when the template's words do not say how to pay", async () => {
    await withSchool(f.ctx, async (tx) => {
      const t = await tx.template.findFirstOrThrow({ where: { key: "fee-due", channel: "whatsapp" } });
      await tx.templateVersion.updateMany({ where: { templateId: t.id, language: "en" }, data: { body: "Dear {guardian_name}, {due_amount} for {student_name} is due on {due_date}. - {school_name}", variables: ["guardian_name", "due_amount", "student_name", "due_date", "school_name"] } });
    });
    const p = await preview(f, JUL10);
    expect(p.warnings).toContain("The “Fee reminder” WhatsApp template has no {how_to_pay}, so parents are not told how to pay. Add {how_to_pay} to it in Message Templates.");
  });

  it("says the school office when online payment is not set up, and shows nothing when nobody owes", async () => {
    const g = await makeFeeSchool();
    const p = await preview(g, JUL10);
    expect(p.online).toContain("Online payment is not set up");
    expect(p.sample?.text).toContain("Please pay at the school office.");
    await withSchool(g.ctx, (tx) => tx.studentFeeDue.updateMany({ data: { balancePaise: 0 } }));
    expect((await preview(g, JUL10)).sample).toBeNull();
  }, 120_000);
});
