import React, { useEffect, useRef, useState, createContext, useContext, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, AlertTriangle, Info, CircleCheck, CircleAlert } from 'lucide-react';

export const cx = (...a) => a.filter(Boolean).join(' ');

// Overlays render into a layer inside the app frame, so they work the same in the phone preview
export const LayerCtx = createContext(null);

/* ---------- Buttons ---------- */
const BTN = {
  primary: 'bg-brand text-brandink hover:brightness-110 active:brightness-95 shadow-sm',
  secondary: 'bg-surface text-ink border border-line hover:bg-sunken active:bg-line/60',
  soft: 'bg-brand/10 text-brand hover:bg-brand/15 active:bg-brand/20',
  ghost: 'text-ink2 hover:bg-sunken hover:text-ink active:bg-line/60',
  danger: 'bg-bad text-white hover:brightness-110',
  dangerSoft: 'bg-bad/10 text-bad hover:bg-bad/15',
};
const SIZE = { sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-lg', md: 'h-10 px-4 text-sm gap-2 rounded-xl', lg: 'h-12 px-5 text-[15px] gap-2 rounded-xl' };

export function Button({ variant = 'secondary', size = 'md', icon: Icon, iconRight: IconR, loading, className, children, ...p }) {
  return (
    <button
      {...p}
      disabled={p.disabled || loading}
      className={cx('inline-flex items-center justify-center font-semibold whitespace-nowrap transition select-none disabled:opacity-50 disabled:pointer-events-none', BTN[variant], SIZE[size], className)}
    >
      {loading ? <Spinner /> : Icon && <Icon size={size === 'sm' ? 15 : 17} strokeWidth={2.2} />}
      {children}
      {IconR && <IconR size={16} strokeWidth={2.2} />}
    </button>
  );
}

export function IconButton({ icon: Icon, label, badge, className, size = 40, ...p }) {
  return (
    <button {...p} aria-label={label} title={label}
      className={cx('relative inline-flex items-center justify-center rounded-xl text-ink2 hover:bg-sunken hover:text-ink transition shrink-0', className)}
      style={{ width: size, height: size }}>
      <Icon size={19} strokeWidth={2} />
      {badge ? (
        <span className="absolute top-1 right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-bad text-white text-[10px] font-bold grid place-items-center ring-2 ring-surface tnum">{badge}</span>
      ) : null}
    </button>
  );
}

export const Spinner = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin" aria-hidden="true">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
    <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

/* ---------- Badges and pills ---------- */
const TONE = {
  ok: 'bg-ok/10 text-ok', warn: 'bg-warn/12 text-warn', bad: 'bg-bad/10 text-bad', info: 'bg-info/10 text-info',
  brand: 'bg-brand/10 text-brand', neutral: 'bg-sunken text-ink2',
};
export function Pill({ tone = 'neutral', dot, children, className }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-xs font-semibold whitespace-nowrap', TONE[tone], className)}>
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
export const feeTone = (s) => ({ Paid: 'ok', Due: 'warn', Overdue: 'bad', 'Not due': 'neutral' }[s] || 'neutral');

/* ---------- Avatar ---------- */
const HUES = [168, 200, 220, 260, 290, 330, 15, 35, 140, 190];
export function Avatar({ name, size = 36, className, ring }) {
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = HUES[h % HUES.length];
  return (
    <span
      className={cx('inline-grid place-items-center rounded-full font-bold shrink-0 select-none', ring && 'ring-2 ring-surface', className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hue} 70% 50% / .16)`, color: `hsl(${hue} 60% var(--av-l))` }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

/* ---------- Card ---------- */
export function Card({ className, children, as: As = 'section', ...p }) {
  return <As {...p} className={cx('bg-surface rounded-2xl border border-line/70 shadow-card', className)}>{children}</As>;
}
export function CardHead({ title, sub, action, icon: Icon }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
      <div className="min-w-0 flex items-center gap-2.5">
        {Icon && <span className="w-8 h-8 rounded-lg bg-brand/10 text-brand grid place-items-center shrink-0"><Icon size={17} /></span>}
        <div className="min-w-0">
          <h3 className="font-semibold text-[15px] leading-tight">{title}</h3>
          {sub && <p className="text-[13px] text-ink3 mt-0.5">{sub}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/* ---------- Form controls ---------- */
export function Field({ label, hint, error, required, children, id, className }) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={id} className="text-[13px] font-semibold text-ink2">
          {label}{required && <span className="text-bad"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-[12.5px] text-bad flex items-center gap-1.5" role="alert"><CircleAlert size={14} />{error}</p>
      ) : hint ? <p className="text-[12.5px] text-ink3">{hint}</p> : null}
    </div>
  );
}
export const inputCls = (err) => cx(
  'h-11 w-full rounded-xl bg-surface border px-3.5 text-[15px] text-ink placeholder:text-ink3 outline-none transition',
  err ? 'border-bad ring-4 ring-bad/10' : 'border-line hover:border-ink3/50 focus:border-brand focus:ring-4 focus:ring-brand/15'
);
export const Input = React.forwardRef(function Input({ error, className, ...p }, ref) {
  return <input ref={ref} {...p} className={cx(inputCls(error), className)} />;
});

export function Checkbox({ checked, onChange, label, id, indeterminate }) {
  return (
    <button type="button" role="checkbox" aria-checked={indeterminate ? 'mixed' : checked} aria-label={label} id={id}
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      className={cx('w-5 h-5 rounded-md border-2 grid place-items-center transition shrink-0',
        checked || indeterminate ? 'bg-brand border-brand text-brandink' : 'border-line bg-surface hover:border-ink3')}>
      {indeterminate ? <span className="w-2.5 h-0.5 bg-current rounded" /> : checked && <Check size={13} strokeWidth={3.5} />}
    </button>
  );
}

export function Switch({ on, onChange, label, id }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} id={id} onClick={() => onChange(!on)}
      className={cx('relative w-11 h-6 rounded-full transition shrink-0', on ? 'bg-brand' : 'bg-line')}>
      <span className={cx('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform', on && 'translate-x-5')} />
    </button>
  );
}

export function Segmented({ value, onChange, options, className, size = 'md' }) {
  return (
    <div role="radiogroup" className={cx('inline-flex p-1 rounded-xl bg-sunken gap-1', className)}>
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value;
        const l = typeof o === 'string' ? o : o.label;
        const Ic = o.icon;
        const on = v === value;
        return (
          <button key={v} type="button" role="radio" aria-checked={on} onClick={() => onChange(v)}
            className={cx('inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition whitespace-nowrap flex-1',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3.5 text-[13px]',
              on ? 'bg-surface text-ink shadow-card' : 'text-ink2 hover:text-ink')}>
            {Ic && <Ic size={15} />}{l}
          </button>
        );
      })}
    </div>
  );
}

export function Tabs({ value, onChange, tabs, className }) {
  return (
    <div role="tablist" className={cx('flex gap-1 overflow-x-auto no-scrollbar border-b border-line', className)}>
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cx('relative h-11 px-3.5 text-sm font-semibold whitespace-nowrap transition shrink-0',
            value === t.id ? 'text-brand' : 'text-ink2 hover:text-ink')}>
          {t.label}
          {t.count != null && <span className="ml-1.5 text-xs text-ink3 tnum">{t.count}</span>}
          {value === t.id && <span className="absolute left-2 right-2 -bottom-px h-[3px] rounded-t bg-brand" />}
        </button>
      ))}
    </div>
  );
}

/* ---------- Charts ---------- */
export function Ring({ value, size = 64, stroke = 7, children, tone = 'brand', track = 'line' }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} style={{ stroke: `rgb(var(--${track}))` }} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)}
          style={{ stroke: `rgb(var(--${tone}))`, transition: 'stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

/* ---------- Empty and loading ---------- */
export function Empty({ icon: Icon, title, body, action }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-14 gap-3">
      <span className="w-14 h-14 rounded-2xl bg-sunken text-ink3 grid place-items-center"><Icon size={26} /></span>
      <h3 className="font-semibold text-[15px]">{title}</h3>
      {body && <p className="text-sm text-ink3 max-w-sm">{body}</p>}
      {action}
    </div>
  );
}
export const Skel = ({ className }) => <div className={cx('skeleton', className)} />;

/* ---------- Overlays: dialog on computer, bottom sheet on phone ---------- */
export function Sheet(props) {
  const layer = useContext(LayerCtx);
  if (!props.open) return null;
  const el = <SheetInner {...props} />;
  return layer ? createPortal(el, layer) : el;
}
function SheetInner({ open, onClose, title, sub, children, footer, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    setTimeout(() => ref.current?.focus(), 30);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-50 flex items-end @md:items-center justify-center @md:p-6">
      <div className="absolute inset-0 bg-[rgb(var(--shadow)/.45)] backdrop-blur-[2px] animate-fade" onClick={onClose} />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        className={cx('relative bg-surface w-full max-h-[92%] flex flex-col rounded-t-3xl @md:rounded-2xl shadow-pop animate-sheet outline-none',
          wide ? '@md:max-w-2xl' : '@md:max-w-md')}>
        <div className="@md:hidden mx-auto mt-2.5 w-10 h-1.5 rounded-full bg-line" />
        {title && (
          <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
            <div>
              <h2 className="font-display font-semibold text-lg leading-tight">{title}</h2>
              {sub && <p className="text-sm text-ink3 mt-1">{sub}</p>}
            </div>
            <IconButton icon={X} label="Close" onClick={onClose} size={36} />
          </div>
        )}
        <div className="overflow-y-auto scroll-thin px-5 pb-5">{children}</div>
        {footer && <div className="border-t border-line px-5 py-3.5 flex gap-2 justify-end">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Toasts ---------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastHost({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((t) => {
    const id = Math.random();
    setItems((x) => [...x, { id, tone: 'ok', ...t }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), t.ms || 3800);
  }, []);
  const Ico = { ok: CircleCheck, bad: AlertTriangle, info: Info, warn: AlertTriangle };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="absolute z-[60] left-0 right-0 bottom-20 @lg:bottom-6 flex flex-col items-center gap-2 pointer-events-none px-4" aria-live="polite">
        {items.map((t) => {
          const I = Ico[t.tone];
          return (
            <div key={t.id} className="pointer-events-auto animate-rise flex items-center gap-3 max-w-md w-full @md:w-auto bg-ink text-bg rounded-2xl pl-4 pr-2 py-2.5 shadow-pop">
              <I size={19} className={cx('shrink-0', t.tone === 'ok' ? 'text-ok' : t.tone === 'bad' ? 'text-bad' : 'text-info')} style={{ filter: 'brightness(1.4)' }} />
              <div className="text-sm min-w-0 flex-1">
                <p className="font-semibold">{t.title}</p>
                {t.body && <p className="opacity-75 text-[13px]">{t.body}</p>}
              </div>
              {t.undo && (
                <button onClick={() => { t.undo(); setItems((x) => x.filter((i) => i.id !== t.id)); }}
                  className="text-sm font-bold px-3 h-8 rounded-lg hover:bg-bg/10">Undo</button>
              )}
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export function Kbd({ children }) {
  return <kbd className="inline-grid place-items-center min-w-[22px] h-[22px] px-1.5 rounded-md border border-line bg-surface text-[11px] font-semibold text-ink3 font-sans">{children}</kbd>;
}

/* ---------- Page header ---------- */
export function PageHead({ title, sub, actions, crumbs }) {
  return (
    <div className="flex flex-col gap-3 @md:flex-row @md:items-end @md:justify-between mb-5">
      <div className="min-w-0">
        {crumbs && <div className="text-[13px] text-ink3 mb-1 flex items-center gap-1.5 flex-wrap">{crumbs}</div>}
        <h1 className="font-display text-[26px] @md:text-[30px] font-semibold tracking-tight leading-tight">{title}</h1>
        {sub && <p className="text-ink3 text-[15px] mt-1">{sub}</p>}
      </div>
      {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
