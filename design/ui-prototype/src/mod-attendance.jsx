// Attendance Management: Student Leave, Staff Attendance, Attendance Reports, Devices & QR, Attendance Settings.
// Take Attendance and Attendance Register live in attendance.jsx. Sample data only.
import React, { useMemo, useState } from 'react';
import * as I from './icons.js';
import { STUDENTS, CLASS_7B, FEATURED, ATT_BY_CLASS } from './data.js';
import { STAFF, DEPARTMENTS } from './sample.js';
import { cx, Card, CardHead, Button, Pill, Avatar, Checkbox, Input, Field, Segmented, Switch, Sheet, Empty, useToast } from './ui.jsx';
import { useNav, useRole } from './shell.jsx';
import { ModuleHead, useCanEdit, usePage, PageCtx, Stats, SearchBox, Toolbar, Select, Textarea, Chips, DataList, BulkBar, Row, SettingRow, ToggleRow, SettingsCard, Banner, Suggestion, Progress, HBars, Bars, Legend, DL, Timeline, MoreMenu, FormSheet, ConfirmSheet, FileRow, Split, Col, ExportButton,
  DatePeriod, PERIODS, fmtRange, CalendarMonth, markCell, monthTotals, sampleMark, schoolDay, MARK_TONE, MONTH_NAMES } from './kit.jsx';

const AttHead = (p) => <ModuleHead title="Attendance" {...p} />;
// HR's "Own" here is the whole of staff attendance, and Office Staff's is recording leave for every student,
// so the "Only yours" mark would be wrong on those pages. This keeps the page's tabs and only drops that mark.
function WholePart({ children }) {
  const pg = usePage();
  return <PageCtx.Provider value={{ ...pg, access: pg.access === 'own' ? 'full' : pg.access }}>{children}</PageCtx.Provider>;
}
const isoOf = (v) => v.split('-').reverse().join('-'); // DD-MM-YYYY -> YYYY-MM-DD
const isoD = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const OCT_ALL = { key: 'm-2026-9', label: 'October 2026', from: '2026-10-01', to: '2026-10-31' };
// School days in a period, up to today (Fri 9 Oct 2026)
function schoolDaysIn(v) {
  const out = []; const end = v.to < '2026-10-09' ? v.to : '2026-10-09';
  const [y, m, d] = v.from.split('-').map(Number);
  for (let dt = new Date(y, m - 1, d); isoD(dt.getFullYear(), dt.getMonth(), dt.getDate()) <= end; dt.setDate(dt.getDate() + 1)) {
    if (schoolDay(dt.getFullYear(), dt.getMonth(), dt.getDate()).kind === 'school') out.push(isoD(dt.getFullYear(), dt.getMonth(), dt.getDate()));
  }
  return out;
}
const okDate = (v) => /^\d{2}-\d{2}-\d{4}$/.test((v || '').trim());
const toDate = (v) => { const [d, m, y] = v.split('-').map(Number); return new Date(y, m - 1, d); };
// Not school days in Oct 2026: Sundays, Gandhi Jayanti (2 Oct), Dussehra holidays (19–25 Oct)
const isHoliday = (dt) => dt.getDay() === 0 || (dt.getMonth() === 9 && (dt.getDate() === 2 || (dt.getDate() >= 19 && dt.getDate() <= 25)));
const fmt = (dt) => dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
function countDays(from, to) {
  if (!okDate(from) || !okDate(to)) return null;
  const a = toDate(from); const b = toDate(to);
  if (b < a) return { bad: true };
  let n = 0; const skipped = [];
  for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) { if (isHoliday(d)) skipped.push(fmt(d)); else n++; }
  return { n, skipped };
}
function DateField({ id, label, value, onChange, error, hint, required }) {
  return (
    <Field label={label} id={id} error={error} hint={hint} required={required}>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder="DD-MM-YYYY" inputMode="numeric" error={error} className="tnum" />
    </Field>
  );
}

/* =====================================================================================
   Student Leave
   ===================================================================================== */

const KRISHNA = CLASS_7B.find((s) => s.roll === 23);
const LEAVES0 = [
  { id: 'L1', name: FEATURED.name, cls: '7 B', type: 'Family event', from: '12-10-2026', to: '12-10-2026', when: 'Mon 12 Oct', days: 1, reason: 'Cousin’s wedding in Vijayawada', doc: null, st: 'Waiting', rec: 'Naveen Kumar', via: 'Mother Priya Sharma called the office', at: 'Today, 8:40 AM', exam: 'Mon 12 Oct is the English half-yearly paper for Class 7.', mon: 'Oct' },
  { id: 'L2', name: 'Harini Reddy', cls: '7 B', type: 'Medical', from: '13-10-2026', to: '14-10-2026', when: '13–14 Oct', days: 2, reason: 'Follow-up after tonsil treatment at Rainbow Hospital', doc: 'Doctor-note-Harini.jpg · 1.2 MB', st: 'Waiting', rec: 'Ravi Teja', via: 'Note in the school diary', at: 'Today, 8:55 AM', exam: 'Wed 14 Oct is the Maths half-yearly paper for Class 7.', mon: 'Oct' },
  { id: 'L3', name: 'Pooja Chowdary', cls: '3 A', type: 'Medical', from: '12-10-2026', to: '13-10-2026', when: '12–13 Oct', days: 2, reason: 'Viral fever. The doctor advised two days of rest.', doc: 'Prescription.pdf · 220 KB', st: 'Waiting', rec: 'Naveen Kumar', via: 'Father came to the office', at: 'Today, 10:05 AM', mon: 'Oct' },
  { id: 'L4', name: 'Sneha Joshi', cls: '2 B', type: 'Medical', from: '12-10-2026', to: '12-10-2026', when: 'Mon 12 Oct, half day', days: 0.5, half: true, reason: 'Dentist appointment at 11:30 AM. Mother picks her up at 11:00.', doc: null, st: 'Waiting', rec: 'Naveen Kumar', via: 'Mother called the office', at: 'Today, 9:20 AM', mon: 'Oct' },
  { id: 'L5', name: 'Ananya Joshi', cls: '5 A', type: 'Holiday', from: '16-10-2026', to: '17-10-2026', when: '16–17 Oct', days: 2, reason: 'Family trip to Tirupati', doc: null, st: 'Waiting', rec: 'Naveen Kumar', via: 'Father wrote on WhatsApp', at: 'Yesterday, 4:10 PM', mon: 'Oct' },
  { id: 'L6', name: KRISHNA.name, cls: '7 B', type: 'Medical', from: '08-10-2026', to: '10-10-2026', when: '8–10 Oct', days: 3, reason: 'Fever', doc: null, st: 'Approved', rec: 'Ravi Teja', via: 'Mother wrote on WhatsApp', at: '8 Oct, 7:45 AM', dec: 'Ravi Teja', decAt: '8 Oct, 8:02 AM', mon: 'Oct' },
  { id: 'L7', name: 'Rohan Iyer', cls: '9 C', type: 'Emergency', from: '09-10-2026', to: '09-10-2026', when: 'Fri 9 Oct', days: 1, reason: 'Grandfather admitted to hospital in Warangal', doc: null, st: 'Approved', rec: 'Naveen Kumar', via: 'Father called the office', at: 'Today, 7:55 AM', dec: 'Deepak Verma', decAt: 'Today, 9:20 AM', mon: 'Oct' },
  { id: 'L8', name: 'Sneha Varma', cls: 'UKG B', type: 'Medical', from: '05-10-2026', to: '14-10-2026', when: '5–14 Oct', days: 9, reason: 'Chickenpox. Back after the doctor clears her.', doc: 'Medical-certificate.pdf · 340 KB', st: 'Approved', rec: 'Naveen Kumar', via: 'Mother came to the office', at: '5 Oct, 8:30 AM', dec: 'Lakshmi Rao', decAt: '5 Oct, 11:10 AM', note: 'More than 3 days, so the Principal decided.', mon: 'Oct' },
  { id: 'L9', name: 'Dhruv Sharma', cls: 'LKG B', type: 'Medical', from: '06-10-2026', to: '09-10-2026', when: '6–9 Oct', days: 4, reason: 'Viral fever', doc: 'Doctor-note.jpg · 860 KB', st: 'Approved', rec: 'Sujatha Rao', via: 'Note in the school diary', at: '6 Oct, 8:40 AM', dec: 'Lakshmi Rao', decAt: '6 Oct, 12:05 PM', mon: 'Oct' },
  { id: 'L10', name: 'Tanvi Menon', cls: '6 A', type: 'Medical', from: '07-10-2026', to: '07-10-2026', when: 'Wed 7 Oct', days: 1, reason: 'Stomach upset', doc: null, st: 'Approved', rec: 'Lalitha Devi', via: 'Mother wrote on WhatsApp', at: '7 Oct, 7:30 AM', dec: 'Lalitha Devi', decAt: '7 Oct, 7:52 AM', mon: 'Oct' },
  { id: 'L11', name: 'Harsha Verma', cls: '8 B', type: 'Holiday', from: '13-10-2026', to: '16-10-2026', when: '13–16 Oct', days: 4, reason: 'Family trip to Goa', doc: null, st: 'Rejected', rec: 'Naveen Kumar', via: 'Father came to the office', at: '6 Oct, 3:15 PM', dec: 'Lakshmi Rao', decAt: '7 Oct, 10:30 AM', decReason: 'Falls on half-yearly exam days. Please plan the trip after 27 Oct.', mon: 'Oct' },
  { id: 'L12', name: 'Bhavya Das', cls: '5 B', type: 'Medical', from: '06-10-2026', to: '06-10-2026', when: 'Tue 6 Oct', days: 1, reason: 'Fever', doc: null, st: 'Cancelled', rec: 'Naveen Kumar', via: 'Mother called the office', at: '5 Oct, 6:10 PM', dec: 'Naveen Kumar', decAt: '6 Oct, 8:35 AM', decReason: 'Parent called back: the child is well and came to school.', mon: 'Oct' },
  { id: 'L13', name: 'Manish Varma', cls: '10 A', type: 'Emergency', from: '01-10-2026', to: '01-10-2026', when: 'Thu 1 Oct', days: 1, reason: 'Family emergency', doc: null, st: 'Approved', rec: 'Anitha Kumari', via: 'Father called the class teacher', at: '1 Oct, 7:20 AM', dec: 'Anitha Kumari', decAt: '1 Oct, 7:24 AM', mon: 'Oct' },
  { id: 'L14', name: 'Keerthana Naidu', cls: '7 B', type: 'Medical', from: '22-09-2026', to: '24-09-2026', when: '22–24 Sep', days: 3, reason: 'Sprained ankle at football practice', doc: 'X-ray-report.pdf · 1.8 MB', st: 'Approved', rec: 'Ravi Teja', via: 'Mother wrote on WhatsApp', at: '22 Sep, 7:10 AM', dec: 'Ravi Teja', decAt: '22 Sep, 7:40 AM', mon: 'Sep' },
];
const CT_OF = { '7 B': 'Ravi Teja', '3 A': 'Sravanthi Rao', '2 B': 'Usha Rani', '5 A': 'Gayathri Menon', '9 C': 'Deepak Verma', 'UKG B': 'Vani Prasad', 'LKG B': 'Sujatha Rao', '6 A': 'Lalitha Devi', '8 B': 'Prasad Varma', '5 B': 'Sunil Kumar', '10 A': 'Anitha Kumari' };
const ST_TONE = { Waiting: 'warn', Approved: 'ok', Rejected: 'bad', Cancelled: 'neutral' };
const TYPES = ['Medical', 'Emergency', 'Holiday', 'Family event'];
const QUOTA = { Medical: [6, 'term'], Emergency: [3, 'term'], Holiday: [5, 'year'], 'Family event': [3, 'year'] };
const clsOf = (s) => (['NUR', 'LKG', 'UKG'].includes(s.clsId) ? `${s.cls} ${s.sec}` : `${s.clsId} ${s.sec}`);
const studentId = (name) => (name === FEATURED.name ? FEATURED.id : STUDENTS.find((s) => s.name === name)?.id);

