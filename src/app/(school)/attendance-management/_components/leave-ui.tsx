"use client";

// Student Leave in the approved design (design/ui-prototype/src/mod-attendance.jsx
// LeavePage): Record leave, the reason sheets for Reject and Cancel, the one-tap
// Approve, and approving several at once. Every action is a server action that
// checks the person's reach again.

import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { Camera, Check, CircleCheck, FileText, Plus, Search, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button, Spinner, type ButtonVariant } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Switch } from "@/components/ui/controls";
import { inputCls, FieldShell } from "@/components/ui/field";
import { SettingRow } from "@/components/ui/rows";
import { useCloseUrlSheet } from "@/components/ui/url-controls";
import { cx } from "@/components/ui/cx";
import type { FormState } from "@/lib/forms";
import { ActionSheet, FormProblem, QuickChips, type Action } from "./sheet-form";

type Found = { id: string; label: string; detail: string };
type PreviewState = FormState<{ text: string; canApprove: boolean; warn: boolean }>;

function StudentPicker({ find, error, onPick, placeholder }: { find: (q: string) => Promise<Found[]>; error?: string; onPick: () => void; placeholder: string }) {
  const id = useId();
  const [q, setQ] = useState("");
  const [list, setList] = useState<Found[]>([]);
  const [chosen, setChosen] = useState<Found | null>(null);
  const [pending, start] = useTransition();
  const [searched, setSearched] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const search = (v: string) => {
    setQ(v);
    setSearched(false);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) { setList([]); return; }
    timer.current = setTimeout(() => start(async () => {
      try { setList(await find(v)); } catch { setList([]); }
      setSearched(true);
    }), 250);
  };
  const pick = (s: Found | null) => { setChosen(s); setList([]); setQ(""); onPick(); };
  return (
    <FieldShell label="Student" id={id} required error={error}>
      <input type="hidden" name="studentId" value={chosen?.id ?? ""} />
      {chosen ? (
        <div className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
          <Avatar name={chosen.label} size={36} />
          <div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px] truncate">{chosen.label}</p><p className="text-[12.5px] text-ink3 truncate">{chosen.detail}</p></div>
          <Button size="sm" variant="ghost" onClick={() => pick(null)}>Change</Button>
        </div>
      ) : (
        <div className="relative">
          <Search size={18} className="absolute left-3.5 top-[22px] -translate-y-1/2 text-ink3 pointer-events-none" aria-hidden="true" />
          <input id={id} type="search" value={q} onChange={(e) => search(e.target.value)} placeholder={placeholder} autoComplete="off"
            role="combobox" aria-expanded={list.length > 0} aria-controls={`${id}-list`} aria-invalid={error ? true : undefined}
            className={cx(inputCls(error), "h-11 pl-10 pr-10")} />
          {pending && <Spinner className="absolute right-3.5 top-[22px] -translate-y-1/2 text-ink3" />}
          {list.length > 0 && (
            <ul id={`${id}-list`} role="listbox" className="mt-1.5 rounded-xl border border-line bg-surface shadow-pop p-1.5 max-h-64 overflow-y-auto">
              {list.map((s) => (
                <li key={s.id} role="option" aria-selected="false">
                  <button type="button" onClick={() => pick(s)} className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-sunken text-left">
                    <Avatar name={s.label} size={30} />
                    <span className="min-w-0 flex-1"><span className="block font-semibold text-[14px] truncate">{s.label}</span><span className="block text-[12px] text-ink3 truncate">{s.detail}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {searched && !pending && q.trim().length >= 2 && list.length === 0 && <p className="text-[12.5px] text-ink3 mt-1.5">No student called &ldquo;{q.trim()}&rdquo; that you may record leave for.</p>}
        </div>
      )}
    </FieldShell>
  );
}

/** Days counted, quota and who decides, checked on the server as the form changes. */
function LivePreview({ preview, onResult, tick }: { preview: (s: PreviewState, fd: FormData) => Promise<PreviewState>; onResult: (s: PreviewState) => void; tick: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const report = useRef(onResult);
  const [state, setState] = useState<PreviewState>(null);
  const [pending, start] = useTransition();
  useEffect(() => { report.current = onResult; }, [onResult]);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const fd = new FormData(form);
        if (!fd.get("studentId") || !fd.get("leaveTypeId") || !fd.get("from")) { setState(null); report.current(null); return; }
        fd.delete("document");
        start(async () => { const s = await preview(null, fd); setState(s); report.current(s); });
      }, 300);
    };
    form.addEventListener("change", run);
    form.addEventListener("input", run);
    run();
    return () => { form.removeEventListener("change", run); form.removeEventListener("input", run); if (timer) clearTimeout(timer); };
  }, [preview, tick]);
  return (
    <div ref={ref} aria-live="polite" className={cx("-mt-1", !pending && !state && "hidden")}>
      {pending ? <p className="flex items-center gap-2 text-[13px] text-ink3"><Spinner size={14} /> Counting school days…</p>
        : state ? <p className={cx("rounded-xl px-3 py-2 text-[13px]", !state.ok ? "bg-bad/10 text-bad" : state.data?.warn ? "bg-warn/12 text-warn" : "bg-sunken text-ink2")}>{state.ok ? state.data?.text : state.message}</p> : null}
    </div>
  );
}

