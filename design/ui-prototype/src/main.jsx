import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom';
import * as I from './icons.js';
import { NOTIFICATIONS, NAV, SCHOOL, ME } from './data.js';
import { PERSONAL, MODULES, ROLES, ROLE, NOTIFS_BY_ROLE, NOTIFS_DEFAULT, SCHOOLS_IN_GROUP, pagesFor, pageAccess } from './config.js';
import { cx, ToastHost, LayerCtx, Segmented, Sheet, Button, Pill, Empty, useToast } from './ui.jsx';
import { canOpen, NavCtx, ThemeCtx, RoleCtx, useRole, Sidebar, TopBar, BottomNav, MoreSheet, QuickSheet, CommandPalette, NotifPanel, ProfileMenu } from './shell.jsx';
import { PageCtx } from './kit.jsx';
import { REGISTRY } from './registry.js';
import { Dashboard } from './dashboard.jsx';
import { StudentProfile, AddStudentSheet } from './students.jsx';
import { ParentLink } from './parent.jsx';
import { SignIn } from './signin.jsx';
import { Appearance, Approvals } from './other.jsx';
import { RoleHome, MyProfile, SetupHome } from './dashboards.jsx';
import { SuperAdminApp, SuperAdminSignIn } from './superadmin.jsx';
import { DriverApp, ParentFirstOpen, AdminInvite, SchoolPaused } from './apps.jsx';

const store = {
  get: (k, d) => { try { return localStorage.getItem('sos-' + k) || d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('sos-' + k, v); } catch { /* storage blocked: keep in memory */ } },
};

// Screens outside the school's menu
const OUTSIDE = ['signin', 'parent', 'parentotp', 'invite', 'suspended', 'driver', 'sa-signin', 'sa'];
const SPECIAL = ['student', 'appearance', 'approvals', 'profile', 'setup'];
const KNOWN = new Set([...OUTSIDE, ...SPECIAL, ...Object.keys(MODULES)]);
// '#fees.defaulters' -> { screen: 'fees', params: { page: 'defaulters' } }
const parseHash = () => {
  const [screen, page] = location.hash.replace('#', '').split('.');
  return KNOWN.has(screen) ? { screen, params: page ? { page } : {} } : null;
};
const hashOf = (screen, params) => screen + (params?.page ? '.' + params.page : '');

const hostTheme = document.documentElement.getAttribute('data-theme');

function useThemeState() {
  // Default look: Light with Royal blue (owner's choice, 12 Oct 2026). New keys so earlier saved choices do not override it.
  const [mode, setMode] = useState(() => store.get('mode2', 'light'));
  const [accent, setAccent] = useState(() => store.get('accent2', 'royal'));
  const [size, setSize] = useState(() => store.get('size', 'normal'));
  const [sysDark, setSysDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const f = (e) => setSysDark(e.matches);
    mq?.addEventListener?.('change', f);
    return () => mq?.removeEventListener?.('change', f);
  }, []);
  useEffect(() => {
    const r = document.documentElement;
    if (mode === 'system') { hostTheme ? r.setAttribute('data-theme', hostTheme) : r.removeAttribute('data-theme'); } else r.setAttribute('data-theme', mode);
    accent === 'lagoon' ? r.removeAttribute('data-accent') : r.setAttribute('data-accent', accent);
    size === 'large' ? r.setAttribute('data-size', 'large') : r.removeAttribute('data-size');
    store.set('mode2', mode); store.set('accent2', accent); store.set('size', size);
  }, [mode, accent, size]);
  const resolved = mode === 'system' ? hostTheme || (sysDark ? 'dark' : 'light') : mode;
  return { mode, setMode, accent, setAccent, size, setSize, resolved };
}

const YEARS = [
  { label: '2027–28', sub: 'Next year · being prepared', next: true },
  { label: '2026–27', sub: 'Current year · 1 Jun 2026 to 31 Mar 2027' },
  { label: '2025–26', sub: 'Closed · read-only', closed: true },
  { label: '2024–25', sub: 'Closed · read-only', closed: true },
];

