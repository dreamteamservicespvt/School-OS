"use client";

// Book appointment (16 §2, mod-frontoffice.jsx BookSheet): only free slots can
// be picked; taken times show crossed out and say why. The server checks
// again under a lock before saving, so two desks cannot book the same time.

import { useEffect, useState, useTransition } from "react";
import { UserCheck } from "lucide-react";
import { SheetForm, useTyped } from "@/components/ui/url-sheet";
import { SSwitch, SText } from "@/components/ui/sheet-fields";
import { FieldShell, inputCls } from "@/components/ui/field";
import { Spinner } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { clockOf, mobileDigits } from "@/lib/front-office/words";
import { bookAction, lookupPhone, slotsFor } from "../actions";
import { PhoneBox, SegField } from "./fields";
import { KeepSelect } from "@/components/ui/keep-select";
import { Words } from "@/lib/i18n/client";

export type Slots = { leave: string | null; free: number[]; taken: { start: number; label: string; kind: string }[] } | null;
type Opt = { value: string; label: string };

export function BookSheet({ closeHref, staff, days, start, slots: first, reschedule }: {
  closeHref: string;
  staff: Opt[];
  days: Opt[];
  start: { staffId: string; day: string; at: number | null; length: number };
  slots: Slots;
  reschedule: { id: string; name: string; phone: string; purpose: string } | null;
}) {
  const typedStaff = useTyped("staffId", start.staffId);
  const typedDay = useTyped("date", start.day);
  const typedAt = useTyped("startMin", start.at == null ? "" : String(start.at));
  const [staffId, setStaffId] = useState(typedStaff.value);
  const [day, setDay] = useState(typedDay.value);
  const [length, setLength] = useState(start.length);
  const [at, setAt] = useState<number | null>(typedAt.value ? Number(typedAt.value) : null);
  const [slots, setSlots] = useState<Slots>(first);
  const [clash, setClash] = useState<string | null>(null);
  const [loading, load] = useTransition();
  const [known, setKnown] = useState<string | null>(null);
  const [key, setKey] = useState(`${start.staffId}|${start.day}|${start.length}`);

  const want = `${staffId}|${day}|${length}`;
  useEffect(() => {
    if (want === key) return;
    let live = true;
    load(async () => {
      const r = await slotsFor(staffId, day, length, reschedule?.id ?? null);
      if (!live) return;
      setSlots(r);
      setKey(want);
    });
    return () => { live = false; };
  }, [want, key, staffId, day, length, reschedule?.id]);

  const who = staff.find((s) => s.value === staffId)?.label.split(" · ")[0] ?? "This person";
  const chosenOk = at != null && Boolean(slots?.free.includes(at));
  const atError = typedAt.error;

  return (
    <SheetForm wide title={reschedule ? `Reschedule ${reschedule.name}` : "Book appointment"} sub="Only free slots can be picked. The server checks again before saving." closeHref={closeHref}
      action={bookAction} submitLabel={reschedule ? "Reschedule" : "Book"} pendingText={reschedule ? "Moving…" : "Booking…"}
      hidden={{ startMin: chosenOk ? String(at) : "", lengthMin: String(length), ...(reschedule ? { rescheduleId: reschedule.id } : {}) }}>
      <div className="grid sm:grid-cols-2 gap-3">
        <FieldShell label="With" id="bk-who" required error={typedStaff.error}>
          <KeepSelect id="bk-who" name="staffId" value={staffId} onChange={(e) => { setStaffId(e.target.value); setAt(null); setClash(null); }} className={cx(inputCls(typedStaff.error), "h-11")}>
            {staff.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </KeepSelect>
        </FieldShell>
        <FieldShell label="Date" id="bk-date" required error={typedDay.error}>
          <KeepSelect id="bk-date" name="date" value={day} onChange={(e) => { setDay(e.target.value); setAt(null); setClash(null); }} className={cx(inputCls(typedDay.error), "h-11")}>
            {days.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </KeepSelect>
        </FieldShell>
      </div>
      <FieldShell label="Time" id="bk-time" required error={clash ?? atError}>
        <div id="bk-time" className="flex flex-wrap gap-1.5 min-h-9" aria-busy={loading || undefined}>
          {loading ? <span className="text-[13px] text-ink3 inline-flex items-center gap-2"><Spinner size={16} /><Words k="Checking free times…" /></span>
            : !slots ? <p className="text-[13.5px] text-bad"><Words k="This day could not be loaded. Pick another day or person." /></p>
              : slots.leave ? <p className="text-[13.5px] text-bad">{who} <Words k="is not available on this day (" />{slots.leave.toLowerCase()}<Words k="). Pick another day or person." /></p>
                : slots.free.length === 0 ? <p className="text-[13.5px] text-bad">{who} <Words k="has no free" /> {length}<Words k="-minute slot on this day. Pick another day, a shorter meeting or another person." /></p>
                  : <>
                    {slots.free.map((m) => (
                      <button type="button" key={m} onClick={() => { setAt(m); setClash(null); }} aria-pressed={at === m}
                        className={cx("h-9 px-3 rounded-lg text-[12.5px] font-semibold tnum border transition", at === m ? "bg-brand text-brandink border-brand" : "border-line text-ink2 hover:border-brand hover:text-brand")}>{clockOf(m)}</button>
                    ))}
                    {slots.taken.slice(0, 8).map((x) => (
                      <button type="button" key={`${x.start}${x.label}`} title={x.label} onClick={() => { setAt(null); setClash(`${who} already has ${x.kind === "teach" ? "a class" : "a meeting"} at ${clockOf(x.start)}. Pick another slot.`); }}
                        className="h-9 px-3 rounded-lg text-[12.5px] font-semibold tnum bg-sunken text-ink3 line-through">{clockOf(x.start)}<span className="sr-only"> <Words k="taken" /></span></button>
                    ))}
                  </>}
        </div>
      </FieldShell>
      <SegField name="lengthPick" label="Length" required start={String(start.length)} onChange={(v) => { setLength(Number(v)); setAt(null); }}
        options={[{ value: "15", label: "15 min" }, { value: "30", label: "30 min" }, { value: "45", label: "45 min" }]} />
      <div className="grid sm:grid-cols-2 gap-3">
        <PhoneBox id="bk-phone" name="visitorPhone" label="Visitor phone" required start={reschedule?.phone}
          onPhone={async (v) => { const d = mobileDigits(v); if (!d) { setKnown(null); return; } const k = await lookupPhone(d); setKnown(k ? `${k.name} · ${k.who}` : null); }} />
        <SText name="visitorName" label="Visitor name" required maxLength={120} start={reschedule?.name} autoComplete="off" />
      </div>
      {known && <p className="text-[13px] text-ok -mt-2 flex items-center gap-1.5"><UserCheck size={15} aria-hidden="true" />{known}</p>}
      <SText name="purpose" label="Purpose" required maxLength={200} start={reschedule?.purpose} placeholder="For example: TC for transfer to Bengaluru" />
      <SSwitch name="confirm" title="Send confirmation to the visitor" sub="WhatsApp, with SMS backup" start />
    </SheetForm>
  );
}
