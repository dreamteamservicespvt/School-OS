"use client";

// Inventory Settings (14 §6) as one form: item code and asset tag formats,
// the purchase order prefix, the amount purchases are approved up to,
// transfer approval, units, alerts, book sets, asset types, the depreciation
// method and rates, and warranty reminder days. What was typed is kept when
// a check fails. People who only read the settings see the same values.

import { createContext, useActionState, useContext, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Segmented, Switch } from "@/components/ui/controls";
import { inputCls } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { cx } from "@/components/ui/cx";
import type { FormState } from "@/lib/forms";
import { saveSettingsAction } from "../actions";

export type SettingsStart = {
  itemCodePrefix: string; itemCodeWidth: number; nextItem: string;
  assetTagPrefix: string; assetTagWidth: number; nextTag: string;
  poPrefix: string; approveUpTo: string; transfersNeedApproval: boolean; defaultExpenseHeadId: string;
  units: string; lowStockAlerts: boolean; bookSetsOn: boolean; setsWithMissing: boolean;
  assetTypes: string[]; rates: Record<string, number>; depreciationMethod: string; warrantyReminderDays: number;
};

type Ctx = { readOnly: boolean; values: Record<string, string> | null; errors: Record<string, string> };
const FormCtx = createContext<Ctx>({ readOnly: false, values: null, errors: {} });
function useField() {
  const c = useContext(FormCtx);
  return { readOnly: c.readOnly, v: (k: string, fallback: string | number) => c.values?.[k] ?? String(fallback), err: (k: string) => c.errors[k], typed: c.values };
}

function Num({ name, label, start: s, suffix, money, min = 0, max, width = "w-24" }: { name: string; label: string; start: string | number; suffix?: string; money?: boolean; min?: number; max?: number; width?: string }) {
  const { readOnly, v, err } = useField();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`set-${name}`} className="sr-only">{label}</label>
      <div className="flex items-center gap-2">
        <div className="relative">
          {money && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink3 font-semibold text-[14px]" aria-hidden="true">₹</span>}
          <input id={`set-${name}`} name={name} defaultValue={v(name, s)} inputMode={money ? "decimal" : "numeric"} type={money ? "text" : "number"} min={money ? undefined : min} max={max}
            aria-invalid={err(name) ? true : undefined} aria-describedby={err(name) ? `set-${name}-error` : undefined} disabled={readOnly}
            className={cx(inputCls(err(name)), "h-10 tnum text-right", money && "pl-7", width)} />
        </div>
        {suffix && <span className="text-[13px] text-ink3">{suffix}</span>}
      </div>
      {err(name) && <p id={`set-${name}-error`} className="text-[12px] text-bad max-w-[220px]">{err(name)}</p>}
    </div>
  );
}

function Txt({ name, label, start: s, width = "w-24", mono, placeholder }: { name: string; label: string; start: string; width?: string; mono?: boolean; placeholder?: string }) {
  const { readOnly, v, err } = useField();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`set-${name}`} className="sr-only">{label}</label>
      <input id={`set-${name}`} name={name} defaultValue={v(name, s)} maxLength={10} placeholder={placeholder} disabled={readOnly} aria-invalid={err(name) ? true : undefined}
        className={cx(inputCls(err(name)), "h-10 uppercase", mono && "font-mono", width)} />
      {err(name) && <p className="text-[12px] text-bad max-w-[220px]">{err(name)}</p>}
    </div>
  );
}

function Row({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5 flex-wrap">
      <div className="min-w-0 flex-1 text-[14px] basis-[220px]"><b className="font-semibold block">{title}</b>{sub && <span className="block text-[12.5px] text-ink3 mt-0.5">{sub}</span>}</div>
      <div className="min-w-0 max-w-full flex items-center gap-2 flex-wrap">{children}</div>
    </div>
  );
}

function Toggle({ name, title, sub, start: s }: { name: string; title: string; sub?: string; start: boolean }) {
  const { readOnly, typed } = useField();
  const [on, setOn] = useState(typed ? typed[name] === "on" : s);
  return <Row title={title} sub={sub}>{readOnly ? <span className="text-[13.5px] text-ink2">{on ? "On" : "Off"}</span> : <Switch on={on} onChange={setOn} label={title} name={name} />}</Row>;
}

function Area({ name, label, start: s, help }: { name: string; label: string; start: string; help: string }) {
  const { readOnly, v, err } = useField();
  return (
    <div className="px-5 py-3.5 flex flex-col gap-1.5">
      <label htmlFor={`set-${name}`} className="text-[14px] font-semibold">{label}</label>
      <textarea id={`set-${name}`} name={name} defaultValue={v(name, s)} rows={2} disabled={readOnly} aria-invalid={err(name) ? true : undefined}
        className={cx(inputCls(err(name)), "py-2 min-h-[64px]")} />
      {err(name) ? <p className="text-[12px] text-bad">{err(name)}</p> : <p className="text-[12.5px] text-ink3">{help}</p>}
    </div>
  );
}

