"use client";

// Correction request (05 §2 Attendance Register): who, the new status and a
// reason. The people clicked in the register come ticked.

import { useMemo, useState } from "react";
import { SelectField, TextArea, TextField } from "@/components/ui/field";
import { ActionForm, type Action } from "../../staff-hr-management/_components/forms";
import { toneClass, type StatusView } from "./status";

export type CorrectionPerson = { id: string; label: string; current: string | null; checked: boolean };

export function CorrectionForm({ action, hidden, people, statuses, forWhom }: {
  action: Action; hidden: Record<string, string>; people: CorrectionPerson[]; statuses: StatusView[]; forWhom: "student" | "staff";
}) {
  const [q, setQ] = useState("");
  const byKey = useMemo(() => new Map(statuses.map((s) => [s.key, s])), [statuses]);
  const shown = q.trim() ? people.filter((p) => p.label.toLowerCase().includes(q.trim().toLowerCase()) || p.checked) : people;
  return (
    <ActionForm action={action} hidden={hidden} submitLabel="Send for approval" pendingText="Sending…" keep>
      {(f) => (
        <>
          <fieldset aria-describedby={f.err("people") ? "people-error" : undefined}>
            <legend className="mb-1 font-medium">{forWhom === "staff" ? "Staff member" : "Student(s)"} <span className="text-danger">*</span></legend>
            {people.length > 8 && (
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find by name" aria-label="Find by name"
                className="mb-2 h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-base" />
            )}
            <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-xl border border-line">
              {shown.map((p) => {
                const st = p.current ? byKey.get(p.current) : undefined;
                return (
                  <li key={p.id}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-surface-2">
                      <input type="checkbox" name="people" value={p.id} defaultChecked={p.checked} className="size-5 accent-[var(--brand)]" />
                      <span className="min-w-0 flex-1 truncate">{p.label}</span>
                      <span className={`shrink-0 rounded-md border px-2 py-0.5 text-xs ${st ? toneClass(st.tone) : "border-dashed border-line-strong text-ink-2"}`}>
                        Now: {st?.name ?? "Not marked"}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {f.err("people") && <p id="people-error" className="mt-1 text-sm text-danger">{f.err("people")}</p>}
          </fieldset>
          <SelectField label="New status" name="status" required placeholder="Choose the new status" error={f.err("status")} defaultValue={f.val("status") ?? ""}
            options={statuses.map((s) => ({ value: s.key, label: `${s.name} (${s.letter})` }))} />
          <TextField label="Note on the entry" name="note" maxLength={300} defaultValue={f.val("note")} help="Optional. For example: came at 10:15, doctor's visit." />
          <TextArea label="Reason" name="reason" required minLength={5} maxLength={500} rows={3} defaultValue={f.val("reason")} error={f.err("reason")}
            help="The approver sees this. For example: marked absent by mistake; the student was at the sports trial." />
        </>
      )}
    </ActionForm>
  );
}
