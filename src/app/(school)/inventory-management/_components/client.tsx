"use client";

// Browser pieces used across the Inventory pages: a one-tap action button
// that shows its problem in place, a segmented choice sent with a form, item
// lines (item, quantity and, where needed, price) that show the stock in hand
// as the person types, the student finder for the store counter, and the
// scan box for asset audits.

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, BellRing, Check, CircleX, CornerDownLeft, Mail, Plus, RotateCcw, ScanLine, Search, Send, Trash2, UserRound, X, type LucideIcon } from "lucide-react";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { Segmented, type SegOption } from "@/components/ui/controls";
import { inputCls } from "@/components/ui/field";
import { FormResultProvider, useTyped } from "@/components/ui/url-sheet";
import { cx } from "@/components/ui/cx";
import type { FormState } from "@/lib/forms";

type Act = (prev: FormState<unknown>, fd: FormData) => Promise<FormState<unknown>>;
const ICONS = { bell: BellRing, check: Check, cancel: CircleX, send: Send, ret: CornerDownLeft, x: X, mail: Mail, archive: Archive, restore: RotateCcw } satisfies Record<string, LucideIcon>;
export type ActIcon = keyof typeof ICONS;

/** A button that runs one server action (Remind, Give the rest, Bring back...), with its problem shown in place. */
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

/* ---------- Item lines ---------- */

export type ItemPick = { value: string; label: string; unit: string; stock: number; price: string; lastPrice: string; tracksExpiry: boolean };
export type LineStart = { itemId: string; qty: string; price?: string };

const qty = (n: number, unit: string) => `${n.toLocaleString("en-IN")} ${unit === "piece" ? (n === 1 ? "piece" : "pieces") : unit}`;

/**
 * Item lines sent as itemId[], qty[] (and price[] when `price` is set). Each
 * line shows the stock in hand at the chosen store; with `limit` a quantity
 * above it is shown in red (the server refuses it too).
 */
