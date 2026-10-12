// Home for the Principal, the School Admin and the Vice Principal. The Vice Principal sees fees, finance, admissions
// and staff as View only, so the money actions (collect, reminders, expenses, enquiries) are hidden for that role.
import React, { useEffect, useMemo, useState } from 'react';
import * as I from './icons.js';
import { ME, NEEDS_ATTENTION, TODAY_EVENTS, RECENT_PAYMENTS, ATT_BY_CLASS, FEE_TREND, inr } from './data.js';
import { cx, Card, CardHead, Button, Pill, Ring, Avatar, Skel, useToast, Sheet } from './ui.jsx';
import { useNav, useRole, quickFor, approvalsFor, canOpen, goTo } from './shell.jsx';
import { DatePeriod, PERIODS, fmtRange } from './kit.jsx';

// Fee collection by month (₹ lakh) with the dates each month covers, so the period filter can pick months
const FEE_MONTHS = FEE_TREND.map((m, i) => {
  const mo = i + 3; // April is month 3
  const last = new Date(2026, mo + 1, 0).getDate();
  const pad = (n) => String(n).padStart(2, '0');
  return { ...m, from: `2026-${pad(mo + 1)}-01`, to: `2026-${pad(mo + 1)}-${pad(last)}` };
});
// A small, steady change per period so example percentages move when the period changes
const wobble = (key, i) => { let h = 7; for (const c of key) h = (h * 31 + c.charCodeAt(0)) % 997; return ((h + i * 13) % 5) - 2; };

const TONE_ICON = { bad: I.UserX, warn: I.TriangleAlert, info: I.ListChecks };
const TONE_BG = { bad: 'bg-bad/10 text-bad', warn: 'bg-warn/12 text-warn', info: 'bg-info/10 text-info' };

