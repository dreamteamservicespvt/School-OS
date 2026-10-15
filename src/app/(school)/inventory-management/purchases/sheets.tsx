"use client";

// Purchases & Vendors sheets: purchase request, purchase order, goods
// received, vendor bill, payment, cancel, and vendor. Each keeps what was
// typed when a check fails; the server checks everything again.

import { useState } from "react";
import { Upload } from "lucide-react";
import { SheetForm, useSheetResult, useTyped } from "@/components/ui/url-sheet";
import { SArea, SDate, SMoney, SSelect, SText } from "@/components/ui/sheet-fields";
import { Segmented } from "@/components/ui/controls";
import { Alert } from "@/components/ui/alert";
import { inputCls } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import { ItemLines, type ItemPick, type LineStart } from "../_components/client";
import { billAction, cancelBillAction, cancelRequestAction, closeOrderAction, emailOrderAction, orderAction, payBillAction, receiveAction, requestAction, saveVendorAction } from "./actions";

type Opt = { value: string; label: string };
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const num = (v: string) => Number(v.replace(/[₹,\s]/g, "")) || 0;

/** Finance's duplicate-bill and low-cash warnings: a reason or a tick to go on. */
export function Warned() {
  const state = useSheetResult();
  const data = state && !state.ok ? (state.data as { warning?: boolean } | undefined) : undefined;
  if (!data?.warning) return null;
  return (
    <>
      {state?.errors?.billNo && <SArea name="duplicateReason" label="Why save it again?" required placeholder="For example: a second bill with the same number, confirmed with the vendor" />}
      {state?.errors?.mode && (
        <label className="flex items-center gap-2 rounded-xl bg-warn/12 px-3.5 py-3 text-[14px] font-semibold">
          <input type="checkbox" name="confirmLowCash" className="size-4" /> Pay from cash anyway
        </label>
      )}
    </>
  );
}

export function RequestSheet({ closeHref, items, start, departments, myDepartment, limit, today }: { closeHref: string; items: ItemPick[]; start: LineStart[]; departments: Opt[]; myDepartment: string; limit: number; today: string }) {
  const [total, setTotal] = useState(0);
  const est = useTyped("estimate", "");
  const [typed, setTyped] = useState(est.value);
  const amount = num(typed) || total / 100;
  const waits = amount > limit;
  return (
    <SheetForm title="Raise a purchase request" sub={`Up to ${inr(limit)} is approved at once; above it goes to Approvals.`} closeHref={closeHref} action={requestAction} submitLabel={waits ? "Send for approval" : "Raise request"} wide>
      <ItemLines items={items} start={start} price="unit" onTotal={setTotal} help="The rate is an estimate: the last purchase price is filled in. Leave it empty if not known." />
      <SArea name="reason" label="Reason" required maxLength={300} placeholder="For example: notebooks for the new term" />
      <div className="grid sm:grid-cols-3 gap-3">
        <SDate name="neededBy" label="Needed by" min={today} />
        <SSelect name="departmentId" label="Department" options={departments} start={myDepartment} placeholder="None" />
        <SMoney name="estimate" label="Estimated amount" onValue={setTyped} placeholder={total ? String(Math.round(total / 100)) : ""} help={total ? `Empty: ${inr(total / 100)} from the lines` : "Empty: from the lines"} />
      </div>
      {amount > 0 && <Alert tone={waits ? "info" : "success"}>{waits ? `About ${inr(amount)}: above ${inr(limit)}, so it waits in Approvals. The order can be made once it is approved.` : `About ${inr(amount)}: within ${inr(limit)}, approved at once.`}</Alert>}
    </SheetForm>
  );
}

export function CancelRequestSheet({ closeHref, requestId, number }: { closeHref: string; requestId: string; number: string }) {
  return (
    <SheetForm title={`Cancel request ${number}`} sub="It stays in the list with your reason." closeHref={closeHref} action={cancelRequestAction} submitLabel="Cancel request" submitVariant="danger" hidden={{ requestId }}>
      <SArea name="reason" label="Reason" required maxLength={200} placeholder="For example: bought from the school's own stock" />
    </SheetForm>
  );
}

