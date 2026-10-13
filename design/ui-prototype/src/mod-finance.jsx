// Finance Management (blueprint module 07). Example data only.
// The financial year runs April to March (D8d), apart from the academic year (June to May).
// Expenses and salary reach the Day Book only when marked Paid (D12). Fee payments are never deleted (D2).
import React, { useMemo, useState } from 'react';
import * as I from './icons.js';
import { STUDENTS, CLASSES, FEE_TREND, inr, inrShort } from './data.js';
import { cx, Card, CardHead, Button, IconButton, Pill, Input, Field, Segmented, Tabs, Empty, Sheet, Switch, useToast } from './ui.jsx';
import { useNav, useRole } from './shell.jsx';
import {
  ModuleHead, useCanEdit, Stats, Band, SearchBox, Toolbar, Select, Textarea, DataList, SettingRow, SettingsCard,
  Banner, Suggestion, Progress, HBars, Bars, Legend, DL, Timeline, FormSheet, ConfirmSheet, Split as KitSplit, Col, TONE_SOFT,
  DatePeriod, PERIODS as DP, fmtRange, fmtDay, usePage,
} from './kit.jsx';
import { FEE_PAYMENTS_TODAY, TUITION, MODE_ICON, PayPill, SimpleTable, ReportsFrame, ReportActions, isoOf, inPeriod, monthShare, FY_MONTHS, canOpen, canDoPage, seesPay, ALL_DATES } from './mod-fees.jsx';

// Same as the kit Split, but its direct children may shrink (no sideways overflow on phones)
const Split = ({ className, ...p }) => <KitSplit {...p} className={cx('[&>*]:min-w-0', className)} />;

/* =========================================================================================
   Sample data. Sunrise Public School, Kukatpally. Financial year 2026–27 (1 Apr 2026 to 31 Mar 2027).
   Today is Fri 9 Oct 2026, 10:42 AM. School OS went live on 1 Apr 2026.
   ========================================================================================= */
const FYS = [{ value: '2026-27', label: '2026–27 · Apr 2026 to Mar 2027' }, { value: '2025-26', label: '2025–26 · closed' }];
const AUTO_OK = 2000;      // expenses up to this are approved at once
const BILL_ABOVE = 2000;   // a bill photo is needed above this
const ME_ACC = 'Suresh Babu';
const clsOf = (s) => `${s.cls.replace('Class ', '')} ${s.sec}`;
const qtr = (s) => TUITION[s.clsId] / 4;
const num = (v) => Number(String(v).replace(/[^\d]/g, '')) || 0;
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const signed = (n) => (n < 0 ? `−${inr(-n)}` : inr(n));
// "9:04 AM" -> minutes, and back
const tmin = (t) => { const m = /(\d+):(\d+)\s*(AM|PM)/.exec(t || ''); if (!m) return 9999; let h = Number(m[1]) % 12; if (m[3] === 'PM') h += 12; return h * 60 + Number(m[2]); };
const hm = (mins) => { const h = Math.floor(mins / 60), m = mins % 60; return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };

// Who approves an expense (Settings, Forms & Approvals: School Admin up to ₹10,000, Principal up to ₹1,00,000, then the Chairman)
const approverFor = (a) => (a <= AUTO_OK ? null : a <= 10000 ? 'Anita Sharma (School Admin)' : a <= 100000 ? 'Lakshmi Rao (Principal)' : 'K. Ramachandra Rao (Chairman)');
const canApprove = (roleId, a) => (roleId === 'principal' ? a <= 100000 : roleId === 'schooladmin' ? a <= 10000 : false);

/* ---------- Cash and bank accounts ---------- */
const ACCTS0 = [
  { id: 'cash', name: 'Cash in hand', sub: 'Office cash box · kept by Suresh Babu', icon: 'Banknote', open: 24150 },
  { id: 'sbi', name: 'School account', sub: 'SBI Kukatpally · XXXX XXXX 2209', icon: 'Landmark', open: 4218600, main: true },
  { id: 'hdfc', name: 'Trust account', sub: 'HDFC KPHB · XXXX XXXX 7730', icon: 'Landmark', open: 845300 },
];
const ACCT_NAME = { cash: 'Cash in hand', sbi: 'School account (SBI)', hdfc: 'Trust account (HDFC)' };
const FEE_ACCT = { 'School account': 'sbi', 'Trust account': 'hdfc' };
// Balances at the start of Fri 9 Oct (closing of Thu 8 Oct)
const OPEN9 = { cash: 38400, sbi: 5246250, hdfc: 2312880 };

/* ---------- Chart of accounts. fy = amount so far this financial year (1 Apr to 9 Oct) ---------- */
const HEADS = [
  { code: '4110', name: 'Tuition fee', group: 'Fee income', kind: 'in', fy: 17120000, from: 'Fees' },
  { code: '4120', name: 'Transport fee', group: 'Fee income', kind: 'in', fy: 2640000, from: 'Fees' },
  { code: '4130', name: 'Hostel fee', group: 'Fee income', kind: 'in', fy: 1980000, from: 'Fees' },
  { code: '4140', name: 'Admission and application fees', group: 'Fee income', kind: 'in', fy: 705000, from: 'Fees' },
  { code: '4150', name: 'Exam fee', group: 'Fee income', kind: 'in', fy: 295000, from: 'Fees' },
  { code: '4160', name: 'Uniform and books (store)', group: 'Fee income', kind: 'in', fy: 460000, from: 'Fees' },
  { code: '4170', name: 'Late fee', group: 'Fee income', kind: 'in', fy: 100000, from: 'Fees' },
  { code: '4210', name: 'Hall and ground rent', group: 'Other income', kind: 'in', fy: 165000 },
  { code: '4220', name: 'Donations', group: 'Other income', kind: 'in', fy: 250000 },
  { code: '4230', name: 'Alumni donations', group: 'Other income', kind: 'in', fy: 85000 },
  { code: '4240', name: 'Scrap sale', group: 'Other income', kind: 'in', fy: 18400 },
  { code: '4250', name: 'Bank interest', group: 'Other income', kind: 'in', fy: 142300 },
  { code: '4260', name: 'Canteen contract', group: 'Other income', kind: 'in', fy: 120000 },
  { code: '4270', name: 'Event sponsorship', group: 'Other income', kind: 'in', fy: 60000 },
  { code: '5110', name: 'Salaries', group: 'Staff costs', kind: 'out', fy: 15537400, from: 'Salary', dept: 'All departments' },
  { code: '5120', name: 'PF, ESI and professional tax', group: 'Staff costs', kind: 'out', fy: 1538600, from: 'Salary', dept: 'All departments' },
  { code: '5130', name: 'Staff welfare', group: 'Staff costs', kind: 'out', fy: 42600, dept: 'Administration' },
  { code: '5210', name: 'Electricity', group: 'Building and upkeep', kind: 'out', fy: 492600, dept: 'Maintenance' },
  { code: '5220', name: 'Water', group: 'Building and upkeep', kind: 'out', fy: 86400, dept: 'Maintenance' },
  { code: '5230', name: 'Repairs and maintenance', group: 'Building and upkeep', kind: 'out', fy: 364800, dept: 'Maintenance' },
  { code: '5240', name: 'Housekeeping and cleaning', group: 'Building and upkeep', kind: 'out', fy: 146900, dept: 'Maintenance' },
  { code: '5310', name: 'Stationery and printing', group: 'Teaching and learning', kind: 'out', fy: 218500, dept: 'Academics' },
  { code: '5320', name: 'Lab materials', group: 'Teaching and learning', kind: 'out', fy: 112300, dept: 'Academics' },
  { code: '5330', name: 'Library books', group: 'Teaching and learning', kind: 'out', fy: 84600, dept: 'Academics' },
  { code: '5340', name: 'Sports and games', group: 'Teaching and learning', kind: 'out', fy: 96200, dept: 'Sports and events' },
  { code: '5410', name: 'Diesel', group: 'Transport', kind: 'out', fy: 785000, dept: 'Transport' },
  { code: '5420', name: 'Vehicle repairs', group: 'Transport', kind: 'out', fy: 148700, dept: 'Transport' },
  { code: '5430', name: 'Vehicle insurance and permits', group: 'Transport', kind: 'out', fy: 264000, dept: 'Transport' },
  { code: '5510', name: 'Events and functions', group: 'Events', kind: 'out', fy: 132500, dept: 'Sports and events' },
  { code: '5610', name: 'Internet and phone', group: 'Office', kind: 'out', fy: 28320, dept: 'Administration' },
  { code: '5620', name: 'Software and subscriptions', group: 'Office', kind: 'out', fy: 118000, dept: 'Administration' },
  { code: '5630', name: 'Bank and payment charges', group: 'Office', kind: 'out', fy: 102600, dept: 'Administration' },
  { code: '5640', name: 'Postage and courier', group: 'Office', kind: 'out', fy: 6840, dept: 'Administration' },
  { code: '5650', name: 'Audit and professional fees', group: 'Office', kind: 'out', fy: 75000, dept: 'Administration' },
  { code: '5660', name: 'Tea, snacks and petty expenses', group: 'Office', kind: 'out', fy: 38900, dept: 'Administration' },
  { code: '5710', name: 'Hostel mess provisions', group: 'Hostel', kind: 'out', fy: 946000, dept: 'Hostel' },
];
const HEAD = Object.fromEntries(HEADS.map((h) => [h.name, h]));
const IN_HEADS = HEADS.filter((h) => h.kind === 'in' && !h.from).map((h) => h.name);
const OUT_HEADS = HEADS.filter((h) => h.kind === 'out' && !h.from).map((h) => h.name);
const DEPTS = ['Academics', 'Administration', 'Maintenance', 'Transport', 'Hostel', 'Sports and events'];
const sumBy = (rows, f) => rows.reduce((a, r) => a + f(r), 0);
const FEE_FY = sumBy(HEADS.filter((h) => h.group === 'Fee income'), (h) => h.fy);
const OTHER_IN_FY = sumBy(HEADS.filter((h) => h.group === 'Other income'), (h) => h.fy);
const SAL_FY = HEAD.Salaries.fy;
const STAT_FY = HEAD['PF, ESI and professional tax'].fy;
const OTHER_OUT_FY = sumBy(HEADS.filter((h) => h.kind === 'out' && !h.from), (h) => h.fy);

/* ---------- Month by month, 2026–27 so far. Fees come from the Fee module's monthly chart ---------- */
const MONTHLY = (() => {
  const ms = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
  const otherIn = [161200, 108500, 132400, 142160, 118600, 85490];
  const salary = [2511100, 2515400, 2619000, 2628900, 2626600, 2636400, 0];
  const stat = [252400, 253100, 253000, 259800, 260400, 259900, 0];
  const otherOut = [612400, 418300, 871500, 698200, 742900, 791600];
  otherIn.push(OTHER_IN_FY - otherIn.reduce((a, b) => a + b, 0));
  otherOut.push(OTHER_OUT_FY - otherOut.reduce((a, b) => a + b, 0));
  return ms.map((m, i) => {
    const fee = FEE_TREND.find((x) => x.m === m).c * 100000;
    return { m, fee, otherIn: otherIn[i], salary: salary[i], stat: stat[i], otherOut: otherOut[i], inc: fee + otherIn[i], exp: salary[i] + stat[i] + otherOut[i] };
  });
})();
const INC_FY = FEE_FY + OTHER_IN_FY;
const EXP_FY = SAL_FY + STAT_FY + OTHER_OUT_FY;

/* ---------- Other income (Income page) ---------- */
const INCOME0 = [
  { id: 'INC/26/0088', d: '9 Oct', t: '10:12 AM', head: 'Scrap sale', from: 'Sai Ram Traders', amt: 2350, mode: 'Cash', ref: '', acct: 'cash', status: 'Posted', by: ME_ACC, note: 'Old benches and 140 kg of paper waste' },
  { id: 'INC/26/0087', d: '9 Oct', t: '9:40 AM', head: 'Hall and ground rent', from: 'Natya Kala Academy', amt: 15000, mode: 'Bank transfer', ref: 'UTR SBIN226282210934', acct: 'sbi', status: 'Posted', by: ME_ACC, note: 'Auditorium on Sun 11 Oct, 5 to 9 PM. ₹5,000 balance due after the show.' },
  { id: 'INC/26/0086', d: '8 Oct', t: '4:20 PM', head: 'Canteen contract', from: 'Annapurna Caterers', amt: 20000, mode: 'Cheque', ref: 'Cheque 118204 · Canara Bank', acct: 'sbi', status: 'Draft', by: ME_ACC, note: 'October share. Post when the cheque clears.' },
  { id: 'INC/26/0085', d: '5 Oct', t: '11:05 AM', head: 'Alumni donations', from: 'Sunrise Alumni Association (2009 batch)', amt: 25000, mode: 'UPI', ref: 'UTR 427912884410', acct: 'sbi', status: 'Posted', by: ME_ACC, note: 'For new library books' },
  { id: 'INC/26/0084', d: '3 Oct', t: '12:30 PM', head: 'Donations', from: 'Sri Lakshmi Narasimha Charitable Trust', amt: 50000, mode: 'Cheque', ref: 'Cheque 552019 · SBI', acct: 'sbi', status: 'Posted', by: ME_ACC, note: 'For the science lab. 80G receipt given.' },
  { id: 'INC/26/0083', d: '30 Sep', t: '6:00 PM', head: 'Bank interest', from: 'SBI Kukatpally', amt: 38640, mode: 'Bank transfer', ref: 'Interest Jul–Sep', acct: 'sbi', status: 'Posted', by: ME_ACC, note: 'Savings account interest for the quarter' },
  { id: 'INC/26/0082', d: '28 Sep', t: '10:15 AM', head: 'Hall and ground rent', from: 'Kukatpally Cricket Club', amt: 6000, mode: 'UPI', ref: 'UTR 427110092245', acct: 'sbi', status: 'Cancelled', by: ME_ACC, note: 'Ground for Sat 3 Oct', cancel: { why: 'Booking called off because of rain. Money returned by UPI.', by: ME_ACC, when: '29 Sep' } },
  { id: 'INC/26/0081', d: '26 Sep', t: '3:40 PM', head: 'Event sponsorship', from: 'Vijetha Supermarkets', amt: 25000, mode: 'Bank transfer', ref: 'UTR HDFC226269011873', acct: 'sbi', status: 'Posted', by: ME_ACC, note: 'Sports Day banners. Second half due 30 Nov.' },
  { id: 'INC/26/0080', d: '22 Sep', t: '1:10 PM', head: 'Scrap sale', from: 'Sai Ram Traders', amt: 1850, mode: 'Cash', ref: '', acct: 'cash', status: 'Posted', by: ME_ACC, note: 'Old newspapers' },
  { id: 'INC/26/0079', d: '15 Sep', t: '11:45 AM', head: 'Canteen contract', from: 'Annapurna Caterers', amt: 20000, mode: 'UPI', ref: 'UTR 426518220931', acct: 'sbi', status: 'Posted', by: ME_ACC, note: 'September share' },
  { id: 'INC/26/0078', d: '6 Sep', t: '5:30 PM', head: 'Hall and ground rent', from: 'Sri Sai Baba Bhajan Mandali', amt: 8000, mode: 'Cash', ref: '', acct: 'cash', status: 'Posted', by: ME_ACC, note: 'Assembly hall, Sun 6 Sep' },
  { id: 'INC/26/0077', d: '1 Sep', t: '10:00 AM', head: 'Donations', from: 'Mr. P. Venkata Ramana (parent, 9 C)', amt: 15000, mode: 'Cheque', ref: 'Cheque 004118 · ICICI', acct: 'sbi', status: 'Posted', by: ME_ACC, note: 'Water cooler for Block B. 80G receipt given.' },
];

/* ---------- Expenses ---------- */
const EXPENSES0 = [
  { id: 'EXP/26/0449', d: '9 Oct', t: '10:05 AM', head: 'Tea, snacks and petty expenses', vendor: 'Sri Lakshmi Tiffins', what: 'Tea and snacks for the PTM, Classes 1–3', amt: 1450, mode: 'Cash', ref: '', acct: 'cash', bill: true, status: 'Paid', paidOn: '9 Oct', by: 'Kavitha Nair', dept: 'Administration', appr: 'Approved at once (up to ₹2,000)' },
  { id: 'EXP/26/0448', d: '9 Oct', t: '9:50 AM', head: 'Postage and courier', vendor: 'DTDC Kukatpally', what: 'Courier: CBSE registration papers to the regional office', amt: 380, mode: 'Cash', ref: '', acct: 'cash', bill: true, status: 'Paid', paidOn: '9 Oct', by: 'Anita Sharma', dept: 'Administration', appr: 'Approved at once (up to ₹2,000)' },
  { id: 'EXP/26/0446', d: '8 Oct', t: '9:35 AM', head: 'Repairs and maintenance', vendor: 'Ramesh Plumbing Works', what: 'Tap and pipe repair, girls’ washroom, Block A', amt: 2620, mode: 'UPI', ref: 'UTR 428387661240', acct: 'sbi', bill: true, status: 'Paid', paidOn: '9 Oct', by: 'Ramu Yadav', dept: 'Maintenance', appr: 'Anita Sharma, 8 Oct' },
  { id: 'EXP/26/0445', d: '9 Oct', t: '9:15 AM', head: 'Stationery and printing', vendor: 'Sri Sai Stationers', what: 'Printer toner for the office (HP 76A)', amt: 2000, mode: 'Cash', ref: '', acct: 'cash', bill: true, status: 'Paid', paidOn: '9 Oct', by: 'Anita Sharma', dept: 'Administration', appr: 'Approved at once (up to ₹2,000)' },
  { id: 'EXP/26/0444', d: '8 Oct', t: '3:10 PM', head: 'Repairs and maintenance', vendor: 'Vision AV Services', what: 'Smart board repair, Room 204', amt: 12400, bill: true, status: 'Waiting', by: 'Anita Sharma', dept: 'Academics' },
  { id: 'EXP/26/0443', d: '7 Oct', t: '12:20 PM', head: 'Sports and games', vendor: 'Hyderabad Trophy House', what: 'Medals and trophies for Sports Day', amt: 8750, bill: true, status: 'Waiting', by: 'Mohammed Asif', dept: 'Sports and events' },
  { id: 'EXP/26/0442', d: '6 Oct', t: '11:00 AM', head: 'Lab materials', vendor: 'Deccan Scientific Suppliers', what: 'Lab chemicals and glassware, Class 9–10 practicals', amt: 18600, bill: false, status: 'Approved', appr: 'Lakshmi Rao, 7 Oct', by: 'Farhana Begum', dept: 'Academics' },
  { id: 'EXP/26/0441', d: '6 Oct', t: '10:30 AM', head: 'Events and functions', vendor: 'Ramoji Film City', what: 'Staff picnic, advance booking', amt: 15000, bill: false, status: 'Draft', by: 'Anita Sharma', dept: 'Administration', rejected: { by: 'Lakshmi Rao', when: '7 Oct', why: 'Get two quotes and send it again. Keep it under ₹12,000 if you can.' } },
  { id: 'EXP/26/0440', d: '5 Oct', t: '4:45 PM', head: 'Electricity', vendor: 'TSSPDCL', what: 'Electricity bill for September (2 meters)', amt: 84320, bill: true, status: 'Approved', appr: 'Lakshmi Rao, 6 Oct', due: '12 Oct', by: ME_ACC, dept: 'Maintenance' },
  { id: 'EXP/26/0438', d: '8 Oct', t: '2:55 PM', head: 'Tea, snacks and petty expenses', vendor: 'Sri Lakshmi Tiffins', what: 'Tea for the staff meeting', amt: 640, mode: 'Cash', ref: '', acct: 'cash', bill: true, status: 'Paid', paidOn: '8 Oct', by: 'Kavitha Nair', dept: 'Administration', appr: 'Approved at once (up to ₹2,000)' },
  { id: 'EXP/26/0437', d: '7 Oct', t: '5:10 PM', head: 'Diesel', vendor: 'Sri Venkateswara Fuels', what: 'Diesel, Buses 1–3 (entered twice)', amt: 28600, bill: true, status: 'Cancelled', by: 'Venkatesh Goud', dept: 'Transport', cancel: { why: 'Entered twice. The right one is EXP/26/0436.', by: ME_ACC, when: '8 Oct' } },
  { id: 'EXP/26/0436', d: '7 Oct', t: '5:05 PM', head: 'Diesel', vendor: 'Sri Venkateswara Fuels', what: 'Diesel, Buses 1–3 (298 litres)', amt: 28600, mode: 'Bank transfer', ref: 'UTR SBIN226281102245', acct: 'sbi', bill: true, status: 'Paid', paidOn: '8 Oct', by: 'Venkatesh Goud', dept: 'Transport', appr: 'Lakshmi Rao, 8 Oct' },
  { id: 'EXP/26/0431', d: '8 Oct', t: '11:40 AM', head: 'Lab materials', vendor: 'Deccan Scientific Suppliers', what: 'Part payment of bill DSS/2026/772 (from Inventory)', amt: 4000, mode: 'Bank transfer', ref: 'UTR SBIN226281099120', acct: 'sbi', bill: true, status: 'Paid', paidOn: '8 Oct', by: 'Ramu Yadav', dept: 'Academics', appr: 'Purchase order PO-2026-0057' },
  { id: 'EXP/26/0429', d: '5 Oct', t: '10:10 AM', head: 'Internet and phone', vendor: 'ACT Fibernet', what: 'Internet for October (300 Mbps)', amt: 4720, mode: 'UPI', ref: 'UTR 427812640013', acct: 'sbi', bill: true, status: 'Paid', paidOn: '5 Oct', by: ME_ACC, dept: 'Administration', appr: 'Anita Sharma, 5 Oct' },
  { id: 'EXP/26/0425', d: '3 Oct', t: '9:30 AM', head: 'Hostel mess provisions', vendor: 'Ratnadeep Wholesale', what: 'Rice, dal and oil for the hostel mess (October, week 1)', amt: 38450, mode: 'Bank transfer', ref: 'UTR SBIN226276518830', acct: 'sbi', bill: true, status: 'Paid', paidOn: '3 Oct', by: 'Joseph Thomas', dept: 'Hostel', appr: 'Lakshmi Rao, 2 Oct' },
  { id: 'EXP/26/0388', d: '25 Sep', t: '12:00 PM', head: 'Housekeeping and cleaning', vendor: 'CleanPro Hygiene Solutions', what: 'Cleaning supplies, bill CP-1184 (from Inventory)', amt: 7810, mode: 'Bank transfer', ref: 'UTR SBIN226273300412', acct: 'sbi', bill: true, status: 'Paid', paidOn: '30 Sep', by: 'Ramu Yadav', dept: 'Maintenance', appr: 'Purchase order PO-2026-0052' },
];
const EXP_TONE = { Draft: 'neutral', Waiting: 'warn', Approved: 'brand', Paid: 'ok', Cancelled: 'bad', 'Brought in': 'neutral' };
const EXP_LABEL = { Waiting: 'Waiting for approval' };
const ExpPill = ({ s, small }) => <Pill tone={EXP_TONE[s]} className={small ? '!h-5 !text-[11px]' : ''}>{EXP_LABEL[s] || s}</Pill>;
const VENDORS = ['Sri Sai Stationers', 'Deccan Scientific Suppliers', 'CleanPro Hygiene Solutions', 'Sri Lakshmi Tiffins', 'Ramesh Plumbing Works', 'Vision AV Services', 'Hyderabad Trophy House', 'Sri Venkateswara Fuels', 'Ratnadeep Wholesale', 'ACT Fibernet', 'TSSPDCL', 'DTDC Kukatpally'];

/* ---------- Vendor bills ---------- */
const BILLS0 = [
  { no: 'TSSPDCL/SEP-26', vendor: 'TSSPDCL', d: '05-10-2026', amt: 84320, paid: 0, due: '12 Oct 2026', soon: true, exp: 'EXP/26/0440' },
  { no: 'DSS/2026/772', vendor: 'Deccan Scientific Suppliers', d: '08-10-2026', amt: 7400, paid: 4000, due: '7 Nov 2026', exp: 'EXP/26/0431', from: 'Inventory · PO-2026-0057' },
  { no: 'VAV-0912', vendor: 'Vision AV Services', d: '08-10-2026', amt: 12400, paid: 0, due: '23 Oct 2026', exp: 'EXP/26/0444', hold: 'Waiting for approval' },
  { no: 'SSS/1203', vendor: 'Sri Sai Stationers', d: '02-10-2026', amt: 3460, paid: 0, due: '1 Nov 2026' },
  { no: 'CP-1184', vendor: 'CleanPro Hygiene Solutions', d: '25-09-2026', amt: 7810, paid: 7810, due: '25 Oct 2026', exp: 'EXP/26/0388', from: 'Inventory · PO-2026-0052' },
  { no: 'SSS/1176', vendor: 'Sri Sai Stationers', d: '12-09-2026', amt: 9420, paid: 9420, due: '12 Oct 2026', from: 'Inventory · PO-2026-0049' },
];
const billStatus = (b) => (b.paid >= b.amt ? 'Paid' : b.paid > 0 ? 'Part paid' : b.hold || 'Not paid');
const BILL_TONE = { Paid: 'ok', 'Part paid': 'info', 'Not paid': 'warn', 'Waiting for approval': 'neutral' };

/* ---------- Day Book: entries for each date, filled in from their sources ---------- */
const FEE_POOL = STUDENTS.filter((s) => s.status !== 'Inactive');
const refFor = (mode, i) => mode === 'UPI' ? `UTR 4283${String(8817023 + i * 7919).slice(-8)}` : mode === 'Online' ? `pay_PB${(7331 * (i + 5)).toString(36).toUpperCase()}rT${i % 10}` : mode === 'Card' ? `Card ending ${4100 + ((i * 37) % 900)}` : mode === 'Cheque' ? `Cheque 00${4400 + i}` : '';
// rows: [head, amount, kind, account]. A full tuition row is matched to a student of the class that pays that amount.
function genFees({ key, rows, modes, seed, start, step, rc, prefix = 'R/26/0' }) {
  return rows.map(([head, amt, kind, acct], i) => {
    const pool = head.includes('Oct–Dec') || head.includes('Jan–Mar') ? FEE_POOL.filter((s) => qtr(s) === amt) : FEE_POOL;
    const s = pool[(seed + i * 37) % pool.length];
    const mode = Array.isArray(modes) ? modes[(i * 5 + seed) % modes.length] : modes;
    return {
      id: `${key}-${i}`, src: 'fee', no: `${prefix}${rc + i}`, t: hm(start + i * step), who: s.name, cls: clsOf(s), sid: s.id, head, amt, pen: 0, total: amt,
      mode, ref: refFor(mode, seed + i), acct: acct || 'School account', kind, status: 'Posted', by: mode === 'Online' ? 'Razorpay' : ME_ACC,
    };
  });
}
const R = (n) => `Transport fee · Oct (Route ${n})`;
const COUNTER_8 = [['Exam fee · Half-yearly', 1200, 'Full'], [R(1), 2200, 'Full', 'Trust account'], ['Tuition fee · Q3 (part)', 5000, 'Partial'], ['Exam fee · Half-yearly', 1200, 'Full'], [R(4), 2200, 'Full', 'Trust account'],
  ['Tuition fee · Q3 Oct–Dec', 12500, 'Full'], ['Exam fee · Half-yearly', 1200, 'Full'], [R(2), 2200, 'Full', 'Trust account'], ['Tuition fee · Q3 (part)', 4000, 'Partial'], ['Exam fee · Half-yearly', 1200, 'Full'],
  ['Uniform · winter set', 2600, 'Full'], [R(6), 2200, 'Full', 'Trust account'], ['Tuition fee · Q3 Oct–Dec', 9800, 'Full'], ['Exam fee · Half-yearly', 1200, 'Full'], [R(3), 2400, 'Full', 'Trust account'],
  ['Tuition fee · Q3 (part)', 6000, 'Partial'], ['Exam fee · Half-yearly', 1200, 'Full'], [R(5), 1800, 'Full', 'Trust account'], ['Exam fee · Half-yearly', 1200, 'Full'], ['Tuition fee · Q3 Oct–Dec', 12500, 'Full'],
  [R(1), 2200, 'Full', 'Trust account'], ['Exam fee · Half-yearly', 1200, 'Full'], ['Tuition fee · Q3 (part)', 3500, 'Partial']];
