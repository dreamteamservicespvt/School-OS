// Stock in hand (14 Items & Stock): every change is one Stock Movement, and
// Stock Balance keeps the sum per item and store in step in the same
// transaction. No movement may take stock below zero: the balance is changed
// by one guarded UPDATE, so two people issuing the last notebooks at the same
// moment cannot both succeed. Items with expiry tracking keep their stock by
// batch: issues take the earliest expiry first and an expired batch is never
// issued. Low stock (A15) tells the store keeper once, until it is restocked.
import "server-only";

import type { Item, StockMoveKind, StockMovement } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { formatDate } from "../format";
import { nextNumber, formatNumber } from "../sequences";
import { requestApproval } from "../approvals";
import { InventoryProblem } from "./problem";
import { inventorySettings } from "./settings";
import { BASE, MOVE_KIND, qtyWords, stockState, type MoveKind } from "./words";

export type MoveInput = {
  itemId: string;
  locationId: string;
  kind: StockMoveKind;
  /** Signed: positive in, negative out. */
  qty: number;
  date: Date;
  reference?: string | null;
  reason?: string | null;
  unitCostPaise?: bigint | null;
  issueId?: string | null;
  receiptId?: string | null;
  auditId?: string | null;
  transferId?: string | null;
  /** Stock in of an expiry-tracked item: its batch. */
  batch?: { batchNo: string; expiresOn: Date } | null;
  /** Stock out of a chosen batch (recording expired stock). */
  batchId?: string | null;
  /** Today in the school, for the expiry check. */
  today?: Date;
};

const IN_KINDS: StockMoveKind[] = ["OPENING", "IN", "RECEIVED", "RETURN", "TRANSFER_IN"];
const day = (d: Date) => formatDate(d, "UTC");

/** The effective reorder level: the item's own, else its category's. */
export const reorderOf = (item: { reorderLevel: number | null }, category: { defaultReorderLevel: number } | null | undefined) => item.reorderLevel ?? category?.defaultReorderLevel ?? 0;

/** The shortage in plain words: "Only 12 pieces of A4 notebook in Main store." */
async function shortage(tx: Tx, item: Pick<Item, "name" | "unit">, locationId: string, have: number) {
  const loc = await tx.storeLocation.findFirst({ where: { id: locationId }, select: { name: true } });
  const where = loc?.name ?? "this store";
  return have <= 0
    ? `${item.name} is out of stock in ${where}. Transfer from another store, or record the missing stock in.`
    : `Only ${qtyWords(have, item.unit)} of ${item.name} in ${where}. Transfer from another store, or issue fewer.`;
}

/** Why a line cannot go out, in plain words: an expired batch, or the stock there is. */
export async function notEnough(tx: Tx, item: Pick<Item, "id" | "name" | "unit" | "tracksExpiry">, locationId: string, have: number, today: Date) {
  if (item.tracksExpiry) {
    const expired = await tx.stockBatch.findFirst({ where: { itemId: item.id, locationId, qty: { gt: 0 }, expiresOn: { lt: today } }, orderBy: { expiresOn: "asc" } });
    if (expired) return `Batch ${expired.batchNo} of ${item.name} expired on ${day(expired.expiresOn)}. Expired stock cannot be issued: record it as expired.${have ? ` ${qtyWords(have, item.unit)} in date.` : ""}`;
  }
  return shortage(tx, item, locationId, have);
}

/** Stock in hand of one item at one store. */
export async function balanceOf(tx: Tx, itemId: string, locationId: string) {
  const b = await tx.stockBalance.findUnique({ where: { itemId_locationId: { itemId, locationId } } });
  return b?.qty ?? 0;
}

/** Batches of an expiry-tracked item that can be issued (not expired), earliest expiry first. */
export async function usableBatches(tx: Tx, itemId: string, locationId: string, today: Date) {
  return tx.stockBatch.findMany({ where: { itemId, locationId, qty: { gt: 0 }, expiresOn: { gte: today } }, orderBy: [{ expiresOn: "asc" }, { batchNo: "asc" }] });
}

/**
 * Posts one movement (or one per batch for an expiry-tracked item going out)
 * and keeps Stock Balance in step. Refuses anything that would take stock
 * below zero, and an expired batch going anywhere but "Expired".
 */
