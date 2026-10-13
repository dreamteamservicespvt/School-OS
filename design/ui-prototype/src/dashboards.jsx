// Home screens for every role that is not Principal, School Admin or Vice Principal (they use dashboard.jsx),
// the top-bar Profile page for whoever is signed in, and the first-day Setup checklist of a new school.
// Blueprint: modules/01-dashboard.md, modules/00-global.md §1.4, 07-super-admin.md §5.
import React, { useState } from 'react';
import * as I from './icons.js';
import { RECENT_PAYMENTS, CLASS_7B, inr } from './data.js';
import { STAFF, ROUTES } from './sample.js';
import { ROLE, pagesFor, APPROVALS_BY_ROLE } from './config.js';
import { cx, Card, CardHead, Button, Pill, Avatar, Checkbox, Field, Input, Switch, PageHead, Ring, Sheet, Empty, useToast } from './ui.jsx';
import { useNav, useRole, quickFor, goTo, canOpen } from './shell.jsx';
import { Band, Banner, FormSheet, ConfirmSheet, Select, Textarea, Progress, HBars, Split, Col, DL, Icon, TONE_SOFT, DatePeriod, PERIODS, fmtRange, periodDays } from './kit.jsx';

/* ---------- Who may open what ---------- */
// 'fees.defaulters' is openable when the role has the module and that page, and the school has the module on
function useOpen() {
  const { role, modulesOn } = useRole();
  return (to) => canOpen(role, to, modulesOn);
}
// Who may give tasks to other people ("full task manager"). Everyone else gives tasks only to themselves.
// 01-dashboard.md leaves the list to Settings; this is the least-exposure default.
const TASK_FULL = ['principal', 'schooladmin', 'vp', 'academichead'];
// Hidden when the module behind it is switched off; kept (without a link) when only the page is not theirs
function useShown() {
  const { modulesOn } = useRole();
  return (it) => !it.to || modulesOn[it.to.split('.')[0]] !== false;
}

/* ---------- Greeting, same as the approved Dashboard ---------- */
function Greeting({ first, action, line }) {
  const [loading, setLoading] = useState(false);
  const [refreshed, setRefreshed] = useState('10:42 AM');
  return (
    <div className="flex flex-col @md:flex-row @md:items-end justify-between gap-3">
      <div>
        <p className="text-[13px] font-semibold text-ink3">{line || 'Friday, 9 October · School day 86 of 220'}</p>
        <h1 className="font-display text-[26px] @md:text-[32px] font-semibold tracking-tight leading-tight mt-0.5">Good morning, {first}</h1>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => { setLoading(true); setTimeout(() => { setLoading(false); setRefreshed('10:43 AM'); }, 600); }}
          className="inline-flex items-center gap-1.5 text-[13px] text-ink3 hover:text-ink h-9 px-2 rounded-lg">
          <I.RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Updated {refreshed}
        </button>
        {action}
      </div>
    </div>
  );
}

