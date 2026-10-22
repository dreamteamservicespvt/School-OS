// Promise to Pay (06 §2 Defaulters, 04-data-model rule 40): the accountant
// notes "will pay ₹5,000 on 25-10-2026" on a call. Automatic reminders to the
// family pause until then; a payment covering it marks it kept; a date passed
// without enough payment marks it broken, puts the family first on the call
// list and lets reminders go again; the forecasts count it on its date. Only
// the people with full Fee Management record promises, and one school never
// sees another's.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool, type SchoolContext } from "@/lib/db";
import { ALL_ROLE_TEMPLATES } from "@/lib/roles";
import { combineRoles } from "@/lib/permissions";
import { addDays, todayIn } from "@/lib/staff/dates";
import { requireFeeStaff, type FeeViewer } from "@/lib/fees/access";
import { addCallNote, callOrder, defaulterLists, defaulters } from "@/lib/fees/defaulters";
import { automaticReminders, reminderOnceKey } from "@/lib/fees/reminders";
import { forecast } from "@/lib/fees/dashboard";
import {
  currentPromise, PROMISE_FEATURE, PROMISE_MAX_DAYS, pausedByPromise, promiseOutcome, promiseSummary, promiseWords,
  promisedBetween, promisesOf, settlePromises,
} from "@/lib/fees/promises";
import { computeForecasts } from "@/lib/reports/forecasts";
import { collect, dues, feature, makeFeeSchool, R, type FeeSchool } from "./fixture";
import { at, d } from "../attendance/fixture";

const T = todayIn("Asia/Kolkata");
const day = (n: number) => addDays(T, n);
const job = (f: FeeSchool): SchoolContext => ({ schoolId: f.school.id, userId: null });
const viewerOf = (f: FeeSchool): FeeViewer => ({ userId: f.accountant.id, see: "all", change: "all", roleKeys: ["accountant"], sectionIds: null, yearId: f.year.id, yearIds: [f.year.id], campusId: null });
const note = (f: FeeSchool, studentId: string, promisedOn: Date | null, amountPaise: bigint | null = null, text = "", today = T) =>
  withSchool(f.ctx, (tx) => addCallNote(tx, f.ctx, { studentId, note: text, promisedOn, amountPaise, today }));
const reload = (f: FeeSchool, id: string) => withSchool(f.ctx, (tx) => tx.feeCallNote.findUniqueOrThrow({ where: { id } }));

let f: FeeSchool;
let g: FeeSchool;

beforeAll(async () => {
  f = await makeFeeSchool();
  g = await makeFeeSchool();
}, 180_000);

describe("the rules on their own", () => {
  it("is kept when paid enough, broken only after the date, open until then", () => {
    expect(promiseOutcome({ promisedOn: d("2026-10-25"), target: R(5000) }, R(5000), d("2026-10-20"))).toBe("KEPT");
    expect(promiseOutcome({ promisedOn: d("2026-10-25"), target: R(5000) }, R(2000), d("2026-10-25"))).toBe("OPEN");
    expect(promiseOutcome({ promisedOn: d("2026-10-25"), target: R(5000) }, R(2000), d("2026-10-26"))).toBe("BROKEN");
    expect(promisedBetween([{ promisedOn: d("2026-10-25"), leftPaise: R(5000) }, { promisedOn: d("2026-11-02"), leftPaise: R(100) }], d("2026-10-01"), d("2026-10-31"))).toBe(R(5000));
  });

  it("shows the latest call note's promise in school words", () => {
    const base = { studentId: "s", promisedPaise: R(5000), owedPaise: R(12000), promisePaidPaise: null };
    const open = currentPromise([{ ...base, id: "a", promiseState: "OPEN", promisedOn: d("2026-10-25"), createdAt: new Date(1) }], d("2026-10-20"))!;
    expect(promiseWords(open)).toBe("Promised for 25-10-2026 · ₹5,000");
    // Not marked by the job yet, but the date has passed: shown as broken.
    expect(currentPromise([{ ...base, id: "a", promiseState: "OPEN", promisedOn: d("2026-10-25"), createdAt: new Date(1) }], d("2026-10-26"))!.state).toBe("BROKEN");
    // A later plain call note takes the family off "broken".
    expect(currentPromise([
      { ...base, id: "a", promiseState: "BROKEN", promisedOn: d("2026-10-25"), createdAt: new Date(1) },
      { ...base, id: "b", promiseState: null, promisedOn: null, createdAt: new Date(2) },
    ], d("2026-10-26"))).toBeNull();
    expect(promiseWords({ state: "OPEN", promisedOn: d("2026-10-25"), amountPaise: null })).toBe("Promised for 25-10-2026");
  });
});

