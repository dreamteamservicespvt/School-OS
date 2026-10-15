"use server";

// Inventory Management's server actions for Items & Stock, Issue Stock and
// Inventory Settings (14 §2). Each checks the person's role on the server
// (requireAction, then what their page lets them do), runs inside the
// school's walls and answers in plain words. Purchases, Assets and Rooms have
// their own actions files next to their pages.

import type { FormState } from "@/lib/forms";
import { formatRupees } from "@/lib/format";
import { invAction, inInventory, need, str, id, optionalId, ids, text, maybe, int, optionalInt, money, isoDate, on, lines, InventoryProblem, UUID_RE, type InvWork } from "@/lib/inventory/act";
import { addItem, archiveItem, restoreItem, updateItem, type ItemInput, type OpeningLine } from "@/lib/inventory/items";
import { stockIn, stockOut, transferStock, storeKeepers } from "@/lib/inventory/stock";
import { archiveBookSet, giveMissing, issueBookSet, issueStock, returnIssued, saveBookSet } from "@/lib/inventory/issues";
import { saveCounts, startAudit, submitAudit } from "@/lib/inventory/audits";
import { archiveCategory, archiveLocation, saveCategory, saveLocation, saveSettings, inventorySettings } from "@/lib/inventory/settings";
import { searchCounterStudents, type CounterStudent } from "@/lib/inventory/lookup";
import { notify } from "@/lib/notifications";
import "@/lib/approval-handlers";
import { canDecide, decide } from "@/lib/approvals";
import { BASE, DEFAULT_ASSET_TYPES, plural, qtyWords } from "@/lib/inventory/words";

type S<T = unknown> = FormState<T>;

/* ---------- Items ---------- */

function itemInput(fd: FormData): ItemInput {
  return {
    code: maybe(fd, "code", "Item code", 24), name: text(fd, "name", "Item name", { min: 2, max: 120 }), categoryId: id(fd, "categoryId", "category"),
    unit: text(fd, "unit", "Unit", { max: 20 }), size: maybe(fd, "size", "Size", 20), reorderLevel: optionalInt(fd, "reorderLevel", "Reorder level", { max: 100_000 }),
    pricePaise: money(fd, "price", "Price per unit", { required: false }), tracksExpiry: on(fd, "tracksExpiry"), note: maybe(fd, "note", "Note", 300),
  };
}

function openingLines(fd: FormData): OpeningLine[] {
  const locs = fd.getAll("openLoc").map((x) => (typeof x === "string" ? x.trim() : ""));
  const qtys = fd.getAll("openQty").map((x) => (typeof x === "string" ? x.trim().replace(/,/g, "") : ""));
  const out: OpeningLine[] = [];
  qtys.forEach((q, i) => {
    if (!q) return;
    const n = Number(q);
    if (!Number.isInteger(n) || n < 0 || n > 1_000_000) throw new InventoryProblem("Opening stock must be a whole number, 0 or more.", "openQty");
    out.push({ locationId: UUID_RE.test(locs[i] ?? "") ? locs[i] : null, qty: n, batchNo: maybe(fd, "batchNo", "Batch", 40), expiresOn: isoDate(fd, "expiresOn", "Expiry date", { required: false }) });
  });
  return out;
}

export async function saveItemAction(_p: S<{ id: string }>, fd: FormData): Promise<S<{ id: string }>> {
  const itemId = optionalId(fd, "itemId");
  return invAction(itemId ? "edit" : "create", fd, async (w) => {
    need(w.can.stock, itemId ? "change items" : "add items");
    const input = itemInput(fd);
    if (itemId) {
      const it = await updateItem(w.tx, w.ctx, itemId, input);
      return { id: it.id, words: `${it.name} saved.` };
    }
    const opening = openingLines(fd);
    if (input.tracksExpiry && opening.some((o) => o.qty > 0) && !opening[0]?.expiresOn) throw new InventoryProblem("Enter the expiry date of the opening stock.", "expiresOn");
    const r = await addItem(w.tx, w.ctx, input, opening, w.today);
    return { id: r.item.id, words: `${r.item.name} added as ${r.item.code}${r.openingTotal ? `, with ${qtyWords(r.openingTotal, r.item.unit)} in stock` : ""}.` };
  }, (r) => ({ message: r.words, link: { href: `${BASE}/items/${r.id}`, label: "Open the item" } }));
}

