// Promise to Pay (06 §2 Defaulters, gap list P1.7): when the accountant calls a
// family about dues, they note "will pay ₹5,000 on 25-10-2026". While the
// promise is open, automatic fee reminders to that family pause and the dues
// list shows "Promised for 25-10-2026". A payment that covers it by the date
// marks it Kept. When the date passes without enough payment it is Broken: the
// family goes back to the top of the call list and reminders resume. The fee
// forecasts count open promises on their promised dates.
//
// A Promise to Pay is a Fee Call Note with a promised date (one record, no
// copy). Switched on school by school (School Feature "fee-promises"); with it
// off, a promised date on a call note is only noted, as before.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { formatDate, formatRupees, formatRupeesShort } from "../format";
import { addDays } from "../staff/dates";
import { featureOn } from "./settings";
import { MoneyProblem } from "./problem";

const ZERO = BigInt(0);

export const PROMISE_FEATURE = "fee-promises";
/** A promised date can be at most this many days ahead. A longer plan is a matter for installments or a concession. */
export const PROMISE_MAX_DAYS = 60;

export type PromiseState = "OPEN" | "KEPT" | "BROKEN" | "REPLACED";

type PromiseAmounts = { promisedPaise: bigint | null; owedPaise: bigint | null };

/** What a promise is for: the amount the family said, else everything overdue when it was made. */
export const promiseTarget = (p: PromiseAmounts) => p.promisedPaise ?? p.owedPaise ?? ZERO;

/** Kept when the payments made by the date cover it; broken once the date has passed without that; else still open. */
export function promiseOutcome(p: { promisedOn: Date; target: bigint }, paid: bigint, today: Date): "KEPT" | "BROKEN" | "OPEN" {
  if (paid >= p.target) return "KEPT";
  if (p.promisedOn < today) return "BROKEN";
  return "OPEN";
}

/** The promised date must be today or later, and within PROMISE_MAX_DAYS. */
export function checkPromiseDate(promisedOn: Date, today: Date) {
  if (promisedOn < today) throw new MoneyProblem(`The promised date has passed. Choose ${formatDate(today)} or later.`, "promisedOn");
  const last = addDays(today, PROMISE_MAX_DAYS);
  if (promisedOn > last) throw new MoneyProblem(`Choose a date within ${PROMISE_MAX_DAYS} days, by ${formatDate(last)}. For a longer plan, change the installments in the student's ledger.`, "promisedOn");
}

/** What one student owes now: overdue (due before today, as on Defaulters) and everything still open. */
export async function owedNow(tx: Tx, studentId: string, today: Date) {
  const rows = await tx.studentFeeDue.findMany({ where: { studentId, state: "OPEN", balancePaise: { gt: 0 } }, select: { dueDate: true, balancePaise: true } });
  let overdue = ZERO, open = ZERO;
  for (const r of rows) {
    open += r.balancePaise;
    if (r.dueDate < today) overdue += r.balancePaise;
  }
  return { overdue, open };
}

/**
 * Paid towards a promise: posted payments for the student made after the call
 * and dated on or before the promised date. Brought-in receipts never count.
 */
export async function paidTowards(tx: Tx, p: { studentId: string; createdAt: Date; promisedOn: Date }) {
  const agg = await tx.payment.aggregate({
    where: {
      studentId: p.studentId, status: "POSTED", broughtIn: false, paymentDate: { lte: p.promisedOn },
      OR: [{ paidAt: { gte: p.createdAt } }, { createdAt: { gte: p.createdAt } }],
    },
    _sum: { amountPaise: true },
  });
  return agg._sum.amountPaise ?? ZERO;
}

export type PromiseInput = { studentId: string; note: string | null; promisedOn: Date; amountPaise: bigint | null; today: Date };

/**
 * Records a Promise to Pay with its call note. An open promise for the same
 * student is replaced by the new one. The amount is optional (empty means
 * everything overdue now) and cannot be more than the student owes.
 */