function useRoleState() {
  const [roleId, setRoleId] = useState(() => (ROLE[store.get('role', 'principal')] ? store.get('role', 'principal') : 'principal'));
  const [modulesOn, setModulesOn] = useState({});
  const [year, setYear] = useState(YEARS[1]);
  const [support, setSupport] = useState(null);
  const role = ROLE[roleId];
  // Round-1 screens read ME and SCHOOL directly; keep them in step with who is signed in
  Object.assign(ME, role.person);
  useEffect(() => store.set('role', roleId), [roleId]);
  return useMemo(() => ({
    role, roleId, setRole: setRoleId, modulesOn, year, setYear, years: YEARS, support,
    setModule: (id, on) => setModulesOn((m) => ({ ...m, [id]: on })),
    access: (m) => role.access[m],
    startSupport: () => setSupport({ school: SCHOOL.name, ends: '3:40 PM', by: 'Kiran Reddy' }),
    endSupport: () => setSupport(null),
  }), [role, roleId, modulesOn, year, support]);
}

function homeOf(role) { return role.id === 'student' ? 'homework' : 'dashboard'; }

function App({ framed }) {
  const rs = useRole();
  const [route, setRoute] = useState(() => parseHash() || { screen: homeOf(rs.role), params: {} });
  const go = useCallback((screen, params = {}) => {
    setRoute({ screen, params });
    try { history.replaceState(null, '', '#' + hashOf(screen, params)); } catch { /* sandboxed: ignore */ }
  }, []);
  useEffect(() => {
    const f = () => { const r = parseHash(); if (r) setRoute(r); };
    window.addEventListener('hashchange', f);
    window.__sosGo = go;
    return () => window.removeEventListener('hashchange', f);
  }, [go]);

  const [layer, setLayer] = useState(null);
  const nav = useMemo(() => ({ go, screen: route.screen, params: route.params }), [go, route]);
  const s = route.screen;
  const outside =
    s === 'signin' ? <SignIn /> : s === 'parent' ? <ParentLink /> : s === 'parentotp' ? <ParentFirstOpen /> :
    s === 'invite' ? <AdminInvite /> : s === 'suspended' ? <SchoolPaused /> : s === 'driver' ? <DriverApp /> :
    s === 'sa-signin' ? <SuperAdminSignIn /> : s === 'sa' ? <SuperAdminApp page={route.params.page || 'dashboard'} params={route.params} /> : null;

  return (
    <NavCtx.Provider value={nav}>
      <div className="@container relative h-full w-full overflow-hidden bg-bg text-ink" style={framed ? { transform: 'translateZ(0)' } : undefined}>
        <LayerCtx.Provider value={layer}>
          <ToastHost>
            {outside || <Shell route={route} key={rs.roleId} />}
            <div ref={setLayer} className="absolute inset-0 z-50 pointer-events-none [&>*]:pointer-events-auto" />
          </ToastHost>
        </LayerCtx.Provider>
      </div>
    </NavCtx.Provider>
  );
}

