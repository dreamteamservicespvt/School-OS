// Finance Settings (07 §6): financial year start, chart of accounts, expense
// categories, approval amount, bill rule, cost centres and the optional pages.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { FINANCE_FEATURES, type FinanceFeature } from "./words";

/** The chart of accounts a new school starts with (inferred). Codes can be changed. */
export const DEFAULT_HEADS: { kind: "INCOME" | "EXPENSE"; code: string; name: string; group: string; systemKey?: string }[] = [
  { kind: "INCOME", code: "4001", name: "Fees", group: "Academic income", systemKey: "fees" },
  { kind: "INCOME", code: "4002", name: "Hall rent", group: "Other income" },
  { kind: "INCOME", code: "4003", name: "Donations", group: "Donations" },
  { kind: "INCOME", code: "4004", name: "Alumni donations", group: "Donations" },
  { kind: "INCOME", code: "4005", name: "Scrap sale", group: "Other income" },
  { kind: "INCOME", code: "4006", name: "Interest received", group: "Other income" },
  { kind: "INCOME", code: "4009", name: "Other income", group: "Other income" },
  { kind: "EXPENSE", code: "5001", name: "Salaries", group: "Staff costs", systemKey: "salary" },
  { kind: "EXPENSE", code: "5002", name: "Stationery", group: "Office expenses" },
  { kind: "EXPENSE", code: "5003", name: "Electricity", group: "Utilities" },
  { kind: "EXPENSE", code: "5004", name: "Water", group: "Utilities" },
  { kind: "EXPENSE", code: "5005", name: "Internet and phone", group: "Utilities" },
  { kind: "EXPENSE", code: "5006", name: "Repairs and maintenance", group: "Building" },
  { kind: "EXPENSE", code: "5007", name: "Transport fuel", group: "Transport" },
  { kind: "EXPENSE", code: "5008", name: "Vehicle repairs", group: "Transport" },
  { kind: "EXPENSE", code: "5009", name: "Events and functions", group: "Academic" },
  { kind: "EXPENSE", code: "5010", name: "Lab consumables", group: "Academic" },
  { kind: "EXPENSE", code: "5011", name: "Library books", group: "Academic" },
  { kind: "EXPENSE", code: "5012", name: "Housekeeping", group: "Building" },
  { kind: "EXPENSE", code: "5013", name: "Printing", group: "Office expenses" },
  { kind: "EXPENSE", code: "5014", name: "Fee refunds", group: "Refunds", systemKey: "refunds" },
  { kind: "EXPENSE", code: "5099", name: "Miscellaneous", group: "Office expenses" },
];

/** Makes the school's Finance Settings, chart of accounts and Cash in hand on first use. Safe to run twice. */
export async function ensureFinanceDefaults(tx: Tx, ctx: SchoolContext) {
  const s = await tx.financeSetting.findUnique({ where: { schoolId: ctx.schoolId } });
  if (!s) await tx.financeSetting.create({ data: { schoolId: ctx.schoolId } });
  if ((await tx.accountHead.count({ where: { schoolId: ctx.schoolId } })) === 0) {
    await tx.accountHead.createMany({
      data: DEFAULT_HEADS.map((h) => ({ schoolId: ctx.schoolId, kind: h.kind, code: h.code, name: h.name, groupName: h.group, systemKey: h.systemKey ?? null })),
      skipDuplicates: true,
    });
  }
  if (!(await tx.bankAccount.findFirst({ where: { schoolId: ctx.schoolId, kind: "CASH" } }))) {
    await tx.bankAccount.create({ data: { schoolId: ctx.schoolId, kind: "CASH", name: "Cash in hand" } });
  }
  if (!(await tx.bankAccount.findFirst({ where: { schoolId: ctx.schoolId, kind: "BANK" } }))) {
    await tx.bankAccount.create({ data: { schoolId: ctx.schoolId, kind: "BANK", name: "Main bank account", isMain: true } });
  }
}

export async function financeSettings(tx: Tx, ctx: SchoolContext) {
  await ensureFinanceDefaults(tx, ctx);
  return tx.financeSetting.findUniqueOrThrow({ where: { schoolId: ctx.schoolId } });
}

export async function financeFeaturesOn(tx: Tx, ctx: SchoolContext): Promise<Set<FinanceFeature>> {
  const rows = await tx.schoolFeature.findMany({ where: { schoolId: ctx.schoolId, isOn: true, featureKey: { in: FINANCE_FEATURES.map((f) => f.key) } } });
  return new Set(rows.map((r) => r.featureKey as FinanceFeature));
}

/** Switches one optional part on or off (School Feature record), audited. */
export async function setFeature(tx: Tx, ctx: SchoolContext, key: string, isOn: boolean) {
  const before = await tx.schoolFeature.findUnique({ where: { schoolId_featureKey: { schoolId: ctx.schoolId, featureKey: key } } });
  if ((before?.isOn ?? false) === isOn) return;
  await tx.schoolFeature.upsert({
    where: { schoolId_featureKey: { schoolId: ctx.schoolId, featureKey: key } },
    create: { schoolId: ctx.schoolId, featureKey: key, isOn },
    update: { isOn },
  });
  await writeAudit(tx, ctx, { action: isOn ? "switched-on" : "switched-off", recordType: "School Feature", recordId: null, before: { key, isOn: before?.isOn ?? false }, after: { key, isOn } });
}

/** Cash in hand: where cash received and paid is kept. */
export async function cashAccount(tx: Tx, ctx: SchoolContext) {
  await ensureFinanceDefaults(tx, ctx);
  return tx.bankAccount.findFirstOrThrow({ where: { schoolId: ctx.schoolId, kind: "CASH", archivedAt: null }, orderBy: { createdAt: "asc" } });
}

/** The main bank account: fees with no account chosen, and other money that is not cash. */
export async function mainBankAccount(tx: Tx, ctx: SchoolContext) {
  await ensureFinanceDefaults(tx, ctx);
  return (
    (await tx.bankAccount.findFirst({ where: { schoolId: ctx.schoolId, kind: "BANK", isMain: true, archivedAt: null } })) ??
    tx.bankAccount.findFirstOrThrow({ where: { schoolId: ctx.schoolId, kind: "BANK", archivedAt: null }, orderBy: { createdAt: "asc" } })
  );
}

/** The account money in this mode lands in: cash in hand for cash, otherwise the given or main bank account. */
export async function accountForMode(tx: Tx, ctx: SchoolContext, mode: string, bankAccountId?: string | null) {
  if (mode === "CASH") return (await cashAccount(tx, ctx)).id;
  if (bankAccountId) return bankAccountId;
  return (await mainBankAccount(tx, ctx)).id;
}

export async function systemHead(tx: Tx, ctx: SchoolContext, key: "fees" | "salary" | "refunds") {
  await ensureFinanceDefaults(tx, ctx);
  return tx.accountHead.findFirst({ where: { schoolId: ctx.schoolId, systemKey: key } });
}
