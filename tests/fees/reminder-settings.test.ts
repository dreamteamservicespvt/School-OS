// Fee reminders follow Fee Settings (06 §6, A7; gap list G11): on or off, the
// days before and after the due date, the channel, the smallest amount worth
// a reminder and quiet days (no reminder on a day the school is closed; that
// day's reminders go on the next school day). A family gets at most one
// automatic reminder a day, and none for rows already paid, while a payment
// waits for verification, or in another school.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool, type SchoolContext } from "@/lib/db";
import { automaticReminders, coveredDays, reminderOnceKey, remindersDueOn } from "@/lib/fees/reminders";
import { feeSettings } from "@/lib/fees/settings";
import { saveReminders } from "@/lib/fees/settings-save";
import { ruleStates } from "@/lib/messaging/automatic";
import { collect, dues, feature, makeFeeSchool, R, type FeeSchool } from "./fixture";
import { d } from "../attendance/fixture";

const job = (f: FeeSchool): SchoolContext => ({ schoolId: f.school.id, userId: null });
const run = (f: FeeSchool, day: Date) => withSchool(job(f), (tx) => automaticReminders(tx, job(f), day));
const set = (f: FeeSchool, data: Record<string, unknown>) => withSchool(f.ctx, (tx) => tx.feeSetting.update({ where: { schoolId: f.school.id }, data }));
const autoCount = (f: FeeSchool, studentId: string) => withSchool(f.ctx, (tx) => tx.feeReminder.count({ where: { studentId, automatic: true } }));

// The fixture's quarterly installments fall due on 10 April, 10 July, 10 October and 10 January.
const OCT10 = d("2026-10-10"); // a Saturday
let f: FeeSchool;
let g: FeeSchool;

beforeAll(async () => {
  f = await makeFeeSchool();
  g = await makeFeeSchool();
}, 180_000);

describe("the days a reminder goes", () => {
  const open = (closed: string[]) => (x: Date) => !closed.includes(x.toISOString().slice(0, 10));
  it("is today only, unless closed days are quiet", () => {
    expect(coveredDays(d("2026-10-12"), false, open(["2026-10-12"]))).toEqual([d("2026-10-12")]);
    expect(coveredDays(d("2026-10-11"), true, open(["2026-10-11"]))).toBeNull();
    // Monday after a closed Saturday and Sunday: their reminders go on Monday.
    expect(coveredDays(d("2026-10-12"), true, open(["2026-10-10", "2026-10-11"]))).toEqual([d("2026-10-12"), d("2026-10-11"), d("2026-10-10")]);
    expect(coveredDays(d("2026-10-12"), true, () => false, 3)).toBeNull();
  });
});