// Razorpay on Thu 8 Oct: 29 payments, ₹81,200 (as in the Fee module's online payments report)
const ONLINE_8 = [...Array(10).fill(['Exam fee · Half-yearly', 1200, 'Full']), ...[1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6].map((n) => [R(n), 2200, 'Full', 'Trust account']),
  ...Array(4).fill(['Tuition fee · Q3 (part)', 4000, 'Partial']), ['Tuition fee · Q3 Oct–Dec', 9800, 'Full'], ['Tuition fee · Q3 Oct–Dec', 9500, 'Full'], ['Tuition fee · Q3 (part)', 7500, 'Partial']];
const sortT = (rows) => [...rows].sort((a, b) => tmin(a.t) - tmin(b.t));

// Today: straight from the Fee module's payments (failed online payments never reach the Day Book)
const FEES_9 = FEE_PAYMENTS_TODAY.filter((p) => p.status !== 'Failed').map((p) => ({
  id: 'f9-' + p.id, src: 'fee', no: p.rcpt, t: p.t, who: p.name, cls: p.cls, sid: p.sid, head: p.head, amt: p.amt - (p.pen || 0), pen: p.pen || 0, total: p.amt,
  mode: p.mode, ref: p.ref || '', acct: p.acct, kind: p.kind, other: !!p.other, status: p.status === 'Waiting' ? 'Waiting' : 'Posted', cancelled: p.status === 'Cancelled' ? p.cancel : null, by: p.by,
}));
const reversalsOf = (fees) => fees.filter((e) => e.cancelled).map((e) => ({
  id: 'rv-' + e.id, src: 'reversal', no: e.no, t: e.cancelled.when, who: e.who, cls: e.cls, sid: e.sid, head: `Receipt ${e.no} cancelled · ${e.cancelled.reason}`,
  amt: -e.total, pen: 0, total: -e.total, mode: e.mode, ref: e.no, acct: e.acct, note: e.cancelled.note, by: e.cancelled.by, status: 'Posted',
}));
const incEntry = (r) => ({ id: 'i-' + r.id, src: 'income', no: r.id, t: r.t, who: r.from, cls: '', head: r.head, amt: r.amt, pen: 0, total: r.amt, mode: r.mode, ref: r.ref, acct: ACCT_NAME[r.acct], acctId: r.acct, note: r.note, by: r.by, status: 'Posted' });
const expEntry = (r) => ({ id: 'e-' + r.id, src: 'expense', no: r.id, t: r.paidT || r.t, who: r.vendor, cls: '', head: r.head, amt: r.amt, pen: 0, total: r.amt, mode: r.mode, ref: r.ref, acct: ACCT_NAME[r.acct], acctId: r.acct, note: r.what, by: r.by, dept: r.dept, status: 'Posted' });
const postedIncome = (d) => INCOME0.filter((r) => r.d === d && r.status === 'Posted').map(incEntry);
const paidExpenses = (d) => EXPENSES0.filter((r) => r.paidOn === d && r.status === 'Paid').map(expEntry);

const DAYS = {
  '2026-10-09': { fy: '2026-27', label: 'Fri 9 Oct 2026', short: '9 Oct', today: true, fees: FEES_9, income: postedIncome('9 Oct'), expenses: paidExpenses('9 Oct'), salary: [], reversals: reversalsOf(FEES_9) },
  '2026-10-08': {
    fy: '2026-27', label: 'Thu 8 Oct 2026', short: '8 Oct',
    fees: sortT([...genFees({ key: 'd8c', rows: COUNTER_8, modes: ['Cash', 'UPI', 'UPI', 'Cash', 'UPI', 'Card'], seed: 11, start: 7 * 60 + 40, step: 23, rc: 5100 }),
      ...genFees({ key: 'd8o', rows: ONLINE_8, modes: 'Online', seed: 3, start: 6 * 60 + 10, step: 31, rc: 5123 })]).map((e, i) => ({ ...e, no: `R/26/0${5100 + i}` })),
    income: [], expenses: paidExpenses('8 Oct'), salary: [], reversals: [],
  },
  '2026-10-02': {
    fy: '2026-27', label: 'Fri 2 Oct 2026 · Gandhi Jayanti, school closed', short: '2 Oct', holiday: true,
    fees: genFees({ key: 'd2', rows: [[R(2), 2200, 'Full', 'Trust account'], ['Exam fee · Half-yearly', 1200, 'Full'], ['Tuition fee · Q3 (part)', 5000, 'Partial'], [R(5), 1800, 'Full', 'Trust account'], ['Exam fee · Half-yearly', 1200, 'Full']], modes: 'Online', seed: 41, start: 8 * 60 + 25, step: 97, rc: 4741 }),
    income: [], expenses: [], salary: [], reversals: [],
  },
  '2026-09-30': {
    fy: '2026-27', label: 'Wed 30 Sep 2026', short: '30 Sep',
    fees: genFees({ key: 'd30', rows: [['Tuition fee · Q2 (part)', 4000, 'Partial'], [R(3), 2200, 'Full', 'Trust account'], ['Tuition fee · Q2 (part)', 6500, 'Partial'], ['Hostel fee · Jul–Sep (balance)', 7000, 'Partial'], ['Uniform · winter set', 2600, 'Full'], [R(1), 2200, 'Full', 'Trust account'], ['Tuition fee · Q2 (part)', 5000, 'Partial'], ['Books & stationery kit', 3150, 'Full'], [R(6), 2200, 'Full', 'Trust account'], ['Tuition fee · Q2 (part)', 4250, 'Partial'], [R(4), 2200, 'Full', 'Trust account'], ['Tuition fee · Q2 (part)', 3000, 'Partial']], modes: ['Cash', 'UPI', 'Online', 'UPI'], seed: 23, start: 8 * 60 + 5, step: 41, rc: 4655 }),
    income: postedIncome('30 Sep'), expenses: paidExpenses('30 Sep'),
    salary: [{ id: 'sal-sep', src: 'salary', no: 'PAY-2026-09', t: '11:30 AM', who: 'September 2026 salary · 86 staff', cls: '', head: 'Salaries', amt: 2636400, pen: 0, total: 2636400, mode: 'Bank transfer', ref: 'SBI bulk transfer BT2609300114', acct: ACCT_NAME.sbi, acctId: 'sbi', note: 'Gross ₹27,80,100 less deductions ₹1,43,700. Approved by Lakshmi Rao.', by: 'Lakshmi Rao', status: 'Posted' }],
    reversals: [],
  },
  '2026-03-31': {
    fy: '2025-26', label: 'Tue 31 Mar 2026', short: '31 Mar', old: true,
    fees: genFees({ key: 'd31', rows: [['Tuition fee · Q4 Jan–Mar', 9800, 'Full'], ['Transport fee · Mar (Route 2)', 2100, 'Full', 'Trust account'], ['Tuition fee · Q4 (part)', 6000, 'Partial'], ['Tuition fee · Q4 Jan–Mar', 12500, 'Full'], ['Tuition fee · Q4 (part)', 4500, 'Partial'], ['Transport fee · Mar (Route 5)', 1700, 'Full', 'Trust account']], modes: ['Cash', 'UPI', 'UPI'], seed: 5, start: 9 * 60, step: 52, rc: 9811, prefix: 'R/25/0' }),
    income: [], salary: [], reversals: [],
    expenses: [{ id: 'e-31', src: 'expense', no: 'EXP/25/1162', t: '3:30 PM', who: 'TSSPDCL', cls: '', head: 'Electricity', amt: 71240, pen: 0, total: 71240, mode: 'Bank transfer', ref: 'UTR SBIN226090031874', acct: ACCT_NAME.sbi, acctId: 'sbi', note: 'Electricity bill for February', by: ME_ACC, status: 'Posted' }],
  },
};
const DATE_OPTS = {
  '2026-27': [{ value: '2026-10-09', label: 'Today · Fri 9 Oct 2026' }, { value: '2026-10-08', label: 'Thu 8 Oct 2026' }, { value: '2026-10-02', label: 'Fri 2 Oct 2026 (holiday)' }, { value: '2026-09-30', label: 'Wed 30 Sep 2026' }],
  '2025-26': [{ value: '2026-03-31', label: 'Tue 31 Mar 2026' }],
};
// Cash expected when closing a day (counted and locked)
const DAY_CLOSE_CASH = { '2026-10-08': 38400 };

/* ---------- Money in and out of each cash and bank account, for the Cash & Bank books ---------- */
const SETTLE = {
  '2026-10-08': [{ acct: 'sbi', t: '1:05 PM', what: 'Razorpay settlement for Wed 7 Oct · 41 payments, less ₹2,368 charges', ref: 'setl_PAw71KcQ0nB', inn: 116032, src: 'Fees' }],
  '2026-10-09': [],
};
function moneyRows(key) {
  const d = DAYS[key];
  const out = [];
  d.fees.filter((e) => e.status === 'Posted').forEach((e) => {
    const acct = e.mode === 'Cash' ? 'cash' : ['UPI', 'Bank transfer', 'Cheque'].includes(e.mode) ? FEE_ACCT[e.acct] : null;
    if (acct) out.push({ acct, t: e.t, what: `Fee · ${e.who}, ${e.cls} · ${e.head}`, ref: e.no, inn: e.total, out: 0, src: 'Fees' });
  });
  d.reversals.forEach((e) => { const acct = e.mode === 'Cash' ? 'cash' : FEE_ACCT[e.acct]; out.push({ acct, t: e.t, what: `Reversal · ${e.head}`, ref: e.no, inn: 0, out: -e.total, src: 'Fees' }); });
  d.income.forEach((e) => out.push({ acct: e.acctId, t: e.t, what: `${e.head} · ${e.who}`, ref: e.no, inn: e.total, out: 0, src: 'Income' }));
  d.expenses.forEach((e) => out.push({ acct: e.acctId, t: e.t, what: `${e.head} · ${e.who}`, ref: e.no, inn: 0, out: e.total, src: 'Expenses' }));
  d.salary.forEach((e) => out.push({ acct: e.acctId, t: e.t, what: e.who, ref: e.no, inn: 0, out: e.total, src: 'Salary' }));
  (SETTLE[key] || []).forEach((x) => out.push({ out: 0, ...x }));
  return sortT(out);
}
const ROWS_8 = moneyRows('2026-10-08');
const ROWS_9 = moneyRows('2026-10-09');
const netOf = (rows, a) => sumBy(rows.filter((r) => r.acct === a), (r) => r.inn - r.out);
const OPEN8 = Object.fromEntries(Object.keys(OPEN9).map((a) => [a, OPEN9[a] - netOf(ROWS_8, a)]));
const BOOK_DAYS = { '2026-10-09': { open: OPEN9, rows: ROWS_9, label: 'Fri 9 Oct 2026', next: null }, '2026-10-08': { open: OPEN8, rows: ROWS_8, label: 'Thu 8 Oct 2026', next: 'Fri 9 Oct' } };
// Online and card payments reach the bank the next working day
const ON_THE_WAY = FEES_9.filter((e) => e.status === 'Posted' && (e.mode === 'Online' || e.mode === 'Card'));
const WAITING_9 = FEES_9.filter((e) => e.status === 'Waiting');

