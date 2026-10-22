// Send Message checks found in browser testing (qa/results/communication-defects.md):
// a blank that is not on the list (COMM-01, COMM-02), Resend to unread before the
// message has gone (COMM-03), test mode using credits and counting as delivered
// (COMM-04), and "14 has no …" (COMM-06).
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import "@/lib/messaging/jobs";
import { runDueJobs } from "@/lib/jobs";
import { planMessage, sendMessage, skippedWords } from "@/lib/messaging/send";
import { deliverMessage, retryFailed, cancelScheduled } from "@/lib/messaging/deliver";
import { planResend, unreadCount } from "@/lib/messaging/resend";
import { creditBalances } from "@/lib/messaging/credits";
import { countsFor } from "@/lib/communication/history";
import { SYSTEM_SCOPE } from "@/lib/messaging/recipients";
import { blanksFor, suggestBlank, unfitBlankWords, unknownBlankWords } from "@/lib/messaging/blanks";
import { countWithReason } from "@/lib/messaging/skip-words";
import { makeCommSchool } from "./fixture";

type School = Awaited<ReturnType<typeof makeCommSchool>>;
let s: School;

beforeAll(async () => {
  s = await makeCommSchool();
});

async function runAll(school: School) {
  for (let i = 0; i < 10; i++) if ((await runDueJobs(50, { schoolId: school.school.id })) === 0) break;
}

/** WhatsApp on a real account, with the ready templates approved; nothing is delivered in these tests. */
async function goLive(school: School) {
  await withSchool(school.ctx, async (tx) => {
    await tx.messagingChannel.update({ where: { schoolId_channel: { schoolId: school.school.id, channel: "whatsapp" } }, data: { provider: "meta-cloud", environment: "live" } });
    const wa = await tx.template.findMany({ where: { schoolId: school.school.id, channel: "whatsapp" }, select: { id: true, key: true } });
    for (const t of wa) await tx.templateVersion.updateMany({ where: { templateId: t.id }, data: { whatsappStatus: "APPROVED", whatsappName: `t_${t.key}` } });
  });
}

describe("a blank that is not on the list (COMM-01, COMM-02)", () => {
  it("names the blank and the one meant, blocks the send, and counts nobody as 'has no parent name'", async () => {
    const input = { to: { kinds: ["parents" as const], classIds: [s.cls.id] }, channels: ["whatsapp" as const], text: "Dear {parent_name}, the PTM is on Saturday." };
    const plan = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, input));
    expect(plan.problems[0]).toMatch(/^\{parent_name\} is not a blank the school can use\. Did you mean \{guardian_name\}\? Blanks you can use: \{guardian_name\}, \{student_name\}, \{class\}/);
    // Everyone is still counted; the preview shows the words as typed.
    expect(plan.people).toBe(3);
    expect(plan.skipped.some((g) => /parent name/i.test(g.reason))).toBe(false);
    expect(plan.rows[0].text).toContain("{parent_name}");
    await expect(withSchool(s.ctx, (tx) => sendMessage(tx, s.ctx, input))).rejects.toThrow(/\{parent_name\} is not a blank the school can use/);
  });

  it("checks the title too, and lists the staff blanks for staff", async () => {
    const plan = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, { to: { staffIds: [s.officeStaff.id] }, channels: ["app"], title: "Hello {teacher_name}", text: "Staff meeting at 4." }));
    expect(plan.problems[0]).toBe("{teacher_name} is not a blank the school can use. Did you mean {staff_name}? Blanks you can use: {staff_name}, {school_name}, {school_phone}, {date}.");
  });

  it("a real blank still fills in", async () => {
    const plan = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, { to: { guardiansOf: [s.ravi.id] }, channels: ["whatsapp"], text: "Dear {guardian_name}, the PTM is on Saturday." }));
    expect(plan.problems).toEqual([]);
    expect(plan.rows[0].text).toBe("Dear Srinivas Kumar, the PTM is on Saturday.");
  });

  it("suggests the blank meant, and says which blanks fit the people chosen", () => {
    expect(suggestBlank("parent_name")).toBe("guardian_name");
    expect(suggestBlank("studnet_name")).toBe("student_name");
    expect(suggestBlank("class_name")).toBe("class");
    expect(suggestBlank("xyz_abc_qq")).toBeNull();
    expect(blanksFor(["parents"])).toEqual(["guardian_name", "student_name", "class", "admission_no", "school_name", "school_phone", "date"]);
    expect(blanksFor(["parents", "students"])).not.toContain("guardian_name");
    expect(blanksFor([])).toEqual(["school_name", "school_phone", "date"]);
    expect(unknownBlankWords(["foo"], ["school_name"])).toBe("{foo} is not a blank the school can use. Blanks you can use: {school_name}.");
    expect(unknownBlankWords(["parent_name", "name"], blanksFor(["parents"]))).toMatch(/^\{parent_name\} and \{name\} are not blanks the school can use\. Did you mean \{guardian_name\} for \{parent_name\} and \{student_name\} for \{name\}\?/);
    expect(unfitBlankWords("Hello {staff_name}", ["parents"])).toMatch(/^\{staff_name\} cannot be filled in a message typed here for parents/);
    expect(unfitBlankWords("Hello {guardian_name}", ["parents"])).toBeNull();
  });
});

