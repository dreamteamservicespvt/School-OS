// Demo data for the UI prototype. Everything here is example data for Sunrise Public School.

export const SCHOOL = {
  name: 'Sunrise Public School',
  short: 'SPS',
  place: 'Kukatpally, Hyderabad',
  year: '2026–27',
  today: new Date(2026, 9, 9, 10, 42),
};

export const ME = { name: 'Lakshmi Rao', first: 'Lakshmi', role: 'Principal', email: 'lakshmi.rao@sunriseps.in', phone: '98480 22145' };

export const inr = (n, opts = {}) =>
  '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0, ...opts });

export const inrShort = (n) => {
  if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2).replace(/\.?0+$/, '') + ' Cr';
  if (n >= 1e5) return '₹' + (n / 1e5).toFixed(2).replace(/\.?0+$/, '') + ' L';
  if (n >= 1e3) return '₹' + (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  return '₹' + n;
};

// Deterministic pseudo-random so the demo looks the same every time
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];

const BOYS = ['Aarav', 'Vihaan', 'Arjun', 'Reyansh', 'Sai', 'Krishna', 'Ishaan', 'Rohan', 'Aditya', 'Kabir', 'Dhruv', 'Harsha', 'Manish', 'Nikhil', 'Pranav', 'Rahul', 'Tejas', 'Varun', 'Yash', 'Karthik', 'Abhiram', 'Charan'];
const GIRLS = ['Ananya', 'Diya', 'Saanvi', 'Aadhya', 'Ira', 'Kavya', 'Meera', 'Navya', 'Pooja', 'Riya', 'Sneha', 'Tanvi', 'Vaishnavi', 'Harini', 'Lasya', 'Sahithi', 'Keerthana', 'Bhavya', 'Nithya', 'Shreya'];
const SURN = ['Sharma', 'Reddy', 'Rao', 'Naidu', 'Patel', 'Kumar', 'Iyer', 'Gupta', 'Verma', 'Chowdary', 'Varma', 'Menon', 'Das', 'Singh', 'Joshi', 'Pillai', 'Goud', 'Shetty'];
export const NAME_PARTS = { get BOYS() { return BOYS; }, get GIRLS() { return GIRLS; }, get SURN() { return SURN; }, get FATHERS() { return FATHERS; } };
const FATHERS = ['Ramesh', 'Srinivas', 'Venkat', 'Prakash', 'Mahesh', 'Suresh', 'Rajesh', 'Anil', 'Kiran', 'Ravi', 'Naresh', 'Vijay', 'Sanjay', 'Ashok'];

export const CLASSES = [
  { id: 'NUR', name: 'Nursery', sections: ['A'] },
  { id: 'LKG', name: 'LKG', sections: ['A', 'B'] },
  { id: 'UKG', name: 'UKG', sections: ['A', 'B'] },
  ...Array.from({ length: 10 }, (_, i) => ({ id: String(i + 1), name: `Class ${i + 1}`, sections: i < 8 ? ['A', 'B'] : ['A', 'B', 'C'] })),
];

const FEE_STATES = ['Paid', 'Paid', 'Paid', 'Due', 'Due', 'Overdue'];

function makeStudent(i, cls, sec, roll) {
  const girl = rnd() > 0.5;
  const first = pick(girl ? GIRLS : BOYS);
  const last = pick(SURN);
  const feeState = pick(FEE_STATES);
  const due = feeState === 'Paid' ? 0 : Math.round((4000 + rnd() * 30000) / 100) * 100;
  const att = Math.round(78 + rnd() * 22);
  const yr = 2019 + Math.floor(rnd() * 8);
  return {
    id: 'S' + (1000 + i),
    name: `${first} ${last}`,
    first, last, girl,
    cls: cls.name, clsId: cls.id, sec, roll,
    adm: `SPS/${yr}/${String(100 + Math.floor(rnd() * 800)).padStart(4, '0')}`,
    father: `${pick(FATHERS)} ${last}`,
    phone: `9${Math.floor(rnd() * 9)}${String(Math.floor(rnd() * 1e8)).padStart(8, '0')}`.replace(/(\d{5})(\d{5})/, '$1 $2'),
    att, feeState, due,
    status: rnd() > 0.95 ? 'Inactive' : rnd() > 0.9 ? 'New' : 'Active',
  };
}

const list = [];
let n = 0;
CLASSES.forEach((cls) => cls.sections.forEach((sec) => {
  const count = cls.id === '7' && sec === 'B' ? 0 : 3 + Math.floor(rnd() * 3);
  for (let r = 1; r <= count; r++) list.push(makeStudent(n++, cls, sec, r));
}));