describe("recording a promise", () => {
  it("with Promise to pay off, a promised date is only noted, as before", async () => {
    const n = await note(f, f.anil.id, day(5), null, "Called, will pay soon");
    expect(n.promiseState).toBeNull();
    await expect(note(f, f.anil.id, day(5), null, "")).rejects.toThrow(/Write what was said/);
    expect(await withSchool(f.ctx, (tx) => pausedByPromise(tx, f.ctx, [f.anil.id], T))).toEqual(new Set());
  });

  it("saves the date, the optional amount and what is overdue, and audits it", async () => {
    await feature(f.ctx, PROMISE_FEATURE);
    const overdue = (await dues(f.ctx, f.ravi.id)).filter((r) => r.dueDate < T).reduce((s, r) => s + r.balancePaise, BigInt(0));
    expect(overdue).toBeGreaterThan(R(5000));
    const n = await note(f, f.ravi.id, day(5), R(5000));
    expect(n).toMatchObject({ promiseState: "OPEN", promisedPaise: R(5000), owedPaise: overdue, createdById: f.accountant.id });
    // The note is optional with a promise.
    expect(n.note).toMatch(/^Promised to pay ₹5,000 by /);
    const audit = await withSchool(f.ctx, (tx) => tx.auditLogEntry.findFirstOrThrow({ where: { recordType: "Promise to Pay", recordId: n.id } }));
    expect(audit.action).toBe("promise-to-pay");
    // The dues list and the ledger show it.
    const shown = (await withSchool(f.ctx, (tx) => promisesOf(tx, f.ctx, [f.ravi.id], T))).get(f.ravi.id)!;
    expect(promiseWords(shown)).toMatch(/^Promised for \d{2}-\d{2}-\d{4} · ₹5,000$/);
  });

  it("refuses a date in the past or more than 60 days ahead, and more than the family owes", async () => {
    await expect(note(f, f.sita.id, day(-1))).rejects.toThrow(/promised date has passed/);
    await expect(note(f, f.sita.id, day(PROMISE_MAX_DAYS + 1))).rejects.toThrow(/within 60 days/);
    await expect(note(f, f.sita.id, day(10), R(999_999))).rejects.toThrow(/cannot be for more/);
    await expect(note(f, f.sita.id, day(10), BigInt(0))).rejects.toThrow(/more than ₹0/);
    expect(await withSchool(f.ctx, (tx) => tx.feeCallNote.count({ where: { studentId: f.sita.id } }))).toBe(0);
  });

  it("replaces an open promise with a newer one", async () => {
    const first = await note(f, f.anil.id, day(10));
    const second = await note(f, f.anil.id, day(12), null, "Father asked for two more days");
    expect((await reload(f, first.id)).promiseState).toBe("REPLACED");
    expect(second).toMatchObject({ promiseState: "OPEN", promisedPaise: null, note: "Father asked for two more days" });
    expect(await withSchool(f.ctx, (tx) => tx.feeCallNote.count({ where: { studentId: f.anil.id, promiseState: "OPEN" } }))).toBe(1);
  });
});