export async function archiveItemAction(_p: S, fd: FormData): Promise<S> {
  return invAction("archive", fd, async (w) => {
    need(w.can.stock, "archive items");
    await archiveItem(w.tx, w.ctx, id(fd, "itemId", "item"), text(fd, "reason", "Reason", { min: 5, max: 200 }));
  }, () => "Item archived. Its history stays; its code is never given again.");
}

export async function restoreItemAction(_p: S, fd: FormData): Promise<S> {
  return invAction("edit", fd, async (w) => {
    need(w.can.stock, "bring items back");
    await restoreItem(w.tx, w.ctx, id(fd, "itemId", "item"));
  }, () => "Item brought back.");
}

/* ---------- Stock in, out, write-offs, transfers ---------- */

export async function stockInAction(_p: S, fd: FormData): Promise<S> {
  return invAction("create", fd, async (w) => {
    need(w.can.stock, "record stock in");
    const date = isoDate(fd, "date", "Date")!;
    if (date > w.today) throw new InventoryProblem("The date cannot be in the future.", "date");
    const qty = int(fd, "qty", "Quantity", { min: 1, max: 100_000 });
    const item = await w.tx.item.findFirst({ where: { id: id(fd, "itemId", "item"), archivedAt: null } });
    if (!item) throw new InventoryProblem("Choose the item.", "itemId");
    await stockIn(w.tx, w.ctx, { itemId: item.id, locationId: id(fd, "locationId", "store"), qty, date, source: text(fd, "source", "Where it came from", { min: 3, max: 200 }), unitCostPaise: money(fd, "cost", "Cost per unit", { required: false }), batchNo: maybe(fd, "batchNo", "Batch", 40), expiresOn: isoDate(fd, "expiresOn", "Expiry date", { required: item.tracksExpiry }), today: w.today });
    return `${qtyWords(qty, item.unit)} of ${item.name} added.`;
  }, (m) => m);
}

export async function stockOutAction(_p: S, fd: FormData): Promise<S> {
  return invAction("edit", fd, async (w) => {
    need(w.can.stock, "record stock out");
    const kind = str(fd, "kind");
    if (!["OUT", "DAMAGED", "LOST", "EXPIRED"].includes(kind)) throw new InventoryProblem("Choose what happened to the stock.", "kind");
    const date = isoDate(fd, "date", "Date")!;
    if (date > w.today) throw new InventoryProblem("The date cannot be in the future.", "date");
    const qty = int(fd, "qty", "Quantity", { min: 1, max: 100_000 });
    const item = await w.tx.item.findFirst({ where: { id: id(fd, "itemId", "item") } });
    if (!item) throw new InventoryProblem("Choose the item.", "itemId");
    await stockOut(w.tx, w.ctx, { itemId: item.id, locationId: id(fd, "locationId", "store"), qty, date, kind: kind as "OUT", reason: str(fd, "reason"), batchId: optionalId(fd, "batchId"), today: w.today });
    const what = kind === "OUT" ? "used" : kind.toLowerCase();
    return `${qtyWords(qty, item.unit)} of ${item.name} recorded as ${what}.`;
  }, (m) => m);
}

export async function transferAction(_p: S, fd: FormData): Promise<S> {
  return invAction("edit", fd, async (w) => {
    need(w.can.stock, "transfer stock");
    const date = isoDate(fd, "date", "Date")!;
    if (date > w.today) throw new InventoryProblem("The date cannot be in the future.", "date");
    const r = await transferStock(w.tx, w.ctx, { fromLocationId: id(fd, "fromLocationId", "store the stock leaves"), toLocationId: id(fd, "toLocationId", "store the stock goes to"), lines: lines(fd).map((l) => ({ itemId: l.itemId, qty: l.qty })), date, note: maybe(fd, "note", "Note", 200), today: w.today });
    return r;
  }, (r) => (r.waiting ? `Transfer ${r.transfer.number} sent for approval. Stock moves when it is approved.` : `Transfer ${r.transfer.number} done.`));
}

/* ---------- Book sets ---------- */

export async function saveSetAction(_p: S, fd: FormData): Promise<S> {
  const setId = optionalId(fd, "setId");
  return invAction(setId ? "edit" : "create", fd, async (w) => {
    need(w.can.stock, "make book sets");
    const set = await saveBookSet(w.tx, w.ctx, { id: setId, name: text(fd, "name", "Set name", { min: 3, max: 80 }), classIds: ids(fd, "classIds"), items: lines(fd, { min: 2 }).map((l) => ({ itemId: l.itemId, qty: l.qty })), pricePaise: money(fd, "price", "Set price", { required: false }) });
    return `${set.name} saved at ${formatRupees(set.pricePaise)}.`;
  }, (m) => m);
}

