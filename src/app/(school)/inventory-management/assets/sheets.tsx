"use client";

// Assets sheets: add or change an asset, assign or transfer it, the repair
// log, disposal (with approval), linked stock items and the asset check, plus
// the scan box used room by room.

import { useActionState, useEffect, useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import { SheetForm, useTyped } from "@/components/ui/url-sheet";
import { SArea, SDate, SMoney, SSelect, SText } from "@/components/ui/sheet-fields";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import type { FormState } from "@/lib/forms";
import { SegField } from "../_components/client";
import { addAssetAction, addRepairAction, assignAction, disposeAction, linkItemAction, scanTagAction, startAssetAuditAction, updateAssetAction, updateRepairAction } from "./actions";

type Opt = { value: string; label: string };
export type PlaceOpts = { rooms: Opt[]; departments: Opt[]; staff: Opt[] };

const PLACE_KINDS = [{ value: "ROOM", label: "Room" }, { value: "DEPARTMENT", label: "Department" }, { value: "STAFF", label: "Person" }];

function PlaceFields({ places, start }: { places: PlaceOpts; start: { kind: string; roomId: string; departmentId: string; staffId: string } }) {
  const [kind, setKind] = useState(start.kind || "ROOM");
  return (
    <>
      <SegField name="placeKind" label="Where it is" start={start.kind || "ROOM"} options={PLACE_KINDS} onChange={setKind} />
      {kind === "ROOM" && <SSelect name="roomId" label="Room" required options={places.rooms} start={start.roomId} placeholder="Choose the room" />}
      {kind === "DEPARTMENT" && <SSelect name="departmentId" label="Department" required options={places.departments} start={start.departmentId} placeholder="Choose the department" />}
      {kind === "STAFF" && <SSelect name="staffId" label="Person" required options={places.staff} start={start.staffId} placeholder="Choose the staff member" />}
    </>
  );
}

export type AssetStart = {
  id: string; name: string; type: string; tag: string; serialNo: string; purchaseDate: string; cost: string; vendorId: string; warrantyEnd: string; amcEnd: string; condition: string; note: string; rate: string;
};

export function AssetSheet({ closeHref, doneHref, types, vendors, places, start, nextTag, today, receipt }: {
  closeHref: string; doneHref?: string; types: string[]; vendors: Opt[]; places: PlaceOpts; start: AssetStart | null; nextTag: string; today: string;
  receipt?: { id: string; words: string; name: string; cost: string; date: string; vendorId: string; count: string; itemId: string } | null;
}) {
  const editing = Boolean(start);
  const count = useTyped("count", receipt?.count ?? "1");
  const [n, setN] = useState(Number(count.value) || 1);
  return (
    <SheetForm title={editing ? `Change ${start!.name}` : "Add an asset"} sub={editing ? start!.tag : receipt ? receipt.words : `Tags are given in sequence from ${nextTag} unless you type one.`} closeHref={closeHref} doneHref={doneHref}
      action={editing ? (updateAssetAction as unknown as typeof addAssetAction) : addAssetAction} submitLabel={editing ? "Save" : n > 1 ? `Add ${n} assets` : "Add asset"} pendingText="Saving…"
      hidden={start ? { assetId: start.id } : receipt ? { receiptId: receipt.id, ...(receipt.itemId ? { itemId: receipt.itemId } : {}) } : undefined}>
      <div className="grid grid-cols-[1fr_150px] gap-3">
        <SText name="name" label="Asset name" required maxLength={120} start={start?.name ?? receipt?.name} placeholder="Projector, Epson EB-X51" />
        <SSelect name="type" label="Type" required options={types.map((t) => ({ value: t, label: t }))} start={start?.type ?? ""} placeholder="Choose" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {editing ? <SText name="tag" label="Asset tag" required maxLength={24} start={start!.tag} className="[&_input]:font-mono [&_input]:uppercase" />
          : n > 1 ? <div className="text-[13px] text-ink3 self-end pb-3">Each gets the next tag from {nextTag}.</div>
          : <SText name="tag" label="Asset tag" maxLength={24} placeholder={nextTag} className="[&_input]:font-mono [&_input]:uppercase" help={`Empty: ${nextTag}`} />}
        {!editing && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="asset-count" className="text-[13px] font-semibold text-ink2">How many</label>
            <input key={count.key} id="asset-count" name="count" type="number" min={1} max={100} defaultValue={count.value} onChange={(e) => setN(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
              className={cx(inputCls(count.error), "h-11 tnum")} />
            {count.error ? <p className="text-[12.5px] text-bad">{count.error}</p> : <p className="text-[12.5px] text-ink3">For example 30 desks, each with its own tag.</p>}
          </div>
        )}
        {editing && <SText name="serialNo" label="Serial number" maxLength={60} start={start!.serialNo} />}
      </div>
      {!editing && <PlaceFields places={places} start={{ kind: "ROOM", roomId: "", departmentId: "", staffId: "" }} />}
      <div className="grid grid-cols-2 gap-3">
        <SDate name="purchaseDate" label="Purchase date" start={start?.purchaseDate ?? receipt?.date} max={today} />
        <SMoney name="cost" label="Cost (each)" start={start?.cost ?? receipt?.cost} />
      </div>
      <SSelect name="vendorId" label="Vendor" options={vendors} start={start?.vendorId ?? receipt?.vendorId ?? ""} placeholder="None" />
      <div className="grid grid-cols-2 gap-3">
        <SDate name="warrantyEnd" label="Warranty ends" start={start?.warrantyEnd} help="Needed for reminders" />
        <SDate name="amcEnd" label="AMC ends" start={start?.amcEnd} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SSelect name="condition" label="Condition" required options={["Good", "Fair", "Poor"].map((c) => ({ value: c, label: c }))} start={start?.condition ?? "Good"} />
        {!editing ? <SText name="serialNo" label="Serial number" maxLength={60} placeholder={n > 1 ? "Leave empty for many" : "Optional"} /> : <SText name="depreciationRate" label="Depreciation rate %" inputMode="decimal" start={start!.rate} help="Empty: the type's rate in Inventory Settings" />}
      </div>
      <SArea name="note" label="Note" maxLength={300} start={start?.note} placeholder="Optional" />
    </SheetForm>
  );
}

export function AssignSheet({ closeHref, assetId, words, places, today, start }: { closeHref: string; assetId: string; words: string; places: PlaceOpts; today: string; start: { kind: string; roomId: string; departmentId: string; staffId: string } }) {
  return (
    <SheetForm title="Move or assign" sub={words} closeHref={closeHref} action={assignAction} submitLabel="Save" hidden={{ assetId }}>
      <PlaceFields places={places} start={start} />
      <SDate name="date" label="Date" required start={today} max={today} />
      <SText name="reason" label="Reason" maxLength={200} placeholder="Optional: for example moved to the new lab" />
    </SheetForm>
  );
}

export function RepairSheet({ closeHref, assetId, words, vendors, today }: { closeHref: string; assetId: string; words: string; vendors: Opt[]; today: string }) {
  return (
    <SheetForm title="Log a repair" sub={words} closeHref={closeHref} action={addRepairAction} submitLabel="Log repair" hidden={{ assetId }}>
      <SArea name="problem" label="Problem" required maxLength={300} placeholder="For example: lamp not switching on" />
      <div className="grid grid-cols-2 gap-3">
        <SDate name="date" label="Date" required start={today} max={today} />
        <SSelect name="vendorId" label="Repaired by (vendor)" options={vendors} placeholder="Not yet" />
      </div>
      <SText name="note" label="Note" maxLength={300} placeholder="Optional" />
    </SheetForm>
  );
}

export function RepairUpdateSheet({ closeHref, logId, words, vendors, today, start }: { closeHref: string; logId: string; words: string; vendors: Opt[]; today: string; start: { status: string; vendorId: string } }) {
  const [status, setStatus] = useState(start.status === "OPEN" ? "IN_PROGRESS" : start.status);
  return (
    <SheetForm title="Update the repair" sub={words} closeHref={closeHref} action={updateRepairAction} submitLabel={status === "DONE" ? "Close repair" : "Save"} hidden={{ logId }}>
      <SegField name="status" label="Status" start={status} onChange={setStatus} options={[{ value: "IN_PROGRESS", label: "In progress" }, { value: "DONE", label: "Done" }, { value: "CANCELLED", label: "Cancelled" }]} />
      <SSelect name="vendorId" label="Vendor" options={vendors} start={start.vendorId} placeholder="None" />
      {status === "DONE" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <SDate name="doneOn" label="Done on" required start={today} max={today} />
            <SMoney name="cost" label="Cost" />
          </div>
          <label className="flex items-center gap-2 rounded-xl border border-line px-4 py-3 text-[14px]">
            <input type="checkbox" name="toFinance" defaultChecked className="size-4" />
            <span><b className="font-semibold">Send the cost to Finance</b><span className="block text-[12.5px] text-ink3">Recorded as an expense under Repairs and maintenance.</span></span>
          </label>
          <SText name="billNo" label="Vendor's bill number" maxLength={40} placeholder="Optional" />
          <input type="file" name="bill" accept="image/*,application/pdf" aria-label="Photo or PDF of the bill" className="text-[13px]" />
        </>
      )}
      <SText name="note" label="Note" maxLength={300} placeholder="Optional" />
    </SheetForm>
  );
}

export function DisposeSheet({ closeHref, assetId, words, today }: { closeHref: string; assetId: string; words: string; today: string }) {
  const [method, setMethod] = useState("SCRAPPED");
  return (
    <SheetForm title="Dispose of the asset" sub={`${words}. Needs approval; the asset stays in the register as Disposed.`} closeHref={closeHref} action={disposeAction} submitLabel="Send for approval" submitVariant="danger" hidden={{ assetId }}>
      <SegField name="method" label="How" start="SCRAPPED" onChange={setMethod} options={[{ value: "SOLD", label: "Sold" }, { value: "SCRAPPED", label: "Scrapped" }, { value: "DONATED", label: "Donated" }]} />
      <SArea name="reason" label="Reason" required maxLength={300} placeholder="For example: beyond repair, motherboard failed" />
      <SDate name="date" label="Date" required start={today} max={today} />
      {method === "SOLD" && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <SMoney name="sale" label="Sale amount" required />
            <SText name="buyer" label="Buyer" maxLength={120} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SSelect name="saleMode" label="Received by" options={[{ value: "CASH", label: "Cash" }, { value: "UPI", label: "UPI" }, { value: "BANK_TRANSFER", label: "Bank transfer" }, { value: "CHEQUE", label: "Cheque" }]} start="CASH" />
            <SText name="saleRef" label="Reference" maxLength={60} placeholder="Optional" />
          </div>
          <Alert tone="info">When approved, the sale goes to Finance as income (Scrap sale).</Alert>
        </>
      )}
    </SheetForm>
  );
}

