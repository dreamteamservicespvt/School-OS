// Mess (15 §2): the weekly menu by day and meal with nutrition values per
// plate (calories, protein and a note), copying last week's menu, the daily
// head count per meal against the expected count (residents in the hostel,
// not out on a pass), and mess expenses, which go to Finance, Expenses (and to
// the Day Book when paid in cash).
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate, formatRupees } from "../format";
import { ensureFinanceDefaults } from "../finance/settings";
import { recordExpense } from "../finance/expenses";
import { instantOf } from "../front-office/time";
import { HostelProblem } from "./problem";
import { hostelSettings } from "./settings";
import { MENU_DAYS, isoOf, mondayOf } from "./words";

/* ---------- Menu ---------- */

export async function menuWeek(tx: Tx, weekStart: Date) {
  return tx.messMenuItem.findMany({ where: { weekStart }, orderBy: [{ dayIndex: "asc" }, { meal: "asc" }] });
}

export type MenuInput = { weekStart: Date; dayIndex: number; meal: string; dishes: string; kcal: number | null; proteinG: number | null; note: string | null };

export async function saveMenuItem(tx: Tx, ctx: SchoolContext, input: MenuInput) {
  if (mondayOf(input.weekStart).getTime() !== input.weekStart.getTime()) throw new HostelProblem("A menu week starts on a Monday.");
  if (!Number.isInteger(input.dayIndex) || input.dayIndex < 0 || input.dayIndex > 6) throw new HostelProblem("Choose the day.", "dayIndex");
  const s = await hostelSettings(tx, ctx);
  if (!s.meals.includes(input.meal)) throw new HostelProblem("Choose one of the meals in Hostel Settings.", "meal");
  const dishes = input.dishes.trim().replace(/\s+/g, " ");
  if (!dishes) throw new HostelProblem("Write what is served, such as Idli, sambar, chutney.", "dishes");
  if (dishes.length > 200) throw new HostelProblem("At most 200 characters.", "dishes");
  if (input.kcal !== null && (input.kcal < 0 || input.kcal > 3000)) throw new HostelProblem("Calories per plate are 0 to 3,000.", "kcal");
  if (input.proteinG !== null && (input.proteinG < 0 || input.proteinG > 200)) throw new HostelProblem("Protein per plate is 0 to 200 g.", "proteinG");
  const where = { schoolId_weekStart_dayIndex_meal: { schoolId: ctx.schoolId, weekStart: input.weekStart, dayIndex: input.dayIndex, meal: input.meal } };
  const before = await tx.messMenuItem.findUnique({ where });
  const data = { dishes, kcal: input.kcal, proteinG: input.proteinG, note: input.note?.trim() || null, updatedById: ctx.userId };
  const row = await tx.messMenuItem.upsert({ where, create: { schoolId: ctx.schoolId, weekStart: input.weekStart, dayIndex: input.dayIndex, meal: input.meal, ...data }, update: data });
  await writeAudit(tx, ctx, { action: before ? "updated" : "created", recordType: "Mess Menu", recordId: row.id, before: before ? { dishes: before.dishes, kcal: before.kcal, protein: before.proteinG } : undefined, after: { week: isoOf(input.weekStart), day: MENU_DAYS[input.dayIndex], meal: input.meal, dishes, kcal: input.kcal, protein: input.proteinG } });
  return row;
}

/** Copies one week's menu to another; meals already set in the target week are kept unless `replace`. */
export async function copyMenu(tx: Tx, ctx: SchoolContext, from: Date, to: Date, replace = false) {
  if (from.getTime() === to.getTime()) throw new HostelProblem("Choose a different week to copy to.");
  const src = await menuWeek(tx, from);
  if (!src.length) throw new HostelProblem(`There is no menu for the week of ${formatDate(from, "UTC")} to copy.`);
  const have = await menuWeek(tx, to);
  let copied = 0;
  for (const x of src) {
    const exists = have.find((h) => h.dayIndex === x.dayIndex && h.meal === x.meal);
    if (exists && !replace) continue;
    await tx.messMenuItem.upsert({
      where: { schoolId_weekStart_dayIndex_meal: { schoolId: ctx.schoolId, weekStart: to, dayIndex: x.dayIndex, meal: x.meal } },
      create: { schoolId: ctx.schoolId, weekStart: to, dayIndex: x.dayIndex, meal: x.meal, dishes: x.dishes, kcal: x.kcal, proteinG: x.proteinG, note: x.note, updatedById: ctx.userId },
      update: { dishes: x.dishes, kcal: x.kcal, proteinG: x.proteinG, note: x.note, updatedById: ctx.userId },
    });
    copied++;
  }
  await writeAudit(tx, ctx, { action: "copied", recordType: "Mess Menu", recordId: ctx.schoolId, after: { from: isoOf(from), to: isoOf(to), meals: copied } });
  return copied;
}

/* ---------- Head count ---------- */

/**
 * The expected count for a meal on a day: students living in the hostel
 * (checked in) and not out on a pass at that moment.
 */
export async function expectedCount(tx: Tx, date: Date, at: Date) {
  const allocs = await tx.bedAllocation.findMany({ where: { checkedInAt: { not: null, lte: at }, startDate: { lte: date }, OR: [{ status: "ACTIVE" }, { endedAt: { gt: at } }] }, select: { studentId: true } });
  const ids = [...new Set(allocs.map((a) => a.studentId))];
  if (!ids.length) return 0;
  const away = await tx.gatePass.count({ where: { kind: "HOSTEL_OUTING", archivedAt: null, studentId: { in: ids }, leftAt: { not: null, lte: at }, OR: [{ returnedAt: null, status: "OUT" }, { returnedAt: { gt: at } }] } });
  return Math.max(0, ids.length - away);
}

