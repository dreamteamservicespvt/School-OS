// Salary Management (blueprint module 10). Example data only.
import React, { useState } from 'react';
import * as I from './icons.js';
import { inr, inrShort } from './data.js';
import { cx, Card, CardHead, Button, IconButton, Pill, Avatar, Input, Field, Segmented, Sheet, Switch, Empty, useToast } from './ui.jsx';
import { useNav, useRole } from './shell.jsx';
import {
  ModuleHead, useCanEdit, Stats, SearchBox, Toolbar, Select, Textarea, Chips, DataList, BulkBar, Row, SettingsCard, SettingRow,
  Banner, Suggestion, Progress, HBars, Bars, Legend, DL, Timeline, MoreMenu, FormSheet, ConfirmSheet, Split as KitSplit, Col, ExportButton,
  DatePeriod, PERIODS, fmtRange, usePage,
} from './kit.jsx';
import { isoOf, inPeriod, ALL_DATES, canOpen } from './mod-fees.jsx';

// Same as the kit Split, but its direct children may shrink (no sideways overflow on phones)
const Split = ({ className, ...p }) => <KitSplit {...p} className={cx('[&>*]:min-w-0', className)} />;

/* ======================= Sample data ======================= */
// Staff on the payroll (example rows; 86 are paid each month). Earnings: basic, DA 20% of basic, HRA 30% of basic, conveyance, special allowance.
const PAY = [
  { id: 'P01', code: 'SPS-T-001', name: 'Lakshmi Rao', desig: 'Principal', dept: 'Teaching', basic: 70000, conv: 3200, special: 16800, tds: 6200 },
  { id: 'P02', code: 'SPS-T-002', name: 'Srinivas Murthy', desig: 'Vice Principal', dept: 'Teaching', basic: 56000, conv: 3200, special: 14800, tds: 0, flag: 'No TDS amount' },
  { id: 'P03', code: 'SPS-T-003', name: 'Meena Pillai', desig: 'Academic Head', dept: 'Teaching', basic: 46000, conv: 3200, special: 6800 },
  { id: 'P04', code: 'SPS-T-012', name: 'Prakash Joshi', desig: 'PGT Chemistry', dept: 'Teaching', basic: 29000, conv: 1600, special: 4900, tds: 1200 },
  { id: 'T01', code: 'SPS-T-014', name: 'Ravi Teja', desig: 'TGT Science', dept: 'Teaching', basic: 22000, conv: 1600, special: 3400 },
  { id: 'T02', code: 'SPS-T-021', name: 'Imran Shaikh', desig: 'TGT Mathematics', dept: 'Teaching', basic: 20500, conv: 1600, special: 3150 },
  { id: 'T03', code: 'SPS-T-008', name: 'Anitha Kumari', desig: 'PGT English', dept: 'Teaching', basic: 30000, conv: 1600, special: 5400, tds: 1100, leave: 2 },
  { id: 'T04', code: 'SPS-T-030', name: 'Sunitha Mohan', desig: 'PRT', dept: 'Teaching', basic: 15000, conv: 1200, special: 2800 },
  { id: 'T05', code: 'SPS-T-011', name: 'Venkat Rao', desig: 'TGT Social Studies', dept: 'Teaching', basic: 21500, conv: 1600, special: 3150, leave: 1 },
  { id: 'T06', code: 'SPS-T-017', name: 'Lalitha Devi', desig: 'TGT Telugu', dept: 'Teaching', basic: 19500, conv: 1600, special: 3150 },
  { id: 'T07', code: 'SPS-T-019', name: 'Deepak Verma', desig: 'TGT Hindi', dept: 'Teaching', basic: 19500, conv: 1600, special: 3150, leave: 1, lop: 0.5, note: '3 late marks = half a day' },
  { id: 'T08', code: 'SPS-T-025', name: 'Farhana Begum', desig: 'PGT Physics', dept: 'Teaching', basic: 29000, conv: 1600, special: 4900, tds: 1200 },
  { id: 'T09', code: 'SPS-T-027', name: 'Karthik Menon', desig: 'TGT Computer Science', dept: 'Teaching', basic: 21000, conv: 1600, special: 3100, rec: 2000, flag: 'Leaving 31 Oct' },
  { id: 'T10', code: 'SPS-T-005', name: 'Usha Rani', desig: 'PRT', dept: 'Teaching', basic: 17000, conv: 1200, special: 2300 },
  { id: 'T11', code: 'SPS-T-032', name: 'Mohammed Asif', desig: 'PET', dept: 'Teaching', basic: 16000, conv: 1200, special: 2300 },
  { id: 'T12', code: 'SPS-T-029', name: 'Swapna Reddy', desig: 'TGT Mathematics', dept: 'Teaching', basic: 19000, conv: 1600, special: 2900, flag: 'Attendance not complete' },
  { id: 'T13', code: 'SPS-T-018', name: 'Shobha Rani', desig: 'PRT', dept: 'Teaching', basic: 15000, conv: 1200, special: 2800, leave: 31, note: 'Maternity leave, paid' },
  { id: 'T14', code: 'SPS-T-033', name: 'Rekha Nair', desig: 'PRT (temporary)', dept: 'Teaching', basic: 0, conv: 0, special: 0, none: true, flag: 'No salary structure' },
  { id: 'A01', code: 'SPS-A-003', name: 'Suresh Babu', desig: 'Accountant', dept: 'Accounts', basic: 21000, conv: 1600, special: 2900 },
  { id: 'A12', code: 'SPS-A-007', name: 'Mahesh Goud', desig: 'Cashier-cum-Accountant', dept: 'Accounts', basic: 14000, conv: 1200, special: 1800 },
  { id: 'A02', code: 'SPS-A-006', name: 'Anita Sharma', desig: 'Office Head', dept: 'Office', basic: 24000, conv: 1600, special: 4400 },
  { id: 'A08', code: 'SPS-A-010', name: 'Shalini Verma', desig: 'HR Manager', dept: 'Office', basic: 20000, conv: 1600, special: 2400 },
  { id: 'A03', code: 'SPS-A-011', name: 'Kavitha Nair', desig: 'Receptionist', dept: 'Office', basic: 10000, conv: 1000, special: 2000 },
  { id: 'A09', code: 'SPS-A-013', name: 'Naveen Kumar', desig: 'Office Assistant', dept: 'Office', basic: 9500, conv: 1000, special: 1750, rec: 1500 },
  { id: 'A10', code: 'SPS-A-017', name: 'Divya Menon', desig: 'Admission Counsellor', dept: 'Office', basic: 14000, conv: 1200, special: 1800 },
  { id: 'A11', code: 'SPS-A-016', name: 'Sana Ali', desig: 'School Counsellor', dept: 'Office', basic: 18000, conv: 1600, special: 2400 },
  { id: 'A04', code: 'SPS-A-009', name: 'Padma Iyer', desig: 'Librarian', dept: 'Library', basic: 15000, conv: 1200, special: 2300 },
  { id: 'A05', code: 'SPS-A-012', name: 'Venkatesh Goud', desig: 'Transport In-charge', dept: 'Transport', basic: 14500, conv: 1200, special: 1550 },
  { id: 'S01', code: 'SPS-S-021', name: 'Mallesh Kumar', desig: 'Driver · Bus 4', dept: 'Transport', basic: 10000, conv: 1000, special: 2500, rec: 3000 },
  { id: 'A06', code: 'SPS-A-014', name: 'Joseph Thomas', desig: 'Hostel Warden', dept: 'Hostel', basic: 13000, conv: 1000, special: 1500, rec: 3000 },
  { id: 'A07', code: 'SPS-A-015', name: 'Ramu Yadav', desig: 'Store Keeper', dept: 'Stores', basic: 10500, conv: 1000, special: 1250, leave: 1 },
  { id: 'S02', code: 'SPS-S-024', name: 'Lakshmamma', desig: 'Ayah', dept: 'Support', basic: 7500, conv: 800, special: 450, lop: 1, note: 'Absent without leave on Mon 5 Oct' },
  { id: 'S03', code: 'SPS-S-030', name: 'Bhaskar Rao', desig: 'Gate Security', dept: 'Support', basic: 8000, conv: 800, special: 1200, lop: 2, note: 'Absent without leave on 3 and 7 Oct' },
];
const MONTHS = [
  { id: 'oct', label: 'October 2026', short: 'Oct', staff: 86, gross: 2784620, ded: 144020, net: 2640600, status: 'calculated' },
  { id: 'sep', label: 'September 2026', short: 'Sep', staff: 86, gross: 2780100, ded: 143700, net: 2636400, status: 'paid', paid: 'Wed 30 Sep', by: 'Lakshmi Rao' },
  { id: 'aug', label: 'August 2026', short: 'Aug', staff: 86, gross: 2769800, ded: 143200, net: 2626600, status: 'locked', paid: 'Mon 31 Aug', by: 'Lakshmi Rao' },
  { id: 'jul', label: 'July 2026', short: 'Jul', staff: 86, gross: 2772400, ded: 143500, net: 2628900, status: 'locked', paid: 'Fri 31 Jul', by: 'Lakshmi Rao' },
  { id: 'jun', label: 'June 2026', short: 'Jun', staff: 86, gross: 2761900, ded: 142900, net: 2619000, status: 'locked', paid: 'Tue 30 Jun', by: 'Lakshmi Rao' },
  { id: 'may', label: 'May 2026', short: 'May', staff: 84, gross: 2652700, ded: 137300, net: 2515400, status: 'locked', paid: 'Sat 30 May', by: 'Lakshmi Rao' },
  { id: 'apr', label: 'April 2026', short: 'Apr', staff: 84, gross: 2648200, ded: 137100, net: 2511100, status: 'locked', paid: 'Thu 30 Apr', by: 'Lakshmi Rao' },
];
// Whole-school totals for October (all 86 staff)
const OCT = { pf: 106560, esi: 2410, pt: 15850, tds: 9700, rec: 9500, erPf: 106560, erEsi: 10440 };
const STEPS = [['open', 'Open'], ['calculated', 'Calculated'], ['waiting', 'Waiting for approval'], ['approved', 'Approved'], ['paid', 'Paid'], ['locked', 'Locked']];
const STEP_TONE = { open: 'neutral', calculated: 'info', waiting: 'warn', approved: 'brand', paid: 'ok', locked: 'neutral' };
const STATUS_LABEL = Object.fromEntries(STEPS);
const ADVANCES = [
  { id: 'ADV-26-019', sid: 'A09', type: 'Advance', amount: 7500, given: 'Thu 1 Oct 2026', inst: 1500, rec: 0, status: 'Active', reason: 'Dussehra festival advance' },
  { id: 'ADV-26-020', sid: 'T06', type: 'Advance', amount: 10000, given: 'Approved Thu 8 Oct', inst: 2000, rec: 0, status: 'Not paid yet', reason: 'Dussehra festival advance' },
  { id: 'ADV-26-017', sid: 'T09', type: 'Advance', amount: 10000, given: 'Wed 12 Aug 2026', inst: 2000, rec: 2000, status: 'Active', reason: 'Medical expenses' },
  { id: 'ADV-26-014', sid: 'A06', type: 'Loan', amount: 36000, given: 'Tue 2 Jun 2026', inst: 3000, rec: 9000, status: 'Active', reason: 'Two-wheeler purchase' },
  { id: 'ADV-26-011', sid: 'S01', type: 'Loan', amount: 30000, given: 'Mon 16 Mar 2026', inst: 3000, rec: 18000, status: 'Active', reason: 'House repairs after rains' },
  { id: 'ADV-26-009', sid: 'T05', type: 'Advance', amount: 8000, given: 'Thu 9 Apr 2026', inst: 4000, rec: 8000, status: 'Closed', reason: 'Child’s school fees' },
  { id: 'ADV-25-031', sid: 'T10', type: 'Loan', amount: 25000, given: 'Mon 2 Jun 2025', inst: 2500, rec: 25000, status: 'Closed', reason: 'Family wedding' },
];
const byId = (id) => PAY.find((p) => p.id === id);
const hash = (s) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const amt = (n) => inr(Math.round(n));

