import React, { useEffect, useMemo, useRef, useState, createContext, useContext } from 'react';
import * as I from './icons.js';
import { NAV, SCHOOL, ME, STUDENTS, NOTIFICATIONS, APPROVALS, FEATURED } from './data.js';
import { cx, IconButton, Avatar, Kbd, Sheet, Button, Pill, useToast } from './ui.jsx';

export const NavCtx = createContext({ go: () => {}, screen: 'dashboard' });
export const useNav = () => useContext(NavCtx);
export const ThemeCtx = createContext({});
export const useTheme = () => useContext(ThemeCtx);

export const ICONS = I;

/* School mark: a rising sun over three lines (rows of a register) */
export function Logo({ size = 36 }) {
  return (
    <span className="grid place-items-center rounded-xl bg-brand text-brandink shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none">
        <path d="M5 14a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M12 3.5v2M4.6 6.6l1.4 1.4M19.4 6.6 18 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M3 17.5h18M6 21h12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    </span>
  );
}

const MAIN_IDS = ['dashboard', 'students', 'fees', 'attendance'];
const activeFor = (screen) => (screen === 'student' ? 'students' : screen === 'appearance' ? 'settings' : screen);

/* ---------- Sidebar (computer and tablet) ---------- */
export function Sidebar({ collapsed, onQuick }) {
  const { go, screen } = useNav();
  const active = activeFor(screen);
  return (
    <aside className={cx('hidden @md:flex flex-col shrink-0 h-full border-r border-line bg-surface transition-[width] duration-200',
      collapsed ? 'w-[76px]' : 'w-[76px] @lg:w-[268px]')}>
      <div className="h-16 flex items-center gap-3 px-[18px] shrink-0">
        <Logo />
        <div className={cx('min-w-0 hidden', !collapsed && '@lg:block')}>
          <p className="font-display font-semibold text-[15px] leading-tight truncate">{SCHOOL.name}</p>
          <p className="text-xs text-ink3 truncate">{SCHOOL.place}</p>
        </div>
      </div>
      <div className="px-3.5 pb-2 pt-1">
        <button onClick={onQuick}
          className={cx('w-full h-11 rounded-xl bg-brand text-brandink font-semibold text-sm inline-flex items-center justify-center gap-2 hover:brightness-110 shadow-sm transition')}
          title="Quick actions">
          <I.Plus size={19} strokeWidth={2.5} />
          <span className={cx('hidden', !collapsed && '@lg:inline')}>New</span>
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto scroll-thin px-3 pb-4" aria-label="Main menu">
        {NAV.map((g, gi) => (
          <div key={gi} className="pt-3">
            {g.group && (
              <p className={cx('eyebrow text-ink3 px-3 pb-1.5 hidden', !collapsed && '@lg:block')}>{g.group}</p>
            )}
            {g.group && <div className={cx('mx-3 mb-2 border-t border-line', !collapsed && '@lg:hidden')} />}
            <ul className="flex flex-col gap-0.5">
              {g.items.map((it) => {
                const Ic = I[it.icon];
                const on = active === it.id;
                return (
                  <li key={it.id}>
                    <button onClick={() => go(it.id)} title={it.label} aria-current={on ? 'page' : undefined}
                      className={cx('group w-full h-10 rounded-xl flex items-center gap-3 px-3 text-[14px] font-medium transition relative',
                        on ? 'bg-brand/10 text-brand font-semibold' : 'text-ink2 hover:bg-sunken hover:text-ink',
                        collapsed ? 'justify-center' : 'justify-center @lg:justify-start')}>
                      {on && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-brand -ml-3" />}
                      <Ic size={19} strokeWidth={on ? 2.3 : 2} className="shrink-0" />
                      <span className={cx('truncate hidden', !collapsed && '@lg:inline')}>{it.label}</span>
                      {it.count && (
                        <span className={cx('ml-auto text-[11px] font-bold tnum px-1.5 h-5 rounded-md bg-sunken text-ink2 items-center hidden', !collapsed && '@lg:inline-flex')}>{it.count}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className={cx('m-3 p-3.5 rounded-2xl bg-sunken hidden', !collapsed && '@lg:block')}>
        <p className="text-[13px] font-semibold flex items-center gap-2"><I.Sparkles size={15} className="text-brand" />Ask School OS</p>
        <p className="text-xs text-ink3 mt-1 leading-relaxed">Type what you want, like “fee Aarav” or “absent today”.</p>
      </div>
    </aside>
  );
}

/* ---------- Top bar ---------- */
export function TopBar({ onSearch, onNotif, onProfile, onApprovals, unread, title }) {
  const { go } = useNav();
  const { mode, setMode, resolved } = useTheme();
  return (
    <header className="h-16 shrink-0 flex items-center gap-2 px-3 @md:px-5 border-b border-line bg-surface/85 backdrop-blur-md z-20">
      {/* Phone: logo + title */}
      <button className="@md:hidden flex items-center gap-2.5 min-w-0 flex-1 text-left" onClick={() => go('dashboard')}>
        <Logo size={34} />
        <div className="min-w-0">
          <p className="font-display font-semibold text-[15px] leading-tight truncate">{title || SCHOOL.name}</p>
          <p className="text-[11.5px] text-ink3 truncate">{SCHOOL.name} · {SCHOOL.year}</p>
        </div>
      </button>
      {/* Computer: search */}
      <button onClick={onSearch}
        className="hidden @md:flex items-center gap-3 h-11 flex-1 max-w-xl rounded-xl bg-sunken border border-transparent hover:border-line px-3.5 text-ink3 text-[14.5px] transition">
        <I.Search size={18} />
        <span className="truncate">Search students, receipts, pages… or type what to do</span>
        <span className="ml-auto flex gap-1"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span>
      </button>
      <div className="flex-1 hidden @md:block" />
      <button className="hidden @lg:inline-flex items-center gap-2 h-9 px-3 rounded-xl border border-line text-[13px] font-semibold text-ink2 hover:bg-sunken" title="Academic year">
        <I.CalendarRange size={16} /> {SCHOOL.year}
      </button>
      <IconButton className="@md:hidden" icon={I.Search} label="Search" onClick={onSearch} />
      <IconButton className="hidden @md:inline-flex" icon={I.ListChecks} label="Approvals waiting" badge={APPROVALS.length} onClick={onApprovals} />
      <IconButton icon={I.Bell} label="Notifications" badge={unread || null} onClick={onNotif} />
      <IconButton className="hidden @md:inline-flex" icon={resolved === 'dark' ? I.Sun : I.Moon} label={resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        onClick={() => setMode(resolved === 'dark' ? 'light' : 'dark')} />
      <button onClick={onProfile} className="ml-1 flex items-center gap-2.5 rounded-xl hover:bg-sunken p-1 @lg:pr-3 transition" aria-label="Your profile and settings">
        <Avatar name={ME.name} size={34} />
        <span className="hidden @lg:block text-left">
          <span className="block text-[13.5px] font-semibold leading-tight">{ME.name}</span>
          <span className="block text-xs text-ink3">{ME.role}</span>
        </span>
      </button>
    </header>
  );
}

/* ---------- Bottom bar (phone) ---------- */
export function BottomNav({ onMore }) {
  const { go, screen } = useNav();
  const active = activeFor(screen);
  const items = [
    { id: 'dashboard', label: 'Home', icon: I.House },
    { id: 'students', label: 'Students', icon: I.GraduationCap },
    { id: 'fees', label: 'Collect', icon: I.IndianRupee, big: true },
    { id: 'attendance', label: 'Attendance', icon: I.CalendarCheck2 },
  ];
  const moreOn = !MAIN_IDS.includes(active);
  return (
    <nav className="@md:hidden shrink-0 border-t border-line bg-surface/95 backdrop-blur-md px-2 pt-1.5 z-20" style={{ paddingBottom: 'calc(6px + env(safe-area-inset-bottom, 0px))' }} aria-label="Main menu">
      <ul className="grid grid-cols-5">
        {items.map((it) => {
          const on = active === it.id;
          return (
            <li key={it.id} className="flex justify-center">
              <button onClick={() => go(it.id)} aria-current={on ? 'page' : undefined}
                className={cx('flex flex-col items-center gap-1 w-full py-1 text-[11px] font-semibold', on ? 'text-brand' : 'text-ink3')}>
                {it.big ? (
                  <span className={cx('w-12 h-9 -mt-0.5 rounded-2xl grid place-items-center transition', on ? 'bg-brand text-brandink' : 'bg-brand/12 text-brand')}>
                    <it.icon size={20} strokeWidth={2.4} />
                  </span>
                ) : (
                  <span className={cx('w-14 h-8 rounded-full grid place-items-center transition', on && 'bg-brand/12')}>
                    <it.icon size={21} strokeWidth={on ? 2.4 : 2} />
                  </span>
                )}
                {it.label}
              </button>
            </li>
          );
        })}
        <li className="flex justify-center">
          <button onClick={onMore} className={cx('flex flex-col items-center gap-1 w-full py-1 text-[11px] font-semibold', moreOn ? 'text-brand' : 'text-ink3')}>
            <span className={cx('w-14 h-8 rounded-full grid place-items-center', moreOn && 'bg-brand/12')}><I.LayoutGrid size={21} /></span>
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}

/* ---------- "More" on phone: every module as a big tile ---------- */
export function MoreSheet({ open, onClose }) {
  const { go } = useNav();
  return (
    <Sheet open={open} onClose={onClose} title="All modules" sub="Tap any module to open it">
      <div className="flex flex-col gap-5">
        {NAV.filter((g) => g.group).map((g) => (
          <div key={g.group}>
            <p className="eyebrow text-ink3 mb-2">{g.group}</p>
            <div className="grid grid-cols-3 gap-2">
              {g.items.map((it) => {
                const Ic = I[it.icon];
                return (
                  <button key={it.id} onClick={() => { onClose(); go(it.id); }}
                    className="flex flex-col items-center gap-2 rounded-2xl bg-sunken hover:bg-line/60 px-2 py-3.5 text-center">
                    <span className="w-10 h-10 rounded-xl bg-surface text-brand grid place-items-center shadow-card"><Ic size={20} /></span>
                    <span className="text-[12px] font-semibold leading-tight">{it.label.replace(' Management', '')}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

/* ---------- Quick actions ("New") ---------- */
export const QUICK = [
  { id: 'fees', label: 'Collect fee', sub: 'Find a student and take payment', icon: I.IndianRupee },
  { id: 'attendance', label: 'Take attendance', sub: 'Class 7 B is waiting for today', icon: I.CalendarCheck2 },
  { id: 'add-student', label: 'Add student', sub: 'Name, class and parent phone is enough', icon: I.UserPlus },
  { id: 'communication', label: 'Send message', sub: 'WhatsApp, SMS or notice to parents', icon: I.Send },
  { id: 'admissions', label: 'Add enquiry', sub: 'A parent asked about admission', icon: I.PhoneIncoming },
  { id: 'finance', label: 'Record expense', sub: 'Bills, purchases, petty cash', icon: I.ReceiptText },
];
export function QuickSheet({ open, onClose, onAddStudent }) {
  const { go } = useNav();
  return (
    <Sheet open={open} onClose={onClose} title="What do you want to do?">
      <div className="grid @sm:grid-cols-2 gap-2">
        {QUICK.map((q) => (
          <button key={q.id} onClick={() => { onClose(); q.id === 'add-student' ? onAddStudent() : go(q.id); }}
            className="flex items-center gap-3 text-left p-3 rounded-2xl border border-line hover:border-brand/40 hover:bg-brand/5 transition">
            <span className="w-11 h-11 rounded-xl bg-brand/10 text-brand grid place-items-center shrink-0"><q.icon size={21} /></span>
            <span className="min-w-0">
              <span className="block font-semibold text-[14.5px]">{q.label}</span>
              <span className="block text-[12.5px] text-ink3">{q.sub}</span>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/* ---------- Search / Ask / Do ---------- */
export function CommandPalette({ open, onClose, onAddStudent }) {
  const { go } = useNav();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inp = useRef(null);
  useEffect(() => { if (open) { setQ(''); setSel(0); setTimeout(() => inp.current?.focus(), 40); } }, [open]);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    const out = [];
    const feeMatch = t.match(/^(fee|fees|collect)\s+(.+)/);
    if (feeMatch) {
      STUDENTS.filter((s) => s.name.toLowerCase().includes(feeMatch[2])).slice(0, 3).forEach((s) =>
        out.push({ sec: 'Do this', icon: I.IndianRupee, label: `Collect fee from ${s.name}`, sub: `${s.cls} ${s.sec} · ${s.due ? '₹' + s.due.toLocaleString('en-IN') + ' due' : 'No dues'}`, run: () => go('fees', { student: s.id }) }));
    }
    if (t.includes('absent')) out.push({ sec: 'Do this', icon: I.UserX, label: 'Show students absent today', sub: '52 students · Attendance register', run: () => go('attendance') });
    if (!t) {
      QUICK.slice(0, 4).forEach((x) => out.push({ sec: 'Quick actions', icon: x.icon, label: x.label, sub: x.sub, run: () => (x.id === 'add-student' ? onAddStudent() : go(x.id)) }));
      out.push({ sec: 'Recent', icon: I.User, label: FEATURED.name, sub: `Class 7 B · Roll ${FEATURED.roll} · ${FEATURED.adm}`, run: () => go('student', { id: FEATURED.id }) });
      out.push({ sec: 'Try asking', icon: I.Sparkles, label: 'fee Aarav', sub: 'Jumps straight to collecting a fee', fill: 'fee Aarav' });
      out.push({ sec: 'Try asking', icon: I.Sparkles, label: 'absent today', sub: 'Lists who is absent right now', fill: 'absent today' });
      return out;
    }
    if (!feeMatch) {
      STUDENTS.filter((s) => s.name.toLowerCase().includes(t) || s.adm.toLowerCase().includes(t) || s.phone.replace(' ', '').includes(t.replace(' ', '')))
        .slice(0, 5).forEach((s) => out.push({ sec: 'Students', icon: I.User, avatar: s.name, label: s.name, sub: `${s.cls} ${s.sec} · Roll ${s.roll} · ${s.adm}`, run: () => go('student', { id: s.id }) }));
    }
    NAV.flatMap((g) => g.items).filter((it) => it.label.toLowerCase().includes(t)).slice(0, 4)
      .forEach((it) => out.push({ sec: 'Pages', icon: I[it.icon], label: it.label, sub: 'Open', run: () => go(it.id) }));
    return out;
  }, [q]);

  useEffect(() => setSel(0), [q]);
  const choose = (r) => { if (r.fill) { setQ(r.fill); inp.current?.focus(); return; } onClose(); r.run(); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    if (e.key === 'Enter' && results[sel]) choose(results[sel]);
    if (e.key === 'Escape') onClose();
  };
  if (!open) return null;
  let lastSec = null;
  return (
    <div className="absolute inset-0 z-50 flex justify-center items-start @md:pt-[10vh]">
      <div className="absolute inset-0 bg-[rgb(var(--shadow)/.45)] backdrop-blur-[2px] animate-fade" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Search"
        className="relative w-full h-full @md:h-auto @md:max-w-2xl bg-surface @md:rounded-2xl shadow-pop animate-rise flex flex-col @md:max-h-[70vh] @md:mx-6">
        <div className="flex items-center gap-3 px-4 h-16 border-b border-line shrink-0">
          <I.Search size={20} className="text-ink3" />
          <input ref={inp} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} id="cmdk"
            placeholder="Search or type what to do, like “fee Aarav”"
            className="flex-1 bg-transparent outline-none text-[16px] placeholder:text-ink3 min-w-0" />
          <button onClick={onClose} className="text-sm font-semibold text-ink2 px-2 h-8 rounded-lg hover:bg-sunken">
            <span className="@md:hidden">Cancel</span><span className="hidden @md:inline"><Kbd>Esc</Kbd></span>
          </button>
        </div>
        <div className="overflow-y-auto scroll-thin p-2 flex-1">
          {results.length === 0 && (
            <div className="text-center py-12 px-6">
              <p className="font-semibold">Nothing found for “{q}”</p>
              <p className="text-sm text-ink3 mt-1">Check the spelling, or search by admission number or parent phone.</p>
            </div>
          )}
          {results.map((r, i) => {
            const head = r.sec !== lastSec ? (lastSec = r.sec) : null;
            return (
              <React.Fragment key={i}>
                {head && <p className="eyebrow text-ink3 px-3 pt-3 pb-1.5">{head}</p>}
                <button onMouseEnter={() => setSel(i)} onClick={() => choose(r)}
                  className={cx('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left', sel === i && 'bg-brand/8 bg-sunken')}>
                  {r.avatar ? <Avatar name={r.avatar} size={34} /> : (
                    <span className={cx('w-[34px] h-[34px] rounded-lg grid place-items-center shrink-0', sel === i ? 'bg-brand text-brandink' : 'bg-sunken text-ink2')}><r.icon size={17} /></span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-semibold truncate">{r.label}</span>
                    <span className="block text-[12.5px] text-ink3 truncate">{r.sub}</span>
                  </span>
                  {sel === i && <I.CornerDownLeft size={16} className="text-ink3 hidden @md:block" />}
                </button>
              </React.Fragment>
            );
          })}
        </div>
        <div className="hidden @md:flex items-center gap-4 px-4 h-11 border-t border-line text-xs text-ink3 shrink-0">
          <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
          <span className="flex items-center gap-1.5"><Kbd>Enter</Kbd> open</span>
          <span className="ml-auto">Only shows what your role is allowed to see</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- Notifications ---------- */
export function NotifPanel({ open, onClose, items, setItems }) {
  const { go } = useNav();
  if (!open) return null;
  const unread = items.filter((n) => n.unread).length;
  return (
    <div className="absolute inset-0 z-50">
      <div className="absolute inset-0 bg-[rgb(var(--shadow)/.35)] @md:bg-transparent animate-fade" onClick={onClose} />
      <div role="dialog" aria-label="Notifications"
        className="absolute inset-x-0 bottom-0 @md:bottom-auto @md:left-auto @md:right-4 @md:top-[68px] @md:w-[400px] bg-surface rounded-t-3xl @md:rounded-2xl shadow-pop border border-line animate-sheet max-h-[85%] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div>
            <h2 className="font-display font-semibold text-lg">Notifications</h2>
            <p className="text-[13px] text-ink3">{unread ? `${unread} new` : 'You are all caught up'}</p>
          </div>
          {unread > 0 && <Button size="sm" variant="ghost" icon={I.CheckCheck} onClick={() => setItems(items.map((n) => ({ ...n, unread: false })))}>Mark all read</Button>}
        </div>
        <ul className="overflow-y-auto scroll-thin px-2 pb-3">
          {items.map((n) => (
            <li key={n.id}>
              <button onClick={() => { setItems(items.map((x) => (x.id === n.id ? { ...x, unread: false } : x))); onClose(); go(n.to); }}
                className="w-full text-left flex gap-3 px-3 py-3 rounded-xl hover:bg-sunken">
                <span className={cx('mt-1.5 w-2 h-2 rounded-full shrink-0', n.unread ? 'bg-brand' : 'bg-transparent')} />
                <span className="min-w-0 flex-1">
                  <span className={cx('block text-[14px] leading-snug', n.unread ? 'font-semibold' : 'text-ink2')}>{n.title}</span>
                  <span className="block text-[12.5px] text-ink3 mt-0.5">{n.body}</span>
                </span>
                <span className="text-[11.5px] text-ink3 whitespace-nowrap">{n.when}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ---------- Profile menu ---------- */
export function ProfileMenu({ open, onClose }) {
  const { go } = useNav();
  const { mode, setMode } = useTheme();
  if (!open) return null;
  const row = 'w-full flex items-center gap-3 px-3 h-11 rounded-xl hover:bg-sunken text-[14px] font-medium text-left';
  return (
    <div className="absolute inset-0 z-50">
      <div className="absolute inset-0 bg-[rgb(var(--shadow)/.35)] @md:bg-transparent animate-fade" onClick={onClose} />
      <div role="menu" className="absolute inset-x-0 bottom-0 @md:bottom-auto @md:left-auto @md:right-4 @md:top-[68px] @md:w-[320px] bg-surface rounded-t-3xl @md:rounded-2xl shadow-pop border border-line animate-sheet p-2">
        <div className="flex items-center gap-3 p-3">
          <Avatar name={ME.name} size={44} />
          <div className="min-w-0">
            <p className="font-semibold truncate">{ME.name}</p>
            <p className="text-[13px] text-ink3 truncate">{ME.role} · {SCHOOL.name}</p>
          </div>
        </div>
        <div className="px-3 py-2">
          <p className="eyebrow text-ink3 mb-2">Mode</p>
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-sunken">
            {[['light', 'Light', I.Sun], ['dark', 'Dark', I.Moon], ['system', 'Auto', I.MonitorSmartphone]].map(([v, l, Ic]) => (
              <button key={v} onClick={() => setMode(v)} className={cx('h-9 rounded-lg text-[13px] font-semibold inline-flex items-center justify-center gap-1.5', mode === v ? 'bg-surface shadow-card text-ink' : 'text-ink2')}>
                <Ic size={15} />{l}
              </button>
            ))}
          </div>
        </div>
        <div className="border-t border-line my-1" />
        <button className={row} onClick={() => { onClose(); go('appearance'); }}><I.Palette size={18} className="text-ink3" />Colours and text size</button>
        <button className={row} onClick={() => { onClose(); go('settings'); }}><I.UserCog size={18} className="text-ink3" />My profile and password</button>
        <button className={row} onClick={() => { onClose(); go('parent'); }}><I.Smartphone size={18} className="text-ink3" />See what parents see</button>
        <div className="border-t border-line my-1" />
        <button className={cx(row, 'text-bad')} onClick={() => { onClose(); go('signin'); }}><I.LogOut size={18} />Sign out</button>
      </div>
    </div>
  );
}
