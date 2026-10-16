// Finance Settings (07 §6, mod-finance.jsx SettingsPage): the financial year,
// go-live, bill and approval limits, numbering, the chart of accounts, the
// heads shown on the expense form, cost centres and Tally ledger names.
// Every change is written to the audit log in the same transaction.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate, formatRupees } from "../format";
import { MoneyProblem } from "../fees/problem";
import { financeSettings } from "./settings";
import { MONTH_NAMES } from "./years";

export type FinanceSettingsInput = {
  fyStartMonth: number;
  goLiveDate: Date;
  expenseApproveUpTo: bigint;
  billRequiredAbove: bigint;
  incomeReceiptPrefix: string;
  journalPrefix: string;
};

const PREFIX = /^[A-Z0-9/-]{1,12}$/;

export async function saveFinanceSettings(tx: Tx, ctx: SchoolContext, input: FinanceSettingsInput) {
  if (![1, 4, 6].includes(input.fyStartMonth)) throw new MoneyProblem("The financial year starts in April, January or June.", "fyStartMonth");
  if (input.expenseApproveUpTo < BigInt(0)) throw new MoneyProblem("The limit cannot be below ₹0.", "expenseApproveUpTo");
  if (input.billRequiredAbove < BigInt(0)) throw new MoneyProblem("The amount cannot be below ₹0.", "billRequiredAbove");
  for (const [k, v] of [["incomeReceiptPrefix", input.incomeReceiptPrefix], ["journalPrefix", input.journalPrefix]] as const) {
    if (!PREFIX.test(v)) throw new MoneyProblem("Use capital letters, numbers, / or -, up to 12 characters, like INC/.", k);
  }
  const before = await financeSettings(tx, ctx);
  // Go-live cannot move after records already made, or they would fall into "the old software".
  if (input.goLiveDate.getTime() !== before.goLiveDate.getTime()) {
    const first = await tx.dayBookEntry.findFirst({ where: { section: { not: "opening" } }, orderBy: { date: "asc" }, select: { date: true } });
    if (first && input.goLiveDate > first.date) throw new MoneyProblem(`Records start on ${formatDate(first.date)}, so go-live cannot be later than that.`, "goLiveDate");
  }
  const after = await tx.financeSetting.update({
    where: { schoolId: ctx.schoolId },
    data: { ...input, updatedById: ctx.userId },
  });
  const words = (s: typeof before) => ({
    yearStarts: MONTH_NAMES[s.fyStartMonth - 1], goLive: formatDate(s.goLiveDate), approvedAtOnceUpTo: formatRupees(s.expenseApproveUpTo),
    billPhotoAbove: formatRupees(s.billRequiredAbove), incomeReceiptPrefix: s.incomeReceiptPrefix, journalPrefix: s.journalPrefix,
  });
  await writeAudit(tx, ctx, { action: "updated", recordType: "Finance Settings", recordId: after.id, before: words(before), after: words(after) });
  return after;
}

export type HeadInput = { kind: "INCOME" | "EXPENSE"; name: string; code: string; group: string };

/** A new head in the chart of accounts. Income codes start with 4, expense codes with 5. */
export async function addHead(tx: Tx, ctx: SchoolContext, input: HeadInput) {
  const name = input.name.trim().replace(/\s+/g, " ");
  const code = input.code.trim();
  const group = input.group.trim();
  if (!["INCOME", "EXPENSE"].includes(input.kind)) throw new MoneyProblem("Choose Income or Expense.", "kind");
  if (name.length < 2) throw new MoneyProblem("Give the head a name.", "name");
  if (!/^\d{4}$/.test(code)) throw new MoneyProblem("Codes have 4 digits.", "code");
  const start = input.kind === "INCOME" ? "4" : "5";
  if (!code.startsWith(start)) throw new MoneyProblem(`${input.kind === "INCOME" ? "Income" : "Expense"} codes start with ${start}.`, "code");
  if (!group) throw new MoneyProblem("Choose the group.", "group");
  const sameName = await tx.accountHead.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (sameName) throw new MoneyProblem(`“${sameName.name}” already exists (${sameName.code}).`, "name");
  const sameCode = await tx.accountHead.findFirst({ where: { code } });
  if (sameCode) throw new MoneyProblem(`${code} is used by ${sameCode.name}.`, "code");
  const head = await tx.accountHead.create({ data: { schoolId: ctx.schoolId, kind: input.kind, name, code, groupName: group, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Account Head", recordId: head.id, after: { kind: head.kind, name, code, group } });
  return head;
}

/**
 * Shows or hides a head on the Record income and Record expense forms. A hidden
 * head is archived: its past records and reports stay. Heads the software posts
 * to (fees, salary, refunds) always stay.
 */
export async function setHeadShown(tx: Tx, ctx: SchoolContext, headId: string, shown: boolean) {
  const head = await tx.accountHead.findFirst({ where: { id: headId } });
  if (!head) throw new MoneyProblem("This head was not found.");
  if (head.systemKey && !shown) throw new MoneyProblem(`${head.name} is filled in by the software, so it always stays.`);
  if (Boolean(head.archivedAt) === !shown) return head;
  const after = await tx.accountHead.update({ where: { id: head.id }, data: { archivedAt: shown ? null : new Date() } });
  await writeAudit(tx, ctx, { action: shown ? "restored" : "archived", recordType: "Account Head", recordId: head.id, before: { shown: !head.archivedAt }, after: { shown } });
  return after;
}

export async function addCostCentre(tx: Tx, ctx: SchoolContext, rawName: string) {
  const name = rawName.trim().replace(/\s+/g, " ");
  if (name.length < 2) throw new MoneyProblem("Give the department a name, like “Science labs”.", "name");
  const same = await tx.costCentre.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (same && !same.archivedAt) throw new MoneyProblem(`“${same.name}” is already there.`, "name");
  const c = same
    ? await tx.costCentre.update({ where: { id: same.id }, data: { archivedAt: null } })
    : await tx.costCentre.create({ data: { schoolId: ctx.schoolId, name, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: same ? "restored" : "created", recordType: "Cost Centre", recordId: c.id, after: { name } });
  return c;
}

/** The Tally ledger name for each head, used by the Tally export. Blank uses the head's own name. */
export async function saveTallyLedgers(tx: Tx, ctx: SchoolContext, ledgers: { headId: string; ledger: string }[]) {
  let changed = 0;
  for (const l of ledgers) {
    const ledger = l.ledger.trim().slice(0, 80) || null;
    const head = await tx.accountHead.findFirst({ where: { id: l.headId } });
    if (!head || head.tallyLedger === ledger) continue;
    await tx.accountHead.update({ where: { id: head.id }, data: { tallyLedger: ledger } });
    await writeAudit(tx, ctx, { action: "updated", recordType: "Account Head", recordId: head.id, before: { tallyLedger: head.tallyLedger }, after: { tallyLedger: ledger } });
    changed++;
  }
  return changed;
}
