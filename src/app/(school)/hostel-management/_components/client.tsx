"use client";

// Small browser pieces used across the Hostel pages: a one-tap action button
// that shows its problem in place, a segmented choice sent with a form, the
// student finder (new students for a bed, or residents of the person's own
// hostels), and the roll call sheet (everyone present to start with; tap the
// exceptions; students out on a pass are already marked).

import { useActionState, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { ArrowRightLeft, BellRing, Check, CircleX, LogIn, LogOut, Search, Send, Undo2, X, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button, Spinner, type ButtonVariant } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { Segmented, type SegOption } from "@/components/ui/controls";
import { inputCls } from "@/components/ui/field";
import { useTyped } from "@/components/ui/url-sheet";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/badge";
import { cx } from "@/components/ui/cx";
import type { FormState } from "@/lib/forms";
import { findStudentsAction, saveRollCallAction, type FoundStudent } from "../actions";
import { Words } from "@/lib/i18n/client";

type Act = (prev: FormState<unknown>, fd: FormData) => Promise<FormState<unknown>>;
const ICONS = { bell: BellRing, check: Check, cancel: CircleX, send: Send, x: X, out: LogOut, in: LogIn, move: ArrowRightLeft, undo: Undo2 } satisfies Record<string, LucideIcon>;
export type ActIcon = keyof typeof ICONS;

/** A button that runs one server action (Approve, Mark out, Remind...), with its problem shown in place. */
export function ActButton({ action, fields, label, icon, variant = "secondary", size = "sm", className, pendingText, ariaLabel }: { action: Act; fields: Record<string, string>; label: React.ReactNode; icon?: ActIcon; variant?: ButtonVariant; size?: "sm" | "md" | "lg"; className?: string; pendingText?: string; ariaLabel?: string }) {
  const [state, run, pending] = useActionState<FormState<unknown>, FormData>(action, null);
  return (
    <form action={run} className={cx("relative z-[1] inline-flex flex-col items-start gap-1", className)}>
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Button type="submit" variant={variant} size={size} icon={icon ? ICONS[icon] : undefined} loading={pending} aria-label={ariaLabel} className={className?.includes("w-full") ? "w-full" : undefined}>{pending && pendingText ? pendingText : label}</Button>
      {state && !state.ok && <span className="text-[12px] text-bad max-w-[280px]" role="alert">{state.message}</span>}
    </form>
  );
}

/** A segmented choice that is sent with the form as `name`. */
export function SegField({ name, label, options, start, onChange, size, help }: { name: string; label: string; options: readonly SegOption[]; start: string; onChange?: (v: string) => void; size?: "sm" | "md"; help?: React.ReactNode }) {
  const t = useTyped(name, start);
  const [v, setV] = useState(t.value || start);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-ink2">{label}</span>
      <Segmented label={label} value={v} onChange={(x) => { setV(x); onChange?.(x); }} options={options} className="w-full" size={size} />
      <input type="hidden" name={name} value={v} />
      {t.error ? <p className="text-[12.5px] text-bad">{t.error}</p> : help ? <p className="text-[12.5px] text-ink3">{help}</p> : null}
    </div>
  );
}

/**
 * Find a student by name or admission number. `mode` "new" offers studying
 * students without a bed; "resident" offers students living in the person's
 * own hostels. Sends the chosen ids as `name`; the server checks again.
 */
