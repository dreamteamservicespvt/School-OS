// Examination & Results: Datesheet, Admit Cards, Marks Entry, Results, Report Cards, Question Papers, Exam Analysis, Exam Settings.
// Example data for Sunrise Public School only. Nothing here talks to a server.
import React, { useMemo, useRef, useState } from 'react';
import * as I from './icons.js';
import { CLASS_7B, FEATURED, STUDENT_PROFILE as PROFILE } from './data.js';
import { cx, Card, CardHead, Button, Pill, Avatar, Field, Input, inputCls, Segmented, Switch, Empty, Sheet, useToast, Kbd } from './ui.jsx';
import { useNav, useRole, Logo } from './shell.jsx';
import {
  ModuleHead, useCanEdit, Stats, Band, SearchBox, Toolbar, Select, Textarea, Chips, DataList, BulkBar, SettingsCard, Banner,
  Suggestion, Progress, HBars, Bars, Legend, DL, Timeline, MoreMenu, FormSheet, ConfirmSheet, Split, Col, ExportButton, TONE_SOFT,
  DatePeriod, PERIODS, fmtRange, CalendarMonth,
} from './kit.jsx';

/* =====================================================================
   Sample data
   ===================================================================== */
const SUBJECTS6 = ['English', 'Telugu', 'Hindi', 'Mathematics', 'Science', 'Social Studies'];
const SHORT = { English: 'Eng', Telugu: 'Tel', Hindi: 'Hin', Mathematics: 'Maths', Science: 'Sci', 'Social Studies': 'SS' };

// Sections that write the half-yearly (Classes 6–10), with strength, home room and class teacher
const SECS = [
  { id: '6 A', n: 40, room: 'Room 9', ct: 'Lalitha Devi' }, { id: '6 B', n: 39, room: 'Room 10', ct: 'Rekha Nair' },
  { id: '7 A', n: 40, room: 'Room 13', ct: 'Sridevi Kulkarni' }, { id: '7 B', n: 38, room: 'Room 14', ct: 'Ravi Teja' },
  { id: '8 A', n: 41, room: 'Room 11', ct: 'Venkat Rao' }, { id: '8 B', n: 40, room: 'Room 12', ct: 'Harish Goud' },
  { id: '9 A', n: 36, room: 'Room 17', ct: 'Pavan Kumar' }, { id: '9 B', n: 37, room: 'Room 18', ct: 'Swapna Reddy' }, { id: '9 C', n: 35, room: 'Room 19', ct: 'Deepak Verma' },
  { id: '10 A', n: 38, room: 'Room 20', ct: 'Anitha Kumari' }, { id: '10 B', n: 36, room: 'Room 21', ct: 'Madhavi Latha' }, { id: '10 C', n: 34, room: 'Room 22', ct: 'Farhana Begum' },
];
const SEC = Object.fromEntries(SECS.map((s) => [s.id, s]));
const ALL_SECS = SECS.map((s) => s.id);
const HY_STUDENTS = SECS.reduce((a, s) => a + s.n, 0);
const classNo = (sec) => Number(sec.split(' ')[0]);

const teacherOf = (sec, sub) => {
  const n = classNo(sec);
  if (sub === 'Mathematics') return ['6 A', '6 B', '7 A', '7 B'].includes(sec) ? 'Imran Shaikh' : ['9 B', '10 A', '10 B'].includes(sec) ? 'Swapna Reddy' : 'Srikanth Rao';
  if (sub === 'Science') return ['7 A', '7 B', '8 B'].includes(sec) ? 'Ravi Teja' : n >= 9 ? 'Farhana Begum' : 'Nirmala Joseph';
  if (sub === 'English') return n === 10 ? 'Anitha Kumari' : 'Sridevi Kulkarni';
  if (sub === 'Telugu') return 'Lalitha Devi';
  if (sub === 'Hindi') return 'Deepak Verma';
  if (sub === 'Social Studies') return n === 6 ? 'Harish Goud' : 'Venkat Rao';
  return 'Karthik Menon';
};

// Half-yearly datesheet. Classes 6–8 share one schedule (7 B is the featured class), Classes 9–10 another.
const HY_MID = [
  { date: '12-10-2026', day: 'Mon 12 Oct', d: 12, sub: 'English', max: 80, cat: 'Theory 80 · Internal 20' },
  { date: '14-10-2026', day: 'Wed 14 Oct', d: 14, sub: 'Mathematics', max: 80, cat: 'Theory 80 · Internal 20' },
  { date: '15-10-2026', day: 'Thu 15 Oct', d: 15, sub: 'Science', max: 70, cat: 'Theory 70 · Practical 30' },
  { date: '16-10-2026', day: 'Fri 16 Oct', d: 16, sub: 'Telugu', max: 80, cat: 'Theory 80 · Internal 20' },
  { date: '26-10-2026', day: 'Mon 26 Oct', d: 26, sub: 'Social Studies', max: 80, cat: 'Theory 80 · Internal 20' },
  { date: '27-10-2026', day: 'Tue 27 Oct', d: 27, sub: 'Hindi', max: 80, cat: 'Theory 80 · Internal 20' },
].map((x) => ({ ...x, start: '9:00 AM', dur: '2 h 30 min', end: '11:30 AM' }));
const HY_SEN = [
  { date: '12-10-2026', day: 'Mon 12 Oct', d: 12, sub: 'Mathematics', max: 80, cat: 'Theory 80 · Internal 20' },
  { date: '14-10-2026', day: 'Wed 14 Oct', d: 14, sub: 'English', max: 80, cat: 'Theory 80 · Internal 20' },
  { date: '15-10-2026', day: 'Thu 15 Oct', d: 15, sub: 'Social Studies', max: 80, cat: 'Theory 80 · Internal 20' },
  { date: '16-10-2026', day: 'Fri 16 Oct', d: 16, sub: 'Science', max: 80, cat: 'Theory 80 · Internal 20' },
  { date: '26-10-2026', day: 'Mon 26 Oct', d: 26, sub: 'Telugu', max: 80, cat: 'Theory 80 · Internal 20' },
  { date: '27-10-2026', day: 'Tue 27 Oct', d: 27, sub: 'Hindi', max: 80, cat: 'Theory 80 · Internal 20' },
].map((x) => ({ ...x, start: '9:00 AM', dur: '3 h', end: '12:00 PM' }));
const scheduleFor = (sec) => (classNo(sec) <= 8 ? HY_MID : HY_SEN);

const INVIG = ['Rekha Nair', 'Harish Goud', 'Usha Rani', 'Pavan Kumar', 'Madhavi Latha', 'Mohammed Asif', 'Imran Shaikh', 'Sunitha Mohan', 'Srikanth Rao', 'Nirmala Joseph', 'Karthik Menon', 'Ravi Teja', 'Swapna Reddy'];
const invigOf = (sec, dayIdx) => INVIG[(ALL_SECS.indexOf(sec) * 5 + dayIdx * 3) % INVIG.length];

const DATESHEETS = [
  { id: 'hy-610', f: '2026-10-12', t: '2026-10-27', title: 'Half Yearly', type: 'Half Yearly', classes: 'Classes 6–10', lv: [6, 7, 8, 9, 10], secs: ALL_SECS, from: 'Mon 12 Oct', to: 'Tue 27 Oct', students: HY_STUDENTS, subjects: 6, status: 'Published', term: 'Term 1', pattern: 'Percentage', note: 'Published 2 Oct by Prakash Joshi', extra: '418 of 454 admit cards printed' },
  { id: 'cp-10', f: '2026-10-08', t: '2026-10-09', title: 'Computer Practical', type: 'Practical', classes: 'Class 10', lv: [10], secs: ['10 A', '10 B', '10 C'], from: 'Thu 8 Oct', to: 'Fri 9 Oct', students: 108, subjects: 1, status: 'Ongoing', term: 'Term 1', pattern: 'Percentage', note: 'Batch 3 of 4 in the computer lab now', extra: 'Karthik Menon is the examiner' },
  { id: 'hy-15', f: '2026-10-27', t: '2026-10-30', title: 'Half Yearly', type: 'Half Yearly', classes: 'Classes 1–5', lv: [1, 2, 3, 4, 5], secs: [], from: 'Tue 27 Oct', to: 'Fri 30 Oct', students: 412, subjects: 5, status: 'Draft', term: 'Term 1', pattern: 'Grading', note: 'Saved 6 Oct by Naveen Kumar', extra: 'Rooms and invigilators not set yet' },
  { id: 'pb1-10', f: '2026-12-07', t: '2026-12-18', title: 'Pre-board 1', type: 'Pre-final', classes: 'Class 10', lv: [10], secs: [], from: 'Mon 7 Dec', to: 'Fri 18 Dec', students: 108, subjects: 6, status: 'Draft', term: 'Term 2', pattern: 'Percentage', note: 'Saved 30 Sep by Prakash Joshi', extra: '2 subjects have no date yet' },
  { id: 'ut2-610', f: '2026-09-21', t: '2026-09-25', title: 'Unit Test 2', type: 'Unit Test 2', classes: 'Classes 6–10', lv: [6, 7, 8, 9, 10], secs: ALL_SECS, from: 'Mon 21 Sep', to: 'Fri 25 Sep', students: 452, subjects: 6, status: 'Completed', term: 'Term 1', pattern: 'Percentage', note: 'Classes 6–8 results published 28 Sep', extra: 'Classes 9–10 waiting for the Principal' },
  { id: 'ut2-15', f: '2026-09-22', t: '2026-09-24', title: 'Unit Test 2', type: 'Unit Test 2', classes: 'Classes 1–5', lv: [1, 2, 3, 4, 5], secs: [], from: 'Tue 22 Sep', to: 'Thu 24 Sep', students: 410, subjects: 5, status: 'Results published', term: 'Term 1', pattern: 'Grading', note: 'Results published 29 Sep', extra: 'Report cards on Parent Link' },
  { id: 'ut1-610', f: '2026-07-20', t: '2026-07-24', title: 'Unit Test 1', type: 'Unit Test 1', classes: 'Classes 6–10', lv: [6, 7, 8, 9, 10], secs: ALL_SECS, from: 'Mon 20 Jul', to: 'Fri 24 Jul', students: 451, subjects: 6, status: 'Results published', term: 'Term 1', pattern: 'Percentage', note: 'Results published 31 Jul', extra: 'Report cards on Parent Link' },
  { id: 'ut1-15', f: '2026-07-21', t: '2026-07-23', title: 'Unit Test 1', type: 'Unit Test 1', classes: 'Classes 1–5', lv: [1, 2, 3, 4, 5], secs: [], from: 'Tue 21 Jul', to: 'Thu 23 Jul', students: 408, subjects: 5, status: 'Results published', term: 'Term 1', pattern: 'Grading', note: 'Results published 30 Jul', extra: 'Report cards on Parent Link' },
];
const PRIMARY5 = ['English', 'Mathematics', 'EVS', 'Telugu', 'Hindi'];
const UT_DAYS = {
  'ut2-610': ['Mon 21 Sep', 'Tue 22 Sep', 'Wed 23 Sep', 'Thu 24 Sep', 'Fri 25 Sep', 'Fri 25 Sep'],
  'ut1-610': ['Mon 20 Jul', 'Tue 21 Jul', 'Wed 22 Jul', 'Thu 23 Jul', 'Fri 24 Jul', 'Fri 24 Jul'],
  'ut2-15': ['Tue 22 Sep', 'Tue 22 Sep', 'Wed 23 Sep', 'Thu 24 Sep', 'Thu 24 Sep'],
  'ut1-15': ['Tue 21 Jul', 'Tue 21 Jul', 'Wed 22 Jul', 'Thu 23 Jul', 'Thu 23 Jul'],
};
const DS_MONTH = { 'ut2-610': [8, 'September 2026'], 'ut2-15': [8, 'September 2026'], 'ut1-610': [6, 'July 2026'], 'ut1-15': [6, 'July 2026'], 'pb1-10': [11, 'December 2026'] };
const dsSecs = (d) => (d.secs.length ? d.secs : d.lv.includes(10) ? ['10 A', '10 B', '10 C'] : ['5 A', '5 B']);
const row = (day, sub, start, dur, end, max, cat) => ({ day, d: Number(day.split(' ')[1]), sub, start, dur, end, max, cat });
function schedOf(d, sec) {
  if (d.id === 'hy-610') return scheduleFor(sec);
  if (d.id === 'cp-10') return [row(sec === '10 C' ? 'Fri 9 Oct' : 'Thu 8 Oct', 'Computer Applications (practical)', sec === '10 B' ? '11:00 AM' : '9:00 AM', '1 h 30 min', sec === '10 B' ? '12:30 PM' : '10:30 AM', 50, 'Practical 40 · Viva 10')];
  if (d.id === 'hy-15') return [
    row('Tue 27 Oct', 'English', '9:00 AM', '2 h', '11:00 AM', 50, 'Written 40 · Oral 10'), row('Wed 28 Oct', 'Mathematics', '9:00 AM', '2 h', '11:00 AM', 50, 'Written 40 · Activity 10'),
    row('Thu 29 Oct', 'EVS', '9:00 AM', '2 h', '11:00 AM', 50, 'Written 40 · Project 10'), row('Fri 30 Oct', 'Telugu', '9:00 AM', '2 h', '11:00 AM', 50, 'Written 40 · Oral 10'),
    row('Fri 30 Oct', 'Hindi', '11:30 AM', '1 h 30 min', '1:00 PM', 50, 'Written 40 · Oral 10'),
  ];
  if (d.id === 'pb1-10') return [
    row('Mon 7 Dec', 'Mathematics', '9:00 AM', '3 h', '12:00 PM', 80, 'Theory 80 · Internal 20'), row('Wed 9 Dec', 'English', '9:00 AM', '3 h', '12:00 PM', 80, 'Theory 80 · Internal 20'),
    row('Fri 11 Dec', 'Science', '9:00 AM', '3 h', '12:00 PM', 80, 'Theory 80 · Internal 20'), row('Mon 14 Dec', 'Social Studies', '9:00 AM', '3 h', '12:00 PM', 80, 'Theory 80 · Internal 20'),
  ];
  const subs = d.lv.includes(1) ? PRIMARY5 : SUBJECTS6;
  return subs.map((sub, i) => { const late = i > 0 && UT_DAYS[d.id][i] === UT_DAYS[d.id][i - 1]; return row(UT_DAYS[d.id][i], sub, late ? '11:00 AM' : '9:00 AM', '1 h', late ? '12:00 PM' : '10:00 AM', 25, 'Written 25'); });
}
// 'Mon 12 Oct' (2026–27 school year) -> '2026-10-12'
const MON3 = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const dayIso = (day) => { const [, dd, mm] = day.split(' '); const mo = MON3[mm]; return `${mo >= 6 ? 2026 : 2027}-${String(mo).padStart(2, '0')}-${String(Number(dd)).padStart(2, '0')}`; };
const DS_TONE = { Draft: 'neutral', Published: 'brand', Ongoing: 'warn', Completed: 'info', 'Results published': 'ok' };

// CBSE 9-point grade scale (Classes 6–10)
const GRADES = [
  { g: 'A1', min: 91, max: 100, pts: 10, rm: 'Outstanding' }, { g: 'A2', min: 81, max: 90, pts: 9, rm: 'Excellent' },
  { g: 'B1', min: 71, max: 80, pts: 8, rm: 'Very good' }, { g: 'B2', min: 61, max: 70, pts: 7, rm: 'Good' },
  { g: 'C1', min: 51, max: 60, pts: 6, rm: 'Above average' }, { g: 'C2', min: 41, max: 50, pts: 5, rm: 'Average' },
  { g: 'D', min: 33, max: 40, pts: 4, rm: 'Fair' }, { g: 'E1', min: 21, max: 32, pts: 0, rm: 'Needs improvement' },
  { g: 'E2', min: 0, max: 20, pts: 0, rm: 'Needs improvement' },
];
const gradeOf = (pct) => (GRADES.find((x) => pct >= x.min - 0.5) || GRADES[GRADES.length - 1]).g;
const gradeTone = (g) => (g.startsWith('A') ? 'ok' : g.startsWith('B') ? 'brand' : g.startsWith('C') ? 'info' : g === 'D' ? 'warn' : 'bad');

/* ---------- Students per section, made the same way every time ---------- */
const BOYS = ['Aarav', 'Vihaan', 'Arjun', 'Reyansh', 'Sai', 'Krishna', 'Ishaan', 'Rohan', 'Aditya', 'Kabir', 'Dhruv', 'Harsha', 'Manish', 'Nikhil', 'Pranav', 'Rahul', 'Tejas', 'Varun', 'Yash', 'Karthik', 'Abhiram', 'Charan'];
const GIRLS = ['Ananya', 'Diya', 'Saanvi', 'Aadhya', 'Ira', 'Kavya', 'Meera', 'Navya', 'Pooja', 'Riya', 'Sneha', 'Tanvi', 'Vaishnavi', 'Harini', 'Lasya', 'Sahithi', 'Keerthana', 'Bhavya', 'Nithya', 'Shreya'];
const LAST = ['Sharma', 'Reddy', 'Rao', 'Naidu', 'Patel', 'Kumar', 'Iyer', 'Gupta', 'Verma', 'Chowdary', 'Varma', 'Menon', 'Das', 'Singh', 'Joshi', 'Pillai', 'Goud', 'Shetty'];
const MOTHERS = ['Lakshmi', 'Padmavathi', 'Sujatha', 'Radha', 'Kavitha', 'Swathi', 'Madhavi', 'Anuradha', 'Sirisha', 'Deepa'];
const hash = (str) => { let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
const seeded = (n) => { let s = (n % 2147483646) + 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
const ROSTER = {};
function roster(sec) {
  if (ROSTER[sec]) return ROSTER[sec];
  let list;
  if (sec === '7 B') list = CLASS_7B.map((s) => ({ id: s.id, name: s.name, roll: s.roll, adm: s.adm, att: s.att, girl: s.girl, father: s.father, real: true }));
  else {
    const r = seeded(hash(sec));
    list = Array.from({ length: SEC[sec]?.n || 36 }, () => {
      const g = r() > 0.5; const pool = g ? GIRLS : BOYS; const last = LAST[Math.floor(r() * LAST.length)];
      return { name: `${pool[Math.floor(r() * pool.length)]} ${last}`, girl: g, att: 78 + Math.floor(r() * 22), yr: 2016 + Math.floor(r() * 10), num: 100 + Math.floor(r() * 880), father: `${['Ramesh', 'Srinivas', 'Venkat', 'Prakash', 'Mahesh', 'Anil', 'Kiran', 'Naresh'][Math.floor(r() * 8)]} ${last}` };
    }).sort((a, b) => a.name.localeCompare(b.name))
      .map((s, i) => ({ ...s, id: `${sec.replace(' ', '')}-${i + 1}`, roll: i + 1, adm: `SPS/${s.yr}/${String(s.num).padStart(4, '0')}` }));
  }
  return (ROSTER[sec] = list);
}
const motherOf = (s) => (s.id === FEATURED.id ? PROFILE.mother : `${MOTHERS[hash(s.name) % MOTHERS.length]} ${s.name.split(' ').slice(-1)[0]}`);
const fatherOf = (s) => (s.id === FEATURED.id ? 'Rajesh Sharma' : s.father);
const NO_PHOTO = new Set(['Ira Das', 'Sai Das']);

/* ---------- Unit test marks (out of 25 per subject, 150 in all) ---------- */
const SUBJ_BIAS = { English: 0.05, Telugu: -0.02, Hindi: -0.04, Mathematics: 0.03, Science: 0.01, 'Social Studies': -0.08 };
const DROPS = new Set(['Nikhil Varma', 'Ira Das', 'Karthik Chowdary']);
const ability = (s) => { const h = hash(s.name + s.roll); return h % 19 === 0 ? 0.34 : 0.52 + (h % 44) / 100; };
function utMark(s, sub, t) {
  if (s.id === FEATURED.id) { const e = PROFILE.exams.find((x) => x.sub === sub); return e ? e[t === 1 ? 'ut1' : 'ut2'] : 20; }
  if (t === 2 && sub === 'Telugu' && s.name === 'Abhiram Rao') return 'AB';
  if (t === 2 && sub === 'Mathematics' && s.name === 'Meera Das') return 21;
  let a = ability(s) + SUBJ_BIAS[sub] + (t === 2 ? 0.02 : 0) + ((hash(s.name + sub + t) % 21) - 10) / 100;
  if (DROPS.has(s.name)) a += t === 2 ? -0.17 : 0.06;
  return Math.max(3, Math.min(25, Math.round(25 * a)));
}
const num = (m) => (typeof m === 'number' ? m : 0);
const RES_CACHE = {};
function classResults(sec, t) {
  const key = sec + t;
  if (RES_CACHE[key]) return RES_CACHE[key];
  const rows = roster(sec).map((s) => {
    const marks = SUBJECTS6.map((sub) => utMark(s, sub, t));
    const total = marks.reduce((a, m) => a + num(m), 0);
    const pct = Math.round((total / 150) * 1000) / 10;
    const fails = SUBJECTS6.filter((_, i) => typeof marks[i] === 'number' && marks[i] < 8.25);
    const absent = SUBJECTS6.filter((_, i) => marks[i] === 'AB');
    return { s, sec, marks, total, pct, grade: gradeOf(pct), fails, absent };
  });
  rows.forEach((r) => { r.rank = 1 + rows.filter((x) => x.total > r.total).length; });
  return (RES_CACHE[key] = rows);
}
const avg = (a) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : 0);

// Result status per exam and section
function resultStatus(exam, sec) {
  if (exam === 'ut1') return { st: 'Published', when: '31 Jul 2026', by: 'Lakshmi Rao' };
  if (exam === 'ut2') return classNo(sec) <= 8 ? { st: 'Published', when: '28 Sep 2026', by: 'Lakshmi Rao' } : { st: 'Waiting for approval', when: '7 Oct 2026', by: 'Prakash Joshi', on: 'Sat 10 Oct, 9:00 AM' };
  if (exam === 'hy') return { st: 'Draft', on: 'Sat 7 Nov, 9:00 AM' };
  return { st: 'After the Annual exam' };
}
const RS_TONE = { Published: 'ok', 'Waiting for approval': 'info', Draft: 'neutral', 'After the Annual exam': 'neutral' };

/* ---------- Marks entry papers ---------- */
const compsFor = (exam, sec, sub) => {
  if (exam === 'ut2') return [{ k: 'th', label: 'Written', max: 25 }];
  if (sub === 'Science' && classNo(sec) <= 8) return [{ k: 'th', label: 'Theory', max: 70 }, { k: 'pr', label: 'Practical', max: 30 }];
  return [{ k: 'th', label: 'Theory', max: 80 }, { k: 'in', label: 'Internal', max: 20 }];
};
const paperDay = (sec, sub) => scheduleFor(sec).find((x) => x.sub === sub) || scheduleFor(sec)[0];
const theoryOpens = (sec, sub) => { const d = paperDay(sec, sub).d; return d <= 16 ? 'Sat 17 Oct' : d === 26 ? 'Tue 27 Oct' : 'Wed 28 Oct'; };
const FIXED_STATE = {
  'hy|6 A|Mathematics': { done: 40, locked: 'Thu 8 Oct' }, 'hy|6 B|Mathematics': { done: 27 }, 'hy|7 A|Mathematics': { done: 0 }, 'hy|7 B|Mathematics': { done: 35 },
  'hy|7 A|Science': { done: 40, locked: 'Wed 7 Oct' }, 'hy|7 B|Science': { done: 36 }, 'hy|8 B|Science': { done: 0 },
};
function paperOf(id) {
  const [exam, sec, sub] = id.split('|');
  const n = SEC[sec]?.n || 38;
  let st = FIXED_STATE[id];
  if (!st) {
    const h = hash(id) % 10;
    st = exam === 'ut2' ? { done: n, locked: classNo(sec) % 2 ? 'Fri 25 Sep' : 'Sat 26 Sep' } : h < 4 ? { done: n, locked: ['Mon 5 Oct', 'Tue 6 Oct', 'Wed 7 Oct', 'Thu 8 Oct'][h] } : h < 8 ? { done: Math.max(4, n - 3 - (h * 4)) } : { done: 0 };
  }
  const status = st.locked ? 'Locked' : st.done ? 'In progress' : 'Not started';
  return { id, exam, sec, sub, n, ...st, status, teacher: teacherOf(sec, sub), comps: compsFor(exam, sec, sub) };
}
const P_TONE = { Locked: 'ok', 'In progress': 'warn', 'Not started': 'neutral' };
const HY_PAPERS = ALL_SECS.flatMap((sec) => SUBJECTS6.map((sub) => paperOf(`hy|${sec}|${sub}`)));

// Change history kept for locked marks (moderation)
const HISTORY = {
  'ut2|7 B|Mathematics': [{ name: 'Meera Das', from: 19, to: 21, why: 'Question 7 was checked but not added to the total', by: 'Imran Shaikh', ok: 'Lakshmi Rao', when: '27 Sep 2026, 11:20 AM' }],
  'ut2|7 B|Science': [{ name: 'Kabir Singh', from: 17, to: 18, why: 'Diagram in question 4 was not marked', by: 'Ravi Teja', ok: 'Lakshmi Rao', when: '26 Sep 2026, 3:05 PM' }],
};

/* ---------- Who is looking ---------- */
function useWho(access) {
  const { role } = useRole();
  const canEdit = useCanEdit();
  const id = role.id;
  const teacher = id === 'teacher';
  const ct = id === 'classteacher';
  const office = id === 'officestaff';
  const full = access === 'full';
  const myClasses = teacher ? ['6 A', '6 B', '7 A', '7 B'] : ct ? ['7 A', '7 B', '8 B'] : ALL_SECS;
  const mySubject = teacher ? 'Mathematics' : ct ? 'Science' : null;
  return { role, id, name: role.person.name, teacher, ct, office, full, canEdit, myClasses, mySubject, principal: id === 'principal', manage: canEdit && (full || office) };
}

/* ---------- Small shared bits ---------- */
function BackLink({ label, sub, onClick }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink mb-3 -ml-1 h-8 px-1 rounded-lg">
      <I.ArrowLeft size={17} />{label} {sub && <span className="text-ink3 font-normal">/ {sub}</span>}
    </button>
  );
}
const secOptions = (list) => list.map((s) => ({ value: s, label: `Class ${s}` }));
const pctTxt = (v) => `${Number.isInteger(v) ? v : v.toFixed(1)}%`;

