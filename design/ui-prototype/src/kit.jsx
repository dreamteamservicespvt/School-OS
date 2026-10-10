// Shared building blocks for module pages. Built only from the approved look in ui.jsx and the round-1 screens.
import React, { useState, createContext, useContext } from 'react';
import * as I from './icons.js';
import { cx, Card, CardHead, Button, Pill, Avatar, Checkbox, Tabs, PageHead, Sheet, Empty, Switch, inputCls, useToast } from './ui.jsx';
import { useNav, useRole } from './shell.jsx';

/* ---------- Module page header: title, one line of context, actions, and the module's page tabs ---------- */
export const PageCtx = createContext({ module: null, page: null, access: 'full', pages: [] });
export const usePage = () => useContext(PageCtx);
// True when the person may add or change things here (not View access, not a closed year)
export function useCanEdit() {
  const { access } = usePage();
  const { year } = useRole();
  return access !== 'view' && !year?.closed;
}

export function ModuleHead({ title, sub, actions, tabs = true }) {
  const { go } = useNav();
  const { module, page, access, pages, short } = usePage();
  const canEdit = useCanEdit();
  const scope = access === 'view' ? <Pill tone="neutral" className="align-middle ml-2 !h-6"><I.Eye size={13} />View only</Pill>
    : access === 'own' ? <Pill tone="brand" className="align-middle ml-2 !h-6"><I.User size={13} />Only yours</Pill> : null;
  return (
    <>
      <PageHead title={<>{title || short}{scope}</>} sub={sub} actions={canEdit ? actions : null} />
      {tabs && pages.length > 1 && (
        <Tabs className="mb-5" value={page} onChange={(p) => go(module, { page: p })} tabs={pages} />
      )}
    </>
  );
}

/* ---------- Icon by name, safe if a name is wrong ---------- */
export function Icon({ name, ...p }) {
  const Ic = I[name] || I.Circle;
  return <Ic {...p} />;
}

/* ---------- Numbers at the top of a page ---------- */
const TONE_TEXT = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', info: 'text-info', brand: 'text-brand' };
const TONE_SOFT = { ok: 'bg-ok/10 text-ok', warn: 'bg-warn/12 text-warn', bad: 'bg-bad/10 text-bad', info: 'bg-info/10 text-info', brand: 'bg-brand/10 text-brand', neutral: 'bg-sunken text-ink2' };
export { TONE_TEXT, TONE_SOFT };

// items: [{ label, value, sub, tone, icon, onClick }]. Hairlines between tiles, like the profile summary strip.
const STAT_GRID = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-2 @xl:grid-cols-4', 5: 'grid-cols-2 @xl:grid-cols-5', 6: 'grid-cols-2 @lg:grid-cols-3 @xl:grid-cols-6' };
export function Stats({ items, className }) {
  const n = Math.min(items.length, 6);
  return (
    <Card className={cx('overflow-hidden', className)}>
      <div className={cx('grid gap-px bg-line/70', STAT_GRID[n])}>
        {items.map((m, i) => {
          const Ic = typeof m.icon === 'string' ? I[m.icon] : m.icon;
          const B = m.onClick ? 'button' : 'div';
          return (
            <B key={m.label} onClick={m.onClick}
              className={cx('bg-surface text-left px-4 @md:px-5 py-3.5 min-w-0', m.onClick && 'hover:bg-sunken/60 transition', n === 5 && i === 4 && 'col-span-2 @xl:col-span-1')}>
              <p className="text-[12px] text-ink3 font-semibold flex items-center gap-1.5 truncate">{Ic && <Ic size={14} className="shrink-0" />}{m.label}</p>
              <p className={cx('font-semibold text-[19px] @md:text-[21px] tnum mt-0.5 font-display tracking-tight leading-tight truncate', TONE_TEXT[m.tone])}>{m.value}</p>
              {m.sub && <p className="text-[12px] text-ink3 truncate">{m.sub}</p>}
            </B>
          );
        })}
      </div>
    </Card>
  );
}

