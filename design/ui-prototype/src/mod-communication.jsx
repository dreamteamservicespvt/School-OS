// 11 Communication: Send Message, Notice Board, WhatsApp Inbox, Message History, Feedback & Queries,
// Surveys, Message Templates, Parent Link and Message Settings. Example data only.
import React, { useMemo, useState } from 'react';
import * as I from './icons.js';
import { STUDENTS, CLASSES, CLASS_7B, FEATURED, inr } from './data.js';
import { STAFF, ROUTES, DEPARTMENTS } from './sample.js';
import { cx, Card, CardHead, Button, Pill, Avatar, Checkbox, Input, Field, Segmented, Empty, Sheet, Switch, useToast } from './ui.jsx';
import { useNav, useRole } from './shell.jsx';
import {
  ModuleHead, useCanEdit, Icon, Stats, SearchBox, Toolbar, Select, Textarea, DataList, BulkBar, Row, SettingRow, ToggleRow,
  SettingsCard, Banner, Suggestion, Progress, HBars, Bars, Legend, DL, Timeline, MoreMenu, FormSheet, ConfirmSheet, Split, Col, ExportButton,
} from './kit.jsx';

const fmt = (n) => Number(n).toLocaleString('en-IN');
const BALANCE = 18640; // message credits left
const HEADS = ['principal', 'schooladmin', 'vp'];

/* ======================= Shared sample data ======================= */

// Families per class (a family with two children counts once in each class)
const FAM = { NUR: 52, LKG: 76, UKG: 81, 1: 88, 2: 90, 3: 92, 4: 89, 5: 94, 6: 82, 7: 80, 8: 84, 9: 92, 10: 93 };
const SEC_FIX = { '7 A': 42, '7 B': 38 };
const clsShort = (id) => (id === 'NUR' ? 'Nursery' : id);
const SECTIONS = CLASSES.flatMap((c) => c.sections.map((s, i) => {
  const key = `${clsShort(c.id)} ${s}`;
  const f = FAM[c.id], n = c.sections.length;
  return { key, cls: c.id, n: SEC_FIX[key] || Math.floor(f / n) + (i < f % n ? 1 : 0) };
}));
const secFam = (k) => SECTIONS.find((s) => s.key === k)?.n || 0;
function classLabel(ids) {
  const order = CLASSES.map((c) => c.id);
  const idx = ids.map((i) => order.indexOf(i)).sort((a, b) => a - b);
  if (!idx.length) return 'no class';
  const run = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  const nm = (i) => CLASSES[i].name.replace('Class ', '');
  if (idx.length === 1) return CLASSES[idx[0]].name;
  if (run && idx[0] >= 3) return `Classes ${nm(idx[0])}–${nm(idx[idx.length - 1])}`;
  if (run) return `${nm(idx[0])}–${nm(idx[idx.length - 1])}`;
  return idx.map((i) => CLASSES[i].name).join(', ');
}

const CH = {
  WhatsApp: { icon: 'MessageCircle', label: 'WhatsApp', sub: 'Connected · 90300 66100' },
  SMS: { icon: 'MessageSquareText', label: 'SMS', sub: 'Header SUNSPS · needs a DLT template' },
  Email: { icon: 'Mail', label: 'Email', sub: 'office@sunriseps.in · free' },
  App: { icon: 'Bell', label: 'App notice', sub: 'Staff logins and Parent Link · free' },
};
const ChannelPills = ({ ch, backup }) => (
  <span className="inline-flex gap-1 flex-wrap">
    {ch.map((c) => <Pill key={c} tone={c === 'WhatsApp' ? 'ok' : c === 'SMS' ? 'info' : 'neutral'} className="!h-[22px] !text-[11.5px]"><Icon name={CH[c].icon} size={12} />{CH[c].label}</Pill>)}
    {backup && <Pill tone="warn" className="!h-[22px] !text-[11.5px]">SMS backup</Pill>}
  </span>
);

const TEMPLATES = [
  { id: 'TP01', name: 'Fee reminder', cat: 'Fees', ch: ['WhatsApp', 'SMS'], langs: ['English', 'Telugu', 'Hindi'], wa: 'Approved', dlt: '1107161765432109876', ver: 4, used: 'Fee due reminders (automatic)', text: 'Dear {parent_name}, {due_amount} is due for {student_name} ({class}) on {due_date}. Pay on your Parent Link: {pay_link}. Please ignore if already paid. – {school_name}' },
  { id: 'TP02', name: 'Fee receipt', cat: 'Fees', ch: ['WhatsApp', 'SMS'], langs: ['English', 'Telugu'], wa: 'Approved', dlt: '1107161765432109877', ver: 2, used: 'Fee paid (automatic)', text: 'Received {paid_amount} for {student_name} ({class}) on {payment_date}. Receipt {receipt_number}. Thank you. – {school_name}' },
  { id: 'TP03', name: 'Payment link', cat: 'Fees', ch: ['WhatsApp', 'SMS'], langs: ['English', 'Telugu', 'Hindi'], wa: 'Approved', dlt: '1107161765432109878', ver: 1, used: 'Collect Fee, Defaulters', text: 'Dear {parent_name}, pay {due_amount} for {student_name} ({class}) securely here: {pay_link}. The link works for 7 days. – {school_name}' },
  { id: 'TP04', name: 'Absent today', cat: 'Attendance', ch: ['WhatsApp', 'SMS'], langs: ['English', 'Telugu', 'Hindi'], wa: 'Approved', dlt: '1107161765432109881', ver: 3, used: 'Absence (automatic)', text: 'Dear Parent, {student_name} ({class}) is absent today, {date}. If this is a mistake, please call the school office. – {school_name}' },
  { id: 'TP05', name: 'Exam reminder', cat: 'Exams and results', ch: ['WhatsApp', 'SMS'], langs: ['English', 'Telugu', 'Hindi'], wa: 'Approved', dlt: '1107161987654321098', ver: 2, used: 'Exam reminders (automatic)', text: 'Dear Parent, {exam_name} for {student_name} ({class}) start on {start_date}. Reporting time {time}. The datesheet is on your Parent Link. – {school_name}' },
  { id: 'TP06', name: 'Result published', cat: 'Exams and results', ch: ['WhatsApp', 'SMS'], langs: ['English', 'Telugu'], wa: 'Approved', dlt: '1107161987654321099', ver: 1, used: 'Results (automatic)', text: 'Dear Parent, the {exam_name} report card of {student_name} ({class}) is on your Parent Link: {pay_link}. – {school_name}' },
  { id: 'TP07', name: 'PTM invitation', cat: 'Events', ch: ['WhatsApp', 'SMS'], langs: ['English', 'Telugu'], wa: 'Pending', dlt: '1107162011223344556', ver: 1, used: 'PTM reminders (automatic)', text: 'Dear Parent, the parent–teacher meeting for {class} is on {date} at {time}. Your slot with the class teacher is booked. – {school_name}' },
  { id: 'TP08', name: 'Bus running late', cat: 'Transport', ch: ['WhatsApp', 'SMS'], langs: ['English', 'Telugu'], wa: 'Approved', dlt: '', ver: 1, used: 'Transport', text: 'Dear Parent, {route} is running about {minutes} minutes late today. We are sorry for the delay. – {school_name}' },
  { id: 'TP09', name: 'Holiday notice', cat: 'General', ch: ['WhatsApp'], langs: ['English'], wa: 'Rejected', dlt: null, ver: 2, used: 'Not used', text: 'Dear Parent, the school is closed on {date} for {holiday_name}. Classes resume on {start_date}. – {school_name}' },
  { id: 'TP10', name: 'Parent Link', cat: 'Parent Link', ch: ['WhatsApp', 'SMS'], langs: ['English', 'Telugu', 'Hindi'], wa: 'Approved', dlt: '1107162099887766554', ver: 2, used: 'Admission approved (automatic)', text: 'Dear {parent_name}, see the fees, attendance and notices of your children at {school_name} here: {pay_link}. Keep this link private. – {school_name}' },
  { id: 'TP11', name: 'Admission follow-up', cat: 'Admission', ch: ['WhatsApp', 'SMS'], langs: ['English', 'Telugu'], wa: 'Approved', dlt: '1107162033445566778', ver: 1, used: 'Admission follow-ups (automatic)', text: 'Dear {parent_name}, thank you for your interest in {school_name}. The admission test for {class} is on {date}. Reply to book a school visit. – {school_name}' },
  { id: 'TP12', name: 'Homework pending', cat: 'General', ch: ['WhatsApp', 'SMS'], langs: ['English'], wa: 'Approved', dlt: '', ver: 1, used: 'Pending homework (automatic)', text: 'Dear Parent, {student_name} ({class}) has not submitted {subject} homework due on {date}. – {school_name}' },
  { id: 'TP13', name: 'Birthday wishes', cat: 'General', ch: ['WhatsApp'], langs: ['English', 'Telugu'], wa: 'Approved', dlt: null, ver: 1, used: 'Birthday wishes (automatic)', text: 'Happy birthday, {student_name}! Wishing you a wonderful year ahead. – Everyone at {school_name}' },
  { id: 'TP14', name: 'Trip consent', cat: 'Events', ch: ['WhatsApp', 'SMS'], langs: ['English', 'Telugu', 'Hindi'], wa: 'Approved', dlt: '1107162055667788990', ver: 1, used: 'Events', text: 'Dear Parent, please give consent for {student_name} ({class}) to join the {event_name} on {date}, fee {due_amount}, on your Parent Link by {due_date}. – {school_name}' },
];
const VARS = ['{parent_name}', '{student_name}', '{class}', '{due_amount}', '{due_date}', '{pay_link}', '{receipt_number}', '{paid_amount}', '{payment_date}', '{date}', '{time}', '{school_name}'];

function fill(text, p = {}) {
  const v = {
    parent_name: p.name, staff_name: p.name, student_name: p.student, class: p.cls, due_amount: inr(p.due || 18500), due_date: '10 Oct 2026', pay_link: 'sps.link/p/7Kq2', school_name: 'Sunrise Public School',
    exam_name: 'Half-yearly exams', start_date: 'Mon 12 Oct', time: '8:15 AM', receipt_number: 'R/26/05191', paid_amount: inr(18500), payment_date: '9 Oct 2026',
    date: 'Sat 17 Oct', route: 'Route 4 · Miyapur', minutes: '20', holiday_name: 'Dussehra', subject: 'Maths', event_name: 'Wonderla picnic',
  };
  return text.replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m));
}
// Shows {variables} as small highlighted blanks
function VarText({ text }) {
  return <>{text.split(/(\{\w+\})/g).map((part, i) => /^\{\w+\}$/.test(part) ? <span key={i} className="px-1 rounded-md bg-brand/10 text-brand font-semibold">{part}</span> : <span key={i}>{part}</span>)}</>;
}

// Messages typed by each kind of sender, with the AI translations shown for checking
const MSGS = {
  exam: {
    type: 'Exams and results', title: 'Half-yearly exams start Monday', file: 'Datesheet-Half-yearly-2026.pdf',
    en: 'Dear Parent, the half-yearly exams of {student_name} ({class}) start on Monday, 12 October. Reporting time is 8:15 AM. Please send the hall ticket and two pencils. The datesheet is on your Parent Link. – Sunrise Public School',
    Telugu: 'ప్రియమైన తల్లిదండ్రులకు, {student_name} ({class}) అర్ధ వార్షిక పరీక్షలు సోమవారం, 12 అక్టోబర్ నుండి ప్రారంభమవుతాయి. ఉదయం 8:15 కి హాజరు కావాలి. దయచేసి హాల్ టికెట్ మరియు రెండు పెన్సిళ్లు పంపండి. పరీక్షల తేదీలు మీ Parent Link లో ఉన్నాయి. – సన్‌రైజ్ పబ్లిక్ స్కూల్',
    Hindi: 'प्रिय अभिभावक, {student_name} ({class}) की अर्धवार्षिक परीक्षाएँ सोमवार, 12 अक्टूबर से शुरू होंगी। रिपोर्टिंग समय सुबह 8:15 बजे है। कृपया हॉल टिकट और दो पेंसिल भेजें। डेटशीट आपके Parent Link पर है। – सनराइज़ पब्लिक स्कूल',
  },
  lunch: {
    type: 'General', title: 'Lunch box at reception',
    en: 'Dear Parent, the lunch box of {student_name} ({class}) is at the reception. We will hand it over in the 12:40 PM lunch break. – Sunrise Public School',
    Telugu: 'ప్రియమైన తల్లిదండ్రులకు, {student_name} ({class}) లంచ్ బాక్స్ రిసెప్షన్‌లో ఉంది. మధ్యాహ్నం 12:40 భోజన విరామంలో అందజేస్తాము. – సన్‌రైజ్ పబ్లిక్ స్కూల్',
    Hindi: 'प्रिय अभिभावक, {student_name} ({class}) का लंच बॉक्स रिसेप्शन पर है। दोपहर 12:40 के भोजन अवकाश में दे दिया जाएगा। – सनराइज़ पब्लिक स्कूल',
  },
  bus: {
    type: 'Transport', title: 'Bus 4 running late',
    en: 'Dear Parent, Bus 4 (Route 4, Miyapur) is running about 20 minutes late this afternoon because of traffic at Miyapur X Roads. It will reach your stop about 20 minutes later than usual. – Sunrise Public School Transport',
    Telugu: 'ప్రియమైన తల్లిదండ్రులకు, మియాపూర్ X రోడ్స్ వద్ద ట్రాఫిక్ కారణంగా బస్ 4 (రూట్ 4, మియాపూర్) ఈ మధ్యాహ్నం సుమారు 20 నిమిషాలు ఆలస్యంగా నడుస్తోంది. మీ స్టాప్‌కు సాధారణం కంటే 20 నిమిషాలు ఆలస్యంగా చేరుతుంది. – సన్‌రైజ్ పబ్లిక్ స్కూల్ ట్రాన్స్‌పోర్ట్',
    Hindi: 'प्रिय अभिभावक, मियापुर X रोड्स पर ट्रैफ़िक के कारण बस 4 (रूट 4, मियापुर) आज दोपहर लगभग 20 मिनट देरी से चल रही है। बस आपके स्टॉप पर सामान्य से लगभग 20 मिनट देर से पहुँचेगी। – सनराइज़ पब्लिक स्कूल ट्रांसपोर्ट',
  },
  bonafide: {
    type: 'General', title: 'Bonafide certificate ready',
    en: 'Dear Parent, the bonafide certificate of {student_name} ({class}) is ready. Please collect it from the school office between 9:00 AM and 4:00 PM. – Sunrise Public School',
    Telugu: 'ప్రియమైన తల్లిదండ్రులకు, {student_name} ({class}) బోనఫైడ్ సర్టిఫికేట్ సిద్ధంగా ఉంది. దయచేసి ఉదయం 9:00 నుండి సాయంత్రం 4:00 మధ్య స్కూల్ ఆఫీసు నుండి తీసుకోండి. – సన్‌రైజ్ పబ్లిక్ స్కూల్',
    Hindi: 'प्रिय अभिभावक, {student_name} ({class}) का बोनाफ़ाइड प्रमाणपत्र तैयार है। कृपया सुबह 9:00 से शाम 4:00 बजे के बीच स्कूल कार्यालय से ले लें। – सनराइज़ पब्लिक स्कूल',
  },
  meet: {
    type: 'General', title: 'Meeting request',
    en: 'Dear Parent, I would like to meet you about how {student_name} is settling in this term. Could you come on Thursday, 15 October at 2:30 PM? Please reply on this number. – Sana Ali, School Counsellor',
    Telugu: 'ప్రియమైన తల్లిదండ్రులకు, ఈ టర్మ్‌లో {student_name} ఎలా అలవాటు పడుతున్నారో మీతో మాట్లాడాలనుకుంటున్నాను. గురువారం, 15 అక్టోబర్ మధ్యాహ్నం 2:30 కి రాగలరా? దయచేసి ఈ నంబర్‌కు జవాబు ఇవ్వండి. – సనా అలీ, స్కూల్ కౌన్సిలర్',
    Hindi: 'प्रिय अभिभावक, मैं इस टर्म में {student_name} के बारे में आपसे मिलना चाहती हूँ। क्या आप गुरुवार, 15 अक्टूबर को दोपहर 2:30 बजे आ सकते हैं? कृपया इसी नंबर पर जवाब दें। – सना अली, स्कूल काउंसलर',
  },
  staffleave: { type: 'General', title: 'Diwali leave plans', en: 'Dear {staff_name}, please enter your leave plans for the Diwali week (6–10 November) in School OS by Thursday, 15 October, so that substitutions can be arranged in time. – Shalini Verma, HR' },
  marks: { type: 'Exams and results', title: 'Half-yearly evaluation dates', en: 'Dear {staff_name}, marks entry for the half-yearly exams opens on 17 October. Please finish evaluating and entering marks by Wednesday, 28 October. – Meena Pillai, Academic Head' },
};

const AUD = {
  school: { label: 'Whole school', icon: 'School' },
  classes: { label: 'Classes', icon: 'GraduationCap' },
  sections: { label: 'Sections', icon: 'LayoutGrid' },
  route: { label: 'Bus route', icon: 'Bus' },
  defaulters: { label: 'Fee defaulters', icon: 'UserX' },
  staff: { label: 'Staff', icon: 'Users' },
  single: { label: 'One parent', icon: 'User' },
  enquiries: { label: 'Enquiry families', icon: 'PhoneIncoming' },
};
const FULL = { aud: ['school', 'classes', 'sections', 'route', 'defaulters', 'staff', 'single'], def: 'classes', msg: 'exam', classes: ['6', '7', '8', '9', '10'] };
// Own access: what each role may reach (05-roles.md). Only these audiences are offered.
const SCOPE = {
  accountant: { sub: 'Only fee reminders, receipts and payment links to parents', aud: ['defaulters', 'classes', 'single'], def: 'defaulters', tpl: 'TP01', types: ['Fees'], ch: ['WhatsApp'] },
  teacher: { sub: 'Only parents of the students you teach: 6 A, 6 B, 7 A and 7 B', aud: ['sections', 'single'], def: 'sections', secs: ['6 A', '6 B', '7 A', '7 B'], defSecs: ['6 A', '6 B', '7 A', '7 B'], msg: 'exam' },
  classteacher: { sub: 'Only parents of 7 B, and of the students you teach Science in 7 A and 8 B', aud: ['sections', 'single'], def: 'sections', secs: ['7 B', '7 A', '8 B'], defSecs: ['7 B'], msg: 'exam' },
  receptionist: { sub: 'Messages to parents: one parent, or the parents of a section', aud: ['single', 'sections'], def: 'single', msg: 'lunch' },
  transport: { sub: 'Only parents of a bus route, including emergency messages', aud: ['route'], def: 'route', msg: 'bus' },
  hr: { sub: 'Only staff: everyone or a department', aud: ['staff'], def: 'staff', msg: 'staffleave', ch: ['App', 'Email'] },
  officestaff: { sub: 'Messages to parents about leave, certificates and admit cards', aud: ['single', 'sections'], def: 'single', msg: 'bonafide' },
  examincharge: { sub: 'Only exam messages to parents of Classes 6–10', aud: ['classes'], def: 'classes', classOnly: ['6', '7', '8', '9', '10'], msg: 'exam' },
  admissioncounsellor: { sub: 'Only families with an open admission enquiry', aud: ['enquiries', 'single'], def: 'enquiries', tpl: 'TP11', types: ['Admission'], ch: ['WhatsApp'] },
  counsellor: { sub: 'Only parents of the students in your counselling cases', aud: ['single'], def: 'single', msg: 'meet', single: 'kabir' },
  academichead: { sub: 'Teachers, and parents about academic work', aud: ['staff', 'classes'], def: 'staff', msg: 'marks', depts: ['Teaching'], ch: ['App'] },
};
const TYPES = ['General', 'Fees', 'Attendance', 'Exams and results', 'Transport', 'Events', 'Admission'];
const BACKUP_TYPES = ['Fees', 'Attendance', 'Exams and results'];
const LANGS = ['English', 'Telugu', 'Hindi'];
const KABIR = STUDENTS.find((s) => s.first === 'Kabir') || STUDENTS[4];
const secOf = (s) => `${clsShort(s.clsId)} ${s.sec}`;
const parentOf = (s, i = 0) => ({
  name: s.id === FEATURED.id ? 'Priya Sharma' : s.father, rel: `${s.id === FEATURED.id ? 'Mother' : 'Father'} of ${s.name}`, student: s.name, cls: secOf(s),
  lang: s.id === FEATURED.id ? 'English' : LANGS[i % 3], due: s.due || 18500, phone: s.id === FEATURED.id ? '98495 60211' : s.phone, sid: s.id,
});

