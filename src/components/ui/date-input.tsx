"use client";

// The date, time and date-and-time boxes on every screen, in place of the browser's
// own <input type="date|time|datetime-local">, whose calendar was small, started on
// today's month and made a date of birth a long scroll through years.
// - The date is shown as DD-MM-YYYY and the time as 9:30 AM (00-global.md P17).
// - A date can be typed any common way ("14052012", "14/5/12", "14 May 2012", "today")
//   or picked from a calendar that jumps to any month or year, works with the keyboard
//   (arrows, Page Up/Down, Home/End, Enter, Escape) and has Today. Dates of birth open
//   on the years. Times are typed ("930", "9.30 pm") or picked from a list.
// - They take the same props as the browser's box. The form gets the value from a
//   hidden input with the name (YYYY-MM-DD, HH:MM, or both joined by T), and onChange
//   gets an event whose target is that input. The hidden input also fires the
//   browser's input and change events, for forms that listen for them.
// - The calendar is a popover (top layer), so it shows above sheets and dialogs and
//   is never cut off by a scrolling panel.
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { cx } from "./cx";
import { useT } from "@/lib/i18n/client";
import {
  addDays, addMonths, daysIn, isoOf, isoParts, maskDate, monthCells, parseDateText, parseTimeText,
  showDate, showTime, timeChoices, todayIn, weekdayOf,
} from "@/lib/date-text";

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange" | "min" | "max" | "size">;

export type PickerProps = InputProps & {
  value?: string;
  defaultValue?: string | number | readonly string[];
  min?: string | number;
  max?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Classes for the box around the field and its button (the field takes `className`). */
  wrapperClassName?: string;
};

type DateProps = PickerProps & {
  /** Open on the list of years: for dates of birth. */
  pickYearFirst?: boolean;
  /** Show the day of the week inside the box when there is room ("Mon"). */
  weekdayHint?: boolean;
};

const str = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const clampIso = (iso: string, min: string, max: string) => (min && iso < min ? min : max && iso > max ? max : iso);
const outside = (iso: string, min: string, max: string) => Boolean((min && iso < min) || (max && iso > max));
const locale = (lang: string) => (lang === "en" ? "en-GB" : lang);

/** Sets the hidden input, tells the screen (onChange) and the browser (input and change events). */
function emit(el: HTMLInputElement | null, value: string, onChange?: PickerProps["onChange"]) {
  if (!el) return;
  el.value = value;
  onChange?.({
    target: el, currentTarget: el, type: "change", bubbles: true, defaultPrevented: false,
    nativeEvent: new Event("change"), preventDefault() {}, stopPropagation() {},
    isDefaultPrevented: () => false, isPropagationStopped: () => false, persist() {},
  } as unknown as React.ChangeEvent<HTMLInputElement>);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/** The value held here: follows `value` when the screen controls it, else starts from defaultValue. */
function useHeld(value: string | undefined, defaultValue: string, hidden: React.RefObject<HTMLInputElement | null>) {
  const [cur, setCur] = useState(value ?? defaultValue);
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    if (value !== undefined) setCur(value);
  }
  // React 19 resets an action form once its action ends: a box the screen does not
  // control goes back to its defaultValue, as the browser's own box did.
  const latest = useRef({ controlled: value !== undefined, defaultValue });
  useEffect(() => { latest.current = { controlled: value !== undefined, defaultValue }; });
  useEffect(() => {
    const form = hidden.current?.form;
    if (!form) return;
    const onReset = () => { if (!latest.current.controlled) setCur(latest.current.defaultValue); };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [hidden]);
  return [cur, setCur] as const;
}

const isShown = (p: HTMLElement) => { try { return p.matches(":popover-open"); } catch { return false; } };

/** Shows the popover in the top layer, under the field (or above it when there is no room), and keeps it there. */
function usePopover(open: boolean, anchor: React.RefObject<HTMLElement | null>, pop: React.RefObject<HTMLDivElement | null>, close: () => void) {
  const place = useCallback(() => {
    const a = anchor.current, p = pop.current;
    if (!a || !p) return;
    const r = a.getBoundingClientRect();
    const w = p.offsetWidth, h = p.offsetHeight, vw = window.innerWidth, vh = window.innerHeight, gap = 6, edge = 8;
    const left = Math.max(edge, Math.min(r.left, vw - w - edge));
    let top = r.bottom + gap;
    if (top + h > vh - edge) top = r.top - gap - h >= edge ? r.top - gap - h : Math.max(edge, vh - h - edge);
    p.style.left = `${left}px`;
    p.style.top = `${top}px`;
  }, [anchor, pop]);

  useLayoutEffect(() => {
    const p = pop.current;
    if (!p) return;
    // Browsers without popovers (iOS before 17) show it as a plain fixed box; it is empty, and so hidden, when closed.
    if (typeof p.showPopover === "function") {
      if (open && !isShown(p)) p.showPopover();
      else if (!open && isShown(p)) p.hidePopover();
    }
    if (open) place();
  }, [open, place, pop]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!anchor.current?.contains(t) && !pop.current?.contains(t)) close();
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", away, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("pointerdown", away, true);
    };
  }, [open, place, close, anchor, pop]);
  return place;
}

