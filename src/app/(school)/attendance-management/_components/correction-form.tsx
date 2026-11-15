"use client";

// Correction request (05 §2 Attendance Register): who, the new status and a
// reason. The people clicked in the register come ticked.

import { useMemo, useRef, useState } from "react";
import { SelectField, TextArea, TextField } from "@/components/ui/field";
import { ActionForm, type Action } from "../../staff-hr-management/_components/forms";
import { toneClass, type StatusView } from "./status";
import { Words, useT } from "@/lib/i18n/client";
import { NeedOne, ProblemText } from "@/components/ui/form-problems";

export type CorrectionPerson = { id: string; label: string; current: string | null; checked: boolean };

export function CorrectionForm({ action, hidden, people, statuses, forWhom, startStatus }: {
  action: Action; hidden: Record<string, string>; people: CorrectionPerson[]; statuses: StatusView[]; forWhom: "student" | "staff";
  /** The school's starting status for a register (present), used when a whole day is filled here. */
  startStatus?: string | null;
}) {
  const [q, setQ] = useState("");
  const t = useT();
  const list = useRef<HTMLUListElement>(null);
  // A missed day is the usual mistake: one press ticks everyone listed (live test 20).
  const tickAll = (on: boolean) => list.current?.querySelectorAll<HTMLInputElement>('input[name="people"]').forEach((b) => {
    if (b.checked !== on) { b.checked = on; b.dispatchEvent(new Event("change", { bubbles: true })); b.dispatchEvent(new Event("input", { bubbles: true })); }
  });
  const byKey = useMemo(() => new Map(statuses.map((s) => [s.key, s])), [statuses]);
  const shown = q.trim() ? people.filter((p) => p.label.toLowerCase().includes(q.trim().toLowerCase()) || p.checked) : people;
  // Nothing saved for the day: the usual register, each student with their own status, sent once with one
  // reason. One status for everyone made a teacher send a request per status (layman loop 4).
  if (forWhom === "student" && people.length > 0 && people.every((p) => !p.current)) {
    const first = startStatus && byKey.has(startStatus) ? startStatus : "";
    return (
      <ActionForm action={action} hidden={{ ...hidden, sheet: "1" }} submitLabel="Send for approval" pendingText="Sending…" keep>
        {(f) => (
          <>
            {/* min-w-0: a fieldset is as wide as its widest line by default, which made this form 654 px wide on a
                390 px phone with every status but P off screen. On a phone the statuses sit under the name, four to a
                row, 44 px each, and the page scrolls (no box inside the page) (layman loop 5). */}
            <fieldset className="min-w-0">
              <legend className="mb-1 font-medium"><Words k="Mark each student" /> <span className="text-danger">*</span></legend>
              <p className="mb-2 text-sm text-ink-2"><Words k="Nothing was saved for this day. Mark everyone, then send it once." /></p>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {people.map((p) => (
                  <li key={p.id} className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center">
                    <input type="hidden" name="people" value={p.id} />
                    <span className="min-w-0 truncate sm:flex-1">{p.label}</span>
                    <span role="radiogroup" aria-label={p.label} className="grid grid-cols-4 gap-1.5 sm:flex sm:flex-wrap sm:gap-1">
                      {statuses.map((st) => (
                        <label key={st.key} title={t.any(st.name)} className="inline-flex h-11 min-w-11 px-1 cursor-pointer items-center justify-center rounded-lg border border-line-strong text-sm font-semibold has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-bg has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand">
                          <input type="radio" name={`to:${p.id}`} value={st.key} defaultChecked={f.val(`to:${p.id}`) ? f.val(`to:${p.id}`) === st.key : st.key === first} className="sr-only" />
                          <span aria-hidden="true">{st.letter}</span><span className="sr-only">{t.any(st.name)}</span>
                        </label>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
              <ProblemText name="people" given={f.err("people")} />
            </fieldset>
            <TextArea label="Reason" name="reason" required minLength={5} maxLength={500} rows={3} defaultValue={f.val("reason")} error={f.err("reason")}
              help="The approver sees this. For example: forgot to save on that day." />
          </>
        )}
      </ActionForm>
    );
  }
  return (
    <ActionForm action={action} hidden={hidden} submitLabel="Send for approval" pendingText="Sending…" keep>
      {(f) => (
        <>
          <fieldset className="min-w-0" aria-describedby={f.err("people") ? "people-error" : undefined}>
            <legend className="mb-1 font-medium">{forWhom === "staff" ? t("Staff member") : t("Student(s)")} <span className="text-danger">*</span></legend>
            {people.length > 8 && (
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Find by name")} aria-label={t("Find by name")}
                className="mb-2 h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-base" />
            )}
            {forWhom === "student" && shown.length > 1 && (
              <div className="mb-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => tickAll(true)} className="inline-flex min-h-11 items-center rounded-lg border border-line-strong px-3 text-sm font-medium hover:bg-surface-2"><Words k="Select all" />&nbsp;{shown.length}</button>
                <button type="button" onClick={() => tickAll(false)} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-ink-2 hover:text-ink"><Words k="Clear ticks" /></button>
              </div>
            )}
            <ul ref={list} className="max-h-80 divide-y divide-line overflow-y-auto rounded-xl border border-line">
              {shown.map((p) => {
                const st = p.current ? byKey.get(p.current) : undefined;
                return (
                  <li key={p.id}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface-2">
                      <input type="checkbox" name="people" value={p.id} defaultChecked={p.checked} className="size-5 accent-[var(--brand)]" />
                      <span className="min-w-0 flex-1 truncate">{p.label}</span>
                      <span className={`shrink-0 rounded-md border px-2 py-0.5 text-xs ${st ? toneClass(st.tone) : "border-dashed border-line-strong text-ink-2"}`}>
                        <Words k="Now:" /> {st ? t.any(st.name) : t("Not marked")}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <NeedOne name="people" message={forWhom === "staff" ? "Tick the staff member to correct." : "Tick at least one student to correct."} />
            <span id="people-error"><ProblemText name="people" given={f.err("people")} /></span>
          </fieldset>
          <SelectField label="New status" name="status" required placeholder="Choose the new status" error={f.err("status")} defaultValue={f.val("status") ?? ""}
            options={statuses.map((s) => ({ value: s.key, label: `${t.any(s.name)} (${s.letter})` }))} />
          <TextField label="Note on the entry" name="note" maxLength={300} defaultValue={f.val("note")} help="Optional. For example: came at 10:15, doctor's visit." />
          <TextArea label="Reason" name="reason" required minLength={5} maxLength={500} rows={3} defaultValue={f.val("reason")} error={f.err("reason")}
            help="The approver sees this. For example: marked absent by mistake." />
        </>
      )}
    </ActionForm>
  );
}