export function ItemLines({ items, start = [], price, limit, stockAt, label = "Items and quantities", help, minRows = 1, onTotal, unitPaise }: {
  items: ItemPick[]; start?: LineStart[]; price?: "unit" | null; limit?: boolean; stockAt?: (itemId: string) => number; label?: string; help?: React.ReactNode; minRows?: number; onTotal?: (paise: number) => void;
  /** Without a price column: each item's price, to total the lines (a fee charge, a set price). */
  unitPaise?: Record<string, number>;
}) {
  const t = useTyped("lines", null);
  const typedIds = useTyped("itemId", null);
  const first = start.length ? start : Array.from({ length: minRows }, () => ({ itemId: "", qty: "", price: "" }));
  const [rows, setRows] = useState(() => first.map((r, i) => ({ key: i, itemId: r.itemId, qty: r.qty, price: r.price ?? "" })));
  const [next, setNext] = useState(first.length);
  const byId = useMemo(() => new Map(items.map((i) => [i.value, i])), [items]);
  const have = (id: string) => (stockAt ? stockAt(id) : byId.get(id)?.stock ?? 0);
  const total = rows.reduce((a, r) => a + (price ? Math.round((Number(r.price.replace(/[₹,\s]/g, "")) || 0) * 100) : unitPaise?.[r.itemId] ?? 0) * (Number(r.qty) || 0), 0);
  useEffect(() => { onTotal?.(total); }, [total, onTotal]);
  const set = (key: number, change: Partial<{ itemId: string; qty: string; price: string }>) => setRows((rs) => rs.map((r) => {
    if (r.key !== key) return r;
    const nr = { ...r, ...change };
    if (price && change.itemId !== undefined && !r.price) nr.price = byId.get(change.itemId)?.lastPrice ?? "";
    return nr;
  }));
  void typedIds;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-[13px] font-semibold text-ink2 mb-1.5">{label} <span className="text-bad" aria-hidden="true">*</span></legend>
      {rows.map((r, i) => {
        const it = byId.get(r.itemId);
        const n = Number(r.qty) || 0;
        const stock = it ? have(it.value) : 0;
        const over = Boolean(limit && it && n > stock);
        return (
          <div key={r.key} className="rounded-xl border border-line p-2.5 flex flex-col gap-1.5">
            <div className={cx("grid gap-2 items-center", price ? "grid-cols-[1fr_84px_104px_auto]" : "grid-cols-[1fr_96px_auto]")}>
              <label className="sr-only" htmlFor={`line-item-${r.key}`}>Item on line {i + 1}</label>
              <select id={`line-item-${r.key}`} name="itemId" value={r.itemId} onChange={(e) => set(r.key, { itemId: e.target.value })} className={cx(inputCls(t.error), "h-11 min-w-0")}>
                <option value="">Choose an item</option>
                {items.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <label className="sr-only" htmlFor={`line-qty-${r.key}`}>Quantity on line {i + 1}</label>
              <input id={`line-qty-${r.key}`} name="qty" inputMode="numeric" value={r.qty} onChange={(e) => set(r.key, { qty: e.target.value.replace(/[^\d]/g, "") })} placeholder="Qty"
                aria-invalid={over ? true : undefined} className={cx(inputCls(over ? "x" : undefined), "h-11 tnum text-right")} />
              {price && (
                <>
                  <label className="sr-only" htmlFor={`line-price-${r.key}`}>Price per unit on line {i + 1}</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink3 text-[14px]" aria-hidden="true">₹</span>
                    <input id={`line-price-${r.key}`} name="price" inputMode="decimal" value={r.price} onChange={(e) => set(r.key, { price: e.target.value })} placeholder="Rate" className={cx(inputCls(undefined), "h-11 pl-7 tnum text-right")} />
                  </div>
                </>
              )}
              <button type="button" aria-label={`Remove line ${i + 1}`} disabled={rows.length <= minRows} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                className="size-11 grid place-items-center rounded-xl text-ink3 hover:bg-sunken hover:text-bad disabled:opacity-30 disabled:hover:bg-transparent">
                <Trash2 size={17} aria-hidden="true" />
              </button>
            </div>
            {it && (
              <p className={cx("text-[12.5px] px-1", over ? "text-bad font-semibold" : stock <= 0 ? "text-warn" : "text-ink3")}>
                {over ? `Only ${qty(stock, it.unit)} in this store.` : stock <= 0 ? "None in stock." : `${qty(stock, it.unit)} in stock`}
                {price && it.lastPrice ? ` · last price ₹${it.lastPrice}` : ""}
              </p>
            )}
          </div>
        );
      })}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button variant="ghost" size="sm" icon={Plus} onClick={() => { setRows((rs) => [...rs, { key: next, itemId: "", qty: "", price: "" }]); setNext((n) => n + 1); }}>Add a line</Button>
        {price && total > 0 && <span className="text-[13.5px] font-semibold tnum">Total ₹{(total / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>}
      </div>
      {t.error ? <p className="text-[12.5px] text-bad" role="alert">{t.error}</p> : help ? <p className="text-[12.5px] text-ink3">{help}</p> : null}
    </fieldset>
  );
}

/* ---------- The student at the counter ---------- */

export type Student = { id: string; name: string; admissionNo: string; cls: string; classId: string | null };

/** Search a student by name or admission number; the chosen one is sent as studentId. */
export function StudentFinder({ find, start, onPick, id = "student-find" }: { find: (q: string) => Promise<Student[]>; start?: Student | null; onPick?: (s: Student | null) => void; id?: string }) {
  const t = useTyped("studentId", start?.id ?? "");
  const [picked, setPicked] = useState<Student | null>(start ?? null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Student[]>([]);
  const [busy, startFind] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const search = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) { setFound([]); return; }
    timer.current = setTimeout(() => startFind(async () => setFound(await find(v))), 250);
  };
  const pick = (s: Student | null) => { setPicked(s); setFound([]); setQ(""); onPick?.(s); };
  if (picked) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-ink2">Student</span>
        <div className="flex items-center gap-3 rounded-xl border border-brand/40 bg-brand/5 px-3 py-2.5">
          <UserRound size={18} className="text-brand shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 text-[14px]"><b className="font-semibold">{picked.name}</b><span className="block text-[12.5px] text-ink3">{picked.admissionNo}{picked.cls ? ` · ${picked.cls}` : ""}</span></span>
          <button type="button" className="text-[13px] font-semibold text-brand hover:underline" onClick={() => pick(null)}>Change</button>
        </div>
        <input type="hidden" name="studentId" value={picked.id} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5 relative">
      <label htmlFor={id} className="text-[13px] font-semibold text-ink2">Student <span className="text-bad" aria-hidden="true">*</span></label>
      <div className="relative">
        <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3" aria-hidden="true" />
        <input id={id} value={q} onChange={(e) => search(e.target.value)} placeholder="Name or admission number" autoComplete="off" role="combobox" aria-expanded={found.length > 0} aria-controls={`${id}-list`}
          aria-invalid={t.error ? true : undefined} className={cx(inputCls(t.error), "h-11 pl-10")} />
      </div>
      {found.length > 0 && (
        <ul id={`${id}-list`} role="listbox" className="rounded-xl border border-line bg-surface shadow-lg overflow-hidden">
          {found.map((s) => (
            <li key={s.id} role="option" aria-selected={false}>
              <button type="button" onClick={() => pick(s)} className="w-full text-left px-3.5 py-2.5 hover:bg-sunken text-[14px]">
                <b className="font-semibold">{s.name}</b> <span className="text-ink3 text-[12.5px]">{s.admissionNo}{s.cls ? ` · ${s.cls}` : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && !busy && found.length === 0 && <p className="text-[12.5px] text-ink3">No student studying now matches “{q.trim()}”.</p>}
      {t.error ? <p className="text-[12.5px] text-bad">{t.error}</p> : <p className="text-[12.5px] text-ink3">Type at least 2 letters.</p>}
    </div>
  );
}

/* ---------- Scan box (asset audits, tags) ---------- */

/** A scanner types the code and presses Enter; the page opens with `param` set to it. */
export function ScanBox({ href, param, label, placeholder, autoFocus, id }: { href: string; param: string; label: string; placeholder: string; autoFocus?: boolean; id: string }) {
  const router = useRouter();
  const [busy, startNav] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <form className="flex flex-col gap-1.5" onSubmit={(e) => {
      e.preventDefault();
      const code = String(new FormData(e.currentTarget).get("code") ?? "").trim();
      if (!code) { setProblem("Scan the tag or type its number."); return; }
      setProblem(null);
      const [path, query = ""] = href.split("?");
      const u = new URLSearchParams(query);
      u.set(param, code);
      startNav(() => router.replace(`${path}?${u.toString()}`, { scroll: false }));
      e.currentTarget.reset();
    }}>
      <label htmlFor={id} className="text-[13px] font-semibold text-ink2">{label}</label>
      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <ScanLine size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3" aria-hidden="true" />
          <input id={id} name="code" placeholder={placeholder} autoFocus={autoFocus} autoComplete="off" spellCheck={false} aria-invalid={problem ? true : undefined}
            className={cx(inputCls(problem), "h-12 pl-11 font-mono text-[15px]")} />
        </div>
        <Button type="submit" variant="primary" loading={busy} className="h-12">Go</Button>
      </div>
      {problem && <p className="text-[12.5px] text-bad" role="alert">{problem}</p>}
    </form>
  );
}

/* ---------- An inline form that resets after success ---------- */

/** A form on the page (not in a sheet): problems shown in place, then cleared for the next entry after a success. */
export function InlineForm<T>({ action, children, submit, pendingText, className, hidden, doneHref }: {
  action: (p: FormState<T>, fd: FormData) => Promise<FormState<T>>; children: (state: FormState<T>, round: number) => React.ReactNode; submit: React.ReactNode | ((state: FormState<T>) => React.ReactNode); pendingText?: string; className?: string; hidden?: Record<string, string>; doneHref?: string;
}) {
  const router = useRouter();
  const [state, run, pending] = useActionState<FormState<T>, FormData>(action, null);
  const [round, setRound] = useState(0);
  const last = useRef<FormState<T>>(null);
  useEffect(() => {
    if (state && state !== last.current) {
      last.current = state;
      if (state.ok) {
        setRound((r) => r + 1);
        if (doneHref) router.replace(doneHref, { scroll: false });
      }
    }
  }, [state, doneHref, router]);
  const link = (state?.data as { link?: { href: string; label: string } } | undefined)?.link;
  const fieldErrors = Object.keys(state?.errors ?? {}).length;
  return (
    <FormResultProvider value={(state?.ok ? null : state) as FormState<unknown>}>
    <form action={run} noValidate className={cx("flex flex-col gap-3", className)}>
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <div key={round} className="contents">{children(state, round)}</div>
      {state && !state.ok && state.message && (fieldErrors === 0 || link) && (
        <div className="rounded-xl bg-bad/10 text-bad px-3.5 py-2.5 text-[13.5px]" role="alert">
          {state.message} {link && <Link className="font-semibold underline" href={link.href}>{link.label}</Link>}
        </div>
      )}
      <Button type="submit" variant="primary" size="lg" loading={pending} loadingText={pendingText} className="w-full">{typeof submit === "function" ? submit(state) : submit}</Button>
    </form>
    </FormResultProvider>
  );
}
