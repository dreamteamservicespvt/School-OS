// Home for the Principal, the School Admin and the Vice Principal. Each sees only their own day:
// - Principal: summaries, gaps and approvals. No desk work (no Collect fee, no Take attendance).
// - School Admin: the office's day: admissions, students, staff, messages, setup and approvals.
// - Vice Principal: the school day: who is absent, classes not marked, substitutions, exams and approvals.
// Every tile, card and link leads only to a page this person may open; doing-buttons show only where they do the work.
import React, { useEffect, useState } from 'react';
import * as I from './icons.js';
import { NEEDS_ATTENTION, TODAY_EVENTS, ATT_BY_CLASS, FEE_TREND } from './data.js';
import { cx, Card, CardHead, Button, Pill, Avatar, Skel, useToast, Sheet } from './ui.jsx';
import { useNav, useRole, quickFor, canOpen, goTo } from './shell.jsx';
import { DatePeriod, PERIODS, fmtRange } from './kit.jsx';
import { pageAccess } from './config.js';
import { ATT_TODAY, NOT_MARKED } from './attendance.jsx';
const NM_NAMES = NOT_MARKED.map((c) => c.cls).join(', ').replace(/, ([^,]*)$/, ' and $1');
import { myApprovals } from './other.jsx';

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
const TONE_BG = { bad: 'bg-bad/10 text-bad', warn: 'bg-warn/12 text-warn', info: 'bg-info/10 text-info', ok: 'bg-ok/10 text-ok', brand: 'bg-brand/10 text-brand' };

// Classes whose attendance is not taken yet today, with the class teacher (Staff List)
// Periods with the teacher away today (Substitutions)
const SUBS = [
  { p: 'P5', t: '12:40', cls: '8 A', sub: 'English', away: 'Anitha Kumari', by: 'Imran Shaikh' },
  { p: 'P6', t: '1:25', cls: '9 C', sub: 'Hindi', away: 'Deepak Verma (late)', by: null },
  { p: 'P7', t: '2:20', cls: '10 A', sub: 'English', away: 'Anitha Kumari', by: null },
  { p: 'P3', t: '10:30', cls: '4 B', sub: 'EVS', away: 'Usha Rani (training)', by: 'Sunitha Mohan' },
];
// Work across the school that is late: the Principal follows up, the person does it
const NOT_DONE = [
  { k: 'att', icon: I.CalendarCheck2, title: 'Attendance not marked', sub: NOT_MARKED.map((c) => `${c.cls} (${c.ct})`).join(' · ') + ' · locks 11:00 AM', who: `${NOT_MARKED.length} class teachers`, to: 'attendance.register', tone: 'bad' },
  { k: 'marks', icon: I.ClipboardCheck, title: 'Unit Test 2 marks not entered', sub: 'Class 8 · Social, Hindi, Computers · 3 teachers', who: '3 teachers', to: 'exams.marks', tone: 'warn' },
  { k: 'papers', icon: I.FileText, title: '6 question papers not in', sub: 'Hindi 9, Telugu 10 and 4 more · due today', who: '6 paper setters', to: 'exams.papers', tone: 'warn' },
  { k: 'seat', icon: I.LayoutGrid, title: 'Seating plans missing', sub: '9 C and 10 C · exams start Monday', who: 'the Exam In-charge', to: 'exams.datesheet', tone: 'warn' },
  { k: 'plans', icon: I.BookOpenCheck, title: 'Lesson plans not sent', sub: '3 new teachers · Classes 6 and 9', who: '3 teachers', to: 'academic.syllabus', tone: 'info' },
];
// The office's admissions this term (Admission Dashboard)
const PIPE = [['Enquiries', 48, 'admissions.enquiries'], ['School visits', 21, 'admissions.enquiries'], ['Applications', 18, 'admissions.applications'], ['Ready for a decision', 7, 'admissions.decision'], ['Admitted', 31, 'admissions.decision']];