/* ---------- Small shared pieces ---------- */
const ModeIcon = ({ mode, size = 15 }) => { const Ic = MODE_ICON[mode] || I.Wallet; return <Ic size={size} className="text-ink3 shrink-0" />; };
const ModeCell = ({ mode }) => (mode ? <span className="inline-flex items-center gap-1.5 text-[13px]"><ModeIcon mode={mode} />{mode}</span> : <span className="text-ink3">—</span>);
const Ref = ({ v }) => <span className="font-mono text-[12px] text-ink2">{v || '—'}</span>;
const Mini = ({ k, v }) => (
  <div className="min-w-0">
    <p className="text-[12px] text-ink3 font-semibold">{k}</p>
    <p className="text-[14px] mt-0.5 break-words">{v}</p>
  </div>
);
const Line = ({ k, v, tone, bold }) => (
  <li className="flex items-center justify-between gap-3 py-2.5 border-t border-line/70 first:border-0 text-[14px]">
    <span className="text-ink2 min-w-0">{k}</span><b className={cx('tnum shrink-0', bold ? 'font-semibold' : 'font-medium', tone && { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', info: 'text-info', brand: 'text-brand' }[tone])}>{v}</b>
  </li>
);
const Chip = ({ on, onClick, children, disabled }) => (
  <button type="button" disabled={disabled} onClick={onClick} aria-pressed={on}
    className={cx('h-9 px-3 rounded-xl border text-[13.5px] font-semibold transition', on ? 'bg-brand/10 border-brand text-brand' : 'border-line text-ink2 hover:border-ink3/50')}>
    {on && <I.Check size={14} className="inline mr-1 -mt-0.5" />}{children}
  </button>
);

/* =========================================================================================
   Day Book
   ========================================================================================= */
const SRC_INFO = {
  fee: ['Fee payment', 'ReceiptIndianRupee', 'ok'], income: ['Other income', 'HandCoins', 'ok'], expense: ['Expense', 'ReceiptText', 'warn'],
  salary: ['Salary', 'Wallet', 'warn'], reversal: ['Reversal', 'Undo2', 'bad'],
};
function entryCols(kind, showAcct) {
  const n = { key: 'i', label: '#', render: (r) => <span className="text-ink3 tnum">{r.i}</span> };
  const total = { key: 'total', label: kind === 'fee' ? 'Total' : 'Amount', align: 'right', render: (r) => <b className={cx('font-semibold', r.cancelled && 'line-through text-ink3', r.total < 0 && 'text-bad')}>{signed(r.total)}</b> };
  const mode = { key: 'mode', label: 'Mode', nowrap: true, render: (r) => <ModeCell mode={r.mode} /> };
  const ref = { key: 'ref', label: 'Reference', render: (r) => <Ref v={r.ref} /> };
  const t = { key: 't', label: 'Time', nowrap: true, render: (r) => <span className="tnum text-ink2">{r.t}</span> };
  const acct = { key: 'acct', label: kind === 'fee' ? 'Bank account' : 'Paid from', nowrap: true, render: (r) => <span className="text-[13px] text-ink2">{r.acct}</span> };
  const note = { key: 'note', label: 'Notes', render: (r) => r.status === 'Waiting' ? <PayPill status="Waiting" short /> : r.cancelled ? <Pill tone="bad" className="!h-5 !text-[11px]">Cancelled {r.cancelled.when}</Pill> : <span className="text-[12.5px] text-ink3">{r.note || ''}</span> };
  if (kind === 'fee') return [n,
    { key: 'who', label: 'Student', render: (r) => <><p className="font-semibold leading-tight">{r.who}</p><p className="text-[12px] text-ink3 font-mono">{r.no}</p></> },
    { key: 'cls', label: 'Class', nowrap: true },
    { key: 'head', label: 'Fee type', render: (r) => <span className="text-[13px] text-ink2">{r.head}</span> },
    { key: 'amt', label: 'Amount', align: 'right', render: (r) => inr(r.amt) },
    { key: 'pen', label: 'Penalty', align: 'right', render: (r) => (r.pen ? inr(r.pen) : <span className="text-ink3">—</span>) },
    total, mode, ref, t, ...(showAcct ? [acct] : []), note];
  if (kind === 'reversal') return [n,
    { key: 'who', label: 'Student or payer', render: (r) => <><p className="font-semibold leading-tight">{r.who}</p><p className="text-[12px] text-ink3">{r.cls}</p></> },
    { key: 'head', label: 'What', render: (r) => <span className="text-[13px] text-ink2">{r.head}</span> }, total, mode, t, note];
  return [n,
    { key: 'who', label: kind === 'income' ? 'Received from' : kind === 'salary' ? 'Payroll' : 'Paid to', render: (r) => <><p className="font-semibold leading-tight">{r.who}</p><p className="text-[12px] text-ink3 font-mono">{r.no}</p></> },
    { key: 'head', label: kind === 'income' ? 'Income head' : 'Category', render: (r) => <span className="text-[13px] text-ink2">{r.head}</span> },
    total, mode, ref, t, acct, note];
}

function DaySection({ title, icon, kind, rows, empty, onOpen, showAcct, tone }) {
  const total = sumBy(rows, (r) => r.total);
  return (
    <Card className="overflow-hidden">
      <CardHead title={title} icon={I[icon]} sub={rows.length ? `${rows.length} ${rows.length === 1 ? 'entry' : 'entries'} · ${signed(total)}` : 'None'}
        action={rows.length ? <Pill tone={tone}>{signed(total)}</Pill> : null} />
      {rows.length ? (
        <DataList rows={rows.map((r, i) => ({ ...r, i: i + 1 }))} onRow={onOpen} minWidth={kind === 'fee' ? 1180 : 960} footer={false}
          columns={entryCols(kind, showAcct)}
          mobile={(r) => ({
            title: r.who, sub: `${r.cls ? r.cls + ' · ' : ''}${r.head}`, icon: MODE_ICON[r.mode] || I.Wallet, iconTone: 'neutral',
            right: <><p className={cx('font-semibold tnum text-[14.5px]', r.cancelled && 'line-through text-ink3', r.total < 0 && 'text-bad')}>{signed(r.total)}</p><p className="text-[12px] text-ink3 tnum">{r.t}</p></>,
            pills: r.status === 'Waiting' ? [<PayPill key="w" status="Waiting" short />] : r.cancelled ? [<Pill key="c" tone="bad" className="!h-5 !text-[11px]">Cancelled</Pill>] : undefined,
          })} />
      ) : <p className="px-5 pb-4 -mt-1 text-[13.5px] text-ink3">{empty}</p>}
    </Card>
  );
}

function EntrySheet({ e, day, onClose }) {
  const { go } = useNav();
  const { role } = useRole();
  if (!e) return null;
  const [label, icon, tone] = SRC_INFO[e.src];
  // Each link only when this person may open the page it leads to
  const feeLink = e.sid && canOpen(role, 'fees', 'ledger') ? [e.src === 'fee' ? 'Open the student’s fee ledger' : 'Open the cancelled receipt in Fees', () => go('fees', { page: 'ledger', id: e.sid })]
    : canOpen(role, 'fees', 'dashboard') ? ['Open in Fees', () => go('fees', { page: 'dashboard' })] : null;
  const link = {
    fee: feeLink, reversal: feeLink,
    income: canOpen(role, 'finance', 'income') ? ['Open in Income', () => go('finance', { page: 'income' })] : null,
    expense: canOpen(role, 'finance', 'expenses') ? ['Open the expense and bill', () => go('finance', { page: 'expenses' })] : null,
    salary: canOpen(role, 'salary', 'history') ? ['Open the payroll run', () => go('salary', { page: 'history' })] : null,
  }[e.src];
  return (
    <Sheet open onClose={onClose} title={`${label} · ${signed(e.total)}`} sub={`${e.dayLabel || day.label} · ${e.time || e.t}`}
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button>{link && <Button variant="primary" icon={I.ExternalLink} onClick={link[1]}>{link[0]}</Button>}</>}>
      <div className="flex items-center gap-3 mb-4">
        <span className={cx('w-11 h-11 rounded-xl grid place-items-center shrink-0', TONE_SOFT[tone])}>{React.createElement(I[icon], { size: 20 })}</span>
        <div className="min-w-0"><p className="font-semibold text-[15px] truncate">{e.who}</p><p className="text-[13px] text-ink3 truncate">{e.cls ? `${e.cls} · ` : ''}{e.head}</p></div>
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-3.5">
        <Mini k={e.src === 'fee' || e.src === 'reversal' ? 'Receipt' : 'Number'} v={<span className="font-mono text-[13px]">{e.no}</span>} />
        <Mini k="Time" v={e.time || e.t} />
        {e.src === 'fee' && <><Mini k="Amount" v={inr(e.amt)} /><Mini k="Penalty (late fee)" v={e.pen ? inr(e.pen) : 'None'} /></>}
        <Mini k="Total" v={<b className="font-semibold">{signed(e.total)}</b>} />
        <Mini k="Mode" v={<ModeCell mode={e.mode} />} />
        <Mini k="Reference" v={<Ref v={e.ref} />} />
        <Mini k={e.src === 'fee' ? 'Bank account' : 'Cash or bank'} v={e.acct || '—'} />
        <Mini k="Recorded by" v={e.by || ME_ACC} />
        {e.dept && <Mini k="Department" v={e.dept} />}
      </div>
      {e.note && <p className="mt-4 text-[13.5px] text-ink2 bg-sunken rounded-xl px-3.5 py-2.5">{e.note}</p>}
      {e.status === 'Waiting' && <Banner tone="warn" className="mt-4" title="Waiting for verification.">Shown because “Show waiting entries” is on. It is not counted until the accountant verifies it in Fees.</Banner>}
      {e.cancelled && <Banner tone="bad" className="mt-4" title={`Cancelled at ${e.cancelled.when} by ${e.cancelled.by}.`}>{e.cancelled.note} The original line stays; a reversal line takes the money back out.</Banner>}
      <p className="mt-4 text-[12.5px] text-ink3 flex gap-1.5"><I.Lock size={14} className="shrink-0 mt-0.5" />Day Book entries cannot be typed or changed here. A wrong entry is put right at its source, which adds a reversal.</p>
    </Sheet>
  );
}

// One Day Book for a date range: the days inside it, put together (newest day first)
function bookFor(per) {
  const keys = Object.keys(DAYS).filter((k) => k >= per.from && k <= per.to).sort().reverse();
  if (keys.length === 1) return { ...DAYS[keys[0]], keys };
  const tag = (k) => (e) => ({ ...e, time: e.t, t: `${DAYS[k].short}, ${e.t}`, dayLabel: DAYS[k].label });
  const pick = (f) => keys.flatMap((k) => DAYS[k][f].map(tag(k)));
  return {
    keys, label: per.from === per.to ? fmtDay(per.from) : fmtRange(per), short: fmtRange(per), today: keys.includes('2026-10-09') && keys.length === 1,
    old: keys.some((k) => DAYS[k].old), holiday: keys.length > 0 && keys.every((k) => DAYS[k].holiday),
    fees: pick('fees'), income: pick('income'), expenses: pick('expenses'), salary: pick('salary'), reversals: pick('reversals'),
  };
}

function DayBookPage() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const { role } = useRole();
  const pay = seesPay(role);
  // Principal and School Admin read the Day Book: they see a day left open, not the Close button
  const oversight = usePage().access === 'view';
  const blank = { cls: 'all', acct: 'all' };
  const [draft, setDraft] = useState(blank);
  const [f, setF] = useState(blank);
  const [per, setPer] = useState(DP.today);
  const [waiting, setWaiting] = useState(false);
  const [open, setOpen] = useState(null);
  const [closed, setClosed] = useState(new Set(['2026-10-02', '2026-09-30', '2026-03-31']));
  const [closing, setClosing] = useState(null);
  const [exp, setExp] = useState(false);
  const day = bookFor(per);
  const single = day.keys.length === 1 && per.from === per.to;
  const on = single ? 'on this date' : 'in these dates';
  const dirty = JSON.stringify(draft) !== JSON.stringify(f);
  const clsLabel = f.cls === 'all' ? null : CLASSES.find((c) => c.id === f.cls).name.replace('Class ', '');
  const keepFee = (e) => (waiting || e.status !== 'Waiting') && (!clsLabel || e.cls.startsWith(clsLabel + ' ')) && (f.acct === 'all' || e.acct === f.acct);
  const filtered = !!clsLabel || f.acct !== 'all';
  const fees = day.fees.filter(keepFee);
  const full = fees.filter((e) => e.kind === 'Full');
  const part = fees.filter((e) => e.kind === 'Partial');
  const reversals = day.reversals.filter((e) => (!clsLabel || e.cls.startsWith(clsLabel + ' ')) && (f.acct === 'all' || e.acct === f.acct));
  const income = filtered ? [] : day.income;
  const expenses = filtered ? [] : day.expenses;
  const salary = filtered || !pay ? [] : day.salary;
  const sFull = sumBy(full, (e) => e.total), sPart = sumBy(part, (e) => e.total), sRev = sumBy(reversals, (e) => e.total), sInc = sumBy(income, (e) => e.total);
  const totalIn = sFull + sPart + sRev + sInc;
  const totalOut = sumBy(expenses, (e) => e.total) + sumBy(salary, (e) => e.total);
  const nIn = full.length + part.length + income.length;
  const valid = fees.filter((e) => !e.cancelled);
  const grp = (rows) => [sumBy(rows, (e) => e.total), rows.length];
  const online = grp(valid.filter((e) => e.mode === 'Online'));
  const groups = [
    { label: 'Online fees', v: online, icon: 'Globe' },
    { label: 'Full payments', v: grp(valid.filter((e) => e.kind === 'Full' && e.mode !== 'Online' && !e.other)), icon: 'CircleCheck' },
    { label: 'Partial payments', v: grp(valid.filter((e) => e.kind === 'Partial' && e.mode !== 'Online')), icon: 'CirclePause' },
    { label: 'Daycare', v: [0, 0], icon: 'Baby' },
    { label: 'Other fee types', v: grp(valid.filter((e) => e.other && e.mode !== 'Online')), icon: 'Shirt' },
    { label: 'Other income', v: grp(income), icon: 'HandCoins' },
  ];
  const modes = ['Cash', 'UPI', 'Online', 'Card', 'Cheque', 'Bank transfer'].map((m) => [m, sumBy([...valid, ...income].filter((e) => e.mode === m), (e) => e.total)]).filter(([, v]) => v);
  const byAcct = ['School account', 'Trust account'].map((a) => [a, valid.filter((e) => e.acct === a)]);
  const isClosed = day.keys.length > 0 && day.keys.every((k) => closed.has(k));
  const openDay = !closed.has('2026-10-08') ? '2026-10-08' : !closed.has('2026-10-09') ? '2026-10-09' : null;
  const allFeesToday = FEES_9.filter((e) => !e.cancelled);
  const apply = () => { setF(draft); toast({ title: 'Day Book updated', body: `${day.label}${draft.cls !== 'all' ? ` · ${CLASSES.find((c) => c.id === draft.cls).name}` : ''}${draft.acct !== 'all' ? ` · ${draft.acct}` : ''}` }); };
  const reset = () => { setDraft(blank); setF(blank); setPer(DP.today); setWaiting(false); };
  const sectionProps = { onOpen: setOpen, showAcct: true };

  return (
    <div>
      <ModuleHead title="Day Book" sub={`Daily income and expense summary, ${day.label.replace(' · ', ', ')}`}
        actions={openDay && canEdit && <Button variant="primary" icon={I.Lock} onClick={() => setClosing(openDay)}>Close {DAYS[openDay].short}</Button>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        {!closed.has('2026-10-08') && canEdit && (
          <Banner tone="bad" title="Thu 8 Oct is not closed yet." action={<Button size="sm" variant="secondary" onClick={() => setClosing('2026-10-08')}>Count and close</Button>}>
            Cash in hand of {inr(38400)} is waiting to be counted and locked.
          </Banner>
        )}
        {!closed.has('2026-10-08') && oversight && (
          <Banner tone="warn" title="Thu 8 Oct is not closed yet." action={<Button size="sm" variant="secondary" icon={I.BellRing} onClick={() => toast({ title: 'Suresh Babu is reminded', body: 'Count the cash for Thu 8 Oct and close the day. He gets it on WhatsApp and his Home page.' })}>Remind Suresh Babu</Button>}>
            Cash in hand of {inr(38400)} has not been counted and locked by the accountant.
          </Banner>
        )}
        {day.old && <Banner tone="warn" title="Finance year 2025–26 is closed.">Its books are read only. Put a mistake right with an adjustment in 2026–27.</Banner>}

        <Card>
          <CardHead title="Show the Day Book for" sub="Any day or range of days · the financial year runs April to March, apart from the academic year (June to May)" icon={I.Filter}
            action={<div className="flex gap-1.5"><Button size="sm" variant="secondary" icon={I.Download} onClick={() => setExp(true)}>Export</Button><Button size="sm" variant="ghost" icon={I.Printer} className="hidden @sm:inline-flex" onClick={() => toast({ title: 'Sent to the office printer', body: `Day Book for ${day.label} · ${inr(totalIn)} in, ${inr(totalOut)} out` })}>Print</Button></div>} />
          <div className="px-5 pb-4 grid grid-cols-1 @md:grid-cols-2 @xl:grid-cols-3 gap-3">
            <Field label="Dates" id="db-per"><DatePeriod id="db-per" value={per} onChange={setPer} className="w-full" /></Field>
            <Field label="Class" id="db-cls" hint="For fee entries"><Select id="db-cls" value={draft.cls} onChange={(v) => setDraft({ ...draft, cls: v })} options={[{ value: 'all', label: 'All classes' }, ...CLASSES.map((c) => ({ value: c.id, label: c.name }))]} /></Field>
            <Field label="Bank account" id="db-acct" hint="Fees go to the account of their fee head"><Select id="db-acct" value={draft.acct} onChange={(v) => setDraft({ ...draft, acct: v })} options={[{ value: 'all', label: 'All accounts' }, { value: 'School account', label: 'School account · SBI' }, { value: 'Trust account', label: 'Trust account · HDFC' }]} /></Field>
          </div>
          <div className="px-5 pb-4 flex flex-wrap items-center gap-3 border-t border-line/70 pt-3.5">
            <label htmlFor="db-wait" className="flex items-center gap-2.5 text-[14px] mr-auto">
              <Switch id="db-wait" on={waiting} label="Show waiting entries" onChange={setWaiting} />
              <span><b className="font-semibold">Show waiting entries</b><span className="text-ink3"> · cheques and transfers not verified yet</span></span>
            </label>
            <Button variant="ghost" onClick={reset}>Reset</Button>
            <Button variant={dirty ? 'primary' : 'secondary'} icon={I.Check} onClick={apply} disabled={!dirty}>Apply</Button>
          </div>
        </Card>

        <Band items={[
          { label: 'Total income', big: inr(totalIn), foot: `${nIn} transactions · Fees ${inr(sFull)} + Partial ${inr(sPart)}${sRev ? ` · less ${inr(-sRev)} reversed` : ''}` },
          { label: 'Total expense', big: inr(totalOut), foot: `${expenses.length + salary.length} transactions${salary.length ? ' · includes salary' : ''}${!pay && day.salary.length ? ' · staff pay not shown' : ''}` },
          { label: 'Net balance', big: signed(totalIn - totalOut), foot: !day.keys.length ? fmtRange(per) : isClosed ? (single ? 'Day closed and locked' : 'All these days are closed') : day.today ? 'Live · updated 10:42 AM' : single ? 'Not closed yet' : 'Some days not closed yet' },
        ]} />

        <Stats items={groups.map((g) => ({ label: g.label, value: inr(g.v[0]), sub: g.v[1] ? `${g.v[1]} ${g.v[1] === 1 ? 'entry' : 'entries'}` : g.label === 'Daycare' ? 'No daycare at this school' : 'None', icon: g.icon }))} />

        <Split side={340}>
          <Col>
            <DaySection title="Fee payments (full)" icon="ReceiptIndianRupee" kind="fee" rows={full} tone="ok" empty={`No full fee payments ${on}.`} {...sectionProps} />
            <DaySection title="Partial payments" icon="CirclePause" kind="fee" rows={part} tone="ok" empty={`No partial payments ${on}.`} {...sectionProps} />
            <DaySection title="Daycare payments" icon="Baby" kind="fee" rows={[]} empty={`No daycare payments ${on}. Sunrise Public School does not run a daycare.`} {...sectionProps} />
            <DaySection title="Other income" icon="HandCoins" kind="income" rows={income} tone="ok" empty={filtered ? 'Hidden while a class or bank account filter is on.' : `No other income ${on}.`} {...sectionProps} />
            <DaySection title="Expenses" icon="ReceiptText" kind="expense" rows={expenses} tone="warn" empty={filtered ? 'Hidden while a class or bank account filter is on.' : day.holiday ? `No expenses paid ${on}. The school was closed.` : `No expenses paid ${on}.`} {...sectionProps} />
            <DaySection title="Salary" icon="Wallet" kind="salary" rows={salary} tone="warn" empty={!pay ? 'Staff pay is shown only to the Accountant, the Principal and the School Admin.' : filtered ? 'Hidden while a class or bank account filter is on.' : `No salary or salary advance paid ${on}. Salary is added on the day it is marked paid.`} {...sectionProps} />
            <DaySection title="Refunds and reversals" icon="Undo2" kind="reversal" rows={reversals} tone="bad" empty={`No refunds or reversals ${on}.`} {...sectionProps} />
          </Col>
          <Col>
            {day.today && (
              <Card>
                <CardHead title="Matches the Fee Dashboard" sub="Fees collected today" icon={I.ShieldCheck} action={<Pill tone={waiting ? 'ok' : 'info'}>{waiting ? 'Same total' : `${inr(sumBy(WAITING_9, (e) => e.total))} waiting`}</Pill>} />
                <ul className="px-5 pb-4">
                  <Line k={`Fee Dashboard · ${allFeesToday.length} payments`} v={inr(sumBy(allFeesToday, (e) => e.total))} bold />
                  <Line k={`Posted here · ${allFeesToday.length - WAITING_9.length} payments`} v={inr(sumBy(allFeesToday.filter((e) => e.status === 'Posted'), (e) => e.total))} />
                  <Line k={`Waiting for verification · ${WAITING_9.length}`} v={inr(sumBy(WAITING_9, (e) => e.total))} tone="warn" />
                </ul>
                <p className="px-5 pb-4 -mt-1 text-[12.5px] text-ink3">The cheque and the bank transfer count only after the accountant checks them. Turn on “Show waiting entries” to see them here.</p>
              </Card>
            )}
            <Card>
              <CardHead title="How the money came in" sub="By payment mode" icon={I.Wallet} />
              {modes.length ? (
                <div className="px-5 pb-5 flex flex-wrap gap-2">
                  {modes.map(([m, v]) => <Pill key={m} tone="neutral" className="!h-8 !px-3 !text-[13px]"><ModeIcon mode={m} size={14} />{m} {inr(v)}</Pill>)}
                </div>
              ) : <p className="px-5 pb-4 text-[13.5px] text-ink3">No money came in.</p>}
            </Card>
            <Card>
              <CardHead title="Fees by bank account" sub="From Fee Settings: each fee head has its own account" icon={I.Landmark} />
              <ul className="px-5 pb-4">
                {byAcct.map(([a, rows]) => <Line key={a} k={<><b className="font-semibold text-ink">{a}</b><span className="block text-[12px] text-ink3">{a === 'School account' ? 'SBI Kukatpally ••2209 · all heads except transport' : 'HDFC KPHB ••7730 · transport fee'} · {rows.length} entries</span></>} v={inr(sumBy(rows, (e) => e.total))} />)}
              </ul>
              <p className="px-5 pb-4 -mt-1 text-[12.5px] text-ink3">Online payments show the account Razorpay split them into. Counter payments show the account the cash or cheque goes into.</p>
            </Card>
            <Card>
              <CardHead title="Where entries come from" icon={I.Workflow} />
              <ul className="px-5 pb-4 text-[13.5px] text-ink2 flex flex-col gap-2">
                {[['ReceiptIndianRupee', 'Fees', 'when a payment is posted, a reversal when it is cancelled'], ['HandCoins', 'Income', 'when other income is posted'], ['ReceiptText', 'Expenses', 'only when marked Paid, on the date paid'], ['Wallet', 'Salary', 'when a month’s salary or an advance is marked Paid'], ['ShoppingCart', 'Inventory', 'vendor bill payments, as expenses']].map(([ic, k, v]) => (
                  <li key={k} className="flex gap-2.5"><span className="w-7 h-7 rounded-lg bg-sunken text-ink2 grid place-items-center shrink-0">{React.createElement(I[ic], { size: 15 })}</span><span><b className="font-semibold text-ink">{k}</b> · {v}</span></li>
                ))}
              </ul>
            </Card>
          </Col>
        </Split>
      </div>

      <EntrySheet key={open?.id} e={open} day={day} onClose={() => setOpen(null)} />
      <CloseDaySheet dayKey={closing} onClose={() => setClosing(null)} onDone={(k) => {
        setClosed((x) => new Set([...x, k]));
        toast({ title: `${DAYS[k].label} is closed`, body: 'Cash counted and the day locked. Corrections now go in as adjustments on an open day.', undo: () => setClosed((x) => { const n = new Set(x); n.delete(k); return n; }) });
      }} />
      <ExportSheet open={exp} onClose={() => setExp(false)} title={`Day Book for ${day.label}${!pay ? ' (without staff pay)' : ''}`} lines={[['Total income', inr(totalIn)], ['Total expense', inr(totalOut)], ['Net balance', signed(totalIn - totalOut)], ['Entries', String(fees.length + income.length + expenses.length + salary.length + reversals.length)]]} />
    </div>
  );
}

function CloseDaySheet({ dayKey, onClose, onDone }) {
  const [counted, setCounted] = useState('');
  const [why, setWhy] = useState('');
  const [tried, setTried] = useState(false);
  if (!dayKey) return null;
  const d = DAYS[dayKey];
  const expected = DAY_CLOSE_CASH[dayKey] ?? (OPEN9.cash + netOf(ROWS_9, 'cash'));
  const c = num(counted);
  const diff = counted === '' ? 0 : c - expected;
  const err = { counted: counted === '' ? 'Count the cash and enter the amount' : '', why: diff !== 0 && !why.trim() ? 'The count does not match. Say why; the Principal is told.' : '' };
  return (
    <FormSheet open onClose={() => { onClose(); setCounted(''); setWhy(''); setTried(false); }} title={`Close ${d.label}`} sub="Count the cash in the box. After closing, nothing on this day can change." submitLabel="Close the day" busyLabel="Closing…"
      onSubmit={() => { setTried(true); if (err.counted || err.why) return false; onDone(dayKey); setCounted(''); setWhy(''); setTried(false); }}>
      {dayKey === '2026-10-09' && <Banner tone="warn">It is 10:42 AM. Payments after closing go into Monday’s Day Book.</Banner>}
      <ul className="rounded-2xl border border-line px-4">
        <Line k="Cash the books expect" v={inr(expected)} bold />
        <Line k="You counted" v={counted === '' ? '—' : inr(c)} />
        <Line k="Difference" v={counted === '' ? '—' : diff === 0 ? 'None' : signed(diff)} tone={counted === '' ? undefined : diff === 0 ? 'ok' : 'bad'} />
      </ul>
      <Field label="Cash counted" required id="cd-count" error={tried && err.counted} hint={!(tried && err.counted) ? 'Notes and coins in the office cash box' : undefined}>
        <Input id="cd-count" inputMode="numeric" value={counted} onChange={(e) => setCounted(e.target.value.replace(/[^\d]/g, ''))} error={tried && err.counted} className="tnum" placeholder={String(expected)} />
      </Field>
      {diff !== 0 && <Field label="Why is it different?" required id="cd-why" error={tried && err.why}><Textarea id="cd-why" value={why} onChange={setWhy} rows={2} placeholder="Example: ₹100 short, change given twice to a parent" /></Field>}
    </FormSheet>
  );
}

function ExportSheet({ open, onClose, title, lines }) {
  const toast = useToast();
  const [fmt, setFmt] = useState('Excel');
  return (
    <Sheet open={open} onClose={onClose} title="Export" sub={title}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={I.Download} onClick={() => { onClose(); toast({ title: `Exported: ${title}`, body: `${fmt} file with the school name, filters and your name on top. Same totals as on screen. Logged in the export log.` }); }}>Download {fmt}</Button></>}>
      <Segmented value={fmt} onChange={setFmt} className="w-full" options={['CSV', 'Excel', 'PDF']} />
      <ul className="mt-4 rounded-2xl border border-line px-4">{lines.map(([k, v]) => <Line key={k} k={k} v={v} />)}</ul>
    </Sheet>
  );
}

/* =========================================================================================
   Income (money other than fees)
   ========================================================================================= */
const INC_TONE = { Posted: 'ok', Draft: 'neutral', Cancelled: 'bad' };
const inRange = (d, per) => inPeriod(isoOf(d), per);

function IncomePage() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const [list, setList] = useState(INCOME0);
  const [q, setQ] = useState('');
  const [range, setRange] = useState(DP.finyear);
  const [head, setHead] = useState('all');
  const [mode, setMode] = useState('all');
  const [status, setStatus] = useState('all');
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(null);
  const [cancel, setCancel] = useState(null);
  const t = q.trim().toLowerCase();
  const rows = list.filter((r) => inRange(r.d, range) && (head === 'all' || r.head === head) && (mode === 'all' || r.mode === mode) && (status === 'all' || r.status === status)
    && (!t || r.from.toLowerCase().includes(t) || r.id.toLowerCase().includes(t) || r.head.toLowerCase().includes(t)));
  const posted = list.filter((r) => r.status === 'Posted');
  // Change since the page opened: newly posted entries in, cancelled ones out
  const was = new Set(INCOME0.filter((r) => r.status === 'Posted').map((r) => r.id));
  const added = sumBy(posted.filter((r) => !was.has(r.id)), (r) => r.amt) - sumBy(list.filter((r) => was.has(r.id) && r.status !== 'Posted'), (r) => r.amt);
  const drafts = list.filter((r) => r.status === 'Draft');
  const upd = (id, x) => setList((l) => l.map((r) => (r.id === id ? { ...r, ...x } : r)));
  const post = (r) => { upd(r.id, { status: 'Posted', d: '9 Oct', t: '10:44 AM' }); setOpen(null); toast({ title: `${r.id} posted`, body: `${inr(r.amt)} is in the Day Book for 9 Oct, in ${ACCT_NAME[r.acct]}.`, undo: () => upd(r.id, { status: 'Draft', d: r.d, t: r.t }) }); };
  const byHead = IN_HEADS.map((h) => ({ k: h, v: HEAD[h].fy })).sort((a, b) => b.v - a.v);

  return (
    <div>
      <ModuleHead sub="Money the school receives other than fees: rent, donations, scrap sale, interest"
        actions={canEdit && <Button variant="primary" icon={I.Plus} onClick={() => setAdding(true)}>Record income</Button>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Stats items={[
          { label: range.key === 'finyear' ? 'This financial year' : range.label, value: inr(range.key === 'finyear' ? OTHER_IN_FY + added : Math.round(MONTHLY.reduce((x, m, i) => x + m.otherIn * monthShare(range, 2026, FY_MONTHS[i][2]), 0))), sub: fmtRange(range), icon: 'HandCoins' },
          { label: 'This month', value: inr(sumBy(posted.filter((r) => r.d.endsWith('Oct')), (r) => r.amt)), sub: `${posted.filter((r) => r.d.endsWith('Oct')).length} entries posted`, icon: 'CalendarDays', tone: 'ok' },
          { label: 'Drafts', value: drafts.length, sub: drafts.length ? `${inr(sumBy(drafts, (r) => r.amt))} not in the Day Book` : 'Nothing waiting', icon: 'FilePen', tone: drafts.length ? 'warn' : undefined, onClick: () => setStatus('Draft') },
          { label: 'Cancelled', value: list.filter((r) => r.status === 'Cancelled').length, sub: 'Kept with the reason', icon: 'CircleX', onClick: () => setStatus('Cancelled') },
        ]} />
        <Split>
          <Card className="overflow-hidden">
            <CardHead title="Income entries" sub={`${range.label} · ${fmtRange(range)} · newest first. Posted entries are in the Day Book.`} icon={I.HandCoins} />
            <Toolbar>
              <SearchBox id="inc-q" value={q} onChange={setQ} placeholder="Payer, head or number" />
              <div className="grid grid-cols-1 gap-2.5 @md:flex">
                <DatePeriod id="inc-range" value={range} onChange={setRange} className="w-full @md:w-auto" />
                <Select id="inc-status" className="@md:w-36" value={status} onChange={setStatus} options={[{ value: 'all', label: 'All statuses' }, 'Posted', 'Draft', 'Cancelled']} />
              </div>
            </Toolbar>
            <div className="px-3 pt-3 grid grid-cols-2 gap-2.5 @md:flex">
              <Select id="inc-head" className="@md:w-60" value={head} onChange={setHead} options={[{ value: 'all', label: 'All income heads' }, ...IN_HEADS]} />
              <Select id="inc-mode" className="@md:w-44" value={mode} onChange={setMode} options={[{ value: 'all', label: 'All modes' }, 'Cash', 'UPI', 'Bank transfer', 'Cheque']} />
            </div>
            <div className="mt-3 border-t border-line">
              <DataList rows={rows} onRow={setOpen} minWidth={860} footer={`Showing ${rows.length} of ${list.length} · ${inr(sumBy(rows.filter((r) => r.status === 'Posted'), (r) => r.amt))} posted`}
                columns={[
                  { key: 'd', label: 'Date', nowrap: true, render: (r) => <><p className="tnum">{r.d}</p><p className="text-[12px] text-ink3 font-mono">{r.id}</p></> },
                  { key: 'head', label: 'Income head', render: (r) => <span className="text-[13.5px]">{r.head}</span> },
                  { key: 'from', label: 'Received from', render: (r) => <span className="font-semibold">{r.from}</span> },
                  { key: 'amt', label: 'Amount', align: 'right', render: (r) => <b className={cx('font-semibold', r.status === 'Cancelled' && 'line-through text-ink3')}>{inr(r.amt)}</b> },
                  { key: 'mode', label: 'Mode', nowrap: true, render: (r) => <ModeCell mode={r.mode} /> },
                  { key: 'ref', label: 'Reference', render: (r) => <Ref v={r.ref} /> },
                  { key: 'status', label: 'Status', render: (r) => <Pill tone={INC_TONE[r.status]}>{r.status}</Pill> },
                  { key: 'by', label: 'Recorded by', nowrap: true, render: (r) => <span className="text-[13px] text-ink2">{r.by}</span> },
                ]}
                mobile={(r) => ({ title: r.from, sub: `${r.d} · ${r.head}`, icon: MODE_ICON[r.mode] || I.Wallet, right: <><p className={cx('font-semibold tnum text-[14.5px]', r.status === 'Cancelled' && 'line-through text-ink3')}>{inr(r.amt)}</p><Pill tone={INC_TONE[r.status]} className="!h-5 !text-[11px]">{r.status}</Pill></> })}
                empty={<Empty icon={I.SearchX} title="No income matches" body="Try other dates, head or status." action={<Button variant="secondary" onClick={() => { setQ(''); setRange(DP.finyear); setHead('all'); setMode('all'); setStatus('all'); }}>Clear filters</Button>} />} />
            </div>
          </Card>
          <Col>
            <Card>
              <CardHead title="By income head" sub="2026–27 so far" icon={I.ChartBar} />
              <div className="px-5 pb-5"><HBars rows={byHead.map((r) => ({ k: r.k, v: r.v, label: inrShort(r.v) }))} max={byHead[0].v} labelWidth={128} /></div>
            </Card>
            {drafts.length > 0 && (
              <Banner tone="warn" title={`${drafts.length} draft not posted.`} action={<Button size="sm" variant="secondary" onClick={() => setOpen(drafts[0])}>Open</Button>}>
                {drafts[0].from}, {inr(drafts[0].amt)}. Drafts are not in the Day Book.
              </Banner>
            )}
            <Card>
              <CardHead title="Good to know" icon={I.Info} />
              <ul className="px-5 pb-4 text-[13.5px] text-ink2 flex flex-col gap-2 list-disc pl-9">
                <li>Fees are not recorded here. They reach the Day Book from Fees by themselves.</li>
                <li>A posted entry cannot be changed. Cancel it with a reason and record it again.</li>
                <li>Donations get an 80G receipt from Document Designs.</li>
              </ul>
            </Card>
          </Col>
        </Split>
      </div>

      <RecordIncomeSheet open={adding} onClose={() => setAdding(false)} next={`INC/26/00${89 + list.length - INCOME0.length}`}
        onAdd={(r) => { setList((l) => [r, ...l]); setStatus('all'); setRange(DP.finyear); }} />

      {open && (
        <Sheet open onClose={() => setOpen(null)} title={`${open.head} · ${inr(open.amt)}`} sub={`${open.id} · ${open.d} 2026, ${open.t}`}
          footer={canEdit && open.status !== 'Cancelled' ? <>
            <Button variant="dangerSoft" onClick={() => { setCancel(open); setOpen(null); }}>Cancel entry</Button>
            {open.status === 'Draft' ? <Button variant="primary" icon={I.Check} onClick={() => post(open)}>Post to Day Book</Button>
              : <Button variant="secondary" icon={I.Printer} onClick={() => toast({ title: `Receipt for ${open.id} printed`, body: open.head.includes('Donation') ? 'With the 80G text from Document Designs' : 'Design from Document Designs' })}>Print receipt</Button>}
          </> : <Button variant="ghost" onClick={() => setOpen(null)}>Close</Button>}>
          <div className="flex items-center gap-2 mb-4"><Pill tone={INC_TONE[open.status]}>{open.status}</Pill>{open.status === 'Posted' && <span className="text-[13px] text-ink3">In the Day Book for {open.d}</span>}</div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-3.5">
            <Mini k="Received from" v={open.from} /><Mini k="Income head" v={`${open.head} · ${HEAD[open.head].code}`} />
            <Mini k="Mode" v={<ModeCell mode={open.mode} />} /><Mini k="Reference" v={<Ref v={open.ref} />} />
            <Mini k="Into" v={ACCT_NAME[open.acct]} /><Mini k="Recorded by" v={open.by} />
          </div>
          {open.note && <p className="mt-4 text-[13.5px] text-ink2 bg-sunken rounded-xl px-3.5 py-2.5">{open.note}</p>}
          {open.cancel && <Banner tone="bad" className="mt-4" title={`Cancelled on ${open.cancel.when} by ${open.cancel.by}.`}>{open.cancel.why}</Banner>}
          {open.status === 'Posted' && <p className="mt-4 text-[12.5px] text-ink3 flex gap-1.5"><I.Lock size={14} className="shrink-0 mt-0.5" />Posted entries cannot be edited. Cancel and record again if something is wrong.</p>}
        </Sheet>
      )}
      <ReasonSheet item={cancel} onClose={() => setCancel(null)} title={cancel ? `Cancel ${cancel.id}?` : ''}
        sub={cancel ? (cancel.status === 'Posted' ? `${inr(cancel.amt)} from ${cancel.from}. The entry is kept, marked Cancelled, and a reversal goes in today’s Day Book.` : `${inr(cancel.amt)} from ${cancel.from}. It was a draft, so the Day Book does not change.`) : ''}
        label="Cancel entry" placeholder="Example: entered twice"
        onDone={(r, why) => { const prev = r.status; upd(r.id, { status: 'Cancelled', cancel: { why, by: ME_ACC, when: '9 Oct' } }); toast({ title: `${r.id} cancelled`, body: prev === 'Posted' ? 'Reversal added to the Day Book for 9 Oct' : 'Draft cancelled', undo: () => upd(r.id, { status: prev, cancel: null }) }); }} />
    </div>
  );
}

// A confirmation that needs a reason (cancel, reject)
function ReasonSheet({ item, onClose, title, sub, label, placeholder, onDone, danger = true }) {
  const [why, setWhy] = useState('');
  const [tried, setTried] = useState(false);
  const close = () => { onClose(); setWhy(''); setTried(false); };
  return (
    <Sheet open={!!item} onClose={close} title={title} sub={sub}
      footer={<><Button variant="ghost" onClick={close}>Keep it</Button><Button variant={danger ? 'danger' : 'primary'} onClick={() => { setTried(true); if (!why.trim()) return; onDone(item, why.trim()); close(); }}>{label}</Button></>}>
      <Field label="Reason" required id="rs-why" error={tried && !why.trim() && 'Say why. It is kept with the record and in the audit log.'}>
        <Textarea id="rs-why" value={why} onChange={setWhy} rows={3} placeholder={placeholder} />
      </Field>
    </Sheet>
  );
}

function RecordIncomeSheet({ open, onClose, onAdd, next }) {
  const toast = useToast();
  const blank = { date: '09-10-2026', head: '', amt: '', from: '', mode: 'Cash', ref: '', acct: 'cash', note: '', post: true };
  const [f, setF] = useState(blank);
  const [tried, setTried] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const a = num(f.amt);
  const err = {
    date: !/^\d{2}-\d{2}-\d{4}$/.test(f.date) ? 'Use DD-MM-YYYY' : /-(0[1-3])-2026$/.test(f.date) ? 'This date is in 2025–26 (April to March). Finance year 2025–26 is closed.' : '',
    head: !f.head ? 'Pick an income head' : '',
    amt: !a ? 'Enter the amount' : a > 1000000 ? 'More than ₹10 lakh needs the Principal. Check the amount.' : '',
    from: !f.from.trim() ? 'Who paid? A name, firm or person' : '',
    ref: f.mode !== 'Cash' && !f.ref.trim() ? `Enter the ${f.mode === 'Cheque' ? 'cheque number and bank' : f.mode === 'UPI' ? 'UTR number' : 'bank reference'}` : '',
  };
  const bad = Object.values(err).some(Boolean);
  const close = () => { onClose(); setF(blank); setTried(false); };
  return (
    <FormSheet open={open} onClose={close} title="Record income" sub="For money other than fees" submitLabel={f.post ? 'Post to Day Book' : 'Save as draft'}
      onSubmit={() => {
        setTried(true);
        if (bad) return false;
        const d = f.date.slice(0, 2).replace(/^0/, '') + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(f.date.slice(3, 5)) - 1];
        onAdd({ id: next, d, t: '10:44 AM', head: f.head, from: f.from.trim(), amt: a, mode: f.mode, ref: f.ref.trim(), acct: f.acct, status: f.post ? 'Posted' : 'Draft', by: ME_ACC, note: f.note.trim() });
        toast({ title: f.post ? `${next} posted · ${inr(a)}` : `${next} saved as draft`, body: f.post ? `In the Day Book for ${d}, in ${ACCT_NAME[f.acct]}. Print the receipt from the entry.` : 'Not in the Day Book until you post it.' });
        setF(blank); setTried(false);
      }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" required id="ri-date" error={tried && err.date}><Input id="ri-date" value={f.date} onChange={(e) => set('date')(e.target.value)} error={tried && err.date} className="tnum" /></Field>
        <Field label="Amount" required id="ri-amt" error={tried && err.amt}><Input id="ri-amt" inputMode="numeric" value={f.amt} onChange={(e) => set('amt')(e.target.value.replace(/[^\d]/g, ''))} error={tried && err.amt} className="tnum" placeholder="₹" /></Field>
      </div>
      <Field label="Income head" required id="ri-head" error={tried && err.head} hint="From the chart of accounts"><Select id="ri-head" value={f.head} onChange={set('head')} error={tried && err.head} options={[{ value: '', label: 'Choose a head' }, ...IN_HEADS.map((h) => ({ value: h, label: `${h} · ${HEAD[h].code}` }))]} /></Field>
      <Field label="Received from" required id="ri-from" error={tried && err.from}><Input id="ri-from" value={f.from} onChange={(e) => set('from')(e.target.value)} error={tried && err.from} placeholder="Example: Annapurna Caterers" list="ri-from-list" /></Field>
      <datalist id="ri-from-list">{['Annapurna Caterers', 'Sai Ram Traders', 'Natya Kala Academy', 'Vijetha Supermarkets', 'Sunrise Alumni Association'].map((x) => <option key={x} value={x} />)}</datalist>
      <Field label="Mode" required>
        <Segmented value={f.mode} onChange={(m) => setF((x) => ({ ...x, mode: m, acct: m === 'Cash' ? 'cash' : x.acct === 'cash' ? 'sbi' : x.acct }))} className="w-full" options={['Cash', 'UPI', 'Bank transfer', 'Cheque']} />
      </Field>
      {f.mode !== 'Cash' && <Field label="Reference" required id="ri-ref" error={tried && err.ref}><Input id="ri-ref" value={f.ref} onChange={(e) => set('ref')(e.target.value)} error={tried && err.ref} placeholder={f.mode === 'Cheque' ? 'Cheque 118204 · Canara Bank' : 'UTR 4283…'} /></Field>}
      <Field label="Into" required id="ri-acct" hint={f.mode === 'Cash' ? 'Cash goes into the office cash box' : 'The main bank account unless you choose another'}>
        <Select id="ri-acct" value={f.acct} onChange={set('acct')} options={(f.mode === 'Cash' ? ['cash'] : ['sbi', 'hdfc']).map((x) => ({ value: x, label: ACCT_NAME[x] }))} />
      </Field>
      <Field label="Note" id="ri-note"><Textarea id="ri-note" value={f.note} onChange={set('note')} rows={2} placeholder="Optional" /></Field>
      <label htmlFor="ri-post" className="flex items-center gap-3 rounded-xl bg-sunken/70 px-3.5 py-3">
        <Switch id="ri-post" on={f.post} label="Post now" onChange={set('post')} />
        <span className="text-[14px]"><b className="font-semibold">Post now</b><span className="block text-[12.5px] text-ink3">{f.post ? 'Goes into the Day Book straight away' : 'Kept as a draft, for example until a cheque clears'}</span></span>
      </label>
    </FormSheet>
  );
}

/* =========================================================================================
   Expenses
   ========================================================================================= */
const CASH_NOW = OPEN9.cash + netOf(ROWS_9, 'cash');
const PAID0 = new Set(EXPENSES0.filter((r) => r.status === 'Paid').map((r) => r.id));
const AMT_ABOVE = [{ value: '0', label: 'Any amount' }, { value: '2000', label: 'Above ₹2,000' }, { value: '10000', label: 'Above ₹10,000' }, { value: '50000', label: 'Above ₹50,000' }];

function ExpensesPage({ params }) {
  const toast = useToast();
  const canEdit = useCanEdit();
  const { role, year } = useRole();
  const [list, setList] = useState(EXPENSES0);
  const [bills, setBills] = useState(BILLS0);
  const [tab, setTab] = useState(params?.tab || 'all');
  const [q, setQ] = useState('');
  const [head, setHead] = useState('all');
  const [status, setStatus] = useState('all');
  const [dept, setDept] = useState('all');
  const [above, setAbove] = useState('0');
  const [range, setRange] = useState(DP.finyear);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState(null);
  const [pay, setPay] = useState(null);
  const [reject, setReject] = useState(null);
  const [cancel, setCancel] = useState(null);
  const [billAdd, setBillAdd] = useState(false);
  const [billPay, setBillPay] = useState(null);
  const upd = (id, x) => { setList((l) => l.map((r) => (r.id === id ? { ...r, ...x } : r))); setOpen((o) => (o && o.id === id ? { ...o, ...x } : o)); };
  const t = q.trim().toLowerCase();
  const rows = list.filter((r) => inRange(r.d, range) && (head === 'all' || r.head === head) && (status === 'all' || r.status === status) && (dept === 'all' || r.dept === dept) && r.amt > Number(above)
    && (!t || r.what.toLowerCase().includes(t) || (r.vendor || '').toLowerCase().includes(t) || r.id.toLowerCase().includes(t)));
  const waiting = list.filter((r) => r.status === 'Waiting');
  const approved = list.filter((r) => r.status === 'Approved');
  const paidOct = list.filter((r) => r.status === 'Paid' && r.paidOn?.endsWith('Oct'));
  const noBill = list.filter((r) => !r.bill && r.amt > BILL_ABOVE && ['Approved', 'Waiting', 'Paid'].includes(r.status));
  const unpaidBills = bills.filter((b) => b.paid < b.amt);
  const me = role.person?.name || 'Lakshmi Rao';
  // Nobody approves their own request. Approving stays with the approvers even where the page is View
  // (the School Admin approves ₹2,001 to ₹10,000), but never in a closed year.
  const mayApprove = (r) => canApprove(role.id, r.amt) && r.by !== me && !year?.closed;
  // The person who keeps the books records, pays and cancels. The Principal's Expenses page is Full only to approve.
  const desk = canEdit && canDoPage(role, 'finance', 'daybook');

  const approve = (r) => {
    const prev = { status: r.status, appr: r.appr };
    upd(r.id, { status: 'Approved', appr: `${me}, 9 Oct` });
    toast({ title: `Approved: ${r.what}`, body: `${inr(r.amt)} · ${r.by} is told. It can now be marked paid.`, undo: () => upd(r.id, prev) });
  };
  const doReject = (r, why) => {
    upd(r.id, { status: 'Draft', rejected: { by: me, when: '9 Oct', why } });
    toast({ title: `Sent back to ${r.by}`, body: 'It is a draft again with your reason. They can change it and send it again, or cancel it.', undo: () => upd(r.id, { status: 'Waiting', rejected: null }) });
  };
  const sendAgain = (r) => {
    const who = approverFor(r.amt);
    upd(r.id, who ? { status: 'Waiting', rejected: null } : { status: 'Approved', rejected: null, appr: 'Approved at once (up to ₹2,000)' });
    toast({ title: who ? `Sent to ${who.split(' (')[0]}` : 'Approved at once', body: who ? `${inr(r.amt)} · ${r.what}` : 'Up to ₹2,000. Mark it paid when the money goes.' });
  };
  const remind = (r) => toast({ title: `Reminder sent to ${approverFor(r.amt).split(' (')[0]}`, body: `${r.what} · ${inr(r.amt)} · waiting since ${r.d}` });

  const ApproveButtons = ({ r, size = 'sm' }) => {
    if (mayApprove(r)) return <div className="flex gap-1.5"><Button size={size} variant="ghost" onClick={(e) => { e.stopPropagation(); setReject(r); }}>Reject</Button><Button size={size} variant="primary" icon={I.Check} onClick={(e) => { e.stopPropagation(); approve(r); }}>Approve</Button></div>;
    if (!desk) return null;
    return <Button size={size} variant="soft" icon={I.BellRing} onClick={(e) => { e.stopPropagation(); remind(r); }}>Remind</Button>;
  };

  return (
    <div>
      <ModuleHead sub="Bills and expenses with a photo of the bill. Bigger amounts wait for approval."
        actions={desk && <><Button variant="secondary" icon={I.FileText} onClick={() => setBillAdd(true)}>Record vendor bill</Button><Button variant="primary" icon={I.Plus} onClick={() => setAdding(true)}>Record expense</Button></>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Stats items={[
          { label: 'Paid this month', value: inr(MONTHLY[6].otherOut + sumBy(paidOct.filter((r) => !PAID0.has(r.id)), (r) => r.amt) - sumBy(list.filter((r) => PAID0.has(r.id) && r.status !== 'Paid' && r.paidOn?.endsWith('Oct')), (r) => r.amt)), sub: 'October so far, in the Day Book', icon: 'ReceiptText' },
          { label: 'Waiting for approval', value: waiting.length, sub: inr(sumBy(waiting, (r) => r.amt)), tone: waiting.length ? 'warn' : 'ok', icon: 'Hourglass', onClick: () => setTab('waiting') },
          { label: 'Approved, not paid', value: approved.length, sub: `${inr(sumBy(approved, (r) => r.amt))} · not in the Day Book yet`, tone: 'info', icon: 'BadgeCheck', onClick: () => { setTab('all'); setStatus('Approved'); } },
          { label: 'Bills missing', value: noBill.length, sub: `Needed above ${inr(BILL_ABOVE)}`, tone: noBill.length ? 'bad' : 'ok', icon: 'FileWarning', onClick: () => noBill[0] && setOpen(noBill[0]) },
        ]} />

        {noBill.length > 0 && (
          <Banner tone="warn" title={`Bill missing: ${noBill[0].what}, ${inr(noBill[0].amt)}.`} action={desk ? <Button size="sm" variant="secondary" icon={I.Camera} onClick={() => setOpen(noBill[0])}>Add bill</Button> : <Button size="sm" variant="secondary" icon={I.BellRing} onClick={() => toast({ title: `${noBill[0].by} is asked for the bill`, body: `${noBill[0].what} · ${inr(noBill[0].amt)}. A photo of the bill is needed before it is paid.` })}>Remind {noBill[0].by.split(' ')[0]}</Button>}>
            Approved by {noBill[0].appr}. It cannot be marked paid until the bill is attached.
          </Banner>
        )}

        <Card className="overflow-hidden">
          <Tabs className="px-3" value={tab} onChange={setTab} tabs={[{ id: 'all', label: 'All expenses', count: list.length }, { id: 'waiting', label: 'Waiting for approval', count: waiting.length }, { id: 'bills', label: 'Vendor bills', count: unpaidBills.length }]} />

          {tab === 'all' && <>
            <Toolbar>
              <SearchBox id="ex-q" value={q} onChange={setQ} placeholder="What, vendor or number" />
              <div className="grid grid-cols-1 gap-2.5 @md:flex">
                <DatePeriod id="ex-range" value={range} onChange={setRange} className="w-full @md:w-auto" />
                <Select id="ex-status" className="@md:w-48" value={status} onChange={setStatus} options={[{ value: 'all', label: 'All statuses' }, 'Draft', { value: 'Waiting', label: 'Waiting for approval' }, 'Approved', 'Paid', 'Cancelled']} />
              </div>
            </Toolbar>
            <div className="px-3 py-3 grid grid-cols-2 gap-2.5 @md:flex border-b border-line">
              <Select id="ex-head" className="@md:w-60" value={head} onChange={setHead} options={[{ value: 'all', label: 'All expense heads' }, ...OUT_HEADS]} />
              <Select id="ex-dept" className="@md:w-48" value={dept} onChange={setDept} options={[{ value: 'all', label: 'All departments' }, ...DEPTS]} />
              <Select id="ex-above" className="@md:w-40 col-span-2 @md:col-span-1" value={above} onChange={setAbove} options={AMT_ABOVE} />
            </div>
            <DataList rows={rows} onRow={setOpen} minWidth={980} footer={`Showing ${rows.length} of ${list.length} · ${inr(sumBy(rows.filter((r) => r.status === 'Paid'), (r) => r.amt))} paid · ${fmtRange(range)}`}
              columns={[
                { key: 'd', label: 'Date', nowrap: true, render: (r) => <><p className="tnum">{r.d}</p><p className="text-[12px] text-ink3 font-mono">{r.id}</p></> },
                { key: 'what', label: 'Expense', render: (r) => <><p className="font-semibold leading-tight">{r.what}</p><p className="text-[12.5px] text-ink3">{r.head} · {r.dept}</p></> },
                { key: 'vendor', label: 'Vendor', render: (r) => <span className="text-[13.5px]">{r.vendor || '—'}</span> },
                { key: 'amt', label: 'Amount', align: 'right', render: (r) => <b className={cx('font-semibold', r.status === 'Cancelled' && 'line-through text-ink3')}>{inr(r.amt)}</b> },
                { key: 'mode', label: 'Mode', nowrap: true, render: (r) => <ModeCell mode={r.mode} /> },
                { key: 'bill', label: 'Bill', render: (r) => (r.bill ? <span className="inline-flex items-center gap-1 text-[13px] text-ok"><I.Paperclip size={14} />Yes</span> : <span className={cx('text-[13px]', r.amt > BILL_ABOVE && r.status !== 'Cancelled' ? 'text-bad font-semibold' : 'text-ink3')}>No</span>) },
                { key: 'status', label: 'Status', render: (r) => <ExpPill s={r.status} /> },
                { key: 'by', label: 'Requested by', nowrap: true, render: (r) => <span className="text-[13px] text-ink2">{r.by}</span> },
              ]}
              mobile={(r) => ({ title: r.what, sub: `${r.d} · ${r.vendor || r.head}`, icon: 'ReceiptText', iconTone: EXP_TONE[r.status], right: <><p className={cx('font-semibold tnum text-[14.5px]', r.status === 'Cancelled' && 'line-through text-ink3')}>{inr(r.amt)}</p><ExpPill s={r.status} small /></> })}
              empty={<Empty icon={I.SearchX} title="No expenses match" body="Try other dates, status, head or amount." action={<Button variant="secondary" onClick={() => { setQ(''); setHead('all'); setStatus('all'); setDept('all'); setAbove('0'); setRange(DP.finyear); }}>Clear filters</Button>} />} />
          </>}

          {tab === 'waiting' && (waiting.length ? (
            <ul className="divide-y divide-line/70">
              {waiting.map((r) => {
                const who = approverFor(r.amt);
                const mine = mayApprove(r);
                return (
                  <li key={r.id} className="px-4 @md:px-5 py-4 flex flex-col @md:flex-row @md:items-center gap-3">
                    <button onClick={() => setOpen(r)} className="min-w-0 flex-1 text-left flex items-start gap-3">
                      <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-warn/12 text-warn"><I.Hourglass size={19} /></span>
                      <span className="min-w-0">
                        <span className="block font-semibold text-[15px] leading-snug">{r.what} · <span className="tnum">{inr(r.amt)}</span></span>
                        <span className="block text-[13px] text-ink3">{r.vendor} · {r.head} · asked by {r.by} on {r.d}</span>
                        <span className="flex gap-1.5 mt-1.5 flex-wrap">
                          <Pill tone={mine ? 'brand' : 'neutral'} className="!h-[22px] !text-[11.5px]">{mine ? 'Waiting for you' : `Waiting for ${who.split(' (')[0]}`}</Pill>
                          {r.bill ? <Pill tone="ok" className="!h-[22px] !text-[11.5px]"><I.Paperclip size={12} />Bill attached</Pill> : <Pill tone="bad" className="!h-[22px] !text-[11.5px]">No bill</Pill>}
                          {r.amt > 10000 && <Pill tone="neutral" className="!h-[22px] !text-[11.5px]">Above ₹10,000: Principal</Pill>}
                        </span>
                      </span>
                    </button>
                    <ApproveButtons r={r} />
                  </li>
                );
              })}
            </ul>
          ) : <Empty icon={I.CircleCheck} title="Nothing waiting for approval" body="Expenses above ₹2,000 come here first. They cannot be paid until approved." />)}

          {tab === 'bills' && (
            <DataList rows={bills} rowKey={(b) => b.no} minWidth={900} footer={`${inr(sumBy(unpaidBills, (b) => b.amt - b.paid))} still to pay on ${unpaidBills.length} bills · bills from Inventory arrive here by themselves`}
              onRow={(b) => (b.paid < b.amt && !b.hold && desk ? setBillPay(b) : toast({ title: `Bill ${b.no}`, body: b.hold ? 'Waiting for approval. It can be paid once approved.' : b.paid >= b.amt ? `Paid in full · ${inr(b.amt)}` : 'View only', tone: 'info' }))}
              columns={[
                { key: 'no', label: 'Bill number', render: (b) => <><p className="font-mono text-[12.5px]">{b.no}</p><p className="text-[12px] text-ink3">{b.d}</p></> },
                { key: 'vendor', label: 'Vendor', render: (b) => <><p className="font-semibold leading-tight">{b.vendor}</p>{b.from && <p className="text-[12px] text-ink3">{b.from}</p>}</> },
                { key: 'amt', label: 'Bill amount', align: 'right', render: (b) => inr(b.amt) },
                { key: 'paid', label: 'Paid', align: 'right', render: (b) => inr(b.paid) },
                { key: 'bal', label: 'To pay', align: 'right', render: (b) => <b className={cx('font-semibold', b.amt - b.paid && 'text-warn')}>{inr(b.amt - b.paid)}</b> },
                { key: 'due', label: 'Due', nowrap: true, render: (b) => <span className={cx('text-[13px]', b.soon && b.paid < b.amt ? 'text-bad font-semibold' : 'text-ink2')}>{b.paid >= b.amt ? '—' : b.due}</span> },
                { key: 'st', label: 'Status', render: (b) => <Pill tone={BILL_TONE[billStatus(b)]}>{billStatus(b)}</Pill> },
              ]}
              mobile={(b) => ({ title: b.vendor, sub: `${b.no} · due ${b.due}`, icon: 'FileText', right: <><p className="font-semibold tnum text-[14.5px]">{inr(b.amt - b.paid)}</p><Pill tone={BILL_TONE[billStatus(b)]} className="!h-5 !text-[11px]">{billStatus(b)}</Pill></> })} />
          )}
        </Card>

        <div className="grid @lg:grid-cols-2 gap-5 @lg:gap-6 items-start">
          <Card>
            <CardHead title="Who approves" sub="From Settings, Forms & Approvals" icon={I.ShieldCheck} />
            <ul className="px-5 pb-4">
              <Line k="Up to ₹2,000" v={<Pill tone="ok">Approved at once</Pill>} />
              <Line k="₹2,001 to ₹10,000" v={<Pill tone="info">Anita Sharma, School Admin</Pill>} />
              <Line k="₹10,001 to ₹1,00,000" v={<Pill tone="info">Lakshmi Rao, Principal</Pill>} />
              <Line k="Above ₹1,00,000" v={<Pill tone="info">Chairman</Pill>} />
            </ul>
            <p className="px-5 pb-4 -mt-1 text-[12.5px] text-ink3">An expense reaches the Day Book only when it is marked Paid, on the date paid.</p>
          </Card>
          <Card>
            <CardHead title="This month by head" sub="Paid in October so far" icon={I.ChartBar} />
            <div className="px-5 pb-5"><HBars rows={Object.entries(paidOct.reduce((a, r) => ({ ...a, [r.head]: (a[r.head] || 0) + r.amt }), {})).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => ({ k, v, label: inrShort(v) }))} max={40000} labelWidth={150} /></div>
          </Card>
        </div>
      </div>

      <RecordExpenseSheet open={adding} onClose={() => setAdding(false)} list={list} next={`EXP/26/0${450 + list.length - EXPENSES0.length}`}
        onAdd={(r) => { setList((l) => [r, ...l]); setTab('all'); setStatus('all'); setRange(DP.finyear); }} />

      {open && (
        <ExpenseSheet r={open} role={role} desk={desk} mine={mayApprove(open)} onClose={() => setOpen(null)}
          onApprove={() => approve(open)} onReject={() => setReject(open)} onRemind={() => remind(open)} onSendAgain={() => sendAgain(open)}
          onPay={() => { if (open.amt > BILL_ABOVE && !open.bill) { toast({ title: 'Attach the bill first', body: `Attach the bill for amounts over ${inr(BILL_ABOVE)}.`, tone: 'bad' }); return; } setPay(open); setOpen(null); }}
          onBill={() => { upd(open.id, { bill: true }); toast({ title: 'Bill attached', body: `Photo of the bill added to ${open.id}`, undo: () => upd(open.id, { bill: false }) }); }}
          onCancel={() => { setCancel(open); setOpen(null); }} />
      )}
      <MarkPaidSheet r={pay} onClose={() => setPay(null)} onDone={(r, x) => { upd(r.id, { status: 'Paid', paidOn: '9 Oct', paidT: '10:45 AM', ...x }); toast({ title: `${r.id} marked paid`, body: `${inr(r.amt)} added to the Day Book for 9 Oct, from ${ACCT_NAME[x.acct]}.`, undo: () => upd(r.id, { status: 'Approved', paidOn: null, mode: null, ref: '', acct: null }) }); }} />
      <ReasonSheet item={reject} onClose={() => setReject(null)} title={reject ? `Send back ${reject.id}?` : ''} sub={reject ? `${reject.what}, ${inr(reject.amt)}. It goes back to ${reject.by} as a draft with your reason.` : ''} label="Send back" placeholder="Example: get two quotes first" onDone={doReject} />
      <ReasonSheet item={cancel} onClose={() => setCancel(null)} title={cancel ? `Cancel ${cancel.id}?` : ''}
        sub={cancel ? (cancel.status === 'Paid' ? `${inr(cancel.amt)} to ${cancel.vendor}. The expense is kept, marked Cancelled, and a reversal goes in today’s Day Book.` : `${inr(cancel.amt)} · ${cancel.what}. Nothing was paid, so the Day Book does not change.`) : ''}
        label="Cancel expense" placeholder="Example: entered twice"
        onDone={(r, why) => { const prev = r.status; upd(r.id, { status: 'Cancelled', cancel: { why, by: ME_ACC, when: '9 Oct' } }); toast({ title: `${r.id} cancelled`, body: prev === 'Paid' ? 'Reversal added to the Day Book for 9 Oct' : 'Kept with your reason', undo: () => upd(r.id, { status: prev, cancel: null }) }); }} />
      <VendorBillSheet open={billAdd} onClose={() => setBillAdd(false)} bills={bills} onAdd={(b) => { setBills((x) => [b, ...x]); setTab('bills'); }} />
      <PayBillSheet b={billPay} onClose={() => setBillPay(null)} onDone={(b, a) => { setBills((x) => x.map((y) => (y.no === b.no ? { ...y, paid: y.paid + a } : y))); toast({ title: `${inr(a)} paid to ${b.vendor}`, body: `Bill ${b.no}. Added to Expenses and the Day Book for 9 Oct.`, undo: () => setBills((x) => x.map((y) => (y.no === b.no ? { ...y, paid: y.paid - a } : y))) }); }} />
    </div>
  );
}

function ExpenseSheet({ r, role, desk, mine, onClose, onApprove, onReject, onRemind, onSendAgain, onPay, onBill, onCancel }) {
  const toast = useToast();
  const who = approverFor(r.amt);
  const steps = [
    { what: <>Asked by <b className="font-semibold">{r.by}</b> · {r.dept}</>, when: `${r.d} 2026, ${r.t}`, icon: 'FilePen', tone: 'neutral' },
    r.rejected && { what: <>Sent back by <b className="font-semibold">{r.rejected.by}</b>: “{r.rejected.why}”</>, when: `${r.rejected.when} 2026`, icon: 'Undo2', tone: 'bad' },
    r.status === 'Waiting' && { what: <>Waiting for <b className="font-semibold">{who}</b></>, when: 'Cannot be paid until approved', icon: 'Hourglass', tone: 'warn' },
    r.appr && ['Approved', 'Paid', 'Cancelled'].includes(r.status) && { what: <>Approved · {r.appr}</>, when: r.status === 'Approved' ? 'Not in the Day Book until paid' : '', icon: 'BadgeCheck', tone: 'brand' },
    r.paidOn && { what: <>Paid by {r.mode}{r.ref ? ` · ${r.ref}` : ''} from {ACCT_NAME[r.acct]}</>, when: `${r.paidOn} 2026 · in the Day Book`, icon: 'CircleCheck', tone: 'ok' },
    r.cancel && { what: <>Cancelled by {r.cancel.by}: “{r.cancel.why}”</>, when: `${r.cancel.when} 2026`, icon: 'CircleX', tone: 'bad' },
  ].filter(Boolean);
  let actions = null;
  if (r.status === 'Waiting' && mine) actions = <><Button variant="ghost" onClick={() => { onReject(); onClose(); }}>Reject</Button><Button variant="primary" icon={I.Check} onClick={() => { onApprove(); onClose(); }}>Approve {inr(r.amt)}</Button></>;
  else if (desk) {
    if (r.status === 'Draft') actions = <><Button variant="dangerSoft" onClick={onCancel}>Cancel</Button><Button variant="primary" icon={I.Send} onClick={() => { onSendAgain(); onClose(); }}>{r.rejected ? 'Change and send again' : 'Send for approval'}</Button></>;
    if (r.status === 'Waiting') actions = mine ? <><Button variant="ghost" onClick={() => { onReject(); onClose(); }}>Reject</Button><Button variant="primary" icon={I.Check} onClick={() => { onApprove(); onClose(); }}>Approve {inr(r.amt)}</Button></> : <><Button variant="dangerSoft" onClick={onCancel}>Cancel</Button><Button variant="secondary" icon={I.BellRing} onClick={onRemind}>Remind {who.split(' (')[0]}</Button></>;
    if (r.status === 'Approved') actions = <>{!r.bill && <Button variant="secondary" icon={I.Camera} onClick={onBill}>Add bill</Button>}<Button variant="primary" icon={I.IndianRupee} onClick={() => { onPay(); }}>Mark paid</Button></>;
    if (r.status === 'Paid') actions = <Button variant="dangerSoft" onClick={onCancel}>Cancel payment</Button>;
  }
  return (
    <Sheet open onClose={onClose} title={r.what} sub={`${r.id} · ${inr(r.amt)}`} footer={actions || <Button variant="ghost" onClick={onClose}>Close</Button>}>
      <div className="flex items-center gap-2 mb-4 flex-wrap"><ExpPill s={r.status} />{r.status === 'Approved' && <span className="text-[13px] text-ink3">Approved, not paid · not in the Day Book</span>}{r.due && r.status === 'Approved' && <Pill tone="bad">Due {r.due}</Pill>}</div>
      {r.rejected && r.status === 'Draft' && <Banner tone="bad" className="mb-4" title={`Sent back by ${r.rejected.by}:`}>{r.rejected.why}</Banner>}
      {r.status === 'Waiting' && !mine && <Banner tone="warn" className="mb-4" title={`Above ${r.amt > 10000 ? '₹10,000' : '₹2,000'}: waiting for ${who.split(' (')[0]}.`}>It cannot be marked paid until approved.</Banner>}
      <div className="grid grid-cols-2 gap-x-5 gap-y-3.5">
        <Mini k="Expense head" v={`${r.head} · ${HEAD[r.head]?.code || ''}`} /><Mini k="Vendor" v={r.vendor || '—'} />
        <Mini k="Department" v={r.dept} /><Mini k="Requested by" v={r.by} />
        <Mini k="Bill" v={r.bill ? <button onClick={() => toast({ title: `Bill for ${r.id}`, body: 'Opens the photo of the bill', tone: 'info' })} className="text-brand font-semibold hover:underline inline-flex items-center gap-1"><I.Paperclip size={14} />View bill</button> : <span className={r.amt > BILL_ABOVE ? 'text-bad font-semibold' : 'text-ink3'}>Not attached{r.amt > BILL_ABOVE ? ' · needed' : ''}</span>} />
        <Mini k="Amount" v={<b className="font-semibold">{inr(r.amt)}</b>} />
      </div>
      <div className="mt-5"><Timeline items={steps} /></div>
    </Sheet>
  );
}

function MarkPaidSheet({ r, onClose, onDone }) {
  const [mode, setMode] = useState('Bank transfer');
  const [ref, setRef] = useState('');
  const [acct, setAcct] = useState('sbi');
  const [date, setDate] = useState('09-10-2026');
  const [tried, setTried] = useState(false);
  if (!r) return null;
  const err = {
    ref: mode !== 'Cash' && !/^[A-Za-z0-9 -]{6,30}$/.test(ref.trim()) ? (ref.trim() ? 'This does not look like a bank reference. Use 6 to 30 letters or digits.' : 'Enter the UTR, cheque or bank reference') : '',
    cash: mode === 'Cash' && r.amt > CASH_NOW ? `Cash in hand is ${inr(CASH_NOW)}. This payment is ${inr(r.amt)}. Pay from the bank, or record the cash received first.` : '',
    date: !/^\d{2}-\d{2}-\d{4}$/.test(date) ? 'Use DD-MM-YYYY' : '',
  };
  return (
    <FormSheet open onClose={() => { onClose(); setTried(false); setRef(''); }} title={`Mark ${r.id} paid`} sub={`${r.what} · ${inr(r.amt)} to ${r.vendor}. It goes into the Day Book on the date paid.`} submitLabel={`Mark ${inr(r.amt)} paid`}
      onSubmit={() => { setTried(true); if (err.ref || err.cash || err.date) return false; onDone(r, { mode, ref: mode === 'Cash' ? '' : ref.trim(), acct: mode === 'Cash' ? 'cash' : acct }); setRef(''); setTried(false); }}>
      <Field label="Mode" required><Segmented value={mode} onChange={setMode} className="w-full" options={['Cash', 'UPI', 'Bank transfer', 'Cheque']} /></Field>
      {mode !== 'Cash' && <Field label="Reference" required id="mp-ref" error={tried && err.ref}><Input id="mp-ref" value={ref} onChange={(e) => setRef(e.target.value)} error={tried && err.ref} placeholder="UTR SBIN2262…" /></Field>}
      {mode !== 'Cash' && <Field label="Paid from" required id="mp-acct"><Select id="mp-acct" value={acct} onChange={setAcct} options={['sbi', 'hdfc'].map((x) => ({ value: x, label: ACCT_NAME[x] }))} /></Field>}
      {mode === 'Cash' && (err.cash ? <Banner tone="bad">{err.cash}</Banner> : <p className="text-[13px] text-ink3">From the office cash box. Cash in hand now: {inr(CASH_NOW)}.</p>)}
      <Field label="Date paid" required id="mp-date" error={tried && err.date}><Input id="mp-date" value={date} onChange={(e) => setDate(e.target.value)} error={tried && err.date} className="tnum" /></Field>
    </FormSheet>
  );
}

function RecordExpenseSheet({ open, onClose, onAdd, list, next }) {
  const toast = useToast();
  const blank = { bill: false, amt: '', head: 'Stationery and printing', date: '09-10-2026', vendor: '', what: '', paid: true, mode: 'Cash', ref: '', acct: 'cash', dept: 'Administration', note: '' };
  const [f, setF] = useState(blank);
  const [tried, setTried] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const a = num(f.amt);
  const who = approverFor(a);
  const canPayNow = a > 0 && !who;
  const payNow = f.paid && canPayNow;
  const split = f.vendor && a > 0 && a <= AUTO_OK && list.some((r) => r.vendor === f.vendor && r.d === '9 Oct' && r.amt <= AUTO_OK && r.status !== 'Cancelled');
  const err = {
    amt: !a ? 'Enter the amount' : '',
    what: !f.what.trim() ? 'Say what it was for, in a few words' : '',
    bill: a > BILL_ABOVE && !f.bill ? `Attach the bill for amounts over ${inr(BILL_ABOVE)}` : '',
    ref: payNow && f.mode !== 'Cash' && !f.ref.trim() ? 'Enter the UTR or cheque number' : '',
    cash: payNow && f.mode === 'Cash' && a > CASH_NOW ? `Cash in hand is ${inr(CASH_NOW)}. This payment is ${inr(a)}.` : '',
    date: !/^\d{2}-\d{2}-\d{4}$/.test(f.date) ? 'Use DD-MM-YYYY' : /-(0[1-3])-2026$/.test(f.date) ? 'This date is in 2025–26 (April to March). That year is closed.' : '',
  };
  const bad = Object.values(err).some(Boolean);
  const close = () => { onClose(); setF(blank); setTried(false); };
  const label = !a ? 'Save expense' : who ? `Send to ${who.split(' (')[0]}` : payNow ? 'Save and mark paid' : 'Save expense';
  return (
    <FormSheet open={open} onClose={close} title="Record expense" sub="Photo of the bill, amount, head. Takes under a minute." submitLabel={label}
      onSubmit={() => {
        setTried(true);
        if (bad) return false;
        const base = { id: next, d: '9 Oct', t: '10:46 AM', head: f.head, vendor: f.vendor.trim() || '', what: f.what.trim(), amt: a, bill: f.bill, by: ME_ACC, dept: f.dept, note: f.note };
        if (who) { onAdd({ ...base, status: 'Waiting' }); toast({ title: `${next} sent to ${who.split(' (')[0]}`, body: `${inr(a)} is above ${a > 10000 ? '₹10,000' : '₹2,000'}. You can mark it paid once it is approved.` }); }
        else if (payNow) { onAdd({ ...base, status: 'Paid', paidOn: '9 Oct', mode: f.mode, ref: f.ref.trim(), acct: f.mode === 'Cash' ? 'cash' : f.acct, appr: 'Approved at once (up to ₹2,000)' }); toast({ title: `${next} paid · ${inr(a)}`, body: `Approved at once and added to the Day Book for 9 Oct${split ? '. Flagged to the Principal: same vendor twice today under the limit.' : ''}` }); }
        else { onAdd({ ...base, status: 'Approved', appr: 'Approved at once (up to ₹2,000)' }); toast({ title: `${next} saved · approved at once`, body: 'Not in the Day Book until you mark it paid.' }); }
        setF(blank); setTried(false);
      }}>
      <Field label="Bill photo or file" required={a > BILL_ABOVE} error={tried && err.bill} hint={!(tried && err.bill) ? `Needed above ${inr(BILL_ABOVE)}` : undefined}>
        {f.bill ? (
          <div className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
            <span className="w-10 h-10 rounded-lg bg-ok/10 text-ok grid place-items-center"><I.FileImage size={19} /></span>
            <span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold truncate">bill-photo-0946.jpg</span><span className="block text-[12px] text-ink3">1.2 MB · just now</span></span>
            <Button type="button" size="sm" variant="ghost" onClick={() => set('bill')(false)}>Remove</Button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" icon={I.Camera} onClick={() => set('bill')(true)}>Take photo</Button>
            <Button type="button" variant="secondary" icon={I.Upload} onClick={() => set('bill')(true)}>Choose file</Button>
          </div>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount" required id="re-amt" error={tried && err.amt} hint={a ? (who ? `Goes to ${who.split(' (')[0]}` : 'Approved at once') : undefined}><Input id="re-amt" inputMode="numeric" value={f.amt} onChange={(e) => set('amt')(e.target.value.replace(/[^\d]/g, ''))} error={tried && err.amt} className="tnum" placeholder="₹" /></Field>
        <Field label="Date" required id="re-date" error={tried && err.date}><Input id="re-date" value={f.date} onChange={(e) => set('date')(e.target.value)} error={tried && err.date} className="tnum" /></Field>
      </div>
      <Field label="What was it for" required id="re-what" error={tried && err.what}><Input id="re-what" value={f.what} onChange={(e) => set('what')(e.target.value)} error={tried && err.what} placeholder="Example: Chalk and dusters for Block B" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Expense head" required id="re-head" hint="The one you used last"><Select id="re-head" value={f.head} onChange={set('head')} options={OUT_HEADS} /></Field>
        <Field label="Department" id="re-dept" hint="Cost centre"><Select id="re-dept" value={f.dept} onChange={set('dept')} options={DEPTS} /></Field>
      </div>
      <Field label="Vendor" id="re-vendor" hint="Pick one, or type a new name to add it"><Input id="re-vendor" value={f.vendor} onChange={(e) => set('vendor')(e.target.value)} placeholder="Example: Sri Sai Stationers" list="re-vendors" /></Field>
      <datalist id="re-vendors">{VENDORS.map((v) => <option key={v} value={v} />)}</datalist>
      {split && <Banner tone="warn" title="Looks like one bill split in two.">{f.vendor} already has an expense under ₹2,000 today. Splitting a bill to stay under the limit is flagged to the Principal.</Banner>}
      {who ? (
        <Banner tone="info" title={`Above ${a > 10000 ? '₹10,000' : '₹2,000'}: it waits for ${who.split(' (')[0]}.`}>It cannot be marked paid until approved. You will be told on your phone.</Banner>
      ) : (
        <>
          <label htmlFor="re-paid" className="flex items-center gap-3 rounded-xl bg-sunken/70 px-3.5 py-3">
            <Switch id="re-paid" on={f.paid} label="Paid now" onChange={set('paid')} />
            <span className="text-[14px]"><b className="font-semibold">Paid now</b><span className="block text-[12.5px] text-ink3">{f.paid ? 'Goes into today’s Day Book' : 'Saved as approved; mark it paid later'}</span></span>
          </label>
          {f.paid && <>
            <Field label="Mode" required><Segmented value={f.mode} onChange={(m) => setF((x) => ({ ...x, mode: m, acct: m === 'Cash' ? 'cash' : 'sbi' }))} className="w-full" options={['Cash', 'UPI', 'Bank transfer', 'Cheque']} /></Field>
            {f.mode !== 'Cash' && <Field label="Reference" required id="re-ref" error={tried && err.ref}><Input id="re-ref" value={f.ref} onChange={(e) => set('ref')(e.target.value)} error={tried && err.ref} placeholder="UTR 4283…" /></Field>}
            {f.mode === 'Cash' ? (err.cash ? <Banner tone="bad" title={err.cash}>Use the bank, or record the cash received first.</Banner> : <p className="text-[13px] text-ink3 -mt-1">From the office cash box · {inr(CASH_NOW)} in hand now</p>)
              : <Field label="Paid from" required id="re-acct"><Select id="re-acct" value={f.acct} onChange={set('acct')} options={['sbi', 'hdfc'].map((x) => ({ value: x, label: ACCT_NAME[x] }))} /></Field>}
          </>}
        </>
      )}
      <Field label="Note" id="re-note"><Textarea id="re-note" value={f.note} onChange={set('note')} rows={2} placeholder="Optional" /></Field>
    </FormSheet>
  );
}

function VendorBillSheet({ open, onClose, bills, onAdd }) {
  const toast = useToast();
  const blank = { vendor: 'Sri Sai Stationers', no: '', d: '09-10-2026', amt: '', due: '08-11-2026', why: '' };
  const [f, setF] = useState(blank);
  const [tried, setTried] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const a = num(f.amt);
  const dup = bills.find((b) => b.vendor === f.vendor && ((f.no.trim() && b.no.toLowerCase() === f.no.trim().toLowerCase()) || (a && b.amt === a && b.d === f.d)));
  const err = { no: !f.no.trim() ? 'Enter the bill number printed on the bill' : '', amt: !a ? 'Enter the bill amount' : '', why: dup && !f.why.trim() ? 'This looks like a duplicate. Say why you are saving it again.' : '' };
  const close = () => { onClose(); setF(blank); setTried(false); };
  return (
    <FormSheet open={open} onClose={close} title="Record vendor bill" sub="Pay it later, in part or in full. Try bill number SSS/1203 to see the duplicate check." submitLabel={dup ? 'Save anyway' : 'Save bill'}
      onSubmit={() => { setTried(true); if (err.no || err.amt || err.why) return false; onAdd({ no: f.no.trim(), vendor: f.vendor, d: f.d, amt: a, paid: 0, due: f.due }); toast({ title: `Bill ${f.no.trim()} saved`, body: `${inr(a)} from ${f.vendor}${dup ? ' · saved with your reason' : ''}. Due ${f.due}.` }); setF(blank); setTried(false); }}>
      <Field label="Vendor" required id="vb-v"><Select id="vb-v" value={f.vendor} onChange={set('vendor')} options={VENDORS} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Bill number" required id="vb-no" error={tried && err.no}><Input id="vb-no" value={f.no} onChange={(e) => set('no')(e.target.value)} error={tried && err.no} placeholder="SSS/1210" /></Field>
        <Field label="Bill date" required id="vb-d"><Input id="vb-d" value={f.d} onChange={(e) => set('d')(e.target.value)} className="tnum" /></Field>
        <Field label="Amount" required id="vb-amt" error={tried && err.amt}><Input id="vb-amt" inputMode="numeric" value={f.amt} onChange={(e) => set('amt')(e.target.value.replace(/[^\d]/g, ''))} error={tried && err.amt} className="tnum" placeholder="₹" /></Field>
        <Field label="Due date" required id="vb-due"><Input id="vb-due" value={f.due} onChange={(e) => set('due')(e.target.value)} className="tnum" /></Field>
      </div>
      {dup && <>
        <Banner tone="warn" title={`Bill ${dup.no} from ${dup.vendor} is already recorded on ${dup.d}.`} action={<Button type="button" size="sm" variant="secondary" onClick={() => toast({ title: `Bill ${dup.no}`, body: `${inr(dup.amt)} · ${billStatus(dup)} · due ${dup.due}`, tone: 'info' })}>Open it</Button>}>Same {f.no.trim() && dup.no.toLowerCase() === f.no.trim().toLowerCase() ? 'bill number' : 'amount and date'}.</Banner>
        <Field label="Why save it again?" required id="vb-why" error={tried && err.why}><Textarea id="vb-why" value={f.why} onChange={set('why')} rows={2} placeholder="Example: a second bill with the same number, confirmed with the vendor" /></Field>
      </>}
      <Field label="Bill photo" hint="Optional here; needed before paying above ₹2,000"><Button type="button" variant="secondary" icon={I.Paperclip} className="self-start" onClick={() => toast({ title: 'Choose a file or take a photo', tone: 'info' })}>Attach</Button></Field>
    </FormSheet>
  );
}

function PayBillSheet({ b, onClose, onDone }) {
  const [amt, setAmt] = useState('');
  const [mode, setMode] = useState('Bank transfer');
  const [ref, setRef] = useState('');
  const [tried, setTried] = useState(false);
  if (!b) return null;
  const bal = b.amt - b.paid;
  const a = amt === '' ? bal : num(amt);
  const err = { amt: !a ? 'Enter the amount' : a > bal ? `Not more than ${inr(bal)} is left to pay` : '', ref: mode !== 'Cash' && !ref.trim() ? 'Enter the UTR or cheque number' : '' };
  return (
    <FormSheet open onClose={() => { onClose(); setAmt(''); setRef(''); setTried(false); }} title={`Pay bill ${b.no}`} sub={`${b.vendor} · ${inr(bal)} to pay of ${inr(b.amt)}`} submitLabel={`Pay ${inr(a || 0)}`}
      onSubmit={() => { setTried(true); if (err.amt || err.ref) return false; onDone(b, a); setAmt(''); setRef(''); setTried(false); }}>
      <Field label="Amount" required id="pb-amt" error={tried && err.amt} hint={!(tried && err.amt) ? 'Pay part now and the rest later, if you like' : undefined}><Input id="pb-amt" inputMode="numeric" value={amt === '' ? String(bal) : amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d]/g, ''))} error={tried && err.amt} className="tnum" /></Field>
      <Field label="Mode" required><Segmented value={mode} onChange={setMode} className="w-full" options={['Cash', 'UPI', 'Bank transfer', 'Cheque']} /></Field>
      {mode !== 'Cash' && <Field label="Reference" required id="pb-ref" error={tried && err.ref}><Input id="pb-ref" value={ref} onChange={(e) => setRef(e.target.value)} error={tried && err.ref} placeholder="UTR SBIN2262…" /></Field>}
    </FormSheet>
  );
}

