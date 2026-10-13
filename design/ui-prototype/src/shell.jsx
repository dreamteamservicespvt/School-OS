import React, { useEffect, useMemo, useRef, useState, createContext, useContext } from 'react';
import * as I from './icons.js';
import { NAV, SCHOOL, ME, STUDENTS, NOTIFICATIONS, APPROVALS, FEATURED } from './data.js';
import { inMenu, MODULES, BOTTOM, QUICK_BY_ROLE, APPROVALS_BY_ROLE, SCHOOLS_IN_GROUP, pagesFor, pageAccess } from './config.js';
import { cx, IconButton, Avatar, Kbd, Sheet, Button, Pill, useToast } from './ui.jsx';
import { studentScope } from './students.jsx';
import { STAFF } from './sample.js';

export const NavCtx = createContext({ go: () => {}, screen: 'dashboard' });
export const useNav = () => useContext(NavCtx);
export const ThemeCtx = createContext({});
export const useTheme = () => useContext(ThemeCtx);

export const ICONS = I;

// Who is signed in, which modules are switched on, which academic year is open
export const RoleCtx = createContext({ role: { id: 'principal', access: {} }, access: () => 'full', modulesOn: {}, year: { label: '2026–27' } });
export const useRole = () => useContext(RoleCtx);
// The menu for this person: only modules their roles allow and the school has switched on
export function useMenu() {
  const { role, modulesOn } = useRole();
  return NAV.map((g) => ({ ...g, items: g.items.filter((it) => inMenu(role, it.id) && modulesOn[it.id] !== false) })).filter((g) => g.items.length);
}
// Money requests go to whoever decides on that page, not someone who only views it; nobody decides their own office's request
const MONEY_PAGE = { Concession: ['fees', 'concessions'], Expense: ['finance', 'expenses'] };
export function approvalsFor(role) {
  if (role.id !== 'principal' && role.id !== 'schooladmin') return APPROVALS_BY_ROLE[role.id] || [];
  return APPROVALS.filter((a) => {
    if (role.id === 'schooladmin' && a.who === 'Office') return false;
    const mp = MONEY_PAGE[a.kind];
    return !mp || (canOpen(role, mp.join('.')) && pageAccess(role.id, mp[0], mp[1], role.access[mp[0]]) !== 'view');
  });
}
// 'fees.defaulters' -> go('fees', { page: 'defaulters' })
export const goTo = (go, id, extra = {}) => { const [m, p] = id.split('.'); go(m, p ? { page: p, ...extra } : extra); };

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
const activeFor = (screen) => (screen === 'student' ? 'students' : screen === 'appearance' || screen === 'profile' ? null : screen);

