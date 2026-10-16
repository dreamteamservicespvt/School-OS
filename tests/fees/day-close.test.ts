// Close the day (Day Book, approved design mod-finance.jsx CloseDaySheet):
// cash counted against the books, a reason when they differ (the Principal is
// told), the day and every day before it locked, later entries moved to the
// next open day, days closed in order, reopen by someone else with a reason,
// undo by the closer straight after, every step audited, and only the
// accountant's desk may close (the Principal reads and reminds).
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool, type SchoolContext } from "@/lib/db";
import { ALL_ROLE_TEMPLATES } from "@/lib/roles";
import { combineRoles } from "@/lib/permissions";
import { postToDayBook } from "@/lib/finance/daybook";
import { cashAccount } from "@/lib/finance/settings";
import { moveMoney } from "@/lib/finance/accounts";
import { closeDay, closePreview, closesDays, daysToClose, expectedCash, remindToClose, reopenDay, reopensDays, whyNotClose } from "@/lib/finance/day-close";
import { assertBooksOpen } from "@/lib/finance/years";
import { todayIn } from "@/lib/staff/dates";
import { collect, dues, makeFeeSchool, R, type FeeSchool } from "./fixture";

let f: FeeSchool;
const today = todayIn("Asia/Kolkata");
const day = (n: number) => new Date(today.getTime() + n * 86_400_000);
let n = 0;

/** A cash entry on a date, straight into the Day Book (as a source module would post it). */
async function cashIn(ctx: SchoolContext, date: Date, rupees: number, direction: "IN" | "OUT" = "IN") {
  return withSchool(ctx, async (tx) => {
    const cash = await cashAccount(tx, ctx);
    n++;
    return (await postToDayBook(tx, ctx, { date, direction, amountPaise: R(rupees), mode: "CASH", section: direction === "IN" ? "other-income" : "expense", headName: "Test", accountId: cash.id, sourceType: "test", sourceId: `t${n}`, sourceKey: `test:${n}:${Date.now()}`, partyName: "Test" })).entry;
  });
}

const person = (...keys: string[]) => ({
  roles: keys.map((key) => ({ key, permissions: null })),
  permissions: combineRoles(keys.map((k) => ALL_ROLE_TEMPLATES.find((r) => r.key === k)!.permissions)),
});

beforeAll(async () => {
  f = await makeFeeSchool();
}, 120_000);

describe("who closes the day", () => {
  it("is the accountant's desk: the Principal and School Admin read the Day Book and remind, the Vice Principal only reads", () => {
    expect(closesDays(person("accountant"))).toBe(true);
    expect(closesDays(person("principal"))).toBe(false);
    expect(closesDays(person("school-admin"))).toBe(false);
    expect(closesDays(person("vice-principal"))).toBe(false);
    // An accountant who is also School Admin keeps the desk work.
    expect(closesDays(person("school-admin", "accountant"))).toBe(true);
    expect(reopensDays(person("principal"))).toBe(true);
    expect(reopensDays(person("vice-principal"))).toBe(false);
  });
});