/* =========================================================================================
   Cash & Bank
   ========================================================================================= */
function CashBankPage() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const [accts, setAccts] = useState(ACCTS0);
  const [book, setBook] = useState('cash');
  const [per, setPer] = useState(DP.today);
  const [extra, setExtra] = useState([]); // money moved today
  const [move, setMove] = useState(false);
  const [addAcct, setAddAcct] = useState(false);
  const [opening, setOpening] = useState(false);
  const [exp, setExp] = useState(false);
  // The days in the chosen dates, oldest first; the opening balance is the first day's
  const keys = Object.keys(BOOK_DAYS).filter((k) => k >= per.from && k <= per.to).sort();
  const many = keys.length > 1;
  const B = keys.length === 1 && per.from === per.to ? BOOK_DAYS[keys[0]]
    : { open: keys.length ? BOOK_DAYS[keys[0]].open : per.from > '2026-10-09' ? OPEN9 : OPEN8, label: fmtRange(per), next: null };
  const rowsFor = (a) => keys.flatMap((k) => sortT([...BOOK_DAYS[k].rows, ...(k === '2026-10-09' ? extra : [])].filter((r) => r.acct === a)).map((r) => (many ? { ...r, t: `${fmtDay(k).replace(' 2026', '')}, ${r.t}` } : r)));
  const openOf = (a) => (B.open[a] ?? accts.find((x) => x.id === a)?.open ?? 0);
  const closeOf = (a) => openOf(a) + sumBy(rowsFor(a), (r) => r.inn - r.out);
  const nowOf = (a) => (OPEN9[a] ?? accts.find((x) => x.id === a)?.open ?? 0) + sumBy([...ROWS_9, ...extra].filter((r) => r.acct === a), (r) => r.inn - r.out);
  const rows = rowsFor(book);
  let run = openOf(book);
  const withBal = rows.map((r, i) => { run += r.inn - r.out; return { ...r, id: `${book}-${i}`, bal: run }; });
  const rec = sumBy(rows, (r) => r.inn), pay = sumBy(rows, (r) => r.out);
  const deposited = extra.some((r) => r.acct === 'cash' && r.out);
  const way = sumBy(ON_THE_WAY, (e) => e.total);
  const acctName = (a) => accts.find((x) => x.id === a)?.name || a;

  return (
    <div>
      <ModuleHead sub="Cash book and bank book, with opening and closing balance · financial year 2026–27"
        actions={canEdit && <><Button variant="secondary" icon={I.Plus} onClick={() => setAddAcct(true)}>Add bank account</Button><Button variant="primary" icon={I.ArrowRightLeft} onClick={() => setMove(true)}>Move money</Button></>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Stats items={[
          ...accts.map((a) => ({ label: a.name, value: inr(nowOf(a.id)), sub: a.id === 'cash' ? 'Office cash box' : a.sub.replace(' · XXXX XXXX ', ' ••'), icon: a.icon, onClick: () => setBook(a.id), tone: book === a.id ? 'brand' : undefined })),
          { label: 'On the way', value: inr(way), sub: `${ON_THE_WAY.length} online and card payments · tomorrow`, icon: 'Hourglass', tone: 'info' },
        ].slice(0, 6)} />

        {!deposited && canEdit && (
          <Banner tone="info" title={`Bank deposit at 11:00: cash ${inr(38400)} from Thu 8 Oct.`} action={<Button size="sm" variant="secondary" icon={I.ArrowRightLeft} onClick={() => setMove(true)}>Record deposit</Button>}>
            When the money is in the bank, record it here so both books stay right.
          </Banner>
        )}

        <Split>
          <Card className="overflow-hidden">
            <CardHead title={book === 'cash' ? 'Cash book' : `Bank book · ${acctName(book)}`} sub={B.label} icon={book === 'cash' ? I.Banknote : I.Landmark}
              action={<div className="flex gap-1.5"><Button size="sm" variant="secondary" icon={I.Download} onClick={() => setExp(true)}>Export</Button><Button size="sm" variant="ghost" icon={I.Printer} className="hidden @sm:inline-flex" onClick={() => toast({ title: 'Sent to the office printer', body: `${book === 'cash' ? 'Cash book' : 'Bank book'} for ${B.label}` })}>Print</Button></div>} />
            <div className="px-3 pb-3 flex flex-col @md:flex-row gap-2.5">
              <div className="overflow-x-auto no-scrollbar"><Segmented size="sm" className="w-max" value={book} onChange={setBook} options={accts.map((a) => ({ value: a.id, label: a.id === 'cash' ? 'Cash book' : a.name }))} /></div>
              <DatePeriod id="cb-day" value={per} onChange={setPer} className="w-full @md:w-auto @md:ml-auto" />
            </div>
            <div className="grid grid-cols-2 @xl:grid-cols-4 gap-px bg-line/70 border-y border-line/70">
              {[['Opening balance', inr(openOf(book)), ''], ['Receipts', inr(rec), 'text-ok'], ['Payments', inr(pay), 'text-bad'], ['Closing balance', inr(closeOf(book)), 'text-brand']].map(([k, v, c]) => (
                <div key={k} className="bg-surface px-4 @md:px-5 py-3"><p className="text-[12px] text-ink3 font-semibold">{k}</p><p className={cx('font-display font-semibold text-[19px] tnum', c)}>{v}</p></div>
              ))}
            </div>
            <DataList rows={withBal} minWidth={760} footer={B.next ? `Closing ${inr(closeOf(book))} is the opening balance of ${B.next}` : per.to >= '2026-10-09' ? `${rows.length} entries · ${fmtRange(per)} · closing is live` : `${rows.length} entries · ${fmtRange(per)}`}
              columns={[
                { key: 't', label: 'Time', nowrap: true, render: (r) => <span className="tnum text-ink2">{r.t}</span> },
                { key: 'what', label: 'Details', render: (r) => <><p className="text-[13.5px] leading-snug">{r.what}</p><p className="text-[12px] text-ink3">{r.src}</p></> },
                { key: 'ref', label: 'Reference', render: (r) => <Ref v={r.ref} /> },
                { key: 'inn', label: 'Receipts', align: 'right', render: (r) => (r.inn ? <span className="text-ok font-semibold">{inr(r.inn)}</span> : '') },
                { key: 'out', label: 'Payments', align: 'right', render: (r) => (r.out ? <span className="text-bad font-semibold">{inr(r.out)}</span> : '') },
                { key: 'bal', label: 'Balance', align: 'right', render: (r) => <b className="font-semibold">{inr(r.bal)}</b> },
              ]}
              mobile={(r) => ({ title: r.what, sub: `${r.t} · ${r.src}`, icon: r.inn ? 'ArrowDownToLine' : 'ArrowUpFromLine', iconTone: r.inn ? 'ok' : 'bad', right: <><p className={cx('font-semibold tnum text-[14.5px]', r.inn ? 'text-ok' : 'text-bad')}>{r.inn ? '+' : '−'}{inr(r.inn || r.out)}</p><p className="text-[12px] text-ink3 tnum">{inr(r.bal)}</p></> })}
              empty={<Empty icon={I.Inbox} title={per.from === per.to ? 'No entries in this book on this day' : 'No entries in this book in these dates'} body={`Opening and closing are both ${inr(openOf(book))}.`} />} />
          </Card>
          <Col>
            <Card>
              <CardHead title="Money on the way" sub="Counted in the Day Book, not yet in the bank" icon={I.Hourglass} />
              <ul className="px-5 pb-4">
                <Line k={`Online (Razorpay) · ${ON_THE_WAY.filter((e) => e.mode === 'Online').length} payments`} v={inr(sumBy(ON_THE_WAY.filter((e) => e.mode === 'Online'), (e) => e.total))} />
                <Line k={`Card · ${ON_THE_WAY.filter((e) => e.mode === 'Card').length} payments`} v={inr(sumBy(ON_THE_WAY.filter((e) => e.mode === 'Card'), (e) => e.total))} />
                <Line k={`Waiting for verification · ${WAITING_9.length}`} v={inr(sumBy(WAITING_9, (e) => e.total))} tone="warn" />
              </ul>
              <p className="px-5 pb-4 -mt-1 text-[12.5px] text-ink3">Razorpay settles into the School and Trust accounts the next working day, less its charges. Each settlement is matched to its payments by itself.</p>
            </Card>
            <Card>
              <CardHead title="Opening balances" sub="Set once at go-live, Wed 1 Apr 2026" icon={I.Flag} action={canEdit && <Button size="sm" variant="ghost" onClick={() => setOpening(true)}>Change</Button>} />
              <ul className="px-5 pb-3">{accts.map((a) => <Line key={a.id} k={a.name} v={inr(a.open)} />)}</ul>
              <p className="px-5 pb-4 text-[12.5px] text-ink3 flex gap-1.5"><I.ShieldCheck size={14} className="shrink-0 mt-0.5" />Approved by Lakshmi Rao on 1 Apr 2026. A change now needs her approval again.</p>
            </Card>
            <Card>
              <CardHead title="Financial year" icon={I.CalendarRange} />
              <ul className="px-5 pb-4">
                <Line k="2026–27" v={<Pill tone="ok">Open · 1 Apr 2026 to 31 Mar 2027</Pill>} />
                <Line k="2025–26" v={<Pill tone="neutral">Closed 30 Apr 2026</Pill>} />
              </ul>
              <p className="px-5 pb-4 -mt-1 text-[12.5px] text-ink3">The opening balance of a new year is the closing balance of the last one, carried over by itself.</p>
            </Card>
          </Col>
        </Split>
      </div>

      <MoveMoneySheet open={move} onClose={() => setMove(false)} accts={accts} balance={nowOf} defAmt={38400}
        onDone={(x) => {
          const id = Date.now();
          const rowsX = [{ acct: x.from, t: 'Just now', what: `Moved to ${acctName(x.to)}`, ref: x.ref || 'Contra', inn: 0, out: x.amt, src: 'Move money', id }, { acct: x.to, t: 'Just now', what: `Moved from ${acctName(x.from)}`, ref: x.ref || 'Contra', inn: x.amt, out: 0, src: 'Move money', id }];
          setExtra((e) => [...e, ...rowsX]); setPer(DP.today); setBook(x.from);
          toast({ title: `${inr(x.amt)} moved to ${acctName(x.to)}`, body: `${x.from === 'cash' ? 'Cash book' : 'Bank book'} and bank book both updated for 9 Oct.`, undo: () => setExtra((e) => e.filter((r) => r.id !== id)) });
        }} />
      <AddAccountSheet open={addAcct} onClose={() => setAddAcct(false)} onAdd={(a) => setAccts((x) => [...x, a])} />
      <OpeningSheet open={opening} onClose={() => setOpening(false)} accts={accts} />
      <ExportSheet open={exp} onClose={() => setExp(false)} title={`${book === 'cash' ? 'Cash book' : `Bank book, ${acctName(book)}`} · ${B.label}`} lines={[['Opening balance', inr(openOf(book))], ['Receipts', inr(rec)], ['Payments', inr(pay)], ['Closing balance', inr(closeOf(book))]]} />
    </div>
  );
}

