"use client";

// Items & Stock and Inventory Settings sheets (forms opened by the page
// address, P4 and P7). Each keeps what was typed when a check fails and
// shows the problem next to its field. The server checks everything again.

import { useState } from "react";
import { SheetForm, useTyped } from "@/components/ui/url-sheet";
import { SArea, SChips, SDate, SMoney, SSelect, SSwitch, SText } from "@/components/ui/sheet-fields";
import { Alert } from "@/components/ui/alert";
import { ItemLines, SegField, type ItemPick, type LineStart } from "./client";
import {
  archiveCategoryAction, archiveItemAction, archiveLocationAction, saveCategoryAction, saveItemAction, saveLocationAction, saveSetAction, startAuditAction,
  returnAction, stockInAction, stockOutAction, transferAction,
} from "../actions";

type Opt = { value: string; label: string };

/* ---------- Items ---------- */

export type ItemStart = { id: string; code: string; name: string; categoryId: string; unit: string; size: string; reorderLevel: string; price: string; tracksExpiry: boolean; note: string };

export function ItemSheet({ closeHref, doneHref, categories, units, stores, start, nextCode, labCategories }: { closeHref: string; doneHref?: string; categories: (Opt & { reorder: number })[]; units: string[]; stores: Opt[]; start: ItemStart | null; nextCode: string; labCategories: string[] }) {
  const editing = Boolean(start);
  const cat = useTyped("categoryId", start?.categoryId ?? "");
  const [catId, setCatId] = useState(cat.value);
  const expiry = useTyped("tracksExpiry", start?.tracksExpiry ? "on" : "");
  const [tracks, setTracks] = useState(expiry.value === "on" || (!start && labCategories.includes(cat.value)));
  const [storeRows, setStoreRows] = useState(1);
  const reorderHint = categories.find((c) => c.value === catId)?.reorder ?? 0;
  return (
    <SheetForm title={editing ? `Change ${start!.name}` : "Add an item"} sub={editing ? start!.code : "The code is given in sequence unless you type one."} closeHref={closeHref} doneHref={doneHref}
      action={saveItemAction} submitLabel={editing ? "Save" : "Add item"} pendingText="Saving…" hidden={start ? { itemId: start.id } : undefined}>
      <div className="grid grid-cols-[1fr_140px] gap-3">
        <SText name="name" label="Item name" required maxLength={120} start={start?.name} placeholder="A4 notebook, 200 pages" />
        <SText name="code" label="Item code" maxLength={24} start={start?.code} placeholder={nextCode} className="[&_input]:font-mono" help={editing ? undefined : `Empty: ${nextCode}`} />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="item-cat" className="text-[13px] font-semibold text-ink2">Category <span className="text-bad" aria-hidden="true">*</span></label>
          <select key={cat.key} id="item-cat" name="categoryId" defaultValue={cat.value} onChange={(e) => { setCatId(e.target.value); if (!editing && labCategories.includes(e.target.value)) setTracks(true); }}
            aria-invalid={cat.error ? true : undefined} className="h-11 rounded-xl border border-line bg-surface px-3 text-[14.5px] aria-[invalid=true]:border-bad">
            <option value="">Choose the category</option>
            {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          {cat.error && <p className="text-[12.5px] text-bad">{cat.error}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SSelect name="unit" label="Unit" required start={start?.unit ?? "piece"} options={units.map((u) => ({ value: u, label: u }))} />
          <SText name="size" label="Size" maxLength={20} start={start?.size} placeholder="M, 28" help="Uniforms" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SText name="reorderLevel" label="Reorder level" type="number" min={0} start={start?.reorderLevel} placeholder={String(reorderHint)} help={`Empty: the category's (${reorderHint}). 0: no alert.`} />
        <SMoney name="price" label="Price per unit" start={start?.price} help="For stock value and fee charges" />
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-line px-4 py-3">
        <div className="min-w-0 flex-1 text-[14px]">
          <b className="font-semibold block">Expiry tracking</b>
          <span className="block text-[12.5px] text-ink3 mt-0.5">For chemicals and perishables: stock is kept by batch, and expired stock cannot be issued.</span>
        </div>
        <input type="checkbox" name="tracksExpiry" checked={tracks} onChange={(e) => setTracks(e.target.checked)} className="size-5 accent-[var(--brand)]" aria-label="Expiry tracking" />
      </div>
      {!editing && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-[13px] font-semibold text-ink2 mb-1.5">Opening stock</legend>
          {Array.from({ length: storeRows }, (_, i) => (
            <div key={i} className="grid grid-cols-[1fr_110px] gap-2">
              <label className="sr-only" htmlFor={`open-loc-${i}`}>Store {i + 1}</label>
              <select id={`open-loc-${i}`} name="openLoc" defaultValue={stores[i]?.value ?? stores[0]?.value} className="h-11 rounded-xl border border-line bg-surface px-3 text-[14.5px]">
                {stores.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
              <label className="sr-only" htmlFor={`open-qty-${i}`}>Quantity in store {i + 1}</label>
              <input id={`open-qty-${i}`} name="openQty" inputMode="numeric" placeholder="0" className="h-11 rounded-xl border border-line bg-surface px-3 text-right tnum text-[14.5px]" />
            </div>
          ))}
          {storeRows < stores.length && <button type="button" className="self-start text-[13px] font-semibold text-brand hover:underline" onClick={() => setStoreRows((n) => n + 1)}>Add stock in another store</button>}
          {tracks && (
            <div className="grid grid-cols-2 gap-3 mt-1">
              <SText name="batchNo" label="Batch" maxLength={40} placeholder="Optional" />
              <SDate name="expiresOn" label="Expiry date" help="Of the opening stock" />
            </div>
          )}
          <p className="text-[12.5px] text-ink3">Empty or 0: no stock yet. Stock comes in later with Stock in or a purchase order.</p>
        </fieldset>
      )}
      <SArea name="note" label="Note" maxLength={300} start={start?.note} placeholder="Optional" />
    </SheetForm>
  );
}

export function ArchiveItemSheet({ closeHref, itemId, name }: { closeHref: string; itemId: string; name: string }) {
  return (
    <SheetForm title={`Archive ${name}`} sub="Only an item with no stock left can be archived. Its movements stay; its code is never given again." closeHref={closeHref} action={archiveItemAction} submitLabel="Archive item" submitVariant="danger" hidden={{ itemId }}>
      <SArea name="reason" label="Reason" required maxLength={200} placeholder="For example: no longer stocked" />
    </SheetForm>
  );
}

/* ---------- Stock in, out, transfers ---------- */

export function StockInSheet({ closeHref, items, stores, start, today }: { closeHref: string; items: ItemPick[]; stores: Opt[]; start: { itemId: string; locationId: string }; today: string }) {
  const it = useTyped("itemId", start.itemId);
  const [itemId, setItemId] = useState(it.value);
  const expiry = items.find((i) => i.value === itemId)?.tracksExpiry ?? false;
  return (
    <SheetForm title="Stock in" sub="Stock that came without a purchase order: a donation, a return, a found box." closeHref={closeHref} action={stockInAction} submitLabel="Add to stock" pendingText="Saving…">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="in-item" className="text-[13px] font-semibold text-ink2">Item <span className="text-bad" aria-hidden="true">*</span></label>
        <select key={it.key} id="in-item" name="itemId" defaultValue={it.value} onChange={(e) => setItemId(e.target.value)} aria-invalid={it.error ? true : undefined} className="h-11 rounded-xl border border-line bg-surface px-3 text-[14.5px]">
          <option value="">Choose the item</option>
          {items.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {it.error && <p className="text-[12.5px] text-bad">{it.error}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SSelect name="locationId" label="Store" required start={start.locationId} options={stores} />
        <SText name="qty" label="Quantity" required inputMode="numeric" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SDate name="date" label="Date" required start={today} max={today} />
        <SMoney name="cost" label="Cost per unit" help="Optional" />
      </div>
      <SText name="source" label="Where it came from" required maxLength={200} placeholder="For example: donated by the Parents' Association" />
      {expiry && (
        <div className="grid grid-cols-2 gap-3">
          <SText name="batchNo" label="Batch" maxLength={40} placeholder="Optional" />
          <SDate name="expiresOn" label="Expiry date" required />
        </div>
      )}
    </SheetForm>
  );
}

export type BatchOpt = { id: string; itemId: string; locationId: string; label: string };

const OUT_KINDS = [
  { value: "OUT", label: "Used" },
  { value: "DAMAGED", label: "Damaged" },
  { value: "LOST", label: "Lost" },
  { value: "EXPIRED", label: "Expired" },
];

export function StockOutSheet({ closeHref, items, stores, batches, start, today }: { closeHref: string; items: ItemPick[]; stores: Opt[]; batches: BatchOpt[]; start: { itemId: string; locationId: string; kind: string }; today: string }) {
  const it = useTyped("itemId", start.itemId);
  const loc = useTyped("locationId", start.locationId);
  const [itemId, setItemId] = useState(it.value);
  const [locId, setLocId] = useState(loc.value);
  const [kind, setKind] = useState(start.kind || "OUT");
  const itemBatches = batches.filter((b) => b.itemId === itemId && b.locationId === locId);
  return (
    <SheetForm title={kind === "OUT" ? "Stock out" : "Write off stock"} sub={kind === "OUT" ? "Stock used up, for example cleaning material for the month." : "Damaged, lost or expired stock leaves the store with a reason. It is never deleted from the history."}
      closeHref={closeHref} action={stockOutAction} submitLabel={kind === "OUT" ? "Record stock out" : `Record as ${kind.toLowerCase()}`} submitVariant={kind === "OUT" ? "primary" : "danger"}>
      <SegField name="kind" label="What happened" start={start.kind || "OUT"} options={OUT_KINDS} onChange={setKind} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="out-item" className="text-[13px] font-semibold text-ink2">Item <span className="text-bad" aria-hidden="true">*</span></label>
        <select key={it.key} id="out-item" name="itemId" defaultValue={it.value} onChange={(e) => setItemId(e.target.value)} aria-invalid={it.error ? true : undefined} className="h-11 rounded-xl border border-line bg-surface px-3 text-[14.5px]">
          <option value="">Choose the item</option>
          {items.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {it.error && <p className="text-[12.5px] text-bad">{it.error}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="out-store" className="text-[13px] font-semibold text-ink2">Store <span className="text-bad" aria-hidden="true">*</span></label>
          <select key={loc.key} id="out-store" name="locationId" defaultValue={loc.value} onChange={(e) => setLocId(e.target.value)} className="h-11 rounded-xl border border-line bg-surface px-3 text-[14.5px]">
            {stores.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <SText name="qty" label="Quantity" required inputMode="numeric" />
      </div>
      {itemBatches.length > 0 && (
        <SSelect name="batchId" label="Batch" options={itemBatches.map((b) => ({ value: b.id, label: b.label }))} placeholder="Oldest expiry first" help={kind === "EXPIRED" ? "Choose the expired batch." : undefined} />
      )}
      <SDate name="date" label="Date" required start={today} max={today} />
      <SArea name="reason" label={kind === "OUT" ? "What it was used for" : "Reason"} required={kind !== "OUT"} maxLength={300} placeholder={kind === "OUT" ? "Optional" : kind === "DAMAGED" ? "For example: water leak in the store" : kind === "LOST" ? "For example: not found in the stock count" : "For example: batch expired on 01-09-2026"} />
    </SheetForm>
  );
}

export function TransferSheet({ closeHref, items, stores, stockBy, start, today, needsApproval }: { closeHref: string; items: ItemPick[]; stores: Opt[]; stockBy: Record<string, Record<string, number>>; start: { from: string; lines: LineStart[] }; today: string; needsApproval: boolean }) {
  const from = useTyped("fromLocationId", start.from);
  const [fromId, setFromId] = useState(from.value);
  return (
    <SheetForm title="Transfer stock" sub={needsApproval ? "Transfers wait for approval; stock moves when approved." : "Stock moves from one store to the other at once."} closeHref={closeHref} action={transferAction} submitLabel={needsApproval ? "Send for approval" : "Transfer"} wide>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="tr-from" className="text-[13px] font-semibold text-ink2">From store <span className="text-bad" aria-hidden="true">*</span></label>
          <select key={from.key} id="tr-from" name="fromLocationId" defaultValue={from.value} onChange={(e) => setFromId(e.target.value)} className="h-11 rounded-xl border border-line bg-surface px-3 text-[14.5px]">
            {stores.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <SSelect name="toLocationId" label="To store" required options={stores} start={stores.find((s) => s.value !== start.from)?.value ?? ""} placeholder="Choose the store" />
      </div>
      <ItemLines items={items} start={start.lines} limit stockAt={(id) => stockBy[id]?.[fromId] ?? 0} help="Cannot be more than the stock in the store it leaves." />
      <div className="grid grid-cols-2 gap-3">
        <SDate name="date" label="Date" required start={today} max={today} />
        <SText name="note" label="Note" maxLength={200} placeholder="Optional" />
      </div>
    </SheetForm>
  );
}

/* ---------- Book sets ---------- */

export type SetStart = { id: string; name: string; classIds: string[]; lines: LineStart[]; price: string };

export function SetSheet({ closeHref, items, classes, start }: { closeHref: string; items: ItemPick[]; classes: Opt[]; start: SetStart | null }) {
  const [total, setTotal] = useState(0);
  const [unit] = useState(() => Object.fromEntries(items.map((i) => [i.value, Math.round((Number(i.price) || 0) * 100)])));
  return (
    <SheetForm title={start ? `Change ${start.name}` : "Make a book set"} sub="Items issued together, for example a class's textbooks and notebooks, or a uniform set." closeHref={closeHref} action={saveSetAction} submitLabel="Save set" hidden={start ? { setId: start.id } : undefined} wide>
      <SText name="name" label="Set name" required maxLength={80} start={start?.name} placeholder="Class 5 book set 2026-27" />
      <ItemLines items={items} start={start?.lines} minRows={2} unitPaise={unit} onTotal={setTotal} label="Items and quantities" help="At least 2 items." />
      <SMoney name="price" label="Set price" start={start?.price} placeholder={total ? (total / 100).toFixed(0) : ""} help={`Empty: the total of the item prices${total ? ` (₹${(total / 100).toLocaleString("en-IN")})` : ""}. Charged to the student's fees when issued.`} />
      <SChips name="classIds" label="For classes" options={classes} start={start?.classIds ?? []} help="Offered first when issuing to a student of these classes." />
    </SheetForm>
  );
}

/* ---------- Stock audits ---------- */

export function StartAuditSheet({ closeHref, stores, categories, suggested }: { closeHref: string; stores: Opt[]; categories: Opt[]; suggested: string }) {
  return (
    <SheetForm title="Start a stock audit" sub="Count each item in one store. Differences change stock only after approval." closeHref={closeHref} action={startAuditAction} submitLabel="Start audit">
      <SText name="name" label="Name" required maxLength={80} start={suggested} />
      <SSelect name="locationId" label="Store" required options={stores} start={stores[0]?.value} />
      <SSelect name="categoryId" label="Category" options={categories} placeholder="Every category" help="Count one category at a time, or the whole store." />
    </SheetForm>
  );
}

/* ---------- Settings ---------- */

export function CategorySheet({ closeHref, heads, start }: { closeHref: string; heads: Opt[]; start: { id: string; name: string; isLab: boolean; reorder: string; headId: string } | null }) {
  return (
    <SheetForm title={start ? `Change ${start.name}` : "Add a category"} closeHref={closeHref} action={saveCategoryAction} submitLabel="Save category" hidden={start ? { categoryId: start.id } : undefined}>
      <SText name="name" label="Name" required maxLength={60} start={start?.name} placeholder="Stationery" />
      <SText name="defaultReorderLevel" label="Default reorder level" type="number" min={0} start={start?.reorder ?? "0"} help="Used by items with no level of their own. 0: no alert." />
      <SSelect name="expenseHeadId" label="Expense head in Finance" options={heads} start={start?.headId ?? ""} placeholder="As in Inventory Settings" help="Where bills for these items go." />
      <SSwitch name="isLab" title="Lab stock" sub="Lab equipment and chemicals: shown under Lab stock, with expiry tracking on for new items." start={start?.isLab ?? false} />
    </SheetForm>
  );
}

export function ArchiveCategorySheet({ closeHref, id, name }: { closeHref: string; id: string; name: string }) {
  return (
    <SheetForm title={`Archive ${name}`} sub="Only a category with no items can be archived." closeHref={closeHref} action={archiveCategoryAction} submitLabel="Archive" submitVariant="danger" hidden={{ categoryId: id }}>
      <Alert tone="info">It stays in the history of old records.</Alert>
    </SheetForm>
  );
}

export function LocationSheet({ closeHref, start }: { closeHref: string; start: { id: string; name: string; isMain: boolean } | null }) {
  return (
    <SheetForm title={start ? `Change ${start.name}` : "Add a store"} closeHref={closeHref} action={saveLocationAction} submitLabel="Save store" hidden={start ? { locationId: start.id } : undefined}>
      <SText name="name" label="Name" required maxLength={60} start={start?.name} placeholder="Sports room" />
      <SSwitch name="isMain" title="Main store" sub="The store forms start with. There is one main store." start={start?.isMain ?? false} />
    </SheetForm>
  );
}

export function ArchiveLocationSheet({ closeHref, id, name }: { closeHref: string; id: string; name: string }) {
  return (
    <SheetForm title={`Archive ${name}`} sub="Only a store with no stock left can be archived. Transfer the stock out first." closeHref={closeHref} action={archiveLocationAction} submitLabel="Archive" submitVariant="danger" hidden={{ locationId: id }}>
      <Alert tone="info">Its movements stay in the history.</Alert>
    </SheetForm>
  );
}

/* ---------- Returns ---------- */

export function ReturnSheet({ closeHref, lineId, words, left, unit }: { closeHref: string; lineId: string; words: string; left: number; unit: string }) {
  return (
    <SheetForm title="Record a return" sub={words} closeHref={closeHref} action={returnAction} submitLabel="Back in the store" hidden={{ lineId }}>
      <SText name="qty" label={`Quantity returned (${unit})`} required inputMode="numeric" start={String(left)} help={`${left} still out.`} className="max-w-[200px]" />
      <SArea name="note" label="Note" maxLength={200} placeholder="Optional: condition when returned" />
    </SheetForm>
  );
}