describe("closing a day", () => {
  it("counts the cash against the books, locks the day and every day before it, and audits it", async () => {
    // Four days ago: ₹5,000 came in and ₹1,200 went out in cash.
    await cashIn(f.ctx, day(-4), 5000);
    await cashIn(f.ctx, day(-4), 1200, "OUT");
    const preview = await withSchool(f.ctx, (tx) => closePreview(tx, f.ctx, day(-4), today));
    expect(preview.problem).toBeNull();
    expect(preview.expected).toBe(R(3800));
    expect(preview.income).toBe(R(5000));
    expect(preview.expense).toBe(R(1200));

    const r = await withSchool(f.ctx, (tx) => closeDay(tx, f.ctx, { date: day(-4), countedPaise: R(3800), reason: null, today }));
    expect(r.difference).toBe(BigInt(0));
    expect(r.close).toMatchObject({ expectedCashPaise: R(3800), countedCashPaise: R(3800), differenceReason: null, closedById: f.accountant.id, entryCount: 2 });
    const audit = await withSchool(f.ctx, (tx) => tx.auditLogEntry.findFirstOrThrow({ where: { recordType: "Day Close", recordId: r.close.id } }));
    expect(audit.action).toBe("day-closed");

    // A person cannot choose that day, or one before it, any more.
    const cash = await withSchool(f.ctx, (tx) => cashAccount(tx, f.ctx));
    const bank = await withSchool(f.ctx, (tx) => tx.bankAccount.findFirstOrThrow({ where: { kind: "BANK" } }));
    await expect(withSchool(f.ctx, (tx) => moveMoney(tx, f.ctx, { fromId: cash.id, toId: bank.id, amountPaise: R(100), date: day(-4), reference: null }))).rejects.toThrow(/Day Book is closed up to/);
    await expect(withSchool(f.ctx, (tx) => assertBooksOpen(tx, f.ctx, day(-6)))).rejects.toThrow(/Day Book is closed up to/);
    expect(await withSchool(f.ctx, (tx) => whyNotClose(tx, f.ctx, day(-4), today))).toMatch(/already closed/);
  });

  it("needs a reason when the count differs, and tells the Principal", async () => {
    await cashIn(f.ctx, day(-3), 2000);
    await expect(withSchool(f.ctx, (tx) => closeDay(tx, f.ctx, { date: day(-3), countedPaise: R(5700), reason: null, today })))
      .rejects.toThrow("The count is ₹100 less than the books. Say why, in a few words; the Principal is told.");
    const r = await withSchool(f.ctx, (tx) => closeDay(tx, f.ctx, { date: day(-3), countedPaise: R(5700), reason: "Change given twice to a parent", today }));
    expect(r.expected).toBe(R(5800));
    expect(r.difference).toBe(-R(100));
    const told = await withSchool(f.pctx, (tx) => tx.notification.findFirst({ where: { userLoginId: f.principal.id, type: "day-close" } }));
    expect(told?.text).toMatch(/₹100 short/);
    expect(told?.text).toMatch(/Change given twice/);
  });

  it("closes days with entries in order, oldest first", async () => {
    await cashIn(f.ctx, day(-2), 300);
    await cashIn(f.ctx, day(-1), 400);
    expect(await withSchool(f.ctx, (tx) => whyNotClose(tx, f.ctx, day(-1), today))).toMatch(/^Close .* first/);
    const pending = await withSchool(f.ctx, (tx) => daysToClose(tx, f.ctx, today));
    expect(pending.days.map((d) => d.getTime())).toEqual([day(-2).getTime(), day(-1).getTime()]);
    expect(await withSchool(f.ctx, (tx) => whyNotClose(tx, f.ctx, day(1), today))).toMatch(/has not come yet/);
  });

  it("moves an entry made later for a closed day into the next open day, with a note", async () => {
    // A cheque from the closed day verified now (an automatic posting) is not refused: it goes into the next day.
    const moved = await cashIn(f.ctx, day(-4), 50);
    expect(moved.date.getTime()).toBe(day(-2).getTime());
    expect(moved.note).toMatch(/after that day was closed/);
  });
});

describe("closing today", () => {
  it("still takes fee payments at the counter; they go into tomorrow's Day Book", async () => {
    // Close the open days first, then today.
    for (const d of [day(-2), day(-1)]) {
      const cash = await withSchool(f.ctx, (tx) => expectedCash(tx, f.ctx, d));
      await withSchool(f.ctx, (tx) => closeDay(tx, f.ctx, { date: d, countedPaise: cash, reason: null, today }));
    }
    const cashNow = await withSchool(f.ctx, (tx) => expectedCash(tx, f.ctx, today));
    await withSchool(f.ctx, (tx) => closeDay(tx, f.ctx, { date: today, countedPaise: cashNow, reason: null, today }));
    const due = (await dues(f.ctx, f.ravi.id))[0];
    const r = await collect(f.ctx, { studentId: f.ravi.id, dueIds: [due.id], amountPaise: due.amountPaise });
    const entry = await withSchool(f.ctx, (tx) => tx.dayBookEntry.findFirstOrThrow({ where: { sourceType: "payment", sourceId: r.payment.id } }));
    expect(entry.date.getTime()).toBe(day(1).getTime());
    // Today's closing cash is unchanged; the payment is counted with tomorrow.
    expect(await withSchool(f.ctx, (tx) => expectedCash(tx, f.ctx, today))).toBe(cashNow);
  });
});