function LeavePage(p) {
  return <WholePart><LeaveInner {...p} /></WholePart>;
}
function LeaveInner({ access }) {
  const toast = useToast();
  const { go } = useNav();
  const { role } = useRole();
  const canEdit = useCanEdit();
  const ct = role.id === 'classteacher';
  const office = role.id === 'officestaff';
  const full = access === 'full';
  const [rows, setRows] = useState(() => (ct ? LEAVES0.filter((l) => l.cls === '7 B') : LEAVES0));
  const [st, setSt] = useState('Waiting');
  const [q, setQ] = useState('');
  const [cls, setCls] = useState('all');
  const [type, setType] = useState('all');
  const [per, setPer] = useState(OCT_ALL);
  const [sel, setSel] = useState(new Set());
  const [open, setOpen] = useState(null);
  const [rec, setRec] = useState(false);
  const [reject, setReject] = useState(null);
  const [cancel, setCancel] = useState(null);
  const [bulk, setBulk] = useState(false);
  const mayDecide = (l) => canEdit && !office && l.st === 'Waiting' && (full || (ct && l.cls === '7 B' && l.days <= 3));
  const counts = rows.reduce((a, l) => ((a[l.st] = (a[l.st] || 0) + 1), a), {});
  const list = rows.filter((l) => (st === 'all' || l.st === st) && (cls === 'all' || l.cls === cls) && (type === 'all' || l.type === type) && (l.st === 'Waiting' || (isoOf(l.from) <= per.to && isoOf(l.to) >= per.from))
    && (!q || l.name.toLowerCase().includes(q.toLowerCase()) || l.cls.toLowerCase().includes(q.toLowerCase())));
  const decide = (ids, status, reason) => {
    const before = rows;
    setRows((x) => x.map((l) => (ids.includes(l.id) ? { ...l, st: status, dec: role.person.name, decAt: 'Today, 10:44 AM', decReason: reason } : l)));
    setSel(new Set()); setOpen(null);
    const one = before.find((l) => l.id === ids[0]);
    toast({
      title: ids.length > 1 ? `${status} ${ids.length} leave requests` : `${status}: ${one.name}, ${one.when}`,
      body: status === 'Approved' ? 'Marked Leave in Take Attendance in advance. No absence message goes for those days. Parent told on WhatsApp.' : status === 'Rejected' ? 'Parent told on WhatsApp with your reason.' : 'Days go back to normal in Take Attendance.',
      undo: () => setRows(before),
    });
  };
  const waiting = rows.filter((l) => l.st === 'Waiting');
  const inPer = rows.filter((l) => l.st === 'Approved' && isoOf(l.from) <= per.to && isoOf(l.to) >= per.from);
  const selectable = list.filter((l) => mayDecide(l));
  const sub = ct ? 'Class 7 B only · you decide up to 3 days; longer leave goes to the Principal'
    : office ? 'You record leave for parents, who have no login. Class teachers and the Principal decide.'
      : 'Leave requests for students, recorded by staff when a parent calls, writes or messages';
  return (
    <div>
      <AttHead sub={sub} actions={<Button variant="primary" icon={I.Plus} onClick={() => setRec(true)}>Record leave</Button>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Stats items={[
          { label: 'Waiting', value: waiting.length, sub: ct ? 'For you to decide' : 'Oldest from yesterday', tone: waiting.length ? 'warn' : 'ok', icon: 'Hourglass', onClick: () => setSt('Waiting') },
          { label: 'On leave today', value: ct ? 1 : 11, sub: ct ? KRISHNA.name : 'Students, all approved', icon: 'CalendarCheck2' },
          { label: 'Approved', value: inPer.length, sub: `${per.label} · ${inPer.reduce((a, l) => a + l.days, 0)} school days`, icon: 'CircleCheck', onClick: () => setSt('Approved') },
          { label: 'Absence messages held', value: ct ? 1 : 11, sub: 'Not sent for approved leave', icon: 'BellOff' },
        ]} />

        <Card className="overflow-hidden">
          <div className="px-3 pt-3"><Chips value={st} onChange={(v) => { setSt(v); setSel(new Set()); }} options={[{ value: 'Waiting', label: 'Waiting', count: counts.Waiting || 0 }, { value: 'Approved', label: 'Approved', count: counts.Approved || 0 }, { value: 'Rejected', label: 'Rejected', count: counts.Rejected || 0 }, { value: 'Cancelled', label: 'Cancelled', count: counts.Cancelled || 0 }, { value: 'all', label: 'All', count: rows.length }]} /></div>
          <Toolbar className="border-b">
            <SearchBox id="lv-search" value={q} onChange={setQ} placeholder="Student or class" />
            <div className={cx('grid gap-2', ct ? 'grid-cols-1' : 'grid-cols-2', '@md:flex')}>
              {!ct && <Select id="lv-cls" value={cls} onChange={setCls} className="@md:w-36" options={[{ value: 'all', label: 'All classes' }, ...[...new Set(LEAVES0.map((l) => l.cls))].sort().map((c) => ({ value: c, label: c }))]} />}
              <Select id="lv-type" value={type} onChange={setType} className="@md:w-36" options={[{ value: 'all', label: 'All types' }, ...TYPES]} />
            </div>
            <div className="flex gap-2 min-w-0">
              <DatePeriod id="lv-per" future value={per} onChange={setPer} className="w-full @md:w-auto" />
              <ExportButton what="student leave" />
            </div>
          </Toolbar>
          <BulkBar count={sel.size} onClear={() => setSel(new Set())}>
            <Button size="sm" variant="secondary" icon={I.Check} onClick={() => setBulk(true)}>Approve</Button>
          </BulkBar>
          <DataList rows={list} rowKey={(l) => l.id} onRow={(l) => setOpen(l)} minWidth={820}
            select={selectable.length && st === 'Waiting' ? [sel, (fn) => setSel((x) => { const n = typeof fn === 'function' ? fn(x) : fn; return new Set([...n].filter((id) => selectable.some((l) => l.id === id))); })] : null}
            columns={[
              { key: 'name', label: 'Student', render: (l) => <div className="flex items-center gap-3"><Avatar name={l.name} size={34} /><div><p className="font-semibold leading-tight">{l.name}</p><p className="text-[12.5px] text-ink3">{l.cls}</p></div></div> },
              { key: 'type', label: 'Type', render: (l) => <span>{l.type}</span> },
              { key: 'when', label: 'Dates', render: (l) => <div><p className="tnum whitespace-nowrap">{l.when}</p><p className="text-[12px] text-ink3">{l.days === 0.5 ? 'Half day' : `${l.days} ${l.days === 1 ? 'day' : 'days'}`}</p></div> },
              { key: 'reason', label: 'Reason', render: (l) => <p className="text-ink2 max-w-[220px] truncate">{l.doc && <I.Paperclip size={13} className="inline mr-1 text-ink3" />}{l.reason}</p> },
              { key: 'rec', label: 'Recorded by', render: (l) => <p className="text-[13px] text-ink2 whitespace-nowrap">{l.rec}</p> },
              { key: 'st', label: 'Status', render: (l) => <div><Pill tone={ST_TONE[l.st]}>{l.st}</Pill>{l.dec && l.st !== 'Waiting' && <p className="text-[11.5px] text-ink3 mt-0.5 whitespace-nowrap">{l.dec}</p>}</div> },
            ]}
            mobile={(l) => ({ avatar: l.name, title: `${l.name} · ${l.cls}`, sub: `${l.type} · ${l.when}`, pills: [<Pill key="s" tone={ST_TONE[l.st]} className="!h-[22px] !text-[11.5px]">{l.st}</Pill>, l.exam && l.st === 'Waiting' ? <Pill key="e" tone="info" className="!h-[22px] !text-[11.5px]">Exam day</Pill> : null] })}
            empty={<Empty icon={I.CalendarCheck2} title={st === 'Waiting' ? 'No leave waiting' : 'No leave matches'} body={st === 'Waiting' ? 'When a parent asks for leave, record it here.' : `Nothing in ${fmtRange(per)}. Try other dates, a status or a class.`} action={<Button variant="secondary" icon={I.Plus} onClick={() => setRec(true)}>Record leave</Button>} />}
            footer={`Showing ${list.length} of ${rows.length} · ${per.label}: ${fmtRange(per)} · waiting requests always show`} />
        </Card>
        <LeaveCalendar rows={rows} ct={ct} />
        {!ct && <Banner tone="info" title="Who decides:">class teachers decide for their own section up to 3 days. Longer leave, and leave over the quota, goes to the Principal. Set in Settings, Forms & Approvals.</Banner>}
      </div>

      <LeaveDetail l={open} onClose={() => setOpen(null)} canDecide={open && mayDecide(open)} office={office} canEdit={canEdit}
        onApprove={() => decide([open.id], 'Approved')} onReject={() => setReject(open)} onCancel={() => setCancel(open)}
        onStudent={() => { const id = studentId(open.name); if (id) go('student', { id }); else toast({ title: `${open.name}'s profile`, body: `${open.cls}`, tone: 'info' }); }} />
      <ReasonSheet open={!!reject} title={reject ? `Reject leave for ${reject.name}?` : ''} sub="The parent gets your reason on WhatsApp." confirm="Reject and tell parent" chips={['Falls on an exam day', 'Too many days this term', 'Please send a doctor’s note']}
        onClose={() => setReject(null)} onDone={(r) => { decide([reject.id], 'Rejected', r); setReject(null); }} />
      <ReasonSheet open={!!cancel} title={cancel ? `Cancel leave for ${cancel.name}?` : ''} sub="The record stays, marked Cancelled, with your reason." confirm="Cancel leave" chips={['Parent called: child came to school', 'Recorded by mistake', 'Trip postponed']}
        onClose={() => setCancel(null)} onDone={(r) => { decide([cancel.id], 'Cancelled', r); setCancel(null); }} />
      <ConfirmSheet open={bulk} onClose={() => setBulk(false)} title={`Approve ${sel.size} leave requests?`} confirmLabel={`Approve ${sel.size} requests`} onConfirm={() => decide([...sel], 'Approved')}>
        <p className="text-[14px] text-ink2">Each day is marked Leave in Take Attendance, and {sel.size} parents get one WhatsApp message each.</p>
      </ConfirmSheet>
      <RecordLeave open={rec} onClose={() => setRec(false)} ct={ct} rows={rows}
        onSave={(l) => { setRows((x) => [l, ...x]); setSt('Waiting'); toast({ title: `Leave recorded for ${l.name}`, body: `Waiting for ${CT_OF[l.cls] || 'the class teacher'}${l.days > 3 ? ' and the Principal' : ''}.` }); }} />
    </div>
  );
}

// Students on leave each day. September and October come from the requests above; earlier months from the example helper.
function LeaveCalendar({ rows, ct }) {
  const on = (y, m, d) => {
    const iso = isoD(y, m, d);
    const hit = rows.filter((l) => (l.st === 'Approved' || l.st === 'Waiting') && isoOf(l.from) <= iso && isoOf(l.to) >= iso);
    let ap = hit.filter((l) => l.st === 'Approved').length; const wt = hit.length - ap;
    if (y * 12 + m < 2026 * 12 + 8 && schoolDay(y, m, d).kind === 'school') {
      const k = sampleMark(ct ? 'leave-7B' : 'leave-school', y, m, d).kind;
      ap += ct ? (k === 'leave' || k === 'absent' ? 1 : 0) : ({ leave: 4, absent: 3, late: 2 }[k] || 1);
    }
    return { ap, wt };
  };
  const cell = (y, m, d) => {
    const sd = schoolDay(y, m, d);
    if (sd.kind === 'off' || sd.kind === 'holiday') return { ...MARK_TONE[sd.kind], title: sd.title };
    if (new Date(y, m, d).getDay() === 0) return { tone: 'muted', title: 'Sunday' };
    const { ap, wt } = on(y, m, d);
    const t = [ap ? `${ap} on leave` : '', wt ? `${wt} waiting` : ''].filter(Boolean).join(' · ') || 'Nobody on leave';
    return { tone: ap ? 'info' : 'none', dot: wt ? 'warn' : undefined, title: t };
  };
  const footer = (y, m) => {
    let a = 0, w = 0; const n = new Date(y, m + 1, 0).getDate();
    for (let d = 1; d <= n; d++) { const k = schoolDay(y, m, d).kind; if (k === 'school' || (k === 'future' && new Date(y, m, d).getDay() !== 0)) { const x = on(y, m, d); a += x.ap; w += x.wt; } }
    return <p className="text-[13px] text-ink2"><b className="font-semibold text-ink tnum">{a}</b> student-days of approved leave in {MONTH_NAMES[m]} {y}{w ? <> · <b className="font-semibold text-ink tnum">{w}</b> waiting</> : ''}</p>;
  };
  return (
    <Card className="max-w-xl">
      <CardHead title={ct ? 'Leave calendar · 7 B' : 'Leave calendar'} sub="Blue days have students on approved leave. A dot means a request is waiting." icon={I.CalendarDays} />
      <div className="px-5 pb-5 flex flex-col gap-3">
        <CalendarMonth id="lv-cal" compact cell={cell} footer={footer} />
        <Legend items={[['bg-info/10', 'On leave, or a holiday'], ['bg-warn', 'Waiting']]} />
      </div>
    </Card>
  );
}

function LeaveDetail({ l, onClose, canDecide, office, canEdit, onApprove, onReject, onCancel, onStudent }) {
  const toast = useToast();
  if (!l) return null;
  const q = QUOTA[l.type];
  const left = l.type === 'Medical' ? 4 : l.type === 'Family event' ? 3 : q[0];
  return (
    <Sheet open onClose={onClose} title={`${l.name} · ${l.cls}`} sub={`${l.type} leave · ${l.when}`} wide
      footer={<>
        {canEdit && (l.st === 'Approved' || l.st === 'Waiting') && <Button variant="ghost" className="mr-auto" onClick={onCancel}>Cancel leave</Button>}
        {canDecide ? <><Button variant="secondary" onClick={onReject}>Reject</Button><Button variant="primary" icon={I.Check} onClick={onApprove}>Approve</Button></>
          : <Button variant="secondary" onClick={onClose}>Close</Button>}
      </>}>
      <div className="flex flex-col gap-4">
        {l.exam && l.st === 'Waiting' && <Banner tone="warn" icon={I.ClipboardCheck} title="Exam day.">{l.exam} Missing a paper needs the Principal’s approval for a re-test.</Banner>}
        {l.st === 'Waiting' && !canDecide && <Banner tone="info" title={`Waiting for ${l.days > 3 ? 'the Principal' : CT_OF[l.cls] || 'the class teacher'}.`}>{office ? 'You recorded it; someone else decides.' : 'It is past your limit of 3 days, so the Principal decides.'}</Banner>}
        <div className="rounded-xl border border-line pt-4 -mx-0">
          <DL rows={[
            ['Student', <button key="s" onClick={onStudent} className="font-semibold text-brand hover:underline text-left">{l.name}</button>],
            ['Class', l.cls], ['Leave type', l.type], ['Dates', `${l.from} to ${l.to}${l.half ? ' · half day' : ''}`],
            ['School days', l.days === 0.5 ? 'Half a day' : `${l.days}`], ['Balance', `${l.type}: ${left} of ${q[0]} days left this ${q[1]}`],
            ['Reason', l.reason], ['Recorded by', `${l.rec} · ${l.via}`],
          ]} />
        </div>
        {l.doc ? <ul><FileRow name={l.doc.split(' · ')[0]} meta={`${l.doc.split(' · ')[1]} · added ${l.at}`} onView={() => toast({ title: `Opening ${l.doc.split(' · ')[0]}`, tone: 'info' })} /></ul>
          : <p className="text-[13px] text-ink3">No document. A doctor’s note can be added any time.</p>}
        <div>
          <p className="eyebrow text-ink3 mb-2">History</p>
          <Timeline items={[
            ...(l.st !== 'Waiting' ? [{ icon: l.st === 'Approved' ? 'CircleCheck' : l.st === 'Rejected' ? 'CircleX' : 'Ban', tone: ST_TONE[l.st], what: `${l.st} by ${l.dec}${l.decReason ? `: ${l.decReason}` : ''}${l.note ? ` ${l.note}` : ''}`, when: l.decAt }] : []),
            { icon: 'Plus', what: `Recorded by ${l.rec}. ${l.via}.`, when: l.at },
          ]} />
        </div>
      </div>
    </Sheet>
  );
}

function ReasonSheet({ open, title, sub, confirm, chips, onClose, onDone }) {
  const [r, setR] = useState('');
  const [tried, setTried] = useState(false);
  const close = () => { onClose(); setR(''); setTried(false); };
  return (
    <Sheet open={open} onClose={close} title={title} sub={sub}
      footer={<><Button variant="ghost" onClick={close}>Keep it</Button><Button variant="danger" onClick={() => { setTried(true); if (!r.trim()) return; onDone(r.trim()); setR(''); setTried(false); }}>{confirm}</Button></>}>
      <div className="flex flex-wrap gap-2 mb-3">{chips.map((c) => <button key={c} onClick={() => setR(c)} className="h-8 px-3 rounded-full bg-sunken text-[13px] font-medium hover:bg-line">{c}</button>)}</div>
      <Field label="Reason" id="rs-why" required error={tried && !r.trim() ? 'Write a short reason' : ''}><Textarea id="rs-why" value={r} onChange={setR} rows={3} placeholder="Type a reason" /></Field>
    </Sheet>
  );
}

function RecordLeave({ open, onClose, ct, rows, onSave }) {
  const pool = ct ? CLASS_7B : STUDENTS;
  const empty = { stu: null, q: '', type: 'Medical', from: '12-10-2026', to: '12-10-2026', half: false, reason: '', doc: false };
  const [f, setF] = useState(empty);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const res = f.q.trim() ? pool.filter((s) => s.name.toLowerCase().includes(f.q.trim().toLowerCase()) || s.adm.toLowerCase().includes(f.q.trim().toLowerCase())).slice(0, 5) : [];
  const dc = countDays(f.from, f.to);
  const stuCls = f.stu ? clsOf(f.stu) : '';
  const overlap = f.stu && rows.find((l) => l.name === f.stu.name && l.cls === stuCls && (l.st === 'Approved' || l.st === 'Waiting') && okDate(f.from) && okDate(f.to) && toDate(f.from) <= toDate(l.to) && toDate(f.to) >= toDate(l.from));
  const err = {
    stu: !f.stu ? 'Search and pick the student' : '',
    from: !okDate(f.from) ? 'Use DD-MM-YYYY, for example 12-10-2026' : '',
    to: !okDate(f.to) ? 'Use DD-MM-YYYY' : dc?.bad ? 'The To date is before the From date' : overlap ? `${f.stu.first} already has leave from ${overlap.from} to ${overlap.to}` : '',
    reason: !f.reason.trim() ? 'Write the reason the parent gave' : '',
  };
  const valid = !Object.values(err).some(Boolean);
  const q = QUOTA[f.type];
  const days = f.half ? 0.5 : dc && !dc.bad ? dc.n : 0;
  const close = () => { onClose(); setF(empty); setTried(false); };
  const submit = (e) => {
    e.preventDefault(); setTried(true);
    if (!valid) return;
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      const a = toDate(f.from); const b = toDate(f.to);
      onSave({ id: 'L' + Date.now(), name: f.stu.name, cls: stuCls, type: f.type, from: f.from, to: f.to, when: f.from === f.to ? fmt(a) + (f.half ? ', half day' : '') : `${a.getDate()}–${b.getDate()} ${b.toLocaleDateString('en-GB', { month: 'short' })}`, days, half: f.half, reason: f.reason.trim(), doc: f.doc ? 'Doctor-note.jpg · 1.1 MB' : null, st: 'Waiting', rec: 'You', via: 'Recorded for the parent', at: 'Today, 10:44 AM', mon: 'Oct' });
      setF(empty); setTried(false); onClose();
    }, 700);
  };
  return (
    <Sheet open={open} onClose={close} title="Record student leave" sub="For a parent who called, wrote or messaged. Parents have no login.">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label="Student" id="rl-stu" required error={tried && err.stu}>
          {f.stu ? (
            <div className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
              <Avatar name={f.stu.name} size={36} />
              <div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px] truncate">{f.stu.name}</p><p className="text-[12.5px] text-ink3">{stuCls} · Roll {f.stu.roll} · <span className="font-mono">{f.stu.adm}</span></p></div>
              <Button type="button" size="sm" variant="ghost" onClick={() => setF({ ...f, stu: null, q: '' })}>Change</Button>
            </div>
          ) : (
            <div className="relative">
              <SearchBox id="rl-stu" value={f.q} onChange={(v) => set('q', v)} placeholder={ct ? 'Name or admission no. in 7 B' : 'Name or admission no.'} />
              {res.length > 0 && (
                <ul className="mt-1.5 rounded-xl border border-line bg-surface shadow-pop p-1.5">
                  {res.map((s) => (
                    <li key={s.id}><button type="button" onClick={() => setF({ ...f, stu: s, q: '' })} className="w-full flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-sunken text-left">
                      <Avatar name={s.name} size={30} /><span className="min-w-0 flex-1"><span className="block font-semibold text-[14px] truncate">{s.name}</span><span className="block text-[12px] text-ink3">{clsOf(s)} · <span className="font-mono">{s.adm}</span></span></span>
                    </button></li>
                  ))}
                </ul>
              )}
              {f.q.trim() && res.length === 0 && <p className="text-[12.5px] text-ink3 mt-1.5">No student called “{f.q}”{ct ? ' in 7 B' : ''}.</p>}
            </div>
          )}
        </Field>
        <Field label="Leave type" id="rl-type" required hint={`Quota: ${f.type} ${q[0]} days a ${q[1]}${f.stu ? ` · ${f.type === 'Medical' ? 4 : q[0]} of ${q[0]} left` : ''}`}>
          <Select id="rl-type" value={f.type} onChange={(v) => set('type', v)} options={TYPES} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <DateField id="rl-from" label="From" required value={f.from} onChange={(v) => setF({ ...f, from: v, to: f.to === f.from ? v : f.to })} error={tried && err.from} />
          <DateField id="rl-to" label="To" required value={f.to} onChange={(v) => set('to', v)} error={(tried || overlap) && err.to} />
        </div>
        {dc && !dc.bad && <p className="text-[13px] text-ink2 -mt-1"><b className="font-semibold">{f.half ? 'Half a day' : `${dc.n} school ${dc.n === 1 ? 'day' : 'days'}`}</b>{dc.skipped.length > 0 && <span className="text-ink3"> · not counted: {dc.skipped.slice(0, 3).join(', ')}{dc.skipped.length > 3 ? ` and ${dc.skipped.length - 3} more` : ''}</span>}</p>}
        <div className="rounded-xl border border-line"><SettingRow id="rl-half" title="Half day" sub="Leaves early or comes late"><Switch id="rl-half" on={f.half} onChange={(v) => set('half', v)} label="Half day" /></SettingRow></div>
        <Field label="Reason" id="rl-reason" required error={tried && err.reason}><Textarea id="rl-reason" value={f.reason} onChange={(v) => set('reason', v)} rows={2} placeholder="As the parent said it" /></Field>
        <Field label="Document" id="rl-doc" hint="Photo of a doctor’s note or a file">
          {f.doc ? <ul><FileRow name="Doctor-note.jpg" meta="1.1 MB · just now" onView={() => set('doc', false)} /></ul>
            : <Button type="button" variant="secondary" icon={I.Camera} onClick={() => set('doc', true)}>Add photo or file</Button>}
        </Field>
        <div className="flex gap-2 justify-end pt-1">
          <Button type="button" variant="ghost" onClick={close}>Cancel</Button>
          <Button type="submit" variant="primary" icon={I.Check} loading={busy}>{busy ? 'Saving…' : 'Record leave'}</Button>
        </div>
      </form>
    </Sheet>
  );
}