describe("kept and broken", () => {
  it("is kept when a payment covering it is posted", async () => {
    const open = await withSchool(f.ctx, (tx) => tx.feeCallNote.findFirstOrThrow({ where: { studentId: f.ravi.id, promiseState: "OPEN" } }));
    const rows = await dues(f.ctx, f.ravi.id);
    await collect(f.ctx, { studentId: f.ravi.id, dueIds: [rows[0].id], amountPaise: R(5000), confirmDuplicate: true });
    const after = await reload(f, open.id);
    expect(after).toMatchObject({ promiseState: "KEPT", promisePaidPaise: R(5000) });
    expect(after.promiseSettledAt).not.toBeNull();
    expect(await withSchool(f.ctx, (tx) => tx.auditLogEntry.count({ where: { recordType: "Promise to Pay", recordId: open.id, action: "promise-kept" } }))).toBe(1);
  });

  it("is broken when the date passes without enough: the family goes first on the call list, the recorder is told", async () => {
    const n = await note(f, f.sita.id, day(3), R(5000));
    const rows = await dues(f.ctx, f.sita.id);
    await collect(f.ctx, { studentId: f.sita.id, dueIds: [rows[0].id], amountPaise: R(2000), confirmDuplicate: true });
    expect((await reload(f, n.id)).promiseState).toBe("OPEN");
    // On the promised date it is still open.
    expect(await withSchool(job(f), (tx) => settlePromises(tx, job(f), day(3)))).toEqual({ kept: 0, broken: 0 });
    // The day after, it is broken.
    expect(await withSchool(job(f), (tx) => settlePromises(tx, job(f), day(4)))).toEqual({ kept: 0, broken: 1 });
    expect(await reload(f, n.id)).toMatchObject({ promiseState: "BROKEN", promisePaidPaise: R(2000) });
    const told = await withSchool(f.ctx, (tx) => tx.notification.findFirstOrThrow({ where: { type: "fee-promise", userLoginId: f.accountant.id } }));
    expect(told.text).toContain("Sita Rao");
    expect(told.text).toContain("paid ₹2,000");

    // Call list order on that day: Sita (broken) first, Anil (open promise) last.
    const list = await withSchool(f.ctx, (tx) => defaulters(tx, f.ctx, viewerOf(f), day(4)));
    const order = list.rows.map((r) => r.studentId);
    expect(order[0]).toBe(f.sita.id);
    expect(order.at(-1)).toBe(f.anil.id);
    expect(list.rows[0].promise?.state).toBe("BROKEN");
    expect(list.rows.map(callOrder)).toEqual([...list.rows.map(callOrder)].sort());
    // The Defaulters page reads the whole list and its filtered one together (G37): the same as one at a time.
    const filters = [{}, { reminded: "no" as const }, { amountAbove: list.rows[0].overduePaise }, { q: "Sita" }];
    const together = await withSchool(f.ctx, (tx) => defaulterLists(tx, f.ctx, viewerOf(f), day(4), filters));
    for (const [i, one] of filters.entries()) expect(together[i]).toEqual(await withSchool(f.ctx, (tx) => defaulters(tx, f.ctx, viewerOf(f), day(4), one)));
    expect(together[3].rows.map((r) => r.studentId)).toEqual([f.sita.id]);
    // A broken promise no longer pauses reminders.
    expect(await withSchool(f.ctx, (tx) => pausedByPromise(tx, f.ctx, [f.sita.id, f.anil.id], day(4)))).toEqual(new Set([f.anil.id]));
  });

  it("counts kept and broken this term on the Fee Dashboard", async () => {
    const s = await withSchool(f.ctx, (tx) => promiseSummary(tx, day(4), f.year.id));
    expect(s).toMatchObject({ kept: 1, broken: 1, open: 1 });
  });
});

describe("automatic reminders pause until the promised date", () => {
  it("skips the family with an open promise, and sends again once it is broken", async () => {
    await feature(g.ctx, PROMISE_FEATURE);
    const oct = (await dues(g.ctx, g.ravi.id)).find((r) => r.dueDate.toISOString().startsWith("2026-10"))!;
    const D = oct.dueDate;
    await withSchool(g.ctx, (tx) => tx.feeSetting.update({ where: { schoolId: g.school.id }, data: { remindersOn: true, reminderDays: [0, 7] } }));
    // On the Oct due date, Ravi's father promised to pay in 5 days.
    await note(g, g.ravi.id, addDays(D, 5), null, "", D);
    const sent = await withSchool(job(g), (tx) => automaticReminders(tx, job(g), D));
    expect(sent.sent).toBeGreaterThan(0);
    const once = (k: string) => withSchool(g.ctx, (tx) => tx.feeReminder.count({ where: { onceKey: k } }));
    expect(await once(reminderOnceKey(g.sita.id, D))).toBe(1);
    expect(await once(reminderOnceKey(g.ravi.id, D))).toBe(0);

    // 7 days later the date has passed with nothing paid: the job marks it broken first, then reminds Ravi.
    const later = addDays(D, 7);
    expect(await withSchool(job(g), (tx) => settlePromises(tx, job(g), later))).toEqual({ kept: 0, broken: 1 });
    await withSchool(job(g), (tx) => automaticReminders(tx, job(g), later));
    expect(await once(reminderOnceKey(g.ravi.id, later))).toBe(1);
  });
});