export function Dashboard({ onAddStudent }) {
  const { go } = useNav();
  const { role, modulesOn } = useRole();
  const toast = useToast();
  const kind = role.id === 'schooladmin' ? 'office' : role.id === 'vp' ? 'vp' : 'principal';
  // May open the page / may do the work there (Own and Full do the work, View only looks)
  const can = (to) => canOpen(role, to, modulesOn);
  const does = (to) => { if (!can(to)) return false; const [m, p] = to.split('.'); return !p || pageAccess(role.id, m, p, role.access[m]) !== 'view'; };
  const open = (to) => (can(to) ? () => goTo(go, to) : undefined);
  const remind = (who, what) => toast({ title: `Reminder sent to ${who}`, body: what });
  const QUICK = quickFor(role, modulesOn);
  // Fee reminders go out only from someone whose Defaulters page is theirs to work on
  const sendsReminders = does('fees.defaulters');
  const [loading, setLoading] = useState(true);
  // Only what this person may decide: never their own office's requests, money requests only where they decide
  const [approvals, setApprovals] = useState(() => myApprovals(role, modulesOn));
  const [feePer, setFeePer] = useState(PERIODS.finyear);
  const [attPer, setAttPer] = useState(PERIODS.thisweek);
  const leaves = approvals.filter((a) => a.kind === 'Leave');
  const leaveItem = leaves.length ? { id: 'n3', tone: 'info', title: `${leaves.length} leave ${leaves.length === 1 ? 'request' : 'requests'} waiting for you`, detail: leaves.map((a) => `${a.who} (${a.what.split(' · ')[1]})`).join(', '), action: 'Review', to: 'approvals' } : null;
  const notMarked = { id: 'nm', tone: 'bad', icon: I.CalendarCheck2, title: `${NOT_MARKED.length} classes have not marked attendance`, detail: NOT_MARKED.map((c) => `${c.cls} (${c.ct})`).join(' · ') + ' · locks 11:00 AM', remind: [`${NOT_MARKED.length} class teachers`, `Classes ${NM_NAMES} · on the app and WhatsApp`] };
  const base = Object.fromEntries(NEEDS_ATTENTION.map((n) => [n.id, n]));
  const absent3 = { ...base.n1, to: 'attendance.register' };
  const drop9b = { ...base.n4, action: 'Open register', to: 'attendance.register' };
  const overdue = { ...base.n2, action: sendsReminders ? base.n2.action : 'See list', to: 'fees.defaulters' };
  const ATTN = {
    principal: [absent3, notMarked, leaveItem, overdue, drop9b,
      { id: 'mk', tone: 'warn', icon: I.ClipboardCheck, title: 'Unit Test 2 marks not entered by 3 teachers', detail: 'Class 8 · Social, Hindi, Computers · locks 12 Oct', action: 'Marks progress', to: 'exams.marks' }],
    office: [
      { id: 'dc', tone: 'warn', icon: I.FileWarning, title: '3 applications missing documents', detail: 'Birth certificate (2), transfer certificate (1)', action: 'Open', to: 'admissions.documents' },
      { id: 'ct', tone: 'info', icon: I.Award, title: '4 certificate requests', detail: 'Bonafide for Sneha Rao (9 C, passport) and 3 more · 1 TC', action: 'Open', to: 'students.certificates' },
      leaveItem, notMarked,
      { id: 'ms', tone: 'warn', icon: I.MessageCircleWarning, title: '18 messages not delivered yesterday', detail: 'Wrong or switched-off numbers · PTM notice to Classes 1–3', action: 'See list', to: 'communication.history' },
      { id: 'us', tone: 'info', icon: I.Users, title: '3 new staff have not signed in yet', detail: 'Invites sent 5 Oct · Karthik Menon and 2 more', action: 'Users', to: 'settings.users' },
    ],
    vp: [absent3, notMarked,
      { id: 'sb', tone: 'bad', icon: I.ArrowRightLeft, title: '2 periods have no teacher today', detail: '9 C period 6 (Hindi) · 10 A period 7 (English)', action: does('academic.substitutions') ? 'Arrange' : 'Open', to: 'academic.substitutions' },
      leaveItem, drop9b,
      { id: 'st', tone: 'warn', icon: I.LayoutGrid, title: 'Seating plans missing for 9 C and 10 C', detail: 'Half-yearly exams start Monday', action: 'Datesheet', to: 'exams.datesheet' },
      { id: 'mk', tone: 'warn', icon: I.ClipboardCheck, title: 'Unit Test 2 marks not entered by 3 teachers', detail: 'Class 8 · Social, Hindi, Computers', action: 'Marks progress', to: 'exams.marks' }],
  }[kind];
  const attention = ATTN.filter((n) => n && (n.remind || can(n.to)));

  const feeRows = FEE_MONTHS.filter((m) => m.from <= feePer.to && m.to >= feePer.from);
  const feeC = feeRows.reduce((a, m) => a + m.c, 0), feeD = feeRows.reduce((a, m) => a + m.d, 0);
  const lakh = (v) => (v >= 100 ? `₹${(v / 100).toFixed(2)} Cr` : `₹${v} L`);
  const attRows = attPer.key === 'thisweek' ? ATT_BY_CLASS : ATT_BY_CLASS.map((r, i) => ({ ...r, v: Math.min(99, r.v + wobble(attPer.key + attPer.from, i)) }));
  const [brief, setBrief] = useState(false);
  const [refreshed, setRefreshed] = useState('10:42 AM');
  const [reminded, setReminded] = useState(new Set());
  useEffect(() => { const t = setTimeout(() => setLoading(false), 650); return () => clearTimeout(t); }, []);

  const decide = (a, ok) => {
    setApprovals((x) => x.filter((y) => y !== a));
    toast({ title: ok ? `Approved: ${a.kind.toLowerCase()} for ${a.who}` : `Declined: ${a.kind.toLowerCase()} for ${a.who}`, body: ok ? 'They have been told on the app.' : 'They will see your reason.', undo: () => setApprovals((x) => [a, ...x]) });
  };
  const nudge = (k, who, what) => { setReminded((s) => new Set(s).add(k)); remind(who, what); };

  const HERO = {
    principal: [
      { label: 'Students present', big: <>{ATT_TODAY.present.toLocaleString('en-IN')}<span className="text-[0.55em] opacity-90 font-medium"> / {ATT_TODAY.students.toLocaleString('en-IN')}</span></>, foot: `${ATT_TODAY.pct}% of marked · ${ATT_TODAY.absent} absent · ${ATT_TODAY.sections - ATT_TODAY.markedSections} classes not marked`, ring: ATT_TODAY.pct, to: 'attendance.register' },
      { label: 'Staff present', big: <>82<span className="text-[0.55em] opacity-90 font-medium"> / 86</span></>, foot: '3 on leave · 1 not in yet', ring: 95.3, to: 'attendance.staff' },
      { label: 'Fees collected today', big: '₹1,42,500', foot: '38 payments · 21 by UPI', to: 'fees.dashboard' },
      { label: 'New enquiries', big: '12', foot: '5 visits booked this week', to: 'admissions.enquiries' },
    ],
    office: [
      { label: 'New enquiries', big: '12', foot: '5 visits booked this week', to: 'admissions.enquiries' },
      { label: 'Applications', big: '18', foot: '7 ready · 3 missing papers', to: 'admissions.applications' },
      { label: 'Students', big: '1,236', foot: '4 joined this week · 1 TC asked', to: 'students.list' },
      { label: 'Staff present', big: <>82<span className="text-[0.55em] opacity-90 font-medium"> / 86</span></>, foot: '3 on leave · 1 not in yet', ring: 95.3, to: 'attendance.staff' },
    ],
    vp: [
      { label: 'Students present', big: <>{ATT_TODAY.present.toLocaleString('en-IN')}<span className="text-[0.55em] opacity-90 font-medium"> / {ATT_TODAY.students.toLocaleString('en-IN')}</span></>, foot: `${ATT_TODAY.pct}% of marked · ${ATT_TODAY.absent} absent · ${ATT_TODAY.sections - ATT_TODAY.markedSections} classes not marked`, ring: ATT_TODAY.pct, to: 'attendance.register' },
      { label: 'Not marked yet', big: <>{NOT_MARKED.length}<span className="text-[0.55em] opacity-90 font-medium"> classes</span></>, foot: `${NM_NAMES} · locks 11:00 AM`, to: 'attendance.register' },
      { label: 'Periods with no teacher', big: '2', foot: '9 C period 6 · 10 A period 7', to: 'academic.substitutions' },
      { label: 'Half-yearly exams', big: 'Mon 12 Oct', foot: '2 seating plans missing', to: 'exams.datesheet' },
    ],
  }[kind];

  const BRIEF = {
    principal: [
      <>Attendance is normal at <b>{ATT_TODAY.pct}%</b>, except <b>Class 9</b>, which is at <b>86%</b> this week. Nine of its 14 absences are on Wednesday, the day after the cricket trials. <b>8 A</b>, <b>10 C</b> and <b>3 A</b> have not marked attendance yet.</>,
      <><b>₹1,42,500</b> came in today from 38 payments. 61 families are overdue by <b>₹8.4 lakh</b> in total; the Accountant sends the reminders.</>,
      <>Before Monday's half-yearly exams, 2 classes still have no seating plan and 6 question papers are not in. <b>{approvals.length}</b> {approvals.length === 1 ? 'request is' : 'requests are'} waiting for your approval.</>,
    ],
    office: [
      <><b>12</b> new admission enquiries this week and <b>5</b> school visits booked. <b>3</b> applications are missing documents and <b>7</b> are ready for a decision.</>,
      <><b>4</b> certificate requests are waiting (1 TC, 3 bonafide). <b>18</b> messages were not delivered yesterday, mostly wrong numbers.</>,
      <>Staff: <b>82 of 86</b> are in. <b>3</b> new staff have not signed in yet. Attendance is not marked in <b>8 A</b>, <b>10 C</b> and <b>3 A</b>.</>,
    ],
    vp: [
      <>Attendance is <b>{ATT_TODAY.pct}%</b>. <b>8 A</b>, <b>10 C</b> and <b>3 A</b> have not marked it yet; it locks at 11:00 AM. <b>Class 9</b> is at <b>86%</b> this week.</>,
      <><b>2</b> periods have no teacher today: 9 C period 6 (Hindi) and 10 A period 7 (English).</>,
      <>Half-yearly exams start <b>Monday</b>. Seating plans are missing for 9 C and 10 C, and 3 teachers have not entered Unit Test 2 marks.</>,
    ],
  }[kind];
  const USED = { principal: 'Attendance register 9 Oct (1,236 students) · Fee payments 9 Oct (38) · Defaulters list · Exam datesheet · Approvals', office: 'Admission enquiries and applications · Certificate requests · Message history 8 Oct · Staff attendance 9 Oct · Users', vp: 'Attendance register 9 Oct (1,236 students) · Substitutions 9 Oct · Exam datesheet · Marks progress' }[kind];

  const Link = ({ to, children = 'Open' }) => (can(to) ? <button onClick={() => goTo(go, to)} className="text-[13px] font-semibold text-brand hover:underline whitespace-nowrap">{children}</button> : null);

  // Cards in the main column, per person
  const feeCard = (
    <Card>
      <CardHead title="Fee collection" sub={`Collected against due, by month (₹ lakh) · ${fmtRange(feePer)}`} icon={I.IndianRupee} action={<Link to="fees.dashboard" />} />
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
  );
  const attCard = (
    <Card>
      <CardHead title="Attendance" sub={`By class group · ${attPer.label}, ${fmtRange(attPer)}. Goal is 90%.`} icon={I.CalendarCheck2} action={<Link to="attendance.reports" />} />
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
  );
  // Gaps across the school, each with a gentle Remind instead of doing the work
  const gapsCard = (
    <Card>
      <CardHead title="Not done yet" sub="Work that is late across the school. Remind sends the person a message on the app." icon={I.Hourglass}
        action={<Pill tone="warn">{NOT_DONE.length}</Pill>} />
      <ul className="px-2 pb-2">
        {NOT_DONE.map((g) => {
          const go2 = open(g.to);
          return (
            <li key={g.k} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/70">
              <span className={cx('w-10 h-10 rounded-xl grid place-items-center shrink-0', TONE_BG[g.tone])}><g.icon size={19} /></span>
              {go2 ? (
                <button onClick={go2} className="min-w-0 flex-1 text-left group">
                  <p className="font-semibold text-[14.5px] leading-snug group-hover:text-brand">{g.title}</p>
                  <p className="text-[12.5px] text-ink3 truncate">{g.sub}</p>
                </button>
              ) : (
                <div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px] leading-snug">{g.title}</p><p className="text-[12.5px] text-ink3 truncate">{g.sub}</p></div>
              )}
              {reminded.has(g.k) ? <Pill tone="ok" className="shrink-0"><I.Check size={13} strokeWidth={3} />Reminded</Pill>
                : <Button size="sm" variant="secondary" icon={I.BellRing} className="shrink-0" onClick={() => nudge(g.k, g.who, g.title)}>Remind</Button>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
  const subsCard = (
    <Card>
      <CardHead title="Substitutions today" sub="Teachers away and who takes their periods" icon={I.ArrowRightLeft} action={<Link to="academic.substitutions">{does('academic.substitutions') ? 'Arrange' : 'Open'}</Link>} />
      <ul className="px-2 pb-2">
        {SUBS.map((s) => (
          <li key={s.p + s.cls} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/70">
            <span className="w-11 text-center shrink-0">
              <span className="block text-[11px] text-ink3 font-semibold">{s.p}</span>
              <span className="block text-[13px] font-semibold tnum">{s.t}</span>
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[14px] truncate">{s.cls} <span className="text-ink3 font-normal">· {s.sub}</span></p>
              <p className="text-[12.5px] text-ink3 truncate">{s.away} is away{s.by ? ` · ${s.by} takes it` : ''}</p>
            </div>
            {s.by ? <Pill tone="ok" className="!h-5 !text-[11px] shrink-0">Covered</Pill>
              : does('academic.substitutions') ? <Button size="sm" variant="soft" className="shrink-0" onClick={() => goTo(go, 'academic.substitutions')}>Arrange</Button>
                : <Pill tone="bad" className="!h-5 !text-[11px] shrink-0">No teacher</Pill>}
          </li>
        ))}
      </ul>
    </Card>
  );
  const examCard = (
    <Card>
      <CardHead title="Half-yearly readiness" sub="Exams start Monday 12 Oct · Classes 6–10" icon={I.ClipboardCheck} action={<Link to="exams.datesheet">Datesheet</Link>} />
      <ul className="px-5 pb-5 flex flex-col gap-3">
        {[['Question papers', 34, 40, 'exams.papers'], ['Admit cards printed', 412, 486, 'exams.admitcards'], ['Seating plans', 10, 12, 'exams.datesheet'], ['Invigilation duties', 46, 48, 'exams.datesheet']].map(([k, a, b, to]) => {
          const go2 = open(to);
          const B = go2 ? 'button' : 'div';
          return (
            <li key={k}>
              <B onClick={go2} className={cx('w-full text-left block', go2 && 'group')}>
                <span className="flex justify-between gap-3 text-[13.5px]"><span className={cx('font-semibold', go2 && 'group-hover:text-brand')}>{k}</span><span className="text-ink3 tnum">{a} of {b}</span></span>
                <span className="mt-1.5 block h-2 rounded-full bg-sunken overflow-hidden"><span className={cx('block h-full rounded-full', a === b ? 'bg-ok' : 'bg-brand')} style={{ width: `${(a / b) * 100}%` }} /></span>
              </B>
            </li>
          );
        })}
      </ul>
    </Card>
  );
  const admissionsCard = (
    <Card>
      <CardHead title="Admissions for 2027–28" sub="From first call to admitted, this term" icon={I.UserPlus} action={<Link to="admissions.dashboard" />} />
      <ul className="px-5 pb-5 flex flex-col gap-2.5">
        {PIPE.map(([k, v, to]) => {
          const go2 = open(to);
          const B = go2 ? 'button' : 'div';
          return (
            <li key={k}>
              <B onClick={go2} className={cx('w-full grid grid-cols-[minmax(0,1fr)_40px] @sm:grid-cols-[150px_minmax(0,1fr)_40px] items-center gap-x-3 gap-y-1 text-[13px] text-left', go2 && 'group')}>
                <span className={cx('text-ink2 font-medium truncate', go2 && 'group-hover:text-brand')}>{k}</span>
                <span className="relative h-3 rounded-full bg-sunken overflow-hidden col-span-2 @sm:col-span-1 order-last @sm:order-none"><span className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: loading ? '0%' : `${(v / 48) * 100}%`, transition: 'width .7s' }} /></span>
                <span className="text-right font-semibold tnum">{v}</span>
              </B>
            </li>
          );
        })}
      </ul>
    </Card>
  );
  const messagesCard = (
    <Card>
      <CardHead title="Messages" sub="WhatsApp, SMS and email from the school, today" icon={I.Send} action={<Link to="communication.history">History</Link>} />
      <div className="px-5 pb-2 grid grid-cols-2 @md:grid-cols-4 gap-2 text-center">
        {[['1,240', 'Sent today'], ['97%', 'Delivered'], ['18', 'Not delivered'], ['5', 'Parent replies']].map(([v, l]) => (
          <div key={l} className="rounded-xl bg-sunken/70 py-2.5"><p className={cx('font-display font-semibold text-[20px] tnum leading-tight', l === 'Not delivered' && 'text-warn')}>{v}</p><p className="text-[11.5px] text-ink3">{l}</p></div>
        ))}
      </div>
      <ul className="px-2 pb-2">
        {[['PTM reminder · Classes 1–3', 'WhatsApp · 9:10 AM · 412 parents', 'communication.history'], ['Half-yearly datesheet · Classes 6–10', 'Notice Board · yesterday · all parents', 'communication.notices'], ['5 parent replies waiting', 'WhatsApp Inbox · oldest 8:40 AM', 'communication.inbox']].map(([t, s, to]) => {
          const go2 = open(to);
          const B = go2 ? 'button' : 'div';
          return (
            <li key={t}>
              <B onClick={go2} className={cx('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left', go2 && 'hover:bg-sunken/70')}>
                <div className="min-w-0 flex-1"><p className="font-semibold text-[14px] truncate">{t}</p><p className="text-[12.5px] text-ink3 truncate">{s}</p></div>
                {go2 && <I.ChevronRight size={17} className="text-ink3 shrink-0" />}
              </B>
            </li>
          );
        })}
      </ul>
    </Card>
  );
  const setupCard = can('setup') && (
    <Card>
      <CardHead title="Setup and users" sub="What the school still has to set up" icon={I.Settings} action={<Link to="setup">Checklist</Link>} />
      <div className="px-5 pb-2">
        <div className="flex items-baseline justify-between gap-3"><p className="font-display text-[24px] font-semibold tnum">8 of 10</p><p className="text-[12.5px] text-ink3">steps done</p></div>
        <span className="mt-1.5 block h-2 rounded-full bg-sunken overflow-hidden"><span className="block h-full rounded-full bg-brand" style={{ width: '80%' }} /></span>
      </div>
      <ul className="px-2 pb-2 pt-1">
        {[['Payment gateway not connected', 'Parents cannot pay online yet', 'settings.gateways'], ['3 staff have not signed in', 'Invites sent 5 Oct', 'settings.users'], ['Report card design', 'Pick one before 20 Oct', 'settings.designs']].map(([t, s, to]) => {
          const go2 = open(to);
          const B = go2 ? 'button' : 'div';
          return (
            <li key={t}>
              <B onClick={go2} className={cx('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left', go2 && 'hover:bg-sunken/70')}>
                <div className="min-w-0 flex-1"><p className="font-semibold text-[14px] truncate">{t}</p><p className="text-[12.5px] text-ink3 truncate">{s}</p></div>
                {go2 && <I.ChevronRight size={17} className="text-ink3 shrink-0" />}
              </B>
            </li>
          );
        })}
      </ul>
    </Card>
  );
  const MAIN = {
    principal: <><div className="grid @lg:grid-cols-2 gap-5 @lg:gap-6">{feeCard}{attCard}</div>{gapsCard}</>,
    office: <><div className="grid @lg:grid-cols-2 gap-5 @lg:gap-6">{admissionsCard}{messagesCard}</div></>,
    vp: <><div className="grid @lg:grid-cols-2 gap-5 @lg:gap-6">{attCard}{examCard}</div>{subsCard}</>,
  }[kind];

  return (
    <div className="flex flex-col gap-5 @lg:gap-6">
      {/* Greeting */}
      <div className="flex flex-col @md:flex-row @md:items-end justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-ink3">Friday, 9 October · School day 86 of 220</p>
          <h1 className="font-display text-[26px] @md:text-[32px] font-semibold tracking-tight leading-tight mt-0.5">Good morning, {role.person.first}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setLoading(true); setTimeout(() => { setLoading(false); setRefreshed('10:43 AM'); }, 600); }}
            className="inline-flex items-center gap-1.5 text-[13px] text-ink3 hover:text-ink h-9 px-2 rounded-lg">
            <I.RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Updated {refreshed}
          </button>
          <Button variant="secondary" size="md" icon={I.Sparkles} onClick={() => setBrief(true)}>Summarise today</Button>
        </div>
      </div>

      {/* The person's day: the one bold moment */}
      <section aria-label="Today at a glance" className="relative overflow-hidden rounded-3xl bg-brand text-brandink shadow-pop">
        <div className="absolute inset-0 dotgrid opacity-60 pointer-events-none" />
        <div className="absolute -right-16 -top-24 w-72 h-72 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="relative grid grid-cols-2 @xl:grid-cols-4">
          {HERO.map((h, i) => <HeroStat key={h.label} loading={loading} onClick={open(h.to)} label={h.label} big={h.big} foot={h.foot} ring={h.ring} last={i === HERO.length - 1} />)}
        </div>
      </section>

      {/* Quick actions on phone as a scroller */}
      {QUICK.length > 0 && (
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
      )}

      <div className="grid @xl:grid-cols-[minmax(0,1fr)_340px] gap-5 @lg:gap-6 items-start">
        <div className="flex flex-col gap-5 @lg:gap-6 min-w-0">
          {/* Needs attention */}
          <Card>
            <CardHead title="Needs your attention" sub="Most urgent first. Each one opens the exact list behind it." icon={I.Flag}
              action={<Pill tone="bad">{attention.length} items</Pill>} />
            <ul className="px-2 pb-2">
              {attention.map((n) => {
                const Ic = n.icon || TONE_ICON[n.tone] || I.TriangleAlert;
                const done = n.remind && reminded.has(n.id);
                const act = n.remind ? () => nudge(n.id, ...n.remind) : () => goTo(go, n.to);
                const label = n.remind ? 'Remind' : n.action;
                return (
                  <li key={n.id}>
                    <div className="flex items-center gap-3.5 px-3 py-3 rounded-xl hover:bg-sunken/70 transition group">
                      <span className={cx('w-10 h-10 rounded-xl grid place-items-center shrink-0', TONE_BG[n.tone])}><Ic size={19} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[14.5px] leading-snug">{n.title}</p>
                        <p className="text-[13px] text-ink3 truncate">{n.detail}</p>
                      </div>
                      {done ? <Pill tone="ok" className="shrink-0"><I.Check size={13} strokeWidth={3} />Reminded</Pill> : (<>
                        <Button size="sm" variant="secondary" className="hidden @sm:inline-flex" icon={n.remind ? I.BellRing : undefined} onClick={act}>{label}</Button>
                        <button className="@sm:hidden w-9 h-9 grid place-items-center rounded-lg text-ink3" onClick={act} aria-label={label}>{n.remind ? <I.Bell size={18} /> : <I.ChevronRight size={20} />}</button>
                      </>)}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          {MAIN}
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

          {kind === 'office' && setupCard}

          <Card>
            <CardHead title="Today and next" icon={I.CalendarDays} action={<Link to="events.calendar">Calendar</Link>} />
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
        </div>
      </div>

      <Sheet open={brief} onClose={() => setBrief(false)} title="Today in one minute" sub="Suggestion · written from today's numbers only">
        <div className="flex flex-col gap-3 text-[14.5px] leading-relaxed">
          {BRIEF.map((b, i) => <p key={i}>{b}</p>)}
          <div className="rounded-xl bg-sunken p-3 text-[12.5px] text-ink3">
            <p className="font-semibold text-ink2 mb-1">Numbers used</p>
            {USED}
          </div>
          <div className="flex gap-2 pt-1 flex-wrap">
            {sendsReminders && <Button variant="primary" icon={I.Send} onClick={() => { setBrief(false); toast({ title: 'Reminder sent to 61 families', body: 'WhatsApp, with SMS backup' }); }}>Send fee reminders</Button>}
            {kind !== 'office' && !reminded.has('nm') && <Button variant="secondary" icon={I.Bell} onClick={() => { setBrief(false); nudge('nm', ...notMarked.remind); }}>Remind {NM_NAMES}</Button>}
            <Button variant="ghost" onClick={() => { setBrief(false); toast({ title: 'Thanks. We will improve these summaries.', tone: 'info' }); }}>Not useful</Button>
          </div>
        </div>
      </Sheet>
    </div>
  );
}

function HeroStat({ label, big, foot, ring, onClick, loading, last }) {
  const B = onClick ? 'button' : 'div';
  return (
    <B onClick={onClick}
      className={cx('text-left p-4 @md:p-6 flex items-center gap-4 border-white/15 min-w-0', onClick && 'hover:bg-white/[.07] transition',
        'border-b @xl:border-b-0 @xl:border-r [&:nth-child(odd)]:border-r', last && '@xl:border-r-0', '[&:nth-child(n+3)]:border-b-0')}>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] @md:text-[13px] font-semibold opacity-90 flex items-center gap-1">{label}{onClick && <I.ChevronRight size={14} className="opacity-60" />}</p>
        {loading ? <div className="h-9 w-28 rounded-lg bg-white/15 my-1.5" /> : (
          <p className="font-display text-[26px] @md:text-[34px] font-semibold tracking-tight leading-tight tnum mt-1 animate-rise">{big}</p>
        )}
        <p className="text-[12px] @md:text-[13px] opacity-90 mt-0.5 truncate">{foot}</p>
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
    </B>
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