/* ---------- The one bold moment on a page (same treatment as "School today") ---------- */
// items: 2, 3 or 4 of [{ label, big, foot, onClick }]
const BAND_GRID = { 2: 'grid-cols-2', 3: 'grid-cols-2 @lg:grid-cols-3', 4: 'grid-cols-2 @xl:grid-cols-4' };
const BAND_CELL = {
  2: ['border-r', ''],
  3: ['border-r border-b @lg:border-b-0', 'border-b @lg:border-b-0 @lg:border-r', 'col-span-2 @lg:col-span-1'],
  4: ['border-r border-b @xl:border-b-0', 'border-b @xl:border-b-0 @xl:border-r', 'border-r', ''],
};
export function Band({ items, className }) {
  const n = Math.max(2, Math.min(items.length, 4));
  return (
    <section className={cx('relative overflow-hidden rounded-3xl bg-brand text-brandink shadow-pop', className)}>
      <div className="absolute inset-0 dotgrid opacity-60 pointer-events-none" />
      <div className="absolute -right-16 -top-24 w-72 h-72 rounded-full bg-white/10 blur-2xl pointer-events-none" />
      <div className={cx('relative grid', BAND_GRID[n])}>
        {items.slice(0, 4).map((m, i) => {
          const B = m.onClick ? 'button' : 'div';
          return (
            <B key={m.label} onClick={m.onClick}
              className={cx('text-left p-4 @md:p-6 min-w-0 border-white/15', m.onClick && 'hover:bg-white/[.07] transition', BAND_CELL[n][i])}>
              <p className="text-[12.5px] @md:text-[13px] font-semibold opacity-80 flex items-center gap-1">{m.label}{m.onClick && <I.ChevronRight size={14} className="opacity-60" />}</p>
              <p className="font-display text-[26px] @md:text-[32px] font-semibold tracking-tight leading-tight tnum mt-1 truncate">{m.big}</p>
              {m.foot && <p className="text-[12px] @md:text-[13px] opacity-75 mt-0.5 truncate">{m.foot}</p>}
            </B>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- Search box and filters at the top of a list card ---------- */
export function SearchBox({ value, onChange, placeholder, id, className }) {
  return (
    <div className={cx('relative flex-1 min-w-0', className)}>
      <I.Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3" />
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cx(inputCls(false), 'pl-10')} />
      {value && <button onClick={() => onChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center rounded-lg text-ink3 hover:bg-sunken" aria-label="Clear search"><I.X size={16} /></button>}
    </div>
  );
}
export function Toolbar({ children, className }) {
  return <div className={cx('flex flex-col @md:flex-row gap-2.5 p-3 border-b border-line', className)}>{children}</div>;
}
export function Select({ id, value, onChange, options, className, error }) {
  return (
    <div className={cx('relative', className)}>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={cx(inputCls(error), 'appearance-none pr-10 cursor-pointer')}>
        {options.map((o) => { const v = typeof o === 'string' ? o : o.value; const l = typeof o === 'string' ? o : o.label; return <option key={v} value={v}>{l}</option>; })}
      </select>
      <I.ChevronDown size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink3 pointer-events-none" />
    </div>
  );
}
export function Textarea({ id, value, onChange, placeholder, rows = 3, className }) {
  return <textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder}
    className={cx('w-full rounded-xl bg-surface border border-line hover:border-ink3/50 p-3 text-[15px] text-ink placeholder:text-ink3 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15', className)} />;
}

// Filter chips, like the class picker on Students (scrolls on phones)
export function Chips({ value, onChange, options, className }) {
  return (
    <div className={cx('-mx-4 px-4 @md:mx-0 @md:px-0 overflow-x-auto no-scrollbar', className)}>
      <div className="flex gap-2 w-max pb-1">
        {options.map((o) => {
          const v = typeof o === 'string' ? o : o.value; const l = typeof o === 'string' ? o : o.label; const on = value === v;
          return (
            <button key={v} onClick={() => onChange(v)}
              className={cx('h-10 px-3.5 rounded-xl text-[13.5px] font-semibold border transition inline-flex items-center gap-2',
                on ? 'bg-ink text-bg border-ink' : 'bg-surface border-line text-ink2 hover:border-ink3/50 hover:text-ink')}>
              {l}{o.count != null && <span className={cx('text-[11.5px] tnum', on ? 'opacity-70' : 'text-ink3')}>{o.count}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Lists: a table on computers, cards on phones ---------- */
// columns: [{ key, label, render(row), align: 'right', className, nowrap }]
// mobile(row) => { title, sub, right, avatar, icon, pills: [node] }
export function DataList({ columns, rows, rowKey = (r) => r.id, onRow, mobile, empty, select, footer, minWidth = 640, bp = 'lg' }) {
  const [sel, setSel] = select ? select : [null, null];
  if (!rows.length) return empty || <Empty icon={I.SearchX} title="Nothing matches" body="Try a different search or filter." />;
  const allOn = sel && rows.every((r) => sel.has(rowKey(r)));
  const toggle = (k) => setSel((x) => { const n = new Set(x); n.has(k) ? n.delete(k) : n.add(k); return n; });
  return (
    <>
      <div className={cx('hidden overflow-x-auto scroll-thin', bp === 'md' ? '@md:block' : '@lg:block')}>
        <table className="w-full text-left text-[14px]" style={{ minWidth }}>
          <thead>
            <tr className="text-[12px] text-ink3 font-semibold border-b border-line">
              {sel && <th className="pl-4 pr-2 py-3 w-10"><Checkbox label="Select all" checked={allOn} indeterminate={!allOn && rows.some((r) => sel.has(rowKey(r)))} onChange={() => setSel(allOn ? new Set() : new Set(rows.map(rowKey)))} /></th>}
              {columns.map((c, i) => <th key={c.key} className={cx('px-3 py-3 font-semibold whitespace-nowrap', i === 0 && !sel && 'pl-5', i === columns.length - 1 && 'pr-5', c.align === 'right' && 'text-right')}>{c.label}</th>)}
              {onRow && <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const k = rowKey(r);
              return (
                <tr key={k} onClick={onRow ? () => onRow(r) : undefined}
                  className={cx('border-b border-line/70 last:border-0 transition group', onRow && 'cursor-pointer', sel?.has(k) ? 'bg-brand/5' : onRow && 'hover:bg-sunken/60')}>
                  {sel && <td className="pl-4 pr-2 py-3"><Checkbox label="Select row" checked={sel.has(k)} onChange={() => toggle(k)} /></td>}
                  {columns.map((c, i) => (
                    <td key={c.key} className={cx('px-3 py-2.5 align-middle', i === 0 && !sel && 'pl-5', i === columns.length - 1 && !onRow && 'pr-5', c.align === 'right' && 'text-right tnum', c.nowrap && 'whitespace-nowrap', c.className)}>
                      {c.render ? c.render(r) : r[c.key]}
                    </td>
                  ))}
                  {onRow && <td className="pr-3"><I.ChevronRight size={18} className="text-ink3 opacity-0 group-hover:opacity-100 transition" /></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className={cx('divide-y divide-line/70', bp === 'md' ? '@md:hidden' : '@lg:hidden')}>
        {rows.map((r) => {
          const m = mobile(r);
          const Ic = typeof m.icon === 'string' ? I[m.icon] : m.icon;
          const body = (
            <>
              {sel && <Checkbox label="Select row" checked={sel.has(rowKey(r))} onChange={() => toggle(rowKey(r))} />}
              {m.avatar ? <Avatar name={m.avatar} size={42} /> : Ic ? <span className={cx('w-10 h-10 rounded-xl grid place-items-center shrink-0', TONE_SOFT[m.iconTone || 'neutral'])}><Ic size={19} /></span> : null}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[15px] truncate">{m.title}</p>
                {m.sub && <p className="text-[13px] text-ink3 truncate">{m.sub}</p>}
                {m.pills && <div className="flex gap-1.5 mt-1.5 flex-wrap">{m.pills}</div>}
              </div>
              {m.right && <div className="text-right shrink-0">{m.right}</div>}
              {onRow && <I.ChevronRight size={18} className="text-ink3 shrink-0" />}
            </>
          );
          return (
            <li key={rowKey(r)}>
              {onRow ? <button onClick={() => onRow(r)} className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-sunken">{body}</button>
                : <div className="flex items-center gap-3 px-4 py-3">{body}</div>}
            </li>
          );
        })}
      </ul>
      {footer !== false && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-line text-[13px] text-ink3">
          <span className="tnum">{footer || `Showing ${rows.length} of ${rows.length}`}</span>
        </div>
      )}
    </>
  );
}

// Bar shown when rows are selected (bulk actions)
export function BulkBar({ count, onClear, children }) {
  if (!count) return null;
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-brand/8 border-b border-brand/20 animate-fade flex-wrap">
      <p className="text-[13.5px] font-semibold text-brand mr-2">{count} selected</p>
      {children}
      <Button size="sm" variant="ghost" onClick={onClear}>Clear</Button>
    </div>
  );
}

/* ---------- One row in a simple list: icon or avatar, title, sub, right side ---------- */
export function Row({ avatar, icon, iconTone = 'neutral', title, sub, right, onClick, className }) {
  const Ic = typeof icon === 'string' ? I[icon] : icon;
  const B = onClick ? 'button' : 'div';
  return (
    <B onClick={onClick} className={cx('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left', onClick && 'hover:bg-sunken/70 transition', className)}>
      {avatar ? <Avatar name={avatar} size={38} /> : Ic ? <span className={cx('w-10 h-10 rounded-xl grid place-items-center shrink-0', TONE_SOFT[iconTone])}><Ic size={19} /></span> : null}
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-[14.5px] leading-snug truncate">{title}</p>
        {sub && <p className="text-[12.5px] text-ink3 truncate">{sub}</p>}
      </div>
      {right && <div className="shrink-0 text-right">{right}</div>}
    </B>
  );
}

/* ---------- Settings: rows with a switch, a value or a button ---------- */
export function SettingRow({ title, sub, children, id }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <label htmlFor={id} className="min-w-0 flex-1 text-[14px]">
        <b className="font-semibold block">{title}</b>
        {sub && <span className="block text-[12.5px] text-ink3 mt-0.5">{sub}</span>}
      </label>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
export function ToggleRow({ title, sub, on: start = false, id }) {
  const [on, setOn] = useState(start);
  const toast = useToast();
  const canEdit = useCanEdit();
  return (
    <SettingRow title={title} sub={sub} id={id}>
      <Switch id={id} on={on} label={title} onChange={(v) => { if (!canEdit) return; setOn(v); toast({ title: `${title}: ${v ? 'on' : 'off'}`, body: 'Saved. Recorded in the audit log.' }); }} />
    </SettingRow>
  );
}
// A card of settings. rows: [{ title, sub, on }] for switches, or { title, sub, value } for a value with Change
export function SettingsCard({ title, sub, icon, rows, children }) {
  const toast = useToast();
  const canEdit = useCanEdit();
  return (
    <Card>
      <CardHead title={title} sub={sub} icon={icon} />
      <div className="divide-y divide-line/70 border-t border-line/70">
        {rows && rows.map((r, i) => r.value !== undefined ? (
          <SettingRow key={i} title={r.title} sub={r.sub}>
            <span className="flex items-center gap-2">
              <span className="text-[14px] font-semibold tnum text-right">{r.value}</span>
              {canEdit && <Button size="sm" variant="ghost" onClick={() => toast({ title: `Change: ${r.title}`, body: 'Opens a short form. Every change is logged.', tone: 'info' })}>Change</Button>}
            </span>
          </SettingRow>
        ) : <ToggleRow key={i} title={r.title} sub={r.sub} on={r.on} id={`set-${title}-${i}`.replace(/\W+/g, '-')} />)}
        {children}
      </div>
    </Card>
  );
}

/* ---------- Banner: a calm message strip ---------- */
const BANNER = { info: 'bg-info/8', ok: 'bg-ok/10', warn: 'bg-warn/12', bad: 'bg-bad/10', brand: 'bg-brand/8' };
const BANNER_ICON = { info: I.Info, ok: I.CircleCheck, warn: I.TriangleAlert, bad: I.TriangleAlert, brand: I.Sparkles };
export function Banner({ tone = 'info', icon, title, children, action, className }) {
  const Ic = icon ? (typeof icon === 'string' ? I[icon] : icon) : BANNER_ICON[tone];
  return (
    <div className={cx('rounded-2xl px-4 py-3 flex items-start @md:items-center gap-3 text-[14px]', BANNER[tone], className)}>
      <Ic size={19} className={cx('shrink-0 mt-0.5 @md:mt-0', TONE_TEXT[tone])} />
      <p className="text-ink2 flex-1 min-w-0">{title && <b className="font-semibold text-ink">{title} </b>}{children}</p>
      {action}
    </div>
  );
}

/* ---------- AI suggestion box: labelled, different background, never acts by itself ---------- */
export function Suggestion({ title = 'Suggestion', children, source, actions }) {
  return (
    <Card className="border-brand/25 bg-brand/[.03]">
      <div className="px-5 pt-4 pb-1 flex items-center gap-2">
        <I.Sparkles size={16} className="text-brand" />
        <p className="font-semibold text-[14.5px]">{title}</p>
        <Pill tone="brand" className="!h-5 !text-[11px] ml-auto">Suggestion</Pill>
      </div>
      <div className="px-5 pb-4 text-[14px] leading-relaxed text-ink2">{children}</div>
      {source && <p className="px-5 pb-3 text-[12px] text-ink3">Based on: {source}</p>}
      {actions && <div className="px-5 pb-4 flex gap-2 flex-wrap">{actions}</div>}
    </Card>
  );
}

/* ---------- Small charts ---------- */
export function Progress({ value, tone = 'brand', className }) {
  const c = { brand: 'bg-brand', ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad', info: 'bg-info' }[tone];
  return <span className={cx('block h-1.5 rounded-full bg-sunken overflow-hidden', className)}><span className={cx('block h-full rounded-full transition-all duration-700', c)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></span>;
}
// Horizontal bars with labels, like "Attendance this week". rows: [{ k, v, label? }], goal shows a tick
export function HBars({ rows, max = 100, goal, unit = '%', lowBelow, labelWidth = 64 }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => {
        const low = lowBelow != null && r.v < lowBelow;
        return (
          <li key={r.k} className="grid items-center gap-3 text-[13px]" style={{ gridTemplateColumns: `${labelWidth}px 1fr 52px` }}>
            <span className="text-ink2 font-medium truncate">{r.k}</span>
            <span className="relative h-3 rounded-full bg-sunken overflow-hidden">
              <span className={cx('absolute inset-y-0 left-0 rounded-full', low ? 'bg-warn' : 'bg-brand')} style={{ width: `${(r.v / max) * 100}%` }} />
              {goal != null && <span className="absolute inset-y-0 w-px bg-ink3/50" style={{ left: `${(goal / max) * 100}%` }} />}
            </span>
            <span className={cx('text-right font-semibold tnum', low && 'text-warn')}>{r.label || `${r.v}${unit}`}</span>
          </li>
        );
      })}
    </ul>
  );
}
// Vertical bars, like the fee chart. data: [{ k, v, v2? }] v2 is drawn behind as the "due/target" bar
export function Bars({ data, max, height = 170, label = (v) => v, ariaLabel = 'Chart', ticks }) {
  const W = 360, H = height, padL = 30, padB = 22, top = 8;
  const mx = max || Math.max(...data.map((d) => Math.max(d.v, d.v2 || 0))) * 1.1;
  const y = (v) => top + (H - padB - top) * (1 - v / mx);
  const bw = (W - padL - 8) / data.length;
  const tk = ticks || [0, mx / 3, (2 * mx) / 3].map((t) => Math.round(t));
  const [hover, setHover] = useState(null);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={ariaLabel}>
        {tk.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 4} y1={y(t)} y2={y(t)} style={{ stroke: 'rgb(var(--line))' }} strokeDasharray={t ? '3 4' : ''} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="10" style={{ fill: 'rgb(var(--ink-3))' }}>{label(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = padL + i * bw + bw * 0.18, w = bw * 0.64, on = hover === i;
          return (
            <g key={d.k} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + i * bw} y={top} width={bw} height={H - padB - top} fill="transparent" />
              {d.v2 != null && <rect x={x} y={y(d.v2)} width={w} height={y(0) - y(d.v2)} rx="4" style={{ fill: 'rgb(var(--ink-3) / .22)' }} />}
              <rect x={x} y={y(d.v)} width={w} height={Math.max(0, y(0) - y(d.v))} rx="4" style={{ fill: `rgb(var(--${d.tone || 'brand'}))`, opacity: hover == null || on ? 1 : 0.55 }} />
              <text x={x + w / 2} y={H - 6} textAnchor="middle" fontSize="10.5" fontWeight="500" style={{ fill: 'rgb(var(--ink-2))' }}>{d.k}</text>
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="absolute top-0 right-2 bg-ink text-bg rounded-lg px-2.5 py-1.5 text-[12px] shadow-pop pointer-events-none tnum">
          <b>{data[hover].k}</b> · {label(data[hover].v)}{data[hover].v2 != null ? ` of ${label(data[hover].v2)}` : ''}
        </div>
      )}
    </div>
  );
}
// Legend dots under a chart
export function Legend({ items }) {
  return (
    <div className="flex gap-4 flex-wrap text-[12.5px] text-ink2">
      {items.map(([cls, l]) => <span key={l} className="flex items-center gap-1.5"><span className={cx('w-2.5 h-2.5 rounded-sm', cls)} />{l}</span>)}
    </div>
  );
}

/* ---------- Definition list (label above value) ---------- */
export function DL({ rows, cols = 2 }) {
  return (
    <dl className={cx('grid gap-x-6 gap-y-3.5 px-5 pb-5', cols === 2 && '@sm:grid-cols-2', cols === 3 && '@sm:grid-cols-2 @xl:grid-cols-3')}>
      {rows.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[12px] text-ink3 font-semibold">{k}</dt>
          <dd className="text-[14.5px] mt-0.5 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------- Timeline (newest first) ---------- */
export function Timeline({ items }) {
  return (
    <ol className="flex flex-col">
      {items.map((t, i) => {
        const Ic = typeof t.icon === 'string' ? I[t.icon] || I.Circle : t.icon || I.Circle;
        return (
          <li key={i} className="grid grid-cols-[36px_1fr] gap-3">
            <span className="flex flex-col items-center">
              <span className={cx('w-9 h-9 rounded-full grid place-items-center', TONE_SOFT[t.tone || 'neutral'])}><Ic size={16} /></span>
              {i < items.length - 1 && <span className="w-px flex-1 bg-line my-1" />}
            </span>
            <div className="pb-5 pt-1.5 min-w-0">
              <p className="text-[14.5px] leading-snug">{t.what}</p>
              <p className="text-[12.5px] text-ink3 mt-0.5">{t.when}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- Steps / checklist ---------- */
// items: [{ label, sub, done, action }]
export function Checklist({ items, onAction }) {
  return (
    <ol className="flex flex-col">
      {items.map((s, i) => (
        <li key={s.label} className="flex items-center gap-3 px-5 py-3 border-t border-line/70">
          <span className={cx('w-7 h-7 rounded-full grid place-items-center shrink-0 text-[12px] font-bold tnum', s.done ? 'bg-ok/15 text-ok' : 'bg-sunken text-ink3')}>{s.done ? <I.Check size={15} strokeWidth={3} /> : i + 1}</span>
          <div className="min-w-0 flex-1">
            <p className={cx('text-[14.5px] font-semibold', s.done && 'text-ink2')}>{s.label}</p>
            {s.sub && <p className="text-[12.5px] text-ink3">{s.sub}</p>}
          </div>
          {!s.done && s.action && <Button size="sm" variant="soft" onClick={() => onAction?.(s)}>{s.action}</Button>}
        </li>
      ))}
    </ol>
  );
}

/* ---------- "..." menu on a record ---------- */
// items: [[IconComponentOrName, label, onClick, tone?]]
export function MoreMenu({ items, label = 'More actions', size = 'md' }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button variant="secondary" size={size} icon={I.Ellipsis} aria-label={label} onClick={(e) => { e.stopPropagation(); setOpen(!open); }} className="!px-3" />
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div className="absolute right-0 top-11 z-40 w-60 bg-surface border border-line rounded-2xl shadow-pop p-1.5 animate-rise">
            {items.map(([ic, l, fn, tone]) => {
              const Ic = typeof ic === 'string' ? I[ic] || I.Circle : ic;
              return <button key={l} onClick={(e) => { e.stopPropagation(); setOpen(false); fn?.(); }} className={cx('w-full flex items-center gap-2.5 h-10 px-3 rounded-xl hover:bg-sunken text-[14px] text-left', tone === 'bad' && 'text-bad')}><Ic size={17} className={tone === 'bad' ? '' : 'text-ink3'} />{l}</button>;
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Form in a sheet (dialog on computer, bottom sheet on phone) ---------- */
export function FormSheet({ open, onClose, title, sub, submitLabel = 'Save', onSubmit, children, wide, busyLabel = 'Saving…' }) {
  const [busy, setBusy] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    if (onSubmit && onSubmit() === false) return;
    setBusy(true);
    setTimeout(() => { setBusy(false); onClose(); }, 700);
  };
  return (
    <Sheet open={open} onClose={onClose} title={title} sub={sub} wide={wide}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {children}
        <div className="flex gap-2 justify-end pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" icon={I.Check} loading={busy}>{busy ? busyLabel : submitLabel}</Button>
        </div>
      </form>
    </Sheet>
  );
}
// Confirmation that says exactly what happens. The confirm button repeats the action.
export function ConfirmSheet({ open, onClose, title, sub, confirmLabel, onConfirm, danger, children, typeToConfirm }) {
  const [typed, setTyped] = useState('');
  return (
    <Sheet open={open} onClose={onClose} title={title} sub={sub}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} disabled={typeToConfirm && typed !== typeToConfirm} onClick={() => { onConfirm?.(); onClose(); setTyped(''); }}>{confirmLabel}</Button></>}>
      {children}
      {typeToConfirm && (
        <div className="flex flex-col gap-1.5 mt-2">
          <label htmlFor="type-confirm" className="text-[13px] font-semibold text-ink2">Type <b className="text-ink">{typeToConfirm}</b> to confirm</label>
          <input id="type-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} className={inputCls(false)} autoComplete="off" />
        </div>
      )}
      {!children && !typeToConfirm && <div />}
    </Sheet>
  );
}

/* ---------- Month calendar grid ---------- */
// cell(d) => { tone: 'ok'|'bad'|'warn'|'info'|'brand'|'muted', title, dot }
export function MonthGrid({ year = 2026, month = 9, cell, today = 9, compact }) {
  const days = new Date(year, month + 1, 0).getDate();
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const C = { ok: 'bg-ok/15 text-ok', bad: 'bg-bad/15 text-bad', warn: 'bg-warn/15 text-warn', info: 'bg-info/10 text-info', brand: 'bg-brand/12 text-brand', muted: 'text-ink3/60', none: 'text-ink2' };
  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-[11.5px] font-semibold text-ink3 mb-1.5">{(compact ? ['M', 'T', 'W', 'T', 'F', 'S', 'S'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']).map((d, i) => <span key={i}>{d}</span>)}</div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: lead }).map((_, i) => <span key={'x' + i} />)}
        {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
          const c = cell ? cell(d) : {};
          return (
            <span key={d} title={c.title} className={cx('relative aspect-square rounded-xl grid place-items-center text-[13px] font-semibold tnum max-h-14', C[c.tone || 'none'], d === today && month === 9 && 'ring-2 ring-brand')}>
              {d}
              {c.dot && <span className={cx('absolute bottom-1.5 w-1.5 h-1.5 rounded-full', { brand: 'bg-brand', bad: 'bg-bad', warn: 'bg-warn', info: 'bg-info', ok: 'bg-ok' }[c.dot] || 'bg-brand')} />}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- File / document row ---------- */
export function FileRow({ name, meta, missing, onView, onAdd }) {
  return (
    <li className="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-sunken/60">
      <span className={cx('w-10 h-10 rounded-xl grid place-items-center shrink-0', missing ? 'bg-warn/12 text-warn' : 'bg-sunken text-ink2')}>{missing ? <I.FileWarning size={19} /> : <I.FileText size={19} />}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-[14px] truncate">{name}</p>
        <p className="text-[12.5px] text-ink3 truncate">{missing ? 'Not collected yet' : meta}</p>
      </div>
      {missing ? <Button size="sm" variant="secondary" icon={I.Upload} onClick={onAdd}>Add</Button> : <Button size="sm" variant="ghost" icon={I.Eye} onClick={onView}>View</Button>}
    </li>
  );
}

/* ---------- Two-column layout used across pages: main + side ---------- */
export function Split({ children, side = 340, className }) {
  return <div className={cx('grid gap-5 @lg:gap-6 items-start', side === 380 ? '@xl:grid-cols-[minmax(0,1fr)_380px]' : side === 300 ? '@xl:grid-cols-[minmax(0,1fr)_300px]' : '@xl:grid-cols-[minmax(0,1fr)_340px]', className)}>{children}</div>;
}
export function Col({ children, className }) {
  return <div className={cx('flex flex-col gap-5 @lg:gap-6 min-w-0', className)}>{children}</div>;
}

/* ---------- Phone frame, for apps that only live on a phone (driver app) ---------- */
export function PhoneFrame({ children, side }) {
  return (
    <div className="h-full overflow-y-auto scroll-thin bg-bg">
      <div className="@lg:py-8 @lg:px-6 flex flex-col @lg:flex-row @lg:items-start @lg:justify-center gap-8">
        {side && <aside className="hidden @lg:flex flex-col gap-4 max-w-[300px] pt-10">{side}</aside>}
        <div className="@lg:w-[400px] @lg:rounded-[40px] @lg:border-[10px] @lg:border-ink/90 @lg:shadow-pop @lg:overflow-hidden @lg:h-[820px] @lg:shrink-0 bg-bg">
          <div className="@lg:h-full @lg:overflow-y-auto scroll-thin">{children}</div>
        </div>
      </div>
    </div>
  );
}

// Small "Export" / "Print" helpers that every list has (P8, P9)
export function ExportButton({ what = 'list', className }) {
  const toast = useToast();
  return <Button variant="secondary" icon={I.Download} className={cx('hidden @md:inline-flex', className)} onClick={() => toast({ title: `Exported ${what}`, body: 'Excel file with the school name, filters and your name on top. Logged in the export log.' })}>Export</Button>;
}