export function OrderSheet({ closeHref, items, start, vendors, stores, mainStore, requestId, requestWords, today, approvedUpTo, addVendorHref }: {
  closeHref: string; items: ItemPick[]; start: LineStart[]; vendors: Opt[]; stores: Opt[]; mainStore: string; requestId: string | null; requestWords: string | null; today: string; approvedUpTo: number; addVendorHref: string;
}) {
  const [total, setTotal] = useState(0);
  const over = total / 100 > approvedUpTo;
  return (
    <SheetForm title="Make a purchase order" sub={requestWords ?? "Without a request, orders up to the approval limit only."} closeHref={closeHref} action={orderAction} submitLabel={over ? "Send for approval" : "Make order"} hidden={requestId ? { requestId } : undefined} wide>
      <div className="grid sm:grid-cols-2 gap-3">
        <SSelect name="vendorId" label="Vendor" required options={vendors} placeholder="Choose the vendor" help={<a href={addVendorHref} className="font-semibold text-brand hover:underline">Add a vendor</a>} />
        <SSelect name="locationId" label="Deliver to store" required options={stores} start={mainStore} />
      </div>
      <ItemLines items={items} start={start} price="unit" onTotal={setTotal} help="Price per unit from the vendor's quote. The last price paid is filled in." />
      {over && <Alert tone="info">{`The order (${inr(total / 100)}) is above ${inr(approvedUpTo)} approved, so it waits in Approvals before it is sent.`}</Alert>}
      <div className="grid sm:grid-cols-2 gap-3">
        <SDate name="expectedOn" label="Expected by" min={today} />
        <SText name="note" label="Note to the vendor" maxLength={300} placeholder="Optional: delivery time, packing" />
      </div>
    </SheetForm>
  );
}

export function CloseOrderSheet({ closeHref, orderId, number, received }: { closeHref: string; orderId: string; number: string; received: boolean }) {
  return (
    <SheetForm title={`${received ? "Close" : "Cancel"} order ${number}`} sub={received ? "What was received stays in stock; nothing more is expected." : "Nothing was received, so the order is cancelled."} closeHref={closeHref} action={closeOrderAction} submitLabel={received ? "Close order" : "Cancel order"} submitVariant="danger" hidden={{ orderId }}>
      <SArea name="reason" label="Reason" required maxLength={200} placeholder={received ? "For example: the rest is no longer needed" : "For example: the vendor could not supply"} />
    </SheetForm>
  );
}

export function EmailOrderSheet({ closeHref, orderId, number, email }: { closeHref: string; orderId: string; number: string; email: string }) {
  return (
    <SheetForm title={`Email order ${number}`} sub="Sent from the school's email with the PDF attached." closeHref={closeHref} action={emailOrderAction} submitLabel="Send email" pendingText="Sending…" hidden={{ orderId }}>
      <SText name="to" label="Vendor's email" required type="email" start={email} maxLength={120} />
    </SheetForm>
  );
}

export type ReceiveLine = { id: string; name: string; unit: string; ordered: number; received: number; tracksExpiry: boolean };

export function ReceiveSheet({ closeHref, orderId, number, lines, stores, store, today }: { closeHref: string; orderId: string; number: string; lines: ReceiveLine[]; stores: Opt[]; store: string; today: string }) {
  const state = useSheetResult();
  const typed = state && !state.ok ? state.values : undefined;
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.id, typed?.[`recv-${l.id}`] ?? String(Math.max(0, l.ordered - l.received))])));
  const extra = lines.filter((l) => (Number(qty[l.id]) || 0) > l.ordered - l.received);
  return (
    <SheetForm title={`Goods received: ${number}`} sub="Enter what arrived. Part deliveries are fine; stock goes up in the store chosen." closeHref={closeHref} action={receiveAction} submitLabel="Add to stock" hidden={{ orderId }} wide>
      <div className="grid sm:grid-cols-2 gap-3">
        <SSelect name="locationId" label="Store" required options={stores} start={store} />
        <SDate name="date" label="Date received" required start={today} max={today} />
      </div>
      <ul className="flex flex-col gap-2">
        {lines.map((l) => {
          const left = Math.max(0, l.ordered - l.received);
          const n = Number(qty[l.id]) || 0;
          const err = state?.errors?.[`recv-${l.id}`] ?? state?.errors?.[`exp-${l.id}`];
          return (
            <li key={l.id} className="rounded-xl border border-line p-3 flex flex-col gap-2">
              <input type="hidden" name="lineId" value={l.id} />
              <div className="grid grid-cols-[1fr_110px] gap-3 items-center">
                <span className="text-[14px] min-w-0"><b className="font-semibold">{l.name}</b><span className="block text-[12.5px] text-ink3">Ordered {l.ordered} · received {l.received} · {left} to come</span></span>
                <span>
                  <label className="sr-only" htmlFor={`recv-${l.id}`}>Received now: {l.name}</label>
                  <input id={`recv-${l.id}`} name={`recv-${l.id}`} inputMode="numeric" value={qty[l.id] ?? ""} onChange={(e) => setQty((q) => ({ ...q, [l.id]: e.target.value.replace(/[^\d]/g, "") }))}
                    className={cx(inputCls(err || n > left ? "x" : undefined), "h-11 text-right tnum")} />
                </span>
              </div>
              {n > left && <p className="text-[12.5px] text-warn font-semibold">Ordered {l.ordered - l.received > 0 ? left : 0}, receiving {n}.</p>}
              {l.tracksExpiry && n > 0 && (
                <div className="grid grid-cols-2 gap-2">
                  <input name={`batch-${l.id}`} placeholder="Batch" defaultValue={typed?.[`batch-${l.id}`] ?? ""} maxLength={40} aria-label={`Batch: ${l.name}`} className={cx(inputCls(undefined), "h-10")} />
                  <input name={`exp-${l.id}`} type="date" defaultValue={typed?.[`exp-${l.id}`] ?? ""} aria-label={`Expiry date: ${l.name}`} className={cx(inputCls(state?.errors?.[`exp-${l.id}`]), "h-10")} />
                </div>
              )}
              {err && <p className="text-[12.5px] text-bad">{err}</p>}
            </li>
          );
        })}
      </ul>
      {extra.length > 0 && <SArea name="extraReason" label="Why more than ordered?" required maxLength={200} placeholder="For example: the vendor sent a free extra box" />}
      <SText name="note" label="Note" maxLength={300} placeholder="Optional: delivery challan number" />
    </SheetForm>
  );
}