describe("the forecasts count promises on their promised dates", () => {
  let h: FeeSchool;
  const NOW = at("2026-09-20", "20:00");
  const TODAY = d("2026-09-20");

  beforeAll(async () => {
    h = await makeFeeSchool();
    for (const k of ["ai-assistant", "ai-forecasts", PROMISE_FEATURE]) await feature(h.ctx, k);
    // Ravi pays on time; Sita pays about six weeks late; Anil has not paid (as in the Looking ahead tests).
    const pay = (studentId: string, dueId: string, date: string) => collect(h.pctx, { studentId, dueIds: [dueId], amountPaise: R(6000), confirmDuplicate: true, paidAt: at(date, "11:00") }, ["principal"]);
    const ravi = await dues(h.ctx, h.ravi.id);
    await pay(h.ravi.id, ravi[0].id, "2026-04-03");
    await pay(h.ravi.id, ravi[1].id, "2026-07-02");
    const sita = await dues(h.ctx, h.sita.id);
    await pay(h.sita.id, sita[0].id, "2026-05-12");
    await pay(h.sita.id, sita[1].id, "2026-08-20");
  }, 180_000);

  it("adds the promised amount to the month of its date in the collection forecast", async () => {
    const without = await withSchool(h.ctx, (tx) => forecast(tx, TODAY, { promises: true }));
    await note(h, h.anil.id, d("2026-10-05"), R(6000), "", TODAY);
    const withIt = await withSchool(h.ctx, (tx) => forecast(tx, TODAY, { promises: true }));
    const off = await withSchool(h.ctx, (tx) => forecast(tx, TODAY, { promises: false }));
    // Without the option it follows the school's switch (on here), as the cash forecast in Looking ahead reads it.
    const bySwitch = await withSchool(h.ctx, (tx) => forecast(tx, TODAY));
    expect(withIt.promises).toBe(1);
    expect(withIt.months.map((m) => m.promised)).toEqual([BigInt(0), R(6000), BigInt(0)]);
    expect(withIt.months[1].expected! - without.months[1].expected!).toBe(R(6000));
    expect(off.months[1].expected).toBe(without.months[1].expected);
    expect(bySwitch.months[1].expected).toBe(withIt.months[1].expected);
  });

  it("says in Looking ahead what families promised in the next 30 days", async () => {
    const list = await withSchool(job(h), (tx) => computeForecasts(tx, job(h), NOW));
    const fees = list.find((x) => x.area === "fees")!;
    expect(fees.body).toContain("₹6k that 1 family promised on calls, counted on the promised dates");
    expect(fees.source).toContain("Promises to Pay");
  });
});

describe("who may record a promise", () => {
  const full = (key: string) => combineRoles([ALL_ROLE_TEMPLATES.find((r) => r.key === key)!.permissions])["fee-management"];
  it("is whoever follows up dues with full Fee Management: the Principal, School Admin and Accountant", () => {
    for (const k of ["principal", "school-admin", "accountant"]) expect(full(k).change).toBe("all");
    for (const k of ["vice-principal", "office-staff", "class-teacher", "admission-counsellor"]) {
      const a = full(k);
      expect(a.change).not.toBe("all");
      expect(() => requireFeeStaff(a, "add call notes")).toThrow(/cannot do add call notes/);
    }
  });
});

describe("one school never sees another's promises", () => {
  it("hides school A's promises from school B, and B's job never marks them", async () => {
    const mine = await withSchool(f.ctx, (tx) => tx.feeCallNote.findMany({ where: { promiseState: { not: null } }, select: { id: true } }));
    expect(mine.length).toBeGreaterThan(0);
    await withSchool(g.ctx, async (tx) => {
      expect(await tx.feeCallNote.findMany({ where: { id: { in: mine.map((m) => m.id) } } })).toHaveLength(0);
      expect(await tx.feeCallNote.updateMany({ where: { id: { in: mine.map((m) => m.id) } }, data: { promiseState: "KEPT" } })).toEqual({ count: 0 });
      expect((await promisesOf(tx, g.ctx, [f.anil.id], T)).size).toBe(0);
    });
    await expect(withSchool(g.ctx, (tx) => tx.feeCallNote.create({ data: { schoolId: f.school.id, studentId: f.anil.id, note: "Into school A", promisedOn: day(3), promiseState: "OPEN" } }))).rejects.toThrow();
    await withSchool(job(g), (tx) => settlePromises(tx, job(g), day(30)));
    expect((await withSchool(f.ctx, (tx) => tx.feeCallNote.findFirstOrThrow({ where: { studentId: f.anil.id, promiseState: "OPEN" } }))).promiseState).toBe("OPEN");
  });
});
