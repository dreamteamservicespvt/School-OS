"use client";

// Record student leave (05 §2 Student Leave): find the student, the type
// (Medical by default), dates, half day, reason and an optional document.
// The days counted and the quota show as soon as the form has enough.

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { CheckboxField, SelectField, TextArea, TextField } from "@/components/ui/field";
import { Spinner } from "@/components/ui/button";
import { SearchIcon } from "@/components/icons";
import type { FormState } from "@/lib/forms";
import { FormDialog, type Action } from "../../staff-hr-management/_components/forms";

type Option = { value: string; label: string };
type Found = { id: string; label: string; detail: string };
type PreviewState = FormState<{ text: string; canApprove: boolean; warn: boolean }>;

function StudentPicker({ find, error, fixed, onPick }: { find: (q: string) => Promise<Found[]>; error?: string; fixed?: Found; onPick: () => void }) {
  const id = useId();
  const [q, setQ] = useState("");
  const [list, setList] = useState<Found[]>([]);
  const [chosen, setChosen] = useState<Found | null>(fixed ?? null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const search = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) { setList([]); return; }
    timer.current = setTimeout(() => start(async () => { try { setList(await find(v)); } catch { setList([]); } }), 250);
  };
  return (
    <div className="sm:col-span-2">
      <input type="hidden" name="studentId" value={chosen?.id ?? ""} />
      <label htmlFor={id} className="mb-1 block text-sm font-medium">Student <span className="text-danger">*</span></label>
      {chosen ? (
        <div className="flex min-h-11 items-center justify-between gap-2 rounded-lg border border-line-strong bg-surface-2 px-3 py-2">
          <div><p className="font-medium">{chosen.label}</p><p className="text-sm text-ink-2">{chosen.detail}</p></div>
          {!fixed && <button type="button" className="min-h-11 px-2 font-medium text-brand-text hover:underline" onClick={() => { setChosen(null); setQ(""); setList([]); onPick(); }}>Change</button>}
        </div>
      ) : (
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-3 size-5 text-ink-2" />
          <input id={id} type="search" value={q} onChange={(e) => search(e.target.value)} placeholder="Type a name or admission number" autoComplete="off"
            aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} role="combobox" aria-expanded={list.length > 0} aria-controls={`${id}-list`}
            className={`h-11 w-full rounded-lg border bg-surface pl-10 pr-10 text-base ${error ? "border-danger" : "border-line-strong"}`} />
          {pending && <Spinner className="absolute right-3 top-3.5 size-4 text-ink-2" />}
          {list.length > 0 && (
            <ul id={`${id}-list`} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-line bg-surface shadow-pop">
              {list.map((s) => (
                <li key={s.id} role="option" aria-selected="false">
                  <button type="button" onClick={() => { setChosen(s); setList([]); onPick(); }} className="block w-full px-3 py-2 text-left hover:bg-surface-2">
                    <span className="font-medium">{s.label}</span><span className="block text-sm text-ink-2">{s.detail}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q.trim().length >= 2 && !pending && list.length === 0 && <p className="mt-1 text-sm text-ink-2">No student found. Only students you may record leave for are shown.</p>}
        </div>
      )}
      {error && <p id={`${id}-error`} className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}

function AutoPreview({ preview, onResult, tick }: { preview: (s: PreviewState, fd: FormData) => Promise<PreviewState>; onResult: (s: PreviewState) => void; tick: number }) {
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
        if (!fd.get("studentId") || !fd.get("leaveTypeId") || !fd.get("from")) return;
        fd.delete("document");
        start(async () => { const s = await preview(null, fd); setState(s); report.current(s); });
      }, 300);
    };
    form.addEventListener("change", run);
    run();
    return () => { form.removeEventListener("change", run); if (timer) clearTimeout(timer); };
  }, [preview, tick]);
  return (
    <div ref={ref} className="sm:col-span-2" aria-live="polite">
      {pending ? <p className="flex items-center gap-2 text-sm text-ink-2"><Spinner className="size-4" /> Checking days and quota…</p>
        : state ? <p className={`rounded-lg px-3 py-2 text-sm ${!state.ok ? "bg-danger-soft text-danger" : state.data?.warn ? "bg-warn-bg text-warn-text" : "bg-surface-2"}`}>{state.ok ? state.data?.text : state.message}</p>
          : null}
    </div>
  );
}

