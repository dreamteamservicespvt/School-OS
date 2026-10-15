"use client";

// Events Settings (mod-events.jsx EventsSettings): each setting saves as it
// is changed, through one server action that checks the role again.

import { startTransition, useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import { Segmented, Switch } from "@/components/ui/controls";
import { inputCls } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import type { FormState } from "@/lib/forms";
import { listAction, renewFeedAction, settingsAction } from "../actions";
import { CopyLink } from "./bits";

type S = FormState<unknown>;

function useSave() {
  const [state, run, pending] = useActionState<S, FormData>(settingsAction, null);
  const save = (fields: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    startTransition(() => run(fd));
  };
  return { state, save, pending };
}

function Said({ state }: { state: S }) {
  if (!state) return null;
  return <p role={state.ok ? "status" : "alert"} className={cx("text-[12.5px] px-5 pb-3", state.ok ? "text-ok" : "text-bad")}>{state.message}</p>;
}

function Row({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <div className="min-w-0 flex-1"><p className="text-[14px] font-semibold">{title}</p>{sub && <p className="text-[12.5px] text-ink3">{sub}</p>}</div>
      {children}
    </div>
  );
}

export function WeekendsForm({ second, fourth, canEdit }: { second: boolean; fourth: boolean; canEdit: boolean }) {
  const { state, save } = useSave();
  const [s2, set2] = useState(second);
  const [s4, set4] = useState(fourth);
  const send = (a: boolean, b: boolean) => save({ weekends: "1", secondSaturdayOff: a ? "on" : "", fourthSaturdayOff: b ? "on" : "" });
  return (
    <>
      <div className="divide-y divide-line/70 border-t border-line/70">
        <Row title="Sunday" sub="Always a weekend"><Switch on label="Sunday" disabled onChange={() => undefined} /></Row>
        <Row title="Second Saturday"><Switch on={s2} label="Second Saturday" disabled={!canEdit} onChange={(v) => { set2(v); send(v, s4); }} /></Row>
        <Row title="Fourth Saturday"><Switch on={s4} label="Fourth Saturday" disabled={!canEdit} onChange={(v) => { set4(v); send(s2, v); }} /></Row>
      </div>
      <Said state={state} />
    </>
  );
}

export function ListEditor({ list, items, canEdit, addLabel, placeholder }: { list: "eventTypes" | "venues"; items: string[]; canEdit: boolean; addLabel: string; placeholder: string }) {
  const [state, run, pending] = useActionState<S, FormData>(listAction, null);
  const [adding, setAdding] = useState(false);
  const [value, setValue] = useState("");
  const send = (op: "add" | "remove", v: string) => {
    const fd = new FormData();
    fd.set("list", list);
    fd.set("op", op);
    fd.set("value", v);
    startTransition(() => run(fd));
    if (op === "add") setValue("");
  };
  return (
    <div className="px-5 pb-5 flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {items.map((t) => (
          <span key={t} className="h-9 pl-3 pr-1.5 rounded-xl border border-line text-[13.5px] font-semibold flex items-center gap-1">{t}
            {canEdit && <button type="button" onClick={() => send("remove", t)} aria-label={`Remove ${t}`} className="w-6 h-6 grid place-items-center rounded-md text-ink3 hover:bg-sunken"><X size={13} aria-hidden="true" /></button>}
          </span>
        ))}
        {canEdit && !adding && <Button size="sm" variant="soft" icon={Plus} className="!h-9" onClick={() => setAdding(true)}>{addLabel}</Button>}
      </div>
      {canEdit && adding && (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (value.trim()) send("add", value); }}>
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} aria-label={addLabel} maxLength={40} autoFocus className={cx(inputCls(false), "h-10 flex-1")} />
          <Button type="submit" size="sm" variant="primary" loading={pending} className="!h-10">Add</Button>
          <Button size="sm" variant="ghost" className="!h-10" onClick={() => { setAdding(false); setValue(""); }}>Cancel</Button>
        </form>
      )}
      {state && <p role={state.ok ? "status" : "alert"} className={cx("text-[12.5px]", state.ok ? "text-ok" : "text-bad")}>{state.message}</p>}
    </div>
  );
}