/* ======================= Send Message ======================= */
function SendMessage({ access }) {
  const { role } = useRole();
  const { go } = useNav();
  const toast = useToast();
  const full = access === 'full';
  const sc = full ? FULL : SCOPE[role.id] || SCOPE.officestaff;
  const m0 = MSGS[sc.msg] || null;
  const tpl0 = sc.tpl || 'none';
  const T0 = TEMPLATES.find((t) => t.id === tpl0);
  const [aud, setAud] = useState(sc.def);
  const [classes, setClasses] = useState(sc.classOnly || sc.classes || ['6', '7', '8', '9', '10']);
  const [secs, setSecs] = useState(sc.defSecs || ['7 B']);
  const [route, setRoute] = useState('R4');
  const [depts, setDepts] = useState(sc.depts || ['all']);
  const [late, setLate] = useState('all');
  const [single, setSingle] = useState(sc.single === 'kabir' ? KABIR.id : FEATURED.id);
  const [q, setQ] = useState('');
  const [ch, setCh] = useState(sc.ch || ['WhatsApp', 'App']);
  const [type, setType] = useState(T0 ? T0.cat : m0?.type || 'General');
  const [tpl, setTpl] = useState(tpl0);
  const [backup, setBackup] = useState(true);
  const [title, setTitle] = useState(T0 ? T0.name : m0?.title || '');
  const [msg, setMsg] = useState(m0?.en || '');
  const [file, setFile] = useState(m0?.file || null);
  const [lang, setLang] = useState('each');
  const [tr, setTr] = useState(!!m0?.Telugu);
  const [trs, setTrs] = useState({ Telugu: m0?.Telugu || '', Hindi: m0?.Hindi || '' });
  const [trTab, setTrTab] = useState('Telugu');
  const [trOk, setTrOk] = useState(false);
  const [when, setWhen] = useState('now');
  const [sDate, setSDate] = useState('10-10-2026');
  const [sTime, setSTime] = useState('07:30 AM');
  const [pi, setPi] = useState(0);
  const [tried, setTried] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [emer, setEmer] = useState(false);
  const [emerText, setEmerText] = useState('School will close at 12:30 PM today because of heavy rain warnings. Please pick up your children from the main gate between 12:30 and 1:30 PM. Buses run at 12:45 PM.');
  const [routeEm, setRouteEm] = useState(false);
  const [emPick, setEmPick] = useState(0);
  const [group, setGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [sent, setSent] = useState(null);

  const staffAud = aud === 'staff';
  const T = TEMPLATES.find((t) => t.id === tpl);
  const body = T ? T.text : msg;
  const singleS = STUDENTS.find((s) => s.id === single) || FEATURED;
  const audOpts = sc.aud;
  const secOpts = sc.secs || SECTIONS.map((s) => s.key);
  const classOpts = sc.classOnly || CLASSES.map((c) => c.id);

  const count = useMemo(() => {
    let n = 0, label = '';
    if (aud === 'school') { n = 1018; label = 'All families, Nursery to Class 10'; }
    if (aud === 'classes') { n = classes.reduce((a, c) => a + FAM[c], 0); label = `Families of ${classLabel(classes)}`; }
    if (aud === 'sections') { n = secs.reduce((a, s) => a + secFam(s), 0); label = `Families of ${secs.join(', ') || 'no section'}`; }
    if (aud === 'route') { const r = ROUTES.find((x) => x.id === route); n = r.students - Math.round(r.students * 0.06); label = `Families on ${r.name}`; }
    if (aud === 'defaulters') { n = late === 'all' ? 61 : 18; label = late === 'all' ? 'Families with fees overdue' : 'Families more than 30 days late'; }
    if (aud === 'staff') { n = depts.includes('all') ? 86 : DEPARTMENTS.filter((d) => depts.includes(d.k)).reduce((a, d) => a + d.n, 0); label = depts.includes('all') ? 'All staff' : `Staff in ${depts.join(', ')}`; }
    if (aud === 'single') { n = 1; label = `${parentOf(singleS).name}, ${parentOf(singleS).rel.toLowerCase()}`; }
    if (aud === 'enquiries') { n = 48; label = 'Families with an open enquiry for 2027–28'; }
    const opted = staffAud || aud === 'single' || aud === 'enquiries' ? 0 : Math.round(n * 0.0325);
    const noPhone = staffAud || aud === 'single' ? 0 : Math.round(n * 0.0116);
    return { matched: n, opted, noPhone, n: n - opted - noPhone, label };
  }, [aud, classes, secs, route, late, depts, singleS, staffAud]);
  const n = count.n;
  const noun = staffAud ? 'staff' : aud === 'enquiries' ? (n === 1 ? 'family' : 'families') : n === 1 ? 'parent' : 'parents';

  const people = useMemo(() => {
    if (staffAud) return STAFF.filter((s) => depts.includes('all') || depts.includes(s.dept)).slice(0, 3).map((s) => ({ name: s.name, rel: s.desig, lang: 'English' }));
    if (aud === 'single') return [parentOf(singleS)];
    if (aud === 'enquiries') return [{ name: 'Swathi Varma', rel: 'Enquiry for Nursery 2027–28', student: 'Ishita Varma', cls: 'Nursery', lang: 'English' }, { name: 'Ramesh Goud', rel: 'Enquiry for Class 1 2027–28', student: 'Charan Goud', cls: 'Class 1', lang: 'Telugu' }];
    const inScope = (s) => (aud === 'classes' ? classes.includes(s.clsId) : aud === 'sections' ? secs.includes(secOf(s)) : aud === 'defaulters' ? s.feeState === 'Overdue' : true);
    const list = [FEATURED, ...STUDENTS.filter((s) => s.id !== FEATURED.id)].filter(inScope).slice(0, 3);
    return list.map((s, i) => parentOf(s, i));
  }, [aud, classes, secs, singleS, depts, staffAud]);
  const p = people[Math.min(pi, people.length - 1)] || people[0];

  const langCount = { Telugu: Math.round(n * 0.342), Hindi: Math.round(n * 0.08) };
  langCount.English = n - langCount.Telugu - langCount.Hindi;
  const canTranslate = !T && !staffAud && lang === 'each' && trs.Telugu;
  const backupOk = BACKUP_TYPES.includes(type);
  const parts = T ? 1 : Math.max(1, Math.ceil(body.length / 153));
  const waN = ch.includes('WhatsApp') ? n : 0;
  const smsN = ch.includes('SMS') ? n * parts : 0;
  const bkN = ch.includes('WhatsApp') && backup && backupOk ? n : 0;
  const total = waN + smsN + bkN;
  const missing = T && T.text.includes('{due_amount}') && !['defaulters', 'single'].includes(aud) ? n - Math.round(n * 0.14) : 0;
  const err = {
    who: n === 0 ? (aud === 'sections' ? 'Choose at least one section' : aud === 'classes' ? 'Choose at least one class' : 'Choose a department') : '',
    ch: !ch.length ? 'Choose at least one way to send' : '',
    sms: ch.includes('SMS') && (!T || !T.dlt) ? (T ? 'This SMS template has no DLT template ID. Add it in Message Templates, or untick SMS.' : 'An SMS can only be sent from a template with a DLT template ID. Pick a template, or untick SMS.') : '',
    title: (ch.includes('Email') || ch.includes('App')) && !title.trim() ? 'Add a title. Email and app notices show it at the top.' : '',
    msg: !body.trim() ? 'Type the message' : body.length > 1000 ? `Keep it under 1,000 characters. It has ${fmt(body.length)}.` : '',
    credits: total > BALANCE ? `Needs ${fmt(total)} credits. You have ${fmt(BALANCE)}.` : '',
  };
  const valid = !Object.values(err).some(Boolean);
  const sendLabel = when === 'now' ? `Send to ${fmt(n - missing)} ${noun}` : `Schedule for ${fmt(n - missing)} ${noun}`;
  const togCh = (c) => { setCh((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c])); };
  const pickTpl = (id) => {
    setTpl(id);
    const t = TEMPLATES.find((x) => x.id === id);
    if (t) setTitle(t.name); else { setTitle(m0?.title || ''); }
  };
  const tplOpts = [{ value: 'none', label: 'None, type my own message' }, ...TEMPLATES.filter((t) => (sc.types ? sc.types.includes(t.cat) : t.cat === type || type === 'General') && (!ch.includes('SMS') || t.dlt)).map((t) => ({ value: t.id, label: `${t.name}${t.dlt ? ` · DLT ${t.dlt.slice(-6)}` : ''}` }))];
  const trySend = () => { setTried(true); if (valid) setConfirm(true); };
  const doSend = () => {
    if (when === 'now') { setSent({ n: n - missing, noun, at: '10:44 AM' }); toast({ title: `Sending to ${fmt(n - missing)} ${noun}`, body: 'Delivered and read counts update in Message History.' }); }
    else { setSent({ n: n - missing, noun, sched: `${sDate}, ${sTime}` }); toast({ title: `Scheduled for ${sDate}, ${sTime}`, body: 'You can cancel it until it goes.', tone: 'info' }); }
  };
  const isHead = role.id === 'principal' || role.id === 'schooladmin';
  const EM = ['Bus 4 is running about 30 minutes late. Children are safe on the bus.', 'Bus 4 has broken down near Miyapur Metro. A second bus is on the way. Children are safe.', 'Bus 4 reached school safely after the delay.', 'Bus 4 will not run tomorrow. Please drop your child at school.'];
  const routeObj = ROUTES.find((r) => r.id === route);
  const routeN = routeObj.students - Math.round(routeObj.students * 0.06) - Math.round((routeObj.students - Math.round(routeObj.students * 0.06)) * 0.0116);

  return (
    <div>
      <ModuleHead sub={full ? 'By class, section, bus route or group. Count and cost shown before anything goes.' : sc.sub}
        actions={<>
          {full && <Button variant="secondary" icon={I.Bookmark} className="hidden @md:inline-flex" onClick={() => toast({ title: 'Saved groups', body: 'Class 10 parents, Sports team parents, Bus students, Hostel parents. Pick one under Who gets it.', tone: 'info' })}>Saved groups</Button>}
          {isHead && <Button variant="dangerSoft" icon={I.Siren} onClick={() => setEmer(true)}>Emergency broadcast</Button>}
          {role.id === 'transport' && <Button variant="dangerSoft" icon={I.Siren} onClick={() => setRouteEm(true)}>Route emergency</Button>}
        </>} />

      {sent && (
        <Banner tone={sent.sched ? 'info' : 'ok'} className="mb-5" title={sent.sched ? `Scheduled for ${sent.sched}:` : `Sent at ${sent.at}:`}
          action={sent.sched
            ? <Button size="sm" variant="secondary" onClick={() => { setSent(null); toast({ title: 'Scheduled message cancelled', body: 'It will not be sent.', tone: 'info' }); }}>Cancel it</Button>
            : <Button size="sm" variant="secondary" onClick={() => go('communication', { page: 'history', id: 'M-26-1190' })}>Track</Button>}>
          {sent.sched ? `${fmt(sent.n)} ${sent.noun}. You can cancel it until it goes.` : `${fmt(sent.n)} ${sent.noun}. Delivered and read counts are in Message History.`}
        </Banner>
      )}

      <Split side={380}>
        <Col>
          {/* 1. Who */}
          <Card>
            <CardHead title="1. Who gets it" sub={full ? 'Pick one group. Anyone who opted out is left out, except in an emergency.' : 'Only the people you are allowed to message are offered.'} icon={I.Users} />
            <div className="px-5 pb-5 flex flex-col gap-4">
              <div className={cx('grid gap-2', audOpts.length > 3 ? 'grid-cols-2 @md:grid-cols-4' : audOpts.length === 1 ? 'grid-cols-1' : 'grid-cols-2 @md:grid-cols-3')} role="radiogroup" aria-label="Who gets it">
                {audOpts.map((a) => (
                  <button key={a} role="radio" aria-checked={aud === a} onClick={() => { setAud(a); setPi(0); }}
                    className={cx('h-14 rounded-xl border flex items-center gap-2.5 px-3 text-left text-[13.5px] font-semibold transition', aud === a ? 'border-brand bg-brand/8 text-brand ring-1 ring-brand' : 'border-line text-ink2 hover:border-ink3/50')}>
                    <Icon name={AUD[a].icon} size={18} className="shrink-0" />{AUD[a].label}
                  </button>
                ))}
              </div>
              {aud === 'school' && <p className="text-[13.5px] text-ink2">All <b className="font-semibold">1,018 families</b> of 1,236 students, Nursery to Class 10. A family with two children gets one message.</p>}
              {aud === 'classes' && (
                <div>
                  <p className="text-[13px] font-semibold text-ink2 mb-2">Classes <span className="text-ink3 font-normal">· families in each</span></p>
                  <Toggles options={classOpts.map((id) => ({ value: id, label: CLASSES.find((c) => c.id === id).name, count: FAM[id] }))} value={classes} onToggle={(v) => setClasses((x) => (x.includes(v) ? x.filter((y) => y !== v) : [...x, v]))} />
                </div>
              )}
              {aud === 'sections' && (
                <div>
                  <p className="text-[13px] font-semibold text-ink2 mb-2">{full ? 'Sections' : 'Your sections'} <span className="text-ink3 font-normal">· families in each</span></p>
                  <Toggles options={secOpts.map((k) => ({ value: k, label: k, count: secFam(k) }))} value={secs} onToggle={(v) => setSecs((x) => (x.includes(v) ? x.filter((y) => y !== v) : [...x, v]))} />
                  {!full && <p className="text-[12.5px] text-ink3 mt-2">Other classes are not offered. To reach them, ask the office.</p>}
                </div>
              )}
              {aud === 'route' && (
                <ul className="grid grid-cols-1 @md:grid-cols-2 gap-2">
                  {ROUTES.map((r) => (
                    <li key={r.id}>
                      <button onClick={() => setRoute(r.id)} aria-pressed={route === r.id}
                        className={cx('w-full flex items-center gap-3 p-3 rounded-xl border text-left transition', route === r.id ? 'border-brand bg-brand/5 ring-1 ring-brand' : 'border-line hover:border-ink3/50')}>
                        <span className="w-9 h-9 rounded-lg bg-sunken grid place-items-center shrink-0"><I.Bus size={17} /></span>
                        <span className="min-w-0 flex-1"><span className="block font-semibold text-[14px] truncate">{r.name}</span><span className="block text-[12.5px] text-ink3">{r.bus} · {r.students} students · {r.driver}</span></span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {aud === 'defaulters' && (
                <div className="flex flex-col gap-2">
                  <Segmented value={late} onChange={setLate} options={[{ value: 'all', label: 'All overdue · 61' }, { value: '30', label: 'Over 30 days · 18' }]} className="self-start" />
                  <p className="text-[12.5px] text-ink3">From Fees, Defaulters. Each parent sees their own due amount and a payment link.</p>
                </div>
              )}
              {aud === 'staff' && (
                <div>
                  <p className="text-[13px] font-semibold text-ink2 mb-2">Departments</p>
                  <Toggles options={[{ value: 'all', label: 'All staff', count: 86 }, ...DEPARTMENTS.map((d) => ({ value: d.k, label: d.k, count: d.n }))]} value={depts}
                    onToggle={(v) => setDepts((x) => (v === 'all' ? ['all'] : x.includes(v) ? x.filter((y) => y !== v) : [...x.filter((y) => y !== 'all'), v]))} />
                </div>
              )}
              {aud === 'enquiries' && <p className="text-[13.5px] text-ink2"><b className="font-semibold">48 families</b> with an open enquiry for 2027–28. Families who joined or dropped out are left out.</p>}
              {aud === 'single' && (
                <div className="flex flex-col gap-2">
                  <SearchBox value={q} onChange={setQ} placeholder="Student or parent name, or phone" id="send-single" />
                  {q.trim() ? (
                    <ul className="flex flex-col">
                      {STUDENTS.filter((s) => (sc.secs ? sc.secs.includes(secOf(s)) : true) && (s.name.toLowerCase().includes(q.toLowerCase()) || s.father.toLowerCase().includes(q.toLowerCase()))).slice(0, 5).map((s) => (
                        <li key={s.id}><Row avatar={parentOf(s).name} title={parentOf(s).name} sub={`${parentOf(s).rel}, ${secOf(s)} · ${parentOf(s).phone}`} onClick={() => { setSingle(s.id); setQ(''); }} /></li>
                      ))}
                    </ul>
                  ) : (
                    <div className="rounded-xl border border-line p-3 flex items-center gap-3">
                      <Avatar name={parentOf(singleS).name} size={40} />
                      <div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px] truncate">{parentOf(singleS).name}</p><p className="text-[12.5px] text-ink3 truncate">{parentOf(singleS).rel}, {secOf(singleS)} · {parentOf(singleS).phone}</p></div>
                      <Pill tone="brand">{parentOf(singleS).lang}</Pill>
                    </div>
                  )}
                </div>
              )}
              {tried && err.who && <p className="text-[12.5px] text-bad flex items-center gap-1.5" role="alert"><I.CircleAlert size={14} />{err.who}</p>}
            </div>
          </Card>

          {/* 2. What */}
          <Card>
            <CardHead title="2. What and how" sub="WhatsApp first. SMS needs an approved template with a DLT template ID." icon={I.MessageSquareText} />
            <div className="px-5 pb-5 flex flex-col gap-4">
              <div>
                <p className="text-[13px] font-semibold text-ink2 mb-1.5">Send by <span className="text-bad">*</span></p>
                <div className="grid grid-cols-2 @lg:grid-cols-4 gap-2">
                  {Object.entries(CH).map(([id, c]) => {
                    const on = ch.includes(id);
                    return (
                      <button key={id} aria-pressed={on} onClick={() => togCh(id)}
                        className={cx('rounded-xl border p-3 text-left transition flex flex-col gap-1', on ? 'border-brand bg-brand/8 ring-1 ring-brand' : 'border-line hover:border-ink3/50')}>
                        <span className={cx('flex items-center gap-2 text-[14px] font-semibold', on ? 'text-brand' : 'text-ink')}><Icon name={c.icon} size={17} />{c.label}{on && <I.Check size={15} strokeWidth={3} className="ml-auto" />}</span>
                        <span className="text-[11.5px] text-ink3 leading-snug">{c.sub}</span>
                      </button>
                    );
                  })}
                </div>
                {tried && err.ch && <p className="text-[12.5px] text-bad mt-1.5 flex items-center gap-1.5" role="alert"><I.CircleAlert size={14} />{err.ch}</p>}
              </div>
              {ch.includes('WhatsApp') && (
                <div className={cx('rounded-xl p-3.5 flex items-start gap-3', backupOk ? 'bg-sunken/70' : 'bg-sunken/40')}>
                  <div className="pt-0.5"><Checkbox id="send-backup" checked={backup && backupOk} onChange={(v) => backupOk && setBackup(v)} label="If not delivered or read, also send by SMS" /></div>
                  <label htmlFor="send-backup" className={cx('text-[14px]', !backupOk && 'opacity-60')}>
                    <b className="font-semibold">If not delivered or read, also send by SMS</b>
                    <span className="block text-[12.5px] text-ink3 mt-0.5">{backupOk ? 'After 2 hours, anyone whose WhatsApp failed or is unread gets the approved SMS version (DLT 1107161987654321098). Counted in the cost.' : 'SMS backup is for fee, attendance and result messages only.'}</span>
                  </label>
                </div>
              )}
              <div className="grid grid-cols-1 @md:grid-cols-2 gap-3">
                <Field label="Message type" id="send-type" hint={backupOk ? 'SMS backup is on for this type in Message Settings' : 'Sets which templates are offered'}>
                  <Select id="send-type" value={type} onChange={(v) => { setType(v); setTpl('none'); setTitle(m0?.title || ''); }} options={sc.types || TYPES} />
                </Field>
                <Field label="Template" id="send-tpl" required={ch.includes('SMS')} hint={ch.includes('SMS') ? 'Only templates with a DLT template ID are offered for SMS' : 'Optional for WhatsApp, email and app'}>
                  <Select id="send-tpl" value={tpl} onChange={pickTpl} options={tplOpts} error={tried && !!err.sms} />
                </Field>
              </div>
              {tried && err.sms && <p className="text-[12.5px] text-bad -mt-2 flex items-center gap-1.5" role="alert"><I.CircleAlert size={14} />{err.sms}</p>}
              <Field label="Title" id="send-title" required={ch.includes('Email') || ch.includes('App')} error={tried && err.title}>
                <Input id="send-title" value={title} onChange={(e) => setTitle(e.target.value)} error={tried && err.title} placeholder="Shown at the top of an email or app notice" />
              </Field>
              {T ? (
                <div>
                  <p className="text-[13px] font-semibold text-ink2 mb-1.5">Message</p>
                  <div className="rounded-xl bg-sunken/70 border border-line p-3.5 text-[14.5px] leading-relaxed"><VarText text={T.text} /></div>
                  <p className="text-[12.5px] text-ink3 mt-1.5 flex gap-1.5"><I.Lock size={14} className="shrink-0 mt-0.5" />Approved template, version {T.ver}. The text is locked; only the blanks fill in for each person. Languages: {T.langs.join(', ')}.</p>
                </div>
              ) : (
                <Field label="Message" required id="send-msg" error={tried && err.msg} hint={`${fmt(body.length)} of 1,000 characters${ch.includes('SMS') ? ` · ${parts} SMS parts` : ''} · {student_name} and {class} fill in for each parent`}>
                  <Textarea id="send-msg" value={msg} onChange={setMsg} rows={5} />
                </Field>
              )}
              {(ch.includes('WhatsApp') || ch.includes('Email')) && (
                file ? (
                  <div className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
                    <span className="w-9 h-9 rounded-lg bg-sunken text-ink2 grid place-items-center shrink-0"><I.FileText size={17} /></span>
                    <span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold truncate">{file}</span><span className="block text-[12px] text-ink3">PDF · 212 KB · WhatsApp and email only</span></span>
                    <Button size="sm" variant="ghost" onClick={() => setFile(null)}>Remove</Button>
                  </div>
                ) : <Button variant="secondary" icon={I.Paperclip} className="self-start" onClick={() => setFile('Datesheet-Half-yearly-2026.pdf')}>Attach a file</Button>
              )}
              {!staffAud && (
                <Field label="Language" id="send-lang" hint={T ? "Each parent gets the template's approved version in their language." : `${fmt(langCount.English)} English · ${fmt(langCount.Telugu)} Telugu · ${fmt(langCount.Hindi)} Hindi`}>
                  <Select id="send-lang" value={lang} onChange={setLang} options={[{ value: 'each', label: "Each parent's own language" }, { value: 'en', label: 'English for everyone' }]} />
                </Field>
              )}
              {canTranslate && (
                <div className="rounded-xl bg-sunken/70 p-3.5 flex items-center gap-3">
                  <Switch id="send-tr" on={tr} onChange={(v) => { setTr(v); setTrOk(false); }} label="Translate into each parent's language" />
                  <label htmlFor="send-tr" className="text-[14px] flex-1"><b className="font-semibold">Translate into each parent's language</b><span className="block text-[12.5px] text-ink3">Check each version before sending. Parents see “Translated from English”.</span></label>
                </div>
              )}
            </div>
          </Card>

          {canTranslate && tr && (
            <Suggestion title={`Telugu and Hindi versions for ${fmt(langCount.Telugu + langCount.Hindi)} parents`} source="your English message and the language saved for each parent"
              actions={<>
                <Button size="sm" variant={trOk ? 'secondary' : 'soft'} icon={I.Check} onClick={() => { setTrOk(true); toast({ title: 'Translations checked', body: 'They go out with the label “Translated from English”.' }); }}>{trOk ? 'Checked' : 'I have checked them'}</Button>
                <Button size="sm" variant="ghost" icon={I.RefreshCw} onClick={() => { setTrs({ Telugu: m0.Telugu, Hindi: m0.Hindi }); setTrOk(false); toast({ title: 'Translated again from your English text', tone: 'info' }); }}>Translate again</Button>
                <Button size="sm" variant="ghost" onClick={() => setTr(false)}>Send in English only</Button>
              </>}>
              <Segmented size="sm" value={trTab} onChange={setTrTab} options={[{ value: 'Telugu', label: `Telugu · ${langCount.Telugu}` }, { value: 'Hindi', label: `Hindi · ${langCount.Hindi}` }]} className="mb-2.5" />
              <Textarea id="send-tr-text" value={trs[trTab]} onChange={(v) => { setTrs({ ...trs, [trTab]: v }); setTrOk(false); }} rows={5} className="!text-[14.5px] leading-relaxed" />
              <p className="text-[12.5px] text-ink3 mt-1.5">You can edit the text. Names and class fill in for each parent.</p>
            </Suggestion>
          )}

          {/* When */}
          <Card>
            <CardHead title="When" sub="A scheduled message can be cancelled until it goes" icon={I.Clock} />
            <div className="px-5 pb-5 flex flex-col gap-3">
              <Segmented value={when} onChange={setWhen} options={[{ value: 'now', label: 'Send now', icon: I.Send }, { value: 'later', label: 'Schedule', icon: I.CalendarClock }]} className="self-start" />
              {when === 'later' && (
                <div className="grid grid-cols-2 gap-3 max-w-md">
                  <Field label="Date" id="send-date" hint="DD-MM-YYYY"><Input id="send-date" value={sDate} onChange={(e) => setSDate(e.target.value)} className="tnum" /></Field>
                  <Field label="Time" id="send-time" hint="Quiet hours 9 PM–7 AM"><Input id="send-time" value={sTime} onChange={(e) => setSTime(e.target.value)} className="tnum" /></Field>
                </div>
              )}
            </div>
          </Card>
        </Col>

        {/* 3. Check and send */}
        <Col className="@xl:sticky @xl:top-0">
          <Card className="overflow-hidden">
            <CardHead title="3. Check and send" sub="Exactly who, how much, and what they will see" icon={I.ListChecks} />
            <div className="px-5 pb-4">
              <p className="eyebrow text-ink3">Users to notify</p>
              <p className="font-display text-[34px] font-semibold tnum leading-tight">{fmt(n - missing)} <span className="text-[16px] text-ink3 font-sans font-semibold">{noun}</span></p>
              <ul className="mt-2 flex flex-col gap-1.5 text-[13px] text-ink2">
                <li className="flex gap-2"><I.Users size={15} className="text-ink3 shrink-0 mt-0.5" /><span>{count.label}{count.matched !== 1 && `: ${fmt(count.matched)}`}</span></li>
                {count.opted > 0 && <li className="flex gap-2"><I.BellOff size={15} className="text-ink3 shrink-0 mt-0.5" /><span>{count.opted} opted out and will not receive this</span></li>}
                {count.noPhone > 0 && <li className="flex gap-2"><I.PhoneOff size={15} className="text-ink3 shrink-0 mt-0.5" /><span>{count.noPhone} have no mobile number</span></li>}
                {missing > 0 && <li className="flex gap-2 text-warn"><I.TriangleAlert size={15} className="shrink-0 mt-0.5" /><span>{fmt(missing)} have no due amount and will be skipped</span></li>}
                {!full && <li className="flex gap-2"><I.Lock size={15} className="text-ink3 shrink-0 mt-0.5" /><span>Limited to your own {staffAud ? 'staff groups' : 'parents'}</span></li>}
              </ul>
            </div>
            <div className="border-t border-line px-5 py-4">
              <p className="eyebrow text-ink3 mb-2">Message credits</p>
              <ul className="flex flex-col gap-1.5 text-[13.5px] tnum">
                {waN > 0 && <li className="flex justify-between gap-3"><span className="text-ink2">WhatsApp · {fmt(waN)} × 1</span><span className="font-semibold">{fmt(waN)}</span></li>}
                {smsN > 0 && <li className="flex justify-between gap-3"><span className="text-ink2">SMS · {fmt(n)} × {parts} {parts === 1 ? 'part' : 'parts'}</span><span className="font-semibold">{fmt(smsN)}</span></li>}
                {bkN > 0 && <li className="flex justify-between gap-3"><span className="text-ink2">SMS backup · up to {fmt(bkN)} SMS</span><span className="font-semibold">up to {fmt(bkN)}</span></li>}
                {(ch.includes('Email') || ch.includes('App')) && <li className="flex justify-between gap-3"><span className="text-ink2">{[ch.includes('Email') && 'Email', ch.includes('App') && 'App notice'].filter(Boolean).join(' and ')}</span><span className="font-semibold">Free</span></li>}
                <li className="flex justify-between gap-3 border-t border-line/70 pt-1.5 mt-0.5"><span className="font-semibold">Total</span><span className="font-semibold">{bkN ? 'up to ' : ''}{fmt(total)}</span></li>
              </ul>
              <p className={cx('mt-2.5 text-[13px] font-semibold flex items-center gap-1.5', err.credits ? 'text-bad' : 'text-ok')}>
                {err.credits ? <I.CircleAlert size={15} /> : <I.CircleCheck size={15} />}{err.credits || `Sufficient credits · ${fmt(BALANCE)} available`}
              </p>
            </div>
            {/* Preview as one real person sees it */}
            <div className="border-t border-line px-5 py-4 bg-sunken/40">
              <div className="flex items-center gap-2 mb-3">
                <p className="eyebrow text-ink3 flex-1">Preview</p>
                <span className="text-[12px] text-ink3 tnum">{Math.min(pi, people.length - 1) + 1} of {people.length}</span>
                <button aria-label="Previous recipient" disabled={pi === 0} onClick={() => setPi(pi - 1)} className="w-8 h-8 grid place-items-center rounded-lg text-ink2 hover:bg-sunken disabled:opacity-40"><I.ChevronLeft size={17} /></button>
                <button aria-label="Next recipient" disabled={pi >= people.length - 1} onClick={() => setPi(pi + 1)} className="w-8 h-8 grid place-items-center rounded-lg text-ink2 hover:bg-sunken disabled:opacity-40"><I.ChevronRight size={17} /></button>
              </div>
              {p && (
                <>
                  <div className="flex items-center gap-2.5 mb-2.5">
                    <Avatar name={p.name} size={32} />
                    <div className="min-w-0 flex-1"><p className="text-[13.5px] font-semibold truncate">{p.name}</p><p className="text-[12px] text-ink3 truncate">{p.rel}{p.cls ? `, ${p.cls}` : ''}</p></div>
                    <Pill tone="neutral" className="!h-[22px] !text-[11.5px]">{p.lang}</Pill>
                  </div>
                  <div className="rounded-2xl rounded-tl-md bg-surface border border-line p-3 shadow-card max-w-full">
                    {(() => {
                      const useTr = canTranslate && tr && p.lang !== 'English' && trs[p.lang];
                      return (
                        <>
                          {(title && ch.includes('App')) && <p className="text-[13px] font-semibold mb-1">{title}</p>}
                          {useTr && <p className="text-[11.5px] italic text-ink3 mb-1 flex items-center gap-1"><I.Languages size={12} />Translated from English</p>}
                          <p className="text-[14px] leading-relaxed break-words">{fill(useTr ? trs[p.lang] : body, p)}</p>
                          {T && p.lang !== 'English' && T.langs.includes(p.lang) && <p className="text-[11.5px] text-ink3 mt-1">Goes in the template's approved {p.lang} version.</p>}
                          {file && <p className="mt-2 text-[12.5px] text-ink2 flex items-center gap-1.5 rounded-lg bg-sunken px-2 py-1.5"><I.FileText size={14} />{file}</p>}
                          <p className="text-[11px] text-ink3 text-right mt-1 tnum">{when === 'now' ? '10:44 AM' : sTime}</p>
                        </>
                      );
                    })()}
                  </div>
                </>
              )}
            </div>
            <div className="border-t border-line p-4 flex flex-col gap-2">
              <Button variant="primary" size="lg" className="w-full !h-14 !text-[16px]" icon={when === 'now' ? I.Send : I.CalendarClock} onClick={trySend}>{sendLabel}</Button>
              {tried && !valid && <p className="text-[12.5px] text-bad text-center">Fix the marked fields above first.</p>}
              <div className="flex gap-2">
                <Button variant="ghost" className="flex-1" icon={I.Bookmark} onClick={() => { setGroupName(aud === 'classes' ? `${classLabel(classes)} parents` : aud === 'sections' ? `${secs.join(', ')} parents` : count.label); setGroup(true); }}>Save as group</Button>
                <Button variant="ghost" className="flex-1" icon={I.Eye} onClick={() => setPi((pi + 1) % people.length)}>Next person</Button>
              </div>
              <p className="text-[12px] text-ink3 text-center">A message cannot be unsent once delivered.</p>
            </div>
          </Card>

          {role.id === 'transport' && (
            <Card className="border-bad/25">
              <CardHead title="Route emergency" sub="WhatsApp and SMS together, including parents who opted out" icon={I.Siren} />
              <div className="px-5 pb-5"><Button variant="danger" className="w-full" icon={I.Siren} onClick={() => setRouteEm(true)}>Message {routeObj.bus} parents now</Button></div>
            </Card>
          )}
        </Col>
      </Split>

      <ConfirmSheet open={confirm} onClose={() => setConfirm(false)} title={`${when === 'now' ? 'Send' : 'Schedule'} to ${fmt(n - missing)} ${noun}?`} sub="A message cannot be unsent once delivered. A wrong message needs a correction message."
        confirmLabel={sendLabel} onConfirm={doSend}>
        <ul className="flex flex-col gap-2.5 text-[14px] pb-1">
          <li className="flex gap-2.5"><I.Users size={17} className="text-ink3 shrink-0 mt-0.5" /><span>{count.label}{count.opted ? `. ${count.opted} who opted out are left out.` : '.'}</span></li>
          <li className="flex gap-2.5"><I.Send size={17} className="text-ink3 shrink-0 mt-0.5" /><span>{ch.map((c) => CH[c].label).join(', ')}{bkN ? ', with SMS backup after 2 hours' : ''}</span></li>
          <li className="flex gap-2.5"><I.Coins size={17} className="text-ink3 shrink-0 mt-0.5" /><span className="tnum">{bkN ? 'Up to ' : ''}{fmt(total)} credits of {fmt(BALANCE)}</span></li>
          <li className="flex gap-2.5"><I.Clock size={17} className="text-ink3 shrink-0 mt-0.5" /><span>{when === 'now' ? 'Now, Fri 9 Oct, 10:44 AM' : `${sDate}, ${sTime}`}</span></li>
          {canTranslate && tr && <li className="flex gap-2.5"><I.Languages size={17} className="text-ink3 shrink-0 mt-0.5" /><span>{fmt(langCount.Telugu)} in Telugu and {fmt(langCount.Hindi)} in Hindi, labelled “Translated from English”</span></li>}
        </ul>
      </ConfirmSheet>

      <ConfirmSheet open={emer} onClose={() => setEmer(false)} danger typeToConfirm="EMERGENCY" title="Emergency broadcast" sub="Goes to all 1,018 families and 86 staff by WhatsApp and SMS together, including the 33 who opted out."
        confirmLabel="Send to 1,092 people now" onConfirm={() => toast({ title: 'Emergency broadcast sent to 1,092 people', body: 'WhatsApp and SMS · 2,184 credits. Logged with your name.' })}>
        <Field label="Message" id="emer-text" required>
          <Textarea id="emer-text" value={emerText} onChange={setEmerText} rows={4} />
        </Field>
        <p className="text-[12.5px] text-ink3 mt-2">Only the Principal and School Admin can send this. 12 families with no mobile number cannot be reached.</p>
      </ConfirmSheet>

      <ConfirmSheet open={routeEm} onClose={() => setRouteEm(false)} danger title={`Route emergency: ${routeObj.name}`} sub={`Goes to ${routeN} parents of ${routeObj.bus} by WhatsApp and SMS together, including those who opted out.`}
        confirmLabel={`Send to ${routeN} parents`} onConfirm={() => toast({ title: `Sent to ${routeN} parents of ${routeObj.bus}`, body: `${routeN * 2} credits. Driver ${routeObj.driver} was told too.` })}>
        <div className="flex flex-col gap-3">
          <Field label="Route" id="em-route"><Select id="em-route" value={route} onChange={setRoute} options={ROUTES.map((r) => ({ value: r.id, label: r.name }))} /></Field>
          <div role="radiogroup" aria-label="Message" className="flex flex-col gap-2">
            {EM.map((t, i) => (
              <button key={i} role="radio" aria-checked={emPick === i} onClick={() => setEmPick(i)} className={cx('rounded-xl border p-3 text-left text-[14px] transition', emPick === i ? 'border-bad bg-bad/5 ring-1 ring-bad' : 'border-line hover:border-ink3/50')}>{t.replace(/Bus 4/g, routeObj.bus)}</button>
            ))}
          </div>
        </div>
      </ConfirmSheet>

      <FormSheet open={group} onClose={() => setGroup(false)} title="Save as a group" sub="Pick it next time under Who gets it" submitLabel="Save group"
        onSubmit={() => { if (!groupName.trim()) return false; toast({ title: `Group saved: ${groupName}`, body: `${fmt(count.matched)} ${staffAud ? 'staff' : 'families'} today. It updates as students join or leave.` }); }}>
        <Field label="Group name" required id="grp-name" error={!groupName.trim() ? 'Give the group a name' : ''}><Input id="grp-name" value={groupName} onChange={(e) => setGroupName(e.target.value)} /></Field>
      </FormSheet>
    </div>
  );
}

// Several-at-once chips, same look as the class picker on Students
function Toggles({ options, value, onToggle }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button key={o.value} aria-pressed={on} onClick={() => onToggle(o.value)}
            className={cx('h-10 px-3.5 rounded-xl text-[13.5px] font-semibold border transition inline-flex items-center gap-2', on ? 'bg-ink text-bg border-ink' : 'bg-surface border-line text-ink2 hover:border-ink3/50 hover:text-ink')}>
            {on && <I.Check size={14} strokeWidth={3} />}{o.label}
            {o.count != null && <span className={cx('text-[11.5px] tnum', on ? 'opacity-70' : 'text-ink3')}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
const BackLink = ({ label, sub, onClick }) => (
  <button onClick={onClick} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink mb-3 -ml-1 h-8 px-1 rounded-lg">
    <I.ArrowLeft size={17} />{label}{sub && <span className="text-ink3 font-normal">/ {sub}</span>}
  </button>
);

/* ======================= Notice Board ======================= */
const PRI_TONE = { Critical: 'bad', High: 'warn', Normal: 'neutral' };
const NST_TONE = { Published: 'ok', 'Waiting for approval': 'warn', Scheduled: 'info', Draft: 'neutral', Expired: 'neutral', Archived: 'neutral' };
const NOTICES = [
  { id: 'N-26-118', title: 'Half-yearly exams start Monday, 12 October', body: 'Reporting time 8:15 AM. Bring the hall ticket and two pencils. No phones or smart watches in the exam hall. The datesheet is attached and on Parent Link.', aud: 'Parents and students, Classes 6–10', pri: 'Critical', pub: '9 Oct 2026', exp: '27 Oct 2026', status: 'Published', by: 'Prakash Joshi', parents: true, seen: 371, of: 412, ack: true, acked: 298, chans: ['Notice board', 'Parent Link', 'WhatsApp', 'App notice'], file: 'Datesheet-Half-yearly-2026.pdf' },
  { id: 'N-26-117', title: 'Fire drill today at 1:15 PM', body: 'The bell rings three times. Teachers lead their class to the assembly ground by the marked stairs. Roll call on the ground.', aud: 'All staff and students', pri: 'High', pub: '9 Oct 2026', exp: '9 Oct 2026', status: 'Published', by: 'Lakshmi Rao', read: 64, readOf: 86, chans: ['Notice board', 'App notice'] },
  { id: 'N-26-116', title: 'Parent–teacher meeting on Saturday, 17 October', body: '9:30 AM to 12:30 PM for Classes 4–10. Your slot with the class teacher is on Parent Link. Report cards of Unit Test 2 will be discussed.', aud: 'Parents, Classes 4–10', pri: 'Normal', pub: '8 Oct 2026', exp: '17 Oct 2026', status: 'Published', by: 'Anita Sharma', parents: true, seen: 512, of: 640, chans: ['Notice board', 'Parent Link', 'WhatsApp'] },
  { id: 'N-26-115', title: 'Wonderla picnic for Classes 5–7: consent and fee by 20 October', body: 'Saturday 24 October, 7:00 AM to 7:30 PM. Fee ₹1,200 including bus, entry and lunch. Please give consent on your Parent Link.', aud: 'Parents, Classes 5–7', pri: 'High', pub: '6 Oct 2026', exp: '24 Oct 2026', status: 'Published', by: 'Anita Sharma', parents: true, seen: 201, of: 250, ack: true, acked: 154, chans: ['Notice board', 'Parent Link', 'WhatsApp'] },
  { id: 'N-26-114', title: 'Dussehra holidays from 19 to 25 October', body: 'The school stays closed from Monday 19 October to Sunday 25 October. Classes resume on Monday 26 October with the Social Studies exam for Classes 6–10.', aud: 'Everyone', pri: 'Normal', pub: '3 Oct 2026', exp: '26 Oct 2026', status: 'Published', by: 'Lakshmi Rao', parents: true, seen: 902, of: 1018, chans: ['Notice board', 'Parent Link', 'WhatsApp', 'App notice'] },
  { id: 'N-26-113', title: '7 B: Science project due Monday, 26 October', body: 'Working model on “Sources of energy”, in groups of four. Groups are on the class board.', aud: 'Parents and students, 7 B', pri: 'Normal', pub: '8 Oct 2026', exp: '26 Oct 2026', status: 'Published', by: 'Ravi Teja', parents: true, seen: 31, of: 37, chans: ['Notice board', 'Parent Link', 'WhatsApp'] },
  { id: 'N-26-112', title: 'Maths revision class on Thursday after school', body: '6 A, 6 B, 7 A and 7 B: 3:50 PM to 4:30 PM in room 204. Bring the Exercise 4 notebook.', aud: 'Parents and students, 6 A, 6 B, 7 A, 7 B', pri: 'Normal', pub: '7 Oct 2026', exp: '15 Oct 2026', status: 'Published', by: 'Imran Shaikh', parents: true, seen: 128, of: 155, chans: ['Notice board', 'Parent Link'] },
  { id: 'N-26-111', title: 'Tuition fee Q3 due on 10 October', body: 'Pay on Parent Link by UPI, card or net banking, or at the counter from 8:30 AM to 1:00 PM. A late fee of ₹250 applies after 20 October.', aud: 'All parents', pri: 'Normal', pub: '1 Oct 2026', exp: '20 Oct 2026', status: 'Published', by: 'Suresh Babu', parents: true, seen: 866, of: 1018, chans: ['Notice board', 'Parent Link'] },
  { id: 'N-26-110', title: 'Bus timings during the exams', body: 'Buses leave school at 12:45 PM on exam days (12–16 and 26–27 October). Morning pickup times stay the same.', aud: 'Parents of bus students', pri: 'High', pub: '7 Oct 2026', exp: '27 Oct 2026', status: 'Published', by: 'Venkatesh Goud', parents: true, seen: 214, of: 251, chans: ['Notice board', 'Parent Link', 'WhatsApp'] },
  { id: 'N-26-119', title: 'Annual Sports Day practice timings', body: 'Practice on 31 October and from 2 November, 2:20 PM to 3:45 PM, for students in march-past and races.', aud: 'Students of Classes 3–10, PE staff', pri: 'Normal', pub: '—', exp: '14 Nov 2026', status: 'Waiting for approval', by: 'Mohammed Asif', chans: ['Notice board', 'App notice'] },
  { id: 'N-26-120', title: 'Diwali: no crackers on the campus', body: 'Please do not send crackers or sparklers with children. The Diwali celebration on 6 November uses diyas and rangoli only.', aud: 'Everyone', pri: 'Normal', pub: '2 Nov 2026, 8:00 AM', exp: '9 Nov 2026', status: 'Scheduled', by: 'Lakshmi Rao', parents: true, chans: ['Notice board', 'Parent Link', 'WhatsApp'] },
  { id: 'N-26-121', title: 'Winter uniform from 1 November', body: 'Navy sweater with the school crest. Available at the school store from 20 October.', aud: 'Parents, all classes', pri: 'Normal', pub: '—', exp: '—', status: 'Draft', by: 'Anita Sharma', parents: true, chans: ['Notice board', 'Parent Link'] },
  { id: 'N-26-122', title: 'Visitor timings during PTM', body: 'On 17 October, visitors other than parents are met only after 12:30 PM. Please carry the visitor slip.', aud: 'Parents, Classes 4–10', pri: 'Normal', pub: '—', exp: '17 Oct 2026', status: 'Waiting for approval', by: 'Kavitha Nair', parents: true, chans: ['Notice board', 'Parent Link'] },
  { id: 'N-26-108', title: 'Admit cards for half-yearly exams', body: 'Admit cards are given by the class teacher on 10 October. A duplicate costs ₹50 at the office.', aud: 'Students, Classes 6–10', pri: 'Normal', pub: '6 Oct 2026', exp: '27 Oct 2026', status: 'Published', by: 'Naveen Kumar', read: 402, readOf: 470, chans: ['Notice board', 'App notice'] },
  { id: 'N-26-107', title: 'Admissions open for 2027–28', body: 'Nursery to Class 9. Admission test on Saturday 7 November. Enquiry forms at the reception and on the website.', aud: 'Everyone', pri: 'Normal', pub: '5 Oct 2026', exp: '30 Nov 2026', status: 'Published', by: 'Divya Menon', parents: true, seen: 744, of: 1018, chans: ['Notice board', 'Parent Link'] },
  { id: 'N-26-106', title: 'Feeling stressed about exams? Talk to us', body: 'The counsellor is in room 12 every day, 10:00 AM to 3:30 PM. Students can walk in or ask their class teacher.', aud: 'Students, Classes 6–10', pri: 'Normal', pub: '5 Oct 2026', exp: '27 Oct 2026', status: 'Published', by: 'Sana Ali', read: 388, readOf: 470, chans: ['Notice board', 'App notice'] },
  { id: 'N-26-105', title: 'Staff: Diwali week leave plans by 15 October', body: 'Enter leave plans for 6–10 November in School OS so that substitutions can be arranged.', aud: 'All staff', pri: 'Normal', pub: '5 Oct 2026', exp: '15 Oct 2026', status: 'Published', by: 'Shalini Verma', read: 61, readOf: 86, chans: ['Notice board', 'App notice', 'Email'] },
  { id: 'N-26-104', title: 'Half-yearly syllabus for Classes 6–10', body: 'Chapter lists for each subject are attached. Revision weeks are shown on the time table.', aud: 'Parents and students, Classes 6–10', pri: 'Normal', pub: '22 Sep 2026', exp: '27 Oct 2026', status: 'Published', by: 'Meena Pillai', parents: true, seen: 377, of: 412, chans: ['Notice board', 'Parent Link'] },
  { id: 'N-26-098', title: 'Unit Test 2 report cards on Parent Link', body: 'Report cards for Unit Test 2 are on Parent Link.', aud: 'All parents', pri: 'Normal', pub: '28 Sep 2026', exp: '8 Oct 2026', status: 'Expired', by: 'Prakash Joshi', parents: true, seen: 948, of: 1018, chans: ['Parent Link', 'WhatsApp'] },
  { id: 'N-26-090', title: 'Independence Day programme', body: 'Flag hoisting at 8:00 AM. Cultural programme till 10:30 AM.', aud: 'Everyone', pri: 'Normal', pub: '12 Aug 2026', exp: '15 Aug 2026', status: 'Archived', by: 'Lakshmi Rao', parents: true, seen: 931, of: 1018, chans: ['Notice board', 'Parent Link', 'WhatsApp'] },
];
const seenList = (nt) => CLASS_7B.slice(0, 14).map((s, i) => ({
  s, name: s.id === FEATURED.id ? 'Priya Sharma' : s.father,
  seen: i % 5 === 3 ? null : `${i < 6 ? '9 Oct' : '8 Oct'}, ${['8:14 AM', '8:31 AM', '9:02 AM', '', '7:48 PM'][i % 5] || '6:20 PM'}`,
  via: i % 2 ? 'WhatsApp read' : 'Parent Link',
}));

function NoticeBoard({ access }) {
  const { role } = useRole();
  const toast = useToast();
  const canEdit = useCanEdit();
  const full = access === 'full';
  const me = role.person.name;
  const [items, setItems] = useState(NOTICES);
  const [view, setView] = useState('current');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [add, setAdd] = useState(false);
  const mine = items.filter((n) => full || n.by === me);
  const groups = { current: ['Published'], waiting: ['Waiting for approval', 'Scheduled', 'Draft'], archive: ['Expired', 'Archived'] };
  const rows = mine.filter((n) => groups[view].includes(n.status) && (!q || n.title.toLowerCase().includes(q.toLowerCase()) || n.aud.toLowerCase().includes(q.toLowerCase())));
  const board = mine.filter((n) => n.status === 'Published').sort((a, b) => ['Critical', 'High', 'Normal'].indexOf(a.pri) - ['Critical', 'High', 'Normal'].indexOf(b.pri));
  const cnt = (g) => mine.filter((n) => groups[g].includes(n.status)).length;
  const approve = (nt) => { setItems((x) => x.map((y) => (y.id === nt.id ? { ...y, status: 'Published', pub: '9 Oct 2026' } : y))); setOpen(null); toast({ title: `Approved and published: ${nt.title}`, undo: () => setItems((x) => x.map((y) => (y.id === nt.id ? nt : y))) }); };
  const archive = (nt) => { setItems((x) => x.map((y) => (y.id === nt.id ? { ...y, status: 'Archived' } : y))); setOpen(null); toast({ title: 'Notice archived', body: 'It left the board and Parent Link at once.', undo: () => setItems((x) => x.map((y) => (y.id === nt.id ? nt : y))) }); };

  return (
    <div>
      <ModuleHead sub={full ? 'Circulars and notices with read tracking. Notices to parents go to the Principal for approval first.' : 'Only your own notices. Notices to parents wait for the Principal’s approval.'}
        actions={<Button variant="primary" icon={I.Plus} onClick={() => setAdd(true)}>New notice</Button>} />
      <Split side={340}>
        <Card className="overflow-hidden min-w-0">
          <Toolbar>
            <SearchBox value={q} onChange={setQ} placeholder="Notice title or audience" id="notice-search" />
            <Segmented value={view} onChange={setView} options={[{ value: 'current', label: `Current · ${cnt('current')}` }, { value: 'waiting', label: `Waiting · ${cnt('waiting')}` }, { value: 'archive', label: 'Archive' }]} />
            <ExportButton what="notices" />
          </Toolbar>
          <DataList rows={rows} onRow={setOpen} minWidth={620}
            empty={<Empty icon={I.Megaphone} title={view === 'waiting' ? 'Nothing waiting' : 'No notices here'} body={view === 'waiting' ? 'Drafts, scheduled notices and those waiting for approval show here.' : 'Try another search, or write a new notice.'} action={canEdit && <Button variant="secondary" icon={I.Plus} onClick={() => setAdd(true)}>New notice</Button>} />}
            footer={`${rows.length} ${rows.length === 1 ? 'notice' : 'notices'}`}
            columns={[
              { key: 'title', label: 'Notice', render: (n) => <div className="min-w-[230px]"><p className="font-semibold leading-snug">{n.title}</p><p className="text-[12.5px] text-ink3 mt-0.5 flex items-center gap-1.5 flex-wrap">{n.pri !== 'Normal' && <Pill tone={PRI_TONE[n.pri]} className="!h-5 !text-[11px]">{n.pri}</Pill>}{n.by} · {n.aud}</p></div> },
              { key: 'pub', label: 'Published', nowrap: true, render: (n) => <span className="tnum text-[13px]">{n.pub}<span className="block text-[12px] text-ink3">until {n.exp}</span></span> },
              { key: 'status', label: 'Status', nowrap: true, render: (n) => <Pill tone={NST_TONE[n.status]} dot>{n.status}</Pill> },
              { key: 'seen', label: 'Seen / read', align: 'right', nowrap: true, render: (n) => n.seen != null ? <span className="tnum text-[13px]"><b className="font-semibold">{fmt(n.seen)}</b><span className="text-ink3"> of {fmt(n.of)}</span><Progress value={(n.seen / n.of) * 100} className="mt-1 w-20 ml-auto" /></span> : n.read != null ? <span className="tnum text-[13px]"><b className="font-semibold">{n.read}</b><span className="text-ink3"> of {n.readOf}</span></span> : <span className="text-ink3">—</span> },
            ]}
            mobile={(n) => ({ title: n.title, sub: `${n.aud} · ${n.pub}`, icon: 'Megaphone', iconTone: PRI_TONE[n.pri] === 'neutral' ? 'brand' : PRI_TONE[n.pri],
              pills: [<Pill key="s" tone={NST_TONE[n.status]} className="!h-[22px] !text-[11.5px]">{n.status}</Pill>, n.pri !== 'Normal' && <Pill key="p" tone={PRI_TONE[n.pri]} className="!h-[22px] !text-[11.5px]">{n.pri}</Pill>, n.seen != null && <Pill key="seen" tone="neutral" className="!h-[22px] !text-[11.5px]">Seen {n.seen} of {n.of}</Pill>] })} />
        </Card>
        <Card>
          <CardHead title="On the board now" sub="As staff and students see it: Critical first" icon={I.Megaphone} />
          <ul className="px-3 pb-3 flex flex-col gap-1.5">
            {board.slice(0, 6).map((n) => (
              <li key={n.id}>
                <button onClick={() => setOpen(n)} className={cx('w-full text-left rounded-xl px-3 py-2.5 hover:bg-sunken/70 transition border-l-[3px]', n.pri === 'Critical' ? 'border-bad bg-bad/[.04]' : n.pri === 'High' ? 'border-warn bg-warn/[.05]' : 'border-line')}>
                  <p className="font-semibold text-[14px] leading-snug">{n.title}</p>
                  <p className="text-[12.5px] text-ink3 mt-0.5">{n.aud} · {n.pub}</p>
                </button>
              </li>
            ))}
            {!board.length && <li className="text-[13.5px] text-ink3 px-3 py-4">Nothing published yet.</li>}
          </ul>
        </Card>
      </Split>
      <NoticeDetail nt={open} onClose={() => setOpen(null)} canApprove={HEADS.includes(role.id) && open && open.by !== me} canEdit={canEdit} onApprove={approve} onArchive={archive} />
      <NoticeForm open={add} onClose={() => setAdd(false)} full={full} role={role}
        onSaved={(nt) => setItems((x) => [nt, ...x])} />
    </div>
  );
}

function NoticeDetail({ nt, onClose, canApprove, canEdit, onApprove, onArchive }) {
  const toast = useToast();
  const [f, setF] = useState('all');
  const [resend, setResend] = useState(false);
  const [rch, setRch] = useState('WhatsApp');
  if (!nt) return null;
  const list = seenList(nt).filter((g) => f === 'all' || (f === 'seen' ? g.seen : !g.seen));
  const unseen = nt.of ? nt.of - nt.seen : 0;
  return (
    <Sheet open={!!nt} onClose={onClose} title={nt.title} sub={`${nt.id} · by ${nt.by}`} wide>
      <div className="flex flex-col gap-4">
        <div className="flex gap-1.5 flex-wrap"><Pill tone={NST_TONE[nt.status]} dot>{nt.status}</Pill><Pill tone={PRI_TONE[nt.pri]}>{nt.pri} priority</Pill>{nt.ack && <Pill tone="info">Asks for “I have read this”</Pill>}</div>
        <p className="text-[14.5px] leading-relaxed text-ink2">{nt.body}</p>
        {nt.file && <p className="text-[13px] flex items-center gap-2 rounded-xl bg-sunken px-3 py-2"><I.FileText size={16} className="text-ink3" />{nt.file}</p>}
        <dl className="grid grid-cols-1 @sm:grid-cols-2 gap-x-6 gap-y-3">
          {[['Audience', nt.aud], ['Channels', nt.chans.join(', ')], ['Published', nt.pub], ['Expires on', nt.exp]].map(([k, v]) => <div key={k}><dt className="text-[12px] text-ink3 font-semibold">{k}</dt><dd className="text-[14px] mt-0.5">{v}</dd></div>)}
        </dl>
        {nt.status === 'Waiting for approval' && <Banner tone="warn" title="Waiting for the Principal.">It goes out on the chosen channels once approved.</Banner>}
        {nt.seen != null && (
          <div className="rounded-2xl border border-line overflow-hidden">
            <div className="p-4 flex flex-col @md:flex-row @md:items-center gap-3">
              <div className="flex-1">
                <p className="text-[13px] font-semibold text-ink3">Seen by parents</p>
                <p className="font-display text-[24px] font-semibold tnum leading-tight">{fmt(nt.seen)} <span className="text-[14px] text-ink3 font-sans">of {fmt(nt.of)}</span></p>
                <p className="text-[12.5px] text-ink3">From Parent Link opens and WhatsApp read receipts{nt.ack ? ` · ${fmt(nt.acked)} tapped “I have read this”` : ''}</p>
              </div>
              {canEdit && unseen > 0 && <Button variant="soft" icon={I.Send} onClick={() => setResend(true)}>Resend to {fmt(unseen)} not seen</Button>}
            </div>
            <div className="border-t border-line px-4 py-2.5 flex items-center gap-2"><Segmented size="sm" value={f} onChange={setF} options={[{ value: 'all', label: 'All' }, { value: 'seen', label: 'Seen' }, { value: 'not', label: 'Not seen' }]} /><span className="text-[12px] text-ink3 ml-auto">Showing 7 B guardians</span></div>
            <ul className="divide-y divide-line/70 border-t border-line max-h-64 overflow-y-auto scroll-thin">
              {list.map((g) => (
                <li key={g.s.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Avatar name={g.name} size={32} />
                  <div className="min-w-0 flex-1"><p className="text-[14px] font-semibold truncate">{g.name}</p><p className="text-[12px] text-ink3 truncate">Parent of {g.s.name}</p></div>
                  {g.seen ? <span className="text-right text-[12.5px] tnum"><span className="block font-semibold">{g.seen}</span><span className="text-ink3">{g.via}</span></span> : <Pill tone="warn">Not seen</Pill>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {nt.read != null && <p className="text-[14px]"><b className="font-semibold tnum">{nt.read} of {nt.readOf}</b> <span className="text-ink3">have opened it in the app.</span></p>}
        {canEdit && (
          <div className="flex gap-2 flex-wrap pt-1">
            {canApprove && nt.status === 'Waiting for approval' && <Button variant="primary" icon={I.Check} onClick={() => onApprove(nt)}>Approve and publish</Button>}
            {nt.ack && <Button variant="secondary" icon={I.BellRing} onClick={() => toast({ title: `Reminder sent to ${fmt(nt.of - nt.acked)} parents`, body: 'Only those who have not tapped “I have read this”.' })}>Remind {fmt(nt.of - nt.acked)} not acknowledged</Button>}
            {nt.status === 'Draft' && <Button variant="secondary" icon={I.Pencil} onClick={() => toast({ title: 'Editing the draft', tone: 'info' })}>Edit draft</Button>}
            {!['Archived', 'Expired'].includes(nt.status) && <Button variant="ghost" icon={I.Archive} onClick={() => onArchive(nt)}>Archive</Button>}
          </div>
        )}
      </div>
      <ConfirmSheet open={resend} onClose={() => setResend(false)} title={`Resend to ${fmt(unseen)} parents?`} sub="Only parents who have not opened it on Parent Link or read it on WhatsApp."
        confirmLabel={`Resend to ${fmt(unseen)} parents`} onConfirm={() => toast({ title: `Resent to ${fmt(unseen)} parents by ${rch}`, body: `${fmt(unseen)} credits used.` })}>
        <Segmented value={rch} onChange={setRch} options={['WhatsApp', 'SMS']} />
        <p className="text-[13.5px] text-ink2 mt-3 tnum">Cost: {fmt(unseen)} credits of {fmt(BALANCE)} available.{rch === 'SMS' && ' Uses the “Notice” SMS template with its DLT template ID.'}</p>
      </ConfirmSheet>
    </Sheet>
  );
}

function NoticeForm({ open, onClose, onSaved, full, role }) {
  const toast = useToast();
  const own = !full;
  const audOpts = own ? (role.id === 'classteacher' ? ['Parents and students, 7 B', 'Parents, 7 A and 8 B (Science)'] : role.id === 'teacher' ? ['Parents and students, 6 A, 6 B, 7 A, 7 B', 'Parents, 7 B'] : role.id === 'hr' ? ['All staff', 'Teaching staff'] : role.id === 'transport' ? ['Parents of bus students', 'Parents, Route 4 · Miyapur'] : ['All parents', 'Parents, Classes 6–10'])
    : ['Everyone', 'All parents', 'All staff', 'Parents and students, Classes 6–10', 'Parents, Classes 1–5', 'Parents, Nursery to UKG', 'Teaching staff'];
  const blank = { title: '', body: '', aud: audOpts[0], pri: 'Normal', chans: ['Notice board', 'App notice', 'Parent Link'], at: 'now', exp: '08-11-2026', ack: false, file: false };
  const [f, setF] = useState(blank);
  const [tried, setTried] = useState(false);
  const [crit, setCrit] = useState(false);
  const err = { title: !f.title.trim() ? 'Give the notice a title' : '', body: !f.body.trim() ? 'Write the notice' : '', chans: !f.chans.length ? 'Choose at least one channel' : '' };
  const parents = /parent|everyone/i.test(f.aud);
  const needsApproval = parents && !HEADS.includes(role.id);
  const save = () => {
    const nt = { id: 'N-26-123', title: f.title, body: f.body, aud: f.aud, pri: f.pri, pub: needsApproval ? '—' : f.at === 'now' ? '9 Oct 2026' : '10 Oct 2026, 8:00 AM', exp: f.exp.replace(/-/g, ' '), status: needsApproval ? 'Waiting for approval' : f.at === 'now' ? 'Published' : 'Scheduled', by: role.person.name, parents, seen: parents && !needsApproval ? 0 : undefined, of: parents ? 412 : undefined, ack: f.ack, acked: 0, chans: f.chans };
    onSaved(nt);
    toast(needsApproval ? { title: 'Sent for approval', body: 'Waiting for the Principal. It goes out once approved.', tone: 'info' } : { title: f.at === 'now' ? 'Notice published' : 'Notice scheduled', body: parents ? 'Seen counts start as parents open it.' : 'On the notice board now.' });
    setF(blank); setTried(false);
  };
  return (
    <>
      <FormSheet open={open} onClose={onClose} title="New notice" sub={needsApproval ? 'Notices to parents go to the Principal for approval first.' : 'Pinned on the board until it expires.'} wide submitLabel={needsApproval ? 'Send for approval' : f.at === 'now' ? 'Publish' : 'Schedule'}
        onSubmit={() => { setTried(true); if (Object.values(err).some(Boolean)) return false; if (f.pri === 'Critical') { setCrit(true); return false; } save(); }}>
        <Field label="Title" required id="nt-title" error={tried && err.title}><Input id="nt-title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={tried && err.title} placeholder="Short and clear, like “PTM on Saturday 17 October”" /></Field>
        <Field label="Notice" required id="nt-body" error={tried && err.body}><Textarea id="nt-body" value={f.body} onChange={(v) => setF({ ...f, body: v })} rows={4} placeholder="What, when, where, and what parents or students must do" /></Field>
        <div className="flex items-center gap-2 flex-wrap">
          {f.file ? <span className="text-[13px] flex items-center gap-2 rounded-xl bg-sunken px-3 h-10"><I.FileText size={16} className="text-ink3" />Circular-2026-31.pdf<button className="text-ink3 hover:text-ink" aria-label="Remove file" onClick={() => setF({ ...f, file: false })}><I.X size={15} /></button></span>
            : <Button type="button" variant="secondary" icon={I.Paperclip} onClick={() => setF({ ...f, file: true })}>Attach PDF or photo</Button>}
        </div>
        <div className="grid grid-cols-1 @md:grid-cols-2 gap-3">
          <Field label="Audience" required id="nt-aud" hint={own ? 'Only your own classes or groups' : 'Parents see it on Parent Link and by message'}><Select id="nt-aud" value={f.aud} onChange={(v) => setF({ ...f, aud: v })} options={audOpts} /></Field>
          <Field label="Priority" required id="nt-pri" hint={f.pri === 'Critical' ? 'Pinned at the top of every chosen parent’s Parent Link. Needs a typed confirmation.' : f.pri === 'High' ? 'Shown in amber' : 'Most notices'}>
            <Segmented value={f.pri} onChange={(v) => setF({ ...f, pri: v })} options={['Normal', 'High', 'Critical']} className="w-full" />
          </Field>
        </div>
        <div>
          <p className="text-[13px] font-semibold text-ink2 mb-1.5">Channels <span className="text-bad">*</span></p>
          <Toggles options={['Notice board', 'App notice', 'Parent Link', 'WhatsApp', 'SMS', 'Email'].map((c) => ({ value: c, label: c }))} value={f.chans} onToggle={(c) => setF({ ...f, chans: f.chans.includes(c) ? f.chans.filter((x) => x !== c) : [...f.chans, c] })} />
          {tried && err.chans && <p className="text-[12.5px] text-bad mt-1.5" role="alert">{err.chans}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Publish" id="nt-at"><Segmented value={f.at} onChange={(v) => setF({ ...f, at: v })} options={[{ value: 'now', label: 'Now' }, { value: 'later', label: 'Later' }]} className="w-full" /></Field>
          <Field label="Expires on" id="nt-exp" hint="DD-MM-YYYY · then it moves to the archive"><Input id="nt-exp" value={f.exp} onChange={(e) => setF({ ...f, exp: e.target.value })} className="tnum" /></Field>
        </div>
        <div className="rounded-xl bg-sunken/70 p-3.5 flex items-center gap-3">
          <Switch id="nt-ack" on={f.ack} onChange={(v) => setF({ ...f, ack: v })} label="Ask for acknowledgement" />
          <label htmlFor="nt-ack" className="text-[14px]"><b className="font-semibold">Ask readers to tap “I have read this”</b><span className="block text-[12.5px] text-ink3">You see who has and has not, and can remind them.</span></label>
        </div>
      </FormSheet>
      <ConfirmSheet open={crit} onClose={() => setCrit(false)} danger typeToConfirm="CRITICAL" title="Publish as Critical?" sub="Type CRITICAL to pin this on every chosen parent’s Parent Link until it expires."
        confirmLabel={needsApproval ? 'Send for approval as Critical' : 'Publish as Critical'} onConfirm={() => { save(); onClose(); }}>
        <p className="text-[14px] text-ink2">“{f.title}” · {f.aud}</p>
      </ConfirmSheet>
    </>
  );
}

/* ======================= WhatsApp Inbox ======================= */
const CHATS = [
  { id: 'c1', name: 'Priya Sharma', who: 'Mother of Aarav Sharma (7 B) and Anaya Sharma (UKG A)', kind: 'Parent', phone: '98495 60211', sid: FEATURED.id, t: '10:31 AM', unread: 2, assigned: 'Ravi Teja', lang: 'English',
    msgs: [
      { me: false, t: '10:12 AM', text: 'Good morning sir. Aarav has a dentist appointment on Monday at 1:30 PM.' },
      { me: true, by: 'Ravi Teja', t: '10:20 AM', text: 'Good morning madam. Monday is the English exam, it ends at 11:45 AM. He can leave after that.', st: 'Read' },
      { me: false, t: '10:30 AM', text: 'Thank you. Can he leave early on Monday after the exam?' },
      { me: false, t: '10:31 AM', text: 'I will pick him up from the main gate at 12 noon.' },
    ] },
  { id: 'c2', name: 'Kumar Reddy', who: 'Father of Harini Reddy, 7 B', kind: 'Parent', phone: '98661 40275', t: '9:58 AM', unread: 1, assigned: 'Venkatesh Goud', lang: 'Telugu',
    msgs: [
      { me: false, t: '9:51 AM', text: 'Bus 4 did not stop at KPHB 6th Phase again today. Harini waited and I had to drop her.' },
      { me: true, by: 'Venkatesh Goud', t: '9:55 AM', text: 'Sorry for the trouble, sir. I have spoken to driver Mallesh. The stop will be covered from this evening.', st: 'Delivered' },
      { me: false, t: '9:58 AM', text: 'This is the second time this week. Please make sure.' },
    ] },
  { id: 'c3', name: '+91 98661 20457', who: 'Number not in School OS', kind: 'Unknown', phone: '98661 20457', t: '9:40 AM', unread: 1, assigned: null, lang: 'English',
    msgs: [{ me: false, t: '9:40 AM', text: 'Hello, is admission open for Class 1 for next year? What is the fee?' }] },
  { id: 'c4', name: 'Mahesh Gupta', who: 'Father of Rohan Gupta, 6 A', kind: 'Parent', phone: '93473 11850', t: '9:12 AM', unread: 0, assigned: 'Suresh Babu', lang: 'Hindi',
    msgs: [
      { me: false, t: '9:05 AM', text: 'Sir, I gave cheque 004512 of HDFC for ₹15,000 at the counter yesterday.' },
      { me: true, by: 'Suresh Babu', t: '9:10 AM', text: 'Received, sir. It will show as paid once the bank clears it, usually in 2 working days.', st: 'Read' },
      { me: false, t: '9:12 AM', text: 'Ok, thank you.' },
    ] },
  { id: 'c5', name: 'Swathi Varma', who: 'Enquiry · Nursery 2027–28', kind: 'Enquiry', phone: '90004 72318', t: '8:47 AM', unread: 0, assigned: 'Divya Menon', lang: 'English',
    msgs: [{ me: false, t: '8:40 AM', text: 'Can we visit the school on Saturday morning?' }, { me: true, by: 'Divya Menon', t: '8:47 AM', text: 'Yes, of course. Saturday 10 Oct is a holiday, so shall we book Monday 12 Oct at 11:00 AM?', st: 'Read' }] },
  { id: 'c6', name: 'Lalitha Naidu', who: 'Mother of Kavya Naidu, 3 A', kind: 'Parent', phone: '98850 11742', t: '8:20 AM', unread: 0, assigned: 'Kavitha Nair', lang: 'Telugu', resolved: true,
    msgs: [{ me: false, t: '8:12 AM', text: 'Kavya forgot her water bottle. I am sending it with the driver.' }, { me: true, by: 'Kavitha Nair', t: '8:16 AM', text: 'Noted, madam. We will give it to her class teacher.', st: 'Read' }, { me: false, t: '8:20 AM', text: 'Thank you, madam.' }] },
  { id: 'c7', name: 'Ramesh Patel', who: 'Father of Diya Patel, 9 C', kind: 'Parent', phone: '97010 88214', t: '7 Oct', unread: 0, assigned: 'Anita Sharma', lang: 'English', closed: true,
    msgs: [{ me: false, t: '7 Oct, 6:40 PM', text: 'The report card on Parent Link is not opening on my phone.' }, { me: true, by: 'Anita Sharma', t: '7 Oct, 7:02 PM', text: 'Sorry, sir. Please try again now, we have resent the link.', st: 'Read' }] },
  { id: 'c8', name: 'Anil Chowdary', who: 'Father of Ishaan Chowdary, 7 A', kind: 'Parent', phone: '99085 31207', t: 'Yesterday', unread: 1, assigned: 'Imran Shaikh', lang: 'English',
    msgs: [{ me: false, t: 'Yesterday, 7:15 PM', text: 'Sir, Ishaan is confused about question 7 of Exercise 4.2. Can you explain it in class tomorrow?' }] },
  { id: 'c9', name: 'Sanjay Verma', who: 'Father of Tanvi Verma, 10 A', kind: 'Parent', phone: '98480 77126', t: 'Yesterday', unread: 1, assigned: 'Lakshmi Rao', lang: 'English',
    msgs: [{ me: false, t: 'Yesterday, 5:30 PM', text: 'Madam, I would like to meet you about extra coaching for the board exams. Is Monday possible?' }] },
  { id: 'c10', name: 'Gopal Rao', who: 'Father of Pranav Rao, 10 B', kind: 'Parent', phone: '94403 26618', t: 'Yesterday', unread: 0, assigned: 'Srinivas Murthy', lang: 'Telugu',
    msgs: [{ me: false, t: 'Yesterday, 4:05 PM', text: 'Sir, thank you for calling about Pranav. We will talk to him at home.' }] },
  { id: 'c11', name: 'Harish Iyer', who: 'Father of Meera Iyer, 9 B', kind: 'Parent', phone: '90526 47731', t: 'Yesterday', unread: 1, assigned: 'Prakash Joshi', lang: 'English',
    msgs: [{ me: false, t: 'Yesterday, 3:22 PM', text: 'Meera has not received her admit card yet. The exam is on Monday.' }] },
  { id: 'c12', name: 'Sunita Das', who: 'Mother of Rahul Das, 5 B', kind: 'Parent', phone: '99595 12083', t: '8 Oct', unread: 0, assigned: 'Naveen Kumar', lang: 'English',
    msgs: [{ me: false, t: '8 Oct, 11:10 AM', text: 'Please send the bonafide certificate for the passport office.' }, { me: true, by: 'Naveen Kumar', t: '8 Oct, 11:40 AM', text: 'It will be ready tomorrow after 12 noon, madam.', st: 'Read' }] },
  { id: 'c13', name: 'Farida Khan', who: 'Mother of Kabir Khan, 8 A', kind: 'Parent', phone: '98492 55410', t: '8 Oct', unread: 0, assigned: 'Sana Ali', lang: 'Hindi',
    msgs: [{ me: false, t: '8 Oct, 6:00 PM', text: 'Thank you for talking to Kabir. He is much calmer this week.' }] },
  { id: 'c14', name: 'Deepak Verma', who: 'Staff · TGT Hindi', kind: 'Staff', phone: '96525 30981', t: '8 Oct', unread: 1, assigned: 'Shalini Verma', lang: 'English',
    msgs: [{ me: false, t: '8 Oct, 4:45 PM', text: 'Madam, how many casual leaves do I have left this year?' }] },
  { id: 'c15', name: 'Kiran Joshi', who: 'Father of Nikhil Joshi, 6 B', kind: 'Parent', phone: '90107 23394', t: '7 Oct', unread: 0, assigned: 'Meena Pillai', lang: 'English',
    msgs: [{ me: false, t: '7 Oct, 1:15 PM', text: 'Is the half-yearly Maths syllabus till Chapter 5 or 6?' }, { me: true, by: 'Meena Pillai', t: '7 Oct, 2:00 PM', text: 'Till Chapter 5, sir. The full list is on Parent Link.', st: 'Read' }] },
];
const QUICK_REPLIES = ['Noted, thank you.', 'Fee details and the Pay button are on your Parent Link.', 'Please call the office at 040 2305 6678.', 'The class teacher will call you today.'];

function Inbox({ access }) {
  const { role } = useRole();
  const { go } = useNav();
  const toast = useToast();
  const full = access === 'full';
  const me = role.person.name;
  const [chats, setChats] = useState(CHATS);
  const [tab, setTab] = useState(full ? 'all' : 'mine');
  const [q, setQ] = useState('');
  const visible = chats.filter((c) => (tab === 'mine' ? c.assigned === me : tab === 'none' ? !c.assigned : true));
  const list = visible.filter((c) => !q || (c.name + c.who + c.phone).toLowerCase().includes(q.toLowerCase()));
  const [openId, setOpenId] = useState(() => (full ? CHATS[0] : CHATS.find((c) => c.assigned === me) || CHATS[0]).id);
  const [thread, setThread] = useState(false);
  const [draft, setDraft] = useState('');
  const [assign, setAssign] = useState(false);
  const cur = list.find((c) => c.id === openId) || list[0];
  const send = (text) => {
    if (!text.trim() || !cur) return;
    setChats((x) => x.map((c) => (c.id === cur.id ? { ...c, unread: 0, t: '10:44 AM', msgs: [...c.msgs, { me: true, by: me, t: '10:44 AM', text: text.trim(), st: 'Sent' }] } : c)));
    setDraft('');
  };
  const setAssigned = (who) => { setChats((x) => x.map((c) => (c.id === cur.id ? { ...c, assigned: who } : c))); toast({ title: `Chat given to ${who}`, body: `${cur.name} · they see it under Assigned to me.` }); };
  const resolve = () => { const prev = cur; setChats((x) => x.map((c) => (c.id === prev.id ? { ...c, resolved: true, unread: 0 } : c))); toast({ title: 'Marked resolved', undo: () => setChats((x) => x.map((c) => (c.id === prev.id ? prev : c))) }); };
  const kids = cur && cur.sid ? [FEATURED, STUDENTS.find((s) => s.first === 'Anaya') || null].filter(Boolean) : [];
  const counts = { mine: chats.filter((c) => c.assigned === me).length, all: chats.length, none: chats.filter((c) => !c.assigned).length };

  return (
    <div>
      <ModuleHead sub={full ? 'All school WhatsApp chats on 90300 66100. Each staff member sees the chats given to them.' : 'Only chats given to you. The office can pass a chat to you.'} />
      <Card className="overflow-hidden">
        <div className="grid grid-cols-1 @xl:grid-cols-[300px_minmax(0,1fr)_260px] @xl:h-[660px]">
          {/* Chat list */}
          <div className={cx('flex-col min-h-0 @xl:border-r border-line', thread ? 'hidden @xl:flex' : 'flex')}>
            <div className="p-3 flex flex-col gap-2.5 border-b border-line">
              {full ? <Segmented size="sm" value={tab} onChange={setTab} options={[{ value: 'mine', label: `Mine · ${counts.mine}` }, { value: 'all', label: `All · ${counts.all}` }, { value: 'none', label: `Unassigned · ${counts.none}` }]} className="w-full" />
                : <p className="text-[13px] font-semibold text-ink2 px-1">Assigned to me · {counts.mine}</p>}
              <SearchBox value={q} onChange={setQ} placeholder="Name or phone" id="inbox-search" />
            </div>
            <ul className="flex-1 overflow-y-auto scroll-thin divide-y divide-line/70">
              {list.map((c) => (
                <li key={c.id}>
                  <button onClick={() => { setOpenId(c.id); setThread(true); setChats((x) => x.map((y) => (y.id === c.id ? { ...y, unread: 0 } : y))); }}
                    className={cx('w-full flex items-start gap-3 px-3.5 py-3 text-left transition', cur && cur.id === c.id ? 'bg-brand/8' : 'hover:bg-sunken/60')}>
                    {c.kind === 'Unknown' ? <span className="w-10 h-10 rounded-full bg-sunken text-ink3 grid place-items-center shrink-0"><I.Phone size={17} /></span> : <Avatar name={c.name} size={40} />}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2"><span className="font-semibold text-[14px] truncate flex-1">{c.name}</span><span className={cx('text-[11.5px] tnum shrink-0', c.unread ? 'text-ok font-semibold' : 'text-ink3')}>{c.t}</span></span>
                      <span className="block text-[12.5px] text-ink3 truncate">{c.msgs[c.msgs.length - 1].text}</span>
                      <span className="flex items-center gap-1.5 mt-1">
                        <span className="text-[11.5px] text-ink3 truncate flex-1">{c.assigned ? `To ${c.assigned}` : 'Not assigned'}{c.resolved ? ' · resolved' : ''}</span>
                        {c.unread > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-ok text-white text-[11px] font-bold grid place-items-center tnum">{c.unread}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {!list.length && <li><Empty icon={I.Inbox} title={tab === 'none' ? 'Every chat has an owner' : 'No chats here'} body={tab === 'mine' ? 'Chats given to you show up here.' : 'Try another search.'} /></li>}
            </ul>
          </div>

          {/* Thread */}
          {cur ? (
            <div className={cx('flex-col min-h-0 h-[620px] @xl:h-auto', thread ? 'flex' : 'hidden @xl:flex')}>
              <div className="flex items-center gap-2.5 px-3 @md:px-4 py-2.5 border-b border-line">
                <button onClick={() => setThread(false)} className="@xl:hidden w-9 h-9 grid place-items-center rounded-lg text-ink2 hover:bg-sunken" aria-label="Back to chats"><I.ArrowLeft size={18} /></button>
                {cur.kind === 'Unknown' ? <span className="w-9 h-9 rounded-full bg-sunken text-ink3 grid place-items-center shrink-0"><I.Phone size={16} /></span> : <Avatar name={cur.name} size={36} />}
                <div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px] truncate">{cur.name}</p><p className="text-[12px] text-ink3 truncate">{cur.who}</p></div>
                <Button size="sm" variant="secondary" icon={I.UserCheck} onClick={() => setAssign(true)} className="hidden @sm:inline-flex">{cur.assigned ? 'Reassign' : 'Assign'}</Button>
                <MoreMenu size="sm" items={[
                  ['UserCheck', cur.assigned ? 'Reassign' : 'Assign to staff', () => setAssign(true)],
                  ['ClipboardList', 'Make it a query', () => toast({ title: 'Query Q-26-0149 created', body: `From ${cur.name}'s chat. Owner: ${cur.assigned || 'Office'}.` })],
                  ['UserPlus', 'Make it an enquiry', () => toast({ title: 'Enquiry ENQ-27-0213 created', body: 'In Admissions, Enquiries, with this chat attached.' })],
                  ['CircleCheck', 'Mark resolved', resolve],
                ]} />
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto scroll-thin px-3 @md:px-5 py-4 flex flex-col gap-2.5 bg-sunken/30">
                <p className="text-center text-[11.5px] text-ink3 font-semibold">{/Oct/.test(cur.msgs[0].t) ? cur.msgs[0].t.split(',')[0].replace(/^(\d+) Oct$/, '$1 October') : /^Yesterday/.test(cur.msgs[0].t) ? 'Yesterday' : 'Today'}</p>
                {cur.msgs.map((m, i) => (
                  <div key={i} className={cx('max-w-[85%] @md:max-w-[75%] rounded-2xl px-3.5 py-2 shadow-card', m.me ? 'self-end bg-brand/10 rounded-tr-md' : 'self-start bg-surface rounded-tl-md border border-line/70')}>
                    {m.me && <p className="text-[11.5px] font-semibold text-brand mb-0.5">{m.by}</p>}
                    <p className="text-[14px] leading-relaxed">{m.text}</p>
                    <p className="text-[11px] text-ink3 text-right mt-0.5 tnum flex items-center justify-end gap-1">{m.t}{m.me && (m.st === 'Read' ? <I.CheckCheck size={13} className="text-info" /> : m.st === 'Delivered' ? <I.CheckCheck size={13} /> : <I.Check size={13} />)}</p>
                  </div>
                ))}
              </div>
              {cur.closed ? (
                <div className="p-3 border-t border-line">
                  <Banner tone="warn" title="The 24-hour reply window has closed." action={<Button size="sm" variant="secondary" onClick={() => go('communication', { page: 'templates' })}>Pick a template</Button>}>WhatsApp allows only an approved template now.</Banner>
                </div>
              ) : (
                <div className="border-t border-line p-3 flex flex-col gap-2">
                  <div className="-mx-3 px-3 overflow-x-auto no-scrollbar"><div className="flex gap-1.5 w-max">
                    {QUICK_REPLIES.map((r) => <button key={r} onClick={() => setDraft(r)} className="h-8 px-3 rounded-full bg-sunken text-[12.5px] font-medium text-ink2 hover:bg-line whitespace-nowrap">{r}</button>)}
                  </div></div>
                  <form onSubmit={(e) => { e.preventDefault(); send(draft); }} className="flex items-center gap-2">
                    <button type="button" onClick={() => toast({ title: 'Choose a document or photo', body: 'PDF or image, up to 10 MB', tone: 'info' })} className="w-10 h-10 grid place-items-center rounded-xl text-ink2 hover:bg-sunken shrink-0" aria-label="Attach"><I.Paperclip size={19} /></button>
                    <input id="inbox-reply" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Reply to ${cur.name.split(' ')[0]}`} className="h-11 flex-1 min-w-0 rounded-xl bg-surface border border-line px-3.5 text-[15px] outline-none focus:border-brand focus:ring-4 focus:ring-brand/15" />
                    <Button type="submit" variant="primary" icon={I.SendHorizontal} disabled={!draft.trim()} aria-label="Send reply" className="!px-3.5" />
                  </form>
                </div>
              )}
            </div>
          ) : <div className="hidden @xl:block" />}

          {/* About this person */}
          {cur && (
            <aside className="hidden @xl:flex flex-col border-l border-line overflow-y-auto scroll-thin">
              <div className="p-5 flex flex-col items-center text-center border-b border-line">
                {cur.kind === 'Unknown' ? <span className="w-16 h-16 rounded-full bg-sunken text-ink3 grid place-items-center"><I.Phone size={26} /></span> : <Avatar name={cur.name} size={64} />}
                <p className="font-semibold text-[15px] mt-2.5">{cur.name}</p>
                <p className="text-[12.5px] text-ink3 tnum">+91 {cur.phone}</p>
                <div className="flex gap-1.5 mt-2"><Pill tone={cur.kind === 'Unknown' ? 'warn' : 'brand'}>{cur.kind === 'Unknown' ? 'Not matched' : cur.kind}</Pill><Pill tone="neutral">{cur.lang}</Pill></div>
              </div>
              <div className="p-4 flex flex-col gap-4 text-[13.5px]">
                <div><p className="eyebrow text-ink3 mb-1.5">Who this is</p><p className="text-ink2">{cur.who}</p></div>
                {kids.length > 0 && (
                  <div><p className="eyebrow text-ink3 mb-1">Children</p>
                    {kids.map((k) => <Row key={k.id} avatar={k.name} title={k.name} sub={`${k.cls} ${k.sec}`} onClick={() => go('student', { id: k.id })} className="!px-1.5" />)}
                  </div>
                )}
                <div><p className="eyebrow text-ink3 mb-1.5">Assigned to</p><p className="font-semibold">{cur.assigned || 'Nobody yet'}</p></div>
                <div className="flex flex-col gap-2">
                  <Button size="sm" variant="secondary" icon={I.ClipboardList} onClick={() => toast({ title: 'Query Q-26-0149 created', body: `From ${cur.name}'s chat.` })}>Make it a query</Button>
                  {cur.kind === 'Unknown' && <Button size="sm" variant="secondary" icon={I.UserPlus} onClick={() => toast({ title: 'Enquiry ENQ-27-0213 created', body: 'In Admissions, Enquiries.' })}>Make it an enquiry</Button>}
                  <Button size="sm" variant="ghost" icon={I.CircleCheck} onClick={resolve}>Mark resolved</Button>
                </div>
              </div>
            </aside>
          )}
        </div>
      </Card>
      <Sheet open={assign} onClose={() => setAssign(false)} title="Give this chat to" sub="They see it under Assigned to me">
        <ul className="flex flex-col">
          {['Ravi Teja', 'Imran Shaikh', 'Suresh Babu', 'Kavitha Nair', 'Venkatesh Goud', 'Anita Sharma', 'Divya Menon'].map((n) => {
            const s = STAFF.find((x) => x.name === n);
            return <li key={n}><Row avatar={n} title={n} sub={s ? s.desig : 'Admission Counsellor'} right={cur && cur.assigned === n ? <Pill tone="brand">Now</Pill> : null} onClick={() => { setAssigned(n); setAssign(false); }} /></li>;
          })}
        </ul>
      </Sheet>
    </div>
  );
}

/* ======================= Message History ======================= */
const HISTORY = [
  { id: 'M-26-1189', at: 'Sat 10 Oct, 7:30 AM', by: 'Prakash Joshi', ch: ['WhatsApp', 'App'], backup: true, title: 'Half-yearly exams start Monday', n: 412, del: 0, read: 0, fail: 0, cost: 824, status: 'Scheduled' },
  { id: 'M-26-1188', at: 'Today, 10:05 AM', by: 'Absence message', rule: true, ch: ['WhatsApp'], backup: true, title: 'Absent today', n: 52, del: 50, read: 43, fail: 2, sms: 4, cost: 56 },
  { id: 'M-26-1187', at: 'Today, 9:20 AM', by: 'Lakshmi Rao', ch: ['WhatsApp', 'App'], title: 'Fire drill today at 1:15 PM', n: 973, del: 951, read: 802, fail: 22, cost: 973 },
  { id: 'M-26-1186', at: 'Today, 7:52 AM', by: 'Venkatesh Goud', ch: ['WhatsApp', 'SMS'], title: 'Bus 3 running 15 minutes late', n: 36, del: 36, read: 33, fail: 0, cost: 72 },
  { id: 'M-26-1185', at: 'Today, 7:30 AM', by: 'Birthday wishes', rule: true, ch: ['WhatsApp'], title: 'Happy birthday', n: 6, del: 6, read: 5, fail: 0, cost: 6 },
  { id: 'M-26-1184', at: 'Yesterday, 6:30 PM', by: 'Fee due reminder', rule: true, ch: ['WhatsApp'], backup: true, title: 'Fee reminder · Tuition Q3', n: 61, del: 58, read: 44, fail: 3, sms: 17, cost: 78 },
  { id: 'M-26-1183', at: 'Yesterday, 4:10 PM', by: 'Ravi Teja', ch: ['WhatsApp'], title: '7 B: Science project due Monday 26 Oct', n: 37, del: 37, read: 31, fail: 0, cost: 37 },
  { id: 'M-26-1182', at: 'Yesterday, 1:05 PM', by: 'Imran Shaikh', ch: ['WhatsApp'], title: 'Maths revision before the exam', n: 155, del: 151, read: 128, fail: 4, cost: 155 },
  { id: 'M-26-1181', at: 'Yesterday, 11:40 AM', by: 'Kavitha Nair', ch: ['WhatsApp'], title: 'Lunch box at reception', n: 1, del: 1, read: 1, fail: 0, cost: 1 },
  { id: 'M-26-1180', at: '8 Oct, 9:00 AM', by: 'Anita Sharma', ch: ['WhatsApp', 'SMS'], title: 'PTM on Saturday 17 October', n: 640, del: 629, read: 540, fail: 11, cost: 1280 },
  { id: 'M-26-1179', at: '8 Oct, 8:15 AM', by: 'Shalini Verma', ch: ['App', 'Email'], title: 'Diwali week leave plans', n: 86, del: 86, read: 71, fail: 0, cost: 0 },
  { id: 'M-26-1178', at: '7 Oct, 5:20 PM', by: 'Suresh Babu', ch: ['WhatsApp'], title: 'Payment link · Tuition Q3', n: 140, del: 137, read: 118, fail: 3, cost: 140 },
  { id: 'M-26-1177', at: '7 Oct, 3:30 PM', by: 'Divya Menon', ch: ['WhatsApp'], title: 'Admission test on Sat 7 Nov', n: 48, del: 47, read: 39, fail: 1, cost: 48 },
  { id: 'M-26-1176', at: '7 Oct, 12:10 PM', by: 'Prakash Joshi', ch: ['App'], title: 'Admit cards on 10 October', n: 470, del: 470, read: 402, fail: 0, cost: 0 },
  { id: 'M-26-1175', at: '6 Oct, 2:00 PM', by: 'Naveen Kumar', ch: ['WhatsApp'], title: 'Bonafide certificate ready', n: 1, del: 1, read: 1, fail: 0, cost: 1 },
  { id: 'M-26-1174', at: '5 Oct, 6:00 PM', by: 'Anita Sharma', ch: ['Email'], title: 'School newsletter · September 2026', n: 1018, del: 1004, read: 466, fail: 14, cost: 0 },
  { id: 'M-26-1173', at: '5 Oct, 11:00 AM', by: 'Sana Ali', ch: ['WhatsApp'], title: 'Meeting request', n: 1, del: 1, read: 1, fail: 0, cost: 1 },
  { id: 'M-26-1172', at: '3 Oct, 10:00 AM', by: 'Lakshmi Rao', ch: ['WhatsApp', 'App'], title: 'Dussehra holidays 19–25 October', n: 1104, del: 1079, read: 968, fail: 25, cost: 1018 },
  { id: 'M-26-1171', at: '2 Oct, 9:30 AM', by: 'Meena Pillai', ch: ['App'], title: 'Half-yearly question papers due 5 Oct', n: 58, del: 58, read: 55, fail: 0, cost: 0 },
];
const FAIL_WHY = ['Number not on WhatsApp', 'Phone switched off for 24 hours', 'Invalid number'];
function recipientsOf(m) {
  if (m.n === 1) return [{ id: 'r0', name: m.by === 'Sana Ali' ? 'Farida Khan' : 'Priya Sharma', sub: m.by === 'Sana Ali' ? 'Mother of Kabir Khan, 8 A' : 'Mother of Aarav Sharma, 7 B', st: 'Read', t: '11:52 AM', ch: 'WhatsApp' }];
  const staff = m.ch.every((c) => c === 'App' || c === 'Email') && m.n < 100;
  const base = staff ? STAFF.map((s) => ({ name: s.name, sub: s.desig })) : CLASS_7B.map((s) => ({ name: s.id === FEATURED.id ? 'Priya Sharma' : s.father, sub: `Parent of ${s.name}, 7 B` }));
  const L = Math.min(base.length, m.n);
  const nFail = m.fail ? Math.max(1, Math.round((L * m.fail) / m.n)) : 0;
  const nDel = Math.round((L * (m.del - m.read)) / m.n);
  return base.slice(0, L).map((p, i) => {
    const k = (i * 7) % L;
    let st = k < nFail ? 'Failed' : k < nFail + nDel ? 'Delivered' : 'Read';
    let why = st === 'Failed' ? FAIL_WHY[i % 3] : '';
    if (m.status === 'Scheduled') { st = 'Queued'; why = ''; }
    if (m.backup && m.status !== 'Scheduled' && (st === 'Failed' || (st === 'Delivered' && i % 2))) { why = st === 'Failed' ? `WhatsApp failed: ${why.toLowerCase()}` : 'Not read in 2 hours'; st = 'SMS backup'; }
    return { id: 'r' + i, ...p, st, why, t: st === 'Queued' ? '—' : `${['10:06', '10:07', '10:09', '10:15', '10:31'][i % 5]} AM`, ch: st === 'SMS backup' ? 'SMS' : m.ch[0] };
  });
}
const RST_TONE = { Read: 'ok', Delivered: 'info', Sent: 'neutral', Queued: 'neutral', Failed: 'bad', 'SMS backup': 'warn' };

function History({ access, params }) {
  const { role } = useRole();
  const { go } = useNav();
  const full = access === 'full';
  const me = role.person.name;
  const [mode, setMode] = useState('all');
  const [chF, setChF] = useState('all');
  const [stF, setStF] = useState('all');
  const [q, setQ] = useState('');
  const mine = HISTORY.filter((m) => full || m.by === me);
  const rows = mine.filter((m) => (chF === 'all' || m.ch.includes(chF)) && (stF === 'all' || (stF === 'fail' ? m.fail > 0 : stF === 'sched' ? m.status === 'Scheduled' : m.rule)) && (!q || (m.title + m.by).toLowerCase().includes(q.toLowerCase())));
  if (params?.id) {
    const m = HISTORY.find((x) => x.id === params.id) || { ...HISTORY[2], id: params.id, at: 'Today, 10:44 AM', by: me, title: 'Half-yearly exams start Monday', n: 412, del: 389, read: 251, fail: 6, cost: 824, backup: true };
    return <MessageDetail m={m} onBack={() => go('communication', { page: 'history' })} />;
  }
  const sent = mine.filter((m) => m.status !== 'Scheduled');
  const tot = sent.reduce((a, m) => ({ n: a.n + m.n, del: a.del + m.del, read: a.read + m.read, fail: a.fail + m.fail, cost: a.cost + m.cost }), { n: 0, del: 0, read: 0, fail: 0, cost: 0 });
  return (
    <div>
      <ModuleHead sub={full ? 'Everything sent: by people, by automatic rules and with notices. Open one to see each person’s status.' : 'Only messages you sent. Open one to see each person’s status.'}
        actions={<Button variant="primary" icon={I.Send} onClick={() => go('communication', { page: 'send' })}>Send message</Button>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Stats items={[
          { label: 'Messages sent', value: fmt(sent.length), sub: 'Since 2 October', icon: 'Send' },
          { label: 'People reached', value: fmt(tot.n), sub: 'One line per person', icon: 'Users' },
          { label: 'Delivered', value: tot.n ? `${Math.round((tot.del / tot.n) * 1000) / 10}%` : '—', sub: `${fmt(tot.del)} people`, tone: 'ok', icon: 'CheckCheck' },
          { label: 'Read', value: tot.n ? `${Math.round((tot.read / tot.n) * 100)}%` : '—', sub: `${fmt(tot.read)} people`, icon: 'Eye' },
          { label: 'Failed', value: fmt(tot.fail), sub: 'Retry up to 3 times', tone: tot.fail ? 'bad' : undefined, icon: 'CircleAlert' },
        ]} />
        <Card className="overflow-hidden">
          <Toolbar>
            <Segmented value={mode} onChange={setMode} options={[{ value: 'all', label: 'All messages' }, { value: 'person', label: 'One person' }]} />
            {mode === 'all' && <>
              <SearchBox value={q} onChange={setQ} placeholder="Title or sender" id="hist-search" />
              <Select id="hist-ch" value={chF} onChange={setChF} options={[{ value: 'all', label: 'All channels' }, { value: 'WhatsApp', label: 'WhatsApp' }, { value: 'SMS', label: 'SMS' }, { value: 'Email', label: 'Email' }, { value: 'App', label: 'App notice' }]} className="@md:w-44" />
              <Select id="hist-st" value={stF} onChange={setStF} options={[{ value: 'all', label: 'Any status' }, { value: 'fail', label: 'Has failed' }, { value: 'sched', label: 'Scheduled' }, ...(full ? [{ value: 'rule', label: 'Automatic' }] : [])]} className="@md:w-40" />
              <ExportButton what="message history" />
            </>}
          </Toolbar>
          {mode === 'person' ? <PersonView /> : (
            <DataList rows={rows} onRow={(m) => go('communication', { page: 'history', id: m.id })} minWidth={880}
              empty={<Empty icon={I.History} title={mine.length ? 'Nothing matches' : 'You have not sent any messages yet'} body={mine.length ? 'Try another channel or status.' : 'Messages you send show up here with each person’s status.'} action={<Button variant="secondary" icon={I.Send} onClick={() => go('communication', { page: 'send' })}>Send a message</Button>} />}
              footer={`${rows.length} messages`}
              columns={[
                { key: 'at', label: 'When', nowrap: true, render: (m) => <span className="tnum text-[13px]">{m.at}</span> },
                { key: 'title', label: 'Message', render: (m) => <div className="max-w-[260px]"><p className="font-semibold leading-snug truncate">{m.title}</p><p className="text-[12.5px] text-ink3 flex items-center gap-1">{m.rule && <I.Zap size={12} />}{m.by}</p></div> },
                { key: 'ch', label: 'Channel', render: (m) => <ChannelPills ch={m.ch} backup={m.backup} /> },
                { key: 'n', label: 'To', align: 'right', render: (m) => fmt(m.n) },
                { key: 'del', label: 'Delivered', align: 'right', render: (m) => (m.status === 'Scheduled' ? <Pill tone="info">Scheduled</Pill> : <span className="text-ok font-semibold">{fmt(m.del)}</span>) },
                { key: 'read', label: 'Read', align: 'right', render: (m) => (m.status === 'Scheduled' ? '—' : fmt(m.read)) },
                { key: 'fail', label: 'Failed', align: 'right', render: (m) => (m.fail ? <span className="text-bad font-semibold">{m.fail}</span> : <span className="text-ink3">0</span>) },
                { key: 'cost', label: 'Credits', align: 'right', render: (m) => (m.cost ? fmt(m.cost) : 'Free') },
              ]}
              mobile={(m) => ({ title: m.title, sub: `${m.at} · ${m.by}`, icon: m.ch.includes('WhatsApp') ? 'MessageCircle' : m.ch.includes('Email') ? 'Mail' : 'Bell', iconTone: m.fail ? 'bad' : 'ok',
                pills: m.status === 'Scheduled' ? [<Pill key="s" tone="info" className="!h-[22px] !text-[11.5px]">Scheduled · {fmt(m.n)}</Pill>] : [<Pill key="d" tone="ok" className="!h-[22px] !text-[11.5px]">{fmt(m.del)} of {fmt(m.n)} delivered</Pill>, m.fail > 0 && <Pill key="f" tone="bad" className="!h-[22px] !text-[11.5px]">{m.fail} failed</Pill>] })} />
          )}
        </Card>
      </div>
    </div>
  );
}

function PersonView() {
  const [q, setQ] = useState('');
  const [who, setWho] = useState('Priya Sharma');
  const people = ['Priya Sharma', 'Kumar Reddy', 'Mahesh Gupta', 'Ravi Teja'];
  const found = q.trim() ? people.filter((p) => p.toLowerCase().includes(q.toLowerCase())) : [];
  return (
    <div className="p-4 @md:p-5 grid @lg:grid-cols-[280px_minmax(0,1fr)] gap-5 items-start">
      <div className="flex flex-col gap-2">
        <SearchBox value={q} onChange={setQ} placeholder="Parent, student or staff" id="hist-person" />
        {found.map((p) => <Row key={p} avatar={p} title={p} onClick={() => { setWho(p); setQ(''); }} />)}
        <div className="rounded-xl border border-line p-3 flex items-center gap-3 mt-1">
          <Avatar name={who} size={40} />
          <div className="min-w-0"><p className="font-semibold text-[14.5px]">{who}</p><p className="text-[12.5px] text-ink3">{who === 'Priya Sharma' ? 'Mother of Aarav (7 B) and Anaya (UKG A)' : who === 'Ravi Teja' ? 'Staff · Class teacher, 7 B' : 'Parent'}</p></div>
        </div>
        <p className="text-[12.5px] text-ink3">All channels, newest first. Also on the student’s profile.</p>
      </div>
      <Timeline items={[
        { icon: 'MessageCircle', tone: 'brand', what: <>WhatsApp from {who.split(' ')[0]}: “Can Aarav leave early on Monday after the exam?” <span className="text-ink3">· answered by Ravi Teja</span></>, when: 'Today, 10:30 AM' },
        { icon: 'MessageCircle', tone: 'ok', what: 'Fee reminder · Tuition Q3 · read', when: 'Yesterday, 6:30 PM · read 6:52 PM' },
        { icon: 'Megaphone', tone: 'ok', what: 'Notice: Parent–teacher meeting on Saturday, 17 October · seen on Parent Link', when: '8 Oct, 9:00 AM · seen 8:14 PM' },
        { icon: 'MessageSquareText', tone: 'warn', what: 'Fee reminder by SMS backup (WhatsApp not read in 2 hours)', when: '6 Oct, 8:30 PM' },
        { icon: 'Megaphone', tone: 'ok', what: 'Dussehra holidays 19–25 October · read', when: '3 Oct, 10:00 AM' },
        { icon: 'Award', tone: 'ok', what: 'Unit Test 2 report card on Parent Link · opened', when: '28 Sep, 5:10 PM' },
        { icon: 'ReceiptText', tone: 'ok', what: 'Receipt R/26/04412 · ₹10,000 · read', when: '12 Jul, 11:02 AM' },
      ]} />
    </div>
  );
}

function MessageDetail({ m, onBack }) {
  const toast = useToast();
  const [f, setF] = useState('all');
  const [q, setQ] = useState('');
  const [tries, setTries] = useState(0);
  const [resend, setResend] = useState(null);
  const [rch, setRch] = useState('SMS');
  const [cancelled, setCancelled] = useState(false);
  const [cancel, setCancel] = useState(false);
  const all = recipientsOf(m);
  const rows = all.filter((r) => (f === 'all' || r.st === f) && (!q || r.name.toLowerCase().includes(q.toLowerCase())));
  const unread = Math.max(0, m.n - m.read - m.fail);
  const sched = m.status === 'Scheduled' && !cancelled;
  const cnt = (s) => all.filter((r) => r.st === s).length;
  return (
    <div>
      <BackLink label="Message History" sub={m.id} onClick={onBack} />
      <div className="flex flex-col @md:flex-row @md:items-end @md:justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h1 className="font-display text-[24px] @md:text-[28px] font-semibold tracking-tight leading-tight">{m.title}</h1>
          <p className="text-[14px] text-ink3 mt-1 flex items-center gap-2 flex-wrap">{m.at} · {m.rule ? 'Automatic rule' : 'Sent by'} {m.by} <ChannelPills ch={m.ch} backup={m.backup} /></p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {sched ? <Button variant="dangerSoft" icon={I.X} onClick={() => setCancel(true)}>Cancel scheduled message</Button> : cancelled ? <Pill tone="neutral">Cancelled · not sent</Pill> : <>
            {m.fail > 0 && <Button variant="secondary" icon={I.RotateCcw} disabled={tries >= 3} onClick={() => { setTries(tries + 1); toast({ title: `Retrying ${m.fail} failed`, body: `Try ${tries + 1} of 3.` }); }}>Retry failed{tries ? ` (${3 - tries} left)` : ''}</Button>}
            {m.fail > 0 && <Button variant="secondary" icon={I.MessageSquareText} onClick={() => { setRch('SMS'); setResend('failed'); }}>Resend failed by SMS</Button>}
            {unread > 0 && <Button variant="primary" icon={I.Send} onClick={() => { setRch(m.ch[0] === 'Email' ? 'WhatsApp' : 'SMS'); setResend('unread'); }}>Resend to {fmt(unread)} unread</Button>}
          </>}
        </div>
      </div>
      <div className="flex flex-col gap-5 @lg:gap-6">
        {sched && <Banner tone="info" title="Scheduled for Sat 10 Oct, 7:30 AM.">Nobody has received it yet. You can cancel it until it goes.</Banner>}
        <Stats items={[
          { label: 'Recipients', value: fmt(m.n), icon: 'Users' },
          { label: 'Delivered', value: fmt(m.del), tone: 'ok', icon: 'CheckCheck', sub: m.n ? `${Math.round((m.del / m.n) * 100)}%` : '' },
          { label: 'Read', value: fmt(m.read), icon: 'Eye', sub: m.n ? `${Math.round((m.read / m.n) * 100)}%` : '' },
          { label: 'Failed', value: fmt(m.fail), tone: m.fail ? 'bad' : undefined, icon: 'CircleAlert', sub: m.sms ? `${m.sms} also sent by SMS backup` : m.fail ? FAIL_WHY[0] : 'None' },
          { label: 'Credits', value: m.cost ? fmt(m.cost) : 'Free', icon: 'Coins', sub: m.backup ? 'Includes SMS backup' : '' },
        ]} />
        <Split side={340}>
          <Card className="overflow-hidden min-w-0">
            <Toolbar>
              <SearchBox value={q} onChange={setQ} placeholder="Name" id="msg-rcpt-search" />
              <Select id="msg-rcpt-st" value={f} onChange={setF} options={[{ value: 'all', label: `Everyone · ${all.length}` }, ...['Read', 'Delivered', 'SMS backup', 'Failed', 'Queued'].filter((s) => cnt(s)).map((s) => ({ value: s, label: `${s} · ${cnt(s)}` }))]} className="@md:w-48" />
              <ExportButton what="recipients" />
            </Toolbar>
            <DataList rows={rows} minWidth={600} footer={`Showing ${rows.length} of ${fmt(m.n)} · the rest load as you scroll`}
              columns={[
                { key: 'name', label: 'Recipient', render: (r) => <div className="flex items-center gap-2.5"><Avatar name={r.name} size={32} /><div><p className="font-semibold leading-tight">{r.name}</p><p className="text-[12.5px] text-ink3">{r.sub}</p></div></div> },
                { key: 'ch', label: 'Channel', render: (r) => <span className="text-[13px]">{CH[r.ch]?.label || r.ch}</span> },
                { key: 'st', label: 'Status', render: (r) => <div><Pill tone={RST_TONE[r.st]} dot>{r.st === 'SMS backup' ? 'Sent by SMS backup' : r.st}</Pill>{r.why && <p className="text-[12px] text-ink3 mt-0.5">{r.why}</p>}</div> },
                { key: 't', label: 'Time', align: 'right', render: (r) => r.t },
              ]}
              mobile={(r) => ({ title: r.name, sub: r.why || r.sub, avatar: r.name, right: <Pill tone={RST_TONE[r.st]} className="!h-[22px] !text-[11.5px]">{r.st}</Pill> })} />
          </Card>
          <Card>
            <CardHead title="The message" sub={m.rule ? `Automatic: ${m.by}` : `By ${m.by}`} icon={I.MessageSquareText} />
            <div className="px-5 pb-5">
              <div className="rounded-2xl rounded-tl-md bg-sunken/70 p-3.5 text-[14px] leading-relaxed">{fill(m.title.startsWith('Fee') ? TEMPLATES[0].text : m.title.startsWith('Absent') ? TEMPLATES[3].text : MSGS.exam.en, { name: 'Priya Sharma', student: 'Aarav Sharma', cls: '7 B', due: 30650 })}</div>
              <p className="text-[12.5px] text-ink3 mt-2">Shown as Priya Sharma received it. Each person’s copy fills in their own details.</p>
            </div>
          </Card>
        </Split>
      </div>
      <ConfirmSheet open={!!resend} onClose={() => setResend(null)} title={resend === 'failed' ? `Resend to ${m.fail} failed by SMS?` : `Resend to ${fmt(unread)} who have not read it?`}
        sub={resend === 'failed' ? 'Only the people whose message failed.' : 'Everyone not yet at Read. Those who read it are left out.'}
        confirmLabel={resend === 'failed' ? `Resend to ${m.fail} by SMS` : `Resend to ${fmt(unread)} by ${rch}`}
        onConfirm={() => toast({ title: `Resent to ${fmt(resend === 'failed' ? m.fail : unread)} people by ${rch}`, body: `${fmt(resend === 'failed' ? m.fail : unread)} credits used.` })}>
        {resend === 'unread' && <Segmented value={rch} onChange={setRch} options={['WhatsApp', 'SMS']} />}
        <p className="text-[13.5px] text-ink2 mt-3 tnum">Cost: {fmt(resend === 'failed' ? m.fail : unread)} credits of {fmt(BALANCE)} available.{rch === 'SMS' ? ' Uses the approved SMS template with its DLT template ID.' : ''}</p>
      </ConfirmSheet>
      <ConfirmSheet open={cancel} onClose={() => setCancel(false)} danger title="Cancel this scheduled message?" sub={`It was going to ${fmt(m.n)} people on Sat 10 Oct, 7:30 AM. Nobody will receive it.`}
        confirmLabel="Cancel the message" onConfirm={() => { setCancelled(true); toast({ title: 'Scheduled message cancelled', body: 'It will not be sent. No credits used.' }); }} />
    </div>
  );
}

/* ======================= Feedback & Queries ======================= */
const QST_TONE = { Open: 'warn', 'In progress': 'info', Resolved: 'ok', Closed: 'neutral' };
const QPRI_TONE = { Urgent: 'bad', High: 'warn', Normal: 'neutral', Low: 'neutral' };
const QUERIES = [
  { id: 'Q-26-0148', from: 'Priya Sharma', fromKind: 'Parent', about: 'Aarav Sharma, 7 B', type: 'Query', topic: 'Fees', pri: 'Normal', owner: 'Accounts', ownerP: 'Suresh Babu', status: 'Open', age: '2 hours', due: 'Today, 5:00 PM', came: 'WhatsApp', text: 'A late fee of ₹250 is shown on Tuition Q2, but we paid ₹10,000 on 12 July. Why is there a late fee?' },
  { id: 'Q-26-0147', from: 'Kumar Reddy', fromKind: 'Parent', about: 'Harini Reddy, 7 B', type: 'Complaint', topic: 'Transport', pri: 'High', owner: 'Transport', ownerP: 'Venkatesh Goud', status: 'In progress', age: '1 day', due: 'Overdue by 3 hours', overdue: true, came: 'Phone', text: 'Bus 4 skipped the KPHB 6th Phase stop twice this week. My daughter waited 25 minutes.' },
  { id: 'Q-26-0146', from: 'Mahesh Gupta', fromKind: 'Parent', about: 'Rohan Gupta, 6 A', type: 'Complaint', topic: 'Teaching', pri: 'Normal', owner: 'Academic Head', ownerP: 'Meena Pillai', status: 'Open', age: '1 day', due: 'Tomorrow', came: 'Visit', text: 'Hindi homework is not being checked for the last two weeks.' },
  { id: 'Q-26-0145', from: 'Farhana Begum', fromKind: 'Staff', about: 'Physics lab', type: 'Staff ticket', topic: 'Facility', pri: 'High', owner: 'Stores', ownerP: 'Ramu Yadav', status: 'In progress', age: '2 days', due: 'Overdue by 1 day', overdue: true, came: 'App', text: 'Two ceiling fans in the Physics lab are not working. Practicals start on 2 November.' },
  { id: 'Q-26-0144', from: 'Lasya Rao', fromKind: 'Student', about: 'Library card', type: 'Query', topic: 'Library', pri: 'Low', owner: 'Library', ownerP: 'Padma Iyer', status: 'Open', age: '2 days', due: '12 Oct', came: 'Visit', text: 'I lost my library card. How do I get a new one?' },
  { id: 'Q-26-0143', from: 'Swathi Varma', fromKind: 'Parent', about: 'Admission, Nursery 2027–28', type: 'Query', topic: 'Admission', pri: 'Normal', owner: 'Admissions', ownerP: 'Divya Menon', status: 'In progress', age: '3 days', due: '12 Oct', came: 'WhatsApp', text: 'Is there a sibling concession if the elder child is in Class 3?' },
  { id: 'Q-26-0142', from: 'Venkat Iyer', fromKind: 'Parent', about: 'Meera Iyer, 2 B', type: 'Suggestion', topic: 'Food', pri: 'Low', owner: 'Office', ownerP: 'Anita Sharma', status: 'Open', age: '4 days', due: '14 Oct', came: 'Email', text: 'Could the canteen add a fruit option at the 10:15 AM break?' },
  { id: 'Q-26-0141', from: 'Sunita Das', fromKind: 'Parent', about: 'Rahul Das, 5 B', type: 'Query', topic: 'Certificates', pri: 'Normal', owner: 'Office', ownerP: 'Naveen Kumar', status: 'Resolved', age: '5 days', due: '—', came: 'WhatsApp', text: 'Need a bonafide certificate for the passport office.', rating: 5 },
  { id: 'Q-26-0139', from: 'Gopal Rao', fromKind: 'Parent', about: 'Pranav Rao, 10 B', type: 'Complaint', topic: 'Discipline', pri: 'High', owner: 'Vice Principal', ownerP: 'Srinivas Murthy', status: 'Closed', age: '8 days', due: '—', came: 'Visit', text: 'A senior student was rude to Pranav at the bus bay.', rating: 4 },
  { id: 'Q-26-0137', from: 'Deepak Verma', fromKind: 'Staff', about: 'Leave balance', type: 'Staff ticket', topic: 'HR', pri: 'Low', owner: 'HR', ownerP: 'Shalini Verma', status: 'Resolved', age: '9 days', due: '—', came: 'App', text: 'My casual leave balance looks wrong after the August correction.', rating: 4 },
];

function Feedback({ params }) {
  const { go } = useNav();
  const toast = useToast();
  const [items, setItems] = useState(QUERIES);
  const [st, setSt] = useState('active');
  const [type, setType] = useState('all');
  const [q, setQ] = useState('');
  const [add, setAdd] = useState(false);
  if (params?.id) {
    const t = items.find((x) => x.id === params.id) || items[0];
    return <QueryDetail t={t} onBack={() => go('communication', { page: 'feedback' })} onChange={(n) => setItems((x) => x.map((y) => (y.id === n.id ? n : y)))} />;
  }
  const rows = items.filter((t) => (st === 'active' ? ['Open', 'In progress'].includes(t.status) : st === 'overdue' ? t.overdue : st === 'done' ? ['Resolved', 'Closed'].includes(t.status) : true)
    && (type === 'all' || t.type === type) && (!q || (t.id + t.from + t.about + t.topic).toLowerCase().includes(q.toLowerCase())));
  return (
    <div>
      <ModuleHead sub="Questions and complaints from parents, students and staff. Each gets a number, an owner and a status."
        actions={<Button variant="primary" icon={I.Plus} onClick={() => setAdd(true)}>Log a query</Button>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Stats items={[
          { label: 'Open', value: '11', icon: 'Inbox', tone: 'warn', onClick: () => setSt('active') },
          { label: 'In progress', value: '6', icon: 'LoaderCircle', tone: 'info', onClick: () => setSt('active') },
          { label: 'Overdue', value: '2', icon: 'Clock', tone: 'bad', sub: 'Sent up the line', onClick: () => setSt('overdue') },
          { label: 'Resolved in October', value: '38', icon: 'CircleCheck', tone: 'ok', onClick: () => setSt('done') },
          { label: 'Time to resolve', value: '1.6 days', icon: 'Timer', sub: 'Average' },
          { label: 'Satisfaction', value: '4.3 of 5', icon: 'Star', sub: '29 ratings' },
        ]} />
        <Card className="overflow-hidden min-w-0">
            <Toolbar>
              <SearchBox value={q} onChange={setQ} placeholder="Ticket no., name or topic" id="q-search" />
              <Segmented value={st} onChange={setSt} options={[{ value: 'active', label: 'Open' }, { value: 'overdue', label: 'Overdue' }, { value: 'done', label: 'Resolved' }, { value: 'all', label: 'All' }]} />
            </Toolbar>
            <div className="px-3 py-2.5 border-b border-line flex items-center gap-2 flex-wrap">
              <span className="text-[12.5px] text-ink3 font-semibold mr-1">Type</span>
              {['all', 'Query', 'Complaint', 'Suggestion', 'Staff ticket'].map((x) => (
                <button key={x} onClick={() => setType(x)} className={cx('h-8 px-3 rounded-lg text-[13px] font-semibold transition', type === x ? 'bg-ink text-bg' : 'text-ink2 hover:bg-sunken')}>{x === 'all' ? 'All' : x}</button>
              ))}
              <ExportButton what="queries" className="ml-auto !h-8" />
            </div>
            <DataList rows={rows} onRow={(t) => go('communication', { page: 'feedback', id: t.id })} minWidth={880} footer={`${rows.length} ${rows.length === 1 ? 'query' : 'queries'}`}
              empty={<Empty icon={I.Inbox} title="No queries here" body="Nothing matches this filter." action={<Button variant="secondary" onClick={() => { setSt('all'); setType('all'); setQ(''); }}>Show all</Button>} />}
              columns={[
                { key: 'id', label: 'Ticket', nowrap: true, render: (t) => <span className="font-mono text-[12.5px]">{t.id}</span> },
                { key: 'from', label: 'From', render: (t) => <div><p className="font-semibold leading-tight">{t.from}</p><p className="text-[12.5px] text-ink3">{t.fromKind} · {t.about}</p></div> },
                { key: 'topic', label: 'Type', render: (t) => <span className="text-[13px]">{t.type}<span className="block text-ink3 text-[12px]">{t.topic}</span></span> },
                { key: 'pri', label: 'Priority', render: (t) => <Pill tone={QPRI_TONE[t.pri]}>{t.pri}</Pill> },
                { key: 'owner', label: 'Owner', render: (t) => <span className="text-[13px]">{t.ownerP}<span className="block text-ink3 text-[12px]">{t.owner}</span></span> },
                { key: 'status', label: 'Status', render: (t) => <Pill tone={QST_TONE[t.status]} dot>{t.status}</Pill> },
                { key: 'due', label: 'Due by', nowrap: true, render: (t) => <span className={cx('text-[13px]', t.overdue && 'text-bad font-semibold')}>{t.due}<span className="block text-ink3 text-[12px] font-normal">{t.age} old</span></span> },
              ]}
              mobile={(t) => ({ title: `${t.from} · ${t.topic}`, sub: `${t.id} · ${t.about}`, icon: t.type === 'Complaint' ? 'TriangleAlert' : t.type === 'Staff ticket' ? 'Wrench' : 'MessageSquareText', iconTone: t.overdue ? 'bad' : QST_TONE[t.status],
                pills: [<Pill key="s" tone={QST_TONE[t.status]} className="!h-[22px] !text-[11.5px]">{t.status}</Pill>, t.overdue && <Pill key="o" tone="bad" className="!h-[22px] !text-[11.5px]">Overdue</Pill>, t.pri !== 'Normal' && <Pill key="p" tone={QPRI_TONE[t.pri]} className="!h-[22px] !text-[11.5px]">{t.pri}</Pill>] })} />
          </Card>
          <div className="grid grid-cols-1 @xl:grid-cols-2 gap-5 @lg:gap-6 items-start">
            <Card>
              <CardHead title="Feedback by topic" sub="All queries and feedback this term" icon={I.ChartColumn} />
              <div className="px-5 pb-5"><HBars rows={[{ k: 'Transport', v: 14 }, { k: 'Fees', v: 11 }, { k: 'Teaching', v: 9 }, { k: 'Food', v: 7 }, { k: 'Facility', v: 5 }, { k: 'Admission', v: 4 }]} max={16} unit="" labelWidth={78} /></div>
            </Card>
            <Card>
              <CardHead title="Reply time targets" sub="Overdue queries go to the next person" icon={I.Timer} />
              <ul className="px-5 pb-4 flex flex-col gap-2 text-[13.5px]">
                {[['Complaint', '24 hours', 'Vice Principal'], ['Query', '2 working days', 'School Admin'], ['Staff ticket', '3 working days', 'School Admin'], ['Suggestion', '5 working days', 'School Admin']].map(([a, b, c]) => <li key={a} className="flex justify-between gap-3 py-1 border-b border-line/70 last:border-0"><span><b className="font-semibold">{a}</b> <span className="text-ink3">· then {c}</span></span><span className="tnum whitespace-nowrap">{b}</span></li>)}
              </ul>
            </Card>
          </div>
      </div>
      <QueryForm open={add} onClose={() => setAdd(false)} onSaved={(t) => { setItems((x) => [t, ...x]); toast({ title: `Query ${t.id} logged`, body: `Owner: ${t.ownerP}. ${t.from} was sent the ticket number.` }); }} />
    </div>
  );
}

function QueryForm({ open, onClose, onSaved }) {
  const blank = { from: '', about: '', type: 'Query', topic: 'Fees', text: '', pri: 'Normal', owner: 'Accounts', came: 'Phone' };
  const [f, setF] = useState(blank);
  const [tried, setTried] = useState(false);
  const owners = { Fees: 'Accounts', Transport: 'Transport', Teaching: 'Academic Head', Admission: 'Admissions', Facility: 'Stores', Food: 'Office', Library: 'Library', Other: 'Office' };
  const err = { from: !f.from.trim() ? 'Who is asking? Search a parent, student or staff, or type a name and phone' : '', text: f.text.trim().length < 10 ? 'Write what they asked, in a sentence or two' : '' };
  return (
    <FormSheet open={open} onClose={onClose} title="Log a query or complaint" sub="From a call, a visit, WhatsApp or a staff member. It gets a ticket number." submitLabel="Log query"
      onSubmit={() => { setTried(true); if (err.from || err.text) return false; onSaved({ ...f, id: 'Q-26-0149', fromKind: 'Parent', about: f.about || 'General', ownerP: { Accounts: 'Suresh Babu', Transport: 'Venkatesh Goud', 'Academic Head': 'Meena Pillai', Admissions: 'Divya Menon', Stores: 'Ramu Yadav', Office: 'Anita Sharma', Library: 'Padma Iyer' }[f.owner], status: 'Open', age: 'Just now', due: 'Today, 5:00 PM' }); setF(blank); setTried(false); }}>
      <Field label="From" required id="qf-from" error={tried && err.from}><Input id="qf-from" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} error={tried && err.from} placeholder="Parent, student or staff name, or phone" /></Field>
      <Field label="About (student)" id="qf-about" hint="Leave empty if it is not about one student"><Input id="qf-about" value={f.about} onChange={(e) => setF({ ...f, about: e.target.value })} placeholder="Student name and class" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type" required id="qf-type"><Select id="qf-type" value={f.type} onChange={(v) => setF({ ...f, type: v })} options={['Query', 'Complaint', 'Suggestion', 'Feedback']} /></Field>
        <Field label="Topic" required id="qf-topic"><Select id="qf-topic" value={f.topic} onChange={(v) => setF({ ...f, topic: v, owner: owners[v] })} options={Object.keys(owners)} /></Field>
      </div>
      <Field label="Details" required id="qf-text" error={tried && err.text}><Textarea id="qf-text" value={f.text} onChange={(v) => setF({ ...f, text: v })} rows={3} placeholder="What they asked or complained about" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Priority" required id="qf-pri"><Select id="qf-pri" value={f.pri} onChange={(v) => setF({ ...f, pri: v })} options={['Low', 'Normal', 'High', 'Urgent']} /></Field>
        <Field label="Owner" required id="qf-owner" hint="The topic’s usual owner"><Select id="qf-owner" value={f.owner} onChange={(v) => setF({ ...f, owner: v })} options={['Accounts', 'Transport', 'Academic Head', 'Admissions', 'Stores', 'Office', 'Library']} /></Field>
      </div>
      <Field label="Came by" id="qf-came"><Segmented value={f.came} onChange={(v) => setF({ ...f, came: v })} options={['Phone', 'Visit', 'WhatsApp', 'Email']} className="w-full" size="sm" /></Field>
    </FormSheet>
  );
}

function QueryDetail({ t, onBack, onChange }) {
  const toast = useToast();
  const [mode, setMode] = useState('reply');
  const [draft, setDraft] = useState('');
  const [thread, setThread] = useState([
    { kind: 'in', who: t.from, when: `${t.age} ago · ${t.came}`, text: t.text },
    { kind: 'note', who: 'Anita Sharma', when: 'Logged by the office', text: `Assigned to ${t.ownerP} (${t.owner}). Please reply today.` },
    ...(t.status !== 'Open' ? [{ kind: 'out', who: t.ownerP, when: 'Yesterday, 4:20 PM · WhatsApp', text: t.topic === 'Transport' ? 'Sorry for the trouble. We have spoken to the driver and will check the stop timings this week.' : 'Thank you. We are looking into this and will reply by tomorrow.' }] : []),
  ]);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [res, setRes] = useState('');
  const [assign, setAssign] = useState(false);
  const add = () => {
    if (!draft.trim()) return;
    setThread((x) => [...x, { kind: mode === 'reply' ? 'out' : 'note', who: 'You', when: `Today, 10:44 AM${mode === 'reply' ? ` · ${t.came === 'Visit' || t.came === 'Phone' ? 'WhatsApp' : t.came}` : ''}`, text: draft.trim() }]);
    if (t.status === 'Open') onChange({ ...t, status: 'In progress' });
    setDraft('');
  };
  return (
    <div>
      <BackLink label="Feedback & Queries" sub={t.id} onClick={onBack} />
      <div className="flex flex-col @md:flex-row @md:items-end @md:justify-between gap-3 mb-5">
        <div>
          <h1 className="font-display text-[24px] @md:text-[28px] font-semibold tracking-tight leading-tight">{t.topic}: {t.type.toLowerCase()} from {t.from}</h1>
          <div className="flex gap-1.5 mt-2 flex-wrap"><Pill tone={QST_TONE[t.status]} dot>{t.status}</Pill><Pill tone={QPRI_TONE[t.pri]}>{t.pri} priority</Pill>{t.overdue && <Pill tone="bad">{t.due}</Pill>}</div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={I.UserCheck} onClick={() => setAssign(true)}>Assign</Button>
          {['Open', 'In progress'].includes(t.status) ? <Button variant="primary" icon={I.CircleCheck} onClick={() => setResolveOpen(true)}>Resolve</Button>
            : t.status === 'Resolved' ? <Button variant="secondary" onClick={() => { onChange({ ...t, status: 'Closed' }); toast({ title: `${t.id} closed`, body: 'A 1 to 5 rating request went to the requester.' }); }}>Close</Button> : null}
        </div>
      </div>
      <Split side={340}>
        <Card className="min-w-0">
          <CardHead title="Conversation" sub="Internal notes never leave School OS" icon={I.MessagesSquare} />
          <ol className="px-5 flex flex-col gap-3">
            {thread.map((m, i) => (
              <li key={i} className={cx('rounded-2xl p-3.5 text-[14px]', m.kind === 'in' ? 'bg-sunken/70 mr-6' : m.kind === 'out' ? 'bg-brand/8 ml-6' : 'bg-warn/8 border border-warn/25')}>
                <p className="text-[12.5px] font-semibold flex items-center gap-1.5 mb-1">{m.kind === 'note' && <I.Lock size={13} className="text-warn" />}{m.who}{m.kind === 'note' && <span className="text-warn">· Internal note</span>}<span className="text-ink3 font-normal ml-auto">{m.when}</span></p>
                <p className="leading-relaxed">{m.text}</p>
              </li>
            ))}
          </ol>
          <div className="p-5 flex flex-col gap-2.5">
            <Segmented size="sm" value={mode} onChange={setMode} options={[{ value: 'reply', label: `Reply to ${t.from.split(' ')[0]}` }, { value: 'note', label: 'Internal note', icon: I.Lock }]} className="self-start" />
            <Textarea id="q-reply" value={draft} onChange={setDraft} rows={3} placeholder={mode === 'reply' ? `Goes to ${t.from} by ${t.came === 'Email' ? 'email' : 'WhatsApp'}` : 'Only staff can see this'} />
            <Button variant={mode === 'reply' ? 'primary' : 'secondary'} icon={mode === 'reply' ? I.Send : I.Lock} disabled={!draft.trim()} onClick={add} className="self-end">{mode === 'reply' ? 'Send reply' : 'Add note'}</Button>
          </div>
        </Card>
        <Col>
          <Card>
            <CardHead title="Details" />
            <DL cols={1} rows={[['From', `${t.from} · ${t.fromKind}`], ['About', t.about], ['Type and topic', `${t.type} · ${t.topic}`], ['Owner', `${t.ownerP} (${t.owner})`], ['Came by', t.came], ['Due by', t.due], ...(t.rating ? [['Rating', `${t.rating} of 5`]] : [])]} />
          </Card>
          <Card>
            <CardHead title="History" />
            <div className="px-5"><Timeline items={[
              { icon: 'UserCheck', what: `Assigned to ${t.ownerP}`, when: `${t.age} ago` },
              { icon: 'Send', what: `Ticket number sent to ${t.from} on WhatsApp`, when: `${t.age} ago` },
              { icon: 'Plus', tone: 'brand', what: `Logged from a ${t.came.toLowerCase()} by the office`, when: `${t.age} ago` },
            ]} /></div>
          </Card>
        </Col>
      </Split>
      <FormSheet open={resolveOpen} onClose={() => setResolveOpen(false)} title={`Resolve ${t.id}`} sub="The resolution is sent to the requester and kept on the ticket." submitLabel="Resolve"
        onSubmit={() => { if (res.trim().length < 5) return false; onChange({ ...t, status: 'Resolved' }); toast({ title: `${t.id} resolved`, body: `${t.from} was told on WhatsApp.` }); }}>
        <Field label="Resolution notes" required id="q-res" error={res.trim().length < 5 ? 'Say what was done, in a sentence' : ''}><Textarea id="q-res" value={res} onChange={setRes} rows={3} placeholder="For example: Late fee of ₹250 removed; payment of 12 July was recorded late." /></Field>
      </FormSheet>
      <Sheet open={assign} onClose={() => setAssign(false)} title="Assign to" sub="A person, or a department where anyone can pick it up">
        <ul className="flex flex-col">
          {[['Accounts', 'Suresh Babu'], ['Transport', 'Venkatesh Goud'], ['Academic Head', 'Meena Pillai'], ['Office', 'Anita Sharma'], ['Vice Principal', 'Srinivas Murthy']].map(([d, p]) => (
            <li key={d}><Row icon="Building2" title={d} sub={p} onClick={() => { onChange({ ...t, owner: d, ownerP: p }); setAssign(false); toast({ title: `${t.id} given to ${p}`, body: d }); }} /></li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}

/* ======================= Surveys ======================= */
const SURVEYS = [
  { id: 'SV-07', title: 'Parent satisfaction · Term 1', aud: 'All parents', sent: '1 Oct 2026', closes: '15 Oct 2026', resp: 642, of: 1018, status: 'Open', anon: true },
  { id: 'SV-08', title: 'Staff feedback · Term 1', aud: 'All staff', sent: '—', closes: '—', resp: 0, of: 86, status: 'Draft', anon: true },
  { id: 'SV-06', title: 'Transport feedback', aud: 'Parents of bus students', sent: '20 Sep 2026', closes: '27 Sep 2026', resp: 188, of: 251, status: 'Closed' },
  { id: 'SV-05', title: 'Science exhibition feedback', aud: 'Parents of Classes 6–8', sent: '16 Sep 2026', closes: '23 Sep 2026', resp: 128, of: 246, status: 'Closed' },
  { id: 'SV-04', title: 'Canteen menu', aud: 'Students of Classes 6–10', sent: '1 Aug 2026', closes: '8 Aug 2026', resp: 391, of: 470, status: 'Closed' },
];
const SV_TONE = { Open: 'ok', Draft: 'neutral', Closed: 'info' };

function Surveys({ params }) {
  const { go } = useNav();
  const toast = useToast();
  const [items, setItems] = useState(SURVEYS);
  const [build, setBuild] = useState(null);
  if (params?.id) return <SurveyResults sv={items.find((s) => s.id === params.id) || items[0]} onBack={() => go('communication', { page: 'surveys' })} />;
  return (
    <div>
      <ModuleHead sub="Short surveys for parents, staff and students. Parents answer through a link in a message."
        actions={<Button variant="primary" icon={I.Plus} onClick={() => setBuild('blank')}>New survey</Button>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <div>
          <p className="eyebrow text-ink3 mb-2.5">Start from an example</p>
          <div className="grid grid-cols-1 @md:grid-cols-3 gap-3">
            {[['Parent satisfaction', '8 questions · ratings and one comment', 'Smile'], ['Staff feedback', '6 questions · anonymous', 'Users'], ['Event feedback', '5 questions · after an event', 'PartyPopper']].map(([t, s, ic]) => (
              <button key={t} onClick={() => setBuild(t)} className="rounded-2xl border border-line bg-surface shadow-card p-4 flex items-center gap-3 text-left hover:border-brand/40 transition">
                <span className="w-11 h-11 rounded-xl bg-brand/10 text-brand grid place-items-center shrink-0"><Icon name={ic} size={20} /></span>
                <span className="min-w-0"><span className="block font-semibold text-[14.5px]">{t}</span><span className="block text-[12.5px] text-ink3">{s}</span></span>
              </button>
            ))}
          </div>
        </div>
        <Card className="overflow-hidden">
          <CardHead title="Surveys" sub="Each person answers once" action={<ExportButton what="surveys" />} />
          <DataList rows={items} onRow={(s) => (s.status === 'Draft' ? setBuild(s.title) : go('communication', { page: 'surveys', id: s.id }))} minWidth={720}
            columns={[
              { key: 'title', label: 'Survey', render: (s) => <div><p className="font-semibold">{s.title}</p><p className="text-[12.5px] text-ink3">{s.aud}{s.anon ? ' · anonymous' : ''}</p></div> },
              { key: 'sent', label: 'Sent', nowrap: true, render: (s) => <span className="tnum text-[13px]">{s.sent}<span className="block text-ink3 text-[12px]">{s.status === 'Open' ? `closes ${s.closes}` : s.status === 'Closed' ? `closed ${s.closes}` : 'not sent'}</span></span> },
              { key: 'resp', label: 'Responses', render: (s) => <div className="w-40"><p className="text-[13px] tnum"><b className="font-semibold">{fmt(s.resp)}</b> <span className="text-ink3">of {fmt(s.of)}</span></p><Progress value={(s.resp / s.of) * 100} className="mt-1" /></div> },
              { key: 'status', label: 'Status', render: (s) => <Pill tone={SV_TONE[s.status]} dot>{s.status}</Pill> },
            ]}
            mobile={(s) => ({ title: s.title, sub: `${s.aud} · ${fmt(s.resp)} of ${fmt(s.of)} answered`, icon: 'ClipboardList', iconTone: SV_TONE[s.status], pills: [<Pill key="s" tone={SV_TONE[s.status]} className="!h-[22px] !text-[11.5px]">{s.status}</Pill>] })} />
        </Card>
      </div>
      <SurveyBuilder start={build} onClose={() => setBuild(null)} onSaved={(s, send) => { setItems((x) => [s, ...x.filter((y) => y.title !== s.title)]); toast(send ? { title: `Survey sent to ${fmt(s.of)} people`, body: 'Parents get a link by WhatsApp. Closes in 7 days.' } : { title: 'Survey saved as a draft' }); }} />
    </div>
  );
}

function SurveyBuilder({ start, onClose, onSaved }) {
  const preset = {
    'Parent satisfaction': [['rating', 'How happy are you with your child’s progress this term?'], ['rating', 'How easy is it to reach the school when you need to?'], ['choice', 'How do you mostly hear from the school?'], ['text', 'One thing we should do better']],
    'Staff feedback': [['rating', 'How supported do you feel by the school leadership?'], ['rating', 'Is your teaching load fair?'], ['text', 'What would make your work easier?']],
    'Event feedback': [['rating', 'How did you like the event?'], ['choice', 'Which part did your child enjoy most?'], ['text', 'Any suggestions for next time?']],
  };
  const [title, setTitle] = useState('');
  const [aud, setAud] = useState('All parents');
  const [qs, setQs] = useState([]);
  const [anon, setAnon] = useState(true);
  const [key, setKey] = useState(null);
  if (start !== key) { setKey(start); setTitle(start && start !== 'blank' ? start : ''); setQs(preset[start] || preset['Parent satisfaction'].slice(0, 2)); setAud(start === 'Staff feedback' || start === 'Staff feedback · Term 1' ? 'All staff' : 'All parents'); }
  const [send, setSend] = useState(false);
  const n = { 'All parents': 1018, 'All staff': 86, 'Parents of Classes 6–10': 431, 'Students of Classes 6–10': 470 }[aud];
  return (
    <FormSheet open={!!start} onClose={onClose} wide title={start && start !== 'blank' ? `Survey: ${start}` : 'New survey'} sub="Choice, rating, text and date questions. Each person answers once." submitLabel={send ? `Send to ${fmt(n)}` : 'Save draft'}
      onSubmit={() => { if (!title.trim() || !qs.length) return false; onSaved({ id: 'SV-09', title, aud, sent: send ? '9 Oct 2026' : '—', closes: send ? '16 Oct 2026' : '—', resp: 0, of: n, status: send ? 'Open' : 'Draft', anon }, send); }}>
      <Field label="Title" required id="sv-title" error={!title.trim() ? 'Give the survey a title' : ''}><Input id="sv-title" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-semibold text-ink2">Questions <span className="text-bad">*</span></p>
        {qs.map(([t, txt], i) => (
          <div key={i} className="rounded-xl border border-line p-3 flex flex-col @md:flex-row gap-2">
            <span className="w-7 h-7 rounded-full bg-sunken text-[12px] font-bold grid place-items-center tnum shrink-0 @md:mt-2">{i + 1}</span>
            <Select id={`sv-qt-${i}`} value={t} onChange={(v) => setQs(qs.map((q, j) => (j === i ? [v, q[1]] : q)))} options={[{ value: 'rating', label: 'Rating 1–5' }, { value: 'choice', label: 'Choice' }, { value: 'text', label: 'Text' }, { value: 'date', label: 'Date' }]} className="@md:w-36 shrink-0" />
            <Input id={`sv-q-${i}`} value={txt} onChange={(e) => setQs(qs.map((q, j) => (j === i ? [q[0], e.target.value] : q)))} className="flex-1" aria-label={`Question ${i + 1}`} />
            <button type="button" onClick={() => setQs(qs.filter((_, j) => j !== i))} className="w-10 h-10 grid place-items-center rounded-xl text-ink3 hover:bg-sunken shrink-0 self-end @md:self-auto" aria-label="Remove question"><I.Trash2 size={17} /></button>
          </div>
        ))}
        <Button type="button" variant="secondary" icon={I.Plus} className="self-start" onClick={() => setQs([...qs, ['choice', '']])}>Add question</Button>
      </div>
      <div className="grid grid-cols-1 @md:grid-cols-2 gap-3">
        <Field label="Send to" required id="sv-aud" hint="Parents get a link by message"><Select id="sv-aud" value={aud} onChange={setAud} options={['All parents', 'Parents of Classes 6–10', 'All staff', 'Students of Classes 6–10']} /></Field>
        <Field label="Closes on" id="sv-close" hint="7 days after sending"><Input id="sv-close" defaultValue="16-10-2026" className="tnum" /></Field>
      </div>
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-3 text-[14px]"><Checkbox checked={anon} onChange={setAnon} label="Anonymous answers" /> Anonymous answers <span className="text-ink3 text-[12.5px]">· names are not stored</span></label>
        <label className="flex items-center gap-3 text-[14px]"><Checkbox checked={send} onChange={setSend} label="Send now" /> Send now instead of saving a draft</label>
      </div>
    </FormSheet>
  );
}

function SurveyResults({ sv, onBack }) {
  const toast = useToast();
  const [closed, setClosed] = useState(sv.status === 'Closed');
  const dist = [[5, 286], [4, 221], [3, 84], [2, 33], [1, 18]];
  return (
    <div>
      <BackLink label="Surveys" sub={sv.id} onClick={onBack} />
      <div className="flex flex-col @md:flex-row @md:items-end @md:justify-between gap-3 mb-5">
        <div>
          <h1 className="font-display text-[24px] @md:text-[28px] font-semibold tracking-tight leading-tight">{sv.title}</h1>
          <p className="text-[14px] text-ink3 mt-1">{sv.aud} · sent {sv.sent} · {closed ? `closed ${sv.closes}` : `closes ${sv.closes}`}</p>
        </div>
        <div className="flex gap-2">
          {!closed && <Button variant="secondary" icon={I.BellRing} onClick={() => toast({ title: `Reminder sent to ${fmt(sv.of - sv.resp)} who have not answered` })}>Remind</Button>}
          {!closed && <Button variant="secondary" icon={I.Lock} onClick={() => { setClosed(true); toast({ title: 'Survey closed', body: 'No more answers are taken.', undo: () => setClosed(false) }); }}>Close survey</Button>}
          <ExportButton what="survey results" />
        </div>
      </div>
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Stats items={[
          { label: 'Answered', value: `${fmt(sv.resp)} of ${fmt(sv.of)}`, icon: 'Users', sub: `${Math.round((sv.resp / sv.of) * 100)}% response` },
          { label: 'Average rating', value: '4.1 of 5', icon: 'Star', tone: 'ok' },
          { label: 'Would recommend us', value: '86%', icon: 'ThumbsUp', tone: 'ok' },
          { label: 'Comments', value: '214', icon: 'MessageSquareText' },
        ]} />
        <div className="grid grid-cols-1 @xl:grid-cols-2 gap-5 @lg:gap-6">
          <Card>
            <CardHead title="1. How happy are you with your child’s progress this term?" sub="Rating 1 to 5" />
            <div className="px-5 pb-5"><HBars rows={dist.map(([k, v]) => ({ k: `${k} star${k > 1 ? 's' : ''}`, v, label: fmt(v) }))} max={300} unit="" labelWidth={64} /></div>
          </Card>
          <Card>
            <CardHead title="2. How do you mostly hear from the school?" sub="Choice" />
            <div className="px-5 pb-5"><Bars data={[{ k: 'WhatsApp', v: 402 }, { k: 'Parent Link', v: 148 }, { k: 'Phone call', v: 61 }, { k: 'Visit', v: 31 }]} height={170} ariaLabel="Answers by choice" max={450} ticks={[0, 150, 300]} /></div>
          </Card>
        </div>
        <Card>
          <CardHead title="3. One thing we should do better" sub="Text answers, newest first · 214 answers" />
          <ul className="px-5 pb-4 divide-y divide-line/70">
            {['More notice before events that cost money.', 'The bus to Miyapur is often late in the evening.', 'Please share the homework on Parent Link as well.', 'Very happy with the teachers of 7 B. Thank you.', 'Canteen food could have more fruit.'].map((t, i) => (
              <li key={i} className="py-2.5 text-[14px] flex gap-3"><I.Quote size={15} className="text-ink3 shrink-0 mt-1" /><span>{t}</span><span className="ml-auto text-[12px] text-ink3 shrink-0">{['Today', 'Today', 'Yesterday', '7 Oct', '6 Oct'][i]}</span></li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

/* ======================= Message Templates ======================= */
const WA_TONE = { Approved: 'ok', Pending: 'warn', Rejected: 'bad' };
function Templates() {
  const toast = useToast();
  const [chF, setChF] = useState('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const [add, setAdd] = useState(false);
  const rows = TEMPLATES.filter((t) => (chF === 'all' || t.ch.includes(chF) || (chF === 'missing' && t.dlt === '')) && (!q || (t.name + t.cat).toLowerCase().includes(q.toLowerCase())));
  const noDlt = TEMPLATES.filter((t) => t.dlt === '').length;
  return (
    <div>
      <ModuleHead sub="Ready message formats in each language, with blanks like student name and due amount. Each save makes a new version."
        actions={<Button variant="primary" icon={I.Plus} onClick={() => setAdd(true)}>New template</Button>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        {noDlt > 0 && <Banner tone="warn" title={`${noDlt} SMS templates have no DLT template ID.`} action={<Button size="sm" variant="secondary" onClick={() => setChF('missing')}>Show them</Button>}>They can be saved, but no SMS can be sent from them.</Banner>}
        <Card className="overflow-hidden">
          <Toolbar>
            <SearchBox value={q} onChange={setQ} placeholder="Template name or category" id="tpl-search" />
            <Segmented value={chF} onChange={setChF} options={[{ value: 'all', label: 'All' }, { value: 'WhatsApp', label: 'WhatsApp' }, { value: 'SMS', label: 'SMS' }, { value: 'missing', label: 'No DLT ID' }]} />
            <ExportButton what="templates" />
          </Toolbar>
          <DataList rows={rows} onRow={setOpen} minWidth={900} footer={`${rows.length} templates`}
            columns={[
              { key: 'name', label: 'Template', render: (t) => <div><p className="font-semibold">{t.name}</p><p className="text-[12.5px] text-ink3">{t.cat}</p></div> },
              { key: 'ch', label: 'Channel', render: (t) => <ChannelPills ch={t.ch} /> },
              { key: 'langs', label: 'Languages', render: (t) => <span className="text-[13px]">{t.langs.join(', ')}</span> },
              { key: 'wa', label: 'WhatsApp', render: (t) => <Pill tone={WA_TONE[t.wa]} dot>{t.wa}</Pill> },
              { key: 'dlt', label: 'DLT template ID', render: (t) => (t.dlt === null ? <span className="text-ink3">No SMS</span> : t.dlt ? <span className="font-mono text-[12.5px]">{t.dlt}</span> : <Pill tone="bad">Missing</Pill>) },
              { key: 'ver', label: 'Version', align: 'right', render: (t) => `v${t.ver}` },
              { key: 'used', label: 'Used by', render: (t) => <span className="text-[13px] text-ink2">{t.used}</span> },
            ]}
            mobile={(t) => ({ title: t.name, sub: `${t.cat} · ${t.langs.join(', ')} · v${t.ver}`, icon: 'FileText', iconTone: t.dlt === '' || t.wa === 'Rejected' ? 'bad' : 'brand',
              pills: [<Pill key="w" tone={WA_TONE[t.wa]} className="!h-[22px] !text-[11.5px]">WhatsApp {t.wa.toLowerCase()}</Pill>, t.dlt === '' && <Pill key="d" tone="bad" className="!h-[22px] !text-[11.5px]">DLT ID missing</Pill>] })} />
        </Card>
      </div>
      <TemplateSheet t={open} onClose={() => setOpen(null)} />
      <TemplateForm open={add} onClose={() => setAdd(false)} onSaved={(n, dlt) => toast(dlt ? { title: `Template “${n}” saved`, body: 'Sent to WhatsApp for approval. Usually 1 to 2 days.' } : { title: `“${n}” saved as a draft`, body: 'Add the DLT template ID before it can send SMS.', tone: 'info' })} />
    </div>
  );
}

function TemplateSheet({ t, onClose }) {
  const toast = useToast();
  const [lang, setLang] = useState('English');
  if (!t) return null;
  const vars = [...new Set(t.text.match(/\{\w+\}/g) || [])];
  const TE = { TP01: 'ప్రియమైన {parent_name}, {student_name} ({class}) కోసం {due_date} నాటికి {due_amount} చెల్లించాలి. మీ Parent Link లో చెల్లించండి: {pay_link}. ఇప్పటికే చెల్లించి ఉంటే దయచేసి విస్మరించండి. – {school_name}' };
  const HI = { TP01: 'प्रिय {parent_name}, {student_name} ({class}) के लिए {due_date} तक {due_amount} देय है। अपने Parent Link पर भुगतान करें: {pay_link}। यदि भुगतान कर दिया है तो कृपया ध्यान न दें। – {school_name}' };
  const text = lang === 'Telugu' && TE[t.id] ? TE[t.id] : lang === 'Hindi' && HI[t.id] ? HI[t.id] : t.text;
  return (
    <Sheet open={!!t} onClose={onClose} title={t.name} sub={`${t.cat} · version ${t.ver} · ${t.used}`} wide>
      <div className="flex flex-col gap-4">
        <div className="flex gap-1.5 flex-wrap"><Pill tone={WA_TONE[t.wa]} dot>WhatsApp {t.wa.toLowerCase()}</Pill>{t.dlt ? <Pill tone="ok">DLT {t.dlt}</Pill> : t.dlt === '' ? <Pill tone="bad">DLT template ID missing</Pill> : <Pill tone="neutral">WhatsApp only</Pill>}</div>
        {t.dlt === '' && <Banner tone="bad" title="No DLT template ID.">This SMS template cannot be used to send SMS. Add the ID from the DLT portal.</Banner>}
        {t.wa === 'Rejected' && <Banner tone="warn" title="WhatsApp rejected this template on 2 Oct:">“Promotional wording in a utility template.” Edit the text and submit again.</Banner>}
        <Segmented size="sm" value={lang} onChange={setLang} options={t.langs} className="self-start" />
        <div className="rounded-xl bg-sunken/70 border border-line p-3.5 text-[14.5px] leading-relaxed"><VarText text={text} /></div>
        <div><p className="eyebrow text-ink3 mb-1.5">Blanks in this template</p><div className="flex gap-1.5 flex-wrap">{vars.map((v) => <span key={v} className="font-mono text-[12px] px-2 py-1 rounded-lg bg-brand/10 text-brand">{v}</span>)}</div></div>
        <div>
          <p className="eyebrow text-ink3 mb-1.5">Preview with Aarav Sharma’s details</p>
          <div className="rounded-2xl rounded-tl-md bg-surface border border-line p-3.5 shadow-card text-[14px] leading-relaxed">{fill(text, { name: 'Priya Sharma', student: 'Aarav Sharma', cls: '7 B', due: 30650 })}</div>
        </div>
        <div>
          <p className="eyebrow text-ink3 mb-1.5">Versions</p>
          <ul className="text-[13.5px] flex flex-col gap-1.5">
            {Array.from({ length: Math.min(t.ver, 3) }, (_, i) => t.ver - i).map((v, i) => <li key={v} className="flex justify-between gap-3"><span><b className="font-semibold">v{v}</b>{i === 0 && <span className="text-ok font-semibold"> · in use</span>}</span><span className="text-ink3">{['Anita Sharma · 28 Sep 2026', 'Anita Sharma · 2 Jul 2026', 'Suresh Babu · 3 Apr 2026'][i]}</span></li>)}
          </ul>
          <p className="text-[12.5px] text-ink3 mt-1.5">Messages already sent keep the version they used.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" icon={I.Pencil} onClick={() => toast({ title: `Editing makes version ${t.ver + 1}`, body: t.wa === 'Approved' ? 'Approved WhatsApp text goes for approval again.' : '', tone: 'info' })}>Edit</Button>
          <Button variant="secondary" icon={I.Languages} onClick={() => toast({ title: 'Add a language version', body: 'Kannada, Urdu, Tamil or Marathi', tone: 'info' })}>Add language</Button>
          {t.wa !== 'Approved' && <Button variant="soft" icon={I.Send} onClick={() => toast({ title: 'Submitted to WhatsApp for approval', body: 'Usually 1 to 2 days. You will be told here.' })}>{t.wa === 'Rejected' ? 'Submit again' : 'Check status'}</Button>}
        </div>
      </div>
    </Sheet>
  );
}

function TemplateForm({ open, onClose, onSaved }) {
  const blank = { name: '', cat: 'Fees', ch: ['WhatsApp', 'SMS'], lang: 'English', text: '', dlt: '' };
  const [f, setF] = useState(blank);
  const [tried, setTried] = useState(false);
  const err = {
    name: !f.name.trim() ? 'Give the template a name' : '',
    text: !f.text.trim() ? 'Write the message text' : '',
    dlt: f.dlt && !/^[A-Za-z0-9]{10,30}$/.test(f.dlt.trim()) ? 'Use only letters and numbers, exactly as on the DLT portal' : '',
  };
  return (
    <FormSheet open={open} onClose={onClose} wide title="New template" sub="SMS templates need the DLT template ID registered on the telecom DLT portal." submitLabel="Save template"
      onSubmit={() => { setTried(true); if (Object.values(err).some(Boolean)) return false; onSaved(f.name, !!f.dlt || !f.ch.includes('SMS')); setF(blank); setTried(false); }}>
      <div className="grid grid-cols-1 @md:grid-cols-2 gap-3">
        <Field label="Name" required id="tf-name" error={tried && err.name}><Input id="tf-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={tried && err.name} placeholder="For example: Exam fee reminder" /></Field>
        <Field label="Category" required id="tf-cat"><Select id="tf-cat" value={f.cat} onChange={(v) => setF({ ...f, cat: v })} options={['Fees', 'Attendance', 'Exams and results', 'Transport', 'Events', 'Admission', 'General']} /></Field>
      </div>
      <div className="grid grid-cols-1 @md:grid-cols-2 gap-3">
        <div><p className="text-[13px] font-semibold text-ink2 mb-1.5">Channel</p><Toggles options={['WhatsApp', 'SMS', 'Email'].map((c) => ({ value: c, label: c }))} value={f.ch} onToggle={(c) => setF({ ...f, ch: f.ch.includes(c) ? f.ch.filter((x) => x !== c) : [...f.ch, c] })} /></div>
        <Field label="Language" required id="tf-lang"><Select id="tf-lang" value={f.lang} onChange={(v) => setF({ ...f, lang: v })} options={['English', 'Telugu', 'Hindi']} /></Field>
      </div>
      <Field label="Text" required id="tf-text" error={tried && err.text} hint={`${f.text.length} characters${f.ch.includes('SMS') ? ` · ${Math.max(1, Math.ceil(f.text.length / 153))} SMS part` : ''}`}>
        <Textarea id="tf-text" value={f.text} onChange={(v) => setF({ ...f, text: v })} rows={4} placeholder="Dear {parent_name}, …" />
      </Field>
      <div><p className="text-[12.5px] text-ink3 mb-1.5">Tap a blank to add it</p><div className="flex gap-1.5 flex-wrap">{VARS.map((v) => <button type="button" key={v} onClick={() => setF({ ...f, text: `${f.text}${f.text && !f.text.endsWith(' ') ? ' ' : ''}${v}` })} className="font-mono text-[12px] px-2 h-7 rounded-lg bg-brand/10 text-brand hover:bg-brand/15">{v}</button>)}</div></div>
      {f.ch.includes('SMS') && (
        <Field label="DLT template ID" id="tf-dlt" error={tried && err.dlt} hint="Without it the template is saved as a draft and cannot send SMS.">
          <Input id="tf-dlt" value={f.dlt} onChange={(e) => setF({ ...f, dlt: e.target.value })} error={tried && err.dlt} className="font-mono" placeholder="1107161765432109876" />
        </Field>
      )}
    </FormSheet>
  );
}

/* ======================= Parent Link ======================= */
const LINKS = CLASS_7B.slice(0, 16).map((s, i) => {
  const f = s.id === FEATURED.id;
  const st = i === 5 ? 'Revoked' : 'Active';
  return {
    id: 'PL' + i, s, name: f ? 'Priya Sharma' : s.father, phone: f ? '98495 60211' : s.phone,
    kids: f ? 'Aarav Sharma (7 B), Anaya Sharma (UKG A)' : `${s.name} (7 B)`, status: st,
    created: f ? '2 Jun 2021' : ['4 Jun 2026', '2 Jun 2026', '12 Jun 2026'][i % 3],
    last: st === 'Revoked' ? '28 Sep 2026' : f ? 'Today, 8:14 AM' : i % 7 === 3 ? 'Never' : ['Today, 8:14 AM', 'Yesterday, 7:02 PM', '7 Oct, 9:30 PM', '5 Oct, 6:45 PM', 'Today, 9:01 AM'][i % 5],
    phones: f ? 2 : i % 4 === 1 ? 2 : i % 7 === 3 ? 0 : 1,
  };
});
const CONSENTS = [
  { k: 'Data processing (DPDP Act 2023)', ver: 'v2', given: 1021, wait: 63, withdrawn: 2 },
  { k: 'Photo consent', ver: 'v1', given: 948, wait: 118, withdrawn: 19 },
  { k: 'Wonderla picnic, 24 Oct · Classes 5–7', ver: 'v1', given: 148, wait: 96, withdrawn: 6, by: '20 Oct' },
];
const SHOWS = [['fees', 'Fees due and Pay button', 'Pays online through Razorpay'], ['receipts', 'Receipts', 'Download as PDF'], ['att', 'Attendance this month', 'Calendar and percentage'], ['notices', 'Notices', 'Critical notices pinned on top'], ['datesheet', 'Datesheet', 'For the coming exams'], ['reports', 'Report cards', 'Only once published'], ['consent', 'Consent forms', 'Agree with a one-time code']];

function ParentLinkPage() {
  const { go } = useNav();
  const toast = useToast();
  const canEdit = useCanEdit();
  const [links, setLinks] = useState(LINKS);
  const [f, setF] = useState('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(new Set());
  const [open, setOpen] = useState(null);
  const [bulk, setBulk] = useState(false);
  const [consent, setConsent] = useState(false);
  const [shows, setShows] = useState(Object.fromEntries(SHOWS.map(([k]) => [k, true])));
  const [on, setOn] = useState(true);
  const rows = links.filter((l) => (f === 'all' || (f === 'never' ? l.last === 'Never' : f === 'revoked' ? l.status === 'Revoked' : l.last !== 'Never' && l.status === 'Active')) && (!q || (l.name + l.phone + l.kids).toLowerCase().includes(q.toLowerCase())));
  return (
    <div>
      <ModuleHead sub="One personal link per guardian for all their children. No password, no app."
        actions={<>
          <Button variant="secondary" icon={I.FileSignature} className="hidden @md:inline-flex" onClick={() => setConsent(true)}>Request consent</Button>
          <Button variant="primary" icon={I.Send} onClick={() => setBulk(true)}>Send to existing families</Button>
        </>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Stats items={[
          { label: 'Links active', value: '1,312', icon: 'Link', sub: 'One per guardian', onClick: () => setF('all') },
          { label: 'Opened in last 30 days', value: '1,046', icon: 'Eye', tone: 'ok', sub: '80% of guardians', onClick: () => setF('opened') },
          { label: 'Never opened', value: '71', icon: 'EyeOff', tone: 'warn', sub: 'Resend or call them', onClick: () => setF('never') },
          { label: 'Revoked', value: '14', icon: 'Ban', sub: 'Lost phone, shared link', onClick: () => setF('revoked') },
        ]} />
        <div className="grid grid-cols-1 @lg:grid-cols-2 @xl:grid-cols-3 gap-5 @lg:gap-6 items-start">
            <Card>
              <CardHead title="What parents see" sub="Switch parts on or off for the whole school" icon={I.Smartphone}
                action={<Switch id="pl-on" on={on} onChange={(v) => { if (!canEdit) return; setOn(v); toast({ title: v ? 'Parent Link switched on' : 'Parent Link switched off', body: v ? 'Links work again.' : 'Parents see “Parent Link is paused by the school”.', tone: v ? 'ok' : 'info' }); }} label="Parent Link on" />} />
              <ul className={cx('border-t border-line/70 divide-y divide-line/70', !on && 'opacity-50')}>
                {SHOWS.map(([k, t, s]) => (
                  <li key={k}><SettingRow title={t} sub={s} id={`pl-${k}`}><Switch id={`pl-${k}`} on={shows[k] && on} label={t} onChange={(v) => { if (!canEdit || !on) return; setShows({ ...shows, [k]: v }); toast({ title: `${t}: ${v ? 'shown' : 'hidden'} on Parent Link`, body: 'Saved. Recorded in the audit log.' }); }} /></SettingRow></li>
                ))}
              </ul>
              <div className="p-4 border-t border-line/70"><Button variant="soft" icon={I.Smartphone} className="w-full" onClick={() => go('parent')}>See what parents see</Button></div>
            </Card>
            <div className="flex flex-col gap-5 @lg:gap-6 min-w-0">
              <Card>
                <CardHead title="Links sent and opened" sub="Guardians opening their link each week" icon={I.ChartColumn} />
                <div className="px-5"><Bars data={[{ k: '7 Sep', v: 612 }, { k: '14 Sep', v: 688 }, { k: '21 Sep', v: 745 }, { k: '28 Sep', v: 981 }, { k: '5 Oct', v: 1046 }]} height={150} ariaLabel="Guardians opening Parent Link per week" max={1200} ticks={[0, 400, 800]} label={(v) => fmt(v)} /></div>
                <ul className="px-5 pb-5 pt-2 text-[13.5px] flex flex-col gap-1.5 tnum">
                  <li className="flex justify-between"><span className="text-ink2">Links sent</span><b className="font-semibold">1,326</b></li>
                  <li className="flex justify-between"><span className="text-ink2">Opened at least once</span><b className="font-semibold">1,255 · 95%</b></li>
                  <li className="flex justify-between"><span className="text-ink2">Paid fees through Parent Link in Oct</span><b className="font-semibold">{inr(1186400)}</b></li>
                </ul>
              </Card>
            </div>
            <Card>
              <CardHead title="Consent records" sub="Agreed on Parent Link with a one-time code" icon={I.FileSignature}
                action={canEdit && <Button size="sm" variant="soft" icon={I.Plus} onClick={() => setConsent(true)}>Request</Button>} />
              <ul className="px-5 pb-5 flex flex-col gap-4">
                {CONSENTS.map((c) => {
                  const tot = c.given + c.wait + c.withdrawn;
                  return (
                    <li key={c.k} className="flex flex-col gap-2 pb-4 border-b border-line/70 last:border-0 last:pb-0">
                      <div className="flex items-start gap-2"><div className="flex-1 min-w-0"><p className="font-semibold text-[14px] leading-snug">{c.k}</p><p className="text-[12.5px] text-ink3">Consent text {c.ver}{c.by ? ` · reply by ${c.by}` : ''}</p></div>{canEdit && <Button size="sm" variant="ghost" icon={I.BellRing} onClick={() => toast({ title: `Reminder sent to ${fmt(c.wait)} guardians`, body: c.k })}>Remind</Button>}</div>
                      <span className="flex h-2 rounded-full overflow-hidden bg-sunken"><span className="bg-ok" style={{ width: `${(c.given / tot) * 100}%` }} /><span className="bg-warn" style={{ width: `${(c.wait / tot) * 100}%` }} /><span className="bg-bad" style={{ width: `${(c.withdrawn / tot) * 100}%` }} /></span>
                      <p className="text-[13px] tnum flex gap-x-3 gap-y-1 flex-wrap"><span><b className="font-semibold text-ok">{fmt(c.given)}</b> given</span><span><b className="font-semibold text-warn">{fmt(c.wait)}</b> waiting</span><span><b className="font-semibold text-bad">{fmt(c.withdrawn)}</b> {c.by ? 'declined' : 'withdrawn'}</span></p>
                    </li>
                  );
                })}
              </ul>
            </Card>
        </div>
        <Card className="overflow-hidden min-w-0">
          <Toolbar>
            <SearchBox value={q} onChange={setQ} placeholder="Guardian, phone or child" id="pl-search" />
            <Select id="pl-f" value={f} onChange={setF} options={[{ value: 'all', label: 'All links' }, { value: 'opened', label: 'Opened in 30 days' }, { value: 'never', label: 'Never opened' }, { value: 'revoked', label: 'Revoked' }]} className="@md:w-48" />
            <ExportButton what="Parent Link list" />
          </Toolbar>
          {canEdit && <BulkBar count={sel.size} onClear={() => setSel(new Set())}>
            <Button size="sm" variant="secondary" icon={I.Send} onClick={() => { toast({ title: `Link resent to ${sel.size} guardians`, body: 'By WhatsApp, same link as before.' }); setSel(new Set()); }}>Resend link</Button>
          </BulkBar>}
          <DataList rows={rows} onRow={setOpen} select={canEdit ? [sel, setSel] : null} minWidth={860} footer={`Showing ${rows.length} of 1,326 · 7 B guardians first`}
            columns={[
              { key: 'name', label: 'Guardian', render: (l) => <div className="flex items-center gap-2.5"><Avatar name={l.name} size={34} /><div><p className="font-semibold leading-tight">{l.name}</p><p className="text-[12.5px] text-ink3 tnum whitespace-nowrap">+91 {l.phone}</p></div></div> },
              { key: 'kids', label: 'Children', render: (l) => <span className="text-[13px]">{l.kids}</span> },
              { key: 'status', label: 'Status', render: (l) => <Pill tone={l.status === 'Active' ? 'ok' : 'bad'} dot>{l.status}</Pill> },
              { key: 'created', label: 'Created', nowrap: true, render: (l) => <span className="tnum text-[13px]">{l.created}</span> },
              { key: 'last', label: 'Last opened', nowrap: true, render: (l) => <span className={cx('tnum text-[13px]', l.last === 'Never' && 'text-warn font-semibold')}>{l.last}</span> },
              { key: 'phones', label: 'Phones verified', align: 'right', render: (l) => l.phones },
            ]}
            mobile={(l) => ({ title: l.name, sub: `${l.kids} · opened ${l.last.toLowerCase()}`, avatar: l.name, pills: [<Pill key="s" tone={l.status === 'Active' ? 'ok' : 'bad'} className="!h-[22px] !text-[11.5px]">{l.status}</Pill>, l.last === 'Never' && <Pill key="n" tone="warn" className="!h-[22px] !text-[11.5px]">Never opened</Pill>] })} />
        </Card>
      </div>

      <LinkSheet l={open} onClose={() => setOpen(null)} canEdit={canEdit} onRevoke={(l, reissue) => { setLinks((x) => x.map((y) => (y.id === l.id ? { ...y, status: reissue ? 'Active' : 'Revoked', created: reissue ? '9 Oct 2026' : y.created, last: reissue ? 'Never' : y.last, phones: reissue ? 0 : y.phones } : y))); setOpen(null); }} />
      <BulkSendSheet open={bulk} onClose={() => setBulk(false)} />
      <ConsentSheet open={consent} onClose={() => setConsent(false)} />
    </div>
  );
}

function LinkSheet({ l, onClose, canEdit, onRevoke }) {
  const toast = useToast();
  const [rv, setRv] = useState(false);
  const [act, setAct] = useState('reissue');
  const [why, setWhy] = useState('Lost phone');
  const [other, setOther] = useState('');
  if (!l) return null;
  const f = l.name === 'Priya Sharma';
  return (
    <Sheet open={!!l} onClose={onClose} title={l.name} sub={`+91 ${l.phone} · ${l.kids}`} wide>
      <div className="flex flex-col gap-4">
        <div className="flex gap-1.5 flex-wrap"><Pill tone={l.status === 'Active' ? 'ok' : 'bad'} dot>{l.status}</Pill><Pill tone="neutral">{l.phones} {l.phones === 1 ? 'phone' : 'phones'} verified</Pill><Pill tone="neutral"><span className="font-mono">sps.link/p/••••7Kq2</span></Pill></div>
        <div className="grid grid-cols-1 @md:grid-cols-2 gap-5">
          <div>
            <p className="eyebrow text-ink3 mb-2">History</p>
            <Timeline items={l.status === 'Revoked' ? [
              { icon: 'Ban', tone: 'bad', what: 'Revoked by Anita Sharma: “Link shared in a class WhatsApp group”', when: '28 Sep 2026, 11:20 AM' },
              { icon: 'Eye', what: 'Opened on a phone ending 4471', when: '28 Sep 2026, 9:02 AM' },
              { icon: 'Send', what: 'Sent by WhatsApp', when: `${l.created}` },
            ] : [
              ...(l.last !== 'Never' ? [{ icon: 'Eye', tone: 'ok', what: `Opened on a phone ending ${f ? '0211' : '2214'}`, when: l.last }] : []),
              ...(l.phones ? [{ icon: 'ShieldCheck', tone: 'ok', what: `One-time code entered on a new phone ending ${f ? '0211' : '2214'}`, when: f ? '3 Jun 2021, 7:40 PM' : '5 Jun 2026, 8:12 PM' }] : []),
              { icon: 'Send', what: 'Sent automatically by WhatsApp when the admission was approved', when: l.created },
            ]} />
          </div>
          <div>
            <p className="eyebrow text-ink3 mb-2">Consent forms</p>
            <ul className="flex flex-col gap-2 text-[13.5px]">
              {[['Data processing (DPDP Act 2023) v2', 'Given 3 Jun 2026', 'ok'], ['Photo consent v1', f ? 'Given 3 Jun 2026' : 'Waiting', f ? 'ok' : 'warn'], ['Wonderla picnic, 24 Oct', f ? 'Given 7 Oct 2026' : 'Waiting', f ? 'ok' : 'warn']].map(([k, v, tone]) => (
                <li key={k} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5"><span>{k}</span><Pill tone={tone}>{v}</Pill></li>
              ))}
            </ul>
          </div>
        </div>
        {canEdit && (
          <div className="flex gap-2 flex-wrap pt-1">
            {l.status === 'Active' && <Button variant="secondary" icon={I.Send} onClick={() => toast({ title: `Link resent to ${l.name}`, body: 'Same link, by WhatsApp.' })}>Resend link</Button>}
            <Button variant={l.status === 'Active' ? 'dangerSoft' : 'primary'} icon={l.status === 'Active' ? I.Ban : I.RefreshCw} onClick={() => { setAct(l.status === 'Active' ? 'reissue' : 'reissue'); setRv(true); }}>{l.status === 'Active' ? 'Revoke or reissue' : 'Issue a new link'}</Button>
          </div>
        )}
      </div>
      <FormSheet open={rv} onClose={() => setRv(false)} title={`Revoke ${l.name}’s link`} sub="The old link stops working at once. The reason is logged." submitLabel={act === 'reissue' ? 'Revoke and send a new link' : 'Revoke only'}
        onSubmit={() => { if (why === 'Other' && other.trim().length < 5) return false; onRevoke(l, act === 'reissue'); toast({ title: act === 'reissue' ? `New link sent to +91 ${l.phone}` : 'Link revoked', body: act === 'reissue' ? 'A one-time code is needed on the first open.' : `Reason: ${why === 'Other' ? other : why}` }); }}>
        <Field label="Action" required id="rv-act"><Segmented value={act} onChange={setAct} options={[{ value: 'reissue', label: 'Revoke and reissue' }, { value: 'revoke', label: 'Revoke only' }]} className="w-full" /></Field>
        <Field label="Reason" required id="rv-why"><Select id="rv-why" value={why} onChange={setWhy} options={['Lost phone', 'Link shared with someone else', 'Guardian changed mobile', 'Other']} /></Field>
        {why === 'Other' && <Field label="Say why" required id="rv-other" error={other.trim().length < 5 ? 'At least 5 characters' : ''}><Input id="rv-other" value={other} onChange={(e) => setOther(e.target.value)} /></Field>}
      </FormSheet>
    </Sheet>
  );
}

function BulkSendSheet({ open, onClose }) {
  const toast = useToast();
  const [who, setWho] = useState('nolink');
  const [ch, setCh] = useState('WhatsApp');
  const n = { nolink: 63, school: 1326, '7B': 52, LKG: 104 }[who];
  return (
    <FormSheet open={open} onClose={onClose} title="Send Parent Link to existing families" sub="New families get theirs automatically when the admission is approved." submitLabel={`Send to ${fmt(n)} guardians`}
      onSubmit={() => toast({ title: `Parent Link sent to ${fmt(n)} guardians`, body: `By ${ch}. ${ch === 'WhatsApp' ? 'Those not on WhatsApp get an SMS.' : ''} Result summary in Message History.` })}>
      <Field label="Who" required id="bs-who" hint="Guardians who already have an active link are not sent another one unless you choose them"><Select id="bs-who" value={who} onChange={setWho} options={[{ value: 'nolink', label: 'Guardians with no active link · 63' }, { value: 'school', label: 'Whole school · 1,326 guardians' }, { value: '7B', label: 'Class 7 B · 52 guardians' }, { value: 'LKG', label: 'LKG · 104 guardians' }]} /></Field>
      <Field label="Channel" required id="bs-ch" hint="Uses the approved “Parent Link” template"><Segmented value={ch} onChange={setCh} options={['WhatsApp', 'SMS']} className="w-full" /></Field>
      <Field label="Send at" id="bs-at"><Input id="bs-at" defaultValue="Now" /></Field>
      <p className="text-[13.5px] text-ink2 tnum rounded-xl bg-sunken/70 px-3.5 py-2.5">{fmt(n)} credits of {fmt(BALANCE)} available.</p>
    </FormSheet>
  );
}

function ConsentSheet({ open, onClose }) {
  const toast = useToast();
  const [type, setType] = useState('Photo consent');
  const [who, setWho] = useState('pending');
  const n = who === 'pending' ? 118 : who === 'school' ? 1326 : 104;
  return (
    <FormSheet open={open} onClose={onClose} title="Request consent" sub="Guardians see it on Parent Link and agree with a one-time code." submitLabel={`Send to ${fmt(n)} guardians`}
      onSubmit={() => toast({ title: `Consent request sent to ${fmt(n)} guardians`, body: `${type}. Reminders stop after the reply-by date.` })}>
      <Field label="Consent type" required id="cs-type" hint="Texts and versions are in Settings, Data Backup & Security"><Select id="cs-type" value={type} onChange={setType} options={['Photo consent', 'Data processing (DPDP Act 2023)', 'Wonderla picnic, 24 Oct · Classes 5–7']} /></Field>
      <Field label="Who" required id="cs-who"><Select id="cs-who" value={who} onChange={setWho} options={[{ value: 'pending', label: 'Guardians with no current consent of this type · 118' }, { value: 'school', label: 'Whole school · 1,326' }, { value: 'lkg', label: 'LKG · 104' }]} /></Field>
      <Field label="Reply by" id="cs-by" hint="14 days from today"><Input id="cs-by" defaultValue="23-10-2026" className="tnum" /></Field>
    </FormSheet>
  );
}

/* ======================= Message Settings ======================= */
const RULES = [
  { k: 'Absent today', when: 'Attendance saved with an absence', tpl: 'Absent today v3', ch: 'WhatsApp + SMS backup', timing: 'At once', on: true },
  { k: 'Late arrival', when: 'Marked late', tpl: 'Late today v1', ch: 'WhatsApp', timing: 'At once', on: false },
  { k: 'Fee due reminder', when: '3 days before and on the due date', tpl: 'Fee reminder v4', ch: 'WhatsApp + SMS backup', timing: '6:30 PM', on: true },
  { k: 'Fee paid', when: 'A payment is recorded', tpl: 'Fee receipt v2', ch: 'WhatsApp', timing: 'At once', on: true },
  { k: 'Exam reminder', when: '2 days before the first exam', tpl: 'Exam reminder v2', ch: 'WhatsApp', timing: '7:30 AM', on: true },
  { k: 'Results published', when: 'Report cards published', tpl: 'Result published v1', ch: 'WhatsApp + SMS backup', timing: 'At once', on: true },
  { k: 'PTM reminder', when: '1 day before a booked PTM slot', tpl: 'PTM invitation v1', ch: 'WhatsApp', timing: '6:00 PM', on: true },
  { k: 'Homework set', when: 'A teacher gives homework', tpl: 'Homework set v1', ch: 'App notice', timing: 'At once', on: false },
  { k: 'Pending homework', when: 'Homework not submitted by the due date', tpl: 'Homework pending v1', ch: 'WhatsApp', timing: '6:00 PM', on: true },
  { k: 'Bus arriving', when: 'Bus 5 minutes from the stop', tpl: 'Bus arriving v1', ch: 'App notice', timing: 'Live', on: true },
  { k: 'Birthday wishes', when: 'Student or staff birthday', tpl: 'Birthday wishes v1', ch: 'WhatsApp', timing: '7:30 AM', on: true },
  { k: 'Salary slip ready', when: 'Salary is paid', tpl: 'Salary slip v1', ch: 'App notice + Email', timing: 'At once', on: true },
];
const WHO_MAY = [
  ['Principal, School Admin', ['All', 'All', 'All', 'All', 'All', 'All']],
  ['Vice Principal', ['All', 'All', 'All', 'All', 'All', '—']],
  ['Accountant', ['—', 'Fees only', '—', '—', 'Fees only', '—']],
  ['Teacher', ['—', '—', 'Own sections', '—', 'Own students', '—']],
  ['Class Teacher', ['—', '—', 'Own class', '—', 'Own students', '—']],
  ['Receptionist', ['—', '—', 'Any section', '—', 'Any parent', '—']],
  ['Transport In-charge', ['—', '—', '—', 'Any route', '—', 'Own route']],
  ['HR', ['—', '—', '—', '—', '—', '—']],
];

function MessageSettings() {
  const toast = useToast();
  const canEdit = useCanEdit();
  const { go } = useNav();
  const [rules, setRules] = useState(RULES);
  const [quiet, setQuiet] = useState(true);
  const [topup, setTopup] = useState(false);
  const [pack, setPack] = useState(10000);
  const [bk, setBk] = useState({ Fees: true, Attendance: true, Results: true });
  const [qFrom, setQFrom] = useState('9:00 PM');
  const [qTo, setQTo] = useState('7:00 AM');
  const [opts, setOpts] = useState([['Ramesh Patel', 'Diya Patel, 9 C · asked by phone · 4 Aug 2026'], ['Kavya Iyer', 'Ira Iyer, 3 B · replied STOP · 21 Jul 2026'], ['Naresh Reddy', 'Varun Reddy, 10 A · letter to the office · 12 Jun 2026']]);
  return (
    <div>
      <ModuleHead sub="Credits, sender IDs, quiet hours, who may message whom, and the automatic messages." />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <div className="grid grid-cols-1 @xl:grid-cols-2 gap-5 @lg:gap-6 items-start">
          <Card>
            <CardHead title="Message credits" sub="1 credit per WhatsApp message or SMS part. Email and app notices are free." icon={I.Coins}
              action={canEdit && <Button size="sm" variant="primary" icon={I.Plus} onClick={() => setTopup(true)}>Top up</Button>} />
            <div className="px-5 pb-5 flex flex-col gap-4">
              <div className="flex items-end gap-3 flex-wrap">
                <p className="font-display text-[34px] font-semibold tnum leading-none">{fmt(BALANCE)}</p>
                <p className="text-[13px] text-ink3 pb-1">credits left · about 23 school days at October’s rate</p>
              </div>
              <HBars rows={[{ k: 'WhatsApp', v: 9412, label: fmt(9412) }, { k: 'SMS', v: 2236, label: fmt(2236) }, { k: 'Backup SMS', v: 384, label: fmt(384) }]} max={10000} unit="" labelWidth={86} />
              <p className="text-[12.5px] text-ink3">Used this month: 12,032. A warning goes to the School Admin below 5,000 credits.</p>
            </div>
          </Card>
          <Card>
            <CardHead title="Sender IDs and DLT" sub="What parents see as the sender" icon={I.BadgeCheck}
              action={<Button size="sm" variant="ghost" onClick={() => go('settings', { page: 'messaging' })}>Connections</Button>} />
            <div className="divide-y divide-line/70 border-t border-line/70">
              {[['WhatsApp Business number', '+91 90300 66100', 'Verified · shows “Sunrise Public School”'], ['SMS sender header', 'SUNSPS', 'Approved on the DLT portal'], ['DLT entity ID', '1101456789012345678', 'Registered with Jio DLT'], ['Email sender', 'office@sunriseps.in', 'Verified domain'], ['Reply-to phone', '040 2305 6678', 'Shown at the end of Parent Link']].map(([t, v, s]) => (
                <SettingRow key={t} title={t} sub={s}><span className="flex items-center gap-2"><span className={cx('text-[13.5px] font-semibold', /\d{10,}|SUNSPS/.test(v) && 'font-mono text-[12.5px]')}>{v}</span>{canEdit && <Button size="sm" variant="ghost" onClick={() => toast({ title: `Change: ${t}`, body: 'Needs the provider to confirm. Every change is logged.', tone: 'info' })}>Change</Button>}</span></SettingRow>
              ))}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 @xl:grid-cols-2 gap-5 @lg:gap-6 items-start">
          <Card>
            <CardHead title="Quiet hours" sub="No ordinary messages to parents at night" icon={I.Moon}
              action={<Switch id="qh-on" on={quiet} onChange={(v) => { if (!canEdit) return; setQuiet(v); toast({ title: `Quiet hours ${v ? 'on' : 'off'}`, body: 'Saved. Recorded in the audit log.' }); }} label="Quiet hours" />} />
            <div className={cx('px-5 pb-5 flex flex-col gap-3', !quiet && 'opacity-50')}>
              <div className="grid grid-cols-2 gap-3">
                <Field label="From" id="qh-from"><Select id="qh-from" value={qFrom} onChange={(v) => { setQFrom(v); toast({ title: `Quiet hours now ${v} to ${qTo}`, body: 'Saved. Recorded in the audit log.' }); }} options={['8:00 PM', '9:00 PM', '10:00 PM']} /></Field>
                <Field label="Until" id="qh-to"><Select id="qh-to" value={qTo} onChange={(v) => { setQTo(v); toast({ title: `Quiet hours now ${qFrom} to ${v}`, body: 'Saved. Recorded in the audit log.' }); }} options={['6:00 AM', '7:00 AM', '8:00 AM']} /></Field>
              </div>
              <p className="text-[13px] text-ink2 flex gap-2"><I.Info size={15} className="text-ink3 shrink-0 mt-0.5" />Messages sent in quiet hours wait until {qTo}. Emergency broadcasts and route emergencies always go at once.</p>
            </div>
          </Card>
          <Card>
            <CardHead title="SMS backup" sub="When WhatsApp fails or is not read in time" icon={I.MessageSquareText} />
            <div className="divide-y divide-line/70 border-t border-line/70">
              {Object.keys(bk).map((k) => (
                <SettingRow key={k} title={`${k} messages`} sub={bk[k] ? 'SMS after 2 hours if not read · uses the DLT template' : 'Off'} id={`bk-${k}`}>
                  <span className="flex items-center gap-3">{bk[k] && <span className="text-[13px] text-ink3 hidden @sm:inline">2 hours</span>}<Switch id={`bk-${k}`} on={bk[k]} label={`SMS backup for ${k}`} onChange={(v) => { if (!canEdit) return; setBk({ ...bk, [k]: v }); toast({ title: `SMS backup for ${k.toLowerCase()} ${v ? 'on' : 'off'}`, body: 'Saved. Recorded in the audit log.' }); }} /></span>
                </SettingRow>
              ))}
            </div>
          </Card>
        </div>

        <Card className="overflow-hidden">
          <CardHead title="Who may send to whom" sub="Set from each role in Settings, Users & Permissions. Teachers are never offered other classes." icon={I.ShieldCheck} />
          <div className="overflow-x-auto scroll-thin border-t border-line">
            <table className="text-[13px] min-w-[760px] w-full">
              <thead><tr className="text-ink3 border-b border-line">{['Role', 'Whole school', 'Fee defaulters', 'Classes and sections', 'Bus route', 'One parent', 'Emergency'].map((h, i) => <th key={h} className={cx('font-semibold py-2.5 px-3 text-left whitespace-nowrap', i === 0 && 'sticky left-0 bg-surface pl-5')}>{h}</th>)}</tr></thead>
              <tbody>
                {WHO_MAY.map(([r, v]) => (
                  <tr key={r} className="border-b border-line/70 last:border-0">
                    <td className="sticky left-0 bg-surface pl-5 pr-3 py-2.5 font-semibold whitespace-nowrap">{r}</td>
                    {v.map((x, i) => <td key={i} className="px-3 py-2.5 whitespace-nowrap">{x === 'All' ? <span className="inline-flex items-center gap-1 text-ok font-semibold"><I.Check size={15} strokeWidth={2.6} />All</span> : x === '—' ? <span className="text-ink3">—</span> : <span className="text-ink2">{x}</span>}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-[12.5px] text-ink3 border-t border-line">HR, Exam In-charge and Academic Head may message staff. Only the Principal and School Admin may send an emergency broadcast.</p>
        </Card>

        <Card>
          <CardHead title="Automatic messages" sub="When this happens, send this. Each rule sends once per event per person, never twice." icon={I.Zap} />
          <ul className="divide-y divide-line/70 border-t border-line/70">
            {rules.map((r) => (
              <li key={r.k} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[14px]">{r.k}</p>
                  <p className="text-[12.5px] text-ink3">{r.when} · {r.tpl} · {r.ch} · {r.timing}</p>
                </div>
                <Switch id={`rule-${r.k}`} on={r.on} label={r.k} onChange={(v) => { if (!canEdit) return; setRules((x) => x.map((y) => (y.k === r.k ? { ...y, on: v } : y))); toast({ title: `${r.k}: ${v ? 'on' : 'off'}`, body: v ? 'Starts with the next event.' : 'Stops from the next event. Nothing already sent changes.', undo: () => setRules((x) => x.map((y) => (y.k === r.k ? { ...y, on: !v } : y))) }); }} />
              </li>
            ))}
          </ul>
        </Card>

        <div className="grid grid-cols-1 @xl:grid-cols-2 gap-5 @lg:gap-6 items-start">
          <Card>
            <CardHead title="Automation log" sub="What was sent, to whom and why" icon={I.History} action={<ExportButton what="automation log" />} />
            <ul className="px-2 pb-2">
              {[['Absent today → 52 parents', 'Attendance saved for 41 classes · 10:05 AM'], ['Birthday wishes → 6 students', 'Birthdays on 9 Oct · 7:30 AM'], ['Fee due reminder → 61 parents', 'Tuition Q3 due 10 Oct · yesterday 6:30 PM'], ['SMS backup → 17 parents', 'Fee reminder not read in 2 hours · yesterday 8:30 PM'], ['Pending homework → 23 parents', 'Maths 6 A, Exercise 4.1 · yesterday 6:00 PM']].map(([a, b]) => (
                <li key={a}><Row icon="Zap" iconTone="brand" title={a} sub={b} /></li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHead title="Parents who opted out" sub={`${30 + opts.length} parents · they still get emergency messages`} icon={I.BellOff}
              action={canEdit && <Button size="sm" variant="secondary" icon={I.Plus} onClick={() => toast({ title: 'Add an opt-out', body: 'Search the parent and add a note on how they asked.', tone: 'info' })}>Add</Button>} />
            <ul className="px-2 pb-2">
              {opts.map(([a, b]) => (
                <li key={a}><Row avatar={a} title={a} sub={b} right={canEdit && <Button size="sm" variant="ghost" onClick={() => { const prev = opts; setOpts(opts.filter((o) => o[0] !== a)); toast({ title: `${a} opted back in`, body: 'Recorded with today’s date.', undo: () => setOpts(prev) }); }}>Remove</Button>} /></li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="grid grid-cols-1 @xl:grid-cols-2 gap-5 @lg:gap-6 items-start">
          <SettingsCard title="Parent Link" sub="What each guardian’s link does" icon={I.Link} rows={[
            { title: 'Send links when an admission is approved', sub: 'Uses the “Parent Link” template', on: true },
            { title: 'One-time code valid for', sub: 'Sent to the guardian’s registered mobile', value: '10 minutes' },
            { title: 'A verified phone stays verified for', sub: 'Then a new code is asked', value: '180 days' },
          ]} />
          <SettingsCard title="Other rules" icon={I.Settings} rows={[
            { title: 'Retry failed messages', sub: 'Then resend by another channel', value: 'Up to 3 times' },
            { title: 'Notices to parents need approval', sub: 'From Settings, Forms & Approvals', value: 'Principal' },
            { title: 'Translate typed messages', sub: 'AI features are on in Modules On/Off. Each translation is checked before sending.', on: true },
            { title: 'Pending-homework messages', sub: 'To parents at 6:00 PM on the due date', on: true },
          ]} />
        </div>
      </div>

      <Sheet open={topup} onClose={() => setTopup(false)} title="Top up message credits" sub="Paid to School OS through Razorpay. Credits never expire."
        footer={<><Button variant="ghost" onClick={() => setTopup(false)}>Cancel</Button><Button variant="primary" icon={I.ShieldCheck} onClick={() => { setTopup(false); toast({ title: `${fmt(pack)} credits added`, body: `New balance ${fmt(BALANCE + pack)}. Invoice INV-26-0418 emailed to accounts.` }); }}>Pay {inr({ 5000: 2250, 10000: 4300, 25000: 10250 }[pack])}</Button></>}>
        <div className="flex flex-col gap-2" role="radiogroup">
          {[[5000, 2250], [10000, 4300], [25000, 10250]].map(([c, p]) => (
            <button key={c} role="radio" aria-checked={pack === c} onClick={() => setPack(c)} className={cx('flex items-center gap-3 p-3.5 rounded-2xl border text-left transition', pack === c ? 'border-brand ring-1 ring-brand bg-brand/5' : 'border-line')}>
              <span className="w-10 h-10 rounded-xl bg-sunken grid place-items-center"><I.Coins size={19} /></span>
              <span className="flex-1"><span className="block font-semibold text-[14.5px] tnum">{fmt(c)} credits</span><span className="block text-[12.5px] text-ink3 tnum">{inr(p)} incl. GST · ₹{(p / c).toFixed(2)} each</span></span>
              <span className={cx('w-5 h-5 rounded-full border-2 grid place-items-center', pack === c ? 'border-brand' : 'border-line')}>{pack === c && <span className="w-2.5 h-2.5 rounded-full bg-brand" />}</span>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}

export const COMMUNICATION_PAGES = {
  send: SendMessage,
  notices: NoticeBoard,
  inbox: Inbox,
  history: History,
  feedback: Feedback,
  surveys: Surveys,
  templates: Templates,
  parentlink: ParentLinkPage,
  settings: MessageSettings,
};
