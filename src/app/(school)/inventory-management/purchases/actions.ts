"use server";

// Purchases & Vendors (14 §2): requests, orders, goods received, vendor bills
// and payments, and the vendor list. The store keeper raises requests and
// orders, receives goods and records bills; paying a bill is Finance work
// (the Accountant, the Principal), checked here against Finance Management's
// own permission. Vendor bank details are seen and changed only by those who pay.

import { revalidatePath } from "next/cache";
import type { FormState } from "@/lib/forms";
import { flash } from "@/lib/flash";
import { formatDate, formatRupees } from "@/lib/format";
import { requireAction } from "@/lib/current";
import { DOCUMENT_TYPES, saveFile } from "@/lib/files";
import { file } from "@/lib/fees/act";
import { EXPENSE_MODES } from "@/lib/finance/words";
import { invAction, inInventory, need, str, id, optionalId, text, maybe, money, isoDate, on, lines, problemState, InventoryProblem, UUID_RE, type InvWork } from "@/lib/inventory/act";
import { cancelBill, cancelRequest, closeOrder, createOrder, createRequest, payBill, receiveGoods, receiptWords, recordBill } from "@/lib/inventory/purchases";
import { archiveVendor, restoreVendor, saveInventoryVendor } from "@/lib/inventory/vendors";
import { emailPurchaseOrder } from "@/lib/inventory/po-email";
import { BASE, MODULE, rupeesToPaise } from "@/lib/inventory/words";
import type { Action } from "@/lib/permissions";

type S<T = unknown> = FormState<T>;

const notFuture = (w: InvWork, d: Date, field = "date") => {
  if (d > w.today) throw new InventoryProblem("The date cannot be in the future.", field);
  return d;
};

/**
 * Bills and vendors are worked by the store keeper (Inventory's own permission)
 * and by those who pay (Finance Management's permission: the Accountant has
 * only View in Inventory), so the role is checked against the one that applies.
 */
async function storeOrFinance(w: InvWork, action: Action, what: string) {
  if (w.can.purchase) {
    await requireAction(MODULE, action);
    return;
  }
  need(w.can.pay, what);
  await requireAction("finance-management", action === "archive" ? "archive" : "edit");
}

/* ---------- Requests ---------- */

export async function requestAction(_p: S, fd: FormData): Promise<S> {
  return invAction("create", fd, async (w) => {
    need(w.can.purchase, "raise purchase requests");
    const ls = lines(fd).map((l) => {
      const est = l.price ? rupeesToPaise(l.price) : null;
      if (l.price && est === null) throw new InventoryProblem("An estimated price must be an amount in rupees, like 120.", "lines");
      return { itemId: l.itemId, qty: l.qty, estUnitPaise: est };
    });
    return createRequest(w.tx, w.ctx, { lines: ls, neededBy: isoDate(fd, "neededBy", "Needed by", { required: false }), reason: text(fd, "reason", "Reason", { min: 5, max: 300 }), departmentId: optionalId(fd, "departmentId"), estimatePaise: money(fd, "estimate", "Estimated amount", { required: false }), date: w.today });
  }, (r) => ({
    message: r.waiting ? `Request ${r.request.number} sent for approval (about ${formatRupees(r.request.estimatePaise)}, above ${formatRupees(r.limit)}).` : `Request ${r.request.number} approved within the limit. Make the purchase order now.`,
    link: { href: `${BASE}/purchases?tab=requests&request=${r.request.id}`, label: "Open the request" },
  }));
}

export async function cancelRequestAction(_p: S, fd: FormData): Promise<S> {
  return invAction("archive", fd, async (w) => {
    need(w.can.purchase, "cancel purchase requests");
    await cancelRequest(w.tx, w.ctx, id(fd, "requestId", "request"), text(fd, "reason", "Reason", { min: 5, max: 200 }));
  }, () => "Request cancelled. It stays in the list with your reason.");
}

/* ---------- Orders ---------- */

export async function orderAction(_p: S<{ id: string }>, fd: FormData): Promise<S<{ id: string }>> {
  return invAction("create", fd, async (w) => {
    need(w.can.purchase, "make purchase orders");
    const ls = lines(fd).map((l, i) => {
      const p = rupeesToPaise(l.price);
      if (p === null || p <= BigInt(0)) throw new InventoryProblem(`Enter the price per unit on line ${i + 1}.`, "lines");
      return { itemId: l.itemId, qty: l.qty, unitPricePaise: p };
    });
    const r = await createOrder(w.tx, w.ctx, { requestId: optionalId(fd, "requestId"), vendorId: id(fd, "vendorId", "vendor"), locationId: id(fd, "locationId", "store"), expectedOn: isoDate(fd, "expectedOn", "Expected by", { required: false }), lines: ls, note: maybe(fd, "note", "Note", 300), date: w.today });
    return { id: r.order.id, number: r.order.number, waiting: r.waiting, total: r.order.totalPaise, vendor: r.vendor.name };
  }, (r) => ({
    message: r.waiting ? `${r.number} (${formatRupees(r.total)}) is above the approved amount, so it is sent for approval first.` : `${r.number} to ${r.vendor} made: ${formatRupees(r.total)}. Print it or send it by email.`,
    link: { href: `${BASE}/purchases/orders/${r.id}`, label: "Open the order" },
  }));
}