describe("reopening", () => {
  it("is never done by the person who closed it, needs a reason, goes from the latest day back, and is audited", async () => {
    const latest = await withSchool(f.ctx, (tx) => tx.dayClose.findFirstOrThrow({ where: { reopenedAt: null }, orderBy: { date: "desc" } }));
    const older = await withSchool(f.ctx, (tx) => tx.dayClose.findFirstOrThrow({ where: { reopenedAt: null, date: day(-4) } }));
    await expect(withSchool(f.ctx, (tx) => reopenDay(tx, f.ctx, latest.id, "Wrong cheque date"))).rejects.toThrow(/someone else reopens it/);
    await expect(withSchool(f.pctx, (tx) => reopenDay(tx, f.pctx, latest.id, "no"))).rejects.toThrow(/Say why/);
    await expect(withSchool(f.pctx, (tx) => reopenDay(tx, f.pctx, older.id, "Wrong cheque date"))).rejects.toThrow(/first/);
    await withSchool(f.pctx, (tx) => reopenDay(tx, f.pctx, latest.id, "Wrong cheque date"));
    const after = await withSchool(f.ctx, (tx) => tx.dayClose.findUniqueOrThrow({ where: { id: latest.id } }));
    expect(after.reopenedById).toBe(f.principal.id);
    expect(after.reopenReason).toBe("Wrong cheque date");
    const audit = await withSchool(f.ctx, (tx) => tx.auditLogEntry.findFirstOrThrow({ where: { recordType: "Day Close", recordId: latest.id, action: "day-reopened" } }));
    expect(audit.userLoginId).toBe(f.principal.id);
    const told = await withSchool(f.ctx, (tx) => tx.notification.findFirst({ where: { userLoginId: f.accountant.id, type: "day-close" } }));
    expect(told?.text).toMatch(/was reopened: Wrong cheque date/);
  });

  it("lets the closer undo straight after closing, and closing again adds a new close", async () => {
    const cash = await withSchool(f.ctx, (tx) => expectedCash(tx, f.ctx, today));
    const r = await withSchool(f.ctx, (tx) => closeDay(tx, f.ctx, { date: today, countedPaise: cash, reason: null, today }));
    await expect(withSchool(f.pctx, (tx) => reopenDay(tx, f.pctx, r.close.id, "", { undo: true }))).rejects.toThrow(/Only the person who closed/);
    await withSchool(f.ctx, (tx) => reopenDay(tx, f.ctx, r.close.id, "", { undo: true }));
    const rows = await withSchool(f.ctx, (tx) => tx.dayClose.findMany({ where: { date: today } }));
    expect(rows).toHaveLength(2);
    expect(rows.every((x) => x.reopenedAt !== null)).toBe(true);
  });
});

describe("reminding the accountant", () => {
  it("sends the accountant a reminder for a day not closed, and writes it to the audit log", async () => {
    const r = await withSchool(f.pctx, (tx) => remindToClose(tx, f.pctx, today, today));
    expect(r.sent).toBe(1);
    const note = await withSchool(f.ctx, (tx) => tx.notification.findFirst({ where: { userLoginId: f.accountant.id, type: "work-reminder" }, orderBy: { createdAt: "desc" } }));
    expect(note?.text).toMatch(/close the day/);
    await expect(withSchool(f.pctx, (tx) => remindToClose(tx, f.pctx, day(-4), today))).rejects.toThrow(/closed/);
  });
});
