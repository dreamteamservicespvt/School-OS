// Inventory Settings (14 §6): item categories (with their reorder level and
// the expense head their bills go to), store locations, units, asset types,
// the asset tag, item code and purchase order formats, depreciation, the
// purchase approval limit, warranty reminder days and book sets. One row per
// school, made with the defaults (and the starting categories and stores) on
// first use.
import "server-only";

import type { InventorySetting } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatRupees } from "../format";
import { ensureFinanceDefaults } from "../finance/settings";
import { InventoryProblem } from "./problem";
import { DEFAULT_ASSET_TYPES, DEFAULT_CATEGORIES, DEFAULT_DEPRECIATION, DEFAULT_LOCATIONS, DEFAULT_UNITS } from "./words";

export type InvSettings = InventorySetting & { rates: Record<string, number> };

function readRates(raw: unknown, types: string[]): Record<string, number> {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(types.map((t) => [t, Number.isFinite(Number(o[t])) && o[t] !== null && o[t] !== "" ? Number(o[t]) : DEFAULT_DEPRECIATION[t] ?? 10]));
}

/** The school's Inventory Settings, made with the defaults, categories and stores the first time. */
export async function inventorySettings(tx: Tx, ctx: SchoolContext): Promise<InvSettings> {
  let s = await tx.inventorySetting.findUnique({ where: { schoolId: ctx.schoolId } });
  if (!s) {
    await ensureFinanceDefaults(tx, ctx);
    const heads = await tx.accountHead.findMany({ where: { kind: "EXPENSE", archivedAt: null }, select: { id: true, name: true } });
    const headOf = (name: string) => heads.find((h) => h.name.toLowerCase() === name.toLowerCase())?.id ?? null;
    s = await tx.inventorySetting.upsert({
      where: { schoolId: ctx.schoolId },
      create: { schoolId: ctx.schoolId, units: DEFAULT_UNITS, assetTypes: DEFAULT_ASSET_TYPES, depreciationRates: DEFAULT_DEPRECIATION, defaultExpenseHeadId: headOf("Stationery") ?? headOf("Miscellaneous") },
      update: {},
    });
    if ((await tx.itemCategory.count()) === 0) {
      await tx.itemCategory.createMany({
        data: DEFAULT_CATEGORIES.map((c, i) => ({ schoolId: ctx.schoolId, name: c.name, isLab: c.isLab ?? false, defaultReorderLevel: c.reorder, expenseHeadId: headOf(c.head), sortOrder: i + 1 })),
        skipDuplicates: true,
      });
    }
    if ((await tx.storeLocation.count()) === 0) {
      await tx.storeLocation.createMany({ data: DEFAULT_LOCATIONS.map((name, i) => ({ schoolId: ctx.schoolId, name, isMain: i === 0, sortOrder: i + 1 })), skipDuplicates: true });
    }
  }
  const types = s.assetTypes.length ? s.assetTypes : DEFAULT_ASSET_TYPES;
  return { ...s, units: s.units.length ? s.units : DEFAULT_UNITS, assetTypes: types, rates: readRates(s.depreciationRates, types) };
}