function MoveMoneySheet({ open, onClose, accts, balance, defAmt, onDone }) {
  const [f, setF] = useState({ from: 'cash', to: 'sbi', amt: String(defAmt), date: '09-10-2026', ref: '' });
  const [tried, setTried] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const a = num(f.amt);
  const have = balance(f.from);
  const name = (id) => accts.find((x) => x.id === id)?.name;
  const err = { to: f.from === f.to ? 'Choose a different account to move the money into' : '', amt: !a ? 'Enter the amount' : a > have ? `${name(f.from)} has ${inr(have)}. You cannot move more than that.` : '' };
  const close = () => { onClose(); setTried(false); setF({ from: 'cash', to: 'sbi', amt: String(defAmt), date: '09-10-2026', ref: '' }); };
  return (
    <FormSheet open={open} onClose={close} title="Move money" sub="Between cash and bank, for example a cash deposit. Not income or expense." submitLabel={a ? `Move ${inr(a)}` : 'Move money'}
      onSubmit={() => { setTried(true); if (err.to || err.amt) return false; onDone({ ...f, amt: a }); }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From" required id="mm-from"><Select id="mm-from" value={f.from} onChange={set('from')} options={accts.map((x) => ({ value: x.id, label: x.name }))} /></Field>
        <Field label="To" required id="mm-to" error={tried && err.to}><Select id="mm-to" value={f.to} onChange={set('to')} error={tried && err.to} options={accts.map((x) => ({ value: x.id, label: x.name }))} /></Field>
      </div>
      <Field label="Amount" required id="mm-amt" error={tried && err.amt} hint={!(tried && err.amt) ? `${name(f.from)} has ${inr(have)} now${f.from === 'cash' ? ` · Thu 8 Oct closed with ${inr(38400)}` : ''}` : undefined}>
        <Input id="mm-amt" inputMode="numeric" value={f.amt} onChange={(e) => set('amt')(e.target.value.replace(/[^\d]/g, ''))} error={tried && err.amt} className="tnum" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" required id="mm-date"><Input id="mm-date" value={f.date} onChange={(e) => set('date')(e.target.value)} className="tnum" /></Field>
        <Field label="Reference" id="mm-ref" hint="Deposit slip number"><Input id="mm-ref" value={f.ref} onChange={(e) => set('ref')(e.target.value)} placeholder="Slip 220871" /></Field>
      </div>
    </FormSheet>
  );
}

function AddAccountSheet({ open, onClose, onAdd }) {
  const toast = useToast();
  const blank = { name: '', bank: '', no: '', ifsc: '', open: '', date: '09-10-2026' };
  const [f, setF] = useState(blank);
  const [tried, setTried] = useState(false);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const digits = f.no.replace(/\D/g, '');
  const err = {
    name: !f.name.trim() ? 'Give the account a short name, like “Building fund”' : '',
    bank: !f.bank.trim() ? 'Bank and branch' : '',
    no: digits.length < 9 || digits.length > 18 ? 'Account numbers have 9 to 18 digits' : '',
    ifsc: !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(f.ifsc.trim().toUpperCase()) ? 'IFSC has 11 characters, like SBIN0011453' : '',
    open: f.open === '' ? 'Enter the balance on the opening date (0 if new)' : '',
  };
  const close = () => { onClose(); setF(blank); setTried(false); };
  return (
    <FormSheet open={open} onClose={close} title="Add bank account" sub="Used in the bank book, on expenses and in Fee Settings" submitLabel="Add account"
      onSubmit={() => {
        setTried(true); if (Object.values(err).some(Boolean)) return false;
        onAdd({ id: 'b' + Date.now(), name: f.name.trim(), sub: `${f.bank.trim()} · XXXX XXXX ${digits.slice(-4)}`, icon: 'Landmark', open: num(f.open) });
        toast({ title: `${f.name.trim()} added`, body: num(f.open) ? `Opening balance ${inr(num(f.open))} sent to Lakshmi Rao for approval.` : 'Shows in the bank book from today.' });
      }}>
      <Field label="Account name" required id="aa-name" error={tried && err.name}><Input id="aa-name" value={f.name} onChange={(e) => set('name')(e.target.value)} error={tried && err.name} placeholder="Building fund" /></Field>
      <Field label="Bank and branch" required id="aa-bank" error={tried && err.bank}><Input id="aa-bank" value={f.bank} onChange={(e) => set('bank')(e.target.value)} error={tried && err.bank} placeholder="Canara Bank, Kukatpally" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Account number" required id="aa-no" error={tried && err.no} hint={!(tried && err.no) && digits.length >= 4 ? `Shown as XXXX XXXX ${digits.slice(-4)}` : undefined}><Input id="aa-no" inputMode="numeric" value={f.no} onChange={(e) => set('no')(e.target.value)} error={tried && err.no} className="tnum" /></Field>
        <Field label="IFSC" required id="aa-ifsc" error={tried && err.ifsc}><Input id="aa-ifsc" value={f.ifsc} onChange={(e) => set('ifsc')(e.target.value.toUpperCase())} error={tried && err.ifsc} placeholder="CNRB0001234" /></Field>
        <Field label="Opening balance" required id="aa-open" error={tried && err.open}><Input id="aa-open" inputMode="numeric" value={f.open} onChange={(e) => set('open')(e.target.value.replace(/[^\d]/g, ''))} error={tried && err.open} className="tnum" placeholder="₹" /></Field>
        <Field label="As on" required id="aa-date"><Input id="aa-date" value={f.date} onChange={(e) => set('date')(e.target.value)} className="tnum" /></Field>
      </div>
    </FormSheet>
  );
}

function OpeningSheet({ open, onClose, accts }) {
  const toast = useToast();
  const [acct, setAcct] = useState('cash');
  const [amt, setAmt] = useState('');
  const [why, setWhy] = useState('');
  const [tried, setTried] = useState(false);
  const cur = accts.find((a) => a.id === acct);
  const err = { amt: amt === '' ? 'Enter the right opening balance' : num(amt) === cur.open ? 'This is the same as now' : '', why: !why.trim() ? 'Say why it was wrong. The Principal sees this.' : '' };
  const close = () => { onClose(); setAmt(''); setWhy(''); setTried(false); };
  return (
    <FormSheet open={open} onClose={close} title="Change an opening balance" sub="Opening balances were set at go-live on 1 Apr 2026. A change needs the Principal’s approval." submitLabel="Send for approval"
      onSubmit={() => { setTried(true); if (err.amt || err.why) return false; toast({ title: 'Sent to Lakshmi Rao for approval', body: `${cur.name}: ${inr(cur.open)} → ${inr(num(amt))}. Every book from 1 Apr changes once she approves.` }); }}>
      <Field label="Account" required id="ob-a"><Select id="ob-a" value={acct} onChange={setAcct} options={accts.map((a) => ({ value: a.id, label: `${a.name} · now ${inr(a.open)}` }))} /></Field>
      <Field label="Right opening balance on 1 Apr 2026" required id="ob-amt" error={tried && err.amt}><Input id="ob-amt" inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d]/g, ''))} error={tried && err.amt} className="tnum" placeholder={String(cur.open)} /></Field>
      <Field label="Reason" required id="ob-why" error={tried && err.why}><Textarea id="ob-why" value={why} onChange={setWhy} rows={2} placeholder="Example: bank statement shows ₹42,21,600, a cheque cleared on 31 Mar" /></Field>
    </FormSheet>
  );
}