/* =====================================================================================
   Staff Attendance
   ===================================================================================== */

const MORE_STAFF = [
  ...['Lakshmi Rao|Principal', 'Srinivas Murthy|Vice Principal', 'Meena Pillai|Academic Head', 'Prakash Joshi|PGT Mathematics · Exam In-charge',
    'Rajeshwari Nair|TGT English', 'Nandini Joshi|TGT English', 'Sneha Mathew|TGT English', 'Mahesh Goud|TGT Telugu', 'Shobha Rani|TGT Hindi', 'Srinivas Chary|TGT Mathematics',
    'Arvind Rao|PGT Mathematics', 'Pallavi Reddy|TGT Science', 'Bhargavi Kulkarni|TGT Biology', 'Prasad Varma|TGT Social Studies', 'Rukmini Devi|PGT Social Studies',
    'Naresh Chary|Art teacher', 'Kalyani Sastry|Music teacher', 'Vijaya Lakshmi|PRT Telugu', 'Kusum Lata|PRT Hindi', 'Sowmya Rao|Special educator', 'Vasudha Iyer|Dance teacher',
    'Rekha Sharma|PRT', 'Fathima Begum|PRT', 'Madhavi Latha|PRT', 'Sujatha Rao|PRT', 'Anjali Verma|PRT', 'Vani Prasad|PRT', 'Hema Latha|PRT',
    'Saritha Reddy|PRT', 'Jyothi Naidu|PRT', 'Kavya Sree|PRT', 'Roopa Devi|PRT', 'Pushpa Latha|PRT', 'Neelima Rao|PRT', 'Swathi Goud|PRT', 'Sravanthi Rao|PRT',
    'Padmaja Sastry|PRT', 'Aruna Kumari|PRT', 'Manjula Reddy|PRT', 'Sirisha Varma|PRT', 'Ramesh Babu|PRT', 'Leela Prasad|PRT', 'Nirmala Joseph|PRT', 'Gayathri Menon|PRT',
    'Sunil Kumar|PRT', 'Deepika Rao|PRT', 'Haritha Reddy|PRT'].map((x) => ['Teaching', ...x.split('|')]),
  ...['Shalini Verma|HR', 'Naveen Kumar|Office Staff', 'Divya Menon|Admission Counsellor', 'Sana Ali|Counsellor'].map((x) => ['Office', ...x.split('|')]),
  ['Accounts', 'Ramya Krishna', 'Accounts Assistant'],
  ...['Narsimha|Driver · Bus 1', 'Yadagiri|Driver · Bus 2', 'Srisailam|Driver · Bus 3', 'Ramesh|Driver · Bus 5', 'Jangaiah|Driver · Bus 6', 'Anjaiah|Driver · spare', 'Sailu|Bus attender', 'Kanakamma|Bus attender', 'Ellaiah|Bus attender', 'Pochamma|Bus attender'].map((x) => ['Transport', ...x.split('|')]),
  ['Hostel', 'Mary Joseph', 'Hostel Warden · Girls'], ['Hostel', 'Ravi Kumar', 'Hostel attender'],
  ['Support', 'Bhaskar Rao', 'Gate Security'], ['Support', 'Yellamma', 'Ayah'],
];
const LATE = { 'Deepak Verma': '9:12 AM', 'Kavya Sree': '8:34 AM', 'Ramya Krishna': '8:41 AM', 'Sunil Kumar': '8:31 AM', 'Neelima Rao': '8:38 AM', 'Vasudha Iyer': '8:46 AM' };
const LEAVE_TODAY = { 'Anitha Kumari': 'Casual leave', 'Ramu Yadav': 'Casual leave', 'Sravanthi Rao': 'Medical leave, 8 to 20 Oct' };
const minsLate = (t) => { const [h, m] = t.replace(' AM', '').split(':').map(Number); return h * 60 + m - (8 * 60 + 15); };
const hsh = (s) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
const STAFF86 = (() => {
  const base = STAFF.map((s) => ({ name: s.name, code: s.code, dept: s.dept, desig: s.desig }));
  let n = 40;
  const more = MORE_STAFF.map(([dept, name, desig]) => ({ name, dept, desig, code: `SPS-${dept === 'Teaching' ? 'T' : dept === 'Office' || dept === 'Accounts' ? 'A' : 'S'}-0${n++}` }));
  return [...base, ...more].map((s) => {
    const h = hsh(s.name);
    let inT = null; let st = 'Present'; let src = 'Main gate face scanner';
    if (LEAVE_TODAY[s.name]) st = 'On leave';
    else if (s.name === 'Swapna Reddy') st = 'Not in yet';
    else if (LATE[s.name]) { st = 'Late'; inT = LATE[s.name]; }
    else if (s.dept === 'Transport') { inT = `6:${String(10 + (h % 35)).padStart(2, '0')} AM`; src = 'App check-in at the bus bay'; }
    else if (s.dept === 'Hostel' || s.desig === 'Gate Security') { inT = `7:0${h % 9} AM`; }
    else { const m = 48 + (h % 36); inT = m >= 60 ? `8:${String(m - 60).padStart(2, '0')} AM` : `7:${m} AM`; }
    if (st === 'Present' || st === 'Late') {
      if (s.dept !== 'Transport') src = s.name === 'Lakshmamma' ? 'By hand' : h % 5 === 0 ? 'Staff room fingerprint' : h % 7 === 0 ? 'QR in the staff room' : 'Main gate face scanner';
    }
    return { ...s, id: s.code, in: inT, out: null, st, src: st === 'Present' || st === 'Late' ? src : null, late: st === 'Late' ? minsLate(inT) : 0, leave: LEAVE_TODAY[s.name] };
  });
})();
const SRC_ICON = (s) => (!s ? 'Minus' : s.includes('face') ? 'ScanFace' : s.includes('fingerprint') ? 'Fingerprint' : s.includes('QR') ? 'QrCode' : s.includes('App') ? 'Smartphone' : 'PencilLine');
const STF_TONE = { Present: 'ok', Late: 'warn', 'On leave': 'info', 'Not in yet': 'bad', Absent: 'bad', 'Half-day': 'warn' };
const CORRECTIONS0 = [
  { id: 'c1', name: 'Kavya Sree', what: '7 Oct · Late → Present', why: 'Sent to the district science fair venue first, on duty', st: 'Waiting', by: 'Asked by Kavya Sree' },
  { id: 'c2', name: 'Mallesh Kumar', what: '8 Oct · in time 6:20 AM added', why: 'Bus 4 left from the depot; did not reach the gate scanner', st: 'Approved', by: 'Approved by Shalini Verma' },
  { id: 'c3', name: 'Usha Rani', what: '5 Oct · out time 3:50 PM added', why: 'Forgot to punch out after PTM duty', st: 'Approved', by: 'Approved by Shalini Verma' },
];