export async function recordPromise(tx: Tx, ctx: SchoolContext, input: PromiseInput) {
  checkPromiseDate(input.promisedOn, input.today);
  const owed = await owedNow(tx, input.studentId, input.today);
  if (input.amountPaise !== null) {
    if (input.amountPaise <= ZERO) throw new MoneyProblem("Amount must be more than ₹0, or leave it empty for everything overdue.", "amount");
    if (input.amountPaise > owed.open) throw new MoneyProblem(owed.open > ZERO ? `The family owes ${formatRupees(owed.open)} in all. The promise cannot be for more.` : "This student owes nothing now, so there is no promise to record.", "amount");
  } else if (owed.overdue <= ZERO) {
    throw new MoneyProblem("Nothing is overdue now. Write the amount the family promised to pay.", "amount");
  }
  const note = input.note?.trim() || `Promised to pay ${input.amountPaise !== null ? formatRupees(input.amountPaise) : "the overdue fees"} by ${formatDate(input.promisedOn)}.`;
  if (note.length > 500) throw new MoneyProblem("Note can be at most 500 characters.", "note");

  const now = new Date();
  const earlier = await tx.feeCallNote.findMany({ where: { studentId: input.studentId, promiseState: "OPEN" } });
  for (const e of earlier) {
    await tx.feeCallNote.update({ where: { id: e.id }, data: { promiseState: "REPLACED", promiseSettledAt: now } });
    await writeAudit(tx, ctx, { action: "promise-replaced", recordType: "Promise to Pay", recordId: e.id, before: { state: "OPEN" }, after: { state: "REPLACED", promisedOn: e.promisedOn?.toISOString().slice(0, 10) ?? null } });
  }
  const n = await tx.feeCallNote.create({
    data: {
      schoolId: ctx.schoolId, studentId: input.studentId, note, promisedOn: input.promisedOn,
      promisedPaise: input.amountPaise, owedPaise: owed.overdue, promiseState: "OPEN", createdById: ctx.userId,
    },
  });
  await writeAudit(tx, ctx, {
    action: "promise-to-pay", recordType: "Promise to Pay", recordId: n.id,
    after: { note, promisedOn: input.promisedOn.toISOString().slice(0, 10), amountPaise: input.amountPaise?.toString() ?? null, overduePaise: owed.overdue.toString() },
  });
  return n;
}

/**
 * Marks open promises Kept or Broken: called when a payment is posted (for that
 * student) and by the fee reminder job (for everyone). A broken promise tells
 * the person who recorded it. Does nothing while Promise to Pay is off.
 */
export async function settlePromises(tx: Tx, ctx: SchoolContext, today: Date, studentIds?: string[]) {
  if (!(await featureOn(tx, ctx, PROMISE_FEATURE))) return { kept: 0, broken: 0 };
  const open = await tx.feeCallNote.findMany({ where: { promiseState: "OPEN", promisedOn: { not: null }, ...(studentIds ? { studentId: { in: studentIds } } : {}) } });
  let kept = 0, broken = 0;
  const now = new Date();
  for (const p of open) {
    const target = promiseTarget(p);
    const paid = await paidTowards(tx, { studentId: p.studentId, createdAt: p.createdAt, promisedOn: p.promisedOn! });
    const outcome = promiseOutcome({ promisedOn: p.promisedOn!, target }, paid, today);
    if (outcome === "OPEN") continue;
    await tx.feeCallNote.update({ where: { id: p.id }, data: { promiseState: outcome, promisePaidPaise: paid, promiseSettledAt: now } });
    await writeAudit(tx, ctx, {
      action: outcome === "KEPT" ? "promise-kept" : "promise-broken", recordType: "Promise to Pay", recordId: p.id,
      before: { state: "OPEN" }, after: { state: outcome, promisedOn: p.promisedOn!.toISOString().slice(0, 10), targetPaise: target.toString(), paidPaise: paid.toString() },
    });
    if (outcome === "KEPT") { kept++; continue; }
    broken++;
    if (p.createdById) {
      const s = await tx.student.findUnique({ where: { id: p.studentId }, select: { fullName: true } });
      await notify(tx, ctx, {
        to: p.createdById, type: "fee-promise",
        text: `Promise broken: ${s?.fullName ?? "A student"}'s family promised ${formatRupees(target)} by ${formatDate(p.promisedOn!)}${paid > ZERO ? ` and paid ${formatRupees(paid)}` : " and has not paid"}. They are back at the top of Defaulters.`,
        link: `/fee-management/defaulters?who=${p.studentId}`,
        groupKey: `fee-promise:${p.id}`,
      });
    }
  }
  return { kept, broken };
}

