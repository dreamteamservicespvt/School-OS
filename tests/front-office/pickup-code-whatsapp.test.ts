// Live test 16 Nov 2026: no one-time code sent by WhatsApp ever arrived (Meta does not deliver
// Authentication messages to +91 numbers), yet the desk was told "Code sent". On a real WhatsApp
// account a code now never goes by WhatsApp: the desk is told why, and to call the guardian.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { codeChannels, WHATSAPP_NO_CODES } from "@/lib/messaging/channels";
import { pickupCodeCheckFor, sendPickupCode } from "@/lib/front-office/pickup";
import { as, makeFrontOfficeSchool, type FoFixture } from "./fixture";

let f: FoFixture;

beforeAll(async () => {
  f = await makeFrontOfficeSchool();
  await withSchool(as(f, null), async (tx) => {
    const live = { isOn: true, provider: "meta-cloud", environment: "live", config: { phoneNumberId: "1", businessAccountId: "2" } };
    await tx.messagingChannel.upsert({ where: { schoolId_channel: { schoolId: f.school.id, channel: "whatsapp" } }, update: live, create: { schoolId: f.school.id, channel: "whatsapp", ...live } });
    await tx.messagingChannel.upsert({ where: { schoolId_channel: { schoolId: f.school.id, channel: "sms" } }, update: { isOn: false }, create: { schoolId: f.school.id, channel: "sms", isOn: false } });
  });
});

describe("one-time codes on a real WhatsApp account", () => {
  it("never go by WhatsApp", async () => {
    expect((await withSchool(as(f, null), (tx) => codeChannels(tx, as(f, null)))).has("whatsapp")).toBe(false);
  });
  it("with the check switched on, it does not apply while no code can go, so a child can still be released", async () => {
    const r = await withSchool(as(f, null), (tx) => pickupCodeCheckFor(tx, as(f, null), true));
    expect(r.on).toBe(false);
    expect(r.why).toBe(`Pickup code check is on, but ${WHATSAPP_NO_CODES}. Check the photo, ID proof or call a guardian instead.`);
    expect((await withSchool(as(f, null), (tx) => pickupCodeCheckFor(tx, as(f, null), false))).on).toBe(false);
  });
  it("the desk is told the pickup code cannot go, and to call the guardian", async () => {
    const ctx = as(f, f.office.id);
    await expect(withSchool(ctx, (tx) => sendPickupCode(tx, ctx, f.aarav.id, f.father.id))).rejects.toThrow(`The code could not be sent: ${WHATSAPP_NO_CODES}. Verify by calling the guardian instead.`);
  });
});