export async function closeOrderAction(_p: S, fd: FormData): Promise<S> {
  return invAction("edit", fd, async (w) => {
    need(w.can.purchase, "close purchase orders");
    return closeOrder(w.tx, w.ctx, id(fd, "orderId", "order"), text(fd, "reason", "Reason", { min: 5, max: 200 }));
  }, () => "Order closed. What was received stays in stock.");
}

/** Sends the order to the vendor by the school's email; the PDF goes as an attachment. */
export async function emailOrderAction(_p: S, fd: FormData): Promise<S> {
  try {
    const orderId = id(fd, "orderId", "order");
    const who = await inInventory("edit", async (w) => {
      need(w.can.purchase, "send purchase orders");
      return { ctx: w.ctx, school: w.current.school.name };
    });
    const r = await emailPurchaseOrder(who.ctx, orderId, str(fd, "to") || null, who.school);
    const message = `${r.number} sent to ${r.to}.`;
    await flash({ message });
    revalidatePath("/", "layout");
    return { ok: true, message };
  } catch (e) {
    return problemState(e, fd);
  }
}

/* ---------- Goods received ---------- */

export async function receiveAction(_p: S, fd: FormData): Promise<S> {
  return invAction("create", fd, async (w) => {
    need(w.can.purchase, "record goods received");
    const ls: { orderLineId: string; qty: number; batchNo: string | null; expiresOn: Date | null }[] = [];
    for (const lineId of fd.getAll("lineId").map(String)) {
      if (!UUID_RE.test(lineId)) continue;
      const raw = str(fd, `recv-${lineId}`).replace(/,/g, "");
      if (!raw) continue;
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > 100_000) throw new InventoryProblem("A quantity received must be a whole number, 0 or more.", `recv-${lineId}`);
      if (n === 0) continue;
      ls.push({ orderLineId: lineId, qty: n, batchNo: maybe(fd, `batch-${lineId}`, "Batch", 40), expiresOn: isoDate(fd, `exp-${lineId}`, "Expiry date", { required: false }) });
    }
    return receiveGoods(w.tx, w.ctx, { orderId: id(fd, "orderId", "order"), date: notFuture(w, isoDate(fd, "date", "Date received")!), locationId: id(fd, "locationId", "store"), lines: ls, extraReason: maybe(fd, "extraReason", "Reason", 200), note: maybe(fd, "note", "Note", 300), today: w.today });
  }, (r) => ({ message: receiptWords(r), link: { href: `${BASE}/purchases/orders/${r.order.id}`, label: "Open the order" } }));
}

/* ---------- Bills and payments ---------- */

export async function billAction(_p: S, fd: FormData): Promise<S> {
  return invAction("view", fd, async (w) => {
    await storeOrFinance(w, "create", "record vendor bills");
    const f = file(fd, "bill");
    const fileId = f ? (await saveFile(w.tx, w.ctx, { file: f, purpose: "inventory-bill", allowed: DOCUMENT_TYPES, maxImageWidth: 1600 })).id : null;
    const r = await recordBill(w.tx, w.ctx, {
      orderId: optionalId(fd, "orderId"), vendorId: optionalId(fd, "vendorId"), billNo: text(fd, "billNo", "Bill number", { max: 40 }), billDate: notFuture(w, isoDate(fd, "billDate", "Bill date")!, "billDate"),
      dueDate: isoDate(fd, "dueDate", "Due date", { required: false }), amountPaise: money(fd, "amount", "Amount")!, fileId, note: maybe(fd, "note", "Note", 200), duplicateReason: maybe(fd, "duplicateReason", "Reason", 200),
    });
    return { number: r.expense.number, billNo: r.invoice.billNo, outcome: r.outcome, over: r.overOrder, amount: r.invoice.amountPaise };
  }, (r) => r.outcome === "approved"
    ? `Bill ${r.billNo} recorded (${formatRupees(r.amount)}) as ${r.number} in Finance, ready to pay.`
    : `Bill ${r.billNo} recorded as ${r.number} and sent for approval${r.over ? ": it is more than the order" : ""}. It can be paid once approved.`);
}

