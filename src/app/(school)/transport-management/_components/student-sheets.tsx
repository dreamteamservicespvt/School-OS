"use client";

// Student Transport forms (12 §2): give students a route and stop (one, or in
// bulk by class), change the stop or route from a date, stop transport, and
// the bar of bulk actions over the ticked rows (P11).

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRightLeft, CircleSlash, Printer, Search, X } from "lucide-react";
import { SheetForm, useTyped } from "@/components/ui/url-sheet";
import { SArea, SDate, SText } from "@/components/ui/sheet-fields";
import { FieldShell, inputCls } from "@/components/ui/field";
import { buttonClass, Spinner } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { cx } from "@/components/ui/cx";
import { ASSIGN_TYPES } from "@/lib/transport/words";
import { addFeeAction, assignAction, carryOverAction, changePlaceAction, endAtYearEndAction, stopPlaceAction } from "../actions";
import { ActButton, ConfirmAct, SegField } from "./fields";
import type { Candidate, PlaceOption } from "../_lib/options";

/** Route and stop choice: routes show their free seats, stops their pickup time and fee. */
function RouteStop({ places, start, type }: { places: PlaceOption[]; start: { routeId: string; stopId: string }; type: string }) {
  const tRoute = useTyped("routeId", start.routeId);
  const tStop = useTyped("stopId", start.stopId);
  const [routeId, setRouteId] = useState(tRoute.value);
  const [stopId, setStopId] = useState(tStop.value);
  const route = places.find((r) => r.id === routeId);
  const stop = route?.stops.find((s) => s.id === stopId);
  const fee = stop ? (type === "TWO_WAY" ? stop.two : stop.one) : null;
  return (
    <>
      <FieldShell label="Route" id="tr-route" required error={tRoute.error} help={route ? (route.capacity == null ? "No vehicle yet, so no seat limit" : `${route.used} of ${route.capacity} seats used · ${route.free} free${route.bus ? ` · ${route.bus}` : ""}`) : "Free seats show next to each route"}>
        <select id="tr-route" name="routeId" value={routeId} onChange={(e) => { setRouteId(e.target.value); setStopId(""); }} aria-invalid={tRoute.error ? true : undefined} className={cx(inputCls(tRoute.error), "h-11")}>
          <option value="">Choose the route</option>
          {places.map((r) => <option key={r.id} value={r.id} disabled={r.free === 0}>Route {r.number} · {r.name}{r.capacity != null ? ` · ${r.free === 0 ? "full" : `${r.free} free`}` : ""}</option>)}
        </select>
      </FieldShell>
      <FieldShell label="Stop" id="tr-stop" required error={tStop.error} help={fee ? `Transport fee ${fee} a month, added to fees from the start date` : route && !route.stops.length ? "This route has no stops yet" : undefined}>
        <select id="tr-stop" name="stopId" value={stopId} onChange={(e) => setStopId(e.target.value)} disabled={!route} aria-invalid={tStop.error ? true : undefined} className={cx(inputCls(tStop.error), "h-11")}>
          <option value="">{route ? "Choose the stop" : "Choose the route first"}</option>
          {route?.stops.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.pickup}{s.two ? ` · ${s.two}` : " · no fee yet"}</option>)}
        </select>
      </FieldShell>
    </>
  );
}

/* ---------- Give transport ---------- */

