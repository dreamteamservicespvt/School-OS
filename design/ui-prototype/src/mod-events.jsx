// 18 Events & Calendar: School Calendar, Events, PTM, Co-curricular & Sports, Gallery, Daily Activities, Events Settings.
// Example data only. Today is Friday 9 October 2026.
import React, { useMemo, useState } from 'react';
import * as I from './icons.js';
import { STUDENTS, CLASS_7B, FEATURED, STUDENT_PROFILE, inr } from './data.js';
import { STAFF, HOUSES } from './sample.js';
import { cx, Card, CardHead, Button, Pill, Avatar, Checkbox, Input, Field, Segmented, Tabs, Ring, Empty, Sheet, Switch, useToast } from './ui.jsx';
import { useNav, useRole } from './shell.jsx';
import {
  ModuleHead, useCanEdit, Icon, Stats, Band, SearchBox, Toolbar, Select, Textarea, Chips, DataList, BulkBar, Row, SettingRow,
  SettingsCard, Banner, Suggestion, Progress, HBars, Legend, DL, Timeline, MoreMenu, FormSheet, ConfirmSheet, Split, Col, ExportButton, TONE_SOFT,
  DatePeriod, PERIODS, fmtRange, periodDays, schoolDay,
} from './kit.jsx';

const fmt = (n) => Number(n).toLocaleString('en-IN');
const pad = (n) => String(n).padStart(2, '0');
const ds = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const TODAY = '2026-10-09';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const nice = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${DOW[new Date(y, m - 1, d).getDay()]}, ${d} ${MONTHS[m - 1].slice(0, 3)}`; };
const niceY = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`; };
const dmy = (iso) => iso.split('-').reverse().join('-');
const firstL = (s) => `${s.first} ${s.last[0]}.`;
// '9 Oct 2026', 'Fri 9 Oct 2026' or 'Sat 17 Oct' (2026–27) -> '2026-10-09'
const MON3 = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const isoOf = (str) => { const m = /(\d{1,2}) ([A-Z][a-z]{2})(?: (\d{4}))?/.exec(str || ''); if (!m) return TODAY; const mo = MON3[m[2]]; const y = m[3] ? Number(m[3]) : mo >= 6 ? 2026 : 2027; return `${y}-${pad(mo)}-${pad(Number(m[1]))}`; };
const inPer = (iso, per) => iso >= per.from && iso <= per.to;
const showing = (per, n, what) => <p className="text-[12.5px] text-ink3 tnum px-1">Showing: {per.label} · {fmtRange(per)} · {n} {what}</p>;

// A page this person does not use in Events & Calendar: say where their part is, without any data.
function NotForRole({ title, body }) {
  const { go } = useNav();
  return (
    <div>
      <ModuleHead sub="Events & Calendar" />
      <Card><Empty icon={I.CalendarDays} title={title} body={body} action={<Button variant="secondary" icon={I.CalendarDays} onClick={() => go('events', { page: 'calendar' })}>Open the School Calendar</Button>} /></Card>
    </div>
  );
}