function StaffPage(p) {
  return <WholePart><StaffInner {...p} /></WholePart>;
}
function StaffInner({ access }) {
  const toast = useToast();
  const { role } = useRole();
  // HR's Own access to Attendance is all of staff attendance, so HR decides corrections too. Nobody decides their own.
  const mayApprove = access === 'full' || role.id === 'hr';
  const canEdit = useCanEdit();
  const [rows, setRows] = useState(STAFF86);
  const [st, setSt] = useState('all');
  const [dept, setDept] = useState('all');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(25);
  const [fix, setFix] = useState(null);
  const [month, setMonth] = useState(null);
  const [ot, setOt] = useState(null);
  const [hand, setHand] = useState(false);
  const [corr, setCorr] = useState(CORRECTIONS0);
  const c = rows.reduce((a, r) => ((a[r.st] = (a[r.st] || 0) + 1), a), {});
  const present = (c.Present || 0) + (c.Late || 0);
  const list = rows.filter((r) => (st === 'all' || r.st === st) && (dept === 'all' || r.dept === dept) && (!q || r.name.toLowerCase().includes(q.toLowerCase()) || r.code.toLowerCase().includes(q.toLowerCase()) || r.desig.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (b.st === 'Not in yet') - (a.st === 'Not in yet') || (b.st === 'Late') - (a.st === 'Late') || 0);
  const shown = list.slice(0, limit);
  const lateAvg = Math.round(rows.filter((r) => r.st === 'Late').reduce((a, r) => a + r.late, 0) / Math.max(1, c.Late || 0));
  const update = (code, patch, msg, body) => { const before = rows; setRows((x) => x.map((r) => (r.code === code ? { ...r, ...patch } : r))); toast({ title: msg, body, undo: () => setRows(before) }); };
  const menu = (r) => [['PencilLine', 'Correct this entry', () => setFix(r)], ['CalendarDays', 'Month view', () => setMonth(r)], ['Timer', 'Record overtime', () => setOt(r)]].filter((x, i) => canEdit || i === 1);
  return (
    <div>
      <AttHead sub={`Today, Fri 9 Oct · ${rows.length} staff · tap a name for the month calendar`}
        actions={<>
          <Button variant="secondary" icon={I.PencilLine} onClick={() => setHand(true)}>Mark by hand</Button>
        </>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Stats items={[
          { label: 'Present', value: `${present} of ${rows.length}`, sub: `${((present / rows.length) * 100).toFixed(1)}% · ${c.Late || 0} of them late`, tone: 'ok', icon: 'UserCheck', onClick: () => setSt('all') },
          { label: 'Late', value: c.Late || 0, sub: `${lateAvg} min late on average`, tone: 'warn', icon: 'Clock', onClick: () => setSt('Late') },
          { label: 'On leave', value: c['On leave'] || 0, sub: 'Approved in Staff & HR', icon: 'CalendarDays', onClick: () => setSt('On leave') },
          { label: 'Not in yet', value: c['Not in yet'] || 0, sub: c['Not in yet'] ? 'No punch by 10:42 AM' : 'Everyone is in', tone: c['Not in yet'] ? 'bad' : 'ok', icon: 'UserX', onClick: () => setSt('Not in yet') },
        ]} />
        <Split side={340}>
          <Card className="overflow-hidden">
            <Toolbar>
              <SearchBox id="sa-search" value={q} onChange={setQ} placeholder="Name, staff code or designation" />
              <div className="flex gap-2"><Select id="sa-dept" value={dept} onChange={setDept} className="flex-1 @md:w-40" options={[{ value: 'all', label: 'All departments' }, ...DEPARTMENTS.map((d) => ({ value: d.k, label: `${d.k} (${d.n})` }))]} /><ExportButton what="staff attendance" /></div>
            </Toolbar>
            <div className="px-3 pt-3"><Chips value={st} onChange={(v) => { setSt(v); setLimit(25); }} options={[{ value: 'all', label: 'Everyone', count: rows.length }, { value: 'Late', label: 'Late', count: c.Late || 0 }, { value: 'On leave', label: 'On leave', count: c['On leave'] || 0 }, { value: 'Not in yet', label: 'Not in yet', count: c['Not in yet'] || 0 }]} /></div>
            <DataList rows={shown} rowKey={(r) => r.code} minWidth={820} onRow={(r) => setMonth(r)}
              columns={[
                { key: 'name', label: 'Staff', render: (r) => <div className="flex items-center gap-3"><Avatar name={r.name} size={34} /><div className="min-w-0"><p className="font-semibold leading-tight">{r.name}</p><p className="text-[12px] text-ink3 font-mono">{r.code}</p></div></div> },
                { key: 'desig', label: 'Department', render: (r) => <div><p className="leading-tight">{r.desig}</p><p className="text-[12px] text-ink3">{r.dept}</p></div> },
                { key: 'in', label: 'In', render: (r) => <span className="tnum whitespace-nowrap">{r.in || '—'}</span> },
                { key: 'out', label: 'Out', render: (r) => <span className="tnum text-ink3">{r.out || '—'}</span> },
                { key: 'st', label: 'Status', render: (r) => <div><Pill tone={STF_TONE[r.st]}>{r.st === 'Late' ? `Late · ${r.late} min` : r.st}</Pill>{r.leave && <p className="text-[11.5px] text-ink3 mt-0.5">{r.leave}</p>}</div> },
                { key: 'src', label: 'Source', render: (r) => r.src ? <span className="flex items-center gap-1.5 text-[13px] text-ink2 whitespace-nowrap">{React.createElement(I[SRC_ICON(r.src)], { size: 15, className: 'text-ink3' })}{r.src}</span> : <span className="text-ink3">—</span> },
                { key: 'm', label: '', render: (r) => <div onClick={(e) => e.stopPropagation()}><MoreMenu size="sm" label={`Actions for ${r.name}`} items={menu(r)} /></div> },
              ]}
              mobile={(r) => ({ avatar: r.name, title: r.name, sub: `${r.desig} · ${r.in ? `in ${r.in}` : r.leave || 'no punch yet'}`, right: <Pill tone={STF_TONE[r.st]} className="!h-[22px] !text-[11.5px]">{r.st === 'Late' ? `Late ${r.late}m` : r.st}</Pill> })}
              footer={false} />
            {list.length > 0 && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-line text-[13px] text-ink3">
                <span className="tnum">Showing {shown.length} of {list.length}</span>
                {shown.length < list.length && <Button size="sm" variant="secondary" onClick={() => setLimit((l) => l + 30)}>Show more</Button>}
              </div>
            )}
          </Card>
          <Col>
            <Card>
              <CardHead title="Corrections" sub="Changes after the lock time go to Approvals" icon={I.History} />
              <ul className="px-2 pb-2">
                {corr.map((x) => (
                  <li key={x.id} className="flex items-start gap-3 px-3 py-2.5 rounded-xl">
                    <Avatar name={x.name} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[14px] leading-snug">{x.name} <span className="font-normal text-ink3">· {x.what}</span></p>
                      <p className="text-[12.5px] text-ink3">{x.why}</p>
                      <p className="text-[12px] mt-1 flex items-center gap-2"><Pill tone={x.st === 'Waiting' ? 'warn' : x.st === 'Approved' ? 'ok' : 'bad'} className="!h-5 !text-[11px]">{x.st}</Pill><span className="text-ink3">{x.by}</span></p>
                    </div>
                    {x.st === 'Waiting' && mayApprove && canEdit && x.name !== role.person.name && <Button size="sm" variant="soft" onClick={() => { setCorr(corr.map((y) => (y.id === x.id ? { ...y, st: 'Approved', by: 'Approved by you just now' } : y))); toast({ title: `Correction approved for ${x.name}`, body: 'The original stays in the audit log.', undo: () => setCorr(corr) }); }}>Approve</Button>}
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHead title="Today’s rules" icon={I.Info} />
              <DL cols={1} rows={[['Late after', '8:25 AM (start 8:15, 10 minutes grace)'], ['Half day', 'In after 11:00 AM or out before 1:00 PM'], ['Lock time', 'Changes after 11:00 AM need a correction request'], ['Goes to', 'Generate Salary: present days, leave and late marks']]} />
            </Card>
          </Col>
        </Split>
      </div>

      <CorrectSheet r={fix} onClose={() => setFix(null)} onSave={(patch, why) => { const r = fix; setFix(null); update(r.code, patch, `${r.name}: changed to ${patch.st}`, `Reason: ${why}. The original is kept in the audit log.`); }} />
      <StaffMonth r={month} onClose={() => setMonth(null)} onCorrect={canEdit ? (r) => { setMonth(null); setFix(r); } : null} />
      <FormSheet open={!!ot} onClose={() => setOt(null)} title={`Overtime for ${ot?.name}`} sub="Paid with the next salary, if overtime is paid for this role." submitLabel="Save overtime"
        onSubmit={() => toast({ title: `Overtime saved for ${ot.name}`, body: 'Sent to Generate Salary for October.' })}>
        <OvertimeFields />
      </FormSheet>
      <HandSheet open={hand} onClose={() => setHand(false)} rows={rows} onSave={(code, patch, name) => update(code, patch, `${name}: marked ${patch.st}`, patch.in ? `In time ${patch.in} · by hand` : 'By hand')} />
    </div>
  );
}

function OvertimeFields() {
  const [h, setH] = useState('1.5');
  const [n, setN] = useState('');
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" id="ot-d" required><Input id="ot-d" defaultValue="08-10-2026" className="tnum" /></Field>
        <Field label="Hours" id="ot-h" required><Input id="ot-h" inputMode="decimal" value={h} onChange={(e) => setH(e.target.value.replace(/[^\d.]/g, '').slice(0, 4))} className="tnum" /></Field>
      </div>
      <Field label="Note" id="ot-n"><Textarea id="ot-n" value={n} onChange={setN} rows={2} placeholder="Annual day rehearsal after school" /></Field>
    </>
  );
}

function CorrectSheet({ r, onClose, onSave }) {
  const [f, setF] = useState(null);
  const [tried, setTried] = useState(false);
  if (!r) return null;
  const v = f || { st: r.st === 'Not in yet' ? 'Absent' : r.st, in: r.in || '', out: r.out || '', why: '' };
  const set = (k, x) => setF({ ...v, [k]: x });
  const err = !v.why.trim() ? 'A reason is needed for every change' : (v.st === 'Present' || v.st === 'Late' || v.st === 'Half-day') && !/^\d{1,2}:\d{2} (AM|PM)$/.test(v.in.trim()) ? '' : '';
  const errIn = (v.st === 'Present' || v.st === 'Late' || v.st === 'Half-day') && !/^\d{1,2}:\d{2} (AM|PM)$/.test(v.in.trim()) ? 'Like 8:05 AM' : '';
  const close = () => { onClose(); setF(null); setTried(false); };
  return (
    <Sheet open onClose={close} title={`Correct ${r.name}`} sub="Today · Fri 9 Oct"
      footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" icon={I.Check} onClick={() => { setTried(true); if (err || errIn) return; onSave({ st: v.st, in: v.in || null, out: v.out || null, late: v.st === 'Late' ? Math.max(1, (() => { const [h, m] = v.in.split(' ')[0].split(':').map(Number); return h * 60 + m - 495; })()) : 0, src: v.in ? 'By hand' : null }, v.why.trim()); setF(null); setTried(false); }}>Save change</Button></>}>
      <div className="flex flex-col gap-4">
        <Banner tone="info" icon={I.Clock} title="Before 11:00 AM:">today’s entry changes now. After the lock time this becomes a correction request in Approvals, and the original stays in the audit log.</Banner>
        <Field label="Status" id="cs-st" required><Select id="cs-st" value={v.st} onChange={(x) => set('st', x)} options={['Present', 'Late', 'Half-day', 'Absent', 'On leave']} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="In time" id="cs-in" error={tried && errIn}><Input id="cs-in" value={v.in} onChange={(e) => set('in', e.target.value)} placeholder="8:05 AM" error={tried && errIn} className="tnum" /></Field>
          <Field label="Out time" id="cs-out"><Input id="cs-out" value={v.out} onChange={(e) => set('out', e.target.value)} placeholder="4:10 PM" className="tnum" /></Field>
        </div>
        <Field label="Reason" id="cs-why" required error={tried && err}><Textarea id="cs-why" value={v.why} onChange={(x) => set('why', x)} rows={2} placeholder="Face scanner did not read; seen at the gate by Bhaskar Rao" /></Field>
      </div>
    </Sheet>
  );
}

function StaffMonth({ r, onClose, onCorrect }) {
  if (!r) return null;
  const h = hsh(r.name);
  const late = r.name === 'Deepak Verma' ? [5, 7, 9] : r.st === 'Late' ? [9, 3 + (h % 4)] : h % 3 === 0 ? [6] : [];
  const leave = r.leave ? (r.name === 'Sravanthi Rao' ? [8, 9] : [9]) : [];
  // October 2026 keeps today's real entries; earlier months come from the example helper
  const octCell = (d) => {
    const dt = new Date(2026, 9, d);
    if (d > 9 || dt.getDay() === 0) return { tone: 'muted' };
    if (d === 2) return { tone: 'info', title: 'Holiday: Gandhi Jayanti' };
    if (leave.includes(d)) return { tone: 'info', title: 'On leave' };
    if (r.st === 'Not in yet' && d === 9) return { tone: 'none', dot: 'bad', title: 'Not in yet' };
    if (late.includes(d)) return { tone: 'warn', title: 'Late' };
    return { tone: 'ok', title: 'Present' };
  };
  const other = markCell(r.code);
  const cell = (y, m, d) => (y === 2026 && m === 9 ? octCell(d) : other(y, m, d));
  const octDays = [1, 3, 5, 6, 7, 8, 9];
  const footer = (y, m) => {
    let t;
    if (y === 2026 && m === 9) {
      const lt = late.filter((d) => d <= 9).length;
      const pres = octDays.filter((d) => !leave.includes(d) && !(r.st === 'Not in yet' && d === 9)).length;
      t = { present: pres, late: lt, leave: leave.length, absent: 0, note: '7 working days so far. Sundays and Gandhi Jayanti are not counted.' };
    } else {
      const x = monthTotals(r.code, y, m);
      t = { present: x.present + x.late, late: x.late, leave: x.leave, absent: x.absent, note: x.school ? `${x.school} working days · ${x.pct}% present. Sundays, second Saturdays and holidays are not counted.` : 'No working days this month.' };
    }
    return (
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-4 gap-2">
          {[['Present', t.present], ['Late', t.late], ['Leave', t.leave], ['Absent', t.absent]].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-sunken/70 px-3 py-2.5"><p className="font-display text-[22px] font-semibold tnum leading-none">{v}</p><p className="text-[12px] text-ink3 font-semibold mt-1">{k}</p></div>
          ))}
        </div>
        <p className="text-[12.5px] text-ink3">{t.note}</p>
      </div>
    );
  };
  return (
    <Sheet open onClose={onClose} title={r.name} sub={`${r.desig} · ${r.code}`}
      footer={<>{onCorrect && <Button variant="secondary" icon={I.PencilLine} onClick={() => onCorrect(r)}>Correct today</Button>}<Button variant="ghost" onClick={onClose}>Close</Button></>}>
      <div className="flex flex-col gap-4">
        <CalendarMonth id="sa-month" compact cell={cell} footer={footer} />
        <Legend items={[['bg-ok/15', 'Present'], ['bg-warn/15', 'Late'], ['bg-bad/15', 'Absent'], ['bg-info/10', 'Leave or holiday']]} />
      </div>
    </Sheet>
  );
}

function HandSheet({ open, onClose, rows, onSave }) {
  const missing = rows.filter((r) => r.st === 'Not in yet');
  const [pick, setPick] = useState({});
  const [tm, setTm] = useState('');
  const r = missing[0];
  const choice = r ? pick[r.code] || 'Absent' : null;
  return (
    <Sheet open={open} onClose={onClose} title="Mark by hand" sub="For staff without a punch today. Devices and the app fill the rest."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button>{r && <Button variant="primary" icon={I.Check} disabled={choice !== 'Absent' && !/^\d{1,2}:\d{2} (AM|PM)$/.test(tm.trim())} onClick={() => { onSave(r.code, { st: choice, in: choice === 'Absent' ? null : tm.trim(), src: choice === 'Absent' ? null : 'By hand', late: choice === 'Late' ? 30 : 0 }, r.name); onClose(); }}>Save</Button>}</>}>
      {!r ? <Empty icon={I.CheckCheck} title="Everyone has a punch today" body="Late comers and staff on leave are already marked." /> : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5"><Avatar name={r.name} size={38} /><div><p className="font-semibold text-[14.5px]">{r.name}</p><p className="text-[12.5px] text-ink3">{r.desig} · no punch by 10:42 AM</p></div></div>
          <Field label="Status" id="hs-st"><Segmented value={choice} onChange={(v) => setPick({ ...pick, [r.code]: v })} options={['Present', 'Late', 'Half-day', 'Absent']} className="w-full" size="sm" /></Field>
          {choice !== 'Absent' && <Field label="In time" id="hs-in" required hint="Like 10:50 AM"><Input id="hs-in" value={tm} onChange={(e) => setTm(e.target.value)} placeholder="10:50 AM" className="tnum" /></Field>}
          {choice === 'Absent' && <p className="text-[13px] text-ink2">Her periods today go to Substitutions so someone covers them.</p>}
        </div>
      )}
    </Sheet>
  );
}

/* =====================================================================================
   Attendance Reports
   ===================================================================================== */

