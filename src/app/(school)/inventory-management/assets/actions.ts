"use server";

// Assets (14 §2): add (by hand or from a goods receipt), change, assign and
// transfer (history kept), the repair log (cost to Finance), disposal with
// approval, linked stock items, and the asset audit (scan room by room).

import type { FormState } from "@/lib/forms";
import { formatRupees } from "@/lib/format";
import { DOCUMENT_TYPES, saveFile } from "@/lib/files";
import { file } from "@/lib/fees/act";
import { invAction, need, str, id, optionalId, text, maybe, int, money, isoDate, on, InventoryProblem, type InvWork } from "@/lib/inventory/act";
import { addAssets, addRepair, assignAsset, closeAssetAudit, linkItem, requestDisposal, scanTag, startAssetAudit, unlinkItem, updateAsset, updateRepair, type Place } from "@/lib/inventory/assets";
import { BASE, DISPOSAL_METHOD, plural } from "@/lib/inventory/words";

type S<T = unknown> = FormState<T>;

function placeOf(fd: FormData): Place {
  const kind = str(fd, "placeKind");
  if (kind === "ROOM") return { roomId: id(fd, "roomId", "room"), departmentId: null, staffId: null };
  if (kind === "DEPARTMENT") return { roomId: null, departmentId: id(fd, "departmentId", "department"), staffId: null };
  if (kind === "STAFF") return { roomId: null, departmentId: null, staffId: id(fd, "staffId", "staff member") };
  throw new InventoryProblem("Choose where the asset is: a room, a department or a person.", "placeKind");
}

const notFuture = (w: InvWork, d: Date | null, field: string) => {
  if (d && d > w.today) throw new InventoryProblem("The date cannot be in the future.", field);
  return d;
};

function details(w: InvWork, fd: FormData) {
  return {
    name: text(fd, "name", "Asset name", { min: 2, max: 120 }), type: str(fd, "type"), tag: maybe(fd, "tag", "Asset tag", 24), serialNo: maybe(fd, "serialNo", "Serial number", 60),
    purchaseDate: notFuture(w, isoDate(fd, "purchaseDate", "Purchase date", { required: false }), "purchaseDate"), costPaise: money(fd, "cost", "Cost", { required: false }), vendorId: optionalId(fd, "vendorId"),
    warrantyEnd: isoDate(fd, "warrantyEnd", "Warranty end", { required: false }), amcEnd: isoDate(fd, "amcEnd", "AMC end", { required: false }), condition: str(fd, "condition") || "Good", note: maybe(fd, "note", "Note", 300),
  };
}

export async function addAssetAction(_p: S<{ id: string }>, fd: FormData): Promise<S<{ id: string }>> {
  return invAction("create", fd, async (w) => {
    need(w.can.assets, "add assets");
    const count = int(fd, "count", "How many", { min: 1, max: 100, fallback: 1 });
    const made = await addAssets(w.tx, w.ctx, { ...details(w, fd), ...placeOf(fd), receiptId: optionalId(fd, "receiptId"), itemId: optionalId(fd, "itemId") }, count);
    return { id: made[0].id, tags: made.map((a) => a.tag), name: made[0].name };
  }, (r) => ({
    message: r.tags.length === 1 ? `${r.name} added as ${r.tags[0]}.` : `${plural(r.tags.length, "asset")} added: ${r.tags[0]} to ${r.tags[r.tags.length - 1]}.`,
    link: r.tags.length === 1 ? { href: `${BASE}/assets/${r.id}`, label: "Open the asset" } : { href: `${BASE}/assets/tags?from=${encodeURIComponent(r.tags[0])}&to=${encodeURIComponent(r.tags[r.tags.length - 1])}`, label: "Print the tags" },
  }));
}

export async function updateAssetAction(_p: S, fd: FormData): Promise<S> {
  return invAction("edit", fd, async (w) => {
    need(w.can.assets, "change assets");
    const rate = str(fd, "depreciationRate");
    const a = await updateAsset(w.tx, w.ctx, id(fd, "assetId", "asset"), details(w, fd));
    if (rate) {
      const n = Number(rate);
      if (!Number.isFinite(n) || n < 0 || n > 100) throw new InventoryProblem("The rate must be a number from 0 to 100.", "depreciationRate");
      await w.tx.asset.update({ where: { id: a.id }, data: { depreciationRate: Math.round(n) } });
    } else if (a.depreciationRate !== null) await w.tx.asset.update({ where: { id: a.id }, data: { depreciationRate: null } });
    return a.name;
  }, (n) => `${n} saved.`);
}

export async function assignAction(_p: S, fd: FormData): Promise<S> {
  return invAction("edit", fd, async (w) => {
    need(w.can.assets, "move assets");
    const date = notFuture(w, isoDate(fd, "date", "Date")!, "date")!;
    return assignAsset(w.tx, w.ctx, id(fd, "assetId", "asset"), placeOf(fd), date, maybe(fd, "reason", "Reason", 200));
  }, (r) => `${r.asset.name} ${r.asset.tag} moved from ${r.from} to ${r.to}.`);
}

/* ---------- Repairs ---------- */

export async function addRepairAction(_p: S, fd: FormData): Promise<S> {
  return invAction("create", fd, async (w) => {
    need(w.can.assets, "log repairs");
    const date = notFuture(w, isoDate(fd, "date", "Date")!, "date")!;
    await addRepair(w.tx, w.ctx, { assetId: id(fd, "assetId", "asset"), date, problem: text(fd, "problem", "Problem", { min: 3, max: 300 }), vendorId: optionalId(fd, "vendorId"), note: maybe(fd, "note", "Note", 300) });
  }, () => "Repair logged. The asset shows as In repair until it is closed.");
}

