// Fee Management: every page except Collect Fee, which is the approved round-1 screen in fees.jsx.
// Spec: blueprint/modules/06-fee-management.md, workflows 2, 3, 4 and the fee parts of 15. Example data only.
import React, { useMemo, useRef, useState } from 'react';
import * as I from './icons.js';
import { STUDENTS, CLASSES, FEATURED, FEE_ROWS, RECENT_PAYMENTS, FEE_TREND, inr, inrShort } from './data.js';
import { cx, Card, CardHead, Button, Pill, Avatar, Input, Field, Segmented, Tabs, Ring, Empty, Sheet, Switch, useToast, feeTone } from './ui.jsx';
import { useNav, useRole } from './shell.jsx';
import {
  ModuleHead, useCanEdit, Stats, Band, SearchBox, Toolbar, Select, Textarea, DataList, BulkBar, SettingRow, SettingsCard,
  Banner, Suggestion, Progress, HBars, Bars, Legend, Timeline, MoreMenu, FormSheet, ConfirmSheet, Split, Col, ExportButton, TONE_SOFT,
  DatePeriod, PERIODS, fmtRange, fmtDay, periodDays, MONTH_NAMES,
} from './kit.jsx';
import { pagesFor, inMenu } from './config.js';

/* =========================================================================================
   Sample data (Sunrise Public School, 2026–27). Today is Fri 9 Oct 2026, 10:42 AM.
   ========================================================================================= */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dkey = ([m, d]) => m * 40 + d;
const dshort = ([m, d]) => `${d} ${MON[m]}`;
const dlong = ([m, d]) => `${d} ${MON[m]} 2026`;
const TODAY_KEY = dkey([9, 9]);
const daysSince = ([m, d]) => Math.round((new Date(2026, 9, 9) - new Date(2026, m, d)) / 864e5);
export const clsOf = (s) => `${s.cls.replace('Class ', '')} ${s.sec}`;
const byId = (id) => STUDENTS.find((s) => s.id === id);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const r50 = (n) => Math.round(n / 50) * 50;
const GSTIN = '36AAACS4821K1Z5';

