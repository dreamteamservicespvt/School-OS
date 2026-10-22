"use client";

// The School Calendar's sheets (mod-events.jsx CalendarForm and the remove
// confirmation): add a holiday, vacation, exam day, event, PTM or admission
// test; remove one (attendance switches back on); copy last year's holidays.

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { SheetForm, useTyped } from "@/components/ui/url-sheet";
import { SArea, SChips, SDate, SSelect, SSwitch, SText } from "@/components/ui/sheet-fields";
import { Checkbox } from "@/components/ui/controls";
import { inputCls } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import { addEntryAction, copyHolidaysAction, removeEntryAction } from "../actions";
import { WarningConfirm } from "./bits";
import { KeepSelect } from "@/components/ui/keep-select";
import { Words } from "@/lib/i18n/client";

type Opt = { value: string; label: string };
const TYPE_OPTIONS: Opt[] = [
  { value: "holiday", label: "Holiday" }, { value: "vacation", label: "Vacation" }, { value: "exam_day", label: "Exam day" },
  { value: "event", label: "Event" }, { value: "ptm", label: "PTM" }, { value: "admission_test", label: "Admission test" },
];
const CLOSING = ["holiday", "vacation"];

export function AddEntrySheet({ closeHref, defDate, classes, campuses }: { closeHref: string; defDate: string; classes: Opt[]; campuses: Opt[] }) {
  const typed = useTyped("type", "holiday");
  const [type, setType] = useState(typed.value || "holiday");
  const appliesT = useTyped("applies", "school");
  const [applies, setApplies] = useState(appliesT.value || "school");
  const closes = CLOSING.includes(type);
  const appliesOptions: Opt[] = [{ value: "school", label: "Whole school" }, ...campuses.map((c) => ({ value: `campus:${c.value}`, label: c.label })), ...(closes ? [] : [{ value: "classes", label: "Chosen classes" }])];
  return (
    <SheetForm title="Add to calendar" sub="Holidays switch attendance off for that day." closeHref={closeHref} action={addEntryAction} submitLabel="Add to calendar">
      <SText name="title" label="Name" required placeholder="For example: Republic Day, Annual Function" maxLength={80} />
      <SSelect name="type" label="Type" required options={TYPE_OPTIONS} start="holiday" onChange={(e) => { setType(e.target.value); if (CLOSING.includes(e.target.value) && applies === "classes") setApplies("school"); }} />
      <div className="grid grid-cols-2 gap-3">
        <SDate name="from" label={type === "vacation" ? "From" : "Date"} required start={defDate} />
        {type === "vacation" && <SDate name="to" label="To" required help="Last day off" />}
      </div>
      <WarningConfirm keyName="attendance-taken" />
      <div key={type} className="[&>div]:bg-sunken/70 [&>div]:border-0">
        <SSwitch name="attendanceOn" title="Allow attendance on this date"
          sub={closes ? "Off: attendance is off and reports leave the day out." : "Off: the day stays as it is. On: attendance is taken that day even on a Sunday, weekend or holiday, and the day counts in every %."} start={false} />
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-ink2"><Words k="Applies to" /></span>
        <KeepSelect name="applies" value={applies} onChange={(e) => setApplies(e.target.value)} className={cx(inputCls(false), "h-11")}>
          {appliesOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </KeepSelect>
      </label>
      {applies === "classes" && <SChips name="classIds" label="Classes" options={classes} required />}
      <details className="group">
        <summary className="cursor-pointer text-[13.5px] font-semibold text-brand list-none flex items-center gap-1.5"><ChevronRight size={15} className="group-open:rotate-90 transition" aria-hidden="true" /><Words k="More details" /></summary>
        <div className="flex flex-col gap-3 mt-3">
          <SArea name="details" label="Description" rows={2} maxLength={500} />
          <NotifyBox />
        </div>
      </details>
    </SheetForm>
  );
}

function NotifyBox() {
  const t = useTyped("notify", "");
  const [on, setOn] = useState(t.value === "on");
  return (
    <label className="flex items-center gap-3 text-[14px]">
      <Checkbox checked={on} onChange={setOn} label="Tell parents" /><Words k="Tell parents by message" />
      {on && <input type="hidden" name="notify" value="on" />}
    </label>
  );
}

export function RemoveEntrySheet({ closeHref, entry }: { closeHref: string; entry: { id: string; title: string; closes: boolean; when: string } }) {
  return (
    <SheetForm title={`Remove ${entry.title}?`} sub={entry.closes ? `Attendance will be needed for ${entry.when}. Teachers see it on their attendance screen.` : "It is taken off the calendar."}
      closeHref={closeHref} action={removeEntryAction} submitLabel={entry.closes ? "Remove and switch attendance on" : "Remove"} submitVariant="danger" hidden={{ entryId: entry.id }}>
      <p className="text-[14px] text-ink2"><Words k="You can undo this for a few seconds after." /></p>
    </SheetForm>
  );
}

export function CopyHolidaysSheet({ closeHref, rows }: { closeHref: string; rows: { id: string; title: string; type: string; from: string; to: string; lastWhen: string }[] }) {
  return (
    <SheetForm wide title="Copy last year's holidays" sub="Dates are moved one year on. Check each date before copying: festivals move every year." closeHref={closeHref} action={copyHolidaysAction} submitLabel="Copy to this year" submitDisabled={!rows.length}>
      {rows.length ? (
        <ul className="flex flex-col divide-y divide-line/70">
          {rows.map((r) => <CopyRow key={r.id} r={r} />)}
        </ul>
      ) : <p className="text-[14px] text-ink3"><Words k="Every holiday of last year is already on this year's calendar, or last year has none." /></p>}
    </SheetForm>
  );
}

function CopyRow({ r }: { r: { id: string; title: string; type: string; from: string; to: string; lastWhen: string } }) {
  const [on, setOn] = useState(true);
  return (
    <li className="py-2.5 flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
      <label className="flex items-center gap-3 min-w-0 flex-1">
        <Checkbox checked={on} onChange={setOn} label={`Copy ${r.title}`} />
        <span className="min-w-0"><span className="block font-semibold text-[14px] truncate">{r.title}</span><span className="block text-[12.5px] text-ink3"><Words k="Last year:" /> {r.lastWhen}</span></span>
      </label>
      {on && <input type="hidden" name="pick" value={r.id} />}
      <div className={cx("flex gap-2", !on && "opacity-40 pointer-events-none")}>
        <input type="date" name={`from_${r.id}`} defaultValue={r.from} aria-label={`First day of ${r.title}`} className={cx(inputCls(false), "h-10 tnum w-[150px]")} />
        {r.type === "vacation" && <input type="date" name={`to_${r.id}`} defaultValue={r.to} aria-label={`Last day of ${r.title}`} className={cx(inputCls(false), "h-10 tnum w-[150px]")} />}
      </div>
    </li>
  );
}
