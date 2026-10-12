// Staff & HR Management (blueprint module 09). Example data only.
import React, { useMemo, useState } from 'react';
import * as I from './icons.js';
import { STAFF, DEPARTMENTS, SUBJECTS, PERIODS } from './sample.js';
import { cx, Card, CardHead, Button, IconButton, Pill, Avatar, Checkbox, Input, Field, Segmented, Tabs, Sheet, Switch, Empty, useToast } from './ui.jsx';
import { useNav, useRole } from './shell.jsx';
import {
  ModuleHead, useCanEdit, Stats, Band, SearchBox, Toolbar, Select, Textarea, Chips, DataList, BulkBar, Row, SettingsCard, SettingRow,
  Banner, Suggestion, Progress, HBars, DL, Timeline, Checklist, MoreMenu, FormSheet, ConfirmSheet, MonthGrid, Split as KitSplit, Col, ExportButton, TONE_SOFT,
  DatePeriod, PERIODS as DP, fmtRange, CalendarMonth, markCell, monthTotals, schoolDay, MONTH_NAMES,
} from './kit.jsx';
import { pagesFor, inMenu } from './config.js';

// Can the signed-in person open this module (and page)? Used to hide links they may not follow.
function useCan() {
  const { role } = useRole();
  return (mod, page) => {
    const a = role.access[mod];
    if (!a) return false;
    if (!page) return inMenu(role, mod);
    return pagesFor(mod, a, role.id).some((p) => p.id === page);
  };
}
// "9 Oct" or "Fri 9 Oct" or "12-10-2026" -> "2026-10-09" (sample dates are in 2026 unless a year is given)
const MON3 = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
function isoOf(t) {
  if (!t) return '';
  const m1 = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(t);
  if (m1) return `${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`;
  const m2 = /(\d{1,2}) ([A-Z][a-z]{2})(?:[a-z]*)?(?: (\d{4}))?/.exec(t);
  if (m2) return `${m2[3] || 2026}-${String(MON3[m2[2]]).padStart(2, '0')}-${m2[1].padStart(2, '0')}`;
  return '';
}
const inPer = (iso, per) => !!iso && iso >= per.from && iso <= per.to;
const Showing = ({ per, n, what }) => <p className="text-[12.5px] text-ink3 tnum">Showing: {per.label} · {fmtRange(per)}{n != null ? ` · ${n} ${what}` : ''}</p>;

// Same as the kit Split, but its direct children may shrink (no sideways overflow on phones)
const Split = ({ className, ...p }) => <KitSplit {...p} className={cx('[&>*]:min-w-0', className)} />;
// Page-level switch that scrolls sideways on narrow phones instead of pushing the page wider
const ScrollSeg = ({ className, ...p }) => <div className={cx('-mx-4 px-4 @md:mx-0 @md:px-0 overflow-x-auto no-scrollbar', className)}><Segmented {...p} /></div>;

/* ======================= Sample data for this module ======================= */
// The people used for roles who are not in sample.js STAFF, plus two teachers this module needs
const EXTRA = [
  { id: 'P01', code: 'SPS-T-001', name: 'Lakshmi Rao', dept: 'Teaching', desig: 'Principal', subject: null, classTeacher: null, phone: '98480 22145', joined: '1 Jun 2012', status: 'Present', type: 'Permanent', email: 'lakshmi.rao@sunriseps.in' },
  { id: 'P02', code: 'SPS-T-002', name: 'Srinivas Murthy', dept: 'Teaching', desig: 'Vice Principal', subject: null, classTeacher: null, phone: '98490 70021', joined: '1 Jun 2014', status: 'Present', type: 'Permanent', email: 'vp@sunriseps.in' },
  { id: 'P03', code: 'SPS-T-003', name: 'Meena Pillai', dept: 'Teaching', desig: 'Academic Head', subject: 'English', classTeacher: null, phone: '94900 31275', joined: '6 Jun 2016', status: 'Present', type: 'Permanent', email: 'academics@sunriseps.in' },
  { id: 'P04', code: 'SPS-T-012', name: 'Prakash Joshi', dept: 'Teaching', desig: 'PGT Chemistry · Exam In-charge', subject: 'Chemistry', classTeacher: null, phone: '98481 62290', joined: '2 Jun 2018', status: 'Present', type: 'Permanent', email: 'exams@sunriseps.in' },
  { id: 'T13', code: 'SPS-T-018', name: 'Shobha Rani', dept: 'Teaching', desig: 'PRT', subject: 'All subjects', classTeacher: '1 A', phone: '90103 77482', joined: '9 Jun 2020', status: 'On leave', type: 'Permanent' },
  { id: 'T14', code: 'SPS-T-033', name: 'Rekha Nair', dept: 'Teaching', desig: 'PRT', subject: 'All subjects', classTeacher: '1 A', phone: '91601 25539', joined: '5 Oct 2026', status: 'Present', type: 'Temporary' },
  { id: 'A08', code: 'SPS-A-010', name: 'Shalini Verma', dept: 'Office', desig: 'HR Manager', subject: null, classTeacher: null, phone: '95020 18834', joined: '1 Apr 2022', status: 'Present', type: 'Permanent', email: 'hr@sunriseps.in' },
  { id: 'A09', code: 'SPS-A-013', name: 'Naveen Kumar', dept: 'Office', desig: 'Office Assistant', subject: null, classTeacher: null, phone: '90100 27745', joined: '15 Jul 2022', status: 'Present', type: 'Permanent', email: 'naveen.k@sunriseps.in' },
  { id: 'A10', code: 'SPS-A-017', name: 'Divya Menon', dept: 'Office', desig: 'Admission Counsellor', subject: null, classTeacher: null, phone: '96660 41208', joined: '2 Jan 2024', status: 'Present', type: 'Permanent', email: 'admissions@sunriseps.in' },
  { id: 'A11', code: 'SPS-A-016', name: 'Sana Ali', dept: 'Office', desig: 'School Counsellor', subject: null, classTeacher: null, phone: '97040 55391', joined: '10 Jun 2023', status: 'Present', type: 'Permanent', email: 'counsellor@sunriseps.in' },
  { id: 'A12', code: 'SPS-A-007', name: 'Mahesh Goud', dept: 'Accounts', desig: 'Cashier-cum-Accountant', subject: null, classTeacher: null, phone: '99493 18270', joined: '1 Jun 2019', status: 'Present', type: 'Permanent' },
  { id: 'S03', code: 'SPS-S-030', name: 'Bhaskar Rao', dept: 'Support', desig: 'Gate Security', subject: null, classTeacher: null, phone: '99630 12874', joined: '1 Mar 2022', status: 'Present', type: 'Contract' },
];
const FEMALE = ['Anitha', 'Sunitha', 'Lalitha', 'Farhana', 'Usha', 'Swapna', 'Anita', 'Kavitha', 'Padma', 'Lakshmamma', 'Lakshmi', 'Meena', 'Shalini', 'Divya', 'Sana', 'Shobha', 'Rekha'];
const LEAVING = { T09: { kind: 'Resignation', lwd: 'Sat 31 Oct 2026' }, S02: { kind: 'Retirement', lwd: 'Mon 30 Nov 2026' } };
const QUALS = { Teaching: 'M.Sc., B.Ed. (Osmania University)', Office: 'B.Com. (Kakatiya University)', Accounts: 'M.Com., Tally certified', Transport: 'SSC, heavy vehicle licence', Library: 'MLISc, Osmania University', Hostel: 'B.A., first aid certificate', Stores: 'Intermediate', Support: 'SSC' };
const AREAS = ['KPHB Colony, Kukatpally', 'Miyapur', 'Nizampet', 'Bachupally', 'Moosapet', 'Chandanagar', 'Pragathi Nagar', 'Allwyn Colony'];
const BLOOD = ['B+', 'O+', 'A+', 'O+', 'AB+', 'B+', 'A-', 'O-'];
const hash = (s) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const firstName = (n) => n.split(' ')[0];
const SENSITIVE = ['principal', 'schooladmin', 'hr'];

function withDetails(s) {
  const h = hash(s.name);
  const female = FEMALE.includes(firstName(s.name));
  const yrs = 2026 - Number(s.joined.slice(-4));
  const a1 = 4000 + (h % 5000), a2 = 1000 + ((h >>> 4) % 9000), a3 = 1000 + ((h >>> 9) % 9000);
  return {
    ...s,
    first: firstName(s.name),
    email: s.email || `${s.name.toLowerCase().replace(/[^a-z ]/g, '').split(' ').join('.')}@sunriseps.in`,
    female,
    blood: BLOOD[h % BLOOD.length],
    dob: `${1 + (h % 27)} ${['Jan', 'Mar', 'Apr', 'Jun', 'Jul', 'Aug', 'Sep', 'Nov'][h % 8]} ${1972 + (h % 24)}`,
    aadhaar: `${a1} ${a2} ${a3}`, last4: String(a3),
    pan: `${['ABK', 'BQR', 'CDL', 'DPT', 'EMV'][h % 5]}P${String.fromCharCode(65 + (h % 26))}${a3}${String.fromCharCode(65 + ((h >>> 3) % 26))}`,
    bank: `HDFC Bank, Kukatpally · A/c 50100${a2}${a3}`,
    address: `Flat ${100 + (h % 400)}, ${AREAS[h % AREAS.length]}, Hyderabad 5000${72 + (h % 20)}`,
    quals: QUALS[s.dept] || 'Graduate',
    exp: `${yrs + (h % 6)} years (${yrs} here)`,
    manager: s.dept === 'Teaching' ? (s.desig === 'Principal' ? 'Chairman, Sunrise Educational Society' : s.desig === 'Vice Principal' ? 'Lakshmi Rao' : 'Srinivas Murthy') : s.dept === 'Accounts' && s.id !== 'A01' ? 'Suresh Babu' : s.dept === 'Transport' && s.id !== 'A05' ? 'Venkatesh Goud' : 'Anita Sharma',
    emp: LEAVING[s.id] ? 'Leaving' : 'Active',
    leaving: LEAVING[s.id] || null,
  };
}
const ALL = [...STAFF, ...EXTRA].map(withDetails);
const byId = (id) => ALL.find((s) => s.id === id);
// The signed-in person as a staff record (matched by name; built from the role if not on the list)
function useMe() {
  const { role } = useRole();
  return ALL.find((s) => s.name === role.person.name) || withDetails({ id: 'ME', code: 'SPS-A-020', name: role.person.name, dept: 'Office', desig: role.person.role, subject: null, classTeacher: null, phone: role.person.phone || '90000 00000', joined: '1 Jun 2023', status: 'Present', type: 'Permanent', email: role.person.email });
}
const isTeacher = (s) => s.dept === 'Teaching' && !!s.subject;

// Department heads (HR Settings). The head is the first leave approver for the department.
const DEPT_HEAD = { Teaching: 'Srinivas Murthy', Office: 'Anita Sharma', Accounts: 'Suresh Babu', Transport: 'Venkatesh Goud', Library: 'Anita Sharma', Hostel: 'Anita Sharma', Stores: 'Anita Sharma', Support: 'Anita Sharma' };
function approversFor(s) {
  if (s.desig === 'Principal') return ['Chairman, Sunrise Educational Society'];
  return [DEPT_HEAD[s.dept], 'Lakshmi Rao'].filter((n, i, a) => n !== s.name && a.indexOf(n) === i);
}

// Classes and subjects (from Teacher Allocation)
const TEACH = {
  T01: [['Science', '7 A', 6], ['Science', '7 B', 6], ['Science', '8 B', 6]],
  T02: [['Mathematics', '6 A', 7], ['Mathematics', '6 B', 7], ['Mathematics', '7 A', 7], ['Mathematics', '7 B', 7]],
  T03: [['English', '9 A', 6], ['English', '10 A', 6], ['English', '10 B', 6], ['English', '10 C', 6]],
  P03: [['English', '8 A', 6]],
  P04: [['Chemistry', '9 A', 4], ['Chemistry', '10 A', 4], ['Chemistry', '10 B', 4]],
};
function classesFor(s) {
  if (TEACH[s.id]) return TEACH[s.id];
  if (!isTeacher(s)) return [];
  if (s.subject === 'All subjects') return [[`All subjects`, s.classTeacher || '2 A', 26]];
  const h = hash(s.name);
  const base = s.classTeacher || `${6 + (h % 4)} A`;
  const g = Number(base.split(' ')[0]) || 6;
  const up = g >= 9 ? g - 1 : g + 1;
  return [[s.subject, base, 6], [s.subject, `${g} ${base.endsWith('A') ? 'B' : 'A'}`, 6], [s.subject, `${up} A`, 6], [s.subject, `${up} B`, 6]];
}
function weekGrid(s) {
  const cls = classesFor(s);
  const cells = Array(48).fill(null);
  let seed = (hash(s.name) % 9973) + 11;
  const order = Array.from({ length: 48 }, (_, i) => i);
  for (let i = 47; i > 0; i--) { seed = (seed * 16807) % 2147483647; const j = seed % (i + 1); [order[i], order[j]] = [order[j], order[i]]; }
  const slots = [];
  const max = Math.max(0, ...cls.map((c) => c[2]));
  for (let r = 0; r < max; r++) cls.forEach((c) => { if (r < c[2]) slots.push(c); });
  slots.slice(0, 40).forEach((c, i) => { cells[order[i]] = c; });
  return cells;
}

// Leave
const LEAVE_TYPES = [
  { k: 'CL', name: 'Casual leave', quota: 12, half: true, sensitive: false },
  { k: 'SL', name: 'Sick leave', quota: 10, half: true, sensitive: true },
  { k: 'EL', name: 'Earned leave', quota: 15, half: false, sensitive: false },
  { k: 'ML', name: 'Maternity leave', quota: 182, half: false, sensitive: true },
];
const LT = Object.fromEntries(LEAVE_TYPES.map((t) => [t.k, t]));
const USED = { T01: { CL: 3, SL: 1, EL: 0 }, T02: { CL: 2, SL: 0, EL: 0 }, T03: { CL: 2, SL: 4, EL: 0 }, A08: { CL: 1, SL: 0, EL: 0 }, T13: { CL: 1, SL: 2, EL: 0, ML: 39 }, T14: { CL: 0, SL: 0, EL: 0 }, A07: { CL: 4, SL: 1, EL: 0 } };
function usedFor(s) { const h = hash(s.name); return USED[s.id] || { CL: 1 + (h % 4), SL: h % 3, EL: (h >>> 2) % 2 ? 0 : 3 }; }