function BillFile() {
  const t = useTyped("bill", null);
  const [name, setName] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-ink2">Photo or PDF of the bill</span>
      <label className="inline-flex items-center justify-center gap-2 h-11 rounded-xl border border-line bg-surface text-[14px] font-semibold text-ink2 cursor-pointer hover:bg-sunken focus-within:ring-2 focus-within:ring-brand/40">
        <Upload size={16} aria-hidden="true" />{name ?? "Choose file or take photo"}
        <input type="file" name="bill" accept="image/*,application/pdf" capture="environment" className="sr-only" onChange={(e) => setName(e.target.files?.[0]?.name ?? null)} />
      </label>
      {t.error ? <p className="text-[12.5px] text-bad font-semibold" role="alert">{t.error}</p> : <p className="text-[12.5px] text-ink3">Finance may need it above its set amount.</p>}
    </div>
  );
}

export function BillSheet({ closeHref, orders, vendors, start, today }: { closeHref: string; orders: (Opt & { left: string; vendorId: string })[]; vendors: Opt[]; start: { orderId: string }; today: string }) {
  const o = useTyped("orderId", start.orderId);
  const [orderId, setOrderId] = useState(o.value);
  const order = orders.find((x) => x.value === orderId);
  return (
    <SheetForm title="Record the vendor's bill" sub="It goes to Finance as a vendor bill (Expenses), linked to the order." closeHref={closeHref} action={billAction} submitLabel="Save bill" pendingText="Saving…">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="bill-order" className="text-[13px] font-semibold text-ink2">Purchase order</label>
        <select key={o.key} id="bill-order" name="orderId" defaultValue={o.value} onChange={(e) => setOrderId(e.target.value)} className="h-11 rounded-xl border border-line bg-surface px-3 text-[14.5px]">
          <option value="">No order (a direct purchase)</option>
          {orders.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
        </select>
      </div>
      {!order && <SSelect name="vendorId" label="Vendor" required options={vendors} placeholder="Choose the vendor" />}
      <div className="grid grid-cols-2 gap-3">
        <SText name="billNo" label="Bill number" required maxLength={40} className="[&_input]:font-mono" />
        <SMoney key={orderId} name="amount" label="Amount" required start={order?.left ?? ""} help={order ? "Empty part of the order is filled in" : undefined} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <SDate name="billDate" label="Bill date" required start={today} max={today} />
        <SDate name="dueDate" label="Due date" />
      </div>
      <BillFile />
      <SText name="note" label="Note" maxLength={200} placeholder="Optional" />
      <Warned />
    </SheetForm>
  );
}

const MODES = [{ value: "CASH", label: "Cash" }, { value: "UPI", label: "UPI" }, { value: "BANK_TRANSFER", label: "Bank" }, { value: "CHEQUE", label: "Cheque" }];

export function PayBillSheet({ closeHref, invoiceId, words, left, today, banks, cashId, mainBank }: { closeHref: string; invoiceId: string; words: string; left: string; today: string; banks: Opt[]; cashId: string; mainBank: string }) {
  const m = useTyped("mode", "BANK_TRANSFER");
  const [mode, setMode] = useState(m.value || "BANK_TRANSFER");
  return (
    <SheetForm title="Pay the bill" sub={words} closeHref={closeHref} action={payBillAction} submitLabel="Record payment" pendingText="Saving…" hidden={{ invoiceId, mode }}>
      <div className="grid grid-cols-2 gap-3">
        <SMoney name="payAmount" label="Amount" required start={left} help="Part payments are fine" />
        <SDate name="date" label="Date paid" required start={today} max={today} />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-ink2">Mode <span className="text-bad" aria-hidden="true">*</span></span>
        <Segmented label="Mode" value={mode} onChange={setMode} className="w-full" options={MODES} />
        {m.error && <p className="text-[12.5px] text-bad">{m.error}</p>}
      </div>
      {mode !== "CASH" && <SText name="reference" label={mode === "CHEQUE" ? "Cheque number" : "Transaction or UTR number"} required maxLength={60} className="[&_input]:font-mono" />}
      {mode === "CASH" ? (cashId ? <input type="hidden" name="accountId" value={cashId} /> : null) : <SSelect key={mode} name="accountId" label="Paid from" required options={banks} start={mainBank} />}
      <p className="text-[12.5px] text-ink3">The payment goes into the Day Book in Finance Management on the date paid.</p>
      <Warned />
    </SheetForm>
  );
}

export function CancelBillSheet({ closeHref, invoiceId, words, paid }: { closeHref: string; invoiceId: string; words: string; paid: boolean }) {
  return (
    <SheetForm title="Cancel this bill" sub={words} closeHref={closeHref} action={cancelBillAction} submitLabel="Cancel bill" submitVariant="danger" hidden={{ invoiceId }}>
      {paid && <Alert tone="info">It is already paid: a reversal goes into today&apos;s Day Book.</Alert>}
      <SArea name="reason" label="Reason" required maxLength={300} placeholder="For example: entered twice" />
    </SheetForm>
  );
}

export type VendorStart = { id: string; name: string; contactName: string; phone: string; email: string; gstin: string; address: string; itemsSupplied: string; bankName: string; ifsc: string; last4: string };

export function VendorSheet({ closeHref, start, bank }: { closeHref: string; start: VendorStart | null; bank: boolean }) {
  return (
    <SheetForm title={start ? `Change ${start.name}` : "Add a vendor"} sub="The same vendor list as Finance. A GSTIN or phone already in the list shows that vendor instead." closeHref={closeHref} action={saveVendorAction} submitLabel="Save vendor" hidden={start ? { vendorId: start.id } : undefined}>
      <SText name="name" label="Vendor name" required maxLength={120} start={start?.name} placeholder="Sri Sai Stationers" />
      <div className="grid sm:grid-cols-2 gap-3">
        <SText name="contactName" label="Contact person" maxLength={80} start={start?.contactName} />
        <SText name="phone" label="Phone" type="tel" maxLength={20} start={start?.phone} placeholder="98480 12345" />
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <SText name="email" label="Email" type="email" maxLength={120} start={start?.email} help="Purchase orders are emailed here" />
        <SText name="gstin" label="GSTIN" maxLength={15} start={start?.gstin} className="[&_input]:font-mono [&_input]:uppercase" placeholder="36ABCDE1234F1Z5" />
      </div>
      <SArea name="address" label="Address" maxLength={300} start={start?.address} />
      <SText name="itemsSupplied" label="Items supplied" maxLength={300} start={start?.itemsSupplied} placeholder="Notebooks, pens, chart paper" />
      {bank && (
        <fieldset className="flex flex-col gap-3 rounded-xl border border-line p-3">
          <legend className="px-1 text-[13px] font-semibold text-ink2">Bank details (for payments)</legend>
          <div className="grid sm:grid-cols-2 gap-3">
            <SText name="bankName" label="Bank" maxLength={80} start={start?.bankName} />
            <SText name="ifsc" label="IFSC" maxLength={11} start={start?.ifsc} className="[&_input]:font-mono [&_input]:uppercase" />
          </div>
          <SText name="accountNo" label="Account number" inputMode="numeric" maxLength={24} autoComplete="off" help={start?.last4 ? `Kept: ending ${start.last4}. Leave empty to keep it.` : "Kept encrypted; only the last 4 digits are shown."} />
        </fieldset>
      )}
    </SheetForm>
  );
}
