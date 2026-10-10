// Admission Management: every new admission, from the first enquiry to the day the child joins.
// Admissions are open for 2027–28; mid-year joining for 2026–27 runs alongside. All data here is example data.
import React, { useEffect, useMemo, useState } from 'react';
import * as I from './icons.js';
import { CLASSES, FEATURED, inr } from './data.js';
import { cx, Card, CardHead, Button, IconButton, Pill, Avatar, Input, Field, Segmented, Tabs, Empty, Sheet, Switch, Checkbox, useToast } from './ui.jsx';
import { useNav, useRole } from './shell.jsx';
import {
  ModuleHead, useCanEdit, Icon, Stats, Band, SearchBox, Toolbar, Select, Textarea, Chips, DataList, BulkBar, Row, SettingRow, ToggleRow, SettingsCard,
  Banner, Suggestion, Progress, HBars, Bars, Legend, DL, Timeline, MoreMenu, FormSheet, ConfirmSheet, Split, Col, ExportButton,
} from './kit.jsx';

/* ======================= Sample data ======================= */
const OWNERS = ['Divya Menon', 'Naveen Kumar', 'Kavitha Nair', 'Anita Sharma'];
const SOURCES = ['Walk-in', 'Phone', 'Website', 'WhatsApp', 'Campaign', 'Referral'];
const STATUSES = ['New', 'Contacted', 'Visit scheduled', 'Visited', 'Application given', 'Applied', 'Admitted', 'Lost'];
const STATUS_TONE = { New: 'info', Contacted: 'brand', 'Visit scheduled': 'brand', Visited: 'brand', 'Application given': 'warn', Applied: 'ok', Admitted: 'ok', Lost: 'neutral' };
const LOSS = ['Chose another school', 'Fee too high', 'Too far from home', 'No seat in the class wanted', 'Moving to another city', 'No reply after 3 calls', 'Other'];
const CLASS_NAMES = CLASSES.filter((c) => c.id !== '10').map((c) => c.name);
const PRE = ['Nursery', 'LKG', 'UKG'];
const yl = (y) => (y === '2026–27' ? '2026–27 mid-year' : y);
const WEEK = new Set(['5 Oct 2026', '6 Oct 2026', '7 Oct 2026', '8 Oct 2026', '9 Oct 2026']);
const OPEN_DONE = ['Applied', 'Admitted', 'Lost'];
// "Who gets new enquiries" is set to: by class wanted
const ownerFor = (cls) => (!cls ? 'Divya Menon' : PRE.includes(cls) ? 'Divya Menon' : ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5'].includes(cls) ? 'Naveen Kumar' : 'Divya Menon');

const ENQUIRIES = [
  { id: 'ENQ-0488', child: 'Ira Varma', parent: 'Swathi Varma', rel: 'Mother', phone: '97013 44821', cls: 'Nursery', year: '2027–28', source: 'Website', status: 'New', owner: 'Divya Menon', addedBy: 'Website form', next: 'Today, 2:00 PM', due: 'today', action: 'First call', created: '9 Oct 2026' },
  { id: 'ENQ-0487', child: 'Vihaan Reddy', parent: 'Kiran Reddy', rel: 'Father', phone: '98851 20457', cls: 'Class 1', year: '2027–28', source: 'Walk-in', status: 'New', owner: 'Naveen Kumar', addedBy: 'Kavitha Nair', next: 'Today, 4:30 PM', due: 'today', action: 'Call back with fee details', created: '9 Oct 2026' },
  { id: 'ENQ-0486', child: 'Ishaan Verma', parent: 'Sanjay Verma', rel: 'Father', phone: '98665 41027', cls: 'Class 3', year: '2027–28', source: 'Referral', status: 'New', owner: 'Naveen Kumar', addedBy: 'Divya Menon', next: 'Today, 12:30 PM', due: 'today', action: 'First call', created: '9 Oct 2026', ref: 'Rajesh Sharma (parent, 7 B)' },
  { id: 'ENQ-0485', child: 'Myra Khan', parent: 'Ayesha Khan', rel: 'Mother', phone: '99083 51276', cls: 'LKG', year: '2027–28', source: 'WhatsApp', status: 'Contacted', owner: 'Divya Menon', addedBy: 'WhatsApp', next: 'Sat 10 Oct, 11:00 AM', due: 'tomorrow', action: 'Answer the transport question', created: '8 Oct 2026', wa: ['Hello, we want admission for my daughter in LKG for next year.', 'Is transport available from Nizampet?'], ai: true },
  { id: 'ENQ-0484', child: 'Arnav Gupta', parent: 'Rohit Gupta', rel: 'Father', phone: '90306 71842', cls: 'Class 4', year: '2026–27', source: 'Phone', status: 'Visit scheduled', owner: 'Divya Menon', addedBy: 'Kavitha Nair', next: 'Sat 10 Oct, 10:00 AM', due: 'tomorrow', action: 'School visit with both parents', created: '7 Oct 2026' },
  { id: 'ENQ-0483', child: 'Diya Patel', parent: 'Hetal Patel', rel: 'Mother', phone: '96766 30115', cls: 'UKG', year: '2027–28', source: 'Referral', status: 'Visited', owner: 'Divya Menon', addedBy: 'Divya Menon', next: 'Thu 8 Oct, 11:00 AM', due: 'overdue', action: 'Share the application link', created: '3 Oct 2026', ref: 'Priya Sharma (parent, 7 B)' },
  { id: 'ENQ-0482', child: 'Sai Charan Goud', parent: 'Mahesh Goud', rel: 'Father', phone: '98480 66213', cls: 'Class 6', year: '2027–28', source: 'Campaign', status: 'Applied', owner: 'Naveen Kumar', addedBy: 'Naveen Kumar', next: null, due: null, action: '', created: '2 Oct 2026', campaign: 'Open House Oct 2026' },
  { id: 'ENQ-0481', child: 'Aadhya Iyer', parent: 'Lakshmi Iyer', rel: 'Mother', phone: '94403 18872', cls: 'Nursery', year: '2027–28', source: 'Walk-in', status: 'Contacted', owner: 'Kavitha Nair', addedBy: 'Kavitha Nair', next: 'Tue 6 Oct, 12:00 PM', due: 'overdue', action: 'Fix a visit date', created: '1 Oct 2026' },
  { id: 'ENQ-0480', child: 'Harsha Chowdary', parent: 'Anil Chowdary', rel: 'Father', phone: '99490 11236', cls: 'Class 9', year: '2027–28', source: 'WhatsApp', status: 'Contacted', owner: 'Divya Menon', addedBy: 'WhatsApp', next: 'Mon 12 Oct, 11:00 AM', due: 'later', action: 'Send fee details', created: '6 Oct 2026', wa: ['Good evening. Admission for Class 9 next year, CBSE?', 'What is the fee for Class 9 with transport?'], ai: true },
  { id: 'ENQ-0479', child: 'Nithya Shetty', parent: 'Ramya Shetty', rel: 'Mother', phone: '90004 73321', cls: 'LKG', year: '2027–28', source: 'Campaign', status: 'Visit scheduled', owner: 'Kavitha Nair', addedBy: 'Kavitha Nair', next: 'Sat 10 Oct, 11:30 AM', due: 'tomorrow', action: 'Show the pre-primary block', created: '5 Oct 2026', campaign: 'Open House Oct 2026' },
  { id: 'ENQ-0478', child: 'Sneha Menon', parent: 'Arun Menon', rel: 'Father', phone: '97052 88140', cls: 'Class 2', year: '2027–28', source: 'WhatsApp', status: 'New', owner: 'Naveen Kumar', addedBy: 'WhatsApp', next: 'Wed 7 Oct, 5:00 PM', due: 'overdue', action: 'First reply', created: '7 Oct 2026', wa: ['Do you have seats in Class 2 for next year?'], ai: true },
  { id: 'ENQ-0477', child: 'Reyansh Naidu', parent: 'Venkat Naidu', rel: 'Father', phone: '97052 66310', cls: 'Class 1', year: '2027–28', source: 'Phone', status: 'Applied', owner: 'Naveen Kumar', addedBy: 'Kavitha Nair', next: null, due: null, action: '', created: '28 Sep 2026' },
  { id: 'ENQ-0476', child: 'Ananya Das', parent: 'Priyanka Das', rel: 'Mother', phone: '97040 22168', cls: 'Class 5', year: '2026–27', source: 'Phone', status: 'Applied', owner: 'Naveen Kumar', addedBy: 'Naveen Kumar', next: null, due: null, action: '', created: '23 Sep 2026' },
  { id: 'ENQ-0475', child: 'Kavya Joshi', parent: 'Neha Joshi', rel: 'Mother', phone: '93910 27755', cls: 'Class 2', year: '2026–27', source: 'Walk-in', status: 'Admitted', owner: 'Divya Menon', addedBy: 'Kavitha Nair', next: null, due: null, action: '', created: '21 Sep 2026' },
  { id: 'ENQ-0474', child: 'Tanvi Rao', parent: 'Srinivas Rao', rel: 'Father', phone: '98493 80012', cls: 'Class 8', year: '2027–28', source: 'Website', status: 'Lost', lost: 'Chose another school', owner: 'Divya Menon', addedBy: 'Website form', next: null, due: null, action: '', created: '18 Sep 2026' },
  { id: 'ENQ-0473', child: 'Rohan Pillai', parent: 'Suresh Pillai', rel: 'Father', phone: '96180 55432', cls: 'Class 1', year: '2027–28', source: 'Walk-in', status: 'Lost', lost: 'Fee too high', owner: 'Kavitha Nair', addedBy: 'Kavitha Nair', next: null, due: null, action: '', created: '15 Sep 2026' },
];

const AI_DRAFT = {
  'ENQ-0485': { text: 'Yes, Route 2 (Nizampet) has a stop at Nizampet X Roads. The bus reaches there at 7:35 AM and drops back by 3:55 PM. Transport for 2027–28 is ₹2,200 a month. Would you like to visit the school this Saturday between 9:30 AM and 12:30 PM?', src: 'Admission Settings facts: bus routes and stops 2027–28, transport fee 2027–28, visiting hours' },
  'ENQ-0480': { text: 'For Class 9 in 2027–28 the tuition fee is ₹74,000 a year, paid in four installments. Transport is ₹2,200 a month, depending on the stop. The application fee is ₹750. Shall I book a school visit for you?', src: 'Admission Settings facts: fee summary 2027–28 (Class 9), transport fee, application fee' },
  'ENQ-0478': { text: 'Yes, Class 2 for 2027–28 has seats. Applications are open now and the form takes about 10 minutes on your phone. Shall I send you the link?', src: 'Admission Settings facts: classes open for 2027–28, seats left (Class 2: 5), online application' },
};

const logFor = (e) => {
  const out = [];
  if (e.status === 'Lost') out.push({ what: `Closed as lost by ${e.owner}. Reason: ${e.lost}.`, when: '30 Sep 2026, 4:10 PM', icon: 'CircleX' });
  if (e.status === 'Admitted') out.push({ what: 'Admission confirmed. Status set to Admitted by the system.', when: '2 Oct 2026, 11:20 AM', icon: 'BadgeCheck', tone: 'ok' });
  if (e.status === 'Applied' || e.status === 'Admitted') out.push({ what: 'Application made. Status set to Applied by the system.', when: '25 Sep 2026, 10:05 AM', icon: 'FileText', tone: 'ok' });
  if (e.status === 'Visit scheduled') out.push({ what: `School visit booked for ${e.next}.`, when: '8 Oct 2026, 3:40 PM', icon: 'CalendarCheck2', tone: 'brand' });
  if (e.status === 'Visited') out.push({ what: 'Family visited with Divya Menon. Liked the science labs and the bus route.', when: '6 Oct 2026, 11:15 AM', icon: 'School', tone: 'brand' });
  if (e.wa) out.push({ what: 'Message arrived on WhatsApp.', when: `${e.created}, 7:12 PM`, icon: 'MessageCircle', tone: 'info' });
  if (['Contacted', 'Visit scheduled', 'Visited', 'Applied'].includes(e.status) && !e.wa) out.push({ what: `Outgoing call by ${e.owner}: spoke to ${e.parent}.`, when: `${e.created}, 12:30 PM`, icon: 'PhoneOutgoing' });
  out.push({ what: `Owner set to ${e.owner} (rule: by class wanted).`, when: `${e.created}, 10:02 AM`, icon: 'UserCheck' });
  out.push({ what: `Enquiry added by ${e.addedBy}. Source: ${e.source}.`, when: `${e.created}, 10:01 AM`, icon: 'Plus' });
  return out;
};
const chatFor = (e) => {
  if (e.wa) return [
    ...e.wa.slice(0, -1).map((t) => ({ from: 'parent', text: t, time: `${e.created.replace(' 2026', '')}, 7:12 PM` })),
    ...(e.wa.length > 1 ? [{ from: 'school', text: `Thank you for writing to Sunrise Public School. ${e.owner} from the admission desk will help you.`, time: `${e.created.replace(' 2026', '')}, 7:20 PM`, by: e.owner }] : []),
    { from: 'parent', text: e.wa[e.wa.length - 1], time: 'Today, 8:05 AM' },
  ];
  if (e.status === 'New') return [];
  return [{ from: 'school', text: `Dear ${e.parent}, thank you for your interest in Sunrise Public School for ${e.child} (${e.cls}). Visiting hours are Mon–Sat, 9:30 AM to 12:30 PM.`, time: `${e.created.replace(' 2026', '')}, 12:40 PM`, by: e.owner, via: 'WhatsApp' }];
};

const DOCS_PRE = ['Birth certificate', 'Address proof', 'Parent ID', 'Passport photos'];
const DOCS_SCH = ['Birth certificate', 'Transfer certificate', 'Previous marksheet', 'Address proof', 'Parent ID', 'Passport photos'];
const docsFor = (cls) => (PRE.includes(cls) ? DOCS_PRE : DOCS_SCH);
const verified = (a) => [...a.docs].filter((c) => c === 'V').length;

const SEATS = {
  '2027–28': { Nursery: { A: 14 }, LKG: { A: 9, B: 11 }, UKG: { A: 3, B: 4 }, 'Class 1': { A: 0, B: 0 }, 'Class 2': { A: 2, B: 3 }, 'Class 3': { A: 4, B: 2 }, 'Class 4': { A: 3, B: 1 }, 'Class 5': { A: 2, B: 2 }, 'Class 6': { A: 6, B: 5 }, 'Class 7': { A: 2, B: 1 }, 'Class 8': { A: 3, B: 2 }, 'Class 9': { A: 4, B: 3, C: 5 } },
  '2026–27': { 'Class 2': { A: 1, B: 0 }, 'Class 3': { A: 2, B: 1 }, 'Class 4': { A: 0, B: 2 }, 'Class 5': { A: 2, B: 4 }, 'Class 6': { A: 1, B: 1 }, 'Class 7': { A: 2, B: 2 }, 'Class 8': { A: 0, B: 1 } },
};
const seatsOf = (y, c) => SEATS[y]?.[c] || { A: 2, B: 2 };
const seatText = (y, c) => Object.entries(seatsOf(y, c)).map(([s, n]) => `${c.replace('Class ', '')} ${s}: ${n}`).join(' · ');
const seatTotal = (y, c) => Object.values(seatsOf(y, c)).reduce((a, b) => a + b, 0);
const YEAR_FEE = (c) => (PRE.includes(c) ? 52000 : ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5'].includes(c) ? 64000 : ['Class 9', 'Class 10'].includes(c) ? 74000 : 70000);
const planLabel = (a) => (a.year === '2026–27' ? `${a.cls} · 2026–27 · Oct–Mar · ${inr(YEAR_FEE(a.cls) / 2)}` : `${a.cls} · 2027–28 · full year · ${inr(YEAR_FEE(a.cls))}`);

const APPS = [
  { id: 'APP/2026/0061', child: 'Ananya Das', cls: 'Class 5', year: '2026–27', mother: 'Priyanka Das', father: 'Rahul Das', phone: '97040 22168', stage: 'Decision', docs: 'VVVVVV', test: { when: 'Sat 26 Sep', score: 41, max: 50 }, fee: 'Not needed', admFee: { status: 'Paid', how: 'Razorpay · UPI', when: '8 Oct', rcpt: 'R/26/05168' }, submitted: '25 Sep 2026', age: 14, dob: '11-02-2016', gender: 'Girl', address: 'H.No. 4-12, Pragathi Nagar, Hyderabad 500090', prev: ['Kendriya Vidyalaya, Begumpet', 'Class 4 (2025–26)', '86%'], stop: 'Route 2 · Nizampet X Roads', owner: 'Naveen Kumar', note: 'Father transferred to Hyderabad (Central Govt.)' },
  { id: 'APP/2026/0060', child: 'Arjun Mehta', cls: 'Class 7', year: '2026–27', mother: 'Ritu Mehta', father: 'Vikas Mehta', phone: '99121 46630', stage: 'Decision', docs: 'RVVVVV', test: { when: 'Sat 26 Sep', score: 36, max: 50 }, fee: 'Not needed', admFee: { status: 'Not paid', link: 'Razorpay link sent 8 Oct, opened once' }, submitted: '24 Sep 2026', age: 15, dob: '03-07-2014', gender: 'Boy', address: 'Flat 504, Aparna Towers, Kondapur, Hyderabad 500084', prev: ['DPS Pune', 'Class 6 (2025–26)', 'B1 grade'], stop: null, owner: 'Divya Menon' },
  { id: 'APP/2026/0058', child: 'Rehan Ali', cls: 'Class 3', year: '2026–27', mother: 'Sana Imtiaz', father: 'Imtiaz Ali', phone: '98851 70342', stage: 'Approved', docs: 'VVVVVV', test: { when: 'Sat 26 Sep', score: 38, max: 50 }, fee: 'Not needed', admFee: { status: 'Paid', how: 'Razorpay · UPI', when: '9 Oct', rcpt: 'R/26/05185' }, approved: 'Lakshmi Rao, 8 Oct', submitted: '21 Sep 2026', age: 18, dob: '19-05-2018', gender: 'Boy', address: '8-3-112, Moosapet, Hyderabad 500018', prev: ['Little Flower School, Vijayawada', 'Class 2 (2025–26)', '78%'], stop: 'Route 5 · Moosapet Y Junction', owner: 'Divya Menon' },
  { id: 'APP/2026/0059', child: 'Kavya Joshi', cls: 'Class 2', year: '2026–27', mother: 'Neha Joshi', father: 'Manoj Joshi', phone: '93910 27755', stage: 'Admitted', docs: 'VVVVVV', test: { when: 'Sat 26 Sep', score: 44, max: 50 }, fee: 'Not needed', admFee: { status: 'Paid', how: 'Cash at counter', when: '2 Oct', rcpt: 'R/26/05044' }, admNo: 'SPS/2026/0911', submitted: '22 Sep 2026', age: 17, dob: '02-09-2019', gender: 'Girl', address: 'Plot 22, Allwyn Colony, Kukatpally 500072', prev: ['Narayana E-Techno, Guntur', 'Class 1 (2025–26)', 'A grade'], stop: null, owner: 'Divya Menon' },
  { id: 'APP/2027/0112', child: 'Reyansh Naidu', cls: 'Class 1', year: '2027–28', mother: 'Sirisha Naidu', father: 'Venkat Naidu', phone: '97052 66310', stage: 'Documents', docs: 'VVRNXV', test: { when: 'Sat 31 Oct' }, fee: 'Paid', feeInfo: '₹500 · Razorpay · UPI · 3 Oct · R/26/04981', submitted: '3 Oct 2026', age: 6, dob: '23-04-2021', gender: 'Boy', address: 'H.No. 2-56, Hydernagar, Kukatpally 500085', prev: ['Kidzee, Hydernagar', 'UKG (2026–27)', 'Good'], stop: 'Route 1 · KPHB Main Road', owner: 'Naveen Kumar' },
  { id: 'APP/2027/0111', child: 'Sai Charan Goud', cls: 'Class 6', year: '2027–28', mother: 'Padma Goud', father: 'Mahesh Goud', phone: '98480 66213', stage: 'Submitted online', docs: 'RNNNNN', test: { when: 'Sat 7 Nov' }, fee: 'Not paid', feeInfo: '₹750 · Razorpay link sent 8 Oct · not opened yet', submitted: '8 Oct 2026', age: 1, dob: '30-11-2015', gender: 'Boy', address: 'Gokul Plots, Madhapur, Hyderabad 500081', prev: ['ZPHS Madhapur', 'Class 5 (2026–27)', '72%'], stop: null, owner: 'Naveen Kumar', campaign: 'Open House Oct 2026' },
  { id: 'APP/2027/0110', child: 'Aanya Kulkarni', cls: 'Nursery', year: '2027–28', mother: 'Sneha Kulkarni', father: 'Rohit Kulkarni', phone: '99085 31274', stage: 'Interview', docs: 'VVVV', interview: { when: 'Wed 14 Oct, 2:30 PM' }, fee: 'Paid', feeInfo: '₹500 · Razorpay · Card · 1 Oct · R/26/04930', submitted: '1 Oct 2026', age: 8, dob: '14-01-2024', gender: 'Girl', address: 'Flat 101, My Home Jewel, Madinaguda 500049', prev: null, stop: 'Route 4 · Miyapur X Roads', owner: 'Divya Menon' },
  { id: 'APP/2027/0109', child: 'Vivaan Agarwal', cls: 'Class 1', year: '2027–28', mother: 'Pooja Agarwal', father: 'Nitin Agarwal', phone: '98663 10247', stage: 'Test', docs: 'VVVVVV', test: { when: 'Sat 31 Oct' }, fee: 'Paid', feeInfo: '₹500 · Razorpay · UPI · 29 Sep · R/26/04867', submitted: '29 Sep 2026', age: 10, dob: '08-08-2021', gender: 'Boy', address: 'Villa 18, Ramky Towers, Gachibowli 500032', prev: ['Podar Jumbo Kids, Kondapur', 'UKG (2026–27)', 'Very good'], stop: null, owner: 'Naveen Kumar' },
  { id: 'APP/2027/0108', child: 'Meghana Rao', cls: 'LKG', year: '2027–28', mother: 'Swetha Rao', father: 'Kiran Rao', phone: '90309 88124', stage: 'Decision', docs: 'VVVV', interview: { when: 'Mon 5 Oct', outcome: 'Recommended' }, fee: 'Paid', feeInfo: '₹500 · Razorpay · UPI · 26 Sep · R/26/04802', admFee: { status: 'Not paid', link: 'Asked after approval' }, sibling: 'Kavya Rao, 5 A', submitted: '26 Sep 2026', age: 13, dob: '21-06-2023', gender: 'Girl', address: 'H.No. 6-7, Vivekananda Nagar, Kukatpally 500072', prev: null, stop: 'Route 1 · KPHB Main Road', owner: 'Divya Menon' },
  { id: 'APP/2027/0107', child: 'Aditya Kumar', cls: 'Class 1', year: '2027–28', mother: 'Shalini Kumar', father: 'Pradeep Kumar', phone: '97010 33582', stage: 'Decision', docs: 'VVVVVV', test: { when: 'Sat 26 Sep', score: 44, max: 50 }, fee: 'Paid', feeInfo: '₹500 · Cash at counter · 20 Sep · R/26/04711', admFee: { status: 'Not paid', link: 'Asked after approval' }, sibling: 'Ritika Kumar, 4 B', submitted: '20 Sep 2026', age: 19, dob: '17-03-2021', gender: 'Boy', address: 'Flat 302, Sri Sai Residency, KPHB 500072', prev: ['Bachpan Play School, KPHB', 'UKG (2026–27)', 'Very good'], stop: null, owner: 'Naveen Kumar' },
  { id: 'APP/2027/0106', child: 'Harini Varma', cls: 'UKG', year: '2027–28', mother: 'Deepika Varma', father: 'Sai Varma', phone: '98490 72215', stage: 'Reviewed', docs: 'VVNN', interview: { when: 'Wed 14 Oct, 2:45 PM' }, fee: 'Paid', feeInfo: '₹500 · Razorpay · UPI · 30 Sep · R/26/04901', submitted: '30 Sep 2026', age: 9, dob: '05-10-2022', gender: 'Girl', address: 'H.No. 1-98, Bowenpally, Secunderabad 500011', prev: ['Euro Kids, Bowenpally', 'LKG (2026–27)', 'Good'], stop: null, owner: 'Divya Menon' },
  { id: 'APP/2027/0104', child: 'Pooja Naidu', cls: 'Class 4', year: '2027–28', mother: 'Kalyani Naidu', father: 'Ramesh Naidu', phone: '94405 66120', stage: 'Approved', docs: 'VVVVVV', test: { when: 'Sat 26 Sep', score: 40, max: 50 }, fee: 'Paid', feeInfo: '₹500 · Razorpay · UPI · 15 Sep · R/26/04650', admFee: { status: 'Paid', how: 'Razorpay · Card', when: '8 Oct', rcpt: 'R/26/05170' }, approved: 'Lakshmi Rao, 6 Oct', offer: { sent: '6 Oct, WhatsApp', accepted: '7 Oct' }, submitted: '15 Sep 2026', age: 24, dob: '29-12-2018', gender: 'Girl', address: 'H.No. 3-4, Balaji Nagar, Kukatpally 500072', prev: ['St. Ann’s School, Kurnool', 'Class 3 (2026–27)', '81%'], stop: 'Route 1 · KPHB Main Road', owner: 'Naveen Kumar' },
  { id: 'APP/2027/0103', child: 'Zara Hussain', cls: 'Class 2', year: '2027–28', mother: 'Farah Hussain', father: 'Adil Hussain', phone: '97045 18826', stage: 'Decision', withPrincipal: 'Sent by Divya Menon on 8 Oct', docs: 'VVVVVV', test: { when: 'Sat 26 Sep', score: 45, max: 50 }, fee: 'Paid', feeInfo: '₹500 · Razorpay · UPI · 14 Sep · R/26/04622', admFee: { status: 'Not paid', link: 'Asked after approval' }, submitted: '14 Sep 2026', age: 25, dob: '12-11-2019', gender: 'Girl', address: 'Flat 9B, Lodha Bellezza, KPHB 500072', prev: ['Oakridge, Bachupally', 'Class 1 (2026–27)', 'A grade'], stop: 'Route 3 · Bachupally', owner: 'Divya Menon' },
  { id: 'APP/2027/0105', child: 'Dhruv Singh', cls: 'Class 3', year: '2027–28', mother: 'Kriti Singh', father: 'Amit Singh', phone: '96523 11870', stage: 'Withdrawn', withdrawn: 'Family moving to Pune', docs: 'VVNNNN', fee: 'Paid', feeInfo: '₹500 · Razorpay · UPI · 16 Sep · R/26/04666', submitted: '16 Sep 2026', age: 23, dob: '04-04-2020', gender: 'Boy', address: 'H.No. 12-1, Miyapur 500049', prev: ['Sri Chaitanya, Miyapur', 'Class 2 (2026–27)', '74%'], stop: null, owner: 'Naveen Kumar' },
];
const STAGES = ['Submitted online', 'Reviewed', 'Documents', 'Test', 'Interview', 'Decision', 'Approved', 'Admitted', 'Withdrawn'];
const STAGE_TONE = { 'Submitted online': 'info', Reviewed: 'brand', Documents: 'warn', Test: 'brand', Interview: 'brand', Decision: 'warn', Approved: 'ok', Admitted: 'ok', Withdrawn: 'neutral' };
const feeWord = (a) => (a.fee === 'Paid' ? 'Yes' : a.fee === 'Not paid' ? 'No' : 'Not needed');

/* ---------- small shared pieces ---------- */
const BackLink = ({ onClick, label, sub }) => (
  <button onClick={onClick} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink mb-3 -ml-1 h-8 px-1 rounded-lg">
    <I.ArrowLeft size={17} />{label} {sub && <span className="text-ink3 font-normal">/ {sub}</span>}
  </button>
);
const phoneErr = (p) => { const d = p.replace(/\D/g, ''); return !d ? 'Enter the parent’s mobile number' : d.length !== 10 || !/^[6-9]/.test(d) ? 'Enter a 10-digit Indian mobile number' : ''; };
function PhoneInput({ id, value, onChange, onBlur, error }) {
  return (
    <div className="relative">
      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3 text-[15px]">+91</span>
      <Input id={id} inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d ]/g, '').slice(0, 11))} onBlur={onBlur} error={error} className="pl-12 tnum" placeholder="98480 12345" />
    </div>
  );
}
function MoreDetails({ open, onToggle, children, label = 'More details' }) {
  return (
    <div className="rounded-xl border border-line">
      <button type="button" onClick={onToggle} className="w-full flex items-center justify-between px-3.5 h-11 text-[14px] font-semibold text-ink2 hover:text-ink">
        {label}<I.ChevronDown size={17} className={cx('transition', open && 'rotate-180')} />
      </button>
      {open && <div className="px-3.5 pb-4 pt-3.5 flex flex-col gap-4 border-t border-line">{children}</div>}
    </div>
  );
}
const DocPill = ({ a }) => {
  const n = verified(a), t = a.docs.length;
  return (
    <span className="flex items-center gap-2 w-32">
      <Progress value={(n / t) * 100} tone={n === t ? 'ok' : 'warn'} className="flex-1" />
      <span className={cx('text-[12.5px] font-semibold tnum whitespace-nowrap', n < t && 'text-warn')}>{n} of {t}</span>
    </span>
  );
};
const SubHead = ({ children }) => <p className="eyebrow text-ink3 -mb-1 pt-1">{children}</p>;

