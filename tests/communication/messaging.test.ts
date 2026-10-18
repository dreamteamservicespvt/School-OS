// Communication's messaging API: recipients, opt-outs, scope, template
// checks, the DLT rule, credits, scheduling, retries and the delivery job
// (11-communication.md §5 and §9).
import { beforeAll, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { withSchool } from "@/lib/db";
import "@/lib/messaging/jobs";
import { runDueJobs } from "@/lib/jobs";
import { planMessage, sendMessage, MessagingProblem, sendAutomatic, cancelScheduled, retryFailed } from "@/lib/messaging";
import { deliverMessage, runSmsBackup } from "@/lib/messaging/deliver";
import { scopeFor } from "@/lib/messaging/recipients";
import { creditBalances } from "@/lib/messaging/credits";
import { updateSettings } from "@/lib/messaging/settings";
import { handleWhatsappWebhook } from "@/lib/messaging/webhooks";
import { addDlt, makeCommSchool, templateId } from "./fixture";

let s: Awaited<ReturnType<typeof makeCommSchool>>;

beforeAll(async () => {
  s = await makeCommSchool();
});

/** Runs this school's due jobs only: other test files' jobs share the queue. */
async function runAll() {
  for (let i = 0; i < 10; i++) if ((await runDueJobs(50, { schoolId: s.school.id })) === 0) break;
}

describe("who gets a message", () => {
  it("sends once to a parent of two children, skips opted-out parents and uses each parent's language", async () => {
    const wa = await templateId(s.ctx, "absence", "whatsapp");
    const plan = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, { to: { kinds: ["parents"], classIds: [s.cls.id] }, channels: ["whatsapp"], templates: { whatsapp: wa } }));
    const names = plan.rows.map((r) => r.candidate.name).sort();
    expect(names).toEqual(["Other Section Father", "Padma Reddy", "Srinivas Kumar"]);
    expect(plan.skipped).toEqual([expect.objectContaining({ reason: "Opted out of messages", count: 1, names: ["Opted Out Father"] })]);
    const father = plan.rows.find((r) => r.candidate.name === "Srinivas Kumar")!;
    expect(father.text).toContain("Ravi Kumar and Sita Kumar");
    const telugu = plan.rows.find((r) => r.candidate.name === "Padma Reddy")!;
    expect(telugu.language).toBe("te");
    expect(telugu.text).toContain("పాఠశాలకు");
    expect(plan.cost.whatsapp).toBe(3);
  });

  it("an emergency broadcast reaches parents who opted out", async () => {
    const plan = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, { to: { kinds: ["parents"], sectionIds: [s.a.id] }, channels: ["whatsapp"], text: "School closes at 12 today due to heavy rain.", emergency: true }));
    expect(plan.rows.map((r) => r.candidate.name)).toContain("Opted Out Father");
    expect(plan.skipped).toEqual([]);
  });

  it("all guardians sends to father and mother", async () => {
    const plan = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, { to: { guardiansOf: [s.ravi.id], allGuardians: true }, channels: ["whatsapp"], text: "Hello {guardian_name}" }));
    expect(plan.rows.map((r) => r.text).sort()).toEqual(["Hello Lakshmi Kumar", "Hello Srinivas Kumar"]);
  });

  it("two guardians on the same phone get one message", async () => {
    const shared = await withSchool(s.ctx, (tx) => tx.guardian.update({ where: { id: s.mother.id }, data: { phone: (s.father.phone) } }));
    const plan = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, { to: { guardianIds: [s.father.id, s.mother.id] }, channels: ["whatsapp"], text: "School reopens on Monday." }));
    expect(plan.rows).toHaveLength(1);
    expect(plan.skipped[0].reason).toMatch(/^Same number as/);
    await withSchool(s.ctx, (tx) => tx.guardian.update({ where: { id: shared.id }, data: { phone: "9123456780" } }));
  });

  it("a teacher can only reach their own sections", async () => {
    const tctx = { schoolId: s.school.id, userId: s.teacher.id };
    const plan = await withSchool(tctx, async (tx) => {
      const scope = await scopeFor(tx, tctx, "own", ["class-teacher"]);
      expect(scope.sectionIds).toEqual([s.a.id]);
      return planMessage(tx, tctx, { to: { kinds: ["parents"], guardianIds: [s.otherFather.id] }, channels: ["whatsapp"], text: "Hello", scope });
    });
    const reached = plan.rows.map((r) => r.candidate.name);
    expect(reached).toContain("Padma Reddy");
    expect(reached).not.toContain("Other Section Father");
    expect(plan.skipped.find((g) => g.reason === "Outside your classes")?.names).toEqual(["Other Section Father"]);
  });
});

