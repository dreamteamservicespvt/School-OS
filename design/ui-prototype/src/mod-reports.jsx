// Reports & Analytics: every report in one place, analytics, early warnings, government returns, custom and scheduled reports.
// Spec: blueprint/modules/19-reports-analytics.md. Example data only (Sunrise Public School, 2026–27, today Fri 9 Oct 2026).
import React, { useEffect, useMemo, useState } from 'react';
import * as I from './icons.js';
import { STUDENTS, CLASSES, FEATURED, ATT_BY_CLASS, FEE_TREND, inr } from './data.js';
import { STAFF } from './sample.js';
import { SCHOOLS_IN_GROUP } from './config.js';
import { cx, Card, CardHead, Button, Pill, Avatar, Input, Field, Segmented, Empty, Sheet, Switch, Spinner, Checkbox, useToast } from './ui.jsx';
import { useNav, useRole } from './shell.jsx';
import {
  ModuleHead, usePage, useCanEdit, Stats, SearchBox, Toolbar, Select, Textarea, Chips, DataList, Banner, Suggestion, Progress,
  HBars, Bars, Legend, Timeline, MoreMenu, FormSheet, ConfirmSheet, Split, Col, TONE_SOFT,
  DatePeriod, PERIODS as DP, fmtRange, periodDays,
} from './kit.jsx';
import { DEFAULTERS, SimpleTable, clsOf } from './mod-fees.jsx';

/* =========================================================================================
   Sample data
   ========================================================================================= */