/* =====================================================================
   1. Datesheet
   ===================================================================== */
function DatesheetPage({ params, access }) {
  const w = useWho(access);
  const { go } = useNav();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [st, setSt] = useState('all');
  const [cls, setCls] = useState('all');
  const [per, setPer] = useState(PERIODS.acyear);
  const [add, setAdd] = useState(false);
  const [list, setList] = useState(DATESHEETS);
  if (params?.id) return <DatesheetDetail id={params.id} w={w} />;

  const mine = (d) => !(w.teacher || w.ct) || d.secs.some((s) => w.myClasses.includes(s));
  const base = list.filter((d) => mine(d) && d.t >= per.from && d.f <= per.to);
  const rows = base.filter((d) => (st === 'all' || d.status === st) && (cls === 'all' || d.lv.includes(Number(cls))) && (!q.trim() || `${d.title} ${d.classes} ${d.type}`.toLowerCase().includes(q.trim().toLowerCase())));
  const counts = base.reduce((a, d) => ((a[d.status] = (a[d.status] || 0) + 1), a), {});
  const duties = w.teacher || w.ct ? w.myClasses.length : 0;
  const myDuties = ALL_SECS.flatMap((sec) => scheduleFor(sec).map((p, i) => ({ sec, p, who: invigOf(sec, i) }))).filter((x) => x.who === w.name);
  const archive = (d) => { setList((x) => x.filter((y) => y.id !== d.id)); toast({ title: `${d.title} · ${d.classes} archived`, body: 'Find it with the Archived filter.', undo: () => setList((x) => [...x, d]) }); };

  return (
    <div>
      <ModuleHead sub={w.teacher || w.ct ? `Datesheets for your classes: ${w.myClasses.join(', ')}. View only.` : w.office ? 'Prepare datesheets and publish them. Admit cards follow.' : '2026–27 · creating a datesheet creates the exam'}
        actions={w.manage && <Button variant="primary" icon={I.CalendarPlus} onClick={() => setAdd(true)}>Add datesheet</Button>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Band items={w.teacher || w.ct ? [
          { label: 'Half Yearly starts', big: 'Mon 12 Oct', foot: 'In 3 days · reporting 8:15 AM' },
          { label: `Your ${w.mySubject} papers`, big: w.teacher ? 'Wed 14 Oct' : 'Thu 15 Oct', foot: w.myClasses.join(', ') },
          { label: 'Your invigilation', big: `${myDuties.length} papers`, foot: myDuties[0] ? `First: ${myDuties[0].p.day}, ${myDuties[0].sec} · ${SEC[myDuties[0].sec].room}` : 'None given yet' },
          { label: 'Marks entry opens', big: 'Sat 17 Oct', foot: `For ${duties} classes · due Fri 30 Oct`, onClick: () => go('exams', { page: 'marks' }) },
        ] : [
          { label: 'Half Yearly starts', big: 'Mon 12 Oct', foot: 'In 3 days · Classes 6–10', onClick: () => go('exams', { page: 'datesheet', id: 'hy-610' }) },
          { label: 'Papers', big: '72', foot: '6 per class · 12 sections' },
          { label: 'Students writing', big: HY_STUDENTS.toLocaleString('en-IN'), foot: '2 without a photo on the admit card' },
          { label: 'Admit cards printed', big: '418 / 454', foot: '36 left to print', onClick: () => go('exams', { page: 'admitcards' }) },
        ]} />

        <Card>
          <Toolbar>
            <SearchBox id="ds-search" value={q} onChange={setQ} placeholder="Search exam title" />
            <DatePeriod id="ds-per" future value={per} onChange={setPer} className="w-full @md:w-auto" />
            <Select id="ds-class" value={cls} onChange={setCls} className="@md:w-44" options={[{ value: 'all', label: 'All classes' }, ...Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: `Class ${i + 1}` }))]} />
            <ExportButton what="datesheets" />
          </Toolbar>
          <div className="px-3 pt-3"><Chips value={st} onChange={setSt} options={[{ value: 'all', label: 'All', count: base.length }, ...['Draft', 'Published', 'Ongoing', 'Completed', 'Results published'].filter((k) => counts[k]).map((k) => ({ value: k, label: k, count: counts[k] }))]} /></div>
          {rows.length === 0 ? (
            <Empty icon={I.CalendarX} title="No datesheet matches" body="Try other dates, another class or status." action={<Button variant="secondary" onClick={() => { setQ(''); setSt('all'); setCls('all'); setPer(PERIODS.acyear); }}>Clear filters</Button>} />
          ) : (
            <ul className="grid @md:grid-cols-2 @xl:grid-cols-3 gap-3 p-3">
              {rows.map((d) => (
                <li key={d.id} className="rounded-2xl border border-line p-4 flex flex-col gap-3 hover:border-ink3/40 transition">
                  <div className="flex items-start gap-3">
                    <span className={cx('w-10 h-10 rounded-xl grid place-items-center shrink-0', TONE_SOFT[DS_TONE[d.status]])}><I.CalendarDays size={19} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[15px] leading-tight">{d.title}</p>
                      <p className="text-[12.5px] text-ink3 mt-0.5">{d.classes} · {d.term} · {d.pattern}</p>
                    </div>
                    <Pill tone={DS_TONE[d.status]}>{d.status}</Pill>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[13px]">
                    <div className="rounded-xl bg-sunken/60 px-3 py-2"><p className="text-[11.5px] text-ink3 font-semibold">From</p><p className="font-semibold tnum">{d.from}</p></div>
                    <div className="rounded-xl bg-sunken/60 px-3 py-2"><p className="text-[11.5px] text-ink3 font-semibold">To</p><p className="font-semibold tnum">{d.to}</p></div>
                    <div className="rounded-xl bg-sunken/60 px-3 py-2"><p className="text-[11.5px] text-ink3 font-semibold">Students</p><p className="font-semibold tnum">{d.students}</p></div>
                  </div>
                  <p className="text-[12.5px] text-ink3">{d.subjects} {d.subjects === 1 ? 'subject' : 'subjects'} · {d.note}<br />{d.extra}</p>
                  <div className="flex gap-2 mt-auto">
                    <Button size="sm" variant="secondary" icon={I.Eye} className="flex-1" onClick={() => go('exams', { page: 'datesheet', id: d.id })}>View</Button>
                    {w.manage && d.status === 'Draft' && <Button size="sm" variant="soft" icon={I.Send} className="flex-1" onClick={() => go('exams', { page: 'datesheet', id: d.id })}>Publish</Button>}
                    {w.manage && (
                      <MoreMenu size="sm" items={[
                        ['Printer', 'Print datesheet', () => toast({ title: `Datesheet sent to the office printer`, body: `${d.title} · ${d.classes}` })],
                        ['Pencil', 'Edit', () => toast(d.status === 'Results published' || d.status === 'Completed' ? { title: 'Results exist for this datesheet', body: 'Only the title can change. Ask the Exam In-charge or the Principal.', tone: 'info' } : { title: `Editing ${d.title} · ${d.classes}`, body: 'Changes are logged. Parents are told if a published date moves.', tone: 'info' })],
                        ['Archive', 'Archive', () => archive(d)],
                      ]} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="px-4 py-3 border-t border-line text-[13px] text-ink3 tnum">Showing: {per.label} · {fmtRange(per)} · {rows.length} {rows.length === 1 ? 'datesheet' : 'datesheets'}</div>
        </Card>
      </div>
      <AddDatesheetSheet open={add} onClose={() => setAdd(false)} />
    </div>
  );
}

function DatesheetDetail({ id, w }) {
  const { go } = useNav();
  const toast = useToast();
  const d0 = DATESHEETS.find((x) => x.id === id) || DATESHEETS[0];
  const [d, setD] = useState(d0);
  const mineOnly = dsSecs(d).filter((s) => !(w.teacher || w.ct) || w.myClasses.includes(s));
  const secs = mineOnly.length ? mineOnly : dsSecs(d);
  const [sec, setSec] = useState(secs.includes('7 B') ? '7 B' : secs[0]);
  const [rooms, setRooms] = useState(false);
  const [seat, setSeat] = useState(false);
  const [cats, setCats] = useState(false);
  const [pub, setPub] = useState(false);
  const isHy = d.id === 'hy-610';
  const sched = schedOf(d, sec);
  const [month] = DS_MONTH[d.id] || [9, 'October 2026'];
  const examIso = new Set((isHy ? HY_MID.map((x) => x.day) : schedOf(d, secs[0]).concat(secs.length > 2 ? schedOf(d, secs[2]) : []).map((x) => x.day)).map(dayIso));
  const calCell = (y, m, n) => {
    const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(n).padStart(2, '0')}`;
    if (examIso.has(iso)) return { tone: 'brand', title: 'Exam day' };
    if (y === 2026 && m === 9 && n >= 19 && n <= 25) return { tone: 'muted', title: 'Dussehra holidays' };
    if (y === 2026 && m === 9 && n === 17) return { dot: 'warn', title: 'PTM' };
    if (new Date(y, m, n).getDay() === 0) return { tone: 'muted', title: 'Sunday' };
    return {};
  };

  return (
    <div>
      <BackLink label="Datesheet" sub={`${d.title} · ${d.classes}`} onClick={() => go('exams', { page: 'datesheet' })} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Card className="p-4 @md:p-5 flex flex-col @lg:flex-row @lg:items-center gap-4">
          <span className={cx('w-12 h-12 rounded-2xl grid place-items-center shrink-0', TONE_SOFT[DS_TONE[d.status]])}><I.CalendarDays size={22} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap"><h1 className="font-display text-[22px] @md:text-[26px] font-semibold tracking-tight leading-tight">{d.title} · {d.classes}</h1><Pill tone={DS_TONE[d.status]} dot>{d.status}</Pill></div>
            <p className="text-[13.5px] text-ink3 mt-0.5">{d.from} to {d.to} · {d.type} · {d.term} · {d.students} students · {d.note}</p>
          </div>
          {w.manage && (
            <div className="flex gap-2 flex-wrap">
              {d.status === 'Draft' ? <Button variant="primary" icon={I.Send} onClick={() => setPub(true)}>Publish datesheet</Button> : (
                <>
                  <Button variant="secondary" icon={I.DoorOpen} onClick={() => setRooms(true)}>Rooms & invigilators</Button>
                  <Button variant="secondary" icon={I.Grid3x3} onClick={() => setSeat(true)}>Seating</Button>
                </>
              )}
              <MoreMenu items={[
                ['Printer', 'Print datesheet', () => toast({ title: 'Datesheet sent to the office printer', body: `${d.title} · Class ${sec}` })],
                ['SlidersHorizontal', 'Configure mark categories', () => setCats(true)],
                ['IdCard', 'Admit cards', () => go('exams', { page: 'admitcards' })],
                ['Archive', 'Archive', () => toast({ title: 'Archived', body: `${d.title} · ${d.classes}`, undo: () => {} })],
              ]} />
            </div>
          )}
        </Card>

        {d.status === 'Published' && <Banner tone="ok" title="Published.">Parents see this datesheet on Parent Link. The exam days are on the School Calendar and in the Time Table, and reminders go to parents the day before each paper.</Banner>}
        {d.status === 'Draft' && <Banner tone="info" title="Draft.">Only staff can see it. Publishing puts the papers on the School Calendar and the Time Table, makes admit cards ready and tells parents.</Banner>}
        {(d.status === 'Completed' || d.status === 'Results published') && <Banner tone="info" title="Results exist for this datesheet.">Only the title can change now. Ask the Exam In-charge or the Principal for anything else.</Banner>}

        <Split side={340}>
          <Col>
            <Card className="overflow-hidden">
              <CardHead title={`Schedule · Class ${sec}`} sub={`${sched.length} papers · listed by date and time · room ${SEC[sec]?.room || 'class room'}`} icon={I.CalendarRange}
                action={secs.length > 1 && <Select id="ds-sec" value={sec} onChange={setSec} className="w-32" options={secOptions(secs)} />} />
              <DataList bp="lg" minWidth={720} footer={`${sched.length} papers · end time worked out from the start time and duration`}
                columns={[
                  { key: 'day', label: 'Date', nowrap: true, render: (r) => <span className="font-semibold tnum">{r.day}</span> },
                  { key: 'sub', label: 'Subject', render: (r) => <><p className="font-semibold">{r.sub}</p><p className="text-[12.5px] text-ink3">{r.cat}</p></> },
                  { key: 'time', label: 'Time', nowrap: true, render: (r) => <span className="tnum">{r.start} – {r.end}<span className="block text-[12.5px] text-ink3">{r.dur}</span></span> },
                  { key: 'room', label: 'Room', render: () => (d.id === 'cp-10' ? 'Computer lab' : SEC[sec]?.room || <span className="text-ink3">Not set</span>) },
                  { key: 'inv', label: 'Invigilator', render: (r) => (!SEC[sec] || d.status === 'Draft' ? <span className="text-ink3">Not set</span> : d.id === 'cp-10' ? 'Karthik Menon' : invigOf(sec, sched.findIndex((x) => x.sub === r.sub))) },
                  { key: 'max', label: 'Max marks', align: 'right', render: (r) => <b className="font-semibold">{r.max}</b> },
                ]}
                rows={sched.map((x, i) => ({ ...x, id: x.sub + i }))}
                mobile={(r) => ({ icon: 'FileText', iconTone: 'brand', title: r.sub, sub: `${r.day} · ${r.start} – ${r.end}`, right: <span className="text-[13px] font-semibold tnum">{r.max}<span className="block text-[11.5px] text-ink3 font-normal">max</span></span>, pills: [<Pill key="c" tone="neutral" className="!h-[22px] !text-[11.5px]">{r.cat}</Pill>] })} />
            </Card>
            <Card>
              <CardHead title="Mark categories" sub="How each subject's 100 marks are split. Set after saving the datesheet." icon={I.SlidersHorizontal}
                action={w.manage && <Button size="sm" variant="ghost" icon={I.Pencil} onClick={() => setCats(true)}>Configure</Button>} />
              <ul className="px-5 pb-5 grid @md:grid-cols-2 gap-2">
                {sched.map((x) => (
                  <li key={x.sub + x.day} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5 text-[13.5px]">
                    <span className="font-semibold truncate">{x.sub}</span><span className="text-ink2 tnum shrink-0">{x.cat}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </Col>
          <Col>
            <Card>
              <CardHead title="Exam days" sub="Go to earlier or later months with the arrows" icon={I.CalendarDays} />
              <div className="px-5 pb-5">
                <CalendarMonth key={d.id} id={`ds-cal-${d.id}`} compact cell={calCell} from={[2026, 5]} to={[2027, 2]} start={[month >= 5 ? 2026 : 2027, month]}
                  footer={(y, m) => { const n = [...examIso].filter((x) => x.startsWith(`${y}-${String(m + 1).padStart(2, '0')}`)).length; return <div className="flex flex-col gap-2"><p className="text-[12.5px] text-ink3">{n ? `${n} exam ${n === 1 ? 'day' : 'days'} this month` : 'No exam days in this month'}</p><Legend items={y === 2026 && m === 9 ? [['bg-brand/30', 'Exam day'], ['bg-sunken', 'Dussehra holidays 19–25 Oct'], ['bg-warn', 'PTM Sat 17 Oct']] : [['bg-brand/30', 'Exam day']]} /></div>; }} />
              </div>
            </Card>
            {w.manage && <Card>
              <CardHead title="Before you save" icon={I.Info} />
              <ul className="px-5 pb-5 flex flex-col gap-2 text-[13.5px] text-ink2">
                {['Subjects are listed by date and time.', 'A subject with no exam date is left out of the datesheet.', 'The pattern can be changed for one subject only.', 'Mark categories are set after saving.', 'Once results are uploaded, changes are restricted.'].map((t) => (
                  <li key={t} className="flex gap-2"><I.Check size={16} className="text-brand shrink-0 mt-0.5" />{t}</li>
                ))}
              </ul>
            </Card>}
          </Col>
        </Split>
      </div>
      <RoomsSheet open={rooms} onClose={() => setRooms(false)} />
      <SeatingSheet open={seat} onClose={() => setSeat(false)} />
      <CategoriesSheet key={d.id + sec} open={cats} onClose={() => setCats(false)} rows={sched} />
      <ConfirmSheet open={pub} onClose={() => setPub(false)} title={`Publish ${d.title} · ${d.classes}?`} confirmLabel={`Publish and tell ${d.students} parents`}
        onConfirm={() => { setD({ ...d, status: 'Published', note: 'Published just now by ' + w.name }); toast({ title: `${d.title} datesheet published`, body: `On the School Calendar and the Time Table. ${d.students} parents get it on Parent Link and WhatsApp.` }); }}>
        <ul className="flex flex-col gap-2 text-[14px] text-ink2">
          <li className="flex gap-2"><I.CalendarDays size={17} className="text-brand shrink-0 mt-0.5" />{sched.length} papers go on the School Calendar and into the Time Table.</li>
          <li className="flex gap-2"><I.IdCard size={17} className="text-brand shrink-0 mt-0.5" />Admit cards become ready to print.</li>
          <li className="flex gap-2"><I.Send size={17} className="text-brand shrink-0 mt-0.5" />{d.students} parents get the datesheet on WhatsApp. A message cannot be unsent.</li>
        </ul>
      </ConfirmSheet>
    </div>
  );
}

/* ---------- Add datesheet ---------- */
const TIMES = ['8:30 AM', '9:00 AM', '9:30 AM', '10:00 AM', '11:00 AM', '11:30 AM', '1:30 PM'];
const DURS = ['1 h', '1 h 30 min', '2 h', '2 h 30 min', '3 h'];
const toMin = (t) => { const [hm, ap] = t.split(' '); const [h, m] = hm.split(':').map(Number); return ((h % 12) + (ap === 'PM' ? 12 : 0)) * 60 + m; };
const durMin = (d) => { const h = /(\d+) h/.exec(d); const m = /(\d+) min/.exec(d); return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0); };
const fmtMin = (x) => { const h = Math.floor(x / 60), m = x % 60; return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
const validDate = (s) => /^\d{2}-\d{2}-\d{4}$/.test(s);
const dateNum = (s) => { const [dd, mm, yy] = s.split('-').map(Number); return yy * 10000 + mm * 100 + dd; };
const PRIMARY_SUBS = ['English', 'Mathematics', 'EVS', 'Telugu', 'Hindi'];
const PRIMARY_T = { English: 'Usha Rani', Mathematics: 'Sunitha Mohan', EVS: 'Nirmala Joseph', Telugu: 'Lalitha Devi', Hindi: 'Deepak Verma' };

function AddDatesheetSheet({ open, onClose }) {
  const toast = useToast();
  const [mode, setMode] = useState('single');
  const [classes, setClasses] = useState(['5 A']);
  const [f, setF] = useState({ title: 'Half Yearly', type: 'Half Yearly', pattern: 'Grading', term: 'Term 1', start: '27-10-2026', end: '30-10-2026' });
  const [bulk, setBulk] = useState({ start: '9:00 AM', dur: '2 h', room: '', max: '50' });
  const initRows = () => PRIMARY_SUBS.map((sub, i) => ({ sub, date: ['27-10-2026', '28-10-2026', '29-10-2026', '30-10-2026', ''][i], start: '9:00 AM', dur: '2 h', room: '', inv: PRIMARY_T[sub], max: '50' }));
  const [rows, setRows] = useState(initRows);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const setRow = (i, k, v) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const apply = (k) => setRows((r) => r.map((x) => ({ ...x, [k]: bulk[k] })));
  const label = classes.length ? classes.join(', ') : 'the class';
  const err = rows.map((r, i) => {
    if (!r.date) return '';
    if (!validDate(r.date)) return 'Type the date as DD-MM-YYYY, like 27-10-2026.';
    if (validDate(f.end) && dateNum(r.date) > dateNum(f.end)) return `This date is after the end date (${f.end}).`;
    if (validDate(f.start) && dateNum(r.date) < dateNum(f.start)) return `This date is before the start date (${f.start}).`;
    const a = toMin(r.start), b = a + durMin(r.dur);
    const other = rows.find((o, j) => j < i && o.date === r.date && toMin(o.start) < b && a < toMin(o.start) + durMin(o.dur));
    if (other) return `${classes[0] || 'This class'} already has ${other.sub} at ${other.start} on ${r.date}. Change the date or time.`;
    if (!r.max || Number(r.max) <= 0) return 'Enter the maximum marks.';
    return '';
  });
  const titleErr = !f.title.trim() ? 'Give the exam a title, like "Half Yearly".' : '';
  const classErr = !classes.length ? 'Choose at least one class.' : '';
  const dated = rows.filter((r) => r.date);
  const save = () => {
    setTried(true);
    if (titleErr || classErr || err.some(Boolean) || !dated.length) return;
    setBusy(true);
    setTimeout(() => {
      setBusy(false); onClose(); setTried(false); setRows(initRows());
      const left = rows.filter((r) => !r.date).map((r) => r.sub);
      toast({ title: `${f.title} saved as a draft for ${label}`, body: `${dated.length} papers.${left.length ? ` ${left.join(', ')} has no date, so it is left out.` : ''} Next: configure mark categories.` });
    }, 800);
  };
  const toggleClass = (c) => setClasses((x) => (mode === 'single' ? [c] : x.includes(c) ? x.filter((y) => y !== c) : [...x, c]));
  return (
    <Sheet open={open} onClose={onClose} wide title="Add datesheet" sub="Creating a datesheet creates the exam. It stays a draft until you publish it."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={I.Check} loading={busy} onClick={save}>{busy ? 'Saving…' : 'Save as draft'}</Button></>}>
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-3">
          <p className="eyebrow text-ink3">1 · Which classes</p>
          <div className="grid grid-cols-2 gap-2" role="radiogroup">
            {[['single', 'Single class', 'Pick one class and fill the schedule', I.User], ['multiple', 'Multiple classes', 'Same schedule for several classes at once', I.Users]].map(([v, t, s, Ic]) => (
              <button key={v} role="radio" aria-checked={mode === v} onClick={() => { setMode(v); if (v === 'single') setClasses(classes.slice(0, 1)); }}
                className={cx('rounded-2xl border p-3.5 text-left transition', mode === v ? 'border-brand ring-1 ring-brand bg-brand/5' : 'border-line hover:border-ink3/40')}>
                <Ic size={18} className={mode === v ? 'text-brand' : 'text-ink3'} />
                <span className="block font-semibold text-[14.5px] mt-1.5">{t}</span>
                <span className="block text-[12.5px] text-ink3">{s}</span>
              </button>
            ))}
          </div>
          <Field label={mode === 'single' ? 'Class' : 'Classes'} required error={tried && classErr}>
            <div className="flex flex-wrap gap-1.5">
              {['3 A', '3 B', '4 A', '4 B', '5 A', '5 B'].map((c) => (
                <button key={c} onClick={() => toggleClass(c)} aria-pressed={classes.includes(c)}
                  className={cx('h-9 px-3 rounded-xl text-[13.5px] font-semibold border transition', classes.includes(c) ? 'bg-ink text-bg border-ink' : 'bg-surface border-line text-ink2 hover:border-ink3/50')}>{c}</button>
              ))}
            </div>
          </Field>
        </section>

        <section className="flex flex-col gap-3">
          <p className="eyebrow text-ink3">2 · Exam details</p>
          <div className="grid @md:grid-cols-2 gap-3">
            <Field label="Title" required id="ad-title" error={tried && titleErr} hint="For example FA 1 or Half Yearly"><Input id="ad-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={tried && titleErr} /></Field>
            <Field label="Exam type" required id="ad-type"><Select id="ad-type" value={f.type} onChange={(v) => setF({ ...f, type: v })} options={['Unit Test 1', 'Unit Test 2', 'Half Yearly', 'Pre-board 1', 'Annual', 'Practical']} /></Field>
            <Field label="Exam pattern" required id="ad-pat" hint="Classes 1–5 default to Grading"><Segmented value={f.pattern} onChange={(v) => setF({ ...f, pattern: v })} options={['Percentage', 'Grading', 'CGPA']} className="w-full" /></Field>
            <Field label="Term" required id="ad-term"><Select id="ad-term" value={f.term} onChange={(v) => setF({ ...f, term: v })} options={['Term 1', 'Term 2']} /></Field>
            <Field label="Start date" required id="ad-start" hint="DD-MM-YYYY"><Input id="ad-start" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} className="tnum" /></Field>
            <Field label="End date" required id="ad-end" hint="15 days after the start unless you change it"><Input id="ad-end" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} className="tnum" /></Field>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <p className="eyebrow text-ink3">3 · Subject schedule</p>
          <div className="rounded-2xl bg-sunken/60 p-3 flex flex-col gap-2.5">
            <p className="text-[13px] font-semibold text-ink2">Bulk apply · each Apply changes only its own column</p>
            <div className="grid grid-cols-2 @md:grid-cols-4 gap-2">
              {[['start', 'Start time', TIMES], ['dur', 'Duration', DURS]].map(([k, l, opts]) => (
                <div key={k} className="flex flex-col gap-1"><span className="text-[12px] text-ink3 font-semibold">{l}</span>
                  <div className="flex gap-1.5"><Select id={`bulk-${k}`} value={bulk[k]} onChange={(v) => setBulk({ ...bulk, [k]: v })} options={opts} className="flex-1 min-w-0" /><Button size="sm" variant="secondary" className="!h-11" onClick={() => apply(k)}>Apply</Button></div>
                </div>
              ))}
              <div className="flex flex-col gap-1"><span className="text-[12px] text-ink3 font-semibold">Location</span>
                <div className="flex gap-1.5"><Input id="bulk-room" value={bulk.room} onChange={(e) => setBulk({ ...bulk, room: e.target.value })} placeholder="Class room" className="flex-1 min-w-0" /><Button size="sm" variant="secondary" className="!h-11" onClick={() => apply('room')}>Apply</Button></div>
              </div>
              <div className="flex flex-col gap-1"><span className="text-[12px] text-ink3 font-semibold">Max marks</span>
                <div className="flex gap-1.5"><Input id="bulk-max" inputMode="numeric" value={bulk.max} onChange={(e) => setBulk({ ...bulk, max: e.target.value.replace(/\D/g, '') })} className="flex-1 min-w-0 tnum" /><Button size="sm" variant="secondary" className="!h-11" onClick={() => apply('max')}>Apply</Button></div>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto scroll-thin -mx-5 px-5">
            <table className="text-[13.5px] w-full min-w-[860px]">
              <thead><tr className="text-[12px] text-ink3 text-left border-b border-line">
                {['Subject', 'Exam date', 'Start time', 'Duration', 'Ends', 'Location', 'Invigilator', 'Max marks'].map((h) => <th key={h} className="font-semibold px-1.5 py-2 first:pl-0 whitespace-nowrap">{h}</th>)}
              </tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <React.Fragment key={r.sub}>
                    <tr className={cx(!err[i] && 'border-b border-line/70')}>
                      <td className="sticky left-0 bg-surface pr-2 py-2 font-semibold whitespace-nowrap">{r.sub}</td>
                      <td className="px-1.5 py-2"><input aria-label={`Exam date for ${r.sub}`} value={r.date} onChange={(e) => setRow(i, 'date', e.target.value)} placeholder="DD-MM-YYYY" className={cx(inputCls(tried && err[i]), '!h-10 !w-[128px] tnum !text-[14px]')} /></td>
                      <td className="px-1.5 py-2"><Select id={`r-st-${i}`} value={r.start} onChange={(v) => setRow(i, 'start', v)} options={TIMES} className="w-[118px] [&_select]:!h-10 [&_select]:!text-[14px]" /></td>
                      <td className="px-1.5 py-2"><Select id={`r-du-${i}`} value={r.dur} onChange={(v) => setRow(i, 'dur', v)} options={DURS} className="w-[124px] [&_select]:!h-10 [&_select]:!text-[14px]" /></td>
                      <td className="px-1.5 py-2 tnum text-ink2 whitespace-nowrap">{r.date ? fmtMin(toMin(r.start) + durMin(r.dur)) : '—'}</td>
                      <td className="px-1.5 py-2"><input aria-label={`Location for ${r.sub}`} value={r.room} onChange={(e) => setRow(i, 'room', e.target.value)} placeholder={classes[0] || 'Class room'} className={cx(inputCls(false), '!h-10 !w-[110px] !text-[14px]')} /></td>
                      <td className="px-1.5 py-2 whitespace-nowrap text-ink2">{r.inv}</td>
                      <td className="px-1.5 py-2"><input aria-label={`Max marks for ${r.sub}`} inputMode="numeric" value={r.max} onChange={(e) => setRow(i, 'max', e.target.value.replace(/\D/g, ''))} className={cx(inputCls(false), '!h-10 !w-[72px] tnum text-center !text-[14px]')} /></td>
                    </tr>
                    {err[i] && <tr className="border-b border-line/70"><td /><td colSpan={7} className="pb-2 px-1.5"><p className="text-[12.5px] text-bad flex items-center gap-1.5"><I.CircleAlert size={14} />{err[i]}</p></td></tr>}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {tried && !dated.length && <p className="text-[12.5px] text-bad flex items-center gap-1.5"><I.CircleAlert size={14} />Give at least one subject an exam date.</p>}
          <div className="rounded-2xl border border-line p-3.5 text-[13px] text-ink2">
            <p className="font-semibold text-ink mb-1.5">Before you save</p>
            <ul className="flex flex-col gap-1 list-disc pl-4">
              <li>Subjects are listed by date and time. An empty exam date leaves the subject out.</li>
              <li>The pattern can be changed for one subject. Mark categories are configured after saving.</li>
              <li>Once results are uploaded, changes are restricted.</li>
            </ul>
          </div>
        </section>
      </div>
    </Sheet>
  );
}

function RoomsSheet({ open, onClose }) {
  const toast = useToast();
  const ROOMS = ['Room 9', 'Room 10', 'Room 11', 'Room 12', 'Room 13', 'Room 14', 'Room 17', 'Room 18', 'Room 19', 'Room 20', 'Room 21', 'Room 22', 'Exam hall A', 'Exam hall B'];
  const [day, setDay] = useState('Mon 12 Oct');
  const init = () => ALL_SECS.map((s, i) => ({ sec: s, room: s === '9 C' ? 'Room 12' : SEC[s].room, inv: invigOf(s, 0) }));
  const [rows, setRows] = useState(init);
  const errs = rows.map((r, i) => {
    const o = rows.find((x, j) => j !== i && j < i && x.room === r.room);
    if (o) return `${r.room} is used by ${o.sec} at that time. Choose another room.`;
    const v = rows.find((x, j) => j < i && x.inv === r.inv);
    if (v) return `${r.inv} already invigilates ${v.sec} at that time.`;
    return '';
  });
  const bad = errs.filter(Boolean).length;
  return (
    <Sheet open={open} onClose={onClose} wide title="Rooms and invigilators" sub="One room and one invigilator per paper. Clashes are blocked."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={I.Check} disabled={!!bad} onClick={() => { onClose(); toast({ title: `Rooms and invigilators saved for ${day}`, body: '12 papers · invigilators see it in their Time Table' }); }}>{bad ? `Fix ${bad} ${bad === 1 ? 'clash' : 'clashes'} first` : 'Save'}</Button></>}>
      <div className="flex flex-col gap-3">
        <Field label="Exam day" id="rm-day"><Select id="rm-day" value={day} onChange={(v) => { setDay(v); setRows(init()); }} options={HY_MID.map((x) => x.day)} /></Field>
        <ul className="flex flex-col divide-y divide-line/70 border-y border-line/70">
          {rows.map((r, i) => (
            <li key={r.sec} className="py-2.5 flex flex-col gap-1.5">
              <div className="grid grid-cols-[56px_1fr_1fr] gap-2 items-center">
                <span className="font-semibold text-[14px]">{r.sec}</span>
                <Select id={`rm-${i}`} value={r.room} error={!!errs[i] && errs[i].includes('room')} onChange={(v) => setRows((x) => x.map((y, j) => (j === i ? { ...y, room: v } : y)))} options={ROOMS} />
                <Select id={`iv-${i}`} value={r.inv} error={!!errs[i] && errs[i].includes('invigilates')} onChange={(v) => setRows((x) => x.map((y, j) => (j === i ? { ...y, inv: v } : y)))} options={INVIG} />
              </div>
              {errs[i] && <p className="text-[12.5px] text-bad flex items-center gap-1.5 pl-[64px]"><I.CircleAlert size={14} />{errs[i]}</p>}
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}

function SeatingSheet({ open, onClose }) {
  const toast = useToast();
  const [mix, setMix] = useState(true);
  const [room, setRoom] = useState('Room 14');
  const pair = { 'Room 14': ['7 B', '8 A'], 'Room 13': ['7 A', '8 B'], 'Exam hall A': ['9 A', '10 A'] }[room];
  const seats = Array.from({ length: 40 }, (_, i) => {
    const a = mix ? pair[i % 2] : pair[0];
    const roll = mix ? Math.floor(i / 2) + 1 : i + 1;
    return { a, roll, label: `${a}-${String(roll).padStart(2, '0')}` };
  });
  return (
    <Sheet open={open} onClose={onClose} wide title="Seating arrangement" sub="Seat numbers per room by roll number. Optional."
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button><Button variant="primary" icon={I.Printer} onClick={() => { onClose(); toast({ title: 'Seating charts sent to the office printer', body: '14 rooms · one chart per door and one per invigilator' }); }}>Print seating charts</Button></>}>
      <div className="flex flex-col gap-4">
        <div className="grid @md:grid-cols-2 gap-3">
          <Field label="Room" id="st-room"><Select id="st-room" value={room} onChange={setRoom} options={['Room 14', 'Room 13', 'Exam hall A']} /></Field>
          <div className="rounded-xl border border-line px-3.5 py-2.5 flex items-center gap-3 self-end">
            <Switch id="st-mix" on={mix} onChange={setMix} label="Mix classes" />
            <label htmlFor="st-mix" className="text-[13.5px]"><b className="font-semibold block">Mix classes in a room</b><span className="text-ink3 text-[12.5px]">Two classes sit in turns, so neighbours write different papers</span></label>
          </div>
        </div>
        <div className="rounded-2xl border border-line p-3">
          <p className="text-center text-[12px] font-semibold text-ink3 mb-2 eyebrow">Board · {room} · 40 seats</p>
          <div className="grid grid-cols-5 gap-1.5">
            {seats.map((x, i) => (
              <span key={i} className={cx('h-11 rounded-lg grid place-items-center text-[11.5px] font-semibold tnum leading-tight text-center', x.a === pair[0] ? 'bg-brand/10 text-brand' : 'bg-info/10 text-info')}>{x.label}</span>
            ))}
          </div>
          <div className="mt-3"><Legend items={[['bg-brand/30', `${pair[0]} · rolls 1–${mix ? 20 : 38}`], ...(mix ? [['bg-info/30', `${pair[1]} · rolls 1–20`]] : [])]} /></div>
        </div>
      </div>
    </Sheet>
  );
}

function CategoriesSheet({ open, onClose, rows }) {
  const toast = useToast();
  const parse = (cat) => cat.split(' · ').map((p) => { const m = /(.+) (\d+)$/.exec(p); return { k: m[1], v: m[2] }; });
  const [vals, setVals] = useState(() => rows.map((r) => ({ sub: r.sub, parts: parse(r.cat) })));
  const wants = rows.map((r) => parse(r.cat).reduce((a, p) => a + Number(p.v), 0));
  const errs = vals.map((r, i) => { const t = r.parts.reduce((a, p) => a + Number(p.v || 0), 0); return t === wants[i] ? '' : `${r.parts.map((p) => `${p.k} ${p.v || 0}`).join(' and ')} add up to ${t}. The total must be ${wants[i]}.`; });
  return (
    <FormSheet open={open} onClose={onClose} title="Configure mark categories" sub="The split shows as columns in Marks Entry and on the report card." submitLabel="Save categories"
      onSubmit={() => { if (errs.some(Boolean)) return false; toast({ title: 'Mark categories saved', body: 'Teachers see these columns in Marks Entry.' }); }}>
      <ul className="flex flex-col gap-3">
        {vals.map((r, i) => (
          <li key={r.sub + i} className="flex flex-col gap-1.5">
            <p className="font-semibold text-[14px]">{r.sub}</p>
            <div className="flex gap-2">
              {r.parts.map((p, j) => (
                <label key={p.k} className="flex-1 min-w-0">
                  <span className="text-[12px] text-ink3 font-semibold">{p.k}</span>
                  <input inputMode="numeric" value={p.v} onChange={(e) => setVals((x) => x.map((y, a) => (a === i ? { ...y, parts: y.parts.map((z, b) => (b === j ? { ...z, v: e.target.value.replace(/\D/g, '') } : z)) } : y)))} className={cx(inputCls(!!errs[i]), '!h-10 tnum')} />
                </label>
              ))}
            </div>
            {errs[i] && <p className="text-[12.5px] text-bad flex items-center gap-1.5"><I.CircleAlert size={14} />{errs[i]}</p>}
          </li>
        ))}
      </ul>
    </FormSheet>
  );
}

/* =====================================================================
   2. Admit Cards
   ===================================================================== */
function AdmitCardsPage({ access }) {
  const w = useWho(access);
  const toast = useToast();
  const exams = DATESHEETS.filter((d) => ['Published', 'Ongoing', 'Draft'].includes(d.status) && d.id !== 'pb1-10');
  const [exam, setExam] = useState('hy-610');
  const [sec, setSec] = useState('7 B');
  const [q, setQ] = useState('');
  const [one, setOne] = useState(null);
  const [print, setPrint] = useState(null);
  const [printed, setPrinted] = useState(() => new Set(['6 A', '6 B', '7 A', '8 A', '8 B', '9 A', '9 B', '9 C', '10 A', '10 B', '10 C']));
  const d = DATESHEETS.find((x) => x.id === exam);
  const secs = d.id === 'cp-10' ? ['10 A', '10 B', '10 C'] : ALL_SECS;
  const cur = secs.includes(sec) ? sec : secs[0];
  const list = roster(cur);
  const noPhoto = list.filter((s) => NO_PHOTO.has(s.name));
  const rows = list.filter((s) => !q.trim() || s.name.toLowerCase().includes(q.trim().toLowerCase()) || s.adm.toLowerCase().includes(q.trim().toLowerCase()) || String(s.roll) === q.trim());
  const batches = (n) => Math.ceil(n / 50);
  const doPrint = () => {
    const p = print;
    if (p.scope === 'class') setPrinted((x) => new Set([...x, cur]));
    if (p.scope === 'all') setPrinted(new Set(ALL_SECS));
    toast({ title: `${p.n} admit cards sent to the office printer`, body: `${batches(p.n)} ${batches(p.n) === 1 ? 'batch' : 'batches'} of up to 50 · ${p.label}` });
  };

  return (
    <div>
      <ModuleHead sub={w.office ? 'Print admit cards for a whole class or one student' : 'Only datesheets that are published have admit cards'}
        actions={<Button variant="primary" icon={I.Printer} onClick={() => setPrint({ scope: 'all', n: HY_STUDENTS, label: 'Half Yearly · Classes 6–10' })}>Print all classes</Button>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <ul className="grid @md:grid-cols-3 gap-3">
          {exams.map((x) => {
            const ready = x.status !== 'Draft';
            return (
              <li key={x.id}>
                <button onClick={() => (ready ? setExam(x.id) : toast({ title: 'Publish the datesheet first', body: `${x.title} · ${x.classes} is still a draft. Admit cards come from the published schedule.`, tone: 'info' }))}
                  aria-pressed={exam === x.id}
                  className={cx('w-full text-left rounded-2xl border-2 bg-surface p-4 shadow-card transition', exam === x.id ? 'border-brand' : 'border-transparent', !ready && 'opacity-90')}>
                  <div className="flex items-center gap-2"><Pill tone={DS_TONE[x.status]}>{x.status}</Pill>{!ready && <I.Lock size={14} className="text-ink3" />}</div>
                  <p className="font-semibold text-[15px] mt-2">{x.title} · {x.classes}</p>
                  <p className="text-[12.5px] text-ink3">{x.from} to {x.to} · {x.subjects} {x.subjects === 1 ? 'subject' : 'subjects'} · {x.students} students</p>
                </button>
              </li>
            );
          })}
        </ul>

        <Split side={380}>
          <Col>
            <Card className="overflow-hidden">
              <div className="p-4 @md:p-5 grid grid-cols-2 @md:grid-cols-4 gap-3 border-b border-line">
                <div><p className="text-[12px] text-ink3 font-semibold">Exam</p><p className="font-semibold text-[14.5px]">{d.title} 2026–27</p></div>
                <div><p className="text-[12px] text-ink3 font-semibold">Class</p><Select id="ac-sec" value={cur} onChange={setSec} options={secOptions(secs)} className="mt-0.5 [&_select]:!h-9 [&_select]:!text-[14px]" /></div>
                <div><p className="text-[12px] text-ink3 font-semibold">Type</p><p className="font-semibold text-[14.5px]">{d.type} · {d.term}</p></div>
                <div><p className="text-[12px] text-ink3 font-semibold">Total students</p><p className="font-semibold text-[14.5px] tnum">{list.length}</p></div>
              </div>
              {noPhoto.length > 0 && (
                <div className="p-3 border-b border-line">
                  <Banner tone="warn" title={`${noPhoto.length} ${noPhoto.length === 1 ? 'student has' : 'students have'} no photo:`} action={<Button size="sm" variant="secondary" onClick={() => toast({ title: 'Photo request sent to 2 parents', body: 'They can add a photo through Parent Link.' })}>Ask parents</Button>}>
                    {noPhoto.map((s) => `${s.name} (roll ${s.roll})`).join(', ')}. You can still print; the photo box stays empty.
                  </Banner>
                </div>
              )}
              <Toolbar>
                <SearchBox id="ac-search" value={q} onChange={setQ} placeholder="Find one student: name, roll or admission no." />
                <Button variant="primary" icon={I.Printer} onClick={() => setPrint({ scope: 'class', n: list.length, label: `${d.title} · Class ${cur}`, photo: noPhoto.length })}>Print {list.length} cards</Button>
              </Toolbar>
              <DataList bp="md" minWidth={560} footer={`Showing ${rows.length} of ${list.length} · ${printed.has(cur) ? 'printed for this class on 7 Oct' : 'not printed yet'}`}
                columns={[
                  { key: 'roll', label: 'Roll', render: (s) => <span className="tnum text-ink3">{s.roll}</span> },
                  { key: 'name', label: 'Student', render: (s) => <div className="flex items-center gap-2.5"><Avatar name={s.name} size={32} /><span className="font-semibold">{s.name}</span></div> },
                  { key: 'adm', label: 'Admission no.', render: (s) => <span className="font-mono text-[12.5px]">{s.adm}</span> },
                  { key: 'photo', label: 'Photo', render: (s) => (NO_PHOTO.has(s.name) ? <Pill tone="warn">No photo</Pill> : <Pill tone="ok" dot>Ready</Pill>) },
                  { key: 'act', label: '', align: 'right', render: (s) => <Button size="sm" variant="ghost" icon={I.Eye} onClick={(e) => { e.stopPropagation(); setOne(s); }}>View</Button> },
                ]}
                rows={rows}
                mobile={(s) => ({ avatar: s.name, title: `${s.roll}. ${s.name}`, sub: s.adm, right: <Button size="sm" variant="ghost" icon={I.Eye} onClick={() => setOne(s)}>View</Button>, pills: NO_PHOTO.has(s.name) ? [<Pill key="p" tone="warn" className="!h-[22px] !text-[11.5px]">No photo</Pill>] : null })} />
            </Card>
          </Col>
          <Col>
            <Card>
              <CardHead title="Preview" sub={`${FEATURED.name} · roll ${FEATURED.roll}`} icon={I.IdCard}
                action={<Button size="sm" variant="ghost" icon={I.Download} onClick={() => toast({ title: 'Saved: Admit-card-Aarav-Sharma.pdf' })}>PDF</Button>} />
              <div className="px-3 pb-3"><AdmitCard s={roster('7 B').find((x) => x.id === FEATURED.id)} sec="7 B" compact /></div>
            </Card>
            <Card>
              <CardHead title="Printed so far" sub="Half Yearly · Classes 6–10" icon={I.Printer} />
              <div className="px-5 pb-5 flex flex-col gap-2.5">
                {SECS.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 text-[13.5px]">
                    <span className="w-12 font-semibold">{s.id}</span>
                    <Progress value={printed.has(s.id) ? 100 : 0} tone={printed.has(s.id) ? 'ok' : 'warn'} className="flex-1" />
                    <span className={cx('w-20 text-right tnum', !printed.has(s.id) && 'text-warn font-semibold')}>{printed.has(s.id) ? `${s.n} of ${s.n}` : `0 of ${s.n}`}</span>
                  </div>
                ))}
              </div>
            </Card>
          </Col>
        </Split>
      </div>

      <Sheet open={!!one} onClose={() => setOne(null)} wide title={one ? `Admit card · ${one.name}` : ''} sub={one ? `Class ${cur} · roll ${one.roll}` : ''}
        footer={<><Button variant="ghost" onClick={() => setOne(null)}>Close</Button><Button variant="secondary" icon={I.Download} onClick={() => toast({ title: `Saved: Admit-card-${one?.name.replace(' ', '-')}.pdf` })}>PDF</Button><Button variant="primary" icon={I.Printer} onClick={() => { setOne(null); toast({ title: `Admit card for ${one.name} sent to the office printer` }); }}>Print</Button></>}>
        {one && <AdmitCard s={one} sec={cur} />}
      </Sheet>
      <ConfirmSheet open={!!print} onClose={() => setPrint(null)} title={print ? `Print ${print.n} admit cards?` : ''} confirmLabel={print ? `Print ${print.n} cards` : ''} onConfirm={doPrint}>
        {print && (
          <div className="flex flex-col gap-3 text-[14px] text-ink2">
            <p>{print.label}. They print in <b className="text-ink">{batches(print.n)} {batches(print.n) === 1 ? 'batch' : 'batches'} of up to 50</b>, in roll order, on the office printer.</p>
            {(print.photo || print.scope === 'all') && <Banner tone="warn">2 students have no photo (Ira Das and Sai Das, 7 B). Their cards print with an empty photo box.</Banner>}
          </div>
        )}
      </ConfirmSheet>
    </div>
  );
}

function AdmitCard({ s, sec, compact }) {
  const sched = scheduleFor(sec);
  return (
    <div className="rounded-2xl border border-line bg-surface overflow-hidden text-[13px]">
      <div className="flex items-center gap-3 px-4 py-3.5 border-b border-line bg-sunken/40">
        <Logo size={compact ? 34 : 40} />
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold text-[15px] leading-tight">Sunrise Public School</p>
          <p className="text-[11.5px] text-ink3 truncate">Kukatpally, Hyderabad · CBSE · SPS-HYD-001</p>
        </div>
      </div>
      <div className="px-4 pt-3 text-center">
        <p className="eyebrow text-brand">Examination admit card</p>
        <p className="font-semibold text-[14.5px]">Half Yearly Examination 2026–27 · Term 1</p>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 min-w-0">
          {[['Student', s.name], ['Roll no.', s.roll], ['Class', sec], ['Admission no.', <span key="a" className="font-mono text-[12px]">{s.adm}</span>], ["Father's name", fatherOf(s)], ["Mother's name", motherOf(s)]].map(([k, v]) => (
            <div key={k} className="min-w-0"><dt className="text-[11px] text-ink3 font-semibold">{k}</dt><dd className="font-semibold truncate">{v}</dd></div>
          ))}
        </dl>
        <div className={cx('rounded-xl border border-line grid place-items-center shrink-0 overflow-hidden', compact ? 'w-[72px] h-[88px]' : 'w-[88px] h-[108px]')}>
          {NO_PHOTO.has(s.name) ? <span className="text-[11px] text-ink3 text-center px-1">No photo</span> : <Avatar name={s.name} size={compact ? 56 : 68} />}
        </div>
      </div>
      <div className="overflow-x-auto scroll-thin border-t border-line">
        <table className="w-full text-[12.5px] min-w-[460px]">
          <thead><tr className="text-[11px] text-ink3 text-left border-b border-line">{['No.', 'Subject', 'Date', 'Time', 'Max', 'Invigilator'].map((h) => <th key={h} className="font-semibold px-3 py-2 first:pl-4">{h}</th>)}</tr></thead>
          <tbody>
            {sched.map((p, i) => (
              <tr key={p.sub} className="border-b border-line/60 last:border-0">
                <td className="px-3 pl-4 py-1.5 tnum text-ink3">{i + 1}</td>
                <td className="px-3 py-1.5"><b className="font-semibold">{p.sub}</b><span className="block text-[11px] text-ink3">{p.cat}</span></td>
                <td className="px-3 py-1.5 whitespace-nowrap tnum">{p.day}</td>
                <td className="px-3 py-1.5 whitespace-nowrap tnum">{p.start}–{p.end}</td>
                <td className="px-3 py-1.5 tnum font-semibold">{p.max}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{invigOf(sec, i)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3 border-t border-line">
        <p className="text-[11px] text-ink3 font-semibold mb-1">Instructions for candidates</p>
        <ul className="text-[12px] text-ink2 list-disc pl-4 flex flex-col gap-0.5">
          <li>Report by 8:15 AM. Bring this card and two pencils, a pen and a geometry box.</li>
          <li>Phones, smart watches and calculators are not allowed in the hall.</li>
        </ul>
      </div>
      <div className="grid grid-cols-3 gap-3 px-4 pt-6 pb-3 text-center text-[11px] text-ink3">
        {['Student', 'Class teacher', 'Principal'].map((x) => <div key={x}><span className="block border-t border-line pt-1">{x}</span></div>)}
      </div>
    </div>
  );
}

/* =====================================================================
   3. Marks Entry
   ===================================================================== */
function MarksPage({ params, access }) {
  const w = useWho(access);
  const { go } = useNav();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [st, setSt] = useState('all');
  const [cls, setCls] = useState('all');
  const [sel, setSel] = useState(new Set());
  const [remind, setRemind] = useState(null);
  if (params?.id) return <MarksGrid id={params.id} w={w} />;
  const open = (p) => go('exams', { page: 'marks', id: p.id });

  if (w.teacher || w.ct) {
    const ORDER = { 'In progress': 0, 'Not started': 1, Locked: 2 };
    const hy = w.myClasses.map((s) => paperOf(`hy|${s}|${w.mySubject}`)).sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.done / b.n - a.done / a.n);
    const ut = w.myClasses.map((s) => paperOf(`ut2|${s}|${w.mySubject}`));
    const comp = w.teacher ? 'Internal / 20' : 'Practical / 30';
    return (
      <div>
        <ModuleHead sub={`${w.mySubject} · ${w.myClasses.join(', ')} · only your subject and classes`}
          actions={w.canEdit && <Button variant="secondary" icon={I.FileSpreadsheet} onClick={() => toast({ title: 'Import marks from Excel', body: 'Download the template for your class, fill it and upload. Each row is checked before anything is saved.', tone: 'info' })}>Import from Excel</Button>} />
        <div className="flex flex-col gap-5 @lg:gap-6">
          <Banner tone="info" title={`${comp.split(' ')[0]} marks are open now.`}>Theory marks open after each paper, from Sat 17 Oct. All marks are due on Fri 30 Oct.</Banner>
          <Card>
            <CardHead title="Half Yearly" sub={`${hy.length} papers · ${w.mySubject}`} icon={I.ClipboardCheck} />
            <ul className="px-2 pb-2">
              {hy.map((p) => (
                <li key={p.id}>
                  <button onClick={() => open(p)} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-sunken/70 transition text-left group">
                    <span className={cx('w-11 h-11 rounded-xl grid place-items-center shrink-0 font-semibold text-[14px]', TONE_SOFT[P_TONE[p.status]])}>{p.sec}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[14.5px]">{p.sub} · Class {p.sec}</p>
                      <p className="text-[12.5px] text-ink3 truncate">{comp}: {p.locked ? `locked ${p.locked}` : `${p.done} of ${p.n} entered`} · Theory opens {theoryOpens(p.sec, p.sub)}</p>
                      <Progress value={(p.done / p.n) * 100} tone={p.locked ? 'ok' : 'brand'} className="mt-1.5 max-w-xs" />
                    </div>
                    <Pill tone={P_TONE[p.status]} className="hidden @sm:inline-flex">{p.status}</Pill>
                    <I.ChevronRight size={18} className="text-ink3" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHead title="Unit Test 2" sub="Submitted and locked. A change needs a reason and the Principal's approval." icon={I.Lock} />
            <ul className="px-2 pb-2">
              {ut.map((p) => (
                <li key={p.id}>
                  <button onClick={() => open(p)} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-sunken/70 transition text-left">
                    <span className="w-11 h-11 rounded-xl grid place-items-center shrink-0 font-semibold text-[14px] bg-sunken text-ink2">{p.sec}</span>
                    <div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px]">{p.sub} · Class {p.sec}</p><p className="text-[12.5px] text-ink3">Written / 25 · {p.n} of {p.n} · locked {p.locked}</p></div>
                    <Pill tone="ok"><I.Lock size={12} />Locked</Pill>
                    <I.ChevronRight size={18} className="text-ink3" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    );
  }

  const list = HY_PAPERS.filter((p) => (st === 'all' || p.status === st) && (cls === 'all' || p.sec === cls) && (!q.trim() || `${p.sub} ${p.teacher} ${p.sec}`.toLowerCase().includes(q.trim().toLowerCase())));
  const cnt = HY_PAPERS.reduce((a, p) => ((a[p.status] = (a[p.status] || 0) + 1), a), {});
  const behind = HY_PAPERS.filter((p) => p.status === 'Not started');
  const teachersBehind = [...new Set(behind.map((p) => p.teacher))];
  return (
    <div>
      <ModuleHead sub="Half Yearly 2026–27 · marks entry status for every paper"
        actions={w.canEdit && <Button variant="primary" icon={I.BellRing} onClick={() => setRemind({ n: teachersBehind.length, papers: behind.length })}>Remind teachers</Button>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Stats items={[
          { label: 'Papers', value: HY_PAPERS.length, sub: '12 sections × 6 subjects', icon: 'ClipboardCheck' },
          { label: 'Internal locked', value: cnt.Locked || 0, sub: 'Submitted by the teacher', tone: 'ok', icon: 'Lock', onClick: () => setSt('Locked') },
          { label: 'In progress', value: cnt['In progress'] || 0, sub: 'Being entered now', tone: 'warn', icon: 'PencilLine', onClick: () => setSt('In progress') },
          { label: 'Not started', value: cnt['Not started'] || 0, sub: `${teachersBehind.length} teachers`, tone: 'bad', icon: 'CircleDashed', onClick: () => setSt('Not started') },
        ]} />
        <Banner tone="info" title="Theory marks open after each paper,">from Sat 17 Oct for the first week. Internal and practical marks can be entered now. Everything is due on Fri 30 Oct.</Banner>
        <Card className="overflow-hidden">
          <Toolbar>
            <SearchBox id="mk-search" value={q} onChange={setQ} placeholder="Subject, teacher or class" />
            <Select id="mk-class" value={cls} onChange={setCls} className="@md:w-40" options={[{ value: 'all', label: 'All classes' }, ...secOptions(ALL_SECS)]} />
            <ExportButton what="marks entry status" />
          </Toolbar>
          <div className="px-3 pt-3"><Chips value={st} onChange={setSt} options={[{ value: 'all', label: 'All', count: HY_PAPERS.length }, { value: 'Not started', label: 'Not started', count: cnt['Not started'] }, { value: 'In progress', label: 'In progress', count: cnt['In progress'] }, { value: 'Locked', label: 'Locked', count: cnt.Locked }]} /></div>
          <BulkBar count={sel.size} onClear={() => setSel(new Set())}>
            <Button size="sm" variant="secondary" icon={I.BellRing} onClick={() => setRemind({ n: new Set(list.filter((p) => sel.has(p.id)).map((p) => p.teacher)).size, papers: sel.size, sel: true })}>Remind their teachers</Button>
          </BulkBar>
          <DataList select={w.canEdit ? [sel, setSel] : null} onRow={open} minWidth={760}
            footer={`Showing 1 to ${list.length} of ${list.length}`}
            columns={[
              { key: 'p', label: 'Paper', render: (p) => <><p className="font-semibold">{p.sub} · {p.sec}</p><p className="text-[12.5px] text-ink3">{paperDay(p.sec, p.sub).day}</p></> },
              { key: 't', label: 'Teacher', render: (p) => <div className="flex items-center gap-2"><Avatar name={p.teacher} size={28} /><span>{p.teacher}</span></div> },
              { key: 'i', label: 'Internal or practical', render: (p) => <div className="w-40"><Progress value={(p.done / p.n) * 100} tone={p.locked ? 'ok' : 'brand'} /><p className="text-[12.5px] text-ink3 mt-1 tnum">{p.done} of {p.n} entered</p></div> },
              { key: 'th', label: 'Theory', nowrap: true, render: (p) => <span className="text-ink3 text-[13px]">Opens {theoryOpens(p.sec, p.sub)}</span> },
              { key: 's', label: 'Status', nowrap: true, render: (p) => <><Pill tone={P_TONE[p.status]}>{p.status}</Pill>{p.locked && <span className="block text-[12px] text-ink3 mt-0.5">{p.locked}</span>}</> },
            ]}
            rows={list}
            mobile={(p) => ({ icon: 'ClipboardCheck', iconTone: P_TONE[p.status], title: `${p.sub} · ${p.sec}`, sub: `${p.teacher} · ${p.done} of ${p.n}`, pills: [<Pill key="s" tone={P_TONE[p.status]} className="!h-[22px] !text-[11.5px]">{p.status}</Pill>] })} />
        </Card>
      </div>
      <ConfirmSheet open={!!remind} onClose={() => setRemind(null)} title="Remind teachers about marks?" confirmLabel={remind ? `Remind ${remind.n} teachers` : ''}
        onConfirm={() => { setSel(new Set()); toast({ title: `Reminder sent to ${remind.n} teachers`, body: 'In the app and on WhatsApp. They see which papers are pending.' }); }}>
        {remind && <p className="text-[14px] text-ink2">{remind.papers} papers have marks not started. Each teacher gets one message listing their own papers and the due date, Fri 30 Oct.</p>}
      </ConfirmSheet>
    </div>
  );
}

// Starting marks for a paper (what is already typed or locked)
function startMarks(p, rows) {
  const v = {};
  rows.forEach((s, i) => {
    const r = {};
    p.comps.forEach((c) => {
      if (p.exam === 'ut2') { const m = utMark(s, p.sub, 2); r[c.k] = String(m); return; }
      if (c.k === 'th') { r[c.k] = ''; return; }
      if (i >= p.done) { r[c.k] = ''; return; }
      if (p.sec === '7 B' && p.sub === 'Mathematics' && s.roll === 29) { r[c.k] = '24'; return; }
      if (p.sec === '7 B' && s.roll === 19) { r[c.k] = 'ML'; return; }
      if (p.sec === '7 B' && p.sub === 'Science' && s.roll === 13) { r[c.k] = 'AB'; return; }
      const a = ability(s) + ((hash(s.name + c.k + p.sub) % 15) - 7) / 100;
      r[c.k] = String(Math.max(Math.round(c.max * 0.35), Math.min(c.max, Math.round(c.max * a))));
    });
    v[s.id] = r;
  });
  return v;
}
const CODES = ['AB', 'ML'];
function cellError(v, c) {
  if (v === '' || CODES.includes(v)) return '';
  if (!/^\d+(\.5)?$/.test(v)) return `${c.label}: “${v}” is not a mark. Type a number from 0 to ${c.max}, or AB or ML.`;
  if (Number(v) > c.max) return `${c.label} is out of ${c.max}. ${v} is too high.`;
  return '';
}

function MarksGrid({ id, w }) {
  const { go } = useNav();
  const toast = useToast();
  const p = paperOf(id);
  const rows = roster(p.sec);
  const [vals, setVals] = useState(() => startMarks(p, rows));
  const [locked, setLocked] = useState(() => new Set(p.exam === 'ut2' || p.locked ? p.comps.filter((c) => p.exam === 'ut2' || c.k !== 'th').map((c) => c.k) : []));
  const [view, setView] = useState('grid');
  const [saved, setSaved] = useState('10:41 AM');
  const [dirty, setDirty] = useState(false);
  const [tried, setTried] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [req, setReq] = useState(null);
  const [pending, setPending] = useState({});
  const [history, setHistory] = useState(HISTORY[id] || []);
  const refs = useRef({});
  const isOpen = (c) => p.exam === 'ut2' || c.k !== 'th';
  const editable = (c) => w.canEdit && isOpen(c) && !locked.has(c.k);
  const openComps = p.comps.filter(editable);
  const onBehalf = w.full && w.name !== p.teacher;
  const setVal = (sid, k, v) => { setVals((x) => ({ ...x, [sid]: { ...x[sid], [k]: v } })); setDirty(true); };
  const norm = (v) => { const u = v.trim().toUpperCase(); return u === 'A' ? 'AB' : u === 'M' ? 'ML' : u; };
  const statComps = openComps.length ? openComps : p.comps.filter(isOpen);
  const problems = rows.flatMap((s) => openComps.map((c) => ({ s, c, e: cellError(vals[s.id][c.k], c) }))).filter((x) => x.e);
  const blanks = rows.filter((s) => openComps.some((c) => vals[s.id][c.k] === ''));
  const count = (code) => rows.filter((s) => statComps.some((c) => vals[s.id][c.k] === code)).length;
  const entered = rows.filter((s) => statComps.every((c) => vals[s.id][c.k] !== '')).length;
  const nums = rows.flatMap((s) => statComps.map((c) => vals[s.id][c.k])).filter((v) => /^\d/.test(v) && !cellError(v, statComps[0])).map(Number);
  const compLabel = openComps.map((c) => c.label.toLowerCase()).join(' and ');
  const total = (s) => {
    const vs = p.comps.map((c) => vals[s.id][c.k]);
    if (vs.some((v) => v === '')) return null;
    if (vs.some((v) => CODES.includes(v))) return vs.find((v) => CODES.includes(v));
    return vs.reduce((a, v) => a + Number(v), 0);
  };
  const maxTotal = p.comps.reduce((a, c) => a + c.max, 0);
  const move = (i, k, dir) => { const el = refs.current[`${i + dir}-${k}`]; if (el) { el.focus(); el.select(); } };
  const submit = () => { setTried(true); if (problems.length || blanks.length) return; setConfirm(true); };
  const lockNow = () => {
    setLocked((x) => new Set([...x, ...openComps.map((c) => c.k)]));
    setDirty(false); setTried(false);
    toast({ title: `${openComps.map((c) => c.label).join(' and ')} marks locked · ${p.sub}, ${p.sec}`, body: 'Corrections now need a reason and the Principal’s approval.' });
  };
  const approver = w.principal ? 'Srinivas Murthy (Vice Principal)' : 'Lakshmi Rao (Principal)';
  const examName = p.exam === 'ut2' ? 'Unit Test 2' : 'Half Yearly';

  return (
    <div className="pb-24">
      <BackLink label="Marks Entry" sub={`${examName} · ${p.sub} · ${p.sec}`} onClick={() => go('exams', { page: 'marks' })} />
      <div className="flex flex-col gap-5">
        <Card className="p-4 @md:p-5 flex flex-col @lg:flex-row @lg:items-center gap-4">
          <span className={cx('w-12 h-12 rounded-2xl grid place-items-center shrink-0 font-semibold', TONE_SOFT[locked.size === p.comps.filter(isOpen).length ? 'ok' : 'brand'])}>{p.sec}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-[22px] @md:text-[26px] font-semibold tracking-tight leading-tight">{p.sub} · Class {p.sec}</h1>
              {p.comps.map((c) => <Pill key={c.k} tone={locked.has(c.k) ? 'ok' : isOpen(c) ? 'warn' : 'neutral'}>{locked.has(c.k) ? <I.Lock size={12} /> : null}{c.label} / {c.max}{locked.has(c.k) ? ' locked' : isOpen(c) ? ' open' : ` opens ${theoryOpens(p.sec, p.sub)}`}</Pill>)}
            </div>
            <p className="text-[13.5px] text-ink3 mt-0.5">{examName} · paper {p.exam === 'ut2' ? '23 Sep' : paperDay(p.sec, p.sub).day} · {p.teacher} · {rows.length} students{p.exam !== 'ut2' && ' · marks due Fri 30 Oct'}</p>
          </div>
          <div className="flex gap-2 items-center">
            <Segmented size="sm" value={view} onChange={setView} options={[{ value: 'grid', label: 'Grid', icon: I.Table }, { value: 'one', label: 'One at a time', icon: I.Smartphone }]} />
            {w.canEdit && <Button variant="secondary" icon={I.FileSpreadsheet} className="hidden @lg:inline-flex" onClick={() => toast({ title: 'Import marks from Excel', body: `Template for ${p.sub}, ${p.sec} downloaded. Upload it when filled.`, tone: 'info' })}>Import</Button>}
          </div>
        </Card>

        {onBehalf && openComps.length > 0 && <Banner tone="brand" icon="UserPen" title={`You are entering marks for ${p.teacher}.`}>Each mark records your name in the change history.</Banner>}

        <Stats items={[
          { label: `${statComps[0].label} entered`, value: `${entered} of ${rows.length}`, tone: entered === rows.length ? 'ok' : undefined, icon: 'ListChecks' },
          { label: 'Absent (AB)', value: count('AB'), sub: 'Counted as zero', icon: 'UserX' },
          { label: 'Medical (ML)', value: count('ML'), sub: 'Left out of the average', icon: 'Stethoscope' },
          { label: problems.length ? 'Need a fix' : 'Class average', value: problems.length ? problems.length : nums.length ? `${avg(nums)} / ${statComps[0].max}` : '—', tone: problems.length ? 'bad' : undefined, icon: problems.length ? 'TriangleAlert' : 'Calculator' },
        ]} />

        {problems.length > 0 && (
          <Banner tone="bad" title={`${problems.length} ${problems.length === 1 ? 'mark needs' : 'marks need'} a fix.`}>
            {problems.slice(0, 3).map((x) => `Roll ${x.s.roll}, ${x.s.name}: ${x.e}`).join(' ')}{problems.length > 3 ? ` And ${problems.length - 3} more.` : ''}
          </Banner>
        )}
        {tried && !problems.length && blanks.length > 0 && <Banner tone="warn" title={`${blanks.length} ${blanks.length === 1 ? 'student has' : 'students have'} no ${compLabel} mark yet:`}>{blanks.slice(0, 4).map((s) => `${s.name} (roll ${s.roll})`).join(', ')}{blanks.length > 4 ? ` and ${blanks.length - 4} more` : ''}. Type the mark, or AB for absent and ML for medical leave.</Banner>}
        {!openComps.length && p.comps.some((c) => !isOpen(c)) && <Banner tone="info" title={`Theory marks open ${theoryOpens(p.sec, p.sub)}, after the paper.`}>{p.comps.filter((c) => c.k !== 'th').map((c) => c.label).join(' and ')} marks are locked. Tap a locked mark to ask for a change.</Banner>}
        {p.exam === 'ut2' && <Banner tone="ok" icon="Lock" title={`Submitted and locked ${p.locked}.`}>Results were published on 28 Sep. A change needs a reason and approval, and the old mark stays in the history.</Banner>}

        {view === 'grid' ? (
          <Card className="overflow-hidden">
            <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap px-4 @md:px-5 py-3 border-b border-line text-[12.5px] text-ink3">
              <span className="flex items-center gap-1.5"><Kbd>Enter</Kbd> or <Kbd>↓</Kbd> next student</span>
              <span className="flex items-center gap-1.5"><Kbd>↑</Kbd> back</span>
              <span className="flex items-center gap-1.5"><Kbd>AB</Kbd> absent</span>
              <span className="flex items-center gap-1.5"><Kbd>ML</Kbd> medical leave</span>
              <span className="ml-auto">Empty means not entered yet</span>
            </div>
            <div className="overflow-x-auto scroll-thin">
              <table className="text-[13.5px] min-w-full">
                <thead>
                  <tr className="border-b border-line text-ink3 text-[12px]">
                    <th className="sticky left-0 z-10 bg-surface text-left font-semibold px-4 py-2.5 min-w-[190px]">Student</th>
                    {p.comps.map((c) => (
                      <th key={c.k} className="font-semibold px-2 py-2.5 text-center min-w-[100px]">
                        <span className="block text-ink2">{c.label} / {c.max}</span>
                        <span className={cx('block text-[11px] font-medium', locked.has(c.k) ? 'text-ok' : isOpen(c) ? 'text-brand' : '')}>{locked.has(c.k) ? 'Locked' : isOpen(c) ? 'Open' : `Opens ${theoryOpens(p.sec, p.sub)}`}</span>
                      </th>
                    ))}
                    {p.comps.length > 1 && <th className="font-semibold px-3 py-2.5 text-right whitespace-nowrap">Total / {maxTotal}</th>}
                    <th className="font-semibold px-4 py-2.5 text-center">Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s, i) => {
                    const t = total(s);
                    return (
                      <tr key={s.id} className="border-b border-line/60 last:border-0">
                        <td className="sticky left-0 z-10 bg-surface px-4 py-1.5 whitespace-nowrap"><span className="text-ink3 tnum inline-block w-6">{s.roll}</span><span className="font-medium">{s.name}</span></td>
                        {p.comps.map((c) => {
                          const v = vals[s.id][c.k];
                          const e = editable(c) && cellError(v, c);
                          const pend = pending[`${s.id}-${c.k}`];
                          return (
                            <td key={c.k} className="px-2 py-1.5 text-center">
                              {editable(c) ? (
                                <input ref={(el) => (refs.current[`${i}-${c.k}`] = el)} value={v} aria-label={`${c.label} for ${s.name}`} title={e || undefined}
                                  onChange={(ev) => setVal(s.id, c.k, ev.target.value.toUpperCase().slice(0, 4))}
                                  onBlur={(ev) => setVal(s.id, c.k, norm(ev.target.value))}
                                  onFocus={(ev) => ev.target.select()}
                                  onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === 'ArrowDown') { ev.preventDefault(); setVal(s.id, c.k, norm(ev.target.value)); move(i, c.k, 1); } if (ev.key === 'ArrowUp') { ev.preventDefault(); move(i, c.k, -1); } }}
                                  className={cx('w-[72px] h-10 rounded-lg border text-center text-[15px] font-semibold tnum bg-surface outline-none transition',
                                    e ? 'border-bad ring-4 ring-bad/10 text-bad' : CODES.includes(v) ? 'border-line text-info' : 'border-line focus:border-brand focus:ring-4 focus:ring-brand/15', tried && v === '' && 'border-warn bg-warn/[.06]')} />
                              ) : isOpen(c) && !w.canEdit ? <span className="inline-grid place-items-center w-[72px] h-10 rounded-lg bg-sunken/50 font-semibold tnum">{v || '—'}</span> : isOpen(c) ? (
                                <button onClick={() => setReq({ s, c, v })} title="Locked. Tap to ask for a change."
                                  className={cx('w-[72px] h-10 rounded-lg inline-flex items-center justify-center gap-1 font-semibold tnum transition', pend ? 'bg-warn/12 text-warn' : 'bg-sunken/70 hover:bg-sunken', CODES.includes(v) && !pend && 'text-info')}>
                                  {pend ? <><I.Hourglass size={12} />{pend}</> : <><I.Lock size={11} className="text-ink3" />{v}</>}
                                </button>
                              ) : <span className="inline-grid place-items-center w-[72px] h-10 rounded-lg bg-sunken/50 text-ink3">—</span>}
                            </td>
                          );
                        })}
                        {p.comps.length > 1 && <td className="px-3 text-right font-semibold tnum">{t == null ? <span className="text-ink3 font-normal">—</span> : t}</td>}
                        <td className="px-4 text-center">{(() => {
                          const only = p.comps.length === 1 ? vals[s.id][p.comps[0].k] : t;
                          if (only == null || only === '') return <span className="text-ink3">—</span>;
                          if (CODES.includes(only)) return <Pill tone="info" className="!h-5 !text-[11px]">{only}</Pill>;
                          const g = gradeOf((Number(only) / maxTotal) * 100);
                          return <Pill tone={gradeTone(g)} className="!h-5 !text-[11px]">{g}</Pill>;
                        })()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <OneAtATime rows={rows} comps={p.comps} vals={vals} setVal={setVal} editable={editable} isOpen={isOpen} opens={theoryOpens(p.sec, p.sub)} onLocked={(s, c, v) => w.canEdit && setReq({ s, c, v })} />
        )}

        {history.length > 0 && (
          <Card>
            <CardHead title="Change history" sub="Marks changed after they were locked. Nothing is overwritten." icon={I.History} />
            <div className="px-5"><Timeline items={history.map((h) => ({ icon: h.ok ? 'BadgeCheck' : 'Hourglass', tone: h.ok ? 'ok' : 'warn', what: <><b className="font-semibold">{h.name}</b>: {h.from} → {h.to}. “{h.why}” · asked by {h.by}{h.ok ? `, approved by ${h.ok}` : `, waiting for ${approver.split(' (')[0]}`}</>, when: h.when }))} /></div>
          </Card>
        )}
      </div>

      {openComps.length > 0 && (
        <div className="sticky bottom-0 mt-4 -mx-4 @md:mx-0 px-4 @md:px-0 pb-3 pt-3 bg-gradient-to-t from-bg via-bg to-bg/0 z-20">
          <div className="flex items-center gap-2 bg-surface border border-line rounded-2xl shadow-pop p-2 pl-4">
            <p className="text-[12.5px] text-ink3 flex-1 min-w-0 truncate hidden @sm:block">{dirty ? <><I.Circle size={8} className="inline text-warn fill-current mr-1.5" />Saved on this device as you type</> : <><I.CircleCheck size={13} className="inline text-ok mr-1.5" />Draft saved at {saved}</>}</p>
            <Button variant="secondary" icon={I.Save} className="flex-1 @sm:flex-none" onClick={() => { setDirty(false); setSaved('10:44 AM'); toast({ title: 'Draft saved', body: `${entered} of ${rows.length} ${compLabel} marks · only you and the Exam In-charge can see them` }); }}>Save draft</Button>
            <Button variant="primary" icon={I.Lock} className="flex-1 @sm:flex-none" onClick={submit}>Submit and lock</Button>
          </div>
        </div>
      )}

      <ConfirmSheet open={confirm} onClose={() => setConfirm(false)} title={`Submit and lock ${compLabel} marks?`} confirmLabel={`Submit and lock ${rows.length} marks`} onConfirm={lockNow}>
        <div className="flex flex-col gap-3 text-[14px] text-ink2">
          <p>{p.sub} · Class {p.sec} · {examName}.</p>
          <ul className="grid grid-cols-3 gap-2 text-center">
            <li className="rounded-xl bg-sunken/70 py-2.5"><b className="block font-display text-[20px] text-ink tnum">{rows.length - count('AB') - count('ML')}</b><span className="text-[12px]">with marks</span></li>
            <li className="rounded-xl bg-sunken/70 py-2.5"><b className="block font-display text-[20px] text-ink tnum">{count('AB')}</b><span className="text-[12px]">absent (AB)</span></li>
            <li className="rounded-xl bg-sunken/70 py-2.5"><b className="block font-display text-[20px] text-ink tnum">{count('ML')}</b><span className="text-[12px]">medical (ML)</span></li>
          </ul>
          <p>After this, you cannot change these marks. A correction needs a reason and approval from {approver.split(' (')[0]}, and the old mark is kept.</p>
        </div>
      </ConfirmSheet>
      <ChangeRequestSheet req={req} approver={approver} onClose={() => setReq(null)}
        onSend={(r, to, why) => {
          setPending((x) => ({ ...x, [`${r.s.id}-${r.c.k}`]: to }));
          setHistory((h) => [{ name: r.s.name, from: r.v, to, why, by: w.name, when: 'Today, 10:45 AM' }, ...h]);
          toast({ title: `Change sent to ${approver.split(' (')[0]} for approval`, body: `${r.s.name}: ${r.v} → ${to}. The old mark stays until it is approved.` });
        }} />
    </div>
  );
}

function OneAtATime({ rows, comps, vals, setVal, editable, isOpen, opens, onLocked }) {
  const [i, setI] = useState(() => Math.max(0, rows.findIndex((s) => comps.some((c) => editable(c) && vals[s.id][c.k] === ''))));
  const first = comps.find(editable);
  const [k, setK] = useState(first?.k);
  const s = rows[i];
  const c = comps.find((x) => x.k === k) || comps[0];
  const v = vals[s.id][c.k] ?? '';
  const e = first && editable(c) ? cellError(v, c) : '';
  const press = (key) => {
    if (!editable(c)) return;
    let nv = v;
    if (key === 'del') nv = v.slice(0, -1);
    else if (CODES.includes(key)) nv = key;
    else nv = CODES.includes(v) ? key : (v + key).slice(0, 4);
    setVal(s.id, c.k, nv);
  };
  return (
    <Card className="p-4 @md:p-6 max-w-xl w-full mx-auto">
      <div className="flex items-center gap-3">
        <Avatar name={s.name} size={48} />
        <div className="min-w-0 flex-1"><p className="font-semibold text-[16px] truncate">{s.name}</p><p className="text-[13px] text-ink3">Roll {s.roll} of {rows.length} · <span className="font-mono text-[12px]">{s.adm}</span></p></div>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-4">
        {comps.map((x) => {
          const xv = vals[s.id][x.k];
          return (
            <button key={x.k} onClick={() => (editable(x) ? setK(x.k) : isOpen(x) ? onLocked(s, x, xv) : null)} aria-pressed={k === x.k}
              className={cx('rounded-2xl border-2 p-3 text-left transition', k === x.k && editable(x) ? 'border-brand bg-brand/5' : 'border-line', !isOpen(x) && 'opacity-90')}>
              <span className="text-[12px] text-ink3 font-semibold flex items-center gap-1">{!editable(x) && <I.Lock size={11} />}{x.label} / {x.max}</span>
              <span className={cx('block font-display text-[28px] font-semibold tnum leading-tight', cellError(xv || '', x) && editable(x) && 'text-bad', CODES.includes(xv) && 'text-info')}>{isOpen(x) ? xv || '—' : '—'}</span>
              {!isOpen(x) && <span className="text-[11.5px] text-ink3">Opens {opens}</span>}
            </button>
          );
        })}
      </div>
      {e && <p className="text-[13px] text-bad flex items-center gap-1.5 mt-2" role="alert"><I.CircleAlert size={15} />{e}</p>}
      {first ? (
        <div className="grid grid-cols-3 gap-2 mt-4">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'AB', '0', 'ML'].map((key) => (
            <button key={key} onClick={() => press(key)} className={cx('h-14 rounded-xl border border-line text-[20px] font-semibold tnum active:bg-sunken hover:bg-sunken/60 transition', CODES.includes(key) && 'text-info text-[16px]')}>{key}</button>
          ))}
          <button onClick={() => press('.5')} className="h-12 rounded-xl border border-line text-[15px] font-semibold hover:bg-sunken/60">½</button>
          <button onClick={() => setVal(s.id, c.k, '')} className="h-12 rounded-xl border border-line text-[14px] font-semibold text-ink2 hover:bg-sunken/60">Clear</button>
          <button onClick={() => press('del')} aria-label="Delete last digit" className="h-12 rounded-xl border border-line grid place-items-center hover:bg-sunken/60"><I.Delete size={20} /></button>
        </div>
      ) : <p className="text-[13.5px] text-ink3 mt-4">These marks are locked. Tap a mark to ask for a change.</p>}
      <div className="flex gap-2 mt-4">
        <Button variant="secondary" icon={I.ChevronLeft} className="flex-1" disabled={i === 0} onClick={() => setI(i - 1)}>Previous</Button>
        <Button variant="primary" iconRight={I.ChevronRight} className="flex-1" disabled={i === rows.length - 1 || !!e} onClick={() => setI(i + 1)}>Next</Button>
      </div>
    </Card>
  );
}

function ChangeRequestSheet({ req, approver, onClose, onSend }) {
  const [to, setTo] = useState('');
  const [why, setWhy] = useState('');
  const [tried, setTried] = useState(false);
  if (!req) return null;
  const e1 = !to.trim() ? 'Enter the correct mark.' : cellError(to.trim().toUpperCase(), req.c) || (to.trim().toUpperCase() === req.v ? 'This is the same as the locked mark.' : '');
  const e2 = why.trim().length < 8 ? 'Say why the mark is wrong. The approver and the history see this.' : '';
  const close = () => { setTo(''); setWhy(''); setTried(false); onClose(); };
  return (
    <Sheet open={!!req} onClose={close} title="Ask for a mark change" sub={`${req.s.name} · roll ${req.s.roll} · ${req.c.label} / ${req.c.max}`}
      footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" icon={I.Send} onClick={() => { setTried(true); if (e1 || e2) return; onSend(req, to.trim().toUpperCase(), why.trim()); close(); }}>Send for approval</Button></>}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-sunken/70 px-3.5 py-2.5"><p className="text-[12px] text-ink3 font-semibold">Locked mark</p><p className="font-display text-[22px] font-semibold tnum">{req.v}</p></div>
          <Field label="Correct mark" required id="rq-to" error={tried && e1}><Input id="rq-to" value={to} onChange={(e) => setTo(e.target.value)} error={tried && e1} className="tnum !text-[18px] font-semibold" placeholder={`0 to ${req.c.max}`} /></Field>
        </div>
        <Field label="Reason" required id="rq-why" error={tried && e2}>
          <div className="flex flex-wrap gap-1.5 mb-1">
            {['Totalling error', 'A page was not checked', 'Re-evaluation asked by the parent', 'Typed wrongly'].map((x) => <button key={x} onClick={() => setWhy(x)} className="h-8 px-3 rounded-full bg-sunken text-[13px] font-medium hover:bg-line">{x}</button>)}
          </div>
          <Textarea id="rq-why" value={why} onChange={setWhy} placeholder="For example: question 7 was checked but not added to the total" />
        </Field>
        <p className="text-[12.5px] text-ink3 flex gap-1.5"><I.Info size={14} className="shrink-0 mt-0.5" />Goes to {approver} in Approvals. The old mark stays until it is approved. Results are worked out again after approval.</p>
      </div>
    </Sheet>
  );
}

/* =====================================================================
   4. Results
   ===================================================================== */
function ResultsPage({ access }) {
  const w = useWho(access);
  const { go } = useNav();
  const toast = useToast();
  const secs = w.myClasses;
  const [exam, setExam] = useState('ut2');
  const [sec, setSec] = useState(secs.includes('7 B') ? '7 B' : secs[0]);
  const [q, setQ] = useState('');
  const [one, setOne] = useState(null);
  const [publish, setPublish] = useState(false);
  const [unpub, setUnpub] = useState(false);
  const [statusOver, setStatusOver] = useState({});
  // A subject teacher sees only their own subject. A class teacher sees every subject of their own section (7 B) only.
  const subjOnly = w.teacher || (w.ct && sec !== '7 B');
  const si = SUBJECTS6.indexOf(w.mySubject);
  const ex = subjOnly && exam === 'final' ? 'ut2' : exam;
  const st = statusOver[ex + sec] || resultStatus(ex, sec);
  const res0 = ex === 'ut1' ? classResults(sec, 1) : classResults(sec, 2);
  const res = subjOnly ? res0.map((r) => { const m = r.marks[si]; const pct = Math.round((num(m) / 25) * 1000) / 10; return { ...r, m, pct, grade: gradeOf(pct), fails: typeof m === 'number' && m < 8.25 ? [w.mySubject] : [], absent: m === 'AB' ? [w.mySubject] : [] }; }) : res0;
  const shown = res.filter((r) => !q.trim() || r.s.name.toLowerCase().includes(q.trim().toLowerCase()) || String(r.s.roll) === q.trim());
  const groupSecs = classNo(sec) >= 9 ? ALL_SECS.filter((s) => classNo(s) >= 9) : [sec];
  const groupN = groupSecs.reduce((a, s) => a + SEC[s].n, 0);
  const canPublish = w.full && w.canEdit;
  const pass = res.filter((r) => !r.fails.length && !r.absent.length).length;
  const top = [...res].sort((a, b) => b.pct - a.pct)[0];
  const sub = w.teacher ? `${w.mySubject} results of your classes: ${secs.join(', ')}. Only the Principal publishes results.` : w.ct ? `All subjects for 7 B, your class; ${w.mySubject} only for ${secs.filter((x) => x !== '7 B').join(', ')}. Only the Principal publishes results.` : 'Worked out as marks come in · publishing needs the Principal’s approval';
  const examOpts = [{ value: 'ut2', label: 'Unit Test 2' }, { value: 'ut1', label: 'Unit Test 1' }, { value: 'hy', label: 'Half Yearly' }, ...(subjOnly ? [] : [{ value: 'final', label: 'Final result (year)' }])];

  return (
    <div>
      <ModuleHead sub={sub} actions={canPublish && <Button variant="secondary" icon={I.Printer} onClick={() => toast({ title: `Result sheet for ${sec} sent to the office printer` })}>Print result sheet</Button>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Card>
          <Toolbar>
            <Select id="rs-exam" value={ex} onChange={setExam} className="@md:w-56" options={examOpts} />
            <Select id="rs-sec" value={sec} onChange={setSec} className="@md:w-40" options={secOptions(secs)} />
            <SearchBox id="rs-search" value={q} onChange={setQ} placeholder="Student name or roll" />
            <ExportButton what="result sheet" />
          </Toolbar>
          <div className="p-3 flex flex-col gap-3">
            {st.st === 'Published' && <Banner tone="ok" title={`Published ${st.when} by ${st.by}.`} action={canPublish && <MoreMenu size="sm" items={[['EyeOff', 'Unpublish', () => setUnpub(true)], ['Send', 'Resend to parents who have not seen it', () => toast({ title: 'Sent again to 4 parents', body: 'Only parents who have not opened the report card' })]]} />}>Report cards are on Parent Link and parents were told on WhatsApp. Kept in the result history.</Banner>}
            {st.st === 'Waiting for approval' && (
              <Banner tone="info" title={`Ready. Sent for the Principal’s approval on ${st.when} by ${st.by}.`}
                action={w.principal ? <Button size="sm" variant="primary" icon={I.Check} onClick={() => setPublish(true)}>Review and publish</Button> : canPublish ? <Pill tone="info">Waiting for Lakshmi Rao</Pill> : null}>
                Classes 9–10 · {groupN} students · to publish on {st.on}.
              </Banner>
            )}
            {ex === 'hy' && <Banner tone="warn" title={subjOnly ? `Draft. ${w.mySubject} marks are not all in for ${sec}.` : `Draft. 6 subjects have missing marks in ${sec}.`}>The papers run from Mon 12 Oct to Tue 27 Oct. A draft with missing marks cannot be published. Planned result date: {st.on}.</Banner>}
            {ex === 'final' && <Banner tone="info" title="Final result for the year.">Combines all exams with the weights in Exam Settings: Unit Test 1 10%, Unit Test 2 10%, Half Yearly 30%, Annual 50%. It is final after the Annual exam in March 2027.</Banner>}
          </div>
        </Card>

        {ex === 'hy' ? <HyMissing sec={sec} only={subjOnly ? w.mySubject : null} /> : ex === 'final' ? <FinalResult sec={sec} q={q} /> : subjOnly ? (
          <>
            <Stats items={[
              { label: `${w.mySubject} average`, value: pctTxt(avg(res.map((r) => r.pct))), icon: 'Calculator' },
              { label: 'Passed', value: `${pass} of ${res.length}`, sub: '33% or more', tone: pass === res.length ? 'ok' : undefined, icon: 'CircleCheck' },
              { label: 'Highest', value: pctTxt(top.pct), sub: top.s.name, tone: 'ok', icon: 'Trophy' },
              { label: 'Below 33%', value: res.filter((r) => r.fails.length).length, sub: `${res.filter((r) => r.absent.length).length} absent`, tone: res.some((r) => r.fails.length) ? 'warn' : undefined, icon: 'TriangleAlert' },
            ]} />
            <Card className="overflow-hidden">
              <CardHead title={`${ex === 'ut1' ? 'Unit Test 1' : 'Unit Test 2'} · ${w.mySubject} · Class ${sec}`} sub="Out of 25 · only your subject is shown" icon={I.Table} action={<Pill tone={RS_TONE[st.st]} dot>{st.st}</Pill>} />
              <DataList bp="md" minWidth={560} rows={shown} rowKey={(r) => r.s.id} onRow={(r) => setOne(r)} footer={`Showing ${shown.length} of ${res.length} · AB = absent, counted as zero`}
                columns={[
                  { key: 'n', label: 'Student', render: (r) => <span className="whitespace-nowrap"><span className="text-ink3 tnum inline-block w-6">{r.s.roll}</span><span className="font-medium">{r.s.name}</span></span> },
                  { key: 'm', label: `${SHORT[w.mySubject]} / 25`, align: 'right', render: (r) => <span className={cx('tnum', r.m === 'AB' ? 'text-info font-semibold' : num(r.m) < 8.25 ? 'text-bad font-semibold' : '')}>{r.m}</span> },
                  { key: 'p', label: '%', align: 'right', render: (r) => pctTxt(r.pct) },
                  { key: 'g', label: 'Grade', render: (r) => <Pill tone={gradeTone(r.grade)} className="!h-5 !text-[11px]">{r.grade}</Pill> },
                  { key: 'r', label: 'Result', render: (r) => (r.absent.length ? <span className="text-warn font-semibold text-[13px]">Absent</span> : r.fails.length ? <span className="text-bad font-semibold text-[13px]">Below 33%</span> : <span className="text-ok font-semibold text-[13px]">Pass</span>) },
                ]}
                mobile={(r) => ({ avatar: r.s.name, title: `${r.s.roll}. ${r.s.name}`, sub: `${w.mySubject} · ${pctTxt(r.pct)}`, right: <b className="font-semibold tnum">{r.m}/25</b>, pills: [<Pill key="g" tone={gradeTone(r.grade)} className="!h-[22px] !text-[11.5px]">{r.grade}</Pill>] })} />
            </Card>
          </>
        ) : (
          <>
            <Stats items={[
              { label: 'Class average', value: pctTxt(avg(res.map((r) => r.pct))), icon: 'Calculator' },
              { label: 'Passed', value: `${pass} of ${res.length}`, sub: '33% in every subject', tone: pass === res.length ? 'ok' : undefined, icon: 'CircleCheck' },
              { label: 'Highest', value: pctTxt(top.pct), sub: top.s.name, tone: 'ok', icon: 'Trophy' },
              { label: 'Below 33% in a subject', value: res.filter((r) => r.fails.length).length, sub: `${res.filter((r) => r.absent.length).length} absent for a paper`, tone: res.some((r) => r.fails.length) ? 'warn' : undefined, icon: 'TriangleAlert' },
            ]} />
            <Card className="overflow-hidden">
              <CardHead title={`${exam === 'ut1' ? 'Unit Test 1' : 'Unit Test 2'} · Class ${sec}`} sub="Each subject out of 25 · total out of 150 · same rank for a tie, next rank skipped" icon={I.Table}
                action={<Pill tone={RS_TONE[st.st]} dot>{st.st}</Pill>} />
              <div className="overflow-x-auto scroll-thin border-t border-line">
                <table className="text-[13.5px] min-w-full">
                  <thead>
                    <tr className="border-b border-line text-ink3 text-[12px]">
                      <th className="sticky left-0 z-10 bg-surface text-left font-semibold px-4 py-2.5 min-w-[180px]">Student</th>
                      {SUBJECTS6.map((s) => <th key={s} className="font-semibold px-2 py-2.5 text-center" title={s}>{SHORT[s]}</th>)}
                      <th className="font-semibold px-3 py-2.5 text-right">Total</th><th className="font-semibold px-3 py-2.5 text-right">%</th>
                      <th className="font-semibold px-3 py-2.5 text-center">Grade</th><th className="font-semibold px-3 py-2.5 text-center">Rank</th><th className="font-semibold px-4 py-2.5">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr key={r.s.id} onClick={() => setOne(r)} className="border-b border-line/60 last:border-0 cursor-pointer hover:bg-sunken/60 group">
                        <td className="sticky left-0 z-10 bg-surface group-hover:bg-sunken px-4 py-2 whitespace-nowrap"><span className="text-ink3 tnum inline-block w-6">{r.s.roll}</span><span className="font-medium">{r.s.name}</span></td>
                        {r.marks.map((m, i) => <td key={i} className={cx('px-2 py-2 text-center tnum', m === 'AB' ? 'text-info font-semibold' : num(m) < 8.25 ? 'text-bad font-semibold' : '')}>{m}</td>)}
                        <td className="px-3 text-right font-semibold tnum">{r.total}</td>
                        <td className="px-3 text-right tnum">{pctTxt(r.pct)}</td>
                        <td className="px-3 text-center"><Pill tone={gradeTone(r.grade)} className="!h-5 !text-[11px]">{r.grade}</Pill></td>
                        <td className="px-3 text-center tnum">{r.rank}</td>
                        <td className="px-4 whitespace-nowrap">{r.fails.length ? <span className="text-bad font-semibold text-[13px]">Fail · {r.fails.map((f) => SHORT[f]).join(', ')}</span> : r.absent.length ? <span className="text-warn font-semibold text-[13px]">Absent · {r.absent.map((f) => SHORT[f]).join(', ')}</span> : <span className="text-ok font-semibold text-[13px]">Pass</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 border-t border-line text-[13px] text-ink3 tnum flex flex-wrap gap-x-4">Showing {shown.length} of {res.length}<span>AB = absent, counted as zero</span></div>
            </Card>
          </>
        )}
      </div>

      <Sheet open={!!one} onClose={() => setOne(null)} title={one ? one.s.name : ''} sub={one ? `Class ${sec} · roll ${one.s.roll} · ${ex === 'ut1' ? 'Unit Test 1' : 'Unit Test 2'}${subjOnly ? ` · ${w.mySubject}` : ''}` : ''}
        footer={one && <>{one.s.real && <Button variant="ghost" icon={I.User} onClick={() => go('student', { id: one.s.id })}>Open profile</Button>}<Button variant="secondary" icon={I.Printer} onClick={() => toast({ title: `Result for ${one.s.name} sent to the printer` })}>Print</Button></>}>
        {one && (
          <div className="flex flex-col gap-4">
            {!subjOnly && <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-sunken/70 py-2.5"><p className="text-[12px] text-ink3 font-semibold">Total</p><p className="font-display text-[20px] font-semibold tnum">{one.total}/150</p></div>
              <div className="rounded-xl bg-sunken/70 py-2.5"><p className="text-[12px] text-ink3 font-semibold">Percent</p><p className="font-display text-[20px] font-semibold tnum">{pctTxt(one.pct)}</p></div>
              <div className="rounded-xl bg-sunken/70 py-2.5"><p className="text-[12px] text-ink3 font-semibold">Grade · rank</p><p className="font-display text-[20px] font-semibold tnum">{one.grade} · {one.rank}</p></div>
            </div>}
            <HBars rows={SUBJECTS6.map((s, i) => ({ k: s, v: num(one.marks[i]), label: one.marks[i] === 'AB' ? 'AB' : `${one.marks[i]}/25` })).filter((r) => !subjOnly || r.k === w.mySubject)} max={25} lowBelow={8.25} labelWidth={104} />
          </div>
        )}
      </Sheet>
      <PublishSheet open={publish} onClose={() => setPublish(false)} n={groupN} secs={groupSecs}
        onDone={(when) => { setStatusOver((x) => ({ ...x, ...Object.fromEntries(groupSecs.map((s) => ['ut2' + s, when === 'now' ? { st: 'Published', when: '9 Oct 2026', by: 'Lakshmi Rao' } : { st: 'Waiting for approval', when: 'today', by: 'Lakshmi Rao', on: when }])) })); }} />
      <UnpublishSheet open={unpub} onClose={() => setUnpub(false)} sec={sec} onDone={() => setStatusOver((x) => ({ ...x, [exam + sec]: { st: 'Draft', on: 'not set' } }))} />
    </div>
  );
}

function HyMissing({ sec, only }) {
  const { go } = useNav();
  const sched = scheduleFor(sec).filter((x) => !only || x.sub === only);
  return (
    <Card>
      <CardHead title={`Missing marks · Class ${sec}`} sub="Results stay in draft until every mark is in" icon={I.ListTodo} />
      <ul className="px-2 pb-2">
        {sched.map((x) => {
          const p = paperOf(`hy|${sec}|${x.sub}`);
          const second = p.comps[1];
          return (
            <li key={x.sub}>
              <button onClick={() => go('exams', { page: 'marks', id: p.id })} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-sunken/70 text-left">
                <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-warn/12 text-warn"><I.FileClock size={19} /></span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[14.5px]">{x.sub} <span className="text-ink3 font-normal">· {x.day}</span></p>
                  <p className="text-[12.5px] text-ink3 truncate">Theory not entered · {second.label}: {p.locked ? 'locked' : `${p.done} of ${p.n} entered`} · {p.teacher}</p>
                </div>
                <Pill tone={p.locked ? 'ok' : p.done ? 'warn' : 'neutral'} className="hidden @sm:inline-flex">{second.label} {p.locked ? 'locked' : p.done ? 'in progress' : 'not started'}</Pill>
                <I.ChevronRight size={18} className="text-ink3" />
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function FinalResult({ sec, q }) {
  const r1 = classResults(sec, 1), r2 = classResults(sec, 2);
  const rows = r1.map((a, i) => ({ s: a.s, u1: a.pct, u2: r2[i].pct, sofar: Math.round(((a.pct * 10 + r2[i].pct * 10) / 20) * 10) / 10 }))
    .filter((r) => !q.trim() || r.s.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Card className="overflow-hidden">
      <CardHead title={`Final result so far · Class ${sec}`} sub="Weighted from the exams held. Half Yearly and Annual are added when published." icon={I.Sigma} />
      <DataList bp="md" minWidth={680} rows={rows} rowKey={(r) => r.s.id} footer={`Showing ${rows.length} students · weights from Exam Settings`}
        columns={[
          { key: 'n', label: 'Student', render: (r) => <span><span className="text-ink3 tnum inline-block w-6">{r.s.roll}</span><span className="font-medium">{r.s.name}</span></span> },
          { key: 'u1', label: 'UT 1 · 10%', align: 'right', render: (r) => pctTxt(r.u1) },
          { key: 'u2', label: 'UT 2 · 10%', align: 'right', render: (r) => pctTxt(r.u2) },
          { key: 'hy', label: 'Half Yearly · 30%', align: 'right', render: () => <span className="text-ink3">After 27 Oct</span> },
          { key: 'an', label: 'Annual · 50%', align: 'right', render: () => <span className="text-ink3">March 2027</span> },
          { key: 'sf', label: 'So far', align: 'right', render: (r) => <span className="font-semibold">{pctTxt(r.sofar)} · {gradeOf(r.sofar)}</span> },
        ]}
        mobile={(r) => ({ avatar: r.s.name, title: `${r.s.roll}. ${r.s.name}`, sub: `UT1 ${pctTxt(r.u1)} · UT2 ${pctTxt(r.u2)}`, right: <span className="font-semibold tnum text-[14px]">{pctTxt(r.sofar)}<span className="block text-[11.5px] text-ink3 font-normal">so far</span></span> })} />
    </Card>
  );
}

function PublishSheet({ open, onClose, n, secs, onDone }) {
  const toast = useToast();
  const [when, setWhen] = useState('later');
  const [date, setDate] = useState('10-10-2026');
  const [time, setTime] = useState('9:00 AM');
  const [msg, setMsg] = useState(true);
  const [sure, setSure] = useState(false);
  return (
    <>
      <Sheet open={open && !sure} onClose={onClose} title="Publish Unit Test 2 results" sub={`Classes ${secs[0]}–${secs[secs.length - 1]} · ${n} students · all marks are in`}
        footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={I.Send} onClick={() => setSure(true)}>{when === 'now' ? 'Publish now' : 'Set publish date'}</Button></>}>
        <div className="flex flex-col gap-4">
          <Field label="Exam and classes" id="pb-ex"><Input id="pb-ex" value={`Unit Test 2 · ${secs.join(', ')}`} readOnly className="bg-sunken/50" /></Field>
          <Field label="Publish on" required id="pb-when"><Segmented value={when} onChange={setWhen} options={[{ value: 'now', label: 'Now' }, { value: 'later', label: 'Date and time' }]} className="w-full" /></Field>
          {when === 'later' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date" id="pb-date" hint="DD-MM-YYYY"><Input id="pb-date" value={date} onChange={(e) => setDate(e.target.value)} className="tnum" /></Field>
              <Field label="Time" id="pb-time"><Select id="pb-time" value={time} onChange={setTime} options={TIMES} /></Field>
            </div>
          )}
          <div className="rounded-xl border border-line px-3.5 py-3 flex items-center gap-3">
            <Switch id="pb-msg" on={msg} onChange={setMsg} label="Message parents" />
            <label htmlFor="pb-msg" className="text-[13.5px]"><b className="font-semibold block">Message parents</b><span className="text-ink3 text-[12.5px]">Uses the “Result published” template on WhatsApp, with SMS backup</span></label>
          </div>
        </div>
      </Sheet>
      <ConfirmSheet open={open && sure} onClose={() => { setSure(false); onClose(); }} title={when === 'now' ? `Publish results for ${n} students now?` : `Publish on ${date} at ${time}?`}
        confirmLabel={when === 'now' ? `Publish and tell ${n} parents` : 'Set the publish date'}
        onConfirm={() => { onDone(when === 'now' ? 'now' : `${date}, ${time}`); setSure(false); toast(when === 'now' ? { title: `Unit Test 2 results published · ${n} students`, body: msg ? `Report cards are on Parent Link. ${n} parents get a WhatsApp message.` : 'Report cards are on Parent Link.' } : { title: `Results will publish on ${date} at ${time}`, body: 'They publish by themselves then. You can change the date until then.' }); }}>
        <ul className="flex flex-col gap-2 text-[14px] text-ink2">
          <li className="flex gap-2"><I.Award size={17} className="text-brand shrink-0 mt-0.5" />{n} report cards become ready and appear on each guardian’s Parent Link.</li>
          {msg && <li className="flex gap-2"><I.Send size={17} className="text-brand shrink-0 mt-0.5" />{n} parents get one WhatsApp message. Cost: {n} credits. A message cannot be unsent.</li>}
          <li className="flex gap-2"><I.History size={17} className="text-brand shrink-0 mt-0.5" />The result is kept in the result history. Changing the grade scale later will not change it.</li>
        </ul>
      </ConfirmSheet>
    </>
  );
}

function UnpublishSheet({ open, onClose, sec, onDone }) {
  const toast = useToast();
  const [why, setWhy] = useState('');
  return (
    <FormSheet open={open} onClose={onClose} title={`Unpublish results for ${sec}?`} sub="Report cards come off Parent Link until you publish again. Parents are not messaged again." submitLabel="Unpublish"
      onSubmit={() => { if (why.trim().length < 8) return false; onDone(); toast({ title: `Results for ${sec} unpublished`, body: 'Report cards are off Parent Link. Logged with your reason.' }); setWhy(''); }}>
      <Field label="Reason" required id="up-why" error={why && why.trim().length < 8 ? 'Write a little more so the history makes sense.' : ''} hint="Kept in the result history"><Textarea id="up-why" value={why} onChange={setWhy} placeholder="For example: Science marks of 3 students are being corrected" /></Field>
    </FormSheet>
  );
}

/* =====================================================================
   5. Report Cards
   ===================================================================== */
const DONE_REMARKS = {
  1: 'Aadhya is sincere and neat in her work. She should read more English story books to build vocabulary.',
  2: 'Aadhya takes part in class with interest. More practice in Hindi grammar will help her.',
  3: 'Aarav C. is cheerful and helpful. He must revise Science diagrams regularly.',
  4: 'Aarav is a confident learner with full marks in Mathematics in Unit Test 2. He should give more time to Social Studies maps.',
  5: 'Abhiram is improving steadily. Regular reading at home will help his Telugu.',
  6: 'Abhiram needs to attend school regularly. He is good at practical work in Science.',
  7: 'Aditya is curious and asks good questions. He should complete homework on time.',
  8: 'Arjun works well in groups. More care in calculations will lift his Mathematics.',
  9: 'Charan is polite and attentive. He should practise writing answers in full sentences.',
  10: 'Charan is a keen sportsperson. Daily revision will help him in Social Studies.',
  11: 'Diya writes beautifully and expresses ideas clearly. She should practise Mathematics word problems.',
  12: 'Ira is hardworking and consistent. She can aim higher in Hindi with more reading.',
};
function draftRemark(s, sec) {
  const r1 = classResults(sec, 1).find((r) => r.s.id === s.id), r2 = classResults(sec, 2).find((r) => r.s.id === s.id);
  const best = SUBJECTS6[r2.marks.map(num).indexOf(Math.max(...r2.marks.map(num)))];
  const low = SUBJECTS6[r2.marks.map(num).indexOf(Math.min(...r2.marks.map(num)))];
  const first = s.name.split(' ')[0];
  const trend = r2.pct >= r1.pct ? `improved from ${pctTxt(r1.pct)} to ${pctTxt(r2.pct)}` : `went down from ${pctTxt(r1.pct)} to ${pctTxt(r2.pct)}`;
  return `${first} does well in ${best} and ${trend} between the unit tests. ${first} should spend more time on ${low}.${s.att < 85 ? ` Attendance is ${s.att}%; coming to school every day will help.` : ''}`;
}
const CO_SCHOL = [['Work education', 'A'], ['Art education', 'A'], ['Health and physical education', 'B'], ['Discipline', 'A']];

function ReportCardsPage({ access }) {
  const w = useWho(access);
  const toast = useToast();
  const secs = w.ct ? ['7 B'] : ALL_SECS;
  const [sec, setSec] = useState('7 B');
  const [term, setTerm] = useState('t1');
  const [q, setQ] = useState('');
  const [remarks, setRemarks] = useState(() => Object.fromEntries(CLASS_7B.map((s) => [s.id, DONE_REMARKS[s.roll] || ''])));
  const [prRemarks, setPr] = useState(() => ({ [FEATURED.id]: 'Keep up the good work, Aarav. Aim for the Maths Olympiad this year.' }));
  const [drafts, setDrafts] = useState(null);
  const [edit, setEdit] = useState(null);
  const [preview, setPreview] = useState(null);
  const [print, setPrint] = useState(null);
  const [send, setSend] = useState(false);
  const list = roster(sec);
  const remarkOf = (s) => (remarks[s.id] !== undefined ? remarks[s.id] : hash(s.name) % 3 ? 'Works sincerely and takes part in class activities.' : '');
  const written = list.filter((s) => remarkOf(s)).length;
  const rows = list.filter((s) => !q.trim() || s.name.toLowerCase().includes(q.trim().toLowerCase()));
  const startDrafts = () => setDrafts(list.filter((s) => !remarkOf(s)).map((s) => ({ s, text: draftRemark(s, sec) })));
  const sent = term === 'ut2';
  const notSeen = list.filter((s) => hash(s.name + 'seen') % 9 === 0);

  return (
    <div>
      <ModuleHead sub={w.ct ? 'Class 7 B · you are the class teacher · remarks due Tue 20 Oct' : 'CBSE format for Classes 6–10 · remarks, co-scholastic grades and printing'}
        actions={<>
          {!w.ct && <Button variant="secondary" icon={I.Printer} onClick={() => setPrint({ n: HY_STUDENTS, label: 'Classes 6–10' })}>Print all classes</Button>}
          {w.canEdit && !sent && <Button variant="primary" icon={I.Sparkles} onClick={startDrafts}>Draft remarks</Button>}
        </>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Card className="overflow-hidden">
          <Toolbar>
            <Select id="rc-term" value={term} onChange={setTerm} className="@md:w-72" options={[{ value: 't1', label: 'Term 1 report card' }, { value: 'ut2', label: 'Unit Test 2 progress report' }]} />
            {secs.length > 1 && <Select id="rc-sec" value={sec} onChange={setSec} className="@md:w-36" options={secOptions(secs)} />}
            <SearchBox id="rc-search" value={q} onChange={setQ} placeholder="Student name" />
          </Toolbar>
          <div className="p-3">
            {sent ? <Banner tone="ok" title="Sent 28 Sep through Parent Link.">{list.length - notSeen.length} of {list.length} parents have opened it.</Banner>
              : <Banner tone="info" title="Not ready yet.">Report cards are ready when the Half Yearly marks are in. Remarks and co-scholastic grades can be written now. Planned result date: Sat 7 Nov.</Banner>}
          </div>
        </Card>

        {!sent && <Stats items={[
          { label: 'Class teacher remarks', value: `${written} of ${list.length}`, sub: 'Due Tue 20 Oct', tone: written === list.length ? 'ok' : 'warn', icon: 'MessageSquareText' },
          { label: 'Principal remarks', value: `${list.filter((s) => prRemarks[s.id]).length} of ${list.length}`, sub: 'Optional per student', icon: 'PenLine' },
          { label: 'Co-scholastic grades', value: `${list.length} of ${list.length}`, sub: 'From Events & Calendar', tone: 'ok', icon: 'Palette' },
          { label: 'Half Yearly marks', value: '0 of 6', sub: 'Subjects locked', tone: 'warn', icon: 'ClipboardCheck' },
        ]} />}

        {drafts && (
          <Suggestion title={`Draft remarks for ${drafts.length} students`} source={`Unit Test 1 and 2 marks and attendance (Jun–Oct) of Class ${sec}. Nothing is saved until you accept a remark.`}
            actions={<Button size="sm" variant="ghost" onClick={() => setDrafts(null)}>Close drafts</Button>}>
            {drafts.length === 0 ? <p>All drafts are done. Every student has a remark.</p> : (
              <ul className="flex flex-col gap-2.5 mt-1">
                {drafts.slice(0, 4).map((d) => (
                  <li key={d.s.id} className="rounded-xl bg-surface border border-line p-3">
                    <p className="font-semibold text-ink text-[14px]">{d.s.roll}. {d.s.name}</p>
                    <p className="text-[13.5px] mt-0.5">{d.text}</p>
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" variant="soft" icon={I.Check} onClick={() => { setRemarks((x) => ({ ...x, [d.s.id]: d.text })); setDrafts((x) => x.filter((y) => y.s.id !== d.s.id)); toast({ title: `Remark saved for ${d.s.name}`, undo: () => setRemarks((x) => ({ ...x, [d.s.id]: '' })) }); }}>Accept</Button>
                      <Button size="sm" variant="ghost" icon={I.Pencil} onClick={() => setEdit({ s: d.s, text: d.text, fromDraft: true })}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => setDrafts((x) => x.filter((y) => y.s.id !== d.s.id))}>Discard</Button>
                    </div>
                  </li>
                ))}
                {drafts.length > 4 && <li className="text-[13px] text-ink3">{drafts.length - 4} more drafts follow as you accept or discard these.</li>}
              </ul>
            )}
          </Suggestion>
        )}

        <Card className="overflow-hidden">
          <CardHead title={sent ? `Unit Test 2 progress report · ${sec}` : `Term 1 report cards · ${sec}`} sub={`${list.length} students · class teacher ${SEC[sec].ct}`} icon={I.Award}
            action={<div className="flex gap-2">
              {sent ? <Button size="sm" variant="secondary" icon={I.Send} onClick={() => setSend(true)}>Resend to {notSeen.length}</Button>
                : <Button size="sm" variant="secondary" icon={I.Printer} onClick={() => setPrint({ n: list.length, label: `Class ${sec}` })}>Print {list.length}</Button>}
            </div>} />
          <DataList bp="lg" minWidth={820} rows={rows} footer={`Showing ${rows.length} of ${list.length}`}
            columns={[
              { key: 'n', label: 'Student', render: (s) => <span className="whitespace-nowrap"><span className="text-ink3 tnum inline-block w-6">{s.roll}</span><span className="font-semibold">{s.name}</span></span> },
              { key: 'r', label: 'Class teacher remark', className: 'max-w-[340px]', render: (s) => remarkOf(s) ? <p className="text-[13px] text-ink2 line-clamp-2">{remarkOf(s)}</p> : <span className="text-[13px] text-warn font-semibold">Not written</span> },
              { key: 'p', label: 'Principal remark', render: (s) => (prRemarks[s.id] ? <Pill tone="ok" dot>Written</Pill> : <span className="text-[13px] text-ink3">None</span>) },
              { key: 'st', label: 'Status', render: (s) => sent ? (notSeen.includes(s) ? <Pill tone="warn">Sent · not seen</Pill> : <Pill tone="ok">Sent · seen</Pill>) : <Pill tone="neutral">Not ready</Pill> },
              { key: 'a', label: '', align: 'right', render: (s) => (
                <div className="flex justify-end gap-1">
                  {!sent && w.canEdit && (w.ct || w.full) && <Button size="sm" variant="ghost" icon={I.Pencil} onClick={() => setEdit({ s, text: remarkOf(s) })}>{remarkOf(s) ? 'Edit' : 'Write'}</Button>}
                  <Button size="sm" variant="ghost" icon={I.Eye} onClick={() => setPreview(s)}>Preview</Button>
                </div>
              ) },
            ]}
            mobile={(s) => ({ avatar: s.name, title: `${s.roll}. ${s.name}`, sub: remarkOf(s) || 'Remark not written',
              right: <div className="flex flex-col gap-1">{!sent && w.canEdit && <Button size="sm" variant="ghost" onClick={() => setEdit({ s, text: remarkOf(s) })}>{remarkOf(s) ? 'Edit' : 'Write'}</Button>}<Button size="sm" variant="ghost" onClick={() => setPreview(s)}>View</Button></div> })} />
        </Card>
      </div>

      <RemarkSheet edit={edit} sec={sec} principal={w.principal} pr={edit ? prRemarks[edit.s.id] || '' : ''} onClose={() => setEdit(null)}
        onSave={(s, text, prText) => { setRemarks((x) => ({ ...x, [s.id]: text })); if (w.principal) setPr((x) => ({ ...x, [s.id]: prText })); if (edit.fromDraft) setDrafts((x) => x && x.filter((y) => y.s.id !== s.id)); toast({ title: `Remark saved for ${s.name}` }); }} />
      <Sheet open={!!preview} onClose={() => setPreview(null)} wide title={preview ? `Report card · ${preview.name}` : ''} sub={sent ? 'Unit Test 2 progress report' : 'Term 1 · preview with the marks so far'}
        footer={<><Button variant="ghost" onClick={() => setPreview(null)}>Close</Button><Button variant="secondary" icon={I.Download} onClick={() => toast({ title: `Saved: Report-card-${preview.name.replace(' ', '-')}.pdf` })}>PDF</Button></>}>
        {preview && <ReportCardDoc s={preview} sec={sec} remark={remarkOf(preview)} pr={prRemarks[preview.id]} sent={sent} />}
      </Sheet>
      <ConfirmSheet open={!!print} onClose={() => setPrint(null)} title={print ? `Print ${print.n} report cards?` : ''} confirmLabel={print ? `Print ${print.n} report cards` : ''}
        onConfirm={() => toast({ title: `${print.n} report cards sent to the office printer`, body: `${Math.ceil(print.n / 50)} ${Math.ceil(print.n / 50) === 1 ? 'batch' : 'batches'} of up to 50 · ${print.label}` })}>
        {print && <div className="flex flex-col gap-3 text-[14px] text-ink2"><p>{print.label}. They print by class, in <b className="text-ink">{Math.ceil(print.n / 50)} {Math.ceil(print.n / 50) === 1 ? 'batch' : 'batches'} of up to 50</b>, in roll order.</p>{!sent && <Banner tone="warn">Half Yearly marks are not in yet, so these print as a preview marked “Not final”. {list.length - written} students in {sec} still have no remark.</Banner>}</div>}
      </ConfirmSheet>
      <ConfirmSheet open={send} onClose={() => setSend(false)} title={`Resend to ${notSeen.length} parents?`} confirmLabel={`Send to ${notSeen.length} parents`}
        onConfirm={() => toast({ title: `Sent again to ${notSeen.length} parents`, body: 'WhatsApp, with SMS backup. Cost: ' + notSeen.length + ' credits.' })}>
        <p className="text-[14px] text-ink2">Only parents who have not opened the Unit Test 2 report card on Parent Link: {notSeen.map((s) => s.name).join(', ')}. A message cannot be unsent.</p>
      </ConfirmSheet>
    </div>
  );
}

function RemarkSheet({ edit, sec, principal, pr, onClose, onSave }) {
  const [text, setText] = useState('');
  const [prText, setPrText] = useState('');
  const [key, setKey] = useState(null);
  if (edit && key !== edit.s.id + (edit.fromDraft ? 'd' : '')) { setKey(edit.s.id + (edit.fromDraft ? 'd' : '')); setText(edit.text || ''); setPrText(pr); }
  if (!edit) return null;
  const s = edit.s;
  const sug = draftRemark(s, sec);
  const tooLong = text.length > 300;
  return (
    <Sheet open={!!edit} onClose={() => { setKey(null); onClose(); }} title={`Remark for ${s.name}`} sub={`Roll ${s.roll} · attendance ${s.att}%`}
      footer={<><Button variant="ghost" onClick={() => { setKey(null); onClose(); }}>Cancel</Button><Button variant="primary" icon={I.Check} disabled={!text.trim() || tooLong} onClick={() => { onSave(s, text.trim(), prText.trim()); setKey(null); onClose(); }}>Save remark</Button></>}>
      <div className="flex flex-col gap-4">
        <Field label="Class teacher remark" required id="rm-text" error={tooLong ? `Keep it under 300 letters. It is ${text.length} now.` : ''} hint={`${text.length} of 300 letters · printed on the report card`}>
          <Textarea id="rm-text" value={text} onChange={setText} rows={4} placeholder="Strengths first, then one thing to work on" />
        </Field>
        {sug && !edit.fromDraft && (
          <div className="rounded-2xl border border-brand/25 bg-brand/[.03] p-3.5">
            <p className="flex items-center gap-2 text-[13.5px] font-semibold"><I.Sparkles size={15} className="text-brand" />Suggestion<Pill tone="brand" className="!h-5 !text-[11px] ml-auto">Suggestion</Pill></p>
            <p className="text-[13.5px] text-ink2 mt-1.5">{sug}</p>
            <p className="text-[12px] text-ink3 mt-1.5">Based on: Unit Test 1 and 2 marks, attendance</p>
            <Button size="sm" variant="soft" className="mt-2" onClick={() => setText(sug)}>Use and edit</Button>
          </div>
        )}
        {principal && <Field label="Principal remark" id="rm-pr" hint="Optional"><Textarea id="rm-pr" value={prText} onChange={setPrText} rows={2} /></Field>}
      </div>
    </Sheet>
  );
}

function ReportCardDoc({ s, sec, remark, pr, sent }) {
  const r1 = classResults(sec, 1).find((r) => r.s.id === s.id), r2 = classResults(sec, 2).find((r) => r.s.id === s.id);
  const pt = (i) => Math.round(((num(r1.marks[i]) + num(r2.marks[i])) / 50) * 10);
  return (
    <div className="rounded-2xl border border-line overflow-hidden text-[13px]">
      <div className="flex items-center gap-3 px-4 py-3.5 bg-sunken/40 border-b border-line">
        <Logo size={38} />
        <div className="min-w-0 flex-1"><p className="font-display font-semibold text-[15px] leading-tight">Sunrise Public School</p><p className="text-[11.5px] text-ink3">Affiliated to CBSE · Kukatpally, Hyderabad · SPS-HYD-001</p></div>
        <p className="eyebrow text-brand text-right">{sent ? 'Progress report' : 'Report card'}<span className="block text-ink3 normal-case tracking-normal text-[11.5px] font-medium">2026–27 · Term 1</span></p>
      </div>
      <div className="px-4 py-3 grid grid-cols-2 @md:grid-cols-4 gap-x-4 gap-y-2 border-b border-line">
        {[['Student', s.name], ['Class', `${sec} · roll ${s.roll}`], ['Admission no.', s.adm], ['Attendance', `${Math.round((s.att / 100) * 104)} of 104 days`], ["Father's name", fatherOf(s)], ["Mother's name", motherOf(s)], ['Date of birth', s.id === FEATURED.id ? PROFILE.dob : `${1 + (hash(s.name) % 28)} ${['January', 'March', 'May', 'August', 'November'][hash(s.adm) % 5]} ${2026 - classNo(sec) - 6}`], ['House', s.id === FEATURED.id ? PROFILE.house : 'Krishna House']].map(([k, v]) => (
          <div key={k} className="min-w-0"><p className="text-[11px] text-ink3 font-semibold">{k}</p><p className="font-semibold truncate">{v}</p></div>
        ))}
      </div>
      <p className="px-4 pt-3 eyebrow text-ink3">Part A · Scholastic areas</p>
      <div className="overflow-x-auto scroll-thin">
        <table className="w-full text-[12.5px] min-w-[560px]">
          <thead><tr className="text-[11px] text-ink3 text-left border-b border-line">
            {(sent ? ['Subject', 'UT 1 / 25', 'UT 2 / 25', 'Grade'] : ['Subject', 'Periodic test / 10', 'Notebook / 5', 'Enrichment / 5', 'Half Yearly / 80', 'Total / 100', 'Grade']).map((h) => <th key={h} className="font-semibold px-3 py-2 first:pl-4 whitespace-nowrap">{h}</th>)}
          </tr></thead>
          <tbody>
            {SUBJECTS6.map((sub, i) => (
              <tr key={sub} className="border-b border-line/60 last:border-0">
                <td className="px-3 pl-4 py-1.5 font-semibold">{sub}</td>
                {sent ? <>
                  <td className="px-3 tnum">{r1.marks[i]}</td><td className="px-3 tnum">{r2.marks[i]}</td>
                  <td className="px-3"><Pill tone={gradeTone(gradeOf((num(r2.marks[i]) / 25) * 100))} className="!h-5 !text-[11px]">{gradeOf((num(r2.marks[i]) / 25) * 100)}</Pill></td>
                </> : <>
                  <td className="px-3 tnum">{pt(i)}</td><td className="px-3 tnum">{4 + (hash(s.name + sub) % 2)}</td><td className="px-3 tnum">{4 + (hash(sub + s.name) % 2)}</td>
                  <td className="px-3 text-ink3">Not entered</td><td className="px-3 text-ink3">—</td><td className="px-3 text-ink3">—</td>
                </>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid @md:grid-cols-2 border-t border-line">
        <div className="px-4 py-3 @md:border-r border-line">
          <p className="eyebrow text-ink3 mb-1.5">Part B · Co-scholastic areas</p>
          <ul className="flex flex-col gap-1">{CO_SCHOL.map(([k, g]) => <li key={k} className="flex justify-between gap-2"><span className="text-ink2">{k}</span><b className="font-semibold">{g}</b></li>)}</ul>
          <p className="text-[11px] text-ink3 mt-1.5">3-point scale: A outstanding, B very good, C fair</p>
        </div>
        <div className="px-4 py-3 border-t @md:border-t-0 border-line">
          <p className="eyebrow text-ink3 mb-1.5">Remarks</p>
          <p className="text-ink2"><b className="font-semibold text-ink">Class teacher: </b>{remark || <span className="text-warn">Not written yet</span>}</p>
          {pr && <p className="text-ink2 mt-1"><b className="font-semibold text-ink">Principal: </b>{pr}</p>}
          <p className="mt-2"><b className="font-semibold">Result: </b>{sent ? `${r2.total} of 150 · ${pctTxt(r2.pct)} · ${r2.grade}` : 'After the Half Yearly is published'}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 px-4 pt-7 pb-3 text-center text-[11px] text-ink3 border-t border-line">
        {['Class teacher', 'Parent', 'Principal'].map((x) => <span key={x} className="border-t border-line pt-1">{x}</span>)}
      </div>
    </div>
  );
}

/* =====================================================================
   6. Question Papers
   ===================================================================== */
const QBANK = [
  { id: 'Q101', q: 'Which of these is the additive inverse of −7?', type: 'MCQ', ch: 'Integers', diff: 'Easy', marks: 1, used: 'Unit Test 1' },
  { id: 'Q102', q: 'The temperature at 6 AM was −4 °C and rose by 9 °C by noon. What was the temperature at noon?', type: 'Short', ch: 'Integers', diff: 'Medium', marks: 2, used: '—' },
  { id: 'Q118', q: 'Arrange 2/3, 3/5 and 7/10 in ascending order. Show your working.', type: 'Short', ch: 'Fractions and Decimals', diff: 'Medium', marks: 3, used: 'Unit Test 2' },
  { id: 'Q124', q: 'A rope 12.6 m long is cut into pieces of 0.35 m each. How many pieces are there?', type: 'Long', ch: 'Fractions and Decimals', diff: 'Hard', marks: 5, used: '—' },
  { id: 'Q131', q: 'The mean of 5 numbers is 18. If one number is removed, the mean becomes 16. Find the removed number.', type: 'Short', ch: 'Data Handling', diff: 'Hard', marks: 3, used: '—' },
  { id: 'Q133', q: 'True or false: the mode of a data set is always one of the values in the data.', type: 'True or false', ch: 'Data Handling', diff: 'Easy', marks: 1, used: 'Unit Test 2' },
  { id: 'Q140', q: 'Solve: 3x + 7 = 25.', type: 'Fill in the blanks', ch: 'Simple Equations', diff: 'Easy', marks: 1, used: '—' },
  { id: 'Q142', q: 'Raju’s father is 4 years more than three times Raju’s age. If his father is 46, find Raju’s age.', type: 'Short', ch: 'Simple Equations', diff: 'Medium', marks: 3, used: '—' },
  { id: 'Q150', q: 'Match each angle pair with its name: complementary, supplementary, linear pair, vertically opposite.', type: 'Match', ch: 'Lines and Angles', diff: 'Medium', marks: 2, used: '—' },
  { id: 'Q156', q: 'In a triangle, two angles are 48° and 67°. Find the third angle and name the type of triangle.', type: 'Short', ch: 'The Triangle and its Properties', diff: 'Easy', marks: 2, used: 'Unit Test 2' },
  { id: 'Q159', q: 'A ladder 13 m long reaches a window 12 m high. How far is its foot from the wall?', type: 'Long', ch: 'The Triangle and its Properties', diff: 'Medium', marks: 5, used: '—' },
  { id: 'Q164', q: 'A shirt marked ₹840 is sold at a discount of 15%. Find the selling price.', type: 'Short', ch: 'Comparing Quantities', diff: 'Medium', marks: 3, used: '—' },
];
const QP = [
  { id: 'P1', title: 'Half Yearly · Mathematics · Class 7', exam: 'Half Yearly', sub: 'Mathematics', cls: 'Class 7', marks: 80, status: 'Final', locked: 'Wed 14 Oct, 7:30 AM', setter: 'Imran Shaikh' },
  { id: 'P2', title: 'Half Yearly · Science · Class 7', exam: 'Half Yearly', sub: 'Science', cls: 'Class 7', marks: 70, status: 'Final', locked: 'Thu 15 Oct, 7:30 AM', setter: 'Ravi Teja' },
  { id: 'P3', title: 'Half Yearly · English · Class 7', exam: 'Half Yearly', sub: 'English', cls: 'Class 7', marks: 80, status: 'Final', locked: 'Mon 12 Oct, 7:30 AM', setter: 'Sridevi Kulkarni' },
  { id: 'P4', title: 'Half Yearly · Mathematics · Class 6', exam: 'Half Yearly', sub: 'Mathematics', cls: 'Class 6', marks: 80, status: 'Draft', setter: 'Imran Shaikh' },
  { id: 'P5', title: 'Half Yearly · Social Studies · Class 8', exam: 'Half Yearly', sub: 'Social Studies', cls: 'Class 8', marks: 80, status: 'Draft', setter: 'Venkat Rao' },
  { id: 'P6', title: 'Unit Test 2 · Mathematics · Class 7', exam: 'Unit Test 2', sub: 'Mathematics', cls: 'Class 7', marks: 25, status: 'Used', setter: 'Imran Shaikh' },
];
const BLUEPRINT = [
  ['Integers', [3, 1, 1, 0, 1]], ['Fractions and Decimals', [3, 0, 2, 1, 0]], ['Data Handling', [3, 1, 0, 1, 0]], ['Simple Equations', [3, 1, 1, 0, 1]],
  ['Lines and Angles', [3, 1, 1, 0, 1]], ['The Triangle and its Properties', [2, 1, 1, 1, 0]], ['Comparing Quantities', [3, 0, 0, 1, 0]],
];
const BP_COLS = [['MCQ', 1], ['Short', 2], ['Short', 3], ['Long', 5], ['Case study', 4]];
const DIFF_TONE = { Easy: 'ok', Medium: 'info', Hard: 'warn' };

function PapersPage({ access }) {
  const w = useWho(access);
  const toast = useToast();
  const [tab, setTab] = useState('papers');
  const [q, setQ] = useState('');
  const [ch, setCh] = useState('all');
  const [diff, setDiff] = useState('all');
  const [bank, setBank] = useState(QBANK);
  const [papers, setPapers] = useState(QP);
  const [add, setAdd] = useState(false);
  const [ai, setAi] = useState(false);
  const [open, setOpen] = useState(null);
  const chapters = [...new Set(QBANK.map((x) => x.ch))];
  const qs = bank.filter((x) => (ch === 'all' || x.ch === ch) && (diff === 'all' || x.diff === diff) && (!q.trim() || x.q.toLowerCase().includes(q.trim().toLowerCase())));
  const ps = papers.filter((p) => !q.trim() || p.title.toLowerCase().includes(q.trim().toLowerCase()));
  const totals = BP_COLS.map((_, j) => BLUEPRINT.reduce((a, [, r]) => a + r[j], 0));
  return (
    <div>
      <ModuleHead sub="Question bank by chapter and difficulty, and papers made from it · final papers stay locked until the exam"
        actions={w.canEdit && <><Button variant="secondary" icon={I.Plus} onClick={() => setAdd(true)}>Add question</Button><Button variant="primary" icon={I.Sparkles} onClick={() => { setTab('blueprint'); setAi(true); }}>Draft a paper</Button></>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Segmented value={tab} onChange={(v) => { setTab(v); setQ(''); }} className="self-start" options={[{ value: 'papers', label: 'Papers' }, { value: 'bank', label: 'Question bank' }, { value: 'blueprint', label: 'Blueprint' }]} />

        {tab === 'papers' && (
          <Card className="overflow-hidden">
            <Toolbar><SearchBox id="qp-search" value={q} onChange={setQ} placeholder="Search papers" /><ExportButton what="papers" /></Toolbar>
            <DataList rows={ps} minWidth={720} onRow={(p) => setOpen(p)} footer={`Showing 1 to ${ps.length} of ${ps.length}`}
              columns={[
                { key: 't', label: 'Paper', render: (p) => <><p className="font-semibold">{p.title}</p><p className="text-[12.5px] text-ink3">Set by {p.setter}</p></> },
                { key: 'm', label: 'Total marks', align: 'right', render: (p) => p.marks },
                { key: 's', label: 'Status', render: (p) => <Pill tone={p.status === 'Final' ? 'ok' : p.status === 'Draft' ? 'neutral' : 'info'}>{p.status}</Pill> },
                { key: 'l', label: 'Locked', render: (p) => (p.locked ? <span className="inline-flex items-center gap-1.5 text-[13px] text-ink2"><I.Lock size={14} className="text-warn" />Until {p.locked}</span> : <span className="text-ink3 text-[13px]">{p.status === 'Used' ? 'Opened 23 Sep' : 'Not locked'}</span>) },
              ]}
              mobile={(p) => ({ icon: p.locked ? 'Lock' : 'FileText', iconTone: p.locked ? 'warn' : 'neutral', title: p.title, sub: p.locked ? `Locked until ${p.locked}` : `${p.marks} marks · ${p.setter}`, pills: [<Pill key="s" tone={p.status === 'Final' ? 'ok' : 'neutral'} className="!h-[22px] !text-[11.5px]">{p.status}</Pill>] })} />
          </Card>
        )}

        {tab === 'bank' && (
          <Card className="overflow-hidden">
            <Toolbar>
              <SearchBox id="qb-search" value={q} onChange={setQ} placeholder="Search question text" />
              <Select id="qb-ch" value={ch} onChange={setCh} className="@md:w-60" options={[{ value: 'all', label: 'All chapters' }, ...chapters]} />
              {w.canEdit && <Button variant="secondary" icon={I.Upload} className="hidden @md:inline-flex" onClick={() => toast({ title: 'Import questions', body: 'Download the template, fill it and upload. Each row is checked first.', tone: 'info' })}>Import</Button>}
            </Toolbar>
            <div className="px-3 pt-3"><Chips value={diff} onChange={setDiff} options={[{ value: 'all', label: 'All levels', count: bank.length }, ...['Easy', 'Medium', 'Hard'].map((d) => ({ value: d, label: d, count: bank.filter((x) => x.diff === d).length }))]} /></div>
            <DataList rows={qs} minWidth={760} footer={`Showing ${qs.length} of ${bank.length} · Class 7 · Mathematics`}
              columns={[
                { key: 'q', label: 'Question', className: 'max-w-[420px]', render: (x) => <><p className="text-[13.5px] line-clamp-2">{x.q}</p><p className="text-[12px] text-ink3 font-mono">{x.id}</p></> },
                { key: 'ty', label: 'Type', nowrap: true, render: (x) => x.type },
                { key: 'ch', label: 'Chapter', render: (x) => <span className="text-[13px]">{x.ch}</span> },
                { key: 'd', label: 'Difficulty', render: (x) => <Pill tone={DIFF_TONE[x.diff]}>{x.diff}</Pill> },
                { key: 'm', label: 'Marks', align: 'right', render: (x) => x.marks },
                { key: 'u', label: 'Used in', render: (x) => <span className="text-[13px] text-ink3">{x.used}</span> },
              ]}
              mobile={(x) => ({ icon: 'CircleHelp', title: x.q, sub: `${x.ch} · ${x.type} · ${x.marks} ${x.marks === 1 ? 'mark' : 'marks'}`, pills: [<Pill key="d" tone={DIFF_TONE[x.diff]} className="!h-[22px] !text-[11.5px]">{x.diff}</Pill>] })} />
          </Card>
        )}

        {tab === 'blueprint' && (
          <Split side={340}>
            <Col>
              <Card className="overflow-hidden">
                <CardHead title="Blueprint · Half Yearly · Mathematics · Class 7" sub="Number of questions per chapter and type · 80 marks" icon={I.Grid3x3}
                  action={w.canEdit && <Button size="sm" variant="soft" icon={I.Sparkles} onClick={() => setAi(true)}>Draft from blueprint</Button>} />
                <div className="overflow-x-auto scroll-thin border-t border-line">
                  <table className="text-[13px] min-w-full">
                    <thead><tr className="border-b border-line text-ink3 text-[12px]">
                      <th className="sticky left-0 z-10 bg-surface text-left font-semibold px-4 py-2.5 min-w-[200px]">Chapter</th>
                      {BP_COLS.map(([t, m], j) => <th key={j} className="font-semibold px-2 py-2.5 text-center whitespace-nowrap">{t}<span className="block text-[11px] font-medium">{m} {m === 1 ? 'mark' : 'marks'}</span></th>)}
                      <th className="font-semibold px-4 py-2.5 text-right">Marks</th>
                    </tr></thead>
                    <tbody>
                      {BLUEPRINT.map(([c, r]) => (
                        <tr key={c} className="border-b border-line/60">
                          <td className="sticky left-0 z-10 bg-surface px-4 py-2 font-medium">{c}</td>
                          {r.map((n, j) => <td key={j} className={cx('px-2 py-2 text-center tnum', !n && 'text-ink3')}>{n || '·'}</td>)}
                          <td className="px-4 text-right font-semibold tnum">{r.reduce((a, n, j) => a + n * BP_COLS[j][1], 0)}</td>
                        </tr>
                      ))}
                      <tr className="bg-sunken/50 font-semibold">
                        <td className="sticky left-0 z-10 bg-sunken px-4 py-2">Total</td>
                        {totals.map((t, j) => <td key={j} className="px-2 py-2 text-center tnum">{t}<span className="block text-[11px] text-ink3 font-medium">{t * BP_COLS[j][1]} marks</span></td>)}
                        <td className="px-4 text-right tnum">80</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Card>
              {ai && (
                <Suggestion title="Draft paper · Half Yearly · Mathematics · Class 7" source="the blueprint above, the Class 7 syllabus (chapters 1–7) and 212 questions in the bank. Nothing enters the bank or the paper until you accept it."
                  actions={<>
                    <Button size="sm" variant="primary" icon={I.Check} onClick={() => { setAi(false); setPapers((x) => [{ id: 'P7', title: 'Half Yearly · Mathematics · Class 7 (set B)', exam: 'Half Yearly', sub: 'Mathematics', cls: 'Class 7', marks: 80, status: 'Draft', setter: w.name }, ...x]); setTab('papers'); toast({ title: 'Saved as a draft paper: set B', body: 'Edit any question, then mark it final to lock it until the exam.' }); }}>Save as draft paper</Button>
                    <Button size="sm" variant="secondary" icon={I.RefreshCw} onClick={() => toast({ title: 'A new draft is being made', body: 'Same blueprint, different questions.', tone: 'info' })}>Draft again</Button>
                    <Button size="sm" variant="ghost" onClick={() => setAi(false)}>Discard</Button>
                  </>}>
                  <ol className="flex flex-col gap-2 list-decimal pl-5 mt-1">
                    <li><b className="font-semibold text-ink">Section A · 1 mark.</b> Which integer is neither positive nor negative? (a) −1 (b) 0 (c) 1 (d) 2 <span className="text-ink3">· Integers · easy</span></li>
                    <li><b className="font-semibold text-ink">Section B · 2 marks.</b> Find the mode of 4, 7, 7, 2, 9, 7, 4. <span className="text-ink3">· Data Handling · easy</span></li>
                    <li><b className="font-semibold text-ink">Section C · 3 marks.</b> Sita spent 2/5 of her money on books and 1/4 on a bag. What part is left? <span className="text-ink3">· Fractions · medium</span></li>
                    <li><b className="font-semibold text-ink">Section D · 5 marks.</b> A sum of ₹6,000 is lent at 8% simple interest for 3 years. Find the interest and the amount. <span className="text-ink3">· Comparing Quantities · medium</span></li>
                    <li><b className="font-semibold text-ink">Section E · 4 marks.</b> Case study: a school garden shaped as a triangle, with three questions on angles and sides. <span className="text-ink3">· Triangle · hard</span></li>
                  </ol>
                  <p className="mt-2">And 33 more questions, with an answer key.</p>
                  <div className="grid @md:grid-cols-2 gap-2 mt-3">
                    <p className="rounded-xl bg-surface border border-line px-3 py-2 text-[13px]"><I.CircleCheck size={14} className="inline text-ok mr-1.5" /><b className="font-semibold text-ink">Difficulty check:</b> 24 easy, 40 medium, 16 hard marks. Matches the mix.</p>
                    <p className="rounded-xl bg-surface border border-line px-3 py-2 text-[13px]"><I.TriangleAlert size={14} className="inline text-warn mr-1.5" /><b className="font-semibold text-ink">Duplicate check:</b> 2 questions were close to Unit Test 2 and were swapped.</p>
                  </div>
                </Suggestion>
              )}
            </Col>
            <Col>
              <Card>
                <CardHead title="Difficulty mix" sub="Out of 80 marks" icon={I.Gauge} />
                <div className="px-5 pb-5"><HBars rows={[{ k: 'Easy', v: 30, label: '24 · 30%' }, { k: 'Medium', v: 50, label: '40 · 50%' }, { k: 'Hard', v: 20, label: '16 · 20%' }]} labelWidth={64} /></div>
              </Card>
              <Card>
                <CardHead title="Keeping papers safe" icon={I.ShieldCheck} />
                <ul className="px-5 pb-5 flex flex-col gap-2 text-[13.5px] text-ink2">
                  <li className="flex gap-2"><I.Lock size={16} className="text-brand shrink-0 mt-0.5" />A final paper is locked until the morning of the exam.</li>
                  <li className="flex gap-2"><I.Printer size={16} className="text-brand shrink-0 mt-0.5" />Only the Exam In-charge prints it, from 7:30 AM that day.</li>
                  <li className="flex gap-2"><I.History size={16} className="text-brand shrink-0 mt-0.5" />Every view and print is in the audit log.</li>
                </ul>
              </Card>
            </Col>
          </Split>
        )}
      </div>

      <AddQuestionSheet open={add} onClose={() => setAdd(false)} chapters={chapters} onAdd={(x) => { setBank((b) => [x, ...b]); setTab('bank'); toast({ title: 'Question added to the bank', body: `${x.ch} · ${x.diff} · ${x.marks} ${x.marks === 1 ? 'mark' : 'marks'}` }); }} />
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.title} sub={open ? `${open.marks} marks · set by ${open.setter}` : ''}
        footer={open && <><Button variant="ghost" onClick={() => setOpen(null)}>Close</Button>
          {open.status === 'Draft' && w.canEdit && <Button variant="primary" icon={I.Lock} onClick={() => { setPapers((x) => x.map((p) => (p.id === open.id ? { ...p, status: 'Final', locked: open.sub === 'Mathematics' ? 'Wed 14 Oct, 7:30 AM' : 'Mon 26 Oct, 7:30 AM' } : p))); setOpen(null); toast({ title: 'Paper marked final and locked', body: 'It opens for printing on the morning of the exam.' }); }}>Mark final and lock</Button>}
          {open.status !== 'Draft' && !open.locked && <Button variant="secondary" icon={I.Printer} onClick={() => toast({ title: 'Paper sent to the exam office printer', body: 'With answers, for the teacher' })}>Print with answers</Button>}</>}>
        {open && (open.locked ? (
          <div className="flex flex-col items-center text-center gap-3 py-6">
            <span className="w-14 h-14 rounded-2xl bg-warn/12 text-warn grid place-items-center"><I.Lock size={26} /></span>
            <p className="font-semibold text-[15px]">Locked until {open.locked}</p>
            <p className="text-[13.5px] text-ink3 max-w-sm">Nobody can open or print this paper before then, including the setter. Prakash Joshi prints it on the exam morning.</p>
          </div>
        ) : (
          <DL rows={[['Exam', open.exam], ['Class and subject', `${open.cls} · ${open.sub}`], ['Made from', 'Blueprint, 38 questions'], ['Answer key', 'Ready'], ['Status', open.status]]} />
        ))}
      </Sheet>
    </div>
  );
}

function AddQuestionSheet({ open, onClose, chapters, onAdd }) {
  const [f, setF] = useState({ ch: '', type: 'Short', q: '', ans: '', marks: '1', diff: 'Medium', opts: ['', '', '', ''], right: 0 });
  const [tried, setTried] = useState(false);
  const needOpts = f.type === 'MCQ';
  const err = { ch: !f.ch ? 'Choose a chapter' : '', q: !f.q.trim() ? 'Type the question' : '', opts: needOpts && f.opts.some((o) => !o.trim()) ? 'Fill all four options' : '', ans: f.type === 'True or false' && !f.ans ? 'Choose the correct answer' : '' };
  return (
    <FormSheet open={open} onClose={() => { setTried(false); onClose(); }} title="Add question" sub="Class 7 · Mathematics" submitLabel="Add to bank"
      onSubmit={() => { setTried(true); if (Object.values(err).some(Boolean)) return false; onAdd({ id: 'Q' + (170 + Math.floor(Math.random() * 20)), q: f.q.trim(), type: f.type, ch: f.ch, diff: f.diff, marks: Number(f.marks) || 1, used: '—' }); setF({ ...f, q: '', ans: '', opts: ['', '', '', ''] }); setTried(false); }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Chapter" required id="aq-ch" error={tried && err.ch} className="col-span-2"><Select id="aq-ch" value={f.ch} onChange={(v) => setF({ ...f, ch: v })} error={tried && !!err.ch} options={[{ value: '', label: 'Choose from the syllabus' }, ...chapters]} /></Field>
        <Field label="Type" required id="aq-type"><Select id="aq-type" value={f.type} onChange={(v) => setF({ ...f, type: v })} options={['MCQ', 'Short', 'Long', 'True or false', 'Fill in the blanks', 'Match']} /></Field>
        <Field label="Marks" required id="aq-marks"><Input id="aq-marks" inputMode="numeric" value={f.marks} onChange={(e) => setF({ ...f, marks: e.target.value.replace(/\D/g, '') })} className="tnum" /></Field>
      </div>
      <Field label="Question" required id="aq-q" error={tried && err.q}><Textarea id="aq-q" value={f.q} onChange={(v) => setF({ ...f, q: v })} placeholder="Type the question as it should print" /></Field>
      {needOpts && (
        <Field label="Options and correct answer" required error={tried && err.opts} hint="Tap the circle next to the correct option">
          <div className="flex flex-col gap-2">
            {f.opts.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <button type="button" role="radio" aria-checked={f.right === i} aria-label={`Option ${i + 1} is correct`} onClick={() => setF({ ...f, right: i })} className={cx('w-6 h-6 rounded-full border-2 grid place-items-center shrink-0', f.right === i ? 'border-brand' : 'border-line')}>{f.right === i && <span className="w-3 h-3 rounded-full bg-brand" />}</button>
                <Input value={o} onChange={(e) => setF({ ...f, opts: f.opts.map((x, j) => (j === i ? e.target.value : x)) })} placeholder={`Option ${'abcd'[i]}`} className="!h-10" aria-label={`Option ${i + 1}`} />
              </div>
            ))}
          </div>
        </Field>
      )}
      {f.type === 'True or false' && <Field label="Correct answer" required error={tried && err.ans}><Segmented value={f.ans} onChange={(v) => setF({ ...f, ans: v })} options={['True', 'False']} className="w-full" /></Field>}
      <Field label="Difficulty" required id="aq-diff"><Segmented value={f.diff} onChange={(v) => setF({ ...f, diff: v })} options={['Easy', 'Medium', 'Hard']} className="w-full" /></Field>
    </FormSheet>
  );
}

/* =====================================================================
   7. Exam Analysis
   ===================================================================== */
const AN_EXAMS = [{ value: '2', label: 'Unit Test 2', f: '2026-09-21', t: '2026-09-25' }, { value: '1', label: 'Unit Test 1', f: '2026-07-20', t: '2026-07-24' }];
function AnalysisPage() {
  const { go } = useNav();
  const [per, setPer] = useState(PERIODS.acyear);
  const [t0, setT] = useState('2');
  const exOpts = AN_EXAMS.filter((x) => x.t >= per.from && x.f <= per.to);
  const t = exOpts.some((x) => x.value === t0) ? t0 : exOpts[0]?.value || '2';
  const [scope, setScope] = useState('all');
  const [sub, setSub] = useState('all');
  const [stu, setStu] = useState(FEATURED.id);
  const secs = scope === 'all' ? ALL_SECS : scope.includes(' ') ? [scope] : ALL_SECS.filter((s) => s.startsWith(scope + ' '));
  const data = useMemo(() => {
    const now = secs.flatMap((s) => classResults(s, Number(t)));
    const before = secs.flatMap((s) => classResults(s, 1));
    const subIdx = SUBJECTS6.indexOf(sub);
    const pctOf = (r) => (subIdx >= 0 ? (num(r.marks[subIdx]) / 25) * 100 : r.pct);
    const pass = now.filter((r) => (subIdx >= 0 ? num(r.marks[subIdx]) >= 8.25 : !r.fails.length && !r.absent.length)).length;
    const grades = GRADES.map((g) => ({ k: g.g, v: now.filter((r) => gradeOf(pctOf(r)) === g.g).length, tone: gradeTone(g.g) === 'bad' ? 'bad' : gradeTone(g.g) === 'warn' ? 'warn' : 'brand' }));
    const subjects = SUBJECTS6.map((s, i) => ({ k: s, v: Math.round(avg(now.map((r) => (num(r.marks[i]) / 25) * 100))) }));
    const sections = (scope === 'all' ? ALL_SECS : ALL_SECS.filter((s) => classNo(s) === classNo(secs[0]))).map((s) => ({ k: s, v: Math.round(avg(classResults(s, Number(t)).map(pctOf))) }));
    const toppers = [...now].sort((a, b) => pctOf(b) - pctOf(a)).slice(0, 5);
    const drops = t === '2' ? now.map((r) => { const b = before.find((x) => x.s.id === r.s.id); return { r, from: pctOf(b), to: pctOf(r) }; }).filter((x) => x.from - x.to >= 8).sort((a, b) => (b.from - b.to) - (a.from - a.to)).slice(0, 6) : [];
    return { now, pass, grades, subjects, sections, toppers, drops, avg: avg(now.map(pctOf)), pctOf };
  }, [t, scope, sub]);
  const sr1 = classResults('7 B', 1).find((r) => r.s.id === stu), sr2 = classResults('7 B', 2).find((r) => r.s.id === stu);
  const openS = (s) => (s.real ? go('student', { id: s.id }) : null);
  return (
    <div>
      <ModuleHead sub="Subject-wise and class-wise results, toppers and students who need help"
        actions={<ExportButton what="exam analysis" className="!inline-flex" />} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Card className="overflow-hidden">
          <Toolbar>
            <DatePeriod id="an-per" value={per} onChange={setPer} className="w-full @md:w-auto" />
            {exOpts.length > 0 && <Select id="an-exam" value={t} onChange={setT} className="@md:w-48" options={exOpts.map(({ value, label }) => ({ value, label }))} />}
            <Select id="an-scope" value={scope} onChange={setScope} className="@md:w-48" options={[{ value: 'all', label: 'Classes 6–10' }, ...[6, 7, 8, 9, 10].map((n) => ({ value: String(n), label: `Class ${n}` })), ...secOptions(ALL_SECS)]} />
            <Select id="an-sub" value={sub} onChange={setSub} className="@md:w-48" options={[{ value: 'all', label: 'All subjects' }, ...SUBJECTS6]} />
          </Toolbar>
          <p className="px-4 py-2.5 text-[12.5px] text-ink3 tnum">Showing: {per.label} · {fmtRange(per)} · {exOpts.length ? `${exOpts.length} ${exOpts.length === 1 ? 'exam' : 'exams'} with results` : 'no exam results'}</p>
        </Card>
        {!exOpts.length ? <Card><Empty icon={I.ChartBar} title="No exam results in these dates" body="Results show here once an exam in these dates is marked. Unit Test 1 was in July and Unit Test 2 in September." action={<Button variant="secondary" onClick={() => setPer(PERIODS.acyear)}>This academic year</Button>} /></Card> : <>
        <Stats items={[
          { label: 'Students', value: data.now.length, sub: secs.length === 1 ? `Class ${secs[0]}` : `${secs.length} sections`, icon: 'Users' },
          { label: 'Average', value: pctTxt(data.avg), sub: sub === 'all' ? 'All subjects' : sub, icon: 'Calculator' },
          { label: 'Pass', value: pctTxt(Math.round((data.pass / data.now.length) * 1000) / 10), sub: `${data.pass} of ${data.now.length}`, tone: 'ok', icon: 'CircleCheck' },
          { label: 'A1 and A2', value: data.grades[0].v + data.grades[1].v, sub: '81% and above', tone: 'brand', icon: 'Award' },
          { label: 'Below 33%', value: data.now.length - data.pass, sub: 'Need support', tone: data.now.length - data.pass ? 'bad' : undefined, icon: 'TriangleAlert' },
        ]} />
        <div className="grid @xl:grid-cols-2 gap-5 @lg:gap-6">
          <Card>
            <CardHead title="Subject averages" sub="Below 65% shows in amber" icon={I.ChartBar} />
            <div className="px-5 pb-5"><HBars rows={data.subjects} lowBelow={65} labelWidth={104} /></div>
          </Card>
          <Card>
            <CardHead title={scope === 'all' ? 'Sections compared' : `Class ${classNo(secs[0])} sections compared`} sub="Average percentage" icon={I.ChartColumn} />
            <div className="px-5 pb-4"><Bars data={data.sections.map((x) => ({ ...x, tone: secs.includes(x.k) ? 'brand' : 'info' }))} max={100} label={(v) => `${v}`} ariaLabel="Average percentage by section" ticks={[0, 50, 100]} /></div>
          </Card>
          <Card>
            <CardHead title="Grade distribution" sub="Number of students per grade" icon={I.ChartNoAxesColumn} />
            <div className="px-5 pb-4"><Bars data={data.grades} label={(v) => `${v}`} ariaLabel="Students per grade" /></div>
          </Card>
          <Card>
            <CardHead title="Toppers" sub={sub === 'all' ? 'Highest total' : `Highest in ${sub}`} icon={I.Trophy} />
            <ul className="px-2 pb-2">
              {data.toppers.map((r, i) => (
                <li key={r.s.id}>
                  <button onClick={() => openS(r.s)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/70 text-left">
                    <span className={cx('w-7 h-7 rounded-full grid place-items-center text-[12px] font-bold tnum shrink-0', i === 0 ? 'bg-warn/15 text-warn' : 'bg-sunken text-ink3')}>{i + 1}</span>
                    <Avatar name={r.s.name} size={34} />
                    <div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px] truncate">{r.s.name}</p><p className="text-[12.5px] text-ink3">Class {r.sec} · roll {r.s.roll}</p></div>
                    <span className="font-semibold tnum">{pctTxt(Math.round(data.pctOf(r) * 10) / 10)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <Split side={380}>
          <Card>
            <CardHead title="Students who dropped" sub={t === '2' ? 'Down 8 points or more since Unit Test 1' : 'Choose Unit Test 2 to compare with Unit Test 1'} icon={I.TrendingDown} action={data.drops.length > 0 && <Pill tone="warn">{data.drops.length}</Pill>} />
            {data.drops.length ? (
              <ul className="px-2 pb-2">
                {data.drops.map(({ r, from, to }) => (
                  <li key={r.s.id}>
                    <button onClick={() => openS(r.s)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/70 text-left">
                      <Avatar name={r.s.name} size={34} />
                      <div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px] truncate">{r.s.name}</p><p className="text-[12.5px] text-ink3">Class {r.sec} · attendance {r.s.att}%</p></div>
                      <span className="text-right tnum text-[13px]"><span className="text-ink3">{pctTxt(Math.round(from))} →</span> <b className="text-bad font-semibold">{pctTxt(Math.round(to))}</b></span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : <Empty icon={I.TrendingUp} title="Nobody dropped sharply" body="No student fell 8 points or more in this view." />}
          </Card>
          <Card>
            <CardHead title="Student progress" sub="One student across exams" icon={I.ChartLine} action={<Select id="an-stu" value={stu} onChange={setStu} className="w-44 [&_select]:!h-9 [&_select]:!text-[14px]" options={CLASS_7B.map((s) => ({ value: s.id, label: s.name }))} />} />
            <div className="px-5 pb-5">
              <div className="flex items-baseline gap-2 mb-3"><p className="font-display text-[26px] font-semibold tnum">{pctTxt(sr2.pct)}</p><p className={cx('text-[13px] font-semibold', sr2.pct >= sr1.pct ? 'text-ok' : 'text-bad')}>{sr2.pct >= sr1.pct ? '▲' : '▼'} from {pctTxt(sr1.pct)} in Unit Test 1</p></div>
              <TrendLine points={[{ k: 'UT 1', v: sr1.pct }, { k: 'UT 2', v: sr2.pct }, { k: 'Half Yearly', v: null }, { k: 'Annual', v: null }]} />
              <ul className="flex flex-col gap-2 mt-4">
                {SUBJECTS6.map((s, i) => (
                  <li key={s} className="grid grid-cols-[96px_1fr_64px] items-center gap-2 text-[13px]">
                    <span className="font-medium truncate">{s}</span>
                    <span className="flex flex-col gap-1"><Progress value={(num(sr1.marks[i]) / 25) * 100} tone="info" /><Progress value={(num(sr2.marks[i]) / 25) * 100} /></span>
                    <span className="text-right tnum"><span className="text-ink3">{sr1.marks[i]} →</span> <b className="font-semibold">{sr2.marks[i]}</b></span>
                  </li>
                ))}
              </ul>
              <div className="mt-3"><Legend items={[['bg-info', 'Unit Test 1'], ['bg-brand', 'Unit Test 2']]} /></div>
            </div>
          </Card>
        </Split>
        </>}
      </div>
    </div>
  );
}

function TrendLine({ points }) {
  const W = 320, H = 110, pad = 26;
  const x = (i) => pad + (i * (W - pad * 2)) / (points.length - 1);
  const y = (v) => 10 + (H - 34) * (1 - v / 100);
  const pts = points.filter((p) => p.v != null);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Percentage across exams">
      {[50, 100].map((t) => <line key={t} x1={pad} x2={W - pad} y1={y(t)} y2={y(t)} strokeDasharray="3 4" style={{ stroke: 'rgb(var(--line))' }} />)}
      <polyline fill="none" strokeWidth="2.5" points={pts.map((p) => `${x(points.indexOf(p))},${y(p.v)}`).join(' ')} style={{ stroke: 'rgb(var(--brand))' }} />
      {points.map((p, i) => (
        <g key={p.k}>
          {p.v != null ? <circle cx={x(i)} cy={y(p.v)} r="5" style={{ fill: 'rgb(var(--brand))' }} /> : <circle cx={x(i)} cy={y(50)} r="4" fill="none" strokeDasharray="2 2" style={{ stroke: 'rgb(var(--ink-3))' }} />}
          {p.v != null && <text x={x(i)} y={y(p.v) - 10} textAnchor="middle" fontSize="11" fontWeight="600" style={{ fill: 'rgb(var(--ink))' }}>{Math.round(p.v)}%</text>}
          <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="10.5" style={{ fill: 'rgb(var(--ink-3))' }}>{p.k}</text>
        </g>
      ))}
    </svg>
  );
}

/* =====================================================================
   8. Exam Settings
   ===================================================================== */
const PRESETS = {
  'CBSE 9-point': GRADES,
  ICSE: [{ g: 'A+', min: 90, max: 100, pts: 10, rm: 'Outstanding' }, { g: 'A', min: 75, max: 89, pts: 9, rm: 'Excellent' }, { g: 'B', min: 60, max: 74, pts: 8, rm: 'Very good' }, { g: 'C', min: 45, max: 59, pts: 6, rm: 'Good' }, { g: 'D', min: 35, max: 44, pts: 4, rm: 'Pass' }, { g: 'E', min: 0, max: 34, pts: 0, rm: 'Needs improvement' }],
  'State Board': [{ g: 'A1', min: 91, max: 100, pts: 10, rm: 'Excellent' }, { g: 'A2', min: 81, max: 90, pts: 9, rm: 'Very good' }, { g: 'B1', min: 71, max: 80, pts: 8, rm: 'Good' }, { g: 'B2', min: 61, max: 70, pts: 7, rm: 'Above average' }, { g: 'C1', min: 51, max: 60, pts: 6, rm: 'Average' }, { g: 'C2', min: 41, max: 50, pts: 5, rm: 'Fair' }, { g: 'D', min: 35, max: 40, pts: 4, rm: 'Pass' }, { g: 'E', min: 0, max: 34, pts: 0, rm: 'Needs improvement' }],
};
function SettingsPage() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const [preset, setPreset] = useState('CBSE 9-point');
  const [scale, setScale] = useState(GRADES.map((g) => ({ ...g })));
  const [weights, setWeights] = useState({ 'Unit Test 1': '10', 'Unit Test 2': '10', 'Half Yearly': '30', Annual: '50' });
  const [types, setTypes] = useState(['Unit Test 1', 'Unit Test 2', 'Half Yearly', 'Pre-board 1', 'Annual', 'Practical', 'Internal assessment']);
  const [addType, setAddType] = useState(false);
  const [newType, setNewType] = useState('');
  const [instr, setInstr] = useState('Report by 8:15 AM. Bring this card and two pencils, a pen and a geometry box. Phones, smart watches and calculators are not allowed in the hall.');
  const sorted = [...scale].sort((a, b) => b.min - a.min);
  const scaleErrs = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const hi = sorted[i], lo = sorted[i + 1];
    if (Number(lo.max) >= Number(hi.min)) scaleErrs.push(`${Number(hi.min)}% falls in two grades: ${lo.g} and ${hi.g}.`);
    else if (Number(lo.max) + 1 < Number(hi.min)) scaleErrs.push(`${hi.g} starts at ${hi.min}% but ${lo.g} ends at ${lo.max}%. Marks in between have no grade.`);
  }
  if (sorted.length && Number(sorted[0].max) !== 100) scaleErrs.push(`${sorted[0].g} must end at 100%.`);
  if (sorted.length && Number(sorted[sorted.length - 1].min) !== 0) scaleErrs.push(`${sorted[sorted.length - 1].g} must start at 0%.`);
  const wSum = Object.values(weights).reduce((a, v) => a + Number(v || 0), 0);
  const setG = (i, k, v) => setScale((x) => x.map((g, j) => (j === i ? { ...g, [k]: v.replace(/\D/g, '').slice(0, 3) } : g)));
  return (
    <div className="max-w-5xl">
      <ModuleHead sub="Exam types, mark categories, grade scale, pass rules and the final result" />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Card>
          <CardHead title="Exam types" sub="Offered when adding a datesheet" icon={I.ListChecks} action={canEdit && <Button size="sm" variant="soft" icon={I.Plus} onClick={() => setAddType(true)}>Add</Button>} />
          <div className="px-5 pb-5 flex flex-wrap gap-2">
            {types.map((t) => <span key={t} className="h-9 px-3.5 rounded-xl border border-line text-[13.5px] font-semibold inline-flex items-center gap-2">{t}</span>)}
          </div>
        </Card>

        <Card>
          <CardHead title="Grade scale" sub="Classes 6–10 · CBSE. Changing it never changes results already published." icon={I.Scale} />
          <div className="px-5 pb-3 flex flex-col gap-3">
            {canEdit && <div className="flex items-center gap-2 flex-wrap"><span className="text-[13px] font-semibold text-ink2">Start from</span><Segmented size="sm" value={preset} onChange={(v) => { setPreset(v); setScale(PRESETS[v].map((g) => ({ ...g }))); }} options={Object.keys(PRESETS)} /></div>}
            <div>
            <div className="flex h-8 rounded-lg overflow-hidden border border-line" aria-label="Scale preview">
              {[...sorted].reverse().map((g) => (
                <span key={g.g} className={cx('grid place-items-center text-[11px] font-bold', TONE_SOFT[gradeTone(g.g)])} style={{ width: `${Math.max(0, Number(g.max) - Number(g.min) + 1)}%` }} title={`${g.g}: ${g.min}–${g.max}%`}>{Number(g.max) - Number(g.min) >= 6 ? g.g : ''}</span>
              ))}
            </div>
            <div className="relative h-4 text-[11px] text-ink3 mt-1 tnum"><span className="absolute left-0">0%</span><span className="absolute -translate-x-1/2" style={{ left: '33%' }}>33% pass</span><span className="absolute right-0">100%</span></div>
            </div>
          </div>
          <div className="overflow-x-auto scroll-thin border-t border-line">
            <table className="w-full text-[13.5px] min-w-[560px]">
              <thead><tr className="text-[12px] text-ink3 text-left border-b border-line">{['Grade', 'From %', 'To %', 'Points', 'Remark', 'Passing'].map((h) => <th key={h} className="font-semibold px-3 py-2.5 first:pl-5">{h}</th>)}</tr></thead>
              <tbody>
                {scale.map((g, i) => (
                  <tr key={g.g} className="border-b border-line/70 last:border-0">
                    <td className="px-3 pl-5 py-2"><Pill tone={gradeTone(g.g)}>{g.g}</Pill></td>
                    <td className="px-3 py-2"><input aria-label={`${g.g} from`} disabled={!canEdit} value={g.min} onChange={(e) => setG(i, 'min', e.target.value)} className={cx(inputCls(false), '!h-9 !w-20 tnum')} /></td>
                    <td className="px-3 py-2"><input aria-label={`${g.g} to`} disabled={!canEdit} value={g.max} onChange={(e) => setG(i, 'max', e.target.value)} className={cx(inputCls(false), '!h-9 !w-20 tnum')} /></td>
                    <td className="px-3 py-2 tnum">{g.pts}</td>
                    <td className="px-3 py-2 text-ink2">{g.rm}</td>
                    <td className="px-3 py-2">{Number(g.min) >= 33 ? <I.Check size={17} className="text-ok" /> : <span className="text-ink3">No</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-line flex flex-col @md:flex-row gap-2 @md:items-center">
            {scaleErrs.length ? <p className="text-[13px] text-bad flex items-start gap-1.5 flex-1" role="alert"><I.CircleAlert size={15} className="shrink-0 mt-0.5" />{scaleErrs[0]}{scaleErrs.length > 1 ? ` (${scaleErrs.length - 1} more)` : ''}</p> : <p className="text-[13px] text-ok flex items-center gap-1.5 flex-1"><I.CircleCheck size={15} />No gaps or overlaps</p>}
            {canEdit && <Button variant="primary" icon={I.Check} disabled={!!scaleErrs.length} onClick={() => toast({ title: 'Grade scale saved as version 3', body: 'Used from now on. Published results keep the scale they were made with.' })}>Save grade scale</Button>}
          </div>
        </Card>

        <div className="grid @xl:grid-cols-2 gap-5 @lg:gap-6">
          <Card>
            <CardHead title="Mark categories" sub="Default split per subject · each datesheet can change it" icon={I.SlidersHorizontal} />
            <ul className="px-5 pb-5 flex flex-col gap-2 text-[13.5px]">
              {[['English, Telugu, Hindi', 'Theory 80 · Internal 20'], ['Mathematics', 'Theory 80 · Internal 20'], ['Science (Classes 6–8)', 'Theory 70 · Practical 30'], ['Science (Classes 9–10)', 'Theory 80 · Internal 20'], ['Social Studies', 'Theory 80 · Internal 20'], ['Computer Applications', 'Theory 50 · Practical 50']].map(([k, v]) => (
                <li key={k} className="flex justify-between gap-3 rounded-xl border border-line px-3.5 py-2.5"><span className="font-semibold">{k}</span><span className="text-ink2 tnum text-right">{v}</span></li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHead title="Final result weights" sub="How exams add up to the year’s result" icon={I.Sigma} />
            <div className="px-5 pb-5 flex flex-col gap-2.5">
              {Object.entries(weights).map(([k, v]) => (
                <div key={k} className="flex items-center gap-3">
                  <span className="flex-1 font-semibold text-[14px]">{k}</span>
                  <div className="relative w-24"><input aria-label={`${k} weight`} disabled={!canEdit} value={v} onChange={(e) => setWeights({ ...weights, [k]: e.target.value.replace(/\D/g, '').slice(0, 3) })} className={cx(inputCls(wSum !== 100), '!h-10 pr-8 tnum text-right')} /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink3">%</span></div>
                </div>
              ))}
              <p className={cx('text-[13px] flex items-center gap-1.5', wSum === 100 ? 'text-ok' : 'text-bad')}>{wSum === 100 ? <><I.CircleCheck size={15} />Adds up to 100%</> : <><I.CircleAlert size={15} />These add up to {wSum}%. They must add up to 100%.</>}</p>
            </div>
          </Card>
        </div>

        <SettingsCard title="Pass rules and ranks" icon={I.Award} rows={[
          { title: 'Pass marks per subject', sub: 'Below this, the subject shows as failed', value: '33%' },
          { title: 'Pass marks overall', value: '33%' },
          { title: 'Absent (AB)', sub: 'How AB counts in the total', value: 'Counted as zero' },
          { title: 'Medical leave (ML)', sub: 'Needs a medical certificate in Student Leave', value: 'Left out of the percentage' },
          { title: 'Grace marks', sub: 'Up to 5 marks in one subject, with the Principal’s approval', on: false },
          { title: 'Show ranks', sub: 'On result sheets and report cards', on: true },
          { title: 'Tie rule', value: 'Same rank, next rank skipped' },
        ]} />

        <SettingsCard title="Co-scholastic areas" sub="CBSE-style report cards · 3-point scale A, B, C" icon={I.Palette} rows={[
          { title: 'Work education', sub: 'Graded by the class teacher', on: true },
          { title: 'Art education', sub: 'Graded by the art teacher', on: true },
          { title: 'Health and physical education', sub: 'From Co-curricular & Sports', on: true },
          { title: 'Discipline', sub: 'Attendance, values, behaviour', on: true },
          { title: 'Competency-based assessment', sub: 'Competencies per subject with levels', on: false },
        ]} />

        <SettingsCard title="Exam rules" sub="For Sunrise Public School" icon={I.ScrollText} rows={[
          { title: 'Who can publish results', value: 'Principal' },
          { title: 'Marks due', sub: 'Teachers are reminded 2 days before', value: '3 days after the last paper' },
          { title: 'Marks entry opens', value: 'After each paper' },
          { title: 'Admit card signatory', value: 'Lakshmi Rao, Principal' },
          { title: 'Report card format', sub: 'Designed in Settings, Document Designs', value: 'CBSE Classes 6–10' },
          { title: 'Hold admit cards for fee dues', sub: 'Off: every student gets an admit card', on: false },
          { title: 'Reminder to parents the day before each paper', on: true },
        ]}>
          <div className="px-5 py-4">
            <Field label="Instructions printed on admit cards" id="es-instr"><Textarea id="es-instr" value={instr} onChange={setInstr} rows={3} /></Field>
            {canEdit && <Button size="sm" variant="secondary" className="mt-2" onClick={() => toast({ title: 'Admit card instructions saved', body: 'Used for the next print.' })}>Save instructions</Button>}
          </div>
        </SettingsCard>
      </div>
      <FormSheet open={addType} onClose={() => setAddType(false)} title="Add exam type" submitLabel="Add exam type"
        onSubmit={() => { if (!newType.trim()) return false; setTypes((x) => [...x, newType.trim()]); toast({ title: `${newType.trim()} added`, body: 'It is offered when adding a datesheet.' }); setNewType(''); }}>
        <Field label="Name" required id="et-name" hint="For example FA 1, Olympiad practice or Slip test"><Input id="et-name" value={newType} onChange={(e) => setNewType(e.target.value)} /></Field>
      </FormSheet>
    </div>
  );
}

/* =====================================================================
   Pages
   ===================================================================== */
export const EXAMS_PAGES = {
  datesheet: DatesheetPage,
  admitcards: AdmitCardsPage,
  marks: MarksPage,
  results: ResultsPage,
  reportcards: ReportCardsPage,
  papers: PapersPage,
  analysis: AnalysisPage,
  settings: SettingsPage,
};