describe("words for people left out (COMM-06)", () => {
  it("says 'have' for more than one", () => {
    expect(countWithReason(14, "Has no parent name")).toBe("14 have no parent name");
    expect(countWithReason(1, "Has no parent name")).toBe("1 has no parent name");
    expect(countWithReason(2, "Opted out of messages")).toBe("2 opted out of messages");
    expect(skippedWords([{ reason: "Has no due amount", count: 3, names: [] }, { reason: "Opted out of messages", count: 1, names: [] }])).toBe("3 have no due amount; 1 opted out of messages");
  });
});

describe("Resend to unread (COMM-03)", () => {
  it("is offered only after the message has gone, to people it went to", async () => {
    const r = await withSchool(s.ctx, (tx) => sendMessage(tx, s.ctx, { to: { kinds: ["parents"], sectionIds: [s.a.id] }, channels: ["whatsapp"], text: "Sports day is on Friday." }));
    // Still queued: nobody has been sent it, so there is nobody to resend to.
    expect(await withSchool(s.ctx, (tx) => unreadCount(tx, s.ctx, r.messageId))).toBe(0);
    await expect(withSchool(s.ctx, (tx) => planResend(tx, s.ctx, r.messageId, "unread", "whatsapp", SYSTEM_SCOPE))).rejects.toThrow(/still going out/);
    await runAll(s);
    expect(await withSchool(s.ctx, (tx) => unreadCount(tx, s.ctx, r.messageId))).toBe(r.people);
    // Someone who read it is left out.
    await withSchool(s.ctx, async (tx) => {
      const one = await tx.messageRecipient.findFirstOrThrow({ where: { messageId: r.messageId } });
      await tx.messageRecipient.update({ where: { id: one.id }, data: { status: "READ", readAt: new Date() } });
    });
    expect(await withSchool(s.ctx, (tx) => unreadCount(tx, s.ctx, r.messageId))).toBe(r.people - 1);
  });
});

