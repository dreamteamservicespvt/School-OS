// DREAM TEAM SERVICES' own Super Admin console (blueprint 07-super-admin.md).
// A separate sign-in and its own shell, drawn with the same components and classes as the school app.
// Sample data only. Only counts and setup progress come back from a school: never a student's name, a fee amount or a salary.
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as I from './icons.js';
import { inr } from './data.js';
import { cx, Button, IconButton, Pill, Avatar, Card, CardHead, Field, Input, Checkbox, Segmented, Empty, Sheet, Switch, useToast, Kbd, PageHead } from './ui.jsx';
import { useNav, useRole, useTheme, Logo, NotifPanel } from './shell.jsx';
import { Icon, Stats, Band, SearchBox, Toolbar, Select, Textarea, Chips, BulkBar, Banner, Progress, DL, Timeline, Row, MoreMenu, ConfirmSheet, FormSheet, Split, Col, TONE_SOFT, TONE_TEXT } from './kit.jsx';

/* ======================= Helpers ======================= */
const HELPLINE = '040 4852 7700';
const digits = (p) => String(p || '').replace(/\D/g, '');
const mask = (p) => { const d = digits(p); return `${d.slice(0, 2)}xxx xx${d.slice(-3)}`; };
const num = (n) => Number(n).toLocaleString('en-IN');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayKey = (d) => { const [dd, m, y] = d.split(' '); return +y * 10000 + (MONTHS.indexOf(m) + 1) * 100 + +dd; };
let minute = 52;
// The console's clock for new Activity Log lines (today, from 11:52 AM)
const nowTime = () => { const m = minute++; const h = 11 + Math.floor(m / 60); const mm = m % 60; return `${h > 12 ? h - 12 : h}:${String(mm).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
const time12 = (t) => { const [h, m] = (t || '09:00').split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };

/* Prices (pricing decided 9 Oct 2026). All prices exclude 18% GST. */
const PRICE = { Essential: 120, Complete: 200 };
const HOSTEL = 10000;
const BUS = 1500;
const PACKS = { 5000: 1000, 10000: 2000, 20000: 4000 };
const yearly = (plan, n) => { const p = PRICE[plan]; const m = Math.max(n, 100); return Math.min(m, 1000) * p + Math.max(0, m - 1000) * (p / 2); };
const gstOf = (n) => Math.round(n * 0.18);
const subBase = (s, plan = s.sub.plan, addons = s.sub.addons) => {
  const b = yearly(s.founding ? 'Essential' : plan, s.sub.paid) + (addons.includes('Hostel') ? HOSTEL : 0);
  return s.sub.group ? Math.round(b * (1 - s.sub.group / 100)) : b;
};
const monthsLeft = (renewal) => { const [, m, y] = renewal.split(' '); return Math.max(1, (+y * 12 + MONTHS.indexOf(m) + 1) - (2026 * 12 + 10)); };
const plusYears = (d, n) => { const p = d.split(' '); return `${p[0]} ${p[1]} ${+p[2] + n}`; };

/* ======================= Console roles (spec section 2) ======================= */
const SA_ROLES = {
  owner: { id: 'owner', label: 'Owner', icon: I.Crown, person: { name: 'Kiran Reddy', first: 'Kiran', phone: '98490 11223', email: 'kiran@dreamteamservices.in' },
    does: 'Everything, including the Team page, closing a school, discounts and marking a bank transfer or cheque as paid.' },
  onboarding: { id: 'onboarding', label: 'Onboarding', icon: I.UserPlus, person: { name: 'Ravi Kumar', first: 'Ravi', phone: '98480 44556', email: 'ravi@dreamteamservices.in' },
    does: 'Adds schools, creates and resends School Admin invites, sees setup progress, starts trials. Cannot close a school.' },
  support: { id: 'support', label: 'Support', icon: I.LifeBuoy, person: { name: 'Neha Gupta', first: 'Neha', phone: '99890 77881', email: 'neha@dreamteamservices.in' },
    does: 'Sees schools and their admins, resends invites, resets an admin’s login, asks a school for support access. Cannot add or close schools.' },
};
const CAN = {
  owner: ['add', 'invite', 'reset', 'disable', 'edit', 'activate', 'status', 'restore', 'support', 'plan', 'invoice', 'markPaid', 'approve', 'discount', 'team', 'group', 'topup', 'prices'],
  onboarding: ['add', 'invite', 'edit', 'activate', 'plan', 'invoice', 'group', 'topup'],
  support: ['invite', 'reset', 'disable', 'support'],
};
let START_ROLE = 'owner';

/* ======================= Schools (counts only) ======================= */
const STEPS = ['School profile and logo', 'Academic year, terms and school timings', 'Classes and sections', 'Subjects', 'Staff and logins', 'Students and parents', 'Fee structure', 'Messaging channel connected', 'Holiday list', 'Payment gateway'];
const CORE = ['Dashboard', 'Admissions', 'Students', 'Academics', 'Attendance', 'Fees', 'Finance', 'Exams & Results', 'Staff & HR', 'Salary', 'Communication', 'Front Office', 'Homework', 'Events & Calendar', 'Reports', 'Settings'];
const OPTIONAL = [['Library', 'Library Management', 'Library'], ['Inventory', 'Inventory Management', 'Boxes'], ['Hostel', 'Hostel Management', 'BedDouble']];
const MOD_DEFAULTS = { 'Day school': { Library: false, Inventory: false, Hostel: false }, 'Boarding school': { Library: false, Inventory: false, Hostel: true }, 'Pre-school': { Library: false, Inventory: false, Hostel: false } };
const BOARDS = ['CBSE', 'ICSE', 'State board', 'IB', 'Cambridge', 'Other'];
const TYPES = [['Day school', 'Sun', 'Hostel, Library and Inventory start off'], ['Boarding school', 'BedDouble', 'Hostel starts switched on'], ['Pre-school', 'Baby', 'Only the core modules']];
const STATES = ['Andhra Pradesh', 'Telangana', 'Karnataka', 'Tamil Nadu', 'Kerala', 'Maharashtra', 'Gujarat', 'Rajasthan', 'Madhya Pradesh', 'Uttar Pradesh', 'Delhi', 'Haryana', 'Punjab', 'West Bengal', 'Odisha', 'Bihar', 'Goa'];
const CITY_CODE = { Hyderabad: 'HYD', Secunderabad: 'SEC', Jaipur: 'JAI', Pune: 'PUN', Vijayawada: 'VJA', Nagpur: 'NAG', Bengaluru: 'BLR', Mysuru: 'MYS', Warangal: 'WGL', Visakhapatnam: 'VSK', Kurnool: 'KNL', Chennai: 'CHE', Karimnagar: 'KRM', Rajahmundry: 'RJY', Mangaluru: 'MNG', Nashik: 'NSK', Kakinada: 'KKD' };

const AD = (name, phone, status, note, more = {}) => ({ id: name.replace(/\W/g, '').toLowerCase(), name, phone, status, note, role: 'School Admin', email: '', ...more });
const SC = (o) => ({ campuses: 1, group: null, founding: false, area: '', notes: [], students: 0, staffLogins: 0, msgs: 0, lastAny: 'Nobody yet', modules: 16, optional: 'Only the core modules', email: '', sub: null, history: null, ...o });

const SCHOOLS = [
  SC({ id: 'SPS-HYD-001', name: 'Sunrise Public School', area: 'Kukatpally', city: 'Hyderabad', state: 'Telangana', board: 'CBSE', type: 'Day school', status: 'Active',
    phone: '98480 22100', email: 'office@sunriseps.in', address: 'Plot 14, KPHB Colony, Kukatpally, Hyderabad 500072', group: 'Sunrise Group', founding: true,
    admins: [AD('Anita Sharma', '98480 31123', 'Active', 'Last signed in today, 10:31 AM · first signed in 3 Jun 2026', { email: 'anita.sharma@sunriseps.in' }),
      AD('Naveen Kumar', '98490 66318', 'Invited', 'Invite sent today, 11:42 AM by Ravi Kumar · link works until 12 Oct', { email: 'naveen.kumar@sunriseps.in' })],
    firstSignIn: '3 Jun 2026', setup: 10, students: 1236, staffLogins: 74, lastAny: 'Today, 11:41 AM', msgs: 18420, modules: 20, optional: 'Library, Inventory, Hostel and Transport on',
    added: '2 Jun 2026', addedBy: 'Ravi Kumar', act: '4 Jun 2026',
    sub: { plan: 'Essential', addons: ['Hostel'], paid: 1240, renewal: '1 Jun 2027', halves: false, status: 'Paid', credits: 8420 },
    notes: [{ text: 'Principal prefers calls after 4 PM.', by: 'Ravi Kumar', when: '3 Jun 2026' }, { text: 'Wants Telugu WhatsApp templates for Class 1 to 5 parents. Sent them the steps.', by: 'Neha Gupta', when: '18 Sep 2026' }] }),
  SC({ id: 'SPS-HYD-002', name: 'Sunrise Public School, Miyapur campus', area: 'Miyapur', city: 'Hyderabad', state: 'Telangana', board: 'CBSE', type: 'Day school', status: 'Active',
    phone: '98480 22155', email: 'miyapur@sunriseps.in', address: 'Survey 112, Allwyn Colony Road, Miyapur, Hyderabad 500049', group: 'Sunrise Group', founding: true,
    admins: [AD('Rekha Menon', '98853 40219', 'Active', 'Last signed in today, 9:12 AM · first signed in 4 Jun 2026'), AD('Anita Sharma', '98480 31123', 'Active', 'Last signed in yesterday, 5:40 PM · same login as at Kukatpally (Sunrise Group)')],
    firstSignIn: '4 Jun 2026', setup: 9, students: 684, staffLogins: 41, lastAny: 'Today, 11:05 AM', msgs: 9860, modules: 18, optional: 'Library and Transport on',
    added: '2 Jun 2026', addedBy: 'Ravi Kumar', act: '4 Jun 2026', sub: { plan: 'Essential', addons: [], paid: 690, renewal: '1 Jun 2027', halves: false, status: 'Paid', credits: 4120 } }),
  SC({ id: 'SMC-VJA-001', name: 'St. Mary’s Convent', area: 'Gunadala', city: 'Vijayawada', state: 'Andhra Pradesh', board: 'ICSE', type: 'Day school', status: 'Active',
    phone: '94401 55870', email: 'stmarys.vja@gmail.com', address: 'Gunadala Main Road, Vijayawada 520004', founding: true, startedActive: true,
    admins: [AD('Sr. Grace Fernandes', '94401 23876', 'Active', 'Last signed in Fri 2 Oct, 4:12 PM · first signed in 23 Sep 2026')],
    firstSignIn: '23 Sep 2026', setup: 3, stuck: 7, students: 0, approx: 750, staffLogins: 2, lastAny: 'Fri 2 Oct, 4:12 PM', msgs: 0, modules: 17, optional: 'Library on',
    added: '22 Sep 2026', addedBy: 'Ravi Kumar', act: '22 Sep 2026', sub: { plan: 'Essential', addons: [], paid: 750, renewal: '22 Sep 2027', halves: false, status: 'Paid', credits: 2000 },
    notes: [{ text: 'Called twice, no answer. Try after 4 PM.', by: 'Ravi Kumar', when: 'Today, 10:21 AM' }, { text: 'Sister Grace asked for help with the subject list for ICSE Class 9 and 10.', by: 'Ravi Kumar', when: '2 Oct 2026' }] }),
  SC({ id: 'LSP-PUN-001', name: 'Little Stars Pre-school, Kothrud', area: 'Kothrud', city: 'Pune', state: 'Maharashtra', board: 'Other', type: 'Pre-school', status: 'Active',
    phone: '98220 41572', email: 'kothrud@littlestars.in', address: 'Lane 5, Karve Road, Kothrud, Pune 411038', group: 'Little Stars Group', founding: true,
    admins: [AD('Pooja Kulkarni', '98220 18572', 'Active', 'Reset link sent today, 11:46 AM by Neha Gupta · last signed in Fri 2 Oct')],
    firstSignIn: '1 Oct 2025', setup: 9, students: 142, staffLogins: 14, lastAny: 'Today, 9:30 AM', msgs: 1210, added: '30 Sep 2025', addedBy: 'Kiran Reddy', act: '1 Oct 2025',
    sub: { plan: 'Essential', addons: [], paid: 142, group: 10, renewal: '30 Sep 2026', halves: false, status: 'In grace', grace: 6, credits: 340 },
    history: [{ icon: 'Hourglass', tone: 'warn', what: <>Renewal unpaid: <b>15 days of grace</b> started. Banner shown to the School Admin and Principal (automatic).</>, when: '30 Sep 2026' },
      { icon: 'CirclePlay', tone: 'ok', what: <>Trial → <b>Active</b>. First invoice paid by Razorpay (automatic).</>, when: '1 Oct 2025' },
      { icon: 'Plus', tone: 'brand', what: <>Added as <b>Trial</b> by Kiran Reddy</>, when: '30 Sep 2025' }] }),
  SC({ id: 'LSP-PUN-002', name: 'Little Stars Pre-school, Baner', area: 'Baner', city: 'Pune', state: 'Maharashtra', board: 'Other', type: 'Pre-school', status: 'Active',
    phone: '98220 41590', email: 'baner@littlestars.in', group: 'Little Stars Group', founding: true,
    admins: [AD('Sneha Joshi', '97640 22318', 'Active', 'Last signed in today, 8:55 AM')], firstSignIn: '13 Jan 2026', setup: 10, students: 118, staffLogins: 11, lastAny: 'Today, 10:02 AM', msgs: 960,
    added: '12 Jan 2026', addedBy: 'Arjun Mehta', act: '14 Jan 2026', sub: { plan: 'Essential', addons: [], paid: 120, group: 10, renewal: '12 Jan 2027', halves: true, status: 'Paid', credits: 1180 } }),
  SC({ id: 'SXH-NAG-001', name: 'St. Xavier’s High School', area: 'Sadar', city: 'Nagpur', state: 'Maharashtra', board: 'State board', type: 'Day school', status: 'Active',
    phone: '98230 64410', email: 'office@stxaviersngp.in', founding: true,
    admins: [AD('Fr. Joseph D’Souza', '98230 11904', 'Active', 'Last signed in today, 8:20 AM')], firstSignIn: '2 Apr 2026', setup: 10, students: 468, staffLogins: 38, lastAny: 'Today, 11:22 AM', msgs: 6240, modules: 17, optional: 'Library on',
    added: '1 Apr 2026', addedBy: 'Kiran Reddy', act: '3 Apr 2026', sub: { plan: 'Essential', addons: [], paid: 400, renewal: '1 Apr 2027', halves: false, status: 'Paid', credits: 2760 } }),
  SC({ id: 'HIS-BLR-001', name: 'Harmony International School', area: 'Whitefield', city: 'Bengaluru', state: 'Karnataka', board: 'Cambridge', type: 'Day school', status: 'Active',
    phone: '99000 73120', email: 'admin@harmonyintl.edu.in', founding: true,
    admins: [AD('Shruti Rao', '99000 41187', 'Active', 'Last signed in today, 10:47 AM')], firstSignIn: '16 May 2026', setup: 9, students: 820, staffLogins: 63, lastAny: 'Today, 11:30 AM', msgs: 12780, modules: 18, optional: 'Library and Inventory on',
    added: '15 May 2026', addedBy: 'Arjun Mehta', act: '18 May 2026', sub: { plan: 'Essential', addons: [], paid: 740, renewal: '15 May 2027', halves: true, status: 'Due', credits: 5310 } }),
  SC({ id: 'GRS-MYS-001', name: 'Gurukul Residential School', area: 'Hunsur Road', city: 'Mysuru', state: 'Karnataka', board: 'CBSE', type: 'Boarding school', status: 'Active',
    phone: '94480 30561', email: 'office@gurukulmysuru.in',
    admins: [AD('Prakash Hegde', '94480 77215', 'Active', 'Last signed in today, 7:58 AM'), AD('Kavya Shetty', '94480 77290', 'Active', 'Last signed in Tue 6 Oct')],
    firstSignIn: '21 Apr 2026', setup: 10, students: 610, staffLogins: 58, lastAny: 'Today, 11:12 AM', msgs: 8420, modules: 19, optional: 'Library, Inventory and Hostel on',
    added: '20 Apr 2026', addedBy: 'Kiran Reddy', act: '22 Apr 2026', sub: { plan: 'Complete', addons: ['Hostel'], paid: 600, renewal: '20 Apr 2027', halves: false, status: 'Paid', credits: 9050 } }),
  SC({ id: 'SSV-KRM-001', name: 'Sri Sai Vidyalaya', area: 'Mukarampura', city: 'Karimnagar', state: 'Telangana', board: 'State board', type: 'Day school', status: 'Active',
    phone: '98495 20101', founding: true, admins: [AD('Laxmi Prasanna', '98495 20610', 'Active', 'Reset her login on 8 Oct after a phone change · last signed in today, 9:02 AM')],
    firstSignIn: '9 Jun 2026', setup: 10, students: 540, staffLogins: 36, lastAny: 'Today, 10:40 AM', msgs: 5120, added: '8 Jun 2026', addedBy: 'Ravi Kumar', act: '10 Jun 2026',
    sub: { plan: 'Essential', addons: [], paid: 540, renewal: '8 Jun 2027', halves: false, status: 'Paid', credits: 3880 } }),
  SC({ id: 'GPS-RJY-001', name: 'Godavari Public School', area: 'Danavaipeta', city: 'Rajahmundry', state: 'Andhra Pradesh', board: 'CBSE', type: 'Day school', status: 'Active',
    phone: '98481 77010', founding: true, admins: [AD('Suresh Varma', '98481 77032', 'Active', 'Last signed in today, 9:48 AM')],
    firstSignIn: '11 Jun 2026', setup: 10, students: 716, staffLogins: 47, lastAny: 'Today, 11:18 AM', msgs: 7340, modules: 17, optional: 'Library on', added: '10 Jun 2026', addedBy: 'Arjun Mehta', act: '12 Jun 2026',
    sub: { plan: 'Essential', addons: [], paid: 720, renewal: '10 Jun 2027', halves: true, status: 'Paid', credits: 4400 } }),
  SC({ id: 'MCS-MNG-001', name: 'Mount Carmel School', area: 'Kankanady', city: 'Mangaluru', state: 'Karnataka', board: 'ICSE', type: 'Day school', status: 'Active',
    phone: '94481 60300', founding: true, admins: [AD('Sr. Lilly D’Costa', '94481 60325', 'Active', 'Last signed in yesterday, 3:15 PM')],
    firstSignIn: '2 Jul 2026', setup: 9, students: 460, staffLogins: 33, lastAny: 'Today, 10:55 AM', msgs: 3980, added: '1 Jul 2026', addedBy: 'Ravi Kumar', act: '3 Jul 2026',
    sub: { plan: 'Essential', addons: [], paid: 460, renewal: '1 Jul 2027', halves: false, status: 'Paid', credits: 2990 } }),
  SC({ id: 'RHS-NSK-001', name: 'Riverdale High School', area: 'Gangapur Road', city: 'Nashik', state: 'Maharashtra', board: 'CBSE', type: 'Day school', status: 'Active',
    phone: '98600 41200', founding: true, admins: [AD('Amit Deshpande', '98600 41275', 'Active', 'Last signed in today, 8:41 AM')],
    firstSignIn: '15 Jul 2026', setup: [0, 1, 2, 3, 4, 5, 6, 7], students: 390, staffLogins: 29, lastAny: 'Today, 11:01 AM', msgs: 3310, added: '14 Jul 2026', addedBy: 'Arjun Mehta', act: '16 Jul 2026',
    sub: { plan: 'Essential', addons: [], paid: 390, renewal: '14 Jul 2027', halves: false, status: 'Paid', credits: 2240 } }),
  SC({ id: 'NPS-KKD-001', name: 'Nalanda Public School', area: 'Sarpavaram', city: 'Kakinada', state: 'Andhra Pradesh', board: 'State board', type: 'Day school', status: 'Active',
    phone: '98490 81400', founding: true, admins: [AD('Bhavani Prasad', '98490 81462', 'Active', 'Last signed in today, 9:26 AM')],
    firstSignIn: '4 Aug 2026', setup: 10, students: 655, staffLogins: 44, lastAny: 'Today, 11:09 AM', msgs: 6610, added: '3 Aug 2026', addedBy: 'Ravi Kumar', act: '5 Aug 2026',
    sub: { plan: 'Essential', addons: [], paid: 650, renewal: '3 Aug 2027', halves: false, status: 'Paid', credits: 21300 } }),
  SC({ id: 'TTP-SEC-001', name: 'Tiny Tots Pre-school', area: 'Marredpally', city: 'Secunderabad', state: 'Telangana', board: 'Other', type: 'Pre-school', status: 'Active',
    phone: '98665 30900', founding: true, admins: [AD('Nazia Begum', '98665 30918', 'Active', 'Last signed in today, 9:50 AM')],
    firstSignIn: '19 Aug 2026', setup: 10, students: 96, staffLogins: 9, lastAny: 'Today, 10:12 AM', msgs: 640, added: '18 Aug 2026', addedBy: 'Arjun Mehta', act: '19 Aug 2026',
    sub: { plan: 'Essential', addons: [], paid: 100, renewal: '18 Aug 2027', halves: false, status: 'Paid', credits: 1460 } }),
  SC({ id: 'GVS-JAI-001', name: 'Green Valley School', area: 'Mansarovar', city: 'Jaipur', state: 'Rajasthan', board: 'State board', type: 'Day school', status: 'Trial',
    phone: '98290 45500', email: 'office@greenvalleyjaipur.in', address: 'Sector 7, Mansarovar, Jaipur 302020',
    admins: [AD('Manoj Agarwal', '98290 45518', 'Active', 'Last signed in today, 10:05 AM · first signed in 14 Sep 2026')],
    firstSignIn: '14 Sep 2026', setup: 6, students: 512, staffLogins: 22, lastAny: 'Today, 10:20 AM', msgs: 2140, added: '13 Sep 2026', addedBy: 'Ravi Kumar', trialEnds: '13 Oct 2026', trialLeft: 4, trialCredits: 212,
    notes: [{ text: 'Owner wants to see the fee reports before paying. Show him Fee Management on a call this week.', by: 'Ravi Kumar', when: '7 Oct 2026' }] }),
  SC({ id: 'LSP-PUN-003', name: 'Little Stars Pre-school, Wakad', area: 'Wakad', city: 'Pune', state: 'Maharashtra', board: 'Other', type: 'Pre-school', status: 'Trial',
    phone: '98220 41611', email: 'wakad@littlestars.in', group: 'Little Stars Group',
    admins: [AD('Farah Shaikh', '98221 70733', 'Active', 'Last signed in yesterday, 6:30 PM · first signed in 2 Oct 2026')],
    firstSignIn: '2 Oct 2026', setup: [0, 1, 2, 5], students: 36, staffLogins: 4, lastAny: 'Yesterday, 6:30 PM', msgs: 88, added: '1 Oct 2026', addedBy: 'Arjun Mehta', trialEnds: '31 Oct 2026', trialLeft: 22, trialCredits: 412 }),
  SC({ id: 'KHS-WGL-001', name: 'Kakatiya High School', area: 'Hanamkonda', city: 'Warangal', state: 'Telangana', board: 'State board', type: 'Day school', status: 'Trial',
    phone: '98661 20400', email: 'kakatiyahs@gmail.com', address: 'Nakkalagutta, Hanamkonda, Warangal 506001', approx: 620,
    admins: [AD('Srinivas Goud', '98661 20407', 'Invited', 'Invite sent Tue 6 Oct, 12:18 PM by Ravi Kumar · not opened · link works until today, 12:18 PM')],
    setup: 0, added: '6 Oct 2026', addedBy: 'Ravi Kumar', trialEnds: '5 Nov 2026', trialLeft: 27, trialCredits: 500 }),
  SC({ id: 'SMS-VSK-001', name: 'Seashore Montessori School', area: 'MVP Colony', city: 'Visakhapatnam', state: 'Andhra Pradesh', board: 'Other', type: 'Pre-school', status: 'Trial',
    phone: '98493 12200', email: 'hello@seashoremontessori.in', approx: 140,
    admins: [AD('Divya Raju', '98493 12265', 'Expired', 'Invite sent Mon 5 Oct by Ravi Kumar · never opened · link expired yesterday')],
    setup: 0, added: '5 Oct 2026', addedBy: 'Ravi Kumar', trialEnds: '4 Nov 2026', trialLeft: 26, trialCredits: 500 }),
  SC({ id: 'SVN-KNL-001', name: 'Saraswathi Vidya Niketan', area: 'Budhwarpet', city: 'Kurnool', state: 'Andhra Pradesh', board: 'State board', type: 'Day school', status: 'Suspended',
    phone: '94405 61200', since: '28 Sep 2026', keepUntil: '27 Dec 2026',
    admins: [AD('Ramana Reddy', '94405 61283', 'Active', 'Can sign in only to pay or download the school’s data · last signed in Tue 29 Sep')],
    firstSignIn: '30 Aug 2026', setup: [0, 1, 2, 3, 5], students: 380, staffLogins: 18, lastAny: 'Tue 29 Sep, 11:02 AM', msgs: 0, added: '29 Aug 2026', addedBy: 'Arjun Mehta',
    sub: { plan: 'Essential', addons: [], paid: 380, renewal: '28 Sep 2027', halves: false, status: 'Overdue', credits: 0 },
    history: [{ icon: 'CirclePause', tone: 'warn', what: <>Trial → <b>Suspended</b>. The trial ended unpaid; the school’s admins were told first (automatic).</>, when: '28 Sep 2026' },
      { icon: 'Plus', tone: 'brand', what: <>Added as <b>Trial</b> by Arjun Mehta</>, when: '29 Aug 2026' }] }),
  SC({ id: 'HCS-CHE-001', name: 'Holy Cross School', area: 'Anna Nagar', city: 'Chennai', state: 'Tamil Nadu', board: 'ICSE', type: 'Day school', status: 'Closed',
    phone: '94440 18800', founding: true, keepUntil: '12 Nov 2026',
    admins: [AD('Mary Thomas', '94440 18822', 'Disabled', 'Disabled 14 Aug 2026 when the school closed · can still download the school’s data')],
    firstSignIn: '11 Apr 2026', setup: 10, students: 0, staffLogins: 0, lastAny: 'Fri 4 Sep, 2:40 PM (data download)', msgs: 0, added: '10 Apr 2026', addedBy: 'Kiran Reddy',
    history: [{ icon: 'Archive', tone: 'neutral', what: <>Active → <b>Closed</b> by Kiran Reddy: “The trust merged the school with another. Request on letterhead dated 10 Aug.”</>, when: '14 Aug 2026' },
      { icon: 'CirclePlay', tone: 'ok', what: <>Trial → <b>Active</b>. Paid by cheque, marked by Kiran Reddy.</>, when: '12 Apr 2026' },
      { icon: 'Plus', tone: 'brand', what: <>Added as <b>Trial</b> by Kiran Reddy</>, when: '10 Apr 2026' }] }),
];

const historyOf = (s) => s.history || [
  ...(s.status === 'Active' && !s.startedActive ? [{ icon: 'CirclePlay', tone: 'ok', what: <>Trial → <b>Active</b>. First invoice paid by Razorpay (automatic).</>, when: s.act }] : []),
  { icon: 'Plus', tone: 'brand', what: <>Added as <b>{s.startedActive ? 'Active' : 'Trial'}</b> by {s.addedBy}</>, when: s.added },
];

const INV = (no, school, items, base, date, due, status, more = {}) => ({ no: `DT/26-27/${no}`, school, items, base, gst: gstOf(base), date, due, status, ...more });
const INVOICES = [
  INV('0052', 'NPS-KKD-001', 'Message credits: 20,000', 4000, '5 Oct 2026', '20 Oct 2026', 'Paid', { paidOn: '9 Oct 2026', paidBy: 'Bank transfer', ref: 'UTR HDFCN26282104477', markedBy: 'Kiran Reddy' }),
  INV('0048', 'HIS-BLR-001', 'Top-up: 80 students above the 740 paid for, rest of the year at half rate (₹60 each)', 4800, '1 Oct 2026', '31 Oct 2026', 'Waiting', { topup: true }),
  INV('0047', 'HIS-BLR-001', 'Second half: Essential, 740 students', 44400, '1 Oct 2026', '15 Nov 2026', 'Unpaid'),
  INV('0044', 'SVN-KNL-001', 'First year: Essential, 380 students', 45600, '28 Sep 2026', '28 Sep 2026', 'Overdue'),
  INV('0041', 'SMC-VJA-001', 'First year: Essential, 750 students', 90000, '22 Sep 2026', '22 Sep 2026', 'Paid', { paidOn: '23 Sep 2026', paidBy: 'Razorpay' }),
  INV('0036', 'LSP-PUN-001', 'Renewal: Essential, 142 students, group discount 10%', 15336, '31 Aug 2026', '30 Sep 2026', 'Unpaid', { grace: true }),
  INV('0033', 'GRS-MYS-001', 'Plan change: Essential to Complete, 600 students, 8 months', 32000, '20 Aug 2026', '27 Aug 2026', 'Paid', { paidOn: '22 Aug 2026', paidBy: 'Razorpay' }),
  INV('0031', 'TTP-SEC-001', 'First year: Essential, minimum 100 students', 12000, '18 Aug 2026', '18 Aug 2026', 'Paid', { paidOn: '19 Aug 2026', paidBy: 'Razorpay' }),
  INV('0027', 'NPS-KKD-001', 'First year: Essential, 650 students', 78000, '3 Aug 2026', '3 Aug 2026', 'Paid', { paidOn: '5 Aug 2026', paidBy: 'Razorpay' }),
  INV('0021', 'RHS-NSK-001', 'First year: Essential, 390 students', 46800, '14 Jul 2026', '14 Jul 2026', 'Paid', { paidOn: '16 Jul 2026', paidBy: 'Razorpay' }),
  INV('0010', 'SPS-HYD-002', 'First year: Essential, 690 students', 82800, '2 Jun 2026', '2 Jun 2026', 'Paid', { paidOn: '4 Jun 2026', paidBy: 'Razorpay' }),
  INV('0009', 'SPS-HYD-001', 'First year: Essential, 1,240 students, Hostel', 144400, '2 Jun 2026', '2 Jun 2026', 'Paid', { paidOn: '4 Jun 2026', paidBy: 'Razorpay' }),
  INV('0004', 'HCS-CHE-001', 'First year: Essential, 450 students', 54000, '12 Apr 2026', '12 Apr 2026', 'Paid', { paidOn: '12 Apr 2026', paidBy: 'Cheque', ref: 'Cheque 004512, Indian Bank', markedBy: 'Kiran Reddy' }),
  INV('0003', 'HCS-CHE-001', 'First year: Essential, 540 students', 64800, '10 Apr 2026', '10 Apr 2026', 'Cancelled', { reason: 'Wrong student count, 540 instead of 450. Replaced by DT/26-27/0004.', cancelledBy: 'Kiran Reddy, 12 Apr 2026' }),
];

const REQUESTS = [
  { id: 'SAR-0021', school: 'SPS-HYD-001', reason: 'Fee structure for Class 9 is not saving', len: '4 hours', by: 'Kiran Reddy', asked: 'Today, 11:32 AM', status: 'allowed', answer: 'Allowed by Anita Sharma (School Admin) at 11:40 AM', ends: '3:40 PM', left: '3 h 48 min left', used: 5 },
  { id: 'SAR-0020', school: 'HIS-BLR-001', reason: 'Report card template shows wrong grades', len: '1 hour', by: 'Neha Gupta', asked: 'Today, 10:58 AM', status: 'waiting', answer: 'Waiting for Shruti Rao or the Principal to answer in Approvals' },
  { id: 'SAR-0019', school: 'GVS-JAI-001', reason: 'Help importing 512 students from Excel', len: '1 day', by: 'Neha Gupta', asked: 'Wed 7 Oct, 4:05 PM', status: 'ended', answer: 'Allowed by Manoj Agarwal at 4:12 PM · ended by itself on 8 Oct, 4:15 PM' },
  { id: 'SAR-0018', school: 'GRS-MYS-001', reason: 'Hostel room allocation screen shows an error', len: '1 hour', by: 'Neha Gupta', asked: 'Mon 5 Oct, 2:50 PM', status: 'ended', answer: 'Allowed by Prakash Hegde at 2:58 PM · ended early by the school at 3:22 PM' },
  { id: 'SAR-0017', school: 'SXH-NAG-001', reason: 'Walk the accountant through Fee Structure', len: '4 hours', by: 'Ravi Kumar', asked: 'Sat 3 Oct, 9:40 AM', status: 'declined', answer: 'Declined by Fr. Joseph D’Souza: “We will call you instead.”' },
  { id: 'SAR-0016', school: 'RHS-NSK-001', reason: 'Attendance SMS not reaching some parents', len: '1 hour', by: 'Sowmya Iyer', asked: 'Tue 29 Sep, 11:15 AM', status: 'ended', answer: 'Allowed by Amit Deshpande at 11:20 AM · ended by itself at 12:20 PM' },
];

const TEAM = [
  { id: 't1', name: 'Kiran Reddy', role: 'Owner', phone: '98490 11223', email: 'kiran@dreamteamservices.in', status: 'Active', last: 'Today, 9:05 AM' },
  { id: 't2', name: 'Ravi Kumar', role: 'Onboarding', phone: '98480 44556', email: 'ravi@dreamteamservices.in', status: 'Active', last: 'Today, 11:42 AM' },
  { id: 't3', name: 'Neha Gupta', role: 'Support', phone: '99890 77881', email: 'neha@dreamteamservices.in', status: 'Active', last: 'Today, 11:46 AM' },
  { id: 't4', name: 'Arjun Mehta', role: 'Onboarding', phone: '97010 23345', email: 'arjun@dreamteamservices.in', status: 'Active', last: 'Yesterday, 6:12 PM' },
  { id: 't5', name: 'Sowmya Iyer', role: 'Support', phone: '96520 88410', email: 'sowmya@dreamteamservices.in', status: 'Active', last: 'Today, 8:47 AM' },
  { id: 't6', name: 'Farhan Ali', role: 'Support', phone: '98663 50904', email: 'farhan@dreamteamservices.in', status: 'Invited', last: 'Invite sent Thu 8 Oct, 3:02 PM' },
  { id: 't7', name: 'Deepak Rao', role: 'Onboarding', phone: '99630 41277', email: 'deepak@dreamteamservices.in', status: 'Disabled', last: 'Disabled 31 Aug 2026: left DREAM TEAM' },
];

const LG = (date, time, who, role, text, type, school = null, change = null) => ({ id: `${date}-${time}-${who}`, date, time, who, role, text, type, school, change });
const LOGS = [
  LG('9 Oct 2026', '11:46 AM', 'Neha', 'Support', 'reset the login of Pooja Kulkarni at Little Stars Pre-school, Kothrud. A reset link went to +91 98xxx xx572.', 'Admin login', 'LSP-PUN-001'),
  LG('9 Oct 2026', '11:42 AM', 'Ravi', 'Onboarding', 'sent a new admin invite to Sunrise Public School, to Naveen Kumar, +91 98xxx xx318.', 'Invite', 'SPS-HYD-001'),
  LG('9 Oct 2026', '11:40 AM', 'Anita Sharma', 'Sunrise Public School', 'allowed Kiran’s support access for 4 hours, until 3:40 PM.', 'Support access', 'SPS-HYD-001', ['Waiting', 'Allowed']),
  LG('9 Oct 2026', '11:32 AM', 'Kiran', 'Owner', 'asked Sunrise Public School for support access for 4 hours: “Fee structure for Class 9 is not saving.”', 'Support access', 'SPS-HYD-001'),
  LG('9 Oct 2026', '10:58 AM', 'Neha', 'Support', 'asked Harmony International School for support access for 1 hour: “Report card template shows wrong grades.”', 'Support access', 'HIS-BLR-001'),
  LG('9 Oct 2026', '10:47 AM', 'Automatic', null, 'WhatsApp messages stopped going out for Sunrise Public School, Green Valley School and Harmony International School. DREAM TEAM alerted.', 'System', null),
  LG('9 Oct 2026', '10:21 AM', 'Ravi', 'Onboarding', 'added a note to St. Mary’s Convent: “Called twice, no answer. Try after 4 PM.”', 'Note', 'SMC-VJA-001'),
  LG('9 Oct 2026', '9:40 AM', 'Kiran', 'Owner', 'marked invoice DT/26-27/0052 paid for Nalanda Public School: bank transfer, UTR HDFCN26282104477.', 'Billing', 'NPS-KKD-001', ['Unpaid', 'Paid']),
  LG('9 Oct 2026', '9:05 AM', 'Kiran', 'Owner', 'signed in on a new device. One-time code sent to +91 98xxx xx223.', 'Team'),
  LG('8 Oct 2026', '6:10 PM', 'Automatic', null, 'the invite link to Divya Raju at Seashore Montessori School expired. It was never opened.', 'Invite', 'SMS-VSK-001', ['Sent', 'Expired']),
  LG('8 Oct 2026', '4:15 PM', 'Automatic', null, 'Neha’s support access to Green Valley School ended by itself after 1 day.', 'Support access', 'GVS-JAI-001', ['Allowed', 'Ended']),
  LG('8 Oct 2026', '3:02 PM', 'Kiran', 'Owner', 'invited Farhan Ali to the team as Support, on +91 98xxx xx904.', 'Team'),
  LG('8 Oct 2026', '12:30 PM', 'Sowmya', 'Support', 'reset the login of Laxmi Prasanna at Sri Sai Vidyalaya after a phone change. A reset link went to +91 98xxx xx610.', 'Admin login', 'SSV-KRM-001'),
  LG('7 Oct 2026', '4:12 PM', 'Manoj Agarwal', 'Green Valley School', 'allowed Neha’s support access for 1 day.', 'Support access', 'GVS-JAI-001', ['Waiting', 'Allowed']),
  LG('7 Oct 2026', '4:05 PM', 'Neha', 'Support', 'asked Green Valley School for support access for 1 day: “Help importing 512 students from Excel.”', 'Support access', 'GVS-JAI-001'),
  LG('7 Oct 2026', '11:20 AM', 'Kiran', 'Owner', 'changed Sowmya Iyer’s role.', 'Team', null, ['Onboarding', 'Support']),
  LG('6 Oct 2026', '12:18 PM', 'Ravi', 'Onboarding', 'added Kakatiya High School (State board, Day school) as Trial and sent a login invite to Srinivas Goud, +91 98xxx xx407.', 'School added', 'KHS-WGL-001'),
  LG('5 Oct 2026', '3:40 PM', 'Ravi', 'Onboarding', 'added Seashore Montessori School (Other, Pre-school) as Trial and sent a login invite to Divya Raju, +91 98xxx xx265.', 'School added', 'SMS-VSK-001'),
  LG('5 Oct 2026', '3:22 PM', 'Prakash Hegde', 'Gurukul Residential School', 'ended Neha’s support access early.', 'Support access', 'GRS-MYS-001', ['Allowed', 'Ended']),
  LG('3 Oct 2026', '10:15 AM', 'Fr. Joseph D’Souza', 'St. Xavier’s High School', 'declined Ravi’s support access request: “We will call you instead.”', 'Support access', 'SXH-NAG-001', ['Waiting', 'Declined']),
  LG('1 Oct 2026', '10:02 AM', 'Arjun', 'Onboarding', 'added Little Stars Pre-school, Wakad (Other, Pre-school) as Trial in Little Stars Group and sent a login invite to Farah Shaikh, +91 98xxx xx733.', 'School added', 'LSP-PUN-003'),
  LG('1 Oct 2026', '6:00 AM', 'Automatic', null, 'six-month check made top-up invoice DT/26-27/0048 for Harmony International School: 80 students above the 740 paid for. Waiting for the Owner’s OK.', 'Billing', 'HIS-BLR-001'),
  LG('28 Sep 2026', '12:05 AM', 'Automatic', null, 'suspended Saraswathi Vidya Niketan: the trial ended unpaid. Its admins were told first.', 'Status', 'SVN-KNL-001', ['Trial', 'Suspended']),
  LG('22 Sep 2026', '2:30 PM', 'Ravi', 'Onboarding', 'added St. Mary’s Convent (ICSE, Day school) as Active on Essential and sent a login invite to Sr. Grace Fernandes, +91 94xxx xx876.', 'School added', 'SMC-VJA-001'),
  LG('20 Aug 2026', '11:10 AM', 'Kiran', 'Owner', 'changed Gurukul Residential School’s plan. The difference for the rest of the year was invoiced (DT/26-27/0033).', 'Billing', 'GRS-MYS-001', ['Essential', 'Complete']),
  LG('18 Aug 2026', '5:05 PM', 'Kiran', 'Owner', 'marked Tiny Tots Pre-school as a founding school (14 of 20).', 'Billing', 'TTP-SEC-001'),
  LG('14 Aug 2026', '4:00 PM', 'Kiran', 'Owner', 'closed Holy Cross School: “The trust merged the school with another. Request on letterhead dated 10 Aug.” Data kept until 12 Nov 2026.', 'Status', 'HCS-CHE-001', ['Active', 'Closed']),
  LG('2 Jun 2026', '11:42 AM', 'Ravi', 'Onboarding', 'sent a new admin invite to Sunrise Public School, to Anita Sharma, +91 98xxx xx123.', 'Invite', 'SPS-HYD-001'),
  LG('2 Jun 2026', '11:38 AM', 'Ravi', 'Onboarding', 'added Sunrise Public School (CBSE, Day school) as Trial in Sunrise Group.', 'School added', 'SPS-HYD-001'),
];
const LOG_TYPES = { 'School added': ['Building2', 'brand'], Invite: ['Send', 'info'], 'Admin login': ['KeyRound', 'neutral'], Status: ['Flag', 'warn'], 'Support access': ['LifeBuoy', 'info'], Billing: ['ReceiptIndianRupee', 'ok'], Note: ['StickyNote', 'neutral'], Team: ['UsersRound', 'neutral'], Restore: ['History', 'bad'], Details: ['Pencil', 'neutral'], System: ['Activity', 'bad'] };

const SA_NOTIFS = [
  { id: 1, when: '11:40 AM', title: 'Sunrise Public School allowed support access', body: 'Anita Sharma allowed 4 hours, until 3:40 PM', unread: true, to: 'sa.support' },
  { id: 2, when: '10:58 AM', title: 'Support access request sent to Harmony International School', body: 'Waiting for Shruti Rao or the Principal', unread: true, to: 'sa.support' },
  { id: 3, when: '10:47 AM', title: 'WhatsApp messages delayed', body: '3 schools affected · 214 messages waiting in the queue', unread: true, to: 'sa.dashboard' },
  { id: 4, when: 'Yesterday', title: 'Invite expired: Seashore Montessori School', body: 'Divya Raju did not open the link in 3 days', to: 'sa.schools' },
  { id: 5, when: '1 Oct', title: 'Top-up invoice waits for the Owner’s OK', body: 'Harmony International School · 80 students', to: 'sa.billing' },
];

/* ======================= Small shared pieces ======================= */
const STATUS_TONE = { Trial: 'info', Active: 'ok', Suspended: 'warn', Closed: 'neutral' };
const SUB_TONE = { Paid: 'ok', Due: 'info', 'In grace': 'warn', Overdue: 'bad' };
const ADMIN_TONE = { Active: 'ok', Invited: 'info', Expired: 'bad', Disabled: 'neutral' };
const ADMIN_LABEL = { Active: 'Active', Invited: 'Invited', Expired: 'Invite expired', Disabled: 'Disabled' };
const setupDone = (s) => (Array.isArray(s.setup) ? s.setup : Array.from({ length: s.setup }, (_, i) => i));
const setupCount = (s) => setupDone(s).length;
const isNew = (s) => s.added.endsWith('Oct 2026');
const NO_ADMIN = { id: 'none', name: 'No School Admin yet', phone: '', email: '', status: 'None', note: '', role: 'School Admin' };
const adminOf = (s) => s.admins.find((a) => a.status === 'Active') || s.admins.find((a) => a.status !== 'Disabled') || s.admins[0] || NO_ADMIN;
function adminState(s) {
  if (s.admins.some((a) => a.status === 'Active')) return { label: 'Signed in', tone: 'ok' };
  if (s.admins.some((a) => a.status === 'Invited')) return { label: 'Not signed in', tone: 'warn' };
  if (s.admins.some((a) => a.status === 'Expired')) return { label: 'Invite expired', tone: 'bad' };
  return { label: 'No active admin', tone: 'neutral' };
}
function statusSub(s) {
  if (s.status === 'Trial') return `Ends ${s.trialEnds}`;
  if (s.status === 'Suspended') return `Since ${s.since}`;
  if (s.status === 'Closed') return `Data kept until ${s.keepUntil}`;
  if (s.sub?.status === 'In grace') return `In grace · ${s.sub.grace} days left`;
  return s.sub ? `Renews ${s.sub.renewal}` : '';
}
const STATUS_MEANS = {
  Trial: 'Everything works. The School Admin sees how many trial days are left on the Dashboard.',
  Active: 'Everything works. Parents’ messages and payment links go out as usual.',
  Suspended: 'Staff see “Your School OS access is paused” when they sign in. The School Admin can sign in only to pay the invoice or download all the school’s data. Parents’ messages stop; payment links already sent still work.',
  Closed: 'Nobody can sign in. The admin can still download all the school’s data until the keep period ends; then it is removed with the Owner’s approval.',
};

function SchoolLogo({ name, size = 40 }) {
  return <Avatar name={name} size={size} className={size >= 60 ? '!rounded-2xl' : '!rounded-xl'} />;
}
function StatusPill({ s, className }) {
  return <Pill tone={STATUS_TONE[s.status]} dot className={className}>{s.status}</Pill>;
}
function BackLink({ label = 'Schools', extra, to = 'schools' }) {
  const { go } = useNav();
  return (
    <button onClick={() => go('sa', { page: to })} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink mb-3 -ml-1 h-8 px-1 rounded-lg">
      <I.ArrowLeft size={17} />{label}{extra && <span className="text-ink3 font-normal"> / {extra}</span>}
    </button>
  );
}
function ExportBtn({ what, file }) {
  const toast = useToast();
  return <Button variant="secondary" icon={I.Download} className="hidden @md:inline-flex" onClick={() => toast({ title: `Exported ${what}`, body: `${file} · counts only, never student details` })}>Export</Button>;
}
// One confirmation sheet per page; the confirm button repeats the action
function useAsk() {
  const [ask, setAsk] = useState(null);
  const el = (
    <ConfirmSheet open={!!ask} onClose={() => setAsk(null)} title={ask?.title} sub={ask?.sub} confirmLabel={ask?.label} danger={ask?.danger} onConfirm={() => ask?.run?.()}>
      {ask?.body ? <div className="text-[14.5px] leading-relaxed text-ink2 flex flex-col gap-2">{ask.body}</div> : null}
    </ConfirmSheet>
  );
  return [setAsk, el];
}
// A confirmation that needs a reason, and for the most serious steps the school name typed in
function ActSheet({ open, onClose, title, sub, confirmLabel, danger, reasonLabel = 'Reason', reasonHint, reasonPlaceholder, typeName, onConfirm, children }) {
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [tried, setTried] = useState(false);
  useEffect(() => { if (open) { setReason(''); setTyped(''); setTried(false); } }, [open]);
  const short = reason.trim().length < 5;
  return (
    <Sheet open={open} onClose={onClose} title={title} sub={sub}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} disabled={!!typeName && typed.trim() !== typeName}
        onClick={() => { setTried(true); if (short) return; onConfirm(reason.trim()); onClose(); }}>{confirmLabel}</Button></>}>
      <div className="flex flex-col gap-4">
        {children}
        <Field label={reasonLabel} required id="act-reason" error={tried && short ? 'Write the reason in a few words. It is kept in the history and the Activity Log.' : ''} hint={reasonHint}>
          <Textarea id="act-reason" value={reason} onChange={setReason} rows={2} placeholder={reasonPlaceholder} />
        </Field>
        {typeName && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="act-type" className="text-[13px] font-semibold text-ink2">Type <b className="text-ink">{typeName}</b> to confirm</label>
            <Input id="act-type" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
        )}
      </div>
    </Sheet>
  );
}
const NUMS = [1, 2, 3].map((n) => function NumIcon() { return <span className="text-[14px] font-bold tnum">{n}</span>; });

/* ======================= Console state ======================= */
const SACtx = createContext(null);
const useSA = () => useContext(SACtx);

export function SuperAdminApp({ page = 'dashboard', params = {} }) {
  const toast = useToast();
  const [roleId, setRoleId] = useState(() => START_ROLE);
  const [schools, setSchools] = useState(SCHOOLS);
  const [requests, setRequests] = useState(REQUESTS);
  const [logs, setLogs] = useState(LOGS);
  const [invoices, setInvoices] = useState(INVOICES);
  const [team, setTeam] = useState(TEAM);
  const [done, setDone] = useState(() => new Set());
  const [alertFixed, setAlertFixed] = useState(false);
  useEffect(() => { START_ROLE = roleId; }, [roleId]);

  const sa = useMemo(() => {
    const role = SA_ROLES[roleId];
    const me = role.person;
    const school = (id) => schools.find((s) => s.id === id);
    const updateSchool = (id, fn) => setSchools((xs) => xs.map((s) => (s.id === id ? { ...s, ...fn(s) } : s)));
    const log = (text, extra = {}) => { const time = extra.time || nowTime(); const id = 'L' + Math.random(); setLogs((l) => [{ id, date: '9 Oct 2026', who: me.first, role: role.label, text, type: 'Details', school: null, change: null, ...extra, time }, ...l]); };
    const nextNo = () => `DT/26-27/${String(53 + invoices.length - INVOICES.length).padStart(4, '0')}`;
    return {
      role, roleId, setRoleId, me, can: (a) => CAN[roleId].includes(a),
      schools, school, updateSchool, addSchool: (s) => setSchools((xs) => [s, ...xs]),
      requests, setRequests, updateRequest: (id, patch) => setRequests((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r))),
      logs, log, invoices, nextNo,
      addInvoice: (inv) => setInvoices((xs) => [inv, ...xs]),
      updateInvoice: (no, patch) => setInvoices((xs) => xs.map((i) => (i.no === no ? { ...i, ...patch } : i))),
      team, setTeam, done, setDone, alertFixed, setAlertFixed,
      resendInvite: (sid, aid) => {
        const s = school(sid); const a = s.admins.find((x) => x.id === aid); const t = nowTime();
        updateSchool(sid, (x) => ({ admins: x.admins.map((y) => (y.id === aid ? { ...y, status: 'Invited', note: `New invite sent today, ${t} by ${me.name} · link works until 12 Oct` } : y)) }));
        log(`sent a new admin invite to ${s.name}, to ${a.name}, +91 ${mask(a.phone)}.`, { type: 'Invite', school: sid, time: t });
        toast({ title: `New invite sent to ${a.name}`, body: `WhatsApp and SMS to +91 ${mask(a.phone)}. The old link stopped working.` });
      },
      addNote: (sid, text) => {
        const s = school(sid);
        updateSchool(sid, (x) => ({ notes: [{ text, by: me.name, when: 'Today, just now' }, ...x.notes] }));
        log(`added a note to ${s.name}: “${text}”`, { type: 'Note', school: sid });
        toast({ title: 'Note added', body: 'Visible only inside DREAM TEAM.' });
      },
      markPaid: (no, { by, ref, date }) => {
        const inv = invoices.find((i) => i.no === no); const s = school(inv.school);
        setInvoices((xs) => xs.map((i) => (i.no === no ? { ...i, status: 'Paid', paidOn: date, paidBy: by, ref, markedBy: me.name } : i)));
        const reactivate = s.status === 'Suspended';
        updateSchool(s.id, (x) => ({
          sub: x.sub ? { ...x.sub, status: 'Paid', grace: undefined } : x.sub,
          ...(reactivate ? { status: 'Active', since: undefined, history: [{ icon: 'CirclePlay', tone: 'ok', what: <>Suspended → <b>Active</b>. Overdue invoice {no} paid (automatic).</>, when: 'Today' }, ...historyOf(x)] } : {}),
        }));
        log(`marked invoice ${no} paid for ${s.name}: ${by.toLowerCase()}, ${ref}.`, { type: 'Billing', school: s.id, change: ['Unpaid', 'Paid'] });
        toast({ title: `${no} marked paid`, body: reactivate ? `${s.name} is Active again. Everything came back unchanged.` : `${inr(inv.base + inv.gst)} by ${by.toLowerCase()} · ${ref}` });
      },
    };
  }, [roleId, schools, requests, logs, invoices, team, done, alertFixed, toast]);

  return <SACtx.Provider value={sa}><ConsoleShell page={page} params={params} /></SACtx.Provider>;
}

/* ======================= Console shell: sidebar, top bar, phone bar ======================= */
const MENU = [
  { group: null, items: [['dashboard', 'Dashboard', 'LayoutGrid']] },
  { group: 'Schools', items: [['schools', 'Schools', 'School'], ['support', 'Support Access', 'LifeBuoy']] },
  { group: 'Money', items: [['billing', 'Plans & Billing', 'ReceiptIndianRupee']] },
  { group: 'DREAM TEAM', items: [['team', 'Team', 'UsersRound'], ['activity', 'Activity Log', 'ScrollText']] },
];
const TITLES = { dashboard: 'Dashboard', schools: 'Schools', add: 'Add School', support: 'Support Access', billing: 'Plans & Billing', team: 'Team', activity: 'Activity Log' };
const PAGES = { dashboard: Dashboard, schools: SchoolsPage, school: SchoolPage, add: AddSchool, support: SupportPage, billing: BillingPage, team: TeamPage, activity: ActivityPage };

function ConsoleShell({ page, params }) {
  const sa = useSA();
  const [more, setMore] = useState(false);
  const [profile, setProfile] = useState(false);
  const [notif, setNotif] = useState(false);
  const [search, setSearch] = useState(false);
  const [notes, setNotes] = useState(SA_NOTIFS);
  const main = useRef(null);
  useEffect(() => { main.current?.scrollTo?.(0, 0); }, [page, params]);
  useEffect(() => {
    const k = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearch(true); }
      if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName)) { e.preventDefault(); setSearch(true); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const Comp = PAGES[page] || Dashboard;
  const title = page === 'school' ? (sa.school(params.id) || sa.school('SPS-HYD-001')).name : TITLES[page] || 'Dashboard';
  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-1 min-h-0">
        <ConsoleSidebar page={page} />
        <div className="flex-1 flex flex-col min-w-0 h-full">
          <ConsoleTopBar title={title} unread={notes.filter((n) => n.unread).length} onSearch={() => setSearch(true)} onNotif={() => setNotif(true)} onProfile={() => setProfile(true)} />
          <main ref={main} className="flex-1 overflow-y-auto overflow-x-hidden scroll-thin">
            <div key={page + JSON.stringify(params)} className="max-w-[1400px] mx-auto px-4 @md:px-6 @xl:px-8 py-5 @md:py-7 animate-rise">
              <Comp params={params} />
            </div>
          </main>
          <ConsoleBottomNav page={page} onMore={() => setMore(true)} />
        </div>
      </div>
      <ConsoleSearch open={search} onClose={() => setSearch(false)} />
      <NotifPanel open={notif} onClose={() => setNotif(false)} items={notes} setItems={setNotes} />
      <ConsoleProfile open={profile} onClose={() => setProfile(false)} />
      <ConsoleMore open={more} onClose={() => setMore(false)} />
    </div>
  );
}

const activeOf = (page) => (page === 'school' || page === 'add' ? 'schools' : page);

function ConsoleSidebar({ page }) {
  const { go } = useNav();
  const sa = useSA();
  const active = activeOf(page);
  const counts = { schools: sa.schools.length, support: sa.requests.filter((r) => r.status === 'waiting').length || null };
  return (
    <aside className="hidden @md:flex flex-col shrink-0 h-full border-r border-line bg-surface transition-[width] duration-200 w-[76px] @lg:w-[268px]">
      <button onClick={() => go('sa', { page: 'dashboard' })} title="School OS Console · DREAM TEAM SERVICES" className="h-16 flex items-center gap-3 px-[18px] shrink-0 text-left">
        <Logo />
        <div className="min-w-0 hidden @lg:block">
          <p className="font-display font-semibold text-[15px] leading-tight truncate">School OS Console</p>
          <p className="text-xs text-ink3 truncate">DREAM TEAM SERVICES</p>
        </div>
      </button>
      {sa.can('add') && (
        <div className="px-3.5 pb-2 pt-1">
          <button onClick={() => go('sa', { page: 'add' })} title="Add School"
            className="w-full h-11 rounded-xl bg-brand text-brandink font-semibold text-sm inline-flex items-center justify-center gap-2 hover:brightness-110 shadow-sm transition">
            <I.Plus size={19} strokeWidth={2.5} /><span className="hidden @lg:inline">Add School</span>
          </button>
        </div>
      )}
      <nav className="flex-1 overflow-y-auto scroll-thin px-3 pb-4" aria-label="Console menu">
        {MENU.map((g, gi) => (
          <div key={gi} className="pt-3">
            {g.group && <p className="eyebrow text-ink3 px-3 pb-1.5 hidden @lg:block">{g.group}</p>}
            {g.group && <div className="mx-3 mb-2 border-t border-line @lg:hidden" />}
            <ul className="flex flex-col gap-0.5">
              {g.items.map(([id, label, icon]) => {
                const Ic = I[icon];
                const on = active === id;
                return (
                  <li key={id}>
                    <button onClick={() => go('sa', { page: id })} title={label} aria-current={on ? 'page' : undefined}
                      className={cx('group w-full h-10 rounded-xl flex items-center gap-3 px-3 text-[14px] font-medium transition relative justify-center @lg:justify-start',
                        on ? 'bg-brand/10 text-brand font-semibold' : 'text-ink2 hover:bg-sunken hover:text-ink')}>
                      {on && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-brand -ml-3" />}
                      <Ic size={19} strokeWidth={on ? 2.3 : 2} className="shrink-0" />
                      <span className="truncate hidden @lg:inline">{label}</span>
                      {counts[id] && <span className="ml-auto text-[11px] font-bold tnum px-1.5 h-5 rounded-md bg-sunken text-ink2 items-center hidden @lg:inline-flex">{counts[id]}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="m-3 p-3.5 rounded-2xl bg-sunken hidden @lg:block">
        <p className="text-[13px] font-semibold flex items-center gap-2"><I.ShieldCheck size={15} className="text-brand" />Two-step login is on</p>
        <p className="text-xs text-ink3 mt-1 leading-relaxed">Signed out after 30 minutes without use. Everything you do goes in the Activity Log.</p>
      </div>
    </aside>
  );
}

function ConsoleTopBar({ title, unread, onSearch, onNotif, onProfile }) {
  const { go } = useNav();
  const { resolved, setMode } = useTheme();
  const sa = useSA();
  const waiting = sa.requests.filter((r) => r.status === 'waiting').length;
  return (
    <header className="h-16 shrink-0 flex items-center gap-2 px-3 @md:px-5 border-b border-line bg-surface/85 backdrop-blur-md z-20">
      <button className="@md:hidden flex items-center gap-2.5 min-w-0 flex-1 text-left" onClick={() => go('sa', { page: 'dashboard' })}>
        <Logo size={34} />
        <div className="min-w-0">
          <p className="font-display font-semibold text-[15px] leading-tight truncate">{title}</p>
          <p className="text-[11.5px] text-ink3 truncate">School OS Console · DREAM TEAM SERVICES</p>
        </div>
      </button>
      <button onClick={onSearch}
        className="hidden @md:flex items-center gap-3 h-11 flex-1 max-w-xl rounded-xl bg-sunken border border-transparent hover:border-line px-3.5 text-ink3 text-[14.5px] transition">
        <I.Search size={18} />
        <span className="truncate">Search schools by name, city, phone or school code</span>
        <span className="ml-auto flex gap-1"><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span>
      </button>
      <div className="flex-1 hidden @md:block" />
      <button onClick={onProfile} className="hidden @lg:inline-flex items-center gap-2 h-9 px-3 rounded-xl border border-line text-ink2 text-[13px] font-semibold hover:bg-sunken" title="Change the role you view the console as">
        <sa.role.icon size={16} />{sa.role.label}
      </button>
      <IconButton className="@md:hidden" icon={I.Search} label="Search schools" onClick={onSearch} />
      <IconButton className="hidden @md:inline-flex" icon={I.LifeBuoy} label="Support access requests waiting" badge={waiting || null} onClick={() => go('sa', { page: 'support' })} />
      <IconButton icon={I.Bell} label="Notifications" badge={unread || null} onClick={onNotif} />
      <IconButton className="hidden @md:inline-flex" icon={resolved === 'dark' ? I.Sun : I.Moon} label={resolved === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        onClick={() => setMode(resolved === 'dark' ? 'light' : 'dark')} />
      <button onClick={onProfile} className="ml-1 flex items-center gap-2.5 rounded-xl hover:bg-sunken p-1 @lg:pr-3 transition" aria-label="Your profile and role">
        <Avatar name={sa.me.name} size={34} />
        <span className="hidden @lg:block text-left">
          <span className="block text-[13.5px] font-semibold leading-tight">{sa.me.name}</span>
          <span className="block text-xs text-ink3">{sa.role.label} · DREAM TEAM</span>
        </span>
      </button>
    </header>
  );
}

function ConsoleBottomNav({ page, onMore }) {
  const { go } = useNav();
  const sa = useSA();
  const items = sa.can('add')
    ? [['dashboard', 'Home', I.LayoutGrid], ['schools', 'Schools', I.School], ['add', 'Add', I.Plus, true], ['support', 'Support', I.LifeBuoy]]
    : [['dashboard', 'Home', I.LayoutGrid], ['schools', 'Schools', I.School], ['support', 'Support', I.LifeBuoy, true], ['activity', 'Activity', I.ScrollText]];
  const isOn = (id) => id === page || (id === 'schools' && page === 'school');
  const moreOn = !items.some(([id]) => isOn(id));
  return (
    <nav className="@md:hidden shrink-0 border-t border-line bg-surface/95 backdrop-blur-md px-2 pt-1.5 z-20" style={{ paddingBottom: 'calc(6px + env(safe-area-inset-bottom, 0px))' }} aria-label="Console menu">
      <ul className="grid grid-cols-5">
        {items.map(([id, label, Ic, big]) => {
          const on = isOn(id);
          return (
            <li key={id} className="flex justify-center">
              <button onClick={() => go('sa', { page: id })} aria-current={on ? 'page' : undefined}
                className={cx('flex flex-col items-center gap-1 w-full py-1 text-[11px] font-semibold', on ? 'text-brand' : 'text-ink3')}>
                {big ? (
                  <span className={cx('w-12 h-9 -mt-0.5 rounded-2xl grid place-items-center transition', on ? 'bg-brand text-brandink' : 'bg-brand/12 text-brand')}><Ic size={20} strokeWidth={2.4} /></span>
                ) : (
                  <span className={cx('w-14 h-8 rounded-full grid place-items-center transition', on && 'bg-brand/12')}><Ic size={21} strokeWidth={on ? 2.4 : 2} /></span>
                )}
                {label}
              </button>
            </li>
          );
        })}
        <li className="flex justify-center">
          <button onClick={onMore} className={cx('flex flex-col items-center gap-1 w-full py-1 text-[11px] font-semibold', moreOn ? 'text-brand' : 'text-ink3')}>
            <span className={cx('w-14 h-8 rounded-full grid place-items-center', moreOn && 'bg-brand/12')}><I.LayoutGrid size={21} /></span>
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}

function ConsoleMore({ open, onClose }) {
  const { go } = useNav();
  const sa = useSA();
  const groups = MENU.filter((g) => g.group).map((g) => (g.group === 'Schools' && sa.can('add') ? { ...g, items: [...g.items, ['add', 'Add School', 'Plus']] } : g));
  return (
    <Sheet open={open} onClose={onClose} title="Console menu" sub="School OS Console · DREAM TEAM SERVICES">
      <div className="flex flex-col gap-5">
        {groups.map((g) => (
          <div key={g.group}>
            <p className="eyebrow text-ink3 mb-2">{g.group}</p>
            <div className="grid grid-cols-3 gap-2">
              {g.items.map(([id, label, icon]) => {
                const Ic = I[icon];
                return (
                  <button key={id} onClick={() => { onClose(); go('sa', { page: id }); }} className="flex flex-col items-center gap-2 rounded-2xl bg-sunken hover:bg-line/60 px-2 py-3.5 text-center">
                    <span className="w-10 h-10 rounded-xl bg-surface text-brand grid place-items-center shadow-card"><Ic size={20} /></span>
                    <span className="text-[12px] font-semibold leading-tight">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function ConsoleProfile({ open, onClose }) {
  const { go } = useNav();
  const { mode, setMode } = useTheme();
  const sa = useSA();
  const toast = useToast();
  if (!open) return null;
  const row = 'w-full flex items-center gap-3 px-3 h-11 rounded-xl hover:bg-sunken text-[14px] font-medium text-left';
  return (
    <div className="absolute inset-0 z-50">
      <div className="absolute inset-0 bg-[rgb(var(--shadow)/.35)] @md:bg-transparent animate-fade" onClick={onClose} />
      <div role="menu" className="absolute inset-x-0 bottom-0 @md:bottom-auto @md:left-auto @md:right-4 @md:top-[68px] @md:w-[340px] bg-surface rounded-t-3xl @md:rounded-2xl shadow-pop border border-line animate-sheet p-2 max-h-[92%] overflow-y-auto scroll-thin">
        <div className="flex items-center gap-3 p-3">
          <Avatar name={sa.me.name} size={44} />
          <div className="min-w-0">
            <p className="font-semibold truncate">{sa.me.name}</p>
            <p className="text-[13px] text-ink3 truncate">{sa.role.label} · DREAM TEAM SERVICES</p>
          </div>
        </div>
        <div className="px-3 py-2">
          <p className="eyebrow text-ink3 mb-2">Mode</p>
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-sunken">
            {[['light', 'Light', I.Sun], ['dark', 'Dark', I.Moon], ['system', 'Auto', I.MonitorSmartphone]].map(([v, l, Ic]) => (
              <button key={v} onClick={() => setMode(v)} className={cx('h-9 rounded-lg text-[13px] font-semibold inline-flex items-center justify-center gap-1.5', mode === v ? 'bg-surface shadow-card text-ink' : 'text-ink2')}>
                <Ic size={15} />{l}
              </button>
            ))}
          </div>
        </div>
        <div className="px-3 py-2">
          <p className="eyebrow text-ink3 mb-2">View the console as</p>
          <div className="flex flex-col gap-1.5">
            {Object.values(SA_ROLES).map((r) => {
              const on = r.id === sa.roleId;
              return (
                <button key={r.id} role="menuitemradio" aria-checked={on}
                  onClick={() => { sa.setRoleId(r.id); onClose(); toast({ title: `Viewing as ${r.label}: ${r.person.name}`, body: 'Buttons this role may not use are hidden.', tone: 'info' }); }}
                  className={cx('flex items-center gap-3 p-2.5 rounded-xl border text-left transition', on ? 'border-brand ring-1 ring-brand bg-brand/5' : 'border-line hover:bg-sunken')}>
                  <span className={cx('w-9 h-9 rounded-lg grid place-items-center shrink-0', on ? 'bg-brand text-brandink' : 'bg-sunken text-ink2')}><r.icon size={17} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold leading-tight">{r.label}</span>
                    <span className="block text-[12px] text-ink3 truncate">{r.person.name}</span>
                  </span>
                  {on && <I.CircleCheck size={17} className="text-brand shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
        <div className="border-t border-line my-1" />
        <button className={row} onClick={() => { onClose(); toast({ title: 'My profile and password', body: 'Change your password here. DREAM TEAM never sees a school’s password.', tone: 'info' }); }}><I.UserCog size={18} className="text-ink3" />My profile and password</button>
        <button className={row} onClick={() => { onClose(); toast({ title: 'Two-step login is always on', body: `Codes go to +91 ${mask(sa.me.phone)}. It cannot be turned off in the console.`, tone: 'info' }); }}><I.ShieldCheck size={18} className="text-ink3" />Two-step login<span className="ml-auto"><Pill tone="ok" className="!h-5 !text-[11px]">On</Pill></span></button>
        <div className="border-t border-line my-1" />
        <button className={cx(row, 'text-bad')} onClick={() => { onClose(); go('sa-signin'); }}><I.LogOut size={18} />Sign out</button>
      </div>
    </div>
  );
}

function ConsoleSearch({ open, onClose }) {
  const { go } = useNav();
  const sa = useSA();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inp = useRef(null);
  useEffect(() => { if (open) { setQ(''); setSel(0); setTimeout(() => inp.current?.focus(), 40); } }, [open]);
  const results = useMemo(() => {
    const t = q.trim().toLowerCase().replace(/\s/g, '');
    const out = [];
    sa.schools.filter((s) => !t || [s.name, s.city, s.area, s.id, s.phone, ...s.admins.map((a) => a.name + a.phone)].join(' ').toLowerCase().replace(/\s/g, '').includes(t))
      .slice(0, t ? 6 : 4).forEach((s) => out.push({ sec: t ? 'Schools' : 'Schools that need you', logo: s.name, label: s.name, sub: `${s.city} · ${s.id} · ${s.status}`, run: () => go('sa', { page: 'school', id: s.id }) }));
    MENU.flatMap((g) => g.items).filter(([, l]) => !t || l.toLowerCase().replace(/\s/g, '').includes(t))
      .forEach(([id, l, ic]) => out.push({ sec: 'Pages', icon: I[ic], label: l, sub: 'Open', run: () => go('sa', { page: id }) }));
    if (sa.can('add') && (!t || 'addschool'.includes(t))) out.push({ sec: 'Pages', icon: I.Plus, label: 'Add School', sub: 'A new school and its first School Admin', run: () => go('sa', { page: 'add' }) });
    return out;
  }, [q, sa]);
  useEffect(() => setSel(0), [q]);
  if (!open) return null;
  const choose = (r) => { onClose(); r.run(); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    if (e.key === 'Enter' && results[sel]) choose(results[sel]);
    if (e.key === 'Escape') onClose();
  };
  let last = null;
  return (
    <div className="absolute inset-0 z-50 flex justify-center items-start @md:pt-[10vh]">
      <div className="absolute inset-0 bg-[rgb(var(--shadow)/.45)] backdrop-blur-[2px] animate-fade" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Search schools" className="relative w-full h-full @md:h-auto @md:max-w-2xl bg-surface @md:rounded-2xl shadow-pop animate-rise flex flex-col @md:max-h-[70vh] @md:mx-6">
        <div className="flex items-center gap-3 px-4 h-16 border-b border-line shrink-0">
          <I.Search size={20} className="text-ink3" />
          <input ref={inp} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} id="sa-cmdk" placeholder="School name, city, phone or school code"
            className="flex-1 bg-transparent outline-none text-[16px] placeholder:text-ink3 min-w-0" />
          <button onClick={onClose} className="text-sm font-semibold text-ink2 px-2 h-8 rounded-lg hover:bg-sunken"><span className="@md:hidden">Cancel</span><span className="hidden @md:inline"><Kbd>Esc</Kbd></span></button>
        </div>
        <div className="overflow-y-auto scroll-thin p-2 flex-1">
          {results.length === 0 && (
            <div className="text-center py-12 px-6">
              <p className="font-semibold">No school found for “{q}”</p>
              <p className="text-sm text-ink3 mt-1">Try the school code, like SPS-HYD-001, or the school’s phone number.</p>
            </div>
          )}
          {results.map((r, i) => {
            const head = r.sec !== last ? (last = r.sec) : null;
            return (
              <React.Fragment key={i}>
                {head && <p className="eyebrow text-ink3 px-3 pt-3 pb-1.5">{head}</p>}
                <button onMouseEnter={() => setSel(i)} onClick={() => choose(r)} className={cx('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left', sel === i && 'bg-sunken')}>
                  {r.logo ? <SchoolLogo name={r.logo} size={34} /> : <span className={cx('w-[34px] h-[34px] rounded-lg grid place-items-center shrink-0', sel === i ? 'bg-brand text-brandink' : 'bg-sunken text-ink2')}><r.icon size={17} /></span>}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-semibold truncate">{r.label}</span>
                    <span className="block text-[12.5px] text-ink3 truncate">{r.sub}</span>
                  </span>
                  {sel === i && <I.CornerDownLeft size={16} className="text-ink3 hidden @md:block" />}
                </button>
              </React.Fragment>
            );
          })}
        </div>
        <div className="hidden @md:flex items-center gap-4 px-4 h-11 border-t border-line text-xs text-ink3 shrink-0">
          <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
          <span className="flex items-center gap-1.5"><Kbd>Enter</Kbd> open</span>
          <span className="ml-auto">Searches schools only. Students, fees and staff are never searchable here.</span>
        </div>
      </div>
    </div>
  );
}

/* ======================= Console sign-in ======================= */
export function SuperAdminSignIn() {
  const { go } = useNav();
  const [as, setAs] = useState(START_ROLE);
  const person = SA_ROLES[as].person;
  const [step, setStep] = useState(1);
  const [id, setId] = useState(person.email);
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const [tries, setTries] = useState(5);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const boxes = useRef([]);

  const submit = (e) => {
    e.preventDefault();
    if (step === 1) {
      const er = {};
      if (!id.trim()) er.id = 'Enter your mobile number or email';
      if (!pw) er.pw = 'Enter your password';
      setErr(er);
      if (Object.keys(er).length) return;
      setBusy(true);
      setTimeout(() => {
        setBusy(false);
        if (pw.length < 6) { setTries((t) => t - 1); setErr({ pw: `That password doesn’t match. ${tries - 1} tries left, then a 15-minute pause keeps the console safe.` }); return; }
        setStep(2); setErr({}); setTimeout(() => boxes.current[0]?.focus(), 50);
      }, 800);
      return;
    }
    if (otp.join('').length < 6) { setErr({ otp: 'Enter all 6 digits' }); return; }
    setBusy(true);
    setTimeout(() => { setBusy(false); START_ROLE = as; go('sa', { page: 'dashboard' }); }, 800);
  };
  const setDigit = (i, v) => {
    const d = v.replace(/\D/g, '').slice(-1);
    const n = [...otp]; n[i] = d; setOtp(n); setErr({});
    if (d && i < 5) boxes.current[i + 1]?.focus();
  };

  return (
    <div className="h-full overflow-y-auto grid @lg:grid-cols-[1.05fr_1fr] bg-surface">
      {/* Brand side */}
      <div className="hidden @lg:flex relative overflow-hidden bg-brand text-brandink p-10 flex-col">
        <div className="absolute inset-0 dotgrid opacity-60" />
        <div className="absolute -left-24 -bottom-40 w-[520px] h-[520px] rounded-full border-[56px] border-white/[.07]" />
        <div className="relative flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl bg-white/15 grid place-items-center">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M5 14a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /><path d="M12 3.5v2M4.6 6.6l1.4 1.4M19.4 6.6 18 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /><path d="M3 17.5h18M6 21h12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
          </span>
          <span className="leading-tight"><span className="block font-display font-semibold text-lg">School OS Console</span><span className="block text-[13px] opacity-90">DREAM TEAM SERVICES</span></span>
        </div>
        <div className="relative mt-auto max-w-md">
          <h1 className="font-display text-[44px] font-semibold leading-[1.05] tracking-tight">Every school, from one calm console.</h1>
          <p className="mt-4 text-[16px] opacity-90 leading-relaxed">Add a school, hand over its first login, and help when a school asks. Student, fee and staff details stay inside each school.</p>
        </div>
        <div className="relative mt-10 flex flex-col gap-3 max-w-sm">
          <div className="self-start rounded-2xl bg-white/12 backdrop-blur px-4 py-3 flex items-center gap-3 animate-rise" style={{ animationDelay: '.1s' }}>
            <I.School size={20} /><span className="text-[14px]"><b>20 schools</b> · 14 active, 4 on trial</span>
          </div>
          <div className="self-end rounded-2xl bg-white/12 backdrop-blur px-4 py-3 flex items-center gap-3 animate-rise" style={{ animationDelay: '.25s' }}>
            <I.Send size={20} /><span className="text-[14px]">Invite sent to <b>the first School Admin</b></span>
          </div>
          <div className="self-start rounded-2xl bg-white/12 backdrop-blur px-4 py-3 flex items-center gap-3 animate-rise" style={{ animationDelay: '.4s' }}>
            <I.LifeBuoy size={20} /><span className="text-[14px]">Support access <b>only when the school allows</b></span>
          </div>
        </div>
      </div>

      {/* Form side */}
      <div className="flex flex-col px-5 py-8 @md:px-12 min-h-full">
        <div className="flex items-center gap-3 @lg:hidden"><Logo size={40} /><span className="leading-tight"><span className="block font-display font-semibold text-lg">School OS Console</span><span className="block text-[12.5px] text-ink3">DREAM TEAM SERVICES</span></span></div>
        <div className="my-auto w-full max-w-[400px] mx-auto py-10">
          <p className="text-[13px] font-semibold text-brand">DREAM TEAM SERVICES only</p>
          <h2 className="font-display text-[30px] font-semibold tracking-tight leading-tight mt-1">Console sign in</h2>
          <p className="text-ink3 mt-1.5 text-[15px]">This is a separate address from the schools’ sign-in page. School staff can never reach it.</p>
          <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-sunken px-3.5 py-2.5 text-[13.5px]">
            <I.Lock size={16} className="text-ok shrink-0" />
            <span className="min-w-0 flex-1 truncate"><b className="font-semibold">console.schoolos.in</b><span className="text-ink3"> · schools use app.schoolos.in</span></span>
          </div>

          <div className="mt-6 flex items-center gap-2 text-[12.5px] font-semibold" aria-label={`Step ${step} of 2`}>
            {['Password', 'One-time code'].map((l, i) => (
              <React.Fragment key={l}>
                {i > 0 && <span className="flex-1 h-px bg-line" />}
                <span className={cx('inline-flex items-center gap-1.5', step === i + 1 ? 'text-brand' : step > i + 1 ? 'text-ok' : 'text-ink3')}>
                  <span className={cx('w-6 h-6 rounded-full grid place-items-center text-[11.5px] font-bold tnum', step === i + 1 ? 'bg-brand text-brandink' : step > i + 1 ? 'bg-ok/15 text-ok' : 'bg-sunken text-ink3')}>{step > i + 1 ? <I.Check size={13} strokeWidth={3} /> : i + 1}</span>{l}
                </span>
              </React.Fragment>
            ))}
          </div>

          <form onSubmit={submit} noValidate className="mt-5 flex flex-col gap-4">
            {step === 1 ? (
              <>
                <Field label="Mobile number or email" id="sa-id" error={err.id}>
                  <Input id="sa-id" value={id} onChange={(e) => { setId(e.target.value); setErr({}); }} error={err.id} autoComplete="username" placeholder="98490 12345 or name@dreamteamservices.in" />
                </Field>
                <Field id="sa-pw" error={err.pw} label="Password">
                  <div className="relative">
                    <Input id="sa-pw" type={show ? 'text' : 'password'} value={pw} onChange={(e) => { setPw(e.target.value); setErr({}); }} error={err.pw} autoComplete="current-password" placeholder="Your password" className="pr-12" />
                    <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center rounded-lg text-ink3 hover:bg-sunken">
                      {show ? <I.EyeOff size={18} /> : <I.Eye size={18} />}
                    </button>
                  </div>
                </Field>
                <p className="text-[13.5px] text-ink2 rounded-xl bg-sunken p-3.5 flex gap-2.5"><I.ShieldCheck size={18} className="text-brand shrink-0 mt-0.5" />Two-step login is always on here. After your password, we send a one-time code to your phone.</p>
              </>
            ) : (
              <>
                <Field label={`6-digit code sent to +91 ${mask(person.phone)}`} id="sa-otp-0" error={err.otp} hint="Didn’t get it? You can ask again in 30 seconds.">
                  <div className="flex gap-2">
                    {otp.map((d, i) => (
                      <input key={i} id={`sa-otp-${i}`} ref={(el) => (boxes.current[i] = el)} value={d} inputMode="numeric" maxLength={1} aria-label={`Digit ${i + 1}`}
                        onChange={(e) => setDigit(i, e.target.value)} onKeyDown={(e) => e.key === 'Backspace' && !d && i > 0 && boxes.current[i - 1]?.focus()}
                        className={cx('w-full min-w-0 h-14 rounded-xl border bg-surface text-center text-[22px] font-semibold tnum outline-none transition', err.otp ? 'border-bad' : 'border-line focus:border-brand focus:ring-4 focus:ring-brand/15')} />
                    ))}
                  </div>
                </Field>
                <p className="text-[13px] text-ink3">Signing in as <b className="font-semibold text-ink2">{person.name}</b> on a new device. The console signs you out after 30 minutes without use.</p>
              </>
            )}
            <Button type="submit" variant="primary" size="lg" className="w-full mt-1" loading={busy}>
              {busy ? 'Checking…' : step === 1 ? 'Continue' : 'Verify and open console'}
            </Button>
            {step === 2 && (
              <button type="button" onClick={() => { setStep(1); setOtp(['', '', '', '', '', '']); setErr({}); }} className="text-[14px] font-semibold text-ink2 hover:text-ink h-10">Back to password</button>
            )}
          </form>

          <div className="mt-6 text-[12.5px] text-ink3 rounded-xl border border-dashed border-line p-3 flex flex-col gap-2.5">
            <p className="text-center">Design preview: any password with 6 or more characters works, then any 6 digits.</p>
            <label htmlFor="sa-as" className="font-semibold text-ink2">Sign in as</label>
            <div className="relative">
              <select id="sa-as" value={as} onChange={(e) => { setAs(e.target.value); setId(SA_ROLES[e.target.value].person.email); setErr({}); }}
                className="h-10 w-full appearance-none rounded-lg bg-surface border border-line pl-3 pr-9 text-[13.5px] text-ink font-semibold outline-none focus:border-brand cursor-pointer">
                {Object.values(SA_ROLES).map((r) => <option key={r.id} value={r.id}>{r.label} · {r.person.name}</option>)}
              </select>
              <I.ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-ink3" />
            </div>
            <p>Each console role sees only the buttons it may use. You can switch later from the profile menu.</p>
          </div>
          <button type="button" onClick={() => go('signin')} className="mt-4 w-full text-[13.5px] font-semibold text-ink2 hover:text-ink h-10 inline-flex items-center justify-center gap-1.5">
            Work in a school? Go to the school sign-in<I.ArrowRight size={15} />
          </button>
        </div>
        <p className="text-[12.5px] text-ink3 text-center flex items-center justify-center gap-1.5"><I.ShieldCheck size={14} />Every console action is written in the Activity Log</p>
      </div>
    </div>
  );
}

/* ======================= 3.1 Dashboard ======================= */
const ATTENTION = [
  { id: 'never', school: 'KHS-WGL-001', icon: 'MailWarning', tone: 'warn', title: 'Kakatiya High School: admin invite sent 3 days ago, not opened.', detail: 'Srinivas Goud · +91 98xxx xx407 · sent on WhatsApp and SMS by Ravi Kumar', action: 'Resend invite' },
  { id: 'expired', school: 'SMS-VSK-001', icon: 'MailX', tone: 'bad', title: 'Seashore Montessori School: invite link expired yesterday.', detail: 'Divya Raju · sent Mon 5 Oct, never opened', action: 'Send new invite' },
  { id: 'stuck', school: 'SMC-VJA-001', icon: 'Hourglass', tone: 'warn', title: 'St. Mary’s Convent: setup 3 of 10 steps, no change for 7 days.', detail: 'Stuck at Subjects · School Admin Sr. Grace Fernandes', action: 'Call the admin' },
  { id: 'trial', school: 'GVS-JAI-001', icon: 'CalendarClock', tone: 'info', title: 'Green Valley School: trial ends in 4 days.', detail: 'Ends Tue 13 Oct · setup 6 of 10 · 512 students · no plan chosen yet', action: 'Open school' },
  { id: 'grace', school: 'LSP-PUN-001', icon: 'ReceiptIndianRupee', tone: 'bad', title: 'Little Stars Pre-school, Kothrud: renewal unpaid, 6 days of grace left.', detail: 'Invoice DT/26-27/0036 · suspends by itself on 15 Oct if unpaid', action: 'Resend invoice' },
  { id: 'over', school: 'SXH-NAG-001', icon: 'UsersRound', tone: 'warn', title: 'St. Xavier’s High School: 468 active students, 400 paid for.', detail: '68 more than paid for (17%). Top-up is half the yearly rate for the rest of the year.', action: 'Make top-up invoice' },
  { id: 'access', school: 'HIS-BLR-001', icon: 'LifeBuoy', tone: 'info', title: 'Request to Harmony International School waiting for their answer.', detail: 'Asked by Neha Gupta at 10:58 AM · 1 hour · “Report card template shows wrong grades”', action: 'Open request' },
  { id: 'alert', icon: 'MessageCircleWarning', tone: 'bad', title: 'WhatsApp messages not going out for 12 minutes, 3 schools affected.', detail: 'Sunrise Public School, Green Valley School, Harmony International School', action: 'Open System alerts' },
];
const CHECKS = [
  ['Bug', 'Errors', 'Normal · 0.1% of requests in the last hour'],
  ['Gauge', 'Page speed', 'Normal · pages open in 0.8 s on average'],
  ['MessageCircle', 'WhatsApp', null],
  ['MessageSquareText', 'SMS', 'Working · 3,412 sent today'],
  ['CreditCard', 'Razorpay payments', 'Working · last payment 11:38 AM'],
  ['Workflow', 'Background jobs', '1,482 ran today, none failed'],
  ['DatabaseBackup', 'Last backup', 'Today, 11:45 AM (continuous) · nightly copy 2:00 AM'],
  ['ArchiveRestore', 'Last restore test', '1 Oct 2026 · passed, copy restored in 38 minutes'],
];

function Dashboard() {
  const { go } = useNav();
  const sa = useSA();
  const toast = useToast();
  const [setAsk, askEl] = useAsk();
  const [call, setCall] = useState(null);
  const [checking, setChecking] = useState(false);
  const [flash, setFlash] = useState(false);
  const alerts = useRef(null);
  const items = ATTENTION.filter((a) => !sa.done.has(a.id) && !(a.id === 'alert' && sa.alertFixed));
  const by = (st) => sa.schools.filter((s) => s.status === st).length;
  const activeStudents = sa.schools.filter((s) => s.status === 'Active').reduce((t, s) => t + s.students, 0);
  const newCount = sa.schools.filter(isNew).length;
  const done = (id) => sa.setDone((d) => new Set([...d, id]));
  const open = (id) => go('sa', { page: 'school', id });
  const showAlerts = () => { alerts.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); setFlash(true); setTimeout(() => setFlash(false), 1800); };

  const fix = (a) => {
    const s = a.school && sa.school(a.school);
    const adm = s && adminOf(s);
    if (a.id === 'never' || a.id === 'expired') {
      if (!sa.can('invite')) return open(a.school);
      return setAsk({ title: 'Send a new invite?', sub: s.name, label: `Send new invite to ${adm.name}`,
        body: <><p>A new link goes to <b className="text-ink">{adm.name}</b>, +91 {mask(adm.phone)}, on WhatsApp and SMS.</p><p>{a.id === 'never' ? 'The old link stops working.' : 'The expired link stays closed.'} The new one works for 3 days and needs the code sent to their mobile.</p></>,
        run: () => { sa.resendInvite(s.id, adm.id); done(a.id); } });
    }
    if (a.id === 'stuck') return setCall(s);
    if (a.id === 'trial') return open(a.school);
    if (a.id === 'grace') {
      if (!sa.can('invoice')) return open(a.school);
      return setAsk({ title: 'Resend the renewal invoice?', sub: `${s.name} · DT/26-27/0036`, label: `Resend invoice to ${adm.name}`,
        body: <><p>Invoice <b className="text-ink">DT/26-27/0036</b> for {inr(15336 + gstOf(15336))} goes again to <b className="text-ink">{adm.name}</b> and the Principal on WhatsApp and email, with its Razorpay payment link.</p><p>It marks itself paid when the payment arrives. If it is still unpaid on 15 Oct, the school becomes Suspended by itself.</p></>,
        run: () => { sa.log(`resent invoice DT/26-27/0036 to ${s.name}, to ${adm.name} and the Principal.`, { type: 'Billing', school: s.id }); toast({ title: 'Invoice DT/26-27/0036 sent again', body: `${adm.name} and the Principal · Razorpay link included` }); done(a.id); } });
    }
    if (a.id === 'over') {
      if (!sa.can('topup')) return open(a.school);
      const base = 68 * 60;
      const owner = sa.can('approve');
      return setAsk({ title: 'Make a top-up invoice?', sub: `${s.name} · 68 students above the 400 paid for`, label: owner ? `Make and send ${inr(base + gstOf(base))} invoice` : 'Make top-up invoice',
        body: <><p>68 students for the rest of the year at half the yearly rate (₹60 each): <b className="text-ink">{inr(base)} + GST {inr(gstOf(base))} = {inr(base + gstOf(base))}</b>.</p><p>{owner ? `It goes to ${adm.name} and the Principal with a Razorpay payment link.` : 'It waits for Kiran Reddy (Owner) to OK it before it is sent.'}</p></>,
        run: () => {
          const no = sa.nextNo();
          sa.addInvoice({ no, school: s.id, items: 'Top-up: 68 students above the 400 paid for, rest of the year at half rate (₹60 each)', base, gst: gstOf(base), date: '9 Oct 2026', due: '23 Oct 2026', status: owner ? 'Unpaid' : 'Waiting', topup: true });
          sa.log(`made top-up invoice ${no} for ${s.name}: 68 students above the 400 paid for.${owner ? ' Sent with a Razorpay link.' : ' Waiting for the Owner’s OK.'}`, { type: 'Billing', school: s.id });
          toast({ title: `Top-up invoice ${no} made`, body: owner ? `Sent to ${adm.name} and the Principal.` : 'Waiting for Kiran Reddy’s OK in Plans & Billing.' });
          done(a.id);
        } });
    }
    if (a.id === 'access') return go('sa', { page: 'support' });
    if (a.id === 'alert') return showAlerts();
    return null;
  };

  return (
    <div className="flex flex-col gap-5 @lg:gap-6">
      <div className="flex flex-col @md:flex-row @md:items-end justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-ink3">Friday, 9 October 2026 · DREAM TEAM SERVICES</p>
          <h1 className="font-display text-[26px] @md:text-[32px] font-semibold tracking-tight leading-tight mt-0.5">Good morning, {sa.me.first}</h1>
          <p className="text-[15px] text-ink3 mt-1">{items.length ? `${items.length} things need DREAM TEAM today, across ${sa.schools.length} schools.` : `Nothing needs DREAM TEAM right now, across ${sa.schools.length} schools.`}</p>
        </div>
        {sa.can('add')
          ? <Button variant="primary" size="lg" icon={I.Plus} className="w-full @md:w-auto" onClick={() => go('sa', { page: 'add' })}>Add School</Button>
          : <Button variant="secondary" size="lg" icon={I.LifeBuoy} className="w-full @md:w-auto" onClick={() => go('sa', { page: 'support' })}>Support Access</Button>}
      </div>

      <Split side={380}>
        <Col>
          <Card>
            <CardHead title="Needs attention" sub="One line per school. Each button fixes it." icon={I.Flag} action={items.length ? <Pill tone="bad">{items.length} items</Pill> : <Pill tone="ok">All clear</Pill>} />
            {items.length === 0 ? (
              <div className="px-5 pb-6 pt-1 text-center">
                <span className="mx-auto w-12 h-12 rounded-2xl bg-ok/10 text-ok grid place-items-center animate-pop"><I.Check size={24} strokeWidth={2.6} /></span>
                <p className="font-semibold mt-2.5">All done</p>
                <p className="text-[13px] text-ink3">No school needs DREAM TEAM right now.</p>
              </div>
            ) : (
              <ul className="px-2 pb-2">
                {items.map((a) => {
                  const label = (a.id === 'never' || a.id === 'expired') && !sa.can('invite') ? 'Open school'
                    : a.id === 'grace' && !sa.can('invoice') ? 'Open school' : a.id === 'over' && !sa.can('topup') ? 'Open school' : a.action;
                  return (
                    <li key={a.id}>
                      <div className="flex items-center gap-3.5 px-3 py-3 rounded-xl hover:bg-sunken/70 transition">
                        <span className={cx('w-10 h-10 rounded-xl grid place-items-center shrink-0', TONE_SOFT[a.tone])}><Icon name={a.icon} size={19} /></span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[14.5px] leading-snug">{a.title}</p>
                          <p className="text-[13px] text-ink3 truncate">{a.detail}</p>
                        </div>
                        <Button size="sm" variant="secondary" className="hidden @sm:inline-flex" onClick={() => fix(a)}>{label}</Button>
                        <button className="@sm:hidden w-9 h-9 grid place-items-center rounded-lg text-ink3" onClick={() => fix(a)} aria-label={label}><I.ChevronRight size={20} /></button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <section aria-label="Schools at a glance" className="flex flex-col gap-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="font-semibold text-[15px] leading-tight">Schools at a glance</h2>
                <p className="text-[13px] text-ink3 mt-0.5">Each number opens the Schools list with that filter</p>
              </div>
              <Button size="sm" variant="soft" icon={I.CalendarDays} onClick={() => go('sa', { page: 'schools', filter: 'new' })}>{newCount} new this month</Button>
            </div>
            <Band items={[
              { label: 'Trial', big: by('Trial'), foot: 'Green Valley ends in 4 days', onClick: () => go('sa', { page: 'schools', status: 'Trial' }) },
              { label: 'Active', big: by('Active'), foot: `${num(activeStudents)} students`, onClick: () => go('sa', { page: 'schools', status: 'Active' }) },
              { label: 'Suspended', big: by('Suspended'), foot: 'Trial ended unpaid', onClick: () => go('sa', { page: 'schools', status: 'Suspended' }) },
              { label: 'Closed', big: by('Closed'), foot: 'Data kept 90 days', onClick: () => go('sa', { page: 'schools', status: 'Closed' }) },
            ]} />
          </section>
        </Col>

        <Col>
          <div ref={alerts} className="scroll-mt-4">
            <Card className={cx('transition', flash && 'ring-2 ring-brand')}>
              <CardHead title="System alerts" sub={sa.alertFixed ? 'Everything is working' : '1 problem right now. The rest is fine.'} icon={I.Activity}
                action={<Pill tone={sa.alertFixed ? 'ok' : 'bad'} dot>{sa.alertFixed ? 'All well' : '1 problem'}</Pill>} />
              {!sa.alertFixed && (
                <div className="mx-5 mb-3 rounded-xl bg-bad/10 p-3.5">
                  <p className="font-semibold text-[14px] flex items-center gap-2 text-bad"><I.MessageCircleWarning size={17} className="shrink-0" />WhatsApp messages not going out</p>
                  <p className="text-[13px] text-ink2 mt-1 leading-relaxed">For 12 minutes, since 10:35 AM. The WhatsApp provider is not answering. 214 messages wait in the queue and go out by themselves when it is back; senders see “Waiting to send”.</p>
                  <p className="text-[13px] text-ink2 mt-1.5"><b className="font-semibold text-ink">3 schools affected:</b> Sunrise Public School, Green Valley School, Harmony International School.</p>
                  <Button size="sm" variant="secondary" icon={I.RefreshCw} className="mt-3" loading={checking}
                    onClick={() => { setChecking(true); setTimeout(() => { setChecking(false); sa.setAlertFixed(true); toast({ title: 'WhatsApp is working again', body: 'The 214 waiting messages are going out now.' }); }, 900); }}>
                    {checking ? 'Checking…' : 'Check again'}
                  </Button>
                </div>
              )}
              <ul className="px-2 pb-2">
                {CHECKS.map(([ic, label, val]) => {
                  const badNow = label === 'WhatsApp' && !sa.alertFixed;
                  return (
                    <li key={label} className="flex items-center gap-3 px-3 py-2 rounded-xl">
                      <span className={cx('w-8 h-8 rounded-lg grid place-items-center shrink-0', badNow ? 'bg-bad/10 text-bad' : 'bg-sunken text-ink2')}><Icon name={ic} size={16} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-semibold leading-tight">{label}</p>
                        <p className="text-[12px] text-ink3 truncate">{val || (badNow ? 'Not going out · 214 waiting' : 'Working · queue cleared just now')}</p>
                      </div>
                      {badNow ? <I.CircleAlert size={17} className="text-bad shrink-0" /> : <I.CircleCheck size={17} className="text-ok shrink-0" />}
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>

          <Card>
            <CardHead title="Recent activity" sub="The last 10 lines of the Activity Log" icon={I.ScrollText}
              action={<button onClick={() => go('sa', { page: 'activity' })} className="text-[13px] font-semibold text-brand hover:underline">Open</button>} />
            <ul className="px-2 pb-2">
              {sa.logs.slice(0, 10).map((l) => {
                const [ic, tone] = LOG_TYPES[l.type] || ['Circle', 'neutral'];
                return (
                  <li key={l.id} className="flex gap-3 px-3 py-2.5">
                    <span className={cx('w-8 h-8 rounded-lg grid place-items-center shrink-0', TONE_SOFT[tone])}><Icon name={ic} size={15} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] leading-snug"><b className="font-semibold">{l.who}</b>{l.role ? ` (${l.role})` : ':'} {l.text}</p>
                      <p className="text-[12px] text-ink3 mt-0.5 tnum">{l.date === '9 Oct 2026' ? 'Today' : l.date}, {l.time}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </Col>
      </Split>
      {askEl}
      <CallSheet school={call} onClose={() => setCall(null)} />
    </div>
  );
}

function CallSheet({ school: s, onClose }) {
  const sa = useSA();
  const toast = useToast();
  const [note, setNote] = useState('');
  useEffect(() => { if (s) setNote(''); }, [s]);
  const a = s && adminOf(s);
  const next = s && STEPS.findIndex((_, i) => !setupDone(s).includes(i));
  return (
    <Sheet open={!!s} onClose={onClose} title={s ? `Call ${a.name}` : ''} sub={s ? `School Admin, ${s.name}` : ''}>
      {s && (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl bg-sunken p-4 flex items-center gap-3">
            <span className="w-11 h-11 rounded-xl bg-brand/10 text-brand grid place-items-center shrink-0"><I.PhoneCall size={20} /></span>
            <div className="flex-1 min-w-0">
              <p className="font-display text-[22px] font-semibold tnum select-all leading-tight">+91 {a.phone}</p>
              <p className="text-[12.5px] text-ink3 truncate">{a.note.split(' · ')[0]}</p>
            </div>
            <Button size="sm" variant="secondary" icon={I.Copy} onClick={() => toast({ title: 'Number copied', body: `+91 ${a.phone}`, tone: 'info' })}>Copy</Button>
          </div>
          <ul className="flex flex-col gap-2.5 text-[14px]">
            <li className="flex gap-3"><I.ListChecks size={18} className="text-ink3 shrink-0 mt-0.5" /><span>Setup <b className="font-semibold">{setupCount(s)} of 10</b>{next >= 0 && <> · next step: {STEPS[next]}</>}</span></li>
            {s.stuck && <li className="flex gap-3"><I.Hourglass size={18} className="text-warn shrink-0 mt-0.5" /><span>No change for <b className="font-semibold">{s.stuck} days</b></span></li>}
            {s.notes[0] && <li className="flex gap-3"><I.StickyNote size={18} className="text-ink3 shrink-0 mt-0.5" /><span>Last team note: “{s.notes[0].text}” <span className="text-ink3">· {s.notes[0].by}</span></span></li>}
          </ul>
          <Field label="Note after the call" id="call-note" hint="Visible only inside DREAM TEAM.">
            <Textarea id="call-note" value={note} onChange={setNote} rows={2} placeholder="Spoke to Sister Grace. She will add subjects by Monday." />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <Button variant="primary" icon={I.Check} disabled={!note.trim()} onClick={() => { sa.addNote(s.id, note.trim()); onClose(); }}>Save note</Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/* ======================= 3.2 Schools ======================= */
function SchoolsPage({ params }) {
  const { go } = useNav();
  const sa = useSA();
  const toast = useToast();
  const [setAsk, askEl] = useAsk();
  const [status, setStatus] = useState(params.status || (params.filter === 'new' ? 'new' : 'all'));
  const [q, setQ] = useState('');
  const [board, setBoard] = useState('all');
  const [prog, setProg] = useState('all');
  const [city, setCity] = useState('all');
  const [by, setBy] = useState('all');
  const [more, setMore] = useState(false);
  const [sel, setSel] = useState(new Set());
  const list = sa.schools;
  const cnt = (st) => list.filter((s) => (st === 'new' ? isNew(s) : s.status === st)).length;
  const rows = list.filter((s) => {
    const t = q.trim().toLowerCase().replace(/\s/g, '');
    const n = setupCount(s);
    const signed = adminState(s).tone === 'ok';
    return (status === 'all' || (status === 'new' ? isNew(s) : s.status === status)) &&
      (board === 'all' || s.board === board) && (city === 'all' || s.city === city) && (by === 'all' || s.addedBy === by) &&
      (prog === 'all' || (prog === 'notsigned' ? !signed : prog === 'low' ? n < 5 : prog === 'mid' ? n >= 5 && n < 10 : n === 10)) &&
      (!t || [s.name, s.city, s.area, s.id, s.phone, ...s.admins.map((a) => a.name + a.phone)].join(' ').toLowerCase().replace(/\s/g, '').includes(t));
  });
  const extra = (city !== 'all') + (by !== 'all');
  const allOn = rows.length > 0 && rows.every((s) => sel.has(s.id));
  const toggle = (id) => setSel((x) => { const n = new Set(x); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clear = () => { setQ(''); setStatus('all'); setBoard('all'); setProg('all'); setCity('all'); setBy('all'); };
  const open = (s) => go('sa', { page: 'school', id: s.id });
  const bulkResend = () => {
    const pend = [...sel].map((id) => sa.school(id)).filter((s) => s.status !== 'Closed' && !s.admins.some((a) => a.status === 'Active') && s.admins.some((a) => a.status === 'Invited' || a.status === 'Expired'));
    if (!pend.length) return toast({ title: 'Nothing to resend', body: 'Every selected school already has an admin who signed in.', tone: 'info' });
    return setAsk({ title: `Resend ${pend.length} admin invite${pend.length > 1 ? 's' : ''}?`, label: `Send ${pend.length} new invite${pend.length > 1 ? 's' : ''}`,
      body: <><p>A new link goes on WhatsApp and SMS to:</p><ul className="flex flex-col gap-1">{pend.map((s) => { const a = s.admins.find((x) => x.status !== 'Disabled'); return <li key={s.id}>· <b className="text-ink">{a.name}</b>, +91 {mask(a.phone)} <span className="text-ink3">({s.name})</span></li>; })}</ul><p>Old links stop working.</p></>,
      run: () => { pend.forEach((s) => sa.resendInvite(s.id, s.admins.find((x) => x.status !== 'Disabled').id)); setSel(new Set()); } });
  };
  const cities = [...new Set(list.map((s) => s.city))].sort();
  const adders = [...new Set(list.map((s) => s.addedBy))].sort();

  return (
    <div>
      <PageHead title="Schools" sub={`${list.length} schools · ${cnt('new')} added this month`}
        actions={<><ExportBtn what={`${rows.length} schools`} file="schools-9-Oct-2026.xlsx" />{sa.can('add') && <Button variant="primary" icon={I.Plus} onClick={() => go('sa', { page: 'add' })}>Add School</Button>}</>} />
      <Chips value={status} onChange={(v) => { setStatus(v); setSel(new Set()); }} options={[
        { value: 'all', label: 'All schools', count: list.length }, { value: 'Trial', label: 'Trial', count: cnt('Trial') }, { value: 'Active', label: 'Active', count: cnt('Active') },
        { value: 'Suspended', label: 'Suspended', count: cnt('Suspended') }, { value: 'Closed', label: 'Closed', count: cnt('Closed') }, { value: 'new', label: 'New this month', count: cnt('new') },
      ]} />
      <Card className="mt-4 overflow-hidden">
        <Toolbar>
          <div className="flex gap-2 flex-1 min-w-0">
            <SearchBox id="sa-school-search" value={q} onChange={setQ} placeholder="School name, city, phone or school code" />
            <Button variant="secondary" icon={I.SlidersHorizontal} onClick={() => setMore(true)} className="h-11 !px-3 @md:hidden" aria-label="More filters">{extra ? extra : null}</Button>
          </div>
          <div className="grid grid-cols-2 gap-2.5 @md:flex">
            <Select id="sa-board" value={board} onChange={setBoard} className="@md:w-40" options={[{ value: 'all', label: 'All boards' }, ...BOARDS]} />
            <Select id="sa-prog" value={prog} onChange={setProg} className="@md:w-52" options={[{ value: 'all', label: 'Any setup progress' }, { value: 'notsigned', label: 'Admin not signed in' }, { value: 'low', label: 'Setup under 5 of 10' }, { value: 'mid', label: 'Setup 5 to 9 of 10' }, { value: 'done', label: 'Setup done' }]} />
          </div>
          <Button variant="secondary" icon={I.SlidersHorizontal} onClick={() => setMore(true)} className="h-11 hidden @md:inline-flex">More filters{extra ? ` · ${extra}` : ''}</Button>
        </Toolbar>
        <BulkBar count={sel.size} onClear={() => setSel(new Set())}>
          {sa.can('invite') && <Button size="sm" variant="secondary" icon={I.Send} onClick={bulkResend}>Resend admin invites</Button>}
          <Button size="sm" variant="secondary" icon={I.Download} onClick={() => toast({ title: `Exported ${sel.size} schools`, body: 'schools-selected.xlsx · counts only, never student details' })}>Export</Button>
        </BulkBar>
        {rows.length === 0 ? (
          <Empty icon={I.SearchX} title="No schools match" body={q ? `Nothing for “${q}”. Try the school code, like SPS-HYD-001, or the school’s phone.` : 'Try a different status or filter.'}
            action={<Button variant="secondary" onClick={clear}>Clear filters</Button>} />
        ) : (
          <>
            <div className="hidden @lg:block overflow-x-auto scroll-thin">
              <table className="w-full text-left text-[14px]" style={{ minWidth: 1000 }}>
                <thead>
                  <tr className="text-[12px] text-ink3 font-semibold border-b border-line">
                    <th className="pl-4 pr-2 py-3 w-10"><Checkbox label="Select all" checked={allOn} indeterminate={!allOn && rows.some((s) => sel.has(s.id))} onChange={() => setSel(allOn ? new Set() : new Set(rows.map((s) => s.id)))} /></th>
                    {['School', 'City and board', 'Status', 'School Admin', 'Setup'].map((h) => <th key={h} className="px-3 py-3 font-semibold whitespace-nowrap">{h}</th>)}
                    <th className="px-3 py-3 font-semibold text-right">Students</th>
                    <th className="px-3 pr-5 py-3 font-semibold">Added</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => {
                    const st = adminState(s);
                    const a = adminOf(s);
                    const n = setupCount(s);
                    return (
                      <tr key={s.id} onClick={() => open(s)} className={cx('border-b border-line/70 last:border-0 cursor-pointer transition group', sel.has(s.id) ? 'bg-brand/5' : 'hover:bg-sunken/60')}>
                        <td className="pl-4 pr-2 py-3"><Checkbox label={`Select ${s.name}`} checked={sel.has(s.id)} onChange={() => toggle(s.id)} /></td>
                        <td className="px-3 py-2.5 min-w-[270px]">
                          <div className="flex items-center gap-3">
                            <SchoolLogo name={s.name} size={38} />
                            <div className="min-w-0"><p className="font-semibold leading-tight">{s.name}</p><p className="text-[12px] text-ink3 font-mono">{s.id}</p></div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap"><p className="leading-tight">{s.city}</p><p className="text-[12.5px] text-ink3">{s.board}</p></td>
                        <td className="px-3 py-2.5"><StatusPill s={s} /><p className={cx('text-[12px] mt-1 whitespace-nowrap', s.sub?.status === 'In grace' ? 'text-warn font-semibold' : 'text-ink3')}>{statusSub(s)}</p></td>
                        <td className="px-3 py-2.5"><p className="leading-tight whitespace-nowrap">{a.name}</p><p className={cx('text-[12.5px] font-semibold', TONE_TEXT[st.tone] || 'text-ink3')}>{st.label}</p></td>
                        <td className="px-3 py-2.5"><div className="flex items-center gap-2.5 w-28"><Progress value={n * 10} tone={n === 10 ? 'ok' : s.stuck ? 'warn' : 'brand'} className="flex-1" /><span className="text-[13px] font-semibold tnum whitespace-nowrap">{n} of 10</span></div></td>
                        <td className="px-3 py-2.5 text-right tnum font-semibold">{s.students ? num(s.students) : <span className="text-ink3 font-normal">—</span>}</td>
                        <td className="px-3 pr-5 py-2.5 whitespace-nowrap"><p>{s.added}</p><p className="text-[12.5px] text-ink3">by {s.addedBy}</p></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ul className="@lg:hidden divide-y divide-line/70">
              {rows.map((s) => {
                const st = adminState(s);
                const a = adminOf(s);
                return (
                  <li key={s.id}>
                    <button onClick={() => open(s)} className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-sunken">
                      <SchoolLogo name={s.name} size={44} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[15px] truncate">{s.name}</p>
                        <p className="text-[13px] text-ink3 truncate">{s.city} · {s.board} · {a.name}</p>
                        <div className="flex gap-1.5 mt-1.5 flex-wrap">
                          <StatusPill s={s} className="!h-[22px] !text-[11.5px]" />
                          <Pill tone={st.tone} className="!h-[22px] !text-[11.5px]">{st.label}</Pill>
                          <Pill tone="neutral" className="!h-[22px] !text-[11.5px]">Setup {setupCount(s)} of 10</Pill>
                        </div>
                      </div>
                      <div className="text-right shrink-0"><p className="font-semibold tnum text-[14.5px]">{s.students ? num(s.students) : '—'}</p><p className="text-[11.5px] text-ink3">students</p></div>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-line text-[13px] text-ink3">
              <span className="tnum">Showing {rows.length} of {list.length}</span>
              <span className="hidden @md:inline">Counts only. Student names, fees and salaries stay inside each school.</span>
            </div>
          </>
        )}
      </Card>
      <Sheet open={more} onClose={() => setMore(false)} title="More filters" sub="Narrow the Schools list">
        <div className="flex flex-col gap-4">
          <Field label="City" id="sa-f-city"><Select id="sa-f-city" value={city} onChange={setCity} options={[{ value: 'all', label: 'Any city' }, ...cities]} /></Field>
          <Field label="Added by" id="sa-f-by"><Select id="sa-f-by" value={by} onChange={setBy} options={[{ value: 'all', label: 'Anyone in DREAM TEAM' }, ...adders]} /></Field>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="ghost" onClick={() => { setCity('all'); setBy('all'); }}>Clear</Button>
            <Button variant="primary" onClick={() => setMore(false)}>Show {rows.length} schools</Button>
          </div>
        </div>
      </Sheet>
      {askEl}
    </div>
  );
}

/* ======================= 3.3 One school's page ======================= */
function SchoolPage({ params }) {
  const { go } = useNav();
  const sa = useSA();
  const toast = useToast();
  const s = sa.school(params.id) || sa.school('SPS-HYD-001');
  const [setAsk, askEl] = useAsk();
  const [sheet, setSheet] = useState(null);
  const [target, setTarget] = useState(null);
  const [call, setCall] = useState(null);
  const [note, setNote] = useState('');
  const close = () => setSheet(null);
  const can = sa.can;
  const actives = s.admins.filter((a) => a.status === 'Active');
  const done = setupDone(s);
  const n = done.length;
  const nextStep = STEPS.findIndex((_, i) => !done.includes(i));
  const inv = sa.invoices.filter((i) => i.school === s.id);
  const open = s.status === 'Active' || s.status === 'Trial';
  const primaryAdmin = adminOf(s);
  const over = s.sub && s.students > s.sub.paid;

  const changeStatus = (to, reason, more = {}) => {
    const from = s.status;
    const ICON = { Active: ['CirclePlay', 'ok'], Suspended: ['CirclePause', 'warn'], Closed: ['Archive', 'neutral'] };
    sa.updateSchool(s.id, (x) => ({ status: to, ...more,
      history: [{ icon: ICON[to][0], tone: ICON[to][1], what: <>{from} → <b>{to}</b> by {sa.me.name}{reason ? <>: “{reason}”</> : '.'}</>, when: 'Today' }, ...historyOf(x)] }));
    sa.log(`changed ${s.name}’s status${reason ? `: “${reason}”` : '.'}`, { type: 'Status', school: s.id, change: [from, to] });
  };
  const activate = () => {
    const nn = Math.max(s.students || s.approx || 0, 100);
    const base = yearly('Essential', nn);
    setAsk({ title: `Activate ${s.name}?`, sub: 'Trial → Active', label: 'Activate and send first invoice',
      body: <><p>The trial ends today and the school becomes <b className="text-ink">Active</b> on Essential.</p><p>The first invoice, Essential for {num(nn)} students: <b className="text-ink">{inr(base)} + GST {inr(gstOf(base))} = {inr(base + gstOf(base))}</b>, goes to {primaryAdmin.name} and the Principal with a Razorpay payment link.</p></>,
      run: () => {
        const no = sa.nextNo();
        changeStatus('Active', '', { trialEnds: null, act: '9 Oct 2026', sub: { plan: 'Essential', addons: [], paid: nn, renewal: '9 Oct 2027', halves: false, status: 'Due', credits: 2000 } });
        sa.addInvoice({ no, school: s.id, items: `First year: Essential, ${num(nn)} students`, base, gst: gstOf(base), date: '9 Oct 2026', due: '16 Oct 2026', status: 'Unpaid' });
        toast({ title: `${s.name} is Active`, body: `Invoice ${no} sent with a Razorpay link.` });
      } });
  };
  const reactivate = () => setAsk({ title: `Reactivate ${s.name}?`, sub: 'Suspended → Active', label: 'Reactivate school',
    body: <><p>Everyone can sign in again and everything comes back unchanged. Parents’ messages and payment links start again.</p><p>Paying the overdue invoice does this by itself; use this only when the Owner agrees to wait for the payment.</p></>,
    run: () => { changeStatus('Active', '', { since: undefined }); toast({ title: `${s.name} is Active again`, body: 'Its admins have been told.' }); } });
  const reopen = () => setAsk({ title: `Reopen ${s.name}?`, sub: `Within the keep period, until ${s.keepUntil}`, label: 'Reopen school',
    body: <p>The school’s data is still kept, so everything comes back as it was on the day it closed. Its admin logins stay disabled until you send new invites.</p>,
    run: () => { changeStatus('Active', '', { keepUntil: undefined }); toast({ title: `${s.name} reopened`, body: 'Send a new admin invite from School Admin logins.' }); } });
  const adminAct = (a, kind) => {
    if (kind === 'resend') return setAsk({ title: 'Send a new invite?', sub: s.name, label: `Send new invite to ${a.name}`,
      body: <><p>A new link goes to <b className="text-ink">{a.name}</b>, +91 {mask(a.phone)}, on WhatsApp and SMS.</p><p>The old link stops working. The new one works for 3 days and needs the code sent to their mobile.</p></>,
      run: () => sa.resendInvite(s.id, a.id) });
    if (kind === 'cancel') return setAsk({ title: 'Cancel this invite?', sub: s.name, label: 'Cancel invite', danger: true,
      body: <p>The link to <b className="text-ink">{a.name}</b>, +91 {mask(a.phone)}, stops working, and the login is removed before anyone used it.</p>,
      run: () => {
        sa.updateSchool(s.id, (x) => ({ admins: x.admins.filter((y) => y.id !== a.id) }));
        sa.log(`cancelled the admin invite to ${a.name}, +91 ${mask(a.phone)}, at ${s.name}.`, { type: 'Invite', school: s.id, change: ['Invited', 'Cancelled'] });
        toast({ title: `Invite to ${a.name} cancelled`, body: 'The link no longer works.' });
      } });
    if (kind === 'reset') return setAsk({ title: `Reset ${a.name}’s login?`, sub: s.name, label: 'Send reset link',
      body: <><p>A reset link goes to their mobile, +91 {mask(a.phone)}. Their old password stops working at once.</p><p>They set a new password themselves. DREAM TEAM never sees it.</p></>,
      run: () => {
        sa.updateSchool(s.id, (x) => ({ admins: x.admins.map((y) => (y.id === a.id ? { ...y, note: `Reset link sent today by ${sa.me.name} · ${y.note.split(' · ').pop()}` } : y)) }));
        sa.log(`reset the login of ${a.name} at ${s.name}. A reset link went to +91 ${mask(a.phone)}.`, { type: 'Admin login', school: s.id });
        toast({ title: `Reset link sent to ${a.name}`, body: `+91 ${mask(a.phone)} · the old password stopped working` });
      } });
    if (kind === 'disable') {
      if (a.status === 'Active' && actives.length === 1) return setSheet('last');
      setTarget(a); return setSheet('disable');
    }
    if (kind === 'phone') { setTarget(a); return setSheet('phone'); }
    return null;
  };

  const headActions = [];
  if (s.status === 'Trial' && can('activate')) headActions.push(<Button key="act" variant="primary" icon={I.CirclePlay} className="flex-1 @lg:flex-none" onClick={activate}>Activate</Button>);
  if (s.status === 'Suspended' && can('status')) headActions.push(<Button key="re" variant="primary" icon={I.CirclePlay} className="flex-1 @lg:flex-none" onClick={reactivate}>Reactivate</Button>);
  if (s.status === 'Closed' && can('status')) headActions.push(<Button key="reo" variant="primary" icon={I.ArchiveRestore} className="flex-1 @lg:flex-none" onClick={reopen}>Reopen</Button>);
  if (open && can('support')) headActions.push(<Button key="sup" variant={headActions.length ? 'secondary' : 'primary'} icon={I.LifeBuoy} className="flex-1 @lg:flex-none" onClick={() => setSheet('support')}>Request support access</Button>);
  if (s.status === 'Active' && can('invoice') && headActions.length < 2) headActions.push(<Button key="inv" variant="secondary" icon={I.Send} className="flex-1 @lg:flex-none" onClick={() => setSheet('invoice')}>Send invoice</Button>);
  const menu = [
    [I.StickyNote, 'Add a note', () => document.getElementById('sa-note')?.focus()],
    [I.Copy, 'Copy school code', () => toast({ title: `Copied ${s.id}`, tone: 'info' })],
    ...(can('group') && s.status !== 'Closed' ? [[I.Network, 'Set the school’s Group', () => setSheet('group')]] : []),
    ...(can('plan') && s.sub && s.status !== 'Closed' ? [[I.Layers, 'Change plan', () => setSheet('plan')]] : []),
    ...(can('invoice') && s.status !== 'Closed' && !headActions.some((b) => b.key === 'inv') ? [[I.Send, 'Send an invoice', () => setSheet('invoice')]] : []),
    ...(can('status') && open ? [[I.CirclePause, 'Suspend school', () => setSheet('suspend'), 'bad']] : []),
    ...(can('status') && (s.status === 'Active' || s.status === 'Suspended') ? [[I.Archive, 'Close school', () => setSheet('close'), 'bad']] : []),
  ];
  const banner = s.status === 'Trial' ? { tone: 'info', title: `Trial: ${s.trialLeft} days left, ends ${s.trialEnds}.`, body: 'Everything in Essential, 500 message credits. The school picks its plan when it pays; unpaid, it becomes Suspended by itself and its data is kept 90 days.' }
    : s.status === 'Suspended' ? { tone: 'warn', title: `Suspended since ${s.since}: the trial ended unpaid.`, body: `Staff cannot sign in; the School Admin can only pay or download the data. Paying invoice DT/26-27/0044 reactivates the school at once. Data kept until ${s.keepUntil}.` }
      : s.status === 'Closed' ? { tone: 'neutral', title: 'Closed on 14 Aug 2026.', body: `Nobody can sign in. The admin can download all of the school’s data until ${s.keepUntil}; then it is removed with the Owner’s approval.` }
        : s.sub?.status === 'In grace' ? { tone: 'warn', title: `Renewal unpaid: ${s.sub.grace} days of grace left.`, body: 'Everything still works, with a banner for the School Admin and Principal only. If unpaid on 15 Oct, the school becomes Suspended by itself.' } : null;

  return (
    <div>
      <BackLink label="Schools" extra={s.city} />
      <Card>
        <div className="h-16 @md:h-20 rounded-t-2xl bg-gradient-to-r from-brand to-brand/60 relative"><div className="absolute inset-0 rounded-t-2xl dotgrid opacity-50" /></div>
        <div className="relative px-4 @md:px-6 pb-5 flex flex-col @lg:flex-row @lg:items-end gap-4">
          <div className="flex flex-col @md:flex-row @md:items-end gap-3 @md:gap-4 min-w-0 flex-1">
            <div className="self-start rounded-[20px] p-1 bg-surface shrink-0 -mt-10 @md:-mt-12"><SchoolLogo name={s.name} size={84} /></div>
            <div className="min-w-0 @md:pt-3">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display text-[24px] @md:text-[28px] font-semibold tracking-tight leading-tight">{s.name}</h1>
                <StatusPill s={s} />
                {s.founding && <Pill tone="brand"><I.Award size={13} />Founding school</Pill>}
              </div>
              <p className="text-[13.5px] text-ink3 mt-0.5"><span className="font-mono text-[12.5px] text-ink2">{s.id}</span> · {s.area ? `${s.area}, ` : ''}{s.city} · {s.board} · {s.type}{s.group ? ` · ${s.group}` : ''}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 relative">
            {headActions}
            <MoreMenu items={menu} label="More actions for this school" />
          </div>
        </div>
        <div className="grid grid-cols-2 @md:grid-cols-3 @xl:grid-cols-6 border-t border-line">
          {[
            { k: 'Students', v: s.students ? num(s.students) : '—', sub: s.students ? 'Active today' : s.approx ? `About ${num(s.approx)} expected` : 'Not imported yet', icon: I.GraduationCap },
            { k: 'Staff logins', v: num(s.staffLogins), sub: 'Made by the school', icon: I.KeyRound },
            { k: 'Last sign-in', v: s.lastAny.split(',')[0], sub: s.lastAny.includes(',') ? s.lastAny.split(', ').slice(1).join(', ') : 'By anyone in the school', icon: I.LogIn },
            { k: 'Messages', v: num(s.msgs), sub: 'Sent this month', icon: I.MessageCircle },
            { k: 'Modules on', v: `${s.modules} of 20`, sub: s.optional, icon: I.LayoutGrid },
            { k: 'Setup', v: `${n} of 10`, sub: n === 10 ? 'Done' : s.stuck ? `No change for ${s.stuck} days` : 'In progress', icon: I.ListChecks, tone: n === 10 ? 'ok' : s.stuck ? 'warn' : null },
          ].map((m, i) => (
            <div key={m.k} className={cx('px-4 @md:px-5 py-3.5 border-line min-w-0', 'border-b @xl:border-b-0', i % 2 === 0 && 'border-r', '@md:border-r', i === 5 && '@xl:border-r-0')}>
              <p className="text-[12px] text-ink3 font-semibold flex items-center gap-1.5"><m.icon size={14} />{m.k}</p>
              <p className={cx('font-semibold text-[17px] tnum mt-0.5 truncate', m.tone && TONE_TEXT[m.tone])}>{m.v}</p>
              <p className="text-[12px] text-ink3 truncate">{m.sub}</p>
            </div>
          ))}
        </div>
      </Card>

      {banner && <Banner tone={banner.tone === 'neutral' ? 'info' : banner.tone} icon={banner.tone === 'neutral' ? 'Archive' : undefined} title={banner.title} className="mt-5">{banner.body}</Banner>}

      <Split side={380} className="mt-5">
        <Col>
          <Card>
            <CardHead title="School Admin logins" sub={`${actives.length} active · DREAM TEAM never sees or sets a password`} icon={I.KeyRound}
              action={can('invite') && s.status !== 'Closed' ? <Button size="sm" variant="soft" icon={I.UserPlus} onClick={() => setSheet('admin')}>Add<span className="hidden @sm:inline">another School Admin</span></Button> : null} />
            <ul>
              {s.admins.map((a) => {
                const last = a.status === 'Active' && actives.length === 1;
                const live = s.status !== 'Closed';
                return (
                  <li key={a.id} className="flex flex-col gap-2.5 px-5 py-3.5 border-t border-line/70">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <Avatar name={a.name} size={40} />
                      <div className="min-w-0">
                        <p className="font-semibold text-[14.5px] leading-tight flex items-center gap-2 flex-wrap">{a.name}<Pill tone={ADMIN_TONE[a.status]} className="!h-5 !text-[11px]">{ADMIN_LABEL[a.status]}</Pill></p>
                        <p className="text-[12.5px] text-ink3 tnum mt-0.5 break-words">{a.role} · +91 {a.phone}{a.email ? ` · ${a.email}` : ''}</p>
                        <p className="text-[12.5px] text-ink3">{a.status === 'Active' && a.note.startsWith('Last') ? `Signed in · ${a.note}` : a.note}</p>
                        {last && live && <p className="text-[12px] text-ink3 flex items-center gap-1 mt-0.5"><I.Lock size={12} className="shrink-0" />The last active admin cannot be disabled</p>}
                      </div>
                    </div>
                    {live && (
                      <div className="flex gap-2 flex-wrap pl-[52px]">
                        {(a.status === 'Invited' || a.status === 'Expired') && can('invite') && <>
                          <Button size="sm" variant="secondary" icon={I.Send} onClick={() => adminAct(a, 'resend')}>{a.status === 'Expired' ? 'Send new invite' : 'Resend invite'}</Button>
                          <Button size="sm" variant="ghost" onClick={() => adminAct(a, 'cancel')}>Cancel invite</Button>
                        </>}
                        {a.status === 'Active' && can('reset') && <Button size="sm" variant="secondary" icon={I.KeyRound} onClick={() => adminAct(a, 'reset')}>Reset login</Button>}
                        {a.status === 'Active' && can('disable') && <Button size="sm" variant="ghost" icon={last ? I.Lock : I.UserX} onClick={() => adminAct(a, 'disable')}>Disable</Button>}
                        {a.status === 'Active' && can('reset') && <Button size="sm" variant="ghost" icon={I.Smartphone} onClick={() => adminAct(a, 'phone')}>Change number</Button>}
                      </div>
                    )}
                  </li>
                );
              })}
              {s.admins.length === 0 && <li className="border-t border-line/70"><Empty icon={I.UserX} title="No School Admin" body="Add a School Admin so the school can sign in and set itself up." action={can('invite') ? <Button variant="primary" icon={I.UserPlus} onClick={() => setSheet('admin')}>Add a School Admin</Button> : null} /></li>}
            </ul>
            <p className="px-5 py-3 border-t border-line/70 text-[12.5px] text-ink3">Other logins (Principal, Accountant, Teachers and the rest) belong to the school’s own Settings, Users & Permissions. The console cannot see or change them.</p>
          </Card>

          <Card>
            <CardHead title="Setup progress" sub="The same checklist the school sees on its Dashboard" icon={I.ListChecks} action={<Pill tone={n === 10 ? 'ok' : s.stuck ? 'warn' : 'info'}>{n} of 10</Pill>} />
            <div className="px-5 pb-3"><Progress value={n * 10} tone={n === 10 ? 'ok' : s.stuck ? 'warn' : 'brand'} /></div>
            {s.stuck && (
              <div className="mx-5 mb-3 rounded-xl bg-warn/12 px-3.5 py-3 flex flex-col @sm:flex-row @sm:items-center gap-2.5 text-[13.5px]">
                <p className="flex-1 text-ink2"><b className="font-semibold text-ink">No change for {s.stuck} days.</b> Stuck at {STEPS[nextStep]}.</p>
                <Button size="sm" variant="secondary" icon={I.Phone} onClick={() => setCall(s)}>Call the admin</Button>
              </div>
            )}
            {n === 0 && <p className="mx-5 mb-3 rounded-xl bg-sunken px-3.5 py-3 text-[13.5px] text-ink2">Setup starts when {primaryAdmin.name} signs in for the first time.</p>}
            <ol>
              {STEPS.map((st, i) => {
                const ok = done.includes(i);
                return (
                  <li key={st} className="flex items-center gap-3 px-5 py-2.5 border-t border-line/70">
                    <span className={cx('w-7 h-7 rounded-full grid place-items-center shrink-0 text-[12px] font-bold tnum', ok ? 'bg-ok/15 text-ok' : 'bg-sunken text-ink3')}>{ok ? <I.Check size={15} strokeWidth={3} /> : i + 1}</span>
                    <p className={cx('flex-1 min-w-0 text-[14px]', ok ? 'text-ink2' : 'font-semibold')}>{st}{i === 9 && <span className="text-ink3 font-normal"> (optional)</span>}</p>
                    <span className={cx('text-[12.5px] font-semibold shrink-0', ok ? 'text-ok' : 'text-ink3')}>{ok ? 'Done' : 'Not yet'}</span>
                  </li>
                );
              })}
            </ol>
          </Card>

          <Card>
            <CardHead title="Plan and billing" sub="What DREAM TEAM charges this school. Prices exclude 18% GST." icon={I.ReceiptIndianRupee}
              action={can('plan') && s.sub && s.status !== 'Closed' ? <Button size="sm" variant="soft" icon={I.Layers} onClick={() => setSheet('plan')}>Change plan</Button> : null} />
            {s.sub ? (
              <DL rows={[
                ['Plan', <span key="p" className="inline-flex items-center gap-2 flex-wrap">{s.founding ? 'Essential, every module free as it is built' : s.sub.plan}</span>],
                ['Add-ons', s.sub.addons.length ? s.sub.addons.map((x) => `${x} (${inr(HOSTEL)} a year)`).join(', ') : 'None'],
                ['Students paid for', <span key="n" className="tnum">{num(s.sub.paid)} paid · <span className={cx(over && 'text-warn font-semibold')}>{num(s.students)} active today</span></span>],
                ['Price per student', `₹${s.founding ? 120 : PRICE[s.sub.plan]} a year${s.sub.paid > 1000 ? `, ₹${(s.founding ? 120 : PRICE[s.sub.plan]) / 2} above 1,000` : ''}${s.sub.paid <= 100 ? ' (minimum 100 students)' : ''}`],
                ['Discount', s.founding && s.sub.group ? `Founding school, and group ${s.sub.group}% (${s.group})` : s.founding ? `Founding school · price locked until ${plusYears(s.act, 3)}` : s.sub.group ? `Group ${s.sub.group}% (${s.group})` : 'None'],
                ['Renewal date', `${s.sub.renewal} · ${s.sub.halves ? 'paid in two halves' : 'paid yearly'}`],
                ['Status', <Pill key="st" tone={SUB_TONE[s.sub.status]}>{s.sub.status}{s.sub.status === 'In grace' ? `, ${s.sub.grace} days left` : ''}</Pill>],
                ['Message credits left', num(s.sub.credits)],
              ]} />
            ) : s.status === 'Trial' ? (
              <DL rows={[['Plan', 'Trial: everything in Essential'], ['Trial ends', `${s.trialEnds} · ${s.trialLeft} days left`], ['Message credits left', `${num(s.trialCredits)} of 500`], ['After the trial', 'The school picks Essential or Complete when it pays']]} />
            ) : (
              <p className="px-5 pb-4 text-[14px] text-ink2">The subscription ended when the school closed on 14 Aug 2026. Its invoices are kept below.</p>
            )}
            {inv.length > 0 && (
              <>
                <p className="eyebrow text-ink3 px-5 pt-1 pb-2">Invoices</p>
                <ul>{inv.map((i) => <InvoiceRow key={i.no} i={i} showSchool={false} onPaid={() => { setTarget(i); setSheet('paid'); }} onCancel={() => { setTarget(i); setSheet('cancel'); }} />)}</ul>
              </>
            )}
            {can('invoice') && s.status !== 'Closed' && (
              <div className="px-5 py-3.5 border-t border-line/70 flex gap-2 flex-wrap">
                <Button size="sm" variant="secondary" icon={I.Send} onClick={() => setSheet('invoice')}>Send an invoice</Button>
                {can('group') && <Button size="sm" variant="ghost" icon={I.Network} onClick={() => setSheet('group')}>Set Group</Button>}
              </div>
            )}
          </Card>

          <Card>
            <CardHead title="Status history" sub="Every change, with date, who and why" icon={I.History} />
            <div className="px-5 pb-1"><Timeline items={historyOf(s)} /></div>
          </Card>
        </Col>

        <Col>
          <Card>
            <CardHead title="School details" icon={I.Building2}
              action={!s.firstSignIn && can('edit') && s.status !== 'Closed' ? <Button size="sm" variant="ghost" icon={I.Pencil} onClick={() => setSheet('edit')}>Edit</Button> : null} />
            <DL rows={[['Name', s.name], ['Address', s.address || `${s.area ? `${s.area}, ` : ''}${s.city}`], ['City', s.city], ['State', s.state], ['Board', s.board], ['School type', s.type],
              ['Phone', <span key="ph" className="tnum">+91 {s.phone}</span>], ['Email', s.email || '—'], ['Campuses', s.campuses], ['Group', s.group || 'None']]} />
            <p className="mx-5 mb-5 -mt-1 rounded-xl bg-sunken p-3 text-[12.5px] text-ink2 flex gap-2">
              {s.firstSignIn ? <><I.Lock size={14} className="shrink-0 mt-0.5 text-ink3" /><span>Read-only. {primaryAdmin.name === NO_ADMIN.name ? 'The School Admin' : primaryAdmin.name} signed in on {s.firstSignIn}, so the school now edits these in Settings, School Profile.</span></>
                : <><I.Pencil size={14} className="shrink-0 mt-0.5 text-ink3" /><span>Editable here until the School Admin first signs in. After that, the school edits its own details.</span></>}
            </p>
          </Card>

          <Card>
            <CardHead title="Usage" sub="Counts only. No names, no money amounts." icon={I.ChartColumn} />
            <ul className="px-2 pb-2">
              <Row icon="GraduationCap" title="Students" sub="Active today" right={<b className="font-semibold tnum text-[15px]">{s.students ? num(s.students) : '—'}</b>} />
              <Row icon="KeyRound" title="Staff logins" sub="Made by the school itself" right={<b className="font-semibold tnum text-[15px]">{num(s.staffLogins)}</b>} />
              <Row icon="LogIn" title="Last sign-in by anyone" sub={s.lastAny} />
              <Row icon="MessageCircle" title="Messages sent this month" sub="WhatsApp, SMS and app" right={<b className="font-semibold tnum text-[15px]">{num(s.msgs)}</b>} />
              <Row icon="LayoutGrid" title="Modules switched on" sub={s.optional} right={<b className="font-semibold tnum text-[15px]">{s.modules}</b>} />
            </ul>
            <p className="px-5 pb-4 text-[12px] text-ink3 flex gap-1.5"><I.EyeOff size={13} className="shrink-0 mt-0.5" />The console never shows a student’s name, a fee amount or a salary.</p>
          </Card>

          <Card>
            <CardHead title="Team notes" sub="Visible only inside DREAM TEAM" icon={I.StickyNote} />
            <div className="px-5 pb-4 flex flex-col gap-3">
              {s.notes.length === 0 && <p className="text-[13.5px] text-ink3">No notes yet. Write what the next person should know, like the best time to call.</p>}
              {s.notes.map((x, i) => (
                <div key={i} className="flex gap-3">
                  <Avatar name={x.by} size={30} />
                  <div className="min-w-0 flex-1 text-[14px]"><p className="leading-snug">{x.text}</p><p className="text-[12px] text-ink3 mt-0.5">{x.by} · {x.when}</p></div>
                </div>
              ))}
              <Textarea id="sa-note" value={note} onChange={setNote} rows={2} placeholder="Principal prefers calls after 4 PM." />
              <Button size="sm" variant="secondary" icon={I.Plus} className="self-end" disabled={!note.trim()} onClick={() => { sa.addNote(s.id, note.trim()); setNote(''); }}>Add note</Button>
            </div>
          </Card>

          {can('restore') && s.status !== 'Closed' && (
            <Card>
              <CardHead title="Restore this school’s data to a moment" sub="Owner only. When the school asks in writing." icon={I.History} />
              <div className="px-5 pb-5 flex flex-col gap-3 text-[13.5px] text-ink2 leading-relaxed">
                <p>Brings back only {s.name}’s data as it was at the chosen moment, for example after a wrong bulk import it cannot undo. No other school is touched.</p>
                <p>Any moment in the last 7 days. The school’s admins are told before and after, and both steps go in the Activity Log.</p>
                <Button variant="dangerSoft" icon={I.History} className="self-start" onClick={() => setSheet('restore')}>Restore to a moment</Button>
              </div>
            </Card>
          )}

          <Card>
            <CardHead title="School status" icon={I.Flag} action={<StatusPill s={s} />} />
            <div className="px-5 pb-5 flex flex-col gap-3">
              <p className="text-[13.5px] text-ink2 leading-relaxed">{STATUS_MEANS[s.status]}</p>
              <div className="flex gap-2 flex-wrap">
                {s.status === 'Trial' && can('activate') && <Button size="sm" variant="soft" icon={I.CirclePlay} onClick={activate}>Activate</Button>}
                {s.status === 'Suspended' && can('status') && <Button size="sm" variant="soft" icon={I.CirclePlay} onClick={reactivate}>Reactivate</Button>}
                {s.status === 'Closed' && can('status') && <Button size="sm" variant="soft" icon={I.ArchiveRestore} onClick={reopen}>Reopen</Button>}
                {open && can('status') && <Button size="sm" variant="secondary" icon={I.CirclePause} onClick={() => setSheet('suspend')}>Suspend</Button>}
                {(s.status === 'Active' || s.status === 'Suspended') && can('status') && <Button size="sm" variant="dangerSoft" icon={I.Archive} onClick={() => setSheet('close')}>Close school</Button>}
              </div>
              {!can('status') && <p className="text-[12.5px] text-ink3 flex gap-1.5"><I.Lock size={13} className="shrink-0 mt-0.5" />Only the Owner can suspend, reactivate, close or reopen a school.{can('activate') && s.status === 'Trial' ? ' You can activate a trial.' : ''}</p>}
            </div>
          </Card>
        </Col>
      </Split>

      {askEl}
      <CallSheet school={call} onClose={() => setCall(null)} />
      <AddAdminSheet open={sheet === 'admin'} onClose={close} school={s} />
      <RequestSheet open={sheet === 'support'} onClose={close} schoolId={s.id} />
      <PlanSheet open={sheet === 'plan'} onClose={close} schoolId={s.id} />
      <InvoiceSheet open={sheet === 'invoice'} onClose={close} schoolId={s.id} />
      <GroupSheet open={sheet === 'group'} onClose={close} school={s} />
      <EditSchoolSheet open={sheet === 'edit'} onClose={close} school={s} />
      <RestoreSheet open={sheet === 'restore'} onClose={close} school={s} />
      <MarkPaidSheet invoice={sheet === 'paid' ? target : null} onClose={close} />
      <CancelInvoiceSheet invoice={sheet === 'cancel' ? target : null} onClose={close} />
      <ChangeMobileSheet open={sheet === 'phone'} onClose={close} school={s} admin={target} />
      <Sheet open={sheet === 'last'} onClose={close} title="This admin cannot be disabled" sub={s.name}>
        <div className="flex flex-col gap-4">
          <Banner tone="warn" title={`${s.name} needs at least one active admin.`}>Add another admin first.</Banner>
          <p className="text-[14px] text-ink2 leading-relaxed">{primaryAdmin.name} is the school’s only active School Admin. Without one, nobody could reach the school’s Settings. {s.admins.some((a) => a.status === 'Invited') ? `${s.admins.find((a) => a.status === 'Invited').name}’s invite is still waiting; once they sign in, you can disable ${primaryAdmin.name}.` : `Once the new admin signs in, you can disable ${primaryAdmin.name}.`}</p>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={close}>Close</Button>
            {can('invite') && <Button variant="primary" icon={I.UserPlus} onClick={() => setSheet('admin')}>Add another School Admin</Button>}
          </div>
        </div>
      </Sheet>
      <ActSheet open={sheet === 'disable'} onClose={close} title={target ? `Disable ${target.name}?` : ''} sub={s.name} confirmLabel={target ? `Disable ${target.name}` : 'Disable'} danger
        reasonPlaceholder="The office head left the school. Request on letterhead dated 8 Oct."
        onConfirm={(r) => {
          sa.updateSchool(s.id, (x) => ({ admins: x.admins.map((y) => (y.id === target.id ? { ...y, status: 'Disabled', note: `Disabled today by ${sa.me.name}: ${r}` } : y)) }));
          sa.log(`disabled ${target.name}’s School Admin login at ${s.name}: “${r}”`, { type: 'Admin login', school: s.id, change: ['Active', 'Disabled'] });
          toast({ title: `${target.name} can no longer sign in`, body: 'Their history stays. The school’s other admins were told.' });
        }}>
        <p className="text-[14px] text-ink2 leading-relaxed">They cannot sign in any more. Their history stays. The school’s other admins get a message, and this goes in the Activity Log.</p>
      </ActSheet>
      <ActSheet open={sheet === 'suspend'} onClose={close} title={`Suspend ${s.name}?`} sub={`${s.status} → Suspended`} confirmLabel="Suspend school" danger
        reasonPlaceholder="Asked by the school management in writing, 8 Oct."
        onConfirm={(r) => { changeStatus('Suspended', r, { since: '9 Oct 2026', keepUntil: '7 Jan 2027' }); toast({ title: `${s.name} is Suspended`, body: 'Its admins were told first. Data is kept.' }); }}>
        <div className="text-[14px] text-ink2 leading-relaxed flex flex-col gap-2">
          <p>Staff see “Your School OS access is paused. Please contact your school office.” The School Admin can sign in only to pay or download all the school’s data.</p>
          <p>Parents’ messages and payment links stop; links already sent still work, so no parent’s payment is lost. The school’s admins get a message first.</p>
        </div>
      </ActSheet>
      <ActSheet open={sheet === 'close'} onClose={close} title={`Close ${s.name}?`} sub={`${s.status} → Closed · Owner only`} confirmLabel="Close school" danger typeName={s.name}
        reasonPlaceholder="The trust is closing the school. Request on letterhead dated 8 Oct."
        onConfirm={(r) => { changeStatus('Closed', r, { keepUntil: '7 Jan 2027' }); toast({ title: `${s.name} is Closed`, body: 'Data kept for 90 days, until 7 Jan 2027. You can reopen it until then.' }); }}>
        <div className="text-[14px] text-ink2 leading-relaxed flex flex-col gap-2">
          <p>Nobody can sign in. The admin can still download all of the school’s data for 90 days, until 7 Jan 2027; then it is removed with the Owner’s approval.</p>
          <p>The school’s admins get a message first. Data is never deleted from this console.</p>
        </div>
      </ActSheet>
    </div>
  );
}

function AddAdminSheet({ open, onClose, school: s }) {
  const sa = useSA();
  const toast = useToast();
  const blank = { name: '', mobile: '', email: '', role: 'School Admin', ch: { WhatsApp: true, SMS: true, Email: false }, check: '' };
  const [f, setF] = useState(blank);
  const [tried, setTried] = useState(false);
  useEffect(() => { if (open) { setF(blank); setTried(false); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const d = digits(f.mobile);
  const err = {
    name: !f.name.trim() ? 'Enter the full name' : '',
    mobile: !d ? 'Enter their mobile number. It becomes their username.' : d.length !== 10 || !/^[6-9]/.test(d) ? 'Enter a 10-digit Indian mobile number' : '',
    check: s.firstSignIn && !f.check ? 'Choose how you checked that the request is really from the school' : '',
    ch: !Object.values(f.ch).some(Boolean) ? 'Pick at least one way to send the invite' : '',
    email: f.ch.Email && !f.email.trim() ? 'Add an email to also send the invite by email' : '',
  };
  const ok = !Object.values(err).some(Boolean);
  const show = (k) => tried && err[k];
  return (
    <FormSheet open={open} onClose={onClose} title="Add another School Admin" sub={`${s.name} · they set their own password from the invite`} submitLabel="Send invite" busyLabel="Sending…"
      onSubmit={() => {
        setTried(true);
        if (!ok) return false;
        const t = nowTime();
        const chan = Object.keys(f.ch).filter((k) => f.ch[k]).join(' and ');
        sa.updateSchool(s.id, (x) => ({ admins: [...x.admins, AD(f.name.trim(), f.mobile, 'Invited', `Invite sent today, ${t} by ${sa.me.name} · link works until 12 Oct`, { email: f.email, role: f.role })] }));
        sa.log(`sent a new admin invite to ${s.name}, to ${f.name.trim()}, +91 ${mask(f.mobile)}.`, { type: 'Invite', school: s.id, time: t });
        toast({ title: `Invite sent to ${f.name.trim()}`, body: `${chan} · +91 ${mask(f.mobile)} · works for 3 days` });
        return true;
      }}>
      <Field label="Full name" required id="aa-name" error={show('name')}><Input id="aa-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={show('name')} placeholder="Kavitha Nair" /></Field>
      <Field label="Mobile number" required id="aa-mobile" error={show('mobile')} hint="Becomes their username.">
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3 text-[15px]">+91</span>
          <Input id="aa-mobile" inputMode="numeric" value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value.replace(/[^\d ]/g, '').slice(0, 11) })} error={show('mobile')} className="pl-12 tnum" placeholder="98480 12345" />
        </div>
      </Field>
      <Field label="Email" id="aa-email" error={show('email')} hint="Needed only to also send the invite by email."><Input id="aa-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} error={show('email')} placeholder="name@school.in" /></Field>
      <Field label="Role in the school" required id="aa-role" hint="Both can create the school’s other logins."><Segmented value={f.role} onChange={(v) => setF({ ...f, role: v })} options={['School Admin', 'Principal / Owner']} className="w-full" /></Field>
      <Field label="Send the invite by" required id="aa-ch" error={show('ch')}><Channels value={f.ch} onChange={(ch) => setF({ ...f, ch })} /></Field>
      {s.firstSignIn && (
        <Field label="How you checked the request" required id="aa-check" error={show('check')} hint="Needed when a school asks for a new admin, for example after the old one left.">
          <Select id="aa-check" value={f.check} onChange={(v) => setF({ ...f, check: v })} error={show('check')}
            options={[{ value: '', label: 'Choose one' }, 'Called back on the school phone on record', 'Request on the school letterhead', 'Email from the school email on record']} />
        </Field>
      )}
      {ok && <p className="rounded-xl bg-sunken p-3 text-[14px]">Send to <b className="font-semibold">{f.name.trim()}</b>, +91 {mask(f.mobile)}?</p>}
    </FormSheet>
  );
}

function Channels({ value, onChange }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {[['WhatsApp', I.MessageCircle], ['SMS', I.MessageSquareText], ['Email', I.Mail]].map(([k, Ic]) => {
        const on = value[k];
        return (
          <button key={k} type="button" role="checkbox" aria-checked={on} onClick={() => onChange({ ...value, [k]: !on })}
            className={cx('h-10 px-3.5 rounded-xl border text-[13.5px] font-semibold inline-flex items-center gap-2 transition', on ? 'border-brand bg-brand/10 text-brand' : 'border-line text-ink2 hover:border-ink3/50')}>
            {on ? <I.CircleCheck size={16} /> : <Ic size={16} />}{k}
          </button>
        );
      })}
    </div>
  );
}

function ChangeMobileSheet({ open, onClose, school: s, admin: a }) {
  const sa = useSA();
  const toast = useToast();
  const [m, setM] = useState('');
  const [check, setCheck] = useState('');
  const [why, setWhy] = useState('');
  const [tried, setTried] = useState(false);
  useEffect(() => { if (open) { setM(''); setCheck(''); setWhy(''); setTried(false); } }, [open]);
  if (!a) return null;
  const d = digits(m);
  const err = { m: d.length !== 10 || !/^[6-9]/.test(d) ? 'Enter the new 10-digit mobile number' : '', check: !check ? 'Choose how you checked the change' : '', why: why.trim().length < 5 ? 'Write the reason in a few words' : '' };
  return (
    <FormSheet open={open} onClose={onClose} title={`Change ${a.name}’s mobile number`} sub={`${s.name} · now +91 ${mask(a.phone)}`} submitLabel="Change number and send reset link" busyLabel="Saving…"
      onSubmit={() => {
        setTried(true);
        if (Object.values(err).some(Boolean)) return false;
        sa.updateSchool(s.id, (x) => ({ admins: x.admins.map((y) => (y.id === a.id ? { ...y, phone: m, note: `Mobile number changed today by ${sa.me.name}` } : y)) }));
        sa.log(`changed ${a.name}’s mobile number at ${s.name}: “${why.trim()}” (${check.toLowerCase()}).`, { type: 'Admin login', school: s.id, change: [`+91 ${mask(a.phone)}`, `+91 ${mask(m)}`] });
        toast({ title: `${a.name}’s number changed`, body: `A reset link went to +91 ${mask(m)}. The school’s other admins were told.` });
        return true;
      }}>
      <Field label="New mobile number" required id="cm-m" error={tried && err.m}>
        <div className="relative"><span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3 text-[15px]">+91</span><Input id="cm-m" inputMode="numeric" value={m} onChange={(e) => setM(e.target.value.replace(/[^\d ]/g, '').slice(0, 11))} error={tried && err.m} className="pl-12 tnum" placeholder="98480 12345" /></div>
      </Field>
      <Field label="How you checked" required id="cm-check" error={tried && err.check}>
        <Select id="cm-check" value={check} onChange={setCheck} error={tried && err.check} options={[{ value: '', label: 'Choose one' }, 'Called back on the school phone on record', 'Request on the school letterhead', 'Email from the school email on record']} />
      </Field>
      <Field label="Reason" required id="cm-why" error={tried && err.why}><Textarea id="cm-why" value={why} onChange={setWhy} rows={2} placeholder="Lost her phone; new SIM from 7 Oct." /></Field>
    </FormSheet>
  );
}

function GroupSheet({ open, onClose, school: s }) {
  const sa = useSA();
  const toast = useToast();
  const groups = [...new Set(sa.schools.map((x) => x.group).filter(Boolean))];
  const [g, setG] = useState(s.group || 'None');
  const [name, setName] = useState('');
  useEffect(() => { if (open) { setG(s.group || 'None'); setName(''); } }, [open, s.group]);
  return (
    <FormSheet open={open} onClose={onClose} title="Set the school’s Group" sub="Used for group discounts and for School Access across the group" submitLabel="Save Group"
      onSubmit={() => {
        const to = g === 'new' ? name.trim() : g === 'None' ? null : g;
        if (g === 'new' && !to) return false;
        sa.updateSchool(s.id, () => ({ group: to }));
        sa.log(`set ${s.name}’s Group.`, { type: 'Details', school: s.id, change: [s.group || 'None', to || 'None'] });
        toast({ title: to ? `${s.name} is in ${to}` : `${s.name} is in no Group`, body: 'Group discounts apply from the next invoice.' });
        return true;
      }}>
      <Field label="Group" id="gr-g"><Select id="gr-g" value={g} onChange={setG} options={['None', ...groups.map((x) => ({ value: x, label: `${x} (${sa.schools.filter((y) => y.group === x).length} schools)` })), { value: 'new', label: 'Make a new group…' }]} /></Field>
      {g === 'new' && <Field label="New group name" required id="gr-n"><Input id="gr-n" value={name} onChange={(e) => setName(e.target.value)} placeholder="Green Valley Group" /></Field>}
      <p className="text-[13px] text-ink3">10% off for 3 to 4 schools in a group, 15% for 5 or more. People with logins in several schools of a group pick the school with the School switcher.</p>
    </FormSheet>
  );
}

function EditSchoolSheet({ open, onClose, school: s }) {
  const sa = useSA();
  const toast = useToast();
  const [f, setF] = useState(s);
  useEffect(() => { if (open) setF(s); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF({ ...f, [k]: e && e.target ? e.target.value : e });
  return (
    <FormSheet open={open} onClose={onClose} title="Edit school details" sub="Editable until the School Admin first signs in" submitLabel="Save details" wide
      onSubmit={() => {
        if (!f.name.trim() || !f.city.trim()) return false;
        sa.updateSchool(s.id, () => ({ name: f.name.trim(), address: f.address, city: f.city.trim(), state: f.state, board: f.board, type: f.type, phone: f.phone, email: f.email }));
        sa.log(`changed ${f.name.trim()}’s school details before the first sign-in.`, { type: 'Details', school: s.id });
        toast({ title: 'School details saved', body: 'Recorded in the Activity Log.' });
        return true;
      }}>
      <div className="grid @md:grid-cols-2 gap-4">
        <Field label="School name" required id="es-name" className="@md:col-span-2"><Input id="es-name" value={f.name} onChange={set('name')} /></Field>
        <Field label="Address" id="es-addr" className="@md:col-span-2"><Input id="es-addr" value={f.address || ''} onChange={set('address')} /></Field>
        <Field label="City" required id="es-city"><Input id="es-city" value={f.city} onChange={set('city')} /></Field>
        <Field label="State" required id="es-state"><Select id="es-state" value={f.state} onChange={set('state')} options={STATES} /></Field>
        <Field label="Board" required id="es-board"><Select id="es-board" value={f.board} onChange={set('board')} options={BOARDS} /></Field>
        <Field label="School type" required id="es-type"><Select id="es-type" value={f.type} onChange={set('type')} options={TYPES.map((t) => t[0])} /></Field>
        <Field label="School phone" required id="es-phone"><Input id="es-phone" value={f.phone} onChange={set('phone')} className="tnum" /></Field>
        <Field label="School email" id="es-email"><Input id="es-email" type="email" value={f.email} onChange={set('email')} /></Field>
      </div>
    </FormSheet>
  );
}

function RestoreSheet({ open, onClose, school: s }) {
  const sa = useSA();
  const toast = useToast();
  const DAYS = ['9 Oct 2026', '8 Oct 2026', '7 Oct 2026', '6 Oct 2026', '5 Oct 2026', '4 Oct 2026', '3 Oct 2026'];
  const [day, setDay] = useState(DAYS[0]);
  const [time, setTime] = useState('09:00');
  useEffect(() => { if (open) { setDay(DAYS[0]); setTime('09:00'); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const admins = s.admins.filter((a) => a.status !== 'Disabled').map((a) => a.name).join(' and ');
  return (
    <ActSheet open={open} onClose={onClose} title={`Restore ${s.name}’s data`} sub="Owner only · this school only" confirmLabel="Restore this school’s data" danger typeName={s.name}
      reasonLabel="The school’s written request" reasonHint="Name the email or letter, with date and time."
      reasonPlaceholder={`Email from ${s.email || 'the school email on record'}, 9 Oct, 9:12 AM: wrong bulk import of Class 6 marks.`}
      onConfirm={(r) => {
        const t = nowTime();
        sa.log(`told ${s.name}’s admins (${admins}) and started restoring the school’s data to ${day}, ${time12(time)}: “${r}”`, { type: 'Restore', school: s.id, time: t });
        toast({ title: `Restoring ${s.name} to ${day}, ${time12(time)}`, body: 'Admins told. The school is read-only for about 20 minutes, then told again.', ms: 5000 });
      }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Day" required id="rs-day"><Select id="rs-day" value={day} onChange={setDay} options={DAYS.map((d, i) => ({ value: d, label: i === 0 ? `Today, ${d}` : d }))} /></Field>
        <Field label="Time" required id="rs-time"><Input id="rs-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
      </div>
      <div className="rounded-xl bg-warn/12 p-3.5 text-[13.5px] text-ink2 leading-relaxed flex flex-col gap-1.5">
        <p><b className="font-semibold text-ink">Only {s.name}’s data goes back to {day}, {time12(time)}.</b> Changes made in this school after that moment are lost: 1 bulk import (312 rows) and 46 other changes. No other school is touched.</p>
        <p>{admins || 'The school’s admins'} are told before and after. The school is read-only for about 20 minutes while it runs. Both steps go in the Activity Log.</p>
      </div>
    </ActSheet>
  );
}

/* ======================= Shared: support request, plan, invoices ======================= */
function RequestSheet({ open, onClose, schoolId }) {
  const sa = useSA();
  const toast = useToast();
  const eligible = sa.schools.filter((s) => (s.status === 'Active' || s.status === 'Trial') && s.admins.some((a) => a.status === 'Active'));
  const [sid, setSid] = useState(schoolId || 'SPS-HYD-001');
  const [reason, setReason] = useState('');
  const [len, setLen] = useState('1 hour');
  const [tried, setTried] = useState(false);
  useEffect(() => { if (open) { setSid(schoolId && eligible.some((s) => s.id === schoolId) ? schoolId : eligible[0].id); setReason(''); setLen('1 hour'); setTried(false); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = sa.school(sid) || eligible[0];
  const pending = sa.requests.find((r) => r.school === s.id && (r.status === 'waiting' || r.status === 'allowed'));
  const admin = s.admins.find((a) => a.status === 'Active');
  return (
    <FormSheet open={open} onClose={onClose} title="Request support access" sub="The school decides. You can open its School Master only after they tap Allow." submitLabel="Send request" busyLabel="Sending…"
      onSubmit={() => {
        setTried(true);
        if (reason.trim().length < 5 || pending) return false;
        const t = nowTime();
        const id = `SAR-00${22 + sa.requests.length - REQUESTS.length}`;
        sa.setRequests((rs) => [{ id, school: s.id, reason: reason.trim(), len, by: sa.me.name, asked: `Today, ${t}`, status: 'waiting', answer: `Waiting for ${admin.name} or the Principal to answer in Approvals` }, ...rs]);
        sa.log(`asked ${s.name} for support access for ${len}: “${reason.trim()}.”`, { type: 'Support access', school: s.id, time: t });
        toast({ title: `Request sent to ${s.name}`, body: `${admin.name} and the Principal see it in Approvals and on WhatsApp.` });
        return true;
      }}>
      <Field label="School" required id="rq-school"><Select id="rq-school" value={s.id} onChange={setSid} options={eligible.map((x) => ({ value: x.id, label: `${x.name} · ${x.city}` }))} /></Field>
      {pending && <Banner tone="info" title="Already asked.">A request to this school is {pending.status === 'waiting' ? 'waiting for their answer' : `allowed until ${pending.ends}`}. Open it from Support Access.</Banner>}
      <Field label="Reason" required id="rq-reason" error={tried && reason.trim().length < 5 ? 'Say what you need to fix, in a few words. The school reads this.' : ''} hint="The School Admin and Principal read this before they decide.">
        <Textarea id="rq-reason" value={reason} onChange={setReason} rows={2} placeholder="Fee structure is not saving" />
      </Field>
      <Field label="How long" required id="rq-len"><Segmented value={len} onChange={setLen} options={['1 hour', '4 hours', '1 day']} className="w-full" /></Field>
      <div className="rounded-xl bg-sunken p-3.5 text-[13px] text-ink2 flex gap-2.5 leading-relaxed">
        <I.ShieldCheck size={17} className="text-brand shrink-0 mt-0.5" />
        <span>Goes to {s.name}’s Approvals for {admin.name} and the Principal, with a WhatsApp message. Access ends by itself after {len}. Even then you never see ID numbers, salaries or counsellor notes, cannot export data and cannot cancel payments.</span>
      </div>
    </FormSheet>
  );
}

function PlanSheet({ open, onClose, schoolId }) {
  const sa = useSA();
  const toast = useToast();
  const s = sa.school(schoolId);
  const [plan, setPlan] = useState('Essential');
  const [hostel, setHostel] = useState(false);
  useEffect(() => { if (open && s?.sub) { setPlan(s.sub.plan); setHostel(s.sub.addons.includes('Hostel')); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!s || !s.sub) return null;
  const cur = subBase(s);
  const next = subBase(s, plan, hostel ? ['Hostel'] : []);
  const ml = monthsLeft(s.sub.renewal);
  const diff = Math.round(((next - cur) * ml) / 12);
  const up = next > cur;
  const down = next < cur;
  return (
    <FormSheet open={open} onClose={onClose} title="Change plan and add-ons" sub={`${s.name} · ${num(s.sub.paid)} students paid for`} wide
      submitLabel={up ? `Save and send ${inr(diff + gstOf(diff))} invoice` : down ? 'Save for renewal' : 'Save'} busyLabel="Saving…"
      onSubmit={() => {
        if (!up && !down) return true;
        const addons = hostel ? ['Hostel'] : [];
        const change = [`${s.sub.plan}${s.sub.addons.length ? ' + Hostel' : ''}`, `${plan}${hostel ? ' + Hostel' : ''}`];
        if (up) {
          const no = sa.nextNo();
          sa.updateSchool(s.id, (x) => ({ sub: { ...x.sub, plan, addons } }));
          sa.addInvoice({ no, school: s.id, items: `Plan change: ${change[0]} to ${change[1]}, ${ml} months`, base: diff, gst: gstOf(diff), date: '9 Oct 2026', due: '16 Oct 2026', status: 'Unpaid' });
          sa.log(`changed ${s.name}’s plan from today. The difference for the rest of the year was invoiced (${no}).`, { type: 'Billing', school: s.id, change });
          toast({ title: `${s.name}: ${change[1]} from today`, body: `Invoice ${no} sent with a Razorpay link.` });
        } else {
          sa.updateSchool(s.id, (x) => ({ sub: { ...x.sub, nextPlan: change[1] } }));
          sa.log(`changed ${s.name}’s plan from the renewal on ${s.sub.renewal}.`, { type: 'Billing', school: s.id, change });
          toast({ title: `Plan changes on ${s.sub.renewal}`, body: 'Nothing changes before the renewal.' });
        }
        return true;
      }}>
      {s.founding ? (
        <Banner tone="brand" icon="Award" title="Founding school.">Essential price locked until {plusYears(s.act, 3)}, and every new module is switched on free as it is built. Only add-ons can change.</Banner>
      ) : (
        <div className="grid @sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Plan">
          {['Essential', 'Complete'].map((p) => (
            <button key={p} type="button" role="radio" aria-checked={plan === p} onClick={() => setPlan(p)}
              className={cx('rounded-2xl border-2 p-4 text-left transition', plan === p ? 'border-brand bg-brand/5' : 'border-line hover:border-ink3/40')}>
              <span className="flex items-center justify-between gap-2"><span className="font-semibold text-[15px]">{p}</span>{plan === p && <I.CircleCheck size={18} className="text-brand" />}</span>
              <span className="block font-display text-[22px] font-semibold tnum mt-1">₹{PRICE[p]}<span className="text-[12.5px] text-ink3 font-sans font-medium"> per student a year</span></span>
              <span className="block text-[12.5px] text-ink3 mt-1">{p === 'Essential' ? 'Everyday school work, 2,000 message credits a year' : 'Every module, 5,000 message credits a year'}</span>
            </button>
          ))}
        </div>
      )}
      <label htmlFor="pl-hostel" className="flex items-center gap-3 rounded-xl border border-line p-3.5 cursor-pointer">
        <Checkbox id="pl-hostel" checked={hostel} onChange={setHostel} label="Hostel add-on" />
        <span className="flex-1 text-[14px]"><b className="font-semibold">Hostel add-on</b><span className="block text-[12.5px] text-ink3">{inr(HOSTEL)} per school a year</span></span>
      </label>
      <div className="rounded-xl bg-sunken p-3.5 text-[13.5px] text-ink2 leading-relaxed">
        {up ? <p><b className="font-semibold text-ink">Upgrade from today.</b> The school pays the difference for the rest of the year ({ml} months): {inr(diff)} + GST {inr(gstOf(diff))} = <b className="font-semibold text-ink">{inr(diff + gstOf(diff))}</b>. The invoice goes to the School Admin and Principal with a Razorpay link.</p>
          : down ? <p><b className="font-semibold text-ink">Downgrade at renewal.</b> The change starts on {s.sub.renewal}. Nothing changes before then.</p>
            : <p>No change. The school pays {inr(cur)} a year before GST.</p>}
      </div>
    </FormSheet>
  );
}

function InvoiceSheet({ open, onClose, schoolId }) {
  const sa = useSA();
  const toast = useToast();
  const list = sa.schools.filter((s) => s.status !== 'Closed');
  const [sid, setSid] = useState(schoolId || list[0].id);
  const [what, setWhat] = useState('credits');
  const [pack, setPack] = useState('10000');
  useEffect(() => { if (open) { setSid(schoolId || list[0].id); setWhat('credits'); setPack('10000'); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = sa.school(sid) || list[0];
  const firstYear = !s.sub;
  const n = Math.max(s.students || s.approx || 0, 100);
  const base = what === 'credits' ? PACKS[pack] : firstYear ? yearly('Essential', n) : subBase(s);
  const items = what === 'credits' ? `Message credits: ${num(+pack)}` : firstYear ? `First year: Essential, ${num(n)} students` : `Renewal: ${s.sub.plan}, ${num(s.sub.paid)} students${s.sub.addons.length ? ', Hostel' : ''}${s.sub.group ? `, group discount ${s.sub.group}%` : ''}`;
  const admin = adminOf(s);
  return (
    <FormSheet open={open} onClose={onClose} title="Send an invoice" sub="A GST invoice from DREAM TEAM SERVICES, with a Razorpay payment link" submitLabel={`Send invoice for ${inr(base + gstOf(base))}`} busyLabel="Sending…"
      onSubmit={() => {
        const no = sa.nextNo();
        sa.addInvoice({ no, school: s.id, items, base, gst: gstOf(base), date: '9 Oct 2026', due: '23 Oct 2026', status: 'Unpaid' });
        sa.log(`sent invoice ${no} to ${s.name}: ${items}, ${inr(base + gstOf(base))} with GST.`, { type: 'Billing', school: s.id });
        toast({ title: `Invoice ${no} sent`, body: `${admin.name} and the Principal · WhatsApp and email with a Razorpay link` });
        return true;
      }}>
      <Field label="School" required id="iv-school"><Select id="iv-school" value={s.id} onChange={setSid} options={list.map((x) => ({ value: x.id, label: `${x.name} · ${x.city}` }))} /></Field>
      <Field label="What for" required id="iv-what"><Segmented value={what} onChange={setWhat} options={[{ value: 'credits', label: 'Message credits' }, { value: 'plan', label: firstYear ? 'First year' : 'Renewal' }]} className="w-full" /></Field>
      {what === 'credits' && <Field label="Credit pack" required id="iv-pack"><Select id="iv-pack" value={pack} onChange={setPack} options={Object.keys(PACKS).map((k) => ({ value: k, label: `${num(+k)} credits · ${inr(PACKS[k])}` }))} /></Field>}
      <div className="rounded-xl border border-line divide-y divide-line/70 text-[14px]">
        <div className="flex justify-between gap-3 px-3.5 py-2.5"><span className="text-ink2 min-w-0">{items}</span><span className="tnum shrink-0">{inr(base)}</span></div>
        <div className="flex justify-between gap-3 px-3.5 py-2.5"><span className="text-ink2">GST 18%</span><span className="tnum">{inr(gstOf(base))}</span></div>
        <div className="flex justify-between gap-3 px-3.5 py-2.5 font-semibold"><span>Total</span><span className="tnum">{inr(base + gstOf(base))}</span></div>
      </div>
      <p className="text-[13px] text-ink3">Goes to {admin.name} and the Principal on WhatsApp and email. It marks itself paid when the Razorpay payment arrives.</p>
    </FormSheet>
  );
}

function MarkPaidSheet({ invoice: i, onClose }) {
  const sa = useSA();
  const [by, setBy] = useState('Bank transfer');
  const [ref, setRef] = useState('');
  const [date, setDate] = useState('09-10-2026');
  const [tried, setTried] = useState(false);
  useEffect(() => { if (i) { setBy('Bank transfer'); setRef(''); setDate('09-10-2026'); setTried(false); } }, [i]);
  const s = i && sa.school(i.school);
  return (
    <FormSheet open={!!i} onClose={onClose} title={i ? `Mark ${i.no} paid` : ''} sub={i ? `${s.name} · ${inr(i.base + i.gst)} with GST · Owner only` : ''} submitLabel={i ? `Mark ${inr(i.base + i.gst)} paid` : 'Mark paid'}
      onSubmit={() => {
        setTried(true);
        if (!ref.trim()) return false;
        const [d, m, y] = date.split('-');
        sa.markPaid(i.no, { by, ref: `${by === 'Cheque' ? 'Cheque' : 'UTR'} ${ref.trim()}`, date: `${+d} ${MONTHS[+m - 1] || 'Oct'} ${y}` });
        return true;
      }}>
      {i && <>
        <Field label="Paid by" required id="mp-by"><Segmented value={by} onChange={setBy} options={['Bank transfer', 'Cheque']} className="w-full" /></Field>
        <Field label={by === 'Cheque' ? 'Cheque number and bank' : 'UTR (bank reference number)'} required id="mp-ref" error={tried && !ref.trim() ? 'Enter the reference number from the bank' : ''}>
          <Input id="mp-ref" value={ref} onChange={(e) => setRef(e.target.value)} error={tried && !ref.trim()} className="font-mono" placeholder={by === 'Cheque' ? '004517, Indian Bank' : 'HDFCN26282104477'} />
        </Field>
        <Field label="Date received" required id="mp-date" hint="DD-MM-YYYY"><Input id="mp-date" value={date} onChange={(e) => setDate(e.target.value)} className="tnum" /></Field>
        {s.status === 'Suspended' && <Banner tone="ok" title="This reactivates the school.">Paying an overdue invoice makes {s.name} Active again at once, with everything unchanged.</Banner>}
      </>}
    </FormSheet>
  );
}

function CancelInvoiceSheet({ invoice: i, onClose }) {
  const sa = useSA();
  const toast = useToast();
  const s = i && sa.school(i.school);
  return (
    <ActSheet open={!!i} onClose={onClose} title={i ? `Cancel invoice ${i.no}?` : ''} sub={i ? `${s.name} · ${inr(i.base + i.gst)}` : ''} confirmLabel="Cancel invoice" danger
      reasonPlaceholder="Wrong student count. A new invoice replaces it."
      onConfirm={(r) => {
        sa.updateInvoice(i.no, { status: 'Cancelled', reason: r, cancelledBy: `${sa.me.name}, 9 Oct 2026` });
        sa.log(`cancelled invoice ${i.no} for ${s.name}: “${r}”`, { type: 'Billing', school: s.id, change: [i.status === 'Waiting' ? 'Waiting' : 'Unpaid', 'Cancelled'] });
        toast({ title: `${i.no} cancelled`, body: 'The original is kept with your reason. Invoices are never deleted.' });
      }}>
      <p className="text-[14px] text-ink2 leading-relaxed">Invoices are never deleted. This one stays in the list, marked cancelled, with your reason. Its Razorpay link stops working.</p>
    </ActSheet>
  );
}

const INV_TONE = { Paid: 'ok', Unpaid: 'warn', Overdue: 'bad', Waiting: 'warn', Cancelled: 'neutral' };
function InvoiceRow({ i, showSchool = true, onPaid, onCancel }) {
  const sa = useSA();
  const toast = useToast();
  const s = sa.school(i.school);
  const total = i.base + i.gst;
  const unpaid = i.status === 'Unpaid' || i.status === 'Overdue';
  const label = i.status === 'Waiting' ? 'Waiting for Owner’s OK' : i.status === 'Unpaid' && i.grace ? 'Unpaid · in grace' : i.status;
  return (
    <li className="flex flex-col @md:flex-row @md:items-center gap-3 px-5 py-3.5 border-t border-line/70">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <span className={cx('w-10 h-10 rounded-xl grid place-items-center shrink-0', i.status === 'Cancelled' ? 'bg-sunken text-ink3' : 'bg-brand/10 text-brand')}>{i.status === 'Cancelled' ? <I.FileX size={19} /> : <I.FileText size={19} />}</span>
        <div className="min-w-0">
          <p className="font-semibold text-[14.5px] leading-tight"><span className="font-mono text-[12.5px]">{i.no}</span>{showSchool && <> · {s?.name}</>}</p>
          <p className={cx('text-[13px] text-ink3', i.status === 'Cancelled' && 'line-through')}>{i.items}</p>
          <p className="text-[12.5px] text-ink3">{i.date} · due {i.due}{i.paidOn ? ` · paid ${i.paidOn} by ${i.paidBy}${i.ref ? ` (${i.ref})` : ''}` : ''}{i.markedBy ? ` · marked by ${i.markedBy}` : ''}</p>
          {i.reason && <p className="text-[12.5px] text-ink2 mt-0.5">Cancelled by {i.cancelledBy}: {i.reason}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap pl-[52px] @md:pl-0 @md:justify-end shrink-0">
        <div className="text-right mr-1"><p className={cx('font-semibold tnum text-[14.5px]', i.status === 'Cancelled' && 'line-through text-ink3')}>{inr(total)}</p><p className="text-[11.5px] text-ink3 tnum">{inr(i.base)} + GST {inr(i.gst)}</p></div>
        <Pill tone={INV_TONE[i.status]}>{label}</Pill>
        {unpaid && sa.can('invoice') && <Button size="sm" variant="ghost" icon={I.Send} onClick={() => { sa.log(`resent invoice ${i.no} to ${s.name} with its Razorpay link.`, { type: 'Billing', school: s.id }); toast({ title: `${i.no} sent again`, body: 'School Admin and Principal · Razorpay link included' }); }}>Resend</Button>}
        {unpaid && sa.can('markPaid') && <Button size="sm" variant="secondary" icon={I.Check} onClick={onPaid}>Mark paid</Button>}
        {sa.can('markPaid') && (unpaid || i.status === 'Waiting') && <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>}
        <IconButton icon={I.Download} size={32} label={`Download ${i.no} as PDF`} onClick={() => toast({ title: `Saved: ${i.no.replace(/\//g, '-')}.pdf`, body: 'GST invoice from DREAM TEAM SERVICES' })} />
      </div>
    </li>
  );
}

/* ======================= 3.4 Support Access ======================= */
const REQ_TONE = { waiting: 'info', allowed: 'ok', declined: 'bad', ended: 'neutral' };
const REQ_LABEL = { waiting: 'Waiting', allowed: 'Allowed', declined: 'Declined', ended: 'Ended' };

function SupportPage() {
  const { go } = useNav();
  const { startSupport } = useRole();
  const sa = useSA();
  const toast = useToast();
  const [setAsk, askEl] = useAsk();
  const [f, setF] = useState('all');
  const [q, setQ] = useState('');
  const [ask, setAskOpen] = useState(false);
  const allowed = sa.requests.filter((r) => r.status === 'allowed');
  const rows = sa.requests.filter((r) => (f === 'all' || r.status === f) && (!q.trim() || `${sa.school(r.school).name} ${r.reason} ${r.by}`.toLowerCase().includes(q.trim().toLowerCase())));
  const cnt = (st) => sa.requests.filter((r) => r.status === st).length;
  const openMaster = () => { startSupport(); go('dashboard'); };
  const endNow = (r) => setAsk({ title: 'End support access now?', sub: sa.school(r.school).name, label: 'End access now',
    body: <p>You leave {sa.school(r.school).name}’s School Master at once. The school sees that access ended in its Approvals history.</p>,
    run: () => {
      const t = nowTime();
      sa.updateRequest(r.id, { status: 'ended', answer: `${r.answer.split(' at ')[0]} · ended early by ${sa.me.name} at ${t}` });
      sa.log(`ended support access to ${sa.school(r.school).name} early.`, { type: 'Support access', school: r.school, change: ['Allowed', 'Ended'], time: t });
      toast({ title: 'Support access ended', body: 'Written in the school’s audit log and the Activity Log.' });
    } });

  return (
    <div>
      <PageHead title="Support Access" sub="Look inside a school’s School Master only when the school says yes, and only for the time given."
        actions={sa.can('support') ? <Button variant="primary" icon={I.LifeBuoy} onClick={() => setAskOpen(true)}>Request support access</Button> : null} />
      <Split side={380}>
        <Col>
          {allowed.map((r) => {
            const s = sa.school(r.school);
            return (
              <Card key={r.id} className="border-ok/40">
                <CardHead title="Support access open now" sub={`${r.id} · asked by ${r.by}`} icon={I.LifeBuoy} action={<Pill tone="ok" dot>Allowed</Pill>} />
                <div className="px-5 pb-5 flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <SchoolLogo name={s.name} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[15px] leading-tight">{s.name}</p>
                      <p className="text-[13px] text-ink3">{r.answer} · {r.len}</p>
                    </div>
                  </div>
                  <p className="text-[14px] text-ink2">“{r.reason}”</p>
                  <div>
                    <div className="flex justify-between text-[12.5px] text-ink3 mb-1.5 tnum"><span>Ends by itself at <b className="font-semibold text-ink">{r.ends}</b></span><span>{r.left}</span></div>
                    <Progress value={r.used} tone="ok" />
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {sa.can('support') && s.id === 'SPS-HYD-001' && <Button variant="primary" icon={I.ExternalLink} onClick={openMaster}>Open School Master</Button>}
                    {sa.can('support') && <Button variant="secondary" onClick={() => endNow(r)}>End now</Button>}
                  </div>
                  <p className="text-[12.5px] text-ink3 leading-relaxed">A coloured bar shows on every screen while you are inside: “Support access for {s.name}, ends {r.ends}”. Everything you do is written in the school’s own audit log, marked “DREAM TEAM support”, and in the Activity Log.</p>
                </div>
              </Card>
            );
          })}

          <div>
            <Chips value={f} onChange={setF} options={[{ value: 'all', label: 'All requests', count: sa.requests.length }, { value: 'waiting', label: 'Waiting', count: cnt('waiting') }, { value: 'allowed', label: 'Allowed', count: cnt('allowed') }, { value: 'declined', label: 'Declined', count: cnt('declined') }, { value: 'ended', label: 'Ended', count: cnt('ended') }]} />
            <Card className="mt-3 overflow-hidden">
              <Toolbar><SearchBox id="sa-req-search" value={q} onChange={setQ} placeholder="School, reason or team member" /></Toolbar>
              {rows.length === 0 ? <Empty icon={I.LifeBuoy} title="No requests here" body="Requests appear when someone in DREAM TEAM asks a school for access." action={sa.can('support') ? <Button variant="secondary" onClick={() => setAskOpen(true)}>Request support access</Button> : null} /> : (
                <ul className="divide-y divide-line/70">
                  {rows.map((r) => {
                    const s = sa.school(r.school);
                    return (
                      <li key={r.id} className="flex flex-col @md:flex-row @md:items-center gap-3 p-4">
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <SchoolLogo name={s.name} size={40} />
                          <div className="min-w-0">
                            <p className="font-semibold text-[14.5px] leading-tight flex items-center gap-2 flex-wrap">{s.name}<Pill tone={REQ_TONE[r.status]} className="!h-5 !text-[11px]">{REQ_LABEL[r.status]}</Pill></p>
                            <p className="text-[14px] text-ink2 mt-0.5">“{r.reason}”</p>
                            <p className="text-[12.5px] text-ink3 mt-0.5">{r.by} · {r.asked} · {r.len}</p>
                            <p className="text-[12.5px] text-ink3">{r.answer}</p>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-wrap pl-[52px] @md:pl-0 shrink-0">
                          {r.status === 'waiting' && sa.can('support') && <>
                            <Button size="sm" variant="secondary" icon={I.Send} onClick={() => { sa.log(`reminded ${s.name} about support access request ${r.id}.`, { type: 'Support access', school: s.id }); toast({ title: `Reminder sent to ${s.name}`, body: 'WhatsApp to the School Admin and Principal' }); }}>Remind</Button>
                            <Button size="sm" variant="ghost" onClick={() => { sa.updateRequest(r.id, { status: 'ended', answer: `Withdrawn by ${sa.me.name} before the school answered` }); sa.log(`withdrew support access request ${r.id} to ${s.name}.`, { type: 'Support access', school: s.id, change: ['Waiting', 'Ended'] }); toast({ title: 'Request withdrawn', body: 'It no longer shows in the school’s Approvals.' }); }}>Withdraw</Button>
                          </>}
                          {r.status === 'allowed' && sa.can('support') && s.id === 'SPS-HYD-001' && <Button size="sm" variant="primary" icon={I.ExternalLink} onClick={openMaster}>Open School Master</Button>}
                          {(r.status === 'declined' || r.status === 'ended') && <Button size="sm" variant="ghost" onClick={() => go('sa', { page: 'school', id: s.id })}>Open school</Button>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </Col>

        <Col>
          <Card>
            <CardHead title="What support users can never see" sub="Even when the school allows access" icon={I.EyeOff} />
            <ul className="px-5 pb-5 flex flex-col gap-3 text-[14px]">
              {[['IdCard', 'Aadhaar and other ID numbers'], ['Wallet', 'Salaries'], ['NotebookPen', 'Counsellor notes'], ['Download', 'No exports of any data'], ['Ban', 'No cancelling of payments']].map(([ic, t]) => (
                <li key={t} className="flex items-center gap-3"><span className="w-8 h-8 rounded-lg bg-bad/10 text-bad grid place-items-center shrink-0"><Icon name={ic} size={16} /></span>{t}</li>
              ))}
            </ul>
            <p className="px-5 pb-5 -mt-1 text-[12.5px] text-ink3 leading-relaxed">Everything a support user does inside a school is written in that school’s own audit log, marked “DREAM TEAM support”, and in the console’s Activity Log.</p>
          </Card>
          <Card>
            <CardHead title="How it works" icon={I.Workflow} />
            <ol className="px-5 pb-5 flex flex-col gap-3">
              {['A Support user asks, with a reason and how long: 1 hour, 4 hours or 1 day.', 'The request appears in the school’s Approvals for its School Admin and Principal, with a WhatsApp message.',
                'The school taps Allow or Decline.', 'If allowed, the Support user can open that school’s School Master for the time given, with a coloured bar on every screen.',
                'Access ends by itself at the time given. The school can end it earlier.', 'Every action inside is recorded in the school’s audit log and here.'].map((t, i) => (
                <li key={i} className="flex gap-3 text-[13.5px] text-ink2 leading-snug">
                  <span className="w-6 h-6 rounded-full bg-sunken text-ink2 text-[12px] font-bold grid place-items-center shrink-0 tnum">{i + 1}</span><span className="pt-0.5">{t}</span>
                </li>
              ))}
            </ol>
          </Card>
          {!sa.can('support') && <Banner tone="info" title={`You are viewing as ${sa.role.label}.`}>Only Owner and Support ask schools for access.</Banner>}
        </Col>
      </Split>
      <RequestSheet open={ask} onClose={() => setAskOpen(false)} />
      {askEl}
    </div>
  );
}

/* ======================= 3.5 Plans & Billing ======================= */
function BillingPage() {
  const { go } = useNav();
  const sa = useSA();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [f, setF] = useState('all');
  const [iq, setIq] = useState('');
  const [iF, setIF] = useState('all');
  const [sheet, setSheet] = useState(null);
  const [target, setTarget] = useState(null);
  const [foundPick, setFoundPick] = useState('');
  const [discGroup, setDiscGroup] = useState(null);
  const [discVal, setDiscVal] = useState('10');
  const [act, setAct] = useState(null);
  const close = () => setSheet(null);
  const subs = sa.schools.filter((s) => s.sub && s.status !== 'Closed');
  const c = (st) => subs.filter((s) => s.sub.status === st).length;
  const used = sa.schools.filter((s) => s.founding).length;
  const waiting = sa.invoices.filter((i) => i.status === 'Waiting');
  const unpaid = sa.invoices.filter((i) => i.status === 'Unpaid' || i.status === 'Overdue');
  const subRows = subs.filter((s) => (f === 'all' || s.sub.status === f) && (!q.trim() || `${s.name} ${s.city} ${s.id}`.toLowerCase().includes(q.trim().toLowerCase())));
  const invRows = sa.invoices.filter((i) => (iF === 'all' || (iF === 'unpaid' ? ['Unpaid', 'Overdue', 'Waiting'].includes(i.status) : iF === 'paid' ? i.status === 'Paid' : i.status === 'Cancelled')) &&
    (!iq.trim() || `${i.no} ${sa.school(i.school).name} ${i.items}`.toLowerCase().includes(iq.trim().toLowerCase())));
  const groups = [...new Set(sa.schools.map((s) => s.group).filter(Boolean))].map((g) => ({ name: g, schools: sa.schools.filter((s) => s.group === g) }));
  const eligible = sa.schools.filter((s) => s.sub && !s.founding && s.status === 'Active');
  const approve = (i) => {
    const s = sa.school(i.school);
    sa.updateInvoice(i.no, { status: 'Unpaid' });
    sa.log(`gave the OK and sent top-up invoice ${i.no} to ${s.name}.`, { type: 'Billing', school: s.id, change: ['Waiting', 'Unpaid'] });
    toast({ title: `${i.no} sent to ${s.name}`, body: 'School Admin and Principal · Razorpay link included' });
  };

  return (
    <div>
      <PageHead title="Plans & Billing" sub="What each school pays, and whether it has paid. Prices exclude 18% GST."
        actions={sa.can('invoice') ? <Button variant="primary" icon={I.Send} onClick={() => { setTarget(null); setSheet('invoice'); }}>Send invoice</Button> : null} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Stats items={[
          { label: 'Paid', value: c('Paid'), sub: 'subscriptions', tone: 'ok', icon: 'CircleCheck', onClick: () => setF('Paid') },
          { label: 'Due', value: c('Due'), sub: 'invoice sent, not late', tone: 'info', icon: 'Clock', onClick: () => setF('Due') },
          { label: 'In grace', value: c('In grace'), sub: '15 days, still working', tone: 'warn', icon: 'Hourglass', onClick: () => setF('In grace') },
          { label: 'Overdue', value: c('Overdue'), sub: 'school suspended', tone: 'bad', icon: 'CircleAlert', onClick: () => setF('Overdue') },
          { label: 'Unpaid invoices', value: inr(unpaid.reduce((t, i) => t + i.base + i.gst, 0)), sub: `${unpaid.length} invoices, with GST`, icon: 'ReceiptIndianRupee' },
          { label: 'Founding schools', value: `${used} of 20`, sub: `${20 - used} places left`, tone: 'brand', icon: 'Award' },
        ]} />

        {waiting.map((i) => {
          const s = sa.school(i.school);
          return (
            <div key={i.no} className="rounded-2xl bg-warn/12 px-4 py-3.5 flex flex-col @md:flex-row @md:items-center gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <I.UsersRound size={19} className="text-warn shrink-0 mt-0.5" />
                <p className="text-[14px] text-ink2"><b className="font-semibold text-ink">Top-up invoice {i.no} waits for the Owner’s OK.</b> {s.name}: {i.items}. {inr(i.base)} + GST {inr(i.gst)} = <b className="font-semibold text-ink">{inr(i.base + i.gst)}</b>.</p>
              </div>
              {sa.can('approve') ? (
                <div className="flex gap-2 shrink-0 pl-8 @md:pl-0">
                  <Button size="sm" variant="primary" icon={I.Check} onClick={() => approve(i)}>OK and send</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setTarget(i); setSheet('cancel'); }}>Don’t send</Button>
                </div>
              ) : <Pill tone="warn" className="self-start @md:self-center ml-8 @md:ml-0">Waiting for Kiran Reddy</Pill>}
            </div>
          );
        })}

        <Split side={380}>
          <Col>
            <Card className="overflow-hidden">
              <CardHead title="Subscriptions" sub={`One row per paying school · ${sa.schools.filter((s) => s.status === 'Trial').length} trial schools pick their plan when they pay`} icon={I.Layers} />
              <Toolbar className="border-t">
                <SearchBox id="sa-sub-search" value={q} onChange={setQ} placeholder="School, city or school code" />
                <div className="overflow-x-auto no-scrollbar"><Segmented value={f} onChange={setF} options={[{ value: 'all', label: 'All' }, 'Paid', 'Due', 'In grace', 'Overdue']} /></div>
              </Toolbar>
              {subRows.length === 0 ? <Empty icon={I.SearchX} title="No subscriptions match" body="Try a different search or status." action={<Button variant="secondary" onClick={() => { setQ(''); setF('all'); }}>Clear filters</Button>} /> : (
                <>
                  <div className="hidden @lg:block overflow-x-auto scroll-thin">
                    <table className="w-full text-left text-[14px]" style={{ minWidth: 660 }}>
                      <thead>
                        <tr className="text-[12px] text-ink3 font-semibold border-b border-line">
                          <th className="pl-5 px-3 py-3 font-semibold">School</th><th className="px-3 py-3 font-semibold">Plan</th>
                          <th className="px-3 py-3 font-semibold text-right whitespace-nowrap">Paid for / active</th>
                          <th className="px-3 py-3 font-semibold">Renewal</th><th className="px-3 py-3 font-semibold">Status</th><th className="pr-4 w-12" />
                        </tr>
                      </thead>
                      <tbody>
                        {subRows.map((s) => {
                          const over = s.students > s.sub.paid * 1.1;
                          return (
                            <tr key={s.id} className="border-b border-line/70 last:border-0 hover:bg-sunken/60 transition">
                              <td className="pl-5 px-3 py-2.5"><button onClick={() => go('sa', { page: 'school', id: s.id })} className="flex items-center gap-3 text-left"><SchoolLogo name={s.name} size={34} /><span className="min-w-0"><span className="block font-semibold leading-tight hover:underline">{s.name}</span><span className="block text-[12px] text-ink3">{s.city}</span></span></button></td>
                              <td className="px-3 py-2.5"><p className="leading-tight whitespace-nowrap">{s.sub.plan}{s.sub.addons.length ? ' + Hostel' : ''} · <span className="tnum">₹{s.founding ? 120 : PRICE[s.sub.plan]}</span></p><p className="text-[12px] text-ink3">{s.founding ? 'Founding school' : 'Standard price'}{s.sub.group ? ` · group ${s.sub.group}%` : ''}</p></td>
                              <td className="px-3 py-2.5 text-right tnum whitespace-nowrap"><span>{num(s.sub.paid)}</span><span className="text-ink3"> / </span><span className={cx(over && 'text-warn font-semibold')}>{num(s.students)}</span></td>
                              <td className="px-3 py-2.5 whitespace-nowrap"><p>{s.sub.renewal}</p><p className="text-[12px] text-ink3">{s.sub.halves ? 'In two halves' : 'Yearly'}</p></td>
                              <td className="px-3 py-2.5"><Pill tone={SUB_TONE[s.sub.status]}>{s.sub.status}</Pill></td>
                              <td className="pr-4 py-2.5"><IconButton icon={I.Ellipsis} size={34} label={`Actions for ${s.name}`} onClick={() => setAct(s)} /></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <ul className="@lg:hidden divide-y divide-line/70">
                    {subRows.map((s) => (
                      <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                        <button onClick={() => go('sa', { page: 'school', id: s.id })} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                          <SchoolLogo name={s.name} size={42} />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-[15px] truncate">{s.name}</p>
                            <p className="text-[13px] text-ink3 truncate tnum">{s.sub.plan}{s.sub.addons.length ? ' + Hostel' : ''} · {num(s.sub.paid)} paid / {num(s.students)} active</p>
                            <div className="flex gap-1.5 mt-1.5 flex-wrap"><Pill tone={SUB_TONE[s.sub.status]} className="!h-[22px] !text-[11.5px]">{s.sub.status}</Pill><Pill tone="neutral" className="!h-[22px] !text-[11.5px]">Renews {s.sub.renewal}</Pill></div>
                          </div>
                        </button>
                        <IconButton icon={I.Ellipsis} size={36} label={`Actions for ${s.name}`} onClick={() => setAct(s)} />
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <div className="px-4 py-3 border-t border-line text-[13px] text-ink3 tnum">Showing {subRows.length} of {subs.length} · students counted on the billing day, Active students only</div>
            </Card>

            <Card className="overflow-hidden">
              <CardHead title="Invoices" sub="Every GST invoice. Never deleted: a wrong one is cancelled with a reason." icon={I.FileText} />
              <Toolbar className="border-t">
                <SearchBox id="sa-inv-search" value={iq} onChange={setIq} placeholder="Invoice number or school" />
                <div className="overflow-x-auto no-scrollbar"><Segmented value={iF} onChange={setIF} options={[{ value: 'all', label: 'All' }, { value: 'unpaid', label: 'Unpaid' }, { value: 'paid', label: 'Paid' }, { value: 'cancelled', label: 'Cancelled' }]} /></div>
              </Toolbar>
              {invRows.length === 0 ? <Empty icon={I.FileText} title="No invoices match" body="Try a different search or filter." /> : (
                <ul className="-mt-px">{invRows.map((i) => <InvoiceRow key={i.no} i={i} onPaid={() => { setTarget(i); setSheet('paid'); }} onCancel={() => { setTarget(i); setSheet('cancel'); }} />)}</ul>
              )}
              <div className="px-4 py-3 border-t border-line text-[13px] text-ink3 tnum">Showing {invRows.length} of {sa.invoices.length} · paid by Razorpay mark themselves paid</div>
            </Card>
          </Col>

          <Col>
            <Card>
              <CardHead title="Price list" sub="Prices exclude 18% GST" icon={I.Tag} action={sa.can('prices') ? <Button size="sm" variant="ghost" icon={I.Pencil} onClick={() => setSheet('prices')}>Edit</Button> : null} />
              <div className="px-5 pb-5 flex flex-col gap-3">
                {[['Essential', 'Everyday school work: students, attendance, fees, exams, staff and messages', '2,000'], ['Complete', 'Everything in Essential, plus every other module', '5,000']].map(([p, d, cr]) => (
                  <div key={p} className="rounded-xl border border-line p-3.5">
                    <div className="flex items-baseline justify-between gap-2 flex-wrap"><p className="font-semibold text-[15px]">{p}</p><p className="font-display text-[22px] font-semibold tnum leading-tight">₹{PRICE[p]}<span className="text-[12.5px] text-ink3 font-sans font-medium"> per student a year</span></p></div>
                    <p className="text-[12.5px] text-ink3 mt-1">{d}. Minimum 100 students · ₹{PRICE[p] / 2} for each student above 1,000 · {cr} message credits a year.</p>
                  </div>
                ))}
                <dl className="flex flex-col divide-y divide-line/70 text-[13.5px]">
                  {[['Transport add-on', `${inr(BUS)} per bus a year`], ['Hostel add-on', `${inr(HOSTEL)} per school a year`], ['Group of 3 to 4 schools', '10% off'], ['Group of 5 or more', '15% off'], ['Extra message credits', '5,000 for ₹1,000'], ['Trial', '30 days, Essential, 500 credits']].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 py-2"><dt className="text-ink2">{k}</dt><dd className="font-semibold tnum text-right">{v}</dd></div>
                  ))}
                </dl>
                <p className="text-[12.5px] text-ink3 leading-relaxed">Example: 1,236 students on Essential = 1,000 × ₹120 + 236 × ₹60 = {inr(134160)} a year + GST. A price change affects only renewals after the change, never a school mid-year.</p>
              </div>
            </Card>

            <Card>
              <CardHead title="Founding schools" sub="First 20 paying schools only" icon={I.Award} action={<Pill tone="brand">{used} of 20</Pill>} />
              <div className="px-5 pb-5 flex flex-col gap-3">
                <Progress value={(used / 20) * 100} />
                <p className="text-[13.5px] text-ink2 leading-relaxed">Essential price (₹120) locked for 3 years, and every new module switched on free as it is built. {20 - used} places left; the mark is not offered after the 20th.</p>
                {sa.can('discount') && used < 20 && <Button variant="soft" icon={I.Award} className="self-start" onClick={() => { setFoundPick(eligible[0]?.id || ''); setSheet('found'); }}>Mark a founding school</Button>}
              </div>
            </Card>

            <Card>
              <CardHead title="Groups" sub="10% for 3 to 4 schools, 15% for 5 or more" icon={I.Network} />
              <ul className="px-2 pb-2">
                {groups.map((g) => {
                  const pct = g.schools.length >= 5 ? 15 : g.schools.length >= 3 ? 10 : 0;
                  const given = g.schools.find((s) => s.sub?.group)?.sub.group;
                  return <Row key={g.name} icon="Network" title={g.name} sub={`${g.schools.length} schools · ${given ? `${given}% given` : pct ? `${pct}% can be given` : 'no discount until a 3rd school joins'}`}
                    right={sa.can('discount') && pct ? <Button size="sm" variant="ghost" onClick={() => { setDiscGroup(g.name); setDiscVal(String(given || pct)); setSheet('disc'); }}>Discount</Button> : null} />;
                })}
              </ul>
            </Card>

            <Card>
              <CardHead title="What happens by itself" icon={I.Workflow} />
              <ul className="px-5 pb-5 flex flex-col gap-2.5 text-[13.5px] text-ink2 leading-snug">
                {['Students are counted on the billing day: Active students only. Alumni, leavers and enquiries are not counted.', 'Renewal reminders go to the School Admin and Principal 30, 15, 7 and 1 day before.',
                  'A missed renewal gets 15 days of grace with everything working, then the school becomes Suspended.', 'A trial unpaid after 30 days becomes Suspended; its data is kept 90 days.',
                  'At six months, more than 10% extra students makes a top-up invoice that waits for the Owner’s OK.', 'Paying an overdue invoice reactivates a Suspended school at once.'].map((t) => (
                  <li key={t} className="flex gap-2.5"><I.Check size={15} className="text-ok shrink-0 mt-0.5" strokeWidth={2.6} /><span>{t}</span></li>
                ))}
              </ul>
            </Card>
          </Col>
        </Split>
      </div>

      <SubActions s={act} onClose={() => setAct(null)} onPlan={(id) => { setTarget(id); setSheet('plan'); }} onInvoice={(id) => { setTarget(id); setSheet('invoice'); }} onFound={(id) => { setFoundPick(id); setSheet('found'); }} />
      <PlanSheet open={sheet === 'plan'} onClose={close} schoolId={target} />
      <InvoiceSheet open={sheet === 'invoice'} onClose={close} schoolId={typeof target === 'string' ? target : undefined} />
      <MarkPaidSheet invoice={sheet === 'paid' ? target : null} onClose={close} />
      <CancelInvoiceSheet invoice={sheet === 'cancel' ? target : null} onClose={close} />
      <FormSheet open={sheet === 'found'} onClose={close} title="Mark a founding school" sub={`${used} of 20 places used · Owner only`} submitLabel="Mark as founding school"
        onSubmit={() => {
          const s = sa.school(foundPick);
          if (!s) return false;
          sa.updateSchool(s.id, () => ({ founding: true }));
          sa.log(`marked ${s.name} as a founding school (${used + 1} of 20).`, { type: 'Billing', school: s.id });
          toast({ title: `${s.name} is a founding school`, body: `Essential price locked for 3 years · ${used + 1} of 20 used` });
          return true;
        }}>
        {eligible.length === 0 ? <p className="text-[14px] text-ink2">Every paying school is already a founding school.</p> : (
          <Field label="School" required id="fd-school"><Select id="fd-school" value={foundPick} onChange={setFoundPick} options={eligible.map((s) => ({ value: s.id, label: `${s.name} · ${s.sub.plan}` }))} /></Field>
        )}
        <p className="text-[13px] text-ink3">Its price becomes ₹120 per student from the next renewal, locked for 3 years, and every new module is switched on free as it is built.</p>
      </FormSheet>
      <FormSheet open={sheet === 'disc'} onClose={close} title="Group discount" sub={discGroup ? `${discGroup} · Owner only` : ''} submitLabel="Save discount"
        onSubmit={() => {
          const list = sa.schools.filter((s) => s.group === discGroup && s.sub);
          list.forEach((s) => sa.updateSchool(s.id, (x) => ({ sub: { ...x.sub, group: +discVal || undefined } })));
          sa.log(`set the group discount for ${discGroup}.`, { type: 'Billing', change: ['—', discVal === '0' ? 'None' : `${discVal}%`] });
          toast({ title: `${discGroup}: ${discVal === '0' ? 'no group discount' : `${discVal}% group discount`}`, body: 'Applies from each school’s next invoice.' });
          return true;
        }}>
        <Field label="Discount" id="ds-v"><Segmented value={discVal} onChange={setDiscVal} options={[{ value: '0', label: 'None' }, { value: '10', label: '10%' }, { value: '15', label: '15%' }]} className="w-full" /></Field>
        <p className="text-[13px] text-ink3">10% for 3 to 4 schools in a group, 15% for 5 or more. Applies from each school’s next invoice, never mid-year.</p>
      </FormSheet>
      <FormSheet open={sheet === 'prices'} onClose={close} title="Edit price list" sub="Owner only · affects renewals after the date below" submitLabel="Save prices"
        onSubmit={() => { sa.log('updated the price list, valid for renewals from 1 Apr 2027.', { type: 'Billing' }); toast({ title: 'Price list saved', body: 'Only renewals from 1 Apr 2027 use the new prices.' }); return true; }}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Essential, per student" id="pr-e"><Input id="pr-e" defaultValue="120" className="tnum" inputMode="numeric" /></Field>
          <Field label="Complete, per student" id="pr-c"><Input id="pr-c" defaultValue="200" className="tnum" inputMode="numeric" /></Field>
          <Field label="Hostel, per school" id="pr-h"><Input id="pr-h" defaultValue="10000" className="tnum" inputMode="numeric" /></Field>
          <Field label="Transport, per bus" id="pr-t"><Input id="pr-t" defaultValue="1500" className="tnum" inputMode="numeric" /></Field>
        </div>
        <Field label="Valid for renewals from" required id="pr-from" hint="DD-MM-YYYY. Schools mid-year keep their price."><Input id="pr-from" defaultValue="01-04-2027" className="tnum" /></Field>
      </FormSheet>
    </div>
  );
}

// Actions for one subscription, as a sheet (no menus that a table could clip)
function SubActions({ s, onClose, onPlan, onInvoice, onFound }) {
  const { go } = useNav();
  const sa = useSA();
  if (!s) return <Sheet open={false} onClose={onClose} />;
  const used = sa.schools.filter((x) => x.founding).length;
  const items = [
    ['School', 'Open school', 'Admins, setup, usage and status history', () => go('sa', { page: 'school', id: s.id })],
    ...(sa.can('plan') ? [['Layers', 'Change plan or add-ons', 'Upgrade from today, or downgrade at renewal', () => onPlan(s.id)]] : []),
    ...(sa.can('invoice') ? [['Send', 'Send an invoice', 'Renewal or message credits, with a Razorpay link', () => onInvoice(s.id)]] : []),
    ...(sa.can('discount') && !s.founding && used < 20 ? [['Award', 'Mark as founding school', `${used} of 20 places used`, () => onFound(s.id)]] : []),
  ];
  return (
    <Sheet open={!!s} onClose={onClose} title={s.name} sub={`${s.sub.plan}${s.sub.addons.length ? ' + Hostel' : ''} · ${num(s.sub.paid)} students paid for · ${s.sub.status}`}>
      <div className="flex flex-col gap-2">
        {items.map(([ic, l, sub, fn]) => (
          <button key={l} onClick={() => { onClose(); fn(); }} className="flex items-center gap-3 text-left p-3 rounded-2xl border border-line hover:border-brand/40 hover:bg-brand/5 transition">
            <span className="w-10 h-10 rounded-xl bg-brand/10 text-brand grid place-items-center shrink-0"><Icon name={ic} size={19} /></span>
            <span className="min-w-0"><span className="block font-semibold text-[14.5px]">{l}</span><span className="block text-[12.5px] text-ink3">{sub}</span></span>
          </button>
        ))}
        {!sa.can('plan') && <p className="text-[12.5px] text-ink3 px-1 pt-1">As {sa.role.label}, you can see billing but not change it.</p>}
      </div>
    </Sheet>
  );
}

/* ======================= 3.6 Team ======================= */
const TEAM_TONE = { Active: 'ok', Invited: 'info', Disabled: 'neutral' };
function TeamPage() {
  const sa = useSA();
  const toast = useToast();
  const [setAsk, askEl] = useAsk();
  const [q, setQ] = useState('');
  const [f, setF] = useState('all');
  const [invite, setInvite] = useState(false);
  const [roleFor, setRoleFor] = useState(null);
  const [newRole, setNewRole] = useState('Support');
  const [disableFor, setDisableFor] = useState(null);
  const [lastOwner, setLastOwner] = useState(false);
  const [nf, setNf] = useState({ name: '', mobile: '', email: '', role: 'Support' });
  const [tried, setTried] = useState(false);
  const owner = sa.can('team');
  const activeOwners = sa.team.filter((m) => m.role === 'Owner' && m.status === 'Active');
  const rows = sa.team.filter((m) => (f === 'all' || m.status === f) && (!q.trim() || `${m.name} ${m.email} ${m.phone} ${m.role}`.toLowerCase().includes(q.trim().toLowerCase())));
  const setM = (id, patch) => sa.setTeam((t) => t.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const isLastOwner = (m) => m.role === 'Owner' && m.status === 'Active' && activeOwners.length === 1;
  const d = digits(nf.mobile);
  const nerr = { name: !nf.name.trim() ? 'Enter the full name' : '', mobile: d.length !== 10 || !/^[6-9]/.test(d) ? 'Enter a 10-digit Indian mobile number' : '' };

  const actions = (m) => {
    if (!owner) return null;
    if (m.status === 'Disabled') return <Button size="sm" variant="ghost" onClick={() => setAsk({ title: `Enable ${m.name} again?`, label: `Send invite to ${m.name}`, body: <p>{m.name} gets a new invite link on +91 {mask(m.phone)} and sets a new password, with two-step login.</p>, run: () => { setM(m.id, { status: 'Invited', last: 'Invite sent today' }); sa.log(`enabled ${m.name} again and sent a new invite.`, { type: 'Team', change: ['Disabled', 'Invited'] }); toast({ title: `Invite sent to ${m.name}` }); } })}>Enable again</Button>;
    return (
      <>
        {m.status === 'Invited' && <Button size="sm" variant="secondary" icon={I.Send} onClick={() => { setM(m.id, { last: 'Invite sent again today' }); sa.log(`resent the team invite to ${m.name}, +91 ${mask(m.phone)}.`, { type: 'Team' }); toast({ title: `Invite sent again to ${m.name}`, body: `WhatsApp and SMS to +91 ${mask(m.phone)}` }); }}>Resend</Button>}
        <Button size="sm" variant="secondary" icon={I.UserCog} onClick={() => { setRoleFor(m); setNewRole(m.role); }}>Change role</Button>
        <Button size="sm" variant="ghost" icon={isLastOwner(m) ? I.Lock : I.UserX} onClick={() => (isLastOwner(m) ? setLastOwner(true) : setDisableFor(m))}>Disable</Button>
      </>
    );
  };

  return (
    <div>
      <PageHead title="Team" sub="DREAM TEAM SERVICES’ own console users. Two-step login is always on."
        actions={owner ? <Button variant="primary" icon={I.UserPlus} onClick={() => { setNf({ name: '', mobile: '', email: '', role: 'Support' }); setTried(false); setInvite(true); }}>Invite team member</Button> : null} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        {!owner && <Banner tone="info" title={`You are viewing as ${sa.role.label}.`}>Only the Owner can invite, change roles or disable team members.</Banner>}
        <div className="grid @md:grid-cols-3 gap-3">
          {Object.values(SA_ROLES).map((r) => {
            const n = sa.team.filter((m) => m.role === r.label && m.status !== 'Disabled').length;
            return (
              <Card key={r.id} className="p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="w-9 h-9 rounded-lg bg-brand/10 text-brand grid place-items-center"><r.icon size={18} /></span>
                  <p className="font-semibold text-[15px] flex-1">{r.label}</p>
                  <Pill tone="neutral">{n} {n === 1 ? 'person' : 'people'}</Pill>
                </div>
                <p className="text-[13px] text-ink3 leading-snug">{r.does}</p>
              </Card>
            );
          })}
        </div>
        <Card className="overflow-hidden">
          <Toolbar>
            <SearchBox id="sa-team-search" value={q} onChange={setQ} placeholder="Name, phone, email or role" />
            <div className="overflow-x-auto no-scrollbar"><Segmented value={f} onChange={setF} options={[{ value: 'all', label: 'All' }, 'Active', 'Invited', 'Disabled']} /></div>
          </Toolbar>
          {rows.length === 0 ? <Empty icon={I.SearchX} title="Nobody matches" body="Try a different name or status." /> : (
            <>
              <div className="hidden @lg:block overflow-x-auto scroll-thin">
                <table className="w-full text-left text-[14px]" style={{ minWidth: 900 }}>
                  <thead><tr className="text-[12px] text-ink3 font-semibold border-b border-line">
                    {['Name', 'Phone', 'Role', 'Status', 'Last sign-in'].map((h, i) => <th key={h} className={cx('px-3 py-3 font-semibold', i === 0 && 'pl-5')}>{h}</th>)}
                    {owner && <th className="px-3 pr-5 py-3 font-semibold text-right">Actions</th>}
                  </tr></thead>
                  <tbody>
                    {rows.map((m) => (
                      <tr key={m.id} className="border-b border-line/70 last:border-0">
                        <td className="pl-5 px-3 py-2.5"><div className="flex items-center gap-3"><Avatar name={m.name} size={36} /><div className="min-w-0"><p className="font-semibold leading-tight">{m.name}{m.name === sa.me.name && <span className="text-ink3 font-normal"> (you)</span>}</p><p className="text-[12.5px] text-ink3">{m.email}</p></div></div></td>
                        <td className="px-3 py-2.5 tnum whitespace-nowrap">+91 {m.phone}</td>
                        <td className="px-3 py-2.5"><Pill tone={m.role === 'Owner' ? 'brand' : 'neutral'}>{m.role}</Pill></td>
                        <td className="px-3 py-2.5"><Pill tone={TEAM_TONE[m.status]} dot>{m.status}</Pill></td>
                        <td className="px-3 py-2.5 text-ink2"><p className="leading-tight">{m.last}</p>{m.status === 'Active' && <p className="text-[12px] text-ink3">Two-step login on</p>}</td>
                        {owner && <td className="px-3 pr-5 py-2.5"><div className="flex gap-2 justify-end">{actions(m)}</div></td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="@lg:hidden divide-y divide-line/70">
                {rows.map((m) => (
                  <li key={m.id} className="px-4 py-3 flex flex-col gap-2.5">
                    <div className="flex items-center gap-3">
                      <Avatar name={m.name} size={42} />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[15px] truncate">{m.name}{m.name === sa.me.name && <span className="text-ink3 font-normal"> (you)</span>}</p>
                        <p className="text-[13px] text-ink3 truncate tnum">+91 {m.phone} · {m.last}</p>
                        <div className="flex gap-1.5 mt-1.5"><Pill tone={m.role === 'Owner' ? 'brand' : 'neutral'} className="!h-[22px] !text-[11.5px]">{m.role}</Pill><Pill tone={TEAM_TONE[m.status]} className="!h-[22px] !text-[11.5px]">{m.status}</Pill></div>
                      </div>
                    </div>
                    {owner && <div className="flex gap-2 flex-wrap pl-[54px]">{actions(m)}</div>}
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="px-4 py-3 border-t border-line text-[13px] text-ink3 tnum">Showing {rows.length} of {sa.team.length} · console users have no School Access and cannot open a school’s data</div>
        </Card>
      </div>

      <FormSheet open={invite} onClose={() => setInvite(false)} title="Invite team member" sub="They get a link on WhatsApp and SMS, confirm a code and set their own password" submitLabel="Send invite" busyLabel="Sending…"
        onSubmit={() => {
          setTried(true);
          if (Object.values(nerr).some(Boolean)) return false;
          sa.setTeam((t) => [...t, { id: 't' + Date.now(), name: nf.name.trim(), role: nf.role, phone: nf.mobile, email: nf.email, status: 'Invited', last: 'Invite sent today' }]);
          sa.log(`invited ${nf.name.trim()} to the team as ${nf.role}, on +91 ${mask(nf.mobile)}.`, { type: 'Team' });
          toast({ title: `Invite sent to ${nf.name.trim()}`, body: `${nf.role} · works for 3 days` });
          return true;
        }}>
        <Field label="Full name" required id="tm-name" error={tried && nerr.name}><Input id="tm-name" value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} error={tried && nerr.name} placeholder="Pavan Kalyan" /></Field>
        <Field label="Mobile number" required id="tm-mobile" error={tried && nerr.mobile} hint="Becomes their username. One-time codes go here.">
          <div className="relative"><span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3 text-[15px]">+91</span><Input id="tm-mobile" inputMode="numeric" value={nf.mobile} onChange={(e) => setNf({ ...nf, mobile: e.target.value.replace(/[^\d ]/g, '').slice(0, 11) })} error={tried && nerr.mobile} className="pl-12 tnum" placeholder="98480 12345" /></div>
        </Field>
        <Field label="Email" id="tm-email"><Input id="tm-email" type="email" value={nf.email} onChange={(e) => setNf({ ...nf, email: e.target.value })} placeholder="name@dreamteamservices.in" /></Field>
        <Field label="Role" required id="tm-role" hint={SA_ROLES[nf.role.toLowerCase()].does}><Segmented value={nf.role} onChange={(v) => setNf({ ...nf, role: v })} options={['Owner', 'Onboarding', 'Support']} className="w-full" /></Field>
        {!Object.values(nerr).some(Boolean) && <p className="rounded-xl bg-sunken p-3 text-[14px]">Send to <b className="font-semibold">{nf.name.trim()}</b>, +91 {mask(nf.mobile)}?</p>}
      </FormSheet>

      <FormSheet open={!!roleFor} onClose={() => setRoleFor(null)} title={roleFor ? `Change ${roleFor.name}’s role` : ''} sub="Takes effect at their next page load. Recorded in the Activity Log." submitLabel="Save role"
        onSubmit={() => {
          if (roleFor.role === newRole) return true;
          if (isLastOwner(roleFor)) { toast({ title: 'DREAM TEAM needs at least one active Owner', body: 'Make someone else Owner first.', tone: 'bad' }); return false; }
          setM(roleFor.id, { role: newRole });
          sa.log(`changed ${roleFor.name}’s role.`, { type: 'Team', change: [roleFor.role, newRole] });
          toast({ title: `${roleFor.name} is now ${newRole}` });
          return true;
        }}>
        {roleFor && <>
          <Field label="Role" id="cr-role" hint={SA_ROLES[newRole.toLowerCase()].does}><Segmented value={newRole} onChange={setNewRole} options={['Owner', 'Onboarding', 'Support']} className="w-full" /></Field>
          {isLastOwner(roleFor) && newRole !== 'Owner' && <Banner tone="warn" title="DREAM TEAM needs at least one active Owner.">Make someone else Owner first, then change {roleFor.name}’s role.</Banner>}
        </>}
      </FormSheet>

      <ActSheet open={!!disableFor} onClose={() => setDisableFor(null)} title={disableFor ? `Disable ${disableFor.name}?` : ''} sub="They cannot sign in to the console any more" confirmLabel={disableFor ? `Disable ${disableFor.name}` : 'Disable'} danger
        reasonPlaceholder="Left DREAM TEAM on 9 Oct."
        onConfirm={(r) => { setM(disableFor.id, { status: 'Disabled', last: `Disabled today: ${r}` }); sa.log(`disabled ${disableFor.name}’s console login: “${r}”`, { type: 'Team', change: ['Active', 'Disabled'] }); toast({ title: `${disableFor.name} can no longer sign in`, body: 'Their history stays in the Activity Log.' }); }}>
        <p className="text-[14px] text-ink2 leading-relaxed">Their sign-in stops at once, on every device. Everything they did stays in the Activity Log.</p>
      </ActSheet>

      <Sheet open={lastOwner} onClose={() => setLastOwner(false)} title="The last Owner cannot be disabled" sub="DREAM TEAM SERVICES">
        <div className="flex flex-col gap-4">
          <Banner tone="warn" title="DREAM TEAM needs at least one active Owner.">Make someone else Owner first.</Banner>
          <p className="text-[14px] text-ink2 leading-relaxed">{activeOwners[0]?.name} is the only active Owner. Without an Owner, nobody could manage the team, close a school or mark a payment.</p>
          <div className="flex justify-end"><Button variant="secondary" onClick={() => setLastOwner(false)}>Close</Button></div>
        </div>
      </Sheet>
      {askEl}
    </div>
  );
}

/* ======================= 3.7 Activity Log ======================= */
function ActivityPage() {
  const { go } = useNav();
  const sa = useSA();
  const [q, setQ] = useState('');
  const [who, setWho] = useState('all');
  const [school, setSchool] = useState('all');
  const [type, setType] = useState('all');
  const [when, setWhen] = useState('all');
  const TEAM_FIRST = ['Kiran', 'Ravi', 'Neha', 'Arjun', 'Sowmya'];
  const rows = sa.logs.filter((l) => {
    const k = dayKey(l.date);
    return (who === 'all' || (who === 'Automatic' ? l.who === 'Automatic' : who === 'school' ? !!l.role && !SA_ROLE_LABELS.includes(l.role) : l.who === who)) &&
      (school === 'all' || l.school === school) && (type === 'all' || l.type === type) &&
      (when === 'all' || (when === 'today' ? k === 20261009 : when === 'week' ? k >= 20261003 : when === 'month' ? k >= 20261001 : k < 20261001)) &&
      (!q.trim() || `${l.who} ${l.role || ''} ${l.text}`.toLowerCase().includes(q.trim().toLowerCase()));
  });
  const groups = [];
  rows.forEach((l) => { const g = groups[groups.length - 1]; if (g && g.date === l.date) g.items.push(l); else groups.push({ date: l.date, items: [l] }); });
  const label = (d) => (d === '9 Oct 2026' ? 'Today · Fri 9 Oct 2026' : d === '8 Oct 2026' ? 'Yesterday · Thu 8 Oct 2026' : d);
  const clear = () => { setQ(''); setWho('all'); setSchool('all'); setType('all'); setWhen('all'); };

  return (
    <div>
      <PageHead title="Activity Log" sub="Every action anyone in the console took. Nobody can edit or delete a line."
        actions={<ExportBtn what={`${rows.length} log lines`} file="activity-log-9-Oct-2026.xlsx" />} />
      <Card className="overflow-hidden">
        <div className="grid gap-2.5 p-3 border-b border-line @md:grid-cols-2 @xl:grid-cols-[minmax(0,1fr)_170px_230px_170px_150px]">
          <SearchBox id="sa-log-search" value={q} onChange={setQ} placeholder="Search what happened" className="@md:col-span-2 @xl:col-span-1" />
          <Select id="sa-log-who" value={who} onChange={setWho} options={[{ value: 'all', label: 'Everyone' }, ...TEAM_FIRST.map((n) => ({ value: n, label: sa.team.find((m) => m.name.startsWith(n))?.name || n })), { value: 'Automatic', label: 'Automatic' }, { value: 'school', label: 'School people' }]} />
          <Select id="sa-log-school" value={school} onChange={setSchool} options={[{ value: 'all', label: 'All schools' }, ...sa.schools.map((s) => ({ value: s.id, label: s.name }))]} />
          <Select id="sa-log-type" value={type} onChange={setType} options={[{ value: 'all', label: 'Every type of action' }, ...Object.keys(LOG_TYPES)]} />
          <Select id="sa-log-when" value={when} onChange={setWhen} options={[{ value: 'all', label: 'Any date' }, { value: 'today', label: 'Today' }, { value: 'week', label: 'Last 7 days' }, { value: 'month', label: 'This month' }, { value: 'older', label: 'Before October' }]} />
        </div>
        {rows.length === 0 ? <Empty icon={I.SearchX} title="No lines match" body="Try a different person, school, type or date." action={<Button variant="secondary" onClick={clear}>Clear filters</Button>} /> : groups.map((g) => (
          <div key={g.date}>
            <p className="eyebrow text-ink3 px-5 pt-4 pb-2">{label(g.date)}</p>
            <ul>
              {g.items.map((l) => {
                const [ic, tone] = LOG_TYPES[l.type] || ['Circle', 'neutral'];
                const s = l.school && sa.school(l.school);
                return (
                  <li key={l.id} className="flex gap-3 px-5 py-3 border-t border-line/70">
                    <span className={cx('w-9 h-9 rounded-xl grid place-items-center shrink-0', TONE_SOFT[tone])}><Icon name={ic} size={17} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] leading-snug"><span className="font-semibold tnum">{l.date}, {l.time}.</span> {l.who}{l.role ? ` (${l.role})` : ':'} {l.text}</p>
                      {l.change && (
                        <p className="mt-1.5 flex items-center gap-1.5 flex-wrap text-[12.5px]">
                          <span className="px-2 h-6 rounded-md bg-sunken text-ink2 inline-flex items-center">{l.change[0]}</span>
                          <I.ArrowRight size={13} className="text-ink3" />
                          <span className="px-2 h-6 rounded-md bg-brand/10 text-brand font-semibold inline-flex items-center">{l.change[1]}</span>
                        </p>
                      )}
                      <p className="text-[12.5px] text-ink3 mt-1 flex items-center gap-1.5 flex-wrap">
                        <span>{l.type}</span>
                        {s && <><span aria-hidden="true">·</span><button onClick={() => go('sa', { page: 'school', id: s.id })} className="font-semibold text-brand hover:underline">{s.name}</button></>}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        <div className="flex flex-col @md:flex-row @md:items-center justify-between gap-1 px-4 py-3 border-t border-line text-[13px] text-ink3">
          <span className="tnum">Showing {rows.length} of {sa.logs.length} lines</span>
          <span className="flex items-center gap-1.5"><I.Lock size={13} />Read-only. Lines cannot be edited or deleted.</span>
        </div>
      </Card>
    </div>
  );
}
const SA_ROLE_LABELS = ['Owner', 'Onboarding', 'Support'];

/* ======================= 4. Add School ======================= */
const BLANK = { name: '', city: '', state: 'Telangana', board: 'CBSE', type: 'Day school', phone: '', email: '', approx: '', group: 'None', newGroup: '',
  admin: '', mobile: '', aemail: '', arole: 'School Admin', ch: { WhatsApp: true, SMS: true, Email: false }, start: 'Trial', plan: 'Essential', hostel: false, mods: { ...MOD_DEFAULTS['Day school'] } };
const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const joinAnd = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

function AddSchool() {
  const { go } = useNav();
  const sa = useSA();
  const toast = useToast();
  const [f, setF] = useState(BLANK);
  const [tried, setTried] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState(null);

  if (!sa.can('add')) {
    return (
      <div className="max-w-xl mx-auto">
        <Empty icon={I.Lock} title="Adding schools is not in your role" body={`As ${sa.role.label}, you can see schools and help them. Owner and Onboarding add new schools.`}
          action={<Button variant="secondary" icon={I.School} onClick={() => go('sa', { page: 'schools' })}>Go to Schools</Button>} />
      </div>
    );
  }
  if (made) return <AddDone made={made} onAgain={() => { setMade(null); setF(BLANK); setTried(false); }} />;

  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v && v.target ? v.target.value : v }));
  const setType = (t) => setF((x) => ({ ...x, type: t, mods: { ...MOD_DEFAULTS[t] }, hostel: t === 'Boarding school' }));
  const pd = digits(f.phone);
  const md = digits(f.mobile);
  const groupName = f.group === 'new' ? f.newGroup.trim() : f.group === 'None' ? null : f.group;
  const dup = f.name.trim() && f.city.trim() ? sa.schools.find((s) => norm(s.name.split(',')[0]) === norm(f.name) && norm(s.city) === norm(f.city)) : null;
  const phoneDup = pd.length === 10 ? sa.schools.find((s) => digits(s.phone) === pd) : null;
  const existing = md.length === 10 ? sa.schools.flatMap((s) => s.admins.filter((a) => digits(a.phone) === md && a.status !== 'Disabled').map((a) => ({ a, s })))[0] : null;
  const sameGroup = existing && groupName && existing.s.group === groupName;
  const channels = Object.keys(f.ch).filter((k) => f.ch[k]);
  const modCount = CORE.length + OPTIONAL.filter(([k]) => f.mods[k]).length;
  const ini = f.name.replace(/[^A-Za-z ]/g, ' ').split(/\s+/).filter((w) => w && !['of', 'the', 'and'].includes(w.toLowerCase())).slice(0, 3).map((w) => w[0].toUpperCase()).join('') || 'NEW';
  const cc = CITY_CODE[f.city.trim()] || (f.city.trim().replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'XXX');
  const code = `${ini}-${cc}-${String(sa.schools.filter((s) => s.id.startsWith(`${ini}-${cc}-`)).length + 1).padStart(3, '0')}`;
  const err = {
    name: !f.name.trim() ? 'Enter the school’s name' : '',
    city: !f.city.trim() ? 'Enter the city' : '',
    phone: !pd ? 'Enter the school’s phone number' : pd.length !== 10 ? 'Enter a 10-digit number' : '',
    newGroup: f.group === 'new' && !f.newGroup.trim() ? 'Name the new group' : '',
    admin: !f.admin.trim() ? 'Enter the first School Admin’s full name' : '',
    mobile: !md ? 'Enter their mobile number. It becomes their username.' : md.length !== 10 || !/^[6-9]/.test(md) ? 'Enter a 10-digit Indian mobile number' : '',
    ch: !channels.length ? 'Pick at least one way to send the invite' : '',
    aemail: f.ch.Email && !f.aemail.trim() ? 'Add their email to also send the invite by email' : '',
  };
  const show = (k) => tried && err[k];
  const bad = Object.values(err).filter(Boolean).length;
  const approx = +digits(f.approx) || 0;
  const est = f.start === 'Active' ? yearly(f.plan, approx || 100) + (f.hostel ? HOSTEL : 0) : 0;

  const steps = [
    ['Building2', f.name.trim() && f.city.trim() ? <>The school record is made with school code <span className="font-mono text-[12.5px]">{code}</span>, and its first campus.</> : <>The school record is made with its own school code, made from the name and city (like <span className="font-mono text-[12.5px]">SPS-JAI-001</span>), and its first campus.</>],
    ['Database', 'Its own data space is made, kept apart from every other school.'],
    ['UsersRound', 'The starting roles are made: Principal / Owner, School Admin, Accountant, Teacher and the rest.'],
    ['LayoutGrid', `${modCount} modules are switched on, with the ${f.board} defaults ready to apply.`],
    ['KeyRound', sameGroup ? `${f.admin || 'The admin'} already has a login in ${groupName}, so only a School Access entry for this school is added.` : `${f.admin || 'The School Admin'}’s login is made with status Invited, as ${f.arole}.`],
    ['Send', `The invite goes out on ${joinAnd(channels) || 'the channels chosen'}.`],
    ['School', `The school appears in Schools as ${f.start}, and in the Activity Log.`],
  ];

  const submit = () => { setTried(true); if (bad) return; setConfirm(true); };
  const create = () => {
    setBusy(true);
    setTimeout(() => {
      const t = nowTime();
      const ns = SC({
        id: code, name: f.name.trim(), city: f.city.trim(), state: f.state, board: f.board, type: f.type, status: f.start, phone: f.phone, email: f.email,
        address: f.city.trim(), group: groupName, approx: approx || undefined, modules: modCount,
        optional: OPTIONAL.filter(([k]) => f.mods[k]).length ? `${joinAnd(OPTIONAL.filter(([k]) => f.mods[k]).map(([k]) => k))} on` : 'Only the core modules',
        admins: [AD(f.admin.trim(), f.mobile, sameGroup ? 'Active' : 'Invited', sameGroup ? `Same login as at ${existing.s.name} (${groupName}) · picks this school with the School switcher` : `Invite sent today, ${t} by ${sa.me.name} · link works until 12 Oct`, { email: f.aemail, role: f.arole })],
        setup: 0, added: '9 Oct 2026', addedBy: sa.me.name, startedActive: f.start === 'Active', act: '9 Oct 2026',
        trialEnds: f.start === 'Trial' ? '8 Nov 2026' : null, trialLeft: 30, trialCredits: 500,
        sub: f.start === 'Active' ? { plan: f.plan, addons: f.hostel ? ['Hostel'] : [], paid: Math.max(approx, 100), renewal: '9 Oct 2027', halves: false, status: 'Due', credits: f.plan === 'Complete' ? 5000 : 2000 } : null,
      });
      sa.addSchool(ns);
      sa.log(`added ${ns.name} (${f.board}, ${f.type}) as ${f.start}${groupName ? ` in ${groupName}` : ''} and sent a login invite to ${f.admin.trim()}, +91 ${mask(f.mobile)}.`, { type: 'School added', school: code, time: t });
      setBusy(false); setConfirm(false);
      setMade({ ...ns, time: t, channels, steps, sameGroup, groupName });
      toast({ title: `${ns.name} added`, body: `School code ${code} · invite sent to ${f.admin.trim()}` });
    }, 900);
  };
  const fillExample = () => { setTried(false); setF({ ...BLANK, name: 'Sunrise Public School', city: 'Jaipur', state: 'Rajasthan', phone: '94140 55218', email: 'office.jaipur@sunriseps.in', approx: '420', admin: 'Anita Sharma', mobile: '94140 72123', aemail: 'anita.sharma.jpr@gmail.com' }); };
  const fillDup = () => { setTried(false); setF({ ...BLANK, name: 'Green Valley School', city: 'Jaipur', state: 'Rajasthan', board: 'State board', phone: '98290 45500' }); };

  return (
    <div>
      <BackLink label="Schools" />
      <PageHead title="Add School" sub="One screen in three short parts. Takes about two minutes." />
      <Split side={380}>
        <Col>
          <Card>
            <CardHead title="The school" sub="Sets the school’s starting defaults" icon={NUMS[0]} />
            <div className="grid @md:grid-cols-2 gap-4 px-5 pb-5">
              <Field label="School name" required id="ad-name" error={show('name')} className="@md:col-span-2">
                <Input id="ad-name" value={f.name} onChange={set('name')} error={show('name')} placeholder="Sunrise Public School" autoComplete="off" />
              </Field>
              <Field label="City" required id="ad-city" error={show('city')}><Input id="ad-city" value={f.city} onChange={set('city')} error={show('city')} placeholder="Jaipur" /></Field>
              <Field label="State" required id="ad-state"><Select id="ad-state" value={f.state} onChange={set('state')} options={STATES} /></Field>
              {dup && (
                <div className="@md:col-span-2 rounded-2xl bg-warn/12 px-4 py-3 flex flex-col @md:flex-row @md:items-center gap-3 text-[14px]">
                  <I.TriangleAlert size={19} className="text-warn shrink-0 hidden @md:block" />
                  <p className="flex-1 text-ink2"><b className="font-semibold text-ink">A school named {dup.name} in {dup.city} already exists, added {dup.added.replace(/ 20\d\d$/, '')}.</b> Open it instead, or change the name or city if this is a different school.</p>
                  <Button size="sm" variant="secondary" onClick={() => go('sa', { page: 'school', id: dup.id })}>Open the existing school</Button>
                </div>
              )}
              <Field label="Board" required id="ad-board" hint="Sets the school’s starting defaults"><Select id="ad-board" value={f.board} onChange={set('board')} options={BOARDS} /></Field>
              <Field label="Group" id="ad-group" error={show('newGroup')} hint="Only for a school that belongs to a group of schools">
                <Select id="ad-group" value={f.group} onChange={set('group')} options={['None', ...[...new Set(sa.schools.map((s) => s.group).filter(Boolean))].map((g) => ({ value: g, label: `${g} (${sa.schools.filter((s) => s.group === g).length} schools)` })), { value: 'new', label: 'Make a new group…' }]} />
              </Field>
              {f.group === 'new' && <Field label="New group name" required id="ad-newgroup" error={show('newGroup')} className="@md:col-span-2"><Input id="ad-newgroup" value={f.newGroup} onChange={set('newGroup')} error={show('newGroup')} placeholder="Green Valley Group" /></Field>}
              <Field label="School type" required id="ad-type" hint="Decides which modules start switched on" className="@md:col-span-2">
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="School type">
                  {TYPES.map(([v, ic, sub]) => {
                    const on = f.type === v;
                    return (
                      <button key={v} type="button" role="radio" aria-checked={on} onClick={() => setType(v)}
                        className={cx('rounded-2xl border-2 p-3 text-left transition flex flex-col gap-1.5 min-w-0', on ? 'border-brand bg-brand/5' : 'border-line hover:border-ink3/40')}>
                        <Icon name={ic} size={18} className={on ? 'text-brand' : 'text-ink3'} />
                        <span className="text-[13.5px] font-semibold leading-tight">{v}</span>
                        <span className="text-[11.5px] text-ink3 leading-snug hidden @sm:block">{sub}</span>
                      </button>
                    );
                  })}
                </div>
              </Field>
              <Field label="School phone" required id="ad-phone" error={show('phone')}>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3 text-[15px]">+91</span>
                  <Input id="ad-phone" inputMode="numeric" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/[^\d ]/g, '').slice(0, 11) })} error={show('phone')} className="pl-12 tnum" placeholder="94140 55218" />
                </div>
                {phoneDup && !show('phone') && <p className="text-[12.5px] text-warn flex items-center gap-1.5"><I.TriangleAlert size={14} className="shrink-0" />{phoneDup.name}, {phoneDup.city} already uses this number.</p>}
              </Field>
              <Field label="School email" id="ad-email"><Input id="ad-email" type="email" value={f.email} onChange={set('email')} placeholder="office@school.in" /></Field>
              <Field label="Approximate number of students" id="ad-approx" hint="Helps plan support and the first invoice"><Input id="ad-approx" inputMode="numeric" value={f.approx} onChange={(e) => setF({ ...f, approx: e.target.value.replace(/\D/g, '').slice(0, 5) })} className="tnum" placeholder="420" /></Field>
            </div>
          </Card>

          <Card>
            <CardHead title="The first School Admin" sub="They create every other login in the school" icon={NUMS[1]} />
            <div className="grid @md:grid-cols-2 gap-4 px-5 pb-5">
              <Field label="Full name" required id="ad-admin" error={show('admin')} hint={!show('admin') ? 'Usually the owner, principal or office head.' : null}><Input id="ad-admin" value={f.admin} onChange={set('admin')} error={show('admin')} placeholder="Anita Sharma" /></Field>
              <Field label="Mobile number" required id="ad-mobile" error={show('mobile')} hint={!show('mobile') ? 'Becomes their username.' : null}>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3 text-[15px]">+91</span>
                  <Input id="ad-mobile" inputMode="numeric" value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value.replace(/[^\d ]/g, '').slice(0, 11) })} error={show('mobile')} className="pl-12 tnum" placeholder="98480 12345" />
                </div>
              </Field>
              {existing && (
                <div className={cx('@md:col-span-2 rounded-2xl px-4 py-3 flex items-start gap-3 text-[14px]', sameGroup ? 'bg-info/8' : 'bg-warn/12')}>
                  {sameGroup ? <I.Info size={19} className="text-info shrink-0 mt-0.5" /> : <I.TriangleAlert size={19} className="text-warn shrink-0 mt-0.5" />}
                  <p className="text-ink2">{sameGroup
                    ? <><b className="font-semibold text-ink">{existing.a.name} already has a login at {existing.s.name} ({groupName}).</b> Only a School Access entry for this school is added; they pick the school with the School switcher.</>
                    : <><b className="font-semibold text-ink">This number is already {existing.a.name}’s School Admin login at {existing.s.name}.</b> Use another number, or put this school in the same Group{existing.s.group ? ` (${existing.s.group})` : ''}.</>}</p>
                </div>
              )}
              <Field label="Email" id="ad-aemail" error={show('aemail')} hint={!show('aemail') ? 'Needed only to also send the invite by email.' : null}><Input id="ad-aemail" type="email" value={f.aemail} onChange={set('aemail')} error={show('aemail')} placeholder="name@school.in" /></Field>
              <Field label="Role in the school" required id="ad-arole" hint="Both can create the school’s other logins."><Segmented value={f.arole} onChange={set('arole')} options={['School Admin', 'Principal / Owner']} className="w-full" /></Field>
              <Field label="Send the invite by" required id="ad-ch" error={show('ch')} className="@md:col-span-2"><Channels value={f.ch} onChange={(ch) => setF({ ...f, ch })} /></Field>
            </div>
          </Card>

          <Card>
            <CardHead title="Start" sub="Trial or paying, and which modules start switched on" icon={NUMS[2]} />
            <div className="flex flex-col gap-4 px-5 pb-5">
              <Field label="Start as" required id="ad-start">
                <div className="grid @sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Start as">
                  {[['Trial', 'Hourglass', '30 days, everything in Essential, 500 message credits. The school picks its plan when it pays.'], ['Active', 'CirclePlay', 'Starts paying now. The first invoice goes out with a Razorpay link.']].map(([v, ic, sub]) => {
                    const on = f.start === v;
                    return (
                      <button key={v} type="button" role="radio" aria-checked={on} onClick={() => setF({ ...f, start: v })}
                        className={cx('rounded-2xl border-2 p-3.5 text-left transition flex gap-3', on ? 'border-brand bg-brand/5' : 'border-line hover:border-ink3/40')}>
                        <Icon name={ic} size={19} className={cx('shrink-0 mt-0.5', on ? 'text-brand' : 'text-ink3')} />
                        <span className="min-w-0"><span className="block font-semibold text-[14.5px]">{v}</span><span className="block text-[12.5px] text-ink3 leading-snug mt-0.5">{sub}</span></span>
                      </button>
                    );
                  })}
                </div>
              </Field>
              {f.start === 'Active' && (
                <Field label="Plan" required id="ad-plan">
                  <div className="grid @sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Plan">
                    {['Essential', 'Complete'].map((p) => {
                      const on = f.plan === p;
                      return (
                        <button key={p} type="button" role="radio" aria-checked={on} onClick={() => setF({ ...f, plan: p })}
                          className={cx('rounded-2xl border-2 p-3.5 text-left transition', on ? 'border-brand bg-brand/5' : 'border-line hover:border-ink3/40')}>
                          <span className="flex items-center justify-between"><span className="font-semibold text-[14.5px]">{p}</span>{on && <I.CircleCheck size={17} className="text-brand" />}</span>
                          <span className="block font-display text-[20px] font-semibold tnum mt-0.5">₹{PRICE[p]}<span className="text-[12px] text-ink3 font-sans font-medium"> per student a year</span></span>
                        </button>
                      );
                    })}
                  </div>
                  <label htmlFor="ad-hostel" className="flex items-center gap-3 mt-2 text-[14px] cursor-pointer"><Checkbox id="ad-hostel" checked={f.hostel} onChange={(v) => setF({ ...f, hostel: v })} label="Hostel add-on" />Hostel add-on, {inr(HOSTEL)} a year</label>
                  <p className="text-[12.5px] text-ink3">First invoice for about {num(Math.max(approx, 100))} students: {inr(est)} + GST {inr(gstOf(est))}.</p>
                </Field>
              )}
              <div>
                <p className="text-[13px] font-semibold text-ink2 mb-1.5">Modules switched on <span className="text-bad">*</span></p>
                <p className="text-[12.5px] text-ink3 mb-2.5">{CORE.length} core modules are always on. The school can change these later in Settings, Modules On/Off.</p>
                <div className="flex flex-wrap gap-1.5 mb-3">{CORE.map((m) => <Pill key={m} tone="neutral" className="!h-[22px] !text-[11.5px]">{m}</Pill>)}</div>
                <div className="rounded-xl border border-line divide-y divide-line/70">
                  {OPTIONAL.map(([k, l, ic]) => (
                    <div key={k} className="flex items-center gap-3 px-3.5 py-2.5">
                      <span className="w-8 h-8 rounded-lg bg-sunken text-ink2 grid place-items-center shrink-0"><Icon name={ic} size={16} /></span>
                      <label htmlFor={`ad-mod-${k}`} className="flex-1 min-w-0 text-[14px]"><b className="font-semibold block">{l}</b><span className="block text-[12px] text-ink3">{k === 'Hostel' ? 'On for boarding schools' : 'Off unless the school needs it'}</span></label>
                      <Switch id={`ad-mod-${k}`} on={f.mods[k]} label={l} onChange={(v) => setF({ ...f, mods: { ...f.mods, [k]: v } })} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <div className="flex flex-col @md:flex-row @md:items-center gap-3 @md:justify-end">
            {tried && bad > 0 && <p className="text-[13.5px] text-bad flex items-center gap-1.5 @md:mr-auto" role="alert"><I.CircleAlert size={16} className="shrink-0" />{bad === 1 ? '1 field needs' : `${bad} fields need`} your attention above.</p>}
            <Button variant="ghost" onClick={() => go('sa', { page: 'schools' })}>Cancel</Button>
            <Button variant="primary" size="lg" icon={I.Send} onClick={submit}>Create School and Send Invite</Button>
          </div>
        </Col>

        <Col>
          <Card>
            <CardHead title="The invite they will get" sub="On WhatsApp, with the same text by SMS" icon={I.MessageCircle} />
            <InvitePreview school={f.name.trim() || 'your school'} admin={f.admin.trim() || 'Anita Sharma'} role={f.arole} mobile={f.mobile} time="Preview" />
          </Card>
          <Card>
            <CardHead title="What happens by itself" sub="When you press Create School and Send Invite" icon={I.Workflow} />
            <ol className="px-5 pb-5 flex flex-col gap-3">
              {steps.map(([ic, t], i) => (
                <li key={i} className="flex gap-3 text-[13.5px] text-ink2 leading-snug">
                  <span className="w-7 h-7 rounded-lg bg-sunken text-ink2 grid place-items-center shrink-0"><Icon name={ic} size={15} /></span><span className="pt-1 min-w-0">{t}</span>
                </li>
              ))}
            </ol>
          </Card>
          <div className="text-[12.5px] text-ink3 rounded-xl border border-dashed border-line p-3 flex flex-col gap-2.5">
            <p>Design preview: fill the form with sample details to see the summary, the warnings and what happens after.</p>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="secondary" icon={I.ClipboardList} onClick={fillExample}>Fill with an example</Button>
              <Button size="sm" variant="ghost" onClick={fillDup}>Try a school that exists</Button>
            </div>
          </div>
        </Col>
      </Split>

      <Sheet open={confirm} onClose={() => !busy && setConfirm(false)} title="Create the school and send the invite?"
        footer={<><Button variant="ghost" onClick={() => setConfirm(false)} disabled={busy}>Go back</Button><Button variant="primary" icon={I.Send} loading={busy} onClick={create}>{busy ? 'Creating…' : 'Create School and Send Invite'}</Button></>}>
        <p className="text-[15.5px] leading-relaxed">Create <b className="font-semibold">{f.name.trim()}</b> ({f.board}, {f.type}) and send a login invite to <b className="font-semibold">{f.admin.trim()}</b> on {joinAnd(channels)}?</p>
        <div className="mt-3 rounded-xl bg-sunken p-3.5 text-[13.5px] text-ink2 flex flex-col gap-1.5">
          <p>Send to <b className="font-semibold text-ink">{f.admin.trim()}</b>, +91 {mask(f.mobile)}?</p>
          <p>Starts as <b className="font-semibold text-ink">{f.start}</b>{f.start === 'Trial' ? ': 30 days, everything in Essential, 500 message credits.' : ` on ${f.plan}${f.hostel ? ' with Hostel' : ''}. The first invoice goes out with a Razorpay link.`}</p>
          <p>School code <span className="font-mono text-[12.5px] text-ink">{code}</span> · {modCount} modules on{groupName ? ` · ${groupName}` : ''}</p>
        </div>
      </Sheet>
    </div>
  );
}

function InvitePreview({ school, admin, role = 'School Admin', mobile, time, sent }) {
  return (
    <div className="mx-5 mb-5 rounded-2xl bg-sunken p-3">
      <div className="flex items-center gap-2.5 pb-2.5 mb-3 border-b border-line/70">
        <Logo size={30} />
        <div className="min-w-0"><p className="text-[13.5px] font-semibold leading-tight">School OS · DREAM TEAM</p><p className="text-[11.5px] text-ink3">WhatsApp business message</p></div>
      </div>
      <div className="max-w-[320px] rounded-2xl rounded-tl-md bg-surface shadow-card px-3.5 py-2.5 text-[13.5px] leading-relaxed flex flex-col gap-1.5">
        <p>Welcome to School OS, <b className="font-semibold">{school}</b>.</p>
        <p>{admin}, your {role} login is ready.</p>
        <p>Tap to set your password: <span className="text-brand font-semibold underline underline-offset-2 break-all">schoolos.in/i/7KQ2-XM4P</span></p>
        <p>Your username is your mobile number: <span className="tnum">{digits(mobile).length >= 5 ? mask(mobile) : '98xxx xx123'}</span>.</p>
        <p>The link works for 3 days. Need help? Call DREAM TEAM on <span className="tnum">{HELPLINE}</span>.</p>
        <p className="text-[11px] text-ink3 self-end flex items-center gap-1">{time}{sent && <I.CheckCheck size={14} className="text-info" />}</p>
      </div>
    </div>
  );
}

function AddDone({ made, onAgain }) {
  const { go } = useNav();
  const a = made.admins[0];
  return (
    <div>
      <BackLink label="Schools" />
      <PageHead title="School added" sub={`${made.name} · ${made.city} · added today at ${made.time} by ${made.addedBy}`} />
      <Split side={380}>
        <Col>
          <Card className="p-5 @md:p-6 flex flex-col @md:flex-row gap-4 @md:items-center">
            <span className="w-14 h-14 rounded-2xl bg-ok/10 text-ok grid place-items-center animate-pop shrink-0"><I.Check size={28} strokeWidth={2.6} /></span>
            <div className="flex-1 min-w-0">
              <h2 className="font-display text-[22px] font-semibold tracking-tight leading-tight">{made.name} is ready</h2>
              <p className="text-[14px] text-ink3 mt-1">School code <span className="font-mono text-[12.5px] text-ink2">{made.id}</span> · {made.status}{made.trialEnds ? ` until ${made.trialEnds}` : ''} · invite sent to {a.name}</p>
            </div>
            <Button variant="primary" icon={I.School} onClick={() => go('sa', { page: 'school', id: made.id })}>Open school</Button>
          </Card>
          <Card>
            <CardHead title="What happened by itself" sub={`All done at ${made.time}, in about 3 seconds`} icon={I.CircleCheck} />
            <ol className="px-5 pb-4 flex flex-col">
              {made.steps.map(([, t], i) => (
                <li key={i} className="flex gap-3 py-2.5 border-t border-line/70 first:border-t-0">
                  <span className="w-7 h-7 rounded-full bg-ok/15 text-ok grid place-items-center shrink-0"><I.Check size={15} strokeWidth={3} /></span>
                  <p className="text-[14px] leading-snug pt-1 min-w-0">{i === 5 ? `The invite went out on ${joinAnd(made.channels)} at ${made.time}.` : t}</p>
                </li>
              ))}
            </ol>
          </Card>
          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" icon={I.Plus} onClick={onAgain}>Add another school</Button>
            <Button variant="ghost" onClick={() => go('sa', { page: 'schools' })}>Back to Schools</Button>
          </div>
        </Col>
        <Col>
          <Card>
            <CardHead title="Invite on WhatsApp" sub={`Delivered to ${a.name} at ${made.time}`} icon={I.MessageCircle} action={<Pill tone="ok" dot>Delivered</Pill>} />
            <InvitePreview school={made.name} admin={a.name} role={a.role} mobile={a.phone} time={made.time} sent />
          </Card>
          <Card>
            <CardHead title="What happens next" icon={I.CalendarClock} />
            <ul className="px-5 pb-5 flex flex-col gap-3 text-[13.5px] text-ink2 leading-snug">
              <li className="flex gap-2.5"><I.KeyRound size={16} className="text-ink3 shrink-0 mt-0.5" /><span>{a.name} taps the link, confirms the code sent to {mask(a.phone)} and sets their own password. This console then shows “Signed in”.</span></li>
              <li className="flex gap-2.5"><I.ListChecks size={16} className="text-ink3 shrink-0 mt-0.5" /><span>They land on the Setup checklist and create every other login in the school.</span></li>
              <li className="flex gap-2.5"><I.Flag size={16} className="text-ink3 shrink-0 mt-0.5" /><span>If the invite is not opened in 2 days, or setup does not move for 7 days, the school shows in Needs attention.</span></li>
            </ul>
          </Card>
        </Col>
      </Split>
    </div>
  );
}