// Class 7 B in full, used by Take Attendance and the featured student
const C7 = CLASSES.find((c) => c.id === '7');
const c7b = [];
for (let r = 1; r <= 38; r++) c7b.push(makeStudent(n++, C7, 'B', r));
c7b[11] = {
  ...c7b[11], id: 'S0712', name: 'Aarav Sharma', first: 'Aarav', last: 'Sharma', girl: false,
  adm: 'SPS/2021/0417', father: 'Rajesh Sharma', phone: '98490 31277', att: 94, feeState: 'Overdue', due: 30650, status: 'Active',
};
export const CLASS_7B = c7b.sort((a, b) => a.name.localeCompare(b.name)).map((s, i) => ({ ...s, roll: i + 1 }));
export const STUDENTS = [...list, ...CLASS_7B];
export const FEATURED = CLASS_7B.find((s) => s.name === 'Aarav Sharma');

export const STUDENT_PROFILE = {
  dob: '14 March 2014', age: 12, gender: 'Boy', blood: 'B+', house: 'Godavari House',
  admitted: '2 June 2021', bus: 'Route 4 · Miyapur, stop KPHB 6th Phase', mother: 'Priya Sharma', motherPhone: '98495 60211',
  fatherJob: 'Software engineer', address: 'Flat 302, Lakeview Residency, KPHB Colony, Kukatpally, Hyderabad 500072',
  emergency: [{ name: 'Priya Sharma', rel: 'Mother', phone: '98495 60211' }, { name: 'Rajesh Sharma', rel: 'Father', phone: '98490 31277' }, { name: 'Kamala Sharma', rel: 'Grandmother', phone: '90002 11843' }],
  docs: [
    { name: 'Birth certificate', kind: 'PDF', size: '412 KB', ok: true, date: '2 Jun 2021' },
    { name: 'Aadhaar card (student)', kind: 'PDF', size: '220 KB', ok: true, date: '2 Jun 2021' },
    { name: 'Transfer certificate (previous school)', kind: 'PDF', size: '318 KB', ok: true, date: '2 Jun 2021' },
    { name: 'Passport photo', kind: 'JPG', size: '96 KB', ok: true, date: '1 Jun 2026' },
    { name: 'Medical fitness certificate', kind: 'PDF', size: '180 KB', ok: true, date: '4 Jun 2026' },
    { name: 'Caste certificate', kind: '', size: '', ok: false, date: '' },
  ],
  exams: [
    { sub: 'English', ut1: 22, ut2: 24, max: 25 },
    { sub: 'Telugu', ut1: 19, ut2: 21, max: 25 },
    { sub: 'Hindi', ut1: 20, ut2: 18, max: 25 },
    { sub: 'Mathematics', ut1: 24, ut2: 25, max: 25 },
    { sub: 'Science', ut1: 21, ut2: 23, max: 25 },
    { sub: 'Social Studies', ut1: 17, ut2: 20, max: 25 },
  ],
  timeline: [
    { when: 'Today, 8:52 AM', what: 'Marked present by Ravi Teja (Class teacher)', kind: 'att' },
    { when: '6 Oct 2026', what: 'Fee reminder sent to Priya Sharma on WhatsApp. Seen by parent.', kind: 'msg' },
    { when: '28 Sep 2026', what: 'Unit Test 2 marks published: 131 of 150 (87%)', kind: 'exam' },
    { when: '15 Sep 2026', what: 'Merit certificate: Science Exhibition, 2nd prize', kind: 'award' },
    { when: '12 Jul 2026', what: 'Paid ₹10,000 for Tuition fee Q2 by UPI. Receipt R/26/04412', kind: 'fee' },
    { when: '1 Jun 2026', what: 'Promoted from Class 6 B to Class 7 B', kind: 'promo' },
  ],
};

// Fee rows for the featured student (oldest first)
export const FEE_ROWS = [
  { id: 'f1', head: 'Tuition fee', inst: 'Q1 · Apr–Jun', due: '10 Apr', amount: 18500, paid: 18500, late: 0, status: 'Paid' },
  { id: 'f2', head: 'Transport fee', inst: 'Apr–Sep', due: '5 Apr', amount: 13200, paid: 13200, late: 0, status: 'Paid' },
  { id: 'f3', head: 'Tuition fee', inst: 'Q2 · Jul–Sep', due: '10 Jul', amount: 18500, paid: 10000, late: 250, status: 'Overdue' },
  { id: 'f4', head: 'Transport fee', inst: 'Oct', due: '5 Oct', amount: 2200, paid: 0, late: 0, status: 'Overdue' },
  { id: 'f5', head: 'Tuition fee', inst: 'Q3 · Oct–Dec', due: '10 Oct', amount: 18500, paid: 0, late: 0, status: 'Due' },
  { id: 'f6', head: 'Exam fee', inst: 'Half-yearly', due: '15 Oct', amount: 1200, paid: 0, late: 0, status: 'Due' },
  { id: 'f7', head: 'Transport fee', inst: 'Nov', due: '5 Nov', amount: 2200, paid: 0, late: 0, status: 'Not due' },
  { id: 'f8', head: 'Tuition fee', inst: 'Q4 · Jan–Mar', due: '10 Jan', amount: 18500, paid: 0, late: 0, status: 'Not due' },
];

