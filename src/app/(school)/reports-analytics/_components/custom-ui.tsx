"use client";

// Custom & Scheduled Reports in the browser (mod-reports.jsx CustomReports,
// ScheduleSheet and Builder): the column picker, the save and schedule sheets,
// and each schedule's menu. Every change is checked again on the server,
// including that each recipient may see the data.

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Archive, Check, Pause, Pencil, Play, Send } from "lucide-react";
import { SheetForm, useTyped } from "@/components/ui/url-sheet";
import { SText } from "@/components/ui/sheet-fields";
import { FieldShell } from "@/components/ui/field";
import { Segmented, Checkbox } from "@/components/ui/controls";
import { MoreMenu } from "@/components/ui/more-menu";
import { SubmitButton } from "@/components/ui/submit-button";
import { Avatar } from "@/components/ui/avatar";
import { cx } from "@/components/ui/cx";
import { saveCustomAction, saveScheduleAction, scheduleStatusAction, sendNowAction } from "../actions";
import { KeepSelect } from "@/components/ui/keep-select";
import { Words } from "@/lib/i18n/client";

/** Ticks a column on or off in the page address; the preview follows. */
export function ColumnPicker({ fields, chosen }: { fields: { key: string; label: string }[]; chosen: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [on, setOn] = useState(new Set(chosen));
  const toggle = (k: string) => {
    const next = new Set(on);
    if (next.has(k)) next.delete(k); else next.add(k);
    setOn(next);
    const p = new URLSearchParams(sp.toString());
    p.delete("col");
    for (const f of fields) if (next.has(f.key)) p.append("col", f.key);
    if (!next.size) p.set("col", "none");
    start(() => router.replace(`${pathname}?${p.toString()}`, { scroll: false }));
  };
  return (
    <ul className={cx("px-3 pb-3", pending && "opacity-80")}>
      {fields.map((f) => (
        <li key={f.key}>
          <label className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-sunken/60 cursor-pointer">
            <Checkbox label={f.label} checked={on.has(f.key)} onChange={() => toggle(f.key)} />
            <span className="text-[14px] flex-1">{f.label}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

/** Save this report: a name, then either keep it or go on to schedule it. */
export function SaveCustomSheet({ spec, sub, closeHref, doneHref, start }: { spec: { area: string; columns: string[]; classId: string; show: string; group: string; totals: string }; sub: string; closeHref: string; doneHref: string; start: string }) {
  return (
    <SheetForm title="Save this report" sub={sub} closeHref={closeHref} doneHref={doneHref} action={saveCustomAction} submitLabel="Save report"
      hidden={{ area: spec.area, classId: spec.classId, show: spec.show, group: spec.group, totals: spec.totals }}
      extraButtons={<SubmitButton variant="ghost" name="then" value="schedule" className="!text-brand"><Words k="Save and schedule it" /></SubmitButton>}>
      {spec.columns.map((c) => <input key={c} type="hidden" name="columns" value={c} />)}
      <SText name="name" label="Name" required start={start} placeholder="Class 7 marks and attendance" autoComplete="off" maxLength={80} />
    </SheetForm>
  );
}

export type ReportOption = { value: string; label: string; group: "Custom" | "Catalogue" };
export type Person = { id: string; name: string; role: string; me: boolean; keys: string[] };
export type ScheduleStart = { id: string | null; reportKey: string; datePreset: string; frequency: string; day: number; timeMin: number; format: string; recipientIds: string[] };

const TIMES = [420, 480, 540, 600, 780, 1020];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const timeWords = (m: number) => { const h = Math.floor(m / 60), mm = m % 60; return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
const selectCls = "h-11 w-full rounded-xl border border-line bg-surface px-3 text-[14px] outline-none focus:border-brand focus:ring-4 focus:ring-brand/15";

/** Schedule a report (or edit a schedule): when, which format, and to whom. Only people who may see the data can receive it. */
export function ScheduleSheet({ start, reports, presets, people, closeHref, editName }: { start: ScheduleStart; reports: ReportOption[]; presets: { value: string; label: string }[]; people: Person[]; closeHref: string; editName?: string }) {
  return (
    <SheetForm wide title={editName ? `Edit schedule: ${editName}` : "Schedule a report"} sub="Sent by email with the same numbers as on screen" closeHref={closeHref}
      action={saveScheduleAction} submitLabel={editName ? "Save changes" : "Start sending"} hidden={start.id ? { scheduleId: start.id } : undefined}>
      <ScheduleFields start={start} reports={reports} presets={presets} people={people} />
    </SheetForm>
  );
}

function ScheduleFields({ start, reports, presets, people }: { start: ScheduleStart; reports: ReportOption[]; presets: { value: string; label: string }[]; people: Person[] }) {
  const r = useTyped("reportKey", start.reportKey);
  const fr = useTyped("frequency", start.frequency);
  const to = useTyped("recipientIds", null);
  const [report, setReport] = useState(r.value);
  const [freq, setFreq] = useState(fr.value || "WEEKLY");
  const [day, setDay] = useState(String(start.day || 1));
  const [time, setTime] = useState(String(start.timeMin || 480));
  const [format, setFormat] = useState(start.format === "xlsx" ? "xlsx" : "pdf");
  const [chosen, setChosen] = useState<string[]>(start.recipientIds);
  const blocked = report ? chosen.filter((id) => !people.find((p) => p.id === id)?.keys.includes(report)) : [];
  const names = (ids: string[]) => ids.map((id) => people.find((p) => p.id === id)?.name.split(" ")[0] ?? "Someone").join(" and ");
  const toError = to.error ?? (blocked.length ? `${names(blocked)} cannot see this report. Choose another recipient.` : undefined);
  const when = freq === "DAILY" ? `Daily, ${timeWords(Number(time))}` : freq === "WEEKLY" ? `Weekly, ${DAYS[Number(day) - 1] ?? "Monday"} ${timeWords(Number(time))}` : `Monthly, 1st at ${timeWords(Number(time))}`;
  const group = (g: ReportOption["group"]) => reports.filter((x) => x.group === g);
  return (
    <>
      <FieldShell label="Report" id="sc-rep" required error={r.error}>
        <KeepSelect id="sc-rep" name="reportKey" value={report} onChange={(e) => setReport(e.target.value)} className={selectCls} aria-invalid={r.error ? true : undefined}>
          <option value="">Pick a report</option>
          {group("Custom").length > 0 && <optgroup label="My custom reports">{group("Custom").map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</optgroup>}
          <optgroup label="All reports">{group("Catalogue").map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</optgroup>
        </KeepSelect>
      </FieldShell>
      <FieldShell label="Filters" id="sc-fil" help="Relative dates move with each send, like “last week”">
        <select id="sc-fil" name="datePreset" defaultValue={start.datePreset} className={selectCls}>
          {presets.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </FieldShell>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FieldShell label="How often" id="sc-freq" required>
          <KeepSelect id="sc-freq" name="frequency" value={freq} onChange={(e) => setFreq(e.target.value)} className={selectCls}>
            <option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option>
          </KeepSelect>
        </FieldShell>
        <FieldShell label="Day" id="sc-day">
          {freq === "WEEKLY"
            ? <KeepSelect id="sc-day" name="day" value={day} onChange={(e) => setDay(e.target.value)} className={selectCls}>{DAYS.map((d, i) => <option key={d} value={String(i + 1)}>{d}</option>)}</KeepSelect>
            : <select id="sc-day" className={selectCls}><option>{freq === "DAILY" ? "Every school day" : "1st of the month"}</option></select>}
        </FieldShell>
        <FieldShell label="Time" id="sc-time">
          <KeepSelect id="sc-time" name="timeMin" value={time} onChange={(e) => setTime(e.target.value)} className={selectCls}>{TIMES.map((t) => <option key={t} value={String(t)}>{timeWords(t)}</option>)}</KeepSelect>
        </FieldShell>
      </div>
      <FieldShell label="Format" id="sc-fmt" required>
        <Segmented value={format} onChange={setFormat} label="Format" options={[{ value: "pdf", label: "PDF" }, { value: "xlsx", label: "Excel" }]} />
        <input type="hidden" name="format" value={format} />
      </FieldShell>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-[13px] font-semibold text-ink2 mb-1.5"><Words k="Send to" /><span className="text-bad" aria-hidden="true"> *</span></legend>
        <div className="flex flex-wrap gap-2">
          {people.map((p) => {
            const on = chosen.includes(p.id);
            const no = on && Boolean(report) && !p.keys.includes(report);
            return (
              <button key={p.id} type="button" aria-pressed={on} onClick={() => setChosen((x) => (x.includes(p.id) ? x.filter((y) => y !== p.id) : [...x, p.id]))}
                className={cx("inline-flex items-center gap-2 h-10 pl-1.5 pr-3 rounded-full border text-[13.5px] font-semibold transition", no ? "border-bad bg-bad/10 text-bad" : on ? "border-brand bg-brand/10 text-brand" : "border-line bg-surface text-ink2 hover:bg-sunken")}>
                <Avatar name={p.name} size={28} />{p.me ? "Me" : p.name.split(" ")[0]}<span className="font-normal text-[12px] opacity-90 hidden sm:inline">{p.role}</span>{on && <Check size={14} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        {chosen.map((id) => <input key={id} type="hidden" name="recipientIds" value={id} />)}
        {toError ? <p className="text-[12.5px] text-bad" role="alert">{toError}</p> : <p className="text-[12.5px] text-ink3"><Words k="Only staff who may see this data can receive it" /></p>}
      </fieldset>
      <p className="text-[12.5px] text-ink3"><Words k="Sends" /> {when}<Words k={". Email is set up in Settings, SMS, WhatsApp & Email."} /></p>
    </>
  );
}

/** A schedule's menu: send now, edit, pause or start again, archive. */
export function ScheduleMenu({ id, active, archived, editHref, archiveHref }: { id: string; active: boolean; archived: boolean; editHref: string; archiveHref: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const run = (fn: () => Promise<string | null>) => start(async () => { setProblem(null); const p = await fn(); if (p) setProblem(p); else router.refresh(); });
  return (
    <span className={cx("inline-flex flex-col items-end gap-1", pending && "opacity-70")}>
    <MoreMenu size="sm" label="Schedule actions" items={[
      ...(!archived ? [{ label: "Send now", icon: <Send size={16} aria-hidden="true" />, onClick: () => run(() => sendNowAction(id)) }] : []),
      ...(!archived ? [{ label: "Edit", href: editHref, icon: <Pencil size={16} aria-hidden="true" /> }] : []),
      active && !archived
        ? { label: "Pause", icon: <Pause size={16} aria-hidden="true" />, onClick: () => run(() => scheduleStatusAction(id, "PAUSED")) }
        : { label: "Start again", icon: <Play size={16} aria-hidden="true" />, onClick: () => run(() => scheduleStatusAction(id, "ACTIVE")) },
      ...(!archived ? [{ label: "Archive", href: archiveHref, icon: <Archive size={16} aria-hidden="true" />, tone: "bad" as const }] : []),
    ]} />
    {problem && <span role="alert" className="text-[12.5px] text-bad max-w-[260px] text-right">{problem}</span>}
    </span>
  );
}