/* ---------- Dates and who may open what (shared with Finance) ---------- */
const MON_IDX = Object.fromEntries(MON.map((m, i) => [m, i]));
const pad = (n) => String(n).padStart(2, '0');
// '9 Oct', '9 Oct 2026', 'Thu 1 Oct 2026' or [month, day] -> '2026-10-09'
export function isoOf(d, year = 2026) {
  if (Array.isArray(d)) return `${year}-${pad(d[0] + 1)}-${pad(d[1])}`;
  const m = /(\d{1,2}) ([A-Z][a-z]{2})(?:[a-z]*)?(?: (\d{4}))?/.exec(d || '');
  if (!m) return '';
  return `${m[3] || year}-${pad(MON_IDX[m[2]] + 1)}-${pad(m[1])}`;
}
export const inPeriod = (iso, v) => !!iso && iso >= v.from && iso <= v.to;
// Everything since records began: the default for lists that are not about a time window
export const ALL_DATES = { key: 'all', label: 'All dates', from: '2024-06-01', to: '2026-10-09' };
// Share of a month (0 to 1) that a period covers, counting days up to today. y, m: m is 0-based.
export function monthShare(v, y, m) {
  const first = `${y}-${pad(m + 1)}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const last = y === 2026 && m === 9 ? '2026-10-09' : `${y}-${pad(m + 1)}-${pad(lastDay)}`;
  const a = v.from > first ? v.from : first, b = v.to < last ? v.to : last;
  if (a > b) return 0;
  const days = (x) => Number(x.slice(8, 10));
  const span = days(last) - days(first) + 1;
  return (days(b) - days(a) + 1) / span;
}
// Months of 2026–27 so far: [label, year, monthIndex]
export const FY_MONTHS = [['Apr', 2026, 3], ['May', 2026, 4], ['Jun', 2026, 5], ['Jul', 2026, 6], ['Aug', 2026, 7], ['Sep', 2026, 8], ['Oct', 2026, 9]];
// Share of this financial year (so far) that a period covers, weighted by each month's fee collection
export function fyShare(v, weights = FEE_TREND.map((x) => x.c)) {
  const tot = weights.reduce((a, b) => a + b, 0);
  return FY_MONTHS.reduce((a, [, y, m], i) => a + monthShare(v, y, m) * weights[i], 0) / tot;
}
// Can this person open that page? Used before every link to another page or module.
export function canOpen(role, mod, page) {
  if (!inMenu(role, mod)) return false;
  if (!page) return true;
  return pagesFor(mod, role.access[mod], role.id).some((p) => p.id === page);
}
// Salary amounts are shown only to people with full Salary access (Accountant, Principal, School Admin)
export const seesPay = (role) => role.access.salary === 'full';
const scaleBy = (f) => (n) => Math.round(n * f);
const ACCOUNTS = { 'School account': 'SBI Kukatpally · XXXX XXXX 2209', 'Trust account': 'HDFC KPHB · XXXX XXXX 7730' };

// Tuition per year by class (Class 7: ₹78,000 = 4 × ₹19,500; Aarav pays ₹18,500 after the sibling discount)
export const TUITION = { NUR: 36000, LKG: 38000, UKG: 38000, 1: 39200, 2: 39200, 3: 50000, 4: 50000, 5: 50000, 6: 78000, 7: 78000, 8: 82000, 9: 92000, 10: 92000 };
const STRENGTH = { NUR: 62, LKG: 84, UKG: 88, 1: 96, 2: 98, 3: 94, 4: 96, 5: 92, 6: 98, 7: 102, 8: 96, 9: 118, 10: 112 };
const senior = (id) => ['6', '7', '8', '9', '10'].includes(id);

export const MODE_ICON = { Cash: I.Banknote, UPI: I.Smartphone, Card: I.CreditCard, Cheque: I.FileSignature, 'Bank transfer': I.Landmark, Online: I.Globe, 'Net banking': I.Building2 };
const MODE_LABEL = { Online: 'Online (Razorpay)' };

/* ---------- Today's payments: 38 payments, ₹1,42,500, 21 by UPI (2 wait for verification), plus 1 cancelled and 1 failed ---------- */
const RP = Object.fromEntries(RECENT_PAYMENTS.map((p) => [p.rcpt, p]));
const fromRP = (no, x) => ({ t: RP[no].t, name: RP[no].name, cls: RP[no].cls, amt: RP[no].amt, mode: RP[no].mode, rcpt: no, ...x });
const fromS = (id) => { const s = byId(id) || FEATURED; return { sid: id, name: s.name, cls: clsOf(s), parent: s.father, phone: s.phone }; };
const refFor = (mode, i) => mode === 'UPI' ? `UTR 42838${String(6120347 + i * 7919).slice(-7)}` : mode === 'Online' ? `pay_PB${(9137 * (i + 3)).toString(36).toUpperCase()}kQ${i}Zt` : mode === 'Card' ? `Card ending ${4100 + ((i * 37) % 900)} · approval 0${19274 + i * 11}` : '';
const EARLY = [
  ['6:52 AM', 'S1088', 'Exam fee · Half-yearly', 1200, 0, 'Online'], ['7:15 AM', 'S1013', 'Transport fee · Oct (Route 1)', 2200, 0, 'Online'],
  ['7:40 AM', 'S1022', 'Transport fee · Oct (Route 5)', 1800, 0, 'Online'], ['7:46 AM', 'S1058', 'Exam fee · Half-yearly', 1200, 0, 'UPI'],
  ['7:48 AM', 'S1012', 'Transport fee · Oct (Route 3)', 2200, 0, 'Cash'], ['7:50 AM', 'S1064', 'Exam fee · Half-yearly', 1200, 0, 'UPI'],
  ['7:52 AM', 'S1005', 'Transport fee · Oct (Route 1)', 2200, 0, 'UPI'], ['7:55 AM', 'S1081', 'Exam fee · Half-yearly', 1200, 0, 'Cash'],
  ['7:57 AM', 'S1067', 'Exam fee · Half-yearly', 1200, 0, 'UPI'], ['7:59 AM', 'S1020', 'Transport fee · Oct (Route 2)', 2200, 0, 'UPI'],
  ['8:02 AM', 'S1094', 'Tuition fee · Q3 (part)', 5000, 0, 'UPI'], ['8:04 AM', 'S1068', 'Exam fee · Half-yearly', 1200, 0, 'UPI'],
  ['8:06 AM', 'S1087', 'Exam fee · Half-yearly', 1200, 0, 'Cash'], ['8:08 AM', 'S1026', 'Transport fee · Oct (Route 6)', 2200, 0, 'UPI'],
  ['8:11 AM', 'S1076', 'Exam fee · Half-yearly', 1200, 0, 'UPI'], ['8:13 AM', 'S1038', 'Transport fee · Oct (Route 4)', 2200, 0, 'Cash'],
  ['8:15 AM', 'S1080', 'Exam fee · Half-yearly', 1200, 0, 'UPI'], ['8:17 AM', 'S1043', 'Transport fee · Oct (Route 2)', 2200, 0, 'UPI'],
  ['8:19 AM', 'S1056', 'Tuition fee · Q2 (part)', 4250, 250, 'Cash'], ['8:21 AM', 'S1083', 'Exam fee · Half-yearly', 1200, 0, 'UPI'],
  ['8:23 AM', 'S1045', 'Tuition fee · Q3 (part)', 4000, 0, 'UPI'], ['8:25 AM', 'S1077', 'Exam fee · Half-yearly', 1200, 0, 'Cash'],
  ['8:27 AM', 'S1054', 'Transport fee · Oct (Route 6)', 2200, 0, 'UPI'], ['8:29 AM', 'S1093', 'Exam fee · Half-yearly', 1200, 0, 'UPI'],
  ['8:31 AM', 'S1053', 'Transport fee · Oct (Route 3)', 2400, 0, 'Card'], ['8:33 AM', 'S1110', 'Transport fee · Oct (Route 4)', 2200, 0, 'UPI'],
  ['8:35 AM', 'S1096', 'Exam fee · Half-yearly', 1200, 0, 'UPI'],
];
export const FEE_PAYMENTS_TODAY = (() => {
  const top = [
    fromRP('R/26/05190', { head: 'Tuition fee · Q3 Oct–Dec', ref: 'UTR 428391027714', parent: 'Mahesh Reddy', phone: '98481 77302' }),
    fromRP('R/26/05189', { head: 'Hostel fee · Oct–Dec', ref: '', parent: 'Srinivas Naidu', phone: '98853 40917' }),
    fromRP('R/26/05188', { head: 'Transport fee · Oct–Dec (Route 2)', ref: 'pay_PB8kX2LmQ4r9Zt', parent: 'Kiran Menon', phone: '99496 21580', by: 'Razorpay' }),
    fromRP('R/26/05187', { head: 'Tuition fee · Q3 (part)', ref: 'Cheque 004512 · HDFC Bank, KPHB', status: 'Waiting', kind: 'Partial', parent: 'Anil Gupta', phone: '98490 55126' }),
    fromRP('R/26/05186', { head: 'Tuition fee · Q3 Oct–Dec', ref: 'UTR 428390551203', parent: 'Ravi Iyer', phone: '94402 87713' }),
    { t: '9:26 AM', ...fromS('S1121'), head: 'Exam fee · Half-yearly', amt: 1200, mode: 'UPI', ref: 'UTR 428388104476', rcpt: 'R/26/05185' },
    { t: '9:24 AM', name: 'Pranav Rao', cls: '10 B', parent: 'Naresh Rao', phone: '90300 41178', head: 'Tuition fee · Q3 (part)', amt: 7500, mode: 'Bank transfer', ref: 'UTR SBIN226281940517', rcpt: 'R/26/05184', status: 'Waiting', kind: 'Partial' },
    { t: '9:18 AM', ...fromS('S1129'), head: 'Transport fee · Oct (Route 4)', amt: 2200, mode: 'Cash', rcpt: 'R/26/05183' },
    { t: '9:11 AM', ...fromS('S1070'), head: 'Uniform · winter set', amt: 2600, mode: 'UPI', ref: 'UTR 428387120059', rcpt: 'R/26/05182', tax: 'TI/26/00511', rate: 5, other: true },
    { t: '9:05 AM', ...fromS('S1031'), head: 'Tuition fee · Q3 (part)', amt: 5200, mode: 'Cash', rcpt: 'R/26/05181', kind: 'Partial', note: 'Collected again after R/26/05180 was cancelled' },
    { t: '8:56 AM', ...fromS('S1031'), head: 'Tuition fee · Q3 (part)', amt: 6200, mode: 'Cash', rcpt: 'R/26/05180', status: 'Cancelled', kind: 'Partial', cancel: { reason: 'Wrong amount', note: 'Typed ₹6,200; the parent paid ₹5,200. Collected again as R/26/05181.', by: 'Suresh Babu', when: '9:04 AM' } },
    { t: '8:41 AM', ...fromS('S1048'), head: 'Tuition fee · Q2 Jul–Sep', amt: 12500, mode: 'Online', ref: 'pay_PB7zQ1VtK0aR3e', rcpt: null, status: 'Failed', fail: 'Declined by the bank', by: 'Razorpay' },
    { t: '8:38 AM', ...fromS('S1049'), head: 'Tuition fee · Q2 (part)', amt: 4250, pen: 250, mode: 'Card', ref: 'Card ending 4417 · approval 019274', rcpt: 'R/26/05179', kind: 'Partial' },
  ];
  const early = EARLY.map(([t, sid, head, amt, pen, mode], i) => ({ t, ...fromS(sid), head, amt, pen, mode, ref: refFor(mode, i), rcpt: `R/26/0${5152 + i}`, kind: head.includes('(part)') ? 'Partial' : 'Full', by: mode === 'Online' ? 'Razorpay' : undefined })).reverse();
  return [...top, ...early].map((p, i) => ({
    id: 'p' + i, date: 'Today', iso: '2026-10-09', pen: 0, status: 'Posted', kind: 'Full', by: 'Suresh Babu', ...p,
    acct: p.head.startsWith('Transport') ? 'Trust account' : 'School account',
  }));
})();
const FAILED_EARLIER = [
  { id: 'fx1', date: 'Yesterday', iso: '2026-10-08', t: '7:12 PM', ...fromS('S1002'), head: 'Tuition fee · Q2 Jul–Sep', amt: 9000, mode: 'Online', ref: 'pay_PAz81LmXq0Tn2c', status: 'Failed', fail: 'Not confirmed by Razorpay within 30 minutes', kind: 'Full', by: 'Razorpay', acct: 'School account' },
  { id: 'fx2', date: 'Yesterday', iso: '2026-10-08', t: '6:05 PM', ...fromS('S1037'), head: 'Tuition fee · Q3 Oct–Dec', amt: 12500, mode: 'Online', ref: 'pay_PAy2c9RkVw7Hd1', status: 'Failed', fail: 'Parent closed the UPI app before paying', kind: 'Full', by: 'Razorpay', acct: 'School account' },
];
// Earlier days' payments, made up from the month's collection (Fee Dashboard chart) so every date range has rows
const PAST_KINDS = [[1200, 'Exam fee · Half-yearly'], [2200, 'Transport fee · monthly'], [4000, 'Tuition fee · (part)'], [9800, 'Tuition fee · quarter'], [12500, 'Tuition fee · quarter'], [19500, 'Tuition fee · quarter'], [5000, 'Tuition fee · (part)'], [23000, 'Tuition fee · quarter'], [2600, 'Uniform · set'], [7000, 'Hostel fee · (part)']];
const PAST_MODES = ['UPI', 'UPI', 'Online', 'Cash', 'UPI', 'Cash', 'Card', 'UPI', 'Bank transfer', 'Online', 'Cheque', 'UPI'];
const hashS = (str) => { let h = 7; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h; };
const PAST_CACHE = {};
function paymentsOn(iso) {
  if (PAST_CACHE[iso]) return PAST_CACHE[iso];
  const [y, mo, d] = iso.split('-').map(Number);
  const dt = new Date(y, mo - 1, d);
  if (iso >= '2026-10-09' || iso < '2026-04-01') return []; // School OS went live on 1 Apr 2026
  const sun = dt.getDay() === 0;
  const tr = y === 2026 && mo >= 4 ? FEE_TREND.find((x) => x.m === MON[mo - 1]) : null;
  const lakh = tr ? tr.c : [2, 3].includes(mo) ? 18 : mo === 6 || mo === 7 || mo === 1 ? 52 : 21;
  const dim = y === 2026 && mo === 10 ? 8 : new Date(y, mo, 0).getDate();
  const daily = ((y === 2026 && mo === 10 ? 2957500 : lakh * 1e5) / dim) * (sun ? 0.3 : 1.12);
  const n = Math.max(2, Math.round(daily / 7800));
  const yy = String(y - (mo < 4 ? 1 : 0)).slice(2);
  const doy = Math.round((dt - new Date(y - (mo < 4 ? 1 : 0), 3, 1)) / 864e5);
  const out = [];
  for (let i = 0; i < n; i++) {
    const h = hashS(iso + '#' + i);
    const s = STUDENTS[h % STUDENTS.length];
    const [amt, head] = PAST_KINDS[(h >> 3) % PAST_KINDS.length];
    const mode = PAST_MODES[(h >> 7) % PAST_MODES.length];
    const mins = 6 * 60 + 50 + Math.round(((i + 0.5) / n) * 680);
    const hh = Math.floor(mins / 60), mm = mins % 60;
    const t = `${((hh + 11) % 12) + 1}:${pad(mm)} ${hh >= 12 ? 'PM' : 'AM'}`;
    const cancelled = h % 97 === 0;
    out.push({
      id: `${iso}-${i}`, iso, date: `${d} ${MON[mo - 1]}${y !== 2026 ? ' ' + y : ''}`, t, sid: s.id, name: s.name, cls: clsOf(s), parent: s.father, phone: s.phone,
      head, amt, pen: 0, mode, ref: refFor(mode, h % 900), rcpt: `R/${yy}/${String(100 + doy * 40 + i).padStart(5, '0')}`, kind: head.includes('(part)') ? 'Partial' : 'Full',
      status: cancelled ? 'Cancelled' : 'Posted', by: mode === 'Online' ? 'Razorpay' : 'Suresh Babu', acct: head.startsWith('Transport') ? 'Trust account' : 'School account',
      cancel: cancelled ? { reason: 'Wrong amount', note: 'Collected again the same day.', by: 'Suresh Babu', when: 'same day' } : null,
    });
  }
  return (PAST_CACHE[iso] = out.reverse());
}
// Every payment in a date range, newest first. Today's live rows come from the page.
function paymentsIn(v) {
  const out = [];
  const end = v.to > '2026-10-08' ? '2026-10-08' : v.to;
  let d = new Date(Number(end.slice(0, 4)), Number(end.slice(5, 7)) - 1, Number(end.slice(8, 10)));
  for (let k = 0; k < 800; k++) {
    const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (iso < v.from) break;
    out.push(...paymentsOn(iso));
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  }
  return out;
}

/* ---------- Defaulters: 61 students, ₹8,40,000 overdue, 18 more than 30 days late ---------- */
const BUCKETS = [
  { id: 'b1', label: '0–30 days', target: 512000, tone: 'warn' },
  { id: 'b2', label: '31–60 days', target: 186000, tone: 'warn' },
  { id: 'b3', label: '61–90 days', target: 99000, tone: 'bad' },
  { id: 'b4', label: 'Over 90 days', target: 43000, tone: 'bad' },
];
const B_HEADS = {
  b1: [['Transport fee · Oct', [9, 5]], ['Hostel fee · Oct–Dec', [9, 1]], ['Uniform and books (store)', [8, 10]]],
  b2: [['Transport fee · Sep', [8, 5]], ['Books & stationery kit', [7, 25]], ['Hostel fee · Jul–Sep (balance)', [7, 10]]],
  b3: [['Transport fee · Aug', [7, 5]], ['Uniform · summer set', [6, 20]]],
};
const REM_STATUS = ['Read', 'Delivered', 'Read', 'Not delivered, SMS sent'];
const REM_DATES = [[9, 6], [8, 29], [8, 15], [8, 1]];
export const DEFAULTERS = (() => {
  const over = STUDENTS.filter((s) => s.feeState === 'Overdue' && s.id !== FEATURED.id).sort((a, b) => b.due - a.due);
  const dueOnes = STUDENTS.filter((s) => s.feeState === 'Due').slice(0, 29);
  const groups = { b2: over.slice(6, 17), b3: over.slice(1, 6), b1: [...over.slice(17), ...dueOnes] };
  const out = [];
  const push = (s, bucket, amount, head, since, i) => {
    const days = daysSince(since);
    const count = days <= 8 ? (i % 3 === 0 ? 0 : 1) : days <= 30 ? 2 : days <= 60 ? 3 : 4;
    const reminders = Array.from({ length: count }, (_, k) => ({ when: dshort(REM_DATES[k]), channel: k === 3 ? 'SMS' : 'WhatsApp', template: k === count - 1 && days <= 8 ? 'Fee due tomorrow' : 'Fee overdue', status: REM_STATUS[(i + k) % 4] }));
    out.push({ id: s.id, s, bucket, amount, head, since, days, reminders, calls: [] });
  };
  ['b1', 'b2', 'b3'].forEach((b) => {
    const list = groups[b];
    const target = BUCKETS.find((x) => x.id === b).target;
    const f = target / list.reduce((a, s) => a + s.due, 0);
    let acc = 0;
    list.forEach((s, i) => {
      const [head, since] = B_HEADS[b][i % B_HEADS[b].length];
      const amount = i === list.length - 1 ? target - acc : r50(s.due * f);
      acc += amount;
      push(s, b, amount, head, since, i);
    });
  });
  // Over 90 days: Aarav (Q2 balance + late fee + transport Oct) and one family with old dues from 2025–26
  push(FEATURED, 'b4', 10950, 'Tuition fee · Q2 balance, late fee, Transport fee · Oct', [6, 10], 1);
  push(over[0], 'b4', 32050, 'Old dues from 2025–26', [2, 10], 2);
  const a = out.find((d) => d.id === FEATURED.id);
  a.reminders = [
    { when: '6 Oct', channel: 'WhatsApp', template: 'Fee overdue', status: 'Read' },
    { when: '17 Jul', channel: 'WhatsApp', template: 'Fee overdue', status: 'Read' },
    { when: '9 Jul', channel: 'WhatsApp', template: 'Fee due tomorrow', status: 'Delivered' },
  ];
  a.calls = [{ when: '7 Oct, 11:20 AM', by: 'Suresh Babu', text: 'Called Priya Sharma. Will pay the overdue amount with Q3 tuition on 10 Oct.' }];
  return out;
})();
const DEF_BY_ID = Object.fromEntries(DEFAULTERS.map((d) => [d.id, d]));
const OVERDUE_TOTAL = DEFAULTERS.reduce((a, d) => a + d.amount, 0);

/* ---------- Fee structure ---------- */
const FEE_HEADS = [
  { name: 'Tuition fee', freq: 'Quarterly', used: 'All 13 classes', acct: 'School account' },
  { name: 'Admission fee', freq: 'One-time', used: 'New students only · ₹15,000', acct: 'School account' },
  { name: 'Exam fee', freq: 'Per exam', used: 'Classes 6–10 · ₹1,200 half-yearly', acct: 'School account' },
  { name: 'Transport fee', freq: 'Monthly', used: 'By stop, set in Transport', acct: 'Trust account', note: 'Exempt: school transport for students' },
  { name: 'Hostel fee', freq: 'Quarterly', used: 'Boarders, set in Hostel', acct: 'School account' },
  { name: 'Uniform', freq: 'When issued', used: 'Charged by the store', acct: 'School account', rate: 5, code: 'HSN 6203' },
  { name: 'Books & stationery kit', freq: 'When issued', used: 'Charged by the store', acct: 'School account', rate: 12, code: 'HSN 4820' },
  { name: 'Library fine', freq: 'When charged', used: 'From Library', acct: 'School account' },
  { name: 'Late fee', freq: 'Fee rule', used: 'Tuition installments', acct: 'School account' },
  { name: 'Annual fee', freq: 'Yearly', used: 'Not used in 2026–27', acct: 'School account' },
  { name: 'Lab fee', freq: 'Yearly', used: 'Change waiting: Classes 9–10', acct: 'School account' },
  { name: 'Activity fee', freq: 'Term', used: 'Not used in 2026–27', acct: 'School account' },
];
function structureFor(c, year) {
  const up = year === '2027–28' ? 1.05 : 1;
  const tu = Math.round((TUITION[c.id] * up) / 400) * 400;
  const y0 = year === '2027–28' ? 2027 : 2026;
  const rows = [{ head: 'Tuition fee', amount: tu, freq: 'Quarterly', inst: [[`10 Apr ${y0}`, tu / 4], [`10 Jul ${y0}`, tu / 4], [`10 Oct ${y0}`, tu / 4], [`10 Jan ${y0 + 1}`, tu / 4]] }];
  if (senior(c.id)) rows.push({ head: 'Exam fee', amount: 1200, freq: 'Half-yearly exam', inst: [[`15 Oct ${y0}`, 1200]] });
  rows.push({ head: 'Admission fee', amount: 15000, freq: 'One-time, new students', inst: [['On admission', 15000]] });
  return rows;
}

/* ---------- Aarav Sharma's ledger: every charge, receipt, cancelled receipt, concession and late fee ---------- */
const AARAV_LEDGER = [
  { d: [3, 1], kind: 'opening', title: 'Opening balance', sub: 'Nothing carried in from 2025–26', debit: 0 },
  { d: [3, 1], kind: 'charge', title: 'Transport fee · Apr–Sep', sub: 'Route 4 Miyapur, KPHB 6th Phase stop · ₹2,200 a month · due 5 Apr', ref: 'FI/26/00412', debit: 13200, due: [3, 5] },
  { d: [3, 1], kind: 'charge', title: 'Tuition fee · Q1 Apr–Jun', sub: 'Due 10 Apr', ref: 'FI/26/00413', debit: 19500, due: [3, 10] },
  { d: [3, 1], kind: 'concession', title: 'Sibling discount · Q1', sub: 'Sister Anaya Sharma, UKG A · approved by Lakshmi Rao', credit: 1000 },
  { d: [3, 6], kind: 'receipt', title: 'Payment · Transport fee Apr–Sep', sub: 'Cash at Counter 1 · Suresh Babu', ref: 'R/26/00188', credit: 13200, mode: 'Cash' },
  { d: [3, 10], kind: 'receipt', title: 'Payment · Tuition fee Q1', sub: 'UPI · UTR 409911276530', ref: 'R/26/00412', credit: 18500, mode: 'UPI' },
  { d: [6, 1], kind: 'charge', title: 'Tuition fee · Q2 Jul–Sep', sub: 'Due 10 Jul', ref: 'FI/26/02231', debit: 19500, due: [6, 10] },
  { d: [6, 1], kind: 'concession', title: 'Sibling discount · Q2', sub: 'Sister Anaya Sharma, UKG A · approved by Lakshmi Rao', credit: 1000 },
  { d: [6, 12], kind: 'receipt', title: 'Part payment · Tuition fee Q2', sub: 'UPI · UTR 419320876114', ref: 'R/26/04412', credit: 10000, mode: 'UPI', partial: { of: 18500, left: 8500 } },
  { d: [6, 20], kind: 'receipt', title: 'Payment · Tuition fee Q2 balance', sub: 'Cheque 004218 · HDFC Bank, KPHB', ref: 'R/26/04630', credit: 8500, mode: 'Cheque', cancelled: { when: '24 Jul 2026', by: 'Suresh Babu', reason: 'Cheque bounced', note: 'Returned by HDFC Bank: not enough balance. Priya Sharma was told the same day.' } },
  { d: [6, 24], kind: 'reversal', title: 'Receipt R/26/04630 cancelled', sub: 'Cheque bounced · dues reopened · Day Book reversal on 24 Jul', debit: 8500 },
  { d: [6, 26], kind: 'late', title: 'Late fee · Tuition fee Q2', sub: 'Added 15 days after the due date (Fee Settings rule)', debit: 250 },
  { d: [9, 1], kind: 'charge', title: 'Tuition fee · Q3 Oct–Dec', sub: 'Due 10 Oct', ref: 'FI/26/04876', debit: 19500, due: [9, 10] },
  { d: [9, 1], kind: 'concession', title: 'Sibling discount · Q3', sub: 'Sister Anaya Sharma, UKG A · approved by Lakshmi Rao', credit: 1000 },
  { d: [9, 1], kind: 'charge', title: 'Transport fee · Oct', sub: 'Route 4 Miyapur · due 5 Oct', ref: 'FI/26/04877', debit: 2200, due: [9, 5] },
  { d: [9, 1], kind: 'charge', title: 'Exam fee · Half-yearly', sub: 'Due 15 Oct', ref: 'FI/26/04878', debit: 1200, due: [9, 15] },
];

// Any other student: a ledger whose balance matches the student's dues
function ledgerFor(s) {
  if (s.id === FEATURED.id) return AARAV_LEDGER;
  const q = TUITION[s.clsId] / 4;
  const n = Number(s.id.slice(1)) || 7;
  const d = DEF_BY_ID[s.id];
  const B = s.feeState === 'Paid' ? 0 : s.due;
  const o = d ? Math.min(d.amount, B) : 0;
  const m1 = n % 3 === 0 ? 'Cash' : 'UPI', m2 = n % 2 ? 'UPI' : 'Online';
  const E = [];
  if (d && d.head.startsWith('Old dues')) E.push({ d: [3, 1], kind: 'opening', title: 'Opening balance · old dues', sub: 'Brought in from the old software on 1 Apr 2026', debit: o, due: [2, 10] });
  else E.push({ d: [3, 1], kind: 'opening', title: 'Opening balance', sub: 'Nothing carried in from 2025–26', debit: 0 });
  E.push({ d: [3, 1], kind: 'charge', title: 'Tuition fee · Q1 Apr–Jun', sub: 'Due 10 Apr', ref: `FI/26/00${300 + (n % 600)}`, debit: q, due: [3, 10] });
  E.push({ d: [3, 4 + (n % 6)], kind: 'receipt', title: 'Payment · Tuition fee Q1', sub: m1 === 'Cash' ? 'Cash at Counter 1' : 'UPI', ref: `R/26/00${100 + (n % 800)}`, credit: q, mode: m1 });
  E.push({ d: [6, 1], kind: 'charge', title: 'Tuition fee · Q2 Jul–Sep', sub: 'Due 10 Jul', ref: `FI/26/02${100 + (n % 800)}`, debit: q, due: [6, 10] });
  E.push({ d: [6, 3 + (n % 7)], kind: 'receipt', title: 'Payment · Tuition fee Q2', sub: m2 === 'Online' ? 'Online · Razorpay' : 'UPI', ref: `R/26/04${100 + (n % 800)}`, credit: q, mode: m2 });
  if (d && !d.head.startsWith('Old dues')) E.push({ d: [d.since[0], Math.max(1, d.since[1] - 4)], kind: 'charge', title: d.head, sub: `Due ${dshort(d.since)}`, debit: o, due: d.since });
  E.push({ d: [9, 1], kind: 'charge', title: 'Tuition fee · Q3 Oct–Dec', sub: 'Due 10 Oct', ref: `FI/26/04${100 + (n % 800)}`, debit: q, due: [9, 10] });
  const r = B - o;
  if (s.feeState === 'Paid') E.push({ d: [9, 2 + (n % 6)], kind: 'receipt', title: 'Payment · Tuition fee Q3', sub: 'UPI', ref: `R/26/05${String(n % 150).padStart(3, '0')}`, credit: q, mode: 'UPI' });
  else if (r < q) E.push({ d: [9, 5], kind: 'receipt', title: 'Part payment · Tuition fee Q3', sub: 'UPI', ref: `R/26/0510${n % 10}`, credit: q - r, mode: 'UPI', partial: { of: q, left: r } });
  else if (r > q) E.push({ d: [9, 1], kind: 'charge', title: 'Transport fee · Oct–Mar', sub: 'Due 10 Oct', debit: r - q, due: [9, 10] });
  return E.filter((e) => e.kind === 'opening' || e.debit || e.credit).sort((a, b) => dkey(a.d) - dkey(b.d));
}
function withBalance(L) {
  let b = 0;
  return L.map((e) => { b += (e.debit || 0) - (e.credit || 0); return { ...e, bal: b }; });
}
// Installments with what is paid on each (oldest first), for any student
function installmentsFor(s, L) {
  if (s.id === FEATURED.id) return FEE_ROWS.map((r) => ({ head: r.head, inst: r.inst, due: r.due, amount: r.amount, paid: r.paid, late: r.late, status: r.status }));
  const ch = L.filter((e) => (e.kind === 'charge' || (e.kind === 'opening' && e.debit))).map((e) => ({ head: e.title.split(' · ')[0], inst: e.title.split(' · ')[1] || 'From 2025–26', due: dshort(e.due || e.d), dueKey: dkey(e.due || e.d), amount: e.debit, paid: 0, late: 0 }));
  let pool = L.filter((e) => e.kind === 'receipt' && !e.cancelled).reduce((a, e) => a + e.credit, 0);
  ch.sort((a, b) => a.dueKey - b.dueKey).forEach((c) => { const p = Math.min(pool, c.amount); c.paid = p; pool -= p; c.status = p >= c.amount ? 'Paid' : c.dueKey < TODAY_KEY ? 'Overdue' : 'Due'; });
  const next = s.clsId ? [{ head: 'Tuition fee', inst: 'Q4 · Jan–Mar', due: '10 Jan', amount: TUITION[s.clsId] / 4, paid: 0, late: 0, status: 'Not due' }] : [];
  return [...ch, ...next];
}

/* ---------- Concessions & refunds ---------- */
const CONCESSIONS = [
  { id: 'c1', name: 'Kavya Rao', cls: '5 A', type: 'Discount', amt: '₹4,000', value: 4000, heads: 'Tuition fee · Q3', reason: 'Father lost his job in August; one-time help for this quarter', by: 'Suresh Babu', appr: null, status: 'Waiting', date: '8 Oct' },
  { id: 'c2', ...fromS('S1054'), type: 'Discount', amt: '₹2,500', value: 2500, heads: 'Transport fee · Oct–Dec', reason: 'Family moved; the bus no longer reaches the new address', by: 'Suresh Babu', appr: null, status: 'Waiting', date: '7 Oct' },
  { id: 'c3', sid: FEATURED.id, name: FEATURED.name, cls: clsOf(FEATURED), type: 'Sibling', amt: '₹4,000 a year', value: 4000, heads: 'Tuition fee', reason: 'Sister Anaya Sharma studies in UKG A', by: 'Suresh Babu', appr: 'Lakshmi Rao', status: 'Applied', date: '2 Apr' },
  { id: 'c4', name: 'Harshini Rani', cls: '4 B', type: 'Staff child', amt: '50%', value: 25000, heads: 'Tuition fee', reason: 'Mother Usha Rani teaches Class 2 (staff code SPS-T-005)', by: 'Anita Sharma', appr: 'Lakshmi Rao', status: 'Applied', date: '1 Apr' },
  { id: 'c5', ...fromS('S1093'), type: 'Scholarship', amt: '25%', value: 23000, heads: 'Tuition fee', reason: 'Merit scholarship: 96.4% in the Class 9 annual exam', by: 'Suresh Babu', appr: 'Lakshmi Rao', status: 'Applied', date: '12 Apr' },
  { id: 'c6', ...fromS('S1058'), type: 'Late fee waiver', amt: '₹250', value: 250, heads: 'Late fee · Q2', reason: 'In hospital in July; discharge papers seen', by: 'Suresh Babu', appr: 'Within the accountant’s limit', status: 'Applied', date: '30 Jul' },
  { id: 'c7', ...fromS('S1026'), type: 'RTE', amt: '100%', value: 39200, heads: 'Tuition fee', reason: 'RTE seat, Section 12(1)(c) · Govt. order 2026/112', by: 'Anita Sharma', appr: 'Lakshmi Rao', status: 'Applied', date: '1 Jun' },
  { id: 'c8', ...fromS('S1081'), type: 'Discount', amt: '₹6,000', value: 6000, heads: 'Tuition fee · Q2', reason: 'Asked for a discount for a second child’s admission', by: 'Suresh Babu', appr: 'Lakshmi Rao', status: 'Rejected', date: '14 Jul', note: 'The sibling discount already applies.' },
  { id: 'c9', ...fromS('S1110'), type: 'Discount', amt: '₹800', value: 800, heads: 'Transport fee · Sep', reason: 'Bus did not run for 9 days (Route 4 repair)', by: 'Suresh Babu', appr: 'Within the accountant’s limit', status: 'Applied', date: '1 Oct' },
  { id: 'c10', ...fromS('S1088'), type: 'Scholarship', amt: '15%', value: 13800, heads: 'Tuition fee', reason: 'Sports scholarship: state-level kabaddi', by: 'Suresh Babu', appr: 'Lakshmi Rao', status: 'Approved', date: '6 Oct', note: 'Applies from Q3' },
];
const REFUNDS = [
  { id: 'r1', ...fromS('S1080'), rcpt: 'R/26/04981', paid: 23000, amt: 23000, reason: 'Paid twice: by the Razorpay link and again at the counter on 2 Oct', mode: 'Online, back to the same UPI', by: 'Suresh Babu', status: 'Approved', appr: 'Lakshmi Rao', date: '5 Oct' },
  { id: 'r2', ...fromS('S1027'), rcpt: 'R/26/04120', paid: 4400, amt: 2200, reason: 'Stopped using the bus from 1 Oct; Transport Oct was paid in advance', mode: 'Cash', by: 'Suresh Babu', status: 'Waiting', appr: null, date: '8 Oct' },
  { id: 'r3', name: 'Ritika Sharma', cls: '9 A', rcpt: 'R/26/03122', paid: 23000, amt: 17400, reason: 'Left the school on 30 Jun (family moved to Pune); Q2 paid in advance, 1 week used', mode: 'Bank transfer', by: 'Suresh Babu', status: 'Refunded', appr: 'Lakshmi Rao', date: '14 Jul', ref: 'UTR SBIN226195530012' },
  { id: 'r4', name: 'Yashwanth Rao', cls: '2 A', rcpt: 'R/26/02016', paid: 9800, amt: 9800, reason: 'Wants Q1 tuition back after 2 months of study', mode: 'Cash', by: 'Suresh Babu', status: 'Rejected', appr: 'Lakshmi Rao', date: '12 Jun', note: 'Fee policy: no refund after classes begin.' },
  { id: 'r5', name: 'Mohammed Faiz', cls: '6 B', rcpt: 'R/26/01377', paid: 2200, amt: 2200, reason: 'Transport fee paid for a sibling who had left', mode: 'Cash', by: 'Suresh Babu', status: 'Refunded', appr: 'Lakshmi Rao', date: '2 May', ref: 'Cash voucher CV/26/0031' },
];
const BULK_RULES = [
  { id: 'b1', title: 'Pay the full year by 30 Apr: 5% off tuition', sub: 'Applied by itself at Collect Fee and shown on the receipt', on: true, used: '146 students · ₹4,91,300 given' },
  { id: 'b2', title: 'Sibling discount: ₹4,000 a year off tuition', sub: 'For each child when 2 or more children study here', on: true, used: '88 families, 176 students · ₹7,04,000' },
  { id: 'b3', title: 'Staff child: 50% off tuition', sub: 'For children of permanent staff', on: true, used: '14 students · ₹4,62,000' },
  { id: 'b4', title: 'Pay 2 quarters together: 2% off tuition', sub: 'Tried in 2025–26; switched off this year', on: false, used: 'Not used in 2026–27' },
];
const SCHOLAR_TYPES = [
  { name: 'Merit scholarship', rule: '25% of tuition · 90% or more in the annual exam', n: 12, total: 246000 },
  { name: 'Sports scholarship', rule: '15% of tuition · state level or above', n: 3, total: 41400 },
  { name: 'Need-based scholarship', rule: 'Up to 50% of tuition · decided by the fee committee', n: 6, total: 118000 },
];
const SCHOLAR_APPS = [
  { name: 'Sneha Patel', cls: '4 A', type: 'Need-based scholarship', docs: 'Income certificate, ration card', status: 'Waiting', asked: '40% of tuition' },
  { name: 'Rahul Goud', cls: '9 B', type: 'Sports scholarship', docs: 'District chess certificate', status: 'Waiting', asked: '15% of tuition' },
  { name: 'Diya Pillai', cls: '10 A', type: 'Merit scholarship', docs: 'Class 9 marks card', status: 'Approved', asked: '25% of tuition' },
];

/* ---------- Admission Counsellor: application and admission fees only ---------- */
const APPLICANTS = [
  { app: 'APP-0112', name: 'Ved Reddy', cls: 'Nursery', yr: '2027–28', parent: 'Harish Reddy', appFee: 'Paid', appOn: '2 Oct', adm: 'Not offered yet', held: 'Test on 17 Oct' },
  { app: 'APP-0111', name: 'Aadya Varma', cls: 'LKG', yr: '2027–28', parent: 'Swathi Varma', appFee: 'Not paid', appOn: 'Link sent 8 Oct', adm: 'Not offered yet', held: '' },
  { app: 'APP-0109', name: 'Rudra Naidu', cls: 'Class 1', yr: '2027–28', parent: 'Praveen Naidu', appFee: 'Paid', appOn: '28 Sep', adm: 'Waiting', held: 'Seat held till 20 Oct' },
  { app: 'APP-0107', name: 'Siri Chowdary', cls: 'Class 6', yr: '2026–27', parent: 'Madhavi Chowdary', appFee: 'Paid', appOn: '21 Sep', adm: 'Paid', held: 'R/26/05011 · 3 Oct' },
  { app: 'APP-0105', name: 'Atharv Kumar', cls: 'Class 3', yr: '2026–27', parent: 'Sanjay Kumar', appFee: 'Paid', appOn: '18 Sep', adm: 'Paid', held: 'R/26/04902 · 28 Sep' },
  { app: 'APP-0104', name: 'Ishita Goud', cls: 'UKG', yr: '2027–28', parent: 'Ramesh Goud', appFee: 'Paid', appOn: '16 Sep', adm: 'Waiting', held: 'Seat held till 16 Oct' },
  { app: 'APP-0103', name: 'Vihan Patel', cls: 'Class 8', yr: '2026–27', parent: 'Nirav Patel', appFee: 'Paid', appOn: '12 Sep', adm: 'Paid', held: 'R/26/04711 · 19 Sep' },
  { app: 'APP-0101', name: 'Samhita Rao', cls: 'Nursery', yr: '2027–28', parent: 'Kiran Rao', appFee: 'Paid', appOn: '9 Sep', adm: 'Waiting', held: 'Seat held till 14 Oct' },
  { app: 'APP-0099', name: 'Dhanvi Reddy', cls: 'Class 2', yr: '2026–27', parent: 'Sravan Reddy', appFee: 'Paid', appOn: '2 Sep', adm: 'Paid', held: 'R/26/04455 · 8 Sep' },
  { app: 'APP-0098', name: 'Arnav Joshi', cls: 'LKG', yr: '2027–28', parent: 'Deepa Joshi', appFee: 'Not paid', appOn: 'Link sent 5 Oct', adm: 'Not offered yet', held: '' },
];

/* =========================================================================================
   Shared pieces
   ========================================================================================= */
const PAY_TONE = { Posted: 'ok', Waiting: 'warn', Cancelled: 'bad', Failed: 'bad', 'Brought in': 'neutral' };
export function PayPill({ status, short }) {
  const label = status === 'Waiting' ? (short ? 'To verify' : 'Waiting for verification') : status;
  return <Pill tone={PAY_TONE[status] || 'neutral'} className={short ? '!h-5 !text-[11px]' : ''}>{label}</Pill>;
}
const ModeIcon = ({ mode, size = 15 }) => { const Ic = MODE_ICON[mode] || I.Wallet; return <Ic size={size} className="text-ink3 shrink-0" />; };
const Stamp = ({ children = 'CANCELLED' }) => (
  <span className="pointer-events-none absolute right-4 top-14 -rotate-12 border-2 border-bad text-bad rounded-lg px-3 py-0.5 font-display font-bold tracking-[.2em] text-[17px] bg-surface/80">{children}</span>
);
const Mini = ({ k, v }) => (
  <div className="min-w-0">
    <p className="text-[12px] text-ink3 font-semibold">{k}</p>
    <p className="text-[14px] mt-0.5 break-words">{v}</p>
  </div>
);
const LinkBtn = ({ onClick, children }) => <button onClick={onClick} className="text-[13px] font-semibold text-brand hover:underline">{children}</button>;

// A plain table for report previews (scrolls sideways inside its card on phones)
export function SimpleTable({ cols, rows, foot, minWidth = 560, rowKey = (r, i) => i }) {
  return (
    <div className="overflow-x-auto scroll-thin">
      <table className="w-full text-[13.5px]" style={{ minWidth }}>
        <thead>
          <tr className="text-[12px] text-ink3 border-y border-line text-left">
            {cols.map((c, i) => <th key={c.label} className={cx('py-2.5 font-semibold whitespace-nowrap', i === 0 ? 'pl-5 pr-3 sticky left-0 bg-surface' : 'px-3', i === cols.length - 1 && 'pr-5', c.right && 'text-right')}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={rowKey(r, ri)} className="border-b border-line/70 last:border-0">
              {cols.map((c, i) => <td key={c.label} className={cx('py-2.5 align-middle', i === 0 ? 'pl-5 pr-3 sticky left-0 bg-surface font-medium' : 'px-3', i === cols.length - 1 && 'pr-5', c.right && 'text-right tnum', c.nowrap !== false && 'whitespace-nowrap')}>{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
        {foot && (
          <tfoot>
            <tr className="border-t-2 border-line font-semibold">
              {cols.map((c, i) => <td key={c.label} className={cx('py-2.5', i === 0 ? 'pl-5 pr-3 sticky left-0 bg-surface' : 'px-3', i === cols.length - 1 && 'pr-5', c.right && 'text-right tnum', 'whitespace-nowrap')}>{foot[i]}</td>)}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// Reports page frame: the chosen report on the left, the list of reports on the right (below on phones)
export function ReportsFrame({ reports, active, onPick, children }) {
  const ref = useRef(null);
  const groups = [...new Set(reports.map((r) => r.group))];
  return (
    <Split side={340}>
      <div ref={ref} className="min-w-0 scroll-mt-4 flex flex-col gap-5 @lg:gap-6">{children}</div>
      <Card>
        <CardHead title="All reports" sub="Each has filters, export and print" icon={I.ChartColumn} />
        <div className="pb-2">
          {groups.map((g) => (
            <div key={g}>
              <p className="eyebrow text-ink3 px-5 pt-2 pb-1">{g}</p>
              <ul className="px-2">
                {reports.filter((r) => r.group === g).map((r) => (
                  <li key={r.id}>
                    <button onClick={() => { onPick(r.id); setTimeout(() => ref.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }), 30); }}
                      className={cx('w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition', active === r.id ? 'bg-brand/8 text-brand' : 'hover:bg-sunken/70')}>
                      <span className={cx('w-9 h-9 rounded-lg grid place-items-center shrink-0', active === r.id ? 'bg-brand/12 text-brand' : 'bg-sunken text-ink2')}>{React.createElement(I[r.icon] || I.FileText, { size: 17 })}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-[14px] leading-tight truncate">{r.name}</span>
                        <span className="block text-[12px] text-ink3 truncate">{r.sub}</span>
                      </span>
                      {active === r.id && <I.ChevronRight size={16} />}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </Split>
  );
}
// Buttons on top of a report preview
export function ReportActions({ name }) {
  const toast = useToast();
  return (
    <div className="flex gap-1.5">
      <Button size="sm" variant="secondary" icon={I.Download} onClick={() => toast({ title: `Exported: ${name}`, body: 'Excel and PDF with the school name, filters and your name on top. Logged in the export log.' })}>Export</Button>
      <Button size="sm" variant="ghost" icon={I.Printer} className="hidden @sm:inline-flex" onClick={() => toast({ title: 'Sent to the office printer', body: name })}>Print</Button>
    </div>
  );
}

/* ---------- Payment / receipt sheet (Dashboard and Ledger) ---------- */
function PaymentSheet({ p, onClose, onCancel, onVerify, onReject }) {
  const toast = useToast();
  const { go } = useNav();
  const { role } = useRole();
  const canEdit = useCanEdit();
  const [rejecting, setRejecting] = useState(false);
  const [why, setWhy] = useState('');
  if (!p) return null;
  const tax = p.tax ? Math.round((p.amt * p.rate) / (100 + p.rate)) : 0;
  const posted = p.status === 'Posted';
  return (
    <Sheet open onClose={onClose} wide title={p.status === 'Failed' ? 'Online payment failed' : `Receipt ${p.rcpt}`} sub={`${p.name} · ${p.cls} · ${p.date || 'Today'}, ${p.t}`}>
      <div className="flex flex-col gap-4">
        <div className="relative rounded-2xl border border-line overflow-hidden">
          {p.status === 'Cancelled' && <Stamp />}
          <div className="flex justify-between items-center gap-3 px-4 py-3 bg-sunken/60 text-[13px]">
            <span className="font-mono font-semibold">{p.rcpt || 'No receipt made'}</span>
            <PayPill status={p.status} />
          </div>
          <ul className="px-4 py-2 text-[14px]">
            <li className="flex justify-between py-1.5 gap-3"><span>{p.head}</span><span className={cx('tnum font-medium', p.status === 'Cancelled' && 'line-through text-ink3')}>{inr(p.amt - (p.pen || 0))}</span></li>
            {p.pen ? <li className="flex justify-between py-1.5 gap-3"><span>Late fee</span><span className="tnum font-medium">{inr(p.pen)}</span></li> : null}
          </ul>
          {p.tax && (
            <div className="mx-4 mb-3 rounded-xl bg-info/8 px-3 py-2.5 text-[13px] text-ink2">
              <p className="font-semibold text-ink">Tax invoice <span className="font-mono text-[12.5px]">{p.tax}</span> made with this receipt</p>
              <p className="tnum">Taxable value {inr(p.amt - tax)} · CGST {p.rate / 2}% {inr(tax / 2)} · SGST {p.rate / 2}% {inr(tax / 2)} · GSTIN {GSTIN}</p>
            </div>
          )}
          <div className="flex justify-between gap-3 px-4 py-3 border-t border-line text-[14px]">
            <span className="text-ink3 min-w-0 break-words">{MODE_LABEL[p.mode] || p.mode}{p.ref ? ` · ${p.ref}` : ''}</span><b className="tnum shrink-0">{inr(p.amt)}</b>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <Mini k={p.by === 'Razorpay' ? 'Posted by' : 'Collected by'} v={p.by === 'Razorpay' ? 'Razorpay, by itself after the bank confirmed' : `${p.by} · Counter 1`} />
          <Mini k="Goes to" v={`${p.acct} · ${ACCOUNTS[p.acct]}`} />
          {p.parent && <Mini k="Parent" v={<span className="tnum">{p.parent} · {p.phone}</span>} />}
          <Mini k="Day Book" v={posted ? `Entry on ${!p.date || p.date === 'Today' ? '9 Oct' : p.date}` : p.status === 'Cancelled' ? 'Original kept, reversal added' : 'Not in the Day Book yet'} />
        </div>

        {p.status === 'Cancelled' && p.cancel && (
          <Banner tone="bad" icon={I.Ban} title={`Cancelled at ${p.cancel.when} by ${p.cancel.by}: ${p.cancel.reason}.`}>{p.cancel.note}</Banner>
        )}
        {p.status === 'Failed' && (
          <Banner tone="bad" title={p.fail}>No money was posted and no receipt was made. The parent can pay again by a new link.</Banner>
        )}
        {p.status === 'Waiting' && (
          <div className="rounded-2xl border border-warn/40 bg-warn/[.06] p-4 flex flex-col gap-3">
            <p className="text-[14px]"><b className="font-semibold">Check before posting.</b> <span className="text-ink2">{p.mode === 'Cheque' ? 'Posts once the accountant confirms the cheque is cleared or deposited.' : 'Match the UTR with the bank statement. Then it posts and the receipt becomes final.'}</span></p>
            {canEdit && !rejecting && (
              <div className="flex gap-2 flex-wrap">
                <Button variant="primary" icon={I.Check} onClick={() => onVerify(p)}>Approve and post</Button>
                <Button variant="dangerSoft" icon={I.X} onClick={() => setRejecting(true)}>Reject</Button>
              </div>
            )}
            {rejecting && (
              <div className="flex flex-col gap-2">
                <Field label="Why is it rejected?" required id="rej-why"><Input id="rej-why" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Example: UTR not found in the bank statement" /></Field>
                <div className="flex gap-2"><Button variant="danger" disabled={!why.trim()} onClick={() => onReject(p, why.trim())}>Reject payment</Button><Button variant="ghost" onClick={() => setRejecting(false)}>Back</Button></div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          {p.status !== 'Failed' && <>
            <Button variant="secondary" icon={I.Printer} onClick={() => toast({ title: 'Sent to the counter printer', body: `${p.rcpt} · office copy and parent copy` })}>Print</Button>
            <Button variant="secondary" icon={I.Download} onClick={() => toast({ title: 'Receipt saved', body: `${p.rcpt.replace(/\//g, '-')}.pdf${p.tax ? ` and ${p.tax.replace(/\//g, '-')}.pdf` : ''}` })}>PDF</Button>
            <Button variant="secondary" icon={I.MessageCircle} onClick={() => toast({ title: `Sent on WhatsApp to ${p.parent || 'the parent'}`, body: p.status === 'Cancelled' ? 'Marked cancelled, with the reason' : 'Receipt with the school’s template' })}>WhatsApp</Button>
          </>}
          {p.status === 'Failed' && canEdit && <Button variant="primary" icon={I.Send} onClick={() => { onClose(); toast({ title: `New payment link sent to ${p.parent}`, body: `${inr(p.amt)} · WhatsApp, with SMS backup. Valid 7 days.` }); }}>Send new link</Button>}
          {p.sid && canOpen(role, 'fees', 'ledger') && <Button variant="ghost" icon={I.BookOpen} onClick={() => go('fees', { page: 'ledger', id: p.sid })}>Student fee ledger</Button>}
          {posted && canEdit && onCancel && <Button variant="dangerSoft" icon={I.Ban} className="@md:ml-auto" onClick={() => onCancel(p)}>Cancel with a reason</Button>}
        </div>
        {posted && canEdit && <p className="text-[12.5px] text-ink3 -mt-1">Payments are never deleted or edited. A wrong one is cancelled with a reason and stays on record.</p>}
      </div>
    </Sheet>
  );
}