function Shell({ route }) {
  const { go } = React.useContext(NavCtx);
  const rs = useRole();
  const { role, year, support } = rs;
  const toast = useToast();
  const [palette, setPalette] = useState(false);
  const [notif, setNotif] = useState(false);
  const [profile, setProfile] = useState(false);
  const [more, setMore] = useState(false);
  const [quick, setQuick] = useState(false);
  const [add, setAdd] = useState(false);
  const [yearOpen, setYearOpen] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [notes, setNotes] = useState(() => (role.id === 'principal' || role.id === 'schooladmin' ? NOTIFICATIONS : NOTIFS_BY_ROLE[role.id] || NOTIFS_DEFAULT));
  const main = useRef(null);
  useEffect(() => { main.current?.scrollTo?.(0, 0); }, [route]);
  useEffect(() => {
    const k = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette(true); }
      if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName)) { e.preventDefault(); setPalette(true); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const s = route.screen;
  const fullHome = ['principal', 'schooladmin', 'vp'].includes(role.id);
  const content =
    s === 'dashboard' ? (role.access.dashboard ? (fullHome ? <Dashboard onAddStudent={() => setAdd(true)} /> : <RoleHome />) : <NoAccess what="Dashboard" />) :
    s === 'student' ? (role.access.students ? <StudentProfile id={route.params.id} /> : <NoAccess what="Student Management" />) :
    s === 'appearance' ? <Appearance /> :
    s === 'approvals' ? <Approvals /> :
    s === 'profile' ? <MyProfile /> :
    s === 'setup' ? <SetupHome /> :
    <ModuleScreen id={s} params={route.params} onAddStudent={() => setAdd(true)} />;
  const title = s === 'dashboard' ? 'Dashboard' : s === 'student' ? 'Student profile' : s === 'appearance' ? 'Appearance' : s === 'approvals' ? 'Approvals' : s === 'profile' ? 'My profile' : s === 'setup' ? 'Setup checklist' : PERSONAL.includes(s) && role.access[s] === 'own' ? 'My profile' : s === 'fees' && (route.params.page || 'collect') === 'collect' && pagesFor('fees', role.access.fees, role.id).some((p) => p.id === 'collect') ? 'Collect fee' : MODULES[s]?.short;

  return (
    <div className="flex flex-col h-full">
      {support && (
        <div className="shrink-0 bg-warn text-surface px-4 py-2 flex items-center gap-3 text-[13px] font-semibold z-30">
          <I.LifeBuoy size={16} className="shrink-0" />
          <span className="flex-1 min-w-0 truncate">Support access for {support.school}, ends {support.ends} · DREAM TEAM support ({support.by})</span>
          <button onClick={() => { rs.endSupport(); go('sa', { page: 'support' }); }} className="h-7 px-2.5 rounded-lg bg-white/20 hover:bg-white/30 shrink-0">End now</button>
        </div>
      )}
      <div className="flex flex-1 min-h-0">
        <Sidebar onQuick={() => setQuick(true)} onSwitch={() => setSwitchOpen(true)} />
        <div className="flex-1 flex flex-col min-w-0 h-full">
          <TopBar title={title} unread={notes.filter((n) => n.unread && (!n.to || canOpen(role, n.to, rs.modulesOn))).length} onYear={() => setYearOpen(true)}
            onSearch={() => setPalette(true)} onNotif={() => setNotif(true)} onProfile={() => setProfile(true)} onApprovals={() => go('approvals')} />
          <main ref={main} className="flex-1 overflow-y-auto overflow-x-hidden scroll-thin">
            {year.closed && (
              <div className="bg-warn/15 border-b border-warn/30 px-4 @md:px-6 py-2.5 flex items-center gap-3 text-[13.5px]">
                <I.Lock size={16} className="text-warn shrink-0" />
                <p className="flex-1 min-w-0"><b className="font-semibold">You are viewing {year.label}.</b> This year is closed. Changes are not allowed.</p>
                <Button size="sm" variant="secondary" onClick={() => rs.setYear(rs.years[1])}>Back to 2026–27</Button>
              </div>
            )}
            <div key={s + JSON.stringify(route.params)} className="max-w-[1400px] mx-auto px-4 @md:px-6 @xl:px-8 py-5 @md:py-7 animate-rise">{content}</div>
          </main>
          <BottomNav onMore={() => setMore(true)} />
        </div>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} onAddStudent={() => setAdd(true)} />
      <NotifPanel open={notif} onClose={() => setNotif(false)} items={notes} setItems={setNotes} />
      <ProfileMenu open={profile} onClose={() => setProfile(false)} onSwitch={() => setSwitchOpen(true)} />
      <MoreSheet open={more} onClose={() => setMore(false)} />
      <QuickSheet open={quick} onClose={() => setQuick(false)} onAddStudent={() => setAdd(true)} />
      <AddStudentSheet open={add} onClose={() => setAdd(false)} />
      <Sheet open={yearOpen} onClose={() => setYearOpen(false)} title="Academic year" sub="Past years open read-only. The next year opens once Academic Settings prepares it.">
        <div className="flex flex-col gap-2">
          {rs.years.map((y) => (
            <button key={y.label} onClick={() => { rs.setYear(y); setYearOpen(false); if (y.next) toast({ title: 'Preparing 2027–28', body: 'Fee structures, classes and the time table can be set up before the year starts.', tone: 'info' }); }}
              className={cx('flex items-center gap-3 p-3.5 rounded-2xl border text-left transition', year.label === y.label ? 'border-brand ring-1 ring-brand bg-brand/5' : 'border-line hover:bg-sunken')}>
              <span className={cx('w-10 h-10 rounded-xl grid place-items-center', y.closed ? 'bg-sunken text-ink3' : 'bg-brand/10 text-brand')}>{y.closed ? <I.Lock size={18} /> : <I.CalendarRange size={18} />}</span>
              <span className="flex-1"><span className="block font-semibold text-[15px] tnum">{y.label}</span><span className="block text-[12.5px] text-ink3">{y.sub}</span></span>
              {year.label === y.label && <I.CircleCheck size={18} className="text-brand" />}
            </button>
          ))}
        </div>
      </Sheet>
      <Sheet open={switchOpen} onClose={() => setSwitchOpen(false)} title="Switch school or campus" sub="Your one login works in each school of Sunrise Group. Each keeps its own data.">
        <div className="flex flex-col gap-2">
          {SCHOOLS_IN_GROUP.map((x) => (
            <button key={x.id} onClick={() => { Object.assign(SCHOOL, { place: x.place }); setSwitchOpen(false); go('dashboard'); toast({ title: `Now working in ${x.name}`, body: x.place }); }}
              className={cx('flex items-center gap-3 p-3.5 rounded-2xl border text-left transition', SCHOOL.place === x.place ? 'border-brand ring-1 ring-brand bg-brand/5' : 'border-line hover:bg-sunken')}>
              <span className="w-10 h-10 rounded-xl bg-brand text-brandink grid place-items-center"><I.School size={19} /></span>
              <span className="flex-1"><span className="block font-semibold text-[15px]">{x.name}</span><span className="block text-[12.5px] text-ink3">{x.place} · {x.students.toLocaleString('en-IN')} students</span></span>
              {SCHOOL.place === x.place && <I.CircleCheck size={18} className="text-brand" />}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

function NoAccess({ what, page }) {
  const { go } = React.useContext(NavCtx);
  const { role } = useRole();
  return (
    <div className="max-w-xl mx-auto py-6">
      <Empty icon={I.Lock} title={`You don't have access to ${what}`}
        body={`Your role, ${role.label}, does not include this ${page ? 'page' : 'part of School OS'}. If you need it for your work, ask the School Admin to change your role in Settings, Users & Permissions.`}
        action={<Button variant="secondary" icon={I.House} onClick={() => go(homeOf(role))}>Go to your home</Button>} />
    </div>
  );
}

function ModuleScreen({ id, params, onAddStudent }) {
  const { role } = useRole();
  const access = role.access[id];
  const m = MODULES[id];
  const pages = pagesFor(id, access, role.id);
  if (!m || !access || !pages.length) return <NoAccess what={NAV.flatMap((g) => g.items).find((x) => x.id === id)?.label || 'This page'} />;
  const detail = id === 'staff' && params.page === 'profile' && access !== 'own';
  // A page outside this person's role, opened by a link or typed address, shows the lock screen, never the page
  if (params.page && !detail && !pages.some((p) => p.id === params.page)) return <NoAccess what={m.pages.find((p) => p[0] === params.page)?.[1] || 'This page'} page />;
  const page = detail ? 'profile' : pages.some((p) => p.id === params.page) ? params.page : pages.some((p) => p.id === m.def) ? m.def : pages[0].id;
  const Comp = REGISTRY[id]?.[page];
  const pa = pageAccess(role.id, id, page, access);
  return (
    <PageCtx.Provider value={{ module: id, page, access: pa, moduleAccess: access, pages, short: m.short }}>
      {Comp ? <Comp params={params} access={pa} onAddStudent={onAddStudent} /> : <Empty icon={I.LayoutGrid} title={pages.find((p) => p.id === page)?.label || page} body="Pick a page from the tabs above." />}
    </PageCtx.Provider>
  );
}

/* Design review page: a thin bar to jump between screens, pick who is signed in, and switch computer / phone view */
const JUMP = [
  ['Round 1 screens', [['signin', 'Sign in'], ['dashboard', 'Dashboard'], ['students', 'Student list'], ['student', 'Student profile'], ['fees', 'Collect fee'], ['attendance', 'Take attendance'], ['parent', 'Parent Link (phone)'], ['appearance', 'Colours and dark mode'], ['approvals', 'Approvals']]],
  ['Modules', NAV.flatMap((g) => g.items).filter((x) => x.id !== 'dashboard').map((x) => [x.id, x.label])],
  ['Everyone', [['profile', 'My profile and password']]],
  ['Super Admin console (DREAM TEAM)', [['sa-signin', 'Console sign in'], ['sa', 'Console dashboard'], ['sa.schools', 'Schools'], ['sa.school', 'One school’s page'], ['sa.add', 'Add School'], ['sa.support', 'Support Access'], ['sa.billing', 'Plans & Billing'], ['sa.team', 'Team'], ['sa.activity', 'Activity Log']]],
  ['Other sides', [['invite', 'School Admin invite: set password'], ['setup', 'School Admin first day: Setup checklist'], ['parentotp', 'Parent Link: first open on a new phone'], ['driver', 'Driver app (Android)'], ['suspended', 'School paused (Suspended)']]],
];
const JUMP_IDS = JUMP.flatMap((g) => g[1].map((x) => x[0]));

function Review() {
  const theme = useThemeState();
  const rs = useRoleState();
  const [device, setDevice] = useState(() => store.get('device', 'computer'));
  const [wide, setWide] = useState(() => window.innerWidth >= 900);
  const [screen, setScreen] = useState(() => location.hash.replace('#', '') || 'dashboard');
  useEffect(() => {
    const f = () => setWide(window.innerWidth >= 900);
    const h = () => setScreen(location.hash.replace('#', ''));
    window.addEventListener('resize', f); window.addEventListener('hashchange', h);
    const t = setInterval(h, 400);
    return () => { window.removeEventListener('resize', f); window.removeEventListener('hashchange', h); clearInterval(t); };
  }, []);
  useEffect(() => store.set('device', device), [device]);
  const framed = wide && device === 'phone';
  const jump = (v) => {
    if (v === 'student' && !rs.role.access.students) rs.setRole('principal');
    setScreen(v);
    const [sc, pg] = v.split('.');
    window.__sosGo ? window.__sosGo(sc, pg ? { page: pg } : {}) : (location.hash = v);
  };
  const pickRole = (v) => {
    if (v === 'sa') return jump('sa');
    if (v === 'parent') return jump('parent');
    if (v === 'driver') return jump('driver');
    rs.setRole(v);
    const r = ROLE[v];
    setTimeout(() => jump(homeOf(r)), 0);
  };
  const sc = screen.split('.')[0];
  const who = sc === 'sa' || sc === 'sa-signin' ? 'sa' : sc === 'parent' || sc === 'parentotp' ? 'parent' : sc === 'driver' ? 'driver' : rs.roleId;
  const sel = 'appearance-none h-8 pl-3 pr-8 rounded-lg bg-bg/10 hover:bg-bg/15 text-bg font-semibold outline-none cursor-pointer [&_option]:text-black max-w-[38vw] sm:max-w-none truncate';

  return (
    <ThemeCtx.Provider value={theme}>
      <RoleCtx.Provider value={rs}>
        <div className="h-full flex flex-col">
          <div className="shrink-0 h-11 flex items-center gap-2 px-3 bg-ink text-bg text-[12.5px] z-[70]">
            <span className="hidden lg:inline-flex items-center gap-1.5 font-semibold"><I.Eye size={14} />Design preview</span>
            <span className="hidden lg:inline opacity-40">·</span>
            <label htmlFor="jump" className="sr-only">Jump to screen</label>
            <div className="relative min-w-0">
              <select id="jump" value={JUMP_IDS.includes(screen) ? screen : ''} onChange={(e) => jump(e.target.value)} className={sel}>
                {!JUMP_IDS.includes(screen) && <option value="">Jump to a screen</option>}
                {JUMP.map(([g, items]) => <optgroup key={g} label={g}>{items.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</optgroup>)}
              </select>
              <I.ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-90" />
            </div>
            <label htmlFor="as" className="hidden md:inline opacity-90 font-semibold ml-1">View as</label>
            <div className="relative min-w-0">
              <select id="as" value={who} onChange={(e) => pickRole(e.target.value)} className={sel} aria-label="View as">
                <optgroup label="Ready roles">{ROLES.filter((r) => r.group === 'ready').map((r) => <option key={r.id} value={r.id}>{r.label} · {r.person.name}</option>)}</optgroup>
                <optgroup label="Role templates">{ROLES.filter((r) => r.group === 'template').map((r) => <option key={r.id} value={r.id}>{r.label} · {r.person.name}</option>)}</optgroup>
                <optgroup label="Other sides">
                  <option value="parent">Parent · Priya Sharma (Parent Link)</option>
                  <option value="driver">Driver · Mallesh Kumar (Android app)</option>
                  <option value="sa">DREAM TEAM · Super Admin console</option>
                </optgroup>
              </select>
              <I.ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-90" />
            </div>
            <span className="flex-1" />
            <button onClick={() => theme.setMode(theme.resolved === 'dark' ? 'light' : 'dark')} className="h-8 px-2.5 rounded-lg hover:bg-bg/10 inline-flex items-center gap-1.5 font-semibold shrink-0" aria-label="Switch light or dark">
              {theme.resolved === 'dark' ? <I.Sun size={15} /> : <I.Moon size={15} />}<span className="hidden sm:inline">{theme.resolved === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
            {wide && (
              <div className="inline-flex p-0.5 rounded-lg bg-bg/10 shrink-0" role="radiogroup" aria-label="Preview size">
                {[['computer', 'Computer', I.Monitor], ['phone', 'Phone', I.Smartphone]].map(([v, l, Ic]) => (
                  <button key={v} role="radio" aria-checked={device === v} onClick={() => setDevice(v)}
                    className={cx('h-7 px-2.5 rounded-md inline-flex items-center gap-1.5 font-semibold transition', device === v ? 'bg-bg text-ink' : 'opacity-90 hover:opacity-100')}>
                    <Ic size={14} />{l}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className={cx('flex-1 min-h-0', framed && 'grid place-items-center p-4 bg-sunken')}>
            {framed ? (
              <div className="rounded-[44px] border-[10px] border-ink shadow-pop overflow-hidden bg-bg" style={{ width: 410, height: 'min(864px, 100%)' }}>
                <App framed key={'framed-' + rs.roleId} />
              </div>
            ) : <App key={'full-' + rs.roleId} />}
          </div>
        </div>
      </RoleCtx.Provider>
    </ThemeCtx.Provider>
  );
}

createRoot(document.getElementById('root')).render(<Review />);
