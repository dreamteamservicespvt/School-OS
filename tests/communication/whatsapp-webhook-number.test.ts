// A school's WhatsApp webhook reads only events for the school's own WhatsApp
// number (security audit run-1 lead). Schools connected through the same Meta
// app share its app secret, so a correctly signed event for school B's number,
// sent to school A's webhook address, used to opt A's parents out ("STOP"),
// change A's delivery statuses and fill A's inbox. Each Meta change names the
// number it is for (value.metadata.phone_number_id); others are now skipped.
import { beforeAll, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { withSchool } from "@/lib/db";
import { handleWhatsappWebhook } from "@/lib/messaging/webhooks";
import { makeCommSchool } from "./fixture";

let s: Awaited<ReturnType<typeof makeCommSchool>>;
const OURS = "100000000000001";
const THEIRS = "200000000000002";

const signed = (body: string) => `sha256=${createHmac("sha256", "app-secret-1234").update(body).digest("hex")}`;
const stopFrom = (phone: string, phoneNumberId: string) => JSON.stringify({
  entry: [{ changes: [{ value: { metadata: { phone_number_id: phoneNumberId }, messages: [{ id: `wamid.${phoneNumberId}${phone}`, from: `91${phone}`, text: { body: "STOP" } }] } }] }],
});

beforeAll(async () => {
  s = await makeCommSchool();
  await withSchool(s.ctx, (tx) => tx.messagingChannel.update({
    where: { schoolId_channel: { schoolId: s.school.id, channel: "whatsapp" } },
    data: { provider: "meta-cloud", config: { phoneNumberId: OURS, businessAccountId: "300000000000003" } },
  }));
});

describe("the WhatsApp webhook is bound to the school's own number", () => {
  it("skips an event for another WhatsApp number, even when it is correctly signed", async () => {
    const g = await withSchool(s.ctx, (tx) => tx.guardian.findFirstOrThrow({ where: { optedOut: false } }));
    const body = stopFrom(g.phone!, THEIRS);
    expect((await handleWhatsappWebhook(s.school.id, body, signed(body))).status).toBe(200);
    expect((await withSchool(s.ctx, (tx) => tx.guardian.findUniqueOrThrow({ where: { id: g.id } }))).optedOut).toBe(false);
  });

  it("skips an event that names no number", async () => {
    const g = await withSchool(s.ctx, (tx) => tx.guardian.findFirstOrThrow({ where: { optedOut: false } }));
    const body = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: "wamid.none", from: `91${g.phone}`, text: { body: "STOP" } }] } }] }] });
    expect((await handleWhatsappWebhook(s.school.id, body, signed(body))).status).toBe(200);
    expect((await withSchool(s.ctx, (tx) => tx.guardian.findUniqueOrThrow({ where: { id: g.id } }))).optedOut).toBe(false);
  });

  it("reads an event for the school's own number", async () => {
    const g = await withSchool(s.ctx, (tx) => tx.guardian.findFirstOrThrow({ where: { optedOut: false } }));
    const body = stopFrom(g.phone!, OURS);
    expect((await handleWhatsappWebhook(s.school.id, body, signed(body))).status).toBe(200);
    expect((await withSchool(s.ctx, (tx) => tx.guardian.findUniqueOrThrow({ where: { id: g.id } }))).optedOut).toBe(true);
  });
});
