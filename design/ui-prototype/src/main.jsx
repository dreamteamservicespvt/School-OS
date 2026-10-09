import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom';
import * as I from './icons.js';
import { NOTIFICATIONS, NAV } from './data.js';
import { cx, ToastHost, LayerCtx, Segmented } from './ui.jsx';
import { NavCtx, ThemeCtx, Sidebar, TopBar, BottomNav, MoreSheet, QuickSheet, CommandPalette, NotifPanel, ProfileMenu } from './shell.jsx';
import { Dashboard } from './dashboard.jsx';
import { Students, StudentProfile, AddStudentSheet } from './students.jsx';
import { CollectFee } from './fees.jsx';
import { Attendance } from './attendance.jsx';
import { ParentLink } from './parent.jsx';
import { SignIn } from './signin.jsx';
import { Appearance, ModuleNext, Approvals } from './other.jsx';

const store = {
  get: (k, d) => { try { return localStorage.getItem('sos-' + k) || d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('sos-' + k, v); } catch { /* storage blocked: keep in memory */ } },
};

const SCREENS = [
  ['signin', 'Sign in'], ['dashboard', 'Dashboard'], ['students', 'Student list'], ['student', 'Student profile'],
  ['fees', 'Collect fee'], ['attendance', 'Take attendance'], ['parent', 'Parent Link (phone)'], ['appearance', 'Colours and dark mode'],
  ['approvals', 'Approvals'],
];
const TITLES = { dashboard: 'Dashboard', students: 'Students', student: 'Student profile', fees: 'Collect fee', attendance: 'Attendance', appearance: 'Appearance', approvals: 'Approvals' };
const KNOWN = new Set([...SCREENS.map((s) => s[0]), ...NAV.flatMap((g) => g.items.map((i) => i.id))]);

const hostTheme = document.documentElement.getAttribute('data-theme');

function useThemeState() {
  const [mode, setMode] = useState(() => store.get('mode', 'system'));
  const [accent, setAccent] = useState(() => store.get('accent', 'lagoon'));
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
    store.set('mode', mode); store.set('accent', accent); store.set('size', size);
  }, [mode, accent, size]);
  const resolved = mode === 'system' ? hostTheme || (sysDark ? 'dark' : 'light') : mode;
  return { mode, setMode, accent, setAccent, size, setSize, resolved };
}

function App({ framed }) {
  const [route, setRoute] = useState(() => {
    const h = location.hash.replace('#', '');
    return { screen: KNOWN.has(h) ? h : 'dashboard', params: {} };
  });
  const go = useCallback((screen, params = {}) => {
    setRoute({ screen, params });
    try { history.replaceState(null, '', '#' + screen); } catch { /* sandboxed: ignore */ }
  }, []);
  useEffect(() => {
    const f = () => { const h = location.hash.replace('#', ''); if (KNOWN.has(h)) setRoute({ screen: h, params: {} }); };
    window.addEventListener('hashchange', f);
    window.__sosGo = go;
    return () => window.removeEventListener('hashchange', f);
  }, [go]);

  const [layer, setLayer] = useState(null);
  const nav = useMemo(() => ({ go, screen: route.screen, params: route.params }), [go, route]);

  return (
    <NavCtx.Provider value={nav}>
      <div className="@container relative h-full w-full overflow-hidden bg-bg text-ink" style={framed ? { transform: 'translateZ(0)' } : undefined}>
        <LayerCtx.Provider value={layer}>
          <ToastHost>
            {route.screen === 'signin' ? <SignIn /> : route.screen === 'parent' ? <ParentLink /> : <Shell route={route} />}
            <div ref={setLayer} className="absolute inset-0 z-50 pointer-events-none [&>*]:pointer-events-auto" />
          </ToastHost>
        </LayerCtx.Provider>
      </div>
    </NavCtx.Provider>
  );
}