const CLS_IDS = ['NUR', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
const STRENGTH = { NUR: 62, LKG: 84, UKG: 88, 1: 96, 2: 98, 3: 94, 4: 96, 5: 92, 6: 98, 7: 102, 8: 96, 9: 118, 10: 112 };
const TOTAL = CLS_IDS.reduce((a, id) => a + STRENGTH[id], 0); // 1,236
const CLS_NAME = (id) => CLASSES.find((c) => c.id === id)?.name || id;
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const sum = (rows, i) => rows.reduce((a, r) => a + (Number(r[i]) || 0), 0);

// Who sees which report categories (reports run with the person's permissions)
const MONEY = ['Fees', 'Finance', 'Salary'];
const CATS = ['Students', 'Admissions', 'Attendance', 'Fees', 'Finance', 'Exams', 'Staff and HR', 'Salary', 'Communication', 'Transport', 'Library', 'Inventory', 'Hostel', 'Front Office', 'Homework', 'Events', 'Tasks'];
const CAT_ICON = { Students: 'GraduationCap', Admissions: 'UserPlus', Attendance: 'CalendarCheck2', Fees: 'IndianRupee', Finance: 'Landmark', Exams: 'ClipboardCheck', 'Staff and HR': 'Users', Salary: 'Wallet', Communication: 'MessagesSquare', Transport: 'Bus', Library: 'Library', Inventory: 'Boxes', Hostel: 'BedDouble', 'Front Office': 'DoorOpen', Homework: 'NotebookPen', Events: 'CalendarDays', Tasks: 'ListTodo' };
const CAT_MOD = { Students: 'students', Admissions: 'admissions', Attendance: 'attendance', Fees: 'fees', Finance: 'finance', Exams: 'exams', 'Staff and HR': 'staff', Salary: 'salary', Communication: 'communication', Transport: 'transport', Library: 'library', Inventory: 'inventory', Hostel: 'hostel', 'Front Office': 'frontoffice', Homework: 'homework', Events: 'events', Tasks: 'dashboard' };
// 05-roles.md: Accountant money reports only; Teacher and Class Teacher their own classes; Academic Head academic only;
// HR staff only; Exam In-charge exam only; Admission Counsellor admission only; Vice Principal sees everything but salary.
const ROLE_CATS = {
  accountant: MONEY,
  teacher: ['Students', 'Attendance', 'Exams', 'Homework', 'Events'],
  classteacher: ['Students', 'Attendance', 'Exams', 'Homework', 'Events'],
  hr: ['Staff and HR', 'Attendance'],
  academichead: ['Attendance', 'Exams', 'Homework', 'Events'],
  examincharge: ['Exams'],
  admissioncounsellor: ['Admissions'],
  vp: CATS.filter((c) => c !== 'Salary'),
};
// Reports inside an allowed category that are still not for the role
const ROLE_ONLY = { hr: { Attendance: ['at-staff'] } };
const ROLE_NOT = {
  teacher: ['st-life', 'st-docs', 'st-demo', 'at-staff'],
  classteacher: ['st-life', 'st-docs', 'st-demo', 'at-staff'],
  academichead: ['at-staff'],
};
const ROLE_NOTE = {
  accountant: ['Money reports only.', 'Fees, Finance and Salary, filtered by financial year (April to March).'],
  hr: ['Staff reports only.', 'Staff list, leave, joiners and leavers, and staff attendance. Salary figures stay in Salary Management.'],
  academichead: ['Academic reports only.', 'Attendance, exams, homework and PTM, for every class.'],
  examincharge: ['Exam reports only.', 'Results, toppers and students below 33%, for every class.'],
  admissioncounsellor: ['Admission reports only.', 'Enquiries to admissions, and seats by class.'],
  vp: ['Everything except salary.', 'Salary reports stay with the Principal, School Admin and Accountant.'],
};
const TEACHER_CLASSES = { teacher: ['6 A', '6 B', '7 A', '7 B'], classteacher: ['7 B'] };
function useScope() {
  const { role, modulesOn = {} } = useRole();
  const cats = (ROLE_CATS[role.id] || CATS).filter((c) => modulesOn[CAT_MOD[c]] !== false);
  const classes = TEACHER_CLASSES[role.id] || null;
  const inScope = (v) => !classes || classes.some((sc) => sc === v || sc.startsWith(String(v).replace('Class ', '') + ' '));
  const allowed = (r) => cats.includes(r.cat) && !(ROLE_NOT[role.id] || []).includes(r.id) && (!ROLE_ONLY[role.id]?.[r.cat] || ROLE_ONLY[role.id][r.cat].includes(r.id));
  return { role, cats, classes, inScope, allowed, money: cats.some((c) => MONEY.includes(c)) };
}

// The catalogue. dated: has a date range. heavy: all classes runs in the background. cls: column index holding the class.
const CATALOGUE = [
  { id: 'st-master', cat: 'Students', name: 'Student master list', sub: 'Every student with class, admission no., father and phone', cls: 1 },
  { id: 'st-demo', cat: 'Students', name: 'Demographics', sub: 'Boys and girls, and social category, class by class', cls: 0 },
  { id: 'st-life', cat: 'Students', name: 'Student lifecycle', sub: 'How many are active, new, inactive or left, and what changed' },
  { id: 'st-transfer', cat: 'Students', name: 'Transfers between sections', sub: 'Students who moved section or class this year', cls: 1, dated: true },
  { id: 'st-withdraw', cat: 'Students', name: 'Withdrawals and TCs', sub: 'Who left, when, why, and whether the TC is issued', cls: 1, dated: true },
  { id: 'st-docs', cat: 'Students', name: 'Document status', sub: 'Which papers are still missing, and for how many students' },
  { id: 'ad-funnel', cat: 'Admissions', name: 'Enquiries to admissions', sub: 'How many enquiries became admissions, by where they came from', dated: true },
  { id: 'ad-seats', cat: 'Admissions', name: 'Seats by class, 2027–28', sub: 'Seats, admitted, waiting and still free', cls: 0 },
  { id: 'at-daily', cat: 'Attendance', name: 'Daily attendance', sub: 'Present, absent and late in each class for one day', cls: 0 },
  { id: 'at-monthly', cat: 'Attendance', name: 'Monthly attendance register', sub: 'Each student’s days present and absent in the month', cls: 1, dated: true, heavy: true },
  { id: 'at-low', cat: 'Attendance', name: 'Students below 80%', sub: 'Who is close to the 75% line this year', cls: 1 },
  { id: 'at-staff', cat: 'Attendance', name: 'Staff attendance', sub: 'Staff present, late and on leave, by department', dated: true },
  { id: 'fe-collection', cat: 'Fees', name: 'Fee collection', sub: 'Due and collected, class by class', cls: 0, money: true },
  { id: 'fe-defaulter', cat: 'Fees', name: 'Fee defaulters', sub: 'Who has overdue fees, how much and for how long', cls: 1, money: true },
  { id: 'fe-modes', cat: 'Fees', name: 'Payments by mode', sub: 'UPI, online, cash, cheque and others', money: true, dated: true },
  { id: 'fe-concession', cat: 'Fees', name: 'Concessions and scholarships', sub: 'How much was taken off fees, and why', money: true },
  { id: 'fe-gst', cat: 'Fees', name: 'GST report', sub: 'Taxable fee heads, tax invoices and GST by rate and month', money: true },
  { id: 'fi-daybook', cat: 'Finance', name: 'Day Book', sub: 'Every receipt and payment, day by day', money: true, dated: true, heavy: true },
  { id: 'fi-ie', cat: 'Finance', name: 'Income and expense', sub: 'Money in against money out, month by month', money: true },
  { id: 'fi-cash', cat: 'Finance', name: 'Cash and bank book', sub: 'Opening, in, out and closing for each account', money: true, dated: true },
  { id: 'ex-results', cat: 'Exams', name: 'Class results', sub: 'Pass % and average marks by class, Unit Test 2', cls: 0 },
  { id: 'ex-below', cat: 'Exams', name: 'Students below 33%', sub: 'Who failed a subject in Unit Test 2', cls: 1 },
  { id: 'ex-toppers', cat: 'Exams', name: 'Toppers', sub: 'Top student in each class, Unit Test 2', cls: 0 },
  { id: 'hr-list', cat: 'Staff and HR', name: 'Staff list', sub: 'All staff with department, role and date of joining' },
  { id: 'hr-leave', cat: 'Staff and HR', name: 'Leave taken', sub: 'Casual, sick and earned leave used by each person', dated: true },
  { id: 'hr-moves', cat: 'Staff and HR', name: 'Joiners and leavers', sub: 'Who joined and who left this year' },
  { id: 'sa-register', cat: 'Salary', name: 'Salary register', sub: 'Gross, deductions and net pay, month by month', money: true },
  { id: 'sa-pfesi', cat: 'Salary', name: 'PF and ESI statements', sub: 'Monthly statements in the EPFO and ESIC portal formats', money: true },
  { id: 'co-delivery', cat: 'Communication', name: 'Message delivery', sub: 'Sent, delivered, read and failed messages', dated: true },
  { id: 'tr-route', cat: 'Transport', name: 'Students by route', sub: 'Students, seats and free seats on each bus' },
  { id: 'tr-delay', cat: 'Transport', name: 'Late trips', sub: 'Trips more than 10 minutes late, by route', dated: true },
  { id: 'li-overdue', cat: 'Library', name: 'Overdue books', sub: 'Books not returned on time, with the fine so far', cls: 2 },
  { id: 'li-class', cat: 'Library', name: 'Books issued by class', sub: 'How many books each class reads' },
  { id: 'in-stock', cat: 'Inventory', name: 'Stock in hand', sub: 'Items, quantity and what needs reordering' },
  { id: 'in-assets', cat: 'Inventory', name: 'Asset register', sub: 'Assets with location, purchase date and value' },
  { id: 'ho-beds', cat: 'Hostel', name: 'Room occupancy', sub: 'Beds filled and free in each block' },
  { id: 'fo-visitors', cat: 'Front Office', name: 'Visitor log summary', sub: 'Visitors by day and why they came', dated: true },
  { id: 'hw-submit', cat: 'Homework', name: 'Homework submitted on time', sub: 'Homework given and the share handed in on time', cls: 0, dated: true },
  { id: 'ev-ptm', cat: 'Events', name: 'PTM attendance', sub: 'Parents who came to the parent–teacher meeting', cls: 0 },
  { id: 'ta-open', cat: 'Tasks', name: 'Open tasks', sub: 'Tasks not done yet, by person and how late' },
];
const REPORT = Object.fromEntries(CATALOGUE.map((r) => [r.id, r]));

/* ---------- Report previews: cols [label, kind], rows as arrays ---------- */
const PILL_TONE = { Issued: 'ok', 'Not yet': 'warn', Applied: 'info', OK: 'ok', Low: 'warn', 'Order now': 'bad', Done: 'ok', Late: 'bad', Active: 'ok', New: 'brand', Inactive: 'neutral' };
const fmt = (v, k) => (k === 'inr' ? inr(v) : k === 'pct' ? `${v}%` : k === 'n' ? Number(v).toLocaleString('en-IN') : k === 'pill' ? <Pill tone={PILL_TONE[v] || 'neutral'}>{v}</Pill> : v);
const NUMERIC = ['inr', 'pct', 'n'];

// Deterministic class-wise fee figures that add up to the Dashboard: ₹2.84 Cr due, ₹2.33 Cr collected
const TUI = { NUR: 36000, LKG: 38000, UKG: 38000, 1: 39200, 2: 39200, 3: 50000, 4: 50000, 5: 50000, 6: 78000, 7: 78000, 8: 82000, 9: 92000, 10: 92000 };
const FEE_BY_CLASS = (() => {
  const w = CLS_IDS.map((id) => STRENGTH[id] * TUI[id]); const W = w.reduce((a, b) => a + b, 0);
  const rate = [0.86, 0.85, 0.85, 0.84, 0.84, 0.83, 0.83, 0.82, 0.81, 0.82, 0.8, 0.79, 0.8];
  let d = 0, c = 0;
  return CLS_IDS.map((id, i) => {
    const last = i === CLS_IDS.length - 1;
    const due = last ? 28400000 - d : Math.round((28400000 * w[i]) / W / 100) * 100;
    const col = last ? 23330000 - c : Math.round((due * rate[i]) / 100) * 100;
    d += due; c += col;
    return [CLS_NAME(id), due, col, due - col, pct(col, due)];
  });
})();
const ABSENT_TODAY = { NUR: 4, LKG: 5, UKG: 4, 1: 3, 2: 2, 3: 3, 4: 3, 5: 4, 6: 4, 7: 4, 8: 3, 9: 10, 10: 3 }; // 52 in all
const LATE_TODAY = { NUR: 0, LKG: 1, UKG: 0, 1: 1, 2: 0, 3: 1, 4: 0, 5: 1, 6: 1, 7: 1, 8: 1, 9: 2, 10: 0 }; // 9 in all
const gst = (amt, rate) => Math.round((amt * rate) / (100 + rate));

// 33 students below 33% in at least one subject, Unit Test 2 (Classes 6–10)
const BELOW_33 = (() => {
  const base = [['Rahul Verma', '7 A', 'Mathematics, Science', 28, 'Imran Shaikh'], ['Sneha Das', '7 A', 'Mathematics', 30, 'Imran Shaikh'], ['Yash Kumar', '7 A', 'Mathematics', 32, 'Imran Shaikh'], ['Nikhil Goud', '9 B', 'Mathematics', 24, 'Swapna Reddy'], ['Riya Chowdary', '9 C', 'Science', 29, 'Farhana Begum'], ['Arjun Pillai', '8 B', 'Hindi', 30, 'Deepak Verma'], ['Tanvi Singh', '10 B', 'Mathematics', 31, 'Arvind Rao']];
  const subj = ['Mathematics', 'Science', 'Hindi', 'Social Studies', 'English', 'Telugu'];
  const lv = (c) => Number(c);
  const teacher = (sb, c) => ({ Mathematics: lv(c) <= 7 ? 'Imran Shaikh' : lv(c) === 8 ? 'Srinivas Chary' : lv(c) === 9 ? 'Swapna Reddy' : 'Arvind Rao', Science: lv(c) === 6 ? 'Pallavi Reddy' : lv(c) === 7 ? 'Ravi Teja' : lv(c) === 8 ? 'Bhargavi Kulkarni' : 'Farhana Begum', Hindi: lv(c) <= 7 ? 'Shobha Rani' : 'Deepak Verma', 'Social Studies': 'Venkat Rao', English: lv(c) <= 7 ? 'Rajeshwari Nair' : lv(c) === 8 ? 'Nandini Joshi' : 'Anitha Kumari', Telugu: [6, 8].includes(lv(c)) ? 'Lalitha Devi' : 'Mahesh Goud' }[sb]);
  const taken = new Set(base.map((b) => b[0]));
  const pool = STUDENTS.filter((s) => ['6', '7', '8', '9', '10'].includes(s.clsId) && s.id !== FEATURED.id && !taken.has(s.name) && taken.add(s.name));
  const more = Array.from({ length: 26 }, (_, i) => { const s = pool[Math.floor((i * pool.length) / 26)]; const sb = subj[i % subj.length]; return [s.name, clsOf(s), sb, 18 + ((i * 7) % 15), teacher(sb, s.clsId)]; });
  return [...base, ...more];
})();

function previewOf(id) {
  switch (id) {
    case 'st-master': return {
      cols: [['Student'], ['Class'], ['Admission no.'], ['Father'], ['Phone'], ['Status', 'pill']],
      rows: STUDENTS.map((s) => [s.name, clsOf(s), s.adm, s.father, s.phone, s.status, s.clsId]), clsId: 6, total: (cls) => (cls === 'all' ? TOTAL : STRENGTH[cls]) };
    case 'st-demo': return {
      cols: [['Class'], ['Students', 'n'], ['Boys', 'n'], ['Girls', 'n'], ['General', 'n'], ['OBC', 'n'], ['SC', 'n'], ['ST', 'n'], ['EWS', 'n']],
      rows: CLS_IDS.map((id) => { const n = STRENGTH[id]; const b = Math.round(n * 0.52); const g = Math.round(n * 0.38), o = Math.round(n * 0.41), sc = Math.round(n * 0.1), st = Math.round(n * 0.04); return [CLS_NAME(id), n, b, n - b, g, o, sc, st, n - g - o - sc - st]; }),
      foot: (rows) => ['All classes', ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => sum(rows, i))] };
    case 'st-life': return {
      cols: [['Status'], ['Students', 'n'], ['Since 1 Jun 2026'], ['Note']],
      rows: [['Active', 1236, '+48', 'On the rolls today'], ['New this year', 142, '+142', 'Admitted for 2026–27'], ['Inactive', 6, '+2', 'Absent over 30 days, still on the rolls'], ['Left during the year', 31, '+31', 'TC issued or withdrawn'], ['Passed out, Class 10', 104, '', 'Board exam, March 2026']] };
    case 'st-transfer': return {
      cols: [['Student'], ['From'], ['To'], ['Date'], ['Reason']],
      rows: [['Kavya Reddy', '6 A', '6 B', '15 Jun', 'Sibling in 6 A'], ['Rohan Naidu', '8 B', '8 A', '22 Jun', 'Second language change'], ['Ishaan Rao', '9 C', '9 A', '6 Jul', 'Section balance'], ['Pooja Gupta', '4 B', '4 A', '3 Aug', 'Parent request'], ['Tejas Iyer', '7 A', '7 B', '1 Sep', 'Bus route timing']] };
    case 'st-withdraw': return {
      cols: [['Student'], ['Class'], ['Left on'], ['Reason'], ['TC', 'pill']],
      rows: [['Aditya Menon', '5 A', '12 Jun', 'Family moved to Pune', 'Issued'], ['Sahithi Varma', '8 B', '30 Jun', 'Joined a residential school', 'Issued'], ['Charan Pillai', 'UKG B', '18 Jul', 'Closer school', 'Issued'], ['Diya Joshi', '9 A', '14 Aug', 'Family moved abroad', 'Issued'], ['Varun Shetty', '3 B', '28 Sep', 'Fee difficulty', 'Not yet'], ['Bhavya Das', '6 B', '5 Oct', 'Family moved to Bengaluru', 'Applied']] };
    case 'st-docs': return {
      cols: [['Document'], ['Collected', 'n'], ['Missing', 'n'], ['Needed from', 'n'], ['Collected %', 'pct']],
      rows: [['Birth certificate', 1231, 5, 1236], ['Aadhaar card (student)', 1219, 17, 1236], ['Transfer certificate (previous school)', 402, 9, 411], ['Passport photo', 1236, 0, 1236], ['Medical fitness certificate', 1180, 56, 1236], ['Caste certificate', 708, 54, 762]].map((r) => [...r, pct(r[1], r[3])]) };
    case 'ad-funnel': return {
      cols: [['Came from'], ['Enquiries', 'n'], ['Visited', 'n'], ['Applied', 'n'], ['Admitted', 'n'], ['Became admissions', 'pct']],
      rows: [['Walk-in', 96, 81, 58, 41], ['Website', 74, 39, 26, 17], ['Phone', 61, 34, 22, 14], ['Parent referral', 38, 33, 27, 22], ['Social media', 52, 18, 9, 5]].map((r) => [...r, pct(r[4], r[1])]),
      foot: (rows) => ['All', sum(rows, 1), sum(rows, 2), sum(rows, 3), sum(rows, 4), pct(sum(rows, 4), sum(rows, 1))] };
    case 'ad-seats': return {
      cols: [['Class'], ['Seats', 'n'], ['Admitted', 'n'], ['Waiting list', 'n'], ['Free', 'n']],
      rows: [['Nursery', 64, 38, 0, 26], ['LKG', 24, 19, 6, 5], ['UKG', 8, 5, 0, 3], ['Class 1', 10, 10, 9, 0], ['Class 2', 4, 3, 0, 1], ['Class 6', 6, 4, 2, 2], ['Class 9', 4, 1, 0, 3]] };
    case 'at-daily': return {
      cols: [['Class'], ['On roll', 'n'], ['Present', 'n'], ['Absent', 'n'], ['Late', 'n'], ['Present %', 'pct']],
      rows: CLS_IDS.map((id) => [CLS_NAME(id), STRENGTH[id], STRENGTH[id] - ABSENT_TODAY[id], ABSENT_TODAY[id], LATE_TODAY[id], pct(STRENGTH[id] - ABSENT_TODAY[id], STRENGTH[id])]),
      foot: (rows) => ['All classes', sum(rows, 1), sum(rows, 2), sum(rows, 3), sum(rows, 4), pct(sum(rows, 2), sum(rows, 1))] };
    case 'at-monthly': return {
      cols: [['Student'], ['Class'], ['School days', 'n'], ['Present', 'n'], ['Absent', 'n'], ['Present %', 'pct']],
      rows: STUDENTS.map((s) => { const p = Math.round((7 * s.att) / 100); return [s.name, clsOf(s), 7, p, 7 - p, pct(p, 7), s.clsId]; }), clsId: 6 };
    case 'at-low': return {
      cols: [['Student'], ['Class'], ['This year', 'pct'], ['Days absent', 'n'], ['Class teacher']],
      rows: STUDENTS.filter((s) => s.att < 80).map((s, i) => [s.name, clsOf(s), s.att, Math.round(((100 - s.att) * 88) / 100), ['Usha Rani', 'Venkat Rao', 'Lalitha Devi', 'Swapna Reddy', 'Deepak Verma'][i % 5]]) };
    case 'at-staff': return {
      cols: [['Department'], ['Staff', 'n'], ['Present', 'n'], ['Late', 'n'], ['On leave', 'n'], ['Present %', 'pct']],
      rows: [['Teaching', 58, 55, 1, 2], ['Office', 6, 6, 0, 0], ['Accounts', 2, 2, 0, 0], ['Transport', 12, 12, 0, 0], ['Library', 1, 1, 0, 0], ['Hostel', 3, 3, 0, 0], ['Stores', 1, 0, 0, 1], ['Support', 3, 3, 0, 0]].map((r) => [...r, pct(r[2], r[1])]),
      foot: (rows) => ['All staff', sum(rows, 1), sum(rows, 2), sum(rows, 3), sum(rows, 4), pct(sum(rows, 2), sum(rows, 1))] };
    case 'fe-collection': return {
      cols: [['Class'], ['Due', 'inr'], ['Collected', 'inr'], ['Not collected', 'inr'], ['Collected %', 'pct']],
      rows: FEE_BY_CLASS, foot: (rows) => ['All classes', sum(rows, 1), sum(rows, 2), sum(rows, 3), pct(sum(rows, 2), sum(rows, 1))] };
    case 'fe-defaulter': return {
      cols: [['Student'], ['Class'], ['Overdue', 'inr'], ['Days late', 'n'], ['For']],
      rows: [...DEFAULTERS].sort((a, b) => b.days - a.days).map((d) => [d.s.name, clsOf(d.s), d.amount, d.days, d.head]),
      foot: (rows) => [`${rows.length} students`, '', sum(rows, 2), '', ''] };
    case 'fe-modes': return {
      cols: [['Mode'], ['Amount', 'inr'], ['Share', 'pct']],
      rows: [['UPI', 9840000], ['Online (Razorpay)', 5130000], ['Cash', 4480000], ['Bank transfer', 1860000], ['Cheque', 1420000], ['Card', 600000]].map((r) => [...r, pct(r[1], 23330000)]),
      foot: (rows) => ['Total', sum(rows, 1), 100] };
    case 'fe-concession': return {
      cols: [['Type'], ['Students', 'n'], ['Amount', 'inr'], ['Note']],
      rows: [['RTE seats', 38, 1976000, 'Claimed from the Telangana government'], ['Sibling discount', 176, 704000, 'Bulk rule'], ['Full year paid by 30 Apr', 146, 491300, '5% off'], ['Staff children', 14, 462000, '50% off tuition'], ['Scholarships', 21, 405400, 'Merit, sports and need-based'], ['One-off discounts', 23, 61500, '9 above ₹1,000 approved by the Principal'], ['Late fee waivers', 31, 7750, 'With a reason each']],
      foot: (rows) => ['Total', sum(rows, 1), sum(rows, 2), ''] };
    case 'fe-gst': return {
      cols: [['Month'], ['Fee head'], ['Rate', 'pct'], ['Collected', 'inr'], ['Taxable value', 'inr'], ['GST', 'inr'], ['Tax invoices', 'n']],
      rows: [['Sep', 'Uniform', 5, 194000, 112], ['Sep', 'Books & stationery kit', 12, 295000, 186], ['Oct (so far)', 'Uniform', 5, 22400, 9], ['Oct (so far)', 'Books & stationery kit', 12, 9600, 4]].map(([m, h, r, c, n]) => [m, h, r, c, c - gst(c, r), gst(c, r), n]),
      foot: (rows) => ['Total', '', '', sum(rows, 3), sum(rows, 4), sum(rows, 5), sum(rows, 6)], note: 'GSTIN 36AAACS4821K1Z5 · tuition, transport, hostel and exam fees are exempt and not in this report' };
    case 'fi-daybook': return {
      cols: [['Date'], ['Voucher'], ['Head'], ['Received', 'inr'], ['Paid', 'inr']],
      rows: [['9 Oct', 'R/26/05190', 'Fee · Saanvi Reddy, 4 A', 12500, 0], ['9 Oct', 'R/26/05189', 'Fee · Kabir Naidu, 9 C', 21000, 0], ['9 Oct', 'PV/26/0412', 'Lab chemicals', 0, 18600], ['8 Oct', 'PV/26/0411', 'Diesel, Buses 1–6', 0, 42300], ['8 Oct', 'R/26/05161', 'Fee · 29 payments', 312400, 0], ['7 Oct', 'PV/26/0409', 'Electricity, September', 0, 61250]],
      foot: (rows) => ['Total', '', '', sum(rows, 3), sum(rows, 4)] };
    case 'fi-ie': return {
      cols: [['Month'], ['Income', 'inr'], ['Expense', 'inr'], ['Surplus', 'inr']],
      rows: FEE_TREND.map((m, i) => { const e = [3410000, 3320000, 3580000, 3640000, 3510000, 3490000, 620000][i]; return [m.m === 'Oct' ? 'Oct (so far)' : m.m, m.c * 100000, e, m.c * 100000 - e]; }),
      foot: (rows) => ['Apr to 9 Oct', sum(rows, 1), sum(rows, 2), sum(rows, 3)] };
    case 'fi-cash': return {
      cols: [['Account'], ['Opening', 'inr'], ['In', 'inr'], ['Out', 'inr'], ['Closing', 'inr']],
      rows: [['Cash at the counter', 48200, 186400, 190000, 44600], ['SBI Kukatpally (School)', 4218000, 2964000, 1902300, 5279700], ['HDFC KPHB (Trust)', 1126400, 412000, 98000, 1440400]],
      foot: (rows) => ['All accounts', sum(rows, 1), sum(rows, 2), sum(rows, 3), sum(rows, 4)] };
    case 'ex-results': return {
      cols: [['Class'], ['Wrote', 'n'], ['Passed', 'n'], ['Pass %', 'pct'], ['Average', 'pct'], ['Below 33% in a subject', 'n']],
      rows: [['Class 6', 86, 82, 0, 71], ['Class 7', 88, 82, 0, 68], ['Class 8', 84, 79, 0, 66], ['Class 9', 100, 89, 0, 61], ['Class 10', 94, 87, 0, 64]].map((r) => [r[0], r[1], r[2], pct(r[2], r[1]), r[4], r[1] - r[2]]),
      foot: (rows) => ['Classes 6–10', sum(rows, 1), sum(rows, 2), pct(sum(rows, 2), sum(rows, 1)), 66, sum(rows, 5)] };
    case 'ex-below': return {
      cols: [['Student'], ['Class'], ['Below 33% in'], ['Lowest marks', 'pct'], ['Subject teacher']],
      rows: BELOW_33 };
    case 'ex-toppers': return {
      cols: [['Class'], ['Student'], ['Total', 'pct'], ['Best subject']],
      rows: [['Class 6', 'Saanvi Goud (6 B)', 96.4, 'Mathematics'], ['Class 7', 'Meera Das (7 B)', 95.8, 'Science'], ['Class 8', 'Harsha Verma (8 B)', 94.2, 'English'], ['Class 9', 'Kavya Iyer (9 A)', 97.1, 'Mathematics'], ['Class 10', 'Pranav Reddy (10 A)', 96.0, 'Physics']] };
    case 'hr-list': return {
      cols: [['Name'], ['Department'], ['Role'], ['Joined'], ['Type']],
      rows: STAFF.map((t) => [t.name, t.dept, t.desig, t.joined, t.type]), total: () => 86 };
    case 'hr-leave': return {
      cols: [['Staff'], ['Casual', 'n'], ['Sick', 'n'], ['Earned', 'n'], ['Without pay', 'n']],
      rows: [['Anitha Kumari', 4, 5, 0, 0], ['Ravi Teja', 5, 1, 0, 0], ['Imran Shaikh', 3, 2, 0, 0], ['Deepak Verma', 6, 0, 2, 0], ['Ramu Yadav', 4, 3, 0, 2], ['Swapna Reddy', 2, 1, 0, 0], ['Usha Rani', 1, 0, 5, 0]] };
    case 'hr-moves': return {
      cols: [['Name'], ['Joined or left'], ['Date'], ['Role']],
      rows: [['Mohammed Asif', 'Joined', '2 Jun 2023', 'PET'], ['Sneha Mathew', 'Joined', '1 Jun 2026', 'TGT English'], ['Pallavi Reddy', 'Joined', '1 Jun 2026', 'TGT Science'], ['Arvind Rao', 'Joined', '15 Jun 2026', 'PGT Mathematics'], ['Kiran Kumar', 'Left', '31 May 2026', 'TGT Mathematics'], ['Shanthi Rao', 'Left', '30 Jun 2026', 'Office assistant']].filter((r) => r[2].endsWith('2026')) };
    case 'sa-register': return {
      cols: [['Month'], ['Staff', 'n'], ['Gross', 'inr'], ['Deductions', 'inr'], ['Net pay', 'inr']],
      rows: [['Apr 2026', 84, 2648200, 137100, 2511100], ['May 2026', 84, 2652700, 137300, 2515400], ['Jun 2026', 86, 2761900, 142900, 2619000], ['Jul 2026', 86, 2772400, 143500, 2628900], ['Aug 2026', 86, 2769800, 143200, 2626600], ['Sep 2026', 86, 2780100, 143700, 2636400]],
      foot: (rows) => ['Apr to Sep', '', sum(rows, 2), sum(rows, 3), sum(rows, 4)] };
    case 'sa-pfesi': return {
      cols: [['Month'], ['PF, staff 12%', 'inr'], ['PF, school 12%', 'inr'], ['ESI, staff 0.75%', 'inr'], ['ESI, school 3.25%', 'inr'], ['Status']],
      rows: [['Jul 2026', 105400, 105400, 2380, 10310, 'Filed 14 Aug'], ['Aug 2026', 105900, 105900, 2390, 10360, 'Filed 12 Sep'], ['Sep 2026', 106200, 106200, 2400, 10400, 'Due 15 Oct']], note: 'Files: PF-ECR text file for the EPFO portal · ESI Excel for the ESIC portal · 21 staff within the ESI limit' };
    case 'co-delivery': return {
      cols: [['Month'], ['Sent', 'n'], ['Delivered', 'n'], ['Read', 'n'], ['Failed, SMS sent', 'n']],
      rows: [['Jul', 18420, 18102, 15230, 318], ['Aug', 16980, 16711, 14105, 269], ['Sep', 21140, 20832, 17690, 308], ['Oct (so far)', 6210, 6122, 5034, 88]] };
    case 'tr-route': return {
      cols: [['Route'], ['Bus'], ['Driver'], ['Students', 'n'], ['Seats', 'n'], ['Free', 'n']],
      rows: [['Route 1 · Kukatpally Housing Board', 'Bus 1', 'Narsimha', 46, 52], ['Route 2 · Nizampet', 'Bus 2', 'Yadagiri', 41, 52], ['Route 3 · Bachupally', 'Bus 3', 'Srisailam', 38, 40], ['Route 4 · Miyapur', 'Bus 4', 'Mallesh Kumar', 49, 52], ['Route 5 · Moosapet', 'Bus 5', 'Ramesh', 33, 40], ['Route 6 · Chandanagar', 'Bus 6', 'Jangaiah', 44, 52]].map((r) => [...r, r[4] - r[3]]),
      foot: (rows) => ['All routes', '', '', sum(rows, 3), sum(rows, 4), sum(rows, 5)] };
    case 'tr-delay': return {
      cols: [['Route'], ['Trips', 'n'], ['Late over 10 min', 'n'], ['Usual reason']],
      rows: [['Route 1', 14, 0, ''], ['Route 2', 14, 1, 'Traffic at Nizampet X roads'], ['Route 3', 14, 0, ''], ['Route 4', 14, 3, 'Bus KA-36 repair on 6 Oct'], ['Route 5', 14, 0, ''], ['Route 6', 14, 1, 'Road work at Chandanagar']] };
    case 'li-overdue': return {
      cols: [['Book'], ['Member'], ['Class'], ['Days late', 'n'], ['Fine so far', 'inr']],
      rows: [['The Diary of a Young Girl', 'Charan Joshi', '8 A', 21, 42], ['Ignited Minds', 'Swapna Reddy', 'Staff', 15, 30], ['Swami and Friends', 'Krishna Rao', '6 B', 9, 18], ['Harry Potter and the Philosopher’s Stone', 'Navya Rao', '8 B', 7, 14], ['The Adventures of Tom Sawyer', 'Nikhil Gupta', '5 B', 7, 14], ['The Jungle Book', 'Harini Joshi', '7 A', 5, 10]] };
    case 'li-class': return {
      cols: [['Class'], ['Books issued', 'n'], ['Per student', 'n']],
      rows: [['Classes 3–4', 1292, 6.8], ['Class 5', 681, 7.4], ['Class 6', 598, 6.1], ['Class 7', 571, 5.6], ['Class 8', 403, 4.2], ['Class 9', 248, 2.1], ['Class 10', 157, 1.4]] };
    case 'in-stock': return {
      cols: [['Item'], ['In stock', 'n'], ['Reorder at', 'n'], ['Status', 'pill']],
      rows: [['A4 paper (reams)', 46, 40, 'OK'], ['Whiteboard markers', 38, 50, 'Low'], ['Chalk (boxes)', 12, 20, 'Low'], ['Lab gloves (pairs)', 0, 100, 'Order now'], ['Notebooks, 200 pages', 820, 300, 'OK'], ['Uniform shirts, size 28', 14, 20, 'Low']] };
    case 'in-assets': return {
      cols: [['Asset'], ['Where'], ['Bought'], ['Value', 'inr']],
      rows: [['Smart board (12)', 'Classes 6–10', 'Jun 2024', 1440000], ['Desktop computers (40)', 'Computer lab', 'May 2023', 1600000], ['School buses (6)', 'Transport', '2018–2022', 13200000], ['RO water plant', 'Ground floor', 'Apr 2025', 185000], ['Generator 62.5 kVA', 'Utility block', 'Jan 2021', 690000]],
      foot: (rows) => ['Total', '', '', sum(rows, 3)] };
    case 'ho-beds': return {
      cols: [['Block'], ['Beds', 'n'], ['Filled', 'n'], ['Free', 'n']],
      rows: [['Boys block A', 60, 54, 6], ['Boys block B', 40, 31, 9], ['Girls block', 48, 44, 4]],
      foot: (rows) => ['All blocks', sum(rows, 1), sum(rows, 2), sum(rows, 3)] };
    case 'fo-visitors': return {
      cols: [['Day'], ['Visitors', 'n'], ['Most came for'], ['Average wait']],
      rows: [['Fri 9 Oct', 23, 'Fee payment', '6 min'], ['Thu 8 Oct', 41, 'Admission enquiry', '9 min'], ['Wed 7 Oct', 35, 'Meet a teacher', '7 min'], ['Tue 6 Oct', 29, 'Fee payment', '5 min'], ['Mon 5 Oct', 38, 'Certificates', '8 min']] };
    case 'hw-submit': return {
      cols: [['Class'], ['Homework given', 'n'], ['Handed in on time', 'pct']],
      rows: [['6 A', 18, 91], ['6 B', 18, 88], ['7 A', 17, 84], ['7 B', 17, 93], ['8 A', 16, 86], ['9 B', 14, 78], ['10 A', 15, 90]] };
    case 'ev-ptm': return {
      cols: [['Class'], ['Parents expected', 'n'], ['Came', 'n'], ['Came %', 'pct']],
      rows: [['Class 1', 96, 88], ['Class 2', 98, 85], ['Class 3', 94, 79], ['7 A', 51, 44], ['7 B', 51, 47]].map((r) => [...r, pct(r[2], r[1])]) };
    case 'ta-open': return {
      cols: [['Person'], ['Open tasks', 'n'], ['Overdue', 'n'], ['Oldest']],
      rows: [['Anita Sharma', 7, 1, '2 Oct'], ['Suresh Babu', 5, 2, '28 Sep'], ['Ravi Teja', 3, 0, '7 Oct'], ['Venkatesh Goud', 4, 1, '30 Sep'], ['Padma Iyer', 2, 0, '8 Oct']] };
    default: return { cols: [['Item']], rows: [] };
  }
}
const matchCls = (v, id) => { const s = id === 'NUR' ? 'Nursery' : id; return v === CLS_NAME(id) || v === s || String(v).startsWith(s + ' '); };