const popCls = "fixed z-50 empty:hidden m-0 inset-auto p-3 bg-surface text-ink border border-line rounded-2xl shadow-pop overflow-visible "
  + "transition-[opacity,transform] duration-150 ease-out starting:opacity-0 starting:-translate-y-1 motion-reduce:transition-none";
const iconBtn = "absolute right-1 top-1/2 -translate-y-1/2 grid place-items-center size-9 rounded-lg text-ink3 hover:text-ink hover:bg-sunken "
  + "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:pointer-events-none disabled:opacity-50";
const badCls = "!border-bad !ring-4 !ring-bad/10";

/** The typed box shared by the date and time fields. */
function useTyped({ held, show, parse, check, commitValue }: {
  held: string; show: (v: string) => string; parse: (text: string) => string | null;
  check: (v: string) => string; commitValue: (v: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [bad, setBad] = useState("");
  const commit = (): boolean => {
    if (draft === null) return !bad;
    const v = parse(draft);
    if (v === null) {
      setBad("unreadable");
      if (held) commitValue("");
      return false;
    }
    setDraft(null);
    const problem = v ? check(v) : "";
    setBad(problem);
    if (v !== held) commitValue(v);
    return !problem;
  };
  return { text: draft ?? show(held), draft, setDraft, bad, setBad, commit };
}

export function DateInput(props: DateProps) {
  const {
    value, defaultValue, min: minP, max: maxP, onChange, wrapperClassName, pickYearFirst, weekdayHint,
    name, form, disabled, readOnly, required, className, placeholder, onBlur, onKeyDown, ...rest
  } = props;
  const t = useT();
  const min = str(minP).slice(0, 10), max = str(maxP).slice(0, 10);
  const hidden = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const popId = useId();
  const [held, setHeld] = useHeld(value, str(defaultValue), hidden);
  const [open, setOpen] = useState<false | "mouse" | "keys">(false);
  const [touch, setTouch] = useState(false);
  const today = todayIn();

  const set = (v: string) => { setHeld(v); emit(hidden.current, v, onChange); };
  const tooEarly = t.any("Pick a date on or after {date}.", { date: showDate(min) });
  const tooLate = t.any("Pick a date on or before {date}.", { date: showDate(max) });
  const typed = useTyped({
    held, show: showDate, parse: (s) => parseDateText(s, today),
    check: (v) => (min && v < min ? tooEarly : max && v > max ? tooLate : ""), commitValue: set,
  });
  const message = typed.bad === "unreadable" ? t.any("Type the date as DD-MM-YYYY, for example 14-05-2012.") : typed.bad;

  useEffect(() => { field.current?.setCustomValidity(message); }, [message]);

  const close = useCallback(() => setOpen(false), []);
  usePopover(Boolean(open), box, pop, close);

  const pick = (v: string) => {
    typed.setDraft(null);
    typed.setBad("");
    if (v !== held) set(v);
    setOpen(false);
    field.current?.focus({ preventScroll: true });
  };

  const fmt = useMemo(() => new Intl.DateTimeFormat(locale(t.lang), { weekday: "short", timeZone: "UTC" }), [t.lang]);
  const p = isoParts(held);
  const hint = weekdayHint && p && typed.draft === null ? fmt.format(new Date(Date.UTC(p.y, p.m, p.d))) : "";
  const locked = disabled || readOnly;

  return (
    <div ref={box} className={cx("relative", hint && "@container", wrapperClassName)}>
      <input
        ref={field}
        type="text"
        autoComplete="off"
        spellCheck={false}
        inputMode={touch ? "none" : "text"}
        role="combobox"
        aria-haspopup="dialog"
        aria-expanded={Boolean(open)}
        aria-controls={popId}
        placeholder={placeholder ?? "DD-MM-YYYY"}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        {...rest}
        aria-invalid={rest["aria-invalid"] ?? (message ? true : undefined)}
        value={typed.text}
        className={cx(className, "!pr-11 tnum", message && badCls)}
        onPointerDown={(e) => {
          rest.onPointerDown?.(e);
          setTouch(e.pointerType === "touch");
          if (!locked && e.button === 0) setOpen("mouse");
        }}
        onChange={(e) => {
          const end = e.target.selectionStart === e.target.value.length;
          typed.setDraft(end ? maskDate(e.target.value) : e.target.value);
          typed.setBad("");
        }}
        onBlur={(e) => {
          if (!pop.current?.contains(e.relatedTarget as Node)) typed.commit();
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (e.defaultPrevented || locked) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            typed.commit();
            if (open) pop.current?.querySelector<HTMLElement>("[tabindex='0']")?.focus();
            else setOpen("keys");
          }
          else if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
          else if (e.key === "Enter") { setOpen(false); if (!typed.commit()) e.preventDefault(); }
          else if (e.key === "Tab") setOpen(false);
        }}
      />
      {hint && <span aria-hidden="true" className="pointer-events-none absolute right-11 top-1/2 -translate-y-1/2 hidden @[15rem]:block text-[13px] text-ink3">{hint}</span>}
      <button type="button" tabIndex={-1} aria-label={t.any("Open calendar")} disabled={locked} className={iconBtn}
        onPointerDown={(e) => { setTouch(e.pointerType === "touch"); e.preventDefault(); }}
        onClick={() => { typed.commit(); setOpen((o) => (o ? false : "keys")); }}>
        <CalendarDays size={18} aria-hidden="true" />
      </button>
      <input ref={hidden} type="hidden" name={name} form={form} value={held} disabled={disabled} />
      {message && <p className="mt-1.5 text-[12.5px] text-bad" role="alert">{message}</p>}
      <div ref={pop} id={popId} popover="manual" role="dialog" aria-label={t.any("Choose a date")} className={cx(popCls, "w-[min(20rem,calc(100vw-1rem))]")}
        onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); field.current?.focus(); } }}>
        {open && (
          <Calendar value={held} min={min} max={max} today={today} yearFirst={Boolean(pickYearFirst) && !held}
            focusOnOpen={open === "keys" || touch} canClear={!required && Boolean(held)} onPick={pick} />
        )}
      </div>
    </div>
  );
}

