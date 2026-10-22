"use client";

// Hostel Settings (15 §6) forms: the hostel rules, roll call and visiting
// timings, the meals of the day, and parent messages and alerts. Each card
// saves on its own. What was typed is kept when a check fails. People who
// only read the settings see the same values, unchangeable.

import { useActionState, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Switch } from "@/components/ui/controls";
import { inputCls } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { cx } from "@/components/ui/cx";
import type { FormState } from "@/lib/forms";
import { saveMealsAction, saveMessagesAction, saveRulesAction, saveTimingsAction } from "../actions";
import { Words } from "@/lib/i18n/client";

type Act = (p: FormState<unknown>, fd: FormData) => Promise<FormState<unknown>>;

function Box({ title, description, action, readOnly, children, saveLabel }: { title: string; description?: string; action: Act; readOnly: boolean; children: (v: (k: string, f: string) => string, err: (k: string) => string | undefined) => React.ReactNode; saveLabel: string }) {
  const [state, run, pending] = useActionState<FormState<unknown>, FormData>(action, null);
  const typed = state && !state.ok ? state.values ?? {} : null;
  const v = (k: string, f: string) => typed?.[k] ?? f;
  const err = (k: string) => state?.errors?.[k];
  return (
    <Card>
      <CardHeader title={title} description={description} divided />
      <form action={run} key={typed ? JSON.stringify(typed).length : 0} noValidate>
        {state && !state.ok && <div className="px-5 pt-4"><Alert tone="danger">{state.message}</Alert></div>}
        {children(v, err)}
        {!readOnly && (
          <div className="px-5 py-3 border-t border-line flex justify-end">
            <Button type="submit" variant="primary" icon={Save} loading={pending} loadingText="Saving…">{saveLabel}</Button>
          </div>
        )}
      </form>
    </Card>
  );
}

function Row({ title, sub, htmlFor, children }: { title: string; sub?: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5 flex-wrap">
      <div className="min-w-0 flex-1 text-[14px] basis-[220px]">{htmlFor ? <label htmlFor={htmlFor} className="font-semibold block">{title}</label> : <b className="font-semibold block">{title}</b>}{sub && <span className="block text-[12.5px] text-ink3 mt-0.5">{sub}</span>}</div>
      <div className="min-w-0 max-w-full flex items-center gap-2 flex-wrap">{children}</div>
    </div>
  );
}

function Toggle({ name, title, sub, start, readOnly }: { name: string; title: string; sub?: string; start: boolean; readOnly: boolean }) {
  const [on, setOn] = useState(start);
  return <Row title={title} sub={sub}>{readOnly ? <span className="text-[13.5px] text-ink2">{on ? "On" : "Off"}</span> : <Switch on={on} onChange={setOn} label={title} name={name} />}</Row>;
}

export function RulesForm({ rules, readOnly }: { rules: string; readOnly: boolean }) {
  return (
    <Box title="Hostel rules" description="Shown to staff and printed on the allocation letter." action={saveRulesAction} readOnly={readOnly} saveLabel="Save rules">
      {(v, err) => (
        <div className="px-5 py-4">
          <label htmlFor="hs-rules" className="sr-only"><Words k="Hostel rules" /></label>
          <textarea id="hs-rules" name="rules" rows={9} maxLength={5000} defaultValue={v("rules", rules)} disabled={readOnly} aria-invalid={err("rules") ? true : undefined}
            placeholder={"1. Lights out at 10:00 PM.\n2. No mobile phones after 9:00 PM.\n3. Visitors only on Sundays, 10 AM to 1 PM."}
            className={cx(inputCls(err("rules")), "min-h-[180px] py-2.5 leading-relaxed")} />
          {err("rules") && <p className="text-[12.5px] text-bad mt-1">{err("rules")}</p>}
        </div>
      )}
    </Box>
  );
}

export type TimingsStart = { morning: string; night: string; outingBack: string; visitingDays: number[]; visitFrom: string; visitTo: string; lateAfter: number };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Time({ name, label, start, readOnly, err }: { name: string; label: string; start: string; readOnly: boolean; err?: string }) {
  return (
    <span className="flex flex-col gap-1">
      <input id={`hs-${name}`} name={name} type="time" defaultValue={start} disabled={readOnly} aria-label={label} aria-invalid={err ? true : undefined} className={cx(inputCls(err), "h-10 w-[132px] tnum")} />
      {err && <span className="text-[12px] text-bad">{err}</span>}
    </span>
  );
}