/** The meal times used to work out the expected count (inferred, in the school's time zone). */
const MEAL_MINUTE: Record<string, number> = { breakfast: 7 * 60 + 30, lunch: 13 * 60, snacks: 17 * 60, dinner: 20 * 60 };
export const mealMoment = (date: Date, meal: string, tz: string, now: Date) => {
  const at = instantOf(isoOf(date), MEAL_MINUTE[meal.toLowerCase()] ?? 12 * 60, tz);
  return at.getTime() > now.getTime() ? now : at;
};

export async function saveHeadCount(tx: Tx, ctx: SchoolContext, input: { date: Date; meal: string; actual: number; note: string | null }, opts: { now: Date; tz: string; today: Date }) {
  const s = await hostelSettings(tx, ctx);
  if (!s.meals.includes(input.meal)) throw new HostelProblem("Choose one of the meals in Hostel Settings.", "meal");
  if (input.date.getTime() > opts.today.getTime()) throw new HostelProblem("The head count cannot be for a day that has not come yet.", "date");
  if (input.date.getTime() < opts.today.getTime() - 7 * 86_400_000) throw new HostelProblem("Head counts older than 7 days cannot be changed.", "date");
  if (!Number.isInteger(input.actual) || input.actual < 0 || input.actual > 5000) throw new HostelProblem("Write how many ate, as a whole number.", "actual");
  const expected = await expectedCount(tx, input.date, mealMoment(input.date, input.meal, opts.tz, opts.now));
  const where = { schoolId_date_meal: { schoolId: ctx.schoolId, date: input.date, meal: input.meal } };
  const before = await tx.mealHeadCount.findUnique({ where });
  const row = await tx.mealHeadCount.upsert({ where, create: { schoolId: ctx.schoolId, date: input.date, meal: input.meal, expected, actual: input.actual, note: input.note?.trim() || null, recordedById: ctx.userId }, update: { expected, actual: input.actual, note: input.note?.trim() || null, recordedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: before ? "updated" : "created", recordType: "Meal Head Count", recordId: row.id, before: before ? { actual: before.actual } : undefined, after: { date: isoOf(input.date), meal: input.meal, expected, actual: input.actual } });
  return row;
}

/* ---------- Mess expenses → Finance ---------- */

const EXPENSE_HEAD_KEY = "hostel-mess";

/** The Finance expense head mess expenses go to (made the first time). */
export async function messExpenseHead(tx: Tx, ctx: SchoolContext) {
  await ensureFinanceDefaults(tx, ctx);
  const found = await tx.accountHead.findFirst({ where: { kind: "EXPENSE", systemKey: EXPENSE_HEAD_KEY } });
  if (found) {
    if (found.archivedAt) await tx.accountHead.update({ where: { id: found.id }, data: { archivedAt: null } });
    return found;
  }
  const byName = await tx.accountHead.findFirst({ where: { kind: "EXPENSE", name: { equals: "Hostel mess", mode: "insensitive" } } });
  if (byName) return tx.accountHead.update({ where: { id: byName.id }, data: { systemKey: EXPENSE_HEAD_KEY, archivedAt: null } });
  const codes = new Set((await tx.accountHead.findMany({ select: { code: true } })).map((h) => h.code));
  let code = 5020;
  while (codes.has(String(code)) && code < 5999) code++;
  return tx.accountHead.create({ data: { schoolId: ctx.schoolId, kind: "EXPENSE", code: String(code), name: "Hostel mess", groupName: "Hostel", systemKey: EXPENSE_HEAD_KEY } });
}

export type MessExpenseInput = { date: Date; item: string; amountPaise: bigint; vendorId: string | null; billFileId: string | null; paid: boolean; note: string | null };

/** Records a mess expense and the Finance expense behind it (approved at once within the limit; paid in cash when ticked). */
export async function recordMessExpense(tx: Tx, ctx: SchoolContext, input: MessExpenseInput, opts: { today: Date }) {
  const item = input.item.trim().replace(/\s+/g, " ");
  if (!item) throw new HostelProblem("Write the item or head, such as Vegetables.", "item");
  if (item.length > 80) throw new HostelProblem("The item can be at most 80 characters.", "item");
  if (input.amountPaise <= BigInt(0)) throw new HostelProblem("Amount must be more than ₹0.", "amount");
  if (input.date.getTime() > opts.today.getTime()) throw new HostelProblem("The date cannot be in the future.", "date");
  const head = await messExpenseHead(tx, ctx);
  const r = await recordExpense(tx, ctx, {
    date: input.date, accountHeadId: head.id, amountPaise: input.amountPaise, vendorId: input.vendorId, costCentreId: null, billFileId: input.billFileId,
    note: `Hostel mess: ${item}${input.note ? `. ${input.note}` : ""}`.slice(0, 500), isVendorBill: false, billNo: null, billDueDate: null, duplicateReason: null,
  }, input.paid ? { date: input.date, mode: "CASH", reference: null, accountId: null, confirmLowCash: true } : null);
  const row = await tx.messExpense.create({
    data: { schoolId: ctx.schoolId, date: input.date, item, amountPaise: input.amountPaise, vendorId: input.vendorId, billFileId: input.billFileId, paid: r.outcome === "paid", expenseId: r.expense.id, note: input.note, recordedById: ctx.userId },
  });
  await writeAudit(tx, ctx, { action: "created", recordType: "Mess Expense", recordId: row.id, after: { date: isoOf(input.date), item, amount: formatRupees(input.amountPaise), expense: r.expense.number, outcome: r.outcome } });
  return { row, expense: r.expense, outcome: r.outcome };
}
