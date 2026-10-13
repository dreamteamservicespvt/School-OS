// Library Management (optional module, switched on for Sunrise Public School). Example data only.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as I from './icons.js';
import { STUDENTS, FEATURED, CLASSES, inr } from './data.js';
import { STAFF } from './sample.js';
import { cx, Card, CardHead, Button, Pill, Avatar, Input, Field, Segmented, Empty, Sheet, Switch, Spinner, useToast, inputCls } from './ui.jsx';
import { useNav, useRole } from './shell.jsx';
import {
  ModuleHead, useCanEdit, Stats, SearchBox, Toolbar, Select, Textarea, Chips, DataList, BulkBar, SettingRow, SettingsCard,
  Banner, Suggestion, Progress, HBars, Bars, Legend, DL, MoreMenu, FormSheet, ConfirmSheet, Split, Col, ExportButton, TONE_SOFT,
  usePage, DatePeriod, PERIODS, fmtRange, fmtDay, periodDays, schoolDay,
} from './kit.jsx';

/* ======================= Sample data ======================= */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Dates as days from today (Fri 9 Oct 2026)
const dt = (off) => new Date(2026, 9, 9 + off);
const dshort = (off) => { const d = dt(off); return `${d.getDate()} ${MON[d.getMonth()]}`; };
const dday = (off) => { const d = dt(off); return `${DAY[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`; };
const dinput = (off) => { const d = dt(off); return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`; };
const FINE_DAY = 2, FINE_MAX = 100;
const HOLIDAYS = [[10, 16], [30, 30]]; // 19–25 Oct (Dussehra) and 8 Nov (Diwali), as days from today
const isHoliday = (off) => dt(off).getDay() === 0 || HOLIDAYS.some(([a, b]) => off >= a && off <= b);
// Due date from loan days; moves to the next school day when it lands on a holiday or Sunday
function dueFrom(days) {
  let off = days; let moved = false;
  while (isHoliday(off)) { off++; moved = true; }
  return { off, moved, first: days };
}

// ISBN check (10 or 13 digits, check digit), hyphens and spaces ignored
function isbnOk(raw) {
  const s = raw.replace(/[\s-]/g, '').toUpperCase();
  if (/^\d{9}[\dX]$/.test(s)) { let t = 0; for (let i = 0; i < 10; i++) t += (s[i] === 'X' ? 10 : Number(s[i])) * (10 - i); return t % 11 === 0; }
  if (/^\d{13}$/.test(s)) { let t = 0; for (let i = 0; i < 13; i++) t += Number(s[i]) * (i % 2 ? 3 : 1); return t % 10 === 0; }
  return false;
}
const isbn13 = (p) => { let t = 0; for (let i = 0; i < 12; i++) t += Number(p[i]) * (i % 2 ? 3 : 1); return p + ((10 - (t % 10)) % 10); };
const showIsbn = (s) => `${s.slice(0, 3)}-${s.slice(3, 5)}-${s.slice(5, 9)}-${s.slice(9, 12)}-${s.slice(12)}`;

// Members: every student and staff member is one. The Librarian sees name, photo, class or department only.
const groupOf = (clsId) => (['NUR', 'LKG', 'UKG', '1', '2'].includes(clsId) ? 1 : ['3', '4', '5'].includes(clsId) ? 2 : 3);
const stuM = (s) => ({ id: s.id, kind: 'Student', name: s.name, group: `${s.cls.replace('Class ', '')} ${s.sec}`, clsId: s.clsId, card: `LC-${s.adm.slice(4).replace('/', '-')}`, limit: groupOf(s.clsId), sid: s.id });
const staffM = (t) => ({ id: t.id, kind: 'Staff', name: t.name, group: t.dept, card: `LC-${t.code.slice(4)}`, limit: 5 });
const byName = (n) => STUDENTS.find((s) => s.name === n);
const staffBy = (n) => STAFF.find((t) => t.name === n);
const M = {
  aarav: stuM(FEATURED), meeraD: stuM(byName('Meera Das')), harini: stuM(byName('Harini Joshi')), meeraR: stuM(byName('Meera Rao')),
  harsha: stuM(byName('Harsha Sharma')), tejas: stuM(byName('Tejas Varma')), imran: staffM(staffBy('Imran Shaikh')), anitha: staffM(staffBy('Anitha Kumari')),
  deepak: staffM(staffBy('Deepak Verma')),
  kavya: { id: 'X-KR', kind: 'Student', name: 'Kavya Rao', group: '5 A', clsId: '5', card: 'LC-2022-0388', limit: 2 },
};

const BOOKS = [
  { id: 'B01', title: 'Wings of Fire', author: 'A. P. J. Abdul Kalam', pub: 'Universities Press', isbn: isbn13('978817371146'), cat: 'Biography', sub: 'General reading', shelf: 'B-2', price: 295, acc0: 10231, total: 4, out: 4, reserve: ['kavya', 'imran'], reads: 41 },
  { id: 'B02', title: 'Malgudi Days', author: 'R. K. Narayan', pub: 'Indian Thought Publications', isbn: isbn13('978818555404'), cat: 'Fiction', sub: 'English', shelf: 'A-4', price: 250, acc0: 10115, total: 5, out: 3, reads: 33 },
  { id: 'B03', title: 'The Jungle Book', author: 'Rudyard Kipling', pub: 'Penguin Classics', isbn: isbn13('978014119500'), cat: 'Fiction', sub: 'English', shelf: 'A-1', price: 199, acc0: 10385, total: 6, out: 2, reads: 29 },
  { id: 'B04', title: 'Ruskin Bond’s Children’s Omnibus', author: 'Ruskin Bond', pub: 'Rupa Publications', isbn: isbn13('978812910233'), cat: 'Fiction', sub: 'English', shelf: 'A-3', price: 395, acc0: 10450, total: 4, out: 1, reads: 26 },
  { id: 'B05', title: 'Harry Potter and the Philosopher’s Stone', author: 'J. K. Rowling', pub: 'Bloomsbury', isbn: isbn13('978140885565'), cat: 'Fiction', sub: 'English', shelf: 'A-5', price: 499, acc0: 10410, total: 5, out: 4, lost: 1, reserve: ['tejas', 'harsha', 'anitha'], reads: 52 },
  { id: 'B06', title: 'The Diary of a Young Girl', author: 'Anne Frank', pub: 'Penguin', isbn: isbn13('978014118527'), cat: 'Biography', sub: 'History', shelf: 'B-2', price: 299, acc0: 10520, total: 3, out: 2, reads: 18 },
  { id: 'B07', title: 'Panchatantra Stories', author: 'Anant Pai (retold)', pub: 'Amar Chitra Katha', isbn: isbn13('978818482088'), cat: 'Children’s', sub: 'Stories', shelf: 'D-1', price: 350, acc0: 10301, total: 8, out: 3, reads: 37 },
  { id: 'B08', title: 'Grandma’s Bag of Stories', author: 'Sudha Murty', pub: 'Puffin', isbn: isbn13('978014333562'), cat: 'Children’s', sub: 'Stories', shelf: 'D-2', price: 250, acc0: 10340, total: 6, out: 4, reserve: ['meeraR'], reads: 44 },
  { id: 'B09', title: 'Chandamama Kathalu', author: 'Various', pub: 'Chandamama Publications', isbn: isbn13('978938118004'), cat: 'Telugu', sub: 'Telugu', shelf: 'E-1', price: 180, acc0: 10560, total: 6, out: 2, reads: 21 },
  { id: 'B10', title: 'Godan', author: 'Munshi Premchand', pub: 'Rajkamal Prakashan', isbn: isbn13('978812670321'), cat: 'Hindi', sub: 'Hindi', shelf: 'E-3', price: 225, acc0: 10580, total: 3, out: 1, lost: 1, reads: 9 },
  { id: 'B11', title: 'A Brief History of Time', author: 'Stephen Hawking', pub: 'Bantam', isbn: isbn13('978055338016'), cat: 'Science', sub: 'Physics', shelf: 'C-3', price: 399, acc0: 10600, total: 2, out: 1, reads: 7 },
  { id: 'B12', title: 'Ignited Minds', author: 'A. P. J. Abdul Kalam', pub: 'Penguin', isbn: isbn13('978014302982'), cat: 'General', sub: 'General reading', shelf: 'B-3', price: 250, acc0: 10235, total: 3, out: 1, reads: 15 },
  { id: 'B13', title: 'Tinkle Digest 312', author: 'Tinkle editors', pub: 'ACK Media', isbn: isbn13('978938669142'), cat: 'Comics', sub: 'Comics', shelf: 'D-4', price: 120, acc0: 10885, total: 10, out: 4, damaged: 1, reads: 63 },
  { id: 'B14', title: 'Mathematics Olympiad Workbook, Class 7', author: 'MTG Editorial Board', pub: 'MTG Learning Media', isbn: isbn13('978938937103'), cat: 'General', sub: 'Mathematics', shelf: 'C-1', price: 325, acc0: 10700, total: 5, out: 2, reads: 19 },
  { id: 'B15', title: 'Science Exemplar Problems, Class 7', author: 'NCERT', pub: 'NCERT', isbn: isbn13('978938832307'), cat: 'Reference', sub: 'Science', shelf: 'R-1', price: 95, acc0: 10950, total: 10, out: 0, ref: true, reads: 0 },
  { id: 'B16', title: 'Oxford Student Atlas for India', author: 'Oxford editors', pub: 'Oxford University Press', isbn: isbn13('978019948620'), cat: 'Reference', sub: 'Geography', shelf: 'R-2', price: 450, acc0: 10960, total: 12, out: 0, ref: true, reads: 0 },
  { id: 'B17', title: 'The Adventures of Tom Sawyer', author: 'Mark Twain', pub: 'Penguin', isbn: isbn13('978014310729'), cat: 'Fiction', sub: 'English', shelf: 'A-6', price: 199, acc0: 10470, total: 4, out: 1, reads: 12 },
  { id: 'B18', title: 'Swami and Friends', author: 'R. K. Narayan', pub: 'Indian Thought Publications', isbn: isbn13('978818555401'), cat: 'Fiction', sub: 'English', shelf: 'A-4', price: 225, acc0: 10120, total: 4, out: 3, reads: 24 },
  { id: 'B19', title: 'Geronimo Stilton: The Kingdom of Fantasy', author: 'Geronimo Stilton', pub: 'Scholastic', isbn: isbn13('978043965101'), cat: 'Children’s', sub: 'Stories', shelf: 'D-3', price: 499, acc0: 10360, total: 5, out: 2, reads: 31 },
  { id: 'B20', title: 'Britannica Kids Encyclopaedia (8 volumes)', author: 'Britannica editors', pub: 'Encyclopaedia Britannica India', isbn: isbn13('978938170302'), cat: 'Reference', sub: 'General knowledge', shelf: 'R-3', price: 6800, acc0: 10975, total: 1, out: 0, ref: true, reads: 0 },
];
const BOOK = Object.fromEntries(BOOKS.map((b) => [b.id, b]));
const CATS = [['all', 'All', 3215], ['Fiction', 'Fiction', 1104], ['Children’s', 'Children’s', 642], ['Reference', 'Reference', 312], ['Science', 'Science', 236], ['Telugu', 'Telugu', 214], ['General', 'General', 202], ['Biography', 'Biography', 188], ['Hindi', 'Hindi', 176], ['Comics', 'Comics', 141]];

// Loans we know by name. off = days from today
const LOANS = {
  10232: { m: M.aarav, issued: -9, due: 5, renew: 0 },
  10231: { m: M.harsha, issued: -4, due: 10, renew: 0 },
  10233: { m: M.meeraR, issued: -2, due: 17, renew: 0 },
  10234: { m: M.anitha, issued: -12, due: 18, renew: 0 },
  10412: { m: M.meeraD, issued: -6, due: 8, renew: 0 },
  10117: { m: M.meeraD, issued: -6, due: 8, renew: 1 },
  10890: { m: M.meeraD, issued: -1, due: 17, renew: 0 },
  10388: { m: M.harini, issued: -19, due: -5, renew: 0 },
  10601: { m: M.imran, issued: -8, due: 22, renew: 0 },
  10702: { m: M.imran, issued: -24, due: 6, renew: 1 },
};
const POOL = STUDENTS.filter((s) => !['NUR', 'LKG', 'UKG'].includes(s.clsId) && s.id !== FEATURED.id);
const genLoan = (acc) => { const s = POOL[(acc * 7) % POOL.length]; const iss = -((acc % 17) + 2); return { m: stuM(s), issued: iss, due: iss + 14, renew: acc % 5 === 0 ? 1 : 0 }; };
function copiesOf(b) {
  const res = Array.from({ length: b.total }, (_, k) => ({ acc: b.acc0 + k, status: 'Available' }));
  let out = 0;
  res.forEach((c) => { if (LOANS[c.acc]) { c.status = 'Issued'; c.loan = LOANS[c.acc]; out++; } });
  let L = b.lost || 0, Dm = b.damaged || 0;
  for (let i = res.length - 1; i >= 0 && (L || Dm); i--) { if (res[i].status !== 'Available' || res[i].acc === 10452) continue; if (L) { res[i].status = 'Lost'; L--; } else { res[i].status = 'Damaged'; Dm--; } }
  for (const c of res) { if (out >= b.out) break; if (c.status === 'Available' && c.acc !== 10452) { c.status = 'Issued'; c.loan = genLoan(c.acc); out++; } }
  if (b.ref) res.forEach((c) => { if (c.status === 'Available') c.status = 'Reading room'; });
  return res;
}
const COPIES = Object.fromEntries(BOOKS.map((b) => [b.id, copiesOf(b)]));
const findCopy = (acc) => { for (const b of BOOKS) { const c = COPIES[b.id].find((x) => String(x.acc) === String(acc)); if (c) return { b, c }; } return null; };
const avail = (b) => COPIES[b.id].filter((c) => c.status === 'Available').length;
const statusTone = { Available: 'ok', Issued: 'info', Reserved: 'brand', Lost: 'bad', Damaged: 'warn', Withdrawn: 'neutral', 'Reading room': 'neutral' };
const booksOut = (m) => Object.entries(LOANS).filter(([, l]) => l.m.id === m.id).map(([acc, l]) => ({ acc: Number(acc), ...l, b: findCopy(acc).b }));

// Desk members for search: students and staff
const ALL_MEMBERS = [...STUDENTS.map(stuM), ...STAFF.map(staffM), M.kavya];
const memberFines = { [M.harini.id]: 0, [M.kavya.id]: 24 };

/* Today at the desk */
const TODAY_ISSUED = [
  ['10:38 AM', 'Ruskin Bond’s Children’s Omnibus', 'Sai Iyer', '5 B'], ['10:31 AM', 'Panchatantra Stories', 'Ananya Joshi', '5 A'], ['10:22 AM', 'Tinkle Digest 312', 'Meera Das', '7 B'],
  ['9:58 AM', 'A Brief History of Time', 'Farhana Begum', 'Staff · Teaching'], ['9:41 AM', 'Swami and Friends', 'Krishna Rao', '6 B'], ['9:12 AM', 'Grandma’s Bag of Stories', 'Saanvi Goud', '6 B'],
];
const TODAY_RETURNED = [
  ['10:35 AM', 'Malgudi Days', 'Varun Joshi', '6 A', 'Late 12 days · ₹24 added to fees'], ['10:20 AM', 'The Jungle Book', 'Nikhil Menon', '6 B', 'On time'], ['10:04 AM', 'Tinkle Digest 312', 'Tanvi Menon', '6 A', 'Damaged · ₹60 added to fees'],
  ['9:47 AM', 'Ignited Minds', 'Deepak Verma', 'Staff · Teaching', 'Late 15 days · ₹30 at the desk'], ['9:30 AM', 'Chandamama Kathalu', 'Aadhya Goud', '5 A', 'On time'], ['9:05 AM', 'Geronimo Stilton: The Kingdom of Fantasy', 'Harsha Verma', '8 B', 'Late 6 days · ₹12 added to fees'],
];
const TODAY_DUE = [
  ['Mathematics Olympiad Workbook, Class 7', 'Tanvi Sharma', '6 A'], ['Swami and Friends', 'Arjun Sharma', '7 A'], ['Panchatantra Stories', 'Lasya Joshi', '5 A'],
  ['The Diary of a Young Girl', 'Ananya Pillai', '8 A'], ['Grandma’s Bag of Stories', 'Navya Das', '6 A'], ['Malgudi Days', 'Charan Joshi', '8 A'],
];
const isoOff = (off) => { const d = dt(off); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// Issue and return history: today's desk rows, then example rows for every earlier school day (steady from a seed)
const HIST = (() => {
  const out = [];
  TODAY_ISSUED.forEach(([t, book, who, grp], i) => out.push({ id: `ti${i}`, iso: isoOff(0), when: `Today, ${t}`, what: 'Issued', book, who, grp, note: '' }));
  TODAY_RETURNED.forEach(([t, book, who, grp, note], i) => out.push({ id: `tr${i}`, iso: isoOff(0), when: `Today, ${t}`, what: 'Returned', book, who, grp, note }));
  const mins = (w) => { const [hm, ap] = w.replace('Today, ', '').split(' '); const [h, m] = hm.split(':').map(Number); return ((h % 12) + (ap === 'PM' ? 12 : 0)) * 60 + m; };
  out.sort((x, y) => mins(y.when) - mins(x.when));
  for (let k = 1; k <= 500; k++) {
    const d = dt(-k);
    if (d < new Date(2025, 5, 1)) break;
    if (schoolDay(d.getFullYear(), d.getMonth(), d.getDate()).kind !== 'school') continue;
    for (let j = 0; j < 4; j++) {
      const h = (k * 7 + j * 11) % 97;
      const b = BOOKS[h % 14]; const s = POOL[(k * 5 + j * 3) % POOL.length];
      const ret = j % 2 === 1; const late = ret && h % 5 === 0 ? (h % 9) + 2 : 0;
      out.push({ id: `h${k}-${j}`, iso: isoOff(-k), when: `${dday(-k)}${d.getFullYear() !== 2026 ? ` ${d.getFullYear()}` : ''}`, what: ret ? 'Returned' : 'Issued', book: b.title, who: s.name, grp: `${s.cls.replace('Class ', '')} ${s.sec}`, note: ret ? (late ? `Late ${late} days · ${inr(Math.min(FINE_MAX, late * FINE_DAY))} added to fees` : 'On time') : '' });
    }
  }
  return out;
})();
const OVERDUE = [
  ['The Diary of a Young Girl', 'Charan Joshi', '8 A', 21], ['Ignited Minds', 'Swapna Reddy', 'Staff · Teaching', 15], ['Swami and Friends', 'Krishna Rao', '6 B', 9],
  ['Harry Potter and the Philosopher’s Stone', 'Navya Rao', '8 B', 7], ['The Adventures of Tom Sawyer', 'Nikhil Gupta', '5 B', 7], ['The Jungle Book', 'Harini Joshi', '7 A', 5],
  ['Panchatantra Stories', 'Saanvi Verma', '8 B', 4], ['Chandamama Kathalu', 'Lasya Kumar', '8 B', 2],
];

/* ======================= Shared bits ======================= */
function Back({ page, label, extra }) {
  const { go } = useNav();
  return (
    <button onClick={() => go('library', { page })} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink mb-3 -ml-1 h-8 px-1 rounded-lg">
      <I.ArrowLeft size={17} />{label}{extra && <span className="text-ink3 font-normal">/ {extra}</span>}
    </button>
  );
}
// A small book cover drawn from the title, in theme colours only
const COVER_TONES = ['brand', 'info', 'warn', 'ok', 'bad'];
function Cover({ b, size = 44 }) {
  let h = 0; for (const ch of b.title) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const tone = COVER_TONES[h % COVER_TONES.length];
  return (
    <span className={cx('relative rounded-md grid place-items-center shrink-0 overflow-hidden', TONE_SOFT[tone])} style={{ width: size * 0.78, height: size }} aria-hidden="true">
      <span className="absolute left-0 inset-y-0 w-[3px] bg-current opacity-40" />
      <I.BookOpen size={size * 0.38} />
    </span>
  );
}
function Barcode({ code, className }) {
  const bars = useMemo(() => { const out = []; let x = 0; const s = String(code).replace(/\D/g, '') || '0'; for (let i = 0; i < 34; i++) { const w = ((Number(s[i % s.length]) + i) % 3) + 1; if (i % 2 === 0) out.push([x, w]); x += w + 1; } return { out, w: x }; }, [code]);
  return (
    <svg viewBox={`0 0 ${bars.w} 24`} preserveAspectRatio="none" className={cx('block', className)} aria-label={`Barcode ${code}`}>
      {bars.out.map(([x, w], i) => <rect key={i} x={x} y="0" width={w} height="24" fill="currentColor" />)}
    </svg>
  );
}
// Camera scanning state (phone camera or webcam)
function ScanSheet({ open, onClose, what, code, onFound }) {
  const [found, setFound] = useState(false);
  useEffect(() => {
    if (!open) { setFound(false); return undefined; }
    const t1 = setTimeout(() => setFound(true), 1300);
    const t2 = setTimeout(() => { onFound(code); onClose(); }, 2100);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title="Scan with camera" sub={what === 'member' ? 'Hold the library card or ID card steady' : 'Point at the barcode on the back cover or the label inside'}>
      <div className="relative rounded-2xl bg-ink text-bg overflow-hidden aspect-[4/3] grid place-items-center">
        <div className="absolute inset-0 dotgrid opacity-20" />
        <div className={cx('relative w-3/4 h-2/5 rounded-xl border-2 transition', found ? 'border-ok' : 'border-bg/70')}>
          <span className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 rounded-tl-lg border-current opacity-90" />
          <span className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 rounded-tr-lg border-current opacity-90" />
          <span className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 rounded-bl-lg border-current opacity-90" />
          <span className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 rounded-br-lg border-current opacity-90" />
          <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 h-10 opacity-60"><Barcode code={code} className="w-full h-full" /></div>
          {!found && <span className="absolute inset-x-2 top-1/2 h-0.5 bg-bad animate-pulse rounded" />}
        </div>
        <p className="absolute bottom-3 inset-x-0 text-center text-[13px] font-semibold flex items-center justify-center gap-2">
          {found ? <><I.CircleCheck size={16} className="text-ok" />Found {code}</> : <><Spinner size={14} />Looking for a barcode…</>}
        </p>
      </div>
      <p className="text-[12.5px] text-ink3 mt-3 flex gap-1.5"><I.Info size={14} className="shrink-0 mt-0.5" />A USB barcode scanner works too: click the box and scan. It types the number for you.</p>
    </Sheet>
  );
}

/* ======================= Issue & Return (the desk) ======================= */
function IssuePage() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const [mode, setMode] = useState('issue');
  const [today, setToday] = useState({ issued: TODAY_ISSUED, returned: TODAY_RETURNED });
  const [list, setList] = useState('issued');
  const [reserveOpen, setReserveOpen] = useState(false);
  const [remind, setRemind] = useState(false);
  const [per, setPer] = useState(PERIODS.last7);
  const [hq, setHq] = useState('');
  const [hk, setHk] = useState('all');
  const hRows = HIST.filter((h) => h.iso >= per.from && h.iso <= per.to && (hk === 'all' || h.what === hk) && (!hq || (h.book + h.who + h.grp).toLowerCase().includes(hq.toLowerCase())));
  const counts = { issued: 34 + today.issued.length - TODAY_ISSUED.length, returned: 28 + today.returned.length - TODAY_RETURNED.length, due: 12, overdue: 23 };
  return (
    <div>
      <ModuleHead sub="Friday 9 Oct · scan the member’s card, then the book"
        actions={<Button variant="secondary" icon={I.BookmarkPlus} onClick={() => setReserveOpen(true)}>Reservations · 6</Button>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Stats items={[
          { label: 'Issued today', value: String(counts.issued), sub: 'Last at 10:38 AM', icon: I.ArrowRightLeft, onClick: () => setList('issued') },
          { label: 'Returned today', value: String(counts.returned), sub: '4 with a fine', icon: I.CornerDownLeft, onClick: () => setList('returned') },
          { label: 'Due today', value: String(counts.due), sub: 'Reminded at 8 AM', icon: I.CalendarClock, tone: 'warn', onClick: () => setList('due') },
          { label: 'Overdue', value: String(counts.overdue), sub: '₹529 fines due in all', icon: I.TriangleAlert, tone: 'bad', onClick: () => setList('overdue') },
        ]} />
        <Split side={380} className="[&>*]:min-w-0">
          <Card className="overflow-visible">
            <div className="p-4 @md:p-5 pb-0 @md:pb-0">
              <Segmented value={mode} onChange={setMode} className="w-full @md:w-auto" options={[{ value: 'issue', label: 'Issue a book', icon: I.ArrowRightLeft }, { value: 'return', label: 'Return a book', icon: I.CornerDownLeft }]} />
            </div>
            {!canEdit ? (
              <Empty icon={I.Lock} title="The desk is for the Librarian" body="You can see today’s lists on the right." />
            ) : mode === 'issue' ? (
              <IssueDesk onIssued={(row) => { setToday((t) => ({ ...t, issued: [row, ...t.issued] })); setList('issued'); }} />
            ) : (
              <ReturnDesk onReturned={(row) => { setToday((t) => ({ ...t, returned: [row, ...t.returned] })); setList('returned'); }} />
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHead title="Today at the desk" icon={I.ClipboardList} action={list === 'overdue' && canEdit && <Button size="sm" variant="soft" icon={I.Send} onClick={() => setRemind(true)}>Remind all</Button>} />
            <div className="px-3 pb-3 -mt-1 overflow-x-auto no-scrollbar">
              <Segmented size="sm" value={list} onChange={setList} className="w-max" options={[{ value: 'issued', label: `Issued ${counts.issued}` }, { value: 'returned', label: `Returned ${counts.returned}` }, { value: 'due', label: `Due ${counts.due}` }, { value: 'overdue', label: `Overdue ${counts.overdue}` }]} />
            </div>
            <ul className="px-2 pb-2 border-t border-line/70 pt-1">
              {list === 'issued' && today.issued.map(([t, book, who, grp]) => <DeskRow key={t + book + who} who={who} title={book} sub={`${who} · ${grp} · ${t}`} />)}
              {list === 'returned' && today.returned.map(([t, book, who, grp, note]) => <DeskRow key={t + book + who} who={who} title={book} sub={`${who} · ${grp} · ${t}`} note={note} tone={/Late|Damaged/.test(note) ? 'warn' : 'ok'} />)}
              {list === 'due' && TODAY_DUE.map(([book, who, grp]) => <DeskRow key={book + who} who={who} title={book} sub={`${who} · ${grp} · due today`} />)}
              {list === 'overdue' && OVERDUE.map(([book, who, grp, d]) => (
                <DeskRow key={book + who} who={who} title={book} sub={`${who} · ${grp}`} note={`${d} days late · ${inr(Math.min(FINE_MAX, d * FINE_DAY))} so far`} tone="bad"
                  action={canEdit && <button onClick={() => toast({ title: `Reminder sent about “${book}”`, body: grp.startsWith('Staff') ? `${who} gets it in the app` : `${who}’s parent on WhatsApp` })} className="text-[12.5px] font-semibold text-brand h-8 px-2 rounded-lg hover:bg-brand/8">Remind</button>} />
              ))}
            </ul>
            <div className="px-5 py-3 border-t border-line text-[12.5px] text-ink3">Showing the latest {list === 'overdue' ? OVERDUE.length : 6} of {counts[list]}</div>
          </Card>
        </Split>

        <Card className="overflow-hidden">
          <CardHead title="Issue and return history" sub={`${per.label} · ${fmtRange(per)}`} icon={I.History} />
          <Toolbar className="border-t">
            <SearchBox id="lh-q" value={hq} onChange={setHq} placeholder="Book, member or class" />
            <DatePeriod id="lh-per" value={per} onChange={setPer} className="w-full @md:w-auto" />
            <Segmented value={hk} onChange={setHk} options={[{ value: 'all', label: 'All' }, { value: 'Issued', label: 'Issued' }, { value: 'Returned', label: 'Returned' }]} />
            <ExportButton what="issue and return history" />
          </Toolbar>
          <DataList rows={hRows.slice(0, 50)} minWidth={760}
            empty={<Empty icon={I.History} title="Nothing issued or returned in these dates" body={`No desk records ${fmtRange(per)}. Sundays and holidays have none.`} action={<Button variant="secondary" onClick={() => { setPer(PERIODS.last30); setHq(''); setHk('all'); }}>Last 30 days</Button>} />}
            columns={[
              { key: 'w', label: 'When', nowrap: true, render: (h) => <span className="tnum text-[13.5px]">{h.when}</span> },
              { key: 'b', label: 'Book', render: (h) => <span className="font-semibold">{h.book}</span> },
              { key: 'm', label: 'Member', render: (h) => <div className="flex items-center gap-2.5"><Avatar name={h.who} size={28} /><div><p className="leading-tight">{h.who}</p><p className="text-[12px] text-ink3">{h.grp}</p></div></div> },
              { key: 'k', label: 'What', render: (h) => <Pill tone={h.what === 'Issued' ? 'info' : 'ok'}>{h.what}</Pill> },
              { key: 'n', label: 'Note', render: (h) => <span className={cx('text-[13px]', /Late|Damaged/.test(h.note) ? 'text-warn font-semibold' : 'text-ink3')}>{h.note || '—'}</span> },
            ]}
            mobile={(h) => ({ title: h.book, sub: `${h.who} · ${h.grp} · ${h.when}${h.note ? ` · ${h.note}` : ''}`, avatar: h.who, pills: [<Pill key="k" tone={h.what === 'Issued' ? 'info' : 'ok'} className="!h-[22px] !text-[11.5px]">{h.what}</Pill>] })}
            footer={hRows.length > 50 ? `Showing the latest 50 of ${hRows.length.toLocaleString('en-IN')} · export for all` : `${hRows.length} records`} />
        </Card>
      </div>
      <ReservationsSheet open={reserveOpen} onClose={() => setReserveOpen(false)} />
      <ConfirmSheet open={remind} onClose={() => setRemind(false)} title="Send overdue reminders to 23 members?"
        sub="19 parents get a WhatsApp message (SMS if not delivered). 4 staff members get it in the app. Sent messages cannot be taken back."
        confirmLabel="Send to 23 members" onConfirm={() => toast({ title: 'Overdue reminders sent to 23 members', body: '19 parents on WhatsApp · 4 staff in the app' })} />
    </div>
  );
}

function DeskRow({ who, title, sub, note, tone = 'neutral', action }) {
  return (
    <li className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/60">
      <Avatar name={who} size={34} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-[14px] leading-snug truncate">{title}</p>
        <p className="text-[12.5px] text-ink3 truncate">{sub}</p>
        {note && <p className={cx('text-[12px] font-semibold truncate', { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', neutral: 'text-ink3' }[tone])}>{note}</p>}
      </div>
      {action}
    </li>
  );
}

function ScanBox({ id, value, onChange, placeholder, onCamera, onEnter, big = true, autoFocus }) {
  const ref = useRef(null);
  useEffect(() => { if (autoFocus) setTimeout(() => ref.current?.focus(), 60); }, [autoFocus]);
  return (
    <div className="relative">
      <I.ScanBarcode size={21} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink3" />
      <input ref={ref} id={id} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onEnter?.(); }} placeholder={placeholder} autoComplete="off"
        className={cx(inputCls(false), 'pl-12 pr-14', big && '!h-14 !text-[16px] !rounded-2xl')} />
      <button type="button" onClick={onCamera} aria-label="Scan with camera" title="Scan with camera" className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl grid place-items-center text-brand bg-brand/10 hover:bg-brand/15"><I.Camera size={19} /></button>
    </div>
  );
}

function IssueDesk({ onIssued }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [member, setMember] = useState(null);
  const [extra, setExtra] = useState({}); // member id -> books issued now
  const [bq, setBq] = useState('');
  const [hit, setHit] = useState(null); // { b, c } or { b, isbnOnly }
  const [miss, setMiss] = useState('');
  const [scan, setScan] = useState(null);
  const [due, setDue] = useState('');
  const [renewed, setRenewed] = useState({});
  const t = q.trim().toLowerCase();
  const res = t ? ALL_MEMBERS.filter((m) => m.name.toLowerCase().includes(t) || m.card.toLowerCase().includes(t) || (m.sid && STUDENTS.find((s) => s.id === m.sid)?.adm.toLowerCase().includes(t))).slice(0, 6) : [];
  const out = member ? [...booksOut(member), ...(extra[member.id] || [])] : [];
  const fines = member ? memberFines[member.id] || 0 : 0;
  const full = member && out.length >= member.limit;
  const loanDays = member?.kind === 'Staff' ? 30 : 14;
  const dueInfo = dueFrom(loanDays);
  useEffect(() => { setDue(dinput(dueInfo.off)); }, [member?.id]);
  const pickMember = (m) => { setMember(m); setQ(''); };
  const findBook = (raw) => {
    const v = String(raw).trim(); setMiss('');
    if (!v) return;
    const digits = v.replace(/[\s-]/g, '');
    const c = findCopy(digits);
    if (c) { setHit(c); return; }
    const b = BOOKS.find((x) => x.isbn === digits);
    if (b) { const free = COPIES[b.id].find((x) => x.status === 'Available'); setHit(free ? { b, c: free } : { b, c: null }); return; }
    if (/^\d{10,13}$/.test(digits) && !isbnOk(digits)) { setHit(null); setMiss('This ISBN is not valid. Check the number on the back cover.'); return; }
    setHit(null); setMiss(`No copy with accession number or ISBN “${v}”. Labels start with 10.`);
  };
  const busyCopy = hit?.c && hit.c.status !== 'Available' && !(extra[member?.id] || []).some((x) => x.acc === hit.c.acc);
  const takenNow = hit?.c && Object.values(extra).flat().some((x) => x.acc === hit.c.acc);
  const canIssue = member && hit?.c && hit.c.status === 'Available' && !takenNow && !full;
  const issue = () => {
    const row = { acc: hit.c.acc, b: hit.b, m: member, issued: 0, due: dueInfo.off, renew: 0 };
    setExtra((x) => ({ ...x, [member.id]: [...(x[member.id] || []), row] }));
    onIssued(['Just now', hit.b.title, member.name, member.kind === 'Staff' ? `Staff · ${member.group}` : member.group]);
    toast({ title: `Issued: ${hit.b.title}`, body: `To ${member.name} · Acc. ${hit.c.acc} · due ${dday(dueInfo.off)}` });
    setHit(null); setBq('');
  };
  const renew = (l) => {
    const b = l.b;
    if (b.reserve?.length) { toast({ title: `Cannot renew “${b.title}”`, body: `Reserved by ${b.reserve.length} members. Please return it.`, tone: 'bad' }); return; }
    if ((l.renew + (renewed[l.acc] || 0)) >= 2) { toast({ title: 'Already renewed 2 times', body: 'Please return the book. It can be issued again if no one is waiting.', tone: 'bad' }); return; }
    setRenewed((x) => ({ ...x, [l.acc]: (x[l.acc] || 0) + 1 }));
    toast({ title: `Renewed: ${b.title}`, body: `New due date ${dday(l.due + 14)}`, undo: () => setRenewed((x) => ({ ...x, [l.acc]: (x[l.acc] || 1) - 1 })) });
  };
  return (
    <div className="p-4 @md:p-5 flex flex-col gap-5">
      {/* Step 1: member */}
      <section>
        <p className="text-[13px] font-semibold text-ink2 mb-1.5 flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-brand text-brandink text-[11px] font-bold grid place-items-center">1</span>Member</p>
        {!member ? (
          <>
            <ScanBox id="desk-member" value={q} onChange={setQ} placeholder="Scan the card, or type a name or card no." onCamera={() => setScan('member')} onEnter={() => res[0] && pickMember(res[0])} autoFocus />
            {t && (
              <ul className="mt-2 rounded-2xl border border-line divide-y divide-line/70 overflow-hidden">
                {res.length === 0 && <li className="px-4 py-3 text-[13.5px] text-ink3">No student or staff member called “{q}”. Try the card number.</li>}
                {res.map((m) => (
                  <li key={m.id}>
                    <button onClick={() => pickMember(m)} className="w-full flex items-center gap-3 px-3.5 py-2.5 hover:bg-sunken text-left">
                      <Avatar name={m.name} size={38} />
                      <span className="min-w-0 flex-1"><span className="block font-semibold text-[14.5px] truncate">{m.name}</span><span className="block text-[12.5px] text-ink3 truncate">{m.kind === 'Staff' ? `Staff · ${m.group}` : `Class ${m.group}`}</span></span>
                      <span className="font-mono text-[12px] text-ink3 hidden @sm:block">{m.card}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!t && (
              <div className="mt-3">
                <p className="eyebrow text-ink3 mb-2">Recent at the desk</p>
                <div className="flex flex-wrap gap-2">
                  {[M.aarav, M.meeraD, M.harini, M.imran].map((m) => (
                    <button key={m.id} onClick={() => pickMember(m)} className="inline-flex items-center gap-2 h-10 pl-1.5 pr-3 rounded-full border border-line bg-surface hover:bg-sunken text-[13.5px] font-semibold">
                      <Avatar name={m.name} size={28} />{m.name}<span className="text-ink3 font-normal">{m.kind === 'Staff' ? 'Staff' : m.group}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-2xl border border-line overflow-hidden animate-fade">
            <div className="flex items-center gap-3.5 p-3.5">
              <Avatar name={member.name} size={52} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[16px] leading-tight truncate">{member.name}</p>
                <p className="text-[13px] text-ink3 truncate">{member.kind === 'Staff' ? `Staff · ${member.group}` : `Student · Class ${member.group}`} · <span className="font-mono text-[12px]">{member.card}</span></p>
                <div className="flex gap-1.5 mt-1.5 flex-wrap">
                  <Pill tone={full ? 'bad' : 'neutral'} className="!h-[22px] !text-[11.5px]">{out.length} of {member.limit} books</Pill>
                  {fines > 0 ? <Pill tone="warn" className="!h-[22px] !text-[11.5px]">{inr(fines)} fines due</Pill> : <Pill tone="ok" className="!h-[22px] !text-[11.5px]">No fines</Pill>}
                </div>
              </div>
              <Button size="sm" variant="ghost" icon={I.X} onClick={() => { setMember(null); setHit(null); setBq(''); }}>Change</Button>
            </div>
            {out.length > 0 && (
              <ul className="border-t border-line/70 divide-y divide-line/70">
                {out.map((l) => {
                  const dueOff = l.due + (renewed[l.acc] || 0) * 14; const late = -dueOff;
                  return (
                    <li key={l.acc} className="flex items-center gap-3 px-3.5 py-2.5">
                      <Cover b={l.b} size={34} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[13.5px] truncate">{l.b.title}</p>
                        <p className={cx('text-[12px] truncate', late > 0 ? 'text-bad font-semibold' : dueOff <= 2 ? 'text-warn' : 'text-ink3')}>
                          Acc. {l.acc} · {late > 0 ? `${late} days late · fine ${inr(Math.min(FINE_MAX, late * FINE_DAY))} so far` : l.issued === 0 ? `Just issued · due ${dday(dueOff)}` : `Due ${dday(dueOff)}`}
                        </p>
                      </div>
                      {l.issued !== 0 && <Button size="sm" variant="ghost" icon={I.RefreshCw} onClick={() => renew({ ...l, due: dueOff })}>Renew</Button>}
                    </li>
                  );
                })}
              </ul>
            )}
            {full && (
              <div className="border-t border-line/70 px-3.5 py-3 bg-bad/[.06] text-[13.5px] flex gap-2.5">
                <I.Ban size={17} className="text-bad shrink-0 mt-0.5" />
                <p className="text-ink2"><b className="font-semibold text-ink">{member.name.split(' ')[0]} has {out.length} of {member.limit} books.</b> Return a book first, or raise the limit with a reason in Members & Cards.</p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Step 2: book */}
      <section className={cx(!member && 'opacity-90 pointer-events-none')} aria-disabled={!member}>
        <p className="text-[13px] font-semibold text-ink2 mb-1.5 flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-brand text-brandink text-[11px] font-bold grid place-items-center">2</span>Book</p>
        <ScanBox id="desk-book" value={bq} onChange={(v) => { setBq(v); if (!v) { setHit(null); setMiss(''); } }} placeholder="Scan the book, or type accession no. or ISBN" onCamera={() => setScan('book')} onEnter={() => findBook(bq)} big={false} />
        <div className="flex items-center gap-2 mt-2 flex-wrap text-[12.5px] text-ink3">
          <span>Try:</span>
          {[['10452', 'available'], ['10233', 'issued'], [BOOK.B01.isbn, 'ISBN, none free'], ['10955', 'reference']].map(([v, l]) => (
            <button key={v} type="button" onClick={() => { setBq(v); findBook(v); }} className="h-7 px-2.5 rounded-lg bg-sunken hover:bg-line font-mono text-[12px] text-ink2">{v.length > 6 ? `${v.slice(0, 7)}…` : v} <span className="font-sans text-ink3">· {l}</span></button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => findBook(bq)} disabled={!bq.trim()}>Find</Button>
        </div>
        {miss && <p className="text-[13px] text-bad mt-2 flex items-center gap-1.5" role="alert"><I.CircleAlert size={15} />{miss}</p>}
        {hit && (
          <div className="mt-3 rounded-2xl border border-line p-3.5 flex gap-3.5 animate-fade">
            <Cover b={hit.b} size={56} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[15px] leading-tight">{hit.b.title}</p>
              <p className="text-[13px] text-ink3 truncate">{hit.b.author} · {hit.b.pub}</p>
              {hit.c ? (
                <p className="text-[12.5px] mt-1.5 flex items-center gap-2 flex-wrap">
                  <span className="font-mono">Acc. {hit.c.acc}</span><span className="text-ink3">· Shelf {hit.b.shelf}</span>
                  <Pill tone={takenNow ? 'info' : statusTone[hit.c.status]} className="!h-5 !text-[11px]">{takenNow ? 'Issued just now' : hit.c.status}</Pill>
                </p>
              ) : <p className="text-[12.5px] mt-1.5"><Pill tone="warn" className="!h-5 !text-[11px]">No copy free</Pill></p>}
              {busyCopy && hit.c.status === 'Issued' && (
                <div className="mt-2.5 text-[13px] text-ink2 flex flex-col @sm:flex-row @sm:items-center gap-2">
                  <span className="flex-1">Copy {hit.c.acc} is issued to <b className="font-semibold text-ink">{hit.c.loan.m.name}, {hit.c.loan.m.kind === 'Staff' ? 'staff' : hit.c.loan.m.group}</b>. Due {dday(hit.c.loan.due)}.</span>
                  <Button size="sm" variant="secondary" icon={I.BookmarkPlus} onClick={() => toast({ title: `Reserved for ${member.name}`, body: `“${hit.b.title}” · number ${(hit.b.reserve?.length || 0) + 1} in the queue` })}>Reserve instead</Button>
                </div>
              )}
              {busyCopy && hit.c.status === 'Reading room' && <p className="mt-2 text-[13px] text-ink2">Reading room only. Reference books are not lent (Library Settings).</p>}
              {!hit.c && (
                <div className="mt-2.5 text-[13px] text-ink2 flex flex-col @sm:flex-row @sm:items-center gap-2">
                  <span className="flex-1">All {hit.b.total} copies are out. {hit.b.reserve?.length || 0} members are waiting.</span>
                  <Button size="sm" variant="secondary" icon={I.BookmarkPlus} onClick={() => toast({ title: `Reserved for ${member.name}`, body: `“${hit.b.title}” · number ${(hit.b.reserve?.length || 0) + 1} in the queue` })}>Reserve</Button>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Step 3: due date and issue */}
      <section className={cx(!canIssue && 'opacity-90')}>
        <Field label="Due date" id="desk-due" hint={member ? (dueInfo.moved ? `${loanDays} days for ${member.kind === 'Staff' ? 'staff' : 'students'} ends on ${dday(dueInfo.first)}, a holiday, so it moved to ${dday(dueInfo.off)}.` : `${loanDays} days for ${member.kind === 'Staff' ? 'staff' : 'students'} (Library Settings).`) : 'Fills in from the loan days in Library Settings'}>
          <Input id="desk-due" value={due} onChange={(e) => setDue(e.target.value)} className="tnum @md:w-56" disabled={!member} />
        </Field>
        <Button variant="primary" size="lg" className="w-full mt-4 !h-14 !text-[16px]" icon={I.Check} disabled={!canIssue} onClick={issue}>
          {canIssue ? `Issue to ${member.name.split(' ')[0]}` : !member ? 'Pick the member first' : full ? 'Limit reached' : 'Scan an available book'}
        </Button>
      </section>
      <ScanSheet open={!!scan} what={scan} code={scan === 'member' ? 'LC-2021-0417' : '10452'} onClose={() => setScan(null)}
        onFound={(c) => { if (scan === 'member') pickMember(M.aarav); else { setBq(c); findBook(c); } }} />
    </div>
  );
}

function ReturnDesk({ onReturned }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [hit, setHit] = useState(null);
  const [miss, setMiss] = useState('');
  const [cond, setCond] = useState('Good');
  const [charge, setCharge] = useState('');
  const [scan, setScan] = useState(false);
  const [done, setDone] = useState(null);
  const find = (raw) => {
    const v = String(raw).replace(/[\s-]/g, ''); setMiss(''); setDone(null); setCond('Good');
    const c = findCopy(v);
    if (!c) { setHit(null); setMiss(`No copy with accession number “${raw}”.`); return; }
    if (c.c.status !== 'Issued') { setHit(null); setMiss(`Copy ${v} is not issued to anyone. It shows as ${c.c.status.toLowerCase()}.`); return; }
    setHit(c); setCharge(String(c.b.price));
  };
  const l = hit?.c.loan;
  const late = l ? Math.max(0, -l.due) : 0;
  const fine = Math.min(FINE_MAX, late * FINE_DAY);
  const ch = Number(String(charge).replace(/\D/g, '')) || 0;
  const needsApproval = cond === 'Damaged' && ch > 500;
  const next = hit?.b.reserve?.length ? (hit.b.reserve[0] === 'kavya' ? M.kavya : M[hit.b.reserve[0]]) : null;
  const total = fine + (cond === 'Damaged' && !needsApproval ? ch : 0);
  const ret = () => {
    const staff = l.m.kind === 'Staff';
    const bits = [];
    if (fine) bits.push(`late fine ${inr(fine)}`);
    if (cond === 'Damaged') bits.push(needsApproval ? `damage charge ${inr(ch)} sent for approval` : `damage charge ${inr(ch)}`);
    toast({ title: `Returned: ${hit.b.title}`, body: bits.length ? `${bits.join(' and ')} · ${staff ? 'collect at the desk or from salary' : `added to ${l.m.name}’s fees`}` : 'On time. No fine.' });
    onReturned(['Just now', hit.b.title, l.m.name, staff ? `Staff · ${l.m.group}` : l.m.group, fine ? `Late ${late} days · ${inr(fine)} ${staff ? 'at the desk' : 'added to fees'}` : cond === 'Damaged' ? 'Damaged' : 'On time']);
    setDone({ b: hit.b, next }); setHit(null); setQ('');
  };
  return (
    <div className="p-4 @md:p-5 flex flex-col gap-5">
      <section>
        <p className="text-[13px] font-semibold text-ink2 mb-1.5">Scan the book being returned</p>
        <ScanBox id="desk-return" value={q} onChange={(v) => { setQ(v); if (!v) { setHit(null); setMiss(''); } }} placeholder="Scan the book, or type the accession no." onCamera={() => setScan(true)} onEnter={() => find(q)} autoFocus />
        <div className="flex items-center gap-2 mt-2 flex-wrap text-[12.5px] text-ink3">
          <span>Try:</span>
          {[['10388', '5 days late'], ['10232', 'reserved by others'], ['10601', 'staff, on time']].map(([v, lb]) => (
            <button key={v} type="button" onClick={() => { setQ(v); find(v); }} className="h-7 px-2.5 rounded-lg bg-sunken hover:bg-line font-mono text-[12px] text-ink2">{v} <span className="font-sans text-ink3">· {lb}</span></button>
          ))}
        </div>
        {miss && <p className="text-[13px] text-bad mt-2 flex items-center gap-1.5" role="alert"><I.CircleAlert size={15} />{miss}</p>}
      </section>

      {done && (
        <div className="rounded-2xl bg-ok/10 p-4 flex gap-3 animate-fade">
          <I.CircleCheck size={20} className="text-ok shrink-0 mt-0.5" />
          <div className="text-[14px] text-ink2">
            <p><b className="font-semibold text-ink">{done.b.title}</b> is back.</p>
            {done.next ? <p className="mt-1">Next in queue: <b className="font-semibold text-ink">{done.next.name}, {done.next.kind === 'Staff' ? 'staff' : done.next.group}</b>. Keep it aside at the desk. {done.next.kind === 'Staff' ? 'They are told in the app.' : 'Their parent is told on WhatsApp.'}</p> : <p className="mt-1">Put it back on shelf {done.b.shelf}.</p>}
          </div>
        </div>
      )}

      {hit && (
        <div className="flex flex-col gap-4 animate-fade">
          <div className="rounded-2xl border border-line overflow-hidden">
            <div className="flex gap-3.5 p-3.5">
              <Cover b={hit.b} size={56} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[15px] leading-tight">{hit.b.title}</p>
                <p className="text-[12.5px] text-ink3 font-mono mt-0.5">Acc. {hit.c.acc}</p>
                <div className="flex items-center gap-2 mt-2"><Avatar name={l.m.name} size={26} /><span className="text-[13.5px] font-semibold truncate">{l.m.name}</span><span className="text-[12.5px] text-ink3 shrink-0">{l.m.kind === 'Staff' ? `Staff · ${l.m.group}` : l.m.group}</span></div>
              </div>
            </div>
            <dl className="grid grid-cols-3 border-t border-line/70 text-[13px]">
              {[['Issued', dshort(l.issued)], ['Due', dshort(l.due)], ['Late', late ? `${late} days` : 'On time']].map(([k, v], i) => (
                <div key={k} className={cx('px-3.5 py-2.5', i < 2 && 'border-r border-line/70')}><dt className="text-[11.5px] text-ink3 font-semibold">{k}</dt><dd className={cx('font-semibold tnum', k === 'Late' && late && 'text-bad')}>{v}</dd></div>
              ))}
            </dl>
          </div>
          {next && <Banner tone="info" icon={I.BookmarkPlus} title={`Reserved by ${hit.b.reserve.length} members.`}>Next in queue: {next.name}, {next.kind === 'Staff' ? 'staff' : next.group}. Keep this copy at the desk.</Banner>}
          <Field label="Condition" id="ret-cond">
            <Segmented value={cond} onChange={setCond} options={[{ value: 'Good', label: 'Good' }, { value: 'Damaged', label: 'Damaged' }]} className="w-full @md:w-auto" />
          </Field>
          {cond === 'Damaged' && (
            <Field label="Damage charge (₹)" id="ret-charge" hint={needsApproval ? 'Above ₹500, so it goes to Lakshmi Rao for approval and is added only when approved.' : `Book price ${inr(hit.b.price)}. Change it for small damage.`}>
              <Input id="ret-charge" inputMode="numeric" value={charge} onChange={(e) => setCharge(e.target.value)} className="tnum @md:w-48" />
            </Field>
          )}
          <div className="rounded-2xl bg-sunken/70 p-4">
            <div className="flex justify-between text-[14px]"><span className="text-ink2">Late fine {late ? `(${late} days × ${inr(FINE_DAY)})` : ''}</span><b className="font-semibold tnum">{inr(fine)}</b></div>
            {cond === 'Damaged' && <div className="flex justify-between text-[14px] mt-1"><span className="text-ink2">Damage charge</span><b className={cx('font-semibold tnum', needsApproval && 'text-ink3')}>{needsApproval ? 'Waiting approval' : inr(ch)}</b></div>}
            <div className="flex justify-between text-[15px] mt-2 pt-2 border-t border-line"><span className="font-semibold">To pay now</span><b className="font-display font-semibold text-[18px] tnum">{inr(total)}</b></div>
            <p className="text-[12.5px] text-ink3 mt-1.5">{l.m.kind === 'Staff' ? 'Staff pay at the desk or from salary.' : 'Added to the student’s fees. Parents pay in one place.'}</p>
          </div>
          <Button variant="primary" size="lg" className="w-full !h-14 !text-[16px]" icon={I.CornerDownLeft} onClick={ret}>{total ? (l.m.kind === 'Staff' ? `Return · ${inr(total)} to pay` : `Return and add ${inr(total)} to fees`) : 'Return book'}</Button>
        </div>
      )}
      {!hit && !done && !miss && (
        <div className="rounded-2xl border border-dashed border-line p-6 text-center text-[13.5px] text-ink3">
          <I.CornerDownLeft size={22} className="mx-auto mb-2" />The fine is worked out by itself from the due date: {inr(FINE_DAY)} a day, up to {inr(FINE_MAX)} a book.
        </div>
      )}
      <ScanSheet open={scan} what="book" code="10388" onClose={() => setScan(false)} onFound={(c) => { setQ(c); find(c); }} />
    </div>
  );
}

function ReservationsSheet({ open, onClose }) {
  const toast = useToast();
  const rows = BOOKS.filter((b) => b.reserve?.length);
  return (
    <Sheet open={open} onClose={onClose} title="Reservations" sub="First come, first served (Library Settings). The first in the queue gets the next returned copy." wide>
      <div className="flex flex-col gap-4">
        {rows.map((b) => (
          <div key={b.id} className="rounded-2xl border border-line overflow-hidden">
            <div className="flex items-center gap-3 p-3.5"><Cover b={b} size={40} /><div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px] truncate">{b.title}</p><p className="text-[12.5px] text-ink3">{avail(b)} of {b.total} copies free · {b.reserve.length} waiting</p></div></div>
            <ol className="border-t border-line/70 divide-y divide-line/70">
              {b.reserve.map((k, i) => { const m = M[k]; return (
                <li key={k} className="flex items-center gap-3 px-3.5 py-2">
                  <span className="w-6 h-6 rounded-full bg-sunken text-[12px] font-bold grid place-items-center tnum">{i + 1}</span>
                  <Avatar name={m.name} size={28} />
                  <span className="flex-1 min-w-0 text-[14px] truncate"><b className="font-semibold">{m.name}</b> <span className="text-ink3">· {m.kind === 'Staff' ? 'Staff' : m.group} · since {dshort(-(i * 3 + 2))}</span></span>
                  <button onClick={() => toast({ title: `Reservation cancelled for ${m.name}`, body: b.title, undo: () => {} })} className="text-[12.5px] font-semibold text-ink3 hover:text-bad h-8 px-2 rounded-lg">Cancel</button>
                </li>
              ); })}
            </ol>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

/* ======================= Books ======================= */
function BooksPage({ params }) {
  if (params?.id && BOOK[params.id]) return <BookDetail b={BOOK[params.id]} />;
  return <BookList />;
}

function BookList() {
  const { go } = useNav();
  const toast = useToast();
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [only, setOnly] = useState('all');
  const [add, setAdd] = useState(false);
  const [labels, setLabels] = useState(false);
  const rows = BOOKS.filter((b) => (cat === 'all' || b.cat === cat) && (only === 'all' || avail(b) > 0) &&
    (!q || (b.title + b.author + b.isbn + b.pub + b.sub).toLowerCase().includes(q.toLowerCase()) || COPIES[b.id].some((c) => String(c.acc) === q.trim())));
  return (
    <div>
      <ModuleHead sub="3,215 titles · 6,842 copies · 412 out now"
        actions={<>
          <Button variant="secondary" icon={I.Upload} className="hidden @md:inline-flex" onClick={() => toast({ title: 'Import the catalogue from Excel', body: 'Download the template, upload, check every row, then import.', tone: 'info' })}>Import</Button>
          <Button variant="secondary" icon={I.Barcode} onClick={() => setLabels(true)}>Print labels</Button>
          <Button variant="primary" icon={I.BookPlus} onClick={() => setAdd(true)}>Add book</Button>
        </>} />
      <div className="flex flex-col gap-4">
        <Chips value={cat} onChange={setCat} options={CATS.map(([v, l, n]) => ({ value: v, label: l, count: n.toLocaleString('en-IN') }))} />
        <Card className="overflow-hidden">
          <Toolbar>
            <SearchBox id="book-q" value={q} onChange={setQ} placeholder="Title, author, ISBN or accession no." />
            <Segmented value={only} onChange={setOnly} options={[{ value: 'all', label: 'All books' }, { value: 'free', label: 'Available only' }]} />
            <ExportButton what="book catalogue" />
          </Toolbar>
          <DataList rows={rows} onRow={(b) => go('library', { page: 'books', id: b.id })} minWidth={860}
            empty={<Empty icon={I.SearchX} title="No book matches" body={q ? `Nothing called “${q}”. Try the author or the ISBN on the back cover.` : 'No book in this category is free right now.'} action={<Button variant="secondary" onClick={() => { setQ(''); setCat('all'); setOnly('all'); }}>Clear filters</Button>} />}
            columns={[
              { key: 't', label: 'Book', render: (b) => <div className="flex items-center gap-3"><Cover b={b} size={40} /><div className="min-w-0"><p className="font-semibold leading-tight">{b.title}</p><p className="text-[12.5px] text-ink3">{b.author} · {b.pub}</p></div></div> },
              { key: 'c', label: 'Category', render: (b) => <><p>{b.cat}</p><p className="text-[12.5px] text-ink3">{b.sub}</p></> },
              { key: 'i', label: 'ISBN', nowrap: true, render: (b) => <span className="font-mono text-[12.5px]">{showIsbn(b.isbn)}</span> },
              { key: 'n', label: 'Copies', align: 'right', render: (b) => b.total },
              { key: 'a', label: 'Available', align: 'right', render: (b) => b.ref ? <span className="text-ink3 text-[13px]">Reading room</span> : <span className={cx('font-semibold', avail(b) === 0 ? 'text-bad' : 'text-ok')}>{avail(b)}</span> },
              { key: 'o', label: 'Issued', align: 'right', render: (b) => b.out },
              { key: 's', label: 'Shelf', nowrap: true, render: (b) => <span className="font-mono text-[12.5px]">{b.shelf}</span> },
            ]}
            mobile={(b) => ({ title: b.title, sub: `${b.author} · Shelf ${b.shelf}`, icon: 'BookOpen', iconTone: avail(b) ? 'brand' : 'neutral', pills: [b.ref ? <Pill key="r" tone="neutral" className="!h-[22px] !text-[11.5px]">Reading room only</Pill> : <Pill key="a" tone={avail(b) ? 'ok' : 'bad'} className="!h-[22px] !text-[11.5px]">{avail(b)} of {b.total} free</Pill>, b.reserve?.length ? <Pill key="q" tone="brand" className="!h-[22px] !text-[11.5px]">{b.reserve.length} waiting</Pill> : null] })}
            footer={cat === 'all' && !q && only === 'all' ? `Showing ${rows.length} of 3,215 titles · example records` : `Showing ${rows.length} matching`} />
        </Card>
      </div>
      <AddBookSheet open={add} onClose={() => setAdd(false)} />
      <LabelSheet open={labels} onClose={() => setLabels(false)} />
    </div>
  );
}

function AddBookSheet({ open, onClose }) {
  const toast = useToast();
  const empty = { title: '', author: '', pub: '', isbn: '', cat: 'Fiction', sub: '', copies: '1', price: '', shelf: '' };
  const [f, setF] = useState(empty);
  const [tried, setTried] = useState(false);
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (open) { setF(empty); setTried(false); setTouched(false); } }, [open]);
  const clean = f.isbn.replace(/[\s-]/g, '');
  const dup = clean && BOOKS.find((b) => b.isbn === clean);
  const err = {
    title: !f.title.trim() ? 'Enter the title as on the cover' : '',
    author: !f.author.trim() ? 'Enter at least one author' : '',
    isbn: clean && !isbnOk(clean) ? 'This ISBN is not valid. Check the number on the back cover.' : dup ? `Already in the catalogue: “${dup.title}”. Add copies to it instead.` : '',
    copies: !(Number(f.copies) >= 1) ? 'At least 1 copy' : '',
  };
  const n = Number(f.copies) || 0;
  const set = (k) => (e) => setF({ ...f, [k]: e.target ? e.target.value : e });
  return (
    <FormSheet open={open} onClose={onClose} title="Add book" sub="Type or scan the ISBN first. Details fill in when the book is found." submitLabel={n > 1 ? `Add book and ${n} copies` : 'Add book'}
      onSubmit={() => { setTried(true); if (Object.values(err).some(Boolean)) return false; toast({ title: `“${f.title.trim()}” added`, body: `${n} ${n === 1 ? 'copy' : 'copies'} · accession ${n > 1 ? `10987 to ${10986 + n}` : '10987'} · print the labels next` }); return true; }}>
      <Field label="ISBN" id="ab-isbn" error={(tried || touched) && err.isbn} hint="10 or 13 digits. Hyphens and spaces are fine.">
        <div className="flex gap-2">
          <Input id="ab-isbn" value={f.isbn} onChange={set('isbn')} onBlur={() => setTouched(true)} error={(tried || touched) && err.isbn} className="font-mono flex-1" placeholder="978-81-291-1528-1" autoComplete="off" />
          <Button type="button" variant="secondary" onClick={() => { setTouched(true); if (clean && isbnOk(clean) && !dup) { setF({ ...f, title: 'The Room on the Roof', author: 'Ruskin Bond', pub: 'Penguin India', cat: 'Fiction', sub: 'English', price: '250' }); toast({ title: 'Details filled from the ISBN', body: 'Check them before saving', tone: 'info' }); } }}>Fill</Button>
        </div>
      </Field>
      <Field label="Title" required id="ab-title" error={tried && err.title}><Input id="ab-title" value={f.title} onChange={set('title')} error={tried && err.title} /></Field>
      <div className="grid grid-cols-1 @sm:grid-cols-2 gap-3">
        <Field label="Author(s)" required id="ab-author" error={tried && err.author}><Input id="ab-author" value={f.author} onChange={set('author')} error={tried && err.author} placeholder="Pick or add" /></Field>
        <Field label="Publisher" id="ab-pub"><Input id="ab-pub" value={f.pub} onChange={set('pub')} placeholder="Pick or add" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" id="ab-cat"><Select id="ab-cat" value={f.cat} onChange={set('cat')} options={CATS.slice(1).map(([v, l]) => ({ value: v, label: l }))} /></Field>
        <Field label="Number of copies" required id="ab-copies" error={tried && err.copies} hint={n > 0 ? `Accession ${n > 1 ? `10987 to ${10986 + n}` : '10987'}` : ''}><Input id="ab-copies" inputMode="numeric" value={f.copies} onChange={(e) => setF({ ...f, copies: e.target.value.replace(/\D/g, '').slice(0, 3) })} error={tried && err.copies} className="tnum" /></Field>
      </div>
      <details className="group rounded-xl border border-line px-3.5 py-2.5">
        <summary className="cursor-pointer text-[14px] font-semibold text-ink2 list-none flex items-center gap-2"><I.ChevronRight size={16} className="group-open:rotate-90 transition" />More details: subject, price, shelf</summary>
        <div className="grid grid-cols-2 gap-3 pt-3">
          <Field label="Subject" id="ab-sub"><Input id="ab-sub" value={f.sub} onChange={set('sub')} /></Field>
          <Field label="Price (₹)" id="ab-price" hint="Used for lost-book charges"><Input id="ab-price" inputMode="numeric" value={f.price} onChange={set('price')} className="tnum" /></Field>
          <Field label="Shelf location" id="ab-shelf"><Input id="ab-shelf" value={f.shelf} onChange={set('shelf')} placeholder="A-3" /></Field>
        </div>
      </details>
    </FormSheet>
  );
}

function LabelSheet({ open, onClose, copies }) {
  const toast = useToast();
  const [what, setWhat] = useState('new');
  const n = copies ? copies.length : what === 'new' ? 24 : 4;
  return (
    <Sheet open={open} onClose={onClose} title="Print book labels" sub="A4 sheet of 24 labels (3 × 8). Barcode with the accession number."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={I.Printer} onClick={() => { onClose(); toast({ title: `${n} labels sent to the library printer`, body: 'Also saved as book-labels.pdf' }); }}>Print {n} labels</Button></>}>
      {!copies && <Segmented value={what} onChange={setWhat} className="w-full mb-4" options={[{ value: 'new', label: 'Added this week (24)' }, { value: 'pick', label: 'Copies I pick (4)' }]} />}
      <div className="grid grid-cols-3 gap-2">
        {(copies || [10231, 10232, 10233, 10234, 10115, 10116]).slice(0, 6).map((acc) => (
          <div key={acc} className="rounded-lg border border-line p-2 text-center">
            <p className="text-[9.5px] font-semibold text-ink3 truncate">Sunrise Public School</p>
            <Barcode code={acc} className="w-full h-7 text-ink my-1" />
            <p className="font-mono text-[11px] font-semibold">{acc}</p>
          </div>
        ))}
      </div>
      <p className="text-[12.5px] text-ink3 mt-3">QR and RFID labels can be chosen in Library Settings.</p>
    </Sheet>
  );
}

function BookDetail({ b }) {
  const toast = useToast();
  const { go } = useNav();
  const canEdit = useCanEdit();
  const [copies, setCopies] = useState(COPIES[b.id]);
  const [withdraw, setWithdraw] = useState(null);
  const [reason, setReason] = useState('');
  const [lost, setLost] = useState(null);
  const [addCopies, setAddCopies] = useState(false);
  const [n, setN] = useState('2');
  const [labels, setLabels] = useState(null);
  const count = (s) => copies.filter((c) => c.status === s).length;
  return (
    <div>
      <Back page="books" label="Books" extra={b.cat} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Card className="p-4 @md:p-5 flex flex-col @lg:flex-row @lg:items-center gap-4">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <Cover b={b} size={84} />
            <div className="min-w-0">
              <h1 className="font-display text-[22px] @md:text-[26px] font-semibold tracking-tight leading-tight">{b.title}</h1>
              <p className="text-[14px] text-ink2 mt-0.5">{b.author}</p>
              <p className="text-[13px] text-ink3 mt-0.5">{b.pub} · <span className="font-mono text-[12.5px]">ISBN {showIsbn(b.isbn)}</span></p>
              <div className="flex gap-1.5 mt-2 flex-wrap"><Pill tone="neutral">{b.cat} · {b.sub}</Pill><Pill tone="neutral">Shelf {b.shelf}</Pill><Pill tone="neutral">{inr(b.price)}</Pill>{b.ref && <Pill tone="info">Reading room only</Pill>}</div>
            </div>
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <Button variant="primary" icon={I.Plus} className="flex-1 @lg:flex-none" onClick={() => setAddCopies(true)}>Add copies</Button>
              <MoreMenu items={[[I.Barcode, 'Print labels for all copies', () => setLabels(copies.map((c) => c.acc))], [I.Pencil, 'Edit book details', () => toast({ title: `Editing “${b.title}”`, tone: 'info' })]]} />
            </div>
          )}
        </Card>
        <Stats items={[
          { label: 'Copies', value: String(copies.length), icon: I.BookCopy },
          { label: b.ref ? 'Reading room' : 'Available', value: String(count(b.ref ? 'Reading room' : 'Available')), tone: 'ok', icon: I.BookCheck },
          { label: 'Issued', value: String(count('Issued')), tone: 'info', icon: I.ArrowRightLeft },
          { label: 'Lost or damaged', value: String(count('Lost') + count('Damaged') + count('Withdrawn')), tone: count('Lost') + count('Damaged') ? 'warn' : undefined, icon: I.BookX },
        ]} />
        <Split side={340} className="[&>*]:min-w-0">
          <Card className="overflow-hidden">
            <CardHead title="Copies" sub="Each copy has its own accession number and barcode" icon={I.Barcode} />
            <DataList rows={copies} rowKey={(c) => c.acc} minWidth={640} footer={`${copies.length} copies · withdrawn copies stay in the history`}
              columns={[
                { key: 'a', label: 'Accession no.', nowrap: true, render: (c) => <div className="flex items-center gap-3"><Barcode code={c.acc} className="w-12 h-6 text-ink2" /><span className="font-mono font-semibold">{c.acc}</span></div> },
                { key: 's', label: 'Status', render: (c) => <Pill tone={statusTone[c.status]}>{c.status}</Pill> },
                { key: 'w', label: 'Who has it', render: (c) => c.loan ? <div className="flex items-center gap-2"><Avatar name={c.loan.m.name} size={28} /><div><p className="leading-tight">{c.loan.m.name}</p><p className={cx('text-[12px]', c.loan.due < 0 ? 'text-bad font-semibold' : 'text-ink3')}>{c.loan.m.kind === 'Staff' ? 'Staff' : c.loan.m.group} · due {dshort(c.loan.due)}{c.loan.due < 0 ? ` · ${-c.loan.due} days late` : ''}</p></div></div> : <span className="text-ink3">{c.status === 'Withdrawn' ? c.note : '—'}</span> },
                { key: 'm', label: '', render: (c) => canEdit && c.status !== 'Withdrawn' && <MoreMenu size="sm" items={[
                  [I.Printer, 'Print label', () => setLabels([c.acc])],
                  [I.BookX, 'Mark lost or damaged', () => setLost(c)],
                  ...(c.status !== 'Issued' ? [[I.Archive, 'Withdraw this copy', () => { setWithdraw(c); setReason(''); }, 'bad']] : []),
                ]} /> },
              ]}
              mobile={(c) => ({ title: `Acc. ${c.acc}`, sub: c.loan ? `${c.loan.m.name} · due ${dshort(c.loan.due)}` : c.status === 'Withdrawn' ? c.note : `Shelf ${b.shelf}`, icon: 'Barcode', iconTone: statusTone[c.status] === 'ok' ? 'ok' : 'neutral', right: <Pill tone={statusTone[c.status]} className="!h-[22px] !text-[11.5px]">{c.status}</Pill> })} />
          </Card>
          <Col>
            <Card>
              <CardHead title="Waiting list" sub="First come, first served" icon={I.BookmarkPlus} action={<Pill tone={b.reserve?.length ? 'brand' : 'neutral'}>{b.reserve?.length || 0}</Pill>} />
              {b.reserve?.length ? (
                <ol className="px-3 pb-3">
                  {b.reserve.map((k, i) => <li key={k} className="flex items-center gap-3 px-2 py-2"><span className="w-6 h-6 rounded-full bg-sunken text-[12px] font-bold grid place-items-center tnum">{i + 1}</span><Avatar name={M[k].name} size={30} /><span className="text-[14px] min-w-0 truncate"><b className="font-semibold">{M[k].name}</b> <span className="text-ink3">· {M[k].kind === 'Staff' ? 'Staff' : M[k].group}</span></span></li>)}
                </ol>
              ) : <p className="px-5 pb-5 text-[13.5px] text-ink3">Nobody is waiting for this book.</p>}
            </Card>
            <Card>
              <CardHead title="Read this year" icon={I.TrendingUp} />
              <div className="px-5 pb-5 flex items-baseline gap-2"><span className="font-display font-semibold text-[28px] tnum">{b.reads}</span><span className="text-[13px] text-ink3">issues since 1 Jun 2026</span></div>
            </Card>
          </Col>
        </Split>
      </div>

      <FormSheet open={addCopies} onClose={() => setAddCopies(false)} title={`Add copies of “${b.title}”`} sub="Accession numbers are given in sequence" submitLabel={`Add ${Number(n) || 0} copies`}
        onSubmit={() => { const k = Number(n); if (!k) return false; const start = 10987; setCopies((x) => [...x, ...Array.from({ length: k }, (_, i) => ({ acc: start + i, status: b.ref ? 'Reading room' : 'Available' }))]); toast({ title: `${k} copies added`, body: `Accession ${start} to ${start + k - 1}. Print their labels next.` }); return true; }}>
        <Field label="Number of copies" required id="ac-n" hint={`Next accession numbers: 10987${Number(n) > 1 ? ` to ${10986 + Number(n)}` : ''}`}><Input id="ac-n" inputMode="numeric" value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, '').slice(0, 2))} className="tnum" /></Field>
      </FormSheet>
      <ConfirmSheet open={!!withdraw} onClose={() => setWithdraw(null)} title={withdraw ? `Withdraw copy ${withdraw.acc}?` : ''} sub="It leaves the shelf count but stays in the history and reports." confirmLabel="Withdraw copy" danger
        onConfirm={() => { const c = withdraw; setCopies((x) => x.map((y) => (y.acc === c.acc ? { ...y, status: 'Withdrawn', note: reason || 'Old copy' } : y))); toast({ title: `Copy ${c.acc} withdrawn`, body: reason || 'Old copy', undo: () => setCopies((x) => x.map((y) => (y.acc === c.acc ? c : y))) }); }}>
        <Field label="Reason" id="wd-reason"><Textarea id="wd-reason" value={reason} onChange={setReason} rows={2} placeholder="Pages torn, very old edition…" /></Field>
      </ConfirmSheet>
      <LostSheet copy={lost} book={b} onClose={() => setLost(null)} onDone={(c, kind) => setCopies((x) => x.map((y) => (y.acc === c.acc ? { ...y, status: kind } : y)))} />
      <LabelSheet open={!!labels} copies={labels} onClose={() => setLabels(null)} />
    </div>
  );
}

function LostSheet({ copy, book, onClose, onDone }) {
  const toast = useToast();
  const [acc, setAcc] = useState('');
  const [kind, setKind] = useState('Lost');
  const [charge, setCharge] = useState('');
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const found = copy?.pick ? findCopy(acc.trim()) : copy ? { b: book, c: copy } : null;
  const b = found?.b; const c = found?.c;
  useEffect(() => { if (copy) { setAcc(copy.pick ? '' : String(copy.acc)); setKind('Lost'); setCharge(copy.pick ? '' : String(book.price + 50)); setNote(''); setTried(false); } }, [copy]);
  useEffect(() => { if (copy?.pick && b) setCharge(String(b.price + 50)); }, [b?.id]);
  const ch = Number(String(charge).replace(/\D/g, '')) || 0;
  const who = c?.loan?.m;
  return (
    <FormSheet open={!!copy} onClose={onClose} title={copy?.pick ? 'Mark a copy lost or damaged' : copy ? `Copy ${copy.acc}: lost or damaged` : ''} sub={b ? `${b.title} · price ${inr(b.price)}` : 'Scan or type the accession number'} submitLabel={ch > 500 ? 'Send for approval' : `Mark ${kind.toLowerCase()}`}
      onSubmit={() => { setTried(true); if (!c || !ch) return false; onDone(c, kind); toast({ title: `Copy ${c.acc} marked ${kind.toLowerCase()}`, body: ch > 500 ? `${inr(ch)} charge waits for Lakshmi Rao’s approval` : who ? `${inr(ch)} added to ${who.name}’s ${who.kind === 'Staff' ? 'dues' : 'fees'}` : `${inr(ch)} charge recorded` }); return true; }}>
      {copy?.pick && (
        <Field label="Copy (accession no.)" required id="ls-acc" error={tried && !c && (acc.trim() ? `No copy ${acc.trim()} in the catalogue` : 'Scan or type the accession number')}>
          <Input id="ls-acc" value={acc} onChange={(e) => setAcc(e.target.value.replace(/\D/g, '').slice(0, 5))} error={tried && !c} className="font-mono" placeholder="10233" autoComplete="off" />
        </Field>
      )}
      <Field label="Lost or damaged" required id="ls-kind"><Segmented value={kind} onChange={setKind} options={['Lost', 'Damaged']} className="w-full" /></Field>
      <Field label="Charge (₹)" required id="ls-charge" error={tried && c && !ch && 'Enter the charge'} hint={ch > 500 ? 'Above ₹500: goes to Approvals first and is added only when approved.' : 'Book price plus ₹50 processing (Library Settings)'}><Input id="ls-charge" inputMode="numeric" value={charge} onChange={(e) => setCharge(e.target.value)} className="tnum" /></Field>
      {who && <p className="text-[13px] text-ink3 -mt-1">Charged to {who.name} ({who.kind === 'Staff' ? 'staff' : who.group}), who has this copy.</p>}
      {c && !who && <p className="text-[13px] text-ink3 -mt-1">Nobody has this copy issued, so nobody is charged unless you pick a member.</p>}
      <Field label="Note" id="ls-note"><Textarea id="ls-note" value={note} onChange={setNote} rows={2} placeholder="What happened" /></Field>
    </FormSheet>
  );
}

/* ======================= Members & Cards ======================= */
const MEMBER_ROWS = (() => {
  const counts = {}; Object.values(LOANS).forEach((l) => { counts[l.m.id] = (counts[l.m.id] || 0) + 1; });
  const fines = { [M.harini.id]: 10 };
  const studs = [FEATURED, ...STUDENTS.filter((s) => s.id !== FEATURED.id && s.status !== 'Inactive')].map((s, i) => {
    const m = stuM(s);
    const out = counts[m.id] ?? (i % 4 === 0 ? 0 : (i % 3) % (m.limit + 1));
    return { ...m, out: Math.min(out, m.limit), fine: fines[m.id] ?? (i % 13 === 5 ? 24 : i % 17 === 3 ? 42 : 0), blocked: i === 23 ? 'Lost 2 books, charges not paid' : null };
  });
  const staff = STAFF.map((t, i) => { const m = staffM(t); return { ...m, out: counts[m.id] ?? (i % 3), fine: m.name === 'Deepak Verma' ? 30 : 0, blocked: null }; });
  return [...studs, ...staff];
})();

function MembersPage() {
  const toast = useToast();
  const { go } = useNav();
  const { role } = useRole();
  const canEdit = useCanEdit();
  // The Librarian sees only name, photo and class from Student Management, so no link to the full profile
  const canProfile = role.access.students === 'full';
  const [kind, setKind] = useState('Student');
  const [cls, setCls] = useState('all');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState(MEMBER_ROWS);
  const [block, setBlock] = useState(null);
  const [limit, setLimit] = useState(null);
  const [print, setPrint] = useState(false);
  const [barcodeOnId, setBarcodeOnId] = useState(true);
  const [blockWhy, setBlockWhy] = useState('');
  const [blockTried, setBlockTried] = useState(false);
  const list = rows.filter((m) => (kind === 'Blocked' ? m.blocked : m.kind === kind) && (cls === 'all' || m.clsId === cls) && (!q || (m.name + m.card + m.group).toLowerCase().includes(q.toLowerCase())));
  return (
    <div>
      <ModuleHead sub="Every student and staff member is a member. Limits come from Library Settings."
        actions={<Button variant="primary" icon={I.IdCard} onClick={() => setPrint(true)}>Print library cards</Button>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Card className="overflow-hidden">
          <Toolbar>
            <SearchBox id="mem-q" value={q} onChange={setQ} placeholder="Name or card number" />
            <Segmented value={kind} onChange={(v) => { setKind(v); setCls('all'); }} options={[{ value: 'Student', label: 'Students' }, { value: 'Staff', label: 'Staff' }, { value: 'Blocked', label: `Blocked (${rows.filter((r) => r.blocked).length})` }]} />
            {kind === 'Student' && <Select id="mem-cls" value={cls} onChange={setCls} className="@md:w-44" options={[{ value: 'all', label: 'All classes' }, ...CLASSES.map((c) => ({ value: c.id, label: c.name }))]} />}
            <ExportButton what="library members" />
          </Toolbar>
          <DataList rows={list} minWidth={880}
            empty={<Empty icon={kind === 'Blocked' ? I.CircleCheck : I.SearchX} title={kind === 'Blocked' ? 'Nobody is blocked' : 'No member matches'} body={kind === 'Blocked' ? 'Blocked members show here with the reason.' : 'Try the card number printed under the barcode.'} />}
            columns={[
              { key: 'n', label: 'Member', render: (m) => <div className="flex items-center gap-3"><Avatar name={m.name} size={36} /><div className="min-w-0"><p className="font-semibold leading-tight">{m.name}</p><p className="text-[12.5px] text-ink3">{m.kind}</p></div></div> },
              { key: 'g', label: 'Class or department', nowrap: true, render: (m) => m.group },
              { key: 'c', label: 'Card no.', nowrap: true, render: (m) => <span className="font-mono text-[12.5px]">{m.card}</span> },
              { key: 'o', label: 'Books out', nowrap: true, render: (m) => <span className={cx('tnum', m.out >= m.limit && 'text-warn font-semibold')}>{m.out} of {m.limit}</span> },
              { key: 'f', label: 'Fines due', align: 'right', render: (m) => m.fine ? <span className="font-semibold text-warn">{inr(m.fine)}</span> : <span className="text-ink3">—</span> },
              { key: 's', label: 'Status', render: (m) => m.blocked ? <div><Pill tone="bad">Blocked</Pill><p className="text-[12px] text-ink3 mt-0.5">{m.blocked}</p></div> : <Pill tone="ok" dot>Active</Pill> },
              { key: 'm', label: '', render: (m) => canEdit && <MoreMenu size="sm" items={[
                m.blocked ? [I.CircleCheck, 'Unblock', () => { setBlock({ m, un: true }); setBlockWhy(''); setBlockTried(false); }] : [I.Ban, 'Block', () => { setBlock({ m }); setBlockWhy(''); setBlockTried(false); }, 'bad'],
                [I.SlidersHorizontal, 'Change limit', () => setLimit(m)],
                [I.IdCard, 'Print library card', () => toast({ title: `Library card for ${m.name} sent to the printer`, body: m.card })],
                ...(m.sid && canProfile ? [[I.User, 'Open student profile', () => go('student', { id: m.sid })]] : []),
              ]} /> },
            ]}
            mobile={(m) => ({ title: m.name, sub: `${m.kind === 'Staff' ? m.group : `Class ${m.group}`} · ${m.card}`, avatar: m.name, pills: [<Pill key="o" tone={m.out >= m.limit ? 'warn' : 'neutral'} className="!h-[22px] !text-[11.5px]">{m.out} of {m.limit} books</Pill>, m.fine ? <Pill key="f" tone="warn" className="!h-[22px] !text-[11.5px]">{inr(m.fine)} fine</Pill> : null, m.blocked ? <Pill key="b" tone="bad" className="!h-[22px] !text-[11.5px]">Blocked</Pill> : null] })}
            footer={kind === 'Student' && cls === 'all' && !q ? `Showing ${list.length} of 1,236 students · example records` : kind === 'Staff' && !q ? `Showing ${list.length} of 86 staff · example records` : `Showing ${list.length}`} />
        </Card>

        <div className="grid @xl:grid-cols-2 gap-5 @lg:gap-6 items-start [&>*]:min-w-0">
          <Card>
            <CardHead title="Library card" sub="Design from Settings, Document Designs · ID card size" icon={I.IdCard} />
            <div className="px-5 pb-5 flex flex-col gap-4">
              <div className="mx-auto w-full max-w-[340px] rounded-2xl border border-line overflow-hidden shadow-card">
                <div className="bg-brand text-brandink px-4 py-3 relative overflow-hidden"><div className="absolute inset-0 dotgrid opacity-50" /><p className="relative font-display font-semibold text-[15px] leading-tight">Sunrise Public School</p><p className="relative text-[11.5px] opacity-90">Library card · 2026–27</p></div>
                <div className="p-4 flex gap-3.5 bg-surface">
                  <Avatar name="Aarav Sharma" size={60} />
                  <div className="min-w-0 text-[13px] flex-1">
                    <p className="font-semibold text-[15px] leading-tight">Aarav Sharma</p>
                    <p className="text-ink3">Class 7 B · up to 3 books</p>
                    <Barcode code="LC-2021-0417" className="w-full h-8 text-ink mt-2" />
                    <p className="font-mono text-[11.5px] text-center mt-0.5">LC-2021-0417</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl bg-sunken p-3.5 flex items-center gap-3">
                <Switch id="lib-onid" on={barcodeOnId} label="Library barcode on the ID card" onChange={(v) => { if (!canEdit) return; setBarcodeOnId(v); toast({ title: v ? 'Library barcode will print on student ID cards' : 'Separate library cards will be printed' }); }} />
                <label htmlFor="lib-onid" className="text-[14px]"><b className="font-semibold">Put the barcode on the student ID card</b><span className="block text-[12.5px] text-ink3">Then students need no separate library card</span></label>
              </div>
            </div>
          </Card>
          <Card>
            <CardHead title="Borrowing limits" sub="From Library Settings, by member type" icon={I.SlidersHorizontal} />
            <ul className="px-5 pb-5 divide-y divide-line/70">
              {[['Nursery to Class 2', '1 book · 7 days'], ['Classes 3 to 5', '2 books · 14 days'], ['Classes 6 to 10', '3 books · 14 days'], ['Staff', '5 books · 30 days'], ['Reference books', 'Reading room only']].map(([k, v]) => (
                <li key={k} className="flex justify-between gap-3 py-2.5 text-[14px]"><span className="text-ink2">{k}</span><b className="font-semibold">{v}</b></li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <FormSheet open={!!block} onClose={() => setBlock(null)} title={block ? `${block.un ? 'Unblock' : 'Block'} ${block.m.name}?` : ''} sub={block?.un ? 'They can borrow again at once.' : 'They cannot borrow until unblocked. Books they have stay with them.'} submitLabel={block?.un ? 'Unblock' : 'Block member'}
        onSubmit={() => { setBlockTried(true); if (!blockWhy.trim()) return false; const { m, un } = block; setRows((x) => x.map((y) => (y.id === m.id ? { ...y, blocked: un ? null : blockWhy.trim() } : y))); toast({ title: `${m.name} ${un ? 'unblocked' : 'blocked'}`, undo: () => setRows((x) => x.map((y) => (y.id === m.id ? m : y))) }); return true; }}>
        <Field label="Reason" required id="bl-reason" error={blockTried && !blockWhy.trim() && 'Give a reason. It is shown with the member.'}><Textarea id="bl-reason" value={blockWhy} onChange={setBlockWhy} rows={2} placeholder={block?.un ? 'Charges paid on…' : 'Two books lost, charges not paid'} /></Field>
      </FormSheet>
      <LimitSheet m={limit} onClose={() => setLimit(null)} onSave={(m, v) => setRows((x) => x.map((y) => (y.id === m.id ? { ...y, limit: v } : y)))} />
      <PrintCardsSheet open={print} onClose={() => setPrint(false)} />
    </div>
  );
}

function LimitSheet({ m, onClose, onSave }) {
  const toast = useToast();
  const [v, setV] = useState('');
  const [why, setWhy] = useState('');
  const [tried, setTried] = useState(false);
  useEffect(() => { if (m) { setV(String(m.limit + 1)); setWhy(''); setTried(false); } }, [m]);
  return (
    <FormSheet open={!!m} onClose={onClose} title={m ? `Change ${m.name}’s limit` : ''} sub={m ? `Now ${m.limit} books, from Library Settings` : ''} submitLabel="Save limit"
      onSubmit={() => { setTried(true); if (!why.trim() || !Number(v)) return false; onSave(m, Number(v)); toast({ title: `${m.name} can borrow ${v} books`, body: `Reason: ${why.trim()}` }); return true; }}>
      <Field label="Books at a time" required id="lim-v"><Input id="lim-v" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, '').slice(0, 2))} className="tnum w-28" /></Field>
      <Field label="Reason" required id="lim-why" error={tried && !why.trim() && 'Say why, so others understand later'}><Textarea id="lim-why" value={why} onChange={setWhy} rows={2} placeholder="Reading project for the Science exhibition" /></Field>
    </FormSheet>
  );
}

function PrintCardsSheet({ open, onClose }) {
  const toast = useToast();
  const [cls, setCls] = useState('7');
  const c = CLASSES.find((x) => x.id === cls);
  const n = cls === '7' ? 76 : cls === 'staff' ? 86 : c ? c.sections.length * 38 : 0;
  return (
    <Sheet open={open} onClose={onClose} title="Print library cards" sub="Printed in batches of up to 50"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={I.Printer} onClick={() => { onClose(); toast({ title: `${n} library cards sent to the printer`, body: `${Math.ceil(n / 50)} ${Math.ceil(n / 50) === 1 ? 'batch' : 'batches'} · also saved as library-cards.pdf` }); }}>Print {n} cards</Button></>}>
      <Field label="Whose cards" id="pc-cls"><Select id="pc-cls" value={cls} onChange={setCls} options={[...CLASSES.map((x) => ({ value: x.id, label: `${x.name} (all sections)` })), { value: 'staff', label: 'All staff' }]} /></Field>
      <p className="text-[13.5px] text-ink2 mt-3"><b className="font-semibold text-ink">{n} cards</b> in {Math.ceil(n / 50)} {Math.ceil(n / 50) === 1 ? 'batch' : 'batches'}. Cards already printed this year are printed again only if you tick them in the preview.</p>
    </Sheet>
  );
}

/* ======================= Fines & Stock Check ======================= */
const FINES0 = [
  { id: 'LF-0412', m: 'Varun Joshi', g: '6 A', book: 'Malgudi Days', acc: 10118, reason: 'Late · 12 days', amt: 24, status: 'Due', staff: false, when: 'Today' },
  { id: 'LF-0411', m: 'Tanvi Menon', g: '6 A', book: 'Tinkle Digest 312', acc: 10891, reason: 'Damaged · cover torn', amt: 60, status: 'Due', staff: false, when: 'Today' },
  { id: 'LF-0410', m: 'Deepak Verma', g: 'Staff · Teaching', book: 'Ignited Minds', acc: 10236, reason: 'Late · 15 days', amt: 30, status: 'Due', staff: true, when: 'Today' },
  { id: 'LF-0409', m: 'Harsha Verma', g: '8 B', book: 'Geronimo Stilton: The Kingdom of Fantasy', acc: 10362, reason: 'Late · 6 days', amt: 12, status: 'Due', staff: false, when: 'Today' },
  { id: 'LF-0405', m: 'Ananya Pillai', g: '8 A', book: 'Harry Potter and the Philosopher’s Stone', acc: 10414, reason: 'Lost', amt: 549, status: 'Waiting approval', staff: false, when: '7 Oct' },
  { id: 'LF-0404', m: 'Meera Chowdary', g: '9 B', book: 'Godan', acc: 10582, reason: 'Lost', amt: 275, status: 'Due', staff: false, when: '6 Oct' },
  { id: 'LF-0401', m: 'Charan Joshi', g: '8 A', book: 'The Diary of a Young Girl', acc: 10521, reason: 'Late · 21 days', amt: 42, status: 'Due', staff: false, when: '5 Oct' },
  { id: 'LF-0398', m: 'Krishna Rao', g: '6 B', book: 'Swami and Friends', acc: 10121, reason: 'Late · 9 days', amt: 18, status: 'Due', staff: false, when: '3 Oct' },
  { id: 'LF-0396', m: 'Lasya Kumar', g: '8 B', book: 'Grandma’s Bag of Stories', acc: 10343, reason: 'Damaged · water damage', amt: 40, status: 'Due', staff: false, when: '3 Oct' },
  { id: 'LF-0393', m: 'Nikhil Gupta', g: '5 B', book: 'The Adventures of Tom Sawyer', acc: 10471, reason: 'Late · 7 days', amt: 14, status: 'Due', staff: false, when: '1 Oct' },
  { id: 'LF-0391', m: 'Navya Rao', g: '8 B', book: 'Panchatantra Stories', acc: 10305, reason: 'Late · 4 days', amt: 8, status: 'Due', staff: false, when: '1 Oct' },
  { id: 'LF-0388', m: 'Saanvi Goud', g: '6 B', book: 'The Jungle Book', acc: 10386, reason: 'Late · 3 days', amt: 6, status: 'Due', staff: false, when: '30 Sep' },
  { id: 'LF-0385', m: 'Ishaan Sharma', g: '5 A', book: 'Wings of Fire', acc: 10233, reason: 'Late · 3 days', amt: 6, status: 'Paid', staff: false, when: '29 Sep', paid: 'Paid with fees 6 Oct · R/26/05012' },
  { id: 'LF-0382', m: 'Imran Shaikh', g: 'Staff · Teaching', book: 'The Adventures of Tom Sawyer', acc: 10470, reason: 'Late · 5 days', amt: 10, status: 'Paid', staff: true, when: '28 Sep', paid: 'Paid at the desk 2 Oct · LIB/26/0042' },
  { id: 'LF-0379', m: 'Tanvi Sharma', g: '6 A', book: 'Panchatantra Stories', acc: 10302, reason: 'Damaged · pages loose', amt: 80, status: 'Paid', staff: false, when: '24 Sep', paid: 'Paid with fees 30 Sep · R/26/04977' },
  { id: 'LF-0374', m: 'Aadhya Shetty', g: '6 A', book: 'Malgudi Days', acc: 10116, reason: 'Late · 20 days', amt: 40, status: 'Waived', staff: false, when: '18 Sep', paid: 'Waived by Padma Iyer: in hospital, medical certificate seen' },
  { id: 'LF-0351', m: 'Rohan Gupta', g: '6 A', book: 'Tinkle Digest 312', acc: 10887, reason: 'Late · 8 days', amt: 16, status: 'Paid', staff: false, when: '21 Aug', paid: 'Paid with fees 1 Sep · R/26/04211' },
  { id: 'LF-0322', m: 'Farhana Begum', g: 'Staff · Teaching', book: 'A Brief History of Time', acc: 10601, reason: 'Late · 4 days', amt: 8, status: 'Paid', staff: true, when: '30 Jul', paid: 'Paid at the desk 30 Jul · LIB/26/0019' },
  { id: 'LF-0287', m: 'Sai Iyer', g: '5 B', book: 'Panchatantra Stories', acc: 10304, reason: 'Damaged · pages loose', amt: 70, status: 'Paid', staff: false, when: '9 Jul', paid: 'Paid with fees 15 Jul · R/26/03120' },
].map((f) => { const [d, m] = f.when === 'Today' ? ['9', 'Oct'] : f.when.split(' '); return { ...f, iso: `2026-${String(MON.indexOf(m) + 1).padStart(2, '0')}-${d.padStart(2, '0')}` }; });
const PICK_COPY = { pick: true };
const fineTone = { Due: 'warn', Paid: 'ok', Waived: 'neutral', 'Waiting approval': 'info' };

function FinesPage() {
  const toast = useToast();
  const { role } = useRole();
  const canEdit = useCanEdit();
  const [view, setView] = useState('fines');
  const [fines, setFines] = useState(FINES0);
  const [st, setSt] = useState('Due');
  const [q, setQ] = useState('');
  const [waive, setWaive] = useState(null);
  const [why, setWhy] = useState('');
  const [lost, setLost] = useState(false);
  const [scan, setScan] = useState(false);
  const [closeIt, setCloseIt] = useState(false);
  const [markLost, setMarkLost] = useState(false);
  const [per, setPer] = useState(PERIODS.last30);
  const days = periodDays(per);
  const due = fines.filter((f) => f.status === 'Due');
  const dueSum = due.reduce((a, f) => a + f.amt, 0);
  const approver = role.id === 'principal' || role.id === 'schooladmin';
  const rows = fines.filter((f) => f.iso >= per.from && f.iso <= per.to && (st === 'all' || f.status === st) && (!q || (f.m + f.book + f.acc).toLowerCase().includes(q.toLowerCase())));
  const setStatus = (f, status, paid) => { const before = fines; setFines((x) => x.map((y) => (y.id === f.id ? { ...y, status, paid } : y))); return before; };
  return (
    <div>
      <ModuleHead sub="Late fines are worked out by themselves on return. Students pay theirs with their fees."
        actions={<>
          <Button variant="secondary" icon={I.ScanLine} onClick={() => { setView('stock'); setScan(true); }}>Continue stock check</Button>
          <Button variant="primary" icon={I.BookX} onClick={() => setLost(true)}>Mark lost or damaged</Button>
        </>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Stats items={[
          { label: 'Fines due', value: inr(dueSum), sub: `${due.length} members`, tone: 'warn', icon: I.IndianRupee },
          { label: 'Collected', value: inr(Math.round((620 / 9) * days)), sub: `${Math.round((41 / 9) * days)} fines · ${per.label.toLowerCase()}`, tone: 'ok', icon: I.CircleCheck },
          { label: 'Waived', value: inr(fines.filter((f) => f.status === 'Waived' && f.iso >= per.from && f.iso <= per.to).reduce((a, f) => a + f.amt, 0)), sub: `With a reason · ${per.label.toLowerCase()}`, icon: I.HandCoins },
          { label: 'Waiting approval', value: String(fines.filter((f) => f.status === 'Waiting approval').length), sub: 'Charges above ₹500', tone: 'info', icon: I.ListChecks },
        ]} />
        <Segmented value={view} onChange={setView} className="self-start" options={[{ value: 'fines', label: 'Fines' }, { value: 'stock', label: 'Stock check' }]} />

        {view === 'fines' && (
          <Card className="overflow-hidden animate-rise">
            <Toolbar>
              <SearchBox id="fine-q" value={q} onChange={setQ} placeholder="Member, book or accession no." />
              <DatePeriod id="fine-per" value={per} onChange={setPer} className="w-full @md:w-auto" />
              <Segmented value={st} onChange={setSt} options={[{ value: 'Due', label: 'Due' }, { value: 'Waiting approval', label: 'Approval' }, { value: 'Paid', label: 'Paid' }, { value: 'Waived', label: 'Waived' }, { value: 'all', label: 'All' }]} />
              <ExportButton what="library fines" />
            </Toolbar>
            <DataList rows={rows} minWidth={900}
              empty={<Empty icon={I.CircleCheck} title="Nothing here" body={`No fines with this status ${fmtRange(per)}.`} action={<Button variant="secondary" onClick={() => { setPer(PERIODS.acyear); setSt('all'); setQ(''); }}>Whole year, all fines</Button>} />}
              columns={[
                { key: 'm', label: 'Member', render: (f) => <div className="flex items-center gap-3"><Avatar name={f.m} size={34} /><div><p className="font-semibold leading-tight">{f.m}</p><p className="text-[12.5px] text-ink3">{f.g}</p></div></div> },
                { key: 'b', label: 'Book', render: (f) => <><p className="leading-tight">{f.book}</p><p className="text-[12px] text-ink3 font-mono">Acc. {f.acc}</p></> },
                { key: 'r', label: 'Reason', nowrap: true, render: (f) => <><p>{f.reason}</p><p className="text-[12px] text-ink3">{f.when}</p></> },
                { key: 'a', label: 'Amount', align: 'right', render: (f) => <b className="font-semibold">{inr(f.amt)}</b> },
                { key: 's', label: 'Status', render: (f) => <><Pill tone={fineTone[f.status]}>{f.status}</Pill>{f.paid && <p className="text-[12px] text-ink3 mt-0.5 max-w-[220px]">{f.paid}</p>}{f.status === 'Due' && <p className="text-[12px] text-ink3 mt-0.5">{f.staff ? 'Collect here or from salary' : 'Added to fees'}</p>}</> },
                { key: 'x', label: '', render: (f) => canEdit && (
                  f.status === 'Waiting approval' ? (approver ? <div className="flex gap-1.5"><Button size="sm" variant="soft" onClick={() => { const b = setStatus(f, 'Due'); toast({ title: `Approved: ${inr(f.amt)} for ${f.m}`, body: 'Added to the student’s fees', undo: () => setFines(b) }); }}>Approve</Button><Button size="sm" variant="ghost" onClick={() => { const b = setStatus(f, 'Waived', 'Rejected by Lakshmi Rao'); toast({ title: `Rejected: ${f.m}’s charge`, undo: () => setFines(b) }); }}>Reject</Button></div> : <span className="text-[12px] text-ink3">With Lakshmi Rao</span>)
                    : f.status === 'Due' ? <MoreMenu size="sm" items={[
                      ...(f.staff ? [[I.IndianRupee, 'Collect at the desk', () => { const b = setStatus(f, 'Paid', 'Paid at the desk today · LIB/26/0057'); toast({ title: `${inr(f.amt)} collected from ${f.m}`, body: 'Receipt LIB/26/0057', undo: () => setFines(b) }); }]] : []),
                      [I.HandCoins, 'Waive with a reason', () => { setWaive(f); setWhy(''); }],
                    ]} /> : null) },
              ]}
              mobile={(f) => ({ title: `${f.m} · ${inr(f.amt)}`, sub: `${f.book} · ${f.reason}`, avatar: f.m, pills: [<Pill key="s" tone={fineTone[f.status]} className="!h-[22px] !text-[11.5px]">{f.status}</Pill>] })}
              footer={`Showing ${rows.length} · ${per.label} · ${fmtRange(per)} · fines are never deleted, only paid or waived with a reason`} />
          </Card>
        )}

        {view === 'stock' && (
          <div className="flex flex-col gap-5 @lg:gap-6 animate-rise">
            <Card>
              <CardHead title="Stock check · October 2026" sub="Started 5 Oct by Padma Iyer · scan every copy on the shelves" icon={I.ScanLine} action={<Pill tone="info" dot>In progress</Pill>} />
              <div className="px-5 pb-5 flex flex-col gap-4">
                <div>
                  <div className="flex justify-between text-[13.5px] mb-1.5 tnum"><span><b className="font-semibold">2,140</b> of 6,842 copies scanned</span><span className="text-ink3">31%</span></div>
                  <Progress value={31} />
                </div>
                <ul className="grid grid-cols-2 @md:grid-cols-4 gap-2">
                  {[['A · Fiction', 'Done', 1206, 1206], ['B · Biography', 'Done', 612, 612], ['C · Science, maths', 'Scanning', 322, 540], ['D · Children’s', 'Not started', 0, 1480], ['E · Languages', 'Not started', 0, 820], ['F · Comics', 'Not started', 0, 410], ['R · Reference', 'Not started', 0, 640], ['Issued now', 'Counted', 412, 412]].map(([k, s, a, b]) => (
                    <li key={k} className={cx('rounded-xl border p-3', s === 'Scanning' ? 'border-brand/40 bg-brand/5' : 'border-line')}>
                      <p className="text-[13px] font-semibold truncate">{k}</p>
                      <p className={cx('text-[12px]', s === 'Done' || s === 'Counted' ? 'text-ok' : s === 'Scanning' ? 'text-brand' : 'text-ink3')}>{s} · <span className="tnum">{a} of {b}</span></p>
                    </li>
                  ))}
                </ul>
                {canEdit && (
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="primary" icon={I.Camera} onClick={() => setScan(true)}>Continue scanning shelf C</Button>
                    <Button variant="ghost" onClick={() => setCloseIt(true)}>Close session</Button>
                  </div>
                )}
              </div>
            </Card>
            <div className="grid @xl:grid-cols-2 gap-5 @lg:gap-6 items-start [&>*]:min-w-0">
              <Card className="overflow-hidden">
                <CardHead title="Past stock checks" icon={I.History} action={<ExportButton what="stock check results" />} />
                <DataList rows={[{ id: 's1', d: '24 Mar 2026', n: 'Annual stock check 2025–26', e: 6710, f: 6672, m: 38, x: 3 }, { id: 's2', d: '10 Oct 2025', n: 'Mid-year check', e: 6540, f: 6521, m: 19, x: 1 }, { id: 's3', d: '22 Mar 2025', n: 'Annual stock check 2024–25', e: 6305, f: 6260, m: 45, x: 2 }]} minWidth={520} footer={false}
                  columns={[
                    { key: 'n', label: 'Session', render: (s) => <><p className="font-semibold leading-tight">{s.n}</p><p className="text-[12.5px] text-ink3">Closed {s.d}</p></> },
                    { key: 'e', label: 'Expected', align: 'right', render: (s) => s.e.toLocaleString('en-IN') },
                    { key: 'f', label: 'Found', align: 'right', render: (s) => s.f.toLocaleString('en-IN') },
                    { key: 'm', label: 'Missing', align: 'right', render: (s) => <span className="text-bad font-semibold">{s.m}</span> },
                    { key: 'x', label: 'Extra', align: 'right', render: (s) => s.x },
                  ]}
                  mobile={(s) => ({ title: s.n, sub: `${s.d} · ${s.f.toLocaleString('en-IN')} of ${s.e.toLocaleString('en-IN')} found`, icon: 'ClipboardCheck', right: <span className="text-bad font-semibold text-[13px]">{s.m} missing</span> })} />
              </Card>
              <Card>
                <CardHead title="Missing after the last check" sub="Annual check, 24 Mar 2026 · 7 found later" icon={I.BookX} action={<Pill tone="bad">31</Pill>} />
                <ul className="px-2 pb-2">
                  {[['Harry Potter and the Chamber of Secrets', 10418, 'A-5'], ['The Secret Seven', 10496, 'A-7'], ['Amar Chitra Katha: Shivaji', 10322, 'D-1'], ['Tenali Raman Stories', 10333, 'D-1'], ['Science Exemplar Problems, Class 8', 10944, 'R-1']].map(([t, a, sh]) => (
                    <li key={a} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-sunken/60">
                      <span className="w-9 h-9 rounded-xl bg-bad/10 text-bad grid place-items-center shrink-0"><I.BookX size={17} /></span>
                      <div className="min-w-0 flex-1"><p className="font-semibold text-[14px] truncate">{t}</p><p className="text-[12px] text-ink3 font-mono">Acc. {a} · shelf {sh}</p></div>
                    </li>
                  ))}
                </ul>
                <div className="px-5 pb-4 flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-[12.5px] text-ink3">and 26 more</span>
                  {canEdit && <Button size="sm" variant="dangerSoft" onClick={() => setMarkLost(true)}>Mark 31 copies lost</Button>}
                </div>
              </Card>
            </div>
          </div>
        )}
      </div>

      <ConfirmSheet open={!!waive} onClose={() => setWaive(null)} title={waive ? `Waive ${inr(waive.amt)} for ${waive.m}?` : ''} sub="The fine stays in the record as waived, with your reason and name." confirmLabel={waive ? `Waive ${inr(waive.amt)}` : ''}
        onConfirm={() => { const f = waive; const b = setStatus(f, 'Waived', `Waived by Padma Iyer: ${why || 'no reason given'}`); toast({ title: `Fine waived for ${f.m}`, body: why || 'Reason recorded', undo: () => setFines(b) }); }}>
        <Field label="Reason" required id="wv-why"><Textarea id="wv-why" value={why} onChange={setWhy} rows={2} placeholder="Was ill, certificate seen" /></Field>
      </ConfirmSheet>
      <LostSheet copy={lost ? PICK_COPY : null} onClose={() => setLost(false)} onDone={() => {}} />
      <StockScanSheet open={scan} onClose={() => setScan(false)} />
      <ConfirmSheet open={closeIt} onClose={() => setCloseIt(false)} title="Close the October stock check?" sub="4,702 copies are not scanned yet. They will all show as missing in the result. You can review before marking anything lost." confirmLabel="Close with 4,702 not scanned" danger
        onConfirm={() => toast({ title: 'Stock check kept open', body: 'Closing with most shelves not scanned was cancelled for this preview.', tone: 'info' })} />
      <ConfirmSheet open={markLost} onClose={() => setMarkLost(false)} title="Mark 31 copies lost?" sub="They leave the shelf count and show as Lost. Nobody is charged, because nobody had them issued. This can be undone from each copy." confirmLabel="Mark 31 copies lost" danger
        onConfirm={() => toast({ title: '31 copies marked lost', body: 'From the annual check of 24 Mar 2026' })} />
    </div>
  );
}

function StockScanSheet({ open, onClose }) {
  const [n, setN] = useState(322);
  const [last, setLast] = useState([]);
  useEffect(() => {
    if (!open) return undefined;
    const seq = [[10601, 'A Brief History of Time'], [10600, 'A Brief History of Time'], [10702, 'Mathematics Olympiad Workbook, Class 7'], [10703, 'Mathematics Olympiad Workbook, Class 7'], [11042, 'Not in the catalogue']];
    let i = 0;
    const t = setInterval(() => { if (i >= seq.length) { clearInterval(t); return; } const s = seq[i++]; setN((x) => x + 1); setLast((x) => [s, ...x].slice(0, 4)); }, 900);
    return () => clearInterval(t);
  }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title="Scanning shelf C" sub="Science and maths · move along the shelf, one copy at a time">
      <div className="relative rounded-2xl bg-ink text-bg overflow-hidden aspect-[16/9] grid place-items-center">
        <div className="absolute inset-0 dotgrid opacity-20" />
        <div className="relative w-2/3 h-1/2 rounded-xl border-2 border-bg/70"><span className="absolute inset-x-2 top-1/2 h-0.5 bg-bad animate-pulse rounded" /></div>
        <p className="absolute top-3 right-3 text-[12px] font-semibold bg-bg/15 rounded-lg px-2 py-1 tnum">{n} of 540</p>
      </div>
      <ul className="mt-3 flex flex-col gap-1.5">
        {last.map(([a, t]) => (
          <li key={a} className={cx('flex items-center gap-2.5 text-[13.5px] rounded-xl px-3 py-2 animate-fade', t.startsWith('Not') ? 'bg-warn/10' : 'bg-sunken/70')}>
            {t.startsWith('Not') ? <I.TriangleAlert size={16} className="text-warn" /> : <I.CircleCheck size={16} className="text-ok" />}
            <span className="font-mono text-[12.5px]">{a}</span><span className="truncate">{t.startsWith('Not') ? 'Extra copy: not in the catalogue. Kept for review.' : t}</span>
          </li>
        ))}
        {!last.length && <li className="text-[13px] text-ink3 flex items-center gap-2"><Spinner size={14} />Waiting for the first barcode…</li>}
      </ul>
      <div className="flex justify-end mt-4"><Button variant="primary" onClick={onClose}>Pause and save</Button></div>
    </Sheet>
  );
}

/* ======================= Library Reports ======================= */
function ReportsPage() {
  const toast = useToast();
  const { go } = useNav();
  const canEdit = useCanEdit();
  const { pages } = usePage();
  const [per, setPer] = useState(PERIODS.thismonth);
  // Example numbers scale with the days picked (this month so far = 9 days)
  const days = periodDays(per);
  const P = { label: `${per.label} · ${fmtRange(per)}`, issued: Math.round((612 / 9) * days), fines: Math.round((620 / 9) * days) };
  const ex = (w) => () => toast({ title: `Exported ${w}`, body: `${P.label} · Excel, with the school name and your name on top. Logged.` });
  const top = [...BOOKS].sort((a, b) => b.reads - a.reads).slice(0, 6);
  return (
    <div>
      <ModuleHead sub="Books issued, overdue, most read, fines and stock" actions={<Button variant="secondary" icon={I.CalendarClock} onClick={() => toast({ title: 'Scheduled: Library summary', body: 'First Monday of each month to Lakshmi Rao and Padma Iyer' })}>Email every month</Button>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <div className="flex flex-col @md:flex-row @md:items-center gap-2">
          <DatePeriod id="lr-per" value={per} onChange={setPer} className="w-full @md:w-auto" />
          <span className="text-[13px] text-ink3">Showing: {per.label} · {fmtRange(per)}</span>
        </div>
        <Stats items={[
          { label: 'Books issued', value: P.issued.toLocaleString('en-IN'), sub: P.label, icon: I.ArrowRightLeft },
          { label: 'Overdue now', value: '23', sub: 'Same as the desk', tone: 'bad', icon: I.TriangleAlert, onClick: pages.some((x) => x.id === 'issue') ? () => go('library', { page: 'issue' }) : undefined },
          { label: 'Fines collected', value: inr(P.fines), sub: `${inr(529)} still due`, tone: 'ok', icon: I.IndianRupee },
          { label: 'Most read', value: 'Fiction', sub: '38% of all issues', icon: I.BookOpen },
        ]} />
        <Suggestion title="Wings of Fire needs more copies" source="Issues and reservations of Wings of Fire, 1 Jun to 9 Oct 2026"
          actions={canEdit ? <><Button size="sm" variant="primary" onClick={() => go('library', { page: 'books', id: 'B01' })}>Open the book</Button><Button size="sm" variant="ghost" onClick={() => toast({ title: 'Thanks. We will improve these suggestions.', tone: 'info' })}>Not useful</Button></> : null}>
          All 4 copies have been out every day since 14 Sep, and <b className="font-semibold text-ink">9 members reserved it</b> in two months. Two more copies (about {inr(590)}) would cut the wait from 3 weeks to about 1.
        </Suggestion>
        <div className="grid @xl:grid-cols-2 gap-5 @lg:gap-6 items-start [&>*]:min-w-0">
          <Card>
            <CardHead title="Books issued" sub="By month, this year" icon={I.ChartColumn} action={<Button size="sm" variant="ghost" icon={I.Download} onClick={ex('books issued')}>Export</Button>} />
            <div className="px-3 pb-2"><Bars data={[{ k: 'Jun', v: 980 }, { k: 'Jul', v: 1620 }, { k: 'Aug', v: 1972 }, { k: 'Sep', v: 1734 }, { k: 'Oct', v: 612 }]} max={2200} ticks={[0, 1000, 2000]} label={(v) => (v && v % 1000 === 0 ? `${v / 1000}k` : v.toLocaleString('en-IN'))} ariaLabel="Books issued by month" /></div>
            <p className="px-5 pb-4 text-[12.5px] text-ink3">October is open. Half-yearly exams usually slow issues down.</p>
          </Card>
          <Card>
            <CardHead title="Most read" sub="Issues this year, since 1 Jun" icon={I.TrendingUp} action={<Button size="sm" variant="ghost" icon={I.Download} onClick={ex('most read books')}>Export</Button>} />
            <ol className="px-3 pb-3">
              {top.map((b, i) => (
                <li key={b.id}><button onClick={() => go('library', { page: 'books', id: b.id })} className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-sunken/60 text-left">
                  <span className="w-6 text-[13px] font-bold text-ink3 tnum">{i + 1}</span><Cover b={b} size={34} />
                  <span className="min-w-0 flex-1"><span className="block font-semibold text-[14px] truncate">{b.title}</span><span className="block text-[12px] text-ink3 truncate">{b.author}</span></span>
                  <span className="font-semibold tnum text-[14px]">{b.reads}</span>
                </button></li>
              ))}
            </ol>
          </Card>
          <Card>
            <CardHead title="Issued by class" sub="Books per student, this year" icon={I.GraduationCap} action={<Button size="sm" variant="ghost" icon={I.Download} onClick={ex('issues by class')}>Export</Button>} />
            <div className="px-5 pb-5"><HBars rows={[{ k: 'Class 3–4', v: 6.8 }, { k: 'Class 5', v: 7.4 }, { k: 'Class 6', v: 6.1 }, { k: 'Class 7', v: 5.6 }, { k: 'Class 8', v: 4.2 }, { k: 'Class 9', v: 2.1 }, { k: 'Class 10', v: 1.4 }]} max={8} unit="" lowBelow={3} labelWidth={74} /></div>
          </Card>
          <Card>
            <CardHead title="Overdue books" sub="23 now, by days late" icon={I.CalendarClock} action={<Button size="sm" variant="ghost" icon={I.Download} onClick={ex('overdue books')}>Export</Button>} />
            <div className="px-5 pb-5"><HBars rows={[{ k: '1–7 days', v: 13, label: '13' }, { k: '8–14 days', v: 6, label: '6' }, { k: '15–30 days', v: 3, label: '3' }, { k: 'Over 30', v: 1, label: '1' }]} max={15} labelWidth={78} /></div>
          </Card>
          <Card>
            <CardHead title="Fines" sub={P.label} icon={I.IndianRupee} action={<Button size="sm" variant="ghost" icon={I.Download} onClick={ex('fines')}>Export</Button>} />
            <ul className="px-5 pb-5 divide-y divide-line/70 text-[14px]">
              {[['Collected', inr(P.fines), 'text-ok'], ['Due', inr(529), 'text-warn'], ['Waived', inr(Math.round((40 / 9) * days)), ''], ['Waiting approval', inr(549), 'text-info']].map(([k, v, c]) => <li key={k} className="flex justify-between py-2.5"><span className="text-ink2">{k}</span><b className={cx('font-semibold tnum', c)}>{v}</b></li>)}
            </ul>
          </Card>
          <Card>
            <CardHead title="Catalogue by status" sub="All 6,842 copies" icon={I.Library} action={<Button size="sm" variant="ghost" icon={I.Download} onClick={ex('catalogue by status')}>Export</Button>} />
            <ul className="px-5 pb-5 divide-y divide-line/70 text-[14px]">
              {[['Available', '5,612', 'ok'], ['Issued', '412', 'info'], ['Reading room only', '640', 'neutral'], ['Reserved, kept at the desk', '6', 'brand'], ['Lost', '96', 'bad'], ['Damaged', '28', 'warn'], ['Withdrawn', '48', 'neutral']].map(([k, v, t]) => <li key={k} className="flex items-center justify-between py-2.5 gap-3"><span className="flex items-center gap-2 text-ink2"><span className={cx('w-2 h-2 rounded-full', { ok: 'bg-ok', info: 'bg-info', neutral: 'bg-ink3/50', brand: 'bg-brand', bad: 'bg-bad', warn: 'bg-warn' }[t])} />{k}</span><b className="font-semibold tnum">{v}</b></li>)}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ======================= Library Settings ======================= */
function SettingsPage() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const [queue, setQueue] = useState('fcfs');
  const [labels, setLabels] = useState('barcode');
  return (
    <div>
      <ModuleHead sub="Borrowing limits, loan days, fines and the reservation queue" />
      <div className="grid @xl:grid-cols-2 gap-5 @lg:gap-6 items-start [&>*]:min-w-0">
        <Col>
          <SettingsCard title="Borrowing limits" sub="Books a member can have at a time" icon={I.SlidersHorizontal} rows={[
            { title: 'Nursery to Class 2', value: '1 book' }, { title: 'Classes 3 to 5', value: '2 books' }, { title: 'Classes 6 to 10', value: '3 books' }, { title: 'Staff', value: '5 books' },
          ]} />
          <SettingsCard title="Loan days" sub="The due date fills in from these" icon={I.CalendarClock} rows={[
            { title: 'Nursery to Class 2', value: '7 days' }, { title: 'Students, Class 3 and above', value: '14 days' }, { title: 'Staff', value: '30 days' },
            { title: 'Reference books', sub: 'Atlases, encyclopaedias, exemplars', value: 'Not lent' },
            { title: 'Move due dates off holidays', sub: 'To the next school day, using the school calendar', on: true },
          ]} />
          <SettingsCard title="Fines" sub="Worked out by themselves on return" icon={I.IndianRupee} rows={[
            { title: 'Fine per day late', value: inr(FINE_DAY) }, { title: 'Most fine for one book', value: inr(FINE_MAX) }, { title: 'Days of grace', sub: 'Days after the due date with no fine', value: '0 days' },
            { title: 'Block issues when fines are above', value: inr(100) },
            { title: 'Student fines go to their fees', sub: 'Parents pay everything in one place', on: true },
          ]} />
        </Col>
        <Col>
          <SettingsCard title="Lost and damaged books" icon={I.BookX} rows={[
            { title: 'Charge', sub: 'For a lost book', value: 'Price + ₹50' },
            { title: 'Needs approval above', sub: 'Approver: Lakshmi Rao (Settings, Forms & Approvals)', value: inr(500) },
          ]} />
          <Card>
            <CardHead title="Renewals and reservations" icon={I.BookmarkPlus} />
            <div className="divide-y divide-line/70 border-t border-line/70">
              <SettingRow title="Most renewals for one issue" sub="Reserved books cannot be renewed"><span className="text-[14px] font-semibold">2 times</span></SettingRow>
              <div className="px-5 py-3.5 flex flex-col gap-2">
                <p className="text-[14px] font-semibold">Reservation queue order</p>
                <Segmented value={queue} onChange={(v) => { if (!canEdit) return; setQueue(v); toast({ title: v === 'fcfs' ? 'Queue: first come, first served' : 'Queue: staff first, then students by date' }); }} className="w-full" options={[{ value: 'fcfs', label: 'First come, first served' }, { value: 'staff', label: 'Staff first' }]} />
              </div>
            </div>
          </Card>
          <Card>
            <CardHead title="Categories and shelves" sub="Used on Books and in stock checks" icon={I.Layers} action={canEdit && <Button size="sm" variant="ghost" icon={I.Plus} onClick={() => toast({ title: 'Add category', body: 'Name and shelf letters', tone: 'info' })}>Add</Button>} />
            <div className="px-5 pb-5 flex flex-wrap gap-2">
              {[['Fiction', 'A'], ['Biography', 'B'], ['General', 'B'], ['Science', 'C'], ['Children’s', 'D'], ['Comics', 'D'], ['Telugu', 'E'], ['Hindi', 'E'], ['Reference', 'R']].map(([c, s]) => <span key={c} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-sunken text-[13px] font-semibold">{c}<span className="text-ink3 font-normal">Shelf {s}</span></span>)}
            </div>
          </Card>
          <Card>
            <CardHead title="Labels and numbers" icon={I.Barcode} />
            <div className="divide-y divide-line/70 border-t border-line/70">
              <SettingRow title="Accession numbers" sub="Given in sequence. Next is 10987."><span className="font-mono text-[13px] font-semibold">5 digits</span></SettingRow>
              <div className="px-5 py-3.5 flex flex-col gap-2">
                <p className="text-[14px] font-semibold">Label type</p>
                <Segmented value={labels} onChange={(v) => { if (!canEdit) return; setLabels(v); toast({ title: `Labels print as ${v === 'qr' ? 'QR codes' : v === 'rfid' ? 'RFID tags' : 'barcodes'}` }); }} className="w-full" options={[{ value: 'barcode', label: 'Barcode' }, { value: 'qr', label: 'QR code' }, { value: 'rfid', label: 'RFID' }]} />
              </div>
            </div>
          </Card>
          <SettingsCard title="Reminders" sub="Sent through Communication" icon={I.BellRing} rows={[
            { title: 'Due tomorrow reminder', sub: 'To the parent on WhatsApp, to staff in the app', on: true },
            { title: 'Overdue reminder', sub: 'The day after the due date, then weekly', on: true },
            { title: 'Reserved book is ready', sub: 'When a returned copy is kept for them', on: true },
          ]} />
        </Col>
      </div>
    </div>
  );
}

export const LIBRARY_PAGES = {
  books: BooksPage,
  issue: IssuePage,
  members: MembersPage,
  fines: FinesPage,
  reports: ReportsPage,
  settings: SettingsPage,
};