function CancelSheet({ p, onClose, onDone }) {
  const { role } = useRole();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  if (!p) return null;
  const old = p.date && p.date !== 'Today';
  const needsOk = old && role.id !== 'principal';
  return (
    <Sheet open onClose={onClose} title={`Cancel receipt ${p.rcpt}?`} sub="Payments are never deleted. This one stays on record with a cancelled stamp."
      footer={<><Button variant="ghost" onClick={onClose}>Keep payment</Button><Button variant="danger" icon={I.Ban} onClick={() => { setTried(true); if (reason) onDone(p, reason, note, needsOk); }}>{needsOk ? 'Send for approval' : `Cancel receipt ${p.rcpt}`}</Button></>}>
      <div className="flex flex-col gap-4">
        <ul className="rounded-xl bg-sunken/70 p-3.5 text-[13.5px] text-ink2 flex flex-col gap-1.5">
          <li className="flex gap-2"><I.Undo2 size={15} className="shrink-0 mt-0.5 text-ink3" />{inr(p.amt)} goes back into {p.name}’s dues.</li>
          <li className="flex gap-2"><I.Stamp size={15} className="shrink-0 mt-0.5 text-ink3" />The receipt is marked cancelled. The parent gets the cancelled copy.</li>
          <li className="flex gap-2"><I.BookOpen size={15} className="shrink-0 mt-0.5 text-ink3" />The Day Book gets a reversal today. The original line stays.</li>
        </ul>
        {needsOk && <Banner tone="warn" title="Needs the Principal’s approval.">This payment is older than today, so Lakshmi Rao decides in Approvals.</Banner>}
        <Field label="Reason" required id="cx-reason" error={tried && !reason && 'Choose why it is cancelled'}>
          <Select id="cx-reason" value={reason} onChange={setReason} error={tried && !reason} options={[{ value: '', label: 'Choose a reason' }, 'Wrong student', 'Wrong amount', 'Cheque bounced', 'Same payment entered twice', 'Other']} />
        </Field>
        <Field label="Note" id="cx-note" hint="Printed on the cancelled receipt and kept in the audit log">
          <Textarea id="cx-note" value={note} onChange={setNote} rows={2} placeholder="Example: collected again as the next receipt" />
        </Field>
      </div>
    </Sheet>
  );
}

/* =========================================================================================
   Admission Counsellor: only application and admission fee status
   ========================================================================================= */
const ADM_MONTHS = [['Jun', 5, 6, 4], ['Jul', 6, 5, 2], ['Aug', 7, 9, 1], ['Sep', 8, 21, 1], ['Oct', 9, 6, 1]];
function AdmissionFees() {
  const { go } = useNav();
  const { role } = useRole();
  const [per, setPer] = useState(PERIODS.acyear);
  const months = ADM_MONTHS.map(([m, i, a, d]) => { const sh = monthShare(per, 2026, i); return { m, a: Math.round(a * sh), d: Math.round(d * sh), sh }; }).filter((x) => x.sh > 0);
  const appPaid = months.reduce((x, r) => x + r.a, 0), admPaid = months.reduce((x, r) => x + r.d, 0);
  const apps = Math.round(appPaid * 52 / 47), offers = admPaid + Math.round(5 * Math.min(1, apps / 52));
  const list = APPLICANTS.filter((r) => inPeriod(isoOf(r.appOn), per));
  return (
    <div>
      <ModuleHead title="Fees" tabs={false} sub="You see only application and admission fees. Other fee details stay with the accounts team." />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <div className="flex flex-col @md:flex-row @md:items-center gap-2.5">
          <DatePeriod id="adm-fee-per" value={per} onChange={setPer} className="w-full @md:w-auto" />
          <p className="text-[13px] text-ink3 tnum">Applications made in {fmtRange(per)}</p>
        </div>
        <Stats items={[
          { label: 'Application fees paid', value: `${appPaid} of ${apps}`, sub: `${inr(appPaid * 500)} at ₹500 each`, icon: 'FileText' },
          { label: 'Application fee not paid', value: apps - appPaid, sub: 'Payment links sent', tone: 'warn', icon: 'Clock' },
          { label: 'Admission fees paid', value: `${admPaid} of ${offers}`, sub: `${inr(admPaid * 15000)} at ₹15,000 each`, tone: 'ok', icon: 'CircleCheck' },
          { label: 'Waiting for admission fee', value: offers - admPaid, sub: `${inr((offers - admPaid) * 15000)} · seats held`, tone: 'warn', icon: 'Hourglass' },
        ]} />
        <Split>
          <Card className="overflow-hidden">
            <CardHead title="Application and admission fees" sub={`Latest ${list.length} applications`} icon={I.UserPlus} action={canOpen(role, 'admissions', 'applications') && <Button size="sm" variant="secondary" icon={I.ArrowRight} onClick={() => go('admissions', { page: 'applications' })}>Applications</Button>} />
            <DataList rows={list} rowKey={(r) => r.app} minWidth={720} footer={`Showing the latest ${list.length} of ${apps}`}
              empty={<Empty icon={I.SearchX} title="No applications in these dates" body={`Nothing was applied for in ${fmtRange(per)}.`} action={<Button variant="secondary" onClick={() => setPer(PERIODS.acyear)}>Show this academic year</Button>} />}
              columns={[
                { key: 'app', label: 'Application', render: (r) => <span className="font-mono text-[12.5px]">{r.app}</span> },
                { key: 'name', label: 'Child', render: (r) => <><p className="font-semibold leading-tight">{r.name}</p><p className="text-[12.5px] text-ink3">{r.parent}</p></> },
                { key: 'cls', label: 'Class applied', render: (r) => <>{r.cls} <span className="text-ink3">· {r.yr}</span></>, nowrap: true },
                { key: 'appFee', label: 'Application fee', render: (r) => <><Pill tone={r.appFee === 'Paid' ? 'ok' : 'warn'}>{r.appFee}</Pill><span className="block text-[12px] text-ink3 mt-0.5">{r.appOn}</span></> },
                { key: 'adm', label: 'Admission fee', render: (r) => <><Pill tone={r.adm === 'Paid' ? 'ok' : r.adm === 'Waiting' ? 'warn' : 'neutral'}>{r.adm}</Pill>{r.held && <span className="block text-[12px] text-ink3 mt-0.5">{r.held}</span>}</> },
              ]}
              mobile={(r) => ({ title: r.name, sub: `${r.app} · ${r.cls} ${r.yr}`, avatar: r.name, pills: [<Pill key="a" tone={r.appFee === 'Paid' ? 'ok' : 'warn'} className="!h-[22px] !text-[11.5px]">Application {r.appFee.toLowerCase()}</Pill>, <Pill key="b" tone={r.adm === 'Paid' ? 'ok' : r.adm === 'Waiting' ? 'warn' : 'neutral'} className="!h-[22px] !text-[11.5px]">Admission: {r.adm.toLowerCase()}</Pill>] })} />
          </Card>
          <Card className="overflow-hidden">
            <CardHead title="By month" sub={fmtRange(per)} icon={I.CalendarDays} />
            {months.length === 0 ? <p className="px-5 pb-4 text-[13.5px] text-ink3">No fees in these dates. Admissions here start in June.</p> : <SimpleTable minWidth={300} cols={[{ label: 'Month', key: 'm' }, { label: 'Applications', key: 'a', right: true }, { label: 'Admissions', key: 'd', right: true }]}
              rows={months} rowKey={(r) => r.m}
              foot={['Paid', appPaid, admPaid]} />}
            <p className="px-5 py-3 text-[12.5px] text-ink3 border-t border-line">Application fee ₹500 · admission fee ₹15,000 · paid at the counter or by Razorpay link</p>
          </Card>
        </Split>
      </div>
    </div>
  );
}

/* =========================================================================================
   Fee Dashboard
   ========================================================================================= */
function FeeDashboard() {
  const { role } = useRole();
  if (role.id === 'admissioncounsellor') return <AdmissionFees />;
  return <FeeDashboardFull />;
}
function FeeDashboardFull() {
  const { go } = useNav();
  const { role } = useRole();
  const toast = useToast();
  const canEdit = useCanEdit();
  const can = (page) => canOpen(role, 'fees', page);
  const [pays, setPays] = useState(FEE_PAYMENTS_TODAY);
  const [tab, setTab] = useState('Full');
  const [status, setStatus] = useState('all');
  const [mode, setMode] = useState('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [cancel, setCancel] = useState(null);
  const [per, setPer] = useState(PERIODS.today);
  const [linked, setLinked] = useState({});
  const listRef = useRef(null);

  // Every payment in the chosen dates: today's live rows plus earlier days
  const past = useMemo(() => paymentsIn(per), [per.from, per.to]);
  const all = useMemo(() => [...(inPeriod('2026-10-09', per) ? pays : []), ...(inPeriod('2026-10-08', per) ? FAILED_EARLIER : []), ...past], [pays, past, per.from, per.to]);
  const isToday = per.from === '2026-10-09' && per.to === '2026-10-09';
  const valid = all.filter((p) => p.status === 'Posted' || p.status === 'Waiting');
  const collected = valid.reduce((a, p) => a + p.amt, 0);
  const upi = valid.filter((p) => p.mode === 'UPI').length;
  const waiting = pays.filter((p) => p.status === 'Waiting');
  const failed = all.filter((p) => p.status === 'Failed');
  const t = q.trim().toLowerCase();
  const rowsAll = all.filter((p) => p.kind === tab && (status === 'all' || p.status === status) && (mode === 'all' || p.mode === mode) &&
    (!t || p.name.toLowerCase().includes(t) || (p.rcpt || '').toLowerCase().includes(t) || p.cls.toLowerCase().includes(t)));
  const LIMIT = 80;
  const rows = rowsAll.slice(0, LIMIT);
  const money = (n) => (isToday || n < 1e6 ? inr(n) : inrShort(n));
  const methods = ['UPI', 'Cash', 'Cheque', 'Online', 'Bank transfer', 'Card', 'Net banking'].map((m) => { const l = valid.filter((p) => p.mode === m); return [m, l.length, l.reduce((a, p) => a + p.amt, 0)]; }).filter((m, i) => m[1] || i < 6);
  const mMax = Math.max(1, ...methods.map((m) => m[2]));
  const mTotal = methods.reduce((a, m) => a + m[2], 0);
  const range = isToday ? 'Today' : `${per.label} · ${fmtRange(per)}`;

  const update = (id, x) => setPays((ps) => ps.map((p) => (p.id === id ? { ...p, ...x } : p)));
  const verify = (p) => { update(p.id, { status: 'Posted' }); setOpen(null); toast({ title: `${p.rcpt} posted`, body: `${inr(p.amt)} from ${p.name} is in today’s Day Book. Receipt sent on WhatsApp.` }); };
  const reject = (p, why) => { update(p.id, { status: 'Cancelled', cancel: { reason: 'Rejected at verification', note: why, by: 'Suresh Babu', when: '10:44 AM' } }); setOpen(null); toast({ title: `${p.rcpt} rejected`, body: 'Dues stay open. The parent is told with your reason.', tone: 'info' }); };
  const doCancel = (p, reason, note, needsOk) => {
    setCancel(null);
    if (needsOk) { toast({ title: 'Sent to Lakshmi Rao for approval', body: `Cancel ${p.rcpt} · ${reason}`, tone: 'info' }); return; }
    update(p.id, { status: 'Cancelled', cancel: { reason, note: note || 'No note', by: 'Suresh Babu', when: '10:44 AM' } });
    toast({ title: `Receipt ${p.rcpt} cancelled`, body: `${inr(p.amt)} back in ${p.name}’s dues. Day Book reversal added for 9 Oct.`, undo: () => update(p.id, { status: 'Posted', cancel: null }) });
  };

  return (
    <div>
      <ModuleHead title="Fees" sub="Friday, 9 October · live as money comes in · updated 10:42 AM"
        actions={<><ExportButton what={`payments, ${range}`} />{canEdit && can('collect') && <Button variant="primary" icon={I.IndianRupee} onClick={() => go('fees', { page: 'collect' })}>Collect fee</Button>}</>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <div className="flex flex-col @md:flex-row @md:items-center gap-2.5">
          <DatePeriod id="fee-per" value={per} onChange={setPer} className="w-full @md:w-auto" />
          <p className="text-[13px] text-ink3 tnum">Showing payments for {range}</p>
        </div>
        <Band items={[
          { label: isToday ? 'Collected today' : `Collected · ${per.label}`, big: money(collected), foot: `${valid.length.toLocaleString('en-IN')} payments · ${upi.toLocaleString('en-IN')} by UPI`, onClick: () => listRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }) },
          { label: 'Collected this financial year', big: '₹2.33 Cr', foot: 'of ₹2.84 Cr due so far · 82%', onClick: can('reports') ? () => go('fees', { page: 'reports' }) : undefined },
          { label: 'Pending', big: '₹42.3 L', foot: 'Not late yet · Q3 tuition due 10 Oct', onClick: can('reports') ? () => go('fees', { page: 'reports' }) : undefined },
          { label: 'Overdue', big: inrShort(OVERDUE_TOTAL), foot: `${DEFAULTERS.length} students · ${DEFAULTERS.filter((d) => d.days > 30).length} over 30 days`, onClick: can('defaulters') ? () => go('fees', { page: 'defaulters' }) : undefined },
        ]} />

        {waiting.length > 0 && (
          <Banner tone="warn" title={`${waiting.length} ${waiting.length === 1 ? 'payment waits' : 'payments wait'} for verification (${inr(waiting.reduce((a, p) => a + p.amt, 0))}).`}
            action={<Button size="sm" variant="secondary" onClick={() => setOpen(waiting[0])}>{canEdit ? 'Verify' : 'See'}</Button>}>
            Cheques and bank transfers post to the Day Book only after the accountant checks them.
          </Banner>
        )}

        <div className="grid @lg:grid-cols-2 @xl:grid-cols-3 gap-5 @lg:gap-6 items-start">
            <Card>
              <CardHead title="Monthly collection" sub="Collected against due, 2026–27 (₹ lakh)" icon={I.ChartColumn} />
              <div className="px-5 pb-1 flex items-baseline gap-3 flex-wrap">
                <p className="font-display text-[28px] font-semibold tnum">₹2.33 Cr</p>
                <p className="text-[13px] text-ink3">of ₹2.84 Cr due so far · <span className="text-ok font-semibold">82%</span></p>
              </div>
              <div className="px-3 pb-2"><Bars data={FEE_TREND.map((m) => ({ k: m.m, v: m.c, v2: m.d }))} max={70} ticks={[0, 20, 40, 60]} ariaLabel="Fee collected each month against fees due" /></div>
              <div className="px-5 pb-4 flex items-center gap-4 flex-wrap"><Legend items={[['bg-brand', 'Collected'], ['bg-ink3/25', 'Due']]} /><span className="ml-auto text-[12.5px] text-ink3">October is still open</span></div>
            </Card>
            <Card>
              <CardHead title="How parents paid" sub={`${isToday ? 'Today' : per.label} · ${money(mTotal)}`} icon={I.Wallet} />
              <ul className="px-5 pb-5 flex flex-col gap-3">
                {methods.map(([m, n, amt]) => (
                  <li key={m} className="text-[13.5px]">
                    <div className="flex items-center gap-2 mb-1">
                      <ModeIcon mode={m} />
                      <span className="font-medium flex-1 min-w-0 truncate">{MODE_LABEL[m] || m}</span>
                      <span className="text-ink3 tnum text-[12.5px]">{n.toLocaleString('en-IN')}</span>
                      <span className="font-semibold tnum w-20 text-right">{money(amt)}</span>
                    </div>
                    <Progress value={mMax ? (amt / mMax) * 100 : 0} />
                  </li>
                ))}
              </ul>
            </Card>
          <div className="grid @lg:grid-cols-2 @xl:grid-cols-1 gap-5 @lg:gap-6 @lg:col-span-2 @xl:col-span-1 items-start">
              <Card>
                <CardHead title="Failed online payments" sub={`No receipt was made for these · ${isToday ? 'today' : per.label.toLowerCase()}`} icon={I.CircleX} action={<Pill tone={failed.length ? 'bad' : 'ok'}>{failed.length}</Pill>} />
                {failed.length === 0 && <p className="px-5 pb-4 -mt-1 text-[13.5px] text-ink3">No online payment failed in these dates.</p>}
                <ul className="px-2 pb-2">
                  {failed.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/70">
                      <button onClick={() => setOpen(p)} className="min-w-0 flex-1 text-left">
                        <p className="font-semibold text-[14px] truncate">{p.name} <span className="text-ink3 font-normal">· {p.cls}</span></p>
                        <p className="text-[12.5px] text-ink3 truncate">{inr(p.amt)} · {p.date === 'Today' ? p.t : `${p.date}, ${p.t}`} · {p.fail}</p>
                        <p className="text-[12.5px] text-ink3 tnum">{p.parent} · {p.phone}</p>
                      </button>
                      {canEdit && (linked[p.id] ? <Pill tone="ok">Link sent</Pill>
                        : <Button size="sm" variant="soft" icon={I.Send} onClick={() => { setLinked({ ...linked, [p.id]: true }); toast({ title: `New payment link sent to ${p.parent}`, body: `${inr(p.amt)} · WhatsApp, with SMS backup. Valid 7 days.` }); }}>New link</Button>)}
                    </li>
                  ))}
                </ul>
              </Card>
              <Suggestion title="Collection forecast"
                source="Installments due Oct–Dec (₹96 L), how families paid Q1 and Q2 this year, and Oct–Dec 2025"
                actions={can('defaulters') && <Button size="sm" variant="secondary" icon={I.UserX} onClick={() => go('fees', { page: 'defaulters' })}>See who is overdue</Button>}>
                Expect about <b className="text-ink">₹55–57 L</b> in October (₹61 L due), <b className="text-ink">₹19 L</b> in November and <b className="text-ink">₹16 L</b> in December. Most Q3 tuition comes in the week after 10 Oct; Classes 9 and 10 usually pay a week later than others.
              </Suggestion>
          </div>
        </div>

        <div ref={listRef} className="scroll-mt-4">
              <Card className="overflow-hidden">
                <CardHead title="Payments" sub={`${range} · newest first. Online payments arrive by themselves from Razorpay.`} icon={I.ReceiptIndianRupee} />
                <Tabs className="px-3" value={tab} onChange={setTab} tabs={[{ id: 'Full', label: 'Full payments', count: all.filter((p) => p.kind === 'Full').length }, { id: 'Partial', label: 'Partial payments', count: all.filter((p) => p.kind === 'Partial').length }]} />
                <Toolbar>
                  <SearchBox id="pay-q" value={q} onChange={setQ} placeholder="Student, class or receipt no." />
                  <div className="grid grid-cols-2 gap-2.5 @md:flex">
                    <Select id="pay-status" className="@md:w-48" value={status} onChange={setStatus} options={[{ value: 'all', label: 'All statuses' }, { value: 'Posted', label: 'Posted' }, { value: 'Waiting', label: 'Waiting for verification' }, { value: 'Cancelled', label: 'Cancelled' }, { value: 'Failed', label: 'Failed' }]} />
                    <Select id="pay-mode" className="@md:w-40" value={mode} onChange={setMode} options={[{ value: 'all', label: 'All modes' }, 'Cash', 'UPI', 'Card', 'Cheque', 'Bank transfer', { value: 'Online', label: 'Online (Razorpay)' }]} />
              </div>
                </Toolbar>
                <DataList rows={rows} onRow={setOpen} minWidth={760} footer={rowsAll.length > LIMIT ? `Showing the newest ${LIMIT} of ${rowsAll.length.toLocaleString('en-IN')} · search or pick fewer dates to see the rest` : `Showing ${rows.length} of ${all.length.toLocaleString('en-IN')} · ${range}`}
                  columns={[
                    { key: 't', label: isToday ? 'Time' : 'Date and time', nowrap: true, render: (p) => <span className="tnum text-ink2">{p.iso === '2026-10-09' ? p.t : <>{p.date}<span className="block text-[12px] text-ink3">{p.t}</span></>}</span> },
                    { key: 'name', label: 'Student', render: (p) => <><p className="font-semibold leading-tight">{p.name}</p><p className="text-[12.5px] text-ink3">{p.cls}</p></> },
                    { key: 'head', label: 'Fee heads', render: (p) => <span className="text-[13px] text-ink2">{p.head}</span> },
                    { key: 'amt', label: 'Amount', align: 'right', render: (p) => <span className={cx('font-semibold', p.status === 'Cancelled' && 'line-through text-ink3')}>{inr(p.amt)}</span> },
                    { key: 'mode', label: 'Mode', nowrap: true, render: (p) => <span className="inline-flex items-center gap-1.5 text-[13px]"><ModeIcon mode={p.mode} />{p.mode}</span> },
                    { key: 'rcpt', label: 'Receipt or reference', render: (p) => <span className="font-mono text-[12px] text-ink2">{p.rcpt || p.ref}</span> },
                    { key: 'status', label: 'Status', render: (p) => <PayPill status={p.status} /> },
                  ]}
                  mobile={(p) => ({ title: p.name, sub: `${p.cls} · ${p.iso === '2026-10-09' ? p.t : p.date} · ${p.mode}`, avatar: p.name, right: <><p className={cx('font-semibold tnum text-[14.5px]', p.status === 'Cancelled' && 'line-through text-ink3')}>{inr(p.amt)}</p><PayPill status={p.status} short /></> })}
                  empty={<Empty icon={I.SearchX} title="No payments match" body={all.length ? 'Try another status or mode.' : per.to < '2026-04-01' ? 'School OS started on 1 Apr 2026. Earlier payments are in the old software’s files.' : `Nothing was collected in ${range}.`} action={<Button variant="secondary" onClick={() => { setQ(''); setStatus('all'); setMode('all'); setPer(PERIODS.today); }}>Clear filters</Button>} />} />
              </Card>
        </div>
      </div>

      <PaymentSheet key={open?.id} p={open} onClose={() => setOpen(null)} onCancel={(p) => { setOpen(null); setCancel(p); }} onVerify={verify} onReject={reject} />
      <CancelSheet key={'c' + cancel?.id} p={cancel} onClose={() => setCancel(null)} onDone={doCancel} />
    </div>
  );
}