/* =========================================================================================
   Budget (optional page; off for this school until switched on)
   ========================================================================================= */
const BUDGET0 = [
  ['Salaries', 34000000], ['PF, ESI and professional tax', 3150000], ['Electricity', 1020000], ['Water', 180000], ['Repairs and maintenance', 400000],
  ['Housekeeping and cleaning', 300000], ['Stationery and printing', 420000], ['Lab materials', 150000], ['Library books', 150000], ['Sports and games', 120000],
  ['Diesel', 1500000], ['Vehicle repairs', 250000], ['Vehicle insurance and permits', 280000], ['Events and functions', 120000], ['Hostel mess provisions', 1900000],
  ['Internet and phone', 60000], ['Software and subscriptions', 120000], ['Bank and payment charges', 200000], ['Audit and professional fees', 100000], ['Tea, snacks and petty expenses', 80000],
  ['Postage and courier', 15000], ['Staff welfare', 100000],
].map(([h, b]) => ({ head: h, dept: HEAD[h].dept, budget: b, spent: HEAD[h].fy, committed: sumBy(EXPENSES0.filter((e) => e.head === h && e.status === 'Approved'), (e) => e.amt), rev: [{ what: `Set at ${inr(b)} · equal by month`, when: 'Wed 1 Apr 2026 · Lakshmi Rao', icon: 'Flag', tone: 'brand' }], split: 'Equal by month' }));
BUDGET0.find((b) => b.head === 'Events and functions').rev.push({ what: `Raised from ${inr(90000)} to ${inr(120000)}: Annual Day moved to December`, when: 'Mon 3 Aug 2026 · Lakshmi Rao', icon: 'Pencil', tone: 'info' });
BUDGET0.find((b) => b.head === 'Repairs and maintenance').rev.push({ what: `Raised from ${inr(350000)} to ${inr(400000)}: roof leak after the July rains`, when: 'Fri 24 Jul 2026 · Lakshmi Rao', icon: 'Pencil', tone: 'info' });
const usedPct = (b) => pct(b.spent + b.committed, b.budget);
const YEAR_GONE = Math.round((191 / 365) * 100); // 1 Apr to 9 Oct

function BudgetPage() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const { role } = useRole();
  const [on, setOn] = useState(false);
  // Staff pay heads only for people who may see salary amounts
  const [list, setList] = useState(() => (seesPay(role) ? BUDGET0 : BUDGET0.filter((b) => HEAD[b.head].from !== 'Salary')));
  const [by, setBy] = useState('head');
  const [show, setShow] = useState('all');
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);
  const [rev, setRev] = useState(null);
  const [copy, setCopy] = useState(false);
  if (!on) {
    return (
      <div>
        <ModuleHead sub="Yearly budget by head and department, and how much is used" />
        <Card>
          <Empty icon={I.Calculator} title="Budgets are switched off"
            body="Sunrise Public School does not use budgets yet. Switch them on to set a budget for each expense head and department, see what is used, and warn approvers when a head goes over."
            action={canEdit ? <Button variant="primary" icon={I.ToggleRight} onClick={() => { setOn(true); toast({ title: 'Budgets switched on', body: 'This year’s figures were set by the Principal on 1 Apr. Saved in Settings, Modules On/Off.', undo: () => setOn(false) }); }}>Switch on budgets</Button>
              : <p className="text-[13px] text-ink3">Ask the School Admin to switch it on in Settings, Modules On/Off.</p>} />
        </Card>
      </div>
    );
  }
  const total = { budget: sumBy(list, (b) => b.budget), spent: sumBy(list, (b) => b.spent), committed: sumBy(list, (b) => b.committed) };
  const over = list.filter((b) => usedPct(b) > 100);
  const near = list.filter((b) => usedPct(b) >= 80 && usedPct(b) <= 100);
  const shown = list.filter((b) => show === 'all' || (show === 'over' ? usedPct(b) > 100 : usedPct(b) >= 80));
  const depts = DEPTS.concat('All departments').map((d) => { const r = list.filter((b) => b.dept === d); return { head: d, dept: d, budget: sumBy(r, (b) => b.budget), spent: sumBy(r, (b) => b.spent), committed: sumBy(r, (b) => b.committed), n: r.length }; }).filter((d) => d.n);
  const rows = by === 'head' ? shown : depts;
  const tone = (p) => (p > 100 ? 'bad' : p >= 80 ? 'warn' : 'brand');
  const upd = (head, x) => setList((l) => l.map((b) => (b.head === head ? { ...b, ...x } : b)));
  return (
    <div>
      <ModuleHead sub={`Financial year 2026–27 · ${YEAR_GONE}% of the year has gone (1 Apr to 9 Oct)`}
        actions={canEdit && <><Button variant="secondary" icon={I.CopyPlus} onClick={() => setCopy(true)}>Plan 2027–28</Button><Button variant="primary" icon={I.Plus} onClick={() => setAdding(true)}>Set a budget</Button></>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Stats items={[
          { label: 'Budget for the year', value: inrShort(total.budget), sub: `${list.length} expense heads${seesPay(role) ? '' : ' · staff pay not shown'}`, icon: 'Calculator' },
          { label: 'Spent', value: inrShort(total.spent), sub: `${pct(total.spent, total.budget)}% used`, icon: 'ReceiptText' },
          { label: 'Committed', value: inr(total.committed), sub: 'Approved, not paid yet', icon: 'BadgeCheck', tone: 'info' },
          { label: 'Left', value: inrShort(total.budget - total.spent - total.committed), sub: `${over.length} over · ${near.length} above 80%`, icon: 'Wallet', tone: over.length ? 'bad' : 'ok' },
        ]} />
        {over.map((b) => <Banner key={b.head} tone="bad" title={`${b.head} is over budget: ${usedPct(b)}% used.`} action={<Button size="sm" variant="secondary" onClick={() => setOpen(b)}>Open</Button>}>{inr(b.spent + b.committed - b.budget)} more than the {inr(b.budget)} budget. Approvers see a warning on every new expense here.</Banner>)}
        <Banner tone="warn" title="Waiting for approval: Smart board repair, ₹12,400.">It would take Repairs and maintenance to {pct(list.find((b) => b.head === 'Repairs and maintenance').spent + 12400, list.find((b) => b.head === 'Repairs and maintenance').budget)}% used. Lakshmi Rao sees this warning when she approves it.</Banner>
        <Card className="overflow-hidden">
          <CardHead title="Budget against spending" sub="Committed means approved but not paid yet" icon={I.Gauge} />
          <div className="px-3 pb-3 flex flex-col @md:flex-row gap-2.5">
            <Segmented size="sm" className="w-max" value={by} onChange={setBy} options={[{ value: 'head', label: 'By expense head' }, { value: 'dept', label: 'By department' }]} />
            {by === 'head' && <Segmented size="sm" className="w-max @md:ml-auto" value={show} onChange={setShow} options={[{ value: 'all', label: 'All' }, { value: 'near', label: `80% or more · ${near.length + over.length}` }, { value: 'over', label: `Over · ${over.length}` }]} />}
          </div>
          <DataList rows={rows} rowKey={(b) => b.head} onRow={by === 'head' ? setOpen : undefined} minWidth={880} footer={`Totals: budget ${inr(total.budget)} · spent ${inr(total.spent)} · committed ${inr(total.committed)}`}
            columns={[
              { key: 'head', label: by === 'head' ? 'Expense head' : 'Department', render: (b) => <><p className="font-semibold leading-tight">{b.head}</p>{by === 'head' ? <p className="text-[12px] text-ink3">{b.dept}</p> : <p className="text-[12px] text-ink3">{b.n} heads</p>}</> },
              { key: 'budget', label: 'Budget', align: 'right', render: (b) => inr(b.budget) },
              { key: 'spent', label: 'Spent', align: 'right', render: (b) => inr(b.spent) },
              { key: 'committed', label: 'Committed', align: 'right', render: (b) => (b.committed ? inr(b.committed) : <span className="text-ink3">—</span>) },
              { key: 'left', label: 'Left', align: 'right', render: (b) => <b className={cx('font-semibold', b.budget - b.spent - b.committed < 0 && 'text-bad')}>{signed(b.budget - b.spent - b.committed)}</b> },
              { key: 'pct', label: 'Used', render: (b) => { const p = usedPct(b); return <div className="flex items-center gap-2 min-w-[150px]"><Progress value={p} tone={tone(p)} className="flex-1" /><span className={cx('text-[13px] font-semibold tnum w-11 text-right', p > 100 ? 'text-bad' : p >= 80 && 'text-warn')}>{p}%</span></div>; } },
            ]}
            mobile={(b) => { const p = usedPct(b); return { title: b.head, sub: `${inr(b.spent + b.committed)} of ${inr(b.budget)}`, icon: 'Gauge', iconTone: tone(p) === 'brand' ? 'neutral' : tone(p), right: <span className={cx('font-semibold tnum', p > 100 ? 'text-bad' : p >= 80 && 'text-warn')}>{p}%</span> }; }}
            empty={<Empty icon={I.CircleCheck} title="No heads here" body="Nothing is over its budget." />} />
        </Card>
        <Suggestion title="Where the year is heading" source="Spending 1 Apr to 9 Oct, the same months of 2025–26, and approved expenses"
          actions={canEdit && <Button size="sm" variant="secondary" icon={I.Pencil} onClick={() => setRev(list.find((b) => b.head === 'Events and functions'))}>Revise Events budget</Button>}>
          At this pace <b className="text-ink">Events and functions</b> ends the year near {inr(210000)} (Annual Day is in December), and <b className="text-ink">Repairs and maintenance</b> near {inr(560000)}. <b className="text-ink">Diesel</b> and <b className="text-ink">Hostel mess</b> are on track. The rest of the budget looks safe.
        </Suggestion>
      </div>

      {open && (
        <Sheet open onClose={() => setOpen(null)} title={open.head} sub={`${open.dept} · budget ${inr(open.budget)} for 2026–27`} wide
          footer={canEdit ? <><Button variant="ghost" onClick={() => setOpen(null)}>Close</Button><Button variant="primary" icon={I.Pencil} onClick={() => { setRev(open); setOpen(null); }}>Revise budget</Button></> : <Button variant="ghost" onClick={() => setOpen(null)}>Close</Button>}>
          <div className="grid grid-cols-2 @md:grid-cols-4 gap-4 mb-4">
            <Mini k="Budget" v={inr(open.budget)} /><Mini k="Spent" v={inr(open.spent)} /><Mini k="Committed" v={inr(open.committed)} /><Mini k="Used" v={<b className={cx('font-semibold', usedPct(open) > 100 ? 'text-bad' : usedPct(open) >= 80 && 'text-warn')}>{usedPct(open)}%</b>} />
          </div>
          <p className="text-[13px] font-semibold text-ink2 mb-2">Month by month ({open.split.toLowerCase()})</p>
          <Bars data={MONTHLY.map((m) => ({ k: m.m, v: Math.round(open.spent * (m.otherOut / OTHER_OUT_FY) / 1000), v2: Math.round(open.budget / 12 / 1000) }))} label={(v) => `₹${v}k`} ariaLabel="Spent each month against the monthly budget" />
          <div className="mt-2 mb-5"><Legend items={[['bg-brand', 'Spent'], ['bg-ink3/25', 'Monthly budget']]} /></div>
          <p className="text-[13px] font-semibold text-ink2 mb-2">Revisions · the original is always kept</p>
          <Timeline items={[...open.rev].reverse()} />
        </Sheet>
      )}

      <BudgetSheet open={adding} onClose={() => setAdding(false)} list={list} onAdd={(b) => setList((l) => [...l, b])} />
      <ReviseSheet b={rev} onClose={() => setRev(null)} onDone={(b, amt, why) => {
        const prev = b;
        upd(b.head, { budget: amt, rev: [...b.rev, { what: `${amt > b.budget ? 'Raised' : 'Lowered'} from ${inr(b.budget)} to ${inr(amt)}: ${why}`, when: 'Fri 9 Oct 2026 · ' + ME_ACC, icon: 'Pencil', tone: 'info' }] });
        toast({ title: `${b.head}: budget now ${inr(amt)}`, body: 'The original and every revision are kept.', undo: () => upd(b.head, prev) });
      }} />
      <CopySheet open={copy} onClose={() => setCopy(false)} total={total.budget} />
    </div>
  );
}

function BudgetSheet({ open, onClose, list, onAdd }) {
  const toast = useToast();
  const [head, setHead] = useState('Repairs and maintenance');
  const [dept, setDept] = useState('');
  const [amt, setAmt] = useState('');
  const [split, setSplit] = useState('Equal by month');
  const [tried, setTried] = useState(false);
  const a = num(amt);
  const exists = list.find((b) => b.head === head);
  const err = { head: exists ? `${head} already has a budget for 2026–27. Use Revise to change it.` : '', amt: !a ? 'Enter the budget for the year' : '' };
  const close = () => { onClose(); setAmt(''); setTried(false); };
  return (
    <FormSheet open={open} onClose={close} title="Set a budget" sub="For the financial year 2026–27 (April to March)" submitLabel="Set budget"
      onSubmit={() => { setTried(true); if (err.head || err.amt) return false; onAdd({ head, dept: dept || HEAD[head].dept, budget: a, spent: HEAD[head].fy, committed: 0, split, rev: [{ what: `Set at ${inr(a)} · ${split.toLowerCase()}`, when: 'Fri 9 Oct 2026 · ' + ME_ACC, icon: 'Flag', tone: 'brand' }] }); toast({ title: `Budget set: ${head}`, body: `${inr(a)} for 2026–27 · ${split.toLowerCase()} (${inr(Math.round(a / (split === 'Equal by term' ? 3 : 12)))} each)` }); setAmt(''); setTried(false); }}>
      <Field label="Year" required id="bs-y"><Select id="bs-y" value="2026-27" onChange={() => {}} options={[{ value: '2026-27', label: '2026–27 · Apr 2026 to Mar 2027' }]} /></Field>
      <Field label="Expense head" required id="bs-h" error={tried && err.head}><Select id="bs-h" value={head} onChange={setHead} error={tried && err.head} options={OUT_HEADS.concat(['Salaries', 'PF, ESI and professional tax'])} /></Field>
      <Field label="Department" id="bs-d" hint="Optional. Leave it to use the head’s usual department."><Select id="bs-d" value={dept} onChange={setDept} options={[{ value: '', label: `Usual: ${HEAD[head].dept}` }, ...DEPTS]} /></Field>
      <Field label="Amount for the year" required id="bs-a" error={tried && err.amt} hint={a ? `${inr(Math.round(a / 12))} a month, ${inr(Math.round(a / 3))} a term` : undefined}><Input id="bs-a" inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d]/g, ''))} error={tried && err.amt} className="tnum" placeholder="₹" /></Field>
      <Field label="Split"><Segmented value={split} onChange={setSplit} className="w-full" options={['Equal by month', 'Equal by term', 'Enter myself']} /></Field>
    </FormSheet>
  );
}

function ReviseSheet({ b, onClose, onDone }) {
  const [amt, setAmt] = useState('');
  const [why, setWhy] = useState('');
  const [tried, setTried] = useState(false);
  if (!b) return null;
  const a = num(amt);
  const err = { amt: !a ? 'Enter the new budget' : a === b.budget ? 'This is the same as now' : a < b.spent + b.committed ? `Already ${inr(b.spent + b.committed)} spent or committed. The budget cannot be less.` : '', why: !why.trim() ? 'Say why. It is kept with the revision.' : '' };
  return (
    <FormSheet open onClose={() => { onClose(); setAmt(''); setWhy(''); setTried(false); }} title={`Revise: ${b.head}`} sub={`Now ${inr(b.budget)} · ${usedPct(b)}% used. The original stays on record.`} submitLabel="Save revision"
      onSubmit={() => { setTried(true); if (err.amt || err.why) return false; onDone(b, a, why.trim()); setAmt(''); setWhy(''); setTried(false); }}>
      <Field label="New budget for the year" required id="rv-a" error={tried && err.amt} hint={a && !err.amt ? `${a > b.budget ? '+' : '−'}${inr(Math.abs(a - b.budget))} · ${pct(b.spent + b.committed, a)}% used after this` : undefined}><Input id="rv-a" inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^\d]/g, ''))} error={tried && err.amt} className="tnum" placeholder={String(b.budget)} /></Field>
      <Field label="Reason" required id="rv-w" error={tried && err.why}><Textarea id="rv-w" value={why} onChange={setWhy} rows={2} placeholder="Example: Annual Day moved to December" /></Field>
    </FormSheet>
  );
}

function CopySheet({ open, onClose, total }) {
  const toast = useToast();
  const [p, setP] = useState('8');
  const v = Number(p) || 0;
  const err = p === '' ? 'Enter a percentage (0 for no change)' : v > 50 ? 'More than 50% looks like a mistake' : '';
  return (
    <FormSheet open={open} onClose={onClose} title="Plan 2027–28" sub="Copy this year’s budget with a change. It is saved as a draft for the Principal." submitLabel="Make draft budget"
      onSubmit={() => { if (err) return false; toast({ title: 'Draft budget for 2027–28 made', body: `${inr(Math.round(total * (1 + v / 100)))} in all (${v}% on this year). Lakshmi Rao is told.` }); }}>
      <Field label="Change on every head" required id="cp-p" error={err} hint={!err ? `This year ${inr(total)} → next year ${inr(Math.round(total * (1 + v / 100)))}` : undefined}>
        <div className="flex items-center gap-2"><Input id="cp-p" inputMode="numeric" value={p} onChange={(e) => setP(e.target.value.replace(/[^\d]/g, ''))} error={!!err} className="tnum w-28" /><span className="text-[15px] text-ink2">% more</span></div>
      </Field>
      <p className="text-[13px] text-ink3">You can change each head afterwards. Salaries usually follow the increment rules in Salary Settings.</p>
    </FormSheet>
  );
}

/* =========================================================================================
   Accounts (full accounts: journal, ledger, payables, receivables, campuses)
   ========================================================================================= */
const LEDGER_ACCTS = ['Cash in hand', 'School account (SBI)', 'Trust account (HDFC)', 'Razorpay and card money on the way', ...HEADS.map((h) => h.name), 'RTE reimbursement due (Govt. of Telangana)', 'Prepaid insurance', 'Depreciation', 'Accumulated depreciation', 'PF, ESI and TDS payable', 'Vendors to pay'];
// Today's fee postings as journal lines, worked out from the Fee module's payments
const FEE_JV_9 = (() => {
  const posted = FEES_9.filter((e) => e.status === 'Posted');
  const dr = [['Cash in hand', 'Cash'], ['School account (SBI)', 'UPI', 'School account'], ['Trust account (HDFC)', 'UPI', 'Trust account'], ['Razorpay and card money on the way', 'Online'], ['Razorpay and card money on the way', 'Card']];
  const lines = {};
  dr.forEach(([acc, m, a]) => { const v = sumBy(posted.filter((e) => e.mode === m && (!a || e.acct === a)), (e) => e.total); if (v) lines[acc] = (lines[acc] || [0, 0]), lines[acc][0] += v; });
  const headOf = (h) => h.startsWith('Tuition') ? 'Tuition fee' : h.startsWith('Transport') ? 'Transport fee' : h.startsWith('Hostel') ? 'Hostel fee' : h.startsWith('Exam') ? 'Exam fee' : 'Uniform and books (store)';
  posted.forEach((e) => { const h = headOf(e.head); lines[h] = lines[h] || [0, 0]; lines[h][1] += e.amt; if (e.pen) { lines['Late fee'] = lines['Late fee'] || [0, 0]; lines['Late fee'][1] += e.pen; } });
  return Object.entries(lines).map(([a, [d, c]]) => [a, d, c]);
})();
const JOURNALS0 = [
  { no: 'JV/26/0218', d: '9 Oct', narr: 'Fee payments posted on 9 Oct (36 receipts, R/26/05152 to R/26/05190)', by: 'School OS · from Fees', auto: true, lines: FEE_JV_9 },
  { no: 'JV/26/0217', d: '9 Oct', narr: 'Receipt R/26/05180 cancelled: wrong amount', by: 'School OS · from Fees', auto: true, lines: [['Tuition fee', 6200, 0], ['Cash in hand', 0, 6200]] },
  { no: 'JV/26/0216', d: '9 Oct', narr: 'Other income: INC/26/0087 hall rent, INC/26/0088 scrap sale', by: 'School OS · from Income', auto: true, lines: [['School account (SBI)', 15000, 0], ['Cash in hand', 2350, 0], ['Hall and ground rent', 0, 15000], ['Scrap sale', 0, 2350]] },
  { no: 'JV/26/0215', d: '9 Oct', narr: 'Expenses paid: EXP/26/0445, 0446, 0448, 0449', by: 'School OS · from Expenses', auto: true, lines: [['Stationery and printing', 2000, 0], ['Repairs and maintenance', 2620, 0], ['Postage and courier', 380, 0], ['Tea, snacks and petty expenses', 1450, 0], ['Cash in hand', 0, 3830], ['School account (SBI)', 0, 2620]] },
  { no: 'JV/26/0209', d: '8 Oct', narr: 'Bus insurance paid in April, spread over the year: October share', by: ME_ACC, lines: [['Vehicle insurance and permits', 22000, 0], ['Prepaid insurance', 0, 22000]] },
  { no: 'JV/26/0201', d: '6 Oct', narr: 'RTE fee due from the Telangana government for 38 students, April to September', by: ME_ACC, lines: [['RTE reimbursement due (Govt. of Telangana)', 988000, 0], ['Tuition fee', 0, 988000]] },
  { no: 'JV/26/0187', d: '30 Sep', narr: 'September 2026 salary paid (86 staff), payroll run PAY-2026-09', by: 'School OS · from Salary', auto: true, lines: [['Salaries', 2780100, 0], ['School account (SBI)', 0, 2636400], ['PF, ESI and TDS payable', 0, 143700]] },
  { no: 'JV/26/0186', d: '30 Sep', narr: 'Depreciation for September: computers, smart boards and buses', by: ME_ACC, lines: [['Depreciation', 64800, 0], ['Accumulated depreciation', 0, 64800]] },
  { no: 'JV/26/0173', d: '24 Sep', narr: 'Reversal of JV/26/0172', by: ME_ACC, reverses: 'JV/26/0172', lines: [['Stationery and printing', 3450, 0], ['Repairs and maintenance', 0, 3450]] },
  { no: 'JV/26/0172', d: '24 Sep', narr: 'Printer repair moved from Stationery to Repairs', by: ME_ACC, reversedBy: 'JV/26/0173', lines: [['Repairs and maintenance', 3450, 0], ['Stationery and printing', 0, 3450]] },
];
const jvTotal = (j) => sumBy(j.lines, (l) => l[1]);
const GL = {
  'Electricity': { open: 0, rows: [['5 May', 'EXP/26/0061', 'April bill, 2 meters', 68420, 0], ['4 Jun', 'EXP/26/0112', 'May bill (summer, school closed)', 41230, 0], ['6 Jul', 'EXP/26/0189', 'June bill', 79960, 0], ['5 Aug', 'EXP/26/0247', 'July bill', 98410, 0], ['4 Sep', 'EXP/26/0318', 'August bill', 102760, 0], ['30 Sep', 'JV/26/0185', 'Generator diesel, Aug–Sep', 101820, 0]] },
  'Repairs and maintenance': { open: 0, rows: [['Apr–Aug', '41 entries', 'Earlier months, together', 318400, 0], ['3 Sep', 'EXP/26/0302', 'Roof waterproofing, Block C (balance)', 28600, 0], ['18 Sep', 'EXP/26/0359', 'Fan and light repairs, Block A', 15180, 0], ['24 Sep', 'JV/26/0172', 'Printer repair moved here', 3450, 0], ['24 Sep', 'JV/26/0173', 'Reversal of JV/26/0172', 0, 3450], ['9 Oct', 'EXP/26/0446', 'Tap and pipe repair, girls’ washroom', 2620, 0]] },
  'Cash in hand': { open: 24150, rows: [['1 Apr–7 Oct', 'Daily totals', 'Cash fees and income; bank deposits and cash expenses', 0, 0], ['8 Oct', 'Cash book', 'Day’s cash in, less cash paid', OPEN9.cash - OPEN8.cash + 640, 640], ['9 Oct', 'Cash book', 'Day so far', sumBy(ROWS_9.filter((r) => r.acct === 'cash'), (r) => r.inn), sumBy(ROWS_9.filter((r) => r.acct === 'cash'), (r) => r.out)]] },
  'Hall and ground rent': { open: 0, rows: INCOME0.filter((r) => r.head === 'Hall and ground rent').reverse().map((r) => [r.d, r.id, r.from, r.status === 'Cancelled' ? 6000 : 0, r.amt]) },
};
// Cash paid out since go-live (bank deposits and cash expenses); receipts follow from the balances
const CASH_PAY_FY = 4618200;
GL['Cash in hand'].rows[0][4] = CASH_PAY_FY - 640 - sumBy(ROWS_9.filter((r) => r.acct === 'cash'), (r) => r.out);
GL['Cash in hand'].rows[0][3] = OPEN8.cash - 24150 + GL['Cash in hand'].rows[0][4];
const PAYABLES = [
  { to: 'TSSPDCL', what: 'Electricity bill for September · EXP/26/0440', due: 'Mon 12 Oct', days: 3, amt: 84320, go: 'expenses' },
  { to: 'EPFO, ESIC and Income Tax', what: 'PF, ESI, professional tax and TDS for September', due: 'Thu 15 Oct', days: 6, amt: 260700, go: 'salary' },
  { to: 'Deccan Scientific Suppliers', what: 'Lab chemicals · EXP/26/0442 (approved)', due: 'On delivery', days: null, amt: 18600, go: 'expenses' },
  { to: 'Deccan Scientific Suppliers', what: 'Bill DSS/2026/772, balance', due: 'Sat 7 Nov', days: 29, amt: 3400, go: 'expenses' },
  { to: 'Sri Sai Stationers', what: 'Bill SSS/1203', due: 'Sun 1 Nov', days: 23, amt: 3460, go: 'expenses' },
];
const RECEIVABLES = [
  { from: 'Govt. of Telangana (RTE)', what: 'RTE fee for 38 students, Apr–Sep 2026 · JV/26/0201', due: 'Claimed 6 Oct', amt: 988000, age: 'New' },
  { from: 'Annapurna Caterers', what: 'Canteen contract, October share · cheque INC/26/0086 not cleared', due: 'Sat 10 Oct', amt: 20000, age: 'Not due' },
  { from: 'Natya Kala Academy', what: 'Auditorium rent balance, Sun 11 Oct', due: 'Mon 12 Oct', amt: 5000, age: 'Not due' },
  { from: 'Vijetha Supermarkets', what: 'Sports Day sponsorship, second half', due: 'Mon 30 Nov', amt: 25000, age: 'Not due' },
  { from: 'Staff salary advances and loans', what: '4 active · recovered from salary each month', due: 'Monthly', amt: 54500, age: 'On track' },
];
const CAMPUS_FIN = [
  { id: 'kph', name: 'Kukatpally (main campus)', inc: INC_FY, exp: EXP_FY, cash: OPEN9.cash + netOf(ROWS_9, 'cash'), bank: OPEN9.sbi + OPEN9.hdfc + netOf(ROWS_9, 'sbi') + netOf(ROWS_9, 'hdfc'), students: 1236, staff: 86 },
  { id: 'myp', name: 'Miyapur campus', inc: 13286400, exp: 11904300, cash: 21480, bank: 3184200, students: 684, staff: 47 },
];