function Shell({ route }) {
  const { go } = React.useContext(NavCtx);
  const [palette, setPalette] = useState(false);
  const [notif, setNotif] = useState(false);
  const [profile, setProfile] = useState(false);
  const [more, setMore] = useState(false);
  const [quick, setQuick] = useState(false);
  const [add, setAdd] = useState(false);
  const [notes, setNotes] = useState(NOTIFICATIONS);
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
  const content =
    s === 'dashboard' ? <Dashboard onAddStudent={() => setAdd(true)} /> :
    s === 'students' ? <Students onAddStudent={() => setAdd(true)} /> :
    s === 'student' ? <StudentProfile id={route.params.id} /> :
    s === 'fees' ? <CollectFee studentId={route.params.student} /> :
    s === 'attendance' ? <Attendance /> :
    s === 'appearance' ? <Appearance /> :
    s === 'approvals' ? <Approvals /> :
    <ModuleNext id={s} />;

  return (
    <div className="flex h-full">
      <Sidebar onQuick={() => setQuick(true)} />
      <div className="flex-1 flex flex-col min-w-0 h-full">
        <TopBar title={TITLES[s]} unread={notes.filter((n) => n.unread).length}
          onSearch={() => setPalette(true)} onNotif={() => setNotif(true)} onProfile={() => setProfile(true)} onApprovals={() => go('approvals')} />
        <main ref={main} className="flex-1 overflow-y-auto overflow-x-hidden scroll-thin">
          <div key={s + JSON.stringify(route.params)} className="max-w-[1400px] mx-auto px-4 @md:px-6 @xl:px-8 py-5 @md:py-7 animate-rise">{content}</div>
        </main>
        <BottomNav onMore={() => setMore(true)} />
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} onAddStudent={() => setAdd(true)} />
      <NotifPanel open={notif} onClose={() => setNotif(false)} items={notes} setItems={setNotes} />
      <ProfileMenu open={profile} onClose={() => setProfile(false)} />
      <MoreSheet open={more} onClose={() => setMore(false)} />
      <QuickSheet open={quick} onClose={() => setQuick(false)} onAddStudent={() => setAdd(true)} />
      <AddStudentSheet open={add} onClose={() => setAdd(false)} />
    </div>
  );
}

/* Design review page: a thin bar to jump between screens and switch computer / phone view */
function Review() {
  const theme = useThemeState();
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
  const jump = (v) => { setScreen(v); window.__sosGo ? window.__sosGo(v) : (location.hash = v); };

  return (
    <ThemeCtx.Provider value={theme}>
      <div className="h-full flex flex-col">
        <div className="shrink-0 h-11 flex items-center gap-2 px-3 bg-ink text-bg text-[12.5px] z-[70]">
          <span className="hidden sm:inline-flex items-center gap-1.5 font-semibold"><I.Eye size={14} />Design preview</span>
          <span className="hidden sm:inline opacity-40">·</span>
          <label htmlFor="jump" className="sr-only">Jump to screen</label>
          <div className="relative">
            <select id="jump" value={SCREENS.some((x) => x[0] === screen) ? screen : ''} onChange={(e) => jump(e.target.value)}
              className="appearance-none h-8 pl-3 pr-8 rounded-lg bg-bg/10 hover:bg-bg/15 text-bg font-semibold outline-none cursor-pointer [&>option]:text-black">
              {!SCREENS.some((x) => x[0] === screen) && <option value="">Other module</option>}
              {SCREENS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <I.ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-70" />
          </div>
          <span className="flex-1" />
          <button onClick={() => theme.setMode(theme.resolved === 'dark' ? 'light' : 'dark')} className="h-8 px-2.5 rounded-lg hover:bg-bg/10 inline-flex items-center gap-1.5 font-semibold" aria-label="Switch light or dark">
            {theme.resolved === 'dark' ? <I.Sun size={15} /> : <I.Moon size={15} />}<span className="hidden sm:inline">{theme.resolved === 'dark' ? 'Light' : 'Dark'}</span>
          </button>
          {wide && (
            <div className="inline-flex p-0.5 rounded-lg bg-bg/10" role="radiogroup" aria-label="Preview size">
              {[['computer', 'Computer', I.Monitor], ['phone', 'Phone', I.Smartphone]].map(([v, l, Ic]) => (
                <button key={v} role="radio" aria-checked={device === v} onClick={() => setDevice(v)}
                  className={cx('h-7 px-2.5 rounded-md inline-flex items-center gap-1.5 font-semibold transition', device === v ? 'bg-bg text-ink' : 'opacity-80 hover:opacity-100')}>
                  <Ic size={14} />{l}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className={cx('flex-1 min-h-0', framed && 'grid place-items-center p-4 bg-sunken')}>
          {framed ? (
            <div className="rounded-[44px] border-[10px] border-ink shadow-pop overflow-hidden bg-bg" style={{ width: 410, height: 'min(864px, 100%)' }}>
              <App framed key="framed" />
            </div>
          ) : <App key="full" />}
        </div>
      </div>
    </ThemeCtx.Provider>
  );
}

createRoot(document.getElementById('root')).render(<Review />);