type View = "days" | "months" | "years";

function Calendar({ value, min, max, today, yearFirst, focusOnOpen, canClear, onPick }: {
  value: string; min: string; max: string; today: string; yearFirst: boolean; focusOnOpen: boolean; canClear: boolean;
  onPick: (iso: string) => void;
}) {
  const t = useT();
  const loc = locale(t.lang);
  const [view, setView] = useState<View>(yearFirst ? "years" : "days");
  // A date of birth goes years, then months, then days.
  const [chain, setChain] = useState(yearFirst);
  const [focus, setFocus] = useState(() => clampIso(value || today, min, max));
  const moved = useRef(focusOnOpen);
  const body = useRef<HTMLDivElement>(null);
  const f = isoParts(focus)!;

  const names = useMemo(() => {
    const month = new Intl.DateTimeFormat(loc, { month: "long", timeZone: "UTC" });
    const short = new Intl.DateTimeFormat(loc, { month: "short", timeZone: "UTC" });
    const narrow = new Intl.DateTimeFormat(loc, { weekday: "narrow", timeZone: "UTC" });
    const long = new Intl.DateTimeFormat(loc, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    return {
      month: (m: number) => month.format(Date.UTC(2024, m, 1)),
      short: (m: number) => short.format(Date.UTC(2024, m, 1)),
      days: Array.from({ length: 7 }, (_, i) => narrow.format(Date.UTC(2024, 0, 1 + i))), // 1 Jan 2024 was a Monday
      full: (iso: string) => { const p = isoParts(iso)!; return long.format(Date.UTC(p.y, p.m, p.d)); },
    };
  }, [loc]);

  // Keyboard focus follows `focus` once the keys (or a touch) are in use.
  useEffect(() => {
    if (!moved.current) return;
    const el = body.current?.querySelector<HTMLButtonElement>(view === "days" ? `[data-iso="${focus}"]` : "[tabindex='0']");
    el?.focus({ preventScroll: true });
  }, [focus, view]);

  const go = (iso: string) => { moved.current = true; setFocus(clampIso(iso, min, max)); };
  const minYear = min ? Number(min.slice(0, 4)) : Number(today.slice(0, 4)) - 100;
  const maxYear = max ? Number(max.slice(0, 4)) : Number(today.slice(0, 4)) + 20;
  const monthOff = (y: number, m: number) => outside(isoOf(y, m, 1), "", max) || outside(isoOf(y, m, daysIn(y, m)), min, "");
  const inMonth = (y: number, m: number) => isoOf(y, m, Math.min(f.d, daysIn(y, m)));

  const onDayKeys = (e: React.KeyboardEvent) => {
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let next: string | null = null;
    if (e.key in steps) next = addDays(focus, steps[e.key]);
    else if (e.key === "Home") next = addDays(focus, -weekdayOf(focus));
    else if (e.key === "End") next = addDays(focus, 6 - weekdayOf(focus));
    else if (e.key === "PageUp") next = addMonths(focus, e.shiftKey ? -12 : -1);
    else if (e.key === "PageDown") next = addMonths(focus, e.shiftKey ? 12 : 1);
    if (next) { e.preventDefault(); go(next); }
  };

  /** Arrow keys in the month and year grids. */
  const onGridKeys = (cols: number) => (e: React.KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols };
    if (!(e.key in steps)) return;
    const list = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    const to = list[Math.max(0, Math.min(list.length - 1, (at < 0 ? 0 : at) + steps[e.key]))];
    if (to) { e.preventDefault(); to.focus(); }
  };

  const head = "inline-flex items-center gap-1 h-9 px-2.5 rounded-lg text-[15px] font-semibold hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
  const arrow = "grid place-items-center size-9 rounded-lg text-ink2 hover:bg-sunken hover:text-ink disabled:opacity-30 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
  const tile = (on: boolean, now: boolean) => cx(
    "h-11 rounded-xl text-[14px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 focus-visible:ring-offset-surface disabled:opacity-35 disabled:pointer-events-none",
    on ? "bg-brand text-brandink" : now ? "text-brand ring-1 ring-inset ring-brand/50 hover:bg-brand/10" : "text-ink hover:bg-sunken",
  );
  const sel = isoParts(value);

  return (
    <div ref={body}>
      <div className="flex items-center gap-0.5 pb-2">
        <button type="button" className={cx(head, view === "months" && "bg-sunken")} aria-expanded={view === "months"}
          onClick={() => { setChain(false); setView(view === "months" ? "days" : "months"); }}>
          {names.month(f.m)}<ChevronDown size={15} aria-hidden="true" className={cx("text-ink3 transition-transform", view === "months" && "rotate-180")} />
        </button>
        <button type="button" className={cx(head, "tnum", view === "years" && "bg-sunken")} aria-expanded={view === "years"}
          onClick={() => { setChain(false); setView(view === "years" ? "days" : "years"); }}>
          {f.y}<ChevronDown size={15} aria-hidden="true" className={cx("text-ink3 transition-transform", view === "years" && "rotate-180")} />
        </button>
        <span className="flex-1" />
        {view !== "years" && (() => {
          const by = view === "months" ? 12 : 1;
          const back = addMonths(focus, -by), on = addMonths(focus, by);
          const b = isoParts(back)!;
          const backOff = Boolean(min) && isoOf(b.y, b.m, daysIn(b.y, b.m)) < min;
          const onOff = Boolean(max) && on.slice(0, 8) + "01" > max;
          return (
            <>
              <button type="button" className={arrow} disabled={backOff} aria-label={t.any(by === 12 ? "Previous year" : "Previous month")} onClick={() => setFocus(clampIso(back, min, max))}><ChevronLeft size={18} aria-hidden="true" /></button>
              <button type="button" className={arrow} disabled={onOff} aria-label={t.any(by === 12 ? "Next year" : "Next month")} onClick={() => setFocus(clampIso(on, min, max))}><ChevronRight size={18} aria-hidden="true" /></button>
            </>
          );
        })()}
      </div>

      {view === "days" && (
        <div role="grid" aria-label={`${names.month(f.m)} ${f.y}`} onKeyDown={onDayKeys}>
          <div role="row" className="grid grid-cols-7 mb-1">
            {names.days.map((d, i) => (
              <span key={i} role="columnheader" className={cx("h-8 grid place-items-center text-[12px] font-semibold", i === 6 ? "text-bad/70" : "text-ink3")}>{d}</span>
            ))}
          </div>
          {Array.from({ length: 6 }, (_, w) => (
            <div key={w} role="row" className="grid grid-cols-7">
              {monthCells(f.y, f.m).slice(w * 7, w * 7 + 7).map((iso, i) => {
                const p = isoParts(iso)!;
                const on = iso === value, now = iso === today, off = outside(iso, min, max), other = p.m !== f.m;
                return (
                  <div key={iso} role="gridcell" aria-selected={on} className="p-0.5">
                    <button type="button" data-iso={iso} tabIndex={iso === focus ? 0 : -1} disabled={off}
                      aria-label={names.full(iso)} aria-current={now ? "date" : undefined}
                      onClick={() => onPick(iso)}
                      className={cx(
                        "relative w-full h-10 rounded-xl text-[14px] tnum transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 focus-visible:ring-offset-surface",
                        on ? "bg-brand text-brandink font-semibold"
                          : off ? "text-ink3/40 line-through decoration-ink3/40"
                            : cx("hover:bg-sunken", other ? "text-ink3/70" : i === 6 ? "text-bad/80" : "text-ink", now && "font-bold text-brand"),
                      )}>
                      {p.d}
                      {now && !on && <span aria-hidden="true" className="absolute bottom-1.5 left-1/2 -translate-x-1/2 size-1 rounded-full bg-brand" />}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {view === "months" && (
        <div className="grid grid-cols-3 gap-1.5" onKeyDown={onGridKeys(3)} aria-label={t.any("Choose a month")} role="group">
          {Array.from({ length: 12 }, (_, m) => {
            const on = sel?.y === f.y && sel.m === m;
            return (
              <button key={m} type="button" disabled={monthOff(f.y, m)} tabIndex={m === f.m ? 0 : -1} aria-pressed={on}
                className={tile(on, today.slice(0, 7) === isoOf(f.y, m, 1).slice(0, 7))}
                onClick={() => { moved.current = true; setFocus(clampIso(inMonth(f.y, m), min, max)); setView("days"); setChain(false); }}>
                {names.short(m)}
              </button>
            );
          })}
        </div>
      )}

      {view === "years" && (
        <Years from={minYear} to={maxYear} focusYear={f.y} selected={sel?.y} thisYear={Number(today.slice(0, 4))} tile={tile} onKeys={onGridKeys(4)}
          label={t.any("Choose a year")}
          onPick={(y) => {
            moved.current = true;
            setFocus(clampIso(inMonth(y, f.m), min, max));
            setView(chain ? "months" : "days");
          }} />
      )}

      <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
        <button type="button" disabled={outside(today, min, max)} onClick={() => onPick(today)}
          className="h-9 px-3 rounded-lg text-[14px] font-semibold text-brand hover:bg-brand/10 disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          {t.any("Today")}
        </button>
        {canClear && (
          <button type="button" onClick={() => onPick("")}
            className="h-9 px-3 rounded-lg text-[14px] font-semibold text-ink2 hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
            {t.any("Clear")}
          </button>
        )}
      </div>
    </div>
  );
}

function Years({ from, to, focusYear, selected, thisYear, tile, onKeys, label, onPick }: {
  from: number; to: number; focusYear: number; selected?: number; thisYear: number; label: string;
  tile: (on: boolean, now: boolean) => string; onKeys: (e: React.KeyboardEvent<HTMLDivElement>) => void; onPick: (y: number) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  // Start with the year in view (the middle of the list), without moving the page. A passive
  // effect: the popover is shown in the field's layout effect, which runs after this one's would.
  useEffect(() => {
    const c = list.current, el = c?.querySelector<HTMLElement>("[tabindex='0']");
    if (c && el) c.scrollTop = el.offsetTop - c.clientHeight / 2 + el.offsetHeight / 2;
  }, []);
  const years = Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
  return (
    <div ref={list} role="group" aria-label={label} onKeyDown={onKeys} className="relative grid grid-cols-4 gap-1.5 max-h-[17.5rem] overflow-y-auto overscroll-contain p-0.5 -m-0.5">
      {years.map((y) => (
        <button key={y} type="button" tabIndex={y === focusYear ? 0 : -1} aria-pressed={y === selected}
          className={cx(tile(y === selected, y === thisYear), "tnum")} onClick={() => onPick(y)}>
          {y}
        </button>
      ))}
    </div>
  );
}

export function TimeInput(props: PickerProps) {
  const {
    value, defaultValue, min: minP, max: maxP, step, onChange, wrapperClassName,
    name, form, disabled, readOnly, required, className, placeholder, onBlur, onKeyDown, ...rest
  } = props;
  const t = useT();
  const min = str(minP).slice(0, 5), max = str(maxP).slice(0, 5);
  const hidden = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const popId = useId();
  const [held, setHeld] = useHeld(value === undefined ? undefined : value.slice(0, 5), str(defaultValue).slice(0, 5), hidden);
  const [open, setOpen] = useState<false | "mouse" | "keys">(false);
  const [touch, setTouch] = useState(false);

  const set = (v: string) => { setHeld(v); emit(hidden.current, v, onChange); };
  const typed = useTyped({
    held, show: showTime, parse: parseTimeText, commitValue: set,
    check: (v) => (min && v < min ? t.any("Pick a time from {time}.", { time: showTime(min) })
      : max && v > max ? t.any("Pick a time up to {time}.", { time: showTime(max) }) : ""),
  });
  const message = typed.bad === "unreadable" ? t.any("Type the time like 9:30 AM.") : typed.bad;
  useEffect(() => { field.current?.setCustomValidity(message); }, [message]);

  const close = useCallback(() => setOpen(false), []);
  usePopover(Boolean(open), box, pop, close);

  // The list steps by the field's step (in seconds, as on the browser's box): 15 minutes to an hour. Any minute can be typed.
  const every = Math.min(60, Math.max(15, Math.round((Number(step) || 900) / 60)));
  const choices = useMemo(() => timeChoices(every, min, max), [every, min, max]);

  const pick = (v: string) => {
    typed.setDraft(null);
    typed.setBad("");
    if (v !== held) set(v);
    setOpen(false);
    field.current?.focus({ preventScroll: true });
  };
  const locked = disabled || readOnly;

  return (
    <div ref={box} className={cx("relative", wrapperClassName)}>
      <input
        ref={field}
        type="text"
        autoComplete="off"
        spellCheck={false}
        inputMode={touch ? "none" : "text"}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={Boolean(open)}
        aria-controls={popId}
        placeholder={placeholder ?? "9:30 AM"}
        disabled={disabled}
        readOnly={readOnly}
        required={required}
        {...rest}
        aria-invalid={rest["aria-invalid"] ?? (message ? true : undefined)}
        value={typed.text}
        className={cx(className, "!pr-11 tnum", message && badCls)}
        onPointerDown={(e) => {
          rest.onPointerDown?.(e);
          setTouch(e.pointerType === "touch");
          if (!locked && e.button === 0) setOpen("mouse");
        }}
        onChange={(e) => { typed.setDraft(e.target.value); typed.setBad(""); }}
        onBlur={(e) => { if (!pop.current?.contains(e.relatedTarget as Node)) typed.commit(); onBlur?.(e); }}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (e.defaultPrevented || locked) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            typed.commit();
            if (open) pop.current?.querySelector<HTMLElement>("[tabindex='0']")?.focus();
            else setOpen("keys");
          }
          else if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
          else if (e.key === "Enter") { setOpen(false); if (!typed.commit()) e.preventDefault(); }
          else if (e.key === "Tab") setOpen(false);
        }}
      />
      <button type="button" tabIndex={-1} aria-label={t.any("Open the list of times")} disabled={locked} className={iconBtn}
        onPointerDown={(e) => { setTouch(e.pointerType === "touch"); e.preventDefault(); }}
        onClick={() => { typed.commit(); setOpen((o) => (o ? false : "keys")); }}>
        <Clock size={18} aria-hidden="true" />
      </button>
      <input ref={hidden} type="hidden" name={name} form={form} value={held} disabled={disabled} />
      {message && <p className="mt-1.5 text-[12.5px] text-bad" role="alert">{message}</p>}
      <div ref={pop} id={popId} popover="manual" className={cx(popCls, "!p-1.5 w-44")}
        onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); field.current?.focus(); } }}>
        {open && <TimeList choices={choices} value={held} focusOnOpen={open === "keys" || touch} label={t.any("Choose a time")} onPick={pick} />}
      </div>
    </div>
  );
}

function TimeList({ choices, value, focusOnOpen, label, onPick }: { choices: string[]; value: string; focusOnOpen: boolean; label: string; onPick: (v: string) => void }) {
  const list = useRef<HTMLDivElement>(null);
  // The chosen time, or the nearest one from now, sits in the middle when the list opens.
  const near = useMemo(() => {
    if (value && choices.includes(value)) return value;
    const target = value || new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
    return choices.find((c) => c >= target) ?? choices[choices.length - 1];
  }, [choices, value]);
  useEffect(() => {
    const c = list.current, el = c?.querySelector<HTMLElement>("[tabindex='0']");
    if (!c || !el) return;
    c.scrollTop = el.offsetTop - c.clientHeight / 2 + el.offsetHeight / 2;
    if (focusOnOpen) el.focus({ preventScroll: true });
  }, [focusOnOpen]);
  const onKeys = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, PageUp: -4, PageDown: 4 };
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>("[role='option']"));
    const at = items.indexOf(document.activeElement as HTMLElement);
    let to = -1;
    if (e.key in steps) to = Math.max(0, Math.min(items.length - 1, (at < 0 ? 0 : at) + steps[e.key]));
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = items.length - 1;
    if (to >= 0) { e.preventDefault(); items[to].focus(); items[to].scrollIntoView({ block: "nearest" }); }
  };
  return (
    <div ref={list} role="listbox" aria-label={label} onKeyDown={onKeys} className="max-h-64 overflow-y-auto overscroll-contain">
      {choices.map((c) => {
        const on = c === value;
        return (
          <div key={c} role="option" aria-selected={on} tabIndex={c === near ? 0 : -1}
            onClick={() => onPick(c)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(c); } }}
            className={cx(
              "flex items-center h-10 px-3 rounded-lg text-[14px] tnum cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-brand",
              on ? "bg-brand text-brandink font-semibold" : "text-ink hover:bg-sunken focus:bg-sunken",
            )}>
            {showTime(c)}
          </div>
        );
      })}
    </div>
  );
}