/** Students whose automatic fee reminders pause today: an open promise dated today or later. */
export async function pausedByPromise(tx: Tx, ctx: SchoolContext, studentIds: string[], today: Date) {
  if (!studentIds.length || !(await featureOn(tx, ctx, PROMISE_FEATURE))) return new Set<string>();
  const rows = await tx.feeCallNote.findMany({ where: { studentId: { in: studentIds }, promiseState: "OPEN", promisedOn: { gte: today } }, select: { studentId: true } });
  return new Set(rows.map((r) => r.studentId));
}

export type PromiseView = {
  id: string;
  /** BROKEN also for an open promise whose date has passed but the job has not marked yet. */
  state: PromiseState;
  promisedOn: Date;
  /** The amount said, or null for "everything overdue". */
  amountPaise: bigint | null;
  targetPaise: bigint;
  paidPaise: bigint | null;
};

type NoteRow = { id: string; studentId: string; promiseState: PromiseState | null; promisedOn: Date | null; promisedPaise: bigint | null; owedPaise: bigint | null; promisePaidPaise: bigint | null; createdAt: Date };

/** The promise that matters for a student now: from their latest call note, if that note is a promise. */
export function currentPromise(notes: NoteRow[], today: Date): PromiseView | null {
  const latest = [...notes].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (!latest || !latest.promiseState || !latest.promisedOn || latest.promiseState === "REPLACED") return null;
  const state: PromiseState = latest.promiseState === "OPEN" && latest.promisedOn < today ? "BROKEN" : latest.promiseState;
  return { id: latest.id, state, promisedOn: latest.promisedOn, amountPaise: latest.promisedPaise, targetPaise: promiseTarget(latest), paidPaise: latest.promisePaidPaise };
}

/** Each student's current promise (latest call note), for the dues list and the ledger. Empty while Promise to Pay is off. */
export async function promisesOf(tx: Tx, ctx: SchoolContext, studentIds: string[], today: Date) {
  const out = new Map<string, PromiseView>();
  if (!studentIds.length || !(await featureOn(tx, ctx, PROMISE_FEATURE))) return out;
  const notes = await tx.feeCallNote.findMany({ where: { studentId: { in: studentIds } }, orderBy: { createdAt: "desc" } });
  const by = new Map<string, NoteRow[]>();
  for (const n of notes) by.set(n.studentId, [...(by.get(n.studentId) ?? []), n]);
  for (const [id, rows] of by) {
    const p = currentPromise(rows, today);
    if (p) out.set(id, p);
  }
  return out;
}

/** "Promised for 25-10-2026" (with the amount when one was said); "Promise of 25-10-2026 broken"; "Promise kept". */
export function promiseWords(p: Pick<PromiseView, "state" | "promisedOn" | "amountPaise">) {
  const date = formatDate(p.promisedOn);
  if (p.state === "OPEN") return `Promised for ${date}${p.amountPaise !== null ? ` · ${formatRupees(p.amountPaise)}` : ""}`;
  if (p.state === "BROKEN") return `Promise of ${date} broken`;
  if (p.state === "KEPT") return `Promise of ${date} kept`;
  return `Promise of ${date} replaced`;
}

/**
 * Open promises still to come, each with what is left to pay on it (never more
 * than the student owes now), for the forecasts: counted on the promised date.
 * `only`: the students of one campus (feeStudentFilter), when the person is limited to one.
 */
export async function openPromises(tx: Tx, today: Date, until?: Date, only: { studentId?: { in: string[] } } = {}) {
  const rows = await tx.feeCallNote.findMany({ where: { ...only, promiseState: "OPEN", promisedOn: { gte: today, ...(until ? { lte: until } : {}) } } });
  const out: { studentId: string; promisedOn: Date; leftPaise: bigint }[] = [];
  for (const p of rows) {
    const paid = await paidTowards(tx, { studentId: p.studentId, createdAt: p.createdAt, promisedOn: p.promisedOn! });
    const owed = await owedNow(tx, p.studentId, today);
    let left = promiseTarget(p) - paid;
    if (left > owed.open) left = owed.open;
    if (left > ZERO) out.push({ studentId: p.studentId, promisedOn: p.promisedOn!, leftPaise: left });
  }
  return out;
}

