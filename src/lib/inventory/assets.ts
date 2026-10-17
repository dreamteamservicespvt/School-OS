// Assets (14 Assets): the register with tags, where each asset is (a room,
// a department or a person, with the history kept), repairs, depreciation,
// disposal with approval (disposed assets stay in the register), physical
// asset audits by scanning tags room by room, and links to stock items.
import "server-only";

import type { Asset } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate, formatRupees } from "../format";
import { nextNumber } from "../sequences";
import { requestApproval } from "../approvals";
import { ensureFinanceDefaults } from "../finance/settings";
import { recordExpense } from "../finance/expenses";
import { recordIncome } from "../finance/income";
import { InventoryProblem } from "./problem";
import { ASSET_TAG_KEY, formatCode, inventorySettings, peekNumber, type InvSettings } from "./settings";
import { BASE, CONDITIONS, DISPOSAL_METHOD } from "./words";

const ZERO = BigInt(0);
const day = (d: Date) => formatDate(d, "UTC");

export type Place = { roomId: string | null; departmentId: string | null; staffId: string | null };

/** Where an asset is, in words: "Room 12", "Science department", "Ravi Kumar". */
export async function placeWords(tx: Tx, p: Place) {
  if (p.roomId) return (await tx.room.findFirst({ where: { id: p.roomId }, select: { name: true } }))?.name ?? "A room";
  if (p.departmentId) return (await tx.department.findFirst({ where: { id: p.departmentId }, select: { name: true } }))?.name ?? "A department";
  if (p.staffId) return (await tx.staff.findFirst({ where: { id: p.staffId }, select: { fullName: true } }))?.fullName ?? "A staff member";
  return "Not placed";
}

