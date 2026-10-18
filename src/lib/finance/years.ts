// The financial year (default April to March), kept apart from the academic
// year (D8d). Every Day Book Entry belongs to the financial year of its date;
// a closed financial year, or a closed month, is read-only (rule 35).
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { MoneyProblem } from "../fees/problem";
import { monthLabel, todayIn } from "../staff/dates";
import { formatDate } from "../format";

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The start month of the financial year (1 = January), from Finance Settings; April by default. */
export async function fyStartMonth(tx: Tx, ctx: SchoolContext) {
  const s = await tx.financeSetting.findUnique({ where: { schoolId: ctx.schoolId }, select: { fyStartMonth: true } });
  return s?.fyStartMonth ?? 4;
}

/** The start and end dates and name of the financial year holding a date. */
export function fyBounds(date: Date, startMonth = 4) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const startYear = m >= startMonth ? y : y - 1;
  const start = new Date(Date.UTC(startYear, startMonth - 1, 1));
  const end = new Date(Date.UTC(startYear + 1, startMonth - 1, 0));
  const name = startMonth === 1 ? String(startYear) : `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
  return { start, end, name };
}

/** "April to March" for the start month. */
export function fySpanWords(startMonth: number) {
  return `${MONTH_NAMES[startMonth - 1]} to ${MONTH_NAMES[(startMonth + 10) % 12]}`;
}

/** The Financial Year record for a date. Made by the software when the date is in a year not opened yet. */
export async function financialYearOf(tx: Tx, ctx: SchoolContext, date: Date) {
  const found = await tx.financialYear.findFirst({ where: { schoolId: ctx.schoolId, archivedAt: null, startDate: { lte: date }, endDate: { gte: date } } });
  if (found) return found;
  const b = fyBounds(date, await fyStartMonth(tx, ctx));
  const clash = await tx.financialYear.findUnique({ where: { schoolId_name: { schoolId: ctx.schoolId, name: b.name } } });
  if (clash) return clash;
  return tx.financialYear.create({ data: { schoolId: ctx.schoolId, name: b.name, startDate: b.start, endDate: b.end, createdById: ctx.userId } });
}

/** The financial year chosen on a screen (?fy=), or the one holding today. */
export async function chosenFinancialYear(tx: Tx, ctx: SchoolContext, fyId: string | null | undefined, today: Date) {
  if (fyId && /^[0-9a-f-]{36}$/i.test(fyId)) {
    const fy = await tx.financialYear.findFirst({ where: { id: fyId, archivedAt: null } });
    if (fy) return fy;
  }
  return financialYearOf(tx, ctx, today);
}

export async function financialYears(tx: Tx) {
  return tx.financialYear.findMany({ where: { archivedAt: null }, orderBy: { startDate: "desc" } });
}

/**
 * Throws when money cannot be recorded on this date: its financial year is
 * closed, or its month is closed. Says which, and what to do.
 */
export async function assertBooksOpen(tx: Tx, ctx: SchoolContext, date: Date, field = "date") {
  const fy = await financialYearOf(tx, ctx, date);
  if (fy.status === "CLOSED") {
    const start = await fyStartMonth(tx, ctx);
    throw new MoneyProblem(`This date is in ${fy.name} (${fySpanWords(start)}). Finance year ${fy.name} is closed, so its books cannot change. Post an adjustment in the open year.`, field);
  }
  const month = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const closed = await tx.periodClose.findUnique({ where: { schoolId_month: { schoolId: ctx.schoolId, month } } });
  if (closed) throw new MoneyProblem(`${monthLabel(month)} is closed, so its books cannot change. Post an adjustment in the open month.`, field);
  await assertDayOpen(tx, ctx, date, field);
  return fy;
}

/** The last date the Day Book is closed through (Close the day), or null when no day is closed. Every earlier date is locked too. */
export async function dayClosedThrough(tx: Tx, ctx: SchoolContext): Promise<Date | null> {
  const last = await tx.dayClose.findFirst({ where: { schoolId: ctx.schoolId, reopenedAt: null }, orderBy: { date: "desc" }, select: { date: true } });
  return last?.date ?? null;
}

/** Today in the school's time zone. */
export async function schoolToday(tx: Tx, ctx: SchoolContext) {
  const school = await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { timeZone: true } });
  return todayIn(school?.timeZone ?? "Asia/Kolkata");
}

/**
 * Money cannot come in or go out on a day that has not come yet, as with a
 * fee payment: an expense, its payment, other income, a journal entry, a
 * money move or a refund dated ahead would count in today's cash in hand
 * while sitting in a later Day Book.
 */
export async function assertNotFuture(tx: Tx, ctx: SchoolContext, date: Date, field = "date", what = "The date") {
  if (date > (await schoolToday(tx, ctx))) throw new MoneyProblem(`${what} cannot be in the future.`, field);
}

/**
 * Throws when a person chooses a past date the Day Book is closed through.
 * Today stays allowed after it is closed: what is recorded later today goes
 * into the next day's Day Book (postToDayBook moves it there).
 */
export async function assertDayOpen(tx: Tx, ctx: SchoolContext, date: Date, field = "date") {
  const through = await dayClosedThrough(tx, ctx);
  if (!through || date > through) return;
  if (date >= (await schoolToday(tx, ctx))) return;
  throw new MoneyProblem(`The Day Book is closed up to ${formatDate(through)}, so ${formatDate(date)} cannot change. Choose a later date, or ask the Principal to reopen the day.`, field);
}

/** The date a Day Book entry goes on: the date itself, or the day after the Day Book is closed through. */
export async function openDayFor(tx: Tx, ctx: SchoolContext, date: Date): Promise<{ date: Date; moved: boolean }> {
  const through = await dayClosedThrough(tx, ctx);
  if (!through || date > through) return { date, moved: false };
  return { date: new Date(through.getTime() + 86_400_000), moved: true };
}

/** The last day whose books are closed (closed months and years), or null. Payments cannot be dated on or before it. */
export async function lastClosedDay(tx: Tx, ctx: SchoolContext): Promise<Date | null> {
  const [fy, month] = await Promise.all([
    tx.financialYear.findFirst({ where: { schoolId: ctx.schoolId, status: "CLOSED", archivedAt: null }, orderBy: { endDate: "desc" } }),
    tx.periodClose.findFirst({ where: { schoolId: ctx.schoolId }, orderBy: { month: "desc" } }),
  ]);
  const monthEnd = month ? new Date(Date.UTC(month.month.getUTCFullYear(), month.month.getUTCMonth() + 1, 0)) : null;
  const dates = [fy?.endDate, monthEnd].filter((d): d is Date => Boolean(d));
  return dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
}