/** The main store: where new stock and issues go unless another is chosen. */
export async function mainLocation(tx: Tx, ctx: SchoolContext) {
  await inventorySettings(tx, ctx);
  const main = await tx.storeLocation.findFirst({ where: { isMain: true, archivedAt: null } });
  if (main) return main;
  const first = await tx.storeLocation.findFirst({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  if (first) return tx.storeLocation.update({ where: { id: first.id }, data: { isMain: true } });
  return tx.storeLocation.create({ data: { schoolId: ctx.schoolId, name: "Main store", isMain: true, sortOrder: 1 } });
}

export const ITEM_CODE_KEY = "inventory-item-code";
export const ASSET_TAG_KEY = "inventory-asset-tag";
export const formatCode = (prefix: string, width: number, n: number) => `${prefix}${String(n).padStart(width, "0")}`;

/** The next number a sequence will give (without taking it). */
export async function peekNumber(tx: Tx, ctx: SchoolContext, key: string) {
  const row = await tx.numberSequence.findUnique({ where: { schoolId_key: { schoolId: ctx.schoolId, key } } });
  return row?.nextValue ?? 1;
}

export type SettingsInput = {
  itemCodePrefix: string;
  itemCodeWidth: number;
  assetTagPrefix: string;
  assetTagWidth: number;
  poPrefix: string;
  approveUpToPaise: bigint;
  transfersNeedApproval: boolean;
  depreciationMethod: "SLM" | "WDV";
  rates: Record<string, number>;
  assetTypes: string[];
  units: string[];
  warrantyReminderDays: number;
  lowStockAlerts: boolean;
  bookSetsOn: boolean;
  setsWithMissing: boolean;
  defaultExpenseHeadId: string | null;
};

const between = (n: number, lo: number, hi: number, label: string, field: string) => {
  if (!Number.isInteger(n) || n < lo || n > hi) throw new InventoryProblem(`${label} must be a whole number from ${lo} to ${hi}.`, field);
};
const PREFIX = /^[A-Za-z0-9/-]{0,8}$/;

export async function saveSettings(tx: Tx, ctx: SchoolContext, input: SettingsInput) {
  const before = await inventorySettings(tx, ctx);
  if (!PREFIX.test(input.itemCodePrefix)) throw new InventoryProblem("The item code prefix can have up to 8 letters, digits, - or /.", "itemCodePrefix");
  if (!PREFIX.test(input.assetTagPrefix) || !input.assetTagPrefix) throw new InventoryProblem("The asset tag prefix needs 1 to 8 letters, digits, - or /.", "assetTagPrefix");
  if (!/^[A-Za-z0-9/-]{1,10}$/.test(input.poPrefix)) throw new InventoryProblem("The purchase order prefix needs 1 to 10 letters, digits, - or /.", "poPrefix");
  between(input.itemCodeWidth, 3, 8, "Digits in item codes", "itemCodeWidth");
  between(input.assetTagWidth, 3, 8, "Digits in asset tags", "assetTagWidth");
  between(input.warrantyReminderDays, 1, 180, "Reminder days", "warrantyReminderDays");
  if (input.approveUpToPaise < BigInt(0)) throw new InventoryProblem("The amount cannot be below ₹0.", "approveUpTo");
  const units = [...new Set(input.units.map((u) => u.trim().toLowerCase()).filter(Boolean))];
  if (units.length === 0) throw new InventoryProblem("Keep at least one unit.", "units");
  if (units.some((u) => u.length > 20)) throw new InventoryProblem("A unit can be at most 20 characters.", "units");
  const types = [...new Set(input.assetTypes.map((t) => t.trim()).filter(Boolean))];
  if (types.length === 0) throw new InventoryProblem("Keep at least one asset type.", "assetTypes");
  if (types.some((t) => t.length > 30)) throw new InventoryProblem("An asset type can be at most 30 characters.", "assetTypes");
  const rates: Record<string, number> = {};
  for (const t of types) {
    const r = input.rates[t] ?? DEFAULT_DEPRECIATION[t] ?? 10;
    if (!Number.isFinite(r) || r < 0 || r > 100) throw new InventoryProblem(`The rate for ${t} must be from 0 to 100 per cent.`, `rate-${t}`);
    rates[t] = Math.round(r * 100) / 100;
  }
  if (input.defaultExpenseHeadId && !(await tx.accountHead.findFirst({ where: { id: input.defaultExpenseHeadId, kind: "EXPENSE", archivedAt: null } }))) {
    throw new InventoryProblem("Choose an expense head from the list.", "defaultExpenseHeadId");
  }
  const after = await tx.inventorySetting.update({
    where: { schoolId: ctx.schoolId },
    data: {
      itemCodePrefix: input.itemCodePrefix.toUpperCase(), itemCodeWidth: input.itemCodeWidth, assetTagPrefix: input.assetTagPrefix.toUpperCase(), assetTagWidth: input.assetTagWidth,
      poPrefix: input.poPrefix.toUpperCase(), approveUpToPaise: input.approveUpToPaise, transfersNeedApproval: input.transfersNeedApproval, depreciationMethod: input.depreciationMethod,
      depreciationRates: rates, assetTypes: types, units, warrantyReminderDays: input.warrantyReminderDays, lowStockAlerts: input.lowStockAlerts, bookSetsOn: input.bookSetsOn,
      setsWithMissing: input.setsWithMissing, defaultExpenseHeadId: input.defaultExpenseHeadId, updatedById: ctx.userId,
    },
  });
  const show = (s: InventorySetting) => ({
    itemCode: `${s.itemCodePrefix} ${s.itemCodeWidth} digits`, assetTag: `${s.assetTagPrefix} ${s.assetTagWidth} digits`, po: s.poPrefix, approveUpTo: formatRupees(s.approveUpToPaise),
    transfersNeedApproval: s.transfersNeedApproval, depreciation: s.depreciationMethod, rates: s.depreciationRates, assetTypes: s.assetTypes, units: s.units,
    warrantyDays: s.warrantyReminderDays, lowStockAlerts: s.lowStockAlerts, bookSets: s.bookSetsOn, setsWithMissing: s.setsWithMissing,
  });
  await writeAudit(tx, ctx, { action: "updated", recordType: "Inventory Settings", recordId: ctx.schoolId, before: show(before), after: show(after) });
  return after;
}

/* ---------- Item categories ---------- */

export type CategoryInput = { id: string | null; name: string; isLab: boolean; defaultReorderLevel: number; expenseHeadId: string | null };

export async function saveCategory(tx: Tx, ctx: SchoolContext, input: CategoryInput) {
  await inventorySettings(tx, ctx);
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) throw new InventoryProblem("Give the category a name.", "name");
  if (name.length > 60) throw new InventoryProblem("The name can be at most 60 characters.", "name");
  between(input.defaultReorderLevel, 0, 100_000, "Reorder level", "defaultReorderLevel");
  if (input.expenseHeadId && !(await tx.accountHead.findFirst({ where: { id: input.expenseHeadId, kind: "EXPENSE", archivedAt: null } }))) throw new InventoryProblem("Choose an expense head from the list.", "expenseHeadId");
  const clash = await tx.itemCategory.findFirst({ where: { name: { equals: name, mode: "insensitive" }, archivedAt: null, ...(input.id ? { id: { not: input.id } } : {}) } });
  if (clash) throw new InventoryProblem(`There is already a category called ${clash.name}.`, "name");
  const data = { name, isLab: input.isLab, defaultReorderLevel: input.defaultReorderLevel, expenseHeadId: input.expenseHeadId };
  if (input.id) {
    const before = await tx.itemCategory.findFirst({ where: { id: input.id } });
    if (!before) throw new InventoryProblem("This category was not found.");
    const c = await tx.itemCategory.update({ where: { id: input.id }, data: { ...data, archivedAt: null } });
    await writeAudit(tx, ctx, { action: "updated", recordType: "Item Category", recordId: c.id, before: { name: before.name, isLab: before.isLab, reorder: before.defaultReorderLevel }, after: { name, isLab: input.isLab, reorder: input.defaultReorderLevel } });
    return c;
  }
  const archived = await tx.itemCategory.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  const sortOrder = (await tx.itemCategory.count()) + 1;
  const c = archived
    ? await tx.itemCategory.update({ where: { id: archived.id }, data: { ...data, archivedAt: null } })
    : await tx.itemCategory.create({ data: { schoolId: ctx.schoolId, ...data, sortOrder } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Item Category", recordId: c.id, after: { name, isLab: input.isLab, reorder: input.defaultReorderLevel } });
  return c;
}

/** Archives a category that no item uses (items keep their history). */
export async function archiveCategory(tx: Tx, ctx: SchoolContext, id: string) {
  const c = await tx.itemCategory.findFirst({ where: { id, archivedAt: null } });
  if (!c) throw new InventoryProblem("This category was not found.");
  const used = await tx.item.count({ where: { categoryId: id, archivedAt: null } });
  if (used) throw new InventoryProblem(`${used} item${used === 1 ? " is" : "s are"} in ${c.name}. Move ${used === 1 ? "it" : "them"} to another category first.`);
  await tx.itemCategory.update({ where: { id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Item Category", recordId: id, before: { name: c.name } });
}

/* ---------- Store locations ---------- */

export async function saveLocation(tx: Tx, ctx: SchoolContext, input: { id: string | null; name: string; isMain: boolean }) {
  await inventorySettings(tx, ctx);
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) throw new InventoryProblem("Give the store a name.", "name");
  if (name.length > 60) throw new InventoryProblem("The name can be at most 60 characters.", "name");
  const clash = await tx.storeLocation.findFirst({ where: { name: { equals: name, mode: "insensitive" }, archivedAt: null, ...(input.id ? { id: { not: input.id } } : {}) } });
  if (clash) throw new InventoryProblem(`There is already a store called ${clash.name}.`, "name");
  if (input.isMain) await tx.storeLocation.updateMany({ where: { isMain: true, ...(input.id ? { id: { not: input.id } } : {}) }, data: { isMain: false } });
  if (input.id) {
    const before = await tx.storeLocation.findFirst({ where: { id: input.id } });
    if (!before) throw new InventoryProblem("This store was not found.");
    if (before.isMain && !input.isMain) throw new InventoryProblem("Every school has one main store. Make another store the main store instead.", "isMain");
    const l = await tx.storeLocation.update({ where: { id: input.id }, data: { name, isMain: input.isMain, archivedAt: null } });
    await writeAudit(tx, ctx, { action: "updated", recordType: "Store Location", recordId: l.id, before: { name: before.name, isMain: before.isMain }, after: { name, isMain: input.isMain } });
    return l;
  }
  const sortOrder = (await tx.storeLocation.count()) + 1;
  const archived = await tx.storeLocation.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  const l = archived
    ? await tx.storeLocation.update({ where: { id: archived.id }, data: { name, isMain: input.isMain, archivedAt: null } })
    : await tx.storeLocation.create({ data: { schoolId: ctx.schoolId, name, isMain: input.isMain, sortOrder } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Store Location", recordId: l.id, after: { name, isMain: input.isMain } });
  return l;
}

/** Archives an empty store that is not the main store. */
export async function archiveLocation(tx: Tx, ctx: SchoolContext, id: string) {
  const l = await tx.storeLocation.findFirst({ where: { id, archivedAt: null } });
  if (!l) throw new InventoryProblem("This store was not found.");
  if (l.isMain) throw new InventoryProblem("The main store cannot be archived. Make another store the main store first.");
  const held = await tx.stockBalance.aggregate({ where: { locationId: id, qty: { gt: 0 } }, _sum: { qty: true }, _count: { _all: true } });
  if (held._count._all) throw new InventoryProblem(`${l.name} still holds stock of ${held._count._all} item${held._count._all === 1 ? "" : "s"}. Transfer it to another store first.`);
  await tx.storeLocation.update({ where: { id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Store Location", recordId: id, before: { name: l.name } });
}
