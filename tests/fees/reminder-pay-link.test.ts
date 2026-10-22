// Every fee reminder says how to pay (06 §2 Defaulters, A7; gap list G11).
// With online payment set up (Razorpay, chosen in Fee Settings) a guardian
// with a Parent Link gets their own Parent Link (tied to them: a new phone
// needs a one-time code), and others a payment link for exactly those fees
// that works for 7 days. With online payment off the message says to pay at
// the school office. Message History keeps placeholders, never a link that
// opens or pays; the link is worked out only when the message goes out.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool, type SchoolContext } from "@/lib/db";
import { automaticReminders, previewReminders, reminderHistory, sendReminders } from "@/lib/fees/reminders";
import { COUNTER_WORDS, howToPay } from "@/lib/fees/reminder-pay";
import { linkByToken, LINK_DAYS } from "@/lib/fees/online";
import { createLink } from "@/lib/parent-link/links";
import { appUrl, linksIn, payPlaceholderFor, withHiddenLinks, withRealLinks } from "@/lib/parent-link/token";
import { updateSettings } from "@/lib/messaging/settings";
import { smsParts } from "@/lib/messaging/templates";
import { makeFeeSchool, type FeeSchool } from "./fixture";
import { d } from "../attendance/fixture";

const job = (f: FeeSchool): SchoolContext => ({ schoolId: f.school.id, userId: null });
const run = (f: FeeSchool, day: Date) => withSchool(job(f), (tx) => automaticReminders(tx, job(f), day));
const textTo = async (f: FeeSchool, guardianId: string, day: Date) => {
  const studentIds = [f.ravi.id, f.sita.id, f.anil.id];
  return withSchool(f.ctx, async (tx) => {
    const r = await tx.feeReminder.findFirstOrThrow({ where: { studentId: { in: studentIds }, onceKey: { endsWith: `:on:${day.toISOString().slice(0, 10)}` } } });
    return (await tx.messageRecipient.findFirstOrThrow({ where: { messageId: r.messageId!, guardianId } })).text;
  });
};
const gateway = (f: FeeSchool) => withSchool(f.ctx, (tx) => tx.paymentGatewayAccount.create({ data: { schoolId: f.school.id, displayName: "Razorpay test", provider: "razorpay", environment: "test", isActive: true, secretsEnc: "unused-in-this-test" } }));
const remindOn = (f: FeeSchool) => withSchool(f.ctx, (tx) => tx.feeSetting.update({ where: { schoolId: f.school.id }, data: { remindersOn: true, reminderDays: [0] } }));

describe("the words", () => {
  it("say how to pay, with the link last", () => {
    expect(howToPay("counter", null)).toBe("Please pay at the school office.");
    expect(howToPay("parent-link", "LINK")).toBe("Pay online on your Parent Link: LINK");
    expect(howToPay("parent-link-counter", "LINK")).toBe("Please pay at the school office. The fees due are on your Parent Link: LINK");
    expect(howToPay("pay-link", "LINK", d("2026-10-17"))).toBe("Pay online with this link (it works until 17-10-2026): LINK");
  });

  it("keep a payment link as a placeholder that opens only once it goes out", () => {
    const ph = payPlaceholderFor("11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222");
    expect(ph).not.toContain("/pay/");
    expect(withHiddenLinks(`Pay: ${ph}`)).toBe("Pay: [payment link]");
    expect(withRealLinks(`Pay: ${ph}`)).toMatch(new RegExp(`^Pay: ${appUrl()}/pay/11111111-1111-1111-1111-111111111111/[A-Za-z0-9_-]{40,}$`));
    expect(linksIn(ph)).toHaveLength(1);
    // An SMS is counted with the real link in it, not the (shorter, non-Latin) placeholder.
    const words = "Dear Parent, fee of Rs 6,000 for Ravi Kumar is due on 10-10-2026. Pay online with this link (it works until 17-10-2026): ";
    expect(smsParts(`${words}${ph}`)).toBe(smsParts(withRealLinks(`${words}${ph}`)));
  });
});

describe("online payment off", () => {
  let f: FeeSchool;
  beforeAll(async () => {
    f = await makeFeeSchool();
    await remindOn(f);
  }, 120_000);

  it("tells the parent to pay at the school office, with no link", async () => {
    expect((await run(f, d("2026-07-10"))).status).toBe("sent");
    const text = await textTo(f, f.ravi.guardian.id, d("2026-07-10"));
    expect(text).toContain(COUNTER_WORDS);
    expect(text).not.toMatch(/http|⟦/);
    expect(await withSchool(f.ctx, (tx) => tx.paymentLink.count({ where: { studentId: f.ravi.id } }))).toBe(0);
  });

  it("points a parent with a Parent Link at it, to see the fees due", async () => {
    const link = await withSchool(f.ctx, (tx) => createLink(tx, f.ctx, f.sita.guardian.id));
    expect((await run(f, d("2026-10-10"))).status).toBe("sent");
    const text = await textTo(f, f.sita.guardian.id, d("2026-10-10"));
    expect(text).toContain(`${COUNTER_WORDS} The fees due are on your Parent Link: ⟦parent-link:${link.id}⟧`);
    expect(withHiddenLinks(text)).toContain("[personal Parent Link]");
  });
});

