"use client";

// Fee Structure sheets (mod-fees.jsx AddHeadSheet, AddRowSheet, ChangeSheet):
// fee heads, fee rows with installments that must add up, publishing a
// version, copying, preparing next year and undoing a version.

import { useActionState, useState } from "react";
import { CircleAlert, CircleCheck, Plus, Trash2 } from "lucide-react";
import { SheetForm } from "@/components/ui/url-sheet";
import { SArea, SChips, SDate, SSelect, SSwitch, SText } from "@/components/ui/sheet-fields";
import { Button, IconButton } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { FieldShell, inputCls, SelectField, TextField, type Option } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import { ConfirmButton } from "@/components/ui/confirm";
import { formatRupees } from "@/lib/format";
import type { FormState } from "@/lib/forms";
import { defaultSchedule } from "@/lib/fees/schedule";
import { FREQUENCIES, HEAD_KINDS, headKindLabel, type FrequencyValue } from "@/lib/fees/words";
import {
  archiveHeadAction, assignClassAction, copyAction, discardAction, prepareYearAction, publishAction, removeRowAction, restoreAction, saveHeadAction, saveRowAction,
} from "./actions";

export type HeadData = { id: string; name: string; kind: string; taxable: boolean; gstRate: string; sacCode: string; bankAccountId: string; lateFeeApplies: boolean; system: boolean };

export function HeadSheet({ closeHref, head, banks, gstin, splitOn }: { closeHref: string; head: HeadData | null; banks: Option[]; gstin: string | null; splitOn: boolean }) {
  const [taxable, setTaxable] = useState(head?.taxable ?? false);
  return (
    <SheetForm title={head ? `Change ${head.name}` : "Add fee head"} sub={head ? "Name, GST and bank account. Rows already paid keep their old values." : "Then add it to the classes that pay it"}
      closeHref={closeHref} action={saveHeadAction} submitLabel={head ? "Save fee head" : "Add fee head"} pendingText="Saving…" hidden={head ? { headId: head.id } : undefined}
      extraButtons={head && !head.system ? <ArchiveHead id={head.id} name={head.name} /> : undefined}>
      <SText name="name" label="Name" required start={head?.name} placeholder="Example: Robotics club" maxLength={80} />
      <SSelect name="kind" label="Kind" start={head?.kind ?? "other"} options={HEAD_KINDS.map((k) => ({ value: k, label: headKindLabel(k) }))} help="Used for reports and the fee certificate (tuition is shown on its own)." />
      <div className="rounded-xl border border-line flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1 text-[14px]">
          <b className="font-semibold block">Taxable (GST)</b>
          <span className="block text-[12.5px] text-ink3 mt-0.5">{gstin ? `Uses the school’s GSTIN ${gstin} from School Profile` : "Add the school’s GSTIN in School Profile first"}</span>
        </div>
        <input type="checkbox" name="taxable" checked={taxable} onChange={(e) => setTaxable(e.target.checked)} className="size-5 accent-[var(--color-brand)]" aria-label="Taxable (GST)" />
      </div>
      {taxable && (
        <div className="grid grid-cols-2 gap-3">
          <SSelect name="gstRate" label="GST rate" required start={head?.gstRate || "18"} options={[{ value: "5", label: "5%" }, { value: "12", label: "12%" }, { value: "18", label: "18%" }, { value: "28", label: "28%" }]} />
          <SText name="sacCode" label="SAC or HSN code" start={head?.sacCode} help="Printed on the tax invoice" inputMode="numeric" />
        </div>
      )}
      {splitOn && <SSelect name="bankAccountId" label="Bank account" start={head?.bankAccountId ?? ""} options={[{ value: "", label: "Main bank account" }, ...banks]} help="Fees into different bank accounts is on" />}
      <SSwitch name="lateFeeApplies" title="Late fee applies" sub="When on, the late fee rule in Fee Settings adds to this head when it is overdue." start={head?.lateFeeApplies ?? true} />
    </SheetForm>
  );
}

