// Workflow 15, step 10: "On go-live ... automations start (absence messages,
// fee reminders)". While a school is moving in (a Move-in Plan not yet live)
// nothing the software does by itself reaches a parent or adds a charge;
// messages to staff and copies a person asks for still go (gap list G14).
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { AttendanceAlert } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { enqueue, runDueJobs } from "@/lib/jobs";
import "@/lib/fees/jobs";
import { ruleReady, sendAutomatic } from "@/lib/messaging/automatic";
import { automaticReminders } from "@/lib/fees/reminders";
import { sendAttendanceMessage } from "@/lib/attendance/notify-parents";
import { HELD_UNTIL_LIVE, movingIn } from "@/lib/move-in/live";
import { goLive } from "@/lib/move-in/service";
import { createSchool } from "@/lib/schools";
import { makeFeeSchool, R, type FeeSchool } from "../fees/fixture";
import { makeSchool } from "../helpers";

let f: FeeSchool;

beforeAll(async () => {
  f = await makeFeeSchool();
  await withSchool(f.ctx, async (tx) => {
    // Moving in, going live on 1 September 2026.
    await tx.moveInPlan.create({ data: { schoolId: f.school.id, goLiveDate: new Date("2026-09-01T00:00:00Z") } });
    await tx.feeSetting.update({ where: { schoolId: f.school.id }, data: { lateFeeOn: true, lateFeeType: "flat", lateFeePaise: R(200), graceDays: 0, remindersOn: true, reminderDays: [0] } });
  });
}, 120_000);

const lateFees = () => withSchool(f.ctx, (tx) => tx.studentFeeDue.count({ where: { kind: "LATE_FEE", state: "OPEN" } }));
const feeMessages = () => withSchool(f.ctx, (tx) => tx.message.count({ where: { ruleKey: "fee-due" } }));

async function runLateFees() {
  await withSchool(f.ctx, (tx) => enqueue(tx, f.ctx, "schedule:fee-late-fees", `test-late:${randomUUID()}`, {}));
  for (let i = 0; i < 5; i++) if ((await runDueJobs(10, { schoolId: f.school.id, kinds: ["schedule:fee-late-fees"] })) === 0) break;
}

describe("while the school is moving in", () => {
  it("is moving in", async () => {
    expect(await withSchool(f.ctx, (tx) => movingIn(tx, f.ctx))).toBe(true);
  });

  it("holds automatic messages to parents, and says so before they are promised", async () => {
    const r = await withSchool(f.ctx, (tx) => sendAutomatic(tx, f.ctx, { rule: "absence", event: { key: `t:${randomUUID()}`, label: "Absent on 01-10-2026" }, to: { guardiansOf: [f.ravi.id] }, values: { date: "01-10-2026" } }));
    expect(r).toMatchObject({ status: "held", reason: HELD_UNTIL_LIVE });
    const ready = await withSchool(f.ctx, (tx) => ruleReady(tx, f.ctx, "absence"));
    expect(ready).toMatchObject({ on: true, ready: false, held: true });
    expect(await withSchool(f.ctx, (tx) => tx.automationLog.count({ where: { ruleKey: "absence" } }))).toBe(0);
  });

  it("still sends a copy a person asks for, and messages to staff", async () => {
    const byHand = await withSchool(f.ctx, (tx) => sendAutomatic(tx, f.ctx, { rule: "fee-paid", event: { key: `t:${randomUUID()}`, label: "Receipt sent again" }, to: { guardiansOf: [f.ravi.id] }, perStudent: { [f.ravi.id]: { paid_amount: "₹100", payment_date: "01-10-2026", receipt_number: "R-1" } }, byHand: true }));
    expect(byHand.status).toBe("sent");
    const staff = await withSchool(f.ctx, (tx) => sendAutomatic(tx, f.ctx, { rule: "salary-slip", event: { key: `t:${randomUUID()}`, label: "Salary" }, to: { staffIds: [] } }));
    expect(staff.status).not.toBe("held");
  });

  it("adds no late fees and sends no fee reminders", async () => {
    await runLateFees();
    expect(await lateFees()).toBe(0);
    const job = await withSchool(f.ctx, (tx) => tx.backgroundJob.findFirstOrThrow({ where: { kind: "schedule:fee-late-fees" }, orderBy: { createdAt: "desc" } }));
    expect(job).toMatchObject({ status: "done", result: { held: HELD_UNTIL_LIVE } });
    // The reminder day of the 10 October installment.
    expect(await withSchool(f.ctx, (tx) => automaticReminders(tx, f.ctx, new Date("2026-10-10T00:00:00Z")))).toEqual({ sent: 0, status: "held" });
    expect(await feeMessages()).toBe(0);
  });

  it("keeps attendance alerts to parents with the reason", async () => {
    const alert = { id: randomUUID(), schoolId: f.school.id, studentId: f.ravi.id, date: new Date("2026-10-01T00:00:00Z"), kind: "threshold", guardianId: f.ravi.guardian.id, text: "Ravi's attendance is below 75%", channels: [], status: "waiting", note: null, messageRef: null, createdAt: new Date(), updatedAt: new Date() } satisfies AttendanceAlert;
    expect(await withSchool(f.ctx, (tx) => sendAttendanceMessage(tx, f.ctx, alert))).toEqual({ status: "skipped", note: HELD_UNTIL_LIVE });
  });
});

describe("after going live", () => {
  it("starts late fees, counting from the go-live date, and fee reminders", async () => {
    await withSchool(f.pctx, (tx) => goLive(tx, f.pctx), { timeout: 60_000 });
    expect(await withSchool(f.ctx, (tx) => movingIn(tx, f.ctx))).toBe(false);
    await runLateFees();
    // Flat ₹200 on each of the three overdue quarters, for each of the three students.
    expect(await lateFees()).toBe(9);
    const r = await withSchool(f.ctx, (tx) => automaticReminders(tx, f.ctx, new Date("2026-10-10T00:00:00Z")));
    expect(r.sent).toBeGreaterThan(0);
    expect(await feeMessages()).toBe(1);
  });
});

describe("which schools are moving in", () => {
  it("a school with no Move-in Plan is live, as before", async () => {
    const s = await makeSchool("Live School");
    expect(await withSchool({ schoolId: s.id, userId: null }, (tx) => movingIn(tx, { schoolId: s.id }))).toBe(false);
  });

  it("a school added in the console starts moving in", async () => {
    const { school } = await createSchool({ code: `T${randomUUID().slice(0, 8)}`, name: "New School", movingIn: true });
    expect(await withSchool({ schoolId: school.id, userId: null }, (tx) => movingIn(tx, { schoolId: school.id }))).toBe(true);
  });
});
