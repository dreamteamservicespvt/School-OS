// Hostel Management (optional module, switched on for Sunrise Public School). Example data only.
import React, { useEffect, useMemo, useState } from 'react';
import * as I from './icons.js';
import { STUDENTS, inr } from './data.js';
import { cx, Card, CardHead, Button, Pill, Avatar, Input, Field, Segmented, Empty, Sheet, Switch, useToast } from './ui.jsx';
import { useNav, useRole } from './shell.jsx';
import { inMenu, pagesFor } from './config.js';
import {
  DatePeriod, PERIODS, fmtRange, periodDays, CalendarMonth, schoolDay, sampleMark, ModuleHead, useCanEdit, Stats, Band, SearchBox, Toolbar, Select, Textarea, Chips, DataList, SettingRow, SettingsCard,
  Banner, Suggestion, Progress, HBars, Bars, Legend, DL, MoreMenu, FormSheet, ConfirmSheet, Split, Col, ExportButton,
} from './kit.jsx';

/* ======================= Sample data ======================= */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Dates as days from today (Fri 9 Oct 2026), times as minutes after midnight. Now is 10:42 AM.
const NOW = 10 * 60 + 42;
const dt = (off) => new Date(2026, 9, 9 + off);
const dday = (off) => { const d = dt(off); return `${DAY[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`; };
const dlong = (off) => { const d = dt(off); return `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`; };
const dinput = (off) => { const d = dt(off); return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`; };
const fmtT = (m) => { const h = Math.floor(m / 60), mm = m % 60; return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
const dayWord = (d) => (d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d === -1 ? 'Yesterday' : dday(d));
const when = (x) => `${dayWord(x.d)}, ${fmtT(x.t)}`;
// Typed dates (dd-mm-yyyy) and times (6:00 PM) back to numbers; null when not valid
function parseD(s) {
  const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(String(s).trim());
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  if (d.getDate() !== +m[1] || d.getMonth() !== +m[2] - 1) return null;
  return Math.round((d - new Date(2026, 9, 9)) / 86400000);
}
function parseT(s) {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i.exec(String(s).trim());
  if (!m || +m[1] < 1 || +m[1] > 12 || +(m[2] || 0) > 59) return null;
  return ((+m[1] % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + +(m[2] || 0);
}
// Day offsets as ISO dates, so lists can be filtered by a DatePeriod
const isoOff = (off) => { const d = dt(off); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const offIn = (per, off) => { const d = isoOff(off); return d >= per.from && d <= per.to; };
const phoneOk = (s) => /^[6-9]\d{9}$/.test(String(s).replace(/\s/g, ''));
const showPhone = (s) => String(s).replace(/\s/g, '').replace(/(\d{5})(\d{5})/, '$1 $2');

// Pages share their state while you move between them, so the rooms always agree with the residents list
const SHARED = {};
function useShared(key, init) {
  if (!(key in SHARED)) SHARED[key] = typeof init === 'function' ? init() : init;
  const [v, setV] = useState(SHARED[key]);
  const set = (fn) => setV((x) => { const n = typeof fn === 'function' ? fn(x) : fn; SHARED[key] = n; return n; });
  return [v, set];
}

let seed = 29;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const ph = () => `9${Math.floor(rnd() * 9)}${String(Math.floor(rnd() * 1e8)).padStart(8, '0')}`.replace(/(\d{5})(\d{5})/, '$1 $2');

const HOSTELS0 = [
  { id: 'boys', name: 'Boys’ hostel', who: 'Boys', short: 'Boys', wardens: ['Joseph Thomas'], helper: 'Ravi Kumar', floors: ['Ground', 'First', 'Second'] },
  { id: 'girls', name: 'Girls’ hostel', who: 'Girls', short: 'Girls', wardens: ['Mary Joseph'], helper: 'Saraswathi', floors: ['Ground', 'First'] },
];
const pad = (n) => String(n).padStart(2, '0');
const ROOMS0 = [
  ...Array.from({ length: 24 }, (_, i) => ({ id: `B-${pad(i + 1)}`, h: 'boys', floor: i < 8 ? 'Ground' : i < 16 ? 'First' : 'Second', type: 'Non-AC', beds: 4 })),
  { id: 'B-25', h: 'boys', floor: 'Second', type: 'AC', beds: 2 }, { id: 'B-26', h: 'boys', floor: 'Second', type: 'AC', beds: 2 },
  ...Array.from({ length: 8 }, (_, i) => ({ id: `G-${pad(i + 1)}`, h: 'girls', floor: i < 4 ? 'Ground' : 'First', type: 'Non-AC', beds: 4 })),
];
// Boys' rooms go by class: B-01 to B-04 Class 5 … B-21 to B-24 Class 10. AC rooms are Class 10.
const clsOfRoom = (id) => { const n = Number(id.slice(2)); return id[0] === 'B' ? (n > 24 ? '10' : String(5 + Math.floor((n - 1) / 4))) : ['5', '6', '7', '8', '8', '9', '10', '10'][n - 1]; };
const FREE0 = new Set(['B-07/4', 'B-15/2', 'B-26/2', 'G-04/4', 'G-06/3', 'G-08/3', 'G-08/4']);
const BLOCKED0 = { 'B-22/3': 'Bunk bed frame broken. Carpenter booked for Mon 12 Oct.' };
const FEE_PLANS = { 'Non-AC': { name: 'Hostel · Non-AC room', q: 24000 }, AC: { name: 'Hostel · AC room', q: 32000 } };

// Residents named elsewhere in the prototype (warden dashboard) or used in the examples below
const OVR = {
  'B-12/2': { name: 'Tejas Naidu', cls: '7', sec: 'A' },
  'B-17/1': { name: 'Yash Reddy', cls: '9', sec: 'A' },
  'B-14/3': { name: 'Rahul Verma', cls: '8', sec: 'A' },
  'B-19/2': { name: 'Kiran Reddy', cls: '9', sec: 'B', dad: 'Srinivas Reddy' },
  'B-23/1': { name: 'Manish Goud', cls: '10', sec: 'A', local: 'Naresh Goud' },
  'B-10/4': { name: 'Sai Naidu', cls: '7', sec: 'A', mom: 'Padma Naidu' },
  'B-15/1': { name: 'Charan Rao', cls: '8', sec: 'B', dad: 'Rajesh Rao', due: 24000 },
  'B-06/1': { name: 'Harsha Kumar', cls: '6', sec: 'B', mom: 'Lalitha Kumar' },
  'B-18/3': { name: 'Nikhil Joshi', cls: '9', sec: 'A', dad: 'Prakash Joshi' },
  'B-11/1': { name: 'Pranav Das', cls: '7', sec: 'A' },
  'B-24/2': { name: 'Rohan Shetty', cls: '10', sec: 'B', dad: 'Vijay Shetty' },
  'B-03/2': { name: 'Dhruv Patel', cls: '5', sec: 'A', mom: 'Jyothi Patel' },
  'G-05/1': { name: 'Diya Pillai', cls: '8', sec: 'B', mom: 'Radha Pillai' },
  'G-06/1': { name: 'Sneha Iyer', cls: '9', sec: 'A', dad: 'Ravi Iyer' },
};
const BOYF = ['Aditya', 'Vihaan', 'Arjun', 'Reyansh', 'Ishaan', 'Rohit', 'Kabir', 'Pranay', 'Varun', 'Karthik', 'Abhiram', 'Sathvik', 'Vamshi', 'Rakesh', 'Sujith', 'Lokesh', 'Bharath', 'Akhil', 'Naveen', 'Gautam', 'Shiva', 'Anirudh', 'Siddharth', 'Vikas', 'Teja', 'Hemanth'];
const GIRLF = ['Ananya', 'Saanvi', 'Aadhya', 'Ira', 'Kavya', 'Navya', 'Pooja', 'Riya', 'Tanvi', 'Vaishnavi', 'Harini', 'Lasya', 'Sahithi', 'Keerthana', 'Bhavya', 'Nithya', 'Shreya', 'Deepika', 'Swathi'];
const SUR = ['Sharma', 'Reddy', 'Rao', 'Naidu', 'Patel', 'Kumar', 'Iyer', 'Gupta', 'Verma', 'Chowdary', 'Varma', 'Menon', 'Das', 'Singh', 'Joshi', 'Pillai', 'Goud', 'Shetty', 'Yadav', 'Prasad'];
const DADS = ['Ramesh', 'Srinivas', 'Venkat', 'Prakash', 'Mahesh', 'Suresh', 'Rajesh', 'Anil', 'Kiran', 'Ravi', 'Naresh', 'Vijay', 'Sanjay', 'Ashok', 'Madhu', 'Raghu'];
const MOMS = ['Lakshmi', 'Padma', 'Sunitha', 'Kavitha', 'Radha', 'Swapna', 'Anitha', 'Jyothi', 'Sujatha', 'Madhavi', 'Rekha', 'Vani', 'Sarita', 'Uma'];
const WAIT0 = [
  { id: 'W1', name: 'Abhinav Prasad', girl: false, cls: '6', sec: 'A', adm: 'SPS/2026/0861', note: 'New admission · joins Mon 12 Oct', since: 'Admitted 5 Oct, hostel needed' },
  { id: 'W2', name: 'Manasa Reddy', girl: true, cls: '8', sec: 'B', adm: 'SPS/2026/0874', note: 'Parents posted to Delhi from November', since: 'Asked on 7 Oct' },
  { id: 'W3', name: 'Vikram Chowdary', girl: false, cls: '10', sec: 'A', adm: 'SPS/2023/0412', note: 'Day scholar · wants the hostel for board exam year', since: 'Asked on 1 Oct' },
];
const usedNames = new Set(['Aarav Sharma', ...Object.values(OVR).map((o) => o.name), ...WAIT0.map((w) => w.name), ...STUDENTS.map((s) => s.name)]);
function uname(girl) {
  for (let i = 0; i < 400; i++) { const n = `${pick(girl ? GIRLF : BOYF)} ${pick(SUR)}`; if (!usedNames.has(n)) { usedNames.add(n); return n; } }
  return `${pick(girl ? GIRLF : BOYF)} ${pick(SUR)}`;
}
function makeResident(id, rm, b, ov = {}) {
  const girl = rm.h === 'girls';
  const name = ov.name || uname(girl);
  const last = name.split(' ').slice(-1)[0];
  const cls = ov.cls || clsOfRoom(rm.id);
  const sec = ov.sec || (cls === '7' ? 'A' : pick(Number(cls) >= 9 ? ['A', 'B', 'C'] : ['A', 'B']));
  const auth = [{ name: ov.dad || `${pick(DADS)} ${last}`, rel: 'Father', phone: ph() }, { name: ov.mom || `${pick(MOMS)} ${last}`, rel: 'Mother', phone: ph() }];
  if (ov.local || rnd() > 0.65) auth.push({ name: ov.local || `${pick(DADS)} ${pick(SUR)}`, rel: 'Local guardian', phone: ph() });
  const checkin = rnd() > 0.22 ? '12 Jun 2026' : pick(['10 Jun 2024', '14 Jun 2025', '3 Jul 2026', '18 Aug 2026']);
  const due = ov.due != null ? ov.due : rnd() > 0.87 ? FEE_PLANS[rm.type].q : 0;
  return { id, name, first: name.split(' ')[0], girl, cls, sec, h: rm.h, room: rm.id, bed: b, adm: `SPS/${2020 + Math.floor(rnd() * 7)}/${String(100 + Math.floor(rnd() * 800)).padStart(4, '0')}`, auth, checkin, due, plan: rm.type, history: [] };
}
function makeRes() {
  const out = []; let k = 0;
  ROOMS0.forEach((rm) => {
    for (let b = 1; b <= rm.beds; b++) {
      const key = `${rm.id}/${b}`;
      if (FREE0.has(key) || BLOCKED0[key]) continue;
      out.push(makeResident(`H${String(++k).padStart(3, '0')}`, rm, b, OVR[key]));
    }
  });
  const left1 = makeResident('H901', ROOMS0.find((r) => r.id === 'B-07'), 4, { name: 'Gautam Varma', cls: '6', sec: 'A' });
  const left2 = makeResident('H902', ROOMS0.find((r) => r.id === 'G-04'), 4, { name: 'Bhavya Menon', cls: '8', sec: 'A' });
  out.push({ ...left1, due: 0, left: { date: '29 Aug 2026', reason: 'Family moved to Bengaluru' } }, { ...left2, due: 0, left: { date: '30 Sep 2026', reason: 'Now a day scholar. Family moved to Miyapur.' } });
  return out;
}
const RES0 = makeRes();
const rid = (n) => RES0.find((r) => r.name === n).id;
const bedKey = (r) => `${r.room}/${r.bed}`;
const occupancy = (res) => Object.fromEntries(res.filter((r) => !r.left).map((r) => [bedKey(r), r]));
const byRoom = (a, b) => (a.room === b.room ? a.bed - b.bed : a.room.localeCompare(b.room));
const clsOf = (r) => `${r.cls} ${r.sec}`;
const hostelOf = (hs, id) => hs.find((x) => x.id === id) || HOSTELS0[0];

// Outing and leave passes: Gate Pass, kind Hostel Outing (decided 9 Oct 2026). Going with a named person, approved by the warden.
const PASSES0 = [
  { id: 'GP/26/0421', r: rid('Diya Pillai'), type: 'Outing', from: { d: 2, t: 600 }, to: { d: 2, t: 1080 }, withName: 'Radha Pillai', withRel: 'Mother', withPhone: '98490 61274', reason: 'Family lunch with grandparents visiting from Kochi', asked: 'Mother on phone, 8 Oct', status: 'Waiting' },
  { id: 'GP/26/0420', r: rid('Pranav Das'), type: 'Outing', from: { d: 2, t: 600 }, to: { d: 2, t: 1020 }, withName: 'Ravi Das', withRel: 'Uncle', withPhone: '99851 20476', reason: 'Shopping for Dussehra clothes with uncle', asked: 'Father on phone, 8 Oct', status: 'Waiting' },
  { id: 'GP/26/0419', r: rid('Nikhil Joshi'), type: 'Leave', from: { d: 1, t: 960 }, to: { d: 2, t: 1080 }, withName: 'Prakash Joshi', withRel: 'Father', withPhone: '98663 40915', reason: 'Cousin’s wedding in Warangal', asked: 'Father in person, 7 Oct', status: 'Waiting' },
  { id: 'GP/26/0418', r: rid('Harsha Kumar'), type: 'Outing', from: { d: 1, t: 600 }, to: { d: 1, t: 1080 }, withName: 'Lalitha Kumar', withRel: 'Mother', withPhone: '94403 18826', reason: 'Grandmother’s birthday lunch at home', asked: 'Mother on phone, 8 Oct', status: 'Waiting' },
  { id: 'GP/26/0417', r: rid('Rohan Shetty'), type: 'Outing', from: { d: 1, t: 540 }, to: { d: 1, t: 780 }, withName: 'Vijay Shetty', withRel: 'Father', withPhone: '90008 72341', reason: 'Coaching centre entrance test at Ameerpet', asked: 'Father on phone, 6 Oct', status: 'Approved', by: 'Joseph Thomas' },
  { id: 'GP/26/0415', r: rid('Charan Rao'), type: 'Outing', from: { d: 0, t: 540 }, to: { d: 0, t: 630 }, withName: 'Rajesh Rao', withRel: 'Father', withPhone: '98480 55123', reason: 'Dentist at Kukatpally, braces check', asked: 'Father in person, 7 Oct', status: 'Out', by: 'Joseph Thomas', out: { d: 0, t: 545 } },
  { id: 'GP/26/0414', r: rid('Sai Naidu'), type: 'Leave', from: { d: -1, t: 1080 }, to: { d: 1, t: 1080 }, withName: 'Padma Naidu', withRel: 'Mother', withPhone: '94900 27719', reason: 'Fever. Rest at home on the doctor’s advice.', asked: 'Hostel nurse, 8 Oct', status: 'Out', by: 'Joseph Thomas', out: { d: -1, t: 1095 } },
  { id: 'GP/26/0413', r: rid('Manish Goud'), type: 'Leave', from: { d: -1, t: 960 }, to: { d: 3, t: 1080 }, withName: 'Naresh Goud', withRel: 'Local guardian', withPhone: '99630 44108', reason: 'Sister’s wedding in Nalgonda', asked: 'Father by letter, 1 Oct', status: 'Out', by: 'Lakshmi Rao', out: { d: -1, t: 975 } },
  { id: 'GP/26/0412', r: rid('Kiran Reddy'), type: 'Leave', from: { d: -1, t: 1020 }, to: { d: 2, t: 1080 }, withName: 'Srinivas Reddy', withRel: 'Father', withPhone: '98853 40917', reason: 'Grandfather unwell. Family visit to Kurnool.', asked: 'Father in person, 8 Oct', status: 'Out', by: 'Joseph Thomas', out: { d: -1, t: 1032 } },
  { id: 'GP/26/0411', r: rid('Sneha Iyer'), type: 'Leave', from: { d: -1, t: 1020 }, to: { d: 2, t: 1080 }, withName: 'Ravi Iyer', withRel: 'Father', withPhone: '97014 88320', reason: 'Family puja at home', asked: 'Mother on phone, 5 Oct', status: 'Out', by: 'Mary Joseph', out: { d: -1, t: 1040 } },
  { id: 'GP/26/0410', r: rid('Yash Reddy'), type: 'Outing', from: { d: -1, t: 990 }, to: { d: -1, t: 1170 }, withName: 'Mahesh Reddy', withRel: 'Father', withPhone: '98490 33018', reason: 'Cousin’s birthday dinner', asked: 'Father on phone, 6 Oct', status: 'Returned', by: 'Joseph Thomas', out: { d: -1, t: 995 }, back: { d: -1, t: 1312 }, late: 142 },
  { id: 'GP/26/0409', r: rid('Tejas Naidu'), type: 'Outing', from: { d: -1, t: 990 }, to: { d: -1, t: 1170 }, withName: 'Mahesh Reddy', withRel: 'Friend’s father', withPhone: '98490 33018', reason: 'Went with Yash Reddy’s family, parents agreed by phone', asked: 'Mother on phone, 6 Oct', status: 'Returned', by: 'Joseph Thomas', out: { d: -1, t: 995 }, back: { d: -1, t: 1312 }, late: 142 },
  { id: 'GP/26/0406', r: rid('Dhruv Patel'), type: 'Outing', from: { d: -5, t: 600 }, to: { d: -5, t: 1050 }, withName: 'Jyothi Patel', withRel: 'Mother', withPhone: '94411 70265', reason: 'Eye check-up at L. V. Prasad', asked: 'Mother on phone, 2 Oct', status: 'Returned', by: 'Joseph Thomas', out: { d: -5, t: 605 }, back: { d: -5, t: 1010 } },
  { id: 'GP/26/0404', r: rid('Kiran Reddy'), type: 'Outing', from: { d: -5, t: 600 }, to: { d: -5, t: 1080 }, withName: 'Srinivas Reddy', withRel: 'Father', withPhone: '98853 40917', reason: 'Sunday at home', asked: 'Father on phone, 1 Oct', status: 'Returned', by: 'Joseph Thomas', out: { d: -5, t: 612 }, back: { d: -5, t: 1062 } },
  { id: 'GP/26/0402', r: rid('Pranav Das'), type: 'Outing', from: { d: -5, t: 600 }, to: { d: -5, t: 1200 }, withName: 'Arun Kumar', withRel: 'Family friend', withPhone: '90300 41187', reason: 'Movie and dinner', asked: 'Phone call, 2 Oct', status: 'Rejected', by: 'Joseph Thomas', why: 'The person is not known to the parents. Father asked us to say no.' },
];
const VISITS0 = [
  { id: 'V1', d: 0, r: rid('Rahul Verma'), name: 'Suresh Verma', rel: 'Father', phone: '98491 22870', in: 615, out: null, ok: 'list', note: 'Brought medicines. In the sick room.' },
  { id: 'V2', d: -1, r: rid('Dhruv Patel'), name: 'Jyothi Patel', rel: 'Mother', phone: '94411 70265', in: 1050, out: 1095, ok: 'list' },
  { id: 'V3', d: -5, r: rid('Harsha Kumar'), name: 'Lalitha Kumar', rel: 'Mother', phone: '94403 18826', in: 610, out: 700, ok: 'list' },
  { id: 'V4', d: -5, r: rid('Nikhil Joshi'), name: 'Prakash Joshi', rel: 'Father', phone: '98663 40915', in: 625, out: 735, ok: 'list' },
  { id: 'V5', d: -5, r: rid('Pranav Das'), name: 'Ravi Das', rel: 'Uncle', phone: '99851 20476', in: 640, out: 720, ok: 'warden', by: 'Joseph Thomas' },
  { id: 'V6', d: -5, r: rid('Diya Pillai'), name: 'Radha Pillai', rel: 'Mother', phone: '98490 61274', in: 650, out: 770, ok: 'list' },
  { id: 'V7', d: -5, r: rid('Sneha Iyer'), name: 'Ravi Iyer', rel: 'Father', phone: '97014 88320', in: 700, out: 775, ok: 'list' },
];
const INC0 = [
  { id: 'HI/26/031', d: -1, t: 1312, type: 'Discipline', who: [rid('Yash Reddy')], what: 'Came back from an outing 2 hours 22 minutes after the return time (due 7:30 PM, back 9:52 PM).', action: 'Spoke to Yash and his father. Warning given. Added to the behaviour record.', by: 'Joseph Thomas', parent: true },
  { id: 'HI/26/030', d: -1, t: 1400, type: 'Medical', who: [rid('Rahul Verma')], what: 'Fever of 101°F at night, with a headache.', action: 'Nurse gave paracetamol. Moved to the sick room. Parents told at 7:10 AM.', by: 'Ravi Kumar', parent: true },
  { id: 'HI/26/029', d: -1, t: 1120, type: 'Maintenance', h: 'boys', who: [], where: 'Room B-21', what: 'Ceiling fan not working.', action: 'Maintenance request MR/26/0144 raised. Table fan given for tonight.', by: 'Joseph Thomas', parent: false },
  { id: 'HI/26/027', d: -4, t: 1350, type: 'Discipline', who: [], what: 'Mobile phone found under the pillow after lights-out.', action: 'Phone kept with the warden. Given to the parent on Sunday.', by: 'Joseph Thomas', parent: true },
  { id: 'HI/26/026', d: -6, t: 1090, type: 'Medical', who: [rid('Dhruv Patel')], what: 'Twisted ankle during evening football.', action: 'First aid. X-ray at Sai Clinic: no fracture. Rest for 3 days.', by: 'Ravi Kumar', parent: true },
  { id: 'HI/26/025', d: -8, t: 450, type: 'Maintenance', h: 'boys', who: [], where: 'First floor washroom, boys', what: 'Water leaking from the overhead tank pipe.', action: 'Plumber fixed it the next morning.', by: 'Ravi Kumar', parent: false },
  { id: 'HI/26/024', d: -9, t: 1290, type: 'Medical', who: [rid('Diya Pillai')], what: 'Stomach ache after dinner.', action: 'Nurse checked her. ORS given. Fine by morning.', by: 'Mary Joseph', parent: false },
];
// A resident with a phone incident needs a real name: use the first Class 9 boy in B-20
INC0[3].who = [RES0.find((r) => r.room === 'B-20' && r.bed === 1).id];

const MEALS = [['Breakfast', '7:30 AM'], ['Lunch', '12:40 PM'], ['Snacks', '4:30 PM'], ['Dinner', '8:00 PM']];
const MENU_THIS = [
  ['Mon', [['Idli, sambar, coconut chutney', 380, 11], ['Rice, dal, beans poriyal, curd', 650, 18], ['Banana and milk', 220, 8], ['Chapati, mixed veg kurma, rice, rasam', 620, 16]]],
  ['Tue', [['Upma, groundnut chutney', 360, 9], ['Rice, sambar, cabbage fry, buttermilk', 620, 15], ['Boiled sundal (chana)', 180, 9], ['Chapati, dal tadka, rice, curd', 600, 19]]],
  ['Wed', [['Poori, aloo curry', 450, 9], ['Rice, tomato dal, bhindi fry, curd', 640, 16], ['Biscuits and milk', 240, 7], ['Chicken curry or paneer curry, rice, chapati', 720, 28]]],
  ['Thu', [['Pongal, sambar, chutney', 400, 11], ['Rice, palak dal, potato fry, curd', 660, 17], ['Fruit bowl', 150, 2], ['Chapati, chana masala, rice, rasam', 640, 20]]],
  ['Fri', [['Dosa, sambar, chutney', 420, 10], ['Veg pulao, dal, raita, curd', 680, 17], ['Peanut chikki and milk', 260, 10], ['Chapati, egg curry or aloo matar, rice', 650, 22]]],
  ['Sat', [['Pesarattu, ginger chutney', 380, 15], ['Rice, sambar, dondakaya fry, curd', 640, 16], ['Mirchi bajji, tea or milk', 300, 6], ['Lemon rice, curd rice, papad', 600, 13]]],
  ['Sun', [['Aloo paratha, curd', 480, 12], ['Chicken biryani or veg biryani, raita, sweet', 820, 30], ['Cake slice and milk', 280, 8], ['Chapati, dal, rice, rasam', 580, 17]]],
];
const toMenu = (rows) => Object.fromEntries(rows.map(([day, ms]) => [day, ms.map(([dish, kcal, prot]) => ({ dish, kcal, prot }))]));
const EXP0 = [
  { id: 'ME-0418', d: 0, item: 'Vegetables', vendor: 'Rythu Bazaar, Kukatpally', amt: 6840, bill: true, st: 'In Finance' },
  { id: 'ME-0417', d: 0, item: 'Milk, 120 litres', vendor: 'Vijaya Dairy', amt: 6600, bill: true, st: 'In Finance' },
  { id: 'ME-0416', d: -1, item: 'Chicken, 18 kg', vendor: 'Sri Sai Chicken Centre', amt: 4140, bill: true, st: 'Paid' },
  { id: 'ME-0415', d: -2, item: 'Cooking gas, 3 cylinders', vendor: 'HP Gas, Bharat Agencies', amt: 5670, bill: true, st: 'Paid' },
  { id: 'ME-0414', d: -3, item: 'Rice, 10 bags of 25 kg', vendor: 'Sri Lakshmi Traders', amt: 14500, bill: true, st: 'Paid' },
  { id: 'ME-0413', d: -3, item: 'Dal, oil and spices', vendor: 'Sri Lakshmi Traders', amt: 11280, bill: true, st: 'Paid' },
  { id: 'ME-0412', d: -5, item: 'Eggs, 30 trays', vendor: 'Balaji Egg Centre', amt: 5400, bill: false, st: 'Paid' },
  { id: 'ME-0411', d: -7, item: 'Vegetables', vendor: 'Rythu Bazaar, Kukatpally', amt: 7120, bill: true, st: 'Paid' },
];
const ACCESS_PEOPLE = ['Joseph Thomas', 'Mary Joseph', 'Ravi Kumar', 'Saraswathi', 'Mohammed Asif'];

/* ======================= Shared bits ======================= */
const passAway = (p) => p.status === 'Out';
const isLate = (p) => p.status === 'Out' && (p.to.d < 0 || (p.to.d === 0 && p.to.t < NOW));
const shownStatus = (p) => (isLate(p) ? 'Late' : p.status);
const passTone = { Waiting: 'warn', Approved: 'info', Out: 'brand', Late: 'bad', Returned: 'ok', Rejected: 'neutral' };
const awayMap = (passes) => Object.fromEntries(passes.filter(passAway).map((p) => [p.r, p]));
const lateBy = (min) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`);
const typeTone = { Discipline: 'warn', Medical: 'info', Maintenance: 'neutral' };
const typeIcon = { Discipline: 'Gavel', Medical: 'Stethoscope', Maintenance: 'Wrench' };