/* ======================= Pay worked out from the structure and the rules in Salary Settings ======================= */
function lines(p, f = 1) {
  const basic = Math.round((p.basic * f) / 10) * 10;
  const da = Math.round(basic * 0.2), hra = Math.round(basic * 0.3);
  const special = Math.round((p.special * f) / 10) * 10;
  return { basic, da, hra, conv: p.conv, special, gross: basic + da + hra + p.conv + special };
}
function calc(p, { lop = p.lop || 0, adj = [], f = 1, days = 31 } = {}) {
  const L = lines(p, f);
  const ratio = (days - lop) / days;
  const earned = Math.round(L.gross * ratio);
  const basicE = Math.round(L.basic * ratio);
  const add = adj.filter((a) => a.type !== 'Deduction').reduce((x, a) => x + a.amount, 0);
  const cut = adj.filter((a) => a.type === 'Deduction').reduce((x, a) => x + a.amount, 0);
  const pay = earned + add;
  const pfWage = Math.min(basicE, 15000);
  const pf = Math.round(pfWage * 0.12);
  const esiOn = L.gross <= 21000;
  const esi = esiOn ? Math.ceil(pay * 0.0075) : 0;
  const pt = pay <= 15000 ? 0 : pay <= 20000 ? 150 : 200;
  const tds = p.tds || 0, rec = p.rec || 0;
  const ded = pf + esi + pt + tds + rec + cut;
  return { ...L, lop, paid: days - lop, earned, basicE, add, cut, pay, pfWage, pf, esiOn, esi, pt, tds, rec, ded, net: pay - ded, erPf: pf, erEsi: esiOn ? Math.ceil(pay * 0.0325) : 0 };
}
// Rupees in words, Indian style
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const two = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? '-' + ONES[n % 10] : ''}`);
const three = (n) => [Math.floor(n / 100) ? `${ONES[Math.floor(n / 100)]} Hundred` : '', n % 100 ? two(n % 100) : ''].filter(Boolean).join(' ');
function words(n) {
  n = Math.round(n);
  const parts = [];
  const cr = Math.floor(n / 1e7), lk = Math.floor((n % 1e7) / 1e5), th = Math.floor((n % 1e5) / 1e3), rest = n % 1000;
  if (cr) parts.push(`${two(cr)} Crore`); if (lk) parts.push(`${two(lk)} Lakh`); if (th) parts.push(`${two(th)} Thousand`); if (rest) parts.push(three(rest));
  return `Rupees ${parts.join(' ') || 'Zero'} only`;
}

/* ======================= Small pieces ======================= */
function StatusPill({ s }) { return <Pill tone={STEP_TONE[s]} dot>{STATUS_LABEL[s]}</Pill>; }
const usePerson = () => {
  const { role } = useRole();
  return PAY.find((p) => p.name === role.person.name) || { id: 'ME', code: 'SPS-A-020', name: role.person.name, desig: role.person.role, dept: 'Office', basic: 14000, conv: 1200, special: 1800 };
};

function Breakdown({ p, open, onClose, adj = [], canAdjust, onAdjust }) {
  if (!p) return null;
  const c = calc(p, { adj });
  const row = (k, v, sub, tone) => (
    <li className="flex items-start justify-between gap-3 py-1.5">
      <span className="min-w-0"><span className="block">{k}</span>{sub && <span className="block text-[12px] text-ink3">{sub}</span>}</span>
      <span className={cx('tnum font-medium shrink-0', tone)}>{v}</span>
    </li>
  );
  return (
    <Sheet open={open} onClose={onClose} title={`How ${p.name}’s pay was worked out`} sub={`October 2026 · structure v3 from 1 Jun 2026 · ${c.paid} of 31 days paid`} wide
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button>{canAdjust && <Button variant="primary" icon={I.Plus} onClick={() => onAdjust(p)}>Add adjustment</Button>}</>}>
      <div className="grid @md:grid-cols-2 gap-5 text-[14px]">
        <div>
          <p className="eyebrow text-ink3 mb-1">Earnings</p>
          <ul className="divide-y divide-line/70">
            {row('Basic pay', amt(c.basic))}
            {row('Dearness allowance', amt(c.da), '20% of basic')}
            {row('House rent allowance', amt(c.hra), '30% of basic')}
            {row('Conveyance', amt(c.conv))}
            {row('Special allowance', amt(c.special))}
            {row('Full month', amt(c.gross), null, 'font-semibold')}
            {c.lop > 0 && row(`Loss of pay, ${c.lop} ${c.lop === 1 ? 'day' : 'days'}`, `− ${amt(c.gross - c.earned)}`, `${p.note || 'From Staff Attendance and Staff Leave'} · ${amt(c.gross)} × ${c.lop} ÷ 31`, 'text-bad')}
            {adj.map((a, i) => <React.Fragment key={i}>{row(`${a.type}`, `${a.type === 'Deduction' ? '−' : '+'} ${amt(a.amount)}`, a.reason, a.type === 'Deduction' ? 'text-bad' : 'text-ok')}</React.Fragment>)}
          </ul>
        </div>
        <div>
          <p className="eyebrow text-ink3 mb-1">Deductions</p>
          <ul className="divide-y divide-line/70">
            {row('PF, 12%', amt(c.pf), c.basicE > 15000 ? `On ${amt(15000)} (ceiling), not ${amt(c.basicE)}` : `On basic pay ${amt(c.basicE)}`)}
            {row('ESI, 0.75%', c.esiOn ? amt(c.esi) : 'Not applicable', c.esiOn ? `On ${amt(c.pay)}; wages are within ${amt(21000)}` : `Wages above the ${amt(21000)} ESI limit`)}
            {row('Professional Tax', amt(c.pt), `Telangana slab: ${c.pay <= 15000 ? 'up to ₹15,000 is nil' : c.pay <= 20000 ? '₹15,001 to ₹20,000' : 'above ₹20,000'}`)}
            {row('TDS (income tax)', amt(c.tds), c.tds ? 'Typed in by the Accountant on the structure' : 'No monthly amount entered')}
            {c.rec > 0 && row('Advance or loan recovery', amt(c.rec), 'From Advances & Loans')}
            {row('Total deductions', amt(c.ded), null, 'font-semibold')}
          </ul>
        </div>
      </div>
      <div className="mt-5 rounded-2xl bg-brand/8 px-4 py-3.5 flex items-center justify-between gap-3 flex-wrap">
        <span className="text-[14px] font-semibold">Net pay</span>
        <span className="font-display text-[24px] font-semibold tnum">{amt(c.net)}</span>
      </div>
      <p className="text-[12.5px] text-ink3 mt-3">School’s cost on top, not taken from net pay: employer PF {amt(c.erPf)}{c.esiOn ? `, employer ESI ${amt(c.erEsi)} (3.25%)` : ''}.</p>
    </Sheet>
  );
}

/* ======================= Generate Salary ======================= */
function Generate() {
  const toast = useToast();
  const { go } = useNav();
  const { role, year } = useRole();
  const canEdit = useCanEdit();
  // HR has View of Salary: days, leave and loss of pay only, never the money. The Principal and School Admin have
  // Full Salary but this page is View for them: they see every amount, check it and approve; the Accountant runs it.
  const { access: pageAcc, moduleAccess } = usePage();
  const seeMoney = moduleAccess === 'full';
  const oversight = pageAcc === 'view' && seeMoney && !year?.closed;
  const me = role.person.name;
  const [months, setMonths] = useState(() => MONTHS.map((m) => (m.id === 'oct' && role.id === 'principal' ? { ...m, status: 'waiting', sentBy: 'Suresh Babu', sentAt: 'Today, 10:15 AM' } : m)));
  const [cur, setCur] = useState('oct');
  const [adj, setAdj] = useState({});
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(null);
  const [adjFor, setAdjFor] = useState(null);
  const [af, setAf] = useState({ type: 'Bonus', amount: '', reason: '' });
  const [afErr, setAfErr] = useState({});
  const [send, setSend] = useState(false);
  const [approve, setApprove] = useState(false);
  const [back, setBack] = useState(false);
  const [backWhy, setBackWhy] = useState('');
  const [backErr, setBackErr] = useState('');
  const [pay, setPay] = useState(false);
  const [mode, setMode] = useState('Bank transfer');
  const [ref, setRef] = useState('');
  const [refErr, setRefErr] = useState('');
  const [lock, setLock] = useState(false);
  const [newMonth, setNewMonth] = useState(false);
  const [nm, setNm] = useState('November 2026');
  const [tds, setTds] = useState(false);
  const [tdsDone, setTdsDone] = useState(false);
  const [recalc, setRecalc] = useState(false);
  const m = months.find((x) => x.id === cur);
  const isOct = cur === 'oct';
  const st = m.status;
  const setSt = (s, extra = {}) => setMonths((x) => x.map((y) => (y.id === cur ? { ...y, status: s, ...extra } : y)));
  const adjList = Object.entries(adj).flatMap(([id, list]) => list.map((a) => ({ ...a, id })));
  const addSum = adjList.reduce((x, a) => x + (a.type === 'Deduction' ? 0 : a.amount), 0);
  const cutSum = adjList.reduce((x, a) => x + (a.type === 'Deduction' ? a.amount : 0), 0);
  const tot = isOct ? { gross: m.gross + addSum, ded: m.ded + cutSum, net: m.net + addSum - cutSum } : m;
  const editable = canEdit && isOct && (st === 'open' || st === 'calculated');
  const approver = m.sentBy === 'Lakshmi Rao' ? 'Anita Sharma (School Admin)' : 'Lakshmi Rao (Principal)';
  // Approving stays with the approvers although the page is View for them. Nobody approves a run they sent.
  const canApprove = !year?.closed && st === 'waiting' && m.sentBy !== me && ((role.id === 'principal') || (role.id === 'schooladmin' && m.sentBy === 'Lakshmi Rao'));
  const flagsOf = (p) => (isOct ? [p.id === 'P02' && tdsDone ? null : p.flag, adj[p.id] && 'Adjustment added'] : [p.none ? p.flag : null]).filter((f) => f && (seeMoney || f !== 'No TDS amount'));
  const rowCalc = (p) => calc(isOct ? (p.id === 'P02' && tdsDone ? { ...p, tds: 2400 } : p) : { ...p, lop: 0 }, { adj: isOct ? adj[p.id] || [] : [], lop: isOct ? p.lop || 0 : 0 });
  const t = q.trim().toLowerCase();
  const rows = PAY.filter((p) => (!t || p.name.toLowerCase().includes(t) || p.code.toLowerCase().includes(t) || p.desig.toLowerCase().includes(t)) &&
    (filter === 'all' || (filter === 'flag' && flagsOf(p).length > 0) || (filter === 'lop' && isOct && (p.lop || 0) > 0) || (filter === 'adj' && isOct && !!adj[p.id])));

  const saveAdj = () => {
    const e = {};
    const n = Number(String(af.amount).replace(/[^\d]/g, ''));
    if (!n) e.amount = 'Enter an amount';
    if (!af.reason.trim()) e.reason = `Give a reason for this ${af.type.toLowerCase()}`;
    setAfErr(e);
    if (Object.keys(e).length) return false;
    const p = adjFor;
    setAdj((x) => ({ ...x, [p.id]: [...(x[p.id] || []), { type: af.type, amount: n, reason: af.reason.trim() }] }));
    toast({ title: `${af.type} of ${amt(n)} added for ${p.name}`, body: `Reason kept with it: “${af.reason.trim()}”`, undo: () => setAdj((x) => { const l = (x[p.id] || []).slice(0, -1); const y = { ...x }; l.length ? (y[p.id] = l) : delete y[p.id]; return y; }) });
  };
  const doRecalc = () => { setRecalc(true); setTimeout(() => { setRecalc(false); setSt('calculated'); toast({ title: 'October recalculated', body: 'Attendance and leave up to 10:42 AM today. 2 rows changed.' }); }, 900); };

  return (
    <div className="flex flex-col gap-5 @lg:gap-6">
      <div>
        <ModuleHead sub="Kukatpally campus · one salary run a month · pay day is the last working day"
          actions={canEdit && <Button variant="secondary" icon={I.CalendarPlus} onClick={() => { setNm('November 2026'); setNewMonth(true); }}>Open a month</Button>} />
        <Stats items={[
          { label: 'Salary structures', value: '85 of 86', sub: '1 missing · Rekha Nair', tone: 'warn', icon: 'FileSpreadsheet', onClick: canOpen(role, 'salary', 'structures') ? () => go('salary', { page: 'structures' }) : undefined },
          { label: 'Runs this year', value: '7', sub: 'April to October 2026', icon: 'CalendarRange' },
          { label: 'Waiting for approval', value: String(months.filter((x) => x.status === 'waiting').length), sub: months.some((x) => x.status === 'waiting') ? 'October 2026' : 'Nothing waiting', tone: months.some((x) => x.status === 'waiting') ? 'warn' : undefined, icon: 'Hourglass' },
          seeMoney ? { label: 'October net pay', value: inrShort(MONTHS[0].net + addSum - cutSum), sub: `${amt(MONTHS[0].net + addSum - cutSum)} · 86 staff`, icon: 'Wallet' }
            : { label: 'Loss of pay in October', value: '3.5 days', sub: '3 staff · from attendance and leave', icon: 'CalendarX2' },
        ]} />
      </div>

      <Split side={340}>
        <Col>
          {/* The run */}
          <Card className="overflow-hidden">
            <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <h3 className="font-semibold text-[15px] leading-tight flex items-center gap-2 flex-wrap">{m.label} <StatusPill s={st} /></h3>
                <p className="text-[13px] text-ink3 mt-0.5">{m.staff} staff · {isOct ? (st === 'paid' || st === 'locked' ? `Paid ${m.paid}` : 'Pay day Sat 31 Oct') : `Paid ${m.paid} · approved by ${m.by}`}</p>
              </div>
              {!isOct && <Button size="sm" variant="ghost" icon={I.ArrowLeft} onClick={() => setCur('oct')}>Back to October</Button>}
            </div>
            {/* Steps */}
            <ol className="px-5 pb-4 grid grid-cols-6 gap-1.5" aria-label="Salary run steps">
              {STEPS.map(([k, l], i) => {
                const at = STEPS.findIndex((s) => s[0] === st);
                const done = i < at, on = i === at;
                return (
                  <li key={k} className="min-w-0">
                    <span className={cx('block h-1.5 rounded-full', done ? 'bg-ok' : on ? 'bg-brand' : 'bg-sunken')} />
                    <span className={cx('hidden @md:block text-[11.5px] font-semibold mt-1.5 truncate', on ? 'text-brand' : done ? 'text-ink2' : 'text-ink3')}>{l}</span>
                  </li>
                );
              })}
            </ol>
            <p className="@md:hidden px-5 -mt-2 pb-3 text-[12.5px] text-ink3">Step {STEPS.findIndex((s) => s[0] === st) + 1} of 6 · {STATUS_LABEL[st]}</p>
            <div className="px-5 pb-4 flex flex-col gap-3">
              {isOct && (st === 'open' || st === 'calculated') && <Banner tone="info">Attendance and approved leave up to <b className="font-semibold">Fri 9 Oct, 10:42 AM</b> are in. They keep coming in by themselves until the month is sent for approval.</Banner>}
              {st === 'waiting' && <Banner tone="warn" title={`Sent by ${m.sentBy} · ${m.sentAt}.`}>{canApprove ? 'Check the totals and approve, or send it back with a reason.' : `Waiting for ${approver}. Amounts cannot change now unless it is sent back.`}</Banner>}
              {st === 'approved' && <Banner tone="ok" title="Approved.">86 salary slips are made and each staff member was told. Amounts are frozen. Pay the staff, then mark it paid.</Banner>}
              {st === 'paid' && <Banner tone="ok" title={`Paid ${m.paid}.`}>{isOct ? 'One salary entry is in the Day Book on the date paid. ' : 'In the Day Book. '}Corrections go in next month as an adjustment.</Banner>}
              {st === 'locked' && <Banner tone="info" icon={I.Lock} title="Locked for good.">This run never changes. A correction is an adjustment, with a reason, in a following month.</Banner>}
              {!canEdit && !canApprove && <Banner tone="info" icon={I.Eye}>{oversight ? `Suresh Babu prepares the salary and pays it. ${st === 'open' || st === 'calculated' ? (role.id === 'principal' ? 'It comes to you for approval when he sends it.' : 'The Principal approves it when he sends it.') : 'You see every amount here.'}` : seeMoney ? 'View only. This year is closed.' : 'View only. Check that leave and attendance reach the salary; the Accountant runs it. Pay amounts are not shown.'}</Banner>}
            </div>
            {(canEdit || canApprove) && (
              <div className="px-5 pb-5 flex gap-2 flex-wrap">
                {editable && <>
                  <Button variant="primary" icon={I.Send} onClick={() => setSend(true)}>Send for approval</Button>
                  <Button variant="secondary" icon={I.RefreshCw} loading={recalc} onClick={doRecalc}>{st === 'open' ? 'Calculate' : 'Recalculate'}</Button>
                  <Button variant="ghost" icon={I.Plus} onClick={() => { setAdjFor(PAY[4]); setAf({ type: 'Bonus', amount: '', reason: '' }); setAfErr({}); }}>Add adjustment</Button>
                </>}
                {st === 'waiting' && (canApprove ? <>
                  <Button variant="primary" icon={I.Check} onClick={() => setApprove(true)}>Approve salary</Button>
                  <Button variant="secondary" onClick={() => { setBack(true); setBackWhy(''); setBackErr(''); }}>Send back</Button>
                </> : canEdit && <>
                  <Button variant="secondary" icon={I.Bell} onClick={() => toast({ title: `Reminder sent to ${approver.split(' (')[0]}`, body: 'In Approvals and on WhatsApp' })}>Remind {approver.split(' ')[0]}</Button>
                  {m.sentBy === me && <Button variant="ghost" icon={I.Undo2} onClick={() => { setSt('calculated', { sentBy: null }); toast({ title: 'Taken back from approval', body: 'You can change it and send it again.' }); }}>Take back to change</Button>}
                </>)}
                {canEdit && st === 'approved' && <>
                  <Button variant="primary" icon={I.Banknote} onClick={() => { setPay(true); setRef(''); setRefErr(''); }}>Mark paid</Button>
                  <Button variant="secondary" icon={I.FileDown} onClick={() => toast({ title: 'Saved: SPS-salary-Oct-2026-HDFC.xlsx', body: '82 staff by bank transfer · 4 by cheque · upload it in HDFC net banking' })}>Bank transfer file</Button>
                  <Button variant="ghost" icon={I.ReceiptText} onClick={() => go('salary', { page: 'slips' })}>See slips</Button>
                </>}
                {canEdit && (st === 'paid' || st === 'locked') && <>
                  <Button variant="secondary" icon={I.FileDown} onClick={() => toast({ title: `Saved: PF-ECR-${m.short}-2026.txt`, body: `${amt(isOct ? OCT.pf : 106200)} employee + same employer share · upload on the EPFO portal` })}>PF statement</Button>
                  <Button variant="secondary" icon={I.FileDown} onClick={() => toast({ title: `Saved: ESI-${m.short}-2026.xlsx`, body: '21 staff within the ESI limit · upload on the ESIC portal' })}>ESI statement</Button>
                  {st === 'paid' && <Button variant="ghost" icon={I.Lock} onClick={() => setLock(true)}>Lock now</Button>}
                </>}
              </div>
            )}
          </Card>

          {/* Checks */}
          {isOct && (st === 'open' || st === 'calculated') && (
            <Card>
              <CardHead title="Check before sending" sub="Flags from the rules in Salary Settings" icon={I.ListChecks} />
              <ul className="divide-y divide-line/70 border-t border-line/70">
                <li className="flex items-center gap-3 px-5 py-3">
                  <span className="w-9 h-9 rounded-xl bg-warn/12 text-warn grid place-items-center shrink-0"><I.FileWarning size={18} /></span>
                  <div className="min-w-0 flex-1"><p className="font-semibold text-[14px]">1 staff has no salary structure</p><p className="text-[12.5px] text-ink3 truncate">Rekha Nair, PRT, joined Mon 5 Oct. Left out until a structure exists.</p></div>
                  {canEdit && <Button size="sm" variant="secondary" onClick={() => go('salary', { page: 'structures' })}>Add</Button>}
                </li>
                <li className="flex items-center gap-3 px-5 py-3">
                  <span className="w-9 h-9 rounded-xl bg-warn/12 text-warn grid place-items-center shrink-0"><I.CalendarX2 size={18} /></span>
                  <div className="min-w-0 flex-1"><p className="font-semibold text-[14px]">Attendance missing for 1 staff on 1 day</p><p className="text-[12.5px] text-ink3 truncate">Swapna Reddy, today. Not in yet and no leave asked.</p></div>
                  {canOpen(role, 'attendance', 'staff') ? <Button size="sm" variant="secondary" onClick={() => go('attendance', { page: 'staff' })}>Open</Button>
                    : canEdit && <Button size="sm" variant="ghost" onClick={() => toast({ title: 'HR asked to complete it', body: 'Shalini Verma gets a notification', tone: 'info' })}>Ask HR</Button>}
                </li>
                {!tdsDone && seeMoney && (
                  <li className="flex items-center gap-3 px-5 py-3">
                    <span className="w-9 h-9 rounded-xl bg-warn/12 text-warn grid place-items-center shrink-0"><I.Receipt size={18} /></span>
                    <div className="min-w-0 flex-1"><p className="font-semibold text-[14px]">1 staff has no TDS amount</p><p className="text-[12.5px] text-ink3 truncate">Srinivas Murthy · yearly pay ₹12.24 L is above the ₹12 L limit set in Salary Settings</p></div>
                    {canEdit && <Button size="sm" variant="secondary" onClick={() => setTds(true)}>Enter TDS</Button>}
                  </li>
                )}
                <li className="flex items-center gap-3 px-5 py-3">
                  <span className="w-9 h-9 rounded-xl bg-info/10 text-info grid place-items-center shrink-0"><I.Info size={18} /></span>
                  <div className="min-w-0 flex-1"><p className="font-semibold text-[14px]">3 staff have loss of pay · 3.5 days</p><p className="text-[12.5px] text-ink3 truncate">Bhaskar Rao 2, Lakshmamma 1, Deepak Verma ½ (3 late marks)</p></div>
                  <Button size="sm" variant="ghost" onClick={() => setFilter('lop')}>Show</Button>
                </li>
              </ul>
            </Card>
          )}

        </Col>

        <Col>
          {seeMoney && <Card>
            <CardHead title={`Totals · ${m.short} 2026`} sub={`All ${m.staff} staff`} />
            <ul className="px-5 pb-4 text-[14px] flex flex-col gap-1.5 tnum">
              <li className="flex justify-between"><span className="text-ink2">Gross pay</span><b className="font-semibold">{amt(tot.gross)}</b></li>
              {isOct && <>
                <li className="flex justify-between text-[13px]"><span className="text-ink3 pl-3">PF (employee 12%)</span><span>{amt(OCT.pf)}</span></li>
                <li className="flex justify-between text-[13px]"><span className="text-ink3 pl-3">ESI (employee 0.75%)</span><span>{amt(OCT.esi)}</span></li>
                <li className="flex justify-between text-[13px]"><span className="text-ink3 pl-3">Professional Tax</span><span>{amt(OCT.pt)}</span></li>
                <li className="flex justify-between text-[13px]"><span className="text-ink3 pl-3">TDS</span><span>{amt(OCT.tds)}</span></li>
                <li className="flex justify-between text-[13px]"><span className="text-ink3 pl-3">Loans and advances</span><span>{amt(OCT.rec)}</span></li>
                {cutSum > 0 && <li className="flex justify-between text-[13px]"><span className="text-ink3 pl-3">One-time deductions</span><span>{amt(cutSum)}</span></li>}
              </>}
              <li className="flex justify-between"><span className="text-ink2">Deductions</span><b className="font-semibold">{amt(tot.ded)}</b></li>
              <li className="flex justify-between border-t border-line pt-2 mt-1"><span className="font-semibold">Net pay</span><b className="font-display text-[20px] font-semibold">{amt(tot.net)}</b></li>
            </ul>
            {isOct && <div className="mx-5 mb-5 rounded-xl bg-sunken/70 px-3.5 py-3 text-[13px] tnum">
              <p className="font-semibold text-ink2">School’s cost on top</p>
              <p className="text-ink3 mt-0.5">Employer PF {amt(OCT.erPf)} · employer ESI {amt(OCT.erEsi)}. Not taken from net pay.</p>
            </div>}
            {isOct && adjList.length > 0 && <div className="px-5 pb-5"><p className="eyebrow text-ink3 mb-1.5">Adjustments</p>{adjList.map((a, i) => <p key={i} className="text-[13px] flex justify-between gap-2"><span className="truncate">{byId(a.id).name} · {a.type}</span><span className="tnum shrink-0">{a.type === 'Deduction' ? '−' : '+'}{amt(a.amount)}</span></p>)}</div>}
          </Card>}
          <Card>
            <CardHead title="Salary months" sub="2026–27 · tap one to open it" />
            <ul className="px-2 pb-2">
              {months.map((x) => (
                <li key={x.id}>
                  <button onClick={() => setCur(x.id)} className={cx('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition', cur === x.id ? 'bg-brand/8 ring-1 ring-brand/30' : 'hover:bg-sunken/70')}>
                    <span className="min-w-0 flex-1"><span className="block font-semibold text-[14px]">{x.label}</span><span className="block text-[12.5px] text-ink3 tnum truncate">{x.staff} staff{seeMoney ? ` · net ${inrShort(x.id === 'oct' ? x.net + addSum - cutSum : x.net)}` : ''}{x.paid ? ` · paid ${x.paid}` : ''}</span></span>
                    <StatusPill s={x.status} />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </Col>
      </Split>

      {/* Staff rows */}
      <Card className="overflow-hidden">
        <Toolbar>
          <SearchBox id="sal-search" value={q} onChange={setQ} placeholder="Staff name, ID or designation" />
          <div className="overflow-x-auto no-scrollbar shrink-0"><Segmented value={filter} onChange={setFilter} options={[{ value: 'all', label: 'Everyone' }, { value: 'flag', label: 'Flagged' }, { value: 'lop', label: 'Loss of pay' }, { value: 'adj', label: 'Adjusted' }]} /></div>
          {seeMoney && <ExportButton what={`${m.label} salary`} />}
        </Toolbar>
        {rows.length === 0 ? <Empty icon={I.SearchX} title="No staff match" body={filter === 'adj' ? 'No adjustments yet. Open a row to add a bonus, arrears or a deduction.' : 'Try a different search or filter.'} action={<Button variant="secondary" onClick={() => { setQ(''); setFilter('all'); }}>Show everyone</Button>} /> : (
          <>
            <div className="hidden @lg:block overflow-x-auto scroll-thin">
              <table className={cx('w-full text-[13.5px]', seeMoney ? 'min-w-[1040px]' : 'min-w-[640px]')}>
                <thead>
                  <tr className="text-[12px] text-ink3 font-semibold border-b border-line text-right">
                    <th className="sticky left-0 z-10 bg-surface text-left pl-5 pr-3 py-3 font-semibold">Staff member</th>
                    <th className="px-2 py-3 font-semibold">Paid days</th><th className="px-2 py-3 font-semibold">Leave</th><th className="px-2 py-3 font-semibold">Loss of pay</th>
                    {seeMoney && <><th className="px-2 py-3 font-semibold">Gross</th><th className="px-2 py-3 font-semibold">PF</th><th className="px-2 py-3 font-semibold">ESI</th><th className="px-2 py-3 font-semibold">PT</th><th className="px-2 py-3 font-semibold">TDS</th><th className="px-2 py-3 font-semibold">Loans</th>
                    <th className="px-2 py-3 font-semibold">Net</th></>}<th className="pl-2 pr-5 py-3 font-semibold text-left">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const c = p.none ? null : rowCalc(p);
                    const fl = flagsOf(p);
                    return (
                      <tr key={p.id} onClick={() => seeMoney && !p.none && setOpen(p)} className={cx('border-b border-line/70 last:border-0 text-right tnum group', seeMoney && !p.none && 'cursor-pointer hover:bg-sunken/60')}>
                        <td className="sticky left-0 z-10 bg-surface group-hover:bg-sunken text-left pl-5 pr-3 py-2.5 whitespace-nowrap"><p className="font-semibold leading-tight font-sans">{p.name}</p><p className="text-[12px] text-ink3 font-sans">{p.desig}</p></td>
                        {c ? <>
                          <td className="px-2">{c.paid}</td>
                          <td className="px-2">{p.leave || '—'}</td>
                          <td className={cx('px-2', c.lop && 'text-bad font-semibold')}>{c.lop || '—'}</td>
                          {seeMoney && <>
                          <td className="px-2">{amt(c.pay)}</td>
                          <td className="px-2">{amt(c.pf)}</td>
                          <td className="px-2">{c.esi ? amt(c.esi) : '—'}</td>
                          <td className="px-2">{c.pt ? amt(c.pt) : '—'}</td>
                          <td className={cx('px-2', fl.includes('No TDS amount') && 'text-warn font-semibold')}>{c.tds ? amt(c.tds) : '0'}</td>
                          <td className="px-2">{c.rec || c.cut ? amt(c.rec + c.cut) : '—'}</td>
                          <td className="px-2 font-semibold">{amt(c.net)}</td>
                          </>}
                        </> : <td colSpan={seeMoney ? 10 : 3} className="px-2 text-center text-ink3 font-sans">Not paid until a salary structure is added</td>}
                        <td className="pl-2 pr-5 text-left"><div className="flex gap-1 flex-wrap">{fl.map((f) => <Pill key={f} tone={f === 'Adjustment added' ? 'brand' : f.startsWith('Leaving') ? 'neutral' : 'warn'} className="!h-5 !text-[11px]">{f}</Pill>)}</div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ul className="@lg:hidden divide-y divide-line/70">
              {rows.map((p) => {
                const c = p.none ? null : rowCalc(p);
                const fl = flagsOf(p);
                return (
                  <li key={p.id}>
                    <button onClick={() => seeMoney && !p.none && setOpen(p)} className={cx('w-full flex items-center gap-3 px-4 py-3 text-left', seeMoney && 'active:bg-sunken')}>
                      <Avatar name={p.name} size={42} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[15px] truncate">{p.name}</p>
                        <p className="text-[13px] text-ink3 truncate">{c ? `${c.paid} days paid${seeMoney ? ` · gross ${amt(c.pay)}` : p.leave ? ` · ${p.leave} on leave` : ''}` : 'No salary structure'}</p>
                        {(fl.length > 0 || (c && c.lop > 0)) && <div className="flex gap-1.5 mt-1.5 flex-wrap">{c && c.lop > 0 && <Pill tone="bad" className="!h-[22px] !text-[11.5px]">{c.lop} LOP</Pill>}{fl.map((f) => <Pill key={f} tone={f === 'Adjustment added' ? 'brand' : 'warn'} className="!h-[22px] !text-[11.5px]">{f}</Pill>)}</div>}
                      </div>
                      {c && seeMoney && <span className="text-right shrink-0"><span className="block font-semibold tnum">{amt(c.net)}</span><span className="text-[12px] text-ink3">net</span></span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="px-4 py-3 border-t border-line text-[13px] text-ink3 tnum">Showing {rows.length} of {m.staff} staff{seeMoney ? ` · totals above are for all ${m.staff}` : ''}</div>
          </>
        )}
      </Card>

      <Breakdown p={open} open={!!open} onClose={() => setOpen(null)} adj={isOct ? adj[open?.id] || [] : []} canAdjust={editable} onAdjust={(p) => { setOpen(null); setAdjFor(p); setAf({ type: 'Bonus', amount: '', reason: '' }); setAfErr({}); }} />
      <FormSheet open={!!adjFor} onClose={() => setAdjFor(null)} title="Add adjustment" sub="For October 2026 only. Every adjustment keeps its reason." submitLabel="Add adjustment" onSubmit={saveAdj}>
        <Field label="Staff member" required id="adj-who"><Select id="adj-who" value={adjFor?.id || ''} onChange={(v) => setAdjFor(byId(v))} options={PAY.filter((p) => !p.none).map((p) => ({ value: p.id, label: `${p.name} · ${p.desig}` }))} /></Field>
        <Field label="Type" required id="adj-type"><Segmented value={af.type} onChange={(v) => setAf({ ...af, type: v })} options={['Bonus', 'Arrears', 'Deduction', 'Other']} className="w-full" /></Field>
        <Field label="Amount" required id="adj-amt" error={afErr.amount}>
          <div className="relative"><span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3">₹</span><Input id="adj-amt" inputMode="numeric" value={af.amount} onChange={(e) => { setAf({ ...af, amount: e.target.value.replace(/[^\d]/g, '') }); setAfErr({}); }} error={afErr.amount} className="pl-8 tnum" placeholder="2,000" /></div>
        </Field>
        <Field label="Reason" required id="adj-why" error={afErr.reason}><Textarea id="adj-why" value={af.reason} onChange={(v) => { setAf({ ...af, reason: v }); setAfErr({}); }} rows={2} placeholder={af.type === 'Arrears' ? 'Like: increment from 1 Sep paid late' : 'Like: science fair coordination'} /></Field>
      </FormSheet>
      <ConfirmSheet open={send} onClose={() => setSend(false)} title="Send October 2026 salary for approval?" confirmLabel={me === 'Lakshmi Rao' ? 'Send to Anita Sharma for approval' : 'Send to Lakshmi Rao for approval'}
        onConfirm={() => { const by = me; setSt('waiting', { sentBy: by, sentAt: 'Today, 10:44 AM' }); toast({ title: 'Sent for approval', body: by === 'Lakshmi Rao' ? 'You sent it, so Anita Sharma (School Admin) approves it.' : 'Lakshmi Rao gets it in Approvals and on WhatsApp.' }); }}>
        <div className="flex flex-col gap-3 text-[14px] text-ink2">
          <p><b className="font-semibold text-ink">85 staff, net {amt(tot.net)}</b> (gross {amt(tot.gross)}). Rekha Nair is left out until she has a salary structure.</p>
          <p>Attendance after today is not in yet. Leave approved after today is adjusted in November’s salary.</p>
          {adjList.length > 0 && <p>{adjList.length} adjustment{adjList.length > 1 ? 's' : ''} included, each with its reason.</p>}
        </div>
      </ConfirmSheet>
      <ConfirmSheet open={approve} onClose={() => setApprove(false)} title="Approve October 2026 salary?" confirmLabel="Approve salary for 86 staff"
        onConfirm={() => { setSt('approved', { by: me }); toast({ title: 'October 2026 salary approved', body: '86 salary slips made. Each staff member is told. Amounts are now frozen.' }); }}>
        <div className="flex flex-col gap-3 text-[14px] text-ink2">
          <DL rows={[['Net pay', amt(tot.net)], ['Gross pay', amt(tot.gross)], ['Deductions', amt(tot.ded)], ['School’s PF and ESI share', amt(OCT.erPf + OCT.erEsi)]]} />
          <p>After approval, the amounts cannot change. A mistake is put right with an adjustment in November. It reaches the Day Book only when it is marked paid.</p>
        </div>
      </ConfirmSheet>
      <Sheet open={back} onClose={() => setBack(false)} title="Send October back to Suresh Babu?" sub="He sees your reason and can change it."
        footer={<><Button variant="ghost" onClick={() => setBack(false)}>Cancel</Button><Button variant="primary" onClick={() => { if (!backWhy.trim()) { setBackErr('Say what needs to change'); return; } setSt('calculated', { sentBy: null }); setBack(false); toast({ title: 'Sent back to Suresh Babu', body: backWhy.trim() }); }}>Send back</Button></>}>
        <Field label="What needs to change" required id="back-why" error={backErr}><Textarea id="back-why" value={backWhy} onChange={(v) => { setBackWhy(v); setBackErr(''); }} rows={3} placeholder="Like: add Dasara bonus for drivers before approval" /></Field>
      </Sheet>
      <FormSheet open={pay} onClose={() => setPay(false)} title="Mark October 2026 paid" sub="Only now the salary goes into the Day Book, on the date paid." submitLabel={`Mark paid · ${amt(tot.net)}`}
        onSubmit={() => { if (mode !== 'Cash' && !/^[A-Za-z0-9-]{6,24}$/.test(ref.trim())) { setRefErr(ref.trim() ? 'This does not look like a bank reference. Use 6 to 24 letters or digits.' : 'Enter the bank batch or UTR reference'); return false; } setSt('paid', { paid: 'Fri 9 Oct' }); toast({ title: 'October 2026 marked paid', body: `${amt(tot.net)} added to the Day Book on 9 Oct 2026 as one salary entry.` }); }}>
        <Field label="Paid on" required id="pay-date"><Input id="pay-date" defaultValue="09-10-2026" placeholder="DD-MM-YYYY" /></Field>
        <Field label="How was it paid?" required id="pay-mode"><Segmented value={mode} onChange={(v) => { setMode(v); setRefErr(''); }} options={['Bank transfer', 'Cheque', 'Cash']} className="w-full" /></Field>
        {mode !== 'Cash' && <Field label={mode === 'Cheque' ? 'Cheque numbers' : 'Bank batch reference or UTR'} required id="pay-ref" error={refErr}><Input id="pay-ref" value={ref} onChange={(e) => { setRef(e.target.value); setRefErr(''); }} error={refErr} className="font-mono" placeholder={mode === 'Cheque' ? '004581-004584' : 'HDFCB26100941'} /></Field>}
        <Field label="From account" id="pay-acc"><Select id="pay-acc" value="HDFC Bank · Current A/c XXXX4417" onChange={() => {}} options={['HDFC Bank · Current A/c XXXX4417', 'SBI Kukatpally · Current A/c XXXX2093']} /></Field>
        {mode === 'Bank transfer' && <Button type="button" variant="ghost" className="self-start -ml-2" icon={I.FileDown} onClick={() => toast({ title: 'Saved: SPS-salary-Oct-2026-HDFC.xlsx', body: '82 staff · upload in HDFC net banking' })}>Download bank transfer file</Button>}
      </FormSheet>
      <ConfirmSheet open={lock} onClose={() => setLock(false)} title={`Lock ${m.label} for good?`} confirmLabel={`Lock ${m.label}`}
        onConfirm={() => { setSt('locked'); toast({ title: `${m.label} locked`, body: 'Corrections from now on are adjustments in a following month.' }); }}>
        <p className="text-[14px] text-ink2">Nothing in this run can change after locking. It also locks by itself when the next month is approved.</p>
      </ConfirmSheet>
      <FormSheet open={newMonth} onClose={() => setNewMonth(false)} title="Open a month" sub="One salary run a month for each campus." submitLabel="Open month"
        onSubmit={() => { if (nm === 'October 2026') return false; toast({ title: `${nm} opened early`, body: 'Status Open. Attendance and leave come in as the month goes.' }); }}>
        <Field label="Month" required id="nm" error={nm === 'October 2026' ? 'October 2026 salary already exists for Kukatpally campus.' : ''} hint={nm !== 'October 2026' && 'It also opens by itself on Sun 1 Nov.'}>
          <Select id="nm" value={nm} onChange={setNm} error={nm === 'October 2026'} options={['October 2026', 'November 2026']} />
          {nm === 'October 2026' && <Button type="button" size="sm" variant="secondary" className="self-start" onClick={() => { setNewMonth(false); setCur('oct'); }}>Open the existing one</Button>}
        </Field>
        <Field label="Campus" id="nm-campus"><Select id="nm-campus" value="Kukatpally" onChange={() => {}} options={['Kukatpally', 'Miyapur campus']} /></Field>
      </FormSheet>
      <FormSheet open={tds} onClose={() => setTds(false)} title="TDS for Srinivas Murthy" sub="Typed in, not worked out by School OS. Saved on his salary structure." submitLabel="Save TDS"
        onSubmit={() => { setTdsDone(true); toast({ title: 'TDS ₹2,400 a month saved for Srinivas Murthy', body: 'On every slip until changed. Recalculated.' }); }}>
        <Field label="TDS per month" required id="tds-amt" hint="From his tax declaration for 2026–27 (new tax regime)"><Input id="tds-amt" defaultValue="2,400" className="tnum" /></Field>
        <Field label="From" id="tds-from"><Select id="tds-from" value="October 2026" onChange={() => {}} options={['October 2026', 'November 2026']} /></Field>
      </FormSheet>
    </div>
  );
}

/* ======================= Salary Structures ======================= */
function Structures() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('all');
  const [sel, setSel] = useState(new Set());
  const [open, setOpen] = useState(null);
  const [rev, setRev] = useState(false);
  const [pct, setPct] = useState('5');
  const [from, setFrom] = useState('01-11-2026');
  const [one, setOne] = useState(null);
  const [oneFrom, setOneFrom] = useState('01-11-2026');
  const [add, setAdd] = useState(false);
  const [addWho, setAddWho] = useState('T14');
  const [tpl, setTpl] = useState('PRT');
  const [imp, setImp] = useState(false);
  const rows = PAY.filter((p) => (dept === 'all' || p.dept === dept) && (!q || p.name.toLowerCase().includes(q.toLowerCase()) || p.desig.toLowerCase().includes(q.toLowerCase())));
  const depts = [...new Set(PAY.map((p) => p.dept))];
  const selRows = PAY.filter((p) => sel.has(p.id) && !p.none);
  const past = (d) => { const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(d); return m && new Date(+m[3], +m[2] - 1, +m[1]) < new Date(2026, 9, 1); };
  const TPL = { PRT: [15000, 1200, 2800], TGT: [20500, 1600, 3150], PGT: [29000, 1600, 4900], Driver: [10000, 1000, 2500], Office: [10000, 1000, 2000] };
  return (
    <div className="flex flex-col gap-5 @lg:gap-6">
      <div>
        <ModuleHead sub="Each staff member’s earnings and deductions, with every past version kept"
          actions={canEdit && <><Button variant="secondary" icon={I.Upload} className="hidden @md:inline-flex" onClick={() => setImp(true)}>Import</Button><Button variant="primary" icon={I.Plus} onClick={() => setAdd(true)}>Add structure</Button></>} />
        <Stats items={[
          { label: 'Active structures', value: '85', sub: 'of 86 staff', icon: 'FileSpreadsheet' },
          { label: 'Without a structure', value: '1', sub: 'Rekha Nair · joined 5 Oct', tone: 'warn', icon: 'FileWarning' },
          { label: 'Revised this year', value: '84', sub: '6% increment from 1 Jun', icon: 'TrendingUp' },
          { label: 'Monthly gross', value: inrShort(2784620), sub: 'before loss of pay', icon: 'Wallet' },
        ]} />
      </div>
      <Banner tone="warn" title="Rekha Nair has no salary structure." action={canEdit && <Button size="sm" variant="secondary" onClick={() => setAdd(true)}>Add one</Button>}>She is left out of October’s salary until one is added.</Banner>
      <div>
        <Chips value={dept} onChange={setDept} options={[{ value: 'all', label: 'All departments' }, ...depts.map((d) => ({ value: d, label: d, count: PAY.filter((p) => p.dept === d).length }))]} />
        <Card className="mt-3 overflow-hidden">
          <Toolbar>
            <SearchBox id="str-search" value={q} onChange={setQ} placeholder="Staff name or designation" />
            <ExportButton what="salary structures" />
          </Toolbar>
          {canEdit && <BulkBar count={sel.size} onClear={() => setSel(new Set())}>
            <Button size="sm" variant="secondary" icon={I.TrendingUp} onClick={() => setRev(true)}>Revise by a percentage</Button>
          </BulkBar>}
          <DataList rows={rows} minWidth={820} select={canEdit ? [sel, setSel] : undefined} onRow={(p) => !p.none && setOpen(p)} footer={`Showing ${rows.length} of 86 · amounts a month`}
            columns={[
              { key: 'n', label: 'Staff member', render: (p) => <div className="flex items-center gap-3"><Avatar name={p.name} size={34} /><div><p className="font-semibold leading-tight">{p.name}</p><p className="text-[12px] text-ink3">{p.desig}</p></div></div> },
              { key: 'g', label: 'Gross', align: 'right', render: (p) => (p.none ? '—' : amt(calc(p, { lop: 0 }).gross)) },
              { key: 'd', label: 'Deductions', align: 'right', render: (p) => (p.none ? '—' : amt(calc(p, { lop: 0 }).ded)) },
              { key: 'net', label: 'Net', align: 'right', render: (p) => (p.none ? '—' : <b className="font-semibold">{amt(calc(p, { lop: 0 }).net)}</b>) },
              { key: 'f', label: 'From', nowrap: true, render: (p) => (p.none ? <Pill tone="warn">No structure</Pill> : p.id === 'T09' ? '1 Nov 2025' : '1 Jun 2026') },
              { key: 'v', label: 'Version', render: (p) => (p.none ? '' : <Pill>v{p.id.startsWith('S') || p.id === 'T09' ? 2 : 3}</Pill>) },
            ]}
            mobile={(p) => ({ avatar: p.name, title: p.name, sub: p.none ? 'No salary structure' : `${p.desig} · net ${amt(calc(p, { lop: 0 }).net)}`, pills: p.none ? [<Pill key="w" tone="warn" className="!h-[22px] !text-[11.5px]">No structure</Pill>] : null })} />
        </Card>
      </div>

      <Sheet open={!!open} onClose={() => setOpen(null)} wide title={open ? `${open.name} · salary structure` : ''} sub={open ? `${open.desig} · v3 from 1 Jun 2026 · amounts a month` : ''}
        footer={canEdit && <><Button variant="ghost" icon={I.Copy} onClick={() => toast({ title: `Copy ${open.name}’s structure`, body: 'Pick the staff member it is for. You can change any line.', tone: 'info' })}>Copy to someone</Button><Button variant="primary" icon={I.TrendingUp} onClick={() => { setOne(open); setOpen(null); }}>Revise</Button></>}>
        {open && (() => {
          const c = calc(open, { lop: 0 });
          return (
            <div className="flex flex-col gap-5">
              <div className="grid @md:grid-cols-2 gap-5 text-[14px]">
                <div>
                  <p className="eyebrow text-ink3 mb-1">Earnings</p>
                  <ul className="divide-y divide-line/70">
                    {[['Basic pay', 'Fixed', c.basic], ['Dearness allowance', '20% of basic', c.da], ['House rent allowance', '30% of basic', c.hra], ['Conveyance', 'Fixed', c.conv], ['Special allowance', 'Fixed', c.special]].map(([k, how, v]) => <li key={k} className="flex justify-between gap-3 py-1.5"><span>{k}<span className="block text-[12px] text-ink3">{how}</span></span><span className="tnum">{amt(v)}</span></li>)}
                    <li className="flex justify-between py-1.5 font-semibold"><span>Gross</span><span className="tnum">{amt(c.gross)}</span></li>
                  </ul>
                </div>
                <div>
                  <p className="eyebrow text-ink3 mb-1">Deductions</p>
                  <ul className="divide-y divide-line/70">
                    <li className="flex justify-between gap-3 py-1.5"><span>PF<span className="block text-[12px] text-ink3">Worked out from Salary Settings · UAN XXXXXXXX{String(hash(open.name)).slice(-4)}</span></span><span className="tnum">{amt(c.pf)}</span></li>
                    <li className="flex justify-between gap-3 py-1.5"><span>ESI<span className="block text-[12px] text-ink3">{c.esiOn ? 'Wages within ₹21,000' : 'Not applicable'}</span></span><span className="tnum">{c.esi ? amt(c.esi) : '—'}</span></li>
                    <li className="flex justify-between gap-3 py-1.5"><span>Professional Tax<span className="block text-[12px] text-ink3">Telangana slab</span></span><span className="tnum">{amt(c.pt)}</span></li>
                    <li className="flex justify-between gap-3 py-1.5"><span>TDS per month<span className="block text-[12px] text-ink3">Typed in by the Accountant</span></span><span className="tnum">{amt(c.tds)}</span></li>
                    <li className="flex justify-between py-1.5 font-semibold"><span>Net</span><span className="tnum">{amt(c.net)}</span></li>
                  </ul>
                </div>
              </div>
              <DL rows={[['Salary account', `HDFC Bank · A/c XXXXXXXX${String(hash(open.name)).slice(-4)}`], ['PF applies', 'Yes'], ['ESI applies', c.esiOn ? 'Yes' : 'No, above the limit'], ['Changed by', 'Suresh Babu · 28 May 2026']]} />
              <div>
                <p className="eyebrow text-ink3 mb-2">Versions</p>
                <Timeline items={[
                  { icon: 'TrendingUp', tone: 'brand', what: `v3 · ${amt(c.gross)} gross · 6% increment`, when: 'From 1 Jun 2026 · by Suresh Babu, approved by Lakshmi Rao' },
                  { icon: 'TrendingUp', what: `v2 · ${amt(Math.round(c.gross / 1.06 / 10) * 10)} gross · 5% increment`, when: 'From 1 Jun 2025 · by Suresh Babu' },
                  { icon: 'FileText', what: `v1 · ${amt(Math.round(c.gross / 1.06 / 1.05 / 10) * 10)} gross · on joining`, when: 'From 1 Jun 2024' },
                ]} />
              </div>
            </div>
          );
        })()}
      </Sheet>
      <Sheet open={rev} onClose={() => setRev(false)} wide title={`Revise ${selRows.length} structures`} sub="A new version from the date you choose. Past salaries keep the old version."
        footer={<><Button variant="ghost" onClick={() => setRev(false)}>Cancel</Button><Button variant="primary" disabled={past(from)} onClick={() => { setRev(false); toast({ title: `${selRows.length} structures revised by ${pct}% from ${from}`, body: 'New versions saved. October is not changed.' }); setSel(new Set()); }}>Revise {selRows.length} structures</Button></>}>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Field label="Increase by (%)" required id="rev-pct"><Input id="rev-pct" value={pct} onChange={(e) => setPct(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" className="tnum" /></Field>
          <Field label="From" required id="rev-from" error={past(from) ? 'Revision before 01-10-2026 would be paid as arrears. Pick 01-11-2026 or after.' : ''}><Input id="rev-from" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="DD-MM-YYYY" error={past(from)} /></Field>
        </div>
        <p className="eyebrow text-ink3 mb-1.5">Preview</p>
        <ul className="rounded-xl border border-line divide-y divide-line/70 text-[14px]">
          {selRows.slice(0, 8).map((p) => { const g = calc(p, { lop: 0 }).gross; return <li key={p.id} className="flex justify-between gap-3 px-3.5 py-2.5"><span className="truncate">{p.name}</span><span className="tnum shrink-0">{amt(g)} → <b className="font-semibold">{amt(Math.round((g * (1 + (Number(pct) || 0) / 100)) / 10) * 10)}</b></span></li>; })}
          {selRows.length > 8 && <li className="px-3.5 py-2.5 text-ink3">and {selRows.length - 8} more</li>}
        </ul>
      </Sheet>
      <FormSheet open={!!one} onClose={() => setOne(null)} title={one ? `Revise ${one.name}` : ''} sub="Saved as a new version. Earlier slips keep the old amounts." submitLabel="Save new version"
        onSubmit={() => { if (past(oneFrom)) return false; toast({ title: `New version for ${one.name} from ${oneFrom}`, body: 'v4 saved. Recorded in the audit log.' }); }}>
        <Field label="Effective from" required id="one-from" error={past(oneFrom) ? 'Revision before 01-10-2026 will be paid as arrears in November. Pick 01-11-2026 or after, or add arrears in Generate Salary.' : ''}><Input id="one-from" value={oneFrom} onChange={(e) => setOneFrom(e.target.value)} error={past(oneFrom)} placeholder="DD-MM-YYYY" /></Field>
        {one && <div className="grid grid-cols-2 gap-3">
          <Field label="Basic pay" required id="one-basic"><Input id="one-basic" defaultValue={one.basic.toLocaleString('en-IN')} className="tnum" /></Field>
          <Field label="Special allowance" id="one-sp"><Input id="one-sp" defaultValue={one.special.toLocaleString('en-IN')} className="tnum" /></Field>
          <Field label="Conveyance" id="one-conv"><Input id="one-conv" defaultValue={one.conv.toLocaleString('en-IN')} className="tnum" /></Field>
          <Field label="TDS per month" id="one-tds" hint="Typed in, not worked out"><Input id="one-tds" defaultValue={(one.tds || 0).toLocaleString('en-IN')} className="tnum" /></Field>
        </div>}
        <Field label="Reason" required id="one-why"><Input id="one-why" defaultValue="Promotion from 1 Nov 2026" /></Field>
      </FormSheet>
      <FormSheet open={add} onClose={() => setAdd(false)} title="Add salary structure" sub="Start from the designation’s template, then change any line." submitLabel="Save structure"
        onSubmit={() => toast({ title: `Salary structure saved for ${byId(addWho).name}`, body: 'From 01-10-2026. She is included when October is recalculated.' })}>
        <Field label="Staff member" required id="add-who"><Select id="add-who" value={addWho} onChange={setAddWho} options={PAY.map((p) => ({ value: p.id, label: `${p.name} · ${p.desig}${p.none ? ' · no structure' : ''}` }))} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start from" id="add-tpl"><Select id="add-tpl" value={tpl} onChange={setTpl} options={Object.keys(TPL).map((k) => ({ value: k, label: `${k} template` }))} /></Field>
          <Field label="Effective from" required id="add-from"><Input id="add-from" defaultValue="01-10-2026" /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3" key={tpl}>
          <Field label="Basic" required id="add-basic"><Input id="add-basic" defaultValue={TPL[tpl][0].toLocaleString('en-IN')} className="tnum" /></Field>
          <Field label="Conveyance" id="add-conv"><Input id="add-conv" defaultValue={TPL[tpl][1].toLocaleString('en-IN')} className="tnum" /></Field>
          <Field label="Special" id="add-sp"><Input id="add-sp" defaultValue={TPL[tpl][2].toLocaleString('en-IN')} className="tnum" /></Field>
        </div>
        <p className="text-[13px] text-ink3 -mt-1">DA (20%) and HRA (30%) are worked out from basic. Gross with this template: <b className="text-ink font-semibold tnum">{amt(lines({ basic: TPL[tpl][0], conv: TPL[tpl][1], special: TPL[tpl][2] }).gross)}</b>.</p>
        <div className="rounded-xl border border-line divide-y divide-line/70">
          <SwitchLine title="PF applies" sub="UAN is asked for once, kept restricted" on />
          <SwitchLine title="ESI applies" sub="On, because wages are within ₹21,000" on={lines({ basic: TPL[tpl][0], conv: TPL[tpl][1], special: TPL[tpl][2] }).gross <= 21000} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="TDS per month" id="add-tds" hint="Typed in, not worked out"><Input id="add-tds" defaultValue="0" className="tnum" /></Field>
          <Field label="Bank account" id="add-bank" hint="Only salary staff see it"><Input id="add-bank" placeholder="A/c number and IFSC" /></Field>
        </div>
      </FormSheet>
      <ConfirmSheet open={imp} onClose={() => setImp(false)} title="Import salary structures from Excel?" confirmLabel="Choose file"
        onConfirm={() => toast({ title: 'Checking salary-structures.xlsx', body: 'Each row is checked first. Nothing changes until you confirm the preview.', tone: 'info' })}>
        <p className="text-[14px] text-ink2">Use the template with one row a staff member: staff ID, basic, conveyance, special allowance, TDS and the effective date. Every row becomes a new version; old versions stay.</p>
        <Button className="mt-3" size="sm" variant="soft" icon={I.Download} onClick={() => toast({ title: 'Saved: salary-structure-template.csv' })}>Download template</Button>
      </ConfirmSheet>
    </div>
  );
}
function SwitchLine({ title, sub, on: start }) {
  const [on, setOn] = useState(!!start);
  return <label className="flex items-center gap-3 px-3.5 py-3 text-[14px]"><span className="flex-1"><b className="font-semibold block">{title}</b>{sub && <span className="block text-[12.5px] text-ink3">{sub}</span>}</span><Switch on={on} onChange={setOn} label={title} /></label>;
}

/* ======================= Salary Slips / My Salary Slips ======================= */
const SLIP_MONTHS = [
  { id: 'sep', label: 'September 2026', paid: 'Wed 30 Sep 2026', f: 1, days: 30 },
  { id: 'aug', label: 'August 2026', paid: 'Mon 31 Aug 2026', f: 1, days: 31 },
  { id: 'jul', label: 'July 2026', paid: 'Fri 31 Jul 2026', f: 1, days: 31 },
  { id: 'jun', label: 'June 2026', paid: 'Tue 30 Jun 2026', f: 1, days: 30 },
  { id: 'may', label: 'May 2026', paid: 'Sat 30 May 2026', f: 0.943, days: 31 },
  { id: 'apr', label: 'April 2026', paid: 'Thu 30 Apr 2026', f: 0.943, days: 30 },
];
function slipFor(p, sm) { return calc(p, { lop: 0, f: sm.f, days: sm.days }); }

function SlipSheet({ p, sm, open, onClose, mine }) {
  const toast = useToast();
  const canEdit = useCanEdit();
  if (!p || !sm) return null;
  const c = slipFor(p, sm);
  const h = hash(p.name);
  const L = (k, v) => <li className="flex justify-between gap-3 py-1.5"><span className="text-ink2">{k}</span><span className="tnum">{v}</span></li>;
  return (
    <Sheet open={open} onClose={onClose} wide title={`Salary slip · ${sm.label}`} sub={mine ? 'Only you can see this slip' : `${p.name} · ${p.code}`}
      footer={<>
        <Button variant="ghost" icon={I.Printer} onClick={() => toast({ title: 'Sent to the printer', body: `${sm.label} slip` })}>Print</Button>
        {!mine && canEdit && <Button variant="secondary" icon={I.MessageCircle} onClick={() => toast({ title: `Slip sent to ${p.name}`, body: 'WhatsApp, as a PDF only they can open' })}>Send</Button>}
        <Button variant="primary" icon={I.Download} onClick={() => toast({ title: `Saved: Salary-slip-${sm.label.replace(' ', '-')}-${p.code}.pdf` })}>Download PDF</Button>
      </>}>
      <div className="rounded-2xl border border-line overflow-hidden text-[14px]">
        <div className="flex items-start justify-between gap-3 px-4 py-3 bg-sunken/60 flex-wrap">
          <div><p className="font-display font-semibold text-[16px]">Sunrise Public School</p><p className="text-[12.5px] text-ink3">Kukatpally, Hyderabad · SPS-HYD-001</p></div>
          <div className="text-right text-[12.5px]"><p className="font-semibold">{sm.label}</p><p className="text-ink3">Paid {sm.paid}</p></div>
        </div>
        <div className="px-4 pt-3">
          <dl className="grid grid-cols-2 @md:grid-cols-4 gap-x-4 gap-y-2.5 text-[13px]">
            {[['Name', p.name], ['Staff ID', p.code], ['Designation', p.desig], ['Department', p.dept], ['Days paid', `${c.paid} of ${sm.days}`], ['PAN', `XXXXXX${String(h).slice(-3)}K`], ['UAN', `XXXXXXXX${String(h).slice(-4)}`], ['Bank', `HDFC · XXXX${String(h).slice(-4)}`]].map(([k, v]) => <div key={k} className="min-w-0"><dt className="text-[11.5px] text-ink3 font-semibold">{k}</dt><dd className="truncate">{v}</dd></div>)}
          </dl>
        </div>
        <div className="grid @md:grid-cols-2 gap-x-6 px-4 py-3">
          <div>
            <p className="eyebrow text-ink3 mt-2 mb-1">Earnings</p>
            <ul className="divide-y divide-line/70">{L('Basic pay', amt(c.basic))}{L('Dearness allowance', amt(c.da))}{L('House rent allowance', amt(c.hra))}{L('Conveyance', amt(c.conv))}{L('Special allowance', amt(c.special))}
              <li className="flex justify-between py-1.5 font-semibold"><span>Total earnings</span><span className="tnum">{amt(c.pay)}</span></li></ul>
          </div>
          <div>
            <p className="eyebrow text-ink3 mt-2 mb-1">Deductions</p>
            <ul className="divide-y divide-line/70">{L('Provident Fund', amt(c.pf))}{c.esiOn && L('ESI', amt(c.esi))}{L('Professional Tax', amt(c.pt))}{L('TDS', amt(c.tds))}{c.rec > 0 && L('Loan or advance', amt(c.rec))}
              <li className="flex justify-between py-1.5 font-semibold"><span>Total deductions</span><span className="tnum">{amt(c.ded)}</span></li></ul>
          </div>
        </div>
        <div className="mx-4 mb-4 rounded-xl bg-brand/8 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div><p className="font-semibold">Net pay</p><p className="text-[12.5px] text-ink2">{words(c.net)}</p></div>
          <p className="font-display text-[24px] font-semibold tnum">{amt(c.net)}</p>
        </div>
        <p className="px-4 pb-3 text-[12px] text-ink3">School’s share, not taken from your pay: PF {amt(c.erPf)}{c.esiOn ? `, ESI ${amt(c.erEsi)}` : ''}. Made by the computer from the approved salary; no signature needed.</p>
      </div>
    </Sheet>
  );
}

function Slips({ access }) {
  if (access === 'own') return <MySlips />;
  return <AllSlips />;
}

function MySlips() {
  const toast = useToast();
  const p = usePerson();
  const [view, setView] = useState(null);
  const [per, setPer] = useState(PERIODS.finyear);
  const shown = SLIP_MONTHS.filter((sm) => inPeriod(isoOf(sm.paid), per));
  const before = per.to < '2026-04-01';
  const latest = slipFor(p, SLIP_MONTHS[0]);
  const ytd = SLIP_MONTHS.reduce((a, sm) => { const c = slipFor(p, sm); return { pay: a.pay + c.pay, pf: a.pf + c.pf, pt: a.pt + c.pt, tds: a.tds + c.tds, net: a.net + c.net }; }, { pay: 0, pf: 0, pt: 0, tds: 0, net: 0 });
  const yearly = ytd.pay + latest.pay * 6;
  const taxable = Math.max(0, yearly - 75000);
  return (
    <div>
      <ModuleHead sub="Only your own slips. Nobody else’s salary shows here." />
      <div className="flex flex-col gap-5 @lg:gap-6">
      <Banner tone="info" title="October 2026 slip:">ready after the Principal approves October’s salary, usually by 30 Oct. You get a WhatsApp message.</Banner>
      <Split side={340}>
        <Col>
          <Card className="p-5 flex flex-col @md:flex-row @md:items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] text-ink3 font-semibold">Last paid · September 2026</p>
              <p className="font-display text-[32px] font-semibold tnum leading-tight mt-0.5">{amt(latest.net)}</p>
              <p className="text-[13px] text-ink3 mt-0.5">Paid Wed 30 Sep to HDFC Bank XXXX{String(hash(p.name)).slice(-4)} · gross {amt(latest.pay)}, deductions {amt(latest.ded)}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="primary" icon={I.Eye} onClick={() => setView(SLIP_MONTHS[0])}>View slip</Button>
              <Button variant="secondary" icon={I.Download} onClick={() => toast({ title: `Saved: Salary-slip-September-2026-${p.code}.pdf` })}>PDF</Button>
            </div>
          </Card>
          <Card>
            <CardHead title="My salary slips" sub={`Paid in ${fmtRange(per)} · newest first`} />
            <div className="px-5 pb-3"><DatePeriod id="slip-per" value={per} onChange={setPer} className="w-full @md:w-auto" /></div>
            {shown.length > 0 ? (
              <ul className="divide-y divide-line/70 border-t border-line/70">
                {shown.map((sm) => {
                  const c = slipFor(p, sm);
                  return (
                    <li key={sm.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="w-10 h-10 rounded-xl bg-sunken text-ink2 grid place-items-center shrink-0"><I.ReceiptText size={19} /></span>
                      <button onClick={() => setView(sm)} className="min-w-0 flex-1 text-left">
                        <p className="font-semibold text-[14.5px] truncate">{sm.label}</p>
                        <p className="text-[12.5px] text-ink3 truncate">Paid {sm.paid.replace(' 2026', '')} · {c.paid} days</p>
                      </button>
                      <span className="font-semibold tnum text-[14.5px]">{amt(c.net)}</span>
                      <IconButton icon={I.Download} label={`Download ${sm.label} slip`} size={36} onClick={() => toast({ title: `Saved: Salary-slip-${sm.label.replace(' ', '-')}-${p.code}.pdf` })} />
                    </li>
                  );
                })}
              </ul>
            ) : before ? <Empty icon={I.Archive} title="Earlier slips are in the archive" body="School OS started on 1 Apr 2026. Slips from before then (April 2025 to March 2026) download as one PDF." action={<Button variant="secondary" icon={I.Download} onClick={() => toast({ title: `Saved: Salary-slips-2025-26-${p.code}.pdf`, body: '12 slips' })}>Download 2025–26 slips</Button>} />
              : <Empty icon={I.CalendarX2} title="No slips paid in these dates" body="Salary is paid on the last working day of each month. October’s slip comes after approval." action={<Button variant="secondary" onClick={() => setPer(PERIODS.finyear)}>Show this financial year</Button>} />}
          </Card>
        </Col>
        <Col>
          <Card>
            <CardHead title="Tax summary 2026–27" sub="April to September, paid so far" icon={I.Calculator} />
            <ul className="px-5 pb-3 text-[14px] flex flex-col gap-1.5 tnum">
              <li className="flex justify-between"><span className="text-ink2">Gross paid</span><b className="font-semibold">{amt(ytd.pay)}</b></li>
              <li className="flex justify-between"><span className="text-ink2">PF (yours)</span><span>{amt(ytd.pf)}</span></li>
              <li className="flex justify-between"><span className="text-ink2">Professional Tax</span><span>{amt(ytd.pt)}</span></li>
              <li className="flex justify-between"><span className="text-ink2">TDS deducted</span><span>{amt(ytd.tds)}</span></li>
              <li className="flex justify-between border-t border-line pt-2 mt-1"><span className="text-ink2">Likely gross for the year</span><b className="font-semibold">{amt(yearly)}</b></li>
              <li className="flex justify-between"><span className="text-ink2">After standard deduction (₹75,000)</span><span>{amt(taxable)}</span></li>
            </ul>
            <p className="px-5 pb-4 text-[12.5px] text-ink3">New tax regime. TDS is typed in each month by the Accountant, not worked out here. {taxable <= 1200000 ? 'Income up to ₹12 L has no tax after rebate.' : 'Talk to Suresh Babu to change your monthly TDS.'}</p>
            <div className="px-5 pb-5 flex gap-2 flex-wrap">
              <Button size="sm" variant="secondary" icon={I.Download} onClick={() => toast({ title: `Saved: Tax-summary-2026-27-${p.code}.pdf` })}>Download summary</Button>
            </div>
          </Card>
          <Card className="p-5 text-[13.5px] text-ink2 flex gap-3">
            <I.Info size={18} className="text-ink3 shrink-0 mt-0.5" />
            <p>Form 16 for 2026–27 comes from the Accountant in June 2027. Something wrong on a slip? Tell Suresh Babu; corrections come as an adjustment next month.</p>
          </Card>
        </Col>
      </Split>
      <SlipSheet p={p} sm={view} open={!!view} onClose={() => setView(null)} mine />
      </div>
    </div>
  );
}

function AllSlips() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const { go } = useNav();
  const [month, setMonth] = useState('sep');
  const [q, setQ] = useState('');
  const [st, setSt] = useState('all');
  const [sel, setSel] = useState(new Set());
  const [view, setView] = useState(null);
  const [bulk, setBulk] = useState(null);
  const sm = SLIP_MONTHS.find((x) => x.id === month);
  const status = (p) => { const h = hash(p.name + month); return ['S02', 'S03'].includes(p.id) ? 'Made' : h % 10 < 7 ? 'Downloaded' : 'Sent'; };
  const rows = month === 'oct' ? [] : PAY.filter((p) => !p.none && (!q || p.name.toLowerCase().includes(q.toLowerCase())) && (st === 'all' || status(p) === st));
  const people = (n) => `${n} staff`;
  return (
    <div className="flex flex-col gap-5 @lg:gap-6">
      <div>
        <ModuleHead sub="Made only from the approved salary · each person can download only their own"
          actions={canEdit && month !== 'oct' && <Button variant="primary" icon={I.Send} onClick={() => setBulk({ how: 'WhatsApp', n: 2 })}>Send unsent slips</Button>} />
        <Stats items={[
          { label: 'Slips made', value: month === 'oct' ? '0' : '86', sub: month === 'oct' ? 'after approval' : sm.label, icon: 'ReceiptText' },
          { label: 'Sent', value: month === 'oct' ? '0' : '84', sub: 'WhatsApp and email', icon: 'Send' },
          { label: 'Downloaded by staff', value: month === 'oct' ? '0' : '61', sub: 'opened their own slip', icon: 'Download' },
          { label: 'Not sent', value: month === 'oct' ? '0' : '2', sub: 'no WhatsApp · print instead', tone: month === 'oct' ? undefined : 'warn', icon: 'Printer' },
        ]} />
      </div>
      <Card className="overflow-hidden">
        <Toolbar>
          <Select id="slip-month" className="@md:w-52" value={month} onChange={(v) => { setMonth(v); setSel(new Set()); }} options={[{ value: 'oct', label: 'October 2026' }, ...SLIP_MONTHS.map((x) => ({ value: x.id, label: x.label }))]} />
          <SearchBox id="slip-search" value={q} onChange={setQ} placeholder="Staff name" />
          <div className="overflow-x-auto no-scrollbar shrink-0"><Segmented value={st} onChange={setSt} options={[{ value: 'all', label: 'All' }, { value: 'Made', label: 'Not sent' }, { value: 'Sent', label: 'Sent' }, { value: 'Downloaded', label: 'Downloaded' }]} /></div>
        </Toolbar>
        {month === 'oct' ? (
          <Empty icon={I.Hourglass} title="October 2026 slips are not made yet" body="Slips are made the moment the Principal approves the month’s salary, never before." action={<Button variant="secondary" icon={I.ArrowUpRight} onClick={() => go('salary', { page: 'generate' })}>Open Generate Salary</Button>} />
        ) : (
          <>
            {canEdit && <BulkBar count={sel.size} onClear={() => setSel(new Set())}>
              <Button size="sm" variant="secondary" icon={I.MessageCircle} onClick={() => setBulk({ how: 'WhatsApp', n: sel.size })}>Send by WhatsApp</Button>
              <Button size="sm" variant="secondary" icon={I.Mail} onClick={() => setBulk({ how: 'email', n: sel.size })}>Send by email</Button>
              <Button size="sm" variant="secondary" icon={I.Printer} onClick={() => toast({ title: `${sel.size} slips sent to the office printer` })}>Print</Button>
            </BulkBar>}
            <DataList rows={rows} minWidth={760} select={canEdit ? [sel, setSel] : undefined} onRow={(p) => setView(p)} footer={`Showing ${rows.length} of 86 slips · ${sm.label}`}
              columns={[
                { key: 'n', label: 'Staff member', render: (p) => <div className="flex items-center gap-3"><Avatar name={p.name} size={34} /><div><p className="font-semibold leading-tight">{p.name}</p><p className="text-[12px] text-ink3 font-mono">{p.code}</p></div></div> },
                { key: 'd', label: 'Designation', render: (p) => p.desig },
                { key: 'net', label: 'Net pay', align: 'right', render: (p) => <b className="font-semibold">{amt(slipFor(p, sm).net)}</b> },
                { key: 's', label: 'Status', render: (p) => { const s = status(p); return <Pill tone={s === 'Downloaded' ? 'ok' : s === 'Sent' ? 'info' : 'warn'}>{s}</Pill>; } },
                { key: 'v', label: 'Sent by', render: (p) => <span className="text-ink2">{status(p) === 'Made' ? '—' : hash(p.name) % 3 ? 'WhatsApp' : 'WhatsApp, email'}</span> },
              ]}
              mobile={(p) => ({ avatar: p.name, title: p.name, sub: `${p.desig} · net ${amt(slipFor(p, sm).net)}`, pills: [<Pill key="s" tone={status(p) === 'Downloaded' ? 'ok' : status(p) === 'Sent' ? 'info' : 'warn'} className="!h-[22px] !text-[11.5px]">{status(p)}</Pill>] })} />
          </>
        )}
      </Card>
      <SlipSheet p={view} sm={sm} open={!!view} onClose={() => setView(null)} />
      <ConfirmSheet open={!!bulk} onClose={() => setBulk(null)} title={bulk ? `Send ${bulk.n} salary slips by ${bulk.how}?` : ''} confirmLabel={bulk ? `Send to ${people(bulk.n)}` : ''}
        onConfirm={() => { toast({ title: `${bulk.n} slips sent by ${bulk.how}`, body: 'Each person gets only their own slip, as a PDF with their date of birth as the password.' }); setSel(new Set()); }}>
        {bulk && <p className="text-[14px] text-ink2">{bulk.n === 2 && !sel.size ? 'Lakshmamma and Bhaskar Rao have no WhatsApp number on file; their slips go by SMS link instead. ' : ''}Each staff member gets only their own {sm.label} slip. Messages cannot be unsent.</p>}
      </ConfirmSheet>
    </div>
  );
}

/* ======================= Advances & Loans ======================= */
function Advances() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const [list, setList] = useState(ADVANCES);
  const [f, setF] = useState('active');
  const [give, setGive] = useState(false);
  const [g, setG] = useState({ sid: 'A03', type: 'Advance', amount: '', inst: '', from: 'November 2026', reason: '' });
  const [gErr, setGErr] = useState({});
  const [pause, setPause] = useState(null);
  const [pauseWhy, setPauseWhy] = useState('');
  const [close, setClose] = useState(null);
  const [paid, setPaid] = useState(null);
  const [per, setPer] = useState(ALL_DATES);
  // Rows not given yet have no date and always show
  const rows = list.filter((a) => { const d = isoOf(a.given); return !d || inPeriod(d, per); }).filter((a) => f === 'all' || (f === 'active' ? a.status !== 'Closed' : a.status === 'Closed'));
  const n = Number(String(g.amount).replace(/[^\d]/g, '')) || 0;
  const defInst = g.type === 'Advance' ? n : Math.round(n / 10);
  return (
    <div className="flex flex-col gap-5 @lg:gap-6">
      <div>
        <ModuleHead sub="Salary advances and loans, recovered from monthly pay until the balance is zero"
          actions={canEdit && <Button variant="primary" icon={I.HandCoins} onClick={() => { setGive(true); setGErr({}); }}>Give advance or loan</Button>} />
        <Stats items={[
          { label: 'Active', value: String(list.filter((a) => a.status === 'Active').length), sub: '1 approved, not paid yet', icon: 'HandCoins' },
          { label: 'Outstanding', value: amt(list.filter((a) => a.status === 'Active').reduce((x, a) => x + a.amount - a.rec, 0)), sub: 'before October recovery', icon: 'Wallet' },
          { label: 'Recovered in October', value: amt(9500), sub: 'in this month’s salary', tone: 'ok', icon: 'Repeat' },
          { label: 'Paid out since April', value: amt(61500), sub: 'in the Day Book when paid', icon: 'Landmark' },
        ]} />
      </div>
      <Card className="overflow-hidden">
        <Toolbar>
          <div className="overflow-x-auto no-scrollbar shrink-0"><Segmented value={f} onChange={setF} options={[{ value: 'active', label: 'Active' }, { value: 'closed', label: 'Closed' }, { value: 'all', label: 'All' }]} /></div>
          <DatePeriod id="adv-per" value={per} onChange={setPer} className="w-full @md:w-auto" />
          <span className="flex-1" />
          <ExportButton what="advances and loans" />
        </Toolbar>
        <DataList rows={rows} minWidth={920} footer={`Showing ${rows.length} · given in ${per.key === 'all' ? 'any month' : fmtRange(per)}`}
          empty={<Empty icon={I.SearchX} title="No advances or loans here" body={`None given in ${fmtRange(per)} with this filter.`} action={<Button variant="secondary" onClick={() => { setF('all'); setPer(ALL_DATES); }}>Show all</Button>} />}
          columns={[
            { key: 'n', label: 'Staff member', render: (a) => { const p = byId(a.sid); return <div className="flex items-center gap-3"><Avatar name={p.name} size={34} /><div><p className="font-semibold leading-tight">{p.name}</p><p className="text-[12px] text-ink3">{a.reason}</p></div></div>; } },
            { key: 't', label: 'Type', render: (a) => <Pill tone={a.type === 'Loan' ? 'info' : 'brand'}>{a.type}</Pill> },
            { key: 'a', label: 'Amount', align: 'right', render: (a) => amt(a.amount) },
            { key: 'g', label: 'Given', nowrap: true, render: (a) => <span className="text-ink2">{a.given}</span> },
            { key: 'i', label: 'Each month', align: 'right', render: (a) => amt(a.inst) },
            { key: 'b', label: 'Balance', render: (a) => <div className="w-32"><div className="flex justify-between text-[12.5px] tnum mb-1"><span>{amt(a.amount - a.rec)}</span><span className="text-ink3">{Math.round((a.rec / a.amount) * 100)}%</span></div><Progress value={(a.rec / a.amount) * 100} tone={a.status === 'Closed' ? 'ok' : 'brand'} /></div> },
            { key: 's', label: 'Status', render: (a) => <Pill tone={a.status === 'Active' ? 'ok' : a.status === 'Closed' ? 'neutral' : 'warn'}>{a.status}</Pill> },
            { key: 'x', label: '', render: (a) => canEdit && a.status !== 'Closed' ? <div className="flex justify-end">{a.status === 'Not paid yet' ? <Button size="sm" variant="soft" onClick={() => setPaid(a)}>Mark paid</Button> : <MoreMenu size="sm" items={[[I.CirclePause, a.paused ? 'Restart recovery' : 'Pause recovery', () => (a.paused ? (setList((x) => x.map((y) => (y.id === a.id ? { ...y, paused: false } : y))), toast({ title: 'Recovery restarts in November' })) : (setPause(a), setPauseWhy('')))], [I.SlidersHorizontal, 'Change installment', () => toast({ title: 'Change installment', body: 'New amount and a reason. Applies from the next salary.', tone: 'info' })], [I.CircleCheck, 'Close: repaid in cash', () => setClose(a)]]} />}</div> : null },
          ]}
          mobile={(a) => { const p = byId(a.sid); return { avatar: p.name, title: `${p.name} · ${a.type}`, sub: `${amt(a.amount - a.rec)} left of ${amt(a.amount)} · ${amt(a.inst)} a month`, pills: [<Pill key="s" tone={a.status === 'Active' ? 'ok' : a.status === 'Closed' ? 'neutral' : 'warn'} className="!h-[22px] !text-[11.5px]">{a.paused ? 'Paused' : a.status}</Pill>], right: canEdit && a.status === 'Not paid yet' ? <Button size="sm" variant="soft" onClick={() => setPaid(a)}>Mark paid</Button> : null }; }} />
      </Card>
      <FormSheet open={give} onClose={() => setGive(false)} title="Give advance or loan" sub="Needs the Principal’s approval (Forms & Approvals). It goes in the Day Book when paid." submitLabel="Send for approval"
        onSubmit={() => {
          const e = {};
          if (!n) e.amount = 'Enter the amount';
          if (!g.reason.trim()) e.reason = 'Give a reason';
          setGErr(e);
          if (Object.keys(e).length) return false;
          setList((x) => [{ id: `ADV-26-0${21 + x.length - ADVANCES.length}`, sid: g.sid, type: g.type, amount: n, given: 'Waiting for approval', inst: Number(String(g.inst).replace(/[^\d]/g, '')) || defInst, rec: 0, status: 'Not paid yet', reason: g.reason.trim() }, ...x]);
          toast({ title: `${g.type} of ${amt(n)} for ${byId(g.sid).name} sent for approval`, body: 'Lakshmi Rao gets it in Approvals.' });
        }}>
        <Field label="Staff member" required id="gv-who"><Select id="gv-who" value={g.sid} onChange={(v) => setG({ ...g, sid: v })} options={PAY.filter((p) => !p.none).map((p) => ({ value: p.id, label: `${p.name} · ${p.desig}` }))} /></Field>
        <Field label="Type" required id="gv-type"><Segmented value={g.type} onChange={(v) => setG({ ...g, type: v, inst: '' })} options={['Advance', 'Loan']} className="w-full" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount" required id="gv-amt" error={gErr.amount}><Input id="gv-amt" inputMode="numeric" value={g.amount} onChange={(e) => { setG({ ...g, amount: e.target.value.replace(/[^\d]/g, '') }); setGErr({}); }} error={gErr.amount} className="tnum" placeholder="10000" /></Field>
          <Field label="Recover each month" required id="gv-inst" hint={g.type === 'Advance' ? 'Default: all of it next month' : 'Default: over 10 months'}><Input id="gv-inst" inputMode="numeric" value={g.inst || (defInst ? String(defInst) : '')} onChange={(e) => setG({ ...g, inst: e.target.value.replace(/[^\d]/g, '') })} className="tnum" /></Field>
        </div>
        <Field label="Start recovery from" required id="gv-from"><Select id="gv-from" value={g.from} onChange={(v) => setG({ ...g, from: v })} options={['November 2026', 'December 2026', 'January 2027']} /></Field>
        <Field label="Reason" required id="gv-why" error={gErr.reason}><Textarea id="gv-why" value={g.reason} onChange={(v) => { setG({ ...g, reason: v }); setGErr({}); }} rows={2} placeholder="Like: Dussehra festival advance" /></Field>
      </FormSheet>
      <Sheet open={!!pause} onClose={() => setPause(null)} title={pause ? `Pause recovery for ${byId(pause.sid).name}?` : ''} sub="Nothing is deducted until you restart it."
        footer={<><Button variant="ghost" onClick={() => setPause(null)}>Cancel</Button><Button variant="primary" disabled={!pauseWhy.trim()} onClick={() => { setList((x) => x.map((y) => (y.id === pause.id ? { ...y, paused: true } : y))); toast({ title: `Recovery paused for ${byId(pause.sid).name}`, body: pauseWhy.trim() }); setPause(null); }}>Pause recovery</Button></>}>
        <Field label="Reason" required id="pz-why" hint="Saved with the change"><Textarea id="pz-why" value={pauseWhy} onChange={setPauseWhy} rows={2} placeholder="Like: on unpaid leave in November" /></Field>
      </Sheet>
      <ConfirmSheet open={!!close} onClose={() => setClose(null)} title={close ? `Close ${byId(close.sid).name}’s ${close.type.toLowerCase()}?` : ''} confirmLabel={close ? `Record ${amt(close.amount - close.rec)} received and close` : ''}
        onConfirm={() => { setList((x) => x.map((y) => (y.id === close.id ? { ...y, rec: y.amount, status: 'Closed' } : y))); toast({ title: `${close.type} closed`, body: `${amt(close.amount - close.rec)} received in cash · receipt in the Day Book` }); }}>
        {close && <p className="text-[14px] text-ink2">{byId(close.sid).name} repays the balance of {amt(close.amount - close.rec)} in cash. A receipt goes in the Day Book and no more is deducted from salary.</p>}
      </ConfirmSheet>
      <FormSheet open={!!paid} onClose={() => setPaid(null)} title={paid ? `Pay ${byId(paid.sid).name}’s advance` : ''} sub="It goes into the Day Book as money out on this date." submitLabel={paid ? `Mark ${amt(paid.amount)} paid` : ''}
        onSubmit={() => { setList((x) => x.map((y) => (y.id === paid.id ? { ...y, status: 'Active', given: 'Fri 9 Oct 2026' } : y))); toast({ title: `${amt(paid.amount)} paid to ${byId(paid.sid).name}`, body: 'In the Day Book on 9 Oct 2026. Recovery starts in November.' }); }}>
        <Field label="Paid on" required id="ap-date"><Input id="ap-date" defaultValue="09-10-2026" /></Field>
        <Field label="Mode" required id="ap-mode"><Select id="ap-mode" value="Bank transfer" onChange={() => {}} options={['Bank transfer', 'Cash', 'Cheque']} /></Field>
        <Field label="Reference" id="ap-ref"><Input id="ap-ref" placeholder="UTR or cheque number" className="font-mono" /></Field>
      </FormSheet>
    </div>
  );
}

/* ======================= Salary History ======================= */
function History() {
  const toast = useToast();
  const { go } = useNav();
  // HR has View of Salary: who was paid for how many days and the loss of pay, never the money.
  // The Principal and School Admin read this page (View) but have Full Salary, so they see the amounts.
  const seeMoney = usePage().moduleAccess === 'full';
  const [tab, setTab] = useState('month');
  const [per, setPer] = useState(PERIODS.finyear);
  const [who, setWho] = useState('T01');
  const MI = { apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9 };
  const inPer = (id) => { const m = String(MI[id] + 1).padStart(2, '0'); const last = new Date(2026, MI[id] + 1, 0).getDate(); return per.from <= `2026-${m}-${last}` && per.to >= `2026-${m}-01`; };
  const SM = MONTHS.filter((m) => inPer(m.id));
  const slipRows = SLIP_MONTHS.filter((sm) => inPer(sm.id));
  const paidMonths = SM.filter((m) => m.status !== 'calculated' && m.status !== 'waiting').slice().reverse();
  const before = per.to < '2026-04-01';
  // Loss of pay days for the whole staff each month (from Staff Attendance and Staff Leave)
  const LOP = { oct: 3.5, sep: 2, aug: 1, jul: 0, jun: 1.5, may: 0, apr: 0.5 };
  const p = byId(who);
  const DEPT = [['Teaching', 1984200], ['Office', 182400], ['Transport', 236800], ['Accounts', 60000], ['Hostel', 66000], ['Support', 41400], ['Library', 26000], ['Stores', 18000]];
  return (
    <div>
      <ModuleHead sub="Salary paid by month and by staff member, and the salary reports" />
      <div className="flex flex-col gap-5 @lg:gap-6">
      <div className="flex flex-col @md:flex-row gap-2.5 @md:items-center">
        <div className="overflow-x-auto no-scrollbar"><Segmented className="w-max" value={tab} onChange={setTab} options={[{ value: 'month', label: 'By month' }, { value: 'staff', label: 'By staff member' }, ...(seeMoney ? [{ value: 'reports', label: 'Reports' }] : [])]} /></div>
        {tab !== 'reports' && <DatePeriod id="hist-per" value={per} onChange={setPer} className="w-full @md:w-auto" />}
      </div>
      {tab !== 'reports' && before ? (
        <Card><Empty icon={I.Archive} title="Before School OS, read-only" body="School OS started on 1 Apr 2026. Earlier salary runs, slips and statements are kept as they were paid." action={seeMoney ? <Button variant="secondary" icon={I.Download} onClick={() => toast({ title: 'Exported salary history 2025–26', body: 'Excel file with the school name and your name on top' })}>Export 2025–26</Button> : <Button variant="secondary" onClick={() => setPer(PERIODS.finyear)}>Show this financial year</Button>} /></Card>
      ) : tab !== 'reports' && !SM.length ? (
        <Card><Empty icon={I.CalendarX2} title="No salary months in these dates" body={`Nothing falls in ${fmtRange(per)}.`} action={<Button variant="secondary" onClick={() => setPer(PERIODS.finyear)}>Show this financial year</Button>} /></Card>
      ) : tab === 'month' && !seeMoney ? (
        <Card className="overflow-hidden animate-rise">
          <CardHead title="Loss of pay by month" sub={`${per.label} · ${fmtRange(per)} · from Staff Attendance and Staff Leave`} />
          <DataList rows={SM} minWidth={560}
            columns={[
              { key: 'm', label: 'Month', render: (m) => <span className="font-semibold">{m.label}</span> },
              { key: 's', label: 'Staff', align: 'right', render: (m) => m.staff },
              { key: 'l', label: 'Loss of pay days', align: 'right', render: (m) => LOP[m.id] || '—' },
              { key: 'p', label: 'Paid on', nowrap: true, render: (m) => m.paid || <StatusPill s={m.status} /> },
            ]}
            mobile={(m) => ({ icon: 'CalendarDays', title: m.label, sub: `${m.staff} staff · ${LOP[m.id] ? `${LOP[m.id]} days loss of pay` : 'no loss of pay'}`, right: m.paid ? <span className="text-[12.5px] text-ink3">{m.paid}</span> : <StatusPill s={m.status} /> })} />
        </Card>
      ) : tab === 'month' ? (
        <Split className="animate-rise">
          <Card className="overflow-hidden">
            <CardHead title="Net pay by month" sub={`${fmtRange(per)} · ₹ lakh${SM.some((m) => m.id === 'oct') ? ' · October is not paid yet' : ''}`} action={<ExportButton what="salary by month" />} />
            <div className="px-5 pb-2"><Bars data={SM.slice().reverse().map((m) => ({ k: m.short, v: Math.round(m.net / 1000) / 100, tone: m.id === 'oct' ? 'info' : 'brand' }))} label={(v) => `${v}`} ticks={[0, 10, 20]} max={30} ariaLabel="Net salary by month" /></div>
            <DataList rows={SM} minWidth={640} onRow={(m) => { go('salary', { page: 'generate' }); toast({ title: `Opening ${m.label}`, body: 'Tap the month in Salary months to see its rows', tone: 'info' }); }}
              columns={[
                { key: 'm', label: 'Month', render: (m) => <span className="font-semibold">{m.label}</span> },
                { key: 's', label: 'Staff', align: 'right', render: (m) => m.staff },
                { key: 'g', label: 'Gross', align: 'right', render: (m) => amt(m.gross) },
                { key: 'd', label: 'Deductions', align: 'right', render: (m) => amt(m.ded) },
                { key: 'n', label: 'Net', align: 'right', render: (m) => <b className="font-semibold">{amt(m.net)}</b> },
                { key: 'p', label: 'Paid on', nowrap: true, render: (m) => m.paid || <StatusPill s={m.status} /> },
              ]}
              mobile={(m) => ({ icon: 'ReceiptText', title: m.label, sub: `${m.staff} staff · net ${amt(m.net)}`, right: m.paid ? <span className="text-[12.5px] text-ink3">{m.paid}</span> : <StatusPill s={m.status} /> })} />
          </Card>
          <Col>
            <Card>
              <CardHead title="Paid in these dates" sub={`${paidMonths.length} ${paidMonths.length === 1 ? 'month' : 'months'} · ${fmtRange(per)}`} />
              <ul className="px-5 pb-5 text-[14px] flex flex-col gap-1.5 tnum">
                <li className="flex justify-between"><span className="text-ink2">Gross</span><b className="font-semibold">{amt(paidMonths.reduce((a, m) => a + m.gross, 0))}</b></li>
                <li className="flex justify-between"><span className="text-ink2">Deductions</span><span>{amt(paidMonths.reduce((a, m) => a + m.ded, 0))}</span></li>
                <li className="flex justify-between border-t border-line pt-2 mt-1"><span className="font-semibold">Net paid</span><b className="font-display text-[20px] font-semibold">{amt(paidMonths.reduce((a, m) => a + m.net, 0))}</b></li>
              </ul>
            </Card>
            <Card>
              <CardHead title="By department" sub="October gross, ₹ thousand" />
              <div className="px-5 pb-5"><HBars rows={DEPT.map(([k, v]) => ({ k, v: Math.round(v / 1000), label: `${Math.round(v / 1000)}k` }))} max={2000} unit="" labelWidth={78} /></div>
            </Card>
          </Col>
        </Split>
      ) : tab === 'staff' ? (
        <Card className="overflow-hidden animate-rise">
          <div className="p-3 border-b border-line flex flex-col @md:flex-row gap-2.5">
            <Select id="hist-who" className="@md:w-80" value={who} onChange={setWho} options={PAY.filter((x) => !x.none).map((x) => ({ value: x.id, label: `${x.name} · ${x.desig}` }))} />
            <span className="flex-1" />
            {seeMoney && <ExportButton what={`${p.name}’s salary history`} />}
          </div>
          <DataList rows={slipRows.map((sm) => ({ id: sm.id, sm, c: slipFor(p, sm) }))} minWidth={seeMoney ? 640 : 480} onRow={seeMoney ? (r) => toast({ title: `${p.name} · ${r.sm.label} slip`, body: `Net ${amt(r.c.net)} · open it from Salary Slips`, tone: 'info' }) : undefined}
            empty={<Empty icon={I.CalendarX2} title="No paid months in these dates" body="October is paid after approval." />}
            columns={[
              { key: 'm', label: 'Month', render: (r) => <span className="font-semibold">{r.sm.label}</span> },
              ...(seeMoney ? [
                { key: 'g', label: 'Gross', align: 'right', render: (r) => amt(r.c.pay) },
                { key: 'd', label: 'Deductions', align: 'right', render: (r) => amt(r.c.ded) },
                { key: 'n', label: 'Net', align: 'right', render: (r) => <b className="font-semibold">{amt(r.c.net)}</b> },
              ] : [{ key: 'dp', label: 'Days paid', align: 'right', render: (r) => `${r.c.paid} of ${r.sm.days}` }]),
              { key: 'p', label: 'Paid on', nowrap: true, render: (r) => r.sm.paid },
            ]}
            mobile={(r) => ({ icon: 'ReceiptText', title: r.sm.label, sub: `Paid ${r.sm.paid}`, right: seeMoney ? <b className="font-semibold tnum">{amt(r.c.net)}</b> : <span className="text-[12.5px] text-ink3">{r.c.paid} of {r.sm.days} days</span> })} />
          {seeMoney && <p className="px-5 py-3 border-t border-line text-[12.5px] text-ink3">April and May were paid on structure v2; the 6% increment started in June.</p>}
        </Card>
      ) : (
        <Split className="animate-rise">
          <Card>
            <CardHead title="Salary reports" sub="Excel, CSV or PDF, with the filters above" />
            <ul className="px-2 pb-2">
              {[['Monthly payroll summary', 'Gross, deductions and net for each month', 'FileSpreadsheet'],
                ['Monthly trends', 'How the salary bill moved over the year', 'TrendingUp'],
                ['Department and designation breakdown', 'Where the salary goes', 'Building2'],
                ['Employee salary history', 'Every month for one person', 'UserRound'],
                ['Deductions by component', 'PF, ESI, Professional Tax, TDS, recoveries', 'Receipt'],
                ['PF statement · September 2026', 'EPFO ECR file, matches the payroll totals', 'FileDown'],
                ['ESI statement · September 2026', 'ESIC monthly contribution file', 'FileDown'],
                ['Professional Tax and TDS deducted', 'By month and staff member', 'Calculator'],
                ['Advances and loans outstanding', 'Balance and monthly recovery', 'HandCoins'],
                ['Bank transfer list · September 2026', 'Account, IFSC and amount for each person', 'Landmark']].map(([t, s, ic]) => (
                <li key={t}><Row icon={ic} iconTone="brand" title={t} sub={s} onClick={() => toast({ title: `Exported: ${t}`, body: 'With the school name, the filters and your name on top. Logged in the export log.' })} right={<I.Download size={17} className="text-ink3" />} /></li>
              ))}
            </ul>
          </Card>
          <Suggestion title="October looks normal" source="salary runs April to October 2026 and the October rows"
            actions={<Button size="sm" variant="secondary" onClick={() => go('salary', { page: 'generate' })}>Open October</Button>}>
            October’s net pay is ₹4,200 more than September’s: the 2 day-wages of loss of pay in September did not repeat, and Srinivas Murthy still has no TDS amount. No one’s pay changed by more than 5%.
          </Suggestion>
        </Split>
      )}
      </div>
    </div>
  );
}

/* ======================= Salary Settings ======================= */
function SalarySettings() {
  const toast = useToast();
  const { go } = useNav();
  const { role } = useRole();
  const canEdit = useCanEdit();
  const [pt, setPt] = useState(true);
  const [comp, setComp] = useState(false);
  return (
    <div>
      <ModuleHead sub="Salary parts, PF, ESI and Professional Tax, approval steps and slip options. Rate changes apply from a month you choose and never change approved salaries." />
      <div className="grid @xl:grid-cols-2 gap-5 @lg:gap-6 items-start">
        <Col>
          <Card>
            <CardHead title="Salary components" sub="Earnings and deductions used in structures" icon={I.Layers} action={canEdit && <Button size="sm" variant="soft" icon={I.Plus} onClick={() => setComp(true)}>Add</Button>} />
            <ul className="divide-y divide-line/70 border-t border-line/70">
              {[['Basic pay', 'Earning', 'Fixed amount', true], ['Dearness allowance', 'Earning', '20% of basic', true], ['House rent allowance', 'Earning', '30% of basic', true], ['Conveyance', 'Earning', 'Fixed amount', true], ['Special allowance', 'Earning', 'Fixed amount', true], ['Loss of pay', 'Deduction', 'From attendance', false], ['Staff welfare fund', 'Deduction', '₹100 a month · off', false]].map(([n, k, how, tax]) => (
                <li key={n} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="min-w-0 flex-1"><p className="font-semibold text-[14px]">{n}</p><p className="text-[12.5px] text-ink3">{how}</p></div>
                  {tax && <Pill className="!h-5 !text-[11px] hidden @sm:inline-flex">Taxable</Pill>}
                  <Pill tone={k === 'Earning' ? 'ok' : 'warn'}>{k}</Pill>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHead title="Designation templates" sub="Starting point for a new structure" icon={I.LayoutList} />
            <ul className="px-2 pb-2">
              {[['PRT', 26500], ['TGT', 35500], ['PGT', 50000], ['Driver', 18500], ['Office staff', 18000], ['Support staff', 12500]].map(([k, v]) => <li key={k}><Row icon={I.FileSpreadsheet} title={k} sub="Basic, DA 20%, HRA 30%, conveyance, special" right={<span className="tnum font-semibold text-[14px]">{amt(v)}</span>} /></li>)}
            </ul>
          </Card>
          <SettingsCard title="Payroll preferences" icon={I.SlidersHorizontal} rows={[
            { title: 'Pay day', sub: 'Salary is due on this day', value: 'Last working day' },
            { title: 'Days in a month for loss of pay', sub: 'Calendar days or a fixed 30', value: 'Calendar days' },
            { title: 'Late marks', sub: 'From Staff Attendance', value: '3 late = ½ day' },
            { title: 'Overtime', sub: 'Paid extra periods or hours', value: 'Off' },
            { title: 'TDS reminder above', sub: 'Flags staff with no TDS whose yearly pay is above this', value: '₹12,00,000' },
          ]} />
        </Col>
        <Col>
          <Card>
            <CardHead title="PF and ESI" sub="Worked out from these rates. Change them when the government does." icon={I.Landmark} />
            <div className="divide-y divide-line/70 border-t border-line/70">
              <SettingRow title="Provident Fund (PF)" sub="12% employee + 12% employer on basic pay, up to a ₹15,000 wage ceiling"><SwitchSave title="PF" on /></SettingRow>
              <SettingRow title="Employees’ State Insurance (ESI)" sub="0.75% employee + 3.25% employer, for wages up to ₹21,000 a month"><SwitchSave title="ESI" on /></SettingRow>
              <div className="px-5 py-3.5 grid grid-cols-2 @sm:grid-cols-4 gap-3 text-[13px]">
                {[['PF employee', '12%'], ['PF employer', '12%'], ['PF wage ceiling', '₹15,000'], ['PF wages', 'Basic pay'], ['ESI employee', '0.75%'], ['ESI employer', '3.25%'], ['ESI wage limit', '₹21,000'], ['From', 'Apr 2026']].map(([k, v]) => <div key={k}><p className="text-[11.5px] text-ink3 font-semibold">{k}</p><p className="font-semibold tnum">{v}</p></div>)}
              </div>
              {canEdit && <div className="px-5 py-3"><Button size="sm" variant="secondary" icon={I.Pencil} onClick={() => toast({ title: 'Change rates from a month', body: 'Pick the month they start. Approved salaries never change.', tone: 'info' })}>Change rates</Button></div>}
            </div>
          </Card>
          <Card>
            <CardHead title="Professional Tax · Telangana" sub="Taken each month from the salary slab" icon={I.Scale} action={<Switch id="pt-on" on={pt} onChange={(v) => { if (!canEdit) return; setPt(v); toast({ title: `Professional Tax ${v ? 'on' : 'off'}`, body: 'From November 2026. Recorded in the audit log.' }); }} label="Professional Tax" />} />
            {pt ? (
              <table className="w-full text-[14px]">
                <thead><tr className="text-[12px] text-ink3 text-left border-y border-line"><th className="px-5 py-2.5 font-semibold">Salary in the month</th><th className="px-5 py-2.5 font-semibold text-right">Tax a month</th></tr></thead>
                <tbody className="tnum">
                  {[['Up to ₹15,000', 'Nil'], ['₹15,001 to ₹20,000', '₹150'], ['Above ₹20,000', '₹200']].map(([a, b]) => <tr key={a} className="border-b border-line/70 last:border-0"><td className="px-5 py-2.5">{a}</td><td className="px-5 py-2.5 text-right font-semibold">{b}</td></tr>)}
                </tbody>
              </table>
            ) : <p className="px-5 pb-5 text-[14px] text-ink3">Off. No Professional Tax is taken from salaries.</p>}
          </Card>
          <Card>
            <CardHead title="TDS and statements" icon={I.FileDown} />
            <DL cols={1} rows={[['TDS', 'Typed in by the Accountant as a monthly amount on each structure. Not worked out by School OS.'], ['PF statement', 'EPFO ECR text file, each month'], ['ESI statement', 'ESIC monthly contribution Excel file']]} />
          </Card>
          <Card>
            <CardHead title="Approval steps" sub="Stored in Settings, Forms & Approvals" icon={I.Workflow} />
            <div className="px-5 pb-5 flex flex-col gap-3">
              <div className="flex items-center gap-2 flex-wrap"><Pill tone="brand">Accountant prepares</Pill><I.ChevronRight size={16} className="text-ink3" /><Pill tone="brand">Principal approves</Pill><I.ChevronRight size={16} className="text-ink3" /><Pill tone="brand">Accountant marks paid</Pill></div>
              <p className="text-[13px] text-ink3">Advances and loans: Principal approves. Nobody approves a run they sent; it goes to the School Admin instead.</p>
              {canOpen(role, 'settings', 'forms') && <Button className="self-start" size="sm" variant="secondary" icon={I.ArrowUpRight} onClick={() => go('settings', { page: 'forms' })}>Change in Forms & Approvals</Button>}
            </div>
          </Card>
          <SettingsCard title="Salary slip options" sub="The slip design is in Settings, Document Designs" icon={I.ReceiptText} rows={[
            { title: 'Send slips on WhatsApp when approved', on: true },
            { title: 'Also send by email', on: false },
            { title: 'Show the school’s PF and ESI share', on: true },
            { title: 'Show leave balance on the slip', on: false },
            { title: 'Protect the PDF with date of birth', sub: 'Staff open it with their date of birth (DDMMYYYY)', on: true },
          ]} />
        </Col>
      </div>
      <FormSheet open={comp} onClose={() => setComp(false)} title="Add salary component" submitLabel="Add component" onSubmit={() => toast({ title: 'Component added: Transport allowance', body: 'Available in structures from November 2026.' })}>
        <Field label="Name" required id="cp-name"><Input id="cp-name" defaultValue="Transport allowance" /></Field>
        <Field label="Earning or deduction" required id="cp-kind"><Segmented value="Earning" onChange={() => {}} options={['Earning', 'Deduction']} className="w-full" /></Field>
        <Field label="Worked out as" required id="cp-how"><Select id="cp-how" value="Fixed amount" onChange={() => {}} options={['Fixed amount', '% of basic', 'From attendance']} /></Field>
      </FormSheet>
    </div>
  );
}
function SwitchSave({ title, on: start }) {
  const [on, setOn] = useState(!!start);
  const toast = useToast();
  const canEdit = useCanEdit();
  return <Switch on={on} label={title} onChange={(v) => { if (!canEdit) return; setOn(v); toast({ title: `${title} ${v ? 'on' : 'off'} from November 2026`, body: 'October and earlier stay as they are.' }); }} />;
}

/* ======================= Export ======================= */
export const SALARY_PAGES = {
  generate: () => <Generate />,
  structures: () => <Structures />,
  slips: ({ access }) => <Slips access={access} />,
  advances: () => <Advances />,
  history: () => <History />,
  settings: () => <SalarySettings />,
};
