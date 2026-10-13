// 14 Inventory Management (optional module): stock, issues, purchases, assets, rooms and maintenance. Example data only.
import React, { useEffect, useMemo, useState } from 'react';
import * as I from './icons.js';
import { STUDENTS, FEATURED, inr } from './data.js';
import { STAFF } from './sample.js';
import { cx, Card, CardHead, Button, IconButton, Pill, Avatar, Field, Input, Checkbox, Switch, Segmented, Sheet, Empty, useToast } from './ui.jsx';
import { useNav, useRole } from './shell.jsx';
import { inMenu } from './config.js';
import {
  DatePeriod, PERIODS, fmtRange, periodDays, ModuleHead, useCanEdit, Icon, Stats, Band, SearchBox, Toolbar, Select, Textarea, Chips, DataList, BulkBar, Row, SettingRow, SettingsCard,
  Banner, Suggestion, Progress, HBars, Bars, Legend, DL, Timeline, Checklist, MoreMenu, FormSheet, ConfirmSheet, Split, Col, ExportButton, TONE_SOFT,
} from './kit.jsx';

/* ======================= Sample data ======================= */
const LOCS = ['Main store', 'Lab store', 'Sports room', 'Primary block store'];
const CATS = [
  { k: 'Stationery', icon: 'PenLine', items: 88, reorder: 20 },
  { k: 'Cleaning', icon: 'Droplets', items: 28, reorder: 6 },
  { k: 'Lab', icon: 'FlaskConical', items: 74, reorder: 10 },
  { k: 'Sports', icon: 'Trophy', items: 31, reorder: 4 },
  { k: 'Uniforms', icon: 'Shirt', items: 38, reorder: 25 },
  { k: 'Books', icon: 'BookOpen', items: 34, reorder: 0 },
  { k: 'Electrical', icon: 'Lightbulb', items: 11, reorder: 8 },
  { k: 'Computer spares', icon: 'Cable', items: 8, reorder: 2 },
];
const UNITS = ['Piece', 'Box', 'Packet', 'Ream', 'Bottle', 'Can', 'Kg', 'Litre', 'Set'];