describe("test mode (COMM-04)", () => {
  it("uses no credits, says so in the plan, and is never counted as delivered", async () => {
    const before = await withSchool(s.ctx, (tx) => creditBalances(tx, s.ctx));
    const input = { to: { kinds: ["parents" as const], classIds: [s.cls.id] }, channels: ["whatsapp" as const], text: "Hello" };
    const plan = await withSchool(s.ctx, (tx) => planMessage(tx, s.ctx, input));
    expect(plan.cost.whatsapp).toBe(3);
    expect(plan.charged).toEqual({});
    expect(plan.testMode).toEqual(["whatsapp"]);
    const r = await withSchool(s.ctx, (tx) => sendMessage(tx, s.ctx, input));
    await runAll(s);
    const after = await withSchool(s.ctx, (tx) => creditBalances(tx, s.ctx));
    expect(after.whatsapp).toBe(before.whatsapp);
    const m = await withSchool(s.ctx, (tx) => tx.message.findUniqueOrThrow({ where: { id: r.messageId } }));
    expect(m.creditCost).toBe(0);
    const counts = (await withSchool(s.ctx, (tx) => countsFor(tx, s.ctx, [r.messageId]))).get(r.messageId)!;
    expect(counts).toMatchObject({ total: 3, delivered: 0, testMode: 3 });
  });

  it("sends in test mode even when credits are short", async () => {
    const low = await makeCommSchool({ credits: 1 });
    const r = await withSchool(low.ctx, (tx) => sendMessage(tx, low.ctx, { to: { kinds: ["parents"], classIds: [low.cls.id] }, channels: ["whatsapp"], text: "Hello" }));
    expect(r.people).toBe(3);
  });

  it("a retry in test mode uses no credits", async () => {
    const r = await withSchool(s.ctx, (tx) => sendMessage(tx, s.ctx, { to: { guardiansOf: [s.ravi.id] }, channels: ["whatsapp"], text: "Hello again" }));
    await runAll(s);
    await withSchool(s.ctx, (tx) => tx.messageRecipient.updateMany({ where: { messageId: r.messageId }, data: { status: "FAILED", failReason: "Number not on WhatsApp." } }));
    const before = await withSchool(s.ctx, (tx) => creditBalances(tx, s.ctx));
    await withSchool(s.ctx, (tx) => retryFailed(tx, s.ctx, r.messageId));
    const after = await withSchool(s.ctx, (tx) => creditBalances(tx, s.ctx));
    expect(after.whatsapp).toBe(before.whatsapp);
  });

  it("on a real account credits are checked and taken, and come back if the channel went to test mode before it was sent", async () => {
    const live = await makeCommSchool();
    await goLive(live);
    const low = await makeCommSchool({ credits: 1 });
    await goLive(low);
    await expect(withSchool(low.ctx, (tx) => sendMessage(tx, low.ctx, { to: { kinds: ["parents"], classIds: [low.cls.id] }, channels: ["whatsapp"], text: "Hello" }))).rejects.toThrow(/WhatsApp needs 3 credits\. You have 1\./);

    const before = await withSchool(live.ctx, (tx) => creditBalances(tx, live.ctx));
    const later = await withSchool(live.ctx, (tx) => sendMessage(tx, live.ctx, { to: { kinds: ["parents"], classIds: [live.cls.id] }, channels: ["whatsapp"], text: "Hello", scheduledAt: new Date(Date.now() + 3600_000) }));
    expect(before.whatsapp - (await withSchool(live.ctx, (tx) => creditBalances(tx, live.ctx))).whatsapp).toBe(3);
    await withSchool(live.ctx, (tx) => cancelScheduled(tx, live.ctx, later.messageId));
    expect((await withSchool(live.ctx, (tx) => creditBalances(tx, live.ctx))).whatsapp).toBe(before.whatsapp);

    const now = await withSchool(live.ctx, (tx) => sendMessage(tx, live.ctx, { to: { guardiansOf: [live.ravi.id] }, channels: ["whatsapp"], text: "Hello" }));
    expect(before.whatsapp - (await withSchool(live.ctx, (tx) => creditBalances(tx, live.ctx))).whatsapp).toBe(1);
    await withSchool(live.ctx, (tx) => tx.messagingChannel.update({ where: { schoolId_channel: { schoolId: live.school.id, channel: "whatsapp" } }, data: { provider: "sandbox", environment: "test" } }));
    await withSchool(live.ctx, (tx) => deliverMessage(tx, live.ctx, { messageId: now.messageId, round: "0", chunk: 0 }));
    const row = await withSchool(live.ctx, (tx) => tx.messageRecipient.findFirstOrThrow({ where: { messageId: now.messageId } }));
    expect(row).toMatchObject({ provider: "sandbox", credits: 0 });
    expect((await withSchool(live.ctx, (tx) => creditBalances(tx, live.ctx))).whatsapp).toBe(before.whatsapp);
  });
});