describe("template checks", () => {
  it("skips recipients with a missing blank and says so", async () => {
    const wa = await templateId(s.ctx, "fee-due", "whatsapp");
    const plan = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, {
      to: { guardiansOf: [s.ravi.id, s.priya.id, s.kiran.id] }, channels: ["whatsapp"], templates: { whatsapp: wa },
      perStudent: { [s.ravi.id]: { due_amount: "₹12,500", due_date: "15-10-2026" } },
    }));
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0].text).toContain("₹12,500");
    const missing = plan.skipped.find((g) => g.reason.startsWith("Has no due amount"));
    expect(missing?.count).toBe(2);
  });

  it("blocks a send to a single person with a missing blank", async () => {
    const wa = await templateId(s.ctx, "fee-due", "whatsapp");
    await expect(withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, { to: { guardiansOf: [s.priya.id] }, channels: ["whatsapp"], templates: { whatsapp: wa }, single: true }))).rejects.toThrow(MessagingProblem);
  });
});

describe("SMS and DLT (rule 34)", () => {
  it("refuses a typed SMS and an SMS template without a DLT template ID", async () => {
    const typed = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, { to: { guardiansOf: [s.ravi.id] }, channels: ["sms"], text: "Hello" }));
    expect(typed.problems.join(" ")).toMatch(/only be sent from a template with a DLT template ID/);
    const sms = await templateId(s.ctx, "general", "sms");
    const noDlt = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, { to: { guardiansOf: [s.ravi.id] }, channels: ["sms"], templates: { sms }, values: { message: "Hello" } }));
    expect(noDlt.problems.join(" ")).toMatch(/has no DLT template ID/);
    await expect(withSchool(s.ctx, (tx) => sendMessage(tx, s.ctx, { to: { guardiansOf: [s.ravi.id] }, channels: ["sms"], templates: { sms }, values: { message: "Hello" } }))).rejects.toThrow(/DLT template ID/);
    await addDlt(s.ctx, "general");
    const ok = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, { to: { guardiansOf: [s.ravi.id] }, channels: ["sms"], templates: { sms }, values: { message: "Hello" } }));
    expect(ok.problems).toEqual([]);
    expect(ok.rows[0].credits).toBe(1);
  });
});

describe("credits", () => {
  it("blocks a send when credits are short and takes credits when sent", async () => {
    const low = await makeCommSchool({ credits: 1 });
    await expect(withSchool(low.ctx, (tx) => sendMessage(tx, low.ctx, { to: { kinds: ["parents"], classIds: [low.cls.id] }, channels: ["whatsapp"], text: "Hello" }))).rejects.toThrow(/WhatsApp needs 3 credits\. You have 1\./);
    const before = await withSchool(s.ctx, (tx) => creditBalances(tx, s.ctx));
    await withSchool(s.ctx, (tx) => sendMessage(tx, s.ctx, { to: { kinds: ["parents"], classIds: [s.cls.id] }, channels: ["whatsapp"], text: "Hello" }));
    const after = await withSchool(s.ctx, (tx) => creditBalances(tx, s.ctx));
    expect(before.whatsapp - after.whatsapp).toBe(3);
  });
});