/* ---------- Filters ---------- */
const AY = [{ value: '2026–27', label: '2026–27 (this year)' }, { value: '2025–26', label: '2025–26 (closed)' }];
const FY = [{ value: '2026–27', label: 'FY 2026–27' }, { value: '2025–26', label: 'FY 2025–26 (closed)' }];
const FY_RANGE = { '2026–27': '01-04-2026 to 31-03-2027', '2025–26': '01-04-2025 to 31-03-2026' };
// How each dated report answers the date filter: rows with a date column are filtered; month rows are kept when the month
// overlaps; totals over a stretch of days are worked out for the days picked (base = the days the example numbers cover).
const DATED = {
  'st-transfer': { dcol: 3 }, 'st-withdraw': { dcol: 2 }, 'fi-daybook': { dcol: 0 }, 'fo-visitors': { dcol: 0 },
  'co-delivery': { mcol: 0 },
  'ad-funnel': { base: 131, cols: [1, 2, 3, 4] },
  'at-monthly': { base: 9, cols: [2, 3, 4] },
  'fe-modes': { base: 192, cols: [1] },
  'fi-cash': { base: 9, cols: [2, 3], post: (r) => [r[0], r[1], r[2], r[3], r[1] + r[2] - r[3]] },
  'hr-leave': { base: 131, cols: [1, 2, 3, 4] },
  'tr-delay': { base: 7, cols: [1, 2] },
  'hw-submit': { base: 30, cols: [1] },
};
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "9 Oct", "Fri 9 Oct", "Wed 30 Sep", "Today, 9:15 AM" -> ISO date in 2026
function isoOf(t) {
  if (!t) return '';
  if (/^(Today|Just now)/.test(t)) return '2026-10-09';
  const m = /(\d{1,2}) ([A-Z][a-z]{2})/.exec(t);
  if (!m || MON3.indexOf(m[2]) < 0) return '';
  return `2026-${String(MON3.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}
function applyDates(id, rows, per) {
  const d = DATED[id];
  if (!d) return rows;
  if (d.dcol != null) return rows.filter((r) => { const iso = isoOf(r[d.dcol]); return iso >= per.from && iso <= per.to; });
  if (d.mcol != null) return rows.filter((r) => { const mi = MON3.indexOf(String(r[d.mcol]).slice(0, 3)); const a = `2026-${String(mi + 1).padStart(2, '0')}-01`, b = `2026-${String(mi + 1).padStart(2, '0')}-31`; return a <= per.to && b >= per.from; });
  const f = periodDays(per) / d.base;
  return rows.map((r) => { const x = r.map((v, i) => (d.cols.includes(i) ? Math.round(v * f) : v)); return d.post ? d.post(x) : x; })
    .filter((x) => d.cols.some((i) => x[i] > 0)); // a row with nothing in these dates is left out

}
const CLASS_OPTS = [{ value: 'all', label: 'All classes' }, ...CLS_IDS.map((id) => ({ value: id, label: CLS_NAME(id) }))];
const CAMPUS = [{ value: 'kph', label: 'Kukatpally (main)' }];

/* =========================================================================================
   Shared bits
   ========================================================================================= */
function Back({ to, label }) {
  const { go } = useNav();
  return (
    <button onClick={() => go('reports', { page: to })} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink mb-3 -ml-1 h-8 px-1 rounded-lg">
      <I.ArrowLeft size={17} />{label}
    </button>
  );
}
const IconTile = ({ name, tone = 'neutral', size = 36 }) => {
  const Ic = I[name] || I.FileText;
  return <span className={cx('rounded-lg grid place-items-center shrink-0', TONE_SOFT[tone])} style={{ width: size, height: size }}><Ic size={size * 0.47} /></span>;
};
const SmallBtn = ({ onClick, children, on }) => (
  <button type="button" onClick={onClick} className={cx('h-7 px-2.5 rounded-lg text-[12.5px] font-semibold tnum transition', on ? 'bg-brand/10 text-brand' : 'bg-sunken hover:bg-line text-ink2')}>{children}</button>
);

// The records behind a number (drill-down). Same count as the number tapped.
function DrillSheet({ drill, onClose }) {
  const toast = useToast();
  if (!drill) return null;
  return (
    <Sheet open={!!drill} onClose={onClose} wide title={drill.title} sub={drill.sub}
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button><Button variant="secondary" icon={I.Download} onClick={() => toast({ title: `Exported: ${drill.title}`, body: `${drill.rows.length} rows · Excel with the school name, filters and your name on top. Logged.` })}>Export these {drill.rows.length}</Button></>}>
      <div className="-mx-5">
        <SimpleTable minWidth={480} cols={drill.cols.map(([label, k], i) => ({ label, right: NUMERIC.includes(k), render: (r) => fmt(r[i], k) }))} rows={drill.rows} />
      </div>
      <p className="text-[12.5px] text-ink3 mt-3">{drill.rows.length} {drill.rows.length === 1 ? 'record' : 'records'} · {drill.basis}</p>
    </Sheet>
  );
}

/* =========================================================================================
   All Reports
   ========================================================================================= */
function AllReports({ params }) {
  const r = params?.id && REPORT[params.id];
  const { allowed } = useScope();
  if (r && allowed(r)) return <ReportView r={r} />;
  if (r) return (
    <div>
      <Back to="all" label="All reports" />
      <Empty icon={I.Lock} title={`“${r.name}” is not open to your role`} body="Reports show only what your role may see. Ask the School Admin for a wider role in Settings, Users & Permissions." />
    </div>
  );
  return <Catalogue />;
}

function Catalogue() {
  const { go } = useNav();
  const toast = useToast();
  const { cats: allCats, classes, role, allowed } = useScope();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [pins, setPins] = useState(() => new Set(role.id === 'accountant' ? ['fe-defaulter', 'fe-gst'] : ['at-daily', 'fe-defaulter', 'st-master']));
  const mine = CATALOGUE.filter(allowed);
  const cats = allCats.filter((c) => mine.some((r) => r.cat === c));
  const t = q.trim().toLowerCase();
  const found = mine.filter((r) => (cat === 'all' || r.cat === cat) && (!t || (r.name + ' ' + r.sub + ' ' + r.cat).toLowerCase().includes(t)));
  const groups = cats.filter((c) => found.some((r) => r.cat === c));
  const recent = ['ex-results', 'fe-collection', 'st-docs', 'at-low', 'sa-pfesi', 'hr-leave', 'ad-funnel', 'at-staff', 'ex-below'].filter((id) => allowed(REPORT[id])).slice(0, 3);
  const pinned = mine.filter((r) => pins.has(r.id));
  const open = (r) => go('reports', { page: 'all', id: r.id });
  const pin = (r) => {
    const on = pins.has(r.id);
    setPins((x) => { const n = new Set(x); on ? n.delete(r.id) : n.add(r.id); return n; });
    toast({ title: on ? `Unpinned: ${r.name}` : `Pinned: ${r.name}`, body: on ? undefined : 'It stays at the top of this page for you', undo: () => setPins((x) => { const n = new Set(x); on ? n.add(r.id) : n.delete(r.id); return n; }) });
  };
  const ReportRow = ({ r, showCat }) => (
    <li className="flex items-center gap-1 pr-1 rounded-xl hover:bg-sunken/60 transition">
      <button onClick={() => open(r)} className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 text-left">
        <IconTile name={CAT_ICON[r.cat]} tone={r.money ? 'brand' : 'neutral'} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-[14px] leading-snug truncate">{r.name}</span>
          <span className="block text-[12.5px] text-ink3 truncate">{showCat ? `${r.cat} · ` : ''}{r.sub}</span>
        </span>
        {r.heavy && <Pill tone="neutral" className="!h-5 !text-[11px] hidden @sm:inline-flex">Large</Pill>}
      </button>
      <button onClick={() => pin(r)} aria-label={pins.has(r.id) ? `Unpin ${r.name}` : `Pin ${r.name}`} title={pins.has(r.id) ? 'Unpin' : 'Pin to the top'}
        className={cx('w-9 h-9 rounded-lg grid place-items-center shrink-0 transition', pins.has(r.id) ? 'text-brand bg-brand/8' : 'text-ink3 hover:bg-sunken hover:text-ink')}>
        <I.Pin size={16} />
      </button>
    </li>
  );
  return (
    <div>
      <ModuleHead sub={`${mine.length} ready reports from ${cats.length} ${cats.length === 1 ? 'module' : 'modules'} · filter, see on screen, export to Excel, CSV or PDF`} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        {classes && <Banner tone="info" title="Showing your classes only.">Reports open with {classes.length === 1 ? `Class ${classes[0]}` : classes.join(', ')}. Fee and staff reports are not part of your role.</Banner>}
        {ROLE_NOTE[role.id] && <Banner tone="info" title={ROLE_NOTE[role.id][0]}>{ROLE_NOTE[role.id][1]}</Banner>}
        <Card className="overflow-hidden">
          <Toolbar>
            <SearchBox id="rep-q" value={q} onChange={setQ} placeholder="Find a report, like “defaulter”, “attendance” or “GST”" />
          </Toolbar>
          <div className="px-3 pt-3 pb-1">
            <Chips value={cat} onChange={setCat} options={[{ value: 'all', label: 'All', count: mine.length }, ...cats.map((c) => ({ value: c, label: c, count: mine.filter((r) => r.cat === c).length }))]} />
          </div>
          {t && <p className="px-5 pt-2 text-[13px] text-ink3">{found.length} {found.length === 1 ? 'report matches' : 'reports match'} “{q}”</p>}
          {!t && cat === 'all' && (
            <div className="grid @lg:grid-cols-2 gap-x-6 px-2 pt-2 pb-2 border-b border-line/70">
              <div>
                <p className="eyebrow text-ink3 px-3 pt-2 pb-1 flex items-center gap-1.5"><I.Pin size={12} />Pinned</p>
                {pinned.length ? <ul>{pinned.map((r) => <ReportRow key={r.id} r={r} showCat />)}</ul>
                  : <p className="px-3 py-3 text-[13px] text-ink3">Nothing pinned. Tap the pin on any report to keep it here.</p>}
              </div>
              <div>
                <p className="eyebrow text-ink3 px-3 pt-2 pb-1 flex items-center gap-1.5"><I.History size={12} />Used recently</p>
                <ul>{recent.map((id) => <ReportRow key={id} r={REPORT[id]} showCat />)}</ul>
              </div>
            </div>
          )}
          {found.length === 0 ? (
            <Empty icon={I.SearchX} title="No report matches" body={`Nothing called “${q}” in ${cat === 'all' ? 'your reports' : cat}. Try a shorter word, or build your own in Custom & Scheduled Reports.`}
              action={<Button variant="secondary" onClick={() => { setQ(''); setCat('all'); }}>Clear search</Button>} />
          ) : (
            <div className="grid @xl:grid-cols-2 gap-x-6 px-2 pb-3">
              {groups.map((g) => (
                <section key={g} className="pt-3">
                  <p className="eyebrow text-ink3 px-3 pb-1 flex items-center gap-1.5">{React.createElement(I[CAT_ICON[g]] || I.FileText, { size: 12 })}{g}{MONEY.includes(g) && <span className="normal-case tracking-normal font-normal">· financial year</span>}</p>
                  <ul>{found.filter((r) => r.cat === g).map((r) => <ReportRow key={r.id} r={r} />)}</ul>
                </section>
              ))}
            </div>
          )}
          <p className="px-5 py-3 border-t border-line text-[12.5px] text-ink3">Only reports your role may see are listed. Each module adds its reports here as it is switched on.</p>
        </Card>
      </div>
    </div>
  );
}

function ReportView({ r }) {
  const toast = useToast();
  const { go } = useNav();
  const { classes, inScope } = useScope();
  const { pages } = usePage();
  const spec = useMemo(() => previewOf(r.id), [r.id]);
  const [year, setYear] = useState('2026–27');
  const [cls, setCls] = useState(classes ? 'mine' : 'all');
  const [per, setPer] = useState(DP.thismonth);
  const [sort, setSort] = useState({ i: -1, dir: 1 });
  const [run, setRun] = useState('idle'); // background job: idle | preparing | ready
  const [pinned, setPinned] = useState(false);
  const [more, setMore] = useState(false);
  useEffect(() => { setRun('idle'); }, [cls, year, per]);
  useEffect(() => {
    if (run !== 'preparing') return undefined;
    const t = setTimeout(() => { setRun('ready'); toast({ title: `Report ready: ${r.name}`, body: 'The download link is in your notifications', tone: 'info' }); }, 2600);
    return () => clearTimeout(t);
  }, [run]);

  const clsOpts = classes ? [{ value: 'mine', label: classes.length === 1 ? `My class (${classes[0]})` : 'My classes' }, ...classes.map((c) => ({ value: c, label: c }))] : CLASS_OPTS;
  let rows = r.dated ? applyDates(r.id, spec.rows, per) : spec.rows;
  if (r.cls != null) {
    if (classes) rows = rows.filter((x) => inScope(x[r.cls]) && (cls === 'mine' || x[r.cls] === cls || String(cls).startsWith(String(x[r.cls]).replace('Class ', '') + ' ')));
    else if (cls !== 'all') rows = rows.filter((x) => (spec.clsId != null ? x[spec.clsId] === cls : matchCls(x[r.cls], cls)));
  }
  if (sort.i >= 0) {
    const k = spec.cols[sort.i][1];
    rows = [...rows].sort((a, b) => (NUMERIC.includes(k) ? (a[sort.i] - b[sort.i]) : String(a[sort.i]).localeCompare(String(b[sort.i]))) * sort.dir);
  }
  const shown = rows.slice(0, 25);
  const total = spec.total ? (classes ? rows.length : spec.total(cls)) : rows.length;
  const heavyNow = r.heavy && cls === 'all';
  const clsLabel = r.cls == null ? 'Whole school' : classes ? (cls === 'mine' ? (classes.length === 1 ? `Class ${classes[0]}` : `Classes ${classes.join(', ')}`) : `Class ${cls}`) : cls === 'all' ? 'All classes' : CLS_NAME(cls);
  const when = r.dated ? `${per.label} (${fmtRange(per)})` : r.money ? `Financial year ${year} (${FY_RANGE[year]})` : `${year}`;
  const closed = r.dated ? per.to < (r.money ? '2026-04-01' : '2026-06-01') : year === '2025–26';
  const context = `${clsLabel} · ${when} · Kukatpally campus`;
  const exp = (what) => toast({ title: `Exported: ${r.name} (${what})`, body: `${context}. School name, filters, your name and the time on top. Logged in the export log.` });

  return (
    <div>
      <Back to="all" label="All reports" />
      <ModuleHead title={r.name} sub={`${r.sub} · from ${r.cat}`} tabs={false} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Card>
          <div className="grid grid-cols-2 @lg:grid-cols-4 gap-3 p-4">
            {r.dated
              ? <Field label="Dates" id="rf-dates" className="col-span-2 min-w-0"><DatePeriod id="rf-dates" value={per} onChange={setPer} className="w-full" /></Field>
              : <Field label={r.money ? 'Financial year' : 'Academic year'} id="rf-year"><Select id="rf-year" value={year} onChange={setYear} options={r.money ? FY : AY} /></Field>}
            {r.cls != null
              ? <Field label="Class" id="rf-cls"><Select id="rf-cls" value={cls} onChange={setCls} options={clsOpts} /></Field>
              : <Field label="Class" id="rf-cls-x"><Select id="rf-cls-x" value="all" onChange={() => {}} options={[{ value: 'all', label: 'Whole school' }]} /></Field>}
            {!r.dated && <Field label="Dates" id="rf-dates-x"><Select id="rf-dates-x" value="asof" onChange={() => {}} options={[{ value: 'asof', label: 'As on today' }]} /></Field>}
            <Field label="Campus" id="rf-campus"><Select id="rf-campus" value="kph" onChange={() => {}} options={CAMPUS} /></Field>
          </div>
          <div className="px-5 pb-4 -mt-1 flex items-start gap-2 text-[13px] text-ink2">
            <I.Filter size={15} className="text-ink3 shrink-0 mt-0.5" />
            <p className="min-w-0"><b className="font-semibold">Showing:</b> {context}. {r.money && 'Money reports use the financial year, not the academic year. '}Printed on the screen and on every file.</p>
          </div>
        </Card>

        {closed && <Banner tone="info" title={r.dated ? 'These dates are in a closed year.' : '2025–26 is closed.'}>Figures are final and cannot change. Shown with this year’s layout.</Banner>}

        {heavyNow && run !== 'ready' ? (
          <Card>
            {run === 'idle' ? (
              <Empty icon={I.Hourglass} title="This is a large report" body={`${r.id === 'at-monthly' ? 'Every student in all 25 sections, day by day' : 'Every receipt and payment in the period'}. It is prepared in the background so your screen does not freeze.`}
                action={<div className="flex gap-2 flex-wrap justify-center"><Button variant="primary" icon={I.Play} onClick={() => setRun('preparing')}>Prepare the report</Button>{r.cls != null && <Button variant="secondary" onClick={() => setCls(classes ? 'mine' : '7')}>See one class now</Button>}</div>} />
            ) : (
              <div className="flex flex-col items-center text-center px-6 py-14 gap-3 animate-fade">
                <span className="w-14 h-14 rounded-2xl bg-brand/10 text-brand grid place-items-center"><Spinner size={24} /></span>
                <h3 className="font-semibold text-[15px]">This report is being prepared. We will notify you.</h3>
                <p className="text-sm text-ink3 max-w-sm">You can leave this page. A notification with the download link arrives when it is ready.</p>
              </div>
            )}
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <CardHead title={r.name} sub={`${total.toLocaleString('en-IN')} ${total === 1 ? 'row' : 'rows'}${heavyNow ? ' · prepared in the background' : ''}`}
              action={<div className="flex gap-1.5 items-center">
                <Button size="sm" variant="secondary" icon={I.FileSpreadsheet} onClick={() => exp('Excel')}>Excel</Button>
                <Button size="sm" variant="secondary" icon={I.FileText} className="hidden @sm:inline-flex" onClick={() => exp('PDF')}>PDF</Button>
                <MoreMenu size="sm" items={[
                  ['FileText', 'PDF', () => exp('PDF')],
                  ['FileDown', 'CSV', () => exp('CSV')],
                  ['Printer', 'Print', () => toast({ title: 'Sent to the office printer', body: `${r.name} · ${context}` })],
                  ['Pin', pinned ? 'Unpin from the top' : 'Pin to the top', () => { setPinned(!pinned); toast({ title: pinned ? 'Unpinned' : `Pinned: ${r.name}` }); }],
                  ...(pages.some((p) => p.id === 'custom') ? [['CalendarClock', 'Email this every week', () => go('reports', { page: 'custom', schedule: r.id })]] : []),
                ]} />
              </div>} />
            {run === 'ready' && <Banner tone="ok" className="mx-4 mb-3" title="Ready." action={<Button size="sm" variant="secondary" icon={I.Download} onClick={() => exp('Excel')}>Download</Button>}>Prepared in the background at 10:44 AM. The first 25 rows are below.</Banner>}
            <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
              <span className="text-[12.5px] text-ink3 font-semibold">Sort by</span>
              <Select id="rf-sort" className="w-48" value={String(sort.i)} onChange={(v) => setSort({ i: Number(v), dir: sort.dir })} options={[{ value: '-1', label: 'As listed' }, ...spec.cols.map(([l], i) => ({ value: String(i), label: l }))]} />
              <Button size="sm" variant="ghost" icon={I.ArrowUpDown} disabled={sort.i < 0} onClick={() => setSort({ ...sort, dir: -sort.dir })}>{sort.dir === 1 ? 'Low to high' : 'High to low'}</Button>
            </div>
            {rows.length === 0 ? (
              <Empty icon={I.Inbox} title="Nothing for these filters" body={`No rows for ${clsLabel.toLowerCase()} in this period. That is good news for this report, or try another class or dates.`}
                action={<Button variant="secondary" onClick={() => { setCls(classes ? 'mine' : 'all'); setPer(r.money ? DP.finyear : DP.acyear); }}>{classes ? 'Show my classes, whole year' : 'Show all classes, whole year'}</Button>} />
            ) : (
              <SimpleTable minWidth={Math.max(520, spec.cols.length * 120)} cols={spec.cols.map(([label, k], i) => ({ label, right: NUMERIC.includes(k), nowrap: i !== spec.cols.length - 1 || NUMERIC.includes(k), render: (x) => fmt(x[i], k) }))}
                rows={shown} foot={spec.foot && (cls === 'all' || r.cls == null) && !classes ? spec.foot(rows).map((v, i) => (i === 0 || v === '' ? v : fmt(v, spec.cols[i][1]))) : null} />
            )}
            {spec.note && <p className="px-5 py-3 text-[12.5px] text-ink3 border-t border-line">{spec.note}</p>}
            {rows.length > 0 && <div className="px-5 py-3 border-t border-line text-[12.5px] text-ink3 flex items-center justify-between gap-3 flex-wrap">
              <span className="tnum">Showing {shown.length} of {total.toLocaleString('en-IN')}{total > shown.length ? ' · the file has every row' : ''}</span>
              {r.id === 'fe-defaulter' && <button onClick={() => go('fees', { page: 'defaulters' })} className="text-[13px] font-semibold text-brand hover:underline">Open Defaulters to send reminders</button>}
              {r.id === 'at-low' && <span>Nobody is below 75% right now (Attendance Settings).</span>}
            </div>}
          </Card>
        )}
        <button onClick={() => setMore(!more)} className="self-start text-[13px] font-semibold text-ink2 hover:text-ink inline-flex items-center gap-1.5"><I.Info size={15} />Who can see this report{more ? ' ▴' : ' ▾'}</button>
        {more && <Banner tone="info">{r.money ? 'Principal, School Admin and Accountant. Teachers do not see money reports.' : r.cat === 'Staff and HR' || r.cat === 'Salary' ? 'Principal, School Admin and HR.' : 'Principal and School Admin see every class. Teachers see only their own classes.'} Every file contains only the rows the person may see.</Banner>}
      </div>
    </div>
  );
}

/* =========================================================================================
   Analytics
   ========================================================================================= */
const AREAS = [
  { value: 'students', label: 'Students' }, { value: 'results', label: 'Results' }, { value: 'finance', label: 'Finance' },
  { value: 'hr', label: 'Staff' }, { value: 'workload', label: 'Teacher workload' }, { value: 'teachers', label: 'Syllabus & teachers' },
  { value: 'admissions', label: 'Admissions' },
];
// What each View role sees in Analytics. Results by teacher stay with the Principal and Academic Head.
const AREAS_BY_ROLE = {
  accountant: ['finance'], hr: ['hr'], academichead: ['students', 'results', 'workload', 'teachers'], examincharge: ['results'], admissioncounsellor: ['admissions'],
  vp: ['students', 'results', 'admissions', 'finance', 'hr', 'workload'],
  principal: ['students', 'results', 'admissions', 'finance', 'hr', 'workload', 'teachers'],
};
// Months in the example data (April to October 2026) that fall inside the picked dates.
const MONTHS_26 = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
function monthsIn(per) {
  return MONTHS_26.filter((m) => { const n = String(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(m) + 1).padStart(2, '0'); return `2026-${n}-01` <= per.to && `2026-${n}-31` >= per.from; });
}
const ADM_MONTHS = [{ k: 'Apr', v: 38, v2: 40 }, { k: 'May', v: 51, v2: 53 }, { k: 'Jun', v: 36, v2: 44 }, { k: 'Jul', v: 9, v2: 15 }, { k: 'Aug', v: 5, v2: 9 }, { k: 'Sep', v: 3, v2: 6 }, { k: 'Oct', v: 0, v2: 1 }];
const LEAVE_MONTHS = [{ k: 'Jun', v: 31 }, { k: 'Jul', v: 48 }, { k: 'Aug', v: 52 }, { k: 'Sep', v: 61 }, { k: 'Oct', v: 22 }];
const EXP_MONTHS = [3410000, 3320000, 3580000, 3640000, 3510000, 3490000, 620000];
const crore = (l) => (l >= 100 ? `₹${(l / 100).toFixed(2)} Cr` : `₹${Math.round(l * 10) / 10} L`);
const WORKLOAD = [
  ['Anitha Kumari', 31, 4], ['Lalitha Devi', 30, 2], ['Mahesh Goud', 30, 1], ['Shobha Rani', 30, 3], ['Deepak Verma', 30, 2], ['Farhana Begum', 30, 1],
  ['Bhargavi Kulkarni', 29, 2], ['Imran Shaikh', 28, 3], ['Rajeshwari Nair', 28, 1], ['Pallavi Reddy', 28, 0], ['Swapna Reddy', 27, 1], ['Arvind Rao', 27, 0], ['Srinivas Chary', 26, 2], ['Sneha Mathew', 26, 1], ['Ravi Teja', 22, 5],
];
const SYLLABUS = [
  // teacher, subject, classes, planned chapters by now, done, UT2 average of their classes, pass %
  ['Imran Shaikh', 'Mathematics', '6 A, 6 B, 7 A, 7 B', 7, 7, 64, 91.2],
  ['Ravi Teja', 'Science', '7 A, 7 B, 8 B', 8, 7, 67, 93.4],
  ['Anitha Kumari', 'English', '8 A, 9 A, 9 C, 10 A, 10 B', 9, 9, 71, 97.0],
  ['Swapna Reddy', 'Mathematics', 'Class 9', 7, 6, 56, 84.7],
  ['Farhana Begum', 'Physics and Chemistry', 'Classes 9–10', 7, 5, 61, 88.2],
  ['Deepak Verma', 'Hindi', 'Classes 8, 9 and 10', 10, 10, 69, 95.1],
  ['Arvind Rao', 'Mathematics', 'Class 10', 8, 8, 62, 90.4],
];
const CLASS9_ABSENT = [
  ['Varun Reddy', '9 C', 3, 'Wed, Thu, Fri'], ['Riya Varma', '9 C', 3, 'Wed, Thu, Fri'], ['Meera Chowdary', '9 B', 2, 'Wed, Thu'], ['Nikhil Goud', '9 B', 2, 'Wed, Thu'],
  ['Riya Chowdary', '9 C', 2, 'Wed, Thu'], ['Kabir Reddy', '9 A', 1, 'Wed'], ['Tanvi Naidu', '9 A', 1, 'Wed'], ['Sai Patel', '9 B', 1, 'Wed'], ['Ananya Kumar', '9 B', 1, 'Thu'],
  ['Dhruv Menon', '9 C', 1, 'Wed'], ['Pooja Shetty', '9 A', 1, 'Thu'], ['Yash Joshi', '9 C', 1, 'Wed'], ['Sneha Rao', '9 B', 1, 'Wed'], ['Rohan Das', '9 A', 1, 'Fri'],
];

function Analytics() {
  const toast = useToast();
  const { role } = useRole();
  const allowed = AREAS_BY_ROLE[role.id] || AREAS.map((a) => a.value).filter((a) => a !== 'teachers');
  const areas = AREAS.filter((a) => allowed.includes(a.value));
  const [area, setArea] = useState(areas[0].value);
  const [per, setPer] = useState(role.id === 'accountant' ? DP.finyear : role.id === 'admissioncounsellor' ? DP.last6m : DP.acyear);
  const [compare, setCompare] = useState(false);
  const [campus, setCampus] = useState('kph');
  const ms = monthsIn(per);
  const f = periodDays(per);
  const adm = ADM_MONTHS.filter((m) => ms.includes(m.k));
  const admitted = adm.reduce((a, m) => a + m.v, 0), left = adm.reduce((a, m) => a + (m.v2 - m.v), 0);
  const fee = FEE_TREND.filter((m) => ms.includes(m.m));
  const due = fee.reduce((a, m) => a + m.d, 0), got = fee.reduce((a, m) => a + m.c, 0);
  const expShare = MONTHS_26.reduce((a, m, i) => a + (ms.includes(m) ? EXP_MONTHS[i] : 0), 0) / EXP_MONTHS.reduce((a, b) => a + b, 0);
  const spent = 206 * expShare;
  const lv = LEAVE_MONTHS.filter((m) => ms.includes(m.k));
  const leaveDays = lv.reduce((a, m) => a + m.v, 0);
  const subsF = Math.min(1, f / 9) + Math.max(0, f - 9) / 26; // October so far had 28 in 9 days; earlier months were quieter
  const subs = (n) => Math.round(n * subsF);
  const range = fmtRange(per);
  const noMonths = ms.length === 0 && ['finance', 'hr', 'admissions'].includes(area);
  const [drill, setDrill] = useState(null);
  const pinChart = (name) => toast({ title: `Pinned to your Dashboard: ${name}`, body: 'It shows under your numbers on the Dashboard', undo: () => toast({ title: 'Removed from the Dashboard', tone: 'info' }) });
  const exp = (name) => () => toast({ title: `Exported chart data: ${name}`, body: `${range}${compare ? ', with the same dates last year' : ''} · Excel with the filters on top. Logged.` });
  const ChartHead = ({ title, sub, icon }) => (
    <CardHead title={title} sub={sub} icon={icon} action={<MoreMenu size="sm" label={`${title}: more`} items={[['Download', 'Export the chart data', exp(title)], ['Pin', 'Pin to my Dashboard', () => pinChart(title)]]} />} />
  );

  return (
    <div>
      <ModuleHead sub="Trends you can open: tap a number or a class to see the records behind it" />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Card>
          <div className="flex flex-col @lg:flex-row @lg:items-end gap-3 p-4">
            <Field label="Dates" id="an-dates" className="min-w-0 @lg:w-72"><DatePeriod id="an-dates" value={per} onChange={setPer} className="w-full" /></Field>
            <Field label="Campus" id="an-campus" className="@lg:w-64"><Select id="an-campus" value={campus} onChange={setCampus} options={role.multiSchool ? [...CAMPUS, { value: 'myp', label: 'Miyapur campus' }, { value: 'both', label: 'Both, side by side' }] : CAMPUS} /></Field>
            <label htmlFor="an-cmp" className="flex items-center gap-2.5 h-11 text-[14px] font-semibold text-ink2 cursor-pointer @lg:ml-2">
              <Switch id="an-cmp" on={compare} onChange={setCompare} label="Compare with last year" />Compare with last year
            </label>
          </div>
          <p className="px-4 pb-3 -mt-1 text-[12.5px] text-ink3">Showing: {per.label} · {range}. Numbers marked “today” or “this week” are as on Fri 9 Oct.</p>
        </Card>
        {areas.length > 1 && <Chips value={area} onChange={setArea} options={areas} />}
        {campus === 'myp' && <Banner tone="info" title="Miyapur campus.">Showing Kukatpally’s layout with Miyapur’s data when you open it from the Miyapur school. Use “Both, side by side” to compare.</Banner>}
        {campus === 'both' && <CompareCampuses />}
        {noMonths && <Card><Empty icon={I.CalendarDays} title="No figures for these dates" body={`This example has figures from April to October 2026. ${range} is outside that.`}
          action={<Button variant="secondary" onClick={() => setPer(area === 'finance' ? DP.finyear : DP.acyear)}>Show this year</Button>} /></Card>}

        {area === 'admissions' && !noMonths && <>
          <Stats items={[
            { label: 'Enquiries', value: String(Math.round(321 * Math.min(1, f / 131))), sub: range, icon: I.Inbox },
            { label: 'Admitted', value: String(admitted), sub: `${left} left in the same dates`, icon: I.UserPlus, tone: 'ok' },
            { label: 'Seats free, 2027–28', value: '40', sub: 'As on today, 7 classes open', icon: I.Users },
          ]} />
          <div className="grid @xl:grid-cols-2 gap-5 @lg:gap-6 items-start [&>*]:min-w-0">
            <Card>
              <ChartHead title="Enquiries to admissions" sub={`By where they came from · ${range}`} icon={I.UserPlus} />
              <div className="px-5 pb-5"><HBars rows={previewOf('ad-funnel').rows.map((r) => ({ k: r[0], v: r[5], label: `${r[5]}%` }))} max={100} labelWidth={104} /></div>
            </Card>
            <Card>
              <ChartHead title="Admitted by month" sub={range} icon={I.CalendarDays} />
              <div className="px-3 pb-2"><Bars data={adm.map((m) => ({ k: m.k, v: m.v }))} max={60} ticks={[0, 20, 40]} ariaLabel="Admitted by month" /></div>
            </Card>
            <Card>
              <ChartHead title="Seats by class, 2027–28" sub="Admitted out of seats, as on today" icon={I.Users} />
              <div className="px-5 pb-5"><HBars rows={previewOf('ad-seats').rows.map((r) => ({ k: r[0], v: Math.round((r[2] / r[1]) * 100), label: `${r[2]} of ${r[1]}` }))} max={100} labelWidth={72} /></div>
            </Card>
          </div>
        </>}

        {area === 'students' && <>
          <Stats items={[
            { label: 'Students', value: '1,236', sub: compare ? '+48 on last year' : 'On the rolls today', icon: I.GraduationCap, onClick: () => setDrill({ title: 'Students by class', sub: '1,236 on the rolls today', cols: [['Class'], ['Students', 'n']], rows: CLS_IDS.map((id) => [CLS_NAME(id), STRENGTH[id]]), basis: 'Student Management, 9 Oct 2026' }) },
            { label: 'Admitted', value: String(admitted), sub: `${left} left · ${range}`, icon: I.UserPlus, tone: 'ok' },
            { label: 'Attendance today', value: '95.8%', sub: '52 absent, 9 late', icon: I.CalendarCheck2, onClick: () => setDrill({ title: 'Absent today by class', sub: '52 students · Fri 9 Oct', cols: [['Class'], ['Absent', 'n']], rows: CLS_IDS.map((id) => [CLS_NAME(id), ABSENT_TODAY[id]]), basis: 'Attendance register, 9 Oct 2026' }) },
            { label: 'Girls', value: '48%', sub: '593 of 1,236', icon: I.Users },
          ]} />
          <div className="grid @xl:grid-cols-2 gap-5 @lg:gap-6 items-start [&>*]:min-w-0">
            <Card>
              <ChartHead title="Strength over the years" sub="Students on 1 July each year · 2026–27 today" icon={I.ChartColumn} />
              <div className="px-3 pb-2"><Bars data={[{ k: '22–23', v: 1084 }, { k: '23–24', v: 1121 }, { k: '24–25', v: 1158 }, { k: '25–26', v: 1188 }, { k: '26–27', v: 1236 }]} max={1400} ticks={[0, 600, 1200]} label={(v) => v.toLocaleString('en-IN')} ariaLabel="Students by year" /></div>
              <p className="px-5 pb-4 text-[12.5px] text-ink3">Up 14% in four years. Class 9 grew most: 118 now, 94 four years ago.</p>
            </Card>
            <Card>
              <ChartHead title="Attendance this week by class" sub="Goal 90% · tap a class to see who was absent" icon={I.CalendarCheck2} />
              <div className="px-5 pb-3"><HBars rows={ATT_BY_CLASS} goal={90} lowBelow={90} /></div>
              <div className="px-5 pb-4 flex gap-1.5 flex-wrap items-center">
                {ATT_BY_CLASS.map((c) => <SmallBtn key={c.k} on={c.k === '9'} onClick={() => c.k === '9'
                  ? setDrill({ title: 'Class 9 · 86% this week', sub: '14 students absent on one or more days, 5 to 9 Oct', cols: [['Student'], ['Section'], ['Days absent', 'n'], ['Which days']], rows: CLASS9_ABSENT, basis: 'Attendance register, 5 to 9 Oct 2026 · 9 of the 14 were away on Wednesday' })
                  : toast({ title: `${c.k === 'Nur–UKG' ? 'Nursery to UKG' : `Class ${c.k}`} · ${c.v}% this week`, body: 'Opens the absent list for the class in the same way', tone: 'info' })}>{c.k}</SmallBtn>)}
              </div>
            </Card>
            <Card>
              <ChartHead title="Admissions and leavers" sub={`By month · ${range}`} icon={I.UserPlus} />
              {adm.length ? <>
                <div className="px-3 pb-2"><Bars data={adm} max={60} ticks={[0, 20, 40]} ariaLabel="Admissions and leavers by month" /></div>
                <div className="px-5 pb-4"><Legend items={[['bg-brand', `Admitted, ${admitted}`], ['bg-ink3/30', `Admitted plus left (${left} left)`]]} /></div>
              </> : <Empty icon={I.UserPlus} title="No admissions in these dates" body="This example has months from April to October 2026." />}
            </Card>
            <Card>
              <ChartHead title="Social category" sub="All 1,236 students" icon={I.Users} />
              <div className="px-5 pb-5"><HBars rows={[{ k: 'General', v: 38, label: '469' }, { k: 'OBC', v: 41, label: '505' }, { k: 'SC', v: 10, label: '124' }, { k: 'ST', v: 4, label: '50' }, { k: 'EWS', v: 7, label: '88' }]} max={50} labelWidth={64} /></div>
            </Card>
          </div>
          <Suggestion title="Class 9 fell this week" source="attendance marks for 5 to 9 Oct and the same week last year">
            Class 9 is at 86%, against 92% usually. Most absences are on Wednesday and Thursday, the days before the half-yearly. A short message to Class 9 parents about exam-week attendance may help; you decide whether to send it.
          </Suggestion>
        </>}

        {area === 'results' && <>
          <Stats items={[
            { label: 'Pass %, Unit Test 2', value: '92.7%', sub: compare ? '−1.2 on last year' : 'Classes 6–10, 452 wrote', icon: I.CircleCheck, tone: 'ok' },
            { label: 'Average', value: '66%', sub: 'Unit Test 1: 68%', icon: I.ChartLine },
            { label: 'Below 33% in a subject', value: '33', sub: 'Tap to see them', icon: I.TriangleAlert, tone: 'warn', onClick: () => setDrill({ title: 'Below 33% in a subject, Unit Test 2', sub: '33 students · Classes 6–10', cols: [['Student'], ['Class'], ['Below 33% in'], ['Lowest marks', 'pct']], rows: BELOW_33.map((r) => r.slice(0, 4)), basis: 'Marks entry, Unit Test 2 (21 to 25 Sep)' }) },
            { label: 'Next exam', value: 'Half-yearly', sub: 'Starts Mon 12 Oct', icon: I.CalendarDays },
          ]} />
          <div className="grid @xl:grid-cols-2 gap-5 @lg:gap-6 items-start [&>*]:min-w-0">
            <Card>
              <ChartHead title="Pass % by class" sub="Unit Test 2 · 33% in every subject to pass" icon={I.ClipboardCheck} />
              <div className="px-5 pb-5"><HBars rows={previewOf('ex-results').rows.map((r) => ({ k: r[0], v: r[3] }))} goal={90} lowBelow={90} labelWidth={70} /></div>
            </Card>
            <Card>
              <ChartHead title="Average by subject" sub={compare ? 'Unit Test 1 behind, Unit Test 2 in front' : 'Unit Test 2, Classes 6–10'} icon={I.ChartColumn} />
              <div className="px-3 pb-2"><Bars data={[['Eng', 72, 73], ['Tel', 69, 70], ['Hin', 68, 67], ['Math', 58, 62], ['Sci', 63, 66], ['Soc', 66, 69]].map(([k, v, v2]) => ({ k, v, v2: compare ? v2 : undefined, tone: v < 60 ? 'warn' : undefined }))} max={100} ticks={[0, 33, 66]} label={(v) => `${v}%`} ariaLabel="Average marks by subject" /></div>
              <div className="px-5 pb-4"><Legend items={compare ? [['bg-brand', 'Unit Test 2'], ['bg-ink3/30', 'Unit Test 1']] : [['bg-brand', 'Average %'], ['bg-warn', 'Below 60%']]} /></div>
            </Card>
          </div>
        </>}

        {area === 'finance' && !noMonths && <>
          <Stats items={[
            { label: 'Due', value: crore(due), sub: `Months in ${range}`, icon: I.IndianRupee },
            { label: 'Collected', value: crore(got), sub: `${due ? Math.round((got / due) * 100) : 0}%`, tone: 'ok', icon: I.CircleCheck, onClick: () => setDrill({ title: 'Collected by class', sub: '₹2.33 Cr of ₹2.84 Cr · 1 Apr to 9 Oct', cols: [['Class'], ['Due', 'inr'], ['Collected', 'inr'], ['%', 'pct']], rows: FEE_BY_CLASS.map((r) => [r[0], r[1], r[2], r[4]]), basis: 'Fee payments, 1 Apr to 9 Oct 2026 (the whole year so far)' }) },
            { label: 'Overdue today', value: '₹8.4 L', sub: '61 students', tone: 'bad', icon: I.TriangleAlert, onClick: () => setDrill({ title: 'Overdue fees', sub: '61 students · ₹8,40,000', cols: [['Student'], ['Class'], ['Overdue', 'inr'], ['Days late', 'n']], rows: [...DEFAULTERS].sort((a, b) => b.days - a.days).map((d) => [d.s.name, clsOf(d.s), d.amount, d.days]), basis: 'Fee Defaulters, 9 Oct 2026' }) },
            { label: 'Spent', value: crore(spent), sub: 'Salaries are 79%', icon: I.Wallet },
          ]} />
          <div className="grid @xl:grid-cols-2 gap-5 @lg:gap-6 items-start [&>*]:min-w-0">
            <Card>
              <ChartHead title="Collected against due" sub={`By month, in lakhs · ${range}`} icon={I.IndianRupee} />
              <div className="px-3 pb-2"><Bars data={fee.map((m) => ({ k: m.m, v: m.c, v2: m.d }))} max={70} ticks={[0, 30, 60]} label={(v) => `₹${v}L`} ariaLabel="Fee collected against due by month" /></div>
              <div className="px-5 pb-4"><Legend items={[['bg-brand', 'Collected'], ['bg-ink3/30', 'Due']]} /></div>
            </Card>
            <Card>
              <ChartHead title="Income and expense" sub={`By month, in lakhs · ${range}`} icon={I.ChartLine} />
              <div className="px-3 pb-2"><Bars data={previewOf('fi-ie').rows.filter((r) => ms.includes(r[0].slice(0, 3))).map((r) => ({ k: r[0].slice(0, 3), v: Math.round(r[1] / 1e5), v2: Math.round(r[2] / 1e5) }))} max={70} ticks={[0, 30, 60]} label={(v) => `₹${v}L`} ariaLabel="Income and expense by month" /></div>
              <div className="px-5 pb-4"><Legend items={[['bg-brand', 'Income'], ['bg-ink3/30', 'Expense']]} /></div>
            </Card>
            <Card>
              <ChartHead title="Expenses by head" sub={`${range} · ${crore(spent)}`} icon={I.Wallet} />
              <div className="px-5 pb-5"><HBars rows={[['Salaries', 79, 162], ['Transport', 7, 14.6], ['Electricity', 4, 8.1], ['Upkeep', 4, 7.9], ['Lab & books', 3, 6.2], ['Other', 3, 6.5]].map(([k, v, l]) => ({ k, v, label: crore(l * expShare) }))} max={100} labelWidth={84} /></div>
            </Card>
          </div>
        </>}

        {area === 'hr' && !noMonths && <>
          <Stats items={[
            { label: 'Staff', value: '86', sub: '58 teaching', icon: I.Users },
            { label: 'Joined this year', value: '3', sub: '2 left', icon: I.UserPlus, onClick: () => setDrill({ title: 'Joiners and leavers, 2026–27', sub: '3 joined, 2 left', cols: previewOf('hr-moves').cols, rows: previewOf('hr-moves').rows, basis: 'Staff & HR, joining and exit dates' }) },
            { label: 'Present today', value: '82', sub: '1 late, 3 on leave', icon: I.CalendarCheck2, tone: 'ok' },
            { label: 'Leave taken', value: `${leaveDays} days`, sub: `All staff · ${range}`, icon: I.CalendarDays },
          ]} />
          <div className="grid @xl:grid-cols-2 gap-5 @lg:gap-6 items-start [&>*]:min-w-0">
            <Card>
              <ChartHead title="Staff by department" sub="86 on the rolls" icon={I.Users} />
              <div className="px-5 pb-5"><HBars rows={[{ k: 'Teaching', v: 58, label: '58' }, { k: 'Transport', v: 12, label: '12' }, { k: 'Office', v: 6, label: '6' }, { k: 'Hostel', v: 3, label: '3' }, { k: 'Support', v: 3, label: '3' }, { k: 'Accounts', v: 2, label: '2' }, { k: 'Library', v: 1, label: '1' }, { k: 'Stores', v: 1, label: '1' }]} max={60} labelWidth={78} /></div>
            </Card>
            <Card>
              <ChartHead title="Leave taken by month" sub={`Days, all staff · ${range}`} icon={I.CalendarDays} />
              {lv.length ? <>
                <div className="px-3 pb-2"><Bars data={lv} max={70} ticks={[0, 30, 60]} ariaLabel="Leave days by month" /></div>
                {ms.includes('Sep') && <p className="px-5 pb-4 text-[12.5px] text-ink3">September was high: 14 days of sick leave during the viral fever weeks.</p>}
              </> : <Empty icon={I.CalendarDays} title="No leave in these dates" body="School was closed, or nobody was on leave." />}
            </Card>
          </div>
        </>}

        {area === 'workload' && <>
          <Stats items={[
            { label: 'Average load', value: '28', sub: 'Periods a week, limit 32', icon: I.Clock },
            { label: 'Near the limit', value: '6', sub: '30 or more periods', tone: 'warn', icon: I.TriangleAlert },
            { label: 'Substitutions', value: String(subs(28)), sub: `Most taken: Ravi Teja, ${subs(5)} · ${range}`, icon: I.RefreshCw },
          ]} />
          <Card>
            <ChartHead title="Periods a week, by teacher" sub="Line at the 32-period limit · Classes 6–10" icon={I.Clock} />
            <div className="px-5 pb-4"><HBars rows={WORKLOAD.map(([n, p]) => ({ k: n, v: p, label: String(p) }))} max={36} goal={32} labelWidth={132} /></div>
            <div className="px-5 pb-4 border-t border-line/70 pt-3">
              <p className="text-[12.5px] text-ink3 font-semibold mb-2">Substitutions taken · {range}</p>
              {WORKLOAD.some((w) => subs(w[2]))
                ? <div className="flex gap-1.5 flex-wrap">{WORKLOAD.filter((w) => subs(w[2])).sort((a, b) => b[2] - a[2]).map(([n, , s]) => <SmallBtn key={n} onClick={() => toast({ title: `${n}: ${subs(s)} substitutions`, body: `${range} · the list is in Academics, Timetable`, tone: 'info' })}>{n.split(' ')[0]} · {subs(s)}</SmallBtn>)}</div>
                : <p className="text-[13px] text-ink3">No substitutions in these dates.</p>}
            </div>
          </Card>
        </>}

        {area === 'teachers' && (['principal', 'academichead'].includes(role.id) ? <>
          <Banner tone="info" title="Facts, not ratings.">Syllabus done against the plan, and how each teacher’s classes did in Unit Test 2. Seen only by the Principal and the Academic Head.</Banner>
          <Card className="overflow-hidden">
            <ChartHead title="Syllabus and results by teacher" sub="Chapters planned by 9 Oct and done · Unit Test 2 of their classes" icon={I.BookOpen} />
            <SimpleTable minWidth={760} cols={[
              { label: 'Teacher', render: (x) => <span className="inline-flex items-center gap-2.5"><Avatar name={x[0]} size={28} />{x[0]}</span> },
              { label: 'Subject', render: (x) => x[1] },
              { label: 'Classes', render: (x) => <span className="text-ink3">{x[2]}</span> },
              { label: 'Syllabus', render: (x) => <span className="inline-flex items-center gap-2 tnum"><Progress value={(x[4] / x[3]) * 100} tone={x[4] < x[3] ? 'warn' : 'ok'} className="w-20" />{x[4]} of {x[3]}</span> },
              { label: 'Average', right: true, render: (x) => `${x[5]}%` },
              { label: 'Pass %', right: true, render: (x) => `${x[6]}%` },
            ]} rows={SYLLABUS} />
            <p className="px-5 py-3 border-t border-line text-[12.5px] text-ink3">Class 9 Science is 2 chapters behind (planned 7, done 5). Same as on the Dashboard.</p>
          </Card>
        </> : <Card><Empty icon={I.Lock} title="Seen by the Principal and Academic Head only" body="Results by teacher are sensitive. The syllabus summary is in Academics, Syllabus & Lesson Plans." /></Card>)}
      </div>
      <DrillSheet drill={drill} onClose={() => setDrill(null)} />
    </div>
  );
}

function CompareCampuses() {
  const [kph, myp] = SCHOOLS_IN_GROUP;
  const rows = [
    ['Students', '1,236', '684'], ['Attendance this week', '95.8%', '94.1%'], ['Fees collected of due', '82%', '78%'],
    ['Overdue', '₹8.4 L · 61 students', '₹6.1 L · 47 students'], ['Pass %, Unit Test 2', '92.7%', '89.0%'], ['Staff', '86', '49'], ['Students per teacher', '21', '22'],
  ];
  return (
    <Card className="overflow-hidden">
      <CardHead title="Both campuses, side by side" sub="Same numbers, same dates · 2026–27 so far" icon={I.Building2} />
      <SimpleTable minWidth={480} cols={[{ label: 'Number', render: (x) => x[0] }, { label: kph.place.split(',')[0], right: true, render: (x) => x[1] }, { label: myp.place.split(',')[0].replace(' campus', ''), right: true, render: (x) => x[2] }]} rows={rows} />
    </Card>
  );
}

/* =========================================================================================
   Early Warnings
   ========================================================================================= */
const RULES = { att: 75, watch: 80, pass: 33, fee: 60, drop: 15 };
const SIG = { att: ['CalendarX2', 'Attendance'], marks: ['TrendingDown', 'Marks'], fees: ['IndianRupee', 'Fees'] };
const ST_TONE = { New: 'info', Reviewed: 'brand', 'Action planned': 'warn', Closed: 'neutral' };
const STRENGTH_LBL = { act: 'Act now', watch: 'Watch' };
const BASE_FLAGS = [
  { id: 'w1', name: 'Rahul Verma', cls: '7 A', strength: 'act', status: 'New', raised: 'Wed 30 Sep', signals: [
    { k: 'marks', text: 'Unit Test 2: 34% overall, below 33% in Maths (28%) and Science (31%)', basis: 'Unit Test 2 marks, published 28 Sep · pass mark 33% (Exam Settings)' },
    { k: 'marks', text: 'Marks fell 18% from Unit Test 1 to Unit Test 2 in Maths and Science', basis: 'Unit Test 1 and 2 · marks-drop rule 15%' }] },
  { id: 'w2', name: 'Sneha Das', cls: '7 A', strength: 'act', status: 'New', raised: 'Wed 30 Sep', signals: [
    { k: 'marks', text: 'Unit Test 2: 38% overall, below 33% in Maths (30%)', basis: 'Unit Test 2 marks · pass mark 33%' }] },
  { id: 'w3', name: 'Yash Kumar', cls: '7 A', strength: 'act', status: 'Reviewed', raised: 'Wed 30 Sep', signals: [
    { k: 'marks', text: 'Unit Test 2: 39% overall, below 33% in Maths (32%)', basis: 'Unit Test 2 marks · pass mark 33%' },
    { k: 'marks', text: 'Marks fell 22% from Unit Test 1 to Unit Test 2', basis: 'Unit Test 1 and 2 · marks-drop rule 15%' }],
    reviews: [{ when: 'Fri 2 Oct, 3:10 PM', who: 'Imran Shaikh', what: 'Reviewed: “Missed a week in September with dengue. Will watch the half-yearly.”' }] },
  { id: 'w4', name: 'Varun Reddy', cls: '9 C', strength: 'act', status: 'New', raised: 'Today, 9:15 AM', signals: [
    { k: 'att', text: 'Absent 3 days in a row: Wed 7, Thu 8 and Fri 9 Oct', basis: 'Attendance register · rule: 3 days in a row (Attendance Settings)' },
    { k: 'att', text: 'Attendance 78% this term (watch line 80%, threshold 75%)', basis: 'Attendance, 1 Jun to 9 Oct 2026' }] },
  { id: 'w5', name: 'Riya Varma', cls: '9 C', strength: 'watch', status: 'New', raised: 'Today, 9:15 AM', signals: [
    { k: 'att', text: 'Absent 3 days in a row: Wed 7, Thu 8 and Fri 9 Oct', basis: 'Attendance register · rule: 3 days in a row' }] },
  { id: 'w6', name: 'Tanvi Sharma', cls: '6 A', strength: 'watch', status: 'New', raised: 'Today, 9:15 AM', signals: [
    { k: 'att', text: 'Absent 3 days in a row: Wed 7, Thu 8 and Fri 9 Oct', basis: 'Attendance register · rule: 3 days in a row' }] },
  { id: 'w7', name: 'Ira Shetty', cls: 'LKG B', strength: 'watch', status: 'Action planned', raised: 'Today, 9:15 AM', action: 'Call the parent', signals: [
    { k: 'att', text: 'Absent 3 days in a row: Wed 7, Thu 8 and Fri 9 Oct', basis: 'Attendance register · rule: 3 days in a row' }],
    reviews: [{ when: 'Today, 9:40 AM', who: 'Sunitha Mohan', what: 'Action planned: Call the parent. “Mother says chickenpox, back on Monday. Will check with the doctor’s note.”' }] },
  { id: 'w8', name: 'Ishaan Sharma', cls: '7 B', strength: 'watch', status: 'New', raised: 'Wed 30 Sep', signals: [
    { k: 'att', text: 'Attendance 78% this year (watch line 80%, threshold 75%)', basis: 'Attendance, 1 Jun to 9 Oct 2026' },
    { k: 'marks', text: 'Marks fell 17% from Unit Test 1 to Unit Test 2 in Social Studies', basis: 'Unit Test 1 and 2 · marks-drop rule 15%' }] },
  { id: 'w9', name: 'Meera Chowdary', cls: '9 B', strength: 'watch', status: 'Reviewed', raised: 'Thu 8 Oct', signals: [
    { k: 'att', text: 'Attendance 79% this year (watch line 80%, threshold 75%)', basis: 'Attendance, 1 Jun to 9 Oct 2026' }],
    reviews: [{ when: 'Thu 8 Oct, 4:05 PM', who: 'Swapna Reddy', what: 'Reviewed: “State-level chess on 2 and 3 Oct, on leave with permission.”' }] },
  { id: 'w10', name: 'Ananya Goud', cls: '8 A', strength: 'watch', status: 'Closed', raised: 'Wed 30 Sep', signals: [
    { k: 'marks', text: 'Marks fell 16% from Unit Test 1 to Unit Test 2 in Hindi', basis: 'Unit Test 1 and 2 · marks-drop rule 15%' }],
    reviews: [{ when: 'Mon 5 Oct, 11:20 AM', who: 'Lakshmi Rao', what: 'Not a concern: “Was unwell on the Hindi paper day. Doctor’s note seen.”' }] },
];
// Fee flags come from the same Defaulters list as Fees (over 60 days late)
const FEE_FLAGS = DEFAULTERS.filter((d) => d.days > RULES.fee).sort((a, b) => b.days - a.days).map((d, i) => {
  const aarav = d.id === FEATURED.id;
  return {
    id: `wf${i}`, name: d.s.name, cls: clsOf(d.s), strength: d.days > 90 ? 'act' : 'watch', status: aarav ? 'Action planned' : 'New', raised: 'Fri 9 Oct', fee: true, action: aarav ? 'Fee follow-up by accounts' : undefined,
    signals: [{ k: 'fees', text: `Fees overdue ${d.days} days: ${inr(d.amount)} (${d.head})`, basis: `Fee Defaulters · flag after ${RULES.fee} days (Fee Settings)` }],
    reviews: aarav ? [{ when: 'Wed 7 Oct, 11:20 AM', who: 'Suresh Babu', what: 'Action planned: Fee follow-up. “Called Priya Sharma. Will pay with Q3 tuition on 10 Oct.”' }] : undefined,
  };
});
const ACTIONS = ['Call the parent', 'Meet the parent with the class teacher', 'Refer to the counsellor', 'Extra classes', 'Fee follow-up by accounts'];

function EarlyWarnings() {
  const toast = useToast();
  const { go } = useNav();
  const canEdit = useCanEdit();
  const { role, classes, inScope } = useScope();
  const seeFees = ['principal', 'schooladmin', 'vp'].includes(role.id);
  const seeAI = ['principal', 'schooladmin', 'vp'].includes(role.id);
  const [flags, setFlags] = useState(() => [...BASE_FLAGS, ...FEE_FLAGS]);
  const [status, setStatus] = useState('open');
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const [review, setReview] = useState(null); // { flag, preset }
  const [ruleOpen, setRuleOpen] = useState(false);
  const [drop, setDrop] = useState(RULES.drop);
  const [aiDone, setAiDone] = useState(new Set());
  const [per, setPer] = useState(DP.last30);

  const mine = flags.filter((f) => inScope(f.cls) && (seeFees || !f.fee)).filter((f) => { const d = isoOf(f.raised); return d >= per.from && d <= per.to; });
  const t = q.trim().toLowerCase();
  const list = mine.filter((f) => (status === 'open' ? f.status !== 'Closed' : f.status === status) && (kind === 'all' || f.signals.some((s) => s.k === kind)) && (!t || (f.name + f.cls).toLowerCase().includes(t)))
    .sort((a, b) => (a.strength === b.strength ? 0 : a.strength === 'act' ? -1 : 1));
  const count = (fn) => mine.filter(fn).length;
  const open = flags.find((f) => f.id === openId);
  const saveReview = (id, dec, note, action) => {
    const who = role.person?.name || 'You';
    const st = dec === 'Not a concern' ? 'Closed' : dec;
    setFlags((x) => x.map((f) => (f.id === id ? { ...f, status: st, action: action || f.action, reviews: [{ when: 'Just now', who, what: `${dec}${action ? `: ${action}` : ''}. “${note}”` }, ...(f.reviews || [])] } : f)));
    const f = flags.find((x) => x.id === id);
    toast({ title: st === 'Closed' ? `Closed: ${f.name}` : `${dec}: ${f.name}`, body: action ? (action.includes('counsellor') ? 'Referral sent to Sana Ali (Counsellor). Recorded in the audit log.' : `Task created: ${action}, due Mon 12 Oct. Recorded in the audit log.`) : 'Recorded with your name and note in the audit log.' });
  };

  return (
    <div>
      <ModuleHead sub={classes ? `Students in ${classes.length === 1 ? `Class ${classes[0]}` : 'your classes'} who may need help. Nothing happens until a person reviews.` : 'Students who may need help, from attendance, marks and fees. Nothing happens to a student until a person reviews.'}
        actions={role.id === 'principal' ? <Button variant="secondary" icon={I.Settings2} onClick={() => setRuleOpen(true)}>Marks-drop rule</Button> : null} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        {classes && <Banner tone="info" title="Showing your classes only.">{seeFees ? '' : 'Fee signals go to the Principal and accounts, not to teachers.'}</Banner>}
        <Stats items={[
          { label: 'Act now', value: String(count((f) => f.strength === 'act' && f.status !== 'Closed')), sub: 'Open flags', tone: 'bad', icon: I.TriangleAlert, onClick: () => { setStatus('open'); setKind('all'); } },
          { label: 'Watch', value: String(count((f) => f.strength === 'watch' && f.status !== 'Closed')), sub: 'Open flags', tone: 'warn', icon: I.Eye },
          { label: 'Not reviewed yet', value: String(count((f) => f.status === 'New')), sub: 'Review before any action', tone: 'brand', icon: I.Inbox, onClick: () => setStatus('New') },
          { label: 'Closed', value: String(count((f) => f.status === 'Closed')), sub: 'With a reason each', icon: I.CircleCheck, onClick: () => setStatus('Closed') },
        ]} />
        <Split side={340}>
          <Card className="overflow-hidden">
            <Toolbar>
              <SearchBox id="ew-q" value={q} onChange={setQ} placeholder="Student name or class" />
              <DatePeriod id="ew-dates" value={per} onChange={setPer} className="w-full @md:w-auto" />
              <Segmented value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, { value: 'att', label: 'Attendance' }, { value: 'marks', label: 'Marks' }, ...(seeFees ? [{ value: 'fees', label: 'Fees' }] : [])]} />
            </Toolbar>
            <p className="px-4 pt-3 text-[12.5px] text-ink3">Showing flags raised: {per.label} · {fmtRange(per)}</p>
            <div className="px-3 pt-2">
              <Chips value={status} onChange={setStatus} options={[{ value: 'open', label: 'Open', count: count((f) => f.status !== 'Closed') }, ...['New', 'Reviewed', 'Action planned', 'Closed'].map((s) => ({ value: s, label: s, count: count((f) => f.status === s) }))]} />
            </div>
            <DataList rows={list} onRow={(f) => setOpenId(f.id)} minWidth={720}
              empty={status === 'New' && !t ? <Empty icon={I.CircleCheck} title="Every flag has been reviewed" body="New flags appear here each morning after attendance is taken, and when marks or fees cross a rule." />
                : <Empty icon={I.SearchX} title="No flag matches" body="Try another status, signal or dates." action={<Button variant="secondary" onClick={() => { setQ(''); setKind('all'); setStatus('open'); setPer(DP.acyear); }}>Show all open flags this year</Button>} />}
              columns={[
                { key: 'n', label: 'Student', render: (f) => <span className="flex items-center gap-3"><Avatar name={f.name} size={34} /><span className="min-w-0"><b className="font-semibold block leading-tight">{f.name}</b><span className="text-[12.5px] text-ink3">{f.cls}</span></span></span> },
                { key: 'r', label: 'Why', className: 'max-w-[340px]', render: (f) => <span className="block text-[13px] text-ink2 leading-snug">{f.signals[0].text}{f.signals.length > 1 && <span className="text-ink3"> · +{f.signals.length - 1} more</span>}</span> },
                { key: 's', label: 'Strength', nowrap: true, render: (f) => <Pill tone={f.strength === 'act' ? 'bad' : 'warn'} dot>{STRENGTH_LBL[f.strength]}</Pill> },
                { key: 't', label: 'Status', nowrap: true, render: (f) => <Pill tone={ST_TONE[f.status]}>{f.status}</Pill> },
              ]}
              mobile={(f) => ({ title: f.name, sub: `${f.cls} · ${f.signals[0].text}`, avatar: f.name, pills: [<Pill key="s" tone={f.strength === 'act' ? 'bad' : 'warn'} className="!h-[22px] !text-[11.5px]">{STRENGTH_LBL[f.strength]}</Pill>, <Pill key="t" tone={ST_TONE[f.status]} className="!h-[22px] !text-[11.5px]">{f.status}</Pill>] })}
              footer={`${list.length} ${list.length === 1 ? 'flag' : 'flags'} · Act now first`} />
          </Card>
          <Col>
            <Card>
              <CardHead title="Rules behind the flags" sub="From the settings of each module" icon={I.ListChecks} />
              <ul className="px-5 pb-4 text-[13.5px] divide-y divide-line/70">
                {[['Attendance below', `${RULES.att}% (watch from ${RULES.watch}%)`, 'Attendance Settings'], ['Absent in a row', '3 school days', 'Attendance Settings'], ['Pass mark', `${RULES.pass}% in a subject`, 'Exam Settings'], ['Marks drop between tests', `${drop}% or more`, 'Set here by the Principal'], ...(seeFees ? [['Fees overdue', `${RULES.fee} days`, 'Fee Settings']] : [])].map(([k, v, from]) => (
                  <li key={k} className="py-2.5 flex items-start justify-between gap-3"><span className="min-w-0"><span className="block font-medium">{k}</span><span className="block text-[12px] text-ink3">{from}</span></span><b className="font-semibold tnum text-right">{v}</b></li>
                ))}
              </ul>
              {canEdit && role.id === 'principal' && <div className="px-5 pb-4"><Button size="sm" variant="secondary" icon={I.Pencil} onClick={() => setRuleOpen(true)}>Change the marks-drop rule</Button></div>}
            </Card>
            {seeAI && <>
              <div className="flex items-center gap-2 px-1"><I.Sparkles size={15} className="text-brand" /><p className="text-[13px] font-semibold text-ink2">AI signals</p><span className="text-[12px] text-ink3">· on in Settings, Modules On/Off</span></div>
              {[
                { id: 'ai1', title: 'Varun Reddy (9 C) may be at risk of leaving', source: 'attendance for the last 60 days, Unit Test 1 and 2 marks, and one late fee', body: <>Attendance has fallen three months in a row (91%, 84%, 78%) and he is absent all this week. Students with this pattern left before March in 2 of the last 3 years. A call from the class teacher may help; you decide.</>, flag: 'w4' },
                { id: 'ai2', title: 'Class 9 Maths may do worse in the half-yearly', source: 'Unit Test 1 and 2 marks in Class 9 and last year’s half-yearly', body: <>The pass % in Class 9 Maths may be about <b className="font-semibold text-ink">81%</b>, against 88% last year. 11 students are close to the 33% line.</> },
                { id: 'ai3', title: 'Unusual: 14 attendance changes in Class 8 A', source: 'change log of the attendance register, 1 to 9 Oct', body: <>14 marks in 8 A were changed from absent to present on Wed 7 Oct after 6 PM, all by one login (office desk 2). Usually there are 1 or 2 a week. Please check with the class teacher.</> },
              ].filter((s) => !aiDone.has(s.id)).map((s) => (
                <Suggestion key={s.id} title={s.title} source={s.source}
                  actions={canEdit ? <>
                    <Button size="sm" variant="soft" onClick={() => { if (s.flag) setOpenId(s.flag); else { setFlags((x) => [{ id: `n${s.id}`, name: s.id === 'ai2' ? 'Class 9 Mathematics' : 'Class 8 A register', cls: s.id === 'ai2' ? '9' : '8 A', strength: 'watch', status: 'New', raised: 'Just now', signals: [{ k: s.id === 'ai2' ? 'marks' : 'att', text: s.title, basis: `Suggestion · based on ${s.source}` }] }, ...x]); setStatus('New'); toast({ title: 'Added to the list for review', body: 'Nothing changes until someone reviews it' }); } setAiDone((x) => new Set(x).add(s.id)); }}>{s.flag ? 'Open the flag' : 'Add for review'}</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setAiDone((x) => new Set(x).add(s.id)); toast({ title: 'Closed as not a concern', body: 'Thanks. We will improve these suggestions.', tone: 'info' }); }}>Not a concern</Button>
                  </> : null}>{s.body}</Suggestion>
              ))}
              {aiDone.size === 3 && <Card><Empty icon={I.Sparkles} title="No AI signals right now" body="New ones appear here after each day’s attendance and each exam." /></Card>}
            </>}
          </Col>
        </Split>
      </div>

      <FlagSheet f={open} onClose={() => setOpenId(null)} canEdit={canEdit} onReview={(preset) => setReview({ flag: open, preset })} onProfile={() => { setOpenId(null); go('student'); }} />
      <ReviewSheet r={review} onClose={() => setReview(null)} onSave={(dec, note, action) => { saveReview(review.flag.id, dec, note, action); setOpenId(null); }} />
      <FormSheet open={ruleOpen} onClose={() => setRuleOpen(false)} title="Marks-drop rule" sub="A student is flagged when marks fall this much from one test to the next" submitLabel="Save rule"
        onSubmit={() => { if (!(drop >= 5 && drop <= 50)) return false; toast({ title: `Marks-drop rule: ${drop}%`, body: 'Applies from the half-yearly. Recorded in the audit log.' }); return true; }}>
        <Field label="Flag when marks fall by (%)" required id="ew-drop" error={!(drop >= 5 && drop <= 50) && 'Enter a number from 5 to 50'} hint="Default 15%. The other thresholds come from Attendance, Exam and Fee Settings.">
          <Input id="ew-drop" inputMode="numeric" value={drop || ''} onChange={(e) => setDrop(Number(e.target.value.replace(/\D/g, '').slice(0, 2)))} error={!(drop >= 5 && drop <= 50)} className="tnum" disabled={!canEdit} />
        </Field>
      </FormSheet>
    </div>
  );
}

function FlagSheet({ f, onClose, canEdit, onReview, onProfile }) {
  const [warn, setWarn] = useState(false);
  useEffect(() => { setWarn(false); }, [f?.id]);
  if (!f) return null;
  const isNew = f.status === 'New';
  return (
    <Sheet open={!!f} onClose={onClose} wide title={`${f.name} · ${f.cls}`} sub={`Raised ${f.raised} · ${STRENGTH_LBL[f.strength]} · ${f.status}`}
      footer={canEdit && f.status !== 'Closed' ? <>
        <Button variant="ghost" icon={I.User} onClick={onProfile}>Open profile</Button>
        <Button variant="secondary" icon={I.ListTodo} onClick={() => (isNew ? setWarn(true) : onReview('Action planned'))}>Plan an action</Button>
        <Button variant="primary" icon={I.Check} onClick={() => onReview(isNew ? 'Reviewed' : 'Reviewed')}>Review</Button>
      </> : <Button variant="ghost" onClick={onClose}>Close</Button>}>
      <div className="flex flex-col gap-4">
        {warn && <Banner tone="warn" title="Review this flag first.">Check the reason and write a note. You can plan the action in the same step.</Banner>}
        <ul className="flex flex-col gap-2.5">
          {f.signals.map((s, i) => (
            <li key={i} className="rounded-2xl border border-line p-3.5 flex gap-3">
              <IconTile name={SIG[s.k][0]} tone={f.strength === 'act' ? 'bad' : 'warn'} />
              <div className="min-w-0">
                <p className="text-[12px] text-ink3 font-semibold">{SIG[s.k][1]}</p>
                <p className="text-[14.5px] font-semibold leading-snug">{s.text}</p>
                <p className="text-[12.5px] text-ink3 mt-1">Based on: {s.basis}</p>
              </div>
            </li>
          ))}
        </ul>
        {f.action && <p className="text-[13.5px] text-ink2 flex items-center gap-2"><I.ListTodo size={16} className="text-ink3" />Planned: <b className="font-semibold text-ink">{f.action}</b></p>}
        <div>
          <p className="eyebrow text-ink3 mb-2">Review history</p>
          {f.reviews?.length ? <Timeline items={f.reviews.map((r) => ({ what: <><b className="font-semibold">{r.who}</b> · {r.what}</>, when: r.when, icon: 'UserCheck', tone: 'brand' }))} />
            : <p className="text-[13.5px] text-ink3">Not reviewed yet. Nothing happens to {f.name.split(' ')[0]} from this flag alone.</p>}
        </div>
      </div>
    </Sheet>
  );
}

function ReviewSheet({ r, onClose, onSave }) {
  const [dec, setDec] = useState('Reviewed');
  const [note, setNote] = useState('');
  const [action, setAction] = useState('');
  const [tried, setTried] = useState(false);
  useEffect(() => { if (r) { setDec(r.preset || 'Reviewed'); setNote(''); setAction(r.preset === 'Action planned' ? (r.flag.fee ? 'Fee follow-up by accounts' : 'Call the parent') : ''); setTried(false); } }, [r]);
  const err = {
    note: note.trim().length < 5 ? (dec === 'Not a concern' ? 'Say why this is not a concern' : 'Write a short note, so others understand later') : '',
    action: dec === 'Action planned' && !action ? 'Pick the action to plan' : '',
  };
  return (
    <FormSheet open={!!r} onClose={onClose} title={r ? `Review: ${r.flag.name}` : ''} sub="Your name, the time and your note are saved with the flag" submitLabel={dec === 'Not a concern' ? 'Close the flag' : dec === 'Action planned' ? 'Save and plan action' : 'Mark reviewed'}
      onSubmit={() => { setTried(true); if (err.note || err.action) return false; onSave(dec, note.trim(), dec === 'Not a concern' ? '' : action); return true; }}>
      <Field label="Decision" required id="rv-dec"><Segmented value={dec} onChange={setDec} className="w-full" options={['Reviewed', 'Action planned', 'Not a concern']} /></Field>
      <Field label="Note" required id="rv-note" error={(tried || note) && err.note}><Textarea id="rv-note" value={note} onChange={setNote} rows={3} placeholder={dec === 'Not a concern' ? 'Was unwell on the exam day; doctor’s note seen' : 'Spoke to the student after class…'} /></Field>
      {dec !== 'Not a concern' && (
        <Field label={dec === 'Action planned' ? 'Action' : 'Action (optional)'} required={dec === 'Action planned'} id="rv-act" error={tried && err.action}
          hint={action ? (action.includes('counsellor') ? 'Sends a counselling referral to Sana Ali' : action.includes('Fee') ? 'Creates a task for Suresh Babu (Accounts), due Mon 12 Oct' : 'Creates a task for the class teacher, due Mon 12 Oct') : 'Creates a task or a counselling referral'}>
          <Select id="rv-act" value={action} onChange={setAction} error={tried && err.action} options={[{ value: '', label: 'No action yet' }, ...ACTIONS.filter((a) => r?.flag.fee || !a.includes('Fee')).map((a) => ({ value: a, label: a }))]} />
        </Field>
      )}
    </FormSheet>
  );
}

/* =========================================================================================
   Government Reports
   ========================================================================================= */
const GOV = [
  { id: 'udise', name: 'UDISE+ school data', sub: 'School, students, staff and facilities in the UDISE+ structure', ver: '2026–27 v2', vers: ['2026–27 v2', '2026–27 v1'], icon: 'Landmark', file: 'UDISE-36290401512-2026-27.zip', rows: '1,236 students · 86 staff · 1 school',
    problems: [
      { id: 'u1', text: 'Date of birth missing for 3 students', who: 'student', recs: [['Sai Charan Goud', '6 A', 'Date of birth'], ['Meghana Rao', 'LKG A', 'Date of birth'], ['Abhiram Das', '2 B', 'Date of birth']] },
      { id: 'u2', text: 'Social category missing for 5 students', who: 'student', recs: [['Ishaan Joshi', '3 A', 'Social category'], ['Navya Pillai', '4 B', 'Social category'], ['Kabir Shetty', '5 A', 'Social category'], ['Riya Menon', '8 A', 'Social category'], ['Dhruv Kumar', '10 C', 'Social category']] },
      { id: 'u3', text: 'Aadhaar not verified for 2 staff members', who: 'staff', recs: [['Mohammed Asif', 'PET', 'Aadhaar'], ['Ramu Yadav', 'Store Keeper', 'Aadhaar']] },
      { id: 'u4', text: 'Highest qualification missing for 1 teacher', who: 'staff', recs: [['Karthik Menon', 'TGT Computer Science', 'Qualification']] },
      { id: 'u5', text: 'Number of working computers not entered', who: 'facility', recs: [['Computer lab', 'Inventory', 'Working computers']] },
    ] },
  { id: 'apaar', name: 'APAAR and PEN details', sub: 'APAAR ID, PEN and consent status for every student', ver: '2026–27 v1', vers: ['2026–27 v1'], icon: 'IdCard', file: 'APAAR-PEN-SPS-2026-27.csv', rows: '1,236 students',
    problems: [
      { id: 'a1', text: '227 students have no APAAR consent recorded', who: 'student', n: 227, recs: [['Aditya Kumar', '1 A', 'Consent'], ['Zara Hussain', '2 A', 'Consent'], ['Tejas Rao', '4 B', 'Consent'], ['Kavya Naidu', '6 B', 'Consent'], ['Rohan Verma', '9 A', 'Consent']] },
      { id: 'a2', text: 'PEN not generated for 14 new admissions', who: 'student', n: 14, recs: [['Arjun Mehta', '7 B', 'PEN'], ['Reyansh Naidu', '1 B', 'PEN'], ['Sai Charan Goud', '6 A', 'PEN']] },
      { id: 'a3', text: 'Name differs from Aadhaar for 3 students', who: 'student', recs: [['Sri Harini Joshi', '7 A', 'Name (Aadhaar: Harini Joshi)'], ['Mohd. Kabir Singh', '9 A', 'Name (Aadhaar: Kabir Singh)'], ['Lasya K', '8 B', 'Name (Aadhaar: Lasya Kumar)']] },
    ] },
  { id: 'rte', name: 'RTE 25% seats claim', sub: 'Students on RTE seats and the fee reimbursement claim to the state', ver: '2026–27 v1', vers: ['2026–27 v1'], icon: 'Scale', file: 'RTE-claim-SPS-2026-27.xlsx', rows: '38 students · ₹19,76,000',
    problems: [{ id: 'r1', text: 'Income certificate expired for 2 students', who: 'student', recs: [['Manish Goud', '3 B', 'Income certificate (expired 31 Mar 2026)'], ['Pooja Das', '5 A', 'Income certificate (expired 31 Mar 2026)']] }] },
  { id: 'cbse9', name: 'CBSE registration, Class 9', sub: 'Registration data for the CBSE portal (affiliation 3630417)', ver: '2026–27 v1', vers: ['2026–27 v1'], icon: 'BadgeCheck', file: 'CBSE-REG-IX-55417-2026.xlsx', rows: '118 students', problems: [] },
  { id: 'cbse10', name: 'CBSE list of candidates, Class 10', sub: 'Board exam candidates with subjects, for March 2027', ver: '2026–27 v1', vers: ['2026–27 v1'], icon: 'ClipboardCheck', file: 'CBSE-LOC-X-55417-2027.xlsx', rows: '112 students',
    problems: [{ id: 'c1', text: 'Subject code missing for 4 students (second language)', who: 'student', recs: [['Tanvi Singh', '10 B', 'Second language'], ['Pranav Reddy', '10 A', 'Second language'], ['Harini Menon', '10 C', 'Second language'], ['Yash Gupta', '10 C', 'Second language']] }] },
];
const PAST = [
  { id: 'p1', when: '12 Oct 2025', what: 'UDISE+ school data', ver: '2025–26 v3', by: 'Anita Sharma', file: 'UDISE-36290401512-2025-26.zip', note: 'Exported with 0 problems' },
  { id: 'p2', when: '28 Aug 2026', what: 'CBSE registration, Class 9', ver: '2026–27 v1', by: 'Anita Sharma', file: 'CBSE-REG-IX-55417-2026.xlsx', note: 'First list, 112 students' },
  { id: 'p3', when: '14 Jul 2026', what: 'RTE 25% seats claim', ver: '2026–27 v1', by: 'Suresh Babu', file: 'RTE-claim-SPS-2026-27.xlsx', note: 'Exported anyway, 1 problem in a separate file' },
  { id: 'p4', when: '3 Jul 2026', what: 'APAAR and PEN details', ver: '2026–27 v1', by: 'Naveen Kumar', file: 'APAAR-PEN-SPS-2026-27.csv', note: 'For APAAR ID creation' },
];

function GovernmentReports() {
  const toast = useToast();
  const { go } = useNav();
  const canEdit = useCanEdit();
  const { role } = useRole();
  const [sel, setSel] = useState('udise');
  const [state, setState] = useState({}); // id -> 'checking' | 'checked'
  const [ver, setVer] = useState({});
  const [year, setYear] = useState('2026–27');
  const [recs, setRecs] = useState(null);
  const [anyway, setAnyway] = useState(false);
  const [past, setPast] = useState(PAST);
  const [per, setPer] = useState(DP.last6m);
  const isoY = (w) => { const m = /(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})/.exec(w); return m ? `${m[3]}-${String(MON3.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}` : isoOf(w); };
  const shown = past.filter((p) => { const d = isoY(p.when); return d >= per.from && d <= per.to; });
  const g = GOV.find((x) => x.id === sel);
  const v = ver[g.id] || g.vers[0];
  const st = state[g.id];
  const old = v !== g.vers[0];
  useEffect(() => {
    if (st !== 'checking') return undefined;
    const t = setTimeout(() => setState((x) => ({ ...x, [g.id]: 'checked' })), 1400);
    return () => clearTimeout(t);
  }, [st, g.id]);
  const runCheck = () => setState((x) => ({ ...x, [g.id]: 'checking' }));
  const doExport = (withProblems) => {
    const by = role.person?.name || 'You';
    setPast((p) => [{ id: `p${Date.now()}`, when: 'Today, 10:45 AM', what: g.name, ver: v, by, file: g.file, note: withProblems ? `Exported anyway, ${g.problems.length} problems in a separate file` : 'Exported with 0 problems' }, ...p]);
    toast({ title: `Saved: ${g.file}`, body: withProblems ? `Format ${v} · problems listed in ${g.file.replace(/\.\w+$/, '')}-problems.xlsx · logged in the export log` : `Format ${v} · ${g.rows} · logged in the export log` });
  };
  return (
    <div>
      <ModuleHead sub="UDISE+, APAAR and PEN, RTE and CBSE returns in the government’s latest format. Check the data first, then export." />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Split side={340} className="[&>*]:min-w-0">
          <Col>
            <Card>
              <CardHead title={g.name} sub={g.sub} icon={I[g.icon]} action={<Pill tone={old ? 'warn' : 'ok'} className="hidden @sm:inline-flex">Format {v}</Pill>} />
              <div className="grid grid-cols-1 @md:grid-cols-3 gap-3 px-5 pb-4">
                <Field label="Academic year" id="gv-year"><Select id="gv-year" value={year} onChange={(y) => { setYear(y); setState((x) => ({ ...x, [g.id]: undefined })); }} options={AY} /></Field>
                <Field label="Format version" id="gv-ver" hint={old ? 'An older format. The portal may not accept it.' : 'Latest, kept up to date by DREAM TEAM SERVICES'}><Select id="gv-ver" value={v} onChange={(x) => { setVer((o) => ({ ...o, [g.id]: x })); setState((s) => ({ ...s, [g.id]: undefined })); }} options={g.vers.map((x, i) => ({ value: x, label: i === 0 ? `${x} (latest)` : x }))} /></Field>
                <Field label="Campus" id="gv-campus"><Select id="gv-campus" value="kph" onChange={() => {}} options={CAMPUS} /></Field>
              </div>
              <div className="border-t border-line/70">
                {!st && (
                  <Empty icon={I.ListChecks} title="Check the data before you export" body={`Looks for missing or wrong details in ${g.rows}, in the ${v} format.`}
                    action={canEdit ? <Button variant="primary" icon={I.Play} onClick={runCheck}>Run the data check</Button> : <p className="text-[13px] text-ink3">You can view only. The office runs these exports.</p>} />
                )}
                {st === 'checking' && (
                  <div className="flex flex-col items-center text-center px-6 py-14 gap-3 animate-fade">
                    <span className="w-14 h-14 rounded-2xl bg-brand/10 text-brand grid place-items-center"><Spinner size={24} /></span>
                    <h3 className="font-semibold text-[15px]">Checking {g.rows}…</h3>
                    <p className="text-sm text-ink3">Every required field in the {v} format</p>
                  </div>
                )}
                {st === 'checked' && (g.problems.length === 0 ? (
                  <div className="p-5 flex flex-col gap-4 animate-fade">
                    <Banner tone="ok" title={`${g.name.split(',')[0]} format ${v}. No problems found.`}>All {g.rows} have every required detail.</Banner>
                    {canEdit && <div className="flex gap-2 flex-wrap"><Button variant="primary" icon={I.Download} onClick={() => doExport(false)}>Export the file</Button><Button variant="ghost" icon={I.RefreshCw} onClick={runCheck}>Check again</Button></div>}
                  </div>
                ) : (
                  <div className="animate-fade">
                    <div className="p-5 pb-3"><Banner tone="warn" title={`Format ${v}. ${g.problems.length} ${g.problems.length === 1 ? 'problem' : 'problems'} found.`}>Fix them and check again, or export anyway with the problems in a separate file.</Banner></div>
                    <ul className="px-2 pb-2">
                      {g.problems.map((p) => (
                        <li key={p.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/60">
                          <IconTile name={p.who === 'staff' ? 'Users' : p.who === 'facility' ? 'Building2' : 'GraduationCap'} tone="warn" />
                          <p className="min-w-0 flex-1 text-[14px] font-semibold leading-snug">{p.text}</p>
                          <Button size="sm" variant="secondary" onClick={() => setRecs(p)}>Open records</Button>
                        </li>
                      ))}
                    </ul>
                    {canEdit && <div className="px-5 py-4 border-t border-line/70 flex gap-2 flex-wrap">
                      <Button variant="primary" icon={I.RefreshCw} onClick={runCheck}>Check again</Button>
                      <Button variant="secondary" icon={I.Download} onClick={() => setAnyway(true)}>Export anyway</Button>
                    </div>}
                  </div>
                ))}
              </div>
            </Card>

            <Card className="overflow-hidden">
              <CardHead title="Past exports" sub="Also in the export log, Settings" icon={I.History} />
              <Toolbar>
                <DatePeriod id="gv-dates" value={per} onChange={setPer} className="w-full @md:w-auto" />
                <span className="text-[12.5px] text-ink3">Showing: {per.label} · {fmtRange(per)}</span>
              </Toolbar>
              <DataList rows={shown} minWidth={680}
                empty={<Empty icon={I.History} title="No exports in these dates" body="Try a longer stretch of dates." action={<Button variant="secondary" onClick={() => setPer({ key: 'custom', label: 'Custom dates', from: DP.lastacyear.from, to: DP.acyear.to })}>Show the last two school years</Button>} />}
                columns={[
                  { key: 'w', label: 'Date', nowrap: true, render: (p) => p.when },
                  { key: 'e', label: 'Export', render: (p) => <><b className="font-semibold block leading-tight">{p.what}</b><span className="text-[12.5px] text-ink3">{p.note}</span></> },
                  { key: 'v', label: 'Format', nowrap: true, render: (p) => p.ver },
                  { key: 'b', label: 'By', nowrap: true, render: (p) => p.by },
                  { key: 'f', label: '', render: (p) => <Button size="sm" variant="ghost" icon={I.Download} onClick={() => toast({ title: `Downloaded again: ${p.file}`, body: 'The same file as exported on ' + p.when })}>File</Button> },
                ]}
                mobile={(p) => ({ title: p.what, sub: `${p.when} · ${p.ver} · ${p.by}`, icon: 'FileDown' })}
                footer={`${shown.length} ${shown.length === 1 ? 'export' : 'exports'} in these dates`} />
            </Card>
          </Col>

          <Col>
            <Card>
              <CardHead title="Government returns" sub="Pick one to check and export" icon={I.Landmark} />
              <ul className="px-2 pb-2">
                {GOV.map((x) => {
                  const s = state[x.id];
                  return (
                    <li key={x.id}>
                      <button onClick={() => setSel(x.id)} className={cx('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition', sel === x.id ? 'bg-brand/8' : 'hover:bg-sunken/70')}>
                        <IconTile name={x.icon} tone={sel === x.id ? 'brand' : 'neutral'} />
                        <span className="min-w-0 flex-1">
                          <span className={cx('block font-semibold text-[14px] leading-tight truncate', sel === x.id && 'text-brand')}>{x.name}</span>
                          <span className="block text-[12px] text-ink3 truncate">Format {x.vers[0]}</span>
                        </span>
                        {s === 'checked' && <Pill tone={x.problems.length ? 'warn' : 'ok'} className="!h-5 !text-[11px]">{x.problems.length ? `${x.problems.length} to fix` : 'Ready'}</Pill>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
            <Card>
              <CardHead title="School codes used" icon={I.IdCard} />
              <ul className="px-5 pb-4 text-[13.5px] divide-y divide-line/70">
                {[['UDISE code', '36290401512'], ['CBSE affiliation', '3630417'], ['CBSE school code', '55417'], ['APAAR consent', '1,009 of 1,236 given']].map(([k, val]) => <li key={k} className="flex justify-between gap-3 py-2"><span className="text-ink2">{k}</span><b className="font-semibold tnum font-mono text-[13px]">{val}</b></li>)}
              </ul>
              <p className="px-5 pb-4 text-[12.5px] text-ink3">Change these in Settings, School Profile.</p>
            </Card>
            <Card>
              <CardHead title="Direct upload to the portals" sub="Where an official connection exists" icon={I.Globe} action={<Pill tone="neutral">Later</Pill>} />
              <p className="px-5 pb-4 text-[13.5px] text-ink2">For now, download the file and upload it on the UDISE+, APAAR or CBSE portal. Direct upload will come when the government opens these connections.</p>
            </Card>
          </Col>
        </Split>
      </div>

      <Sheet open={!!recs} onClose={() => setRecs(null)} wide title={recs?.text} sub={recs?.n ? `${recs.n} records · the first ${recs.recs.length} are below, all are in the problems file` : `${recs?.recs.length} records`}
        footer={<Button variant="ghost" onClick={() => setRecs(null)}>Close</Button>}>
        {recs && (
          <ul className="-mx-2">
            {recs.recs.map(([n, c, field]) => (
              <li key={n} className="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-sunken/60">
                {recs.who === 'facility' ? <IconTile name="Building2" /> : <Avatar name={n} size={36} />}
                <span className="min-w-0 flex-1"><b className="font-semibold text-[14px] block truncate">{n}</b><span className="text-[12.5px] text-ink3">{c} · missing or wrong: {field}</span></span>
                <Button size="sm" variant="secondary" onClick={() => { setRecs(null); recs.who === 'staff' ? go('staff', { page: 'list' }) : recs.who === 'facility' ? go('inventory', { page: 'assets' }) : go('student'); }}>{recs.who === 'facility' ? 'Open Inventory' : 'Open profile'}</Button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
      <ConfirmSheet open={anyway} onClose={() => setAnyway(false)} title={`Export ${g.name} with ${g.problems.length} problems?`}
        sub="The file is made with what is there now. The problems go in a separate file so the office can fix them on the portal or here." confirmLabel="Export anyway"
        onConfirm={() => doExport(true)}>
        <ul className="text-[13.5px] text-ink2 flex flex-col gap-1.5 mb-1">{g.problems.map((p) => <li key={p.id} className="flex gap-2"><I.TriangleAlert size={15} className="text-warn shrink-0 mt-0.5" />{p.text}</li>)}</ul>
      </ConfirmSheet>
    </div>
  );
}

/* =========================================================================================
   Custom & Scheduled Reports
   ========================================================================================= */
const AREAS_DATA = {
  students: { label: 'Students', fields: [['name', 'Student'], ['cls', 'Class'], ['adm', 'Admission no.'], ['father', 'Father'], ['phone', 'Phone'], ['status', 'Status'], ['gender', 'Boy or girl'], ['aadhaar', 'Aadhaar', true]] },
  fees: { label: 'Fees', fields: [['name', 'Student'], ['cls', 'Class'], ['feeState', 'Fee status'], ['due', 'Amount due'], ['phone', 'Parent phone']] },
  attendance: { label: 'Attendance', fields: [['name', 'Student'], ['cls', 'Class'], ['att', 'Attendance %'], ['absent', 'Days absent']] },
  exams: { label: 'Exam marks', fields: [['name', 'Student'], ['cls', 'Class'], ['ut1', 'Unit Test 1 %'], ['ut2', 'Unit Test 2 %'], ['change', 'Change']] },
  staff: { label: 'Staff', fields: [['sname', 'Name'], ['dept', 'Department'], ['desig', 'Role'], ['joined', 'Joined'], ['sphone', 'Phone'], ['salary', 'Salary', true]] },
};
const valOf = (s, k) => {
  if (s.dept) return { sname: s.name, dept: s.dept, desig: s.desig, joined: s.joined, sphone: s.phone }[k];
  const u1 = 50 + ((s.att * 7) % 45), u2 = Math.max(20, u1 + (((s.att * 13) % 21) - 10));
  return { name: s.name, cls: clsOf(s), adm: s.adm, father: s.father, phone: s.phone, status: s.status, gender: s.girl ? 'Girl' : 'Boy', feeState: s.feeState, due: s.due, att: s.att, absent: Math.round(((100 - s.att) * 88) / 100), ut1: u1, ut2: u2, change: u2 - u1 }[k];
};
const KIND_OF = { due: 'inr', att: 'pct', absent: 'n', ut1: 'pct', ut2: 'pct', change: 'n' };
const STAFF_PEOPLE = [
  { id: 'me', name: 'Lakshmi Rao', role: 'Principal', can: ['all'] }, { id: 'as', name: 'Anita Sharma', role: 'School Admin', can: ['all'] },
  { id: 'sb', name: 'Suresh Babu', role: 'Accountant', can: ['fees', 'Fees', 'Finance', 'Salary'] }, { id: 'rt', name: 'Ravi Teja', role: 'Class Teacher · 7 B', can: ['students', 'attendance', 'exams', 'Students', 'Attendance', 'Exams'] },
  { id: 'mp', name: 'Meena Pillai', role: 'Academic Head', can: ['students', 'attendance', 'exams', 'Students', 'Attendance', 'Exams'] }, { id: 'sv', name: 'Shalini Verma', role: 'HR', can: ['staff', 'Staff and HR', 'Salary', 'Attendance'] },
];
const PERSON = Object.fromEntries(STAFF_PEOPLE.map((p) => [p.id, p]));
const canSee = (p, area) => p.can.includes('all') || p.can.includes(area);
const BASE_SCHEDULES = [
  { id: 's1', name: 'Fee defaulters', src: 'Catalogue', area: 'Fees', freq: 'Weekly, Monday 8:00 AM', format: 'Excel', to: ['me', 'sb'], last: 'Mon 5 Oct, 8:00 AM', status: 'Active', filters: 'All classes · overdue only' },
  { id: 's2', name: 'Daily attendance', src: 'Catalogue', area: 'Attendance', freq: 'Daily, 10:00 AM', format: 'PDF', to: ['me', 'mp'], last: 'Today, 10:00 AM', status: 'Active', filters: 'All classes · today' },
  { id: 's3', name: 'Class 9 weekly marks and attendance', src: 'Custom', area: 'Students', freq: 'Weekly, Saturday 1:00 PM', format: 'PDF', to: ['me', 'mp'], last: 'Sat 3 Oct, 1:00 PM', status: 'Active', filters: 'Class 9 · last week' },
  { id: 's4', name: 'Fee collection', src: 'Catalogue', area: 'Fees', freq: 'Monthly, 1st at 9:00 AM', format: 'PDF', to: ['me', 'as', 'sb'], last: 'Thu 1 Oct, 9:00 AM', status: 'Active', filters: 'Financial year 2026–27 · last month' },
  { id: 's5', name: 'Leave taken', src: 'Catalogue', area: 'Staff and HR', freq: 'Monthly, 1st at 9:00 AM', format: 'Excel', to: ['sv'], last: 'Thu 1 Oct, 9:00 AM', status: 'Paused', filters: 'All staff · last month' },
];
const BASE_CUSTOM = [
  { id: 'c1', name: 'Class 9 weekly marks and attendance', area: 'students', cols: 5, filters: 'Class 9', by: 'Lakshmi Rao', saved: '14 Sep' },
  { id: 'c2', name: 'Bus students with fees due', area: 'fees', cols: 4, filters: 'Transport fee · due', by: 'Suresh Babu', saved: '2 Sep' },
  { id: 'c3', name: 'New admissions without documents', area: 'students', cols: 4, filters: 'New this year · papers missing', by: 'Anita Sharma', saved: '22 Jul' },
];

function CustomReports({ params }) {
  const toast = useToast();
  const canEdit = useCanEdit();
  const [view, setView] = useState('mine');
  const [scheds, setScheds] = useState(BASE_SCHEDULES);
  const [custom, setCustom] = useState(BASE_CUSTOM);
  const [filter, setFilter] = useState('Active');
  const [schedFor, setSchedFor] = useState(params?.schedule ? (REPORT[params.schedule]?.name || null) : null);
  const [edit, setEdit] = useState(null);
  const [arch, setArch] = useState(null);
  const [preset, setPreset] = useState(null);
  const rows = scheds.filter((s) => s.status === filter);
  const setStatus = (s, st, msg) => { setScheds((x) => x.map((y) => (y.id === s.id ? { ...y, status: st } : y))); toast({ title: msg, body: s.name, undo: () => setScheds((x) => x.map((y) => (y.id === s.id ? { ...y, status: s.status } : y))) }); };
  return (
    <div>
      <ModuleHead sub="Build your own report, and have any report emailed every day, week or month"
        actions={<>
          <Button variant="secondary" icon={I.CalendarClock} onClick={() => setSchedFor('')}>Schedule a report</Button>
          <Button variant="primary" icon={I.Plus} onClick={() => { setPreset(null); setView('build'); }}>Build a report</Button>
        </>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Segmented value={view} onChange={setView} className="self-start" options={[{ value: 'mine', label: 'My reports and schedules' }, { value: 'build', label: 'Build a report' }]} />
        {view === 'mine' ? <>
          <Card className="overflow-hidden">
            <CardHead title="Scheduled emails" sub="Sent from reports@sunriseps.in · recipients must be allowed to see the data" icon={I.CalendarClock} />
            <div className="px-3 pb-3"><Chips value={filter} onChange={setFilter} options={['Active', 'Paused', 'Archived'].map((s) => ({ value: s, label: s, count: scheds.filter((x) => x.status === s).length }))} /></div>
            <DataList rows={rows} minWidth={820}
              empty={<Empty icon={filter === 'Archived' ? I.Archive : I.CalendarClock} title={filter === 'Archived' ? 'Nothing archived' : filter === 'Paused' ? 'No paused schedules' : 'No scheduled reports yet'} body={filter === 'Active' ? 'Schedule any report to arrive by email every day, week or month.' : 'Archived schedules stay here, with their send history.'} action={filter === 'Active' && canEdit ? <Button variant="secondary" icon={I.Plus} onClick={() => setSchedFor('')}>Schedule a report</Button> : null} />}
              columns={[
                { key: 'n', label: 'Report', render: (s) => <><b className="font-semibold block leading-tight">{s.name}</b><span className="text-[12.5px] text-ink3">{s.src} · {s.area} · {s.filters}</span></> },
                { key: 'f', label: 'Sends', render: (s) => <><span className="block whitespace-nowrap">{s.freq}</span><span className="text-[12.5px] text-ink3">{s.format}</span></> },
                { key: 't', label: 'To', render: (s) => <span className="flex items-center gap-2"><span className="flex -space-x-2">{s.to.map((p) => <Avatar key={p} name={PERSON[p].name} size={28} ring />)}</span><span className="text-[12.5px] text-ink3 truncate max-w-[140px]">{s.to.map((p) => PERSON[p].name.split(' ')[0]).join(', ')}</span></span> },
                { key: 'l', label: 'Last sent', nowrap: true, render: (s) => <span className="text-[13px]">{s.last}</span> },
                { key: 's', label: 'Status', nowrap: true, render: (s) => <Pill tone={s.status === 'Active' ? 'ok' : 'neutral'} dot>{s.status}</Pill> },
                { key: 'm', label: '', render: (s) => canEdit && <MoreMenu size="sm" items={[
                  ['Send', 'Send now', () => { setScheds((x) => x.map((y) => (y.id === s.id ? { ...y, last: 'Just now' } : y))); toast({ title: `Sent: ${s.name}`, body: `To ${s.to.map((p) => PERSON[p].name).join(', ')} · same numbers as on screen` }); }],
                  ['Pencil', 'Edit', () => setEdit(s)],
                  s.status === 'Active' ? ['Pause', 'Pause', () => setStatus(s, 'Paused', 'Schedule paused')] : ['Play', 'Start again', () => setStatus(s, 'Active', 'Schedule started again')],
                  ...(s.status !== 'Archived' ? [['Archive', 'Archive', () => setArch(s), 'bad']] : []),
                ]} /> },
              ]}
              mobile={(s) => ({ title: s.name, sub: `${s.freq} · ${s.format} · to ${s.to.map((p) => PERSON[p].name.split(' ')[0]).join(', ')}`, icon: 'CalendarClock', iconTone: s.status === 'Active' ? 'brand' : 'neutral', right: canEdit && <span onClick={(e) => e.stopPropagation()}><MoreMenu size="sm" items={[['Pencil', 'Edit', () => setEdit(s)], s.status === 'Active' ? ['Pause', 'Pause', () => setStatus(s, 'Paused', 'Schedule paused')] : ['Play', 'Start again', () => setStatus(s, 'Active', 'Schedule started again')]]} /></span> })}
              footer={`${rows.length} ${filter.toLowerCase()}`} />
          </Card>
          <Card className="overflow-hidden">
            <CardHead title="My custom reports" sub="Built here, with only the fields each person may see" icon={I.Table2} />
            {custom.length === 0 ? <Empty icon={I.Table2} title="No custom reports yet" body="Pick a data area, columns and filters, then save." action={<Button variant="secondary" onClick={() => setView('build')}>Build a report</Button>} /> : (
              <ul className="px-2 pb-2">
                {custom.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/60">
                    <IconTile name={CAT_ICON[AREAS_DATA[c.area].label] || 'Table2'} />
                    <span className="min-w-0 flex-1"><b className="font-semibold text-[14px] block truncate">{c.name}</b><span className="text-[12.5px] text-ink3 block truncate">{AREAS_DATA[c.area].label} · {c.cols} columns · {c.filters} · saved by {c.by}, {c.saved}</span></span>
                    <Button size="sm" variant="ghost" onClick={() => { setPreset(c); setView('build'); }}>Open</Button>
                    {canEdit && <Button size="sm" variant="secondary" icon={I.CalendarClock} className="hidden @sm:inline-flex" onClick={() => setSchedFor(c.name)}>Schedule</Button>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </> : <Builder preset={preset} canEdit={canEdit} names={custom.map((c) => c.name)} onSaved={(c) => { setCustom((x) => [c, ...x]); setView('mine'); }} onSchedule={(name) => setSchedFor(name)} />}
      </div>
      <ScheduleSheet open={schedFor !== null} name={schedFor || ''} customNames={custom.map((c) => c.name)} onClose={() => setSchedFor(null)}
        onSave={(s) => { setScheds((x) => [s, ...x]); setFilter('Active'); setView('mine'); }} />
      <ScheduleSheet open={!!edit} edit={edit} name={edit?.name || ''} customNames={custom.map((c) => c.name)} onClose={() => setEdit(null)}
        onSave={(s) => setScheds((x) => x.map((y) => (y.id === edit.id ? { ...y, ...s, id: y.id, last: y.last, status: y.status } : y)))} />
      <ConfirmSheet open={!!arch} onClose={() => setArch(null)} title={`Archive “${arch?.name}”?`} sub="It stops sending. Its send history is kept, and you can start it again from Archived." confirmLabel="Archive schedule"
        onConfirm={() => setStatus(arch, 'Archived', 'Schedule archived')} />
    </div>
  );
}

function ScheduleSheet({ open, onClose, onSave, name, edit, customNames }) {
  const toast = useToast();
  const reports = [...customNames.map((n) => ({ value: n, label: `${n} (custom)` })), ...CATALOGUE.map((r) => ({ value: r.name, label: r.name }))];
  const blank = { report: name, filters: 'The report’s defaults', freq: 'Weekly', day: 'Monday', time: '8:00 AM', format: 'PDF', to: ['me'] };
  const [f, setF] = useState(blank);
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (!open) return;
    setTried(false);
    if (edit) { const [fr, rest = ''] = edit.freq.split(', '); const m = rest.match(/^(.*?)\s(\d.*)$/) || []; setF({ report: edit.name, filters: edit.filters, freq: fr, day: m[1] || 'Monday', time: m[2] || '8:00 AM', format: edit.format, to: edit.to }); }
    else setF({ ...blank, report: name });
  }, [open]);
  const rep = CATALOGUE.find((r) => r.name === f.report);
  const area = rep ? rep.cat : customNames.includes(f.report) ? 'Students' : null;
  const areaKey = area === 'Fees' ? 'fees' : area === 'Staff and HR' ? 'staff' : area === 'Attendance' ? 'attendance' : area === 'Exams' ? 'exams' : 'students';
  const blocked = area ? f.to.filter((p) => !canSee(PERSON[p], area) && !canSee(PERSON[p], areaKey)) : [];
  const err = {
    report: !f.report ? 'Pick a report to send' : '',
    to: !f.to.length ? 'Pick at least one person' : blocked.length ? `${blocked.map((p) => PERSON[p].name.split(' ')[0]).join(' and ')} cannot see ${area.toLowerCase()} data. Choose another recipient.` : '',
  };
  const when = f.freq === 'Daily' ? `Daily, ${f.time}` : f.freq === 'Weekly' ? `Weekly, ${f.day} ${f.time}` : `Monthly, 1st at ${f.time}`;
  const toggle = (id) => setF((x) => ({ ...x, to: x.to.includes(id) ? x.to.filter((y) => y !== id) : [...x.to, id] }));
  return (
    <FormSheet open={open} onClose={onClose} wide title={edit ? `Edit schedule: ${edit.name}` : 'Schedule a report'} sub="Sent by email with the same numbers as on screen" submitLabel={edit ? 'Save changes' : 'Start sending'}
      onSubmit={() => { setTried(true); if (err.report || err.to) return false; onSave({ id: `s${Date.now()}`, name: f.report, src: rep ? 'Catalogue' : 'Custom', area: area || 'Students', freq: when, format: f.format, to: f.to, last: 'Not sent yet', status: 'Active', filters: f.filters }); toast({ title: edit ? 'Schedule saved' : `Scheduled: ${f.report}`, body: `${when} · ${f.format} · to ${f.to.map((p) => PERSON[p].name).join(', ')}` }); return true; }}>
      <Field label="Report" required id="sc-rep" error={tried && err.report}><Select id="sc-rep" value={f.report} onChange={(v) => setF({ ...f, report: v })} error={tried && err.report} options={[{ value: '', label: 'Pick a report' }, ...reports]} /></Field>
      <Field label="Filters" id="sc-fil" hint="Relative dates move with each send, like “last week”"><Select id="sc-fil" value={f.filters} onChange={(v) => setF({ ...f, filters: v })} options={[f.filters, 'The report’s defaults', 'Last week', 'Last month', 'This term so far', 'Class 9 · last week'].filter((x, i, a) => a.indexOf(x) === i)} /></Field>
      <div className="grid grid-cols-1 @sm:grid-cols-3 gap-3">
        <Field label="How often" required id="sc-freq"><Select id="sc-freq" value={f.freq} onChange={(v) => setF({ ...f, freq: v })} options={['Daily', 'Weekly', 'Monthly']} /></Field>
        {f.freq === 'Weekly' ? <Field label="Day" id="sc-day"><Select id="sc-day" value={f.day} onChange={(v) => setF({ ...f, day: v })} options={['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']} /></Field>
          : <Field label="Day" id="sc-day-x"><Select id="sc-day-x" value="x" onChange={() => {}} options={[{ value: 'x', label: f.freq === 'Daily' ? 'Every school day' : '1st of the month' }]} /></Field>}
        <Field label="Time" id="sc-time"><Select id="sc-time" value={f.time} onChange={(v) => setF({ ...f, time: v })} options={['7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '1:00 PM', '5:00 PM']} /></Field>
      </div>
      <Field label="Format" required id="sc-fmt"><Segmented value={f.format} onChange={(v) => setF({ ...f, format: v })} options={['PDF', 'Excel']} /></Field>
      <Field label="Send to" required id="sc-to" error={tried || blocked.length ? err.to : ''} hint="Only staff who may see this data can receive it">
        <div className="flex flex-wrap gap-2">
          {STAFF_PEOPLE.map((p) => {
            const on = f.to.includes(p.id); const no = area && on && !canSee(p, area) && !canSee(p, areaKey);
            return (
              <button key={p.id} type="button" onClick={() => toggle(p.id)} aria-pressed={on}
                className={cx('inline-flex items-center gap-2 h-10 pl-1.5 pr-3 rounded-full border text-[13.5px] font-semibold transition', no ? 'border-bad bg-bad/10 text-bad' : on ? 'border-brand bg-brand/10 text-brand' : 'border-line bg-surface text-ink2 hover:bg-sunken')}>
                <Avatar name={p.name} size={28} />{p.id === 'me' ? 'Me' : p.name.split(' ')[0]}<span className="font-normal text-[12px] opacity-90 hidden @sm:inline">{p.role}</span>{on && <I.Check size={14} />}
              </button>
            );
          })}
        </div>
      </Field>
      <p className="text-[12.5px] text-ink3 flex gap-1.5"><I.Info size={14} className="shrink-0 mt-0.5" />Email is set up in Settings, SMS, WhatsApp & Email. First send: {when.replace('Weekly, ', 'next ').replace('Daily, ', 'Monday ').replace('Monthly, 1st at ', '1 Nov, ')}.</p>
    </FormSheet>
  );
}

function Builder({ preset, canEdit, onSaved, onSchedule, names = [] }) {
  const toast = useToast();
  const { role } = useRole();
  const [area, setArea] = useState(preset?.area || 'students');
  const fields = AREAS_DATA[area].fields;
  const [cols, setCols] = useState(() => new Set(fields.filter((x) => !x[2]).slice(0, 4).map((x) => x[0])));
  const [cls, setCls] = useState(preset?.filters?.startsWith('Class 9') ? '9' : 'all');
  const [extra, setExtra] = useState('all');
  const [group, setGroup] = useState('none');
  const [totals, setTotals] = useState(true);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');
  const [tried, setTried] = useState(false);
  const pickArea = (a) => { setArea(a); setCols(new Set(AREAS_DATA[a].fields.filter((x) => !x[2]).slice(0, 4).map((x) => x[0]))); setExtra('all'); setGroup('none'); };
  const locked = (fl) => fl[2] && role.id !== 'principal';
  const extraOpts = { students: [['all', 'Any status'], ['Active', 'Active only'], ['New', 'New this year']], fees: [['all', 'Any fee status'], ['Overdue', 'Overdue only'], ['Due', 'Due only']], attendance: [['all', 'Any attendance'], ['80', 'Below 80%'], ['90', 'Below 90%']], exams: [['all', 'All students'], ['drop', 'Marks fell 15% or more']], staff: [['all', 'All departments'], ['Teaching', 'Teaching only'], ['Office', 'Office only']] }[area];
  let src = area === 'staff' ? STAFF : STUDENTS;
  if (area !== 'staff' && cls !== 'all') src = src.filter((s) => s.clsId === cls);
  if (extra !== 'all') src = src.filter((s) => (area === 'students' ? s.status === extra : area === 'fees' ? s.feeState === extra : area === 'attendance' ? s.att < Number(extra) : area === 'exams' ? valOf(s, 'change') <= -8 : s.dept === extra));
  const chosen = fields.filter((fl) => cols.has(fl[0]));
  let table = src.map((s) => chosen.map((fl) => valOf(s, fl[0])));
  let tcols = chosen.map((fl) => [fl[1], KIND_OF[fl[0]]]);
  if (group !== 'none' && area !== 'staff') {
    const by = {}; src.forEach((s) => { const k = group === 'class' ? clsOf(s).split(' ')[0] : s.girl ? 'Girls' : 'Boys'; (by[k] = by[k] || []).push(s); });
    tcols = [[group === 'class' ? 'Class' : 'Boys or girls'], ['Students', 'n'], ...(area === 'fees' ? [['Amount due', 'inr']] : area === 'attendance' ? [['Average attendance', 'pct']] : [])];
    table = Object.entries(by).map(([k, l]) => [k, l.length, ...(area === 'fees' ? [l.reduce((a, s) => a + s.due, 0)] : area === 'attendance' ? [Math.round(l.reduce((a, s) => a + s.att, 0) / l.length)] : [])]);
  }
  const foot = totals && table.length ? tcols.map(([, k], i) => (i === 0 ? 'Total' : k === 'inr' || (k === 'n' && group !== 'none') ? fmt(sum(table, i), k) : k === 'pct' ? fmt(Math.round(sum(table, i) / table.length), k) + ' avg' : '')) : null;
  const dup = name.trim() && names.some((n) => n.toLowerCase() === name.trim().toLowerCase());
  const nameErr = !name.trim() ? 'Give the report a name' : dup ? 'You already have a report with this name' : '';
  const filterText = [cls === 'all' ? 'All classes' : CLS_NAME(cls), extra !== 'all' ? extraOpts.find((o) => o[0] === extra)[1] : null].filter(Boolean).join(' · ');
  return (
    <Split side={340} className="[&>*]:min-w-0">
      <Col>
        <Card className="overflow-hidden">
          <CardHead title={preset ? preset.name : 'Preview'} sub={`${AREAS_DATA[area].label} · ${filterText} · ${table.length} ${table.length === 1 ? 'row' : 'rows'}`} icon={I.Table2}
            action={<div className="flex gap-1.5">
              <Button size="sm" variant="secondary" icon={I.Download} disabled={!chosen.length} onClick={() => toast({ title: 'Exported the preview', body: `${table.length} rows · Excel with the filters on top. Logged.` })}>Export</Button>
              {canEdit && <Button size="sm" variant="primary" icon={I.Check} disabled={!chosen.length} onClick={() => { setName(preset ? `${preset.name} (copy)` : ''); setTried(false); setSaveOpen(true); }}>Save</Button>}
            </div>} />
          {!chosen.length ? <Empty icon={I.Table2} title="Pick at least one column" body="Tick the columns you want on the right. The preview updates as you go." />
            : table.length === 0 ? <Empty icon={I.Inbox} title="No rows for these filters" body="Try another class or loosen the filter." action={<Button variant="secondary" onClick={() => { setCls('all'); setExtra('all'); }}>Clear filters</Button>} />
            : <>
              <SimpleTable minWidth={Math.max(480, tcols.length * 130)} cols={tcols.map(([label, k], i) => ({ label, right: NUMERIC.includes(k), render: (x) => fmt(x[i], k) }))} rows={table.slice(0, 12)} foot={foot} />
              <p className="px-5 py-3 border-t border-line text-[12.5px] text-ink3 tnum">Showing {Math.min(12, table.length)} of {table.length} example rows · the saved report has every row</p>
            </>}
        </Card>
      </Col>
      <Col>
        <Card>
          <CardHead title="1. What is it about" icon={I.Database} />
          <div className="px-5 pb-4"><Segmented size="sm" value={area} onChange={pickArea} className="flex-wrap w-full" options={Object.entries(AREAS_DATA).map(([v, a]) => ({ value: v, label: a.label }))} /></div>
        </Card>
        <Card>
          <CardHead title="2. Columns" sub="Only fields you may see are offered" icon={I.ListChecks} />
          <ul className="px-3 pb-3">
            {fields.map((fl) => (
              <li key={fl[0]}>
                <label className={cx('flex items-center gap-3 px-2 py-2 rounded-xl', locked(fl) ? 'opacity-90' : 'hover:bg-sunken/60 cursor-pointer')}>
                  {locked(fl) ? <I.Lock size={18} className="text-ink3" /> : <Checkbox label={fl[1]} checked={cols.has(fl[0])} onChange={() => setCols((x) => { const n = new Set(x); n.has(fl[0]) ? n.delete(fl[0]) : n.add(fl[0]); return n; })} />}
                  <span className="text-[14px] flex-1">{fl[1]}</span>
                  {locked(fl) && <span className="text-[12px] text-ink3">Not for your role</span>}
                </label>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHead title="3. Filters and totals" icon={I.Filter} />
          <div className="px-5 pb-5 flex flex-col gap-3">
            {area !== 'staff' && <Field label="Class" id="bd-cls"><Select id="bd-cls" value={cls} onChange={setCls} options={CLASS_OPTS} /></Field>}
            <Field label="Show" id="bd-extra"><Select id="bd-extra" value={extra} onChange={setExtra} options={extraOpts.map(([value, label]) => ({ value, label }))} /></Field>
            {area !== 'staff' && <Field label="Group by" id="bd-grp"><Select id="bd-grp" value={group} onChange={setGroup} options={[{ value: 'none', label: 'No grouping (one row per student)' }, { value: 'class', label: 'Class' }, { value: 'gender', label: 'Boys and girls' }]} /></Field>}
            <label htmlFor="bd-tot" className="flex items-center justify-between gap-3 text-[14px] font-semibold text-ink2 cursor-pointer">Totals row<Switch id="bd-tot" on={totals} onChange={setTotals} label="Totals row" /></label>
          </div>
        </Card>
      </Col>
      <FormSheet open={saveOpen} onClose={() => setSaveOpen(false)} title="Save this report" sub={`${AREAS_DATA[area].label} · ${chosen.length} columns · ${filterText}`} submitLabel="Save report"
        onSubmit={() => { setTried(true); if (nameErr) return false; const c = { id: `c${Date.now()}`, name: name.trim(), area, cols: chosen.length, filters: filterText, by: role.person?.name || 'You', saved: 'Today' }; onSaved(c); toast({ title: `Saved: ${c.name}`, body: 'In My custom reports. Schedule it to get it by email.' }); return true; }}>
        <Field label="Name" required id="bd-name" error={(tried || dup) && nameErr}><Input id="bd-name" value={name} onChange={(e) => setName(e.target.value)} error={(tried || dup) && !!nameErr} placeholder="Class 7 marks and attendance" autoComplete="off" /></Field>
        <button type="button" onClick={() => { if (nameErr) { setTried(true); return; } setSaveOpen(false); onSaved({ id: `c${Date.now()}`, name: name.trim(), area, cols: chosen.length, filters: filterText, by: role.person?.name || 'You', saved: 'Today' }); onSchedule(name.trim()); }}
          className="self-start text-[13px] font-semibold text-brand hover:underline">Save and schedule it</button>
      </FormSheet>
    </Split>
  );
}

/* =========================================================================================
   Pages
   ========================================================================================= */
export const REPORTS_PAGES = {
  all: AllReports,
  analytics: Analytics,
  warnings: EarlyWarnings,
  government: GovernmentReports,
  custom: CustomReports,
};