export const RECENT_PAYMENTS = [
  { t: '10:38 AM', name: 'Saanvi Reddy', cls: '4 A', amt: 12500, mode: 'UPI', rcpt: 'R/26/05190' },
  { t: '10:21 AM', name: 'Kabir Naidu', cls: '9 C', amt: 21000, mode: 'Cash', rcpt: 'R/26/05189' },
  { t: '10:02 AM', name: 'Diya Menon', cls: 'UKG B', amt: 8400, mode: 'Online', rcpt: 'R/26/05188' },
  { t: '9:47 AM', name: 'Rohan Gupta', cls: '6 A', amt: 15000, mode: 'Cheque', rcpt: 'R/26/05187', pending: true },
  { t: '9:30 AM', name: 'Meera Iyer', cls: '2 B', amt: 9800, mode: 'UPI', rcpt: 'R/26/05186' },
];

export const NEEDS_ATTENTION = [
  { id: 'n1', tone: 'bad', title: '4 students absent 3 days in a row', detail: 'Class 9 C (2), Class 6 A, LKG B', action: 'See students', to: 'attendance' },
  { id: 'n2', tone: 'warn', title: '₹8.4 L overdue from 61 students', detail: '18 of them are more than 30 days late', action: 'Send reminders', to: 'fees' },
  { id: 'n3', tone: 'info', title: '3 leave requests waiting for you', detail: 'Ravi Teja (Mon), Anitha K. (Tue–Wed), Imran S. (Fri)', action: 'Review', to: 'approvals' },
  { id: 'n4', tone: 'warn', title: 'Class 9 B attendance fell to 79% this week', detail: 'Usually 92%. Lowest on Wednesday.', action: 'Open class', to: 'attendance' },
];

export const TODAY_EVENTS = [
  { time: '11:30', title: 'PTM: Classes 1–3', where: 'Assembly hall', tone: 'brand' },
  { time: '1:15', title: 'Fire drill', where: 'Whole school', tone: 'warn' },
  { time: '3:00', title: 'Staff meeting', where: 'Principal\'s room', tone: 'info' },
  { time: 'Mon', title: 'Half-yearly exams start', where: 'Classes 6–10', tone: 'bad' },
];

export const APPROVALS = [
  { who: 'Ravi Teja', what: 'Casual leave · Mon 12 Oct', kind: 'Leave' },
  { who: 'Suresh B. (Accounts)', what: 'Concession ₹4,000 · Kavya Rao, 5 A', kind: 'Concession' },
  { who: 'Anitha K.', what: 'Sick leave · 13–14 Oct', kind: 'Leave' },
  { who: 'Office', what: 'Expense ₹18,600 · Lab chemicals', kind: 'Expense' },
];

export const NOTIFICATIONS = [
  { id: 1, when: '10:38 AM', title: '₹12,500 received from Saanvi Reddy (4 A)', body: 'UPI · Receipt R/26/05190', unread: true, to: 'fees' },
  { id: 2, when: '9:15 AM', title: 'Attendance done for 41 of 43 classes', body: 'Waiting on Class 8 A and Class 10 C', unread: true, to: 'attendance' },
  { id: 3, when: '8:40 AM', title: 'Anitha K. asked for sick leave', body: '13–14 Oct · 2 days', unread: true, to: 'approvals' },
  { id: 4, when: 'Yesterday', title: 'Unit Test 2 results published for Class 7', body: '186 report cards sent through Parent Link', unread: false, to: 'student' },
  { id: 5, when: 'Yesterday', title: 'Bus KA-36 back in service', body: 'Route 4 · Miyapur', unread: false, to: 'transport.live' },
];

// Attendance this week by class group, for the dashboard chart
export const ATT_BY_CLASS = [
  { k: 'Nur–UKG', v: 93 }, { k: '1–2', v: 97 }, { k: '3–4', v: 96 }, { k: '5–6', v: 95 },
  { k: '7–8', v: 94 }, { k: '9', v: 86 }, { k: '10', v: 97 },
];

