// 16 Front Office: reception desk, visitors, student pickup, enquiries and calls, appointments, postal. Example data only.
import React, { useEffect, useMemo, useState } from 'react';
import * as I from './icons.js';
import { STUDENTS, FEATURED, STUDENT_PROFILE as SP } from './data.js';
import { cx, Card, CardHead, Button, IconButton, Pill, Avatar, Field, Input, inputCls, Checkbox, Switch, Segmented, Sheet, Empty, useToast } from './ui.jsx';
import { useNav, useRole } from './shell.jsx';
import { ModuleHead, useCanEdit, usePage, Stats, Band, SearchBox, Toolbar, Select, Textarea, Chips, DataList, Row, Banner, MoreMenu, FormSheet, ConfirmSheet, Split, Col, ExportButton, HBars, Bars, TONE_SOFT, DatePeriod, PERIODS, fmtRange } from './kit.jsx';

/* ======================= Sample data ======================= */
// '9 Oct', 'Today' or 'Yesterday' to an ISO date in 2026 (today is Fri 9 Oct 2026)
const MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const isoDay = (s) => { if (s === 'Today') return '2026-10-09'; if (s === 'Yesterday') return '2026-10-08'; const [d, m] = s.split(/[ ,]+/); return `2026-${String(MONS.indexOf(m) + 1).padStart(2, '0')}-${d.padStart(2, '0')}`; };
const TODAY_ISO = '2026-10-09';
const PASS_END = '4:00 PM';
const MEET = [
  { name: 'Lakshmi Rao', role: 'Principal', now: 'In a meeting till 11:00 AM', tone: 'warn' },
  { name: 'Srinivas Murthy', role: 'Vice Principal', now: 'In office', tone: 'ok' },
  { name: 'Suresh Babu', role: 'Accountant', now: 'At the fee counter', tone: 'ok' },
  { name: 'Anita Sharma', role: 'School Admin', now: 'In office', tone: 'ok' },
  { name: 'Divya Menon', role: 'Admission Counsellor', now: 'In office', tone: 'ok' },
  { name: 'Ravi Teja', role: 'Class Teacher 7 B', now: 'Teaching 7 B till 11:15 AM', tone: 'warn' },
  { name: 'Imran Shaikh', role: 'Mathematics', now: 'Free period till 11:15 AM', tone: 'ok' },
  { name: 'Anitha Kumari', role: 'PGT English', now: 'On leave today', tone: 'bad' },
  { name: 'Venkat Rao', role: 'Class Teacher 8 A', now: 'Teaching 9 A till 11:15 AM', tone: 'warn' },
  { name: 'Ramu Yadav', role: 'Store Keeper', now: 'In the store', tone: 'ok' },
];
const meetOf = (n) => MEET.find((m) => m.name === n);
const PURPOSES = ['Meeting', 'Fee payment', 'Admission enquiry', 'Delivery', 'Interview', 'Other'];

const VISITORS = [
  { pass: 'V-0246', date: 'Today', name: 'Prakash Reddy', phone: '98480 55120', purpose: 'Meeting', meet: 'Lakshmi Rao', note: '10:30 AM appointment', vehicle: 'TS 08 EZ 4410', in: '10:22 AM', out: null, status: 'In', reply: 'Send in', people: 1 },
  { pass: 'V-0245', date: 'Today', name: 'Deepika Rao', phone: '90001 77342', purpose: 'Interview', meet: 'Lakshmi Rao', note: 'PGT Chemistry, 11:00 AM', vehicle: '', in: '10:15 AM', out: null, status: 'In', reply: 'Wait', people: 1 },
  { pass: 'V-0244', date: 'Today', name: 'Sravani Goud', phone: '96030 41185', purpose: 'Fee payment', meet: 'Suresh Babu', note: 'Tejas Goud, 5 B', vehicle: '', in: '10:05 AM', out: null, status: 'In', reply: 'Send in', people: 1 },
  { pass: 'V-0243', date: 'Today', name: 'Anil Kumar', phone: '90100 55678', purpose: 'Other', meet: 'Ramu Yadav', note: 'AquaPure RO service', vehicle: 'TS 07 EP 2291', in: '8:50 AM', out: null, status: 'In', reply: 'Send in', people: 2 },
  { pass: 'V-0242', date: 'Today', name: 'Mohd. Rafiq', phone: '99490 23317', purpose: 'Delivery', meet: 'Ramu Yadav', note: 'Sri Sai Stationers', vehicle: 'TS 09 UD 7781', in: '9:31 AM', out: '9:48 AM', status: 'Out', people: 1 },
  { pass: 'V-0241', date: 'Today', name: 'Harish Chandra', phone: '98665 10432', purpose: 'Meeting', meet: 'Ravi Teja', note: 'Parent, 7 B', vehicle: '', in: '9:10 AM', out: '9:42 AM', status: 'Out', people: 2 },
  { pass: 'V-0240', date: 'Today', name: 'Swathi Varma', phone: '97040 88213', purpose: 'Admission enquiry', meet: 'Divya Menon', note: 'Nursery 2027–28', vehicle: '', in: '8:45 AM', out: '9:20 AM', status: 'Out', people: 2 },
  { pass: 'V-0239', date: 'Today', name: 'Ganesh Patil', phone: '93470 61125', purpose: 'Delivery', meet: 'Anita Sharma', note: 'Blue Dart', vehicle: '', in: '8:35 AM', out: '8:41 AM', status: 'Out', people: 1 },
  { pass: 'V-0238', date: 'Today', name: 'Ramya Krishnan', phone: '98853 70214', purpose: 'Fee payment', meet: 'Suresh Babu', note: 'Arjun Krishnan, 2 A', vehicle: '', in: '8:20 AM', out: '8:38 AM', status: 'Out', people: 1 },
  { pass: 'V-0229', date: '8 Oct', name: 'Sanjay Verma', phone: '94403 21980', purpose: 'Meeting', meet: 'Venkat Rao', note: 'Parent, 8 A', vehicle: '', in: '2:40 PM', out: null, status: 'Expired', people: 1 },
  { pass: 'V-0228', date: '8 Oct', name: 'Lalitha Prasad', phone: '98490 66721', purpose: 'Fee payment', meet: 'Suresh Babu', note: 'Varun Prasad, 4 A', vehicle: '', in: '11:05 AM', out: '11:30 AM', status: 'Out', people: 1 },
  { pass: 'V-0226', date: '8 Oct', name: 'Kiran Kumar', phone: '90009 11245', purpose: 'Delivery', meet: 'Ramu Yadav', note: 'Deccan Scientific Suppliers', vehicle: 'TS 09 UC 1120', in: '9:40 AM', out: '9:58 AM', status: 'Out', people: 2 },
  { pass: 'V-0221', date: '7 Oct', name: 'Padmini Rao', phone: '97012 30098', purpose: 'Meeting', meet: 'Lakshmi Rao', note: 'Parent, 9 C', vehicle: '', in: '12:10 PM', out: '12:35 PM', status: 'Out', people: 2 },
  { pass: 'V-0214', date: '6 Oct', name: 'Naresh Goud', phone: '96035 77410', purpose: 'Interview', meet: 'Lakshmi Rao', note: 'TGT Hindi', vehicle: '', in: '10:00 AM', out: '10:50 AM', status: 'Out', people: 1 },
  { pass: 'V-0198', date: '1 Oct', name: 'Bhavani Shankar', phone: '98853 21907', purpose: 'Admission enquiry', meet: 'Divya Menon', note: 'Class 3 2027–28', vehicle: '', in: '9:15 AM', out: '9:45 AM', status: 'Out', people: 2 },
  { pass: 'V-0171', date: '24 Sep', name: 'Vijaya Lakshmi', phone: '94405 18802', purpose: 'Meeting', meet: 'Ravi Teja', note: 'Parent, 7 B', vehicle: '', in: '1:30 PM', out: '1:55 PM', status: 'Out', people: 1 },
  { pass: 'V-0122', date: '2 Sep', name: 'Ramesh Babu', phone: '99630 44871', purpose: 'Other', meet: 'Anita Sharma', note: 'Fire safety inspection', vehicle: 'TS 08 GA 2210', in: '11:00 AM', out: '12:15 PM', status: 'Out', people: 2 },
].map((v) => ({ ...v, iso: isoDay(v.date) }));
const RETURNING = { '9866321450': { name: 'Venu Gopal', last: '28 Sep 2026, met Lakshmi Rao', purpose: 'Meeting', meet: 'Lakshmi Rao' }, '9848055120': { name: 'Prakash Reddy', last: '12 Sep 2026, met Lakshmi Rao', purpose: 'Meeting', meet: 'Lakshmi Rao' } };
const V_TONE = { In: 'ok', Out: 'neutral', Expired: 'bad' };
const REPLY_TONE = { 'Send in': 'ok', Wait: 'warn', 'Not available': 'bad' };

const GATE = [
  { t: '10:31 AM', dir: 'In', who: 'Car · Prakash Reddy (visitor V-0246)', veh: 'TS 08 EZ 4410', purpose: 'Meeting with the Principal' },
  { t: '10:21 AM', dir: 'Out', who: 'Diya Reddy, 3 A, with mother Sunitha Reddy', veh: '', purpose: 'Pickup gate pass GP-2026-0189 checked', pass: true },
  { t: '9:48 AM', dir: 'Out', who: 'Delivery van · Sri Sai Stationers', veh: 'TS 09 UD 7781', purpose: 'Delivery to the store' },
  { t: '9:31 AM', dir: 'In', who: 'Delivery van · Sri Sai Stationers', veh: 'TS 09 UD 7781', purpose: 'Delivery to the store' },
  { t: '8:50 AM', dir: 'In', who: 'Two-wheeler · Anil Kumar (visitor V-0243)', veh: 'TS 07 EP 2291', purpose: 'RO service' },
  { t: '8:12 AM', dir: 'In', who: 'School bus · Bus 4, Route 4 Miyapur', veh: 'TS 07 UB 2236', purpose: 'Morning trip, 49 students' },
  { t: '8:05 AM', dir: 'In', who: 'School bus · Bus 1, Route 1 KPHB', veh: 'TS 07 UA 1182', purpose: 'Morning trip, 46 students' },
  { t: '7:40 AM', dir: 'In', who: 'Milk and vegetable van, hostel mess', veh: 'TS 10 UB 3319', purpose: 'Hostel mess supply' },
].map((g) => ({ ...g, iso: TODAY_ISO, day: 'Today' })).concat([
  { t: '4:12 PM', dir: 'Out', who: 'School bus · Bus 3, Route 3 Bachupally', veh: 'TS 07 UB 0917', purpose: 'Evening drop', iso: '2026-10-08', day: '8 Oct' },
  { t: '11:02 AM', dir: 'In', who: 'Two-wheeler · Lalitha Prasad (visitor V-0228)', veh: 'TS 08 EK 7712', purpose: 'Fee payment', iso: '2026-10-08', day: '8 Oct' },
  { t: '9:38 AM', dir: 'In', who: 'Delivery van · Deccan Scientific Suppliers', veh: 'TS 09 UC 1120', purpose: 'Delivery to the store', iso: '2026-10-08', day: '8 Oct' },
  { t: '10:55 AM', dir: 'In', who: 'Car · Ramesh Babu (visitor V-0122)', veh: 'TS 08 GA 2210', purpose: 'Fire safety inspection', iso: '2026-09-02', day: '2 Sep' },
]);

const MOTHERS = ['Sunitha', 'Padmaja', 'Swathi', 'Radhika', 'Anuradha', 'Kavitha', 'Sirisha', 'Madhavi'];
const RESTRICTED = STUDENTS.find((s) => s.clsId === '4' && s.sec === 'B') || STUDENTS[40];
function pickupList(s) {
  if (s.id === FEATURED.id) return SP.emergency.map((e) => ({ name: e.name, rel: e.rel, phone: e.phone }));
  const h = s.id.charCodeAt(s.id.length - 1) + s.id.charCodeAt(s.id.length - 2);
  const mother = { name: `${MOTHERS[h % MOTHERS.length]} ${s.last}`, rel: 'Mother', phone: `9${(h * 7919) % 900000000 + 100000000}`.slice(0, 10).replace(/(\d{5})(\d{5})/, '$1 $2') };
  const father = { name: s.father, rel: 'Father', phone: s.phone };
  if (s.id === RESTRICTED.id) return [mother, { ...father, restricted: 'Court order dated 14 Mar 2026: may not collect the child. Call the mother. Note added by Anita Sharma.' }, { name: `Ramesh ${s.last}`, rel: 'Uncle', phone: '90302 44187' }];
  return [mother, father];
}
const CT = { '7 B': 'Ravi Teja', '4 B': 'Usha Rani', '3 A': 'Sunitha Mohan', '6 A': 'Lalitha Devi', '8 A': 'Venkat Rao', '9 C': 'Deepak Verma', '10 A': 'Anitha Kumari', '10 C': 'Farhana Begum', '9 B': 'Swapna Reddy' };
const ctOf = (s) => CT[`${s.cls.replace('Class ', '')} ${s.sec}`] || 'Usha Rani';

const PICKUPS = [
  { gp: 'GP-2026-0189', student: 'Diya Reddy', cls: '3 A', by: 'Sunitha Reddy', rel: 'Mother', time: '9:58 AM', reason: 'Doctor visit', released: 'Kavitha Nair', gate: 'Left at 10:21 AM · checked by Bhaskar Rao', left: true },
  { gp: 'GP-2026-0190', student: 'Rohan Gupta', cls: '6 A', by: 'Anil Gupta', rel: 'Father', time: '10:20 AM', reason: 'Family function', released: 'Kavitha Nair', gate: 'Waiting at the gate', left: false },
].map((p) => ({ ...p, iso: TODAY_ISO, day: 'Today' }));
// Earlier early pickups, for the history
const PICKUPS_OLD = [
  { gp: 'GP-2026-0186', student: 'Tanvi Rao', cls: '4 B', by: 'Padmaja Rao', rel: 'Mother', time: '12:40 PM', reason: 'Unwell', released: 'Kavitha Nair', gate: 'Left at 12:52 PM · checked by Bhaskar Rao', left: true, iso: '2026-10-08', day: '8 Oct' },
  { gp: 'GP-2026-0181', student: 'Ishaan Reddy', cls: '5 A', by: 'Kiran Reddy', rel: 'Father', time: '11:15 AM', reason: 'Doctor visit', released: 'Kavitha Nair', gate: 'Left at 11:24 AM · checked by Bhaskar Rao', left: true, iso: '2026-10-06', day: '6 Oct' },
  { gp: 'GP-2026-0174', student: 'Meera Pillai', cls: '3 B', by: 'Radhika Pillai', rel: 'Mother', time: '1:30 PM', reason: 'Family function', released: 'Anita Sharma', gate: 'Left at 1:41 PM · checked by Bhaskar Rao', left: true, iso: '2026-10-01', day: '1 Oct' },
  { gp: 'GP-2026-0158', student: 'Arjun Krishnan', cls: '2 A', by: 'Ramya Krishnan', rel: 'Mother', time: '10:05 AM', reason: 'Exam or competition', released: 'Kavitha Nair', gate: 'Left at 10:12 AM · checked by Bhaskar Rao', left: true, iso: '2026-09-21', day: '21 Sep' },
];