export async function move(tx: Tx, ctx: SchoolContext, m: MoveInput): Promise<StockMovement[]> {
  if (!Number.isInteger(m.qty) || m.qty === 0) throw new InventoryProblem("The quantity must be a whole number other than 0.", "qty");
  const item = await tx.item.findFirst({ where: { id: m.itemId } });
  if (!item) throw new InventoryProblem("This item was not found.", "itemId");
  const loc = await tx.storeLocation.findFirst({ where: { id: m.locationId } });
  if (!loc) throw new InventoryProblem("Choose the store.", "locationId");
  if (m.qty > 0 && !IN_KINDS.includes(m.kind) && m.kind !== "AUDIT") throw new InventoryProblem("This kind of movement takes stock out.");
  if (m.qty < 0 && IN_KINDS.includes(m.kind)) throw new InventoryProblem("This kind of movement brings stock in.");

  // Expiry-tracked items: work out which batches the movement touches.
  type Part = { qty: number; batchId: string | null };
  let parts: Part[] = [{ qty: m.qty, batchId: null }];
  if (item.tracksExpiry) {
    const today = m.today ?? new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
    if (m.qty > 0) {
      if (m.batchId) {
        // A return or audit to a known batch.
        const b = await tx.stockBatch.findFirst({ where: { id: m.batchId, itemId: item.id, locationId: loc.id } });
        if (!b) throw new InventoryProblem("This batch was not found.", "batch");
        await tx.stockBatch.update({ where: { id: b.id }, data: { qty: { increment: m.qty } } });
        parts = [{ qty: m.qty, batchId: b.id }];
      } else {
        let batch = m.batch?.batchNo?.trim() && m.batch?.expiresOn ? { batchNo: m.batch.batchNo.trim(), expiresOn: m.batch.expiresOn } : null;
        if (!batch && (m.kind === "AUDIT" || m.kind === "RETURN")) {
          // A count or a return with no batch named goes to the batch kept longest (here, else anywhere).
          const known = (await tx.stockBatch.findFirst({ where: { itemId: item.id, locationId: loc.id }, orderBy: { expiresOn: "desc" } })) ?? (await tx.stockBatch.findFirst({ where: { itemId: item.id }, orderBy: { expiresOn: "desc" } }));
          batch = known ? { batchNo: known.batchNo, expiresOn: known.expiresOn } : { batchNo: `COUNT-${today.toISOString().slice(0, 10)}`, expiresOn: new Date(today.getTime() + 365 * 86_400_000) };
        }
        if (!batch) throw new InventoryProblem(`${item.name} keeps expiry dates. Enter the batch number and the expiry date.`, "batchNo");
        const batchNo = batch.batchNo;
        const b = await tx.stockBatch.upsert({
          where: { schoolId_itemId_locationId_batchNo: { schoolId: ctx.schoolId, itemId: item.id, locationId: loc.id, batchNo } },
          create: { schoolId: ctx.schoolId, itemId: item.id, locationId: loc.id, batchNo, expiresOn: batch.expiresOn, qty: m.qty },
          update: { qty: { increment: m.qty } },
        });
        parts = [{ qty: m.qty, batchId: b.id }];
      }
    } else {
      const need = -m.qty;
      if (m.batchId) {
        const b = await tx.stockBatch.findFirst({ where: { id: m.batchId, itemId: item.id, locationId: loc.id } });
        if (!b) throw new InventoryProblem("Choose the batch.", "batchId");
        if (b.expiresOn < today && m.kind !== "EXPIRED" && m.kind !== "AUDIT" && m.kind !== "TRANSFER_OUT") throw new InventoryProblem(`Batch ${b.batchNo} expired on ${day(b.expiresOn)}. Record it as expired.`, "batchId");
        const taken = await tx.stockBatch.updateMany({ where: { id: b.id, qty: { gte: need } }, data: { qty: { decrement: need } } });
        if (taken.count === 0) throw new InventoryProblem(`Only ${qtyWords(b.qty, item.unit)} left in batch ${b.batchNo}.`, "qty");
        parts = [{ qty: m.qty, batchId: b.id }];
      } else if (m.kind === "EXPIRED") {
        throw new InventoryProblem("Choose the batch that expired.", "batchId");
      } else if (m.kind === "AUDIT" || m.kind === "LOST" || m.kind === "DAMAGED") {
        // Counted short, lost or damaged: taken from the oldest batches, expired ones first.
        const all = await tx.stockBatch.findMany({ where: { itemId: item.id, locationId: loc.id, qty: { gt: 0 } }, orderBy: [{ expiresOn: "asc" }, { batchNo: "asc" }] });
        const have = all.reduce((a, b) => a + b.qty, 0);
        if (have < need) throw new InventoryProblem(await shortage(tx, item, loc.id, have), "qty");
        parts = [];
        let left = need;
        for (const b of all) {
          if (left <= 0) break;
          const take = Math.min(b.qty, left);
          const ok = await tx.stockBatch.updateMany({ where: { id: b.id, qty: { gte: take } }, data: { qty: { decrement: take } } });
          if (ok.count === 0) throw new InventoryProblem("Someone else took this stock a moment ago. Refresh and try again.", "qty");
          parts.push({ qty: -take, batchId: b.id });
          left -= take;
        }
      } else {
        const usable = await usableBatches(tx, item.id, loc.id, today);
        const have = usable.reduce((a, b) => a + b.qty, 0);
        if (have < need) {
          const expired = await tx.stockBatch.findFirst({ where: { itemId: item.id, locationId: loc.id, qty: { gt: 0 }, expiresOn: { lt: today } }, orderBy: { expiresOn: "asc" } });
          if (expired) throw new InventoryProblem(`Batch ${expired.batchNo} expired on ${day(expired.expiresOn)}. Expired stock cannot be issued: record it as expired.${have ? ` ${qtyWords(have, item.unit)} in date.` : ""}`, "qty");
          throw new InventoryProblem(await shortage(tx, item, loc.id, have), "qty");
        }
        parts = [];
        let left = need;
        for (const b of usable) {
          if (left <= 0) break;
          const take = Math.min(b.qty, left);
          const ok = await tx.stockBatch.updateMany({ where: { id: b.id, qty: { gte: take } }, data: { qty: { decrement: take } } });
          if (ok.count === 0) throw new InventoryProblem("Someone else took this stock a moment ago. Refresh and try again.", "qty");
          parts.push({ qty: -take, batchId: b.id });
          left -= take;
        }
      }
    }
  }

  const made: StockMovement[] = [];
  for (const part of parts) {
    if (part.qty < 0) {
      const ok = await tx.stockBalance.updateMany({ where: { itemId: item.id, locationId: loc.id, qty: { gte: -part.qty } }, data: { qty: { increment: part.qty } } });
      if (ok.count === 0) throw new InventoryProblem(await shortage(tx, item, loc.id, await balanceOf(tx, item.id, loc.id)), "qty");
    } else {
      await tx.stockBalance.upsert({
        where: { itemId_locationId: { itemId: item.id, locationId: loc.id } },
        create: { schoolId: ctx.schoolId, itemId: item.id, locationId: loc.id, qty: part.qty },
        update: { qty: { increment: part.qty } },
      });
    }
    const after = await balanceOf(tx, item.id, loc.id);
    made.push(await tx.stockMovement.create({
      data: {
        schoolId: ctx.schoolId, itemId: item.id, locationId: loc.id, kind: m.kind, qty: part.qty, date: m.date, balanceAfter: after, batchId: part.batchId,
        unitCostPaise: m.unitCostPaise ?? null, reference: m.reference?.slice(0, 200) ?? null, reason: m.reason?.slice(0, 300) ?? null,
        issueId: m.issueId ?? null, receiptId: m.receiptId ?? null, auditId: m.auditId ?? null, transferId: m.transferId ?? null, createdById: ctx.userId,
      },
    }));
  }
  if (m.qty > 0) await clearLowAlert(tx, item);
  else await lowStockCheck(tx, ctx, item.id);
  return made;
}