/** A day and a time together (the browser's datetime-local): the form gets YYYY-MM-DDTHH:MM. */
export function DateTimeInput(props: PickerProps) {
  const { value, defaultValue, min: minP, max: maxP, step, onChange, wrapperClassName, name, form, disabled, readOnly, required, className, id, ...rest } = props;
  const t = useT();
  const hidden = useRef<HTMLInputElement>(null);
  const [held, setHeld] = useHeld(value, str(defaultValue), hidden);
  const split = (v: string) => ({ date: v.slice(0, 10), time: v.slice(11, 16) });
  const join = (p: { date: string; time: string }) => (p.date && p.time ? `${p.date}T${p.time}` : "");
  // The day and time are kept apart, so a day picked before its time is not lost.
  const [parts, setParts] = useState(() => split(held));
  const [seen, setSeen] = useState(held);
  if (held !== seen) {
    // The screen (or a form reset) changed the value.
    setSeen(held);
    if (held !== join(parts)) setParts(split(held));
  }
  const min = str(minP), max = str(maxP);
  const change = (next: { date: string; time: string }) => {
    setParts(next);
    const v = join(next);
    if (v !== held) { setHeld(v); emit(hidden.current, v, onChange); }
  };
  const sameDay = (edge: string) => (edge && parts.date === edge.slice(0, 10) ? edge.slice(11, 16) : undefined);
  const label = rest["aria-label"];
  return (
    <div className={cx("grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-2", wrapperClassName)}>
      <DateInput {...rest} id={id} className={className} disabled={disabled} readOnly={readOnly} required={required}
        aria-label={label ? `${label}: ${t.any("Date")}` : undefined}
        value={parts.date} min={min.slice(0, 10)} max={max.slice(0, 10)} onChange={(e) => change({ ...parts, date: e.target.value })} />
      <TimeInput {...rest} id={id ? `${id}-time` : undefined} className={className} disabled={disabled} readOnly={readOnly} required={required}
        aria-label={label ? `${label}: ${t.any("Time")}` : t.any("Time")} step={step}
        value={parts.time} min={sameDay(min)} max={sameDay(max)} onChange={(e) => change({ ...parts, time: e.target.value })} />
      <input ref={hidden} type="hidden" name={name} form={form} value={held} disabled={disabled} />
    </div>
  );
}

/** The right box for a browser date, time or datetime-local type. */
export function PickerInput({ type, pickYearFirst, weekdayHint, ...props }: DateProps & { type: "date" | "time" | "datetime-local" }) {
  if (type === "time") return <TimeInput {...props} />;
  if (type === "datetime-local") return <DateTimeInput {...props} />;
  return <DateInput pickYearFirst={pickYearFirst} weekdayHint={weekdayHint} {...props} />;
}

export const PICKER_TYPES = new Set(["date", "time", "datetime-local"]);