/* ======================= Admission Dashboard ======================= */
const FUNNEL = {
  '2027–28': [
    { k: 'Enquiry', n: 96, d: 14, oldest: '12 Aug', page: 'enquiries' }, { k: 'Application', n: 23, d: 6, oldest: '14 Sep', page: 'applications' },
    { k: 'Documents', n: 17, d: 3, oldest: '16 Sep', page: 'documents' }, { k: 'Test', n: 14, d: 5, oldest: '29 Sep', page: 'tests' },
    { k: 'Interview', n: 9, d: 4, oldest: '1 Oct', page: 'tests' }, { k: 'Decision', n: 5, d: 2, oldest: '14 Sep', page: 'decision' },
    { k: 'Admitted', n: 27, d: 4, oldest: '—', page: 'decision' },
  ],
  '2026–27': [
    { k: 'Enquiry', n: 11, d: 2, oldest: '21 Sep', page: 'enquiries' }, { k: 'Application', n: 2, d: 1, oldest: '24 Sep', page: 'applications' },
    { k: 'Documents', n: 2, d: 0, oldest: '24 Sep', page: 'documents' }, { k: 'Test', n: 4, d: 4, oldest: '7 Oct', page: 'tests' },
    { k: 'Decision', n: 2, d: 1, oldest: '24 Sep', page: 'decision' }, { k: 'Admitted', n: 9, d: 1, oldest: '—', page: 'decision' },
  ],
};
const BAND = {
  '2027–28': [['Enquiries', '214', '+18 since last week · 96 open', 'enquiries'], ['Applications', '96', '5 waiting for a decision', 'applications'], ['Admitted', '27', 'of 312 seats for new joiners', 'decision'], ['Follow-ups due', '7', '3 overdue · 4 today', 'enquiries']],
  '2026–27': [['Enquiries', '38', '+3 since last week · 11 open', 'enquiries'], ['Applications', '17', '2 waiting for a decision', 'applications'], ['Admitted', '9', 'mid-year, since 1 Jun', 'decision'], ['Follow-ups due', '7', '3 overdue · 4 today', 'enquiries']],
};
const COLS = [['enq', 'Enquiries', 96], ['app', 'Applications', 23], ['docs', 'Documents', 17], ['test', 'Tests', 14], ['int', 'Interviews', 9], ['appr', 'Approvals', 5], ['done', 'Admitted', 27]];
const BOARD = {
  '2027–28': {
    enq: [{ id: 'b1', name: 'Ira Varma', cls: 'Nursery', meta: 'Website · added today' }, { id: 'b2', name: 'Myra Khan', cls: 'LKG', meta: 'WhatsApp · Divya Menon' }, { id: 'b3', name: 'Diya Patel', cls: 'UKG', meta: 'Visited 6 Oct', block: 'No application yet. Convert the enquiry to an application first.' }],
    app: [{ id: 'b4', name: 'Sai Charan Goud', cls: 'Class 6', meta: 'Fee not paid', block: 'Application fee ₹750 is not paid yet.' }, { id: 'b5', name: 'Harini Varma', cls: 'UKG', meta: 'Reviewed 2 Oct' }],
    docs: [{ id: 'b6', name: 'Reyansh Naidu', cls: 'Class 1', meta: '3 of 6 verified', block: '3 required papers are not verified yet.' }],
    test: [{ id: 'b7', name: 'Vivaan Agarwal', cls: 'Class 1', meta: 'Test on Sat 31 Oct', block: 'The test is on Sat 31 Oct. Record the score first.' }],
    int: [{ id: 'b8', name: 'Aanya Kulkarni', cls: 'Nursery', meta: 'Wed 14 Oct, 2:30 PM', block: 'The interview is on Wed 14 Oct. Record the outcome first.' }],
    appr: [{ id: 'b9', name: 'Meghana Rao', cls: 'LKG', meta: 'Recommended · sibling' }, { id: 'b10', name: 'Aditya Kumar', cls: 'Class 1', meta: 'Class 1 is full', block: 'Class 1 A and B are full (80 of 80). Put on the waiting list.' }, { id: 'b11', name: 'Zara Hussain', cls: 'Class 2', meta: 'With the Principal' }],
    done: [{ id: 'b12', name: 'Pooja Naidu', cls: 'Class 4', meta: 'Offer accepted 7 Oct' }],
  },
  '2026–27': {
    enq: [{ id: 'm1', name: 'Arnav Gupta', cls: 'Class 4', meta: 'Visit Sat 10 Oct' }], app: [], docs: [{ id: 'm2', name: 'Arjun Mehta', cls: 'Class 7', meta: 'Birth certificate to verify', block: 'Birth certificate is not verified yet.' }],
    test: [{ id: 'm3', name: 'Zoya Fatima', cls: 'Class 3', meta: 'Test Sat 10 Oct', block: 'The test is tomorrow. Record the score first.' }], int: [],
    appr: [{ id: 'm4', name: 'Ananya Das', cls: 'Class 5', meta: 'All papers verified' }], done: [{ id: 'm5', name: 'Kavya Joshi', cls: 'Class 2', meta: 'SPS/2026/0911' }, { id: 'm6', name: 'Rehan Ali', cls: 'Class 3', meta: 'Approved 8 Oct' }],
  },
};