export function StudentFind({ name, label, mode, multiple = false, required = true, start = [], onPick, help, placeholder = "Name or admission number" }: {
  name: string; label: string; mode: "new" | "resident"; multiple?: boolean; required?: boolean; start?: FoundStudent[]; onPick?: (s: FoundStudent[]) => void; help?: React.ReactNode; placeholder?: string;
}) {
  const t = useTyped(name, null);
  const [chosen, setChosen] = useState<FoundStudent[]>(start);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<FoundStudent[] | null>(null);
  const [pending, startFind] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const pick = (next: FoundStudent[]) => { setChosen(next); onPick?.(next); setQ(""); setFound(null); };
  const showSearch = multiple || chosen.length === 0;
  return (
    <fieldset className="flex flex-col gap-1.5" aria-describedby={t.error ? `${id}-err` : help ? `${id}-help` : undefined}>
      <legend className="text-[13px] font-semibold text-ink2 mb-1.5">{label}{required && <span className="text-bad" aria-hidden="true"> *</span>}</legend>
      {chosen.map((s) => <input key={s.id} type="hidden" name={name} value={s.id} />)}
      {chosen.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Chosen">
          {chosen.map((s) => (
            <li key={s.id} className="inline-flex items-center gap-1.5 min-h-8 pl-1 pr-1 rounded-full bg-sunken text-[13px] font-semibold max-w-full">
              <Avatar name={s.name} size={24} />
              <span className="truncate">{s.name}</span>
              <span className="text-ink3 font-normal truncate hidden sm:inline">{[s.cls, s.bed].filter(Boolean).join(" · ")}</span>
              <button type="button" aria-label={`Remove ${s.name}`} onClick={() => pick(chosen.filter((x) => x.id !== s.id))} className="size-7 grid place-items-center rounded-full hover:bg-line shrink-0"><X size={14} aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      )}
      {showSearch && (
        <div className="relative">
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3" aria-hidden="true" />
          <label htmlFor={id} className="sr-only">{label}</label>
          <input id={id} type="search" value={q} placeholder={placeholder} autoComplete="off" aria-invalid={t.error ? true : undefined}
            onChange={(e) => {
              const v = e.target.value; setQ(v);
              if (timer.current) clearTimeout(timer.current);
              if (v.trim().length < 2) { setFound(null); return; }
              timer.current = setTimeout(() => startFind(async () => setFound(await findStudentsAction(v, mode))), 250);
            }}
            className={cx(inputCls(t.error), "h-11 pl-10")} />
          {pending && <Spinner className="absolute right-3 top-3.5" />}
        </div>
      )}
      {showSearch && found && (
        <ul className="rounded-xl border border-line divide-y divide-line/70 overflow-hidden" role="listbox" aria-label="Students found">
          {found.filter((s) => !chosen.some((c) => c.id === s.id)).length === 0 && (
            <li className="px-3.5 py-2.5 text-[13.5px] text-ink3">{mode === "resident" ? `No resident called “${q}”. Only students living in your hostel are shown.` : `No student called “${q}” without a bed. Students who already have a bed are moved from Allocation.`}</li>
          )}
          {found.filter((s) => !chosen.some((c) => c.id === s.id)).map((s) => (
            <li key={s.id}>
              <button type="button" role="option" aria-selected={false} onClick={() => pick(multiple ? [...chosen, s] : [s])} className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-sunken text-left min-h-11">
                <Avatar name={s.name} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-[14px] truncate">{s.name}</span>
                  <span className="block text-[12.5px] text-ink3 truncate">{[s.cls, s.admissionNo, s.bed].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {t.error ? <p id={`${id}-err`} className="text-[12.5px] text-bad">{t.error}</p> : help ? <p id={`${id}-help`} className="text-[12.5px] text-ink3">{help}</p> : null}
    </fieldset>
  );
}

/** A risky action: says exactly what will happen, then runs the server action (P4). */
export function ConfirmAct({ action, fields, trigger, triggerVariant = "secondary", title, children, confirmLabel, danger }: { action: Act; fields: Record<string, string>; trigger: React.ReactNode; triggerVariant?: ButtonVariant; title: string; children: React.ReactNode; confirmLabel: string; danger?: boolean }) {
  const router = useRouter();
  const [, start] = useTransition();
  return (
    <ConfirmButton trigger={trigger} triggerVariant={triggerVariant} title={title} confirmLabel={confirmLabel} confirmVariant={danger ? "danger" : "primary"}
      onConfirm={async () => {
        const fd = new FormData();
        for (const [k, v] of Object.entries(fields)) fd.set(k, v);
        const r = await action(null, fd);
        if (!r?.ok) return r?.message ?? "That did not work. Nothing was changed.";
        start(() => router.refresh());
      }}>
      {children}
    </ConfirmButton>
  );
}

/* ---------- Roll call ---------- */

export type RollRow = { id: string; name: string; cls: string; roomNo: string; bedNo: number; floor: string; mark: "PRESENT" | "ABSENT" | "OUTING" | "LEAVE"; away: string | null; school?: string | null };

/**
 * The roll call sheet: everyone present to start with; tap a student to mark
 * them absent. Students out on an approved pass are fixed as On outing or On
 * leave. Same pattern as Take Attendance.
 */
export function RollCallForm({ hostelId, date, session, rows, floors, saved, canSave, editable }: { hostelId: string; date: string; session: "MORNING" | "NIGHT"; rows: RollRow[]; floors: string[]; saved: boolean; canSave: boolean; editable: boolean }) {
  const [state, run, pending] = useActionState<FormState<unknown>, FormData>(saveRollCallAction, null);
  const [absent, setAbsent] = useState<Set<string>>(() => new Set(rows.filter((r) => r.mark === "ABSENT").map((r) => r.id)));
  const [floor, setFloor] = useState("all");
  const [q, setQ] = useState("");
  const shown = useMemo(() => rows.filter((r) => (floor === "all" || r.floor === floor) && (!q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase()) || r.roomNo.toLowerCase().includes(q.trim().toLowerCase()))), [rows, floor, q]);
  const away = rows.filter((r) => r.away).length;
  const present = rows.length - away - absent.size;
  const active = canSave && editable;
  const toggle = (r: RollRow) => { if (!active || r.away) return; setAbsent((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; }); };
  return (
    <form action={run} className="flex flex-col">
      <input type="hidden" name="hostelId" value={hostelId} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="session" value={session} />
      {[...absent].map((id) => <input key={id} type="hidden" name="absent" value={id} />)}
      <div className="px-4 md:px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3 border-b border-line">
        {floors.length > 1 && (
          <Segmented label="Floor" size="sm" value={floor} onChange={setFloor} options={[{ value: "all", label: "All floors" }, ...floors.map((f) => ({ value: f, label: f }))]} />
        )}
        <div className="relative flex-1 min-w-0 sm:max-w-[260px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink3" aria-hidden="true" />
          <label className="sr-only" htmlFor="rc-q"><Words k="Find a student or room" /></label>
          <input id="rc-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a student or room" className={cx(inputCls(), "h-10 pl-9 text-[14px]")} />
        </div>
        <p className="text-[13px] text-ink3 tnum sm:ml-auto" aria-live="polite"><b className="text-ok font-semibold">{present} <Words k="present" /></b> · <b className={cx("font-semibold", absent.size ? "text-bad" : "text-ink2")}>{absent.size} <Words k="absent" /></b>{away ? <> · <b className="text-info font-semibold">{away} <Words k="away" /></b></> : null}</p>
      </div>
      {shown.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13.5px] text-ink3"><Words k="No student or room matches “" />{q}”.</p>
      ) : (
        <ul className="divide-y divide-line/70" aria-label="Residents">
          {shown.map((r) => {
            const isAbsent = absent.has(r.id);
            const mark = r.away ? (r.mark === "LEAVE" ? "On leave" : "On outing") : isAbsent ? "Absent" : "Present";
            return (
              <li key={r.id}>
                <button type="button" onClick={() => toggle(r)} disabled={!active || Boolean(r.away)} aria-pressed={active && !r.away ? isAbsent : undefined}
                  aria-label={active && !r.away ? `${r.name}, ${mark}. Tap to mark ${isAbsent ? "present" : "absent"}.` : `${r.name}, ${mark}`}
                  className={cx("w-full flex items-center gap-3 px-4 md:px-5 py-2.5 text-left min-h-14 transition disabled:cursor-default", active && !r.away && "hover:bg-sunken/60 active:bg-sunken", isAbsent && "bg-bad/[.05]")}>
                  <Avatar name={r.name} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-[14.5px] truncate">{r.name}</span>
                    <span className="block text-[12.5px] text-ink3 truncate">{r.cls ? `${r.cls} · ` : ""}<Words k="Room" /> {r.roomNo}<Words k=", Bed" /> {r.bedNo}{r.away ? ` · ${r.away}` : ""}</span>
                    {r.school && <span className="block text-[12px] text-warn font-semibold truncate">{r.school}</span>}
                  </span>
                  <Pill tone={r.away ? (r.mark === "LEAVE" ? "brand" : "info") : isAbsent ? "bad" : "ok"}>{mark}</Pill>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {canSave && (
        <div className="sticky bottom-0 z-[2] bg-surface border-t border-line px-4 md:px-5 py-3 flex flex-wrap items-center gap-3 justify-between">
          <div className="text-[13px] min-w-0">
            {state && !state.ok ? <span className="text-bad" role="alert">{state.message}</span>
              : !editable ? <span className="text-ink3"><Words k="Roll calls older than 7 days cannot be changed." /></span>
              : <span className="text-ink3">{saved ? "Saved earlier. Change the exceptions and save again." : "Everyone is present to start with. Tap anyone who is not here."}</span>}
          </div>
          {editable && (
            <div className="flex gap-2">
              {absent.size > 0 && <Button variant="ghost" onClick={() => setAbsent(new Set())}><Words k="Mark all present" /></Button>}
              <Button type="submit" variant="primary" icon={Check} loading={pending}>{saved ? "Save changes" : `Save ${session === "NIGHT" ? "night" : "morning"} roll call`}</Button>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
