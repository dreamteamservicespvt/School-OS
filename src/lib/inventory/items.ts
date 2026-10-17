// Items (14 Items & Stock, Add item): the item code (SKU) is unique in the
// school and given in sequence unless typed; the name (with its size) is
// checked for duplicates; opening stock is set per store. Items are archived,
// never deleted, and only when no stock is left.
import "server-only";

import type { Item } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatRupees } from "../format";
import { nextNumber } from "../sequences";
import { InventoryProblem } from "./problem";
import { ITEM_CODE_KEY, formatCode, inventorySettings, mainLocation, peekNumber } from "./settings";
import { move, totalsFor } from "./stock";
import { BASE } from "./words";

export type ItemInput = {
  code: string | null;
  name: string;
  categoryId: string;
  unit: string;
  size: string | null;
  reorderLevel: number | null;
  pricePaise: bigint | null;
  tracksExpiry: boolean;
  note: string | null;
};

export type OpeningLine = { locationId: string | null; qty: number; batchNo?: string | null; expiresOn?: Date | null };

const CODE_RE = /^[A-Za-z0-9/-]{2,24}$/;
const label = (i: Pick<Item, "name" | "size">) => (i.size ? `${i.name}, size ${i.size}` : i.name);
export const itemLabel = label;

/** The next item code the software will give (without taking it). */
export async function nextCodePreview(tx: Tx, ctx: SchoolContext) {
  const s = await inventorySettings(tx, ctx);
  let n = await peekNumber(tx, ctx, ITEM_CODE_KEY);
  // Skip codes typed by hand that are already in use.
  for (let i = 0; i < 50; i++) {
    const code = formatCode(s.itemCodePrefix, s.itemCodeWidth, n);
    if (!(await tx.item.findFirst({ where: { code: { equals: code, mode: "insensitive" } }, select: { id: true } }))) return code;
    n++;
  }
  return formatCode(s.itemCodePrefix, s.itemCodeWidth, n);
}

async function takeCode(tx: Tx, ctx: SchoolContext) {
  const s = await inventorySettings(tx, ctx);
  for (let i = 0; i < 500; i++) {
    const code = formatCode(s.itemCodePrefix, s.itemCodeWidth, await nextNumber(tx, ctx, ITEM_CODE_KEY));
    if (!(await tx.item.findFirst({ where: { code: { equals: code, mode: "insensitive" } }, select: { id: true } }))) return code;
  }
  throw new InventoryProblem("No free item code was found. Type the code yourself.", "code");
}

async function checkItem(tx: Tx, ctx: SchoolContext, input: ItemInput, selfId?: string) {
  const s = await inventorySettings(tx, ctx);
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) throw new InventoryProblem("Item name is needed.", "name");
  if (name.length > 120) throw new InventoryProblem("Item name can be at most 120 characters.", "name");
  const size = input.size?.trim() || null;
  if (size && size.length > 20) throw new InventoryProblem("Size can be at most 20 characters.", "size");
  const cat = await tx.itemCategory.findFirst({ where: { id: input.categoryId, archivedAt: null } });
  if (!cat) throw new InventoryProblem("Choose the category.", "categoryId");
  const unit = input.unit.trim().toLowerCase();
  if (!unit) throw new InventoryProblem("Choose the unit.", "unit");
  if (!s.units.includes(unit)) throw new InventoryProblem("Choose a unit from the list. A School Admin adds units in Inventory Settings.", "unit");
  if (input.reorderLevel !== null && (!Number.isInteger(input.reorderLevel) || input.reorderLevel < 0 || input.reorderLevel > 100_000)) throw new InventoryProblem("Reorder level must be a whole number, 0 or more.", "reorderLevel");
  if (input.pricePaise !== null && input.pricePaise < BigInt(0)) throw new InventoryProblem("Price cannot be below ₹0.", "price");
  // The code is unique in the school: say whose it is (14 §5 "Item code reused").
  let code = input.code?.trim().toUpperCase() || null;
  if (code) {
    if (!CODE_RE.test(code)) throw new InventoryProblem("The item code can have 2 to 24 letters, digits, - or /.", "code");
    const taken = await tx.item.findFirst({ where: { code: { equals: code, mode: "insensitive" }, releasedAt: null, ...(selfId ? { id: { not: selfId } } : {}) } });
    if (taken) {
      const next = await nextCodePreview(tx, ctx);
      throw new InventoryProblem(`Code ${taken.code} belongs to ${label(taken)}${taken.archivedAt ? " (archived)" : ""}. Use the next code: ${next}.`, "code", { href: `${BASE}/items/${taken.id}`, label: "Open that item" });
    }
  } else if (!selfId) {
    code = await takeCode(tx, ctx);
  }
  // The same name and size twice is the same item (duplicate check).
  const dup = await tx.item.findFirst({ where: { name: { equals: name, mode: "insensitive" }, size: size ? { equals: size, mode: "insensitive" } : null, archivedAt: null, ...(selfId ? { id: { not: selfId } } : {}) } });
  if (dup) throw new InventoryProblem(`${label(dup)} is already an item (${dup.code}). Add stock to it instead.`, "name", { href: `${BASE}/items/${dup.id}`, label: "Open the item" });
  return { name, size, unit, code, cat };
}