const ENQ = [
  { id: 'ENQ-2026-0412', t: '10:31 AM', child: 'Advik Rao', parent: 'Swapnil Rao', phone: '98491 22086', cls: 'LKG 2027–28', source: 'Walk-in', owner: 'Divya Menon', next: 'Mon 12 Oct, 11:00 AM' },
  { id: 'ENQ-2026-0411', t: '9:55 AM', child: 'Myra Varma', parent: 'Swathi Varma', phone: '97040 88213', cls: 'Nursery 2027–28', source: 'Walk-in', owner: 'Divya Menon', next: 'Sat 10 Oct, 10:00 AM school visit' },
  { id: 'ENQ-2026-0410', t: '9:12 AM', child: 'Rudra Goud', parent: 'Praveen Goud', phone: '90304 51127', cls: 'Class 6 2027–28', source: 'Phone', owner: 'Divya Menon', next: 'Today, 4:00 PM call back' },
  { id: 'ENQ-2026-0404', t: 'Yesterday', child: 'Saanvi Kulkarni', parent: 'Nitin Kulkarni', phone: '99665 30418', cls: 'Class 2 2026–27', source: 'Phone', owner: 'Divya Menon', next: 'Today, 12:30 PM' },
  { id: 'ENQ-2026-0398', t: '6 Oct', child: 'Vihaan Shetty', parent: 'Pooja Shetty', phone: '98480 71136', cls: 'UKG 2027–28', source: 'Walk-in', owner: 'Divya Menon', next: 'Done · school visit on 8 Oct' },
  { id: 'ENQ-2026-0385', t: '1 Oct', child: 'Ananya Bhat', parent: 'Suresh Bhat', phone: '90300 88124', cls: 'Class 3 2027–28', source: 'Walk-in', owner: 'Divya Menon', next: 'Done · applied 5 Oct' },
  { id: 'ENQ-2026-0361', t: '19 Sep', child: 'Kabir Ali', parent: 'Sana Ali', phone: '99490 12087', cls: 'Nursery 2027–28', source: 'Phone', owner: 'Divya Menon', next: 'Closed · chose another school' },
].map((e) => ({ ...e, iso: /AM|PM/.test(e.t) ? TODAY_ISO : isoDay(e.t) }));
const CALLS = [
  { id: 'C1', t: '10:36 AM', dir: 'In', name: 'Rajesh Sharma', who: 'Father of Aarav Sharma, 7 B', phone: '98490 31277', purpose: 'Fee', note: 'Asked for the Q3 tuition amount. Payment link sent.', follow: '', status: 'Closed', parent: true },
  { id: 'C2', t: '10:12 AM', dir: 'In', name: 'Praveen Goud', who: 'New enquiry', phone: '90304 51127', purpose: 'Admission enquiry', note: 'Class 6 next year. Enquiry ENQ-2026-0410 made.', follow: 'Today 4:00 PM · Divya Menon', status: 'Follow-up' },
  { id: 'C3', t: '9:47 AM', dir: 'Out', name: 'Hyderabad Sports House', who: 'Vendor', phone: '98850 77231', purpose: 'Other', note: 'Asked when the footballs will be delivered.', follow: '', status: 'Closed' },
  { id: 'C4', t: '9:20 AM', dir: 'In', name: 'Kumar Reddy', who: 'Father of Harini Reddy, 7 B', phone: '99851 40326', purpose: 'Transport', note: 'Bus 4 was 15 minutes late yesterday evening.', follow: 'Mon 12 Oct · Venkatesh Goud', status: 'Follow-up', parent: true },
  { id: 'C5', t: '8:58 AM', dir: 'In', name: 'Meenakshi Iyer', who: 'Mother of Kavya Iyer, 5 A', phone: '94405 63210', purpose: 'Complaint', note: 'Water cooler in the primary block is not cooling.', follow: '', status: 'Sent as query Q-2026-0087', parent: true },
  { id: 'C6', t: '8:40 AM', dir: 'Out', name: 'Sunitha Reddy', who: 'Mother of Diya Reddy, 3 A', phone: '98483 72105', purpose: 'Other', note: 'Confirmed early pickup at 10:00 AM.', follow: '', status: 'Closed', parent: true },
].map((c) => ({ ...c, iso: TODAY_ISO, day: 'Today' })).concat([
  { id: 'C0a', t: '3:10 PM', dir: 'In', name: 'Nitin Kulkarni', who: 'New enquiry', phone: '99665 30418', purpose: 'Admission enquiry', note: 'Class 2 mid-year. Enquiry ENQ-2026-0404 made.', follow: 'Today 12:30 PM · Divya Menon', status: 'Follow-up', iso: '2026-10-08', day: '8 Oct' },
  { id: 'C0b', t: '11:45 AM', dir: 'In', name: 'Kumar Reddy', who: 'Father of Harini Reddy, 7 B', phone: '99851 40326', purpose: 'Fee', note: 'Asked for a fee receipt copy. Sent on WhatsApp.', follow: '', status: 'Closed', parent: true, iso: '2026-10-08', day: '8 Oct' },
  { id: 'C0c', t: '10:20 AM', dir: 'Out', name: 'Deccan Scientific Suppliers', who: 'Vendor', phone: '90009 11245', purpose: 'Other', note: 'Broken beakers sent back by DTDC.', follow: '', status: 'Closed', iso: '2026-10-07', day: '7 Oct' },
  { id: 'C0d', t: '9:05 AM', dir: 'In', name: 'Pooja Shetty', who: 'Enquiry ENQ-2026-0398', phone: '98480 71136', purpose: 'Admission enquiry', note: 'Booked a school visit for Thursday.', follow: '', status: 'Closed', iso: '2026-10-06', day: '6 Oct' },
  { id: 'C0e', t: '2:30 PM', dir: 'In', name: 'Meenakshi Iyer', who: 'Mother of Kavya Iyer, 5 A', phone: '94405 63210', purpose: 'Transport', note: 'Asked to change the bus stop. Sent to Transport.', follow: '', status: 'Closed', parent: true, iso: '2026-09-28', day: '28 Sep' },
]);
const CALLS_TODAY = CALLS.filter((c) => c.iso === TODAY_ISO);
const KNOWN_PHONES = {
  '9849031277': { name: 'Rajesh Sharma', who: 'Father of Aarav Sharma, 7 B', kind: 'parent' },
  '9849560211': { name: 'Priya Sharma', who: 'Mother of Aarav Sharma, 7 B and Anaya Sharma, UKG A', kind: 'parent' },
  '9704088213': { name: 'Swathi Varma', who: 'Enquiry ENQ-2026-0411 · Myra, Nursery 2027–28', kind: 'enquiry' },
  '9985140326': { name: 'Kumar Reddy', who: 'Father of Harini Reddy, 7 B', kind: 'parent' },
};

const WALKIN = [
  { id: 'REQ-2026-0042', t: '10:05 AM', from: 'Sravani Goud', about: 'Mother of Tejas Goud, 5 B', req: 'Fee statement for income tax, 2025–26', dept: 'Accounts', status: 'Sent', via: 'WhatsApp' },
  { id: 'REQ-2026-0041', t: '9:25 AM', from: 'Harish Chandra', about: 'Father of Lasya Chandra, 7 B', req: 'Bonafide certificate for passport', dept: 'Office', status: 'In progress', via: 'Printed slip' },
  { id: 'REQ-2026-0040', t: 'Yesterday', from: 'Meenakshi Iyer', about: 'Mother of Kavya Iyer, 5 A', req: 'Change bus stop to KPHB 9th Phase', dept: 'Transport', status: 'Done', via: 'WhatsApp' },
];
const REQ_TONE = { Sent: 'info', 'In progress': 'warn', Done: 'ok' };
const DEPTS = ['Office', 'Accounts', 'Academics', 'Transport', 'Admissions', 'Exams', 'Hostel', 'Library'];

const APPTS = [
  { id: 'AP1', t: '9:00 AM', len: 15, visitor: 'Ramesh Naidu', phone: '98482 11903', with: 'Srinivas Murthy', purpose: 'Long leave for son, 9 C', status: 'No-show' },
  { id: 'AP2', t: '9:30 AM', len: 15, visitor: 'Harish Chandra', phone: '98665 10432', with: 'Ravi Teja', purpose: 'Unit test marks of daughter', status: 'Done' },
  { id: 'AP3', t: '10:30 AM', len: 30, visitor: 'Prakash Reddy', phone: '98480 55120', with: 'Lakshmi Rao', purpose: 'Sports quota admission for son', status: 'Arrived' },
  { id: 'AP4', t: '11:00 AM', len: 30, visitor: 'Deepika Rao', phone: '90001 77342', with: 'Lakshmi Rao', purpose: 'Interview: PGT Chemistry', status: 'Arrived' },
  { id: 'AP5', t: '12:15 PM', len: 15, visitor: 'Anjali Menon', phone: '96035 22870', with: 'Suresh Babu', purpose: 'Fee concession request', status: 'Booked' },
  { id: 'AP6', t: '2:30 PM', len: 15, visitor: 'Venu Gopal', phone: '98663 21450', with: 'Lakshmi Rao', purpose: 'Transport complaint follow-up', status: 'Booked' },
].map((a) => ({ ...a, iso: '2026-10-09', day: 'Today' })).concat([
  { id: 'AP7', t: '9:00 AM', len: 30, visitor: 'Swathi Varma', phone: '97040 88213', with: 'Lakshmi Rao', purpose: 'School visit for Myra (Nursery)', status: 'Booked', iso: '2026-10-10', day: 'Sat 10 Oct' },
  { id: 'AP8', t: '12:15 PM', len: 15, visitor: 'Nitin Kulkarni', phone: '99665 30418', with: 'Srinivas Murthy', purpose: 'Mid-year admission, Class 2', status: 'Booked', iso: '2026-10-12', day: 'Mon 12 Oct' },
  { id: 'AP9', t: '11:00 AM', len: 15, visitor: 'Padmini Rao', phone: '97012 30098', with: 'Ravi Teja', purpose: 'Half-yearly exam preparation', status: 'Booked', iso: '2026-10-15', day: 'Thu 15 Oct' },
  { id: 'AP10', t: '10:00 AM', len: 30, visitor: 'Ramesh Naidu', phone: '98482 11903', with: 'Lakshmi Rao', purpose: 'Fee concession review', status: 'Booked', iso: '2026-11-03', day: 'Tue 3 Nov' },
  { id: 'AP11', t: '12:10 PM', len: 30, visitor: 'Padmini Rao', phone: '97012 30098', with: 'Lakshmi Rao', purpose: 'Son’s behaviour in class', status: 'Done', iso: '2026-10-07', day: 'Wed 7 Oct' },
  { id: 'AP12', t: '10:00 AM', len: 45, visitor: 'Naresh Goud', phone: '96035 77410', with: 'Lakshmi Rao', purpose: 'Interview: TGT Hindi', status: 'Done', iso: '2026-10-06', day: 'Tue 6 Oct' },
  { id: 'AP13', t: '2:00 PM', len: 15, visitor: 'Lalitha Prasad', phone: '98490 66721', with: 'Suresh Babu', purpose: 'Fee installment plan', status: 'Cancelled', iso: '2026-09-30', day: 'Wed 30 Sep' },
]);
const APPTS_TODAY = APPTS.filter((a) => a.iso === '2026-10-09');
const AP_TONE = { Booked: 'info', Arrived: 'brand', Done: 'ok', Cancelled: 'neutral', 'No-show': 'bad' };

const POSTAL = [
  { id: 'PD-2026-0318', d: '9 Oct, 10:05 AM', dir: 'Received', type: 'Courier', party: 'CBSE Regional Office, Chennai', for: 'Lakshmi Rao (Principal)', courier: 'Speed Post', track: 'EK419277833IN', status: 'At desk' },
  { id: 'PD-2026-0317', d: '9 Oct, 9:40 AM', dir: 'Received', type: 'Parcel', party: 'Oxford University Press', for: 'Library · Padma Iyer', courier: 'Delhivery', track: '5847 2210 9931', status: 'Handed over', who: 'Padma Iyer, 9:52 AM' },
  { id: 'PD-2026-0316', d: '8 Oct, 3:10 PM', dir: 'Received', type: 'Courier', party: 'HDFC Bank, Kukatpally', for: 'Accounts · Suresh Babu', courier: 'Blue Dart', track: '77201184562', status: 'At desk' },
  { id: 'PD-2026-0315', d: '8 Oct, 11:20 AM', dir: 'Sent', type: 'Letter', party: 'District Educational Officer, Medchal', for: 'Office', courier: 'Speed Post', track: 'EK418822017IN', status: 'Sent' },
  { id: 'PD-2026-0314', d: '7 Oct, 2:30 PM', dir: 'Received', type: 'Letter', party: 'Income Tax Department (TDS)', for: 'Accounts · Suresh Babu', courier: 'India Post', track: '', status: 'Handed over', who: 'Suresh Babu, 7 Oct 3:05 PM' },
  { id: 'PD-2026-0313', d: '7 Oct, 11:00 AM', dir: 'Sent', type: 'Courier', party: 'Deccan Scientific Suppliers (broken beakers)', for: 'Stores', courier: 'DTDC', track: 'D40018827731', status: 'Sent' },
  { id: 'PD-2026-0312', d: '6 Oct, 4:15 PM', dir: 'Received', type: 'Parcel', party: 'Telangana Book House', for: 'Stores · Ramu Yadav', courier: 'Professional Couriers', track: 'HYD22091187', status: 'At desk' },
  { id: 'PD-2026-0305', d: '29 Sep, 12:20 PM', dir: 'Received', type: 'Letter', party: 'CBSE Regional Office, Chennai', for: 'Lakshmi Rao (Principal)', courier: 'Speed Post', track: 'EK418004512IN', status: 'Handed over', who: 'Lakshmi Rao, 29 Sep 1:10 PM' },
  { id: 'PD-2026-0297', d: '22 Sep, 10:40 AM', dir: 'Sent', type: 'Courier', party: 'Telangana Board of Secondary Education', for: 'Exams', courier: 'DTDC', track: 'D40017716290', status: 'Sent' },
  { id: 'PD-2026-0261', d: '28 Aug, 3:00 PM', dir: 'Received', type: 'Parcel', party: 'Amazon (sports goods)', for: 'Stores · Ramu Yadav', courier: 'Delhivery', track: '5847 1102 3381', status: 'Handed over', who: 'Ramu Yadav, 28 Aug 3:20 PM' },
].map((r) => ({ ...r, iso: isoDay(r.d.split(',')[0]) }));
const PD_TONE = { 'At desk': 'warn', 'Handed over': 'ok', Sent: 'info' };

const NOTES0 = [
  { id: 1, t: 'Principal in the exam committee meeting 12:00 to 12:40. Take messages.', by: 'Anita Sharma, 8:30 AM' },
  { id: 2, t: 'Half-yearly admit cards: parents collect from the Office from Sat 10 Oct.', by: 'Kavitha Nair, yesterday' },
  { id: 3, t: 'Bus 3 running 15 minutes late this afternoon (road work at Pragathi Nagar).', by: 'Venkatesh Goud, 9:15 AM' },
];

/* ======================= Small shared pieces ======================= */
const digitsOf = (p) => String(p || '').replace(/\D/g, '');
const mask = (p) => `••••••${digitsOf(p).slice(-4)}`;
const useSeesPhones = () => { const { role } = useRole(); return ['principal', 'schooladmin', 'receptionist'].includes(role.id); };
const Err = ({ children }) => children ? <p className="text-[12.5px] text-bad flex items-center gap-1.5" role="alert"><I.CircleAlert size={14} />{children}</p> : null;
function Alert({ tone, title, children, act, icon, onAct }) {
  return (
    <Banner tone={tone} title={title} action={act ? <Button type="button" size="sm" variant="secondary" icon={icon} className="hidden @md:inline-flex shrink-0" onClick={onAct}>{act}</Button> : null}>
      {children}
      {act && <span className="block mt-2.5 @md:hidden"><Button type="button" size="sm" variant="secondary" icon={icon} onClick={onAct}>{act}</Button></span>}
    </Banner>
  );
}
function PhoneInput({ id, value, onChange, error, placeholder = '98480 12345' }) {
  return (
    <div className="relative">
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3 text-[15px]">+91</span>
      <Input id={id} inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d ]/g, '').slice(0, 11))} error={error} className="pl-12 tnum" placeholder={placeholder} />
    </div>
  );
}
const phoneErr = (p) => (!digitsOf(p) ? 'Enter the phone number' : digitsOf(p).length !== 10 || !/^[6-9]/.test(digitsOf(p)) ? 'Enter a 10-digit Indian mobile number' : '');

function FakeQR({ size = 150, faded }) {
  const cells = useMemo(() => {
    let s = 11; const r = () => ((s = (s * 48271) % 2147483647) / 2147483647);
    return Array.from({ length: 25 * 25 }, () => r() > 0.52);
  }, []);
  const finder = (x, y) => (x < 7 && y < 7) || (x > 17 && y < 7) || (x < 7 && y > 17);
  return (
    <div className={cx('p-3 rounded-2xl bg-white shadow-card border border-line shrink-0', faded && 'opacity-40')}>
      <svg width={size} height={size} viewBox="0 0 25 25" shapeRendering="crispEdges" aria-label="Pass QR code">
        {cells.map((on, i) => { const x = i % 25, y = Math.floor(i / 25); return !finder(x, y) && on ? <rect key={i} x={x} y={y} width="1" height="1" fill="#0f1715" /> : null; })}
        {[[0, 0], [18, 0], [0, 18]].map(([x, y]) => (
          <g key={x + '-' + y}><rect x={x} y={y} width="7" height="7" fill="#0f1715" /><rect x={x + 1} y={y + 1} width="5" height="5" fill="#fff" /><rect x={x + 2} y={y + 2} width="3" height="3" fill="#0f1715" /></g>
        ))}
      </svg>
    </div>
  );
}

function CameraBox({ taken, name, onTake, onRetake }) {
  if (taken) {
    return (
      <div className="rounded-xl border border-line p-3 flex items-center gap-3">
        <span className="relative rounded-xl overflow-hidden bg-sunken p-1.5"><Avatar name={name || 'Visitor'} size={56} className="!rounded-lg" /><span className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-ok text-white grid place-items-center"><I.Check size={10} strokeWidth={3} /></span></span>
        <div className="min-w-0 flex-1"><p className="font-semibold text-[14px]">Photo taken at 10:44 AM</p><p className="text-[12.5px] text-ink3">Printed on the pass and kept with the visit</p></div>
        <Button type="button" size="sm" variant="ghost" icon={I.RotateCcw} onClick={onRetake}>Retake</Button>
      </div>
    );
  }
  return (
    <div className="relative rounded-xl border border-dashed border-line bg-sunken/60 h-40 grid place-items-center overflow-hidden">
      {['top-3 left-3 border-t-2 border-l-2', 'top-3 right-3 border-t-2 border-r-2', 'bottom-3 left-3 border-b-2 border-l-2', 'bottom-3 right-3 border-b-2 border-r-2'].map((c) => <span key={c} className={cx('absolute w-5 h-5 border-ink3/50 rounded-sm', c)} />)}
      <span className="absolute top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-ok"><span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse" />Desk camera on</span>
      <div className="flex flex-col items-center gap-2 text-ink3 text-[13px] mt-3">
        <I.ScanFace size={30} />
        <span>Ask the visitor to look at the camera</span>
        <Button type="button" size="sm" variant="secondary" icon={I.Camera} onClick={onTake}>Take photo</Button>
      </div>
    </div>
  );
}

/* Visitor pass: on screen, printed or sent to the visitor's phone */
function PassSheet({ v, onClose, onCheckOut }) {
  const toast = useToast();
  const canEdit = useCanEdit();
  const { role } = useRole();
  const seesV = ['principal', 'schooladmin', 'receptionist', 'vp'].includes(role.id);
  if (!v) return null;
  const expired = v.status === 'Expired';
  return (
    <Sheet open={!!v} onClose={onClose} title={`Visitor pass ${v.pass}`} sub={expired ? `Expired at ${PASS_END} on ${v.date === 'Today' ? 'today' : v.date}. A scan shows “Expired”.` : `Valid until ${PASS_END} today. It expires by itself.`}>
      <div className="flex flex-col items-center gap-4 pb-1">
        <div className={cx('w-full rounded-2xl border-2 overflow-hidden', expired ? 'border-bad/40' : 'border-line')}>
          <div className={cx('px-4 py-2.5 flex items-center justify-between', expired ? 'bg-bad/10' : 'bg-brand/10')}>
            <span className={cx('eyebrow', expired ? 'text-bad' : 'text-brand')}>Visitor · Sunrise Public School</span>
            <span className="font-mono text-[12.5px] font-semibold">{v.pass}</span>
          </div>
          <div className="p-4 flex items-center gap-4">
            <Avatar name={v.name} size={64} />
            <div className="min-w-0 flex-1">
              <p className="font-display font-semibold text-[19px] leading-tight">{v.name}</p>
              <p className="text-[13px] text-ink3">{v.purpose}{v.meet ? ` · to meet ${v.meet}` : ''}</p>
              <p className="text-[13px] text-ink3 tnum">In {v.in}{v.people > 1 ? ` · ${v.people} people` : ''}{v.vehicle ? ` · ${v.vehicle}` : ''}</p>
            </div>
          </div>
          <div className="relative flex justify-center pb-4">
            <FakeQR size={140} faded={expired} />
            {expired && <span className="absolute top-1/2 -translate-y-1/2 px-4 py-1.5 rounded-xl bg-bad text-white font-display font-semibold text-[20px] -rotate-6 shadow-pop">Expired</span>}
          </div>
        </div>
        {canEdit && v.status === 'In' && (
          <div className="grid grid-cols-2 gap-2 w-full">
            <Button variant="secondary" icon={I.Printer} onClick={() => toast({ title: 'Sent to the desk printer', body: `Pass ${v.pass} with photo and QR` })}>Print</Button>
            <Button variant="secondary" icon={I.MessageCircle} onClick={() => toast({ title: 'Pass sent on WhatsApp', body: `To ${seesV ? v.phone : mask(v.phone)}. Shown at the gate on their phone.` })}>Send to phone</Button>
          </div>
        )}
        {canEdit && v.status !== 'Out' && <Button variant={expired ? 'primary' : 'soft'} icon={I.LogOut} className="w-full" onClick={() => onCheckOut(v)}>{expired ? 'Close with the right time' : 'Check out now'}</Button>}
      </div>
    </Sheet>
  );
}

