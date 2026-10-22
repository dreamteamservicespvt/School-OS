"use client";

// Homework Settings cards (mod-homework.jsx SettingsPage): each card is one
// form, saved on its own; people who only read the settings see the values.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { Switch } from "@/components/ui/controls";
import { inputCls } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { ActionForm } from "@/components/students/action-form";
import { optionalPageAction, saveSettingsAction } from "./actions";
import { Words } from "@/lib/i18n/client";

export type Row =
  | { kind: "switch"; name: string; title: string; sub?: string; value: boolean }
  | { kind: "select"; name: string; title: string; sub?: string; value: string; options: { value: string; label: string }[] }
  | { kind: "number"; name: string; title: string; sub?: string; value: number; suffix?: string; min: number; max: number };

function RowControl({ r, id }: { r: Row; id: string }) {
  const [on, setOn] = useState(r.kind === "switch" ? r.value : false);
  if (r.kind === "switch") return <Switch id={id} on={on} onChange={setOn} label={r.title} name={r.name} />;
  if (r.kind === "select") return <select id={id} name={r.name} defaultValue={r.value} className={cx(inputCls(), "!h-10 !w-auto min-w-40 text-[14px]")}>{r.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
  return <span className="inline-flex items-center gap-2"><input id={id} name={r.name} type="number" min={r.min} max={r.max} defaultValue={r.value} className={cx(inputCls(), "!h-10 !w-24 tnum text-[14px]")} />{r.suffix && <span className="text-[13px] text-ink3">{r.suffix}</span>}</span>;
}

const shown = (r: Row) => (r.kind === "switch" ? (r.value ? "On" : "Off") : r.kind === "select" ? r.options.find((o) => o.value === r.value)?.label ?? r.value : `${r.value}${r.suffix ? ` ${r.suffix}` : ""}`);

/** One settings card: its rows, and Save for people who run the settings. */
export function SettingsRows({ section, rows, editable, extra }: { section: string; rows: Row[]; editable: boolean; extra?: React.ReactNode }) {
  const list = (
    <ul className="divide-y divide-line/70 border-t border-line/70">
      {rows.map((r) => {
        const id = `hs-${r.name}`;
        return (
          <li key={r.name} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-5 py-3.5">
            <label htmlFor={editable ? id : undefined} className="flex-1 min-w-0 text-[14px]"><b className="font-semibold block">{r.title}</b>{r.sub && <span className="text-ink3 text-[12.5px]">{r.sub}</span>}</label>
            {editable ? <RowControl r={r} id={id} /> : <span className="text-[14px] text-ink2 font-semibold">{shown(r)}</span>}
          </li>
        );
      })}
    </ul>
  );
  if (!editable) return <>{list}{extra}</>;
  return (
    <ActionForm action={saveSettingsAction} className="flex flex-col pb-4 [&>div:last-child]:px-5 [&>div:last-child]:pt-3 [&>[role=alert]]:mx-5 [&>[role=status]]:mx-5 [&>[role=alert]]:mb-3 [&>[role=status]]:mb-3" submitLabel="Save" pendingText="Saving…">
      <input type="hidden" name="section" value={section} />
      {list}
      {extra}
    </ActionForm>
  );
}

/** The grades worked out from a homework score (A from 80%, and so on). */
export function GradeBands({ bands, editable }: { bands: { grade: string; from: number }[]; editable: boolean }) {
  const [rows, setRows] = useState(bands.length ? bands : [{ grade: "A", from: 80 }, { grade: "D", from: 0 }]);
  if (!editable) {
    return <p className="px-5 py-3.5 text-[14px] border-t border-line/70"><b className="font-semibold"><Words k="Homework grades" /></b> <span className="text-ink2">· {[...bands].sort((a, b) => b.from - a.from).map((b) => `${b.grade} from ${b.from}%`).join(", ")}</span></p>;
  }
  return (
    <fieldset className="px-5 py-3.5 border-t border-line/70 flex flex-col gap-2">
      <legend className="sr-only"><Words k="Homework grades" /></legend>
      <p className="text-[14px]"><b className="font-semibold block"><Words k="Homework grades" /></b><span className="text-ink3 text-[12.5px]"><Words k="Worked out from the score. One grade starts at 0%." /></span></p>
      {rows.map((b, i) => (
        <div key={i} className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`band${i}grade`}><Words k="Grade" /> {i + 1}</label>
          <input id={`band${i}grade`} name={`band${i}grade`} defaultValue={b.grade} maxLength={4} className={cx(inputCls(), "!h-10 !w-20 text-[14px]")} />
          <span className="text-[13px] text-ink3"><Words k="from" /></span>
          <label className="sr-only" htmlFor={`band${i}from`}><Words k="Grade" /> {i + 1} <Words k="starts at" /></label>
          <input id={`band${i}from`} name={`band${i}from`} type="number" min={0} max={100} defaultValue={b.from} className={cx(inputCls(), "!h-10 !w-20 tnum text-[14px]")} />
          <span className="text-[13px] text-ink3">%</span>
          {rows.length > 1 && <button type="button" aria-label={`Remove grade ${b.grade}`} onClick={() => setRows((x) => x.filter((_, k) => k !== i))} className="w-9 h-9 grid place-items-center rounded-lg text-ink3 hover:bg-sunken"><X size={15} aria-hidden="true" /></button>}
        </div>
      ))}
      {rows.length < 6 && <Button size="sm" variant="ghost" icon={Plus} className="self-start" onClick={() => setRows((x) => [...x, { grade: "", from: 0 }])}><Words k="Add a grade" /></Button>}
    </fieldset>
  );
}

/** An optional page's switch: saved at once for the whole school. */
export function OptionalSwitch({ feature, label, sub, on, editable }: { feature: string; label: string; sub: string; on: boolean; editable: boolean }) {
  const [value, setValue] = useState(on);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();
  return (
    <li className="flex items-center gap-3 px-5 py-3.5">
      <span className="flex-1 min-w-0 text-[14px]"><b className="font-semibold block">{label}</b><span className="text-ink3 text-[12.5px]">{sub}</span>{problem && <span role="alert" className="block text-[12.5px] text-bad">{problem}</span>}</span>
      {editable ? <Switch on={value} label={label} disabled={busy} onChange={(v) => {
        setValue(v);
        start(async () => {
          const fd = new FormData();
          fd.set("feature", feature); fd.set("on", v ? "1" : "0");
          const r = await optionalPageAction(fd);
          if (r) { setProblem(r); setValue(!v); } else { setProblem(null); router.refresh(); }
        });
      }} /> : <span className="text-[14px] text-ink2 font-semibold">{on ? "On" : "Off"}</span>}
    </li>
  );
}
