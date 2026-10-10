// Academic Management: Classes & Sections, Subjects, Teacher Allocation, Time Table, Substitutions,
// Syllabus & Lesson Plans, Academic Settings. Sample data only.
import React, { useMemo, useState } from 'react';
import * as I from './icons.js';
import { CLASSES, STUDENTS } from './data.js';
import { STAFF, SUBJECTS, PERIODS } from './sample.js';
import { cx, Card, CardHead, Button, Pill, Avatar, Checkbox, Input, Field, Segmented, Switch, Sheet, Empty, useToast } from './ui.jsx';
import { useNav, useRole } from './shell.jsx';
import { ModuleHead, useCanEdit, Stats, SearchBox, Toolbar, Select, Textarea, Chips, DataList, Row, SettingRow, SettingsCard, Banner, Suggestion, Progress, Legend, DL, Timeline, MoreMenu, FormSheet, ConfirmSheet, Split, Col, ExportButton, TONE_SOFT } from './kit.jsx';

/* =====================================================================================
   Sample data
   ===================================================================================== */

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TODAY_D = 4; // Friday 9 Oct 2026
const NOW_P = 2; // 10:42 AM is in period 3 (10:30–11:15)
const PT = (p) => PERIODS[p].t;
const SLOTS = [0, 1, { brk: 'Short break', t: '10:15–10:30', icon: 'Coffee' }, 2, 3, { brk: 'Lunch', t: '12:00–12:40', icon: 'UtensilsCrossed' }, 4, 5, { brk: 'Short break', t: '2:10–2:20', icon: 'Coffee' }, 6, 7];

// Sections: CLASSES from data.js, plus the sections the school runs this year (43 in all)
const MORE_SECS = { NUR: ['B'], LKG: ['C'], UKG: ['C'], 1: ['C', 'D'], 2: ['C', 'D'], 3: ['C', 'D'], 4: ['C', 'D'], 5: ['C', 'D'], 6: ['C'], 7: ['C'], 8: ['C'] };
const STRENGTH = {
  NUR: [22, 20], LKG: [25, 24, 22], UKG: [26, 25, 23],
  1: [27, 26, 26, 25], 2: [28, 27, 26, 26], 3: [28, 28, 27, 25], 4: [29, 28, 27, 26], 5: [31, 28, 27, 25],
  6: [36, 35, 33], 7: [37, 38, 34], 8: [36, 35, 32], 9: [34, 33, 31], 10: [33, 32, 30],
};
const CT = {
  NUR: ['Rekha Sharma', 'Fathima Begum'], LKG: ['Madhavi Latha', 'Sujatha Rao', 'Anjali Verma'], UKG: ['Sunitha Mohan', 'Vani Prasad', 'Hema Latha'],
  1: ['Saritha Reddy', 'Jyothi Naidu', 'Kavya Sree', 'Roopa Devi'], 2: ['Pushpa Latha', 'Usha Rani', 'Neelima Rao', 'Swathi Goud'],
  3: ['Sravanthi Rao', 'Padmaja Sastry', 'Aruna Kumari', 'Manjula Reddy'], 4: ['Sirisha Varma', 'Ramesh Babu', 'Leela Prasad', 'Nirmala Joseph'],
  5: ['Gayathri Menon', 'Sunil Kumar', 'Deepika Rao', null], 6: ['Lalitha Devi', 'Shobha Rani', 'Pallavi Reddy'],
  7: ['Rajeshwari Nair', 'Ravi Teja', 'Mahesh Goud'], 8: ['Venkat Rao', 'Prasad Varma', 'Nandini Joshi'],
  9: ['Bhargavi Kulkarni', 'Swapna Reddy', 'Deepak Verma'], 10: ['Anitha Kumari', 'Arvind Rao', 'Farhana Begum'],
};
const isPre = (id) => ['NUR', 'LKG', 'UKG'].includes(id);
const levelOf = (id) => (isPre(id) ? 'Pre-primary' : Number(id) <= 5 ? 'Primary' : Number(id) <= 8 ? 'Middle' : 'Secondary');
const LEVELS = ['Pre-primary', 'Primary', 'Middle', 'Secondary'];
const SECS = (() => {
  const room = { 'Pre-primary': 1, Primary: 101, Middle: 201, Secondary: 301 };
  return CLASSES.flatMap((c) => [...c.sections, ...(MORE_SECS[c.id] || [])].map((s, i) => {
    const level = levelOf(c.id);
    const n = room[level]++;
    return {
      key: `${c.id}-${s}`, cls: c.id, clsName: c.name, sec: s, level, idx: 0,
      label: isPre(c.id) ? `${c.name} ${s}` : `${c.id} ${s}`,
      students: STRENGTH[c.id][i], seats: level === 'Pre-primary' ? 30 : level === 'Primary' ? (c.id === '5' && s === 'A' ? 30 : 35) : 40,
      ct: CT[c.id][i], room: level === 'Pre-primary' ? `PP-${n}` : `Room ${n}`,
    };
  }));
})();
SECS.forEach((s, i) => { s.idx = i; });
const SEC = Object.fromEntries(SECS.map((s) => [s.label, s]));
const TOTAL_STUDENTS = SECS.reduce((a, s) => a + s.students, 0);
const SENIOR = SECS.filter((s) => s.level === 'Middle' || s.level === 'Secondary').map((s) => s.label);

// Subject teachers (Classes 6–10) and specialists. Loads are periods a week; the limit is 32.
const TEACHERS = [
  { n: 'Imran Shaikh', s: 'Mathematics', d: 'TGT Mathematics', load: 28, cls: '6 A, 6 B, 7 A, 7 B' },
  { n: 'Ravi Teja', s: 'Science', d: 'TGT Science', load: 22, cls: '7 A, 7 B, 8 B' },
  { n: 'Anitha Kumari', s: 'English', d: 'PGT English', load: 31, cls: '8 A, 9 A, 9 C, 10 A, 10 B' },
  { n: 'Rajeshwari Nair', s: 'English', d: 'TGT English', load: 28, cls: '6 C, 7 A, 7 B, 7 C' },
  { n: 'Nandini Joshi', s: 'English', d: 'TGT English', load: 28, cls: '6 A, 6 B, 8 B, 8 C' },
  { n: 'Sneha Mathew', s: 'English', d: 'TGT English', load: 26, cls: '9 B, 10 C, Class 5' },
  { n: 'Lalitha Devi', s: 'Telugu', d: 'TGT Telugu', load: 30, cls: 'Classes 6 and 8' },
  { n: 'Mahesh Goud', s: 'Telugu', d: 'TGT Telugu', load: 30, cls: 'Classes 7, 9 and 10' },
  { n: 'Shobha Rani', s: 'Hindi', d: 'TGT Hindi', load: 30, cls: 'Classes 6 and 7' },
  { n: 'Deepak Verma', s: 'Hindi', d: 'TGT Hindi', load: 30, cls: 'Classes 8, 9 and 10' },
  { n: 'Srinivas Chary', s: 'Mathematics', d: 'TGT Mathematics', load: 26, cls: '6 C, 7 C, Class 8' },
  { n: 'Swapna Reddy', s: 'Mathematics', d: 'TGT Mathematics', load: 27, cls: 'Class 9' },
  { n: 'Arvind Rao', s: 'Mathematics', d: 'PGT Mathematics', load: 27, cls: 'Class 10' },
  { n: 'Pallavi Reddy', s: 'Science', d: 'TGT Science', load: 28, cls: 'Class 6, 7 C' },
  { n: 'Bhargavi Kulkarni', s: 'Science', d: 'TGT Biology', load: 29, cls: '8 A, 8 C, Biology 9–10' },
  { n: 'Farhana Begum', s: 'Science', d: 'PGT Physics', load: 30, cls: 'Physics and Chemistry 9–10' },
  { n: 'Venkat Rao', s: 'Social Studies', d: 'TGT Social Studies', load: 34, cls: 'Class 7, 8 A, 9 A' },
  { n: 'Prasad Varma', s: 'Social Studies', d: 'TGT Social Studies', load: 30, cls: 'Class 6, 8 B, 8 C' },
  { n: 'Rukmini Devi', s: 'Social Studies', d: 'PGT Social Studies', load: 31, cls: '9 B, 9 C, Class 10' },
  { n: 'Karthik Menon', s: 'Computers', d: 'TGT Computer Science', load: 27, cls: 'Classes 3–10' },
  { n: 'Mohammed Asif', s: 'Physical Education', d: 'PET', load: 30, cls: 'Classes 3–10' },
  { n: 'Naresh Chary', s: 'Art', d: 'Art teacher', load: 24, cls: 'Classes 1–10' },
  { n: 'Kalyani Sastry', s: 'Music', d: 'Music teacher', load: 20, cls: 'Nursery to Class 8' },
];
const T_BY = Object.fromEntries(TEACHERS.map((t) => [t.n, t]));
const codeOf = (n) => STAFF.find((s) => s.name === n)?.code || `SPS-T-0${40 + (n.length * 7) % 50}`;
const ctOf = (n) => SECS.find((s) => s.ct === n)?.label || null;

const SUBJ = {
  E: 'English', T: 'Telugu', H: 'Hindi', M: 'Mathematics', S: 'Science', SS: 'Social Studies', C: 'Computers', PE: 'Physical Education',
  A: 'Art', MU: 'Music', L: 'Library', LS: 'Life skills', EVS: 'EVS', L2: 'Telugu / Hindi', IT: 'IT / AI (elective)',
  EN: 'English', NUM: 'Numbers', RH: 'Rhymes and stories', PLAY: 'Play time', ART: 'Art and craft', MM: 'Music and movement', OW: 'Our world',
};
const SHORT = { Mathematics: 'Maths', 'Social Studies': 'Social', 'Physical Education': 'PE', 'Rhymes and stories': 'Rhymes', 'Music and movement': 'Music', 'IT / AI (elective)': 'IT / AI', 'Art and craft': 'Art & craft' };
const short = (s) => SHORT[s] || s;
const TONE_OF = { Mathematics: 'brand', Numbers: 'brand', Science: 'info', EVS: 'info', 'Our world': 'info', English: 'warn' };
const BAR = { brand: 'bg-brand', ok: 'bg-ok', info: 'bg-info', warn: 'bg-warn', neutral: 'bg-ink3/35', bad: 'bg-bad' };

// Who teaches a subject in a section (null means no teacher yet, 'na' means not taught there)
function teacherOf(label, subj) {
  const s = SEC[label];
  if (!s) return null;
  if (s.level === 'Pre-primary') return subj === 'Music and movement' ? 'Kalyani Sastry' : s.ct;
  if (s.level === 'Primary') return ({ Telugu: 'Vijaya Lakshmi', Hindi: 'Kusum Lata', Computers: 'Karthik Menon', 'Physical Education': 'Mohammed Asif', Art: 'Naresh Chary', Music: 'Kalyani Sastry', Library: 'Padma Iyer' })[subj] || s.ct;
  const g = Number(s.cls);
  switch (subj) {
    case 'English': return { '6 A': 'Nandini Joshi', '6 B': 'Nandini Joshi', '6 C': 'Rajeshwari Nair', '7 A': 'Rajeshwari Nair', '7 B': 'Rajeshwari Nair', '7 C': 'Rajeshwari Nair', '8 A': 'Anitha Kumari', '8 B': 'Nandini Joshi', '8 C': 'Nandini Joshi', '9 A': 'Anitha Kumari', '9 B': 'Sneha Mathew', '9 C': 'Anitha Kumari', '10 A': 'Anitha Kumari', '10 B': 'Anitha Kumari', '10 C': 'Sneha Mathew' }[label];
    case 'Telugu': return g === 6 || g === 8 ? 'Lalitha Devi' : 'Mahesh Goud';
    case 'Hindi': return g <= 7 ? 'Shobha Rani' : 'Deepak Verma';
    case 'Telugu / Hindi': return 'Mahesh Goud / Deepak Verma';
    case 'Mathematics': return ['6 A', '6 B', '7 A', '7 B'].includes(label) ? 'Imran Shaikh' : g === 9 ? 'Swapna Reddy' : g === 10 ? 'Arvind Rao' : 'Srinivas Chary';
    case 'Science': return ['7 A', '7 B', '8 B'].includes(label) ? 'Ravi Teja' : g === 6 || label === '7 C' ? 'Pallavi Reddy' : g === 8 ? 'Bhargavi Kulkarni' : 'Farhana Begum';
    case 'Social Studies': return g === 7 || label === '8 A' || label === '9 A' ? 'Venkat Rao' : g === 6 || g === 8 ? 'Prasad Varma' : 'Rukmini Devi';
    case 'Computers': case 'IT / AI (elective)': return label === '8 C' ? null : 'Karthik Menon';
    case 'Physical Education': return 'Mohammed Asif';
    case 'Art': return label === '10 C' ? null : 'Naresh Chary';
    case 'Music': return g >= 9 ? 'na' : 'Kalyani Sastry';
    case 'Library': return 'Padma Iyer';
    case 'Life skills': return s.ct;
    default: return null;
  }
}
const secondOf = (label, subj) => (subj === 'Science' && SEC[label]?.level === 'Secondary' ? 'Bhargavi Kulkarni' : null);

// Week grids. Rows are Monday to Saturday, columns are periods 1 to 8.
const G7B = [
  ['E', 'M', 'S', 'T', 'SS', 'H', 'C', 'PE'],
  ['M', 'E', 'SS', 'S', 'H', 'T', 'A', 'L'],
  ['S', 'M', 'E', 'H', 'SS', 'T', 'PE', 'MU'],
  ['E', 'S', 'M', 'SS', 'T', 'H', 'C', 'A'],
  ['E', 'M', 'S', 'H', 'SS', 'M', 'C', 'PE'],
  ['LS', 'E', 'M', 'S', 'T', 'E', 'SS', 'S'],
];
const GP = [
  ['E', 'M', 'EVS', 'T', 'H', 'M', 'A', 'PE'],
  ['M', 'E', 'T', 'EVS', 'H', 'E', 'C', 'MU'],
  ['E', 'M', 'EVS', 'H', 'T', 'M', 'PE', 'L'],
  ['M', 'E', 'EVS', 'T', 'H', 'E', 'A', 'LS'],
  ['E', 'M', 'EVS', 'H', 'T', 'M', 'PE', 'MU'],
  ['EVS', 'E', 'C', 'EVS', 'A', 'PE', 'L', 'LS'],
];
const GS = [
  ['E', 'M', 'S', 'SS', 'L2', 'M', 'IT', 'PE'],
  ['M', 'S', 'E', 'L2', 'SS', 'S', 'A', 'L'],
  ['S', 'M', 'E', 'SS', 'L2', 'M', 'PE', 'IT'],
  ['M', 'E', 'S', 'SS', 'L2', 'S', 'A', 'LS'],
  ['E', 'M', 'S', 'SS', 'L2', 'S', 'IT', 'PE'],
  ['SS', 'M', 'S', 'E', 'SS', 'M', 'S', 'SS'],
];
const OFF = ['OFF', 'OFF', 'OFF'];
const GPP = [
  ['EN', 'NUM', 'RH', 'PLAY', 'ART', ...OFF], ['NUM', 'EN', 'MM', 'PLAY', 'RH', ...OFF], ['EN', 'NUM', 'ART', 'PLAY', 'OW', ...OFF],
  ['NUM', 'EN', 'RH', 'PLAY', 'MM', ...OFF], ['EN', 'NUM', 'OW', 'PLAY', 'ART', ...OFF], ['RH', 'EN', 'NUM', 'PLAY', 'MM', ...OFF],
];
// Teachers' own weeks drawn by hand (they match Class 7 B and the other classes they teach)
const W_IMRAN = [
  ['6 A', '7 B', '', '6 B', '', '7 A', '6 A', ''],
  ['7 B', '6 A', '7 A', '', '6 B', '', '', ''],
  ['6 B', '7 B', '', '7 A', '', '6 A', '6 B', ''],
  ['7 A', '6 B', '7 B', '', '6 A', '', '7 A', ''],
  ['6 A', '7 B', '7 A', '', '', '7 B', '6 B', ''],
  ['6 A', '6 B', '7 B', '7 A', '', '', '', ''],
];
const W_RAVI = [
  ['7 A', '', '7 B', '', '8 B', '', '8 B', ''],
  ['', '7 A', '', '7 B', '', '7 A', '8 B', ''],
  ['7 B', '8 B', '', '', '7 A', '', '', ''],
  ['', '7 B', '', '7 A', '', '8 B', '', ''],
  ['8 B', '', '7 B', '', '7 A', '', '', ''],
  ['7 B*', '7 A', '', '7 B', '', '8 B', '', '7 B'],
];
// Friday facts the substitutions rest on
const FIXED = {
  'Anitha Kumari': { '4-0': '10 A', '4-1': '9 C', '4-3': '10 B', '4-4': '8 A', '4-6': '9 A' },
  'Swapna Reddy': { '4-3': '9 B', '4-6': '9 C' },
  'Sneha Mathew': { '4-4': '9 B' }, 'Rajeshwari Nair': { '4-4': '7 C' }, 'Nandini Joshi': { '4-4': '6 A' },
};
const KEEP_FREE = {
  'Anitha Kumari': ['4-2', '4-5', '4-7'], 'Swapna Reddy': ['4-0', '4-1', '4-2', '4-4', '4-5', '4-7'],
  'Sneha Mathew': ['4-0'], 'Nandini Joshi': ['4-1'], 'Kalyani Sastry': ['4-0'], 'Srinivas Chary': ['4-1'], 'Naresh Chary': ['4-2'],
};
const CODE_OF_SUBJ = { Mathematics: 'M', Science: 'S', English: 'E' };

const hash = (s) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
const blank = () => Array.from({ length: 6 }, () => Array(8).fill(null));

function teachesList(name) {
  const t = T_BY[name];
  if (!t) return [];
  const subjFor = (l) => (SEC[l].level === 'Secondary' && t.s === 'Computers' ? 'IT / AI (elective)' : t.s);
  return SENIOR.filter((l) => l !== '7 B' && (teacherOf(l, subjFor(l)) === name || secondOf(l, t.s) === name));
}
const WEEK = {};
function weekFor(name) {
  if (WEEK[name]) return WEEK[name];
  const g = blank();
  const hand = name === 'Imran Shaikh' ? W_IMRAN : name === 'Ravi Teja' ? W_RAVI : null;
  if (hand) {
    hand.forEach((row, d) => row.forEach((c, p) => { if (c) g[d][p] = { cls: c.replace('*', ''), subj: c.endsWith('*') ? 'Life skills' : T_BY[name].s }; }));
    return (WEEK[name] = g);
  }
  const t = T_BY[name];
  if (!t) return (WEEK[name] = g);
  G7B.forEach((row, d) => row.forEach((code, p) => { if (teacherOf('7 B', SUBJ[code]) === name) g[d][p] = { cls: '7 B', subj: SUBJ[code] }; }));
  Object.entries(FIXED[name] || {}).forEach(([k, cls]) => { const [d, p] = k.split('-').map(Number); g[d][p] = { cls, subj: t.s }; });
  const free = new Set(KEEP_FREE[name] || []);
  const list = teachesList(name);
  const pool = list.length ? list : ['6 A'];
  let used = g.flat().filter(Boolean).length;
  const h = hash(name);
  for (let i = 0; i < 96 && used < t.load; i++) {
    const slot = (i * 11 + h) % 48; const d = slot % 6; const p = Math.floor(slot / 6);
    if (g[d][p] || free.has(`${d}-${p}`) || g[d].filter(Boolean).length >= 6) continue;
    g[d][p] = { cls: pool[used % pool.length], subj: t.s };
    used++;
  }
  return (WEEK[name] = g);
}

// Required cells per section so class and teacher views agree for the people who use them most
const CLASS_FIX = (() => {
  const f = {};
  const add = (l, d, p, code) => { (f[l] = f[l] || []).push([d, p, code]); };
  W_IMRAN.forEach((row, d) => row.forEach((c, p) => { if (c && c !== '7 B') add(c, d, p, 'M'); }));
  W_RAVI.forEach((row, d) => row.forEach((c, p) => { if (c && !c.startsWith('7 B')) add(c, d, p, 'S'); }));
  Object.entries(FIXED).forEach(([n, m]) => Object.entries(m).forEach(([k, l]) => { const [d, p] = k.split('-').map(Number); add(l, d, p, CODE_OF_SUBJ[T_BY[n].s]); }));
  ['E', 'M', 'EVS', 'T', 'H', 'M', 'PE', 'LS'].forEach((c, p) => add('3 A', 4, p, c));
  return f;
})();
const GRID = {};
function classGrid(label) {
  if (label === '7 B') return G7B;
  if (GRID[label]) return GRID[label];
  const s = SEC[label];
  const base = s.level === 'Pre-primary' ? GPP : s.level === 'Primary' ? GP : s.level === 'Secondary' ? GS : G7B;
  const k = s.idx;
  const swap = k % 2 === 1 && s.level !== 'Pre-primary';
  const g = Array.from({ length: 6 }, (_, d) => Array.from({ length: 8 }, (_, p) => base[(d + k) % 6][swap ? p ^ 1 : p]));
  const req = CLASS_FIX[label] || [];
  const reqKeys = new Set(req.map(([d, p]) => `${d}-${p}`));
  const locked = new Set();
  req.forEach(([d, p, code]) => {
    if (g[d][p] !== code) {
      let found = null;
      for (let dd = 0; dd < 6 && !found; dd++) for (let pp = 0; pp < 8 && !found; pp++) {
        const kk = `${dd}-${pp}`;
        if (g[dd][pp] === code && !locked.has(kk) && !reqKeys.has(kk)) found = [dd, pp];
      }
      if (found) { g[found[0]][found[1]] = g[d][p]; }
      g[d][p] = code;
    }
    locked.add(`${d}-${p}`);
  });
  return (GRID[label] = g);
}