const ITEMS = [
  { id: 'ST-0021', name: 'Whiteboard marker, black', cat: 'Stationery', unit: 'Piece', stock: { 'Main store': 0 }, reorder: 24, price: 32, last: '18 Aug 2026', vendor: 'Sri Sai Stationers' },
  { id: 'ST-0012', name: 'A4 paper, 75 GSM (ream of 500)', cat: 'Stationery', unit: 'Ream', stock: { 'Main store': 6 }, reorder: 20, price: 285, last: '12 Sep 2026', vendor: 'Sri Sai Stationers' },
  { id: 'ST-0018', name: 'White chalk (box of 100)', cat: 'Stationery', unit: 'Box', stock: { 'Main store': 3, 'Primary block store': 1 }, reorder: 15, price: 45, last: '2 Sep 2026', vendor: 'Sri Sai Stationers' },
  { id: 'CL-0009', name: 'Hand sanitiser, 500 ml', cat: 'Cleaning', unit: 'Bottle', stock: { 'Main store': 3 }, reorder: 10, price: 140, last: '22 Sep 2026', vendor: 'CleanPro Hygiene Solutions' },
  { id: 'BK-0812', name: 'Class 8 Hindi workbook', cat: 'Books', unit: 'Piece', stock: { 'Main store': 0 }, reorder: 0, price: 165, last: '20 May 2026', vendor: 'Telangana Book House' },
  { id: 'BK-0815', name: 'Class 8 school atlas', cat: 'Books', unit: 'Piece', stock: { 'Main store': 0 }, reorder: 0, price: 240, last: '20 May 2026', vendor: 'Telangana Book House' },
  { id: 'ST-0107', name: 'A4 notebook, 200 pages', cat: 'Stationery', unit: 'Piece', stock: { 'Main store': 12, 'Primary block store': 60 }, reorder: 10, price: 58, last: '12 Sep 2026', vendor: 'Sri Sai Stationers' },
  { id: 'ST-0033', name: 'Answer booklet, 24 pages', cat: 'Stationery', unit: 'Piece', stock: { 'Main store': 2400 }, reorder: 1500, price: 6, last: '25 Sep 2026', vendor: 'Sri Sai Stationers' },
  { id: 'CL-0004', name: 'Floor cleaner, 5 litre', cat: 'Cleaning', unit: 'Can', stock: { 'Main store': 14 }, reorder: 6, price: 420, last: '25 Sep 2026', vendor: 'CleanPro Hygiene Solutions' },
  { id: 'LB-0031', name: 'Beaker 250 ml, borosilicate', cat: 'Lab', unit: 'Piece', stock: { 'Lab store': 46 }, reorder: 20, price: 95, last: '8 Oct 2026', vendor: 'Deccan Scientific Suppliers', lab: true },
  { id: 'LB-0045', name: 'Hydrochloric acid, 500 ml', cat: 'Lab', unit: 'Bottle', stock: { 'Lab store': 8 }, reorder: 4, price: 210, last: '14 Jul 2026', vendor: 'Deccan Scientific Suppliers', lab: true, expiry: '30-04-2027' },
  { id: 'LB-0046', name: 'Copper sulphate, 500 g', cat: 'Lab', unit: 'Packet', stock: { 'Lab store': 5 }, reorder: 3, price: 180, last: '10 Jun 2025', vendor: 'Deccan Scientific Suppliers', lab: true, expiry: '01-09-2026', expired: 2 },
  { id: 'LB-0052', name: 'Litmus paper, red and blue', cat: 'Lab', unit: 'Packet', stock: { 'Lab store': 22 }, reorder: 10, price: 35, last: '14 Jul 2026', vendor: 'Deccan Scientific Suppliers', lab: true, expiry: '15-11-2026', soon: true },
  { id: 'SP-0007', name: 'Football, size 5', cat: 'Sports', unit: 'Piece', stock: { 'Sports room': 9 }, reorder: 4, price: 780, last: '6 Oct 2026', vendor: 'Hyderabad Sports House' },
  { id: 'SP-0011', name: 'Cricket ball, leather', cat: 'Sports', unit: 'Piece', stock: { 'Sports room': 18 }, reorder: 12, price: 450, last: '6 Oct 2026', vendor: 'Hyderabad Sports House' },
  { id: 'UN-0003', name: 'House T-shirt, size 30', cat: 'Uniforms', unit: 'Piece', stock: { 'Main store': 64 }, reorder: 25, price: 320, last: '28 May 2026', vendor: 'Telangana Uniform House' },
  { id: 'UN-0008', name: 'School tie', cat: 'Uniforms', unit: 'Piece', stock: { 'Main store': 120 }, reorder: 40, price: 110, last: '28 May 2026', vendor: 'Telangana Uniform House' },
  { id: 'BK-0501', name: 'Class 5 English textbook', cat: 'Books', unit: 'Piece', stock: { 'Main store': 48 }, reorder: 0, price: 385, last: '20 May 2026', vendor: 'Telangana Book House' },
  { id: 'EL-0006', name: 'LED tube light, 20 W', cat: 'Electrical', unit: 'Piece', stock: { 'Main store': 22 }, reorder: 10, price: 240, last: '9 Sep 2026', vendor: 'Sri Venkateswara Systems' },
  { id: 'CS-0003', name: 'Printer toner, HP 76A', cat: 'Computer spares', unit: 'Piece', stock: { 'Main store': 2 }, reorder: 1, price: 3850, last: '1 Aug 2026', vendor: 'Sri Venkateswara Systems', asset: 'AT-0451' },
];
const itemById = (id) => ITEMS.find((x) => x.id === id) || ITEMS[0];
const inHand = (it) => Object.values(it.stock).reduce((a, b) => a + b, 0);
const statusOf = (it) => { const t = inHand(it); return t === 0 ? 'Out of stock' : it.reorder && t <= it.reorder ? 'Low' : 'OK'; };
const STATUS_TONE = { OK: 'ok', Low: 'bad', 'Out of stock': 'bad' };
const RANK = { 'Out of stock': 0, Low: 1, OK: 2 };
const LOW = ITEMS.filter((it) => it.reorder > 0 && statusOf(it) !== 'OK');
const catIcon = (k) => CATS.find((c) => c.k === k)?.icon || 'Package';
const n = (v) => Number(v).toLocaleString('en-IN');
// '9 Oct 2026', '9 Oct, 10:12 AM', 'Today, 8:55 AM' -> '2026-10-09', so rows can be filtered by a DatePeriod
const MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const isoOf = (s) => {
  if (/^Today/.test(s)) return '2026-10-09';
  const m = /^(\d{1,2}) ([A-Z][a-z]{2})(?: (\d{4}))?/.exec(s);
  if (!m) return '2026-10-09';
  return `${m[3] || 2026}-${String(MONS.indexOf(m[2]) + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
};
const inPer = (per, s) => { const d = isoOf(s); return d >= per.from && d <= per.to; };
// "Showing: Last 7 days · 3 Oct – 9 Oct 2026"
const PerLine = ({ per, children }) => <p className="px-5 py-2 text-[12.5px] text-ink3 border-b border-line/70">Showing: <b className="font-semibold text-ink2">{per.label}</b> · {fmtRange(per)}{children}</p>;

const MOVES = [
  { d: '9 Oct 2026, 9:40 AM', type: 'Out', q: -2, ref: 'ISS-2026-0413', note: 'Issued to Exam cell (Prakash Joshi) for half-yearly papers', by: 'Ramu Yadav' },
  { d: '7 Oct 2026, 11:05 AM', type: 'Out', q: -4, ref: 'ISS-2026-0399', note: 'Issued to Office (Anita Sharma)', by: 'Ramu Yadav' },
  { d: '5 Oct 2026, 3:20 PM', type: 'Transfer', q: -2, ref: 'TRF-2026-0021', note: 'Main store to Primary block store', by: 'Ramu Yadav' },
  { d: '28 Sep 2026, 12:10 PM', type: 'Damaged', q: -1, ref: 'ADJ-2026-0033', note: 'Water damage from the roof leak in the store', by: 'Ramu Yadav' },
  { d: '12 Sep 2026, 10:30 AM', type: 'In', q: 20, ref: 'GRN-2026-0036', note: 'Received against PO-2026-0049, Sri Sai Stationers', by: 'Ramu Yadav' },
  { d: '30 Aug 2026, 4:00 PM', type: 'Audit adjustment', q: -1, ref: 'AUD-2026-0004', note: 'Stock audit, approved by Anita Sharma', by: 'Anita Sharma' },
];
const MOVE_TONE = { In: 'ok', Out: 'neutral', Transfer: 'info', Damaged: 'bad', Lost: 'bad', Expired: 'bad', 'Audit adjustment': 'warn' };

const BOOK_SETS = [
  { id: 'BS-05', name: 'Class 5 book set 2026–27', classes: ['5'], price: 3450, issued: 71, items: [
    ['BK-0501', 'English textbook', 1, 48], ['BK-0502', 'Mathematics textbook', 1, 52], ['BK-0503', 'EVS textbook', 1, 14], ['BK-0505', 'Telugu textbook', 1, 40],
    ['BK-0506', 'Hindi textbook', 1, 38], ['ST-0107', 'A4 notebook, 200 pages', 6, 72], ['ST-0110', 'Long notebook, 172 pages', 4, 210], ['ST-0115', 'Drawing book', 1, 64], ['ST-0120', 'Brown cover roll', 1, 90],
  ] },
  { id: 'BS-08', name: 'Class 8 book set 2026–27', classes: ['8'], price: 4280, issued: 64, items: [
    ['BK-0801', 'English textbook', 1, 31], ['BK-0802', 'Mathematics textbook', 1, 29], ['BK-0803', 'Science textbook', 1, 27], ['BK-0804', 'Social Studies textbook', 1, 30],
    ['BK-0805', 'Telugu textbook', 1, 26], ['BK-0812', 'Hindi workbook', 1, 0], ['BK-0815', 'School atlas', 1, 0], ['ST-0110', 'Long notebook, 172 pages', 6, 210], ['ST-0120', 'Brown cover roll', 1, 90],
  ] },
  { id: 'US-01', name: 'Class 1 uniform set (boys)', classes: ['1'], price: 1860, issued: 38, items: [
    ['UN-0011', 'Shirt, size 24', 2, 46], ['UN-0012', 'Shorts, size 24', 2, 40], ['UN-0008', 'School tie', 1, 120], ['UN-0015', 'Belt with school logo', 1, 55],
  ] },
];
const fullSets = (s) => Math.min(...s.items.map(([, , q, h]) => Math.floor(h / q)));
const limitBy = (s) => s.items.reduce((m, it) => (Math.floor(it[3] / it[2]) < Math.floor(m[3] / m[2]) ? it : m), s.items[0]);

const ISSUES = [
  { id: 'ISS-2026-0414', d: '9 Oct, 10:12 AM', item: 'Answer booklet, 24 pages', q: 600, unit: 'pieces', to: 'Exam cell', kind: 'Department', by: 'Ramu Yadav', ret: false },
  { id: 'ISS-2026-0413', d: '9 Oct, 9:40 AM', item: 'A4 paper, 75 GSM (ream of 500)', q: 2, unit: 'reams', to: 'Prakash Joshi', kind: 'Staff', by: 'Ramu Yadav', ret: false },
  { id: 'ISS-2026-0412', d: '9 Oct, 9:05 AM', item: 'Class 5 book set 2026–27', q: 1, unit: 'set', to: 'Kavya Rao, 5 A', kind: 'Student', by: 'Ramu Yadav', ret: false, charge: 3450 },
  { id: 'ISS-2026-0411', d: '8 Oct, 2:40 PM', item: 'Football, size 5', q: 2, unit: 'pieces', to: 'Mohammed Asif', kind: 'Staff', by: 'Ramu Yadav', ret: true, back: null, due: 'after the inter-house match, 10 Oct' },
  { id: 'ISS-2026-0410', d: '8 Oct, 11:30 AM', item: 'Beaker 250 ml, borosilicate', q: 12, unit: 'pieces', to: 'Class 9 B', kind: 'Class', by: 'Ramu Yadav', ret: true, back: '8 Oct, 3:30 PM' },
  { id: 'ISS-2026-0409', d: '8 Oct, 9:15 AM', item: 'House T-shirt, size 30', q: 1, unit: 'piece', to: 'Aarav Sharma, 7 B', kind: 'Student', by: 'Ramu Yadav', ret: false, charge: 320 },
  { id: 'ISS-2026-0408', d: '7 Oct, 12:20 PM', item: 'White chalk (box of 100)', q: 6, unit: 'boxes', to: 'Primary wing (Classes 1–5)', kind: 'Department', by: 'Ramu Yadav', ret: false },
  { id: 'ISS-2026-0407', d: '7 Oct, 10:00 AM', item: 'Floor cleaner, 5 litre', q: 4, unit: 'cans', to: 'Housekeeping', kind: 'Department', by: 'Ramu Yadav', ret: false },
  { id: 'ISS-2026-0406', d: '6 Oct, 9:30 AM', item: 'Whiteboard marker, black', q: 24, unit: 'pieces', to: 'Teachers of Classes 6–10', kind: 'Department', by: 'Ramu Yadav', ret: false },
  { id: 'ISS-2026-0405', d: '6 Oct, 9:10 AM', item: 'Laptop charger, 65 W (spare)', q: 1, unit: 'piece', to: 'Karthik Menon', kind: 'Staff', by: 'Ramu Yadav', ret: true, back: null, due: '16 Oct' },
];
const DEPTS = ['Exam cell', 'Primary wing (Classes 1–5)', 'Science department', 'Sports', 'Housekeeping', 'Office', 'Computer lab', 'Teachers of Classes 6–10'];
const SECTIONS = ['6 A', '6 B', '7 A', '7 B', '8 A', '8 B', '9 A', '9 B', '9 C', '10 A', '10 B', '10 C'];
const COUNTER_STUDENTS = [
  ...STUDENTS.filter((s) => s.clsId === '5').slice(0, 3),
  ...STUDENTS.filter((s) => s.clsId === '8').slice(0, 2),
  FEATURED,
  ...STUDENTS.filter((s) => s.clsId === '1').slice(0, 1),
];

const VENDORS = [
  { id: 'VN-001', name: 'Sri Sai Stationers', place: 'Kukatpally', contact: 'Ramesh Gupta', phone: '98490 44120', email: 'srisaistationers@gmail.com', gst: '36AAKFS4821K1Z5', items: 'Stationery, exam booklets', bank: 'HDFC Bank ••4410', open: 0, orders: 14 },
  { id: 'VN-002', name: 'Deccan Scientific Suppliers', place: 'Koti, Hyderabad', contact: 'Syed Irfan', phone: '90302 11876', email: 'orders@deccanscientific.in', gst: '36ABCFD7710L1Z2', items: 'Lab glassware, chemicals', bank: 'SBI ••2087', open: 3400, orders: 6 },
  { id: 'VN-003', name: 'Hyderabad Sports House', place: 'Ameerpet', contact: 'Kiran Rao', phone: '98850 77231', email: 'hydsportshouse@gmail.com', gst: '36AADFH3398M1Z9', items: 'Sports equipment', bank: 'ICICI Bank ••5512', open: 14600, orders: 4 },
  { id: 'VN-004', name: 'CleanPro Hygiene Solutions', place: 'Balanagar', contact: 'Praveen Kumar', phone: '93915 60482', email: 'sales@cleanprohyd.com', gst: '36AAICC5521N1Z4', items: 'Cleaning material, sanitiser', bank: 'Axis Bank ••9031', open: 0, orders: 9 },
  { id: 'VN-005', name: 'Sri Venkateswara Systems', place: 'KPHB Colony', contact: 'Venkat Reddy', phone: '94404 22816', email: 'svsystems.kphb@gmail.com', gst: '36ADPFS9087Q1Z7', items: 'Computers, printers, AMC', bank: 'HDFC Bank ••7720', open: 0, orders: 5 },
  { id: 'VN-006', name: 'Telangana Uniform House', place: 'Begum Bazaar', contact: 'Mahesh Agarwal', phone: '98481 30957', email: 'tuhouse@yahoo.co.in', gst: '36AAGFT2214R1Z3', items: 'Uniforms, ties, belts', bank: 'Kotak Bank ••3386', open: 0, orders: 3 },
];
const REQUESTS = [
  { id: 'PR-2026-0031', d: '9 Oct 2026', by: 'Ramu Yadav', dept: 'Stores', items: 'A4 paper ×40 reams, white chalk ×30 boxes, whiteboard markers ×48, hand sanitiser ×24', amt: 17646, status: 'Waiting', note: 'Above ₹10,000 · waiting for Lakshmi Rao', reason: 'Below reorder level, half-yearly exams from 12 Oct' },
  { id: 'PR-2026-0030', d: '6 Oct 2026', by: 'Farhana Begum', dept: 'Science', items: 'Beaker 250 ml ×60, test tubes ×100', amt: 10800, status: 'Approved', note: 'Approved by Lakshmi Rao, 7 Oct · PO-2026-0057', reason: 'Breakage during Class 9 practicals' },
  { id: 'PR-2026-0029', d: '3 Oct 2026', by: 'Mohammed Asif', dept: 'Sports', items: 'Football ×6, cricket kit ×2', amt: 14600, status: 'Approved', note: 'Approved by Lakshmi Rao, 4 Oct · PO-2026-0055', reason: 'Inter-house tournament' },
  { id: 'PR-2026-0028', d: '29 Sep 2026', by: 'Karthik Menon', dept: 'Computers', items: 'Keyboard ×36', amt: 25200, status: 'Rejected', note: 'Rejected by Lakshmi Rao: repair the existing ones first', reason: 'Old keyboards in Computer lab 1' },
  { id: 'PR-2026-0027', d: '26 Sep 2026', by: 'Ramu Yadav', dept: 'Stores', items: 'Answer booklets ×3,000, exam pads ×200', amt: 18240, status: 'Approved', note: 'Approved by Lakshmi Rao, 27 Sep · PO-2026-0058', reason: 'Half-yearly exams' },
];
const ORDERS = [
  { id: 'PO-2026-0058', d: '8 Oct 2026', vendor: 'Sri Sai Stationers', items: 'Answer booklets ×3,000, exam pads ×200', amt: 18240, status: 'Sent', note: 'Expected Sat 10 Oct' },
  { id: 'PO-2026-0057', d: '7 Oct 2026', vendor: 'Deccan Scientific Suppliers', items: 'Beaker 250 ml ×60, test tubes ×100', amt: 10800, status: 'Part received', note: '40 of 60 beakers, 100 of 100 test tubes' },
  { id: 'PO-2026-0055', d: '4 Oct 2026', vendor: 'Hyderabad Sports House', items: 'Football ×6, cricket kit ×2', amt: 14600, status: 'Received', note: 'All received 6 Oct' },
  { id: 'PO-2026-0052', d: '22 Sep 2026', vendor: 'CleanPro Hygiene Solutions', items: 'Floor cleaner ×12, phenyl ×20', amt: 7810, status: 'Closed', note: 'Received and paid' },
];
const GRNS = [
  { id: 'GRN-2026-0041', d: '8 Oct 2026', po: 'PO-2026-0057', vendor: 'Deccan Scientific Suppliers', items: 'Beaker 250 ml ×40, test tubes ×100', loc: 'Lab store', by: 'Ramu Yadav', status: 'Part delivery' },
  { id: 'GRN-2026-0040', d: '6 Oct 2026', po: 'PO-2026-0055', vendor: 'Hyderabad Sports House', items: 'Football ×6, cricket kit ×2', loc: 'Sports room', by: 'Ramu Yadav', status: 'Complete' },
  { id: 'GRN-2026-0038', d: '25 Sep 2026', po: 'PO-2026-0052', vendor: 'CleanPro Hygiene Solutions', items: 'Floor cleaner ×12, phenyl ×20', loc: 'Main store', by: 'Ramu Yadav', status: 'Complete' },
];
const BILLS = [
  { id: 'HSH/26-27/0471', vendor: 'Hyderabad Sports House', po: 'PO-2026-0055', d: '6 Oct 2026', amt: 14600, paid: 0, status: 'Unpaid', due: '5 Nov 2026' },
  { id: 'DSS/2026/772', vendor: 'Deccan Scientific Suppliers', po: 'PO-2026-0057', d: '8 Oct 2026', amt: 7400, paid: 4000, status: 'Part paid', due: '7 Nov 2026', fin: 'EXP/26/0431 · Day Book 8 Oct' },
  { id: 'CP-1184', vendor: 'CleanPro Hygiene Solutions', po: 'PO-2026-0052', d: '25 Sep 2026', amt: 7810, paid: 7810, status: 'Paid', due: '25 Oct 2026', fin: 'EXP/26/0388 · Day Book 30 Sep' },
  { id: 'SSS/1176', vendor: 'Sri Sai Stationers', po: 'PO-2026-0049', d: '12 Sep 2026', amt: 9420, paid: 9420, status: 'Paid', due: '12 Oct 2026', fin: 'EXP/26/0351 · Day Book 15 Sep' },
];
const PR_TONE = { Waiting: 'warn', Approved: 'ok', Rejected: 'bad' };
const PO_TONE = { Sent: 'info', 'Part received': 'warn', Received: 'ok', Closed: 'neutral' };
const BILL_TONE = { Unpaid: 'bad', 'Part paid': 'warn', Paid: 'ok' };

const ASSET_TYPES = ['Furniture', 'IT', 'Lab', 'Sports', 'Vehicles', 'Other'];
const ASSETS = [
  { tag: 'AT-0042', name: 'Projector, Epson EB-X51', type: 'IT', loc: 'Room 12 · Class 8 A', bought: '14 Jun 2023', cost: 42500, warranty: '13 Jun 2026', cond: 'Fair', status: 'In repair', vendor: 'Sri Venkateswara Systems', rate: 33.33 },
  { tag: 'AT-0107', name: 'Desktop computer, Dell OptiPlex 3000', type: 'IT', loc: 'Computer lab 1', bought: '2 Jun 2024', cost: 48900, warranty: '1 Jun 2027', cond: 'Good', status: 'In use', vendor: 'Sri Venkateswara Systems', rate: 33.33 },
  { tag: 'AT-0215', name: 'Ceiling fan, 1200 mm', type: 'Other', loc: 'Physics lab', bought: '10 May 2021', cost: 2650, cond: 'Poor', status: 'In repair', vendor: 'Sri Venkateswara Systems', rate: 15 },
  { tag: 'AT-0301', name: 'Steel almirah, 4 shelves', type: 'Furniture', loc: 'Staff room', bought: '3 Jun 2019', cost: 18400, cond: 'Good', status: 'In use', vendor: 'Local purchase', rate: 10 },
  { tag: 'AT-0388', name: 'Dual desk-bench', type: 'Furniture', loc: 'Room 7 B · Class 7 B', bought: '20 May 2022', cost: 6200, cond: 'Good', status: 'In use', vendor: 'Local purchase', rate: 10 },
  { tag: 'AT-0451', name: 'Laser printer, HP LaserJet Pro M404', type: 'IT', loc: 'Office · Anita Sharma', bought: '8 Aug 2023', cost: 24800, amc: '28 Oct 2026', cond: 'Good', status: 'In use', vendor: 'Sri Venkateswara Systems', rate: 33.33 },
  { tag: 'AT-0502', name: 'Air conditioner, 1.5 ton split', type: 'Other', loc: 'Principal’s office', bought: '4 Nov 2023', cost: 46500, warranty: '3 Nov 2026', cond: 'Good', status: 'In use', vendor: 'Sri Venkateswara Systems', rate: 15 },
  { tag: 'AT-0520', name: 'School bus, 52 seats (TS 07 UB 2236)', type: 'Vehicles', loc: 'Transport · Route 4', bought: '15 Mar 2022', cost: 2450000, amc: '31 Mar 2027', cond: 'Good', status: 'In use', vendor: 'Tata Motors dealer, Balanagar', rate: 15 },
  { tag: 'AT-0633', name: 'Basketball pole set, adjustable', type: 'Sports', loc: 'Basketball court', bought: '12 Jan 2022', cost: 38000, cond: 'Fair', status: 'In use', vendor: 'Hyderabad Sports House', rate: 10 },
  { tag: 'AT-0702', name: 'Compound microscope', type: 'Lab', loc: 'Biology lab', bought: '6 Jul 2020', cost: 8900, cond: 'Good', status: 'In use', vendor: 'Deccan Scientific Suppliers', rate: 10 },
  { tag: 'AT-0718', name: 'RO water purifier, 50 litres an hour', type: 'Other', loc: 'Primary block corridor', bought: '18 Oct 2023', cost: 32000, amc: '18 Oct 2026', cond: 'Good', status: 'In use', vendor: 'AquaPure Services', rate: 15 },
  { tag: 'AT-0730', name: 'Interactive flat panel, 65 inch', type: 'IT', loc: 'Room 10 A · Class 10 A', bought: '2 Jun 2025', cost: 118000, warranty: '1 Jun 2028', cond: 'Good', status: 'In use', vendor: 'Sri Venkateswara Systems', rate: 33.33 },
  { tag: 'AT-0012', name: 'Photocopier, Canon IR 2520', type: 'IT', loc: 'Office (old)', bought: '10 Jun 2014', cost: 68000, cond: 'Scrap', status: 'Disposed', vendor: 'Local purchase', rate: 33.33, disposed: 'Scrapped on 12 Aug 2026 · approved by Lakshmi Rao' },
];
const ASSET_TONE = { 'In use': 'ok', 'In repair': 'warn', Disposed: 'neutral' };
const COND_TONE = { Good: 'ok', Fair: 'warn', Poor: 'bad', Scrap: 'neutral' };
const assetIcon = (t) => ({ Furniture: 'Armchair', IT: 'Monitor', Lab: 'Microscope', Sports: 'Trophy', Vehicles: 'Bus', Other: 'Package' }[t] || 'Package');
const ENDING = ASSETS.filter((a) => ['AT-0718', 'AT-0451', 'AT-0502'].includes(a.tag));
const yearsSince = (d) => Math.max(0, 2026 - Number(d.split(' ').pop()) + (/(Jan|Feb|Mar)/.test(d) ? 1 : 0));
const valueNow = (a) => (a.status === 'Disposed' ? 0 : Math.round(Math.max(a.cost * 0.05, a.cost * (1 - (a.rate / 100) * yearsSince(a.bought)))));

const MREQ = [
  { id: 'MR-2026-0118', what: 'Physics lab fan not working', place: 'Physics lab', asset: 'AT-0215 · Ceiling fan', by: 'Farhana Begum', when: 'Today, 8:55 AM', pri: 'High', tech: '', status: 'Open', photo: true, detail: 'The fan near the front bench does not start. Smell of burning from the regulator.' },
  { id: 'MR-2026-0117', what: 'Tap leaking in girls’ washroom, first floor', place: 'Girls’ washroom, Block B', by: 'Lakshmamma', when: '8 Oct, 2:10 PM', pri: 'Normal', tech: 'Raju (plumber)', status: 'In progress', detail: 'Second tap from the left drips all day.' },
  { id: 'MR-2026-0116', what: 'Projector shows “No signal”', place: 'Room 12 · Class 8 A', asset: 'AT-0042 · Projector', by: 'Venkat Rao', when: '7 Oct, 9:20 AM', pri: 'High', tech: 'Sri Venkateswara Systems', status: 'In progress', detail: 'HDMI port loose. Vendor took it for repair, back by 12 Oct.' },
  { id: 'MR-2026-0115', what: 'Two tube lights fused', place: 'Room 4 A · Class 4 A', by: 'Usha Rani', when: '7 Oct, 8:45 AM', pri: 'Low', tech: 'Shankar (electrician)', status: 'Open', detail: 'Back of the class is dark in the afternoon.' },
  { id: 'MR-2026-0114', what: 'Broken window glass', place: 'Room 6 B · Class 6 B', by: 'Lalitha Devi', when: '5 Oct, 1:30 PM', pri: 'Normal', tech: 'Sri Lakshmi Glass Works', status: 'Done', done: '7 Oct 2026', cost: 1450, detail: 'Cricket ball broke the lower pane.' },
  { id: 'MR-2026-0112', what: 'Basketball hoop net torn', place: 'Basketball court', by: 'Mohammed Asif', when: '1 Oct, 4:10 PM', pri: 'Low', tech: 'Ramu Yadav', status: 'Done', done: '3 Oct 2026', cost: 350, detail: 'Net replaced from sports stock.' },
];
const MR_TONE = { Open: 'bad', 'In progress': 'warn', Done: 'ok' };
const PRI_TONE = { Urgent: 'bad', High: 'bad', Normal: 'neutral', Low: 'neutral' };
const TECHS = ['Shankar (electrician)', 'Raju (plumber)', 'Yadagiri (carpenter)', 'Sri Venkateswara Systems', 'Sri Lakshmi Glass Works', 'Ramu Yadav'];

const FACILITIES = [
  { name: 'Room 7 B', kind: 'Classroom', where: 'Block A, 2nd floor', cap: 40, assets: 46, note: 'Class 7 B · Ravi Teja' },
  { name: 'Physics lab', kind: 'Lab', where: 'Block C, 1st floor', cap: 32, assets: 58, note: 'In-charge Farhana Begum', open: 1 },
  { name: 'Chemistry lab', kind: 'Lab', where: 'Block C, 1st floor', cap: 32, assets: 64, note: 'Lab assistant Narayana' },
  { name: 'Biology lab', kind: 'Lab', where: 'Block C, ground floor', cap: 32, assets: 41, note: 'Lab assistant Narayana' },
  { name: 'Computer lab 1', kind: 'Lab', where: 'Block B, 2nd floor', cap: 36, assets: 74, note: 'In-charge Karthik Menon' },
  { name: 'Auditorium', kind: 'Hall', where: 'Main building', cap: 450, assets: 512, note: 'Book through Events' },
  { name: 'Library hall', kind: 'Hall', where: 'Block B, 1st floor', cap: 80, assets: 96, note: 'Librarian Padma Iyer' },
  { name: 'Main ground', kind: 'Ground', where: 'Behind Block C', cap: 1500, assets: 12, note: 'Assembly and sports' },
  { name: 'Basketball court', kind: 'Ground', where: 'Next to the main gate', cap: 60, assets: 3, note: 'PET Mohammed Asif' },
];
const FAC_ICON = { Classroom: 'School', Lab: 'FlaskConical', Hall: 'Building2', Ground: 'Trophy' };

/* ======================= Small shared pieces ======================= */
function Back({ onClick, label, sub }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink mb-3 -ml-1 h-8 px-1 rounded-lg">
      <I.ArrowLeft size={17} />{label}{sub && <span className="text-ink3 font-normal">/ {sub}</span>}
    </button>
  );
}
const plural = (u, q) => { const l = u.toLowerCase(); return q === 1 || l === 'kg' ? l : l === 'box' ? 'boxes' : `${l}s`; };
// A banner whose button sits beside the text on a computer and under it on a phone
function Alert({ tone, title, children, act, icon, onAct }) {
  return (
    <Banner tone={tone} title={title} action={act ? <Button type="button" size="sm" variant="secondary" icon={icon} className="hidden @md:inline-flex shrink-0" onClick={onAct}>{act}</Button> : null}>
      {children}
      {act && <span className="block mt-2.5 @md:hidden"><Button type="button" size="sm" variant="secondary" icon={icon} onClick={onAct}>{act}</Button></span>}
    </Banner>
  );
}
const Err = ({ children }) => children ? <p className="text-[12.5px] text-bad flex items-center gap-1.5" role="alert"><I.CircleAlert size={14} />{children}</p> : null;

function FakeQR({ size = 120 }) {
  const cells = useMemo(() => {
    let s = 23; const r = () => ((s = (s * 48271) % 2147483647) / 2147483647);
    return Array.from({ length: 25 * 25 }, () => r() > 0.52);
  }, []);
  const finder = (x, y) => (x < 7 && y < 7) || (x > 17 && y < 7) || (x < 7 && y > 17);
  return (
    <div className="p-2 rounded-xl bg-white border border-line shrink-0">
      <svg width={size} height={size} viewBox="0 0 25 25" shapeRendering="crispEdges" aria-label="Asset tag QR code">
        {cells.map((on, i) => { const x = i % 25, y = Math.floor(i / 25); return !finder(x, y) && on ? <rect key={i} x={x} y={y} width="1" height="1" fill="#0f1715" /> : null; })}
        {[[0, 0], [18, 0], [0, 18]].map(([x, y]) => (
          <g key={x + '-' + y}><rect x={x} y={y} width="7" height="7" fill="#0f1715" /><rect x={x + 1} y={y + 1} width="5" height="5" fill="#fff" /><rect x={x + 2} y={y + 2} width="3" height="3" fill="#0f1715" /></g>
        ))}
      </svg>
    </div>
  );
}

function CameraBox({ taken, onTake, onRetake, what = 'photo' }) {
  if (taken) {
    return (
      <div className="rounded-xl border border-line p-3 flex items-center gap-3">
        <span className="w-16 h-16 rounded-xl bg-sunken text-ink3 grid place-items-center shrink-0 relative overflow-hidden">
          <I.Image size={24} />
          <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-ok text-surface grid place-items-center"><I.Check size={10} strokeWidth={3} /></span>
        </span>
        <div className="min-w-0 flex-1"><p className="font-semibold text-[14px]">Photo added</p><p className="text-[12.5px] text-ink3">IMG_20261009_1044.jpg · 1.2 MB</p></div>
        <Button type="button" size="sm" variant="ghost" icon={I.RotateCcw} onClick={onRetake}>Retake</Button>
      </div>
    );
  }
  return (
    <div className="relative rounded-xl border border-dashed border-line bg-sunken/60 h-36 grid place-items-center overflow-hidden">
      {['top-3 left-3 border-t-2 border-l-2', 'top-3 right-3 border-t-2 border-r-2', 'bottom-3 left-3 border-b-2 border-l-2', 'bottom-3 right-3 border-b-2 border-r-2'].map((c) => <span key={c} className={cx('absolute w-5 h-5 border-ink3/50 rounded-sm', c)} />)}
      <div className="flex flex-col items-center gap-2 text-ink3 text-[13px]">
        <I.Camera size={26} />
        <span>Camera is ready. Point it at the {what}.</span>
        <Button type="button" size="sm" variant="secondary" icon={I.Camera} onClick={onTake}>Take photo</Button>
      </div>
    </div>
  );
}

// Items and quantities, with stock checks
function LineEditor({ lines, setLines, from, check, tried, filter, priced }) {
  const opts = ITEMS.filter(filter || (() => true)).map((it) => ({ value: it.id, label: `${it.name} · ${it.id}` }));
  const upd = (i, p) => setLines(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));
  return (
    <div className="flex flex-col gap-2">
      {lines.map((l, i) => {
        const it = itemById(l.id);
        const have = from ? it.stock[from] || 0 : inHand(it);
        const q = Number(String(l.qty).replace(/\D/g, '')) || 0;
        const err = tried && !q ? 'Enter a quantity' : check && q > have ? `Only ${n(have)} in the ${(from || 'store').toLowerCase()}` : '';
        return (
          <div key={i} className={cx('rounded-xl border p-2.5 flex flex-col gap-2', err ? 'border-bad/50 bg-bad/[.03]' : 'border-line')}>
            <div className="flex gap-2 items-center">
              <Select value={l.id} onChange={(v) => upd(i, { id: v })} options={opts} className="flex-1 min-w-0" />
              {lines.length > 1 && <IconButton type="button" icon={I.Trash2} label="Remove item" onClick={() => setLines(lines.filter((_, j) => j !== i))} />}
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <Input inputMode="numeric" value={l.qty} onChange={(e) => upd(i, { qty: e.target.value.replace(/[^\d]/g, '') })} placeholder="Qty" className="!w-24 tnum" error={!!err} aria-label={`Quantity of ${it.name}`} />
              <span className="text-[12.5px] text-ink3 tnum">{it.unit} · {n(have)} in hand{from ? ` in ${from.toLowerCase()}` : ''}{priced && q ? ` · ${inr(q * it.price)}` : ''}</span>
            </div>
            <Err>{err}</Err>
          </div>
        );
      })}
      <Button type="button" size="sm" variant="ghost" icon={I.Plus} className="self-start" onClick={() => setLines([...lines, { id: ITEMS.find((x) => (filter || (() => true))(x)).id, qty: '' }])}>Add another item</Button>
    </div>
  );
}
const linesOk = (lines, from, check) => lines.every((l) => { const q = Number(l.qty) || 0; const it = itemById(l.id); return q > 0 && (!check || q <= (from ? it.stock[from] || 0 : inHand(it))); });

/* ======================= Shared sheets ======================= */
function RequestSheet({ open, onClose, preset }) {
  const toast = useToast();
  const { role } = useRole();
  const [lines, setLines] = useState([]);
  const [need, setNeed] = useState('');
  const [reason, setReason] = useState('');
  const [dept, setDept] = useState('Stores');
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (!open) return;
    const ids = preset && preset.length ? preset : [];
    setLines(ids.length ? ids.map((id) => { const it = itemById(id); return { id, qty: String(Math.max(it.reorder * 2 - inHand(it), 1)) }; }) : [{ id: 'ST-0107', qty: '' }]);
    setReason(ids.length ? 'Below reorder level. Needed before the half-yearly exams.' : '');
    setNeed(ids.length ? '12-10-2026' : ''); setDept(role.id === 'storekeeper' ? 'Stores' : 'Office'); setTried(false);
  }, [open, preset, role.id]);
  const est = lines.reduce((a, l) => a + (Number(l.qty) || 0) * itemById(l.id).price, 0);
  const errReason = !reason.trim() ? 'Say why these are needed' : '';
  return (
    <FormSheet open={open} onClose={onClose} title="Purchase request" sub="Goes to Approvals by the school’s limits. A purchase order is made once it is approved." submitLabel="Send for approval" busyLabel="Sending…" wide
      onSubmit={() => { setTried(true); if (errReason || !linesOk(lines)) return false; toast({ title: 'Purchase request PR-2026-0032 sent', body: est > 10000 ? `${inr(est)} · waiting for Lakshmi Rao in Approvals` : `${inr(est)} · waiting for Anita Sharma in Approvals` }); }}>
      <Field label="Items and quantities" required hint={preset?.length ? 'Filled from the low-stock list. Quantities bring each item to twice its reorder level.' : 'Estimated from the last purchase price'}>
        <LineEditor lines={lines} setLines={setLines} tried={tried} priced />
      </Field>
      <div className="grid @sm:grid-cols-2 gap-3">
        <Field label="Needed by" id="pr-need" hint="DD-MM-YYYY"><Input id="pr-need" value={need} onChange={(e) => setNeed(e.target.value)} placeholder="16-10-2026" /></Field>
        <Field label="Department" id="pr-dept"><Select id="pr-dept" value={dept} onChange={setDept} options={['Stores', 'Office', 'Science', 'Sports', 'Computers', 'Primary wing']} /></Field>
      </div>
      <Field label="Reason" required id="pr-reason" error={tried && errReason}><Textarea id="pr-reason" value={reason} onChange={setReason} rows={2} placeholder="For example: breakage in practicals" /></Field>
      <div className="rounded-xl bg-sunken/70 px-4 py-3 flex items-center gap-3">
        <I.ListChecks size={18} className="text-ink3 shrink-0" />
        <p className="text-[13.5px] text-ink2 flex-1">Estimated amount <b className="text-ink tnum">{inr(est)}</b>. {est > 10000 ? 'Above ₹10,000, so Lakshmi Rao (Principal) approves.' : 'Up to ₹10,000, so Anita Sharma (School Admin) approves.'}</p>
      </div>
    </FormSheet>
  );
}

function ImportSheet({ open, onClose, what = 'items' }) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  useEffect(() => { if (open) setStep(0); }, [open]);
  const items = what === 'items';
  const good = items ? 120 : 80, bad = 3;
  const problems = items
    ? [['Row 14', 'Code ST-0107 belongs to A4 notebook, 200 pages'], ['Row 52', 'Unit “Dozen” is not in the units list'], ['Row 88', 'Opening stock “twelve” is not a number']]
    : [['Row 9', 'Tag AT-0042 belongs to Projector, Room 12'], ['Row 31', 'Purchase date 31-02-2019 is not a real date'], ['Row 66', 'Location “Lab 4” is not a room in the facility register']];
  return (
    <Sheet open={open} onClose={onClose} title={items ? 'Import items' : 'Import assets'} sub={items ? 'Item code, name, category, unit and opening stock per location, from Excel or your old software.' : 'Asset tag, name, type, location, purchase date and cost, from Excel or your old software.'} wide
      footer={step === 0 ? <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="secondary" icon={I.Download} onClick={() => toast({ title: 'Saved: inventory-import-template.xlsx', body: 'Fill one row per ' + (items ? 'item' : 'asset') + '.' })}>Template</Button><Button variant="primary" icon={I.Upload} onClick={() => setStep(1)}>Choose file</Button></>
        : <><Button variant="ghost" onClick={() => setStep(0)}>Back</Button><Button variant="primary" icon={I.Check} onClick={() => { onClose(); toast({ title: `${good} ${what} imported`, body: `${bad} rows left out. Saved the problem rows as import-problems.xlsx.`, undo: () => toast({ title: 'Import undone', body: `The ${good} ${what} were removed.`, tone: 'info' }) }); }}>Import {good} good rows</Button></>}>
      {step === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-line p-8 flex flex-col items-center text-center gap-2">
          <span className="w-12 h-12 rounded-2xl bg-brand/10 text-brand grid place-items-center"><I.FileSpreadsheet size={24} /></span>
          <p className="font-semibold">Drop an Excel or CSV file here</p>
          <p className="text-[13px] text-ink3 max-w-sm">We check every row first and show you a preview. Nothing is added until you press Import.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-xl border border-line p-3">
            <span className="w-10 h-10 rounded-xl bg-sunken text-ink2 grid place-items-center"><I.FileSpreadsheet size={19} /></span>
            <div className="min-w-0 flex-1"><p className="font-semibold text-[14px] truncate">{items ? 'stock-from-old-software.xlsx' : 'asset-register-2025.xlsx'}</p><p className="text-[12.5px] text-ink3">{good + bad} rows · checked just now</p></div>
          </div>
          <Banner tone="warn" title={`${good} rows ready, ${bad} with problems.`}>Fix the {bad} rows in the file and import again, or import the good rows now.</Banner>
          <ul className="divide-y divide-line/70 rounded-xl border border-line">
            {problems.map(([r, p]) => <li key={r} className="flex gap-3 px-4 py-2.5 text-[13.5px]"><span className="font-mono text-[12.5px] text-ink3 w-14 shrink-0 pt-0.5">{r}</span><span className="text-bad">{p}</span></li>)}
          </ul>
          <p className="text-[12.5px] text-ink3">You can undo the whole import for 24 hours from the toast or the import log.</p>
        </div>
      )}
    </Sheet>
  );
}

function MovementSheet({ open, onClose, kind = 'in', item }) {
  const toast = useToast();
  const K = {
    in: { t: 'Stock in', s: 'Stock that came in without a purchase order, for example a donation.', b: 'Add to stock' },
    out: { t: 'Stock out', s: 'Stock used up in the school, for example cleaning material.', b: 'Take out of stock' },
    transfer: { t: 'Transfer stock', s: 'Move stock from one store location to another.', b: 'Transfer' },
    loss: { t: 'Damaged, lost or expired', s: 'Stock goes down and the reason is kept with the movement.', b: 'Record' },
  }[kind];
  const [id, setId] = useState(ITEMS[0].id);
  const [from, setFrom] = useState('Main store');
  const [to, setTo] = useState('Primary block store');
  const [qty, setQty] = useState('');
  const [loss, setLoss] = useState('Damaged');
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (!open) return;
    const it = item || ITEMS[6];
    setId(it.id); setFrom(Object.keys(it.stock)[0]); setTo(LOCS.find((l) => l !== Object.keys(it.stock)[0])); setQty(''); setReason(''); setTried(false);
    setLoss(it.expired ? 'Expired' : 'Damaged');
  }, [open, item]);
  const it = itemById(id);
  const have = it.stock[from] || 0;
  const q = Number(qty) || 0;
  const errQty = !q ? 'Enter a quantity' : kind !== 'in' && q > have ? `Only ${n(have)} in the ${from.toLowerCase()}` : '';
  const errReason = (kind === 'loss' || kind === 'in') && !reason.trim() ? (kind === 'in' ? 'Say where it came from' : 'Say what happened') : '';
  return (
    <FormSheet open={open} onClose={onClose} title={K.t} sub={K.s} submitLabel={K.b}
      onSubmit={() => {
        setTried(true); if (errQty || errReason) return false;
        toast({ title: `${K.t}: ${n(q)} × ${it.name}`, body: kind === 'transfer' ? `${from} to ${to}. Movement TRF-2026-0022.` : kind === 'loss' ? `${loss}. Movement ADJ-2026-0041 saved with your reason.` : kind === 'in' ? `Now ${n(have + q)} in the ${from.toLowerCase()}.` : `Now ${n(have - q)} in the ${from.toLowerCase()}.` });
      }}>
      <Field label="Item" required id="mv-item"><Select id="mv-item" value={id} onChange={(v) => { setId(v); setFrom(Object.keys(itemById(v).stock)[0]); }} options={ITEMS.map((x) => ({ value: x.id, label: `${x.name} · ${x.id}` }))} /></Field>
      {kind === 'loss' && <Field label="What happened" required><Segmented value={loss} onChange={setLoss} options={['Damaged', 'Lost', 'Expired']} className="w-full" /></Field>}
      <div className="grid grid-cols-2 gap-3">
        <Field label={kind === 'in' ? 'Into location' : 'From location'} required id="mv-from"><Select id="mv-from" value={from} onChange={setFrom} options={LOCS} /></Field>
        {kind === 'transfer'
          ? <Field label="To location" required id="mv-to"><Select id="mv-to" value={to} onChange={setTo} options={LOCS.filter((l) => l !== from)} /></Field>
          : <Field label="Quantity" required id="mv-qty" error={tried && errQty}><Input id="mv-qty" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} error={tried && !!errQty} className="tnum" placeholder={it.unit} /></Field>}
      </div>
      {kind === 'transfer' && <Field label="Quantity" required id="mv-qty2" error={tried && errQty}><Input id="mv-qty2" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))} error={tried && !!errQty} className="tnum" placeholder={it.unit} /></Field>}
      <p className="text-[12.5px] text-ink3 -mt-2 tnum">{n(have)} {plural(it.unit, have)} in the {from.toLowerCase()} now{it.expired && kind === 'loss' ? ` · ${it.expired} in a batch that expired on ${it.expiry}` : ''}</p>
      {!tried && kind !== 'in' && q > have && <Err>Only {n(have)} in the {from.toLowerCase()}. Transfer from another store, or take fewer.</Err>}
      <Field label={kind === 'in' ? 'Where it came from' : kind === 'loss' ? 'Reason' : 'Note'} required={kind === 'in' || kind === 'loss'} id="mv-reason" error={tried && errReason}>
        <Textarea id="mv-reason" value={reason} onChange={setReason} rows={2} placeholder={kind === 'in' ? 'For example: donated by the Rotary Club, Kukatpally' : kind === 'loss' ? 'For example: dropped during the Class 9 practical' : 'Optional'} />
      </Field>
    </FormSheet>
  );
}

/* ======================= Items & Stock ======================= */
const ItemsRoute = ({ params }) => (params?.id ? <ItemDetail id={params.id} /> : <ItemsPage />);

function ItemsPage() {
  const { go } = useNav();
  const toast = useToast();
  const canEdit = useCanEdit();
  const [view, setView] = useState('items');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [sel, setSel] = useState(new Set());
  const [sheet, setSheet] = useState(null);
  const [move, setMove] = useState(null);
  const [preset, setPreset] = useState([]);
  const t = q.trim().toLowerCase();
  const base = view === 'lab' ? ITEMS.filter((x) => x.lab) : ITEMS;
  const rows = base.filter((x) => (cat === 'all' || x.cat === cat) && (!t || x.name.toLowerCase().includes(t) || x.id.toLowerCase().includes(t))).sort((a, b) => RANK[statusOf(a)] - RANK[statusOf(b)]);
  const totalFor = view === 'lab' ? 74 : cat === 'all' ? 312 : CATS.find((c) => c.k === cat).items;
  const request = (ids) => { setPreset(ids); setSheet('request'); };
  const act = (it) => canEdit ? [
    ['PackagePlus', 'Stock in', () => setMove({ kind: 'in', item: it })],
    ['PackageMinus', 'Stock out', () => setMove({ kind: 'out', item: it })],
    ['ArrowRightLeft', 'Transfer', () => setMove({ kind: 'transfer', item: it })],
    ['PackageX', 'Damaged, lost or expired', () => setMove({ kind: 'loss', item: it })],
    ['ShoppingCart', 'Raise purchase request', () => request([it.id])],
  ] : [['Eye', 'Open item', () => go('inventory', { page: 'items', id: it.id })]];

  const cols = [
    { key: 'name', label: 'Item', render: (it) => { const low = statusOf(it) !== 'OK'; return <div className="min-w-0"><p className={cx('font-semibold leading-tight', low && 'text-bad')}>{it.name}</p><p className="text-[12.5px] text-ink3 font-mono">{it.id}</p></div>; } },
    { key: 'cat', label: 'Category', nowrap: true },
    { key: 'hand', label: 'In hand', render: (it) => <div><p className="font-semibold tnum">{n(inHand(it))} <span className="font-normal text-ink3 text-[12.5px]">{plural(it.unit, inHand(it))}</span></p><p className="text-[12px] text-ink3 truncate max-w-[220px]">{Object.entries(it.stock).map(([l, v]) => `${l} ${n(v)}`).join(' · ')}</p></div> },
    { key: 'reorder', label: 'Reorder level', align: 'right', render: (it) => (it.reorder ? n(it.reorder) : <span className="text-ink3">No alert</span>) },
    ...(view === 'lab' ? [{ key: 'exp', label: 'Expiry', nowrap: true, render: (it) => it.expired ? <Pill tone="bad">Batch expired {it.expiry}</Pill> : it.soon ? <Pill tone="warn">Expires {it.expiry}</Pill> : it.expiry ? <span className="tnum text-[13px]">{it.expiry}</span> : <span className="text-ink3">Not tracked</span> }]
      : [{ key: 'val', label: 'Value', align: 'right', render: (it) => inr(inHand(it) * it.price) }]),
    { key: 'st', label: 'Status', render: (it) => <Pill tone={STATUS_TONE[statusOf(it)]} dot={statusOf(it) !== 'OK'}>{statusOf(it)}</Pill> },
    { key: 'act', label: '', render: (it) => <div className="flex justify-end" onClick={(e) => e.stopPropagation()}><MoreMenu size="sm" items={act(it)} label={`Actions for ${it.name}`} /></div> },
  ];

  return (
    <div>
      <ModuleHead sub="312 items in 4 store locations · stock checked against reorder levels every morning"
        actions={<>
          <Button variant="secondary" icon={I.Upload} className="hidden @md:inline-flex" onClick={() => setSheet('import')}>Import</Button>
          <Button variant="secondary" icon={I.ClipboardCheck} onClick={() => setSheet('audit')}>Stock audit</Button>
          <Button variant="primary" icon={I.Plus} onClick={() => setSheet('add')}>Add item</Button>
        </>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        {LOW.length > 0 && (
          <Alert tone="bad" title={`${LOW.length} items are at or below reorder level:`} act={canEdit && 'Raise purchase request'} icon={I.ShoppingCart} onAct={() => request(LOW.map((x) => x.id))}>
            A4 paper, white chalk, whiteboard markers and hand sanitiser. Half-yearly exams start Monday.
          </Alert>
        )}
        <Stats items={[
          { label: 'Items', value: '312', sub: 'In 8 categories', icon: 'Boxes' },
          { label: 'Stock value', value: inr(684250), sub: 'At last purchase price', icon: 'IndianRupee' },
          { label: 'Below reorder level', value: String(LOW.length), sub: '2 books out of stock too', tone: 'bad', icon: 'TriangleAlert', onClick: () => { setView('items'); setCat('all'); setQ(''); } },
          { label: 'Lab chemicals', value: '1 expired', sub: '1 more expires in 37 days', tone: 'warn', icon: 'FlaskConical', onClick: () => setView('lab') },
        ]} />

        <Segmented value={view} onChange={(v) => { setView(v); setCat('all'); setSel(new Set()); }} className="self-start" options={[{ value: 'items', label: 'All items', icon: I.Boxes }, { value: 'lab', label: 'Lab stock', icon: I.FlaskConical }, { value: 'sets', label: 'Book sets', icon: I.BookCopy }]} />

        {view === 'sets' ? <BookSets onMake={() => setSheet('set')} /> : (
          <>
            {view === 'lab' && (
              <Alert tone="warn" title="Copper sulphate: 2 packets expired on 01-09-2026." act={canEdit && 'Record as expired'} icon={I.PackageX} onAct={() => setMove({ kind: 'loss', item: itemById('LB-0046') })}>
                Expired stock cannot be issued.
              </Alert>
            )}
            <Card className="overflow-hidden">
              <Toolbar>
                <SearchBox id="inv-search" value={q} onChange={setQ} placeholder="Item name or code, like ST-0107" />
                <ExportButton what={view === 'lab' ? 'lab stock' : 'items and stock'} />
              </Toolbar>
              {view === 'items' && (
                <div className="px-3 pt-3"><Chips value={cat} onChange={setCat} options={[{ value: 'all', label: 'All', count: 312 }, ...CATS.map((c) => ({ value: c.k, label: c.k, count: c.items }))]} /></div>
              )}
              {canEdit && <div className="mt-3"><BulkBar count={sel.size} onClear={() => setSel(new Set())}>
                <Button size="sm" variant="secondary" icon={I.ShoppingCart} onClick={() => request([...sel])}>Raise purchase request</Button>
                <Button size="sm" variant="secondary" icon={I.Barcode} onClick={() => toast({ title: `${sel.size} barcode labels sent to the store printer`, body: 'One label per item code' })}>Print barcodes</Button>
              </BulkBar></div>}
              <div className={cx(!sel.size && 'mt-2')}>
                <DataList columns={cols} rows={rows} rowKey={(r) => r.id} select={canEdit ? [sel, setSel] : null} minWidth={860}
                  onRow={(it) => go('inventory', { page: 'items', id: it.id })}
                  footer={t ? `${rows.length} found` : `Showing ${rows.length} of ${totalFor} items · lowest stock first`}
                  mobile={(it) => ({ title: it.name, sub: `${it.id} · ${n(inHand(it))} ${plural(it.unit, inHand(it))} in hand${it.reorder ? ` · reorder at ${n(it.reorder)}` : ''}`, icon: catIcon(it.cat), iconTone: statusOf(it) !== 'OK' ? 'bad' : 'neutral', pills: [<Pill key="s" tone={STATUS_TONE[statusOf(it)]} className="!h-[22px] !text-[11.5px]">{statusOf(it)}</Pill>, ...(it.expired ? [<Pill key="e" tone="bad" className="!h-[22px] !text-[11.5px]">Batch expired</Pill>] : it.soon ? [<Pill key="e" tone="warn" className="!h-[22px] !text-[11.5px]">Expires {it.expiry}</Pill>] : [])] })}
                  empty={<Empty icon={I.SearchX} title={`No item called “${q}”`} body="Try the item code, or add it as a new item." action={canEdit && <Button variant="secondary" icon={I.Plus} onClick={() => setSheet('add')}>Add item</Button>} />} />
              </div>
            </Card>
          </>
        )}
      </div>

      <AddItemSheet open={sheet === 'add'} onClose={() => setSheet(null)} />
      <ImportSheet open={sheet === 'import'} onClose={() => setSheet(null)} what="items" />
      <AuditSheet open={sheet === 'audit'} onClose={() => setSheet(null)} />
      <BookSetSheet open={sheet === 'set'} onClose={() => setSheet(null)} />
      <RequestSheet open={sheet === 'request'} onClose={() => setSheet(null)} preset={preset} />
      <MovementSheet open={!!move} onClose={() => setMove(null)} kind={move?.kind} item={move?.item} />
    </div>
  );
}

function BookSets({ onMake }) {
  const { go } = useNav();
  const canEdit = useCanEdit();
  const [open, setOpen] = useState('BS-05');
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[13.5px] text-ink3">Items issued together. Issuing a set lowers every item’s stock and adds the set price to the student’s fees.</p>
        {canEdit && <Button variant="soft" icon={I.Plus} onClick={onMake}>Make book set</Button>}
      </div>
      <div className="grid @md:grid-cols-2 @xl:grid-cols-3 gap-4 items-start">
        {BOOK_SETS.map((s) => {
          const full = fullSets(s); const lim = limitBy(s); const missing = s.items.filter((x) => x[3] === 0).length;
          const on = open === s.id;
          return (
            <Card key={s.id} className="overflow-hidden">
              <div className="p-4 flex items-start gap-3">
                <span className={cx('w-10 h-10 rounded-xl grid place-items-center shrink-0', missing ? TONE_SOFT.bad : TONE_SOFT.brand)}><Icon name={s.id.startsWith('US') ? 'Shirt' : 'BookCopy'} size={19} /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[15px] leading-tight">{s.name}</p>
                  <p className="text-[12.5px] text-ink3 mt-0.5">{s.items.length} items · for Class {s.classes.join(', ')} · {s.issued} issued this year</p>
                </div>
                <p className="font-display font-semibold text-[18px] tnum">{inr(s.price)}</p>
              </div>
              <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
                {missing ? <Pill tone="bad" dot>{missing} of {s.items.length} items out of stock</Pill> : <Pill tone="ok">{full} full sets in stock</Pill>}
                {!missing && <span className="text-[12px] text-ink3">Limited by {lim[1].toLowerCase()}</span>}
              </div>
              <button onClick={() => setOpen(on ? null : s.id)} className="w-full flex items-center justify-between px-4 py-2.5 border-t border-line text-[13px] font-semibold text-ink2 hover:bg-sunken/60">
                {on ? 'Hide items' : 'Show items'}<I.ChevronDown size={16} className={cx('transition', on && 'rotate-180')} />
              </button>
              {on && (
                <ul className="px-4 pb-3 divide-y divide-line/70 animate-fade">
                  {s.items.map(([code, name, qty, have]) => (
                    <li key={code + name} className="flex items-center gap-2 py-2 text-[13.5px]">
                      <span className="flex-1 min-w-0 truncate">{name} <span className="text-ink3">× {qty}</span></span>
                      <span className={cx('tnum text-[12.5px]', have === 0 ? 'text-bad font-semibold' : 'text-ink3')}>{have === 0 ? 'Out of stock' : `${n(have)} in hand`}</span>
                    </li>
                  ))}
                </ul>
              )}
              {canEdit && <div className="px-4 pb-4"><Button size="sm" variant="secondary" icon={I.PackageMinus} className="w-full" onClick={() => go('inventory', { page: 'issue', set: s.id })}>Issue to a student</Button></div>}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function AddItemSheet({ open, onClose }) {
  const toast = useToast();
  const blank = { code: 'ST-0122', name: '', cat: '', unit: 'Piece', reorder: '', stock: '', loc: 'Main store', price: '', exp: false };
  const [f, setF] = useState(blank);
  const [tried, setTried] = useState(false);
  useEffect(() => { if (open) { setF(blank); setTried(false); } }, [open]);
  const set = (k) => (v) => setF({ ...f, [k]: v && v.target ? v.target.value : v });
  const dupCode = ITEMS.find((x) => x.id.toLowerCase() === f.code.trim().toLowerCase());
  const dupName = ITEMS.find((x) => x.name.toLowerCase() === f.name.trim().toLowerCase());
  const err = {
    code: !f.code.trim() ? 'Enter an item code' : dupCode ? `Code ${dupCode.id} belongs to ${dupCode.name}. Use ST-0122.` : '',
    name: !f.name.trim() ? 'Enter the item name' : dupName ? `${dupName.name} already exists (${dupName.id})` : '',
    cat: !f.cat ? 'Choose a category' : '',
  };
  return (
    <FormSheet open={open} onClose={onClose} title="Add item" sub="Only the first four are needed now." submitLabel="Add item"
      onSubmit={() => { setTried(true); if (Object.values(err).some(Boolean)) return false; toast({ title: `${f.name.trim()} added`, body: `Code ${f.code.trim().toUpperCase()}${Number(f.stock) ? ` · opening stock ${f.stock} in the ${f.loc.toLowerCase()}` : ''}` }); }}>
      <div className="grid grid-cols-[130px_1fr] gap-3">
        <Field label="Item code" required id="ai-code" error={(tried || dupCode) && err.code}><Input id="ai-code" value={f.code} onChange={set('code')} className="font-mono uppercase" error={(tried || !!dupCode) && !!err.code} /></Field>
        <Field label="Item name" required id="ai-name" error={(tried || dupName) && err.name}><Input id="ai-name" value={f.name} onChange={set('name')} placeholder="For example: Glue stick, 15 g" error={(tried || !!dupName) && !!err.name} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" required id="ai-cat" error={tried && err.cat}><Select id="ai-cat" value={f.cat} onChange={set('cat')} error={tried && !!err.cat} options={[{ value: '', label: 'Choose' }, ...CATS.map((c) => c.k)]} /></Field>
        <Field label="Unit" required id="ai-unit"><Select id="ai-unit" value={f.unit} onChange={set('unit')} options={UNITS} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Reorder level" id="ai-re" hint={f.cat ? `Default for ${f.cat}: ${CATS.find((c) => c.k === f.cat).reorder || 'no alert'}` : '0 means no alert'}><Input id="ai-re" inputMode="numeric" value={f.reorder} onChange={(e) => setF({ ...f, reorder: e.target.value.replace(/\D/g, '') })} className="tnum" placeholder="0" /></Field>
        <Field label="Price per unit" id="ai-price" hint="For stock value"><Input id="ai-price" inputMode="numeric" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/\D/g, '') })} className="tnum" placeholder="₹" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Opening stock" id="ai-stock"><Input id="ai-stock" inputMode="numeric" value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value.replace(/\D/g, '') })} className="tnum" placeholder="0" /></Field>
        <Field label="Location" id="ai-loc"><Select id="ai-loc" value={f.loc} onChange={set('loc')} options={LOCS} /></Field>
      </div>
      <div className="rounded-xl bg-sunken/70 p-3.5 flex items-center gap-3">
        <Switch id="ai-exp" on={f.exp} onChange={set('exp')} label="Track expiry" />
        <label htmlFor="ai-exp" className="text-[14px]"><b className="font-semibold">Track expiry dates</b><span className="block text-[12.5px] text-ink3">For chemicals and food items. Expired batches cannot be issued.</span></label>
      </div>
    </FormSheet>
  );
}

function AuditSheet({ open, onClose }) {
  const toast = useToast();
  const [loc, setLoc] = useState('Main store');
  const [counts, setCounts] = useState({});
  const list = ITEMS.filter((it) => it.stock[loc] != null);
  useEffect(() => { if (open) { setLoc('Main store'); } }, [open]);
  useEffect(() => {
    const pre = { 'ST-0107': 10, 'UN-0003': 63, 'CL-0004': 15 };
    setCounts(Object.fromEntries(ITEMS.filter((it) => it.stock[loc] != null).map((it) => [it.id, String(loc === 'Main store' && pre[it.id] != null ? pre[it.id] : it.stock[loc])])));
  }, [loc, open]);
  const diffs = list.filter((it) => counts[it.id] !== undefined && Number(counts[it.id]) !== it.stock[loc]);
  return (
    <Sheet open={open} onClose={onClose} title="Stock audit" sub="Count what is on the shelf. Stock changes only after the differences are approved." wide
      footer={<><Button variant="ghost" onClick={onClose}>Save and finish later</Button><Button variant="primary" icon={I.Send} disabled={!diffs.length} onClick={() => { onClose(); toast({ title: `${diffs.length} differences sent for approval`, body: 'Stock changes only after Anita Sharma approves. Audit AUD-2026-0005.' }); }}>{diffs.length ? `Send ${diffs.length} differences for approval` : 'No differences'}</Button></>}>
      <div className="flex flex-col gap-4">
        <Field label="Store location" id="au-loc"><Select id="au-loc" value={loc} onChange={setLoc} options={LOCS} /></Field>
        {diffs.length > 0 && <Banner tone="warn" title={`${diffs.length} differences waiting for approval.`}>Check them once more before sending.</Banner>}
        <div className="rounded-xl border border-line overflow-hidden">
          <div className="grid grid-cols-[1fr_64px_84px_60px] gap-2 px-3 py-2 text-[12px] font-semibold text-ink3 border-b border-line bg-sunken/50"><span>Item</span><span className="text-right">System</span><span className="text-right">Counted</span><span className="text-right">Diff.</span></div>
          <ul className="divide-y divide-line/70">
            {list.map((it) => {
              const c = counts[it.id] ?? ''; const d = (Number(c) || 0) - it.stock[loc];
              return (
                <li key={it.id} className={cx('grid grid-cols-[1fr_64px_84px_60px] gap-2 items-center px-3 py-2', d !== 0 && 'bg-warn/[.06]')}>
                  <span className="min-w-0"><span className="block text-[13.5px] font-semibold truncate">{it.name}</span><span className="block text-[11.5px] text-ink3 font-mono">{it.id}</span></span>
                  <span className="text-right tnum text-[13.5px]">{n(it.stock[loc])}</span>
                  <input value={c} onChange={(e) => setCounts({ ...counts, [it.id]: e.target.value.replace(/\D/g, '') })} inputMode="numeric" aria-label={`Counted ${it.name}`}
                    className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-right tnum text-[14px] outline-none focus:border-brand focus:ring-4 focus:ring-brand/15" />
                  <span className={cx('text-right tnum text-[13.5px] font-semibold', d < 0 ? 'text-bad' : d > 0 ? 'text-ok' : 'text-ink3')}>{d > 0 ? `+${d}` : d}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Sheet>
  );
}

function BookSetSheet({ open, onClose }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [cls, setCls] = useState('6');
  const [lines, setLines] = useState([]);
  const [price, setPrice] = useState('');
  const [tried, setTried] = useState(false);
  useEffect(() => { if (open) { setName('Class 6 book set 2026–27'); setCls('6'); setLines([{ id: 'ST-0107', qty: '6' }, { id: 'UN-0008', qty: '1' }]); setPrice(''); setTried(false); } }, [open]);
  const sum = lines.reduce((a, l) => a + (Number(l.qty) || 0) * itemById(l.id).price, 0);
  const errLines = lines.length < 2 ? 'A set needs at least 2 items' : '';
  return (
    <FormSheet open={open} onClose={onClose} title="Make book set" sub="Items given together, like a class’s textbooks and notebooks, or a uniform set." submitLabel="Save book set" wide
      onSubmit={() => { setTried(true); if (!name.trim() || errLines || !linesOk(lines)) return false; toast({ title: `${name.trim()} saved`, body: `${lines.length} items · ${inr(Number(price) || sum)} · offered first for Class ${cls} students` }); }}>
      <div className="grid @sm:grid-cols-[1fr_140px] gap-3">
        <Field label="Set name" required id="bs-name" error={tried && !name.trim() && 'Give the set a name'}><Input id="bs-name" value={name} onChange={(e) => setName(e.target.value)} error={tried && !name.trim()} /></Field>
        <Field label="For class" id="bs-cls"><Select id="bs-cls" value={cls} onChange={setCls} options={['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'].map((c) => ({ value: c, label: `Class ${c}` }))} /></Field>
      </div>
      <Field label="Items and quantities" required error={tried && errLines}><LineEditor lines={lines} setLines={setLines} tried={tried} filter={(it) => ['Books', 'Stationery', 'Uniforms'].includes(it.cat)} priced /></Field>
      <Field label="Set price" required id="bs-price" hint={`Items add up to ${inr(sum)}. Leave blank to use that.`}>
        <Input id="bs-price" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} placeholder={String(sum)} className="tnum" />
      </Field>
    </FormSheet>
  );
}

function ItemDetail({ id }) {
  const { go } = useNav();
  const toast = useToast();
  const canEdit = useCanEdit();
  const it = itemById(id);
  const st = statusOf(it);
  const [move, setMove] = useState(null);
  const [req, setReq] = useState(false);
  const [per, setPer] = useState(PERIODS.acyear);
  const tot = inHand(it);
  const moves = MOVES.filter((m) => inPer(per, m.d));
  const usedDays = periodDays(per);
  return (
    <div>
      <Back onClick={() => go('inventory', { page: 'items' })} label="Items & Stock" sub={it.cat} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Card className="p-4 @md:p-5 flex flex-col @lg:flex-row @lg:items-center gap-4">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <span className={cx('w-14 h-14 rounded-2xl grid place-items-center shrink-0', st !== 'OK' ? TONE_SOFT.bad : TONE_SOFT.brand)}><Icon name={catIcon(it.cat)} size={26} /></span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display text-[22px] @md:text-[26px] font-semibold tracking-tight leading-tight">{it.name}</h1>
                <Pill tone={STATUS_TONE[st]} dot>{st}</Pill>
              </div>
              <p className="text-[13.5px] text-ink3 mt-0.5"><span className="font-mono text-[12.5px]">{it.id}</span> · {it.cat} · Unit: {it.unit} · Last bought {it.last} from {it.vendor}</p>
            </div>
          </div>
          {canEdit && (
            <div className="flex gap-2 flex-wrap">
              <Button variant="primary" icon={I.PackagePlus} onClick={() => setMove('in')}>Stock in</Button>
              <Button variant="secondary" icon={I.PackageMinus} onClick={() => setMove('out')}>Stock out</Button>
              <MoreMenu items={[
                ['ArrowRightLeft', 'Transfer to another store', () => setMove('transfer')],
                ['PackageX', 'Damaged, lost or expired', () => setMove('loss')],
                ['ShoppingCart', 'Raise purchase request', () => setReq(true)],
                ['Barcode', 'Print barcode label', () => toast({ title: `Barcode label for ${it.id} sent to the store printer` })],
                ['Pencil', 'Edit item', () => toast({ title: `Editing ${it.name}`, body: 'Changes are kept in the audit log.', tone: 'info' })],
              ]} />
            </div>
          )}
        </Card>

        {st !== 'OK' && it.reorder > 0 && (
          <Alert tone="bad" title={`Only ${n(tot)} left. Reorder level is ${n(it.reorder)}.`} act={canEdit && 'Raise purchase request'} icon={I.ShoppingCart} onAct={() => setReq(true)}>
            A low-stock alert went to {it.cat === 'Lab' ? 'Farhana Begum and ' : ''}Ramu Yadav this morning.
          </Alert>
        )}

        <Stats items={[
          { label: 'In hand', value: `${n(tot)} ${plural(it.unit, tot)}`, sub: `${Object.keys(it.stock).length} location${Object.keys(it.stock).length > 1 ? 's' : ''}`, tone: st !== 'OK' ? 'bad' : undefined, icon: 'Boxes' },
          { label: 'Reorder level', value: it.reorder ? n(it.reorder) : 'No alert', sub: it.reorder ? 'Alert at this level' : 'Set in Inventory Settings', icon: 'BellRing' },
          { label: 'Stock value', value: inr(tot * it.price), sub: `${inr(it.price)} per ${it.unit.toLowerCase()}`, icon: 'IndianRupee' },
          { label: `Used · ${per.label.toLowerCase()}`, value: n(Math.round(Math.max(4, Math.round((it.reorder || 10) * 1.4)) * Math.min(usedDays, 365) / 30)), sub: `Issued and used up · ${fmtRange(per)}`, icon: 'TrendingDown' },
        ]} />

        <Split>
          <Card className="overflow-hidden">
            <CardHead title="Stock movements" sub="Every change, newest first. Corrections are new movements; nothing is edited." />
            <Toolbar className="border-t">
              <DatePeriod id="mv-per" value={per} onChange={setPer} className="w-full @md:w-auto" />
              <ExportButton what={`movements of ${it.id}`} />
            </Toolbar>
            <DataList rows={moves} rowKey={(m) => m.ref} minWidth={620} footer={`${moves.length} movement${moves.length === 1 ? '' : 's'} · ${per.label.toLowerCase()} · ${fmtRange(per)}`}
              empty={<Empty icon={I.CalendarX} title="No stock movements in these dates" body={`Nothing came in or went out of ${it.name.toLowerCase()} between ${fmtRange(per)}. Pick a longer period.`} />}
              columns={[
                { key: 'd', label: 'Date', nowrap: true, render: (m) => <span className="text-[13px] tnum">{m.d}</span> },
                { key: 'type', label: 'Type', render: (m) => <Pill tone={MOVE_TONE[m.type]}>{m.type}</Pill> },
                { key: 'q', label: 'Qty', align: 'right', render: (m) => <span className={cx('font-semibold', m.q > 0 ? 'text-ok' : 'text-ink')}>{m.q > 0 ? `+${m.q}` : m.q}</span> },
                { key: 'note', label: 'Details', render: (m) => <div><p className="text-[13.5px] leading-snug">{m.note}</p><p className="text-[12px] text-ink3"><span className="font-mono">{m.ref}</span> · {m.by}</p></div> },
              ]}
              mobile={(m) => ({ title: m.note, sub: `${m.d} · ${m.ref}`, icon: m.q > 0 ? 'ArrowDownToLine' : 'ArrowUpFromLine', iconTone: MOVE_TONE[m.type], right: <span className={cx('font-semibold tnum', m.q > 0 && 'text-ok')}>{m.q > 0 ? `+${m.q}` : m.q}</span> })} />
          </Card>
          <Col>
            <Card>
              <CardHead title="Stock by location" />
              <ul className="px-5 pb-5 flex flex-col gap-3">
                {LOCS.map((l) => {
                  const v = it.stock[l] || 0;
                  return (
                    <li key={l} className="text-[14px]">
                      <div className="flex justify-between mb-1"><span className={cx(!v && 'text-ink3')}>{l}</span><b className="font-semibold tnum">{n(v)}</b></div>
                      <Progress value={tot ? (v / tot) * 100 : 0} />
                    </li>
                  );
                })}
              </ul>
            </Card>
            {it.expiry && (
              <Card>
                <CardHead title="Batches and expiry" icon={I.FlaskConical} />
                <ul className="px-5 pb-5 flex flex-col gap-2 text-[14px]">
                  <li className="flex justify-between gap-3"><span>Batch B-2311 · {n(tot - (it.expired || 0))}</span><span className={cx('tnum', it.soon && 'text-warn font-semibold')}>Expires {it.expiry}</span></li>
                  {it.expired && <li className="flex justify-between gap-3 text-bad"><span>Batch B-2207 · {it.expired}</span><span className="font-semibold tnum">Expired 01-09-2026</span></li>}
                </ul>
              </Card>
            )}
            {it.asset && (
              <Card>
                <CardHead title="Used with" sub="Spare parts linked to an asset" />
                <div className="px-2 pb-2"><Row icon="Monitor" title="Laser printer, HP LaserJet Pro M404" sub="AT-0451 · Office · Anita Sharma" onClick={() => go('inventory', { page: 'assets', id: 'AT-0451' })} right={<I.ChevronRight size={18} className="text-ink3" />} /></div>
              </Card>
            )}
            <Card>
              <CardHead title="Bought from" />
              <div className="px-2 pb-2"><Row avatar={it.vendor} title={it.vendor} sub={`Last bought ${it.last} at ${inr(it.price)} per ${it.unit.toLowerCase()}`} onClick={() => go('inventory', { page: 'purchases', tab: 'vendors' })} right={<I.ChevronRight size={18} className="text-ink3" />} /></div>
            </Card>
          </Col>
        </Split>
      </div>
      <MovementSheet open={!!move} onClose={() => setMove(null)} kind={move || 'in'} item={it} />
      <RequestSheet open={req} onClose={() => setReq(false)} preset={[it.id]} />
    </div>
  );
}

/* ======================= Issue Stock ======================= */
function IssuePage({ params }) {
  const toast = useToast();
  const canEdit = useCanEdit();
  const [list, setList] = useState(ISSUES);
  const [f, setF] = useState('all');
  const [q, setQ] = useState('');
  const [sheet, setSheet] = useState(params?.set ? 'set' : null);
  const [ret, setRet] = useState(null);
  const [per, setPer] = useState(PERIODS.thismonth);
  const t = q.trim().toLowerCase();
  const rows = list.filter((r) => inPer(per, r.d) && (f === 'all' || (f === 'students' ? r.kind === 'Student' : r.ret && !r.back)) && (!t || r.item.toLowerCase().includes(t) || r.to.toLowerCase().includes(t) || r.id.toLowerCase().includes(t)));
  const out = list.filter((r) => r.ret && !r.back);
  const charged = list.filter((r) => r.charge).reduce((a, r) => a + r.charge, 0);
  return (
    <div>
      <ModuleHead sub="Give items to staff, departments and classes, and books and uniforms to students at the store counter"
        actions={<>
          <Button variant="secondary" icon={I.BookCopy} onClick={() => setSheet('set')}>Issue book set</Button>
          <Button variant="secondary" icon={I.User} className="hidden @md:inline-flex" onClick={() => setSheet('student')}>Issue to student</Button>
          <Button variant="primary" icon={I.PackageMinus} onClick={() => setSheet('issue')}>Issue stock</Button>
        </>} />
      <Split>
        <Card className="overflow-hidden">
          <Toolbar>
            <SearchBox id="iss-search" value={q} onChange={setQ} placeholder="Item, person, class or issue number" />
            <DatePeriod id="iss-per" value={per} onChange={setPer} className="w-full @md:w-auto" />
            <ExportButton what="issues" />
          </Toolbar>
          <div className="px-3 pt-3"><Segmented value={f} onChange={setF} size="sm" options={[{ value: 'all', label: 'All' }, { value: 'students', label: 'To students' }, { value: 'out', label: `Not returned ${out.length}` }]} /></div>
          <DataList rows={rows} rowKey={(r) => r.id} minWidth={780} footer={`${rows.length} issue${rows.length === 1 ? '' : 's'} · ${per.label.toLowerCase()} · ${fmtRange(per)}`}
            empty={<Empty icon={I.CalendarX} title={t ? `Nothing matches “${q}” in these dates` : 'No issues in these dates'} body={`Nothing was issued between ${fmtRange(per)}${f !== 'all' ? ' with this filter' : ''}. Pick a longer period.`} />}
            columns={[
              { key: 'd', label: 'Date', nowrap: true, render: (r) => <div><p className="text-[13.5px] tnum">{r.d}</p><p className="text-[11.5px] text-ink3"><span className="font-mono">{r.id}</span> · by {r.by.split(' ')[0]}</p></div> },
              { key: 'item', label: 'Item', render: (r) => <div><p className="font-semibold leading-tight">{r.item}</p><p className="text-[12.5px] text-ink3 tnum">{n(r.q)} {r.unit}</p></div> },
              { key: 'to', label: 'Issued to', render: (r) => <div><p className="leading-tight">{r.to}</p><p className="text-[12px] text-ink3">{r.kind}{r.charge ? ` · ${inr(r.charge)} to fees` : ''}</p></div> },
              { key: 'ret', label: 'Returnable', render: (r) => !r.ret ? <span className="text-ink3 text-[13px]">No</span> : r.back ? <Pill tone="ok">Returned {r.back.split(',')[0]}</Pill> : <Pill tone="warn">Due {r.due.replace(/^after .*?, /, '')}</Pill> },
              { key: 'act', label: '', render: (r) => r.ret && !r.back && canEdit ? <Button size="sm" variant="secondary" icon={I.CornerDownLeft} onClick={() => setRet(r)}>Record return</Button> : null },
            ]}
            mobile={(r) => ({ title: `${r.item} × ${n(r.q)}`, sub: `${r.to} · ${r.d}`, icon: r.kind === 'Student' ? 'GraduationCap' : r.kind === 'Class' ? 'School' : r.kind === 'Staff' ? 'User' : 'Building2', iconTone: r.ret && !r.back ? 'warn' : 'neutral',
              pills: [r.charge && <Pill key="c" tone="info" className="!h-[22px] !text-[11.5px]">{inr(r.charge)} to fees</Pill>, r.ret && (r.back ? <Pill key="r" tone="ok" className="!h-[22px] !text-[11.5px]">Returned</Pill> : <Pill key="r" tone="warn" className="!h-[22px] !text-[11.5px]">Return due</Pill>)].filter(Boolean) })}
            onRow={canEdit ? (r) => (r.ret && !r.back ? setRet(r) : toast({ title: `${r.id}: ${r.item} × ${n(r.q)}`, body: `Issued to ${r.to} on ${r.d} by ${r.by}.`, tone: 'info' })) : undefined} />
        </Card>
        <Col>
          <Card>
            <CardHead title="Store counter today" icon={I.Store} />
            <div className="grid grid-cols-2 gap-px bg-line/70 border-y border-line/70">
              {[['Issues', '3'], ['Charged to fees', inr(3450)], ['Return due', String(out.length)], ['Book sets left', '12 + 0']].map(([k, v]) => <div key={k} className="bg-surface px-5 py-3"><p className="text-[12px] text-ink3 font-semibold">{k}</p><p className="font-display font-semibold text-[19px] tnum">{v}</p></div>)}
            </div>
            <p className="px-5 py-3 text-[12.5px] text-ink3">Book set charges this year: <b className="text-ink2 tnum">{inr(charged + 512650)}</b>, sent to Fee Management as Store charges.</p>
          </Card>
          <Card>
            <CardHead title="Still out" sub="Returnable items not back yet" />
            <ul className="px-2 pb-2">
              {out.map((r) => <li key={r.id}><Row avatar={r.to} title={`${r.item} × ${r.q}`} sub={`${r.to} · due ${r.due}`} onClick={canEdit ? () => setRet(r) : undefined} right={canEdit ? <span className="text-[13px] font-semibold text-brand">Return</span> : null} /></li>)}
            </ul>
          </Card>
        </Col>
      </Split>
      <IssueSheet open={sheet === 'issue' || sheet === 'student'} student={sheet === 'student'} onClose={() => setSheet(null)}
        onDone={(r) => setList((x) => [r, ...x])} />
      <SetIssueSheet open={sheet === 'set'} onClose={() => setSheet(null)} presetSet={params?.set} onDone={(r) => setList((x) => [r, ...x])} />
      <ConfirmSheet open={!!ret} onClose={() => setRet(null)} title={ret ? `Record return: ${ret.item}` : ''} sub={ret ? `${ret.q} ${ret.unit} back from ${ret.to}. Stock in the store goes up by ${ret.q}.` : ''} confirmLabel={ret ? `Record ${ret.q} returned` : 'Record'}
        onConfirm={() => { const r = ret; setList((x) => x.map((y) => (y.id === r.id ? { ...y, back: '9 Oct, 10:44 AM' } : y))); toast({ title: `${r.item} × ${r.q} returned`, body: `From ${r.to}. Back in stock.`, undo: () => setList((x) => x.map((y) => (y.id === r.id ? { ...y, back: null } : y))) }); }}>
        <p className="text-[14px] text-ink2">If anything came back broken, record it under Damaged, lost or expired on the item.</p>
      </ConfirmSheet>
    </div>
  );
}

function IssueSheet({ open, onClose, student, onDone }) {
  const toast = useToast();
  const [to, setTo] = useState('Staff');
  const [whom, setWhom] = useState('');
  const [from, setFrom] = useState('Main store');
  const [lines, setLines] = useState([]);
  const [size, setSize] = useState('30');
  const [charge, setCharge] = useState(true);
  const [retn, setRetn] = useState(false);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (!open) return;
    setTo(student ? 'Student' : 'Staff'); setWhom(student ? FEATURED.id : ''); setFrom('Main store');
    setLines(student ? [{ id: 'UN-0003', qty: '1' }] : [{ id: 'ST-0107', qty: '' }]); setCharge(true); setRetn(false); setNote(''); setTried(false);
  }, [open, student]);
  const opts = to === 'Staff' ? STAFF.map((s) => ({ value: s.name, label: `${s.name} · ${s.desig}` }))
    : to === 'Department' ? DEPTS : to === 'Class' ? SECTIONS.map((s) => ({ value: s, label: `Class ${s}` }))
      : COUNTER_STUDENTS.map((s) => ({ value: s.id, label: `${s.name} · ${s.cls} ${s.sec}` }));
  const stu = COUNTER_STUDENTS.find((s) => s.id === whom);
  const who = to === 'Student' ? (stu ? stu.name : '') : whom;
  const total = lines.reduce((a, l) => a + (Number(l.qty) || 0) * itemById(l.id).price, 0);
  const errWhom = !whom ? `Choose the ${to.toLowerCase()}` : '';
  const hasUniform = lines.some((l) => itemById(l.id).cat === 'Uniforms');
  return (
    <FormSheet open={open} onClose={onClose} title={to === 'Student' ? 'Issue to a student' : 'Issue stock'} sub={to === 'Student' ? 'Books and uniforms at the store counter. The charge goes to the student’s fees.' : 'You cannot issue more than the store has.'} submitLabel={to === 'Student' && charge ? `Issue and add ${inr(total)} to fees` : 'Issue'} busyLabel="Issuing…" wide
      onSubmit={() => {
        setTried(true); if (errWhom || !linesOk(lines, from, true)) return false;
        const l0 = itemById(lines[0].id);
        onDone?.({ id: 'ISS-2026-0415', d: '9 Oct, 10:44 AM', item: l0.name + (lines.length > 1 ? ` and ${lines.length - 1} more` : ''), q: Number(lines[0].qty), unit: l0.unit.toLowerCase(), to: to === 'Student' && stu ? `${stu.name}, ${stu.cls.replace('Class ', '')} ${stu.sec}` : who, kind: to, by: 'Ramu Yadav', ret: retn, back: null, due: '16 Oct', charge: to === 'Student' && charge ? total : 0 });
        toast({ title: `Issued to ${who}`, body: to === 'Student' && charge ? `${inr(total)} added to ${who}’s fees as Store charges. Issue ISS-2026-0415.` : `Stock in the ${from.toLowerCase()} goes down. Issue ISS-2026-0415.` });
      }}>
      <Field label="Issue to" required><Segmented value={to} onChange={(v) => { setTo(v); setWhom(v === 'Student' ? FEATURED.id : ''); }} options={['Staff', 'Department', 'Class', 'Student']} className="w-full" /></Field>
      <div className="grid @sm:grid-cols-2 gap-3">
        <Field label={to === 'Student' ? 'Student' : to} required id="is-whom" error={tried && errWhom}><Select id="is-whom" value={whom} onChange={setWhom} error={tried && !!errWhom} options={[{ value: '', label: 'Choose' }, ...opts]} /></Field>
        <Field label="From location" required id="is-from"><Select id="is-from" value={from} onChange={setFrom} options={LOCS} /></Field>
      </div>
      <Field label="Items and quantities" required hint="Shows what is in the chosen store. You cannot go above it.">
        <LineEditor lines={lines} setLines={setLines} from={from} check tried={tried} priced={to === 'Student'} filter={to === 'Student' ? (it) => ['Books', 'Uniforms', 'Stationery'].includes(it.cat) : undefined} />
      </Field>
      {hasUniform && <Field label="Size" id="is-size"><Segmented value={size} onChange={setSize} options={['26', '28', '30', '32', '34']} size="sm" /></Field>}
      {to === 'Student' ? (
        <div className="rounded-xl bg-sunken/70 p-3.5 flex items-center gap-3">
          <Switch id="is-charge" on={charge} onChange={setCharge} label="Charge to student's fees" />
          <label htmlFor="is-charge" className="text-[14px] flex-1"><b className="font-semibold">Charge to the student’s fees</b><span className="block text-[12.5px] text-ink3">{charge ? `${inr(total)} at the item price. Parents see it on Parent Link.` : 'Free issue. Nothing is added to fees.'}</span></label>
        </div>
      ) : (
        <div className="rounded-xl bg-sunken/70 p-3.5 flex items-center gap-3">
          <Switch id="is-ret" on={retn} onChange={setRetn} label="Returnable" />
          <label htmlFor="is-ret" className="text-[14px] flex-1"><b className="font-semibold">Returnable</b><span className="block text-[12.5px] text-ink3">For things that come back, like footballs or lab glassware.</span></label>
        </div>
      )}
      <Field label="Note" id="is-note"><Input id="is-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" /></Field>
    </FormSheet>
  );
}

function SetIssueSheet({ open, onClose, presetSet, onDone }) {
  const toast = useToast();
  const { role } = useRole();
  const seesFees = inMenu(role, 'fees'); // fee dues only for people who work in Fee Management
  const [sid, setSid] = useState('');
  const [setId, setSetId] = useState('BS-05');
  const [without, setWithout] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const s = BOOK_SETS.find((x) => x.id === presetSet) || BOOK_SETS[0];
    const st = COUNTER_STUDENTS.find((x) => s.classes.includes(x.clsId)) || COUNTER_STUDENTS[0];
    setSetId(s.id); setSid(st.id); setWithout(false);
  }, [open, presetSet]);
  const stu = COUNTER_STUDENTS.find((s) => s.id === sid) || COUNTER_STUDENTS[0];
  const set = BOOK_SETS.find((s) => s.id === setId);
  const missing = set.items.filter((x) => x[3] === 0);
  const ok = !missing.length || without;
  const pickStudent = (v) => { setSid(v); const s = COUNTER_STUDENTS.find((x) => x.id === v); const match = BOOK_SETS.find((b) => b.classes.includes(s.clsId)); if (match) setSetId(match.id); setWithout(false); };
  return (
    <Sheet open={open} onClose={onClose} title="Issue a book set" sub="Every item’s stock goes down and the set price goes to the student’s fees, in one step." wide
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={I.Check} loading={busy} disabled={!ok} onClick={() => {
        setBusy(true);
        setTimeout(() => {
          setBusy(false); onClose();
          onDone?.({ id: 'ISS-2026-0415', d: '9 Oct, 10:44 AM', item: set.name, q: 1, unit: 'set', to: `${stu.name}, ${stu.cls.replace('Class ', '')} ${stu.sec}`, kind: 'Student', by: 'Ramu Yadav', ret: false, charge: set.price });
          toast({ title: `${set.name} issued to ${stu.name}`, body: `${inr(set.price)} added to fees.${missing.length ? ` ${missing.length} missing items noted to give later.` : ''}` });
        }, 800);
      }}>{busy ? 'Issuing…' : `Issue set · add ${inr(set.price)} to fees`}</Button></>}>
      <div className="flex flex-col gap-4">
        <div className="grid @sm:grid-cols-2 gap-3">
          <Field label="Student" required id="si-stu"><Select id="si-stu" value={sid} onChange={pickStudent} options={COUNTER_STUDENTS.map((s) => ({ value: s.id, label: `${s.name} · ${s.cls} ${s.sec}` }))} /></Field>
          <Field label="Set" required id="si-set" hint={set.classes.includes(stu.clsId) ? `Offered first for ${stu.cls}` : `This set is for Class ${set.classes.join(', ')}`}><Select id="si-set" value={setId} onChange={(v) => { setSetId(v); setWithout(false); }} options={BOOK_SETS.map((s) => ({ value: s.id, label: s.name }))} /></Field>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-line p-3">
          <Avatar name={stu.name} size={40} />
          <div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px]">{stu.name}</p><p className="text-[12.5px] text-ink3">{stu.cls} {stu.sec} · Roll {stu.roll} · <span className="font-mono">{stu.adm}</span></p></div>
          {seesFees && stu.due > 0 && <Pill tone={stu.feeState === 'Overdue' ? 'bad' : 'warn'}>{inr(stu.due)} {stu.feeState === 'Overdue' ? 'overdue' : 'due'}</Pill>}
        </div>
        {missing.length > 0 && (
          <Banner tone="bad" title={`${missing.length} of ${set.items.length} items are out of stock:`}>{missing.map((m) => m[1]).join(' and ')}. Issue the rest now and the missing items later, or wait.</Banner>
        )}
        <ul className="rounded-xl border border-line divide-y divide-line/70">
          {set.items.map(([code, name, qty, have]) => (
            <li key={code + name} className="flex items-center gap-3 px-3.5 py-2.5 text-[14px]">
              {have >= qty ? <I.CircleCheck size={17} className="text-ok shrink-0" /> : <I.CircleX size={17} className="text-bad shrink-0" />}
              <span className="flex-1 min-w-0"><span className="font-medium">{name}</span> <span className="text-ink3">× {qty}</span></span>
              <span className={cx('text-[12.5px] tnum', have < qty ? 'text-bad font-semibold' : 'text-ink3')}>{have < qty ? 'Out of stock' : `${n(have)} → ${n(have - qty)}`}</span>
            </li>
          ))}
        </ul>
        {missing.length > 0 && (
          <label className="flex items-start gap-3 rounded-xl bg-sunken/70 p-3.5 cursor-pointer">
            <Checkbox checked={without} onChange={setWithout} label="Issue without the missing items" />
            <span className="text-[14px]"><b className="font-semibold">Issue the other {set.items.length - missing.length} items now</b><span className="block text-[12.5px] text-ink3">The missing items are listed against {stu.first} and given when stock arrives. No new charge.</span></span>
          </label>
        )}
      </div>
    </Sheet>
  );
}

/* ======================= Purchases & Vendors ======================= */
function PurchasesPage({ params }) {
  const toast = useToast();
  const { go } = useNav();
  const { role } = useRole();
  const canEdit = useCanEdit();
  // Purchase requests: up to ₹10,000 the School Admin approves, above it the Principal. Nobody approves their own request.
  const mayApprove = (r) => canEdit && r.by !== role.person.name && (role.id === 'principal' || (role.id === 'schooladmin' && r.amt <= 10000));
  // Paying a vendor is money going out of the school: only people who run Finance record it here
  const canPay = canEdit && role.access.finance === 'full';
  const seesBank = !!role.access.finance;
  // The Accountant sees what reaches Finance: orders, goods received, bills and vendors. Not the internal requests.
  const showReq = role.id !== 'accountant';
  const [tab, setTab] = useState(params?.tab || (showReq ? 'requests' : 'bills'));
  const [per, setPer] = useState(PERIODS.last30);
  const [q, setQ] = useState('');
  const [reqs, setReqs] = useState(REQUESTS);
  const [bills, setBills] = useState(BILLS);
  const [sheet, setSheet] = useState(null);
  const [cur, setCur] = useState(null);
  const t = q.trim().toLowerCase();
  const m = (s) => !t || s.toLowerCase().includes(t);
  const dIn = (d) => inPer(per, d);
  const none = <Empty icon={I.CalendarX} title={t ? `Nothing matches “${q}” in these dates` : 'Nothing in these dates'} body={`Nothing between ${fmtRange(per)}. Pick a longer period${t ? ' or clear the search' : ''}.`} />;
  const decide = (r, ok) => {
    setReqs((x) => x.map((y) => (y.id === r.id ? { ...y, status: ok ? 'Approved' : 'Rejected', note: ok ? `Approved by ${role.person.name}, 9 Oct` : `Rejected by ${role.person.name}, 9 Oct` } : y)));
    toast({ title: `${ok ? 'Approved' : 'Rejected'}: ${r.id}`, body: ok ? `${r.by} can now make the purchase order.` : `${r.by} sees your decision.`, undo: () => setReqs((x) => x.map((y) => (y.id === r.id ? r : y))) });
  };
  const unpaid = bills.filter((b) => b.status !== 'Paid').reduce((a, b) => a + b.amt - b.paid, 0);
  const sm = (k) => (x) => ({ key: k, ...x });

  const lists = {
    requests: (
      <DataList rows={reqs.filter((r) => dIn(r.d) && m(r.id + r.items + r.by))} rowKey={(r) => r.id} empty={none} minWidth={820}
        columns={[
          { key: 'id', label: 'Request', nowrap: true, render: (r) => <div><p className="font-mono text-[12.5px] font-semibold">{r.id}</p><p className="text-[12px] text-ink3">{r.d}</p></div> },
          { key: 'items', label: 'Items', render: (r) => <div className="max-w-[340px]"><p className="text-[13.5px] leading-snug">{r.items}</p><p className="text-[12px] text-ink3">{r.reason}</p></div> },
          { key: 'by', label: 'Raised by', render: (r) => <div><p className="leading-tight">{r.by}</p><p className="text-[12px] text-ink3">{r.dept}</p></div> },
          { key: 'amt', label: 'Estimate', align: 'right', render: (r) => inr(r.amt) },
          { key: 'st', label: 'Status', render: (r) => <div><Pill tone={PR_TONE[r.status]}>{r.status}</Pill><p className="text-[11.5px] text-ink3 mt-1 max-w-[200px]">{r.note}</p></div> },
          { key: 'act', label: '', render: (r) => r.status === 'Waiting' && mayApprove(r) ? <div className="flex gap-1.5 justify-end"><Button size="sm" variant="soft" icon={I.Check} onClick={() => decide(r, true)}>Approve</Button><Button size="sm" variant="ghost" onClick={() => decide(r, false)}>Reject</Button></div>
            : r.status === 'Approved' && !/PO-/.test(r.note) && canEdit ? <Button size="sm" variant="secondary" onClick={() => { setCur(r); setSheet('po'); }}>Make PO</Button> : null },
        ]}
        mobile={(r) => ({ title: r.items, sub: `${r.id} · ${r.by} · ${inr(r.amt)}`, icon: 'ClipboardList', iconTone: PR_TONE[r.status], pills: [<Pill key="s" tone={PR_TONE[r.status]} className="!h-[22px] !text-[11.5px]">{r.status}</Pill>] })}
        footer={`${reqs.filter((r) => r.status === 'Waiting').length} waiting · above ₹10,000 the Principal approves, nobody approves their own request`} />
    ),
    orders: (
      <DataList rows={ORDERS.filter((o) => dIn(o.d) && m(o.id + o.vendor + o.items))} rowKey={(o) => o.id} empty={none} minWidth={820}
        columns={[
          { key: 'id', label: 'Order', nowrap: true, render: (o) => <div><p className="font-mono text-[12.5px] font-semibold">{o.id}</p><p className="text-[12px] text-ink3">{o.d}</p></div> },
          { key: 'vendor', label: 'Vendor', render: (o) => <span className="font-semibold">{o.vendor}</span> },
          { key: 'items', label: 'Items', render: (o) => <div className="max-w-[300px]"><p className="text-[13.5px] leading-snug">{o.items}</p><p className="text-[12px] text-ink3">{o.note}</p></div> },
          { key: 'amt', label: 'Amount', align: 'right', render: (o) => inr(o.amt) },
          { key: 'st', label: 'Status', render: (o) => <Pill tone={PO_TONE[o.status]}>{o.status}</Pill> },
          { key: 'act', label: '', render: (o) => <div className="flex gap-1.5 justify-end" onClick={(e) => e.stopPropagation()}>
            {canEdit && ['Sent', 'Part received'].includes(o.status) && <Button size="sm" variant="secondary" icon={I.PackageCheck} onClick={() => { setCur(o); setSheet('receive'); }}>Receive goods</Button>}
            <MoreMenu size="sm" items={[...(canEdit ? [['Mail', 'Email PO to vendor', () => toast({ title: `${o.id} emailed to ${o.vendor}` })]] : []), ['Printer', 'Print PO', () => toast({ title: `${o.id} sent to the office printer` })], ['Download', 'Save as PDF', () => toast({ title: `Saved: ${o.id}.pdf` })]]} />
          </div> },
        ]}
        mobile={(o) => ({ title: o.vendor, sub: `${o.id} · ${o.items}`, icon: 'ShoppingCart', iconTone: PO_TONE[o.status], right: <span className="font-semibold tnum text-[14px]">{inr(o.amt)}</span>, pills: [<Pill key="s" tone={PO_TONE[o.status]} className="!h-[22px] !text-[11.5px]">{o.status}</Pill>] })}
        onRow={canEdit ? (o) => (['Sent', 'Part received'].includes(o.status) ? (setCur(o), setSheet('receive')) : toast({ title: `${o.id} · ${o.status}`, body: o.note, tone: 'info' })) : undefined}
        footer={`${ORDERS.filter((o) => ['Sent', 'Part received'].includes(o.status)).length} orders waiting for goods`} />
    ),
    grn: (
      <DataList rows={GRNS.filter((g) => dIn(g.d) && m(g.id + g.vendor + g.po))} rowKey={(g) => g.id} empty={none} minWidth={760}
        columns={[
          { key: 'id', label: 'Goods received', nowrap: true, render: (g) => <div><p className="font-mono text-[12.5px] font-semibold">{g.id}</p><p className="text-[12px] text-ink3">{g.d}</p></div> },
          { key: 'po', label: 'Against', render: (g) => <div><p className="font-mono text-[12.5px]">{g.po}</p><p className="text-[12px] text-ink3">{g.vendor}</p></div> },
          { key: 'items', label: 'Items', render: (g) => <span className="text-[13.5px]">{g.items}</span> },
          { key: 'loc', label: 'Into', nowrap: true },
          { key: 'st', label: 'Status', render: (g) => <Pill tone={g.status === 'Complete' ? 'ok' : 'warn'}>{g.status}</Pill> },
        ]}
        mobile={(g) => ({ title: g.items, sub: `${g.id} · ${g.po} · ${g.loc}`, icon: 'PackageCheck', iconTone: g.status === 'Complete' ? 'ok' : 'warn' })} footer="Stock goes up in the chosen location when goods are received" />
    ),
    bills: (
      <DataList rows={bills.filter((b) => dIn(b.d) && m(b.id + b.vendor + b.po))} rowKey={(b) => b.id} empty={none} minWidth={860}
        columns={[
          { key: 'id', label: 'Vendor bill', nowrap: true, render: (b) => <div><p className="font-mono text-[12.5px] font-semibold">{b.id}</p><p className="text-[12px] text-ink3">{b.d}</p></div> },
          { key: 'vendor', label: 'Vendor', render: (b) => <div><p className="font-semibold leading-tight">{b.vendor}</p><p className="text-[12px] text-ink3 font-mono">{b.po}</p></div> },
          { key: 'amt', label: 'Amount', align: 'right', render: (b) => inr(b.amt) },
          { key: 'paid', label: 'Paid', align: 'right', render: (b) => (b.paid ? inr(b.paid) : '—') },
          { key: 'st', label: 'Status', render: (b) => <div><Pill tone={BILL_TONE[b.status]}>{b.status}</Pill><p className="text-[11.5px] text-ink3 mt-1">{b.fin ? `Finance: ${b.fin}` : `Due ${b.due}`}</p></div> },
          { key: 'act', label: '', render: (b) => <div className="flex gap-1.5 justify-end" onClick={(e) => e.stopPropagation()}>
            {canPay && b.status !== 'Paid' && <Button size="sm" variant="soft" icon={I.IndianRupee} onClick={() => { setCur(b); setSheet('pay'); }}>Pay</Button>}
            <MoreMenu size="sm" items={[['Eye', 'View bill photo', () => toast({ title: `Opening ${b.id}`, tone: 'info' })], ...(canPay && b.paid ? [['Ban', 'Cancel payment with a reason', () => { setCur(b); setSheet('cancel'); }, 'bad']] : [])]} />
          </div> },
        ]}
        mobile={(b) => ({ title: b.vendor, sub: `${b.id} · due ${b.due}`, icon: 'ReceiptText', iconTone: BILL_TONE[b.status], right: <span className="font-semibold tnum text-[14px]">{inr(b.amt - b.paid)}</span>, pills: [<Pill key="s" tone={BILL_TONE[b.status]} className="!h-[22px] !text-[11.5px]">{b.status}</Pill>] })}
        onRow={(b) => (canPay && b.status !== 'Paid' ? (setCur(b), setSheet('pay')) : toast({ title: `${b.id} · ${b.status}`, body: b.fin ? `Finance: ${b.fin}` : `${inr(b.amt - b.paid)} due by ${b.due}. The Accountant pays it in Finance, Expenses.`, tone: 'info' }))}
        footer={`${inr(unpaid)} unpaid · bills and payments reach Finance (Expenses and Day Book)`} />
    ),
    vendors: (
      <DataList rows={VENDORS.filter((v) => m(v.name + v.gst + v.phone + v.items))} rowKey={(v) => v.id} minWidth={820}
        columns={[
          { key: 'name', label: 'Vendor', render: (v) => <div className="flex items-center gap-3"><Avatar name={v.name} size={36} /><div><p className="font-semibold leading-tight">{v.name}</p><p className="text-[12px] text-ink3">{v.place} · {v.contact}</p></div></div> },
          { key: 'phone', label: 'Phone', nowrap: true, render: (v) => <span className="tnum">{v.phone}</span> },
          { key: 'gst', label: 'GSTIN', render: (v) => <span className="font-mono text-[12.5px]">{v.gst}</span> },
          { key: 'items', label: 'Supplies', render: (v) => <span className="text-[13.5px]">{v.items}</span> },
          { key: 'open', label: 'Unpaid', align: 'right', render: (v) => (v.open ? <span className="text-bad font-semibold">{inr(v.open)}</span> : <span className="text-ink3">—</span>) },
        ]}
        mobile={(v) => ({ title: v.name, sub: `${v.items} · ${v.phone}`, avatar: v.name, right: v.open ? <span className="text-bad font-semibold tnum text-[13.5px]">{inr(v.open)}</span> : null })}
        onRow={(v) => toast({ title: v.name, body: `${v.contact} · ${v.phone} · ${v.email}${seesBank ? ` · ${v.bank}` : ''} · ${v.orders} orders this year`, tone: 'info' })}
        footer="One vendor list, shared with Finance" />
    ),
  };

  return (
    <div>
      <ModuleHead sub="Request, order, goods received, bill. Bills and payments reach Finance as expenses."
        actions={<>
          <Button variant="secondary" icon={I.UserPlus} onClick={() => setSheet('vendor')}>Add vendor</Button>
          <Button variant="secondary" icon={I.ReceiptText} className="hidden @md:inline-flex" onClick={() => setSheet('bill')}>Record bill</Button>
          <Button variant="primary" icon={I.Plus} onClick={() => setSheet('request')}>Purchase request</Button>
        </>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Stats items={[
          ...(showReq ? [{ label: 'Waiting for approval', value: String(reqs.filter((r) => r.status === 'Waiting').length), sub: inr(reqs.filter((r) => r.status === 'Waiting').reduce((a, r) => a + r.amt, 0)), tone: 'warn', icon: 'Hourglass', onClick: () => setTab('requests') }] : []),
          { label: 'Open orders', value: '2', sub: `${inr(29040)} ordered`, icon: 'ShoppingCart', onClick: () => setTab('orders') },
          { label: 'Bills unpaid', value: inr(unpaid), sub: `${bills.filter((b) => b.status !== 'Paid').length} bills`, tone: 'bad', icon: 'ReceiptText', onClick: () => setTab('bills') },
          { label: `Paid · ${per.label.toLowerCase()}`, value: inr(Math.round((286420 * Math.min(periodDays(per), 192)) / 192)), sub: fmtRange(per), icon: 'CircleCheck' },
        ]} />
        {role.id === 'accountant' && <Banner tone="info" title="View only." action={inMenu(role, 'finance') ? <Button size="sm" variant="secondary" icon={I.IndianRupee} className="shrink-0" onClick={() => go('finance', { page: 'expenses' })}>Open Expenses</Button> : null}>You see purchase orders, goods received and vendor bills that reach Finance. You pay the bills in Finance, Expenses.</Banner>}
        {canEdit && !canPay && <Banner tone="info" title="Bills are paid in Finance.">You record the vendor’s bill here. The Accountant pays it, and the payment shows on the bill.</Banner>}
        <Card className="overflow-hidden">
          <div className="px-3 pt-3"><Chips value={tab} onChange={setTab} options={[
            ...(showReq ? [{ value: 'requests', label: 'Requests', count: reqs.filter((r) => dIn(r.d)).length }] : []), { value: 'orders', label: 'Purchase orders', count: ORDERS.filter((o) => dIn(o.d)).length }, { value: 'grn', label: 'Goods received', count: GRNS.filter((g) => dIn(g.d)).length },
            { value: 'bills', label: 'Bills', count: bills.filter((b) => dIn(b.d)).length }, { value: 'vendors', label: 'Vendors', count: VENDORS.length },
          ]} /></div>
          <Toolbar className="border-t-0">
            <SearchBox id="pur-search" value={q} onChange={setQ} placeholder={tab === 'vendors' ? 'Vendor name, phone or GSTIN' : 'Number, vendor or item'} />
            {tab !== 'vendors' && <DatePeriod id="pur-per" value={per} onChange={setPer} className="w-full @md:w-auto" />}
            <ExportButton what={tab} />
          </Toolbar>
          {lists[tab]}
        </Card>
      </div>

      <RequestSheet open={sheet === 'request'} onClose={() => setSheet(null)} preset={[]} />
      <POSheet open={sheet === 'po'} onClose={() => setSheet(null)} req={cur} onDone={(id) => setReqs((x) => x.map((y) => (y.id === cur?.id ? { ...y, note: `${y.note} · ${id}` } : y)))} />
      <ReceiveSheet open={sheet === 'receive'} onClose={() => setSheet(null)} po={cur} />
      <PaySheet open={sheet === 'pay'} onClose={() => setSheet(null)} bill={cur} onPaid={(b, amt) => setBills((x) => x.map((y) => (y.id === b.id ? { ...y, paid: y.paid + amt, status: y.paid + amt >= y.amt ? 'Paid' : 'Part paid', fin: 'EXP/26/0447 · Day Book 9 Oct' } : y)))} />
      <BillSheet open={sheet === 'bill'} onClose={() => setSheet(null)} />
      <VendorSheet open={sheet === 'vendor'} onClose={() => setSheet(null)} onOpen={() => { setSheet(null); setTab('vendors'); setQ('Sri Sai'); }} />
      <CancelPaySheet open={sheet === 'cancel'} onClose={() => setSheet(null)} bill={cur} />
    </div>
  );
}

function POSheet({ open, onClose, req, onDone }) {
  const toast = useToast();
  const [vendor, setVendor] = useState(VENDORS[1].name);
  const [send, setSend] = useState('Email');
  useEffect(() => { if (open) { setVendor(req?.dept === 'Science' ? VENDORS[1].name : VENDORS[0].name); setSend('Email'); } }, [open, req]);
  if (!open || !req?.items) return null;
  return (
    <FormSheet open={open} onClose={onClose} title={`Purchase order from ${req.id}`} sub="Approved request. Choose the vendor and send the order." submitLabel={send === 'Email' ? 'Make PO and email it' : 'Make PO and print'}
      onSubmit={() => { onDone?.('PO-2026-0059'); toast({ title: 'PO-2026-0059 made', body: send === 'Email' ? `Emailed to ${vendor}.` : 'Sent to the office printer.' }); }}>
      <div className="rounded-xl border border-line p-3.5 text-[14px]"><p className="font-semibold">{req.items}</p><p className="text-[12.5px] text-ink3 mt-0.5">{req.note} · estimate {inr(req.amt)}</p></div>
      <Field label="Vendor" required id="po-v"><Select id="po-v" value={vendor} onChange={setVendor} options={VENDORS.map((v) => v.name)} /></Field>
      <Field label="Prices" hint="From the vendor’s last quotation. Change any line before sending.">
        <ul className="rounded-xl border border-line divide-y divide-line/70 text-[14px]">
          {req.items.split(', ').map((x) => <li key={x} className="flex justify-between px-3.5 py-2.5 gap-3"><span>{x}</span><span className="tnum text-ink2">as quoted</span></li>)}
        </ul>
      </Field>
      <Field label="Send by"><Segmented value={send} onChange={setSend} options={['Email', 'Print']} className="w-full" /></Field>
    </FormSheet>
  );
}

function ReceiveSheet({ open, onClose, po }) {
  const toast = useToast();
  const [loc, setLoc] = useState('Lab store');
  const [lines, setLines] = useState([]);
  const [why, setWhy] = useState('');
  useEffect(() => {
    if (!open || !po) return;
    if (po.id === 'PO-2026-0057') { setLines([{ k: 'Beaker 250 ml, borosilicate', ord: 60, got: 40, now: '20' }, { k: 'Test tube, 15 ml', ord: 100, got: 100, now: '0' }]); setLoc('Lab store'); }
    else { setLines([{ k: 'Answer booklet, 24 pages', ord: 3000, got: 0, now: '3000' }, { k: 'Exam pad, A4', ord: 200, got: 0, now: '200' }]); setLoc('Main store'); }
    setWhy('');
  }, [open, po]);
  if (!open || !po) return null;
  const over = lines.filter((l) => l.got + (Number(l.now) || 0) > l.ord);
  const total = lines.reduce((a, l) => a + (Number(l.now) || 0), 0);
  return (
    <FormSheet open={open} onClose={onClose} title={`Receive goods: ${po.id}`} sub={`${po.vendor} · part deliveries are fine`} submitLabel="Receive and add to stock" wide
      onSubmit={() => { if (!total) return false; if (over.length && !why.trim()) return false; toast({ title: `GRN-2026-0042 saved: ${n(total)} received`, body: `Stock in the ${loc.toLowerCase()} goes up now.` }); }}>
      <div className="rounded-xl border border-line overflow-hidden">
        <div className="grid grid-cols-[1fr_60px_70px_90px] gap-2 px-3 py-2 text-[12px] font-semibold text-ink3 bg-sunken/50 border-b border-line"><span>Item</span><span className="text-right">Ordered</span><span className="text-right">Earlier</span><span className="text-right">Arrived now</span></div>
        {lines.map((l, i) => {
          const bad = l.got + (Number(l.now) || 0) > l.ord;
          return (
            <div key={l.k} className={cx('grid grid-cols-[1fr_60px_70px_90px] gap-2 items-center px-3 py-2 border-b border-line/70 last:border-0', bad && 'bg-warn/[.06]')}>
              <span className="text-[13.5px] font-semibold min-w-0">{l.k}</span>
              <span className="text-right tnum text-[13.5px]">{n(l.ord)}</span>
              <span className="text-right tnum text-[13.5px] text-ink3">{n(l.got)}</span>
              <input value={l.now} inputMode="numeric" aria-label={`Arrived now: ${l.k}`} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, now: e.target.value.replace(/\D/g, '') } : x)))}
                className={cx('h-9 w-full rounded-lg border bg-surface px-2 text-right tnum text-[14px] outline-none focus:ring-4', bad ? 'border-warn focus:ring-warn/15' : 'border-line focus:border-brand focus:ring-brand/15')} />
            </div>
          );
        })}
      </div>
      {over.map((l) => <Banner key={l.k} tone="warn" title={`Ordered ${n(l.ord)}, receiving ${n(l.got + (Number(l.now) || 0))}.`}>Correct the number, or accept the extra with a reason below.</Banner>)}
      {over.length > 0 && <Field label="Reason for the extra" required id="rc-why" error={!why.trim() && 'A reason is needed to accept more than ordered'}><Input id="rc-why" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="For example: free replacements for breakage" error={!why.trim()} /></Field>}
      <Field label="Into location" required id="rc-loc"><Select id="rc-loc" value={loc} onChange={setLoc} options={LOCS} /></Field>
    </FormSheet>
  );
}

function PaySheet({ open, onClose, bill, onPaid }) {
  const toast = useToast();
  const [amt, setAmt] = useState('');
  const [mode, setMode] = useState('Bank transfer');
  const [ref, setRef] = useState('');
  const [tried, setTried] = useState(false);
  useEffect(() => { if (open && bill) { setAmt(String(bill.amt - bill.paid)); setMode('Bank transfer'); setRef(''); setTried(false); } }, [open, bill]);
  if (!open || !bill?.vendor) return null;
  const a = Number(amt) || 0; const left = bill.amt - bill.paid;
  const errA = !a ? 'Enter the amount' : a > left ? `Only ${inr(left)} is left on this bill` : '';
  const errR = mode !== 'Cash' && !ref.trim() ? (mode === 'Cheque' ? 'Enter the cheque number' : 'Enter the transaction (UTR) number') : '';
  return (
    <FormSheet open={open} onClose={onClose} title={`Pay ${bill.vendor}`} sub={`Bill ${bill.id} · ${inr(bill.amt)} · ${bill.paid ? `${inr(bill.paid)} paid earlier` : 'nothing paid yet'}`} submitLabel={`Pay ${inr(a)}`} busyLabel="Recording…"
      onSubmit={() => { setTried(true); if (errA || errR) return false; onPaid?.(bill, a); toast({ title: `${inr(a)} paid to ${bill.vendor}`, body: 'Shows in Finance: Expenses and the Day Book for 9 Oct.' }); }}>
      <Field label="Amount" required id="py-amt" error={tried && errA}>
        <div className="relative"><span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3 text-[17px] font-semibold">₹</span><Input id="py-amt" inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value.replace(/\D/g, ''))} className="pl-8 tnum !text-[17px] font-semibold" error={tried && !!errA} /></div>
      </Field>
      <Field label="Paid by" required><Segmented value={mode} onChange={setMode} options={['Bank transfer', 'Cheque', 'UPI', 'Cash']} className="w-full" size="sm" /></Field>
      {mode !== 'Cash' && <Field label={mode === 'Cheque' ? 'Cheque number and bank' : 'Transaction (UTR) number'} required id="py-ref" error={tried && errR}><Input id="py-ref" value={ref} onChange={(e) => setRef(e.target.value)} className="font-mono" placeholder={mode === 'Cheque' ? '004518, HDFC Kukatpally' : 'HDFCN26282911430'} error={tried && !!errR} /></Field>}
      <p className="text-[12.5px] text-ink3 flex gap-1.5"><I.Info size={14} className="shrink-0 mt-0.5" />Payments are never deleted. A wrong one is cancelled with a reason and the original is kept.</p>
    </FormSheet>
  );
}

function CancelPaySheet({ open, onClose, bill }) {
  const toast = useToast();
  const [why, setWhy] = useState('');
  useEffect(() => { if (open) setWhy(''); }, [open]);
  if (!open || !bill?.vendor) return null;
  return (
    <Sheet open={open} onClose={onClose} title={`Cancel the payment on ${bill.id}?`} sub={`${inr(bill.paid)} to ${bill.vendor}. The original payment stays in the records, marked Cancelled, and Finance gets a reversing entry.`}
      footer={<><Button variant="ghost" onClick={onClose}>Keep payment</Button><Button variant="danger" disabled={!why.trim()} onClick={() => { onClose(); toast({ title: `Payment on ${bill.id} cancelled`, body: 'Original kept. Reversal posted in the Day Book.' }); }}>Cancel {inr(bill.paid)} payment</Button></>}>
      <Field label="Reason" required id="cp-why"><Textarea id="cp-why" value={why} onChange={setWhy} rows={2} placeholder="For example: cheque bounced" /></Field>
    </Sheet>
  );
}

function BillSheet({ open, onClose }) {
  const toast = useToast();
  const [v, setV] = useState(VENDORS[0].name);
  const [no, setNo] = useState('');
  const [amt, setAmt] = useState('');
  const [tried, setTried] = useState(false);
  useEffect(() => { if (open) { setV('Hyderabad Sports House'); setNo(''); setAmt(''); setTried(false); } }, [open]);
  const dup = BILLS.find((b) => b.vendor === v && b.id.toLowerCase() === no.trim().toLowerCase());
  return (
    <FormSheet open={open} onClose={onClose} title="Record vendor bill" sub="Against a purchase order. It goes to Finance as an expense." submitLabel="Save bill"
      onSubmit={() => { setTried(true); if (!no.trim() || !Number(amt) || dup) return false; toast({ title: `Bill ${no.trim()} saved`, body: `${inr(Number(amt))} from ${v}. Added to Finance, Expenses.` }); }}>
      <Field label="Vendor" required id="bl-v"><Select id="bl-v" value={v} onChange={setV} options={VENDORS.map((x) => x.name)} /></Field>
      <Field label="Purchase order" id="bl-po"><Select id="bl-po" value="" onChange={() => {}} options={[{ value: '', label: ORDERS.find((o) => o.vendor === v)?.id || 'No open order' }]} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Bill number" required id="bl-no" error={(tried && !no.trim() && 'Enter the bill number') || (dup && 'Bill already recorded')}><Input id="bl-no" value={no} onChange={(e) => setNo(e.target.value)} className="font-mono" placeholder="HSH/26-27/0471" error={(tried && !no.trim()) || !!dup} /></Field>
        <Field label="Amount with GST" required id="bl-amt" error={tried && !Number(amt) && 'Enter the amount'}><Input id="bl-amt" inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value.replace(/\D/g, ''))} className="tnum" placeholder="₹" error={tried && !Number(amt)} /></Field>
      </div>
      {dup && <Alert tone="warn" title="Bill already recorded:" act="Open existing" onAct={() => { onClose(); toast({ title: `Opening ${dup.id}`, body: `${inr(dup.amt)} · ${dup.status}`, tone: 'info' }); }}>{dup.id} from {dup.vendor}, {dup.d}.</Alert>}
      <Field label="Bill photo" hint="Optional. Take a photo or choose a PDF."><Button type="button" variant="secondary" icon={I.Camera} className="self-start" onClick={() => toast({ title: 'Camera opened', body: 'Hold the bill flat in good light.', tone: 'info' })}>Add photo</Button></Field>
    </FormSheet>
  );
}

function VendorSheet({ open, onClose, onOpen }) {
  const toast = useToast();
  const [f, setF] = useState({ name: '', phone: '', gst: '', email: '', items: '' });
  const [tried, setTried] = useState(false);
  useEffect(() => { if (open) { setF({ name: '', phone: '', gst: '', email: '', items: '' }); setTried(false); } }, [open]);
  const digits = f.phone.replace(/\D/g, '');
  const dup = VENDORS.find((v) => (f.gst.trim() && v.gst.toLowerCase() === f.gst.trim().toLowerCase()) || (digits.length === 10 && v.phone.replace(/\D/g, '') === digits));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <FormSheet open={open} onClose={onClose} title="Add vendor" sub="Shared with Finance. Try GSTIN 36AAKFS4821K1Z5 to see the duplicate check." submitLabel="Add vendor"
      onSubmit={() => { setTried(true); if (!f.name.trim() || digits.length !== 10 || dup) return false; toast({ title: `${f.name.trim()} added`, body: 'Now in the vendor list for Inventory and Finance.' }); }}>
      {dup && <Alert tone="warn" title={`A vendor with this ${f.gst.trim() && dup.gst.toLowerCase() === f.gst.trim().toLowerCase() ? 'GSTIN' : 'phone number'} already exists: ${dup.name}.`} act="Open existing" onAct={onOpen} />}
      <Field label="Vendor name" required id="vd-name" error={tried && !f.name.trim() && 'Enter the vendor name'}><Input id="vd-name" value={f.name} onChange={set('name')} placeholder="Business name as on the bill" error={tried && !f.name.trim()} /></Field>
      <div className="grid @sm:grid-cols-2 gap-3">
        <Field label="Phone" required id="vd-phone" error={tried && digits.length !== 10 && 'Enter a 10-digit mobile number'}>
          <div className="relative"><span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3 text-[15px]">+91</span><Input id="vd-phone" inputMode="numeric" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/[^\d ]/g, '').slice(0, 11) })} className="pl-12 tnum" placeholder="98490 44120" error={tried && digits.length !== 10} /></div>
        </Field>
        <Field label="GSTIN" id="vd-gst" hint="15 characters"><Input id="vd-gst" value={f.gst} onChange={(e) => setF({ ...f, gst: e.target.value.toUpperCase().slice(0, 15) })} className="font-mono" placeholder="36AAAAA0000A1Z5" /></Field>
      </div>
      <Field label="Email" id="vd-email"><Input id="vd-email" type="email" value={f.email} onChange={set('email')} placeholder="For sending purchase orders" /></Field>
      <Field label="Items supplied" id="vd-items"><Input id="vd-items" value={f.items} onChange={set('items')} placeholder="For example: stationery, printing" /></Field>
      <p className="text-[12.5px] text-ink3">Bank details are added by the Accountant before the first payment.</p>
    </FormSheet>
  );
}

/* ======================= Assets ======================= */
const AssetsRoute = ({ params }) => (params?.id ? <AssetDetail tag={params.id} /> : <AssetsPage />);

function AssetsPage() {
  const { go } = useNav();
  const canEdit = useCanEdit();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [sheet, setSheet] = useState(null);
  const t = q.trim().toLowerCase();
  const rows = ASSETS.filter((a) => (type === 'all' || a.type === type) && (!t || (a.tag + a.name + a.loc).toLowerCase().includes(t)));
  const cnt = (k) => ({ Furniture: 1124, IT: 214, Lab: 286, Sports: 96, Vehicles: 9, Other: 113 }[k]);
  return (
    <div>
      <ModuleHead sub="1,842 assets with tags in 64 rooms · warranty and AMC reminders 30 days before the end date"
        actions={<>
          <Button variant="secondary" icon={I.Upload} className="hidden @md:inline-flex" onClick={() => setSheet('import')}>Import</Button>
          <Button variant="secondary" icon={I.ScanLine} onClick={() => setSheet('audit')}>Asset audit</Button>
          <Button variant="primary" icon={I.Plus} onClick={() => setSheet('add')}>Add asset</Button>
        </>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Stats items={[
          { label: 'Assets', value: '1,842', sub: 'In use 1,791 · disposed 45', icon: 'Package' },
          { label: 'Value now', value: '₹48.6 L', sub: 'Bought for ₹92.4 L', icon: 'IndianRupee' },
          { label: 'In repair', value: '6', sub: 'Projector, fan and 4 more', tone: 'warn', icon: 'Wrench' },
          { label: 'Warranty or AMC ending', value: String(ENDING.length), sub: 'In the next 30 days', tone: 'bad', icon: 'CalendarClock' },
        ]} />
        <Card>
          <CardHead title="Warranty and AMC ending soon" sub="Renew or plan a replacement before the date" icon={I.CalendarClock} />
          <ul className="px-2 pb-2">
            {ENDING.map((a) => (
              <li key={a.tag}><Row icon={assetIcon(a.type)} iconTone="warn" title={a.name} sub={`${a.tag} · ${a.loc} · ${a.amc ? `AMC with ${a.vendor}` : 'Warranty'}`} onClick={() => go('inventory', { page: 'assets', id: a.tag })}
                right={<span className="text-[13px] font-semibold text-warn tnum">{a.amc ? `AMC ends ${a.amc.replace(' 2026', '')}` : `Warranty ends ${a.warranty.replace(' 2026', '')}`}</span>} /></li>
            ))}
          </ul>
        </Card>
        <Card className="overflow-hidden">
          <Toolbar>
            <SearchBox id="as-search" value={q} onChange={setQ} placeholder="Asset tag, name or room" />
            <ExportButton what="asset register" />
          </Toolbar>
          <div className="px-3 pt-3 pb-1"><Chips value={type} onChange={setType} options={[{ value: 'all', label: 'All', count: 1842 }, ...ASSET_TYPES.map((k) => ({ value: k, label: k, count: cnt(k) }))]} /></div>
          <DataList rows={rows} rowKey={(a) => a.tag} minWidth={920} onRow={(a) => go('inventory', { page: 'assets', id: a.tag })}
            footer={`Showing ${rows.length} of ${type === 'all' ? '1,842' : n(cnt(type))} assets`}
            columns={[
              { key: 'tag', label: 'Asset', render: (a) => <div className="flex items-center gap-3"><span className={cx('w-9 h-9 rounded-lg grid place-items-center shrink-0', TONE_SOFT.neutral)}><Icon name={assetIcon(a.type)} size={17} /></span><div className="min-w-0"><p className="font-semibold leading-tight">{a.name}</p><p className="text-[12px] text-ink3 font-mono">{a.tag}</p></div></div> },
              { key: 'type', label: 'Type', nowrap: true },
              { key: 'loc', label: 'Location or person', render: (a) => <span className="text-[13.5px]">{a.loc}</span> },
              { key: 'bought', label: 'Bought', nowrap: true, render: (a) => <div><p className="tnum text-[13px]">{a.bought}</p><p className="text-[12px] text-ink3 tnum">{inr(a.cost)}</p></div> },
              { key: 'end', label: 'Warranty / AMC', nowrap: true, render: (a) => { const d = a.amc || a.warranty; const soon = ENDING.includes(a); return d ? <span className={cx('text-[13px] tnum', soon && 'text-warn font-semibold')}>{a.amc ? 'AMC ' : ''}{d}</span> : <span className="text-ink3">—</span>; } },
              { key: 'cond', label: 'Condition', render: (a) => <Pill tone={COND_TONE[a.cond]}>{a.cond}</Pill> },
              { key: 'st', label: 'Status', render: (a) => <Pill tone={ASSET_TONE[a.status]} dot={a.status === 'In repair'}>{a.status}</Pill> },
            ]}
            mobile={(a) => ({ title: a.name, sub: `${a.tag} · ${a.loc}`, icon: assetIcon(a.type), iconTone: a.status === 'In repair' ? 'warn' : 'neutral', pills: [<Pill key="s" tone={ASSET_TONE[a.status]} className="!h-[22px] !text-[11.5px]">{a.status}</Pill>, ENDING.includes(a) && <Pill key="e" tone="warn" className="!h-[22px] !text-[11.5px]">{a.amc ? 'AMC' : 'Warranty'} ends soon</Pill>].filter(Boolean) })} />
        </Card>
      </div>
      <AddAssetSheet open={sheet === 'add'} onClose={() => setSheet(null)} />
      <ImportSheet open={sheet === 'import'} onClose={() => setSheet(null)} what="assets" />
      <AssetAuditSheet open={sheet === 'audit'} onClose={() => setSheet(null)} />
    </div>
  );
}

function AddAssetSheet({ open, onClose }) {
  const toast = useToast();
  const blank = { name: '', type: '', tag: 'AT-0731', loc: '', date: '', cost: '', end: '', vendor: '' };
  const [f, setF] = useState(blank);
  const [tried, setTried] = useState(false);
  useEffect(() => { if (open) { setF(blank); setTried(false); } }, [open]);
  const dup = ASSETS.find((a) => a.tag.toLowerCase() === f.tag.trim().toLowerCase());
  const err = { name: !f.name.trim() && 'Enter the asset name', type: !f.type && 'Choose a type', tag: !f.tag.trim() ? 'Enter an asset tag' : dup ? `Tag ${dup.tag} belongs to ${dup.name.split(',')[0]}, ${dup.loc.split(' · ')[0]}. Use AT-0731.` : '', loc: !f.loc && 'Choose a room, department or person' };
  const set = (k) => (v) => setF({ ...f, [k]: v && v.target ? v.target.value : v });
  return (
    <FormSheet open={open} onClose={onClose} title="Add asset" sub="Or add it from a goods receipt, where the price and date fill in." submitLabel="Add asset"
      onSubmit={() => { setTried(true); if (Object.values(err).some(Boolean)) return false; toast({ title: `${f.name.trim()} added as ${f.tag.toUpperCase()}`, body: f.end ? `Reminder set 30 days before ${f.end}.` : 'Print the tag from the asset page.' }); }}>
      <Field label="Asset name" required id="aa-name" error={tried && err.name}><Input id="aa-name" value={f.name} onChange={set('name')} placeholder="For example: Projector, Epson EB-X51" error={tried && !!err.name} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type" required id="aa-type" error={tried && err.type}><Select id="aa-type" value={f.type} onChange={set('type')} error={tried && !!err.type} options={[{ value: '', label: 'Choose' }, ...ASSET_TYPES]} /></Field>
        <Field label="Asset tag" required id="aa-tag" error={(tried || dup) && err.tag}><Input id="aa-tag" value={f.tag} onChange={set('tag')} className="font-mono uppercase" error={(tried || !!dup) && !!err.tag} /></Field>
      </div>
      <Field label="Location or person" required id="aa-loc" error={tried && err.loc}><Select id="aa-loc" value={f.loc} onChange={set('loc')} error={tried && !!err.loc} options={[{ value: '', label: 'Choose' }, ...FACILITIES.map((x) => x.name), 'Office · Anita Sharma', 'Principal’s office']} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Purchase date" id="aa-date" hint="DD-MM-YYYY"><Input id="aa-date" value={f.date} onChange={set('date')} placeholder="09-10-2026" /></Field>
        <Field label="Cost" id="aa-cost"><Input id="aa-cost" inputMode="numeric" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value.replace(/\D/g, '') })} className="tnum" placeholder="₹" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Warranty or AMC end" id="aa-end" hint="Needed for reminders"><Input id="aa-end" value={f.end} onChange={set('end')} placeholder="DD-MM-YYYY" /></Field>
        <Field label="Vendor" id="aa-vendor"><Select id="aa-vendor" value={f.vendor} onChange={set('vendor')} options={[{ value: '', label: 'Choose' }, ...VENDORS.map((v) => v.name)]} /></Field>
      </div>
    </FormSheet>
  );
}

function AssetAuditSheet({ open, onClose }) {
  const toast = useToast();
  const [room, setRoom] = useState('Computer lab 1');
  const [scanned, setScanned] = useState(28);
  useEffect(() => { if (open) { setRoom('Computer lab 1'); setScanned(28); } }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title="Asset audit" sub="Scan each tag in the room. Missing and misplaced assets are listed for you." wide
      footer={<><Button variant="ghost" onClick={onClose}>Finish later</Button><Button variant="primary" icon={I.Check} onClick={() => { onClose(); toast({ title: `Audit of ${room} saved`, body: '1 missing and 1 misplaced asset sent to Anita Sharma for review.' }); }}>Save audit</Button></>}>
      <div className="flex flex-col gap-4">
        <Field label="Room" id="aa-room"><Select id="aa-room" value={room} onChange={setRoom} options={FACILITIES.map((x) => x.name)} /></Field>
        <div className="rounded-2xl bg-sunken/70 p-4 flex items-center gap-4">
          <span className="w-12 h-12 rounded-xl bg-brand/10 text-brand grid place-items-center shrink-0"><I.ScanLine size={24} /></span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[15px] tnum">{scanned} of 30 scanned</p>
            <Progress value={(scanned / 30) * 100} className="mt-2" />
          </div>
          <Button variant="secondary" icon={I.ScanLine} onClick={() => { setScanned((s) => Math.min(30, s + 1)); toast({ title: scanned < 30 ? `AT-01${String(20 + scanned).padStart(2, '0')} scanned` : 'All tags in this room scanned', tone: 'info' }); }}>Scan next</Button>
        </div>
        <ul className="rounded-xl border border-line divide-y divide-line/70">
          <li className="flex items-center gap-3 px-3.5 py-3"><span className={cx('w-9 h-9 rounded-lg grid place-items-center', TONE_SOFT.bad)}><I.CircleX size={17} /></span><div className="flex-1 min-w-0"><p className="font-semibold text-[14px]">AT-0119 · Keyboard, Dell KB216</p><p className="text-[12.5px] text-ink3">Missing: should be in Computer lab 1</p></div><Pill tone="bad">Missing</Pill></li>
          <li className="flex items-center gap-3 px-3.5 py-3"><span className={cx('w-9 h-9 rounded-lg grid place-items-center', TONE_SOFT.warn)}><I.MapPin size={17} /></span><div className="flex-1 min-w-0"><p className="font-semibold text-[14px]">AT-0388 · Dual desk-bench</p><p className="text-[12.5px] text-ink3">Misplaced: registered in Room 7 B, found here</p></div><Pill tone="warn">Misplaced</Pill></li>
        </ul>
      </div>
    </Sheet>
  );
}

function AssetDetail({ tag }) {
  const { go } = useNav();
  const toast = useToast();
  const canEdit = useCanEdit();
  const a = ASSETS.find((x) => x.tag === tag) || ASSETS[0];
  const [sheet, setSheet] = useState(null);
  const [status, setStatus] = useState(a.status);
  const [loc, setLoc] = useState(a.loc);
  const yrs = yearsSince(a.bought);
  const dep = Array.from({ length: Math.min(yrs + 1, 5) }, (_, i) => { const y = Number(a.bought.split(' ').pop()) + i; const v = Math.max(a.cost * 0.05, a.cost * (1 - (a.rate / 100) * (i + 1))); return { y: `${y}–${String(y + 1).slice(2)}`, open: Math.round(i === 0 ? a.cost : Math.max(a.cost * 0.05, a.cost * (1 - (a.rate / 100) * i))), close: Math.round(v) }; });
  const repairs = a.tag === 'AT-0042'
    ? [{ d: '7 Oct 2026', p: 'No signal, HDMI port loose', v: 'Sri Venkateswara Systems', c: 'Quote ₹2,800', s: 'In progress' }, { d: '14 Feb 2025', p: 'Lamp replaced', v: 'Sri Venkateswara Systems', c: inr(6400), s: 'Done' }]
    : a.tag === 'AT-0215' ? [{ d: '9 Oct 2026', p: 'Fan not working, burning smell from regulator', v: 'Shankar (electrician)', c: '—', s: 'Open' }]
      : [{ d: '12 Mar 2026', p: 'Yearly service', v: a.vendor, c: inr(1200), s: 'Done' }];
  const history = [
    { icon: 'MapPin', tone: 'brand', what: `In ${loc}`, when: 'Since 1 Jun 2026 · assigned by Ramu Yadav', on: '1 Jun 2026', now: true },
    ...(a.type === 'IT' ? [{ icon: 'ArrowRightLeft', what: 'Moved from Room 9 B', when: '31 May 2026 · approved by Anita Sharma', on: '31 May 2026' }] : []),
    { icon: 'PackageCheck', what: `Received from ${a.vendor} and tagged ${a.tag}`, when: a.bought, on: a.bought },
  ];
  // Repair log and history open on everything since the asset was bought; any DatePeriod narrows them
  const [per, setPer] = useState(() => ({ key: 'custom', label: 'Since bought', from: isoOf(a.bought), to: '2026-10-09' }));
  const repairsIn = repairs.filter((r) => inPer(per, r.d));
  const historyIn = history.filter((h) => h.now || inPer(per, h.on));
  const end = a.amc || a.warranty;
  return (
    <div>
      <Back onClick={() => go('inventory', { page: 'assets' })} label="Assets" sub={a.type} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Card className="p-4 @md:p-5 flex flex-col @lg:flex-row @lg:items-center gap-4">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <span className={cx('w-14 h-14 rounded-2xl grid place-items-center shrink-0', TONE_SOFT.brand)}><Icon name={assetIcon(a.type)} size={26} /></span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap"><h1 className="font-display text-[22px] @md:text-[26px] font-semibold tracking-tight leading-tight">{a.name}</h1><Pill tone={ASSET_TONE[status]} dot>{status}</Pill></div>
              <p className="text-[13.5px] text-ink3 mt-0.5"><span className="font-mono text-[12.5px]">{a.tag}</span> · {a.type} · {loc}</p>
            </div>
          </div>
          {canEdit && status !== 'Disposed' && (
            <div className="flex gap-2 flex-wrap">
              <Button variant="primary" icon={I.ArrowRightLeft} onClick={() => setSheet('move')}>Assign or transfer</Button>
              <Button variant="secondary" icon={I.Wrench} onClick={() => setSheet('repair')}>Log repair</Button>
              <MoreMenu items={[
                ['QrCode', 'Print asset tag', () => toast({ title: `Tag ${a.tag} sent to the label printer`, body: 'QR tag, 50 × 25 mm' })],
                ['Link', 'Link stock items', () => toast({ title: 'Pick spare parts to link', body: 'For example toner or a spare charger.', tone: 'info' })],
                ['Trash2', 'Dispose with approval', () => setSheet('dispose'), 'bad'],
              ]} />
            </div>
          )}
        </Card>
        {a.disposed && <Banner tone="info" title="Disposed.">{a.disposed}. Kept in the register for the record.</Banner>}
        <Stats items={[
          { label: 'Bought for', value: inr(a.cost), sub: a.bought, icon: 'ReceiptText' },
          { label: 'Value now', value: inr(valueNow(a)), sub: `Straight line, ${a.rate}% a year`, icon: 'TrendingDown' },
          { label: a.amc ? 'AMC ends' : 'Warranty ends', value: end || 'None', sub: end ? (ENDING.includes(a) ? 'Within 30 days' : a.warranty === '13 Jun 2026' ? 'Ended' : 'Reminder 30 days before') : 'No warranty on record', tone: ENDING.includes(a) ? 'warn' : undefined, icon: 'CalendarClock' },
          { label: 'Condition', value: a.cond, sub: `${repairs.length} repair${repairs.length > 1 ? 's' : ''} on record`, tone: COND_TONE[a.cond] === 'neutral' ? undefined : COND_TONE[a.cond], icon: 'Gauge' },
        ]} />
        <div className="flex flex-col @md:flex-row @md:items-center gap-2.5">
          <DatePeriod id="as-per" value={per} onChange={setPer} className="w-full @md:w-auto" />
          <p className="text-[12.5px] text-ink3">Repair log and history between {fmtRange(per)}</p>
        </div>
        <Split>
          <Col>
            <Card>
              <CardHead title="Maintenance and repair log" action={canEdit && status !== 'Disposed' && <Button size="sm" variant="soft" icon={I.Plus} onClick={() => setSheet('repair')}>Log repair</Button>} />
              {repairsIn.length === 0 && <p className="px-5 pb-5 text-[13.5px] text-ink3">No repairs between {fmtRange(per)}.</p>}
              <ul className="px-2 pb-2">
                {repairsIn.map((r) => (
                  <li key={r.d}><Row icon="Wrench" iconTone={MR_TONE[r.s] || 'neutral'} title={r.p} sub={`${r.d} · ${r.v} · ${r.c}`} right={<Pill tone={MR_TONE[r.s]}>{r.s}</Pill>} /></li>
                ))}
              </ul>
            </Card>
            <Card className="overflow-hidden">
              <CardHead title="Depreciation" sub={`Straight line at ${a.rate}% a year, as set in Inventory Settings`} />
              <div className="overflow-x-auto scroll-thin">
                <table className="w-full text-[14px] min-w-[420px]">
                  <thead><tr className="text-[12px] text-ink3 text-left border-y border-line"><th className="px-5 py-2.5 font-semibold">Financial year</th><th className="px-3 py-2.5 font-semibold text-right">Opening value</th><th className="px-3 py-2.5 font-semibold text-right">Depreciation</th><th className="px-5 py-2.5 font-semibold text-right">Closing value</th></tr></thead>
                  <tbody>{dep.map((d) => <tr key={d.y} className="border-b border-line/70 last:border-0"><td className="px-5 py-2.5 tnum">{d.y}</td><td className="px-3 py-2.5 text-right tnum">{inr(d.open)}</td><td className="px-3 py-2.5 text-right tnum text-ink2">{inr(d.open - d.close)}</td><td className="px-5 py-2.5 text-right tnum font-semibold">{inr(d.close)}</td></tr>)}</tbody>
                </table>
              </div>
            </Card>
          </Col>
          <Col>
            <Card>
              <CardHead title="Details" />
              <DL cols={1} rows={[['Location or person', loc], ['Vendor', a.vendor], ['Bought', `${a.bought} · ${inr(a.cost)}`], [a.amc ? 'AMC' : 'Warranty', end ? `Ends ${end}` : 'None on record']]} />
            </Card>
            <Card>
              <CardHead title="Asset tag" sub="Scan it during an asset audit" />
              <div className="px-5 pb-5 flex items-center gap-4">
                <FakeQR size={92} />
                <div className="min-w-0"><p className="font-mono font-semibold text-[15px]">{a.tag}</p><p className="text-[12.5px] text-ink3">{a.name.split(',')[0]}</p><p className="text-[12.5px] text-ink3">Sunrise Public School</p></div>
              </div>
            </Card>
            {a.tag === 'AT-0451' && (
              <Card>
                <CardHead title="Linked stock items" />
                <div className="px-2 pb-2"><Row icon="Cable" title="Printer toner, HP 76A" sub="CS-0003 · 2 in the main store" onClick={() => go('inventory', { page: 'items', id: 'CS-0003' })} right={<I.ChevronRight size={18} className="text-ink3" />} /></div>
              </Card>
            )}
            <Card>
              <CardHead title="History" />
              <div className="px-5 pb-1"><Timeline items={historyIn} /></div>
            </Card>
          </Col>
        </Split>
      </div>
      <AssignSheet open={sheet === 'move'} onClose={() => setSheet(null)} asset={a} onDone={setLoc} />
      <RepairSheet open={sheet === 'repair'} onClose={() => setSheet(null)} asset={a} onDone={() => setStatus('In repair')} />
      <DisposeSheet open={sheet === 'dispose'} onClose={() => setSheet(null)} asset={a} />
    </div>
  );
}

function AssignSheet({ open, onClose, asset, onDone }) {
  const toast = useToast();
  const [kind, setKind] = useState('Room');
  const [to, setTo] = useState('');
  useEffect(() => { if (open) { setKind('Room'); setTo(''); } }, [open]);
  const opts = kind === 'Room' ? FACILITIES.map((x) => x.name) : kind === 'Department' ? DEPTS : STAFF.map((s) => s.name);
  return (
    <FormSheet open={open} onClose={onClose} title={`Assign or transfer ${asset.tag}`} sub={`Now in ${asset.loc}. The history is kept.`} submitLabel="Transfer"
      onSubmit={() => { if (!to) return false; onDone(kind === 'Person' ? `${to} (person)` : to); toast({ title: `${asset.tag} moved to ${to}`, body: asset.cost > 25000 ? 'Above ₹25,000: sent to Lakshmi Rao for approval first.' : 'Saved in the asset history.' }); }}>
      <Field label="Assign to" required><Segmented value={kind} onChange={(v) => { setKind(v); setTo(''); }} options={['Room', 'Department', 'Person']} className="w-full" /></Field>
      <Field label={kind} required id="as-to" error={!to && 'Choose where it goes'}><Select id="as-to" value={to} onChange={setTo} options={[{ value: '', label: 'Choose' }, ...opts]} error={!to} /></Field>
    </FormSheet>
  );
}

function RepairSheet({ open, onClose, asset, onDone }) {
  const toast = useToast();
  const [p, setP] = useState('');
  const [v, setV] = useState(asset.vendor);
  const [cost, setCost] = useState('');
  const [st, setSt] = useState('In progress');
  useEffect(() => { if (open) { setP(''); setV(asset.vendor); setCost(''); setSt('In progress'); } }, [open, asset]);
  return (
    <FormSheet open={open} onClose={onClose} title={`Log repair: ${asset.tag}`} sub={asset.name} submitLabel="Save repair"
      onSubmit={() => { if (!p.trim()) return false; if (st !== 'Done') onDone(); toast({ title: `Repair logged for ${asset.tag}`, body: st === 'Done' && cost ? `${inr(Number(cost))} goes to Finance as a maintenance expense.` : 'Status set to In repair.' }); }}>
      <Field label="Problem" required id="rp-p" error={!p.trim() && 'Describe the problem'}><Textarea id="rp-p" value={p} onChange={setP} rows={2} placeholder="What is wrong?" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Vendor or technician" id="rp-v"><Select id="rp-v" value={v} onChange={setV} options={[...new Set([asset.vendor, ...TECHS])]} /></Field>
        <Field label="Cost" id="rp-c"><Input id="rp-c" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value.replace(/\D/g, ''))} className="tnum" placeholder="₹" /></Field>
      </div>
      <Field label="Status"><Segmented value={st} onChange={setSt} options={['Open', 'In progress', 'Done']} className="w-full" /></Field>
    </FormSheet>
  );
}

function DisposeSheet({ open, onClose, asset }) {
  const toast = useToast();
  const [how, setHow] = useState('Scrapped');
  const [why, setWhy] = useState('');
  const [amt, setAmt] = useState('');
  useEffect(() => { if (open) { setHow('Scrapped'); setWhy(''); setAmt(''); } }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title={`Dispose of ${asset.name.split(',')[0]} ${asset.tag}?`} sub="Needs approval. The asset stays in the register as Disposed."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="danger" disabled={!why.trim()} onClick={() => { onClose(); toast({ title: `Disposal of ${asset.tag} sent for approval`, body: `Lakshmi Rao decides.${how === 'Sold' && amt ? ` ${inr(Number(amt))} goes to Finance as income once approved.` : ''}` }); }}>Send disposal for approval</Button></>}>
      <div className="flex flex-col gap-4">
        <Field label="How"><Segmented value={how} onChange={setHow} options={['Scrapped', 'Sold', 'Donated']} className="w-full" /></Field>
        {how === 'Sold' && <Field label="Sale amount" id="ds-amt"><Input id="ds-amt" inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value.replace(/\D/g, ''))} className="tnum" placeholder="₹" /></Field>}
        <Field label="Reason" required id="ds-why"><Textarea id="ds-why" value={why} onChange={setWhy} rows={2} placeholder="For example: beyond repair, vendor report attached" /></Field>
        <p className="text-[13px] text-ink3">Value now {inr(valueNow(asset))}. Bought for {inr(asset.cost)} on {asset.bought}.</p>
      </div>
    </Sheet>
  );
}

/* ======================= Rooms, Labs & Maintenance ======================= */
function RoomsPage() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const [view, setView] = useState('requests');
  const [list, setList] = useState(MREQ);
  const [f, setF] = useState('open');
  const [q, setQ] = useState('');
  const [sheet, setSheet] = useState(null);
  const [cur, setCur] = useState(null);
  const [per, setPer] = useState(PERIODS.thismonth);
  const t = q.trim().toLowerCase();
  const inP = list.filter((r) => inPer(per, r.when));
  const rows = inP.filter((r) => (f === 'all' || (f === 'open' ? r.status !== 'Done' : r.status === 'Done')) && (!t || (r.what + r.place + r.by + r.id).toLowerCase().includes(t)));
  // Older requests are only examples: the totals grow with the length of the period
  const days = periodDays(per);
  const cost = inP.filter((r) => r.cost).reduce((a, r) => a + r.cost, 0) + Math.round(days * 780);
  return (
    <div>
      <ModuleHead sub="64 rooms, 4 labs, 2 halls and 2 grounds · any staff member can raise a request from their phone"
        actions={<>
          <Button variant="secondary" icon={I.Plus} className="hidden @md:inline-flex" onClick={() => setSheet('room')}>Add room</Button>
          <Button variant="primary" icon={I.Wrench} onClick={() => setSheet('raise')}>Raise maintenance request</Button>
        </>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Segmented value={view} onChange={setView} className="self-start" options={[{ value: 'requests', label: 'Maintenance', icon: I.Wrench }, { value: 'rooms', label: 'Facility register', icon: I.Building2 }, { value: 'labs', label: 'Labs', icon: I.FlaskConical }]} />
        {view === 'requests' && (
          <>
            <Stats items={[
              { label: 'Open', value: String(list.filter((r) => r.status === 'Open').length), sub: '1 high priority, no technician', tone: 'bad', icon: 'CircleAlert', onClick: () => setF('open') },
              { label: 'In progress', value: String(list.filter((r) => r.status === 'In progress').length), sub: 'With a technician', tone: 'warn', icon: 'Wrench', onClick: () => setF('open') },
              { label: `Done · ${per.label.toLowerCase()}`, value: String(inP.filter((r) => r.status === 'Done').length + Math.round(days * 0.75)), sub: 'Average 2.1 days', tone: 'ok', icon: 'CircleCheck', onClick: () => setF('done') },
              { label: `Cost · ${per.label.toLowerCase()}`, value: inr(cost), sub: `${fmtRange(per)} · sent to Finance`, icon: 'IndianRupee' },
            ]} />
            <Card className="overflow-hidden">
              <Toolbar>
                <SearchBox id="mr-search" value={q} onChange={setQ} placeholder="Problem, place or person" />
                <DatePeriod id="mr-per" value={per} onChange={setPer} className="w-full @md:w-auto" />
                <ExportButton what="maintenance requests" />
              </Toolbar>
              <div className="px-3 pt-3"><Segmented value={f} onChange={setF} size="sm" options={[{ value: 'open', label: 'Open' }, { value: 'done', label: 'Done' }, { value: 'all', label: 'All' }]} /></div>
              <DataList rows={rows} rowKey={(r) => r.id} minWidth={860} onRow={(r) => setCur(r)} footer={`${rows.length} request${rows.length === 1 ? '' : 's'} · ${per.label.toLowerCase()} · ${fmtRange(per)}`}
                empty={<Empty icon={I.CalendarX} title="No requests in these dates" body={`No ${f === 'all' ? '' : f === 'open' ? 'open ' : 'finished '}maintenance requests between ${fmtRange(per)}. Pick a longer period.`} />}
                columns={[
                  { key: 'what', label: 'Request', render: (r) => <div className="max-w-[320px]"><p className="font-semibold leading-tight flex items-center gap-1.5">{r.what}{r.photo && <I.Camera size={14} className="text-ink3 shrink-0" />}</p><p className="text-[12px] text-ink3"><span className="font-mono">{r.id}</span> · {r.by} · {r.when}</p></div> },
                  { key: 'place', label: 'Place', render: (r) => <div><p className="text-[13.5px]">{r.place}</p>{r.asset && <p className="text-[12px] text-ink3 font-mono">{r.asset.split(' · ')[0]}</p>}</div> },
                  { key: 'pri', label: 'Priority', render: (r) => <Pill tone={PRI_TONE[r.pri]} dot={r.pri === 'High' || r.pri === 'Urgent'}>{r.pri}</Pill> },
                  { key: 'tech', label: 'Technician', render: (r) => (r.tech ? <span className="text-[13.5px]">{r.tech}</span> : <span className="text-bad text-[13px] font-semibold">Not assigned</span>) },
                  { key: 'st', label: 'Status', render: (r) => <div><Pill tone={MR_TONE[r.status]}>{r.status}</Pill>{r.done && <p className="text-[11.5px] text-ink3 mt-1 tnum">{r.done} · {inr(r.cost)}</p>}</div> },
                ]}
                mobile={(r) => ({ title: r.what, sub: `${r.place} · ${r.by}`, icon: 'Wrench', iconTone: MR_TONE[r.status], pills: [<Pill key="s" tone={MR_TONE[r.status]} className="!h-[22px] !text-[11.5px]">{r.status}</Pill>, <Pill key="p" tone={PRI_TONE[r.pri]} className="!h-[22px] !text-[11.5px]">{r.pri}</Pill>, !r.tech && <Pill key="t" tone="bad" className="!h-[22px] !text-[11.5px]">No technician</Pill>].filter(Boolean) })} />
            </Card>
          </>
        )}
        {view === 'rooms' && (
          <div className="grid @md:grid-cols-2 @xl:grid-cols-3 gap-4">
            {FACILITIES.map((r) => (
              <Card key={r.name} className="p-4 flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <span className={cx('w-10 h-10 rounded-xl grid place-items-center shrink-0', TONE_SOFT.brand)}><Icon name={FAC_ICON[r.kind]} size={19} /></span>
                  <div className="min-w-0 flex-1"><p className="font-semibold text-[15px] leading-tight">{r.name}</p><p className="text-[12.5px] text-ink3">{r.kind} · {r.where}</p></div>
                  {r.open ? <Pill tone="bad">{r.open} open request</Pill> : null}
                </div>
                <div className="grid grid-cols-2 gap-2 text-[13px]">
                  <div className="rounded-xl bg-sunken/70 px-3 py-2"><p className="text-ink3 text-[12px] font-semibold">Capacity</p><p className="font-semibold tnum">{n(r.cap)}</p></div>
                  <div className="rounded-xl bg-sunken/70 px-3 py-2"><p className="text-ink3 text-[12px] font-semibold">Assets</p><p className="font-semibold tnum">{n(r.assets)}</p></div>
                </div>
                <p className="text-[12.5px] text-ink3">{r.note}</p>
                <div className="flex gap-2 mt-auto">
                  <Button size="sm" variant="secondary" className="flex-1" icon={I.Package} onClick={() => toast({ title: `${r.assets} assets in ${r.name}`, body: 'Opening the asset register for this room.', tone: 'info' })}>Assets</Button>
                  {canEdit && <Button size="sm" variant="ghost" icon={I.Wrench} onClick={() => { setCur({ place: r.name }); setSheet('raise'); }}>Request</Button>}
                </div>
              </Card>
            ))}
          </div>
        )}
        {view === 'labs' && <Labs onCheck={() => setSheet('check')} />}
      </div>
      <RaiseSheet open={sheet === 'raise'} onClose={() => { setSheet(null); setCur(null); }} place={cur?.place} onDone={(r) => setList((x) => [r, ...x])} />
      <RequestDetail r={cur && cur.id ? cur : null} onClose={() => setCur(null)} canEdit={canEdit} onSave={(r) => { setList((x) => x.map((y) => (y.id === r.id ? r : y))); setCur(null); }} />
      <AddRoomSheet open={sheet === 'room'} onClose={() => setSheet(null)} />
      <LabCheckSheet open={sheet === 'check'} onClose={() => setSheet(null)} />
    </div>
  );
}

function Labs({ onCheck }) {
  const canEdit = useCanEdit();
  const [lab, setLab] = useState('Physics lab');
  const EXP = {
    'Physics lab': [['Class 9', 'Verify Archimedes’ principle', 'Done', '18 Sep'], ['Class 9', 'Find the speed of a pulse in a slinky', 'Done', '25 Sep'], ['Class 10', 'Ohm’s law: V–I graph for a resistor', 'Done', '1 Oct'], ['Class 10', 'Focal length of a convex lens', 'Planned', '27 Oct'], ['Class 10', 'Refraction through a glass slab', 'Planned', '3 Nov']],
    'Chemistry lab': [['Class 9', 'Separate a mixture by sublimation', 'Done', '21 Sep'], ['Class 10', 'pH of samples with universal indicator', 'Done', '5 Oct'], ['Class 10', 'Reaction of zinc with dilute HCl', 'Planned', '28 Oct']],
    'Biology lab': [['Class 9', 'Onion peel cells under the microscope', 'Done', '16 Sep'], ['Class 10', 'Stomata on a leaf peel', 'Planned', '29 Oct']],
  };
  const checks = [
    { label: 'Fire extinguisher pressure in the green', sub: 'Checked 1 Oct by Farhana Begum · OK', done: true },
    { label: 'First-aid box stocked', sub: 'Checked 1 Oct · burn gel added', done: true },
    { label: 'Gas cylinder valve and pipe', sub: 'Checked 1 Oct · OK', done: true },
    { label: 'Ceiling fans and wiring', sub: 'Front fan not working · MR-2026-0118', done: false, action: 'Open request' },
    { label: 'Chemical cupboard locked and labelled', sub: 'Due this month', done: false, action: 'Record' },
  ];
  return (
    <Split>
      <Col>
        <Chips value={lab} onChange={setLab} options={Object.keys(EXP)} />
        <Card className="overflow-hidden">
          <CardHead title={`Experiments · ${lab}`} sub="From the syllabus, by class" action={<ExportButton what="experiments list" />} />
          <DataList rows={EXP[lab]} rowKey={(e) => e[1]} minWidth={520} footer={`${EXP[lab].filter((e) => e[2] === 'Done').length} of ${EXP[lab].length} done this term`}
            columns={[
              { key: 'c', label: 'Class', nowrap: true, render: (e) => e[0] },
              { key: 'e', label: 'Experiment', render: (e) => <span className="font-medium">{e[1]}</span> },
              { key: 'd', label: 'Date', nowrap: true, render: (e) => <span className="tnum text-[13px]">{e[3]}</span> },
              { key: 's', label: 'Status', render: (e) => <Pill tone={e[2] === 'Done' ? 'ok' : 'info'}>{e[2]}</Pill> },
            ]}
            mobile={(e) => ({ title: e[1], sub: `${e[0]} · ${e[3]}`, icon: 'FlaskConical', iconTone: e[2] === 'Done' ? 'ok' : 'info' })} />
        </Card>
      </Col>
      <Col>
        <Card>
          <CardHead title="Lab safety checks" sub="Physics lab · October" icon={I.ShieldCheck} action={canEdit && <Button size="sm" variant="soft" onClick={onCheck}>Record check</Button>} />
          <Checklist items={checks} onAction={canEdit ? onCheck : undefined} />
        </Card>
        <Card>
          <CardHead title="Lab equipment maintenance" />
          <ul className="px-2 pb-2">
            <li><Row icon="Microscope" title="Compound microscopes ×12" sub="Lens cleaning · due 15 Oct · Biology lab" right={<Pill tone="warn">Due</Pill>} /></li>
            <li><Row icon="Scale" title="Digital balance, 0.01 g" sub="Calibrated 2 Sep · Chemistry lab" right={<Pill tone="ok">OK</Pill>} /></li>
            <li><Row icon="Fan" title="Ceiling fan AT-0215" sub="Physics lab · request open" right={<Pill tone="bad">Open</Pill>} /></li>
          </ul>
        </Card>
      </Col>
    </Split>
  );
}

function RaiseSheet({ open, onClose, place: preset, onDone }) {
  const toast = useToast();
  const { role } = useRole();
  const [place, setPlace] = useState('');
  const [what, setWhat] = useState('');
  const [pri, setPri] = useState('Normal');
  const [asset, setAsset] = useState('');
  const [photo, setPhoto] = useState(false);
  const [tried, setTried] = useState(false);
  useEffect(() => { if (open) { setPlace(preset || ''); setWhat(''); setPri('Normal'); setAsset(''); setPhoto(false); setTried(false); } }, [open, preset]);
  const err = { place: !place && 'Choose the room or place', what: !what.trim() && 'Say what is wrong' };
  return (
    <FormSheet open={open} onClose={onClose} title="Raise maintenance request" sub="It reaches the store keeper, who assigns a technician." submitLabel="Send request" busyLabel="Sending…"
      onSubmit={() => {
        setTried(true); if (err.place || err.what) return false;
        onDone?.({ id: 'MR-2026-0119', what: what.trim(), place, asset: asset || undefined, by: role.person.name, when: 'Today, 10:44 AM', pri, tech: '', status: 'Open', photo, detail: what.trim() });
        toast({ title: 'Request MR-2026-0119 sent', body: `${place} · ${pri} priority. You get a message when it is done.` });
      }}>
      <Field label="Place" required id="rq-place" error={tried && err.place}><Select id="rq-place" value={place} onChange={setPlace} error={tried && !!err.place} options={[{ value: '', label: 'Choose a room or place' }, ...FACILITIES.map((x) => x.name), 'Room 4 A · Class 4 A', 'Girls’ washroom, Block B', 'Staff room']} /></Field>
      <Field label="Problem" required id="rq-what" error={tried && err.what}><Textarea id="rq-what" value={what} onChange={setWhat} rows={2} placeholder="For example: Physics lab fan not working" /></Field>
      <Field label="Photo" hint="Optional. Helps the technician bring the right part."><CameraBox taken={photo} onTake={() => setPhoto(true)} onRetake={() => setPhoto(false)} what="problem" /></Field>
      <Field label="Priority" required><Segmented value={pri} onChange={setPri} options={['Low', 'Normal', 'High', 'Urgent']} className="w-full" size="sm" /></Field>
      <Field label="Asset" id="rq-asset" hint="If it is one tagged item"><Select id="rq-asset" value={asset} onChange={setAsset} options={[{ value: '', label: 'None' }, ...ASSETS.filter((a) => a.status !== 'Disposed').map((a) => ({ value: `${a.tag} · ${a.name.split(',')[0]}`, label: `${a.tag} · ${a.name}` }))]} /></Field>
    </FormSheet>
  );
}

function RequestDetail({ r, onClose, onSave, canEdit }) {
  const toast = useToast();
  const [tech, setTech] = useState('');
  const [pri, setPri] = useState('Normal');
  const [st, setSt] = useState('Open');
  const [cost, setCost] = useState('');
  useEffect(() => { if (r) { setTech(r.tech); setPri(r.pri); setSt(r.status); setCost(r.cost ? String(r.cost) : ''); } }, [r]);
  if (!r) return null;
  const closing = st === 'Done' && r.status !== 'Done';
  return (
    <Sheet open={!!r} onClose={onClose} title={r.what} sub={`${r.id} · ${r.place} · raised by ${r.by}, ${r.when}`}
      footer={canEdit ? <><Button variant="ghost" onClick={onClose}>Close</Button><Button variant="primary" icon={I.Check} disabled={closing && !Number(cost)} onClick={() => {
        onSave({ ...r, tech, pri, status: st, cost: Number(cost) || r.cost, done: closing ? '9 Oct 2026' : r.done });
        toast({ title: closing ? `${r.id} closed` : `${r.id} updated`, body: closing ? `${inr(Number(cost))} sent to Finance as a maintenance expense. ${r.by} is told.` : tech ? `${tech} gets the job on their phone.` : 'Saved.' });
      }}>{closing ? `Close with cost ${cost ? inr(Number(cost)) : ''}` : 'Save'}</Button></> : null}>
      <div className="flex flex-col gap-4">
        <p className="text-[14.5px] text-ink2 leading-relaxed">{r.detail}</p>
        {r.photo && (
          <div className="rounded-xl border border-line overflow-hidden">
            <div className="h-36 bg-sunken grid place-items-center text-ink3 relative"><I.Image size={28} /><span className="absolute bottom-2 left-2 text-[11.5px] bg-surface/90 rounded-md px-2 py-0.5">Photo from {r.by.split(' ')[0]}’s phone · 8:55 AM</span></div>
          </div>
        )}
        {r.asset && <Row icon="Package" title={r.asset} sub="Tagged asset · repair history on the asset page" className="!px-0" />}
        {canEdit ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Technician" id="rd-tech"><Select id="rd-tech" value={tech} onChange={setTech} options={[{ value: '', label: 'Not assigned' }, ...TECHS]} /></Field>
              <Field label="Priority" id="rd-pri"><Select id="rd-pri" value={pri} onChange={setPri} options={['Low', 'Normal', 'High', 'Urgent']} /></Field>
            </div>
            <Field label="Status"><Segmented value={st} onChange={setSt} options={['Open', 'In progress', 'Done']} className="w-full" /></Field>
            {st === 'Done' && <Field label="Cost" required id="rd-cost" hint="Goes to Finance as a maintenance expense" error={closing && !Number(cost) && 'Enter the cost, or 0 if it was free'}><Input id="rd-cost" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value.replace(/\D/g, ''))} className="tnum" placeholder="₹" /></Field>}
          </>
        ) : <DL cols={2} rows={[['Technician', r.tech || 'Not assigned'], ['Priority', r.pri], ['Status', r.status], ['Cost', r.cost ? inr(r.cost) : '—']]} />}
      </div>
    </Sheet>
  );
}

function AddRoomSheet({ open, onClose }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [kind, setKind] = useState('Classroom');
  const [cap, setCap] = useState('');
  useEffect(() => { if (open) { setName(''); setKind('Classroom'); setCap(''); } }, [open]);
  return (
    <FormSheet open={open} onClose={onClose} title="Add room or facility" sub="The Time Table uses the same rooms." submitLabel="Add"
      onSubmit={() => { if (!name.trim()) return false; toast({ title: `${name.trim()} added`, body: `${kind}${cap ? ` · capacity ${cap}` : ''}. Now in the facility register and Time Table rooms.` }); }}>
      <Field label="Name" required id="rm-name" error={!name.trim() && 'Enter a name, like Room 11 B'}><Input id="rm-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Room 11 B" /></Field>
      <Field label="Kind"><Segmented value={kind} onChange={setKind} options={['Classroom', 'Lab', 'Hall', 'Ground']} className="w-full" size="sm" /></Field>
      <Field label="Capacity" id="rm-cap"><Input id="rm-cap" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value.replace(/\D/g, ''))} className="tnum" placeholder="40" /></Field>
    </FormSheet>
  );
}

function LabCheckSheet({ open, onClose }) {
  const toast = useToast();
  const items = ['Fire extinguisher pressure in the green', 'First-aid box stocked', 'Gas cylinder valve and pipe', 'Ceiling fans and wiring', 'Chemical cupboard locked and labelled', 'Eye-wash bottle full'];
  const [ok, setOk] = useState({});
  useEffect(() => { if (open) setOk(Object.fromEntries(items.map((x, i) => [x, i !== 3]))); }, [open]);
  const bad = items.filter((x) => !ok[x]);
  return (
    <Sheet open={open} onClose={onClose} title="Lab safety check" sub="Physics lab · Fri, 9 Oct 2026"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={I.Check} onClick={() => { onClose(); toast({ title: 'Safety check saved', body: bad.length ? `${bad.length} item${bad.length > 1 ? 's' : ''} not OK. A maintenance request is suggested.` : 'All OK.' }); }}>Save check</Button></>}>
      <ul className="flex flex-col gap-1">
        {items.map((x) => (
          <li key={x} className="flex items-center gap-3 py-2 border-b border-line/70 last:border-0">
            <span className="flex-1 text-[14px]">{x}</span>
            <Segmented size="sm" value={ok[x] ? 'OK' : 'Not OK'} onChange={(v) => setOk({ ...ok, [x]: v === 'OK' })} options={['OK', 'Not OK']} />
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

/* ======================= Inventory Reports ======================= */
const INV_REPORTS = [
  { g: 'Stock', id: 'stock', name: 'Stock in hand', what: 'By item, category and location, with value' },
  { g: 'Stock', id: 'moves', name: 'Stock movements', what: 'In, out, transfers and losses by period' },
  { g: 'Stock', id: 'low', name: 'Low stock and reorder list', what: 'Items at or below reorder level' },
  { g: 'Issues', id: 'issues', name: 'Issues by department, class, staff and student', what: 'Who took what this term' },
  { g: 'Issues', id: 'sets', name: 'Book sets issued by class', what: 'Sets issued and charged to fees' },
  { g: 'Purchases', id: 'vendor', name: 'Purchases by vendor, item and month', what: 'Spending with each vendor' },
  { g: 'Purchases', id: 'pending', name: 'Pending orders and unpaid bills', what: 'Goods not received, bills not paid' },
  { g: 'Assets', id: 'register', name: 'Asset register and value after depreciation', what: 'Every asset with its value today' },
  { g: 'Assets', id: 'amc', name: 'Warranty and AMC due', what: 'Ending in the next 90 days' },
  { g: 'Maintenance', id: 'maint', name: 'Maintenance requests and costs', what: 'By place, technician and month' },
  { g: 'Audits', id: 'audit', name: 'Stock audit and asset audit variances', what: 'Differences found and approved' },
];
// Reports that show the state today; the others cover a period
const AS_ON = ['stock', 'low', 'register', 'amc', 'pending'];
// The Accountant sees the money side only: stock and asset value, purchases, store charges and maintenance costs
const ACCOUNTANT_REPORTS = ['stock', 'sets', 'vendor', 'pending', 'register', 'maint'];
const MONTHS = [['2026-06', 'June'], ['2026-07', 'July'], ['2026-08', 'August'], ['2026-09', 'September'], ['2026-10', 'October (so far)']];
const monthIn = (per, ym) => { const [y, m] = ym.split('-').map(Number); const last = new Date(y, m, 0).getDate(); return `${ym}-01` <= per.to && `${ym}-${last}` >= per.from; };
function InvReportsPage() {
  const toast = useToast();
  const { role } = useRole();
  const list = role.id === 'accountant' ? INV_REPORTS.filter((x) => ACCOUNTANT_REPORTS.includes(x.id)) : INV_REPORTS;
  const [cur, setCur] = useState(list[0].id);
  const [loc, setLoc] = useState('All locations');
  const [per, setPer] = useState(PERIODS.acyear);
  const r = list.find((x) => x.id === cur) || list[0];
  const asOn = AS_ON.includes(r.id);
  // Example numbers for a term (1 Jun to 9 Oct, 131 days), scaled to the chosen period
  const f = Math.min(periodDays(per), 400) / 131;
  const sc = (v) => Math.round(v * f);
  const byMonth = (rows) => MONTHS.map(([ym, label], i) => [ym, [label, ...rows[i]]]).filter(([ym]) => monthIn(per, ym)).map(([, row]) => row);
  const preview = {
    stock: { cols: ['Category', 'Items', 'In hand (units)', 'Value'], rows: [['Stationery', 88, '9,842', inr(214600)], ['Lab', 74, '2,316', inr(168900)], ['Uniforms', 38, '1,904', inr(142300)], ['Books', 34, '1,218', inr(96450)], ['Sports', 31, '286', inr(38700)], ['Cleaning', 28, '412', inr(14800)], ['Computer spares', 8, '19', inr(5200)], ['Electrical', 11, '146', inr(3300)]], total: ['Total', 312, '16,143', inr(684250)] },
    moves: { cols: ['Month', 'In', 'Out', 'Transfers', 'Losses'], rows: byMonth([['8,420', '6,115', '312', '14'], ['1,240', '2,036', '88', '6'], ['960', '1,874', '64', '3'], ['3,610', '2,258', '120', '9'], ['160', '1,102', '42', '2']]) },
    low: { cols: ['Item', 'In hand', 'Reorder level', 'Suggested order'], rows: LOW.map((it) => [it.name, n(inHand(it)), n(it.reorder), n(it.reorder * 2 - inHand(it))]) },
    issues: { cols: ['Issued to', 'Issues', 'Items', 'Value'], rows: [['Exam cell', 14, 3640, 28400], ['Primary wing (Classes 1–5)', 22, 486, 9100], ['Science department', 9, 212, 18200], ['Students (store counter)', 168, 1512, 516420], ['Housekeeping', 11, 58, 16900]].map(([k, a, b, c]) => [k, n(sc(a)), n(sc(b)), inr(sc(c))]) },
    sets: { cols: ['Class', 'Set', 'Issued', 'Charged to fees'], rows: [['Class 5', 'Class 5 book set 2026–27', 71, 3450], ['Class 8', 'Class 8 book set 2026–27', 64, 4280], ['Class 1', 'Class 1 uniform set (boys)', 38, 1860]].map(([k, nm, q, p]) => [k, nm, n(sc(q)), inr(sc(q) * p)]) },
    vendor: { cols: ['Vendor', 'Orders', 'Amount', 'Unpaid'], rows: VENDORS.map((v, i) => [v.name, n(sc(v.orders)), inr(sc([96420, 58300, 41800, 38900, 33200, 17800][i])), v.open ? inr(v.open) : '—']) },
    pending: { cols: ['Number', 'Vendor', 'What is pending', 'Amount'], rows: [['PO-2026-0058', 'Sri Sai Stationers', 'All goods', inr(18240)], ['PO-2026-0057', 'Deccan Scientific Suppliers', '20 beakers', inr(1900)], ['HSH/26-27/0471', 'Hyderabad Sports House', 'Bill unpaid', inr(14600)], ['DSS/2026/772', 'Deccan Scientific Suppliers', 'Bill part paid', inr(3400)]] },
    register: { cols: ['Type', 'Assets', 'Bought for', 'Value now'], rows: [['Vehicles', 9, '₹2.20 Cr', '₹1.31 Cr'], ['IT', 214, '₹48.6 L', '₹17.2 L'], ['Furniture', '1,124', '₹21.4 L', '₹12.9 L'], ['Lab', 286, '₹9.8 L', '₹6.1 L'], ['Sports', 96, '₹4.2 L', '₹2.8 L'], ['Other', 113, '₹8.4 L', '₹5.6 L']] },
    amc: { cols: ['Asset', 'Tag', 'Ends', 'With'], rows: [...ENDING.map((a) => [a.name, a.tag, a.amc || a.warranty, a.amc ? `AMC · ${a.vendor}` : 'Warranty']), ['Interactive flat panels ×6', 'AT-0725 to 0730', '2 Dec 2026', 'AMC · Sri Venkateswara Systems']] },
    maint: { cols: ['Month', 'Requests', 'Done', 'Average days', 'Cost'], rows: byMonth([[31, 31, '2.8', inr(42600)], [24, 24, '1.9', inr(18300)], [19, 19, '2.2', inr(12750)], [22, 21, '2.4', inr(26900)], [6, 2, '2.0', inr(1800)]]) },
    audit: { cols: ['Audit', 'Location', 'Differences', 'Status'], rows: [['AUD-2026-0004', 'Main store', '5 items · −₹612', 'Approved 30 Aug', '2026-08-30'], ['AUD-2026-0003', 'Lab store', '2 items · −₹190', 'Approved 2 Jul', '2026-07-02'], ['AA-2026-0002', 'Computer lab 1', '1 missing, 1 misplaced', 'Waiting for review', '2026-10-08']].filter((x) => x[4] >= per.from && x[4] <= per.to).map((x) => x.slice(0, 4)) },
  }[r.id];
  const groups = [...new Set(list.map((x) => x.g))];
  return (
    <div>
      <ModuleHead sub="Stock, purchase and asset reports. Each one is also in Reports & Analytics." />
      <div className="grid gap-5 @lg:gap-6 items-start @xl:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="overflow-hidden hidden @xl:block">
          {groups.map((g) => (
            <div key={g} className="border-b border-line/70 last:border-0 pb-1">
              <p className="eyebrow text-ink3 px-5 pt-3.5 pb-1">{g}</p>
              <ul className="px-2">
                {list.filter((x) => x.g === g).map((x) => (
                  <li key={x.id}>
                    <button onClick={() => setCur(x.id)} className={cx('w-full text-left px-3 py-2 rounded-xl transition', r.id === x.id ? 'bg-brand/10 text-brand' : 'hover:bg-sunken/70')}>
                      <p className="font-semibold text-[14px] leading-snug">{x.name}</p>
                      <p className={cx('text-[12.5px]', r.id === x.id ? 'text-brand' : 'text-ink3')}>{x.what}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Card>
        <Col>
          <Field label="Report" id="ir-pick" className="@xl:hidden">
            <Select id="ir-pick" value={r.id} onChange={setCur} options={list.map((x) => ({ value: x.id, label: `${x.g}: ${x.name}` }))} />
          </Field>
          <Card className="overflow-hidden">
            <CardHead title={r.name} sub={`Sunrise Public School · ${loc} · ${asOn ? 'as on 9 Oct 2026' : `${per.label} · ${fmtRange(per)}`}`} />
            <Toolbar className="border-t border-line @md:flex-wrap">
              <Select value={loc} onChange={setLoc} options={['All locations', ...LOCS]} className="@md:w-52" />
              {!asOn && <DatePeriod id="ir-per" value={per} onChange={setPer} className="w-full @md:w-auto" />}
              <div className="flex gap-2 @md:ml-auto">
                {['Excel', 'CSV', 'PDF'].map((f) => <Button key={f} variant="secondary" size="md" icon={f === 'PDF' ? I.FileText : I.FileSpreadsheet} onClick={() => toast({ title: `Saved: ${r.name.toLowerCase().replace(/[^a-z]+/g, '-')}.${f === 'Excel' ? 'xlsx' : f.toLowerCase()}`, body: 'School name, filters, your name and the time are on top. Logged in the export log.' })}>{f}</Button>)}
              </div>
            </Toolbar>
            {preview.rows.length === 0 ? <Empty icon={I.CalendarX} title="Nothing in these dates" body={`${r.name} has no rows between ${fmtRange(per)}. Pick a longer period.`} /> : <div className="overflow-x-auto scroll-thin">
              <table className="w-full text-[14px] min-w-[520px]">
                <thead><tr className="text-[12px] text-ink3 text-left border-b border-line">{preview.cols.map((c, i) => <th key={c} className={cx('py-2.5 font-semibold', i === 0 ? 'pl-5 pr-3' : 'px-3', i === preview.cols.length - 1 && 'pr-5', i > 0 && 'text-right')}>{c}</th>)}</tr></thead>
                <tbody>
                  {preview.rows.map((row, ri) => <tr key={ri} className="border-b border-line/70 last:border-0">{row.map((v, i) => <td key={i} className={cx('py-2.5', i === 0 ? 'pl-5 pr-3 font-medium' : 'px-3 text-right tnum', i === row.length - 1 && 'pr-5')}>{v}</td>)}</tr>)}
                  {preview.total && <tr className="bg-sunken/60 font-semibold">{preview.total.map((v, i) => <td key={i} className={cx('py-2.5', i === 0 ? 'pl-5 pr-3' : 'px-3 text-right tnum', i === preview.total.length - 1 && 'pr-5')}>{v}</td>)}</tr>}
                </tbody>
              </table>
            </div>}
          </Card>
          {r.id === 'stock' && (
            <Card>
              <CardHead title="Stock value by category" sub="₹ thousand" />
              <div className="px-5 pb-5"><HBars rows={[['Stationery', 215], ['Lab', 169], ['Uniforms', 142], ['Books', 96], ['Sports', 39], ['Cleaning', 15]].map(([k, v]) => ({ k, v, label: `₹${v}k` }))} max={220} labelWidth={84} /></div>
            </Card>
          )}
          {r.id === 'maint' && preview.rows.length > 0 && (
            <Card>
              <CardHead title="Maintenance cost by month" sub="₹ thousand" />
              <div className="px-3 pb-3"><Bars data={[['Jun', 42.6], ['Jul', 18.3], ['Aug', 12.8], ['Sep', 26.9], ['Oct', 1.8]].filter((x, i) => monthIn(per, MONTHS[i][0])).map(([k, v]) => ({ k, v }))} label={(v) => `${v}k`} max={50} ticks={[0, 20, 40]} ariaLabel="Maintenance cost by month" /></div>
            </Card>
          )}
        </Col>
      </div>
    </div>
  );
}

/* ======================= Inventory Settings ======================= */
function InvSettingsPage() {
  const toast = useToast();
  const canEdit = useCanEdit();
  return (
    <div>
      <ModuleHead sub="Categories, store locations, reorder levels and approval limits. Every change is logged." />
      <div className="grid @xl:grid-cols-2 gap-5 @lg:gap-6 items-start">
        <Col>
          <Card>
            <CardHead title="Item categories" sub="Default reorder level for new items in each" icon={I.Tags} action={canEdit && <Button size="sm" variant="ghost" icon={I.Plus} onClick={() => toast({ title: 'New category', body: 'Name it and set its default reorder level.', tone: 'info' })}>Add</Button>} />
            <ul className="divide-y divide-line/70 border-t border-line/70">
              {CATS.map((c) => (
                <li key={c.k} className="flex items-center gap-3 px-5 py-3">
                  <span className={cx('w-8 h-8 rounded-lg grid place-items-center', TONE_SOFT.neutral)}><Icon name={c.icon} size={16} /></span>
                  <span className="flex-1 min-w-0 text-[14px]"><b className="font-semibold">{c.k}</b><span className="text-ink3 text-[12.5px]"> · {c.items} items</span></span>
                  <span className="text-[13px] text-ink2 tnum">{c.reorder ? `Reorder at ${c.reorder}` : 'No alert'}</span>
                  {canEdit && <Button size="sm" variant="ghost" onClick={() => toast({ title: `Change: ${c.k}`, body: 'Opens a short form. Every change is logged.', tone: 'info' })}>Change</Button>}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHead title="Store locations" icon={I.Warehouse} action={canEdit && <Button size="sm" variant="ghost" icon={I.Plus} onClick={() => toast({ title: 'New store location', tone: 'info' })}>Add</Button>} />
            <ul className="divide-y divide-line/70 border-t border-line/70">
              {[['Main store', 'Block A, ground floor · Ramu Yadav', 268], ['Lab store', 'Block C, 1st floor · Farhana Begum', 74], ['Sports room', 'Next to the ground · Mohammed Asif', 31], ['Primary block store', 'Block D · Usha Rani', 22]].map(([k, s, c]) => (
                <li key={k} className="flex items-center gap-3 px-5 py-3"><span className="flex-1 min-w-0 text-[14px]"><b className="font-semibold block">{k}</b><span className="text-[12.5px] text-ink3">{s}</span></span><span className="text-[13px] text-ink3 tnum">{c} items</span></li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHead title="Units" sub="Shown when adding an item" icon={I.Ruler} action={canEdit && <Button size="sm" variant="ghost" icon={I.Plus} onClick={() => toast({ title: 'New unit', body: 'For example: Dozen, Pair.', tone: 'info' })}>Add</Button>} />
            <div className="px-5 pb-5 flex flex-wrap gap-2">{UNITS.map((u) => <Pill key={u}>{u}</Pill>)}</div>
          </Card>
        </Col>
        <Col>
          <SettingsCard title="Approval limits" sub="Stored in Settings, Forms & Approvals. Nobody approves their own request." icon={I.ListChecks} rows={[
            { title: 'Purchase request', sub: 'Up to the limit: School Admin. Above: Principal.', value: '₹10,000' },
            { title: 'Purchase order', sub: 'Above this, the Principal approves the order too', value: '₹25,000' },
            { title: 'Asset transfer', sub: 'Assets bought above this need approval to move', value: '₹25,000' },
            { title: 'Asset disposal', sub: 'Always needs approval', value: 'Principal' },
            { title: 'Stock audit adjustments', sub: 'Stock changes only after approval', value: 'School Admin' },
          ]} />
          <SettingsCard title="Numbers and formats" icon={I.Hash} rows={[
            { title: 'Item code format', sub: 'Next: ST-0122', value: 'ST-0001' },
            { title: 'Asset tag format', sub: 'Next: AT-0731', value: 'AT-0001' },
            { title: 'Purchase order number', sub: 'Next: PO-2026-0059', value: 'PO-YYYY-0001' },
          ]} />
          <SettingsCard title="Assets" icon={I.Package} rows={[
            { title: 'Depreciation method', sub: 'IT 33.33%, furniture 10%, vehicles 15% a year', value: 'Straight line' },
            { title: 'Warranty and AMC reminder', sub: 'Store keeper and School Admin are told', value: '30 days before' },
          ]} />
          <SettingsCard title="Book sets" icon={I.BookCopy} rows={[
            { title: 'Book sets', sub: 'Sell or issue items together at the store counter', on: true },
            { title: 'Allow issuing a set with items missing', sub: 'Missing items are listed and given later', on: true },
            { title: 'Track expiry for lab chemicals', sub: 'Expired batches cannot be issued', on: true },
          ]} />
        </Col>
      </div>
    </div>
  );
}

export const INVENTORY_PAGES = {
  items: ItemsRoute,
  issue: IssuePage,
  purchases: PurchasesPage,
  assets: AssetsRoute,
  rooms: RoomsPage,
  reports: InvReportsPage,
  settings: InvSettingsPage,
};