/* ---------- Needs your attention ---------- */
const TONE_ICON = { bad: I.UserX, warn: I.TriangleAlert, info: I.ListChecks, brand: I.Sparkles, ok: I.CircleCheck };
const TONE_BG = { bad: 'bg-bad/10 text-bad', warn: 'bg-warn/12 text-warn', info: 'bg-info/10 text-info', brand: 'bg-brand/10 text-brand', ok: 'bg-ok/10 text-ok' };
function Attention({ items }) {
  const { go } = useNav();
  const toast = useToast();
  const open = useOpen();
  const [seen, setSeen] = useState(new Set());
  const list = items.filter((n) => !seen.has(n.title));
  return (
    <Card>
      <CardHead title="Needs your attention" sub="Most urgent first. Each one opens the exact list behind it." icon={I.Flag}
        action={list.length ? <Pill tone={list.some((n) => n.tone === 'bad') ? 'bad' : 'warn'}>{list.length} {list.length === 1 ? 'item' : 'items'}</Pill> : null} />
      {list.length === 0 ? (
        <div className="px-5 pb-6 pt-1 text-center">
          <span className="mx-auto w-12 h-12 rounded-2xl bg-ok/10 text-ok grid place-items-center animate-pop"><I.Check size={24} strokeWidth={2.6} /></span>
          <p className="font-semibold mt-2.5">Nothing needs you right now</p>
          <p className="text-[13px] text-ink3">New items show up here by themselves.</p>
        </div>
      ) : (
        <ul className="px-2 pb-2">
          {list.map((n) => {
            const Ic = n.icon ? I[n.icon] || I.Circle : TONE_ICON[n.tone] || I.TriangleAlert;
            const can = open(n.to);
            const act = () => (n.to === 'approvals' ? go('approvals') : goTo(go, n.to));
            return (
              <li key={n.title}>
                <div className="flex items-center gap-3.5 px-3 py-3 rounded-xl hover:bg-sunken/70 transition group">
                  <span className={cx('w-10 h-10 rounded-xl grid place-items-center shrink-0', TONE_BG[n.tone])}><Ic size={19} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[14.5px] leading-snug">{n.title}</p>
                    <p className="text-[13px] text-ink3 truncate">{n.detail}</p>
                  </div>
                  <button onClick={() => { setSeen((s) => new Set(s).add(n.title)); toast({ title: 'Marked as seen', body: 'It comes back if the number changes.', tone: 'info', undo: () => setSeen((s) => { const x = new Set(s); x.delete(n.title); return x; }) }); }}
                    className="hidden @md:grid w-8 h-8 place-items-center rounded-lg text-ink3 opacity-0 group-hover:opacity-100 hover:bg-line/60 transition" aria-label="Mark as seen" title="Mark as seen"><I.EyeOff size={16} /></button>
                  {can && <Button size="sm" variant="secondary" className="hidden @sm:inline-flex" onClick={act}>{n.action}</Button>}
                  {can && <button className="@sm:hidden w-9 h-9 grid place-items-center rounded-lg text-ink3" onClick={act} aria-label={n.action}><I.ChevronRight size={20} /></button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ---------- My tasks ---------- */
function Tasks({ items, given = [] }) {
  const { go } = useNav();
  const toast = useToast();
  const open = useOpen();
  const { role } = useRole();
  const full = TASK_FULL.includes(role.id);
  const [tab, setTab] = useState('mine');
  const [list, setList] = useState(items);
  const [mine, setMine] = useState(given);
  const [add, setAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [err, setErr] = useState('');
  const toggle = (t) => {
    setList((x) => x.map((y) => (y.title === t.title ? { ...y, done: !y.done } : y)));
    if (!t.done) toast({ title: 'Task marked done', body: t.title, undo: () => setList((x) => x.map((y) => (y.title === t.title ? { ...y, done: false } : y))) });
  };
  const rows = tab === 'mine' ? [...list].sort((a, b) => (a.done - b.done) || ((b.over ? 1 : 0) - (a.over ? 1 : 0))) : mine;
  const left = list.filter((t) => !t.done).length;
  return (
    <Card>
      <CardHead title="My tasks" sub={left ? `${left} to do · overdue ones on top` : 'All done for today'} icon={I.ListTodo}
        action={<Button size="sm" variant="soft" icon={I.Plus} onClick={() => setAdd(true)}>Add task</Button>} />
      <div className={cx('px-5 pb-2', !full && 'hidden')}>
        <div role="tablist" className="inline-flex p-1 rounded-xl bg-sunken gap-1">
          {[['mine', 'My tasks', list.length], ['given', 'Given by me', mine.length]].map(([v, l, c]) => (
            <button key={v} role="tab" aria-selected={tab === v} onClick={() => setTab(v)}
              className={cx('h-8 px-3 rounded-lg text-[13px] font-semibold inline-flex items-center gap-1.5', tab === v ? 'bg-surface shadow-card text-ink' : 'text-ink2')}>{l}<span className="text-ink3 text-[11.5px] tnum">{c}</span></button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 pb-5 pt-2 text-[13.5px] text-ink3">You have not given anyone a task. Use “Add task” and pick a person.</p>
      ) : (
        <ul className="px-2 pb-2">
          {rows.map((t) => (
            <li key={t.title} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/70">
              {tab === 'mine' ? <Checkbox checked={!!t.done} onChange={() => toggle(t)} label={`Done: ${t.title}`} /> : <Avatar name={t.to2 || 'Staff'} size={30} />}
              <div className="min-w-0 flex-1">
                <p className={cx('text-[14.5px] font-semibold leading-snug', t.done && 'line-through text-ink3 font-medium')}>{t.title}</p>
                <p className={cx('text-[12.5px]', t.over && !t.done ? 'text-bad font-semibold' : 'text-ink3')}>{t.over && !t.done ? 'Overdue · ' : ''}{t.due}{t.by ? ` · from ${t.by}` : ''}{t.to2 ? ` · given to ${t.to2}` : ''}</p>
              </div>
              {!t.done && t.to && open(t.to) && (
                <Button size="sm" variant="ghost" className="shrink-0 !px-2.5" onClick={() => goTo(go, t.to)} iconRight={I.ChevronRight}><span className="hidden @sm:inline">{t.action || 'Open'}</span></Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <FormSheet open={add} onClose={() => { setAdd(false); setErr(''); }} title="Add task" sub="Only the task is needed. A reminder goes out before it is due." submitLabel="Add task"
        onSubmit={() => {
          if (!title.trim()) { setErr('Write what needs doing'); return false; }
          const t = { title: title.trim(), due: 'Due Mon 12 Oct, 10:00 AM' };
          setList((x) => [t, ...x]); setTitle(''); setErr(''); setTab('mine');
          toast({ title: 'Task added', body: 'Reminder on Sun 11 Oct and on Monday morning.' });
        }}>
        <Field label="Task" required id="task-title" error={err}><Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="For example, check PTM slots for Saturday" maxLength={150} error={!!err} /></Field>
        <Field label="Assign to" id="task-who" hint={full ? 'You can give tasks to any staff member' : 'You can give tasks only to yourself'}>
          <Select id="task-who" value="me" onChange={() => {}} options={[{ value: 'me', label: `Me (${role.person.name})` }]} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Due date" id="task-date"><Input id="task-date" defaultValue="12-10-2026" placeholder="DD-MM-YYYY" /></Field>
          <Field label="Time" id="task-time"><Input id="task-time" defaultValue="10:00 AM" /></Field>
        </div>
      </FormSheet>
    </Card>
  );
}

/* ---------- Today and next ---------- */
const DOT = { brand: 'bg-brand ring-brand/15', warn: 'bg-warn ring-warn/15', info: 'bg-info ring-info/15', bad: 'bg-bad ring-bad/15', ok: 'bg-ok ring-ok/15' };
function Today({ items, birthdays }) {
  const { go } = useNav();
  const open = useOpen();
  return (
    <Card>
      <CardHead title="Today and next" icon={I.CalendarDays} action={open('events.calendar') ? <button onClick={() => go('events', { page: 'calendar' })} className="text-[13px] font-semibold text-brand hover:underline whitespace-nowrap">Calendar</button> : null} />
      <ol className="px-5 pb-2 flex flex-col">
        {items.map((e, i) => {
          const can = open(e.to);
          const B = can ? 'button' : 'span';
          return (
            <li key={i} className="grid grid-cols-[52px_14px_1fr] gap-2.5">
              <span className="text-[13px] font-semibold tnum text-ink2 pt-0.5">{e.time}</span>
              <span className="flex flex-col items-center">
                <span className={cx('w-2.5 h-2.5 rounded-full mt-1.5 ring-4', DOT[e.tone || 'brand'])} />
                {i < items.length - 1 && <span className="flex-1 w-px bg-line my-1" />}
              </span>
              <B onClick={can ? () => goTo(go, e.to) : undefined} className={cx('pb-4 text-left min-w-0', can && 'group')}>
                <span className={cx('block text-[14px] font-semibold leading-tight', can && 'group-hover:text-brand')}>{e.title}</span>
                <span className="block text-[12.5px] text-ink3">{e.where}</span>
              </B>
            </li>
          );
        })}
      </ol>
      {birthdays?.length > 0 && (
        <div className="mx-5 mb-5 rounded-xl bg-sunken/70 p-3">
          <p className="text-[12.5px] font-semibold text-ink2 flex items-center gap-1.5 mb-1.5"><I.Cake size={15} className="text-brand" />Birthdays this week</p>
          <ul className="flex flex-col gap-1 text-[13px]">
            {birthdays.map(([n, w]) => <li key={n} className="flex justify-between gap-3"><span className="truncate">{n}</span><span className="text-ink3 shrink-0">{w}</span></li>)}
          </ul>
        </div>
      )}
    </Card>
  );
}

/* ---------- Quick actions, as on the approved Dashboard ---------- */
function QuickScroller() {
  const { go } = useNav();
  const { role, modulesOn } = useRole();
  const q = quickFor(role, modulesOn);
  if (!q.length) return null;
  return (
    <div className="@xl:hidden -mx-4 px-4 overflow-x-auto no-scrollbar">
      <div className="flex gap-2 w-max">
        {q.map((x) => (
          <button key={x.id + x.label} onClick={() => goTo(go, x.id)} className="flex items-center gap-2 h-11 pl-2 pr-4 rounded-full bg-surface border border-line text-[14px] font-semibold shadow-card">
            <span className="w-8 h-8 rounded-full bg-brand/10 text-brand grid place-items-center"><x.icon size={16} /></span>{x.label}
          </button>
        ))}
      </div>
    </div>
  );
}
function QuickCard() {
  const { go } = useNav();
  const { role, modulesOn } = useRole();
  const q = quickFor(role, modulesOn);
  if (!q.length) return null;
  return (
    <Card className="hidden @xl:block">
      <CardHead title="Quick actions" />
      <div className="grid grid-cols-2 gap-2 px-4 pb-4">
        {q.map((x) => (
          <button key={x.id + x.label} onClick={() => goTo(go, x.id)} className="flex flex-col items-start gap-2 p-3 rounded-xl bg-sunken/70 hover:bg-brand/8 hover:text-brand transition text-left">
            <x.icon size={20} className="text-brand" />
            <span className="text-[13.5px] font-semibold leading-tight">{x.label}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

/* ---------- Approvals waiting (roles that approve) ---------- */
function ApprovalsCard() {
  const { role } = useRole();
  const toast = useToast();
  const [list, setList] = useState(APPROVALS_BY_ROLE[role.id] || []);
  if (!(APPROVALS_BY_ROLE[role.id] || []).length) return null;
  const decide = (a, ok) => {
    setList((x) => x.filter((y) => y !== a));
    toast({ title: `${ok ? 'Approved' : 'Declined'}: ${a.kind.toLowerCase()} for ${a.who.split(' (')[0].split(',')[0]}`, body: ok ? 'They have been told.' : 'They will see your reason.', undo: () => setList((x) => [a, ...x]) });
  };
  return (
    <Card>
      <CardHead title="Waiting for your approval" icon={I.ListChecks} action={<Pill tone="info">{list.length}</Pill>} />
      {list.length === 0 ? (
        <div className="px-5 pb-6 pt-1 text-center">
          <span className="mx-auto w-12 h-12 rounded-2xl bg-ok/10 text-ok grid place-items-center animate-pop"><I.Check size={24} strokeWidth={2.6} /></span>
          <p className="font-semibold mt-2.5">All done</p>
          <p className="text-[13px] text-ink3">Nothing is waiting for you.</p>
        </div>
      ) : (
        <ul className="px-3 pb-3 flex flex-col gap-1">
          {list.map((a) => (
            <li key={a.who + a.what} className="p-2.5 rounded-xl hover:bg-sunken/70">
              <div className="flex items-start gap-3">
                <Avatar name={a.who} size={34} />
                <div className="min-w-0 flex-1"><p className="text-[13.5px] font-semibold leading-snug">{a.who}</p><p className="text-[12.5px] text-ink3">{a.what}</p></div>
              </div>
              <div className="flex gap-2 mt-2 pl-[46px]">
                <Button size="sm" variant="soft" icon={I.Check} onClick={() => decide(a, true)}>Approve</Button>
                <Button size="sm" variant="ghost" onClick={() => decide(a, false)}>Decline</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------- A simple list card (rows open their page) ---------- */
function ListCard({ title, sub, icon, action, rows, foot }) {
  const { go } = useNav();
  const open = useOpen();
  return (
    <Card>
      <CardHead title={title} sub={sub} icon={icon} action={action} />
      <ul className="px-2 pb-2">
        {rows.map((r) => {
          const Ic = typeof r.icon === 'string' ? I[r.icon] : r.icon;
          const can = r.onClick || open(r.to);
          const B = can ? 'button' : 'div';
          return (
            <li key={r.title + (r.sub || '')}>
              <B onClick={can ? r.onClick || (() => goTo(go, r.to)) : undefined} className={cx('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left', can && 'hover:bg-sunken/70 transition')}>
                {r.avatar ? <Avatar name={r.avatar} size={38} /> : Ic ? <span className={cx('w-10 h-10 rounded-xl grid place-items-center shrink-0', TONE_SOFT[r.tone || 'neutral'])}><Ic size={19} /></span> : null}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[14.5px] leading-snug truncate">{r.title}</p>
                  {r.sub && <p className="text-[12.5px] text-ink3 truncate">{r.sub}</p>}
                  {r.bar != null && <Progress value={r.bar} tone={r.bar < 50 ? 'warn' : 'brand'} className="mt-1.5" />}
                </div>
                {r.right && <div className="shrink-0 text-right">{r.right}</div>}
              </B>
            </li>
          );
        })}
      </ul>
      {foot}
    </Card>
  );
}

/* ---------- "In this period": the person's own numbers over any dates ---------- */
// rows: [label, perSchoolDay, kind] where kind is 'money', 'pct' (a rate that does not add up) or a plain count
function PeriodCard({ title, sub, icon = 'CalendarRange', to, rows, def = 'thismonth' }) {
  const { go } = useNav();
  const open = useOpen();
  const [per, setPer] = useState(PERIODS[def]);
  const one = per.from === per.to;
  const days = one ? 1 : Math.max(1, Math.round((periodDays(per) * 5.5) / 7));
  const jit = (i) => { let h = 3; for (const c of per.from + per.to) h = (h * 31 + c.charCodeAt(0)) % 101; return ((h + i * 7) % 5) - 2; };
  const val = ([, v, kind], i) => (kind === 'pct' ? `${Math.min(99, v + (one ? 0 : jit(i)))}%` : kind === 'money' ? inr(Math.round(v * days)) : Math.round(v * days).toLocaleString('en-IN'));
  const Ic = I[icon] || I.CalendarRange;
  return (
    <Card>
      <CardHead title={title} sub={sub} icon={Ic}
        action={to && open(to) ? <button onClick={() => goTo(go, to)} className="text-[13px] font-semibold text-brand hover:underline whitespace-nowrap">Open</button> : null} />
      <div className="px-5 pb-2"><DatePeriod id={'home-period'} size="sm" value={per} onChange={setPer} className="w-full" /></div>
      <p className="px-5 pb-1 text-[12.5px] text-ink3 tnum">Showing: {per.label} · {fmtRange(per)}</p>
      <div className="px-5 pb-4">
        {rows.map((r, i) => (
          <div key={r[0]} className="flex justify-between gap-3 py-1.5 text-[14px] border-b border-line/60 last:border-0">
            <span className="text-ink3">{r[0]}</span><b className="font-semibold tnum">{val(r, i)}</b>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ---------- Today's classes (teachers see these first on a phone) ---------- */
function TodayClasses({ rows, taken, title = 'My classes today', sub }) {
  const { go } = useNav();
  const open = useOpen();
  const canTake = open('attendance.take');
  return (
    <Card>
      <CardHead title={title} sub={sub || `Friday · ${rows.length} periods from your Time Table`} icon={I.CalendarRange}
        action={open('academic.timetable') ? <button onClick={() => go('academic', { page: 'timetable' })} className="text-[13px] font-semibold text-brand hover:underline whitespace-nowrap">Time Table</button> : null} />
      <ul className="px-2 pb-2 flex flex-col gap-0.5">
        {rows.map((r) => {
          const done = taken.has(r.id);
          const past = r.past && !done;
          return (
            <li key={r.id} className={cx('flex items-center gap-3 px-3 py-2.5 rounded-xl', r.now ? 'bg-brand/[.06] ring-1 ring-brand/25' : 'hover:bg-sunken/70')}>
              <span className="w-11 text-center shrink-0">
                <span className="block text-[11px] text-ink3 font-semibold">P{r.p}</span>
                <span className="block text-[13px] font-semibold tnum">{r.t}</span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[14.5px] truncate">{r.cls} <span className="text-ink3 font-normal">· {r.sub}</span></p>
                <p className={cx('text-[12.5px] truncate', r.subst ? 'text-warn font-semibold' : 'text-ink3')}>{r.now ? 'Now · ' : ''}{r.room}{r.subst ? ` · ${r.subst}` : ''}</p>
              </div>
              {done ? <Pill tone="ok" className="shrink-0"><I.Check size={13} strokeWidth={3} />Taken</Pill>
                : canTake && <Button size="sm" variant={r.now || past ? 'primary' : 'secondary'} className="shrink-0" onClick={() => go('attendance', { page: 'take' })}><span className="@sm:hidden">Take</span><span className="hidden @sm:inline">Take attendance</span></Button>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ---------- The page: same structure as the approved Dashboard ---------- */
function HomeLayout({ cfg }) {
  const { role } = useRole();
  const { go } = useNav();
  const open = useOpen();
  const shown = useShown();
  const band = cfg.band.filter(shown).map((b) => ({ label: b.label, big: b.big, foot: b.foot, onClick: open(b.to) ? () => goTo(go, b.to) : undefined }));
  return (
    <div className="flex flex-col gap-5 @lg:gap-6">
      <Greeting first={role.person.first} action={cfg.action && open(cfg.action.to) ? <Button variant="primary" icon={cfg.action.icon} onClick={() => goTo(go, cfg.action.to)}>{cfg.action.label}</Button> : null} />
      {cfg.first && <div className="@md:hidden">{cfg.first}</div>}
      {cfg.banner}
      {band.length >= 2 && <Band items={band} />}
      <QuickScroller />
      <div className="grid grid-cols-1 @xl:grid-cols-[minmax(0,1fr)_340px] gap-5 @lg:gap-6 items-start">
        <div className="flex flex-col gap-5 @lg:gap-6 min-w-0">
          {cfg.first && <div className="hidden @md:block">{cfg.first}</div>}
          <Attention items={cfg.attention.filter(shown)} />
          {cfg.main}
          <Tasks items={cfg.tasks.filter(shown)} given={cfg.given} />
        </div>
        <div className="flex flex-col gap-5 @lg:gap-6 min-w-0">
          <QuickCard />
          <ApprovalsCard />
          <Today items={cfg.today.filter(shown)} birthdays={cfg.birthdays} />
          {cfg.period && (!cfg.period.to || shown({ to: cfg.period.to })) && <PeriodCard {...cfg.period} />}
          {cfg.side}
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   One home per role. Each person sees only their own numbers and work.
   ===================================================================== */
const IMRAN_DAY = [
  { id: 'p1', p: 1, t: '8:45', cls: '6 A', sub: 'Mathematics', room: 'Room 106', past: true },
  { id: 'p2', p: 2, t: '9:30', cls: '7 A', sub: 'Mathematics', room: 'Room 203', past: true },
  { id: 'p3', p: 3, t: '10:30', cls: '6 B', sub: 'Mathematics', room: 'Room 107', now: true },
  { id: 'p4', p: 4, t: '11:15', cls: '7 B', sub: 'Mathematics', room: 'Room 204' },
  { id: 'p5', p: 5, t: '12:40', cls: '8 A', sub: 'English', room: 'Room 205', subst: 'Substitution for Anitha Kumari' },
  { id: 'p7', p: 7, t: '2:20', cls: '6 A', sub: 'Maths remedial', room: 'Room 106' },
];
const RAVI_DAY = [
  { id: 'r1', p: 1, t: '8:45', cls: '7 B', sub: 'Science · class period', room: 'Room 204', past: true },
  { id: 'r3', p: 3, t: '10:30', cls: '7 A', sub: 'Science', room: 'Room 203', now: true },
  { id: 'r4', p: 4, t: '11:15', cls: '8 B', sub: 'Science', room: 'Room 208' },
  { id: 'r6', p: 6, t: '1:25', cls: '7 B', sub: 'Science lab', room: 'Science lab, Block B' },
  { id: 'r8', p: 8, t: '3:05', cls: '8 B', sub: 'Science', room: 'Room 208' },
];

const HOMES = {
  accountant: () => ({
    period: { title: 'Money in this period', sub: 'Fees in, money out', icon: 'Wallet', to: 'fees.reports', rows: [['Fees collected', 118400, 'money'], ['Payments', 32], ['Expenses paid', 14500, 'money'], ['Concessions given', 2100, 'money']] },
    action: { label: 'Collect fee', icon: I.IndianRupee, to: 'fees.collect' },
    band: [
      { label: 'Collected today', big: '₹1,42,500', foot: '38 payments · 21 by UPI', to: 'fees.dashboard' },
      { label: 'Cheques to verify', big: '3', foot: '₹41,000 · oldest from 7 Oct', to: 'fees.dashboard' },
      { label: 'Defaulters', big: '61', foot: '₹8.4 L overdue · 18 over 30 days', to: 'fees.defaulters' },
      { label: 'Day Book', big: 'Not closed', foot: '8 Oct · ₹38,400 cash to count', to: 'finance.daybook' },
    ],
    attention: [
      { tone: 'bad', icon: 'BookOpen', title: 'Day Book for 8 Oct is not closed', detail: 'Cash in hand ₹38,400 is waiting to be counted and locked', action: 'Close the day', to: 'finance.daybook' },
      { tone: 'warn', icon: 'Landmark', title: '3 cheques to verify', detail: 'Rohan Gupta (6 A) ₹15,000 · Kavya Rao (5 A) ₹14,000 · 1 more', action: 'Verify', to: 'fees.dashboard' },
      { tone: 'warn', icon: 'UserX', title: 'Q3 tuition is due tomorrow', detail: '412 families have not paid yet. Reminder last sent 5 Oct.', action: 'Send reminder', to: 'fees.defaulters' },
      { tone: 'info', icon: 'ArrowRightLeft', title: '2 Razorpay payments to match', detail: 'Settlement of ₹1,12,400 on 8 Oct has 2 payments not matched', action: 'Match', to: 'finance.cashbank' },
      { tone: 'info', icon: 'ReceiptText', title: 'Bill missing for an approved expense', detail: 'Lab chemicals ₹18,600 · approved by the Principal 7 Oct', action: 'Add bill', to: 'finance.expenses' },
    ],
    tasks: [
      { title: 'Count cash and close the Day Book for 8 Oct', due: 'Was due yesterday, 6:00 PM', over: true, to: 'finance.daybook', action: 'Day Book' },
      { title: 'September fee report for the Principal', due: 'Today, 4:00 PM', by: 'Lakshmi Rao', to: 'fees.reports', action: 'Reports' },
      { title: 'Refund for Rohan Gupta (leaving, TC applied)', due: 'Mon 12 Oct', to: 'fees.concessions', action: 'Refunds' },
      { title: 'Record salary advance for Mallesh Kumar', due: 'Mon 12 Oct', by: 'Anita Sharma', to: 'salary.advances', action: 'Advances' },
      { title: 'Generate October salary', due: 'Wed 28 Oct', to: 'salary.generate', action: 'Salary' },
    ],
    today: [
      { time: '11:00', title: 'Bank deposit: cash ₹38,400', where: 'HDFC Bank, Kukatpally branch', tone: 'brand', to: 'finance.cashbank' },
      { time: '1:00', title: 'Razorpay settlement ₹1,12,400', where: 'Into HDFC ••7730', tone: 'info', to: 'finance.cashbank' },
      { time: '3:00', title: 'Staff meeting', where: 'Principal’s room', tone: 'info' },
      { time: 'Sat', title: 'Q3 tuition due date', where: 'All classes · late fee from 11 Oct', tone: 'warn', to: 'fees.defaulters' },
      { time: 'Thu', title: 'Exam fee due (half-yearly)', where: 'Classes 6–10 · ₹1,200 each', tone: 'bad', to: 'fees.dashboard' },
    ],
    main: <RecentPayments />,
    side: <MoneyToday />,
  }),

  teacher: ({ taken }) => ({
    period: { title: 'My teaching in this period', sub: 'Your classes and subjects only', icon: 'NotebookPen', to: 'homework.homework', rows: [['Periods taught', 6], ['Attendance taken', 5], ['Homework given', 2], ['Homework checked', 38]] },
    action: { label: 'Take attendance', icon: I.CalendarCheck2, to: 'attendance.take' },
    first: <TodayClasses rows={IMRAN_DAY} taken={taken} />,
    band: [
      { label: 'Classes today', big: '6', foot: 'Next: 7 B at 11:15', to: 'academic.timetable' },
      { label: 'Attendance taken', big: <>2<span className="text-[0.55em] opacity-90 font-medium"> / 6</span></>, foot: '6 B is waiting now', to: 'attendance.take' },
      { label: 'Homework to check', big: '14', foot: 'Maths 6 A · Exercise 4.1', to: 'homework.submissions' },
      { label: 'Parent messages', big: '3', foot: '2 about the half-yearly', to: 'communication.inbox' },
    ],
    attention: [
      { tone: 'warn', icon: 'ArrowRightLeft', title: 'Substitution today: 8 A, period 5 (English)', detail: 'Anitha Kumari is on leave. Her lesson plan is attached.', action: 'Time Table', to: 'academic.timetable' },
      { tone: 'info', icon: 'NotebookPen', title: '14 homework submissions to check', detail: 'Maths 6 A · Exercise 4.1 · due back tomorrow', action: 'Check', to: 'homework.submissions' },
      { tone: 'bad', icon: 'TrendingDown', title: '3 students in 7 A below 40% in Unit Test 2', detail: 'Rahul Verma, Sneha Das, Yash Kumar', action: 'See students', to: 'reports.warnings' },
      { tone: 'info', icon: 'ClipboardCheck', title: 'Half-yearly marks entry opens 17 Oct', detail: 'Mathematics · 6 A, 6 B, 7 A, 7 B · locks 24 Oct', action: 'Marks', to: 'exams.marks' },
    ],
    tasks: [
      { title: 'Check Exercise 4.1 · 6 A', due: 'Today', to: 'homework.submissions', action: 'Check' },
      { title: 'Give homework for 7 B (Chapter 5: Lines and angles)', due: 'Today, after period 4', to: 'homework.homework', action: 'Give' },
      { title: 'Lesson plan: Chapter 6, Class 6', due: 'Sat 10 Oct', by: 'Meena Pillai', to: 'academic.syllabus', action: 'Plan' },
      { title: 'Reply to Priya Sharma about Aarav’s Maths', due: 'Today', to: 'communication.inbox', action: 'Reply' },
      { title: 'Set PTM slots for Sat 17 Oct', due: 'Wed 14 Oct', by: 'Srinivas Murthy', to: 'events.ptm', action: 'PTM' },
    ],
    today: [
      { time: '11:15', title: '7 B · Mathematics', where: 'Room 204 · Chapter 5', tone: 'brand', to: 'academic.timetable' },
      { time: '12:40', title: 'Substitution: 8 A English', where: 'Room 205 · for Anitha Kumari', tone: 'warn', to: 'academic.timetable' },
      { time: '3:00', title: 'Staff meeting', where: 'Principal’s room', tone: 'info' },
      { time: 'Mon', title: 'Invigilation: English, 6 B', where: 'Half-yearly · Room 107 · 9:00 AM', tone: 'bad', to: 'exams.datesheet' },
      { time: 'Sat 17', title: 'PTM', where: '9:30 AM–12:30 PM · your 4 classes', tone: 'brand', to: 'events.ptm' },
    ],
    birthdays: [['Kavya Rao, 6 B', 'Sat 10 Oct'], ['Usha Rani (staff)', 'Tue 13 Oct']],
    side: <SyllabusCard rows={[{ k: '6 A', v: 62 }, { k: '6 B', v: 58 }, { k: '7 A', v: 64 }, { k: '7 B', v: 66 }]} sub="Mathematics · on track for the half-yearly" />,
  }),

  classteacher: ({ taken }) => ({
    period: { title: '7 B in this period', sub: 'Your class only', icon: 'GraduationCap', to: 'attendance.register', rows: [['Attendance', 95, 'pct'], ['Absences', 2], ['Late arrivals', 1], ['Leave days recorded', 0.6]] },
    action: { label: 'Take attendance', icon: I.CalendarCheck2, to: 'attendance.take' },
    first: <TodayClasses rows={RAVI_DAY} taken={taken} />,
    band: [
      { label: '7 B today', big: 'Not taken', foot: '38 students · locks 11:00 AM', to: 'attendance.take' },
      { label: 'Leave requests', big: '2', foot: 'Aarav Sharma, Harini Reddy', to: 'attendance.leave' },
      { label: 'Homework to check', big: '22', foot: 'Science 8 B · Worksheet 3', to: 'homework.submissions' },
      { label: 'Report card remarks', big: <>0<span className="text-[0.55em] opacity-90 font-medium"> / 38</span></>, foot: 'Due 20 Oct', to: 'exams.reportcards' },
    ],
    attention: [
      { tone: 'bad', icon: 'CalendarCheck2', title: 'Take attendance for 7 B', detail: 'Locks at 11:00 AM · 1 student on approved leave', action: 'Take now', to: 'attendance.take' },
      { tone: 'info', icon: 'CalendarDays', title: '2 leave requests from 7 B parents', detail: 'Priya Sharma for Aarav (Mon 12 Oct) · Kumar Reddy for Harini (13–14 Oct)', action: 'Review', to: 'attendance.leave' },
      { tone: 'warn', icon: 'UserX', title: 'Kabir Das absent 3 days in a row', detail: '6, 7 and 8 Oct · no leave asked', action: 'Open', to: 'attendance.register' },
      { tone: 'warn', icon: 'BadgeCheck', title: '2 guardians in 7 B have not given data consent', detail: 'Send the consent request through Parent Link', action: 'See list', to: 'students.list' },
    ],
    tasks: [
      { title: 'Take attendance for 7 B', due: 'Today, by 11:00 AM', to: 'attendance.take', action: 'Take' },
      { title: 'Decide 2 leave requests', due: 'Today', to: 'attendance.leave', action: 'Leave' },
      { title: 'Call Kabir Das’s parents', due: 'Today', to: 'students.list', action: 'Profile' },
      { title: 'Write report card remarks for 7 B', due: 'Tue 20 Oct', by: 'Meena Pillai', to: 'exams.reportcards', action: 'Remarks' },
      { title: 'Science Unit Test 2 marks for 8 B', due: 'Was due 7 Oct', over: true, to: 'exams.marks', action: 'Marks' },
    ],
    today: [
      { time: '10:30', title: '7 A · Science', where: 'Room 203 · now', tone: 'brand', to: 'academic.timetable' },
      { time: '11:00', title: '7 B attendance locks', where: 'Mark it before then', tone: 'bad', to: 'attendance.take' },
      { time: '1:25', title: '7 B · Science lab', where: 'Light and shadows practical', tone: 'brand' },
      { time: 'Mon', title: 'Half-yearly exams start', where: '7 B in Room 204 · English first', tone: 'bad', to: 'exams.datesheet' },
      { time: 'Sat 17', title: 'PTM for 7 B', where: '9:30 AM–12:30 PM · 38 slots', tone: 'brand', to: 'events.ptm' },
    ],
    birthdays: [['Diya Reddy, 7 B', 'Sun 11 Oct'], ['Rohan Naidu, 7 B', 'Wed 14 Oct'], ['Priya Sharma (Aarav’s mother)', 'Thu 15 Oct']],
    side: <MyClassCard />,
  }),

  receptionist: () => ({
    period: { title: 'Front desk in this period', icon: 'DoorOpen', to: 'frontoffice.visitors', rows: [['Visitors', 24], ['Admission enquiries', 4], ['Early pickups', 3], ['Post and deliveries', 6]] },
    action: { label: 'Add visitor', icon: I.IdCard, to: 'frontoffice.visitors' },
    band: [
      { label: 'Visitors in building', big: '6', foot: '1 waiting for the Principal', to: 'frontoffice.visitors' },
      { label: 'Appointments today', big: '4', foot: 'Next: 10:30 with the Principal', to: 'frontoffice.appointments' },
      { label: 'Early pickups', big: '3', foot: 'Gate passes for today', to: 'frontoffice.pickup' },
      { label: 'New enquiries', big: '5', foot: '2 walk-in · 3 website', to: 'admissions.enquiries' },
    ],
    attention: [
      { tone: 'warn', icon: 'Clock', title: 'Mr. Prakash Reddy is waiting since 10:20', detail: 'To meet the Principal · 10:30 appointment', action: 'Tell the Principal', to: 'frontoffice.visitors' },
      { tone: 'warn', icon: 'Package', title: 'Courier for Accounts not collected', detail: 'Blue Dart · arrived yesterday 3:10 PM', action: 'Open', to: 'frontoffice.postal' },
      { tone: 'info', icon: 'DoorOpen', title: '2 visitors not checked out yesterday', detail: 'Plumber (Block B) and a parent, Lavanya Rao', action: 'Check out', to: 'frontoffice.visitors' },
      { tone: 'info', icon: 'PhoneCall', title: '3 enquiry follow-up calls due today', detail: 'Nursery 2027–28 · Swathi Varma and 2 more', action: 'Call', to: 'admissions.enquiries' },
    ],
    tasks: [
      { title: 'Call back Swathi Varma about Nursery 2027–28', due: 'Today, 12:00 PM', to: 'admissions.enquiries', action: 'Enquiry' },
      { title: 'Book a school tour for the Rao family', due: 'Today', to: 'frontoffice.appointments', action: 'Book' },
      { title: 'Log speed post from the CBSE regional office', due: 'Today', to: 'frontoffice.postal', action: 'Log' },
      { title: 'Visitor passes for PTM, Sat 17 Oct', due: 'Thu 15 Oct', by: 'Anita Sharma', to: 'frontoffice.appointments', action: 'Plan' },
    ],
    today: [
      { time: '10:30', title: 'Mr. Prakash Reddy → Principal', where: 'Waiting in the lobby', tone: 'warn', to: 'frontoffice.appointments' },
      { time: '11:30', title: 'PTM for Classes 1–3', where: 'Assembly hall · about 90 parents', tone: 'brand' },
      { time: '12:15', title: 'Early pickup: Diya Menon, UKG B', where: 'Mother · doctor visit · pass GP-0912', tone: 'info', to: 'frontoffice.pickup' },
      { time: '2:00', title: 'Sri Sai Uniforms → School Admin', where: 'Uniform samples for 2027–28', tone: 'info', to: 'frontoffice.appointments' },
      { time: '3:30', title: 'School tour: Rao family', where: 'Nursery enquiry', tone: 'brand', to: 'frontoffice.appointments' },
    ],
    main: <VisitorsCard />,
  }),

  transport: () => ({
    period: { title: 'Trips in this period', icon: 'Bus', to: 'transport.reports', rows: [['Trips run', 36], ['Late trips', 0.6], ['On time', 98, 'pct'], ['Kilometres', 420]] },
    action: { label: 'See live buses', icon: I.Bus, to: 'transport.live' },
    band: [
      { label: 'Morning trips', big: <>18<span className="text-[0.55em] opacity-90 font-medium"> / 18</span></>, foot: 'Done · 1 late (Bus 3, 14 min)', to: 'transport.trips' },
      { label: 'On buses today', big: '251', foot: '6 routes · 9 buses', to: 'transport.students' },
      { label: 'Afternoon trips', big: '3:50 PM', foot: '9 buses · drivers checked in', to: 'transport.live' },
      { label: 'Papers expiring', big: '2', foot: 'Bus 5 insurance on 21 Oct', to: 'transport.vehicles' },
    ],
    attention: [
      { tone: 'bad', icon: 'FileWarning', title: 'Bus 5 insurance ends in 12 days', detail: 'TS 08 UC 4410 · renew by 21 Oct', action: 'Renew', to: 'transport.vehicles' },
      { tone: 'warn', icon: 'Clock', title: 'Bus 3 was 14 minutes late this morning', detail: 'Route 3 Bachupally · traffic at Pragathi Nagar · 38 parents told', action: 'See trip', to: 'transport.trips' },
      { tone: 'warn', icon: 'IdCard', title: 'Driver Srisailam’s licence renewal due', detail: 'Expires 30 Oct · Bus 3', action: 'Open', to: 'transport.vehicles' },
      { tone: 'info', icon: 'MapPin', title: '4 new students have no stop', detail: 'Admitted this week · Routes 2 and 4 are closest', action: 'Assign', to: 'transport.students' },
    ],
    tasks: [
      { title: 'Renew Bus 5 insurance', due: 'Wed 21 Oct', to: 'transport.vehicles', action: 'Vehicle' },
      { title: 'Change Aarav Sharma’s stop to KPHB 6th Phase', due: 'Today', by: 'Anita Sharma', to: 'transport.students', action: 'Student' },
      { title: 'Message Route 3 parents about exam-day timings', due: 'Sat 10 Oct', to: 'communication.send', action: 'Message' },
      { title: 'Bus 2 fitness test at RTA Kondapur', due: 'Sat 10 Oct, 10:00 AM', to: 'transport.vehicles', action: 'Vehicle' },
    ],
    today: [
      { time: '3:50', title: 'Afternoon trips start', where: '9 buses · 251 students', tone: 'brand', to: 'transport.live' },
      { time: 'Sat', title: 'Bus 2 fitness test', where: 'RTA Kondapur · 10:00 AM', tone: 'warn', to: 'transport.vehicles' },
      { time: 'Mon', title: 'Exam-day timings', where: 'Buses leave school at 12:45 PM', tone: 'bad', to: 'transport.trips' },
      { time: '19–25', title: 'Dussehra holidays', where: 'No trips · reopens Mon 26 Oct', tone: 'info' },
    ],
    main: <BusesCard />,
  }),

  librarian: () => ({
    period: { title: 'Library in this period', icon: 'BookOpen', to: 'library.reports', rows: [['Books issued', 42], ['Books returned', 38], ['New members', 1.2], ['Fines collected', 160, 'money']] },
    action: { label: 'Issue a book', icon: I.ArrowRightLeft, to: 'library.issue' },
    band: [
      { label: 'Due back today', big: '17', foot: '9 students, 8 classes', to: 'library.issue' },
      { label: 'Overdue', big: '23', foot: 'Reminders went on WhatsApp', to: 'library.issue' },
      { label: 'Issued today', big: '42', foot: '31 returned so far', to: 'library.issue' },
      { label: 'Fines to collect', big: '₹1,840', foot: '11 members', to: 'library.fines' },
    ],
    attention: [
      { tone: 'warn', icon: 'BookOpen', title: '23 books overdue this week', detail: 'Reminders sent · 6 are more than 14 days late', action: 'See list', to: 'library.issue' },
      { tone: 'info', icon: 'BookPlus', title: 'Book request: “Wings of Fire”', detail: 'From Kavya Rao, 5 A · 2 copies are on loan', action: 'Reserve', to: 'library.books' },
      { tone: 'info', icon: 'ListChecks', title: 'Stock check of shelf F3 not finished', detail: '212 of 340 books scanned', action: 'Continue', to: 'library.fines' },
      { tone: 'warn', icon: 'TriangleAlert', title: '6 damaged books waiting to be written off', detail: 'Reported this month', action: 'Review', to: 'library.fines' },
    ],
    tasks: [
      { title: 'Add 40 new books from Sri Rama Book House', due: 'Today', to: 'library.books', action: 'Books' },
      { title: 'Print library cards for 34 new admissions', due: 'Mon 12 Oct', by: 'Anita Sharma', to: 'library.members', action: 'Cards' },
      { title: 'Library report for September', due: 'Was due 5 Oct', over: true, to: 'library.reports', action: 'Reports' },
    ],
    today: [
      { time: '11:15', title: 'Class 5 A library period', where: '36 students · story books', tone: 'brand' },
      { time: '1:25', title: 'Class 3 B story hour', where: 'Reading corner', tone: 'brand' },
      { time: '2:20', title: 'Class 7 B library period', where: 'Reference section', tone: 'brand' },
      { time: 'Mon', title: 'Exam days: open 12:30–3:00 PM', where: 'Half-yearly, 12–27 Oct', tone: 'info' },
    ],
    main: <ListCard title="Due back today" sub="Students and staff with books due today" icon={I.CornerDownLeft}
      rows={[['Kavya Rao', '5 A', 'Malgudi Days'], ['Harsha Naidu', '8 B', 'Wings of Fire'], ['Tanvi Gupta', '6 A', 'The Jungle Book'], ['Karthik Menon', 'Staff', 'Teaching Computers, Std 8'], ['Riya Chowdary', '9 C', 'Ignited Minds']].map(([n, c, b]) => ({ avatar: n, title: n, sub: `${c} · ${b}`, to: 'library.issue', right: <span className="text-[12.5px] text-ink3">Due today</span> }))} />,
  }),

  warden: () => ({
    period: { title: 'Hostel in this period', sub: 'Boys’ hostel only', icon: 'BedDouble', to: 'hostel.reports', rows: [['Roll call present', 98, 'pct'], ['Outings', 1.5], ['Incidents', 0.4], ['Parent visits', 3]] },
    action: { label: 'Night roll call', icon: I.ListChecks, to: 'hostel.rollcall' },
    band: [
      { label: 'Boarders', big: <>96<span className="text-[0.55em] opacity-90 font-medium"> boys</span></>, foot: '92 in school · 4 away', to: 'hostel.rooms' },
      { label: 'Outing requests', big: '3', foot: 'Weekend · waiting for you', to: 'hostel.outing' },
      { label: 'Last roll call', big: <>94<span className="text-[0.55em] opacity-90 font-medium"> / 96</span></>, foot: '2 late returns (B-12, B-17)', to: 'hostel.rollcall' },
      { label: 'Mess today', big: '96 meals', foot: 'Lunch: veg pulao, dal, curd', to: 'hostel.mess' },
    ],
    attention: [
      { tone: 'warn', icon: 'DoorOpen', title: '3 outing requests waiting', detail: 'Saturday and Sunday outings · parents asked', action: 'Review', to: 'hostel.outing' },
      { tone: 'bad', icon: 'Clock', title: '2 late returns last night', detail: 'Rooms B-12 and B-17 · back at 9:52 PM', action: 'Write incident', to: 'hostel.rollcall' },
      { tone: 'info', icon: 'Stethoscope', title: 'Rahul Verma (8 A) in the sick room', detail: 'Fever since last night · parents told at 7:10 AM', action: 'Open', to: 'hostel.rollcall' },
      { tone: 'info', icon: 'Wrench', title: 'Room B-21 fan not working', detail: 'Reported 8 Oct · maintenance request raised', action: 'Room', to: 'hostel.rooms' },
    ],
    tasks: [
      { title: 'Decide weekend outing requests', due: 'Today, 5:00 PM', to: 'hostel.outing', action: 'Outings' },
      { title: 'Write incident note for B-12 late return', due: 'Today', to: 'hostel.rollcall', action: 'Incident' },
      { title: 'Parent visiting list for Sun 11 Oct', due: 'Sat 10 Oct', to: 'hostel.outing', action: 'Visitors' },
      { title: 'Mess menu for Dussehra week', due: 'Thu 15 Oct', by: 'Anita Sharma', to: 'hostel.mess', action: 'Mess' },
    ],
    today: [
      { time: '4:15', title: 'Boarders back from school', where: 'Sign-in at the hostel gate', tone: 'brand', to: 'hostel.rollcall' },
      { time: '7:00', title: 'Study hour', where: 'Exam revision · Block A hall', tone: 'info' },
      { time: '9:30', title: 'Night roll call', where: 'Boys’ hostel · 96 boarders', tone: 'bad', to: 'hostel.rollcall' },
      { time: 'Sun', title: 'Parent visiting hours', where: '10:00 AM–1:00 PM', tone: 'brand', to: 'hostel.outing' },
    ],
  }),

  storekeeper: () => ({
    period: { title: 'Store in this period', icon: 'Boxes', to: 'inventory.reports', rows: [['Items issued', 35], ['Deliveries received', 1.5], ['Purchase orders', 0.5], ['Repairs closed', 1.2]] },
    action: { label: 'Issue stock', icon: I.PackageMinus, to: 'inventory.issue' },
    band: [
      { label: 'Below reorder level', big: '4', foot: 'A4 paper, chalk, markers, sanitiser', to: 'inventory.items' },
      { label: 'Issue requests', big: '5', foot: '2 from the exam cell', to: 'inventory.issue' },
      { label: 'Goods to receive', big: '2', foot: 'PO-0231 arrives today', to: 'inventory.purchases' },
      { label: 'Maintenance open', big: '6', foot: '1 urgent: Physics lab fan', to: 'inventory.rooms' },
    ],
    attention: [
      { tone: 'bad', icon: 'Package', title: 'Answer booklets short for Monday', detail: '1,800 needed for the half-yearly · 1,250 in stock', action: 'Order', to: 'inventory.purchases' },
      { tone: 'warn', icon: 'PackageMinus', title: '4 items below reorder level', detail: 'A4 paper, chalk, whiteboard markers, sanitiser', action: 'See items', to: 'inventory.items' },
      { tone: 'warn', icon: 'Wrench', title: 'Physics lab fan not working', detail: 'From Farhana Begum · 2 days open', action: 'Assign', to: 'inventory.rooms' },
      { tone: 'info', icon: 'Truck', title: 'PO-0231 arriving today', detail: 'Sri Lakshmi Stationers · 14 items', action: 'Receive', to: 'inventory.purchases' },
    ],
    tasks: [
      { title: 'Issue exam stationery to the exam cell', due: 'Today, 2:00 PM', by: 'Anita Sharma', to: 'inventory.issue', action: 'Issue' },
      { title: 'Raise purchase order for A4 paper (50 reams)', due: 'Today', to: 'inventory.purchases', action: 'PO' },
      { title: 'Yearly asset check, Block B', due: 'Fri 30 Oct', to: 'inventory.assets', action: 'Assets' },
    ],
    today: [
      { time: '11:00', title: 'Delivery: Sri Lakshmi Stationers', where: 'PO-0231 · back gate', tone: 'brand', to: 'inventory.purchases' },
      { time: '2:00', title: 'Issue stationery to the exam cell', where: 'Answer booklets, graph sheets', tone: 'warn', to: 'inventory.issue' },
      { time: 'Mon', title: 'Half-yearly exams start', where: 'Classes 6–10', tone: 'bad' },
    ],
    main: <ListCard title="Below reorder level" sub="Order before they run out" icon={I.PackageMinus}
      rows={[['A4 paper (reams)', 12, 40], ['Chalk (boxes)', 18, 50], ['Whiteboard markers', 22, 60], ['Hand sanitiser (5 L)', 2, 6]].map(([n, h, r]) => ({ icon: 'Package', tone: 'warn', title: n, sub: `${h} left · reorder at ${r}`, bar: (h / r) * 100, to: 'inventory.items' }))} />,
  }),

  academichead: () => ({
    period: { title: 'Teaching in this period', icon: 'BookOpenCheck', to: 'academic.substitutions', rows: [['Substitutions', 3.5], ['Periods covered', 99, 'pct'], ['Homework given', 37], ['Lesson plans checked', 5]] },
    action: { label: 'Arrange substitute', icon: I.ArrowRightLeft, to: 'academic.substitutions' },
    band: [
      { label: 'Periods covered today', big: <>342<span className="text-[0.55em] opacity-90 font-medium"> / 344</span></>, foot: '2 substitutions still open', to: 'academic.substitutions' },
      { label: 'Syllabus done', big: '61%', foot: 'Before the half-yearly: 64% planned', to: 'academic.syllabus' },
      { label: 'Question papers', big: <>34<span className="text-[0.55em] opacity-90 font-medium"> / 40</span></>, foot: '6 not in yet', to: 'exams.papers' },
      { label: 'Homework this week', big: '186', foot: 'Across 43 sections', to: 'homework.homework' },
    ],
    attention: [
      { tone: 'bad', icon: 'ArrowRightLeft', title: '2 periods have no teacher', detail: '9 C period 6 (Hindi) · 10 A period 7 (English)', action: 'Arrange', to: 'academic.substitutions' },
      { tone: 'warn', icon: 'FileText', title: '6 question papers not submitted', detail: 'Hindi 9, Telugu 10 and 4 more · due today', action: 'See list', to: 'exams.papers' },
      { tone: 'warn', icon: 'TrendingDown', title: 'Class 9 Science is 2 chapters behind', detail: 'Planned 7 of 13 · done 5', action: 'Open', to: 'academic.syllabus' },
      { tone: 'info', icon: 'LayoutGrid', title: 'Seating plans missing for 9 C and 10 C', detail: 'Exams start Monday', action: 'Datesheet', to: 'exams.datesheet' },
    ],
    tasks: [
      { title: 'Approve 6 question papers', due: 'Today', to: 'exams.papers', action: 'Papers' },
      { title: 'Exam-week time table', due: 'Sat 10 Oct', by: 'Lakshmi Rao', to: 'academic.timetable', action: 'Time Table' },
      { title: 'Review lesson plans of 3 new teachers', due: 'Wed 14 Oct', to: 'academic.syllabus', action: 'Plans' },
      { title: 'Homework load check, Classes 9–10', due: 'Fri 16 Oct', to: 'homework.progress', action: 'Open' },
    ],
    given: [{ title: 'Lesson plan: Chapter 6, Class 6', due: 'Due Sat 10 Oct', to2: 'Imran Shaikh' }, { title: 'Hindi paper for Class 9', due: 'Due today', to2: 'Deepak Verma' }],
    today: [
      { time: '11:00', title: 'Heads of department meeting', where: 'Staff room', tone: 'brand' },
      { time: '1:15', title: 'Fire drill', where: 'Whole school', tone: 'warn' },
      { time: '3:00', title: 'Staff meeting', where: 'Principal’s room', tone: 'info' },
      { time: 'Mon', title: 'Half-yearly exams start', where: 'Classes 6–10 · English', tone: 'bad', to: 'exams.datesheet' },
    ],
    side: <SyllabusCard rows={[{ k: 'Nur–UKG', v: 70 }, { k: '1–2', v: 68 }, { k: '3–5', v: 63 }, { k: '6–8', v: 60 }, { k: '9', v: 52 }, { k: '10', v: 58 }]} sub="All subjects · by class group" goal={64} />,
  }),

  hr: () => ({
    period: { title: 'Staff in this period', icon: 'Users', to: 'staff.leave', rows: [['Staff attendance', 95, 'pct'], ['Leave days taken', 3], ['Late arrivals', 1.5], ['Applications received', 2]] },
    action: { label: 'Staff leave', icon: I.CalendarDays, to: 'staff.leave' },
    band: [
      { label: 'Staff present', big: <>82<span className="text-[0.55em] opacity-90 font-medium"> / 86</span></>, foot: '3 on leave · 1 not in yet', to: 'attendance.staff' },
      { label: 'Leave requests', big: '4', foot: 'Waiting with approvers', to: 'staff.leave' },
      { label: 'Documents expiring', big: '5', foot: 'This month', to: 'staff.documents' },
      { label: 'Open positions', big: '3', foot: '41 applicants', to: 'staff.recruitment' },
    ],
    attention: [
      { tone: 'bad', icon: 'UserX', title: 'Swapna Reddy is not in yet', detail: 'No leave applied · first period missed', action: 'Open', to: 'attendance.staff' },
      { tone: 'warn', icon: 'FileWarning', title: '5 staff documents expire this month', detail: 'Driving licences (2), police verification (3)', action: 'See list', to: 'staff.documents' },
      { tone: 'info', icon: 'CalendarDays', title: '4 leave requests waiting', detail: 'Ravi Teja, Anitha K. and 2 more · with the Vice Principal', action: 'Open', to: 'staff.leave' },
      { tone: 'info', icon: 'UserCheck', title: 'Probation ends for Karthik Menon', detail: '31 Oct · appraisal form not filled', action: 'Open', to: 'staff.recruitment' },
    ],
    tasks: [
      { title: 'Interview for PGT Chemistry', due: 'Today, 11:30 AM', to: 'staff.recruitment', action: 'Candidates' },
      { title: 'Exit formalities for Ravi Kumar', due: 'Mon 12 Oct', to: 'staff.exit', action: 'Exit' },
      { title: 'Send September leave summary to Accounts', due: 'Was due 5 Oct', over: true, to: 'staff.leave', action: 'Leave' },
      { title: 'Remind 34 staff to fill the appraisal form', due: 'Fri 16 Oct', to: 'staff.recruitment', action: 'Appraisal' },
    ],
    today: [
      { time: '11:30', title: 'Interview: PGT Chemistry', where: '2 candidates · Conference room', tone: 'brand', to: 'staff.recruitment' },
      { time: '3:00', title: 'Staff meeting', where: 'Principal’s room', tone: 'info' },
      { time: 'Tue', title: 'Staff birthday: Usha Rani', where: 'PRT, 2 B', tone: 'ok' },
    ],
    main: <ListCard title="Staff away or late today" sub="From staff attendance and approved leave" icon={I.Users}
      rows={STAFF.filter((s) => s.status !== 'Present').map((s) => ({ avatar: s.name, title: s.name, sub: `${s.desig} · ${s.code}`, to: 'attendance.staff', right: <Pill tone={s.status === 'On leave' ? 'info' : s.status === 'Late' ? 'warn' : 'bad'} className="!h-5 !text-[11px]">{s.status}</Pill> }))} />,
  }),

  officestaff: () => ({
    period: { title: 'Office work in this period', icon: 'Briefcase', to: 'attendance.leave', rows: [['Student leave recorded', 3], ['Certificates given', 2], ['Applications received', 1.5], ['Admit cards printed', 40]] },
    action: { label: 'Record student leave', icon: I.CalendarDays, to: 'attendance.leave' },
    band: [
      { label: 'Admit cards printed', big: <>412<span className="text-[0.55em] opacity-90 font-medium"> / 486</span></>, foot: 'Classes 6–10 · 74 left', to: 'exams.admitcards' },
      { label: 'Leave to record', big: '3', foot: 'Parents called this morning', to: 'attendance.leave' },
      { label: 'Applications', big: '7', foot: '3 missing documents', to: 'admissions.applications' },
      { label: 'Certificates asked', big: '4', foot: '1 TC · 3 bonafide', to: 'students.certificates' },
    ],
    attention: [
      { tone: 'warn', icon: 'Printer', title: '74 admit cards not printed', detail: 'Classes 9 and 10 · exams start Monday', action: 'Print', to: 'exams.admitcards' },
      { tone: 'info', icon: 'Award', title: '4 certificate requests', detail: 'Bonafide for Sneha Rao (9 C, passport) and 3 more', action: 'Open', to: 'students.certificates' },
      { tone: 'warn', icon: 'FileWarning', title: '3 applications missing documents', detail: 'Birth certificate (2), transfer certificate (1)', action: 'Open', to: 'admissions.documents' },
      { tone: 'info', icon: 'ArrowRightLeft', title: 'Substitution arranged for 8 A, period 5', detail: 'Imran Shaikh takes English · not yet published', action: 'Publish', to: 'academic.substitutions' },
    ],
    tasks: [
      { title: 'Record leave for Aarav Sharma (7 B), Mon 12 Oct', due: 'Today', by: 'Priya Sharma by phone', to: 'attendance.leave', action: 'Leave' },
      { title: 'Print bonafide for Sneha Rao (9 C)', due: 'Today', to: 'students.certificates', action: 'Print' },
      { title: 'Import the October new admissions', due: 'Sat 10 Oct', by: 'Anita Sharma', to: 'students.list', action: 'Students' },
      { title: 'Seating plan into the datesheet', due: 'Sat 10 Oct', by: 'Anita Sharma', to: 'exams.datesheet', action: 'Datesheet' },
    ],
    today: [
      { time: '11:30', title: 'PTM for Classes 1–3', where: 'Hall arrangements', tone: 'brand' },
      { time: '2:00', title: 'Admit cards to Classes 6–8', where: 'Hand to class teachers', tone: 'warn', to: 'exams.admitcards' },
      { time: 'Mon', title: 'Half-yearly exams start', where: 'Classes 6–10', tone: 'bad', to: 'exams.datesheet' },
    ],
  }),

  examincharge: () => ({
    action: { label: 'Datesheet', icon: I.CalendarDays, to: 'exams.datesheet' },
    band: [
      { label: 'Half-yearly starts', big: 'Mon 12 Oct', foot: '3 days · Classes 6–10', to: 'exams.datesheet' },
      { label: 'Question papers', big: <>34<span className="text-[0.55em] opacity-90 font-medium"> / 40</span></>, foot: '6 not in yet', to: 'exams.papers' },
      { label: 'Admit cards', big: <>412<span className="text-[0.55em] opacity-90 font-medium"> / 486</span></>, foot: '74 held or not printed', to: 'exams.admitcards' },
      { label: 'Seating plans', big: <>10<span className="text-[0.55em] opacity-90 font-medium"> / 12</span></>, foot: '9 C and 10 C missing', to: 'exams.datesheet' },
    ],
    attention: [
      { tone: 'bad', icon: 'LayoutGrid', title: 'No seating plan for 9 C and 10 C', detail: 'Rooms 301 and 302 · 78 students', action: 'Make plan', to: 'exams.datesheet' },
      { tone: 'warn', icon: 'FileText', title: '6 question papers not submitted', detail: 'Hindi 9, Telugu 10, Science 8 and 3 more', action: 'Remind', to: 'exams.papers' },
      { tone: 'warn', icon: 'IdCard', title: '22 admit cards held for fee dues', detail: 'The Principal decides who sits the exam', action: 'Open', to: 'exams.admitcards' },
      { tone: 'info', icon: 'Lock', title: 'Unit Test 2 marks not locked in 3 subjects', detail: 'Class 8 · Social, Hindi, Computers', action: 'Marks', to: 'exams.marks' },
    ],
    tasks: [
      { title: 'Invigilation duty chart', due: 'Today', to: 'exams.datesheet', action: 'Duties' },
      { title: 'Publish Class 8 Unit Test 2 results', due: 'Sat 10 Oct', by: 'Lakshmi Rao', to: 'exams.results', action: 'Results' },
      { title: 'Moderation for Class 10 Science', due: 'Wed 14 Oct', to: 'exams.analysis', action: 'Analysis' },
    ],
    today: [
      { time: '11:00', title: 'Paper setters’ meeting', where: 'Exam cell', tone: 'brand' },
      { time: '2:00', title: 'Collect stationery from the store', where: 'Answer booklets, graph sheets', tone: 'info' },
      { time: 'Mon', title: 'English · Classes 6–10', where: '9:00–11:30 AM', tone: 'bad', to: 'exams.datesheet' },
      { time: 'Wed', title: 'Mathematics · Classes 6–10', where: '9:00–11:30 AM', tone: 'bad', to: 'exams.datesheet' },
    ],
    main: <ListCard title="Half-yearly readiness" sub="What must be ready by Monday" icon={I.ClipboardCheck}
      rows={[['Question papers', 34, 40, 'exams.papers'], ['Admit cards', 412, 486, 'exams.admitcards'], ['Seating plans', 10, 12, 'exams.datesheet'], ['Invigilation duties', 46, 48, 'exams.datesheet']].map(([n, a, b, to]) => ({ icon: 'ClipboardCheck', tone: a === b ? 'ok' : 'brand', title: n, sub: `${a} of ${b} ready`, bar: (a / b) * 100, to }))} />,
  }),

  admissioncounsellor: () => ({
    period: { title: 'Admissions in this period', sub: 'Enquiries you own', icon: 'UserPlus', to: 'admissions.reports', rows: [['New enquiries', 5], ['School visits', 1.2], ['Applications', 1.5], ['Admissions confirmed', 0.6]] },
    action: { label: 'Add enquiry', icon: I.PhoneIncoming, to: 'admissions.enquiries' },
    band: [
      { label: 'New enquiries today', big: '5', foot: '2 walk-in · 3 website', to: 'admissions.enquiries' },
      { label: 'Follow-ups due', big: '9', foot: '3 are overdue', to: 'admissions.enquiries' },
      { label: 'Visits booked', big: '5', foot: 'This week', to: 'admissions.enquiries' },
      { label: 'Applications', big: '18', foot: '7 ready for a decision', to: 'admissions.applications' },
    ],
    attention: [
      { tone: 'bad', icon: 'PhoneCall', title: '3 follow-up calls are overdue', detail: 'Swathi Varma (Nursery) and 2 more', action: 'Call', to: 'admissions.enquiries' },
      { tone: 'warn', icon: 'FileWarning', title: '3 applications missing documents', detail: 'Birth certificate (2), TC from previous school (1)', action: 'Open', to: 'admissions.documents' },
      { tone: 'info', icon: 'ClipboardCheck', title: 'Class 6 entrance test on Sat 17 Oct', detail: '12 registered · 4 have no slot yet', action: 'Slots', to: 'admissions.tests' },
      { tone: 'warn', icon: 'IndianRupee', title: '4 offers waiting for admission fee', detail: 'Offers expire 15 Oct', action: 'See offers', to: 'admissions.decision' },
    ],
    tasks: [
      { title: 'Call Swathi Varma about Nursery 2027–28', due: 'Was due yesterday', over: true, to: 'admissions.enquiries', action: 'Enquiry' },
      { title: 'School tour for the Rao family', due: 'Today, 3:30 PM', to: 'admissions.enquiries', action: 'Enquiry' },
      { title: 'Send test slots to 4 families', due: 'Today', to: 'admissions.tests', action: 'Tests' },
      { title: 'Admission report for September', due: 'Mon 12 Oct', by: 'Lakshmi Rao', to: 'admissions.reports', action: 'Reports' },
    ],
    today: [
      { time: '11:00', title: 'Call: Mrs. Lavanya, Class 3 enquiry', where: 'Asked about transport', tone: 'brand', to: 'admissions.enquiries' },
      { time: '3:30', title: 'School tour: Rao family', where: 'Nursery 2027–28', tone: 'brand', to: 'admissions.enquiries' },
      { time: 'Sat 17', title: 'Class 6 entrance test', where: '12 students · 9:00 AM', tone: 'warn', to: 'admissions.tests' },
    ],
    main: <ListCard title="Follow-ups due today" sub="Enquiries you own" icon={I.PhoneCall}
      rows={[['Swathi Varma', 'Nursery 2027–28 · website · overdue'], ['Rahul Kapoor', 'Class 4 · walk-in · fee question'], ['Fatima Begum', 'LKG · referral from Aarav’s mother'], ['Sandeep Rao', 'Class 6 · wants test slot']].map(([n, s]) => ({ avatar: n, title: n, sub: s, to: 'admissions.enquiries', right: <I.ChevronRight size={17} className="text-ink3" /> }))} />,
  }),

  counsellor: () => ({
    period: { title: 'My counselling in this period', sub: 'Only cases given to you', icon: 'HeartHandshake', to: 'students.behaviour', rows: [['Sessions held', 4], ['Cases opened', 0.3], ['Cases closed', 0.2], ['Parent meetings', 0.5]] },
    action: { label: 'Open cases', icon: I.HeartHandshake, to: 'students.behaviour' },
    band: [
      { label: 'Sessions today', big: '4', foot: 'Next at 11:15', to: 'students.behaviour' },
      { label: 'Open cases', big: '17', foot: 'Only you see the notes', to: 'students.behaviour' },
      { label: 'New referrals', big: '2', foot: 'From 7 B and 9 C', to: 'students.behaviour' },
      { label: 'Follow-ups this week', big: '6', foot: '2 with parents', to: 'students.behaviour' },
    ],
    attention: [
      { tone: 'warn', icon: 'HeartHandshake', title: '2 new referrals from class teachers', detail: 'Ravi Teja (7 B) · Deepak Verma (9 C)', action: 'Open', to: 'students.behaviour' },
      { tone: 'info', icon: 'Brain', title: '5 Class 10 students flagged for exam stress', detail: 'Raised by 3 teachers this week', action: 'See cases', to: 'students.behaviour' },
      { tone: 'info', icon: 'NotebookPen', title: 'Notes not written for 2 sessions', detail: 'Yesterday, 2:20 PM and 3:30 PM', action: 'Write', to: 'students.behaviour' },
    ],
    tasks: [
      { title: 'Write notes for yesterday’s 2 sessions', due: 'Today', to: 'students.behaviour', action: 'Notes' },
      { title: 'Exam stress workshop for Class 10', due: 'Sat 10 Oct', by: 'Lakshmi Rao', to: 'events.events', action: 'Event' },
      { title: 'Meet a Class 9 parent with the class teacher', due: 'Mon 12 Oct, 3:30 PM', to: 'students.behaviour', action: 'Case' },
    ],
    today: [
      { time: '11:15', title: 'Session · Class 9 student', where: 'Counselling room', tone: 'brand', to: 'students.behaviour' },
      { time: '12:40', title: 'Session · Class 7 student', where: 'Counselling room', tone: 'brand', to: 'students.behaviour' },
      { time: '2:20', title: 'Group session: exam stress', where: '10 A · Library', tone: 'info' },
      { time: '3:30', title: 'Parent meeting', where: 'Counselling room', tone: 'warn', to: 'students.behaviour' },
    ],
  }),

  gatesecurity: () => ({
    period: { title: 'Gate in this period', icon: 'IdCard', to: 'frontoffice.visitors', rows: [['Visitors', 24], ['Early pickups', 3], ['Deliveries at the gate', 6]] },
    action: { label: 'Add visitor', icon: I.IdCard, to: 'frontoffice.visitors' },
    band: [
      { label: 'Visitors inside', big: '6', foot: '2 not out from yesterday', to: 'frontoffice.visitors' },
      { label: 'Early pickups', big: '3', foot: 'Gate passes for today', to: 'frontoffice.pickup' },
      { label: 'Expected today', big: '4', foot: 'Appointments at the office', to: 'frontoffice.visitors' },
      { label: 'Buses leave', big: '3:50 PM', foot: '9 buses · main gate' },
    ],
    attention: [
      { tone: 'warn', icon: 'DoorOpen', title: '2 visitors not checked out yesterday', detail: 'Plumber (Block B) and Lavanya Rao (parent)', action: 'Check out', to: 'frontoffice.visitors' },
      { tone: 'info', icon: 'Users', title: 'Early pickup at 12:15', detail: 'Diya Menon, UKG B · mother · pass GP-0912', action: 'See pass', to: 'frontoffice.pickup' },
    ],
    tasks: [
      { title: 'Check visitor passes at PTM (Classes 1–3)', due: 'Today, 11:30 AM', by: 'Anita Sharma', to: 'frontoffice.visitors', action: 'Visitors' },
      { title: 'Keep the bus lane clear', due: 'Today, 3:40 PM', by: 'Anita Sharma' },
    ],
    today: [
      { time: '11:30', title: 'PTM parents arrive', where: 'About 90 parents · Classes 1–3', tone: 'brand' },
      { time: '12:15', title: 'Early pickup: Diya Menon', where: 'UKG B · mother · GP-0912', tone: 'info', to: 'frontoffice.pickup' },
      { time: '3:50', title: 'Buses leave', where: 'Main gate · 9 buses', tone: 'warn' },
    ],
    main: <VisitorsCard />,
  }),

  fallback: () => ({
    band: [
      { label: 'Notices', big: '3', foot: 'New this week', to: 'events.calendar' },
      { label: 'My leave left', big: '8 days', foot: 'Casual 5 · sick 3', to: 'staff.leave' },
      { label: 'Next holiday', big: 'Dussehra', foot: '19–25 Oct · reopens 26 Oct', to: 'events.calendar' },
      { label: 'Salary slip', big: 'Sep 2026', foot: 'Ready to download', to: 'salary.slips' },
    ],
    attention: [],
    tasks: [{ title: 'Read the half-yearly exam notice', due: 'Today', to: 'events.calendar', action: 'Open' }],
    today: [
      { time: '3:00', title: 'Staff meeting', where: 'Principal’s room', tone: 'info' },
      { time: 'Mon', title: 'Half-yearly exams start', where: 'Classes 6–10', tone: 'bad' },
      { time: 'Sat 17', title: 'PTM', where: '9:30 AM–12:30 PM', tone: 'brand' },
    ],
  }),
};

export function RoleHome() {
  const { role } = useRole();
  const [taken] = useState(() => new Set(role.id === 'teacher' ? ['p1', 'p2'] : []));
  const make = HOMES[role.id] || HOMES.fallback;
  return <HomeLayout cfg={make({ taken })} />;
}

/* ---------- Role-specific cards ---------- */
function RecentPayments() {
  const { go } = useNav();
  return (
    <Card>
      <CardHead title="Recent payments" sub="Live as money comes in" icon={I.ReceiptIndianRupee}
        action={<Button size="sm" variant="soft" icon={I.Plus} onClick={() => go('fees', { page: 'collect' })}>Collect fee</Button>} />
      <div className="px-2 pb-2">
        {RECENT_PAYMENTS.map((p) => (
          <div key={p.rcpt} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/70">
            <Avatar name={p.name} size={36} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[14px] truncate">{p.name} <span className="text-ink3 font-normal">· {p.cls}</span></p>
              <p className="text-[12.5px] text-ink3 truncate">{p.t} · {p.mode} · <span className="font-mono text-[11.5px]">{p.rcpt}</span></p>
            </div>
            <div className="text-right">
              <p className="font-semibold tnum text-[14.5px]">{inr(p.amt)}</p>
              {p.pending ? <Pill tone="warn" className="!h-5 !text-[11px]">To verify</Pill> : <Pill tone="ok" className="!h-5 !text-[11px]">Posted</Pill>}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
function MoneyToday() {
  const { go } = useNav();
  const toast = useToast();
  const [ask, setAsk] = useState(false);
  return (
    <Card>
      <CardHead title="Money today" sub="Fees, cheques and expenses" icon={I.Wallet} />
      <div className="px-5 pb-2">
        {[['Collected', inr(142500), 'text-ok'], ['Cheques to verify', inr(41000), 'text-warn'], ['Expenses paid', inr(6450), ''], ['Cash in hand', inr(52300), '']].map(([k, v, c]) => (
          <div key={k} className="flex justify-between py-1.5 text-[14px]"><span className="text-ink3">{k}</span><b className={cx('font-semibold tnum', c)}>{v}</b></div>
        ))}
      </div>
      <div className="px-4 pb-4 pt-1 grid grid-cols-2 gap-2">
        <Button variant="secondary" size="sm" icon={I.ReceiptText} onClick={() => go('finance', { page: 'expenses' })}>Record expense</Button>
        <Button variant="secondary" size="sm" icon={I.List} onClick={() => go('fees', { page: 'dashboard' })}>View payments</Button>
        <Button variant="secondary" size="sm" icon={I.Send} onClick={() => setAsk(true)}>Fee reminder</Button>
        <Button variant="secondary" size="sm" icon={I.ChartColumn} onClick={() => go('fees', { page: 'reports' })}>Reports</Button>
      </div>
      <ConfirmSheet open={ask} onClose={() => setAsk(false)} title="Send fee reminders to 61 families?"
        sub="Each family gets a WhatsApp message with the amount due and a payment link, with SMS if WhatsApp fails. Total overdue: ₹8.4 lakh."
        confirmLabel="Send to 61 families" onConfirm={() => toast({ title: 'Reminder sent to 61 families', body: 'WhatsApp, with SMS backup' })} />
    </Card>
  );
}
function SyllabusCard({ rows, sub, goal }) {
  const { go } = useNav();
  return (
    <Card>
      <CardHead title="Syllabus progress" sub={sub} icon={I.BookOpenCheck}
        action={<button onClick={() => go('academic', { page: 'syllabus' })} className="text-[13px] font-semibold text-brand hover:underline whitespace-nowrap">Open</button>} />
      <div className="px-5 pb-5"><HBars rows={rows} goal={goal} lowBelow={55} /></div>
    </Card>
  );
}
function MyClassCard() {
  const { go } = useNav();
  return (
    <Card>
      <CardHead title="My class: 7 B" sub="38 students · Room 204 · Godavari House leads" icon={I.GraduationCap}
        action={<button onClick={() => go('students', { page: 'list' })} className="text-[13px] font-semibold text-brand hover:underline whitespace-nowrap">Class list</button>} />
      <div className="px-5 pb-3 grid grid-cols-3 gap-2 text-center">
        {[['95%', 'Attendance, Oct'], ['82%', 'UT 2 average'], ['1', 'On leave today']].map(([v, l]) => (
          <div key={l} className="rounded-xl bg-sunken/70 py-2.5"><p className="font-display font-semibold text-[20px] tnum leading-tight">{v}</p><p className="text-[11.5px] text-ink3">{l}</p></div>
        ))}
      </div>
      <ul className="px-2 pb-2">
        {CLASS_7B.slice(0, 3).map((s, i) => (
          <li key={s.id}>
            <button onClick={() => go('student', { id: s.id })} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-sunken/70 text-left">
              <Avatar name={s.name} size={32} />
              <span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold truncate">{s.name}</span><span className="block text-[12px] text-ink3">Roll {s.roll} · {['top scorer in UT 2', 'absent 2 days this week', 'new phone number to confirm'][i]}</span></span>
              <I.ChevronRight size={16} className="text-ink3" />
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
function VisitorsCard() {
  const toast = useToast();
  const { go } = useNav();
  const [list, setList] = useState([
    ['Prakash Reddy', 'To meet the Principal', '10:20 AM', 'V-1184'], ['Lavanya Rao', 'Parent · Class 3 PTM', '10:05 AM', 'V-1183'], ['Srinu (Sri Sai Plumbing)', 'Block B washrooms', '9:40 AM', 'V-1181'],
    ['Meera Iyer’s father', 'Fee counter', '10:31 AM', 'V-1185'], ['DTDC courier', 'Accounts', '10:36 AM', 'V-1186'], ['Ramesh (CCTV service)', 'Server room', '9:15 AM', 'V-1179'],
  ]);
  const out = (v) => { setList((x) => x.filter((y) => y !== v)); toast({ title: `${v[0]} checked out`, body: `Pass ${v[3]} closed at 10:43 AM`, undo: () => setList((x) => [...x, v]) }); };
  return (
    <Card>
      <CardHead title="In the building now" sub={`${list.length} visitors with a pass`} icon={I.IdCard}
        action={<button onClick={() => go('frontoffice', { page: 'visitors' })} className="text-[13px] font-semibold text-brand hover:underline whitespace-nowrap">All visitors</button>} />
      <ul className="px-2 pb-2">
        {list.map((v) => (
          <li key={v[3]} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/70">
            <Avatar name={v[0]} size={36} />
            <div className="min-w-0 flex-1"><p className="font-semibold text-[14px] truncate">{v[0]}</p><p className="text-[12.5px] text-ink3 truncate">{v[1]} · in at {v[2]} · <span className="font-mono text-[11.5px]">{v[3]}</span></p></div>
            <Button size="sm" variant="ghost" icon={I.LogOut} onClick={() => out(v)} className="shrink-0">Out</Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
function BusesCard() {
  const { go } = useNav();
  const ST = { R3: ['Late this morning', 'warn'], R5: ['Insurance due', 'bad'] };
  return (
    <Card>
      <CardHead title="Buses" sub="All parked at school · afternoon trips at 3:50 PM" icon={I.Bus}
        action={<button onClick={() => go('transport', { page: 'live' })} className="text-[13px] font-semibold text-brand hover:underline whitespace-nowrap">Live map</button>} />
      <ul className="px-2 pb-2">
        {ROUTES.map((r) => (
          <li key={r.id}>
            <button onClick={() => go('transport', { page: 'routes' })} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/70 text-left">
              <span className="w-10 h-10 rounded-xl bg-brand/10 text-brand grid place-items-center shrink-0 text-[13px] font-bold">{r.bus.replace('Bus ', 'B')}</span>
              <span className="min-w-0 flex-1"><span className="block font-semibold text-[14px] truncate">{r.name}</span><span className="block text-[12.5px] text-ink3 truncate">{r.reg} · {r.driver} · {r.students} of {r.seats} seats</span></span>
              <Pill tone={ST[r.id]?.[1] || 'ok'} className="!h-5 !text-[11px] shrink-0">{ST[r.id]?.[0] || 'On time'}</Pill>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* =====================================================================
   My profile (top bar, for whoever is signed in)
   ===================================================================== */
const STAFF_CODE = { 'Lakshmi Rao': 'SPS-A-001', 'Srinivas Murthy': 'SPS-T-002', 'Meena Pillai': 'SPS-T-004', 'Shalini Verma': 'SPS-A-008', 'Naveen Kumar': 'SPS-A-017', 'Prakash Joshi': 'SPS-T-012', 'Divya Menon': 'SPS-A-019', 'Sana Ali': 'SPS-A-021', 'Bhaskar Rao': 'SPS-S-030' };
const NOTE_TYPES = [
  { k: 'Approvals waiting for me', locked: true, def: [1, 1, 0, 0], need: (r) => r.approves || r.id === 'principal' || r.id === 'schooladmin' },
  { k: 'Tasks given to me', def: [1, 0, 0, 0], need: (r) => r.id !== 'student' },
  { k: 'Substitutions I must take', def: [1, 1, 1, 0], need: (r) => r.id === 'teacher' || r.id === 'classteacher' },
  { k: 'Fee payments received', def: [1, 0, 0, 0], need: (r) => r.access.fees === 'full' },
  { k: 'My leave decided', def: [1, 1, 0, 0], need: (r) => r.access.staff === 'own' },
  { k: 'Salary slip ready', def: [1, 0, 0, 1], need: (r) => r.access.salary === 'own' },
  { k: 'Homework and quizzes due', def: [1, 0, 0, 0], need: (r) => r.id === 'student' },
  { k: 'Notices from the school', def: [1, 0, 0, 0] },
  { k: 'Security alerts (new sign-in, password changed)', locked: true, def: [1, 1, 1, 0] },
];
const WHATS_NEW = [
  { when: '9 Oct 2026', mod: 'fees', text: 'Collect Fee: the Pay button is now at the bottom on phones.' },
  { when: '5 Oct 2026', mod: 'attendance', text: 'Take Attendance: “All present” now asks before it clears the marks you made.' },
  { when: '1 Oct 2026', mod: 'fees', text: 'Search: type “fee Aarav” to jump straight to collecting a fee.' },
  { when: '24 Sep 2026', mod: 'homework', text: 'Homework: add photos straight from the phone camera.' },
  { when: '15 Sep 2026', mod: 'communication', text: 'Parent Link now shows report cards once they are published.' },
  { when: '2 Sep 2026', mod: null, text: 'My profile: sign out of a lost phone from “Signed-in devices”.' },
];

export function MyProfile() {
  const { role, roleId } = useRole();
  const { go } = useNav();
  const toast = useToast();
  const P = role.person;
  const staff = STAFF.find((s) => s.name === P.name);
  const code = staff?.code || STAFF_CODE[P.name] || (role.id === 'student' ? 'SPS/2021/0417' : 'SPS-T-040');
  const [phone, setPhone] = useState(P.phone || '');
  const [email, setEmail] = useState(P.email || '');
  const [edit, setEdit] = useState(false);
  const [pw, setPw] = useState(false);
  const [devices, setDevices] = useState(() => [
    { id: 'd1', icon: 'Monitor', name: 'Chrome on Windows', where: 'Kukatpally, Hyderabad', last: 'Active now', me: true },
    { id: 'd2', icon: 'Smartphone', name: role.id === 'principal' ? 'iPhone 14 · School OS app' : 'Android phone · School OS app', where: 'Hyderabad', last: 'Today, 8:31 AM' },
    { id: 'd3', icon: 'Laptop', name: 'Edge on a home laptop', where: 'Miyapur, Hyderabad', last: 'Yesterday, 9:12 PM' },
  ]);
  const [allOut, setAllOut] = useState(false);
  const types = NOTE_TYPES.filter((t) => !t.need || t.need(role));
  const [notes, setNotes] = useState(() => Object.fromEntries(NOTE_TYPES.map((t) => [t.k, [...t.def]])));
  const [lang, setLang] = useState('English');
  const must = ['principal', 'schooladmin', 'accountant', 'vp', 'hr'].includes(roleId);
  const [twoOn, setTwoOn] = useState(false);
  const two = must || twoOn;
  const news = WHATS_NEW.filter((w) => !w.mod || (w.mod === 'fees' ? role.access.fees === 'full' : role.access[w.mod]));
  // Personal pages under My profile: only the parts of Staff & HR and Salary that are this person's own
  const work = [['staff', 'leave', I.CalendarDays, 'My leave', 'Casual 5 · sick 3 · earned 12 days left'], ['salary', 'slips', I.Wallet, 'My salary slips', 'September 2026 slip is ready'], ['staff', 'documents', I.FileText, 'My documents', 'ID card, joining letter, certificates']]
    .filter(([m]) => role.access[m] === 'own');
  const signOut = (d) => { setDevices((x) => x.filter((y) => y.id !== d.id)); toast({ title: `Signed out on ${d.name.split(' · ')[0]}`, body: 'Your password is needed to sign in there again.', undo: () => setDevices((x) => [...x, d]) }); };

  return (
    <div>
      <PageHead title="My profile" sub="Your own details, password, devices and alerts. Only you see this page." />
      <div className="flex flex-col gap-5 @lg:gap-6">
      <Card>
        <div className="p-5 flex flex-col @md:flex-row @md:items-center gap-4">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <Avatar name={P.name} size={64} />
            <div className="min-w-0">
              <p className="font-display font-semibold text-[22px] leading-tight">{P.name}</p>
              <p className="text-[14px] text-ink3">{P.role} · Sunrise Public School</p>
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                <Pill tone="brand">{role.label}</Pill>
                <Pill tone="neutral"><span className="font-mono text-[11.5px]">{code}</span></Pill>
                {two && <Pill tone="ok"><I.ShieldCheck size={13} />Two-step login on</Pill>}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" icon={I.Camera} onClick={() => toast({ title: 'Photo updated', body: role.id === 'student' ? 'Shows on your ID card.' : 'Shows on your ID card and in staff lists.' })}>Photo</Button>
            <Button variant="primary" icon={I.Pencil} onClick={() => setEdit(true)}>Edit details</Button>
          </div>
        </div>
      </Card>

      <Split>
        <Col>
          <Card>
            <CardHead title="My details" sub="Changing your mobile number or email needs a one-time code" icon={I.User} />
            <DL rows={[
              ['Full name', P.name], ['Mobile number (your username)', <span className="tnum">{phone || 'Not given'}</span>], ['Email', email || 'Not given'],
              [role.id === 'student' ? 'Admission number' : 'Staff code', <span className="font-mono text-[13.5px]">{code}</span>],
              ['Role', role.label], ['Joined', staff?.joined || (role.id === 'student' ? '2 Jun 2021' : '14 Jun 2015')],
            ]} />
          </Card>

          <Card>
            <CardHead title="Password and sign-in" icon={I.KeyRound} />
            <div className="divide-y divide-line/70 border-t border-line/70">
              <div className="flex items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1 text-[14px]"><b className="font-semibold block">Password</b><span className="block text-[12.5px] text-ink3">Last changed 12 Aug 2026</span></div>
                <Button size="sm" variant="secondary" onClick={() => setPw(true)}>Change password</Button>
              </div>
              <div className="flex items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1 text-[14px]"><b className="font-semibold block">Two-step login</b><span className="block text-[12.5px] text-ink3">{must ? `A code goes to ${phone} after your password. Required for your role.` : two ? `A code goes to ${phone} after your password.` : 'A code to your phone after your password. Safer if someone learns your password.'}</span></div>
                {must ? <Pill tone="ok" className="gap-1"><I.Lock size={12} />On</Pill> : <Switch on={twoOn} label="Two-step login" onChange={(v) => { setTwoOn(v); toast({ title: `Two-step login ${v ? 'switched on' : 'switched off'}`, body: v ? `Codes go to ${phone} from your next sign-in.` : 'Only your password is asked from now on.', undo: () => setTwoOn(!v) }); }} />}
              </div>
            </div>
          </Card>

          <Card>
            <CardHead title="Signed-in devices" sub="Sign out of a phone you lost or a computer you shared" icon={I.MonitorSmartphone} />
            <ul className="px-2 pb-2">
              {devices.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/60">
                  <span className="w-10 h-10 rounded-xl bg-sunken text-ink2 grid place-items-center shrink-0"><Icon name={d.icon} size={19} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[14px] truncate">{d.name}{d.me && <Pill tone="brand" className="!h-5 !text-[11px] ml-2 align-middle">This device</Pill>}</p>
                    <p className="text-[12.5px] text-ink3 truncate">{d.where} · {d.last}</p>
                  </div>
                  {!d.me && <Button size="sm" variant="ghost" onClick={() => signOut(d)}>Sign out</Button>}
                </li>
              ))}
            </ul>
            {devices.length > 1 && <div className="px-5 pb-4 pt-1"><Button size="sm" variant="dangerSoft" icon={I.LogOut} onClick={() => setAllOut(true)}>Sign out everywhere else</Button></div>}
          </Card>

          <Card className="overflow-hidden">
            <CardHead title="My notifications" sub="Choose how each kind reaches you. Some cannot be switched off." icon={I.Bell} />
            <div className="overflow-x-auto scroll-thin border-t border-line">
              <table className="text-[13.5px] min-w-full">
                <thead>
                  <tr className="border-b border-line text-ink3 text-[12px]">
                    <th className="sticky left-0 z-10 bg-surface text-left font-semibold px-5 py-2.5 min-w-[190px]">Kind</th>
                    {['App', 'WhatsApp', 'SMS', 'Email'].map((h) => <th key={h} className="font-semibold px-3 py-2.5 text-center">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {types.map((t) => (
                    <tr key={t.k} className="border-b border-line/60 last:border-0">
                      <td className="sticky left-0 z-10 bg-surface px-5 py-2.5 font-medium">{t.k}{t.locked && <span className="block text-[11.5px] text-ink3 font-normal">Always in the app</span>}</td>
                      {notes[t.k].map((v, j) => (
                        <td key={j} className="px-3 py-2.5 text-center">
                          <span className="inline-flex"><Checkbox checked={!!v} label={`${t.k} by ${['app', 'WhatsApp', 'SMS', 'email'][j]}`}
                            onChange={(nv) => { if (t.locked && j === 0) { toast({ title: 'This one always shows in the app', tone: 'info' }); return; } setNotes((x) => ({ ...x, [t.k]: x[t.k].map((c, ci) => (ci === j ? (nv ? 1 : 0) : c)) })); }} /></span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-5 py-3 text-[12.5px] text-ink3 border-t border-line/70">{phone ? `WhatsApp and SMS go to ${phone}.` : 'Add a mobile number in Edit details to get WhatsApp and SMS.'} The school decides which channels are allowed.</p>
          </Card>
        </Col>

        <Col>
          <Card>
            <CardHead title="Language" sub="For your screens. The school has switched on 3 languages." icon={I.Languages} />
            <div className="px-4 pb-4 flex flex-col gap-1.5">
              {[['English', 'English'], ['Telugu', 'తెలుగు'], ['Hindi', 'हिन्दी']].map(([l, s]) => (
                <button key={l} onClick={() => { setLang(l); toast({ title: `Screens in ${l}`, body: 'Saved for your login on every device.' }); }} aria-pressed={lang === l}
                  className={cx('flex items-center gap-3 p-3 rounded-xl border text-left transition', lang === l ? 'border-brand ring-1 ring-brand bg-brand/5' : 'border-line hover:bg-sunken')}>
                  <span className={cx('w-5 h-5 rounded-full border-2 grid place-items-center shrink-0', lang === l ? 'border-brand' : 'border-line')}>{lang === l && <span className="w-2.5 h-2.5 rounded-full bg-brand" />}</span>
                  <span className="flex-1 font-semibold text-[14.5px]">{l}</span>{s !== l && <span className="text-ink3 text-[14px]">{s}</span>}
                </button>
              ))}
              <p className="text-[12.5px] text-ink3 px-1 pt-1">Tamil, Kannada, Malayalam, Marathi and Bengali can be switched on by the School Admin.</p>
            </div>
          </Card>

          {work.length > 0 && (
            <Card>
              <CardHead title="My work" icon={I.Briefcase} />
              <ul className="px-2 pb-2">
                {work.map(([m, p, Ic, t, s]) => (
                    <li key={t}>
                      <button onClick={() => go(m, { page: p })} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/70 text-left">
                        <span className="w-10 h-10 rounded-xl bg-brand/10 text-brand grid place-items-center shrink-0"><Ic size={19} /></span>
                        <span className="min-w-0 flex-1"><span className="block font-semibold text-[14.5px]">{t}</span><span className="block text-[12.5px] text-ink3 truncate">{s}</span></span>
                        <I.ChevronRight size={17} className="text-ink3" />
                      </button>
                    </li>
                  ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardHead title="What’s new" sub="Notes you were shown after updates, newest first" icon={I.Sparkles} />
            <ol className="px-5 pb-4 flex flex-col">
              {news.map((w, i) => (
                <li key={w.when} className="grid grid-cols-[14px_1fr] gap-3">
                  <span className="flex flex-col items-center"><span className={cx('w-2.5 h-2.5 rounded-full mt-1.5', i === 0 ? 'bg-brand' : 'bg-line')} />{i < news.length - 1 && <span className="flex-1 w-px bg-line my-1" />}</span>
                  <div className="pb-3.5"><p className="text-[14px] leading-snug">{w.text}</p><p className="text-[12px] text-ink3 mt-0.5">{w.when}</p></div>
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <div className="p-2">
              <button onClick={() => go('appearance')} className="w-full flex items-center gap-3 px-3 h-11 rounded-xl hover:bg-sunken text-[14px] font-medium text-left"><I.Palette size={18} className="text-ink3" />Colours and text size<I.ChevronRight size={16} className="text-ink3 ml-auto" /></button>
              <button onClick={() => go('signin')} className="w-full flex items-center gap-3 px-3 h-11 rounded-xl hover:bg-sunken text-[14px] font-medium text-left text-bad"><I.LogOut size={18} />Sign out</button>
            </div>
          </Card>
        </Col>
      </Split>

      </div>
      <EditMe open={edit} onClose={() => setEdit(false)} P={P} phone={phone} email={email} onSave={(p, e) => { const changed = p !== phone; setPhone(p); setEmail(e); toast({ title: 'Your details are saved', body: changed ? `Your username is now ${p}.` : 'Recorded in the audit log.' }); }} />
      <PasswordSheet open={pw} onClose={() => setPw(false)} />
      <ConfirmSheet open={allOut} onClose={() => setAllOut(false)} danger title="Sign out everywhere else?"
        sub={`You are signed out on ${devices.length - 1} other device${devices.length - 1 === 1 ? '' : 's'}. You stay signed in here.`}
        confirmLabel={`Sign out ${devices.length - 1} device${devices.length - 1 === 1 ? '' : 's'}`} onConfirm={() => { setDevices((x) => x.filter((d) => d.me)); toast({ title: 'Signed out everywhere else', body: 'Only this device is signed in now.' }); }} />
    </div>
  );
}

function EditMe({ open, onClose, P, phone, email, onSave }) {
  const [ph, setPh] = useState(phone);
  const [em, setEm] = useState(email);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState('');
  React.useEffect(() => { if (open) { setPh(phone); setEm(email); setSent(false); setCode(''); setOk(false); setErr(''); } }, [open]);
  const changed = ph.replace(/\s/g, '') !== phone.replace(/\s/g, '');
  const badPhone = changed && ph.replace(/\D/g, '').length !== 10;
  return (
    <Sheet open={open} onClose={onClose} title="Edit my details" sub="Name and photo change at once. A new mobile number needs a one-time code."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={I.Check} disabled={(changed && !ok) || badPhone} onClick={() => { onSave(ph, em); onClose(); }}>Save details</Button></>}>
      <div className="flex flex-col gap-4">
        <Field label="Full name" required id="me-name"><Input id="me-name" defaultValue={P.name} /></Field>
        <Field label="Mobile number" required id="me-ph" hint={changed ? 'This is also your username. We check it with a code first.' : 'This is also your username'} error={badPhone ? 'Enter a 10-digit mobile number' : ''}>
          <div className="flex gap-2">
            <span className="h-11 px-3 rounded-xl bg-sunken border border-line grid place-items-center text-[15px] text-ink2 shrink-0">+91</span>
            <Input id="me-ph" value={ph} onChange={(e) => { setPh(e.target.value); setSent(false); setOk(false); }} inputMode="tel" error={badPhone} />
          </div>
        </Field>
        {changed && !badPhone && (
          <div className="rounded-xl bg-sunken/70 p-3.5 flex flex-col gap-3">
            {ok ? <p className="text-[14px] text-ok font-semibold flex items-center gap-2"><I.CircleCheck size={17} />{ph} is confirmed</p> : !sent ? (
              <div className="flex items-center gap-3 flex-wrap">
                <p className="text-[13.5px] text-ink2 flex-1 min-w-[180px]">We send a 6-digit code to {ph} to make sure it is yours.</p>
                <Button size="sm" variant="secondary" icon={I.Send} onClick={() => setSent(true)}>Send code</Button>
              </div>
            ) : (
              <Field label={`Code sent to ${ph}`} id="me-otp" error={err} hint="It works for 10 minutes">
                <div className="flex gap-2">
                  <Input id="me-otp" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="6 digits" className="tnum tracking-[0.3em]" error={!!err} />
                  <Button type="button" variant="primary" onClick={() => { if (code.length !== 6) { setErr('Enter the 6-digit code'); return; } setErr(''); setOk(true); }}>Check</Button>
                </div>
              </Field>
            )}
          </div>
        )}
        <Field label="Email" id="me-em" hint="Optional. A code goes to a new address too."><Input id="me-em" type="email" value={em} onChange={(e) => setEm(e.target.value)} /></Field>
      </div>
    </Sheet>
  );
}

function PasswordSheet({ open, onClose }) {
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [err, setErr] = useState({});
  const close = () => { setCur(''); setA(''); setB(''); setErr({}); onClose(); };
  return (
    <FormSheet open={open} onClose={close} title="Change password" sub="At least 8 characters with a number. Rules set by your school." submitLabel="Change password"
      onSubmit={() => {
        const e = {};
        if (!cur) e.cur = 'Your current password is needed';
        if (a.length < 8 || !/\d/.test(a)) e.a = 'Use at least 8 characters with a number';
        else if (a === cur) e.a = 'Pick a password you have not used here';
        if (!e.a && a !== b) e.b = 'The two new passwords do not match';
        setErr(e);
        if (Object.keys(e).length) return false;
        toast({ title: 'Password changed', body: 'You stay signed in here. Other devices are signed out.' });
        setCur(''); setA(''); setB('');
      }}>
      <Field label="Current password" required id="pw-cur" error={err.cur}><Input id="pw-cur" type="password" value={cur} onChange={(e) => setCur(e.target.value)} error={!!err.cur} autoComplete="current-password" /></Field>
      <Field label="New password" required id="pw-new" error={err.a} hint="A short sentence is easy to remember and hard to guess"><Input id="pw-new" type="password" value={a} onChange={(e) => setA(e.target.value)} error={!!err.a} autoComplete="new-password" /></Field>
      <Field label="New password again" required id="pw-new2" error={err.b}><Input id="pw-new2" type="password" value={b} onChange={(e) => setB(e.target.value)} error={!!err.b} autoComplete="new-password" /></Field>
    </FormSheet>
  );
}

/* =====================================================================
   Setup checklist: a new school's School Admin on first sign-in
   ===================================================================== */
const STEPS = [
  { id: 's1', label: 'School profile and logo', to: 'settings.profile', done: '2 Oct · name, address, CBSE, logo', time: '5 minutes' },
  { id: 's2', label: 'Academic year, terms and timings', to: 'academic.settings', done: '3 Oct · 2026–27, 2 terms, 8:45 AM to 3:45 PM', time: '5 minutes' },
  { id: 's3', label: 'Classes and sections', to: 'academic.classes', done: '3 Oct · Nursery to Class 10, 43 sections', time: '10 minutes' },
  { id: 's4', label: 'Subjects', to: 'academic.subjects', done: '5 Oct · 10 subjects from the CBSE list', time: '5 minutes' },
  { id: 's5', label: 'Staff and their logins', to: 'staff.list', done: '6 Oct · 84 staff, 61 have signed in', time: '20 minutes' },
  { id: 's6', label: 'Students and parents (import from Excel)', to: 'students.list', done: '8 Oct · 1,236 students imported, 6 rows fixed', time: '15 minutes' },
  { id: 's7', label: 'Fee structure', to: 'fees.structure', sub: 'Fee heads, amounts and due dates per class. Start from last year’s Excel or the CBSE day-school template.', time: '20 minutes', btn: 'Set up fees' },
  { id: 's8', label: 'Payment gateway', to: 'settings.gateways', sub: 'Connect Razorpay so parents can pay online. You need your Razorpay key ID and secret.', time: '10 minutes', btn: 'Connect Razorpay', optional: true },
  { id: 's9', label: 'SMS and WhatsApp', to: 'settings.messaging', sub: 'Your DLT entity ID and sender header, and the WhatsApp Business number.', time: '15 minutes', btn: 'Connect' },
  { id: 's10', label: 'Parent Link', to: 'communication.parentlink', sub: 'Choose what parents see, then send each guardian their own link.', time: '5 minutes', btn: 'Set up' },
];

export function SetupHome() {
  const { role, modulesOn } = useRole();
  const { go } = useNav();
  const toast = useToast();
  const open = useOpen();
  const [done, setDone] = useState(() => new Set(STEPS.slice(0, 6).map((s) => s.id)));
  const [skip, setSkip] = useState(new Set());
  const [plan, setPlan] = useState(false);
  const admin = role.id === 'schooladmin' || role.id === 'principal';
  const P = admin ? role.person : ROLE.schooladmin.person;
  const steps = STEPS.filter((s) => modulesOn[s.to.split('.')[0]] !== false);
  const n = steps.filter((s) => done.has(s.id)).length;
  const next = steps.find((s) => !done.has(s.id) && !skip.has(s.id));
  const pct = Math.round((n / steps.length) * 100);
  const start = (s) => {
    if (!open(s.to)) { toast({ title: 'Only the School Admin opens this', body: `${s.label} is set up by the School Admin or the Principal.`, tone: 'info' }); return; }
    goTo(go, s.to);
  };
  if (!admin) return (
    <div className="max-w-xl mx-auto py-6">
      <Empty icon={I.Lock} title="The setup checklist is for the School Admin"
        body={`Only the School Admin and the Principal set up the school. Your role, ${role.label}, does not include this page.`}
        action={<Button variant="secondary" icon={I.House} onClick={() => go(role.access.dashboard ? 'dashboard' : 'homework')}>Go to your home</Button>} />
    </div>
  );
  return (
    <div className="flex flex-col gap-5 @lg:gap-6">
      <div className="flex flex-col @md:flex-row @md:items-end justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-ink3">Friday, 9 October · Day 8 of your trial</p>
          <h1 className="font-display text-[26px] @md:text-[32px] font-semibold tracking-tight leading-tight mt-0.5">Welcome, {P.first}</h1>
          <p className="text-[15px] text-ink3 mt-1">Let’s get Sunrise Public School ready. Most schools finish in a week.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Pill tone="warn" className="!h-8 !px-3 !text-[13px]"><I.Hourglass size={14} />Trial: 23 days left</Pill>
          <Button variant="secondary" onClick={() => setPlan(true)}>Choose a plan</Button>
        </div>
      </div>

      <Band items={[
        { label: 'Setup', big: <>{n}<span className="text-[0.55em] opacity-90 font-medium"> of {steps.length} done</span></>, foot: next ? `Next: ${next.label}` : 'All steps done' },
        { label: 'Trial', big: '23 days left', foot: 'Ends Sun 1 Nov 2026', onClick: () => setPlan(true) },
        { label: 'Staff logins', big: '84', foot: '61 have signed in', onClick: open('settings.users') ? () => go('settings', { page: 'users' }) : undefined },
        { label: 'Students', big: '1,236', foot: 'Imported from Excel on 8 Oct', onClick: open('students.list') ? () => go('students', { page: 'list' }) : undefined },
      ]} />

      <Split>
        <Card className="min-w-0">
          <div className="px-5 pt-5 pb-4 flex items-center gap-4">
            <Ring value={pct} size={68} stroke={7}><span className="font-display font-semibold text-[17px] tnum">{n}/{steps.length}</span></Ring>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-[16px]">Setup checklist</h3>
              <p className="text-[13px] text-ink3">{n} of {steps.length} done. Each step opens the right page. Come back here from the Dashboard.</p>
              <Progress value={pct} className="mt-2.5" />
            </div>
          </div>
          <ol className="border-t border-line/70">
            {steps.map((s, i) => {
              const ok = done.has(s.id);
              const skipped = skip.has(s.id);
              const isNext = next?.id === s.id;
              return (
                <li key={s.id} className={cx('flex items-start gap-3 px-5 py-3.5 border-b border-line/70 last:border-0', isNext && 'bg-brand/[.04]')}>
                  <span className={cx('w-8 h-8 rounded-full grid place-items-center shrink-0 text-[12.5px] font-bold tnum mt-0.5', ok ? 'bg-ok/15 text-ok' : isNext ? 'bg-brand text-brandink' : 'bg-sunken text-ink3')}>{ok ? <I.Check size={16} strokeWidth={3} /> : i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className={cx('text-[14.5px] font-semibold', ok && 'text-ink2')}>{s.label}{s.optional && <span className="text-ink3 font-normal"> · optional</span>}{skipped && <Pill tone="neutral" className="!h-5 !text-[11px] ml-2 align-middle">Skipped for now</Pill>}</p>
                    <p className="text-[12.5px] text-ink3">{ok ? `Done ${s.done}` : `${s.sub} About ${s.time}.`}</p>
                    {!ok && (
                      <div className="flex gap-2 mt-2.5 flex-wrap">
                        <Button size="sm" variant={isNext ? 'primary' : 'secondary'} iconRight={I.ArrowRight} onClick={() => start(s)}>{s.btn}</Button>
                        <Button size="sm" variant="ghost" icon={I.Check} onClick={() => { setDone((d) => new Set(d).add(s.id)); toast({ title: `Marked done: ${s.label}`, undo: () => setDone((d) => { const x = new Set(d); x.delete(s.id); return x; }) }); }}>Mark done</Button>
                        {s.optional && !skipped && <Button size="sm" variant="ghost" onClick={() => { setSkip((x) => new Set(x).add(s.id)); toast({ title: 'Payment gateway skipped for now', body: 'Parents pay at the counter until you connect it.', tone: 'info', undo: () => setSkip((x) => { const y = new Set(x); y.delete(s.id); return y; }) }); }}>Skip for now</Button>}
                      </div>
                    )}
                  </div>
                  {ok && <Button size="sm" variant="ghost" onClick={() => start(s)} className="shrink-0">Review</Button>}
                </li>
              );
            })}
          </ol>
        </Card>
        <Col>
          <Card>
            <CardHead title="Your onboarding guide" sub="From DREAM TEAM SERVICES" icon={I.Headset} />
            <div className="px-5 pb-5 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Avatar name="Kiran Reddy" size={44} />
                <div className="min-w-0"><p className="font-semibold text-[15px]">Kiran Reddy</p><p className="text-[13px] text-ink3">99000 41255 · Mon–Sat, 9 AM to 7 PM</p></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" icon={I.Phone} onClick={() => toast({ title: 'Calling Kiran Reddy', body: '99000 41255', tone: 'info' })}>Call</Button>
                <Button variant="secondary" icon={I.MessageCircle} onClick={() => toast({ title: 'WhatsApp opened', body: 'Chat with Kiran Reddy, DREAM TEAM', tone: 'info' })}>WhatsApp</Button>
              </div>
              <p className="text-[12.5px] text-ink3">Kiran can look inside your school only if you allow support access, for a set time.</p>
            </div>
          </Card>
          <Card>
            <CardHead title="Coming from other software?" icon={I.FileUp} />
            <div className="px-5 pb-5 flex flex-col gap-3">
              <p className="text-[14px] text-ink2">Bring students, staff and fee balances from Excel. Every row is checked before anything is added, and a whole import can be undone.</p>
              <Button variant="secondary" icon={I.FileSpreadsheet} onClick={() => (open('settings.security') ? go('settings', { page: 'security' }) : toast({ title: 'Imports are run by the School Admin', tone: 'info' }))}>Import templates</Button>
            </div>
          </Card>
          <Card>
            <CardHead title="Short videos" sub="2 to 4 minutes each" icon={I.CirclePlay} />
            <ul className="px-2 pb-2">
              {[['Set up fees in 20 minutes', '4 min'], ['Connect Razorpay', '3 min'], ['Send the first Parent Links', '2 min'], ['Teachers: attendance on the phone', '2 min']].map(([t, d]) => (
                <li key={t}><button onClick={() => toast({ title: `Playing: ${t}`, body: d, tone: 'info' })} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/70 text-left">
                  <span className="w-10 h-10 rounded-xl bg-brand/10 text-brand grid place-items-center shrink-0"><I.Play size={17} /></span>
                  <span className="min-w-0 flex-1"><span className="block font-semibold text-[14px] truncate">{t}</span><span className="block text-[12.5px] text-ink3">{d}</span></span>
                </button></li>
              ))}
            </ul>
          </Card>
        </Col>
      </Split>

      <Sheet open={plan} onClose={() => setPlan(false)} title="Choose a plan" sub="Your trial has everything in Essential. Pick a plan any time before 1 Nov."
        footer={<><Button variant="ghost" onClick={() => setPlan(false)}>Not now</Button><Button variant="primary" onClick={() => { setPlan(false); toast({ title: 'Kiran Reddy will call you today', body: 'To confirm the plan and send the first invoice.' }); }}>Ask DREAM TEAM to call me</Button></>}>
        <div className="grid grid-cols-1 @sm:grid-cols-2 gap-3">
          {[['Essential', 'Fees, attendance, students, exams, messages, Parent Link', '₹45 per student a year'], ['Complete', 'Everything in Essential, plus transport, library, hostel, inventory and AI', '₹70 per student a year']].map(([n, s, p]) => (
            <div key={n} className="rounded-2xl border border-line p-4">
              <p className="font-display font-semibold text-[18px]">{n}</p>
              <p className="text-[13px] text-ink3 mt-1">{s}</p>
              <p className="font-semibold text-[15px] mt-3 tnum">{p}</p>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
