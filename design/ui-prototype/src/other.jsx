import React, { useState } from 'react';
import * as I from './icons.js';
import { NAV, MODULE_PAGES, APPROVALS } from './data.js';
import { cx, Card, CardHead, Button, Pill, Avatar, Switch, PageHead, useToast, Empty } from './ui.jsx';
import { useNav, useTheme } from './shell.jsx';

export const ACCENTS = [
  { id: 'lagoon', name: 'Lagoon', light: '12 112 100', dark: '52 196 174' },
  { id: 'royal', name: 'Royal blue', light: '37 88 216', dark: '118 158 255' },
  { id: 'plum', name: 'Plum', light: '122 52 186', dark: '192 146 252' },
  { id: 'saffron', name: 'Saffron', light: '184 88 6', dark: '248 168 72' },
  { id: 'rose', name: 'Rose', light: '190 28 78', dark: '255 120 156' },
  { id: 'graphite', name: 'Graphite', light: '46 60 78', dark: '190 204 222' },
];

export function Appearance() {
  const { mode, setMode, accent, setAccent, size, setSize, resolved } = useTheme();
  const toast = useToast();
  const [everyone, setEveryone] = useState(false);
  return (
    <div className="max-w-4xl">
      <PageHead title="Colours and text size" sub="Make School OS comfortable for your eyes. Saved on this device." crumbs={<><span>Settings</span><I.ChevronRight size={13} /><span>Appearance</span></>} />
      <div className="flex flex-col gap-5">
        <Card>
          <CardHead title="Light or dark" sub="Auto follows your phone or computer setting" />
          <div className="grid grid-cols-3 gap-3 px-5 pb-5">
            {[['light', 'Light', I.Sun], ['dark', 'Dark', I.Moon], ['system', 'Auto', I.MonitorSmartphone]].map(([v, l, Ic]) => (
              <button key={v} onClick={() => setMode(v)} aria-pressed={mode === v}
                className={cx('rounded-2xl border-2 p-2 text-left transition', mode === v ? 'border-brand' : 'border-line hover:border-ink3/40')}>
                <ThemeThumb kind={v} />
                <span className="flex items-center gap-2 mt-2.5 px-1 pb-1 text-[14px] font-semibold"><Ic size={16} />{l}{mode === v && <I.CircleCheck size={16} className="ml-auto text-brand" />}</span>
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <CardHead title="School colour" sub="Buttons, highlights and the top band use this colour" />
          <div className="grid grid-cols-3 @md:grid-cols-6 gap-3 px-5 pb-4">
            {ACCENTS.map((a) => (
              <button key={a.id} onClick={() => setAccent(a.id)} aria-pressed={accent === a.id}
                className={cx('rounded-2xl border-2 p-3 flex flex-col items-center gap-2 transition', accent === a.id ? 'border-ink' : 'border-transparent hover:bg-sunken')}>
                <span className="w-11 h-11 rounded-full grid place-items-center text-white shadow-card" style={{ background: `rgb(${resolved === 'dark' ? a.dark : a.light})` }}>
                  {accent === a.id && <I.Check size={20} strokeWidth={3} style={{ color: resolved === 'dark' ? '#071412' : '#fff' }} />}
                </span>
                <span className="text-[13px] font-semibold">{a.name}</span>
              </button>
            ))}
          </div>
          <div className="mx-5 mb-5 rounded-xl bg-sunken p-3.5 flex items-center gap-3">
            <Switch id="acc-all" on={everyone} onChange={(v) => { setEveryone(v); toast({ title: v ? 'Everyone at Sunrise Public School will see this colour' : 'Only you will see this colour', tone: 'info' }); }} label="Use this colour for everyone" />
            <label htmlFor="acc-all" className="text-[14px]"><b className="font-semibold">Use for everyone in the school</b><span className="block text-[12.5px] text-ink3">Only School Admin can change this. Each person can still pick light or dark.</span></label>
          </div>
        </Card>
        <Card>
          <CardHead title="Text size" sub="Bigger text helps on small phones" />
          <div className="grid grid-cols-2 gap-3 px-5 pb-5">
            {[['normal', 'Standard', 'text-[15px]'], ['large', 'Large', 'text-[18px]']].map(([v, l, c]) => (
              <button key={v} onClick={() => setSize(v)} aria-pressed={size === v}
                className={cx('rounded-2xl border-2 p-4 text-left transition', size === v ? 'border-brand' : 'border-line hover:border-ink3/40')}>
                <span className={cx('block font-semibold', c)}>Aa · Aarav Sharma</span>
                <span className="block text-[13px] text-ink3 mt-1">{l}</span>
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <CardHead title="Preview" />
          <div className="px-5 pb-5 flex flex-wrap gap-2 items-center pointer-events-none" aria-hidden="true" inert="">
            <Button variant="primary" icon={I.IndianRupee}>Collect ₹30,650</Button>
            <Button variant="soft" icon={I.Send}>Send reminder</Button>
            <Button variant="secondary">Cancel</Button>
            <Pill tone="ok" dot>Paid</Pill><Pill tone="warn">Due</Pill><Pill tone="bad">Overdue</Pill><Pill tone="brand">New</Pill>
          </div>
        </Card>
      </div>
    </div>
  );
}

function ThemeThumb({ kind }) {
  const L = { bg: '#f3f6f5', s: '#fff', l: '#dee5e2', i: '#0f1715' };
  const D = { bg: '#090d0d', s: '#171e1e', l: '#242e2d', i: '#e9efed' };
  const one = (c) => (
    <svg viewBox="0 0 120 72" className="w-full h-auto block" aria-hidden="true">
      <rect width="120" height="72" fill={c.bg} />
      <rect x="0" y="0" width="28" height="72" fill={c.s} />
      <rect x="6" y="8" width="16" height="4" rx="2" fill="rgb(var(--brand))" />
      {[18, 26, 34, 42].map((y) => <rect key={y} x="6" y={y} width="14" height="3" rx="1.5" fill={c.l} />)}
      <rect x="34" y="8" width="80" height="18" rx="4" fill="rgb(var(--brand))" />
      <rect x="34" y="32" width="38" height="32" rx="4" fill={c.s} />
      <rect x="76" y="32" width="38" height="32" rx="4" fill={c.s} />
      <rect x="40" y="38" width="22" height="3" rx="1.5" fill={c.i} opacity=".7" />
      <rect x="82" y="38" width="18" height="3" rx="1.5" fill={c.i} opacity=".7" />
    </svg>
  );
  return (
    <div className="rounded-xl overflow-hidden border border-line">
      {kind === 'system' ? <div className="relative">{one(L)}<div className="absolute inset-0" style={{ clipPath: 'inset(0 0 0 50%)' }}>{one(D)}</div></div> : one(kind === 'dark' ? D : L)}
    </div>
  );
}

/* Modules designed in the next round. Honest about it, and shows the pages the module will have. */
export function ModuleNext({ id }) {
  const { go } = useNav();
  const item = NAV.flatMap((g) => g.items).find((x) => x.id === id) || { label: 'Approvals', icon: 'ListChecks' };
  const Ic = I[item.icon];
  const pages = MODULE_PAGES[id] || [];
  return (
    <div className="max-w-4xl">
      <PageHead title={item.label} />
      <Card className="p-5 @md:p-6 flex flex-col @md:flex-row gap-5 @md:items-center">
        <span className="w-14 h-14 rounded-2xl bg-brand/10 text-brand grid place-items-center shrink-0"><Ic size={26} /></span>
        <div className="flex-1">
          <p className="font-semibold text-[16px]">These screens come in the next design round</p>
          <p className="text-[14px] text-ink3 mt-1 leading-relaxed">This preview covers the screens a school uses every day. Once you approve the look, {item.label} gets the same design, using the pages below from the blueprint.</p>
        </div>
        <Button variant="secondary" icon={I.LayoutGrid} onClick={() => go('dashboard')}>Back to Dashboard</Button>
      </Card>
      {pages.length > 0 && (
        <>
          <p className="eyebrow text-ink3 mt-6 mb-3">Pages in {item.label}</p>
          <ul className="grid @sm:grid-cols-2 @xl:grid-cols-3 gap-3">
            {pages.map((p, i) => (
              <li key={p} className="rounded-2xl border border-dashed border-line p-4 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-sunken text-ink3 grid place-items-center text-[13px] font-bold tnum">{i + 1}</span>
                <span className="font-semibold text-[14.5px]">{p}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function Approvals() {
  const toast = useToast();
  const [list, setList] = useState(APPROVALS);
  const decide = (a, ok) => {
    setList((x) => x.filter((y) => y !== a));
    toast({ title: `${ok ? 'Approved' : 'Declined'}: ${a.what}`, undo: () => setList((x) => [a, ...x]) });
  };
  return (
    <div className="max-w-3xl">
      <PageHead title="Approvals" sub="Requests only you can decide" />
      <Card>
        {list.length === 0 ? <Empty icon={I.CheckCheck} title="Nothing waiting" body="New requests show up here and in your notifications." /> : (
          <ul className="divide-y divide-line/70">
            {list.map((a) => (
              <li key={a.who + a.what} className="flex flex-col @md:flex-row @md:items-center gap-3 p-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Avatar name={a.who} size={42} />
                  <div className="min-w-0"><p className="font-semibold text-[15px]">{a.who}</p><p className="text-[13.5px] text-ink3">{a.what}</p></div>
                  <Pill tone="info" className="ml-auto @md:ml-2">{a.kind}</Pill>
                </div>
                <div className="flex gap-2">
                  <Button variant="soft" icon={I.Check} onClick={() => decide(a, true)}>Approve</Button>
                  <Button variant="ghost" onClick={() => decide(a, false)}>Decline</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