function ArchiveHead({ id, name }: { id: string; name: string }) {
  return (
    <ConfirmButton trigger="Archive" triggerVariant="danger-outline" title={`Archive ${name}?`} confirmLabel="Archive" confirmVariant="danger"
      onConfirm={() => run(archiveHeadAction, { headId: id })}>
      It can no longer be added to fees. Old receipts and reports keep it.
    </ConfirmButton>
  );
}

/** Runs a server action from a confirmation; returns the problem in words, if any. */
async function run(fn: (prev: unknown, fd: FormData) => Promise<FormState<unknown>>, fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  const r = await fn(null, fd);
  return r && !r.ok ? r.message || "That did not work. Nothing was changed." : undefined;
}

type Inst = { label: string; due: string; amount: string };
const rupeesToPaise = (v: string) => {
  const t = v.replace(/[,₹\s]/g, "");
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(t)) return null;
  const [r, p = ""] = t.split(".");
  return BigInt(r) * BigInt(100) + BigInt((p + "00").slice(0, 2));
};
const paiseToRupees = (p: bigint) => (p % BigInt(100) === BigInt(0) ? String(p / BigInt(100)) : (Number(p) / 100).toFixed(2));

export function RowSheet({ closeHref, yearId, classId, category, className, heads, yearStart, terms, row, draft, students }: {
  closeHref: string; yearId: string; classId: string; category: string; className: string; heads: Option[]; yearStart: string; terms: { name: string; startDate: string }[];
  row: { feeHeadId: string; frequency: FrequencyValue; total: string; installments: Inst[] } | null; draft: boolean; students: number;
}) {
  const [head, setHead] = useState(row?.feeHeadId ?? heads[0]?.value ?? "");
  const [freq, setFreq] = useState<FrequencyValue>(row?.frequency ?? "YEARLY");
  const [total, setTotal] = useState(row?.total ?? "");
  const make = (f: FrequencyValue, t: string): Inst[] => {
    const p = rupeesToPaise(t) ?? BigInt(0);
    return defaultSchedule(f, p, new Date(`${yearStart}T00:00:00Z`), terms.map((x) => ({ name: x.name, startDate: new Date(`${x.startDate}T00:00:00Z`) })))
      .map((d) => ({ label: d.label, due: d.dueDate.toISOString().slice(0, 10), amount: paiseToRupees(d.amountPaise) }));
  };
  const [inst, setInst] = useState<Inst[]>(row?.installments ?? make("YEARLY", ""));
  const totalP = rupeesToPaise(total);
  const sum = inst.reduce((a, x) => a + (rupeesToPaise(x.amount) ?? BigInt(0)), BigInt(0));
  const adds = totalP !== null && totalP > BigInt(0) && sum === totalP;
  const set = (i: number, k: keyof Inst, v: string) => setInst(inst.map((y, j) => (j === i ? { ...y, [k]: v } : y)));
  return (
    <SheetForm title={`${row ? "Change fee row" : "Add fee row"} · ${className}`} closeHref={closeHref} action={saveRowAction} pendingText="Saving…"
      sub={draft ? "Saved in the draft. Students’ fees change only when you publish." : "Saved in a new draft version. Students’ fees change only when you publish it."}
      submitLabel="Save in draft" hidden={{ yearId, classId, category, ...(row ? { wasHeadId: row.feeHeadId } : {}) }}>
      <SelectField name="feeHeadId" label="Fee head" required value={head} onChange={(e) => setHead(e.target.value)} options={heads} />
      <div className="grid grid-cols-2 gap-3">
        <TextField name="total" label="Amount for the year" required inputMode="decimal" value={total} className="tnum"
          onChange={(e) => { setTotal(e.target.value); setInst(make(freq, e.target.value)); }} placeholder="₹ 0" />
        <SelectField name="frequency" label="Frequency" required value={freq} onChange={(e) => { const f = e.target.value as FrequencyValue; setFreq(f); setInst(make(f, total)); }} options={FREQUENCIES.map((f) => ({ value: f.value, label: f.label }))} />
      </div>
      <FieldShell id="inst" label="Installments" help="Due on the 10th by default. Change any name, date or amount.">
        <ul className="flex flex-col gap-2">
          {inst.map((x, i) => (
            <li key={i} className="grid grid-cols-[1.2fr_1fr_0.9fr_auto] gap-2 items-center">
              <input aria-label={`Installment ${i + 1} name`} name="instLabel" value={x.label} onChange={(e) => set(i, "label", e.target.value)} className={cx(inputCls(), "h-10")} />
              <input aria-label={`Installment ${i + 1} due date`} name="instDue" type="date" value={x.due} onChange={(e) => set(i, "due", e.target.value)} className={cx(inputCls(), "h-10 tnum")} />
              <input aria-label={`Installment ${i + 1} amount`} name="instAmount" inputMode="decimal" value={x.amount} onChange={(e) => set(i, "amount", e.target.value)} className={cx(inputCls(), "h-10 tnum")} />
              <IconButton icon={Trash2} label={`Remove installment ${i + 1}`} size={36} disabled={inst.length === 1} onClick={() => setInst(inst.filter((_, j) => j !== i))} />
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <Button size="sm" variant="ghost" icon={Plus} onClick={() => setInst([...inst, { label: `Installment ${inst.length + 1}`, due: inst.at(-1)?.due ?? yearStart, amount: "" }])}>Add installment</Button>
          <p className={cx("text-[12.5px] flex items-center gap-1.5", adds ? "text-ok" : "text-ink3")}>
            {adds ? <><CircleCheck size={14} aria-hidden="true" />Adds up to {formatRupees(totalP!)}</> : <><CircleAlert size={14} aria-hidden="true" />Installments add up to {formatRupees(sum)}{totalP ? `. Total is ${formatRupees(totalP)}.` : "."}</>}
          </p>
        </div>
      </FieldShell>
      <p className="text-[13px] text-ink3">Applies to {className}{category ? ` (${category})` : ""}: {students} {students === 1 ? "student" : "students"}. For one student only, use the student’s ledger.</p>
    </SheetForm>
  );
}

export function RemoveRow({ yearId, classId, category, feeHeadId, name }: { yearId: string; classId: string; category: string; feeHeadId: string; name: string }) {
  return (
    <ConfirmButton trigger={<><Trash2 size={15} aria-hidden="true" />Remove</>} triggerVariant="ghost" title={`Remove ${name}?`} confirmLabel="Remove from draft" confirmVariant="danger"
      onConfirm={() => run(removeRowAction, { yearId, classId, category, feeHeadId })}>
      It comes off the draft. Students’ fees change only when you publish.
    </ConfirmButton>
  );
}

/**
 * Publish a draft. After the year has started, someone other than the Principal
 * sends it to the Principal instead (needsOk); the Principal's own change
 * applies at once, because they are the approver (owner's changes of 14 Oct 2026).
 */
export function PublishSheet({ closeHref, structureId, version, impact, start, withoutPlan, needsOk = false, approver = false }: {
  closeHref: string; structureId: string; version: number; impact: string; start: string; withoutPlan: number;
  /** Mid-year, not the Principal: goes to Approvals. */
  needsOk?: boolean;
  /** The Principal, mid-year: applies at once. */
  approver?: boolean;
}) {
  return (
    <SheetForm title={needsOk ? `Send version ${version} for approval` : `Publish version ${version}`}
      sub={needsOk ? "This year has started, so the Principal decides. Nothing changes for students until they approve. Paid rows never change."
        : approver ? "You approve fee changes, so this applies at once, to unpaid installments only. Parents see it in Parent Link."
          : "The new version is in use from the date you choose. Paid rows never change."}
      closeHref={closeHref} action={publishAction} submitLabel={needsOk ? "Send for approval" : "Publish"} pendingText={needsOk ? "Sending…" : "Publishing…"} hidden={{ structureId }}>
      <SDate name="effectiveFrom" label="Applies from" required start={start} help="Unpaid installments due on or after this date follow the new version." />
      <Alert tone="warning">{impact}</Alert>
      {needsOk && <SArea name="reason" label="Why the fees change mid-year" required rows={3} help="The Principal sees this in Approvals." />}
      {!needsOk && withoutPlan > 0 && <SSwitch name="assign" title={`Give it to ${withoutPlan} ${withoutPlan === 1 ? "student" : "students"} without fees`} sub="Students of the class who have no fees for this year yet." start />}
      <label className="flex items-start gap-3 text-[14px]"><input type="checkbox" name="confirm" className="mt-1 size-4 accent-[var(--color-brand)]" /><span>I have checked the amounts and installments.</span></label>
    </SheetForm>
  );
}

export function CopySheet({ closeHref, fromId, yearId, className, classes }: { closeHref: string; fromId: string; yearId: string; className: string; classes: Option[] }) {
  return (
    <SheetForm title={`Copy ${className} to other classes`} sub="Each class gets its own draft you can change before publishing." closeHref={closeHref}
      action={copyAction} submitLabel="Make drafts" pendingText="Copying…" hidden={{ fromId, yearId }}>
      <SChips name="classId" label="Classes" required options={classes} />
      <SText name="percent" label="Change amounts by (%)" start="0" inputMode="decimal" help="0 copies the same amounts. 5 adds 5%." />
    </SheetForm>
  );
}

export function PrepareSheet({ closeHref, fromYearId, toYearId, fromName, toName }: { closeHref: string; fromYearId: string; toYearId: string; fromName: string; toName: string }) {
  return (
    <SheetForm title={`Prepare ${toName}`} sub={`Copies every class’s structure from ${fromName} as drafts. Nothing changes for this year.`} closeHref={closeHref}
      action={prepareYearAction} submitLabel={`Open ${toName} drafts`} pendingText="Copying…" hidden={{ fromYearId, toYearId }}>
      <SText name="percent" label="Increase amounts by (%)" start="5" inputMode="decimal" help="Due dates move to the new year. Check each class before you publish." />
    </SheetForm>
  );
}

export function RestoreSheet({ closeHref, structureId, version, start }: { closeHref: string; structureId: string; version: number; start: string }) {
  return (
    <SheetForm title={`Use version ${version} again`} sub="It is published again as a new version. Paid rows never change." closeHref={closeHref}
      action={restoreAction} submitLabel="Use this version" pendingText="Restoring…" hidden={{ structureId }}>
      <SDate name="effectiveFrom" label="Applies from" required start={start} />
      <label className="flex items-start gap-3 text-[14px]"><input type="checkbox" name="confirm" className="mt-1 size-4 accent-[var(--color-brand)]" /><span>Unpaid installments from this date change back to version {version}.</span></label>
    </SheetForm>
  );
}

/** Discard the open draft (after a confirmation). */
export function DiscardDraft({ structureId }: { structureId: string }) {
  return (
    <ConfirmButton trigger="Discard draft" triggerVariant="ghost" title="Discard this draft?" confirmLabel="Discard draft" confirmVariant="danger"
      onConfirm={() => run(discardAction, { structureId })}>
      The changes in the draft are thrown away. The version in use stays as it is.
    </ConfirmButton>
  );
}

/** Gives the published plan to the class's students who have no fees yet. */
export function AssignClass({ structureId, label }: { structureId: string; label: string }) {
  const [state, action, pending] = useActionState<FormState<unknown>, FormData>(assignClassAction as never, null);
  return (
    <form action={action} className="inline-flex flex-col">
      <input type="hidden" name="structureId" value={structureId} />
      <Button type="submit" variant="secondary" loading={pending}>{label}</Button>
      {state && !state.ok && <span className="text-[12px] text-bad" role="alert">{state.message}</span>}
    </form>
  );
}