/** Names for many places at once (lists). */
export async function placeNames(tx: Tx, rows: Place[]) {
  const [rooms, deps, staff] = await Promise.all([
    tx.room.findMany({ where: { id: { in: rows.map((r) => r.roomId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } }),
    tx.department.findMany({ where: { id: { in: rows.map((r) => r.departmentId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } }),
    tx.staff.findMany({ where: { id: { in: rows.map((r) => r.staffId).filter((x): x is string => Boolean(x)) } }, select: { id: true, fullName: true } }),
  ]);
  const n = new Map<string, string>([...rooms.map((r) => [r.id, r.name] as const), ...deps.map((d) => [d.id, d.name] as const), ...staff.map((s) => [s.id, s.fullName] as const)]);
  return (p: Place) => (p.roomId ? n.get(p.roomId) : p.departmentId ? n.get(p.departmentId) : p.staffId ? n.get(p.staffId) : null) ?? "Not placed";
}

async function checkPlace(tx: Tx, p: Place) {
  const set = [p.roomId, p.departmentId, p.staffId].filter(Boolean).length;
  if (set !== 1) throw new InventoryProblem("Choose one place: a room, a department or a person.", "place");
  if (p.roomId && !(await tx.room.findFirst({ where: { id: p.roomId, archivedAt: null } }))) throw new InventoryProblem("Choose the room from the list.", "place");
  if (p.departmentId && !(await tx.department.findFirst({ where: { id: p.departmentId, archivedAt: null } }))) throw new InventoryProblem("Choose the department from the list.", "place");
  if (p.staffId && !(await tx.staff.findFirst({ where: { id: p.staffId, archivedAt: null } }))) throw new InventoryProblem("Choose the staff member from the list.", "place");
}

/** The next tag the software will give (without taking it). */
export async function nextTagPreview(tx: Tx, ctx: SchoolContext) {
  const s = await inventorySettings(tx, ctx);
  let n = await peekNumber(tx, ctx, ASSET_TAG_KEY);
  for (let i = 0; i < 50; i++) {
    const tag = formatCode(s.assetTagPrefix, s.assetTagWidth, n);
    if (!(await tx.asset.findFirst({ where: { tag: { equals: tag, mode: "insensitive" } }, select: { id: true } }))) return tag;
    n++;
  }
  return formatCode(s.assetTagPrefix, s.assetTagWidth, n);
}

async function takeTag(tx: Tx, ctx: SchoolContext, s: InvSettings) {
  for (let i = 0; i < 500; i++) {
    const tag = formatCode(s.assetTagPrefix, s.assetTagWidth, await nextNumber(tx, ctx, ASSET_TAG_KEY));
    if (!(await tx.asset.findFirst({ where: { tag: { equals: tag, mode: "insensitive" } }, select: { id: true } }))) return tag;
  }
  throw new InventoryProblem("No free asset tag was found. Type the tag yourself.", "tag");
}

/** 14 §5 "Asset tag reused": "Tag AT-0042 belongs to Projector, Room 12". */
async function tagTaken(tx: Tx, ctx: SchoolContext, tag: string, selfId?: string) {
  const taken = await tx.asset.findFirst({ where: { tag: { equals: tag, mode: "insensitive" }, releasedAt: null, ...(selfId ? { id: { not: selfId } } : {}) } });
  if (!taken) return;
  const where = await placeWords(tx, taken);
  throw new InventoryProblem(`Tag ${taken.tag} belongs to ${taken.name}, ${where}. Use the next tag: ${await nextTagPreview(tx, ctx)}.`, "tag", { href: `${BASE}/assets/${taken.id}`, label: "Open that asset" });
}

export type AssetInput = Place & {
  name: string;
  type: string;
  tag: string | null;
  serialNo: string | null;
  purchaseDate: Date | null;
  costPaise: bigint | null;
  vendorId: string | null;
  warrantyEnd: Date | null;
  amcEnd: Date | null;
  condition: string;
  note: string | null;
  receiptId?: string | null;
  itemId?: string | null;
};

async function checkAsset(tx: Tx, ctx: SchoolContext, s: InvSettings, input: AssetInput) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) throw new InventoryProblem("Asset name is needed.", "name");
  if (name.length > 120) throw new InventoryProblem("Asset name can be at most 120 characters.", "name");
  if (!s.assetTypes.includes(input.type)) throw new InventoryProblem("Choose the type from the list.", "type");
  if (!(CONDITIONS as readonly string[]).includes(input.condition)) throw new InventoryProblem("Choose the condition.", "condition");
  if (input.costPaise !== null && input.costPaise < ZERO) throw new InventoryProblem("Cost cannot be below ₹0.", "cost");
  if (input.vendorId && !(await tx.vendor.findFirst({ where: { id: input.vendorId } }))) throw new InventoryProblem("Choose the vendor from the list.", "vendorId");
  if (input.purchaseDate && input.warrantyEnd && input.warrantyEnd < input.purchaseDate) throw new InventoryProblem("Warranty cannot end before the purchase date.", "warrantyEnd");
  return name;
}

/** Adds one asset, or several of the same kind (for example 30 desks from one goods receipt), each with its own tag. */
export async function addAssets(tx: Tx, ctx: SchoolContext, input: AssetInput, count = 1, importBatchId: string | null = null) {
  const s = await inventorySettings(tx, ctx);
  const name = await checkAsset(tx, ctx, s, input);
  await checkPlace(tx, input);
  if (!Number.isInteger(count) || count < 1 || count > 100) throw new InventoryProblem("Add 1 to 100 assets at a time.", "count");
  let typed = input.tag?.trim().toUpperCase() || null;
  if (typed && count > 1) throw new InventoryProblem("Leave the tag empty when adding more than one: each gets the next tag.", "tag");
  if (typed && !/^[A-Z0-9/-]{2,24}$/.test(typed)) throw new InventoryProblem("A tag can have 2 to 24 letters, digits, - or /.", "tag");
  if (typed) await tagTaken(tx, ctx, typed);
  const made: Asset[] = [];
  for (let i = 0; i < count; i++) {
    const tag = typed ?? (await takeTag(tx, ctx, s));
    typed = null;
    const a = await tx.asset.create({
      data: {
        schoolId: ctx.schoolId, tag, name, type: input.type, serialNo: input.serialNo?.trim() || null, roomId: input.roomId, departmentId: input.departmentId, staffId: input.staffId,
        purchaseDate: input.purchaseDate, costPaise: input.costPaise, vendorId: input.vendorId, warrantyEnd: input.warrantyEnd, amcEnd: input.amcEnd, condition: input.condition,
        note: input.note?.trim() || null, receiptId: input.receiptId ?? null, itemId: input.itemId ?? null, importBatchId, createdById: ctx.userId, updatedById: ctx.userId,
      },
    });
    await tx.assetAssignment.create({ data: { schoolId: ctx.schoolId, assetId: a.id, roomId: a.roomId, departmentId: a.departmentId, staffId: a.staffId, date: input.purchaseDate ?? new Date(new Date().toISOString().slice(0, 10)), reason: input.receiptId ? "Received" : "Added to the register", createdById: ctx.userId } });
    made.push(a);
  }
  await writeAudit(tx, ctx, { action: "created", recordType: "Asset", recordId: made[0].id, after: { tags: made.map((a) => a.tag).join(", "), name, type: input.type, place: await placeWords(tx, input), cost: input.costPaise !== null ? formatRupees(input.costPaise) : null } });
  return made;
}

export async function updateAsset(tx: Tx, ctx: SchoolContext, assetId: string, input: Omit<AssetInput, keyof Place>) {
  const before = await tx.asset.findFirst({ where: { id: assetId } });
  if (!before) throw new InventoryProblem("This asset was not found.");
  if (before.status === "DISPOSED") throw new InventoryProblem("This asset is disposed. It stays in the register as it was.");
  const s = await inventorySettings(tx, ctx);
  const name = await checkAsset(tx, ctx, s, { ...input, roomId: null, departmentId: null, staffId: null });
  const tag = input.tag?.trim().toUpperCase() || before.tag;
  if (tag !== before.tag) {
    if (!/^[A-Z0-9/-]{2,24}$/.test(tag)) throw new InventoryProblem("A tag can have 2 to 24 letters, digits, - or /.", "tag");
    await tagTaken(tx, ctx, tag, before.id);
  }
  const after = await tx.asset.update({
    where: { id: before.id },
    data: { tag, name, type: input.type, serialNo: input.serialNo?.trim() || null, purchaseDate: input.purchaseDate, costPaise: input.costPaise, vendorId: input.vendorId, warrantyEnd: input.warrantyEnd, amcEnd: input.amcEnd, condition: input.condition, note: input.note?.trim() || null, updatedById: ctx.userId, remindedFor: input.warrantyEnd?.getTime() !== before.warrantyEnd?.getTime() || input.amcEnd?.getTime() !== before.amcEnd?.getTime() ? null : before.remindedFor },
  });
  const show = (a: Asset) => ({ tag: a.tag, name: a.name, type: a.type, cost: a.costPaise !== null ? formatRupees(a.costPaise) : null, warranty: a.warrantyEnd ? day(a.warrantyEnd) : null, amc: a.amcEnd ? day(a.amcEnd) : null, condition: a.condition });
  await writeAudit(tx, ctx, { action: "updated", recordType: "Asset", recordId: before.id, before: show(before), after: show(after) });
  return after;
}

/** Assign or transfer an asset to a room, department or person; the history is kept. */
export async function assignAsset(tx: Tx, ctx: SchoolContext, assetId: string, place: Place, date: Date, reason: string | null) {
  const a = await tx.asset.findFirst({ where: { id: assetId } });
  if (!a) throw new InventoryProblem("This asset was not found.");
  if (a.status === "DISPOSED") throw new InventoryProblem("This asset is disposed and cannot be moved.");
  await checkPlace(tx, place);
  if (a.roomId === place.roomId && a.departmentId === place.departmentId && a.staffId === place.staffId) throw new InventoryProblem("The asset is already there.", "place");
  const from = await placeWords(tx, a);
  const to = await placeWords(tx, place);
  await tx.asset.update({ where: { id: a.id }, data: { ...place, updatedById: ctx.userId } });
  await tx.assetAssignment.create({ data: { schoolId: ctx.schoolId, assetId: a.id, ...place, date, reason: reason?.trim() || null, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "moved", recordType: "Asset", recordId: a.id, before: { place: from }, after: { place: to, reason } });
  return { from, to, asset: a };
}

/* ---------- Repairs (maintenance and repair log) ---------- */

export async function addRepair(tx: Tx, ctx: SchoolContext, input: { assetId: string; date: Date; problem: string; vendorId: string | null; note: string | null }) {
  const a = await tx.asset.findFirst({ where: { id: input.assetId } });
  if (!a) throw new InventoryProblem("This asset was not found.");
  if (a.status === "DISPOSED") throw new InventoryProblem("This asset is disposed.");
  const problem = input.problem.trim().replace(/\s+/g, " ");
  if (problem.length < 3) throw new InventoryProblem("Describe the problem.", "problem");
  const log = await tx.assetMaintenanceLog.create({ data: { schoolId: ctx.schoolId, assetId: a.id, date: input.date, problem, vendorId: input.vendorId, note: input.note, status: "OPEN", createdById: ctx.userId } });
  await tx.asset.update({ where: { id: a.id }, data: { status: "IN_REPAIR", updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "repair-logged", recordType: "Asset", recordId: a.id, after: { problem, date: day(input.date) } });
  return log;
}

async function repairHead(tx: Tx, ctx: SchoolContext) {
  await ensureFinanceDefaults(tx, ctx);
  const h = (await tx.accountHead.findFirst({ where: { kind: "EXPENSE", archivedAt: null, name: "Repairs and maintenance" } })) ?? (await tx.accountHead.findFirst({ where: { kind: "EXPENSE", archivedAt: null, name: "Miscellaneous" } }));
  if (!h) throw new InventoryProblem("Finance has no expense head for repairs. Ask the Accountant to add one.");
  return h.id;
}

/** A repair or maintenance cost as a Finance expense (approved by Finance's limit; paid there). */
export async function costToFinance(tx: Tx, ctx: SchoolContext, input: { amountPaise: bigint; date: Date; vendorId: string | null; note: string; billFileId: string | null; billNo: string | null; duplicateReason: string | null }) {
  const r = await recordExpense(tx, ctx, {
    date: input.date, accountHeadId: await repairHead(tx, ctx), amountPaise: input.amountPaise, vendorId: input.vendorId, costCentreId: null, billFileId: input.billFileId,
    note: input.note.slice(0, 200), isVendorBill: Boolean(input.vendorId && input.billNo), billNo: input.vendorId ? input.billNo : null, billDueDate: null, duplicateReason: input.duplicateReason,
  }, null);
  return r;
}

export async function updateRepair(tx: Tx, ctx: SchoolContext, logId: string, input: { status: "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED"; doneOn: Date | null; costPaise: bigint | null; vendorId: string | null; note: string | null; toFinance: boolean; billFileId: string | null; billNo: string | null; duplicateReason: string | null }) {
  const log = await tx.assetMaintenanceLog.findFirst({ where: { id: logId }, include: { asset: true } });
  if (!log) throw new InventoryProblem("This repair was not found.");
  if (log.status === "DONE" || log.status === "CANCELLED") throw new InventoryProblem("This repair is already closed.");
  if (input.status === "DONE" && !input.doneOn) throw new InventoryProblem("Enter the date it was done.", "doneOn");
  if (input.doneOn && input.doneOn < log.date) throw new InventoryProblem("Done on cannot be before the repair was logged.", "doneOn");
  let expenseId: string | null = null;
  let outcome: string | null = null;
  if (input.status === "DONE" && input.toFinance && input.costPaise && input.costPaise > ZERO) {
    const r = await costToFinance(tx, ctx, { amountPaise: input.costPaise, date: input.doneOn!, vendorId: input.vendorId ?? log.vendorId, note: `Repair of ${log.asset.name} ${log.asset.tag}: ${log.problem}`, billFileId: input.billFileId, billNo: input.billNo, duplicateReason: input.duplicateReason });
    expenseId = r.expense.id;
    outcome = r.outcome;
  }
  await tx.assetMaintenanceLog.update({ where: { id: log.id }, data: { status: input.status, doneOn: input.doneOn, costPaise: input.costPaise, vendorId: input.vendorId ?? log.vendorId, note: input.note ?? log.note, expenseId } });
  // The asset is back in use when no repair is left open.
  if (input.status === "DONE" || input.status === "CANCELLED") {
    const open = await tx.assetMaintenanceLog.count({ where: { assetId: log.assetId, status: { in: ["OPEN", "IN_PROGRESS"] }, id: { not: log.id } } });
    if (!open && log.asset.status === "IN_REPAIR") await tx.asset.update({ where: { id: log.assetId }, data: { status: "IN_USE" } });
  }
  await writeAudit(tx, ctx, { action: "repair-updated", recordType: "Asset", recordId: log.assetId, before: { status: log.status }, after: { status: input.status, cost: input.costPaise !== null ? formatRupees(input.costPaise) : null, expense: expenseId } });
  return { log, expenseId, outcome };
}

/* ---------- Depreciation ---------- */

export type DepRow = { year: number; from: Date; opening: bigint; depreciation: bigint; closing: bigint };

/** Rate (% a year) for an asset: its own, else its type's from Inventory Settings. */
export const rateOf = (a: Pick<Asset, "depreciationRate" | "type">, s: Pick<InvSettings, "rates">) => a.depreciationRate ?? s.rates[a.type] ?? 10;

/**
 * The yearly value (14 Assets, Depreciation) by the method in Inventory
 * Settings: straight line (the same amount each year, a share of the cost)
 * or written-down value (the rate on what is left). One row per full year
 * since purchase, up to the date given; never below ₹0.
 */
export function depreciation(a: Pick<Asset, "costPaise" | "purchaseDate">, method: string, ratePct: number, upTo: Date): DepRow[] {
  if (!a.costPaise || !a.purchaseDate || a.costPaise <= ZERO) return [];
  const rows: DepRow[] = [];
  let value = a.costPaise;
  const start = a.purchaseDate;
  const bp = BigInt(Math.round(ratePct * 100)); // basis points
  for (let y = 1; y <= 50; y++) {
    const from = new Date(Date.UTC(start.getUTCFullYear() + y - 1, start.getUTCMonth(), start.getUTCDate()));
    const end = new Date(Date.UTC(start.getUTCFullYear() + y, start.getUTCMonth(), start.getUTCDate()));
    if (end > upTo || value <= ZERO) break;
    let dep = method === "WDV" ? (value * bp) / BigInt(10000) : (a.costPaise * bp) / BigInt(10000);
    if (dep > value) dep = value;
    rows.push({ year: y, from, opening: value, depreciation: dep, closing: value - dep });
    value -= dep;
  }
  return rows;
}

/** Value after depreciation on a date. */
export function bookValue(a: Pick<Asset, "costPaise" | "purchaseDate" | "status">, method: string, ratePct: number, on: Date) {
  if (a.status === "DISPOSED") return ZERO;
  if (!a.costPaise) return ZERO;
  const rows = depreciation(a, method, ratePct, on);
  return rows.length ? rows[rows.length - 1].closing : a.costPaise;
}

/* ---------- Disposal (with approval) ---------- */

export async function requestDisposal(tx: Tx, ctx: SchoolContext, input: { assetId: string; method: string; reason: string; date: Date; salePaise: bigint | null; buyer: string | null; saleMode: string | null; saleRef: string | null }) {
  const a = await tx.asset.findFirst({ where: { id: input.assetId } });
  if (!a) throw new InventoryProblem("This asset was not found.");
  if (a.status === "DISPOSED") throw new InventoryProblem(`${a.name} ${a.tag} is already disposed.`);
  if (!DISPOSAL_METHOD[input.method]) throw new InventoryProblem("Choose how it is disposed of: sold, scrapped or donated.", "method");
  const reason = input.reason.trim().replace(/\s+/g, " ");
  if (reason.length < 5) throw new InventoryProblem("Give the reason, in at least 5 characters.", "reason");
  const waiting = await tx.assetDisposal.findFirst({ where: { assetId: a.id, status: "WAITING" } });
  if (waiting) throw new InventoryProblem(`Disposal of ${a.name} ${a.tag} is already waiting for approval.`);
  if (input.method === "SOLD") {
    if (!input.salePaise || input.salePaise <= ZERO) throw new InventoryProblem("Enter the sale amount.", "sale");
    if (!input.buyer || input.buyer.trim().length < 2) throw new InventoryProblem("Say who is buying it.", "buyer");
    if (!input.saleMode || !["CASH", "UPI", "BANK_TRANSFER", "CHEQUE"].includes(input.saleMode)) throw new InventoryProblem("Choose how the money will come.", "saleMode");
  }
  const d = await tx.assetDisposal.create({
    data: { schoolId: ctx.schoolId, assetId: a.id, method: input.method, reason, date: input.date, salePaise: input.method === "SOLD" ? input.salePaise : null, buyer: input.buyer?.trim() || null, saleMode: input.method === "SOLD" ? input.saleMode : null, saleRef: input.saleRef?.trim() || null, createdById: ctx.userId },
  });
  const where = await placeWords(tx, a);
  const approval = await requestApproval(tx, ctx, {
    type: "asset-disposal", recordType: "Asset Disposal", recordId: d.id,
    summary: `Dispose of ${a.name} ${a.tag} (${where}): ${DISPOSAL_METHOD[input.method].toLowerCase()}${input.method === "SOLD" && input.salePaise ? ` for ${formatRupees(input.salePaise)}` : ""}`,
    amountPaise: a.costPaise, reason,
  });
  await tx.assetDisposal.update({ where: { id: d.id }, data: { approvalId: approval.id } });
  await writeAudit(tx, ctx, { action: "disposal-asked", recordType: "Asset", recordId: a.id, after: { method: DISPOSAL_METHOD[input.method], reason, sale: input.salePaise ? formatRupees(input.salePaise) : null } });
  return { disposal: d, asset: a };
}

/** Approvals decided a disposal: approved, the asset stays in the register as Disposed and a sale goes to Finance as income. */
export async function decideDisposal(tx: Tx, ctx: SchoolContext, disposalId: string, decision: string, note: string | null) {
  const d = await tx.assetDisposal.findFirst({ where: { id: disposalId }, include: { asset: true } });
  if (!d || d.status !== "WAITING") return;
  if (decision !== "approve") {
    await tx.assetDisposal.update({ where: { id: d.id }, data: { status: decision === "withdraw" ? "CANCELLED" : "REJECTED", decisionNote: note } });
    await writeAudit(tx, ctx, { action: `disposal-${decision}`, recordType: "Asset", recordId: d.assetId, after: { note } });
    return;
  }
  let incomeId: string | null = null;
  if (d.method === "SOLD" && d.salePaise && d.salePaise > ZERO) {
    await ensureFinanceDefaults(tx, ctx);
    const head = (await tx.accountHead.findFirst({ where: { kind: "INCOME", archivedAt: null, name: "Scrap sale" } })) ?? (await tx.accountHead.findFirst({ where: { kind: "INCOME", archivedAt: null, systemKey: null } }));
    if (head) {
      const income = await recordIncome(tx, ctx, {
        date: d.date, accountHeadId: head.id, amountPaise: d.salePaise, receivedFrom: d.buyer ?? "Buyer", vendorId: null, mode: d.saleMode ?? "CASH",
        reference: d.saleMode && d.saleMode !== "CASH" ? (d.saleRef ?? `Sale of ${d.asset.tag}`) : null, accountId: null, note: `Sale of ${d.asset.name} ${d.asset.tag}`,
      }, true);
      incomeId = income.id;
    }
  }
  await tx.assetDisposal.update({ where: { id: d.id }, data: { status: "APPROVED", decisionNote: note, incomeId } });
  await tx.asset.update({ where: { id: d.assetId }, data: { status: "DISPOSED", disposedOn: d.date, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "disposed", recordType: "Asset", recordId: d.assetId, before: { status: d.asset.status }, after: { status: "DISPOSED", method: DISPOSAL_METHOD[d.method], income: incomeId } });
}

/* ---------- Links to stock items ---------- */

export async function linkItem(tx: Tx, ctx: SchoolContext, assetId: string, itemId: string, note: string | null) {
  const a = await tx.asset.findFirst({ where: { id: assetId } });
  if (!a) throw new InventoryProblem("This asset was not found.");
  const item = await tx.item.findFirst({ where: { id: itemId, archivedAt: null } });
  if (!item) throw new InventoryProblem("Choose the item from the list.", "itemId");
  const old = await tx.assetItemLink.findFirst({ where: { assetId, itemId } });
  if (old && !old.archivedAt) throw new InventoryProblem(`${item.name} is already linked to ${a.name}.`, "itemId");
  const link = old
    ? await tx.assetItemLink.update({ where: { id: old.id }, data: { archivedAt: null, note: note?.trim() || null } })
    : await tx.assetItemLink.create({ data: { schoolId: ctx.schoolId, assetId, itemId, note: note?.trim() || null, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "item-linked", recordType: "Asset", recordId: a.id, after: { item: item.name, code: item.code } });
  return link;
}

export async function unlinkItem(tx: Tx, ctx: SchoolContext, linkId: string) {
  const l = await tx.assetItemLink.findFirst({ where: { id: linkId, archivedAt: null } });
  if (!l) throw new InventoryProblem("This link was not found.");
  await tx.assetItemLink.update({ where: { id: l.id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "item-unlinked", recordType: "Asset", recordId: l.assetId, after: { item: l.itemId } });
}

/* ---------- Asset audit (physical check) ---------- */

export async function startAssetAudit(tx: Tx, ctx: SchoolContext, input: { name: string; roomId: string | null }) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 3) throw new InventoryProblem("Give the check a name, for example “Term 2 asset check”.", "name");
  if (input.roomId && !(await tx.room.findFirst({ where: { id: input.roomId, archivedAt: null } }))) throw new InventoryProblem("Choose the room from the list.", "roomId");
  const open = await tx.assetAudit.findFirst({ where: { status: "OPEN" } });
  if (open) throw new InventoryProblem(`${open.name} is still open. Close it first.`, "name");
  const a = await tx.assetAudit.create({ data: { schoolId: ctx.schoolId, name, roomId: input.roomId, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "started", recordType: "Asset Audit", recordId: a.id, after: { name } });
  return a;
}

/** One scanned (or typed) tag in a room: found, found in the wrong room, or not in the register. */
export async function scanTag(tx: Tx, ctx: SchoolContext, input: { auditId: string; code: string; roomId: string }) {
  const audit = await tx.assetAudit.findFirst({ where: { id: input.auditId } });
  if (!audit || audit.status !== "OPEN") throw new InventoryProblem("This asset check is closed.");
  const code = input.code.trim().toUpperCase();
  if (!code) throw new InventoryProblem("Scan or type a tag.", "code");
  const room = await tx.room.findFirst({ where: { id: input.roomId } });
  if (!room) throw new InventoryProblem("Choose the room you are checking.", "roomId");
  const asset = await tx.asset.findFirst({ where: { tag: { equals: code, mode: "insensitive" }, releasedAt: null } });
  const seen = await tx.assetAuditScan.findFirst({ where: { auditId: audit.id, code } });
  if (seen) return { result: "again" as const, asset, room };
  await tx.assetAuditScan.create({ data: { schoolId: ctx.schoolId, auditId: audit.id, code, assetId: asset?.id ?? null, roomId: room.id, scannedById: ctx.userId } });
  if (!asset) return { result: "unknown" as const, asset: null, room };
  if (asset.status === "DISPOSED") return { result: "disposed" as const, asset, room };
  return { result: asset.roomId === room.id ? ("found" as const) : ("misplaced" as const), asset, room };
}

export type AssetAuditResult = { expected: number; found: number; missing: { id: string; tag: string; name: string; place: string }[]; misplaced: { id: string; tag: string; name: string; registered: string; foundIn: string }[]; unknown: string[] };

/** What a check found so far: missing (expected in the rooms checked, not scanned) and misplaced (scanned in another room). */
export async function assetAuditResult(tx: Tx, auditId: string): Promise<AssetAuditResult> {
  const audit = await tx.assetAudit.findFirstOrThrow({ where: { id: auditId }, include: { scans: true } });
  const roomsChecked = audit.roomId ? [audit.roomId] : [...new Set(audit.scans.map((s) => s.roomId).filter((x): x is string => Boolean(x)))];
  const expected = await tx.asset.findMany({ where: { status: { not: "DISPOSED" }, archivedAt: null, roomId: { in: roomsChecked } } });
  const scanned = new Set(audit.scans.map((s) => s.assetId).filter(Boolean));
  const names = await placeNames(tx, [...expected, ...audit.scans.map((s) => ({ roomId: s.roomId, departmentId: null, staffId: null }))]);
  const scannedAssets = await tx.asset.findMany({ where: { id: { in: [...scanned] as string[] } } });
  const registeredNames = await placeNames(tx, scannedAssets);
  return {
    expected: expected.length,
    found: audit.scans.filter((s) => s.assetId && scannedAssets.find((a) => a.id === s.assetId)?.roomId === s.roomId).length,
    missing: expected.filter((a) => !scanned.has(a.id)).map((a) => ({ id: a.id, tag: a.tag, name: a.name, place: names(a) })),
    misplaced: audit.scans
      .filter((s) => s.assetId)
      .map((s) => ({ s, a: scannedAssets.find((x) => x.id === s.assetId)! }))
      .filter(({ s, a }) => a && a.roomId !== s.roomId && a.status !== "DISPOSED")
      .map(({ s, a }) => ({ id: a.id, tag: a.tag, name: a.name, registered: registeredNames(a), foundIn: names({ roomId: s.roomId, departmentId: null, staffId: null }) })),
    unknown: audit.scans.filter((s) => !s.assetId).map((s) => s.code),
  };
}

export async function closeAssetAudit(tx: Tx, ctx: SchoolContext, auditId: string) {
  const audit = await tx.assetAudit.findFirst({ where: { id: auditId } });
  if (!audit || audit.status !== "OPEN") throw new InventoryProblem("This asset check is already closed.");
  const result = await assetAuditResult(tx, auditId);
  await tx.assetAudit.update({ where: { id: audit.id }, data: { status: "CLOSED", closedAt: new Date(), result } });
  await writeAudit(tx, ctx, { action: "closed", recordType: "Asset Audit", recordId: audit.id, after: { expected: result.expected, found: result.found, missing: result.missing.length, misplaced: result.misplaced.length, unknown: result.unknown.length } });
  return result;
}

/** Assets and stock items a staff member holds (exit clearance). */
export async function assetsHeldByStaff(tx: Tx, staffId: string) {
  return tx.asset.findMany({ where: { staffId, status: { not: "DISPOSED" }, archivedAt: null }, orderBy: { tag: "asc" } });
}

export const ZERO_PAISE = ZERO;