function AdmDashboard() {
  const { go } = useNav();
  const { role } = useRole();
  const toast = useToast();
  const canEdit = useCanEdit();
  const [year, setYear] = useState('2027–28');
  const [cls, setCls] = useState('all');
  const [src, setSrc] = useState('all');
  const [own, setOwn] = useState('all');
  const [board, setBoard] = useState(BOARD);
  const [drag, setDrag] = useState(null);
  const [add, setAdd] = useState(false);
  const [app, setApp] = useState(false);
  const fun = FUNNEL[year];
  const max = Math.max(...fun.map((f) => f.n));
  const b = board[year];
  const cols = COLS.filter(([k]) => year === '2027–28' || k !== 'int');
  const mins = (x) => { const m = /(\d+):(\d+) (AM|PM)/.exec(x || ''); return m ? ((+m[1] % 12) + (m[3] === 'PM' ? 12 : 0)) * 60 + +m[2] : 0; };
  const follow = ENQUIRIES.filter((e) => ['overdue', 'today', 'tomorrow'].includes(e.due) && (cls === 'all' || e.cls === cls) && (src === 'all' || e.source === src) && (own === 'all' || e.owner === own));
  const visible = (c) => (cls === 'all' || c.cls === cls);

  const move = (card, from) => {
    const i = cols.findIndex(([k]) => k === from);
    const to = cols[i + 1]?.[0];
    if (!to) return;
    if (card.block) return toast({ tone: 'bad', title: `${card.name} cannot move on yet`, body: card.block });
    if (to === 'done' && role.id !== 'principal') return toast({ tone: 'bad', title: 'Needs the Principal’s approval', body: `Send ${card.name} for approval from Admission Decision.` });
    const prev = board;
    setBoard((x) => ({ ...x, [year]: { ...x[year], [from]: x[year][from].filter((c) => c.id !== card.id), [to]: [{ ...card, meta: 'Moved just now' }, ...x[year][to]] } }));
    toast({ title: `${card.name} moved to ${cols[i + 1][1]}`, body: 'Logged in the application history.', undo: () => setBoard(prev) });
  };
  const drop = (to) => {
    if (!drag) return;
    const i = cols.findIndex(([k]) => k === drag.from);
    if (cols[i + 1]?.[0] !== to) { setDrag(null); if (to !== drag.from) toast({ tone: 'bad', title: 'Move one step at a time', body: `${drag.card.name} can go to ${cols[i + 1]?.[1] || 'no further step'} next.` }); return; }
    move(drag.card, drag.from); setDrag(null);
  };

  const groups = [['overdue', 'Overdue', 'bad'], ['today', 'Due today', 'warn'], ['tomorrow', 'Due tomorrow', 'info']];
  return (
    <div>
      <ModuleHead sub="Admissions are open for 2027–28. Mid-year joining for 2026–27 runs alongside."
        actions={<>
          <Button variant="secondary" icon={I.PhoneIncoming} onClick={() => setAdd(true)}>Add enquiry</Button>
          <Button variant="primary" icon={I.FilePlus2} onClick={() => setApp(true)}>New application</Button>
        </>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <div className="flex flex-col @lg:flex-row gap-2.5 @lg:items-center">
          <Segmented value={year} onChange={setYear} options={[{ value: '2027–28', label: 'Admission year 2027–28' }, { value: '2026–27', label: '2026–27 mid-year' }]} />
          <div className="grid grid-cols-2 @lg:flex gap-2 @lg:ml-auto">
            <Select id="ad-cls" value={cls} onChange={setCls} options={[{ value: 'all', label: 'All classes' }, ...CLASS_NAMES]} className="@lg:w-40" />
            <Select id="ad-src" value={src} onChange={setSrc} options={[{ value: 'all', label: 'All sources' }, ...SOURCES]} className="@lg:w-40" />
            <Select id="ad-own" value={own} onChange={setOwn} options={[{ value: 'all', label: 'All owners' }, ...OWNERS.slice(0, 3)]} className={cx('@lg:w-44', !role.multiSchool && 'col-span-2 @lg:col-span-1')} />
            {role.multiSchool && <Select id="ad-camp" value="kph" onChange={() => toast({ title: 'Campus filter', body: 'Showing Kukatpally. Switch school from the sidebar to see Miyapur campus.', tone: 'info' })} options={[{ value: 'kph', label: 'Kukatpally' }, { value: 'myp', label: 'Miyapur campus' }]} className="@lg:w-40" />}
          </div>
        </div>

        <Band items={BAND[year].map(([label, big, foot, page]) => ({ label, big, foot, onClick: () => go('admissions', { page }) }))} />

        <Split>
          <Col>
            <Card>
              <CardHead title="Where everyone is now" sub={`${yl(year)} · tap a stage to open the list behind it`} icon={I.Filter} />
              <ul className="px-2 pb-3">
                {fun.map((f) => (
                  <li key={f.k}>
                    <button onClick={() => go('admissions', { page: f.page })} className="w-full grid grid-cols-[96px_1fr_64px] @md:grid-cols-[130px_1fr_150px] items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/70 text-left transition">
                      <span className="min-w-0">
                        <span className="block font-semibold text-[14px] truncate">{f.k}</span>
                        <span className="block text-[12px] text-ink3 truncate">{f.oldest === '—' ? 'This year' : `Oldest ${f.oldest}`}</span>
                      </span>
                      <span className="relative h-3 rounded-full bg-sunken overflow-hidden"><span className={cx('absolute inset-y-0 left-0 rounded-full', f.k === 'Admitted' ? 'bg-ok' : 'bg-brand')} style={{ width: `${Math.max(4, (f.n / max) * 100)}%` }} /></span>
                      <span className="text-right">
                        <span className="font-display font-semibold text-[18px] tnum">{f.n}</span>
                        <span className={cx('block @md:inline @md:ml-2 text-[12px] font-semibold tnum', f.d ? 'text-ok' : 'text-ink3')}>{f.d ? `+${f.d}` : '0'}<span className="hidden @md:inline font-normal text-ink3"> this week</span></span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <CardHead title="Pipeline" sub={canEdit ? 'Drag a card to the next column, or use its arrow. The same checks as the buttons apply.' : 'Cards in each step. View only.'} icon={I.SquareKanban} />
              <div className="overflow-x-auto scroll-thin px-4 pb-4">
                <div className="flex gap-3 w-max">
                  {cols.map(([k, label, total], ci) => {
                    const cards = b[k].filter(visible);
                    const last = ci === cols.length - 1;
                    return (
                      <div key={k} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(k)}
                        className={cx('w-[228px] shrink-0 rounded-xl bg-sunken/60 p-2 flex flex-col gap-2 transition', drag && cols[cols.findIndex(([x]) => x === drag.from) + 1]?.[0] === k && 'ring-2 ring-brand/40 bg-brand/5')}>
                        <div className="flex items-center justify-between px-1.5 pt-1">
                          <p className="text-[13px] font-semibold">{label}</p>
                          <span className="text-[12px] font-semibold text-ink3 tnum">{year === '2027–28' ? total : b[k].length}</span>
                        </div>
                        {cards.map((c) => (
                          <div key={c.id} draggable={canEdit && !last} onDragStart={() => setDrag({ card: c, from: k })} onDragEnd={() => setDrag(null)}
                            className={cx('rounded-xl bg-surface border border-line/70 p-2.5 flex items-start gap-2', canEdit && !last && 'cursor-grab active:cursor-grabbing')}>
                            <Avatar name={c.name} size={30} />
                            <div className="min-w-0 flex-1">
                              <p className="text-[13.5px] font-semibold leading-tight truncate">{c.name}</p>
                              <p className="text-[12px] text-ink3 truncate">{c.cls} · {c.meta}</p>
                            </div>
                            {canEdit && !last && <button onClick={() => move(c, k)} aria-label={`Move ${c.name} to ${cols[ci + 1][1]}`} title={`Move to ${cols[ci + 1][1]}`} className="w-7 h-7 rounded-lg grid place-items-center text-ink3 hover:bg-sunken hover:text-brand shrink-0"><I.ArrowRight size={15} /></button>}
                          </div>
                        ))}
                        {!cards.length && <p className="text-[12.5px] text-ink3 px-1.5 py-3 text-center">Nobody here{cls !== 'all' ? ` for ${cls}` : ''}</p>}
                        {year === '2027–28' && total > b[k].length && <button onClick={() => go('admissions', { page: FUNNEL[year][Math.min(ci, FUNNEL[year].length - 1)].page })} className="text-[12.5px] font-semibold text-brand h-8 rounded-lg hover:bg-brand/8">+{total - b[k].length} more</button>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          </Col>

          <Col>
            <Card>
              <CardHead title="Today’s follow-ups" sub="Owners got a reminder at the set time" icon={I.AlarmClock} action={<Pill tone="bad">{follow.filter((e) => e.due === 'overdue').length} overdue</Pill>} />
              <div className="px-2 pb-3">
                {groups.map(([k, label, tone]) => {
                  const items = follow.filter((e) => e.due === k).sort((x, y) => (k === 'overdue' ? 0 : mins(x.next) - mins(y.next)));
                  if (!items.length) return null;
                  return (
                    <div key={k} className="mb-1">
                      <p className={cx('eyebrow px-3 pt-2 pb-1', tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-ink3')}>{label} · {items.length}</p>
                      {items.map((e) => (
                        <Row key={e.id} avatar={e.child} title={`${e.child} · ${e.cls}`} sub={`${e.action} · ${e.owner}`}
                          right={<span className={cx('text-[12.5px] font-semibold tnum whitespace-nowrap', tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-ink2')}>{k === 'overdue' ? e.next.split(', ')[0].replace(/^\w+ /, '') : e.next.split(', ')[1]}</span>}
                          onClick={() => go('admissions', { page: 'enquiries', id: e.id })} />
                      ))}
                    </div>
                  );
                })}
                {!follow.length && <p className="text-[13.5px] text-ink3 px-3 py-6 text-center">No follow-ups for these filters.</p>}
              </div>
            </Card>

            <Card>
              <CardHead title="Seats left for new joiners" sub={yl(year)} icon={I.Armchair} />
              <ul className="px-5 pb-4 flex flex-col gap-2.5">
                {Object.keys(SEATS[year]).slice(0, 8).map((c) => {
                  const n = seatTotal(year, c);
                  return (
                    <li key={c} className="flex items-center gap-3 text-[13.5px]">
                      <span className="w-16 font-medium text-ink2">{c}</span>
                      <span className="flex-1 text-ink3 text-[12.5px] truncate">{Object.entries(seatsOf(year, c)).map(([s, v]) => `${s} ${v}`).join(' · ')}</span>
                      {n === 0 ? <Pill tone="bad" className="!h-5 !text-[11px]">Full</Pill> : <span className={cx('font-semibold tnum', n <= 3 && 'text-warn')}>{n} left</span>}
                    </li>
                  );
                })}
              </ul>
            </Card>

            {role.multiSchool && (
              <Card>
                <CardHead title="Group view" sub="Central admissions across both campuses, 2027–28" icon={I.Building2} />
                <div className="px-5 pb-4">
                  <div className="grid grid-cols-[1fr_repeat(3,56px)] gap-y-2 text-[13.5px]">
                    <span className="text-[12px] text-ink3 font-semibold">Campus</span>
                    {['Enq.', 'Appl.', 'Adm.'].map((h) => <span key={h} className="text-[12px] text-ink3 font-semibold text-right">{h}</span>)}
                    {[['Kukatpally', 214, 96, 27], ['Miyapur campus', 128, 52, 15], ['Total', 342, 148, 42]].map(([n, a, p, d]) => (
                      <React.Fragment key={n}>
                        <span className={cx(n === 'Total' ? 'font-semibold border-t border-line pt-2' : 'text-ink2')}>{n}</span>
                        {[a, p, d].map((v, i) => <span key={i} className={cx('text-right tnum', n === 'Total' && 'font-semibold border-t border-line pt-2')}>{v}</span>)}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              </Card>
            )}
          </Col>
        </Split>
      </div>
      <AddEnquirySheet open={add} onClose={() => setAdd(false)} onAdd={() => {}} onOpenExisting={(id) => { setAdd(false); go('admissions', { page: 'enquiries', id }); }} />
      <NewApplicationSheet open={app} onClose={() => setApp(false)} />
    </div>
  );
}

/* ======================= Enquiries ======================= */
function Enquiries({ params, access }) {
  const { role } = useRole();
  const { go } = useNav();
  const toast = useToast();
  const canEdit = useCanEdit();
  const own = access === 'own';
  const me = role.person.name;
  const [list, setList] = useState(() => ENQUIRIES.map((e) => ({ ...e, log: logFor(e) })));
  const [open, setOpen] = useState(params?.id || null);
  const [q, setQ] = useState('');
  const [quick, setQuick] = useState('all');
  const [view, setView] = useState('all');
  const [cls, setCls] = useState('all');
  const [src, setSrc] = useState('all');
  const [sel, setSel] = useState(new Set());
  const [add, setAdd] = useState(false);
  const [imp, setImp] = useState(false);
  const [camp, setCamp] = useState(false);
  const [assign, setAssign] = useState(false);
  const [convert, setConvert] = useState(null);

  const base = own ? list.filter((e) => e.owner === me || e.addedBy === me) : list;
  const QF = { all: () => true, mine: (e) => e.owner === me, today: (e) => e.due === 'today', overdue: (e) => e.due === 'overdue', week: (e) => WEEK.has(e.created), lost: (e) => e.status === 'Lost' };
  const t = q.trim().toLowerCase();
  const digits = t.replace(/\D/g, '');
  const rows = base.filter((e) => QF[quick](e) && (view === 'all' || e.source === 'WhatsApp') && (cls === 'all' || e.cls === cls) && (src === 'all' || e.source === src) &&
    (!t || e.child.toLowerCase().includes(t) || e.parent.toLowerCase().includes(t) || e.id.toLowerCase().includes(t) || (digits.length >= 3 && e.phone.replace(/\D/g, '').includes(digits))));
  const cur = list.find((e) => e.id === open);
  const update = (n) => setList((l) => l.map((x) => (x.id === n.id ? n : x)));
  const quickOpts = [
    { value: 'all', label: own ? 'All of mine' : 'All', count: base.length },
    ...(access === 'view' ? [] : [{ value: 'mine', label: 'My enquiries', count: base.filter(QF.mine).length }]),
    { value: 'today', label: 'Follow-up today', count: base.filter(QF.today).length },
    { value: 'overdue', label: 'Overdue', count: base.filter(QF.overdue).length },
    { value: 'week', label: 'New this week', count: base.filter(QF.week).length },
    { value: 'lost', label: 'Lost', count: base.filter(QF.lost).length },
  ];
  const nextCell = (e) => e.next ? <span className={cx('text-[13px] tnum whitespace-nowrap', e.due === 'overdue' ? 'text-bad font-semibold' : e.due === 'today' ? 'text-warn font-semibold' : 'text-ink2')}>{e.due === 'overdue' && <I.CircleAlert size={13} className="inline -mt-0.5 mr-1" />}{e.next}</span> : <span className="text-ink3">—</span>;
  const columns = [
    { key: 'child', label: 'Child', render: (e) => <div className="flex items-center gap-3 min-w-0"><Avatar name={e.child} size={34} /><div className="min-w-0"><p className="font-semibold leading-tight truncate">{e.child}</p><p className="text-[12px] text-ink3 font-mono">{e.id}</p></div></div> },
    ...(cur ? [] : [{ key: 'parent', label: 'Parent', nowrap: true, render: (e) => <><p className="leading-tight">{e.parent}</p><p className="text-[12.5px] text-ink3 tnum">{e.phone}</p></> }]),
    ...(cur ? [] : [{ key: 'cls', label: 'Class wanted', nowrap: true, render: (e) => <><p className="font-medium">{e.cls}</p><p className="text-[12px] text-ink3">{yl(e.year)}</p></> }]),
    ...(cur ? [] : [{ key: 'source', label: view === 'wa' ? 'Last message' : 'Source', render: (e) => view === 'wa' ? <p className="text-[13px] text-ink2 max-w-[220px] truncate">“{e.wa?.[e.wa.length - 1]}”</p> : <><p className="text-[13.5px]">{e.source}</p>{e.campaign && <p className="text-[12px] text-info whitespace-nowrap">{e.campaign}</p>}</> }]),
    { key: 'status', label: 'Status', render: (e) => <Pill tone={STATUS_TONE[e.status]}>{e.status}</Pill> },
    { key: 'owner', label: 'Owner', nowrap: true, render: (e) => <span className="text-[13.5px]">{e.owner}</span> },
    { key: 'next', label: 'Next follow-up', render: nextCell },
    ...(cur ? [] : [{ key: 'created', label: 'Created', nowrap: true, render: (e) => <span className="text-[13px] tnum">{e.created.replace(' 2026', '')}</span> }]),
  ];
  const selectable = canEdit && !own;

  return (
    <div>
      <ModuleHead sub={own ? `Only the enquiries you added or own · ${base.length} enquiries` : `${base.filter((e) => !OPEN_DONE.includes(e.status)).length} open enquiries · 2027–28 and mid-year 2026–27`}
        actions={<>
          {!own && <Button variant="secondary" icon={I.Upload} className="hidden @md:inline-flex" onClick={() => setImp(true)}>Import</Button>}
          <Button variant="primary" icon={I.Plus} onClick={() => setAdd(true)}>Add enquiry</Button>
        </>} />
      <div className={cx('grid gap-5 @lg:gap-6 items-start', cur && '@xl:grid-cols-[minmax(0,1fr)_420px]')}>
        <div className={cx('min-w-0 flex-col gap-4', cur ? 'hidden @xl:flex' : 'flex')}>
          <Chips value={quick} onChange={setQuick} options={quickOpts} />
          <Card className="overflow-hidden">
            <Toolbar>
              <SearchBox id="enq-search" value={q} onChange={setQ} placeholder="Child, parent, phone or ENQ number" />
              <Segmented value={view} onChange={setView} options={[{ value: 'all', label: 'All enquiries' }, { value: 'wa', label: 'WhatsApp', icon: I.MessageCircle }]} />
              {!cur && (
                <div className="grid grid-cols-2 @md:flex gap-2">
                  <Select id="enq-cls" value={cls} onChange={setCls} options={[{ value: 'all', label: 'All classes' }, ...CLASS_NAMES]} className="@md:w-36" />
                  <Select id="enq-src" value={src} onChange={setSrc} options={[{ value: 'all', label: 'All sources' }, ...SOURCES]} className="@md:w-36" />
                </div>
              )}
              {!cur && <ExportButton what={`${rows.length} enquiries`} />}
            </Toolbar>
            {selectable && (
              <BulkBar count={sel.size} onClear={() => setSel(new Set())}>
                <Button size="sm" variant="secondary" icon={I.Megaphone} onClick={() => setCamp(true)}>Run campaign</Button>
                <Button size="sm" variant="secondary" icon={I.UserCog} onClick={() => setAssign(true)}>Assign owner</Button>
              </BulkBar>
            )}
            <DataList columns={columns} rows={rows} onRow={(e) => setOpen(e.id)} minWidth={cur ? 600 : 980}
              select={selectable ? [sel, setSel] : undefined}
              footer={`Showing ${rows.length} of ${base.length}`}
              empty={<Empty icon={I.SearchX} title="No enquiries match" body={q ? `Nobody called “${q}”. Try the phone number.` : 'Try a different filter.'} action={<Button variant="secondary" onClick={() => { setQ(''); setQuick('all'); setCls('all'); setSrc('all'); setView('all'); }}>Clear filters</Button>} />}
              mobile={(e) => ({ title: e.child, sub: `${e.parent} · ${e.cls} · ${e.source}`, avatar: e.child,
                pills: [<Pill key="s" tone={STATUS_TONE[e.status]} className="!h-[22px] !text-[11.5px]">{e.status}</Pill>, e.next && <Pill key="n" tone={e.due === 'overdue' ? 'bad' : e.due === 'today' ? 'warn' : 'neutral'} className="!h-[22px] !text-[11.5px]">{e.due === 'overdue' ? 'Overdue · ' : ''}{e.next}</Pill>] })} />
          </Card>
        </div>
        {cur && <EnquiryPanel key={cur.id} e={cur} own={own} canEdit={canEdit} onClose={() => setOpen(null)} onUpdate={update} onConvert={(e) => setConvert(e)} />}
      </div>

      <AddEnquirySheet open={add} onClose={() => setAdd(false)} onOpenExisting={(id) => { setAdd(false); setOpen(id); }}
        onAdd={(n) => { setList((l) => [{ ...n, log: logFor(n) }, ...l]); setQuick('all'); }} />
      <ImportSheet open={imp} onClose={() => setImp(false)} />
      <ConfirmSheet open={camp} onClose={() => setCamp(false)} title={`Run campaign for ${sel.size} enquiries`} sub="Sent through Communication. Each enquiry then shows the campaign name."
        confirmLabel={`Send to ${sel.size} families`} onConfirm={() => { setList((l) => l.map((e) => (sel.has(e.id) ? { ...e, campaign: 'Open House 24 Oct' } : e))); toast({ title: `Campaign sent to ${sel.size} families`, body: 'Open House 24 Oct · WhatsApp, with SMS backup' }); setSel(new Set()); }}>
        <div className="flex flex-col gap-3">
          <Field label="Campaign" id="camp-name"><Select id="camp-name" value="oh" onChange={() => {}} options={[{ value: 'oh', label: 'Open House 24 Oct' }]} /></Field>
          <div className="rounded-xl bg-sunken p-3.5 text-[14px] leading-relaxed text-ink2">“Dear parent, Sunrise Public School invites you to our Open House on Saturday 24 Oct, 9:30 AM to 12:30 PM. Meet the teachers, see the labs and the bus routes. Reply YES to book.”</div>
          <p className="text-[13px] text-ink3 tnum">{sel.size} WhatsApp messages · about {inr(Math.ceil(sel.size * 0.8))} · SMS only if WhatsApp fails</p>
        </div>
      </ConfirmSheet>
      {assign && <AssignSheet count={sel.size} onClose={() => setAssign(false)} onSave={(o, why) => { setList((l) => l.map((e) => (sel.has(e.id) ? { ...e, owner: o, log: [{ what: `Reassigned from ${e.owner} to ${o}. Reason: ${why}`, when: 'Today, 10:44 AM', icon: 'UserCog' }, ...e.log] } : e))); toast({ title: `${sel.size} enquiries now owned by ${o}`, body: 'Old and new owner kept in each history.' }); setSel(new Set()); }} />}
      <NewApplicationSheet open={!!convert} from={convert} onClose={() => setConvert(null)}
        onCreated={() => convert && update({ ...convert, status: 'Applied', next: null, due: null, log: [{ what: 'Converted to application APP/2027/0113. Status set to Applied.', when: 'Today, 10:44 AM', icon: 'FileText', tone: 'ok' }, ...convert.log] })} />
    </div>
  );
}

function DItem({ k, v, sub, act }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-ink3 font-semibold flex items-center gap-2">{k}{act && <button onClick={act[1]} className="text-brand hover:underline">{act[0]}</button>}</dt>
      <dd className="text-[14px] mt-0.5 break-words">{v}</dd>
      {sub && <dd className="text-[12.5px] text-ink3">{sub}</dd>}
    </div>
  );
}

function EnquiryPanel({ e, onClose, onUpdate, own, canEdit, onConvert }) {
  const toast = useToast();
  const { role } = useRole();
  const me = role.person.name;
  const [tab, setTab] = useState(e.wa ? 'chat' : 'activity');
  const [sheet, setSheet] = useState(null);
  const [chat, setChat] = useState(() => chatFor(e));
  const [draft, setDraft] = useState('');
  const [ai, setAi] = useState(!!e.ai);
  const [answered, setAnswered] = useState(false);
  const closed = OPEN_DONE.includes(e.status);
  const log = (what, icon = 'Circle', tone, patch = {}) => onUpdate({ ...e, ...patch, log: [{ what, when: `Today, 10:44 AM · ${me}`, icon, tone }, ...e.log] });
  const sendChat = (text, viaAi) => {
    setChat((c) => [...c, { from: 'school', text, time: 'Today, 10:44 AM', by: me }]);
    setDraft(''); setAnswered(true);
    log(`WhatsApp reply sent${viaAi ? ' (checked from the AI suggestion)' : ''}.`, 'MessageCircle', 'brand');
    toast({ title: `Reply sent to ${e.parent}`, body: 'WhatsApp · saved in this enquiry’s history' });
  };
  const draftAi = AI_DRAFT[e.id];
  const close = () => setSheet(null);
  return (
    <Card className="min-w-0 animate-rise">
      <div className="flex items-center justify-between px-3 pt-2.5">
        <button onClick={onClose} className="@xl:invisible inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink h-8 px-1 rounded-lg"><I.ArrowLeft size={17} />All enquiries</button>
        <IconButton icon={I.X} label="Close" size={36} onClick={onClose} className="hidden @xl:inline-flex" />
      </div>
      <div className="px-5 pb-4 flex items-start gap-3.5">
        <Avatar name={e.child} size={48} />
        <div className="min-w-0 flex-1">
          <h2 className="font-display font-semibold text-[20px] leading-tight">{e.child}</h2>
          <p className="text-[13px] text-ink3 mt-0.5">{e.cls} · {yl(e.year)} · <span className="font-mono text-[12px]">{e.id}</span></p>
          <div className="flex gap-1.5 mt-2 flex-wrap"><Pill tone={STATUS_TONE[e.status]} dot>{e.status}</Pill>{e.campaign && <Pill tone="info">{e.campaign}</Pill>}{e.status === 'Lost' && <Pill tone="neutral">{e.lost}</Pill>}</div>
        </div>
      </div>
      {canEdit && !closed && (
        <div className="grid grid-cols-4 gap-2 px-4 pb-4">
          {[['PhoneCall', 'Log call', 'call'], ['StickyNote', 'Add note', 'note'], ['Send', 'Message', 'msg'], ['AlarmClock', 'Follow-up', 'follow']].map(([ic, l, k]) => (
            <button key={k} onClick={() => setSheet(k)} className="flex flex-col items-center gap-1.5 py-2.5 rounded-xl bg-sunken/70 hover:bg-brand/8 hover:text-brand transition text-[12.5px] font-semibold">
              <Icon name={ic} size={18} className="text-brand" />{l}
            </button>
          ))}
        </div>
      )}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 px-5 py-4 border-t border-line/70">
        <DItem k="Parent" v={e.parent} sub={e.rel} />
        <DItem k="Phone" v={<span className="tnum select-all">+91 {e.phone}</span>} />
        <DItem k="Source" v={e.source} sub={e.firstSource ? `First recorded: ${e.firstSource}` : e.ref ? `By ${e.ref}` : null} act={canEdit && !own && !closed ? ['Change', () => setSheet('source')] : null} />
        <DItem k="Owner" v={e.owner} act={canEdit && !own && !closed ? ['Reassign', () => setSheet('reassign')] : null} />
        <DItem k="Next follow-up" v={e.next ? <span className={cx('tnum', e.due === 'overdue' && 'text-bad font-semibold', e.due === 'today' && 'text-warn font-semibold')}>{e.next}</span> : '—'} sub={e.action || null} />
        <DItem k="Campaign" v={e.campaign || 'None'} />
        <DItem k="Added" v={e.created} sub={`By ${e.addedBy}`} />
        <DItem k="Class wanted" v={e.cls} sub={seatTotal(e.year, e.cls) === 0 ? 'Class is full' : `${seatTotal(e.year, e.cls)} seats left`} />
      </dl>
      {canEdit && !closed && (
        <div className="flex gap-2 px-5 pb-4">
          {!own ? <Button variant="primary" icon={I.FilePlus2} className="flex-1" onClick={() => onConvert(e)}>Convert to application</Button>
            : <Button variant="secondary" icon={I.ListChecks} className="flex-1" onClick={() => setSheet('status')}>Change status</Button>}
          <MoreMenu items={[
            ...(!own ? [['ListChecks', 'Change status', () => setSheet('status')], ['UserCog', 'Reassign owner', () => setSheet('reassign')], ['Tag', 'Change source', () => setSheet('source')]] : []),
            ['CircleX', 'Close as lost', () => setSheet('lost'), 'bad'],
          ]} />
        </div>
      )}
      {canEdit && e.status === 'Lost' && (
        <div className="px-5 pb-4"><Button variant="secondary" icon={I.RotateCcw} className="w-full" onClick={() => { log('Reopened. Status set to Contacted.', 'RotateCcw', 'brand', { status: 'Contacted', next: 'Mon 12 Oct, 11:00 AM', due: 'later', action: 'Call again' }); toast({ title: `${e.child}’s enquiry reopened`, body: `Follow-up set for Mon 12 Oct, 11:00 AM with ${e.owner}.` }); }}>Reopen enquiry</Button></div>
      )}
      <Tabs className="px-3" value={tab} onChange={setTab} tabs={[{ id: 'chat', label: e.wa ? 'WhatsApp chat' : 'Messages', count: chat.length }, { id: 'activity', label: 'Activity', count: e.log.length }]} />
      {tab === 'chat' ? (
        <div className="p-4 flex flex-col gap-3">
          {e.wa && (
            <div className={cx('rounded-xl px-3.5 py-2.5 flex items-center gap-2.5 text-[13px]', ai ? 'bg-brand/8' : 'bg-sunken')}>
              {ai ? <I.Sparkles size={16} className="text-brand shrink-0" /> : <I.CirclePause size={16} className="text-ink3 shrink-0" />}
              <p className="flex-1 min-w-0 text-ink2">{ai ? <><b className="font-semibold text-ink">AI auto-reply on.</b> It drafts replies from Admission Settings facts. A person sends them.</> : <><b className="font-semibold text-ink">AI auto-reply paused</b> for this enquiry. Reply in person.</>}</p>
              {canEdit && <Button size="sm" variant={ai ? 'secondary' : 'soft'} icon={ai ? I.Pause : I.Play} onClick={() => { setAi(!ai); log(`AI auto-reply ${ai ? 'paused' : 'resumed'} for this enquiry.`, ai ? 'CirclePause' : 'CirclePlay'); toast({ title: `AI auto-reply ${ai ? 'paused' : 'resumed'} for this enquiry`, tone: 'info' }); }}>{ai ? 'Pause' : 'Resume'}</Button>}
            </div>
          )}
          {chat.length === 0 ? <p className="text-[13.5px] text-ink3 text-center py-6">No messages yet. Send the welcome message to start.</p> : (
            <ol className="flex flex-col gap-2.5">
              {chat.map((m, i) => (
                <li key={i} className={cx('max-w-[86%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-snug', m.from === 'parent' ? 'bg-sunken self-start rounded-bl-md' : 'bg-brand/10 self-end rounded-br-md')}>
                  <p>{m.text}</p>
                  <p className="text-[11.5px] text-ink3 mt-1">{m.from === 'parent' ? e.parent : m.by} · {m.time}</p>
                </li>
              ))}
            </ol>
          )}
          {e.wa && ai && draftAi && !answered && canEdit && (
            <Suggestion title="Suggested reply" source={draftAi.src}
              actions={<>
                <Button size="sm" variant="primary" icon={I.Send} onClick={() => sendChat(draftAi.text, true)}>Send this reply</Button>
                <Button size="sm" variant="secondary" icon={I.Pencil} onClick={() => setDraft(draftAi.text)}>Edit first</Button>
                <Button size="sm" variant="ghost" onClick={() => { setAnswered(true); toast({ title: 'Thanks. The suggestion is hidden.', tone: 'info' }); }}>Not useful</Button>
              </>}>“{draftAi.text}”</Suggestion>
          )}
          {canEdit && e.status !== 'Lost' && (
            <div className="flex gap-2">
              <Input id={`enq-reply-${e.id}`} value={draft} onChange={(x) => setDraft(x.target.value)} placeholder={`Message ${e.parent}`} />
              <Button variant="primary" icon={I.Send} aria-label="Send" className="!px-3.5 !h-11" disabled={!draft.trim()} onClick={() => sendChat(draft.trim())} />
            </div>
          )}
        </div>
      ) : (
        <div className="px-5 pt-5">
          <Timeline items={e.log} />
          <p className="text-[12px] text-ink3 pb-4 -mt-2 flex items-center gap-1.5"><I.Lock size={13} />Full history is kept. Notes, calls and changes are never deleted.</p>
        </div>
      )}

      {sheet === 'call' && <CallSheet e={e} onClose={close} onSave={(t) => { log(t, 'PhoneCall'); toast({ title: 'Call saved', body: t }); }} />}
      {sheet === 'note' && <NoteSheet e={e} onClose={close} onSave={(t) => { log(`Note: ${t}`, 'StickyNote'); toast({ title: 'Note added', body: 'Only staff can see notes.' }); }} />}
      {sheet === 'msg' && <MessageSheet e={e} onClose={close} onSend={(ch, tpl, text) => { setChat((c) => [...c, { from: 'school', text, time: 'Today, 10:44 AM', by: me }]); setTab('chat'); log(`${ch} sent: “${tpl}”.`, 'Send', 'brand'); toast({ title: `Sent to ${e.parent} on ${ch}`, body: 'Saved in this enquiry’s message history.' }); }} />}
      {sheet === 'follow' && <FollowSheet e={e} onClose={close} onSave={(when, owner, action) => { log(`Next follow-up set: ${when} with ${owner}. ${action}`, 'AlarmClock', 'info', { next: when, due: 'later', action, owner }); toast({ title: 'Follow-up set', body: `${owner} gets a reminder on ${when}.` }); }} />}
      {sheet === 'reassign' && <AssignSheet current={e.owner} onClose={close} onSave={(o, why) => { log(`Reassigned from ${e.owner} to ${o}. Reason: ${why}`, 'UserCog', 'info', { owner: o }); toast({ title: `${e.child}’s enquiry now owned by ${o}`, body: `${o} got a notification.` }); }} />}
      {sheet === 'source' && <SourceSheet e={e} onClose={close} onSave={(s, why) => { log(`Source changed from ${e.source} to ${s}. Reason: ${why}. First recorded source stays ${e.firstSource || e.source} in reports.`, 'Tag', 'warn', { source: s, firstSource: e.firstSource || e.source }); toast({ title: `Source changed to ${s}`, body: `${e.firstSource || e.source} stays the first recorded source.` }); }} />}
      {sheet === 'status' && <StatusSheet e={e} onClose={close} onSave={(s) => { log(`Status changed from ${e.status} to ${s}.`, 'ListChecks', 'brand', { status: s }); toast({ title: `Status: ${s}`, undo: () => onUpdate(e) }); }} />}
      {sheet === 'lost' && <LostSheet e={e} onClose={close} onSave={(r) => { log(`Closed as lost. Reason: ${r}.`, 'CircleX', 'neutral', { status: 'Lost', lost: r, next: null, due: null }); toast({ title: `${e.child}’s enquiry closed as lost`, body: `Reason: ${r}. It can be reopened later.`, undo: () => onUpdate(e) }); }} />}
    </Card>
  );
}

const TIMES = ['9:30 AM', '10:00 AM', '11:00 AM', '12:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM'];
function CallSheet({ e, onClose, onSave }) {
  const [dir, setDir] = useState('Outgoing');
  const [out, setOut] = useState('Spoke to the parent');
  const [note, setNote] = useState('');
  return (
    <FormSheet open onClose={onClose} title="Log a call" sub={`${e.parent} · +91 ${e.phone}`} submitLabel="Save call" onSubmit={() => onSave(`${dir} call: ${out.toLowerCase()}.${note.trim() ? ' ' + note.trim() : ''}`)}>
      <Field label="Call" id="call-dir"><Segmented value={dir} onChange={setDir} options={['Outgoing', 'Incoming']} className="w-full" /></Field>
      <Field label="What happened" required id="call-out"><Select id="call-out" value={out} onChange={setOut} options={['Spoke to the parent', 'No answer', 'Busy, asked to call back', 'Switched off', 'Wrong number']} /></Field>
      <Field label="Note" id="call-note"><Textarea id="call-note" value={note} onChange={setNote} placeholder="What did they ask? What did you promise?" /></Field>
    </FormSheet>
  );
}
function NoteSheet({ e, onClose, onSave }) {
  const [t, setT] = useState('');
  const [err, setErr] = useState('');
  return (
    <FormSheet open onClose={onClose} title="Add note" sub={`On ${e.child}’s enquiry. Only staff can see it.`} submitLabel="Add note" onSubmit={() => { if (!t.trim()) { setErr('Write the note first'); return false; } onSave(t.trim()); }}>
      <Field label="Note" required id="enq-note" error={err}><Textarea id="enq-note" value={t} onChange={(v) => { setT(v); setErr(''); }} placeholder="For example: wants hostel from Class 6. Grandfather will decide." /></Field>
    </FormSheet>
  );
}
const TEMPLATES = {
  'Thank you for enquiring': (e) => `Dear ${e.parent}, thank you for your interest in Sunrise Public School for ${e.child} (${e.cls}, ${e.year}). Our admission desk will call you soon.`,
  'School visit invite': (e) => `Dear ${e.parent}, you are welcome to visit Sunrise Public School with ${e.child}. Visiting hours: Mon–Sat, 9:30 AM to 12:30 PM. Reply with a day that suits you.`,
  'Application link': (e) => `Dear ${e.parent}, here is the admission form for ${e.child} (${e.cls}): apply.schoolos.in/sps-hyd-001. It takes about 10 minutes on your phone.`,
  'Fee details 2027–28': (e) => `Dear ${e.parent}, the tuition fee for ${e.cls} in 2027–28 is ${inr(YEAR_FEE(e.cls))} a year, in four installments. The application fee is ₹500.`,
};
function MessageSheet({ e, onClose, onSend }) {
  const [ch, setCh] = useState('WhatsApp');
  const [tpl, setTpl] = useState('School visit invite');
  return (
    <FormSheet open onClose={onClose} title={`Message ${e.parent}`} sub={`+91 ${e.phone} · saved in this enquiry`} submitLabel={`Send to ${e.parent}`} busyLabel="Sending…" onSubmit={() => onSend(ch, tpl, TEMPLATES[tpl](e))}>
      <Field label="Send by" id="msg-ch"><Segmented value={ch} onChange={setCh} options={['WhatsApp', 'SMS', 'Email']} className="w-full" /></Field>
      <Field label="Template" required id="msg-tpl"><Select id="msg-tpl" value={tpl} onChange={setTpl} options={Object.keys(TEMPLATES)} /></Field>
      <div><p className="text-[13px] font-semibold text-ink2 mb-1.5">Preview</p><div className="rounded-xl bg-sunken p-3.5 text-[14px] leading-relaxed text-ink2">{TEMPLATES[tpl](e)}</div></div>
      {ch === 'Email' && <Banner tone="warn">No email on this enquiry yet. Add one under Edit enquiry, or send on WhatsApp.</Banner>}
    </FormSheet>
  );
}
function FollowSheet({ e, onClose, onSave }) {
  const [d, setD] = useState('12-10-2026');
  const [tm, setTm] = useState('11:00 AM');
  const [o, setO] = useState(e.owner);
  const [a, setA] = useState(e.action || 'Call the parent');
  const [err, setErr] = useState('');
  return (
    <FormSheet open onClose={onClose} title="Set next follow-up" sub="The owner gets a reminder at this time" submitLabel="Set follow-up"
      onSubmit={() => { if (!/^\d{2}-\d{2}-\d{4}$/.test(d)) { setErr('Use DD-MM-YYYY, like 12-10-2026'); return false; } onSave(`${d.slice(0, 2).replace(/^0/, '')} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+d.slice(3, 5) - 1] || 'Oct'}, ${tm}`, o, a); }}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" required id="fu-d" error={err}><Input id="fu-d" value={d} onChange={(x) => { setD(x.target.value); setErr(''); }} placeholder="DD-MM-YYYY" error={err} className="tnum" /></Field>
        <Field label="Time" required id="fu-t"><Select id="fu-t" value={tm} onChange={setTm} options={TIMES} /></Field>
      </div>
      <Field label="Owner" required id="fu-o"><Select id="fu-o" value={o} onChange={setO} options={OWNERS} /></Field>
      <Field label="Next action" id="fu-a"><Input id="fu-a" value={a} onChange={(x) => setA(x.target.value)} /></Field>
    </FormSheet>
  );
}
function AssignSheet({ current, count, onClose, onSave }) {
  const [o, setO] = useState(OWNERS.find((x) => x !== current));
  const [why, setWhy] = useState('');
  const [err, setErr] = useState('');
  return (
    <FormSheet open onClose={onClose} title={count ? `Assign ${count} enquiries` : 'Reassign owner'} sub={current ? `Now owned by ${current}. The history keeps both names.` : 'The history keeps the old and new owner.'} submitLabel={count ? `Assign ${count} to ${o}` : `Reassign to ${o}`}
      onSubmit={() => { if (!why.trim()) { setErr('Give a reason, like “Divya on leave this week”'); return false; } onSave(o, why.trim()); }}>
      <Field label="New owner" required id="as-o"><Select id="as-o" value={o} onChange={setO} options={OWNERS.filter((x) => x !== current)} /></Field>
      <Field label="Reason" required id="as-why" error={err}><Input id="as-why" value={why} onChange={(x) => { setWhy(x.target.value); setErr(''); }} error={err} placeholder="Why is the owner changing?" /></Field>
    </FormSheet>
  );
}
function SourceSheet({ e, onClose, onSave }) {
  const [s, setS] = useState(SOURCES.find((x) => x !== e.source));
  const [why, setWhy] = useState('');
  const [err, setErr] = useState('');
  return (
    <FormSheet open onClose={onClose} title="Change source" sub="Only people with the admission permission can do this" submitLabel={`Change to ${s}`}
      onSubmit={() => { if (!why.trim()) { setErr(`Give a reason for changing the source from ${e.source} to ${s}`); return false; } onSave(s, why.trim()); }}>
      <Banner tone="info" icon="Lock">The first recorded source, <b className="font-semibold text-ink">{e.firstSource || e.source}</b>, stays in the activity log and the source reports count it.</Banner>
      <Field label="New source" required id="src-new"><Select id="src-new" value={s} onChange={setS} options={SOURCES.filter((x) => x !== e.source)} /></Field>
      <Field label="Reason" required id="src-why" error={err}><Input id="src-why" value={why} onChange={(x) => { setWhy(x.target.value); setErr(''); }} error={err} placeholder="For example: parent says a friend referred them" /></Field>
    </FormSheet>
  );
}
function StatusSheet({ e, onClose, onSave }) {
  const opts = STATUSES.filter((s) => !['Applied', 'Admitted', 'Lost', e.status].includes(s));
  const [s, setS] = useState(opts[0]);
  return (
    <FormSheet open onClose={onClose} title="Change status" sub={`Now: ${e.status}. Applied and Admitted are set by the system.`} submitLabel={`Set to ${s}`} onSubmit={() => onSave(s)}>
      <Field label="New status" required id="st-new"><Select id="st-new" value={s} onChange={setS} options={opts} /></Field>
    </FormSheet>
  );
}
function LostSheet({ e, onClose, onSave }) {
  const [r, setR] = useState('');
  const [err, setErr] = useState('');
  return (
    <FormSheet open onClose={onClose} title="Close as lost" sub={`${e.child} · ${e.cls}. It can be reopened later.`} submitLabel="Close as lost" onSubmit={() => { if (!r) { setErr('Choose why this enquiry was lost'); return false; } onSave(r); }}>
      <Field label="Reason" required id="lost-r" error={err}><Select id="lost-r" value={r} onChange={(v) => { setR(v); setErr(''); }} error={err} options={[{ value: '', label: 'Choose a reason' }, ...LOSS]} /></Field>
    </FormSheet>
  );
}

/* ---------- Add enquiry ---------- */
const PARENT_MATCH = { '9849031277': { text: 'This phone belongs to Rajesh Sharma, parent of Aarav Sharma, 7 B', student: true }, '9849560211': { text: 'This phone belongs to Priya Sharma, parent of Aarav Sharma, 7 B and Anaya Sharma, UKG A', student: true } };
function AddEnquirySheet({ open, onClose, onAdd, onOpenExisting }) {
  const { role } = useRole();
  const { go } = useNav();
  const toast = useToast();
  const me = role.person.name;
  const empty = { child: '', parent: '', phone: '', cls: '', year: '2027–28', source: 'Walk-in', owner: '', date: '10-10-2026', time: '11:00 AM', email: '', dob: '', current: '', ref: '', notes: '' };
  const [f, setF] = useState(empty);
  const [tch, setTch] = useState({});
  const [more, setMore] = useState(false);
  const [dup, setDup] = useState(null);
  const [sib, setSib] = useState(false);
  useEffect(() => { if (open) { setF(empty); setTch({}); setDup(null); setSib(false); setMore(false); } }, [open]);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v && v.target ? v.target.value : v }));
  const owner = f.owner || ownerFor(f.cls);
  const err = {
    child: !f.child.trim() ? 'Enter the child’s name' : '',
    parent: !f.parent.trim() ? 'Enter the parent’s name' : '',
    phone: phoneErr(f.phone),
    date: !/^\d{2}-\d{2}-\d{4}$/.test(f.date) ? 'Use DD-MM-YYYY' : '',
  };
  const show = (k) => tch[k] && err[k];
  const checkDup = () => {
    setTch((x) => ({ ...x, phone: 1 }));
    const d = f.phone.replace(/\D/g, '');
    if (d.length !== 10) return setDup(null);
    const enq = ENQUIRIES.find((e) => e.phone.replace(' ', '') === d && !OPEN_DONE.includes(e.status));
    if (enq) return setDup({ text: `This phone already has an open enquiry for ${enq.child} (${enq.cls}), owned by ${enq.owner}`, enq: enq.id });
    if (PARENT_MATCH[d]) return setDup(PARENT_MATCH[d]);
    setDup(null);
  };
  const submit = () => {
    setTch({ child: 1, parent: 1, phone: 1, date: 1 });
    if (Object.values(err).some(Boolean)) return false;
    if (dup && !sib) { toast({ tone: 'bad', title: 'Choose what to do with the matching phone', body: 'Open existing, or add as a sibling enquiry.' }); return false; }
    const id = 'ENQ-0489';
    onAdd?.({ id, child: f.child.trim(), parent: f.parent.trim(), rel: 'Parent', phone: f.phone, cls: f.cls || 'Not decided', year: f.year, source: f.source, status: 'New', owner, addedBy: me, next: `Sat 10 Oct, ${f.time}`, due: 'tomorrow', action: 'First call', created: '9 Oct 2026', ref: f.ref || undefined });
    toast({ title: `Enquiry ${id} added for ${f.child.trim()}`, body: `Owner ${owner} gets a reminder on ${f.date} at ${f.time}.${sib ? ' Linked as a sibling enquiry.' : ''}` });
  };
  return (
    <FormSheet open={open} onClose={onClose} title="Add enquiry" sub="Five things now. Add the rest later from the enquiry." submitLabel="Add enquiry" busyLabel="Adding…" onSubmit={submit}>
      <Field label="Child’s name" required id="ae-child" error={show('child')}><Input id="ae-child" value={f.child} onChange={set('child')} onBlur={() => setTch((x) => ({ ...x, child: 1 }))} error={show('child')} placeholder="First and last name" autoComplete="off" /></Field>
      <Field label="Parent’s name" required id="ae-parent" error={show('parent')}><Input id="ae-parent" value={f.parent} onChange={set('parent')} onBlur={() => setTch((x) => ({ ...x, parent: 1 }))} error={show('parent')} placeholder="Father, mother or guardian" /></Field>
      <Field label="Phone" required id="ae-phone" error={show('phone')} hint={!show('phone') && 'We check for a matching family when you leave this box'}>
        <PhoneInput id="ae-phone" value={f.phone} onChange={(v) => { set('phone')(v); setDup(null); setSib(false); }} onBlur={checkDup} error={show('phone')} />
      </Field>
      {dup && (
        <div className="rounded-xl border border-warn/40 bg-warn/12 p-3.5 animate-rise">
          <p className="font-semibold text-[14px] flex gap-2"><I.TriangleAlert size={17} className="text-warn shrink-0 mt-0.5" />{dup.text}</p>
          {sib ? <p className="text-[13px] text-ink2 mt-2 flex items-center gap-1.5"><I.Check size={15} className="text-ok" />Will be added as a sibling enquiry, linked to the same family.</p> : (
            <div className="flex gap-2 mt-3 flex-wrap">
              <Button type="button" size="sm" variant="secondary" icon={I.ExternalLink} onClick={() => (dup.enq ? onOpenExisting(dup.enq) : (onClose(), go('student', { id: FEATURED.id })))}>Open existing</Button>
              <Button type="button" size="sm" variant="soft" icon={I.Users} onClick={() => setSib(true)}>Add as sibling enquiry</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => { set('phone')(''); setDup(null); }}>Cancel</Button>
            </div>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Class wanted" id="ae-cls"><Select id="ae-cls" value={f.cls} onChange={set('cls')} options={[{ value: '', label: 'Not decided' }, ...CLASS_NAMES]} /></Field>
        <Field label="For year" id="ae-year"><Select id="ae-year" value={f.year} onChange={set('year')} options={[{ value: '2027–28', label: '2027–28' }, { value: '2026–27', label: '2026–27 (mid-year)' }]} /></Field>
      </div>
      <Field label="Source" required id="ae-src" hint="Kept as first recorded. Changing it later needs a reason.">
        <Segmented value={f.source} onChange={set('source')} options={['Walk-in', 'Phone', 'Referral', 'Website']} className="w-full" size="sm" />
      </Field>
      <Field label="Owner" required id="ae-owner" hint={!f.owner ? 'Set by “Who gets new enquiries”: by class wanted' : 'Changed by hand. The history keeps it.'}>
        <Select id="ae-owner" value={owner} onChange={set('owner')} options={OWNERS} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Next follow-up" required id="ae-date" error={show('date')}><Input id="ae-date" value={f.date} onChange={set('date')} error={show('date')} placeholder="DD-MM-YYYY" className="tnum" /></Field>
        <Field label="Time" required id="ae-time"><Select id="ae-time" value={f.time} onChange={set('time')} options={TIMES} /></Field>
      </div>
      <MoreDetails open={more} onToggle={() => setMore(!more)}>
        <Field label="Email" id="ae-email"><Input id="ae-email" type="email" value={f.email} onChange={set('email')} placeholder="name@example.com" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Child’s date of birth" id="ae-dob"><Input id="ae-dob" value={f.dob} onChange={set('dob')} placeholder="DD-MM-YYYY" className="tnum" /></Field>
          <Field label="Current school" id="ae-cur"><Input id="ae-cur" value={f.current} onChange={set('current')} /></Field>
        </div>
        <Field label="Referred by" id="ae-ref"><Input id="ae-ref" value={f.ref} onChange={set('ref')} placeholder="A parent or staff member" /></Field>
        <Field label="Notes" id="ae-notes"><Textarea id="ae-notes" value={f.notes} onChange={set('notes')} rows={2} /></Field>
      </MoreDetails>
    </FormSheet>
  );
}

function ImportSheet({ open, onClose }) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  useEffect(() => { if (open) setStep(0); }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title="Import enquiries" sub="From the old software or a spreadsheet. Every row is checked before anything is added."
      footer={step === 0 ? <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={I.Upload} onClick={() => setStep(1)}>Check old-enquiries.xlsx</Button></>
        : <><Button variant="ghost" onClick={() => setStep(0)}>Back</Button><Button variant="primary" icon={I.Check} onClick={() => { onClose(); toast({ title: '197 enquiries imported', body: 'Owners and follow-ups set. 3 duplicates were flagged, not added. Undo from Import history.' }); }}>Import 197 enquiries</Button></>}>
      {step === 0 ? (
        <div className="flex flex-col gap-3">
          <button onClick={() => toast({ title: 'Saved: enquiries-sample.xlsx', body: 'Columns: child, parent, phone, class wanted, source, status, owner, next follow-up, notes' })} className="flex items-center gap-3 rounded-xl border border-line p-3.5 text-left hover:bg-sunken/60">
            <span className="w-10 h-10 rounded-xl bg-sunken grid place-items-center"><I.Download size={18} /></span>
            <span className="flex-1"><b className="font-semibold text-[14px] block">1. Download the sample</b><span className="text-[12.5px] text-ink3">Fill one enquiry per row</span></span>
          </button>
          <div className="rounded-xl border-2 border-dashed border-line p-6 text-center">
            <I.FileSpreadsheet size={28} className="mx-auto text-ink3" />
            <p className="font-semibold text-[14px] mt-2">old-enquiries.xlsx</p>
            <p className="text-[12.5px] text-ink3">200 rows · 48 KB · chosen just now</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Stats items={[{ label: 'Ready', value: '197', tone: 'ok' }, { label: 'Duplicates', value: '3', tone: 'warn' }, { label: 'Errors', value: '0' }]} />
          <ul className="flex flex-col gap-1 text-[13.5px]">
            {[['Row 14', 'Phone 98490 31277 is Rajesh Sharma, parent of Aarav Sharma, 7 B'], ['Row 61', 'Phone 99083 51276 already has an open enquiry (Myra Khan)'], ['Row 188', 'Same phone as row 12']].map(([r, t]) => (
              <li key={r} className="flex gap-2.5 rounded-xl bg-warn/12 px-3 py-2"><b className="font-semibold shrink-0 tnum">{r}</b><span className="text-ink2">{t}</span></li>
            ))}
          </ul>
          <p className="text-[12.5px] text-ink3">Owners follow “Who gets new enquiries”. Rows with no follow-up date get the next working day, 11:00 AM.</p>
        </div>
      )}
    </Sheet>
  );
}

/* ---------- New application ---------- */
function NewApplicationSheet({ open, onClose, from, onCreated }) {
  const toast = useToast();
  const mk = () => ({ year: from?.year || '2027–28', cls: from && CLASS_NAMES.includes(from.cls) ? from.cls : '', child: from?.child || '', dob: '', gender: '', father: from?.rel === 'Father' ? from.parent : '', mother: from?.rel === 'Mother' ? from.parent : '', phone: from?.phone || '', address: '', school: '', last: '', marks: '', lang: 'Telugu', transport: false, stop: 'Route 4 · Miyapur X Roads', hostel: false, email: '', job: '', tongue: '', otp: '', sent: false, consent: false, photo: false });
  const [f, setF] = useState(mk);
  const [tch, setTch] = useState(false);
  const [more, setMore] = useState(false);
  useEffect(() => { if (open) { setF(mk()); setTch(false); setMore(false); } }, [open, from]);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v && v.target ? v.target.value : v }));
  const no = f.year === '2026–27' ? 'APP/2026/0062' : 'APP/2027/0113';
  const needPrev = f.cls && !['Nursery', 'LKG', 'UKG', 'Class 1'].includes(f.cls);
  const err = {
    cls: !f.cls ? 'Choose the class' : seatTotal(f.year, f.cls) === 0 ? `${f.cls} is full for ${f.year}. The application can still go on the waiting list.` : '',
    child: !f.child.trim() ? 'Enter the child’s full name' : '',
    dob: !/^\d{2}-\d{2}-\d{4}$/.test(f.dob) ? 'Use DD-MM-YYYY, like 14-03-2021' : '',
    gender: !f.gender ? 'Choose one' : '',
    parent: !f.father.trim() && !f.mother.trim() ? 'Enter at least one parent or guardian' : '',
    phone: phoneErr(f.phone),
    address: !f.address.trim() ? 'Enter the home address' : '',
    school: needPrev && !f.school.trim() ? 'Needed for Class 2 and above' : '',
    consent: !f.consent ? 'The guardian must agree with the one-time code before the form is saved' : '',
  };
  const e = (k) => tch && err[k];
  const blocking = Object.entries(err).filter(([k, v]) => v && !(k === 'cls' && f.cls));
  const sibling = f.phone.replace(/\D/g, '') === '9849031277' || f.phone.replace(/\D/g, '') === '9849560211';
  return (
    <FormSheet open={open} onClose={onClose} wide title={from ? `Application for ${from.child}` : 'New application'} sub={from ? `Filled from enquiry ${from.id}. Nothing is typed twice.` : 'Filled at the counter. The parent can check it on your screen.'}
      submitLabel="Save application" onSubmit={() => {
        setTch(true);
        if (blocking.length) return false;
        onCreated?.();
        toast({ title: `Application ${no} created for ${f.child.trim()}`, body: `Next: papers for ${f.cls} in Documents & Verification.${from ? ' Enquiry set to Applied.' : ''}` });
      }}>
      <div className="flex items-center gap-3 rounded-xl bg-sunken px-3.5 py-2.5 text-[13.5px]">
        <I.Hash size={16} className="text-ink3" /><span className="text-ink3">Application number</span><b className="font-mono font-semibold text-[13px] ml-auto">{no}</b>
      </div>
      <SubHead>Child</SubHead>
      <div className="grid @md:grid-cols-2 gap-3">
        <Field label="Admission year" required id="na-year"><Select id="na-year" value={f.year} onChange={set('year')} options={[{ value: '2027–28', label: '2027–28' }, { value: '2026–27', label: '2026–27 (mid-year)' }]} /></Field>
        <Field label="Class applied for" required id="na-cls" error={tch && !f.cls && err.cls} hint={f.cls ? (seatTotal(f.year, f.cls) === 0 ? <span className="text-warn font-semibold">{err.cls}</span> : `Seats left · ${seatText(f.year, f.cls)}`) : null}>
          <Select id="na-cls" value={f.cls} onChange={set('cls')} error={tch && !f.cls} options={[{ value: '', label: 'Choose class' }, ...(f.year === '2026–27' ? Object.keys(SEATS['2026–27']) : CLASS_NAMES)]} />
        </Field>
      </div>
      <Field label="Child’s full name" required id="na-child" error={e('child')}><Input id="na-child" value={f.child} onChange={set('child')} error={e('child')} placeholder="As on the birth certificate" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date of birth" required id="na-dob" error={e('dob')} hint={!e('dob') && f.cls === 'Nursery' ? 'Must be 3 years old on 1 Jun 2027' : null}><Input id="na-dob" value={f.dob} onChange={set('dob')} error={e('dob')} placeholder="DD-MM-YYYY" className="tnum" /></Field>
        <Field label="Gender" required id="na-g" error={e('gender')}><Segmented value={f.gender} onChange={set('gender')} options={['Girl', 'Boy', 'Other']} className="w-full" size="sm" /></Field>
      </div>
      <SubHead>Parents</SubHead>
      <div className="grid @md:grid-cols-2 gap-3">
        <Field label="Father’s name" id="na-f" error={e('parent')}><Input id="na-f" value={f.father} onChange={set('father')} error={e('parent')} /></Field>
        <Field label="Mother’s name" id="na-m" hint="At least one parent or guardian"><Input id="na-m" value={f.mother} onChange={set('mother')} error={e('parent')} /></Field>
      </div>
      <Field label="Parent’s phone" required id="na-phone" error={e('phone')}><PhoneInput id="na-phone" value={f.phone} onChange={set('phone')} error={e('phone')} /></Field>
      {sibling && <Banner tone="ok" icon="Users"><b className="font-semibold text-ink">Sibling found:</b> Aarav Sharma (7 B) and Anaya Sharma (UKG A). Linked for sibling priority.</Banner>}
      <Field label="Home address" required id="na-addr" error={e('address')}><Textarea id="na-addr" value={f.address} onChange={set('address')} rows={2} placeholder="House number, street, area, PIN code" /></Field>
      {f.cls && f.cls !== 'Nursery' && (
        <>
          <SubHead>Previous school</SubHead>
          <div className="grid @md:grid-cols-3 gap-3">
            <Field label="School name" required={needPrev} id="na-sch" error={e('school')}><Input id="na-sch" value={f.school} onChange={set('school')} error={e('school')} /></Field>
            <Field label="Last class" id="na-last"><Input id="na-last" value={f.last} onChange={set('last')} placeholder="Class 4 (2025–26)" /></Field>
            <Field label="Marks or %" id="na-marks"><Input id="na-marks" value={f.marks} onChange={set('marks')} placeholder="86% or A1" /></Field>
          </div>
        </>
      )}
      <SubHead>Preferences</SubHead>
      <div className="grid @md:grid-cols-2 gap-3">
        <Field label="Second language" id="na-lang"><Segmented value={f.lang} onChange={set('lang')} options={['Telugu', 'Hindi']} className="w-full" size="sm" /></Field>
        <div className="flex flex-col gap-2.5 rounded-xl border border-line p-3">
          <label className="flex items-center gap-3 text-[14px]"><Switch on={f.transport} onChange={set('transport')} label="Transport needed" /><span className="font-semibold">Transport needed</span></label>
          {f.transport && <Select id="na-stop" value={f.stop} onChange={set('stop')} options={['Route 1 · KPHB Main Road', 'Route 2 · Nizampet X Roads', 'Route 3 · Bachupally', 'Route 4 · Miyapur X Roads', 'Route 5 · Moosapet Y Junction', 'Route 6 · Chandanagar']} />}
          <label className="flex items-center gap-3 text-[14px]"><Switch on={f.hostel} onChange={set('hostel')} label="Hostel needed" /><span className="font-semibold">Hostel needed</span></label>
        </div>
      </div>
      <MoreDetails open={more} onToggle={() => setMore(!more)}>
        <div className="grid @md:grid-cols-2 gap-3">
          <Field label="Email" id="na-email"><Input id="na-email" value={f.email} onChange={set('email')} placeholder="name@example.com" /></Field>
          <Field label="Occupation" id="na-job"><Input id="na-job" value={f.job} onChange={set('job')} /></Field>
          <Field label="Mother tongue" id="na-mt"><Input id="na-mt" value={f.tongue} onChange={set('tongue')} placeholder="Telugu" /></Field>
          <Field label="Aadhaar (student)" id="na-aad" hint="Restricted. Only School Admin and Office see it."><Input id="na-aad" placeholder="XXXX XXXX XXXX" inputMode="numeric" /></Field>
        </div>
      </MoreDetails>
      <SubHead>Consent (DPDP Act 2023)</SubHead>
      <div className={cx('rounded-xl border p-3.5 flex flex-col gap-3', e('consent') ? 'border-bad ring-4 ring-bad/10' : 'border-line')}>
        <p className="text-[13.5px] text-ink2 leading-relaxed">The guardian agrees to the school’s consent text (version 2.1) for the child’s data. A one-time code goes to <b className="font-semibold text-ink tnum">+91 {f.phone || '…'}</b>.</p>
        {f.consent ? (
          <p className="text-[14px] font-semibold text-ok flex items-center gap-2"><I.ShieldCheck size={18} />Data consent given · version 2.1 · 9 Oct 2026, 10:44 AM</p>
        ) : !f.sent ? (
          <Button type="button" variant="soft" icon={I.Send} className="self-start" disabled={!!phoneErr(f.phone)} onClick={() => { set('sent')(true); toast({ title: 'Code sent', body: `To +91 ${f.phone} by SMS. Valid 10 minutes.`, tone: 'info' }); }}>Send one-time code</Button>
        ) : (
          <div className="flex gap-2 items-end">
            <Field label="Code from the guardian" id="na-otp" className="flex-1"><Input id="na-otp" value={f.otp} onChange={(x) => set('otp')(x.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" placeholder="6 digits" className="tnum tracking-widest" /></Field>
            <Button type="button" variant="primary" disabled={f.otp.length !== 6} onClick={() => set('consent')(true)}>Confirm</Button>
          </div>
        )}
        <label className="flex items-start gap-3 text-[13.5px]">
          <Checkbox checked={f.photo} onChange={set('photo')} label="Photo consent" />
          <span><b className="font-semibold">Photo consent</b> <span className="text-ink3">(separate): the child’s photo may be used in the gallery and on social media. Confirmed with the same code.</span></span>
        </label>
        {e('consent') && <p className="text-[12.5px] text-bad flex items-center gap-1.5"><I.CircleAlert size={14} />{err.consent}</p>}
      </div>
      {tch && blocking.length > 0 && <p className="text-[13px] text-bad">Fix {blocking.length} {blocking.length === 1 ? 'thing' : 'things'} above to save.</p>}
    </FormSheet>
  );
}

/* ======================= Applications ======================= */
function Applications({ params }) {
  return params?.id ? <ApplicationDetail id={params.id} /> : <ApplicationList />;
}

function ApplicationList() {
  const { go } = useNav();
  const canEdit = useCanEdit();
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('all');
  const [year, setYear] = useState('all');
  const [cls, setCls] = useState('all');
  const [docs, setDocs] = useState('all');
  const [fee, setFee] = useState('all');
  const [add, setAdd] = useState(false);
  const [link, setLink] = useState(false);
  const t = q.trim().toLowerCase();
  const rows = APPS.filter((a) => (stage === 'all' || a.stage === stage) && (year === 'all' || a.year === year) && (cls === 'all' || a.cls === cls) &&
    (docs === 'all' || (docs === 'done' ? verified(a) === a.docs.length : verified(a) < a.docs.length)) && (fee === 'all' || feeWord(a) === fee) &&
    (!t || a.child.toLowerCase().includes(t) || a.id.toLowerCase().includes(t) || a.phone.replace(' ', '').includes(t.replace(/\s/g, ''))));
  const cnt = (s) => APPS.filter((a) => a.stage === s).length;
  const open = (a) => go('admissions', { page: 'applications', id: a.id });
  return (
    <div>
      <ModuleHead sub="Admission forms filled at the counter or online, with previous school, marks and application fee"
        actions={<>
          <Button variant="secondary" icon={I.Link} onClick={() => setLink(true)}>Online application</Button>
          <Button variant="primary" icon={I.FilePlus2} onClick={() => setAdd(true)}>New application</Button>
        </>} />
      <div className="flex flex-col gap-4">
        <Stats items={[
          { label: 'Applications this year', value: '96', sub: '2027–28 and mid-year', icon: 'FileText' },
          { label: 'Waiting for a decision', value: String(cnt('Decision')), sub: 'Oldest 14 Sep', tone: 'warn', icon: 'Hourglass', onClick: () => go('admissions', { page: 'decision' }) },
          { label: 'Papers missing', value: String(APPS.filter((a) => verified(a) < a.docs.length && a.stage !== 'Withdrawn').length), sub: 'Not yet verified', icon: 'FileWarning', onClick: () => setDocs('missing') },
          { label: 'Application fee not paid', value: String(APPS.filter((a) => a.fee === 'Not paid').length), sub: 'Razorpay link sent', tone: 'bad', icon: 'IndianRupee', onClick: () => setFee('No') },
        ]} />
        <Chips value={stage} onChange={setStage} options={[{ value: 'all', label: 'All stages', count: APPS.length }, ...STAGES.filter((s) => cnt(s)).map((s) => ({ value: s, label: s, count: cnt(s) }))]} />
        <Card className="overflow-hidden">
          <Toolbar>
            <SearchBox id="app-search" value={q} onChange={setQ} placeholder="Child, application number or phone" />
            <Segmented value={year} onChange={setYear} options={[{ value: 'all', label: 'All' }, { value: '2027–28', label: '2027–28' }, { value: '2026–27', label: 'Mid-year' }]} />
            <div className="grid grid-cols-3 @md:flex gap-2">
              <Select id="app-cls" value={cls} onChange={setCls} options={[{ value: 'all', label: 'Class' }, ...CLASS_NAMES]} className="@md:w-32" />
              <Select id="app-docs" value={docs} onChange={setDocs} options={[{ value: 'all', label: 'Papers' }, { value: 'done', label: 'Complete' }, { value: 'missing', label: 'Missing' }]} className="@md:w-32" />
              <Select id="app-fee" value={fee} onChange={setFee} options={[{ value: 'all', label: 'Fee' }, { value: 'Yes', label: 'Fee paid' }, { value: 'No', label: 'Not paid' }, { value: 'Not needed', label: 'Not needed' }]} className="@md:w-32" />
            </div>
            <ExportButton what={`${rows.length} applications`} />
          </Toolbar>
          <DataList rows={rows} onRow={open} minWidth={1000}
            empty={<Empty icon={I.SearchX} title="No applications match" body="Try another stage, class or fee filter." action={<Button variant="secondary" onClick={() => { setQ(''); setStage('all'); setYear('all'); setCls('all'); setDocs('all'); setFee('all'); }}>Clear filters</Button>} />}
            columns={[
              { key: 'id', label: 'Application', render: (a) => <div className="flex items-center gap-3"><Avatar name={a.child} size={34} /><div className="min-w-0"><p className="font-semibold leading-tight">{a.child}</p><p className="text-[12px] text-ink3 font-mono">{a.id}</p></div></div> },
              { key: 'cls', label: 'Class', nowrap: true, render: (a) => <><p className="font-medium">{a.cls}</p><p className="text-[12px] text-ink3">{yl(a.year)}</p></> },
              { key: 'phone', label: 'Parent’s phone', nowrap: true, render: (a) => <span className="tnum text-[13.5px]">{a.phone}</span> },
              { key: 'stage', label: 'Stage', render: (a) => <Pill tone={STAGE_TONE[a.stage]}>{a.stage}</Pill> },
              { key: 'docs', label: 'Documents', render: (a) => <DocPill a={a} /> },
              { key: 'test', label: 'Test or interview', render: (a) => <span className="text-[13px] whitespace-nowrap">{a.test ? (a.test.score != null ? `Test ${a.test.score}/${a.test.max}` : `Test ${a.test.when}`) : a.interview ? (a.interview.outcome ? `Interview: ${a.interview.outcome}` : `Interview ${a.interview.when}`) : '—'}</span> },
              { key: 'fee', label: 'Fee paid', render: (a) => <Pill tone={a.fee === 'Paid' ? 'ok' : a.fee === 'Not paid' ? 'bad' : 'neutral'}>{feeWord(a)}</Pill> },
              { key: 'sub', label: 'Submitted', nowrap: true, render: (a) => <span className="text-[13px] tnum">{a.submitted.replace(' 2026', '')}</span> },
            ]}
            mobile={(a) => ({ title: a.child, sub: `${a.id} · ${a.cls} · ${a.submitted.replace(' 2026', '')}`, avatar: a.child,
              pills: [<Pill key="s" tone={STAGE_TONE[a.stage]} className="!h-[22px] !text-[11.5px]">{a.stage}</Pill>, <Pill key="d" tone={verified(a) === a.docs.length ? 'ok' : 'warn'} className="!h-[22px] !text-[11.5px]">Papers {verified(a)}/{a.docs.length}</Pill>, a.fee === 'Not paid' && <Pill key="f" tone="bad" className="!h-[22px] !text-[11.5px]">Fee not paid</Pill>] })} />
        </Card>
      </div>
      <NewApplicationSheet open={add} onClose={() => setAdd(false)} />
      <OnlineLinkSheet open={link} onClose={() => setLink(false)} canEdit={canEdit} />
    </div>
  );
}

function OnlineLinkSheet({ open, onClose, canEdit }) {
  const toast = useToast();
  const [cls, setCls] = useState('all');
  const url = `apply.schoolos.in/sps-hyd-001/2027-28${cls === 'all' ? '' : '/' + cls.toLowerCase().replace(' ', '-')}`;
  return (
    <Sheet open={open} onClose={onClose} title="Online application" sub="Parents fill the form on their phone, without a login. It arrives here as “Submitted online”.">
      <div className="flex flex-col gap-4">
        <Field label="Link for" id="ol-cls"><Select id="ol-cls" value={cls} onChange={setCls} options={[{ value: 'all', label: 'All classes (Nursery to Class 9)' }, ...CLASS_NAMES]} /></Field>
        <div className="flex items-center gap-2 rounded-xl bg-sunken pl-3.5 pr-1.5 py-1.5">
          <I.Link size={16} className="text-ink3 shrink-0" />
          <span className="font-mono text-[12.5px] truncate flex-1">{url}</span>
          <Button size="sm" variant="secondary" icon={I.Copy} onClick={() => toast({ title: 'Link copied', body: url })}>Copy</Button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[['MessageCircle', 'WhatsApp'], ['Smartphone', 'SMS'], ['Mail', 'Email']].map(([ic, l]) => (
            <Button key={l} variant="secondary" icon={I[ic]} disabled={!canEdit} onClick={() => toast({ title: `Share by ${l}`, body: 'Opens Send Message with the link and the “Apply online” template.', tone: 'info' })}>{l}</Button>
          ))}
        </div>
        <ul className="text-[13px] text-ink3 flex flex-col gap-1.5">
          <li className="flex gap-2"><I.ShieldCheck size={15} className="shrink-0 mt-0.5" />Consent is confirmed with a one-time code to the parent’s phone.</li>
          <li className="flex gap-2"><I.IndianRupee size={15} className="shrink-0 mt-0.5" />The application fee is paid by Razorpay at the end of the form.</li>
        </ul>
      </div>
    </Sheet>
  );
}

function ApplicationDetail({ id }) {
  const { go } = useNav();
  const { role } = useRole();
  const toast = useToast();
  const canEdit = useCanEdit();
  const base = APPS.find((a) => a.id === id) || APPS[0];
  const [a, setA] = useState(base);
  const [review, setReview] = useState(false);
  const [withdraw, setWithdraw] = useState(false);
  const [pay, setPay] = useState(false);
  const docs = docsFor(a.cls);
  const n = verified(a);
  const done = ['Admitted', 'Withdrawn'].includes(a.stage);
  const moveTo = (s, page) => { const prev = a; setA({ ...a, stage: s }); toast({ title: `${a.child} moved to ${s}`, body: 'Logged in the application history.', undo: () => setA(prev) }); };
  const timeline = [
    ...(a.stage === 'Admitted' ? [{ what: `Admitted as ${a.admNo}. Parent Link sent to ${a.mother}.`, when: '2 Oct 2026, 11:20 AM · Divya Menon', icon: 'BadgeCheck', tone: 'ok' }] : []),
    ...(a.approved ? [{ what: `Approved by ${a.approved.split(',')[0]}. Offer letter ${a.offer ? 'sent on WhatsApp' : 'ready'}.`, when: `${a.approved.split(', ')[1]} 2026`, icon: 'CircleCheck', tone: 'ok' }] : []),
    ...(a.withPrincipal ? [{ what: `Sent to Lakshmi Rao for approval. ${a.withPrincipal}.`, when: '8 Oct 2026, 4:10 PM', icon: 'Send', tone: 'info' }] : []),
    ...(a.admFee?.status === 'Paid' ? [{ what: `Admission fee ₹25,000 paid by ${a.admFee.how}. Receipt ${a.admFee.rcpt}.`, when: `${a.admFee.when} 2026`, icon: 'IndianRupee', tone: 'ok' }] : []),
    ...(a.test?.score != null ? [{ what: `Entrance test: ${a.test.score} of ${a.test.max}.`, when: `${a.test.when} 2026`, icon: 'ClipboardCheck', tone: 'brand' }] : []),
    ...(a.interview?.outcome ? [{ what: `Interview with Lakshmi Rao: ${a.interview.outcome}.`, when: `${a.interview.when} 2026`, icon: 'Users', tone: 'brand' }] : []),
    { what: `${n} of ${docs.length} papers verified.`, when: '8 Oct 2026', icon: 'FileCheck', tone: n === docs.length ? 'ok' : 'warn' },
    { what: `Application ${a.id} made${a.stage === 'Submitted online' ? ' online by the parent' : ' at the counter'}. Data consent given with a one-time code.`, when: a.submitted, icon: 'FileText' },
  ];
  return (
    <div>
      <BackLink onClick={() => go('admissions', { page: 'applications' })} label="Applications" sub={a.id} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Card className="p-4 @md:p-5 flex flex-col @lg:flex-row @lg:items-center gap-4">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <Avatar name={a.child} size={60} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap"><h1 className="font-display text-[23px] @md:text-[26px] font-semibold tracking-tight leading-tight">{a.child}</h1><Pill tone={STAGE_TONE[a.stage]} dot>{a.stage}</Pill></div>
              <p className="text-[13.5px] text-ink3 mt-0.5">{a.cls} · {yl(a.year)} · <span className="font-mono text-[12.5px]">{a.id}</span> · Owner {a.owner}</p>
            </div>
          </div>
          {canEdit && !done && (
            <div className="flex gap-2 flex-wrap">
              {a.stage === 'Decision' || a.stage === 'Approved' ? <Button variant="primary" icon={I.Gavel} onClick={() => go('admissions', { page: 'decision' })}>Open in Admission Decision</Button>
                : <Button variant="primary" icon={I.CircleCheck} onClick={() => setReview(true)}>Review</Button>}
              {a.fee === 'Not paid' && <Button variant="secondary" icon={I.IndianRupee} onClick={() => setPay(true)}>Collect application fee</Button>}
              <MoreMenu items={[
                ['FolderOpen', 'Move to Documents', () => moveTo('Documents')],
                ['ClipboardCheck', 'Move to Test & Interview', () => moveTo('Test')],
                ['Hourglass', 'Move to Decision', () => moveTo('Decision')],
                ['Printer', 'Print application', () => toast({ title: 'Sent to the office printer', body: `${a.id} · 2 pages` })],
                ['Ban', 'Withdraw', () => setWithdraw(true), 'bad'],
              ]} />
            </div>
          )}
        </Card>
        {a.stage === 'Admitted' && <Banner tone="ok" title={`Admitted as ${a.admNo}.`} action={<Button size="sm" variant="secondary" onClick={() => go('students')}>Student list</Button>}>The student record, parents, fee plan and ID card were created on 2 Oct.</Banner>}
        {a.stage === 'Withdrawn' && <Banner tone="info" title="Withdrawn.">{a.withdrawn}. The application number is never reused.</Banner>}
        <Stats items={[
          { label: 'Papers verified', value: `${n} of ${docs.length}`, tone: n === docs.length ? 'ok' : 'warn', icon: 'FolderOpen', onClick: () => go('admissions', { page: 'documents' }) },
          { label: a.interview ? 'Interview' : 'Entrance test', value: a.test ? (a.test.score != null ? `${a.test.score} / ${a.test.max}` : 'Booked') : a.interview ? (a.interview.outcome || 'Booked') : 'Not needed', sub: a.test?.when || a.interview?.when, icon: 'ClipboardCheck' },
          { label: 'Application fee', value: a.fee === 'Paid' ? 'Paid' : a.fee === 'Not paid' ? 'Not paid' : 'Not needed', tone: a.fee === 'Not paid' ? 'bad' : a.fee === 'Paid' ? 'ok' : undefined, sub: a.fee === 'Not needed' ? 'Mid-year joining' : a.year, icon: 'IndianRupee' },
          { label: 'Seats left', value: String(seatTotal(a.year, a.cls)), sub: `${a.cls} · ${a.year}`, tone: seatTotal(a.year, a.cls) === 0 ? 'bad' : undefined, icon: 'School' },
        ]} />
        <Split>
          <Col>
            <Card>
              <CardHead title="Child" icon={I.User} />
              <DL rows={[['Full name', a.child], ['Date of birth', a.dob], ['Gender', a.gender], ['Class applied for', `${a.cls} · ${yl(a.year)}`], ['Home address', a.address], ['Sibling in this school', a.sibling || 'None found from the phone number'], ['Aadhaar (student)', <span key="x" className="tnum">{['principal', 'schooladmin'].includes(role.id) ? '5821 3394 4821' : 'XXXX XXXX 4821'} <span className="text-[12px] text-ink3">· restricted</span></span>]]} />
            </Card>
            <Card>
              <CardHead title="Parents" sub="Parent Link starts only after admission" icon={I.Users} />
              <div className="grid @sm:grid-cols-2 gap-3 px-5 pb-5">
                {[[a.father, 'Father'], [a.mother, 'Mother']].map(([nm, r]) => (
                  <div key={r} className="rounded-xl border border-line p-3.5 flex items-start gap-3">
                    <Avatar name={nm} size={40} />
                    <div className="min-w-0"><p className="font-semibold text-[14.5px] leading-tight">{nm}</p><p className="text-[12.5px] text-ink3">{r}</p>{r === 'Mother' || !a.mother ? <p className="text-[14px] tnum mt-1.5 select-all">+91 {a.phone}</p> : <p className="text-[12.5px] text-ink3 mt-1.5">No phone given</p>}</div>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <CardHead title="Previous school and preferences" icon={I.School} />
              <DL rows={[['Previous school', a.prev ? a.prev[0] : 'First school'], ['Last class', a.prev ? a.prev[1] : '—'], ['Marks or %', a.prev ? a.prev[2] : '—'], ['Second language', 'Telugu'], ['Transport', a.stop || 'Not needed'], ['Hostel', 'Not needed'], ...(a.note ? [['Note', a.note]] : [])]} />
            </Card>
            <Card>
              <CardHead title="Documents" sub={`${n} of ${docs.length} verified · list for ${a.cls}`} icon={I.FolderOpen} action={<Button size="sm" variant="soft" onClick={() => go('admissions', { page: 'documents' })}>Open</Button>} />
              <ul className="px-3 pb-3">
                {docs.map((d, i) => {
                  const c = a.docs[i];
                  const st = { V: ['Verified', 'ok'], R: ['Received', 'info'], N: ['Not received', 'warn'], X: ['Rejected', 'bad'] }[c];
                  return (
                    <li key={d} className="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-sunken/60">
                      <span className={cx('w-10 h-10 rounded-xl grid place-items-center shrink-0', c === 'V' ? 'bg-ok/10 text-ok' : c === 'X' ? 'bg-bad/10 text-bad' : c === 'N' ? 'bg-warn/12 text-warn' : 'bg-sunken text-ink2')}>{c === 'V' ? <I.FileCheck size={19} /> : c === 'N' ? <I.FileWarning size={19} /> : c === 'X' ? <I.FileX size={19} /> : <I.FileText size={19} />}</span>
                      <p className="font-semibold text-[14px] flex-1 min-w-0 truncate">{d}</p>
                      <Pill tone={st[1]}>{st[0]}</Pill>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </Col>
          <Col>
            <Card>
              <CardHead title="Fees" sub="Receipts are made only after the payment is confirmed" icon={I.IndianRupee} />
              <div className="px-5 pb-5 flex flex-col gap-3">
                <div className="rounded-xl border border-line p-3.5">
                  <div className="flex items-center justify-between gap-2"><p className="font-semibold text-[14px]">Application fee</p><Pill tone={a.fee === 'Paid' ? 'ok' : a.fee === 'Not paid' ? 'bad' : 'neutral'}>{a.fee}</Pill></div>
                  <p className="text-[12.5px] text-ink3 mt-1">{a.fee === 'Not needed' ? 'No application fee for mid-year joining.' : a.feeInfo}</p>
                  {a.fee === 'Not paid' && canEdit && <Button size="sm" variant="soft" icon={I.Send} className="mt-2.5" onClick={() => toast({ title: 'Razorpay link sent again', body: `₹750 to +91 ${a.phone} · WhatsApp, with SMS backup. Valid 7 days.` })}>Resend Razorpay link</Button>}
                </div>
                <div className="rounded-xl border border-line p-3.5">
                  <div className="flex items-center justify-between gap-2"><p className="font-semibold text-[14px]">Admission fee <span className="text-ink3 font-normal">· ₹25,000</span></p><Pill tone={a.admFee?.status === 'Paid' ? 'ok' : a.admFee ? 'warn' : 'neutral'}>{a.admFee?.status || 'After approval'}</Pill></div>
                  <p className="text-[12.5px] text-ink3 mt-1">{a.admFee?.status === 'Paid' ? `${a.admFee.how} · ${a.admFee.when} · ${a.admFee.rcpt}` : a.admFee?.link || 'Asked for once the Principal approves.'}</p>
                </div>
              </div>
            </Card>
            <Card>
              <CardHead title="Consent" sub="DPDP Act 2023" icon={I.ShieldCheck} />
              <ul className="px-5 pb-5 flex flex-col gap-2.5 text-[14px]">
                <li className="flex gap-3"><I.CircleCheck size={18} className="text-ok shrink-0 mt-0.5" /><span><b className="font-semibold">Data consent given</b><span className="block text-[12.5px] text-ink3">Version 2.1 · one-time code to +91 {a.phone} · {a.submitted}</span></span></li>
                <li className="flex gap-3">{a.id.endsWith('1') || a.id.endsWith('7') ? <I.CircleX size={18} className="text-ink3 shrink-0 mt-0.5" /> : <I.CircleCheck size={18} className="text-ok shrink-0 mt-0.5" />}<span><b className="font-semibold">Photo consent {a.id.endsWith('1') || a.id.endsWith('7') ? 'not given' : 'given'}</b><span className="block text-[12.5px] text-ink3">Separate consent · gallery and social media</span></span></li>
              </ul>
            </Card>
            <Card>
              <CardHead title="Timeline" sub="Newest first" icon={I.Clock} />
              <div className="px-5"><Timeline items={timeline} /></div>
            </Card>
          </Col>
        </Split>
      </div>

      {review && <ReviewSheet a={a} onClose={() => setReview(false)} onDone={(back) => { const prev = a; setA({ ...a, stage: back ? a.stage : 'Reviewed' }); toast(back ? { title: `Sent back to ${a.mother || a.father}`, body: 'WhatsApp message listing the missing details. Saved in the history.' } : { title: `${a.child} marked Reviewed`, undo: () => setA(prev) }); }} />}
      <ConfirmSheet open={withdraw} onClose={() => setWithdraw(false)} title={`Withdraw ${a.child}’s application?`} sub="The parent is no longer interested. The application stays on record and its number is never reused." confirmLabel="Withdraw application" danger
        onConfirm={() => { const prev = a; setA({ ...a, stage: 'Withdrawn', withdrawn: 'Parent no longer interested' }); toast({ title: `${a.id} withdrawn`, undo: () => setA(prev) }); }}>
        <Field label="Reason" required id="wd-r"><Select id="wd-r" value="Chose another school" onChange={() => {}} options={LOSS} /></Field>
      </ConfirmSheet>
      <Sheet open={pay} onClose={() => setPay(false)} title="Collect application fee" sub={`${a.child} · ${a.cls} · ₹750`}>
        <div className="flex flex-col gap-2.5">
          <button onClick={() => { setPay(false); toast({ title: 'Razorpay link sent', body: `₹750 to +91 ${a.phone}. The receipt is made only after Razorpay confirms the payment.` }); }} className="flex items-center gap-3 rounded-xl border border-line p-3.5 text-left hover:bg-sunken/60">
            <span className="w-10 h-10 rounded-xl bg-brand/10 text-brand grid place-items-center"><I.Send size={18} /></span>
            <span className="flex-1"><b className="font-semibold text-[14px] block">Send a Razorpay payment link</b><span className="text-[12.5px] text-ink3">UPI, card or net banking · valid 7 days</span></span><I.ChevronRight size={18} className="text-ink3" />
          </button>
          <button onClick={() => { setPay(false); role.access.fees === 'full' ? go('fees', { page: 'collect' }) : toast({ title: 'Ask the accounts counter', body: 'Suresh Babu collects counter payments in Fee Management.', tone: 'info' }); }} className="flex items-center gap-3 rounded-xl border border-line p-3.5 text-left hover:bg-sunken/60">
            <span className="w-10 h-10 rounded-xl bg-sunken grid place-items-center"><I.Banknote size={18} /></span>
            <span className="flex-1"><b className="font-semibold text-[14px] block">Collect at the counter</b><span className="text-[12.5px] text-ink3">Opens Collect Fee with the application fee head</span></span><I.ChevronRight size={18} className="text-ink3" />
          </button>
        </div>
      </Sheet>
    </div>
  );
}

function ReviewSheet({ a, onClose, onDone }) {
  const [mode, setMode] = useState('ok');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  return (
    <FormSheet open onClose={onClose} title="Review application" sub={`${a.child} · ${a.id}`} submitLabel={mode === 'ok' ? 'Mark reviewed' : `Send to ${a.mother || a.father}`}
      onSubmit={() => { if (mode === 'back' && !note.trim()) { setErr('Say what is missing, the parent sees this'); return false; } onDone(mode === 'back'); }}>
      <Segmented value={mode} onChange={setMode} options={[{ value: 'ok', label: 'Looks right' }, { value: 'back', label: 'Send back for details' }]} className="w-full" />
      <Field label={mode === 'ok' ? 'Note (staff only)' : 'What is missing'} required={mode === 'back'} id="rv-note" error={err}>
        <Textarea id="rv-note" value={note} onChange={(v) => { setNote(v); setErr(''); }} placeholder={mode === 'ok' ? 'Optional' : 'For example: previous school marks for Class 5'} />
      </Field>
    </FormSheet>
  );
}

/* ======================= Documents & Verification ======================= */
const docInit = (a) => docsFor(a.cls).map((name, i) => {
  const c = a.docs[i];
  return { name, req: true, status: { V: 'Verified', R: 'Received', N: 'Not received', X: 'Rejected' }[c], by: c === 'V' ? (i % 2 ? 'Naveen Kumar' : 'Divya Menon') : null, when: c === 'V' ? `${6 + (i % 3)} Oct, ${['11:20 AM', '3:12 PM', '10:05 AM'][i % 3]}` : c === 'R' ? '9 Oct, 9:40 AM' : null, original: c === 'V' && i !== 3, reason: c === 'X' ? 'Photo not clear' : null, file: c !== 'N' ? `${name.toLowerCase().replace(/[^a-z]+/g, '-')}.pdf · ${180 + i * 47} KB` : null };
});
function Documents() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const list = APPS.filter((a) => !['Withdrawn', 'Admitted'].includes(a.stage));
  const [state, setState] = useState(() => Object.fromEntries(list.map((a) => [a.id, docInit(a)])));
  const [sel, setSel] = useState(null);
  const [f, setF] = useState('all');
  const [q, setQ] = useState('');
  const [up, setUp] = useState(null);
  const [rej, setRej] = useState(null);
  const [remind, setRemind] = useState(false);
  const [view, setView] = useState(null);
  const vcount = (id) => state[id].filter((d) => d.status === 'Verified').length;
  const missing = (id) => state[id].filter((d) => d.status === 'Not received' || d.status === 'Rejected');
  const toVerify = (id) => state[id].filter((d) => d.status === 'Received').length;
  const t = q.trim().toLowerCase();
  const rows = list.filter((a) => (f === 'all' || (f === 'missing' ? missing(a.id).length : f === 'verify' ? toVerify(a.id) : vcount(a.id) === state[a.id].length)) && (!t || a.child.toLowerCase().includes(t) || a.id.toLowerCase().includes(t)));
  const cur = list.find((a) => a.id === sel);
  const patch = (id, name, p) => setState((s) => ({ ...s, [id]: s[id].map((d) => (d.name === name ? { ...d, ...p } : d)) }));
  const me = useRole().role.person.name;
  return (
    <div>
      <ModuleHead sub="Birth certificate, TC, marksheets and other papers, checked against the list for each class" />
      <div className={cx('grid gap-5 @lg:gap-6 items-start @xl:grid-cols-[minmax(0,1fr)_440px]')}>
        <div className={cx('min-w-0 flex-col gap-4', cur ? 'hidden @xl:flex' : 'flex')}>
          <Chips value={f} onChange={setF} options={[
            { value: 'all', label: 'All applicants', count: list.length }, { value: 'missing', label: 'Papers missing', count: list.filter((a) => missing(a.id).length).length },
            { value: 'verify', label: 'To verify', count: list.filter((a) => toVerify(a.id)).length }, { value: 'done', label: 'All verified', count: list.filter((a) => vcount(a.id) === state[a.id].length).length },
          ]} />
          <Card className="overflow-hidden">
            <Toolbar><SearchBox id="doc-search" value={q} onChange={setQ} placeholder="Applicant name or application number" /><ExportButton what="document status" /></Toolbar>
            <DataList rows={rows} onRow={(a) => setSel(a.id)} minWidth={560} footer={`Showing ${rows.length} of ${list.length} applicants`}
              columns={[
                { key: 'c', label: 'Applicant', render: (a) => <div className={cx('flex items-center gap-3', sel === a.id && 'text-brand')}><Avatar name={a.child} size={34} /><div className="min-w-0"><p className="font-semibold leading-tight">{a.child}</p><p className="text-[12px] text-ink3 whitespace-nowrap">{a.cls} · <span className="font-mono">{a.id}</span></p></div></div> },
                { key: 'p', label: 'Verified', render: (a) => { const n = vcount(a.id), tt = state[a.id].length; return <span className="flex items-center gap-2 w-32"><Progress value={(n / tt) * 100} tone={n === tt ? 'ok' : 'warn'} className="flex-1" /><span className="text-[12.5px] font-semibold tnum">{n} of {tt}</span></span>; } },
                { key: 'm', label: 'Missing papers', render: (a) => { const m = missing(a.id); return m.length ? <span className="text-[13px] text-warn">{m.map((d) => d.name).join(', ')}</span> : toVerify(a.id) ? <span className="text-[13px] text-info">{toVerify(a.id)} to verify</span> : <span className="text-[13px] text-ok">None</span>; } },
              ]}
              mobile={(a) => { const n = vcount(a.id), tt = state[a.id].length, m = missing(a.id); return { title: a.child, sub: `${a.cls} · ${n} of ${tt} verified`, avatar: a.child, pills: [m.length ? <Pill key="m" tone="warn" className="!h-[22px] !text-[11.5px]">{m.length} missing</Pill> : n === tt ? <Pill key="ok" tone="ok" className="!h-[22px] !text-[11.5px]">All verified</Pill> : <Pill key="v" tone="info" className="!h-[22px] !text-[11.5px]">{tt - n} to verify</Pill>] }; }} />
          </Card>
        </div>
        {cur ? (
          <Card className="min-w-0 animate-rise" key={cur.id}>
            <div className="flex items-center justify-between px-3 pt-2.5">
              <button onClick={() => setSel(null)} className="@xl:invisible inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink h-8 px-1 rounded-lg"><I.ArrowLeft size={17} />All applicants</button>
              <IconButton icon={I.X} label="Close" size={36} onClick={() => setSel(null)} className="hidden @xl:inline-flex" />
            </div>
            <div className="px-5 pb-4 flex items-center gap-3.5">
              <Avatar name={cur.child} size={46} />
              <div className="min-w-0 flex-1">
                <h2 className="font-display font-semibold text-[19px] leading-tight">{cur.child}</h2>
                <p className="text-[13px] text-ink3">{cur.cls} · {yl(cur.year)} · <span className="font-mono text-[12px]">{cur.id}</span></p>
              </div>
            </div>
            <div className="px-5 pb-4">
              <div className="flex items-center justify-between text-[13px] mb-1.5"><span className="font-semibold">{vcount(cur.id)} of {state[cur.id].length} verified</span><span className="text-ink3">List for {cur.cls}</span></div>
              <Progress value={(vcount(cur.id) / state[cur.id].length) * 100} tone={vcount(cur.id) === state[cur.id].length ? 'ok' : 'warn'} />
            </div>
            {canEdit && missing(cur.id).length > 0 && (
              <div className="px-5 pb-4"><Button variant="soft" icon={I.Send} className="w-full" onClick={() => setRemind(true)}>Remind parent about {missing(cur.id).length} {missing(cur.id).length === 1 ? 'paper' : 'papers'}</Button></div>
            )}
            <ul className="border-t border-line/70 divide-y divide-line/70">
              {state[cur.id].map((d) => {
                const tone = { Verified: 'ok', Received: 'info', 'Not received': 'warn', Rejected: 'bad' }[d.status];
                return (
                  <li key={d.name} className="px-5 py-3.5 flex items-start gap-3">
                    <span className={cx('w-10 h-10 rounded-xl grid place-items-center shrink-0', { ok: 'bg-ok/10 text-ok', info: 'bg-info/10 text-info', warn: 'bg-warn/12 text-warn', bad: 'bg-bad/10 text-bad' }[tone])}>
                      {d.status === 'Verified' ? <I.FileCheck size={19} /> : d.status === 'Rejected' ? <I.FileX size={19} /> : d.status === 'Received' ? <I.FileClock size={19} /> : <I.FileWarning size={19} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2"><p className="font-semibold text-[14px] leading-snug">{d.name} <span className="text-[12px] text-ink3 font-normal">· Required</span></p><Pill tone={tone} className="!h-[22px] !text-[11.5px] shrink-0">{d.status}</Pill></div>
                      <p className="text-[12.5px] text-ink3 mt-0.5">
                        {d.status === 'Verified' ? `By ${d.by}, ${d.when}${d.original ? ' · original seen at counter' : ''}` : d.status === 'Received' ? `${d.file} · uploaded ${d.when}` : d.status === 'Rejected' ? <span className="text-bad">Rejected: {d.reason}. A new copy is needed.</span> : 'Not collected yet'}
                      </p>
                      {canEdit && (
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          {d.file && <Button size="sm" variant="ghost" icon={I.Eye} onClick={() => setView({ a: cur, d })}>View</Button>}
                          {d.status === 'Received' && <Button size="sm" variant="soft" icon={I.Check} onClick={() => { patch(cur.id, d.name, { status: 'Verified', by: me, when: '9 Oct, 10:44 AM' }); toast({ title: `${d.name} verified`, body: `By ${me} at 10:44 AM`, undo: () => patch(cur.id, d.name, { status: 'Received' }) }); }}>Verify</Button>}
                          {d.status === 'Received' && <Button size="sm" variant="ghost" icon={I.X} onClick={() => setRej({ a: cur, d })}>Reject</Button>}
                          {(d.status === 'Not received' || d.status === 'Rejected') && <Button size="sm" variant="secondary" icon={I.Upload} onClick={() => setUp({ a: cur, type: d.name })}>Upload</Button>}
                          {d.status === 'Verified' && !d.original && <Button size="sm" variant="ghost" icon={I.Stamp} onClick={() => { patch(cur.id, d.name, { original: true }); toast({ title: 'Marked: original seen at counter', body: d.name }); }}>Original seen</Button>}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="px-5 py-4 border-t border-line/70">
              <p className="eyebrow text-ink3 mb-2">Optional papers</p>
              <ul className="flex flex-col gap-2 text-[13.5px]">
                <li className="flex items-center gap-2.5"><I.FileText size={16} className="text-ink3" /><span className="flex-1">Aadhaar card (student)</span><span className="text-[12px] text-ink3">Restricted · received</span></li>
                <li className="flex items-center gap-2.5"><I.FileText size={16} className="text-ink3" /><span className="flex-1">Caste certificate</span><span className="text-[12px] text-ink3">Not needed</span></li>
              </ul>
            </div>
          </Card>
        ) : (
          <Card className="hidden @xl:block">
            <Empty icon={I.FolderOpen} title="Pick an applicant" body="Their checklist for the class applied for opens here, with Verify and Reject on each paper." />
          </Card>
        )}
      </div>

      {up && <UploadSheet a={up.a} type={up.type} docs={state[up.a.id]} onClose={() => setUp(null)} onSave={(type) => { patch(up.a.id, type, { status: 'Received', file: `${type.toLowerCase().replace(/[^a-z]+/g, '-')}.pdf · 386 KB`, when: '9 Oct, 10:44 AM', reason: null }); toast({ title: `${type} uploaded`, body: 'Status: Received. Verify it once you have checked it.' }); }} />}
      {rej && <RejectDocSheet d={rej.d} a={rej.a} onClose={() => setRej(null)} onSave={(r, msg) => { patch(rej.a.id, rej.d.name, { status: 'Rejected', reason: r }); toast({ title: `${rej.d.name} rejected`, body: msg ? `${rej.a.mother || rej.a.father} was told on WhatsApp: ${r}.` : `Reason: ${r}` }); }} />}
      {cur && <ConfirmSheet open={remind} onClose={() => setRemind(false)} title={`Remind ${cur.mother || cur.father}`} sub={`WhatsApp to +91 ${cur.phone}, with SMS backup`} confirmLabel={`Send to ${cur.mother || cur.father}`}
        onConfirm={() => toast({ title: 'Reminder sent', body: `${missing(cur.id).length} papers listed for ${cur.child}.` })}>
        <div className="rounded-xl bg-sunken p-3.5 text-[14px] leading-relaxed text-ink2">Dear parent, for {cur.child}’s admission to {cur.cls} we still need: <b className="text-ink">{missing(cur.id).map((d) => d.name + (d.status === 'Rejected' ? ` (new copy: ${d.reason.toLowerCase()})` : '')).join(', ')}</b>. You can bring them to the office or send a clear photo here.</div>
      </ConfirmSheet>}
      <Sheet open={!!view} onClose={() => setView(null)} title={view?.d.name} sub={view ? `${view.a.child} · ${view.d.file}` : ''} wide>
        {view && (
          <div className="flex flex-col gap-3">
            <div className="rounded-xl bg-sunken aspect-[4/3] grid place-items-center">
              <div className="w-[62%] aspect-[3/4] bg-surface rounded-lg border border-line p-5 flex flex-col gap-2.5">
                <div className="h-3 w-1/2 rounded bg-ink3/30 mx-auto" /><div className="h-2 w-3/4 rounded bg-line mx-auto" />
                {Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-2 rounded bg-line" style={{ width: `${90 - (i % 3) * 18}%` }} />)}
                <div className="mt-auto flex justify-between items-end"><div className="h-8 w-8 rounded-full border-2 border-ink3/40" /><div className="h-2 w-16 rounded bg-ink3/30" /></div>
              </div>
            </div>
            <p className="text-[12.5px] text-ink3">Preview in the browser. PDF, JPG or PNG, up to 5 MB each.</p>
          </div>
        )}
      </Sheet>
    </div>
  );
}
function UploadSheet({ a, type, docs, onClose, onSave }) {
  const [t, setT] = useState(type);
  const [file, setFile] = useState(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  return (
    <FormSheet open onClose={onClose} title="Upload document" sub={`${a.child} · ${a.cls}`} submitLabel="Upload" busyLabel="Uploading…" onSubmit={() => { if (!file) { setErr('Take a photo or choose a file'); return false; } onSave(t); }}>
      <Field label="Document type" required id="up-type"><Select id="up-type" value={t} onChange={setT} options={docs.filter((d) => d.status !== 'Verified').map((d) => d.name)} /></Field>
      <Field label="File" required id="up-file" error={err} hint="PDF, JPG or PNG, up to 5 MB">
        {file ? (
          <div className="flex items-center gap-3 rounded-xl border border-line p-3"><I.FileText size={20} className="text-ink3" /><span className="flex-1 text-[14px] font-semibold truncate">{file}</span><Button type="button" size="sm" variant="ghost" onClick={() => setFile(null)}>Change</Button></div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" icon={I.Camera} onClick={() => { setFile('IMG_20261009_1044.jpg · 1.2 MB'); setErr(''); }}>Take photo</Button>
            <Button type="button" variant="secondary" icon={I.Upload} onClick={() => { setFile(`${t.toLowerCase().replace(/[^a-z]+/g, '-')}.pdf · 386 KB`); setErr(''); }}>Choose file</Button>
          </div>
        )}
      </Field>
      <Field label="Note" id="up-note"><Input id="up-note" value={note} onChange={(x) => setNote(x.target.value)} placeholder="Optional" /></Field>
    </FormSheet>
  );
}
function RejectDocSheet({ a, d, onClose, onSave }) {
  const [r, setR] = useState('');
  const [msg, setMsg] = useState(true);
  const [err, setErr] = useState('');
  return (
    <FormSheet open onClose={onClose} title={`Reject ${d.name}`} sub={`${a.child}. A new copy will be needed.`} submitLabel="Reject paper" onSubmit={() => { if (!r.trim()) { setErr('Give a reason, like “Photo not clear”'); return false; } onSave(r.trim(), msg); }}>
      <div className="flex flex-wrap gap-2">{['Photo not clear', 'Wrong document', 'Name does not match', 'Page missing'].map((x) => <button type="button" key={x} onClick={() => { setR(x); setErr(''); }} className={cx('h-8 px-3 rounded-full text-[13px] font-medium', r === x ? 'bg-ink text-bg' : 'bg-sunken hover:bg-line')}>{x}</button>)}</div>
      <Field label="Reason" required id="rj-r" error={err}><Input id="rj-r" value={r} onChange={(x) => { setR(x.target.value); setErr(''); }} error={err} /></Field>
      <label className="flex items-center gap-3 text-[14px]"><Switch on={msg} onChange={setMsg} label="Message the parent" /><span><b className="font-semibold">Message the parent</b><span className="block text-[12.5px] text-ink3">WhatsApp with the reason</span></span></label>
    </FormSheet>
  );
}

/* ======================= Test & Interview ======================= */
const NAMES_T2 = ['Vivaan Agarwal', 'Reyansh Naidu', 'Ishaan Verma', 'Saanvi Bhat', 'Kiran Yadav', 'Laya Reddy', 'Aarush Jain', 'Tanya Goud', 'Advaith Rao', 'Siri Chowdary', 'Mahi Patel', 'Yuvan Kumar', 'Prisha Shetty', 'Rudra Das', 'Anika Menon', 'Shaurya Singh', 'Hamsini Varma', 'Vedant Iyer'];
const TESTS = [
  { id: 'TST-07', date: 'Sat 10 Oct 2026', time: '9:30 AM', venue: 'Room 12, Main block', cls: 'Classes 3–8', year: '2026–27', max: 50, list: [['Arnav Gupta', 'Class 4'], ['Zoya Fatima', 'Class 3'], ['Riya Kapoor', 'Class 6'], ['Mohit Sinha', 'Class 8']].map(([n, c]) => ({ n, c, s: '' })) },
  { id: 'TST-08', date: 'Sat 31 Oct 2026', time: '9:30 AM', venue: 'Exam hall, Block B', cls: 'Classes 1–5', year: '2027–28', max: 50, list: NAMES_T2.map((n, i) => ({ n, c: `Class ${1 + (i % 5)}`, s: '' })) },
  { id: 'TST-09', date: 'Sat 7 Nov 2026', time: '9:30 AM', venue: 'Exam hall, Block B', cls: 'Classes 6–9', year: '2027–28', max: 100, list: ['Sai Charan Goud', 'Nandini Rao', 'Aditya Varma', 'Fatima Begum', 'Rishi Reddy', 'Keerthi Naidu', 'Arya Menon', 'Dev Sharma', 'Harsha Chowdary'].map((n, i) => ({ n, c: `Class ${6 + (i % 4)}`, s: '' })) },
  { id: 'TST-06', date: 'Sat 26 Sep 2026', time: '10:00 AM', venue: 'Room 12, Main block', cls: 'Classes 1–7', year: 'Both', max: 50, list: [['Ananya Das', 'Class 5', 41], ['Arjun Mehta', 'Class 7', 36], ['Kavya Joshi', 'Class 2', 44], ['Aditya Kumar', 'Class 1', 44], ['Pooja Naidu', 'Class 4', 40], ['Rehan Ali', 'Class 3', 38], ['Zara Hussain', 'Class 2', 45]].map(([n, c, s]) => ({ n, c, s: String(s), r: s >= 40 ? 'Good reading and number work' : 'Needs support in English writing' })) },
];
const INTERVIEWS = [
  { id: 'INT-21', slot: 'Wed 14 Oct, 2:30 PM', who: 'Lakshmi Rao', app: 'Aanya Kulkarni', cls: 'Nursery', outcome: null },
  { id: 'INT-22', slot: 'Wed 14 Oct, 2:45 PM', who: 'Lakshmi Rao', app: 'Harini Varma', cls: 'UKG', outcome: null },
  { id: 'INT-23', slot: 'Wed 14 Oct, 3:00 PM', who: 'Srinivas Murthy', app: 'Advik Jain', cls: 'LKG', outcome: null },
  { id: 'INT-24', slot: 'Wed 14 Oct, 3:15 PM', who: 'Lakshmi Rao', app: 'Nithya Shetty', cls: 'LKG', outcome: null },
  { id: 'INT-19', slot: 'Mon 5 Oct, 3:00 PM', who: 'Lakshmi Rao', app: 'Meghana Rao', cls: 'LKG', outcome: 'Recommended', note: 'Confident, speaks Telugu and English. Sister in 5 A.' },
  { id: 'INT-20', slot: 'Mon 5 Oct, 3:15 PM', who: 'Srinivas Murthy', app: 'Nikhil Bose', cls: 'UKG', outcome: 'Hold', note: 'Parents to confirm transport. Call again after Dussehra.' },
  { id: 'INT-18', slot: 'Thu 1 Oct, 2:30 PM', who: 'Lakshmi Rao', app: 'Tara Menon', cls: 'Nursery', outcome: 'Not recommended', note: 'Under 3 years on 1 Jun 2027 (age rule). Apply again next year.' },
];
const OUT_TONE = { Recommended: 'ok', 'Not recommended': 'bad', Hold: 'warn' };
const SLOTS = ['2:30 PM', '2:45 PM', '3:00 PM', '3:15 PM', '3:30 PM', '3:45 PM', '4:00 PM', '4:15 PM'];

function Tests() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const [tab, setTab] = useState('tests');
  const [tests, setTests] = useState(TESTS);
  const [ints, setInts] = useState(INTERVIEWS);
  const [score, setScore] = useState(null);
  const [newTest, setNewTest] = useState(false);
  const [newInt, setNewInt] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const scored = (t) => t.list.filter((x) => x.s !== '').length;
  return (
    <div>
      <ModuleHead sub="Entrance test and interview dates, scores and remarks. Switched on in Admission Settings."
        actions={tab === 'tests' ? <Button variant="primary" icon={I.CalendarPlus} onClick={() => setNewTest(true)}>Schedule test</Button> : <Button variant="primary" icon={I.Plus} onClick={() => setNewInt(true)}>Schedule interview</Button>} />
      <div className="flex flex-col gap-4">
        <Stats items={[
          { label: 'Next test', value: 'Sat 10 Oct', sub: '4 mid-year applicants · 9:30 AM', icon: 'CalendarDays', tone: 'brand' },
          { label: 'Booked for tests', value: String(tests.reduce((a, t) => a + t.list.length - scored(t), 0)), sub: 'Scores still to enter', icon: 'ClipboardList' },
          { label: 'Interviews this week', value: String(ints.filter((i) => !i.outcome).length), sub: 'Wed 14 Oct, 2:30–3:30 PM', icon: 'Users' },
          { label: 'Recommended', value: String(ints.filter((i) => i.outcome === 'Recommended').length + 6), sub: 'Tests and interviews, 2027–28', icon: 'ThumbsUp', tone: 'ok' },
        ]} />
        <Tabs value={tab} onChange={setTab} tabs={[{ id: 'tests', label: 'Tests', count: tests.length }, { id: 'interviews', label: 'Interviews', count: ints.length }]} />
        {tab === 'tests' ? (
          <Card className="overflow-hidden">
            <CardHead title="Entrance tests" sub="Tap a test to enter scores and remarks" />
            <DataList rows={tests} onRow={(t) => setScore(t)} minWidth={720} footer={`${tests.length} tests · parents get the date, time and venue on WhatsApp`}
              columns={[
                { key: 'd', label: 'Date and time', render: (t) => <><p className="font-semibold">{t.date}</p><p className="text-[12.5px] text-ink3">{t.time}</p></> },
                { key: 'v', label: 'Venue', render: (t) => <span className="text-[13.5px]">{t.venue}</span> },
                { key: 'c', label: 'Class', render: (t) => <><p className="font-medium">{t.cls}</p><p className="text-[12px] text-ink3">{t.year === 'Both' ? '2027–28 and mid-year' : yl(t.year)} · out of {t.max}</p></> },
                { key: 'b', label: 'Booked', align: 'right', render: (t) => <span className="font-semibold">{t.list.length}</span> },
                { key: 's', label: 'Scores entered', render: (t) => <span className="flex items-center gap-2 w-36"><Progress value={(scored(t) / t.list.length) * 100} tone={scored(t) === t.list.length ? 'ok' : 'brand'} className="flex-1" /><span className="text-[12.5px] font-semibold tnum">{scored(t)} of {t.list.length}</span></span> },
              ]}
              mobile={(t) => ({ title: `${t.date} · ${t.time}`, sub: `${t.cls} · ${t.venue}`, icon: 'ClipboardCheck', iconTone: scored(t) === t.list.length ? 'ok' : 'brand', pills: [<Pill key="b" tone="neutral" className="!h-[22px] !text-[11.5px]">{t.list.length} booked</Pill>, <Pill key="s" tone={scored(t) === t.list.length ? 'ok' : 'warn'} className="!h-[22px] !text-[11.5px]">{scored(t)} scored</Pill>] })} />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <CardHead title="Interviews" sub="15-minute slots. An interviewer is never booked twice for the same time." />
            <DataList rows={ints} onRow={canEdit ? (i) => setOutcome(i) : undefined} minWidth={720}
              columns={[
                { key: 's', label: 'Slot', nowrap: true, render: (i) => <span className="font-semibold tnum">{i.slot}</span> },
                { key: 'a', label: 'Applicant', render: (i) => <div className="flex items-center gap-3"><Avatar name={i.app} size={32} /><div><p className="font-semibold leading-tight">{i.app}</p><p className="text-[12px] text-ink3">{i.cls} · 2027–28</p></div></div> },
                { key: 'w', label: 'Interviewer', render: (i) => <span className="text-[13.5px]">{i.who}</span> },
                { key: 'o', label: 'Outcome', render: (i) => i.outcome ? <div><Pill tone={OUT_TONE[i.outcome]}>{i.outcome}</Pill>{i.note && <p className="text-[12px] text-ink3 mt-1 max-w-[260px] truncate">{i.note}</p>}</div> : <Pill tone="neutral">Not yet</Pill> },
              ]}
              mobile={(i) => ({ title: i.app, sub: `${i.slot} · ${i.who}`, avatar: i.app, pills: [i.outcome ? <Pill key="o" tone={OUT_TONE[i.outcome]} className="!h-[22px] !text-[11.5px]">{i.outcome}</Pill> : <Pill key="n" tone="neutral" className="!h-[22px] !text-[11.5px]">Not yet</Pill>] })} />
          </Card>
        )}
      </div>

      {score && <ScoreSheet t={score} canEdit={canEdit} onClose={() => setScore(null)} onSave={(list) => { setTests((x) => x.map((t) => (t.id === score.id ? { ...t, list } : t))); toast({ title: `Scores saved for ${list.filter((x) => x.s !== '').length} applicants`, body: `${score.date} · they show on each application and in Admission Decision.` }); }} />}
      {newTest && <ScheduleTestSheet onClose={() => setNewTest(false)} onSave={(t) => { setTests((x) => [t, ...x]); toast({ title: `Test booked for ${t.list.length} applicants`, body: `${t.date}, ${t.time} · ${t.venue}. Parents got the details on WhatsApp.` }); }} />}
      {newInt && <ScheduleInterviewSheet ints={ints} onClose={() => setNewInt(false)} onSave={(i) => { setInts((x) => [i, ...x]); toast({ title: `Interview booked: ${i.app}`, body: `${i.slot} with ${i.who}. Parents got the details on WhatsApp.` }); }} />}
      {outcome && <OutcomeSheet i={outcome} onClose={() => setOutcome(null)} onSave={(o, note) => { setInts((x) => x.map((i) => (i.id === outcome.id ? { ...i, outcome: o, note } : i))); toast({ title: `${outcome.app}: ${o}`, body: 'Kept in the decision history.' }); }} />}
    </div>
  );
}
function ScoreSheet({ t, canEdit, onClose, onSave }) {
  const [list, setList] = useState(t.list.map((x) => ({ ...x })));
  const bad = list.some((x) => x.s !== '' && (isNaN(+x.s) || +x.s < 0 || +x.s > t.max));
  return (
    <Sheet open onClose={onClose} wide title={`Scores · ${t.date}`} sub={`${t.cls} · ${t.venue} · out of ${t.max}`}
      footer={canEdit ? <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={I.Check} disabled={bad} onClick={() => { onSave(list); onClose(); }}>Save scores</Button></> : null}>
      <ul className="flex flex-col divide-y divide-line/70">
        {list.map((x, i) => {
          const err = x.s !== '' && (isNaN(+x.s) || +x.s < 0 || +x.s > t.max);
          return (
            <li key={x.n} className="py-2.5 grid grid-cols-[1fr_84px] @md:grid-cols-[1fr_96px_1fr] gap-x-3 gap-y-2 items-center">
              <div className="min-w-0 flex items-center gap-2.5"><Avatar name={x.n} size={32} /><div className="min-w-0"><p className="font-semibold text-[14px] truncate">{x.n}</p><p className="text-[12px] text-ink3">{x.c}</p></div></div>
              <div><Input id={`sc-${i}`} aria-label={`Score for ${x.n}`} value={x.s} disabled={!canEdit} onChange={(e) => setList((l) => l.map((y, j) => (j === i ? { ...y, s: e.target.value.replace(/[^\d]/g, '').slice(0, 3) } : y)))} error={err} className="!h-10 text-center tnum" placeholder={`/ ${t.max}`} />{err && <p className="text-[11.5px] text-bad mt-1">0 to {t.max}</p>}</div>
              <Input id={`rm-${i}`} aria-label={`Remarks for ${x.n}`} value={x.r || ''} disabled={!canEdit} onChange={(e) => setList((l) => l.map((y, j) => (j === i ? { ...y, r: e.target.value } : y)))} className="!h-10 col-span-2 @md:col-span-1 text-[14px]" placeholder="Remarks" />
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
function ScheduleTestSheet({ onClose, onSave }) {
  const waiting = [['Arnav Gupta', 'Class 4'], ['Ishaan Verma', 'Class 3'], ['Sneha Menon', 'Class 2'], ['Vihaan Reddy', 'Class 1'], ['Harsha Chowdary', 'Class 9'], ['Diya Patel', 'UKG']];
  const [pick, setPick] = useState(new Set(['Ishaan Verma', 'Sneha Menon', 'Vihaan Reddy']));
  const [d, setD] = useState('31-10-2026');
  const [tm, setTm] = useState('9:30 AM');
  const [venue, setVenue] = useState('Exam hall, Block B');
  const [max, setMax] = useState('100');
  const [err, setErr] = useState('');
  return (
    <FormSheet open onClose={onClose} title="Schedule test" sub="Parents get a message with the date, time and venue" submitLabel={`Book ${pick.size} applicants`}
      onSubmit={() => { if (!pick.size) { setErr('Pick at least one applicant'); return false; } onSave({ id: 'TST-10', date: 'Sat 31 Oct 2026', time: tm, venue: venue || 'To be told', cls: 'Mixed classes', year: '2027–28', max: +max || 100, list: [...pick].map((n) => ({ n, c: waiting.find((w) => w[0] === n)[1], s: '' })) }); }}>
      <Field label="Applicants" required id="st-apps" error={err} hint="Applications waiting for a test">
        <div className="flex flex-wrap gap-2">
          {waiting.map(([n, c]) => { const on = pick.has(n); return <button type="button" key={n} onClick={() => { setErr(''); setPick((s) => { const x = new Set(s); on ? x.delete(n) : x.add(n); return x; }); }} className={cx('h-9 px-3 rounded-xl border text-[13px] font-semibold inline-flex items-center gap-1.5 transition', on ? 'bg-brand/10 border-brand text-brand' : 'border-line text-ink2 hover:border-ink3/50')}>{on && <I.Check size={14} />}{n} <span className="font-normal text-ink3">· {c}</span></button>; })}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" required id="st-d"><Input id="st-d" value={d} onChange={(x) => setD(x.target.value)} placeholder="DD-MM-YYYY" className="tnum" /></Field>
        <Field label="Time" required id="st-t"><Select id="st-t" value={tm} onChange={setTm} options={['9:00 AM', '9:30 AM', '10:00 AM', '11:00 AM', '2:00 PM']} /></Field>
      </div>
      <div className="grid grid-cols-[1fr_110px] gap-3">
        <Field label="Venue" id="st-v"><Input id="st-v" value={venue} onChange={(x) => setVenue(x.target.value)} /></Field>
        <Field label="Maximum marks" id="st-m"><Input id="st-m" value={max} onChange={(x) => setMax(x.target.value.replace(/\D/g, ''))} inputMode="numeric" className="tnum" /></Field>
      </div>
    </FormSheet>
  );
}
function ScheduleInterviewSheet({ ints, onClose, onSave }) {
  const [app, setApp] = useState('Myra Khan · LKG');
  const [who, setWho] = useState('Lakshmi Rao');
  const busy = ints.filter((i) => i.who === who && i.slot.startsWith('Wed 14 Oct')).map((i) => i.slot.split(', ')[1]);
  const [slot, setSlot] = useState(null);
  const free = SLOTS.find((s) => !busy.includes(s));
  const cur = slot && !busy.includes(slot) ? slot : free;
  return (
    <FormSheet open onClose={onClose} title="Schedule interview" sub="Wed 14 Oct · 15-minute slots" submitLabel={`Book ${cur}`} onSubmit={() => onSave({ id: 'INT-25', slot: `Wed 14 Oct, ${cur}`, who, app: app.split(' · ')[0], cls: app.split(' · ')[1], outcome: null })}>
      <Field label="Applicant" required id="si-a"><Select id="si-a" value={app} onChange={setApp} options={['Myra Khan · LKG', 'Diya Patel · UKG', 'Ira Varma · Nursery', 'Aadhya Iyer · Nursery']} /></Field>
      <Field label="Interviewer" required id="si-w"><Select id="si-w" value={who} onChange={(v) => { setWho(v); setSlot(null); }} options={['Lakshmi Rao', 'Srinivas Murthy', 'Meena Pillai']} /></Field>
      <Field label="Slot" required id="si-s" hint="Booked slots cannot be picked">
        <div className="grid grid-cols-4 gap-1.5">
          {SLOTS.map((s) => { const b = busy.includes(s); const on = cur === s; return <button type="button" key={s} disabled={b} onClick={() => setSlot(s)} className={cx('h-11 rounded-xl border text-[13px] font-semibold tnum transition flex flex-col items-center justify-center leading-tight', b ? 'border-line bg-sunken text-ink3 cursor-not-allowed' : on ? 'border-brand bg-brand/8 text-brand ring-1 ring-brand' : 'border-line text-ink2 hover:border-ink3/50')}>{s}{b && <span className="text-[10.5px] font-medium">Booked</span>}</button>; })}
        </div>
      </Field>
    </FormSheet>
  );
}
function OutcomeSheet({ i, onClose, onSave }) {
  const [o, setO] = useState(i.outcome || 'Recommended');
  const [note, setNote] = useState(i.note || '');
  return (
    <FormSheet open onClose={onClose} title={`Interview: ${i.app}`} sub={`${i.cls} · ${i.slot} · ${i.who}`} submitLabel="Save outcome" onSubmit={() => onSave(o, note)}>
      <Field label="Outcome" required id="oc-o"><Segmented value={o} onChange={setO} options={['Recommended', 'Hold', 'Not recommended']} className="w-full" size="sm" /></Field>
      <Field label="Notes" id="oc-n"><Textarea id="oc-n" value={note} onChange={setNote} placeholder="How did the child and parents come across?" /></Field>
      {i.outcome && <p className="text-[12.5px] text-ink3">Was {i.outcome}. Every change of outcome is kept in the decision history.</p>}
    </FormSheet>
  );
}

/* ======================= Admission Decision ======================= */
const WAIT0 = {
  'Class 1 · 2027–28': [
    { n: 'Saanvi Bhat', why: 'Test 46 of 50 · applied 22 Sep', app: 'APP/2027/0098' },
    { n: 'Kiran Yadav', why: 'Test 39 of 50 · applied 18 Sep', app: 'APP/2027/0091' },
    { n: 'Laya Reddy', why: 'Staff child category · test 35 of 50', app: 'APP/2027/0101' },
  ],
  'LKG · 2027–28': [{ n: 'Advik Jain', why: 'Applied 19 Sep · interview Wed 14 Oct', app: 'APP/2027/0094' }, { n: 'Tara Menon', why: 'Applied 21 Sep · age rule, apply next year', app: 'APP/2027/0097' }],
  'Class 4 · 2026–27': [{ n: 'Arnav Gupta', why: 'Enquiry only · visit Sat 10 Oct · 4 A full', app: 'ENQ-0484' }],
};
const DECIDED = [
  { n: 'Kavya Joshi', cls: 'Class 2 · mid-year', d: 'Admitted · SPS/2026/0911', by: 'Lakshmi Rao', when: '2 Oct', tone: 'ok', note: 'Good test score. Joins 2 B.' },
  { n: 'Pooja Naidu', cls: 'Class 4 · 2027–28', d: 'Approved · offer accepted', by: 'Lakshmi Rao', when: '6 Oct', tone: 'ok', note: 'Strong in Maths. Offer letter sent on WhatsApp.' },
  { n: 'Rehan Ali', cls: 'Class 3 · mid-year', d: 'Approved', by: 'Lakshmi Rao', when: '8 Oct', tone: 'ok', note: 'Family moved from Vijayawada. Needs Telugu support.' },
  { n: 'Yash Shetty', cls: 'Class 6 · 2027–28', d: 'Rejected', by: 'Lakshmi Rao', when: '30 Sep', tone: 'bad', note: 'Test 18 of 100. Parents were advised to apply for Class 5.' },
];

function Decision() {
  const { go } = useNav();
  const { role } = useRole();
  const toast = useToast();
  const canEdit = useCanEdit();
  const isP = role.id === 'principal';
  const [apps, setApps] = useState(() => APPS.filter((a) => ['Decision', 'Approved'].includes(a.stage)).map((a) => ({ ...a })));
  const [tab, setTab] = useState('ready');
  const [wait, setWait] = useState(WAIT0);
  const [wcls, setWcls] = useState(Object.keys(WAIT0)[0]);
  const [whist, setWhist] = useState([{ what: 'Laya Reddy moved from 2 to 3. Reason: sibling rule now counts before staff category (policy 2027–28).', when: '6 Oct 2026 · Lakshmi Rao', icon: 'ArrowUpDown' }]);
  const [decided, setDecided] = useState(DECIDED);
  const [appr, setAppr] = useState(null);
  const [rej, setRej] = useState(null);
  const [send, setSend] = useState(null);
  const [move, setMove] = useState(null);
  const [done, setDone] = useState(null);
  const [undo, setUndo] = useState(false);
  const [num, setNum] = useState({ '2026–27': 914, '2027–28': 1 });
  const ready = apps.filter((a) => a.stage === 'Decision');
  const approved = apps.filter((a) => a.stage === 'Approved');
  const set = (id, p) => setApps((l) => l.map((a) => (a.id === id ? { ...a, ...p } : a)));
  const full = (a) => seatTotal(a.year, a.cls) === 0;
  const docsOk = (a) => verified(a) === a.docs.length;
  const feeOk = (a) => a.admFee?.status === 'Paid';

  const admit = (a, sec, viaApprove) => {
    const n = num[a.year];
    const admNo = `SPS/${a.year === '2026–27' ? '2026' : '2027'}/${String(n).padStart(4, '0')}`;
    setNum((x) => ({ ...x, [a.year]: n + 1 }));
    set(a.id, { stage: 'Admitted', admNo, sec });
    setDecided((d) => [{ n: a.child, cls: `${a.cls} · ${a.year === '2026–27' ? 'mid-year' : a.year}`, d: `Admitted · ${admNo}`, by: role.person.name, when: '9 Oct', tone: 'ok', note: viaApprove ? 'Approved and admitted.' : 'Admission confirmed.' }, ...d]);
    const parent = a.mother || a.father;
    toast({ title: `Admission number ${admNo} created`, body: `${a.child} · ${a.cls.replace('Class ', 'Class ')} ${sec} · Parent Link sent to ${parent}.`, ms: 5200 });
    setTimeout(() => setDone({ a, admNo, sec }), 50);
  };

  const DecisionCard = ({ a }) => {
    const seats = seatTotal(a.year, a.cls);
    const facts = [
      ['FolderOpen', docsOk(a) ? `Papers ${verified(a)} of ${a.docs.length} verified` : `${docsFor(a.cls)[[...a.docs].findIndex((c) => c !== 'V')]} not verified`, docsOk(a) ? 'ok' : 'warn'],
      ['ClipboardCheck', a.test?.score != null ? `Test ${a.test.score} of ${a.test.max}` : 'No test for this class', 'neutral'],
      ['Users', a.interview?.outcome ? `Interview: ${a.interview.outcome}` : 'Interview not needed', a.interview?.outcome === 'Recommended' ? 'ok' : 'neutral'],
      ['HeartHandshake', a.sibling ? `Sibling: ${a.sibling}` : 'No sibling here', a.sibling ? 'brand' : 'neutral'],
      ['School', seats === 0 ? `${a.cls} is full (80 of 80)` : `Seats left: ${seatText(a.year, a.cls)}`, seats === 0 ? 'bad' : seats <= 3 ? 'warn' : 'neutral'],
      ['IndianRupee', a.admFee?.status === 'Paid' ? 'Admission fee paid (Razorpay)' : 'Admission fee after approval', a.admFee?.status === 'Paid' ? 'ok' : 'neutral'],
    ];
    return (
      <Card className="p-4 @md:p-5 flex flex-col gap-3.5">
        <div className="flex items-start gap-3.5">
          <Avatar name={a.child} size={46} />
          <div className="min-w-0 flex-1">
            <button onClick={() => go('admissions', { page: 'applications', id: a.id })} className="font-semibold text-[16px] leading-tight hover:underline text-left">{a.child}</button>
            <p className="text-[13px] text-ink3">{a.cls} · {yl(a.year)} · <span className="font-mono text-[12px]">{a.id}</span> · Category: General</p>
          </div>
          {a.withPrincipal && <Pill tone="info" className="shrink-0 hidden @sm:inline-flex">With the Principal</Pill>}
        </div>
        <ul className="grid @md:grid-cols-2 gap-x-4 gap-y-2">
          {facts.map(([ic, t, tone]) => (
            <li key={t} className="flex items-center gap-2 text-[13.5px] min-w-0"><Icon name={ic} size={16} className={cx('shrink-0', { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', brand: 'text-brand', neutral: 'text-ink3' }[tone])} /><span className={cx('truncate', tone === 'bad' && 'text-bad font-semibold', tone === 'warn' && 'text-warn font-semibold')}>{t}</span></li>
          ))}
        </ul>
        {a.withPrincipal && <p className="text-[12.5px] text-ink3 -mt-1">{a.withPrincipal}. Also waiting in Approvals.</p>}
        {canEdit && (
          <div className="flex gap-2 flex-wrap pt-1">
            {full(a) ? (
              <Button variant="primary" icon={I.ListOrdered} onClick={() => {
                const k = `${a.cls} · ${a.year}`;
                setWait((w) => ({ ...w, [k]: [{ n: a.child, why: `Sibling in school (${a.sibling}) · test ${a.test?.score} of 50`, app: a.id }, ...(w[k] || [])] }));
                set(a.id, { stage: 'Waiting list' }); setWcls(k);
                toast({ title: `${a.child} added to the waiting list`, body: `Ranked 1 of ${(wait[k]?.length || 0) + 1} in ${a.cls} by the school’s rules (sibling priority).` });
              }}>Add to waiting list</Button>
            ) : isP ? (
              <Button variant="primary" icon={I.CircleCheck} onClick={() => setAppr(a)}>Approve</Button>
            ) : a.withPrincipal ? (
              <Button variant="secondary" icon={I.Hourglass} disabled>Waiting for Lakshmi Rao</Button>
            ) : (
              <Button variant="primary" icon={I.Send} onClick={() => setSend(a)}>Send for approval</Button>
            )}
            {(isP || !a.withPrincipal) && <Button variant="dangerSoft" icon={I.X} onClick={() => setRej(a)}>Reject</Button>}
            <Button variant="ghost" icon={I.Eye} onClick={() => go('admissions', { page: 'applications', id: a.id })}>Application</Button>
          </div>
        )}
      </Card>
    );
  };

  return (
    <div>
      <ModuleHead sub={isP ? 'Approve or reject with remarks, keep the waiting list and confirm admissions' : 'Decisions here need the Principal’s approval (Settings, Forms & Approvals)'} />
      <div className="flex flex-col gap-4">
        {!isP && canEdit && <Banner tone="info" icon="ShieldCheck" title="Principal approval is on.">You send each decision to Lakshmi Rao. Once approved, you confirm the admission when the family accepts.</Banner>}
        <Tabs value={tab} onChange={setTab} tabs={[{ id: 'ready', label: 'Ready for decision', count: ready.length }, { id: 'approved', label: 'Approved, to confirm', count: approved.length }, { id: 'wait', label: 'Waiting list', count: Object.values(wait).reduce((s, l) => s + l.length, 0) }, { id: 'done', label: 'Decided', count: decided.length }]} />

        {tab === 'ready' && (ready.length ? <div className="grid @xl:grid-cols-2 gap-4">{ready.map((a) => <DecisionCard key={a.id} a={a} />)}</div>
          : <Card><Empty icon={I.CheckCheck} title="Nothing waiting for a decision" body="Applications arrive here once papers, tests and interviews are done." action={<Button variant="secondary" onClick={() => go('admissions', { page: 'applications' })}>See applications</Button>} /></Card>)}

        {tab === 'approved' && (
          <Card className="overflow-hidden">
            <CardHead title="Approved, waiting to be confirmed" sub="Confirm when the family accepts. The admission fee must be paid first." />
            {approved.length === 0 ? <Empty icon={I.CheckCheck} title="Everyone approved is admitted" body="Approved applications show here until the admission is confirmed." /> : (
              <ul className="divide-y divide-line/70 border-t border-line/70">
                {approved.map((a) => (
                  <li key={a.id} className="p-4 @md:px-5 flex flex-col @lg:flex-row @lg:items-center gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Avatar name={a.child} size={42} />
                      <div className="min-w-0">
                        <p className="font-semibold text-[15px] leading-tight">{a.child} <span className="text-ink3 font-normal text-[13px]">· {a.cls} · {yl(a.year)}</span></p>
                        <p className="text-[12.5px] text-ink3">Approved by {a.approved} · {a.offer ? `Offer letter sent ${a.offer.sent} · accepted ${a.offer.accepted}` : 'Offer letter not sent'}</p>
                        <div className="flex gap-1.5 mt-1.5 flex-wrap">
                          <Pill tone={feeOk(a) ? 'ok' : 'warn'} className="!h-[22px] !text-[11.5px]">{feeOk(a) ? `Admission fee paid · ${a.admFee.rcpt}` : 'Admission fee not paid'}</Pill>
                          {a.offer?.accepted && <Pill tone="ok" className="!h-[22px] !text-[11.5px]">Offer accepted</Pill>}
                        </div>
                      </div>
                    </div>
                    {canEdit && (
                      <div className="flex gap-2 flex-wrap">
                        {!a.offer && <Button variant="secondary" icon={I.FileSignature} onClick={() => { set(a.id, { offer: { sent: '9 Oct, WhatsApp', accepted: null } }); toast({ title: 'Offer letter sent', body: `To ${a.mother || a.father} on WhatsApp, from the offer-letter design.` }); }}>Send offer letter</Button>}
                        {!feeOk(a) && <Button variant="secondary" icon={I.Send} onClick={() => toast({ title: 'Razorpay link sent', body: `₹25,000 admission fee to +91 ${a.phone}. Valid 7 days.` })}>Send Razorpay link</Button>}
                        <Button variant="primary" icon={I.BadgeCheck} disabled={!feeOk(a)} onClick={() => setAppr({ ...a, confirmOnly: true })}>Confirm admission</Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {tab === 'wait' && (
          <>
            <Chips value={wcls} onChange={setWcls} options={Object.keys(wait).map((k) => ({ value: k, label: k, count: wait[k].length }))} />
            <Split>
              <Card className="overflow-hidden">
                <CardHead title={`Waiting list · ${wcls}`} sub="Ranked by the school’s rules: sibling, category, test score, date applied" />
                <ol className="divide-y divide-line/70 border-t border-line/70">
                  {(wait[wcls] || []).map((w, i, arr) => (
                    <li key={w.n} className="flex items-center gap-3 px-4 @md:px-5 py-3">
                      <span className="w-8 h-8 rounded-full bg-brand/10 text-brand grid place-items-center font-bold text-[13px] tnum shrink-0">{i + 1}</span>
                      <div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px] truncate">{w.n}</p><p className="text-[12.5px] text-ink3 truncate">{w.why}</p></div>
                      {canEdit && (
                        <div className="flex gap-1 shrink-0">
                          <IconButton icon={I.ArrowUp} label={`Move ${w.n} up`} size={34} disabled={i === 0} className="disabled:opacity-30" onClick={() => setMove({ i, dir: -1, w, other: arr[i - 1] })} />
                          <IconButton icon={I.ArrowDown} label={`Move ${w.n} down`} size={34} disabled={i === arr.length - 1} className="disabled:opacity-30" onClick={() => setMove({ i, dir: 1, w, other: arr[i + 1] })} />
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
                <p className="px-5 py-3 text-[12.5px] text-ink3 border-t border-line/70">When a seat frees up, the first name gets an offer. Seats in {wcls.split(' · ')[0]}: {seatTotal(wcls.split(' · ')[1], wcls.split(' · ')[0])} left.</p>
              </Card>
              <Card>
                <CardHead title="Changes by hand" sub="Every move needs a reason and is kept" icon={I.History} />
                <div className="px-5"><Timeline items={whist} /></div>
              </Card>
            </Split>
          </>
        )}

        {tab === 'done' && (
          <Card className="overflow-hidden">
            <CardHead title="Decided" sub="This year, newest first" action={<ExportButton what="decisions" />} />
            <ul className="divide-y divide-line/70 border-t border-line/70">
              {decided.map((d, i) => (
                <li key={i} className="flex items-start gap-3 px-4 @md:px-5 py-3">
                  <Avatar name={d.n} size={38} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[14.5px] leading-tight">{d.n} <span className="text-ink3 font-normal text-[13px]">· {d.cls}</span></p>
                    <p className="text-[12.5px] text-ink3">{d.by} · {d.when} · “{d.note}”</p>
                  </div>
                  <Pill tone={d.tone} className="shrink-0">{d.d.split(' · ')[0]}</Pill>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {appr && <ApproveSheet a={appr} onClose={() => setAppr(null)} onApprove={(a, now, sec, remarks) => {
        if (now) { admit(a, sec, !a.confirmOnly); return; }
        set(a.id, { stage: 'Approved', approved: `${role.person.name}, 9 Oct`, offer: { sent: '9 Oct, WhatsApp', accepted: null } });
        setDecided((d) => [{ n: a.child, cls: `${a.cls} · ${a.year === '2026–27' ? 'mid-year' : a.year}`, d: 'Approved', by: role.person.name, when: '9 Oct', tone: 'ok', note: remarks || 'Approved.' }, ...d]);
        toast({ title: `${a.child} approved`, body: `Offer letter sent to ${a.mother || a.father} on WhatsApp. Confirm once the admission fee is paid.` });
      }} />}
      {rej && <RejectSheet a={rej} onClose={() => setRej(null)} onReject={(why) => {
        const prev = apps;
        set(rej.id, { stage: 'Rejected' });
        setDecided((d) => [{ n: rej.child, cls: `${rej.cls} · ${rej.year === '2026–27' ? 'mid-year' : rej.year}`, d: 'Rejected', by: role.person.name, when: '9 Oct', tone: 'bad', note: why }, ...d]);
        toast({ title: `${rej.child}’s application rejected`, body: 'The parent gets a polite message. Your remarks stay with the school.', undo: () => setApps(prev) });
      }} />}
      {send && <SendApprovalSheet a={send} onClose={() => setSend(null)} onSend={() => { set(send.id, { withPrincipal: 'Sent by ' + role.person.name + ' on 9 Oct' }); toast({ title: 'Sent to Lakshmi Rao for approval', body: `${send.child} · ${send.cls}. It is in her Approvals now.` }); }} />}
      {move && <MoveSheet m={move} onClose={() => setMove(null)} onSave={(why) => {
        setWait((w) => { const l = [...w[wcls]]; const [x] = l.splice(move.i, 1); l.splice(move.i + move.dir, 0, x); return { ...w, [wcls]: l }; });
        setWhist((h) => [{ what: `${move.w.n} moved ${move.dir < 0 ? 'above' : 'below'} ${move.other.n}. Reason: ${why}`, when: `9 Oct 2026, 10:44 AM · ${role.person.name}`, icon: 'ArrowUpDown', tone: 'warn' }, ...h]);
        toast({ title: `${move.w.n} moved ${move.dir < 0 ? 'up' : 'down'}`, body: 'Reason saved in the waiting-list history.' });
      }} />}

      <Sheet open={!!done} onClose={() => setDone(null)} title="" wide>
        {done && (
          <div className="flex flex-col items-center text-center pt-5">
            <span className="w-16 h-16 rounded-full bg-ok text-surface grid place-items-center animate-pop shadow-pop"><I.Check size={34} strokeWidth={3} /></span>
            <h2 className="font-display text-[24px] font-semibold mt-4">{done.a.child} is now a student</h2>
            <p className="text-ink3 text-[14px] mt-1">Admission number <b className="font-mono text-ink text-[13.5px]">{done.admNo}</b> · {done.a.cls} {done.sec} · roll {done.a.cls === 'Class 5' ? 37 : 39}</p>
            <ul className="w-full mt-5 text-left rounded-2xl border border-line divide-y divide-line/70">
              {[
                ['GraduationCap', 'Student record', `${done.admNo} · ${done.a.cls} ${done.sec}${done.a.year === '2027–28' ? ' · becomes Active on 1 Jun 2027' : ' · Active from today'}`, () => go('students')],
                ['Users', 'Parents linked', `${done.a.mother} and ${done.a.father} · consent records moved`, () => go('students', { page: 'parents' })],
                ['Smartphone', 'Parent Link sent', `To ${done.a.mother} on WhatsApp, +91 ${done.a.phone}`, null],
                ['IndianRupee', 'Fee plan set up', planLabel(done.a), null],
                ...(done.a.stop ? [['Bus', 'Transport assigned', done.a.stop, null]] : []),
                ['IdCard', 'ID card queued', 'Certificates & ID Cards · next batch', () => go('students', { page: 'certificates' })],
                ['MessageCircle', 'Welcome message sent', '“Admission confirmed” template, with the admission number', null],
              ].map(([ic, t, s, fn]) => (
                <li key={t}>
                  <button disabled={!fn} onClick={() => { if (fn) { setDone(null); fn(); } }} className="w-full flex items-center gap-3 px-4 py-3 text-left enabled:hover:bg-sunken/60">
                    <span className="w-9 h-9 rounded-xl bg-ok/10 text-ok grid place-items-center shrink-0"><Icon name={ic} size={17} /></span>
                    <span className="min-w-0 flex-1"><b className="font-semibold text-[14px] block">{t}</b><span className="text-[12.5px] text-ink3 block truncate">{s}</span></span>
                    {fn && <I.ChevronRight size={17} className="text-ink3" />}
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2 w-full mt-4">
              <Button variant="primary" className="flex-1" onClick={() => setDone(null)}>Done</Button>
              <Button variant="ghost" icon={I.Undo2} onClick={() => setUndo(true)}>Undo admission (10 min)</Button>
            </div>
          </div>
        )}
      </Sheet>
      <ConfirmSheet open={undo} onClose={() => setUndo(false)} title="Undo admission?" sub="The student, the new parent records, their Parent Links and the fees created will be removed. Allowed only while nothing else has happened to the student." confirmLabel="Undo admission" danger
        onConfirm={() => { if (done) { set(done.a.id, { stage: done.a.confirmOnly ? 'Approved' : 'Decision', admNo: null }); setDecided((d) => d.slice(1)); toast({ title: `Admission ${done.admNo} undone`, body: 'The application is back where it was.', tone: 'info' }); } setDone(null); }} />
    </div>
  );
}

function ApproveSheet({ a, onClose, onApprove }) {
  const seats = seatsOf(a.year, a.cls);
  const best = Object.entries(seats).sort((x, y) => y[1] - x[1])[0][0];
  const docsOk = verified(a) === a.docs.length;
  const feeOk = a.admFee?.status === 'Paid';
  const canNow = docsOk && feeOk;
  const [now, setNow] = useState(canNow);
  const [sec, setSec] = useState(best);
  const [date, setDate] = useState(a.year === '2026–27' ? '09-10-2026' : '01-06-2027');
  const [conc, setConc] = useState('None');
  const [stop, setStop] = useState(a.stop || 'No transport');
  const [remarks, setRemarks] = useState('');
  const confirmOnly = a.confirmOnly;
  return (
    <FormSheet open onClose={onClose} wide title={confirmOnly ? `Confirm admission: ${a.child}` : `Approve ${a.child}`} sub={`${a.cls} · ${yl(a.year)} · ${a.id}`}
      submitLabel={now ? (confirmOnly ? `Confirm admission` : `Approve and admit ${a.child.split(' ')[0]}`) : 'Approve and send offer letter'} busyLabel={now ? 'Creating the student…' : 'Saving…'}
      onSubmit={() => onApprove(a, now, sec, remarks)}>
      {!confirmOnly && (
        <Field label="Remarks" id="ap-rm" hint="Optional for approval. Kept with the decision."><Textarea id="ap-rm" value={remarks} onChange={setRemarks} rows={2} placeholder="For example: good test score, sister in 5 A" /></Field>
      )}
      {!confirmOnly && (
        <div className={cx('rounded-xl border p-3.5 flex items-start gap-3', canNow ? 'border-line' : 'border-warn/40 bg-warn/[.06]')}>
          <Switch on={now} onChange={(v) => canNow && setNow(v)} label="Confirm the admission now" />
          <div className="text-[14px] min-w-0">
            <b className="font-semibold block">Confirm the admission now</b>
            {canNow ? <span className="text-[12.5px] text-ink3">Papers verified and the admission fee is paid. The student record is made at once.</span>
              : <span className="text-[12.5px] text-warn font-semibold">Not yet: {[!docsOk && `${docsFor(a.cls)[[...a.docs].findIndex((c) => c !== 'V')]} not verified`, !feeOk && 'admission fee ₹25,000 not paid'].filter(Boolean).join(' and ')}. Approve now and confirm later.</span>}
          </div>
        </div>
      )}
      {now && (
        <>
          <SubHead>Confirm admission</SubHead>
          <div className="grid @md:grid-cols-2 gap-3">
            <Field label="Class" required id="ap-cls"><Input id="ap-cls" value={a.cls} readOnly className="!bg-sunken/50" /></Field>
            <Field label="Section" required id="ap-sec" hint="Most free seats is picked for you">
              <Segmented value={sec} onChange={setSec} options={Object.entries(seats).map(([s, n]) => ({ value: s, label: `${s} · ${n} left` }))} className="w-full" size="sm" />
            </Field>
            <Field label="Admission date" required id="ap-date"><Input id="ap-date" value={date} onChange={(x) => setDate(x.target.value)} placeholder="DD-MM-YYYY" className="tnum" /></Field>
            <Field label="Fee plan" required id="ap-plan" hint="Changing it needs the fee-plan exception permission"><Input id="ap-plan" value={planLabel(a)} readOnly className="!bg-sunken/50" /></Field>
            <Field label="Concession" id="ap-conc" hint={conc === 'Staff child · 25%' ? 'Above ₹5,000: goes to Approvals first' : null}><Select id="ap-conc" value={conc} onChange={setConc} options={['None', 'Sibling · 10%', 'Staff child · 25%']} /></Field>
            <Field label="Transport stop" id="ap-stop"><Select id="ap-stop" value={stop} onChange={setStop} options={['No transport', 'Route 1 · KPHB Main Road', 'Route 2 · Nizampet X Roads', 'Route 3 · Bachupally', 'Route 4 · Miyapur X Roads', 'Route 5 · Moosapet Y Junction']} /></Field>
          </div>
          <p className="text-[12.5px] text-ink3 flex gap-1.5"><I.Info size={14} className="shrink-0 mt-0.5" />Makes the student with an admission number, links the parents, sends Parent Link, sets up the fee plan and queues the ID card. Runs once per application.</p>
        </>
      )}
    </FormSheet>
  );
}
function RejectSheet({ a, onClose, onReject }) {
  const [why, setWhy] = useState('');
  const [err, setErr] = useState('');
  return (
    <FormSheet open onClose={onClose} title={`Reject ${a.child}’s application`} sub={`${a.cls} · ${a.id}`} submitLabel="Reject application"
      onSubmit={() => { if (!why.trim()) { setErr('Write why. Rejecting without remarks is not possible.'); return false; } onReject(why.trim()); }}>
      <Field label="Remarks" required id="rj-why" error={err} hint="Kept with the decision. The parent gets a polite message, not these remarks.">
        <Textarea id="rj-why" value={why} onChange={(v) => { setWhy(v); setErr(''); }} placeholder="For example: test 18 of 100, advised to apply for Class 5" />
      </Field>
    </FormSheet>
  );
}
function SendApprovalSheet({ a, onClose, onSend }) {
  const [note, setNote] = useState('');
  return (
    <FormSheet open onClose={onClose} title="Send for approval" sub={`${a.child} · ${a.cls} goes to Lakshmi Rao (Principal)`} submitLabel="Send to Lakshmi Rao" busyLabel="Sending…" onSubmit={() => onSend(note)}>
      <Field label="Your recommendation" id="sa-note"><Textarea id="sa-note" value={note} onChange={setNote} placeholder="For example: all papers verified, test 41 of 50, recommend 5 B" /></Field>
      <p className="text-[12.5px] text-ink3">Nobody approves their own request. The Principal sees it in Approvals and here.</p>
    </FormSheet>
  );
}
function MoveSheet({ m, onClose, onSave }) {
  const [why, setWhy] = useState('');
  const [err, setErr] = useState('');
  return (
    <FormSheet open onClose={onClose} title={`Move ${m.w.n} ${m.dir < 0 ? 'up' : 'down'}`} sub={`${m.dir < 0 ? 'Above' : 'Below'} ${m.other.n}. The system rank is changed by hand.`} submitLabel="Move and save reason"
      onSubmit={() => { if (!why.trim()) { setErr(`Give a reason for moving ${m.w.n} ${m.dir < 0 ? 'above' : 'below'} ${m.other.n}`); return false; } onSave(why.trim()); }}>
      <Field label="Reason" required id="mv-why" error={err}><Input id="mv-why" value={why} onChange={(x) => { setWhy(x.target.value); setErr(''); }} error={err} placeholder="Written to the history" /></Field>
    </FormSheet>
  );
}

/* ======================= Admission Reports ======================= */
const R_SOURCES = [['Walk-in', 62, 12], ['WhatsApp', 44, 2], ['Phone', 38, 5], ['Website', 31, 3], ['Campaign', 22, 1], ['Referral', 17, 4]];
const R_PENDING = [['Zara Hussain', 'Class 2', 25, 'Principal’s approval'], ['Aditya Kumar', 'Class 1', 19, 'Class full · waiting list'], ['Arjun Mehta', 'Class 7', 15, 'Birth certificate, admission fee'], ['Meghana Rao', 'LKG', 13, 'Decision'], ['Reyansh Naidu', 'Class 1', 6, 'TC, address proof'], ['Sai Charan Goud', 'Class 6', 1, 'Application fee, 5 papers']];
const REPORTS = [
  { id: 'pipe', title: 'Lead pipeline', sub: 'Enquiries at each stage, by class', icon: 'SquareKanban' },
  { id: 'src', title: 'Sources', sub: 'Enquiries and admissions by source, with conversion', icon: 'Megaphone' },
  { id: 'conv', title: 'Conversion', sub: 'Enquiry to application to admission, by month', icon: 'TrendingUp' },
  { id: 'time', title: 'Average processing time', sub: 'Days from enquiry to admission', icon: 'Timer' },
  { id: 'pend', title: 'Pending applications', sub: 'Not decided yet, with age and what is missing', icon: 'Hourglass' },
  { id: 'fu', title: 'Follow-up report', sub: 'Done and overdue, by owner', icon: 'AlarmClock' },
  { id: 'loss', title: 'Loss reasons', sub: 'Lost enquiries by reason', icon: 'CircleX' },
];
function Reports() {
  const toast = useToast();
  const [year, setYear] = useState('2027–28');
  const [open, setOpen] = useState(null);
  const body = (id) => {
    if (id === 'pipe') return <HBars rows={[{ k: 'Nursery', v: 41 }, { k: 'LKG', v: 36 }, { k: 'UKG', v: 18 }, { k: 'Class 1', v: 28 }, { k: 'Class 2–5', v: 47 }, { k: 'Class 6–9', v: 44 }]} max={50} unit="" labelWidth={72} />;
    if (id === 'src') return (
      <ul className="flex flex-col gap-2">
        {R_SOURCES.map(([k, e, a]) => (
          <li key={k} className="grid grid-cols-[76px_1fr_112px] items-center gap-3 text-[13px]">
            <span className="text-ink2 font-medium">{k}</span>
            <span className="relative h-3 rounded-full bg-sunken overflow-hidden"><span className="absolute inset-y-0 left-0 rounded-full bg-ink3/25" style={{ width: `${(e / 62) * 100}%` }} /><span className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${(a / 62) * 100}%` }} /></span>
            <span className="text-right tnum"><b className="font-semibold">{a}</b><span className="text-ink3"> of {e} · {Math.round((a / e) * 100)}%</span></span>
          </li>
        ))}
      </ul>
    );
    if (id === 'conv') return <><Bars data={[{ k: 'Aug', v: 18, v2: 46 }, { k: 'Sep', v: 52, v2: 112 }, { k: 'Oct', v: 26, v2: 56 }]} max={120} ariaLabel="Applications against enquiries by month" /><Legend items={[['bg-brand', 'Applications'], ['bg-ink3/25', 'Enquiries']]} /></>;
    if (id === 'time') return (
      <div className="grid grid-cols-2 gap-3">
        {[['23 days', 'Enquiry to admission', '3 days faster than Sep'], ['9 days', 'Application to decision', 'Goal: under 10'], ['4 days', 'Papers to verified', 'Median'], ['2 days', 'Approval by Principal', 'Median']].map(([v, k, s]) => (
          <div key={k} className="rounded-xl bg-sunken/60 p-3"><p className="font-display font-semibold text-[20px] tnum">{v}</p><p className="text-[12.5px] font-semibold">{k}</p><p className="text-[12px] text-ink3">{s}</p></div>
        ))}
      </div>
    );
    if (id === 'pend') return (
      <ul className="flex flex-col divide-y divide-line/70">
        {R_PENDING.map(([n, c, d, m]) => <li key={n} className="flex items-center gap-3 py-2 text-[13.5px]"><span className="flex-1 min-w-0"><b className="font-semibold">{n}</b> <span className="text-ink3">· {c}</span><span className="block text-[12.5px] text-ink3 truncate">{m}</span></span><span className={cx('font-semibold tnum', d > 14 && 'text-warn')}>{d} {d === 1 ? 'day' : 'days'}</span></li>)}
      </ul>
    );
    if (id === 'fu') return (
      <ul className="flex flex-col gap-2.5">
        {[['Divya Menon', 46, 1], ['Naveen Kumar', 28, 1], ['Kavitha Nair', 19, 1]].map(([n, d, o]) => (
          <li key={n} className="flex items-center gap-3 text-[13.5px]"><Avatar name={n} size={30} /><span className="flex-1 font-semibold">{n}</span><span className="tnum"><b className="font-semibold">{d}</b> <span className="text-ink3">done</span></span><Pill tone="bad" className="!h-5 !text-[11px]">{o} overdue</Pill></li>
        ))}
      </ul>
    );
    return <HBars rows={[{ k: 'Fee too high', v: 9 }, { k: 'Too far', v: 7 }, { k: 'Other school', v: 6 }, { k: 'No reply', v: 5 }, { k: 'Moving city', v: 2 }, { k: 'No seat', v: 2 }]} max={10} unit="" labelWidth={92} />;
  };
  const cur = REPORTS.find((r) => r.id === open);
  return (
    <div>
      <ModuleHead sub="Where enquiries come from, how many join, and applications still pending" />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <div className="flex items-center gap-2 justify-between">
          <Segmented value={year} onChange={setYear} options={[{ value: '2027–28', label: '2027–28' }, { value: '2026–27', label: '2026–27 mid-year' }]} />
          <ExportButton what="admission reports" />
        </div>
        <Stats items={year === '2027–28' ? [
          { label: 'Conversion', value: '12.6%', sub: '27 admitted of 214 enquiries', icon: 'TrendingUp', tone: 'brand' },
          { label: 'Enquiry to admission', value: '23 days', sub: 'Average', icon: 'Timer' },
          { label: 'Application to decision', value: '9 days', sub: 'Average', icon: 'Hourglass' },
          { label: 'Pending applications', value: '31', sub: '6 older than 2 weeks', icon: 'FileClock', tone: 'warn' },
        ] : [
          { label: 'Conversion', value: '23.7%', sub: '9 admitted of 38 enquiries', icon: 'TrendingUp', tone: 'brand' },
          { label: 'Enquiry to admission', value: '12 days', sub: 'Average', icon: 'Timer' },
          { label: 'Application to decision', value: '6 days', sub: 'Average', icon: 'Hourglass' },
          { label: 'Pending applications', value: '4', sub: 'Mid-year', icon: 'FileClock' },
        ]} />
        <div className="grid @lg:grid-cols-2 gap-5 @lg:gap-6">
          {REPORTS.map((r) => (
            <Card key={r.id}>
              <CardHead title={r.title} sub={r.sub} icon={I[r.icon]} action={<Button size="sm" variant="ghost" iconRight={I.ChevronRight} onClick={() => setOpen(r.id)}>Open</Button>} />
              <div className="px-5 pb-5">{body(r.id)}</div>
            </Card>
          ))}
        </div>
      </div>
      <Sheet open={!!cur} onClose={() => setOpen(null)} wide title={cur?.title} sub={cur ? `${cur.sub} · ${yl(year)}` : ''}
        footer={<><Button variant="secondary" icon={I.Download} onClick={() => toast({ title: `Exported ${cur?.title}`, body: 'Excel file with the school name, filters and your name on top. Logged in the export log.' })}>Export</Button><Button variant="primary" onClick={() => setOpen(null)}>Done</Button></>}>
        {cur && (cur.id === 'src' ? (
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full text-[14px] min-w-[460px]">
              <thead><tr className="text-[12px] text-ink3 text-left border-b border-line"><th className="py-2 font-semibold">Source</th><th className="py-2 font-semibold text-right">Enquiries</th><th className="py-2 font-semibold text-right">Applications</th><th className="py-2 font-semibold text-right">Admitted</th><th className="py-2 font-semibold text-right">Conversion</th></tr></thead>
              <tbody>{R_SOURCES.map(([k, e, a]) => <tr key={k} className="border-b border-line/70"><td className="py-2.5 font-medium">{k}</td><td className="text-right tnum">{e}</td><td className="text-right tnum">{Math.round(e * 0.45)}</td><td className="text-right tnum">{a}</td><td className="text-right tnum font-semibold">{Math.round((a / e) * 100)}%</td></tr>)}</tbody>
            </table>
          </div>
        ) : body(cur.id))}
      </Sheet>
    </div>
  );
}

/* ======================= Admission Settings ======================= */
const STAGE_SET = [
  ['Enquiry', true, false, 'Every admission starts here'], ['Application', true, false, 'Counter or online form'], ['Application fee', true, false, '₹500 Nursery–5 · ₹750 Class 6–9 · Razorpay'],
  ['Documents', true, false, 'Papers needed per class, below'], ['Entrance test', true, false, 'Classes 1–9'], ['Interview', true, false, 'Nursery to UKG only'],
  ['Decision', true, true, 'Approved by the Principal'], ['Admission fee', true, false, '₹25,000 before confirming'], ['Admitted', true, false, 'Student record made automatically'],
];
const PAPER_COLS = ['Nursery–UKG', 'Class 1', 'Class 2–5', 'Class 6–9'];
const PAPERS = [['Birth certificate', 'RRRR'], ['Transfer certificate', '-RRR'], ['Previous marksheet', '-RRR'], ['Address proof', 'RRRR'], ['Parent ID', 'RRRR'], ['Passport photos', 'RRRR'], ['Aadhaar card (student)', 'OOOO'], ['Caste certificate', 'OOOO']];
function AdmSettings() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const { go } = useNav();
  const { role } = useRole();
  const [stages, setStages] = useState(STAGE_SET.map(([k, on, ap, s]) => ({ k, on, ap, s })));
  const [rule, setRule] = useState('class');
  const [papers, setPapers] = useState(PAPERS.map(([k, v]) => [k, v.split('')]));
  const [facts, setFacts] = useState({ 'Fees for 2027–28': true, 'Admission dates': true, 'Papers needed': true, 'Bus routes and stops': true, 'School timings': true, 'Seats left per class': false });
  const cyc = { R: 'O', O: '-', '-': 'R' };
  const chips = (items, what) => (
    <div className="px-5 pb-5 flex flex-wrap gap-2">
      {items.map((x) => <span key={x} className="h-8 px-3 rounded-full bg-sunken text-[13px] font-medium inline-flex items-center">{x}</span>)}
      {canEdit && <button onClick={() => toast({ title: `Add ${what}`, body: 'Type the name. Items in use can be renamed or archived, not deleted.', tone: 'info' })} className="h-8 px-3 rounded-full border border-dashed border-line text-[13px] font-semibold text-brand inline-flex items-center gap-1"><I.Plus size={14} />Add</button>}
    </div>
  );
  return (
    <div>
      <ModuleHead sub="The rules for admissions at Sunrise Public School. Every change is logged." />
      <div className="flex flex-col gap-5 @lg:gap-6 max-w-5xl">
        <Card>
          <CardHead title="Admission stages and approvals" sub="In order. Each stage can be on or off and can need an approval." icon={I.Workflow} />
          <ol className="border-t border-line/70 divide-y divide-line/70">
            {stages.map((s, i) => (
              <li key={s.k} className="flex items-center gap-3 px-5 py-3">
                <span className="w-7 h-7 rounded-full bg-sunken text-[12px] font-bold grid place-items-center tnum shrink-0">{i + 1}</span>
                <div className="min-w-0 flex-1"><p className={cx('font-semibold text-[14px]', !s.on && 'text-ink3')}>{s.k}</p><p className="text-[12.5px] text-ink3 truncate">{s.s}</p></div>
                <label className="hidden @sm:flex items-center gap-2 text-[12.5px] text-ink2 font-semibold"><Checkbox checked={s.ap} label={`${s.k} needs approval`} onChange={(v) => { if (!canEdit) return; setStages((l) => l.map((x, j) => (j === i ? { ...x, ap: v } : x))); toast({ title: `${s.k}: ${v ? 'needs approval' : 'no approval'}`, body: 'Saved. Recorded in the audit log.' }); }} />Approval</label>
                <Switch on={s.on} label={`${s.k} on`} onChange={(v) => { if (!canEdit || ['Enquiry', 'Application', 'Admitted'].includes(s.k)) return toast({ title: `${s.k} is always on`, tone: 'info' }); setStages((l) => l.map((x, j) => (j === i ? { ...x, on: v } : x))); toast({ title: `${s.k}: ${v ? 'on' : 'off'}`, body: s.k === 'Entrance test' || s.k === 'Interview' ? (v ? 'Test & Interview page is shown.' : 'Hidden everywhere when both are off.') : 'Saved. Recorded in the audit log.' }); }} />
              </li>
            ))}
          </ol>
        </Card>

        <Card>
          <CardHead title="Who gets new enquiries" sub="The owner can still be changed by hand. The history keeps every change." icon={I.UserCheck} />
          <div className="px-5 pb-5 flex flex-col gap-3">
            {[['one', 'One default owner', 'Every new enquiry goes to Divya Menon'], ['turn', 'In turn among chosen staff', 'Divya Menon, Naveen Kumar, Kavitha Nair. Staff on approved leave that day are skipped.'], ['class', 'By class wanted', 'A staff member for each class. No class wanted goes to the default owner.']].map(([v, l, s]) => (
              <button key={v} onClick={() => { if (!canEdit) return; setRule(v); toast({ title: `New enquiries: ${l.toLowerCase()}`, body: 'Saved. Recorded in the audit log.' }); }} aria-pressed={rule === v}
                className={cx('flex items-start gap-3 rounded-xl border p-3.5 text-left transition', rule === v ? 'border-brand ring-1 ring-brand bg-brand/5' : 'border-line hover:bg-sunken/60')}>
                <span className={cx('w-5 h-5 rounded-full border-2 grid place-items-center mt-0.5 shrink-0', rule === v ? 'border-brand' : 'border-line')}>{rule === v && <span className="w-2.5 h-2.5 rounded-full bg-brand" />}</span>
                <span><b className="font-semibold text-[14px] block">{l}</b><span className="text-[12.5px] text-ink3">{s}</span></span>
              </button>
            ))}
            {rule === 'class' && (
              <ul className="rounded-xl bg-sunken/60 divide-y divide-line/70 text-[13.5px]">
                {[['Nursery to UKG', 'Divya Menon'], ['Class 1 to 5', 'Naveen Kumar'], ['Class 6 to 9', 'Divya Menon'], ['No class wanted', 'Divya Menon (default owner)']].map(([c, o]) => (
                  <li key={c} className="flex items-center justify-between gap-3 px-3.5 py-2.5"><span className="text-ink2">{c}</span><span className="font-semibold">{o}</span></li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHead title="Papers needed per class" sub={canEdit ? 'Tap a cell to switch Required, Optional or Not needed' : 'Required, optional or not needed'} icon={I.FolderOpen} />
          <div className="overflow-x-auto scroll-thin border-t border-line">
            <table className="text-[13.5px] min-w-full">
              <thead><tr className="text-[12px] text-ink3 border-b border-line"><th className="sticky left-0 bg-surface text-left font-semibold px-5 py-2.5 min-w-[180px]">Paper</th>{PAPER_COLS.map((c) => <th key={c} className="font-semibold px-3 py-2.5 whitespace-nowrap">{c}</th>)}</tr></thead>
              <tbody>
                {papers.map(([k, v], ri) => (
                  <tr key={k} className="border-b border-line/70 last:border-0">
                    <td className="sticky left-0 bg-surface px-5 py-2 font-medium whitespace-nowrap">{k}</td>
                    {v.map((c, ci) => (
                      <td key={ci} className="px-3 py-2 text-center">
                        <button disabled={!canEdit} onClick={() => setPapers((p) => p.map((row, j) => (j === ri ? [row[0], row[1].map((x, m) => (m === ci ? cyc[x] : x))] : row)))}
                          className={cx('h-7 px-2.5 rounded-lg text-[12px] font-semibold min-w-[78px]', c === 'R' ? 'bg-brand/10 text-brand' : c === 'O' ? 'bg-sunken text-ink2' : 'text-ink3')}>{c === 'R' ? 'Required' : c === 'O' ? 'Optional' : 'Not needed'}</button>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid @lg:grid-cols-3 gap-5 @lg:gap-6">
          <Card><CardHead title="Enquiry statuses" sub="Applied and Admitted are set by the system" />{chips(STATUSES, 'status')}</Card>
          <Card><CardHead title="Enquiry sources" sub="Kept as first recorded" />{chips([...SOURCES, 'Newspaper ad'], 'source')}</Card>
          <Card><CardHead title="Loss reasons" sub="Needed to close an enquiry as lost" />{chips(LOSS, 'loss reason')}</Card>
        </div>

        <SettingsCard title="Seats, priority and quota" icon={I.School} rows={[
          { title: 'Admit over capacity', sub: 'Off: a full class sends new admissions to the waiting list. Seats per class come from Classes & Sections.', on: false },
          { title: 'Sibling priority', sub: 'Counts 20 points in waiting-list ranking', on: true },
          { title: 'Quota and category seats', sub: 'Staff children 5% of seats in each class', on: true },
          { title: 'Admit with papers pending', sub: 'Off: Confirm admission waits until every required paper is verified', on: false },
        ]} />

        <SettingsCard title="Forms, fees and numbers" icon={I.FileText} rows={[
          { title: 'Entrance test and interview', sub: 'Shows the Test & Interview page and its stage', on: true },
          { title: 'Online application', sub: 'Nursery to Class 9 take online applications', on: true },
          { title: 'Application fee', sub: 'Fee head “Application fee” lives in Fee Structure', value: '₹500 · ₹750' },
          { title: 'Application number format', sub: 'Next: APP/2027/0113', value: 'APP/YYYY/0000' },
        ]} />

        <Card>
          <CardHead title="WhatsApp auto-reply" sub="AI drafts replies only from the facts ticked here, and hands over to a person when unsure" icon={I.Sparkles} />
          <div className="divide-y divide-line/70 border-t border-line/70">
            <ToggleRow title="AI auto-reply" sub="Replies are labelled. Staff can pause it on any enquiry." on id="adm-ai-auto" />
            <SettingRow title="Office hours" sub="Outside these hours the parent is told when someone will call"><span className="text-[14px] font-semibold">Mon–Sat, 8:30 AM–6:00 PM</span></SettingRow>
            <div className="px-5 py-4">
              <p className="text-[13px] font-semibold text-ink2 mb-2.5">Facts the AI may use</p>
              <div className="grid @md:grid-cols-2 gap-2.5">
                {Object.entries(facts).map(([k, v]) => (
                  <label key={k} className="flex items-center gap-3 text-[14px]"><Checkbox checked={v} label={k} onChange={(x) => canEdit && setFacts((f) => ({ ...f, [k]: x }))} />{k}</label>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHead title="Approval limits" sub="Shown here, stored in Settings, Forms & Approvals" icon={I.ShieldCheck}
            action={role.access.settings === 'full' ? <Button size="sm" variant="ghost" iconRight={I.ChevronRight} onClick={() => go('settings', { page: 'forms' })}>Open</Button> : null} />
          <ul className="px-5 pb-5 flex flex-col gap-2.5 text-[14px]">
            {[['Admission decision', 'Principal'], ['Waiting-list change by hand', 'Principal'], ['Concession at admission above ₹5,000', 'Principal'], ['Fee plan exception', 'School Admin']].map(([k, v]) => (
              <li key={k} className="flex items-center justify-between gap-3"><span className="text-ink2">{k}</span><Pill tone="brand">{v}</Pill></li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

export const ADMISSIONS_PAGES = {
  dashboard: AdmDashboard,
  enquiries: Enquiries,
  applications: Applications,
  documents: Documents,
  tests: Tests,
  decision: Decision,
  reports: Reports,
  settings: AdmSettings,
};