export function RecordLeaveButton({ action, preview, find, types, today, placeholder, defaultOpen, sub }: {
  action: Action; preview: (s: PreviewState, fd: FormData) => Promise<PreviewState>; find: (q: string) => Promise<Found[]>;
  types: { value: string; label: string }[]; today: string; placeholder: string; defaultOpen?: boolean; sub: string;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const [half, setHalf] = useState(false);
  const [canApprove, setCanApprove] = useState(false);
  const [approveNow, setApproveNow] = useState(true);
  const [tick, setTick] = useState(0);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const reset = () => { setHalf(false); setCanApprove(false); setApproveNow(true); setFrom(today); setTo(today); setReason(""); setFile(null); };
  return (
    <>
      <Button variant="primary" icon={Plus} onClick={() => { reset(); setOpen(true); }}>Record leave</Button>
      <ActionSheet open={open} onClose={() => setOpen(false)} title="Record student leave" sub={sub}
        action={action} submitLabel="Record leave" pendingText="Saving…">
        {(f) => (
          <>
            <StudentPicker find={find} error={f.err("studentId")} onPick={() => setTick((t) => t + 1)} placeholder={placeholder} />
            <FieldShell label="Leave type" id="rl-type" required error={f.err("leaveTypeId")}>
              <select id="rl-type" name="leaveTypeId" defaultValue={f.val("leaveTypeId", types[0]?.value)} className={cx(inputCls(f.err("leaveTypeId")), "h-11")}>
                {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </FieldShell>
            <div className="grid grid-cols-2 gap-3">
              <FieldShell label="From" id="rl-from" required error={f.err("from")}>
                <input id="rl-from" name="from" type="date" value={from} onChange={(e) => { if (to === from) setTo(e.target.value); setFrom(e.target.value); }} className={cx(inputCls(f.err("from")), "h-11 tnum")} />
              </FieldShell>
              <FieldShell label="To" id="rl-to" required error={f.err("to")}>
                <input id="rl-to" name="to" type="date" value={half ? from : to} disabled={half} min={from} onChange={(e) => setTo(e.target.value)} className={cx(inputCls(f.err("to")), "h-11 tnum disabled:opacity-60")} />
              </FieldShell>
            </div>
            <LivePreview preview={preview} tick={tick} onResult={(s) => setCanApprove(Boolean(s?.ok && s.data?.canApprove))} />
            <div className="rounded-xl border border-line">
              <SettingRow id="rl-half" title="Half day" sub="Leaves early or comes late, on one date">
                <Switch id="rl-half" name="halfDay" on={half} onChange={(v) => { setHalf(v); setTick((t) => t + 1); }} label="Half day" />
              </SettingRow>
            </div>
            <FieldShell label="Reason" id="rl-reason" required error={f.err("reason")}>
              <QuickChips items={["Fever", "Family function", "Doctor's appointment", "Travelling out of town"]} onPick={setReason} />
              <textarea id="rl-reason" name="reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="As the parent said it"
                className={cx(inputCls(f.err("reason")), "mt-2 py-2.5 min-h-[72px]")} />
            </FieldShell>
            <FieldShell label="Document" id="rl-doc" help={f.err("document") ? undefined : "Optional. A photo or PDF, such as a doctor's note. Up to 10 MB."} error={f.err("document")}>
              <input ref={fileRef} id="rl-doc" name="document" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              {file ? (
                <div className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
                  <span className="w-9 h-9 rounded-lg bg-sunken grid place-items-center text-ink3"><FileText size={17} aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1"><p className="font-semibold text-[14px] truncate">{file.name}</p><p className="text-[12px] text-ink3">{(file.size / 1048576).toFixed(1)} MB</p></div>
                  <Button size="sm" variant="ghost" icon={X} aria-label="Remove the document" onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ""; }} />
                </div>
              ) : <Button variant="secondary" icon={Camera} onClick={() => fileRef.current?.click()}>Add photo or file</Button>}
            </FieldShell>
            {canApprove && (
              <div className="rounded-xl border border-line">
                <SettingRow id="rl-approve" title="Approve now" sub="You may decide this leave. Turn off to send it to Approvals instead.">
                  <Switch id="rl-approve" on={approveNow} onChange={setApproveNow} label="Approve now" />
                </SettingRow>
                {approveNow && <input type="hidden" name="approveNow" value="on" />}
              </div>
            )}
          </>
        )}
      </ActionSheet>
    </>
  );
}