export function SettingsForm({ start, readOnly, heads }: { start: SettingsStart; readOnly: boolean; heads: { value: string; label: string }[] }) {
  const [state, run, pending] = useActionState<FormState, FormData>(saveSettingsAction, null);
  const typed = state && !state.ok ? state.values ?? {} : null;
  const ctx: Ctx = { readOnly, values: typed, errors: state?.errors ?? {} };
  const v = (k: string, fallback: string | number) => typed?.[k] ?? String(fallback);
  const err = (k: string) => state?.errors?.[k];
  const key = typed ? JSON.stringify(typed).length : 0;
  const [method, setMethod] = useState(v("depreciationMethod", start.depreciationMethod));

  return (
    <FormCtx.Provider value={ctx}>
    <form action={run} key={key} className="flex flex-col gap-5" noValidate>
      {state && !state.ok && <Alert tone="danger">{state.message}</Alert>}
      {state?.ok && <Alert tone="success">{state.message}</Alert>}
      <Card>
        <CardHeader title="Codes and numbers" divided />
        <div className="divide-y divide-line/70">
          <Row title="Item codes" sub={`The next item gets ${start.nextItem}.`}>
            <Txt name="itemCodePrefix" label="Item code prefix" start={start.itemCodePrefix} mono placeholder="ST-" />
            <Num name="itemCodeWidth" label="Digits in item codes" start={start.itemCodeWidth} min={3} max={8} suffix="digits" width="w-20" />
          </Row>
          <Row title="Asset tags" sub={`The next asset gets ${start.nextTag}. Printed as a barcode or QR.`}>
            <Txt name="assetTagPrefix" label="Asset tag prefix" start={start.assetTagPrefix} mono placeholder="AT-" />
            <Num name="assetTagWidth" label="Digits in asset tags" start={start.assetTagWidth} min={3} max={8} suffix="digits" width="w-20" />
          </Row>
          <Row title="Purchase order numbers" sub="Followed by the financial year and a number, for example PO/2026-27/0001.">
            <Txt name="poPrefix" label="Purchase order prefix" start={start.poPrefix} mono placeholder="PO/" />
          </Row>
        </div>
      </Card>

      <Card>
        <CardHeader title="Purchases and approvals" description="Who approves is set in Settings, Forms & Approvals." divided />
        <div className="divide-y divide-line/70">
          <Row title="Approve purchases up to" sub="Requests and orders above this wait in Approvals."><Num name="approveUpTo" label="Approve purchases up to" start={start.approveUpTo} money width="w-32" /></Row>
          <Toggle name="transfersNeedApproval" title="Transfers between stores need approval" start={start.transfersNeedApproval} />
          <Row title="Expense head for vendor bills" sub="Used when the item's category has no head of its own.">
            <label htmlFor="set-defaultExpenseHeadId" className="sr-only">Expense head for vendor bills</label>
            <select id="set-defaultExpenseHeadId" name="defaultExpenseHeadId" defaultValue={v("defaultExpenseHeadId", start.defaultExpenseHeadId)} disabled={readOnly} className={cx(inputCls(err("defaultExpenseHeadId")), "h-10 w-60 max-w-full")}>
              <option value="">Not set</option>
              {heads.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
            </select>
          </Row>
        </div>
      </Card>

      <Card>
        <CardHeader title="Stock" divided />
        <div className="divide-y divide-line/70">
          <Area name="units" label="Units" start={start.units} help="Separated by commas, for example piece, box, packet, kg, litre, set." />
          <Toggle name="lowStockAlerts" title="Low-stock alerts" sub="The store keeper is told when an item reaches its reorder level." start={start.lowStockAlerts} />
          <Toggle name="bookSetsOn" title="Book sets" sub="Items issued together to a student, charged to fees." start={start.bookSetsOn} />
          <Toggle name="setsWithMissing" title="Issue a set with missing items" sub="Out-of-stock items are left out and given later." start={start.setsWithMissing} />
        </div>
      </Card>

      <Card>
        <CardHeader title="Assets" divided />
        <div className="divide-y divide-line/70">
          <Area name="assetTypes" label="Asset types" start={start.assetTypes.join(", ")} help="Separated by commas. A new type gets a 10% rate until you set one below." />
          <Row title="Depreciation method" sub="Straight line: the same share of the cost each year. Written-down value: the rate on what is left.">
            {readOnly ? <span className="text-[13.5px] text-ink2">{method === "WDV" ? "Written-down value" : "Straight line"}</span>
              : <><Segmented label="Depreciation method" value={method} onChange={setMethod} size="sm" options={[{ value: "SLM", label: "Straight line" }, { value: "WDV", label: "Written-down value" }]} /><input type="hidden" name="depreciationMethod" value={method} /></>}
          </Row>
          <div className="px-5 py-3.5">
            <p className="text-[14px] font-semibold mb-2">Rate a year by type</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {start.assetTypes.map((t) => (
                <div key={t} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2">
                  <span className="text-[13.5px] min-w-0 truncate">{t}</span>
                  <Num name={`rate-${t}`} label={`Rate for ${t}`} start={start.rates[t] ?? 10} max={100} suffix="%" width="w-16" />
                </div>
              ))}
            </div>
          </div>
          <Row title="Warranty and AMC reminder" sub="The store keeper is told this many days before the end date."><Num name="warrantyReminderDays" label="Reminder days" start={start.warrantyReminderDays} min={1} max={180} suffix="days before" width="w-20" /></Row>
        </div>
      </Card>

      {!readOnly && (
        <div className="sticky bottom-20 md:bottom-3 z-10 flex justify-end">
          <Button type="submit" variant="primary" size="lg" icon={Save} loading={pending} loadingText="Saving…" className="shadow-pop">Save settings</Button>
        </div>
      )}
    </form>
    </FormCtx.Provider>
  );
}