/* ======================= Calendar entries ======================= */
// Types are the Calendar Entry types (decided 9 Oct 2026); weekends come from Events Settings
const TYPE = {
  holiday: { label: 'Holiday', chip: 'bg-bad/12 text-bad', dot: 'bg-bad', tone: 'bad', att: false },
  vacation: { label: 'Vacation', chip: 'bg-bad/10 text-bad', dot: 'bg-bad', tone: 'bad', att: false },
  exam: { label: 'Exam day', chip: 'bg-info/12 text-info', dot: 'bg-info', tone: 'info', att: true },
  event: { label: 'Event', chip: 'bg-ok/12 text-ok', dot: 'bg-ok', tone: 'ok', att: true },
  ptm: { label: 'PTM', chip: 'bg-brand/12 text-brand', dot: 'bg-brand', tone: 'brand', att: true },
  test: { label: 'Admission test', chip: 'bg-warn/15 text-warn', dot: 'bg-warn', tone: 'warn', att: true },
};
const C610 = ['6', '7', '8', '9', '10'];
const CAL = [
  { id: 'e01', from: '2026-06-01', name: 'School reopens', type: 'event', note: 'Academic year 2026–27 begins' },
  { id: 'e02', from: '2026-07-18', name: 'PTM: all classes', type: 'ptm', time: '9:30 AM' },
  { id: 'e03', from: '2026-07-20', to: '2026-07-24', name: 'Unit Test 1', type: 'exam', src: 'Datesheet', note: 'Classes 1–10' },
  { id: 'e04', from: '2026-08-15', short: 'Independence', name: 'Independence Day', type: 'holiday', note: 'Flag hoisting at 8:00 AM' },
  { id: 'e05', from: '2026-09-05', name: 'Teachers’ Day', type: 'event', time: '10:00 AM', where: 'Assembly hall' },
  { id: 'e06', from: '2026-09-15', short: 'Science expo', name: 'Science exhibition', type: 'event', time: '9:00 AM', where: 'Auditorium', cls: ['6', '7', '8'] },
  { id: 'e07', from: '2026-09-21', to: '2026-09-25', name: 'Unit Test 2', type: 'exam', src: 'Datesheet', note: 'Classes 1–10' },
  { id: 'e08', from: '2026-10-02', name: 'Gandhi Jayanti', type: 'holiday' },
  { id: 'e09', from: '2026-10-09', short: 'PTM 1–3', name: 'PTM: Classes 1–3', type: 'ptm', time: '11:30 AM', where: 'Assembly hall', cls: ['1', '2', '3'] },
  { id: 'e10', from: '2026-10-09', name: 'Fire drill', type: 'event', time: '1:15 PM', where: 'Whole school' },
  { id: 'e11', from: '2026-10-09', name: 'Staff meeting', type: 'event', time: '3:00 PM', where: 'Principal’s room', note: 'All teaching staff' },
  ...['12', '13', '14', '15', '16', '26', '27'].map((d) => ({ id: 'x' + d, from: `2026-10-${d}`, short: 'Half-yearly', name: 'Half-yearly exams', type: 'exam', time: '8:45 AM', src: 'Datesheet', cls: C610, note: 'Classes 6–10 · from the published datesheet' })),
  { id: 'e12', from: '2026-10-17', short: 'PTM 4–10', name: 'PTM: Classes 4–10', type: 'ptm', time: '9:30 AM', where: 'Classrooms', cls: ['4', '5', ...C610] },
  { id: 'e13', from: '2026-10-19', to: '2026-10-25', short: 'Dussehra', name: 'Dussehra holidays', type: 'vacation', note: 'Reopens Monday 26 October' },
  { id: 'e14', from: '2026-10-24', short: 'Wonderla', name: 'Wonderla picnic', type: 'event', time: '7:00 AM', where: 'Wonderla, Raviryal', cls: ['5', '6', '7'], note: '₹1,200 · parent consent on Parent Link' },
  { id: 'e15', from: '2026-10-29', short: 'Debate', name: 'Inter-house debate', type: 'event', time: '2:20 PM', where: 'Library hall', cls: ['8', '9', '10'] },
  { id: 'e16', from: '2026-10-31', short: 'Sports practice', name: 'Annual Sports Day practice', type: 'event', time: '8:45 AM', where: 'School ground' },
  { id: 'e17', from: '2026-11-06', short: 'Diwali fest', name: 'Diwali celebration', type: 'event', time: '11:30 AM', where: 'Assembly hall' },
  { id: 'e18', from: '2026-11-07', short: 'Admission test', name: 'Admission test 2027–28', type: 'test', time: '9:30 AM', where: 'Classrooms, ground floor' },
  { id: 'e19', from: '2026-11-08', name: 'Diwali', type: 'holiday' },
  { id: 'e20', from: '2026-11-14', name: 'Children’s Day', type: 'event', time: '9:00 AM', where: 'Assembly hall', note: 'School open till 12 noon' },
  { id: 'e21', from: '2026-11-21', short: 'Sports Day', name: 'Annual Sports Day', type: 'event', time: '8:00 AM', where: 'School ground' },
  { id: 'e22', from: '2026-12-19', short: 'PTM Nur–UKG', name: 'PTM: Nursery to UKG', type: 'ptm', time: '9:30 AM', cls: ['NUR', 'LKG', 'UKG'] },
  { id: 'e23', from: '2026-12-20', name: 'Alumni meet 2026', type: 'event', time: '5:00 PM', where: 'Auditorium' },
  { id: 'e24', from: '2026-12-25', name: 'Christmas', type: 'holiday' },
  { id: 'e25', from: '2027-01-12', to: '2027-01-16', short: 'Sankranti', name: 'Sankranti holidays', type: 'vacation' },
  { id: 'e26', from: '2027-01-26', name: 'Republic Day', type: 'holiday', note: 'Flag hoisting at 8:00 AM' },
  { id: 'e27', from: '2027-03-01', to: '2027-03-12', name: 'Annual exams', type: 'exam', src: 'Datesheet', note: 'Classes 1–9' },
];
// Last school year (2025–26), so people can look back at earlier months
const PREV = [
  { id: 'p01', from: '2025-06-02', name: 'School reopens', type: 'event', note: 'Academic year 2025–26 began' },
  { id: 'p02', from: '2025-07-21', to: '2025-07-25', name: 'Unit Test 1', type: 'exam', src: 'Datesheet', note: 'Classes 1–10' },
  { id: 'p03', from: '2025-08-15', name: 'Independence Day', type: 'holiday' },
  { id: 'p04', from: '2025-08-27', name: 'Ganesh Chaturthi', type: 'holiday' },
  { id: 'p05', from: '2025-09-13', name: 'PTM: all classes', type: 'ptm', time: '9:30 AM' },
  { id: 'p06', from: '2025-10-01', to: '2025-10-03', short: 'Dussehra', name: 'Dussehra holidays', type: 'vacation' },
  { id: 'p07', from: '2025-10-13', to: '2025-10-24', short: 'Half-yearly', name: 'Half-yearly exams', type: 'exam', src: 'Datesheet', note: 'Classes 6–10' },
  { id: 'p08', from: '2025-10-20', to: '2025-10-21', name: 'Diwali', type: 'vacation' },
  { id: 'p09', from: '2025-11-14', name: 'Children’s Day', type: 'event', time: '9:00 AM', where: 'Assembly hall' },
  { id: 'p10', from: '2025-11-22', short: 'Sports Day', name: 'Annual Sports Day', type: 'event', time: '8:00 AM', where: 'School ground' },
  { id: 'p11', from: '2025-12-25', name: 'Christmas', type: 'holiday' },
  { id: 'p12', from: '2026-01-01', to: '2026-01-03', short: 'Winter break', name: 'Winter break', type: 'vacation' },
  { id: 'p13', from: '2026-01-26', name: 'Republic Day', type: 'holiday' },
  { id: 'p14', from: '2026-02-14', short: 'Annual Day', name: 'Annual Day 2025–26', type: 'event', time: '5:00 PM', where: 'Auditorium' },
  { id: 'p15', from: '2026-03-02', to: '2026-03-13', name: 'Annual exams', type: 'exam', src: 'Datesheet', note: 'Classes 1–9' },
  { id: 'p16', from: '2026-03-04', name: 'Holi', type: 'holiday' },
  { id: 'p17', from: '2026-04-15', to: '2026-05-31', short: 'Summer', name: 'Summer holidays', type: 'vacation', note: 'School reopens 1 June' },
];
const CAL_FROM = new Date(2025, 5, 1), CAL_TO = new Date(2027, 2, 1);
const CAL_MONTHS = Array.from({ length: 22 }, (_, i) => { const d = new Date(2025, 5 + i, 1); return { value: `${d.getFullYear()}-${d.getMonth()}`, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` }; }).reverse();
const weekendOf = (y, m, d) => { const dow = new Date(y, m, d).getDay(); return dow === 0 ? 'Sunday' : dow === 6 && Math.ceil(d / 7) === 2 ? 'Second Saturday' : null; };
const onDay = (list, iso) => list.filter((e) => iso >= e.from && iso <= (e.to || e.from));
const span = (e) => (e.to ? `${niceY(e.from).replace(/ \d{4}$/, '')} – ${niceY(e.to)}` : niceY(e.from));

function SchoolCalendar({ access }) {
  const { role } = useRole();
  const toast = useToast();
  const canEdit = useCanEdit();
  const full = access === 'full' && canEdit;
  const [list, setList] = useState(() => [...PREV, ...CAL]);
  const [ym, setYm] = useState([2026, 9]);
  const [per, setPer] = useState(PERIODS.acyear);
  const [sel, setSel] = useState(TODAY);
  const [type, setType] = useState('all');
  const [cls, setCls] = useState('all');
  const [view, setView] = useState('month');
  const [add, setAdd] = useState(false);
  const [rm, setRm] = useState(null);
  const [y, m] = ym;
  const shown = list.filter((e) => (type === 'all' || e.type === type || (type === 'holiday' && e.type === 'vacation')) && (cls === 'all' || !e.cls || e.cls.includes(cls)));
  const days = new Date(y, m + 1, 0).getDate();
  const lead = (new Date(y, m, 1).getDay() + 6) % 7;
  const step = (k) => { const n = new Date(y, m + k, 1); if (n < CAL_FROM || n > CAL_TO) return; setYm([n.getFullYear(), n.getMonth()]); setSel(ds(n.getFullYear(), n.getMonth(), 1)); };
  const ay = m >= 5 ? y : y - 1; // academic year of the month on screen
  const ayLabel = `${ay}–${String(ay + 1).slice(2)}`;
  const listed = [...shown].filter((e) => (e.to || e.from) >= per.from && e.from <= per.to).sort((a, b) => a.from.localeCompare(b.from));
  const selDay = (() => { const [a, b, c] = sel.split('-').map(Number); return { y: a, m: b - 1, d: c }; })();
  const selEntries = onDay(shown, sel);
  const selWeekend = weekendOf(selDay.y, selDay.m, selDay.d);
  const coming = shown.filter((e) => (e.to || e.from) >= TODAY).sort((a, b) => a.from.localeCompare(b.from)).slice(0, 7);
  const holidays = list.filter((e) => (e.type === 'holiday' || e.type === 'vacation') && e.from >= `${ay}-06-01` && e.from <= `${ay + 1}-05-31`).sort((a, b) => a.from.localeCompare(b.from));
  const own = access === 'own';
  const remove = (e) => { setList((x) => x.filter((z) => z.id !== e.id)); toast({ title: `${e.name} removed`, body: e.type === 'holiday' || e.type === 'vacation' ? `Attendance is needed again on ${dmy(e.from)}.` : 'Taken off the calendar.', undo: () => setList((x) => [...x, e]) }); };

  return (
    <div>
      <ModuleHead sub={own ? 'The whole school’s calendar. Your PTM slots are on the PTM page.' : access === 'view' ? 'Holidays, exams, events and PTMs. Go back to last year or ahead to March. Read only.' : 'Holidays, vacations, exams, events and PTMs in one place, from last year to March 2027.'}
        actions={full && <>
          <Button variant="secondary" icon={I.Upload} className="hidden @md:inline-flex" onClick={() => toast({ title: 'Import holiday list', body: 'Pick an Excel file, or copy last year’s list with dates to check.', tone: 'info' })}>Import</Button>
          <Button variant="primary" icon={I.Plus} onClick={() => setAdd(true)}>Add to calendar</Button>
        </>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <div className="flex flex-col @lg:flex-row gap-2.5 @lg:items-center">
          <div className="flex items-center gap-1">
            <button onClick={() => step(-1)} disabled={new Date(y, m - 1, 1) < CAL_FROM} aria-label="Earlier month" className="w-10 h-10 grid place-items-center rounded-xl border border-line bg-surface text-ink2 hover:bg-sunken disabled:opacity-40"><I.ChevronLeft size={18} /></button>
            <Select id="cal-jump" value={`${y}-${m}`} onChange={(v) => { const [a, b] = v.split('-').map(Number); setYm([a, b]); setSel(a === 2026 && b === 9 ? TODAY : ds(a, b, 1)); }} className="w-44 min-w-0" options={CAL_MONTHS} />
            <button onClick={() => step(1)} disabled={new Date(y, m + 1, 1) > CAL_TO} aria-label="Later month" className="w-10 h-10 grid place-items-center rounded-xl border border-line bg-surface text-ink2 hover:bg-sunken disabled:opacity-40"><I.ChevronRight size={18} /></button>
            <Button variant="ghost" className="ml-1" onClick={() => { setYm([2026, 9]); setSel(TODAY); }}>Today</Button>
          </div>
          <div className="flex-1" />
          <Select id="cal-cls" value={cls} onChange={setCls} className="@lg:w-44" options={[{ value: 'all', label: 'All classes' }, ...['NUR', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].map((c) => ({ value: c, label: c === 'NUR' ? 'Nursery' : /\d/.test(c) ? `Class ${c}` : c }))]} />
          <Segmented value={view} onChange={setView} options={[{ value: 'month', label: 'Month', icon: I.CalendarDays }, { value: 'list', label: 'Year list', icon: I.List }]} />
        </div>
        <Chips value={type} onChange={setType} options={[{ value: 'all', label: 'Everything' }, { value: 'holiday', label: 'Holidays' }, { value: 'exam', label: 'Exams' }, { value: 'event', label: 'Events' }, { value: 'ptm', label: 'PTMs' }, { value: 'test', label: 'Admission tests' }]} />

        {view === 'month' ? (
          <Split side={340}>
            <Card className="overflow-hidden min-w-0">
              <div className="px-4 @md:px-5 pt-4 pb-3 flex items-center justify-between gap-3">
                <h3 className="font-display font-semibold text-[19px]">{MONTHS[m]} {y}</h3>
                <span className="text-[12.5px] text-ink3">{shown.filter((e) => e.from.startsWith(`${y}-${pad(m + 1)}`)).length} entries</span>
              </div>
              <div className="grid grid-cols-7 border-t border-line/70 text-center text-[11.5px] font-semibold text-ink3">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <span key={d} className="py-2">{d}</span>)}
              </div>
              <div className="grid grid-cols-7 border-t border-line/70">
                {Array.from({ length: lead }).map((_, i) => <span key={'b' + i} className="border-r border-b border-line/50 bg-sunken/30" />)}
                {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
                  const iso = ds(y, m, d);
                  const es = onDay(shown, iso);
                  const wk = weekendOf(y, m, d);
                  const off = es.some((e) => !TYPE[e.type].att);
                  const isSel = iso === sel;
                  return (
                    <button key={d} onClick={() => setSel(iso)} aria-pressed={isSel} aria-label={`${d} ${MONTHS[m]}${es.length ? ': ' + es.map((e) => e.name).join(', ') : ''}${wk ? ', ' + wk : ''}`}
                      className={cx('relative min-h-[56px] @lg:min-h-[104px] border-r border-b border-line/50 p-1 @lg:p-1.5 text-left flex flex-col gap-1 transition hover:bg-sunken/60 min-w-0',
                        off ? 'bg-bad/[.05]' : wk ? 'bg-sunken/60' : '', isSel && 'ring-2 ring-inset ring-brand')}>
                      <span className="flex items-center gap-1">
                        <span className={cx('w-7 h-7 rounded-full grid place-items-center text-[13px] font-semibold tnum shrink-0', iso === TODAY ? 'bg-brand text-brandink' : off ? 'text-bad' : wk ? 'text-ink3' : 'text-ink2')}>{d}</span>
                        {wk && <span className="hidden @xl:inline text-[10.5px] text-ink3 truncate">{wk === 'Sunday' ? '' : '2nd Sat'}</span>}
                      </span>
                      <span className="hidden @lg:flex flex-col gap-0.5 min-w-0">
                        {es.slice(0, 3).map((e) => <span key={e.id} title={e.name} className={cx('truncate rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-tight', TYPE[e.type].chip)}>{e.short || e.name}</span>)}
                        {es.length > 3 && <span className="text-[11px] text-ink3 font-semibold px-1">+{es.length - 3} more</span>}
                      </span>
                      <span className="@lg:hidden flex gap-0.5 justify-center flex-wrap">{es.slice(0, 3).map((e) => <span key={e.id} className={cx('w-1.5 h-1.5 rounded-full', TYPE[e.type].dot)} />)}</span>
                    </button>
                  );
                })}
              </div>
              <div className="px-4 @md:px-5 py-3.5 flex flex-col gap-2">
                <Legend items={[['bg-bad/40', 'Holiday or vacation'], ['bg-info/40', 'Exam day'], ['bg-ok/40', 'Event'], ['bg-brand/40', 'PTM'], ['bg-warn/40', 'Admission test'], ['bg-sunken border border-line', 'Weekend']]} />
                <p className="text-[12.5px] text-ink3">Holiday: attendance is off that day. Event: it shows here and attendance can still be taken. Weekends: Sundays and the second Saturday.</p>
              </div>
            </Card>
            <Col>
              <Card>
                <CardHead title={sel === TODAY ? `Today, ${nice(sel).split(', ')[1]}` : nice(sel)} sub={selWeekend ? `${selWeekend} · no school` : selEntries.some((e) => !TYPE[e.type].att) ? 'Attendance is off' : 'School day'} icon={I.CalendarDays}
                  action={full && <Button size="sm" variant="soft" icon={I.Plus} onClick={() => setAdd(true)}>Add</Button>} />
                {selEntries.length ? (
                  <ul className="px-3 pb-3 flex flex-col">
                    {selEntries.map((e) => (
                      <li key={e.id} className="flex items-start gap-3 px-2 py-2.5 rounded-xl hover:bg-sunken/60">
                        <span className={cx('w-10 h-10 rounded-xl grid place-items-center shrink-0', TONE_SOFT[TYPE[e.type].tone])}><Icon name={{ holiday: 'Sun', vacation: 'Palmtree', exam: 'ClipboardCheck', event: 'PartyPopper', ptm: 'Users', test: 'PencilLine' }[e.type]} size={18} /></span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[14.5px] leading-snug">{e.name}</p>
                          <p className="text-[12.5px] text-ink3">{[e.time, e.where, e.to && span(e)].filter(Boolean).join(' · ') || TYPE[e.type].label}</p>
                          {e.note && <p className="text-[12.5px] text-ink2 mt-0.5">{e.note}</p>}
                          <div className="flex gap-1.5 mt-1.5 flex-wrap"><Pill tone={TYPE[e.type].tone} className="!h-[22px] !text-[11.5px]">{TYPE[e.type].label}</Pill>{e.src && <Pill tone="neutral" className="!h-[22px] !text-[11.5px]">From the datesheet</Pill>}</div>
                        </div>
                        {full && !e.src && e.from >= '2026-06-01' && <button onClick={() => (e.type === 'holiday' || e.type === 'vacation' ? setRm(e) : remove(e))} aria-label={`Remove ${e.name}`} className="w-9 h-9 grid place-items-center rounded-lg text-ink3 hover:bg-sunken hover:text-bad shrink-0"><I.Trash2 size={16} /></button>}
                      </li>
                    ))}
                  </ul>
                ) : <p className="px-5 pb-5 text-[14px] text-ink3">{selWeekend ? 'Weekend. Nothing planned.' : 'A normal school day. Nothing extra planned.'}</p>}
              </Card>
              <Card>
                <CardHead title="Coming up" sub="Next on the calendar" icon={I.CalendarClock} />
                <ul className="px-3 pb-3">
                  {coming.map((e) => (
                    <li key={e.id}>
                      <button onClick={() => { const [a, b] = e.from.split('-').map(Number); setYm([a, b - 1]); setSel(e.from); }} className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-sunken/60 text-left">
                        <span className="w-11 shrink-0 text-center"><span className="block text-[11px] font-semibold text-ink3 uppercase">{MONTHS[Number(e.from.slice(5, 7)) - 1].slice(0, 3)}</span><span className="block font-display text-[18px] font-semibold tnum leading-none">{Number(e.from.slice(8))}</span></span>
                        <span className="min-w-0 flex-1"><span className="block font-semibold text-[14px] truncate">{e.name}</span><span className="block text-[12.5px] text-ink3 truncate">{e.to ? span(e) : [e.time, e.where].filter(Boolean).join(' · ') || TYPE[e.type].label}</span></span>
                        <span className={cx('w-2 h-2 rounded-full shrink-0', TYPE[e.type].dot)} />
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            </Col>
          </Split>
        ) : (
          <Card className="overflow-hidden">
            <CardHead title="Calendar list" sub="Exams come from published datesheets; events and PTMs from their pages" action={<ExportButton what="calendar" />} />
            <Toolbar><DatePeriod id="cal-per" future value={per} onChange={setPer} className="w-full @md:w-auto" /></Toolbar>
            <DataList rows={listed} minWidth={720} footer={`Showing: ${per.label} · ${fmtRange(per)} · ${listed.length} entries`}
              empty={<Empty icon={I.CalendarX2} title="Nothing on the calendar in these dates" body="Pick other dates." action={<Button variant="secondary" onClick={() => setPer(PERIODS.acyear)}>This academic year</Button>} />}
              columns={[
                { key: 'from', label: 'Date', nowrap: true, render: (e) => <span className="tnum">{span(e)}</span> },
                { key: 'name', label: 'Name', render: (e) => <span className="font-semibold">{e.name}</span> },
                { key: 'type', label: 'Type', render: (e) => <Pill tone={TYPE[e.type].tone}>{TYPE[e.type].label}</Pill> },
                { key: 'att', label: 'Attendance', render: (e) => (TYPE[e.type].att ? <span className="text-ink2">Taken</span> : <span className="text-bad font-semibold">Off</span>) },
                { key: 'cls', label: 'Applies to', render: (e) => <span className="text-[13px] text-ink2">{e.note && e.note.startsWith('Classes') ? e.note.split(' ·')[0] : e.cls ? `Classes ${e.cls[0]}–${e.cls[e.cls.length - 1]}` : 'Whole school'}</span> },
              ]}
              mobile={(e) => ({ title: e.name, sub: span(e), icon: 'CalendarDays', iconTone: TYPE[e.type].tone, pills: [<Pill key="t" tone={TYPE[e.type].tone} className="!h-[22px] !text-[11.5px]">{TYPE[e.type].label}</Pill>] })} />
          </Card>
        )}

        <Card className="overflow-hidden">
          <CardHead title={`Holiday list ${ayLabel}`} sub={`${holidays.length} holidays and vacations · attendance is off on these days`} icon={I.Sun} action={<ExportButton what="holiday list" />} />
          <div className="overflow-x-auto scroll-thin border-t border-line">
            <table className="w-full text-[14px] min-w-[520px]">
              <thead><tr className="text-[12px] text-ink3 text-left border-b border-line"><th className="px-5 py-2.5 font-semibold">Date</th><th className="px-3 py-2.5 font-semibold">Name</th><th className="px-3 py-2.5 font-semibold">Type</th><th className="px-5 py-2.5 font-semibold text-right">Days</th></tr></thead>
              <tbody>
                {holidays.map((e) => {
                  const n = e.to ? Math.round((new Date(e.to) - new Date(e.from)) / 864e5) + 1 : 1;
                  return (
                    <tr key={e.id} className={cx('border-b border-line/70 last:border-0', (e.to || e.from) < TODAY && 'text-ink3')}>
                      <td className="px-5 py-2.5 tnum whitespace-nowrap">{span(e)}</td>
                      <td className="px-3 py-2.5 font-semibold">{e.name}</td>
                      <td className="px-3 py-2.5"><Pill tone="bad">{TYPE[e.type].label}</Pill></td>
                      <td className="px-5 py-2.5 text-right tnum">{n}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <CalendarForm open={add} onClose={() => setAdd(false)} defDate={dmy(sel)} onSaved={(e) => { setList((x) => [...x, e]); const [a, b] = e.from.split('-').map(Number); setYm([a, b - 1]); setSel(e.from); toast({ title: `${TYPE[e.type].label} added: ${e.name}`, body: TYPE[e.type].att ? 'It shows on the calendar. Attendance can still be taken.' : `Attendance is off on ${dmy(e.from)}${e.to ? ` to ${dmy(e.to)}` : ''}.`, undo: () => setList((x) => x.filter((z) => z.id !== e.id)) }); }} />
      <ConfirmSheet open={!!rm} onClose={() => setRm(null)} title={rm ? `Remove ${rm.name}?` : ''} sub={rm ? `Attendance will be needed for ${dmy(rm.from)}${rm.to ? ` to ${dmy(rm.to)}` : ''}. Teachers are told on their attendance screen.` : ''}
        confirmLabel="Remove and switch attendance on" onConfirm={() => remove(rm)} danger />
    </div>
  );
}

function CalendarForm({ open, onClose, onSaved, defDate }) {
  const blank = { name: '', type: 'holiday', date: '', to: '', att: false, applies: 'Whole school', desc: '', notify: true };
  const [f, setF] = useState(blank);
  const [tried, setTried] = useState(false);
  const [key, setKey] = useState(null);
  if (open && key !== defDate) { setKey(defDate); setF({ ...blank, date: defDate }); setTried(false); }
  const iso = (v) => (/^\d{2}-\d{2}-\d{4}$/.test(v) ? v.split('-').reverse().join('-') : null);
  const d1 = iso(f.date), d2 = iso(f.to);
  const isHol = d1 && onDay(CAL, d1).some((e) => !TYPE[e.type].att);
  const err = {
    name: !f.name.trim() ? 'Give it a name, like “Republic Day”' : '',
    date: !d1 ? 'Enter the date as DD-MM-YYYY' : d1 < '2026-06-01' || d1 > '2027-03-31' ? 'Pick a date inside 2026–27 (1 Jun 2026 to 31 Mar 2027)' : f.type === 'ptm' && isHol ? `${f.date} is a holiday. Pick a working day.` : '',
    to: f.type === 'vacation' && (!d2 ? 'Enter the last day as DD-MM-YYYY' : d1 && d2 < d1 ? 'The last day is before the first day' : '') || '',
  };
  const attTaken = d1 && d1 <= TODAY && !TYPE[f.type].att;
  return (
    <FormSheet open={open} onClose={onClose} title="Add to calendar" sub="Holidays switch attendance off for that day." submitLabel="Add to calendar"
      onSubmit={() => { setTried(true); if (Object.values(err).some(Boolean)) return false; onSaved({ id: 'n' + Date.now(), from: d1, to: f.type === 'vacation' ? d2 : undefined, name: f.name.trim(), type: f.type, note: f.applies !== 'Whole school' ? f.applies : f.desc || undefined }); setKey(null); }}>
      <Field label="Name" required id="cf-name" error={tried && err.name}><Input id="cf-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={tried && err.name} placeholder="For example: Republic Day, Annual Function" /></Field>
      <Field label="Type" required id="cf-type"><Select id="cf-type" value={f.type} onChange={(v) => setF({ ...f, type: v, att: TYPE[v].att })} options={Object.entries(TYPE).map(([k, t]) => ({ value: k, label: t.label }))} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={f.type === 'vacation' ? 'From' : 'Date'} required id="cf-date" hint="DD-MM-YYYY" error={tried && err.date}><Input id="cf-date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} error={tried && err.date} className="tnum" placeholder="26-01-2027" /></Field>
        {f.type === 'vacation' && <Field label="To" required id="cf-to" hint="Last day off" error={tried && err.to}><Input id="cf-to" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} error={tried && err.to} className="tnum" placeholder="16-01-2027" /></Field>}
      </div>
      {attTaken && <Banner tone="warn" title={`Attendance was taken for 41 classes on ${f.date}.`}>Make it a holiday anyway? Those marks will not count.</Banner>}
      <div className="rounded-xl bg-sunken/70 p-3.5 flex items-center gap-3">
        <Switch id="cf-att" on={f.att} onChange={(v) => setF({ ...f, att: v })} label="Allow attendance on this date" />
        <label htmlFor="cf-att" className="text-[14px]"><b className="font-semibold">Allow attendance on this date</b><span className="block text-[12.5px] text-ink3">{f.att ? 'Teachers take attendance as usual.' : 'Attendance is off and reports leave the day out.'}</span></label>
      </div>
      <Field label="Applies to" id="cf-app"><Select id="cf-app" value={f.applies} onChange={(v) => setF({ ...f, applies: v })} options={['Whole school', 'Classes 6–10', 'Classes 1–5', 'Nursery to UKG', 'Hostel only']} /></Field>
      <details className="group">
        <summary className="cursor-pointer text-[13.5px] font-semibold text-brand list-none flex items-center gap-1.5"><I.ChevronRight size={15} className="group-open:rotate-90 transition" />More details</summary>
        <div className="flex flex-col gap-3 mt-3">
          <Field label="Description" id="cf-desc"><Textarea id="cf-desc" value={f.desc} onChange={(v) => setF({ ...f, desc: v })} rows={2} /></Field>
          <label className="flex items-center gap-3 text-[14px]"><Checkbox checked={f.notify} onChange={(v) => setF({ ...f, notify: v })} label="Tell parents" />Tell parents on Parent Link and WhatsApp</label>
        </div>
      </details>
    </FormSheet>
  );
}

/* ======================= Events ======================= */
const EV_TONE = { Planned: 'info', 'Open for registration': 'ok', Done: 'neutral', Cancelled: 'bad' };
const EVENTS = [
  { id: 'EV-26-027', name: 'Fire drill', type: 'Safety drill', date: 'Fri 9 Oct 2026', time: '1:15 PM', venue: 'Whole school', aud: 'Students and staff', status: 'Planned', icon: 'Flame', today: true },
  { id: 'EV-26-026', name: 'Staff meeting', type: 'Meeting', date: 'Fri 9 Oct 2026', time: '3:00 PM', venue: 'Principal’s room', aud: 'All teaching staff', status: 'Planned', icon: 'Users', today: true },
  { id: 'EV-26-031', name: 'Wonderla picnic', type: 'Trip', date: 'Sat 24 Oct 2026', time: '7:00 AM – 7:30 PM', venue: 'Wonderla, Raviryal', aud: 'Classes 5–7', cls: ['5', '6', '7'], reg: 148, seats: 250, fee: 1200, status: 'Open for registration', icon: 'FerrisWheel', consent: { given: 148, wait: 96, no: 6 }, vols: 12 },
  { id: 'EV-26-025', name: 'Inter-house debate', type: 'Competition', date: 'Thu 29 Oct 2026', time: '2:20 PM – 3:45 PM', venue: 'Library hall', aud: 'Classes 8–10', cls: ['8', '9', '10'], reg: 32, seats: 32, status: 'Open for registration', icon: 'Mic' },
  { id: 'EV-26-032', name: 'Annual Sports Day practice', type: 'Sports day', date: 'Sat 31 Oct 2026', time: '8:45 AM – 12:30 PM', venue: 'School ground', aud: 'Participants, Classes 3–10', cls: ['3', '4', '5', '6', '7', '8', '9', '10'], status: 'Planned', icon: 'Medal' },
  { id: 'EV-26-028', name: 'Diwali celebration', type: 'Cultural', date: 'Fri 6 Nov 2026', time: '11:30 AM – 1:00 PM', venue: 'Assembly hall', aud: 'Whole school', status: 'Planned', icon: 'Sparkles' },
  { id: 'EV-26-029', name: 'Children’s Day', type: 'Cultural', date: 'Sat 14 Nov 2026', time: '9:00 AM – 12:00 PM', venue: 'Assembly hall', aud: 'Nursery to Class 5', cls: ['NUR', 'LKG', 'UKG', '1', '2', '3', '4', '5'], status: 'Planned', icon: 'PartyPopper' },
  { id: 'EV-26-030', name: 'Annual Sports Day', type: 'Sports day', date: 'Sat 21 Nov 2026', time: '8:00 AM – 1:00 PM', venue: 'School ground', aud: 'Whole school and parents', reg: 386, seats: null, status: 'Open for registration', icon: 'Trophy', vols: 34 },
  { id: 'EV-26-033', name: 'Alumni meet 2026', type: 'Alumni', date: 'Sun 20 Dec 2026', time: '5:00 PM – 8:30 PM', venue: 'Auditorium', aud: 'Alumni, batches 2010–2025', reg: 64, seats: 300, status: 'Open for registration', icon: 'GraduationCap' },
  { id: 'EV-26-024', name: 'Science Centre visit', type: 'Trip', date: 'Wed 30 Sep 2026', time: '9:00 AM – 2:00 PM', venue: 'Birla Science Centre', aud: 'Class 8', cls: ['8'], reg: 78, seats: 90, fee: 350, status: 'Cancelled', icon: 'Bus', why: 'Heavy rain warning. Fees refunded through Fee Management.' },
  { id: 'EV-26-020', name: 'Science exhibition', type: 'Competition', date: 'Tue 15 Sep 2026', time: '9:00 AM – 1:00 PM', venue: 'Auditorium', aud: 'Classes 6–8', cls: ['6', '7', '8'], reg: 236, seats: null, status: 'Done', icon: 'FlaskConical', attended: 231 },
  { id: 'EV-26-018', name: 'Teachers’ Day', type: 'Cultural', date: 'Sat 5 Sep 2026', time: '10:00 AM – 12:00 PM', venue: 'Assembly hall', aud: 'Whole school', status: 'Done', icon: 'Heart' },
  { id: 'EV-26-012', name: 'Independence Day', type: 'National day', date: 'Sat 15 Aug 2026', time: '8:00 AM – 10:30 AM', venue: 'School ground', aud: 'Whole school', status: 'Done', icon: 'Flag' },
];
const myClasses = (roleId) => (roleId === 'classteacher' ? ['7', '8'] : roleId === 'teacher' ? ['6', '7'] : null);

function Events({ access, params }) {
  const { role } = useRole();
  const { go } = useNav();
  const toast = useToast();
  const canEdit = useCanEdit();
  const full = access === 'full' && canEdit;
  const acc = role.id === 'accountant';
  const [items, setItems] = useState(EVENTS);
  const [f, setF] = useState('all');
  const [q, setQ] = useState('');
  const [per, setPer] = useState(PERIODS.acyear);
  const [add, setAdd] = useState(false);
  // Events is for the people who run events, and for the Accountant (event payments). Everyone else has the School Calendar.
  if (access !== 'full' && !acc) return <NotForRole title="Events are on the School Calendar" body="Your part of Events & Calendar is the School Calendar. Every event, holiday, exam and PTM shows there." />;
  if (params?.id) {
    const ev = items.find((e) => e.id === params.id) || items[0];
    if (acc && !ev.fee) return <NotForRole title="No payments for this event" body="Only events with a fee show here." />;
    return <EventDetail ev={ev} access={access} onBack={() => go('events', { page: 'events' })} onChange={(n) => setItems((x) => x.map((e) => (e.id === n.id ? n : e)))} />;
  }
  const scoped = acc ? items.filter((e) => e.fee) : items;
  const rows = scoped.filter((e) => inPer(isoOf(e.date), per) && (f === 'up' ? ['Planned', 'Open for registration'].includes(e.status) : f === 'done' ? e.status === 'Done' : f === 'cancel' ? e.status === 'Cancelled' : true) && (!q || (e.name + e.type + e.venue + e.aud).toLowerCase().includes(q.toLowerCase())));
  const inP = scoped.filter((e) => inPer(isoOf(e.date), per));
  const paid = inP.filter((e) => e.fee && e.status !== 'Cancelled').reduce((a, e) => a + (e.reg - 21) * e.fee, 0);
  const due = inP.filter((e) => e.fee && e.status !== 'Cancelled').reduce((a, e) => a + 21 * e.fee, 0);
  const refunded = inP.filter((e) => e.fee && e.status === 'Cancelled').reduce((a, e) => a + e.reg * e.fee, 0);
  return (
    <div>
      <ModuleHead sub={acc ? 'Events with a fee: what is collected, what is due and what was refunded. Read only.' : 'Plan events with date, venue and audience; registrations, payments and reminders where needed.'}
        actions={full && <Button variant="primary" icon={I.Plus} onClick={() => setAdd(true)}>Create event</Button>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Stats items={acc ? [
          { label: 'Events with a fee', value: String(inP.length), icon: 'CalendarDays', sub: fmtRange(per) },
          { label: 'Event fees collected', value: inr(paid), icon: 'IndianRupee', tone: 'ok', sub: 'Through Fee Management' },
          { label: 'Event fees due', value: inr(due), icon: 'Hourglass', tone: due ? 'warn' : undefined, sub: '21 students · Wonderla picnic' },
          { label: 'Refunded', value: inr(refunded), icon: 'Undo2', sub: refunded ? 'Cancelled events' : 'None in these dates' },
        ] : [
          { label: 'Coming up', value: String(inP.filter((e) => ['Planned', 'Open for registration'].includes(e.status)).length), icon: 'CalendarDays', sub: 'Next: Fire drill, today 1:15 PM' },
          { label: 'Open for registration', value: String(inP.filter((e) => e.status === 'Open for registration').length), icon: 'ClipboardList', tone: 'ok' },
          { label: 'Event fees collected', value: inr(paid), icon: 'IndianRupee', sub: 'Wonderla picnic · 148 paid' },
          { label: 'Consent waiting', value: '96', icon: 'FileSignature', tone: 'warn', sub: 'Wonderla · reply by 20 Oct' },
        ]} />
        <Card className="overflow-hidden">
          <Toolbar>
            <SearchBox value={q} onChange={setQ} placeholder="Event, venue or class" id="ev-search" />
            <DatePeriod id="ev-per" future value={per} onChange={setPer} className="w-full @md:w-auto" />
            <Segmented value={f} onChange={setF} options={[{ value: 'all', label: 'All' }, { value: 'up', label: 'Coming up' }, { value: 'done', label: 'Done' }, { value: 'cancel', label: 'Cancelled' }]} />
            <ExportButton what={acc ? 'event payments' : 'events'} />
          </Toolbar>
          <DataList rows={rows} onRow={(e) => go('events', { page: 'events', id: e.id })} minWidth={820} footer={`Showing: ${per.label} · ${fmtRange(per)} · ${rows.length} events`}
            empty={<Empty icon={I.CalendarX2} title="No events here" body="Try other dates or another filter." action={<Button variant="secondary" onClick={() => { setF('all'); setQ(''); setPer(PERIODS.acyear); }}>Show all events</Button>} />}
            columns={[
              { key: 'name', label: 'Event', render: (e) => <div className="flex items-center gap-3"><span className="w-9 h-9 rounded-xl bg-brand/10 text-brand grid place-items-center shrink-0"><Icon name={e.icon} size={17} /></span><div><p className="font-semibold leading-tight">{e.name}</p><p className="text-[12.5px] text-ink3">{e.type}</p></div></div> },
              { key: 'date', label: 'Date and time', nowrap: true, render: (e) => <span className="text-[13px] tnum">{e.today ? <b className="font-semibold text-brand">Today</b> : e.date.replace(/ 2026$/, '')}<span className="block text-ink3 text-[12px]">{e.time}</span></span> },
              ...(acc ? [] : [{ key: 'venue', label: 'Venue', render: (e) => <span className="text-[13px]">{e.venue}</span> }]),
              { key: 'aud', label: 'Audience', render: (e) => <span className="text-[13px] text-ink2">{e.aud}</span> },
              { key: 'reg', label: acc ? 'Fee' : 'Registered', align: 'right', render: (e) => (e.reg != null ? <span className="text-[13px]"><b className="font-semibold">{e.reg}</b>{e.seats ? <span className="text-ink3"> of {e.seats}</span> : ''}{e.fee ? <span className="block text-[12px] text-ink3">{inr(e.fee)} each</span> : ''}</span> : <span className="text-ink3">—</span>) },
              { key: 'status', label: 'Status', render: (e) => <Pill tone={EV_TONE[e.status]} dot>{e.status}</Pill> },
            ]}
            mobile={(e) => ({ title: e.name, sub: `${e.today ? 'Today' : e.date.replace(/ 2026$/, '')} · ${e.time}${acc ? '' : ` · ${e.venue}`}`, icon: e.icon, iconTone: 'brand', pills: [<Pill key="s" tone={EV_TONE[e.status]} className="!h-[22px] !text-[11.5px]">{e.status}</Pill>, e.reg != null && <Pill key="r" tone="neutral" className="!h-[22px] !text-[11.5px]">{e.reg}{e.seats ? ` of ${e.seats}` : ''} registered</Pill>] })} />
        </Card>
      </div>
      {full && <EventForm open={add} onClose={() => setAdd(false)} onSaved={(e) => { setItems((x) => [e, ...x]); toast({ title: `Event created: ${e.name}`, body: 'It is on the School Calendar. A reminder goes 1 day before.' }); }} />}
    </div>
  );
}

function EventForm({ open, onClose, onSaved }) {
  const blank = { name: '', type: 'Cultural', date: '', time: '10:00 AM', venue: 'Assembly hall', aud: 'Whole school', reg: false, seats: '', fee: '', rem: '1 day before' };
  const [f, setF] = useState(blank);
  const [tried, setTried] = useState(false);
  const iso = /^\d{2}-\d{2}-\d{4}$/.test(f.date) ? f.date.split('-').reverse().join('-') : null;
  const clash = iso && f.venue === 'Library hall' && iso === '2026-10-29';
  const hol = iso && onDay(CAL, iso).find((e) => !TYPE[e.type].att);
  const err = { name: !f.name.trim() ? 'Give the event a name' : '', date: !iso ? 'Enter the date as DD-MM-YYYY' : '', seats: f.reg && f.seats && !/^\d+$/.test(f.seats) ? 'Seats is a number' : '', fee: f.fee && !/^\d+$/.test(f.fee.replace(/[,₹\s]/g, '')) ? 'Enter the fee in rupees, like 1200' : '' };
  return (
    <FormSheet open={open} onClose={onClose} wide title="Create event" sub="It appears on the School Calendar. Reminders go through Communication." submitLabel="Create event"
      onSubmit={() => { setTried(true); if (Object.values(err).some(Boolean)) return false; onSaved({ id: 'EV-26-034', name: f.name, type: f.type, date: niceY(iso), time: f.time, venue: f.venue, aud: f.aud, reg: f.reg ? 0 : undefined, seats: f.seats ? Number(f.seats) : null, fee: f.fee ? Number(f.fee.replace(/[,₹\s]/g, '')) : undefined, status: f.reg ? 'Open for registration' : 'Planned', icon: 'CalendarDays' }); setF(blank); setTried(false); }}>
      <div className="grid grid-cols-1 @md:grid-cols-2 gap-3">
        <Field label="Name" required id="evf-name" error={tried && err.name}><Input id="evf-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={tried && err.name} placeholder="For example: Annual Day 2027" /></Field>
        <Field label="Type" required id="evf-type" hint="From Events Settings"><Select id="evf-type" value={f.type} onChange={(v) => setF({ ...f, type: v })} options={['Annual day', 'Sports day', 'Cultural', 'Competition', 'Trip', 'Safety drill', 'Meeting', 'Alumni']} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" required id="evf-date" hint="DD-MM-YYYY" error={tried && err.date}><Input id="evf-date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} error={tried && err.date} className="tnum" placeholder="29-10-2026" /></Field>
        <Field label="Time" required id="evf-time"><Input id="evf-time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} className="tnum" /></Field>
      </div>
      {hol && <Banner tone="warn" title={`${f.date} is ${hol.name}.`}>Attendance is off that day. Events can still be held.</Banner>}
      <div className="grid grid-cols-1 @md:grid-cols-2 gap-3">
        <Field label="Venue" id="evf-venue"><Select id="evf-venue" value={f.venue} onChange={(v) => setF({ ...f, venue: v })} options={['Assembly hall', 'Auditorium', 'Library hall', 'School ground', 'Classrooms', 'Outside the school']} /></Field>
        <Field label="Audience" required id="evf-aud"><Select id="evf-aud" value={f.aud} onChange={(v) => setF({ ...f, aud: v })} options={['Whole school', 'Classes 6–10', 'Classes 1–5', 'Nursery to UKG', 'Staff', 'Parents', 'Alumni']} /></Field>
      </div>
      {clash && <Banner tone="warn" title="Library hall is booked for the Inter-house debate">on 29-10-2026, 2:20 PM to 3:45 PM. Change the venue or time.</Banner>}
      <div className="rounded-xl bg-sunken/70 p-3.5 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Switch id="evf-reg" on={f.reg} onChange={(v) => setF({ ...f, reg: v })} label="Registration" />
          <label htmlFor="evf-reg" className="text-[14px] flex-1"><b className="font-semibold">Registration</b><span className="block text-[12.5px] text-ink3">Staff record who joins. Limit seats if needed.</span></label>
        </div>
        {f.reg && <Field label="Seats" id="evf-seats" hint="Leave empty for no limit" error={tried && err.seats}><Input id="evf-seats" value={f.seats} onChange={(e) => setF({ ...f, seats: e.target.value })} className="tnum" inputMode="numeric" /></Field>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fee per student" id="evf-fee" hint="Added to the student’s fees" error={tried && err.fee}><Input id="evf-fee" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} className="tnum" placeholder="None" inputMode="numeric" /></Field>
        <Field label="Reminder" id="evf-rem"><Select id="evf-rem" value={f.rem} onChange={(v) => setF({ ...f, rem: v })} options={['1 day before', '2 days before', 'On the morning', 'No reminder']} /></Field>
      </div>
    </FormSheet>
  );
}

function EventDetail({ ev, access, onBack, onChange }) {
  const toast = useToast();
  const { role } = useRole();
  const canEdit = useCanEdit();
  const full = access === 'full' && canEdit;
  const own = access === 'own';
  const acc = role.id === 'accountant';
  const [tab, setTab] = useState(acc ? 'pay' : 'reg');
  const [rem, setRem] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [why, setWhy] = useState('');
  const [att, setAtt] = useState(null);
  const kids = CLASS_7B.map((s, i) => ({ s, cls: '7 B', consent: s.id === FEATURED.id ? 'Given' : i % 5 === 2 ? 'Waiting' : i % 13 === 7 ? 'Declined' : 'Given', paid: i % 5 === 2 || i % 13 === 7 ? false : true }));
  const showAcc = role.id === 'accountant' || full;
  const done = ev.status === 'Done', cancelled = ev.status === 'Cancelled';
  const remN = ev.consent ? ev.consent.wait : ev.reg || 412;
  return (
    <div>
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink mb-3 -ml-1 h-8 px-1 rounded-lg"><I.ArrowLeft size={17} />Events <span className="text-ink3 font-normal">/ {ev.id}</span></button>
      <Card className="p-4 @md:p-5 flex flex-col @lg:flex-row @lg:items-center gap-4 mb-5">
        <span className="w-14 h-14 rounded-2xl bg-brand/10 text-brand grid place-items-center shrink-0"><Icon name={ev.icon} size={26} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap"><h1 className="font-display text-[24px] @md:text-[28px] font-semibold tracking-tight leading-tight">{ev.name}</h1><Pill tone={EV_TONE[ev.status]} dot>{ev.status}</Pill></div>
          <p className="text-[14px] text-ink3 mt-0.5">{ev.type} · {ev.date} · {ev.time} · {ev.venue}</p>
        </div>
        {canEdit && !cancelled && !done && (
          <div className="flex gap-2 flex-wrap">
            {(full || own) && !acc && ev.reg != null && <Button variant="secondary" icon={I.ListChecks} onClick={() => setTab('att')}>{own ? 'Mark 7 B attendance' : 'Mark attendance'}</Button>}
            {full && <Button variant="primary" icon={I.BellRing} onClick={() => setRem(true)}>Send reminder</Button>}
            {full && <MoreMenu items={[['Pencil', 'Edit event', () => toast({ title: 'Editing the event', body: 'Changes to date or venue are sent to the audience.', tone: 'info' })], ['Users', 'Add volunteers', () => setTab('vol')], ['X', 'Cancel the event', () => setCancel(true), 'bad']]} />}
          </div>
        )}
      </Card>
      {cancelled && <Banner tone="bad" title="Cancelled." className="mb-5">{ev.why}</Banner>}
      <div className="flex flex-col gap-5 @lg:gap-6">
        {ev.reg != null && (
          <Stats items={[
            { label: 'Registered', value: ev.seats ? `${ev.reg} of ${ev.seats}` : String(ev.reg), icon: 'Users', sub: ev.seats ? `${ev.seats - ev.reg} seats left` : 'No seat limit' },
            !acc && (ev.consent ? { label: 'Parent consent', value: `${ev.consent.given} given`, icon: 'FileSignature', tone: 'ok', sub: `${ev.consent.wait} waiting · ${ev.consent.no} declined` } : { label: 'Attended', value: ev.attended ? String(ev.attended) : '—', icon: 'CheckCheck', sub: done ? 'Marked on the day' : 'Marked on the day' }),
            showAcc && ev.fee ? { label: 'Fees', value: inr(ev.fee * ev.reg), icon: 'IndianRupee', tone: cancelled ? undefined : 'ok', sub: cancelled ? 'Refunded' : `${ev.reg} × ${inr(ev.fee)} · fee row added` } : { label: 'Volunteers', value: String(ev.vols || 6), icon: 'HandHeart', sub: 'Staff and parents' },
            acc ? { label: 'Fees due', value: cancelled ? '—' : inr(21 * ev.fee), icon: 'Hourglass', tone: cancelled ? undefined : 'warn', sub: cancelled ? 'All refunded' : '21 students' } : { label: 'Reminders sent', value: done ? '2' : '1', icon: 'BellRing', sub: 'Last: 6 Oct, WhatsApp' },
          ].filter(Boolean)} />
        )}
        <Split side={340}>
          <Card className="overflow-hidden min-w-0">
            <Tabs className="px-3" value={tab} onChange={setTab} tabs={acc ? [{ id: 'pay', label: 'Payments' }, { id: 'reg', label: 'Fee by student' }] : [{ id: 'reg', label: 'Registrations' }, { id: 'att', label: 'Attendance' }, ...(showAcc && ev.fee ? [{ id: 'pay', label: 'Payments' }] : []), { id: 'vol', label: 'Volunteers' }, { id: 'rem', label: 'Reminders' }]} />
            {tab === 'reg' && (
              ev.reg != null ? (
                <DataList rows={kids} rowKey={(k) => k.s.id} minWidth={560} footer={own ? '7 B · 38 students' : `Showing 7 B · ${ev.reg} registered across ${ev.aud}`}
                  columns={[
                    { key: 's', label: 'Student', render: (k) => <div className="flex items-center gap-2.5"><Avatar name={k.s.name} size={30} /><span className="font-semibold">{k.s.name}</span></div> },
                    { key: 'cls', label: 'Class', render: (k) => k.cls },
                    ...(ev.consent && !acc ? [{ key: 'c', label: 'Consent on Parent Link', render: (k) => <Pill tone={k.consent === 'Given' ? 'ok' : k.consent === 'Waiting' ? 'warn' : 'bad'} dot>{k.consent}</Pill> }] : []),
                    ...(ev.fee ? [{ key: 'p', label: 'Fee', render: (k) => (k.consent === 'Declined' ? <span className="text-ink3">Not going</span> : <Pill tone={k.paid ? 'ok' : 'warn'}>{k.paid ? 'Paid' : 'Due'}</Pill>) }] : []),
                  ]}
                  mobile={(k) => ({ title: k.s.name, sub: k.cls, avatar: k.s.name, pills: acc && ev.fee ? [<Pill key="p" tone={k.consent === 'Declined' ? 'neutral' : k.paid ? 'ok' : 'warn'} className="!h-[22px] !text-[11.5px]">{k.consent === 'Declined' ? 'Not going' : k.paid ? 'Paid' : 'Due'}</Pill>] : ev.consent ? [<Pill key="c" tone={k.consent === 'Given' ? 'ok' : k.consent === 'Waiting' ? 'warn' : 'bad'} className="!h-[22px] !text-[11.5px]">Consent {k.consent.toLowerCase()}</Pill>] : null })} />
              ) : <Empty icon={I.ClipboardList} title="No registration for this event" body="Everyone in the audience takes part. Switch registration on to limit seats." />
            )}
            {tab === 'att' && <EventAttendance kids={kids.filter((k) => k.consent !== 'Declined')} done={done} canMark={(full || own) && !cancelled} onSaved={(n) => { setAtt(n); toast({ title: `Attendance saved: ${n} present`, body: `${ev.name} · 7 B` }); }} saved={att} />}
            {tab === 'pay' && (
              <div className="p-5 flex flex-col gap-4">
                <Banner tone="info" title="Collected through Fee Management.">A fee row “{ev.name}” of {inr(ev.fee)} was added for each student who registered. Parents pay on Parent Link or at the counter.</Banner>
                <HBars rows={[{ k: 'Paid', v: ev.reg - 21, label: `${ev.reg - 21} · ${inr((ev.reg - 21) * ev.fee)}` }, { k: 'Due', v: 21, label: `21 · ${inr(21 * ev.fee)}` }]} max={ev.reg} unit="" labelWidth={48} lowBelow={30} />
                <p className="text-[13px] text-ink3">If the event is cancelled, paid fees are refunded through Fee Management.</p>
              </div>
            )}
            {tab === 'vol' && (
              <ul className="px-2 py-2">
                {[['Venkat Rao', 'Group leader · Class 7 · Bus 2'], ['Lalitha Devi', 'Group leader · Class 6 · Bus 1'], ['Usha Rani', 'Group leader · Class 5 · Bus 3'], ['Mohammed Asif', 'Rides and safety'], ['Sunil Reddy (parent)', 'First aid · doctor'], ['Venkatesh Goud', 'Buses and drivers']].map(([n, r]) => <li key={n}><Row avatar={n} title={n} sub={r} /></li>)}
              </ul>
            )}
            {tab === 'rem' && (
              <div className="p-5"><Timeline items={[
                { icon: 'Send', tone: 'ok', what: `Reminder to ${ev.consent ? '96 parents waiting for consent' : 'the audience'} by WhatsApp · 88 read`, when: '6 Oct 2026, 6:00 PM' },
                { icon: 'Megaphone', what: 'Notice published on the board and Parent Link', when: '6 Oct 2026, 9:10 AM' },
                { icon: 'Plus', tone: 'brand', what: 'Event created by Anita Sharma', when: '1 Oct 2026' },
              ]} /></div>
            )}
          </Card>
          <Col>
            <Card>
              <CardHead title="Details" />
              <DL cols={1} rows={[['Date and time', `${ev.date} · ${ev.time}`], ['Venue', ev.venue], ['Audience', ev.aud], ['Registration', ev.reg != null ? (ev.seats ? `On · ${ev.seats} seats` : 'On · no seat limit') : 'Off'], ['Fee', ev.fee ? `${inr(ev.fee)} per student, added to fees` : 'None'], ['Reminder', '1 day before, by WhatsApp']]} />
            </Card>
            {ev.consent && !acc && (
              <Card>
                <CardHead title="Parent consent" sub="Given on Parent Link with a one-time code" icon={I.FileSignature} />
                <div className="px-5 pb-5 flex items-center gap-4">
                  <Ring value={(ev.consent.given / (ev.consent.given + ev.consent.wait + ev.consent.no)) * 100} size={76} stroke={8} tone="ok"><span className="text-[14px] font-bold tnum">{Math.round((ev.consent.given / 250) * 100)}%</span></Ring>
                  <ul className="text-[13.5px] flex flex-col gap-1 tnum">
                    <li><b className="font-semibold text-ok">{ev.consent.given}</b> given</li><li><b className="font-semibold text-warn">{ev.consent.wait}</b> waiting · reply by 20 Oct</li><li><b className="font-semibold text-bad">{ev.consent.no}</b> declined</li>
                  </ul>
                </div>
              </Card>
            )}
          </Col>
        </Split>
      </div>
      <ConfirmSheet open={rem} onClose={() => setRem(false)} title={`Send a reminder to ${remN} parents?`} sub={ev.consent ? 'Only parents who have not given consent yet.' : 'Everyone in the audience.'}
        confirmLabel={`Send to ${remN} parents`} onConfirm={() => toast({ title: `Reminder sent to ${remN} parents`, body: `WhatsApp · ${remN} credits. Track it in Message History.` })}>
        <p className="text-[14px] text-ink2 rounded-xl bg-sunken/70 p-3.5 leading-relaxed">Dear Parent, please give consent for your child to join the {ev.name} on {ev.date.replace(/ 2026$/, '')}{ev.fee ? `, fee ${inr(ev.fee)},` : ''} on your Parent Link by 20 October. – Sunrise Public School</p>
      </ConfirmSheet>
      <FormSheet open={cancel} onClose={() => setCancel(false)} title={`Cancel ${ev.name}?`} sub={`The audience is told. ${ev.fee ? `${ev.reg} paid fees are refunded through Fee Management.` : ''}`} submitLabel="Cancel the event"
        onSubmit={() => { if (why.trim().length < 5) return false; onChange({ ...ev, status: 'Cancelled', why }); toast({ title: `${ev.name} cancelled`, body: 'Parents were told on WhatsApp and Parent Link.' }); }}>
        <Field label="Reason" required id="ev-why" error={why.trim().length < 5 ? 'Say why, in a few words. Parents see it.' : ''}><Textarea id="ev-why" value={why} onChange={setWhy} rows={3} placeholder="For example: heavy rain warning for Saturday" /></Field>
      </FormSheet>
    </div>
  );
}

function EventAttendance({ kids, done, canMark, onSaved, saved }) {
  const [marks, setMarks] = useState(() => Object.fromEntries(kids.map((k, i) => [k.s.id, i % 11 !== 4])));
  const n = Object.values(marks).filter(Boolean).length;
  return (
    <div className="p-4 flex flex-col gap-3">
      <p className="text-[13.5px] text-ink2">{done ? 'Marked on the day.' : 'Tick who came. Those with consent declined are not listed.'} <b className="font-semibold tnum">{n} of {kids.length}</b> present.</p>
      <ul className="grid grid-cols-1 @md:grid-cols-2 gap-1.5">
        {kids.map((k) => (
          <li key={k.s.id} className={cx('flex items-center gap-3 rounded-xl border px-3 py-2', marks[k.s.id] ? 'border-line' : 'border-bad/30 bg-bad/[.04]')}>
            <Checkbox checked={marks[k.s.id]} onChange={(v) => canMark && setMarks({ ...marks, [k.s.id]: v })} label={k.s.name} />
            <span className="text-[14px] font-medium truncate flex-1">{k.s.name}</span>
            {!marks[k.s.id] && <span className="text-[12px] text-bad font-semibold">Absent</span>}
          </li>
        ))}
      </ul>
      {canMark && <Button variant="primary" icon={I.Check} className="self-start" onClick={() => onSaved(n)}>{saved != null ? 'Saved · save again' : `Save attendance: ${n} present`}</Button>}
    </div>
  );
}

/* ======================= PTM ======================= */
const PTM_DAYS = [
  { id: 'p17', date: 'Sat 17 Oct', iso: '2026-10-17', classes: 'Classes 4–10', window: '9:30 AM – 12:30 PM', slot: 10, teachers: 24, booked: 318, slots: 408, link: 241, office: 77, status: 'Booking open' },
  { id: 'p09', date: 'Fri 9 Oct', iso: '2026-10-09', classes: 'Classes 1–3', window: '11:30 AM – 1:30 PM', slot: 10, teachers: 6, booked: 64, slots: 72, link: 49, office: 15, status: 'Today' },
  { id: 'p19', date: 'Sat 19 Dec', iso: '2026-12-19', classes: 'Nursery to UKG', window: '9:30 AM – 11:30 AM', slot: 10, teachers: 5, booked: 0, slots: 60, status: 'Planned' },
  { id: 'p18', date: 'Sat 18 Jul', iso: '2026-07-18', classes: 'All classes', window: '9:30 AM – 12:30 PM', slot: 10, teachers: 30, booked: 812, slots: 900, status: 'Done', attended: 748 },
];
const PTM_STATUS_TONE = { 'Booking open': 'ok', Today: 'brand', Planned: 'info', Done: 'neutral' };
const SLOT_TIMES = Array.from({ length: 18 }, (_, i) => { const mins = 9 * 60 + 30 + i * 10; const h = Math.floor(mins / 60), mm = mins % 60; return `${h > 12 ? h - 12 : h}:${pad(mm)}`; });
// Students of each teacher's class for the PTM grid (7 B is the real class list; others are example names)
const FN = ['Ananya', 'Rohit', 'Sahithi', 'Varun', 'Keerthana', 'Manish', 'Lasya', 'Tejas', 'Bhavya', 'Nikhil', 'Harini', 'Karthik', 'Sneha', 'Abhiram', 'Pooja', 'Charan', 'Nithya', 'Dhruv', 'Shreya', 'Yash', 'Meera', 'Sai', 'Tanvi', 'Arjun', 'Riya', 'Pranav', 'Diya', 'Rahul', 'Navya', 'Ishaan'];
const LN = ['Reddy', 'Rao', 'Naidu', 'Patel', 'Kumar', 'Iyer', 'Gupta', 'Verma', 'Chowdary', 'Menon', 'Das', 'Joshi', 'Goud', 'Shetty'];
const classKids = (ti, cls, sec) => Array.from({ length: 18 }, (_, i) => {
  const first = FN[(ti * 7 + i * 7) % 30], last = LN[(ti * 3 + i * 5) % 14];
  return { id: `pk${ti}-${i}`, name: `${first} ${last}`, first, last, cls: `Class ${cls}`, sec, roll: i + 1, att: 84 + ((i * 7 + ti) % 15), father: `${['Ramesh', 'Srinivas', 'Venkat', 'Prakash', 'Mahesh', 'Kiran', 'Ravi'][(i + ti) % 7]} ${last}` };
});
const C7B = CLASS_7B.filter((s) => s.id !== FEATURED.id);
const PTM_TEACHERS = [
  { name: 'Ravi Teja', role: 'Class teacher, 7 B', kids: C7B },
  { name: 'Lalitha Devi', role: 'Class teacher, 6 A', kids: classKids(1, '6', 'A') },
  { name: 'Venkat Rao', role: 'Class teacher, 8 A', kids: classKids(2, '8', 'A') },
  { name: 'Swapna Reddy', role: 'Class teacher, 9 B', kids: classKids(3, '9', 'B') },
  { name: 'Deepak Verma', role: 'Class teacher, 9 C', kids: classKids(4, '9', 'C') },
  { name: 'Farhana Begum', role: 'Class teacher, 10 C', kids: classKids(5, '10', 'C') },
  { name: 'Imran Shaikh', role: 'Mathematics, 6 A–7 B', kids: [...C7B].reverse() },
  { name: 'Karthik Menon', role: 'Computers, 6–10', kids: classKids(7, '8', 'B') },
];
function slotOf(ti, si) {
  if (si === 9) return { brk: true };
  const t = PTM_TEACHERS[ti];
  const on = (ti * 5 + si * 3) % 7 < 5 || (ti === 0 && si === 0);
  if (!on) return { free: true };
  const s = ti === 0 && si === 0 ? FEATURED : t.kids[si % t.kids.length];
  return { s, via: (ti + si) % 4 === 0 && si > 0 ? 'office' : 'link', met: false };
}

function PTMPage({ access }) {
  const { role } = useRole();
  const toast = useToast();
  const canEdit = useCanEdit();
  const full = access === 'full' && canEdit;
  const own = access === 'own';
  const [day, setDay] = useState('p17');
  const [per, setPer] = useState(PERIODS.acyear);
  const [book, setBook] = useState(null);
  const [meet, setMeet] = useState(null);
  const [plan, setPlan] = useState(false);
  const [extra, setExtra] = useState({});
  const [notes, setNotes] = useState({});
  const days = PTM_DAYS.filter((d) => inPer(d.iso, per));
  const D = days.find((d) => d.id === day) || days[0];
  const myIdx = own ? PTM_TEACHERS.findIndex((t) => t.name === role.person.name) : -1;
  const cell = (ti, si) => extra[`${ti}-${si}`] || slotOf(ti, si);
  if (!D) {
    return (
      <div>
        <ModuleHead sub={own ? 'Only your own PTM slots and notes.' : 'Parent–teacher meetings: slots per teacher, booked by parents on Parent Link or by the office, with notes.'} />
        <div className="flex flex-col gap-3">
          <div className="flex"><DatePeriod id="ptm-per" future value={per} onChange={setPer} className="w-full @md:w-auto" /></div>
          <Card><Empty icon={I.CalendarX2} title="No PTM in these dates" body="Pick other dates to see earlier or later PTMs." action={<Button variant="secondary" onClick={() => setPer(PERIODS.acyear)}>This academic year</Button>} /></Card>
        </div>
      </div>
    );
  }
  const dayOk = D.id === 'p17' || D.id === 'p09';
  return (
    <div>
      <ModuleHead sub={own ? `Only your own PTM slots and notes. Parents book a slot on Parent Link; the office can book for them.` : 'Parent–teacher meetings: slots per teacher, booked by parents on Parent Link or by the office, with notes.'}
        actions={full && <Button variant="primary" icon={I.Plus} onClick={() => setPlan(true)}>Plan a PTM</Button>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <div className="flex flex-col @md:flex-row @md:items-center gap-2.5">
          <DatePeriod id="ptm-per" future value={per} onChange={setPer} className="w-full @md:w-auto" />
          {showing(per, days.length, days.length === 1 ? 'PTM day' : 'PTM days')}
        </div>
        <div className="grid grid-cols-2 @xl:grid-cols-4 gap-3">
          {days.map((d) => (
            <button key={d.id} onClick={() => setDay(d.id)} aria-pressed={day === d.id}
              className={cx('rounded-2xl border bg-surface shadow-card p-3.5 @md:p-4 text-left transition', day === d.id ? 'border-brand ring-1 ring-brand' : 'border-line/70 hover:border-ink3/40')}>
              <div className="flex items-center justify-between gap-2"><p className="font-display font-semibold text-[16px] @md:text-[18px] leading-tight">{d.date}</p><Pill tone={PTM_STATUS_TONE[d.status]} className="!h-[22px] !text-[11px]">{d.status}</Pill></div>
              <p className="text-[12.5px] text-ink3 mt-1">{d.classes} · {d.window}</p>
              {own ? (() => {
                const mine = myIdx >= 0 && d.id === 'p17' ? SLOT_TIMES.filter((_, si) => cell(myIdx, si).s).length : 0;
                return mine ? <><p className="text-[13px] mt-2 tnum"><b className="font-semibold">{mine}</b><span className="text-ink3"> of {SLOT_TIMES.length - 1} of your slots booked</span></p><Progress value={(mine / (SLOT_TIMES.length - 1)) * 100} className="mt-1.5" /></> : <p className="text-[13px] mt-2 text-ink3">No slots for you</p>;
              })() : <>
                <p className="text-[13px] mt-2 tnum"><b className="font-semibold">{fmt(d.booked)}</b><span className="text-ink3"> of {fmt(d.slots)} slots {d.status === 'Done' ? `· ${fmt(d.attended)} met` : 'booked'}</span></p>
                <Progress value={(d.booked / d.slots) * 100} className="mt-1.5" tone={d.status === 'Done' ? 'ok' : 'brand'} />
              </>}
            </button>
          ))}
        </div>

        {D.id === 'p09' && (
          <Banner tone="brand" icon="Users" title="PTM for Classes 1–3 starts at 11:30 AM in the assembly hall." action={full && <Button size="sm" variant="secondary" onClick={() => toast({ title: 'Waiting queue opened', body: 'Parents are called by slot time. 4 have checked in early.' })}>Open queue</Button>}>
            4 parents have checked in early. The waiting queue opens at 11:30 AM.
          </Banner>
        )}
        {D.status === 'Done' && !own && <Banner tone="info" title="Held on 18 July: 748 of 812 booked parents came." action={full && <Button size="sm" variant="secondary" icon={I.Send} onClick={() => toast({ title: 'PTM summary sent to 64 parents', body: 'Only those who did not come. WhatsApp · 64 credits.' })}>Send summary to 64 absent</Button>}>Notes are on each student’s profile.</Banner>}
        {D.status === 'Planned' && !own && <Banner tone="info" title="Slots open for booking on 1 December.">5 pre-primary class teachers, 10-minute slots. Parents get a link on WhatsApp.</Banner>}

        {dayOk && !own && (
          <Card className="overflow-hidden">
            <CardHead title={`Teacher slots · ${D.date}`} sub={`${D.slot}-minute slots · ${fmt(D.link)} booked by parents on Parent Link, ${fmt(D.office)} by the office · tap a free slot to book`} icon={I.CalendarClock}
              action={<Legend items={[['bg-brand/15', 'Booked'], ['bg-sunken border border-line', 'Free']]} />} />
            <div className="overflow-x-auto scroll-thin border-t border-line">
              <table className="text-[12.5px] min-w-full">
                <thead>
                  <tr className="border-b border-line text-ink3">
                    <th className="sticky left-0 z-10 bg-surface text-left font-semibold px-4 py-2 min-w-[170px]">Teacher</th>
                    {SLOT_TIMES.map((t, i) => <th key={t} className="font-semibold px-1 py-2 tnum whitespace-nowrap min-w-[96px]">{i === 9 ? 'Break' : t}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {PTM_TEACHERS.map((t, ti) => (
                    <tr key={t.name} className="border-b border-line/60 last:border-0">
                      <td className="sticky left-0 z-10 bg-surface px-4 py-2"><p className="font-semibold text-[13.5px] whitespace-nowrap">{t.name}</p><p className="text-[11.5px] text-ink3 whitespace-nowrap">{t.role}</p></td>
                      {SLOT_TIMES.map((_, si) => {
                        const c = cell(ti, si);
                        if (c.brk) return <td key={si} className="px-1 py-1.5"><span className="block h-11 rounded-lg bg-sunken/50" /></td>;
                        return (
                          <td key={si} className="px-1 py-1.5">
                            {c.free && !canEdit ? <span className="block h-11 rounded-lg border border-dashed border-line" /> : c.free ? (
                              <button onClick={() => setBook({ ti, si })} aria-label={`Book ${t.name} at ${SLOT_TIMES[si]}`} className="w-full h-11 rounded-lg border border-dashed border-line text-ink3 hover:border-brand hover:text-brand grid place-items-center transition disabled:pointer-events-none"><I.Plus size={15} /></button>
                            ) : (
                              <button onClick={() => setMeet({ ti, si, s: c.s })} className={cx('w-full h-11 rounded-lg px-1.5 text-left transition', notes[`${ti}-${si}`] ? 'bg-ok/12 text-ok' : 'bg-brand/12 text-brand', 'hover:brightness-95')}>
                                <span className="block font-semibold truncate leading-tight">{firstL(c.s)}</span>
                                <span className="flex items-center gap-1 text-[10.5px] opacity-80">{c.via === 'office' ? <I.Building2 size={10} /> : <I.Link size={10} />}{notes[`${ti}-${si}`] ? 'Notes saved' : c.via === 'office' ? 'Office' : 'Parent Link'}</span>
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-5 py-3 text-[12.5px] text-ink3 border-t border-line">One parent per slot. Parents get a confirmation and a reminder the evening before. Showing 8 of {D.teachers} teachers.</p>
          </Card>
        )}

        {own && (
          myIdx >= 0 && D.id === 'p17' ? (
            <Card>
              <CardHead title={`Your slots · ${D.date}`} sub={`${PTM_TEACHERS[myIdx].role} · ${D.window}`} icon={I.CalendarClock} />
              <ul className="px-2 pb-2">
                {SLOT_TIMES.map((tm, si) => {
                  const c = cell(myIdx, si);
                  if (c.brk) return <li key={si} className="px-3 py-2 text-[12.5px] text-ink3 font-semibold border-t border-line/70">11:00 – 11:10 · Break</li>;
                  return (
                    <li key={si} className="border-t border-line/70 first:border-0">
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        <span className="w-12 text-[13px] font-semibold tnum text-ink2 shrink-0">{tm}</span>
                        {c.free ? <span className="flex-1 text-[13.5px] text-ink3">Free</span> : (
                          <>
                            <Avatar name={c.s.name} size={32} />
                            <div className="min-w-0 flex-1"><p className="font-semibold text-[14px] truncate">{c.s.id === FEATURED.id ? 'Priya Sharma' : c.s.father}</p><p className="text-[12px] text-ink3 truncate">Parent of {c.s.name} · {c.via === 'office' ? 'booked by the office' : 'booked on Parent Link'}</p></div>
                            {notes[`${myIdx}-${si}`] ? <Pill tone="ok">Notes saved</Pill> : null}
                          </>
                        )}
                        {c.free ? (canEdit ? <Button size="sm" variant="ghost" icon={I.Plus} onClick={() => setBook({ ti: myIdx, si })}>Book</Button> : null) : <Button size="sm" variant="secondary" onClick={() => setMeet({ ti: myIdx, si, s: c.s })}>Open</Button>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : (
            <Card><Empty icon={I.CalendarCheck2} title={D.id === 'p09' ? 'You have no slots today' : 'No slots for you on this day'} body={D.id === 'p09' ? 'Today’s PTM is for Classes 1–3. Your slots are on Saturday 17 October.' : 'Only class and subject teachers of these classes get slots.'} action={days.some((d) => d.id === 'p17') && <Button variant="secondary" onClick={() => setDay('p17')}>See Sat 17 Oct</Button>} /></Card>
          )
        )}

        {!own && (
          <div className="grid grid-cols-1 @xl:grid-cols-2 gap-5 @lg:gap-6 items-start">
            <Card>
              <CardHead title="Bookings by class" sub={`${D.date} · parents who booked a slot`} icon={I.ChartColumn} />
              <div className="px-5 pb-5"><HBars rows={D.id === 'p09' ? [{ k: 'Class 1', v: 92 }, { k: 'Class 2', v: 88 }, { k: 'Class 3', v: 86 }] : [{ k: 'Class 4', v: 84 }, { k: 'Class 5', v: 81 }, { k: 'Class 6', v: 79 }, { k: 'Class 7', v: 83 }, { k: 'Class 8', v: 74 }, { k: 'Class 9', v: 69 }, { k: 'Class 10', v: 88 }]} goal={75} lowBelow={75} labelWidth={64} /></div>
            </Card>
            <Card>
              <CardHead title="Recent meeting notes" sub="Saved to each student’s profile, Activities tab" icon={I.NotebookPen} />
              <ul className="px-2 pb-2">
                {[['Usha Rani', 'Meera Iyer, 2 B', 'Reading is improving. Practise 10 minutes of reading aloud daily.'], ['Ravi Teja', 'Harini Reddy, 7 B', 'Parent will check Science diary each week.'], ['Swapna Reddy', 'Tanvi Verma, 9 B', 'Extra Maths practice for the board-style questions.']].map(([t, s, n]) => (
                  <li key={s}><Row avatar={s.split(',')[0]} title={s} sub={`${t}: ${n}`} /></li>
                ))}
              </ul>
            </Card>
          </div>
        )}
      </div>

      <BookSlot b={book} day={D} own={own} onClose={() => setBook(null)} onBooked={(b, s) => { setExtra((x) => ({ ...x, [`${b.ti}-${b.si}`]: { s, via: 'office' } })); toast({ title: `Booked: ${PTM_TEACHERS[b.ti].name} at ${SLOT_TIMES[b.si]}`, body: `${s.id === FEATURED.id ? 'Priya Sharma' : s.father} gets a confirmation now and a reminder on Friday evening.` }); }} cell={cell} />
      <MeetingSheet m={meet} onClose={() => setMeet(null)} canEdit={canEdit} saved={meet && notes[`${meet.ti}-${meet.si}`]} onSave={(k) => { setNotes((x) => ({ ...x, [k]: true })); }} />
      <PlanPTM open={plan} onClose={() => setPlan(false)} />
    </div>
  );
}

function BookSlot({ b, day, own, onClose, onBooked, cell }) {
  const [q, setQ] = useState('');
  const [pick, setPick] = useState(null);
  const [err, setErr] = useState('');
  if (!b) return null;
  const t = PTM_TEACHERS[b.ti];
  const already = (s) => SLOT_TIMES.some((_, si) => { const c = cell(b.ti, si); return c.s && c.s.id === s.id; });
  const list = (q ? [...t.kids, ...(own ? [] : STUDENTS)].filter((s) => s.name.toLowerCase().includes(q.toLowerCase())) : t.kids.filter((s) => !already(s))).slice(0, 6);
  return (
    <Sheet open={!!b} onClose={() => { onClose(); setPick(null); setErr(''); setQ(''); }} title={`Book ${t.name} · ${SLOT_TIMES[b.si]}`} sub={`${day.date} · ${day.slot} minutes · for a parent who called or came to the office`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={I.Check} disabled={!pick} onClick={() => { if (already(pick)) { setErr(`${pick.first}'s parent already has a slot with ${t.name}. Pick another student or slot.`); return; } onBooked(b, pick); onClose(); setPick(null); setErr(''); setQ(''); }}>Book this slot</Button></>}>
      <div className="flex flex-col gap-3">
        <SearchBox value={q} onChange={setQ} placeholder="Student name" id="ptm-book-search" />
        <ul className="flex flex-col">
          {list.map((s) => (
            <li key={s.id}><button onClick={() => { setPick(s); setErr(''); }} aria-pressed={pick && pick.id === s.id} className={cx('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition', pick && pick.id === s.id ? 'bg-brand/8 ring-1 ring-brand' : 'hover:bg-sunken/70')}>
              <Avatar name={s.name} size={36} />
              <span className="min-w-0 flex-1"><span className="block font-semibold text-[14.5px] truncate">{s.name}</span><span className="block text-[12.5px] text-ink3 truncate">{s.cls} {s.sec} · {s.id === FEATURED.id ? 'Priya Sharma' : s.father}</span></span>
              {already(s) && <Pill tone="warn">Has a slot</Pill>}
            </button></li>
          ))}
        </ul>
        {err && <p className="text-[12.5px] text-bad flex items-center gap-1.5" role="alert"><I.CircleAlert size={14} />{err}</p>}
      </div>
    </Sheet>
  );
}

function MeetingSheet({ m, onClose, canEdit, saved, onSave }) {
  const toast = useToast();
  const [f, setF] = useState({ remarks: '', feedback: '', follow: '' });
  const [arrived, setArrived] = useState(false);
  if (!m) return null;
  const s = m.s;
  const featured = s.id === FEATURED.id;
  const P = STUDENT_PROFILE;
  const marks = featured ? P.exams : P.exams.map((e, i) => ({ ...e, ut1: Math.max(10, e.ut1 - ((s.roll + i) % 6)), ut2: Math.max(11, e.ut2 - ((s.roll * 2 + i) % 7)) }));
  const parent = featured ? 'Priya Sharma' : s.father;
  return (
    <Sheet open={!!m} onClose={() => { onClose(); setF({ remarks: '', feedback: '', follow: '' }); setArrived(false); }} wide title={`${s.name} · ${s.cls} ${s.sec}`} sub={`PTM with ${parent} · ${PTM_TEACHERS[m.ti].name} · ${SLOT_TIMES[m.si]}`}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2">
          {[['Attendance', `${s.att}%`, s.att < 85 ? 'text-warn' : 'text-ok'], ['Homework done', `${featured ? 92 : 70 + (s.roll % 25)}%`, ''], ['Unit Test 2', `${Math.round((marks.reduce((a, e) => a + e.ut2, 0) / 150) * 100)}%`, '']].map(([k, v, c]) => (
            <div key={k} className="rounded-xl bg-sunken/70 px-3 py-2.5"><p className="text-[12px] text-ink3 font-semibold">{k}</p><p className={cx('font-display text-[20px] font-semibold tnum', c)}>{v}</p></div>
          ))}
        </div>
        <div>
          <p className="eyebrow text-ink3 mb-2">Latest marks · UT1 → UT2 (of 25)</p>
          <ul className="grid grid-cols-1 @md:grid-cols-2 gap-x-6 gap-y-1.5 text-[13.5px]">
            {marks.map((e) => <li key={e.sub} className="flex justify-between gap-3"><span>{e.sub}</span><span className="tnum"><span className="text-ink3">{e.ut1} →</span> <b className={cx('font-semibold', e.ut2 < 15 && 'text-warn')}>{e.ut2}</b></span></li>)}
          </ul>
        </div>
        <div className="rounded-xl border border-line p-3 text-[13.5px]"><p className="font-semibold mb-0.5">Behaviour notes</p><p className="text-ink2">{featured ? 'No concerns. Helped organise the Science exhibition stall.' : 'Talks during class sometimes. Responds well to reminders.'}</p></div>
        {canEdit && (
          <>
            <label className="flex items-center gap-3 text-[14px]"><Checkbox checked={arrived} onChange={setArrived} label="Parent arrived" /> Parent arrived{arrived && <span className="text-[12.5px] text-ink3">· 10:44 AM</span>}</label>
            <Field label="Teacher remarks" id="ptm-rem"><Textarea id="ptm-rem" value={f.remarks} onChange={(v) => setF({ ...f, remarks: v })} rows={2} placeholder="What you told the parent" /></Field>
            <Field label="Parent feedback" id="ptm-fb"><Textarea id="ptm-fb" value={f.feedback} onChange={(v) => setF({ ...f, feedback: v })} rows={2} placeholder="What the parent said" /></Field>
            <Field label="Follow-up actions" id="ptm-fu"><Input id="ptm-fu" value={f.follow} onChange={(e) => setF({ ...f, follow: e.target.value })} placeholder="For example: check the Science diary every Friday" /></Field>
            <div className="flex gap-2 justify-end">
              {saved && <Pill tone="ok" className="self-center mr-auto">Notes saved</Pill>}
              <Button variant="primary" icon={I.Check} onClick={() => { onSave(`${m.ti}-${m.si}`); onClose(); toast({ title: `Notes saved for ${s.name}`, body: 'On the student’s profile, Activities tab.' }); }}>Save notes</Button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

function PlanPTM({ open, onClose }) {
  const toast = useToast();
  const [f, setF] = useState({ date: '', classes: 'Nursery to UKG', from: '9:30 AM', to: '11:30 AM', slot: '10 minutes', subj: false });
  const [tried, setTried] = useState(false);
  const iso = /^\d{2}-\d{2}-\d{4}$/.test(f.date) ? f.date.split('-').reverse().join('-') : null;
  const hol = iso && (onDay(CAL, iso).find((e) => !TYPE[e.type].att) || (() => { const [y, m, d] = iso.split('-').map(Number); return weekendOf(y, m - 1, d) ? { name: weekendOf(y, m - 1, d) } : null; })());
  const err = { date: !iso ? 'Enter the date as DD-MM-YYYY' : hol ? `${f.date} is a holiday (${hol.name}). Pick a working day.` : '' };
  return (
    <FormSheet open={open} onClose={onClose} title="Plan a PTM" sub="Teachers’ slots are made from their classes. Parents book on Parent Link." submitLabel="Create slots"
      onSubmit={() => { setTried(true); if (err.date) return false; toast({ title: `PTM planned for ${f.date}`, body: `${f.classes}. Slots made for the class teachers. Booking opens when you send the link.` }); setF({ ...f, date: '' }); setTried(false); }}>
      <Field label="Date" required id="pp-date" hint="Must be a working day · DD-MM-YYYY" error={tried && err.date}><Input id="pp-date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} error={tried && err.date} className="tnum" placeholder="19-12-2026" /></Field>
      <Field label="Classes" required id="pp-cls"><Select id="pp-cls" value={f.classes} onChange={(v) => setF({ ...f, classes: v })} options={['Nursery to UKG', 'Classes 1–3', 'Classes 4–10', 'All classes']} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From" required id="pp-from"><Input id="pp-from" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className="tnum" /></Field>
        <Field label="To" required id="pp-to"><Input id="pp-to" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className="tnum" /></Field>
      </div>
      <Field label="Slot length" required id="pp-slot"><Segmented value={f.slot} onChange={(v) => setF({ ...f, slot: v })} options={['5 minutes', '10 minutes', '15 minutes']} className="w-full" /></Field>
      <label className="flex items-center gap-3 text-[14px]"><Checkbox checked={f.subj} onChange={(v) => setF({ ...f, subj: v })} label="Add subject teachers" />Add subject teachers too <span className="text-ink3 text-[12.5px]">· class teachers are added by themselves</span></label>
    </FormSheet>
  );
}

/* ======================= Co-curricular & Sports ======================= */
const LEVEL_TONE = { School: 'neutral', District: 'info', State: 'brand', National: 'ok' };
const ACH = [
  { id: 'A1', s: 'Tanvi Verma', cls: '10 A', act: 'Telangana State Science Olympiad', level: 'State', pos: 'Gold medal', date: '27 Sep 2026', cert: true, cr: 40 },
  { id: 'A2', s: 'Kabir Naidu', cls: '9 C', act: 'District inter-school football, Under-17', level: 'District', pos: 'Winners', date: '20 Sep 2026', cert: false, cr: 20 },
  { id: 'A3', s: 'Aarav Sharma', cls: '7 B', act: 'Science exhibition', level: 'School', pos: '2nd prize', date: '15 Sep 2026', cert: true, cr: 10 },
  { id: 'A4', s: 'Harini Reddy', cls: '7 B', act: 'Kuchipudi, Bal Utsav', level: 'District', pos: '1st', date: '13 Sep 2026', cert: true, cr: 20 },
  { id: 'A5', s: 'Rohan Gupta', cls: '6 A', act: 'International Maths Olympiad, level 1', level: 'National', pos: 'Qualified for level 2', date: '10 Sep 2026', cert: false, cr: 30 },
  { id: 'A6', s: 'Lasya Rao', cls: '8 B', act: 'Debate, Rotary Club of Kukatpally', level: 'District', pos: 'Best speaker', date: '6 Sep 2026', cert: true, cr: 20 },
  { id: 'A7', s: 'Ishaan Chowdary', cls: '7 A', act: 'Inter-school quiz', level: 'District', pos: 'Runners-up', date: '29 Aug 2026', cert: true, cr: 15 },
  { id: 'A8', s: 'Meera Iyer', cls: '2 B', act: 'Drawing competition, Swachh Bharat', level: 'School', pos: '1st', date: '22 Aug 2026', cert: true, cr: 10 },
  { id: 'A9', s: 'Pranav Rao', cls: '10 B', act: 'CBSE cluster athletics, 400 m', level: 'State', pos: '3rd', date: '18 Aug 2026', cert: true, cr: 30 },
  { id: 'A10', s: 'Diya Patel', cls: '9 C', act: 'Volunteering: Kukatpally lake clean-up', level: 'School', pos: 'Took part', date: '9 Aug 2026', cert: false, cr: 5 },
];
const HOUSE_DATA = [
  { name: HOUSES[0], tone: 'info', pts: 1284, captain: 'Tanvi Verma, 10 A', students: 309 },
  { name: HOUSES[1], tone: 'ok', pts: 1212, captain: 'Kabir Naidu, 9 C', students: 310 },
  { name: HOUSES[2], tone: 'warn', pts: 1146, captain: 'Pranav Rao, 10 B', students: 308 },
  { name: HOUSES[3], tone: 'bad', pts: 1098, captain: 'Diya Patel, 9 C', students: 309 },
];
const TONE_BG = { info: 'bg-info', ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad', brand: 'bg-brand' };
const CLUBS = [
  { name: 'Eco Club', who: 'Usha Rani', n: 34, meets: 'Thursdays, 2:20 PM', icon: 'Leaf' },
  { name: 'Robotics Club', who: 'Karthik Menon', n: 28, meets: 'Wednesdays, 3:50 PM', icon: 'Cpu' },
  { name: 'Literary Club', who: 'Anitha Kumari', n: 41, meets: 'Tuesdays, 2:20 PM', icon: 'BookOpen' },
  { name: 'Music Club', who: 'Lalitha Devi', n: 36, meets: 'Mondays, 3:50 PM', icon: 'Music' },
  { name: 'Art Club', who: 'Swapna Reddy', n: 45, meets: 'Fridays, 2:20 PM', icon: 'Palette' },
  { name: 'Chess Club', who: 'Imran Shaikh', n: 22, meets: 'Fridays, 3:50 PM', icon: 'Crown' },
];

function Cocurricular() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const [tab, setTab] = useState('ach');
  const [items, setItems] = useState(ACH);
  const [q, setQ] = useState('');
  const [lvl, setLvl] = useState('all');
  const [per, setPer] = useState(PERIODS.acyear);
  const [sel, setSel] = useState(new Set());
  const [add, setAdd] = useState(false);
  const [pts, setPts] = useState(null);
  const [houses, setHouses] = useState(HOUSE_DATA);
  const [log, setLog] = useState([
    ['+50', HOUSES[0], 'Inter-house quiz, winners', 'Venkat Rao', '8 Oct'], ['+20', HOUSES[1], 'Cleanest classrooms, week 14', 'Srinivas Murthy', '7 Oct'],
    ['−10', HOUSES[2], 'Late to assembly, 3 students', 'Mohammed Asif', '6 Oct'], ['+30', HOUSES[3], 'Science exhibition, best stall', 'Ravi Teja', '15 Sep'],
  ]);
  const inP = items.filter((a) => inPer(isoOf(a.date), per));
  const rows = inP.filter((a) => (lvl === 'all' || a.level === lvl) && (!q || (a.s + a.act + a.cls).toLowerCase().includes(q.toLowerCase())));
  const sorted = [...houses].sort((a, b) => b.pts - a.pts);
  return (
    <div>
      <ModuleHead sub="Activities, achievements and certificates, houses, clubs and sports teams. Achievements also show on the student’s profile."
        actions={canEdit && <Button variant="primary" icon={I.Plus} onClick={() => setAdd(true)}>Record achievement</Button>} />
      <Chips className="mb-5" value={tab} onChange={setTab} options={[{ value: 'ach', label: 'Activities and achievements' }, { value: 'houses', label: 'Houses' }, { value: 'clubs', label: 'Clubs' }, { value: 'sports', label: 'Sports' }]} />
      {tab === 'ach' && (
        <div className="flex flex-col gap-5 @lg:gap-6">
          <Stats items={[
            { label: 'Achievements', value: String(inP.length), icon: 'Award', sub: fmtRange(per) },
            { label: 'District level or above', value: String(inP.filter((a) => a.level !== 'School').length), icon: 'Medal', tone: 'ok' },
            { label: 'Certificates issued', value: String(inP.filter((a) => a.cert).length), icon: 'FileBadge' },
            { label: 'Activity credits given', value: fmt(inP.reduce((x, a) => x + a.cr, 0)), icon: 'Star', sub: 'Shown on each profile' },
          ]} />
          <Split side={300}>
            <Card className="overflow-hidden min-w-0">
              <Toolbar>
                <SearchBox value={q} onChange={setQ} placeholder="Student, activity or class" id="ach-search" />
                <DatePeriod id="ach-per" value={per} onChange={setPer} className="w-full @md:w-auto" />
                <Select id="ach-lvl" value={lvl} onChange={setLvl} options={[{ value: 'all', label: 'All levels' }, 'School', 'District', 'State', 'National']} className="@md:w-40" />
                <ExportButton what="achievements" />
              </Toolbar>
              {canEdit && <BulkBar count={sel.size} onClear={() => setSel(new Set())}>
                <Button size="sm" variant="secondary" icon={I.FileBadge} onClick={() => { setItems((x) => x.map((a) => (sel.has(a.id) ? { ...a, cert: true } : a))); toast({ title: `${sel.size} certificates issued`, body: 'Sent to parents on WhatsApp. Print copies are in the queue.' }); setSel(new Set()); }}>Issue certificates</Button>
              </BulkBar>}
              <DataList rows={rows} select={canEdit ? [sel, setSel] : null} minWidth={760} footer={`Showing: ${per.label} · ${fmtRange(per)} · ${rows.length} achievements`}
                empty={<Empty icon={I.Award} title="No achievements in these dates" body="Pick other dates or another level." />}
                columns={[
                  { key: 's', label: 'Student', render: (a) => <div className="flex items-center gap-2.5"><Avatar name={a.s} size={32} /><div><p className="font-semibold leading-tight">{a.s}</p><p className="text-[12.5px] text-ink3">{a.cls}</p></div></div> },
                  { key: 'act', label: 'Activity or competition', render: (a) => <div className="max-w-[240px]"><p className="leading-snug">{a.act}</p><p className="text-[12.5px] text-ink3">{a.pos} · {a.date}</p></div> },
                  { key: 'level', label: 'Level', render: (a) => <Pill tone={LEVEL_TONE[a.level]}>{a.level}</Pill> },
                  { key: 'cr', label: 'Credits', align: 'right', render: (a) => `+${a.cr}` },
                  { key: 'cert', label: 'Certificate', render: (a) => (a.cert ? <Pill tone="ok" dot>Issued</Pill> : canEdit ? <Button size="sm" variant="soft" icon={I.FileBadge} onClick={() => { setItems((x) => x.map((y) => (y.id === a.id ? { ...y, cert: true } : y))); toast({ title: `Certificate issued to ${a.s}`, body: 'From the design in Settings, Document Designs.' }); }}>Issue</Button> : <span className="text-ink3">Not yet</span>) },
                ]}
                mobile={(a) => ({ title: `${a.s} · ${a.pos}`, sub: `${a.act} · ${a.date}`, avatar: a.s, pills: [<Pill key="l" tone={LEVEL_TONE[a.level]} className="!h-[22px] !text-[11.5px]">{a.level}</Pill>, <Pill key="c" tone={a.cert ? 'ok' : 'neutral'} className="!h-[22px] !text-[11.5px]">{a.cert ? 'Certificate issued' : 'No certificate yet'}</Pill>] })} />
            </Card>
            <Card>
              <CardHead title="Taking part this year" sub="Students in each activity" icon={I.Sparkles} />
              <div className="px-5 pb-5"><HBars rows={[{ k: 'Olympiads', v: 131 }, { k: 'Art', v: 56 }, { k: 'Music', v: 42 }, { k: 'Dance', v: 38 }, { k: 'Volunteering', v: 27 }, { k: 'Debate', v: 24 }, { k: 'Speaking', v: 18 }]} max={140} unit="" labelWidth={86} /></div>
            </Card>
          </Split>
        </div>
      )}
      {tab === 'houses' && (
        <div className="flex flex-col gap-5 @lg:gap-6">
          <div className="grid grid-cols-2 @xl:grid-cols-4 gap-3">
            {sorted.map((h, i) => (
              <Card key={h.name} className="p-4 relative overflow-hidden">
                <span className={cx('absolute left-0 top-0 bottom-0 w-1.5', TONE_BG[h.tone])} />
                <div className="flex items-center justify-between gap-2"><p className="font-semibold text-[14.5px] truncate">{h.name}</p><span className={cx('text-[12px] font-bold tnum px-2 h-6 rounded-full grid place-items-center', i === 0 ? 'bg-brand text-brandink' : 'bg-sunken text-ink2')}>#{i + 1}</span></div>
                <p className="font-display text-[26px] font-semibold tnum leading-tight mt-1">{fmt(h.pts)}</p>
                <p className="text-[12.5px] text-ink3 truncate">{h.students} students · Captain {h.captain}</p>
              </Card>
            ))}
          </div>
          <Split side={340}>
            <Card>
              <CardHead title="House points" sub="Every change needs a reason and is kept" icon={I.ChartColumn} action={canEdit && <Button size="sm" variant="soft" icon={I.Plus} onClick={() => setPts({ house: HOUSES[0], n: '10', why: '' })}>Add or remove points</Button>} />
              <ul className="px-5 pb-5 flex flex-col gap-3">
                {sorted.map((h) => (
                  <li key={h.name} className="grid grid-cols-[120px_1fr_60px] items-center gap-3 text-[13.5px]">
                    <span className="font-semibold truncate">{h.name.replace(' House', '')}</span>
                    <span className="h-3 rounded-full bg-sunken overflow-hidden"><span className={cx('block h-full rounded-full', TONE_BG[h.tone])} style={{ width: `${(h.pts / 1400) * 100}%` }} /></span>
                    <span className="text-right font-semibold tnum">{fmt(h.pts)}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHead title="Latest changes" icon={I.History} />
              <ul className="px-2 pb-2">
                {log.map(([p, h, why, by, d], i) => <li key={i}><Row icon={p.startsWith('+') ? 'TrendingUp' : 'TrendingDown'} iconTone={p.startsWith('+') ? 'ok' : 'bad'} title={`${p} ${h.replace(' House', '')}`} sub={`${why} · ${by} · ${d}`} /></li>)}
              </ul>
            </Card>
          </Split>
        </div>
      )}
      {tab === 'clubs' && (
        <div className="grid grid-cols-1 @md:grid-cols-2 @xl:grid-cols-3 gap-4">
          {CLUBS.map((c) => (
            <Card key={c.name} className="p-4 flex flex-col gap-3">
              <div className="flex items-center gap-3"><span className="w-11 h-11 rounded-xl bg-brand/10 text-brand grid place-items-center shrink-0"><Icon name={c.icon} size={20} /></span><div className="min-w-0"><p className="font-semibold text-[15px]">{c.name}</p><p className="text-[12.5px] text-ink3">In-charge {c.who}</p></div></div>
              <p className="text-[13.5px] text-ink2 flex items-center gap-4"><span className="flex items-center gap-1.5"><I.Users size={15} className="text-ink3" /><b className="font-semibold tnum">{c.n}</b> members</span><span className="flex items-center gap-1.5"><I.Clock size={15} className="text-ink3" />{c.meets}</span></p>
              {canEdit && <div className="flex gap-2"><Button size="sm" variant="secondary" icon={I.UserPlus} onClick={() => toast({ title: `Add members to ${c.name}`, body: 'Pick students by class. They see it on their profile.', tone: 'info' })}>Add members</Button><Button size="sm" variant="ghost" onClick={() => toast({ title: `Meeting recorded: ${c.name}`, body: `Today · ${c.n - 3} of ${c.n} present` })}>Record meeting</Button></div>}
            </Card>
          ))}
        </div>
      )}
      {tab === 'sports' && (
        <div className="flex flex-col gap-5 @lg:gap-6">
          <div className="grid grid-cols-1 @md:grid-cols-2 @xl:grid-cols-4 gap-3">
            {[['Under-14 Cricket, boys', 'Mohammed Asif', 16, 'Dumbbell'], ['Under-17 Football, boys', 'Mohammed Asif', 18, 'Trophy'], ['Under-14 Kabaddi, girls', 'Srilatha K. (visiting coach)', 12, 'Medal'], ['Athletics squad', 'Mohammed Asif', 24, 'Timer']].map(([t, c, n, ic]) => (
              <Card key={t} className="p-4"><span className="w-10 h-10 rounded-xl bg-brand/10 text-brand grid place-items-center"><Icon name={ic} size={19} /></span><p className="font-semibold text-[14.5px] mt-2.5">{t}</p><p className="text-[12.5px] text-ink3">{n} players · coach {c}</p></Card>
            ))}
          </div>
          <div className="grid grid-cols-1 @xl:grid-cols-2 gap-5 @lg:gap-6 items-start">
            <Card>
              <CardHead title="Fixtures and results" icon={I.Trophy} action={canEdit && <Button size="sm" variant="soft" icon={I.Plus} onClick={() => toast({ title: 'Add a fixture', body: 'Team, opponent, date, home or away.', tone: 'info' })}>Add fixture</Button>} />
              <ul className="px-2 pb-2">
                {[['Under-17 Football vs Delhi Public School, Nacharam', 'Sat 31 Oct · away · 3:30 PM', null], ['District athletics meet', '14–15 Nov · Gachibowli Stadium', null], ['Under-14 Cricket vs Meridian School', 'Won by 34 runs · 26 Sep', 'ok'], ['District inter-school football, Under-17', 'Winners · 20 Sep', 'ok'], ['Under-14 Kabaddi vs Johnson Grammar School', 'Lost 28–31 · 12 Sep', 'bad']].map(([t, s, r]) => (
                  <li key={t}><Row icon={r ? (r === 'ok' ? 'Trophy' : 'Flag') : 'CalendarDays'} iconTone={r || 'neutral'} title={t} sub={s} /></li>
                ))}
              </ul>
            </Card>
            <Col>
              <Card>
                <CardHead title="Training today" sub="Football, 3:50 PM · School ground" icon={I.Timer} action={canEdit && <Button size="sm" variant="secondary" onClick={() => toast({ title: 'Training attendance saved', body: 'Under-17 Football · 16 of 18 present' })}>Mark attendance</Button>} />
                <div className="px-5 pb-5 flex items-center gap-4"><Ring value={89} size={64} stroke={7} tone="ok"><span className="text-[13px] font-bold tnum">89%</span></Ring><p className="text-[13.5px] text-ink2">Average training attendance this term. 2 players have missed 3 sessions in a row.</p></div>
              </Card>
              <Card>
                <CardHead title="Fitness records" sub="BMI, 600 m run, sit-and-reach" icon={I.HeartPulse} />
                <div className="px-5 pb-5"><HBars rows={[{ k: 'Class 6', v: 96 }, { k: 'Class 7', v: 92 }, { k: 'Class 8', v: 88 }, { k: 'Class 9', v: 79 }, { k: 'Class 10', v: 84 }]} lowBelow={85} labelWidth={64} /><p className="text-[12.5px] text-ink3 mt-3">Tests done this term, by class</p></div>
              </Card>
            </Col>
          </div>
        </div>
      )}
      <AchievementForm open={add} onClose={() => setAdd(false)} onSaved={(a) => { setItems((x) => [a, ...x]); setTab('ach'); toast({ title: `Achievement recorded for ${a.s}`, body: `${a.cert ? 'Certificate issued. ' : ''}+${a.cr} activity credits. On the student’s profile now.` }); }} />
      <FormSheet open={!!pts} onClose={() => setPts(null)} title="Add or remove house points" sub="A reason is needed. Every change is kept." submitLabel="Save points"
        onSubmit={() => { if (!pts.why.trim() || !/^-?\d+$/.test(pts.n)) return false; const n = Number(pts.n); setHouses((x) => x.map((h) => (h.name === pts.house ? { ...h, pts: h.pts + n } : h))); setLog((x) => [[`${n >= 0 ? '+' : '−'}${Math.abs(n)}`, pts.house, pts.why, 'You', 'Today'], ...x]); toast({ title: `${n >= 0 ? '+' : '−'}${Math.abs(n)} points to ${pts.house}`, body: pts.why }); }}>
        {pts && <>
          <Field label="House" required id="hp-house"><Select id="hp-house" value={pts.house} onChange={(v) => setPts({ ...pts, house: v })} options={HOUSES} /></Field>
          <Field label="Points" required id="hp-n" hint="Use a minus sign to take points away, like -10" error={!/^-?\d+$/.test(pts.n) ? 'Enter a whole number' : ''}><Input id="hp-n" value={pts.n} onChange={(e) => setPts({ ...pts, n: e.target.value })} className="tnum" inputMode="numeric" /></Field>
          <Field label="Reason" required id="hp-why" error={!pts.why.trim() ? 'Give a reason' : ''}><Input id="hp-why" value={pts.why} onChange={(e) => setPts({ ...pts, why: e.target.value })} placeholder="For example: Inter-house debate, winners" /></Field>
        </>}
      </FormSheet>
    </div>
  );
}

function AchievementForm({ open, onClose, onSaved }) {
  const blank = { s: 'Aarav Sharma', act: '', level: 'School', pos: '', date: '09-10-2026', cert: true };
  const [f, setF] = useState(blank);
  const [tried, setTried] = useState(false);
  const credits = { School: 10, District: 20, State: 40, National: 60 }[f.level];
  const err = { act: !f.act.trim() ? 'Name the activity or competition' : '', date: !/^\d{2}-\d{2}-\d{4}$/.test(f.date) ? 'Enter the date as DD-MM-YYYY' : '' };
  return (
    <FormSheet open={open} onClose={onClose} title="Record achievement" sub="For a whole team or class, pick several students." submitLabel="Record"
      onSubmit={() => { setTried(true); if (err.act || err.date) return false; onSaved({ id: 'A' + Date.now(), s: f.s, cls: f.s === 'Aarav Sharma' ? '7 B' : '7 B', act: f.act, level: f.level, pos: f.pos || 'Took part', date: '9 Oct 2026', cert: f.cert, cr: credits }); setF(blank); setTried(false); }}>
      <Field label="Student(s)" required id="af-s"><Select id="af-s" value={f.s} onChange={(v) => setF({ ...f, s: v })} options={CLASS_7B.slice(0, 12).map((s) => s.name)} /></Field>
      <Field label="Activity or competition" required id="af-act" error={tried && err.act}><Input id="af-act" value={f.act} onChange={(e) => setF({ ...f, act: e.target.value })} error={tried && err.act} placeholder="For example: Inter-school quiz" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Level" id="af-lvl"><Select id="af-lvl" value={f.level} onChange={(v) => setF({ ...f, level: v })} options={['School', 'District', 'State', 'National']} /></Field>
        <Field label="Position or result" id="af-pos"><Input id="af-pos" value={f.pos} onChange={(e) => setF({ ...f, pos: e.target.value })} placeholder="1st, Winners…" /></Field>
      </div>
      <Field label="Date" required id="af-date" hint="DD-MM-YYYY" error={tried && err.date}><Input id="af-date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="tnum" /></Field>
      <div className="rounded-xl bg-sunken/70 p-3.5 flex items-center gap-3">
        <Switch id="af-cert" on={f.cert} onChange={(v) => setF({ ...f, cert: v })} label="Issue a certificate now" />
        <label htmlFor="af-cert" className="text-[14px] flex-1"><b className="font-semibold">Issue a certificate now</b><span className="block text-[12.5px] text-ink3">Sent to the parent and added to print</span></label>
      </div>
      <p className="text-[13px] text-ink2 flex items-center gap-2"><I.Star size={15} className="text-brand" />Activity credits: <b className="font-semibold">+{credits}</b> <span className="text-ink3">for a {f.level.toLowerCase()}-level result</span></p>
    </FormSheet>
  );
}

/* ======================= Gallery ======================= */
const ALB_TONE = { Published: 'ok', Draft: 'neutral', Archived: 'neutral' };
const CONSENT = { all: ['All consented', 'ok'], some: ['Some without consent', 'warn'], untagged: ['Not tagged', 'neutral'] };
const ALBUMS = [
  { id: 'AL-19', name: 'Fire drill, October', event: 'Fire drill', date: '9 Oct 2026', aud: 'Staff only', status: 'Draft', photos: 12, videos: 1, consent: 'untagged', icon: 'Flame', tone: 'bad' },
  { id: 'AL-18', name: 'PTM, Classes 1–3', event: 'PTM', date: '9 Oct 2026', aud: 'Staff only', status: 'Draft', photos: 6, videos: 0, consent: 'untagged', icon: 'Users', tone: 'brand' },
  { id: 'AL-17', name: 'Inter-house football', event: 'Sports', date: '20 Sep 2026', aud: 'Everyone', status: 'Published', photos: 38, videos: 2, consent: 'some', missing: 1, icon: 'Trophy', tone: 'ok' },
  { id: 'AL-16', name: 'Science exhibition 2026', event: 'Science exhibition', date: '15 Sep 2026', aud: 'Parents of Classes 6–8', status: 'Published', photos: 84, videos: 3, consent: 'some', missing: 3, icon: 'FlaskConical', tone: 'info' },
  { id: 'AL-15', name: 'Teachers’ Day', event: 'Teachers’ Day', date: '5 Sep 2026', aud: 'Everyone', status: 'Published', photos: 46, videos: 1, consent: 'all', icon: 'Heart', tone: 'bad' },
  { id: 'AL-14', name: 'Krishnashtami, pre-primary', event: 'Cultural', date: '4 Sep 2026', aud: 'Parents of Nursery to UKG', status: 'Published', photos: 57, videos: 2, consent: 'all', icon: 'PartyPopper', tone: 'warn' },
  { id: 'AL-13', name: 'Independence Day', event: 'Independence Day', date: '15 Aug 2026', aud: 'Everyone', status: 'Published', photos: 62, videos: 2, consent: 'all', icon: 'Flag', tone: 'warn' },
  { id: 'AL-12', name: 'Art week', event: 'Art week', date: '24 Jul 2026', aud: 'Everyone', status: 'Published', photos: 41, videos: 0, consent: 'all', icon: 'Palette', tone: 'brand' },
  { id: 'AL-08', name: 'Annual Day 2025–26', event: 'Annual Day', date: '14 Feb 2026', aud: 'Everyone', status: 'Archived', photos: 212, videos: 9, consent: 'all', icon: 'Drama', tone: 'info' },
];
const TILE = { brand: 'bg-brand/10 text-brand', ok: 'bg-ok/10 text-ok', warn: 'bg-warn/12 text-warn', bad: 'bg-bad/10 text-bad', info: 'bg-info/10 text-info' };
const PHOTO_ICONS = ['Users', 'Smile', 'Sparkles', 'Camera', 'Star', 'Trophy', 'Flag', 'Music', 'Palette', 'Image', 'Heart', 'Medal'];

function Gallery({ access, params }) {
  const { go } = useNav();
  const toast = useToast();
  const canEdit = useCanEdit();
  const full = access === 'full' && canEdit;
  const [albums, setAlbums] = useState(ALBUMS);
  const [f, setF] = useState('all');
  const [per, setPer] = useState(PERIODS.acyear);
  const [add, setAdd] = useState(false);
  // Gallery is run by the people with full Events access. Others have the School Calendar only.
  if (access !== 'full') return <NotForRole title="The Gallery is kept by the events team" body="Your part of Events & Calendar is the School Calendar." />;
  if (params?.id) {
    const al = albums.find((a) => a.id === params.id) || albums[0];
    return <AlbumDetail al={al} full={full} onBack={() => go('events', { page: 'gallery' })} onChange={(n) => setAlbums((x) => x.map((a) => (a.id === n.id ? n : a)))} />;
  }
  const rows = albums.filter((a) => inPer(isoOf(a.date), per) && (f === 'all' || a.status === f));
  return (
    <div>
      <ModuleHead sub="Photo and video albums by event. Students without photo consent are blurred or left out." 
        actions={full && <Button variant="primary" icon={I.FolderPlus} onClick={() => setAdd(true)}>New album</Button>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        {<Banner tone="warn" title="4 students in published albums have no photo consent.">They are left out of shared photos. Ask their guardians on Parent Link.</Banner>}
        <div className="flex items-center gap-3 flex-wrap">
          <DatePeriod id="gal-per" value={per} onChange={setPer} className="w-full @md:w-auto" />
          <Segmented value={f} onChange={setF} options={[{ value: 'all', label: 'All' }, { value: 'Published', label: 'Published' }, { value: 'Draft', label: 'Drafts' }, { value: 'Archived', label: 'Archived' }]} />
          <span className="text-[13px] text-ink3 tnum">{per.label} · {fmtRange(per)} · {rows.length} albums · {fmt(rows.reduce((a, x) => a + x.photos, 0))} photos</span>
        </div>
        {rows.length ? (
          <ul className="grid grid-cols-2 @md:grid-cols-3 @xl:grid-cols-4 gap-3 @md:gap-4">
            {rows.map((a) => (
              <li key={a.id}>
                <button onClick={() => go('events', { page: 'gallery', id: a.id })} className="w-full text-left rounded-2xl bg-surface border border-line/70 shadow-card overflow-hidden hover:border-brand/40 transition group">
                  <span className={cx('relative block aspect-[4/3] overflow-hidden', TILE[a.tone])}>
                    <span className="absolute inset-0 dotgrid opacity-40" />
                    <span className="absolute -right-6 -bottom-8 w-28 h-28 rounded-full bg-current opacity-[.08]" />
                    <span className="absolute inset-0 grid place-items-center"><Icon name={a.icon} size={42} strokeWidth={1.6} className="group-hover:scale-105 transition" /></span>
                    <span className="absolute left-2 top-2 rounded-full bg-surface"><Pill tone={ALB_TONE[a.status]} className="!h-[22px] !text-[11px]">{a.status}</Pill></span>
                    <span className="absolute right-2 bottom-2 h-6 px-2 rounded-full bg-surface/90 text-ink2 text-[11.5px] font-semibold flex items-center gap-1 tnum"><I.Images size={12} />{a.photos}{a.videos ? <><I.Video size={12} className="ml-1" />{a.videos}</> : null}</span>
                  </span>
                  <span className="block p-3">
                    <span className="block font-semibold text-[14px] truncate">{a.name}</span>
                    <span className="block text-[12px] text-ink3 truncate">{a.date} · {a.aud}</span>
                    {<span className="mt-1.5 flex"><Pill tone={CONSENT[a.consent][1]} className="!h-[22px] !text-[11px]">{a.consent === 'some' ? `${a.missing} without consent` : CONSENT[a.consent][0]}</Pill></span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : <Card><Empty icon={I.Images} title="No albums here" body="No albums in these dates. Pick other dates or another filter." action={full && <Button variant="secondary" icon={I.FolderPlus} onClick={() => setAdd(true)}>New album</Button>} /></Card>}
      </div>
      <AlbumForm open={add} onClose={() => setAdd(false)} onSaved={(a) => { setAlbums((x) => [a, ...x]); toast({ title: `Album “${a.name}” made`, body: 'Visible to staff only until you publish it.' }); }} />
    </div>
  );
}

function AlbumForm({ open, onClose, onSaved }) {
  const [f, setF] = useState({ name: 'Fire drill, October', event: 'Fire drill', date: '09-10-2026', vis: 'Staff only', rule: 'Leave the photo out' });
  return (
    <FormSheet open={open} onClose={onClose} title="New album" sub="Link it to an event. Upload photos from a phone or computer." submitLabel="Make album"
      onSubmit={() => { if (!f.name.trim()) return false; onSaved({ id: 'AL-20', name: f.name, event: f.event, date: '9 Oct 2026', aud: f.vis, status: 'Draft', photos: 0, videos: 0, consent: 'untagged', icon: 'Camera', tone: 'brand' }); }}>
      <Field label="Name" required id="alb-name" error={!f.name.trim() ? 'Give the album a name' : ''}><Input id="alb-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Event" id="alb-ev"><Select id="alb-ev" value={f.event} onChange={(v) => setF({ ...f, event: v, name: v })} options={['Fire drill', 'PTM', 'Wonderla picnic', 'Diwali celebration', 'Annual Sports Day']} /></Field>
        <Field label="Date" required id="alb-date" hint="DD-MM-YYYY"><Input id="alb-date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="tnum" /></Field>
      </div>
      <Field label="Visible to" required id="alb-vis" hint="Staff only until you change it"><Select id="alb-vis" value={f.vis} onChange={(v) => setF({ ...f, vis: v })} options={['Staff only', 'Chosen classes', 'Everyone']} /></Field>
      <Field label="Students without photo consent" required id="alb-rule"><Segmented value={f.rule} onChange={(v) => setF({ ...f, rule: v })} options={['Leave the photo out', 'Blur them']} className="w-full" /></Field>
    </FormSheet>
  );
}

function AlbumDetail({ al, full, onBack, onChange }) {
  const toast = useToast();
  const [rule, setRule] = useState('out');
  const [vis, setVis] = useState(al.aud);
  const [warn, setWarn] = useState(false);
  const [photos, setPhotos] = useState(() => Array.from({ length: Math.min(al.photos, 12) }, (_, i) => ({ id: i, icon: PHOTO_ICONS[i % PHOTO_ICONS.length], tags: al.consent === 'untagged' ? 0 : (i * 3) % 6 + (i % 4 === 3 ? 0 : 1), st: al.consent === 'untagged' ? 'untagged' : al.consent === 'some' && i % 5 === 1 ? 'some' : i % 4 === 3 ? 'none' : 'ok', video: i === 4 && al.videos > 0 })));
  const [tag, setTag] = useState(null);
  const ST = { ok: ['All consented', 'ok'], some: ['Some without consent', 'warn'], untagged: ['Not tagged', 'neutral'], none: ['No students', 'neutral'] };
  const untagged = photos.filter((p) => p.st === 'untagged').length;
  const some = photos.filter((p) => p.st === 'some').length;
  const publish = () => { onChange({ ...al, status: 'Published', aud: vis }); toast({ title: `${al.name} published`, body: `Visible to ${vis.toLowerCase()}. ${untagged ? `${untagged} untagged photos stay staff only.` : ''}` }); };
  return (
    <div>
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink mb-3 -ml-1 h-8 px-1 rounded-lg"><I.ArrowLeft size={17} />Gallery <span className="text-ink3 font-normal">/ {al.id}</span></button>
      <div className="flex flex-col @lg:flex-row @lg:items-end @lg:justify-between gap-3 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap"><h1 className="font-display text-[24px] @md:text-[28px] font-semibold tracking-tight leading-tight">{al.name}</h1><Pill tone={ALB_TONE[al.status]} dot>{al.status}</Pill></div>
          <p className="text-[14px] text-ink3 mt-1">{al.event} · {al.date} · {al.photos} photos{al.videos ? `, ${al.videos} videos` : ''}</p>
        </div>
        {full && (
          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" icon={I.Upload} onClick={() => { setPhotos((x) => [...x, ...[0, 1, 2, 3].map((k) => ({ id: x.length + k, icon: 'Camera', tags: 0, st: 'untagged' }))]); toast({ title: '4 photos uploaded', body: 'Tag the students in them. Until then they stay staff only.' }); }}>Upload</Button>
            {al.status !== 'Published' ? <Button variant="primary" icon={I.Globe} onClick={() => (vis === 'Staff only' ? setWarn(true) : publish())}>Publish</Button>
              : <Button variant="secondary" icon={I.Share2} onClick={() => toast({ title: 'Album link sent to parents', body: 'Photo consent is checked for every photo before sharing.' })}>Share link</Button>}
            {al.status !== 'Archived' && <MoreMenu items={[['Archive', 'Archive album', () => { onChange({ ...al, status: 'Archived' }); toast({ title: 'Album archived', body: 'Hidden from parents. Staff can still see it.', undo: () => onChange(al) }); }]]} />}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-5 @lg:gap-6">
        {(some > 0 || al.missing) && <Banner tone="warn" title={`${al.missing || some} students in this album have no photo consent.`} action={full && <Button size="sm" variant="secondary" onClick={() => toast({ title: `Consent request sent to ${al.missing || some} guardians`, body: 'Photo consent, on Parent Link.' })}>Ask guardians</Button>}>{rule === 'out' ? 'Photos with them are left out when shared.' : 'They will be blurred.'}</Banner>}
        {untagged > 0 && <Banner tone="info" title={`${untagged} photos are not tagged yet.`}>They stay visible to staff only until the students in them are tagged.</Banner>}
        <Split side={300}>
          <Card className="p-3 @md:p-4 min-w-0">
            <ul className="grid grid-cols-2 @md:grid-cols-3 @xl:grid-cols-4 gap-2.5">
              {photos.map((p) => (
                <li key={p.id}>
                  <button onClick={() => full && setTag(p)} className={cx('relative w-full aspect-square rounded-xl overflow-hidden text-left', TILE[al.tone], !full && 'cursor-default')}>
                    <span className="absolute inset-0 dotgrid opacity-30" />
                    <span className={cx('absolute inset-0 grid place-items-center', p.st === 'some' && rule === 'out' && 'opacity-30')}><Icon name={p.video ? 'Video' : p.icon} size={30} strokeWidth={1.6} /></span>
                    {p.st === 'some' && rule === 'blur' && <span className="absolute left-1/3 top-1/4 w-10 h-10 rounded-full bg-surface/70 backdrop-blur-sm" />}
                    <span className="absolute left-1.5 bottom-1.5 right-1.5 flex items-center gap-1 flex-wrap">
                      <span className="rounded-full bg-surface"><Pill tone={ST[p.st][1]} className="!h-5 !text-[10.5px] !px-2">{p.st === 'some' && rule === 'out' ? 'Left out' : ST[p.st][0]}</Pill></span>
                      {p.tags > 0 && <span className="h-5 px-1.5 rounded-full bg-surface/90 text-ink2 text-[10.5px] font-semibold flex items-center gap-0.5"><I.Tag size={10} />{p.tags}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {al.photos > photos.length && <p className="text-[12.5px] text-ink3 text-center mt-3">Showing {photos.length} of {al.photos} photos</p>}
          </Card>
          <Col>
            <Card>
              <CardHead title="Who can see it" icon={I.Eye} />
              <div className="px-5 pb-5 flex flex-col gap-4">
                <Field label="Visible to" id="al-vis" hint={vis === 'Staff only' ? 'Change before publishing so parents can see it' : 'Parents get it through a link in a message'}>
                  <Select id="al-vis" value={vis} onChange={(v) => { if (!full) return; setVis(v); toast({ title: `Visible to ${v.toLowerCase()}`, body: 'Saved.' }); }} options={['Staff only', 'Parents of Classes 6–8', 'Chosen classes', 'Everyone']} />
                </Field>
                <Field label="Students without photo consent" id="al-rule">
                  <Segmented value={rule} onChange={(v) => full && setRule(v)} options={[{ value: 'out', label: 'Leave photo out' }, { value: 'blur', label: 'Blur them' }]} className="w-full" />
                </Field>
              </div>
            </Card>
            <Card>
              <CardHead title="Photo consent" sub="Checked before a photo is shown or shared" icon={I.ShieldCheck} />
              <ul className="px-5 pb-5 flex flex-col gap-2 text-[13.5px]">
                {Object.entries(ST).map(([k, [l, t]]) => <li key={k} className="flex items-center justify-between gap-3"><Pill tone={t}>{l}</Pill><span className="tnum font-semibold">{photos.filter((p) => p.st === k).length}</span></li>)}
              </ul>
            </Card>
          </Col>
        </Split>
      </div>
      <ConfirmSheet open={warn} onClose={() => setWarn(false)} title="Visible to staff only. Change before publishing?" sub="Parents cannot see this album yet. Pick who can see it, or publish for staff only."
        confirmLabel="Publish for staff only" onConfirm={publish} />
      <TagSheet p={tag} onClose={() => setTag(null)} onSave={(p, n, miss) => { setPhotos((x) => x.map((y) => (y.id === p.id ? { ...y, tags: n, st: n === 0 ? 'none' : miss ? 'some' : 'ok' } : y))); toast({ title: n ? `${n} students tagged` : 'Marked as no students', body: miss ? `${miss} without photo consent: ${rule === 'out' ? 'the photo is left out when shared' : 'they will be blurred'}.` : 'All have photo consent.' }); }} />
    </div>
  );
}

function TagSheet({ p, onClose, onSave }) {
  const kids = CLASS_7B.slice(0, 10).map((s, i) => ({ s, ok: i % 7 !== 3 }));
  const [on, setOn] = useState(new Set());
  if (!p) return null;
  const miss = kids.filter((k) => on.has(k.s.id) && !k.ok).length;
  return (
    <Sheet open={!!p} onClose={() => { onClose(); setOn(new Set()); }} title="Tag students in this photo" sub="Pick from the event’s list. Photo consent is shown for each."
      footer={<><Button variant="ghost" onClick={() => { onSave(p, 0, 0); onClose(); setOn(new Set()); }}>No students in it</Button><Button variant="primary" icon={I.Tag} disabled={!on.size} onClick={() => { onSave(p, on.size, miss); onClose(); setOn(new Set()); }}>Tag {on.size || ''} students</Button></>}>
      <ul className="flex flex-col">
        {kids.map((k) => (
          <li key={k.s.id} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-sunken/60">
            <Checkbox checked={on.has(k.s.id)} onChange={() => setOn((x) => { const n = new Set(x); n.has(k.s.id) ? n.delete(k.s.id) : n.add(k.s.id); return n; })} label={k.s.name} />
            <Avatar name={k.s.name} size={32} />
            <span className="flex-1 text-[14px] font-medium truncate">{k.s.name}</span>
            <Pill tone={k.ok ? 'ok' : 'warn'} className="!h-[22px] !text-[11px]">{k.ok ? 'Photo consent' : 'No consent'}</Pill>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

/* ======================= Daily Activities ======================= */
const PRE = [
  { id: 'UKG A', teacher: 'Sunitha Mohan', n: 22 }, { id: 'UKG B', teacher: 'Rekha Prasad', n: 21 }, { id: 'LKG A', teacher: 'Jyothi Rani', n: 20 },
  { id: 'LKG B', teacher: 'Farzana Sultana', n: 19 }, { id: 'Nursery A', teacher: 'Kalpana Devi', n: 18 },
];
const KIDS = ['Anaya Sharma', 'Advik Reddy', 'Aadhya Rao', 'Vihaan Goud', 'Ira Menon', 'Saisha Naidu', 'Reyansh Patel', 'Myra Chowdary', 'Arjun Varma', 'Kiara Iyer', 'Dhruv Kumar', 'Navya Shetty', 'Ishaan Das', 'Prisha Joshi', 'Ayaan Khan', 'Sahasra Pillai', 'Veda Singh', 'Rudra Gupta', 'Anvi Verma', 'Shaurya Rao', 'Tara Nair', 'Hrithik Babu'];
const ACTS = [
  { id: 'rhymes', label: 'Rhymes', time: '9:30 AM', icon: 'Music', opts: ['Took part', 'Watched', 'Did not join'] },
  { id: 'snack', label: 'Snack', time: '10:15 AM', icon: 'Apple', opts: ['Ate all', 'Ate half', 'Ate a little', 'Did not eat'] },
  { id: 'water', label: 'Water', time: '10:30 AM', icon: 'GlassWater', opts: ['2 glasses', '1 glass', 'Few sips'] },
  { id: 'colour', label: 'Colouring: Diwali diya', time: '11:15 AM', icon: 'Palette', opts: ['Finished', 'Half done', 'Did not join'] },
  { id: 'lunch', label: 'Lunch', time: '12:40 PM', icon: 'Utensils', opts: ['Ate all', 'Ate half', 'Ate a little', 'Did not eat'] },
  { id: 'nap', label: 'Nap', time: '1:30 PM', icon: 'BedDouble', opts: ['Slept 1 hour', 'Slept 30 minutes', 'Rested, no sleep'] },
  { id: 'play', label: 'Outdoor play', time: '2:45 PM', icon: 'Footprints', opts: ['Played', 'Stayed in'] },
];

function DailyActivities({ access }) {
  const toast = useToast();
  const canEdit = useCanEdit();
  const own = access === 'own';
  const [cls, setCls] = useState('UKG A');
  const absent = new Set(['Ayaan Khan']);
  const present = KIDS.filter((k) => !absent.has(k));
  const [log, setLog] = useState(() => {
    const o = {};
    KIDS.forEach((k, i) => { if (absent.has(k)) return; o[k] = { rhymes: i % 9 === 4 ? 'Watched' : 'Took part', snack: ['Ate all', 'Ate all', 'Ate half', 'Ate all', 'Ate a little'][i % 5], ...(i % 6 !== 5 ? { water: i % 3 ? '2 glasses' : '1 glass' } : {}) }; });
    return o;
  });
  const [act, setAct] = useState('colour');
  const [pick, setPick] = useState(() => new Set(present));
  const [val, setVal] = useState('Finished');
  const [note, setNote] = useState('');
  const [send, setSend] = useState(false);
  const [plan, setPlan] = useState(false);
  const A = ACTS.find((a) => a.id === act);
  const done = (id) => present.filter((k) => log[k] && log[k][id]).length;
  const [per, setPer] = useState(PERIODS.last7);
  if (own) return <NotForRole title="Daily Activities is for pre-primary classes" body="The daily diary is kept by Nursery to UKG class teachers. Your part of Events & Calendar is the School Calendar and your PTM slots." />;
  // School days in the chosen dates, newest first, for the diary history
  const histDays = [];
  for (let d = new Date(per.to.slice(0, 4), Number(per.to.slice(5, 7)) - 1, Number(per.to.slice(8))); histDays.length < 400 && ds(d.getFullYear(), d.getMonth(), d.getDate()) >= per.from; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)) {
    const sd = schoolDay(d.getFullYear(), d.getMonth(), d.getDate());
    if (sd.kind === 'school') histDays.push(d);
  }
  const pctOf = (i) => Math.max(80, 98 - ((i * 7 + histDays.length) % 12));
  return (
    <div>
      <ModuleHead sub="The pre-primary daily diary: meals, nap, water and activities for each child. Parents get it on WhatsApp in the afternoon."
        actions={canEdit && <>
          <Button variant="secondary" icon={I.CalendarPlus} className="hidden @md:inline-flex" onClick={() => setPlan(true)}>Assign activities</Button>
          <Button variant="primary" icon={I.Send} onClick={() => setSend(true)}>Send today’s diary</Button>
        </>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <div className="flex flex-col @lg:flex-row gap-2.5 @lg:items-center">
          <Chips className="flex-1 min-w-0" value={cls} onChange={setCls} options={PRE.map((p) => ({ value: p.id, label: p.id, count: p.n }))} />
        </div>
        <p className="text-[13.5px] text-ink3 -mt-2">{cls} · class teacher {PRE.find((p) => p.id === cls).teacher} · Fri, 9 Oct · <b className="font-semibold text-ink2">{present.length} present</b>, 1 absent (Ayaan Khan)</p>
        <Split side={340}>
          <Card className="overflow-hidden min-w-0">
            <CardHead title="Today’s diary" sub="Tap a column to log it for the whole class" icon={I.NotebookPen} />
            <div className="overflow-x-auto scroll-thin border-t border-line">
              <table className="text-[12.5px] min-w-full">
                <thead>
                  <tr className="border-b border-line text-ink3">
                    <th className="sticky left-0 z-10 bg-surface text-left font-semibold px-4 py-2 min-w-[150px]">Child</th>
                    {ACTS.map((a) => (
                      <th key={a.id} className="px-1.5 py-2 font-semibold min-w-[96px]">
                        <button onClick={() => { setAct(a.id); setVal(a.opts[0]); }} className={cx('w-full rounded-lg px-1.5 py-1 text-left transition', act === a.id ? 'bg-brand/10 text-brand' : 'hover:bg-sunken')}>
                          <span className="flex items-center gap-1 whitespace-nowrap"><Icon name={a.icon} size={13} />{a.label.split(':')[0]}</span>
                          <span className="block text-[11px] font-medium opacity-80 tnum">{a.time} · {done(a.id)}/{present.length}</span>
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {KIDS.map((k) => (
                    <tr key={k} className={cx('border-b border-line/60 last:border-0', absent.has(k) && 'opacity-50')}>
                      <td className="sticky left-0 z-10 bg-surface px-4 py-2 font-medium whitespace-nowrap">{k}{absent.has(k) && <span className="text-bad text-[11.5px] font-semibold"> · absent</span>}</td>
                      {ACTS.map((a) => {
                        const v = log[k] && log[k][a.id];
                        return <td key={a.id} className="px-1.5 py-1.5">{v ? <span className={cx('inline-block rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold whitespace-nowrap', /not|Did not|Few|little|Stayed|Rested|Watched/i.test(v) ? 'bg-warn/12 text-warn' : 'bg-ok/12 text-ok')}>{v}</span> : <span className="text-ink3/60">—</span>}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Col>
            <Card className="@xl:sticky @xl:top-0">
              <CardHead title={`Log: ${A.label}`} sub={`${A.time} · tick the children, then save once`} icon={I.CheckCheck} />
              <div className="px-5 pb-5 flex flex-col gap-3.5">
                <div className="flex flex-wrap gap-1.5">{A.opts.map((o) => <button key={o} onClick={() => setVal(o)} aria-pressed={val === o} className={cx('h-8 px-3 rounded-full text-[13px] font-semibold transition', val === o ? 'bg-ink text-bg' : 'bg-sunken text-ink2 hover:bg-line')}>{o}</button>)}</div>
                <div>
                  <div className="flex items-center justify-between mb-1.5"><p className="text-[13px] font-semibold text-ink2">Children · {pick.size} ticked</p><button onClick={() => setPick(pick.size === present.length ? new Set() : new Set(present))} className="text-[12.5px] font-semibold text-brand">{pick.size === present.length ? 'Untick all' : 'Tick all present'}</button></div>
                  <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto scroll-thin">
                    {present.map((k) => <button key={k} onClick={() => setPick((x) => { const n = new Set(x); n.has(k) ? n.delete(k) : n.add(k); return n; })} aria-pressed={pick.has(k)} className={cx('h-8 px-2.5 rounded-lg text-[12.5px] font-medium border transition', pick.has(k) ? 'border-brand bg-brand/8 text-brand' : 'border-line text-ink3')}>{k.split(' ')[0]}</button>)}
                  </div>
                </div>
                <Field label="Note" id="da-note" hint="Optional, for the ticked children"><Input id="da-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: had extra chapati" /></Field>
                {canEdit && <Button variant="primary" icon={I.Check} disabled={!pick.size} onClick={() => { const prev = log; setLog((x) => { const n = { ...x }; pick.forEach((k) => { n[k] = { ...(n[k] || {}), [act]: val }; }); return n; }); toast({ title: `${A.label} logged for ${pick.size} children`, body: `${val}${note ? ` · ${note}` : ''}`, undo: () => setLog(prev) }); setNote(''); }}>Save for {pick.size} children</Button>}
              </div>
            </Card>
            <Card>
              <CardHead title="Diaries sent" sub={`${cls} · ${per.label} · ${fmtRange(per)}`} icon={I.History} />
              <div className="px-5 pb-3"><DatePeriod id="da-per" size="sm" value={per} onChange={setPer} className="w-full" /></div>
              {histDays.length ? (
                <ul className="px-2 pb-2 max-h-72 overflow-y-auto scroll-thin">
                  {histDays.slice(0, 40).map((d, i) => {
                    const iso = ds(d.getFullYear(), d.getMonth(), d.getDate());
                    const isToday = iso === TODAY;
                    return <li key={iso}><Row icon={isToday ? 'NotebookPen' : 'Send'} iconTone={isToday ? 'brand' : 'ok'} title={nice(iso) + (d.getFullYear() !== 2026 ? ` ${d.getFullYear()}` : '')} sub={isToday ? 'Being filled in now · usually sent at 3:30 PM' : `Sent ${3 + (i % 2)}:${pad((i * 7) % 60)} PM · ${PRE.find((p) => p.id === cls).n - (i % 3)} parents · ${pctOf(i)}% of activities logged`} /></li>;
                  })}
                  {histDays.length > 40 && <li className="px-3 py-2 text-[12.5px] text-ink3">And {histDays.length - 40} earlier school days. Pick shorter dates to see them.</li>}
                </ul>
              ) : <Empty icon={I.CalendarX2} title="No school days in these dates" body="Holidays, Sundays and second Saturdays have no diary." />}
            </Card>
            <Card>
              <CardHead title="Diary filled in" sub={`Days with the full diary · ${fmtRange(per)}`} icon={I.ChartColumn} />
              <div className="px-5 pb-5"><HBars rows={PRE.map((p, i) => ({ k: p.id.replace('Nursery', 'Nur'), v: Math.min(100, [97, 90, 92, 88, 96][i] - (histDays.length > 30 ? 2 : 0)) }))} lowBelow={90} labelWidth={64} /></div>
            </Card>
          </Col>
        </Split>
      </div>
      <ConfirmSheet open={send} onClose={() => setSend(false)} title={`Send today’s diary to ${present.length} parents?`} sub={`${cls} · each parent gets only their own child’s day, by WhatsApp.`}
        confirmLabel={`Send to ${present.length} parents`} onConfirm={() => toast({ title: `Diary sent to ${present.length} parents`, body: `WhatsApp · ${present.length} credits. Activities logged after this go tomorrow.` })}>
        <div className="rounded-2xl rounded-tl-md bg-sunken/70 p-3.5 text-[14px] leading-relaxed">Anaya’s day, Fri 9 Oct: Rhymes, took part. Snack, ate all. Water, 2 glasses. {log['Anaya Sharma']?.colour ? `Colouring, ${log['Anaya Sharma'].colour.toLowerCase()}. ` : ''}– Sunitha Mohan, UKG A</div>
        <p className="text-[12.5px] text-ink3 mt-2">Lunch, nap and play are not logged yet. Usually sent at 3:30 PM.</p>
      </ConfirmSheet>
      <FormSheet open={plan} onClose={() => setPlan(false)} title="Assign activities" sub="For a class, for a day or the whole week." submitLabel="Assign"
        onSubmit={() => toast({ title: 'Activities assigned', body: `${cls} · Mon 12 to Fri 16 Oct · Clay modelling at 11:15 AM` })}>
        <Field label="Class" required id="da-cls"><Select id="da-cls" value={cls} onChange={setCls} options={PRE.map((p) => p.id)} /></Field>
        <Field label="Activity type" required id="da-type"><Select id="da-type" value="Learning activity" onChange={() => {}} options={['Learning activity', 'Meal', 'Nap', 'Play', 'Water']} /></Field>
        <Field label="Activity" required id="da-act"><Input id="da-act" defaultValue="Clay modelling" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Days" id="da-days"><Select id="da-days" value="week" onChange={() => {}} options={[{ value: 'week', label: 'Mon 12 – Fri 16 Oct' }, { value: 'day', label: 'Mon 12 Oct only' }]} /></Field>
          <Field label="Time" id="da-time"><Input id="da-time" defaultValue="11:15 AM" className="tnum" /></Field>
        </div>
      </FormSheet>
    </div>
  );
}

/* ======================= Events Settings ======================= */
function EventsSettings() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const [types, setTypes] = useState(['Annual day', 'Sports day', 'Cultural', 'Competition', 'Trip', 'Safety drill', 'Meeting', 'Alumni']);
  const [consent, setConsent] = useState('out');
  const [credits, setCredits] = useState(true);
  const [feed, setFeed] = useState(true);
  return (
    <div>
      <ModuleHead sub="Event types, weekends, houses, calendar sharing, PTM defaults, activity credits and photo consent." />
      <div className="grid grid-cols-1 @xl:grid-cols-2 gap-5 @lg:gap-6 items-start">
        <Col>
          <SettingsCard title="Weekends" sub="Shown on the calendar; attendance is off" icon={I.CalendarDays} rows={[
            { title: 'Sunday', on: true }, { title: 'Second Saturday', sub: 'For example 10 October', on: true }, { title: 'Fourth Saturday', on: false },
          ]} />
          <Card>
            <CardHead title="Event types" sub="Offered when creating an event" icon={I.Tag} />
            <div className="px-5 pb-5 flex flex-wrap gap-2">
              {types.map((t) => <span key={t} className="h-9 pl-3 pr-1.5 rounded-xl border border-line text-[13.5px] font-semibold flex items-center gap-1">{t}{canEdit && <button onClick={() => { setTypes((x) => x.filter((y) => y !== t)); toast({ title: `${t} removed`, undo: () => setTypes((x) => [...x, t]) }); }} aria-label={`Remove ${t}`} className="w-6 h-6 grid place-items-center rounded-md text-ink3 hover:bg-sunken"><I.X size={13} /></button>}</span>)}
              {canEdit && <Button size="sm" variant="soft" icon={I.Plus} className="!h-9" onClick={() => { setTypes((x) => [...x, 'Exhibition']); toast({ title: 'Event type added: Exhibition' }); }}>Add type</Button>}
            </div>
          </Card>
          <Card>
            <CardHead title="Houses" sub="Names and colours" icon={I.Flag} />
            <div className="divide-y divide-line/70 border-t border-line/70">
              {HOUSE_DATA.map((h) => (
                <SettingRow key={h.name} title={h.name} sub={`${h.students} students · Captain ${h.captain}`}>
                  <span className="flex items-center gap-2"><span className={cx('w-6 h-6 rounded-full', TONE_BG[h.tone])} />{canEdit && <Button size="sm" variant="ghost" onClick={() => toast({ title: `Change ${h.name}`, body: 'Name, colour and captain. Logged.', tone: 'info' })}>Change</Button>}</span>
                </SettingRow>
              ))}
            </div>
          </Card>
          <SettingsCard title="PTM defaults" icon={I.Users} rows={[
            { title: 'Slot length', value: '10 minutes' },
            { title: 'Reminder to parents', sub: 'Automatic message', value: 'Day before, 6:00 PM' },
            { title: 'Parents pick a slot on Parent Link', sub: 'The office can still book for them', on: true },
          ]} />
        </Col>
        <Col>
          <Card>
            <CardHead title="Calendar sharing" sub="A read-only feed for Google or Outlook" icon={I.Share2}
              action={<Switch id="es-feed" on={feed} onChange={(v) => { if (!canEdit) return; setFeed(v); toast({ title: `Calendar feed ${v ? 'on' : 'off'}`, body: v ? 'Staff can add it to Google or Outlook.' : 'Existing subscriptions stop updating.' }); }} label="Calendar feed" />} />
            {feed && (
              <div className="px-5 pb-5 flex flex-col gap-2">
                {[['Whole school', 'cal.sunriseps.in/f/sps-2026-27.ics'], ['Staff only', 'cal.sunriseps.in/f/sps-staff-9Qk.ics']].map(([k, u]) => (
                  <div key={k} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2">
                    <span className="min-w-0 flex-1"><span className="block text-[12.5px] text-ink3 font-semibold">{k}</span><span className="block font-mono text-[12.5px] truncate">{u}</span></span>
                    <Button size="sm" variant="ghost" icon={I.Copy} onClick={() => toast({ title: 'Link copied', body: 'Paste it in Google Calendar, Add by URL.' })}>Copy</Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card>
            <CardHead title="Activity credits" sub="Points a student earns for taking part or winning" icon={I.Star}
              action={<Switch id="es-cr" on={credits} onChange={(v) => { if (!canEdit) return; setCredits(v); toast({ title: `Activity credits ${v ? 'on' : 'off'}`, body: 'Totals stay on profiles.' }); }} label="Activity credits" />} />
            {credits && (
              <div className="overflow-x-auto scroll-thin border-t border-line">
                <table className="w-full text-[13.5px] min-w-[360px]">
                  <thead><tr className="text-[12px] text-ink3 text-left border-b border-line"><th className="px-5 py-2 font-semibold">Level</th><th className="px-3 py-2 font-semibold text-right">Taking part</th><th className="px-5 py-2 font-semibold text-right">Winning</th></tr></thead>
                  <tbody>{[['School', 5, 10], ['District', 10, 20], ['State', 15, 40], ['National', 20, 60]].map(([l, a, b]) => <tr key={l} className="border-b border-line/70 last:border-0"><td className="px-5 py-2 font-semibold">{l}</td><td className="px-3 py-2 text-right tnum">{a}</td><td className="px-5 py-2 text-right tnum">{b}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </Card>
          <Card>
            <CardHead title="Gallery photo consent" sub="For students whose guardians have not given photo consent" icon={I.ShieldCheck} />
            <div className="px-5 pb-5 flex flex-col gap-2">
              <Segmented value={consent} onChange={(v) => { if (!canEdit) return; setConsent(v); toast({ title: v === 'out' ? 'Photos with them are left out' : 'They are blurred in photos', body: 'Applies to albums already published too.' }); }} options={[{ value: 'out', label: 'Leave the photo out' }, { value: 'blur', label: 'Blur them' }]} className="w-full" />
              <p className="text-[12.5px] text-ink3">Consent texts are in Settings, Data Backup & Security.</p>
            </div>
          </Card>
          <Card>
            <CardHead title="Daily Activities" sub="Activity types for pre-primary" icon={I.Baby} />
            <div className="px-5 pb-5 flex flex-wrap gap-2">{['Meal', 'Nap', 'Play', 'Water', 'Learning activity', 'Toilet training'].map((t) => <Pill key={t} tone="neutral" className="!h-8 !text-[13px] !px-3">{t}</Pill>)}</div>
          </Card>
          <SettingsCard title="Lists" icon={I.ListChecks} rows={[
            { title: 'Achievement levels', value: 'School, District, State, National' },
            { title: 'Clubs', value: '6 clubs' },
            { title: 'Sports teams', value: '4 teams' },
          ]} />
        </Col>
      </div>
    </div>
  );
}

export const EVENTS_PAGES = {
  calendar: SchoolCalendar,
  events: Events,
  ptm: PTMPage,
  cocurricular: Cocurricular,
  gallery: Gallery,
  daily: DailyActivities,
  settings: EventsSettings,
};