// Fee collected per month (lakhs) against due
export const FEE_TREND = [
  { m: 'Apr', c: 62, d: 66 }, { m: 'May', c: 18, d: 20 }, { m: 'Jun', c: 24, d: 26 }, { m: 'Jul', c: 58, d: 64 },
  { m: 'Aug', c: 21, d: 24 }, { m: 'Sep', c: 19, d: 23 }, { m: 'Oct', c: 31, d: 61 },
];

// October attendance calendar for the featured student: P present, A absent, L late, H holiday, W weekend
export const OCT_ATT = (() => {
  const days = [];
  for (let d = 1; d <= 31; d++) {
    const dow = new Date(2026, 9, d).getDay();
    let s = 'F'; // future
    if (d <= 9) s = dow === 0 ? 'W' : d === 2 ? 'H' : d === 6 ? 'L' : 'P';
    if (dow === 0 && d > 9) s = 'W';
    days.push({ d, dow, s });
  }
  return days;
})();

export const SEP_SUMMARY = { present: 22, absent: 1, late: 1, leave: 0, pct: 94 };

export const PARENT = {
  name: 'Priya Sharma',
  children: [
    { id: 'c1', name: 'Aarav Sharma', cls: 'Class 7 B', roll: FEATURED.roll, teacher: 'Ravi Teja', att: 94, due: 30650, nextDue: '10 Oct', present: 7, days: 7 },
    { id: 'c2', name: 'Anaya Sharma', cls: 'UKG A', roll: 9, teacher: 'Sunitha M.', att: 98, due: 0, nextDue: '10 Jan', present: 7, days: 7 },
  ],
  notices: [
    { id: 1, critical: true, title: 'Half-yearly exams start Monday, 12 October', body: 'Reporting time 8:15 AM. Bring hall ticket and two pencils. Datesheet below.', when: 'Today' },
    { id: 2, title: 'Parent–teacher meeting on Saturday', body: '17 October, 9:30 AM to 12:30 PM. Please meet the class teacher.', when: 'Yesterday' },
    { id: 3, title: 'Dussehra holidays', body: 'School stays closed from 19 to 25 October. Reopens Monday, 26 October.', when: '3 Oct' },
  ],
  datesheet: [
    { day: 'Mon 12 Oct', sub: 'English' }, { day: 'Wed 14 Oct', sub: 'Mathematics' }, { day: 'Thu 15 Oct', sub: 'Science' },
    { day: 'Fri 16 Oct', sub: 'Telugu' }, { day: 'Mon 26 Oct', sub: 'Social Studies' }, { day: 'Tue 27 Oct', sub: 'Hindi' },
  ],
};

// Module list, using familiar school ERP names. Grouped for a calmer sidebar.
export const NAV = [
  { group: null, items: [{ id: 'dashboard', label: 'Dashboard', icon: 'LayoutGrid' }] },
  { group: 'Daily work', items: [
    { id: 'attendance', label: 'Attendance', full: 'Attendance Management', icon: 'CalendarCheck2' },
    { id: 'fees', label: 'Fee Management', icon: 'IndianRupee', badge: 'Collect' },
    { id: 'students', label: 'Student Management', icon: 'GraduationCap' },
    { id: 'admissions', label: 'Admission Management', icon: 'UserPlus', count: 12 },
    { id: 'communication', label: 'Communication', icon: 'MessagesSquare' },
  ] },
  { group: 'Academics', items: [
    { id: 'academic', label: 'Academic Management', icon: 'BookOpen' },
    { id: 'exams', label: 'Examination & Results', icon: 'ClipboardCheck' },
    { id: 'homework', label: 'Homework & Learning', icon: 'NotebookPen' },
    { id: 'events', label: 'Events & Calendar', icon: 'CalendarDays' },
  ] },
  { group: 'Staff & money', items: [
    { id: 'staff', label: 'Staff & HR Management', icon: 'Users' },
    { id: 'salary', label: 'Salary Management', icon: 'Wallet' },
    { id: 'finance', label: 'Finance Management', icon: 'Landmark' },
  ] },
  { group: 'Campus', items: [
    { id: 'frontoffice', label: 'Front Office', icon: 'DoorOpen' },
    { id: 'transport', label: 'Transport Management', icon: 'Bus' },
    { id: 'library', label: 'Library Management', icon: 'Library' },
    { id: 'inventory', label: 'Inventory Management', icon: 'Boxes' },
    { id: 'hostel', label: 'Hostel Management', icon: 'BedDouble' },
  ] },
  { group: 'Insights', items: [
    { id: 'reports', label: 'Reports & Analytics', icon: 'ChartColumn' },
    { id: 'settings', label: 'Settings', icon: 'Settings' },
  ] },
];