describe("online payment set up", () => {
  let f: FeeSchool;
  let parentLinkId: string;
  beforeAll(async () => {
    f = await makeFeeSchool();
    await remindOn(f);
    await gateway(f);
    parentLinkId = (await withSchool(f.ctx, (tx) => createLink(tx, f.ctx, f.ravi.guardian.id))).id;
  }, 120_000);

  it("gives a parent with a Parent Link their own link to pay, and makes no payment link for them", async () => {
    expect((await run(f, d("2026-07-10"))).status).toBe("sent");
    const text = await textTo(f, f.ravi.guardian.id, d("2026-07-10"));
    expect(text).toContain(`Pay online on your Parent Link: ⟦parent-link:${parentLinkId}⟧`);
    expect(await withSchool(f.ctx, (tx) => tx.paymentLink.count({ where: { studentId: f.ravi.id } }))).toBe(0);
  });

  it("gives a parent without one a payment link for these fees that works for 7 days, kept as a placeholder", async () => {
    const text = await textTo(f, f.sita.guardian.id, d("2026-07-10"));
    expect(text).not.toContain("/pay/");
    const m = /⟦pay-link:([0-9a-f-]{36}):([0-9a-f-]{36})⟧/.exec(text)!;
    expect(m[1]).toBe(f.school.id);
    const link = await withSchool(f.ctx, (tx) => tx.paymentLink.findUniqueOrThrow({ where: { id: m[2] } }));
    expect(link.studentId).toBe(f.sita.id);
    const days = (link.expiresAt.getTime() - link.createdAt.getTime()) / 86_400_000;
    expect(Math.round(days)).toBe(LINK_DAYS);
    // The reminder is about the overdue April installment: the link pays exactly that.
    const sitaDues = await withSchool(f.ctx, (tx) => tx.studentFeeDue.findMany({ where: { studentId: f.sita.id, dueDate: { lt: d("2026-07-10") } } }));
    expect(link.dueIds).toEqual(sitaDues.map((x) => x.id));
    // Only when the message goes out does the placeholder become a link, and that link opens this payment link.
    const real = withRealLinks(text);
    const token = new RegExp(`${appUrl()}/pay/${f.school.id}/([A-Za-z0-9_-]+)`).exec(real)![1];
    expect((await withSchool(job(f), (tx) => linkByToken(tx, token)))?.id).toBe(link.id);
  });

  it("uses the same open payment link again for the same fees, not a new one each reminder", async () => {
    // 3 days before 10 July the reminder is about the same overdue April installment.
    await withSchool(f.ctx, (tx) => tx.feeSetting.update({ where: { schoolId: f.school.id }, data: { reminderDays: [-3] } }));
    expect((await run(f, d("2026-07-07"))).status).toBe("sent");
    expect(await withSchool(f.ctx, (tx) => tx.paymentLink.count({ where: { studentId: f.sita.id } }))).toBe(1);
  });

  it("falls back to a payment link when Parent Link is switched off", async () => {
    await withSchool(f.ctx, (tx) => updateSettings(tx, f.ctx, (s) => ({ ...s, parentLink: { ...s.parentLink, on: false } })));
    await withSchool(f.ctx, (tx) => tx.feeSetting.update({ where: { schoolId: f.school.id }, data: { reminderDays: [0] } }));
    expect((await run(f, d("2026-10-10"))).status).toBe("sent");
    const text = await textTo(f, f.ravi.guardian.id, d("2026-10-10"));
    expect(text).toMatch(/Pay online with this link \(it works until \d{2}-\d{2}-\d{4}\): ⟦pay-link:/);
    await withSchool(f.ctx, (tx) => updateSettings(tx, f.ctx, (s) => ({ ...s, parentLink: { ...s.parentLink, on: true } })));
  });

  it("puts the same way to pay in reminders sent from Defaulters, and never a working link in their history", async () => {
    const input = { studentIds: [f.sita.id, f.ravi.id], channel: "whatsapp", templateId: null, text: "Dear {guardian_name}, {due_amount} for {student_name} is due. {how_to_pay} - {school_name}", includeLink: true, today: d("2026-10-12") };
    const preview = await withSchool(f.ctx, (tx) => previewReminders(tx, f.ctx, input));
    expect(preview.sample).toContain("Pay online with this link");
    expect(preview.sample).toContain("[payment link]");
    expect(preview.sample).not.toContain("⟦");
    await withSchool(f.ctx, (tx) => sendReminders(tx, f.ctx, input));
    const history = await withSchool(f.ctx, (tx) => reminderHistory(tx, f.sita.id));
    const manual = history.find((h) => !h.automatic)!;
    expect(manual.text).toContain("[payment link]");
    expect(manual.text).not.toMatch(/\/pay\/|⟦/);
    const ravi = (await withSchool(f.ctx, (tx) => reminderHistory(tx, f.ravi.id))).find((h) => !h.automatic)!;
    expect(ravi.text).toContain("Pay online on your Parent Link: [personal Parent Link]");
    // Unticking "Include payment link" leaves the school office only.
    const off = await withSchool(f.ctx, (tx) => previewReminders(tx, f.ctx, { ...input, includeLink: false }));
    expect(off.sample).toContain(COUNTER_WORDS);
    expect(off.sample).not.toContain("link]");
  });
});