describe("delivery", () => {
  it("delivers each recipient once, even when the job runs twice", async () => {
    const r = await withSchool(s.ctx, (tx) => sendMessage(tx, s.ctx, { to: { kinds: ["parents"], sectionIds: [s.a.id] }, channels: ["whatsapp", "email"], text: "PTM on Saturday", title: "PTM" }));
    await runAll();
    await withSchool(s.ctx, (tx) => deliverMessage(tx, s.ctx, { messageId: r.messageId, round: "0", chunk: 0 }));
    const rows = await withSchool(s.ctx, (tx) => tx.messageRecipient.findMany({ where: { messageId: r.messageId } }));
    const wa = rows.filter((x) => x.channel === "whatsapp");
    expect(wa.length).toBe(2);
    expect(wa.every((x) => x.status === "DELIVERED" && x.attempts === 1)).toBe(true);
    const msg = await withSchool(s.ctx, (tx) => tx.message.findUniqueOrThrow({ where: { id: r.messageId } }));
    expect(msg.status).toBe("SENT");
    // Nobody in 5 A has an email address: those were left out with the reason.
    expect(rows.filter((x) => x.channel === "email")).toHaveLength(0);
  });

  it("the same idempotency key never sends twice", async () => {
    const one = await withSchool(s.ctx, (tx) => sendMessage(tx, s.ctx, { to: { guardiansOf: [s.ravi.id] }, channels: ["whatsapp"], text: "Receipt", idempotencyKey: "test:receipt:1" }));
    const two = await withSchool(s.ctx, (tx) => sendMessage(tx, s.ctx, { to: { guardiansOf: [s.ravi.id] }, channels: ["whatsapp"], text: "Receipt", idempotencyKey: "test:receipt:1" }));
    expect(two.messageId).toBe(one.messageId);
    expect(two.repeated).toBe(true);
  });

  it("a scheduled message can be cancelled and is never sent; its credits come back", async () => {
    const before = await withSchool(s.ctx, (tx) => creditBalances(tx, s.ctx));
    const r = await withSchool(s.ctx, (tx) => sendMessage(tx, s.ctx, { to: { guardiansOf: [s.ravi.id] }, channels: ["whatsapp"], text: "Tomorrow is a holiday", scheduledAt: new Date(Date.now() + 3600_000) }));
    expect(r.scheduled).toBe(true);
    await withSchool(s.ctx, (tx) => cancelScheduled(tx, s.ctx, r.messageId));
    await withSchool(s.ctx, (tx) => deliverMessage(tx, s.ctx, { messageId: r.messageId, round: "0", chunk: 0 }));
    const rows = await withSchool(s.ctx, (tx) => tx.messageRecipient.findMany({ where: { messageId: r.messageId } }));
    expect(rows.every((x) => x.status === "FAILED" && !x.providerMessageId)).toBe(true);
    const after = await withSchool(s.ctx, (tx) => creditBalances(tx, s.ctx));
    expect(after.whatsapp).toBe(before.whatsapp);
    await expect(withSchool(s.ctx, (tx) => cancelScheduled(tx, s.ctx, r.messageId))).rejects.toThrow(/cannot be cancelled/);
  });

  it("failed recipients can be retried up to the limit", async () => {
    await withSchool(s.ctx, (tx) => updateSettings(tx, s.ctx, (x) => ({ ...x, retryLimit: 2 })));
    const r = await withSchool(s.ctx, (tx) => sendMessage(tx, s.ctx, { to: { guardiansOf: [s.ravi.id] }, channels: ["whatsapp"], text: "Hello" }));
    await runAll();
    const fail = () => withSchool(s.ctx, (tx) => tx.messageRecipient.updateMany({ where: { messageId: r.messageId }, data: { status: "FAILED", failReason: "Number not on WhatsApp." } }));
    await fail();
    await withSchool(s.ctx, (tx) => retryFailed(tx, s.ctx, r.messageId));
    await runAll();
    await fail();
    await withSchool(s.ctx, (tx) => retryFailed(tx, s.ctx, r.messageId));
    await runAll();
    await fail();
    // Third retry: attempts are now 3, over the limit of 2.
    await expect(withSchool(s.ctx, (tx) => retryFailed(tx, s.ctx, r.messageId))).rejects.toThrow(/Nothing to retry/);
  });
});

