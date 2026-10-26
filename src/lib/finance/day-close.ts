// Close the day (Day Book, approved design mod-finance.jsx CloseDaySheet):
// at the end of a day the accountant counts the cash in the office cash box
// against what the books expect, says why when the two differ (the Principal
// is told), and closes the day. A closed day, and every day before it, can no
// longer change: an entry made later for that date goes into the next open
// day (postToDayBook), and a person cannot choose a closed past date
// (assertDayOpen). Days with entries close in order. The Principal or School
// Admin can reopen the latest closed day with a reason; the person who closed
// it can only undo it straight after (P5). Every close and reopen is audited.
import "server-only";

import type { DayClose } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate, formatRupees } from "../format";
import { notify } from "../notifications";
import { sendReminder } from "../reminders";
import { MoneyProblem } from "../fees/problem";
import { dayBookTotals } from "./daybook";
import { dayClosedThrough, financialYearOf } from "./years";
import { financeSettings } from "./settings";
import { doesWork, type DutyPerson } from "../duty";
import { reachFor, type PermissionMap } from "../permissions";

const DAY = 86_400_000;
const ZERO = BigInt(0);
export const DAY_BOOK_HREF = "/finance-management/day-book";
const dayHref = (d: Date) => `${DAY_BOOK_HREF}?period=custom&from=${iso(d)}&to=${iso(d)}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Does this person count the cash and close the day? Full Finance and the Day Book is their desk (not only read, as for the Principal). */
export function closesDays(person: DutyPerson & { permissions: PermissionMap }) {
  return reachFor(person.permissions, "finance-management", "create") === "all" && doesWork(person, "finance-management", "day-book");
}

/** May this person reopen a closed day? Full Finance; never the person who closed it (checked in reopenDay). */
export function reopensDays(person: { permissions: PermissionMap }) {
  return reachFor(person.permissions, "finance-management", "approve") === "all";
}

/** The close in force for a date, or null. */
export async function closeOn(tx: Tx, ctx: SchoolContext, date: Date) {
  return tx.dayClose.findFirst({ where: { schoolId: ctx.schoolId, date, reopenedAt: null } });
}

/** Closes in force from one date to another (for a Day Book range). */
export async function closesBetween(tx: Tx, ctx: SchoolContext, from: Date, to: Date) {
  return tx.dayClose.findMany({ where: { schoolId: ctx.schoolId, reopenedAt: null, date: { gte: from, lte: to } }, orderBy: { date: "asc" } });
}

/** Cash in hand the books expect at the end of a day: every cash account, everything up to and including that day. */
export async function expectedCash(tx: Tx, ctx: SchoolContext, date: Date) {
  const cash = await tx.bankAccount.findMany({ where: { schoolId: ctx.schoolId, kind: "CASH" }, select: { id: true } });
  if (!cash.length) return ZERO;
  const rows = await tx.dayBookEntry.groupBy({ by: ["direction"], where: { schoolId: ctx.schoolId, accountId: { in: cash.map((c) => c.id) }, date: { lte: date } }, _sum: { amountPaise: true } });
  const val = (d: "IN" | "OUT") => rows.find((r) => r.direction === d)?._sum.amountPaise ?? ZERO;
  return val("IN") - val("OUT");
}

/** The day's totals as the Day Book shows them (opening balances and money moved are neither income nor expense). */
async function dayTotals(tx: Tx, ctx: SchoolContext, date: Date) {
  const entries = await tx.dayBookEntry.findMany({ where: { schoolId: ctx.schoolId, date, section: { notIn: ["opening", "transfer"] } }, select: { direction: true, section: true, amountPaise: true } });
  const t = dayBookTotals(entries);
  return { income: t.income, expense: t.expense, net: t.net, entries: entries.length };
}

/** Days after the Day Book is closed through, up to today, that have entries: they wait to be counted and closed, oldest first. */
export async function daysToClose(tx: Tx, ctx: SchoolContext, today: Date, limit = 31) {
  const [through, settings] = await Promise.all([dayClosedThrough(tx, ctx), financeSettings(tx, ctx)]);
  const after = through && through >= settings.goLiveDate ? through : new Date(settings.goLiveDate.getTime() - DAY);
  const rows = await tx.dayBookEntry.groupBy({ by: ["date"], where: { schoolId: ctx.schoolId, date: { gt: after, lte: today }, section: { not: "opening" } }, orderBy: { date: "asc" }, take: limit });
  return { through, days: rows.map((r) => r.date) };
}

/** What the Close the day sheet shows for one date: the books' cash, the day's totals and whether it may be closed now. */
export async function closePreview(tx: Tx, ctx: SchoolContext, date: Date, today: Date) {
  const [expected, totals, problem] = await Promise.all([expectedCash(tx, ctx, date), dayTotals(tx, ctx, date), whyNotClose(tx, ctx, date, today)]);
  return { date, expected, ...totals, problem };
}

/** Why this date cannot be closed now, in plain words, or null. */
export async function whyNotClose(tx: Tx, ctx: SchoolContext, date: Date, today: Date): Promise<string | null> {
  if (date > today) return `${formatDate(date)} has not come yet. A day is closed at its end, or later.`;
  const settings = await financeSettings(tx, ctx);
  if (date < settings.goLiveDate) return `${formatDate(date)} is before School OS was started on ${formatDate(settings.goLiveDate)}. Those books are kept in the old software.`;
  const fy = await tx.financialYear.findFirst({ where: { schoolId: ctx.schoolId, archivedAt: null, startDate: { lte: date }, endDate: { gte: date } } });
  if (fy?.status === "CLOSED") return `Finance year ${fy.name} is closed, so its days are already locked.`;
  const through = await dayClosedThrough(tx, ctx);
  if (through && date <= through) {
    return iso(date) === iso(through) ? `${formatDate(date)} is already closed.` : `The Day Book is closed up to ${formatDate(through)}, so ${formatDate(date)} is already locked.`;
  }
  if (through) {
    const earlier = await tx.dayBookEntry.findFirst({ where: { schoolId: ctx.schoolId, date: { gt: through, lt: date }, section: { not: "opening" } }, orderBy: { date: "asc" }, select: { date: true } });
    if (earlier) return `Close ${formatDate(earlier.date)} first. Days with entries are counted and closed in order.`;
  }
  return null;
}

export type CloseInput = { date: Date; countedPaise: bigint; reason: string | null; today: Date };

/**
 * Closes a day: the cash counted against what the books expect, the totals
 * kept, and the day (with every day before it) locked. A count that differs
 * needs a reason, and the Principal is told.
 */
export async function closeDay(tx: Tx, ctx: SchoolContext, input: CloseInput) {
  const problem = await whyNotClose(tx, ctx, input.date, input.today);
  if (problem) throw new MoneyProblem(problem, "date");
  if (input.countedPaise < ZERO) throw new MoneyProblem("Cash counted cannot be less than ₹0.", "counted");
  const [expected, totals, fy] = await Promise.all([expectedCash(tx, ctx, input.date), dayTotals(tx, ctx, input.date), financialYearOf(tx, ctx, input.date)]);
  const difference = input.countedPaise - expected;
  const reason = input.reason?.trim().replace(/\s+/g, " ") || null;
  if (difference !== ZERO && (!reason || reason.length < 5)) {
    throw new MoneyProblem(`The count is ${difference > ZERO ? `${formatRupees(difference)} more` : `${formatRupees(-difference)} less`} than the books. Say why, in a few words; the Principal is told.`, "reason");
  }
  let close: DayClose;
  try {
    close = await tx.dayClose.create({
      data: {
        schoolId: ctx.schoolId, financialYearId: fy.id, date: input.date, expectedCashPaise: expected, countedCashPaise: input.countedPaise,
        differenceReason: difference === ZERO ? null : reason, incomePaise: totals.income, expensePaise: totals.expense, entryCount: totals.entries, closedById: ctx.userId,
      },
    });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") throw new MoneyProblem(`${formatDate(input.date)} was closed a moment ago by someone else.`, "date");
    throw e;
  }
  await writeAudit(tx, ctx, {
    action: "day-closed", recordType: "Day Close", recordId: close.id,
    after: { date: formatDate(input.date), cashExpected: formatRupees(expected), cashCounted: formatRupees(input.countedPaise), difference: difference === ZERO ? "None" : formatRupees(difference), reason: close.differenceReason, income: formatRupees(totals.income), expense: formatRupees(totals.expense), entries: totals.entries },
  });
  if (difference !== ZERO) {
    const who = ctx.userId ? (await tx.userLogin.findUnique({ where: { id: ctx.userId }, select: { displayName: true } }))?.displayName : null;
    for (const to of await loginsWithRole(tx, ctx, "principal")) {
      await notify(tx, ctx, { to, type: "day-close", text: `Day Book for ${formatDate(input.date)} closed with cash ${difference > ZERO ? `${formatRupees(difference)} more` : `${formatRupees(-difference)} short`}${who ? ` by ${who}` : ""}: ${close.differenceReason}`, link: dayHref(input.date) });
    }
  }
  return { close, expected, difference, totals };
}

/**
 * Reopens the latest closed day, with a reason: its entries can change again.
 * Not by the person who closed it (they only undo straight after closing).
 */
export async function reopenDay(tx: Tx, ctx: SchoolContext, closeId: string, reason: string, opts: { undo?: boolean } = {}) {
  const close = await tx.dayClose.findFirst({ where: { id: closeId, schoolId: ctx.schoolId } });
  if (!close) throw new MoneyProblem("This closed day was not found.");
  if (close.reopenedAt) throw new MoneyProblem(`${formatDate(close.date)} is already open again.`);
  const later = await tx.dayClose.findFirst({ where: { schoolId: ctx.schoolId, reopenedAt: null, date: { gt: close.date } }, orderBy: { date: "desc" }, select: { date: true } });
  if (later) throw new MoneyProblem(`Reopen ${formatDate(later.date)} first. Days reopen from the latest closed day back.`);
  const fy = await tx.financialYear.findFirst({ where: { id: close.financialYearId }, select: { status: true, name: true } });
  if (fy?.status === "CLOSED") throw new MoneyProblem(`Finance year ${fy.name} is closed, so its days stay locked.`);
  const month = new Date(Date.UTC(close.date.getUTCFullYear(), close.date.getUTCMonth(), 1));
  if (await tx.periodClose.findUnique({ where: { schoolId_month: { schoolId: ctx.schoolId, month } } })) throw new MoneyProblem("Its month is closed, so the day stays locked.");
  const why = reason.trim().replace(/\s+/g, " ");
  if (opts.undo) {
    if (close.closedById !== ctx.userId) throw new MoneyProblem("Only the person who closed the day can undo it.");
    if (Date.now() - close.closedAt.getTime() > 2 * 60_000) throw new MoneyProblem("It is too late to undo. Someone else reopens the day: the Principal or the School Admin.");
  } else {
    if (close.closedById && close.closedById === ctx.userId) throw new MoneyProblem("You closed this day, so someone else reopens it: the Principal or the School Admin.");
    if (why.length < 5) throw new MoneyProblem("Say why the day is reopened, in a few words.", "reason");
  }
  await tx.dayClose.update({ where: { id: close.id }, data: { reopenedAt: new Date(), reopenedById: ctx.userId, reopenReason: opts.undo ? "Undone straight after closing" : why } });
  await writeAudit(tx, ctx, {
    action: opts.undo ? "day-close-undone" : "day-reopened", recordType: "Day Close", recordId: close.id,
    before: { date: formatDate(close.date), closed: true, cashCounted: formatRupees(close.countedCashPaise) },
    after: { closed: false, reason: opts.undo ? "Undone straight after closing" : why },
  });
  if (!opts.undo && close.closedById) {
    await notify(tx, ctx, { to: close.closedById, type: "day-close", text: `Day Book for ${formatDate(close.date)} was reopened: ${why}. Count and close it again when it is right.`, link: dayHref(close.date) });
  }
  return close;
}

/** The people who close the day: those with the Accountant role. */
async function loginsWithRole(tx: Tx, ctx: SchoolContext, key: string) {
  const rows = await tx.schoolAccess.findMany({
    where: { schoolId: ctx.schoolId, archivedAt: null, userLogin: { status: "ACTIVE", archivedAt: null }, roles: { some: { role: { key, isEnabled: true, archivedAt: null } } } },
    select: { userLoginId: true },
  });
  return [...new Set(rows.map((r) => r.userLoginId))];
}

/** "Remind": the Principal or School Admin asks the accountant to count the cash and close a day. */
export async function remindToClose(tx: Tx, ctx: SchoolContext, date: Date, today: Date) {
  const problem = await whyNotClose(tx, ctx, date, today);
  if (problem) throw new MoneyProblem(problem);
  const cash = await expectedCash(tx, ctx, date);
  const people = (await loginsWithRole(tx, ctx, "accountant")).filter((id) => id !== ctx.userId);
  if (!people.length) throw new MoneyProblem("Nobody has the Accountant role to remind. Give someone the role in Settings, Users & Permissions.");
  let sent = 0;
  for (const to of people) {
    const ok = await sendReminder(tx, ctx, {
      action: "day-close-reminder", recordType: "Day Book", recordId: `${ctx.schoolId}:${iso(date)}`, to,
      text: `Count the cash for ${formatDate(date)} and close the day. The books expect ${formatRupees(cash)} in hand.`, link: dayHref(date),
      about: { date: formatDate(date) },
    });
    if (ok) sent++;
  }
  return { sent, cash };
}