/** Total stock of each item across every store. */
export async function totalsFor(tx: Tx, itemIds?: string[]) {
  const rows = await tx.stockBalance.groupBy({ by: ["itemId"], where: itemIds ? { itemId: { in: itemIds } } : {}, _sum: { qty: true } });
  return new Map(rows.map((r) => [r.itemId, r._sum.qty ?? 0]));
}

/** Stock by store for each item: itemId → (locationId → qty). */
export async function balancesFor(tx: Tx, itemIds: string[]) {
  const rows = itemIds.length ? await tx.stockBalance.findMany({ where: { itemId: { in: itemIds } } }) : [];
  const out = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (!out.has(r.itemId)) out.set(r.itemId, new Map());
    out.get(r.itemId)!.set(r.locationId, r.qty);
  }
  return out;
}

async function clearLowAlert(tx: Tx, item: Pick<Item, "id" | "lowAlertAt" | "reorderLevel" | "categoryId">) {
  if (!item.lowAlertAt) return;
  const cat = await tx.itemCategory.findFirst({ where: { id: item.categoryId } });
  const total = (await totalsFor(tx, [item.id])).get(item.id) ?? 0;
  if (stockState(total, reorderOf(item, cat)) === "OK") await tx.item.update({ where: { id: item.id }, data: { lowAlertAt: null } });
}