/* Register a visitor in under a minute */
function VisitorSheet({ open, onClose, onSaved, onEnquiry, gate }) {
  const toast = useToast();
  const blank = { phone: '', name: '', purpose: 'Meeting', meet: '', people: '1', idType: 'Aadhaar', idNo: '', vehicle: '' };
  const [f, setF] = useState(blank);
  const [photo, setPhoto] = useState(false);
  const [found, setFound] = useState(null);
  const [tried, setTried] = useState(false);
  useEffect(() => { if (open) { setF(blank); setPhoto(false); setFound(null); setTried(false); } }, [open]);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v && v.target ? v.target.value : v }));
  const onPhone = (v) => {
    const r = RETURNING[digitsOf(v)];
    setF((x) => ({ ...x, phone: v, ...(r && !found ? { name: r.name, purpose: r.purpose, meet: r.meet } : {}) }));
    setFound(r || null);
  };
  const needMeet = ['Meeting', 'Interview', 'Fee payment'].includes(f.purpose);
  const vOk = !f.vehicle.trim() || /^[A-Z]{2}\s?\d{1,2}\s?[A-Z]{0,3}\s?\d{1,4}$/i.test(f.vehicle.trim());
  const err = { phone: phoneErr(f.phone), name: !f.name.trim() ? 'Enter the visitor’s name' : '', meet: needMeet && !f.meet ? 'Choose who they are here to meet' : '', vehicle: vOk ? '' : 'This does not look like a vehicle number, like TS 08 EZ 4410' };
  const m = meetOf(f.meet);
  return (
    <FormSheet open={open} onClose={onClose} title="New visitor" sub="Type the phone first. Returning visitors fill in by themselves (try 98663 21450)." submitLabel="Register and make pass" busyLabel="Registering…" wide
      onSubmit={() => {
        setTried(true); if (Object.values(err).some(Boolean)) return false;
        const v = { pass: 'V-0247', date: 'Today', name: f.name.trim(), phone: f.phone, purpose: f.purpose, meet: f.meet, note: '', vehicle: f.vehicle.toUpperCase(), in: '10:44 AM', out: null, status: 'In', reply: null, people: Number(f.people) || 1 };
        toast({ title: `${v.name} registered · pass V-0247`, body: f.meet ? `${f.meet} told on the app. They can reply Send in, Wait or Not available.` : 'Pass valid until 4:00 PM today.' });
        setTimeout(() => (f.purpose === 'Admission enquiry' ? onEnquiry?.(v) : onSaved?.(v)), 750);
      }}>
      <div className="grid @md:grid-cols-[1fr_240px] gap-4 @md:gap-5">
        <div className="flex flex-col gap-4 min-w-0">
          <Field label="Phone" required id="vs-phone" error={tried && err.phone}><PhoneInput id="vs-phone" value={f.phone} onChange={onPhone} error={tried && !!err.phone} /></Field>
          {found && <div className="rounded-xl bg-ok/10 px-3.5 py-2.5 text-[13.5px] flex items-center gap-2 -mt-2 animate-fade"><I.UserCheck size={16} className="text-ok shrink-0" /><span className="text-ink2"><b className="text-ink font-semibold">Returning visitor.</b> Last visit {found.last}.</span></div>}
          <Field label="Name" required id="vs-name" error={tried && err.name}><Input id="vs-name" value={f.name} onChange={set('name')} placeholder="Full name" error={tried && !!err.name} /></Field>
          <Field label="Purpose" required id="vs-purpose"><Select id="vs-purpose" value={f.purpose} onChange={set('purpose')} options={PURPOSES} /></Field>
          {f.purpose === 'Admission enquiry' && (gate
        ? <Banner tone="info" title="Send them to the reception desk.">The desk takes the admission enquiry.</Banner>
        : <Banner tone="info" title="The enquiry form opens next,">so the details reach Admissions with an owner and a follow-up.</Banner>)}
          <Field label="Person to meet" required={needMeet} id="vs-meet" error={tried && err.meet} hint={m ? <span className={cx('font-semibold', { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad' }[m.tone])}>{m.now}</span> : 'Shows if they are on leave or teaching now'}>
            <Select id="vs-meet" value={f.meet} onChange={set('meet')} error={tried && !!err.meet} options={[{ value: '', label: 'Choose staff member' }, ...MEET.map((x) => ({ value: x.name, label: `${x.name} · ${x.role}` }))]} />
          </Field>
          {m?.tone === 'bad' && <Err>{f.meet} is on leave today. Book an appointment instead, or choose someone else.</Err>}
        </div>
        <div className="flex flex-col gap-4 min-w-0">
          <Field label="Photo" hint="Optional by school policy"><CameraBox taken={photo} name={f.name} onTake={() => setPhoto(true)} onRetake={() => setPhoto(false)} /></Field>
          <Field label="Number of people" id="vs-people"><Segmented value={f.people} onChange={set('people')} options={['1', '2', '3', '4+']} className="w-full" size="sm" /></Field>
        </div>
      </div>
      <details className="group rounded-xl border border-line">
        <summary className="list-none cursor-pointer flex items-center justify-between px-4 h-11 text-[14px] font-semibold text-ink2">More details: ID proof and vehicle<I.ChevronDown size={16} className="group-open:rotate-180 transition" /></summary>
        <div className="px-4 pb-4 flex flex-col gap-4">
          <div className="grid grid-cols-[140px_1fr] gap-3">
            <Field label="ID proof" id="vs-idt"><Select id="vs-idt" value={f.idType} onChange={set('idType')} options={['Aadhaar', 'Driving licence', 'Voter ID', 'PAN card', 'Office ID']} /></Field>
            <Field label="Number" id="vs-idn" hint="Optional by school policy. Only the last 4 digits are shown later."><Input id="vs-idn" value={f.idNo} onChange={set('idNo')} className="font-mono" placeholder="XXXX XXXX 4821" /></Field>
          </div>
          <Field label="Vehicle number" id="vs-veh" error={err.vehicle} hint="Also goes into the gate log"><Input id="vs-veh" value={f.vehicle} onChange={(e) => setF({ ...f, vehicle: e.target.value.toUpperCase() })} className="font-mono" placeholder="TS 08 EZ 4410" error={!!err.vehicle} /></Field>
        </div>
      </details>
    </FormSheet>
  );
}

function CheckOutSheet({ v, onClose, onDone }) {
  const [t, setT] = useState('');
  useEffect(() => { if (v) setT(v.status === 'Expired' ? '4:10 PM' : '10:44 AM'); }, [v]);
  if (!v) return null;
  return (
    <ConfirmSheet open={!!v} onClose={onClose} title={`Check out ${v.name}?`} sub={v.status === 'Expired' ? `Pass ${v.pass} from ${v.date} was never checked out. Enter the time they actually left.` : `Pass ${v.pass} stops working now.`} confirmLabel={`Check out at ${t}`} onConfirm={() => onDone(v, t)}>
      <Field label="Time out" id="co-time"><Input id="co-time" value={t} onChange={(e) => setT(e.target.value)} className="tnum" /></Field>
    </ConfirmSheet>
  );
}

/* Enquiry: the short form from Admission Management */
function EnquirySheet({ open, onClose, source = 'Walk-in', preset }) {
  const toast = useToast();
  const { role } = useRole();
  const { go } = useNav();
  const [f, setF] = useState({});
  const [tried, setTried] = useState(false);
  useEffect(() => { if (open) { setF({ child: '', parent: preset?.name || '', phone: preset?.phone || '', cls: '', src: source, note: '' }); setTried(false); } }, [open, preset, source]);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v && v.target ? v.target.value : v }));
  const dup = ENQ.find((e) => digitsOf(e.phone) === digitsOf(f.phone) && digitsOf(f.phone).length === 10);
  const err = { child: !f.child?.trim() && 'Enter the child’s name', parent: !f.parent?.trim() && 'Enter the parent’s name', phone: phoneErr(f.phone), cls: !f.cls && 'Choose the class wanted' };
  return (
    <FormSheet open={open} onClose={onClose} title="New enquiry" sub="Goes straight to Admission Management with an owner and a follow-up reminder." submitLabel="Send to Admissions" busyLabel="Sending…"
      onSubmit={() => {
        setTried(true); if (Object.values(err).some(Boolean)) return false;
        toast({ title: 'Enquiry ENQ-2026-0413 sent to Admissions. Owner: Divya Menon.', body: `Follow-up reminder Sat 10 Oct, 11:00 AM. ${f.parent.trim()} gets a welcome message on WhatsApp.` });
      }}>
      {dup && <Alert tone="warn" title={`${dup.parent} already enquired at ${dup.t.toLowerCase()}:`} act={role.access.admissions ? 'Open in Admissions' : null} icon={I.ExternalLink} onAct={() => { onClose(); go('admissions', { page: 'enquiries' }); }}>{dup.child}, {dup.cls}. Owner {dup.owner}.</Alert>}
      <Field label="Child’s name" required id="en-child" error={tried && err.child}><Input id="en-child" value={f.child || ''} onChange={set('child')} error={tried && !!err.child} placeholder="Full name" /></Field>
      <Field label="Parent’s name" required id="en-parent" error={tried && err.parent}><Input id="en-parent" value={f.parent || ''} onChange={set('parent')} error={tried && !!err.parent} /></Field>
      <div className="grid @sm:grid-cols-2 gap-3">
        <Field label="Phone" required id="en-phone" error={tried && err.phone}><PhoneInput id="en-phone" value={f.phone || ''} onChange={set('phone')} error={tried && !!err.phone} /></Field>
        <Field label="Class wanted" required id="en-cls" error={tried && err.cls}><Select id="en-cls" value={f.cls || ''} onChange={set('cls')} error={tried && !!err.cls} options={[{ value: '', label: 'Choose' }, ...['Nursery', 'LKG', 'UKG', 'Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6', 'Class 7', 'Class 8', 'Class 9'].map((c) => `${c} 2027–28`), 'Class 2 2026–27 (mid-year)', 'Class 6 2026–27 (mid-year)']} /></Field>
      </div>
      <Field label="Source" hint="Set from how they reached us"><Segmented value={f.src} onChange={set('src')} options={['Walk-in', 'Phone']} className="w-full" /></Field>
      <Field label="Note" id="en-note"><Input id="en-note" value={f.note || ''} onChange={set('note')} placeholder="For example: wants transport from Nizampet" /></Field>
    </FormSheet>
  );
}

/* Log a call: incoming or outgoing */
function CallSheet({ open, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({});
  const [tried, setTried] = useState(false);
  const [fu, setFu] = useState(false);
  useEffect(() => { if (open) { setF({ dir: 'Incoming', phone: '', name: '', purpose: 'Fee', note: '', child: '', cls: '', date: '10-10-2026', time: '11:00 AM', who: 'Suresh Babu' }); setTried(false); setFu(false); } }, [open]);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v && v.target ? v.target.value : v }));
  const known = KNOWN_PHONES[digitsOf(f.phone)];
  const onPhone = (v) => { const k = KNOWN_PHONES[digitsOf(v)]; setF((x) => ({ ...x, phone: v, name: k ? k.name : x.name })); };
  const enq = f.purpose === 'Admission enquiry';
  const err = { phone: phoneErr(f.phone), name: !f.name?.trim() && 'Enter the caller’s name', child: enq && !f.child?.trim() && 'Enter the child’s name', cls: enq && !f.cls && 'Choose the class wanted' };
  return (
    <FormSheet open={open} onClose={onClose} title="Log a call" sub="Known parents and enquiries are recognised from the number (try 98490 31277)." submitLabel={enq ? 'Save call and enquiry' : f.purpose === 'Complaint' ? 'Save and send as a query' : 'Save call'}
      onSubmit={() => {
        setTried(true); if (Object.values(err).some(Boolean)) return false;
        onSaved?.({ id: 'C' + Date.now(), t: '10:44 AM', dir: f.dir === 'Incoming' ? 'In' : 'Out', name: f.name.trim(), who: known ? known.who : enq ? 'New enquiry' : 'Caller', phone: f.phone, purpose: f.purpose, note: f.note || '—', follow: fu ? `${f.date} ${f.time} · ${f.who}` : '', status: enq ? 'Follow-up' : f.purpose === 'Complaint' ? 'Sent as query Q-2026-0088' : fu ? 'Follow-up' : 'Closed', parent: known?.kind === 'parent' });
        toast({ title: 'Call saved', body: enq ? 'Enquiry ENQ-2026-0413 made in the same step. Owner: Divya Menon.' : f.purpose === 'Complaint' ? 'Sent to Communication, Feedback & Queries as Q-2026-0088.' : fu ? `Follow-up reminder for ${f.who}, ${f.date} at ${f.time}.` : 'Added to the call log.' });
      }}>
      <Field label="Direction" required><Segmented value={f.dir} onChange={set('dir')} options={[{ value: 'Incoming', label: 'Incoming', icon: I.PhoneIncoming }, { value: 'Outgoing', label: 'Outgoing', icon: I.PhoneOutgoing }]} className="w-full" /></Field>
      <Field label="Phone" required id="cl-phone" error={tried && err.phone}><PhoneInput id="cl-phone" value={f.phone || ''} onChange={onPhone} error={tried && !!err.phone} /></Field>
      {known && <div className="rounded-xl bg-ok/10 px-3.5 py-2.5 text-[13.5px] flex items-center gap-2 -mt-2 animate-fade"><I.UserCheck size={16} className="text-ok shrink-0" /><span className="text-ink2"><b className="text-ink font-semibold">{known.name}.</b> {known.who}</span></div>}
      <Field label="Name" required id="cl-name" error={tried && err.name}><Input id="cl-name" value={f.name || ''} onChange={set('name')} error={tried && !!err.name} /></Field>
      <Field label="Purpose" required id="cl-purpose"><Select id="cl-purpose" value={f.purpose} onChange={set('purpose')} options={['Admission enquiry', 'Fee', 'Transport', 'Complaint', 'Other']} /></Field>
      {enq && (
        <div className="grid @sm:grid-cols-2 gap-3 rounded-xl bg-sunken/70 p-3.5">
          <p className="@sm:col-span-2 text-[13px] text-ink2">The enquiry is made in the same step and goes to Admissions.</p>
          <Field label="Child’s name" required id="cl-child" error={tried && err.child}><Input id="cl-child" value={f.child} onChange={set('child')} error={tried && !!err.child} /></Field>
          <Field label="Class wanted" required id="cl-cls" error={tried && err.cls}><Select id="cl-cls" value={f.cls} onChange={set('cls')} error={tried && !!err.cls} options={[{ value: '', label: 'Choose' }, 'Nursery 2027–28', 'LKG 2027–28', 'UKG 2027–28', 'Class 1 2027–28', 'Class 6 2027–28']} /></Field>
        </div>
      )}
      {f.purpose === 'Complaint' && <Banner tone="info" title="Becomes a query">in Communication, Feedback & Queries, with a number the caller can ask about.</Banner>}
      <Field label="Note" id="cl-note"><Textarea id="cl-note" value={f.note || ''} onChange={set('note')} rows={2} placeholder="What was asked or told" /></Field>
      <div className="rounded-xl border border-line">
        <div className="flex items-center gap-3 px-4 py-3">
          <Switch id="cl-fu" on={fu} onChange={setFu} label="Set a follow-up" />
          <label htmlFor="cl-fu" className="text-[14px] font-semibold flex-1">Set a follow-up</label>
        </div>
        {fu && (
          <div className="grid grid-cols-3 gap-2 px-4 pb-4 animate-fade">
            <Field label="Date" id="cl-date"><Input id="cl-date" value={f.date} onChange={set('date')} className="tnum" /></Field>
            <Field label="Time" id="cl-time"><Input id="cl-time" value={f.time} onChange={set('time')} className="tnum" /></Field>
            <Field label="Who" id="cl-who"><Select id="cl-who" value={f.who} onChange={set('who')} options={MEET.map((m) => m.name)} /></Field>
          </div>
        )}
      </div>
    </FormSheet>
  );
}

