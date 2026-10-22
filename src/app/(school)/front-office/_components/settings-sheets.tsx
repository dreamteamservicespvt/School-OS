"use client";

// Front Office settings (16 §6): the visitor policy, the pass expiry time,
// the appointment slot, the optional parts, and the three lists the desk
// edits inline. Only the Front Office manager sees these.

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { SheetForm, UrlSheet, useTyped } from "@/components/ui/url-sheet";
import { SSelect, SSwitch } from "@/components/ui/sheet-fields";
import { FieldShell, inputCls } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import type { FormState } from "@/lib/forms";
import { FRONT_OFFICE_FEATURES } from "@/lib/front-office/words";
import { listAddAction, listRemoveAction, settingsAction } from "../actions";
import { SegField } from "./fields";
import { Words } from "@/lib/i18n/client";

type Settings = { photoRequired: boolean; idProofRequired: boolean; pickupCodeCheck: boolean; passExpiry: string | null; slotMinutes: number };

export function SettingsSheet({ closeHref, s, features, dayEnd }: { closeHref: string; s: Settings; features: string[]; dayEnd: string }) {
  return (
    <SheetForm title="Front Office settings" sub="The visitor policy, when passes expire, and the optional parts." closeHref={closeHref} action={settingsAction} submitLabel="Save settings" pendingText="Saving…" wide>
      <SSwitch name="photoRequired" title="Visitor photo required" sub="A photo is taken before the pass is made" start={s.photoRequired} />
      <SSwitch name="idProofRequired" title="Visitor ID proof required" sub="ID type and number before the pass is made. Only the last 4 are shown later." start={s.idProofRequired} />
      <SSwitch name="pickupCodeCheck" title="Pickup code check" sub="A one-time code to the guardian’s registered mobile before a child is released" start={s.pickupCodeCheck} />
      <ExpiryFields passExpiry={s.passExpiry} dayEnd={dayEnd} />
      <SSelect name="slotMinutes" label="Appointment slots" start={String(s.slotMinutes)} options={[10, 15, 20, 30].map((m) => ({ value: String(m), label: `${m} minutes` }))} />
      <p className="eyebrow text-ink3 pt-1"><Words k="Optional parts" /></p>
      {FRONT_OFFICE_FEATURES.map((f) => <SSwitch key={f.key} name={f.key} title={f.label} sub={f.about} start={features.includes(f.key)} />)}
    </SheetForm>
  );
}

function ExpiryFields({ passExpiry, dayEnd }: { passExpiry: string | null; dayEnd: string }) {
  const mode = useTyped("passExpiryMode", passExpiry ? "set" : "end");
  const [m, setM] = useState(mode.value);
  const t = useTyped("passExpiry", passExpiry ?? "18:00");
  return (
    <>
      <SegField name="passExpiryMode" label="Visitor passes expire" start={passExpiry ? "set" : "end"} onChange={setM}
        options={[{ value: "end", label: `End of school day (${dayEnd})` }, { value: "set", label: "At a set time" }]} />
      {m === "set" && (
        <FieldShell label="Expiry time" id="st-exp" error={t.error}>
          <input key={t.key} id="st-exp" type="time" name="passExpiry" defaultValue={t.value} className={cx(inputCls(t.error), "h-11 tnum")} />
        </FieldShell>
      )}
    </>
  );
}

type Lists = { visitorPurposes: string[]; callPurposes: string[]; requestDepartments: string[] };
const LIST_NAMES: [keyof Lists, string][] = [["visitorPurposes", "Visitor purposes"], ["callPurposes", "Call purposes"], ["requestDepartments", "Request departments"]];

export function ListsSheet({ closeHref, lists }: { closeHref: string; lists: Lists }) {
  return (
    <UrlSheet title="Front Office lists" sub="Choices on the desk’s forms. Records that used a removed choice keep their words." closeHref={closeHref} wide>
      <div className="flex flex-col gap-5 pb-2">
        {LIST_NAMES.map(([key, label]) => <ListEditor key={key} list={key} label={label} values={lists[key]} />)}
      </div>
    </UrlSheet>
  );
}

function ListEditor({ list, label, values }: { list: string; label: string; values: string[] }) {
  const [state, run, pending] = useActionState<FormState<unknown>, FormData>(listAddAction, null);
  const [rmState, rm, removing] = useActionState<FormState<unknown>, FormData>(listRemoveAction, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  const problem = (state && !state.ok && state.message) || (rmState && !rmState.ok && rmState.message);
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[13px] font-semibold text-ink2">{label}</h3>
      <ul className="flex flex-wrap gap-2">
        {values.map((v) => (
          <li key={v}>
            <form action={rm} className="inline-flex items-center gap-1 h-9 pl-3 pr-1 rounded-xl border border-line text-[13.5px] font-semibold">
              <input type="hidden" name="list" value={list} /><input type="hidden" name="value" value={v} />
              {v}
              <button type="submit" disabled={removing || values.length <= 1} aria-label={`Remove ${v}`} title={values.length <= 1 ? "Keep at least one choice" : `Remove ${v}`}
                className="size-7 grid place-items-center rounded-lg text-ink3 hover:bg-sunken hover:text-bad disabled:opacity-40"><X size={14} aria-hidden="true" /></button>
            </form>
          </li>
        ))}
      </ul>
      <form ref={ref} action={run} className="flex gap-2">
        <input type="hidden" name="list" value={list} />
        <input name="value" placeholder={`Add to ${label.toLowerCase()}`} aria-label={`Add to ${label.toLowerCase()}`} maxLength={40} className={cx(inputCls(state && !state.ok), "h-10 text-[14px]")} />
        <Button type="submit" variant="secondary" icon={Plus} loading={pending}><Words k="Add" /></Button>
      </form>
      {problem && <p className="text-[12.5px] text-bad" role="alert">{problem}</p>}
    </section>
  );
}