/** The people who keep the store (Store Keeper role), or the School Admin when there is none. */
export async function storeKeepers(tx: Tx, ctx: SchoolContext) {
  const of = async (key: string) => (await tx.schoolAccess.findMany({
    where: { schoolId: ctx.schoolId, archivedAt: null, userLogin: { status: "ACTIVE" }, roles: { some: { role: { key, isEnabled: true, archivedAt: null } } } },
    select: { userLoginId: true },
  })).map((r) => r.userLoginId);
  const keepers = await of("store-keeper");
  return [...new Set(keepers.length ? keepers : await of("school-admin"))];
}

/**
 * A15 low stock: when an item's stock (all stores) reaches its reorder level,
 * the store keeper is told once, with a link that raises a purchase request
 * for it. Told again only after it was restocked above the level.
 */
export async function lowStockCheck(tx: Tx, ctx: SchoolContext, itemId: string) {
  const item = await tx.item.findFirst({ where: { id: itemId, archivedAt: null }, include: { category: true } });
  if (!item || item.lowAlertAt) return false;
  const reorder = reorderOf(item, item.category);
  if (reorder <= 0) return false;
  const total = (await totalsFor(tx, [item.id])).get(item.id) ?? 0;
  if (stockState(total, reorder) === "OK") return false;
  const s = await inventorySettings(tx, ctx);
  await tx.item.update({ where: { id: item.id }, data: { lowAlertAt: new Date() } });
  if (!s.lowStockAlerts) return true;
  const text = total <= 0 ? `${item.name} is out of stock (reorder at ${reorder}). Raise a purchase request.` : `${item.name} is low: ${qtyWords(total, item.unit)} left (reorder at ${reorder}). Raise a purchase request.`;
  // An automation (A15), so it reaches the store keeper even when their own issue caused it.
  const system = { schoolId: ctx.schoolId, userId: null };
  for (const to of await storeKeepers(tx, ctx)) {
    await notify(tx, system, { to, type: "low-stock", text, link: `${BASE}/purchases?tab=requests&new=1&item=${item.id}`, groupKey: "inventory-low-stock", mergedText: (n) => `${n} items are at or below their reorder level. Raise a purchase request.` });
  }
  return true;
}

/* ---------- Stock in, stock out, write-offs ---------- */

export type InInput = { itemId: string; locationId: string; qty: number; date: Date; source: string; unitCostPaise: bigint | null; batchNo: string | null; expiresOn: Date | null; today: Date };

/** Stock in outside a purchase order (a donation, stock found). */
export async function stockIn(tx: Tx, ctx: SchoolContext, input: InInput) {
  if (input.qty < 1) throw new InventoryProblem("The quantity must be at least 1.", "qty");
  if (input.source.trim().length < 3) throw new InventoryProblem("Say where the stock came from, for example “Donated by the PTA”.", "source");
  const [mv] = await move(tx, ctx, {
    itemId: input.itemId, locationId: input.locationId, kind: "IN", qty: input.qty, date: input.date, reason: input.source.trim(), unitCostPaise: input.unitCostPaise,
    batch: input.batchNo && input.expiresOn ? { batchNo: input.batchNo, expiresOn: input.expiresOn } : null, today: input.today,
  });
  await writeAudit(tx, ctx, { action: "stock-in", recordType: "Stock Movement", recordId: mv.id, after: { item: input.itemId, qty: input.qty, source: input.source } });
  return mv;
}