/* Walk-in request: routed to a department with a request number */
function WalkInSheet({ open, onClose, onSaved }) {
  const toast = useToast();
  const [f, setF] = useState({});
  const [tried, setTried] = useState(false);
  useEffect(() => { if (open) { setF({ from: '', phone: '', req: '', dept: '', note: '', send: 'WhatsApp' }); setTried(false); } }, [open]);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v && v.target ? v.target.value : v }));
  const match = f.from?.trim().length > 2 ? STUDENTS.filter((s) => s.name.toLowerCase().includes(f.from.trim().toLowerCase()) || s.father.toLowerCase().includes(f.from.trim().toLowerCase())).slice(0, 3) : [];
  const err = { from: !f.from?.trim() && 'Search a parent or student, or type a name', req: !f.req?.trim() && 'What do they need?', dept: !f.dept && 'Choose the department' };
  return (
    <FormSheet open={open} onClose={onClose} title="Walk-in request" sub="For example a bonafide certificate or a fee statement. The person gets a request number." submitLabel="Send to department" busyLabel="Sending…"
      onSubmit={() => {
        setTried(true); if (Object.values(err).some(Boolean)) return false;
        onSaved?.({ id: 'REQ-2026-0043', t: '10:44 AM', from: f.from.trim(), about: '', req: f.req.trim(), dept: f.dept, status: 'Sent', via: f.send });
        toast({ title: `Request REQ-2026-0043 sent to ${f.dept}`, body: f.send === 'WhatsApp' ? 'The number went to the person on WhatsApp.' : 'Slip with the request number printed at the desk.' });
      }}>
      <Field label="From" required id="wi-from" error={tried && err.from} hint="Search a parent or student, or type a name and phone">
        <div className="relative"><I.Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3" /><Input id="wi-from" value={f.from || ''} onChange={set('from')} className="pl-10" placeholder="Parent or student name" error={tried && !!err.from} /></div>
      </Field>
      {match.length > 0 && (
        <ul className="-mt-2 rounded-xl border border-line divide-y divide-line/70 animate-fade">
          {match.map((s) => <li key={s.id}><button type="button" onClick={() => setF((x) => ({ ...x, from: `${s.father} (parent of ${s.name}, ${s.cls.replace('Class ', '')} ${s.sec})`, phone: s.phone }))} className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-sunken/60"><Avatar name={s.name} size={30} /><span className="text-[13.5px] min-w-0 flex-1 truncate"><b className="font-semibold">{s.name}</b> · {s.cls} {s.sec} · father {s.father}</span></button></li>)}
        </ul>
      )}
      <Field label="Request" required id="wi-req" error={tried && err.req}><Textarea id="wi-req" value={f.req || ''} onChange={set('req')} rows={2} placeholder="For example: bonafide certificate for passport" /></Field>
      <Field label="Department" required id="wi-dept" error={tried && err.dept}><Select id="wi-dept" value={f.dept || ''} onChange={set('dept')} error={tried && !!err.dept} options={[{ value: '', label: 'Choose' }, ...DEPTS]} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Request number" hint="Made automatically"><Input value="REQ-2026-0043" readOnly className="font-mono bg-sunken/60" aria-label="Request number" /></Field>
        <Field label="Give the number by"><Segmented value={f.send} onChange={set('send')} options={['WhatsApp', 'Slip']} className="w-full" /></Field>
      </div>
      <p className="text-[12.5px] text-ink3">Complaints go to Communication, Feedback & Queries instead.</p>
    </FormSheet>
  );
}

/* ======================= Reception Desk ======================= */
function DeskPage() {
  const { go } = useNav();
  const toast = useToast();
  const { role } = useRole();
  const canEdit = useCanEdit();
  const [visitors, setVisitors] = useState(VISITORS);
  const [reqs, setReqs] = useState(WALKIN);
  const [notes, setNotes] = useState(NOTES0);
  const [note, setNote] = useState('');
  const [sheet, setSheet] = useState(null);
  const [pass, setPass] = useState(null);
  const [out, setOut] = useState(null);
  const [enqFrom, setEnqFrom] = useState(null);
  // Only link to Front Office pages this person has (Office Staff: visitors and pickups)
  const { pages } = usePage();
  // Office Staff may see only visitors and pickups here (05-roles.md), whatever tabs exist
  const has = (pg) => pages.some((x) => x.id === pg) && (role.id !== 'officestaff' || ['visitors', 'pickup'].includes(pg));
  const inside = visitors.filter((v) => v.status === 'In');
  const expired = visitors.filter((v) => v.status === 'Expired');
  const upcoming = APPTS_TODAY.filter((a) => ['Booked', 'Arrived'].includes(a.status));
  const checkOut = (v, t) => {
    setVisitors((x) => x.map((y) => (y.pass === v.pass ? { ...y, status: 'Out', out: t } : y)));
    setPass(null);
    toast({ title: `${v.name} checked out at ${t}`, body: `Pass ${v.pass} no longer works.`, undo: () => setVisitors((x) => x.map((y) => (y.pass === v.pass ? v : y))) });
  };
  const BIG = [
    ['New visitor', 'Name, phone, whom to meet', I.IdCard, () => setSheet('visitor')],
    ...(has('pickup') ? [['Student pickup', 'Early pickup gate pass', I.DoorOpen, () => go('frontoffice', { page: 'pickup' })]] : []),
    ['New enquiry', 'Goes to Admissions', I.PhoneIncoming, () => setSheet('enquiry')],
    ['Log a call', 'Incoming or outgoing', I.PhoneCall, () => setSheet('call')],
  ];
  return (
    <div>
      <ModuleHead sub={`Fri, 9 Oct · ${role.id === 'receptionist' ? 'You are at the desk' : 'Kavitha Nair at the desk'} · passes expire at ${PASS_END}`}
        actions={<Button variant="secondary" icon={I.ClipboardList} onClick={() => setSheet('walkin')}>Walk-in request</Button>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Band items={[
          { label: 'In the building now', big: String(inside.length), foot: `${inside.filter((v) => v.reply === 'Wait').length} waiting to be called in`, onClick: has('visitors') ? () => go('frontoffice', { page: 'visitors' }) : undefined },
          { label: 'Visitors today', big: String(visitors.filter((v) => v.date === 'Today').length), foot: 'Average 26 minutes inside', onClick: has('visitors') ? () => go('frontoffice', { page: 'visitors' }) : undefined },
          ...(has('appointments') ? [{ label: 'Appointments today', big: String(APPTS_TODAY.length), foot: `Next: ${upcoming[1]?.t || upcoming[0]?.t}, ${upcoming[1]?.visitor || ''}`, onClick: () => go('frontoffice', { page: 'appointments' }) }] : []),
          ...(has('enquiries') ? [{ label: 'Calls and enquiries', big: <>{CALLS_TODAY.length + 5}<span className="text-[0.55em] opacity-70 font-medium"> calls · {ENQ.filter((e) => e.iso === TODAY_ISO).length} enq.</span></>, foot: '2 follow-ups due today', onClick: () => go('frontoffice', { page: 'enquiries' }) }] : []),
        ]} />

        {canEdit && (
          <div className="grid grid-cols-2 @xl:grid-cols-4 gap-3">
            {BIG.map(([t, s, Ic, fn]) => (
              <button key={t} onClick={fn} className="group text-left rounded-2xl bg-surface border border-line/70 shadow-card p-4 @md:p-5 flex flex-col gap-3 hover:border-brand/40 hover:bg-brand/[.03] transition min-h-[116px]">
                <span className="w-11 h-11 rounded-xl bg-brand/10 text-brand grid place-items-center group-hover:bg-brand group-hover:text-brandink transition"><Ic size={22} /></span>
                <span><span className="block font-semibold text-[15.5px] leading-tight">{t}</span><span className="block text-[12.5px] text-ink3 mt-0.5">{s}</span></span>
              </button>
            ))}
          </div>
        )}

        <Split>
          <Col>
            {expired.length > 0 && (
              <Alert tone="bad" title={`${expired.length} visitor not checked out yesterday.`} act={canEdit ? 'Close with the right time' : null} icon={I.LogOut} onAct={() => setOut(expired[0])}>
                Pass {expired[0].pass} ({expired[0].name}) expired at {PASS_END} on {expired[0].date}.
              </Alert>
            )}
            <Card>
              <CardHead title="In the building now" sub="Staff replies show here as they come in" icon={I.Users} action={<Pill tone="ok">{inside.length}</Pill>} />
              {inside.length === 0 ? <Empty icon={I.DoorOpen} title="Nobody is inside" body="Visitors show here from the moment they are registered." action={canEdit && <Button variant="secondary" icon={I.IdCard} onClick={() => setSheet('visitor')}>New visitor</Button>} /> : (
                <ul className="px-2 pb-2">
                  {inside.map((v) => (
                    <li key={v.pass} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/70">
                      <Avatar name={v.name} size={40} />
                      <button onClick={() => setPass(v)} className="min-w-0 flex-1 text-left">
                        <p className="font-semibold text-[14.5px] leading-snug truncate">{v.name} <span className="text-ink3 font-normal">· {v.purpose}</span></p>
                        <p className="text-[12.5px] text-ink3 truncate">In {v.in} · to meet {v.meet}{v.note ? ` · ${v.note}` : ''}</p>
                      </button>
                      {v.reply && <Pill tone={REPLY_TONE[v.reply]} className="hidden @sm:inline-flex">{v.meet.split(' ')[0]}: {v.reply}</Pill>}
                      {canEdit && <Button size="sm" variant="secondary" icon={I.LogOut} onClick={() => setOut(v)}><span className="hidden @sm:inline">Check out</span></Button>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHead title="Walk-in requests" sub="Each has a number the person can ask about" icon={I.ClipboardList} action={canEdit && <Button size="sm" variant="soft" icon={I.Plus} onClick={() => setSheet('walkin')}>New request</Button>} />
              <ul className="px-2 pb-2">
                {reqs.map((r) => (
                  <li key={r.id}>
                    <Row icon="ClipboardList" iconTone={REQ_TONE[r.status]} title={r.req} sub={`${r.id} · ${r.from}${r.about ? `, ${r.about.toLowerCase()}` : ''} · ${r.t}`}
                      right={<div className="flex flex-col items-end gap-1"><Pill tone={REQ_TONE[r.status]}>{r.status}</Pill><span className="text-[11.5px] text-ink3">{r.dept}</span></div>}
                      onClick={() => toast({ title: `${r.id} · ${r.dept}`, body: `${r.req}. Number given by ${r.via.toLowerCase()}.`, tone: 'info' })} />
                  </li>
                ))}
              </ul>
            </Card>
          </Col>
          <Col>
            <Card>
              <CardHead title="Front-office notes" sub="Short notes for whoever is at the desk" icon={I.StickyNote} />
              <ul className="px-5 flex flex-col gap-2.5">
                {notes.map((x) => (
                  <li key={x.id} className="rounded-xl bg-warn/[.08] border border-warn/20 px-3.5 py-2.5 flex gap-2">
                    <div className="min-w-0 flex-1"><p className="text-[14px] leading-snug">{x.t}</p><p className="text-[11.5px] text-ink3 mt-1">{x.by}</p></div>
                    {canEdit && <IconButton icon={I.X} label="Clear note" size={30} onClick={() => { setNotes((n) => n.filter((y) => y.id !== x.id)); toast({ title: 'Note cleared', undo: () => setNotes((n) => [...n, x]) }); }} />}
                  </li>
                ))}
                {notes.length === 0 && <li className="text-[13.5px] text-ink3 py-2">No notes. Add one for the next person at the desk.</li>}
              </ul>
              {canEdit && (
                <form className="flex gap-2 p-5 pt-3" onSubmit={(e) => { e.preventDefault(); if (!note.trim()) return; setNotes((n) => [...n, { id: Date.now(), t: note.trim(), by: `${role.person.name}, 10:44 AM` }]); setNote(''); }}>
                  <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note" aria-label="New front-office note" className="!h-10 !text-[14px]" />
                  <Button type="submit" variant="secondary" icon={I.Plus} disabled={!note.trim()}>Add</Button>
                </form>
              )}
              {!canEdit && <div className="h-4" />}
            </Card>
            {has('appointments') && (
              <Card>
                <CardHead title="Appointments today" sub="Next one first" icon={I.CalendarClock} action={<button onClick={() => go('frontoffice', { page: 'appointments' })} className="text-[13px] font-semibold text-brand hover:underline">Open</button>} />
                <ul className="px-2 pb-2">
                  {[...upcoming, ...APPTS_TODAY.filter((a) => !['Booked', 'Arrived'].includes(a.status))].slice(0, 5).map((a) => (
                    <li key={a.id}><Row avatar={a.visitor} title={`${a.t} · ${a.visitor}`} sub={`With ${a.with} · ${a.purpose}`} right={<Pill tone={AP_TONE[a.status]}>{a.status === 'Arrived' && a.id === 'AP3' ? 'In meeting' : a.status}</Pill>} /></li>
                  ))}
                </ul>
              </Card>
            )}
            <Card>
              <CardHead title="Early pickups today" icon={I.DoorOpen} action={has('pickup') && <button onClick={() => go('frontoffice', { page: 'pickup' })} className="text-[13px] font-semibold text-brand hover:underline">Open</button>} />
              <ul className="px-2 pb-2">
                {PICKUPS.map((p) => <li key={p.gp}><Row avatar={p.student} title={`${p.student}, ${p.cls}`} sub={`${p.time} · with ${p.by} (${p.rel.toLowerCase()}) · ${p.reason}`} right={<Pill tone={p.left ? 'ok' : 'warn'}>{p.left ? 'Left' : 'At gate'}</Pill>} /></li>)}
              </ul>
            </Card>
          </Col>
        </Split>
      </div>

      <VisitorSheet open={sheet === 'visitor'} onClose={() => setSheet(null)} onSaved={(v) => { setVisitors((x) => [v, ...x]); setPass(v); }} onEnquiry={(v) => { setVisitors((x) => [v, ...x]); setEnqFrom(v); setSheet('enquiry'); }} />
      <EnquirySheet open={sheet === 'enquiry'} onClose={() => { setSheet(null); setEnqFrom(null); }} preset={enqFrom} source="Walk-in" />
      <CallSheet open={sheet === 'call'} onClose={() => setSheet(null)} />
      <WalkInSheet open={sheet === 'walkin'} onClose={() => setSheet(null)} onSaved={(r) => setReqs((x) => [r, ...x])} />
      <PassSheet v={pass} onClose={() => setPass(null)} onCheckOut={(v) => { setPass(null); setOut(v); }} />
      <CheckOutSheet v={out} onClose={() => setOut(null)} onDone={checkOut} />
    </div>
  );
}

/* ======================= Visitors ======================= */
function VisitorsPage() {
  const toast = useToast();
  const { role } = useRole();
  const { access } = usePage();
  const canEdit = useCanEdit();
  const gate = access === 'own';
  const [view, setView] = useState(gate ? 'gate' : 'log');
  const [visitors, setVisitors] = useState(VISITORS);
  const [gateLog, setGateLog] = useState(GATE);
  const [f, setF] = useState('all');
  const [per, setPer] = useState(PERIODS.today);
  const [q, setQ] = useState('');
  const [sheet, setSheet] = useState(null);
  const [pass, setPass] = useState(null);
  const [out, setOut] = useState(null);
  // Office Staff and Gate Security see only the last 4 digits of a visitor's phone
  const seesV = ['principal', 'schooladmin', 'receptionist', 'vp'].includes(role.id);
  const vph = (p) => (seesV ? p : mask(p));
  const t = q.trim().toLowerCase();
  const inPer = (iso) => iso >= per.from && iso <= per.to;
  const gateRows = gateLog.filter((g) => inPer(g.iso || TODAY_ISO));
  const rows = visitors
    // A visitor never checked out stays on the list while the dates include today
    .filter((v) => inPer(v.iso || TODAY_ISO) || (v.status === 'Expired' && per.to >= TODAY_ISO))
    .filter((v) => (f === 'all' || v.status === f) && (!t || (v.name + (seesV ? v.phone.replace(' ', '') : '') + v.vehicle + v.pass + v.meet).toLowerCase().replace(/\s/g, '').includes(t.replace(/\s/g, ''))))
    .sort((a, b) => ({ In: 0, Expired: 1, Out: 2 }[a.status] - { In: 0, Expired: 1, Out: 2 }[b.status]));
  const expired = visitors.filter((v) => v.status === 'Expired');
  const checkOut = (v, tm) => {
    setVisitors((x) => x.map((y) => (y.pass === v.pass ? { ...y, status: 'Out', out: tm } : y)));
    toast({ title: `${v.name} checked out at ${tm}`, body: `Pass ${v.pass} no longer works.`, undo: () => setVisitors((x) => x.map((y) => (y.pass === v.pass ? v : y))) });
  };
  return (
    <div>
      <ModuleHead sub={gate ? 'At the gate only: register visitors, record vehicles and check passes' : `Visitor log · every pass expires by itself at ${PASS_END}`}
        actions={<>
          <Button variant="secondary" icon={I.ScanLine} onClick={() => setSheet('scan')}>Check a pass</Button>
          {gate && <Button variant="secondary" icon={I.Car} onClick={() => setSheet('gate')}>Gate entry</Button>}
          <Button variant="primary" icon={I.UserPlus} onClick={() => setSheet('visitor')}>Add visitor</Button>
        </>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Stats items={[
          { label: 'In the building now', value: String(visitors.filter((v) => v.status === 'In').length), sub: 'Oldest since 8:50 AM', tone: 'ok', icon: 'Users', onClick: () => { setView('log'); setF('In'); } },
          { label: 'Visitors today', value: String(visitors.filter((v) => v.date === 'Today').length), sub: '13 people with companions', icon: 'IdCard', onClick: () => { setView('log'); setF('all'); } },
          { label: 'Gate entries today', value: String(gateLog.filter((g) => (g.iso || TODAY_ISO) === TODAY_ISO).length), sub: '3 school buses, 2 vans', icon: 'Car', onClick: () => setView('gate') },
          { label: 'Not checked out', value: String(expired.length), sub: 'Pass expired', tone: expired.length ? 'bad' : undefined, icon: 'TimerOff', onClick: () => { setView('log'); setF('Expired'); } },
        ]} />
        {expired.length > 0 && !gate && (
          <Alert tone="bad" title={`${expired.length} visitor not checked out yesterday:`} act={canEdit ? 'Check out with the right time' : null} icon={I.LogOut} onAct={() => setOut(expired[0])}>
            {expired[0].name}, pass {expired[0].pass}, expired at {PASS_END} on {expired[0].date}.
          </Alert>
        )}
        <div className="flex flex-col @md:flex-row @md:items-center gap-2.5">
          <Segmented value={view} onChange={setView} className="self-start" options={[{ value: 'log', label: 'Visitor log', icon: I.IdCard }, { value: 'gate', label: 'Gate log', icon: I.Car }]} />
          <DatePeriod id="vis-per" value={per} onChange={setPer} className="w-full @md:w-auto" />
        </div>
        {view === 'log' ? (
          <Split>
            <Card className="overflow-hidden">
              <Toolbar>
                <SearchBox id="vis-search" value={q} onChange={setQ} placeholder={seesV ? 'Name, phone, vehicle or pass number' : 'Name, vehicle or pass number'} />
                {!gate && <ExportButton what="visitor log" />}
              </Toolbar>
              <div className="px-3 pt-3 pb-1"><Chips value={f} onChange={setF} options={[{ value: 'all', label: 'All' }, { value: 'In', label: 'In the building' }, { value: 'Out', label: 'Out' }, { value: 'Expired', label: 'Expired' }]} /></div>
              <DataList rows={rows} rowKey={(v) => v.pass} minWidth={860} onRow={(v) => setPass(v)} footer={`Showing ${rows.length} visitors · ${per.label} · ${fmtRange(per)}`}
                columns={[
                  { key: 'name', label: 'Visitor', render: (v) => <div className="flex items-center gap-3"><Avatar name={v.name} size={36} /><div className="min-w-0"><p className="font-semibold leading-tight">{v.name}</p><p className="text-[12px] text-ink3 tnum">{vph(v.phone)}{v.people > 1 ? ` · ${v.people} people` : ''}</p></div></div> },
                  { key: 'purpose', label: 'Purpose', render: (v) => <div><p className="text-[13.5px]">{v.purpose}</p>{v.note && <p className="text-[12px] text-ink3">{v.note}</p>}</div> },
                  { key: 'meet', label: 'To meet', render: (v) => <div><p className="text-[13.5px]">{v.meet}</p>{v.reply && v.status === 'In' && <p className={cx('text-[12px] font-semibold', { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad' }[REPLY_TONE[v.reply]])}>Replied: {v.reply}</p>}</div> },
                  { key: 'veh', label: 'Vehicle', nowrap: true, render: (v) => (v.vehicle ? <span className="font-mono text-[12.5px]">{v.vehicle}</span> : <span className="text-ink3">—</span>) },
                  { key: 'time', label: 'In / out', nowrap: true, render: (v) => <span className="tnum text-[13px]">{v.date !== 'Today' ? `${v.date}, ` : ''}{v.in} – {v.out || (v.status === 'Expired' ? '?' : 'now')}</span> },
                  { key: 'st', label: 'Status', render: (v) => <div><Pill tone={V_TONE[v.status]} dot={v.status === 'In'}>{v.status}</Pill><p className="text-[11.5px] text-ink3 font-mono mt-0.5">{v.pass}</p></div> },
                  { key: 'act', label: '', render: (v) => (canEdit && v.status !== 'Out' ? <Button size="sm" variant="secondary" icon={I.LogOut} onClick={(e) => { e.stopPropagation(); setOut(v); }}>Check out</Button> : null) },
                ]}
                mobile={(v) => ({ title: v.name, sub: `${v.purpose} · ${v.meet} · in ${v.in}${v.out ? `, out ${v.out}` : ''}`, avatar: v.name, pills: [<Pill key="s" tone={V_TONE[v.status]} className="!h-[22px] !text-[11.5px]">{v.status}</Pill>, v.reply && v.status === 'In' && <Pill key="r" tone={REPLY_TONE[v.reply]} className="!h-[22px] !text-[11.5px]">{v.reply}</Pill>, v.vehicle && <Pill key="v" className="!h-[22px] !text-[11.5px] font-mono">{v.vehicle}</Pill>].filter(Boolean) })}
                empty={<Empty icon={I.SearchX} title="No visitor matches" body={`Nobody matches ${fmtRange(per)}. Try the vehicle number or other dates.`} action={<Button variant="secondary" onClick={() => { setQ(''); setF('all'); setPer(PERIODS.last30); }}>Clear filters, last 30 days</Button>} />} />
            </Card>
            <Col>
              <Card>
                <CardHead title="This week" sub="Visitors by day" icon={I.ChartColumn} />
                <div className="px-3 pb-1"><Bars data={[['Mon', 14], ['Tue', 11], ['Wed', 18], ['Thu', 12], ['Fri', 9]].map(([k, v]) => ({ k, v, tone: k === 'Fri' ? 'brand' : undefined }))} height={140} max={20} ticks={[0, 10, 20]} ariaLabel="Visitors by day this week" /></div>
                <div className="px-5 pb-5 pt-2">
                  <p className="eyebrow text-ink3 mb-2.5">By purpose</p>
                  <HBars rows={[['Meeting', 24], ['Fee payment', 15], ['Admission', 9], ['Delivery', 8], ['Other', 8]].map(([k, v]) => ({ k, v, label: String(v) }))} max={30} labelWidth={92} />
                  <p className="text-[12.5px] text-ink3 mt-3">Average time inside: <b className="text-ink2">26 minutes</b></p>
                </div>
              </Card>
            </Col>
          </Split>
        ) : (
          <Card className="overflow-hidden">
            <CardHead title="Gate log" sub="Entries and exits at the main gate, with vehicle numbers and passes checked" action={<div className="flex gap-2">{canEdit && <Button size="sm" variant="soft" icon={I.Plus} onClick={() => setSheet('gate')}>Gate entry</Button>}{!gate && <ExportButton what="gate log" />}</div>} />
            <DataList rows={gateRows} rowKey={(g) => g.iso + g.t + g.who} minWidth={720} footer={`${gateRows.length} entries · ${per.label} · ${fmtRange(per)} · recorded by Bhaskar Rao`}
              empty={<Empty icon={I.Car} title="No gate entries in these dates" body={`Nothing was recorded at the gate ${fmtRange(per)}.`} action={<Button variant="secondary" onClick={() => setPer(PERIODS.last7)}>Last 7 days</Button>} />}
              columns={[
                { key: 't', label: 'Time', nowrap: true, render: (g) => <span className="tnum font-semibold">{g.day && g.day !== 'Today' ? `${g.day}, ` : ''}{g.t}</span> },
                { key: 'dir', label: 'In / out', render: (g) => <Pill tone={g.dir === 'In' ? 'info' : 'neutral'}>{g.dir === 'In' ? <I.LogIn size={13} /> : <I.LogOut size={13} />}{g.dir}</Pill> },
                { key: 'who', label: 'Person or vehicle', render: (g) => <span className="text-[13.5px] font-medium">{g.who}</span> },
                { key: 'veh', label: 'Vehicle no.', nowrap: true, render: (g) => (g.veh ? <span className="font-mono text-[12.5px]">{g.veh}</span> : <span className="text-ink3">—</span>) },
                { key: 'p', label: 'Purpose', render: (g) => <span className={cx('text-[13px]', g.pass ? 'text-ok font-semibold' : 'text-ink2')}>{g.purpose}</span> },
              ]}
              mobile={(g) => ({ title: g.who, sub: `${g.day && g.day !== 'Today' ? `${g.day}, ` : ''}${g.t} · ${g.purpose}`, icon: g.dir === 'In' ? 'LogIn' : 'LogOut', iconTone: g.dir === 'In' ? 'info' : 'neutral', pills: g.veh ? [<Pill key="v" className="!h-[22px] !text-[11.5px] font-mono">{g.veh}</Pill>] : null })} />
          </Card>
        )}
      </div>
      <VisitorSheet open={sheet === 'visitor'} gate={gate} onClose={() => setSheet(null)} onSaved={(v) => { setVisitors((x) => [v, ...x]); setPass(v); if (v.vehicle) setGateLog((x) => [{ t: '10:44 AM', dir: 'In', who: `Vehicle · ${v.name} (visitor ${v.pass})`, veh: v.vehicle, purpose: v.purpose, iso: TODAY_ISO, day: 'Today' }, ...x]); }}
        onEnquiry={(v) => { setVisitors((x) => [v, ...x]); setPass(v); toast({ title: gate ? 'Send them to the reception desk' : 'Open New enquiry from the Reception Desk', body: gate ? 'The desk takes admission enquiries.' : 'The enquiry goes to Admissions with an owner.', tone: 'info' }); }} />
      <PassSheet v={pass} onClose={() => setPass(null)} onCheckOut={(v) => { setPass(null); setOut(v); }} />
      <CheckOutSheet v={out} onClose={() => setOut(null)} onDone={checkOut} />
      <ScanSheet open={sheet === 'scan'} onClose={() => setSheet(null)} />
      <GateEntrySheet open={sheet === 'gate'} onClose={() => setSheet(null)} onSaved={(g) => { setGateLog((x) => [{ ...g, iso: TODAY_ISO, day: 'Today' }, ...x]); setView('gate'); }} />
    </div>
  );
}

function ScanSheet({ open, onClose }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  useEffect(() => { if (open) { setCode(''); setRes(null); } }, [open]);
  const check = (c) => {
    const k = (c || code).trim().toUpperCase();
    setCode(k); setBusy(true); setRes(null);
    setTimeout(() => {
      setBusy(false);
      const v = VISITORS.find((x) => x.pass === k);
      const p = PICKUPS.find((x) => x.gp === k);
      setRes(v ? { kind: 'visitor', v } : p ? { kind: 'pickup', p } : { kind: 'none', k });
    }, 600);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Check a pass" sub="Scan the QR on paper or on the visitor’s phone, or type the pass number.">
      <div className="flex flex-col gap-4">
        <div className="relative rounded-2xl bg-sunken/70 border border-dashed border-line h-32 grid place-items-center overflow-hidden">
          <span className={cx('absolute inset-x-6 h-0.5 bg-brand/70 rounded-full', busy ? 'top-1/2 animate-pulse' : 'top-6')} />
          <div className="flex flex-col items-center gap-1.5 text-ink3 text-[13px]"><I.ScanLine size={28} />{busy ? 'Reading…' : 'Hold the QR inside the frame'}</div>
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim()) check(); }}>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="V-0246 or GP-2026-0190" className="font-mono uppercase" aria-label="Pass number" />
          <Button type="submit" variant="primary" disabled={!code.trim()} loading={busy}>Check</Button>
        </form>
        <div className="flex gap-2 flex-wrap text-[12.5px]"><span className="text-ink3">Try:</span>{['V-0246', 'V-0229', 'GP-2026-0190'].map((c) => <button key={c} type="button" onClick={() => check(c)} className="font-mono h-7 px-2.5 rounded-lg bg-sunken hover:bg-line">{c}</button>)}</div>
        {res && <ScanResult res={res} onDone={onClose} />}
      </div>
    </Sheet>
  );
}

function ScanResult({ res, onDone }) {
  const toast = useToast();
  if (res.kind === 'none') return <div className="rounded-2xl bg-bad/10 p-4 flex gap-3 animate-rise"><I.ShieldX size={22} className="text-bad shrink-0" /><div><p className="font-semibold text-bad">No pass with number {res.k}</p><p className="text-[13.5px] text-ink2">Do not let them in. Send them to the reception desk to register.</p></div></div>;
  if (res.kind === 'visitor') {
    const v = res.v; const exp = v.status === 'Expired'; const out = v.status === 'Out';
    return (
      <div className={cx('rounded-2xl p-4 flex flex-col gap-3 animate-rise', exp || out ? 'bg-bad/10' : 'bg-ok/10')}>
        <div className="flex items-center gap-3">
          <Avatar name={v.name} size={52} />
          <div className="min-w-0 flex-1"><p className="font-semibold text-[15.5px]">{v.name}</p><p className="text-[13px] text-ink2">{v.purpose} · to meet {v.meet}</p></div>
          {exp ? <Pill tone="bad">Expired</Pill> : out ? <Pill tone="bad">Already out</Pill> : <Pill tone="ok" dot>Valid</Pill>}
        </div>
        <p className={cx('text-[14px] font-semibold flex items-center gap-2', exp || out ? 'text-bad' : 'text-ok')}>{exp ? <><I.ShieldX size={17} />Pass {v.pass} expired at {PASS_END} on {v.date}. Register the visitor again.</> : out ? <><I.ShieldX size={17} />Checked out at {v.out}. This pass no longer works.</> : <><I.ShieldCheck size={17} />Valid until {PASS_END} today.</>}</p>
        {!exp && !out && <Button variant="secondary" icon={I.LogOut} onClick={() => { onDone(); toast({ title: `${v.name} left at 10:44 AM`, body: `Gate log updated. Pass ${v.pass} closed.` }); }}>Record exit</Button>}
      </div>
    );
  }
  const p = res.p;
  return (
    <div className={cx('rounded-2xl p-4 flex flex-col gap-3 animate-rise', p.left ? 'bg-bad/10' : 'bg-ok/10')}>
      <p className="eyebrow text-ink3">Gate pass · Pickup · {p.gp}</p>
      <div className="grid grid-cols-2 gap-3">
        {[[p.student, `${p.cls} · student`], [p.by, `${p.rel} · on the pickup list`]].map(([n, s]) => <div key={n} className="flex items-center gap-2.5 min-w-0"><Avatar name={n} size={44} /><div className="min-w-0"><p className="font-semibold text-[14px] truncate">{n}</p><p className="text-[12px] text-ink3 truncate">{s}</p></div></div>)}
      </div>
      <p className={cx('text-[14px] font-semibold flex items-center gap-2', p.left ? 'text-bad' : 'text-ok')}>{p.left ? <><I.ShieldX size={17} />Already used at 10:21 AM.</> : <><I.ShieldCheck size={17} />Released at {p.time} by {p.released}. Match both faces with the photos.</>}</p>
      {!p.left && <Button variant="primary" icon={I.DoorOpen} onClick={() => { onDone(); toast({ title: `${p.student} left with ${p.by} at 10:44 AM`, body: 'Gate log updated. Class teacher told.' }); }}>Let them out</Button>}
    </div>
  );
}

function GateEntrySheet({ open, onClose, onSaved }) {
  const toast = useToast();
  const [kind, setKind] = useState('Vehicle');
  const [dir, setDir] = useState('In');
  const [who, setWho] = useState('');
  const [veh, setVeh] = useState('');
  const [why, setWhy] = useState('');
  const [tried, setTried] = useState(false);
  useEffect(() => { if (open) { setKind('Vehicle'); setDir('In'); setWho(''); setVeh(''); setWhy(''); setTried(false); } }, [open]);
  const vOk = /^[A-Z]{2}\s?\d{1,2}\s?[A-Z]{0,3}\s?\d{1,4}$/i.test(veh.trim());
  const needVeh = kind !== 'Person';
  const err = { who: !who.trim() && 'Who or what is it?', veh: needVeh && (!veh.trim() ? 'Enter the vehicle number' : !vOk ? 'This does not look like a vehicle number, like TS 08 EZ 4410' : '') };
  return (
    <FormSheet open={open} onClose={onClose} title="Gate entry" sub="Recorded with the time now: 10:44 AM" submitLabel={`Record ${dir.toLowerCase()}`}
      onSubmit={() => { setTried(true); if (err.who || err.veh) return false; onSaved({ t: '10:44 AM', dir, who: `${kind === 'Person' ? '' : `${kind} · `}${who.trim()}`, veh: veh.toUpperCase(), purpose: why.trim() || '—' }); toast({ title: `Gate ${dir.toLowerCase()} recorded`, body: `${who.trim()}${veh ? ` · ${veh.toUpperCase()}` : ''} at 10:44 AM` }); }}>
      <Field label="What"><Segmented value={kind} onChange={setKind} options={['Vehicle', 'School bus', 'Delivery', 'Person']} className="w-full" size="sm" /></Field>
      <Field label="In or out"><Segmented value={dir} onChange={setDir} options={[{ value: 'In', label: 'In', icon: I.LogIn }, { value: 'Out', label: 'Out', icon: I.LogOut }]} className="w-full" /></Field>
      <Field label={kind === 'Person' ? 'Name' : 'Driver or company'} required id="ge-who" error={tried && err.who}><Input id="ge-who" value={who} onChange={(e) => setWho(e.target.value)} placeholder={kind === 'School bus' ? 'Bus 4, Route 4 Miyapur' : 'For example: Blue Dart van'} error={tried && !!err.who} /></Field>
      {needVeh && <Field label="Vehicle number" required id="ge-veh" error={(tried || (veh && !vOk)) && err.veh}><Input id="ge-veh" value={veh} onChange={(e) => setVeh(e.target.value.toUpperCase())} className="font-mono" placeholder="TS 07 UB 2236" error={(tried || (!!veh && !vOk)) && !!err.veh} /></Field>}
      <Field label="Purpose" id="ge-why"><Input id="ge-why" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Optional" /></Field>
    </FormSheet>
  );
}

/* ======================= Student Pickup ======================= */
function PickupPage() {
  const toast = useToast();
  const { access } = usePage();
  const { role } = useRole();
  const canEdit = useCanEdit();
  const gate = access === 'own';
  const canRelease = canEdit && !gate;
  const seesPhones = useSeesPhones() || role.id === 'vp' || role.id === 'officestaff';
  const [q, setQ] = useState('');
  const [sid, setSid] = useState(FEATURED.id);
  const [list, setList] = useState([...PICKUPS, ...PICKUPS_OLD]);
  const [scan, setScan] = useState(false);
  const [per, setPer] = useState(PERIODS.today);
  const shown = list.filter((p) => (p.iso || TODAY_ISO) >= per.from && (p.iso || TODAY_ISO) <= per.to);
  const t = q.trim().toLowerCase();
  const res = t ? STUDENTS.filter((s) => s.name.toLowerCase().includes(t) || s.adm.toLowerCase().includes(t) || `${s.cls.replace('Class ', '')} ${s.sec}`.toLowerCase() === t).slice(0, 6) : [];
  const s = STUDENTS.find((x) => x.id === sid) || FEATURED;
  return (
    <div>
      <ModuleHead sub={gate ? 'At the gate: check the pickup gate pass and the photos before a child leaves' : 'Early pickup gate pass, only for people on the student’s approved pickup list'}
        actions={gate ? <Button variant="primary" icon={I.ScanLine} onClick={() => setScan(true)}>Check gate pass</Button> : null} />
      <Split side={380}>
        <Col>
          <Card className="p-4 @md:p-5">
            <label htmlFor="pk-search" className="text-[13px] font-semibold text-ink2">Find the student</label>
            <div className="flex gap-2 mt-1.5">
              <div className="relative flex-1 min-w-0">
                <I.Search size={20} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3" />
                <input id="pk-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, class like 7 B, or admission no." className={cx(inputCls(false), '!h-12 pl-11 !text-[16px]')} />
              </div>
              <Button variant="secondary" size="lg" icon={I.ScanLine} onClick={() => { setQ(''); setSid(FEATURED.id); toast({ title: 'ID card scanned', body: 'Aarav Sharma, 7 B', tone: 'info' }); }}><span className="hidden @sm:inline">Scan ID card</span></Button>
            </div>
            {t && (
              <ul className="mt-2 divide-y divide-line/70 animate-fade">
                {res.length === 0 && <li className="py-3 text-[13.5px] text-ink3">No student called “{q}”. Try the admission number.</li>}
                {[...new Map([...(FEATURED.name.toLowerCase().includes(t) ? [FEATURED] : []), ...res].map((x) => [x.id, x])).values()].map((x) => (
                  <li key={x.id}><button onClick={() => { setSid(x.id); setQ(''); }} className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-sunken/60 rounded-xl px-2"><Avatar name={x.name} size={38} /><span className="min-w-0 flex-1"><b className="font-semibold text-[14.5px] block truncate">{x.name}</b><span className="text-[12.5px] text-ink3">{x.cls} {x.sec}{gate ? '' : <> · Roll {x.roll} · <span className="font-mono">{x.adm}</span></>}</span></span><I.ChevronRight size={18} className="text-ink3" /></button></li>
                ))}
              </ul>
            )}
            {!t && <p className="text-[12.5px] text-ink3 mt-2">Try “{RESTRICTED.name.split(' ')[0]}” to see a guardian who is not allowed.</p>}
          </Card>
          <Release key={s.id} s={s} canRelease={canRelease} gate={gate} seesPhones={seesPhones} onReleased={(p) => setList((x) => [p, ...x])} />
        </Col>
        <Col>
          <Card>
            <CardHead title="Early pickups" sub={`${shown.length} ${shown.length === 1 ? 'student' : 'students'} · ${per.label} · ${fmtRange(per)}`} icon={I.DoorOpen} />
            <div className="px-5 pb-3"><DatePeriod id="pk-per" value={per} onChange={setPer} className="w-full @md:w-auto" /></div>
            {shown.length === 0 && <Empty icon={I.DoorOpen} title="No early pickups in these dates" body={`No child left early ${fmtRange(per)}.`} />}
            <ul className="px-2 pb-2">
              {shown.map((p) => (
                <li key={p.gp} className="px-3 py-2.5 rounded-xl hover:bg-sunken/60">
                  <div className="flex items-center gap-3">
                    <Avatar name={p.student} size={38} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[14.5px] truncate">{p.student} <span className="text-ink3 font-normal">· {p.cls}</span></p>
                      <p className="text-[12.5px] text-ink3 truncate">{p.day && p.day !== 'Today' ? `${p.day}, ` : ''}{p.time} · with {p.by} ({p.rel.toLowerCase()}) · {p.reason}</p>
                    </div>
                    <Pill tone={p.left ? 'ok' : 'warn'}>{p.left ? 'Left' : 'At gate'}</Pill>
                  </div>
                  <p className="text-[12px] text-ink3 mt-1 pl-[50px]"><span className="font-mono">{p.gp}</span> · released by {p.released} · {p.gate}</p>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-5">
            <p className="font-semibold text-[14.5px] flex items-center gap-2"><I.ShieldCheck size={17} className="text-brand" />How pickup stays safe</p>
            <ul className="mt-2.5 flex flex-col gap-2 text-[13.5px] text-ink2">
              <li className="flex gap-2"><I.Check size={16} className="text-ok shrink-0 mt-0.5" />Only people on the approved list can be chosen.</li>
              <li className="flex gap-2"><I.Check size={16} className="text-ok shrink-0 mt-0.5" />Photo match, and a code to the guardian’s phone.</li>
              <li className="flex gap-2"><I.Check size={16} className="text-ok shrink-0 mt-0.5" />The gate checks the pass before the child leaves.</li>
              <li className="flex gap-2"><I.Ban size={16} className="text-bad shrink-0 mt-0.5" />The list is changed only in Student Management, never at the desk or gate.</li>
            </ul>
          </Card>
        </Col>
      </Split>
      <ScanSheet open={scan} onClose={() => setScan(false)} />
    </div>
  );
}

function Release({ s, canRelease, gate, seesPhones, onReleased }) {
  const toast = useToast();
  const { role } = useRole();
  const list = pickupList(s);
  const [who, setWho] = useState(null);
  const [photo, setPhoto] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [reason, setReason] = useState('');
  const [other, setOther] = useState('');
  const [time, setTime] = useState('10:44 AM');
  const [stop, setStop] = useState(false);
  const [pass, setPass] = useState(null);
  const [busy, setBusy] = useState(false);
  const g = list.find((x) => x.name === who);
  const restricted = list.find((x) => x.restricted);
  const why = reason === 'Other' ? other.trim() : reason;
  const ready = g && photo && code.length === 4 && why;
  const sec = `${s.cls.replace('Class ', '')} ${s.sec}`;
  const release = () => {
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      const p = { gp: 'GP-2026-0191', student: s.name, cls: sec, by: g.name, rel: g.rel, time, reason: why, released: role.person.name, gate: 'Waiting at the gate', left: false };
      setPass(p); onReleased(p);
      toast({ title: `${s.first} released to ${g.name}`, body: `${ctOf(s)} told. Attendance from ${time}: half-day.` });
    }, 900);
  };
  return (
    <Card className="overflow-hidden">
      <div className="p-4 @md:p-5 flex items-center gap-4 border-b border-line">
        <Avatar name={s.name} size={64} />
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold text-[20px] leading-tight">{s.name}</p>
          <p className="text-[13px] text-ink3">{s.cls} {s.sec}{gate ? '' : <> · Roll {s.roll} · <span className="font-mono text-[12px]">{s.adm}</span></>}</p>
          <p className="text-[13px] text-ink3">Class teacher {ctOf(s)} · <span className="text-ok font-semibold">Present today</span></p>
        </div>
      </div>
      <div className="p-4 @md:p-5 flex flex-col gap-4">
        <div>
          <p className="text-[13px] font-semibold text-ink2 mb-2">{canRelease ? 'Who is collecting?' : 'Approved pickup list'} <span className="font-normal text-ink3">· from Student Management, Parents & Guardians</span></p>
          <div className="grid @sm:grid-cols-2 gap-2" role={canRelease ? 'radiogroup' : undefined}>
            {list.map((x) => {
              const on = who === x.name;
              const C = canRelease && !x.restricted ? 'button' : 'div';
              return (
                <C key={x.name} {...(C === 'button' ? { type: 'button', role: 'radio', 'aria-checked': on, onClick: () => { setWho(x.name); setPhoto(false); setCodeSent(false); setCode(''); } } : {})}
                  className={cx('text-left rounded-2xl border p-3 flex items-center gap-3 transition',
                    x.restricted ? 'border-bad/40 bg-bad/[.06]' : on ? 'border-brand ring-1 ring-brand bg-brand/[.05]' : 'border-line', C === 'button' && !on && 'hover:border-ink3/50')}>
                  <span className="relative"><Avatar name={x.name} size={48} />{x.restricted && <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-bad text-white grid place-items-center ring-2 ring-surface"><I.Ban size={13} /></span>}</span>
                  <span className="min-w-0 flex-1">
                    <span className={cx('block font-semibold text-[14.5px] truncate', x.restricted && 'text-bad')}>{x.name}</span>
                    <span className="block text-[12.5px] text-ink3">{x.rel} · <span className="tnum">{seesPhones ? x.phone : mask(x.phone)}</span></span>
                    {x.restricted && <span className="block text-[12px] text-bad font-semibold mt-0.5">Not allowed to collect</span>}
                  </span>
                  {on && <I.CircleCheck size={20} className="text-brand shrink-0" />}
                </C>
              );
            })}
          </div>
          {restricted && <p className="mt-2 text-[13px] text-bad flex gap-1.5"><I.TriangleAlert size={15} className="shrink-0 mt-0.5" />{restricted.restricted}</p>}
          {(canRelease || gate) && <button type="button" onClick={() => setStop(true)} className="mt-3 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-bad hover:underline"><I.UserX size={16} />Someone not on this list is here</button>}
        </div>

        {canRelease && g && (
          <div className="flex flex-col gap-4 border-t border-line pt-4 animate-rise">
            <div>
              <p className="text-[13px] font-semibold text-ink2 mb-2">Verify {g.name.split(' ')[0]} <span className="text-bad">*</span></p>
              <div className="rounded-xl border border-line p-3 flex items-center gap-3">
                <Avatar name={g.name} size={56} />
                <label className="flex-1 flex items-center gap-3 cursor-pointer">
                  <Checkbox checked={photo} onChange={setPhoto} label="Photo matches" />
                  <span className="text-[14px]"><b className="font-semibold block">The face matches this photo</b><span className="text-[12.5px] text-ink3">Look at the person, not only the ID</span></span>
                </label>
              </div>
              <div className="rounded-xl border border-line p-3 mt-2 flex flex-col @sm:flex-row @sm:items-center gap-3">
                <span className="text-[14px] flex-1"><b className="font-semibold block">Code to the guardian’s phone</b><span className="text-[12.5px] text-ink3">Switched on by the school. Sent to {mask(g.phone)}.</span></span>
                {!codeSent ? <Button type="button" variant="secondary" icon={I.Send} onClick={() => { setCodeSent(true); toast({ title: `Code sent to ${mask(g.phone)}`, body: 'Ask them to read out the 4 digits.', tone: 'info' }); }}>Send code</Button>
                  : <div className="flex items-center gap-2"><Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" placeholder="4 digits" className="!w-28 tnum text-center tracking-[.3em] font-semibold" aria-label="Code from the guardian" />{code.length === 4 && <I.CircleCheck size={20} className="text-ok" />}</div>}
              </div>
            </div>
            <Field label="Reason" required>
              <div className="flex flex-wrap gap-2">
                {['Doctor visit', 'Unwell', 'Family function', 'Exam or competition', 'Other'].map((r) => (
                  <button key={r} type="button" onClick={() => setReason(r)} className={cx('h-9 px-3.5 rounded-xl text-[13.5px] font-semibold border transition', reason === r ? 'bg-ink text-bg border-ink' : 'bg-surface border-line text-ink2 hover:border-ink3/50')}>{r}</button>
                ))}
              </div>
              {reason === 'Other' && <Input value={other} onChange={(e) => setOther(e.target.value)} placeholder="Type the reason" className="mt-2" aria-label="Other reason" />}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Time" required id="rl-time"><Input id="rl-time" value={time} onChange={(e) => setTime(e.target.value)} className="tnum" /></Field>
              <Field label="Released by"><Input value={role.person.name} readOnly className="bg-sunken/60" aria-label="Released by" /></Field>
            </div>
            <Button variant="primary" size="lg" className="w-full !h-14 !text-[16px]" icon={I.DoorOpen} disabled={!ready} loading={busy} onClick={release}>
              {busy ? 'Making gate pass…' : ready ? `Release ${s.first} and make gate pass` : !photo ? 'Check the photo first' : code.length !== 4 ? 'Enter the code from the guardian' : 'Choose a reason'}
            </Button>
          </div>
        )}
        {canRelease && !g && <p className="text-[13.5px] text-ink3 border-t border-line pt-4">Choose the person collecting {s.first}. Someone in red cannot be chosen.</p>}
        {gate && <Banner tone="info" title="At the gate:">a child leaves only with a pickup gate pass from the desk. Match both faces with these photos.</Banner>}
      </div>
      <StopSheet open={stop} onClose={() => setStop(false)} s={s} list={list.filter((x) => !x.restricted)} gate={gate} seesPhones={seesPhones} />
      <GatePassSheet p={pass} s={s} onClose={() => setPass(null)} />
    </Card>
  );
}

function StopSheet({ open, onClose, s, list, gate, seesPhones }) {
  const toast = useToast();
  const [name, setName] = useState('');
  useEffect(() => { if (open) setName(''); }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title="" >
      <div className="flex flex-col items-center text-center pt-4 gap-3">
        <span className="w-16 h-16 rounded-full bg-bad text-white grid place-items-center shadow-pop animate-pop"><I.Hand size={30} /></span>
        <h2 className="font-display text-[22px] font-semibold leading-tight">Do not release {s.first}</h2>
        <p className="text-[14.5px] text-ink2 max-w-sm">Not on {s.first}’s pickup list. Call a registered guardian, and tell the class teacher.</p>
      </div>
      <div className="flex flex-col gap-3 mt-5">
        <Field label="Who is here?" id="st-name" hint="Kept with the student’s record"><Input id="st-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name and relation, like Suresh, neighbour" /></Field>
        {gate ? (
          <Button variant="primary" icon={I.PhoneCall} onClick={() => { onClose(); toast({ title: 'Calling the front desk', body: 'Kavitha Nair, extension 101' }); }}>Call the front desk</Button>
        ) : list.map((x) => (
          <Button key={x.name} variant="secondary" icon={I.PhoneCall} className="w-full !justify-start" onClick={() => toast({ title: `Calling ${x.name}`, body: `${x.rel} · ${seesPhones ? x.phone : mask(x.phone)}` })}>Call {x.name} ({x.rel.toLowerCase()})</Button>
        ))}
        <Button variant="secondary" icon={I.Send} className="w-full !justify-start" onClick={() => { onClose(); toast({ title: `${ctOf(s)} told`, body: `${name.trim() || 'Someone not on the list'} came to collect ${s.name} at 10:44 AM. ${s.first} stays in class.` }); }}>Tell class teacher {ctOf(s)}</Button>
        <p className="text-[12.5px] text-ink3 text-center">Adding a person to the list is done in Student Management by someone allowed, never at the gate.</p>
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </div>
    </Sheet>
  );
}

function GatePassSheet({ p, s, onClose }) {
  const toast = useToast();
  if (!p) return null;
  return (
    <Sheet open={!!p} onClose={onClose} title={`Gate pass ${p.gp}`} sub="Kind: Pickup. Gate Security scans it before the child leaves.">
      <div className="flex flex-col items-center gap-4">
        <div className="w-full rounded-2xl border-2 border-line overflow-hidden">
          <div className="px-4 py-2.5 bg-brand/10 flex justify-between items-center"><span className="eyebrow text-brand">Pickup gate pass</span><span className="font-mono text-[12.5px] font-semibold">{p.gp}</span></div>
          <div className="grid grid-cols-2 gap-3 p-4">
            {[[p.student, `${p.cls} · student`], [p.by, `${p.rel} · collecting`]].map(([n, sub]) => <div key={n} className="flex items-center gap-2.5 min-w-0"><Avatar name={n} size={46} /><div className="min-w-0"><p className="font-semibold text-[14px] truncate">{n}</p><p className="text-[12px] text-ink3 truncate">{sub}</p></div></div>)}
          </div>
          <div className="px-4 pb-3 text-[13px] text-ink2 grid grid-cols-2 gap-x-3 gap-y-1">
            <span><span className="text-ink3">Time </span>{p.time}</span><span><span className="text-ink3">Reason </span>{p.reason}</span>
            <span><span className="text-ink3">Verified </span>photo, code</span><span><span className="text-ink3">By </span>{p.released}</span>
          </div>
          <div className="flex justify-center pb-4"><FakeQR size={130} /></div>
        </div>
        <div className="grid grid-cols-2 gap-2 w-full">
          <Button variant="secondary" icon={I.Printer} onClick={() => toast({ title: 'Sent to the desk printer', body: p.gp })}>Print</Button>
          <Button variant="secondary" icon={I.MessageCircle} onClick={() => toast({ title: `Pass sent to ${p.by}`, body: 'On WhatsApp, to show at the gate' })}>Send to phone</Button>
        </div>
        <Button variant="primary" className="w-full" onClick={onClose}>Done</Button>
      </div>
    </Sheet>
  );
}

/* ======================= Enquiries & Calls ======================= */
function EnquiriesPage() {
  const { go } = useNav();
  const toast = useToast();
  const { role } = useRole();
  const seesPhones = useSeesPhones();
  const canEdit = useCanEdit();
  const [view, setView] = useState('enq');
  const [calls, setCalls] = useState(CALLS);
  const [q, setQ] = useState('');
  const [pf, setPf] = useState('all');
  const [sheet, setSheet] = useState(null);
  const [fu, setFu] = useState(null);
  const [per, setPer] = useState(PERIODS.last7);
  const inPer = (iso) => iso >= per.from && iso <= per.to;
  const erows = ENQ.filter((e) => inPer(e.iso));
  const t = q.trim().toLowerCase();
  const ph = (p) => (seesPhones ? p : mask(p));
  const canAdm = !!role.access.admissions;
  const td = t.replace(/\D/g, '');
  const crows = calls.filter((c) => inPer(c.iso || TODAY_ISO) && (pf === 'all' || c.purpose === pf) && (!t || (c.name + c.who + c.note).toLowerCase().includes(t) || (seesPhones && td.length > 2 && digitsOf(c.phone).includes(td))));
  return (
    <div>
      <ModuleHead sub="Walk-in and phone enquiries go straight to Admission Management. Every call is logged."
        actions={<>
          <Button variant="secondary" icon={I.PhoneCall} onClick={() => setSheet('call')}>Log a call</Button>
          <Button variant="primary" icon={I.Plus} onClick={() => setSheet('enquiry')}>New enquiry</Button>
        </>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Stats items={[
          { label: 'Enquiries today', value: '3', sub: '2 walk-in, 1 phone', icon: 'UserPlus', onClick: () => { setView('enq'); setPer(PERIODS.today); } },
          { label: 'Calls today', value: String(calls.filter((c) => (c.iso || TODAY_ISO) === TODAY_ISO).length + 5), sub: `${calls.filter((c) => (c.iso || TODAY_ISO) === TODAY_ISO && c.dir === 'In').length + 4} incoming`, icon: 'Phone', onClick: () => { setView('calls'); setPer(PERIODS.today); } },
          { label: 'Follow-ups due today', value: '2', sub: 'Praveen Goud, Nitin Kulkarni', tone: 'warn', icon: 'BellRing' },
          { label: 'Complaints sent as queries', value: '1', sub: 'This week', icon: 'MessageSquare' },
        ]} />
        <div className="flex flex-col @md:flex-row @md:items-center gap-2.5">
          <Segmented value={view} onChange={setView} className="self-start" options={[{ value: 'enq', label: 'Enquiry register', icon: I.UserPlus }, { value: 'calls', label: 'Call log', icon: I.Phone }]} />
          <DatePeriod id="enq-per" value={per} onChange={setPer} className="w-full @md:w-auto" />
        </div>
        {view === 'enq' ? (
          <Card className="overflow-hidden">
            <CardHead title="Enquiries taken at the desk" sub="The same records as Admission Management, Enquiries" action={canAdm && <Button size="sm" variant="soft" icon={I.ExternalLink} onClick={() => go('admissions', { page: 'enquiries' })}>Open in Admissions</Button>} />
            <DataList rows={erows} rowKey={(e) => e.id} minWidth={820} footer={`${erows.length} ${erows.length === 1 ? 'enquiry' : 'enquiries'} · ${per.label} · ${fmtRange(per)} · owner and follow-up are set by Admissions`}
              empty={<Empty icon={I.UserPlus} title="No enquiries in these dates" body={`No enquiry was taken at the desk ${fmtRange(per)}.`} action={<Button variant="secondary" onClick={() => setPer(PERIODS.thismonth)}>This month</Button>} />}
              onRow={canAdm ? () => go('admissions', { page: 'enquiries' }) : undefined}
              columns={[
                { key: 'child', label: 'Child', render: (e) => <div><p className="font-semibold leading-tight">{e.child}</p><p className="text-[12px] text-ink3"><span className="font-mono">{e.id}</span> · {e.t}</p></div> },
                { key: 'parent', label: 'Parent', render: (e) => <div><p className="leading-tight">{e.parent}</p><p className="text-[12px] text-ink3 tnum">{ph(e.phone)}</p></div> },
                { key: 'cls', label: 'Class wanted', nowrap: true },
                { key: 'src', label: 'Source', render: (e) => <Pill tone={e.source === 'Phone' ? 'info' : 'brand'}>{e.source}</Pill> },
                { key: 'owner', label: 'Owner', render: (e) => <span className="text-[13.5px]">{e.owner}</span> },
                { key: 'next', label: 'Next follow-up', render: (e) => <span className={cx('text-[13px]', e.next.startsWith('Today') && 'text-warn font-semibold')}>{e.next}</span> },
              ]}
              mobile={(e) => ({ title: `${e.child} · ${e.cls}`, sub: `${e.parent} · ${e.t} · next ${e.next}`, avatar: e.child, pills: [<Pill key="s" tone={e.source === 'Phone' ? 'info' : 'brand'} className="!h-[22px] !text-[11.5px]">{e.source}</Pill>] })} />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <Toolbar>
              <SearchBox id="call-search" value={q} onChange={setQ} placeholder={seesPhones ? 'Name, phone or note' : 'Name or note'} />
              <Select value={pf} onChange={setPf} options={[{ value: 'all', label: 'All purposes' }, 'Admission enquiry', 'Fee', 'Transport', 'Complaint', 'Other']} className="@md:w-48" />
              <ExportButton what="call log" />
            </Toolbar>
            <DataList rows={crows} rowKey={(c) => c.id} minWidth={900} footer={`${crows.length} calls · ${per.label} · ${fmtRange(per)}${seesPhones ? '' : ' · parents’ numbers show only the last 4 digits, also in the export'}`}
              empty={<Empty icon={I.Phone} title="No calls match" body={`Nothing logged ${fmtRange(per)} with these filters.`} action={<Button variant="secondary" onClick={() => { setQ(''); setPf('all'); setPer(PERIODS.last30); }}>Clear filters, last 30 days</Button>} />}
              columns={[
                { key: 't', label: 'Time', nowrap: true, render: (c) => <span className="flex items-center gap-2 tnum text-[13.5px]"><span className={cx('w-7 h-7 rounded-lg grid place-items-center', c.dir === 'In' ? TONE_SOFT.info : TONE_SOFT.neutral)}>{c.dir === 'In' ? <I.PhoneIncoming size={14} /> : <I.PhoneOutgoing size={14} />}</span>{c.day && c.day !== 'Today' ? `${c.day}, ` : ''}{c.t}</span> },
                { key: 'name', label: 'Caller or person called', render: (c) => <div><p className="font-semibold leading-tight">{c.name}</p><p className="text-[12px] text-ink3">{c.who}</p></div> },
                { key: 'phone', label: 'Phone', nowrap: true, render: (c) => <span className="tnum text-[13.5px]">{c.parent ? ph(c.phone) : c.phone}</span> },
                { key: 'purpose', label: 'Purpose', render: (c) => <div className="max-w-[260px]"><p className="text-[13.5px] font-medium">{c.purpose}</p><p className="text-[12px] text-ink3">{c.note}</p></div> },
                { key: 'fu', label: 'Follow-up', render: (c) => (c.follow ? <span className="text-[13px] text-warn font-semibold">{c.follow}</span> : <span className="text-ink3">—</span>) },
                { key: 'st', label: 'Status', render: (c) => <Pill tone={c.status === 'Closed' ? 'neutral' : c.status === 'Follow-up' ? 'warn' : 'info'}>{c.status.startsWith('Sent') ? 'Sent as query' : c.status}</Pill> },
                { key: 'act', label: '', render: (c) => canEdit ? <MoreMenu size="sm" items={[['BellPlus', 'Set a follow-up', () => setFu(c)], ['PhoneOutgoing', 'Call back', () => toast({ title: `Calling ${c.name}`, body: c.parent ? ph(c.phone) : c.phone })], ['CircleCheck', 'Mark closed', () => setCalls((x) => x.map((y) => (y.id === c.id ? { ...y, status: 'Closed', follow: '' } : y)))]]} /> : null },
              ]}
              mobile={(c) => ({ title: c.name, sub: `${c.t} · ${c.purpose} · ${c.parent ? ph(c.phone) : c.phone}`, icon: c.dir === 'In' ? 'PhoneIncoming' : 'PhoneOutgoing', iconTone: c.dir === 'In' ? 'info' : 'neutral', pills: c.follow ? [<Pill key="f" tone="warn" className="!h-[22px] !text-[11.5px]">Follow-up: {c.follow.split(' · ')[0]}</Pill>] : null })} />
          </Card>
        )}
      </div>
      <EnquirySheet open={sheet === 'enquiry'} onClose={() => setSheet(null)} source="Walk-in" />
      <CallSheet open={sheet === 'call'} onClose={() => setSheet(null)} onSaved={(c) => { setCalls((x) => [{ ...c, iso: TODAY_ISO, day: 'Today' }, ...x]); setView('calls'); }} />
      <FollowUpSheet c={fu} onClose={() => setFu(null)} onSaved={(c, txt) => setCalls((x) => x.map((y) => (y.id === c.id ? { ...y, follow: txt, status: 'Follow-up' } : y)))} />
    </div>
  );
}

function FollowUpSheet({ c, onClose, onSaved }) {
  const toast = useToast();
  const [d, setD] = useState('10-10-2026');
  const [tm, setTm] = useState('11:00 AM');
  const [who, setWho] = useState('Kavitha Nair');
  useEffect(() => { if (c) { setD('10-10-2026'); setTm('11:00 AM'); setWho(c.purpose === 'Fee' ? 'Suresh Babu' : c.purpose === 'Admission enquiry' ? 'Divya Menon' : 'Kavitha Nair'); } }, [c]);
  if (!c) return null;
  return (
    <FormSheet open={!!c} onClose={onClose} title={`Follow-up: ${c.name}`} sub={c.note} submitLabel="Set reminder"
      onSubmit={() => { onSaved(c, `${d.slice(0, 5).replace('-', '/')} ${tm} · ${who}`); toast({ title: `Reminder for ${who}`, body: `${d} at ${tm}: call ${c.name} back.` }); }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" required id="fu-d" hint="DD-MM-YYYY"><Input id="fu-d" value={d} onChange={(e) => setD(e.target.value)} className="tnum" /></Field>
        <Field label="Time" required id="fu-t"><Input id="fu-t" value={tm} onChange={(e) => setTm(e.target.value)} className="tnum" /></Field>
      </div>
      <Field label="Who follows up" required id="fu-w"><Select id="fu-w" value={who} onChange={setWho} options={['Kavitha Nair', ...MEET.map((m) => m.name)]} /></Field>
    </FormSheet>
  );
}

/* ======================= Appointments ======================= */
const toMin = (s) => { const [hm, ap] = s.split(' '); let [h, m] = hm.split(':').map(Number); if (ap === 'PM' && h !== 12) h += 12; return h * 60 + m; };
const fmt = (m) => { let h = Math.floor(m / 60); const mm = m % 60; const ap = h >= 12 ? 'PM' : 'AM'; if (h > 12) h -= 12; return `${h}:${String(mm).padStart(2, '0')} ${ap}`; };
const STAFF_CAL = [
  { name: 'Lakshmi Rao', role: 'Principal' }, { name: 'Srinivas Murthy', role: 'Vice Principal' }, { name: 'Suresh Babu', role: 'Accountant' },
  { name: 'Ravi Teja', role: 'Class Teacher 7 B' }, { name: 'Anitha Kumari', role: 'PGT English' },
];
function scheduleFor(name, day) {
  if (name === 'Anitha Kumari' && day === 'today') return [{ s: '9:00 AM', e: '3:30 PM', kind: 'leave', label: 'On leave today (sick leave)' }];
  if (day === 'sat') {
    const segs = [{ s: '9:00 AM', e: '11:00 AM', kind: 'free' }, { s: '11:00 AM', e: '11:30 AM', kind: 'busy', label: 'Admit card distribution check' }, { s: '11:30 AM', e: '12:30 PM', kind: 'free' }];
    return name === 'Lakshmi Rao' ? [{ s: '9:00 AM', e: '9:30 AM', kind: 'booked', label: 'Swathi Varma · School visit for Myra (Nursery)', status: 'Booked' }, { s: '9:30 AM', e: '11:00 AM', kind: 'free' }, ...segs.slice(1)] : segs;
  }
  if (day === 'mon') return [{ s: '9:00 AM', e: '12:00 PM', kind: 'busy', label: 'Half-yearly exams: rounds of exam halls' }, { s: '12:00 PM', e: '1:00 PM', kind: 'free' }, { s: '2:00 PM', e: '3:30 PM', kind: 'free' }];
  const mine = APPTS_TODAY.filter((a) => a.with === name).map((a) => ({ s: a.t, e: fmt(toMin(a.t) + a.len), kind: a.id === 'AP3' ? 'now' : a.status === 'No-show' ? 'noshow' : a.status === 'Done' ? 'done' : 'booked', label: `${a.visitor} · ${a.purpose}`, status: a.status }));
  const fixed = {
    'Lakshmi Rao': [{ s: '9:00 AM', e: '9:45 AM', kind: 'busy', label: 'Assembly and school rounds' }, { s: '12:00 PM', e: '12:40 PM', kind: 'busy', label: 'Exam committee meeting' }, { s: '12:40 PM', e: '1:30 PM', kind: 'busy', label: 'Lunch' }],
    'Srinivas Murthy': [{ s: '9:45 AM', e: '10:30 AM', kind: 'busy', label: 'Substitution planning' }, { s: '12:40 PM', e: '1:30 PM', kind: 'busy', label: 'Lunch' }],
    'Suresh Babu': [{ s: '9:00 AM', e: '12:00 PM', kind: 'busy', label: 'Fee counter open (Q3 due tomorrow)' }, { s: '12:40 PM', e: '1:30 PM', kind: 'busy', label: 'Lunch' }],
    'Ravi Teja': [{ s: '8:45 AM', e: '9:30 AM', kind: 'teach', label: 'Teaching 7 B · Science' }, { s: '10:30 AM', e: '11:15 AM', kind: 'teach', label: 'Teaching 7 B · Science' }, { s: '11:15 AM', e: '12:00 PM', kind: 'teach', label: 'Teaching 8 B · Science' }, { s: '12:40 PM', e: '1:25 PM', kind: 'teach', label: 'Teaching 7 A · Science' }, { s: '2:20 PM', e: '3:05 PM', kind: 'teach', label: 'Teaching 7 B · Science' }],
  }[name] || [];
  const taken = [...mine, ...fixed].sort((a, b) => toMin(a.s) - toMin(b.s));
  // fill gaps between 9:00 and 3:30 as free
  const out = []; let cur = toMin('9:00 AM'); const end = toMin('3:30 PM');
  taken.forEach((t) => { const a = Math.max(toMin(t.s), toMin('9:00 AM')); if (a > cur) out.push({ s: fmt(cur), e: fmt(a), kind: 'free' }); out.push(t); cur = Math.max(cur, toMin(t.e)); });
  if (cur < end) out.push({ s: fmt(cur), e: fmt(end), kind: 'free' });
  return out.filter((x) => !(x.kind === 'free' && toMin(x.s) >= toMin('1:25 PM') && toMin(x.e) <= toMin('2:00 PM')));
}
const SEG = {
  free: 'border border-dashed border-line text-ink3',
  busy: 'bg-sunken text-ink2', teach: 'bg-sunken text-ink2', leave: 'bg-bad/10 text-bad',
  booked: 'bg-info/10 text-info', now: 'bg-brand/12 text-brand ring-1 ring-brand', done: 'bg-ok/10 text-ok', noshow: 'bg-bad/[.07] text-bad',
};

function AppointmentsPage() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const [who, setWho] = useState('Lakshmi Rao');
  const [day, setDay] = useState('today');
  const [list, setList] = useState(APPTS);
  const [book, setBook] = useState(null);
  const [per, setPer] = useState(PERIODS.today);
  const shown = list.filter((a) => (a.iso || '2026-10-09') >= per.from && (a.iso || '2026-10-09') <= per.to);
  const segs = scheduleFor(who, day);
  const setStatus = (a, st) => {
    setList((x) => x.map((y) => (y.id === a.id ? { ...y, status: st } : y)));
    toast({ title: `${a.visitor}: ${st.toLowerCase()}`, body: st === 'Arrived' ? `Visitor entry made with the details filled. ${a.with} told.` : st === 'Cancelled' ? 'A message went to the visitor.' : 'Saved.', undo: () => setList((x) => x.map((y) => (y.id === a.id ? a : y))) });
  };
  const nowFirst = [...shown].sort((a, b) => (a.iso || '').localeCompare(b.iso || '') || ({ Arrived: 0, Booked: 1, Done: 2, 'No-show': 3, Cancelled: 4 }[a.status] - { Arrived: 0, Booked: 1, Done: 2, 'No-show': 3, Cancelled: 4 }[b.status]) || toMin(a.t) - toMin(b.t));
  return (
    <div>
      <ModuleHead sub="Meetings with the Principal and staff. Booked, leave and teaching times cannot be chosen."
        actions={<Button variant="primary" icon={I.CalendarPlus} onClick={() => setBook({ who, slot: '' })}>Book appointment</Button>} />
      <Split side={380}>
        <Card className="overflow-hidden">
          <div className="p-3 flex flex-col gap-3 border-b border-line">
            <Chips value={who} onChange={setWho} options={STAFF_CAL.map((x) => ({ value: x.name, label: x.name }))} />
            <div className="flex items-center gap-3 flex-wrap">
              <Segmented value={day} onChange={setDay} options={[{ value: 'today', label: 'Today, Fri 9' }, { value: 'sat', label: 'Sat 10' }, { value: 'mon', label: 'Mon 12' }]} size="sm" />
              <span className="text-[12.5px] text-ink3">{STAFF_CAL.find((x) => x.name === who).role} · 15-minute slots</span>
            </div>
          </div>
          <ol className="p-3 @md:p-4 flex flex-col gap-1.5">
            {segs.map((x, i) => {
              const slots = x.kind === 'free' ? Array.from({ length: Math.floor((toMin(x.e) - toMin(x.s)) / 15) }, (_, k) => fmt(toMin(x.s) + k * 15)) : [];
              return (
                <li key={i} className="grid grid-cols-[64px_1fr] gap-3 items-start">
                  <span className="text-[12.5px] font-semibold text-ink3 tnum pt-2.5">{x.s}</span>
                  {x.kind === 'free' ? (
                    <div className="flex flex-wrap gap-1.5 py-1">
                      {slots.map((sl) => (
                        <button key={sl} disabled={!canEdit} onClick={() => setBook({ who, slot: sl })} className={cx('h-9 px-3 rounded-lg text-[12.5px] font-semibold tnum transition', SEG.free, canEdit && 'hover:border-brand hover:text-brand hover:bg-brand/5')}>
                          {sl.replace(' AM', '').replace(' PM', '')} <span className="font-normal">free</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className={cx('rounded-xl px-3.5 py-2.5 flex items-center gap-2', SEG[x.kind], x.kind === 'teach' && 'bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,rgb(var(--line)/.6)_6px,rgb(var(--line)/.6)_8px)]')}>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-semibold leading-snug">{x.label}</p>
                        <p className="text-[12px] opacity-80 tnum">{x.s} – {x.e}{x.kind === 'teach' ? ' · from the Time Table' : ''}</p>
                      </div>
                      {x.kind === 'now' && <Pill tone="brand" dot>In progress</Pill>}
                      {x.status && x.kind !== 'now' && <Pill tone={AP_TONE[x.status]}>{x.status}</Pill>}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </Card>
        <Col>
          <Card>
            <CardHead title="Appointments" sub={`${shown.length} · ${per.label} · ${fmtRange(per)}`} icon={I.CalendarClock} action={<ExportButton what="appointments" />} />
            <div className="px-5 pb-3"><DatePeriod id="ap-per" value={per} onChange={setPer} future className="w-full @md:w-auto" /></div>
            {shown.length === 0 && <Empty icon={I.CalendarClock} title="No appointments in these dates" body={`Nothing booked ${fmtRange(per)}.`} action={<Button variant="secondary" onClick={() => setPer(PERIODS.next30)}>Next 30 days</Button>} />}
            <ul className="px-2 pb-2">
              {nowFirst.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/60">
                  <span className="w-14 shrink-0 text-[13px] font-semibold tnum">{a.t.replace(' AM', '').replace(' PM', '')}<span className="block text-[11px] text-ink3 font-medium">{a.t.slice(-2)} · {a.len}m</span>{a.day && a.day !== 'Today' && <span className="block text-[11px] text-ink3 font-medium">{a.day}</span>}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[14px] truncate">{a.visitor}</p>
                    <p className="text-[12.5px] text-ink3 truncate">With {a.with} · {a.purpose}</p>
                    <Pill tone={AP_TONE[a.status]} className="!h-5 !text-[11px] mt-1">{a.status}</Pill>
                  </div>
                  {canEdit && <MoreMenu size="sm" label={`Actions for ${a.visitor}`} items={[
                    ['UserCheck', 'Mark arrived', () => setStatus(a, 'Arrived')], ['CircleCheck', 'Mark done', () => setStatus(a, 'Done')], ['UserX', 'Mark no-show', () => setStatus(a, 'No-show')],
                    ['CalendarClock', 'Reschedule', () => setBook({ who: a.with, slot: '', re: a })], ['MessageCircle', 'Send reminder', () => toast({ title: `Reminder sent to ${a.visitor}`, body: `${a.t} with ${a.with} · WhatsApp` })],
                    ['X', 'Cancel', () => setStatus(a, 'Cancelled'), 'bad'],
                  ]} />}
                </li>
              ))}
            </ul>
          </Card>
        </Col>
      </Split>
      <BookSheet b={book} onClose={() => setBook(null)} onBooked={(a) => setList((x) => (book?.re ? x.map((y) => (y.id === book.re.id ? { ...y, t: a.t, iso: a.iso, day: a.day } : y)) : [...x, a]))} />
    </div>
  );
}

function BookSheet({ b, onClose, onBooked }) {
  const toast = useToast();
  const [who, setWho] = useState('Lakshmi Rao');
  const [date, setDate] = useState('09-10-2026');
  const [slot, setSlot] = useState('');
  const [len, setLen] = useState('15');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [confirm, setConfirm] = useState(true);
  const [clash, setClash] = useState('');
  const [tried, setTried] = useState(false);
  useEffect(() => { if (b) { setWho(b.who); setSlot(b.slot); setLen(b.re ? String(b.re.len) : '15'); setPhone(b.re?.phone || ''); setName(b.re?.visitor || ''); setPurpose(b.re?.purpose || ''); setConfirm(true); setClash(''); setTried(false); setDate('09-10-2026'); } }, [b]);
  if (!b) return null;
  const day = date === '10-10-2026' ? 'sat' : date === '12-10-2026' ? 'mon' : 'today';
  const segs = scheduleFor(who, day);
  const free = segs.filter((x) => x.kind === 'free').flatMap((x) => Array.from({ length: Math.floor((toMin(x.e) - toMin(x.s)) / 15) }, (_, k) => fmt(toMin(x.s) + k * 15)));
  const taken = segs.filter((x) => x.kind !== 'free').map((x) => x).slice(0, 6);
  const known = KNOWN_PHONES[digitsOf(phone)];
  const err = { slot: !slot && 'Pick a free slot', phone: phoneErr(phone), name: !name.trim() && 'Enter the visitor’s name', purpose: !purpose.trim() && 'What is the meeting about?' };
  return (
    <FormSheet open={!!b} onClose={onClose} title={b.re ? `Reschedule ${b.re.visitor}` : 'Book appointment'} sub="Only free slots can be picked. The server checks again before saving." submitLabel={b.re ? 'Reschedule' : 'Book'} wide
      onSubmit={() => {
        setTried(true); if (Object.values(err).some(Boolean)) return false;
        onBooked({ id: 'AP' + Date.now(), t: slot, len: Number(len), visitor: name.trim(), phone, with: who, purpose: purpose.trim(), status: 'Booked', iso: `2026-10-${date.slice(0, 2)}`, day: date === '09-10-2026' ? 'Today' : date === '10-10-2026' ? 'Sat 10 Oct' : 'Mon 12 Oct' });
        toast({ title: `${b.re ? 'Moved' : 'Booked'}: ${name.trim()} with ${who}`, body: `${date === '09-10-2026' ? 'Today' : date}, ${slot} for ${len} minutes.${confirm ? ' Confirmation sent on WhatsApp.' : ''}` });
      }}>
      <div className="grid @sm:grid-cols-2 gap-3">
        <Field label="With" required id="bk-who"><Select id="bk-who" value={who} onChange={(v) => { setWho(v); setSlot(''); setClash(''); }} options={STAFF_CAL.map((x) => ({ value: x.name, label: `${x.name} · ${x.role}` }))} /></Field>
        <Field label="Date" required id="bk-date"><Select id="bk-date" value={date} onChange={(v) => { setDate(v); setSlot(''); setClash(''); }} options={[{ value: '09-10-2026', label: 'Today, 09-10-2026' }, { value: '10-10-2026', label: 'Sat, 10-10-2026' }, { value: '12-10-2026', label: 'Mon, 12-10-2026' }]} /></Field>
      </div>
      <Field label="Time" required error={(tried && err.slot) || clash}>
        {free.length === 0 ? <p className="text-[13.5px] text-bad">{who} has no free slot on this day{segs[0]?.kind === 'leave' ? ' (on leave)' : ''}. Pick another day or person.</p> : (
          <div className="flex flex-wrap gap-1.5">
            {free.map((sl) => <button type="button" key={sl} onClick={() => { setSlot(sl); setClash(''); }} className={cx('h-9 px-3 rounded-lg text-[12.5px] font-semibold tnum border transition', slot === sl ? 'bg-brand text-brandink border-brand' : 'border-line text-ink2 hover:border-brand hover:text-brand')}>{sl}</button>)}
            {taken.filter((x) => x.kind !== 'leave').map((x) => <button type="button" key={x.s + x.label} onClick={() => { setSlot(''); setClash(`${who} already has ${x.kind === 'teach' ? 'a class' : 'a meeting'} at ${x.s}. Pick another slot.`); }} className="h-9 px-3 rounded-lg text-[12.5px] font-semibold tnum bg-sunken text-ink3 line-through" title={x.label}>{x.s}</button>)}
          </div>
        )}
      </Field>
      <Field label="Length" required><Segmented value={len} onChange={setLen} options={[{ value: '15', label: '15 min' }, { value: '30', label: '30 min' }, { value: '45', label: '45 min' }]} className="w-full" /></Field>
      <div className="grid @sm:grid-cols-2 gap-3">
        <Field label="Visitor phone" required id="bk-phone" error={tried && err.phone}><PhoneInput id="bk-phone" value={phone} onChange={(v) => { setPhone(v); const k = KNOWN_PHONES[digitsOf(v)]; if (k) setName(k.name); }} error={tried && !!err.phone} /></Field>
        <Field label="Visitor name" required id="bk-name" error={tried && err.name}><Input id="bk-name" value={name} onChange={(e) => setName(e.target.value)} error={tried && !!err.name} /></Field>
      </div>
      {known && <p className="text-[13px] text-ok -mt-2 flex items-center gap-1.5"><I.UserCheck size={15} />{known.who}</p>}
      <Field label="Purpose" required id="bk-purpose" error={tried && err.purpose}><Input id="bk-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="For example: TC for transfer to Bengaluru" error={tried && !!err.purpose} /></Field>
      <div className="rounded-xl bg-sunken/70 p-3.5 flex items-center gap-3">
        <Switch id="bk-conf" on={confirm} onChange={setConfirm} label="Send confirmation" />
        <label htmlFor="bk-conf" className="text-[14px]"><b className="font-semibold">Send confirmation to the visitor</b><span className="block text-[12.5px] text-ink3">WhatsApp, with SMS backup</span></label>
      </div>
    </FormSheet>
  );
}

/* ======================= Postal & Deliveries ======================= */
function PostalPage() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const [rows0, setRows] = useState(POSTAL);
  const [f, setF] = useState('all');
  const [q, setQ] = useState('');
  const [sheet, setSheet] = useState(null);
  const [hand, setHand] = useState(null);
  const [per, setPer] = useState(PERIODS.last7);
  const t = q.trim().toLowerCase();
  // Items still at the desk show while the dates include today
  const rows = rows0.filter((r) => ((r.iso || TODAY_ISO) >= per.from && (r.iso || TODAY_ISO) <= per.to || (r.status === 'At desk' && per.to >= TODAY_ISO)) && (f === 'all' || r.status === f) && (!t || (r.party + r.for + r.track + r.id + r.courier).toLowerCase().includes(t)));
  const atDesk = rows0.filter((r) => r.status === 'At desk');
  return (
    <div>
      <ModuleHead sub="Letters, couriers and parcels received and sent. The person it is for is told on the app."
        actions={<>
          <Button variant="secondary" icon={I.Send} onClick={() => setSheet('sent')}>Record sent item</Button>
          <Button variant="primary" icon={I.PackagePlus} onClick={() => setSheet('received')}>Record received item</Button>
        </>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Stats items={[
          { label: 'At the desk', value: String(atDesk.length), sub: 'Oldest since 6 Oct', tone: 'warn', icon: 'Inbox', onClick: () => setF('At desk') },
          { label: 'Received today', value: '2', sub: 'CBSE letter, OUP parcel', icon: 'PackageCheck' },
          { label: 'Sent this week', value: String(rows0.filter((r) => r.dir === 'Sent').length), sub: 'Speed Post and DTDC', icon: 'Send', onClick: () => setF('Sent') },
          { label: 'Handed over this week', value: '9', sub: 'With who collected', tone: 'ok', icon: 'CircleCheck', onClick: () => setF('Handed over') },
        ]} />
        <Card className="overflow-hidden">
          <Toolbar>
            <SearchBox id="pd-search" value={q} onChange={setQ} placeholder="From, to, person or tracking number" />
            <DatePeriod id="pd-per" value={per} onChange={setPer} className="w-full @md:w-auto" />
            <ExportButton what="postal register" />
          </Toolbar>
          <div className="px-3 pt-3 pb-1"><Chips value={f} onChange={setF} options={[{ value: 'all', label: 'All', count: rows0.length }, { value: 'At desk', label: 'At desk', count: atDesk.length }, { value: 'Handed over', label: 'Handed over' }, { value: 'Sent', label: 'Sent' }]} /></div>
          <DataList rows={rows} rowKey={(r) => r.id} minWidth={900} footer={`Showing ${rows.length} · ${per.label} · ${fmtRange(per)} · 214 entries this year`}
            empty={<Empty icon={I.Inbox} title="Nothing in these dates" body={`No letters, couriers or parcels ${fmtRange(per)}.`} action={<Button variant="secondary" onClick={() => { setPer(PERIODS.last30); setF('all'); setQ(''); }}>Last 30 days</Button>} />}
            columns={[
              { key: 'd', label: 'Date', nowrap: true, render: (r) => <div><p className="text-[13px] tnum">{r.d}</p><p className="text-[11.5px] text-ink3 font-mono">{r.id}</p></div> },
              { key: 'dir', label: 'Received or sent', render: (r) => <span className="flex items-center gap-2"><span className={cx('w-8 h-8 rounded-lg grid place-items-center', r.dir === 'Received' ? TONE_SOFT.brand : TONE_SOFT.info)}>{r.dir === 'Received' ? <I.ArrowDownToLine size={15} /> : <I.ArrowUpFromLine size={15} />}</span><span className="text-[13.5px]">{r.dir}<span className="block text-[12px] text-ink3">{r.type}</span></span></span> },
              { key: 'party', label: 'From or to', render: (r) => <span className="text-[13.5px] font-medium">{r.party}</span> },
              { key: 'for', label: 'For', render: (r) => <span className="text-[13.5px]">{r.for}</span> },
              { key: 'track', label: 'Courier and tracking', render: (r) => <div><p className="text-[13px]">{r.courier}</p>{r.track && <p className="text-[12px] text-ink3 font-mono">{r.track}</p>}</div> },
              { key: 'st', label: 'Status', render: (r) => <div><Pill tone={PD_TONE[r.status]}>{r.status}</Pill>{r.who && <p className="text-[11.5px] text-ink3 mt-1">{r.who}</p>}</div> },
              { key: 'act', label: '', render: (r) => (canEdit && r.status === 'At desk' ? <Button size="sm" variant="secondary" icon={I.HandHelping} onClick={() => setHand(r)}>Hand over</Button> : null) },
            ]}
            mobile={(r) => ({ title: r.party, sub: `${r.dir} · ${r.type} · for ${r.for}`, icon: r.dir === 'Received' ? 'ArrowDownToLine' : 'ArrowUpFromLine', iconTone: r.status === 'At desk' ? 'warn' : 'neutral', pills: [<Pill key="s" tone={PD_TONE[r.status]} className="!h-[22px] !text-[11.5px]">{r.status}</Pill>] })}
            onRow={canEdit ? (r) => (r.status === 'At desk' ? setHand(r) : toast({ title: `${r.id} · ${r.status}`, body: `${r.courier}${r.track ? ` ${r.track}` : ''}${r.who ? ` · ${r.who}` : ''}`, tone: 'info' })) : undefined} />
        </Card>
      </div>
      <PostalSheet open={!!sheet} kind={sheet} onClose={() => setSheet(null)} onSaved={(r) => setRows((x) => [r, ...x])} />
      <HandSheet r={hand} onClose={() => setHand(null)} onDone={(r, who) => { setRows((x) => x.map((y) => (y.id === r.id ? { ...y, status: 'Handed over', who: `${who}, 10:44 AM` } : y))); toast({ title: `Handed over to ${who}`, body: `${r.type} from ${r.party}`, undo: () => setRows((x) => x.map((y) => (y.id === r.id ? r : y))) }); }} />
    </div>
  );
}

function HandSheet({ r, onClose, onDone }) {
  const [who, setWho] = useState('');
  useEffect(() => { if (r) setWho(r.for.includes('·') ? r.for.split(' · ')[1] : r.for.split(' (')[0]); }, [r]);
  if (!r) return null;
  return (
    <ConfirmSheet open={!!r} onClose={onClose} title={`Hand over: ${r.type.toLowerCase()} from ${r.party}`} sub={`For ${r.for}. Record who collected it.`} confirmLabel={`Hand over to ${who || '…'}`} onConfirm={() => onDone(r, who)}>
      <Field label="Collected by" id="ho-who"><Select id="ho-who" value={who} onChange={setWho} options={[...new Set([who, 'Lakshmi Rao', 'Anita Sharma', 'Suresh Babu', 'Ramu Yadav', 'Padma Iyer', 'Naveen Kumar'])].filter(Boolean)} /></Field>
    </ConfirmSheet>
  );
}

function PostalSheet({ open, kind, onClose, onSaved }) {
  const toast = useToast();
  const [type, setType] = useState('Courier');
  const [party, setParty] = useState('');
  const [forWho, setFor] = useState('');
  const [courier, setCourier] = useState('');
  const [track, setTrack] = useState('');
  const [photo, setPhoto] = useState(false);
  const [notify, setNotify] = useState(true);
  const [tried, setTried] = useState(false);
  useEffect(() => { if (open) { setType(kind === 'sent' ? 'Letter' : 'Courier'); setParty(''); setFor(''); setCourier(''); setTrack(''); setPhoto(false); setNotify(true); setTried(false); } }, [open, kind]);
  const rec = kind !== 'sent';
  const err = { party: !party.trim() && (rec ? 'Who is it from?' : 'Who is it going to?'), for: !forWho && (rec ? 'Choose the staff member or department' : 'Choose who is sending it') };
  return (
    <FormSheet open={open} onClose={onClose} title={rec ? 'Record received item' : 'Record sent item'} sub={rec ? 'The person it is for is told on the app.' : 'Keep the tracking number for later.'} submitLabel="Save"
      onSubmit={() => {
        setTried(true); if (err.party || err.for) return false;
        onSaved({ id: 'PD-2026-0319', d: '9 Oct, 10:44 AM', dir: rec ? 'Received' : 'Sent', type, party: party.trim(), for: forWho, courier: courier || (rec ? 'Hand delivery' : 'Speed Post'), track: track.trim(), status: rec ? 'At desk' : 'Sent' });
        toast({ title: rec ? `${type} from ${party.trim()} at the desk` : `${type} to ${party.trim()} recorded`, body: rec && notify ? `${forWho} told on the app.` : `Entry PD-2026-0319.` });
      }}>
      <Field label="Type" required><Segmented value={type} onChange={setType} options={['Letter', 'Courier', 'Parcel']} className="w-full" /></Field>
      <Field label={rec ? 'From' : 'To'} required id="pd-party" error={tried && err.party}><Input id="pd-party" value={party} onChange={(e) => setParty(e.target.value)} placeholder={rec ? 'For example: CBSE Regional Office, Chennai' : 'For example: District Educational Officer, Medchal'} error={tried && !!err.party} /></Field>
      <Field label={rec ? 'For' : 'From'} required id="pd-for" error={tried && err.for}><Select id="pd-for" value={forWho} onChange={setFor} error={tried && !!err.for} options={[{ value: '', label: 'Choose staff or department' }, 'Lakshmi Rao (Principal)', 'Office · Anita Sharma', 'Accounts · Suresh Babu', 'Stores · Ramu Yadav', 'Library · Padma Iyer', 'Exams · Prakash Joshi', 'Transport · Venkatesh Goud']} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Courier" id="pd-courier"><Select id="pd-courier" value={courier} onChange={setCourier} options={[{ value: '', label: 'Choose' }, 'Speed Post', 'India Post', 'Blue Dart', 'DTDC', 'Delhivery', 'Professional Couriers', 'Hand delivery']} /></Field>
        <Field label="Tracking number" id="pd-track"><Input id="pd-track" value={track} onChange={(e) => setTrack(e.target.value.toUpperCase())} className="font-mono" placeholder="EK419277833IN" /></Field>
      </div>
      {rec && <Field label="Photo" hint="Optional"><Button type="button" variant="secondary" icon={photo ? I.CircleCheck : I.Camera} className="self-start" onClick={() => setPhoto(!photo)}>{photo ? 'Photo added' : 'Take photo of the label'}</Button></Field>}
      {rec && (
        <div className="rounded-xl bg-sunken/70 p-3.5 flex items-center gap-3">
          <Switch id="pd-notify" on={notify} onChange={setNotify} label="Tell the person" />
          <label htmlFor="pd-notify" className="text-[14px]"><b className="font-semibold">Tell the person it is for</b><span className="block text-[12.5px] text-ink3">In-app notification, “Collect from the front desk”</span></label>
        </div>
      )}
    </FormSheet>
  );
}

export const FRONTOFFICE_PAGES = {
  desk: DeskPage,
  visitors: VisitorsPage,
  pickup: PickupPage,
  enquiries: EnquiriesPage,
  appointments: AppointmentsPage,
  postal: PostalPage,
};