function AccountsPage() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const [campus, setCampus] = useState('kph');
  const [sec, setSec] = useState('journal');
  const [jvs, setJvs] = useState(JOURNALS0);
  const [open, setOpen] = useState(null);
  const [adding, setAdding] = useState(false);
  const [rev, setRev] = useState(null);
  const [acc, setAcc] = useState('Electricity');
  const [q, setQ] = useState('');
  const [per, setPer] = useState(DP.finyear);
  const t = q.trim().toLowerCase();
  const shown = jvs.filter((j) => inPeriod(isoOf(j.d), per)).filter((j) => !t || j.no.toLowerCase().includes(t) || j.narr.toLowerCase().includes(t) || j.lines.some((l) => l[0].toLowerCase().includes(t)));
  const gl = GL[acc];
  let run = gl.open;
  const glRows = gl.rows.map((r, i) => { run += r[3] - r[4]; return { id: i, d: r[0], ref: r[1], narr: r[2], dr: r[3], cr: r[4], bal: run }; });
  const reverse = (j) => {
    const no = `JV/26/0${219 + jvs.length - JOURNALS0.length}`;
    const nj = { no, d: '9 Oct', narr: `Reversal of ${j.no}`, by: ME_ACC, reverses: j.no, lines: j.lines.map(([a, d, c]) => [a, c, d]) };
    setJvs((x) => [nj, ...x.map((y) => (y.no === j.no ? { ...y, reversedBy: no } : y))]);
    toast({ title: `${j.no} reversed by ${no}`, body: 'The original stays as it was. Both are in the ledger.', undo: () => setJvs((x) => x.filter((y) => y.no !== no).map((y) => (y.no === j.no ? { ...y, reversedBy: null } : y))) });
  };
  const cons = { inc: sumBy(CAMPUS_FIN, (c) => c.inc), exp: sumBy(CAMPUS_FIN, (c) => c.exp), cash: sumBy(CAMPUS_FIN, (c) => c.cash), bank: sumBy(CAMPUS_FIN, (c) => c.bank) };

  return (
    <div>
      <ModuleHead sub="Journal entries, ledger, money to pay and money to receive · for full accounts"
        actions={campus === 'kph' && canEdit && <Button variant="primary" icon={I.Plus} onClick={() => setAdding(true)}>Journal entry</Button>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <div className="flex flex-col @md:flex-row gap-2.5 @md:items-center">
          <Select id="ac-campus" className="@md:w-72" value={campus} onChange={setCampus} options={[{ value: 'kph', label: 'Kukatpally (main campus)' }, { value: 'myp', label: 'Miyapur campus' }, { value: 'all', label: 'Sunrise Group · all campuses' }]} />
          {campus === 'kph' && <div className="overflow-x-auto no-scrollbar @md:ml-auto"><Segmented className="w-max" value={sec} onChange={setSec} options={[{ value: 'journal', label: 'Journal entries' }, { value: 'ledger', label: 'General ledger' }, { value: 'payables', label: 'To pay' }, { value: 'receivables', label: 'To receive' }]} /></div>}
        </div>

        {campus !== 'kph' ? (
          <>
            <Banner tone="info" title={campus === 'all' ? 'Group view.' : 'Miyapur keeps its own books.'}>{campus === 'all' ? 'Both campuses added up. Each campus still has its own Day Book, cash book and bank books.' : 'Its accountant, Mahesh Goud, posts there. You can read them; open the campus from the school switcher to work in it.'}</Banner>
            <Stats items={campus === 'all' ? [
              { label: 'Income 2026–27', value: inrShort(cons.inc), icon: 'TrendingUp', tone: 'ok' }, { label: 'Expenses', value: inrShort(cons.exp), icon: 'TrendingDown' },
              { label: 'Surplus', value: inrShort(cons.inc - cons.exp), icon: 'Scale', tone: 'brand' }, { label: 'Cash and bank', value: inrShort(cons.cash + cons.bank), icon: 'Landmark' },
            ] : (() => { const c = CAMPUS_FIN[1]; return [{ label: 'Income 2026–27', value: inrShort(c.inc), icon: 'TrendingUp', tone: 'ok' }, { label: 'Expenses', value: inrShort(c.exp), icon: 'TrendingDown' }, { label: 'Surplus', value: inrShort(c.inc - c.exp), icon: 'Scale', tone: 'brand' }, { label: 'Cash and bank', value: inrShort(c.cash + c.bank), icon: 'Landmark' }]; })()} />
            <Card className="overflow-hidden">
              <CardHead title={campus === 'all' ? 'Campuses side by side' : 'Miyapur campus · trial balance summary'} sub="1 Apr to 9 Oct 2026" icon={I.Building2} action={<ReportActions name={campus === 'all' ? 'Group finance summary' : 'Miyapur trial balance'} />} />
              <SimpleTable minWidth={680} cols={[{ label: 'Campus', render: (c) => c.name }, { label: 'Students', right: true, render: (c) => c.students.toLocaleString('en-IN') }, { label: 'Income', right: true, render: (c) => inr(c.inc) }, { label: 'Expenses', right: true, render: (c) => inr(c.exp) }, { label: 'Surplus', right: true, render: (c) => <b className="font-semibold">{inr(c.inc - c.exp)}</b> }, { label: 'Cash and bank', right: true, render: (c) => inr(c.cash + c.bank) }]}
                rows={campus === 'all' ? CAMPUS_FIN : CAMPUS_FIN.slice(1)} rowKey={(c) => c.id}
                foot={campus === 'all' ? ['Sunrise Group', '1,920', inr(cons.inc), inr(cons.exp), inr(cons.inc - cons.exp), inr(cons.cash + cons.bank)] : undefined} />
            </Card>
          </>
        ) : sec === 'journal' ? (
          <Card className="overflow-hidden">
            <CardHead title="Journal entries" sub="Fees, income, expenses and salary make their own entries. Posted entries are never edited, only reversed." icon={I.NotebookText} />
            <Toolbar><SearchBox id="jv-q" value={q} onChange={setQ} placeholder="Number, narration or account" /><DatePeriod id="jv-per" value={per} onChange={setPer} className="w-full @md:w-auto" /></Toolbar>
            <DataList rows={shown} rowKey={(j) => j.no} onRow={setOpen} minWidth={860} footer={`Showing ${shown.length} of ${jvs.length} · ${fmtRange(per)}`}
              empty={<Empty icon={I.SearchX} title="No journal entries here" body={`None in ${fmtRange(per)} with this search.`} action={<Button variant="secondary" onClick={() => { setQ(''); setPer(DP.finyear); }}>Clear filters</Button>} />}
              columns={[
                { key: 'd', label: 'Date', nowrap: true, render: (j) => <><p className="tnum">{j.d}</p><p className="font-mono text-[12px] text-ink3">{j.no}</p></> },
                { key: 'dr', label: 'Debited', render: (j) => <span className="text-[13px]">{j.lines.filter((l) => l[1]).map((l) => l[0]).join(', ')}</span> },
                { key: 'cr', label: 'Credited', render: (j) => <span className="text-[13px] text-ink2">{j.lines.filter((l) => l[2]).map((l) => l[0]).join(', ')}</span> },
                { key: 'amt', label: 'Amount', align: 'right', render: (j) => <b className={cx('font-semibold', j.reversedBy && 'line-through text-ink3')}>{inr(jvTotal(j))}</b> },
                { key: 'narr', label: 'Narration', render: (j) => <span className="text-[13px] text-ink2">{j.narr}</span> },
                { key: 'by', label: 'Made by', render: (j) => <>{j.auto ? <Pill tone="info" className="!h-5 !text-[11px]">Automatic</Pill> : <span className="text-[13px]">{j.by}</span>}{j.reversedBy && <Pill tone="bad" className="!h-5 !text-[11px] ml-1">Reversed</Pill>}</> },
              ]}
              mobile={(j) => ({ title: j.narr, sub: `${j.no} · ${j.d}`, icon: 'NotebookText', right: <p className={cx('font-semibold tnum', j.reversedBy && 'line-through text-ink3')}>{inr(jvTotal(j))}</p>, pills: j.auto ? [<Pill key="a" tone="info" className="!h-5 !text-[11px]">Automatic</Pill>] : undefined })} />
          </Card>
        ) : sec === 'ledger' ? (
          <Card className="overflow-hidden">
            <CardHead title="General ledger" sub="Every entry for one account, with the running balance · 2026–27" icon={I.BookOpen} action={<ReportActions name={`Ledger: ${acc}`} />} />
            <div className="px-3 pb-3"><Select id="gl-acc" className="@md:w-80" value={acc} onChange={setAcc} options={Object.keys(GL)} /></div>
            <DataList rows={glRows} minWidth={720} footer={`Balance on 9 Oct: ${inr(run)}`}
              columns={[
                { key: 'd', label: 'Date', nowrap: true, render: (r) => <span className="tnum">{r.d}</span> },
                { key: 'ref', label: 'Entry', render: (r) => <Ref v={r.ref} /> },
                { key: 'narr', label: 'Narration', render: (r) => <span className="text-[13.5px]">{r.narr}</span> },
                { key: 'dr', label: 'Debit', align: 'right', render: (r) => (r.dr ? inr(r.dr) : '') },
                { key: 'cr', label: 'Credit', align: 'right', render: (r) => (r.cr ? inr(r.cr) : '') },
                { key: 'bal', label: 'Balance', align: 'right', render: (r) => <b className="font-semibold">{inr(Math.abs(r.bal))} {r.bal < 0 ? 'Cr' : 'Dr'}</b> },
              ]}
              mobile={(r) => ({ title: r.narr, sub: `${r.d} · ${r.ref}`, icon: r.dr ? 'ArrowDownToLine' : 'ArrowUpFromLine', right: <><p className="font-semibold tnum">{inr(r.dr || r.cr)}</p><p className="text-[12px] text-ink3 tnum">{inr(Math.abs(r.bal))}</p></> })} />
            <p className="px-5 py-3 border-t border-line text-[12.5px] text-ink3">Opening balance on 1 Apr 2026: {inr(gl.open)}. Other accounts are in Finance Reports, Trial balance.</p>
          </Card>
        ) : sec === 'payables' ? (
          <Card className="overflow-hidden">
            <CardHead title="Money the school has to pay" sub="Vendor bills, approved expenses and statutory dues, by due date" icon={I.ArrowUpFromLine} action={<Pill tone="warn">{inr(sumBy(PAYABLES, (p) => p.amt))}</Pill>} />
            <DataList rows={PAYABLES} rowKey={(p) => p.what} minWidth={760} footer={false}
              columns={[
                { key: 'to', label: 'To', render: (p) => <><p className="font-semibold leading-tight">{p.to}</p><p className="text-[12.5px] text-ink3">{p.what}</p></> },
                { key: 'due', label: 'Due', nowrap: true, render: (p) => <span className={cx('text-[13.5px]', p.days != null && p.days <= 3 && 'text-bad font-semibold')}>{p.due}{p.days != null && <span className="block text-[12px] text-ink3 font-normal">in {p.days} days</span>}</span> },
                { key: 'amt', label: 'Amount', align: 'right', render: (p) => <b className="font-semibold">{inr(p.amt)}</b> },
                { key: 'a', label: '', render: (p) => canEdit && <PayableAction p={p} /> },
              ]}
              mobile={(p) => ({ title: p.to, sub: `${p.what} · due ${p.due}`, icon: 'ArrowUpFromLine', iconTone: p.days != null && p.days <= 3 ? 'bad' : 'neutral', right: <p className="font-semibold tnum">{inr(p.amt)}</p> })} />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <CardHead title="Money owed to the school" sub="Other than student fees, which have their own ledger" icon={I.ArrowDownToLine} action={<Pill tone="info">{inr(sumBy(RECEIVABLES, (r) => r.amt))}</Pill>} />
            <DataList rows={RECEIVABLES} rowKey={(r) => r.from} minWidth={760} footer={false}
              columns={[
                { key: 'from', label: 'From', render: (r) => <><p className="font-semibold leading-tight">{r.from}</p><p className="text-[12.5px] text-ink3">{r.what}</p></> },
                { key: 'due', label: 'Due', nowrap: true, render: (r) => <span className="text-[13.5px]">{r.due}</span> },
                { key: 'age', label: 'Status', render: (r) => <Pill tone={r.age === 'On track' || r.age === 'Not due' ? 'neutral' : 'info'}>{r.age}</Pill> },
                { key: 'amt', label: 'Amount', align: 'right', render: (r) => <b className="font-semibold">{inr(r.amt)}</b> },
                { key: 'a', label: '', render: (r) => canEdit && <Button size="sm" variant="ghost" icon={I.BellRing} onClick={() => toast({ title: `Reminder sent to ${r.from}`, body: `${inr(r.amt)} · ${r.what.split(' · ')[0]}` })}>Remind</Button> },
              ]}
              mobile={(r) => ({ title: r.from, sub: `${r.what} · ${r.due}`, icon: 'ArrowDownToLine', right: <p className="font-semibold tnum">{inr(r.amt)}</p> })} />
          </Card>
        )}
      </div>

      {open && (
        <Sheet open onClose={() => setOpen(null)} title={`${open.no} · ${inr(jvTotal(open))}`} sub={`${open.d} 2026 · ${open.by}`} wide
          footer={canEdit && !open.reversedBy && !open.reverses ? <><Button variant="ghost" onClick={() => setOpen(null)}>Close</Button><Button variant="dangerSoft" icon={I.Undo2} onClick={() => { setRev(open); setOpen(null); }}>Reverse entry</Button></> : <Button variant="ghost" onClick={() => setOpen(null)}>Close</Button>}>
          <p className="text-[14px] text-ink2 mb-3">{open.narr}</p>
          <SimpleTable minWidth={420} cols={[{ label: 'Account', render: (l) => l[0] }, { label: 'Debit', right: true, render: (l) => (l[1] ? inr(l[1]) : '') }, { label: 'Credit', right: true, render: (l) => (l[2] ? inr(l[2]) : '') }]}
            rows={open.lines} foot={['Total', inr(sumBy(open.lines, (l) => l[1])), inr(sumBy(open.lines, (l) => l[2]))]} />
          {open.reversedBy && <Banner tone="bad" className="mt-4" title={`Reversed by ${open.reversedBy}.`}>Both entries stay in the books.</Banner>}
          {open.auto && <p className="mt-4 text-[12.5px] text-ink3 flex gap-1.5"><I.Workflow size={14} className="shrink-0 mt-0.5" />Made by School OS when the source was posted. Put mistakes right at the source.</p>}
        </Sheet>
      )}
      <ConfirmSheet open={!!rev} onClose={() => setRev(null)} title={rev ? `Reverse ${rev.no}?` : ''} sub={rev ? `A new entry with the same lines the other way round is added on 9 Oct. ${rev.no} is not changed.` : ''} confirmLabel="Reverse entry" danger onConfirm={() => reverse(rev)} />
      <JournalSheet open={adding} onClose={() => setAdding(false)} next={`JV/26/0${219 + jvs.length - JOURNALS0.length}`} onAdd={(j) => setJvs((x) => [j, ...x])} />
    </div>
  );
}

function PayableAction({ p }) {
  const { go } = useNav();
  const { role } = useRole();
  if (p.go === 'salary' && !canOpen(role, 'salary', 'history')) return null;
  return <Button size="sm" variant="ghost" icon={I.ArrowRight} onClick={() => go(p.go === 'salary' ? 'salary' : 'finance', { page: p.go === 'salary' ? 'history' : 'expenses' })}>{p.go === 'salary' ? 'Salary' : 'Pay'}</Button>;
}

