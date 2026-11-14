// SMS is not offered for now (owner, 15 Nov 2026: "WhatsApp messages only"): with
// SMS_OFFERED false nothing is planned by SMS, even in a school whose SMS is
// switched on, by default, by an explicit choice, as a fallback or as SMS backup.
// The SMS code stays; tests of it switch SMS_OFFERED on for themselves.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { planMessage } from "@/lib/messaging";
import { onChannels, preferredChannel, PREFERRED_ORDER } from "@/lib/messaging/channels";
import { offeredChannels, SMS_OFFERED } from "@/lib/messaging/sms-offered";
import { updateSettings } from "@/lib/messaging/settings";
import { addDlt, makeCommSchool } from "./fixture";

let s: Awaited<ReturnType<typeof makeCommSchool>>;
beforeAll(async () => {
  s = await makeCommSchool();
  await addDlt(s.ctx, "general");
  await addDlt(s.ctx, "fee-due");
});

describe("SMS not offered", () => {
  it("is switched off, and screens leave SMS out of their choices", () => {
    expect(SMS_OFFERED).toBe(false);
    expect(offeredChannels(["whatsapp", "sms", "email", "app"])).toEqual(["whatsapp", "email", "app"]);
    expect(PREFERRED_ORDER).not.toContain("sms");
  });

  it("does not count SMS as ready, even when the school switched it on", async () => {
    const on = await withSchool(s.ctx, (tx) => onChannels(tx, s.ctx));
    expect(on.has("sms")).toBe(false);
    expect(on.has("whatsapp")).toBe(true);
    expect(await withSchool(s.ctx, (tx) => preferredChannel(tx, s.ctx))).toBe("whatsapp");
  });

  it("never plans a message by SMS: preferred, chosen with WhatsApp, as a fallback or as SMS backup", async () => {
    await withSchool(s.ctx, (tx) => updateSettings(tx, s.ctx, (x) => ({ ...x, smsBackup: { ...x.smsBackup, fee: { on: true, waitMinutes: 120 } } })));
    const plans = await withSchool(s.ctx, async (tx) => {
      const fee = (await tx.template.findFirstOrThrow({ where: { key: "fee-due", channel: "whatsapp" } })).id;
      const feeSms = (await tx.template.findFirstOrThrow({ where: { key: "fee-due", channel: "sms" } })).id;
      const values = { [s.ravi.id]: { due_amount: "₹500", due_date: "15-10-2026", how_to_pay: "Please pay at the school office." } };
      return [
        await planMessage(tx, s.ctx, { to: { kinds: ["parents"], sectionIds: [s.a.id] }, channels: "preferred", text: "School closed tomorrow." }),
        await planMessage(tx, s.ctx, { to: { kinds: ["parents"], sectionIds: [s.a.id] }, channels: ["whatsapp", "sms"], text: "School closed tomorrow." }),
        await planMessage(tx, s.ctx, { to: { kinds: ["parents"], sectionIds: [s.a.id] }, channels: ["email"], fallback: ["sms"], text: "School closed tomorrow.", title: "Closed" }),
        await planMessage(tx, s.ctx, { to: { guardiansOf: [s.ravi.id] }, channels: ["whatsapp"], templates: { whatsapp: fee, sms: feeSms }, perStudent: values, messageType: "fee", smsBackup: true, backupTemplateId: feeSms }),
      ];
    });
    for (const plan of plans) {
      expect(plan.rows.some((r) => r.channel === "sms")).toBe(false);
      expect(plan.channels).not.toContain("sms");
      expect(plan.backupCost).toBe(0);
      expect(plan.backupTemplateId).toBeNull();
      expect(plan.cost.sms ?? 0).toBe(0);
    }
    expect(plans[0].rows.length).toBeGreaterThan(0);
    expect(plans[1].rows.length).toBeGreaterThan(0);
  });

  it("refuses a message asked for by SMS only, in plain words", async () => {
    const plan = await withSchool(s.ctx, async (tx) => planMessage(tx, s.ctx, {
      to: { kinds: ["parents"], sectionIds: [s.a.id] }, channels: ["sms"],
      templates: { sms: (await tx.template.findFirstOrThrow({ where: { key: "general", channel: "sms" } })).id }, text: "School closed tomorrow.",
    }));
    expect(plan.rows).toHaveLength(0);
    expect(plan.problems).toContain("SMS is not used for now. Send by WhatsApp instead.");
  });
});