export function AssignSheet({ closeHref, sections, sectionId, find, students, preselect, places, today, routeId }: {
  closeHref: string; sections: { value: string; label: string }[]; sectionId: string; find: string; students: Candidate[]; preselect: string | null; places: PlaceOption[]; today: string; routeId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<Set<string>>(() => new Set(preselect && students.some((s) => s.id === preselect && !s.has) ? [preselect] : []));
  const [q, setQ] = useState(find);
  const [type, setType] = useState("TWO_WAY");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tStudents = useTyped("studentIds", null);
  const go = (change: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(change)) { if (v) next.set(k, v); else next.delete(k); }
    next.delete("student");
    start(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  };
  const free = students.filter((s) => !s.has);
  const allOn = free.length > 0 && free.every((s) => picked.has(s.id));
  return (
    <SheetForm title="Give transport" sub="The stop's transport fee is added to each student's fees from the start date, and the seat is counted at once."
      closeHref={closeHref} action={assignAction} submitLabel={picked.size > 1 ? `Give transport to ${picked.size} students` : "Give transport"} pendingText="Saving…" submitDisabled={picked.size === 0} wide
      hidden={{ studentIds: [...picked].join(",") }}>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-[13px] font-semibold text-ink2 mb-1.5">Students <span className="text-bad" aria-hidden="true">*</span></legend>
        <div className="grid sm:grid-cols-2 gap-2">
          <label className="sr-only" htmlFor="tr-sec">Class</label>
          <select id="tr-sec" value={sectionId} onChange={(e) => go({ sec: e.target.value || null, find: null })} className={cx(inputCls(false), "h-11")}>
            <option value="">Pick a class</option>
            {sections.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <div className="relative">
            <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink3 pointer-events-none" aria-hidden="true" />
            <label className="sr-only" htmlFor="tr-find">Find a student</label>
            <input id="tr-find" type="search" value={q} placeholder="or find by name or admission number" autoComplete="off" className={cx(inputCls(false), "h-11 pl-9 pr-9")}
              onChange={(e) => { const v = e.target.value; setQ(v); if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => go({ find: v.trim().length >= 2 ? v.trim() : null }), 350); }} />
            {pending && <Spinner className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-ink3" />}
          </div>
        </div>
        {students.length === 0 ? (
          <p className="text-[13.5px] text-ink3 rounded-xl bg-sunken/60 px-3.5 py-3">{sectionId || find ? "No student found." : "Pick a class to give the whole class transport, or find one student."}</p>
        ) : (
          <div className="rounded-xl border border-line">
            <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-b border-line text-[13px]">
              <span className="font-semibold text-ink2" aria-live="polite">{picked.size} of {free.length} picked{students.length > free.length ? ` · ${students.length - free.length} already have a stop` : ""}</span>
              {free.length > 1 && <button type="button" className="text-brand font-semibold hover:underline" onClick={() => setPicked(allOn ? new Set() : new Set(free.map((s) => s.id)))}>{allOn ? "Clear" : "Pick all"}</button>}
            </div>
            <ul className="max-h-64 overflow-y-auto scroll-thin divide-y divide-line/60">
              {students.map((s) => (
                <li key={s.id}>
                  <label className={cx("flex items-center gap-3 px-3.5 py-2.5 text-[14px]", s.has ? "opacity-55" : "cursor-pointer hover:bg-sunken/50")}>
                    <input type="checkbox" className="size-4 accent-[rgb(var(--brand))]" disabled={s.has} checked={picked.has(s.id)}
                      onChange={(e) => setPicked((x) => { const n = new Set(x); if (e.target.checked) n.add(s.id); else n.delete(s.id); return n; })} />
                    <span className="min-w-0 flex-1"><b className="font-semibold">{s.name}</b><span className="text-ink3"> · {s.cls} · {s.admissionNo}</span></span>
                    {s.has && <span className="text-[12px] text-ink3 shrink-0">Has a stop</span>}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}
        {tStudents.error && <p className="text-[12.5px] text-bad">{tStudents.error}</p>}
      </fieldset>
      <RouteStop places={places} start={{ routeId, stopId: "" }} type={type} />
      <SegField name="type" label="Type" required start="TWO_WAY" onChange={setType} options={ASSIGN_TYPES.map((t) => ({ value: t.value, label: t.value === "TWO_WAY" ? "Two-way" : t.value === "PICKUP_ONLY" ? "Pickup only" : "Drop only" }))} />
      <div className="grid sm:grid-cols-2 gap-3">
        <SDate name="fromDate" label="From date" required start={today} help="The fee starts from this period" />
        <SText name="reason" label="Note" maxLength={200} placeholder="Optional" />
      </div>
    </SheetForm>
  );
}

/* ---------- Change or stop ---------- */

export function ChangeSheet({ closeHref, ids, who, places, today, start, approval }: { closeHref: string; ids: string[]; who: string; places: PlaceOption[]; today: string; start: { routeId: string; stopId: string; type: string }; approval: string | null }) {
  const [type, setType] = useState(start.type || "TWO_WAY");
  return (
    <SheetForm title="Change stop or route" sub={who} closeHref={closeHref} action={changePlaceAction} submitLabel={approval ? "Send for approval" : "Change"} pendingText="Saving…" hidden={{ assignmentIds: ids.join(",") }} wide>
      {approval && <Alert tone="info">{approval}</Alert>}
      <RouteStop places={places} start={{ routeId: start.routeId, stopId: start.stopId }} type={type} />
      <SegField name="type" label="Type" required start={type} onChange={setType} options={ASSIGN_TYPES.map((t) => ({ value: t.value, label: t.value === "TWO_WAY" ? "Two-way" : t.value === "PICKUP_ONLY" ? "Pickup only" : "Drop only" }))} />
      <SDate name="fromDate" label="From date" required start={today} min={today} help="The old stop ends the day before. The fee changes from the next period not yet charged." />
      <SArea name="reason" label="Reason" required rows={2} maxLength={200} placeholder="Moved house" />
    </SheetForm>
  );
}

export function StopTransportSheet({ closeHref, ids, who, today, approval }: { closeHref: string; ids: string[]; who: string; today: string; approval: string | null }) {
  return (
    <SheetForm title="Stop transport" sub={who} closeHref={closeHref} action={stopPlaceAction} submitVariant="danger" submitLabel={approval ? "Send for approval" : "Stop transport"} pendingText="Saving…" hidden={{ assignmentIds: ids.join(",") }}>
      {approval && <Alert tone="info">{approval}</Alert>}
      <SDate name="lastDate" label="Last day on the bus" required start={today} />
      <p className="text-[13.5px] text-ink2">Transport fee rows after this day that are not paid are removed. Paid rows stay; refund or adjust them in Fee Management.</p>
      <SArea name="reason" label="Reason" required rows={2} maxLength={200} placeholder="Parent will drop the child" />
    </SheetForm>
  );
}

/* ---------- Bulk actions over ticked rows ---------- */

const ROWS = "input[data-tr-row]";
const rows = () => [...document.querySelectorAll<HTMLInputElement>(ROWS)];
const visible = () => rows().filter((i) => i.offsetParent !== null);

/** The tick box of one list row (desktop and phone both render one; they stay in step). */
export function RowTick({ id, label }: { id: string; label: string }) {
  return <input type="checkbox" data-tr-row value={id} aria-label={`Pick ${label}`} className="relative z-[1] size-4 accent-[rgb(var(--brand))]" />;
}

export function AllTick() {
  return <input type="checkbox" data-tr-all aria-label="Pick every student shown" className="size-4 accent-[rgb(var(--brand))]" />;
}

export function BulkBar({ href, canChange, canPrint }: { href: string; canChange: boolean; canPrint: boolean }) {
  const [ids, setIds] = useState<string[]>([]);
  const refresh = useCallback(() => {
    setIds([...new Set(rows().filter((i) => i.checked).map((i) => i.value))]);
    const v = visible();
    document.querySelectorAll<HTMLInputElement>("input[data-tr-all]").forEach((all) => {
      all.checked = v.length > 0 && v.every((i) => i.checked);
      all.indeterminate = !all.checked && v.some((i) => i.checked);
    });
  }, []);
  useEffect(() => {
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.matches?.("input[data-tr-all]")) visible().forEach((i) => rows().filter((x) => x.value === i.value).forEach((x) => { x.checked = t.checked; }));
      else if (t.matches?.(ROWS)) rows().filter((i) => i.value === t.value).forEach((i) => { i.checked = t.checked; });
      else return;
      refresh();
    };
    document.addEventListener("change", onChange);
    return () => document.removeEventListener("change", onChange);
  }, [refresh]);
  const clear = () => { document.querySelectorAll<HTMLInputElement>(`${ROWS}, input[data-tr-all]`).forEach((i) => { i.checked = false; i.indeterminate = false; }); setIds([]); };
  const join = useMemo(() => ids.join(","), [ids]);
  if (!ids.length) return null;
  const sep = href.includes("?") ? "&" : "?";
  return (
    <div role="region" aria-label="Bulk actions" className="flex flex-wrap items-center gap-2 border-b border-brand/20 bg-brand/8 px-4 py-2.5">
      <p className="mr-2 text-[13.5px] font-semibold text-brand" aria-live="polite">{ids.length} picked</p>
      {canChange && <Link scroll={false} href={`${href}${sep}do=change&ids=${join}`} className={buttonClass("secondary", "sm")}><ArrowRightLeft size={15} aria-hidden="true" />Change stop or route</Link>}
      {canChange && <Link scroll={false} href={`${href}${sep}do=stop&ids=${join}`} className={buttonClass("secondary", "sm")}><CircleSlash size={15} aria-hidden="true" />Stop transport</Link>}
      {canChange && <ActButton action={addFeeAction} fields={{ assignmentIds: join }} label="Add transport fee" icon="IndianRupee" pendingText="Adding…" />}
      {canPrint && <a href={`/transport-management/students/pass?ids=${join}`} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}><Printer size={15} aria-hidden="true" />Print bus passes</a>}
      <button type="button" onClick={clear} className={cx(buttonClass("ghost", "sm"), "ml-auto")}><X size={15} aria-hidden="true" />Clear</button>
    </div>
  );
}

/* ---------- A new academic year: carry bus places over ---------- */

export type CarryItem = { id: string; name: string; cls: string; newClass: string | null; route: string; stop: string; type: string; oldFee: string; newFee: string | null; blocked: string | null; note: string | null };

/**
 * The review before carrying last year's bus places into the new year: every
 * place with what happens to it. Places that can go are ticked, except those
 * of students with no class in the new year yet; places that cannot go say why.
 */
export function CarrySheet({ closeHref, items, fromYear, toYear, toStart }: { closeHref: string; items: CarryItem[]; fromYear: string; toYear: string; toStart: string }) {
  const can = items.filter((i) => !i.blocked);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(can.filter((i) => !i.note).map((i) => i.id)));
  const allOn = can.length > 0 && can.every((i) => picked.has(i.id));
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const join = [...picked].join(",");
  const blocked = items.length - can.length;
  const n = picked.size;
  return (
    <SheetForm title={`Carry bus places over to ${toYear}`} sub={`Each student keeps the route, stop and one-way or two-way from ${toStart}, with a new bus pass. The new year's transport fee goes on their fees. The ${fromYear} place ends the day before.`}
      closeHref={closeHref} action={carryOverAction} wide pendingText="Carrying over…" submitDisabled={n === 0}
      submitLabel={n ? `Carry over ${n} place${n === 1 ? "" : "s"}` : "Carry over"} hidden={{ placeIds: join }}
      extraButtons={n > 0 ? (
        <ConfirmAct action={endAtYearEndAction} fields={{ placeIds: join }} trigger={`End ${n} at year end`} triggerVariant="ghost" title={`End ${n} bus place${n === 1 ? "" : "s"} at year end?`} confirmLabel={`End ${n} place${n === 1 ? "" : "s"}`} danger>
          <p className="text-[14px] text-ink2">For students not coming back on the bus in {toYear}. The {fromYear} place ends on its last day and nothing is charged for {toYear}. Fees already paid stay as they are.</p>
        </ConfirmAct>
      ) : undefined}>
      {blocked > 0 && <Alert tone="warning">{blocked} place{blocked === 1 ? "" : "s"} cannot be carried over yet. The reason is shown on each.</Alert>}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <label className="inline-flex items-center gap-2 text-[14px] font-semibold min-h-11 cursor-pointer">
          <input type="checkbox" checked={allOn} onChange={() => setPicked(allOn ? new Set() : new Set(can.map((i) => i.id)))} className="size-4 accent-[rgb(var(--brand))]" />
          Tick every place that can go ({can.length})
        </label>
        <span className="text-[13px] text-ink3" aria-live="polite">{n} ticked</span>
      </div>
      <ul className="flex flex-col divide-y divide-line rounded-xl border border-line max-h-[52vh] overflow-y-auto">
        {items.map((i) => (
          <li key={i.id}>
            <label className={cx("flex items-start gap-3 px-3 py-2.5 text-[14px]", i.blocked ? "opacity-70" : "cursor-pointer hover:bg-sunken/60")}>
              <input type="checkbox" disabled={Boolean(i.blocked)} checked={picked.has(i.id)} onChange={() => toggle(i.id)} aria-label={`Carry over ${i.name}`} className="mt-1 size-4 shrink-0 accent-[rgb(var(--brand))]" />
              <span className="min-w-0 flex-1">
                <b className="font-semibold">{i.name}</b>
                <span className="text-ink3"> · {i.newClass ? `${i.cls || "—"} → ${i.newClass}` : i.cls}</span>
                <span className="block text-[12.5px] text-ink2">{i.route} · {i.stop} · {i.type}</span>
                {i.blocked ? <span className="block text-[12.5px] text-bad">{i.blocked}</span>
                  : <span className="block text-[12.5px] text-ink3">{i.newFee && i.newFee !== i.oldFee ? `Fee ${i.oldFee} → ${i.newFee} a month` : `Fee ${i.newFee ?? i.oldFee} a month`}{i.note ? <span className="text-warn"> · {i.note}</span> : null}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </SheetForm>
  );
}