export async function archiveSetAction(_p: S, fd: FormData): Promise<S> {
  return invAction("archive", fd, async (w) => {
    need(w.can.stock, "archive book sets");
    await archiveBookSet(w.tx, w.ctx, id(fd, "setId", "set"));
  }, () => "Book set archived. Sets already issued keep their record.");
}

/* ---------- Stock audits ---------- */

export async function startAuditAction(_p: S<{ id: string }>, fd: FormData): Promise<S<{ id: string }>> {
  return invAction("create", fd, async (w) => {
    need(w.can.stock, "start stock audits");
    const r = await startAudit(w.tx, w.ctx, { locationId: id(fd, "locationId", "store"), name: text(fd, "name", "Name", { min: 3, max: 80 }), categoryId: optionalId(fd, "categoryId"), date: w.today });
    return { id: r.audit.id, n: r.items };
  }, (r) => ({ message: `Audit started with ${plural(r.n, "item")} to count.`, link: { href: `${BASE}/items/audits/${r.id}`, label: "Count now" } }));
}

function countsOf(fd: FormData) {
  const out: { itemId: string; counted: number | null; note: string | null }[] = [];
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("count-") || typeof v !== "string") continue;
    const itemId = k.slice(6);
    if (!UUID_RE.test(itemId)) continue;
    const raw = v.trim().replace(/,/g, "");
    const note = str(fd, `note-${itemId}`) || null;
    if (raw === "") { out.push({ itemId, counted: null, note }); continue; }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) throw new InventoryProblem("A count must be a whole number, 0 or more.", `count-${itemId}`);
    out.push({ itemId, counted: n, note });
  }
  return out;
}

export async function saveCountsAction(_p: S, fd: FormData): Promise<S> {
  const submit = str(fd, "submit") === "1";
  return invAction("edit", fd, async (w) => {
    need(w.can.stock, "count stock");
    const auditId = id(fd, "auditId", "audit");
    const saved = await saveCounts(w.tx, w.ctx, auditId, countsOf(fd));
    if (!submit) return { saved, sent: null };
    return { saved, sent: await submitAudit(w.tx, w.ctx, auditId) };
  }, (r) => {
    if (!r.sent) return `${plural(r.saved, "count")} saved.`;
    if (!r.sent.waiting) return `No differences: the audit is closed${r.sent.uncounted ? ` (${plural(r.sent.uncounted, "item")} not counted)` : ""}.`;
    return `${plural(r.sent.differences, "difference")} waiting for approval. Stock changes only when approved.`;
  });
}

/* ---------- Issue Stock ---------- */

/** Students at the counter, by name or admission number (only for those who issue). */
export async function findStudentsAction(q: string): Promise<CounterStudent[]> {
  try {
    return await inInventory("view", async (w) => {
      if (!w.can.issue) return [];
      return searchCounterStudents(w.tx, w.ctx, String(q ?? "").slice(0, 60));
    });
  } catch {
    return [];
  }
}

async function recipient(w: InvWork, fd: FormData) {
  const toKind = str(fd, "toKind");
  if (!["STAFF", "DEPARTMENT", "CLASS", "STUDENT"].includes(toKind)) throw new InventoryProblem("Choose who the items go to.", "toKind");
  void w;
  return {
    toKind: toKind as "STAFF" | "DEPARTMENT" | "CLASS" | "STUDENT",
    staffId: toKind === "STAFF" ? id(fd, "staffId", "staff member") : null,
    departmentId: toKind === "DEPARTMENT" ? id(fd, "departmentId", "department") : null,
    sectionId: toKind === "CLASS" ? id(fd, "sectionId", "class") : null,
    studentId: toKind === "STUDENT" ? id(fd, "studentId", "student") : null,
  };
}