// label, students, class teacher (who marked), absent, late, on leave (inside absent), marked at
const DAILY = [
  ['Nursery A', 22, 'Rekha Sharma', 2, 0, 0, '8:58'], ['Nursery B', 20, 'Fathima Begum', 1, 0, 0, '9:02'],
  ['LKG A', 25, 'Madhavi Latha', 2, 0, 0, '8:55'], ['LKG B', 24, 'Sujatha Rao', 3, 0, 1, '9:01'], ['LKG C', 22, 'Anjali Verma', 1, 0, 0, '8:57'],
  ['UKG A', 26, 'Sunitha Mohan', 1, 0, 0, '8:52'], ['UKG B', 25, 'Vani Prasad', 2, 0, 1, '8:54'], ['UKG C', 23, 'Hema Latha', 1, 0, 0, '8:59'],
  ['1 A', 27, 'Saritha Reddy', 1, 0, 0, '8:51'], ['1 B', 26, 'Jyothi Naidu', 0, 0, 0, '8:50'], ['1 C', 26, 'Kavya Sree', 2, 0, 1, '8:56'], ['1 D', 25, 'Roopa Devi', 1, 0, 0, '8:53'],
  ['2 A', 28, 'Pushpa Latha', 0, 0, 0, '8:49'], ['2 B', 27, 'Usha Rani', 1, 0, 0, '8:52'], ['2 C', 26, 'Neelima Rao', 1, 0, 0, '8:58'], ['2 D', 26, 'Swathi Goud', 2, 1, 0, '8:55'],
  ['3 A', 28, 'Kalyani Sastry for Sravanthi Rao', 2, 0, 1, '8:57'], ['3 B', 28, 'Padmaja Sastry', 1, 1, 0, '8:54'], ['3 C', 27, 'Aruna Kumari', 0, 0, 0, '8:52'], ['3 D', 25, 'Manjula Reddy', 1, 0, 0, '8:56'],
  ['4 A', 29, 'Sirisha Varma', 1, 0, 1, '8:53'], ['4 B', 28, 'Ramesh Babu', 1, 0, 0, '8:57'], ['4 C', 27, 'Leela Prasad', 0, 0, 0, '8:51'], ['4 D', 26, 'Nirmala Joseph', 1, 0, 0, '8:59'],
  ['5 A', 31, 'Gayathri Menon', 2, 1, 0, '8:55'], ['5 B', 28, 'Sunil Kumar', 1, 0, 1, '8:58'], ['5 C', 27, 'Deepika Rao', 1, 0, 0, '8:54'], ['5 D', 25, 'Srinivas Murthy (no class teacher)', 0, 0, 0, '9:05'],
  ['6 A', 36, 'Lalitha Devi', 2, 0, 1, '8:52'], ['6 B', 35, 'Shobha Rani', 1, 1, 0, '8:56'], ['6 C', 33, 'Pallavi Reddy', 1, 0, 0, '8:53'],
  ['7 A', 37, 'Rajeshwari Nair', 1, 0, 0, '8:50'], ['7 B', 38, 'Ravi Teja', 1, 0, 1, '8:52'], ['7 C', 34, 'Mahesh Goud', 2, 0, 0, '8:57'],
  ['8 A', 36, 'Venkat Rao', 1, 2, 0, '9:31'], ['8 B', 35, 'Prasad Varma', 0, 0, 0, '8:55'], ['8 C', 32, 'Nandini Joshi', 2, 0, 1, '8:58'],
  ['9 A', 34, 'Bhargavi Kulkarni', 0, 0, 0, '8:54'], ['9 B', 33, 'Swapna Reddy', 3, 0, 0, '9:08'], ['9 C', 31, 'Deepak Verma', 4, 1, 1, '9:14'],
  ['10 A', 33, 'Sneha Mathew for Anitha Kumari', 1, 1, 1, '8:56'], ['10 B', 32, 'Arvind Rao', 0, 0, 0, '8:52'], ['10 C', 30, 'Farhana Begum', 1, 1, 0, '9:48'],
].map(([label, n, by, ab, late, lv, at]) => ({ label, n, by, ab, late, lv, at, pct: Math.round(((n - ab) / n) * 1000) / 10, slow: at >= '9:15' }));
const TOT = DAILY.reduce((a, r) => ({ n: a.n + r.n, ab: a.ab + r.ab, late: a.late + r.late, lv: a.lv + r.lv }), { n: 0, ab: 0, late: 0, lv: 0 });
const CHRONIC = [
  { name: 'Tejas Chowdary', cls: '9 C', days: 3, pct: 84, last: 'Absence message seen by father, 9:47 AM' },
  { name: 'Meera Rao', cls: '9 C', days: 3, pct: 86, last: 'Absence message delivered, not seen' },
  { name: 'Varun Joshi', cls: '6 A', days: 3, pct: 88, last: 'Mother replied: “He has fever”' },
  { name: 'Vihaan Sharma', cls: 'LKG B', days: 3, pct: 90, last: 'Absence message seen by mother, 9:52 AM' },
];
const WATCH = STUDENTS.filter((s) => s.att < 80).sort((a, b) => a.att - b.att).slice(0, 6);
const REPORTS = [
  ['today', 'Daily attendance by class and section', 'Students and staff, today or any date', 'CalendarCheck2'],
  ['month', 'Attendance % and trends', 'By class and month', 'ChartLine'],
  ['chronic', 'Chronic absence', 'Below 75% or absent 3 days in a row', 'UserX'],
  ['staff', 'Late arrivals', 'Students and staff, by month', 'Clock'],
  [null, 'Monthly attendance by student, class, section or staff member', 'One row per person, days present and %', 'Table2'],
  [null, 'Attendance by date range', 'For any student or staff member', 'CalendarRange'],
  [null, 'Student leave by type and class', 'Medical, emergency, holiday and the school’s own', 'CalendarDays'],
  [null, 'Staff overtime', 'Hours by staff member and month', 'Timer'],
  [null, 'Device health', 'Punches received and rejected by device', 'ScanFace'],
];

// Example numbers for a day other than today, or a run of days: each section moves a little, the same way every time
const wob = (key) => 0.6 + (hsh(key) % 80) / 100;
const OCT_DAY = { '2026-10-01': 96.1, '2026-10-03': 95.2, '2026-10-05': 94.8, '2026-10-06': 95.9, '2026-10-07': 96.3, '2026-10-08': 95.1, '2026-10-09': 95.6 };