/** A button that opens a sheet asking for a reason (Reject, Cancel leave). */
export function ReasonButton({ label, variant = "secondary", title, sub, confirm, chips, action, hidden, field = "note", closeParam }: {
  label: string; variant?: ButtonVariant; title: string; sub?: string; confirm: string; chips: string[]; action: Action; hidden: Record<string, string>; field?: string; closeParam?: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const close = useCloseUrlSheet(closeParam ?? "open");
  return (
    <>
      <Button variant={variant} onClick={() => { setText(""); setOpen(true); }}>{label}</Button>
      <ActionSheet open={open} onClose={() => setOpen(false)} title={title} sub={sub} action={action} hidden={hidden}
        submitLabel={confirm} submitVariant="danger" submitIcon={null} cancelLabel="Keep it" onSaved={() => { if (closeParam) close(); }}>
        {(f) => (
          <FieldShell label="Reason" id={`why-${field}`} required error={f.err(field)}>
            <QuickChips items={chips} onPick={setText} />
            <textarea id={`why-${field}`} name={field} rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a reason"
              className={cx(inputCls(f.err(field)), "mt-2 py-2.5 min-h-[88px]")} />
          </FieldShell>
        )}
      </ActionSheet>
    </>
  );
}

/** One tap: runs the action with hidden fields, then closes the open record. */
export function TapButton({ label, pendingText, action, hidden, variant = "primary", closeParam, icon = true }: {
  label: string; pendingText: string; action: Action; hidden: Record<string, string>; variant?: ButtonVariant; closeParam?: string; icon?: boolean;
}) {
  const [state, run] = useActionState(action, null);
  const close = useCloseUrlSheet(closeParam ?? "open");
  const done = useRef(false);
  useEffect(() => { if (state?.ok && closeParam && !done.current) { done.current = true; close(); } }, [state, close, closeParam]);
  return (
    <form action={run} className="contents">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {state && !state.ok && <div className="w-full order-first mb-2"><FormProblem state={state} /></div>}
      <SubmitButton variant={variant} pendingText={pendingText}>{icon && <Check size={17} strokeWidth={2.2} aria-hidden="true" />}{label}</SubmitButton>
    </form>
  );
}

/** The bar that shows when leave requests are ticked: approve them all after a check. */
export function BulkApprove({ formId, action }: { formId: string; action: Action }) {
  const [ids, setIds] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    const read = () => setIds([...document.querySelectorAll<HTMLInputElement>(`input[form="${formId}"][name="ids"]:checked`)].map((x) => x.value));
    document.addEventListener("change", read);
    read();
    return () => document.removeEventListener("change", read);
  }, [formId]);
  const clear = () => {
    document.querySelectorAll<HTMLInputElement>(`input[form="${formId}"][name="ids"]`).forEach((x) => { x.checked = false; });
    setIds([]);
  };
  if (!ids.length) return null;
  return (
    <>
      <div className="flex items-center gap-3 px-4 py-2.5 bg-brand/8 border-b border-line animate-rise" role="status">
        <p className="text-[14px] font-semibold flex-1"><span className="tnum">{ids.length}</span> selected</p>
        <Button size="sm" variant="ghost" onClick={clear}>Clear</Button>
        <Button size="sm" variant="secondary" icon={CircleCheck} onClick={() => setConfirm(true)}>Approve</Button>
      </div>
      <ActionSheet open={confirm} onClose={() => setConfirm(false)} title={`Approve ${ids.length} leave ${ids.length === 1 ? "request" : "requests"}?`}
        action={action} hidden={{ ids: ids.join(",") }} submitLabel={`Approve ${ids.length} ${ids.length === 1 ? "request" : "requests"}`} pendingText="Approving…" onSaved={clear}>
        {() => <p className="text-[14px] text-ink2">Each day shows as Leave in Take Attendance, and no absence message goes to the parent for those days.</p>}
      </ActionSheet>
    </>
  );
}

/** A tick box for one row, tied to the bulk form by its id. */
export function RowTick({ formId, id, label }: { formId: string; id: string; label: string }) {
  return <input type="checkbox" form={formId} name="ids" value={id} aria-label={label} className="size-[18px] rounded accent-brand cursor-pointer" />;
}

/** Ticks or clears every row at once. */
export function AllTick({ formId }: { formId: string }) {
  const [on, setOn] = useState(false);
  return (
    <input type="checkbox" aria-label="Select all" checked={on} className="size-[18px] rounded accent-brand cursor-pointer"
      onChange={(e) => {
        setOn(e.target.checked);
        document.querySelectorAll<HTMLInputElement>(`input[form="${formId}"][name="ids"]`).forEach((x) => { x.checked = e.target.checked; });
        document.dispatchEvent(new Event("change"));
      }} />
  );
}