export function Dashboard({ onAddStudent }) {
  const { go } = useNav();
  const { role, modulesOn } = useRole();
  const toast = useToast();
  const can = (to) => canOpen(role, to, modulesOn);
  const QUICK = quickFor(role, modulesOn);
  const feesFull = role.access.fees === 'full';
  const [loading, setLoading] = useState(true);
  const [approvals, setApprovals] = useState(() => approvalsFor(role));
  const [feePer, setFeePer] = useState(PERIODS.finyear);
  const [attPer, setAttPer] = useState(PERIODS.thisweek);
  // Needs your attention: leave requests come from this person's own approvals; View-only roles get "See list", not "Send reminders"
  const leaves = approvals.filter((a) => a.kind === 'Leave');
  const attention = NEEDS_ATTENTION.map((n) => {
    if (n.id === 'n2') return feesFull ? n : { ...n, action: 'See list', to: 'fees.defaulters' };
    if (n.id === 'n3') return leaves.length ? { ...n, title: `${leaves.length} leave ${leaves.length === 1 ? 'request' : 'requests'} waiting for you`, detail: leaves.map((a) => `${a.who} (${a.what.split(' · ')[1]})`).join(', ') } : null;
    return n;
  }).filter((n) => n && can(n.to));
  const feeRows = FEE_MONTHS.filter((m) => m.from <= feePer.to && m.to >= feePer.from);
  const feeC = feeRows.reduce((a, m) => a + m.c, 0), feeD = feeRows.reduce((a, m) => a + m.d, 0);
  const lakh = (v) => (v >= 100 ? `₹${(v / 100).toFixed(2)} Cr` : `₹${v} L`);
  const attRows = attPer.key === 'thisweek' ? ATT_BY_CLASS : ATT_BY_CLASS.map((r, i) => ({ ...r, v: Math.min(99, r.v + wobble(attPer.key + attPer.from, i)) }));
  const [brief, setBrief] = useState(false);
  const [refreshed, setRefreshed] = useState('10:42 AM');
  useEffect(() => { const t = setTimeout(() => setLoading(false), 650); return () => clearTimeout(t); }, []);

  const decide = (a, ok) => {
    setApprovals((x) => x.filter((y) => y !== a));
    toast({ title: ok ? `Approved: ${a.kind.toLowerCase()} for ${a.who}` : `Declined: ${a.kind.toLowerCase()} for ${a.who}`, body: ok ? 'They have been told on the app.' : 'They will see your reason.', undo: () => setApprovals((x) => [a, ...x]) });
  };

  return (
    <div className="flex flex-col gap-5 @lg:gap-6">
      {/* Greeting */}
      <div className="flex flex-col @md:flex-row @md:items-end justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-ink3">Friday, 9 October · School day 86 of 220</p>
          <h1 className="font-display text-[26px] @md:text-[32px] font-semibold tracking-tight leading-tight mt-0.5">Good morning, {ME.first}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setLoading(true); setTimeout(() => { setLoading(false); setRefreshed('10:43 AM'); }, 600); }}
            className="inline-flex items-center gap-1.5 text-[13px] text-ink3 hover:text-ink h-9 px-2 rounded-lg">
            <I.RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Updated {refreshed}
          </button>
          <Button variant="secondary" size="md" icon={I.Sparkles} onClick={() => setBrief(true)}>Summarise today</Button>
        </div>
      </div>

      {/* School today: the one bold moment */}
      <section aria-label="School today" className="relative overflow-hidden rounded-3xl bg-brand text-brandink shadow-pop">
        <div className="absolute inset-0 dotgrid opacity-60 pointer-events-none" />
        <div className="absolute -right-16 -top-24 w-72 h-72 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="relative grid grid-cols-2 @xl:grid-cols-4">
          <HeroStat loading={loading} onClick={() => go('attendance', { page: 'register' })} label="Students present"
            big={<>1,184<span className="text-[0.55em] opacity-70 font-medium"> / 1,236</span></>}
            foot="95.8% · 52 absent, 9 late" ring={95.8} />
          <HeroStat loading={loading} onClick={() => go('staff')} label="Staff present" big={<>82<span className="text-[0.55em] opacity-70 font-medium"> / 86</span></>} foot="3 on leave · 1 not in yet" ring={95.3} />
          <HeroStat loading={loading} onClick={() => go('fees', { page: 'dashboard' })} label="Fees collected today" big="₹1,42,500" foot="38 payments · 21 by UPI" />
          <HeroStat loading={loading} onClick={() => go('admissions')} label="New enquiries" big="12" foot="5 visits booked this week" last />
        </div>
      </section>

      {/* Quick actions on phone as a scroller */}
      <div className="@xl:hidden -mx-4 px-4 overflow-x-auto no-scrollbar">
        <div className="flex gap-2 w-max">
          {QUICK.map((q) => (
            <button key={q.id + q.label} onClick={() => (q.id === 'add-student' ? onAddStudent() : goTo(go, q.id))}
              className="flex items-center gap-2 h-11 pl-2 pr-4 rounded-full bg-surface border border-line text-[14px] font-semibold shadow-card">
              <span className="w-8 h-8 rounded-full bg-brand/10 text-brand grid place-items-center"><q.icon size={16} /></span>{q.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid @xl:grid-cols-[minmax(0,1fr)_340px] gap-5 @lg:gap-6 items-start">
        <div className="flex flex-col gap-5 @lg:gap-6 min-w-0">
          {/* Needs attention */}
          <Card>
            <CardHead title="Needs your attention" sub="Most urgent first. Each one opens the exact list behind it." icon={I.Flag}
              action={<Pill tone="bad">{attention.length} items</Pill>} />
            <ul className="px-2 pb-2">
              {attention.map((n) => {
                const Ic = TONE_ICON[n.tone] || I.TriangleAlert;
                return (
                  <li key={n.id}>
                    <div className="flex items-center gap-3.5 px-3 py-3 rounded-xl hover:bg-sunken/70 transition group">
                      <span className={cx('w-10 h-10 rounded-xl grid place-items-center shrink-0', TONE_BG[n.tone])}><Ic size={19} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[14.5px] leading-snug">{n.title}</p>
                        <p className="text-[13px] text-ink3 truncate">{n.detail}</p>
                      </div>
                      <Button size="sm" variant="secondary" className="hidden @sm:inline-flex" onClick={() => goTo(go, n.to)}>{n.action}</Button>
                      <button className="@sm:hidden w-9 h-9 grid place-items-center rounded-lg text-ink3" onClick={() => goTo(go, n.to)} aria-label={n.action}><I.ChevronRight size={20} /></button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          <div className="grid @lg:grid-cols-2 gap-5 @lg:gap-6">
            {/* Fee trend */}
            <Card>
              <CardHead title="Fee collection" sub={`Collected against due, by month (₹ lakh) · ${fmtRange(feePer)}`} icon={I.IndianRupee}
                action={<button onClick={() => go('fees', { page: 'dashboard' })} className="text-[13px] font-semibold text-brand hover:underline">Open</button>} />
              <div className="px-5 pb-3"><DatePeriod id="dash-fee-period" size="sm" value={feePer} onChange={setFeePer} className="w-full @md:w-auto" /></div>
              {feeRows.length === 0 ? (
                <div className="px-5 pb-6 pt-2 text-center">
                  <span className="mx-auto w-12 h-12 rounded-2xl bg-sunken text-ink3 grid place-items-center"><I.CalendarX size={22} /></span>
                  <p className="font-semibold mt-2.5">No fee months in this period</p>
                  <p className="text-[13px] text-ink3">This chart covers April to October 2026. Earlier years are in Fee Reports.</p>
                </div>
              ) : (<>
                <div className="px-5 pb-1 flex items-baseline gap-3 flex-wrap">
                  <p className="font-display text-[28px] font-semibold tnum">{lakh(feeC)}</p>
                  <p className="text-[13px] text-ink3">of {lakh(feeD)} due · <span className={cx('font-semibold', feeC / feeD >= 0.8 ? 'text-ok' : 'text-warn')}>{Math.round((feeC / feeD) * 100)}%</span></p>
                </div>
                {loading ? <div className="px-5 pb-5"><Skel className="h-[170px]" /></div> : <FeeChart rows={feeRows} />}
                <div className="flex gap-4 px-5 pb-4 text-[12.5px] text-ink2">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-brand" />Collected</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-ink3/25" />Due</span>
                  <span className="ml-auto">{feeRows.some((m) => m.m === 'Oct') ? 'October is still open' : `${feeRows.length} ${feeRows.length === 1 ? 'month' : 'months'}`}</span>
                </div>
              </>)}
            </Card>
            {/* Attendance by class */}
            <Card>
              <CardHead title="Attendance" sub={`By class group · ${attPer.label}, ${fmtRange(attPer)}. Goal is 90%.`} icon={I.CalendarCheck2}
                action={<button onClick={() => go('attendance', { page: 'reports' })} className="text-[13px] font-semibold text-brand hover:underline">Open</button>} />
              <div className="px-5 pb-3"><DatePeriod id="dash-att-period" size="sm" value={attPer} onChange={setAttPer} className="w-full @md:w-auto" /></div>
              <ul className="px-5 pb-5 flex flex-col gap-2.5">
                {attRows.map((r) => (
                  <li key={r.k} className="grid grid-cols-[64px_1fr_44px] items-center gap-3 text-[13px]">
                    <span className="text-ink2 font-medium">{r.k}</span>
                    <span className="relative h-3 rounded-full bg-sunken overflow-hidden">
                      <span className={cx('absolute inset-y-0 left-0 rounded-full transition-all duration-700', r.v < 90 ? 'bg-warn' : 'bg-brand')} style={{ width: loading ? '0%' : `${r.v}%` }} />
                      <span className="absolute inset-y-0 w-px bg-ink3/50" style={{ left: '90%' }} />
                    </span>
                    <span className={cx('text-right font-semibold tnum', r.v < 90 && 'text-warn')}>{r.v}%</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {/* Recent payments */}
          <Card>
            <CardHead title="Recent payments" sub="Live as money comes in" icon={I.ReceiptIndianRupee}
              action={feesFull ? <Button size="sm" variant="soft" icon={I.Plus} onClick={() => go('fees', { page: 'collect' })}>Collect fee</Button>
                : <button onClick={() => go('fees', { page: 'dashboard' })} className="text-[13px] font-semibold text-brand hover:underline">Open</button>} />
            <div className="px-2 pb-2">
              {RECENT_PAYMENTS.map((p) => (
                <div key={p.rcpt} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/70">
                  <Avatar name={p.name} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[14px] truncate">{p.name} <span className="text-ink3 font-normal">· {p.cls}</span></p>
                    <p className="text-[12.5px] text-ink3">{p.t} · {p.mode} · <span className="font-mono text-[11.5px]">{p.rcpt}</span></p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tnum text-[14.5px]">{inr(p.amt)}</p>
                    {p.pending ? <Pill tone="warn" className="!h-5 !text-[11px]">To verify</Pill> : <Pill tone="ok" className="!h-5 !text-[11px]">Posted</Pill>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-5 @lg:gap-6 min-w-0">
          <Card className={cx('hidden', QUICK.length > 0 && '@xl:block')}>
            <CardHead title="Quick actions" />
            <div className="grid grid-cols-2 gap-2 px-4 pb-4">
              {QUICK.map((q) => (
                <button key={q.id + q.label} onClick={() => (q.id === 'add-student' ? onAddStudent() : goTo(go, q.id))}
                  className="flex flex-col items-start gap-2 p-3 rounded-xl bg-sunken/70 hover:bg-brand/8 hover:text-brand transition text-left">
                  <q.icon size={20} className="text-brand" />
                  <span className="text-[13.5px] font-semibold leading-tight">{q.label}</span>
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <CardHead title="Today and next" icon={I.CalendarDays} action={<button onClick={() => go('events', { page: 'calendar' })} className="text-[13px] font-semibold text-brand hover:underline">Calendar</button>} />
            <ol className="px-5 pb-4 flex flex-col">
              {TODAY_EVENTS.map((e, i) => (
                <li key={i} className="grid grid-cols-[48px_14px_1fr] gap-2.5">
                  <span className="text-[13px] font-semibold tnum text-ink2 pt-0.5">{e.time}</span>
                  <span className="flex flex-col items-center">
                    <span className={cx('w-2.5 h-2.5 rounded-full mt-1.5 ring-4', { brand: 'bg-brand ring-brand/15', warn: 'bg-warn ring-warn/15', info: 'bg-info ring-info/15', bad: 'bg-bad ring-bad/15' }[e.tone])} />
                    {i < TODAY_EVENTS.length - 1 && <span className="flex-1 w-px bg-line my-1" />}
                  </span>
                  <span className="pb-4">
                    <span className="block text-[14px] font-semibold leading-tight">{e.title}</span>
                    <span className="block text-[12.5px] text-ink3">{e.where}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <CardHead title="Waiting for your approval" icon={I.ListChecks} action={<Pill tone="info">{approvals.length}</Pill>} />
            {approvals.length === 0 ? (
              <div className="px-5 pb-6 pt-1 text-center">
                <span className="mx-auto w-12 h-12 rounded-2xl bg-ok/10 text-ok grid place-items-center animate-pop"><I.Check size={24} strokeWidth={2.6} /></span>
                <p className="font-semibold mt-2.5">All done</p>
                <p className="text-[13px] text-ink3">Nothing is waiting for you.</p>
              </div>
            ) : (
              <ul className="px-3 pb-3 flex flex-col gap-1">
                {approvals.map((a) => (
                  <li key={a.who + a.what} className="p-2.5 rounded-xl hover:bg-sunken/70">
                    <div className="flex items-start gap-3">
                      <Avatar name={a.who} size={34} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-semibold leading-snug">{a.who}</p>
                        <p className="text-[12.5px] text-ink3">{a.what}</p>
                      </div>
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
        </div>
      </div>

      <Sheet open={brief} onClose={() => setBrief(false)} title="Today in one minute" sub="Suggestion · written from today's numbers only">
        <div className="flex flex-col gap-3 text-[14.5px] leading-relaxed">
          <p>Attendance is normal at <b>95.8%</b>, except <b>Class 9</b>, which is at <b>86%</b> this week. Nine of its 14 absences are on Wednesday, the day after the cricket trials.</p>
          <p><b>₹1,42,500</b> came in today from 38 payments. The Q3 tuition installment is due tomorrow, so expect a busy counter. 61 families are overdue by <b>₹8.4 lakh</b> in total.</p>
          <p>Before Monday's half-yearly exams, 2 classes still have no seating plan.</p>
          <div className="rounded-xl bg-sunken p-3 text-[12.5px] text-ink3">
            <p className="font-semibold text-ink2 mb-1">Numbers used</p>
            Attendance register 9 Oct (1,236 students) · Fee payments 9 Oct (38) · Defaulters list · Exam datesheet
          </div>
          <div className="flex gap-2 pt-1">
            {feesFull && <Button variant="primary" icon={I.Send} onClick={() => { setBrief(false); toast({ title: 'Reminder sent to 61 families', body: 'WhatsApp, with SMS backup' }); }}>Send fee reminders</Button>}
            <Button variant="ghost" onClick={() => { setBrief(false); toast({ title: 'Thanks. We will improve these summaries.', tone: 'info' }); }}>Not useful</Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

function HeroStat({ label, big, foot, ring, onClick, loading, last }) {
  return (
    <button onClick={onClick}
      className={cx('text-left p-4 @md:p-6 flex items-center gap-4 hover:bg-white/[.07] transition border-white/15 min-w-0',
        'border-b @xl:border-b-0 @xl:border-r [&:nth-child(odd)]:border-r', last && '@xl:border-r-0', '[&:nth-child(n+3)]:border-b-0')}>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] @md:text-[13px] font-semibold opacity-80 flex items-center gap-1">{label}<I.ChevronRight size={14} className="opacity-60" /></p>
        {loading ? <div className="h-9 w-28 rounded-lg bg-white/15 my-1.5" /> : (
          <p className="font-display text-[26px] @md:text-[34px] font-semibold tracking-tight leading-tight tnum mt-1 animate-rise">{big}</p>
        )}
        <p className="text-[12px] @md:text-[13px] opacity-75 mt-0.5 truncate">{foot}</p>
      </div>
      {ring != null && (
        <div className="hidden @lg:block">
          <svg width="58" height="58" className="-rotate-90" aria-hidden="true">
            <circle cx="29" cy="29" r="24" fill="none" stroke="currentColor" strokeOpacity=".2" strokeWidth="6" />
            <circle cx="29" cy="29" r="24" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round"
              strokeDasharray={150.8} strokeDashoffset={loading ? 150.8 : 150.8 * (1 - ring / 100)} style={{ transition: 'stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1)' }} />
          </svg>
        </div>
      )}
    </button>
  );
}

function FeeChart({ rows: FEE_TREND }) {
  const W = 360, H = 170, padL = 30, padB = 22, top = 8;
  const max = 70;
  const y = (v) => top + (H - padB - top) * (1 - v / max);
  const bw = (W - padL - 8) / Math.max(FEE_TREND.length, 4);
  const [hover, setHover] = useState(null);
  return (
    <div className="px-3 pb-2 relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Monthly fee collection compared with fees due">
        {[0, 20, 40, 60].map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - 4} y1={y(t)} y2={y(t)} style={{ stroke: 'rgb(var(--line))' }} strokeDasharray={t ? '3 4' : ''} />
            <text x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize="10" style={{ fill: 'rgb(var(--ink-3))' }}>{t}</text>
          </g>
        ))}
        {FEE_TREND.map((m, i) => {
          const x = padL + i * bw + bw * 0.18;
          const w = bw * 0.64;
          const on = hover === i;
          return (
            <g key={m.m} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={padL + i * bw} y={top} width={bw} height={H - padB - top} fill="transparent" />
              <rect x={x} y={y(m.d)} width={w} height={y(0) - y(m.d)} rx="4" style={{ fill: 'rgb(var(--ink-3) / .22)' }} />
              <rect x={x} y={y(m.c)} width={w} height={y(0) - y(m.c)} rx="4" style={{ fill: 'rgb(var(--brand))', opacity: hover == null || on ? 1 : 0.55 }} />
              <text x={x + w / 2} y={H - 6} textAnchor="middle" fontSize="10.5" fontWeight={i === FEE_TREND.length - 1 ? 700 : 500} style={{ fill: 'rgb(var(--ink-2))' }}>{m.m}</text>
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div className="absolute top-0 right-4 bg-ink text-bg rounded-lg px-2.5 py-1.5 text-[12px] shadow-pop pointer-events-none tnum">
          <b>{FEE_TREND[hover].m}</b> · ₹{FEE_TREND[hover].c} L of ₹{FEE_TREND[hover].d} L ({Math.round((FEE_TREND[hover].c / FEE_TREND[hover].d) * 100)}%)
        </div>
      )}
    </div>
  );
}
