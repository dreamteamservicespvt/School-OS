// Purchases (14 Purchases & Vendors): request (Waiting, Approved, Rejected) →
// order (Sent, Part received, Received, Closed) → goods received → bill
// (Unpaid, Part paid, Paid).
//   - A request up to the limit in Inventory Settings is approved at once;
//     above it, it waits in Approvals (type Purchase).
//   - Orders are made only from approved requests, except small orders within
//     the limit. An order above both its request's estimate and the limit
//     waits in Approvals again.
//   - Goods received raise stock in the chosen store; more than ordered needs
//     a reason ("Ordered 50, receiving 60").
//   - The vendor's bill is an Expense in Finance Management (a vendor bill),
//     so it shows in Expenses and, when paid, in the Day Book. A bill that
//     matches an order the Principal approved is approved with it; any other
//     bill follows Finance's own approval limit. Paying is Finance work.
import "server-only";

import type { PurchaseOrder } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate, formatRupees } from "../format";
import { nextNumber, formatNumber } from "../sequences";
import { requestApproval } from "../approvals";
import { MoneyProblem } from "../fees/problem";
import { ensureFinanceDefaults, financeSettings } from "../finance/settings";
import { financialYearOf } from "../finance/years";
import { payExpense, recordExpense, submitExpense, cancelExpense, type PayInput } from "../finance/expenses";
import { InventoryProblem } from "./problem";
import { inventorySettings } from "./settings";
import { move } from "./stock";
import { BASE, plural, qtyWords } from "./words";

const ZERO = BigInt(0);
const day = (d: Date) => formatDate(d, "UTC");

export type RequestLine = { itemId: string; qty: number; estUnitPaise: bigint | null };

async function itemsOf(tx: Tx, ids: string[]) {
  const items = await tx.item.findMany({ where: { id: { in: ids } } });
  if (items.length !== new Set(ids).size || items.some((i) => i.archivedAt)) throw new InventoryProblem("Choose the items from the list.", "lines");
  return new Map(items.map((i) => [i.id, i]));
}

/** The department of the person asking, from their staff record (the form's default). */
export async function departmentOf(tx: Tx, userId: string | null) {
  if (!userId) return null;
  const s = await tx.staff.findFirst({ where: { userLoginId: userId, archivedAt: null }, select: { departmentId: true } });
  return s?.departmentId ?? null;
}

/* ---------- Purchase requests ---------- */

export async function createRequest(tx: Tx, ctx: SchoolContext, input: { lines: RequestLine[]; neededBy: Date | null; reason: string; departmentId: string | null; estimatePaise: bigint | null; date: Date }) {
  const s = await inventorySettings(tx, ctx);
  const reason = input.reason.trim().replace(/\s+/g, " ");
  if (reason.length < 5) throw new InventoryProblem("Say why these are needed, in at least 5 characters.", "reason");
  if (!input.lines.length) throw new InventoryProblem("Add at least one item.", "lines");
  if (input.neededBy && input.neededBy < input.date) throw new InventoryProblem("Needed by cannot be before today.", "neededBy");
  if (input.departmentId && !(await tx.department.findFirst({ where: { id: input.departmentId, archivedAt: null } }))) throw new InventoryProblem("Choose a department from the list.", "departmentId");
  const items = await itemsOf(tx, input.lines.map((l) => l.itemId));
  // The estimate: typed, or worked out from the last purchase price (else the item price).
  const lines = input.lines.map((l) => {
    const item = items.get(l.itemId)!;
    return { ...l, estUnitPaise: l.estUnitPaise ?? item.lastPricePaise ?? item.pricePaise ?? ZERO };
  });
  const worked = lines.reduce((a, l) => a + l.estUnitPaise * BigInt(l.qty), ZERO);
  const estimate = input.estimatePaise ?? worked;
  if (estimate < ZERO) throw new InventoryProblem("The estimate cannot be below ₹0.", "estimate");
  const n = await nextNumber(tx, ctx, "inventory-request");
  const waits = estimate > s.approveUpToPaise;
  const req = await tx.purchaseRequest.create({
    data: {
      schoolId: ctx.schoolId, number: formatNumber("PR-", n, 4), date: input.date, neededBy: input.neededBy, reason, departmentId: input.departmentId, estimatePaise: estimate,
      status: waits ? "WAITING" : "APPROVED", requestedById: ctx.userId, decidedAt: waits ? null : new Date(), decisionNote: waits ? null : `Within ${formatRupees(s.approveUpToPaise)}: approved at once`,
      lines: { create: lines.map((l) => ({ schoolId: ctx.schoolId, itemId: l.itemId, qty: l.qty, estUnitPaise: l.estUnitPaise })) },
    },
  });
  await writeAudit(tx, ctx, { action: "created", recordType: "Purchase Request", recordId: req.id, after: { number: req.number, items: lines.length, estimate: formatRupees(estimate), waiting: waits } });
  if (waits) {
    const first = lines.slice(0, 3).map((l) => `${l.qty} × ${items.get(l.itemId)!.name}`).join(", ");
    const approval = await requestApproval(tx, ctx, {
      type: "purchase", recordType: "Purchase Request", recordId: req.id,
      summary: `Purchase request ${req.number}: ${first}${lines.length > 3 ? ` and ${lines.length - 3} more` : ""}, about ${formatRupees(estimate)}`,
      amountPaise: estimate, reason,
    });
    await tx.purchaseRequest.update({ where: { id: req.id }, data: { approvalId: approval.id } });
  }
  return { request: req, waiting: waits, limit: s.approveUpToPaise };
}