// Today's substitutions (Friday 9 Oct)
const SUB0 = [
  { id: 'a1', p: 0, cls: '10 A', subj: 'English', absent: 'Anitha Kumari', sub: 'Sneha Mathew', at: '7:52 AM', by: 'Naveen Kumar' },
  { id: 'a2', p: 1, cls: '9 C', subj: 'English', absent: 'Anitha Kumari', sub: 'Nandini Joshi', at: '7:52 AM', by: 'Naveen Kumar' },
  { id: 'a3', p: 3, cls: '10 B', subj: 'English', absent: 'Anitha Kumari', sub: null },
  { id: 'a4', p: 4, cls: '8 A', subj: 'English', absent: 'Anitha Kumari', sub: 'Imran Shaikh', at: '9:02 AM', by: 'Naveen Kumar' },
  { id: 'a5', p: 6, cls: '9 A', subj: 'English', absent: 'Anitha Kumari', sub: 'Ravi Teja', at: '9:04 AM', by: 'Naveen Kumar' },
  { id: 'b1', p: 0, cls: '3 A', subj: 'English', absent: 'Sravanthi Rao', sub: 'Kalyani Sastry', at: '7:50 AM', by: 'Naveen Kumar' },
  { id: 'b2', p: 1, cls: '3 A', subj: 'Mathematics', absent: 'Sravanthi Rao', sub: 'Srinivas Chary', at: '7:50 AM', by: 'Naveen Kumar' },
  { id: 'b3', p: 2, cls: '3 A', subj: 'EVS', absent: 'Sravanthi Rao', sub: 'Naresh Chary', at: '7:51 AM', by: 'Naveen Kumar' },
  { id: 'b4', p: 5, cls: '3 A', subj: 'Mathematics', absent: 'Sravanthi Rao', sub: null },
  { id: 'b5', p: 7, cls: '3 A', subj: 'Life skills', absent: 'Sravanthi Rao', sub: null },
];
const AWAY = {
  'Anitha Kumari': { why: 'Casual leave', note: 'Approved by Lakshmi Rao on 7 Oct', tone: 'info' },
  'Sravanthi Rao': { why: 'Medical leave, 8 to 20 Oct', note: 'Approved by Lakshmi Rao on 8 Oct · class teacher of 3 A', tone: 'info' },
};
const SUBS_WEEK = { 'Imran Shaikh': 1, 'Ravi Teja': 0, 'Sneha Mathew': 1, 'Nandini Joshi': 2, 'Kalyani Sastry': 2, 'Srinivas Chary': 1, 'Naresh Chary': 3, 'Mohammed Asif': 2, 'Karthik Menon': 1, 'Prasad Varma': 1, 'Rukmini Devi': 0, 'Pallavi Reddy': 1, 'Lalitha Devi': 1, 'Mahesh Goud': 0, 'Shobha Rani': 1, 'Deepak Verma': 0, 'Arvind Rao': 0, 'Bhargavi Kulkarni': 1, 'Farhana Begum': 0, 'Venkat Rao': 2, 'Rajeshwari Nair': 1 };
const SUBS_MONTH = { 'Imran Shaikh': 3, 'Ravi Teja': 1, 'Sneha Mathew': 2, 'Nandini Joshi': 4, 'Kalyani Sastry': 5, 'Srinivas Chary': 3, 'Naresh Chary': 6, 'Mohammed Asif': 4, 'Karthik Menon': 2, 'Prasad Varma': 2, 'Venkat Rao': 3 };

function busyAt(name, d, p, subs = SUB0) {
  const w = weekFor(name)[d][p];
  if (w) return w;
  if (d === TODAY_D) { const s = subs.find((x) => x.sub === name && x.p === p); if (s) return { cls: s.cls, subj: s.subj, sub: true }; }
  return null;
}
const teachesClass = (name, cls) => weekFor(name).some((row) => row.some((c) => c?.cls === cls));
function suggest(d, ps, cls, subj, subs, away) {
  return TEACHERS.filter((t) => !away.includes(t.n) && ps.every((p) => !busyAt(t.n, d, p, subs)))
    .map((t) => {
      const same = t.s === subj; const known = teachesClass(t.n, cls); const wk = SUBS_WEEK[t.n] || 0;
      return { t, score: (same ? 100 : 0) + (known ? 10 : 0) - wk, why: [same && `Teaches ${subj}`, known && `Teaches ${cls}`, `${wk} ${wk === 1 ? 'substitution' : 'substitutions'} this week`].filter(Boolean) };
    })
    .sort((a, b) => b.score - a.score || a.t.load - b.t.load);
}

/* =====================================================================================
   Small shared pieces
   ===================================================================================== */

const toneOfSubj = (s) => TONE_OF[s] || 'neutral';
function SegScroll({ children }) {
  return <div className="overflow-x-auto no-scrollbar -mx-1 px-1 max-w-full">{children}</div>;
}
function DateField({ id, label, value, onChange, error, hint, required }) {
  return (
    <Field label={label} id={id} error={error} hint={hint} required={required}>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder="DD-MM-YYYY" inputMode="numeric" error={error} className="tnum" />
    </Field>
  );
}
const okDate = (v) => /^\d{2}-\d{2}-\d{4}$/.test(v.trim());
// Small controls that keep their own value (for fields in sheets that only need to look and feel real)
function SelectL({ id, init, options, className }) { const [v, setV] = useState(init); return <Select id={id} value={v} onChange={setV} options={options} className={className} />; }
function DateL({ id, label, init, hint, required }) { const [v, setV] = useState(init); return <DateField id={id} label={label} value={v} onChange={setV} hint={hint} required={required} error={v && !okDate(v) ? 'Use DD-MM-YYYY, for example 12-10-2026' : ''} />; }
function TextL({ id, rows, placeholder }) { const [v, setV] = useState(''); return <Textarea id={id} value={v} onChange={setV} rows={rows} placeholder={placeholder} />; }
function ToggleChips({ options, init }) {
  const [on, setOn] = useState(init);
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map((o) => {
        const sel = on.includes(o.value);
        return <button key={o.value} type="button" aria-pressed={sel} onClick={() => setOn(sel ? on.filter((x) => x !== o.value) : [...on, o.value])}
          className={cx('h-9 px-3 rounded-xl text-[13px] font-semibold border transition inline-flex items-center gap-1.5', sel ? 'bg-brand/10 border-brand/30 text-brand' : 'bg-surface border-line text-ink2 hover:border-ink3/50')}>{sel && <I.Check size={14} />}{o.label}</button>;
      })}
    </div>
  );
}

// One period in a week grid
function Cell({ title, sub, tone = 'neutral', onClick, now, flag, free, note, noteTone = 'brand', label }) {
  const B = onClick ? 'button' : 'div';
  if (free) {
    return (
      <B onClick={onClick} aria-label={label} className={cx('w-full h-[54px] rounded-lg border border-dashed border-line text-[12px] text-ink3 grid place-items-center', onClick && 'hover:bg-sunken/60 hover:text-ink2 transition', now && 'ring-2 ring-brand')}>
        {title || 'Free'}
      </B>
    );
  }
  return (
    <B onClick={onClick} aria-label={label}
      className={cx('relative w-full h-[54px] text-left rounded-lg pl-3 pr-2 py-1.5 transition overflow-hidden', flag ? 'bg-bad/[.07] ring-2 ring-bad' : 'bg-sunken/60',
        onClick && !flag && 'hover:bg-sunken', now && !flag && 'ring-2 ring-brand')}>
      <span className={cx('absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full', BAR[flag ? 'bad' : tone])} />
      <span className="block font-semibold text-[13px] leading-tight truncate">{title}</span>
      {sub && <span className="block text-[11.5px] text-ink3 truncate mt-0.5">{sub}</span>}
      {note && <span className={cx('block text-[11px] font-semibold truncate', noteTone === 'bad' ? 'text-bad' : noteTone === 'warn' ? 'text-warn' : 'text-brand')}>{note}</span>}
    </B>
  );
}