function JournalSheet({ open, onClose, next, onAdd }) {
  const toast = useToast();
  const blank = () => [{ k: 1, acc: 'Depreciation', side: 'Dr', amt: '' }, { k: 2, acc: 'Accumulated depreciation', side: 'Cr', amt: '' }];
  const [lines, setLines] = useState(blank);
  const [narr, setNarr] = useState('');
  const [date, setDate] = useState('09-10-2026');
  const [campus, setCampus] = useState('Kukatpally (main campus)');
  const [tried, setTried] = useState(false);
  const dr = sumBy(lines.filter((l) => l.side === 'Dr'), (l) => num(l.amt));
  const cr = sumBy(lines.filter((l) => l.side === 'Cr'), (l) => num(l.amt));
  const setL = (k, x) => setLines((ls) => ls.map((l) => (l.k === k ? { ...l, ...x } : l)));
  const err = {
    lines: lines.some((l) => !num(l.amt)) ? 'Every line needs an amount' : !lines.some((l) => l.side === 'Dr') || !lines.some((l) => l.side === 'Cr') ? 'At least one debit and one credit' : '',
    bal: dr !== cr ? `Debits ${inr(dr)}, credits ${inr(cr)}. They must be equal.` : '',
    narr: !narr.trim() ? 'Write what this entry is for' : '',
    date: /-(0[1-3])-2026$/.test(date) ? 'This date is in 2025–26 (April to March). That year is closed.' : '',
  };
  const close = () => { onClose(); setLines(blank()); setNarr(''); setTried(false); };
  return (
    <FormSheet open={open} onClose={close} wide title="Journal entry" sub={`${next} · debits must equal credits`} submitLabel="Post entry"
      onSubmit={() => {
        setTried(true); if (Object.values(err).some(Boolean)) return false;
        onAdd({ no: next, d: '9 Oct', narr: narr.trim(), by: ME_ACC, lines: lines.map((l) => [l.acc, l.side === 'Dr' ? num(l.amt) : 0, l.side === 'Cr' ? num(l.amt) : 0]) });
        toast({ title: `${next} posted · ${inr(dr)}`, body: 'In the ledger for each account. It cannot be edited, only reversed.' });
        setLines(blank()); setNarr(''); setTried(false);
      }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" required id="jv-date" error={tried && err.date}><Input id="jv-date" value={date} onChange={(e) => setDate(e.target.value)} error={tried && err.date} className="tnum" /></Field>
        <Field label="Campus" required id="jv-campus"><Select id="jv-campus" value={campus} onChange={setCampus} options={['Kukatpally (main campus)', 'Miyapur campus']} /></Field>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-semibold text-ink2">Lines</p>
        {lines.map((l, i) => (
          <div key={l.k} className="grid grid-cols-[1fr_auto] @md:grid-cols-[1fr_auto_140px_auto] gap-2 items-center">
            <Select id={`jv-acc-${l.k}`} value={l.acc} onChange={(v) => setL(l.k, { acc: v })} options={LEDGER_ACCTS} />
            <Segmented value={l.side} onChange={(v) => setL(l.k, { side: v })} options={[{ value: 'Dr', label: 'Debit' }, { value: 'Cr', label: 'Credit' }]} />
            <Input id={`jv-amt-${l.k}`} inputMode="numeric" aria-label={`Amount, line ${i + 1}`} value={l.amt} onChange={(e) => setL(l.k, { amt: e.target.value.replace(/[^\d]/g, '') })} error={tried && !num(l.amt)} className="tnum" placeholder="₹" />
            <IconButton icon={I.X} label="Remove line" onClick={() => lines.length > 2 && setLines((ls) => ls.filter((x) => x.k !== l.k))} className={lines.length > 2 ? '' : 'opacity-30'} />
          </div>
        ))}
        <Button type="button" size="sm" variant="ghost" icon={I.Plus} className="self-start" onClick={() => setLines((ls) => [...ls, { k: Date.now(), acc: 'Cash in hand', side: 'Dr', amt: '' }])}>Add line</Button>
        <div className={cx('rounded-xl px-3.5 py-2.5 text-[13.5px] flex items-center gap-2 tnum', dr === cr && dr ? 'bg-ok/10 text-ok' : 'bg-sunken text-ink2')}>
          {dr === cr && dr ? <I.CircleCheck size={16} /> : <I.Scale size={16} />}
          <span>Debits <b>{inr(dr)}</b> · Credits <b>{inr(cr)}</b>{dr !== cr && <> · difference {inr(Math.abs(dr - cr))}</>}</span>
        </div>
        {tried && (err.lines || err.bal) && <p className="text-[12.5px] text-bad flex items-center gap-1.5" role="alert"><I.CircleAlert size={14} />{err.lines || err.bal}</p>}
      </div>
      <Field label="Narration" required id="jv-narr" error={tried && err.narr}><Textarea id="jv-narr" value={narr} onChange={setNarr} rows={2} placeholder="Example: Depreciation for October on computers" /></Field>
    </FormSheet>
  );
}

/* =========================================================================================
   Finance Reports
   ========================================================================================= */
const FIN_REPORTS = [
  { id: 'ie', group: 'Income and expense', name: 'Income and expense', sub: 'By head and by month', icon: 'ChartColumn' },
  { id: 'pl', group: 'Income and expense', name: 'Profit and loss', sub: 'Income less expenses for the period', icon: 'Scale' },
  { id: 'dept', group: 'Expenses', name: 'Department-wise expenses', sub: 'By department (cost centre)', icon: 'Building2' },
  { id: 'exp', group: 'Expenses', name: 'Expense report', sub: 'By head, vendor, month or approver', icon: 'ReceiptText' },
  { id: 'pending', group: 'Expenses', name: 'Pending expenses', sub: 'Waiting for approval or payment', icon: 'Hourglass' },
  { id: 'books', group: 'Cash and bank', name: 'Cash book and bank book', sub: 'Opening, receipts, payments, closing', icon: 'Landmark' },
  { id: 'daybook', group: 'Cash and bank', name: 'Day Book for a range', sub: 'Every day’s totals', icon: 'BookOpen' },
  { id: 'budget', group: 'Optional', name: 'Budget against actual', sub: 'Needs budgets switched on', icon: 'Gauge' },
  { id: 'tb', group: 'Optional', name: 'Trial balance', sub: 'Every account’s balance (full accounts)', icon: 'ListTree' },
];
const PERIODS = { fy: { label: '1 Apr to 9 Oct 2026', months: ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'] }, q2: { label: 'Jul to Sep 2026', months: ['Jul', 'Aug', 'Sep'] }, sep: { label: 'September 2026', months: ['Sep'] }, oct: { label: '1 to 9 Oct 2026', months: ['Oct'] } };

function ReportsPage() {
  const { go } = useNav();
  const { role } = useRole();
  const pay = seesPay(role);
  const [active, setActive] = useState('ie');
  const [per, setPer] = useState(DP.finyear);
  const [by, setBy] = useState('head');
  const [expBy, setExpBy] = useState('head');
  const r = FIN_REPORTS.find((x) => x.id === active);
  const P = { label: `${per.label} · ${fmtRange(per)}` };
  // Each month of 2026–27 counts for the share of it inside the chosen dates. Staff pay only for people who may see it.
  const M = MONTHLY.map((m, i) => { const sh = monthShare(per, 2026, FY_MONTHS[i][2]); const sal = pay ? m.salary : 0, st = pay ? m.stat : 0; return { ...m, sh, fee: Math.round(m.fee * sh), otherIn: Math.round(m.otherIn * sh), salary: Math.round(sal * sh), stat: Math.round(st * sh), otherOut: Math.round(m.otherOut * sh), inc: Math.round(m.inc * sh), exp: Math.round((sal + st + m.otherOut) * sh) }; }).filter((m) => m.sh > 0);
  const s = (k) => sumBy(M, (m) => m[k]);
  const share = (k) => (sumBy(MONTHLY, (m) => m[k]) ? s(k) / sumBy(MONTHLY, (m) => m[k]) : 0);
  const fy = per.to < '2026-04-01' ? '2025-26' : '2026-27';
  const head = (sub, extra) => <CardHead title={r.name} sub={sub} action={<div className="flex items-center gap-2">{extra}<ReportActions name={`${r.name}, ${P.label}`} /></div>} />;
  const inc = s('inc'), exp = s('exp');
  const deptRows = DEPTS.map((d) => { const hs = HEADS.filter((h) => h.dept === d); return [d, Math.round(sumBy(hs, (h) => h.fy) * share('otherOut'))]; }).concat(pay ? [['All departments (salary and PF)', s('salary') + s('stat')]] : []).sort((a, b) => b[1] - a[1]);
  const otherOutHeads = HEADS.filter((h) => h.kind === 'out' && !h.from).map((h) => [h.name, Math.round(h.fy * share('otherOut'))]).sort((a, b) => b[1] - a[1]);
  const tbRows = (() => {
    const cash = OPEN9.cash + netOf(ROWS_9, 'cash'), sbi = OPEN9.sbi + netOf(ROWS_9, 'sbi'), hdfc = OPEN9.hdfc + netOf(ROWS_9, 'hdfc');
    const dr = [['Cash in hand', cash], ['School account (SBI)', sbi], ['Trust account (HDFC)', hdfc], ['Razorpay and card money on the way', sumBy(ON_THE_WAY, (e) => e.total)], ['RTE reimbursement due', 988000], ['Prepaid insurance', 110000], ['Buildings, buses and equipment', 18640000], ...HEADS.filter((h) => h.kind === 'out').map((h) => [h.name, h.from === 'Salary' && !pay ? 0 : h.fy]), ['Depreciation', 388800]];
    const cr = [...HEADS.filter((h) => h.kind === 'in').map((h) => [h.name, h.fy]), ['Accumulated depreciation', 4126800], ['PF, ESI and TDS payable', 260700], ['Vendors to pay', 6860]];
    const fund = sumBy(dr, (x) => x[1]) - sumBy(cr, (x) => x[1]);
    return [...dr.map(([k, v]) => ({ k, dr: v, cr: 0 })), ...cr.map(([k, v]) => ({ k, dr: 0, cr: v })), { k: 'General fund (balances brought from 2025–26)', dr: 0, cr: fund }];
  })();

  return (
    <div>
      <ModuleHead sub="Every report works by financial year (April to March), with any dates inside it · also in Reports & Analytics" />
      <div className="flex flex-col @md:flex-row @md:items-center gap-2.5 mb-5">
        <DatePeriod id="fr-per" value={per} onChange={setPer} className="w-full @md:w-auto" />
        {!pay && <p className="text-[13px] text-ink3">Staff pay is left out of these reports for your role.</p>}
      </div>
      {fy === '2025-26' ? (
        <Card><Empty icon={I.Archive} title="2025–26 was kept in the old software" body="School OS started on 1 Apr 2026. Opening balances were brought in on that day; reports for earlier years stay in the old software’s files." action={<Button variant="secondary" onClick={() => setPer(DP.finyear)}>Show this financial year</Button>} /></Card>
      ) : (
      <ReportsFrame reports={FIN_REPORTS} active={active} onPick={setActive}>
        {active === 'ie' && <>
          <Stats items={[{ label: 'Income', value: inrShort(inc), tone: 'ok', sub: P.label }, { label: 'Expenses', value: inrShort(exp), sub: P.label }, { label: inc >= exp ? 'Surplus' : 'Shortfall', value: inrShort(Math.abs(inc - exp)), tone: inc >= exp ? 'brand' : 'bad', sub: `${pct(inc - exp, inc)}% of income` }]} />
          <Card>
            <CardHead title="Money in and money out" sub="By month (₹ lakh)" icon={I.ChartColumn} />
            <div className="px-3 pb-2"><Bars data={M.map((m) => ({ k: m.m, v: Math.round(m.inc / 1e5), v2: Math.round(m.exp / 1e5) }))} max={70} ticks={[0, 20, 40, 60]} label={(v) => `${v}`} ariaLabel="Income and expenses by month" /></div>
            <div className="px-5 pb-4 flex items-center gap-4 flex-wrap"><Legend items={[['bg-brand', 'Income'], ['bg-ink3/25', 'Expenses']]} /><span className="ml-auto text-[12.5px] text-ink3">Fees come in at the start of each quarter; salary goes out every month</span></div>
          </Card>
          <Card className="overflow-hidden">
            {head(P.label, <Segmented size="sm" value={by} onChange={setBy} options={[{ value: 'head', label: 'Head' }, { value: 'month', label: 'Month' }]} />)}
            {by === 'month' ? (
              <SimpleTable minWidth={680} rowKey={(m) => m.m} cols={[{ label: 'Month', render: (m) => m.m }, { label: 'Fees', right: true, render: (m) => inr(m.fee) }, { label: 'Other income', right: true, render: (m) => inr(m.otherIn) }, ...(pay ? [{ label: 'Salary and PF', right: true, render: (m) => inr(m.salary + m.stat) }] : []), { label: 'Other expenses', right: true, render: (m) => inr(m.otherOut) }, { label: 'Net', right: true, render: (m) => <b className={cx('font-semibold', m.inc - m.exp < 0 && 'text-bad')}>{signed(m.inc - m.exp)}</b> }]}
                rows={M} foot={['Total', inr(s('fee')), inr(s('otherIn')), ...(pay ? [inr(s('salary') + s('stat'))] : []), inr(s('otherOut')), signed(inc - exp)]} />
            ) : (
              <SimpleTable minWidth={520} rowKey={(x) => x.k} cols={[{ label: 'Head', render: (x) => x.bold ? <b className="font-semibold">{x.k}</b> : <span className="pl-3">{x.k}</span> }, { label: 'Code', render: (x) => <span className="font-mono text-[12px] text-ink3">{x.code || ''}</span> }, { label: 'Amount', right: true, render: (x) => (x.bold ? <b className="font-semibold">{inr(x.v)}</b> : inr(x.v)) }]}
                rows={[
                  { k: 'Fee income (from Fees)', v: s('fee'), bold: true }, ...HEADS.filter((h) => h.group === 'Fee income').map((h) => ({ k: h.name, code: h.code, v: Math.round(h.fy * share('fee')) })),
                  { k: 'Other income', v: s('otherIn'), bold: true }, ...HEADS.filter((h) => h.group === 'Other income').map((h) => ({ k: h.name, code: h.code, v: Math.round(h.fy * share('otherIn')) })),
                  ...(pay ? [{ k: 'Staff costs (from Salary)', v: s('salary') + s('stat'), bold: true }] : []),
                  { k: 'Other expenses', v: s('otherOut'), bold: true }, ...otherOutHeads.slice(0, 8).map(([k, v]) => ({ k, code: HEAD[k].code, v })),
                ]} />
            )}
          </Card>
        </>}

        {active === 'pl' && (
          <Card className="overflow-hidden">
            {head(`${P.label} · cash basis, as the money moved`)}
            <SimpleTable minWidth={460} rowKey={(x) => x[0]} cols={[{ label: 'Income', render: (x) => (x[2] ? <b className="font-semibold">{x[0]}</b> : <span className="pl-3">{x[0]}</span>) }, { label: 'Amount', right: true, render: (x) => (x[2] ? <b className="font-semibold">{signed(x[1])}</b> : inr(x[1])) }]}
              rows={[
                ['Fees', s('fee')], ['Other income', s('otherIn')], ['Total income', inc, true],
                ...(pay ? [['Salaries', s('salary')], ['PF, ESI and professional tax', s('stat')]] : []), ...otherOutHeads.slice(0, 6), ['Everything else', s('otherOut') - sumBy(otherOutHeads.slice(0, 6), (x) => x[1])], ['Total expenses', exp, true],
              ]}
              foot={[`${inc >= exp ? 'Surplus for the period' : 'Shortfall for the period'}${pay ? '' : ' (without staff pay)'}`, signed(inc - exp)]} />
            <p className="px-5 py-3 border-t border-line text-[12.5px] text-ink3">Depreciation of {inr(Math.round(388800 * share('otherOut')))} is shown in the full accounts version (Accounts on).</p>
          </Card>
        )}

        {active === 'dept' && <>
          <Card>
            <CardHead title="Where the money went" sub={P.label} icon={I.Building2} />
            <div className="px-5 pb-5"><HBars rows={deptRows.map(([k, v]) => ({ k, v, label: inrShort(v) }))} max={Math.max(1, deptRows[0][1])} labelWidth={150} /></div>
          </Card>
          <Card className="overflow-hidden">
            {head(`${P.label} · cost centres from Finance Settings`)}
            <SimpleTable minWidth={460} rowKey={(x) => x[0]} cols={[{ label: 'Department', render: (x) => x[0] }, { label: 'Spent', right: true, render: (x) => inr(x[1]) }, { label: 'Share', right: true, render: (x) => `${pct(x[1], exp)}%` }]} rows={deptRows} foot={['All departments', inr(sumBy(deptRows, (x) => x[1])), '100%']} />
          </Card>
        </>}

        {active === 'exp' && (
          <Card className="overflow-hidden">
            {head(P.label, <Segmented size="sm" value={expBy} onChange={setExpBy} options={[{ value: 'head', label: 'Head' }, { value: 'vendor', label: 'Vendor' }, { value: 'approver', label: 'Approver' }]} />)}
            {expBy === 'head' && <SimpleTable minWidth={460} rowKey={(x) => x[0]} cols={[{ label: 'Expense head', render: (x) => x[0] }, { label: 'Paid', right: true, render: (x) => inr(x[1]) }, { label: 'Share', right: true, render: (x) => `${pct(x[1], s('otherOut'))}%` }]} rows={otherOutHeads} foot={['Total (without salary)', inr(s('otherOut')), '100%']} />}
            {expBy === 'vendor' && <SimpleTable minWidth={520} rowKey={(x) => x[0]} cols={[{ label: 'Vendor', render: (x) => x[0] }, { label: 'Bills', right: true, render: (x) => x[1] }, { label: 'Paid', right: true, render: (x) => inr(Math.round(x[2] * share('otherOut'))) }]}
              rows={[['Ratnadeep Wholesale (hostel mess)', 26, 946000], ['Sri Venkateswara Fuels (diesel)', 31, 785000], ['TSSPDCL (electricity)', 6, 492600], ['New India Assurance (bus insurance)', 1, 264000], ['Sri Sai Stationers', 14, 168400], ['CleanPro Hygiene Solutions', 7, 98300], ['Deccan Scientific Suppliers', 5, 96700], ['Ramesh Plumbing Works', 9, 41860]]} />}
            {expBy === 'approver' && <SimpleTable minWidth={520} rowKey={(x) => x[0]} cols={[{ label: 'Approved by', render: (x) => x[0] }, { label: 'Expenses', right: true, render: (x) => x[1] }, { label: 'Amount', right: true, render: (x) => inr(x[2]) }, { label: 'Sent back', right: true, render: (x) => x[3] }]}
              rows={[['Approved at once (up to ₹2,000)', 212, 168240, 0], ['Anita Sharma, School Admin', 96, 512800, 3], ['Lakshmi Rao, Principal', 58, 3187300, 4], ['K. Ramachandra Rao, Chairman', 2, 422420, 0]]} foot={['All', 368, inr(4290760), 7]} />}
          </Card>
        )}

        {active === 'pending' && (
          <Card className="overflow-hidden">
            {head('As on Fri 9 Oct 2026', canOpen(role, 'finance', 'expenses') && <Button size="sm" variant="ghost" onClick={() => go('finance', { page: 'expenses' })}>Open Expenses</Button>)}
            <SimpleTable minWidth={620} rowKey={(x) => x.id} cols={[{ label: 'Expense', render: (x) => <>{x.what}<span className="block text-[12px] text-ink3 font-mono">{x.id}</span></>, nowrap: false }, { label: 'Status', render: (x) => <ExpPill s={x.status} /> }, { label: 'Waiting on', render: (x) => (x.status === 'Waiting' ? approverFor(x.amt).split(' (')[0] : 'Payment') }, { label: 'Since', render: (x) => x.d }, { label: 'Amount', right: true, render: (x) => inr(x.amt) }]}
              rows={EXPENSES0.filter((x) => x.status === 'Waiting' || x.status === 'Approved')} foot={['Total', '', '', '', inr(sumBy(EXPENSES0.filter((x) => x.status === 'Waiting' || x.status === 'Approved'), (x) => x.amt))]} />
          </Card>
        )}

        {active === 'books' && (
          <Card className="overflow-hidden">
            {head('1 Apr 2026 (go-live) to 9 Oct 2026, 10:42 AM')}
            <SimpleTable minWidth={620} rowKey={(x) => x[0]} cols={[{ label: 'Account', render: (x) => x[0] }, { label: 'Opening 1 Apr', right: true, render: (x) => inr(x[1]) }, { label: 'Receipts', right: true, render: (x) => inr(x[2] - x[1] + x[3]) }, { label: 'Payments', right: true, render: (x) => inr(x[3]) }, { label: 'Closing', right: true, render: (x) => <b className="font-semibold">{inr(x[2])}</b> }]}
              rows={[['Cash in hand', 24150, OPEN9.cash + netOf(ROWS_9, 'cash'), CASH_PAY_FY], ['School account (SBI)', 4218600, OPEN9.sbi + netOf(ROWS_9, 'sbi'), 19264300], ['Trust account (HDFC)', 845300, OPEN9.hdfc + netOf(ROWS_9, 'hdfc'), 1488900]]} />
            <p className="px-5 py-3 border-t border-line text-[12.5px] text-ink3">Cash payments include deposits into the bank. Day by day detail is on Cash & Bank.</p>
          </Card>
        )}

        {active === 'daybook' && (
          <Card className="overflow-hidden">
            {head(`Daily totals · ${P.label}${pay ? '' : ' · without staff pay'}`)}
            <SimpleTable minWidth={600} rowKey={(x) => x[0]} cols={[{ label: 'Date', render: (x) => x[0] }, { label: 'Income', right: true, render: (x) => inr(x[1]) }, { label: 'Expense', right: true, render: (x) => inr(x[2]) }, { label: 'Net', right: true, render: (x) => <b className={cx('font-semibold', x[1] - x[2] < 0 && 'text-bad')}>{signed(x[1] - x[2])}</b> }, { label: 'Day', render: (x) => <Pill tone={x[3] === 'Closed' ? 'neutral' : x[3] === 'Open' ? 'info' : 'bad'}>{x[3]}</Pill> }]}
              rows={['2026-10-09', '2026-10-08', '2026-10-02', '2026-09-30'].filter((k) => inPeriod(k, per)).map((k) => { const d = DAYS[k]; const i = sumBy(d.fees.filter((e) => e.status === 'Posted'), (e) => e.total) + sumBy(d.reversals, (e) => e.total) + sumBy(d.income, (e) => e.total); const o = sumBy(d.expenses, (e) => e.total) + (pay ? sumBy(d.salary, (e) => e.total) : 0); return [d.label.split(' · ')[0], i, o, k === '2026-10-09' ? 'Open' : k === '2026-10-08' ? 'Not closed' : 'Closed']; })} />
            <p className="px-5 py-3 border-t border-line text-[12.5px] text-ink3">Pick any date or range in the export. The totals match the Day Book page.</p>
          </Card>
        )}

        {active === 'budget' && <Card><Empty icon={I.Gauge} title="Budgets are switched off" body="Switch budgets on to see each head’s budget against what was spent, with alerts at 80% and 100%." action={canOpen(role, 'finance', 'budget') && <Button variant="secondary" onClick={() => go('finance', { page: 'budget' })}>Open Budget</Button>} /></Card>}

        {active === 'tb' && (
          <Card className="overflow-hidden">
            {head('As on Fri 9 Oct 2026, 10:42 AM · Kukatpally campus')}
            <SimpleTable minWidth={520} rowKey={(x) => x.k} cols={[{ label: 'Account', render: (x) => x.k }, { label: 'Debit', right: true, render: (x) => (x.dr ? inr(x.dr) : '') }, { label: 'Credit', right: true, render: (x) => (x.cr ? inr(x.cr) : '') }]}
              rows={tbRows} foot={['Total', inr(sumBy(tbRows, (x) => x.dr)), inr(sumBy(tbRows, (x) => x.cr))]} />
          </Card>
        )}
      </ReportsFrame>
      )}
    </div>
  );
}

/* =========================================================================================
   Finance Settings
   ========================================================================================= */
const MONTH_CLOSE0 = [['April 2026', true, '8 May'], ['May 2026', true, '6 Jun'], ['June 2026', true, '7 Jul'], ['July 2026', true, '6 Aug'], ['August 2026', true, '7 Sep'], ['September 2026', false, null]];

function SettingsPage() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const { go } = useNav();
  const { role } = useRole();
  const [start, setStart] = useState('April');
  const [heads, setHeads] = useState(HEADS);
  const [hidden, setHidden] = useState(new Set(['Staff welfare']));
  const [months, setMonths] = useState(MONTH_CLOSE0);
  const [closeM, setCloseM] = useState(null);
  const [adding, setAdding] = useState(false);
  const [group, setGroup] = useState('all');
  const [cc, setCc] = useState(true);
  const [tally, setTally] = useState(true);
  const [tallyP, setTallyP] = useState('Sep');
  const save = (title, body) => toast({ title, body: body || 'Saved. Recorded in the audit log.' });
  const groups = [...new Set(heads.map((h) => h.group))];
  return (
    <div>
      <ModuleHead sub="Financial year, heads, approval limits, cost centres and Tally. Every change is logged." />
      <div className="grid @xl:grid-cols-2 gap-5 @lg:gap-6 items-start">
        <Col>
          <Card>
            <CardHead title="Financial year" sub="Kept apart from the academic year (June to May)" icon={I.CalendarRange} />
            <div className="px-5 pb-4 flex flex-col gap-3">
              <Field label="Year starts in" id="fs-start" hint={`So the year runs ${start} to ${['April', 'January', 'June'].includes(start) ? { April: 'March', January: 'December', June: 'May' }[start] : ''}. The Day Book, cash and bank books, budgets and reports use it.`}>
                <Select id="fs-start" value={start} onChange={(v) => { if (!canEdit) return; setStart(v); save(`Financial year starts in ${v}`, v === 'April' ? 'April to March, as Indian accounts need' : 'Takes effect from the next financial year. 2026–27 stays April to March.'); }} options={['April', 'January', 'June']} />
              </Field>
              <ul>
                <Line k="2026–27 · 1 Apr 2026 to 31 Mar 2027" v={<Pill tone="ok">Open</Pill>} />
                <Line k="2025–26 · before School OS" v={<Pill tone="neutral">Closed</Pill>} />
              </ul>
            </div>
          </Card>

          <Card>
            <CardHead title="Month close" sub="A closed month cannot change. Mistakes go in as adjustments in an open month." icon={I.Lock} />
            <ul className="px-5 pb-4">
              {months.map(([m, done, on]) => (
                <li key={m} className="flex items-center justify-between gap-3 py-2.5 border-t border-line/70 first:border-0 text-[14px]">
                  <span>{m}{done && <span className="block text-[12px] text-ink3">Closed {on} by Suresh Babu</span>}</span>
                  {done ? <Pill tone="neutral"><I.Lock size={12} />Closed</Pill> : canEdit ? <Button size="sm" variant="secondary" onClick={() => setCloseM(m)}>Close month</Button> : <Pill tone="warn">Open</Pill>}
                </li>
              ))}
            </ul>
            <div className="border-t border-line/70"><SettingRow title="Close each day after counting cash" sub="The Day Book locks a day once the cash is counted">{canEdit ? <Switch on label="Close each day" onChange={() => save('Daily close stays on', 'The Principal can switch it off in Settings, Forms & Approvals')} /> : <Pill tone="ok">On</Pill>}</SettingRow></div>
          </Card>

          <Card className="overflow-hidden">
            <CardHead title="Chart of accounts" sub={`${heads.length} heads with codes · used on income, expenses and reports`} icon={I.ListTree} action={canEdit && <Button size="sm" variant="soft" icon={I.Plus} onClick={() => setAdding(true)}>Add head</Button>} />
            <div className="px-3 pb-3 overflow-x-auto no-scrollbar"><Segmented size="sm" className="w-max" value={group} onChange={setGroup} options={[{ value: 'all', label: 'All' }, { value: 'in', label: 'Income' }, { value: 'out', label: 'Expense' }]} /></div>
            <div className="border-t border-line/70">
              {groups.filter((g) => group === 'all' || heads.find((h) => h.group === g).kind === group).map((g) => (
                <div key={g}>
                  <p className="eyebrow text-ink3 px-5 pt-3 pb-1">{g}</p>
                  <ul className="px-5 pb-1">
                    {heads.filter((h) => h.group === g).map((h) => (
                      <li key={h.code} className="flex items-center gap-3 py-2 text-[14px]">
                        <span className="font-mono text-[12.5px] text-ink3 w-10 shrink-0">{h.code}</span>
                        <span className="flex-1 min-w-0 truncate">{h.name}</span>
                        {h.from ? <Pill tone="info" className="!h-5 !text-[11px]">From {h.from}</Pill> : <span className="text-[12px] text-ink3 tnum">{inrShort(h.fy)}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
        </Col>

        <Col>
          <Card>
            <CardHead title="Expense categories" sub="The heads shown on the Record expense form. Tap to show or hide." icon={I.Tags} />
            <div className="px-5 pb-5 flex flex-wrap gap-2">
              {OUT_HEADS.map((h) => <Chip key={h} on={!hidden.has(h)} disabled={!canEdit} onClick={() => { const off = !hidden.has(h); setHidden((x) => { const n = new Set(x); n.has(h) ? n.delete(h) : n.add(h); return n; }); save(`${h}: ${off ? 'hidden from' : 'shown on'} the expense form`); }}>{h}</Chip>)}
            </div>
          </Card>

          <Card>
            <CardHead title="Approval limits" sub="Stored in Settings, Forms & Approvals" icon={I.ShieldCheck} action={canEdit && canDoPage(role, 'settings', 'forms') && <Button size="sm" variant="ghost" icon={I.ExternalLink} onClick={() => go('settings', { page: 'forms' })}>Change</Button>} />
            <ul className="px-5 pb-4">
              <Line k="Expenses up to ₹2,000" v={<Pill tone="ok">Approved at once</Pill>} />
              <Line k="Expenses up to ₹10,000" v={<Pill tone="info">School Admin</Pill>} />
              <Line k="Expenses up to ₹1,00,000" v={<Pill tone="info">Principal</Pill>} />
              <Line k="Expenses above ₹1,00,000" v={<Pill tone="info">Chairman</Pill>} />
              <Line k="Purchases above ₹25,000" v={<Pill tone="info">Principal</Pill>} />
              <Line k="Change to an opening balance" v={<Pill tone="info">Principal</Pill>} />
            </ul>
          </Card>

          <SettingsCard title="Bills and cash" icon={I.ReceiptText} rows={[
            { title: 'Bill photo needed above', sub: 'Expenses cannot be paid without it', value: inr(BILL_ABOVE) },
            { title: 'Warn before cash in hand goes below zero', on: true },
            { title: 'Flag bills split to stay under a limit', sub: 'Same vendor, same day, each under ₹2,000', on: true },
            { title: 'Expense numbers', value: <span className="font-mono text-[13px]">EXP/26/0450 next</span> },
          ]} />

          <Card>
            <CardHead title="Cost centres" sub="Departments that expenses and budgets are tagged to" icon={I.Building2}
              action={<Switch id="fs-cc" on={cc} label="Cost centres" onChange={(v) => { if (!canEdit) return; setCc(v); save(`Cost centres ${v ? 'on' : 'off'}`, v ? 'Department shows on the expense form and in reports' : 'Department is hidden on the expense form'); }} />} />
            {cc ? <div className="px-5 pb-5 flex flex-wrap gap-2">{DEPTS.map((d) => <span key={d} className="inline-flex items-center h-8 px-3 rounded-full bg-sunken text-[13px] font-semibold">{d}</span>)}{canEdit && <Button size="sm" variant="ghost" icon={I.Plus} onClick={() => save('Add cost centre', 'Type a name, like “Science labs”')}>Add</Button>}</div>
              : <p className="px-5 pb-4 text-[13.5px] text-ink3">Off. Expenses are not tagged to a department.</p>}
          </Card>

          <Card>
             <CardHead title="Cash and bank accounts" icon={I.Landmark} action={canOpen(role, 'finance', 'cashbank') && <Button size="sm" variant="ghost" icon={I.ArrowRight} onClick={() => go('finance', { page: 'cashbank' })}>Cash & Bank</Button>} />
            <ul className="px-5 pb-4">{ACCTS0.map((a) => <Line key={a.id} k={<><b className="font-semibold text-ink">{a.name}</b><span className="block text-[12px] text-ink3">{a.sub}</span></>} v={a.main ? <Pill tone="brand">Main</Pill> : ''} />)}</ul>
          </Card>

          <SettingsCard title="Optional pages" sub="Also in Settings, Modules On/Off" icon={I.SlidersHorizontal} rows={[
            { title: 'Budget', sub: 'Budgets by head and department, with alerts', on: false },
            { title: 'Accounts', sub: 'Journal entries, ledger, payables, receivables', on: true },
            { title: 'Vendor bills', sub: 'Record bills now, pay later', on: true },
            { title: 'Import past expenses', sub: 'For schools starting part way through the year. Kept as “Brought in”, never in the Day Book.', on: false },
          ]} />

          <Card>
            <CardHead title="Tally export" sub="For the auditor. The connection is in Settings, Modules On/Off." icon={I.FileSpreadsheet}
              action={<Switch id="fs-tally" on={tally} label="Tally export" onChange={(v) => { if (!canEdit) return; setTally(v); save(`Tally export ${v ? 'on' : 'off'}`); }} />} />
            {tally ? (
              <div className="px-5 pb-5 flex flex-col gap-3">
                <SimpleTable minWidth={300} rowKey={(x) => x[0]} cols={[{ label: 'School OS head', render: (x) => x[0] }, { label: 'Tally ledger', render: (x) => <span className="font-mono text-[12.5px]">{x[1]}</span> }]}
                  rows={[['Tuition fee', 'Tuition Fees Received'], ['Transport fee', 'Bus Fees Received'], ['Salaries', 'Salary A/c'], ['Electricity', 'Electricity Charges'], ['Diesel', 'Vehicle Fuel'], ['Cash in hand', 'Cash']]} />
                <p className="text-[12.5px] text-ink3">36 of 36 heads matched · last export Thu 1 Oct, 1,284 vouchers for September</p>
                <div className="flex gap-2 flex-wrap items-center">
                  <Segmented size="sm" value={tallyP} onChange={setTallyP} options={[{ value: 'Sep', label: 'September' }, { value: 'Oct', label: 'October so far' }]} />
                  <Button size="sm" variant="secondary" icon={I.Download} onClick={() => toast({ title: `Tally vouchers for ${tallyP === 'Sep' ? 'September' : '1–9 October'} downloaded`, body: `${tallyP === 'Sep' ? '1,284' : '402'} vouchers in Tally XML. Logged in the export log.` })}>Download vouchers</Button>
                </div>
              </div>
            ) : <p className="px-5 pb-4 text-[13.5px] text-ink3">Off. The school does not use outside accounting software.</p>}
          </Card>
        </Col>
      </div>

      <ConfirmSheet open={!!closeM} onClose={() => setCloseM(null)} title={closeM ? `Close ${closeM}?` : ''} confirmLabel={closeM ? `Close ${closeM}` : ''}
        sub="Every day in the month must be closed first. After this, nothing dated in the month can be added, changed or cancelled. The Principal can reopen it with a reason."
        onConfirm={() => { const m = closeM; setMonths((x) => x.map((r) => (r[0] === m ? [r[0], true, '9 Oct'] : r))); toast({ title: `${m} closed`, body: 'Its books are now read only. Recorded in the audit log.', undo: () => setMonths((x) => x.map((r) => (r[0] === m ? [r[0], false, null] : r))) }); }}>
        <Banner tone="warn" title="Thu 8 Oct is not closed yet,">but it is in October, so September can still close.</Banner>
      </ConfirmSheet>
      <AddHeadSheet open={adding} onClose={() => setAdding(false)} heads={heads} onAdd={(h) => setHeads((x) => [...x, h].sort((a, b) => a.code.localeCompare(b.code)))} />
    </div>
  );
}

function AddHeadSheet({ open, onClose, heads, onAdd }) {
  const toast = useToast();
  const [kind, setKind] = useState('out');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [group, setGroup] = useState('Office');
  const [tried, setTried] = useState(false);
  const groupsOf = (k) => [...new Set(heads.filter((h) => h.kind === k).map((h) => h.group))];
  const dupName = heads.find((h) => h.name.toLowerCase() === name.trim().toLowerCase());
  const dupCode = heads.find((h) => h.code === code.trim());
  const err = {
    name: !name.trim() ? 'Give the head a name' : dupName ? `“${dupName.name}” already exists (${dupName.code})` : '',
    code: !/^\d{4}$/.test(code.trim()) ? 'Codes have 4 digits' : (kind === 'in' ? !code.startsWith('4') : !code.startsWith('5')) ? `${kind === 'in' ? 'Income' : 'Expense'} codes start with ${kind === 'in' ? 4 : 5}` : dupCode ? `${code} is used by ${dupCode.name}` : '',
  };
  const close = () => { onClose(); setName(''); setCode(''); setTried(false); };
  return (
    <FormSheet open={open} onClose={close} title="Add head" sub="To the chart of accounts" submitLabel="Add head"
      onSubmit={() => { setTried(true); if (err.name || err.code) return false; onAdd({ code: code.trim(), name: name.trim(), group, kind, fy: 0, dept: 'Administration' }); toast({ title: `${name.trim()} added · ${code.trim()}`, body: kind === 'out' ? 'Shown on the Record expense form from now' : 'Shown on the Record income form from now' }); setName(''); setCode(''); setTried(false); }}>
      <Field label="Type" required><Segmented value={kind} onChange={(k) => { setKind(k); setGroup(groupsOf(k)[0]); }} className="w-full" options={[{ value: 'in', label: 'Income' }, { value: 'out', label: 'Expense' }]} /></Field>
      <Field label="Name" required id="ah-name" error={(tried || dupName) && err.name}><Input id="ah-name" value={name} onChange={(e) => setName(e.target.value)} error={(tried || dupName) && err.name} placeholder={kind === 'out' ? 'Science fair' : 'Summer camp fees'} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Code" required id="ah-code" error={(tried || (code.length === 4 && err.code)) && err.code} hint={!err.code ? 'Free' : undefined}><Input id="ah-code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))} error={(tried || code.length === 4) && err.code} className="tnum" placeholder={kind === 'out' ? '5350' : '4280'} /></Field>
        <Field label="Group" required id="ah-group"><Select id="ah-group" value={group} onChange={setGroup} options={groupsOf(kind)} /></Field>
      </div>
    </FormSheet>
  );
}

/* =========================================================================================
   Pages
   ========================================================================================= */
export const FINANCE_PAGES = {
  daybook: DayBookPage,
  income: IncomePage,
  expenses: ExpensesPage,
  cashbank: CashBankPage,
  budget: BudgetPage,
  accounts: AccountsPage,
  reports: ReportsPage,
  settings: SettingsPage,
};