/** Approvals decided a request. */
export async function decideRequest(tx: Tx, ctx: SchoolContext, requestId: string, decision: string, note: string | null) {
  const r = await tx.purchaseRequest.findFirst({ where: { id: requestId } });
  if (!r || r.status !== "WAITING") return;
  const status = decision === "approve" ? "APPROVED" : decision === "withdraw" ? "CANCELLED" : "REJECTED";
  await tx.purchaseRequest.update({ where: { id: r.id }, data: { status, decidedById: ctx.userId, decidedAt: new Date(), decisionNote: note ?? (decision === "ask-change" ? "Sent back for a change" : null) } });
  await writeAudit(tx, ctx, { action: `request-${decision}`, recordType: "Purchase Request", recordId: r.id, before: { status: "WAITING" }, after: { status, note } });
}

/** Cancels a request not yet ordered (a waiting one is withdrawn from Approvals). */
export async function cancelRequest(tx: Tx, ctx: SchoolContext, requestId: string, reason: string) {
  if (reason.trim().length < 5) throw new InventoryProblem("Give a reason of at least 5 characters.", "reason");
  const r = await tx.purchaseRequest.findFirst({ where: { id: requestId } });
  if (!r) throw new InventoryProblem("This request was not found.");
  if (!["WAITING", "APPROVED"].includes(r.status)) throw new InventoryProblem("Only a waiting or approved request can be cancelled.");
  if (r.approvalId && r.status === "WAITING") {
    await tx.approval.updateMany({ where: { id: r.approvalId, status: { in: ["WAITING", "ESCALATED"] } }, data: { status: "WITHDRAWN", decidedById: ctx.userId, decidedAt: new Date(), decisionReason: `Request cancelled: ${reason}` } });
    await tx.notification.updateMany({ where: { link: `/approvals/${r.approvalId}`, doneAt: null }, data: { doneAt: new Date() } });
  }
  await tx.purchaseRequest.update({ where: { id: r.id }, data: { status: "CANCELLED", decisionNote: reason.trim() } });
  await writeAudit(tx, ctx, { action: "cancelled", recordType: "Purchase Request", recordId: r.id, before: { status: r.status }, after: { reason } });
}

/* ---------- Purchase orders ---------- */

export type OrderLine = { itemId: string; qty: number; unitPricePaise: bigint };