// Days off: Sundays, Gandhi Jayanti, Dussehra holidays
const HOLIDAYS = new Set([2, 19, 20, 21, 22, 23, 24, 25]);
const parseDMY = (t) => { const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(String(t).trim()); if (!m) return null; const d = new Date(+m[3], +m[2] - 1, +m[1]); return d.getDate() === +m[1] ? d : null; };
const isOff = (d) => d.getDay() === 0 || (d.getFullYear() === 2026 && d.getMonth() === 9 && HOLIDAYS.has(d.getDate()));
function countDays(a, b) { let n = 0; for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) if (!isOff(d)) n++; return n; }
const fmt = (d) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
const dmy = (d) => `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;

// Leave requests waiting for a decision (match the Dashboard and Approvals)
const PENDING = [
  { id: 'LR-2611', ap: '2026-10-09', sid: 'T01', type: 'CL', when: 'Mon 12 Oct', from: '12-10-2026', to: '12-10-2026', days: 1, reason: 'Sister’s engagement in Warangal', after: '8 of 12 casual left', cover: 'Invigilation, Room 7 (8:30–11:30) needs cover', applied: 'Today, 8:12 AM' },
  { id: 'LR-2612', ap: '2026-10-09', sid: 'T03', type: 'SL', when: 'Tue 13 – Wed 14 Oct', from: '13-10-2026', to: '14-10-2026', days: 2, reason: 'Viral fever. Doctor advised rest; certificate attached.', after: '4 of 10 sick left', cover: '2 invigilation duties need cover', applied: 'Today, 8:40 AM', doc: true },
  { id: 'LR-2613', ap: '2026-10-08', sid: 'T02', type: 'CL', when: 'Fri 16 Oct', from: '16-10-2026', to: '16-10-2026', days: 1, reason: 'Home loan paperwork at the bank', after: '9 of 12 casual left', cover: '1 invigilation duty needs cover', applied: 'Yesterday, 6:05 PM' },
  { id: 'LR-2614', ap: '2026-10-07', sid: 'A08', type: 'EL', when: 'Mon 26 – Wed 28 Oct', from: '26-10-2026', to: '28-10-2026', days: 3, reason: 'Family trip to Lucknow after Dussehra', after: '12 of 15 earned left', cover: null, applied: 'Wed 7 Oct' },
];
const DECIDED = [
  { id: 'LR-2610', on: '2026-10-06', sid: 'S01', type: 'CL', when: 'Thu 29 – Fri 30 Oct', days: 2, status: 'Approved', by: 'Venkatesh Goud, then Lakshmi Rao', future: true },
  { id: 'LR-2608', on: '2026-10-08', sid: 'T03', type: 'SL', when: 'Thu 8 – Fri 9 Oct', days: 2, status: 'Approved', by: 'Lakshmi Rao' },
  { id: 'LR-2607', on: '2026-10-08', sid: 'A07', type: 'CL', when: 'Fri 9 Oct', days: 1, status: 'Approved', by: 'Anita Sharma' },
  { id: 'LR-2605', on: '2026-10-05', sid: 'T11', type: 'CL', when: 'Sat 17 Oct', days: 1, status: 'Declined', by: 'Srinivas Murthy', note: 'PTM day. Every teacher is needed at school.' },
  { id: 'LR-2603', on: '2026-10-02', sid: 'T07', type: 'CL', when: 'Tue 6 Oct', days: 1, status: 'Approved', by: 'Srinivas Murthy' },
  { id: 'LR-2601', on: '2026-09-30', sid: 'T05', type: 'SL', when: 'Mon 5 Oct', days: 1, status: 'Approved', by: 'Srinivas Murthy' },
  { id: 'LR-2594', on: '2026-09-21', sid: 'T08', type: 'CL', when: 'Thu 24 Sep', days: 1, status: 'Approved', by: 'Srinivas Murthy' },
  { id: 'LR-2588', on: '2026-09-14', sid: 'A03', type: 'SL', when: 'Mon 14 – Tue 15 Sep', days: 2, status: 'Approved', by: 'Anita Sharma' },
  { id: 'LR-2571', on: '2026-08-26', sid: 'T04', type: 'EL', when: 'Mon 31 Aug – Wed 2 Sep', days: 3, status: 'Declined', by: 'Srinivas Murthy', note: 'Unit Test 2 papers are due that week.' },
  { id: 'LR-2555', on: '2026-08-10', sid: 'S01', type: 'CL', when: 'Thu 13 Aug', days: 1, status: 'Approved', by: 'Venkatesh Goud, then Lakshmi Rao' },
  { id: 'LR-2502', on: '2026-07-06', sid: 'T06', type: 'CL', when: 'Fri 10 Jul', days: 1, status: 'Approved', by: 'Srinivas Murthy' },
];
// Who is away in October: [sid, type, from day, to day, waiting?]
const AWAY = [
  ['T13', 'ML', 1, 31], ['T05', 'SL', 5, 5], ['T07', 'CL', 6, 6], ['T03', 'SL', 8, 9], ['A07', 'CL', 9, 9],
  ['T01', 'CL', 12, 12, true], ['T03', 'SL', 13, 14, true], ['T02', 'CL', 16, 16, true], ['A08', 'EL', 26, 28, true], ['S01', 'CL', 29, 30],
];

// Personal leave history for "My leave"
function myHistory(s) {
  const own = PENDING.filter((p) => p.sid === s.id).map((p) => ({ id: p.id, type: p.type, when: p.when, from: p.from, to: p.to, days: p.days, reason: p.reason, status: 'Waiting' }));
  const h = hash(s.name);
  const past = [
    { id: `LR-25${40 + (h % 50)}`, type: 'CL', when: ['Fri 21 Aug', 'Mon 14 Sep', 'Sat 29 Aug'][h % 3], days: 1, reason: 'Personal work', status: 'Approved' },
    { id: `LR-24${10 + (h % 80)}`, type: 'SL', when: ['Thu 2 – Fri 3 Jul', 'Tue 21 Jul', 'Wed 12 Aug'][h % 3], days: h % 3 === 0 ? 2 : 1, reason: 'Fever', status: 'Approved' },
    { id: `LR-23${20 + (h % 60)}`, type: 'CL', when: 'Sat 13 Jun', days: 1, reason: 'Travel to native place', status: 'Declined', note: 'First week of the year. Please choose another day.' },
  ];
  if (s.id === 'T03') past.unshift({ id: 'LR-2608', type: 'SL', when: 'Thu 8 – Fri 9 Oct', days: 2, reason: 'Viral fever', status: 'Approved' });
  if (s.id === 'A07') past.unshift({ id: 'LR-2607', type: 'CL', when: 'Fri 9 Oct', days: 1, reason: 'Daughter’s school admission', status: 'Approved' });
  if (s.id === 'T13') past.unshift({ id: 'LR-2402', type: 'ML', when: '1 Sep 2026 – 1 Mar 2027', days: 182, reason: 'Maternity leave', status: 'Approved' });
  return [...own, ...past].map((r) => ({ ...r, on: r.on || isoOf(r.from || r.when) }));
}

// Documents
const DOC_STATUS = { Valid: 'ok', 'Expiring soon': 'warn', Expired: 'bad', Missing: 'neutral' };
const EXP_DOCS = [
  { id: 'D1', sid: 'S01', type: 'Driving licence', kind: 'Licence', num: 'TS07 2014 0098812', issued: '29 Oct 2016', expires: '28 Oct 2026', status: 'Expiring soon' },
  { id: 'D2', sid: 'T01', type: 'Police verification', kind: 'Police verification', num: 'CYB/PV/2023/11842', issued: '30 Oct 2023', expires: '30 Oct 2026', status: 'Expiring soon' },
  { id: 'D3', sid: 'T09', type: 'Contract', kind: 'Contract', num: 'SPS/HR/C/2025/031', issued: '1 Nov 2025', expires: '31 Oct 2026', status: 'Expiring soon' },
  { id: 'D4', sid: 'A05', type: 'First aid certificate', kind: 'Certificate', num: 'IRCS/HYD/22/4410', issued: '20 Oct 2023', expires: '20 Oct 2026', status: 'Expiring soon' },
  { id: 'D5', sid: 'T14', type: 'Contract', kind: 'Contract', num: 'SPS/HR/C/2026/044', issued: '5 Oct 2026', expires: '28 Feb 2027', status: 'Valid' },
  { id: 'D6', sid: 'T07', type: 'Police verification', kind: 'Police verification', num: 'CYB/PV/2023/09917', issued: '2 Oct 2023', expires: '2 Oct 2026', status: 'Expired' },
  { id: 'D7', sid: 'S02', type: 'Medical fitness', kind: 'Certificate', num: 'DRC/MF/2025/1187', issued: '15 Sep 2025', expires: '15 Sep 2026', status: 'Expired' },
  { id: 'D8', sid: 'T11', type: 'Police verification', kind: 'Police verification', num: '', issued: '', expires: '', status: 'Missing' },
  { id: 'D9', sid: 'A03', type: 'PAN card', kind: 'ID proof', num: '', issued: '', expires: '', status: 'Missing' },
  { id: 'D10', sid: 'T02', type: 'Aadhaar card', kind: 'ID proof', num: 'XXXX XXXX 7731', issued: '12 Mar 2014', expires: '', status: 'Valid' },
  { id: 'D11', sid: 'T08', type: 'M.Sc. Physics degree', kind: 'Certificate', num: 'OU/2012/PHY/0417', issued: '18 Aug 2012', expires: '', status: 'Valid' },
  { id: 'D12', sid: 'A01', type: 'Appointment letter', kind: 'Contract', num: 'SPS/HR/A/2017/006', issued: '1 Apr 2017', expires: '', status: 'Valid' },
  { id: 'D13', sid: 'T04', type: 'CTET certificate', kind: 'Certificate', num: 'CTET/2021/P1/882104', issued: '10 Mar 2021', expires: '', status: 'Valid' },
  { id: 'D14', sid: 'A06', type: 'Police verification', kind: 'Police verification', num: 'CYB/PV/2024/02215', issued: '14 Mar 2024', expires: '14 Mar 2027', status: 'Valid' },
];
function myDocs(s) {
  const h = hash(s.name);
  const list = [
    { type: 'Aadhaar card', kind: 'ID proof', num: s.last4, issued: `${3 + (h % 20)} Mar 2014`, expires: '', status: 'Valid', size: '312 KB' },
    { type: 'PAN card', kind: 'ID proof', num: s.pan.slice(-4), issued: `${2 + (h % 20)} Jan 2012`, expires: '', status: s.id === 'A03' ? 'Missing' : 'Valid', size: '188 KB' },
    { type: s.dept === 'Teaching' ? 'B.Ed. certificate' : 'Highest qualification', kind: 'Certificate', num: '', issued: `Aug ${2008 + (h % 10)}`, expires: '', status: 'Valid', size: '1.2 MB' },
    { type: s.type === 'Permanent' ? 'Appointment letter' : 'Contract', kind: 'Contract', num: `SPS/HR/${s.joined.slice(-4)}/0${10 + (h % 80)}`, issued: s.joined, expires: s.type === 'Permanent' ? '' : '28 Feb 2027', status: 'Valid', size: '420 KB' },
    { type: 'Police verification', kind: 'Police verification', num: '', issued: s.id === 'T01' ? '30 Oct 2023' : `${1 + (h % 27)} Jun 2025`, expires: s.id === 'T01' ? '30 Oct 2026' : `${1 + (h % 27)} Jun 2028`, status: s.id === 'T01' ? 'Expiring soon' : s.id === 'T07' ? 'Expired' : s.id === 'T11' ? 'Missing' : 'Valid', size: '640 KB' },
  ];
  if (s.dept === 'Transport') list.push({ type: 'Driving licence', kind: 'Licence', num: '', issued: '29 Oct 2016', expires: s.id === 'S01' ? '28 Oct 2026' : '14 Aug 2029', status: s.id === 'S01' ? 'Expiring soon' : 'Valid', size: '256 KB' });
  if (s.dept === 'Teaching' && s.subject && s.subject !== 'All subjects') list.push({ type: 'CTET certificate', kind: 'Certificate', num: '', issued: `Mar ${2015 + (h % 8)}`, expires: '', status: 'Valid', size: '540 KB' });
  return list;
}

// Recruitment, appraisal, training, promotions
const VACANCIES = [
  { id: 'V-26-07', opened: '2026-10-01', shut: '2026-10-20', post: 'TGT Computer Science', dept: 'Teaching', openings: 1, closes: 'Tue 20 Oct', status: 'Interviews', apps: 14, note: 'Replaces Karthik Menon (leaving 31 Oct)' },
  { id: 'V-26-06', opened: '2026-10-05', shut: '2026-10-31', post: 'PRT', dept: 'Teaching', openings: 2, closes: 'Sat 31 Oct', status: 'Open', apps: 22, note: 'Primary wing, from November' },
  { id: 'V-26-05', opened: '2026-09-24', shut: '2026-10-16', post: 'Driver', dept: 'Transport', openings: 1, closes: 'Fri 16 Oct', status: 'Offer made', apps: 5, note: 'Bus 7 (new Route 7 · Hydernagar)' },
  { id: 'V-26-03', opened: '2026-06-15', shut: '2026-07-10', post: 'PGT Mathematics', dept: 'Teaching', openings: 1, closes: 'Fri 10 Jul', status: 'Filled', apps: 19, note: 'Arvind Rao joined on 15 Jun' },
  { id: 'V-26-01', opened: '2026-04-20', shut: '2026-05-25', post: 'TGT Science and TGT English', dept: 'Teaching', openings: 2, closes: 'Mon 25 May', status: 'Filled', apps: 37, note: 'Pallavi Reddy and Sneha Mathew joined on 1 Jun' },
];
const APPLICANTS = {
  'V-26-07': [
    { name: 'Harika Chowdary', from: 'Narayana School, Miyapur', exp: '5 years', stage: 'Interview', when: 'Mon 12 Oct, 2:30 PM', panel: 'Srinivas Murthy, Meena Pillai' },
    { name: 'Rahul Varma', from: 'MCA, JNTU Hyderabad', exp: 'Fresher', stage: 'Interview', when: 'Mon 12 Oct, 3:15 PM', panel: 'Srinivas Murthy, Meena Pillai' },
    { name: 'Sowmya Kandula', from: 'Delhi Public School, Nacharam', exp: '7 years', stage: 'Shortlisted', when: '', panel: '' },
    { name: 'Arvind Patel', from: 'Sri Chaitanya, Kukatpally', exp: '3 years', stage: 'Applied', when: '', panel: '' },
    { name: 'Nikitha Rao', from: 'Oakridge, Bachupally', exp: '4 years', stage: 'Applied', when: '', panel: '' },
  ],
  'V-26-06': [
    { name: 'Pavani Reddy', from: 'Johnson Grammar School', exp: '6 years', stage: 'Shortlisted', when: '', panel: '' },
    { name: 'Saritha Goud', from: 'Gowtham Model School', exp: '2 years', stage: 'Applied', when: '', panel: '' },
    { name: 'Farah Siddiqui', from: 'St. Andrews, Bowenpally', exp: '8 years', stage: 'Interview', when: 'Wed 14 Oct, 11:00 AM', panel: 'Meena Pillai, Usha Rani' },
    { name: 'Keerthi Naidu', from: 'D.El.Ed. 2025 batch', exp: 'Fresher', stage: 'Applied', when: '', panel: '' },
  ],
  'V-26-03': [{ name: 'Arvind Rao', from: 'Kendriya Vidyalaya, Golconda', exp: '9 years', stage: 'Joined', when: 'Joined 15 Jun', panel: 'Srinivas Murthy' }],
  'V-26-01': [{ name: 'Pallavi Reddy', from: 'Sri Chaitanya, Miyapur', exp: '4 years', stage: 'Joined', when: 'Joined 1 Jun', panel: 'Meena Pillai' }, { name: 'Sneha Mathew', from: 'St. Ann’s, Secunderabad', exp: '6 years', stage: 'Joined', when: 'Joined 1 Jun', panel: 'Meena Pillai' }],
  'V-26-05': [
    { name: 'Yadagiri Pasham', from: 'APSRTC (retired)', exp: '22 years', stage: 'Offer made', when: 'Offer sent Thu 8 Oct', panel: 'Venkatesh Goud' },
    { name: 'Ramesh Banoth', from: 'Private cab driver', exp: '9 years', stage: 'Interview', when: 'Done Tue 6 Oct', panel: 'Venkatesh Goud' },
  ],
};
const STAGES = ['Applied', 'Shortlisted', 'Interview', 'Offer made', 'Joined'];
const STAGE_TONE = { Applied: 'neutral', Shortlisted: 'info', Interview: 'brand', 'Offer made': 'warn', Joined: 'ok', 'Not selected': 'bad' };
const APPRAISALS = [
  ['T01', 'Manager review', null], ['T02', 'Self review', null], ['T03', 'Not started', null], ['T04', 'Done', 5], ['T05', 'Manager review', null],
  ['T06', 'Done', 4], ['T07', 'Self review', null], ['T08', 'Done', 5], ['T10', 'Done', 4], ['T11', 'Not started', null], ['T12', 'Self review', null], ['P04', 'Done', 4],
];
const APP_TONE = { 'Not started': 'neutral', 'Self review': 'info', 'Manager review': 'warn', Done: 'ok' };
const TRAINING = [
  { sid: 'T01', on: '2026-08-22', course: 'Experiential learning in Science (CBSE COE Hyderabad)', dates: '22–23 Aug 2026', hours: 12, cert: true },
  { sid: 'T02', on: '2026-07-18', course: 'Competency-based questions in Mathematics', dates: '18 Jul 2026', hours: 6, cert: true },
  { sid: 'T04', on: '2026-06-04', course: 'Foundational literacy and numeracy (NIPUN)', dates: '4–6 Jun 2026', hours: 18, cert: true },
  { sid: 'T03', on: '2026-06-15', course: 'Classroom assessment: CBSE online module', dates: 'Jun–Sep 2026', hours: 10, cert: false },
  { sid: 'S01', on: '2026-09-12', course: 'Defensive driving and child safety (RTA)', dates: '12 Sep 2026', hours: 4, cert: true },
  { sid: 'T12', on: '2026-07-30', course: 'POCSO awareness for teachers', dates: '30 Jul 2026', hours: 3, cert: true },
];
const PROMOTIONS = [
  { sid: 'P02', on: '2024-06-01', from: 'PGT Mathematics', to: 'Vice Principal', date: '1 Jun 2024', reason: 'Selected by the management committee' },
  { sid: 'T08', on: '2025-06-01', from: 'TGT Physics', to: 'PGT Physics', date: '1 Jun 2025', reason: 'M.Sc. completed; Class 11–12 opening' },
  { sid: 'A12', on: '2025-04-01', from: 'Office Assistant', to: 'Cashier-cum-Accountant', date: '1 Apr 2025', reason: 'Took over the fee counter' },
  { sid: 'T06', on: '2023-06-01', from: 'PRT', to: 'TGT Telugu', date: '1 Jun 2023', reason: 'Telugu teacher for Classes 6–10' },
];

// Exits
const EXITS = [
  { id: 'EX-26-04', sid: 'T09', kind: 'Resignation', received: 'Wed 30 Sep', lwd: 'Sat 31 Oct 2026', reason: 'Moving to Bengaluru with family', handover: [3, 8], clear: [1, 5], settle: 'Not started', approval: 'Approved by Lakshmi Rao' },
  { id: 'EX-26-05', sid: 'S02', kind: 'Retirement', received: 'Mon 1 Sep', lwd: 'Mon 30 Nov 2026', reason: 'Reaches 60 years on 27 Nov 2026', handover: [1, 2], clear: [0, 3], settle: 'Not started', approval: 'No approval needed' },
  { id: 'EX-26-02', sid: null, name: 'Harish Chandra', desig: 'Driver · Bus 2', kind: 'Resignation', received: 'Fri 31 Jul', lwd: 'Mon 31 Aug 2026', reason: 'Joined TSRTC', handover: [2, 2], clear: [4, 4], settle: 'Paid ₹21,400 on 7 Sep', approval: 'Approved by Lakshmi Rao', done: true },
];
const HANDOVER = {
  T09: [
    { what: 'Computers · 6 A, 6 B, 7 A, 7 B (12 periods a week)', kind: 'Classes', to: 'Not yet given', done: false },
    { what: 'Computers · 8 A, 8 B, 9 A, 9 B (12 periods a week)', kind: 'Classes', to: 'Not yet given', done: false },
    { what: 'Half-yearly Computers question papers, Classes 6–9', kind: 'Documents', to: 'Prakash Joshi', done: true },
    { what: 'Computer lab keys and register', kind: 'Assets', to: 'Ramu Yadav', done: true },
    { what: 'Dell laptop SPS-LAP-014', kind: 'Assets', to: 'Ramu Yadav', done: false },
    { what: 'School robotics club', kind: 'Duties', to: 'Farhana Begum', done: true },
    { what: '2 library books (due 20 Oct)', kind: 'Library', to: 'Return to Padma Iyer', done: false },
    { what: 'Marks entry for half-yearly Computers', kind: 'Duties', to: 'Not yet given', done: false },
  ],
  S02: [
    { what: 'UKG A and UKG B ayah duty', kind: 'Duties', to: 'Not yet given', done: false },
    { what: 'First-aid box, primary wing', kind: 'Assets', to: 'Usha Rani', done: true },
  ],
};
const CLEARANCE = (sid) => [
  { what: 'Assets and stock items returned', where: 'Inventory', ok: false, note: sid === 'T09' ? 'Laptop SPS-LAP-014 not returned' : 'First-aid box returned; ayah uniform due' },
  { what: 'Library books returned', where: 'Library', ok: false, note: sid === 'T09' ? '2 books out' : 'None borrowed' },
  { what: 'Advances and loans recovered', where: 'Salary', ok: false, note: sid === 'T09' ? 'Advance ₹6,000 left' : 'Nothing due' },
  { what: 'ID card returned', where: 'HR', ok: false },
  { what: 'Login closes on the last working day', where: 'Settings', ok: false, note: 'Happens by itself' },
].slice(0, sid === 'T09' ? 5 : 3);

/* ======================= Small pieces ======================= */
const TODAY_TONE = { Present: 'ok', Late: 'warn', 'On leave': 'info', 'Not in yet': 'neutral' };
function TodayPill({ s, small }) {
  return <Pill tone={TODAY_TONE[s.status] || 'neutral'} dot className={small ? '!h-[22px] !text-[11.5px]' : ''}>{s.status === 'On leave' ? 'On leave today' : s.status}</Pill>;
}
function BackLink({ label = 'Staff List', crumb }) {
  const { go } = useNav();
  return (
    <button onClick={() => go('staff', { page: 'list' })} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink mb-3 -ml-1 h-8 px-1 rounded-lg">
      <I.ArrowLeft size={17} />{label}{crumb && <span className="text-ink3 font-normal"> / {crumb}</span>}
    </button>
  );
}
const leaveLabel = (k, hide) => (hide && LT[k]?.sensitive ? 'On leave' : LT[k]?.name || k);
function StaffPicker({ id, value, onChange, error, filter }) {
  return <Select id={id} value={value} onChange={onChange} error={error} options={[{ value: '', label: 'Choose a staff member' }, ...ALL.filter(filter || (() => true)).map((s) => ({ value: s.id, label: `${s.name} · ${s.desig}` }))]} />;
}

/* ======================= Staff List ======================= */
function StaffList() {
  const { go } = useNav();
  const toast = useToast();
  const canEdit = useCanEdit();
  const [dept, setDept] = useState('all');
  const [q, setQ] = useState('');
  const [state, setState] = useState('active');
  const [type, setType] = useState('all');
  const [sel, setSel] = useState(new Set());
  const [msg, setMsg] = useState(false);
  const [move, setMove] = useState(false);
  const [moveTo, setMoveTo] = useState('Office');
  const [imp, setImp] = useState(false);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return ALL.filter((s) => (dept === 'all' || s.dept === dept) && (type === 'all' || s.type === type) &&
      (state === 'active' ? true : state === 'leave' ? s.status === 'On leave' : s.emp === 'Leaving') &&
      (!t || s.name.toLowerCase().includes(t) || s.code.toLowerCase().includes(t) || s.desig.toLowerCase().includes(t) || s.phone.replace(/\s/g, '').includes(t.replace(/\s/g, ''))));
  }, [dept, q, state, type]);
  const cols = [
    { key: 'name', label: 'Staff member', render: (s) => (
      <div className="flex items-center gap-3"><Avatar name={s.name} size={38} />
        <div className="min-w-0"><p className="font-semibold leading-tight flex items-center gap-2">{s.name}{s.emp === 'Leaving' && <Pill tone="warn" className="!h-5 !text-[11px]">Leaving</Pill>}</p><p className="text-[12.5px] text-ink3 font-mono">{s.code}</p></div>
      </div>) },
    { key: 'desig', label: 'Designation', render: (s) => <><p className="leading-tight">{s.desig}</p><p className="text-[12.5px] text-ink3">{s.classTeacher ? `Class teacher ${s.classTeacher}` : s.subject && s.subject !== 'All subjects' ? s.subject : s.type}</p></> },
    { key: 'dept', label: 'Department', render: (s) => s.dept },
    { key: 'phone', label: 'Phone', nowrap: true, render: (s) => <span className="tnum">{s.phone}</span> },
    { key: 'today', label: 'Today', render: (s) => <TodayPill s={s} /> },
    { key: 'act', label: '', render: (s) => (
      <div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
        <IconButton icon={I.MessageCircle} label={`Message ${s.name}`} size={34} onClick={() => toast({ title: `Message to ${s.name}`, body: 'WhatsApp, with SMS backup', tone: 'info' })} />
        {canEdit && <IconButton icon={I.Pencil} label={`Edit ${s.name}`} size={34} onClick={() => { go('staff', { page: 'profile', id: s.id }); toast({ title: `Editing ${s.name}`, body: 'Each section of the profile saves on its own.', tone: 'info' }); }} />}
      </div>) },
  ];
  return (
    <div className="flex flex-col gap-5 @lg:gap-6">
      <div>
        <ModuleHead sub="86 staff on roll in 2026–27 · Kukatpally campus · example records"
          actions={<>
            <Button variant="secondary" icon={I.Upload} className="hidden @md:inline-flex" onClick={() => setImp(true)}>Import</Button>
            <ExportButton what={`${rows.length} staff`} />
            <Button variant="primary" icon={I.UserPlus} onClick={() => go('staff', { page: 'add' })}>Add staff</Button>
          </>} />
        <Band items={[
          { label: 'Staff on roll', big: '86', foot: '58 teaching, 28 others' },
          { label: 'Present today', big: <>82<span className="text-[0.55em] opacity-70 font-medium"> / 86</span></>, foot: '1 came late today', onClick: () => go('attendance', { page: 'staff' }) },
          { label: 'On leave today', big: '3', foot: 'Anitha, Ramu, Shobha', onClick: () => go('staff', { page: 'leave' }) },
          { label: 'Not in yet', big: '1', foot: 'Swapna Reddy' },
        ]} />
      </div>
      <div>
        <Chips value={dept} onChange={setDept} options={[{ value: 'all', label: 'All departments', count: 86 }, ...DEPARTMENTS.map((d) => ({ value: d.k, label: d.k, count: d.n }))]} />
        <Card className="mt-3 overflow-hidden">
          <Toolbar>
            <SearchBox id="staff-search" value={q} onChange={setQ} placeholder="Name, staff ID, designation or phone" />
            <Segmented value={state} onChange={setState} options={[{ value: 'active', label: 'Active' }, { value: 'leave', label: 'On leave' }, { value: 'leaving', label: 'Leaving' }]} />
            <Select id="staff-type" className="@md:w-44" value={type} onChange={setType} options={[{ value: 'all', label: 'All types' }, 'Permanent', 'Contract', 'Temporary']} />
          </Toolbar>
          {canEdit && (
            <BulkBar count={sel.size} onClear={() => setSel(new Set())}>
              <Button size="sm" variant="secondary" icon={I.Send} onClick={() => setMsg(true)}>Send message</Button>
              <Button size="sm" variant="secondary" icon={I.IdCard} onClick={() => toast({ title: `${sel.size} ID cards ready to print`, body: 'Sent to the office printer in one batch' })}>Print ID cards</Button>
              <Button size="sm" variant="secondary" icon={I.ArrowRightLeft} onClick={() => setMove(true)}>Change department</Button>
            </BulkBar>
          )}
          <DataList columns={cols} rows={rows} select={canEdit ? [sel, setSel] : undefined} onRow={(s) => go('staff', { page: 'profile', id: s.id })} minWidth={860}
            footer={`Showing ${rows.length} of ${dept === 'all' && state === 'active' && !q && type === 'all' ? '86 on roll (example records)' : rows.length}`}
            mobile={(s) => ({ avatar: s.name, title: s.name, sub: `${s.desig} · ${s.dept}`, pills: [<TodayPill key="t" s={s} small />, s.emp === 'Leaving' && <Pill key="l" tone="warn" className="!h-[22px] !text-[11.5px]">Leaving</Pill>] })}
            empty={<Empty icon={I.SearchX} title="No staff match" body={q ? `Nobody called “${q}”. Try the staff ID or phone number.` : 'Try a different department or filter.'} action={<Button variant="secondary" onClick={() => { setQ(''); setDept('all'); setState('active'); setType('all'); }}>Clear filters</Button>} />} />
        </Card>
      </div>
      <ConfirmSheet open={msg} onClose={() => setMsg(false)} title={`Send a message to ${sel.size} staff?`} sub="WhatsApp first, SMS if WhatsApp fails. Messages cannot be unsent."
        confirmLabel={`Send to ${sel.size} staff`} onConfirm={() => { toast({ title: `Message sent to ${sel.size} staff`, body: 'Delivery shows in Communication, Message History.' }); setSel(new Set()); }}>
        <Textarea id="staff-msg" value="Reminder: staff meeting today at 3:00 PM in the Principal’s room." onChange={() => {}} rows={3} />
      </ConfirmSheet>
      <FormSheet open={move} onClose={() => setMove(false)} title={`Change department for ${sel.size} staff`} sub="Leave approvals follow the new department head from today." submitLabel="Change department"
        onSubmit={() => { toast({ title: `${sel.size} staff moved to ${moveTo}`, body: `New head of department: ${DEPT_HEAD[moveTo]}. Recorded in the audit log.`, undo: () => {} }); setSel(new Set()); }}>
        <Field label="New department" required id="mv-dept"><Select id="mv-dept" value={moveTo} onChange={setMoveTo} options={DEPARTMENTS.map((d) => d.k)} /></Field>
      </FormSheet>
      <ImportSheet open={imp} onClose={() => setImp(false)} />
    </div>
  );
}

function ImportSheet({ open, onClose }) {
  const toast = useToast();
  const [step, setStep] = useState(1);
  const close = () => { onClose(); setStep(1); };
  return (
    <Sheet open={open} onClose={close} title="Import staff from Excel" sub="We check every row before adding anything. Logins are created after import with an invite."
      footer={step === 1 ? <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" icon={I.Upload} onClick={() => setStep(2)}>Upload staff-list.xlsx</Button></>
        : <><Button variant="ghost" onClick={() => toast({ title: 'Saved: staff-import-problems.xlsx', body: '2 rows with the reason next to each' })}>Download 2 bad rows</Button><Button variant="primary" icon={I.Check} onClick={() => { close(); toast({ title: '14 staff added, 2 skipped', body: 'Invites go out by WhatsApp. Undo the whole import from the import history.' }); }}>Import 14 staff</Button></>}>
      {step === 1 ? (
        <ol className="flex flex-col gap-3 text-[14px]">
          {[['Download the template', 'Name, phone, designation, department, joining date and the other step 1 fields', I.FileDown],
            ['Fill it in Excel', 'One row for each staff member. Phone numbers have 10 digits.', I.FileSpreadsheet],
            ['Upload it here', 'We match the columns, then show every problem in plain words', I.Upload]].map(([t, s, Ic], i) => (
            <li key={t} className="flex gap-3 items-start">
              <span className="w-9 h-9 rounded-xl bg-brand/10 text-brand grid place-items-center shrink-0"><Ic size={18} /></span>
              <span><b className="font-semibold block">{i + 1}. {t}</b><span className="text-ink3 text-[13px]">{s}</span></span>
            </li>
          ))}
          <li><Button variant="soft" size="sm" icon={I.Download} onClick={() => toast({ title: 'Saved: staff-import-template.csv' })}>Download template</Button></li>
        </ol>
      ) : (
        <div className="flex flex-col gap-3">
          <Banner tone="ok" title="16 rows read.">14 are ready to add.</Banner>
          <ul className="rounded-xl border border-line divide-y divide-line/70 text-[13.5px]">
            <li className="px-3 py-2.5 flex gap-2"><I.CircleAlert size={16} className="text-bad shrink-0 mt-0.5" /><span><b className="font-semibold">Row 6, Arun Kumar:</b> this phone belongs to Mallesh Kumar (Driver). Skipped.</span></li>
            <li className="px-3 py-2.5 flex gap-2"><I.CircleAlert size={16} className="text-bad shrink-0 mt-0.5" /><span><b className="font-semibold">Row 11, Sravani P.:</b> phone has 11 digits. Indian mobile numbers have 10.</span></li>
          </ul>
        </div>
      )}
    </Sheet>
  );
}

/* ======================= Staff Profile (detail) and My Profile ======================= */
function StaffProfile({ params, access }) {
  const own = access === 'own';
  const me = useMe();
  const s = own ? me : byId(params?.id) || byId('T01');
  return own ? <div><ModuleHead sub="Your own record. Ask HR to change your details; you can edit your emergency contacts." /><Profile s={s} mode="own" /></div>
    : <div><BackLink crumb={s.dept} /><Profile s={s} mode={access} /></div>;
}

function Profile({ s, mode }) {
  const { go } = useNav();
  const toast = useToast();
  const { role } = useRole();
  const canEdit = useCanEdit() && mode === 'full';
  const seeSalary = SENSITIVE.includes(role.id) || mode === 'own';
  const teacher = isTeacher(s);
  const [tab, setTab] = useState('overview');
  const [status, setStatus] = useState(false);
  const [onBehalf, setOnBehalf] = useState(false);
  const used = usedFor(s);
  const cls = classesFor(s);
  const periods = cls.reduce((a, c) => a + c[2], 0);
  const docs = myDocs(s);
  const docsOk = docs.filter((d) => d.status === 'Valid').length;
  const tabs = [
    { id: 'overview', label: 'Overview' },
    teacher && { id: 'classes', label: 'Classes' },
    teacher && { id: 'timetable', label: 'Time Table' },
    { id: 'attendance', label: 'Attendance' },
    { id: 'leave', label: 'Leave' },
    teacher && { id: 'workload', label: 'Workload' },
    { id: 'performance', label: 'Performance' },
    { id: 'documents', label: 'Documents' },
    seeSalary && { id: 'salary', label: 'Salary' },
  ].filter(Boolean);
  const strip = [
    { k: 'Today', v: s.status, sub: s.status === 'Present' ? 'In at 8:31 AM' : s.status === 'Late' ? 'In at 9:12 AM' : s.status === 'On leave' ? leaveLabel(s.id === 'T13' ? 'ML' : s.id === 'T03' ? 'SL' : 'CL', !SENSITIVE.includes(role.id) && mode !== 'own') : 'Not marked yet', icon: I.CalendarCheck2, tab: 'attendance', tone: TODAY_TONE[s.status] },
    { k: 'Casual leave left', v: `${12 - used.CL} of 12`, sub: `Sick ${10 - used.SL} · Earned ${15 - used.EL}`, icon: I.CalendarDays, tab: 'leave' },
    teacher ? { k: 'Periods a week', v: `${periods} of 34`, sub: `${cls.length} ${cls.length === 1 ? 'class' : 'classes'}`, icon: I.Clock, tab: 'workload' } : { k: 'Reports to', v: s.manager.split(',')[0], sub: s.dept, icon: I.UserRound },
    { k: s.classTeacher ? 'Class teacher' : 'Employment', v: s.classTeacher || s.type, sub: s.classTeacher ? 'Takes daily attendance' : `Since ${s.joined}`, icon: s.classTeacher ? I.GraduationCap : I.Briefcase, tab: teacher ? 'classes' : undefined },
    { k: 'Documents', v: `${docsOk} of ${docs.length}`, sub: docs.some((d) => d.status !== 'Valid') ? `${docs.length - docsOk} need attention` : 'All valid', icon: I.FolderOpen, tab: 'documents', tone: docsOk < docs.length ? 'warn' : undefined },
    { k: 'Joined', v: s.joined.replace(/^\d+ /, ''), sub: `${2026 - Number(s.joined.slice(-4))} years here`, icon: I.BadgeCheck },
  ];
  return (
    <div>
      <Card className="overflow-hidden">
        <div className="h-16 @md:h-20 bg-gradient-to-r from-brand to-brand/60 relative"><div className="absolute inset-0 dotgrid opacity-50" /></div>
        <div className="relative px-4 @md:px-6 pb-5 flex flex-col @lg:flex-row @lg:items-end gap-4">
          <div className="flex items-end gap-4 min-w-0 flex-1">
            <div className="rounded-full p-1 bg-surface shrink-0 -mt-10 @md:-mt-12"><Avatar name={s.name} size={88} /></div>
            <div className="min-w-0 pt-3">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display text-[24px] @md:text-[28px] font-semibold tracking-tight leading-tight">{s.name}</h1>
                <Pill tone={s.emp === 'Leaving' ? 'warn' : 'ok'} dot>{s.emp === 'Leaving' ? `Leaving ${s.leaving.lwd.replace(' 2026', '')}` : 'Active'}</Pill>
              </div>
              <p className="text-[13.5px] text-ink3 mt-0.5">{s.desig} · {s.dept} · <span className="font-mono text-[12.5px]">{s.code}</span> · <span className="tnum">{s.phone}</span></p>
            </div>
          </div>
          <div className="flex gap-2 relative">
            {mode === 'own' ? (
              <>
                <Button variant="primary" icon={I.CalendarPlus} className="flex-1 @lg:flex-none" onClick={() => go('staff', { page: 'leave' })}>Apply for leave</Button>
                <Button variant="secondary" icon={I.Pencil} className="flex-1 @lg:flex-none" onClick={() => toast({ title: 'Change request sent to HR', body: 'Shalini Verma checks it. You are told when it is done.', tone: 'info' })}>Ask HR to change</Button>
              </>
            ) : (
              <>
                <Button variant={canEdit ? 'secondary' : 'primary'} icon={I.MessageCircle} className="flex-1 @lg:flex-none" onClick={() => toast({ title: `Message to ${s.name}`, body: 'WhatsApp, with SMS backup', tone: 'info' })}>Message</Button>
                {canEdit && <Button variant="primary" icon={I.CalendarPlus} className="flex-1 @lg:flex-none" onClick={() => setOnBehalf(true)}><span className="@sm:hidden">Apply leave</span><span className="hidden @sm:inline">Apply leave for {s.first}</span></Button>}
                {canEdit && <MoreMenu items={[
                  [I.IdCard, 'Print ID card', () => toast({ title: `ID card for ${s.name} sent to the office printer` })],
                  [I.ScrollText, 'Experience letter', () => go('staff', { page: 'documents' })],
                  [I.KeyRound, 'Reset password', () => toast({ title: `Password reset link sent to ${s.first}`, body: `WhatsApp to ${s.phone}. The old password stops working when the new one is set.` })],
                  [I.UserCog, 'Change status', () => setStatus(true)],
                  [I.LogOut, 'Start staff exit', () => go('staff', { page: 'exit' })],
                ]} />}
              </>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 @md:grid-cols-3 @xl:grid-cols-6 border-t border-line">
          {strip.map((m, i) => (
            <button key={m.k} onClick={() => m.tab && setTab(m.tab)} disabled={!m.tab}
              className={cx('text-left px-4 @md:px-5 py-3.5 border-line enabled:hover:bg-sunken/60 transition min-w-0', 'border-b @xl:border-b-0', i % 2 === 0 && 'border-r', '@md:border-r', i === 5 && '@xl:border-r-0')}>
              <p className="text-[12px] text-ink3 font-semibold flex items-center gap-1.5 truncate"><m.icon size={14} className="shrink-0" />{m.k}</p>
              <p className={cx('font-semibold text-[17px] tnum mt-0.5 truncate', m.tone === 'warn' && 'text-warn', m.tone === 'info' && 'text-info')}>{m.v}</p>
              <p className="text-[12px] text-ink3 truncate">{m.sub}</p>
            </button>
          ))}
        </div>
      </Card>

      <Tabs className="mt-5" value={tab} onChange={setTab} tabs={tabs} />
      <div className="mt-5 animate-rise" key={tab}>
        {tab === 'overview' && <ProfileOverview s={s} mode={mode} />}
        {tab === 'classes' && <ProfileClasses s={s} />}
        {tab === 'timetable' && <ProfileTimetable s={s} />}
        {tab === 'attendance' && <ProfileAttendance s={s} />}
        {tab === 'leave' && <ProfileLeave s={s} mode={mode} />}
        {tab === 'workload' && <ProfileWorkload s={s} />}
        {tab === 'performance' && <ProfilePerformance s={s} />}
        {tab === 'documents' && <ProfileDocs s={s} mode={mode} />}
        {tab === 'salary' && <ProfileSalary s={s} mode={mode} />}
      </div>

      <FormSheet open={status} onClose={() => setStatus(false)} title={`Change status for ${s.name}`} sub="Resigned, retired and terminated go through Staff Exit." submitLabel="Change status"
        onSubmit={() => toast({ title: `${s.name}: status changed to Suspended`, body: 'Login paused from now. Recorded in the audit log.', undo: () => {} })}>
        <Field label="New status" required id="st-new"><Select id="st-new" value="Suspended" onChange={() => {}} options={['Active', 'On leave', 'Suspended']} /></Field>
        <Field label="From date" required id="st-date"><Input id="st-date" defaultValue="09-10-2026" placeholder="DD-MM-YYYY" /></Field>
        <Field label="Reason" required id="st-reason" hint="Only HR and the Principal see this"><Textarea id="st-reason" value="Pending enquiry by the management committee" onChange={() => {}} rows={2} /></Field>
      </FormSheet>
      <ApplySheet open={onBehalf} onClose={() => setOnBehalf(false)} who={s} />
    </div>
  );
}

const EditBtn = ({ what, show }) => {
  const toast = useToast();
  if (!show) return null;
  return <button onClick={() => toast({ title: `Editing ${what}`, body: 'Each section saves on its own. Changes go in the audit log.', tone: 'info' })} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand h-8 px-2 rounded-lg hover:bg-brand/8"><I.Pencil size={14} />Edit</button>;
};
function Secret({ full, masked, can, own }) {
  const [shown, setShown] = useState(false);
  if (can) return <span className="tnum">{full}</span>;
  if (own) return <span className="inline-flex items-center gap-2"><span className="tnum">{shown ? full : masked}</span><button onClick={() => setShown(!shown)} className="text-[12.5px] font-semibold text-brand hover:underline">{shown ? 'Hide' : 'Show'}</button></span>;
  return <span className="inline-flex items-center gap-1.5 text-ink2"><span className="tnum">{masked}</span><I.Lock size={13} className="text-ink3" /></span>;
}

function ProfileOverview({ s, mode }) {
  const { role } = useRole();
  const toast = useToast();
  const canEdit = useCanEdit() && mode === 'full';
  const can = SENSITIVE.includes(role.id);
  const own = mode === 'own';
  const h = hash(s.name);
  const roles = s.desig === 'Principal' ? 'Principal' : s.classTeacher && isTeacher(s) && s.subject !== 'All subjects' ? 'Class Teacher, Teacher' : isTeacher(s) ? 'Teacher' : s.desig;
  return (
    <Split>
      <Col>
        <Card>
          <CardHead title="Personal details" action={<EditBtn what="personal details" show={canEdit} />} />
          <DL rows={[
            ['Date of birth', s.dob], ['Gender', s.female ? 'Female' : 'Male'], ['Blood group', s.blood],
            ['Aadhaar', <Secret key="a" full={s.aadhaar} masked={`XXXX XXXX ${s.last4}`} can={can} own={own} />],
            ['PAN', <Secret key="p" full={s.pan} masked={`XXXXXX${s.pan.slice(-4)}`} can={can} own={own} />],
            ['Qualifications', s.quals], ['Experience', s.exp], ['Home address', s.address],
          ]} />
        </Card>
        <Card>
          <CardHead title="Employment" action={<EditBtn what="employment details" show={canEdit} />} />
          <DL rows={[
            ['Staff ID', <span key="c" className="font-mono text-[13.5px]">{s.code}</span>], ['Designation', s.desig], ['Department', s.dept], ['Joining date', s.joined],
            ['Employment type', s.type], ['Reporting manager', s.manager], ['Campus', 'Kukatpally'], ['Salary account', <Secret key="b" full={s.bank} masked={`HDFC Bank · A/c XXXXXXXX${s.last4}`} can={can} own={own} />],
          ]} />
        </Card>
        <Card>
          <CardHead title="Emergency contacts" sub="Called in this order" action={<EditBtn what="emergency contacts" show={canEdit || own} />} />
          <ol className="px-5 pb-4">
            {[{ n: `${['Ramesh', 'Sujatha', 'Prasad', 'Lavanya'][h % 4]} ${s.name.split(' ').slice(-1)[0]}`, r: s.female ? 'Husband' : 'Wife', p: `98${String(h % 1000).padStart(3, '0')} ${String((h >>> 5) % 100000).padStart(5, '0')}` },
              { n: `${['Narayana', 'Kamala', 'Venkatesh', 'Saroja'][(h >>> 2) % 4]} ${s.name.split(' ').slice(-1)[0]}`, r: (h >>> 2) % 2 ? 'Mother' : 'Father', p: `94${String((h >>> 2) % 1000).padStart(3, '0')} ${String((h >>> 7) % 100000).padStart(5, '0')}` }].map((e, i) => (
              <li key={i} className="flex items-center gap-3 py-2 border-b border-line/70 last:border-0">
                <span className="w-6 h-6 rounded-full bg-sunken text-[12px] font-bold grid place-items-center tnum">{i + 1}</span>
                <span className="flex-1 min-w-0 text-[14px] truncate"><b className="font-semibold">{e.n}</b> <span className="text-ink3">· {e.r}</span></span>
                <span className="text-[14px] tnum select-all">{e.p}</span>
              </li>
            ))}
          </ol>
        </Card>
      </Col>
      <Col>
        <Card>
          <CardHead title="Today" icon={I.Sun} />
          <ul className="px-5 pb-5 flex flex-col gap-3 text-[14px]">
            {s.status === 'On leave' ? <li className="flex gap-3"><I.CalendarDays size={18} className="text-info shrink-0 mt-0.5" /><span><b className="font-semibold">On leave</b> · back {s.id === 'T13' ? 'on 2 Mar 2027' : 'on Sat 10 Oct'}</span></li>
              : s.status === 'Not in yet' ? <li className="flex gap-3"><I.Clock size={18} className="text-warn shrink-0 mt-0.5" /><span><b className="font-semibold">Not in yet</b> · no leave asked for today</span></li>
                : <li className="flex gap-3"><I.CircleCheck size={18} className="text-ok shrink-0 mt-0.5" /><span><b className="font-semibold">{s.status === 'Late' ? 'Came late' : 'Present'}</b> · face scan at the gate, {s.status === 'Late' ? '9:12 AM' : '8:31 AM'}</span></li>}
            {isTeacher(s) && <li className="flex gap-3"><I.Clock size={18} className="text-ink3 shrink-0 mt-0.5" /><span>Now: period 3 (10:30–11:15) · {classesFor(s)[0][0]} {classesFor(s)[0][1]}</span></li>}
            <li className="flex gap-3"><I.Mail size={18} className="text-ink3 shrink-0 mt-0.5" /><span className="min-w-0 break-words">{s.email} <Pill tone="ok" className="!h-5 !text-[11px] ml-1">Verified</Pill></span></li>
            <li className="flex gap-3"><I.Phone size={18} className="text-ink3 shrink-0 mt-0.5" /><span className="tnum">+91 {s.phone} <Pill tone="ok" className="!h-5 !text-[11px] ml-1">Verified</Pill></span></li>
          </ul>
        </Card>
        <Card>
          <CardHead title="Login and roles" icon={I.KeyRound} />
          <DL cols={1} rows={[['Username', <span key="u" className="font-mono text-[13.5px]">{s.email.split('@')[0]}</span>], ['Roles', roles], ['Last sign-in', `Today, ${7 + (h % 3)}:${10 + (h % 49)} AM · phone`]]} />
          {canEdit && <div className="px-5 pb-5 -mt-1 flex gap-2 flex-wrap">
            <Button size="sm" variant="secondary" icon={I.KeyRound} onClick={() => toast({ title: `Password reset link sent to ${s.first}` })}>Reset password</Button>
            <Button size="sm" variant="ghost" icon={I.UserCog} onClick={() => toast({ title: 'Opening Settings, Users & Permissions', tone: 'info' })}>Change roles</Button>
          </div>}
        </Card>
      </Col>
    </Split>
  );
}

function ProfileClasses({ s }) {
  const { go } = useNav();
  const can = useCan();
  const cls = classesFor(s);
  return (
    <Split>
      <Card className="overflow-hidden">
        <CardHead title="Classes and subjects" sub="From Academic Management, Teacher Allocation" action={can('academic', 'allocation') ? <Button size="sm" variant="ghost" icon={I.ArrowUpRight} onClick={() => go('academic', { page: 'allocation' })}>Open</Button> : null} />
        <ul className="px-2 pb-2">
          {cls.map(([sub, c, n]) => <li key={c + sub}><Row icon={I.BookOpen} iconTone="brand" title={`${sub} · Class ${c}`} sub={`${n} periods a week`} right={c === s.classTeacher ? <Pill tone="brand">Class teacher</Pill> : null} /></li>)}
        </ul>
      </Card>
      <Card>
        <CardHead title="Class teacher of" />
        {s.classTeacher ? (
          <div className="px-5 pb-5 text-[14px] flex flex-col gap-2">
            <p className="font-display text-[26px] font-semibold">Class {s.classTeacher}</p>
            <p className="text-ink3">{s.classTeacher === '7 B' ? '38 students · Godavari, Krishna, Kaveri and Narmada houses' : 'Takes daily attendance and writes report card remarks'}</p>
            {can('students') && <Button className="self-start mt-1" size="sm" variant="secondary" icon={I.Users} onClick={() => go('students')}>See the class</Button>}
          </div>
        ) : <p className="px-5 pb-5 text-[14px] text-ink3">Not a class teacher this year.</p>}
      </Card>
    </Split>
  );
}

function ProfileTimetable({ s }) {
  const cells = weekGrid(s);
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return (
    <Card className="overflow-hidden">
      <CardHead title="This week" sub="Regular time table. Half-yearly exam days from Mon 12 Oct replace these periods." />
      <div className="overflow-x-auto scroll-thin">
        <table className="text-[12.5px] min-w-full">
          <thead>
            <tr className="border-y border-line text-ink3">
              <th className="sticky left-0 bg-surface text-left font-semibold px-4 py-2 w-16">Day</th>
              {PERIODS.map((p) => <th key={p.p} className="font-semibold px-1.5 py-2 min-w-[86px] text-left">P{p.p}<span className="block text-[10.5px] font-medium tnum">{p.t}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {days.map((d, di) => (
              <tr key={d} className="border-b border-line/60 last:border-0">
                <td className={cx('sticky left-0 bg-surface px-4 py-1.5 font-semibold', di === 4 && 'text-brand')}>{d}</td>
                {PERIODS.map((p, pi) => {
                  const c = cells[di * 8 + pi];
                  return <td key={pi} className="px-1 py-1">{c ? <span className={cx('block rounded-lg px-2 py-1.5 leading-tight', di === 4 && pi === 2 ? 'bg-brand text-brandink' : 'bg-brand/10 text-brand')}><b className="font-semibold block">{c[1]}</b><span className="text-[11px] opacity-80 truncate block">{c[0] === 'All subjects' ? 'Class' : c[0]}</span></span> : <span className="block rounded-lg px-2 py-1.5 text-ink3/70 bg-sunken/60">Free</span>}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ProfileAttendance({ s }) {
  const h = hash(s.name);
  const lateDay = 3 + (h % 5);
  // October 2026 is drawn by hand from the day's records; earlier months come from the attendance history
  const oct = (d) => {
    if (d > 9) return HOLIDAYS.has(d) ? { tone: 'info', title: 'Dussehra holidays' } : { tone: 'muted' };
    const dow = new Date(2026, 9, d).getDay();
    if (dow === 0) return { tone: 'muted', title: 'Sunday' };
    if (d === 2) return { tone: 'info', title: 'Gandhi Jayanti' };
    if (s.id === 'T13') return { tone: 'brand', title: 'On leave' };
    if ((s.id === 'T03' && d >= 8) || (s.id === 'A07' && d === 9)) return { tone: 'brand', title: 'On leave' };
    if (s.id === 'T12' && d === 9) return { tone: 'muted', title: 'Not in yet' };
    if (d === lateDay || (s.id === 'T07' && d === 9)) return { tone: 'warn', title: 'Late' };
    return { tone: 'ok', title: 'Present' };
  };
  const past = markCell(s.name);
  const cell = (y, m, d) => {
    if (y === 2026 && m === 9) return oct(d);
    if (s.id === 'T13' && y === 2026 && m === 8 && schoolDay(y, m, d).kind === 'school') return { tone: 'brand', title: 'On leave' };
    const c = past(y, m, d);
    return c.title === 'On leave' ? { ...c, tone: 'brand' } : c;
  };
  const leaveDays = s.id === 'T13' ? 7 : s.id === 'T03' ? 2 : s.id === 'A07' ? 1 : 0;
  const totals = (y, m) => {
    if (y === 2026 && m === 9) return { school: 7, present: 7 - leaveDays - (s.id === 'T12' ? 1 : 0), late: s.id === 'T13' ? 0 : s.id === 'T07' ? 2 : 1, leave: leaveDays, absent: 0 };
    if (s.id === 'T13' && (y > 2026 || (y === 2026 && m >= 8))) { const t = monthTotals(s.name, y, m); return { school: t.school, present: 0, late: 0, leave: t.school, absent: 0 }; }
    return monthTotals(s.name, y, m);
  };
  const year = [5, 6, 7, 8, 9].map((m) => totals(2026, m)).reduce((x, t) => ({ school: x.school + t.school, present: x.present + t.present, late: x.late + t.late, leave: x.leave + t.leave, absent: x.absent + (t.absent || 0) }), { school: 0, present: 0, late: 0, leave: 0, absent: 0 });
  const Line = ({ k, v, tone }) => <li className="flex justify-between"><span className="text-ink3">{k}</span><b className={cx('font-semibold', tone)}>{v}</b></li>;
  return (
    <Split side={300}>
      <Card>
        <CardHead title="Attendance by month" sub="From Staff Attendance · face scan at the gate · go back to earlier months" />
        <div className="px-5 pb-5">
          <CalendarMonth id={`sa-${s.id}`} cell={cell} footer={(y, m) => {
            const t = totals(y, m);
            return (
              <>
                <p className="text-[13px] text-ink2 tnum"><b className="font-semibold">{y === 2026 && m === 9 ? 'This month so far' : `${MONTH_NAMES[m]} ${y}`}:</b> {t.school} school days · <span className="text-ok font-semibold">{t.present} present</span> · <span className="text-warn font-semibold">{t.late} late</span>{t.absent ? <> · <span className="text-bad font-semibold">{t.absent} absent</span></> : null} · {t.leave} on leave</p>
                <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3 text-[12.5px] text-ink2">
                  {[['bg-ok/15', 'Present'], ['bg-warn/15', 'Late'], ['bg-bad/15', 'Absent'], ['bg-brand/12', 'Leave'], ['bg-info/10', 'Holiday']].map(([c, l]) => <span key={l} className="flex items-center gap-1.5"><span className={cx('w-3 h-3 rounded', c)} />{l}</span>)}
                </div>
              </>
            );
          }} />
        </div>
      </Card>
      <Card>
        <CardHead title="This school year so far" sub="1 Jun to 9 Oct 2026" />
        <ul className="px-5 pb-5 text-[14px] flex flex-col gap-2 tnum">
          <Line k="School days" v={year.school} />
          <Line k="Present" v={year.present} tone="text-ok" />
          <Line k="Late marks" v={year.late} tone="text-warn" />
          <Line k="Absent" v={year.absent} tone="text-bad" />
          <Line k="On leave" v={year.leave} />
          <li className="pt-2 mt-1 border-t border-line text-[12.5px] text-ink3 font-sans">3 late marks count as half a day’s pay (Salary Settings).</li>
        </ul>
      </Card>
    </Split>
  );
}

function ProfileLeave({ s, mode }) {
  const { role } = useRole();
  const used = usedFor(s);
  const hide = !SENSITIVE.includes(role.id) && mode !== 'own';
  return (
    <Split>
      <Card>
        <CardHead title="Leave taken and asked" sub="2026–27 leave year (Jun to May)" />
        <ul className="px-2 pb-2">
          {myHistory(s).map((r) => (
            <li key={r.id}><Row icon={I.CalendarDays} iconTone={r.status === 'Approved' ? 'ok' : r.status === 'Waiting' ? 'warn' : 'neutral'} title={`${leaveLabel(r.type, hide)} · ${r.when}`} sub={`${r.days} ${r.days === 1 ? 'day' : 'days'}${hide ? '' : ` · ${r.reason}`}`}
              right={<Pill tone={r.status === 'Approved' ? 'ok' : r.status === 'Waiting' ? 'warn' : 'bad'}>{r.status}</Pill>} /></li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHead title="Balance" sub="Allocated, used, left" />
        <ul className="px-5 pb-5 flex flex-col gap-4">
          {LEAVE_TYPES.filter((t) => t.k !== 'ML' || used.ML).map((t) => (
            <li key={t.k}>
              <div className="flex justify-between text-[13.5px] mb-1.5"><span className="font-semibold">{t.name}</span><span className="tnum text-ink2">{t.quota - (used[t.k] || 0)} left of {t.quota}</span></div>
              <Progress value={((used[t.k] || 0) / t.quota) * 100} tone={(t.quota - (used[t.k] || 0)) <= 2 ? 'warn' : 'brand'} />
            </li>
          ))}
        </ul>
      </Card>
    </Split>
  );
}

function ProfileWorkload({ s }) {
  const cls = classesFor(s);
  const periods = cls.reduce((a, c) => a + c[2], 0);
  const h = hash(s.name);
  return (
    <Split>
      <Card>
        <CardHead title="Periods a week" sub="Against the limit of 34 set in Academic Settings" />
        <div className="px-5 pb-5 flex flex-col gap-4">
          <div className="flex items-baseline gap-2"><span className="font-display text-[30px] font-semibold tnum">{periods}</span><span className="text-ink3 text-[14px]">of 34 periods · {34 - periods} free for substitutions</span></div>
          <Progress value={(periods / 34) * 100} tone={periods > 30 ? 'warn' : 'brand'} />
          <HBars rows={cls.map(([sub, c, n]) => ({ k: c, v: n, label: `${n}` }))} max={Math.max(8, ...cls.map((c) => c[2]))} unit="" labelWidth={56} />
        </div>
      </Card>
      <Card>
        <CardHead title="Substitutions taken" sub="This term" />
        <ul className="px-2 pb-2">
          {[['Thu 8 Oct', `Period 5 · English ${['8 A', '9 C', '6 B'][h % 3]} for Anitha Kumari`], ['Tue 6 Oct', 'Period 2 · Hindi 9 C for Deepak Verma'], ['Mon 28 Sep', 'Period 7 · Games 7 A for Mohammed Asif']].slice(0, 1 + (h % 3)).map(([d, t]) => <li key={d}><Row icon={I.Repeat} title={t} sub={d} /></li>)}
        </ul>
      </Card>
    </Split>
  );
}

function ProfilePerformance({ s }) {
  const ap = APPRAISALS.find((a) => a[0] === s.id);
  const tr = TRAINING.filter((t) => t.sid === s.id);
  const hrs = tr.reduce((a, t) => a + t.hours, 0);
  const cls = classesFor(s);
  const h = hash(s.name);
  return (
    <Split>
      <Col>
        <Card>
          <CardHead title="Appraisal 2026–27" sub="Self review till 31 Oct, manager review in November" />
          <div className="px-5 pb-5 flex items-center gap-4 flex-wrap">
            <Pill tone={APP_TONE[ap?.[1] || 'Not started']}>{ap?.[1] || 'Not started'}</Pill>
            <span className="text-[14px] text-ink2">Last year: <b className="font-semibold">{['Good', 'Very good', 'Outstanding'][h % 3]}</b> ({3 + (h % 3)} of 5)</span>
          </div>
        </Card>
        {isTeacher(s) && (
          <Card>
            <CardHead title="Results of their classes" sub={`Unit Test 2 average in ${cls[0][0] === 'All subjects' ? 'all subjects' : cls[0][0]}`} />
            <div className="px-5 pb-5"><HBars rows={cls.map(([, c], i) => ({ k: c, v: 68 + ((h >>> i) % 22) }))} goal={75} lowBelow={70} labelWidth={56} /></div>
          </Card>
        )}
      </Col>
      <Card>
        <CardHead title="Training this year" sub={isTeacher(s) ? `${hrs} of 50 hours CBSE asks for` : `${hrs} hours recorded`} />
        {tr.length ? <ul className="px-2 pb-2">{tr.map((t) => <li key={t.course}><Row icon={I.GraduationCap} title={t.course} sub={`${t.dates} · ${t.hours} hours`} right={t.cert ? <Pill tone="ok">Certificate</Pill> : null} /></li>)}</ul>
          : <p className="px-5 pb-5 text-[14px] text-ink3">No training recorded yet this year.</p>}
      </Card>
    </Split>
  );
}

function ProfileDocs({ s, mode }) {
  const toast = useToast();
  const canEdit = useCanEdit() && (mode === 'full' || mode === 'own');
  const docs = myDocs(s);
  return (
    <Card>
      <CardHead title="Documents" sub={`${docs.filter((d) => d.status === 'Valid').length} of ${docs.length} valid · ID numbers are masked`} action={canEdit && <Button size="sm" variant="soft" icon={I.Upload} onClick={() => toast({ title: 'Choose a file or take a photo', body: 'JPG, PNG or PDF up to 5 MB', tone: 'info' })}>Upload</Button>} />
      <DocList docs={docs} onAdd={(d) => toast({ title: `Upload ${d.type}`, body: 'HR is told when it arrives', tone: 'info' })} />
    </Card>
  );
}
function DocList({ docs, onAdd }) {
  const toast = useToast();
  return (
    <ul className="px-3 pb-3">
      {docs.map((d) => {
        const missing = d.status === 'Missing';
        return (
          <li key={d.type} className="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-sunken/60">
            <span className={cx('w-10 h-10 rounded-xl grid place-items-center shrink-0', missing || d.status === 'Expired' ? 'bg-warn/12 text-warn' : 'bg-sunken text-ink2')}>{missing ? <I.FileWarning size={19} /> : <I.FileText size={19} />}</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[14px] truncate">{d.type}</p>
              <p className="text-[12.5px] text-ink3 truncate">{missing ? 'Not collected yet' : `${d.kind === 'ID proof' ? `XXXX ${d.num} · ` : ''}${d.expires ? `Expires ${d.expires}` : `Added ${d.issued}`} · ${d.size}`}</p>
            </div>
            <Pill tone={DOC_STATUS[d.status]} className="hidden @sm:inline-flex">{d.status}</Pill>
            {missing || d.status !== 'Valid' ? <Button size="sm" variant="secondary" icon={I.Upload} onClick={() => onAdd(d)}>{missing ? 'Add' : 'Renew'}</Button>
              : <Button size="sm" variant="ghost" icon={I.Eye} onClick={() => toast({ title: `Opening ${d.type}`, tone: 'info' })}>View</Button>}
          </li>
        );
      })}
    </ul>
  );
}

function ProfileSalary({ s, mode }) {
  const { go } = useNav();
  const can = useCan();
  const h = hash(s.name);
  const gross = s.desig === 'Principal' ? 125000 : s.desig === 'Vice Principal' ? 102000 : s.dept === 'Teaching' ? (s.desig.startsWith('PGT') ? 52000 : s.desig === 'PRT' ? 26500 : 38000) : s.dept === 'Transport' ? 18500 : s.dept === 'Support' ? 12500 : s.dept === 'Accounts' ? 36000 : 24000 + (h % 6) * 1000;
  const pf = Math.round(Math.min(gross * 0.58, 15000) * 0.12);
  const esi = gross <= 21000 ? Math.ceil(gross * 0.0075) : 0;
  const pt = gross <= 15000 ? 0 : gross <= 20000 ? 150 : 200;
  const net = gross - pf - esi - pt - (s.desig === 'Principal' ? 6200 : 0);
  if (mode === 'own') {
    return (
      <Card className="p-5 flex flex-col @md:flex-row @md:items-center gap-4">
        <span className="w-12 h-12 rounded-2xl bg-brand/10 text-brand grid place-items-center shrink-0"><I.Wallet size={22} /></span>
        <div className="flex-1"><p className="font-semibold text-[15px]">Your salary slips are in Salary, My Salary Slips</p><p className="text-[13.5px] text-ink3">September 2026 was paid on Wed 30 Sep. Only you can see your slips.</p></div>
        <Button variant="primary" icon={I.ArrowUpRight} onClick={() => go('salary', { page: 'slips' })}>My salary slips</Button>
      </Card>
    );
  }
  return (
    <Split>
      <Card>
        <CardHead title="Monthly salary" sub="Structure v3 · from 1 Jun 2026 · shown only to Principal, School Admin and HR" icon={I.Lock} />
        <div className="grid grid-cols-3 gap-4 px-5 pb-5">
          <div><p className="text-[12px] text-ink3 font-semibold">Gross</p><p className="text-[18px] font-semibold tnum">₹{gross.toLocaleString('en-IN')}</p></div>
          <div><p className="text-[12px] text-ink3 font-semibold">Deductions</p><p className="text-[18px] font-semibold tnum">₹{(gross - net).toLocaleString('en-IN')}</p></div>
          <div><p className="text-[12px] text-ink3 font-semibold">Net</p><p className="text-[18px] font-semibold tnum text-ok">₹{net.toLocaleString('en-IN')}</p></div>
        </div>
        {can('salary', 'structures') && <div className="px-5 pb-5"><Button variant="secondary" icon={I.ArrowUpRight} onClick={() => go('salary', { page: 'structures' })}>Open in Salary Management</Button></div>}
      </Card>
      <Card>
        <CardHead title="Last 3 months" />
        <ul className="px-2 pb-2">
          {['September 2026 · paid 30 Sep', 'August 2026 · paid 31 Aug', 'July 2026 · paid 31 Jul'].map((m) => <li key={m}><Row icon={I.ReceiptText} title={m.split(' · ')[0]} sub={m.split(' · ')[1]} right={<b className="font-semibold tnum">₹{net.toLocaleString('en-IN')}</b>} /></li>)}
        </ul>
      </Card>
    </Split>
  );
}

/* ======================= Add Staff (three steps) ======================= */
const DESIGS = ['Teacher', 'Lecturer', 'Coordinator', 'Vice Principal', 'Academic Head', 'HR Manager', 'Accountant', 'Cashier-cum-Accountant', 'Receptionist', 'Librarian', 'Lab Assistant', 'Driver', 'Security', 'Housekeeping', 'Support Staff'];
const DESIG_DEPT = { Teacher: 'Teaching', Lecturer: 'Teaching', Coordinator: 'Teaching', 'Vice Principal': 'Teaching', 'Academic Head': 'Teaching', 'Lab Assistant': 'Teaching', 'HR Manager': 'Office', Accountant: 'Accounts', 'Cashier-cum-Accountant': 'Accounts', Receptionist: 'Office', Librarian: 'Library', Driver: 'Transport', Security: 'Support', Housekeeping: 'Support', 'Support Staff': 'Support' };
const DESIG_ROLE = { Teacher: 'teacher', Lecturer: 'teacher', Coordinator: 'teacher', Accountant: 'accountant', 'Cashier-cum-Accountant': 'accountant', Receptionist: 'receptionist', Librarian: 'librarian', Driver: 'driver', Security: 'gatesecurity', 'HR Manager': 'hr', 'Vice Principal': 'vp', 'Academic Head': 'academichead' };
const ROLE_CARDS = [
  { id: 'teacher', name: 'Teacher', can: ['Takes attendance for their classes', 'Gives homework and enters marks for their subjects'] },
  { id: 'classteacher', name: 'Class Teacher', can: ['Everything a teacher does', 'Approves student leave and writes report card remarks for their class'] },
  { id: 'accountant', name: 'Accountant', can: ['Collects fees and records expenses', 'Prepares the month’s salary'] },
  { id: 'librarian', name: 'Librarian', can: ['Issues and returns books', 'Collects library fines'] },
  { id: 'receptionist', name: 'Receptionist', can: ['Adds visitors and enquiries', 'Gives pickup gate passes'] },
  { id: 'transport', name: 'Transport In-charge', can: ['Manages routes, buses and drivers', 'Sees buses live'] },
  { id: 'warden', name: 'Hostel Warden', can: ['Roll call, outings and visitors', 'Approves boarders’ outings'] },
  { id: 'storekeeper', name: 'Store Keeper', can: ['Issues and receives stock', 'Raises purchase orders'] },
  { id: 'hr', name: 'HR', tpl: true, can: ['Staff records, leave and documents', 'Checks leave reaching the salary'] },
  { id: 'officestaff', name: 'Office Staff', tpl: true, can: ['Admissions and student records', 'Datesheets and admit cards'] },
  { id: 'examincharge', name: 'Exam In-charge', tpl: true, can: ['Datesheets, marks and results', 'Report cards'] },
  { id: 'gatesecurity', name: 'Gate Security', tpl: true, can: ['Visitors at the gate', 'Checks pickup gate passes'] },
  { id: 'driver', name: 'Driver', tpl: true, can: ['Driver app only: today’s trips', 'Own leave and salary slips'] },
  { id: 'vp', name: 'Vice Principal', tpl: true, can: ['Runs the school day', 'Approves student and staff leave'] },
  { id: 'academichead', name: 'Academic Head', tpl: true, can: ['Time table and syllabus', 'Exams and homework'] },
];
const PERMS = [
  ['Attendance', [['Take attendance for their classes', true], ['Change attendance after it locks', false]]],
  ['Homework & Learning', [['Give homework', true], ['Grade submissions', true]]],
  ['Exams & Results', [['Enter marks for their subjects', true], ['Publish results', false]]],
  ['Fees', [['Collect fees at the counter', false]]],
  ['Communication', [['Message parents of their classes', true], ['Message the whole school', false]]],
];
const CLASS_LIST = ['Nursery A', 'LKG A', 'LKG B', 'UKG A', 'UKG B', ...Array.from({ length: 10 }, (_, i) => (i < 8 ? ['A', 'B'] : ['A', 'B', 'C']).map((x) => `${i + 1} ${x}`)).flat()];

function AddStaff() {
  const { go } = useNav();
  const toast = useToast();
  const blank = { name: '', phone: '', desig: 'Teacher', dept: 'Teaching', joined: '09-10-2026', gender: '', email: '', dob: '', blood: '', aadhaar: '', type: 'Permanent', manager: 'Srinivas Murthy', pv: false, ev: false };
  const [step, setStep] = useState(1);
  const [f, setF] = useState(blank);
  const [more, setMore] = useState(false);
  const [touched, setTouched] = useState({});
  const [roles, setRoles] = useState(new Set(['teacher']));
  const [adv, setAdv] = useState(false);
  const [perms, setPerms] = useState(() => Object.fromEntries(PERMS.flatMap(([, ps]) => ps.map(([p, on]) => [p, on]))));
  const [login, setLogin] = useState('invite');
  const [user, setUser] = useState('');
  const [picked, setPicked] = useState({ '6 A': ['Mathematics'], '6 B': ['Mathematics'] });
  const [done, setDone] = useState(false);
  const [imp, setImp] = useState(false);
  const digits = f.phone.replace(/\D/g, '');
  const dup = ALL.find((s) => s.phone.replace(/\D/g, '') === digits);
  const err = {
    name: !f.name.trim() ? 'Enter the full name' : f.name.trim().length < 3 ? 'Name looks too short' : '',
    phone: !digits ? 'Enter a mobile number. The invite goes to it.' : digits.length !== 10 ? `Phone has ${digits.length} digits. Indian mobile numbers have 10.` : !/^[6-9]/.test(digits) ? 'Indian mobile numbers start with 6, 7, 8 or 9' : dup ? `This phone belongs to ${dup.name} (${dup.desig})` : '',
    joined: !parseDMY(f.joined) ? 'Enter the date as DD-MM-YYYY' : '',
  };
  const show = (k) => touched[k] && err[k];
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v && v.target ? v.target.value : v }));
  const autoUser = f.name.trim() ? f.name.trim().toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/).join('.') : 'firstname.lastname';
  const teaching = DESIG_DEPT[f.desig] === 'Teaching';
  const roleName = (id) => ROLE_CARDS.find((r) => r.id === id)?.name;
  const extra = PERMS.flatMap(([, ps]) => ps).filter(([p, on]) => perms[p] && !on).length + PERMS.flatMap(([, ps]) => ps).filter(([p, on]) => !perms[p] && on).length;
  const classesPicked = Object.keys(picked);
  const next = () => {
    if (step === 1) { setTouched({ name: 1, phone: 1, joined: 1 }); if (err.name || err.phone || err.joined) return; if (!user) setUser(autoUser); }
    if (step === 2 && !roles.size) { toast({ title: 'Pick at least one role', body: 'A role decides what they can open.', tone: 'bad' }); return; }
    setStep(step + 1);
  };
  const reset = () => { setF(blank); setTouched({}); setStep(1); setDone(false); setRoles(new Set(['teacher'])); setUser(''); setPicked({}); };
  const steps = ['Details', 'What they can open', 'Classes and subjects'];
  const flip = (id) => setRoles((x) => { const n = new Set(x); n.has(id) ? n.delete(id) : n.add(id); return n; });

  if (done) {
    return (
      <div>
        <ModuleHead sub="Staff member created" />
        <Card className="max-w-2xl mx-auto p-6 @md:p-8 flex flex-col items-center text-center">
          <span className="w-16 h-16 rounded-full bg-ok text-surface grid place-items-center animate-pop shadow-pop"><I.Check size={34} strokeWidth={3} /></span>
          <h2 className="font-display text-[24px] font-semibold mt-4">{f.name.trim() || 'New staff member'} is added</h2>
          <p className="text-ink3 text-[14px] mt-1">{login === 'invite' ? `Invite sent on WhatsApp to +91 ${f.phone}. The link to set a password works for 48 hours.` : 'Give them the temporary password. They must change it at first sign-in.'}</p>
          <div className="w-full mt-5 text-left rounded-2xl border border-line overflow-hidden">
            <DL rows={[['Staff ID', <span key="i" className="font-mono">SPS-{teaching ? 'T' : 'A'}-034</span>], ['Login', <span key="l" className="font-mono">{user || autoUser}</span>], ['Roles', [...roles].map(roleName).join(', ')], ['Classes', teaching && classesPicked.length ? classesPicked.map((c) => `${c} (${picked[c].join(', ') || 'no subject'})`).join('; ') : 'Not teaching']]} />
          </div>
          <div className="grid grid-cols-1 @sm:grid-cols-3 gap-2 w-full mt-4">
            <Button variant="secondary" icon={I.IdCard} onClick={() => toast({ title: 'ID card sent to the office printer' })}>Print ID card</Button>
            <Button variant="secondary" icon={I.UserPlus} onClick={reset}>Add another</Button>
            <Button variant="primary" icon={I.UserRound} onClick={() => go('staff', { page: 'list' })}>Back to Staff List</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <ModuleHead sub="Three steps: details, what they can open, their classes. About 3 minutes." actions={<Button variant="secondary" icon={I.Upload} onClick={() => setImp(true)}>Import many</Button>} />
      <Split>
        <Col>
          <ol className="grid grid-cols-3 gap-2">
            {steps.map((t, i) => {
              const n = i + 1, on = n === step, past = n < step;
              return (
                <li key={t}>
                  <button onClick={() => past && setStep(n)} disabled={!past} className={cx('w-full text-left rounded-2xl border px-3 py-2.5 transition', on ? 'border-brand bg-brand/5 ring-1 ring-brand' : past ? 'border-line bg-surface hover:bg-sunken' : 'border-line bg-surface opacity-70')}>
                    <span className={cx('inline-grid place-items-center w-6 h-6 rounded-full text-[12px] font-bold tnum mb-1', past ? 'bg-ok/15 text-ok' : on ? 'bg-brand text-brandink' : 'bg-sunken text-ink3')}>{past ? <I.Check size={13} strokeWidth={3} /> : n}</span>
                    <span className="block text-[13px] font-semibold leading-tight">{t}</span>
                  </button>
                </li>
              );
            })}
          </ol>

          {step === 1 && (
            <Card className="p-5 flex flex-col gap-4">
              <Field label="Full name" required id="ad-name" error={show('name')}>
                <Input id="ad-name" value={f.name} onChange={set('name')} onBlur={() => setTouched({ ...touched, name: 1 })} error={show('name')} placeholder="As on Aadhaar" autoComplete="off" />
              </Field>
              <Field label="Mobile number" required id="ad-phone" error={show('phone')} hint={!show('phone') && 'We check it against staff and logins, so nobody is added twice'}>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3 text-[15px]">+91</span>
                  <Input id="ad-phone" inputMode="numeric" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/[^\d ]/g, '').slice(0, 12) })} onBlur={() => setTouched({ ...touched, phone: 1 })} error={show('phone')} className="pl-12 tnum" placeholder="98480 12345" />
                </div>
                {show('phone') && dup && <Button type="button" size="sm" variant="secondary" className="self-start" icon={I.UserRound} onClick={() => go('staff', { page: 'profile', id: dup.id })}>Open {dup.first}’s profile</Button>}
              </Field>
              <div className="grid @sm:grid-cols-2 gap-4">
                <Field label="Designation" required id="ad-desig" hint="A designation is not a role. Step 2 decides what they can open.">
                  <Select id="ad-desig" value={f.desig} onChange={(v) => { setF({ ...f, desig: v, dept: DESIG_DEPT[v] || f.dept }); setRoles(new Set([DESIG_ROLE[v] || 'officestaff'])); }} options={DESIGS} />
                </Field>
                <Field label="Department" id="ad-dept" hint="Filled from the designation"><Select id="ad-dept" value={f.dept} onChange={set('dept')} options={DEPARTMENTS.map((d) => d.k)} /></Field>
              </div>
              <div className="grid @sm:grid-cols-2 gap-4">
                <Field label="Joining date" required id="ad-join" error={show('joined')}><Input id="ad-join" value={f.joined} onChange={set('joined')} onBlur={() => setTouched({ ...touched, joined: 1 })} error={show('joined')} placeholder="DD-MM-YYYY" inputMode="numeric" /></Field>
                <Field label="Gender" id="ad-g"><Segmented value={f.gender} onChange={set('gender')} options={['Female', 'Male', 'Other']} className="w-full" /></Field>
              </div>
              <Field label="Email" id="ad-email" hint="Needed only for an email invite"><Input id="ad-email" type="email" value={f.email} onChange={set('email')} placeholder="name@gmail.com" /></Field>
              <div className="flex items-center gap-3 rounded-xl border border-dashed border-line p-3">
                <Avatar name={f.name.trim() || 'New Staff'} size={44} />
                <div className="flex-1 min-w-0"><p className="text-[14px] font-semibold">Photo</p><p className="text-[12.5px] text-ink3">JPG or PNG up to 2 MB. We make it smaller for the ID card.</p></div>
                <Button type="button" size="sm" variant="secondary" icon={I.Camera} onClick={() => toast({ title: 'Choose a photo or take one', tone: 'info' })}>Add photo</Button>
              </div>
              <div className="flex flex-col gap-2.5">
                <label className="flex items-center gap-3 text-[14px]"><Checkbox checked={f.pv} onChange={set('pv')} label="Phone verified" /><span><b className="font-semibold">Phone verified</b> <span className="text-ink3">· called or OTP checked</span></span></label>
                <label className="flex items-center gap-3 text-[14px]"><Checkbox checked={f.ev} onChange={set('ev')} label="Email verified" /><span><b className="font-semibold">Email verified</b></span></label>
              </div>
              <button type="button" onClick={() => setMore(!more)} className="self-start inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-brand h-8 px-1 rounded-lg">
                {more ? <I.ChevronUp size={16} /> : <I.ChevronDown size={16} />}More details
              </button>
              {more && (
                <div className="grid @sm:grid-cols-2 gap-4 animate-rise">
                  <Field label="Date of birth" id="ad-dob"><Input id="ad-dob" value={f.dob} onChange={set('dob')} placeholder="DD-MM-YYYY" /></Field>
                  <Field label="Blood group" id="ad-blood"><Select id="ad-blood" value={f.blood} onChange={set('blood')} options={[{ value: '', label: 'Choose' }, 'A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']} /></Field>
                  <Field label="Aadhaar number" id="ad-aad" hint="Only HR, School Admin and the Principal can see it"><Input id="ad-aad" value={f.aadhaar} onChange={set('aadhaar')} inputMode="numeric" placeholder="12 digits" className="tnum" /></Field>
                  <Field label="Employment type" id="ad-type"><Select id="ad-type" value={f.type} onChange={set('type')} options={['Permanent', 'Contract', 'Temporary', 'Part-time']} /></Field>
                  <Field label="Reporting manager" id="ad-mgr"><Select id="ad-mgr" value={f.manager} onChange={set('manager')} options={['Srinivas Murthy', 'Anita Sharma', 'Suresh Babu', 'Venkatesh Goud', 'Lakshmi Rao']} /></Field>
                  <Field label="Qualifications" id="ad-q"><Input id="ad-q" placeholder="M.Sc., B.Ed." /></Field>
                  <Field label="Current address" id="ad-addr" className="@sm:col-span-2"><Input id="ad-addr" placeholder="House, street, area, city, PIN" /></Field>
                </div>
              )}
            </Card>
          )}

          {step === 2 && (
            <>
              <Card>
                <CardHead title="Roles" sub="Pick one or more. Each says in plain words what they can do." />
                <div className="grid @md:grid-cols-2 gap-2 px-5 pb-5">
                  {ROLE_CARDS.map((r) => {
                    const on = roles.has(r.id);
                    return (
                      <div key={r.id} role="button" tabIndex={0} onClick={() => flip(r.id)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), flip(r.id))}
                        className={cx('text-left rounded-2xl border p-3 flex gap-3 transition cursor-pointer', on ? 'border-brand bg-brand/5 ring-1 ring-brand' : 'border-line hover:bg-sunken/60')}>
                        <Checkbox checked={on} onChange={() => flip(r.id)} label={r.name} />
                        <span className="min-w-0">
                          <span className="font-semibold text-[14px] flex items-center gap-2">{r.name}{r.tpl && <Pill className="!h-5 !text-[11px]">Template</Pill>}</span>
                          {r.can.map((c) => <span key={c} className="block text-[12.5px] text-ink3">{c}</span>)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Card>
              <Card>
                <CardHead title="Where they work" sub="Teachers’ classes come from step 3" />
                <div className="px-5 pb-5 grid @sm:grid-cols-2 gap-4">
                  <Field label="Campus" id="ad-campus"><Select id="ad-campus" value="Kukatpally" onChange={() => {}} options={['Kukatpally', 'Miyapur campus', 'Both campuses']} /></Field>
                </div>
                <div className="border-t border-line/70">
                  <button type="button" onClick={() => setAdv(!adv)} className="w-full flex items-center gap-2 px-5 py-3.5 text-[14px] font-semibold text-left hover:bg-sunken/60">
                    <I.SlidersHorizontal size={17} className="text-ink3" />Adjust permissions<span className="text-[12.5px] text-ink3 font-normal">· advanced</span>
                    {extra > 0 && <Pill tone="warn" className="ml-auto">{extra} change{extra > 1 ? 's' : ''} from the role</Pill>}
                    {adv ? <I.ChevronUp size={16} className={extra ? '' : 'ml-auto'} /> : <I.ChevronDown size={16} className={extra ? '' : 'ml-auto'} />}
                  </button>
                  {adv && (
                    <div className="px-5 pb-5 flex flex-col gap-4 animate-rise">
                      {PERMS.map(([m, ps]) => (
                        <div key={m}>
                          <p className="eyebrow text-ink3 mb-1.5">{m}</p>
                          {ps.map(([p, def]) => (
                            <label key={p} className="flex items-center gap-3 py-1.5 text-[14px]">
                              <Checkbox checked={perms[p]} onChange={(v) => setPerms({ ...perms, [p]: v })} label={p} />
                              <span className="flex-1">{p}</span>
                              {perms[p] !== def && <Pill tone="warn" className="!h-5 !text-[11px]">{perms[p] ? 'Extra' : 'Removed'}</Pill>}
                            </label>
                          ))}
                        </div>
                      ))}
                      {extra > 0 && <Banner tone="warn">{extra} change{extra > 1 ? 's' : ''} beyond the {roleName([...roles][0]) || 'chosen'} role. Shown on the profile and in the audit log.</Banner>}
                    </div>
                  )}
                </div>
              </Card>
              <Card className="p-5 flex flex-col gap-4">
                <h3 className="font-semibold text-[15px]">Login</h3>
                <Field label="Username" id="ad-user" hint="Made from the school’s format (first.last). You can change it."><Input id="ad-user" value={user || autoUser} onChange={(e) => setUser(e.target.value)} className="font-mono" /></Field>
                <Segmented value={login} onChange={setLogin} options={[{ value: 'invite', label: 'Send an invite' }, { value: 'temp', label: 'Temporary password' }]} />
                {login === 'invite' ? <p className="text-[13.5px] text-ink2 flex gap-2"><I.MessageCircle size={17} className="text-ok shrink-0" />WhatsApp and SMS to +91 {f.phone || 'their phone'}{f.email ? `, and email to ${f.email}` : ''}, with a link to set a password.</p>
                  : <div className="rounded-xl bg-sunken px-4 py-3 text-[14px]">Temporary password <b className="font-mono font-semibold ml-1">Sunrise@4821</b><span className="block text-[12.5px] text-ink3">They must change it at first sign-in.</span></div>}
              </Card>
            </>
          )}

          {step === 3 && (
            <Card>
              <CardHead title="Classes and subjects" sub={teaching ? 'Pick the classes, then tick the subjects for each. Saved in Teacher Allocation.' : `${f.desig} is not a teaching post. Skip this step.`} />
              {teaching ? (
                <div className="px-5 pb-5 flex flex-col gap-4">
                  <div className="flex flex-wrap gap-1.5">
                    {CLASS_LIST.map((c) => {
                      const on = !!picked[c];
                      return <button key={c} type="button" onClick={() => setPicked((x) => { const n = { ...x }; on ? delete n[c] : (n[c] = []); return n; })}
                        className={cx('h-9 px-3 rounded-xl text-[13px] font-semibold border transition', on ? 'bg-ink text-bg border-ink' : 'bg-surface border-line text-ink2 hover:border-ink3/50')}>{c}</button>;
                    })}
                  </div>
                  {classesPicked.length > 0 && (
                    <ul className="rounded-2xl border border-line divide-y divide-line/70">
                      {classesPicked.map((c) => (
                        <li key={c} className="px-4 py-3">
                          <p className="font-semibold text-[14px] mb-2">{c}</p>
                          {c.startsWith('Nursery') ? <p className="text-[13px] text-ink3">No subjects set for this class. <button type="button" className="text-brand font-semibold hover:underline" onClick={() => go('academic', { page: 'subjects' })}>Set them in Subjects</button></p> : (
                            <div className="flex flex-wrap gap-x-4 gap-y-2">
                              {SUBJECTS.slice(0, 8).map((sub) => (
                                <label key={sub} className="flex items-center gap-2 text-[13.5px]">
                                  <Checkbox checked={picked[c].includes(sub)} label={`${sub} in ${c}`} onChange={(v) => setPicked((x) => ({ ...x, [c]: v ? [...x[c], sub] : x[c].filter((y) => y !== sub) }))} />{sub}
                                </label>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : <div className="px-5 pb-5"><Banner tone="info">Nothing to choose here. Press Create staff to finish.</Banner></div>}
            </Card>
          )}

          <div className="flex gap-2 justify-between">
            <Button variant="ghost" icon={I.ArrowLeft} onClick={() => (step === 1 ? go('staff', { page: 'list' }) : setStep(step - 1))}>{step === 1 ? 'Cancel' : 'Back'}</Button>
            <div className="flex gap-2">
              {step === 3 && teaching && <Button variant="ghost" onClick={() => { setPicked({}); setDone(true); }}>Skip</Button>}
              {step < 3 ? <Button variant="primary" iconRight={I.ChevronRight} onClick={next}>Next: {steps[step]}</Button>
                : <Button variant="primary" icon={I.Check} onClick={() => { setDone(true); toast({ title: `${f.name.trim() || 'Staff member'} added`, body: 'Teacher Allocation updated. Invite sent.' }); }}>Create staff</Button>}
            </div>
          </div>
        </Col>
        <Col>
          <Card>
            <CardHead title="What happens when you press Create" icon={I.ListChecks} />
            <ul className="px-5 pb-5 flex flex-col gap-2.5 text-[13.5px] text-ink2">
              {['A unique staff ID is made, like SPS-T-034', 'The login is created with the roles you picked', 'Classes go into Teacher Allocation and the Time Table', 'Leave balances are set from HR Settings', 'Salary Management flags them for a salary structure'].map((t) => <li key={t} className="flex gap-2.5"><I.Check size={16} className="text-ok shrink-0 mt-0.5" />{t}</li>)}
            </ul>
          </Card>
          <Card className="p-5 flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl bg-sunken text-ink2 grid place-items-center shrink-0"><I.FileSpreadsheet size={19} /></span>
            <div className="flex-1"><p className="font-semibold text-[14.5px]">Adding many people?</p><p className="text-[13px] text-ink3">Import from Excel. Every row is checked first.</p>
              <Button size="sm" variant="secondary" className="mt-2" icon={I.Upload} onClick={() => setImp(true)}>Import staff</Button></div>
          </Card>
        </Col>
      </Split>
      <ImportSheet open={imp} onClose={() => setImp(false)} />
    </div>
  );
}

/* ======================= Staff Leave / My Leave ======================= */
function StaffLeave({ access }) {
  const { role } = useRole();
  const [tab, setTab] = useState('requests');
  const [per, setPer] = useState(DP.thismonth);
  const [myPer, setMyPer] = useState(DP.acyear);
  if (access === 'own') return <div><ModuleHead sub="Your own leave. Nobody approves their own leave; your request goes to your approver." /><MyLeave per={myPer} setPer={setMyPer} /></div>;
  return (
    <div>
      <ModuleHead sub="Requests, the leave calendar and every staff member’s balance · leave year Jun 2026 to May 2027" />
      <div className="flex flex-col @lg:flex-row @lg:items-center gap-2.5 mb-5">
        <ScrollSeg className="min-w-0" value={tab} onChange={setTab} options={[{ value: 'requests', label: 'Requests' }, { value: 'calendar', label: 'Leave calendar' }, { value: 'balances', label: 'Balances' }, { value: 'mine', label: 'My leave' }]} />
        {tab === 'requests' && <DatePeriod id="lv-per" value={per} onChange={setPer} className="w-full @lg:w-auto @lg:ml-auto" />}
      </div>
      <div key={tab} className="animate-rise">
        {tab === 'requests' && <LeaveRequests per={per} />}
        {tab === 'calendar' && <LeaveCalendar hide={!SENSITIVE.includes(role.id)} />}
        {tab === 'balances' && <LeaveBalances />}
        {tab === 'mine' && <MyLeave per={myPer} setPer={setMyPer} />}
      </div>
    </div>
  );
}

function LeaveRequests({ per }) {
  const toast = useToast();
  const { go } = useNav();
  const { role } = useRole();
  const canEdit = useCanEdit();
  // Only the head of department and the Principal decide leave (HR Settings and Forms & Approvals). HR manages, but does not decide.
  const canDecide = canEdit && ['principal', 'schooladmin'].includes(role.id);
  const [list, setList] = useState(PENDING);
  const [done, setDone] = useState(DECIDED);
  const [decline, setDecline] = useState(null);
  const [why, setWhy] = useState('');
  const [whyErr, setWhyErr] = useState('');
  const [cancel, setCancel] = useState(null);
  const [apply, setApply] = useState(false);
  const wait = list.filter((r) => inPer(r.ap, per));
  const dec = done.filter((r) => inPer(r.on, per));
  const approve = (r) => {
    const s = byId(r.sid);
    setList((x) => x.filter((y) => y.id !== r.id));
    setDone((x) => [{ ...r, on: '2026-10-09', status: 'Approved', by: role.person.name, future: true }, ...x]);
    toast({ title: `Approved: ${s.name}, ${LT[r.type].name.toLowerCase()} ${r.when}`, body: `Balance now ${r.after}. ${r.cover ? 'Cover sent to Academic Management, Substitutions.' : 'Shows in Staff Attendance and the October salary.'}`, undo: () => { setList((x) => [r, ...x]); setDone((x) => x.filter((y) => y.id !== r.id)); } });
  };
  return (
    <Split>
      <Col>
        {!canEdit && role.approves && <Banner tone="info" action={<Button size="sm" variant="secondary" onClick={() => go('approvals')}>Open Approvals</Button>}>You can see these requests here. Decide the ones sent to you in Approvals.</Banner>}
        {canEdit && !canDecide && <Banner tone="info">Leave is decided by the head of department, then the Principal. You can apply for someone, cancel approved leave and adjust balances.</Banner>}
        <Showing per={per} n={wait.length + dec.length} what={wait.length + dec.length === 1 ? 'request asked or decided' : 'requests asked or decided'} />
        <Card>
          <CardHead title="Waiting for a decision" sub="Asked in these dates · with the balance after and the cover needed" action={<Pill tone={wait.length ? 'warn' : 'ok'}>{wait.length} waiting</Pill>} />
          {wait.length === 0 ? <Empty icon={I.CheckCheck} title="Nothing waiting" body={list.length ? 'No request was asked in these dates. Pick a longer period to see the others.' : 'New leave requests show up here, in Approvals and in your notifications.'} /> : (
            <ul className="divide-y divide-line/70 border-t border-line/70">
              {wait.map((r) => {
                const s = byId(r.sid);
                const mine = s.name === role.person.name;
                return (
                  <li key={r.id} className="p-4 @md:px-5 flex flex-col gap-3">
                    <div className="flex items-start gap-3">
                      <Avatar name={s.name} size={42} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[15px] leading-tight">{s.name} <span className="text-ink3 font-normal text-[13px]">· {s.desig}</span></p>
                        <p className="text-[13.5px] mt-0.5"><b className="font-semibold">{LT[r.type].name}</b> · {r.when} · {r.days} {r.days === 1 ? 'day' : 'days'}</p>
                        <p className="text-[13px] text-ink3 mt-0.5">“{r.reason}”{r.doc && <span className="inline-flex items-center gap-1 ml-1.5 text-ink2"><I.Paperclip size={13} />certificate</span>}</p>
                      </div>
                      <span className="text-[12px] text-ink3 whitespace-nowrap hidden @sm:block">{r.applied}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 @md:pl-[54px]">
                      <Pill tone="neutral" className="!whitespace-normal !h-auto py-1">After: {r.after}</Pill>
                      {r.cover && <Pill tone="warn" className="!whitespace-normal !h-auto py-1"><I.Repeat size={12} className="shrink-0" />{r.cover}</Pill>}
                      <Pill tone="info" className="!whitespace-normal !h-auto py-1">{approversFor(s).join(', then ')}</Pill>
                    </div>
                    {canDecide && (mine ? <p className="text-[13px] text-ink3 @md:pl-[54px] flex items-center gap-1.5"><I.Info size={14} className="shrink-0" />Your own request. It goes to {approversFor(s).join(', then ')}.</p> : (
                      <div className="flex gap-2 @md:pl-[54px]">
                        <Button variant="soft" icon={I.Check} onClick={() => approve(r)}>Approve</Button>
                        <Button variant="ghost" onClick={() => { setDecline(r); setWhy(''); setWhyErr(''); }}>Decline</Button>
                      </div>
                    ))}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card>
          <CardHead title="Decided in these dates" sub="Approved leave can be cancelled before it ends; the balance comes back" />
          {dec.length === 0 && <Empty icon={I.CalendarDays} title="Nothing decided in these dates" body="Pick a longer period, like Last 3 months." />}
          <ul className="px-2 pb-2">
            {dec.map((r) => {
              const s = byId(r.sid);
              return (
                <li key={r.id}>
                  <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/60">
                    <Avatar name={s.name} size={38} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[14.5px] truncate">{s.name} · {LT[r.type].name}</p>
                      <p className="text-[12.5px] text-ink3 truncate">{r.when} · {r.status === 'Declined' ? `“${r.note}”` : `by ${r.by}`}</p>
                    </div>
                    <Pill tone={r.status === 'Approved' ? 'ok' : r.status === 'Cancelled' ? 'neutral' : 'bad'}>{r.status}</Pill>
                    {canEdit && r.status === 'Approved' && r.future && <Button size="sm" variant="ghost" onClick={() => setCancel(r)}>Cancel</Button>}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </Col>
      <Col>
        <Card>
          <CardHead title="Away today" sub="Fri 9 Oct · 3 staff" icon={I.CalendarDays} />
          <ul className="px-2 pb-2">
            {[['T03', 'SL', 'Back Sat 10 Oct'], ['A07', 'CL', 'Back Sat 10 Oct'], ['T13', 'ML', 'Back 2 Mar 2027']].map(([id, t, b]) => {
              const s = byId(id);
              return <li key={id}><Row avatar={s.name} title={s.name} sub={`${leaveLabel(t, !SENSITIVE.includes(role.id))} · ${b}`} /></li>;
            })}
          </ul>
        </Card>
        {canEdit && (
          <Card className="p-5 flex flex-col gap-2">
            <p className="font-semibold text-[14.5px]">Someone called in sick?</p>
            <p className="text-[13px] text-ink3">Apply on their behalf. It still goes to their approver, and they are told.</p>
            <Button className="self-start mt-1" variant="secondary" icon={I.CalendarPlus} onClick={() => setApply(true)}>Apply for someone</Button>
          </Card>
        )}
      </Col>
      <Sheet open={!!decline} onClose={() => setDecline(null)} title={decline ? `Decline ${byId(decline.sid).first}’s leave?` : ''} sub="They see your reason on their phone."
        footer={<><Button variant="ghost" onClick={() => setDecline(null)}>Keep it waiting</Button><Button variant="danger" onClick={() => {
          if (!why.trim()) { setWhyErr('Give a reason. They see it with the decision.'); return; }
          const r = decline; setList((x) => x.filter((y) => y.id !== r.id)); setDone((x) => [{ ...r, on: '2026-10-09', status: 'Declined', note: why.trim(), by: role.person.name }, ...x]); setDecline(null);
          toast({ title: `Declined: ${byId(r.sid).name}, ${r.when}`, body: 'They have been told with your reason.', undo: () => { setList((x) => [r, ...x]); setDone((x) => x.filter((y) => y.id !== r.id)); } });
        }}>Decline leave</Button></>}>
        <Field label="Reason" required id="lv-why" error={whyErr}>
          <div className="flex flex-wrap gap-2 mb-1">{['Half-yearly exams that week', 'Too many staff away that day', 'Please send a medical certificate'].map((x) => <button key={x} type="button" onClick={() => { setWhy(x); setWhyErr(''); }} className="h-8 px-3 rounded-full bg-sunken text-[13px] font-medium hover:bg-line">{x}</button>)}</div>
          <Textarea id="lv-why" value={why} onChange={(v) => { setWhy(v); setWhyErr(''); }} rows={3} placeholder="Type a short reason" />
        </Field>
      </Sheet>
      <ConfirmSheet open={!!cancel} onClose={() => setCancel(null)} title={cancel ? `Cancel ${byId(cancel.sid).first}’s approved leave?` : ''} confirmLabel="Cancel this leave"
        onConfirm={() => { const r = cancel; setDone((x) => x.map((y) => (y.id === r.id ? { ...y, status: 'Cancelled', future: false } : y))); toast({ title: `Leave cancelled: ${byId(r.sid).name}, ${r.when}`, body: `${r.days} ${r.days === 1 ? 'day' : 'days'} back in the balance. Substitutions not yet taken are released.` }); }}>
        {cancel && <p className="text-[14px] text-ink2">{LT[cancel.type].name}, {cancel.when}. {cancel.days} {cancel.days === 1 ? 'day goes' : 'days go'} back to {byId(cancel.sid).first}’s balance, and they are told. Both steps stay in the audit log.</p>}
      </ConfirmSheet>
      <ApplySheet open={apply} onClose={() => setApply(false)} pick />
    </Split>
  );
}

function ApplySheet({ open, onClose, who, pick }) {
  const toast = useToast();
  const [sid, setSid] = useState('');
  const [type, setType] = useState('SL');
  const [from, setFrom] = useState('09-10-2026');
  const [to, setTo] = useState('09-10-2026');
  const [reason, setReason] = useState('Called in sick at 7:40 AM');
  const [err, setErr] = useState('');
  const s = who || byId(sid);
  return (
    <FormSheet open={open} onClose={onClose} title={s && !pick ? `Apply leave for ${s.name}` : 'Apply leave for a staff member'} sub="It goes to their approver like any request. They are told." submitLabel="Send for approval"
      onSubmit={() => {
        if (pick && !sid) { setErr('Choose who the leave is for'); return false; }
        const a = parseDMY(from), b = parseDMY(to);
        if (!a || !b) { setErr('Enter both dates as DD-MM-YYYY'); return false; }
        const n = countDays(a, b);
        toast({ title: `Leave request sent for ${s.name}`, body: `${LT[type].name}, ${n} ${n === 1 ? 'day' : 'days'} · goes to ${approversFor(s)[0]}` });
      }}>
      {pick && <Field label="Staff member" required id="ap-who" error={err.startsWith('Choose') ? err : ''}><StaffPicker id="ap-who" value={sid} onChange={(v) => { setSid(v); setErr(''); }} /></Field>}
      <Field label="Leave type" required id="ap-type"><Select id="ap-type" value={type} onChange={setType} options={LEAVE_TYPES.slice(0, 3).map((t) => ({ value: t.k, label: s ? `${t.name} · ${t.quota - (usedFor(s)[t.k] || 0)} left` : t.name }))} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From" required id="ap-from"><Input id="ap-from" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="DD-MM-YYYY" /></Field>
        <Field label="To" required id="ap-to"><Input id="ap-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="DD-MM-YYYY" /></Field>
      </div>
      {err && !err.startsWith('Choose') && <p className="text-[12.5px] text-bad -mt-2">{err}</p>}
      <Field label="Reason" required id="ap-reason"><Textarea id="ap-reason" value={reason} onChange={setReason} rows={2} /></Field>
    </FormSheet>
  );
}

// Who was away in another month: [sid, type, from day, to day]. October 2026 uses AWAY; other months come from the leave history.
const AWAY_POOL = ['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07', 'T08', 'A03', 'A07', 'S01', 'T11'];
function awayIn(y, m) {
  if (y === 2026 && m === 9) return AWAY;
  const days = new Date(y, m + 1, 0).getDate();
  const out = [];
  AWAY_POOL.forEach((sid, i) => {
    const h = hash(`${sid}|${y}-${m}`);
    if (h % 3 === 0 || (m === 4 || (m === 3 && h % 2))) return; // summer holidays and quiet months
    const start = 1 + (h % (days - 3)); const len = 1 + ((h >>> 5) % 3);
    const type = ['CL', 'CL', 'SL', 'EL'][(h >>> 3) % 4];
    if (new Date(y, m, start) > TODAY_D) return;
    out.push([sid, type, start, Math.min(days, start + len - 1)]);
  });
  if (y === 2026 && m === 8) out.push(['T13', 'ML', 1, 30]);
  return out;
}
const TODAY_D = new Date(2026, 9, 9);
const CAL_FROM = 2025 * 12 + 5, CAL_TO = 2026 * 12 + 9;

function LeaveCalendar({ hide }) {
  const [grp, setGrp] = useState('all');
  const [k, setK] = useState(CAL_TO);
  const y = Math.floor(k / 12), m = k % 12;
  const isOct = y === 2026 && m === 9;
  const away = awayIn(y, m);
  const days = Array.from({ length: new Date(y, m + 1, 0).getDate() }, (_, i) => i + 1);
  const people = [...new Set(away.map((a) => a[0]))].map(byId).filter((s) => grp === 'all' || (grp === 'teaching' ? s.dept === 'Teaching' : s.dept !== 'Teaching'));
  const offDay = (d) => (isOct ? new Date(2026, 9, d).getDay() === 0 || HOLIDAYS.has(d) : (() => { const sd = schoolDay(y, m, d); return sd.kind === 'off' || sd.kind === 'holiday'; })());
  const ABBR = { CL: 'CL', SL: 'SL', EL: 'EL', ML: 'ML' };
  const months = [];
  for (let i = CAL_TO; i >= CAL_FROM; i--) months.push({ value: String(i), label: `${MONTH_NAMES[i % 12]} ${Math.floor(i / 12)}` });
  return (
    <div className="flex flex-col gap-5">
      {hide && <Banner tone="info">Sick and maternity leave show only as “On leave” to you. The staff member, HR and the Principal see the type.</Banner>}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <Button variant="secondary" size="sm" icon={I.ChevronLeft} aria-label="Earlier month" disabled={k <= CAL_FROM} onClick={() => setK(k - 1)} className="!px-2.5" />
            <Select id="lv-cal-m" className="w-44" value={String(k)} onChange={(v) => setK(Number(v))} options={months} />
            <Button variant="secondary" size="sm" icon={I.ChevronRight} aria-label="Later month" disabled={k >= CAL_TO} onClick={() => setK(k + 1)} className="!px-2.5" />
          </div>
          <Segmented size="sm" value={grp} onChange={setGrp} options={[{ value: 'all', label: 'Everyone' }, { value: 'teaching', label: 'Teaching' }, { value: 'other', label: 'Non-teaching' }]} />
          <p className="text-[13px] text-ink3 w-full">Who is away, by day{isOct ? ' · dashed means still waiting' : ''} · {people.length} {people.length === 1 ? 'person' : 'people'} on leave in {MONTH_NAMES[m]} {y}</p>
        </div>
        {people.length === 0 ? <Empty icon={I.CalendarDays} title={`Nobody was on leave in ${MONTH_NAMES[m]} ${y}`} body={m === 4 ? 'Summer holidays.' : 'Try another month or group.'} /> : (
        <div className="overflow-x-auto scroll-thin">
          <table className="text-[12px] min-w-full">
            <thead>
              <tr className="border-y border-line text-ink3">
                <th className="sticky left-0 z-10 bg-surface text-left font-semibold px-4 py-2 min-w-[170px]">Staff member</th>
                {days.map((d) => { const dow = new Date(y, m, d).getDay(); return <th key={d} className={cx('font-semibold px-0.5 py-2 w-8 tnum', isOct && d === 9 && 'text-brand')}>{d}<span className="block text-[10px] font-medium">{['S', 'M', 'T', 'W', 'T', 'F', 'S'][dow]}</span></th>; })}
              </tr>
            </thead>
            <tbody>
              {people.map((s) => (
                <tr key={s.id} className="border-b border-line/60 last:border-0">
                  <td className="sticky left-0 z-10 bg-surface px-4 py-1.5 whitespace-nowrap"><span className="font-medium">{s.name}</span><span className="block text-[11.5px] text-ink3">{s.desig}</span></td>
                  {days.map((d) => {
                    const a = away.find((x) => x[0] === s.id && d >= x[2] && d <= x[3]);
                    const off = offDay(d);
                    return (
                      <td key={d} className={cx('px-0.5 py-1 text-center', off && 'bg-sunken/70')}>
                        {a && !off ? <span title={`${s.name}: ${leaveLabel(a[1], hide)}${a[4] ? ' (waiting)' : ''}`} className={cx('inline-grid place-items-center w-7 h-7 rounded-md text-[10px] font-bold', a[4] ? 'border border-dashed border-warn text-warn bg-warn/8' : 'bg-info/15 text-info', isOct && d === 9 && 'ring-2 ring-brand')}>{hide && LT[a[1]].sensitive ? 'Lv' : ABBR[a[1]]}</span> : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-2 px-5 py-3 border-t border-line text-[12.5px] text-ink2">
          <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-info/15" />Approved</span>
          {isOct && <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded border border-dashed border-warn" />Waiting</span>}
          <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-sunken" />Sunday or holiday{isOct ? ' (Dussehra 19–25 Oct)' : ''}</span>
        </div>
      </Card>
    </div>
  );
}

function LeaveBalances() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const [q, setQ] = useState('');
  const [adj, setAdj] = useState(null);
  const [days, setDays] = useState('1');
  const [why, setWhy] = useState('');
  const [whyErr, setWhyErr] = useState('');
  const rows = ALL.filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()) || s.desig.toLowerCase().includes(q.toLowerCase()));
  const cell = (s, k, quota) => { const left = quota - (usedFor(s)[k] || 0); return <span className={cx('tnum font-semibold', left <= 2 && 'text-warn')}>{left}<span className="text-ink3 font-normal"> / {quota}</span></span>; };
  return (
    <Card className="overflow-hidden">
      <Toolbar>
        <SearchBox id="bal-search" value={q} onChange={setQ} placeholder="Search staff or designation" />
        <ExportButton what="leave balances" />
      </Toolbar>
      <DataList rows={rows} minWidth={720} footer={`Showing ${rows.length} of 86 · each balance is its own record per leave year`}
        columns={[
          { key: 'n', label: 'Staff member', render: (s) => <div className="flex items-center gap-3"><Avatar name={s.name} size={34} /><div><p className="font-semibold leading-tight">{s.name}</p><p className="text-[12px] text-ink3">{s.desig}</p></div></div> },
          { key: 'cl', label: 'Casual left', render: (s) => cell(s, 'CL', 12) },
          { key: 'sl', label: 'Sick left', render: (s) => cell(s, 'SL', 10) },
          { key: 'el', label: 'Earned left', render: (s) => cell(s, 'EL', 15) },
          { key: 'a', label: '', render: (s) => canEdit ? <div className="text-right"><Button size="sm" variant="ghost" icon={I.SlidersHorizontal} onClick={() => { setAdj(s); setWhy(''); setWhyErr(''); }}>Adjust</Button></div> : null },
        ]}
        mobile={(s) => { const u = usedFor(s); return { avatar: s.name, title: s.name, sub: `CL ${12 - u.CL} · SL ${10 - u.SL} · EL ${15 - u.EL} left`, right: canEdit ? <Button size="sm" variant="ghost" onClick={() => { setAdj(s); setWhy(''); setWhyErr(''); }}>Adjust</Button> : null }; }} />
      <Sheet open={!!adj} onClose={() => setAdj(null)} title={adj ? `Adjust ${adj.first}’s balance` : ''} sub="HR only. The reason stays with the change in the audit log."
        footer={<><Button variant="ghost" onClick={() => setAdj(null)}>Cancel</Button><Button variant="primary" onClick={() => {
          if (!why.trim()) { setWhyErr('Give a reason for this change'); return; }
          toast({ title: `${adj.name}: casual leave +${days} day${days === '1' ? '' : 's'}`, body: why.trim(), undo: () => {} }); setAdj(null);
        }}>Save adjustment</Button></>}>
        <div className="flex flex-col gap-4">
          <Field label="Leave type" id="adj-type"><Select id="adj-type" value="CL" onChange={() => {}} options={LEAVE_TYPES.slice(0, 3).map((t) => ({ value: t.k, label: t.name }))} /></Field>
          <Field label="Days to add (use a minus to take away)" id="adj-days"><Input id="adj-days" value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" className="tnum" /></Field>
          <Field label="Reason" required id="adj-why" error={whyErr}><Textarea id="adj-why" value={why} onChange={(v) => { setWhy(v); setWhyErr(''); }} rows={2} placeholder="Like: worked on Sunday 4 Oct for the science fair" /></Field>
        </div>
      </Sheet>
    </Card>
  );
}

function MyLeave({ per = DP.acyear, setPer = () => {} }) {
  const toast = useToast();
  const me = useMe();
  const used = usedFor(me);
  const [reqs, setReqs] = useState(() => myHistory(me));
  const [type, setType] = useState('CL');
  const [from, setFrom] = useState('10-10-2026');
  const [to, setTo] = useState('10-10-2026');
  const [half, setHalf] = useState(false);
  const [which, setWhich] = useState('First half');
  const [reason, setReason] = useState('');
  const [cover, setCover] = useState({});
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const teacher = isTeacher(me);
  const a = parseDMY(from), b = parseDMY(to);
  const n = a && b && b >= a ? (half ? 0.5 : countDays(a, b)) : 0;
  const waiting = (k) => reqs.filter((r) => r.status === 'Waiting' && r.type === k).reduce((x, r) => x + r.days, 0);
  const bal = (k) => LT[k].quota - (used[k] || 0);
  const left = (k) => bal(k) - waiting(k);
  const approvers = approversFor(me);
  const periodsHit = teacher && a ? weekGrid(me).slice(((a.getDay() + 6) % 7) * 8, ((a.getDay() + 6) % 7) * 8 + 8).map((c, i) => c && { p: i + 1, c }).filter(Boolean).slice(0, 4) : [];
  const exam = a && a >= new Date(2026, 9, 12) && a <= new Date(2026, 9, 27) && !isOff(a);
  const FREE = ['Swapna Reddy', 'Venkat Rao', 'Lalitha Devi', 'Usha Rani', 'Mohammed Asif'].filter((x) => x !== me.name);
  const submit = () => {
    const e = {};
    if (!a) e.from = 'Enter the date as DD-MM-YYYY';
    if (!b) e.to = 'Enter the date as DD-MM-YYYY';
    if (a && b && b < a) e.to = 'The “to” date is before the “from” date';
    if (a && b && b >= a && n === 0) e.to = 'These dates are Sundays or school holidays. No leave is needed.';
    const clash = a && b && reqs.find((r) => (r.status === 'Waiting' || r.status === 'Approved') && r.from && parseDMY(r.from) <= b && parseDMY(r.to) >= a);
    if (clash) e.from = `You already have leave on ${clash.from}. Change that request instead.`;
    if (!e.from && !e.to && n > left(type)) e.type = `${LT[type].name} left: ${left(type)} ${left(type) === 1 ? 'day' : 'days'}${waiting(type) ? ' after your waiting request' : ''}. You asked for ${n}.`;
    if (!reason.trim()) e.reason = 'Write a short reason';
    setErrs(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      const id = `LR-26${20 + reqs.length}`;
      const r = { id, type, when: a.getTime() === b.getTime() ? fmt(a) : `${fmt(a)} – ${fmt(b)}`, from, to, on: isoOf(from), days: n, reason: reason.trim(), status: 'Waiting' };
      setReqs((x) => [r, ...x]);
      setReason('');
      toast({ title: `Leave request sent to ${approvers[0]}`, body: `${LT[type].name}, ${n} ${n === 1 ? 'day' : 'days'}. You are told when it is decided.` });
    }, 700);
  };
  const shownReqs = reqs.filter((r) => inPer(r.on, per));
  const withdraw = (r) => {
    setReqs((x) => x.map((y) => (y.id === r.id ? { ...y, status: 'Withdrawn' } : y)));
    toast({ title: `Withdrawn: ${LT[r.type].name.toLowerCase()} ${r.when}`, body: 'Your approver is told.', undo: () => setReqs((x) => x.map((y) => (y.id === r.id ? { ...y, status: 'Waiting' } : y))) });
  };
  return (
    <div className="flex flex-col gap-5 @lg:gap-6">
      <div className="grid grid-cols-1 @sm:grid-cols-3 gap-3">
        {LEAVE_TYPES.filter((t) => t.k !== 'ML' || used.ML).slice(0, 3).map((t) => {
          const l = bal(t.k);
          return (
            <Card key={t.k} className="p-4">
              <p className="text-[12.5px] text-ink3 font-semibold">{t.name}</p>
              <p className="font-display text-[26px] font-semibold tnum leading-tight mt-0.5">{l}<span className="text-[14px] text-ink3 font-sans font-medium"> of {t.quota} left</span></p>
              <Progress className="mt-2.5" value={((t.quota - l) / t.quota) * 100} tone={l <= 2 ? 'warn' : 'brand'} />
              <p className="text-[12px] text-ink3 mt-1.5">{used[t.k] || 0} used{waiting(t.k) ? ` · ${waiting(t.k)} waiting for approval` : t.k === 'EL' ? ' · up to 30 carry forward' : t.half ? ' · half days allowed' : ''}</p>
            </Card>
          );
        })}
      </div>
      <Split side={380}>
        <Card>
          <CardHead title="My requests" sub={`Leave dates in ${per.label.toLowerCase()} · ${fmtRange(per)}`} />
          <div className="px-5 pb-3"><DatePeriod id="my-lv-per" value={per} onChange={setPer} future className="w-full @md:w-auto" /></div>
          {shownReqs.length === 0 && <Empty icon={I.CalendarDays} title="No leave in these dates" body="Pick another period, like This academic year." />}
          <ul className="divide-y divide-line/70 border-t border-line/70">
            {shownReqs.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                <span className={cx('w-10 h-10 rounded-xl grid place-items-center shrink-0', TONE_SOFT[r.status === 'Approved' ? 'ok' : r.status === 'Waiting' ? 'warn' : 'neutral'])}><I.CalendarDays size={19} /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[14.5px] truncate">{LT[r.type].name} · {r.when}</p>
                  <p className="text-[12.5px] text-ink3 truncate">{r.days} {r.days === 1 ? 'day' : 'days'} · {r.status === 'Declined' ? `Declined: “${r.note}”` : r.status === 'Waiting' ? `With ${approvers[0]}` : r.reason}</p>
                </div>
                <Pill tone={r.status === 'Approved' ? 'ok' : r.status === 'Waiting' ? 'warn' : r.status === 'Declined' ? 'bad' : 'neutral'} className="hidden @sm:inline-flex">{r.status}</Pill>
                {r.status === 'Waiting' && <Button size="sm" variant="ghost" onClick={() => withdraw(r)}>Withdraw</Button>}
              </li>
            ))}
          </ul>
        </Card>
        <Card className="@xl:sticky @xl:top-0">
          <CardHead title="Apply for leave" sub={`Goes to ${approvers.join(', then ')}`} icon={I.CalendarPlus} />
          <div className="px-5 pb-5 flex flex-col gap-4">
            <Field label="Leave type" required id="ml-type" error={errs.type}>
              <Select id="ml-type" value={type} onChange={(v) => { setType(v); setErrs({}); }} error={errs.type} options={LEAVE_TYPES.filter((t) => t.k !== 'ML').map((t) => ({ value: t.k, label: `${t.name} · ${left(t.k)} left` }))} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="From" required id="ml-from" error={errs.from}><Input id="ml-from" value={from} onChange={(e) => { setFrom(e.target.value); setErrs({}); if (!parseDMY(to) || parseDMY(to) < parseDMY(e.target.value)) setTo(e.target.value); }} error={errs.from} placeholder="DD-MM-YYYY" inputMode="numeric" /></Field>
              <Field label="To" required id="ml-to" error={errs.to}><Input id="ml-to" value={to} onChange={(e) => { setTo(e.target.value); setErrs({}); }} error={errs.to} placeholder="DD-MM-YYYY" inputMode="numeric" /></Field>
            </div>
            {LT[type].half && a && b && a.getTime() === b.getTime() && (
              <div className="flex items-center gap-3 flex-wrap">
                <label className="flex items-center gap-2.5 text-[14px] font-semibold"><Switch id="ml-half" on={half} onChange={setHalf} label="Half day" />Half day</label>
                {half && <Segmented size="sm" value={which} onChange={setWhich} options={['First half', 'Second half']} />}
              </div>
            )}
            <p className="text-[13px] text-ink2 -mt-1 flex items-center gap-1.5"><I.Info size={14} className="text-ink3" />{n ? `${n} ${n === 1 ? 'day' : 'days'} of leave. Sundays and holidays are not counted.` : 'Choose the dates to see the days.'}</p>
            <Field label="Reason" required id="ml-reason" error={errs.reason}><Textarea id="ml-reason" value={reason} onChange={(v) => { setReason(v); setErrs({}); }} rows={2} placeholder="Like: family function in Warangal" /></Field>
            {teacher && periodsHit.length > 0 && (
              <div className="rounded-xl border border-line p-3 flex flex-col gap-2.5">
                <p className="text-[13px] font-semibold text-ink2">Who covers your classes? <span className="font-normal text-ink3">Suggested from free teachers</span></p>
                {exam ? <p className="text-[13px] text-ink2">{fmt(a)} is a half-yearly exam day. The Exam In-charge moves your invigilation duty.</p> : periodsHit.map(({ p, c }, i) => (
                  <div key={p} className="grid grid-cols-[1fr_150px] gap-2 items-center text-[13px]">
                    <span className="truncate"><b className="font-semibold">P{p}</b> · {c[0] === 'All subjects' ? 'Class' : c[0]} {c[1]}</span>
                    <select aria-label={`Cover for period ${p}`} value={cover[p] || FREE[i % FREE.length]} onChange={(e) => setCover({ ...cover, [p]: e.target.value })} className="h-9 rounded-lg border border-line bg-surface px-2 text-[13px] text-ink outline-none focus:border-brand">
                      {FREE.map((x) => <option key={x}>{x}</option>)}
                    </select>
                  </div>
                ))}
                <p className="text-[12px] text-ink3">The office confirms these in Academic Management, Substitutions.</p>
              </div>
            )}
            <Button type="button" variant="ghost" className="self-start -ml-2" icon={I.Paperclip} onClick={() => toast({ title: 'Choose a file or take a photo', body: 'A medical certificate for sick leave of 3 days or more', tone: 'info' })}>Attach a document</Button>
            <Button variant="primary" size="lg" icon={I.Send} loading={busy} onClick={submit} className="w-full">{busy ? 'Sending…' : approvers[0].includes(',') ? 'Send for approval' : `Send to ${firstName(approvers[0])}`}</Button>
          </div>
        </Card>
      </Split>
    </div>
  );
}

/* ======================= Documents & ID Cards / My Documents ======================= */
function Documents({ access }) {
  if (access === 'own') return <MyDocuments />;
  return <StaffDocuments />;
}

function MyDocuments() {
  const toast = useToast();
  const me = useMe();
  const docs = myDocs(me);
  const due = docs.filter((d) => d.status !== 'Valid');
  return (
    <div>
      <ModuleHead sub="Your documents and ID card. HR checks what you upload." actions={<Button variant="primary" icon={I.Upload} onClick={() => toast({ title: 'Choose a file or take a photo', body: 'JPG, PNG or PDF up to 5 MB', tone: 'info' })}>Upload</Button>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
      {due.map((d) => <Banner key={d.type} tone={d.status === 'Expiring soon' ? 'warn' : 'bad'} title={`${d.type}: ${d.status === 'Missing' ? 'not given yet.' : d.status === 'Expired' ? `expired on ${d.expires}.` : `expires on ${d.expires}.`}`}
        action={<Button size="sm" variant="secondary" icon={I.Upload} onClick={() => toast({ title: `Upload the ${d.status === 'Missing' ? '' : 'renewed '}${d.type.toLowerCase()}`, tone: 'info' })}>Upload</Button>}>{d.status === 'Missing' ? 'HR needs a copy.' : 'Upload the renewed one so it stays valid.'}</Banner>)}
      <Split>
        <Card>
          <CardHead title="My documents" sub={`${docs.length - due.length} of ${docs.length} valid · reminders 30 and 7 days before expiry`} />
          <DocList docs={docs} onAdd={(d) => toast({ title: `Upload ${d.type}`, tone: 'info' })} />
        </Card>
        <Col>
          <Card>
            <CardHead title="My ID card" sub="Valid till 31 Mar 2027" />
            <div className="px-5 pb-5 flex flex-col items-center gap-3"><IdCardPreview s={me} /></div>
            <div className="px-5 pb-5 flex gap-2 flex-wrap">
              <Button size="sm" variant="secondary" icon={I.Download} onClick={() => toast({ title: `Saved: ID-card-${me.code}.pdf` })}>Download</Button>
              <Button size="sm" variant="ghost" icon={I.Repeat} onClick={() => toast({ title: 'Reprint request sent to HR', body: 'Reason: card damaged. HR prints it and tells you.' })}>Ask for a reprint</Button>
            </div>
          </Card>
          <Card className="p-5 flex flex-col gap-2">
            <p className="font-semibold text-[14.5px]">Need a letter from the school?</p>
            <p className="text-[13px] text-ink3">Salary certificate for a bank loan, or a service certificate. HR prepares it and the Principal signs.</p>
            <Button className="self-start mt-1" size="sm" variant="secondary" icon={I.ScrollText} onClick={() => toast({ title: 'Request sent to HR', body: 'Salary certificate · usually ready in 2 working days' })}>Ask for a letter</Button>
          </Card>
        </Col>
      </Split>
      </div>
    </div>
  );
}

function IdCardPreview({ s }) {
  return (
    <div className="w-[230px] rounded-2xl border border-line bg-surface shadow-card overflow-hidden text-center" aria-label={`ID card for ${s.name}`}>
      <div className="bg-brand text-brandink px-3 py-2.5"><p className="font-display font-semibold text-[13px] leading-tight">Sunrise Public School</p><p className="text-[10.5px] opacity-80">Kukatpally, Hyderabad · CBSE</p></div>
      <div className="px-3 pt-4 pb-3 flex flex-col items-center gap-1.5">
        <Avatar name={s.name} size={64} />
        <p className="font-semibold text-[14px] leading-tight mt-1">{s.name}</p>
        <p className="text-[11.5px] text-ink3">{s.desig}</p>
        <div className="w-full grid grid-cols-2 gap-1 text-[10.5px] text-left mt-1.5 tnum">
          <span className="text-ink3">Staff ID</span><span className="font-mono font-semibold">{s.code}</span>
          <span className="text-ink3">Blood</span><span className="font-semibold">{s.blood}</span>
          <span className="text-ink3">Phone</span><span className="font-semibold">{s.phone}</span>
        </div>
      </div>
      <div className="border-t border-line px-3 py-1.5 text-[10px] text-ink3">Valid till 31 Mar 2027</div>
    </div>
  );
}

function StaffDocuments() {
  const toast = useToast();
  const { go } = useNav();
  const canEdit = useCanEdit();
  const [view, setView] = useState('expiring');
  const [q, setQ] = useState('');
  const [up, setUp] = useState(false);
  const [upType, setUpType] = useState('Police verification');
  const [upWho, setUpWho] = useState('');
  const [upErr, setUpErr] = useState('');
  const [print, setPrint] = useState(false);
  const [desig, setDesig] = useState('teachers');
  const [letter, setLetter] = useState(false);
  const [letterWho, setLetterWho] = useState('T09');
  const [letters, setLetters] = useState([
    { sid: 'T09', kind: 'Experience letter', when: 'Requested Wed 7 Oct', status: 'Waiting for Principal' },
    { name: 'Harish Chandra', kind: 'Experience letter', when: 'Issued Mon 7 Sep', status: 'Issued' },
    { sid: 'T06', kind: 'Salary certificate', when: 'Issued Fri 2 Oct', status: 'Issued' },
  ]);
  const rows = (view === 'expiring' ? EXP_DOCS.filter((d) => d.status !== 'Valid') : EXP_DOCS).filter((d) => { const s = byId(d.sid); return !q || s.name.toLowerCase().includes(q.toLowerCase()) || d.type.toLowerCase().includes(q.toLowerCase()); });
  const BATCH = { teachers: ['All teachers', 58], drivers: ['Drivers and attenders', 12], office: ['Office and accounts', 8], support: ['Support, library, hostel and stores', 8] };
  return (
    <div className="flex flex-col gap-5 @lg:gap-6">
      <div>
        <ModuleHead sub="Certificates, ID proof and contracts with expiry reminders · staff ID cards · letters"
          actions={<><Button variant="secondary" icon={I.IdCard} onClick={() => setView('cards')}>ID cards</Button><Button variant="primary" icon={I.Upload} onClick={() => setUp(true)}>Upload document</Button></>} />
        <Stats items={[
          { label: 'Documents on file', value: '498', sub: 'for 86 staff', icon: 'FolderOpen' },
          { label: 'Expiring this month', value: '4', sub: 'reminders sent', tone: 'warn', icon: 'Hourglass', onClick: () => setView('expiring') },
          { label: 'Expired', value: '2', sub: 'need renewal', tone: 'bad', icon: 'FileWarning', onClick: () => setView('expiring') },
          { label: 'Missing', value: '2', sub: 'not collected yet', icon: 'FileX2' },
        ]} />
      </div>
      <ScrollSeg value={view} onChange={setView} options={[{ value: 'expiring', label: 'Needs attention' }, { value: 'all', label: 'All documents' }, { value: 'cards', label: 'ID cards' }, { value: 'letters', label: 'Letters' }]} />

      {(view === 'expiring' || view === 'all') && (
        <Card className="overflow-hidden animate-rise" key={view}>
          <Toolbar>
            <SearchBox id="doc-search" value={q} onChange={setQ} placeholder="Staff name or document" />
            <ExportButton what="staff documents" />
          </Toolbar>
          {view === 'expiring' && canEdit && <div className="px-4 py-2.5 border-b border-line flex items-center gap-3 flex-wrap"><p className="text-[13px] text-ink2 flex-1 min-w-0">Reminders go to HR and the staff member 30 and 7 days before expiry.</p><Button size="sm" variant="secondary" icon={I.Send} onClick={() => toast({ title: 'Reminders sent to 8 staff', body: 'WhatsApp, with the upload link' })}>Remind all 8 now</Button></div>}
          <DataList rows={rows} minWidth={820}
            columns={[
              { key: 's', label: 'Staff member', render: (d) => { const s = byId(d.sid); return <div className="flex items-center gap-3"><Avatar name={s.name} size={34} /><div><p className="font-semibold leading-tight">{s.name}</p><p className="text-[12px] text-ink3">{s.desig}</p></div></div>; } },
              { key: 't', label: 'Document', render: (d) => <><p className="leading-tight">{d.type}</p><p className="text-[12px] text-ink3">{d.kind}</p></> },
              { key: 'n', label: 'Number', render: (d) => <span className="font-mono text-[12.5px]">{d.num ? (d.kind === 'ID proof' ? d.num : d.num) : '—'}</span> },
              { key: 'e', label: 'Expires', nowrap: true, render: (d) => <span className="tnum">{d.expires || 'No expiry'}</span> },
              { key: 'st', label: 'Status', render: (d) => <Pill tone={DOC_STATUS[d.status]}>{d.status}</Pill> },
              { key: 'a', label: '', render: (d) => <div className="flex justify-end gap-1">{d.status === 'Valid' ? <Button size="sm" variant="ghost" icon={I.Eye} onClick={() => toast({ title: `Opening ${d.type}`, body: byId(d.sid).name, tone: 'info' })}>View</Button>
                : canEdit && <Button size="sm" variant="secondary" icon={I.Upload} onClick={() => { setUpWho(d.sid); setUpType(d.type); setUp(true); }}>{d.status === 'Missing' ? 'Add' : 'Renew'}</Button>}</div> },
            ]}
            mobile={(d) => { const s = byId(d.sid); return { avatar: s.name, title: `${s.name} · ${d.type}`, sub: d.expires ? `Expires ${d.expires}` : d.status === 'Missing' ? 'Not collected yet' : 'No expiry', pills: [<Pill key="s" tone={DOC_STATUS[d.status]} className="!h-[22px] !text-[11.5px]">{d.status}</Pill>] }; }} />
        </Card>
      )}

      {view === 'cards' && (
        <Split className="animate-rise">
          <Card>
            <CardHead title="Print staff ID cards" sub="Design from Settings, Document Designs · batches of up to 50" />
            <div className="px-5 pb-5 flex flex-col gap-4">
              <div className="grid @sm:grid-cols-2 gap-2">
                {Object.entries(BATCH).map(([k, [l, n]]) => (
                  <button key={k} onClick={() => setDesig(k)} className={cx('text-left rounded-2xl border p-3.5 transition', desig === k ? 'border-brand bg-brand/5 ring-1 ring-brand' : 'border-line hover:bg-sunken/60')}>
                    <span className="block font-semibold text-[14px]">{l}</span><span className="block text-[12.5px] text-ink3 tnum">{n} cards · {Math.ceil(n / 50)} {Math.ceil(n / 50) === 1 ? 'batch' : 'batches'}</span>
                  </button>
                ))}
              </div>
              {canEdit && <div className="flex gap-2 flex-wrap">
                <Button variant="primary" icon={I.Printer} onClick={() => setPrint(true)}>Print {BATCH[desig][1]} ID cards</Button>
                <Button variant="secondary" icon={I.Repeat} onClick={() => toast({ title: 'Reprint for one person', body: 'Pick the staff member and give a reason. The old card is marked as replaced.', tone: 'info' })}>Reprint one</Button>
              </div>}
              <p className="text-[12.5px] text-ink3">Last printed: all staff on 12 Jun 2026 by Shalini Verma. 3 reprints since.</p>
            </div>
          </Card>
          <Card>
            <CardHead title="Preview" sub="First card in the batch" />
            <div className="px-5 pb-5 flex justify-center"><IdCardPreview s={byId(desig === 'drivers' ? 'S01' : desig === 'office' ? 'A01' : desig === 'support' ? 'A04' : 'T01')} /></div>
          </Card>
        </Split>
      )}

      {view === 'letters' && (
        <Split className="animate-rise">
          <Card>
            <CardHead title="Letters" sub="Experience letters, salary and service certificates" action={canEdit && <Button size="sm" variant="soft" icon={I.Plus} onClick={() => setLetter(true)}>Experience letter</Button>} />
            <ul className="px-2 pb-2">
              {letters.map((l, i) => {
                const name = l.name || byId(l.sid).name;
                return <li key={i}><Row avatar={name} title={`${l.kind} · ${name}`} sub={l.when} right={<span className="flex items-center gap-2"><Pill tone={l.status === 'Issued' ? 'ok' : 'warn'}>{l.status}</Pill>{l.status === 'Issued' && <Button size="sm" variant="ghost" icon={I.Download} aria-label="Download" onClick={() => toast({ title: `Saved: ${l.kind.replace(/ /g, '-')}-${name.replace(/ /g, '-')}.pdf` })} />}</span>} /></li>;
              })}
            </ul>
          </Card>
          <Suggestion title="Letter text is filled from the record" source="Karthik Menon’s staff record: joined 1 Jul 2022, TGT Computer Science, last working day 31 Oct 2026">
            “This is to certify that Mr. Karthik Menon worked at Sunrise Public School, Kukatpally, as TGT Computer Science from 1 July 2022 to 31 October 2026. He taught Computers to Classes 6 to 9 and ran the school robotics club…”
          </Suggestion>
        </Split>
      )}

      <FormSheet open={up} onClose={() => { setUp(false); setUpErr(''); }} title="Upload document" sub="Reminders go to HR and the staff member before it expires." submitLabel="Upload"
        onSubmit={() => { if (!upWho) { setUpErr('Choose the staff member'); return false; } toast({ title: `${upType} added for ${byId(upWho).name}`, body: 'Reminders set for 30 and 7 days before expiry.' }); setUpWho(''); }}>
        <Field label="Staff member" required id="up-who" error={upErr}><StaffPicker id="up-who" value={upWho} onChange={(v) => { setUpWho(v); setUpErr(''); }} error={upErr} /></Field>
        <Field label="Document type" required id="up-type"><Select id="up-type" value={upType} onChange={setUpType} options={['Police verification', 'Aadhaar card', 'PAN card', 'Degree certificate', 'B.Ed. certificate', 'CTET certificate', 'Contract', 'Driving licence', 'Medical fitness', 'Other']} /></Field>
        <Field label="File" required id="up-file"><Button type="button" variant="secondary" icon={I.Paperclip} onClick={() => toast({ title: 'police-verification-2026.pdf attached', body: '640 KB' })}>Choose file or take a photo</Button></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Number" id="up-num" hint={['Aadhaar card', 'PAN card'].includes(upType) ? 'Shown masked to everyone' : undefined}><Input id="up-num" placeholder="Optional" /></Field>
          <Field label="Expiry date" id="up-exp" hint="Needed for reminders"><Input id="up-exp" placeholder="DD-MM-YYYY" /></Field>
        </div>
      </FormSheet>
      <ConfirmSheet open={print} onClose={() => setPrint(false)} title={`Print ${BATCH[desig][1]} ID cards?`} confirmLabel={`Print ${BATCH[desig][1]} cards`}
        onConfirm={() => toast({ title: `${BATCH[desig][1]} ID cards sent to the office printer`, body: `${Math.ceil(BATCH[desig][1] / 50)} batches of up to 50. Recorded in the print log.` })}>
        <p className="text-[14px] text-ink2">{BATCH[desig][0]}: {BATCH[desig][1]} cards on PVC, in {Math.ceil(BATCH[desig][1] / 50)} {Math.ceil(BATCH[desig][1] / 50) === 1 ? 'batch' : 'batches'} of up to 50. Uses the design in Settings, Document Designs.</p>
      </ConfirmSheet>
      <FormSheet open={letter} onClose={() => setLetter(false)} title="Experience letter" sub="Filled from the staff record with the template in Document Designs." submitLabel="Send for Principal’s signature"
        onSubmit={() => { setLetters((x) => [{ sid: letterWho, kind: 'Experience letter', when: 'Requested today', status: 'Waiting for Principal' }, ...x]); toast({ title: `Experience letter for ${byId(letterWho).name} sent to Lakshmi Rao`, body: 'Issued once she signs it in Approvals.' }); }}>
        <Field label="Staff member" required id="lt-who"><StaffPicker id="lt-who" value={letterWho} onChange={setLetterWho} /></Field>
        <DL rows={[['Joined', byId(letterWho)?.joined || '—'], ['Last working day', byId(letterWho)?.leaving?.lwd || 'Still working'], ['Designation', byId(letterWho)?.desig || '—']]} />
      </FormSheet>
    </div>
  );
}

/* ======================= Recruitment & Appraisal ======================= */
function Recruitment() {
  const [part, setPart] = useState('recruitment');
  const [per, setPer] = useState(DP.acyear);
  return (
    <div>
      <ModuleHead sub="Vacancies and interviews, the yearly appraisal, training hours and promotions. Each part can be switched off in HR Settings." />
      <div className="flex flex-col @lg:flex-row @lg:items-center gap-2.5 mb-5">
        <ScrollSeg className="min-w-0" value={part} onChange={setPart} options={[{ value: 'recruitment', label: 'Recruitment' }, { value: 'appraisal', label: 'Appraisal' }, { value: 'training', label: 'Training' }, { value: 'promotions', label: 'Promotions' }]} />
        {part !== 'appraisal' && <DatePeriod id="rc-per" value={per} onChange={setPer} className="w-full @lg:w-auto @lg:ml-auto" />}
      </div>
      <div key={part} className="animate-rise">
        {part === 'recruitment' && <Hiring per={per} />}
        {part === 'appraisal' && <Appraisal />}
        {part === 'training' && <Training per={per} />}
        {part === 'promotions' && <Promotions per={per} />}
      </div>
    </div>
  );
}

function Hiring({ per }) {
  const toast = useToast();
  const { go } = useNav();
  const canEdit = useCanEdit();
  const [vac, setVac] = useState(VACANCIES);
  const [cur, setCur] = useState('V-26-07');
  const [apps, setApps] = useState(APPLICANTS);
  const [open, setOpen] = useState(false);
  const [nv, setNv] = useState({ post: 'TGT Hindi', openings: '1', closes: '', details: '' });
  const [sched, setSched] = useState(null);
  const [slot, setSlot] = useState('Mon 12 Oct, 4:00 PM');
  const [offer, setOffer] = useState(null);
  const shownVac = vac.filter((x) => x.opened <= per.to && (x.shut || '2099-12-31') >= per.from);
  const v = shownVac.find((x) => x.id === cur) || shownVac[0];
  const list = v ? apps[v.id] || [] : [];
  const setStage = (name, stage, extra = {}) => setApps((x) => ({ ...x, [v.id]: x[v.id].map((a) => (a.name === name ? { ...a, stage, ...extra } : a)) }));
  const clash = slot === 'Mon 12 Oct, 2:30 PM' && sched?.name !== 'Harika Chowdary';
  return (
    <div className="flex flex-col gap-5 @lg:gap-6">
      <Showing per={per} n={shownVac.length} what={shownVac.length === 1 ? 'vacancy open in these dates' : 'vacancies open in these dates'} />
      <Stats items={[
        { label: 'Open vacancies', value: String(shownVac.filter((x) => x.status !== 'Filled').length), sub: `${shownVac.filter((x) => x.status !== 'Filled').reduce((a, x) => a + x.openings, 0)} posts`, icon: 'Megaphone' },
        { label: 'Applications', value: String(shownVac.reduce((a, x) => a + x.apps, 0)), sub: 'For the vacancies shown', icon: 'Inbox' },
        { label: 'Interviews this week', value: '3', sub: 'Mon 12 and Wed 14 Oct', icon: 'CalendarClock' },
        { label: 'Offers out', value: '1', sub: 'Driver · reply by Sat 10 Oct', tone: 'warn', icon: 'Handshake' },
      ]} />
      <Split side={380}>
        <Col>
          <Card>
            <CardHead title="Vacancies" action={canEdit && <Button size="sm" variant="soft" icon={I.Plus} onClick={() => setOpen(true)}>Open a vacancy</Button>} />
            {shownVac.length === 0 && <Empty icon={I.Briefcase} title="No vacancy in these dates" body="Pick a longer period, like This academic year." />}
            <ul className="px-2 pb-2">
              {shownVac.map((x) => (
                <li key={x.id}>
                  <button onClick={() => setCur(x.id)} className={cx('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition', cur === x.id ? 'bg-brand/8 ring-1 ring-brand/30' : 'hover:bg-sunken/70')}>
                    <span className="w-10 h-10 rounded-xl bg-brand/10 text-brand grid place-items-center shrink-0"><I.Briefcase size={19} /></span>
                    <span className="min-w-0 flex-1"><span className="block font-semibold text-[14.5px] truncate">{x.post} · {x.openings} {x.openings === 1 ? 'post' : 'posts'}</span><span className="block text-[12.5px] text-ink3 truncate">{x.note} · closes {x.closes}</span></span>
                    <span className="text-right shrink-0"><Pill tone={x.status === 'Offer made' ? 'warn' : x.status === 'Interviews' ? 'brand' : x.status === 'Filled' ? 'ok' : 'info'}>{x.status}</Pill><span className="block text-[12px] text-ink3 tnum mt-1">{x.apps} applied</span></span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          {v && <Card className="overflow-hidden">
            <CardHead title={`Applications · ${v.post}`} sub={`${v.apps} received · showing the latest ${list.length}`} action={<ExportButton what="applications" />} />
            <ul className="divide-y divide-line/70 border-t border-line/70">
              {list.map((a) => (
                <li key={a.name} className="px-4 @md:px-5 py-3 flex flex-col @md:flex-row @md:items-center gap-2.5">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Avatar name={a.name} size={40} />
                    <div className="min-w-0"><p className="font-semibold text-[14.5px] truncate">{a.name}</p><p className="text-[12.5px] text-ink3 truncate">{a.exp} · {a.from}{a.when ? ` · ${a.when}` : ''}</p></div>
                    <Pill tone={STAGE_TONE[a.stage]} className="ml-auto @md:ml-2 shrink-0">{a.stage}</Pill>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1.5 @md:justify-end">
                      {a.stage === 'Applied' && <Button size="sm" variant="secondary" onClick={() => { setStage(a.name, 'Shortlisted'); toast({ title: `${a.name} shortlisted`, undo: () => setStage(a.name, 'Applied') }); }}>Shortlist</Button>}
                      {a.stage === 'Shortlisted' && <Button size="sm" variant="secondary" icon={I.CalendarClock} onClick={() => { setSched(a); setSlot('Mon 12 Oct, 4:00 PM'); }}>Interview</Button>}
                      {a.stage === 'Interview' && <Button size="sm" variant="soft" icon={I.Handshake} onClick={() => setOffer(a)}>Make offer</Button>}
                      {a.stage === 'Offer made' && <Button size="sm" variant="soft" icon={I.UserPlus} onClick={() => { go('staff', { page: 'add' }); toast({ title: `Adding ${a.name}`, body: 'Name, phone and post filled in from the application', tone: 'info' }); }}>Offer accepted</Button>}
                      {a.stage !== 'Offer made' && a.stage !== 'Not selected' && <Button size="sm" variant="ghost" onClick={() => { setStage(a.name, 'Not selected'); toast({ title: `${a.name}: not selected`, body: 'A polite regret message goes by email.', undo: () => setStage(a.name, a.stage) }); }}>Not selected</Button>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Card>}
        </Col>
        <Card>
          <CardHead title="Interview schedule" sub="Panels are never double-booked" icon={I.CalendarClock} />
          <Timeline items={[
            { icon: 'Users', tone: 'brand', what: 'Harika Chowdary · TGT Computer Science · demo class in 7 A', when: 'Mon 12 Oct, 2:30 PM · Srinivas Murthy, Meena Pillai' },
            { icon: 'Users', tone: 'brand', what: 'Rahul Varma · TGT Computer Science', when: 'Mon 12 Oct, 3:15 PM · Srinivas Murthy, Meena Pillai' },
            { icon: 'Users', tone: 'info', what: 'Farah Siddiqui · PRT · demo class in 2 B', when: 'Wed 14 Oct, 11:00 AM · Meena Pillai, Usha Rani' },
            { icon: 'Handshake', tone: 'warn', what: 'Offer to Yadagiri Pasham · Driver, Bus 7 · ₹18,500 a month', when: 'Sent Thu 8 Oct · reply by Sat 10 Oct' },
          ]} />
        </Card>
      </Split>
      <FormSheet open={open} onClose={() => setOpen(false)} title="Open a vacancy" submitLabel="Open vacancy"
        onSubmit={() => { const id = `V-26-0${vac.length + 5}`; setVac((x) => [{ id, opened: '2026-10-09', shut: '', post: nv.post, dept: DESIG_DEPT.Teacher, openings: Number(nv.openings) || 1, closes: nv.closes || 'Not set', status: 'Open', apps: 0, note: nv.details || 'New post' }, ...x]); setApps((x) => ({ ...x, [id]: [] })); setCur(id); toast({ title: `Vacancy open: ${nv.post}`, body: 'Share the link on the school website and WhatsApp.' }); }}>
        <Field label="Post (designation)" required id="nv-post"><Select id="nv-post" value={nv.post} onChange={(p) => setNv({ ...nv, post: p })} options={['TGT Hindi', 'TGT Computer Science', 'PGT Physics', 'PRT', 'Driver', 'Attender', 'Lab Assistant', 'Security']} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Openings" required id="nv-open"><Input id="nv-open" value={nv.openings} onChange={(e) => setNv({ ...nv, openings: e.target.value.replace(/\D/g, '') })} inputMode="numeric" /></Field>
          <Field label="Closing date" id="nv-close"><Input id="nv-close" value={nv.closes} onChange={(e) => setNv({ ...nv, closes: e.target.value })} placeholder="DD-MM-YYYY" /></Field>
        </div>
        <Field label="Details" id="nv-det" hint="Shown on the application page"><Textarea id="nv-det" value={nv.details} onChange={(d) => setNv({ ...nv, details: d })} rows={3} placeholder="Qualifications, experience, classes to teach" /></Field>
      </FormSheet>
      <Sheet open={!!sched} onClose={() => setSched(null)} title={sched ? `Interview for ${sched.name}` : ''} sub="Panel: Srinivas Murthy, Meena Pillai"
        footer={<><Button variant="ghost" onClick={() => setSched(null)}>Cancel</Button><Button variant="primary" disabled={clash} onClick={() => { setStage(sched.name, 'Interview', { when: slot, panel: 'Srinivas Murthy, Meena Pillai' }); setSched(null); toast({ title: `Interview set: ${sched.name}`, body: `${slot}. The candidate and the panel are told.` }); }}>Schedule interview</Button></>}>
        <Field label="Date and time" required id="iv-slot" error={clash ? 'Srinivas Murthy already interviews Harika Chowdary at this time. Pick another slot.' : ''}>
          <Select id="iv-slot" value={slot} onChange={setSlot} error={clash} options={['Mon 12 Oct, 2:30 PM', 'Mon 12 Oct, 4:00 PM', 'Tue 13 Oct, 2:30 PM', 'Wed 14 Oct, 12:00 PM']} />
        </Field>
      </Sheet>
      <ConfirmSheet open={!!offer} onClose={() => setOffer(null)} title={offer ? `Make an offer to ${offer.name}?` : ''} confirmLabel="Send offer letter"
        onConfirm={() => { setStage(offer.name, 'Offer made', { when: 'Offer sent today' }); toast({ title: `Offer letter sent to ${offer.name}`, body: 'Email and WhatsApp, from the template in Document Designs.' }); }}>
        {offer && v && <p className="text-[14px] text-ink2">The offer letter for {v.post} goes to {offer.name} by email and WhatsApp. When they accept, Add Staff opens with their details filled in.</p>}
      </ConfirmSheet>
    </div>
  );
}

function Appraisal() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const [remind, setRemind] = useState(false);
  const counts = APPRAISALS.reduce((m, a) => ((m[a[1]] = (m[a[1]] || 0) + 1), m), {});
  return (
    <div className="flex flex-col gap-5 @lg:gap-6">
      <Card className="p-5 flex flex-col @md:flex-row @md:items-center gap-5">
        <div className="flex-1">
          <p className="font-semibold text-[15px]">Appraisal cycle 2026–27</p>
          <p className="text-[13.5px] text-ink3 mt-0.5">Form: Teacher appraisal (Settings, Forms & Approvals) · self review till Sat 31 Oct · manager review till Mon 30 Nov</p>
          <div className="mt-3 max-w-md"><Progress value={(21 / 58) * 100} /><p className="text-[12.5px] text-ink3 mt-1.5 tnum">21 of 58 teachers done · {APPRAISALS.length} shown below</p></div>
        </div>
        {canEdit && <div className="flex gap-2"><Button variant="secondary" icon={I.Send} onClick={() => setRemind(true)}>Remind</Button><Button variant="ghost" icon={I.Lock} onClick={() => toast({ title: 'Close the cycle on 30 Nov', body: 'Ratings lock and go to each profile. You can close it early from here.', tone: 'info' })}>Close cycle</Button></div>}
      </Card>
      <Card className="overflow-hidden">
        <DataList rows={APPRAISALS.map(([sid, st, r]) => ({ id: sid, s: byId(sid), st, r }))} minWidth={640}
          columns={[
            { key: 'n', label: 'Staff member', render: (x) => <div className="flex items-center gap-3"><Avatar name={x.s.name} size={34} /><div><p className="font-semibold leading-tight">{x.s.name}</p><p className="text-[12px] text-ink3">{x.s.desig}</p></div></div> },
            { key: 'm', label: 'Reviewer', render: (x) => x.s.manager },
            { key: 'st', label: 'Stage', render: (x) => <Pill tone={APP_TONE[x.st]}>{x.st}</Pill> },
            { key: 'r', label: 'Rating', render: (x) => x.r ? <span className="inline-flex gap-0.5 text-warn" aria-label={`${x.r} of 5`}>{Array.from({ length: 5 }, (_, i) => <I.Star key={i} size={14} fill={i < x.r ? 'currentColor' : 'none'} className={i < x.r ? '' : 'text-line'} />)}</span> : <span className="text-ink3">—</span> },
          ]}
          mobile={(x) => ({ avatar: x.s.name, title: x.s.name, sub: `${x.s.desig} · ${x.r ? `${x.r} of 5` : 'no rating yet'}`, pills: [<Pill key="p" tone={APP_TONE[x.st]} className="!h-[22px] !text-[11.5px]">{x.st}</Pill>] })} />
      </Card>
      <ConfirmSheet open={remind} onClose={() => setRemind(false)} title={`Remind ${(counts['Not started'] || 0) + (counts['Self review'] || 0)} staff?`} confirmLabel={`Send to ${(counts['Not started'] || 0) + (counts['Self review'] || 0)} staff`}
        onConfirm={() => toast({ title: 'Reminders sent', body: 'Self review closes Sat 31 Oct.' })}>
        <p className="text-[14px] text-ink2">Staff who have not started or not finished their self review get a WhatsApp reminder with the link. Messages cannot be unsent.</p>
      </ConfirmSheet>
    </div>
  );
}

function Training({ per }) {
  const toast = useToast();
  const canEdit = useCanEdit();
  const [add, setAdd] = useState(false);
  const [rows, setRows] = useState(TRAINING);
  const [who, setWho] = useState('T05');
  const [course, setCourse] = useState('Art-integrated learning (CBSE online)');
  return (
    <Split>
      <Card className="overflow-hidden">
        <CardHead title="Training records" sub="2026–27 · CBSE asks for 50 hours a year for each teacher" action={canEdit && <Button size="sm" variant="soft" icon={I.Plus} onClick={() => setAdd(true)}>Record training</Button>} />
        <div className="px-5 pb-3"><Showing per={per} n={rows.filter((t) => inPer(t.on, per)).length} what="records" /></div>
        <DataList rows={rows.map((t, i) => ({ ...t, id: i })).filter((t) => inPer(t.on, per))} minWidth={640}
          empty={<Empty icon={I.GraduationCap} title="No training in these dates" body="Pick a longer period, like This academic year." />}
          columns={[
            { key: 'n', label: 'Staff member', render: (t) => <span className="font-semibold">{byId(t.sid).name}</span> },
            { key: 'c', label: 'Course', render: (t) => t.course },
            { key: 'd', label: 'Dates', nowrap: true, render: (t) => t.dates },
            { key: 'h', label: 'Hours', align: 'right', render: (t) => t.hours },
            { key: 'cert', label: 'Certificate', render: (t) => t.cert ? <Pill tone="ok">On file</Pill> : <Pill tone="warn">Awaited</Pill> },
          ]}
          mobile={(t) => ({ avatar: byId(t.sid).name, title: t.course, sub: `${byId(t.sid).name} · ${t.dates} · ${t.hours} h` })} />
      </Card>
      <Card>
        <CardHead title="Hours so far" sub="Teachers with the fewest hours first" />
        <div className="px-5 pb-5"><HBars rows={[['Venkat Rao', 0], ['Deepak Verma', 3], ['Swapna Reddy', 3], ['Anitha Kumari', 10], ['Ravi Teja', 12], ['Sunitha Mohan', 18]].map(([k, v]) => ({ k: k.split(' ')[0], v, label: `${v} h` }))} max={50} goal={50} lowBelow={10} /></div>
      </Card>
      <FormSheet open={add} onClose={() => setAdd(false)} title="Record training" submitLabel="Save training"
        onSubmit={() => { setRows((x) => [{ sid: who, on: '2026-10-09', course, dates: '9 Oct 2026', hours: 6, cert: false }, ...x]); toast({ title: `Training saved for ${byId(who).name}`, body: '6 hours added to this year.' }); }}>
        <Field label="Staff member" required id="tr-who"><StaffPicker id="tr-who" value={who} onChange={setWho} filter={isTeacher} /></Field>
        <Field label="Course" required id="tr-course"><Input id="tr-course" value={course} onChange={(e) => setCourse(e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dates" required id="tr-dates"><Input id="tr-dates" defaultValue="09-10-2026" /></Field>
          <Field label="Hours" required id="tr-hours"><Input id="tr-hours" defaultValue="6" inputMode="numeric" /></Field>
        </div>
      </FormSheet>
    </Split>
  );
}

function Promotions({ per }) {
  const toast = useToast();
  const canEdit = useCanEdit();
  const [rows, setRows] = useState(PROMOTIONS);
  const [add, setAdd] = useState(false);
  const [who, setWho] = useState('T12');
  const [to, setTo] = useState('PGT Mathematics');
  return (
    <Card className="overflow-hidden">
      <CardHead title="Promotions" sub="Every change of designation, newest first" action={canEdit && <Button size="sm" variant="soft" icon={I.Plus} onClick={() => setAdd(true)}>Record promotion</Button>} />
      <div className="px-5 pb-3"><Showing per={per} n={rows.filter((p) => inPer(p.on, per)).length} what="promotions" /></div>
      <DataList rows={rows.map((p, i) => ({ ...p, id: i })).filter((p) => inPer(p.on, per))} minWidth={700}
        empty={<Empty icon={I.TrendingUp} title="No promotion in these dates" body="Promotions usually start on 1 June. Pick Last academic year or your own dates." />}
        columns={[
          { key: 'n', label: 'Staff member', render: (p) => <div className="flex items-center gap-3"><Avatar name={byId(p.sid).name} size={34} /><span className="font-semibold">{byId(p.sid).name}</span></div> },
          { key: 'f', label: 'From', render: (p) => p.from },
          { key: 't', label: 'To', render: (p) => <span className="font-semibold">{p.to}</span> },
          { key: 'd', label: 'From date', nowrap: true, render: (p) => p.date },
          { key: 'r', label: 'Reason', render: (p) => <span className="text-ink2">{p.reason}</span> },
        ]}
        mobile={(p) => ({ avatar: byId(p.sid).name, title: byId(p.sid).name, sub: `${p.from} → ${p.to} · ${p.date}` })} />
      <FormSheet open={add} onClose={() => setAdd(false)} title="Record promotion" sub="The salary change goes to Salary Structures as a new version." submitLabel="Save promotion"
        onSubmit={() => { const s = byId(who); setRows((x) => [{ sid: who, on: '2026-11-01', from: s.desig, to, date: '1 Nov 2026', reason: 'Approved by the Principal' }, ...x]); toast({ title: `${s.name} promoted to ${to} from 1 Nov`, body: 'Salary Structures asks the Accountant for the new version.' }); }}>
        <Field label="Staff member" required id="pr-who"><StaffPicker id="pr-who" value={who} onChange={setWho} /></Field>
        <Field label="New designation" required id="pr-to"><Select id="pr-to" value={to} onChange={setTo} options={['PGT Mathematics', 'PGT English', 'Coordinator', 'Vice Principal', 'Senior Accountant', 'Head Driver']} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From date" required id="pr-date"><Input id="pr-date" defaultValue="01-11-2026" /></Field>
          <Field label="Reason" required id="pr-why"><Input id="pr-why" defaultValue="Appraisal 2025–26" /></Field>
        </div>
      </FormSheet>
    </Card>
  );
}

/* ======================= Staff Exit ======================= */
function StaffExit() {
  const toast = useToast();
  const { go } = useNav();
  const canEdit = useCanEdit();
  const [cases, setCases] = useState(EXITS);
  const [cur, setCur] = useState('EX-26-04');
  const [hand, setHand] = useState(HANDOVER);
  const [rec, setRec] = useState(false);
  const [f, setF] = useState({ sid: '', kind: 'Resignation', lwd: '07-11-2026', reason: '' });
  const [err, setErr] = useState({});
  const [settle, setSettle] = useState(false);
  const c = cases.find((x) => x.id === cur);
  const s = c.sid ? byId(c.sid) : { name: c.name, desig: c.desig, first: c.name.split(' ')[0] };
  const items = c.sid ? hand[c.sid] || [] : [];
  const clear = c.sid ? CLEARANCE(c.sid) : [];
  const handDone = items.filter((x) => x.done).length;
  const assign = (i, to) => { setHand((h) => ({ ...h, [c.sid]: h[c.sid].map((x, j) => (j === i ? { ...x, to, done: true } : x)) })); toast({ title: `Handed over to ${to}`, body: items[i].kind === 'Classes' ? 'Teacher Allocation and the Time Table are updated.' : 'Recorded on the exit.' }); };
  return (
    <div className="flex flex-col gap-5 @lg:gap-6">
      <div>
        <ModuleHead sub="Resignations, retirements and terminations: handover, clearance and final settlement"
          actions={<Button variant="primary" icon={I.LogOut} onClick={() => setRec(true)}>Record resignation</Button>} />
        <Stats items={[
          { label: 'Leaving now', value: '2', sub: 'last days 31 Oct and 30 Nov', icon: 'UserMinus' },
          { label: 'Handover left', value: String(Object.values(hand).flat().filter((x) => !x.done).length), sub: 'items to give to someone', tone: 'warn', icon: 'ArrowRightLeft' },
          { label: 'Clearance left', value: '7', sub: 'checks across modules', icon: 'ListChecks' },
          { label: 'Settled this year', value: '3', sub: '₹68,900 paid out', icon: 'Wallet' },
        ]} />
      </div>
      <Split side={380}>
        <Col>
          <Card>
            <CardHead title="Staff leaving" />
            <ul className="px-2 pb-2">
              {cases.map((x) => {
                const p = x.sid ? byId(x.sid) : { name: x.name, desig: x.desig };
                return (
                  <li key={x.id}>
                    <button onClick={() => setCur(x.id)} className={cx('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition', cur === x.id ? 'bg-brand/8 ring-1 ring-brand/30' : 'hover:bg-sunken/70')}>
                      <Avatar name={p.name} size={40} />
                      <span className="min-w-0 flex-1"><span className="block font-semibold text-[14.5px] truncate">{p.name}</span><span className="block text-[12.5px] text-ink3 truncate">{x.kind} · last day {x.lwd}</span></span>
                      <Pill tone={x.done ? 'ok' : 'warn'}>{x.done ? 'Closed' : `${(hand[x.sid] || []).filter((y) => y.done).length} of ${(hand[x.sid] || []).length} handed`}</Pill>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card>
            <CardHead title={`${s.name} · ${c.kind}`} sub={`${s.desig} · letter received ${c.received} · ${c.approval}`} action={!c.done && canEdit && <MoreMenu size="sm" items={[[I.ScrollText, 'Experience letter', () => go('staff', { page: 'documents' })], [I.CalendarClock, 'Change last working day', () => toast({ title: 'Change the last working day', body: 'Needs a reason. The login closes on the new date.', tone: 'info' })]]} />} />
            <DL rows={[['Last working day', c.lwd], ['Reason', c.reason], ['Login', c.done ? 'Closed on 31 Aug 2026' : `Closes by itself at the end of ${c.lwd.replace(' 2026', '')}`], ['Final settlement', c.settle]]} />
          </Card>
          {c.sid && (
            <Card>
              <CardHead title="Handover" sub={`${handDone} of ${items.length} handed over · pulled from Academics, Inventory and Library`} />
              <ul className="divide-y divide-line/70 border-t border-line/70">
                {items.map((x, i) => (
                  <li key={x.what} className="px-4 @md:px-5 py-3 flex flex-col @md:flex-row @md:items-center gap-2">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <span className={cx('w-7 h-7 rounded-full grid place-items-center shrink-0 mt-0.5', x.done ? 'bg-ok/15 text-ok' : 'bg-sunken text-ink3')}>{x.done ? <I.Check size={14} strokeWidth={3} /> : <I.Circle size={10} />}</span>
                      <div className="min-w-0"><p className="text-[14px] font-semibold">{x.what}</p><p className="text-[12.5px] text-ink3">{x.kind} · {x.done ? `to ${x.to}` : 'Not given to anyone yet'}</p></div>
                    </div>
                    {!x.done && canEdit && (x.kind === 'Classes' || x.kind === 'Duties' ? (
                      <select aria-label={`Hand over ${x.what}`} defaultValue="" onChange={(e) => e.target.value && assign(i, e.target.value)} className="h-9 rounded-lg border border-line bg-surface px-2 text-[13px] text-ink outline-none focus:border-brand @md:w-48">
                        <option value="">Give to…</option>
                        {['Harika Chowdary (new, from 2 Nov)', 'Imran Shaikh', 'Farhana Begum', 'Prakash Joshi', 'Usha Rani'].map((n) => <option key={n}>{n}</option>)}
                      </select>
                    ) : <Button size="sm" variant="secondary" onClick={() => assign(i, x.to.replace('Return to ', ''))}>Mark returned</Button>)}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </Col>
        <Col>
          <Card>
            <CardHead title="Clearance" sub="Checks across modules" icon={I.ListChecks} />
            {c.done ? <p className="px-5 pb-5 text-[14px] text-ink2">All 4 checks passed on 31 Aug 2026.</p> : (
              <ul className="px-5 pb-4 flex flex-col gap-3">
                {clear.map((x) => (
                  <li key={x.what} className="flex items-start gap-3 text-[14px]">
                    {x.ok ? <I.CircleCheck size={18} className="text-ok shrink-0 mt-0.5" /> : <I.Circle size={18} className="text-ink3 shrink-0 mt-0.5" />}
                    <span className="min-w-0"><b className="font-semibold">{x.what}</b><span className="block text-[12.5px] text-ink3">{x.where}{x.note ? ` · ${x.note}` : ''}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHead title="Final settlement" sub="Sent to Salary Management" icon={I.Wallet} />
            {c.done ? <p className="px-5 pb-5 text-[14px] text-ink2">{c.settle}. In the Day Book on 7 Sep 2026.</p> : (
              <div className="px-5 pb-5 flex flex-col gap-3 text-[14px]">
                <ul className="flex flex-col gap-1.5 tnum">
                  <li className="flex justify-between"><span className="text-ink3">Salary for October (31 days)</span><span>{c.sid === 'T09' ? '₹36,200' : '₹12,500'}</span></li>
                  <li className="flex justify-between"><span className="text-ink3">Earned leave encashment</span><span className="text-ink3">School does not pay</span></li>
                  <li className="flex justify-between"><span className="text-ink3">Advance to recover</span><span className="text-bad">{c.sid === 'T09' ? '− ₹6,000' : '₹0'}</span></li>
                  <li className="flex justify-between border-t border-line pt-1.5 font-semibold"><span>To pay (before PF and tax)</span><span>{c.sid === 'T09' ? '₹30,200' : '₹12,500'}</span></li>
                </ul>
                {canEdit && <Button variant="secondary" icon={I.Send} disabled={handDone < items.length} onClick={() => setSettle(true)}>Send to Salary Management</Button>}
                {handDone < items.length && <p className="text-[12.5px] text-ink3">Finish the handover first. {items.length - handDone} {items.length - handDone === 1 ? 'item is' : 'items are'} left.</p>}
              </div>
            )}
          </Card>
        </Col>
      </Split>
      <FormSheet open={rec} onClose={() => { setRec(false); setErr({}); }} title="Record resignation" sub="Retirement needs no approval. Termination goes to the Principal first." submitLabel="Record and start handover"
        onSubmit={() => {
          const e = {};
          if (!f.sid) e.sid = 'Choose the staff member';
          if (!parseDMY(f.lwd)) e.lwd = 'Enter the date as DD-MM-YYYY';
          if (!f.reason.trim()) e.reason = 'Give a reason';
          setErr(e);
          if (Object.keys(e).length) return false;
          const p = byId(f.sid);
          const id = `EX-26-0${cases.length + 4}`;
          setCases((x) => [{ id, sid: f.sid, kind: f.kind, received: 'Fri 9 Oct', lwd: fmt(parseDMY(f.lwd)) + ' 2026', reason: f.reason, handover: [0, 1], clear: [0, 3], settle: 'Not started', approval: f.kind === 'Termination' ? 'Waiting for Lakshmi Rao' : 'Recorded by HR' }, ...x]);
          setHand((h) => ({ ...h, [f.sid]: h[f.sid] || [{ what: `${p.desig} duties`, kind: 'Duties', to: 'Not yet given', done: false }] }));
          setCur(id);
          toast({ title: `${f.kind} recorded for ${p.name}`, body: `Last working day ${f.lwd}. The handover list is ready.` });
        }}>
        <Field label="Staff member" required id="ex-who" error={err.sid}><StaffPicker id="ex-who" value={f.sid} onChange={(v) => setF({ ...f, sid: v })} error={err.sid} /></Field>
        <Field label="Type" required id="ex-kind"><Segmented value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={['Resignation', 'Retirement', 'Termination']} className="w-full" /></Field>
        <Field label="Last working day" required id="ex-lwd" error={err.lwd} hint={!err.lwd && 'Today plus the 30-day notice period (HR Settings), moved off Sunday'}><Input id="ex-lwd" value={f.lwd} onChange={(e) => setF({ ...f, lwd: e.target.value })} error={err.lwd} placeholder="DD-MM-YYYY" /></Field>
        <Field label="Reason" required id="ex-why" error={err.reason}><Textarea id="ex-why" value={f.reason} onChange={(v) => setF({ ...f, reason: v })} rows={2} placeholder="Like: moving to another city" /></Field>
        <Field label="Letter" id="ex-letter"><Button type="button" variant="secondary" icon={I.Paperclip} onClick={() => toast({ title: 'resignation-letter.pdf attached' })}>Attach the letter</Button></Field>
      </FormSheet>
      <ConfirmSheet open={settle} onClose={() => setSettle(false)} title={`Send ${s.first}’s final settlement to Salary?`} confirmLabel="Send to Salary Management"
        onConfirm={() => { setCases((x) => x.map((y) => (y.id === c.id ? { ...y, settle: 'With Suresh Babu (Salary)' } : y))); toast({ title: 'Final settlement sent to Salary Management', body: 'Suresh Babu adds it to the October salary.' }); }}>
        <p className="text-[14px] text-ink2">The last month’s pay and recoveries go to the Accountant. It is paid with the month’s salary after the Principal approves.</p>
      </ConfirmSheet>
    </div>
  );
}

/* ======================= HR Settings ======================= */
function HRSettings() {
  const toast = useToast();
  const { go } = useNav();
  const { role } = useRole();
  const canEdit = useCanEdit();
  const [heads, setHeads] = useState(DEPT_HEAD);
  const [head, setHead] = useState(null);
  const [pick, setPick] = useState('');
  const [lt, setLt] = useState(null);
  return (
    <div>
      <ModuleHead sub="Departments, designations, leave types and rules. Every change is logged." />
      <div className="grid @xl:grid-cols-2 gap-5 @lg:gap-6 items-start">
        <Col>
          <Card>
            <CardHead title="Departments" sub="The head is the first leave approver for the department" icon={I.Building2} action={canEdit && <Button size="sm" variant="soft" icon={I.Plus} onClick={() => toast({ title: 'Add department', body: 'Name and head. It shows up in every staff filter.', tone: 'info' })}>Add</Button>} />
            <ul className="divide-y divide-line/70 border-t border-line/70">
              {DEPARTMENTS.map((d) => (
                <li key={d.k} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px]">{d.k} <span className="text-ink3 font-normal text-[13px] tnum">· {d.n} staff</span></p><p className="text-[12.5px] text-ink3 truncate">Head: {heads[d.k]}</p></div>
                  {canEdit && <Button size="sm" variant="ghost" onClick={() => { setHead(d.k); setPick(''); }}>Change head</Button>}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHead title="Designations" sub="Each with a default department and role" icon={I.IdCard} action={canEdit && <Button size="sm" variant="soft" icon={I.Plus} onClick={() => toast({ title: 'Add designation', body: 'Name, default department and default role', tone: 'info' })}>Add</Button>} />
            <ul className="divide-y divide-line/70 border-t border-line/70">
              {DESIGS.slice(0, 10).map((d) => (
                <li key={d} className="flex items-center gap-3 px-5 py-2.5 text-[14px]">
                  <span className="font-semibold flex-1 min-w-0 truncate">{d}</span>
                  <span className="text-ink3 text-[12.5px] hidden @sm:block">{DESIG_DEPT[d]}</span>
                  <Pill tone="neutral">{ROLE_CARDS.find((r) => r.id === DESIG_ROLE[d])?.name || 'Office Staff'}</Pill>
                </li>
              ))}
            </ul>
          </Card>
          <SettingsCard title="Staff record and IDs" icon={I.Hash} rows={[
            { title: 'Staff ID format', sub: 'T for teaching, A for office, S for support', value: 'SPS-T-034' },
            { title: 'Username format', sub: 'Password rules are in Settings, Users & Permissions', value: 'first.last' },
            { title: 'Notice period for exits', value: '30 days' },
            { title: 'Document reminders', sub: 'Before a document expires', value: '30 and 7 days' },
            { title: 'Required staff fields', sub: 'Aadhaar, address and an emergency contact, beyond name, phone and designation', value: '6 fields' },
          ]} />
        </Col>
        <Col>
          <Card>
            <CardHead title="Leave types and rules" sub="Yearly quota for permanent staff · leave year Jun to May" icon={I.CalendarDays} action={canEdit && <Button size="sm" variant="soft" icon={I.Plus} onClick={() => toast({ title: 'Add leave type', body: 'Like Bereavement leave or Exam duty off', tone: 'info' })}>Add</Button>} />
            <ul className="divide-y divide-line/70 border-t border-line/70">
              {[...LEAVE_TYPES, { k: 'SP', name: 'Special leave', quota: 3, half: false, sensitive: false }].map((t) => (
                <li key={t.k} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[14.5px]">{t.name} <span className="text-ink3 font-normal text-[13px] tnum">· {t.quota} days a year</span></p>
                    <div className="flex gap-1.5 flex-wrap mt-1">
                      {t.k === 'EL' && <Pill tone="info" className="!h-5 !text-[11px]">Carry forward up to 30</Pill>}
                      {t.half && <Pill className="!h-5 !text-[11px]">Half days</Pill>}
                      {t.sensitive && <Pill tone="brand" className="!h-5 !text-[11px]"><I.EyeOff size={11} />Sensitive</Pill>}
                      {(t.k === 'ML' || t.k === 'SL') && <Pill className="!h-5 !text-[11px]">{t.k === 'ML' ? 'Document needed' : 'Certificate for 3+ days'}</Pill>}
                      {t.k === 'CL' && <Pill tone="warn" className="!h-5 !text-[11px]">Loss of pay when used up</Pill>}
                    </div>
                  </div>
                  {canEdit && <Button size="sm" variant="ghost" onClick={() => setLt(t)}>Edit</Button>}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHead title="Quota by staff group" sub="Days a year · casual, sick, earned" />
            <ul className="px-2 pb-2">
              {[['Permanent teaching', '12 · 10 · 15'], ['Permanent non-teaching', '12 · 10 · 15'], ['Contract and temporary', '8 · 6 · 0'], ['Drivers and attenders', '10 · 8 · 12']].map(([k, v]) => <li key={k}><Row icon={I.Users} title={k} right={<span className="tnum font-semibold text-[14px]">{v}</span>} /></li>)}
            </ul>
          </Card>
          <Card>
            <CardHead title="Leave approvers" sub="Stored in Settings, Forms & Approvals" icon={I.Workflow} />
            <div className="px-5 pb-5 flex flex-col gap-3">
              <div className="flex items-center gap-2 flex-wrap text-[14px]"><Pill tone="brand">Head of department</Pill><I.ChevronRight size={16} className="text-ink3" /><Pill tone="brand">Principal</Pill></div>
              <p className="text-[13px] text-ink3">Nobody approves their own leave. When the head asks for leave, it goes straight to the Principal.</p>
              {role.access.settings && <Button className="self-start" size="sm" variant="secondary" icon={I.ArrowUpRight} onClick={() => go('settings', { page: 'forms' })}>Change in Forms & Approvals</Button>}
            </div>
          </Card>
          <SettingsCard title="Optional parts" sub="Shown in Recruitment & Appraisal when on" icon={I.SlidersHorizontal} rows={[
            { title: 'Recruitment', sub: 'Vacancies, applications, interviews, offers', on: true },
            { title: 'Appraisal', sub: 'Yearly review cycle', on: true },
            { title: 'Training records', on: true },
            { title: 'Promotions', on: true },
          ]} />
        </Col>
      </div>
      <Sheet open={!!head} onClose={() => setHead(null)} title={`Head of ${head || ''}`} sub="Their team’s leave requests go to them first, then to the Principal."
        footer={<><Button variant="ghost" onClick={() => setHead(null)}>Cancel</Button><Button variant="primary" disabled={!pick} onClick={() => { const old = heads[head]; setHeads({ ...heads, [head]: byId(pick).name }); toast({ title: `${byId(pick).name} is now head of ${head}`, body: 'New leave requests go to them first.', undo: () => setHeads((h) => ({ ...h, [head]: old })) }); setHead(null); }}>Make head</Button></>}>
        <StaffPicker id="hd-pick" value={pick} onChange={setPick} filter={(s) => !head || s.dept === head || ['Teaching', 'Office'].includes(s.dept)} />
      </Sheet>
      <FormSheet open={!!lt} onClose={() => setLt(null)} title={lt ? `Edit ${lt.name}` : ''} sub="Applies from the next request. Balances already given stay." submitLabel="Save rules"
        onSubmit={() => toast({ title: `${lt.name} rules saved`, body: 'Recorded in the audit log.' })}>
        {lt && <>
          <Field label="Yearly quota (days)" required id="lt-q"><Input id="lt-q" defaultValue={String(lt.quota)} inputMode="numeric" /></Field>
          <div className="rounded-xl border border-line divide-y divide-line/70">
            {[['Half days allowed', lt.half], ['Carry forward to next year', lt.k === 'EL'], ['Document needed', lt.k === 'ML'], ['Sensitive: show only “On leave” to colleagues', lt.sensitive], ['Loss of pay when the balance runs out', lt.k === 'CL']].map(([t, on]) => <ToggleLine key={t} title={t} on={on} />)}
          </div>
        </>}
      </FormSheet>
    </div>
  );
}
function ToggleLine({ title, on: start }) {
  const [on, setOn] = useState(start);
  return <label className="flex items-center gap-3 px-3.5 py-3 text-[14px]"><span className="flex-1">{title}</span><Switch on={on} onChange={setOn} label={title} /></label>;
}

/* ======================= Export ======================= */
export const STAFF_PAGES = {
  list: () => <StaffList />,
  profile: ({ params, access }) => <StaffProfile params={params} access={access} />,
  add: () => <AddStaff />,
  leave: ({ access }) => <StaffLeave access={access} />,
  documents: ({ access }) => <Documents access={access} />,
  recruitment: () => <Recruitment />,
  exit: () => <StaffExit />,
  settings: () => <HRSettings />,
};