export function PtmDefaultsForm({ slot, hour, canEdit }: { slot: number; hour: number; canEdit: boolean }) {
  const { state, save } = useSave();
  const hours = Array.from({ length: 14 }, (_, i) => i + 8);
  const words = (h: number) => `${h > 12 ? h - 12 : h}:00 ${h >= 12 ? "PM" : "AM"}`;
  return (
    <>
      <div className="divide-y divide-line/70 border-t border-line/70">
        <Row title="Slot length">
          <select aria-label="Slot length" defaultValue={String(slot)} disabled={!canEdit} onChange={(e) => save({ ptmSlotMinutes: e.target.value })} className={cx(inputCls(false), "h-10 !w-[170px] shrink-0")}>
            {[5, 10, 15, 20].map((m) => <option key={m} value={m}>{m} minutes</option>)}
          </select>
        </Row>
        <Row title="Reminder to parents" sub="Automatic message, the day before">
          <select aria-label="Reminder time" defaultValue={String(hour)} disabled={!canEdit} onChange={(e) => save({ ptmReminderHour: e.target.value })} className={cx(inputCls(false), "h-10 !w-[170px] shrink-0")}>
            {hours.map((h) => <option key={h} value={h}>{words(h)}</option>)}
          </select>
        </Row>
        <Row title="Booking" sub="The office books slots for parents who call or come in. Parent Link shows the booked slot."><span className="text-[13px] text-ink3">Office</span></Row>
      </div>
      <Said state={state} />
    </>
  );
}

export function FeedForm({ on, links, canEdit }: { on: boolean; links: { label: string; url: string }[]; canEdit: boolean }) {
  const { state, save } = useSave();
  const [renewState, renew, renewing] = useActionState<S, FormData>(renewFeedAction, null);
  const [v, setV] = useState(on);
  return (
    <>
      <div className="px-5 -mt-1 pb-3 flex items-center gap-3">
        <span className="text-[13.5px] text-ink2 flex-1">{v ? "On: anyone with a link sees the calendar" : "Off"}</span>
        <Switch on={v} label="Calendar feed" disabled={!canEdit} onChange={(x) => { setV(x); save({ feed: "1", feedOn: x ? "on" : "" }); }} />
      </div>
      {v && on && (
        <div className="px-5 pb-5 flex flex-col gap-2">
          {links.map((l) => (
            <div key={l.label} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
              <span className="min-w-0 flex-1"><span className="block text-[12.5px] text-ink3 font-semibold">{l.label}</span><span className="block font-mono text-[12.5px] truncate">{l.url}</span></span>
              <CopyLink url={l.url} />
            </div>
          ))}
          <p className="text-[12.5px] text-ink3">Paste a link in Google Calendar (Add by URL) or Outlook (Subscribe from web).</p>
          {canEdit && (
            <form action={renew} className="self-start">
              <Button type="submit" size="sm" variant="ghost" loading={renewing}>Make new links (old ones stop)</Button>
            </form>
          )}
          {renewState && <p role={renewState.ok ? "status" : "alert"} className={cx("text-[12.5px]", renewState.ok ? "text-ok" : "text-bad")}>{renewState.message}</p>}
        </div>
      )}
      <Said state={state} />
    </>
  );
}

export function GalleryRuleForm({ rule, canEdit }: { rule: string; canEdit: boolean }) {
  const { state, save } = useSave();
  const [v, setV] = useState(rule);
  return (
    <div className="px-5 pb-5 flex flex-col gap-2">
      <Segmented label="Students without photo consent" value={v} onChange={(x) => { if (!canEdit) return; setV(x); save({ galleryRule: x }); }} options={[{ value: "OUT", label: "Leave the photo out" }, { value: "BLUR", label: "Blur them" }]} className="w-full" />
      <p className="text-[12.5px] text-ink3">For new albums; each album can change it. Consent texts are in Settings, Data Backup & Security.</p>
      {state && <p role={state.ok ? "status" : "alert"} className={cx("text-[12.5px]", state.ok ? "text-ok" : "text-bad")}>{state.message}</p>}
    </div>
  );
}