export function RecordLeaveForm({ action, preview, find, types, today, defaultOpen, fixedStudent }: {
  action: Action; preview: (s: PreviewState, fd: FormData) => Promise<PreviewState>; find: (q: string) => Promise<Found[]>;
  types: Option[]; today: string; defaultOpen?: boolean; fixedStudent?: Found;
}) {
  const [half, setHalf] = useState(false);
  const [canApprove, setCanApprove] = useState(false);
  const [tick, setTick] = useState(0);
  const medical = types[0]?.value ?? "";
  return (
    <FormDialog trigger="Record leave" triggerVariant="primary" title="Record student leave" action={action} submitLabel="Save leave" pendingText="Saving…" wide multipart defaultOpen={defaultOpen}>
      {(f) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <StudentPicker find={find} error={f.err("studentId")} fixed={fixedStudent} onPick={() => setTick((t) => t + 1)} />
          <SelectField label="Leave type" name="leaveTypeId" required options={types} defaultValue={f.val("leaveTypeId", medical)} error={f.err("leaveTypeId")} className="sm:col-span-2" />
          <TextField label="From date" name="from" type="date" required defaultValue={f.val("from", today)} error={f.err("from")} />
          {!half && <TextField label="To date" name="to" type="date" required defaultValue={f.val("to", today)} error={f.err("to")} help="Sundays and holidays inside are not counted." />}
          <CheckboxField label="Half day" name="halfDay" checked={half} onChange={(e) => setHalf(e.target.checked)} help="For one date only." className="sm:col-span-2" />
          <TextArea label="Reason" name="reason" required rows={2} maxLength={500} defaultValue={f.val("reason")} error={f.err("reason")} className="sm:col-span-2"
            help="For example: fever, the parent called at 8:10 AM." />
          <div className="sm:col-span-2">
            <label htmlFor="student-leave-doc" className="mb-1 block text-sm font-medium">Document</label>
            <input id="student-leave-doc" name="document" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="block w-full rounded-lg border border-line-strong bg-surface p-2 text-sm" aria-describedby="student-leave-doc-help" />
            <p id="student-leave-doc-help" className={`mt-1 text-sm ${f.err("document") ? "text-danger" : "text-ink-2"}`}>{f.err("document") ?? "Optional. A photo or PDF, such as a doctor's note. Up to 10 MB."}</p>
          </div>
          <AutoPreview preview={preview} tick={tick} onResult={(s) => setCanApprove(Boolean(s?.ok && s.data?.canApprove))} />
          {canApprove && <CheckboxField label="Approve now" name="approveNow" defaultChecked className="sm:col-span-2" help="You may decide this leave. Leave it ticked to approve it as you save; untick to send it to Approvals." />}
        </div>
      )}
    </FormDialog>
  );
}

export function CancelStudentLeave({ requestId, action, name }: { requestId: string; action: Action; name: string }) {
  return (
    <FormDialog trigger="Cancel" triggerSize="sm" triggerVariant="ghost" title={`Cancel leave for ${name}`} action={action} submitLabel="Cancel leave" submitVariant="danger" hidden={{ requestId }}>
      {(f) => (
        <>
          <p className="text-ink-2">Take Attendance stops showing Leave for the days still to come. Days already marked stay as they are.</p>
          <TextArea label="Reason" name="reason" required rows={2} minLength={3} maxLength={500} defaultValue={f.val("reason")} error={f.err("reason")} />
        </>
      )}
    </FormDialog>
  );
}

export type { Found as StudentFound, Option as LeaveTypeOption };
