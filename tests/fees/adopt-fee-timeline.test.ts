// Adopt items 4 and 7 (docs/research/inkwelly-2026-11-15.md):
// - each unpaid installment's timeline "Bill made → Due → Late fee from" and
//   the reminder plan "Reminder 1 of 3", worked out from the school's real Fee
//   Settings and records (never invented; parts that do not apply are left out);
// - Collect Fee's Full / Half / Quarter amounts never exceed the dues, and
//   "₹X stays due" is plain paise arithmetic.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { addDays } from "@/lib/staff/dates";
import { addLateFees } from "@/lib/fees/late-fees";
import { reminderOnceKey } from "@/lib/fees/reminders";
import { createFeeInvoice } from "@/lib/fees/documents";
import { feeTimelines, installmentTimeline, lateFeeFrom, reminderWhen } from "@/lib/fees/timeline";
import { quickAmounts, staysDue } from "@/app/(school)/fee-management/collect/[studentId]/quick-amounts";
import { dues, makeFeeSchool, R, type FeeSchool } from "./fixture";

let f: FeeSchool;
const day = (x: Date) => formatDate(x, "UTC");

beforeAll(async () => {
  f = await makeFeeSchool();
}, 120_000);

describe("fee timeline per installment, from real settings", () => {
  it("shows bill, due, late fee and the reminder plan with what was really sent", async () => {
    const rows = await dues(f.ctx, f.ravi.id);
    expect(rows).toHaveLength(4);
    const [, second, third, fourth] = rows;
    const today = addDays(third.dueDate, 2);
    await withSchool(f.ctx, async (tx) => {
      await tx.feeSetting.update({ where: { schoolId: f.school.id }, data: { lateFeeOn: true, lateFeeType: "flat", lateFeePaise: R(200), graceDays: 7, remindersOn: true, reminderDays: [7, -3, 0] } });
      // The rows were raised at the start of the year (the fixture made them today).
      await tx.studentFeeDue.updateMany({ where: { studentId: f.ravi.id }, data: { createdAt: new Date("2026-04-01T00:00:00Z") } });
      // The automatic reminder 3 days before the third installment really went.
      await tx.feeReminder.create({ data: { schoolId: f.school.id, studentId: f.ravi.id, dueId: third.id, onceKey: reminderOnceKey(f.ravi.id, addDays(third.dueDate, -3)), channel: "automatic", template: "fee-due", text: "Fee reminder", amountPaise: R(6000), status: "queued", automatic: true } });
      await addLateFees(tx, f.ctx, today);
      await createFeeInvoice(tx, f.ctx, f.ravi.id, [third.id]);
    });
    const t = await withSchool(f.ctx, (tx) => feeTimelines(tx, f.ctx, f.ravi.id, today));

    // Third installment: due 2 days ago, late fee from the day after the 7-day grace, invoice made.
    const third3 = t.get(third.id)!;
    expect(third3.steps.map((s) => s.key)).toEqual(["bill", "due", "late"]);
    expect(third3.steps[0].text).toMatch(/^Bill made \d{2}-\d{2}-\d{4}$/);
    expect(third3.steps[1]).toEqual({ key: "due", text: `Due ${day(third.dueDate)}`, state: "done" });
    expect(third3.steps[2]).toEqual({ key: "late", text: `Late fee ₹200 from ${day(addDays(third.dueDate, 8))}`, state: "ahead" });
    expect(third3.reminders.map((r) => r.text)).toEqual([
      "Reminder 1 of 3 · 3 days before · sent",
      "Reminder 2 of 3 · on the due date · not sent",
      `Reminder 3 of 3 · 7 days after · ${day(addDays(third.dueDate, 7))}`,
    ]);
    expect(third3.reminders.map((r) => r.state)).toEqual(["sent", "not-sent", "ahead"]);

    // Second installment: the late fee row already added is named with its amount; no invoice, no bill step.
    const second2 = t.get(second.id)!;
    expect(second2.steps.map((s) => s.text)).toEqual([`Due ${day(second.dueDate)}`, `Late fee ₹200 added ${day(today)}`]);

    // Fourth: nothing has happened yet.
    expect(t.get(fourth.id)!.steps.map((s) => s.state)).toEqual(["ahead", "ahead"]);
    expect(t.get(fourth.id)!.reminders.every((r) => r.state === "ahead")).toBe(true);
  });

  it("leaves out what does not apply: no late fee rule, no reminders, paid rows, late fee rows", () => {
    const base = { id: "x", kind: "FEE" as const, dueDate: new Date("2026-10-01T00:00:00Z"), balancePaise: R(6000), state: "OPEN" as const, broughtIn: false, createdAt: new Date("2026-04-01T00:00:00Z") };
    const rules = { lateFeeOn: false, lateFeeType: "flat", lateFeePaise: R(200), lateFeePercentBp: 0, graceDays: 7, lateFeeMaxPaise: null, remindersOn: false, reminderDays: [-3, 0, 7], reminderMinPaise: BigInt(0) };
    const facts = { today: new Date("2026-10-05T00:00:00Z"), lateApplies: true, goLive: null, billedOn: null, lateRow: null, sentKeys: new Set<string>(), studentId: "s", owedPaise: R(6000), paused: false };
    expect(installmentTimeline(base, rules, facts)).toEqual({ steps: [{ key: "due", text: "Due 01-10-2026", state: "done" }], reminders: [], paused: null });
    // A head that does not attract late fee, a ₹0 late fee and a brought-in row show no late step.
    expect(installmentTimeline(base, { ...rules, lateFeeOn: true }, { ...facts, lateApplies: false })!.steps).toHaveLength(1);
    expect(installmentTimeline(base, { ...rules, lateFeeOn: true, lateFeePaise: BigInt(0) }, facts)!.steps).toHaveLength(1);
    expect(installmentTimeline({ ...base, broughtIn: true }, { ...rules, lateFeeOn: true }, facts)!.steps).toHaveLength(1);
    // Below the smallest reminder amount: no reminder plan.
    expect(installmentTimeline(base, { ...rules, remindersOn: true, reminderMinPaise: R(10000) }, facts)!.reminders).toEqual([]);
    // A promise to pay pauses the plan, and says so.
    expect(installmentTimeline(base, { ...rules, remindersOn: true }, { ...facts, paused: true })!.paused).toBe("Reminders paused: a promise to pay is open");
    expect(installmentTimeline({ ...base, balancePaise: BigInt(0) }, rules, facts)).toBeNull();
    expect(installmentTimeline({ ...base, kind: "LATE_FEE" }, rules, facts)).toBeNull();
    // Per-day and percent late fees are said as the rule is.
    expect(installmentTimeline(base, { ...rules, lateFeeOn: true, lateFeeType: "per-day", lateFeePaise: R(10) }, facts)!.steps[1].text).toBe("Late fee ₹10 a day from 09-10-2026");
    expect(installmentTimeline(base, { ...rules, lateFeeOn: true, lateFeeType: "percent", lateFeePercentBp: 250 }, facts)!.steps[1].text).toBe("Late fee 2.5% of what is left from 09-10-2026");
  });

  it("counts late days from the go-live date for a school that moved in", () => {
    expect(day(lateFeeFrom({ graceDays: 7 }, new Date("2026-06-01T00:00:00Z"), new Date("2026-09-01T00:00:00Z")))).toBe("09-09-2026");
    expect(reminderWhen(-1)).toBe("1 day before");
    expect(reminderWhen(3)).toBe("3 days after");
  });
});