export async function updateRepairAction(_p: S, fd: FormData): Promise<S> {
  return invAction("edit", fd, async (w) => {
    need(w.can.assets, "update repairs");
    const status = str(fd, "status");
    if (!["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"].includes(status)) throw new InventoryProblem("Choose the status.", "status");
    const f = file(fd, "bill");
    const billFileId = f ? (await saveFile(w.tx, w.ctx, { file: f, purpose: "inventory-repair-bill", allowed: DOCUMENT_TYPES, maxImageWidth: 1600 })).id : null;
    return updateRepair(w.tx, w.ctx, id(fd, "logId", "repair"), {
      status: status as "DONE", doneOn: notFuture(w, isoDate(fd, "doneOn", "Done on", { required: status === "DONE" }), "doneOn"), costPaise: money(fd, "cost", "Cost", { required: false }), vendorId: optionalId(fd, "vendorId"),
      note: maybe(fd, "note", "Note", 300), toFinance: on(fd, "toFinance"), billFileId, billNo: maybe(fd, "billNo", "Bill number", 40), duplicateReason: maybe(fd, "duplicateReason", "Reason", 200),
    });
  }, (r) => (r.expenseId ? `Repair closed. The cost is in Finance as an expense${r.outcome === "waiting" ? ", waiting for approval" : ""}.` : "Repair updated."));
}

/* ---------- Disposal ---------- */

export async function disposeAction(_p: S, fd: FormData): Promise<S> {
  return invAction("archive", fd, async (w) => {
    need(w.can.assets, "dispose of assets");
    const method = str(fd, "method");
    if (!DISPOSAL_METHOD[method]) throw new InventoryProblem("Choose sold, scrapped or donated.", "method");
    const sold = method === "SOLD";
    return requestDisposal(w.tx, w.ctx, {
      assetId: id(fd, "assetId", "asset"), method, reason: text(fd, "reason", "Reason", { min: 5, max: 300 }), date: notFuture(w, isoDate(fd, "date", "Date")!, "date")!,
      salePaise: sold ? money(fd, "sale", "Sale amount")! : null, buyer: sold ? maybe(fd, "buyer", "Buyer", 120) : null, saleMode: sold ? str(fd, "saleMode") || "CASH" : null, saleRef: sold ? maybe(fd, "saleRef", "Reference", 60) : null,
    });
  }, (r) => `Disposal of ${r.asset.name} ${r.asset.tag} sent for approval. It stays in use until approved${r.disposal.salePaise ? `; the sale (${formatRupees(r.disposal.salePaise)}) then goes to Finance as income` : ""}.`);
}

/* ---------- Linked stock items ---------- */

export async function linkItemAction(_p: S, fd: FormData): Promise<S> {
  return invAction("edit", fd, async (w) => {
    need(w.can.assets, "link items to assets");
    await linkItem(w.tx, w.ctx, id(fd, "assetId", "asset"), id(fd, "itemId", "item"), maybe(fd, "note", "Note", 200));
  }, () => "Item linked.");
}

export async function unlinkItemAction(_p: S, fd: FormData): Promise<S> {
  return invAction("edit", fd, async (w) => {
    need(w.can.assets, "unlink items");
    await unlinkItem(w.tx, w.ctx, id(fd, "linkId", "link"));
  }, () => "Item unlinked.");
}

/* ---------- Asset audit ---------- */

export async function startAssetAuditAction(_p: S<{ id: string }>, fd: FormData): Promise<S<{ id: string }>> {
  return invAction("create", fd, async (w) => {
    need(w.can.assets, "start asset checks");
    const a = await startAssetAudit(w.tx, w.ctx, { name: text(fd, "name", "Name", { min: 3, max: 80 }), roomId: optionalId(fd, "roomId") });
    return { id: a.id };
  }, (r) => ({ message: "Asset check started. Scan the tags room by room.", link: { href: `${BASE}/assets?view=audit&audit=${r.id}`, label: "Scan now" } }));
}

export async function scanTagAction(_p: S, fd: FormData): Promise<S> {
  return invAction("edit", fd, async (w) => {
    need(w.can.assets, "scan asset tags");
    return scanTag(w.tx, w.ctx, { auditId: id(fd, "auditId", "check"), code: text(fd, "code", "Tag", { max: 40 }), roomId: id(fd, "roomId", "room") });
  }, (r) => {
    const a = r.asset;
    if (r.result === "found") return `${a!.tag} ${a!.name}: found in its place.`;
    if (r.result === "misplaced") return `${a!.tag} ${a!.name}: found in ${r.room.name}, not where the register says.`;
    if (r.result === "disposed") return `${a!.tag} ${a!.name} is disposed in the register but was found here.`;
    if (r.result === "again") return `${a?.tag ?? "This tag"} was already scanned in this check.`;
    return "This tag is not in the register.";
  });
}

export async function closeAssetAuditAction(_p: S, fd: FormData): Promise<S> {
  return invAction("edit", fd, async (w) => {
    need(w.can.assets, "close asset checks");
    return closeAssetAudit(w.tx, w.ctx, id(fd, "auditId", "check"));
  }, () => "Asset check closed. The missing and misplaced list is kept with it.");
}