// Which hostels this person works in. A warden runs their own hostel only (05-roles.md: Student Management
// Own = the boarders in their hostel); for the other hostel they see totals, never names. Principal, School Admin
// and the Vice Principal see every hostel. Hostel fee dues are shown only to people who have Fee Management.
function useScope(hostels = HOSTELS0) {
  const { role } = useRole();
  const mine = role.id === 'warden' ? (hostels.find((x) => x.wardens.includes(role.person?.name))?.id || 'boys') : null;
  const sees = (h) => !mine || h === mine;
  return { mine, sees, fees: !!role.access.fees, role, hostels: hostels.filter((x) => sees(x.id)) };
}
const incHostel = (x, R) => x.h || (x.who[0] && R[x.who[0]]?.h) || null;

// Who decides a pass: the warden of the student's hostel, or the Principal and School Admin
function useApprover() {
  const { role } = useRole();
  const canEdit = useCanEdit();
  const { mine } = useScope(SHARED.hostels || HOSTELS0);
  return (h) => canEdit && (role.id === 'principal' || role.id === 'schooladmin' || (role.id === 'warden' && h === mine));
}
const wardenOf = (h) => (h === 'girls' ? 'Mary Joseph' : 'Joseph Thomas');

// Student picker used in several forms
function ResidentPicker({ id, res, value, onChange, placeholder = 'Name, room or admission no.', error, multi, exclude }) {
  const [q, setQ] = useState('');
  const t = q.trim().toLowerCase();
  const picked = multi ? value : value ? [value] : [];
  const hits = t ? res.filter((r) => !r.left && !picked.some((p) => p.id === r.id) && (!exclude || !exclude(r)) && (r.name.toLowerCase().includes(t) || r.room.toLowerCase().includes(t) || r.adm.toLowerCase().includes(t))).slice(0, 6) : [];
  return (
    <div className="flex flex-col gap-1.5">
      {picked.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {picked.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5 h-8 pl-1 pr-1.5 rounded-full bg-sunken text-[13px] font-semibold">
              <Avatar name={s.name} size={24} />{s.name}<span className="text-ink3 font-normal">{clsOf(s)} · {s.room}</span>
              <button type="button" aria-label={`Remove ${s.name}`} onClick={() => onChange(multi ? value.filter((p) => p.id !== s.id) : null)} className="w-5 h-5 grid place-items-center rounded-full hover:bg-line"><I.X size={13} /></button>
            </span>
          ))}
        </div>
      )}
      {(multi || !value) && (
        <div className={cx(error && 'rounded-xl ring-4 ring-bad/10')}><SearchBox id={id} value={q} onChange={setQ} placeholder={placeholder} /></div>
      )}
      {t && (
        <ul className="rounded-xl border border-line divide-y divide-line/70 overflow-hidden">
          {hits.length === 0 && <li className="px-3.5 py-2.5 text-[13.5px] text-ink3">No resident called “{q}”. Only students living in the hostel are shown.</li>}
          {hits.map((r) => (
            <li key={r.id}><button type="button" onClick={() => { onChange(multi ? [...value, r] : r); setQ(''); }} className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-sunken text-left">
              <Avatar name={r.name} size={28} /><span className="font-semibold text-[14px] flex-1 truncate">{r.name}</span><span className="text-[12.5px] text-ink3 shrink-0">{clsOf(r)} · Room {r.room}</span>
            </button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Summary({ icon = I.Info, children, tone = 'brand' }) {
  const Ic = icon;
  return (
    <div className={cx('rounded-xl p-3.5 text-[13.5px] text-ink2 flex gap-2.5', tone === 'brand' ? 'bg-brand/[.06] border border-brand/20' : tone === 'warn' ? 'bg-warn/12' : 'bg-sunken/70')}>
      <Ic size={17} className={cx('shrink-0 mt-0.5', tone === 'brand' ? 'text-brand' : tone === 'warn' ? 'text-warn' : 'text-ink3')} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/* ======================= Month calendars (go back to earlier months) ======================= */
const hsh = (k) => { let h = 0; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0; return h % 100; };
const isoYMD = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const longIso = (s) => { const m = /^(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})$/.exec(String(s || '')); return m ? `${m[3]}-${pad(MON.indexOf(m[2]) + 1)}-${pad(+m[1])}` : isoOff(0); };
// A hostel day: future, closed (summer holidays, before records) or a festival holiday when most boarders go home
function hostelDay(y, m, d) {
  const sd = schoolDay(y, m, d);
  if (sd.kind === 'future') return { kind: 'future' };
  if (sd.title === 'Summer holidays' || sd.title === 'Before records') return { kind: 'closed', title: sd.title === 'Summer holidays' ? 'Hostel closed for the summer' : 'Before records' };
  if (sd.kind === 'holiday') return { kind: 'holiday', title: `${sd.title} · many boarders at home` };
  return { kind: 'open' };
}
const CLOSED_CELL = { tone: 'muted' };

// One boarder's roll call record: in at both roll calls, away on a pass, late back, or missing at a roll call
function boarderDay(r, passes, y, m, d) {
  const hd = hostelDay(y, m, d);
  const iso = isoYMD(y, m, d);
  if (hd.kind === 'future') return { kind: 'future' };
  if (iso < longIso(r.checkin)) return { kind: 'closed', title: 'Not living in the hostel yet' };
  if (r.left && iso > longIso(r.left.date)) return { kind: 'closed', title: 'Checked out' };
  if (hd.kind !== 'open') return hd;
  if (y === 2026 && m === 9) {
    const off = d - 9;
    const p = passes.find((x) => x.r === r.id && x.out && x.out.d <= off && (x.back ? x.back.d : 0) >= off);
    if (p && p.late && p.back?.d === off) return { kind: 'late', title: `Back ${lateBy(p.late)} late from an outing with ${p.withName}` };
    if (p) return { kind: 'away', title: `${p.type === 'Leave' ? 'On leave' : 'On an outing'} with ${p.withName}` };
    return { kind: 'in', title: d === 9 ? 'In at morning roll call' : 'In at both roll calls' };
  }
  const h = hsh(`${r.id}|${iso}`);
  return h < 6 ? { kind: 'away', title: 'Away on an approved pass' } : h < 8 ? { kind: 'late', title: 'Came back late from an outing' } : h === 8 ? { kind: 'missing', title: 'Missing at night roll call · incident written' } : { kind: 'in', title: 'In at both roll calls' };
}
const BOARDER_TONE = { in: 'ok', away: 'info', late: 'warn', missing: 'bad', holiday: 'info', closed: 'muted', future: 'muted' };
function BoarderCalendar({ r, passes }) {
  return (
    <CalendarMonth id={`bc-${r.id}`} compact
      cell={(y, m, d) => { const k = boarderDay(r, passes, y, m, d); return { tone: BOARDER_TONE[k.kind], title: k.title }; }}
      footer={(y, m) => {
        const t = { in: 0, away: 0, late: 0, missing: 0 };
        for (let d = 1; d <= new Date(y, m + 1, 0).getDate(); d++) { const k = boarderDay(r, passes, y, m, d).kind; if (k in t) t[k]++; }
        const nights = t.in + t.away + t.late + t.missing;
        return nights === 0 ? <p className="text-[12.5px] text-ink3">Not living in the hostel in {MON[m]} {y}.</p> : (
          <div className="flex flex-col gap-2">
            <Legend items={[['bg-ok', `In ${t.in}`], ['bg-info', `Away on a pass ${t.away}`], ['bg-warn', `Late back ${t.late}`], ['bg-bad', `Missing ${t.missing}`]]} />
            <p className="text-[12.5px] text-ink3 tnum">{MON[m]} {y}: {nights} hostel days · in at roll call on {Math.round(((t.in + t.late) / nights) * 100)}% of them</p>
          </div>
        );
      }} />
  );
}

// A boarder's details and roll call record, opened from the residents list or a bed
function ResidentSheet({ r, onClose, hostels, passes }) {
  if (!r) return null;
  return (
    <Sheet open={!!r} onClose={onClose} title={r.name} sub={`Class ${clsOf(r)} · Room ${r.room}, Bed ${r.bed} · ${hostelOf(hostels, r.h).name}`}>
      <div className="flex flex-col gap-4">
        <DL rows={[['Admission no.', r.adm], ['Checked in', r.checkin], ...(r.left ? [['Checked out', `${r.left.date} · ${r.left.reason}`]] : []), ['Can take the student out', r.auth.map((a) => `${a.name} (${a.rel.toLowerCase()})`).join(', ')]]} />
        <div>
          <p className="eyebrow text-ink3 mb-2">Roll call record</p>
          <BoarderCalendar r={r} passes={passes} />
        </div>
      </div>
    </Sheet>
  );
}

// A hostel's roll calls by day: everyone in, a late return, or someone missing at night
const RC_OCT = {
  boys: { 3: ['bad', 'Night: 1 absent, found in the TV room at 9:45 PM · incident written'], 8: ['warn', 'Night: 2 late returns, Room B-12 and B-17, back 9:52 PM'] },
  girls: {},
};
function rollDay(h, y, m, d) {
  const hd = hostelDay(y, m, d);
  if (hd.kind !== 'open') return hd;
  if (y === 2026 && m === 9) {
    const x = RC_OCT[h]?.[d];
    if (x) return { kind: x[0] === 'bad' ? 'missing' : 'late', title: x[1] };
    return { kind: 'in', title: d === 9 ? 'Morning: everyone in or on a pass · night roll call at 9:30 PM' : 'Both roll calls: everyone in or on a pass' };
  }
  const v = hsh(`rc-${h}|${isoYMD(y, m, d)}`);
  return v < 3 ? { kind: 'missing', title: 'Night: 1 absent, found soon after · incident written' } : v < 9 ? { kind: 'late', title: 'Night: 1 late return from an outing' } : { kind: 'in', title: 'Both roll calls: everyone in or on a pass' };
}
function RollCallMonth({ h, name }) {
  return (
    <CalendarMonth id={`rcm-${h}`} key={h}
      cell={(y, m, d) => { const k = rollDay(h, y, m, d); return { tone: BOARDER_TONE[k.kind], title: k.title }; }}
      footer={(y, m) => {
        const t = { in: 0, late: 0, missing: 0 }; let calls = 0;
        for (let d = 1; d <= new Date(y, m + 1, 0).getDate(); d++) { const k = rollDay(h, y, m, d).kind; if (k in t) { t[k]++; calls += y === 2026 && m === 9 && d === 9 ? 1 : 2; } }
        return calls === 0 ? <p className="text-[12.5px] text-ink3">The {name.toLowerCase()} was closed in {MON[m]} {y}.</p> : (
          <div className="flex flex-col gap-2">
            <Legend items={[['bg-ok', 'Everyone in'], ['bg-warn', 'Late return'], ['bg-bad', 'Missing at roll call'], ['bg-info', 'Holiday']]} />
            <p className="text-[12.5px] text-ink3 tnum">{MON[m]} {y}: {calls} roll calls · {t.late} with a late return · {t.missing} with someone missing</p>
          </div>
        );
      }} />
  );
}

// Plates served in the mess each day, against the boarders expected
const MESS_OCT = { 5: 488, 6: 490, 7: 486, 8: 479 };
function messDay(y, m, d, perDay) {
  const hd = hostelDay(y, m, d);
  if (hd.kind === 'closed' || hd.kind === 'future') return hd;
  const exp = hd.kind === 'holiday' ? Math.round(perDay * 0.4) : perDay;
  if (y === 2026 && m === 9 && d === 9) return { kind: 'today', exp, n: 0, title: 'Today: counting through the day' };
  const v = hsh(`mess|${isoYMD(y, m, d)}`);
  const n = y === 2026 && m === 9 && MESS_OCT[d] ? MESS_OCT[d] : v < 8 ? exp - 12 - (v % 6) : exp - (v % 8);
  return { kind: n < exp - 10 ? 'low' : 'ok', exp, n, title: `${n.toLocaleString('en-IN')} plates of ${exp.toLocaleString('en-IN')} expected${hd.kind === 'holiday' ? ` · ${hd.title}` : ''}` };
}
function MessMonth({ perDay }) {
  return (
    <CalendarMonth id="mess-cal" compact
      cell={(y, m, d) => { const k = messDay(y, m, d, perDay); return { tone: k.kind === 'ok' ? 'ok' : k.kind === 'low' ? 'warn' : k.kind === 'today' ? 'brand' : 'muted', title: k.title }; }}
      footer={(y, m) => {
        let plates = 0, days = 0, low = 0;
        for (let d = 1; d <= new Date(y, m + 1, 0).getDate(); d++) { const k = messDay(y, m, d, perDay); if (k.n) { plates += k.n; days++; if (k.kind === 'low') low++; } }
        return days === 0 ? <p className="text-[12.5px] text-ink3">The mess was closed in {MON[m]} {y}.</p> : (
          <div className="flex flex-col gap-2">
            <Legend items={[['bg-ok', 'As expected'], ['bg-warn', '10 or more plates fewer']]} />
            <p className="text-[12.5px] text-ink3 tnum">{MON[m]} {y}: {plates.toLocaleString('en-IN')} plates in {days} days · about {Math.round(plates / days)} a day{low ? ` · ${low} days with fewer plates` : ''}</p>
          </div>
        );
      }} />
  );
}

/* ======================= Rooms & Beds ======================= */
function RoomsPage() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const [hostels, setHostels] = useShared('hostels', HOSTELS0);
  const [rooms, setRooms] = useShared('rooms', ROOMS0);
  const [res, setRes] = useShared('res', RES0);
  const [blocked, setBlocked] = useShared('blocked', BLOCKED0);
  const [passes] = useShared('passes', PASSES0);
  const sc = useScope(hostels);
  const [h, setH] = useState(sc.mine || 'boys');
  const [floor, setFloor] = useState('all');
  const [q, setQ] = useState('');
  const [bed, setBed] = useState(null);
  const [rec, setRec] = useState(null);
  const [addRoom, setAddRoom] = useState(false);
  const [addHostel, setAddHostel] = useState(false);
  const [wardens, setWardens] = useState(false);
  const [alloc, setAlloc] = useState(null);
  const [move, setMove] = useState(null);
  const [out, setOut] = useState(null);
  const [blockIt, setBlockIt] = useState(null);
  const occ = useMemo(() => occupancy(res), [res]);
  const away = awayMap(passes);
  const H = hostelOf(hostels, h);
  const count = (hid) => {
    const rs = rooms.filter((r) => r.h === hid);
    const beds = rs.reduce((a, r) => a + r.beds, 0);
    let taken = 0, blk = 0;
    rs.forEach((r) => { for (let b = 1; b <= r.beds; b++) { const k = `${r.id}/${b}`; if (occ[k]) taken++; else if (blocked[k]) blk++; } });
    return { beds, taken, blk, free: beds - taken - blk, rooms: rs.length };
  };
  const all = hostels.map((x) => ({ ...x, c: count(x.id) }));
  const tot = all.reduce((a, x) => ({ beds: a.beds + x.c.beds, taken: a.taken + x.c.taken, free: a.free + x.c.free, blk: a.blk + x.c.blk }), { beds: 0, taken: 0, free: 0, blk: 0 });
  const C = count(h);
  const t = q.trim().toLowerCase();
  const match = (rm, b) => { if (!t) return false; const r = occ[`${rm.id}/${b}`]; return rm.id.toLowerCase().includes(t) || (r && r.name.toLowerCase().includes(t)); };
  const shownRooms = rooms.filter((r) => r.h === h && (floor === 'all' || r.floor === floor) && (!t || Array.from({ length: r.beds }, (_, i) => i + 1).some((b) => match(r, b))));
  const floors = H.floors.filter((f) => floor === 'all' || f === floor);
  const addFloor = () => {
    const names = ['Ground', 'First', 'Second', 'Third', 'Fourth', 'Fifth'];
    const next = names.find((n) => !H.floors.includes(n));
    if (!next) { toast({ title: 'This hostel already has 6 floors', tone: 'bad' }); return; }
    const before = hostels;
    setHostels((x) => x.map((y) => (y.id === h ? { ...y, floors: [...y.floors, next] } : y)));
    toast({ title: `${next} floor added to the ${H.name.toLowerCase()}`, body: 'Now add rooms on it.', undo: () => setHostels(before) });
  };
  return (
    <div>
      <ModuleHead sub={sc.mine ? `Every bed in the ${H.name.toLowerCase()}. Tap a bed to give it, move a student or block it for repair.` : 'Every bed in both hostels. Tap a bed to give it, move a student or block it for repair.'}
        actions={<>
          {/* Adding a hostel and choosing wardens are for the Principal and School Admin, not a warden */}
          <MoreMenu items={sc.mine ? [[I.Layers, `Add a floor to the ${H.name.toLowerCase()}`, addFloor]] : [[I.Building2, 'Add a hostel', () => setAddHostel(true)], [I.Layers, `Add a floor to the ${H.name.toLowerCase()}`, addFloor], [I.UserCog, 'Wardens', () => setWardens(true)]]} />
          <Button variant="primary" icon={I.Plus} onClick={() => setAddRoom(true)}>Add room</Button>
        </>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Band items={[
          { label: 'Beds taken', big: <>{tot.taken}<span className="text-[0.55em] opacity-90 font-medium"> / {tot.beds}</span></>, foot: `${Math.round((tot.taken / tot.beds) * 100)}% full · both hostels` },
          ...all.slice(0, 2).map((x) => ({ label: x.name, big: <>{x.c.taken}<span className="text-[0.55em] opacity-90 font-medium"> / {x.c.beds}</span></>, foot: sc.sees(x.id) ? `${x.c.free} free${x.c.blk ? ` · ${x.c.blk} blocked` : ''} · ${x.wardens.join(', ') || 'no warden yet'}` : `${x.c.free} free · totals only`, onClick: sc.sees(x.id) ? () => { setH(x.id); setFloor('all'); } : undefined })),
          { label: 'Free beds', big: String(tot.free), foot: `${tot.blk} blocked for repair` },
        ]} />

        <Card className="overflow-hidden">
          <Toolbar className="@md:items-center">
            {sc.hostels.length > 1 && <Segmented value={h} onChange={(v) => { setH(v); setFloor('all'); }} options={sc.hostels.map((x) => ({ value: x.id, label: x.name }))} />}
            <SearchBox id="rb-q" value={q} onChange={setQ} placeholder="Find a room or a student" />
            <ExportButton what="bed list" />
          </Toolbar>
          <div className="px-4 @md:px-5 pt-3 flex flex-col @md:flex-row @md:items-center gap-3 justify-between">
            <Chips value={floor} onChange={setFloor} options={[{ value: 'all', label: 'All floors', count: C.rooms }, ...H.floors.map((f) => ({ value: f, label: `${f} floor`, count: rooms.filter((r) => r.h === h && r.floor === f).length }))]} />
            <Legend items={[['bg-ok', 'Free'], ['bg-ink3/50', 'Taken'], ['bg-info', 'Away now'], ['bg-warn', 'Blocked']]} />
          </div>
          {C.rooms === 0 ? (
            <Empty icon={I.BedDouble} title={`No rooms in the ${H.name.toLowerCase()} yet`} body="Add the first room. Its beds are made and numbered for you." action={canEdit && <Button variant="primary" icon={I.Plus} onClick={() => setAddRoom(true)}>Add room</Button>} />
          ) : shownRooms.length === 0 ? (
            <Empty icon={I.SearchX} title="No room or student matches" body={`Nothing called “${q}” in the ${H.name.toLowerCase()}.`} action={<Button variant="secondary" onClick={() => { setQ(''); setFloor('all'); }}>Clear search</Button>} />
          ) : (
            <div className="p-4 @md:p-5 flex flex-col gap-6">
              {floors.map((f) => {
                const rs = shownRooms.filter((r) => r.floor === f);
                if (!rs.length) return null;
                const bedsHere = rs.reduce((a, r) => a + r.beds, 0);
                const freeHere = rs.reduce((a, r) => a + Array.from({ length: r.beds }, (_, i) => `${r.id}/${i + 1}`).filter((k) => !occ[k] && !blocked[k]).length, 0);
                return (
                  <section key={f}>
                    <p className="text-[13px] font-semibold text-ink2 mb-2.5">{f} floor <span className="text-ink3 font-normal">· {rs.length} rooms · {bedsHere} beds · {freeHere} free</span></p>
                    <div className="grid grid-cols-1 @sm:grid-cols-2 @lg:grid-cols-3 @xl:grid-cols-4 gap-3">
                      {rs.map((rm) => {
                        const free = Array.from({ length: rm.beds }, (_, i) => `${rm.id}/${i + 1}`).filter((k) => !occ[k] && !blocked[k]).length;
                        return (
                          <div key={rm.id} className="rounded-2xl border border-line p-3 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <p className="font-semibold text-[14.5px]">Room {rm.id}</p>
                              <span className="text-[12px] text-ink3 truncate">{rm.type}{free ? <> · <b className="text-ok font-semibold">{free} free</b></> : ' · full'}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                              {Array.from({ length: rm.beds }, (_, i) => i + 1).map((b) => {
                                const k = `${rm.id}/${b}`; const r = occ[k]; const bl = blocked[k]; const aw = r && away[r.id];
                                return (
                                  <button key={b} onClick={() => setBed({ rm, b })}
                                    className={cx('rounded-xl px-2.5 py-2 text-left min-w-0 border transition',
                                      r ? (aw ? 'bg-info/8 border-info/30 hover:bg-info/10' : 'bg-sunken/60 border-line hover:bg-sunken') : bl ? 'bg-warn/12 border-transparent' : 'bg-ok/10 border-transparent hover:bg-ok/15',
                                      match(rm, b) && 'ring-2 ring-brand')}>
                                    <span className={cx('block text-[11px] font-semibold', r ? 'text-ink3' : bl ? 'text-warn' : 'text-ok')}>Bed {b}</span>
                                    <span className={cx('block text-[13px] font-semibold truncate', !r && (bl ? 'text-warn' : 'text-ok'))}>{r ? r.name : bl ? 'Blocked' : 'Free'}</span>
                                    <span className="block text-[11.5px] text-ink3 truncate">{r ? `${clsOf(r)}${aw ? ` · ${aw.type === 'Leave' ? 'on leave' : 'on outing'}` : ''}` : bl ? 'Repair' : 'Tap to give'}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
          <div className="px-5 py-3 border-t border-line text-[12.5px] text-ink3 tnum">{H.name}: {C.beds} beds · {C.taken} taken · {C.free} free · {C.blk} blocked · matches the residents list in Allocation</div>
        </Card>
      </div>

      <BedSheet x={bed} occ={occ} blocked={blocked} away={away} hostels={hostels} onClose={() => setBed(null)} onRecord={(r) => { setBed(null); setRec(r); }}
        onAllocate={(k) => { setBed(null); setAlloc({ bed: k }); }} onMove={(r) => { setBed(null); setMove(r); }} onOut={(r) => { setBed(null); setOut(r); }}
        onBlock={(k, un) => { setBed(null); setBlockIt({ k, un }); }} />
      <AllocateSheet open={!!alloc} pre={alloc} onClose={() => setAlloc(null)} res={res} setRes={setRes} rooms={rooms} blocked={blocked} hostels={hostels} />
      <MoveSheet r={move} onClose={() => setMove(null)} res={res} setRes={setRes} rooms={rooms} blocked={blocked} />
      <CheckoutSheet r={out} onClose={() => setOut(null)} setRes={setRes} />
      <BlockSheet x={blockIt} onClose={() => setBlockIt(null)} blocked={blocked} setBlocked={setBlocked} />
      <ResidentSheet r={rec} onClose={() => setRec(null)} hostels={hostels} passes={passes} />
      <AddRoomSheet open={addRoom} onClose={() => setAddRoom(false)} hostels={sc.hostels} rooms={rooms} setRooms={setRooms} h={h} />
      <AddHostelSheet open={addHostel} onClose={() => setAddHostel(false)} hostels={hostels} setHostels={setHostels} onDone={(id) => setH(id)} />
      <WardensSheet open={wardens} onClose={() => setWardens(false)} hostels={hostels} setHostels={setHostels} />
    </div>
  );
}

function BedSheet({ x, occ, blocked, away, hostels, onClose, onAllocate, onMove, onOut, onBlock, onRecord }) {
  const canEdit = useCanEdit();
  const sc = useScope(hostels);
  const toast = useToast();
  if (!x) return null;
  const k = `${x.rm.id}/${x.b}`; const r = occ[k]; const bl = blocked[k]; const aw = r && away[r.id];
  const H = hostelOf(hostels, x.rm.h);
  return (
    <Sheet open={!!x} onClose={onClose} title={`Room ${x.rm.id} · Bed ${x.b}`} sub={`${H.name} · ${x.rm.floor} floor · ${x.rm.type}`}>
      {r ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3.5">
            <Avatar name={r.name} size={52} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[16px] leading-tight">{r.name}</p>
              <p className="text-[13px] text-ink3">Class {clsOf(r)} · <span className="font-mono text-[12px]">{r.adm}</span></p>
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                {aw ? <Pill tone={isLate(aw) ? 'bad' : 'info'} className="!h-[22px] !text-[11.5px]">{isLate(aw) ? `Not back · due ${fmtT(aw.to.t)}` : `${aw.type === 'Leave' ? 'On leave' : 'On outing'} till ${when(aw.to)}`}</Pill> : <Pill tone="ok" className="!h-[22px] !text-[11.5px]">In the hostel</Pill>}
                {sc.fees && r.due > 0 && <Pill tone="warn" className="!h-[22px] !text-[11.5px]">{inr(r.due)} hostel fees due</Pill>}
              </div>
            </div>
          </div>
          <DL rows={[['Checked in', r.checkin], ['Fee plan', `${FEE_PLANS[r.plan].name} · ${inr(FEE_PLANS[r.plan].q)} a quarter`], ['Parents', r.auth.slice(0, 2).map((a) => a.name).join(', ')], ['Phone', r.auth[0].phone]]} />
          <Button variant="secondary" icon={I.CalendarDays} className="self-start" onClick={() => onRecord(r)}>Roll call record</Button>
          {canEdit && (
            <div className="flex gap-2 flex-wrap">
              <Button variant="secondary" icon={I.ArrowRightLeft} onClick={() => onMove(r)}>Move to another bed</Button>
              <Button variant="ghost" icon={I.Phone} onClick={() => toast({ title: `Calling ${r.auth[0].name}`, body: `${r.auth[0].phone} · from the hostel phone`, tone: 'info' })}>Call parent</Button>
              <Button variant="dangerSoft" icon={I.LogOut} onClick={() => onOut(r)}>Check out</Button>
            </div>
          )}
        </div>
      ) : bl ? (
        <div className="flex flex-col gap-4">
          <Banner tone="warn" title="Blocked for repair.">{bl}</Banner>
          {canEdit && <div className="flex justify-end"><Button variant="primary" icon={I.LockOpen} onClick={() => onBlock(k, true)}>Unblock bed</Button></div>}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Banner tone="ok" title="This bed is free.">Give it to a student waiting for a bed, or block it if it needs repair.</Banner>
          {canEdit && (
            <div className="flex gap-2 justify-end flex-wrap">
              <Button variant="ghost" icon={I.Lock} onClick={() => onBlock(k, false)}>Block for repair</Button>
              <Button variant="primary" icon={I.UserPlus} onClick={() => onAllocate(k)}>Give this bed</Button>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

function BlockSheet({ x, onClose, blocked, setBlocked }) {
  const toast = useToast();
  const [why, setWhy] = useState('');
  const [tried, setTried] = useState(false);
  useEffect(() => { setWhy(''); setTried(false); }, [x]);
  const err = why.trim().length < 5 ? 'Say what is wrong, or what was fixed. Others will read it.' : '';
  const [room, b] = x ? x.k.split('/') : ['', ''];
  return (
    <FormSheet open={!!x} onClose={onClose} title={x?.un ? `Unblock Room ${room}, Bed ${b}?` : `Block Room ${room}, Bed ${b}?`}
      sub={x?.un ? 'The bed becomes free and can be given to a student.' : 'A blocked bed is not offered to anyone until it is unblocked.'}
      submitLabel={x?.un ? 'Unblock bed' : 'Block bed'}
      onSubmit={() => {
        setTried(true); if (err) return false;
        const before = blocked;
        setBlocked((m) => { const n = { ...m }; if (x.un) delete n[x.k]; else n[x.k] = why.trim(); return n; });
        toast({ title: x.un ? `Room ${room}, Bed ${b} is free again` : `Room ${room}, Bed ${b} blocked`, body: why.trim(), undo: () => setBlocked(before) });
        return true;
      }}>
      {x?.un && blocked[x.k] && <p className="text-[13.5px] text-ink2">Blocked because: <b className="font-semibold text-ink">{blocked[x.k]}</b></p>}
      <Field label="Reason" required id="blk-why" error={tried && err}>
        <Textarea id="blk-why" value={why} onChange={setWhy} rows={2} placeholder={x?.un ? 'Carpenter fixed the frame on 12 Oct' : 'Mattress torn, new one ordered'} />
      </Field>
    </FormSheet>
  );
}

function AddRoomSheet({ open, onClose, hostels, rooms, setRooms, h }) {
  const toast = useToast();
  const [f, setF] = useState({});
  const [tried, setTried] = useState(false);
  useEffect(() => { if (open) { setF({ h, floor: 'Ground', num: '', beds: '4', type: 'Non-AC' }); setTried(false); } }, [open]);
  const H = hostelOf(hostels, f.h || h);
  const prefix = H.id === 'girls' ? 'G-' : H.id === 'boys' ? 'B-' : '';
  const num = String(f.num || '').trim().toUpperCase();
  const full = num && prefix && !num.startsWith(prefix) ? prefix + num.padStart(2, '0') : num;
  const err = {
    num: !num ? 'Give the room a number' : rooms.some((r) => r.h === H.id && r.id.toUpperCase() === full) ? `Room ${full} is already in the ${H.name.toLowerCase()}` : '',
    beds: !/^\d+$/.test(f.beds || '') || +f.beds < 1 ? 'Enter how many beds, 1 or more' : +f.beds > 12 ? 'At most 12 beds in one room' : '',
  };
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  return (
    <FormSheet open={open} onClose={onClose} title="Add a room" sub="The beds are made and numbered for you" submitLabel={`Add room with ${+f.beds || 0} beds`}
      onSubmit={() => {
        setTried(true); if (err.num || err.beds) return false;
        const rm = { id: full, h: H.id, floor: f.floor, type: f.type, beds: +f.beds };
        setRooms((x) => [...x, rm]);
        toast({ title: `Room ${full} added with ${rm.beds} beds`, body: `${H.name} · ${f.floor} floor · ${f.type}`, undo: () => setRooms((x) => x.filter((r) => r !== rm)) });
        return true;
      }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Hostel" required id="ar-h"><Select id="ar-h" value={f.h || h} onChange={(v) => setF((x) => ({ ...x, h: v, floor: hostelOf(hostels, v).floors[0] || 'Ground' }))} options={hostels.map((x) => ({ value: x.id, label: x.name }))} /></Field>
        <Field label="Floor" required id="ar-floor"><Select id="ar-floor" value={f.floor || 'Ground'} onChange={set('floor')} options={(H.floors.length ? H.floors : ['Ground']).map((x) => ({ value: x, label: `${x} floor` }))} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Room number" required id="ar-num" error={(tried || (num && err.num)) && err.num} hint={!err.num && full ? `Shows as ${full}` : 'For example 27'}>
          <Input id="ar-num" value={f.num || ''} onChange={(e) => set('num')(e.target.value.slice(0, 6))} error={(tried || num) && !!err.num} placeholder={prefix ? `${prefix}27` : '101'} />
        </Field>
        <Field label="Beds" required id="ar-beds" error={tried && err.beds}>
          <Input id="ar-beds" inputMode="numeric" value={f.beds || ''} onChange={(e) => set('beds')(e.target.value.replace(/\D/g, '').slice(0, 2))} error={tried && !!err.beds} className="tnum" />
        </Field>
      </div>
      <Field label="Room type" id="ar-type" hint={`Fee plan: ${FEE_PLANS[f.type || 'Non-AC'].name}, ${inr(FEE_PLANS[f.type || 'Non-AC'].q)} a quarter`}>
        <Segmented value={f.type || 'Non-AC'} onChange={set('type')} options={['Non-AC', 'AC']} className="w-full" />
      </Field>
    </FormSheet>
  );
}

function AddHostelSheet({ open, onClose, hostels, setHostels, onDone }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [who, setWho] = useState('Boys');
  const [warden, setWarden] = useState('');
  const [tried, setTried] = useState(false);
  useEffect(() => { if (open) { setName(''); setWho('Boys'); setWarden(''); setTried(false); } }, [open]);
  const err = !name.trim() ? 'Give the hostel a name' : hostels.some((x) => x.name.toLowerCase() === name.trim().toLowerCase()) ? 'A hostel with this name already exists' : '';
  return (
    <FormSheet open={open} onClose={onClose} title="Add a hostel" sub="Then add its floors and rooms" submitLabel="Add hostel"
      onSubmit={() => {
        setTried(true); if (err) return false;
        const id = `h${hostels.length + 1}`;
        const x = { id, name: name.trim(), who, short: name.trim().split(' ')[0], wardens: warden ? [warden] : [], helper: '', floors: ['Ground'] };
        setHostels((a) => [...a, x]); onDone(id);
        toast({ title: `${x.name} added`, body: `For ${who.toLowerCase()} · add rooms next`, undo: () => setHostels((a) => a.filter((y) => y !== x)) });
        return true;
      }}>
      <Field label="Name" required id="ah-name" error={tried && err}><Input id="ah-name" value={name} onChange={(e) => setName(e.target.value)} error={tried && !!err} placeholder="Senior boys’ hostel" /></Field>
      <Field label="For" required id="ah-who" hint="Students are only given beds in a hostel that matches."><Segmented value={who} onChange={setWho} options={['Boys', 'Girls']} className="w-full" /></Field>
      <Field label="Warden" id="ah-w"><Select id="ah-w" value={warden} onChange={setWarden} options={[{ value: '', label: 'Choose later' }, ...ACCESS_PEOPLE.map((p) => ({ value: p, label: p }))]} /></Field>
    </FormSheet>
  );
}

function WardensSheet({ open, onClose, hostels, setHostels }) {
  const toast = useToast();
  const canEdit = useCanEdit();
  const [m, setM] = useState({});
  useEffect(() => { if (open) setM(Object.fromEntries(hostels.map((x) => [x.id, x.wardens[0] || '']))); }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title="Wardens" sub="Each warden takes roll call and approves outings for their hostel"
      footer={canEdit ? <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={I.Check} onClick={() => {
        setHostels((x) => x.map((y) => ({ ...y, wardens: m[y.id] ? [m[y.id]] : [] })));
        toast({ title: 'Wardens saved', body: 'Outing approvals follow the new warden from now on. Logged.' }); onClose();
      }}>Save wardens</Button></> : null}>
      <div className="flex flex-col gap-3">
        {hostels.map((x) => (
          <Field key={x.id} label={x.name} id={`wd-${x.id}`} hint={x.helper ? `Helper at night: ${x.helper}` : undefined}>
            <Select id={`wd-${x.id}`} value={m[x.id] || ''} onChange={(v) => setM((a) => ({ ...a, [x.id]: v }))} options={[{ value: '', label: 'No warden' }, ...ACCESS_PEOPLE.map((p) => ({ value: p, label: p }))]} />
          </Field>
        ))}
      </div>
    </Sheet>
  );
}

/* ======================= Allocation ======================= */
function AllocationPage() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const [hostels] = useShared('hostels', HOSTELS0);
  const [rooms] = useShared('rooms', ROOMS0);
  const [res, setRes] = useShared('res', RES0);
  const [blocked] = useShared('blocked', BLOCKED0);
  const [passes] = useShared('passes', PASSES0);
  const [waitAll] = useShared('waiting', WAIT0);
  const sc = useScope(hostels);
  const mineWho = sc.mine && hostelOf(hostels, sc.mine).who;
  const waiting = mineWho ? waitAll.filter((w) => (w.girl ? 'Girls' : 'Boys') === mineWho) : waitAll;
  const [rec, setRec] = useState(null);
  const [q, setQ] = useState('');
  const [h, setH] = useState('all');
  const [st, setSt] = useState('in');
  const [alloc, setAlloc] = useState(null);
  const [move, setMove] = useState(null);
  const [out, setOut] = useState(null);
  const [hist, setHist] = useState(null);
  const away = awayMap(passes);
  const status = (r) => (r.left ? 'Checked out' : r.arriving ? 'Not arrived' : away[r.id] ? (away[r.id].type === 'Leave' ? 'On leave' : 'On outing') : 'Checked in');
  const stTone = { 'Checked in': 'ok', 'On outing': 'info', 'On leave': 'info', 'Checked out': 'neutral', 'Not arrived': 'warn' };
  const allLive = res.filter((r) => !r.left);
  const mineRes = res.filter((r) => sc.sees(r.h));
  const live = mineRes.filter((r) => !r.left);
  const occ = occupancy(res);
  const freeBeds = rooms.filter((rm) => sc.sees(rm.h)).reduce((a, rm) => a + Array.from({ length: rm.beds }, (_, i) => `${rm.id}/${i + 1}`).filter((k) => !occ[k] && !blocked[k]).length, 0);
  const t = q.trim().toLowerCase();
  const rows = mineRes.filter((r) => (h === 'all' || r.h === h) && (st === 'all' || (st === 'in' ? !r.left : st === 'away' ? !r.left && away[r.id] : r.left)) &&
    (!t || (r.name + r.adm + r.room).toLowerCase().includes(t))).sort(byRoom);
  const dueCount = live.filter((r) => r.due > 0).length;
  return (
    <div>
      <ModuleHead sub={sc.mine ? `Who sleeps where in the ${hostelOf(hostels, sc.mine).name.toLowerCase()}. One bed per student.` : 'Who sleeps where. One bed per student; giving a bed adds the hostel fee.'}
        actions={<Button variant="primary" icon={I.UserPlus} onClick={() => setAlloc({})}>Give a bed</Button>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Stats items={[
          { label: sc.mine ? `Residents · ${hostelOf(hostels, sc.mine).who.toLowerCase()}` : 'Residents', value: String(live.length), sub: sc.mine ? `${allLive.length} in all hostels` : hostels.slice(0, 2).map((x) => `${live.filter((r) => r.h === x.id).length} ${x.who.toLowerCase()}`).join(' · '), icon: I.Users, onClick: () => setSt('in') },
          { label: 'Away now', value: String(live.filter((r) => away[r.id]).length), sub: 'On approved outing or leave', icon: I.DoorOpen, tone: 'info', onClick: () => setSt('away') },
          { label: 'Free beds', value: String(freeBeds), sub: `${Object.keys(blocked).filter((k) => sc.sees(rooms.find((rm) => rm.id === k.split('/')[0])?.h)).length} blocked for repair`, icon: I.BedDouble, tone: 'ok' },
          ...(sc.fees ? [{ label: 'Hostel fees due', value: String(dueCount), sub: `${inr(live.reduce((a, r) => a + r.due, 0))} for Oct–Dec`, icon: I.IndianRupee, tone: 'warn' }] : []),
        ]} />

        <Split side={340} className="[&>*]:min-w-0">
          <Card className="overflow-hidden">
            <Toolbar>
              <SearchBox id="al-q" value={q} onChange={setQ} placeholder="Student, admission no. or room" />
              {sc.hostels.length > 1 && <Select id="al-h" value={h} onChange={setH} className="@md:w-44" options={[{ value: 'all', label: 'Both hostels' }, ...hostels.map((x) => ({ value: x.id, label: x.name }))]} />}
              <ExportButton what="residents list" />
            </Toolbar>
            <div className="px-3 pt-3"><Segmented value={st} onChange={setSt} size="sm" options={[{ value: 'in', label: `Living here ${live.length}` }, { value: 'away', label: `Away ${live.filter((r) => away[r.id]).length}` }, { value: 'out', label: `Checked out ${mineRes.length - live.length}` }, { value: 'all', label: 'All' }]} /></div>
            <DataList rows={rows} minWidth={820} onRow={setRec}
              empty={<Empty icon={I.SearchX} title="No resident matches" body="Try the room number or admission number." action={<Button variant="secondary" onClick={() => { setQ(''); setH('all'); setSt('all'); }}>Clear filters</Button>} />}
              columns={[
                { key: 'n', label: 'Student', render: (r) => <div className="flex items-center gap-3"><Avatar name={r.name} size={34} /><div className="min-w-0"><p className="font-semibold leading-tight">{r.name}</p><p className="text-[12px] text-ink3 font-mono">{r.adm}</p></div></div> },
                { key: 'c', label: 'Class', nowrap: true, render: (r) => clsOf(r) },
                { key: 'b', label: 'Room and bed', nowrap: true, render: (r) => <><p>Room {r.room} · Bed {r.bed}</p><p className="text-[12px] text-ink3">{hostelOf(hostels, r.h).name}</p></> },
                { key: 'i', label: 'Check-in', nowrap: true, render: (r) => r.left ? <><p>{r.checkin}</p><p className="text-[12px] text-ink3">Out {r.left.date}</p></> : r.checkin },
                { key: 's', label: 'Status', render: (r) => <><Pill tone={stTone[status(r)]}>{status(r)}</Pill>{away[r.id] && !r.left && <p className={cx('text-[12px] mt-0.5', isLate(away[r.id]) ? 'text-bad font-semibold' : 'text-ink3')}>{isLate(away[r.id]) ? `Not back · due ${fmtT(away[r.id].to.t)}` : `Back ${when(away[r.id].to)}`}</p>}{r.left && <p className="text-[12px] text-ink3 mt-0.5 max-w-[200px]">{r.left.reason}</p>}</> },
                ...(sc.fees ? [{ key: 'f', label: 'Fees', nowrap: true, render: (r) => r.left ? <span className="text-ink3">Stopped</span> : r.due > 0 ? <Pill tone="warn">{inr(r.due)} due</Pill> : <Pill tone="ok" dot>Paid</Pill> }] : []),
                { key: 'm', label: '', render: (r) => canEdit && !r.left && <div onClick={(e) => e.stopPropagation()}><MoreMenu size="sm" items={[
                  ...(r.arriving ? [[I.LogIn, 'Check in now', () => { setRes((x) => x.map((y) => (y.id === r.id ? { ...y, arriving: false, checkin: 'Today' } : y))); toast({ title: `${r.name} checked in`, body: `Room ${r.room}, Bed ${r.bed} · 10:42 AM`, undo: () => setRes((x) => x.map((y) => (y.id === r.id ? r : y))) }); }]] : []),
                  [I.ArrowRightLeft, 'Move to another bed', () => setMove(r)],
                  [I.History, 'Bed history', () => setHist(r)],
                  [I.CalendarDays, 'Roll call record', () => setRec(r)],
                  [I.LogOut, 'Check out', () => setOut(r), 'bad'],
                ]} /></div> },
              ]}
              mobile={(r) => ({ title: r.name, sub: `${clsOf(r)} · Room ${r.room}, Bed ${r.bed}`, avatar: r.name, pills: [<Pill key="s" tone={stTone[status(r)]} className="!h-[22px] !text-[11.5px]">{status(r)}</Pill>, ...(sc.fees && r.due > 0 && !r.left ? [<Pill key="f" tone="warn" className="!h-[22px] !text-[11.5px]">{inr(r.due)} due</Pill>] : [])], right: canEdit && !r.left ? <span onClick={(e) => e.stopPropagation()}><Button size="sm" variant="ghost" icon={I.ArrowRightLeft} aria-label="Move" onClick={() => setMove(r)} /></span> : null })}
              footer={`Showing ${rows.length} · tap a student for their roll call record · every move and check-out is kept`} />
          </Card>

          <Col>
            <Card>
              <CardHead title="Waiting for a bed" sub="Marked “hostel needed” at admission" icon={I.Hourglass} action={<Pill tone={waiting.length ? 'warn' : 'ok'}>{waiting.length}</Pill>} />
              {waiting.length === 0 ? <p className="px-5 pb-5 text-[13.5px] text-ink3 flex items-center gap-2"><I.CircleCheck size={16} className="text-ok" />Everyone who asked has a bed.</p> : (
                <ul className="px-2 pb-2">
                  {waiting.map((w) => (
                    <li key={w.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/60">
                      <Avatar name={w.name} size={34} />
                      <div className="min-w-0 flex-1"><p className="font-semibold text-[14px] truncate">{w.name} <span className="text-ink3 font-normal">· {w.cls} {w.sec}</span></p><p className="text-[12px] text-ink3 truncate">{w.note}</p></div>
                      {canEdit && <Button size="sm" variant="soft" onClick={() => setAlloc({ who: { ...w, src: 'waiting' } })}>Give bed</Button>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card>
              <CardHead title="Hostel fee plans" sub="From Fee Management · charged every quarter" icon={I.ReceiptIndianRupee} />
              <ul className="px-5 pb-4 divide-y divide-line/70 text-[14px]">
                {Object.entries(FEE_PLANS).map(([k, p]) => <li key={k} className="flex justify-between gap-3 py-2.5"><span className="text-ink2">{p.name}</span><b className="font-semibold tnum">{inr(p.q)}</b></li>)}
              </ul>
              <p className="px-5 pb-4 text-[12.5px] text-ink3">Includes mess. Giving a bed adds the fee from the current quarter. Checking out stops it from the next one.</p>
            </Card>
          </Col>
        </Split>
      </div>
      <AllocateSheet open={!!alloc} pre={alloc} onClose={() => setAlloc(null)} res={res} setRes={setRes} rooms={rooms} blocked={blocked} hostels={hostels} onMove={(r) => { setAlloc(null); setMove(r); }} />
      <MoveSheet r={move} onClose={() => setMove(null)} res={res} setRes={setRes} rooms={rooms} blocked={blocked} />
      <CheckoutSheet r={out} onClose={() => setOut(null)} setRes={setRes} />
      <ResidentSheet r={rec} onClose={() => setRec(null)} hostels={hostels} passes={passes} />
      <Sheet open={!!hist} onClose={() => setHist(null)} title={hist ? `${hist.name} · bed history` : ''} sub="Kept for every resident, newest first">
        {hist && (
          <ol className="flex flex-col gap-2">
            {[...(hist.history || []).slice().reverse().map((x) => ({ ...x, cur: false })), { what: `Room ${hist.room}, Bed ${hist.bed}`, when: `Since ${hist.checkin}`, cur: true }].sort((a, b) => (a.cur ? -1 : b.cur ? 1 : 0)).map((x, i) => (
              <li key={i} className="flex items-center gap-3 rounded-xl px-3 py-2.5 bg-sunken/60">
                <I.BedDouble size={17} className={x.cur ? 'text-brand' : 'text-ink3'} />
                <div className="min-w-0 flex-1"><p className="text-[14px] font-semibold">{x.what}</p><p className="text-[12.5px] text-ink3">{x.when}{x.why ? ` · ${x.why}` : ''}</p></div>
                {x.cur && <Pill tone="brand" className="!h-[22px] !text-[11.5px]">Now</Pill>}
              </li>
            ))}
            {!(hist.history || []).length && <li className="text-[13px] text-ink3 px-1">No moves since check-in.</li>}
          </ol>
        )}
      </Sheet>
    </div>
  );
}

// Give a bed: student, hostel matched to gender, first free bed, check-in date, fee plan
function AllocateSheet({ open, pre, onClose, res, setRes, rooms, blocked, hostels: allHostels, onMove }) {
  const toast = useToast();
  const [waitAll, setWaiting] = useShared('waiting', WAIT0);
  // A warden gives beds only in their own hostel, to students on its waiting list or already living there.
  // Day scholars come to the warden through the admission "hostel needed" waiting list, not a school-wide search.
  const sc = useScope(allHostels);
  const hostels = sc.hostels;
  const mineWho = sc.mine && hostelOf(allHostels, sc.mine).who;
  const okWho = (girl) => !mineWho || (girl ? 'Girls' : 'Boys') === mineWho;
  const waiting = waitAll.filter((w) => okWho(w.girl));
  const [who, setWho] = useState(null);
  const [q, setQ] = useState('');
  const [h, setH] = useState('boys');
  const [bed, setBed] = useState('');
  const [date, setDate] = useState(dinput(0));
  const [now, setNow] = useState(true);
  const [tried, setTried] = useState(false);
  const occ = occupancy(res);
  const freeIn = (hid) => rooms.filter((r) => r.h === hid).flatMap((rm) => Array.from({ length: rm.beds }, (_, i) => ({ k: `${rm.id}/${i + 1}`, rm, b: i + 1 }))).filter((x) => !occ[x.k] && !blocked[x.k]);
  useEffect(() => {
    if (!open) return;
    setQ(''); setTried(false); setDate(dinput(0)); setNow(true);
    const w = pre?.who || null; setWho(w);
    if (pre?.bed) { const rm = rooms.find((r) => r.id === pre.bed.split('/')[0]); setH(rm.h); setBed(pre.bed); }
    else { const hid = sc.mine || (w?.girl ? 'girls' : 'boys'); setH(hid); setBed(freeIn(hid)[0]?.k || ''); }
  }, [open]);
  const H = hostelOf(hostels, h);
  const free = freeIn(h);
  const t = q.trim().toLowerCase();
  const pool = [
    ...waiting.map((w) => ({ ...w, src: 'waiting' })),
    ...res.filter((r) => !r.left && sc.sees(r.h)).map((r) => ({ ...r, src: 'resident' })),
    ...(sc.mine ? [] : STUDENTS.filter((s) => ['5', '6', '7', '8', '9', '10'].includes(s.clsId) && !res.some((r) => r.name === s.name)).map((s) => ({ id: s.id, name: s.name, girl: s.girl, cls: s.clsId, sec: s.sec, adm: s.adm, src: 'day' }))),
  ];
  const hits = t ? pool.filter((s) => (s.name + s.adm).toLowerCase().includes(t)).slice(0, 6) : [];
  const has = who && res.find((r) => !r.left && (r.id === who.id || r.name === who.name));
  const rm = bed ? rooms.find((r) => r.id === bed.split('/')[0]) : null;
  const plan = rm ? FEE_PLANS[rm.type] : FEE_PLANS['Non-AC'];
  const dOff = parseD(date);
  const genderBad = who && ((who.girl && H.who === 'Boys') || (!who.girl && H.who === 'Girls'));
  const err = {
    who: !who ? 'Pick the student' : has ? `${who.first || who.name.split(' ')[0]} already has Bed ${has.bed}, Room ${has.room}` : '',
    h: genderBad ? (H.who === 'Girls' ? 'Girls’ hostel. Choose the boys’ hostel.' : 'Boys’ hostel. Choose the girls’ hostel.') : '',
    bed: !free.length ? `No free bed in the ${H.name.toLowerCase()}` : !bed || !free.some((x) => x.k === bed) ? 'Choose a free bed' : '',
    date: dOff == null ? 'Use the form 09-10-2026' : dOff < -30 ? 'Check-in cannot be more than 30 days back' : '',
  };
  const bad = Object.values(err).some(Boolean);
  return (
    <FormSheet open={open} onClose={onClose} title="Give a bed" sub="One bed per student. The hostel fee is added to the student’s fees." submitLabel={who && !bad ? `Give bed to ${who.name.split(' ')[0]}` : 'Give bed'}
      onSubmit={() => {
        setTried(true); if (bad) return false;
        const [room, b] = bed.split('/');
        const r = { ...makeResident(`H${Date.now() % 100000}`, rm, +b, { name: who.name, cls: who.cls, sec: who.sec, due: plan.q }), adm: who.adm, checkin: dOff === 0 ? 'Today' : dlong(dOff), arriving: !now };
        const wBefore = waiting;
        setRes((x) => [...x, r]);
        if (who.src === 'waiting') setWaiting((x) => x.filter((w) => w.id !== who.id));
        toast({ title: `${who.name}: Room ${room}, Bed ${b}`, body: `${plan.name} ${inr(plan.q)} added to fees from the Oct–Dec quarter${now ? ' · checked in' : ''}`, undo: () => { setRes((x) => x.filter((y) => y !== r)); setWaiting(wBefore); } });
        return true;
      }}>
      <Field label="Student" required id="ga-q" error={(tried || has) && err.who}>
        {who ? (
          <div className="flex items-center gap-3 rounded-xl border border-line p-2.5">
            <Avatar name={who.name} size={36} />
            <div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px] truncate">{who.name}</p><p className="text-[12.5px] text-ink3 truncate">Class {who.cls} {who.sec} · {who.girl ? 'Girl' : 'Boy'} · {who.src === 'waiting' ? 'waiting for a bed' : who.src === 'resident' ? 'lives in the hostel' : 'day scholar'}</p></div>
            <Button type="button" size="sm" variant="ghost" onClick={() => setWho(null)}>Change</Button>
          </div>
        ) : (
          <>
            <SearchBox id="ga-q" value={q} onChange={setQ} placeholder={sc.mine ? 'Name or admission no. of a student waiting for a bed' : 'Name or admission no.'} />
            {t && (
              <ul className="rounded-xl border border-line divide-y divide-line/70 overflow-hidden">
                {hits.length === 0 && <li className="px-3.5 py-2.5 text-[13.5px] text-ink3">{sc.mine ? `No one called “${q}” on the waiting list or in the ${hostelOf(allHostels, sc.mine).name.toLowerCase()}.` : `No student called “${q}” in Classes 5 to 10.`}</li>}
                {hits.map((s) => (
                  <li key={s.src + s.id}><button type="button" onClick={() => { setWho(s); setQ(''); if (s.src !== 'resident') { const hid = sc.mine || (s.girl ? 'girls' : 'boys'); if (!pre?.bed) { setH(hid); setBed(freeIn(hid)[0]?.k || ''); } } }} className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-sunken text-left">
                    <Avatar name={s.name} size={28} /><span className="font-semibold text-[14px] flex-1 truncate">{s.name}</span>
                    <span className="text-[12.5px] text-ink3 shrink-0">{s.cls} {s.sec} · {s.src === 'resident' ? `Room ${s.room}` : s.src === 'waiting' ? 'Waiting' : 'Day scholar'}</span>
                  </button></li>
                ))}
              </ul>
            )}
            {!t && waiting.length > 0 && <div className="flex flex-wrap gap-2">{waiting.map((w) => <button type="button" key={w.id} onClick={() => { setWho({ ...w, src: 'waiting' }); const hid = sc.mine || (w.girl ? 'girls' : 'boys'); if (!pre?.bed) { setH(hid); setBed(freeIn(hid)[0]?.k || ''); } }} className="inline-flex items-center gap-2 h-9 pl-1 pr-3 rounded-full border border-line bg-surface hover:bg-sunken text-[13px] font-semibold"><Avatar name={w.name} size={26} />{w.name}<span className="text-ink3 font-normal">{w.cls} {w.sec}</span></button>)}</div>}
          </>
        )}
        {has && onMove && <Button type="button" size="sm" variant="secondary" icon={I.ArrowRightLeft} className="self-start" onClick={() => onMove(has)}>Move {has.first} instead</Button>}
      </Field>
      <div className="grid @sm:grid-cols-2 gap-3">
        <Field label="Hostel" required id="ga-h" error={err.h}>
          <Select id="ga-h" value={h} error={!!err.h} onChange={(v) => { setH(v); setBed(freeIn(v)[0]?.k || ''); }} options={hostels.map((x) => ({ value: x.id, label: `${x.name} (${freeIn(x.id).length} free)` }))} />
        </Field>
        <Field label="Room and bed" required id="ga-bed" error={(tried || !free.length) && err.bed} hint={!err.bed && rm ? `${rm.floor} floor · ${rm.type}` : undefined}>
          <Select id="ga-bed" value={bed} onChange={setBed} error={(tried || !free.length) && !!err.bed} options={free.length ? free.map((x) => ({ value: x.k, label: `Room ${x.rm.id} · Bed ${x.b} · ${x.rm.type}` })) : [{ value: '', label: 'No free bed' }]} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Check-in date" required id="ga-date" error={err.date}><Input id="ga-date" value={date} onChange={(e) => setDate(e.target.value)} error={!!err.date} className="tnum" /></Field>
        <Field label="Fee plan" required id="ga-plan" hint="Set by the room type"><Input id="ga-plan" value={plan.name.replace('Hostel · ', '')} readOnly className="text-ink2" /></Field>
      </div>
      <label className="flex items-center gap-3 text-[14px]"><Switch on={now} onChange={setNow} label="Checked in now" /><span><b className="font-semibold">Checked in now</b><span className="block text-[12.5px] text-ink3">Turn off if the student arrives later. You check them in from the list.</span></span></label>
      {who && !bad && (
        <Summary icon={I.IndianRupee}><b className="font-semibold text-ink">{inr(plan.q)} a quarter</b> ({plan.name}) will be added to {who.name}’s fees for Oct–Dec. Parents see it in Parent Link. Free beds in the {H.name.toLowerCase()}: {free.length} → {free.length - 1}.</Summary>
      )}
    </FormSheet>
  );
}

function MoveSheet({ r, onClose, res, setRes, rooms, blocked }) {
  const toast = useToast();
  const [bed, setBed] = useState('');
  const [why, setWhy] = useState('');
  const [tried, setTried] = useState(false);
  const occ = occupancy(res);
  const free = r ? rooms.filter((x) => x.h === r.h).flatMap((rm) => Array.from({ length: rm.beds }, (_, i) => ({ k: `${rm.id}/${i + 1}`, rm, b: i + 1 }))).filter((x) => !occ[x.k] && !blocked[x.k]) : [];
  useEffect(() => { if (r) { setBed(''); setWhy(''); setTried(false); } }, [r]);
  const err = { bed: !bed ? 'Choose the new bed' : '', why: why.trim().length < 3 ? 'Say why, so the history makes sense later' : '' };
  return (
    <FormSheet open={!!r} onClose={onClose} title={r ? `Move ${r.name}` : ''} sub={r ? `Now in Room ${r.room}, Bed ${r.bed}. The old bed becomes free.` : ''} submitLabel="Move student"
      onSubmit={() => {
        setTried(true); if (err.bed || err.why) return false;
        const [room, b] = bed.split('/'); const nr = rooms.find((x) => x.id === room);
        const moved = { ...r, room, bed: +b, plan: nr.type, history: [...(r.history || []), { what: `Room ${r.room}, Bed ${r.bed}`, when: `Until today`, why: why.trim() }] };
        setRes((x) => x.map((y) => (y.id === r.id ? moved : y)));
        toast({ title: `${r.name} moved to Room ${room}, Bed ${b}`, body: nr.type !== r.plan ? `Fee plan changes to ${FEE_PLANS[nr.type].name} from the next quarter` : `Room ${r.room}, Bed ${r.bed} is free now`, undo: () => setRes((x) => x.map((y) => (y.id === r.id ? r : y))) });
        return true;
      }}>
      {r && free.length === 0 ? <Banner tone="warn" title="No free bed in this hostel.">Check a student out, or unblock a bed, first.</Banner> : (
        <Field label="New room and bed" required id="mv-bed" error={tried && err.bed}>
          <Select id="mv-bed" value={bed} onChange={setBed} error={tried && !!err.bed} options={[{ value: '', label: 'Choose a free bed' }, ...free.map((x) => ({ value: x.k, label: `Room ${x.rm.id} · Bed ${x.b} · ${x.rm.floor} floor · ${x.rm.type}` }))]} />
        </Field>
      )}
      <Field label="Reason" required id="mv-why" error={tried && err.why}><Textarea id="mv-why" value={why} onChange={setWhy} rows={2} placeholder="Moved closer to his classmates" /></Field>
    </FormSheet>
  );
}

function CheckoutSheet({ r, onClose, setRes }) {
  const toast = useToast();
  const sc = useScope();
  const [date, setDate] = useState(dinput(0));
  const [why, setWhy] = useState('');
  const [tried, setTried] = useState(false);
  useEffect(() => { if (r) { setDate(dinput(0)); setWhy(''); setTried(false); } }, [r]);
  const dOff = parseD(date);
  const err = { date: dOff == null ? 'Use the form 09-10-2026' : '', why: why.trim().length < 3 ? 'Give a reason for leaving the hostel' : '' };
  return (
    <FormSheet open={!!r} onClose={onClose} title={r ? `Check out ${r.name}?` : ''} sub={r ? `Room ${r.room}, Bed ${r.bed} becomes free. Hostel fees stop from the next quarter.` : ''} submitLabel="Check out"
      onSubmit={() => {
        setTried(true); if (err.date || err.why) return false;
        setRes((x) => x.map((y) => (y.id === r.id ? { ...y, left: { date: dlong(dOff), reason: why.trim() } } : y)));
        toast({ title: `${r.name} checked out`, body: `Room ${r.room}, Bed ${r.bed} is free · fees stop from Jan–Mar`, undo: () => setRes((x) => x.map((y) => (y.id === r.id ? r : y))) });
        return true;
      }}>
      {sc.fees && r?.due > 0 && <Banner tone="warn" title={`${inr(r.due)} hostel fees due.`}>You can still check out. The fees stay due and are cleared in Leaving & Alumni.</Banner>}
      <Field label="Date" required id="co-date" error={err.date}><Input id="co-date" value={date} onChange={(e) => setDate(e.target.value)} error={!!err.date} className="tnum @md:w-48" /></Field>
      <Field label="Reason" required id="co-why" error={tried && err.why}><Textarea id="co-why" value={why} onChange={setWhy} rows={2} placeholder="Family moved closer to school; now a day scholar" /></Field>
    </FormSheet>
  );
}

/* ======================= Roll Call & Incidents ======================= */
const RC = {
  P: { label: 'Present', on: 'bg-ok text-surface border-ok', soft: 'text-ok' },
  A: { label: 'Absent', on: 'bg-bad text-surface border-bad', soft: 'text-bad' },
  O: { label: 'On outing', soft: 'text-info' },
  V: { label: 'On leave', soft: 'text-info' },
};
const SICK = { [rid('Rahul Verma')]: 'In the sick room · fever since last night' };

function RollcallPage() {
  const [view, setView] = useState('roll');
  const [res] = useShared('res', RES0);
  const [passes] = useShared('passes', PASSES0);
  const [hostels] = useShared('hostels', HOSTELS0);
  const [rooms] = useShared('rooms', ROOMS0);
  const [inc, setInc] = useShared('inc', INC0);
  const [form, setForm] = useState(null);
  const sc = useScope(hostels);
  const R = Object.fromEntries(res.map((r) => [r.id, r]));
  const myInc = inc.filter((x) => { const h = incHostel(x, R); return !h || sc.sees(h); });
  const myRes = res.filter((r) => sc.sees(r.h));
  return (
    <div>
      <ModuleHead sub="Morning and night roll call, and what happened in the hostel"
        actions={<Button variant={view === 'inc' ? 'primary' : 'secondary'} icon={I.NotebookPen} onClick={() => setForm({})}>Record incident</Button>} />
      <Segmented value={view} onChange={setView} className="mb-5" options={[{ value: 'roll', label: 'Roll call', icon: I.ListChecks }, { value: 'inc', label: `Incidents ${myInc.length}`, icon: I.NotebookPen }]} />
      {view === 'roll' ? <RollCall res={res} passes={passes} hostels={hostels} rooms={rooms} onIncident={(pre) => setForm(pre)} />
        : <Incidents inc={myInc} setInc={setInc} res={res} onNew={(pre) => setForm(pre)} />}
      <IncidentSheet pre={form} onClose={() => setForm(null)} res={myRes} mine={sc.mine} onSave={(x) => { setInc((a) => [x, ...a]); setView('inc'); }} onUndo={(x) => setInc((a) => a.filter((y) => y !== x))} />
    </div>
  );
}

function RollCall({ res, passes, hostels, rooms, onIncident }) {
  const toast = useToast();
  const canEdit = useCanEdit();
  const { role } = useRole();
  const sc = useScope(hostels);
  const [h, setH] = useState(sc.mine || 'boys');
  const [ses, setSes] = useState('night');
  const [per, setPer] = useState(PERIODS.last7);
  const [floor, setFloor] = useState('all');
  const [q, setQ] = useState('');
  const [book, setBook] = useShared('roll', {
    'boys-morning': { abs: [], saved: '6:32 AM by Ravi Kumar' }, 'girls-morning': { abs: [], saved: '6:30 AM by Saraswathi' },
  });
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const away = awayMap(passes);
  const H = hostelOf(hostels, h);
  const floorOf = Object.fromEntries(rooms.map((r) => [r.id, r.floor]));
  const people = res.filter((r) => !r.left && !r.arriving && r.h === h).sort(byRoom);
  const key = `${h}-${ses}`;
  const entry = book[key] || { abs: [], saved: null };
  const mark = (r) => (away[r.id] ? (away[r.id].type === 'Leave' ? 'V' : 'O') : entry.abs.includes(r.id) ? 'A' : 'P');
  const counts = people.reduce((a, r) => { const m = mark(r); a[m] = (a[m] || 0) + 1; return a; }, {});
  const t = q.trim().toLowerCase();
  const list = people.filter((r) => (floor === 'all' || floorOf[r.room] === floor) && (!t || r.name.toLowerCase().includes(t) || r.room.toLowerCase().includes(t)));
  const setMark = (r, v) => { if (!canEdit) return; setBook((b) => { const e = b[key] || { abs: [] }; const abs = v === 'A' ? [...new Set([...e.abs, r.id])] : e.abs.filter((x) => x !== r.id); return { ...b, [key]: { ...e, abs, saved: null, alerted: false } }; }); };
  const absentees = people.filter((r) => mark(r) === 'A');
  const save = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      const n = absentees.length;
      setBook((b) => ({ ...b, [key]: { abs: entry.abs, saved: `just now by ${role.person?.name || 'you'}`, alerted: ses === 'night' && n > 0 } }));
      toast(n && ses === 'night'
        ? { title: `Alert sent: ${n} ${n === 1 ? 'student' : 'students'} absent at night roll call`, body: `${wardenOf(h)} and Lakshmi Rao were told at once.`, tone: 'bad' }
        : { title: `${ses === 'night' ? 'Night' : 'Morning'} roll call saved · ${H.name}`, body: n ? `${n} absent. Parents are told by the warden.` : `${counts.P || 0} present · ${(counts.O || 0) + (counts.V || 0)} away on approved passes.` });
    }, 800);
  };
  const lateOut = people.filter((r) => away[r.id] && isLate(away[r.id]));
  return (
    <div className="pb-24 relative">
      <div className="flex flex-col @lg:flex-row gap-3 @lg:items-center mb-4">
        {sc.hostels.length > 1 && <Segmented value={h} onChange={(v) => { setH(v); setFloor('all'); }} options={sc.hostels.map((x) => ({ value: x.id, label: x.name }))} />}
        <Segmented value={ses} onChange={setSes} options={[{ value: 'morning', label: 'Morning · 6:30 AM', icon: I.Sunrise }, { value: 'night', label: 'Night · 9:30 PM', icon: I.Moon }]} />
      </div>

      {entry.alerted ? (
        <Banner tone="bad" className="mb-4" title={`${absentees.length} ${absentees.length === 1 ? 'student' : 'students'} absent at night roll call.`}
          action={canEdit && <Button size="sm" variant="secondary" onClick={() => onIncident({ type: 'Discipline', who: absentees, what: 'Absent at night roll call. Not on an outing or leave.' })}>Record incident</Button>}>
          {wardenOf(h)} and Lakshmi Rao were alerted at once. Find the student, then write what happened.
        </Banner>
      ) : (
        <div className={cx('rounded-2xl px-4 py-3 flex items-center gap-3 mb-4 text-[14px]', entry.saved ? 'bg-ok/10 text-ok' : 'bg-info/8 text-info')}>
          {entry.saved ? <I.CircleCheck size={19} className="shrink-0" /> : <I.Info size={19} className="shrink-0" />}
          <p className="text-ink2">
            {entry.saved ? <><b className="font-semibold text-ink">Saved {entry.saved}.</b> You can change marks and save again.</>
              : <><b className="font-semibold text-ink">Everyone starts as present.</b> Students on approved outings and leave are already marked. Tap only who is missing.</>}
          </p>
        </div>
      )}
      {lateOut.length > 0 && (
        <Banner tone="warn" className="mb-4" title={`${lateOut[0].name} not returned (due ${fmtT(away[lateOut[0].id].to.t)}).`}>
          Out with {away[lateOut[0].id].withName}. Call them, then mark returned in Outing & Visitors.
        </Banner>
      )}

      <div className="flex flex-col @md:flex-row gap-3 @md:items-center mb-3">
        <div className="grid grid-cols-4 gap-2 flex-1">
          {['P', 'A', 'O', 'V'].map((k) => (
            <div key={k} className="rounded-xl bg-surface border border-line px-3 py-2.5 min-w-0">
              <p className={cx('font-display text-[22px] font-semibold tnum leading-none', RC[k].soft)}>{counts[k] || 0}</p>
              <p className="text-[12px] text-ink3 font-semibold mt-1 truncate">{RC[k].label}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <SearchBox id="rc-q" value={q} onChange={setQ} placeholder="Name or room" className="@md:w-56" />
          {canEdit && <Button variant="secondary" icon={I.CheckCheck} disabled={!entry.abs.length} onClick={() => setConfirm(true)}>All present</Button>}
        </div>
      </div>
      <Chips className="mb-3" value={floor} onChange={setFloor} options={[{ value: 'all', label: 'All floors', count: people.length }, ...H.floors.map((f) => ({ value: f, label: `${f} floor`, count: people.filter((r) => floorOf[r.room] === f).length }))]} />

      {!canEdit && <Banner tone="info" icon={I.Eye} className="mb-3">You can see the roll call. Only the warden marks it.</Banner>}
      {people.length === 0 ? <Card><Empty icon={I.Users} title="No one lives in this hostel yet" body="Give beds in Allocation, then take roll call here." /></Card> : (
        <ul className="grid grid-cols-1 @xl:grid-cols-2 gap-2">
          {list.map((r) => {
            const v = mark(r); const aw = away[r.id];
            return (
              <li key={r.id} className={cx('min-w-0 flex items-center gap-2.5 @md:gap-3 rounded-2xl border bg-surface px-3 py-2.5 transition', v === 'A' ? 'border-bad/40 bg-bad/[.04]' : 'border-line')}>
                <span className="w-11 text-center text-[12px] font-semibold text-ink3 tnum shrink-0 leading-tight">{r.room}<span className="block text-[10.5px] font-medium">Bed {r.bed}</span></span>
                <Avatar name={r.name} size={36} className="hidden @sm:inline-grid" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[14.5px] truncate">{r.name}</p>
                  <p className={cx('text-[12px] truncate', aw && isLate(aw) ? 'text-bad font-semibold' : 'text-ink3')}>
                    {aw ? (isLate(aw) ? `Not back from outing · due ${fmtT(aw.to.t)}` : `With ${aw.withName} · back ${when(aw.to)}`) : SICK[r.id] || `Class ${clsOf(r)}`}
                  </p>
                </div>
                {aw ? <Pill tone={isLate(aw) ? 'bad' : 'info'}>{isLate(aw) ? 'Late' : aw.type === 'Leave' ? 'Leave' : 'Outing'}</Pill> : (
                  <div className="flex gap-1" role="radiogroup" aria-label={`Roll call for ${r.name}`}>
                    {['P', 'A'].map((k) => (
                      <button key={k} role="radio" aria-checked={v === k} aria-label={RC[k].label} disabled={!canEdit} onClick={() => setMark(r, k)}
                        className={cx('w-10 h-10 @md:w-11 @md:h-11 rounded-xl border text-[14px] font-bold transition disabled:cursor-default', v === k ? RC[k].on : 'border-line text-ink3 hover:border-ink3/60 hover:text-ink')}>{k}</button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {people.length > 0 && list.length === 0 && <p className="text-center text-ink3 py-10">No resident called “{q}” on this floor.</p>}

      {canEdit && people.length > 0 && (
        <div className="sticky bottom-0 mt-4 -mx-4 @md:mx-0 px-4 @md:px-0 pb-3 pt-3 bg-gradient-to-t from-bg via-bg to-bg/0">
          <Button variant="primary" size="lg" className="w-full !h-14 !text-[16px] shadow-pop" icon={entry.saved ? I.Check : I.Save} loading={saving} onClick={save} disabled={!!entry.saved}>
            {saving ? 'Saving…' : entry.saved ? 'Saved' : `Save ${ses} roll call: ${counts.P || 0} present, ${counts.A || 0} absent, ${(counts.O || 0) + (counts.V || 0)} away`}
          </Button>
        </div>
      )}

      <div className="mt-2 grid @xl:grid-cols-[minmax(0,1fr)_380px] gap-5 @lg:gap-6 items-start [&>*]:min-w-0">
        <Card className="overflow-hidden">
          <CardHead title="Roll call history" sub={H.name} icon={I.History} />
          <Toolbar className="border-t">
            <DatePeriod id="rc-per" value={per} onChange={setPer} className="w-full @md:w-auto" />
            <ExportButton what="roll call register" />
          </Toolbar>
          <RollHistory h={h} per={per} n={people.length} awayNow={(counts.O || 0) + (counts.V || 0)} />
        </Card>
        <Card>
          <CardHead title="Roll call by month" sub={`${H.name} · go back to earlier months`} icon={I.CalendarDays} />
          <div className="px-5 pb-5"><RollCallMonth h={h} name={H.name} /></div>
        </Card>
      </div>

      <ConfirmSheet open={confirm} onClose={() => setConfirm(false)} title="Mark everyone present again?" sub="The absent marks you made will be cleared. Students on outings and leave stay as they are."
        confirmLabel="Mark all present" onConfirm={() => setBook((b) => ({ ...b, [key]: { abs: [], saved: null } }))} />
    </div>
  );
}

// Every roll call in the chosen dates, newest first: night and morning for each day the hostel was open
function RollHistory({ h, per, n, awayNow }) {
  const [more, setMore] = useState(false);
  const rows = [];
  const start = new Date(Math.min(new Date(per.to + 'T00:00'), dt(0)));
  for (let d = new Date(start); isoYMD(d.getFullYear(), d.getMonth(), d.getDate()) >= per.from && d >= new Date(2025, 5, 1); d.setDate(d.getDate() - 1)) {
    const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
    const k = rollDay(h, y, m, day);
    if (k.kind === 'closed' || k.kind === 'future') continue;
    const label = `${DAY[d.getDay()]} ${day} ${MON[m]}${y !== 2026 ? ` ${y}` : ''}`;
    const away = k.kind === 'holiday' ? Math.round(n * 0.6) : hsh(`aw-${h}|${y}-${m}-${day}`) % 5;
    const isToday = y === 2026 && m === 9 && day === 9;
    const awayM = isToday ? awayNow : away;
    if (!isToday) {
      const tone = k.kind === 'missing' ? 'bad' : k.kind === 'late' ? 'warn' : 'ok';
      rows.push({ key: `${y}-${m}-${day}-n`, night: true, tone, title: `${label} · Night`, a: `${n - away - (k.kind === 'missing' ? 1 : 0)} of ${n} present`, b: k.kind === 'in' || k.kind === 'holiday' ? (away ? `${away} away on approved passes${k.kind === 'holiday' ? ' for the holiday' : ''}` : 'Everyone in') : k.title.replace(/^Night: /, '') });
    }
    rows.push({ key: `${y}-${m}-${day}-m`, night: false, tone: 'ok', title: `${label} · Morning`, a: `${n - awayM} of ${n} present`, b: awayM ? `${awayM} away on approved passes` : 'Everyone in' });
  }
  if (!rows.length) return <Empty icon={I.CalendarX} title="No roll calls in these dates" body={`The hostel was closed between ${fmtRange(per)}, or the dates are in the future.`} />;
  const shown = more ? rows.slice(0, 120) : rows.slice(0, 12);
  return (
    <>
      <ul className="px-2 py-2">
        {shown.map((x) => (
          <li key={x.key} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/60">
            <span className={cx('w-9 h-9 rounded-xl grid place-items-center shrink-0', x.tone === 'ok' ? 'bg-ok/10 text-ok' : x.tone === 'warn' ? 'bg-warn/12 text-warn' : 'bg-bad/10 text-bad')}>{x.night ? <I.Moon size={17} /> : <I.Sunrise size={17} />}</span>
            <div className="min-w-0 flex-1"><p className="font-semibold text-[14px] truncate">{x.title} · {x.a}</p><p className="text-[12.5px] text-ink3 truncate">{x.b}</p></div>
          </li>
        ))}
      </ul>
      <div className="px-5 py-3 border-t border-line flex items-center justify-between gap-3 text-[12.5px] text-ink3 tnum">
        <span>{shown.length} of {rows.length} roll calls · {fmtRange(per)}</span>
        {rows.length > 12 && <Button size="sm" variant="ghost" onClick={() => setMore(!more)}>{more ? 'Show fewer' : rows.length > 120 ? 'Show 120' : `Show all ${rows.length}`}</Button>}
      </div>
    </>
  );
}

function Incidents({ inc, setInc, res, onNew }) {
  const toast = useToast();
  const canEdit = useCanEdit();
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [open, setOpen] = useState(null);
  const [per, setPer] = useState(PERIODS.thismonth);
  const { role } = useRole();
  // The behaviour record lives in Student Management, Behaviour: only for people who have that page
  const seesBehaviour = pagesFor('students', role.access.students, role.id).some((p) => p.id === 'behaviour');
  const R = Object.fromEntries(res.map((r) => [r.id, r]));
  const names = (x) => x.who.map((id) => R[id]?.name).filter(Boolean);
  const inP = inc.filter((x) => offIn(per, x.d));
  const rows = inP.filter((x) => (type === 'all' || x.type === type) && (!q || (names(x).join(' ') + x.what + (x.where || '')).toLowerCase().includes(q.toLowerCase())));
  const tejas = res.find((r) => r.name === 'Tejas Naidu');
  const hasTejas = inc.some((x) => x.who.includes(tejas?.id));
  return (
    <div className="flex flex-col gap-5 @lg:gap-6">
      {!hasTejas && tejas && (
        <Banner tone="warn" title="Late return from Room B-12 has no note yet."
          action={canEdit && <Button size="sm" variant="secondary" onClick={() => onNew({ type: 'Discipline', who: [tejas], what: 'Came back from an outing 2 hours 22 minutes after the return time (due 7:30 PM, back 9:52 PM).', d: -1, t: 1312 })}>Write it</Button>}>
          Tejas Naidu came back at 9:52 PM yesterday, with Yash Reddy.
        </Banner>
      )}
      <Stats items={[
        { label: per.label, value: String(inP.length), sub: fmtRange(per), icon: I.NotebookPen },
        { label: 'Discipline', value: String(inP.filter((x) => x.type === 'Discipline').length), sub: 'Added to behaviour records', icon: I.Gavel, tone: 'warn', onClick: () => setType('Discipline') },
        { label: 'Medical', value: String(inP.filter((x) => x.type === 'Medical').length), sub: '1 in the sick room now', icon: I.Stethoscope, tone: 'info', onClick: () => setType('Medical') },
        { label: 'Maintenance', value: String(inP.filter((x) => x.type === 'Maintenance').length), sub: '1 repair still open', icon: I.Wrench, onClick: () => setType('Maintenance') },
      ]} />
      <Card className="overflow-hidden">
        <Toolbar>
          <SearchBox id="inc-q" value={q} onChange={setQ} placeholder="Student, room or what happened" />
          <DatePeriod id="inc-per" value={per} onChange={setPer} className="w-full @md:w-auto" />
          <ExportButton what="incident log" />
        </Toolbar>
        <div className="px-3 pt-3"><Segmented value={type} onChange={setType} size="sm" options={[{ value: 'all', label: 'All' }, { value: 'Discipline', label: 'Discipline' }, { value: 'Medical', label: 'Medical' }, { value: 'Maintenance', label: 'Repair' }]} /></div>
        <DataList rows={rows} minWidth={900} onRow={setOpen}
          empty={<Empty icon={I.CircleCheck} title="Nothing recorded" body={`No incidents${type === 'all' ? '' : ' of this type'} between ${fmtRange(per)}.`} />}
          columns={[
            { key: 'd', label: 'When', nowrap: true, render: (x) => <><p>{dayWord(x.d)}</p><p className="text-[12px] text-ink3">{fmtT(x.t)}</p></> },
            { key: 'ty', label: 'Type', render: (x) => <Pill tone={typeTone[x.type]}>{x.type}</Pill> },
            { key: 'w', label: 'Who or where', render: (x) => names(x).length ? <><p className="font-semibold leading-tight">{names(x).join(', ')}</p><p className="text-[12px] text-ink3">{x.who.map((id) => R[id] && `Room ${R[id].room}`).filter(Boolean).join(', ')}</p></> : <p className="text-ink2">{x.where || '—'}</p> },
            { key: 'wh', label: 'What happened', render: (x) => <p className="max-w-[280px] line-clamp-2">{x.what}</p> },
            { key: 'a', label: 'Action taken', render: (x) => <p className="max-w-[240px] text-ink2 line-clamp-2">{x.action || <span className="text-ink3">Not written yet</span>}</p> },
            { key: 'b', label: 'Recorded by', nowrap: true, render: (x) => <><p>{x.by}</p>{x.parent && <p className="text-[12px] text-ink3">Parent told</p>}</> },
          ]}
          mobile={(x) => ({ title: names(x).join(', ') || x.where, sub: `${dayWord(x.d)}, ${fmtT(x.t)} · ${x.what}`, icon: typeIcon[x.type], iconTone: typeTone[x.type], pills: [<Pill key="t" tone={typeTone[x.type]} className="!h-[22px] !text-[11.5px]">{x.type}</Pill>] })}
          footer={`Showing ${rows.length} · ${per.label.toLowerCase()} · ${fmtRange(per)} · incidents are kept, never deleted`} />
      </Card>
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? `${open.type} · ${open.id}` : ''} sub={open ? `${dayWord(open.d)}, ${fmtT(open.t)} · recorded by ${open.by}` : ''}
        footer={open && canEdit ? <><Button variant="ghost" icon={I.Printer} onClick={() => toast({ title: `Printing ${open.id}`, body: 'On the school letterhead' })}>Print</Button>{open.type === 'Discipline' && seesBehaviour && <Button variant="secondary" onClick={() => toast({ title: 'Opened in Student Management, Behaviour', tone: 'info' })}>Behaviour record</Button>}<Button variant="primary" onClick={() => setOpen(null)}>Done</Button></> : null}>
        {open && <DL cols={1} rows={[['Who', names(open).join(', ') || 'No student'], ...(open.where ? [['Where', open.where]] : []), ['What happened', open.what], ['Action taken', open.action || 'Not written yet'], ['Parent told', open.parent ? 'Yes, on WhatsApp' : 'No']]} />}
      </Sheet>
    </div>
  );
}

function IncidentSheet({ pre, onClose, res, mine, onSave, onUndo }) {
  const toast = useToast();
  const { role } = useRole();
  const [f, setF] = useState({});
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (!pre) return;
    setTried(false);
    setF({ type: pre.type || 'Discipline', who: pre.who || [], where: '', what: pre.what || '', date: dinput(pre.d ?? 0), time: fmtT(pre.t ?? NOW), action: '', parent: pre.type !== 'Maintenance', behaviour: true, request: true });
  }, [pre]);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const maint = f.type === 'Maintenance';
  const dOff = parseD(f.date || ''); const tm = parseT(f.time || '');
  const err = {
    who: !maint && !(f.who || []).length ? 'Pick the student or students involved' : '',
    where: maint && !(f.where || '').trim() ? 'Say which room or place needs repair' : '',
    what: (f.what || '').trim().length < 8 ? 'Write what happened in a sentence' : '',
    date: dOff == null ? 'Use the form 09-10-2026' : dOff > 0 ? 'Cannot be a future date' : '',
    time: tm == null ? 'Use the form 9:30 PM' : dOff === 0 && tm > NOW ? 'Cannot be later than now' : '',
  };
  const bad = Object.values(err).some(Boolean);
  const show = (k) => (tried || (k === 'date' || k === 'time')) && err[k];
  return (
    <FormSheet open={!!pre} onClose={onClose} title="Record an incident" sub="Kept in the hostel log. Staff only." submitLabel="Save incident" wide
      onSubmit={() => {
        setTried(true); if (bad) return false;
        const x = { id: `HI/26/0${32 + Math.floor(Math.random() * 60)}`, d: dOff, t: tm, type: f.type, who: maint ? [] : f.who.map((s) => s.id), where: maint ? f.where.trim() : undefined, h: maint ? mine || undefined : undefined, what: f.what.trim(), action: f.action.trim(), by: role.person?.name || 'Joseph Thomas', parent: !maint && f.parent };
        onSave(x);
        const bits = [];
        if (!maint && f.parent) bits.push(`${f.who.length === 1 ? 'parent' : 'parents'} told on WhatsApp`);
        if (f.type === 'Discipline' && f.behaviour) bits.push('added to the behaviour record');
        if (maint && f.request) bits.push('maintenance request MR/26/0151 raised in Inventory');
        toast({ title: `${f.type} incident saved`, body: bits.length ? bits.join(' · ').replace(/^./, (c) => c.toUpperCase()) : 'In the hostel log', undo: () => onUndo(x) });
        return true;
      }}>
      <Field label="Type" required id="in-type"><Segmented value={f.type || 'Discipline'} onChange={(v) => setF((x) => ({ ...x, type: v, parent: v !== 'Maintenance' }))} options={[{ value: 'Discipline', label: 'Discipline', icon: I.Gavel }, { value: 'Medical', label: 'Medical', icon: I.Stethoscope }, { value: 'Maintenance', label: 'Repair', icon: I.Wrench }]} className="w-full" /></Field>
      {maint ? (
        <Field label="Room or place" required id="in-where" error={show('where')}><Input id="in-where" value={f.where || ''} onChange={(e) => set('where')(e.target.value)} error={!!show('where')} placeholder="Room B-21, or first floor washroom" /></Field>
      ) : (
        <Field label="Student(s)" required id="in-who" error={show('who')}><ResidentPicker id="in-who" res={res} value={f.who || []} onChange={set('who')} multi error={!!show('who')} /></Field>
      )}
      <Field label="What happened" required id="in-what" error={show('what')}><Textarea id="in-what" value={f.what || ''} onChange={set('what')} rows={3} placeholder={maint ? 'Ceiling fan not working since evening' : 'Found using a phone after lights-out'} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" required id="in-date" error={show('date')}><Input id="in-date" value={f.date || ''} onChange={(e) => set('date')(e.target.value)} error={!!show('date')} className="tnum" /></Field>
        <Field label="Time" required id="in-time" error={show('time')}><Input id="in-time" value={f.time || ''} onChange={(e) => set('time')(e.target.value)} error={!!show('time')} className="tnum" /></Field>
      </div>
      <Field label="Action taken" id="in-action" hint="Optional. You can add it later."><Textarea id="in-action" value={f.action || ''} onChange={set('action')} rows={2} placeholder="Spoke to the student and called the father" /></Field>
      <div className="rounded-xl bg-sunken/70 divide-y divide-line/70">
        {!maint && <label className="flex items-center gap-3 px-3.5 py-3 text-[14px]"><Switch on={!!f.parent} onChange={set('parent')} label="Tell the parent" /><span><b className="font-semibold">Tell the parent</b><span className="block text-[12.5px] text-ink3">WhatsApp message from the incident template</span></span></label>}
        {f.type === 'Discipline' && <label className="flex items-center gap-3 px-3.5 py-3 text-[14px]"><Switch on={!!f.behaviour} onChange={set('behaviour')} label="Add to behaviour record" /><span><b className="font-semibold">Add to the behaviour record</b><span className="block text-[12.5px] text-ink3">Seen by the class teacher and the counsellor</span></span></label>}
        {maint && <label className="flex items-center gap-3 px-3.5 py-3 text-[14px]"><Switch on={!!f.request} onChange={set('request')} label="Raise a maintenance request" /><span><b className="font-semibold">Raise a maintenance request</b><span className="block text-[12.5px] text-ink3">Goes to Inventory, Rooms, Labs & Maintenance</span></span></label>}
      </div>
    </FormSheet>
  );
}

/* ======================= Outing & Visitors ======================= */
function OutingPage() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const approver = useApprover();
  const [view, setView] = useState('passes');
  const [res] = useShared('res', RES0);
  const [hostels] = useShared('hostels', HOSTELS0);
  const [allPasses, setPasses] = useShared('passes', PASSES0);
  const [allVisits, setVisits] = useShared('visits', VISITS0);
  const sc = useScope(hostels);
  const RA = Object.fromEntries(res.map((r) => [r.id, r]));
  // A warden sees passes and visitors of their own hostel only
  const passes = allPasses.filter((p) => sc.sees(RA[p.r]?.h));
  const myRes = res.filter((r) => sc.sees(r.h));
  // Dates pick the pass history (returned and rejected). Passes that need attention always show.
  const [per, setPer] = useState(PERIODS.last30);
  const [vper, setVper] = useState(PERIODS.last30);
  const visits = allVisits.filter((v) => sc.sees(RA[v.r]?.h) && offIn(vper, v.d));
  const [st, setSt] = useState('open');
  const [q, setQ] = useState('');
  const [newPass, setNewPass] = useState(false);
  const [newVisit, setNewVisit] = useState(false);
  const [reject, setReject] = useState(null);
  const [open, setOpen] = useState(null);
  const R = Object.fromEntries(res.map((r) => [r.id, r]));
  const by = (s) => passes.filter((p) => shownStatus(p) === s);
  const late = by('Late');
  const upd = (p, ch) => { const before = passes; setPasses((x) => x.map((y) => (y.id === p.id ? { ...y, ...ch } : y))); return before; };
  const approve = (p) => { const b = upd(p, { status: 'Approved', by: 'you' }); toast({ title: `Approved: ${R[p.r].name}`, body: `${p.type} with ${p.withName} · ${when(p.from)}. Parent told on WhatsApp.`, undo: () => setPasses(b) }); };
  const markOut = (p) => {
    if (p.status === 'Waiting') { toast({ title: 'Outing waiting for approval', body: `${R[p.r].name} cannot go out until ${wardenOf(R[p.r].h)} approves it.`, tone: 'bad' }); return; }
    const b = upd(p, { status: 'Out', out: { d: 0, t: NOW } }); toast({ title: `${R[p.r].first} went out at ${fmtT(NOW)}`, body: `With ${p.withName}. Parent told. Back by ${when(p.to)}.`, undo: () => setPasses(b) });
  };
  const markBack = (p) => {
    const lateMin = p.to.d < 0 ? 600 : p.to.d === 0 ? Math.max(0, NOW - p.to.t) : 0;
    const b = upd(p, { status: 'Returned', back: { d: 0, t: NOW }, late: lateMin || undefined });
    toast({ title: `${R[p.r].first} is back at ${fmtT(NOW)}`, body: lateMin ? `${lateBy(lateMin)} late. Write an incident if needed.` : 'On time. Parent told.', undo: () => setPasses(b) });
  };
  const histIn = (p) => ['Waiting', 'Approved', 'Out', 'Late'].includes(shownStatus(p)) || offIn(per, p.from.d);
  const rows = passes.filter((p) => { const s = shownStatus(p); return histIn(p) && (st === 'all' || (st === 'open' ? ['Waiting', 'Approved', 'Out', 'Late'].includes(s) : st === 'Out' ? s === 'Out' || s === 'Late' : s === st)) && (!q || (R[p.r].name + p.withName + p.id + p.reason).toLowerCase().includes(q.toLowerCase())); })
    .sort((a, b) => ['Late', 'Waiting', 'Out', 'Approved', 'Returned', 'Rejected'].indexOf(shownStatus(a)) - ['Late', 'Waiting', 'Out', 'Approved', 'Returned', 'Rejected'].indexOf(shownStatus(b)));
  const actions = (p) => {
    const s = shownStatus(p); const r = R[p.r];
    if (!canEdit) return null;
    if (s === 'Waiting') return approver(r.h) ? <div className="flex gap-1.5"><Button size="sm" variant="soft" icon={I.Check} onClick={() => approve(p)}>Approve</Button><Button size="sm" variant="ghost" onClick={() => setReject(p)}>Reject</Button></div> : <span className="text-[12px] text-ink3 whitespace-nowrap">With {wardenOf(r.h)}</span>;
    if (s === 'Approved') return <Button size="sm" variant="secondary" icon={I.LogOut} onClick={() => markOut(p)}>Mark out</Button>;
    if (s === 'Out' || s === 'Late') return <Button size="sm" variant={s === 'Late' ? 'primary' : 'secondary'} icon={I.LogIn} onClick={() => markBack(p)}>Returned</Button>;
    return null;
  };
  const inNow = allVisits.filter((v) => sc.sees(RA[v.r]?.h) && v.d === 0 && v.out == null);
  return (
    <div>
      <ModuleHead sub="Outing and leave passes, and who came to visit"
        actions={<>
          <Button variant="secondary" icon={I.IdCard} onClick={() => { setView('visitors'); setNewVisit(true); }}>Record visitor</Button>
          <Button variant="primary" icon={I.DoorOpen} onClick={() => setNewPass(true)}>New outing pass</Button>
        </>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Segmented value={view} onChange={setView} className="self-start" options={[{ value: 'passes', label: 'Outing passes', icon: I.DoorOpen }, { value: 'visitors', label: 'Visitors', icon: I.IdCard }]} />
        {view === 'passes' && (
          <>
            {late.map((p) => (
              <Banner key={p.id} tone="bad" title={`${R[p.r].name} not returned (due ${fmtT(p.to.t)}).`}
                action={canEdit && <div className="flex gap-2 shrink-0"><Button size="sm" variant="secondary" icon={I.Phone} onClick={() => toast({ title: `Calling ${p.withName}`, body: `${p.withPhone} · ${p.withRel}`, tone: 'info' })}>Call</Button><Button size="sm" variant="primary" onClick={() => markBack(p)}>Mark returned</Button></div>}>
                Out with {p.withName} ({p.withRel.toLowerCase()}) since {fmtT(p.out.t)}. {wardenOf(R[p.r].h)} was alerted.
              </Banner>
            ))}
            <Stats items={[
              { label: 'Waiting for approval', value: String(by('Waiting').length), sub: 'Weekend requests', icon: I.Hourglass, tone: 'warn', onClick: () => setSt('Waiting') },
              { label: 'Out now', value: String(by('Out').length + late.length), sub: `${late.length} late`, icon: I.LogOut, tone: late.length ? 'bad' : 'info', onClick: () => setSt('Out') },
              { label: 'Approved, not gone', value: String(by('Approved').length), sub: 'Leaving soon', icon: I.CircleCheck, onClick: () => setSt('Approved') },
              { label: `Back · ${per.label.toLowerCase()}`, value: String(by('Returned').filter(histIn).length), sub: `${passes.filter((p) => p.status === 'Returned' && p.late && histIn(p)).length} came back late`, icon: I.LogIn, tone: 'ok', onClick: () => setSt('Returned') },
            ]} />
            <Card className="overflow-hidden">
              <Toolbar>
                <SearchBox id="op-q" value={q} onChange={setQ} placeholder="Student, going with, or pass no." />
                <DatePeriod id="op-per" value={per} onChange={setPer} className="w-full @md:w-auto" />
                <ExportButton what="outing passes" />
              </Toolbar>
              <div className="px-3 pt-3"><Chips value={st} onChange={setSt} options={[{ value: 'open', label: 'Needs attention', count: by('Waiting').length + by('Approved').length + by('Out').length + late.length }, { value: 'Waiting', label: 'Waiting', count: by('Waiting').length }, { value: 'Out', label: 'Out now', count: by('Out').length + late.length }, { value: 'Returned', label: 'Returned', count: by('Returned').filter(histIn).length }, { value: 'Rejected', label: 'Rejected', count: by('Rejected').filter(histIn).length }, { value: 'all', label: 'All' }]} /></div>
              <p className="px-4 pt-2 text-[12.5px] text-ink3">Returned and rejected passes from <b className="font-semibold text-ink2">{fmtRange(per)}</b>. Passes waiting or out always show.</p>
              <DataList rows={rows} minWidth={960} onRow={setOpen}
                empty={<Empty icon={I.CircleCheck} title="Nothing here" body={st === 'Waiting' ? 'No outing requests waiting. You are up to date.' : ['Returned', 'Rejected', 'all'].includes(st) ? `No passes with this status between ${fmtRange(per)}.` : 'No passes with this status.'} />}
                columns={[
                  { key: 'n', label: 'Student', render: (p) => <div className="flex items-center gap-3"><Avatar name={R[p.r].name} size={34} /><div className="min-w-0"><p className="font-semibold leading-tight">{R[p.r].name}</p><p className="text-[12px] text-ink3">{clsOf(R[p.r])} · Room {R[p.r].room}</p></div></div> },
                  { key: 't', label: 'Type', nowrap: true, render: (p) => <><p>{p.type}</p><p className="text-[12px] text-ink3 font-mono">{p.id}</p></> },
                  { key: 'w', label: 'Going with', render: (p) => <><p className="leading-tight">{p.withName}</p><p className="text-[12px] text-ink3">{p.withRel}</p></> },
                  { key: 'f', label: 'From and to', nowrap: true, render: (p) => <><p>{when(p.from)}</p><p className={cx('text-[12px]', isLate(p) ? 'text-bad font-semibold' : 'text-ink3')}>to {when(p.to)}</p></> },
                  { key: 'r', label: 'Reason', render: (p) => <p className="max-w-[220px] line-clamp-2 text-ink2">{p.reason}</p> },
                  { key: 's', label: 'Status', render: (p) => <><Pill tone={passTone[shownStatus(p)]}>{shownStatus(p) === 'Out' ? 'Out now' : shownStatus(p)}</Pill>{p.status === 'Returned' && p.late ? <p className="text-[12px] text-warn font-semibold mt-0.5">{lateBy(p.late)} late</p> : null}</> },
                  { key: 'x', label: '', render: (p) => <div onClick={(e) => e.stopPropagation()}>{actions(p)}</div> },
                ]}
                mobile={(p) => ({ title: R[p.r].name, sub: `${p.type} with ${p.withName} · ${when(p.from)}`, avatar: R[p.r].name, pills: [<Pill key="s" tone={passTone[shownStatus(p)]} className="!h-[22px] !text-[11.5px]">{shownStatus(p) === 'Out' ? 'Out now' : shownStatus(p)}</Pill>] })}
                footer={`Showing ${rows.length} · every pass is a Gate Pass of kind Hostel Outing`} />
            </Card>
          </>
        )}
        {view === 'visitors' && (
          <>
            <Banner tone="info" icon={I.Clock} title="Visiting hours: Sundays, 10:00 AM to 1:00 PM.">Only people on the student’s list can meet without the warden’s approval. Every visitor meets one named student.</Banner>
            <Card className="overflow-hidden">
              <CardHead title="Visitor log" sub={`${inNow.length} in the hostel now`} icon={I.IdCard} />
              <Toolbar className="border-t">
                <DatePeriod id="vis-per" value={vper} onChange={setVper} className="w-full @md:w-auto" />
                <ExportButton what="hostel visitor log" />
              </Toolbar>
              <DataList rows={visits} minWidth={860}
                empty={<Empty icon={I.IdCard} title="No visitors in these dates" body={`Nobody visited between ${fmtRange(vper)}. Pick a longer period, or record a visitor when they come in.`} action={canEdit && <Button variant="primary" icon={I.Plus} onClick={() => setNewVisit(true)}>Record visitor</Button>} />}
                columns={[
                  { key: 'd', label: 'Date', nowrap: true, render: (v) => dayWord(v.d) },
                  { key: 's', label: 'Came to meet', render: (v) => <div className="flex items-center gap-3"><Avatar name={R[v.r].name} size={32} /><div><p className="font-semibold leading-tight">{R[v.r].name}</p><p className="text-[12px] text-ink3">{clsOf(R[v.r])} · Room {R[v.r].room}</p></div></div> },
                  { key: 'v', label: 'Visitor', render: (v) => <><p className="leading-tight">{v.name}</p><p className="text-[12px] text-ink3">{v.rel} · {v.phone}</p></> },
                  { key: 'i', label: 'In and out', nowrap: true, render: (v) => <><p>{fmtT(v.in)} → {v.out != null ? fmtT(v.out) : <b className="font-semibold text-brand">inside</b>}</p>{v.note && <p className="text-[12px] text-ink3 max-w-[200px] truncate">{v.note}</p>}</> },
                  { key: 'ok', label: 'Allowed by', render: (v) => v.ok === 'list' ? <Pill tone="ok" dot>On the list</Pill> : <Pill tone="info">Warden approved</Pill> },
                  { key: 'x', label: '', render: (v) => canEdit && v.out == null && <Button size="sm" variant="secondary" icon={I.LogOut} onClick={() => { const b = visits; setVisits((x) => x.map((y) => (y.id === v.id ? { ...y, out: NOW } : y))); toast({ title: `${v.name} left at ${fmtT(NOW)}`, undo: () => setVisits(b) }); }}>Mark out</Button> },
                ]}
                mobile={(v) => ({ title: `${v.name} → ${R[v.r].name}`, sub: `${dayWord(v.d)} · ${fmtT(v.in)} to ${v.out != null ? fmtT(v.out) : 'inside now'}`, avatar: v.name, pills: [v.ok === 'list' ? <Pill key="o" tone="ok" className="!h-[22px] !text-[11.5px]">On the list</Pill> : <Pill key="o" tone="info" className="!h-[22px] !text-[11.5px]">Warden approved</Pill>], right: canEdit && v.out == null ? <Button size="sm" variant="secondary" onClick={() => { setVisits((x) => x.map((y) => (y.id === v.id ? { ...y, out: NOW } : y))); toast({ title: `${v.name} left at ${fmtT(NOW)}` }); }}>Out</Button> : null })}
                footer={`${visits.length} visitor${visits.length === 1 ? '' : 's'} · ${vper.label.toLowerCase()} · ${fmtRange(vper)}`} />
            </Card>
          </>
        )}
      </div>

      <PassSheet open={newPass} onClose={() => setNewPass(false)} res={myRes} passes={allPasses} onSave={(p) => { setPasses((x) => [p, ...x]); setSt('Waiting'); setView('passes'); }} onUndo={(p) => setPasses((x) => x.filter((y) => y !== p))} />
      <VisitorSheet open={newVisit} onClose={() => setNewVisit(false)} res={myRes} onSave={(v) => setVisits((x) => [v, ...x])} onUndo={(v) => setVisits((x) => x.filter((y) => y !== v))} />
      <RejectSheet p={reject} name={reject ? R[reject.r].name : ''} onClose={() => setReject(null)} onReject={(p, why) => { const b = upd(p, { status: 'Rejected', why, by: 'you' }); toast({ title: `Rejected: ${R[p.r].name}`, body: `${why} · parent told on WhatsApp`, undo: () => setPasses(b) }); }} />
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? `${R[open.r].name} · ${open.type}` : ''} sub={open ? `Gate Pass ${open.id} · Hostel Outing` : ''}
        footer={open ? <><Button variant="ghost" icon={I.Printer} onClick={() => toast({ title: `Printing pass ${open.id}`, body: 'Show it at the gate. Security scans the QR.' })}>Print pass</Button>{canEdit && shownStatus(open) !== 'Returned' && shownStatus(open) !== 'Rejected' && <Button variant="secondary" onClick={() => { const p = open; setOpen(null); if (shownStatus(p) === 'Out' || shownStatus(p) === 'Late') markBack(p); else markOut(p); }}>{shownStatus(open) === 'Out' || shownStatus(open) === 'Late' ? 'Mark returned' : 'Mark out'}</Button>}<Button variant="primary" onClick={() => setOpen(null)}>Done</Button></> : null}>
        {open && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2"><Pill tone={passTone[shownStatus(open)]}>{shownStatus(open) === 'Out' ? 'Out now' : shownStatus(open)}</Pill>{open.by && <span className="text-[12.5px] text-ink3">{open.status === 'Rejected' ? 'Rejected' : 'Approved'} by {open.by === 'you' ? 'you' : open.by}</span>}</div>
            <DL rows={[
              ['Kind', 'Gate Pass · Hostel Outing'], ['Type', open.type === 'Leave' ? 'Leave (overnight)' : 'Outing (same day)'],
              ['Going with', `${open.withName} (${open.withRel})`], ['Their phone', open.withPhone],
              ['From', when(open.from)], ['Back by', when(open.to)],
              ...(open.out ? [['Went out', when(open.out)]] : []), ...(open.back ? [['Came back', `${when(open.back)}${open.late ? ` · ${lateBy(open.late)} late` : ''}`]] : []),
              ['Reason', open.reason], ['Asked by', open.asked], ...(open.why ? [['Why rejected', open.why]] : []),
            ]} />
          </div>
        )}
      </Sheet>
    </div>
  );
}

function RejectSheet({ p, name, onClose, onReject }) {
  const [why, setWhy] = useState('');
  const [tried, setTried] = useState(false);
  useEffect(() => { setWhy(''); setTried(false); }, [p]);
  const err = why.trim().length < 5 ? 'Give a reason. The parent reads it.' : '';
  return (
    <FormSheet open={!!p} onClose={onClose} title={p ? `Reject ${name}’s ${p.type.toLowerCase()}?` : ''} sub="The parent is told the reason on WhatsApp" submitLabel="Reject pass"
      onSubmit={() => { setTried(true); if (err) return false; onReject(p, why.trim()); return true; }}>
      <Field label="Reason" required id="rj-why" error={tried && err} hint="Plain words. The parent reads this."><Textarea id="rj-why" value={why} onChange={setWhy} rows={2} placeholder="Unit test on Monday. Please take him next Sunday." /></Field>
    </FormSheet>
  );
}

function PassSheet({ open, onClose, res, passes, onSave, onUndo }) {
  const toast = useToast();
  const [who, setWho] = useState(null);
  const [type, setType] = useState('Outing');
  const [f, setF] = useState({});
  const [gw, setGw] = useState('');
  const [other, setOther] = useState({ name: '', rel: '', phone: '' });
  const [why, setWhy] = useState('');
  const [tried, setTried] = useState(false);
  useEffect(() => { if (open) { setWho(null); setType('Outing'); setF({ fd: dinput(0), ft: fmtT(NOW), td: dinput(0), tt: '6:00 PM' }); setGw(''); setOther({ name: '', rel: '', phone: '' }); setWhy(''); setTried(false); } }, [open]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const fd = parseD(f.fd || ''), ft = parseT(f.ft || ''), td = parseD(f.td || ''), tt = parseT(f.tt || '');
  const away = who && passes.find((p) => p.r === who.id && (p.status === 'Out' || p.status === 'Waiting' || p.status === 'Approved'));
  const g = who && gw !== 'other' ? who.auth[Number(gw)] : null;
  const err = {
    who: !who ? 'Pick a student who lives in the hostel' : away ? `${who.first} already has a pass (${away.id}, ${shownStatus(away).toLowerCase()})` : '',
    from: fd == null ? 'Date as 09-10-2026' : ft == null ? 'Time as 4:00 PM' : fd < 0 || (fd === 0 && ft < NOW - 30) ? 'Cannot start in the past' : '',
    to: td == null ? 'Date as 09-10-2026' : tt == null ? 'Time as 6:00 PM' : fd != null && ft != null && (td * 1440 + tt <= fd * 1440 + ft) ? 'Must be after the start' : type === 'Outing' && td !== fd ? 'An outing ends the same day. Choose Leave for overnight.' : type === 'Leave' && td === fd ? 'Leave is overnight. Choose Outing for the same day.' : '',
    gw: !who ? '' : gw === '' ? 'Pick who the student goes with' : gw === 'other' && (!other.name.trim() || !other.rel.trim()) ? 'Write the person’s name and relation' : gw === 'other' && !phoneOk(other.phone) ? 'Write a 10-digit mobile number' : '',
    why: why.trim().length < 4 ? 'Give the reason' : '',
  };
  const bad = Object.values(err).some(Boolean);
  const live = (k) => (tried || (k === 'from' || k === 'to')) && err[k];
  return (
    <FormSheet open={open} onClose={onClose} title="New outing pass" sub="Recorded by the hostel, approved by the warden" submitLabel="Save and send for approval" wide
      onSubmit={() => {
        setTried(true); if (bad) return false;
        const p = { id: `GP/26/0${422 + passes.length - PASSES0.length}`, r: who.id, type, from: { d: fd, t: ft }, to: { d: td, t: tt }, withName: g ? g.name : other.name.trim(), withRel: g ? g.rel : other.rel.trim(), withPhone: g ? g.phone : showPhone(other.phone), reason: why.trim(), asked: 'Recorded by the hostel, today', status: 'Waiting' };
        onSave(p);
        toast({ title: `Pass ${p.id} saved for ${who.name}`, body: `Waiting for ${wardenOf(who.h)}’s approval. ${who.first} cannot go out before that.`, undo: () => onUndo(p) });
        return true;
      }}>
      <div className="flex items-center gap-2 text-[13px] text-ink2"><span className="font-semibold text-ink3">Kind</span><Pill tone="brand">Gate Pass · Hostel Outing</Pill><span className="text-ink3">Early pickup at the gate is a Pickup pass in Front Office.</span></div>
      <Field label="Student" required id="ps-who" error={(tried || away) && err.who}><ResidentPicker id="ps-who" res={res} value={who} onChange={(v) => { setWho(v); setGw(''); }} error={!!((tried || away) && err.who)} /></Field>
      <Field label="Type" required id="ps-type"><Segmented value={type} onChange={(v) => { setType(v); if (v === 'Leave' && f.td === f.fd) setF((x) => ({ ...x, td: dinput((parseD(x.fd) ?? 0) + 1) })); if (v === 'Outing') setF((x) => ({ ...x, td: x.fd, tt: '6:00 PM' })); }} options={[{ value: 'Outing', label: 'Outing · same day' }, { value: 'Leave', label: 'Leave · overnight' }]} className="w-full" /></Field>
      <div className="grid @sm:grid-cols-2 gap-3">
        <Field label="From" required id="ps-fd" error={live('from')}><div className="grid grid-cols-[1fr_110px] gap-2"><Input id="ps-fd" value={f.fd || ''} onChange={set('fd')} className="tnum" error={!!live('from')} /><Input aria-label="From time" value={f.ft || ''} onChange={set('ft')} className="tnum" error={!!live('from')} /></div></Field>
        <Field label="Back by" required id="ps-td" error={live('to')}><div className="grid grid-cols-[1fr_110px] gap-2"><Input id="ps-td" value={f.td || ''} onChange={set('td')} className="tnum" error={!!live('to')} /><Input aria-label="Back by time" value={f.tt || ''} onChange={set('tt')} className="tnum" error={!!live('to')} /></div></Field>
      </div>
      <Field label="Going with" required id="ps-gw" error={tried && err.gw} hint={who ? 'A named person. Pick from the student’s list, or write someone else.' : 'Pick the student first'}>
        {who ? (
          <div className="flex flex-wrap gap-2">
            {who.auth.map((a, i) => (
              <button type="button" key={i} onClick={() => setGw(String(i))} className={cx('h-10 px-3.5 rounded-xl text-[13.5px] font-semibold border transition inline-flex items-center gap-2', gw === String(i) ? 'bg-ink text-bg border-ink' : 'bg-surface border-line text-ink2 hover:border-ink3/50')}>{a.name}<span className={cx('text-[11.5px]', gw === String(i) ? 'opacity-90' : 'text-ink3')}>{a.rel}</span></button>
            ))}
            <button type="button" onClick={() => setGw('other')} className={cx('h-10 px-3.5 rounded-xl text-[13.5px] font-semibold border transition', gw === 'other' ? 'bg-ink text-bg border-ink' : 'bg-surface border-line text-ink2 hover:border-ink3/50')}>Someone else</button>
          </div>
        ) : <p className="text-[13px] text-ink3">—</p>}
      </Field>
      {gw === 'other' && (
        <>
          <div className="grid @sm:grid-cols-3 gap-3">
            <Field label="Name" required id="ps-on"><Input id="ps-on" value={other.name} onChange={(e) => setOther({ ...other, name: e.target.value })} placeholder="Ravi Das" /></Field>
            <Field label="Relation" required id="ps-or"><Input id="ps-or" value={other.rel} onChange={(e) => setOther({ ...other, rel: e.target.value })} placeholder="Uncle" /></Field>
            <Field label="Mobile" required id="ps-op"><Input id="ps-op" inputMode="numeric" value={other.phone} onChange={(e) => setOther({ ...other, phone: e.target.value.replace(/[^\d\s]/g, '').slice(0, 11) })} placeholder="98490 12345" error={!!other.phone && !phoneOk(other.phone)} className="tnum" /></Field>
          </div>
          <Summary icon={I.ShieldAlert} tone="warn">{other.name.trim() || 'This person'} is not on {who.first}’s list. The warden should call a parent before approving. Security checks the photo ID at the gate.</Summary>
        </>
      )}
      <Field label="Reason" required id="ps-why" error={tried && err.why}><Textarea id="ps-why" value={why} onChange={setWhy} rows={2} placeholder="Family lunch for grandmother’s birthday" /></Field>
    </FormSheet>
  );
}

function VisitorSheet({ open, onClose, res, onSave, onUndo }) {
  const toast = useToast();
  const { role } = useRole();
  const [who, setWho] = useState(null);
  const [name, setName] = useState('');
  const [rel, setRel] = useState('Father');
  const [phone, setPhone] = useState('');
  const [inT, setInT] = useState(fmtT(NOW));
  const [ok, setOk] = useState(false);
  const [tried, setTried] = useState(false);
  useEffect(() => { if (open) { setWho(null); setName(''); setRel('Father'); setPhone(''); setInT(fmtT(NOW)); setOk(false); setTried(false); } }, [open]);
  const onList = who && who.auth.find((a) => a.name.toLowerCase() === name.trim().toLowerCase());
  const tm = parseT(inT);
  const err = {
    who: !who ? 'Pick the student this visitor has come to meet' : '',
    name: !name.trim() ? 'Write the visitor’s name' : '',
    phone: !phoneOk(phone) ? 'Write a 10-digit mobile number' : '',
    in: tm == null ? 'Time as 10:30 AM' : tm > NOW ? 'Cannot be later than now' : '',
    ok: who && name.trim() && !onList && !ok ? 'Needs the warden’s approval' : '',
  };
  const bad = Object.values(err).some(Boolean);
  return (
    <FormSheet open={open} onClose={onClose} title="Record a visitor" sub="Every hostel visitor meets one named student" submitLabel="Let in"
      onSubmit={() => {
        setTried(true); if (bad) return false;
        const v = { id: `V${Date.now() % 10000}`, d: 0, r: who.id, name: name.trim(), rel, phone: showPhone(phone), in: tm, out: null, ok: onList ? 'list' : 'warden', by: role.person?.name };
        onSave(v);
        toast({ title: `${v.name} is in to meet ${who.first}`, body: onList ? 'On the authorised list' : `Approved by ${role.person?.name || 'the warden'} · noted in the log`, undo: () => onUndo(v) });
        return true;
      }}>
      <Field label="Came to meet" required id="vs-who" error={tried && err.who}><ResidentPicker id="vs-who" res={res} value={who} onChange={(v) => { setWho(v); setOk(false); }} error={!!(tried && err.who)} /></Field>
      {who && (
        <div className="flex flex-wrap gap-2 -mt-1">
          <span className="text-[12.5px] text-ink3 self-center">On {who.first}’s list:</span>
          {who.auth.map((a) => <button type="button" key={a.name} onClick={() => { setName(a.name); setRel(a.rel === 'Local guardian' ? 'Local guardian' : a.rel); setPhone(a.phone); }} className="h-8 px-3 rounded-full bg-sunken text-[13px] font-medium hover:bg-line">{a.name} · {a.rel}</button>)}
        </div>
      )}
      <div className="grid @sm:grid-cols-2 gap-3">
        <Field label="Visitor’s name" required id="vs-name" error={tried && err.name}><Input id="vs-name" value={name} onChange={(e) => setName(e.target.value)} error={tried && !!err.name} placeholder="Suresh Verma" /></Field>
        <Field label="Relation" required id="vs-rel"><Select id="vs-rel" value={rel} onChange={setRel} options={['Father', 'Mother', 'Local guardian', 'Grandparent', 'Uncle', 'Aunt', 'Brother', 'Sister', 'Other']} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Mobile" required id="vs-ph" error={(tried || phone.length > 9) && err.phone}><Input id="vs-ph" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d\s]/g, '').slice(0, 11))} error={(tried || phone.length > 9) && !!err.phone} className="tnum" placeholder="98491 22870" /></Field>
        <Field label="Time in" required id="vs-in" error={err.in}><Input id="vs-in" value={inT} onChange={(e) => setInT(e.target.value)} error={!!err.in} className="tnum" /></Field>
      </div>
      {who && name.trim() && (onList ? (
        <Summary icon={I.ShieldCheck} tone="brand"><b className="font-semibold text-ink">{onList.name} is on {who.first}’s list</b> as {onList.rel.toLowerCase()}. They can meet without approval.</Summary>
      ) : (
        <div className={cx('rounded-xl p-3.5 text-[13.5px] flex flex-col gap-2.5', tried && err.ok ? 'bg-bad/10' : 'bg-warn/12')}>
          <p className="text-ink2 flex gap-2"><I.ShieldAlert size={17} className={cx('shrink-0 mt-0.5', tried && err.ok ? 'text-bad' : 'text-warn')} /><span><b className="font-semibold text-ink">Not on {who.first}’s authorised list.</b> Call a parent to check, then the warden approves.</span></p>
          <label className="flex items-center gap-3"><Switch on={ok} onChange={setOk} label="Warden approved this visit" /><span className="font-semibold">Warden approved this visit</span></label>
          {tried && err.ok && <p className="text-[12.5px] text-bad flex items-center gap-1.5" role="alert"><I.CircleAlert size={14} />{err.ok}</p>}
        </div>
      ))}
      {dt(0).getDay() !== 0 && <p className="text-[12.5px] text-ink3 flex gap-1.5"><I.Info size={14} className="shrink-0 mt-0.5" />Today is not a visiting day. The visit is allowed, and shows as outside visiting hours in reports.</p>}
    </FormSheet>
  );
}

/* ======================= Mess ======================= */
function MessPage() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const { go } = useNav();
  const [view, setView] = useState('menu');
  const [week, setWeek] = useState('this');
  const [menus, setMenus] = useShared('menus', { this: toMenu(MENU_THIS), next: null });
  const [res] = useShared('res', RES0);
  const [passes] = useShared('passes', PASSES0);
  const [exp, setExp] = useShared('mexp', EXP0);
  const [counts, setCounts] = useShared('mcount', { Breakfast: { n: 118, by: 'Ravi Kumar', at: '8:10 AM' } });
  const [edit, setEdit] = useState(null);
  const [count, setCount] = useState(null);
  const [addExp, setAddExp] = useState(false);
  const [copy, setCopy] = useState(false);
  const [per, setPer] = useState(PERIODS.thismonth);
  const { role } = useRole();
  // Mess fee collection is fee information: only for people with Fee Management. The defaulters link needs that page.
  const seesFees = !!role.access.fees;
  const seesDefaulters = pagesFor('fees', role.access.fees, role.id).some((p) => p.id === 'defaulters');
  const live = res.filter((r) => !r.left && !r.arriving);
  const awayN = live.filter((r) => awayMap(passes)[r.id]).length;
  const expected = live.length - awayN;
  const menu = menus[week];
  const doCopy = () => { const before = menus; setMenus((m) => ({ ...m, next: JSON.parse(JSON.stringify(m.this)) })); setWeek('next'); toast({ title: 'This week’s menu copied to 12–18 Oct', body: 'Change any meal by tapping it. Boarders see it on Sunday evening.', undo: () => setMenus(before) }); };
  const octSpent = exp.filter((e) => e.d >= -8).reduce((a, e) => a + e.amt, 0) + 41860;
  // Spent in the chosen dates: the bills listed, plus about ₹10,600 a day for older days not listed here
  const expIn = exp.filter((e) => offIn(per, e.d));
  const listedFrom = isoOff(-7);
  const dayN = (iso) => Math.round(new Date(iso + 'T12:00') / 864e5);
  const olderDays = Math.max(0, Math.min(dayN(per.to), dayN(listedFrom) - 1) - dayN(per.from) + 1);
  const perSpent = expIn.reduce((a, e) => a + e.amt, 0) + olderDays * 10615;
  const perDays = periodDays(per);
  return (
    <div>
      <ModuleHead sub="Weekly menu, meals eaten and what the mess spends"
        actions={<>
          <Button variant="secondary" icon={I.Copy} onClick={() => setCopy(true)}>Copy menu to next week</Button>
          <Button variant="primary" icon={I.Plus} onClick={() => { setView('money'); setAddExp(true); }}>Add mess expense</Button>
        </>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Segmented value={view} onChange={setView} className="self-start" options={[{ value: 'menu', label: 'Menu', icon: I.UtensilsCrossed }, { value: 'count', label: 'Head count', icon: I.Users }, { value: 'money', label: 'Expenses & fees', icon: I.IndianRupee }]} />

        {view === 'menu' && (
          <Card className="overflow-hidden">
            <div className="flex flex-col @md:flex-row @md:items-center justify-between gap-3 px-4 @md:px-5 py-3.5 border-b border-line">
              <Segmented value={week} onChange={setWeek} options={[{ value: 'this', label: 'This week · 5–11 Oct' }, { value: 'next', label: 'Next week · 12–18 Oct' }]} />
              <p className="text-[12.5px] text-ink3">Tap a meal to change it. Calories and protein are per plate.</p>
            </div>
            {!menu ? (
              <Empty icon={I.UtensilsCrossed} title="No menu for 12–18 Oct yet" body="Copy this week’s menu and change what you need. Due Thu 15 Oct (Dussehra week)." action={canEdit && <Button variant="primary" icon={I.Copy} onClick={doCopy}>Copy this week’s menu</Button>} />
            ) : (
              <div className="overflow-x-auto scroll-thin">
                <table className="w-full text-left text-[13.5px]" style={{ minWidth: 820 }}>
                  <thead><tr className="text-[12px] text-ink3 font-semibold border-b border-line"><th className="pl-5 pr-3 py-3 w-24">Day</th>{MEALS.map(([m, t]) => <th key={m} className="px-3 py-3 font-semibold">{m} <span className="font-normal">· {t}</span></th>)}</tr></thead>
                  <tbody>
                    {Object.entries(menu).map(([day, meals]) => {
                      const today = week === 'this' && day === 'Fri';
                      return (
                        <tr key={day} className={cx('border-b border-line/70 last:border-0 align-top', today && 'bg-brand/5')}>
                          <td className="pl-5 pr-3 py-3"><p className="font-semibold">{day}</p>{today && <Pill tone="brand" className="!h-5 !text-[11px] mt-1">Today</Pill>}</td>
                          {meals.map((m, i) => (
                            <td key={i} className="px-1.5 py-1.5">
                              <button disabled={!canEdit} onClick={() => setEdit({ day, i, m })} className="w-full text-left rounded-xl px-2 py-1.5 hover:bg-sunken/70 transition disabled:hover:bg-transparent">
                                <span className="block leading-snug">{m.dish}</span>
                                <span className="block text-[12px] text-ink3 tnum mt-0.5">≈ {m.kcal} kcal · {m.prot} g protein</span>
                              </button>
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {menu && <div className="px-5 py-3 border-t border-line text-[12.5px] text-ink3">Chicken on Wednesday and Sunday, egg on Friday, each with a veg choice. 14 boarders take veg only.</div>}
          </Card>
        )}

        {view === 'count' && (
          <Split side={340} className="[&>*]:min-w-0">
            <Card>
              <CardHead title="Today · Friday 9 Oct" sub={`Expected = boarders in the hostel, not on outing or leave: ${expected}`} icon={I.Utensils} />
              <ul className="px-2 pb-2">
                {MEALS.map(([m, t], i) => {
                  const c = counts[m]; const past = i === 0 || (i === 1 && NOW > 760);
                  return (
                    <li key={m} className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-sunken/60">
                      <span className={cx('w-10 h-10 rounded-xl grid place-items-center shrink-0', c ? 'bg-ok/10 text-ok' : 'bg-sunken text-ink3')}>{c ? <I.CheckCheck size={18} /> : <I.Clock size={18} />}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[14.5px]">{m} <span className="text-ink3 font-normal text-[13px]">· {t}</span></p>
                        <p className="text-[12.5px] text-ink3 truncate">{c ? `${c.n} ate of ${expected} expected · counted by ${c.by} at ${c.at}` : past ? 'Not counted yet' : `${menus.this.Fri[i].dish}`}</p>
                      </div>
                      {c ? <b className={cx('font-display text-[18px] tnum', c.n < expected - 3 && 'text-warn')}>{c.n}</b>
                        : canEdit && <Button size="sm" variant={past ? 'soft' : 'ghost'} onClick={() => setCount(m)}>Record</Button>}
                      {c && canEdit && <Button size="sm" variant="ghost" icon={I.Pencil} aria-label={`Change ${m} count`} onClick={() => setCount(m)} />}
                    </li>
                  );
                })}
              </ul>
              <p className="px-5 pb-4 text-[12.5px] text-ink3">1 plate goes to the sick room (Rahul Verma). Day scholars do not eat in the hostel mess.</p>
            </Card>
            <Col>
              <Card>
                <CardHead title="This week" sub="Plates served, all meals" icon={I.ChartColumn} />
                <div className="px-3 pb-2"><Bars data={[{ k: 'Mon', v: 488, v2: 492 }, { k: 'Tue', v: 490, v2: 492 }, { k: 'Wed', v: 486, v2: 488 }, { k: 'Thu', v: 479, v2: 484 }, { k: 'Fri', v: Object.values(counts).reduce((a, c) => a + c.n, 0), v2: expected * 4 }]} max={520} ticks={[0, 250, 500]} ariaLabel="Plates served this week" /></div>
                <div className="px-5 pb-4"><Legend items={[['bg-brand', 'Served'], ['bg-ink3/50', 'Expected']]} /></div>
              </Card>
              <Card>
                <CardHead title="Mess by month" sub="Plates served each day · go back to earlier months" icon={I.CalendarDays} />
                <div className="px-5 pb-5"><MessMonth perDay={492} /></div>
              </Card>
            </Col>
          </Split>
        )}

        {view === 'money' && (
          <>
            <Stats items={[
              { label: `Spent · ${per.label.toLowerCase()}`, value: inr(perSpent), sub: `${fmtRange(per)} · ${perDays} day${perDays === 1 ? '' : 's'}`, icon: I.Wallet },
              { label: 'Spent in September', value: inr(318450), sub: '30 days', icon: I.History },
              { label: 'Cost per boarder a day', value: inr(Math.round(perSpent / perDays / live.length)), sub: `${live.length} boarders`, icon: I.Utensils, tone: 'brand' },
              { label: 'Mess part of hostel fees', value: inr(9000), sub: 'A quarter, per boarder', icon: I.ReceiptIndianRupee },
            ]} />
            <Split side={340} className="[&>*]:min-w-0">
              <Card className="overflow-hidden">
                <CardHead title="Mess expenses" sub="Each one goes to Finance, Expenses (and the Day Book when paid)" icon={I.ReceiptText} />
                <Toolbar className="border-t">
                  <DatePeriod id="me-per" value={per} onChange={setPer} className="w-full @md:w-auto" />
                  <ExportButton what="mess expenses" />
                </Toolbar>
                <DataList rows={expIn} minWidth={680}
                  empty={<Empty icon={I.ReceiptText} title="No mess bills listed in these dates" body={olderDays ? `Bills before ${dlong(-7)} are in Finance, Expenses. The total above includes them.` : `No mess bills between ${fmtRange(per)}.`} />}
                  columns={[
                    { key: 'd', label: 'Date', nowrap: true, render: (e) => dayWord(e.d) },
                    { key: 'i', label: 'Item', render: (e) => <><p className="font-semibold leading-tight">{e.item}</p><p className="text-[12px] text-ink3">{e.vendor || 'No vendor'}</p></> },
                    { key: 'b', label: 'Bill', render: (e) => e.bill ? <span className="inline-flex items-center gap-1 text-[13px] text-ink2"><I.Paperclip size={14} />Photo</span> : <span className="text-[13px] text-warn">Missing</span> },
                    { key: 'a', label: 'Amount', align: 'right', render: (e) => <b className="font-semibold">{inr(e.amt)}</b> },
                    { key: 's', label: 'In Finance', render: (e) => <Pill tone={e.st === 'Paid' ? 'ok' : 'info'}>{e.st === 'Paid' ? 'Paid · Day Book' : 'Expense, not paid'}</Pill> },
                  ]}
                  mobile={(e) => ({ title: `${e.item} · ${inr(e.amt)}`, sub: `${dayWord(e.d)} · ${e.vendor || 'No vendor'}`, icon: 'ReceiptText', pills: [<Pill key="s" tone={e.st === 'Paid' ? 'ok' : 'info'} className="!h-[22px] !text-[11.5px]">{e.st === 'Paid' ? 'Paid' : 'Not paid'}</Pill>] })}
                  footer={`${expIn.length} bill${expIn.length === 1 ? '' : 's'} · ${inr(expIn.reduce((a, e) => a + e.amt, 0))} · ${fmtRange(per)}`} />
              </Card>
              <Col>
                {seesFees && <Card>
                  <CardHead title="Mess fees" sub="Inside the hostel fee, Oct–Dec quarter" icon={I.IndianRupee} />
                  <div className="px-5 pb-5 flex flex-col gap-3">
                    <div>
                      <div className="flex justify-between text-[13.5px] mb-1.5 tnum"><span><b className="font-semibold">{live.filter((r) => !r.due).length}</b> of {live.length} boarders paid</span><span className="text-ink3">{Math.round((live.filter((r) => !r.due).length / live.length) * 100)}%</span></div>
                      <Progress value={(live.filter((r) => !r.due).length / live.length) * 100} />
                    </div>
                    <ul className="divide-y divide-line/70 text-[14px]">
                      {[['Mess part collected', inr(live.filter((r) => !r.due).length * 9000)], ['Mess part still due', inr(live.filter((r) => r.due).length * 9000)], ['Spent this quarter so far', inr(octSpent)]].map(([k, v]) => <li key={k} className="flex justify-between py-2"><span className="text-ink2">{k}</span><b className="font-semibold tnum">{v}</b></li>)}
                    </ul>
                    {seesDefaulters && <Button variant="secondary" icon={I.UserX} onClick={() => go('fees', { page: 'defaulters' })}>See who has not paid</Button>}
                  </div>
                </Card>}
                <Suggestion title="Vegetables cost more this month" source="Mess expenses, 1 Sep to 9 Oct 2026"
                  actions={canEdit ? <><Button size="sm" variant="primary" onClick={() => toast({ title: 'Noted for the next menu', body: 'Seasonal vegetables marked for 12–18 Oct', tone: 'info' })}>Use seasonal vegetables</Button><Button size="sm" variant="ghost" onClick={() => toast({ title: 'Thanks. We will improve these suggestions.', tone: 'info' })}>Not useful</Button></> : null}>
                  Vegetable bills are <b className="font-semibold text-ink">18% higher</b> than in September for the same number of plates. Beans and capsicum went up the most; dondakaya and cabbage are cheaper now.
                </Suggestion>
              </Col>
            </Split>
          </>
        )}
      </div>

      <MealSheet x={edit} onClose={() => setEdit(null)} onSave={(day, i, m) => {
        const before = menus;
        setMenus((all) => ({ ...all, [week]: { ...all[week], [day]: all[week][day].map((y, j) => (j === i ? m : y)) } }));
        toast({ title: `${day === 'Fri' && week === 'this' ? 'Today’s' : `${day}`} ${MEALS[i][0].toLowerCase()} updated`, body: 'Boarders and parents see the new menu in the app', undo: () => setMenus(before) });
      }} />
      <CountSheet meal={count} expected={expected} prev={count && counts[count]} onClose={() => setCount(null)} onSave={(m, n, note) => {
        const before = counts;
        setCounts((c) => ({ ...c, [m]: { n, by: 'you', at: fmtT(NOW), note } }));
        toast({ title: `${m}: ${n} plates recorded`, body: n < expected ? `${expected - n} fewer than expected${note ? ` · ${note}` : ''}` : 'Same as expected', undo: () => setCounts(before) });
      }} />
      <ExpenseSheet open={addExp} onClose={() => setAddExp(false)} onSave={(e) => { setExp((x) => [e, ...x]); }} onUndo={(e) => setExp((x) => x.filter((y) => y !== e))} />
      <ConfirmSheet open={copy} onClose={() => setCopy(false)} title="Copy this week’s menu to 12–18 Oct?" sub={menus.next ? 'Next week already has a menu. It will be replaced.' : 'You can change any meal after copying.'}
        confirmLabel={menus.next ? 'Replace next week’s menu' : 'Copy menu'} danger={!!menus.next} onConfirm={() => { setView('menu'); doCopy(); }} />
    </div>
  );
}

function MealSheet({ x, onClose, onSave }) {
  const [dish, setDish] = useState('');
  const [kcal, setKcal] = useState('');
  const [prot, setProt] = useState('');
  const [tried, setTried] = useState(false);
  useEffect(() => { if (x) { setDish(x.m.dish); setKcal(String(x.m.kcal)); setProt(String(x.m.prot)); setTried(false); } }, [x]);
  const err = { dish: dish.trim().length < 3 ? 'Write what is served' : '', kcal: kcal && (+kcal < 50 || +kcal > 1500) ? 'Between 50 and 1,500' : '', prot: prot && +prot > 80 ? 'At most 80 g' : '' };
  return (
    <FormSheet open={!!x} onClose={onClose} title={x ? `${x.day} · ${MEALS[x.i][0]}` : ''} sub={x ? `Served at ${MEALS[x.i][1]}` : ''} submitLabel="Save meal"
      onSubmit={() => { setTried(true); if (err.dish || err.kcal || err.prot) return false; onSave(x.day, x.i, { dish: dish.trim(), kcal: +kcal || 0, prot: +prot || 0 }); return true; }}>
      <Field label="What is served" required id="ml-dish" error={tried && err.dish}><Textarea id="ml-dish" value={dish} onChange={setDish} rows={2} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Calories per plate" id="ml-kcal" error={err.kcal} hint="Optional"><Input id="ml-kcal" inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value.replace(/\D/g, '').slice(0, 4))} error={!!err.kcal} className="tnum" /></Field>
        <Field label="Protein (g)" id="ml-prot" error={err.prot} hint="Optional"><Input id="ml-prot" inputMode="numeric" value={prot} onChange={(e) => setProt(e.target.value.replace(/\D/g, '').slice(0, 3))} error={!!err.prot} className="tnum" /></Field>
      </div>
    </FormSheet>
  );
}

function CountSheet({ meal, expected, prev, onClose, onSave }) {
  const [n, setN] = useState('');
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  useEffect(() => { if (meal) { setN(String(prev ? prev.n : expected)); setNote(prev?.note || ''); setTried(false); } }, [meal]);
  const v = Number(n);
  const err = !n ? 'Write how many ate' : v > expected + 5 ? `More than the boarders in the hostel (${expected}). Count again.` : '';
  return (
    <FormSheet open={!!meal} onClose={onClose} title={meal ? `${meal} head count` : ''} sub={`Expected ${expected}: boarders in the hostel, not on outing or leave`} submitLabel="Save count"
      onSubmit={() => { setTried(true); if (err) return false; onSave(meal, v, note.trim()); return true; }}>
      <Field label="Plates served" required id="hc-n" error={(tried || v > expected + 5) && err}><Input id="hc-n" inputMode="numeric" value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, '').slice(0, 3))} error={!!((tried || v > expected + 5) && err)} className="tnum w-32 !text-[18px] !h-12" /></Field>
      {n && v < expected && <Field label="Why fewer?" id="hc-note" hint="Optional"><Input id="hc-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="2 fasting for Navratri" /></Field>}
    </FormSheet>
  );
}

function ExpenseSheet({ open, onClose, onSave, onUndo }) {
  const toast = useToast();
  const [f, setF] = useState({});
  const [tried, setTried] = useState(false);
  useEffect(() => { if (open) { setF({ date: dinput(0), item: '', amt: '', vendor: '', bill: false, paid: false }); setTried(false); } }, [open]);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const dOff = parseD(f.date || '');
  const amt = Number(String(f.amt || '').replace(/,/g, ''));
  const err = {
    date: dOff == null ? 'Use the form 09-10-2026' : dOff > 0 ? 'Cannot be a future date' : '',
    item: !(f.item || '').trim() ? 'Write what was bought' : '',
    amt: !f.amt ? 'Write the amount' : !(amt > 0) ? 'Amount must be more than ₹0' : amt > 200000 ? 'Above ₹2,00,000. Record it in Finance as a purchase.' : '',
  };
  const bad = Object.values(err).some(Boolean);
  return (
    <FormSheet open={open} onClose={onClose} title="Add mess expense" sub="Goes to Finance, Expenses under Hostel mess" submitLabel="Add expense"
      onSubmit={() => {
        setTried(true); if (bad) return false;
        const e = { id: `ME-0${419 + Math.floor(Math.random() * 80)}`, d: dOff, item: f.item.trim(), vendor: f.vendor.trim(), amt, bill: f.bill, st: f.paid ? 'Paid' : 'In Finance' };
        onSave(e);
        toast({ title: `${inr(amt)} for ${e.item} added`, body: f.paid ? 'In Finance, Expenses and today’s Day Book (cash)' : 'In Finance, Expenses. The Accountant pays it.', undo: () => onUndo(e) });
        return true;
      }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" required id="me-date" error={err.date}><Input id="me-date" value={f.date || ''} onChange={(e) => set('date')(e.target.value)} error={!!err.date} className="tnum" /></Field>
        <Field label="Amount (₹)" required id="me-amt" error={(tried || (f.amt && err.amt)) && err.amt}><Input id="me-amt" inputMode="numeric" value={f.amt || ''} onChange={(e) => set('amt')(e.target.value.replace(/[^\d,]/g, '').slice(0, 9))} error={!!((tried || f.amt) && err.amt)} className="tnum" placeholder="6,840" /></Field>
      </div>
      <Field label="Item or head" required id="me-item" error={tried && err.item}>
        <Input id="me-item" value={f.item || ''} onChange={(e) => set('item')(e.target.value)} error={tried && !!err.item} placeholder="Vegetables" />
        <div className="flex flex-wrap gap-1.5">{['Vegetables', 'Milk', 'Rice', 'Dal, oil and spices', 'Chicken', 'Eggs', 'Cooking gas'].map((x) => <button type="button" key={x} onClick={() => set('item')(x)} className="h-8 px-3 rounded-full bg-sunken text-[13px] font-medium hover:bg-line">{x}</button>)}</div>
      </Field>
      <Field label="Vendor" id="me-vendor" hint="Optional"><Input id="me-vendor" value={f.vendor || ''} onChange={(e) => set('vendor')(e.target.value)} placeholder="Rythu Bazaar, Kukatpally" /></Field>
      <Field label="Bill photo" id="me-bill" hint="Optional, but the Accountant asks for it">
        {f.bill ? (
          <div className="flex items-center gap-3 rounded-xl border border-line p-2.5"><span className="w-10 h-10 rounded-xl bg-sunken grid place-items-center text-ink2"><I.FileImage size={19} /></span><div className="flex-1 min-w-0"><p className="font-semibold text-[14px] truncate">bill-09-oct.jpg</p><p className="text-[12.5px] text-ink3">1.2 MB · from the phone camera</p></div><Button type="button" size="sm" variant="ghost" onClick={() => set('bill')(false)}>Remove</Button></div>
        ) : <Button type="button" variant="secondary" icon={I.Camera} className="self-start" onClick={() => set('bill')(true)}>Take or upload photo</Button>}
      </Field>
      <label className="flex items-center gap-3 text-[14px]"><Switch on={!!f.paid} onChange={set('paid')} label="Paid in cash already" /><span><b className="font-semibold">Paid in cash already</b><span className="block text-[12.5px] text-ink3">Also goes in today’s Day Book</span></span></label>
    </FormSheet>
  );
}

/* ======================= Hostel Reports ======================= */
function ReportsPage() {
  const toast = useToast();
  const { go } = useNav();
  const canEdit = useCanEdit();
  const [per, setPer] = useState(PERIODS.thismonth);
  const [res] = useShared('res', RES0);
  const live = res.filter((r) => !r.left);
  // Counted figures for this month, last month and this year; other dates are scaled from this year's daily rate
  const YEAR = { outings: 171, late: 12, absent: 3, visitors: 162, inc: 44, mess: 1384600 };
  const HAND = {
    thismonth: { outings: 14, late: 3, absent: 0, visitors: 7, inc: 7, mess: 105400 },
    lastmonth: { outings: 46, late: 4, absent: 1, visitors: 38, inc: 11, mess: 318450 },
    acyear: YEAR,
  };
  const f = periodDays(per) / 131;
  const P = { label: `${per.label} · ${fmtRange(per)}`, ...(HAND[per.key] || Object.fromEntries(Object.entries(YEAR).map(([k, v]) => [k, Math.round(v * f)]))) };
  const MONTHS5 = [['Jun', '2026-06'], ['Jul', '2026-07'], ['Aug', '2026-08'], ['Sep', '2026-09'], ['Oct', '2026-10']];
  const mIn = (ym) => { const [y, m] = ym.split('-').map(Number); return `${ym}-01` <= per.to && `${ym}-${new Date(y, m, 0).getDate()}` >= per.from; };
  const byMonth = (data) => data.filter((x, i) => mIn(MONTHS5[i][1]));
  const NoMonths = () => <p className="px-5 pb-5 text-[13px] text-ink3">No months from June to October 2026 fall between {fmtRange(per)}.</p>;
  const ex = (w) => () => toast({ title: `Exported ${w}`, body: `${P.label} · Excel, with the school name and your name on top. Logged.` });
  return (
    <div>
      <ModuleHead sub="Occupancy, roll call, outings, incidents, visitors and mess" actions={<Button variant="secondary" icon={I.CalendarClock} onClick={() => toast({ title: 'Scheduled: Hostel summary', body: 'First Monday of each month to Lakshmi Rao and Joseph Thomas' })}>Email every month</Button>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <div className="flex flex-col @md:flex-row @md:items-center gap-2.5">
          <DatePeriod id="hr-per" value={per} onChange={setPer} className="w-full @md:w-auto" />
          <p className="text-[12.5px] text-ink3">Showing: <b className="font-semibold text-ink2">{per.label}</b> · {fmtRange(per)}</p>
        </div>
        <Stats items={[
          { label: 'Beds taken', value: `${live.length} / 132`, sub: `${Math.round((live.length / 132) * 100)}% full`, icon: I.BedDouble, onClick: () => go('hostel', { page: 'rooms' }) },
          { label: 'Outings and leave', value: String(P.outings), sub: `${P.late} came back late`, icon: I.DoorOpen, tone: P.late ? 'warn' : undefined, onClick: () => go('hostel', { page: 'outing' }) },
          { label: 'Absent at roll call', value: String(P.absent), sub: 'Not on any pass', icon: I.Moon, tone: P.absent ? 'bad' : 'ok' },
          { label: 'Mess spent', value: inr(P.mess), sub: fmtRange(per), icon: I.Utensils },
        ]} />
        <Suggestion title="Late returns are mostly on Thursdays" source="Outing passes, 1 Jun to 9 Oct 2026"
          actions={canEdit ? <><Button size="sm" variant="primary" onClick={() => go('hostel', { page: 'settings' })}>Open Hostel Settings</Button><Button size="sm" variant="ghost" onClick={() => toast({ title: 'Thanks. We will improve these suggestions.', tone: 'info' })}>Not useful</Button></> : null}>
          <b className="font-semibold text-ink">8 of 12 late returns</b> this year were weekday evening outings ending at 7:30 PM, when city traffic is heavy. Ending weekday outings at 7:00 PM could avoid most of them.
        </Suggestion>
        <div className="grid @xl:grid-cols-2 gap-5 @lg:gap-6 items-start [&>*]:min-w-0">
          <Card>
            <CardHead title="Occupancy" sub="Beds taken, by hostel and floor" icon={I.BedDouble} action={<Button size="sm" variant="ghost" icon={I.Download} onClick={ex('occupancy')}>Export</Button>} />
            <div className="px-5 pb-5"><HBars labelWidth={118} lowBelow={80} rows={[
              { k: 'Boys · Ground', v: 97, label: '31 / 32' }, { k: 'Boys · First', v: 97, label: '31 / 32' }, { k: 'Boys · Second', v: 94, label: '34 / 36' },
              { k: 'Girls · Ground', v: 94, label: '15 / 16' }, { k: 'Girls · First', v: 81, label: '13 / 16' },
            ]} /></div>
          </Card>
          <Card>
            <CardHead title="Outings by month" sub="Passes used, with late returns" icon={I.ChartColumn} action={<Button size="sm" variant="ghost" icon={I.Download} onClick={ex('outings by month')}>Export</Button>} />
            {byMonth([22, 41, 48, 46, 14]).length ? <div className="px-3 pb-2"><Bars data={MONTHS5.map(([k], i) => ({ k, v: [22, 41, 48, 46, 14][i] })).filter((x, i) => mIn(MONTHS5[i][1]))} max={60} ticks={[0, 20, 40]} ariaLabel="Outings by month" /></div> : <NoMonths />}
            <ul className="px-5 pb-4 text-[13px] divide-y divide-line/70">
              {[['Tejas Naidu, 7 A', '1 late return · 8 Oct, 2 h 22 min'], ['Yash Reddy, 9 A', '2 late returns · 8 Oct and 12 Sep'], ['Charan Rao, 8 B', 'Not back yet today · due 10:30 AM']].map(([a, b]) => <li key={a} className="flex justify-between gap-3 py-2"><span className="font-semibold truncate">{a}</span><span className="text-ink3 text-right">{b}</span></li>)}
            </ul>
          </Card>
          <Card>
            <CardHead title="Roll call absences" sub="Missing at roll call and not on any pass" icon={I.Moon} action={<Button size="sm" variant="ghost" icon={I.Download} onClick={ex('roll call absences')}>Export</Button>} />
            <ul className="px-2 pb-3">
              {[['Sat 3 Oct · night', 'Varun Prasad, 6 B · found in the TV room at 9:45 PM', 'Incident written'], ['Tue 15 Sep · night', 'Akhil Rao, 9 C · stayed back at cricket practice, coach told late', 'Incident written'], ['Fri 24 Jul · morning', 'Sathvik Gupta, 5 A · in the washroom, marked late', 'No action']].map(([d, w, a]) => (
                <li key={d} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/60"><span className="w-9 h-9 rounded-xl bg-bad/10 text-bad grid place-items-center shrink-0"><I.UserX size={17} /></span><div className="min-w-0 flex-1"><p className="font-semibold text-[14px] truncate">{d}</p><p className="text-[12.5px] text-ink3 truncate">{w}</p></div><span className="text-[12px] text-ink3 shrink-0 hidden @sm:block">{a}</span></li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHead title="Incidents by type" sub={P.label} icon={I.NotebookPen} action={<Button size="sm" variant="ghost" icon={I.Download} onClick={ex('incidents by type')}>Export</Button>} />
            <div className="px-5 pb-5 flex flex-col gap-4">
              <HBars unit="" max={Math.max(5, Math.ceil(P.inc * 0.45))} labelWidth={96} rows={[['Discipline', 14], ['Medical', 19], ['Repair', 11]].map(([k, v]) => { const x = Math.round((v / 44) * P.inc); return { k, v: x, label: String(x) }; })} />
              <ul className="grid grid-cols-5 gap-2 text-center">
                {byMonth([['Jun', 6], ['Jul', 9], ['Aug', 11], ['Sep', 11], ['Oct', 7]]).map(([m, n]) => <li key={m} className="rounded-xl bg-sunken/70 py-2"><p className="font-display font-semibold text-[18px] tnum">{n}</p><p className="text-[12px] text-ink3">{m}</p></li>)}
              </ul>
            </div>
          </Card>
          <Card>
            <CardHead title="Mess" sub="Plates served and money spent, by month" icon={I.Utensils} action={<Button size="sm" variant="ghost" icon={I.Download} onClick={ex('mess head counts and expenses')}>Export</Button>} />
            {byMonth([1, 2, 3, 4, 5]).length ? <div className="px-3 pb-2"><Bars data={byMonth([{ k: 'Jun', v: 241200 }, { k: 'Jul', v: 302900 }, { k: 'Aug', v: 309050 }, { k: 'Sep', v: 318450 }, { k: 'Oct', v: 105400 }])} max={360000} ticks={[0, 150000, 300000]} label={(v) => (v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : v ? `₹${Math.round(v / 1000)}k` : '0')} ariaLabel="Mess spending by month" /></div> : <NoMonths />}
            <ul className="px-5 pb-4 text-[13.5px] divide-y divide-line/70">
              {[['Plates served in September', '14,620'], ['Average a day', '487 plates'], ['Cost per plate', inr(22)]].map(([k, v]) => <li key={k} className="flex justify-between py-2"><span className="text-ink2">{k}</span><b className="font-semibold tnum">{v}</b></li>)}
            </ul>
          </Card>
          <Card>
            <CardHead title="Visitors" sub={P.label} icon={I.IdCard} action={<Button size="sm" variant="ghost" icon={I.Download} onClick={ex('visitor log')}>Export</Button>} />
            <ul className="px-5 pb-5 divide-y divide-line/70 text-[14px]">
              {[['Visitors in all', String(P.visitors)], ['On the authorised list', String(P.visitors - Math.ceil(P.visitors / 9))], ['Approved by the warden', String(Math.ceil(P.visitors / 9))], ['Outside visiting hours', String(Math.max(1, Math.round(P.visitors / 12)))]].map(([k, v]) => <li key={k} className="flex justify-between py-2.5"><span className="text-ink2">{k}</span><b className="font-semibold tnum">{v}</b></li>)}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ======================= Hostel Settings ======================= */
function SettingsPage() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const { go } = useNav();
  const [hostels] = useShared('hostels', HOSTELS0);
  const [rules, setRules] = useState('Lights out at 10:00 PM (Class 10: 10:30 PM during exams).\nNo mobile phones in rooms. Phones are kept with the warden and given on Sundays, 5 to 6 PM.\nStudy hour every day, 7:00 to 8:00 PM, in the study hall.\nOutside food only on visiting days.');
  const [meals, setMeals] = useState(MEALS.map((m) => m[0]));
  const [newMeal, setNewMeal] = useState('');
  const { role } = useRole();
  // Links to other modules only for people who have that page
  const toForms = inMenu(role, 'settings');
  const toFeePlans = pagesFor('fees', role.access.fees, role.id).some((p) => p.id === 'structure') && role.access.fees === 'full';
  return (
    <div>
      <ModuleHead sub="Rules, timings, wardens, fees and parent messages" />
      <div className="grid @xl:grid-cols-2 gap-5 @lg:gap-6 items-start [&>*]:min-w-0">
        <Col>
          <Card>
            <CardHead title="Hostel rules" sub="Shown to staff and printed on the allocation letter" icon={I.ScrollText} />
            <div className="px-5 pb-5 flex flex-col gap-3">
              <Textarea id="hs-rules" value={rules} onChange={(v) => canEdit && setRules(v)} rows={6} />
              {canEdit && <Button variant="secondary" icon={I.Save} className="self-start" disabled={!rules.trim()} onClick={() => toast({ title: 'Hostel rules saved', body: 'Printed on new allocation letters from now. Logged.' })}>Save rules</Button>}
            </div>
          </Card>
          <SettingsCard title="Timings" sub="Roll call opens with these times" icon={I.Clock} rows={[
            { title: 'Morning roll call', value: '6:30 AM' }, { title: 'Night roll call', value: '9:30 PM' },
            { title: 'Outing back by (default)', sub: 'Filled in on new outing passes', value: '6:00 PM' },
            { title: 'Visiting hours', sub: 'Visits at other times need the warden’s approval', value: 'Sun, 10 AM–1 PM' },
          ]} />
          <Card>
            <CardHead title="Meals" sub="Used by the menu and head count" icon={I.Utensils} />
            <div className="px-5 pb-5 flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {meals.map((m) => <span key={m} className="inline-flex items-center gap-1.5 h-8 pl-3 pr-1.5 rounded-full bg-sunken text-[13px] font-semibold">{m}{canEdit && meals.length > 1 && <button aria-label={`Remove ${m}`} onClick={() => { const before = meals; setMeals(meals.filter((x) => x !== m)); toast({ title: `${m} removed from meals`, undo: () => setMeals(before) }); }} className="w-5 h-5 grid place-items-center rounded-full hover:bg-line"><I.X size={13} /></button>}</span>)}
              </div>
              {canEdit && (
                <div className="flex gap-2">
                  <Input id="hs-meal" value={newMeal} onChange={(e) => setNewMeal(e.target.value)} placeholder="Add a meal, for example Night milk" />
                  <Button variant="secondary" icon={I.Plus} onClick={() => { const v = newMeal.trim(); if (!v) { toast({ title: 'Write the meal name first', tone: 'bad' }); return; } if (meals.some((m) => m.toLowerCase() === v.toLowerCase())) { toast({ title: `${v} is already a meal`, tone: 'bad' }); return; } setMeals([...meals, v]); setNewMeal(''); toast({ title: `${v} added to meals` }); }}>Add</Button>
                </div>
              )}
            </div>
          </Card>
        </Col>
        <Col>
          <Card>
            <CardHead title="Wardens and outing approvers" sub="The warden of the student’s hostel approves outings" icon={I.UserCog} action={canEdit && toForms && <Button size="sm" variant="ghost" onClick={() => go('settings', { page: 'forms' })}>Forms & Approvals</Button>} />
            <ul className="px-5 pb-4 divide-y divide-line/70">
              {hostels.map((x) => (
                <li key={x.id} className="flex items-center gap-3 py-3">
                  {x.wardens[0] ? <Avatar name={x.wardens[0]} size={36} /> : <span className="w-9 h-9 rounded-full bg-sunken grid place-items-center text-ink3"><I.User size={17} /></span>}
                  <div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px] truncate">{x.wardens[0] || 'No warden yet'}</p><p className="text-[12.5px] text-ink3 truncate">{x.name}{x.helper ? ` · night helper ${x.helper}` : ''}</p></div>
                  <Pill tone={x.wardens[0] ? 'ok' : 'warn'}>{x.wardens[0] ? 'Approves outings' : 'Set a warden'}</Pill>
                </li>
              ))}
            </ul>
            <p className="px-5 pb-4 text-[12.5px] text-ink3">The Principal can approve any pass. More approvers can be added in Settings, Forms & Approvals.</p>
          </Card>
          <Card>
            <CardHead title="Hostel fees" sub="Fee plans from Fee Management" icon={I.ReceiptIndianRupee} action={canEdit && toFeePlans && <Button size="sm" variant="ghost" onClick={() => go('fees', { page: 'structure' })}>Open fee plans</Button>} />
            <div className="divide-y divide-line/70 border-t border-line/70">
              <SettingRow title="Non-AC rooms" sub="Both hostels · includes mess"><span className="text-[14px] font-semibold tnum">{inr(24000)} a quarter</span></SettingRow>
              <SettingRow title="AC rooms" sub="Boys’ hostel, B-25 and B-26 · includes mess"><span className="text-[14px] font-semibold tnum">{inr(32000)} a quarter</span></SettingRow>
              <SettingRow title="When a student checks out" sub="Fees stop from the next quarter"><span className="text-[14px] font-semibold">Next quarter</span></SettingRow>
            </div>
          </Card>
          <SettingsCard title="Messages to parents" sub="Sent on WhatsApp, through Communication" icon={I.MessageCircle} rows={[
            { title: 'When the student goes out', sub: 'With the person’s name and the back-by time', on: true },
            { title: 'When the student is back', on: true },
            { title: 'When the student is late', sub: 'Also to the warden and the Principal', on: true },
            { title: 'Incidents', sub: 'Only when the warden ticks “Tell the parent”', on: true },
            { title: 'Weekly menu', sub: 'Every Sunday evening', on: false },
          ]} />
          <SettingsCard title="Alerts" icon={I.BellRing} rows={[
            { title: 'Absent at night roll call', sub: 'To the warden and the Principal at once', on: true },
            { title: 'Not back by the return time', sub: 'After 15 minutes', on: true },
          ]} />
        </Col>
      </div>
    </div>
  );
}

export const HOSTEL_PAGES = {
  rooms: RoomsPage,
  allocation: AllocationPage,
  rollcall: RollcallPage,
  outing: OutingPage,
  mess: MessPage,
  reports: ReportsPage,
  settings: SettingsPage,
};