function ReportsPage() {
  const toast = useToast();
  const { go } = useNav();
  const { role } = useRole();
  const canEdit = useCanEdit();
  // Staff numbers belong to people who run staff attendance (Full). Academic Head (View) follows students only.
  const staffOk = role.access.attendance === 'full';
  const [tab, setTab] = useState('today');
  const [per, setPer] = useState(PERIODS.today);
  const [q, setQ] = useState('');
  const [make, setMake] = useState(null);
  const sdays = schoolDaysIn(per);
  const n = sdays.length;
  const one = n === 1;
  const isToday = per.from === '2026-10-09' && per.to >= '2026-10-09' && one;
  const all = DAILY.map((r) => {
    if (isToday) return { ...r, absD: r.ab, lateD: r.late, lvD: r.lv };
    const f = wob(r.label + per.from + per.to);
    const absD = Math.round(r.ab * f * n), lateD = Math.round(r.late * f * n), lvD = Math.min(absD, Math.round(r.lv * f * n));
    return { ...r, absD, lateD, lvD, pct: Math.round((1 - absD / (r.n * n)) * 1000) / 10, slow: one ? r.slow && f > 1 : false };
  });
  const rows = all.filter((r) => !q || r.label.toLowerCase().includes(q.toLowerCase()) || r.by.toLowerCase().includes(q.toLowerCase()));
  const T = all.reduce((a, r) => ({ n: a.n + r.n, ab: a.ab + r.absD, late: a.late + r.lateD, lv: a.lv + r.lvD }), { n: 0, ab: 0, late: 0, lv: 0 });
  const avgPresent = n ? Math.round(T.n - T.ab / n) : 0;
  const pctAll = n ? (((T.n * n - T.ab) / (T.n * n)) * 100).toFixed(1) : '0';
  const dayBars = n <= 31
    ? sdays.map((d) => ({ k: `${Number(d.slice(8))} ${MONTH_NAMES[Number(d.slice(5, 7)) - 1].slice(0, 3)}`, v: OCT_DAY[d] || Math.round((93.5 + (hsh(d) % 30) / 10) * 10) / 10 }))
    : [];
  const monthBars = [['Jun', 96.4], ['Jul', 94.9], ['Aug', 95.6], ['Sep', 95.2], ['Oct', 95.6]].map(([k, v]) => ({ k, v }));
  const scale = (v) => Math.max(0, Math.round((v * n) / 7));
  const reports = REPORTS.filter((x) => staffOk || !['Staff overtime', 'Device health'].includes(x[1]))
    .map((x) => (staffOk ? x : [x[0], x[1].replace(', section or staff member', ' or section').replace(' or staff member', ''), x[2].replace('Students and staff, ', '').replace(' or staff member', '').replace('Students and staff', 'Students'), x[3]]));
  return (
    <div>
      <AttHead sub={staffOk ? 'Students and staff · Sundays and holidays are left out of every number · 2026–27, school day 86 of 220' : 'Student attendance across classes · Sundays and holidays are left out · 2026–27, school day 86 of 220'} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <div className="flex flex-col @lg:flex-row @lg:items-center gap-3">
          <div className="overflow-x-auto no-scrollbar -mx-1 px-1 min-w-0"><Segmented value={tab} onChange={setTab} options={[{ value: 'today', label: 'By section' }, { value: 'month', label: 'Trends' }, { value: 'chronic', label: 'Chronic absence' }, { value: 'staff', label: 'Late arrivals' }]} /></div>
          {tab !== 'chronic' && <div className="@lg:ml-auto min-w-0"><DatePeriod id="rp-per" value={per} onChange={setPer} className="w-full @lg:w-auto" /></div>}
        </div>
        {tab !== 'chronic' && <p className="text-[13px] text-ink3 -mt-2">Showing: <b className="font-semibold text-ink2">{per.label}</b> · {fmtRange(per)} · {n} school {n === 1 ? 'day' : 'days'}</p>}

        {tab !== 'chronic' && n === 0 && (
          <Card><Empty icon={I.CalendarX2} title="No school days in these dates" body="Sundays, second Saturdays, holidays and the summer break are left out. Pick other dates." /></Card>
        )}

        {tab === 'today' && n > 0 && (
          <>
            <Stats items={[
              one ? { label: 'Students present', value: `${(T.n - T.ab).toLocaleString('en-IN')} of ${T.n.toLocaleString('en-IN')}`, sub: `${pctAll}% · ${T.late} came late`, tone: 'ok', icon: 'UserCheck' }
                : { label: 'Present on average', value: `${avgPresent.toLocaleString('en-IN')} of ${T.n.toLocaleString('en-IN')}`, sub: `${pctAll}% · ${T.late} late marks`, tone: 'ok', icon: 'UserCheck' },
              { label: one ? 'Absent' : 'Days absent', value: T.ab.toLocaleString('en-IN'), sub: `${T.lv} of them on approved leave`, icon: 'UserX' },
              one ? { label: 'Classes marked', value: '43 of 43', sub: isToday ? '2 marked after 9:15 AM' : 'All marked on time', icon: 'ListChecks' }
                : { label: 'School days', value: n, sub: '43 sections marked every day', icon: 'ListChecks' },
              ...(staffOk ? [{ label: one ? 'Staff present' : 'Staff present on average', value: isToday ? '82 of 86' : `${one ? 83 : 82} of 86`, sub: isToday ? '3 on leave · 1 not in yet' : 'Approved leave left out', icon: 'Users', onClick: () => go('attendance', { page: 'staff' }) }] : []),
            ]} />
            <Card className="overflow-hidden">
              <Toolbar>
                <SearchBox id="rp-search" value={q} onChange={setQ} placeholder="Section or teacher" />
                <ExportButton what="attendance by section" />
              </Toolbar>
              <DataList rows={rows} rowKey={(r) => r.label} minWidth={760}
                columns={[
                  { key: 'label', label: 'Section', render: (r) => <span className="font-semibold">{r.label}</span> },
                  { key: 'by', label: one ? 'Marked by' : 'Class teacher', render: (r) => <div><p className="text-ink2 leading-tight">{r.by}</p>{one && <p className={cx('text-[12px] tnum', r.slow ? 'text-warn font-semibold' : 'text-ink3')}>{isToday ? r.at : '8:5' + (hsh(r.label + per.from) % 9)} AM{r.slow ? ' · late marking' : ''}</p>}</div> },
                  { key: 'p', label: one ? 'Present' : 'Present on average', align: 'right', render: (r) => (one ? r.n - r.absD : Math.round(r.n - r.absD / n)) },
                  { key: 'ab', label: one ? 'Absent' : 'Days absent', align: 'right', render: (r) => <span>{r.absD}{r.lvD ? <span className="text-ink3 text-[12px]"> ({r.lvD} leave)</span> : ''}</span> },
                  { key: 'late', label: one ? 'Late' : 'Late marks', align: 'right', render: (r) => r.lateD },
                  { key: 'pct', label: '%', align: 'right', render: (r) => <span className={cx('font-semibold', r.pct < 90 && 'text-warn')}>{r.pct}%</span> },
                ]}
                mobile={(r) => ({ title: r.label, sub: one ? `${r.n - r.absD} of ${r.n} present${r.lateD ? ` · ${r.lateD} late` : ''}` : `${r.absD} days absent · ${r.lateD} late marks`, icon: r.pct < 90 ? 'TriangleAlert' : 'CalendarCheck2', iconTone: r.pct < 90 ? 'warn' : 'ok', right: <span className={cx('font-semibold tnum text-[14px]', r.pct < 90 && 'text-warn')}>{r.pct}%</span> })}
                footer={`${rows.length} of 43 sections · ${one ? `total ${T.n - T.ab} present, ${T.ab} absent` : `${T.ab} days absent over ${n} school days`}`} />
            </Card>
          </>
        )}

        {tab === 'month' && n > 0 && (
          <div className="grid @xl:grid-cols-2 gap-5 @lg:gap-6">
            <Card>
              <CardHead title={dayBars.length ? 'Day by day' : 'Month by month'} sub={dayBars.length ? `${n} school ${n === 1 ? 'day' : 'days'} · ${fmtRange(per)}` : 'These dates are longer than a month'} icon={I.ChartColumn} />
              <div className="px-5 pb-4"><Bars data={dayBars.length ? dayBars : monthBars} max={100} ticks={[0, 50, 90]} label={(v) => `${v}%`} ariaLabel="Attendance by day" /></div>
            </Card>
            <Card>
              <CardHead title="Month by month" sub="School average, this year" icon={I.ChartLine} />
              <div className="px-5 pb-4"><Bars data={monthBars} max={100} ticks={[0, 50, 90]} label={(v) => `${v}%`} ariaLabel="Attendance by month" /></div>
            </Card>
            <Card>
              <CardHead title="By class group" sub={`${per.label} · goal is 90%`} icon={I.CalendarCheck2} />
              <div className="px-5 pb-5"><HBars rows={ATT_BY_CLASS} goal={90} lowBelow={90} /></div>
            </Card>
            <Suggestion title="Class 9 fell this week" source="attendance marks for 5 to 9 Oct and the same week last year">
              Class 9 is at 86%, against 92% usually. Most absences are on Wednesday and Thursday, the days before the half-yearly. 9 B has 3 absent today, 9 C has 4. A short message to Class 9 parents about exam-week attendance may help; you decide whether to send it.
            </Suggestion>
          </div>
        )}

        {tab === 'chronic' && (
          <div className="grid @xl:grid-cols-2 gap-5 @lg:gap-6 items-start">
            <Card>
              <CardHead title="Absent 3 days in a row" sub="7, 8 and 9 Oct · class teacher and Principal told once" icon={I.UserX} action={<Pill tone="bad">{CHRONIC.length}</Pill>} />
              <ul className="px-2 pb-2">
                {CHRONIC.map((c) => (
                  <li key={c.name} className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
                    <Avatar name={c.name} size={38} />
                    <div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px] truncate">{c.name} <span className="text-ink3 font-normal">· {c.cls}</span></p><p className="text-[12.5px] text-ink3 truncate">{c.pct}% this year · {c.last}</p></div>
                    <MoreMenu size="sm" label={`Actions for ${c.name}`} items={[
                      ...(canEdit ? [['Phone', 'Call the parent', () => toast({ title: `Calling the parent of ${c.name}`, body: 'From the school phone', tone: 'info' })], ['HeartHandshake', 'Tell the counsellor', () => toast({ title: `Sana Ali told about ${c.name}`, body: 'She sees it in Behaviour & Counselling.' })]] : []),
                      ...(role.access.students ? [['User', 'Open profile', () => { const id = STUDENTS.find((s) => s.name === c.name)?.id; if (id) go('student', { id }); }]] : []),
                    ]} />
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHead title="Below 75% this year" sub="Parent, class teacher and Principal are told once when a student drops below" icon={I.TrendingDown} />
              <div className="px-5 pb-2"><Banner tone="ok" title="Nobody is below 75% right now.">The watch list below is students under 80%.</Banner></div>
              <ul className="px-2 pb-2">
                {WATCH.map((s) => <li key={s.id}><Row avatar={s.name} title={s.name} sub={`${s.cls} ${s.sec} · Roll ${s.roll}`} right={<span className="font-semibold tnum text-warn">{s.att}%</span>} onClick={role.access.students ? () => go('student', { id: s.id }) : undefined} /></li>)}
              </ul>
            </Card>
          </div>
        )}

        {tab === 'staff' && n > 0 && (
          <div className="grid @xl:grid-cols-2 gap-5 @lg:gap-6 items-start">
            {staffOk && (
              <Card>
                <CardHead title="Staff late" sub={`Times late · ${per.label} · late after 8:25 AM`} icon={I.Clock} />
                <div className="px-5 pb-5"><HBars rows={[{ k: 'Deepak Verma', v: 3 }, { k: 'Ramya Krishna', v: 3 }, { k: 'Kavya Sree', v: 2 }, { k: 'Neelima Rao', v: 2 }, { k: 'Vasudha Iyer', v: 2 }, { k: 'Sunil Kumar', v: 1 }].map((x) => ({ ...x, v: scale(x.v) }))} max={Math.max(5, scale(5))} unit="" labelWidth={118} /></div>
              </Card>
            )}
            <Card>
              <CardHead title="Students late" sub={`By class group · ${per.label} · late after 8:40 AM`} icon={I.Clock} />
              <div className="px-5 pb-5"><HBars rows={[{ k: 'Nur–UKG', v: 6 }, { k: '1–2', v: 9 }, { k: '3–4', v: 11 }, { k: '5–6', v: 14 }, { k: '7–8', v: 18 }, { k: '9', v: 12 }, { k: '10', v: 8 }].map((x) => ({ ...x, v: scale(x.v) }))} max={Math.max(20, scale(20))} unit="" /></div>
            </Card>
          </div>
        )}

        <Card>
          <CardHead title="All attendance reports" sub="Each one exports to Excel or PDF with the school name and filters on top" icon={I.FileText} />
          <ul className="px-2 pb-2 grid @lg:grid-cols-2 gap-x-2">
            {reports.map(([id, t, s2, ic]) => (
              <li key={t}><Row icon={ic} title={t} sub={s2} onClick={() => (id ? setTab(id) : setMake(t))} right={<I.ChevronRight size={18} className="text-ink3" />} /></li>
            ))}
          </ul>
        </Card>
      </div>
      <FormSheet open={!!make} onClose={() => setMake(null)} title={make || ''} sub="Holidays and Sundays are left out." submitLabel="Make report" busyLabel="Making…"
        onSubmit={() => toast({ title: `Ready: ${make}`, body: 'attendance-report.xlsx · logged in the export log' })}>
        <MakeReportFields staffOk={staffOk} />
      </FormSheet>
    </div>
  );
}

function MakeReportFields({ staffOk }) {
  const [who, setWho] = useState('7 B');
  const [per, setPer] = useState(PERIODS.thismonth);
  const [fmtx, setFmt] = useState('Excel');
  return (
    <>
      <Field label={staffOk ? 'Class, section or staff member' : 'Class or section'} id="mr-who" required><Select id="mr-who" value={who} onChange={setWho} options={['Whole school', '7 B', 'Class 7', ...(staffOk ? ['All staff', 'Teaching staff'] : [])]} /></Field>
      <Field label="Dates" id="mr-per" required hint={`${fmtRange(per)} · ${schoolDaysIn(per).length} school days`}><DatePeriod id="mr-per" value={per} onChange={setPer} className="w-full" /></Field>
      <Field label="Format" id="mr-fmt"><Segmented value={fmtx} onChange={setFmt} options={['Excel', 'CSV', 'PDF']} className="w-full" /></Field>
    </>
  );
}

/* =====================================================================================
   Devices & QR
   ===================================================================================== */

const DEVICES0 = [
  { id: 'D1', name: 'Main gate face scanner', serial: 'ZK-FA210-48213', type: 'Face recognition', loc: 'Main entrance', users: 'Students and staff', st: 'Active', last: '10:39 AM', got: 1164, rej: 9 },
  { id: 'D2', name: 'Staff room fingerprint', serial: 'ZK-K40-11807', type: 'Fingerprint', loc: 'Staff room, ground floor', users: 'Staff only', st: 'Active', last: '9:14 AM', got: 61, rej: 2 },
  { id: 'D3', name: 'Bus bay card reader', serial: 'ES-RF300-30922', type: 'RFID card', loc: 'Bus bay', users: 'Students only', st: 'Active', last: '8:41 AM', got: 93, rej: 1 },
  { id: 'D4', name: 'Boys’ hostel gate scanner', serial: 'ZK-FA210-48977', type: 'Face recognition', loc: 'Boys’ hostel gate', users: 'Students only', st: 'Offline', last: 'Yesterday, 7:58 PM', got: 0, rej: 0 },
  { id: 'D5', name: 'Girls’ hostel card reader', serial: 'ES-RF300-31045', type: 'RFID card', loc: 'Girls’ hostel gate', users: 'Students only', st: 'Never connected', last: 'Never', got: 0, rej: 0 },
];
const DEV_TONE = { Active: 'ok', Offline: 'bad', 'Never connected': 'warn', Inactive: 'neutral' };
const DEV_ICON = { 'Face recognition': 'ScanFace', Fingerprint: 'Fingerprint', 'RFID card': 'Nfc', Iris: 'Eye' };
const UNKNOWN = ['1043', '1057', '1102', '1118', '1121', '1133', '1140', '1152', '1167'].map((no, i) => {
  const s = STUDENTS.filter((x) => ['8', '9', '10'].includes(x.clsId))[i * 2];
  return { no, card: `0041 ${no}`, guess: s ? `${s.name}, ${s.clsId} ${s.sec}` : null };
});

function DevicesPage({ access }) {
  const toast = useToast();
  const canEdit = useCanEdit() && access === 'full';
  const [devs, setDevs] = useState(DEVICES0);
  const [q, setQ] = useState('');
  const [add, setAdd] = useState(false);
  const [key, setKey] = useState(null);
  const [regen, setRegen] = useState(null);
  const [health, setHealth] = useState(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapped, setMapped] = useState(false);
  const [guide, setGuide] = useState(null);
  const list = devs.filter((d) => !q || d.name.toLowerCase().includes(q.toLowerCase()) || d.loc.toLowerCase().includes(q.toLowerCase()) || d.serial.toLowerCase().includes(q.toLowerCase()));
  const got = devs.reduce((a, d) => a + d.got, 0) + (mapped ? 9 : 0);
  const rej = mapped ? 3 : 12;
  const setSt = (d, st, msg) => { const before = devs; setDevs(devs.map((x) => (x.id === d.id ? { ...x, st } : x))); toast({ title: msg, undo: () => setDevs(before) }); };
  return (
    <div>
      <AttHead sub="Biometric devices, QR check-in and the campus area for the app" actions={canEdit && <Button variant="primary" icon={I.Plus} onClick={() => setAdd(true)}>Add device</Button>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Stats items={[
          { label: 'Devices', value: `${devs.filter((d) => d.st === 'Active').length} of ${devs.length}`, sub: 'Active now', icon: 'ScanFace' },
          { label: 'Punches today', value: got.toLocaleString('en-IN'), sub: 'Accepted and counted', tone: 'ok', icon: 'CircleCheck' },
          { label: 'Rejected today', value: rej, sub: mapped ? '2 repeats, 1 outside the window' : '9 unknown users', tone: 'warn', icon: 'CircleX', onClick: () => setHealth(devs[0]) },
          { label: 'Users mapped', value: mapped ? '1,236 + 86' : '1,227 + 86', sub: mapped ? 'Every student and staff member' : '9 students not mapped yet', icon: 'Users' },
        ]} />
        {devs.some((d) => d.st === 'Offline') && (
          <Banner tone="bad" title="Boys’ hostel gate scanner is offline" action={<Button size="sm" variant="secondary" onClick={() => setHealth(devs.find((d) => d.st === 'Offline'))}>Check</Button>}>
            since 7:58 PM yesterday. Night roll-call punches may be missing; the warden marks by hand until it is back.
          </Banner>
        )}
        <Card className="overflow-hidden">
          <Toolbar>
            <SearchBox id="dv-search" value={q} onChange={setQ} placeholder="Device, place or serial number" />
            <div className="flex gap-2">
              <Button variant="secondary" icon={I.BookOpen} onClick={() => setGuide('ZKTeco')}>Setup guides</Button>
              {canEdit && !mapped && <Button variant="soft" icon={I.Link2} onClick={() => setMapOpen(true)}>Map 9 users</Button>}
            </div>
          </Toolbar>
          <DataList rows={list} rowKey={(d) => d.id} minWidth={820} onRow={(d) => setHealth(d)}
            columns={[
              { key: 'name', label: 'Device', render: (d) => <div className="flex items-center gap-3"><span className="w-9 h-9 rounded-xl bg-sunken text-ink2 grid place-items-center shrink-0">{React.createElement(I[DEV_ICON[d.type]], { size: 18 })}</span><div><p className="font-semibold leading-tight">{d.name}</p><p className="text-[12px] text-ink3 font-mono">{d.serial}</p></div></div> },
              { key: 'type', label: 'Type' },
              { key: 'loc', label: 'Location', render: (d) => <div><p className="leading-tight">{d.loc}</p><p className="text-[12px] text-ink3">Kukatpally campus</p></div> },
              { key: 'users', label: 'Allowed users' },
              { key: 'st', label: 'Status', render: (d) => <div><Pill tone={DEV_TONE[d.st]} dot={d.st === 'Active'}>{d.st}</Pill><p className="text-[11.5px] text-ink3 mt-0.5 whitespace-nowrap">Last punch {d.last}</p></div> },
              { key: 'm', label: '', render: (d) => <div onClick={(e) => e.stopPropagation()}><MoreMenu size="sm" label={`Actions for ${d.name}`} items={[
                ['Activity', 'Sync and health check', () => setHealth(d)],
                ...(canEdit ? [['KeyRound', 'Regenerate key', () => setRegen(d)], ['Pencil', 'Edit', () => toast({ title: `Editing ${d.name}`, body: 'Name, location, allowed users and connection', tone: 'info' })],
                  d.st === 'Inactive' ? ['Power', 'Make active', () => setSt(d, 'Active', `${d.name} is active again`)] : ['Power', 'Deactivate', () => setSt(d, 'Inactive', `${d.name} deactivated. Its punches are refused.`)],
                  ['Archive', 'Archive', () => { const before = devs; setDevs(devs.filter((x) => x.id !== d.id)); toast({ title: `${d.name} archived`, body: 'Its old punches stay in the records.', undo: () => setDevs(before) }); }, 'bad']] : []),
              ]} /></div> },
            ]}
            mobile={(d) => ({ icon: DEV_ICON[d.type], iconTone: DEV_TONE[d.st] === 'neutral' ? 'neutral' : DEV_TONE[d.st], title: d.name, sub: `${d.loc} · last punch ${d.last}`, right: <Pill tone={DEV_TONE[d.st]} className="!h-[22px] !text-[11.5px]">{d.st}</Pill> })}
            footer={`Showing ${list.length} of ${devs.length} devices`} />
        </Card>

        <div className="grid @xl:grid-cols-2 gap-5 @lg:gap-6 items-start">
          <QrCard canEdit={canEdit} />
          <PosterCard />
          <GeoCard canEdit={canEdit} />
          <Card>
            <CardHead title="Punch checks" sub="A punch counts only when all of these pass" icon={I.ShieldCheck} />
            <ul className="px-5 pb-5 flex flex-col gap-2.5 text-[14px]">
              {['The device is active', 'The person is mapped and allowed on that device', 'The time is inside the attendance window (6:00 AM to 7:00 PM)', 'It is not a repeat within 2 minutes', 'For QR: right school, today’s session and inside the campus area'].map((x) => (
                <li key={x} className="flex gap-2.5"><I.CircleCheck size={18} className="text-ok shrink-0 mt-0.5" />{x}</li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <AddDeviceSheet open={add} onClose={() => setAdd(false)} onSaved={(d) => { setDevs([...devs, d]); setKey({ d, k: 'sos_live_9f3K2mQ7xT4vB8nR1cW6' }); }} />
      <Sheet open={!!key} onClose={() => setKey(null)} title="Device key" sub={key ? `For ${key.d.name}. Shown only now.` : ''}
        footer={<Button variant="primary" onClick={() => setKey(null)}>I have copied it</Button>}>
        {key && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded-xl bg-sunken px-3.5 py-3"><code className="font-mono text-[13px] flex-1 break-all select-all">{key.k}</code><Button size="sm" variant="secondary" icon={I.Copy} onClick={() => toast({ title: 'Key copied', body: 'Paste it in the device’s server settings.' })}>Copy</Button></div>
            <p className="text-[13px] text-ink3">Type it into the device once. If it is ever lost or seen by someone else, regenerate it; the old key stops working at once.</p>
          </div>
        )}
      </Sheet>
      <ConfirmSheet open={!!regen} onClose={() => setRegen(null)} danger typeToConfirm={regen?.name} title={`Regenerate the key for ${regen?.name}?`} confirmLabel="Regenerate key"
        onConfirm={() => setKey({ d: regen, k: 'sos_live_Hq8wE2pL5zN9rY3dJ7tA' })}>
        <p className="text-[14px] text-ink2">The old key stops working now. The device sends no punches until the new key is typed into it.</p>
      </ConfirmSheet>
      <HealthSheet d={health} mapped={mapped} onClose={() => setHealth(null)} onMap={canEdit && !mapped ? () => { setHealth(null); setMapOpen(true); } : null} />
      <MapUsersSheet open={mapOpen} onClose={() => setMapOpen(false)} onSave={() => { setMapped(true); setMapOpen(false); toast({ title: 'Mapped 9 users and re-ran today’s sync', body: '9 punches accepted. Those students are now present.' }); }} />
      <Sheet open={!!guide} onClose={() => setGuide(null)} title="Setup guides" sub="For the devices the school uses"
        footer={<Button variant="ghost" onClick={() => setGuide(null)}>Close</Button>}>
        <div className="flex flex-col gap-4">
          <Segmented value={guide || 'ZKTeco'} onChange={setGuide} options={['ZKTeco', 'eSSL', 'Other (API)']} className="w-full" />
          <ol className="flex flex-col gap-2.5 text-[14px] text-ink2 list-decimal pl-5">
            {guide === 'Other (API)' ? ['Add the device here and copy its key.', 'Send each punch to the School OS punch address with the key, the device user number and the time.', 'Use the test button on this page to see the punch arrive.'].map((x) => <li key={x}>{x}</li>)
              : [`On the ${guide} device, open Comm settings, then Cloud server.`, 'Server address: punch.schoolos.in · port 443 · turn on HTTPS.', 'Paste the device key from this page.', 'Restart the device. Its status here turns Active after the first punch.'].map((x) => <li key={x}>{x}</li>)}
          </ol>
        </div>
      </Sheet>
    </div>
  );
}

function AddDeviceSheet({ open, onClose, onSaved }) {
  const [f, setF] = useState({ name: '', serial: '', loc: '', type: 'Face recognition', users: 'Students and staff', ip: '' });
  const [more, setMore] = useState(false);
  const [tried, setTried] = useState(false);
  const set = (k, v) => setF({ ...f, [k]: v });
  const dup = DEVICES0.some((d) => d.serial.toLowerCase() === f.serial.trim().toLowerCase());
  const err = { name: !f.name.trim() ? 'Give the device a name people know' : '', serial: !f.serial.trim() ? 'Type the serial number from the back of the device' : dup ? 'Another device already has this serial number' : '' };
  return (
    <FormSheet open={open} onClose={() => { onClose(); setTried(false); }} title="Add device" submitLabel="Add device"
      onSubmit={() => { setTried(true); if (err.name || err.serial) return false; onSaved({ id: 'D' + Date.now(), name: f.name.trim(), serial: f.serial.trim().toUpperCase(), type: f.type, loc: f.loc || 'Not set', users: f.users, st: 'Never connected', last: 'Never', got: 0, rej: 0 }); setF({ name: '', serial: '', loc: '', type: 'Face recognition', users: 'Students and staff', ip: '' }); setTried(false); }}>
      <Field label="Device name" id="ad-name" required error={tried && err.name}><Input id="ad-name" value={f.name} onChange={(e) => set('name', e.target.value)} error={tried && err.name} placeholder="Main gate scanner" /></Field>
      <Field label="Device ID or serial number" id="ad-serial" required error={tried && err.serial}><Input id="ad-serial" value={f.serial} onChange={(e) => set('serial', e.target.value)} error={tried && err.serial} className="font-mono" placeholder="ZK-FA210-50122" /></Field>
      <div className="grid @sm:grid-cols-2 gap-3">
        <Field label="Location" id="ad-loc"><Input id="ad-loc" value={f.loc} onChange={(e) => set('loc', e.target.value)} placeholder="Main entrance" /></Field>
        <Field label="Campus" id="ad-campus" required><Select id="ad-campus" value="kph" onChange={() => {}} options={[{ value: 'kph', label: 'Kukatpally' }]} /></Field>
      </div>
      <Field label="Device type" id="ad-type" required><Select id="ad-type" value={f.type} onChange={(v) => set('type', v)} options={['Face recognition', 'RFID card', 'Fingerprint', 'Iris']} /></Field>
      <Field label="Allowed users" id="ad-users" required><Segmented value={f.users} onChange={(v) => set('users', v)} options={[{ value: 'Students only', label: 'Students' }, { value: 'Staff only', label: 'Staff' }, { value: 'Students and staff', label: 'Both' }]} className="w-full" /></Field>
      <button type="button" onClick={() => setMore(!more)} className="self-start text-[13.5px] font-semibold text-brand inline-flex items-center gap-1">More details<I.ChevronDown size={15} className={cx('transition', more && 'rotate-180')} /></button>
      {more && <Field label="Connection" id="ad-ip" hint="IP address, or leave empty when the device sends punches to the cloud"><Input id="ad-ip" value={f.ip} onChange={(e) => set('ip', e.target.value)} placeholder="192.168.1.40" className="tnum" /></Field>}
    </FormSheet>
  );
}

function HealthSheet({ d, mapped, onClose, onMap }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!d) return null;
  const main = d.id === 'D1';
  return (
    <Sheet open onClose={onClose} title={d.name} sub={`${d.type} · ${d.loc} · ${d.serial}`}
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button><Button variant="secondary" icon={I.RefreshCw} loading={busy} onClick={() => { setBusy(true); setTimeout(() => { setBusy(false); toast({ title: d.st === 'Active' ? 'Synced. Nothing new since 10:39 AM.' : `${d.name} did not answer`, body: d.st === 'Active' ? undefined : 'Check its power and network cable. The warden has been told.', tone: d.st === 'Active' ? 'ok' : 'bad' }); }, 900); }}>Sync now</Button></>}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2">
          {[['Status', d.st], ['Accepted today', d.got], ['Rejected', main && mapped ? 0 : d.rej]].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-sunken/70 px-3 py-2.5 min-w-0"><p className="text-[12px] text-ink3 font-semibold">{k}</p><p className="font-semibold text-[16px] tnum truncate">{v}</p></div>
          ))}
        </div>
        <DL cols={1} rows={[['Last punch', d.last], ['Last sync', d.st === 'Active' ? 'Today, 10:40 AM' : d.st === 'Offline' ? 'Yesterday, 7:58 PM' : 'Never'], ['Allowed users', d.users]]} />
        {d.rej > 0 && !(main && mapped) && (
          <div>
            <p className="eyebrow text-ink3 mb-2">Rejected punches</p>
            <ul className="rounded-xl border border-line divide-y divide-line/70 text-[14px]">
              {(main ? [['9 unknown users', 'Device numbers 1043, 1057, 1102 and 6 more'], ['8:02 AM · 1176', 'Not mapped'], ['8:03 AM · 1043', 'Not mapped']] : d.id === 'D2' ? [['8:19 AM · Deepika Rao', 'Repeat within 2 minutes'], ['9:14 AM · Deepak Verma', 'Repeat within 2 minutes']] : [['6:02 AM · card 0041 0877', 'Outside the attendance window']]).map(([a, b]) => (
                <li key={a} className="flex items-center justify-between gap-3 px-3.5 py-2.5"><span className="font-medium">{a}</span><span className="text-ink3 text-[13px] text-right">{b}</span></li>
              ))}
            </ul>
            {main && onMap && <Button className="mt-3" variant="soft" icon={I.Link2} onClick={onMap}>Map these users</Button>}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function MapUsersSheet({ open, onClose, onSave }) {
  const [m, setM] = useState(() => Object.fromEntries(UNKNOWN.map((u) => [u.no, u.guess || ''])));
  const done = Object.values(m).filter(Boolean).length;
  return (
    <Sheet open={open} onClose={onClose} title="Map device users" sub="Matched by RFID card number where possible. Check each one." wide
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={I.Check} disabled={!done} onClick={onSave}>Save {done} and re-run today’s sync</Button></>}>
      <ul className="flex flex-col divide-y divide-line/70">
        {UNKNOWN.map((u) => (
          <li key={u.no} className="py-2.5 flex flex-col @sm:flex-row @sm:items-center gap-2">
            <div className="@sm:w-44 shrink-0"><p className="font-semibold text-[14px]">User {u.no}</p><p className="text-[12px] text-ink3 font-mono">Card {u.card}</p></div>
            <Select id={`mu-${u.no}`} value={m[u.no]} onChange={(v) => setM({ ...m, [u.no]: v })} className="flex-1" options={[{ value: '', label: 'Not matched' }, ...(u.guess ? [{ value: u.guess, label: `${u.guess} · matched by card` }] : []), { value: 'Visitor card', label: 'Visitor card (ignore)' }]} />
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

function QrCard({ canEdit }) {
  const toast = useToast();
  const [stu, setStu] = useState(false);
  const [stf, setStf] = useState(true);
  const [mode, setMode] = useState('day');
  const [scope, setScope] = useState('campus');
  const save = (msg) => toast({ title: msg, body: 'Saved. Recorded in the audit log.' });
  return (
    <Card>
      <CardHead title="QR check-in" sub="People scan the poster with the School OS app" icon={I.QrCode} />
      <div className="divide-y divide-line/70 border-t border-line/70">
        <SettingRow id="qr-stu" title="For students" sub="Off: students are marked by teachers and the gate scanner"><Switch id="qr-stu" on={stu} label="QR for students" onChange={(v) => { if (!canEdit) return; setStu(v); save(`QR for students: ${v ? 'on' : 'off'}`); }} /></SettingRow>
        <SettingRow id="qr-stf" title="For staff" sub="In the staff room, 7:30 to 9:30 AM"><Switch id="qr-stf" on={stf} label="QR for staff" onChange={(v) => { if (!canEdit) return; setStf(v); save(`QR for staff: ${v ? 'on' : 'off'}`); }} /></SettingRow>
        <div className="px-5 py-3.5 flex flex-col gap-2">
          <p className="text-[14px] font-semibold">The QR code changes</p>
          <Segmented size="sm" value={mode} onChange={(v) => { if (!canEdit) return; setMode(v); save('QR change setting saved'); }} options={[{ value: 'fixed', label: 'Never' }, { value: 'day', label: 'Every day' }, { value: 'session', label: 'Every session' }]} className="w-full" />
          <p className="text-[12.5px] text-ink3">A printed poster still works when it changes every day: the app checks today’s code on the screen beside it.</p>
        </div>
        <div className="px-5 py-3.5 flex flex-col gap-2">
          <p className="text-[14px] font-semibold">Where it works</p>
          <Segmented size="sm" value={scope} onChange={(v) => { if (!canEdit) return; setScope(v); save('QR scope saved'); }} options={[{ value: 'school', label: 'Whole school' }, { value: 'campus', label: 'Kukatpally campus' }]} className="w-full" />
        </div>
        <SettingRow title="Valid" sub="Scans outside this time are refused"><span className="text-[14px] font-semibold tnum">7:30 – 9:30 AM</span></SettingRow>
        <SettingRow title="Repeats" sub="“Already marked at 8:02 AM” shows on the phone"><span className="text-[14px] font-semibold">Blocked</span></SettingRow>
      </div>
    </Card>
  );
}

// Poster themes drawn from the theme tokens (Royal Purple is a mix of the info and bad tokens), so they work in light and dark
const POSTER = { ocean: { name: 'Ocean Blue', bg: 'bg-info', fg: 'text-bg' }, purple: { name: 'Royal Purple', bg: '', fg: 'text-bg', style: { background: 'color-mix(in srgb, rgb(var(--info)) 55%, rgb(var(--bad)))' } }, forest: { name: 'Forest Green', bg: 'bg-ok', fg: 'text-bg' } };
function QrArt({ size = 132 }) {
  const n = 25; const c = size / n; const cells = [];
  const finder = (x, y) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let on;
    if (finder(x, y)) { const fx = x >= n - 7 ? x - (n - 7) : x; const fy = y >= n - 7 ? y - (n - 7) : y; on = fx === 0 || fx === 6 || fy === 0 || fy === 6 || (fx >= 2 && fx <= 4 && fy >= 2 && fy <= 4); }
    else on = ((x * 7 + y * 13 + x * y * 3) % 5) < 2;
    if (on) cells.push(<rect key={`${x}-${y}`} x={x * c} y={y * c} width={c + 0.2} height={c + 0.2} />);
  }
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label="QR code" role="img" className="fill-current">{cells}</svg>;
}
function PosterCard() {
  const toast = useToast();
  const [t, setT] = useState('ocean');
  const p = POSTER[t];
  return (
    <Card>
      <CardHead title="QR poster" sub="School name, the QR code and short steps. No personal data." icon={I.Printer}
        action={<Button size="sm" variant="secondary" icon={I.FileDown} onClick={() => toast({ title: 'Saved: QR-poster-staff-room.pdf', body: `${p.name} · A4 · print it at the staff room door` })}>PDF</Button>} />
      <div className="px-5 pb-5 flex flex-col gap-4">
        <Segmented size="sm" value={t} onChange={setT} options={[{ value: 'ocean', label: 'Ocean Blue' }, { value: 'purple', label: 'Royal Purple' }, { value: 'forest', label: 'Forest Green' }]} className="w-full" />
        <div className="mx-auto w-full max-w-[280px] rounded-2xl border border-line overflow-hidden shadow-card bg-surface">
          <div className={cx('px-4 py-3 text-center', p.bg, p.fg)} style={p.style}>
            <p className="font-display font-semibold text-[16px] leading-tight">Sunrise Public School</p>
            <p className="text-[11.5px] opacity-85">Kukatpally, Hyderabad</p>
          </div>
          <div className="px-4 py-4 flex flex-col items-center gap-3">
            <p className="font-semibold text-[14px]">Staff attendance</p>
            <div className="p-2.5 rounded-xl border border-line text-ink"><QrArt /></div>
            <ol className="text-[12px] text-ink2 list-decimal pl-4 self-stretch flex flex-col gap-0.5">
              <li>Open the School OS app</li><li>Tap Check in</li><li>Point the camera here</li>
            </ol>
          </div>
          <div className={cx('h-2', p.bg)} style={p.style} />
        </div>
      </div>
    </Card>
  );
}

function GeoCard({ canEdit }) {
  const toast = useToast();
  const [r, setR] = useState('50');
  const [lat, setLat] = useState('17.49331');
  const [lng, setLng] = useState('78.39862');
  const [stf, setStf] = useState(true);
  const [stu, setStu] = useState(false);
  const rn = Number(r);
  const err = !rn || rn < 25 ? 'At least 25 m' : rn > 1000 ? 'At most 1,000 m' : '';
  const px = Math.max(18, Math.min(80, rn * 0.9));
  return (
    <Card>
      <CardHead title="Campus area" sub="App check-in works only inside this circle" icon={I.MapPin} />
      <div className="px-5 pb-5 flex flex-col gap-4">
        <div className="relative h-44 rounded-xl bg-sunken overflow-hidden border border-line" aria-label="Map of the campus area" role="img">
          <svg className="absolute inset-0 w-full h-full" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => <line key={'h' + i} x1="0" x2="100%" y1={i * 22} y2={i * 22} style={{ stroke: 'rgb(var(--line))' }} />)}
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((i) => <line key={'v' + i} y1="0" y2="100%" x1={i * 26} x2={i * 26} style={{ stroke: 'rgb(var(--line))' }} />)}
            <path d="M0 120 C 120 100, 200 150, 600 110" fill="none" strokeWidth="10" style={{ stroke: 'rgb(var(--surface))' }} />
          </svg>
          <span className="absolute left-3 bottom-2 text-[11px] text-ink3 font-semibold">KPHB Colony Road</span>
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/15 border-2 border-brand" style={{ width: px * 2, height: px * 2 }} />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full text-brand"><I.MapPin size={26} fill="currentColor" className="text-brand" /></span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Latitude" id="geo-lat"><Input id="geo-lat" value={lat} onChange={(e) => setLat(e.target.value)} className="tnum" readOnly={!canEdit} /></Field>
          <Field label="Longitude" id="geo-lng"><Input id="geo-lng" value={lng} onChange={(e) => setLng(e.target.value)} className="tnum" readOnly={!canEdit} /></Field>
        </div>
        <div className="flex flex-col @sm:flex-row gap-3 @sm:items-end">
          <Field label="Radius in metres" id="geo-r" error={err} hint={!err ? 'Default 50 m. The smallest is 25 m.' : undefined} className="flex-1"><Input id="geo-r" inputMode="numeric" value={r} onChange={(e) => setR(e.target.value.replace(/\D/g, '').slice(0, 4))} error={err} className="tnum" readOnly={!canEdit} /></Field>
          {canEdit && <Button variant="secondary" icon={I.LocateFixed} onClick={() => { setLat('17.49335'); setLng('78.39859'); toast({ title: 'Filled from your current location', body: '17.49335, 78.39859 · accurate to 8 m' }); }}>Use my current location</Button>}
        </div>
        <div className="rounded-xl border border-line divide-y divide-line/70">
          <SettingRow id="geo-stf" title="For staff" sub="“You are 300 m from school” shows when outside"><Switch id="geo-stf" on={stf} label="Campus area for staff" onChange={(v) => { if (!canEdit) return; setStf(v); toast({ title: `Campus area for staff: ${v ? 'on' : 'off'}` }); }} /></SettingRow>
          <SettingRow id="geo-stu" title="For students" sub="Off: students do not check in on the app"><Switch id="geo-stu" on={stu} label="Campus area for students" onChange={(v) => { if (!canEdit) return; setStu(v); toast({ title: `Campus area for students: ${v ? 'on' : 'off'}` }); }} /></SettingRow>
        </div>
      </div>
    </Card>
  );
}

/* =====================================================================================
   Attendance Settings
   ===================================================================================== */

const STATUSES = [
  { k: 'P', n: 'Present', c: 'bg-ok/15 text-ok', counts: 'Present' }, { k: 'A', n: 'Absent', c: 'bg-bad text-white', counts: 'Absent' },
  { k: 'L', n: 'Late', c: 'bg-warn/20 text-warn', counts: 'Present' }, { k: 'H', n: 'Half-day', c: 'bg-warn/12 text-warn', counts: 'Half' },
  { k: 'E', n: 'Excused', c: 'bg-sunken text-ink2', counts: 'Not counted' }, { k: 'Lv', n: 'Leave', c: 'bg-info/15 text-info', counts: 'Not counted' },
  { k: 'M', n: 'Medical', c: 'bg-info/10 text-info', counts: 'Not counted' }, { k: 'SD', n: 'Sports duty (school’s own)', c: 'bg-brand/12 text-brand', counts: 'Present' },
];
const METHODS = [['Register (by hand)', true, true], ['Mobile app', false, true], ['QR code', false, true], ['Device', true, true], ['Campus area', false, true]];

function AttSettingsPage({ access }) {
  const toast = useToast();
  const { go } = useNav();
  const canEdit = useCanEdit() && access === 'full';
  const [tab, setTab] = useState('punch');
  const [method, setMethod] = useState('day');
  const [m, setM] = useState(METHODS);
  const [def, setDef] = useState('Present');
  const [order, setOrder] = useState('roll');
  const [lock, setLock] = useState(false);
  const [wa, setWa] = useState(true);
  const [sms, setSms] = useState(true);
  const [delay, setDelay] = useState('15');
  const [quota, setQuota] = useState(true);
  const save = (t) => toast({ title: t, body: 'Saved. Recorded in the audit log.' });
  return (
    <div>
      <AttHead sub="How attendance is taken, when it locks, and who is told" />
      <div className="flex flex-col gap-5 @lg:gap-6 max-w-5xl">
        <Chips value={tab} onChange={setTab} options={[{ value: 'punch', label: 'Punch methods' }, { value: 'display', label: 'Display and register' }, { value: 'late', label: 'Late rules and lock' }, { value: 'alerts', label: 'Alerts' }, { value: 'leave', label: 'Student leave' }]} />

        {tab === 'punch' && (
          <>
            <Card>
              <CardHead title="Attendance method" sub="For students" icon={I.ListChecks} />
              <div className="px-5 pb-5 flex flex-col gap-2">
                <Segmented value={method} onChange={(v) => { if (!canEdit) return; setMethod(v); save(v === 'day' ? 'Students: once a day' : 'Students: every period'); }} options={[{ value: 'day', label: 'Once a day' }, { value: 'period', label: 'Every period' }]} className="w-full @md:w-auto" />
                <p className="text-[12.5px] text-ink3">{method === 'day' ? 'The class teacher marks once in the morning.' : 'Each subject teacher marks their period. The first period decides the absence message.'}</p>
              </div>
            </Card>
            <Card className="overflow-hidden">
              <CardHead title="Which methods are on" sub="Details for devices, QR and the campus area are on Devices & QR" icon={I.ScanFace}
                action={<Button size="sm" variant="ghost" onClick={() => go('attendance', { page: 'devices' })}>Devices & QR</Button>} />
              <table className="w-full text-[14px]">
                <thead><tr className="text-[12px] text-ink3 border-y border-line"><th className="text-left font-semibold px-5 py-2.5">Method</th><th className="font-semibold px-3 py-2.5 w-24">Students</th><th className="font-semibold px-5 py-2.5 w-24">Staff</th></tr></thead>
                <tbody>
                  {m.map(([n, a, b], i) => (
                    <tr key={n} className="border-b border-line/70 last:border-0">
                      <td className="px-5 py-3 font-medium">{n}</td>
                      {[a, b].map((on, j) => (
                        <td key={j} className="px-3 py-3"><div className="flex justify-center"><Switch id={`mt-${i}-${j}`} on={on} label={`${n} for ${j ? 'staff' : 'students'}`} onChange={(v) => { if (!canEdit) return; setM(m.map((x, k) => (k === i ? (j ? [x[0], x[1], v] : [x[0], v, x[2]]) : x))); save(`${n} for ${j ? 'staff' : 'students'}: ${v ? 'on' : 'off'}`); }} /></div></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <SettingsCard title="Without internet" icon={I.CloudOff}
              rows={[{ title: 'Offline mode', sub: 'Take Attendance saves on the phone and sends when the internet is back. The teacher sees “Waiting to send”.', on: true }]} />
          </>
        )}

        {tab === 'display' && (
          <>
            <Card className="overflow-hidden">
              <CardHead title="Status list" sub="Letter, colour and how each status counts in the %" icon={I.Palette}
                action={canEdit && <Button size="sm" variant="soft" icon={I.Plus} onClick={() => toast({ title: 'Add a status', body: 'Name, letter, colour and how it counts', tone: 'info' })}>Add status</Button>} />
              <ul className="divide-y divide-line/70 border-t border-line/70">
                {STATUSES.map((s) => (
                  <li key={s.k} className="flex items-center gap-3 px-5 py-2.5">
                    <span className={cx('w-9 h-8 rounded-md grid place-items-center text-[12px] font-bold shrink-0', s.c)}>{s.k}</span>
                    <span className="flex-1 min-w-0 text-[14px] font-medium truncate">{s.n}</span>
                    <Pill tone={s.counts === 'Present' ? 'ok' : s.counts === 'Absent' ? 'bad' : s.counts === 'Half' ? 'warn' : 'neutral'}>{s.counts === 'Half' ? 'Counts half' : s.counts === 'Not counted' ? 'Not counted' : `Counts ${s.counts.toLowerCase()}`}</Pill>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHead title="Take Attendance and the register" icon={I.Table2} />
              <div className="divide-y divide-line/70 border-t border-line/70">
                <div className="px-5 py-3.5 flex flex-col @md:flex-row @md:items-center gap-2"><div className="flex-1"><p className="font-semibold text-[14px]">Everyone starts as</p><p className="text-[12.5px] text-ink3">Teachers then tap only the exceptions</p></div><Segmented size="sm" value={def} onChange={(v) => { if (!canEdit) return; setDef(v); save(`Everyone starts as: ${v}`); }} options={['Present', 'Not marked']} /></div>
                <div className="px-5 py-3.5 flex flex-col @md:flex-row @md:items-center gap-2"><div className="flex-1"><p className="font-semibold text-[14px]">Order students by</p><p className="text-[12.5px] text-ink3">In Take Attendance and the register</p></div><Segmented size="sm" value={order} onChange={(v) => { if (!canEdit) return; setOrder(v); save(`Order by ${v === 'roll' ? 'roll number' : 'name'}`); }} options={[{ value: 'roll', label: 'Roll number' }, { value: 'name', label: 'Name' }]} /></div>
                <ToggleRow id="dr-photo" title="Show photos" sub="Helps new teachers know the class" on />
              </div>
            </Card>
          </>
        )}

        {tab === 'late' && (
          <>
            <Card>
              <CardHead title="Lock time" sub="After this, marks change only through a correction" icon={I.Lock} action={canEdit && <Button size="sm" variant="ghost" onClick={() => setLock(true)}>Change</Button>} />
              <div className="px-5 pb-5 flex items-center gap-4">
                <span className="font-display text-[32px] font-semibold tnum leading-none">11:00 AM</span>
                <p className="text-[13px] text-ink3">Today’s attendance locks in 18 minutes. Teachers see “You can change it until 11:00 AM”.</p>
              </div>
              <div className="border-t border-line/70 px-5 py-3.5">
                <p className="font-semibold text-[14px]">Who can change marks after the lock</p>
                <p className="text-[12.5px] text-ink3 mb-2.5">Everyone else sends a correction request to Approvals. The original stays in the audit log.</p>
                <div className="flex gap-2 flex-wrap">{['Lakshmi Rao · Principal', 'Srinivas Murthy · Vice Principal'].map((p) => <span key={p} className="inline-flex items-center gap-2 h-9 pl-1.5 pr-3 rounded-full border border-line text-[13px] font-medium"><Avatar name={p} size={26} />{p}</span>)}{canEdit && <Button size="sm" variant="ghost" icon={I.Plus} onClick={() => toast({ title: 'Add a person', body: 'Pick from staff with Full access to Attendance', tone: 'info' })}>Add</Button>}</div>
              </div>
            </Card>
            <SettingsCard title="Late rules" sub="One rule for devices, QR and marking by hand" icon={I.Clock}
              rows={[{ title: 'Students are late after', sub: 'School starts 8:30 AM · 10 minutes grace', value: '8:40 AM' }, { title: 'Staff are late after', sub: 'Staff start 8:15 AM · 10 minutes grace', value: '8:25 AM' }, { title: 'Staff half day', sub: 'In after this time, or out before 1:00 PM', value: '11:00 AM' }]} />
          </>
        )}

        {tab === 'alerts' && (
          <>
            <Card>
              <CardHead title="Absence message to parents" sub="One message per absent student per day. None for approved leave." icon={I.MessageCircle} />
              <div className="divide-y divide-line/70 border-t border-line/70">
                <ToggleRow id="al-on" title="Send absence messages" on />
                <div className="px-5 py-3.5 flex flex-col gap-2.5">
                  <p className="font-semibold text-[14px]">Channels</p>
                  <label htmlFor="al-wa" className="flex items-center gap-2.5 text-[14px]"><Checkbox id="al-wa" checked={wa} onChange={(v) => { if (!canEdit) return; setWa(v); save(`WhatsApp: ${v ? 'on' : 'off'}`); }} label="WhatsApp" />WhatsApp first</label>
                  <label htmlFor="al-sms" className="flex items-center gap-2.5 text-[14px]"><Checkbox id="al-sms" checked={sms} onChange={(v) => { if (!canEdit) return; setSms(v); save(`SMS backup: ${v ? 'on' : 'off'}`); }} label="SMS" />SMS if WhatsApp is not delivered in 10 minutes</label>
                </div>
                <div className="px-5 py-3.5 flex flex-col @md:flex-row @md:items-center gap-2">
                  <div className="flex-1"><p className="font-semibold text-[14px]">Wait before sending</p><p className="text-[12.5px] text-ink3">So a teacher’s quick correction does not send a wrong message</p></div>
                  <Select id="al-delay" value={delay} onChange={(v) => { if (!canEdit) return; setDelay(v); save(`Wait ${v} minutes before sending`); }} className="@md:w-44" options={[{ value: '0', label: 'Send at once' }, { value: '10', label: '10 minutes' }, { value: '15', label: '15 minutes' }, { value: '30', label: '30 minutes' }]} />
                </div>
                <div className="px-5 py-4">
                  <p className="eyebrow text-ink3 mb-2">Message parents get</p>
                  <div className="rounded-2xl rounded-tl-md bg-ok/10 px-4 py-3 text-[14px] leading-relaxed max-w-md">
                    Dear Parent, <b className="font-semibold">{FEATURED.name}</b> of Class 7 B is absent today, Fri 9 Oct. If this is unexpected, please call the school on 040 2305 6789. — Sunrise Public School
                    <p className="text-[11px] text-ink3 text-right mt-1">WhatsApp · Absence template</p>
                  </div>
                  {canEdit && <Button className="mt-3" size="sm" variant="ghost" icon={I.Pencil} onClick={() => go('communication', { page: 'templates' })}>Edit in Message Templates</Button>}
                </div>
              </div>
            </Card>
            <SettingsCard title="Other alerts" icon={I.BellRing}
              rows={[
                { title: 'Late-arrival message', sub: 'To the parent when a student is marked late', on: true },
                { title: 'Below 75% this year', sub: 'Parent, class teacher and Principal, once when a student drops below', on: true },
                { title: 'Absent 3 days in a row', sub: 'Class teacher, Principal and the counsellor', on: true },
                { title: 'Classes not marked by 9:15 AM', sub: 'Reminder to the class teacher, then the Vice Principal', on: true },
              ]} />
          </>
        )}

        {tab === 'leave' && (
          <>
            <Card>
              <CardHead title="Student leave types" sub="Who approves is set in Settings, Forms & Approvals" icon={I.CalendarDays}
                action={canEdit && <Button size="sm" variant="soft" icon={I.Plus} onClick={() => toast({ title: 'Add a leave type', body: 'For example Religious festival', tone: 'info' })}>Add type</Button>} />
              <ul className="px-2 pb-2">{TYPES.map((t) => <li key={t}><Row icon="CalendarDays" title={t} sub={t === 'Family event' ? 'School’s own type' : 'Standard type'} /></li>)}</ul>
              <div className="px-5 pb-4"><Button size="sm" variant="ghost" icon={I.ArrowRight} onClick={() => go('settings', { page: 'forms' })}>Forms & Approvals</Button></div>
            </Card>
            <Card className="overflow-hidden">
              <CardHead title="Leave quotas" sub="A limit per leave type, as in the old software" icon={I.Scale} />
              <div className="border-t border-line/70"><SettingRow id="lq-on" title="Use leave quotas" sub="Shown while recording leave: “Medical: 4 of 6 days left this term”"><Switch id="lq-on" on={quota} label="Use leave quotas" onChange={(v) => { if (!canEdit) return; setQuota(v); save(`Leave quotas: ${v ? 'on' : 'off'}`); }} /></SettingRow></div>
              {quota && (
                <>
                  <ul className="divide-y divide-line/70 border-t border-line/70">
                    {Object.entries(QUOTA).map(([t, [n, per]]) => (
                      <li key={t} className="flex items-center gap-3 px-5 py-3"><span className="flex-1 text-[14px] font-medium">{t}</span><span className="text-[14px] font-semibold tnum">{n} days a {per}</span>{canEdit && <Button size="sm" variant="ghost" onClick={() => toast({ title: `Change the ${t.toLowerCase()} quota`, tone: 'info' })}>Change</Button>}</li>
                    ))}
                  </ul>
                  <div className="border-t border-line/70"><ToggleRow id="lq-over" title="Going over the quota needs the Principal" sub="Even when it is within the class teacher’s limit" on /></div>
                </>
              )}
            </Card>
          </>
        )}
      </div>
      <FormSheet open={lock} onClose={() => setLock(false)} title="Change the lock time" sub="From tomorrow. Today stays at 11:00 AM." submitLabel="Save lock time" onSubmit={() => toast({ title: 'Lock time saved', body: 'From Sat 10 Oct. Teachers see the new time in Take Attendance.' })}>
        <LockFields />
      </FormSheet>
    </div>
  );
}

function LockFields() {
  const [v, setV] = useState('11:00 AM');
  const ok = /^\d{1,2}:\d{2} (AM|PM)$/.test(v.trim());
  return <Field label="Lock time" id="lk-t" required error={!ok ? 'Like 11:00 AM' : ''} hint="Usually 2 hours after the first bell"><Input id="lk-t" value={v} onChange={(e) => setV(e.target.value)} error={!ok} className="tnum" /></Field>;
}

/* ===================================================================================== */

export const ATTENDANCE_PAGES = {
  leave: LeavePage,
  staff: StaffPage,
  reports: ReportsPage,
  devices: DevicesPage,
  settings: AttSettingsPage,
};
