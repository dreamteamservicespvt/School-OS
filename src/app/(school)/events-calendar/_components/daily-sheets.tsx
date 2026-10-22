"use client";

// Daily Activities (mod-events.jsx DailyActivities): the log card where the
// class teacher taps how it went and ticks the children, the Assign sheet and
// the Send today's diary sheet. Only the class teacher of the section sees
// these; the server refuses everyone else, the Principal and VP included.

import { useActionState, useState } from "react";
import { Check } from "lucide-react";
import { SheetForm, useTyped } from "@/components/ui/url-sheet";
import { SDate, SSelect, SText } from "@/components/ui/sheet-fields";
import { Segmented } from "@/components/ui/controls";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import type { FormState } from "@/lib/forms";
import { assignActivityAction, logActivityAction, sendDiaryAction } from "../activity-actions";
import { Words } from "@/lib/i18n/client";

type Kid = { id: string; name: string };

export function DailyLog({ activityId, label, time, options, present }: { activityId: string; label: string; time: string; options: string[]; present: Kid[] }) {
  const [val, setVal] = useState(options[0] ?? "");
  const [pick, setPick] = useState<Set<string>>(() => new Set(present.map((k) => k.id)));
  const [note, setNote] = useState("");
  // The page gives this card a new key for each activity, so it starts again with everyone present ticked.
  const [state, run, pending] = useActionState<FormState<unknown>, FormData>(async (s, fd) => {
    const r = await logActivityAction(s, fd);
    if (r?.ok) setNote("");
    return r;
  }, null);
  const all = pick.size === present.length;
  const err = state && !state.ok ? state : null;
  return (
    <form action={run} className="px-5 pb-5 flex flex-col gap-3.5">
      <input type="hidden" name="activityId" value={activityId} />
      <input type="hidden" name="value" value={val} />
      {[...pick].map((id) => <input key={id} type="hidden" name="studentIds" value={id} />)}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={`How ${label} went`}>
        {options.map((o) => <button key={o} type="button" onClick={() => setVal(o)} aria-pressed={val === o} className={cx("h-8 px-3 rounded-full text-[13px] font-semibold transition", val === o ? "bg-ink text-bg" : "bg-sunken text-ink2 hover:bg-line")}>{o}</button>)}
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[13px] font-semibold text-ink2"><Words k="Children ·" /> {pick.size} <Words k="ticked" /></p>
          <button type="button" onClick={() => setPick(all ? new Set() : new Set(present.map((k) => k.id)))} className="text-[12.5px] font-semibold text-brand">{all ? "Untick all" : "Tick all present"}</button>
        </div>
        <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto scroll-thin">
          {present.map((k) => (
            <button key={k.id} type="button" aria-pressed={pick.has(k.id)} onClick={() => setPick((x) => { const n = new Set(x); if (n.has(k.id)) n.delete(k.id); else n.add(k.id); return n; })}
              className={cx("h-8 px-2.5 rounded-lg text-[12.5px] font-medium border transition", pick.has(k.id) ? "border-brand bg-brand/8 text-brand" : "border-line text-ink3")}>{k.name.split(" ")[0]}</button>
          ))}
          {!present.length && <p className="text-[13px] text-ink3"><Words k="No children present today." /></p>}
        </div>
        {err?.errors?.studentIds && <p className="text-[12.5px] text-bad mt-1">{err.errors.studentIds}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="da-note" className="text-[13px] font-semibold text-ink2"><Words k="Note" /></label>
        <input id="da-note" name="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="For example: had extra chapati" className={cx(inputCls(false), "h-11")} />
        <p className="text-[12.5px] text-ink3"><Words k="Optional, for the ticked children" /></p>
      </div>
      {err && !err.errors?.studentIds && <p className="text-[12.5px] text-bad" role="alert">{err.message}</p>}
      <Button type="submit" variant="primary" loading={pending} disabled={!pick.size}>{!pending && <Check size={17} aria-hidden="true" />}<Words k="Save for" /> {pick.size} {pick.size === 1 ? "child" : "children"}</Button>
      <p className="sr-only" aria-live="polite">{time}</p>
    </form>
  );
}

export function AssignSheet({ closeHref, sections, sectionId, types, today, weekLabel, dayLabel }: { closeHref: string; sections: { value: string; label: string }[]; sectionId: string; types: string[]; today: string; weekLabel: string; dayLabel: string }) {
  const d = useTyped("days", "day");
  const [days, setDays] = useState(d.value || "day");
  return (
    <SheetForm title="Assign activities" sub="For a class, for a day or the whole week." closeHref={closeHref} action={assignActivityAction} submitLabel="Assign" hidden={{ days }}>
      <SSelect name="sectionId" label="Class" required options={sections} start={sectionId} />
      <SSelect name="type" label="Activity type" required options={types.map((t) => ({ value: t, label: t }))} start={types.includes("Learning activity") ? "Learning activity" : types[0]} />
      <SText name="label" label="Activity" required maxLength={60} placeholder="For example: Clay modelling" />
      <div className="grid grid-cols-2 gap-3">
        <SDate name="from" label="First day" required start={today} min={today} />
        <SText name="time" label="Time" type="time" required start="11:15" className="tnum" />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-ink2"><Words k="Days" /></span>
        <Segmented label="Days" value={days} onChange={setDays} options={[{ value: "day", label: dayLabel }, { value: "week", label: weekLabel }]} className="w-full" />
        <p className="text-[12.5px] text-ink3"><Words k="Holidays and Sundays are left out." /></p>
      </div>
    </SheetForm>
  );
}

export function SendDiarySheet({ closeHref, sectionId, label, parents, preview, notLogged }: { closeHref: string; sectionId: string; label: string; parents: number; preview: string | null; notLogged: string[] }) {
  return (
    <SheetForm title={`Send today’s diary to the parents of ${parents} ${parents === 1 ? "child" : "children"}?`} sub={`${label} · each parent gets only their own child’s day, on their usual channel.`} closeHref={closeHref}
      action={sendDiaryAction} submitLabel="Send diary" hidden={{ sectionId }} submitDisabled={!preview}>
      {preview ? <div className="rounded-2xl rounded-tl-md bg-sunken/70 p-3.5 text-[14px] leading-relaxed">{preview}</div> : <p className="text-[14px] text-ink2"><Words k="Nothing is logged yet today. Log the activities first." /></p>}
      {notLogged.length > 0 && <p className="text-[12.5px] text-ink3">{notLogged.join(", ")} {notLogged.length === 1 ? "is" : "are"} <Words k="not logged yet. Activities logged after this are not sent again." /></p>}
    </SheetForm>
  );
}