export function LinkItemSheet({ closeHref, assetId, words, items }: { closeHref: string; assetId: string; words: string; items: Opt[] }) {
  return (
    <SheetForm title="Link a stock item" sub={`${words}. For example its spare parts or consumables.`} closeHref={closeHref} action={linkItemAction} submitLabel="Link item" hidden={{ assetId }}>
      <SSelect name="itemId" label="Item" required options={items} placeholder="Choose the item" />
      <SText name="note" label="Note" maxLength={200} placeholder="Optional: for example toner for this printer" />
    </SheetForm>
  );
}

export function StartAssetAuditSheet({ closeHref, rooms, suggested }: { closeHref: string; rooms: Opt[]; suggested: string }) {
  return (
    <SheetForm title="Start an asset check" sub="Scan the tags room by room; missing and misplaced assets are listed." closeHref={closeHref} action={startAssetAuditAction} submitLabel="Start check">
      <SText name="name" label="Name" required maxLength={80} start={suggested} />
      <SSelect name="roomId" label="Only one room" options={rooms} placeholder="Every room" />
    </SheetForm>
  );
}

/** Scan or type tags in one room; each result shows at once and the lists below refresh. */
export function ScanTags({ auditId, rooms, startRoom }: { auditId: string; rooms: Opt[]; startRoom: string }) {
  const [state, run, pending] = useActionState<FormState<unknown>, FormData>(scanTagAction, null);
  const [room, setRoom] = useState(startRoom);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (state?.ok && input.current) { input.current.value = ""; input.current.focus(); } }, [state]);
  return (
    <form action={run} className="flex flex-col gap-3">
      <input type="hidden" name="auditId" value={auditId} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="scan-room" className="text-[13px] font-semibold text-ink2">Room you are checking</label>
        <select id="scan-room" name="roomId" value={room} onChange={(e) => setRoom(e.target.value)} className="h-11 rounded-xl border border-line bg-surface px-3 text-[14.5px]">
          <option value="">Choose the room</option>
          {rooms.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <label htmlFor="scan-tag" className="sr-only">Asset tag</label>
          <ScanLine size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3" aria-hidden="true" />
          <input ref={input} id="scan-tag" name="code" placeholder="Scan the tag, or type it" autoComplete="off" spellCheck={false} autoFocus className={cx(inputCls(state && !state.ok ? "x" : undefined), "h-12 pl-11 font-mono text-[15px] uppercase")} />
        </div>
        <Button type="submit" variant="primary" loading={pending} className="h-12">Check</Button>
      </div>
      {state && <p className={cx("rounded-xl px-3.5 py-2.5 text-[13.5px] font-semibold", state.ok ? (/not where|not in the register|disposed/.test(state.message ?? "") ? "bg-warn/12 text-warn" : "bg-ok/10 text-ok") : "bg-bad/10 text-bad")} role="status">{state.message}</p>}
    </form>
  );
}