export async function createOrder(tx: Tx, ctx: SchoolContext, input: { requestId: string | null; vendorId: string; locationId: string; expectedOn: Date | null; lines: OrderLine[]; note: string | null; date: Date }) {
  const s = await inventorySettings(tx, ctx);
  const vendor = await tx.vendor.findFirst({ where: { id: input.vendorId, archivedAt: null } });
  if (!vendor) throw new InventoryProblem("Choose the vendor.", "vendorId");
  const loc = await tx.storeLocation.findFirst({ where: { id: input.locationId, archivedAt: null } });
  if (!loc) throw new InventoryProblem("Choose the store the goods come to.", "locationId");
  if (!input.lines.length) throw new InventoryProblem("Add at least one item.", "lines");
  if (input.lines.some((l) => l.unitPricePaise <= ZERO)) throw new InventoryProblem("Enter the price of every item.", "lines");
  if (input.expectedOn && input.expectedOn < input.date) throw new InventoryProblem("Expected date cannot be before the order date.", "expectedOn");
  const items = await itemsOf(tx, input.lines.map((l) => l.itemId));
  const total = input.lines.reduce((a, l) => a + l.unitPricePaise * BigInt(l.qty), ZERO);
  const req = input.requestId ? await tx.purchaseRequest.findFirst({ where: { id: input.requestId } }) : null;
  if (input.requestId && !req) throw new InventoryProblem("This request was not found.", "requestId");
  if (req) {
    // 14 §5 "Purchase without approval": orders only from approved requests.
    if (req.status === "WAITING") throw new InventoryProblem(`Request ${req.number} is waiting for approval. Make the order once it is approved.`, "requestId", { href: `${BASE}/purchases?tab=requests&request=${req.id}`, label: "Open the request" });
    if (req.status === "ORDERED") throw new InventoryProblem(`Request ${req.number} already has a purchase order.`, "requestId");
    if (req.status !== "APPROVED") throw new InventoryProblem(`Request ${req.number} is ${req.status === "REJECTED" ? "not approved" : "cancelled"}. Raise a new request.`, "requestId");
  } else if (total > s.approveUpToPaise) {
    throw new InventoryProblem(`Orders above ${formatRupees(s.approveUpToPaise)} need an approved purchase request. Raise a request first (${formatRupees(total)}).`, "requestId", { href: `${BASE}/purchases?tab=requests&new=1`, label: "Raise a request" });
  }
  const waits = total > (req && req.estimatePaise > s.approveUpToPaise ? req.estimatePaise : s.approveUpToPaise);
  const fy = await financialYearOf(tx, ctx, input.date);
  const n = await nextNumber(tx, ctx, `inventory-po:${fy.name}`);
  const order = await tx.purchaseOrder.create({
    data: {
      schoolId: ctx.schoolId, number: formatNumber(`${s.poPrefix}${fy.name}/`, n, 4), date: input.date, requestId: req?.id ?? null, vendorId: vendor.id, locationId: loc.id, expectedOn: input.expectedOn,
      totalPaise: total, status: waits ? "WAITING" : "SENT", note: input.note, approvedById: !waits && req?.approvalId ? req.decidedById : null, createdById: ctx.userId,
      lines: { create: input.lines.map((l) => ({ schoolId: ctx.schoolId, itemId: l.itemId, qty: l.qty, unitPricePaise: l.unitPricePaise })) },
    },
  });
  if (req) await tx.purchaseRequest.update({ where: { id: req.id }, data: { status: "ORDERED" } });
  for (const l of input.lines) await tx.item.update({ where: { id: l.itemId }, data: { lastPricePaise: l.unitPricePaise } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Purchase Order", recordId: order.id, after: { number: order.number, vendor: vendor.name, total: formatRupees(total), request: req?.number ?? null, waiting: waits } });
  if (waits) {
    const approval = await requestApproval(tx, ctx, {
      type: "purchase", recordType: "Purchase Order", recordId: order.id,
      summary: `Purchase order ${order.number} to ${vendor.name}: ${formatRupees(total)}${req ? ` (request ${req.number} estimated ${formatRupees(req.estimatePaise)})` : ""}`,
      amountPaise: total,
      reason: input.lines.slice(0, 5).map((l) => `${l.qty} × ${items.get(l.itemId)!.name} at ${formatRupees(l.unitPricePaise)}`).join("; "),
    });
    await tx.purchaseOrder.update({ where: { id: order.id }, data: { approvalId: approval.id } });
  }
  return { order, waiting: waits, vendor };
}

/** Approvals decided an order above its request's estimate. */
export async function decideOrder(tx: Tx, ctx: SchoolContext, orderId: string, decision: string, note: string | null) {
  const o = await tx.purchaseOrder.findFirst({ where: { id: orderId } });
  if (!o || o.status !== "WAITING") return;
  if (decision === "approve") {
    await tx.purchaseOrder.update({ where: { id: o.id }, data: { status: "SENT", approvedById: ctx.userId, decisionNote: note } });
  } else {
    await tx.purchaseOrder.update({ where: { id: o.id }, data: { status: "CANCELLED", decisionNote: note ?? (decision === "withdraw" ? "Withdrawn" : null), closedReason: decision === "withdraw" ? "Withdrawn" : "Not approved" } });
    // The request can be ordered again (at a better price, or from another vendor).
    if (o.requestId) await tx.purchaseRequest.updateMany({ where: { id: o.requestId, status: "ORDERED" }, data: { status: "APPROVED" } });
  }
  await writeAudit(tx, ctx, { action: `order-${decision}`, recordType: "Purchase Order", recordId: o.id, before: { status: "WAITING" }, after: { decision, note } });
}

/** Closes an order still open: cancelled when nothing came, else closed short. */
export async function closeOrder(tx: Tx, ctx: SchoolContext, orderId: string, reason: string) {
  if (reason.trim().length < 5) throw new InventoryProblem("Give a reason of at least 5 characters.", "reason");
  const o = await tx.purchaseOrder.findFirst({ where: { id: orderId }, include: { lines: true } });
  if (!o) throw new InventoryProblem("This order was not found.");
  if (!["WAITING", "SENT", "PART_RECEIVED"].includes(o.status)) throw new InventoryProblem("This order is already finished.");
  const received = o.lines.some((l) => l.receivedQty > 0);
  if (o.status === "WAITING" && o.approvalId) {
    await tx.approval.updateMany({ where: { id: o.approvalId, status: { in: ["WAITING", "ESCALATED"] } }, data: { status: "WITHDRAWN", decidedById: ctx.userId, decidedAt: new Date(), decisionReason: `Order cancelled: ${reason}` } });
    await tx.notification.updateMany({ where: { link: `/approvals/${o.approvalId}`, doneAt: null }, data: { doneAt: new Date() } });
  }
  const status = received ? "CLOSED" : "CANCELLED";
  await tx.purchaseOrder.update({ where: { id: o.id }, data: { status, closedReason: reason.trim() } });
  if (!received && o.requestId) await tx.purchaseRequest.updateMany({ where: { id: o.requestId, status: "ORDERED" }, data: { status: "APPROVED" } });
  await writeAudit(tx, ctx, { action: received ? "closed" : "cancelled", recordType: "Purchase Order", recordId: o.id, before: { status: o.status }, after: { status, reason } });
  return status;
}

/** Marks the order as sent to the vendor by email (after the email went). */
export async function markEmailed(tx: Tx, ctx: SchoolContext, orderId: string, to: string) {
  await tx.purchaseOrder.update({ where: { id: orderId }, data: { emailedTo: to, emailedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "emailed", recordType: "Purchase Order", recordId: orderId, after: { to } });
}

/* ---------- Goods received ---------- */

export type ReceiptLine = { orderLineId: string; qty: number; batchNo: string | null; expiresOn: Date | null };

export async function receiveGoods(tx: Tx, ctx: SchoolContext, input: { orderId: string; date: Date; locationId: string; lines: ReceiptLine[]; extraReason: string | null; note: string | null; today: Date }) {
  const o = await tx.purchaseOrder.findFirst({ where: { id: input.orderId }, include: { lines: true } });
  if (!o) throw new InventoryProblem("This order was not found.");
  if (o.status === "WAITING") throw new InventoryProblem(`${o.number} is waiting for approval. Goods can be received once it is approved.`);
  if (!["SENT", "PART_RECEIVED"].includes(o.status)) throw new InventoryProblem(`${o.number} is ${o.status === "RECEIVED" ? "fully received" : "closed"}.`);
  const loc = await tx.storeLocation.findFirst({ where: { id: input.locationId, archivedAt: null } });
  if (!loc) throw new InventoryProblem("Choose the store the goods go to.", "locationId");
  if (input.date > input.today) throw new InventoryProblem("The date received cannot be in the future.", "date");
  const lines = input.lines.filter((l) => l.qty > 0);
  if (!lines.length) throw new InventoryProblem("Enter the quantity that arrived for at least one item.", "lines");
  const items = await itemsOf(tx, o.lines.map((l) => l.itemId)).catch(() => new Map());
  const extra: string[] = [];
  for (const l of lines) {
    const ol = o.lines.find((x) => x.id === l.orderLineId);
    if (!ol) throw new InventoryProblem("This line is not on the order.", "lines");
    if (!Number.isInteger(l.qty) || l.qty < 0 || l.qty > 100_000) throw new InventoryProblem("Quantities must be whole numbers.", "lines");
    const item = items.get(ol.itemId) ?? (await tx.item.findFirstOrThrow({ where: { id: ol.itemId } }));
    if (ol.receivedQty + l.qty > ol.qty) extra.push(`${item.name}: ordered ${ol.qty}${ol.receivedQty ? `, ${ol.receivedQty} already received` : ""}, receiving ${l.qty}`);
    if (item.tracksExpiry && !l.expiresOn) throw new InventoryProblem(`${item.name} keeps expiry dates. Enter its expiry date.`, `exp-${ol.id}`);
  }
  // 14 §5 "Receiving more than ordered": a warning; the extra needs a reason.
  if (extra.length && (!input.extraReason || input.extraReason.trim().length < 5)) {
    const first = lines.map((l) => ({ l, ol: o.lines.find((x) => x.id === l.orderLineId)! })).find(({ l, ol }) => ol.receivedQty + l.qty > ol.qty)!;
    const words = `Ordered ${first.ol.qty - first.ol.receivedQty}, receiving ${first.l.qty}`;
    throw new InventoryProblem(`${words}${extra.length > 1 ? ` (and ${extra.length - 1} more line${extra.length > 2 ? "s" : ""})` : ""}. Correct the quantity, or give a reason to accept the extra.`, "extraReason");
  }
  const n = await nextNumber(tx, ctx, "inventory-grn");
  const grn = await tx.goodsReceipt.create({
    data: {
      schoolId: ctx.schoolId, number: formatNumber("GRN-", n, 4), orderId: o.id, date: input.date, locationId: loc.id, extraReason: extra.length ? input.extraReason!.trim() : null, note: input.note, receivedById: ctx.userId,
      lines: { create: lines.map((l) => ({ schoolId: ctx.schoolId, orderLineId: l.orderLineId, itemId: o.lines.find((x) => x.id === l.orderLineId)!.itemId, qty: l.qty, batchNo: l.batchNo, expiresOn: l.expiresOn })) },
    },
  });
  for (const l of lines) {
    const ol = o.lines.find((x) => x.id === l.orderLineId)!;
    await move(tx, ctx, {
      itemId: ol.itemId, locationId: loc.id, kind: "RECEIVED", qty: l.qty, date: input.date, reference: `${grn.number} against ${o.number}`, unitCostPaise: ol.unitPricePaise, receiptId: grn.id, today: input.today,
      batch: l.expiresOn ? { batchNo: l.batchNo?.trim() || grn.number, expiresOn: l.expiresOn } : null,
    });
    await tx.purchaseOrderLine.update({ where: { id: ol.id }, data: { receivedQty: { increment: l.qty } } });
  }
  const after = await tx.purchaseOrderLine.findMany({ where: { orderId: o.id } });
  const full = after.every((l) => l.receivedQty >= l.qty);
  await tx.purchaseOrder.update({ where: { id: o.id }, data: { status: full ? "RECEIVED" : "PART_RECEIVED" } });
  const units = lines.reduce((a, l) => a + l.qty, 0);
  await writeAudit(tx, ctx, { action: "goods-received", recordType: "Goods Receipt", recordId: grn.id, after: { number: grn.number, order: o.number, store: loc.name, lines: lines.length, units, extra: extra.length ? input.extraReason : null } });
  return { receipt: grn, order: o, full, units, store: loc.name };
}

/* ---------- Bills (Finance Expenses) and payments ---------- */

/** The expense head a purchase goes to: the category of most of its value, else the setting, else Miscellaneous. */
async function headFor(tx: Tx, ctx: SchoolContext, order: (PurchaseOrder & { lines: { itemId: string; qty: number; unitPricePaise: bigint }[] }) | null) {
  const s = await inventorySettings(tx, ctx);
  if (order) {
    const items = await tx.item.findMany({ where: { id: { in: order.lines.map((l) => l.itemId) } }, include: { category: true } });
    const byHead = new Map<string, bigint>();
    for (const l of order.lines) {
      const h = items.find((i) => i.id === l.itemId)?.category.expenseHeadId;
      if (h) byHead.set(h, (byHead.get(h) ?? ZERO) + l.unitPricePaise * BigInt(l.qty));
    }
    const best = [...byHead.entries()].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))[0];
    if (best && (await tx.accountHead.findFirst({ where: { id: best[0], kind: "EXPENSE", archivedAt: null } }))) return best[0];
  }
  if (s.defaultExpenseHeadId && (await tx.accountHead.findFirst({ where: { id: s.defaultExpenseHeadId, kind: "EXPENSE", archivedAt: null } }))) return s.defaultExpenseHeadId;
  await ensureFinanceDefaults(tx, ctx);
  const misc = await tx.accountHead.findFirst({ where: { kind: "EXPENSE", archivedAt: null, name: "Miscellaneous" } }) ?? (await tx.accountHead.findFirst({ where: { kind: "EXPENSE", archivedAt: null } }));
  if (!misc) throw new InventoryProblem("Finance has no expense heads yet. Ask the Accountant to set up Finance first.");
  return misc.id;
}

export type BillInput = { orderId: string | null; vendorId: string | null; billNo: string; billDate: Date; dueDate: Date | null; amountPaise: bigint; fileId: string | null; note: string | null; duplicateReason: string | null; accountHeadId?: string | null };

/**
 * Records the vendor's bill: an Expense (vendor bill) in Finance, linked to
 * the order. Finance's duplicate check ("Bill already recorded") and its
 * bill-photo rule apply.
 */
export async function recordBill(tx: Tx, ctx: SchoolContext, input: BillInput) {
  const order = input.orderId ? await tx.purchaseOrder.findFirst({ where: { id: input.orderId }, include: { lines: true, invoices: true } }) : null;
  if (input.orderId && !order) throw new InventoryProblem("This order was not found.", "orderId");
  if (order && ["WAITING", "CANCELLED"].includes(order.status)) throw new InventoryProblem(`${order.number} is ${order.status === "WAITING" ? "waiting for approval" : "cancelled"}. A bill cannot be recorded against it.`, "orderId");
  const vendorId = order?.vendorId ?? input.vendorId;
  if (!vendorId) throw new InventoryProblem("Choose the vendor.", "vendorId");
  const vendor = await tx.vendor.findFirst({ where: { id: vendorId } });
  if (!vendor) throw new InventoryProblem("Choose the vendor.", "vendorId");
  const billNo = input.billNo.trim();
  if (billNo.length < 1 || billNo.length > 40) throw new InventoryProblem("Enter the bill number from the vendor's bill.", "billNo");
  if (input.amountPaise <= ZERO) throw new InventoryProblem("Amount must be more than ₹0.", "amount");
  if (input.dueDate && input.dueDate < input.billDate) throw new InventoryProblem("The due date cannot be before the bill date.", "dueDate");
  // Bills already recorded against this order (not cancelled).
  let billed = ZERO;
  if (order?.invoices.length) {
    const ex = await tx.expense.findMany({ where: { id: { in: order.invoices.map((i) => i.expenseId) }, status: { not: "CANCELLED" } }, select: { amountPaise: true } });
    billed = ex.reduce((a, e) => a + e.amountPaise, ZERO);
  }
  const accountHeadId = input.accountHeadId ?? (await headFor(tx, ctx, order));
  const r = await recordExpense(tx, ctx, {
    date: input.billDate, accountHeadId, amountPaise: input.amountPaise, vendorId, costCentreId: null, billFileId: input.fileId,
    note: [order ? `Purchase order ${order.number}` : "Store purchase", input.note].filter(Boolean).join(": ").slice(0, 200),
    isVendorBill: true, billNo, billDueDate: input.dueDate, duplicateReason: input.duplicateReason,
  }, null, { draft: true });
  // A bill within an order the approver passed is approved with it; anything else follows Finance's limit.
  let outcome: "approved" | "waiting";
  const approvedOrder = order && order.approvedById && order.approvedById !== ctx.userId && billed + input.amountPaise <= order.totalPaise;
  if (approvedOrder) {
    await tx.expense.update({ where: { id: r.expense.id }, data: { status: "APPROVED", approvedById: order!.approvedById, approvedAt: new Date() } });
    await writeAudit(tx, ctx, { action: "approved-with-order", recordType: "Expense", recordId: r.expense.id, after: { order: order!.number, amount: formatRupees(input.amountPaise) } });
    outcome = "approved";
  } else {
    outcome = await submitExpense(tx, ctx, r.expense.id, order && billed + input.amountPaise > order.totalPaise ? `Bills come to ${formatRupees(billed + input.amountPaise)} against an order of ${formatRupees(order.totalPaise)}` : null);
  }
  const invoice = await tx.purchaseInvoice.create({
    data: { schoolId: ctx.schoolId, orderId: order?.id ?? null, vendorId, billNo, billDate: input.billDate, dueDate: input.dueDate, amountPaise: input.amountPaise, expenseId: r.expense.id, fileId: input.fileId, note: input.note, createdById: ctx.userId },
  });
  await writeAudit(tx, ctx, { action: "created", recordType: "Purchase Invoice", recordId: invoice.id, after: { billNo, vendor: vendor.name, amount: formatRupees(input.amountPaise), order: order?.number ?? null, expense: r.expense.number, outcome } });
  return { invoice, expense: r.expense, outcome, overOrder: Boolean(order && billed + input.amountPaise > order.totalPaise) };
}

/** Pays a bill (in full or a part): the payment reaches the Day Book on the date paid. */
export async function payBill(tx: Tx, ctx: SchoolContext, invoiceId: string, pay: PayInput) {
  const inv = await tx.purchaseInvoice.findFirst({ where: { id: invoiceId } });
  if (!inv) throw new InventoryProblem("This bill was not found.");
  const e = await tx.expense.findFirst({ where: { id: inv.expenseId } });
  if (!e) throw new InventoryProblem("This bill's expense was not found in Finance.");
  if (e.status === "DRAFT") throw new MoneyProblem("This bill was sent back by the approver. Open it in Finance, Expenses to change and send it again.");
  const p = await payExpense(tx, ctx, e.id, pay);
  return { payment: p, bill: inv, expense: e };
}

/** Cancels a bill entered by mistake (Finance reverses any payment on the cancel date). */
export async function cancelBill(tx: Tx, ctx: SchoolContext, invoiceId: string, reason: string, today: Date) {
  const inv = await tx.purchaseInvoice.findFirst({ where: { id: invoiceId } });
  if (!inv) throw new InventoryProblem("This bill was not found.");
  await cancelExpense(tx, ctx, inv.expenseId, reason, today);
  await writeAudit(tx, ctx, { action: "cancelled", recordType: "Purchase Invoice", recordId: inv.id, after: { reason } });
}

/** The bills with their Finance state, newest first. */
export async function billsWithState(tx: Tx, where: { orderId?: string; vendorId?: string; from?: Date; to?: Date } = {}) {
  const bills = await tx.purchaseInvoice.findMany({
    where: { ...(where.orderId ? { orderId: where.orderId } : {}), ...(where.vendorId ? { vendorId: where.vendorId } : {}), ...(where.from || where.to ? { billDate: { ...(where.from ? { gte: where.from } : {}), ...(where.to ? { lte: where.to } : {}) } } : {}) },
    orderBy: [{ billDate: "desc" }, { createdAt: "desc" }],
    take: 1000,
  });
  const exps = await tx.expense.findMany({ where: { id: { in: bills.map((b) => b.expenseId) } }, select: { id: true, number: true, status: true, amountPaise: true, paidPaise: true, approvalId: true, billFileId: true } });
  const byId = new Map(exps.map((e) => [e.id, e]));
  return bills.map((b) => ({ bill: b, expense: byId.get(b.expenseId) ?? null }));
}

/** Words for a finished receipt, for the toast. */
export const receiptWords = (r: { receipt: { number: string }; order: { number: string }; units: number; store: string; full: boolean }) =>
  `${r.receipt.number}: ${plural(r.units, "unit")} added to ${r.store}. ${r.order.number} is ${r.full ? "fully received" : "part received"}.`;

/** What is still to come on an order. */
export async function pendingOn(tx: Tx, orderId: string) {
  const lines = await tx.purchaseOrderLine.findMany({ where: { orderId } });
  const items = await tx.item.findMany({ where: { id: { in: lines.map((l) => l.itemId) } } });
  return lines.filter((l) => l.receivedQty < l.qty).map((l) => {
    const i = items.find((x) => x.id === l.itemId)!;
    return `${qtyWords(l.qty - l.receivedQty, i.unit)} of ${i.name}`;
  });
}

export async function financeLimit(tx: Tx, ctx: SchoolContext) {
  return (await financeSettings(tx, ctx)).expenseApproveUpTo;
}

export { day as dayWords };