// The week grid: periods down the side, days across, breaks across the whole row
function WeekGrid({ cell, today = TODAY_D, minWidth = 860, showToday = true }) {
  return (
    <div className="overflow-x-auto scroll-thin">
      <table className="w-full text-[13px] border-separate border-spacing-0" style={{ minWidth }}>
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-surface text-left text-[12px] font-semibold text-ink3 pl-4 pr-3 py-2.5 border-b border-r border-line w-[92px]">Period</th>
            {DAYS_FULL.map((d, i) => (
              <th key={d} className={cx('text-left text-[12px] font-semibold px-1.5 py-2.5 border-b border-line', showToday && i === today ? 'text-brand' : 'text-ink3')}>
                {d}{showToday && i === today && <span className="ml-1.5 inline-flex h-5 px-1.5 rounded-md bg-brand/10 text-[11px] align-middle items-center">Today</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SLOTS.map((s, i) => typeof s === 'object' ? (
            <tr key={'b' + i}>
              <td className="sticky left-0 z-10 bg-surface pl-4 pr-3 py-1 text-[11.5px] text-ink3 tnum whitespace-nowrap border-r border-line">{s.t}</td>
              <td colSpan={6} className="px-1 py-1">
                <div className="h-7 rounded-lg bg-sunken/70 text-ink3 text-[12px] font-semibold flex items-center justify-start pl-3 @lg:justify-center @lg:pl-0 gap-1.5">
                  {s.icon === 'Coffee' ? <I.Coffee size={14} /> : <I.UtensilsCrossed size={14} />}{s.brk}
                </div>
              </td>
            </tr>
          ) : (
            <tr key={'p' + s}>
              <td className="sticky left-0 z-10 bg-surface pl-4 pr-3 py-1 align-middle border-r border-line">
                <p className="font-semibold text-[13px]">P{s + 1}</p>
                <p className="text-[11.5px] text-ink3 tnum whitespace-nowrap">{PT(s)}</p>
              </td>
              {DAYS.map((_, d) => <td key={d} className={cx('px-1 py-1 align-top', showToday && d === today && 'bg-brand/[.03]')}>{cell(d, s)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const GridLegend = () => (
  <Legend items={[['bg-brand', 'Maths'], ['bg-info', 'Science / EVS'], ['bg-warn', 'English'], ['bg-ink3/35', 'Other subjects']]} />
);

function BackLink({ label, sub, onClick }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink mb-3 -ml-1 h-8 px-1 rounded-lg">
      <I.ArrowLeft size={17} />{label} {sub && <span className="text-ink3 font-normal">/ {sub}</span>}
    </button>
  );
}

/* =====================================================================================
   Classes & Sections
   ===================================================================================== */

function ClassesPage({ access }) {
  const toast = useToast();
  const { go } = useNav();
  const canEdit = useCanEdit() && access === 'full';
  const [secs, setSecs] = useState(SECS);
  const [q, setQ] = useState('');
  const [lv, setLv] = useState('all');
  const [ctFor, setCtFor] = useState(null);
  const [seatsFor, setSeatsFor] = useState(null);
  const [archive, setArchive] = useState(null);
  const [addClass, setAddClass] = useState(false);
  const [addSec, setAddSec] = useState(null);
  const t = q.trim().toLowerCase();
  const seatsLeft = secs.reduce((a, s) => a + (s.seats - s.students), 0);
  const over = secs.filter((s) => s.students > s.seats);
  const noCt = secs.filter((s) => !s.ct);
  const groups = CLASSES.filter((c) => lv === 'all' || levelOf(c.id) === lv).map((c) => ({
    c, rows: secs.filter((s) => s.cls === c.id && (!t || s.label.toLowerCase().includes(t) || c.name.toLowerCase().includes(t) || (s.ct || '').toLowerCase().includes(t))),
  })).filter((g) => g.rows.length);
  const shown = groups.reduce((a, g) => a + g.rows.length, 0);
  const setCt = (key, name) => setSecs((x) => x.map((s) => (s.key === key ? { ...s, ct: name } : s)));
  const setSeats = (key, n) => setSecs((x) => x.map((s) => (s.key === key ? { ...s, seats: n } : s)));

  return (
    <div>
      <ModuleHead sub={`2026–27 · ${CLASSES.length} classes, ${secs.length} sections · CBSE for every class`}
        actions={canEdit && <>
          <Button variant="secondary" icon={I.Plus} onClick={() => setAddSec(CLASSES[0].id)}>Add section</Button>
          <Button variant="primary" icon={I.Plus} onClick={() => setAddClass(true)}>Add class</Button>
        </>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Stats items={[
          { label: 'Classes', value: CLASSES.length, sub: 'Nursery to Class 10', icon: 'School' },
          { label: 'Sections', value: secs.length, sub: `${noCt.length ? `${noCt.length} without a class teacher` : 'All have a class teacher'}`, icon: 'LayoutGrid', tone: noCt.length ? 'warn' : undefined },
          { label: 'Students', value: TOTAL_STUDENTS.toLocaleString('en-IN'), sub: 'Studying this year', icon: 'GraduationCap' },
          { label: 'Seats left', value: seatsLeft, sub: over.length ? `${over.length} ${over.length === 1 ? 'section is' : 'sections are'} over their seats` : 'No section is full', icon: 'Armchair', tone: over.length ? 'warn' : undefined },
        ]} />

        {(over.length > 0 || noCt.length > 0) && (
          <div className="flex flex-col gap-2.5">
            {over.map((s) => (
              <Banner key={s.key} tone="warn" title={`${s.label} has ${s.students} students.`}
                action={canEdit && <Button size="sm" variant="secondary" onClick={() => setSeatsFor(s)}>Change seats</Button>}>
                Seats are set to {s.seats}. Raise the seats or move students to another section.
              </Banner>
            ))}
            {noCt.map((s) => (
              <Banner key={s.key} tone="info" title={`${s.label} has no class teacher.`}
                action={canEdit && <Button size="sm" variant="secondary" onClick={() => setCtFor(s)}>Set class teacher</Button>}>
                Attendance for {s.label} is taken by the Vice Principal until one is set.
              </Banner>
            ))}
          </div>
        )}

        <Card className="overflow-hidden">
          <Toolbar>
            <SearchBox id="cls-search" value={q} onChange={setQ} placeholder="Class, section or class teacher" />
            <div className="flex gap-2 items-center">
              <Chips className="min-w-0 flex-1" value={lv} onChange={setLv} options={[{ value: 'all', label: 'All' }, ...LEVELS.map((l) => ({ value: l, label: l }))]} />
              <ExportButton what="classes and sections" />
            </div>
          </Toolbar>
          {groups.length === 0 ? (
            <Empty icon={I.SearchX} title="No class or section matches" body={`Nothing called “${q}”. Try a class teacher’s name.`} action={<Button variant="secondary" onClick={() => { setQ(''); setLv('all'); }}>Clear filters</Button>} />
          ) : (
            <div>
              <div className="hidden @lg:grid grid-cols-[minmax(0,1fr)_220px_170px_90px_52px] gap-3 px-5 py-2.5 text-[12px] font-semibold text-ink3 border-b border-line">
                <span>Section</span><span>Class teacher</span><span>Students and seats</span><span className="text-right">Seats left</span><span />
              </div>
              {groups.map(({ c, rows }) => {
                const st = rows.reduce((a, s) => a + s.students, 0);
                return (
                  <div key={c.id} className="border-b border-line/70 last:border-0">
                    <div className="flex items-center gap-2 px-3 @md:px-4 py-2.5 bg-sunken/40">
                      {canEdit && (
                        <button className="w-7 h-8 grid place-items-center rounded-md text-ink3 hover:bg-sunken cursor-grab" aria-label={`Drag to reorder ${c.name}`}
                          onClick={() => toast({ title: 'Drag the handle to change the order', body: 'The order is used in every list, register and report.', tone: 'info' })}>
                          <I.GripVertical size={16} />
                        </button>
                      )}
                      <p className="font-semibold text-[14.5px]">{c.name}</p>
                      <Pill tone="neutral" className="!h-5 !text-[11px] hidden @sm:inline-flex">{levelOf(c.id)}</Pill>
                      <span className="text-[12.5px] text-ink3 tnum truncate">{rows.length} {rows.length === 1 ? 'section' : 'sections'} · {st} students</span>
                      {canEdit && <Button size="sm" variant="ghost" icon={I.Plus} className="ml-auto" onClick={() => setAddSec(c.id)}>Section</Button>}
                    </div>
                    <ul>
                      {rows.map((s) => <SectionRow key={s.key} s={s} canEdit={canEdit} onCt={() => setCtFor(s)} onSeats={() => setSeatsFor(s)} onArchive={() => setArchive(s)}
                        onStudents={() => go('students')} onTimeTable={() => go('academic', { page: 'timetable' })} />)}
                    </ul>
                  </div>
                );
              })}
              <div className="px-4 py-3 border-t border-line text-[13px] text-ink3 tnum">Showing {shown} of {secs.length} sections</div>
            </div>
          )}
        </Card>

        <div className="grid @xl:grid-cols-2 gap-5 @lg:gap-6">
          <SettingsCard title="Streams" sub="For Classes 11 and 12, when the school adds them" icon={I.Split}
            rows={[{ title: 'Use streams', sub: 'Science, Commerce and Arts, with sections attached to a stream', on: false }]} />
          <SettingsCard title="Board per class" sub="For schools running two boards" icon={I.Award}
            rows={[{ title: 'Different board for some classes', sub: 'Off: every class follows CBSE, from Settings, School Profile. Sets grading and report card format.', on: false }]} />
        </div>
      </div>

      <ClassTeacherSheet s={ctFor} secs={secs} onClose={() => setCtFor(null)} onSave={(name) => {
        const s = ctFor; const old = s.ct; setCt(s.key, name); setCtFor(null);
        toast({ title: `${name} is now class teacher of ${s.label}`, body: 'They see the class in Take Attendance from tomorrow.', undo: () => setCt(s.key, old) });
      }} />
      <SeatsSheet s={seatsFor} onClose={() => setSeatsFor(null)} onSave={(n) => {
        const s = seatsFor; const old = s.seats; setSeats(s.key, n); setSeatsFor(null);
        toast({ title: `${s.label}: ${n} seats`, body: `${Math.max(0, n - s.students)} seats left. Admissions use this.`, undo: () => setSeats(s.key, old) });
      }} />
      <Sheet open={!!archive} onClose={() => setArchive(null)} title={archive ? `Archive ${archive.label}?` : ''} sub="Only sections with no students this year can be archived."
        footer={<><Button variant="ghost" onClick={() => setArchive(null)}>Close</Button><Button variant="secondary" icon={I.GraduationCap} onClick={() => { setArchive(null); go('students'); }}>Open students</Button></>}>
        {archive && <Banner tone="warn" title={`Move or promote the ${archive.students} students first.`}>{archive.label} still has {archive.students} students in 2026–27. Its records stay in past years after it is archived.</Banner>}
      </Sheet>
      <AddClassSheet open={addClass} onClose={() => setAddClass(false)} />
      <AddSectionSheet clsId={addSec} secs={secs} onClose={() => setAddSec(null)} />
    </div>
  );
}

function SectionRow({ s, canEdit, onCt, onSeats, onArchive, onStudents, onTimeTable }) {
  const pct = Math.round((s.students / s.seats) * 100);
  const left = s.seats - s.students;
  const menu = [['Users', 'See students', onStudents], ['CalendarRange', 'Time table', onTimeTable]];
  if (canEdit) menu.unshift(['UserCog', 'Set class teacher', onCt], ['Armchair', 'Change seats', onSeats]);
  if (canEdit) menu.push(['Archive', 'Archive section', onArchive, 'bad']);
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] @lg:grid-cols-[minmax(0,1fr)_220px_170px_90px_52px] gap-x-3 gap-y-1 items-center px-4 @md:px-5 py-3 border-t border-line/60 first:border-t-0">
      <div className="min-w-0">
        <p className="font-semibold text-[14.5px]">{s.label} <span className="text-ink3 font-normal text-[12.5px]">· {s.room}</span></p>
        <p className="text-[12.5px] text-ink3 truncate @lg:hidden">{s.ct ? `Class teacher ${s.ct}` : <span className="text-warn font-semibold">No class teacher</span>}</p>
      </div>
      <div className="hidden @lg:flex items-center gap-2.5 min-w-0">
        {s.ct ? <><Avatar name={s.ct} size={30} /><span className="text-[14px] truncate">{s.ct}</span></>
          : canEdit ? <Button size="sm" variant="soft" icon={I.UserPlus} onClick={onCt}>Set class teacher</Button> : <Pill tone="warn">Not set</Pill>}
      </div>
      <div className="hidden @lg:flex items-center gap-2.5">
        <Progress value={pct} tone={left < 0 ? 'warn' : 'brand'} className="flex-1" />
        <span className="text-[13px] tnum font-semibold w-14 text-right">{s.students}/{s.seats}</span>
      </div>
      <span className={cx('hidden @lg:block text-right tnum text-[14px] font-semibold', left < 0 ? 'text-warn' : left <= 2 ? 'text-ink2' : 'text-ink2')}>{left < 0 ? `${left}` : left}</span>
      <div className="flex items-center gap-2 justify-end">
        <span className="@lg:hidden text-right">
          <span className={cx('block text-[14px] font-semibold tnum', left < 0 && 'text-warn')}>{s.students}/{s.seats}</span>
          <span className="block text-[11.5px] text-ink3">{left < 0 ? `${-left} over` : `${left} left`}</span>
        </span>
        <MoreMenu size="sm" label={`Actions for ${s.label}`} items={menu} />
      </div>
    </li>
  );
}

const ALL_PEOPLE = [...new Set([...TEACHERS.map((t) => t.n), ...SECS.map((s) => s.ct).filter(Boolean), 'Haritha Reddy', 'Vijaya Lakshmi', 'Kusum Lata'])].sort();

function ClassTeacherSheet({ s, secs, onClose, onSave }) {
  const [q, setQ] = useState('');
  const [pick, setPick] = useState(null);
  const [err, setErr] = useState('');
  if (!s) return null;
  const dutyOf = (n) => secs.find((x) => x.ct === n && x.key !== s.key)?.label;
  const list = ALL_PEOPLE.filter((n) => !q || n.toLowerCase().includes(q.toLowerCase()));
  const save = () => {
    if (!pick) return setErr('Choose a teacher');
    const d = dutyOf(pick);
    if (d) return setErr(`${pick} is already class teacher of ${d}. A teacher has one class. Change ${d} first.`);
    onSave(pick); setPick(null); setQ(''); setErr('');
  };
  return (
    <Sheet open onClose={() => { onClose(); setPick(null); setErr(''); }} title={`Class teacher for ${s.label}`} sub={s.ct ? `Now: ${s.ct}` : 'Not set yet'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={I.Check} onClick={save}>Save</Button></>}>
      <SearchBox id="ct-search" value={q} onChange={setQ} placeholder="Search staff" />
      {err && <p className="text-[12.5px] text-bad flex items-center gap-1.5 mt-2" role="alert"><I.CircleAlert size={14} />{err}</p>}
      <ul className="mt-3 flex flex-col gap-1 max-h-[340px] overflow-y-auto scroll-thin">
        {list.map((n) => {
          const d = dutyOf(n); const on = pick === n;
          return (
            <li key={n}>
              <button onClick={() => { setPick(n); setErr(''); }} className={cx('w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left border transition', on ? 'border-brand bg-brand/5' : 'border-transparent hover:bg-sunken/70')}>
                <Avatar name={n} size={34} />
                <span className="min-w-0 flex-1"><span className="block font-semibold text-[14px] truncate">{n}</span><span className="block text-[12.5px] text-ink3 truncate">{d ? `Class teacher of ${d}` : 'No class yet'}{T_BY[n] ? ` · ${T_BY[n].s}` : ''}</span></span>
                {on && <I.CircleCheck size={18} className="text-brand shrink-0" />}
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

function SeatsSheet({ s, onClose, onSave }) {
  const [v, setV] = useState('');
  if (!s) return null;
  const val = v === '' ? String(s.seats) : v;
  const n = Number(val);
  const err = !n || n < 1 || n > 80 ? 'Enter seats between 1 and 80' : '';
  const warn = !err && n < s.students ? `${s.label} has ${s.students} students. Seats set to ${n}.` : '';
  return (
    <Sheet open onClose={() => { onClose(); setV(''); }} title={`Seats in ${s.label}`} sub={`${s.students} students now · room ${s.room}`}
      footer={<><Button variant="ghost" onClick={() => { onClose(); setV(''); }}>Cancel</Button><Button variant="primary" icon={I.Check} disabled={!!err} onClick={() => { onSave(n); setV(''); }}>Save seats</Button></>}>
      <Field label="Seats" id="seats-n" required error={err} hint={warn ? undefined : 'Admissions stop offering this section when it is full.'}>
        <Input id="seats-n" inputMode="numeric" value={val} onChange={(e) => setV(e.target.value.replace(/\D/g, '').slice(0, 2))} error={err} className="tnum" />
      </Field>
      {warn && <Banner tone="warn" className="mt-3" title="Fewer seats than students.">{warn} You can still save.</Banner>}
    </Sheet>
  );
}

function AddClassSheet({ open, onClose }) {
  const toast = useToast();
  const [f, setF] = useState({ name: '', order: 'end', secs: 'A', seats: '40' });
  const [tried, setTried] = useState(false);
  const exists = CLASSES.some((c) => c.name.toLowerCase() === f.name.trim().toLowerCase() || c.id === f.name.trim());
  const err = { name: !f.name.trim() ? 'Enter a class name' : exists ? `${f.name.trim()} already exists in 2026–27` : '', secs: !f.secs.trim() ? 'Add at least one section' : '' };
  const guess = /11|12/.test(f.name) ? 'Senior secondary' : /9|10/.test(f.name) ? 'Secondary' : /nur|lkg|ukg|play/i.test(f.name) ? 'Pre-primary' : /[6-8]/.test(f.name) ? 'Middle' : f.name ? 'Primary' : '—';
  const secList = f.secs.split(',').map((x) => x.trim()).filter(Boolean);
  return (
    <FormSheet open={open} onClose={() => { onClose(); setTried(false); }} title="Add class" sub="Any name works, for example Class 11 or a 7:00 to 8:00 batch." submitLabel="Add class"
      onSubmit={() => { setTried(true); if (err.name || err.secs) return false; toast({ title: `${f.name.trim()} added with ${secList.length} ${secList.length === 1 ? 'section' : 'sections'}`, body: `${secList.join(', ')} · ${f.seats} seats each · level ${guess}` }); setF({ name: '', order: 'end', secs: 'A', seats: '40' }); setTried(false); }}>
      <Field label="Class name" id="ac-name" required error={tried && err.name}>
        <Input id="ac-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={tried && err.name} placeholder="Class 11" autoComplete="off" />
      </Field>
      <div className="grid @sm:grid-cols-2 gap-3">
        <Field label="Order" id="ac-order" required><Select id="ac-order" value={f.order} onChange={(v) => setF({ ...f, order: v })} options={[{ value: 'end', label: 'After Class 10' }, ...CLASSES.map((c) => ({ value: c.id, label: `Before ${c.name}` }))]} /></Field>
        <Field label="Level" id="ac-level" hint="Guessed from the name. Used to group reports."><Input id="ac-level" value={guess} readOnly className="text-ink2" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sections" id="ac-secs" required error={tried && err.secs} hint="Type A, B, C to add several"><Input id="ac-secs" value={f.secs} onChange={(e) => setF({ ...f, secs: e.target.value.toUpperCase() })} error={tried && err.secs} /></Field>
        <Field label="Seats per section" id="ac-seats"><Input id="ac-seats" inputMode="numeric" value={f.seats} onChange={(e) => setF({ ...f, seats: e.target.value.replace(/\D/g, '').slice(0, 2) })} className="tnum" /></Field>
      </div>
      <p className="text-[12.5px] text-ink3">Board: CBSE, from Settings, School Profile. A different board per class shows here only when the school runs two boards.</p>
    </FormSheet>
  );
}

function AddSectionSheet({ clsId, secs, onClose }) {
  const toast = useToast();
  const [cls, setCls] = useState(null);
  const [f, setF] = useState({ name: '', seats: '', ct: '', room: '' });
  if (!clsId) return null;
  const c = CLASSES.find((x) => x.id === (cls || clsId));
  const have = secs.filter((s) => s.cls === c.id).map((s) => s.sec);
  const next = String.fromCharCode(Math.max(...have.map((x) => x.charCodeAt(0))) + 1);
  const name = f.name || next;
  const dup = have.includes(name.trim().toUpperCase());
  const freeTeachers = ALL_PEOPLE.filter((n) => !secs.some((s) => s.ct === n));
  const close = () => { onClose(); setCls(null); setF({ name: '', seats: '', ct: '', room: '' }); };
  return (
    <FormSheet open onClose={close} title="Add section" sub={`${c.name} has ${have.join(', ')} now.`} submitLabel="Add section"
      onSubmit={() => { if (dup) return false; toast({ title: `${isPre(c.id) ? c.name : c.id} ${name.trim().toUpperCase()} added`, body: `${f.seats || (levelOf(c.id) === 'Pre-primary' ? 30 : 40)} seats${f.ct ? ` · class teacher ${f.ct}` : ''}` }); setCls(null); setF({ name: '', seats: '', ct: '', room: '' }); }}>
      <Field label="Class" id="as2-cls" required><Select id="as2-cls" value={c.id} onChange={(v) => { setCls(v); setF({ ...f, name: '' }); }} options={CLASSES.map((x) => ({ value: x.id, label: x.name }))} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Section name" id="as2-name" required error={dup ? `${name.toUpperCase()} already exists in ${c.name}` : ''}><Input id="as2-name" value={name} onChange={(e) => setF({ ...f, name: e.target.value.toUpperCase().slice(0, 3) })} error={dup} /></Field>
        <Field label="Seats" id="as2-seats" hint="The class’s default"><Input id="as2-seats" inputMode="numeric" value={f.seats} placeholder={levelOf(c.id) === 'Pre-primary' ? '30' : '40'} onChange={(e) => setF({ ...f, seats: e.target.value.replace(/\D/g, '').slice(0, 2) })} className="tnum" /></Field>
      </div>
      <Field label="Class teacher" id="as2-ct" hint="Only teachers without a class are listed"><Select id="as2-ct" value={f.ct} onChange={(v) => setF({ ...f, ct: v })} options={[{ value: '', label: 'Choose later' }, ...freeTeachers.map((n) => ({ value: n, label: n }))]} /></Field>
      <Field label="Room" id="as2-room" hint="Used by the room view of the Time Table"><Input id="as2-room" value={f.room} onChange={(e) => setF({ ...f, room: e.target.value })} placeholder="Room 212" /></Field>
    </FormSheet>
  );
}

/* =====================================================================================
   Subjects
   ===================================================================================== */

const SUBJECT_LIST = [
  ...SUBJECTS.map((n) => ({
    n, code: { English: 'ENG', Telugu: 'TEL', Hindi: 'HIN', Mathematics: 'MAT', Science: 'SCI', 'Social Studies': 'SST', Computers: 'CMP', 'Physical Education': 'PHE', Art: 'ART', Music: 'MUS' }[n],
    type: 'Core',
    where: { English: 'Nursery to Class 10', Telugu: 'Classes 1 to 8', Hindi: 'Classes 1 to 8', Mathematics: 'Nursery to Class 10', Science: 'Classes 6 to 10', 'Social Studies': 'Classes 6 to 10', Computers: 'Classes 1 to 8', 'Physical Education': 'Nursery to Class 10', Art: 'Nursery to Class 10', Music: 'Nursery to Class 8' }[n],
    secs: { English: 43, Telugu: 32, Hindi: 32, Mathematics: 43, Science: 15, 'Social Studies': 15, Computers: 29, 'Physical Education': 43, Art: 43, Music: 37 }[n],
  })),
  { n: 'EVS', code: 'EVS', type: 'Core', where: 'Classes 1 to 5', secs: 20 },
  { n: 'Life skills', code: 'LSK', type: 'Core', where: 'Classes 1 to 10', secs: 35 },
  { n: 'Telugu (second language)', code: 'TEL-2', type: 'Optional', where: 'Classes 9 and 10', secs: 6, note: 'Students choose Telugu or Hindi' },
  { n: 'Hindi (second language)', code: 'HIN-2', type: 'Optional', where: 'Classes 9 and 10', secs: 6, note: 'Students choose Telugu or Hindi' },
  { n: 'Information Technology (402)', code: 'IT-402', type: 'Elective', where: 'Classes 9 and 10', secs: 6, note: 'Skill subject, CBSE code 402' },
  { n: 'Artificial Intelligence (417)', code: 'AI-417', type: 'Elective', where: 'Classes 9 and 10', secs: 6, note: 'Skill subject, CBSE code 417' },
];
const TYPE_TONE = { Core: 'neutral', Optional: 'info', Elective: 'brand' };
const PPW = { English: 7, Telugu: 5, Hindi: 5, Mathematics: 7, Science: 7, 'Social Studies': 6, Computers: 3, 'Physical Education': 3, Art: 2, Music: 1, 'Life skills': 1, Library: 1 };
const CLASS_MAP = {
  '7': Object.entries(PPW).map(([n, p]) => ({ n, p, from: '01-06-2026', to: '' })),
  '8': [...Object.entries(PPW).filter(([n]) => n !== 'Music').map(([n, p]) => ({ n, p, from: '01-06-2026', to: '' })), { n: 'Music', p: 1, from: '01-06-2026', to: '31-10-2026', note: 'Replaced by a second Art period from 02-11-2026' }],
  '9': [['English', 6], ['Telugu (second language)', 5], ['Hindi (second language)', 5], ['Mathematics', 9], ['Science', 10], ['Social Studies', 8], ['Information Technology (402)', 3], ['Artificial Intelligence (417)', 3], ['Physical Education', 3], ['Art', 2], ['Life skills', 1], ['Library', 1]].map(([n, p]) => ({ n, p, from: '01-06-2026', to: '' })),
  '3': [['English', 8], ['Telugu', 5], ['Hindi', 5], ['Mathematics', 8], ['EVS', 7], ['Computers', 2], ['Physical Education', 4], ['Art', 3], ['Music', 2], ['Library', 2], ['Life skills', 2]].map(([n, p]) => ({ n, p, from: '01-06-2026', to: '' })),
};
const CHOICE_GROUPS = [
  { title: 'Second language · Classes 9 and 10', total: 193, items: [{ n: 'Telugu', seats: 140, chose: 121 }, { n: 'Hindi', seats: 80, chose: 68 }], missing: 4 },
  { title: 'Skill subject · Classes 9 and 10', total: 193, items: [{ n: 'Information Technology (402)', seats: 120, chose: 118 }, { n: 'Artificial Intelligence (417)', seats: 80, chose: 69 }], missing: 6 },
];
const NOT_CHOSEN = STUDENTS.filter((s) => ['9', '10'].includes(s.clsId)).slice(0, 6);

function SubjectsPage({ access }) {
  const toast = useToast();
  const canEdit = useCanEdit() && access === 'full';
  const [view, setView] = useState('all');
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [cls, setCls] = useState('7');
  const [add, setAdd] = useState(false);
  const [copy, setCopy] = useState(false);
  const [map, setMap] = useState(null);
  const [choices, setChoices] = useState(false);
  const rows = SUBJECT_LIST.filter((s) => (type === 'all' || s.type === type) && (!q || s.n.toLowerCase().includes(q.toLowerCase()) || s.code.toLowerCase().includes(q.toLowerCase())));
  const clsRows = CLASS_MAP[cls] || CLASS_MAP['7'];
  return (
    <div>
      <ModuleHead sub={`${SUBJECT_LIST.length} subjects · mapped to 43 sections · CBSE`}
        actions={canEdit && <>
          <Button variant="secondary" icon={I.Copy} onClick={() => setCopy(true)}>Copy subject map</Button>
          <Button variant="primary" icon={I.Plus} onClick={() => setAdd(true)}>Add subject</Button>
        </>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <SegScroll><Segmented value={view} onChange={setView} options={[{ value: 'all', label: 'All subjects' }, { value: 'class', label: 'By class' }, { value: 'choices', label: 'Student choices' }]} /></SegScroll>

        {view === 'all' && (
          <Card className="overflow-hidden">
            <Toolbar>
              <SearchBox id="subj-search" value={q} onChange={setQ} placeholder="Subject name or code" />
              <div className="flex gap-2">
                <Segmented value={type} onChange={setType} options={[{ value: 'all', label: 'All' }, 'Core', 'Optional', 'Elective']} />
                <ExportButton what="subjects" />
              </div>
            </Toolbar>
            <DataList rows={rows} rowKey={(r) => r.code} minWidth={680}
              onRow={canEdit ? (r) => setMap(r) : undefined}
              columns={[
                { key: 'n', label: 'Subject', render: (r) => <div><p className="font-semibold">{r.n}</p>{r.note && <p className="text-[12.5px] text-ink3">{r.note}</p>}</div> },
                { key: 'code', label: 'Code', render: (r) => <span className="font-mono text-[12.5px]">{r.code}</span> },
                { key: 'type', label: 'Type', render: (r) => <Pill tone={TYPE_TONE[r.type]}>{r.type}</Pill> },
                { key: 'where', label: 'Taught in', nowrap: true },
                { key: 'secs', label: 'Sections', align: 'right' },
              ]}
              mobile={(r) => ({ title: r.n, sub: `${r.code} · ${r.where}`, icon: 'BookOpen', iconTone: r.type === 'Core' ? 'neutral' : r.type === 'Optional' ? 'info' : 'brand', right: <Pill tone={TYPE_TONE[r.type]} className="!h-[22px] !text-[11.5px]">{r.type}</Pill> })}
              footer={`Showing ${rows.length} of ${SUBJECT_LIST.length} subjects`} />
          </Card>
        )}

        {view === 'class' && (
          <Card className="overflow-hidden">
            <CardHead title={`Subjects in ${CLASSES.find((c) => c.id === cls).name}`} sub="Every section of the class, unless a section is named. Dates keep history when a subject changes mid-year."
              action={canEdit && <Button size="sm" variant="soft" icon={I.Plus} onClick={() => setMap({ n: '', code: '' })}>Map a subject</Button>} />
            <div className="px-5 pb-3"><Chips value={cls} onChange={setCls} options={[{ value: '3', label: 'Class 3' }, { value: '7', label: 'Class 7' }, { value: '8', label: 'Class 8' }, { value: '9', label: 'Class 9' }]} /></div>
            <DataList rows={clsRows} rowKey={(r) => r.n} minWidth={620} bp="md"
              columns={[
                { key: 'n', label: 'Subject', render: (r) => <div><p className="font-semibold">{r.n}</p>{r.note && <p className="text-[12.5px] text-warn">{r.note}</p>}</div> },
                { key: 'p', label: 'Periods a week', align: 'right' },
                { key: 'from', label: 'From', render: (r) => <span className="tnum">{r.from}</span> },
                { key: 'to', label: 'To', render: (r) => r.to ? <Pill tone="warn">{r.to}</Pill> : <span className="text-ink3">Still taught</span> },
              ]}
              mobile={(r) => ({ title: r.n, sub: `${r.p} periods a week · from ${r.from}${r.to ? ` to ${r.to}` : ''}`, icon: 'BookOpen', right: r.to ? <Pill tone="warn" className="!h-[22px] !text-[11.5px]">Ends {r.to.slice(0, 5)}</Pill> : null })}
              footer={`${clsRows.length} subjects · ${clsRows.reduce((a, r) => a + r.p, 0)} periods a week`} />
          </Card>
        )}

        {view === 'choices' && (
          <div className="grid @xl:grid-cols-2 gap-5 @lg:gap-6">
            {CHOICE_GROUPS.map((g) => (
              <Card key={g.title}>
                <CardHead title={g.title} sub={`${g.total - g.missing} of ${g.total} students have chosen`} icon={I.ListChecks}
                  action={g.missing > 0 && <Pill tone="warn">{g.missing} not chosen</Pill>} />
                <ul className="px-5 pb-3 flex flex-col gap-3.5">
                  {g.items.map((it) => (
                    <li key={it.n}>
                      <div className="flex items-baseline justify-between gap-3 text-[14px]"><span className="font-semibold truncate">{it.n}</span><span className="tnum text-ink2 shrink-0">{it.chose} of {it.seats} seats</span></div>
                      <Progress value={(it.chose / it.seats) * 100} tone={it.chose >= it.seats ? 'warn' : 'brand'} className="mt-1.5" />
                    </li>
                  ))}
                </ul>
                <div className="px-5 pb-5 flex gap-2 flex-wrap">
                  {canEdit && <Button size="sm" variant="soft" icon={I.UserCheck} onClick={() => setChoices(true)}>Record choices</Button>}
                  <Button size="sm" variant="ghost" icon={I.Eye} onClick={() => setChoices(true)}>See who has not chosen</Button>
                </div>
              </Card>
            ))}
            <Banner tone="info" className="@xl:col-span-2" title="Prerequisite:">Artificial Intelligence (417) needs 60% or more in Class 8 Mathematics. Students below it are not offered the seat.</Banner>
          </div>
        )}
      </div>

      <FormSheet open={add} onClose={() => setAdd(false)} title="Add subject" submitLabel="Add subject" onSubmit={() => toast({ title: 'Subject added', body: 'Map it to classes when you are ready.' })}>
        <AddSubjectFields />
      </FormSheet>
      <FormSheet open={copy} onClose={() => setCopy(false)} title="Copy subject map" sub="Adds the subjects of one class to others. Nothing already there is removed." submitLabel="Copy to 2 classes"
        onSubmit={() => toast({ title: 'Copied 12 subjects from Class 7 to Classes 6 and 8', body: 'Periods a week copied too. Nothing was removed.' })}>
        <Field label="Copy from" id="cp-from" required><SelectL id="cp-from" init="7" options={CLASSES.map((c) => ({ value: c.id, label: c.name }))} /></Field>
        <Field label="Copy to" id="cp-to" required hint="Tap to tick or untick"><ToggleChips init={['6', '8']} options={CLASSES.filter((c) => c.id !== '7').map((c) => ({ value: c.id, label: c.name }))} /></Field>
      </FormSheet>
      <MapSheet subj={map} onClose={() => setMap(null)} />
      <ChoicesSheet open={choices} onClose={() => setChoices(false)} canEdit={canEdit} />
    </div>
  );
}

function AddSubjectFields() {
  const [n, setN] = useState('');
  const [t, setT] = useState('Core');
  const code = n.trim() ? n.trim().replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() : '';
  return (
    <>
      <Field label="Subject name" id="sb-name" required><Input id="sb-name" value={n} onChange={(e) => setN(e.target.value)} placeholder="Sanskrit" /></Field>
      <Field label="Code" id="sb-code" hint="Made from the name. Must be unique."><Input id="sb-code" value={code} readOnly className="font-mono" placeholder="SAN" /></Field>
      <Field label="Type" id="sb-type" required><Segmented value={t} onChange={setT} options={['Core', 'Optional', 'Elective']} className="w-full" /></Field>
      <Field label="Classes" id="sb-cls" hint="Can be mapped later"><Input id="sb-cls" placeholder="Classes 6 to 8" /></Field>
    </>
  );
}

function MapSheet({ subj, onClose }) {
  const toast = useToast();
  const [secs, setSecs] = useState('all');
  if (!subj) return null;
  return (
    <FormSheet open onClose={onClose} title={subj.n ? `Map ${subj.n}` : 'Map a subject'} sub="Choose where it is taught and from when." submitLabel="Save map"
      onSubmit={() => toast({ title: `${subj.n || 'Subject'} mapped from 12-10-2026`, body: 'Earlier marks and homework stay linked to the old map.' })}>
      {!subj.n && <Field label="Subject" id="mp-subj" required><SelectL id="mp-subj" init="Music" options={SUBJECT_LIST.map((s) => s.n)} /></Field>}
      <Field label="Class" id="mp-cls" required><SelectL id="mp-cls" init="8" options={CLASSES.map((c) => ({ value: c.id, label: c.name }))} /></Field>
      <Field label="Sections" id="mp-secs"><Segmented value={secs} onChange={setSecs} options={[{ value: 'all', label: 'All sections' }, { value: 'some', label: 'Some sections' }]} className="w-full" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <DateL id="mp-from" label="From" required init="12-10-2026" />
        <DateL id="mp-to" label="To" init="" hint="Only when it stops" />
      </div>
    </FormSheet>
  );
}

function ChoicesSheet({ open, onClose, canEdit }) {
  const toast = useToast();
  const [ch, setCh] = useState({});
  const done = Object.keys(ch).length;
  return (
    <Sheet open={open} onClose={onClose} title="Students who have not chosen" sub="Classes 9 and 10 · second language and skill subject"
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button>{canEdit && <Button variant="primary" icon={I.Check} disabled={!done} onClick={() => { onClose(); toast({ title: `Saved ${done} ${done === 1 ? 'choice' : 'choices'}`, body: 'Shown on each student’s profile and used by Exams.' }); setCh({}); }}>Save {done || ''} {done === 1 ? 'choice' : 'choices'}</Button>}</>}>
      <ul className="flex flex-col divide-y divide-line/70">
        {NOT_CHOSEN.map((s) => (
          <li key={s.id} className="py-3 flex flex-col @sm:flex-row @sm:items-center gap-2.5">
            <div className="flex items-center gap-3 min-w-0 flex-1"><Avatar name={s.name} size={36} /><div className="min-w-0"><p className="font-semibold text-[14px] truncate">{s.name}</p><p className="text-[12.5px] text-ink3">{s.clsId} {s.sec} · <span className="font-mono">{s.adm}</span></p></div></div>
            {canEdit ? <Segmented size="sm" value={ch[s.id] || ''} onChange={(v) => setCh({ ...ch, [s.id]: v })} options={[{ value: 'IT', label: 'IT 402' }, { value: 'AI', label: 'AI 417' }]} /> : <Pill tone="warn">Not chosen</Pill>}
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

/* =====================================================================================
   Teacher Allocation
   ===================================================================================== */

const ALLOC_COLS = {
  senior: ['English', 'Telugu', 'Hindi', 'Mathematics', 'Science', 'Social Studies', 'Computers', 'Physical Education', 'Art', 'Music'],
  primary: ['English', 'Mathematics', 'EVS', 'Telugu', 'Hindi', 'Computers', 'Physical Education', 'Art', 'Music'],
};
const firstShort = (n) => { if (!n) return n; if (n.includes(' / ')) return n.split(' / ').map((x) => x.split(' ')[0]).join(' / '); const [a, b] = n.split(' '); return b ? `${a} ${b[0]}.` : a; };

function AllocationPage({ access }) {
  const toast = useToast();
  const canEdit = useCanEdit() && access === 'full';
  const [view, setView] = useState('class');
  const [band, setBand] = useState('6-8');
  const [q, setQ] = useState('');
  const [subj, setSubj] = useState('all');
  const [assign, setAssign] = useState(null);
  const [who, setWho] = useState(null);
  const bandSecs = SECS.filter((s) => (band === '6-8' ? s.level === 'Middle' : band === '9-10' ? s.level === 'Secondary' : s.level === 'Primary'));
  const cols = band === '1-5' ? ALLOC_COLS.primary : ALLOC_COLS.senior;
  const gaps = SENIOR.flatMap((l) => ALLOC_COLS.senior.filter((c) => teacherOf(l, c) === null).map((c) => `${l} ${c}`));
  const over = TEACHERS.filter((t) => t.load > 32);
  const tRows = TEACHERS.filter((t) => (subj === 'all' || t.s === subj) && (!q || t.n.toLowerCase().includes(q.toLowerCase()) || t.cls.toLowerCase().includes(q.toLowerCase())));
  return (
    <div>
      <ModuleHead sub="Who teaches what in 2026–27. Allocations carry over to the next year until changed."
        actions={canEdit && <Button variant="primary" icon={I.UserPlus} onClick={() => setAssign({})}>Assign teacher</Button>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Stats items={[
          { label: 'Allocations', value: 96, sub: 'Classes 6 to 10', icon: 'Network' },
          { label: 'Subjects without a teacher', value: gaps.length, sub: gaps.join(', '), tone: gaps.length ? 'warn' : 'ok', icon: 'CircleAlert' },
          { label: 'Over the limit', value: over.length, sub: over.map((t) => `${firstShort(t.n)} ${t.load} of 32`).join(', ') || 'Nobody', tone: over.length ? 'warn' : 'ok', icon: 'Gauge' },
          { label: 'Average load', value: '28', sub: 'Periods a week, limit 32', icon: 'Clock' },
        ]} />
        <SegScroll><Segmented value={view} onChange={setView} options={[{ value: 'class', label: 'By class' }, { value: 'teacher', label: 'By teacher' }]} /></SegScroll>

        {view === 'class' ? (
          <Card className="overflow-hidden">
            <div className="flex flex-col @md:flex-row @md:items-center gap-3 justify-between px-5 pt-4 pb-3">
              <div><h3 className="font-semibold text-[15px]">Subject teachers</h3><p className="text-[13px] text-ink3">{canEdit ? 'Tap a box to assign or change. Second teachers are shown under the first.' : 'Second teachers are shown under the first.'}</p></div>
              <Segmented size="sm" value={band} onChange={setBand} options={[{ value: '1-5', label: 'Classes 1–5' }, { value: '6-8', label: 'Classes 6–8' }, { value: '9-10', label: 'Classes 9–10' }]} />
            </div>
            <div className="overflow-x-auto scroll-thin border-t border-line">
              <table className="text-[13px] border-separate border-spacing-0" style={{ minWidth: 150 + cols.length * 118 }}>
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-surface text-left font-semibold text-[12px] text-ink3 pl-5 pr-3 py-2.5 border-b border-r border-line w-[140px]">Section</th>
                    {cols.map((c) => <th key={c} className="text-left font-semibold text-[12px] text-ink3 px-1.5 py-2.5 border-b border-line whitespace-nowrap">{short(c)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {bandSecs.map((s) => (
                    <tr key={s.key}>
                      <td className="sticky left-0 z-10 bg-surface pl-5 pr-3 py-1 border-r border-line/70">
                        <p className="font-semibold">{s.label}</p><p className="text-[11.5px] text-ink3 truncate">{s.ct ? `CT ${firstShort(s.ct)}` : 'No class teacher'}</p>
                      </td>
                      {cols.map((c) => {
                        const subjName = s.level === 'Secondary' && c === 'Music' ? 'Music' : c;
                        const tn = teacherOf(s.label, subjName);
                        const sec = secondOf(s.label, subjName);
                        const na = tn === 'na';
                        const B = canEdit && !na ? 'button' : 'div';
                        return (
                          <td key={c} className="px-1 py-1">
                            {na ? <div className="h-[46px] rounded-lg grid place-items-center text-ink3 text-[12px]">Not taught</div> : (
                              <B onClick={canEdit ? () => setAssign({ sec: s.label, subj: c, teacher: tn }) : undefined}
                                className={cx('w-full h-[46px] text-left rounded-lg px-2 py-1 transition', tn ? 'bg-sunken/60' : 'bg-warn/12 ring-1 ring-warn/40', B === 'button' && 'hover:bg-sunken')}>
                                {tn ? <><span className="block font-semibold text-[12.5px] truncate">{firstShort(tn)}</span>{sec && <span className="block text-[11px] text-ink3 truncate">+ {firstShort(sec)}</span>}{!sec && tn === s.ct && <span className="block text-[11px] text-ink3">Class teacher</span>}</>
                                  : <span className="flex items-center gap-1 text-warn font-semibold text-[12px]"><I.TriangleAlert size={13} />No teacher</span>}
                              </B>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3 border-t border-line text-[12.5px] text-ink3">{band === '1-5' ? 'In Classes 1 to 5 the class teacher teaches English, Maths and EVS.' : band === '9-10' ? 'Science in 9 and 10: Farhana Begum (Physics, Chemistry) with Bhargavi Kulkarni (Biology) as second teacher.' : 'Same people as step 3 of Add Staff in Staff & HR.'}</div>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <Toolbar>
              <SearchBox id="tw-search" value={q} onChange={setQ} placeholder="Teacher or class" />
              <div className="flex gap-2"><Select id="tw-subj" value={subj} onChange={setSubj} className="@md:w-52" options={[{ value: 'all', label: 'All subjects' }, ...[...new Set(TEACHERS.map((t) => t.s))].map((s) => ({ value: s, label: s }))]} /><ExportButton what="teacher workload" /></div>
            </Toolbar>
            <DataList rows={tRows} rowKey={(r) => r.n} onRow={(r) => setWho(r)} minWidth={720}
              columns={[
                { key: 'n', label: 'Teacher', render: (r) => <div className="flex items-center gap-3"><Avatar name={r.n} size={34} /><div><p className="font-semibold leading-tight">{r.n}</p><p className="text-[12.5px] text-ink3">{r.d}{ctOf(r.n) ? ` · class teacher ${ctOf(r.n)}` : ''}</p></div></div> },
                { key: 'cls', label: 'Classes', render: (r) => <span className="text-ink2">{r.cls}</span> },
                { key: 'load', label: 'Periods a week', render: (r) => <div className="flex items-center gap-2.5 w-44"><Progress value={(r.load / 32) * 100} tone={r.load > 32 ? 'warn' : 'brand'} className="flex-1" /><span className={cx('text-[13px] font-semibold tnum whitespace-nowrap', r.load > 32 && 'text-warn')}>{r.load} of 32</span></div> },
                { key: 'st', label: 'Status', render: (r) => r.load > 32 ? <Pill tone="warn">Over limit</Pill> : r.load >= 30 ? <Pill tone="neutral">Nearly full</Pill> : <Pill tone="ok">Has room</Pill> },
              ]}
              mobile={(r) => ({ avatar: r.n, title: r.n, sub: `${r.s} · ${r.cls}`, right: <span className={cx('text-[13px] font-semibold tnum', r.load > 32 && 'text-warn')}>{r.load}/32</span> })}
              footer={`Showing ${tRows.length} of ${TEACHERS.length} subject teachers`} />
          </Card>
        )}
      </div>
      <AssignSheet a={assign} onClose={() => setAssign(null)} />
      <Sheet open={!!who} onClose={() => setWho(null)} title={who?.n} sub={who ? `${who.d} · ${who.load} of 32 periods a week` : ''} wide
        footer={<><Button variant="ghost" onClick={() => setWho(null)}>Close</Button>{canEdit && <Button variant="secondary" icon={I.Pencil} onClick={() => { const n = who.n; setWho(null); setAssign({ teacher: n }); }}>Change from a date</Button>}</>}>
        {who && (
          <div className="flex flex-col gap-4">
            {who.load > 32 && <Banner tone="warn" title={`${who.n}: ${who.load} periods, limit 32.`}>Move one class to someone with room, or keep it with a reason.</Banner>}
            <ul className="divide-y divide-line/70 rounded-xl border border-line">
              {(teachesList(who.n).length ? [...new Set([...(teacherOf('7 B', who.s) === who.n ? ['7 B'] : []), ...teachesList(who.n)])] : ['Classes 1–10']).map((c) => (
                <li key={c} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[14px]"><span className="font-semibold">{c}</span><span className="text-ink3">{who.s} · Primary teacher · from 01-06-2026</span></li>
              ))}
            </ul>
            <p className="text-[12.5px] text-ink3">History is kept. A change from a date leaves earlier marks and homework with the old teacher.</p>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function AssignSheet({ a, onClose }) {
  const toast = useToast();
  const [f, setF] = useState(null);
  const [tried, setTried] = useState(false);
  if (!a) return null;
  const v = f || { sec: a.sec || '7 B', subj: a.subj || T_BY[a.teacher]?.s || 'Mathematics', teacher: a.teacher && a.teacher !== 'na' ? a.teacher : '', role: 'Primary', ppw: '', from: '09-10-2026', reason: '' };
  const set = (k, val) => setF({ ...v, [k]: val });
  const t = T_BY[v.teacher];
  const add = Number(v.ppw || PPW[v.subj] || 6);
  const overBy = t ? t.load + add - 32 : 0;
  const err = { teacher: !v.teacher ? 'Choose a teacher' : '', from: !okDate(v.from) ? 'Use DD-MM-YYYY, for example 12-10-2026' : '', reason: overBy > 0 && !v.reason.trim() ? 'Say why, or choose someone with room' : '' };
  const close = () => { onClose(); setF(null); setTried(false); };
  return (
    <FormSheet open onClose={close} title="Assign teacher" sub={a.sec ? `${a.sec} · ${a.subj}` : 'Class, subject and teacher'} submitLabel="Assign"
      onSubmit={() => { setTried(true); if (Object.values(err).some(Boolean)) return false; toast({ title: `${v.teacher} teaches ${v.subj} in ${v.sec} from ${v.from}`, body: `${v.role} teacher · ${add} periods a week. History kept.` }); setF(null); setTried(false); }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Class and section" id="at-sec" required><Select id="at-sec" value={v.sec} onChange={(x) => set('sec', x)} options={[...SENIOR, 'All sections of Class 7']} /></Field>
        <Field label="Subject" id="at-subj" required><Select id="at-subj" value={v.subj} onChange={(x) => set('subj', x)} options={ALLOC_COLS.senior} /></Field>
      </div>
      <Field label="Teacher" id="at-teacher" required error={tried && err.teacher} hint="Each teacher’s current load is shown">
        <Select id="at-teacher" value={v.teacher} onChange={(x) => set('teacher', x)} error={tried && err.teacher}
          options={[{ value: '', label: 'Choose a teacher' }, ...TEACHERS.filter((x) => x.s === v.subj).concat(TEACHERS.filter((x) => x.s !== v.subj)).map((x) => ({ value: x.n, label: `${x.n} · ${x.s} · ${x.load} of 32` }))]} />
      </Field>
      {overBy > 0 && (
        <>
          <Banner tone="warn" title={`${v.teacher}: ${t.load + add} periods, limit 32.`}>Choose someone with room, or save with a reason.</Banner>
          <Field label="Reason" id="at-reason" required error={tried && err.reason}><Input id="at-reason" value={v.reason} onChange={(e) => set('reason', e.target.value)} error={tried && err.reason} placeholder="Only teacher for this subject until the new hire joins" /></Field>
        </>
      )}
      <Field label="Role" id="at-role" required><Segmented value={v.role} onChange={(x) => set('role', x)} options={['Primary', 'Secondary']} className="w-full" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Periods a week" id="at-ppw" hint="From the Time Table"><Input id="at-ppw" inputMode="numeric" value={v.ppw} placeholder={String(PPW[v.subj] || 6)} onChange={(e) => set('ppw', e.target.value.replace(/\D/g, '').slice(0, 2))} className="tnum" /></Field>
        <DateField id="at-from" label="From date" required value={v.from} onChange={(x) => set('from', x)} error={tried && err.from} />
      </div>
    </FormSheet>
  );
}

/* =====================================================================================
   Time Table
   ===================================================================================== */

const DRAFT_DIFF = { '7 B': { '0-6': 'PE', '0-7': 'C' }, '9 A': { '2-2': 'SS' } };
const CLASHES = [
  { id: 'c1', text: 'Karthik Menon is in 7 B and 8 A in period 7 on Thursday (Computers, computer lab).', sec: '7 B', d: 3, p: 6, fix: 'Move 8 A Computers to period 8 on Thursday' },
  { id: 'c2', text: 'Venkat Rao has 4 periods in a row on Wednesday (periods 2 to 5). The limit is 3.', sec: '9 A', d: 2, p: 2, fix: 'Swap 9 A Social Studies on Wednesday with period 7' },
];

function TimeTablePage({ access }) {
  const { role } = useRole();
  if (access === 'own' && (role.id === 'teacher' || role.id === 'classteacher')) return <MyWeek />;
  return <SchoolTimeTable access={access} />;
}

const ME_T = (roleId) => (roleId === 'teacher' ? 'Imran Shaikh' : 'Ravi Teja');
const DUTY = {
  'Imran Shaikh': { p: 4, cls: '8 A', subj: 'English', away: 'Anitha Kumari', why: 'casual leave', room: 'Room 207', ct: 'Venkat Rao', note: 'Chapter 6 reading: finish pages 72 to 74 and the vocabulary worksheet. The worksheets are on my desk in the staff room. Thank you!' },
  'Ravi Teja': { p: 6, cls: '9 A', subj: 'English', away: 'Anitha Kumari', why: 'casual leave', room: 'Room 301', ct: 'Bhargavi Kulkarni', note: 'Poem “Rain on the Roof”: read it aloud together, then questions 1 to 4 on page 30 in their notebooks.' },
};

function MyWeek() {
  const { role } = useRole();
  const { go } = useNav();
  const toast = useToast();
  const me = ME_T(role.id);
  const t = T_BY[me];
  const wk = weekFor(me);
  const duty = DUTY[me];
  const today = wk[TODAY_D];
  const now = today[NOW_P];
  const next = [3, 4, 5, 6, 7].map((p) => ({ p, c: p === duty.p ? { cls: duty.cls, subj: duty.subj, sub: true } : today[p] })).find((x) => x.c);
  return (
    <div>
      <ModuleHead sub={`Your week · ${t.s} · ${t.cls} · ${t.load} of 32 periods`}
        actions={<>
          <Button variant="secondary" icon={I.CalendarPlus} className="hidden @md:inline-flex" onClick={() => toast({ title: 'Calendar link copied', body: 'Paste it in Google or Outlook calendar. It only shows your periods and cannot change anything.' })}>Add to my calendar</Button>
          <Button variant="secondary" icon={I.Printer} onClick={() => toast({ title: 'Sent to the staff room printer', body: `${me}: week time table, 1 page with the legend`, tone: 'info' })}>Print</Button>
        </>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Banner tone="brand" icon={I.Repeat} title={`Today you also take ${duty.cls} in period ${duty.p + 1} (${PT(duty.p)}).`}
          action={<Button size="sm" variant="secondary" onClick={() => go('academic', { page: 'substitutions' })}>See details</Button>}>
          {duty.subj}, for {duty.away} ({duty.why}).
        </Banner>
        <Stats items={[
          { label: 'Now', value: now ? `${now.cls} · ${short(now.subj)}` : 'Free', sub: `Period ${NOW_P + 1} · until 11:15`, icon: 'Clock', tone: 'brand' },
          { label: 'Next', value: next ? `${next.c.cls} · ${short(next.c.subj)}` : 'Nothing', sub: next ? `${PT(next.p).split('–')[0]}${next.c.sub ? ' · substitution' : ''}` : 'Day done', icon: 'ArrowRight' },
          { label: 'Today', value: `${today.filter(Boolean).length} + 1`, sub: 'Periods and 1 substitution', icon: 'CalendarCheck2' },
          { label: 'This week', value: t.load, sub: 'of 32 periods', icon: 'CalendarRange' },
        ]} />
        <Card className="@lg:hidden">
          <CardHead title="Today, Friday" sub={`${today.filter(Boolean).length} periods and 1 substitution`} icon={I.CalendarCheck2} />
          <ul className="px-2 pb-2">
            {PERIODS.map((x, p) => {
              const c = p === duty.p ? { cls: duty.cls, subj: duty.subj, sub: true } : today[p];
              return (
                <li key={p} className={cx('flex items-center gap-3 px-3 py-2 rounded-xl', p === NOW_P && 'bg-brand/5 ring-1 ring-brand/30')}>
                  <span className="w-9 text-[13px] font-semibold">P{p + 1}</span>
                  <span className="w-[86px] text-[12.5px] text-ink3 tnum">{x.t}</span>
                  {c ? <span className="flex-1 min-w-0 text-[14px] font-semibold truncate">{c.cls} · {short(c.subj)}</span> : <span className="flex-1 text-[13.5px] text-ink3">Free</span>}
                  {c?.sub ? <Pill tone="brand" className="!h-5 !text-[11px]">Sub</Pill> : p === NOW_P ? <Pill tone="brand" className="!h-5 !text-[11px]">Now</Pill> : null}
                </li>
              );
            })}
          </ul>
        </Card>
        <Card className="overflow-hidden">
          <CardHead title="My time table" sub="Published from 15 Jun 2026 · Monday to Saturday" action={<Pill tone="ok" dot>Published</Pill>} />
          <WeekGrid cell={(d, p) => {
            if (d === TODAY_D && p === duty.p) return <Cell title={`${duty.cls} · ${short(duty.subj)}`} sub={`For ${firstShort(duty.away)}`} tone="info" note="Substitution" now={false} />;
            const c = wk[d][p];
            if (!c) return <Cell free now={d === TODAY_D && p === NOW_P} />;
            return <Cell title={c.cls} sub={c.subj} tone={toneOfSubj(c.subj)} now={d === TODAY_D && p === NOW_P} />;
          }} />
          <div className="px-5 py-3 border-t border-line flex flex-wrap items-center gap-x-4 gap-y-2"><GridLegend /><span className="text-[12.5px] text-ink3 @lg:ml-auto">Ringed: happening now (10:42 AM)</span></div>
        </Card>
        <Banner tone="info" icon={I.CalendarDays} title="Coming up:">Half-yearly exams from Mon 12 Oct replace periods for Classes 6 to 10 on exam days. Dussehra holidays 19 to 25 Oct have no periods. Your time table shows this by itself.</Banner>
      </div>
    </div>
  );
}

function SchoolTimeTable({ access }) {
  const toast = useToast();
  const { role } = useRole();
  const canEdit = useCanEdit();
  const full = access === 'full' && canEdit;
  const office = role.id === 'officestaff';
  const [view, setView] = useState('class');
  const [sec, setSec] = useState('7 B');
  const [teacher, setTeacher] = useState('Imran Shaikh');
  const [day, setDay] = useState(TODAY_D);
  const [fq, setFq] = useState('');
  const [over, setOver] = useState({}); // edits: { '7 B': { 'd-p': code | 'BRK' | 'X' } }
  const [draft, setDraft] = useState(null); // null | 'ready'
  const [version, setVersion] = useState('pub');
  const [clashes, setClashes] = useState(CLASHES);
  const [make, setMake] = useState(false);
  const [making, setMaking] = useState(false);
  const [publish, setPublish] = useState(false);
  const [edit, setEdit] = useState(null);
  const [flash, setFlash] = useState(null);
  const isDraft = draft && version === 'draft';

  const codeAt = (label, d, p) => {
    const o = over[label]?.[`${d}-${p}`];
    if (o) return o;
    if (isDraft && DRAFT_DIFF[label]?.[`${d}-${p}`]) return DRAFT_DIFF[label][`${d}-${p}`];
    return classGrid(label)[d][p];
  };
  const subToday = (label, p) => SUB0.find((s) => s.cls === label && s.p === p);
  const level = SEC[sec].level;
  const subjName = (code) => (level === 'Secondary' && code === 'C' ? SUBJ.IT : SUBJ[code]);

  const classCell = (d, p) => {
    const code = codeAt(sec, d, p);
    const now = !isDraft && d === TODAY_D && p === NOW_P;
    const open = full ? () => setEdit({ d, p, code }) : undefined;
    if (code === 'OFF') return <Cell free title="Home time" />;
    if (code === 'X') return <Cell free title={full ? 'Empty · add' : 'Empty'} onClick={open} label={`${DAYS_FULL[d]} period ${p + 1}: empty`} />;
    if (code === 'BRK') return <Cell title="Break" sub="Marked as a break" tone="neutral" onClick={open} />;
    const s = subjName(code);
    const tn = teacherOf(sec, s);
    const clash = isDraft && clashes.find((c) => c.sec === sec && c.d === d && c.p === p);
    const sub = !isDraft && d === TODAY_D ? subToday(sec, p) : null;
    return (
      <Cell title={short(s)} sub={tn === null ? undefined : tn === 'na' ? '' : firstShort(tn)} tone={toneOfSubj(s)} now={now || flash === `${d}-${p}`} flag={!!clash} onClick={open}
        label={`${DAYS_FULL[d]} period ${p + 1}: ${s}`}
        note={clash ? 'Clash' : sub ? (sub.sub ? `Today: ${firstShort(sub.sub)}` : 'Needs a substitute') : tn === null ? 'No teacher yet' : undefined}
        noteTone={clash || (sub && !sub.sub) ? 'bad' : tn === null ? 'warn' : 'brand'} />
    );
  };
  const tw = weekFor(teacher);
  const teacherCell = (d, p) => {
    const c = tw[d][p];
    const sub = d === TODAY_D ? SUB0.find((s) => s.sub === teacher && s.p === p) : null;
    if (sub) return <Cell title={`${sub.cls} · ${short(sub.subj)}`} sub={`For ${firstShort(sub.absent)}`} tone="info" note="Substitution" />;
    if (!c) return <Cell free now={d === TODAY_D && p === NOW_P} />;
    const away = d === TODAY_D && AWAY[teacher];
    const cover = away ? SUB0.find((s) => s.absent === teacher && s.p === p) : null;
    return <Cell title={c.cls} sub={c.subj} tone={toneOfSubj(c.subj)} now={d === TODAY_D && p === NOW_P}
      note={away ? (cover?.sub ? `Covered: ${firstShort(cover.sub)}` : 'On leave · needed') : undefined} noteTone={away && !cover?.sub ? 'bad' : 'brand'} />;
  };

  const makeDraft = () => {
    setMaking(true);
    setTimeout(() => { setMaking(false); setMake(false); setDraft('ready'); setVersion('draft'); setClashes(CLASHES); toast({ title: 'Draft made for 43 sections', body: '2 clashes need a person to decide. Nothing published has changed.' }); }, 1300);
  };
  const goClash = (c) => { setView('class'); setSec(c.sec); setFlash(`${c.d}-${c.p}`); setTimeout(() => setFlash(null), 2200); };

  const freeList = TEACHERS.filter((t) => !fq || t.n.toLowerCase().includes(fq.toLowerCase()) || t.s.toLowerCase().includes(fq.toLowerCase()));
  const awayOn = (n) => day === TODAY_D && (AWAY[n] || n === 'Swapna Reddy');

  return (
    <div>
      <ModuleHead sub={office ? 'Read-only. Use it to arrange substitutions for the school.' : access === 'view' ? 'View only · published time tables, Monday to Saturday, 8 periods a day' : 'Published from 15 Jun 2026 · Monday to Saturday · 8 periods a day'}
        actions={full && <>
          <Button variant="secondary" icon={I.Upload} className="hidden @md:inline-flex" onClick={() => toast({ title: 'Import a time table from Excel', body: 'Pick the filled weekly grids. Teacher and subject names are matched and clashes listed before anything is replaced.', tone: 'info' })}>Import</Button>
          <Button variant="secondary" icon={I.Printer} onClick={() => toast({ title: `Sent to the office printer: ${view === 'teacher' ? teacher : sec}`, body: 'One page per time table, with the legend and the date printed.', tone: 'info' })}>Print</Button>
        </>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        {access === 'view' && <Banner tone="info" icon={I.CalendarDays} title="Exam days:">From Mon 12 Oct the half-yearly datesheet replaces periods for Classes 6 to 10 on the days they sit a paper. No periods 19 to 25 Oct (Dussehra).</Banner>}

        <Card className="overflow-hidden">
          <div className="flex flex-col @lg:flex-row @lg:items-center gap-3 px-4 @md:px-5 pt-4 pb-3">
            <SegScroll><Segmented value={view} onChange={setView} options={[{ value: 'class', label: 'Class', icon: I.School }, { value: 'teacher', label: 'Teacher', icon: I.User }, { value: 'free', label: 'Free periods', icon: I.Coffee }]} /></SegScroll>
            <div className="flex gap-2 items-center @lg:ml-auto flex-wrap">
              {view === 'class' && <Select id="tt-class" value={sec} onChange={setSec} className="w-40" options={SECS.map((s) => s.label)} />}
              {view === 'teacher' && <Select id="tt-teacher" value={teacher} onChange={setTeacher} className="w-56" options={TEACHERS.map((t) => t.n)} />}
              {view !== 'free' && draft && <Segmented size="sm" value={version} onChange={setVersion} options={[{ value: 'pub', label: 'Published' }, { value: 'draft', label: `Draft${clashes.length ? ` · ${clashes.length} clashes` : ''}` }]} />}
            </div>
          </div>

          {isDraft && view !== 'free' && (
            <div className="mx-4 @md:mx-5 mb-3 rounded-2xl bg-warn/12 px-4 py-3">
              <div className="flex flex-col @md:flex-row @md:items-center gap-2 justify-between">
                <p className="text-[14px] text-ink2"><b className="font-semibold text-ink">Draft for Term 2, from Mon 2 Nov 2026.</b> {clashes.length ? `Clash check found ${clashes.length} ${clashes.length === 1 ? 'problem' : 'problems'}.` : 'No clashes left.'}</p>
                {full && <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => { setDraft(null); setVersion('pub'); toast({ title: 'Draft discarded', body: 'The published time table was never touched.' }); }}>Discard</Button>
                  <Button size="sm" variant="primary" icon={I.Send} disabled={clashes.length > 0} onClick={() => setPublish(true)}>Publish</Button>
                </div>}
              </div>
              {clashes.length > 0 && (
                <ul className="mt-2.5 flex flex-col gap-2">
                  {clashes.map((c) => (
                    <li key={c.id} className="flex flex-col @md:flex-row @md:items-center gap-2 rounded-xl bg-surface px-3 py-2.5 border border-line">
                      <I.TriangleAlert size={17} className="text-bad shrink-0 hidden @md:block" />
                      <div className="flex-1 min-w-0"><p className="text-[13.5px]">{c.text}</p><p className="text-[12.5px] text-ink3">Suggested fix: {c.fix}</p></div>
                      <div className="flex gap-1.5 shrink-0">
                        <Button size="sm" variant="secondary" onClick={() => goClash(c)}>Go to</Button>
                        {full && <Button size="sm" variant="soft" onClick={() => { setClashes((x) => x.filter((y) => y.id !== c.id)); toast({ title: 'Fixed in the draft', body: c.fix + '.', undo: () => setClashes((x) => [c, ...x]) }); }}>Apply fix</Button>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {clashes.length > 0 && full && <p className="text-[12.5px] text-ink3 mt-2">Publish opens once every clash is fixed.</p>}
            </div>
          )}

          {view === 'class' && (
            <>
              <div className="px-4 @md:px-5 pb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink3">
                <span>Class teacher <b className="font-semibold text-ink2">{SEC[sec].ct || 'not set'}</b></span><span>·</span><span>{SEC[sec].room}</span><span>·</span><span>{SEC[sec].students} students</span>
                {full && !isDraft && <span className="@md:ml-auto">Tap a period to change it</span>}
              </div>
              <WeekGrid cell={classCell} showToday={!isDraft} />
            </>
          )}
          {view === 'teacher' && (
            <>
              <div className="px-4 @md:px-5 pb-3 flex flex-wrap items-center gap-3">
                <span className="text-[13px] text-ink3">{T_BY[teacher].d} · {T_BY[teacher].cls}</span>
                <div className="flex items-center gap-2 @md:ml-auto w-48"><Progress value={(T_BY[teacher].load / 32) * 100} tone={T_BY[teacher].load > 32 ? 'warn' : 'brand'} className="flex-1" /><span className={cx('text-[13px] font-semibold tnum whitespace-nowrap', T_BY[teacher].load > 32 && 'text-warn')}>{T_BY[teacher].load} of 32</span></div>
              </div>
              <WeekGrid cell={teacherCell} />
            </>
          )}
          {view === 'free' && (
            <>
              <Toolbar className="border-t">
                <SearchBox id="fp-search" value={fq} onChange={setFq} placeholder="Teacher or subject" />
                <SegScroll><Segmented size="sm" value={day} onChange={setDay} options={DAYS.map((d, i) => ({ value: i, label: i === TODAY_D ? 'Today' : d }))} /></SegScroll>
              </Toolbar>
              <div className="overflow-x-auto scroll-thin">
                <table className="w-full text-[13px] border-separate border-spacing-0" style={{ minWidth: 820 }}>
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-10 bg-surface text-left text-[12px] font-semibold text-ink3 pl-4 pr-3 py-2.5 border-b border-r border-line w-[190px]">Teacher</th>
                      {PERIODS.map((x, p) => <th key={p} className="text-left text-[12px] font-semibold text-ink3 px-1 py-2.5 border-b border-line">P{p + 1}<span className="block text-[11px] font-medium tnum">{x.t.split('–')[0]}</span></th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {freeList.map((t) => (
                      <tr key={t.n}>
                        <td className="sticky left-0 z-10 bg-surface pl-4 pr-3 py-1 border-r border-line/70"><p className="font-semibold text-[13px] truncate">{t.n}</p><p className="text-[11.5px] text-ink3 truncate">{t.s}</p></td>
                        {PERIODS.map((_, p) => {
                          if (awayOn(t.n)) return <td key={p} className="px-1 py-1"><span className="h-9 rounded-lg grid place-items-center text-[11.5px] font-semibold bg-info/10 text-info">{t.n === 'Swapna Reddy' ? 'Not in' : 'Leave'}</span></td>;
                          const b = busyAt(t.n, day, p);
                          return (
                            <td key={p} className="px-1 py-1">
                              {b ? <span className={cx('h-9 rounded-lg grid place-items-center text-[12px] font-semibold', b.sub ? 'bg-brand/10 text-brand' : 'bg-sunken/70 text-ink3')}>{b.cls}{b.sub ? ' · sub' : ''}</span>
                                : <span className="h-9 rounded-lg grid place-items-center text-[12px] font-semibold bg-ok/10 text-ok">Free</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    <tr>
                      <td className="sticky left-0 z-10 bg-surface pl-4 pr-3 py-2.5 border-t border-r border-line text-[12px] font-semibold text-ink3">Free teachers</td>
                      {PERIODS.map((_, p) => <td key={p} className="px-2 py-2.5 border-t border-line font-semibold tnum text-[13px]">{TEACHERS.filter((t) => !awayOn(t.n) && !busyAt(t.n, day, p)).length}</td>)}
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
          {view !== 'free' && <div className="px-5 py-3 border-t border-line flex flex-wrap items-center gap-x-4 gap-y-2"><GridLegend />{!isDraft && <span className="text-[12.5px] text-ink3 @lg:ml-auto">Ringed: happening now (10:42 AM)</span>}</div>}
        </Card>

        <div className="grid @xl:grid-cols-2 gap-5 @lg:gap-6 items-start">
          {full && (!draft ? (
            <Suggestion title="Make the Term 2 time table" source="Teacher Allocation (96), teacher preferences (12 teachers), subject conditions (3 rules), periods and bells in Academic Settings"
              actions={<Button variant="primary" icon={I.Sparkles} onClick={() => setMake(true)}>Make a draft</Button>}>
              Term 2 starts on Mon 2 Nov. A draft for all 43 sections can be made that keeps every teacher within 32 periods a week and 3 in a row. You check it, fix any clashes and publish. Nothing changes until you press Publish.
            </Suggestion>
          ) : (
            <Suggestion title="Draft ready: Term 2 time table" source="the same allocations, preferences and conditions"
              actions={<><Button variant="secondary" icon={I.Eye} onClick={() => { setView('class'); setVersion('draft'); }}>Check the draft</Button><Button variant="ghost" onClick={() => { setDraft(null); setVersion('pub'); toast({ title: 'Draft discarded' }); }}>Discard</Button></>}>
              Made for 43 sections. {clashes.length ? `${clashes.length} clashes need a person to decide (shown above the grid).` : 'No clashes left; it can be published.'} Venkat Rao drops from 34 to 31 periods by moving 9 A Social Studies to Rukmini Devi.
            </Suggestion>
          ))}
          <Card>
            <CardHead title="School overview" sub="Every published time table this week" icon={I.LayoutGrid} />
            <ul className="px-5 pb-2 divide-y divide-line/70">
              {LEVELS.map((l) => {
                const n = SECS.filter((s) => s.level === l).length;
                return <li key={l} className="flex items-center justify-between gap-3 py-2.5 text-[14px]"><span className="font-semibold">{l}</span><span className="text-ink3 tnum">{n} sections</span><Pill tone="ok" dot>Published</Pill></li>;
              })}
            </ul>
            <div className="px-5 pb-5">
              <p className="eyebrow text-ink3 mb-2">Heaviest loads</p>
              <ul className="flex flex-col gap-2">
                {[...TEACHERS].sort((a, b) => b.load - a.load).slice(0, 4).map((t) => (
                  <li key={t.n} className="grid grid-cols-[1fr_120px_56px] items-center gap-3 text-[13px]">
                    <span className="truncate font-medium">{t.n}</span><Progress value={(t.load / 34) * 100} tone={t.load > 32 ? 'warn' : 'brand'} /><span className={cx('text-right tnum font-semibold', t.load > 32 && 'text-warn')}>{t.load}/32</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </div>
      </div>

      <Sheet open={make} onClose={() => setMake(false)} title="Make a time table automatically" sub="The result is a draft. The published time table stays as it is."
        footer={<><Button variant="ghost" onClick={() => setMake(false)}>Cancel</Button><Button variant="primary" icon={I.Sparkles} loading={making} onClick={makeDraft}>{making ? 'Making the draft…' : 'Make draft'}</Button></>}>
        <MakeFields />
      </Sheet>
      <ConfirmSheet open={publish} onClose={() => setPublish(false)} title="Publish the Term 2 time table?" confirmLabel="Publish from 02-11-2026"
        onConfirm={() => { setDraft(null); setVersion('pub'); toast({ title: 'Published from Mon 2 Nov 2026', body: '58 teachers told on the app. Parent Link shows the new time table from that date.' }); }}>
        <ul className="text-[14px] text-ink2 flex flex-col gap-2 list-disc pl-5">
          <li>43 sections switch to this time table on <b className="text-ink">Mon 2 Nov 2026</b>. Until then the current one stays.</li>
          <li>58 teachers get a message on the app. Parents see it on Parent Link from that date.</li>
          <li>The current version is kept in history and can be published again.</li>
        </ul>
      </ConfirmSheet>
      <EditPeriodSheet e={edit} sec={sec} onClose={() => setEdit(null)} codeAt={codeAt}
        onSave={(changes, msg) => {
          const before = over[sec] || {};
          setOver((o) => ({ ...o, [sec]: { ...(o[sec] || {}), ...changes } }));
          setEdit(null);
          toast({ title: msg, body: isDraft ? 'Saved in the draft.' : 'Teachers of this class are told on the app.', undo: () => setOver((o) => ({ ...o, [sec]: before })) });
        }} />
    </div>
  );
}

function MakeFields() {
  const [scope, setScope] = useState('all');
  const [pref, setPref] = useState(true);
  const [cond, setCond] = useState(true);
  return (
    <div className="flex flex-col gap-4">
      <Field label="For" id="mk-scope"><Segmented value={scope} onChange={setScope} options={[{ value: 'one', label: 'Class 7 B' }, { value: 'all', label: 'Whole school (43)' }]} className="w-full" /></Field>
      <DateL id="mk-from" label="Effective from" required init="02-11-2026" hint="First day of Term 2" />
      <div className="rounded-xl border border-line divide-y divide-line/70">
        <SettingRow id="mk-pref" title="Use teacher preferences" sub="12 teachers have rest times or days they cannot teach"><Switch id="mk-pref" on={pref} onChange={setPref} label="Use teacher preferences" /></SettingRow>
        <SettingRow id="mk-cond" title="Use subject conditions" sub="No Maths in period 8, PE not in period 1, lab double periods"><Switch id="mk-cond" on={cond} onChange={setCond} label="Use subject conditions" /></SettingRow>
      </div>
      <p className="text-[12.5px] text-ink3">Subject conditions win when they disagree with a preference. You check every clash before publishing.</p>
    </div>
  );
}

function EditPeriodSheet({ e, sec, onClose, onSave, codeAt }) {
  const [f, setF] = useState(null);
  const [tried, setTried] = useState(false);
  if (!e) return null;
  const s = SEC[sec];
  const codes = s.level === 'Secondary' ? ['E', 'L2', 'M', 'S', 'SS', 'IT', 'PE', 'A', 'L', 'LS'] : s.level === 'Primary' ? ['E', 'T', 'H', 'M', 'EVS', 'C', 'PE', 'A', 'MU', 'L', 'LS'] : s.level === 'Pre-primary' ? ['EN', 'NUM', 'RH', 'PLAY', 'ART', 'MM', 'OW'] : ['E', 'T', 'H', 'M', 'S', 'SS', 'C', 'PE', 'A', 'MU', 'L', 'LS'];
  const nameOf = (c) => (s.level === 'Secondary' && c === 'C' ? SUBJ.IT : SUBJ[c]);
  const startCode = codes.includes(e.code) ? e.code : codes[0];
  const v = f || { brk: e.code === 'BRK', code: startCode, teacher: teacherOf(sec, nameOf(startCode)) || '', all: false, room: s.room, week: false };
  const set = (k, val) => setF({ ...v, [k]: val });
  const subj = nameOf(v.code);
  const assigned = [teacherOf(sec, subj), secondOf(sec, subj)].filter((x) => x && x !== 'na');
  const options = v.all ? TEACHERS.map((t) => t.n) : assigned;
  const days = v.week ? [0, 1, 2, 3, 4, 5] : [e.d];
  const clash = !v.brk && v.teacher && days.map((d) => ({ d, b: busyAt(v.teacher, d, e.p) })).find((x) => x.b && x.b.cls !== sec);
  const err = !v.brk && !v.teacher ? 'Choose a teacher' : clash ? `${v.teacher} is already in ${clash.b.cls}, period ${e.p + 1} on ${DAYS_FULL[clash.d]}` : '';
  const close = () => { onClose(); setF(null); setTried(false); };
  const save = () => {
    setTried(true);
    if (err) return;
    const ch = {};
    days.forEach((d) => { ch[`${d}-${e.p}`] = v.brk ? 'BRK' : v.code; });
    onSave(ch, v.brk ? `Period ${e.p + 1} is now a break${v.week ? ' every day' : ''}` : `${sec}: ${subj} with ${v.teacher}, period ${e.p + 1}${v.week ? ' every day' : ` on ${DAYS_FULL[e.d]}`}`);
    setF(null); setTried(false);
  };
  return (
    <Sheet open onClose={close} title={`Edit period ${e.p + 1}`} sub={`${sec} · ${DAYS_FULL[e.d]} · ${PT(e.p)}`}
      footer={<>
        <Button variant="ghost" className="mr-auto !text-bad" icon={I.Trash2} onClick={() => { onSave({ [`${e.d}-${e.p}`]: 'X' }, `Removed period ${e.p + 1} on ${DAYS_FULL[e.d]}`); setF(null); }}>Remove</Button>
        <Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" icon={I.Check} onClick={save}>Save</Button>
      </>}>
      <div className="flex flex-col gap-4">
        <Field label="Start and end time" id="ep-time" hint="From the period master in Academic Settings"><Input id="ep-time" value={PT(e.p)} readOnly className="tnum text-ink2" /></Field>
        <div className="rounded-xl border border-line"><SettingRow id="ep-brk" title="Lunch or break" sub="No subject or teacher for this period"><Switch id="ep-brk" on={v.brk} onChange={(x) => set('brk', x)} label="Lunch or break" /></SettingRow></div>
        {!v.brk && (
          <>
            <Field label="Subject" id="ep-subj" required hint="Only subjects mapped to this class">
              <Select id="ep-subj" value={v.code} onChange={(c) => setF({ ...v, code: c, teacher: teacherOf(sec, nameOf(c)) && teacherOf(sec, nameOf(c)) !== 'na' ? teacherOf(sec, nameOf(c)) : '' })} options={codes.map((c) => ({ value: c, label: nameOf(c) }))} />
            </Field>
            <Field label="Teacher" id="ep-teacher" required error={tried && err} hint={!v.all ? `Teachers assigned to ${subj} in ${sec}` : 'Everyone, with their load'}>
              <Select id="ep-teacher" value={v.teacher} onChange={(x) => set('teacher', x)} error={tried && err}
                options={[{ value: '', label: options.length ? 'Choose a teacher' : 'Nobody assigned yet' }, ...options.map((n) => ({ value: n, label: T_BY[n] ? `${n} · ${T_BY[n].load} of 32` : n }))]} />
            </Field>
            <label htmlFor="ep-all" className="flex items-center gap-2.5 text-[14px] -mt-1"><Checkbox id="ep-all" checked={v.all} onChange={(x) => set('all', x)} label="Show all teachers" />Show all teachers</label>
            <Field label="Room" id="ep-room" hint="The section’s room unless changed"><Input id="ep-room" value={v.room} onChange={(x) => set('room', x.target.value)} /></Field>
          </>
        )}
        <div className="rounded-xl border border-line"><SettingRow id="ep-week" title="Whole week" sub="Changes this period on every day of the week"><Switch id="ep-week" on={v.week} onChange={(x) => set('week', x)} label="Whole week" /></SettingRow></div>
      </div>
    </Sheet>
  );
}

/* =====================================================================================
   Substitutions
   ===================================================================================== */

function SubstitutionsPage({ access }) {
  const { role } = useRole();
  if (access === 'own' && (role.id === 'teacher' || role.id === 'classteacher')) return <MyDuties />;
  return <ArrangeSubs access={access} />;
}

const PAST_DUTIES = {
  'Imran Shaikh': [
    { when: 'Mon 5 Oct · P6', what: '9 B Mathematics', why: 'for Swapna Reddy (sick leave)' },
    { when: 'Tue 29 Sep · P4', what: '6 C Mathematics', why: 'for Srinivas Chary (training)' },
  ],
  'Ravi Teja': [{ when: 'Thu 24 Sep · P7', what: '8 C Science', why: 'for Bhargavi Kulkarni (exam duty)' }],
};

function MyDuties() {
  const { role } = useRole();
  const { go } = useNav();
  const toast = useToast();
  const me = ME_T(role.id);
  const d = DUTY[me];
  const [ack, setAck] = useState(null);
  const past = PAST_DUTIES[me];
  return (
    <div>
      <ModuleHead sub={`Your substitution duties · ${SUBS_MONTH[me]} this month`} />
      <div className="flex flex-col gap-5 @lg:gap-6 max-w-4xl">
        <Card className="overflow-hidden">
          <div className="p-5 flex flex-col @md:flex-row gap-4 @md:items-center">
            <span className="w-14 h-14 rounded-2xl bg-brand/10 text-brand grid place-items-center shrink-0"><span className="font-display font-semibold text-[20px] tnum">P{d.p + 1}</span></span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold text-brand">Today · {PT(d.p)}</p>
              <p className="font-display text-[22px] font-semibold tracking-tight leading-tight mt-0.5">{d.cls} · {d.subj}</p>
              <p className="text-[13.5px] text-ink3 mt-0.5">For {d.away} ({d.why}) · {d.room} · class teacher {d.ct}</p>
            </div>
            <div className="flex gap-2">
              {ack ? <Pill tone="ok" dot>Seen at {ack}</Pill> : <Button variant="primary" icon={I.Check} onClick={() => { setAck('10:43 AM'); toast({ title: 'Thanks. Naveen Kumar can see you have it.', body: `${d.cls}, period ${d.p + 1}` }); }}>Got it</Button>}
              <Button variant="secondary" onClick={() => go('academic', { page: 'timetable' })}>My week</Button>
            </div>
          </div>
          <div className="mx-5 mb-5 rounded-xl bg-sunken/70 p-4 flex gap-3">
            <Avatar name={d.away} size={34} />
            <div className="min-w-0"><p className="text-[12.5px] text-ink3 font-semibold">Note from {d.away}</p><p className="text-[14px] leading-relaxed mt-0.5">{d.note}</p></div>
          </div>
        </Card>
        <div className="grid @lg:grid-cols-2 gap-5 @lg:gap-6">
          <Card>
            <CardHead title="Earlier duties" sub="Last 30 days" icon={I.History} />
            <ul className="px-2 pb-2">
              {past.map((x) => <li key={x.when}><Row icon="Repeat" title={x.what} sub={`${x.when} · ${x.why}`} /></li>)}
            </ul>
          </Card>
          <Card>
            <CardHead title="Fair share" sub="Substitutions are spread by who has had fewest" icon={I.Scale} />
            <DL rows={[['This week', `${SUBS_WEEK[me] + 1} including today`], ['This month', `${SUBS_MONTH[me]}`], ['School average this month', '3'], ['Free periods today', `${8 - weekFor(me)[TODAY_D].filter(Boolean).length - 1}`]]} />
          </Card>
        </div>
      </div>
    </div>
  );
}

function ArrangeSubs({ access }) {
  const toast = useToast();
  const { role } = useRole();
  const canEdit = useCanEdit();
  const can = canEdit && (access === 'full' || role.id === 'officestaff');
  const [rows, setRows] = useState(SUB0);
  const [swapna, setSwapna] = useState(false);
  const [day, setDay] = useState('fri');
  const [assign, setAssign] = useState(null);
  const [temp, setTemp] = useState(false);
  const [markOpen, setMarkOpen] = useState(false);
  const away = ['Anitha Kumari', 'Sravanthi Rao', ...(swapna ? ['Swapna Reddy'] : [])];
  const swRows = useMemo(() => weekFor('Swapna Reddy')[TODAY_D].map((c, p) => c && p >= 3 ? { id: 'sw' + p, p, cls: c.cls, subj: 'Mathematics', absent: 'Swapna Reddy', sub: null } : null).filter(Boolean), []);
  const swFirst = swRows[0];
  const satRows = useMemo(() => classGrid('3 A')[5].map((code, p) => ['E', 'M', 'EVS', 'LS'].includes(code) ? { id: 'sat' + p, p, cls: '3 A', subj: SUBJ[code], absent: 'Sravanthi Rao', sub: null } : null).filter(Boolean), []);
  const monRows = useMemo(() => classGrid('3 A')[0].map((code, p) => ['E', 'M', 'EVS', 'LS'].includes(code) ? { id: 'mon' + p, p, cls: '3 A', subj: SUBJ[code], absent: 'Sravanthi Rao', sub: null } : null).filter(Boolean), []);
  const [future, setFuture] = useState({ sat: satRows, mon: monRows });
  const list = day === 'fri' ? rows : future[day];
  const sorted = [...list].sort((a, b) => a.p - b.p || a.cls.localeCompare(b.cls));
  const needed = list.filter((r) => !r.sub).length;
  const dIdx = day === 'fri' ? 4 : day === 'sat' ? 5 : 0;
  const update = (ids, sub) => {
    const fn = (x) => x.map((r) => (ids.includes(r.id) ? { ...r, sub, at: '10:44 AM', by: role.person.name } : r));
    if (day === 'fri') setRows(fn); else setFuture((f) => ({ ...f, [day]: fn(f[day]) }));
  };
  const byTeacher = Object.entries(rows.filter((r) => r.sub).reduce((m, r) => ((m[r.sub] = m[r.sub] || []).push(r), m), {}));
  const loads = TEACHERS.map((t) => ({ k: t.n, v: (SUBS_WEEK[t.n] || 0) + rows.filter((r) => r.sub === t.n).length, m: SUBS_MONTH[t.n] || SUBS_WEEK[t.n] || 0 })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 7);

  return (
    <div>
      <ModuleHead sub={role.id === 'officestaff' ? 'Arranging substitutions for the school · Friday, 9 October' : 'Friday, 9 October · teachers away today and who covers their periods'}
        actions={can && <>
          <Button variant="secondary" icon={I.UserPlus} onClick={() => setTemp(true)}>Temporary teacher</Button>
          <Button variant="secondary" icon={I.Printer} className="hidden @md:inline-flex" onClick={() => toast({ title: 'Substitute time table sent to the staff room printer', body: 'Today, by teacher, 1 page', tone: 'info' })}>Print</Button>
        </>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <SegScroll><Segmented value={day} onChange={setDay} options={[{ value: 'fri', label: 'Today, Fri 9 Oct' }, { value: 'sat', label: 'Sat 10 Oct' }, { value: 'mon', label: 'Mon 12 Oct' }]} /></SegScroll>

        {day === 'fri' && (
          <Stats items={[
            { label: 'Teachers away', value: away.length, sub: swapna ? '2 on leave, 1 absent' : '2 on leave', icon: 'UserX' },
            { label: 'Periods to cover', value: rows.length, sub: 'Raised from approved leave', icon: 'CalendarClock' },
            { label: 'Covered', value: rows.length - needed, sub: 'Substitute told on the app', icon: 'CircleCheck', tone: 'ok' },
            { label: 'Still needed', value: needed, sub: needed ? `Next at ${PT(sorted.find((r) => !r.sub)?.p ?? 0).split('–')[0]}` : 'All covered', icon: 'TriangleAlert', tone: needed ? 'bad' : 'ok' },
          ]} />
        )}
        {day === 'fri' && !swapna && swFirst && (
          <Banner tone="warn" icon={I.Clock} title="Swapna Reddy has not come in yet."
            action={can && <div className="flex gap-2 shrink-0"><Button size="sm" variant="ghost" onClick={() => toast({ title: 'Calling Swapna Reddy', body: '93470 55826', tone: 'info' })}>Call</Button><Button size="sm" variant="secondary" onClick={() => setMarkOpen(true)}>Mark absent</Button></div>}>
            No punch by 10:42 AM. Her first period today is {swFirst.cls} at {PT(swFirst.p).split('–')[0]} (period {swFirst.p + 1}).
          </Banner>
        )}
        {day === 'sat' && <Banner tone="info" title="Raised by itself from approved leave.">Sravanthi Rao is on medical leave until 20 Oct. Her 3 A periods need cover. A temporary teacher may be simpler for a long absence.</Banner>}
        {day === 'mon' && (
          <div className="flex flex-col gap-2.5">
            <Banner tone="info" icon={I.ClipboardCheck} title="Half-yearly exams:">Classes 6 to 10 sit the English paper from 9:00 AM to 12:00 PM. The datesheet replaces their periods, so only Classes Nursery to 5 need cover.</Banner>
            <Banner tone="warn" icon={I.Hourglass} title="Ravi Teja asked for casual leave on Mon 12 Oct.">It is waiting for approval. His periods are added here when it is approved.</Banner>
          </div>
        )}

        <Split side={340}>
          <Col>
            <Card className="overflow-hidden">
              <CardHead title="Periods needing a substitute" sub={`${list.length} periods · ${needed} still needed`} icon={I.Repeat} action={<ExportButton what="substitutions" />} />
              <DataList rows={sorted} rowKey={(r) => r.id} minWidth={720}
                onRow={can ? (r) => setAssign({ row: r, d: dIdx }) : undefined}
                columns={[
                  { key: 'p', label: 'Period', render: (r) => <div><p className="font-semibold">P{r.p + 1}</p><p className="text-[12px] text-ink3 tnum whitespace-nowrap">{PT(r.p)}</p></div> },
                  { key: 'cls', label: 'Class', render: (r) => <span className="font-semibold">{r.cls}</span> },
                  { key: 'subj', label: 'Subject' },
                  { key: 'absent', label: 'Away', render: (r) => <div><p className="leading-tight">{r.absent}</p><p className="text-[12px] text-ink3">{r.absent === 'Swapna Reddy' ? 'Absent' : 'Leave'}</p></div> },
                  { key: 'sub', label: 'Substitute', render: (r) => r.sub ? <div className="flex items-center gap-2"><Avatar name={r.sub} size={28} /><div><p className="leading-tight font-medium">{r.sub}</p><p className="text-[11.5px] text-ink3">{r.at} · {r.by}</p></div></div> : <Pill tone="bad" dot>Needed</Pill> },
                ]}
                mobile={(r) => ({ icon: r.sub ? 'CircleCheck' : 'CircleAlert', iconTone: r.sub ? 'ok' : 'bad', title: `P${r.p + 1} · ${r.cls} · ${r.subj}`, sub: `${PT(r.p)} · for ${r.absent}`, pills: [r.sub ? <Pill key="s" tone="ok" className="!h-[22px] !text-[11.5px]">{r.sub}</Pill> : <Pill key="n" tone="bad" className="!h-[22px] !text-[11.5px]">Needed</Pill>] })}
                empty={<Empty icon={I.CircleCheck} title="Nobody is away" body="No substitutions are needed on this day." />}
                footer={can ? 'Tap a row to assign or change the substitute' : `${list.length} periods`} />
            </Card>
            {day === 'fri' && (
              <Card>
                <CardHead title="Substitute time table" sub="Today, by teacher" icon={I.CalendarRange} />
                <ul className="px-5 pb-4 divide-y divide-line/70">
                  {byTeacher.map(([n, rs]) => (
                    <li key={n} className="flex items-center gap-3 py-2.5">
                      <Avatar name={n} size={34} />
                      <div className="min-w-0 flex-1"><p className="font-semibold text-[14px] truncate">{n}</p><p className="text-[12.5px] text-ink3 truncate">{rs.map((r) => `P${r.p + 1} ${r.cls} ${short(r.subj)}`).join(' · ')}</p></div>
                      <Pill tone="neutral">{rs.length}</Pill>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </Col>
          <Col>
            <Card>
              <CardHead title="Away today" icon={I.UserX} />
              <ul className="px-2 pb-2">
                {Object.entries(AWAY).map(([n, a]) => <li key={n}><Row avatar={n} title={n} sub={`${a.why} · ${a.note}`} /></li>)}
                {swapna && <li><Row avatar="Swapna Reddy" title="Swapna Reddy" sub={`Marked absent at 10:44 AM by ${role.person.name}`} /></li>}
              </ul>
            </Card>
            <Card>
              <CardHead title="Substitution load" sub="This week, with this month in brackets. Fewest go first." icon={I.Scale} />
              <ul className="px-5 pb-5 flex flex-col gap-2.5">
                {loads.map((r) => (
                  <li key={r.k} className="grid grid-cols-[1fr_80px_64px] items-center gap-3 text-[13px]">
                    <span className="truncate font-medium">{r.k}</span><Progress value={(r.v / 5) * 100} tone={r.v >= 4 ? 'warn' : 'brand'} /><span className="text-right tnum text-ink2"><b className="font-semibold text-ink">{r.v}</b> ({r.m})</span>
                  </li>
                ))}
              </ul>
            </Card>
          </Col>
        </Split>
      </div>

      <AssignSubSheet a={assign} rows={day === 'fri' ? rows : future[day]} away={away} onClose={() => setAssign(null)}
        onSave={(ids, sub, label) => { update(ids, sub); setAssign(null); toast({ title: `${sub} takes ${label}`, body: `${sub} and the class teacher are told on the app. It shows on ${sub.split(' ')[0]}’s home screen.` }); }} />
      <ConfirmSheet open={markOpen} onClose={() => setMarkOpen(false)} title="Mark Swapna Reddy absent today?" confirmLabel={`Mark absent and raise ${swRows.length} periods`}
        onConfirm={() => { setSwapna(true); setRows((r) => [...r, ...swRows]); toast({ title: `Swapna Reddy marked absent · ${swRows.length} periods to cover`, body: 'Recorded in Staff Attendance. HR can change it with a reason.' }); }}>
        <p className="text-[14px] text-ink2">Her periods from now on are added to the list: {swRows.map((r) => `${r.cls} at ${PT(r.p).split('–')[0]}`).join(' and ')}. If she comes in, HR can correct it in Staff Attendance.</p>
      </ConfirmSheet>
      <TempTeacherSheet open={temp} onClose={() => setTemp(false)} />
    </div>
  );
}

function AssignSubSheet({ a, rows, away, onClose, onSave }) {
  const [sel, setSel] = useState(null);
  const [pick, setPick] = useState(null);
  const [note, setNote] = useState('');
  if (!a) return null;
  const r = a.row;
  const mine = rows.filter((x) => x.absent === r.absent && (x.id === r.id || !x.sub));
  const ids = sel || [r.id];
  const ps = rows.filter((x) => ids.includes(x.id)).map((x) => x.p);
  const others = rows.filter((x) => !ids.includes(x.id));
  const sug = suggest(a.d, ps, r.cls, r.subj, a.d === TODAY_D ? others : [], away).slice(0, 5);
  const chosen = pick && sug.some((s) => s.t.n === pick) ? pick : sug[0]?.t.n;
  const close = () => { onClose(); setSel(null); setPick(null); setNote(''); };
  const label = ids.length === 1 ? `${r.cls}, period ${r.p + 1}` : `${ids.length} periods of ${r.absent}`;
  return (
    <Sheet open onClose={close} title="Assign substitute" sub={`${r.cls} · ${r.subj} · for ${r.absent}`} wide
      footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" icon={I.Send} disabled={!chosen} onClick={() => { onSave(ids, chosen, label); setSel(null); setPick(null); setNote(''); }}>{chosen ? `Assign and tell ${chosen.split(' ')[0]}` : 'Nobody is free'}</Button></>}>
      <div className="flex flex-col gap-4">
        <Field label="Periods" id="as-periods" required hint={`You can pick all of ${r.absent}’s open periods on this day`}>
          <ul className="rounded-xl border border-line divide-y divide-line/70">
            {mine.map((x) => (
              <li key={x.id} className="flex items-center gap-3 px-3.5 py-2.5 text-[14px]">
                <Checkbox label={`Period ${x.p + 1}`} checked={ids.includes(x.id)} onChange={(on) => setSel(on ? [...ids, x.id] : ids.filter((y) => y !== x.id).length ? ids.filter((y) => y !== x.id) : ids)} />
                <span className="font-semibold">P{x.p + 1}</span><span className="text-ink3 tnum">{PT(x.p)}</span><span className="ml-auto">{x.cls} · {short(x.subj)}</span>
              </li>
            ))}
          </ul>
        </Field>
        <div>
          <p className="text-[13px] font-semibold text-ink2 mb-1.5">Substitute <span className="text-bad">*</span></p>
          <p className="text-[12.5px] text-ink3 mb-2">Only teachers free in {ps.length === 1 ? 'this period' : 'all these periods'}. Same subject first, then teachers of {r.cls}, then fewest substitutions this week.</p>
          {sug.length === 0 ? <Banner tone="warn" title="Nobody is free in all these periods.">Pick fewer periods, or add a temporary teacher.</Banner> : (
            <ul className="flex flex-col gap-1.5" role="radiogroup" aria-label="Substitute">
              {sug.map((s, i) => {
                const on = chosen === s.t.n;
                return (
                  <li key={s.t.n}>
                    <button role="radio" aria-checked={on} onClick={() => setPick(s.t.n)} className={cx('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition', on ? 'border-brand bg-brand/5' : 'border-line hover:bg-sunken/60')}>
                      <Avatar name={s.t.n} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2"><span className="font-semibold text-[14px] truncate">{s.t.n}</span>{i === 0 && <Pill tone="brand" className="!h-5 !text-[11px]">Best fit</Pill>}</span>
                        <span className="block text-[12.5px] text-ink3 truncate">{s.why.join(' · ')}</span>
                      </span>
                      <span className={cx('w-5 h-5 rounded-full border-2 grid place-items-center shrink-0', on ? 'border-brand' : 'border-line')}>{on && <span className="w-2.5 h-2.5 rounded-full bg-brand" />}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <Field label="Note for the substitute" id="as-note"><Textarea id="as-note" value={note} onChange={setNote} rows={2} placeholder="What the class should do" /></Field>
      </div>
    </Sheet>
  );
}

function TempTeacherSheet({ open, onClose }) {
  const toast = useToast();
  const [f, setF] = useState({ who: 'Sravanthi Rao', from: '12-10-2026', to: '20-10-2026', temp: '' });
  const [tried, setTried] = useState(false);
  const err = { from: !okDate(f.from) ? 'Use DD-MM-YYYY' : '', to: !okDate(f.to) ? 'Use DD-MM-YYYY' : '', temp: !f.temp ? 'Choose who will teach' : '' };
  return (
    <FormSheet open={open} onClose={() => { onClose(); setTried(false); }} title="Temporary teacher" sub="Replaces an absent teacher’s periods for a longer time." submitLabel="Save temporary teacher"
      onSubmit={() => { setTried(true); if (Object.values(err).some(Boolean)) return false; toast({ title: `${f.temp} takes ${f.who}’s periods`, body: `${f.from} to ${f.to} · 3 A · 31 periods. Both are told on the app.` }); setTried(false); }}>
      <Field label="Absent teacher" id="tt-who" required><Select id="tt-who" value={f.who} onChange={(v) => setF({ ...f, who: v })} options={['Sravanthi Rao', 'Anitha Kumari']} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <DateField id="tt-from" label="From" required value={f.from} onChange={(v) => setF({ ...f, from: v })} error={tried && err.from} />
        <DateField id="tt-to" label="To" required value={f.to} onChange={(v) => setF({ ...f, to: v })} error={tried && err.to} />
      </div>
      <Field label="Temporary teacher" id="tt-temp" required error={tried && err.temp} hint="Someone new? Add them in Staff & HR as temporary staff first.">
        <Select id="tt-temp" value={f.temp} onChange={(v) => setF({ ...f, temp: v })} error={tried && err.temp} options={[{ value: '', label: 'Choose a person' }, 'Haritha Reddy', 'Vijaya Lakshmi', 'Kusum Lata', 'Padmaja Sastry']} />
      </Field>
      <p className="text-[12.5px] text-ink3">Holidays inside the dates are skipped. Dussehra holidays (19–25 Oct) are not counted.</p>
    </FormSheet>
  );
}

/* =====================================================================================
   Syllabus & Lesson Plans
   ===================================================================================== */

const CH = (names, states) => names.map((n, i) => ({ n, st: states[i] || 'Planned' }));
const SYLLABUS = {
  'Mathematics-7': {
    units: [
      { n: 'Term 1 · half-yearly syllabus', ch: [
        { n: 'Integers', st: 'Completed', dates: '15 Jun – 3 Jul' }, { n: 'Fractions and Decimals', st: 'Completed', dates: '6 Jul – 31 Jul' }, { n: 'Data Handling', st: 'Completed', dates: '3 Aug – 21 Aug' },
        { n: 'Simple Equations', st: 'Taught', dates: '24 Aug – 25 Sep', late: true, topics: [['4.1 A mind-reading game', 'Completed'], ['4.2 Setting up an equation', 'Completed'], ['4.3 What is an equation?', 'Completed'], ['4.4 More equations', 'Completed'], ['4.5 Solving an equation (Ex 4.2)', 'Taught'], ['4.6 From solution to equation', 'Pending'], ['4.7 Applications of simple equations (Ex 4.3, 4.4)', 'Pending']] },
        { n: 'Lines and Angles', st: 'Pending', dates: '28 Sep – 16 Oct', late: true },
      ] },
      { n: 'Term 2 · annual syllabus', ch: [
        { n: 'The Triangle and its Properties', st: 'Planned', dates: '28 Oct – 20 Nov' }, { n: 'Comparing Quantities', st: 'Planned', dates: '23 Nov – 11 Dec' }, { n: 'Rational Numbers', st: 'Planned', dates: '14 Dec – 8 Jan' },
        { n: 'Perimeter and Area', st: 'Planned', dates: '11 Jan – 29 Jan' }, { n: 'Algebraic Expressions', st: 'Planned', dates: '1 Feb – 12 Feb' }, { n: 'Exponents and Powers', st: 'Planned', dates: '15 Feb – 24 Feb' },
        { n: 'Symmetry', st: 'Planned', dates: '25 Feb – 3 Mar' }, { n: 'Visualising Solid Shapes', st: 'Planned', dates: '4 Mar – 10 Mar' },
      ] },
    ],
  },
  'Mathematics-6': { units: [{ n: 'Term 1', ch: CH(['Patterns in Mathematics', 'Lines and Angles', 'Number Play', 'Data Handling and Presentation', 'Prime Time'], ['Completed', 'Completed', 'Completed', 'Completed', 'Taught']) }, { n: 'Term 2', ch: CH(['Perimeter and Area', 'Fractions', 'Playing with Constructions', 'Symmetry', 'The Other Side of Zero'], []) }] },
  'Science-7': { units: [{ n: 'Term 1', ch: CH(['Nutrition in Plants', 'Nutrition in Animals', 'Heat', 'Acids, Bases and Salts', 'Physical and Chemical Changes', 'Respiration in Organisms'], ['Completed', 'Completed', 'Completed', 'Completed', 'Taught', 'Planned']) }, { n: 'Term 2', ch: CH(['Transportation in Animals and Plants', 'Reproduction in Plants', 'Motion and Time', 'Electric Current and its Effects', 'Light', 'Forests: Our Lifeline', 'Wastewater Story'], []) }] },
  'Science-8': { units: [{ n: 'Term 1', ch: CH(['Crop Production and Management', 'Microorganisms: Friend and Foe', 'Coal and Petroleum', 'Combustion and Flame', 'Conservation of Plants and Animals'], ['Completed', 'Completed', 'Completed', 'Taught', 'Pending']) }, { n: 'Term 2', ch: CH(['Reproduction in Animals', 'Reaching the Age of Adolescence', 'Force and Pressure', 'Friction', 'Sound', 'Chemical Effects of Electric Current', 'Some Natural Phenomena', 'Light'], []) }] },
};
const MY_PROGRESS = {
  'Imran Shaikh': [{ sec: '7 B', subj: 'Mathematics', done: 31, plan: 38, late: 'Lines and Angles', key: 'Mathematics-7' }, { sec: '7 A', subj: 'Mathematics', done: 34, plan: 38, late: 'Lines and Angles', key: 'Mathematics-7' }, { sec: '6 A', subj: 'Mathematics', done: 40, plan: 40, key: 'Mathematics-6' }, { sec: '6 B', subj: 'Mathematics', done: 36, plan: 40, late: 'Prime Time', key: 'Mathematics-6' }],
  'Ravi Teja': [{ sec: '7 B', subj: 'Science', done: 38, plan: 38, key: 'Science-7' }, { sec: '7 A', subj: 'Science', done: 35, plan: 38, key: 'Science-7' }, { sec: '8 B', subj: 'Science', done: 30, plan: 38, late: 'Conservation of Plants and Animals', key: 'Science-8' }],
};
const SCHOOL_PROGRESS = SENIOR.flatMap((l) => ['English', 'Mathematics', 'Science', 'Social Studies'].map((subj) => {
  const mine = Object.values(MY_PROGRESS).flat().find((x) => x.sec === l && x.subj === subj);
  const plan = Number(l.split(' ')[0]) >= 9 ? 45 : 38;
  const done = mine ? mine.done : plan - ((hash(l + subj) % 9) - 2);
  return { id: l + subj, sec: l, subj, teacher: teacherOf(l, subj), plan: mine ? mine.plan : plan, done: Math.min(done, plan + 2) };
}));
const LESSONS = {
  'Imran Shaikh': [
    { id: 'l1', when: 'Today · P1', sec: '6 A', topic: 'Prime Time: 5.2 Prime factorisation', st: 'Taught' },
    { id: 'l2', when: 'Today · P2', sec: '7 B', topic: '4.5 Solving an equation: Exercise 4.2, Q1 to Q4', st: 'Taught' },
    { id: 'l3', when: 'Today · P3', sec: '7 A', topic: '4.5 Solving an equation: Exercise 4.2', st: 'Written' },
    { id: 'l4', when: 'Today · P6', sec: '7 B', topic: '4.5 Exercise 4.2, Q5 to Q8 and doubts', st: 'Written' },
    { id: 'l5', when: 'Today · P7', sec: '6 B', topic: 'Prime Time: 5.2 Prime factorisation', st: 'Written' },
    { id: 'l6', when: 'Sat 10 Oct · P1', sec: '6 A', topic: 'Revision for half-yearly: Chapters 1 to 4', st: 'Draft' },
    { id: 'l7', when: 'Sat 10 Oct · P3', sec: '7 B', topic: 'Revision: Integers, Fractions and Decimals', st: 'Not written' },
    { id: 'l8', when: 'Wed 28 Oct · P2', sec: '7 B', topic: '4.6 From solution to equation', st: 'Not written' },
  ],
  'Ravi Teja': [
    { id: 'r1', when: 'Today · P1', sec: '8 B', topic: 'Combustion and Flame: zones of a flame', st: 'Taught' },
    { id: 'r2', when: 'Today · P3', sec: '7 B', topic: 'Physical and Chemical Changes: rusting of iron', st: 'Written' },
    { id: 'r3', when: 'Today · P5', sec: '7 A', topic: 'Physical and Chemical Changes: crystallisation', st: 'Written' },
    { id: 'r4', when: 'Sat 10 Oct · P1', sec: '7 B', topic: 'Life skills: managing exam stress', st: 'Draft' },
    { id: 'r5', when: 'Sat 10 Oct · P4', sec: '7 B', topic: 'Revision for half-yearly: Chapters 1 to 5', st: 'Not written' },
  ],
};
const LESSON_TONE = { Taught: 'ok', Written: 'brand', Draft: 'warn', 'Not written': 'neutral' };
const ST_TONE = { Completed: 'ok', Taught: 'info', Pending: 'bad', Planned: 'neutral' };
const LOGGED = [
  { n: 'Imran Shaikh', what: '6 A Prime factorisation · 7 B Exercise 4.2', at: '10:20 AM' }, { n: 'Rajeshwari Nair', what: '7 B Poem “The Squirrel” · 7 A grammar: adverbs', at: '10:05 AM' },
  { n: 'Ravi Teja', what: '8 B Zones of a flame', at: '9:35 AM' }, { n: 'Pallavi Reddy', what: '6 A Light and shadows: pinhole camera', at: '9:31 AM' },
  { n: 'Venkat Rao', what: '7 C Tribes, nomads and settled communities', at: '9:28 AM' },
];
const NOT_LOGGED = ['Deepak Verma', 'Karthik Menon', 'Naresh Chary', 'Prasad Varma', 'Lalitha Devi'];

function SyllabusPage({ access }) {
  const { role } = useRole();
  const own = access === 'own';
  const me = own ? ME_T(role.id) : null;
  const [tab, setTab] = useState('progress');
  const [plan, setPlan] = useState(null);
  return (
    <div>
      <ModuleHead sub={own ? `Your subjects and classes · ${T_BY[me].s} · ${T_BY[me].cls}` : '2026–27 · CBSE · Classes 6 to 10 shown; primary classes follow the same pages'}
        actions={<>
          {!own && <Button variant="secondary" icon={I.Upload} className="hidden @md:inline-flex" onClick={() => setTab('syllabus')}>Import syllabus</Button>}
          <Button variant="primary" icon={I.NotebookPen} onClick={() => setPlan({})}>Write lesson plan</Button>
        </>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <SegScroll><Segmented value={tab} onChange={setTab} options={[{ value: 'progress', label: own ? 'My progress' : 'Progress' }, { value: 'syllabus', label: 'Syllabus' }, { value: 'plans', label: 'Lesson plans' }, { value: 'log', label: 'Daily log' }]} /></SegScroll>
        {tab === 'progress' && (own ? <MyProgress me={me} onOpen={() => setTab('syllabus')} /> : <SchoolProgress />)}
        {tab === 'syllabus' && <SyllabusTree me={me} />}
        {tab === 'plans' && <LessonPlans me={me} onWrite={(l) => setPlan(l || {})} />}
        {tab === 'log' && (own ? <DailyLog me={me} /> : <SchoolLog />)}
      </div>
      <LessonPlanSheet p={plan} me={me} onClose={() => setPlan(null)} />
    </div>
  );
}

function ProgressBar2({ done, plan }) {
  const behind = done < plan - 3;
  return (
    <span className="relative block h-2.5 rounded-full bg-sunken overflow-hidden">
      <span className="absolute inset-y-0 left-0 rounded-full bg-ink3/25" style={{ width: `${plan}%` }} />
      <span className={cx('absolute inset-y-0 left-0 rounded-full', behind ? 'bg-bad' : 'bg-ok')} style={{ width: `${done}%` }} />
    </span>
  );
}

function MyProgress({ me, onOpen }) {
  const rows = MY_PROGRESS[me];
  return (
    <div className="flex flex-col gap-5 @lg:gap-6">
      <div className="grid @md:grid-cols-2 @xl:grid-cols-4 gap-4">
        {rows.map((r) => {
          const behind = r.done < r.plan - 3;
          return (
            <Card key={r.sec} as="button" onClick={onOpen} className="p-4 text-left hover:bg-sunken/40 transition">
              <div className="flex items-center justify-between gap-2"><p className="font-semibold text-[15px]">{r.sec} · {short(r.subj)}</p>{behind ? <Pill tone="bad">Behind</Pill> : <Pill tone="ok">On track</Pill>}</div>
              <p className="font-display text-[28px] font-semibold tnum mt-2 leading-none">{r.done}%</p>
              <p className="text-[12.5px] text-ink3 mt-1">done · {r.plan}% planned by today</p>
              <div className="mt-3"><ProgressBar2 done={r.done} plan={r.plan} /></div>
              {r.late && <p className="text-[12.5px] text-bad font-semibold mt-2.5 truncate">Running late: {r.late}</p>}
            </Card>
          );
        })}
      </div>
      <Legend items={[['bg-ok', 'Done'], ['bg-bad', 'Done, behind plan'], ['bg-ink3/25', 'Planned by today']]} />
      <Suggestion title="Catch up before the half-yearly" source="your syllabus dates, the time table and the datesheet (Maths on Wed 14 Oct)">
        {me === 'Imran Shaikh' ? '7 B and 7 A need about 3 more periods each to finish Simple Equations. Lines and Angles is in the half-yearly syllabus; you could ask the Academic Head to move it to the annual exam, or use Saturday’s revision period.' : '8 B is one chapter behind. Conservation of Plants and Animals could be taught in the two periods after the exams instead of revision.'}
      </Suggestion>
    </div>
  );
}

function SchoolProgress() {
  const [g, setG] = useState('all');
  const [q, setQ] = useState('');
  const rows = SCHOOL_PROGRESS.filter((r) => (g === 'all' || r.sec.startsWith(g + ' ')) && (!q || r.sec.toLowerCase().includes(q.toLowerCase()) || r.subj.toLowerCase().includes(q.toLowerCase()) || (r.teacher || '').toLowerCase().includes(q.toLowerCase())));
  const late = SCHOOL_PROGRESS.filter((r) => r.done < r.plan - 3);
  const avgD = Math.round(SCHOOL_PROGRESS.reduce((a, r) => a + r.done, 0) / SCHOOL_PROGRESS.length);
  const avgP = Math.round(SCHOOL_PROGRESS.reduce((a, r) => a + r.plan, 0) / SCHOOL_PROGRESS.length);
  return (
    <div className="flex flex-col gap-5 @lg:gap-6">
      <Stats items={[
        { label: 'Syllabus done', value: `${avgD}%`, sub: `${avgP}% planned by today`, icon: 'BookCheck' },
        { label: 'Running late', value: late.length, sub: 'Subjects more than 3% behind', tone: 'bad', icon: 'TriangleAlert' },
        { label: 'Daily log today', value: '41 of 58', sub: 'Teachers have logged', icon: 'ListChecks' },
        { label: 'Lesson plans', value: 212, sub: 'Written this week', icon: 'NotebookPen' },
      ]} />
      <Split side={340}>
        <Card className="overflow-hidden">
          <Toolbar>
            <SearchBox id="sp-search" value={q} onChange={setQ} placeholder="Class, subject or teacher" />
            <div className="flex gap-2"><Segmented value={g} onChange={setG} options={[{ value: 'all', label: 'All' }, '6', '7', '8', '9', '10']} /><ExportButton what="syllabus progress" /></div>
          </Toolbar>
          <DataList rows={rows} rowKey={(r) => r.id} minWidth={640}
            columns={[
              { key: 'sec', label: 'Class', render: (r) => <span className="font-semibold">{r.sec}</span> },
              { key: 'subj', label: 'Subject' },
              { key: 'teacher', label: 'Teacher', render: (r) => <span className="text-ink2">{r.teacher}</span> },
              { key: 'bar', label: 'Done against planned', render: (r) => <div className="flex items-center gap-2.5 w-52"><span className="flex-1"><ProgressBar2 done={r.done} plan={r.plan} /></span><span className={cx('text-[13px] font-semibold tnum whitespace-nowrap', r.done < r.plan - 3 && 'text-bad')}>{r.done}% / {r.plan}%</span></div> },
            ]}
            mobile={(r) => ({ title: `${r.sec} · ${r.subj}`, sub: r.teacher, icon: r.done < r.plan - 3 ? 'TriangleAlert' : 'BookCheck', iconTone: r.done < r.plan - 3 ? 'bad' : 'ok', right: <span className={cx('text-[13px] font-semibold tnum', r.done < r.plan - 3 && 'text-bad')}>{r.done}%<span className="block text-[11.5px] text-ink3 font-normal">of {r.plan}%</span></span> })}
            footer={`Showing ${rows.length} of ${SCHOOL_PROGRESS.length}`} />
        </Card>
        <Card>
          <CardHead title="Chapters running late" sub="Planned dates have passed" icon={I.TriangleAlert} />
          <ul className="px-2 pb-2">
            {[{ t: 'Lines and Angles', s: '7 B, 7 A Maths · Imran Shaikh · from 28 Sep' }, { t: 'Simple Equations', s: '7 B Maths · Imran Shaikh · due 25 Sep' }, { t: 'Conservation of Plants and Animals', s: '8 B Science · Ravi Teja · from 5 Oct' }, ...late.filter((r) => !MY_PROGRESS['Imran Shaikh'].concat(MY_PROGRESS['Ravi Teja']).some((m) => m.sec === r.sec && m.subj === r.subj)).slice(0, 3).map((r) => ({ t: `${r.subj} · ${r.plan - r.done}% behind`, s: `${r.sec} · ${r.teacher}` }))].map((x) => (
              <li key={x.t + x.s}><Row icon="CalendarX2" iconTone="bad" title={x.t} sub={x.s} /></li>
            ))}
          </ul>
        </Card>
      </Split>
    </div>
  );
}

function SyllabusTree({ me }) {
  const toast = useToast();
  const canEdit = useCanEdit();
  const opts = me ? MY_PROGRESS[me].map((r) => ({ value: `${r.key}|${r.sec}`, label: `${r.sec} · ${r.subj}` })) : [{ value: 'Mathematics-7|7 B', label: '7 B · Mathematics' }, { value: 'Mathematics-6|6 A', label: '6 A · Mathematics' }, { value: 'Science-7|7 B', label: '7 B · Science' }, { value: 'Science-8|8 B', label: '8 B · Science' }];
  const [pick, setPick] = useState(opts[0].value);
  const [open, setOpen] = useState({ 'Simple Equations': true });
  const [ticks, setTicks] = useState({});
  const data = SYLLABUS[pick.split('|')[0]];
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col @md:flex-row @md:items-center gap-3 justify-between px-5 pt-4 pb-3">
        <div><h3 className="font-semibold text-[15px]">Syllabus</h3><p className="text-[13px] text-ink3">CBSE · units, chapters and topics with planned dates</p></div>
        <div className="flex gap-2 flex-wrap">
          <Select id="sy-pick" value={pick} onChange={setPick} className="w-56" options={opts} />
          {!me && canEdit && <MoreMenu label="Syllabus actions" items={[['Plus', 'Add chapter', () => toast({ title: 'Add chapter', body: 'Name, planned dates and topics', tone: 'info' })], ['Upload', 'Import from Excel', () => toast({ title: 'Import from Excel', body: 'Rows are checked before anything is added.', tone: 'info' })], ['Copy', 'Copy from another class or year', () => toast({ title: 'Copied from 2025–26 Class 7', body: '13 chapters, 61 topics. Dates moved to this year.' })]]} />}
        </div>
      </div>
      {data.units.map((u) => (
        <div key={u.n} className="border-t border-line">
          <p className="eyebrow text-ink3 px-5 pt-3 pb-1">{u.n}</p>
          <ul className="px-2 pb-2">
            {u.ch.map((c, i) => {
              const isOpen = open[c.n];
              return (
                <li key={c.n}>
                  <button onClick={() => c.topics && setOpen({ ...open, [c.n]: !isOpen })} className={cx('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left', c.topics && 'hover:bg-sunken/70')}>
                    <span className="w-7 h-7 rounded-lg bg-sunken text-[12px] font-bold grid place-items-center tnum shrink-0">{i + 1 + (u === data.units[1] ? data.units[0].ch.length : 0)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-[14.5px] truncate">{c.n}</span>
                      <span className={cx('block text-[12.5px] truncate', c.late ? 'text-bad font-semibold' : 'text-ink3')}>{c.dates || (c.st === 'Planned' ? 'Dates to be planned' : 'Term 1')}{c.late ? ' · running late' : ''}</span>
                    </span>
                    <Pill tone={ST_TONE[c.st]}>{c.st}</Pill>
                    {c.topics && <I.ChevronDown size={17} className={cx('text-ink3 transition shrink-0', isOpen && 'rotate-180')} />}
                  </button>
                  {c.topics && isOpen && (
                    <ul className="ml-[52px] mr-3 mb-2 border-l-2 border-line pl-3 flex flex-col">
                      {c.topics.map(([t, st]) => {
                        const s2 = ticks[t] || st;
                        return (
                          <li key={t} className="flex items-center gap-3 py-1.5">
                            {me && canEdit ? <Checkbox label={`Taught: ${t}`} checked={s2 === 'Completed' || s2 === 'Taught'} onChange={(on) => { setTicks({ ...ticks, [t]: on ? 'Taught' : 'Pending' }); toast({ title: on ? `Marked taught: ${t}` : `Marked pending: ${t}`, body: 'Progress for this class updates now.' }); }} />
                              : <span className={cx('w-2 h-2 rounded-full shrink-0', s2 === 'Completed' ? 'bg-ok' : s2 === 'Taught' ? 'bg-info' : s2 === 'Pending' ? 'bg-bad' : 'bg-ink3/40')} />}
                            <span className="text-[13.5px] flex-1 min-w-0">{t}</span>
                            <span className={cx('text-[12px] font-semibold', s2 === 'Pending' ? 'text-bad' : 'text-ink3')}>{s2}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </Card>
  );
}

function LessonPlans({ me, onWrite }) {
  const [q, setQ] = useState('');
  const [st, setSt] = useState('all');
  const all = me ? LESSONS[me].map((l) => ({ ...l, teacher: me })) : [...LESSONS['Imran Shaikh'].map((l) => ({ ...l, teacher: 'Imran Shaikh' })), ...LESSONS['Ravi Teja'].map((l) => ({ ...l, teacher: 'Ravi Teja' })), { id: 'x1', when: 'Today · P4', sec: '9 A', topic: 'Polynomials: remainder theorem', st: 'Written', teacher: 'Swapna Reddy' }, { id: 'x2', when: 'Today · P2', sec: '6 A', topic: 'Light and shadows: pinhole camera', st: 'Taught', teacher: 'Pallavi Reddy' }];
  const rows = all.filter((l) => (st === 'all' || (st === 'todo' ? l.st === 'Not written' || l.st === 'Draft' : l.st === st)) && (!q || l.topic.toLowerCase().includes(q.toLowerCase()) || l.sec.includes(q) || l.teacher.toLowerCase().includes(q.toLowerCase())));
  return (
    <Card className="overflow-hidden">
      <Toolbar>
        <SearchBox id="lp-search" value={q} onChange={setQ} placeholder="Topic, class or teacher" />
        <Segmented value={st} onChange={setSt} options={[{ value: 'all', label: 'All' }, { value: 'todo', label: 'To write' }, { value: 'Written', label: 'Written' }, { value: 'Taught', label: 'Taught' }]} />
      </Toolbar>
      <DataList rows={rows} rowKey={(r) => r.id} minWidth={680} onRow={(r) => onWrite(r)}
        columns={[
          { key: 'when', label: 'When', nowrap: true, render: (r) => <span className="font-semibold">{r.when}</span> },
          { key: 'sec', label: 'Class' },
          { key: 'topic', label: 'Topic' },
          ...(me ? [] : [{ key: 'teacher', label: 'Teacher', render: (r) => <span className="text-ink2">{r.teacher}</span> }]),
          { key: 'st', label: 'Plan', render: (r) => <Pill tone={LESSON_TONE[r.st]}>{r.st}</Pill> },
        ]}
        mobile={(r) => ({ icon: 'NotebookPen', iconTone: LESSON_TONE[r.st] === 'neutral' ? 'neutral' : LESSON_TONE[r.st], title: r.topic, sub: `${r.when} · ${r.sec}${me ? '' : ` · ${r.teacher}`}`, pills: [<Pill key="s" tone={LESSON_TONE[r.st]} className="!h-[22px] !text-[11.5px]">{r.st}</Pill>] })}
        footer={`Showing ${rows.length} of ${all.length} lesson plans`} />
    </Card>
  );
}

function LessonPlanSheet({ p, me, onClose }) {
  const toast = useToast();
  const [f, setF] = useState(null);
  const [ai, setAi] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  if (!p) return null;
  const mine = me || 'Imran Shaikh';
  const classOpts = MY_PROGRESS[mine].map((r) => `${r.sec} · ${r.subj}`);
  const v = f || { cls: p.sec ? `${p.sec} · ${T_BY[p.teacher || mine]?.s || 'Mathematics'}` : classOpts[0], topic: p.topic || '4.6 From solution to equation', date: p.when ? p.when : 'Sat 10 Oct · P3', obj: '', res: '', act: '', hw: false };
  const set = (k, x) => setF({ ...v, [k]: x });
  const err = !v.topic.trim() ? 'Choose a topic' : '';
  const close = () => { onClose(); setF(null); setAi(null); setTried(false); };
  const draft = () => {
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      setAi({ obj: 'Form a simple equation from a given solution and check it by putting the value back. Explain each step in words.', res: 'Textbook pages 87–88; number cards 1 to 20; a balance-scale drawing on the board', act: 'Warm-up (5 min): “I am thinking of a number” game. Pairs (15 min): each pair writes 3 equations whose answer is 4 and swaps. Wrap-up (5 min): two pairs explain on the board. Homework: Exercise 4.3, Q1 to Q3.' });
    }, 900);
  };
  return (
    <Sheet open onClose={close} title={p.topic ? 'Lesson plan' : 'Write lesson plan'} sub={`${mine} · ${v.cls}`} wide
      footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" icon={I.Check} onClick={() => { setTried(true); if (err) return; close(); toast({ title: `Lesson plan saved: ${v.topic}`, body: v.hw ? 'Homework created too. It goes out on the day of the lesson.' : `${v.cls} · ${v.date}` }); }}>Save plan</Button></>}>
      <div className="flex flex-col gap-4">
        <div className="grid @sm:grid-cols-2 gap-3">
          <Field label="Class, section, subject" id="lp-cls" required><Select id="lp-cls" value={v.cls} onChange={(x) => set('cls', x)} options={[...new Set([v.cls, ...classOpts])]} /></Field>
          <Field label="Date" id="lp-date" required hint="Next period of this subject"><Input id="lp-date" value={v.date} onChange={(e) => set('date', e.target.value)} /></Field>
        </div>
        <Field label="Topic" id="lp-topic" required error={tried && err} hint="The next pending topic is picked for you"><Input id="lp-topic" value={v.topic} onChange={(e) => set('topic', e.target.value)} error={tried && err} /></Field>
        {!ai ? (
          <div className="rounded-xl border border-dashed border-brand/40 bg-brand/[.03] px-4 py-3 flex flex-col @sm:flex-row @sm:items-center gap-3">
            <p className="text-[13.5px] text-ink2 flex-1">Want a starting point? The teacher assistant can draft objectives, resources and activities for this topic. You edit before saving.</p>
            <Button size="sm" variant="soft" icon={I.Sparkles} loading={busy} onClick={draft}>{busy ? 'Drafting…' : 'Draft with AI'}</Button>
          </div>
        ) : (
          <Suggestion title="Draft for this lesson" source={`the CBSE Class 7 syllabus, the topic and your last two plans for ${v.cls.split(' · ')[0]}`}
            actions={<><Button size="sm" variant="primary" icon={I.Check} onClick={() => { setF({ ...v, obj: ai.obj, res: ai.res, act: ai.act }); setAi(null); }}>Use this draft</Button><Button size="sm" variant="ghost" onClick={() => setAi(null)}>Dismiss</Button></>}>
            <p><b className="font-semibold text-ink">Objectives:</b> {ai.obj}</p>
            <p className="mt-1.5"><b className="font-semibold text-ink">Resources:</b> {ai.res}</p>
            <p className="mt-1.5"><b className="font-semibold text-ink">Activities and homework:</b> {ai.act}</p>
          </Suggestion>
        )}
        <Field label="Objectives" id="lp-obj"><Textarea id="lp-obj" value={v.obj} onChange={(x) => set('obj', x)} rows={2} placeholder="What students should be able to do" /></Field>
        <Field label="Resources" id="lp-res" hint="Links or files"><Textarea id="lp-res" value={v.res} onChange={(x) => set('res', x)} rows={2} placeholder="Textbook pages, worksheets, videos" /></Field>
        <Field label="Activities and homework" id="lp-act"><Textarea id="lp-act" value={v.act} onChange={(x) => set('act', x)} rows={3} /></Field>
        <label htmlFor="lp-hw" className="flex items-center gap-2.5 text-[14px]"><Checkbox id="lp-hw" checked={v.hw} onChange={(x) => set('hw', x)} label="Also give the homework" />Also give the homework in Homework & Learning</label>
      </div>
    </Sheet>
  );
}

function DailyLog({ me }) {
  const toast = useToast();
  const wk = weekFor(me)[TODAY_D];
  const plans = LESSONS[me].filter((l) => l.when.startsWith('Today'));
  const [done, setDone] = useState(() => Object.fromEntries(plans.map((l) => [l.id, l.st === 'Taught'])));
  const n = Object.values(done).filter(Boolean).length;
  return (
    <Card>
      <CardHead title="Today, Fri 9 Oct" sub={`Tick what you taught. ${n} of ${plans.length} done.`} icon={I.ListChecks} />
      <ul className="px-2 pb-2">
        {plans.map((l) => {
          const p = Number(l.when.split('P')[1]) - 1;
          const later = p > NOW_P;
          return (
            <li key={l.id}>
              <label htmlFor={`dl-${l.id}`} className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-sunken/60 cursor-pointer">
                <Checkbox id={`dl-${l.id}`} label={l.topic} checked={done[l.id]} onChange={(on) => { setDone({ ...done, [l.id]: on }); toast({ title: on ? `${l.sec}: marked taught` : `${l.sec}: unticked`, body: on ? `${l.topic}. Syllabus progress for ${l.sec} updated.` : 'Progress set back.' }); }} />
                <span className="min-w-0 flex-1"><span className="block font-semibold text-[14.5px]">{l.sec} · P{p + 1} <span className="text-ink3 font-normal tnum">{PT(p)}</span></span><span className="block text-[13px] text-ink3 truncate">{l.topic}</span></span>
                {p === NOW_P ? <Pill tone="brand">Now</Pill> : later ? <Pill tone="neutral">Later</Pill> : null}
              </label>
            </li>
          );
        })}
      </ul>
      <p className="px-5 pb-4 text-[12.5px] text-ink3">Also on your home screen: two taps after each period. {wk.filter(Boolean).length} periods today plus 1 substitution, which needs no log.</p>
    </Card>
  );
}

function SchoolLog() {
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();
  const canEdit = useCanEdit();
  return (
    <div className="grid @xl:grid-cols-2 gap-5 @lg:gap-6 items-start">
      <Card>
        <CardHead title="Logged today" sub="41 of 58 teachers · newest first" icon={I.ListChecks} />
        <ul className="px-2 pb-2">{LOGGED.map((x) => <li key={x.n}><Row avatar={x.n} title={x.n} sub={x.what} right={<span className="text-[12.5px] text-ink3 tnum">{x.at}</span>} /></li>)}</ul>
        <p className="px-5 pb-4 text-[12.5px] text-ink3">and 36 more</p>
      </Card>
      <Card>
        <CardHead title="Not logged yet" sub="17 teachers · it is still period 3" icon={I.Clock} action={canEdit && <Button size="sm" variant="soft" icon={I.Bell} onClick={() => setConfirm(true)}>Remind</Button>} />
        <ul className="px-2 pb-2">{NOT_LOGGED.map((n) => <li key={n}><Row avatar={n} title={n} sub={T_BY[n] ? `${T_BY[n].s} · ${T_BY[n].cls}` : ''} /></li>)}</ul>
        <p className="px-5 pb-4 text-[12.5px] text-ink3">and 12 more</p>
      </Card>
      <ConfirmSheet open={confirm} onClose={() => setConfirm(false)} title="Remind 17 teachers?" confirmLabel="Remind 17 teachers"
        onConfirm={() => toast({ title: 'Reminder sent to 17 teachers', body: 'On the app only. No SMS.' })}>
        <p className="text-[14px] text-ink2">Each gets one message on the app: “Please tick what you taught today in the daily log.” Nobody gets it twice today.</p>
      </ConfirmSheet>
    </div>
  );
}

/* =====================================================================================
   Academic Settings
   ===================================================================================== */

const YEARS = [
  { y: '2027–28', st: 'Next', dates: '1 Jun 2027 to 31 Mar 2028', note: 'Being prepared for admissions · nothing recorded yet', by: 'Created 2 Oct 2026 by Anita Sharma' },
  { y: '2026–27', st: 'Active', dates: '1 Jun 2026 to 31 Mar 2027', note: 'School day 86 of 220', by: 'Opened 1 Apr 2026' },
  { y: '2025–26', st: 'Closed', dates: '1 Jun 2025 to 31 Mar 2026', note: 'Read-only · closed 15 Apr 2026 by Lakshmi Rao', by: '' },
  { y: '2024–25', st: 'Closed', dates: '3 Jun 2024 to 31 Mar 2025', note: 'Read-only · closed 12 Apr 2025 by Lakshmi Rao', by: '' },
];
const BELLS = [
  { k: 'Assembly', t: '8:30–8:45', brk: true }, ...PERIODS.slice(0, 2).map((x) => ({ k: `Period ${x.p}`, t: x.t })), { k: 'Short break', t: '10:15–10:30', brk: true },
  ...PERIODS.slice(2, 4).map((x) => ({ k: `Period ${x.p}`, t: x.t })), { k: 'Lunch', t: '12:00–12:40', brk: true }, ...PERIODS.slice(4, 6).map((x) => ({ k: `Period ${x.p}`, t: x.t })),
  { k: 'Short break', t: '2:10–2:20', brk: true }, ...PERIODS.slice(6).map((x) => ({ k: `Period ${x.p}`, t: x.t })),
];

function AcademicSettingsPage({ access }) {
  const toast = useToast();
  const { role } = useRole();
  const canEdit = useCanEdit() && access === 'full';
  const [years, setYears] = useState(YEARS);
  const [remove, setRemove] = useState(false);
  const [close, setClose] = useState(false);
  const [fix, setFix] = useState(null);
  const [terms, setTerms] = useState(false);
  const [bell, setBell] = useState(null);
  const [days, setDays] = useState([true, true, true, true, true, true, false]);
  const [people, setPeople] = useState(['Lakshmi Rao · Principal', 'Anita Sharma · School Admin']);
  const [addP, setAddP] = useState(false);
  const [conds, setConds] = useState(['No Mathematics in period 8 · all classes', 'Physical Education not in period 1 · all classes', 'Science lab as a double period on Thursday · Classes 9 and 10']);
  const mayCorrect = ['principal', 'schooladmin'].includes(role.id);
  return (
    <div>
      <ModuleHead sub="Years and terms, the school day, periods and bells, and time table rules" />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Card>
          <CardHead title="Academic years" sub="One active year at a time. Closed years are read-only." icon={I.CalendarRange} />
          <ul className="divide-y divide-line/70 border-t border-line/70">
            {years.map((y) => (
              <li key={y.y} className="flex flex-col @md:flex-row @md:items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[15px] flex items-center gap-2 flex-wrap">{y.y}<Pill tone={y.st === 'Active' ? 'ok' : y.st === 'Next' ? 'info' : 'neutral'} dot={y.st === 'Active'}>{y.st === 'Next' ? 'Next year' : y.st}</Pill></p>
                  <p className="text-[13px] text-ink3">{y.dates} · {y.note}</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {y.st === 'Next' && canEdit && <><Button size="sm" variant="ghost" icon={I.Pencil} onClick={() => toast({ title: 'Edit 2027–28 dates', body: 'Start and end date. Terms move with them.', tone: 'info' })}>Edit dates</Button><Button size="sm" variant="dangerSoft" icon={I.Trash2} onClick={() => setRemove(true)}>Remove year</Button></>}
                  {y.st === 'Active' && canEdit && <Button size="sm" variant="secondary" icon={I.Lock} onClick={() => setClose(true)}>Close year</Button>}
                  {y.st === 'Closed' && (mayCorrect && access === 'full' ? <Button size="sm" variant="secondary" icon={I.PencilLine} onClick={() => setFix(y.y)}>Make a correction</Button> : <span className="text-[12.5px] text-ink3">Corrections by permitted people only</span>)}
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <div className="grid @xl:grid-cols-2 gap-5 @lg:gap-6 items-start">
          <Card>
            <CardHead title="Terms" sub="Two terms, from the CBSE default in School Profile" icon={I.Layers} action={canEdit && <Button size="sm" variant="ghost" icon={I.Pencil} onClick={() => setTerms(true)}>Edit</Button>} />
            <ul className="px-5 pb-5 flex flex-col gap-3">
              {[{ n: 'Term 1', d: '1 Jun 2026 to 31 Oct 2026', e: 'Half-yearly exams 12 to 27 Oct', on: true }, { n: 'Term 2', d: '2 Nov 2026 to 31 Mar 2027', e: 'Annual exams in March' }].map((t) => (
                <li key={t.n} className="rounded-xl border border-line p-3.5 flex items-center gap-3">
                  <span className={cx('w-10 h-10 rounded-xl grid place-items-center shrink-0', t.on ? 'bg-brand/10 text-brand' : 'bg-sunken text-ink3')}><I.CalendarDays size={19} /></span>
                  <div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px]">{t.n}{t.on && <span className="text-[12px] text-brand font-semibold"> · now</span>}</p><p className="text-[12.5px] text-ink3">{t.d} · {t.e}</p></div>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHead title="School day" sub="Timings and working days" icon={I.Sun} />
            <div className="px-5 pb-2">
              <p className="text-[13px] font-semibold text-ink2 mb-2">Working days</p>
              <div className="flex gap-1.5 flex-wrap">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => (
                  <button key={d} aria-pressed={days[i]} disabled={!canEdit} onClick={() => { const n = [...days]; n[i] = !n[i]; setDays(n); toast({ title: `${d}: ${n[i] ? 'working day' : 'holiday'}`, body: 'Saved. Recorded in the audit log.' }); }}
                    className={cx('h-10 w-12 rounded-xl text-[13px] font-semibold border transition', days[i] ? 'bg-brand/10 border-brand/30 text-brand' : 'bg-surface border-line text-ink3', canEdit && 'hover:border-ink3/50')}>{d}</button>
                ))}
              </div>
            </div>
            <div className="divide-y divide-line/70 mt-2 border-t border-line/70">
              <SettingRow title="School timings" sub="Assembly to the last bell"><span className="text-[14px] font-semibold tnum">8:30 AM – 3:45 PM</span></SettingRow>
              <SettingRow title="Working days this year" sub="After holidays from the School Calendar"><span className="text-[14px] font-semibold tnum">220</span></SettingRow>
              <SettingRow id="sd-sat2" title="Second Saturday holiday" sub="Off: every Saturday is a working day"><SwitchSave id="sd-sat2" title="Second Saturday holiday" on={false} /></SettingRow>
              <SettingRow id="sd-half" title="Saturday half day" sub="Periods 1 to 4 only"><SwitchSave id="sd-half" title="Saturday half day" on={false} /></SettingRow>
            </div>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <CardHead title="Periods and bells" sub="Monday to Saturday use the same times. Pre-primary goes home after period 5." icon={I.BellRing}
            action={canEdit && <Button size="sm" variant="soft" icon={I.Plus} onClick={() => setBell({ k: 'New period', t: '' })}>Add</Button>} />
          <ul className="grid @md:grid-cols-2 gap-x-6 px-5 pb-4">
            {BELLS.map((b, i) => (
              <li key={i} className="flex items-center gap-3 py-2 border-b border-line/60">
                <span className={cx('w-8 h-8 rounded-lg grid place-items-center shrink-0', b.brk ? 'bg-sunken text-ink3' : 'bg-brand/10 text-brand')}>{b.brk ? (b.k === 'Lunch' ? <I.UtensilsCrossed size={15} /> : b.k === 'Assembly' ? <I.Users size={15} /> : <I.Coffee size={15} />) : <span className="text-[12px] font-bold">{b.k.split(' ')[1]}</span>}</span>
                <span className={cx('flex-1 text-[14px]', b.brk ? 'text-ink2' : 'font-semibold')}>{b.k}</span>
                <span className="text-[13.5px] tnum text-ink2">{b.t}</span>
                {canEdit && <button onClick={() => setBell(b)} className="w-8 h-8 grid place-items-center rounded-lg text-ink3 hover:bg-sunken" aria-label={`Edit ${b.k}`}><I.Pencil size={15} /></button>}
              </li>
            ))}
          </ul>
        </Card>

        <div className="grid @xl:grid-cols-2 gap-5 @lg:gap-6 items-start">
          <SettingsCard title="Teacher workload" sub="Used by Teacher Allocation and the clash check" icon={I.Gauge}
            rows={[{ title: 'Most periods in a day', value: '7' }, { title: 'Most periods in a week', value: '32' }, { title: 'Most periods in a row', sub: 'Limit on consecutive periods', value: '3' }]} />
          <Card>
            <CardHead title="Subject conditions" sub="Rules the automatic time table follows" icon={I.Ban}
              action={canEdit && <Button size="sm" variant="soft" icon={I.Plus} onClick={() => { const c = 'Telugu not in period 8 · Classes 1 to 5'; setConds([...conds, c]); toast({ title: 'Rule added', body: c, undo: () => setConds((x) => x.filter((y) => y !== c)) }); }}>Add rule</Button>} />
            <ul className="px-2 pb-2">
              {conds.map((c) => <li key={c}><Row icon="Ban" title={c.split(' · ')[0]} sub={c.split(' · ')[1]} right={canEdit && <button className="w-8 h-8 grid place-items-center rounded-lg text-ink3 hover:bg-sunken" aria-label={`Remove ${c}`} onClick={() => { setConds(conds.filter((x) => x !== c)); toast({ title: 'Rule removed', undo: () => setConds((x) => [...x, c]) }); }}><I.X size={16} /></button>} /></li>)}
            </ul>
          </Card>
          <Card>
            <CardHead title="Teacher preferences" sub="12 teachers · used when making the time table" icon={I.UserCog} />
            <ul className="px-2 pb-2">
              {[['Farhana Begum', 'No period 1 on Monday (bus duty)'], ['Mohammed Asif', 'Free in period 8 on Saturday (sports practice)'], ['Imran Shaikh', 'At most 3 periods in a row'], ['Kalyani Sastry', 'Not on Wednesday afternoon (music exam board)']].map(([n, x]) => <li key={n}><Row avatar={n} title={n} sub={x} /></li>)}
            </ul>
            <p className="px-5 pb-4 text-[12.5px] text-ink3">and 8 more</p>
          </Card>
          <SettingsCard title="Substitutions" icon={I.Repeat}
            rows={[{ title: 'Raise substitutions from approved leave', sub: 'The teacher’s periods appear in Substitutions by themselves', on: true }, { title: 'Tell the class teacher', sub: 'When a substitute is assigned to their class', on: true }, { title: 'Count extra periods for salary', sub: 'Off: substitutions are not paid at this school', on: false }]} />
        </div>

        <Card>
          <CardHead title="Correct a closed year" sub="Who may change records of a closed year. Every change needs a reason and is logged." icon={I.ShieldCheck}
            action={canEdit && <Button size="sm" variant="soft" icon={I.UserPlus} onClick={() => setAddP(true)}>Add person</Button>} />
          <div className="grid @xl:grid-cols-2 gap-5 px-5 pb-5">
            <ul className="flex flex-col gap-2">
              {people.map((p) => (
                <li key={p} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
                  <Avatar name={p.split(' · ')[0]} size={34} />
                  <span className="flex-1 min-w-0"><span className="block font-semibold text-[14px] truncate">{p.split(' · ')[0]}</span><span className="block text-[12.5px] text-ink3">{p.split(' · ')[1]}</span></span>
                  {canEdit && people.length > 1 && !p.startsWith('Lakshmi') && <Button size="sm" variant="ghost" onClick={() => { setPeople(people.filter((x) => x !== p)); toast({ title: `${p.split(' · ')[0]} can no longer correct closed years`, undo: () => setPeople((x) => [...x, p]) }); }}>Remove</Button>}
                </li>
              ))}
            </ul>
            <div>
              <p className="eyebrow text-ink3 mb-2">Recent corrections</p>
              <Timeline items={[
                { icon: 'PencilLine', tone: 'warn', what: 'Anita Sharma changed Kabir Naidu (8 C) on 12 Mar 2026 in 2025–26 from Absent to Present. Reason: medical certificate came late.', when: '18 Jul 2026 · approved by Lakshmi Rao' },
                { icon: 'PencilLine', tone: 'warn', what: 'Lakshmi Rao corrected Annual exam Science marks for Diya Patel (8 A) in 2025–26 from 61 to 67. Reason: totalling error.', when: '24 Apr 2026' },
              ]} />
            </div>
          </div>
        </Card>
      </div>

      <ConfirmSheet open={remove} onClose={() => setRemove(false)} danger typeToConfirm="2027-28" title="Remove 2027–28?" confirmLabel="Remove 2027–28"
        onConfirm={() => { setYears(years.filter((y) => y.st !== 'Next')); toast({ title: '2027–28 removed', body: 'Its classes, sections and terms were removed too. Written to the audit log.' }); }}>
        <p className="text-[14px] text-ink2">Nothing has been recorded in it yet: no attendance, fees or marks. Its 13 classes, 43 sections and 2 terms are removed too. Once anything is recorded in a year, it can only be closed.</p>
      </ConfirmSheet>
      <ConfirmSheet open={close} onClose={() => setClose(false)} danger typeToConfirm="CLOSE 2026-27" title="Close 2026–27?" confirmLabel="Close 2026–27"
        onConfirm={() => toast({ title: '2026–27 closed', body: 'Everything in it is now read-only. 2027–28 becomes the active year.', tone: 'info' })}>
        <div className="flex flex-col gap-3 text-[14px] text-ink2">
          <Banner tone="warn" title="It is only day 86 of 220.">Usually a year is closed in April, after results and promotion.</Banner>
          <p className="font-semibold text-ink">What happens</p>
          <ul className="list-disc pl-5 flex flex-col gap-1.5">
            <li>Attendance, marks, fees, homework and every other record of 2026–27 become read-only.</li>
            <li>Fees still due (₹8.4 L from 61 students) carry forward to 2027–28 as previous dues.</li>
            <li>Only {people.map((p) => p.split(' · ')[0]).join(' and ')} can change anything after this, with a reason. Each change is logged.</li>
          </ul>
          <p className="font-semibold text-ink">Not done yet</p>
          <ul className="flex flex-col gap-1.5">
            {['Annual results published', 'Promotion of 1,236 students', 'Day Book closed for March'].map((x) => <li key={x} className="flex items-center gap-2"><I.CircleDashed size={16} className="text-warn" />{x}</li>)}
          </ul>
        </div>
      </ConfirmSheet>
      <FormSheet open={!!fix} onClose={() => setFix(null)} title={`Make a correction in ${fix}`} sub="The year stays closed. Only this change is made, and the original is kept in the audit log." submitLabel="Save correction"
        onSubmit={() => toast({ title: `Correction saved in ${fix}`, body: 'Original kept in the audit log with your reason.' })}>
        <Field label="What to correct" id="fx-what" required><SelectL id="fx-what" init="att" options={[{ value: 'att', label: 'Attendance mark' }, { value: 'marks', label: 'Exam marks' }, { value: 'tc', label: 'Leaving date on a transfer certificate' }]} /></Field>
        <Field label="Student" id="fx-stu" required><Input id="fx-stu" placeholder="Name or admission number" /></Field>
        <Field label="Reason" id="fx-why" required hint="Shown in the audit log"><TextL id="fx-why" rows={2} placeholder="Medical certificate came after the year closed" /></Field>
      </FormSheet>
      <FormSheet open={terms} onClose={() => setTerms(false)} title="Edit terms" sub="Terms must sit inside the year and must not overlap." submitLabel="Save terms" onSubmit={() => toast({ title: 'Terms saved', body: 'Term 1: 01-06-2026 to 31-10-2026 · Term 2: 02-11-2026 to 31-03-2027' })}>
        <TermFields />
      </FormSheet>
      <FormSheet open={!!bell} onClose={() => setBell(null)} title={bell?.k === 'New period' ? 'Add a period or break' : `Edit ${bell?.k}`} sub="Changes every class’s time table from the date you choose." submitLabel="Save"
        onSubmit={() => toast({ title: `${bell?.k} saved`, body: 'Time tables show the new times from Mon 12 Oct.' })}>
        <Field label="Name" id="bl-name" required><Input id="bl-name" defaultValue={bell?.k === 'New period' ? '' : bell?.k} placeholder="Period 9" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts" id="bl-s" required><Input id="bl-s" defaultValue={bell?.t?.split('–')[0]} placeholder="3:45" className="tnum" /></Field>
          <Field label="Ends" id="bl-e" required><Input id="bl-e" defaultValue={bell?.t?.split('–')[1]} placeholder="4:25" className="tnum" /></Field>
        </div>
      </FormSheet>
      <FormSheet open={addP} onClose={() => setAddP(false)} title="Who else may correct a closed year?" submitLabel="Add person"
        onSubmit={() => { setPeople([...people, 'Srinivas Murthy · Vice Principal']); toast({ title: 'Srinivas Murthy can now correct closed years', body: 'With a reason each time. Logged.' }); }}>
        <Field label="Person" id="ap-who" required><SelectL id="ap-who" init="vp" options={[{ value: 'vp', label: 'Srinivas Murthy · Vice Principal' }, { value: 'ah', label: 'Meena Pillai · Academic Head' }]} /></Field>
      </FormSheet>
    </div>
  );
}

function SwitchSave({ id, title, on: start }) {
  const [on, setOn] = useState(start);
  const toast = useToast();
  const canEdit = useCanEdit();
  return <Switch id={id} on={on} label={title} onChange={(v) => { if (!canEdit) return; setOn(v); toast({ title: `${title}: ${v ? 'on' : 'off'}`, body: 'Saved. Recorded in the audit log.' }); }} />;
}

function TermFields() {
  const [t1, setT1] = useState('31-10-2026');
  const [t2, setT2] = useState('02-11-2026');
  const toN = (s) => (okDate(s) ? Number(s.split('-').reverse().join('')) : 0);
  const err = toN(t2) && toN(t1) && toN(t2) <= toN(t1) ? 'Term 2 starts before Term 1 ends' : '';
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <DateL id="tm-1s" label="Term 1 starts" required init="01-06-2026" />
        <DateField id="tm-1e" label="Term 1 ends" required value={t1} onChange={setT1} error={!okDate(t1) ? 'Use DD-MM-YYYY' : ''} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <DateField id="tm-2s" label="Term 2 starts" required value={t2} onChange={setT2} error={err || (!okDate(t2) ? 'Use DD-MM-YYYY' : '')} />
        <DateL id="tm-2e" label="Term 2 ends" required init="31-03-2027" />
      </div>
    </>
  );
}

/* ===================================================================================== */

export const ACADEMIC_PAGES = {
  classes: ClassesPage,
  subjects: SubjectsPage,
  allocation: AllocationPage,
  timetable: TimeTablePage,
  substitutions: SubstitutionsPage,
  syllabus: SyllabusPage,
  settings: AcademicSettingsPage,
};