/* ---------- Sidebar (computer and tablet) ---------- */
export function Sidebar({ collapsed, onQuick, onSwitch }) {
  const { go, screen } = useNav();
  const { role } = useRole();
  const menu = useMenu();
  const active = activeFor(screen);
  return (
    <aside className={cx('hidden @md:flex flex-col shrink-0 h-full border-r border-line bg-surface transition-[width] duration-200',
      collapsed ? 'w-[76px]' : 'w-[76px] @lg:w-[268px]')}>
      <button onClick={role.multiSchool ? onSwitch : undefined} title={role.multiSchool ? 'Switch school or campus' : SCHOOL.name}
        className={cx('h-16 flex items-center gap-3 px-[18px] shrink-0 text-left', !role.multiSchool && 'cursor-default')}>
        <Logo />
        <div className={cx('min-w-0 hidden', !collapsed && '@lg:block')}>
          <p className="font-display font-semibold text-[15px] leading-tight truncate">{SCHOOL.name}</p>
          <p className="text-xs text-ink3 truncate">{SCHOOL.place}</p>
        </div>
      </button>
      <div className={cx('px-3.5 pb-2 pt-1', !quickFor(role).length && 'hidden')}>
        <button onClick={onQuick}
          className={cx('w-full h-11 rounded-xl bg-brand text-brandink font-semibold text-sm inline-flex items-center justify-center gap-2 hover:brightness-110 shadow-sm transition')}
          title="Quick actions">
          <I.Plus size={19} strokeWidth={2.5} />
          <span className={cx('hidden', !collapsed && '@lg:inline')}>New</span>
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto scroll-thin px-3 pb-4" aria-label="Main menu">
        {menu.map((g, gi) => (
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
                      {it.count && role.access[it.id] === 'full' && (
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
export function TopBar({ onSearch, onNotif, onProfile, onApprovals, unread, title, onYear }) {
  const { go } = useNav();
  const { mode, setMode, resolved } = useTheme();
  const { role, year } = useRole();
  const ME = role.person;
  const appr = approvalsFor(role);
  const home = role.access.dashboard ? 'dashboard' : 'homework';
  return (
    <header className="h-16 shrink-0 flex items-center gap-2 px-3 @md:px-5 border-b border-line bg-surface/85 backdrop-blur-md z-20">
      {/* Phone: logo + title */}
      <button className="@md:hidden flex items-center gap-2.5 min-w-0 flex-1 text-left" onClick={() => go(home)}>
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
      <button onClick={onYear} className={cx('hidden @lg:inline-flex items-center gap-2 h-9 px-3 rounded-xl border text-[13px] font-semibold hover:bg-sunken', year.closed ? 'border-warn/50 text-warn' : 'border-line text-ink2')} title="Academic year">
        <I.CalendarRange size={16} /> {year.label}
      </button>
      <IconButton className="@md:hidden" icon={I.Search} label="Search" onClick={onSearch} />
      {appr.length > 0 && <IconButton className="hidden @md:inline-flex" icon={I.ListChecks} label="Approvals waiting" badge={appr.length} onClick={onApprovals} />}
      {role.access.communication && <IconButton className="hidden @md:inline-flex" icon={I.MessageCircle} label="Messages" badge={role.id === 'student' ? null : 2} onClick={() => go('communication', { page: 'inbox' })} />}
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
  const { go, screen, params } = useNav();
  const { role } = useRole();
  const active = activeFor(screen);
  const items = (BOTTOM[role.id] || BOTTOM.principal).filter(([id]) => canOpen(role, id)).map(([id, label, icon, big]) => ({ id, label, icon: I[icon] || I.Circle, big: !!big }));
  const isOn = (id) => { const [m, p] = id.split('.'); return m === active && (!p || p === params?.page); };
  const moreOn = !items.some((it) => isOn(it.id));
  return (
    <nav className="@md:hidden shrink-0 border-t border-line bg-surface/95 backdrop-blur-md px-2 pt-1.5 z-20" style={{ paddingBottom: 'calc(6px + env(safe-area-inset-bottom, 0px))' }} aria-label="Main menu">
      <ul className="grid grid-cols-5">
        {items.map((it) => {
          const on = isOn(it.id);
          return (
            <li key={it.id} className="flex justify-center">
              <button onClick={() => goTo(go, it.id)} aria-current={on ? 'page' : undefined}
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
  const menu = useMenu();
  return (
    <Sheet open={open} onClose={onClose} title="All modules" sub="Tap any module to open it">
      <div className="flex flex-col gap-5">
        {menu.filter((g) => g.group).map((g) => (
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
// Can this person open 'module.page' (or a special screen)? Checks their role, the page list for it and modules switched off.
export function canOpen(role, to, modulesOn = {}) {
  if (!to) return false;
  if (to === 'add-student') return role.access.students === 'full' && pageAccess(role.id, 'students', 'list', 'full') === 'full';
  const [m, p] = to.split('.');
  if (m === 'approvals') return approvalsFor(role).length > 0;
  if (['profile', 'appearance'].includes(m)) return true;
  if (m === 'setup') return role.id === 'principal' || role.id === 'schooladmin';
  if (m === 'student') return !!role.access.students && role.id !== 'counsellor';
  if (m === 'dashboard') return !!role.access.dashboard;
  if (modulesOn[m] === false) return false;
  const acc = role.access[m];
  if (!acc) return false;
  const pages = pagesFor(m, acc, role.id);
  return p ? pages.some((x) => x.id === p) : pages.length > 0;
}
// Can this person DO the work on 'module.page' (not just look at it)? The Principal can open the register but not take attendance.
export const canDo = (role, to, modulesOn) => canOpen(role, to, modulesOn) && (to.includes('.') ? pageAccess(role.id, to.split('.')[0], to.split('.')[1], role.access[to.split('.')[0]]) === 'full' : true);
// Quick actions ("New") for this person: only things their role can do
export function quickFor(role, modulesOn) {
  const list = (QUICK_BY_ROLE[role.id] || []).map(([id, label, sub, icon]) => ({ id, label, sub, icon: I[icon] || I.Circle }));
  return list.filter((q) => canOpen(role, q.id, modulesOn));
}
export function QuickSheet({ open, onClose, onAddStudent }) {
  const { go } = useNav();
  const { role, modulesOn } = useRole();
  return (
    <Sheet open={open} onClose={onClose} title="What do you want to do?">
      <div className="grid @sm:grid-cols-2 gap-2">
        {quickFor(role, modulesOn).map((q) => (
          <button key={q.id + q.label} onClick={() => { onClose(); q.id === 'add-student' ? onAddStudent() : goTo(go, q.id); }}
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
  const { role, modulesOn } = useRole();
  const menu = useMenu();
  // Students this person may find: Student Management roles, teachers only their own classes, the warden only boarders.
  // The Counsellor finds cases inside Behaviour & Counselling, not through search.
  const pool = useMemo(() => (role.access.students && role.id !== 'counsellor' ? studentScope(role.id).list : []), [role]);
  const canStudents = pool.length > 0;
  const canFees = canOpen(role, 'fees.collect', modulesOn);
  // Staff search: HR, Principal, School Admin and Vice Principal; the Librarian too, for issuing books (name and department only)
  const staffTo = role.access.staff === 'full' || role.access.staff === 'view' ? 'staff.list' : role.id === 'librarian' && modulesOn.library !== false ? 'library.issue' : null;
  // Student attendance only (HR has staff attendance, Office Staff only student leave)
  const register = canOpen(role, 'attendance.register', modulesOn) || canOpen(role, 'attendance.take', modulesOn);
  const attTo = canOpen(role, 'attendance.register', modulesOn) ? 'register' : 'take';
  const own = role.access.attendance === 'own';
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inp = useRef(null);
  useEffect(() => { if (open) { setQ(''); setSel(0); setTimeout(() => inp.current?.focus(), 40); } }, [open]);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    const out = [];
    const feeMatch = canFees && t.match(/^(fee|fees|collect)\s+(.+)/);
    if (feeMatch) {
      pool.filter((s) => s.name.toLowerCase().includes(feeMatch[2])).slice(0, 3).forEach((s) =>
        out.push({ sec: 'Do this', icon: I.IndianRupee, label: `Collect fee from ${s.name}`, sub: `${s.cls} ${s.sec} · ${s.due ? '₹' + s.due.toLocaleString('en-IN') + ' due' : 'No dues'}`, run: () => go('fees', { student: s.id }) }));
    }
    if (t.includes('absent') && register) out.push({ sec: 'Do this', icon: I.UserX, label: own ? 'Show absent students in your classes' : 'Show students absent today', sub: own ? 'Your classes only · Attendance register' : '52 students · Attendance register', run: () => go('attendance', { page: attTo }) });
    // Personal pages under My profile, and Approvals for people who decide requests
    const mine = [
      ['profile', 'My profile and password', 'Details, password, devices, alerts', I.UserCog, true],
      ['staff.leave', 'My leave', 'Apply and see your leave', I.CalendarDays, role.access.staff === 'own'],
      ['staff.documents', 'My documents', 'ID card, joining letter, certificates', I.FileText, role.access.staff === 'own'],
      ['salary.slips', 'My salary slips', 'Download your slips', I.Wallet, role.access.salary === 'own'],
      ['approvals', 'Approvals', 'Requests waiting for you', I.ListChecks, approvalsFor(role).length > 0],
      ['appearance', 'Colours and text size', 'Light or dark, school colour', I.Palette, true],
    ].filter((x) => x[4]);
    if (!t) {
      quickFor(role, modulesOn).slice(0, 4).forEach((x) => out.push({ sec: 'Quick actions', icon: x.icon, label: x.label, sub: x.sub, run: () => (x.id === 'add-student' ? onAddStudent() : goTo(go, x.id)) }));
      if (canStudents && (role.access.students !== 'view' || role.id === 'accountant') && pool.some((s) => s.id === FEATURED.id)) out.push({ sec: 'Recent', icon: I.User, label: FEATURED.name, sub: `Class 7 B · Roll ${FEATURED.roll} · ${FEATURED.adm}`, run: () => go('student', { id: FEATURED.id }) });
      if (canFees) out.push({ sec: 'Try asking', icon: I.Sparkles, label: 'fee Aarav', sub: 'Jumps straight to collecting a fee', fill: 'fee Aarav' });
      if (register) out.push({ sec: 'Try asking', icon: I.Sparkles, label: 'absent today', sub: own ? 'Lists who is absent in your classes' : 'Lists who is absent right now', fill: 'absent today' });
      return out;
    }
    if (!feeMatch && canStudents) {
      pool.filter((s) => s.name.toLowerCase().includes(t) || s.adm.toLowerCase().includes(t) || s.phone.replace(' ', '').includes(t.replace(' ', '')))
        .slice(0, 5).forEach((s) => out.push({ sec: 'Students', icon: I.User, avatar: s.name, label: s.name, sub: `${s.cls} ${s.sec} · Roll ${s.roll} · ${s.adm}`, run: () => go('student', { id: s.id }) }));
    }
    if (!feeMatch && staffTo) {
      STAFF.filter((x) => x.name.toLowerCase().includes(t)).slice(0, 3)
        .forEach((x) => out.push({ sec: 'Staff', icon: I.User, avatar: x.name, label: x.name, sub: staffTo === 'library.issue' ? `${x.dept || x.desig} · issue a book` : `${x.desig} · ${x.code}`, run: () => goTo(go, staffTo) }));
    }
    const items = menu.flatMap((g) => g.items);
    items.filter((it) => it.label.toLowerCase().includes(t)).slice(0, 4)
      .forEach((it) => out.push({ sec: 'Pages', icon: I[it.icon], label: it.label, sub: 'Open', run: () => go(it.id) }));
    items.flatMap((it) => pagesFor(it.id, role.access[it.id], role.id).map((p) => ({ it, p })))
      .filter(({ p }) => p.label.toLowerCase().includes(t)).slice(0, 6)
      .forEach(({ it, p }) => out.push({ sec: 'Pages', icon: I[it.icon], label: p.label, sub: it.label, run: () => go(it.id, { page: p.id }) }));
    mine.filter((x) => x[1].toLowerCase().includes(t)).forEach(([to, label, sub, icon]) => out.push({ sec: 'Yours', icon, label, sub, run: () => goTo(go, to) }));
    return out;
  }, [q, role, pool, modulesOn]);

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
export function NotifPanel({ open, onClose, items: all, setItems }) {
  const { go } = useNav();
  const { role, modulesOn } = useRole();
  if (!open) return null;
  // Only alerts that open a screen this person can use (a module switched off hides its alerts)
  const items = all.filter((n) => canOpen(role, n.to, modulesOn));
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
          {unread > 0 && <Button size="sm" variant="ghost" icon={I.CheckCheck} onClick={() => setItems(all.map((n) => ({ ...n, unread: false })))}>Mark all read</Button>}
        </div>
        <ul className="overflow-y-auto scroll-thin px-2 pb-3">
          {items.map((n) => (
            <li key={n.id}>
              <button onClick={() => { setItems(all.map((x) => (x.id === n.id ? { ...x, unread: false } : x))); onClose(); goTo(go, n.to); }}
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
export function ProfileMenu({ open, onClose, onSwitch }) {
  const { go } = useNav();
  const { mode, setMode } = useTheme();
  const { role } = useRole();
  const ME = role.person;
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
        <button className={row} onClick={() => { onClose(); go('profile'); }}><I.UserCog size={18} className="text-ink3" />My profile and password</button>
        {approvalsFor(role).length > 0 && <button className={cx(row, '@md:hidden')} onClick={() => { onClose(); go('approvals'); }}><I.ListChecks size={18} className="text-ink3" />Approvals<span className="ml-auto text-[12px] font-bold tnum px-1.5 h-5 rounded-md bg-sunken text-ink2 inline-flex items-center">{approvalsFor(role).length}</span></button>}
        {role.access.staff === 'own' && <button className={row} onClick={() => { onClose(); go('staff', { page: 'leave' }); }}><I.CalendarDays size={18} className="text-ink3" />My leave</button>}
        {role.access.salary === 'own' && <button className={row} onClick={() => { onClose(); go('salary', { page: 'slips' }); }}><I.Wallet size={18} className="text-ink3" />My salary slips</button>}
        {role.access.staff === 'own' && <button className={row} onClick={() => { onClose(); go('staff', { page: 'documents' }); }}><I.FileText size={18} className="text-ink3" />My documents</button>}
        {role.multiSchool && <button className={row} onClick={() => { onClose(); onSwitch?.(); }}><I.ArrowRightLeft size={18} className="text-ink3" />Switch school or campus</button>}
        {(role.id === 'principal' || role.id === 'schooladmin') && <button className={row} onClick={() => { onClose(); go('parent'); }}><I.Smartphone size={18} className="text-ink3" />See what parents see</button>}
        <div className="border-t border-line my-1" />
        <button className={cx(row, 'text-bad')} onClick={() => { onClose(); go('signin'); }}><I.LogOut size={18} />Sign out</button>
      </div>
    </div>
  );
}