/* =========================================================================================
   Student Fee Ledger
   ========================================================================================= */
const KIND = {
  opening: ['Opening balance', 'neutral', 'History'], charge: ['Fee raised', 'info', 'FileText'], concession: ['Concession', 'brand', 'BadgePercent'],
  receipt: ['Receipt', 'ok', 'ReceiptIndianRupee'], reversal: ['Reversal', 'bad', 'Undo2'], late: ['Late fee', 'warn', 'Timer'],
};
function LedgerPage({ params }) {
  const { go } = useNav();
  const toast = useToast();
  const canEdit = useCanEdit();
  const [sid, setSid] = useState(params?.id && byId(params.id) ? params.id : FEATURED.id);
  const s = byId(sid) || FEATURED;
  const L = useMemo(() => withBalance(ledgerFor(s)), [sid]);
  const inst = useMemo(() => installmentsFor(s, L), [sid]);
  const [tab, setTab] = useState('statement');
  const [pick, setPick] = useState(false);
  const [view, setView] = useState(null);
  const [cancel, setCancel] = useState(null);
  const [cancelled, setCancelled] = useState({});
  const [opening, setOpening] = useState(false);
  const [per, setPer] = useState(PERIODS.finyear);
  const { role } = useRole();

  // The chosen dates: entries before them become one "brought forward" line
  const inP = (e) => inPeriod(isoOf(e.d), per);
  const before = L.filter((e) => isoOf(e.d) < per.from);
  const bf = before.length ? before[before.length - 1].bal : 0;
  const LP = L.filter(inP);
  const balTo = LP.length ? LP[LP.length - 1].bal : bf;
  const toLabel = per.to >= '2026-10-09' ? '9 Oct 2026' : fmtDay(per.to);
  const allReceipts = L.filter((e) => e.kind === 'receipt');
  const receipts = allReceipts.filter(inP);
  const adjustments = L.filter((e) => (['concession', 'late', 'reversal'].includes(e.kind) || (e.kind === 'opening' && e.debit)) && inP(e));
  const balance = L.length ? L[L.length - 1].bal : 0;
  const yearTotal = inst.reduce((a, r) => a + r.amount, 0);
  const paid = allReceipts.filter((e) => !e.cancelled && !cancelled[e.ref]).reduce((a, e) => a + e.credit, 0);
  const paidP = receipts.filter((e) => !e.cancelled && !cancelled[e.ref]).reduce((a, e) => a + e.credit, 0);
  const heads = Object.values(inst.reduce((m, r) => { const k = r.head; m[k] = m[k] || { head: k, total: 0, paid: 0 }; m[k].total += r.amount; m[k].paid += r.paid; return m; }, {}));
  const d = DEF_BY_ID[s.id];
  const asPay = (e) => ({ id: e.ref, rcpt: e.ref, name: s.name, cls: clsOf(s), sid: null, parent: s.father, phone: s.phone, head: e.title.replace(/^(Part payment|Payment) · /, ''), amt: e.credit, pen: 0, mode: e.mode, ref: e.mode === 'Cash' ? '' : e.sub.includes('·') ? e.sub.split(' · ').slice(1).join(' · ') : '', date: dlong(e.d), t: '—', by: e.mode === 'Online' ? 'Razorpay' : 'Suresh Babu', acct: e.title.includes('Transport') ? 'Trust account' : 'School account',
    status: e.cancelled || cancelled[e.ref] ? 'Cancelled' : 'Posted', cancel: e.cancelled ? { ...e.cancelled, when: e.cancelled.when } : cancelled[e.ref], kind: e.partial ? 'Partial' : 'Full' });

  return (
    <div>
      <ModuleHead title="Fees" sub="Each student’s fees, payments, balance and receipts. Nothing here is ever deleted."
        actions={<>
          {canEdit && <Button variant="secondary" icon={I.FileText} className="hidden @md:inline-flex" onClick={() => toast({ title: `Fee invoice ready for ${s.name}`, body: `Dues ${inr(balance)} · sent on WhatsApp with a Razorpay link` })}>Fee invoice</Button>}
          {canEdit && canOpen(role, 'fees', 'collect') && <Button variant="primary" icon={I.IndianRupee} onClick={() => go('fees', { student: s.id })}>Collect fee</Button>}
        </>} />

      <div className="flex flex-col gap-5 @lg:gap-6">
        {/* Student and summary */}
        <Card className="overflow-hidden">
          <div className="p-4 @md:p-5 flex items-center gap-4">
            <Avatar name={s.name} size={56} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => role.access.students && go('student', { id: s.id })} className="font-display font-semibold text-[19px] leading-tight hover:underline text-left">{s.name}</button>
                {d ? <Pill tone="bad">{inr(d.amount)} overdue</Pill> : balance > 0 ? <Pill tone="warn">{inr(balance)} due</Pill> : <Pill tone="ok">No dues</Pill>}
              </div>
              <p className="text-[13px] text-ink3 truncate">{s.cls} {s.sec} · Roll {s.roll} · <span className="font-mono text-[12.5px]">{s.adm}</span><span className="hidden @md:inline"> · {s.father} · <span className="tnum">{s.phone}</span></span></p>
            </div>
            <div className="hidden @sm:block"><Ring value={yearTotal ? (paid / yearTotal) * 100 : 0} size={60} stroke={7}><span className="text-[12.5px] font-bold tnum">{pct(paid, yearTotal)}%</span></Ring></div>
            <Button variant="secondary" icon={I.ArrowRightLeft} onClick={() => setPick(true)}><span className="hidden @md:inline">Change student</span><span className="@md:hidden">Change</span></Button>
          </div>
          <div className="grid grid-cols-3 @lg:grid-cols-4 gap-px bg-line/70 border-t border-line/70">
            {[...heads.slice(0, 3), ...Array.from({ length: Math.max(0, 3 - heads.length) }, () => null)].map((h, i) => h ? (
              <div key={h.head} className="bg-surface px-3 @md:px-5 py-3 min-w-0">
                <p className="text-[12px] text-ink3 font-semibold truncate">{h.head}</p>
                <p className="text-[14px] @md:text-[15px] font-semibold tnum mt-0.5 truncate">{inr(h.paid)}</p>
                <p className="text-[12px] text-ink3 tnum truncate">of {inr(h.total)}</p>
                <Progress className="mt-1.5" value={pct(h.paid, h.total)} tone={h.paid >= h.total ? 'ok' : 'brand'} />
              </div>
            ) : <div key={'x' + i} className="bg-surface" />)}
            <div className="bg-surface px-4 @md:px-5 py-3 min-w-0 col-span-3 @lg:col-span-1">
              <p className="text-[12px] text-ink3 font-semibold">Year total · paid · balance now</p>
              <p className="text-[15px] font-semibold tnum mt-0.5">{inr(yearTotal)} · <span className="text-ok">{inr(paid)}</span> · <span className={balance ? 'text-bad' : 'text-ok'}>{inr(balance)}</span></p>
              <p className="text-[12px] text-ink3">Balance includes late fees and dues raised so far</p>
            </div>
          </div>
        </Card>

        <div className="flex items-center gap-2 flex-wrap">
          <Tabs className="flex-1 min-w-0" value={tab} onChange={setTab} tabs={[
            { id: 'statement', label: 'Statement' }, { id: 'fees', label: 'Fees', count: inst.length }, { id: 'payments', label: 'Payments', count: receipts.length },
            { id: 'partial', label: 'Partial payments', count: receipts.filter((e) => e.partial).length }, { id: 'invoices', label: 'Invoices' }, { id: 'adjust', label: 'Adjustments', count: adjustments.length },
          ]} />
          {tab !== 'fees' && <DatePeriod id="led-per" value={per} onChange={setPer} className="w-full @md:w-auto" />}
          {canEdit && <MoreMenu items={[
            ['Award', 'Fee certificate', () => toast({ title: 'Fee certificate ready', body: `${s.name.replace(' ', '-')}-fees-2026-27.pdf · ${inr(paid)} paid from 1 Apr to 9 Oct 2026` })],
            ['History', 'Add opening balance (old dues)', () => setOpening(true)],
            ['Scale', 'Adjust an amount', () => toast({ title: 'Adjust an amount', body: 'Adds an adjustment row with a reason. Payments themselves never change.', tone: 'info' })],
            ['FileInput', 'Import old dues', () => toast({ title: 'Import old dues', body: 'Uses the shared importer. Nothing goes to the Day Book.', tone: 'info' })],
            ['FileSpreadsheet', 'Import past receipts', () => toast({ title: 'Import past receipts', body: 'Kept read-only as “Brought in”. They never post to the Day Book.', tone: 'info' })],
          ]} />}
        </div>

        <div key={tab + sid} className="animate-rise">
          {tab === 'statement' && (
            <Card className="overflow-hidden">
              <CardHead title={`Statement · ${per.label}`} sub={`${fmtRange(per)} · every fee, payment, cancelled receipt, concession and late fee, with the running balance`} action={<ExportButton what="ledger statement" />} />
              {LP.length === 0 && <Empty icon={I.CalendarX2} title="Nothing in these dates" body={`No fee, payment or change for ${s.first} in ${fmtRange(per)}. Balance ${inr(bf)}.`} action={<Button variant="secondary" onClick={() => setPer(PERIODS.finyear)}>Show this financial year</Button>} />}
              {LP.length > 0 && <div className="hidden @lg:block overflow-x-auto scroll-thin">
                <table className="w-full text-[14px] min-w-[760px]">
                  <thead><tr className="text-[12px] text-ink3 text-left border-y border-line">
                    <th className="pl-5 pr-3 py-2.5 font-semibold">Date</th><th className="px-3 py-2.5 font-semibold">Entry</th><th className="px-3 py-2.5 font-semibold">Reference</th>
                    <th className="px-3 py-2.5 font-semibold text-right">Charged</th><th className="px-3 py-2.5 font-semibold text-right">Paid or reduced</th><th className="pl-3 pr-5 py-2.5 font-semibold text-right">Balance</th>
                  </tr></thead>
                  <tbody>
                    {before.length > 0 && <tr className="border-b border-line/70 bg-sunken/40"><td className="pl-5 pr-3 py-2.5 tnum whitespace-nowrap text-ink2">{fmtDay(per.from).replace(/ \d{4}$/, '')}</td><td className="px-3 py-2.5 font-semibold" colSpan={4}>Brought forward<span className="block text-[12.5px] text-ink3 font-normal">Balance before {fmtDay(per.from)}</span></td><td className="pl-3 pr-5 py-2.5 text-right tnum font-semibold">{inr(bf)}</td></tr>}
                    {LP.map((e, i) => {
                      const [label, tone] = KIND[e.kind];
                      const isCx = e.cancelled || cancelled[e.ref];
                      return (
                        <tr key={i} onClick={e.kind === 'receipt' ? () => setView(asPay(e)) : undefined} className={cx('border-b border-line/70 last:border-0', e.kind === 'receipt' && 'cursor-pointer hover:bg-sunken/60', isCx && 'bg-bad/[.03]')}>
                          <td className="pl-5 pr-3 py-2.5 tnum whitespace-nowrap text-ink2">{dshort(e.d)}</td>
                          <td className="px-3 py-2.5">
                            <p className="font-semibold leading-tight flex items-center gap-2 flex-wrap"><span className={cx(isCx && 'line-through text-ink3')}>{e.title}</span>{isCx ? <Pill tone="bad" className="!h-5 !text-[11px]">Cancelled</Pill> : label !== e.title && <Pill tone={tone} className="!h-5 !text-[11px]">{label}</Pill>}</p>
                            <p className="text-[12.5px] text-ink3">{isCx ? `${(e.cancelled || cancelled[e.ref]).reason} · cancelled ${(e.cancelled || cancelled[e.ref]).when} · stays on record` : e.sub}</p>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-[12px] text-ink2 whitespace-nowrap">{e.ref || '—'}</td>
                          <td className="px-3 py-2.5 text-right tnum">{e.debit ? inr(e.debit) : ''}</td>
                          <td className={cx('px-3 py-2.5 text-right tnum', e.credit && 'text-ok', isCx && 'line-through !text-ink3')}>{e.credit ? inr(e.credit) : ''}</td>
                          <td className="pl-3 pr-5 py-2.5 text-right tnum font-semibold">{inr(e.bal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot><tr className="border-t-2 border-line font-semibold"><td className="pl-5 py-3" colSpan={3}>Balance on {toLabel}</td><td className="px-3 text-right tnum">{inr(LP.reduce((a, e) => a + (e.debit || 0), 0))}</td><td className="px-3 text-right tnum">{inr(LP.reduce((a, e) => a + (e.credit || 0), 0))}</td><td className={cx('pl-3 pr-5 text-right tnum', balTo && 'text-bad')}>{inr(balTo)}</td></tr></tfoot>
                </table>
              </div>}
              {LP.length > 0 && <ul className="@lg:hidden divide-y divide-line/70 border-t border-line">
                {before.length > 0 && <li className="flex justify-between px-4 py-3 text-[14px] bg-sunken/40"><span><b className="font-semibold">Brought forward</b><span className="block text-[12.5px] text-ink3">Before {fmtDay(per.from)}</span></span><span className="tnum font-semibold">{inr(bf)}</span></li>}
                {LP.map((e, i) => {
                  const [label, tone, ic] = KIND[e.kind];
                  const isCx = e.cancelled || cancelled[e.ref];
                  const Ic = I[ic];
                  const body = (
                    <>
                      <span className={cx('w-10 h-10 rounded-xl grid place-items-center shrink-0', TONE_SOFT[isCx ? 'bad' : tone])}><Ic size={18} /></span>
                      <div className="min-w-0 flex-1">
                        <p className={cx('font-semibold text-[14.5px] leading-snug', isCx && 'line-through text-ink3')}>{e.title}</p>
                        <p className="text-[12.5px] text-ink3">{dshort(e.d)} · {isCx ? `Cancelled: ${(e.cancelled || cancelled[e.ref]).reason}` : e.ref || label}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={cx('font-semibold tnum text-[14px]', e.credit && 'text-ok', isCx && 'line-through !text-ink3')}>{e.debit ? `+${inr(e.debit)}` : e.credit ? `−${inr(e.credit)}` : inr(0)}</p>
                        <p className="text-[12px] text-ink3 tnum">Bal. {inr(e.bal)}</p>
                      </div>
                    </>
                  );
                  return <li key={i}>{e.kind === 'receipt' ? <button onClick={() => setView(asPay(e))} className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-sunken">{body}</button> : <div className="flex items-center gap-3 px-4 py-3">{body}</div>}</li>;
                })}
                <li className="flex justify-between px-4 py-3 font-semibold text-[14.5px]"><span>Balance on {toLabel.replace(' 2026', '')}</span><span className={cx('tnum', balTo && 'text-bad')}>{inr(balTo)}</span></li>
              </ul>}
            </Card>
          )}

          {tab === 'fees' && (
            <Card className="overflow-hidden">
              <CardHead title="Fees for 2026–27" sub="Each fee head with its installments, oldest first" action={canEdit && <Button size="sm" variant="ghost" icon={I.Plus} onClick={() => toast({ title: 'Assign a fee plan', body: 'Pick the class plan or one row. An exception for one student needs a reason.', tone: 'info' })}>Assign fee</Button>} />
              <DataList rows={inst} rowKey={(r) => r.head + r.inst} minWidth={640} footer={`${inst.filter((r) => r.status === 'Paid').length} of ${inst.length} installments paid · Year total ${inr(yearTotal)}`}
                columns={[
                  { key: 'head', label: 'Fee head', render: (r) => <><p className="font-semibold leading-tight">{r.head}</p><p className="text-[12.5px] text-ink3">{r.inst}</p></> },
                  { key: 'due', label: 'Due date', nowrap: true, render: (r) => <span className="tnum">{r.due}</span> },
                  { key: 'amount', label: 'Amount', align: 'right', render: (r) => inr(r.amount) },
                  { key: 'paid', label: 'Paid', align: 'right', render: (r) => (r.paid ? inr(r.paid) : '—') },
                  { key: 'late', label: 'Late fee', align: 'right', render: (r) => (r.late ? <span className="text-bad">{inr(r.late)}</span> : '—') },
                  { key: 'bal', label: 'Balance', align: 'right', render: (r) => <b className="font-semibold">{inr(r.amount - r.paid + r.late)}</b> },
                  { key: 'status', label: 'Status', render: (r) => <Pill tone={feeTone(r.status)}>{r.status}</Pill> },
                ]}
                mobile={(r) => ({ title: `${r.head} · ${r.inst}`, sub: `Due ${r.due}${r.paid && r.status !== 'Paid' ? ` · ${inr(r.paid)} paid` : ''}${r.late ? ` · late fee ${inr(r.late)}` : ''}`, icon: 'ReceiptIndianRupee', iconTone: feeTone(r.status), right: <><p className="font-semibold tnum">{inr(r.status === 'Paid' ? r.amount : r.amount - r.paid + r.late)}</p><Pill tone={feeTone(r.status)} className="!h-5 !text-[11px]">{r.status}</Pill></> })} />
            </Card>
          )}

          {tab === 'payments' && (
            <Card className="overflow-hidden">
              <CardHead title="Payments" sub={`${per.label} · ${fmtRange(per)} · cancelled payments stay here, struck through, with the reason`} />
              <DataList rows={receipts.map(asPay)} rowKey={(p) => p.rcpt} onRow={setView} minWidth={640} footer={`${receipts.length} payments · ${inr(paidP)} posted`}
                empty={<Empty icon={I.CalendarX2} title="No payments in these dates" body={`${s.first} paid nothing in ${fmtRange(per)}.`} />}
                columns={[
                  { key: 'date', label: 'Date', nowrap: true, render: (p) => <span className="tnum text-ink2">{p.date}</span> },
                  { key: 'rcpt', label: 'Receipt', render: (p) => <span className="font-mono text-[12.5px]">{p.rcpt}</span> },
                  { key: 'head', label: 'For', render: (p) => <span className="text-[13px]">{p.head}</span> },
                  { key: 'mode', label: 'Mode', nowrap: true, render: (p) => <span className="inline-flex items-center gap-1.5 text-[13px]"><ModeIcon mode={p.mode} />{p.mode}</span> },
                  { key: 'amt', label: 'Amount', align: 'right', render: (p) => <span className={cx('font-semibold', p.status === 'Cancelled' && 'line-through text-ink3')}>{inr(p.amt)}</span> },
                  { key: 'status', label: 'Status', render: (p) => <><PayPill status={p.status} />{p.cancel && <span className="block text-[12px] text-ink3 mt-0.5">{p.cancel.reason}</span>}</> },
                ]}
                mobile={(p) => ({ title: p.head, sub: `${p.date} · ${p.rcpt} · ${p.mode}`, icon: MODE_ICON[p.mode], iconTone: p.status === 'Cancelled' ? 'bad' : 'ok', right: <><p className={cx('font-semibold tnum', p.status === 'Cancelled' && 'line-through text-ink3')}>{inr(p.amt)}</p><PayPill status={p.status} short /></> })} />
            </Card>
          )}

          {tab === 'partial' && (
            <Card className="overflow-hidden">
              <CardHead title="Partial payments" sub="Payments that did not clear their row fully" />
              {receipts.filter((e) => e.partial).length === 0 ? <Empty icon={I.CircleCheck} title="No partial payments" body={`Every payment by ${s.first} in ${fmtRange(per)} cleared its row.`} /> : (
                <DataList rows={receipts.filter((e) => e.partial)} rowKey={(e) => e.ref} minWidth={640}
                  columns={[
                    { key: 'ref', label: 'Receipt', render: (e) => <span className="font-mono text-[12.5px]">{e.ref}</span> },
                    { key: 'title', label: 'Row', render: (e) => e.title.replace('Part payment · ', '') },
                    { key: 'credit', label: 'Paid', align: 'right', render: (e) => inr(e.credit) },
                    { key: 'left', label: 'Balance on the row', align: 'right', render: (e) => <span className="text-bad font-semibold">{inr(e.partial.left)}</span> },
                    { key: 'd', label: 'Recorded', nowrap: true, render: (e) => dshort(e.d) },
                    { key: 'set', label: 'Settled', render: () => <Pill tone="warn">Not yet</Pill> },
                  ]}
                  mobile={(e) => ({ title: e.title.replace('Part payment · ', ''), sub: `${e.ref} · ${dshort(e.d)} · ${inr(e.credit)} paid`, icon: 'Split', iconTone: 'warn', right: <span className="text-bad font-semibold tnum">{inr(e.partial.left)} left</span> })} />
              )}
            </Card>
          )}

          {tab === 'invoices' && (
            <Card>
              <CardHead title="Fee invoices" sub="Raised when each installment falls due. Sent with a Razorpay link." />
              <ul className="px-2 pb-2">
                {Object.entries(L.filter((e) => e.kind === 'charge' && inP(e)).reduce((m, e) => { const k = dshort(e.d); (m[k] = m[k] || []).push(e); return m; }, {})).map(([date, list], i) => {
                  const total = list.reduce((a, e) => a + e.debit, 0);
                  const st = dkey(list[0].d) < dkey([9, 1]) ? (s.id === FEATURED.id && date === '1 Jul' ? 'Part paid' : 'Paid') : balance ? 'Open' : 'Paid';
                  return (
                    <li key={date} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/70">
                      <span className="w-10 h-10 rounded-xl bg-sunken text-ink2 grid place-items-center shrink-0"><I.FileText size={18} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[14px] truncate"><span className="font-mono text-[12.5px]">{list[0].ref || `FI/26/0${4100 + i}`}</span> · {date} 2026</p>
                        <p className="text-[12.5px] text-ink3 truncate">{list.map((e) => e.title).join(', ')}</p>
                      </div>
                      <span className="text-right shrink-0"><span className="block font-semibold tnum">{inr(total)}</span><Pill tone={st === 'Paid' ? 'ok' : st === 'Open' ? 'warn' : 'info'} className="!h-5 !text-[11px]">{st}</Pill></span>
                      {canEdit && <button aria-label="Send again" title="Send again" onClick={() => toast({ title: 'Invoice sent again', body: `To ${s.father} on WhatsApp` })} className="w-9 h-9 rounded-lg grid place-items-center text-ink3 hover:bg-sunken shrink-0"><I.Send size={16} /></button>}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {tab === 'adjust' && (
            <Card>
              <CardHead title="Adjustments" sub="Concessions, late fees, reversals and old dues, each with its reason and who approved it" />
              {adjustments.length === 0 && <p className="px-5 pb-4 -mt-1 text-[13.5px] text-ink3">No adjustments in {fmtRange(per)}.</p>}
              <ul className="px-5 pb-3">
                {adjustments.map((e, i) => {
                  const [label, tone, ic] = KIND[e.kind];
                  const Ic = I[ic];
                  return (
                    <li key={i} className="flex items-start gap-3 py-3 border-t border-line/70 first:border-0">
                      <span className={cx('w-9 h-9 rounded-xl grid place-items-center shrink-0', TONE_SOFT[tone])}><Ic size={17} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[14.5px] leading-snug">{e.title}</p>
                        <p className="text-[12.5px] text-ink3">{dshort(e.d)} · {label} · {e.sub}</p>
                      </div>
                      <span className={cx('font-semibold tnum shrink-0', e.credit ? 'text-ok' : 'text-ink')}>{e.credit ? `−${inr(e.credit)}` : `+${inr(e.debit)}`}</span>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>

        {s.id === FEATURED.id && (
          <Card>
            <CardHead title="Coming up" sub="Not in the balance yet. Raised on the 1st of the month they fall due." icon={I.CalendarDays} />
            <ul className="px-5 pb-4 flex flex-col">
              {FEE_ROWS.filter((r) => r.status === 'Not due').map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2 border-t border-line/70 first:border-0 text-[14px]">
                  <span className="flex-1 min-w-0"><b className="font-semibold">{r.head}</b> <span className="text-ink3">· {r.inst}</span></span>
                  <span className="text-ink3 tnum">Due {r.due}</span>
                  <span className="font-semibold tnum w-20 text-right">{inr(r.amount)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <StudentPicker open={pick} onClose={() => setPick(false)} onPick={(id) => { setSid(id); setPick(false); setTab('statement'); }} />
      <PaymentSheet key={view?.id} p={view} onClose={() => setView(null)} onCancel={(p) => { setView(null); setCancel(p); }} onVerify={() => {}} onReject={() => {}} />
      <CancelSheet key={'c' + cancel?.id} p={cancel} onClose={() => setCancel(null)} onDone={(p, reason, note, needsOk) => {
        setCancel(null);
        if (needsOk) toast({ title: 'Sent to Lakshmi Rao for approval', body: `Cancel ${p.rcpt} (${p.date}) · ${reason}. It stays posted until she decides.`, tone: 'info' });
        else { setCancelled({ ...cancelled, [p.rcpt]: { reason, when: '9 Oct 2026', by: role.person.name, note } }); toast({ title: `Receipt ${p.rcpt} cancelled`, body: 'Dues reopened. Day Book reversal added for 9 Oct.' }); }
      }} />
      <FormSheet open={opening} onClose={() => setOpening(false)} title="Add opening balance" sub={`Old dues for ${s.name} from before School OS. Nothing is added to the Day Book.`} submitLabel="Add opening balance"
        onSubmit={() => toast({ title: 'Opening balance added', body: `Shown on ${s.first}’s ledger as “Brought in”. Logged in the audit log.` })}>
        <Field label="Amount" required id="ob-amt"><Input id="ob-amt" inputMode="numeric" placeholder="₹ 0" /></Field>
        <Field label="Fee head" id="ob-head"><Select id="ob-head" value="Old dues" onChange={() => {}} options={['Old dues', 'Tuition fee', 'Transport fee', 'Hostel fee']} /></Field>
        <Field label="Due date" id="ob-due" hint="DD-MM-YYYY"><Input id="ob-due" defaultValue="31-03-2026" /></Field>
        <Field label="Note" id="ob-note"><Textarea id="ob-note" value="" onChange={() => {}} rows={2} placeholder="Example: from the 2025–26 register, page 44" /></Field>
      </FormSheet>
    </div>
  );
}

function StudentPicker({ open, onClose, onPick }) {
  const [q, setQ] = useState('');
  const t = q.trim().toLowerCase();
  const list = t ? STUDENTS.filter((s) => s.name.toLowerCase().includes(t) || s.adm.toLowerCase().includes(t) || s.phone.replace(' ', '').includes(t.replace(/\s/g, ''))).slice(0, 12)
    : [FEATURED, ...DEFAULTERS.filter((d) => d.id !== FEATURED.id).sort((a, b) => b.days - a.days).slice(0, 7).map((d) => d.s)];
  return (
    <Sheet open={open} onClose={onClose} title="Open a student’s ledger" sub="Search by name, admission number or parent phone">
      <div className="flex flex-col gap-3">
        <SearchBox id="led-q" value={q} onChange={setQ} placeholder="Name, admission no. or phone" />
        <p className="eyebrow text-ink3 px-1">{t ? `${list.length} found` : 'Most overdue'}</p>
        {list.length === 0 ? <Empty icon={I.SearchX} title={`No student called “${q}”`} body="Try the admission number, like SPS/2021/0417." /> : (
          <ul className="-mx-2">
            {list.map((s) => (
              <li key={s.id}>
                <button onClick={() => onPick(s.id)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken text-left">
                  <Avatar name={s.name} size={40} />
                  <span className="min-w-0 flex-1"><span className="block font-semibold text-[14.5px] truncate">{s.name}</span><span className="block text-[12.5px] text-ink3 truncate">{clsOf(s)} · <span className="font-mono">{s.adm}</span></span></span>
                  {s.due ? <span className={cx('text-[13px] font-semibold tnum', s.feeState === 'Overdue' ? 'text-bad' : 'text-warn')}>{inr(s.due)}</span> : <Pill tone="ok">No dues</Pill>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}

/* =========================================================================================
   Defaulters
   ========================================================================================= */
function DefaultersPage() {
  const { role } = useRole();
  if (role.id === 'admissioncounsellor') return <AdmissionFees />;
  return <Defaulters />;
}
function Defaulters() {
  const { go } = useNav();
  const { role } = useRole();
  const toast = useToast();
  const canEdit = useCanEdit();
  const [per, setPer] = useState(ALL_DATES);
  const [cls, setCls] = useState('all');
  const [bucket, setBucket] = useState('all');
  const [above, setAbove] = useState('0');
  const [rem, setRem] = useState('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(new Set());
  const [send, setSend] = useState(null);
  const [hist, setHist] = useState(null);
  const [extra, setExtra] = useState({});
  const remOf = (d) => (extra[d.id]?.sent ? [{ when: 'Today', channel: 'WhatsApp', template: 'Fee overdue', status: 'Sent' }, ...d.reminders] : d.reminders);

  const t = q.trim().toLowerCase();
  const rows = DEFAULTERS.filter((d) => inPeriod(isoOf(d.since), per) && (cls === 'all' || d.s.clsId === cls) && (bucket === 'all' || d.bucket === bucket) && d.amount >= Number(above) &&
    (rem === 'all' || (rem === 'yes' ? remOf(d).length > 0 : remOf(d).length === 0)) &&
    (!t || d.s.name.toLowerCase().includes(t) || d.s.father.toLowerCase().includes(t) || d.s.adm.toLowerCase().includes(t))).sort((a, b) => b.days - a.days || b.amount - a.amount);
  const total = rows.reduce((a, d) => a + d.amount, 0);
  const filtered = rows.length !== DEFAULTERS.length;
  const byClass = CLASSES.map((c) => ({ id: c.id, k: c.name.replace('Class ', 'Class '), v: DEFAULTERS.filter((d) => d.s.clsId === c.id).reduce((a, d) => a + d.amount, 0), n: DEFAULTERS.filter((d) => d.s.clsId === c.id).length })).filter((r) => r.v);
  const cMax = Math.max(...byClass.map((r) => r.v));
  const half = Math.ceil(byClass.length / 2);
  const ageTone = (d) => (d.days > 60 ? 'bad' : d.days > 30 ? 'warn' : 'neutral');

  return (
    <div>
      <ModuleHead title="Fees" sub={`${DEFAULTERS.length} students owe ${inr(OVERDUE_TOTAL)} past the due date · ${DEFAULTERS.filter((d) => d.days > 30).length} more than 30 days late`}
        actions={<><ExportButton what="defaulters list" />{canEdit && rows.length > 0 && <Button variant="primary" icon={I.Send} onClick={() => setSend(rows)}>{filtered ? `Send reminder to ${rows.length}` : `Send reminder to all ${rows.length}`}</Button>}</>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Stats items={BUCKETS.map((b) => {
          const list = DEFAULTERS.filter((d) => d.bucket === b.id);
          return { label: b.label, value: inr(list.reduce((a, d) => a + d.amount, 0)), sub: `${list.length} students${bucket === b.id ? ' · showing' : ''}`, tone: b.tone, icon: 'Hourglass', onClick: () => setBucket(bucket === b.id ? 'all' : b.id) };
        })} />

        <Card>
          <CardHead title="Overdue by class" sub="Tap a class to see its students" icon={I.ChartColumn} />
          <div className="px-5 pb-5 grid @lg:grid-cols-2 gap-x-8 gap-y-2.5">
            {[byClass.slice(0, half), byClass.slice(half)].map((col, ci) => (
              <ul key={ci} className="flex flex-col gap-2.5">
                {col.map((r) => (
                  <li key={r.id}>
                    <button onClick={() => setCls(cls === r.id ? 'all' : r.id)} className={cx('w-full grid items-center gap-3 text-[13px] rounded-lg -mx-1 px-1 py-0.5 text-left', cls === r.id ? 'bg-brand/8' : 'hover:bg-sunken/70')} style={{ gridTemplateColumns: '72px 1fr 92px' }}>
                      <span className="text-ink2 font-medium truncate">{r.k}</span>
                      <span className="relative h-3 rounded-full bg-sunken overflow-hidden"><span className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${(r.v / cMax) * 100}%` }} /></span>
                      <span className="text-right font-semibold tnum">{inrShort(r.v)} <span className="text-ink3 font-normal">· {r.n}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <Toolbar className="@md:flex-wrap">
            <SearchBox id="def-q" className="@md:min-w-[220px]" value={q} onChange={setQ} placeholder="Student, parent or admission no." />
            <div className="flex flex-col gap-1 w-full @md:w-auto">
              <DatePeriod id="def-per" value={per} onChange={setPer} className="w-full @md:w-auto" />
            </div>
            <div className="grid grid-cols-2 gap-2.5 @md:flex">
              <Select id="def-cls" className="@md:w-36" value={cls} onChange={setCls} options={[{ value: 'all', label: 'All classes' }, ...CLASSES.filter((c) => DEFAULTERS.some((d) => d.s.clsId === c.id)).map((c) => ({ value: c.id, label: c.name }))]} />
              <Select id="def-age" className="@md:w-40" value={bucket} onChange={setBucket} options={[{ value: 'all', label: 'Any days late' }, ...BUCKETS.map((b) => ({ value: b.id, label: b.label }))]} />
              <Select id="def-amt" className="@md:w-40" value={above} onChange={setAbove} options={[{ value: '0', label: 'Any amount' }, { value: '5000', label: '₹5,000 or more' }, { value: '10000', label: '₹10,000 or more' }, { value: '20000', label: '₹20,000 or more' }]} />
              <Select id="def-rem" className="@md:w-40" value={rem} onChange={setRem} options={[{ value: 'all', label: 'All reminders' }, { value: 'yes', label: 'Reminded' }, { value: 'no', label: 'Not reminded yet' }]} />
            </div>
          </Toolbar>
          {canEdit && (
            <BulkBar count={sel.size} onClear={() => setSel(new Set())}>
              <Button size="sm" variant="secondary" icon={I.Send} onClick={() => setSend(DEFAULTERS.filter((d) => sel.has(d.id)))}>Send reminder</Button>
              <Button size="sm" variant="secondary" icon={I.PhoneCall} onClick={() => toast({ title: `Call list ready: ${sel.size} families`, body: 'Oldest dues first, with phone numbers', tone: 'info' })}>Call list</Button>
            </BulkBar>
          )}
          <DataList rows={rows} rowKey={(d) => d.id} onRow={setHist} select={canEdit ? [sel, setSel] : undefined} minWidth={900}
            footer={`Showing ${rows.length} of ${DEFAULTERS.length} · ${inr(total)} overdue${per.key !== 'all' ? ` · overdue since ${fmtRange(per)}` : ''}`}
            empty={<Empty icon={I.SearchX} title="Nobody on this list" body={per.key !== 'all' ? `No dues fell overdue in ${fmtRange(per)} with these filters.` : 'No student matches these filters.'} action={<Button variant="secondary" onClick={() => { setCls('all'); setBucket('all'); setAbove('0'); setRem('all'); setQ(''); setPer(ALL_DATES); }}>Clear filters</Button>} />}
            columns={[
              { key: 'name', label: 'Student', render: (d) => <div className="flex items-center gap-3"><Avatar name={d.s.name} size={34} /><div className="min-w-0"><p className="font-semibold leading-tight">{d.s.name}</p><p className="text-[12px] text-ink3 font-mono">{d.s.adm}</p></div></div> },
              { key: 'cls', label: 'Class', nowrap: true, render: (d) => clsOf(d.s) },
              { key: 'parent', label: 'Parent', render: (d) => <><p className="leading-tight">{d.s.father}</p><p className="text-[12.5px] text-ink3 tnum">{d.s.phone}</p></> },
              { key: 'amt', label: 'Overdue', align: 'right', render: (d) => <><p className="font-semibold">{inr(d.amount)}</p><p className="text-[12px] text-ink3 max-w-[180px] truncate ml-auto">{d.head}</p></> },
              { key: 'since', label: 'Overdue since', render: (d) => <><p className="tnum">{dshort(d.since)}</p><Pill tone={ageTone(d)} className="!h-5 !text-[11px]">{d.days} days</Pill></> },
              { key: 'rem', label: 'Last reminder', render: (d) => { const r = remOf(d); return r.length ? <><p className="text-[13px]">{r[0].when} · {r[0].channel}</p><p className="text-[12px] text-ink3">{r.length} sent · {r[0].status}</p></> : <span className="text-[13px] text-ink3">Not reminded yet</span>; } },
              { key: 'act', label: '', render: (d) => canEdit && canOpen(role, 'fees', 'collect') && <Button size="sm" variant="soft" onClick={(e) => { e.stopPropagation(); go('fees', { student: d.id }); }}>Collect</Button> },
            ]}
            mobile={(d) => ({ title: d.s.name, sub: `${clsOf(d.s)} · ${d.head}`, avatar: d.s.name, right: <><p className="font-semibold tnum">{inr(d.amount)}</p><Pill tone={ageTone(d)} className="!h-5 !text-[11px]">{d.days} days</Pill></> })} />
        </Card>
      </div>

      <ReminderSheet list={send} onClose={() => setSend(null)} onSent={(list) => { setExtra((x) => { const n = { ...x }; list.forEach((d) => (n[d.id] = { ...n[d.id], sent: true })); return n; }); setSel(new Set()); }} />
      <HistorySheet d={hist} rems={hist ? remOf(hist) : []} calls={hist ? [...(extra[hist.id]?.calls || []), ...hist.calls] : []} onClose={() => setHist(null)}
        onSend={(d) => { setHist(null); setSend([d]); }} onCall={(d, text) => setExtra((x) => ({ ...x, [d.id]: { ...x[d.id], calls: [{ when: 'Today, 10:44 AM', by: 'Suresh Babu', text }, ...(x[d.id]?.calls || [])] } }))} />
    </div>
  );
}

function ReminderSheet({ list, onClose, onSent }) {
  const toast = useToast();
  const [channel, setChannel] = useState('WhatsApp');
  const [backup, setBackup] = useState(true);
  const [tpl, setTpl] = useState('Fee overdue');
  const [link, setLink] = useState(true);
  const [when, setWhen] = useState('now');
  if (!list) return null;
  const n = list.length;
  const first = list[0];
  const amt = list.reduce((a, d) => a + d.amount, 0);
  const credits = channel === 'WhatsApp' ? 4820 : 12400;
  const short = credits < n;
  const msg = tpl === 'Gentle reminder'
    ? `Dear ${first.s.father}, a gentle reminder that ${inr(first.amount)} is pending for ${first.s.name} (${clsOf(first.s)}). Please pay at your convenience.`
    : tpl === 'Final notice before late fee'
      ? `Dear ${first.s.father}, ${inr(first.amount)} for ${first.s.name} (${clsOf(first.s)}) is overdue since ${dlong(first.since)}. A late fee is added after 15 days.`
      : `Dear ${first.s.father}, fees of ${inr(first.amount)} for ${first.s.name} (${clsOf(first.s)}) are overdue since ${dlong(first.since)}.`;
  return (
    <Sheet open onClose={onClose} title={`Send fee reminder to ${n} ${n === 1 ? 'parent' : 'parents'}`} sub="Check the message, the count and the cost before sending" wide
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={I.Send} disabled={short} onClick={() => { onSent(list); onClose(); toast({ title: when === 'now' ? `Reminder sent to ${n} ${n === 1 ? 'parent' : 'parents'}` : `Reminder scheduled for ${n} ${n === 1 ? 'parent' : 'parents'}`, body: `${channel}${backup && channel === 'WhatsApp' ? ', with SMS backup' : ''} · ${n} credits used · saved in each student’s reminder history` }); }}>{when === 'now' ? `Send to ${n} ${n === 1 ? 'parent' : 'parents'}` : `Schedule for ${n} ${n === 1 ? 'parent' : 'parents'}`}</Button></>}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2">
          {[['Parents', n], ['Overdue', inrShort(amt)], ['Cost', `${n} credits`]].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-sunken/70 px-3 py-2.5"><p className="text-[12px] text-ink3 font-semibold">{k}</p><p className="font-display text-[19px] font-semibold tnum leading-tight">{v}</p></div>
          ))}
        </div>
        <div className="grid @md:grid-cols-2 gap-4">
          <Field label="Channel" id="rm-ch"><Segmented value={channel} onChange={setChannel} options={['WhatsApp', 'SMS']} className="w-full" /></Field>
          <Field label="Template" id="rm-tpl"><Select id="rm-tpl" value={tpl} onChange={setTpl} options={['Fee overdue', 'Gentle reminder', 'Final notice before late fee']} /></Field>
        </div>
        <div className="rounded-2xl border border-line divide-y divide-line/70">
          <SettingRow id="rm-link" title="Add the payment link" sub="Razorpay link for each family’s exact dues, valid 7 days. Parent Link shows a Pay button too."><Switch id="rm-link" on={link} onChange={setLink} label="Add the payment link" /></SettingRow>
          {channel === 'WhatsApp' && <SettingRow id="rm-sms" title="SMS backup" sub="Same message by SMS if WhatsApp is not delivered in 2 hours"><Switch id="rm-sms" on={backup} onChange={setBackup} label="SMS backup" /></SettingRow>}
          <SettingRow title="Send" sub={when === 'now' ? 'Goes out now' : 'Goes out Sat 10 Oct, 9:00 AM'}><Segmented size="sm" value={when} onChange={setWhen} options={[{ value: 'now', label: 'Now' }, { value: 'later', label: 'Tomorrow 9 AM' }]} /></SettingRow>
        </div>
        <div>
          <p className="text-[13px] font-semibold text-ink2 mb-1.5">Preview for {first.s.father}{n > 1 ? ` (1 of ${n})` : ''}</p>
          <div className="rounded-2xl bg-ok/8 border border-ok/20 p-3.5 text-[14px] leading-relaxed max-w-md">
            {msg} {link && <span className="text-info underline">rzp.io/l/sps-{first.s.adm.slice(-4)}</span>}
            <span className="block text-[12.5px] text-ink3 mt-1.5">Sunrise Public School, Kukatpally · 040 2305 1180</span>
          </div>
        </div>
        <Banner tone={short ? 'bad' : 'info'} title={short ? `This needs ${n} credits. You have ${credits}.` : `${n} ${channel} credits. You have ${credits.toLocaleString('en-IN')}.`}>
          {short ? 'Add credits in Settings, SMS, WhatsApp & Email, or choose another channel.' : `No parent on this list opted out of messages. ${backup && channel === 'WhatsApp' ? 'Backup SMS use SMS credits only when needed.' : ''}`}
        </Banner>
      </div>
    </Sheet>
  );
}

function HistorySheet({ d, rems, calls, onClose, onSend, onCall }) {
  const { go } = useNav();
  const { role } = useRole();
  const canEdit = useCanEdit();
  const [note, setNote] = useState('');
  if (!d) return null;
  return (
    <Sheet open onClose={onClose} title={d.s.name} sub={`${clsOf(d.s)} · ${d.s.father} · ${d.s.phone}`}>
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl bg-bad/8 px-4 py-3 flex items-center gap-3">
          <div className="min-w-0 flex-1"><p className="font-display text-[22px] font-semibold tnum text-bad leading-tight">{inr(d.amount)}</p><p className="text-[13px] text-ink2">{d.head} · since {dlong(d.since)} · {d.days} days</p></div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canEdit && canOpen(role, 'fees', 'collect') && <Button variant="primary" icon={I.IndianRupee} onClick={() => go('fees', { student: d.id })}>Collect fee</Button>}
          {canEdit && <Button variant="secondary" icon={I.Send} onClick={() => onSend(d)}>Send reminder</Button>}
          {canOpen(role, 'fees', 'ledger') && <Button variant="ghost" icon={I.BookOpen} onClick={() => go('fees', { page: 'ledger', id: d.id })}>Ledger</Button>}
        </div>
        <div>
          <p className="eyebrow text-ink3 mb-2">Reminder history</p>
          {rems.length === 0 ? <p className="text-[14px] text-ink3">No reminder yet. The automatic one goes 7 days after the due date.</p> : (
            <Timeline items={rems.map((r) => ({ icon: r.channel === 'SMS' ? 'MessageSquareText' : 'MessageCircle', tone: r.status.startsWith('Not') ? 'warn' : r.status === 'Read' ? 'ok' : 'info', what: `${r.template} · ${r.channel}`, when: `${r.when} · ${r.status}` }))} />
          )}
        </div>
        <div>
          <p className="eyebrow text-ink3 mb-2">Calls</p>
          {calls.length === 0 && <p className="text-[14px] text-ink3 mb-2">No calls noted.</p>}
          <ul className="flex flex-col gap-2 mb-3">
            {calls.map((c, i) => <li key={i} className="rounded-xl bg-sunken/70 p-3 text-[14px]"><p>{c.text}</p><p className="text-[12.5px] text-ink3 mt-0.5">{c.when} · {c.by}</p></li>)}
          </ul>
          {canEdit && (
            <div className="flex flex-col gap-2">
              <label htmlFor="call-note" className="text-[13px] font-semibold text-ink2">Add a call note</label>
              <Textarea id="call-note" value={note} onChange={setNote} rows={2} placeholder="Example: Called parent, promised by 15-10-2026" />
              <Button variant="secondary" className="self-start" disabled={!note.trim()} onClick={() => { onCall(d, note.trim()); setNote(''); }}>Save note</Button>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}

/* =========================================================================================
   Fee Structure
   ========================================================================================= */
const FREQS = ['Monthly', 'Quarterly', 'Half-yearly', 'Term', 'Yearly', 'One-time'];
const FREQ_MONTHS = { Monthly: [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2], Quarterly: [3, 6, 9, 0], 'Half-yearly': [3, 9], Term: [5, 9, 0], Yearly: [3], 'One-time': [3] };
function makeInst(freq, total, y0, futureOnly) {
  let list = FREQ_MONTHS[freq].map((m) => ({ m, y: m >= 3 ? y0 : y0 + 1 }));
  if (futureOnly) list = list.filter((x) => x.y * 12 + x.m >= 2026 * 12 + 10);
  if (!list.length) list = [{ m: 10, y: 2026 }];
  const each = Math.floor(total / list.length / 100) * 100;
  return list.map((x, i) => ({ date: `10-${String(x.m + 1).padStart(2, '0')}-${x.y}`, amt: String(i === list.length - 1 ? total - each * (list.length - 1) : each) }));
}

function Structure() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const { role } = useRole();
  const [year, setYear] = useState('2026–27');
  const [open, setOpen] = useState(null);
  const [addRow, setAddRow] = useState(null);
  const [addHead, setAddHead] = useState(false);
  const [change, setChange] = useState(null);
  const [pending, setPending] = useState('waiting');
  const draft = year === '2027–28';
  const cur = open ? CLASSES.find((c) => c.id === open) : null;
  const approver = role.id === 'principal' || role.id === 'schooladmin';

  return (
    <div>
      <ModuleHead title="Fees" sub={draft ? '2027–28 · Version 4, a draft with tuition +5% · not published' : '2026–27 · Version 3, in use since 1 Apr 2026 · taxable heads include GST'}
        actions={canEdit && <><Button variant="secondary" icon={I.Plus} onClick={() => setAddHead(true)}>Add fee head</Button>{!draft && <Button variant="primary" icon={I.CopyPlus} onClick={() => { setYear('2027–28'); toast({ title: '2027–28 draft opened', body: 'Copied from 2026–27 with tuition +5%. Nothing changes for this year.', tone: 'info' }); }}>Prepare 2027–28</Button>}</>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <div className="flex flex-col @md:flex-row @md:items-center gap-3">
          <Segmented value={year} onChange={setYear} options={[{ value: '2026–27', label: '2026–27 · in use' }, { value: '2027–28', label: '2027–28 · draft' }]} />
          <p className="text-[13px] text-ink3 @md:ml-2">{draft ? 'Changes here apply from 1 Apr 2027 and need no approval until you publish.' : 'This year has started. Changes need the Principal’s approval and touch only unpaid installments.'}</p>
        </div>
        {!draft && (
          <Banner tone="warn" icon={I.Lock} title="Mid-year changes need approval."
            action={canEdit && <Button size="sm" variant="secondary" onClick={() => setYear('2027–28')}>Change 2027–28</Button>}>
            Paid rows never change. Unpaid installments change only after the Principal approves. Most changes are better made for next year.
          </Banner>
        )}

        <div className="grid @md:grid-cols-2 @xl:grid-cols-3 gap-4">
          {CLASSES.map((c) => {
            const rows = structureFor(c, year);
            const yearly = rows.filter((r) => r.head !== 'Admission fee').reduce((a, r) => a + r.amount, 0);
            return (
              <Card key={c.id} as="button" onClick={() => setOpen(c.id)} className="text-left p-4 hover:border-brand/40 transition group">
                <div className="flex items-start gap-3">
                  <span className="w-10 h-10 rounded-xl bg-brand/10 text-brand grid place-items-center shrink-0"><I.GraduationCap size={19} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[15px] leading-tight">{c.name}</p>
                    <p className="text-[12.5px] text-ink3">{STRENGTH[c.id]} students · {c.sections.length} {c.sections.length === 1 ? 'section' : 'sections'} · {rows.length} of {FEE_HEADS.length} heads set</p>
                  </div>
                  <I.ChevronRight size={18} className="text-ink3 group-hover:translate-x-0.5 transition" />
                </div>
                <ul className="mt-3 flex flex-col gap-1.5 text-[13.5px]">
                  {rows.map((r) => (
                    <li key={r.head} className="flex items-center gap-2"><span className="flex-1 min-w-0 truncate text-ink2">{r.head} <span className="text-ink3">· {r.freq}</span></span><span className="tnum font-medium">{inr(r.amount)}</span></li>
                  ))}
                </ul>
                <div className="mt-3 pt-3 border-t border-line/70 flex items-center justify-between text-[13.5px]">
                  <span className="text-ink3">Year, per student</span><b className="font-semibold tnum">{inr(yearly)}</b>
                </div>
              </Card>
            );
          })}
        </div>

        <Split>
          <Card className="overflow-hidden">
            <CardHead title="Fee heads" sub={`${FEE_HEADS.length} heads · taxable ones show their GST rate`} icon={I.Tags}
              action={canEdit && <Button size="sm" variant="soft" icon={I.Plus} onClick={() => setAddHead(true)}>Add</Button>} />
            <DataList rows={FEE_HEADS} rowKey={(h) => h.name} minWidth={640} footer={false}
              onRow={canEdit ? (h) => toast({ title: `Edit ${h.name}`, body: 'Name, GST and bank account. Rows already paid keep their old values.', tone: 'info' }) : undefined}
              columns={[
                { key: 'name', label: 'Fee head', render: (h) => <><p className="font-semibold leading-tight">{h.name}</p><p className="text-[12.5px] text-ink3">{h.used}</p></> },
                { key: 'freq', label: 'Usually', nowrap: true, render: (h) => <span className="text-[13px] text-ink2">{h.freq}</span> },
                { key: 'gst', label: 'GST', render: (h) => h.rate ? <><Pill tone="info">GST {h.rate}%</Pill><span className="block text-[12px] text-ink3 mt-0.5">{h.code}</span></> : <><Pill>Exempt</Pill>{h.note && <span className="block text-[12px] text-ink3 mt-0.5">{h.note}</span>}</> },
                { key: 'acct', label: 'Bank account', render: (h) => <span className="text-[13px]">{h.acct}</span> },
              ]}
              mobile={(h) => ({ title: h.name, sub: `${h.freq} · ${h.acct}`, icon: h.rate ? 'Percent' : 'Tag', iconTone: h.rate ? 'info' : 'neutral', right: h.rate ? <Pill tone="info">GST {h.rate}%</Pill> : <Pill>Exempt</Pill> })} />
          </Card>
          <Col>
            <Card>
              <CardHead title="Waiting for approval" sub="Mid-year change" icon={I.Hourglass} />
              <div className="px-5 pb-5">
                <p className="font-semibold text-[14.5px]">Lab fee ₹3,000 for Classes 9 and 10</p>
                <p className="text-[13px] text-ink3 mt-0.5">From Nov 2026 · 230 students’ unpaid installments · raised by Suresh Babu on 7 Oct</p>
                {pending === 'waiting' ? (
                  approver && canEdit ? (
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" variant="soft" icon={I.Check} onClick={() => { setPending('approved'); toast({ title: 'Lab fee approved', body: 'Version 3.1 published. 230 students get the new row from Nov 2026. Paid rows unchanged.', undo: () => setPending('waiting') }); }}>Approve</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setPending('declined'); toast({ title: 'Lab fee declined', body: 'Suresh Babu sees your reason. You can add it for 2027–28 instead.', undo: () => setPending('waiting') }); }}>Decline</Button>
                    </div>
                  ) : <Pill tone="warn" className="mt-3">Waiting for Lakshmi Rao</Pill>
                ) : <Pill tone={pending === 'approved' ? 'ok' : 'neutral'} className="mt-3">{pending === 'approved' ? 'Approved · version 3.1' : 'Declined'}</Pill>}
              </div>
            </Card>
            <Card>
              <CardHead title="Versions" icon={I.History} />
              <div className="px-5 pb-1">
                <Timeline items={[
                  { icon: 'FilePen', tone: 'info', what: 'Version 4 for 2027–28 (draft): tuition +5%', when: 'Started 9 Oct 2026 · Suresh Babu' },
                  { icon: 'CircleCheck', tone: 'ok', what: 'Version 3 in use: tuition +6% over 2025–26', when: 'Published 12 Mar 2026 · approved by Lakshmi Rao' },
                  { icon: 'Archive', what: 'Version 2 (2025–26), closed', when: 'Read-only' },
                ]} />
              </div>
            </Card>
            <Card>
              <CardHead title="Fees by student category" icon={I.Users} />
              <ul className="px-5 pb-4 flex flex-col text-[14px]">
                {[['General', '1,184 students', 'Class fees'], ['RTE, Section 12(1)(c)', '38 students', '₹0 · claimed from the Telangana government'], ['Staff children', '14 students', '50% off tuition by rule']].map(([k, n, v]) => (
                  <li key={k} className="flex items-start gap-3 py-2 border-t border-line/70 first:border-0"><span className="flex-1 min-w-0"><b className="font-semibold block">{k}</b><span className="text-[12.5px] text-ink3">{v}</span></span><span className="text-[13px] text-ink2 tnum">{n}</span></li>
                ))}
              </ul>
            </Card>
          </Col>
        </Split>
      </div>

      {/* One class: rows and installments */}
      <Sheet open={!!cur} onClose={() => setOpen(null)} wide title={cur ? `${cur.name} · ${year}` : ''} sub={cur ? `${STRENGTH[cur.id]} students · installments add up to each row’s total` : ''}>
        {cur && (
          <div className="flex flex-col gap-4">
            {structureFor(cur, year).map((r) => (
              <div key={r.head} className="rounded-2xl border border-line p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1"><p className="font-semibold text-[15px]">{r.head}</p><p className="text-[12.5px] text-ink3">{r.freq} · {r.inst.length} {r.inst.length === 1 ? 'installment' : 'installments'}</p></div>
                  <p className="font-semibold tnum text-[15px]">{inr(r.amount)}</p>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  {r.inst.map(([dt, a]) => <span key={dt} className="h-8 px-3 rounded-lg bg-sunken text-[13px] inline-flex items-center gap-2 tnum"><span className="text-ink3">{dt}</span><b className="font-semibold">{inr(a)}</b></span>)}
                </div>
                <p className="text-[12.5px] text-ok mt-2 flex items-center gap-1.5"><I.CircleCheck size={14} />Adds up to {inr(r.amount)}</p>
              </div>
            ))}
            <p className="text-[13px] text-ink3">Transport, hostel and store items (uniform and books, with GST) are charged from their own modules.</p>
            {canEdit && (
              <div className="flex gap-2 flex-wrap">
                <Button variant="primary" icon={I.Plus} onClick={() => setAddRow(cur.id)}>Add fee row</Button>
                <Button variant="secondary" icon={I.Pencil} onClick={() => setChange(cur.id)}>Change amounts</Button>
                <Button variant="ghost" icon={I.Copy} onClick={() => toast({ title: `Copy ${cur.name} to other classes`, body: 'Pick the classes. Each gets its own copy you can change.', tone: 'info' })}>Copy to classes</Button>
              </div>
            )}
          </div>
        )}
      </Sheet>
      <AddRowSheet clsId={addRow} year={year} onClose={() => setAddRow(null)} />
      <ChangeSheet clsId={change} year={year} onClose={() => setChange(null)} />
      <AddHeadSheet open={addHead} onClose={() => setAddHead(false)} />
    </div>
  );
}

function AddRowSheet({ clsId, year, onClose }) {
  const toast = useToast();
  const draft = year === '2027–28';
  const [head, setHead] = useState('Lab fee');
  const [amount, setAmount] = useState('3000');
  const [freq, setFreq] = useState('Yearly');
  const [inst, setInst] = useState(() => makeInst('Yearly', 3000, draft ? 2027 : 2026, !draft));
  const [tried, setTried] = useState(false);
  if (!clsId) return null;
  const c = CLASSES.find((x) => x.id === clsId);
  const total = Number(amount.replace(/\D/g, '')) || 0;
  const sum = inst.reduce((a, x) => a + (Number(x.amt.replace(/\D/g, '')) || 0), 0);
  const regen = (f, t) => setInst(makeInst(f, t, draft ? 2027 : 2026, !draft));
  const err = !total ? 'Enter the amount' : sum !== total ? `Installments add up to ${inr(sum)}. Total is ${inr(total)}.` : '';
  return (
    <Sheet open onClose={onClose} title={`Add fee row · ${c.name}`} sub={draft ? 'For 2027–28. No approval needed until you publish.' : 'For 2026–27. Goes to the Principal for approval.'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={I.Check} onClick={() => { setTried(true); if (err) return; onClose(); toast({ title: draft ? `${head} added to ${c.name} (2027–28 draft)` : `Sent to Lakshmi Rao for approval`, body: draft ? `${inr(total)} in ${inst.length} installments` : `${head} ${inr(total)} for ${c.name} from Nov 2026 · ${STRENGTH[c.id]} students` }); }}>{draft ? 'Add row' : 'Send for approval'}</Button></>}>
      <div className="flex flex-col gap-4">
        <Field label="Fee head" required id="ar-head"><Select id="ar-head" value={head} onChange={setHead} options={FEE_HEADS.map((h) => h.name)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount for the year" required id="ar-amt" error={tried && !total && 'Enter the amount'}>
            <Input id="ar-amt" inputMode="numeric" value={amount} onChange={(e) => { setAmount(e.target.value); regen(freq, Number(e.target.value.replace(/\D/g, '')) || 0); }} className="tnum" />
          </Field>
          <Field label="Frequency" required id="ar-freq"><Select id="ar-freq" value={freq} onChange={(f) => { setFreq(f); regen(f, total); }} options={FREQS} /></Field>
        </div>
        <div>
          <p className="text-[13px] font-semibold text-ink2 mb-1.5">Installments <span className="font-normal text-ink3">· due on the 10th, change any date or amount</span></p>
          <ul className="flex flex-col gap-2">
            {inst.map((x, i) => (
              <li key={i} className="grid grid-cols-[1fr_1fr] gap-2">
                <Input aria-label={`Installment ${i + 1} date`} value={x.date} onChange={(e) => setInst(inst.map((y, j) => (j === i ? { ...y, date: e.target.value } : y)))} className="tnum" />
                <Input aria-label={`Installment ${i + 1} amount`} inputMode="numeric" value={x.amt} onChange={(e) => setInst(inst.map((y, j) => (j === i ? { ...y, amt: e.target.value } : y)))} className="tnum" />
              </li>
            ))}
          </ul>
          <p className={cx('text-[12.5px] mt-2 flex items-center gap-1.5', err && tried ? 'text-bad' : sum === total && total ? 'text-ok' : 'text-ink3')} role={err && tried ? 'alert' : undefined}>
            {sum === total && total ? <><I.CircleCheck size={14} />Adds up to {inr(total)}</> : <><I.CircleAlert size={14} />Installments add up to {inr(sum)}. Total is {inr(total)}.</>}
          </p>
        </div>
        <Field label="Applies to" id="ar-to"><Select id="ar-to" value="class" onChange={() => {}} options={[{ value: 'class', label: `${c.name}, all ${STRENGTH[c.id]} students` }, { value: 'several', label: 'Several classes' }, { value: 'one', label: 'One student (needs a reason)' }]} /></Field>
      </div>
    </Sheet>
  );
}

function ChangeSheet({ clsId, year, onClose }) {
  const toast = useToast();
  const { role } = useRole();
  const [when, setWhen] = useState(year === '2027–28' ? 'next' : 'next');
  const [amt, setAmt] = useState('');
  const [why, setWhy] = useState('');
  const [tried, setTried] = useState(false);
  if (!clsId) return null;
  const c = CLASSES.find((x) => x.id === clsId);
  const tu = TUITION[c.id];
  const now = when === 'now';
  const isPrincipal = role.id === 'principal';
  const n = STRENGTH[c.id];
  return (
    <Sheet open onClose={onClose} title={`Change tuition fee · ${c.name}`} sub={`Now ${inr(tu)} a year, 4 installments of ${inr(tu / 4)}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { setTried(true); if (!amt || (now && !why.trim())) return; onClose(); toast({ title: !now ? `Saved in the 2027–28 draft` : isPrincipal ? `Version 3.1 published for ${c.name}` : 'Sent to Lakshmi Rao for approval', body: !now ? 'Applies from 1 Apr 2027. This year is not touched.' : `${n} students’ unpaid installments from Nov 2026. Paid rows do not change.` }); }}>{!now ? 'Save for 2027–28' : isPrincipal ? `Update ${n} students` : 'Send for approval'}</Button></>}>
      <div className="flex flex-col gap-4">
        <Field label="When does this change apply?" id="ch-when">
          <div className="grid gap-2">
            {[['next', 'From 2027–28', 'Next year’s structure. No approval needed now.'], ['now', 'Now, in 2026–27', 'Only unpaid installments from Nov 2026 change. Needs the Principal’s approval.']].map(([v, l, sub]) => (
              <button key={v} type="button" onClick={() => setWhen(v)} aria-pressed={when === v} className={cx('flex items-start gap-3 p-3 rounded-xl border text-left transition', when === v ? 'border-brand ring-1 ring-brand bg-brand/5' : 'border-line hover:bg-sunken')}>
                <span className={cx('mt-0.5 w-4 h-4 rounded-full border-2 shrink-0', when === v ? 'border-brand bg-brand' : 'border-line')} />
                <span><b className="block font-semibold text-[14.5px]">{l}</b><span className="text-[12.5px] text-ink3">{sub}</span></span>
              </button>
            ))}
          </div>
        </Field>
        <Field label="New tuition fee for the year" required id="ch-amt" error={tried && !amt && 'Enter the new amount'}>
          <Input id="ch-amt" inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder={String(Math.round((tu * 1.05) / 400) * 400)} className="tnum" error={tried && !amt} />
        </Field>
        {now && <>
          <Banner tone="warn" title={`This updates ${n} students’ unpaid installments from Nov 2026.`}>Paid rows are not changed. Parents are told before the next invoice.</Banner>
          <Field label="Reason" required id="ch-why" error={tried && !why.trim() && 'Say why it changes mid-year'}><Textarea id="ch-why" value={why} onChange={setWhy} rows={2} placeholder="Example: new smart classrooms from November" /></Field>
        </>}
      </div>
    </Sheet>
  );
}

function AddHeadSheet({ open, onClose }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [taxable, setTaxable] = useState(false);
  const [rate, setRate] = useState('18');
  const [tried, setTried] = useState(false);
  return (
    <FormSheet open={open} onClose={() => { onClose(); setName(''); setTried(false); }} title="Add fee head" sub="Then add it to the classes that pay it" submitLabel="Add fee head"
      onSubmit={() => { setTried(true); if (!name.trim()) return false; toast({ title: `${name.trim()} added`, body: taxable ? `GST ${rate}% · tax invoices made with each receipt` : 'Exempt from GST' }); setName(''); }}>
      <Field label="Name" required id="fh-name" error={tried && !name.trim() && 'Give the fee head a name'}><Input id="fh-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Example: Robotics club" error={tried && !name.trim()} /></Field>
      <div className="rounded-xl border border-line"><SettingRow id="fh-tax" title="Taxable (GST)" sub={`Uses the school’s GSTIN ${GSTIN} from School Profile`}><Switch id="fh-tax" on={taxable} onChange={setTaxable} label="Taxable" /></SettingRow></div>
      {taxable && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="GST rate" required id="fh-rate"><Select id="fh-rate" value={rate} onChange={setRate} options={[{ value: '5', label: '5%' }, { value: '12', label: '12%' }, { value: '18', label: '18%' }]} /></Field>
          <Field label="SAC or HSN code" id="fh-sac" hint="Printed on the tax invoice"><Input id="fh-sac" placeholder="9992" /></Field>
        </div>
      )}
      <Field label="Bank account" id="fh-acct" hint="Fees into different bank accounts is on"><Select id="fh-acct" value="School account" onChange={() => {}} options={Object.keys(ACCOUNTS)} /></Field>
    </FormSheet>
  );
}

/* =========================================================================================
   Concessions & Refunds
   ========================================================================================= */
const C_TONE = { Waiting: 'warn', Approved: 'info', Rejected: 'bad', Applied: 'ok', Refunded: 'ok' };
function Concessions() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const { role } = useRole();
  const [tab, setTab] = useState('concessions');
  const [list, setList] = useState(CONCESSIONS);
  const [refunds, setRefunds] = useState(REFUNDS);
  const [rules, setRules] = useState(BULK_RULES);
  const [newC, setNewC] = useState(false);
  const [newR, setNewR] = useState(false);
  const [markR, setMarkR] = useState(null);
  const [q, setQ] = useState('');
  const [st, setSt] = useState('all');
  const [per, setPer] = useState(PERIODS.finyear);
  const approver = (role.id === 'principal' || role.id === 'schooladmin') && canEdit;
  const inP = (c) => inPeriod(isoOf(c.date), per);
  const decide = (id, ok, setter) => {
    setter((x) => x.map((c) => (c.id === id ? { ...c, status: ok ? (setter === setList ? 'Applied' : 'Approved') : 'Rejected', appr: role.person.name } : c)));
    toast({ title: ok ? 'Approved' : 'Declined', body: ok ? 'Applied to the student’s dues now. Suresh Babu is told.' : 'Suresh Babu sees your reason.', undo: () => setter((x) => x.map((c) => (c.id === id ? { ...c, status: 'Waiting', appr: null } : c))) });
  };
  const t = q.trim().toLowerCase();
  const cRows = list.filter((c) => inP(c) && (st === 'all' || c.status === st) && (!t || c.name.toLowerCase().includes(t) || c.type.toLowerCase().includes(t)));
  const rRows = refunds.filter((r) => inP(r) && (!t || r.name.toLowerCase().includes(t)));
  const rDone = refunds.filter((r) => r.status === 'Refunded' && inP(r));
  const share = fyShare(per);
  const waitingC = list.filter((c) => c.status === 'Waiting').length;
  const waitingR = refunds.filter((r) => r.status === 'Waiting').length;
  const DecideBtns = ({ c, setter }) => c.status !== 'Waiting' ? null : (approver && c.by !== role.person.name
    ? <div className="flex gap-1.5"><Button size="sm" variant="soft" icon={I.Check} onClick={(e) => { e.stopPropagation(); decide(c.id, true, setter); }}>Approve</Button><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); decide(c.id, false, setter); }}>Decline</Button></div>
    : <span className="text-[12.5px] text-ink3">Waiting for Lakshmi Rao</span>);

  return (
    <div>
      <ModuleHead title="Fees" sub="Discounts, scholarships and refunds, each with a reason and who approved it"
        actions={canEdit && <><Button variant="secondary" icon={I.Undo2} onClick={() => setNewR(true)}>New refund</Button><Button variant="primary" icon={I.BadgePercent} onClick={() => setNewC(true)}>New concession</Button></>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Stats items={[
          { label: `Concessions · ${per.label}`, value: inrShort(Math.round(4107950 * Math.min(1, share))), sub: `${Math.round(449 * Math.min(1, share))} concessions, RTE included`, icon: 'BadgePercent' },
          { label: 'Waiting for approval', value: waitingC + waitingR, sub: `${waitingC} concessions · ${waitingR} refund`, tone: waitingC + waitingR ? 'warn' : 'ok', icon: 'Hourglass', onClick: () => { setTab('concessions'); setSt('Waiting'); } },
          { label: `Refunds · ${per.label}`, value: inr(rDone.reduce((a, r) => a + r.amt, 0)), sub: `${rDone.length} paid back`, icon: 'Undo2', onClick: () => setTab('refunds') },
          { label: 'RTE students', value: '38', sub: 'Fee ₹0 · claimed from the government', icon: 'Scale' },
        ]} />
        <Banner tone="info" icon={I.ShieldCheck} title="Limits from Forms & Approvals:">
          concessions above ₹1,000 and every refund go to the Principal. Smaller concessions apply at once. Nobody approves their own request.
        </Banner>

        <Card className="overflow-hidden">
          <Tabs className="px-3" value={tab} onChange={setTab} tabs={[
            { id: 'concessions', label: 'Concessions', count: list.length }, { id: 'bulk', label: 'Bulk discounts', count: rules.length },
            { id: 'scholarships', label: 'Scholarships', count: SCHOLAR_APPS.length }, { id: 'refunds', label: 'Refunds', count: refunds.length },
          ]} />

          {(tab === 'concessions' || tab === 'refunds') && <p className="px-5 pt-3 text-[13px] text-ink3 tnum">Showing {per.label.toLowerCase()} · {fmtRange(per)}</p>}
          {tab === 'concessions' && <>
            <Toolbar>
              <SearchBox id="con-q" value={q} onChange={setQ} placeholder="Student or type" />
              <DatePeriod id="con-per" value={per} onChange={setPer} className="w-full @md:w-auto" />
              <Segmented value={st} onChange={setSt} options={[{ value: 'all', label: 'All' }, 'Waiting', 'Applied', 'Rejected']} className="overflow-x-auto no-scrollbar" />
            </Toolbar>
            <DataList rows={cRows} minWidth={960} footer={`Showing ${cRows.length} of ${list.length}`}
              empty={<Empty icon={I.SearchX} title="No concessions here" body={`None asked in ${fmtRange(per)} with these filters.`} action={<Button variant="secondary" onClick={() => { setQ(''); setSt('all'); setPer(PERIODS.finyear); }}>Clear filters</Button>} />}
              columns={[
                { key: 'name', label: 'Student', render: (c) => <><p className="font-semibold leading-tight">{c.name}</p><p className="text-[12.5px] text-ink3">{c.cls} · {c.date}</p></> },
                { key: 'type', label: 'Type', nowrap: true, render: (c) => c.type },
                { key: 'amt', label: 'Amount or %', align: 'right', render: (c) => <b className="font-semibold">{c.amt}</b> },
                { key: 'heads', label: 'Fee heads', render: (c) => <span className="text-[13px] text-ink2">{c.heads}</span> },
                { key: 'reason', label: 'Reason', render: (c) => <span className="text-[13px] text-ink2 block max-w-[220px]">{c.reason}{c.note && <span className="block text-ink3">{c.note}</span>}</span> },
                { key: 'by', label: 'Asked by', nowrap: true, render: (c) => <span className="text-[13px]">{c.by}</span> },
                { key: 'appr', label: 'Approved by', render: (c) => <span className="text-[13px] text-ink2">{c.appr || '—'}</span> },
                { key: 'status', label: 'Status', render: (c) => <div className="flex flex-col items-start gap-1.5"><Pill tone={C_TONE[c.status]}>{c.status}</Pill><DecideBtns c={c} setter={setList} /></div> },
              ]}
              mobile={(c) => ({ title: c.name, sub: `${c.type} · ${c.amt} · ${c.heads}`, icon: 'BadgePercent', iconTone: C_TONE[c.status], pills: [<Pill key="s" tone={C_TONE[c.status]} className="!h-[22px] !text-[11.5px]">{c.status}</Pill>, c.status === 'Waiting' && <DecideBtns key="d" c={c} setter={setList} />] })} />
          </>}

          {tab === 'bulk' && (
            <div>
              <ul className="divide-y divide-line/70">
                {rules.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-5 py-3.5">
                    <span className="w-10 h-10 rounded-xl bg-brand/10 text-brand grid place-items-center shrink-0"><I.Gift size={18} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[14.5px] leading-snug">{r.title}</p>
                      <p className="text-[12.5px] text-ink3">{r.sub} · {r.used}</p>
                    </div>
                    {!canEdit ? <Pill tone={r.on ? 'ok' : 'neutral'}>{r.on ? 'On' : 'Off'}</Pill> : <Switch on={r.on} label={r.title} onChange={(v) => { setRules(rules.map((x) => (x.id === r.id ? { ...x, on: v } : x))); toast({ title: `${r.title.split(':')[0]}: ${v ? 'on' : 'off'}`, body: 'Applies to payments from now. Logged in the audit log.', undo: () => setRules((rs) => rs.map((x) => (x.id === r.id ? { ...x, on: !v } : x))) }); }} />}
                  </li>
                ))}
              </ul>
              {canEdit && <div className="px-5 py-4 border-t border-line"><Button variant="secondary" icon={I.Plus} onClick={() => toast({ title: 'New discount rule', body: 'Example: pay 3 months, get 5% off. Applied by itself at Collect Fee.', tone: 'info' })}>Add a rule</Button></div>}
            </div>
          )}

          {tab === 'scholarships' && (
            <div className="grid @xl:grid-cols-2 gap-px bg-line/70">
              <div className="bg-surface">
                <p className="eyebrow text-ink3 px-5 pt-4 pb-1">Scholarship types</p>
                <ul className="px-5 pb-4">
                  {SCHOLAR_TYPES.map((s) => (
                    <li key={s.name} className="flex items-start gap-3 py-2.5 border-t border-line/70 first:border-0">
                      <span className="w-9 h-9 rounded-xl bg-sunken text-ink2 grid place-items-center shrink-0"><I.Award size={17} /></span>
                      <span className="flex-1 min-w-0"><b className="font-semibold text-[14.5px] block">{s.name}</b><span className="text-[12.5px] text-ink3">{s.rule}</span></span>
                      <span className="text-right text-[13px] tnum shrink-0"><b className="font-semibold block">{s.n} students</b><span className="text-ink3">{inr(s.total)}</span></span>
                    </li>
                  ))}
                </ul>
                <p className="px-5 pb-4 text-[12.5px] text-ink3 flex gap-1.5"><I.BellRing size={14} className="shrink-0 mt-0.5" />Renewal reminders go to families on 1 Mar 2027, before 2027–28 starts.</p>
              </div>
              <div className="bg-surface">
                <p className="eyebrow text-ink3 px-5 pt-4 pb-1">Applications</p>
                <ul className="px-5 pb-4">
                  {SCHOLAR_APPS.map((a) => (
                    <li key={a.name} className="py-2.5 border-t border-line/70 first:border-0">
                      <div className="flex items-start gap-3">
                        <Avatar name={a.name} size={36} />
                        <span className="flex-1 min-w-0"><b className="font-semibold text-[14.5px] block">{a.name} <span className="text-ink3 font-normal">· {a.cls}</span></b><span className="text-[12.5px] text-ink3">{a.type} · asks {a.asked}</span><span className="text-[12.5px] text-ink3 flex items-center gap-1 mt-0.5"><I.Paperclip size={13} />{a.docs}</span></span>
                        <Pill tone={C_TONE[a.status]}>{a.status}</Pill>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {tab === 'refunds' && <>
            <Toolbar>
              <SearchBox id="ref-q" value={q} onChange={setQ} placeholder="Student" />
              <DatePeriod id="ref-per" value={per} onChange={setPer} className="w-full @md:w-auto" />
            </Toolbar>
            <DataList rows={rRows} minWidth={900} footer={`${rRows.length} of ${refunds.length} refunds · never more than was paid`}
              empty={<Empty icon={I.SearchX} title="No refunds here" body={`None asked in ${fmtRange(per)}.`} action={<Button variant="secondary" onClick={() => { setQ(''); setPer(PERIODS.finyear); }}>Clear filters</Button>} />}
              columns={[
                { key: 'name', label: 'Student', render: (r) => <><p className="font-semibold leading-tight">{r.name}</p><p className="text-[12.5px] text-ink3">{r.cls} · {r.date}</p></> },
                { key: 'rcpt', label: 'Payment', render: (r) => <><p className="font-mono text-[12.5px]">{r.rcpt}</p><p className="text-[12px] text-ink3">{inr(r.paid)} paid</p></> },
                { key: 'amt', label: 'Refund', align: 'right', render: (r) => <b className="font-semibold">{inr(r.amt)}</b> },
                { key: 'reason', label: 'Reason', render: (r) => <span className="text-[13px] text-ink2 block max-w-[240px]">{r.reason}{r.note && <span className="block text-ink3">{r.note}</span>}</span> },
                { key: 'mode', label: 'Mode', render: (r) => <span className="text-[13px]">{r.mode}{r.ref && <span className="block text-[12px] text-ink3 font-mono">{r.ref}</span>}</span> },
                { key: 'status', label: 'Status', render: (r) => <div className="flex flex-col items-start gap-1.5"><Pill tone={C_TONE[r.status]}>{r.status}</Pill><DecideBtns c={r} setter={setRefunds} />{r.status === 'Approved' && canEdit && <Button size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); setMarkR(r); }}>Mark refunded</Button>}</div> },
              ]}
              mobile={(r) => ({ title: r.name, sub: `${inr(r.amt)} of ${inr(r.paid)} · ${r.rcpt}`, icon: 'Undo2', iconTone: C_TONE[r.status], pills: [<Pill key="s" tone={C_TONE[r.status]} className="!h-[22px] !text-[11.5px]">{r.status}</Pill>, r.status === 'Approved' && canEdit && <Button key="m" size="sm" variant="secondary" onClick={() => setMarkR(r)}>Mark refunded</Button>, r.status === 'Waiting' && <DecideBtns key="d" c={r} setter={setRefunds} />] })} />
          </>}
        </Card>
      </div>

      <NewConcessionSheet open={newC} onClose={() => setNewC(false)} onAdd={(c) => setList((x) => [c, ...x])} />
      <NewRefundSheet open={newR} onClose={() => setNewR(false)} onAdd={(r) => { setRefunds((x) => [r, ...x]); setTab('refunds'); }} />
      <FormSheet open={!!markR} onClose={() => setMarkR(null)} title="Mark refunded" sub={markR ? `${inr(markR.amt)} to ${markR.name}. The Day Book records it as money out on this date.` : ''} submitLabel="Mark refunded"
        onSubmit={() => { const r = markR; setRefunds((x) => x.map((y) => (y.id === r.id ? { ...y, status: 'Refunded', ref: 'UPI ref 428391556120' } : y))); toast({ title: `Refund of ${inr(r.amt)} recorded`, body: 'Day Book money-out entry added for 9 Oct. Parent told on WhatsApp.' }); }}>
        <Field label="Date paid" required id="mr-date" hint="DD-MM-YYYY"><Input id="mr-date" defaultValue="09-10-2026" className="tnum" /></Field>
        <Field label="Reference" required id="mr-ref" hint="UTR, cheque number or cash voucher"><Input id="mr-ref" defaultValue="428391556120" className="font-mono" /></Field>
      </FormSheet>
    </div>
  );
}

function NewConcessionSheet({ open, onClose, onAdd }) {
  const toast = useToast();
  const { role } = useRole();
  const [sid, setSid] = useState(FEATURED.id);
  const [type, setType] = useState('Discount');
  const [unit, setUnit] = useState('₹');
  const [amt, setAmt] = useState('');
  const [heads, setHeads] = useState(new Set(['Tuition fee']));
  const [period, setPeriod] = useState('Rest of this year');
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const s = byId(sid);
  const v = Number(amt.replace(/\D/g, '')) || 0;
  const money = unit === '₹' ? v : Math.round((TUITION[s.clsId] * v) / 100);
  const needsOk = money > 1000;
  const err = { amt: !v ? 'Enter the amount or %' : unit === '%' && v > 100 ? 'Cannot be more than 100%' : '', reason: !reason.trim() ? 'Say why. It is printed on the approval and kept in the audit log.' : '', heads: heads.size ? '' : 'Pick at least one fee head' };
  const toggle = (h) => setHeads((x) => { const n = new Set(x); n.has(h) ? n.delete(h) : n.add(h); return n; });
  return (
    <FormSheet open={open} onClose={() => { onClose(); setTried(false); setAmt(''); setReason(''); }} title="New concession" sub="Amount or percentage off one student’s fees" submitLabel={needsOk ? 'Send for approval' : 'Apply concession'}
      onSubmit={() => {
        setTried(true);
        if (err.amt || err.reason || err.heads) return false;
        onAdd({ id: 'n' + Date.now(), sid, name: s.name, cls: clsOf(s), type, amt: unit === '₹' ? inr(v) : `${v}%`, heads: [...heads].join(', '), reason: reason.trim(), by: role.person.name, appr: needsOk ? null : 'Within the accountant’s limit', status: needsOk ? 'Waiting' : 'Applied', date: '9 Oct' });
        toast({ title: needsOk ? `Sent to ${role.id === 'principal' ? 'Anita Sharma (School Admin)' : 'Lakshmi Rao'} for approval` : `Concession applied for ${s.name}`, body: needsOk ? `${unit === '₹' ? inr(v) : `${v}% (about ${inr(money)})`} is above ₹1,000` : 'The dues are lower from now. Shown on the next receipt.' });
        setAmt(''); setReason(''); setTried(false);
      }}>
      <Field label="Student" required id="nc-s"><Select id="nc-s" value={sid} onChange={setSid} options={STUDENTS.map((x) => ({ value: x.id, label: `${x.name} · ${clsOf(x)}` }))} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type" required id="nc-type"><Select id="nc-type" value={type} onChange={setType} options={['Discount', 'Scholarship', 'Sibling', 'Staff child', 'Late fee waiver', 'RTE']} /></Field>
        <Field label="Period" required id="nc-per"><Select id="nc-per" value={period} onChange={setPeriod} options={['Rest of this year', 'Q3 only', 'Whole year']} /></Field>
      </div>
      <Field label="Amount or %" required id="nc-amt" error={tried && err.amt} hint={v ? (needsOk ? `About ${inr(money)}: above ₹1,000, so the Principal decides` : 'Up to ₹1,000 applies at once') : undefined}>
        <div className="flex gap-2"><Segmented value={unit} onChange={setUnit} options={['₹', '%']} /><Input id="nc-amt" inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} error={tried && err.amt} className="tnum" placeholder={unit === '₹' ? '2,000' : '10'} /></div>
      </Field>
      <Field label="Fee heads" required error={tried && err.heads}>
        <div className="flex flex-wrap gap-2">
          {['Tuition fee', 'Transport fee', 'Exam fee', 'Hostel fee', 'Late fee'].map((h) => (
            <button key={h} type="button" onClick={() => toggle(h)} aria-pressed={heads.has(h)} className={cx('h-9 px-3 rounded-xl border text-[13.5px] font-semibold transition', heads.has(h) ? 'bg-brand/10 border-brand text-brand' : 'border-line text-ink2 hover:border-ink3/50')}>{h}</button>
          ))}
        </div>
      </Field>
      <Field label="Reason" required id="nc-why" error={tried && err.reason}><Textarea id="nc-why" value={reason} onChange={setReason} rows={2} placeholder="Example: father’s job loss, letter attached" /></Field>
      <Field label="Document" id="nc-doc" hint="Optional. Photo or PDF."><Button type="button" variant="secondary" icon={I.Paperclip} className="self-start" onClick={() => toast({ title: 'Choose a file or take a photo', tone: 'info' })}>Attach</Button></Field>
    </FormSheet>
  );
}

function NewRefundSheet({ open, onClose, onAdd }) {
  const toast = useToast();
  const { role } = useRole();
  const pays = AARAV_LEDGER.filter((e) => e.kind === 'receipt' && !e.cancelled);
  const [ref, setRef] = useState(pays[0].ref);
  const p = pays.find((x) => x.ref === ref);
  const [amt, setAmt] = useState(String(p.credit));
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState(p.mode);
  const [tried, setTried] = useState(false);
  const v = Number(amt.replace(/\D/g, '')) || 0;
  const err = { amt: !v ? 'Enter the refund amount' : v > p.credit ? `Maximum refund ${inr(p.credit)}` : '', reason: !reason.trim() ? 'Say why the money goes back' : '' };
  return (
    <FormSheet open={open} onClose={() => { onClose(); setTried(false); setReason(''); }} title="New refund" sub={`For ${FEATURED.name}, ${clsOf(FEATURED)}. Every refund goes to the Principal.`} submitLabel="Send for approval"
      onSubmit={() => {
        setTried(true);
        if (err.amt || err.reason) return false;
        onAdd({ id: 'nr' + Date.now(), sid: FEATURED.id, name: FEATURED.name, cls: clsOf(FEATURED), rcpt: p.ref, paid: p.credit, amt: v, reason: reason.trim(), mode, by: role.person.name, status: 'Waiting', appr: null, date: '9 Oct' });
        toast({ title: 'Refund sent to Lakshmi Rao', body: `${inr(v)} from ${p.ref}. Once approved, mark it refunded with the date and reference.` });
        setReason(''); setTried(false);
      }}>
      <Field label="Payment" required id="rf-p"><Select id="rf-p" value={ref} onChange={(x) => { setRef(x); const y = pays.find((z) => z.ref === x); setAmt(String(y.credit)); setMode(y.mode); }} options={pays.map((x) => ({ value: x.ref, label: `${x.ref} · ${dshort(x.d)} · ${inr(x.credit)} · ${x.mode}` }))} /></Field>
      <Field label="Amount" required id="rf-amt" error={tried && err.amt} hint={!(tried && err.amt) ? `Not more than ${inr(p.credit)} (paid, minus earlier refunds)` : undefined}><Input id="rf-amt" inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value)} className="tnum" error={tried && err.amt} /></Field>
      <Field label="Refund mode" required id="rf-mode"><Select id="rf-mode" value={mode} onChange={setMode} options={['Cash', 'UPI', 'Bank transfer', 'Cheque']} /></Field>
      <Field label="Reason" required id="rf-why" error={tried && err.reason}><Textarea id="rf-why" value={reason} onChange={setReason} rows={2} placeholder="Example: paid twice, once by link and once at the counter" /></Field>
    </FormSheet>
  );
}

/* =========================================================================================
   Fee Reports
   ========================================================================================= */
const FEE_REPORT_LIST = [
  { id: 'collection', group: 'Collection', name: 'Collection report', sub: 'By class, fee head, mode and collector', icon: 'IndianRupee' },
  { id: 'modes', group: 'Collection', name: 'Payment-mode report', sub: 'Cash, UPI, online, cheque and more', icon: 'Wallet' },
  { id: 'online', group: 'Collection', name: 'Online payments', sub: 'Successful, failed and reconciled', icon: 'Globe' },
  { id: 'outstanding', group: 'Dues', name: 'Outstanding report', sub: 'By class, with the ageing groups', icon: 'Hourglass' },
  { id: 'defaulter', group: 'Dues', name: 'Defaulter report', sub: 'Students with overdue fees', icon: 'UserX' },
  { id: 'concession', group: 'Discounts and penalties', name: 'Discount and concession report', sub: 'By type, including scholarships', icon: 'BadgePercent' },
  { id: 'latefee', group: 'Discounts and penalties', name: 'Late fee report', sub: 'Added, waived and collected', icon: 'Timer' },
  { id: 'refunds', group: 'Discounts and penalties', name: 'Refund report', sub: 'Asked, approved and paid back', icon: 'Undo2' },
  { id: 'cancelled', group: 'Audit and tax', name: 'Cancelled payments report', sub: 'Who cancelled, when, why', icon: 'Ban' },
  { id: 'audit', group: 'Audit and tax', name: 'Audit report', sub: 'Installment-wise breakdown', icon: 'ListTree' },
  { id: 'gst', group: 'Audit and tax', name: 'GST report', sub: 'Taxable collection, tax by rate, tax invoices', icon: 'Percent' },
];
const BY_CLASS = [
  ['Nursery', 980000, 852000], ['LKG', 1420000, 1196000], ['UKG', 1480000, 1231000], ['Class 1', 1710000, 1422000], ['Class 2', 1740000, 1461000],
  ['Class 3', 2090000, 1702000], ['Class 4', 2130000, 1751000], ['Class 5', 2040000, 1658000], ['Class 6', 2760000, 2249000], ['Class 7', 2890000, 2346000],
  ['Class 8', 2820000, 2293000], ['Class 9', 3250000, 2641000], ['Class 10', 3090000, 2528000],
];
const AUDIT = [
  ['Tuition fee · Q1 Apr–Jun', 7680000, 7564000], ['Tuition fee · Q2 Jul–Sep', 7680000, 7554000], ['Tuition fee · Q3 Oct–Dec', 7680000, 3418000],
  ['Transport fee · Apr–Sep', 2640000, 2596000], ['Transport fee · Oct', 440000, 302000], ['Hostel fee · Apr–Dec', 1380000, 1296000],
  ['Exam fee · Half-yearly', 540000, 246000], ['Admission fee', 240000, 240000], ['Store items (uniform, books)', 120000, 114000],
];
const CANCELLED_LOG = [
  { rcpt: 'R/26/05180', date: '9 Oct', name: 'Lasya Iyer', cls: '3 A', amt: 6200, reason: 'Wrong amount', by: 'Suresh Babu', appr: 'Same day, no approval needed' },
  { rcpt: 'R/26/04630', date: '24 Jul', name: 'Aarav Sharma', cls: '7 B', amt: 8500, reason: 'Cheque bounced', by: 'Suresh Babu', appr: 'Lakshmi Rao' },
  { rcpt: 'R/26/03877', date: '2 Jul', name: 'Kabir Singh', cls: '7 B', amt: 18500, reason: 'Same payment entered twice', by: 'Suresh Babu', appr: 'Same day, no approval needed' },
  { rcpt: 'R/26/02961', date: '18 Jun', name: 'Saanvi Goud', cls: '6 B', amt: 2200, reason: 'Wrong student', by: 'Anita Sharma', appr: 'Lakshmi Rao' },
  { rcpt: 'R/26/01450', date: '30 Apr', name: 'Rahul Goud', cls: '9 B', amt: 23000, reason: 'Cheque bounced', by: 'Suresh Babu', appr: 'Lakshmi Rao' },
];

function FeeReports() {
  const { role } = useRole();
  if (role.id === 'admissioncounsellor') return <AdmissionFees />;
  return <FeeReportsFull />;
}
function FeeReportsFull() {
  const { go } = useNav();
  const { role } = useRole();
  const [active, setActive] = useState('collection');
  const [by, setBy] = useState('class');
  const [per, setPer] = useState(PERIODS.finyear);
  const r = FEE_REPORT_LIST.find((x) => x.id === active);
  const range = `${per.label} · ${fmtRange(per)}`;
  const head = (sub, extra) => <CardHead title={r.name} sub={sub} action={<div className="flex items-center gap-2">{extra}<ReportActions name={`${r.name}, ${fmtRange(per)}`} /></div>} />;
  const sumCol = (rows, i) => rows.reduce((a, x) => a + x[i], 0);
  // Example totals are for 1 Apr to 9 Oct; a shorter period shows its share, month by month
  const f = Math.min(1, fyShare(per));
  const sc = scaleBy(f);
  const byClass = BY_CLASS.map(([k, d, c]) => [k, sc(d), sc(c)]);
  const collectors = [['Suresh Babu · Counter 1', 3912, 10964000], ['Razorpay (online, by itself)', 2210, 5131000], ['Anita Sharma · Counter 2', 1408, 4410000], ['Bank transfers and cheques (verified)', 591, 2825000]].map(([k, n, a]) => [k, sc(n), sc(a)]);
  const modes = [['UPI', 9840000], ['Online', 5130000], ['Cash', 4480000], ['Bank transfer', 1860000], ['Cheque', 1420000], ['Card', 600000]].map(([k, a]) => [k, sc(a)]);
  const modeTotal = sumCol(modes, 1);
  const inOct = per.from >= '2026-10-01';
  const ONLINE_DAYS = [['Fri 9 Oct', '2026-10-09', '2026-10-09', 4, 13600, 1, false], ['Thu 8 Oct', '2026-10-08', '2026-10-08', 29, 81200, 2, false], ['Wed 7 Oct', '2026-10-07', '2026-10-07', 41, 118400, 3, true], ['Tue 6 Oct', '2026-10-06', '2026-10-06', 52, 141900, 1, true], ['Mon 5 Oct', '2026-10-05', '2026-10-05', 63, 172300, 2, true], ['1–3 Oct', '2026-10-01', '2026-10-03', 107, 282600, 2, true]];
  const online = inOct
    ? ONLINE_DAYS.filter((x) => x[2] >= per.from && x[1] <= per.to).map(([k, , , n, a, fl, ok]) => [k, n, a, fl, ok])
    : FY_MONTHS.map(([k, y, m], i) => { const sh = monthShare(per, y, m); const base = k === 'Oct' ? [296, 810000, 11] : [Math.round(FEE_TREND[i].c * 8.1), FEE_TREND[i].c * 22000, Math.round(FEE_TREND[i].c / 5)]; return [`${MONTH_NAMES[m]} 2026`, Math.round(base[0] * sh), Math.round(base[1] * sh), Math.round(base[2] * sh), k !== 'Oct', sh]; }).filter((x) => x[5] > 0);
  const lateRows = [['Apr', 3, 64, 9, 13750], ['Jul', 6, 182, 18, 38500], ['Oct (so far)', 9, 0, 0, 1000]].filter((x) => monthShare(per, 2026, x[1]) > 0).map(([k, , a, w, c]) => [k, a, w, c]);
  const refunds = REFUNDS.filter((x) => inPeriod(isoOf(x.date), per));
  const cancelled = CANCELLED_LOG.filter((x) => inPeriod(isoOf(x.date), per));
  const defs = [...DEFAULTERS].filter((d) => inPeriod(isoOf(d.since), per)).sort((a, b) => b.days - a.days);
  const before = per.to < '2026-04-01';

  return (
    <div>
      <ModuleHead title="Fees" sub={`${range} · every report also opens in Reports & Analytics`} />
      <div className="flex flex-col @md:flex-row @md:items-center gap-2.5 mb-5">
        <DatePeriod id="fr-per" value={per} onChange={setPer} className="w-full @md:w-auto" />
        <p className="text-[13px] text-ink3">Dues and defaulters are as on today, 9 Oct 2026. Money reports follow the dates you pick.</p>
      </div>
      <ReportsFrame reports={FEE_REPORT_LIST} active={active} onPick={setActive}>
        {before && !['outstanding'].includes(active) ? (
          <Card><Empty icon={I.Archive} title="Before School OS" body="School OS started on 1 Apr 2026. Fee records before that are in the old software’s files." action={<Button variant="secondary" onClick={() => setPer(PERIODS.finyear)}>Show this financial year</Button>} /></Card>
        ) : <>
        {active === 'collection' && <>
          <Stats items={[{ label: 'Due', value: inrShort(sc(28400000)), sub: per.label }, { label: 'Collected', value: inrShort(sc(23330000)), tone: 'ok', sub: '82%' }, { label: 'Not collected', value: inrShort(sc(28400000) - sc(23330000)), tone: 'warn', sub: '₹8.4 L overdue today' }]} />
          <Card className="overflow-hidden">
            {head(`Due and collected · ${range}`, <Segmented size="sm" value={by} onChange={setBy} options={[{ value: 'class', label: 'Class' }, { value: 'collector', label: 'Collector' }]} />)}
            {by === 'class' ? (
              <SimpleTable cols={[{ label: 'Class', render: (x) => x[0] }, { label: 'Due', right: true, render: (x) => inr(x[1]) }, { label: 'Collected', right: true, render: (x) => inr(x[2]) }, { label: 'Not collected', right: true, render: (x) => inr(x[1] - x[2]) }, { label: '%', right: true, render: (x) => <span className={pct(x[2], x[1]) < 81 ? 'text-warn font-semibold' : ''}>{pct(x[2], x[1])}%</span> }]}
                rows={byClass} foot={['All classes', inr(sumCol(byClass, 1)), inr(sumCol(byClass, 2)), inr(sumCol(byClass, 1) - sumCol(byClass, 2)), `${pct(sumCol(byClass, 2), sumCol(byClass, 1))}%`]} />
            ) : (
              <SimpleTable cols={[{ label: 'Collected by', render: (x) => x[0] }, { label: 'Payments', right: true, render: (x) => x[1].toLocaleString('en-IN') }, { label: 'Amount', right: true, render: (x) => inr(x[2]) }, { label: 'Share', right: true, render: (x) => `${pct(x[2], sumCol(collectors, 2))}%` }]}
                rows={collectors} foot={['Total', sumCol(collectors, 1).toLocaleString('en-IN'), inr(sumCol(collectors, 2)), '100%']} />
            )}
          </Card>
        </>}

        {active === 'modes' && (
          <Card className="overflow-hidden">
            {head(`${range} · ${inrShort(modeTotal)}`)}
            <SimpleTable cols={[{ label: 'Mode', render: (x) => <span className="inline-flex items-center gap-2"><ModeIcon mode={x[0]} />{MODE_LABEL[x[0]] || x[0]}</span> }, { label: 'Amount', right: true, render: (x) => inr(x[1]) }, { label: 'Share', right: true, render: (x) => `${pct(x[1], modeTotal)}%` }, { label: '', render: (x) => <Progress value={pct(x[1], modes[0][1])} className="w-28" /> }]}
              rows={modes} foot={['Total', inr(modeTotal), '100%', '']} />
          </Card>
        )}

        {active === 'online' && (
          <Card className="overflow-hidden">
            {head(`Razorpay · ${range} · every payment matched by itself`)}
            {online.length === 0 ? <Empty icon={I.Globe} title="No online payments in these dates" body="Pick other dates." /> : (
            <SimpleTable cols={[{ label: inOct ? 'Day' : 'Month', render: (x) => x[0] }, { label: 'Successful', right: true, render: (x) => x[1].toLocaleString('en-IN') }, { label: 'Amount', right: true, render: (x) => inr(x[2]) }, { label: 'Failed', right: true, render: (x) => (x[3] ? <span className="text-bad font-semibold">{x[3]}</span> : 0) }, { label: 'Reconciled', render: (x) => <Pill tone={x[4] ? 'ok' : 'warn'}>{x[4] ? 'Matched with settlement' : 'Some settle tomorrow'}</Pill> }]}
              rows={online} foot={['Total', sumCol(online, 1).toLocaleString('en-IN'), inr(sumCol(online, 2)), sumCol(online, 3), '']} />
            )}
          </Card>
        )}

        {active === 'outstanding' && <>
          <Banner tone="info" title="As on today, 9 Oct 2026.">Dues still unpaid today, grouped by how long they have been late. The dates above do not change this report.</Banner>
          <Stats items={BUCKETS.map((b) => ({ label: b.label, value: inrShort(DEFAULTERS.filter((d) => d.bucket === b.id).reduce((a, d) => a + d.amount, 0)), sub: `${DEFAULTERS.filter((d) => d.bucket === b.id).length} students`, tone: b.tone }))} />
          <Card className="overflow-hidden">
            {head('Overdue by class and ageing group · groups from Fee Settings')}
            <SimpleTable minWidth={640} cols={[{ label: 'Class', render: (x) => x.name }, ...BUCKETS.map((b) => ({ label: b.label, right: true, render: (x) => (x[b.id] ? inr(x[b.id]) : '—') })), { label: 'Total', right: true, render: (x) => <b className="font-semibold">{inr(x.total)}</b> }]}
              rows={CLASSES.map((c) => { const l = DEFAULTERS.filter((d) => d.s.clsId === c.id); const o = { name: c.name, total: l.reduce((a, d) => a + d.amount, 0) }; BUCKETS.forEach((b) => (o[b.id] = l.filter((d) => d.bucket === b.id).reduce((a, d) => a + d.amount, 0))); return o; }).filter((x) => x.total)}
              foot={['All classes', ...BUCKETS.map((b) => inr(DEFAULTERS.filter((d) => d.bucket === b.id).reduce((a, d) => a + d.amount, 0))), inr(OVERDUE_TOTAL)]} />
          </Card>
        </>}

        {active === 'defaulter' && (
          <Card className="overflow-hidden">
            {head(`${defs.length} students overdue since ${fmtRange(per)} · the 12 oldest`, canOpen(role, 'fees', 'defaulters') && <Button size="sm" variant="ghost" onClick={() => go('fees', { page: 'defaulters' })}>Open Defaulters</Button>)}
            {defs.length === 0 ? <Empty icon={I.CircleCheck} title="Nobody here" body="No dues fell overdue in these dates." /> : <SimpleTable minWidth={620} cols={[{ label: 'Student', render: (d) => d.s.name }, { label: 'Class', render: (d) => clsOf(d.s) }, { label: 'Parent phone', render: (d) => <span className="tnum">{d.s.phone}</span> }, { label: 'Days late', right: true, render: (d) => d.days }, { label: 'Overdue', right: true, render: (d) => <b className="font-semibold">{inr(d.amount)}</b> }]}
              rows={defs.slice(0, 12)} />}
          </Card>
        )}

        {active === 'concession' && (
          <Card className="overflow-hidden">
            {head(`${range} · ${inrShort(sc(4107950))} off fees`)}
            <SimpleTable cols={[{ label: 'Type', render: (x) => x[0] }, { label: 'Students', right: true, render: (x) => x[1] }, { label: 'Amount', right: true, render: (x) => inr(sc(x[2])) }, { label: 'Note', nowrap: false, render: (x) => <span className="text-[12.5px] text-ink3">{x[3]}</span> }]}
              rows={[['RTE seats', 38, 1976000, 'Claimed from the Telangana government'], ['Sibling discount', 176, 704000, 'Bulk rule'], ['Pay the full year by 30 Apr', 146, 491300, 'Bulk rule, 5% off'], ['Staff children', 14, 462000, '50% off tuition'], ['Scholarships', 21, 405400, 'Merit, sports and need-based'], ['One-off discounts', 23, 61500, '9 above ₹1,000 approved by the Principal'], ['Late fee waivers', 31, 7750, 'With a reason each']]}
              foot={['Total', 449, inr(sc(4107950)), '']} />
          </Card>
        )}

        {active === 'latefee' && (
          <Card className="overflow-hidden">
            {head(`${range} · ₹250 once, 15 days after the due date · tuition only`)}
            {lateRows.length === 0 ? <Empty icon={I.Timer} title="No late fees in these dates" body="Late fees are added in the months a tuition installment falls due: April, July, October and January." /> : <SimpleTable cols={[{ label: 'Month', render: (x) => x[0] }, { label: 'Added', right: true, render: (x) => `${x[1]} · ${inr(x[1] * 250)}` }, { label: 'Waived', right: true, render: (x) => `${x[2]} · ${inr(x[2] * 250)}` }, { label: 'Collected', right: true, render: (x) => inr(x[3]) }, { label: 'Still due', right: true, render: (x) => inr(x[1] * 250 - x[2] * 250 - x[3]) }]}
              rows={lateRows} foot={['Total', `${sumCol(lateRows, 1)} · ${inr(sumCol(lateRows, 1) * 250)}`, `${sumCol(lateRows, 2)} · ${inr(sumCol(lateRows, 2) * 250)}`, inr(sumCol(lateRows, 3)), inr(sumCol(lateRows, 1) * 250 - sumCol(lateRows, 2) * 250 - sumCol(lateRows, 3))]} />}
          </Card>
        )}

        {active === 'refunds' && (
          <Card className="overflow-hidden">
            {head(`${range} · never more than was paid`)}
            {refunds.length === 0 ? <Empty icon={I.Undo2} title="No refunds in these dates" body="Pick other dates." /> : <SimpleTable minWidth={640} cols={[{ label: 'Student', render: (x) => x.name }, { label: 'Asked on', render: (x) => x.date }, { label: 'Payment', render: (x) => <span className="font-mono text-[12.5px]">{x.rcpt}</span> }, { label: 'Refund', right: true, render: (x) => inr(x.amt) }, { label: 'Status', render: (x) => <Pill tone={C_TONE[x.status]}>{x.status}</Pill> }, { label: 'Approved by', render: (x) => x.appr || '—' }]}
              rows={refunds} foot={[`${refunds.length} refunds`, '', '', inr(refunds.reduce((a, x) => a + x.amt, 0)), '', '']} />}
          </Card>
        )}

        {active === 'cancelled' && (
          <Card className="overflow-hidden">
            {head(`${range} · replaces the old “deleted payments” log. Nothing is ever deleted.`)}
            {cancelled.length === 0 ? <Empty icon={I.Ban} title="No payments cancelled in these dates" body="Pick other dates." /> : <SimpleTable minWidth={760} cols={[{ label: 'Receipt', render: (x) => <span className="font-mono text-[12.5px]">{x.rcpt}</span> }, { label: 'Cancelled on', render: (x) => x.date }, { label: 'Student', render: (x) => `${x.name} · ${x.cls}` }, { label: 'Amount', right: true, render: (x) => inr(x.amt) }, { label: 'Reason', render: (x) => x.reason }, { label: 'By', render: (x) => x.by }, { label: 'Approved', render: (x) => <span className="text-[12.5px] text-ink3">{x.appr}</span> }]}
              rows={cancelled} foot={[`${cancelled.length} payments`, '', '', inr(cancelled.reduce((a, x) => a + x.amt, 0)), '', '', '']} />}
          </Card>
        )}

        {active === 'audit' && (
          <Card className="overflow-hidden">
            {head('Every installment raised so far this financial year, as on 9 Oct 2026, for the auditor')}
            <SimpleTable minWidth={640} cols={[{ label: 'Installment', render: (x) => x[0] }, { label: 'Raised', right: true, render: (x) => inr(x[1]) }, { label: 'Collected', right: true, render: (x) => inr(x[2]) }, { label: 'Balance', right: true, render: (x) => inr(x[1] - x[2]) }, { label: '%', right: true, render: (x) => `${pct(x[2], x[1])}%` }]}
              rows={AUDIT} foot={['Total', inr(sumCol(AUDIT, 1)), inr(sumCol(AUDIT, 2)), inr(sumCol(AUDIT, 1) - sumCol(AUDIT, 2)), `${pct(sumCol(AUDIT, 2), sumCol(AUDIT, 1))}%`]} />
          </Card>
        )}

        {active === 'gst' && <GstReport per={per} range={range} head={head} />}
        </>}
      </ReportsFrame>
    </div>
  );
}

// Store sales with GST by month (Sep and Oct are exact; other months follow the school year's pattern)
const GST_MONTH = { 3: 1.9, 4: 0.6, 5: 1.5, 6: 0.5, 7: 0.4, 8: 1 };
function GstReport({ per, range, head }) {
  const SEP = [['Uniform', 5, 'HSN 6203', 194000, 112], ['Books & stationery kit', 12, 'HSN 4820', 295000, 186]];
  const OCT = [['Uniform', 5, 'HSN 6203', 22400, 9], ['Books & stationery kit', 12, 'HSN 4820', 9600, 4]];
  const rows = SEP.map((x, i) => {
    let amt = 0, n = 0;
    FY_MONTHS.forEach(([, y, m]) => { const sh = monthShare(per, y, m); if (!sh) return; const base = m === 9 ? OCT[i] : SEP[i]; const k = m === 9 ? 1 : GST_MONTH[m]; amt += base[3] * k * sh; n += base[4] * k * sh; });
    return [x[0], x[1], x[2], Math.round(amt / 10) * 10, Math.round(n)];
  });
  const first = 201 + 0, last = first + rows.reduce((a, x) => a + x[4], 0) - 1;
  const tax = (x) => Math.round((x[3] * x[1]) / (100 + x[1]));
  const totalTax = rows.reduce((a, x) => a + tax(x), 0);
  return <>
    <Stats items={[
      { label: 'Taxable collection', value: inr(rows.reduce((a, x) => a + x[3], 0)), sub: 'GST included in the fee' },
      { label: 'GST', value: inr(totalTax), sub: 'CGST and SGST, half each', tone: 'brand' },
      { label: 'Tax invoices', value: rows.reduce((a, x) => a + x[4], 0), sub: rows.reduce((a, x) => a + x[4], 0) ? `TI/26/00${first} to TI/26/00${last}` : 'None in these dates' },
    ]} />
    <Card className="overflow-hidden">
      {head(`${range} · GSTIN ${GSTIN} · ready for the school’s GST filing`)}
      <SimpleTable minWidth={680} cols={[{ label: 'Fee head', render: (x) => x[0] }, { label: 'Code', render: (x) => <span className="text-ink3">{x[2]}</span> }, { label: 'Rate', right: true, render: (x) => `${x[1]}%` }, { label: 'Collected', right: true, render: (x) => inr(x[3]) }, { label: 'Taxable value', right: true, render: (x) => inr(x[3] - tax(x)) }, { label: 'CGST', right: true, render: (x) => inr(Math.round(tax(x) / 2)) }, { label: 'SGST', right: true, render: (x) => inr(tax(x) - Math.round(tax(x) / 2)) }]}
        rows={rows} foot={['Total', '', '', inr(rows.reduce((a, x) => a + x[3], 0)), inr(rows.reduce((a, x) => a + x[3] - tax(x), 0)), inr(rows.reduce((a, x) => a + Math.round(tax(x) / 2), 0)), inr(rows.reduce((a, x) => a + tax(x) - Math.round(tax(x) / 2), 0))]} />
      <p className="px-5 py-3 text-[12.5px] text-ink3 border-t border-line">Tuition, transport, hostel and exam fees are exempt and not in this report.</p>
    </Card>
  </>;
}

/* =========================================================================================
   Fee Settings
   ========================================================================================= */
function FeeSettings() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const [ages, setAges] = useState([30, 60, 90]);
  const [split, setSplit] = useState(true);
  const [remDays, setRemDays] = useState(new Set(['3 days before', 'On the due date', '7 days after', '21 days after']));
  const save = (title, body) => toast({ title, body: body || 'Saved. Recorded in the audit log.' });
  return (
    <div>
      <ModuleHead title="Fees" sub="Late fee, reminders, receipts, gateways and bank accounts. Every change is logged." />
      <div className="grid @xl:grid-cols-2 gap-5 @lg:gap-6 items-start">
        <Col>
          <SettingsCard title="Late fee rules" sub="Added as its own row after the grace period" icon={I.Timer} rows={[
            { title: 'Grace period', value: '15 days' }, { title: 'Late fee', value: '₹250 once' }, { title: 'Most per installment', value: '₹500' },
            { title: 'Fee heads with late fee', value: 'Tuition fee' },
            { title: 'Waive late fee at the counter', sub: 'Up to ₹250 with a reason; more goes to the Principal', on: true },
          ]} />

          <Card>
            <CardHead title="Reminder schedule" sub="Sent by itself for each unpaid installment. Opted-out parents are skipped." icon={I.BellRing} />
            <div className="px-5 pb-4 flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {['7 days before', '3 days before', '1 day before', 'On the due date', '7 days after', '21 days after'].map((d) => {
                  const on = remDays.has(d);
                  return <button key={d} disabled={!canEdit} onClick={() => { setRemDays((x) => { const n = new Set(x); n.has(d) ? n.delete(d) : n.add(d); return n; }); save(`Reminder ${on ? 'off' : 'on'}: ${d}`); }} aria-pressed={on}
                    className={cx('h-9 px-3 rounded-xl border text-[13.5px] font-semibold transition', on ? 'bg-brand/10 border-brand text-brand' : 'border-line text-ink2 hover:border-ink3/50')}>{on && <I.Check size={14} className="inline mr-1 -mt-0.5" />}{d}</button>;
                })}
              </div>
              <p className="text-[13px] text-ink3">WhatsApp with SMS backup · templates “Fee due tomorrow” and “Fee overdue” · payment link added</p>
            </div>
          </Card>

          <SettingsCard title="Receipts" icon={I.ReceiptIndianRupee} rows={[
            { title: 'Receipt number', sub: 'Prefix and running number', value: <span className="font-mono text-[13px]">R/26/05191 next</span> },
            { title: 'Start again each year', sub: 'R/27/00001 on 1 Apr 2027', on: true },
            { title: 'Separate series for part payments', sub: 'Like PP/26/00001', on: false },
            { title: 'Print office copy and parent copy', on: true },
            { title: 'Terms on the receipt', value: '3 lines' },
          ]} />
          <SettingsCard title="Tax invoices (GST)" sub={`GSTIN ${GSTIN} · from Settings, School Profile`} icon={I.Percent} rows={[
            { title: 'Tax invoice number', value: <span className="font-mono text-[13px]">TI/26/00512 next</span> },
            { title: 'Fee amounts include GST', sub: 'The tax invoice shows the tax part separately', on: true },
            { title: 'GST rates', sub: 'Set on each fee head in Fee Structure', value: '2 taxable heads' },
          ]} />

          <Card>
            <CardHead title="Dues ageing groups" sub="Used on Defaulters and the outstanding report" icon={I.Hourglass} />
            <div className="px-5 pb-5 flex flex-col gap-3">
              <div className="flex flex-wrap gap-2 items-center text-[13.5px]">
                {[0, ...ages].map((a, i) => <span key={i} className="h-9 px-3 rounded-xl bg-sunken font-semibold tnum inline-flex items-center">{i === ages.length ? `Over ${a} days` : `${i === 0 ? 0 : a + 1}–${ages[i]} days`}</span>)}
              </div>
              {canEdit && <div className="flex gap-2">
                <Button size="sm" variant="secondary" icon={I.Plus} onClick={() => { const n = [...ages, ages[ages.length - 1] + 30]; setAges(n); save('Ageing group added', `Now ${n.length + 1} groups`); }}>Add a group</Button>
                {ages.length > 3 && <Button size="sm" variant="ghost" onClick={() => { setAges(ages.slice(0, -1)); save('Ageing group removed'); }}>Remove last</Button>}
              </div>}
            </div>
          </Card>
        </Col>

        <Col>
          <Card className="overflow-hidden">
            <CardHead title="Payment gateway for each class" sub="Gateways are connected in Settings, Payment Gateways" icon={I.Globe} />
            <SimpleTable minWidth={420} cols={[{ label: 'Classes', render: (x) => x[0] }, { label: 'Gateway', render: (x) => <span className="inline-flex items-center gap-2">{x[1]}<Pill tone="ok" className="!h-5 !text-[11px]">Live</Pill></span> }, { label: 'Account', render: (x) => <span className="text-[13px] text-ink2">{x[2]}</span> }]}
              rows={[['Nursery to Class 5', 'Razorpay', 'Sunrise Public School'], ['Classes 6 to 10', 'Razorpay', 'Sunrise Public School'], ['Transport fee, all classes', 'Razorpay Route', 'Split to Trust account']]} />
          </Card>

          <SettingsCard title="Payments" icon={I.Wallet} rows={[
            { title: 'Allow advance payments', sub: 'Paying more than the current dues', on: false },
            { title: 'Verify before posting', sub: 'Cheque and bank transfer wait for the accountant', on: true },
            { title: 'Payment date can be changed', sub: 'Only with the “change payment date” permission, never before a closed day', on: true },
          ]} />

          <Card>
            <CardHead title="Fees into different bank accounts" sub="Each fee head goes to its own account. Razorpay splits online payments." icon={I.Landmark}
              action={<Switch id="split-acc" on={split} label="Fees into different bank accounts" onChange={(v) => { if (!canEdit) return; setSplit(v); save(`Different bank accounts: ${v ? 'on' : 'off'}`, v ? 'Receipts and the Day Book show each head’s account' : 'Everything goes to the School account'); }} />} />
            {split ? (
              <ul className="px-5 pb-4 flex flex-col text-[14px]">
                {Object.entries(ACCOUNTS).map(([k, v]) => (
                  <li key={k} className="flex items-start gap-3 py-2.5 border-t border-line/70 first:border-0">
                    <span className="w-9 h-9 rounded-xl bg-sunken text-ink2 grid place-items-center shrink-0"><I.Landmark size={17} /></span>
                    <span className="min-w-0 flex-1"><b className="font-semibold block">{k}</b><span className="text-[12.5px] text-ink3">{v}</span></span>
                    <span className="text-[12.5px] text-ink2 text-right">{k === 'Trust account' ? 'Transport fee' : 'All other heads'}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="px-5 pb-4 text-[13.5px] text-ink3">All fees go to the School account (SBI Kukatpally).</p>}
          </Card>

          <Card>
            <CardHead title="Counter permissions" sub="Stored in Settings, Users & Permissions" icon={I.KeyRound} />
            <ul className="px-5 pb-4 flex flex-col text-[14px]">
              {[['Give a discount', 'Accountant, up to ₹1,000'], ['Waive late fee', 'Accountant, up to ₹250'], ['Change payment date', 'Accountant'], ['Manage the class fee structure', 'Accountant, School Admin'], ['Collect fee at the counter', 'Accountant, School Admin · not Office Staff'], ['See fee status of own students', 'Not given to Class Teachers']].map(([k, v]) => (
                <li key={k} className="flex items-start justify-between gap-3 py-2 border-t border-line/70 first:border-0"><span className="font-medium">{k}</span><span className="text-[12.5px] text-ink3 text-right">{v}</span></li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHead title="Approval limits" sub="Stored in Settings, Forms & Approvals" icon={I.ShieldCheck} />
            <ul className="px-5 pb-4 flex flex-col text-[14px]">
              {[['Concession above ₹1,000', 'Principal'], ['Any refund', 'Principal'], ['Cancel a payment older than today', 'Principal'], ['Mid-year fee structure change', 'Principal']].map(([k, v]) => (
                <li key={k} className="flex items-center justify-between gap-3 py-2 border-t border-line/70 first:border-0"><span>{k}</span><Pill tone="info">{v}</Pill></li>
              ))}
            </ul>
          </Card>

          <SettingsCard title="Scholarships" icon={I.Award} rows={[
            { title: 'Scholarship types', value: '3 types' }, { title: 'Eligibility rules', sub: 'Marks, sports level or family income', value: '3 rules' },
            { title: 'Renewal reminder before the year starts', on: true },
          ]} />
        </Col>
      </div>
    </div>
  );
}

/* =========================================================================================
   Pages
   ========================================================================================= */
export const FEES_PAGES = {
  dashboard: FeeDashboard,
  ledger: LedgerPage,
  defaulters: DefaultersPage,
  structure: Structure,
  concessions: Concessions,
  reports: FeeReports,
  settings: FeeSettings,
};