function payOf(fd: FormData, date: Date) {
  const mode = str(fd, "mode");
  if (!EXPENSE_MODES.some((m) => m.value === mode)) throw new InventoryProblem("Choose how it was paid.", "mode");
  const reference = mode === "CASH" ? null : maybe(fd, "reference", "Reference", 60);
  if (mode !== "CASH" && !reference) throw new InventoryProblem(mode === "CHEQUE" ? "Enter the cheque number." : "Enter the transaction or UTR number.", "reference");
  if (reference && !/^[A-Za-z0-9 /.-]{4,60}$/.test(reference)) throw new InventoryProblem("This does not look like a bank reference. Use letters, digits and spaces.", "reference");
  return { date, mode, reference, accountId: mode === "CASH" ? null : optionalId(fd, "accountId"), confirmLowCash: on(fd, "confirmLowCash") };
}

/** Paying a vendor bill is Finance work: Finance Management's edit permission is checked too. */
export async function payBillAction(_p: S, fd: FormData): Promise<S> {
  return invAction("view", fd, async (w) => {
    need(w.can.pay, "pay vendor bills", "the Accountant");
    await requireAction("finance-management", "edit");
    const date = notFuture(w, isoDate(fd, "date", "Date paid")!);
    const r = await payBill(w.tx, w.ctx, id(fd, "invoiceId", "bill"), { ...payOf(fd, date), amountPaise: money(fd, "payAmount", "Amount", { required: false }) });
    const e = await w.tx.expense.findFirstOrThrow({ where: { id: r.expense.id } });
    return { no: e.number, bill: r.bill.billNo, amount: r.payment.amountPaise, date, left: e.amountPaise - e.paidPaise };
  }, (r) => `Bill ${r.bill}: ${formatRupees(r.amount)} paid. In the Day Book for ${formatDate(r.date, "UTC")}.${r.left > BigInt(0) ? ` ${formatRupees(r.left)} still to pay.` : ""}`);
}

export async function cancelBillAction(_p: S, fd: FormData): Promise<S> {
  return invAction("view", fd, async (w) => {
    await storeOrFinance(w, "archive", "cancel vendor bills");
    const invoiceId = id(fd, "invoiceId", "bill");
    const inv = await w.tx.purchaseInvoice.findFirst({ where: { id: invoiceId } });
    const e = inv ? await w.tx.expense.findFirst({ where: { id: inv.expenseId } }) : null;
    if (e && e.paidPaise > BigInt(0)) {
      need(w.can.pay, "cancel a bill that is already paid", "the Accountant");
      await requireAction("finance-management", "archive");
    }
    await cancelBill(w.tx, w.ctx, invoiceId, text(fd, "reason", "Reason", { min: 5, max: 300 }), w.today);
    return Boolean(e && e.paidPaise > BigInt(0));
  }, (paid) => (paid ? "Bill cancelled. A reversal of the payment is in today's Day Book." : "Bill cancelled. Kept with your reason."));
}

/* ---------- Vendors ---------- */

export async function saveVendorAction(_p: S<{ id: string }>, fd: FormData): Promise<S<{ id: string }>> {
  const vendorId = optionalId(fd, "vendorId");
  return invAction("view", fd, async (w) => {
    await storeOrFinance(w, vendorId ? "edit" : "create", vendorId ? "change vendors" : "add vendors");
    const v = await saveInventoryVendor(w.tx, w.ctx, {
      name: text(fd, "name", "Vendor name", { min: 2, max: 120 }), contactName: maybe(fd, "contactName", "Contact person", 80), phone: maybe(fd, "phone", "Phone", 20), email: maybe(fd, "email", "Email", 120),
      gstin: maybe(fd, "gstin", "GSTIN", 20), address: maybe(fd, "address", "Address", 300), itemsSupplied: maybe(fd, "itemsSupplied", "Items supplied", 300),
      bank: w.can.bank ? { bankName: maybe(fd, "bankName", "Bank", 80), accountNo: maybe(fd, "accountNo", "Account number", 24), ifsc: maybe(fd, "ifsc", "IFSC", 11) } : null,
    }, vendorId, { mayChangeBank: w.can.bank });
    return { id: v.id, name: v.name };
  }, (r) => ({ message: `${r.name} saved.`, link: { href: `${BASE}/purchases?tab=vendors&vendor=${r.id}`, label: "Open the vendor" } }));
}

export async function archiveVendorAction(_p: S, fd: FormData): Promise<S> {
  return invAction("archive", fd, async (w) => {
    need(w.can.purchase, "archive vendors");
    await archiveVendor(w.tx, w.ctx, id(fd, "vendorId", "vendor"));
  }, () => "Vendor archived. Their orders and bills stay.");
}

export async function restoreVendorAction(_p: S, fd: FormData): Promise<S> {
  return invAction("edit", fd, async (w) => {
    need(w.can.purchase, "bring vendors back");
    await restoreVendor(w.tx, w.ctx, id(fd, "vendorId", "vendor"));
  }, () => "Vendor brought back.");
}