/** Adds an item with its opening stock per store (0 or more lines). */
export async function addItem(tx: Tx, ctx: SchoolContext, input: ItemInput, opening: OpeningLine[], today: Date, importBatchId: string | null = null) {
  const c = await checkItem(tx, ctx, input);
  const item = await tx.item.create({
    data: {
      schoolId: ctx.schoolId, code: c.code!, name: c.name, categoryId: c.cat.id, unit: c.unit, size: c.size, reorderLevel: input.reorderLevel, pricePaise: input.pricePaise,
      tracksExpiry: input.tracksExpiry, note: input.note?.trim() || null, importBatchId, createdById: ctx.userId, updatedById: ctx.userId,
    },
  });
  const main = await mainLocation(tx, ctx);
  let openingTotal = 0;
  const seen = new Set<string>();
  for (const o of opening) {
    if (!o.qty) continue;
    if (!Number.isInteger(o.qty) || o.qty < 0) throw new InventoryProblem("Opening stock must be a whole number, 0 or more.", "openQty");
    const locationId = o.locationId ?? main.id;
    if (seen.has(locationId)) throw new InventoryProblem("The same store is on two opening stock lines. Put it on one line.", "openQty");
    seen.add(locationId);
    await move(tx, ctx, {
      itemId: item.id, locationId, kind: "OPENING", qty: o.qty, date: today, reason: "Opening stock", unitCostPaise: input.pricePaise,
      batch: input.tracksExpiry ? { batchNo: o.batchNo?.trim() || "OPENING", expiresOn: o.expiresOn ?? new Date(today.getTime() + 365 * 86_400_000) } : null, today,
    });
    openingTotal += o.qty;
  }
  await writeAudit(tx, ctx, { action: "created", recordType: "Item", recordId: item.id, after: { code: item.code, name: label(item), category: c.cat.name, unit: c.unit, reorder: input.reorderLevel, price: input.pricePaise !== null ? formatRupees(input.pricePaise) : null, opening: openingTotal } });
  return { item, openingTotal };
}

export async function updateItem(tx: Tx, ctx: SchoolContext, itemId: string, input: ItemInput) {
  const before = await tx.item.findFirst({ where: { id: itemId } });
  if (!before) throw new InventoryProblem("This item was not found.");
  if (before.archivedAt) throw new InventoryProblem("This item is archived. Bring it back first.");
  const c = await checkItem(tx, ctx, input, before.id);
  if (before.tracksExpiry !== input.tracksExpiry && ((await totalsFor(tx, [before.id])).get(before.id) ?? 0) > 0) {
    throw new InventoryProblem("Expiry tracking can be changed only while the item has no stock.", "tracksExpiry");
  }
  const after = await tx.item.update({
    where: { id: before.id },
    data: { code: c.code ?? before.code, name: c.name, categoryId: c.cat.id, unit: c.unit, size: c.size, reorderLevel: input.reorderLevel, pricePaise: input.pricePaise, tracksExpiry: input.tracksExpiry, note: input.note?.trim() || null, updatedById: ctx.userId, lowAlertAt: null },
  });
  await writeAudit(tx, ctx, {
    action: "updated", recordType: "Item", recordId: before.id,
    before: { code: before.code, name: label(before), unit: before.unit, reorder: before.reorderLevel, price: before.pricePaise !== null ? formatRupees(before.pricePaise) : null },
    after: { code: after.code, name: label(after), unit: after.unit, reorder: after.reorderLevel, price: after.pricePaise !== null ? formatRupees(after.pricePaise) : null },
  });
  return after;
}

/** Archives an item with no stock left (its movements stay). Its code is never given again. */
export async function archiveItem(tx: Tx, ctx: SchoolContext, itemId: string, reason: string) {
  if (reason.trim().length < 5) throw new InventoryProblem("Give a reason of at least 5 characters.", "reason");
  const item = await tx.item.findFirst({ where: { id: itemId, archivedAt: null } });
  if (!item) throw new InventoryProblem("This item was not found.");
  const total = (await totalsFor(tx, [item.id])).get(item.id) ?? 0;
  if (total > 0) throw new InventoryProblem(`${total} still in stock. Record the stock out (or as damaged or lost) first, then archive.`);
  const inSets = await tx.bookSetItem.count({ where: { itemId: item.id, set: { archivedAt: null } } });
  if (inSets) throw new InventoryProblem(`${item.name} is in ${inSets} book set${inSets === 1 ? "" : "s"}. Take it out of the set first.`);
  await tx.item.update({ where: { id: item.id }, data: { archivedAt: new Date(), updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Item", recordId: item.id, before: { code: item.code, name: item.name }, after: { reason: reason.trim() } });
}

export async function restoreItem(tx: Tx, ctx: SchoolContext, itemId: string) {
  const item = await tx.item.findFirst({ where: { id: itemId, archivedAt: { not: null } } });
  if (!item) throw new InventoryProblem("This item is not archived.");
  const dup = await tx.item.findFirst({ where: { name: { equals: item.name, mode: "insensitive" }, size: item.size, archivedAt: null } });
  if (dup) throw new InventoryProblem(`${label(dup)} is already an item (${dup.code}).`);
  await tx.item.update({ where: { id: item.id }, data: { archivedAt: null, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "restored", recordType: "Item", recordId: item.id, after: { code: item.code } });
}

/** An item by its code (a scanned barcode) or id. */
export async function itemByCode(tx: Tx, code: string) {
  const c = code.trim();
  if (!c) return null;
  return tx.item.findFirst({ where: { code: { equals: c, mode: "insensitive" }, archivedAt: null } });
}