export async function issueAction(_p: S, fd: FormData): Promise<S> {
  let undoId = "";
  return invAction("create", fd, async (w) => {
    need(w.can.issue, "issue stock");
    const r = await recipient(w, fd);
    const date = isoDate(fd, "date", "Date", { required: false }) ?? w.today;
    if (date > w.today) throw new InventoryProblem("The date cannot be in the future.", "date");
    const out = await issueStock(w.tx, w.ctx, { ...r, locationId: id(fd, "locationId", "store"), lines: lines(fd).map((l) => ({ itemId: l.itemId, qty: l.qty })), chargeToFees: r.toKind === "STUDENT" && on(fd, "chargeToFees"), returnable: on(fd, "returnable"), note: maybe(fd, "note", "Note", 300), date, today: w.today });
    undoId = out.issue.id;
    return out;
  }, (r) => ({ message: `${r.issue.number}: issued to ${r.to}${r.total > BigInt(0) ? `. ${formatRupees(r.total)} added to the student's fees` : ""}.`, undo: { kind: "inv-issue", id: undoId } }));
}

export async function issueSetAction(_p: S, fd: FormData): Promise<S> {
  let undoId = "";
  return invAction("create", fd, async (w) => {
    need(w.can.issue, "issue book sets");
    const out = await issueBookSet(w.tx, w.ctx, { setId: id(fd, "setId", "set"), studentId: id(fd, "studentId", "student"), locationId: id(fd, "locationId", "store"), chargeToFees: on(fd, "chargeToFees"), allowMissing: on(fd, "allowMissing"), note: maybe(fd, "note", "Note", 300), date: w.today, today: w.today });
    undoId = out.issue.id;
    return out;
  }, (r) => ({
    message: `${r.set.name} issued to ${r.to}${r.issue.chargePaise > BigInt(0) ? `. ${formatRupees(r.issue.chargePaise)} added to the fees` : ""}.${r.missing.length ? ` ${plural(r.missing.length, "item")} to give later: ${r.missing.map((m) => m.name).join(", ")}.` : ""}`,
    undo: { kind: "inv-issue", id: undoId },
  }));
}

export async function giveMissingAction(_p: S, fd: FormData): Promise<S> {
  return invAction("edit", fd, async (w) => {
    need(w.can.issue, "issue stock");
    return giveMissing(w.tx, w.ctx, id(fd, "issueId", "issue"), w.today);
  }, (r) => (r.still ? `${plural(r.given, "item")} given; ${plural(r.still, "item")} still to come.` : `${plural(r.given, "item")} given. The set is complete.`));
}

export async function returnAction(_p: S, fd: FormData): Promise<S> {
  return invAction("edit", fd, async (w) => {
    need(w.can.issue, "record returns");
    return returnIssued(w.tx, w.ctx, { lineId: id(fd, "lineId", "item"), qty: int(fd, "qty", "Quantity", { min: 1 }), note: maybe(fd, "note", "Note", 200), date: w.today, today: w.today });
  }, (r) => `${r.words} of ${r.item.name} back in the store${r.left ? `; ${r.left} still out` : ""}.`);
}

/* ---------- Remind (leaders) ---------- */

/** The Principal's or School Admin's Remind: the store keeper is told in the app. */
export async function remindStoreAction(_p: S, fd: FormData): Promise<S> {
  return invAction("view", fd, async (w) => {
    need(w.can.remind, "remind the store keeper", "the School Admin");
    const what = str(fd, "what");
    const words: Record<string, [string, string]> = {
      low: ["Please raise purchase requests for the items at or below their reorder level.", `${BASE}/items?state=low`],
      maintenance: ["Please follow up on the open maintenance requests.", `${BASE}/rooms?tab=maintenance`],
      orders: ["Please follow up on the purchase orders waiting for goods.", `${BASE}/purchases?tab=orders&status=open`],
      audit: ["Please finish the stock audit that is still being counted.", `${BASE}/items?view=audits`],
    };
    const [text0, link] = words[what] ?? words.low;
    const keepers = (await storeKeepers(w.tx, w.ctx)).filter((p) => p !== w.ctx.userId);
    if (!keepers.length) throw new InventoryProblem("There is no Store Keeper login to remind yet. Add one in Settings, Users & Permissions.");
    for (const to of keepers) await notify(w.tx, w.ctx, { to, type: "inventory-remind", text: `${w.current.user.displayName}: ${text0}`, link, groupKey: "inventory-remind", mergedText: (n) => `${n} reminders about the store` });
    return keepers.length;
  }, (n) => `Reminder sent to the store keeper${n === 1 ? "" : "s"}.`);
}

/* ---------- Inventory Settings ---------- */

export async function saveSettingsAction(_p: S, fd: FormData): Promise<S> {
  return invAction("edit", fd, async (w) => {
    need(w.can.settings, "change Inventory Settings", "the School Admin");
    const before = await inventorySettings(w.tx, w.ctx);
    const types = str(fd, "assetTypes").split(/[,\n]/).map((t) => t.trim()).filter(Boolean);
    const rates: Record<string, number> = {};
    for (const t of types.length ? types : DEFAULT_ASSET_TYPES) {
      const raw = str(fd, `rate-${t}`);
      if (raw) {
        const n = Number(raw);
        if (!Number.isFinite(n)) throw new InventoryProblem(`The rate for ${t} must be a number from 0 to 100.`, `rate-${t}`);
        rates[t] = n;
      } else if (before.rates[t] !== undefined) rates[t] = before.rates[t];
    }
    const method = str(fd, "depreciationMethod");
    await saveSettings(w.tx, w.ctx, {
      itemCodePrefix: str(fd, "itemCodePrefix"), itemCodeWidth: int(fd, "itemCodeWidth", "Digits in item codes", { min: 3, max: 8 }),
      assetTagPrefix: str(fd, "assetTagPrefix"), assetTagWidth: int(fd, "assetTagWidth", "Digits in asset tags", { min: 3, max: 8 }),
      poPrefix: str(fd, "poPrefix"), approveUpToPaise: money(fd, "approveUpTo", "Approval limit")!, transfersNeedApproval: on(fd, "transfersNeedApproval"),
      depreciationMethod: method === "WDV" ? "WDV" : "SLM", rates, assetTypes: types, units: str(fd, "units").split(/[,\n]/),
      warrantyReminderDays: int(fd, "warrantyReminderDays", "Reminder days", { min: 1, max: 180 }), lowStockAlerts: on(fd, "lowStockAlerts"),
      bookSetsOn: on(fd, "bookSetsOn"), setsWithMissing: on(fd, "setsWithMissing"), defaultExpenseHeadId: optionalId(fd, "defaultExpenseHeadId"),
    });
  }, () => "Inventory Settings saved.");
}

export async function saveCategoryAction(_p: S, fd: FormData): Promise<S> {
  return invAction("edit", fd, async (w) => {
    need(w.can.settings, "change item categories", "the School Admin");
    const c = await saveCategory(w.tx, w.ctx, { id: optionalId(fd, "categoryId"), name: text(fd, "name", "Name", { min: 2, max: 60 }), isLab: on(fd, "isLab"), defaultReorderLevel: int(fd, "defaultReorderLevel", "Reorder level", { fallback: 0, max: 100_000 }), expenseHeadId: optionalId(fd, "expenseHeadId") });
    return c.name;
  }, (n) => `Category ${n} saved.`);
}

export async function archiveCategoryAction(_p: S, fd: FormData): Promise<S> {
  return invAction("archive", fd, async (w) => {
    need(w.can.settings, "change item categories", "the School Admin");
    await archiveCategory(w.tx, w.ctx, id(fd, "categoryId", "category"));
  }, () => "Category archived.");
}

export async function saveLocationAction(_p: S, fd: FormData): Promise<S> {
  return invAction("edit", fd, async (w) => {
    need(w.can.settings, "change store locations", "the School Admin");
    const l = await saveLocation(w.tx, w.ctx, { id: optionalId(fd, "locationId"), name: text(fd, "name", "Name", { min: 2, max: 60 }), isMain: on(fd, "isMain") });
    return l.name;
  }, (n) => `Store ${n} saved.`);
}

export async function archiveLocationAction(_p: S, fd: FormData): Promise<S> {
  return invAction("archive", fd, async (w) => {
    need(w.can.settings, "change store locations", "the School Admin");
    await archiveLocation(w.tx, w.ctx, id(fd, "locationId", "store"));
  }, () => "Store archived.");
}

/* ---------- Approvals decided on the page ---------- */

const INV_APPROVALS = ["purchase", "stock-transfer", "stock-audit", "asset-disposal"];

/** The approver decides here instead of in the top bar's Approvals (the same rules: never their own request). */
export async function decideAction(_p: S, fd: FormData): Promise<S> {
  let decision: "approve" | "reject" = "approve";
  return invAction("view", fd, async (w) => {
    const approval = await w.tx.approval.findFirst({ where: { id: id(fd, "approvalId", "request") } });
    if (!approval || !INV_APPROVALS.includes(approval.type)) throw new InventoryProblem("This request was not found.");
    if (!(await canDecide(w.tx, w.ctx, approval))) throw new InventoryProblem(approval.askedById === w.ctx.userId ? "You asked for this, so someone else approves it." : "This is waiting for someone else's approval.");
    decision = str(fd, "decision") === "reject" ? "reject" : "approve";
    await decide(w.tx, w.ctx, approval.id, decision, decision === "reject" ? text(fd, "note", "Reason", { min: 5, max: 300 }) : maybe(fd, "note", "Note", 300));
    return approval.summary;
  }, (what) => (decision === "approve" ? `Approved: ${what}` : `Not approved: ${what}`));
}