describe("automatic messages", () => {
  it("never sends the same event twice and stops when the rule is off", async () => {
    const event = { key: `attendance:2026-10-09:${s.ravi.id}`, label: "Absent on 09-10-2026" };
    const first = await withSchool(s.ctx, (tx) => sendAutomatic(tx, s.ctx, { rule: "absence", event, to: { guardiansOf: [s.ravi.id] }, perStudent: { [s.ravi.id]: {} } }));
    expect(first.status).toBe("sent");
    const second = await withSchool(s.ctx, (tx) => sendAutomatic(tx, s.ctx, { rule: "absence", event, to: { guardiansOf: [s.ravi.id] }, perStudent: { [s.ravi.id]: {} } }));
    expect(second.status).toBe("duplicate");
    const log = await withSchool(s.ctx, (tx) => tx.automationLog.findMany({ where: { eventKey: event.key } }));
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ ruleKey: "absence", outcome: "sent", eventLabel: "Absent on 09-10-2026" });

    await withSchool(s.ctx, (tx) => tx.automaticMessageRule.create({ data: { schoolId: s.school.id, key: "absence", isOn: false } }));
    const off = await withSchool(s.ctx, (tx) => sendAutomatic(tx, s.ctx, { rule: "absence", event: { key: `attendance:2026-10-10:${s.priya.id}`, label: "Absent" }, to: { guardiansOf: [s.priya.id] } }));
    expect(off.status).toBe("off");
    await withSchool(s.ctx, (tx) => tx.automaticMessageRule.update({ where: { schoolId_key: { schoolId: s.school.id, key: "absence" } }, data: { isOn: true } }));
  });

  it("logs opted-out parents and does not message them", async () => {
    const r = await withSchool(s.ctx, (tx) => sendAutomatic(tx, s.ctx, { rule: "absence", event: { key: `attendance:2026-10-09:${s.anil.id}`, label: "Absent" }, to: { guardiansOf: [s.anil.id] } }));
    expect(r.status).toBe("nobody");
    const log = await withSchool(s.ctx, (tx) => tx.automationLog.findFirstOrThrow({ where: { eventKey: `attendance:2026-10-09:${s.anil.id}` } }));
    expect(log.outcome).toBe("opted-out");
  });

  it("SMS backup sends a failed WhatsApp fee message by SMS, once", async () => {
    await addDlt(s.ctx, "fee-due");
    await withSchool(s.ctx, (tx) => updateSettings(tx, s.ctx, (x) => ({ ...x, smsBackup: { ...x.smsBackup, fee: { on: true, waitMinutes: 120 } } })));
    const plan = await withSchool(s.ctx, async (tx) => planMessage(tx, s.ctx, { to: { guardiansOf: [s.ravi.id] }, channels: ["whatsapp"], templates: { whatsapp: (await tx.template.findFirstOrThrow({ where: { key: "fee-due", channel: "whatsapp" } })).id }, perStudent: { [s.ravi.id]: { due_amount: "₹500", due_date: "15-10-2026" } }, messageType: "fee", smsBackup: true, ruleKey: "fee-due" }));
    expect(plan.backupCost).toBe(1);
    const res = await withSchool(s.ctx, (tx) => sendAutomatic(tx, s.ctx, { rule: "fee-due", event: { key: `fee-due:t1:${s.ravi.id}`, label: "Fee due" }, to: { guardiansOf: [s.ravi.id] }, perStudent: { [s.ravi.id]: { due_amount: "₹500", due_date: "15-10-2026" } } }));
    expect(res.status).toBe("sent");
    const messageId = res.status === "sent" ? res.result.messageId : "";
    await runAll();
    await withSchool(s.ctx, (tx) => tx.messageRecipient.updateMany({ where: { messageId }, data: { status: "FAILED", failReason: "Number not on WhatsApp." } }));
    expect(await withSchool(s.ctx, (tx) => runSmsBackup(tx, s.ctx))).toBe(1);
    expect(await withSchool(s.ctx, (tx) => runSmsBackup(tx, s.ctx))).toBe(0);
    await runAll();
    const backup = await withSchool(s.ctx, (tx) => tx.messageRecipient.findFirstOrThrow({ where: { messageId, isBackup: true } }));
    expect(backup).toMatchObject({ channel: "sms", status: "DELIVERED" });
    expect(backup.backupReason).toMatch(/WhatsApp failed/);
  });
});

describe("delivery reports", () => {
  it("accepts signed WhatsApp read receipts and refuses unsigned ones", async () => {
    const r = await withSchool(s.ctx, (tx) => sendMessage(tx, s.ctx, { to: { guardiansOf: [s.priya.id] }, channels: ["whatsapp"], text: "Read me" }));
    await runAll();
    const rec = await withSchool(s.ctx, (tx) => tx.messageRecipient.findFirstOrThrow({ where: { messageId: r.messageId } }));
    const body = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: rec.providerMessageId, status: "read", timestamp: String(Math.floor(Date.now() / 1000)) }] } }] }] });
    expect((await handleWhatsappWebhook(s.school.id, body, "sha256=bad")).status).toBe(401);
    const sig = `sha256=${createHmac("sha256", "app-secret-1234").update(body).digest("hex")}`;
    expect((await handleWhatsappWebhook(s.school.id, body, sig)).status).toBe(200);
    const after = await withSchool(s.ctx, (tx) => tx.messageRecipient.findUniqueOrThrow({ where: { id: rec.id } }));
    expect(after.status).toBe("READ");
    // An older "delivered" report never moves it back.
    const late = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: rec.providerMessageId, status: "delivered" }] } }] }] });
    await handleWhatsappWebhook(s.school.id, late, `sha256=${createHmac("sha256", "app-secret-1234").update(late).digest("hex")}`);
    expect((await withSchool(s.ctx, (tx) => tx.messageRecipient.findUniqueOrThrow({ where: { id: rec.id } }))).status).toBe("READ");
  });
});