describe("Collect Fee quick amounts", () => {
  it("never offers more than the dues, and halves round down to whole rupees", () => {
    for (const owed of [1, 99, 100, 150, 1755050, 600000, 3]) {
      for (const q of quickAmounts(owed)) {
        expect(q.paise).toBeGreaterThan(0);
        expect(q.paise).toBeLessThanOrEqual(owed);
        expect(Number.isInteger(q.paise)).toBe(true);
      }
    }
    expect(quickAmounts(1755050)).toEqual([
      { key: "full", label: "Full", paise: 1755050 },
      { key: "half", label: "Half", paise: 877500 },
      { key: "quarter", label: "Quarter", paise: 438700 },
    ]);
    expect(quickAmounts(0)).toEqual([]);
    // One paisa cannot be halved: only Full. Under ₹1 the halves stay in paise rather than becoming ₹0.
    expect(quickAmounts(1).map((q) => q.key)).toEqual(["full"]);
    expect(quickAmounts(100).map((q) => q.paise)).toEqual([100, 50, 25]);
  });

  it("works out what stays due in paise, never below zero", () => {
    expect(staysDue(1755050, 877500)).toBe(877550);
    expect(staysDue(1755050, 1755050)).toBe(0);
    expect(staysDue(600000, 700000)).toBe(0);
    expect(staysDue(600000, Number.NaN)).toBe(600000);
    expect(staysDue(600000, 0)).toBe(600000);
  });
});