/** Sums promised amounts whose promised date falls between two days (both included). */
export function promisedBetween(promises: { promisedOn: Date; leftPaise: bigint }[], from: Date, to: Date) {
  return promises.filter((p) => p.promisedOn >= from && p.promisedOn <= to).reduce((s, p) => s + p.leftPaise, ZERO);
}

/** Is Promise to Pay on for the school this transaction works in? (Row-level security keeps the query to that school.) */
export async function promisesOnHere(tx: Tx) {
  return Boolean(await tx.schoolFeature.findFirst({ where: { featureKey: PROMISE_FEATURE, isOn: true }, select: { featureKey: true } }));
}

/**
 * For Looking ahead's fee signal (src/lib/reports/forecasts.ts): the open
 * promises falling in the next `days` days, counted on their promised dates,
 * as a sentence for the body and a few words for the source. Empty while
 * Promise to Pay is off or nothing is promised.
 */
export async function promisesAhead(tx: Tx, today: Date, days: number, onTimePaise: bigint) {
  if (!(await promisesOnHere(tx))) return { promisedPaise: ZERO, words: "", source: "" };
  const until = addDays(today, days);
  const list = await openPromises(tx, today, until);
  const promised = promisedBetween(list, today, until);
  if (promised <= ZERO) return { promisedPaise: ZERO, words: "", source: "" };
  const families = new Set(list.map((p) => p.studentId)).size;
  return {
    promisedPaise: promised,
    words: ` Expected by then: about ${formatRupeesShort(onTimePaise)} on time, and ${formatRupeesShort(promised)} that ${families} ${families === 1 ? "family" : "families"} promised on calls, counted on the promised dates.`,
    source: ", and the open Promises to Pay",
  };
}

/** The term holding today (else the academic year): its dates, for "Promises this term". */
export async function termAround(tx: Tx, today: Date, yearId: string | null) {
  const term = await tx.term.findFirst({ where: { archivedAt: null, startDate: { lte: today }, endDate: { gte: today }, ...(yearId ? { academicYearId: yearId } : {}) }, orderBy: { startDate: "desc" } });
  if (term) return { label: term.name, from: term.startDate, to: term.endDate };
  const year = yearId ? await tx.academicYear.findUnique({ where: { id: yearId } }) : null;
  if (year) return { label: year.name, from: year.startDate, to: year.endDate };
  return { label: "the last 90 days", from: addDays(today, -90), to: today };
}

/**
 * The Fee Dashboard's Promises figure: kept and broken this term (by promised
 * date), and open now. `only`: one campus's students, when the person is limited to one.
 */
export async function promiseSummary(tx: Tx, today: Date, yearId: string | null, only: { studentId?: { in: string[] } } = {}) {
  const term = await termAround(tx, today, yearId);
  const [settled, open] = await Promise.all([
    tx.feeCallNote.groupBy({ by: ["promiseState"], where: { ...only, promiseState: { in: ["KEPT", "BROKEN"] }, promisedOn: { gte: term.from, lte: term.to } }, _count: { _all: true } }),
    tx.feeCallNote.findMany({ where: { ...only, promiseState: "OPEN" }, select: { promisedOn: true, promisedPaise: true, owedPaise: true } }),
  ]);
  const count = (s: string) => settled.find((r) => r.promiseState === s)?._count._all ?? 0;
  // An open promise whose date has passed (not marked yet by the job) counts as broken.
  const lateOpen = open.filter((p) => p.promisedOn && p.promisedOn < today && p.promisedOn >= term.from && p.promisedOn <= term.to).length;
  const waiting = open.filter((p) => p.promisedOn && p.promisedOn >= today);
  return {
    term,
    kept: count("KEPT"),
    broken: count("BROKEN") + lateOpen,
    open: waiting.length,
    openPaise: waiting.reduce((s, p) => s + promiseTarget(p), ZERO),
  };
}