describe("Fee Settings decide", () => {
  it("sends nothing while reminders are off", async () => {
    await set(f, { remindersOn: false, reminderDays: [0] });
    expect(await run(f, OCT10)).toEqual({ sent: 0, status: "off" });
    expect(await autoCount(f, f.ravi.id)).toBe(0);
  });

  it("checks what is saved", async () => {
    await expect(withSchool(f.ctx, (tx) => saveReminders(tx, f.ctx, { on: true, days: [], channel: "whatsapp", minPaise: BigInt(0), quietDays: false }))).rejects.toThrow("Choose at least one day");
    await expect(withSchool(f.ctx, (tx) => saveReminders(tx, f.ctx, { on: true, days: [0], channel: "fax", minPaise: BigInt(0), quietDays: false }))).rejects.toThrow("Choose how reminders are sent");
    await expect(withSchool(f.ctx, (tx) => saveReminders(tx, f.ctx, { on: true, days: [0], channel: "whatsapp", minPaise: R(-1), quietDays: false }))).rejects.toThrow("smallest amount");
    await withSchool(f.ctx, (tx) => saveReminders(tx, f.ctx, { on: true, days: [7, -3, 99], channel: "whatsapp", minPaise: R(500), quietDays: true }));
    const s = await withSchool(f.ctx, (tx) => feeSettings(tx, f.ctx));
    expect(s).toMatchObject({ remindersOn: true, reminderDays: [-3, 7], reminderMinPaise: R(500), reminderQuietDays: true });
  });

  it("goes on the days before and after the due date that are chosen, and not on others", async () => {
    await set(f, { remindersOn: true, reminderDays: [-3], reminderMinPaise: BigInt(0), reminderQuietDays: false });
    expect(await run(f, d("2026-10-08"))).toEqual({ sent: 0, status: "nobody" }); // 2 days before: not a chosen day
    const r = await run(f, d("2026-10-07")); // 3 days before
    expect(r.status).toBe("sent");
    expect(r.sent).toBe(2); // Ravi's and Sita's fathers; Anil's father opted out
    expect(await autoCount(f, f.ravi.id)).toBe(1);
    expect(await autoCount(f, f.anil.id)).toBe(1);
  });

  it("gives a family one reminder a day, however many of its rows have a reminder day", async () => {
    // 92 days after 10 July is 10 October: two of each student's rows have a reminder day on 10 October.
    await set(g, { remindersOn: true, reminderDays: [0, 92], reminderMinPaise: BigInt(0), reminderQuietDays: false });
    const r = await run(g, OCT10);
    expect(r.status).toBe("sent");
    expect(await autoCount(g, g.ravi.id)).toBe(1);
    const row = await withSchool(g.ctx, (tx) => tx.feeReminder.findFirstOrThrow({ where: { studentId: g.ravi.id, automatic: true } }));
    expect(row.onceKey).toBe(reminderOnceKey(g.ravi.id, OCT10));
    const recipients = await withSchool(g.ctx, (tx) => tx.messageRecipient.count({ where: { messageId: row.messageId!, studentId: g.ravi.id } }));
    expect(recipients).toBe(1);
    // The job runs again later that day: nothing more goes.
    expect(await run(g, OCT10)).toEqual({ sent: 0, status: "nobody" });
    expect(await autoCount(g, g.ravi.id)).toBe(1);
  });

  it("leaves out families owing less than the smallest amount", async () => {
    await set(f, { remindersOn: true, reminderDays: [0], reminderMinPaise: R(100000), reminderQuietDays: false });
    const day = await withSchool(job(f), async (tx) => remindersDueOn(tx, job(f), await feeSettings(tx, job(f)), d("2026-07-10")));
    expect(day.out).toEqual([]);
    expect(day.left.belowMin).toBe(3);
    await set(f, { reminderMinPaise: R(6000) });
    const again = await withSchool(job(f), async (tx) => remindersDueOn(tx, job(f), await feeSettings(tx, job(f)), d("2026-07-10")));
    expect(again.out.length).toBe(3);
  });

  it("never reminds a family about rows it has paid, or while its payment waits for verification", async () => {
    await set(f, { remindersOn: true, reminderDays: [0], reminderMinPaise: BigInt(0), reminderQuietDays: false });
    const [ravi1, ravi2] = await dues(f.ctx, f.ravi.id);
    await collect(f.ctx, { studentId: f.ravi.id, dueIds: [ravi1.id, ravi2.id], amountPaise: R(12000), confirmDuplicate: true });
    await feature(f.ctx, "fee-verification");
    await set(f, { verifyModes: ["CHEQUE"] });
    const [sita1] = await dues(f.ctx, f.sita.id);
    await collect(f.ctx, { studentId: f.sita.id, dueIds: [sita1.id], amountPaise: R(6000), mode: "CHEQUE", chequeNo: "123456", chequeBank: "State Bank", chequeDate: d("2026-07-09"), confirmDuplicate: true });
    const day = await withSchool(job(f), async (tx) => remindersDueOn(tx, job(f), await feeSettings(tx, job(f)), d("2026-07-10")));
    // Ravi has paid April and July; Sita's cheque is waiting; only Anil is left.
    expect(day.out.map((x) => x.studentId)).toEqual([f.anil.id]);
    expect(day.left.waiting).toBe(1);
  });

  it("uses the channel chosen in Fee Settings, which Message Settings shows", async () => {
    await withSchool(g.ctx, (tx) => saveReminders(tx, g.ctx, { on: true, days: [0], channel: "sms", minPaise: BigInt(0), quietDays: false }));
    const rule = (await withSchool(g.ctx, (tx) => ruleStates(tx, g.ctx))).find((r) => r.key === "fee-due")!;
    expect(rule.channels).toEqual(["sms"]);
    await withSchool(g.ctx, async (tx) => {
      await tx.school.update({ where: { id: g.school.id }, data: { smsDltEntityId: "1201159100000000001", smsSenderHeader: "SCHOOL" } });
      const t = await tx.template.findFirstOrThrow({ where: { key: "fee-due", channel: "sms" } });
      await tx.templateVersion.updateMany({ where: { templateId: t.id }, data: { dltTemplateId: "1207159100000000001" } });
    });
    const r = await run(g, d("2026-07-10"));
    expect(r.status).toBe("sent");
    const row = await withSchool(g.ctx, (tx) => tx.feeReminder.findFirstOrThrow({ where: { studentId: g.sita.id, onceKey: reminderOnceKey(g.sita.id, d("2026-07-10")) } }));
    const channels = await withSchool(g.ctx, (tx) => tx.messageRecipient.findMany({ where: { messageId: row.messageId! }, select: { channel: true } }));
    expect(new Set(channels.map((c) => c.channel))).toEqual(new Set(["sms"]));
  });
});

describe("quiet days", () => {
  it("sends nothing on a closed day, and that day's reminders on the next school day", async () => {
    const h = await makeFeeSchool();
    await withSchool(h.ctx, (tx) => tx.calendarEntry.create({ data: { schoolId: h.school.id, academicYearId: h.year.id, type: "holiday", title: "Founders' Day", startDate: OCT10, endDate: OCT10 } }));
    await set(h, { remindersOn: true, reminderDays: [0], reminderQuietDays: true });
    expect(await run(h, OCT10)).toEqual({ sent: 0, status: "quiet" }); // the holiday
    expect(await run(h, d("2026-10-11"))).toEqual({ sent: 0, status: "quiet" }); // Sunday
    const r = await run(h, d("2026-10-12")); // Monday: the 10 October reminders go now
    expect(r.status).toBe("sent");
    expect(await autoCount(h, h.ravi.id)).toBe(1);
    // With quiet days off, the reminder would have gone on the holiday itself.
    await set(h, { reminderQuietDays: false });
    const day = await withSchool(job(h), async (tx) => remindersDueOn(tx, job(h), await feeSettings(tx, job(h)), d("2026-07-10")));
    expect(day.out.length).toBe(3);
  }, 120_000);
});

describe("one school never reminds another school's families", () => {
  it("counts only its own students", async () => {
    await set(g, { remindersOn: true, reminderDays: [0], reminderMinPaise: BigInt(0), reminderQuietDays: false });
    const day = await withSchool(job(g), async (tx) => remindersDueOn(tx, job(g), await feeSettings(tx, job(g)), d("2026-04-10")));
    const mine = new Set([g.ravi.id, g.sita.id, g.anil.id]);
    expect(day.out.length).toBe(3);
    expect(day.out.every((x) => mine.has(x.studentId))).toBe(true);
  });
});