export type OutInput = { itemId: string; locationId: string; qty: number; date: Date; kind: "OUT" | "DAMAGED" | "LOST" | "EXPIRED"; reason: string; batchId: string | null; today: Date };

/** Stock out (used up), or damaged, lost or expired stock written off with a reason. */
export async function stockOut(tx: Tx, ctx: SchoolContext, input: OutInput) {
  if (input.qty < 1) throw new InventoryProblem("The quantity must be at least 1.", "qty");
  if (input.reason.trim().length < (input.kind === "OUT" ? 3 : 5)) throw new InventoryProblem(input.kind === "OUT" ? "Say what it was used for." : "Give the reason, in at least 5 characters.", "reason");
  const made = await move(tx, ctx, { itemId: input.itemId, locationId: input.locationId, kind: input.kind, qty: -input.qty, date: input.date, reason: input.reason.trim(), batchId: input.batchId, today: input.today });
  await writeAudit(tx, ctx, { action: input.kind === "OUT" ? "stock-out" : `written-off-${input.kind.toLowerCase()}`, recordType: "Stock Movement", recordId: made[0].id, after: { item: input.itemId, qty: input.qty, kind: MOVE_KIND[input.kind as MoveKind].label, reason: input.reason } });
  return made;
}

/* ---------- Transfers between stores ---------- */

export type TransferLine = { itemId: string; qty: number };

async function postTransfer(tx: Tx, ctx: SchoolContext, t: { id: string; number: string; date: Date; fromLocationId: string; toLocationId: string; lines: TransferLine[] }, today: Date) {
  const [from, to] = await Promise.all([tx.storeLocation.findFirst({ where: { id: t.fromLocationId } }), tx.storeLocation.findFirst({ where: { id: t.toLocationId } })]);
  for (const l of t.lines) {
    const item = await tx.item.findFirstOrThrow({ where: { id: l.itemId } });
    const outs = await move(tx, ctx, { itemId: l.itemId, locationId: t.fromLocationId, kind: "TRANSFER_OUT", qty: -l.qty, date: t.date, reference: `${t.number} to ${to?.name ?? "another store"}`, transferId: t.id, today });
    // Expiry-tracked stock keeps its batches at the new store.
    for (const o of outs) {
      const batch = o.batchId ? await tx.stockBatch.findFirst({ where: { id: o.batchId } }) : null;
      await move(tx, ctx, {
        itemId: l.itemId, locationId: t.toLocationId, kind: "TRANSFER_IN", qty: -o.qty, date: t.date, reference: `${t.number} from ${from?.name ?? "another store"}`, transferId: t.id, today,
        batch: item.tracksExpiry && batch ? { batchNo: batch.batchNo, expiresOn: batch.expiresOn } : null,
      });
    }
  }
}

/**
 * Moves stock between two stores. When Inventory Settings say transfers need
 * approval, it waits in Approvals and moves only when approved (stock is
 * checked again then).
 */