export function TimingsForm({ start, readOnly }: { start: TimingsStart; readOnly: boolean }) {
  const [days, setDays] = useState<number[]>(start.visitingDays);
  return (
    <Box title="Timings" description="Roll call times, the outing back-by time and visiting hours. Times are in the school's time zone." action={saveTimingsAction} readOnly={readOnly} saveLabel="Save timings">
      {(v, err) => (
        <div className="divide-y divide-line/70">
          <Row title="Morning roll call" htmlFor="hs-morning"><Time name="morning" label="Morning roll call" start={v("morning", start.morning)} readOnly={readOnly} err={err("morning")} /></Row>
          <Row title="Night roll call" sub="An unexplained absence alerts the warden and the Principal at once." htmlFor="hs-night"><Time name="night" label="Night roll call" start={v("night", start.night)} readOnly={readOnly} err={err("night")} /></Row>
          <Row title="Outings back by" sub="Filled in on new outing passes; the warden can change it." htmlFor="hs-outingBack"><Time name="outingBack" label="Outings back by" start={v("outingBack", start.outingBack)} readOnly={readOnly} err={err("outingBack")} /></Row>
          <Row title="Late alert after" sub="Minutes after the back-by time before the warden is alerted." htmlFor="hs-lateAfter">
            <input id="hs-lateAfter" name="lateAfter" type="number" min={0} max={180} defaultValue={v("lateAfter", String(start.lateAfter))} disabled={readOnly} aria-invalid={err("lateAfter") ? true : undefined} className={cx(inputCls(err("lateAfter")), "h-10 w-20 tnum text-right")} />
            <span className="text-[13px] text-ink3"><Words k="minutes" /></span>
          </Row>
          <Row title="Visiting days" sub="Visits on other days need the warden's approval.">
            <span className="flex flex-wrap gap-1.5" role="group" aria-label="Visiting days">
              {DAYS.map((d, i) => {
                const on = days.includes(i);
                return readOnly ? (on ? <span key={d} className="h-8 px-3 rounded-full bg-brand/10 text-brand text-[13px] font-semibold grid place-items-center">{d}</span> : null) : (
                  <button key={d} type="button" aria-pressed={on} onClick={() => setDays((x) => (on ? x.filter((y) => y !== i) : [...x, i].sort()))} className={cx("h-9 min-w-11 px-3 rounded-full text-[13px] font-semibold border", on ? "bg-brand/10 text-brand border-brand/30" : "bg-surface border-line text-ink2 hover:bg-sunken")}>{d}</button>
                );
              })}
            </span>
            {days.map((d) => <input key={d} type="hidden" name="visitingDays" value={d} />)}
          </Row>
          <Row title="Visiting hours">
            <Time name="visitFrom" label="Visiting from" start={v("visitFrom", start.visitFrom)} readOnly={readOnly} err={err("visitFrom")} />
            <span className="text-[13px] text-ink3"><Words k="to" /></span>
            <Time name="visitTo" label="Visiting to" start={v("visitTo", start.visitTo)} readOnly={readOnly} err={err("visitTo")} />
          </Row>
        </div>
      )}
    </Box>
  );
}

export function MealsForm({ meals, readOnly }: { meals: string[]; readOnly: boolean }) {
  return (
    <Box title="Meals" description="The meals of the day, in order. Used by the menu and the head count." action={saveMealsAction} readOnly={readOnly} saveLabel="Save meals">
      {(v, err) => (
        <div className="px-5 py-4 flex flex-col gap-1.5">
          <label htmlFor="hs-meals" className="text-[13px] font-semibold text-ink2"><Words k="Meals, separated by commas" /></label>
          <input id="hs-meals" name="meals" defaultValue={v("meals", meals.join(", "))} maxLength={200} disabled={readOnly} aria-invalid={err("meals") ? true : undefined} className={cx(inputCls(err("meals")), "h-11")} />
          {err("meals") ? <p className="text-[12.5px] text-bad">{err("meals")}</p> : <p className="text-[12.5px] text-ink3"><Words k="For example: Breakfast, Lunch, Snacks, Dinner. Menus already set for a meal you remove are kept." /></p>}
        </div>
      )}
    </Box>
  );
}

export type MessagesStart = { messageOnOut: boolean; messageOnReturn: boolean; messageOnLate: boolean; messageOnIncident: boolean; alertNightAbsent: boolean; alertLate: boolean };

export function MessagesForm({ start, readOnly }: { start: MessagesStart; readOnly: boolean }) {
  return (
    <Box title="Parent messages and alerts" description="Parents get a message on their preferred channel through Communication. Alerts go to the warden and the Principal." action={saveMessagesAction} readOnly={readOnly} saveLabel="Save messages">
      {() => (
        <div className="divide-y divide-line/70">
          <Toggle name="messageOnOut" title="Tell parents when their child goes out" start={start.messageOnOut} readOnly={readOnly} />
          <Toggle name="messageOnReturn" title="Tell parents when their child is back" start={start.messageOnReturn} readOnly={readOnly} />
          <Toggle name="messageOnLate" title="Tell parents when their child is late back" start={start.messageOnLate} readOnly={readOnly} />
          <Toggle name="messageOnIncident" title="Allow incident messages to parents" sub="The warden still chooses Tell the parent on each incident." start={start.messageOnIncident} readOnly={readOnly} />
          <Toggle name="alertNightAbsent" title="Alert at once for a night roll call absence" sub="To the hostel's wardens and the Principal." start={start.alertNightAbsent} readOnly={readOnly} />
          <Toggle name="alertLate" title="Alert when a student is not back" sub="After the back-by time and the minutes set above." start={start.alertLate} readOnly={readOnly} />
        </div>
      )}
    </Box>
  );
}