export async function transferStock(tx: Tx, ctx: SchoolContext, input: { fromLocationId: string; toLocationId: string; lines: TransferLine[]; date: Date; note: string | null; today: Date }) {
  if (input.fromLocationId === input.toLocationId) throw new InventoryProblem("Choose two different stores.", "toLocationId");
  const [from, to] = await Promise.all([tx.storeLocation.findFirst({ where: { id: input.fromLocationId, archivedAt: null } }), tx.storeLocation.findFirst({ where: { id: input.toLocationId, archivedAt: null } })]);
  if (!from) throw new InventoryProblem("Choose the store the stock leaves.", "fromLocationId");
  if (!to) throw new InventoryProblem("Choose the store the stock goes to.", "toLocationId");
  if (!input.lines.length) throw new InventoryProblem("Add at least one item.", "lines");
  for (const l of input.lines) {
    const item = await tx.item.findFirst({ where: { id: l.itemId, archivedAt: null } });
    if (!item) throw new InventoryProblem("Choose the items from the list.", "lines");
    const have = await balanceOf(tx, l.itemId, from.id);
    if (have < l.qty) throw new InventoryProblem(await shortage(tx, item, from.id, have), "lines");
  }
  const s = await inventorySettings(tx, ctx);
  const n = await nextNumber(tx, ctx, "inventory-transfer");
  const t = await tx.stockTransfer.create({
    data: { schoolId: ctx.schoolId, number: formatNumber("TR-", n, 4), date: input.date, fromLocationId: from.id, toLocationId: to.id, lines: input.lines, note: input.note, status: s.transfersNeedApproval ? "WAITING" : "APPROVED", createdById: ctx.userId },
  });
  await writeAudit(tx, ctx, { action: "created", recordType: "Stock Transfer", recordId: t.id, after: { number: t.number, from: from.name, to: to.name, lines: input.lines.length, waiting: s.transfersNeedApproval } });
  if (s.transfersNeedApproval) {
    const names = await tx.item.findMany({ where: { id: { in: input.lines.map((l) => l.itemId) } }, select: { id: true, name: true } });
    const approval = await requestApproval(tx, ctx, {
      type: "stock-transfer", recordType: "Stock Transfer", recordId: t.id,
      summary: `Stock transfer ${t.number}: ${input.lines.map((l) => `${l.qty} × ${names.find((x) => x.id === l.itemId)?.name ?? "item"}`).slice(0, 3).join(", ")}${input.lines.length > 3 ? ` and ${input.lines.length - 3} more` : ""} from ${from.name} to ${to.name}`,
      reason: input.note,
    });
    await tx.stockTransfer.update({ where: { id: t.id }, data: { approvalId: approval.id } });
    return { transfer: t, waiting: true };
  }
  await postTransfer(tx, ctx, { ...t, lines: input.lines }, input.today);
  return { transfer: t, waiting: false };
}

/** Approvals decided a transfer: approved, the stock moves now (if it is still there); otherwise nothing moves. */
export async function decideTransfer(tx: Tx, ctx: SchoolContext, transferId: string, decision: string, note: string | null, today: Date) {
  const t = await tx.stockTransfer.findFirst({ where: { id: transferId } });
  if (!t || t.status !== "WAITING") return;
  if (decision === "approve") {
    await postTransfer(tx, ctx, { ...t, lines: t.lines as TransferLine[] }, today);
    await tx.stockTransfer.update({ where: { id: t.id }, data: { status: "APPROVED", decisionNote: note } });
  } else {
    await tx.stockTransfer.update({ where: { id: t.id }, data: { status: decision === "withdraw" ? "CANCELLED" : "REJECTED", decisionNote: note } });
  }
  await writeAudit(tx, ctx, { action: `transfer-${decision}`, recordType: "Stock Transfer", recordId: t.id, before: { status: "WAITING" }, after: { decision, note } });
}

/* ---------- Low stock list ---------- */

/** Items at or below their reorder level (all stores together), lowest first. */
export async function lowStockItems(tx: Tx, take = 200) {
  const items = await tx.item.findMany({ where: { archivedAt: null }, include: { category: true } });
  const totals = await totalsFor(tx);
  return items
    .map((i) => ({ item: i, total: totals.get(i.id) ?? 0, reorder: reorderOf(i, i.category) }))
    .filter((x) => x.reorder > 0 && stockState(x.total, x.reorder) !== "OK")
    .sort((a, b) => a.total - a.reorder - (b.total - b.reorder) || a.item.name.localeCompare(b.item.name))
    .slice(0, take);
}

/** Batches that have expired and still hold stock, or expire within the days given. */
export async function expiringBatches(tx: Tx, today: Date, days = 30) {
  const until = new Date(today.getTime() + days * 86_400_000);
  return tx.stockBatch.findMany({ where: { qty: { gt: 0 }, expiresOn: { lte: until } }, orderBy: { expiresOn: "asc" }, take: 200 });
}
