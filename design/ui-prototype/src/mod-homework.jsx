// Homework & Learning: Homework, Submissions & Grading, Study Material, Quizzes, Discussions, Online Classes, Learning Progress, Homework Settings.
// Teachers see their own classes and subjects; a student (Aarav Sharma, 7 B) sees only their own work. Example data only.
import React, { useState } from 'react';
import * as I from './icons.js';
import { CLASS_7B, FEATURED } from './data.js';
import { cx, Card, CardHead, Button, Pill, Avatar, Field, Input, Segmented, Switch, Empty, Sheet, useToast, Ring } from './ui.jsx';
import { useNav, useRole } from './shell.jsx';
import { pagesFor } from './config.js';
import {
  ModuleHead, useCanEdit, DatePeriod, PERIODS, fmtRange, periodDays, Stats, Band, SearchBox, Toolbar, Select, Textarea, Chips, DataList, BulkBar, SettingsCard, Banner, Suggestion,
  Progress, HBars, Legend, DL, MoreMenu, FormSheet, ConfirmSheet, FileRow, Split, Col, ExportButton, Icon, TONE_SOFT,
} from './kit.jsx';

/* =====================================================================
   Sample data
   ===================================================================== */
const STRENGTH = { '6 A': 40, '6 B': 39, '7 A': 40, '7 B': 38, '8 A': 41, '8 B': 40, '9 A': 36, '9 B': 37, '9 C': 35, '10 A': 38, '10 B': 36, '10 C': 34 };
const ALL_SECS = Object.keys(STRENGTH);
const SUBJECTS = ['English', 'Telugu', 'Hindi', 'Mathematics', 'Science', 'Social Studies'];
const SUB_ICON = { Mathematics: 'Calculator', Science: 'FlaskConical', English: 'BookOpen', Telugu: 'Languages', Hindi: 'Languages', 'Social Studies': 'Globe' };
const SUB_TONE = { Mathematics: 'brand', Science: 'ok', English: 'info', Telugu: 'warn', Hindi: 'warn', 'Social Studies': 'neutral' };
const TEACHER = { Mathematics: 'Imran Shaikh', Science: 'Ravi Teja', English: 'Sridevi Kulkarni', Telugu: 'Lalitha Devi', Hindi: 'Deepak Verma', 'Social Studies': 'Venkat Rao' };

const HW = [
  { id: 'HW-2041', title: 'Exercise 4.2 · Simple equations, Q1–Q10', sub: 'Mathematics', cls: '7 B', by: 'Imran Shaikh', given: 'Thu 8 Oct', due: 'Fri 9 Oct', max: 20, submitted: 24, graded: 10, seen: 31, status: 'Current',
    instr: 'Solve questions 1 to 10 of Exercise 4.2 in your maths notebook. Show every step: write the equation, solve it, then check the answer by putting it back.', files: [['Exercise 4.2, textbook page 82.pdf', 'PDF · 1.2 MB'], ['Board photo: worked example.jpg', 'Photo · 640 KB']] },
  { id: 'HW-2039', title: 'Exercise 4.1 · Basic geometrical ideas', sub: 'Mathematics', cls: '6 A', by: 'Imran Shaikh', given: 'Wed 7 Oct', due: 'Fri 9 Oct', max: 20, submitted: 32, graded: 18, seen: 36, status: 'Current',
    instr: 'Draw and label the figures in questions 1 to 6. Use a sharp pencil and a ruler.', files: [['Exercise 4.1 figures.pdf', 'PDF · 820 KB']] },
  { id: 'HW-2046', title: 'Revision worksheet 1 · Integers and fractions', sub: 'Mathematics', cls: '7 A', by: 'Imran Shaikh', given: 'Fri 9 Oct', due: 'Sat 10 Oct', max: 25, submitted: 3, graded: 0, seen: 22, status: 'Current',
    instr: 'Half Yearly revision. Do all 25 questions on the worksheet and bring it to class.', files: [['Revision worksheet 1.pdf', 'PDF · 2 pages']] },
  { id: 'HW-2052', title: 'Practice paper · Half Yearly revision', sub: 'Mathematics', cls: '7 B', by: 'Imran Shaikh', given: 'Fri 9 Oct', due: 'Tue 13 Oct', max: 50, submitted: 0, graded: 0, seen: 12, status: 'Current',
    instr: 'Write this practice paper in 2 hours at home, like the real exam. We will check it together on Tuesday.', files: [['Practice paper, Class 7 Maths.pdf', 'PDF · 4 pages']] },
  { id: 'HW-2044', title: 'Light: draw ray diagrams for 3 mirrors', sub: 'Science', cls: '7 B', by: 'Ravi Teja', given: 'Wed 7 Oct', due: 'Fri 9 Oct', max: 10, submitted: 29, graded: 12, seen: 33, status: 'Current',
    instr: 'Draw the ray diagrams for a plane mirror, a concave mirror and a convex mirror. Label the incident ray, reflected ray and the normal.', files: [['Ray diagram examples.pdf', 'PDF · 640 KB']] },
  { id: 'HW-2048', title: 'Respiration in organisms · questions 1–6', sub: 'Science', cls: '8 B', by: 'Ravi Teja', given: 'Thu 8 Oct', due: 'Sat 10 Oct', max: 20, submitted: 9, graded: 0, seen: 30, status: 'Current',
    instr: 'Answer questions 1 to 6 at the end of the chapter in your Science notebook.', files: [] },
  { id: 'HW-2045', title: 'Letter to the editor about stray dogs', sub: 'English', cls: '9 A', by: 'Sridevi Kulkarni', given: 'Wed 7 Oct', due: 'Sat 10 Oct', max: 10, submitted: 20, graded: 4, seen: 30, status: 'Current', instr: 'Write a formal letter in about 150 words.', files: [] },
  { id: 'HW-2043', title: 'Map work: rivers of India', sub: 'Social Studies', cls: '8 A', by: 'Venkat Rao', given: 'Tue 6 Oct', due: 'Fri 9 Oct', max: 10, submitted: 35, graded: 35, seen: 39, status: 'Current', instr: 'Mark the ten rivers on the outline map.', files: [['Outline map of India.pdf', 'PDF · 1 page']] },
  { id: 'HW-2031', title: 'Exercise 3.4 · Probability', sub: 'Mathematics', cls: '7 B', by: 'Imran Shaikh', given: 'Mon 5 Oct', due: 'Wed 7 Oct', max: 20, submitted: 35, graded: 35, seen: 36, status: 'Past due', instr: 'Questions 1 to 8.', files: [] },
  { id: 'HW-2029', title: 'Exercise 3.3 · Data handling: mean and mode', sub: 'Mathematics', cls: '6 B', by: 'Imran Shaikh', given: 'Mon 5 Oct', due: 'Tue 6 Oct', max: 20, submitted: 39, graded: 39, seen: 38, status: 'Closed', instr: 'Questions 1 to 6.', files: [] },
  { id: 'HW-2022', title: 'Lab record: acids, bases and salts', sub: 'Science', cls: '7 A', by: 'Ravi Teja', given: 'Tue 6 Oct', due: 'Thu 8 Oct', max: 10, submitted: 37, graded: 37, seen: 38, status: 'Past due', instr: 'Write up the indicator experiment.', files: [] },
  { id: 'HW-2019', title: 'Telugu poem: learn and write the meaning', sub: 'Telugu', cls: '6 A', by: 'Lalitha Devi', given: 'Fri 2 Oct', due: 'Mon 5 Oct', max: 10, submitted: 40, graded: 40, seen: 40, status: 'Closed', instr: 'Learn the poem by heart and write its meaning.', files: [] },
];
// 'Thu 8 Oct' (2026–27 school year) -> '2026-10-08'
const MON3 = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const isoOf = (str) => { const m = /(\d{1,2}) ([A-Z][a-z]{2})/.exec(str || ''); if (!m) return '2026-10-09'; const mo = MON3[m[2]]; return `${mo >= 6 ? 2026 : 2027}-${String(mo).padStart(2, '0')}-${m[1].padStart(2, '0')}`; };
const inPer = (iso, per) => iso >= per.from && iso <= per.to;
const HW_TONE = { Current: 'brand', 'Past due': 'warn', Closed: 'neutral' };
const hwGrade = (score, max) => { const p = (score / max) * 100; return p >= 80 ? 'A' : p >= 60 ? 'B' : p >= 40 ? 'C' : 'D'; };

/* ---------- Students per section (7 B is the real class) ---------- */
const hash = (str) => { let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
const NAMES_B = ['Aarav', 'Vihaan', 'Arjun', 'Reyansh', 'Sai', 'Krishna', 'Ishaan', 'Rohan', 'Aditya', 'Kabir', 'Dhruv', 'Harsha', 'Nikhil', 'Pranav', 'Rahul', 'Tejas', 'Varun', 'Karthik', 'Abhiram', 'Charan'];
const NAMES_G = ['Ananya', 'Diya', 'Saanvi', 'Aadhya', 'Ira', 'Kavya', 'Meera', 'Navya', 'Pooja', 'Riya', 'Sneha', 'Tanvi', 'Vaishnavi', 'Harini', 'Lasya', 'Sahithi', 'Keerthana', 'Bhavya', 'Nithya', 'Shreya'];
const SURNAMES = ['Sharma', 'Reddy', 'Rao', 'Naidu', 'Patel', 'Kumar', 'Iyer', 'Gupta', 'Verma', 'Chowdary', 'Varma', 'Menon', 'Das', 'Singh', 'Joshi', 'Pillai', 'Goud', 'Shetty'];
const ROSTERS = {};
function roster(cls) {
  if (ROSTERS[cls]) return ROSTERS[cls];
  const list = cls === '7 B' ? CLASS_7B.map((s) => ({ id: s.id, name: s.name, roll: s.roll, adm: s.adm, father: s.father, att: s.att }))
    : Array.from({ length: STRENGTH[cls] || 36 }, (_, i) => {
      const h = hash(cls + i); const g = h % 2; const pool = g ? NAMES_G : NAMES_B; const last = SURNAMES[(h >> 3) % SURNAMES.length];
      return { name: `${pool[(h >> 7) % pool.length]} ${last}`, father: `${['Ramesh', 'Srinivas', 'Venkat', 'Mahesh', 'Anil', 'Kiran'][(h >> 11) % 6]} ${last}`, att: 80 + (h % 20), adm: `SPS/${2017 + (h % 9)}/${String(100 + (h % 880)).padStart(4, '0')}` };
    }).sort((a, b) => a.name.localeCompare(b.name)).map((s, i) => ({ ...s, id: `${cls.replace(' ', '')}-${i + 1}`, roll: i + 1 }));
  return (ROSTERS[cls] = list);
}

// One row per student for a homework: who submitted, when, and the score
function subsFor(hw) {
  const list = roster(hw.cls);
  const pastDue = hw.status !== 'Current';
  let order = list.map((s, i) => i);
  if (hw.id === 'HW-2041') {
    const graded = [1, 2, 3, 5, 7, 8, 9, 10, 11, 12], sub = Array.from({ length: 14 }, (_, i) => 13 + i);
    return list.map((s) => {
      const st = graded.includes(s.roll) ? 'Graded' : sub.includes(s.roll) ? 'Submitted' : 'Assigned';
      const score = st === 'Graded' ? Math.min(20, 11 + (hash(s.name) % 10)) : null;
      return { s, st, when: st === 'Assigned' ? null : `Thu 8 Oct, ${5 + (s.roll % 5)}:${String((s.roll * 7) % 60).padStart(2, '0')} PM`, score, mark: st === 'Graded' ? (score >= 10 ? 'Complete' : 'Incorrect') : null, fb: st === 'Graded' ? 'Good steps. Check your answer by putting it back.' : '' };
    });
  }
  order = order.sort((a, b) => hash(list[a].name + hw.id) - hash(list[b].name + hw.id));
  const rank = Object.fromEntries(order.map((idx, k) => [idx, k]));
  return list.map((s, i) => {
    const k = rank[i];
    const st = k < hw.graded ? 'Graded' : k < hw.submitted ? (pastDue && k % 5 === 0 ? 'Late' : 'Submitted') : pastDue ? 'Missing' : 'Assigned';
    const score = st === 'Graded' ? Math.max(Math.round(hw.max * 0.4), Math.min(hw.max, Math.round(hw.max * (0.55 + (hash(s.name + hw.id) % 45) / 100)))) : null;
    return { s, st, when: st === 'Missing' || st === 'Assigned' ? null : `${hw.given}, ${4 + (k % 6)}:${String((k * 13) % 60).padStart(2, '0')} PM`, score, mark: st === 'Graded' ? 'Complete' : null, fb: '' };
  });
}
const SUB_ST_TONE = { Assigned: 'neutral', Submitted: 'info', Late: 'warn', Graded: 'ok', Missing: 'bad' };

/* ---------- Who is looking ---------- */
function useScope(access) {
  const { role } = useRole();
  const id = role.id;
  const teacher = id === 'teacher', ct = id === 'classteacher', student = id === 'student';
  const own = teacher || ct;
  const classes = teacher ? ['6 A', '6 B', '7 A', '7 B'] : ct ? ['7 A', '7 B', '8 B'] : ALL_SECS;
  const subs = teacher ? ['Mathematics'] : ct ? ['Science'] : SUBJECTS;
  const mine = (hw) => !own || hw.by === role.person.name;
  const canEdit = useCanEdit();
  return { role, id, name: role.person.name, teacher, ct, student, own, full: access === 'full', classes, subs, mine, canEdit };
}
function BackLink({ label, sub, onClick }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink mb-3 -ml-1 h-8 px-1 rounded-lg">
      <I.ArrowLeft size={17} />{label} {sub && <span className="text-ink3 font-normal">/ {sub}</span>}
    </button>
  );
}
// Small form controls that keep their own value (used in short forms)
function LSelect(p) { const [v, setV] = useState(p.value); return <Select {...p} value={v} onChange={setV} />; }
function LSwitch({ on, ...p }) { const [v, setV] = useState(!!on); return <Switch {...p} on={v} onChange={setV} />; }
function LSegmented(p) { const [v, setV] = useState(p.value); return <Segmented {...p} value={v} onChange={setV} />; }
function LTextarea(p) { const [v, setV] = useState(p.value); return <Textarea {...p} value={v} onChange={setV} />; }
const SubIcon = ({ sub, size = 40 }) => (
  <span className={cx('rounded-xl grid place-items-center shrink-0', TONE_SOFT[SUB_TONE[sub] || 'neutral'])} style={{ width: size, height: size }}><Icon name={SUB_ICON[sub] || 'BookOpen'} size={size > 36 ? 19 : 16} /></span>
);

/* =====================================================================
   1. Homework
   ===================================================================== */
function HomeworkPage({ params, access }) {
  const sc = useScope(access);
  if (sc.student) return <StudentHomework />;
  if (params?.id) return <HomeworkDetail id={params.id} sc={sc} />;
  return <StaffHomework sc={sc} />;
}

function StaffHomework({ sc }) {
  const { go } = useNav();
  const toast = useToast();
  const [list, setList] = useState(() => HW.filter(sc.mine));
  const [tab, setTab] = useState('current');
  const [q, setQ] = useState('');
  const [cls, setCls] = useState('all');
  const [sub, setSub] = useState('all');
  const [view, setView] = useState('cards');
  const [per, setPer] = useState(PERIODS.thismonth);
  const [give, setGive] = useState(false);
  const inP = list.filter((h) => inPer(isoOf(h.given), per));
  const rows = inP.filter((h) => (tab === 'current' ? h.status === 'Current' : h.status !== 'Current') && (cls === 'all' || h.cls === cls) && (sub === 'all' || h.sub === sub) && (!q.trim() || h.title.toLowerCase().includes(q.trim().toLowerCase())));
  const cur = inP.filter((h) => h.status === 'Current');
  const toCheck = cur.reduce((a, h) => a + h.submitted - h.graded, 0);
  const assigned = cur.reduce((a, h) => a + STRENGTH[h.cls], 0);
  const seenPct = Math.round((cur.reduce((a, h) => a + h.seen, 0) / Math.max(1, assigned)) * 100);
  const archive = (h) => { setList((x) => x.filter((y) => y.id !== h.id)); toast({ title: `Archived: ${h.title}`, body: 'Find it in History with the Archived filter.', undo: () => setList((x) => [h, ...x]) }); };
  const classOpts = [...new Set(list.map((h) => h.cls))];

  return (
    <div>
      <ModuleHead sub={sc.own ? `${sc.subs[0]} · ${sc.classes.join(', ')} · only your classes and subjects` : 'Homework given across the school this week'}
        actions={sc.canEdit && <Button variant="primary" icon={I.NotebookPen} onClick={() => setGive(true)}>Give homework</Button>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Band items={[
          { label: `Current · ${per.label.toLowerCase()}`, big: cur.length, foot: `${assigned} students in ${new Set(cur.map((h) => h.cls)).size} classes` },
          { label: 'Handed in', big: `${Math.round((cur.reduce((a, h) => a + h.submitted, 0) / Math.max(1, assigned)) * 100)}%`, foot: `${cur.reduce((a, h) => a + h.submitted, 0)} of ${assigned}` },
          { label: sc.own ? 'Waiting for you to check' : 'Waiting to be checked', big: toCheck, foot: 'Open Submissions & Grading', onClick: () => go('homework', { page: 'submissions' }) },
          { label: 'Seen by parents', big: `${seenPct}%`, foot: 'From WhatsApp read receipts' },
        ]} />
        <Card>
          <Toolbar>
            <SearchBox id="hw-search" value={q} onChange={setQ} placeholder="Search homework title" />
            <DatePeriod id="hw-per" value={per} onChange={setPer} className="w-full @md:w-auto" />
            {classOpts.length > 1 && <Select id="hw-class" value={cls} onChange={setCls} className="@md:w-36" options={[{ value: 'all', label: 'All classes' }, ...classOpts.map((c) => ({ value: c, label: `Class ${c}` }))]} />}
            {!sc.own && <Select id="hw-sub" value={sub} onChange={setSub} className="@md:w-44" options={[{ value: 'all', label: 'All subjects' }, ...SUBJECTS]} />}
            <Segmented value={view} onChange={setView} className="hidden @md:inline-flex" options={[{ value: 'cards', label: 'Cards', icon: I.LayoutGrid }, { value: 'list', label: 'List', icon: I.Rows3 }]} />
          </Toolbar>
          <div className="flex items-center justify-between gap-3 px-3 pt-3">
            <Segmented value={tab} onChange={setTab} options={[{ value: 'current', label: `Current · ${inP.filter((h) => h.status === 'Current').length}` }, { value: 'history', label: `History · ${inP.filter((h) => h.status !== 'Current').length}` }]} />
            <ExportButton what="homework list" />
          </div>
          {rows.length === 0 ? (
            <Empty icon={I.NotebookPen} title={tab === 'current' ? 'No current homework here' : 'Nothing in history yet'} body={`Nothing given in ${per.label.toLowerCase()} (${fmtRange(per)}). Pick other dates, or give homework.`} action={sc.canEdit && <Button variant="primary" icon={I.NotebookPen} onClick={() => setGive(true)}>Give homework</Button>} />
          ) : view === 'cards' ? (
            <ul className="grid @md:grid-cols-2 @xl:grid-cols-3 gap-3 p-3">
              {rows.map((h) => (
                <li key={h.id} className="rounded-2xl border border-line p-4 flex flex-col gap-3 hover:border-ink3/40 transition">
                  <div className="flex items-start gap-3">
                    <SubIcon sub={h.sub} />
                    <button className="min-w-0 flex-1 text-left" onClick={() => go('homework', { page: 'homework', id: h.id })}>
                      <p className="font-semibold text-[14.5px] leading-snug hover:underline">{h.title}</p>
                      <p className="text-[12.5px] text-ink3 mt-0.5">{h.sub} · Class {h.cls}{!sc.own && ` · ${h.by}`}</p>
                    </button>
                    {h.status !== 'Current' ? <Pill tone={HW_TONE[h.status]}>{h.status}</Pill> : h.due === 'Fri 9 Oct' ? <Pill tone="warn">Due today</Pill> : null}
                  </div>
                  <div>
                    <div className="flex justify-between text-[12.5px] mb-1"><span className="text-ink2"><b className="font-semibold text-ink tnum">{STRENGTH[h.cls]}</b> assigned, <b className="font-semibold text-ink tnum">{h.submitted}</b> submitted</span><span className="text-ink3 tnum">{h.graded} checked</span></div>
                    <Progress value={(h.submitted / STRENGTH[h.cls]) * 100} tone={h.status === 'Past due' && h.submitted < STRENGTH[h.cls] ? 'warn' : 'brand'} />
                  </div>
                  <div className="flex items-center justify-between text-[12.5px] text-ink3">
                    <span className="tnum">Given {h.given} · due <b className={cx('font-semibold', h.due === 'Fri 9 Oct' && h.status === 'Current' ? 'text-warn' : 'text-ink2')}>{h.due === 'Fri 9 Oct' ? 'today' : h.due}</b></span>
                    <span className="inline-flex items-center gap-1"><I.Eye size={13} />Seen by {h.seen} of {STRENGTH[h.cls]}</span>
                  </div>
                  <div className="flex gap-2 mt-auto">
                    <Button size="sm" variant="secondary" className="flex-1" icon={I.ListChecks} onClick={() => go('homework', { page: 'submissions', hw: h.id })}>Check work</Button>
                    <MoreMenu size="sm" items={[
                      ['Eye', 'Open details', () => go('homework', { page: 'homework', id: h.id })],
                      ...(sc.canEdit ? [['Pencil', 'Edit', () => toast({ title: `Editing: ${h.title}`, body: 'Students and parents see the change. It is logged.', tone: 'info' })],
                        ['Archive', 'Archive', () => archive(h)]] : []),
                    ]} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-3 border-t border-line">
              <DataList rows={rows} onRow={(h) => go('homework', { page: 'homework', id: h.id })} minWidth={760} footer={`Showing: ${per.label} · ${fmtRange(per)} · ${rows.length} homework`}
                columns={[
                  { key: 't', label: 'Homework', render: (h) => <div className="flex items-center gap-3"><SubIcon sub={h.sub} size={34} /><div><p className="font-semibold leading-tight">{h.title}</p><p className="text-[12.5px] text-ink3">{h.sub} · {h.cls}</p></div></div> },
                  { key: 'd', label: 'Due', nowrap: true, render: (h) => <span className="tnum">{h.due}</span> },
                  { key: 'c', label: 'Handed in', render: (h) => <span className="tnum">{h.submitted} of {STRENGTH[h.cls]}</span> },
                  { key: 'p', label: 'Seen by parent', render: (h) => <span className="tnum">{h.seen} of {STRENGTH[h.cls]}</span> },
                  { key: 's', label: 'Status', render: (h) => <Pill tone={HW_TONE[h.status]}>{h.status}</Pill> },
                ]}
                mobile={(h) => ({ icon: SUB_ICON[h.sub], iconTone: SUB_TONE[h.sub], title: h.title, sub: `${h.cls} · due ${h.due} · ${h.submitted} of ${STRENGTH[h.cls]} in` })} />
            </div>
          )}
          {view === 'cards' && rows.length > 0 && <div className="px-4 py-3 border-t border-line text-[13px] text-ink3 tnum">Showing: {per.label} · {fmtRange(per)} · {rows.length} homework</div>}
        </Card>
      </div>
      <GiveHomeworkSheet open={give} onClose={() => setGive(false)} sc={sc}
        onSent={(h) => { setList((x) => [h, ...x]); setTab('current'); toast({ title: `Homework sent to Class ${h.cls}`, body: `${STRENGTH[h.cls]} students notified. Parents get it on WhatsApp.` }); }} />
    </div>
  );
}

function HomeworkDetail({ id, sc }) {
  const { go } = useNav();
  const toast = useToast();
  const h0 = HW.find((x) => x.id === id);
  const h = h0 && sc.mine(h0) ? h0 : HW.filter(sc.mine)[0];
  const n = STRENGTH[h.cls];
  const rows = subsFor(h);
  const notSeenAll = [...roster(h.cls)].sort((a, b) => hash(a.name + h.id) - hash(b.name + h.id)).slice(0, n - h.seen);
  const [resend, setResend] = useState(false);
  const [sent, setSent] = useState(false);
  const [q, setQ] = useState('');
  const seenRows = roster(h.cls).map((s) => ({ s, seen: !notSeenAll.includes(s), when: `${h.given}, ${3 + (s.roll % 6)}:${String((s.roll * 11) % 60).padStart(2, '0')} PM`, via: s.roll % 4 ? 'WhatsApp' : 'Parent Link' }))
    .filter((r) => !q.trim() || r.s.name.toLowerCase().includes(q.trim().toLowerCase()));
  const count = (st) => rows.filter((r) => r.st === st).length;
  return (
    <div>
      <BackLink label="Homework" sub={`${h.sub} · ${h.cls}`} onClick={() => go('homework')} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Card className="p-4 @md:p-5 flex flex-col @lg:flex-row @lg:items-center gap-4">
          <SubIcon sub={h.sub} size={48} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap"><h1 className="font-display text-[22px] @md:text-[26px] font-semibold tracking-tight leading-tight">{h.title}</h1><Pill tone={HW_TONE[h.status]} dot>{h.status}</Pill></div>
            <p className="text-[13.5px] text-ink3 mt-0.5">{h.sub} · Class {h.cls} · {h.by} · given {h.given} · due {h.due} · out of {h.max}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" icon={I.ListChecks} onClick={() => go('homework', { page: 'submissions', hw: h.id })}>Check work</Button>
            {sc.canEdit && <MoreMenu items={[
              ['Pencil', 'Edit', () => toast({ title: `Editing: ${h.title}`, tone: 'info' })],
              ['Copy', 'Give to another section', () => toast({ title: 'Copied as a new homework', body: 'Choose the section and due date, then send.', tone: 'info' })],
              ['Archive', 'Archive', () => { go('homework'); toast({ title: `Archived: ${h.title}`, undo: () => go('homework', { page: 'homework', id: h.id }) }); }],
            ]} />}
          </div>
        </Card>
        <Stats items={[
          { label: 'Assigned', value: n, sub: 'Whole section', icon: 'Users' },
          { label: 'Submitted', value: count('Submitted') + count('Late') + count('Graded'), sub: count('Late') ? `${count('Late')} late` : 'On time', tone: 'info', icon: 'Upload' },
          { label: 'Checked', value: count('Graded'), tone: 'ok', icon: 'CircleCheck' },
          { label: h.status === 'Current' ? 'Not yet' : 'Missing', value: count('Assigned') + count('Missing'), tone: count('Missing') ? 'bad' : undefined, icon: 'Hourglass' },
        ]} />
        <Split side={380}>
          <Col>
            <Card>
              <CardHead title="Instructions" icon={I.NotebookText} />
              <p className="px-5 pb-4 text-[14.5px] text-ink2 leading-relaxed">{h.instr}</p>
              {h.files.length > 0 && <ul className="px-3 pb-3">{h.files.map(([f, m]) => <FileRow key={f} name={f} meta={m} onView={() => toast({ title: `Opening ${f}`, tone: 'info' })} />)}</ul>}
              <DL rows={[['Given to', `Whole section · ${n} students`], ['Online submission', 'On · photos or PDF'], ['Start date', h.given], ['Due date', `${h.due}, 11:59 PM`]]} />
            </Card>
          </Col>
          <Col>
            <Card className="overflow-hidden">
              <CardHead title="Seen by parent" sub={`${h.seen} of ${n} · from WhatsApp read receipts and Parent Link`} icon={I.Eye}
                action={sc.canEdit && notSeenAll.length > 0 && !sent && <Button size="sm" variant="soft" icon={I.Send} onClick={() => setResend(true)}>Resend to {notSeenAll.length}</Button>} />
              <div className="px-3 pb-2"><SearchBox id="seen-search" value={q} onChange={setQ} placeholder="Student name" /></div>
              <ul className="px-2 pb-2 max-h-[420px] overflow-y-auto scroll-thin">
                {[...seenRows].sort((a, b) => a.seen - b.seen).map((r) => (
                  <li key={r.s.id} className="flex items-center gap-3 px-3 py-2 rounded-xl">
                    <Avatar name={r.s.name} size={32} />
                    <div className="min-w-0 flex-1"><p className="font-semibold text-[14px] truncate">{r.s.name}</p><p className="text-[12px] text-ink3 truncate">{r.s.father}</p></div>
                    {r.seen ? <span className="text-right text-[12px] text-ink3 tnum">{r.when}<span className="block">{r.via}</span></span> : <Pill tone={sent ? 'info' : 'warn'}>{sent ? 'Sent again' : 'Not seen'}</Pill>}
                  </li>
                ))}
              </ul>
            </Card>
          </Col>
        </Split>
      </div>
      <ConfirmSheet open={resend} onClose={() => setResend(false)} title={`Resend to ${notSeenAll.length} parents?`} confirmLabel={`Send to ${notSeenAll.length} parents`}
        onConfirm={() => { setSent(true); toast({ title: `Homework sent again to ${notSeenAll.length} parents`, body: 'WhatsApp, with SMS backup if not read in 2 hours.' }); }}>
        <p className="text-[14px] text-ink2">Only the parents who have not seen “{h.title}”: {notSeenAll.map((s) => s.father).join(', ')}. By WhatsApp, with SMS backup. Cost: {notSeenAll.length} credits. A message cannot be unsent.</p>
      </ConfirmSheet>
    </div>
  );
}

function GiveHomeworkSheet({ open, onClose, sc, onSent }) {
  const [cls, setCls] = useState(sc.classes.includes('7 B') ? '7 B' : sc.classes[0]);
  const [sub, setSub] = useState(sc.subs.includes('Mathematics') ? 'Mathematics' : sc.subs[0]);
  const [title, setTitle] = useState('');
  const [instr, setInstr] = useState('');
  const [files, setFiles] = useState([]);
  const [due, setDue] = useState('next');
  const [dueDate, setDueDate] = useState('');
  const [more, setMore] = useState(false);
  const [to, setTo] = useState('section');
  const [start, setStart] = useState('09-10-2026');
  const [max, setMax] = useState('100');
  const [online, setOnline] = useState(true);
  const [ai, setAi] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const dn = (s) => { const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s); return m ? +m[3] * 10000 + +m[2] * 100 + +m[1] : null; };
  const errTitle = !title.trim() ? 'Give the homework a title, like “Exercise 4.3”.' : '';
  const errDue = due === 'pick' ? (!dn(dueDate) ? 'Type the due date as DD-MM-YYYY, like 12-10-2026.' : dn(start) && dn(dueDate) < dn(start) ? 'Due date is before the start date.' : '') : '';
  const errMax = !(Number(max) >= 1 && Number(max) <= 100) ? 'Maximum marks must be from 1 to 100.' : '';
  const nextClass = sub === 'Science' ? 'Sat 10 Oct, period 4' : 'Sat 10 Oct, period 2';
  const reset = () => { setTitle(''); setInstr(''); setFiles([]); setDue('next'); setDueDate(''); setTried(false); setAi(false); setMore(false); };
  const send = () => {
    setTried(true);
    if (errTitle || errDue || errMax) { if (errMax || errDue) setMore(true); return; }
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      onSent({ id: 'HW-2055', title: title.trim(), sub, cls, by: sc.name, given: 'Fri 9 Oct', due: due === 'tomorrow' ? 'Sat 10 Oct' : due === 'next' ? 'Sat 10 Oct' : dueDate, max: Number(max), submitted: 0, graded: 0, seen: 0, status: 'Current', instr: instr || 'See the attached photo.', files: files.map((f) => [f, 'Photo']) });
      reset(); onClose();
    }, 800);
  };
  const addFile = (kind) => setFiles((x) => [...x, kind === 'photo' ? `Board photo ${x.length + 1}.jpg` : kind === 'file' ? 'Worksheet 4.3.pdf' : 'Link: NCERT exercise 4.3'].filter((v, i, a) => a.indexOf(v) === i));
  return (
    <Sheet open={open} onClose={onClose} title="Give homework" sub="Three steps: class, what to do, send. Due date is filled for you."
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={I.Send} loading={busy} onClick={send}>{busy ? 'Sending…' : `Send to ${cls}`}</Button></>}>
      <div className="flex flex-col gap-4">
        <Field label="1 · Class" required hint="Only your classes that have students are shown">
          {sc.own ? (
            <div className="flex flex-wrap gap-1.5">
              {sc.classes.map((c) => (
                <button key={c} onClick={() => setCls(c)} aria-pressed={cls === c} className={cx('h-10 px-3.5 rounded-xl text-[13.5px] font-semibold border transition inline-flex items-center gap-2', cls === c ? 'bg-ink text-bg border-ink' : 'bg-surface border-line text-ink2 hover:border-ink3/50')}>
                  {c}<span className={cx('text-[11.5px] tnum', cls === c ? 'opacity-70' : 'text-ink3')}>{STRENGTH[c]}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Select id="gh-class" value={cls} onChange={setCls} options={ALL_SECS.map((c) => ({ value: c, label: `Class ${c} · ${STRENGTH[c]}` }))} />
              <Select id="gh-sub" value={sub} onChange={setSub} options={SUBJECTS} />
            </div>
          )}
        </Field>
        {sc.own && <p className="text-[13px] text-ink3 -mt-2">Subject: <b className="font-semibold text-ink2">{sub}</b></p>}

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2"><p className="text-[13px] font-semibold text-ink2">2 · What to do</p><Button size="sm" variant="soft" icon={I.Sparkles} onClick={() => setAi(true)}>Draft with AI</Button></div>
          {ai && (
            <div className="rounded-2xl border border-brand/25 bg-brand/[.03] p-3.5">
              <p className="flex items-center gap-2 text-[13.5px] font-semibold"><I.Sparkles size={15} className="text-brand" />Draft homework<Pill tone="brand" className="!h-5 !text-[11px] ml-auto">Suggestion</Pill></p>
              <p className="text-[13.5px] font-semibold mt-2">Exercise 4.3 · Word problems on simple equations</p>
              <p className="text-[13.5px] text-ink2 mt-0.5">Solve questions 1 to 8. For each, write what x stands for, form the equation, solve it and check. Q7 and Q8 are a little harder: try them after the others.</p>
              <p className="text-[12px] text-ink3 mt-1.5">Based on: the Class 7 syllabus (Simple Equations, lesson 4 of 7) and what 7 B did this week</p>
              <div className="flex gap-2 mt-2">
                <Button size="sm" variant="soft" onClick={() => { setTitle('Exercise 4.3 · Word problems on simple equations'); setInstr('Solve questions 1 to 8. For each, write what x stands for, form the equation, solve it and check. Q7 and Q8 are a little harder: try them after the others.'); setAi(false); }}>Use and edit</Button>
                <Button size="sm" variant="ghost" onClick={() => setAi(false)}>Discard</Button>
              </div>
            </div>
          )}
          <Field label="Title" required id="gh-title" error={tried && errTitle}><Input id="gh-title" value={title} onChange={(e) => setTitle(e.target.value)} error={tried && errTitle} placeholder="Exercise 4.3, Q1–Q8" /></Field>
          <Field label="Instructions" id="gh-instr" hint="Or just attach a photo of the board"><Textarea id="gh-instr" value={instr} onChange={setInstr} placeholder="What should students do?" /></Field>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={I.Camera} onClick={() => addFile('photo')}>Photo of the board</Button>
            <Button size="sm" variant="secondary" icon={I.Paperclip} onClick={() => addFile('file')}>File</Button>
            <Button size="sm" variant="secondary" icon={I.Link2} onClick={() => addFile('link')}>Link</Button>
          </div>
          {files.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {files.map((f) => (
                <li key={f} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2 text-[13.5px]">
                  {f.startsWith('Link') ? <I.Link2 size={16} className="text-ink3" /> : f.endsWith('.pdf') ? <I.FileText size={16} className="text-ink3" /> : <I.FileImage size={16} className="text-ink3" />}
                  <span className="flex-1 min-w-0 truncate">{f}</span>
                  <button onClick={() => setFiles((x) => x.filter((y) => y !== f))} aria-label={`Remove ${f}`} className="w-8 h-8 grid place-items-center rounded-lg text-ink3 hover:bg-sunken"><I.X size={15} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Field label="3 · Due" required error={tried && errDue}>
          <Segmented value={due} onChange={setDue} className="w-full" options={[{ value: 'next', label: 'Next class' }, { value: 'tomorrow', label: 'Tomorrow' }, { value: 'pick', label: 'Pick a date' }]} />
          {due === 'pick' ? <Input id="gh-due" value={dueDate} onChange={(e) => setDueDate(e.target.value)} placeholder="DD-MM-YYYY" error={tried && errDue} className="tnum mt-1" />
            : <p className="text-[12.5px] text-ink3">{due === 'next' ? `Next ${sub} class: ${nextClass}` : 'Sat 10 Oct, 11:59 PM'}</p>}
        </Field>

        <button onClick={() => setMore(!more)} className="self-start inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-brand h-8 px-1 rounded-lg">
          <I.ChevronDown size={16} className={cx('transition', more && 'rotate-180')} />More details
        </button>
        {more && (
          <div className="flex flex-col gap-3 animate-rise">
            <Field label="Given to" required><Segmented value={to} onChange={setTo} className="w-full" options={[{ value: 'section', label: `Whole ${cls}` }, { value: 'class', label: `All of Class ${cls.split(' ')[0]}` }, { value: 'some', label: 'Chosen students' }]} /></Field>
            {to === 'some' && <p className="text-[12.5px] text-ink3 -mt-1">After sending, pick the students from the list. Others will not see it.</p>}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start date" required id="gh-start"><Input id="gh-start" value={start} onChange={(e) => setStart(e.target.value)} className="tnum" /></Field>
              <Field label="Maximum marks" id="gh-max" error={tried && errMax}><Input id="gh-max" inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ''))} error={tried && errMax} className="tnum" /></Field>
            </div>
            <div className="rounded-xl border border-line px-3.5 py-3 flex items-center gap-3">
              <Switch id="gh-online" on={online} onChange={setOnline} label="Online submission" />
              <label htmlFor="gh-online" className="text-[13.5px]"><b className="font-semibold block">Online submission</b><span className="text-ink3 text-[12.5px]">Students with a login hand in a photo or file</span></label>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ---------- Student: My homework ---------- */
const MY_HW = [
  { id: 'HW-2041', sub: 'Mathematics', title: 'Exercise 4.2 · Simple equations, Q1–Q10', by: 'Imran Shaikh', due: 'today, Fri 9 Oct', today: true, max: 20, state: 'todo', instr: HW[0].instr, files: HW[0].files },
  { id: 'HW-2050', sub: 'English', title: 'Read chapter 5 and write a short summary', by: 'Sridevi Kulkarni', due: 'Sat 10 Oct', max: 10, state: 'todo', instr: 'Read “The Ashes That Made Trees Bloom” and write a summary in about 100 words.', files: [] },
  { id: 'HW-2052', sub: 'Mathematics', title: 'Practice paper · Half Yearly revision', by: 'Imran Shaikh', due: 'Tue 13 Oct', max: 50, state: 'todo', instr: HW[3].instr, files: HW[3].files },
  { id: 'HW-2044', sub: 'Science', title: 'Light: draw ray diagrams for 3 mirrors', by: 'Ravi Teja', due: 'today, Fri 9 Oct', max: 10, state: 'submitted', when: 'Thu 8 Oct, 7:12 PM', mine: ['Ray diagrams page 1.jpg', 'Ray diagrams page 2.jpg'] },
  { id: 'HW-2036', sub: 'Social Studies', title: 'Map: the Mughal empire at its peak', by: 'Venkat Rao', due: 'Wed 7 Oct', max: 10, state: 'submitted', when: 'Wed 7 Oct, 9:20 PM', late: true, mine: ['Mughal map.jpg'] },
  { id: 'HW-2031', sub: 'Mathematics', title: 'Exercise 3.4 · Probability', by: 'Imran Shaikh', due: 'Wed 7 Oct', max: 20, state: 'checked', score: 18, fb: 'Neat working and correct answers. In Q6, write the sample space first, then count.' },
  { id: 'HW-2027', sub: 'Hindi', title: 'Essay: my favourite festival', by: 'Deepak Verma', due: 'Mon 5 Oct', max: 20, state: 'checked', score: 13, fb: 'Good ideas. Check the spelling of the matras and write in paragraphs.', resubmit: 'Sat 10 Oct' },
  { id: 'HW-2022', sub: 'Science', title: 'Lab record: nutrition in plants', by: 'Ravi Teja', due: 'Fri 2 Oct', max: 10, state: 'checked', score: 9, fb: 'Well-labelled diagrams. Keep it up.' },
];

function StudentHomework() {
  const { go } = useNav();
  const toast = useToast();
  const [items, setItems] = useState(MY_HW);
  const [tab, setTab] = useState('todo');
  const [per, setPer] = useState(PERIODS.acyear);
  const [open, setOpen] = useState(null);
  const [submit, setSubmit] = useState(null);
  const todo = items.filter((x) => x.state === 'todo');
  const shown = items.filter((x) => x.state === tab && inPer(isoOf(x.due), per));
  const checked = items.filter((x) => x.state === 'checked');
  const avgPct = Math.round(checked.reduce((a, x) => a + (x.score / x.max) * 100, 0) / Math.max(1, checked.length));
  return (
    <div>
      <ModuleHead sub={`${FEATURED.name} · Class 7 B · roll ${FEATURED.roll} · only your own work`} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Band items={[
          { label: 'Homework to do', big: todo.length, foot: `${todo.filter((x) => x.today).length} due today`, onClick: () => setTab('todo') },
          { label: 'Quizzes open', big: '2', foot: 'Light and shadows closes 6 PM', onClick: () => go('homework', { page: 'quizzes' }) },
          { label: 'Next online class', big: 'Sat 5 PM', foot: 'Maths doubt-clearing', onClick: () => go('homework', { page: 'online' }) },
          { label: 'Checked this month', big: `${avgPct}%`, foot: `Average of ${checked.length} homework` },
        ]} />
        <Card>
          <CardHead title="My homework" sub="Hand it in here before the due date. After that it is marked late." icon={I.NotebookPen} />
          <div className="px-3 flex flex-col @md:flex-row gap-2.5 @md:items-center"><DatePeriod id="my-hw-per" future value={per} onChange={setPer} className="w-full @md:w-auto" /><Segmented value={tab} onChange={setTab} className="w-full @md:w-auto" options={[{ value: 'todo', label: `To do · ${todo.length}` }, { value: 'submitted', label: `Handed in · ${items.filter((x) => x.state === 'submitted').length}` }, { value: 'checked', label: `Checked · ${checked.length}` }]} /></div>
          {shown.length === 0 ? <Empty icon={I.PartyPopper} title={tab === 'todo' ? 'All done' : 'Nothing here'} body={`Nothing due in ${per.label.toLowerCase()} (${fmtRange(per)}). New homework shows here as soon as a teacher gives it.`} /> : (
            <ul className="p-2">
              {shown.map((x) => (
                <li key={x.id} className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-sunken/60">
                  <SubIcon sub={x.sub} />
                  <button onClick={() => setOpen(x)} className="min-w-0 flex-1 text-left">
                    <p className="font-semibold text-[14.5px] leading-snug">{x.title}</p>
                    <p className="text-[12.5px] text-ink3">{x.sub} · {x.by}</p>
                    <p className={cx('text-[12.5px] mt-0.5', x.state === 'todo' && x.today ? 'text-warn font-semibold' : 'text-ink3')}>
                      {x.state === 'todo' ? `Due ${x.due}` : x.state === 'submitted' ? `Handed in ${x.when}` : `Score ${x.score} of ${x.max}`}
                    </p>
                  </button>
                  {x.state === 'todo' && <Button size="sm" variant="primary" icon={I.Upload} onClick={() => setSubmit(x)}>Submit</Button>}
                  {x.state === 'submitted' && <Pill tone={x.late ? 'warn' : 'info'}>{x.late ? 'Late' : 'Waiting to be checked'}</Pill>}
                  {x.state === 'checked' && <Pill tone={hwGrade(x.score, x.max) === 'A' ? 'ok' : 'brand'}>Grade {hwGrade(x.score, x.max)}</Pill>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.title} sub={open ? `${open.sub} · ${open.by} · due ${open.due} · out of ${open.max}` : ''}
        footer={open && <>{open.state === 'todo' && <Button variant="primary" icon={I.Upload} onClick={() => { setSubmit(open); setOpen(null); }}>Submit</Button>}{open.resubmit && <Button variant="secondary" icon={I.Repeat} onClick={() => { setSubmit(open); setOpen(null); }}>Hand in again</Button>}<Button variant="ghost" onClick={() => setOpen(null)}>Close</Button></>}>
        {open && (
          <div className="flex flex-col gap-4">
            {open.instr && <p className="text-[14.5px] text-ink2 leading-relaxed">{open.instr}</p>}
            {open.files?.length > 0 && <ul>{open.files.map(([f, m]) => <FileRow key={f} name={f} meta={m} onView={() => toast({ title: `Opening ${f}`, tone: 'info' })} />)}</ul>}
            {open.mine && <div><p className="text-[13px] font-semibold text-ink2 mb-1">What you handed in</p><ul>{open.mine.map((f) => <FileRow key={f} name={f} meta={`Photo · ${open.when}`} onView={() => toast({ title: `Opening ${f}`, tone: 'info' })} />)}</ul></div>}
            {open.state === 'checked' && (
              <div className="rounded-2xl bg-sunken/60 p-4">
                <div className="flex items-center gap-3"><Ring value={(open.score / open.max) * 100} size={56} stroke={6} tone="ok"><span className="text-[13px] font-bold tnum">{open.score}</span></Ring>
                  <div><p className="font-semibold text-[15px]">{open.score} of {open.max} · Grade {hwGrade(open.score, open.max)}</p><p className="text-[12.5px] text-ink3">Checked by {open.by}</p></div></div>
                <p className="text-[14px] text-ink2 mt-3"><b className="font-semibold text-ink">Feedback: </b>{open.fb}</p>
                {open.resubmit && <p className="text-[13px] text-info mt-2 flex gap-1.5"><I.Repeat size={15} className="shrink-0 mt-0.5" />Your teacher lets you hand this in again until {open.resubmit}.</p>}
              </div>
            )}
          </div>
        )}
      </Sheet>
      <SubmitSheet hw={submit} onClose={() => setSubmit(null)} onDone={(x) => { setItems((all) => all.map((y) => (y.id === x.id ? { ...y, state: 'submitted', when: 'today, 10:45 AM', late: false, mine: x.mine } : y))); }} />
    </div>
  );
}

function SubmitSheet({ hw, onClose, onDone }) {
  const [files, setFiles] = useState([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  if (!hw) return null;
  const close = () => { setFiles([]); setNote(''); setDone(false); onClose(); };
  const add = (kind) => setFiles((x) => [...x, kind === 'photo' ? `Photo ${x.length + 1} · 10:4${4 + x.length} AM` : `${hw.sub === 'Mathematics' ? 'Exercise-4-2' : 'Homework'}.pdf`]);
  return (
    <Sheet open={!!hw} onClose={close} title={done ? '' : `Hand in: ${hw.title}`} sub={done ? '' : `${hw.sub} · due ${hw.due}`}>
      {done ? (
        <div className="flex flex-col items-center text-center pt-6 pb-2">
          <span className="w-16 h-16 rounded-full bg-ok text-white grid place-items-center animate-pop shadow-pop"><I.Check size={34} strokeWidth={3} /></span>
          <h2 className="font-display text-[24px] font-semibold mt-4">Handed in</h2>
          <p className="text-ink3 text-[14px] mt-1">Today at 10:45 AM · on time · {files.length} {files.length === 1 ? 'file' : 'files'}</p>
          <p className="text-ink2 text-[14px] mt-3 max-w-xs">{hw.by} will check it. You will see the score and feedback in My homework.</p>
          <Button variant="primary" className="mt-5 w-full" onClick={close}>Done</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => add('photo')} className="h-24 rounded-2xl border-2 border-dashed border-line hover:border-brand hover:text-brand flex flex-col items-center justify-center gap-1.5 text-[13.5px] font-semibold text-ink2 transition"><I.Camera size={22} />Take a photo</button>
            <button onClick={() => add('file')} className="h-24 rounded-2xl border-2 border-dashed border-line hover:border-brand hover:text-brand flex flex-col items-center justify-center gap-1.5 text-[13.5px] font-semibold text-ink2 transition"><I.Paperclip size={22} />Choose a file</button>
          </div>
          <p className="text-[12.5px] text-ink3 -mt-2">Photos or PDF, up to 10 MB each. One photo per page.</p>
          {files.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {files.map((f) => (
                <li key={f} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2 text-[13.5px]">
                  {f.endsWith('.pdf') ? <I.FileText size={16} className="text-ink3" /> : <I.FileImage size={16} className="text-ink3" />}
                  <span className="flex-1 min-w-0 truncate">{f}</span><I.CircleCheck size={16} className="text-ok" />
                  <button onClick={() => setFiles((x) => x.filter((y) => y !== f))} aria-label={`Remove ${f}`} className="w-8 h-8 grid place-items-center rounded-lg text-ink3 hover:bg-sunken"><I.X size={15} /></button>
                </li>
              ))}
            </ul>
          )}
          <Field label="Note to your teacher" id="sb-note" hint="Optional"><Textarea id="sb-note" value={note} onChange={setNote} rows={2} placeholder="For example: I could not do Q9" /></Field>
          <Button variant="primary" size="lg" icon={I.Upload} disabled={!files.length} loading={busy} onClick={() => { setBusy(true); setTimeout(() => { setBusy(false); setDone(true); onDone({ ...hw, mine: files }); }, 900); }}>
            {busy ? 'Handing in…' : files.length ? `Hand in ${files.length} ${files.length === 1 ? 'file' : 'files'}` : 'Add a photo or file first'}
          </Button>
        </div>
      )}
    </Sheet>
  );
}

/* =====================================================================
   2. Submissions & Grading
   ===================================================================== */
function SubmissionsPage({ params, access }) {
  const sc = useScope(access);
  const [per, setPer] = useState(PERIODS.thismonth);
  const all = HW.filter(sc.mine);
  const list = all.filter((h) => inPer(isoOf(h.given), per) || h.id === params?.hw);
  const def = list.find((h) => h.id === params?.hw) || list.find((h) => h.cls === '7 B' && h.submitted > 0) || list[0];
  const [hwId, setHwId] = useState(def?.id);
  const hw = list.find((h) => h.id === hwId) || def;
  return (
    <div>
      <ModuleHead sub={sc.own ? `${sc.subs[0]} · ${sc.classes.join(', ')} · only your homework` : 'Who handed in, and the marks and feedback'} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Card className="p-3 flex flex-col @md:flex-row gap-2.5 @md:items-center">
          <DatePeriod id="sg-per" value={per} onChange={setPer} className="w-full @md:w-auto" />
          {hw && <Select id="sg-hw" value={hw.id} onChange={setHwId} className="flex-1 min-w-0" options={list.map((h) => ({ value: h.id, label: `${h.cls} · ${h.title} · due ${h.due}` }))} />}
          {hw && <p className="text-[13px] text-ink3 px-1">Out of {hw.max} · {hw.sub} · {hw.by}</p>}
        </Card>
        {hw ? <SubsTable key={hw.id} hw={hw} sc={sc} /> : <Card><Empty icon={I.NotebookPen} title="No homework given in these dates" body={`${per.label} · ${fmtRange(per)}. Pick other dates to check work.`} action={<Button variant="secondary" onClick={() => setPer(PERIODS.thismonth)}>This month</Button>} /></Card>}
      </div>
    </div>
  );
}

function SubsTable({ hw, sc }) {
  const toast = useToast();
  const { go } = useNav();
  const [rows, setRows] = useState(() => subsFor(hw));
  const [f, setF] = useState('all');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(new Set());
  const [bulk, setBulk] = useState(null);
  const [one, setOne] = useState(null);
  const count = (fn) => rows.filter(fn).length;
  const toCheck = (r) => r.st === 'Submitted' || r.st === 'Late';
  const notIn = (r) => r.st === 'Assigned' || r.st === 'Missing';
  const shown = rows.filter((r) => (f === 'all' || (f === 'check' ? toCheck(r) : f === 'graded' ? r.st === 'Graded' : notIn(r))) && (!q.trim() || r.s.name.toLowerCase().includes(q.trim().toLowerCase()) || String(r.s.roll) === q.trim()));
  const selected = rows.filter((r) => sel.has(r.s.id));
  const applyBulk = () => {
    const before = rows;
    const ids = new Set(selected.filter((r) => r.st !== 'Graded').map((r) => r.s.id));
    setRows((x) => x.map((r) => (ids.has(r.s.id) ? { ...r, st: 'Graded', mark: 'Complete', when: r.when || 'Checked in class' } : r)));
    setSel(new Set());
    toast({ title: `${ids.size} students marked Complete`, body: selected.length - ids.size ? `${selected.length - ids.size} skipped: already checked` : 'Students see it now.', undo: () => setRows(before) });
  };
  return (
    <>
      <Stats items={[
        { label: 'Handed in', value: `${count((r) => !notIn(r))} of ${rows.length}`, icon: 'Upload' },
        { label: 'To check', value: count(toCheck), tone: count(toCheck) ? 'warn' : undefined, icon: 'ListChecks', onClick: () => setF('check') },
        { label: 'Checked', value: count((r) => r.st === 'Graded'), tone: 'ok', icon: 'CircleCheck', onClick: () => setF('graded') },
        { label: hw.status === 'Current' ? 'Not handed in yet' : 'Missing', value: count(notIn), tone: hw.status !== 'Current' && count(notIn) ? 'bad' : undefined, icon: 'Hourglass', onClick: () => setF('not') },
      ]} />
      <Card className="overflow-hidden">
        <Toolbar>
          <SearchBox id="sg-search" value={q} onChange={setQ} placeholder="Student name or roll" />
          <ExportButton what="submissions" />
        </Toolbar>
        <div className="px-3 pt-3"><Chips value={f} onChange={setF} options={[{ value: 'all', label: 'Everyone', count: rows.length }, { value: 'check', label: 'To check', count: count(toCheck) }, { value: 'graded', label: 'Checked', count: count((r) => r.st === 'Graded') }, { value: 'not', label: 'Not handed in', count: count(notIn) }]} /></div>
        {sc.canEdit && <BulkBar count={sel.size} onClear={() => setSel(new Set())}>
          <Button size="sm" variant="secondary" icon={I.CheckCheck} onClick={() => setBulk('complete')}>Mark Complete</Button>
          {selected.some(notIn) && <Button size="sm" variant="secondary" icon={I.Send} onClick={() => setBulk('remind')}>Remind parents</Button>}
        </BulkBar>}
        <DataList select={sc.canEdit ? [sel, setSel] : null} rowKey={(r) => r.s.id} rows={shown} onRow={(r) => setOne(r)} minWidth={780} footer={`Showing ${shown.length} of ${rows.length} · ${sel.size} selected`}
          columns={[
            { key: 'n', label: 'Student', render: (r) => <div className="flex items-center gap-2.5"><span className="text-ink3 tnum w-5 text-[13px]">{r.s.roll}</span><Avatar name={r.s.name} size={32} /><span className="font-semibold">{r.s.name}</span></div> },
            { key: 'a', label: 'Admission no.', render: (r) => <span className="font-mono text-[12.5px]">{r.s.adm}</span> },
            { key: 'w', label: 'Submission', render: (r) => (r.when ? <span className="text-[13px] tnum">{r.when}</span> : <span className="text-[13px] text-ink3">Not submitted</span>) },
            { key: 's', label: 'Status', render: (r) => <Pill tone={SUB_ST_TONE[r.st]}>{r.st}</Pill> },
            { key: 'sc', label: `Score / ${hw.max}`, align: 'right', render: (r) => (r.score != null ? <b className="font-semibold">{r.score}</b> : r.mark ? <span className="text-ink3 text-[13px]">{r.mark}</span> : <span className="text-ink3">—</span>) },
          ]}
          mobile={(r) => ({ avatar: r.s.name, title: `${r.s.roll}. ${r.s.name}`, sub: r.when || 'Not submitted', right: r.score != null ? <b className="font-semibold tnum">{r.score}/{hw.max}</b> : null, pills: [<Pill key="s" tone={SUB_ST_TONE[r.st]} className="!h-[22px] !text-[11.5px]">{r.st}</Pill>] })} />
      </Card>
      <ConfirmSheet open={bulk === 'complete'} onClose={() => setBulk(null)} title={`Mark ${selected.length} students Complete?`} confirmLabel={`Mark ${selected.filter((r) => r.st !== 'Graded').length} Complete`} onConfirm={applyBulk}>
        <div className="text-[14px] text-ink2 flex flex-col gap-2">
          <p>For work checked in class. Each student’s status becomes Complete, with no score. You can undo this for 10 seconds.</p>
          <ul className="rounded-xl border border-line divide-y divide-line/70 max-h-48 overflow-y-auto scroll-thin">
            {selected.map((r) => <li key={r.s.id} className="flex justify-between px-3 py-1.5 text-[13px]"><span>{r.s.name}</span><span className="text-ink3">{r.st === 'Graded' ? 'Already checked · skipped' : `${r.st} → Complete`}</span></li>)}
          </ul>
        </div>
      </ConfirmSheet>
      <ConfirmSheet open={bulk === 'remind'} onClose={() => setBulk(null)} title="Remind parents?" confirmLabel={`Send to ${selected.filter(notIn).length} parents`}
        onConfirm={() => { setSel(new Set()); toast({ title: `Reminder sent to ${selected.filter(notIn).length} parents`, body: 'WhatsApp, with SMS backup. Sent once per homework.' }); }}>
        <p className="text-[14px] text-ink2">Parents of {selected.filter(notIn).map((r) => r.s.name).join(', ')} get one message saying “{hw.title}” is not handed in. Cost: {selected.filter(notIn).length} credits. A message cannot be unsent.</p>
      </ConfirmSheet>
      <GradeSheet r={one} hw={hw} canEdit={sc.canEdit} onClose={() => setOne(null)} onOpenProfile={(s) => go('student', { id: s.id })}
        onSave={(upd) => { setRows((x) => x.map((r) => (r.s.id === upd.s.id ? upd : r))); toast({ title: `Saved for ${upd.s.name}`, body: upd.score != null ? `${upd.score} of ${hw.max} · ${upd.mark}. The student sees the feedback now.` : `${upd.mark}. The student sees it now.` }); }} />
    </>
  );
}

function GradeSheet({ r, hw, canEdit, onClose, onSave, onOpenProfile }) {
  const [key, setKey] = useState(null);
  const [mark, setMark] = useState('Complete');
  const [score, setScore] = useState('');
  const [fb, setFb] = useState('');
  const [resub, setResub] = useState(false);
  const [sug, setSug] = useState(false);
  const [reply, setReply] = useState('');
  const [thread, setThread] = useState([]);
  const [zoom, setZoom] = useState(null);
  if (r && key !== r.s.id) {
    setKey(r.s.id); setMark(r.mark || 'Complete'); setScore(r.score != null ? String(r.score) : ''); setFb(r.fb || ''); setResub(false); setSug(false); setReply('');
    setThread(r.when ? [{ who: r.s.name, text: r.s.roll % 3 === 0 ? 'Sir, I was not sure about Q9, so I tried it two ways.' : 'Handed in my work.', when: r.when }] : []);
  }
  if (!r) return null;
  const n = Number(score);
  const errScore = score !== '' && (!/^\d+$/.test(score) ? 'Type a whole number.' : n > hw.max ? `Out of ${hw.max}. ${n} is too high.` : '');
  const close = () => { setKey(null); onClose(); };
  const real = CLASS_7B.some((s) => s.id === r.s.id);
  const suggestion = `${r.s.name.split(' ')[0]}, your steps for Q1 to Q6 are clear and correct. In Q8 you moved 7 to the other side without changing its sign; check that step again. Try one more problem like Q8 before the test.`;
  return (
    <Sheet open={!!r} onClose={close} wide title={r.s.name} sub={`Roll ${r.s.roll} · ${hw.title}`}
      footer={<>{real && <Button variant="ghost" icon={I.User} onClick={() => { close(); onOpenProfile(r.s); }}>Profile</Button>}<Button variant="ghost" onClick={close}>Cancel</Button>
        {canEdit && <Button variant="primary" icon={I.Check} disabled={!!errScore || (!r.when && mark === 'Incorrect')} onClick={() => { onSave({ ...r, st: 'Graded', mark, score: score === '' ? null : n, fb: fb.trim(), when: r.when || 'Checked in class' }); close(); }}>Save</Button>}</>}>
      <div className="grid @md:grid-cols-[1fr_1fr] gap-5">
        <div className="flex flex-col gap-3">
          <p className="text-[13px] font-semibold text-ink2">What {r.s.name.split(' ')[0]} handed in</p>
          {r.when ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                {[1, 2].map((pg) => (
                  <button key={pg} onClick={() => setZoom(pg)} className={cx('aspect-[3/4] rounded-xl border border-line bg-sunken/60 p-3 flex flex-col gap-1.5 text-left transition', zoom === pg && 'ring-2 ring-brand')} aria-label={`Page ${pg}`}>
                    {Array.from({ length: 7 }).map((_, i) => <span key={i} className="h-1.5 rounded-full bg-ink3/25" style={{ width: `${55 + ((i * 17 + pg * 9) % 40)}%` }} />)}
                    <span className="mt-auto text-[11.5px] text-ink3">Page {pg} · photo</span>
                  </button>
                ))}
              </div>
              <p className="text-[12.5px] text-ink3">{r.st === 'Late' ? <span className="text-warn font-semibold">Late · </span> : null}Handed in {r.when}{zoom ? ` · showing page ${zoom} full size` : ' · tap a page to see it full size'}</p>
            </>
          ) : <Banner tone="warn">Nothing handed in online yet. If you checked the notebook in class, mark it Complete.</Banner>}
          {thread.length > 0 && (
            <div className="rounded-2xl border border-line p-3">
              <p className="text-[12px] text-ink3 font-semibold mb-2">Discussion</p>
              <ul className="flex flex-col gap-2">
                {thread.map((t, i) => <li key={i} className="text-[13.5px]"><b className="font-semibold">{t.who}</b> <span className="text-ink3 text-[12px]">· {t.when}</span><p className="text-ink2">{t.text}</p></li>)}
              </ul>
              <div className="flex gap-2 mt-2">
                <Input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply to the student" className="!h-10" aria-label="Reply to the student" />
                <Button variant="secondary" icon={I.Reply} disabled={!reply.trim()} onClick={() => { setThread((x) => [...x, { who: 'You', text: reply.trim(), when: 'just now' }]); setReply(''); }} className="!h-10">Reply</Button>
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-4">
          <Field label="Status" required><Segmented value={mark} onChange={setMark} className="w-full" options={['Complete', 'Incorrect']} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Score out of ${hw.max}`} id="gr-score" error={errScore}><Input id="gr-score" inputMode="numeric" value={score} onChange={(e) => setScore(e.target.value.trim())} error={!!errScore} className="tnum !text-[18px] font-semibold" placeholder={`0 to ${hw.max}`} /></Field>
            <Field label="Grade" hint="Worked out from the score"><div className="h-11 rounded-xl bg-sunken/60 px-3.5 flex items-center font-semibold">{score !== '' && !errScore ? hwGrade(n, hw.max) : '—'}</div></Field>
          </div>
          <Field label="Feedback" id="gr-fb" hint="The student sees this"><Textarea id="gr-fb" value={fb} onChange={setFb} rows={3} placeholder="One thing done well, one thing to fix" /></Field>
          {!sug ? <Button variant="soft" size="sm" icon={I.Sparkles} className="self-start" onClick={() => setSug(true)}>Suggest feedback</Button> : (
            <div className="rounded-2xl border border-brand/25 bg-brand/[.03] p-3.5">
              <p className="flex items-center gap-2 text-[13.5px] font-semibold"><I.Sparkles size={15} className="text-brand" />Feedback draft<Pill tone="brand" className="!h-5 !text-[11px] ml-auto">Suggestion</Pill></p>
              <p className="text-[13.5px] text-ink2 mt-1.5">{suggestion}</p>
              <p className="text-[12px] text-ink3 mt-1.5">Based on: the photos handed in and the answer key for {hw.title.split(' · ')[0]}</p>
              <div className="flex gap-2 mt-2"><Button size="sm" variant="soft" onClick={() => { setFb(suggestion); setSug(false); }}>Use and edit</Button><Button size="sm" variant="ghost" onClick={() => setSug(false)}>Discard</Button></div>
            </div>
          )}
          <div className="rounded-xl border border-line px-3.5 py-3 flex items-center gap-3">
            <Switch id="gr-resub" on={resub} onChange={setResub} label="Allow hand in again" />
            <label htmlFor="gr-resub" className="text-[13.5px]"><b className="font-semibold block">Allow hand in again</b><span className="text-ink3 text-[12.5px]">Only for this student, until Sat 10 Oct</span></label>
          </div>
        </div>
      </div>
    </Sheet>
  );
}

/* =====================================================================
   3. Study Material
   ===================================================================== */
const LESSONS = {
  'Mathematics|7': [
    { id: 'L1', title: 'Integers', ch: 'Chapter 1', items: [['notes', 'Integers: notes.pdf', 'PDF · 6 pages'], ['video', 'Adding and subtracting integers', 'Video link · 11 min'], ['doc', 'Practice sheet 1.pdf', 'PDF · 2 pages']], vis: true },
    { id: 'L2', title: 'Fractions and Decimals', ch: 'Chapter 2', items: [['notes', 'Fractions and decimals: notes.pdf', 'PDF · 8 pages'], ['video', 'Multiplying fractions', 'Video link · 9 min']], vis: true },
    { id: 'L3', title: 'Data Handling', ch: 'Chapter 3', items: [['notes', 'Mean, median and mode.pdf', 'PDF · 5 pages'], ['link', 'Practice: reading bar graphs', 'Link · NCERT']], vis: true },
    { id: 'L4', title: 'Simple Equations', ch: 'Chapter 4', items: [['notes', 'Simple equations: notes.pdf', 'PDF · 8 pages'], ['video', 'Solving equations: the balance method', 'Video link · 12 min'], ['doc', 'Practice sheet 4.pdf', 'PDF · 2 pages']], vis: true },
    { id: 'L5', title: 'Lines and Angles', ch: 'Chapter 5', items: [['notes', 'Lines and angles: notes.pdf', 'PDF · 7 pages']], vis: false },
  ],
  'Mathematics|6': [
    { id: 'L1', title: 'Knowing Our Numbers', ch: 'Chapter 1', items: [['notes', 'Place value and estimation.pdf', 'PDF · 6 pages']], vis: true },
    { id: 'L2', title: 'Whole Numbers', ch: 'Chapter 2', items: [['notes', 'Whole numbers: notes.pdf', 'PDF · 5 pages'], ['video', 'The number line', 'Video link · 8 min']], vis: true },
    { id: 'L3', title: 'Playing with Numbers', ch: 'Chapter 3', items: [['notes', 'Factors and multiples.pdf', 'PDF · 7 pages']], vis: true },
    { id: 'L4', title: 'Basic Geometrical Ideas', ch: 'Chapter 4', items: [['notes', 'Points, lines and curves.pdf', 'PDF · 6 pages'], ['doc', 'Exercise 4.1 figures.pdf', 'PDF · 1 page']], vis: true },
  ],
  'Science|7': [
    { id: 'L1', title: 'Nutrition in Plants', ch: 'Chapter 1', items: [['notes', 'Photosynthesis: notes.pdf', 'PDF · 6 pages'], ['video', 'How leaves make food', 'Video link · 7 min']], vis: true },
    { id: 'L2', title: 'Heat', ch: 'Chapter 4', items: [['notes', 'Conduction, convection, radiation.pdf', 'PDF · 5 pages']], vis: true },
    { id: 'L3', title: 'Acids, Bases and Salts', ch: 'Chapter 5', items: [['notes', 'Indicators: notes.pdf', 'PDF · 6 pages'], ['doc', 'Lab activity sheet.pdf', 'PDF · 2 pages']], vis: true },
    { id: 'L4', title: 'Light', ch: 'Chapter 15', items: [['notes', 'Light: notes.pdf', 'PDF · 9 pages'], ['video', 'Concave and convex mirrors', 'Video link · 10 min'], ['doc', 'Ray diagram examples.pdf', 'PDF · 3 pages']], vis: true },
  ],
  'Science|8': [
    { id: 'L1', title: 'Crop Production and Management', ch: 'Chapter 1', items: [['notes', 'Crops: notes.pdf', 'PDF · 6 pages']], vis: true },
    { id: 'L2', title: 'Microorganisms', ch: 'Chapter 2', items: [['notes', 'Microorganisms: notes.pdf', 'PDF · 7 pages'], ['video', 'Friend and foe', 'Video link · 9 min']], vis: true },
    { id: 'L3', title: 'Respiration in Organisms', ch: 'Chapter 6', items: [['notes', 'Respiration: notes.pdf', 'PDF · 5 pages']], vis: true },
  ],
  'English|7': [
    { id: 'L1', title: 'Three Questions', ch: 'Unit 1', items: [['notes', 'Summary and word meanings.pdf', 'PDF · 3 pages']], vis: true },
    { id: 'L2', title: 'A Gift of Chappals', ch: 'Unit 2', items: [['notes', 'Character sketch notes.pdf', 'PDF · 3 pages'], ['video', 'Story read aloud', 'Video link · 14 min']], vis: true },
    { id: 'L3', title: 'The Ashes That Made Trees Bloom', ch: 'Unit 5', items: [['notes', 'Summary.pdf', 'PDF · 2 pages']], vis: true },
  ],
  'Social Studies|7': [
    { id: 'L1', title: 'Tracing Changes Through a Thousand Years', ch: 'History 1', items: [['notes', 'Notes.pdf', 'PDF · 5 pages']], vis: true },
    { id: 'L2', title: 'The Mughal Empire', ch: 'History 4', items: [['notes', 'The Mughals: notes.pdf', 'PDF · 7 pages'], ['doc', 'Outline map.pdf', 'PDF · 1 page']], vis: true },
  ],
};
const ITEM_ICON = { notes: 'FileText', video: 'CirclePlay', doc: 'FileText', link: 'Link2' };
const lessonsFor = (sub, cls) => LESSONS[`${sub}|${cls.split(' ')[0]}`] || LESSONS[`${sub}|7`] || LESSONS['Mathematics|7'];

function MaterialPage({ access }) {
  const sc = useScope(access);
  return sc.student ? <StudentMaterial /> : <StaffMaterial sc={sc} />;
}

function StaffMaterial({ sc }) {
  const toast = useToast();
  const courses = sc.own ? sc.classes.map((c) => ({ cls: c, sub: sc.subs[0] })) : [{ cls: '7 B', sub: 'Mathematics' }, { cls: '7 B', sub: 'Science' }, { cls: '7 B', sub: 'English' }, { cls: '7 B', sub: 'Social Studies' }, { cls: '6 A', sub: 'Mathematics' }, { cls: '8 B', sub: 'Science' }];
  const [ck, setCk] = useState(courses.find((c) => c.cls === '7 B') ? `${courses.find((c) => c.cls === '7 B').sub}|7 B` : `${courses[0].sub}|${courses[0].cls}`);
  const [sub, cls] = ck.split('|');
  const [lessons, setLessons] = useState(() => ({}));
  const cur = lessons[ck] || lessonsFor(sub, cls);
  const setCur = (fn) => setLessons((x) => ({ ...x, [ck]: fn(x[ck] || lessonsFor(sub, cls)) }));
  const [add, setAdd] = useState(false);
  const [copy, setCopy] = useState(false);
  const [who, setWho] = useState(null);
  const n = STRENGTH[cls];
  const opened = (l, i) => (l.vis ? Math.max(0, n - 2 - i * 4 - (hash(l.title + cls) % 4)) : 0);
  const move = (i, d) => setCur((x) => { const y = [...x]; const [m] = y.splice(i, 1); y.splice(i + d, 0, m); return y; });
  return (
    <div>
      <ModuleHead sub={sc.own ? `Your courses: ${sc.subs[0]} for ${sc.classes.join(', ')}` : 'A course workspace for each class and subject'}
        actions={sc.canEdit && <><Button variant="secondary" icon={I.Copy} onClick={() => setCopy(true)}>Copy course</Button><Button variant="primary" icon={I.Plus} onClick={() => setAdd(true)}>Add lesson</Button></>} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Chips value={ck} onChange={setCk} options={courses.map((c) => ({ value: `${c.sub}|${c.cls}`, label: `${c.sub} · ${c.cls}` }))} />
        <Split side={340}>
          <Card>
            <CardHead title={`Learning path · ${sub} · Class ${cls}`} sub={`${cur.length} lessons in order · ${cur.filter((l) => l.vis).length} visible to students`} icon={I.BookOpenCheck} />
            <ol className="px-3 pb-3 flex flex-col gap-2">
              {cur.map((l, i) => (
                <li key={l.id} className={cx('rounded-2xl border p-3.5', l.vis ? 'border-line' : 'border-dashed border-line bg-sunken/40')}>
                  <div className="flex items-start gap-3">
                    <span className="w-8 h-8 rounded-lg bg-brand/10 text-brand grid place-items-center text-[13px] font-bold tnum shrink-0">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[14.5px]">{l.title} <span className="text-ink3 font-normal text-[13px]">· {l.ch}</span></p>
                      <button onClick={() => setWho({ l, i })} className="text-[12.5px] text-ink3 hover:text-brand">{l.vis ? `Opened by ${opened(l, i)} of ${n}` : 'Hidden from students'}</button>
                    </div>
                    {sc.canEdit && <div className="flex items-center gap-0.5 shrink-0">
                      <button aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="w-8 h-8 grid place-items-center rounded-lg text-ink3 hover:bg-sunken disabled:opacity-30"><I.ArrowUp size={16} /></button>
                      <button aria-label="Move down" disabled={i === cur.length - 1} onClick={() => move(i, 1)} className="w-8 h-8 grid place-items-center rounded-lg text-ink3 hover:bg-sunken disabled:opacity-30"><I.ArrowDown size={16} /></button>
                      <Switch on={l.vis} label={`Visible: ${l.title}`} onChange={(v) => { setCur((x) => x.map((y) => (y.id === l.id ? { ...y, vis: v } : y))); toast({ title: v ? `${l.title} is visible to ${cls}` : `${l.title} is hidden`, undo: () => setCur((x) => x.map((y) => (y.id === l.id ? { ...y, vis: !v } : y))) }); }} />
                    </div>}
                  </div>
                  <ul className="mt-2.5 flex flex-col gap-1 pl-11">
                    {l.items.map(([k, name, meta]) => (
                      <li key={name}><button onClick={() => toast({ title: `Opening ${name}`, tone: 'info' })} className="w-full flex items-center gap-2.5 text-left text-[13.5px] rounded-lg px-2 py-1.5 hover:bg-sunken/70"><Icon name={ITEM_ICON[k]} size={16} className="text-ink3 shrink-0" /><span className="flex-1 min-w-0 truncate">{name}</span><span className="text-[12px] text-ink3 shrink-0 hidden @sm:inline">{meta}</span></button></li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </Card>
          <Col>
            <Card>
              <CardHead title="This course" icon={I.FolderOpen} />
              <DL rows={[['Teacher', TEACHER[sub]], ['Students', `${n} in ${cls}`], ['Files', `${cur.reduce((a, l) => a + l.items.length, 0)} · 38 MB`], ['Last added', 'Simple Equations, 6 Oct']]} cols={1} />
            </Card>
            <Banner tone="info" icon="Lightbulb">Students see lessons in this order. Hide a lesson until you teach it.</Banner>
          </Col>
        </Split>
      </div>
      <FormSheet open={add} onClose={() => setAdd(false)} title="Add lesson" sub={`${sub} · Class ${cls}`} submitLabel="Add lesson" onSubmit={() => { setCur((x) => [...x, { id: 'L' + (x.length + 9), title: 'Comparing Quantities', ch: 'Chapter 7', items: [['notes', 'Comparing quantities: notes.pdf', 'PDF · 6 pages']], vis: true }]); toast({ title: 'Lesson added: Comparing Quantities', body: `Visible to ${cls}. Students get a notification.` }); }}>
        <Field label="Course" required><Input value={`${sub} · Class ${cls}`} readOnly className="bg-sunken/50" /></Field>
        <Field label="Lesson title" required id="ls-title"><Input id="ls-title" defaultValue="Comparing Quantities" /></Field>
        <Field label="Chapter" id="ls-ch" hint="From the syllabus"><LSelect id="ls-ch" value="7" options={[{ value: '7', label: 'Chapter 7 · Comparing Quantities' }, { value: '8', label: 'Chapter 8 · Rational Numbers' }]} /></Field>
        <Field label="Content" required hint="Notes, files, video links">
          <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="secondary" icon={I.Upload} onClick={() => toast({ title: 'Choose files', tone: 'info' })}>Upload files</Button><Button type="button" size="sm" variant="secondary" icon={I.Link2} onClick={() => toast({ title: 'Paste a video or web link', tone: 'info' })}>Add a link</Button></div>
        </Field>
        <div className="rounded-xl border border-line px-3.5 py-3 flex items-center gap-3"><LSwitch id="ls-vis" on label="Visible to students" /><label htmlFor="ls-vis" className="text-[13.5px] font-semibold">Visible to students</label></div>
      </FormSheet>
      <ConfirmSheet open={copy} onClose={() => setCopy(false)} title="Copy this course?" confirmLabel={`Copy to ${cls === '7 B' ? '7 A' : '7 B'}`}
        onConfirm={() => toast({ title: `${sub} course copied to ${cls === '7 B' ? '7 A' : '7 B'}`, body: `${cur.length} lessons, all hidden until you show them.` })}>
        <p className="text-[14px] text-ink2">All {cur.length} lessons and their files are copied to Class {cls === '7 B' ? '7 A' : '7 B'}. They start hidden there, so you choose when students see them.</p>
      </ConfirmSheet>
      <Sheet open={!!who} onClose={() => setWho(null)} title={who ? `Who opened “${who.l.title}”` : ''} sub={who ? `${opened(who.l, who.i)} of ${n} students in ${cls}` : ''}>
        {who && (
          <ul className="flex flex-col">
            {roster(cls).map((s, k) => {
              const did = k < opened(who.l, who.i) ? (hash(s.name) % n) < opened(who.l, who.i) || k < opened(who.l, who.i) - 3 : false;
              return <li key={s.id} className="flex items-center gap-3 py-2 border-b border-line/70 last:border-0"><Avatar name={s.name} size={30} /><span className="flex-1 text-[14px]">{s.name}</span>{did ? <span className="text-[12px] text-ink3">Opened</span> : <Pill tone="warn">Not opened</Pill>}</li>;
            })}
          </ul>
        )}
      </Sheet>
    </div>
  );
}

function StudentMaterial() {
  const toast = useToast();
  const subs = ['Mathematics', 'Science', 'English', 'Social Studies'];
  const [sub, setSub] = useState('Mathematics');
  const [done, setDone] = useState(() => new Set(['Mathematics|L1', 'Mathematics|L2', 'Mathematics|L3', 'Science|L1', 'Science|L2', 'Science|L3', 'English|L1', 'English|L2', 'Social Studies|L1']));
  const [open, setOpen] = useState(null);
  const lessons = lessonsFor(sub, '7 B').filter((l) => l.vis);
  const doneHere = lessons.filter((l) => done.has(`${sub}|${l.id}`)).length;
  return (
    <div>
      <ModuleHead sub="Class 7 B · notes, files and videos from your teachers" />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Chips value={sub} onChange={setSub} options={subs.map((s) => ({ value: s, label: s }))} />
        <Card>
          <div className="flex items-center gap-4 p-5">
            <Ring value={(doneHere / lessons.length) * 100} size={64} stroke={7}><span className="text-[13px] font-bold tnum">{doneHere}/{lessons.length}</span></Ring>
            <div className="min-w-0"><p className="font-semibold text-[16px]">{sub}</p><p className="text-[13px] text-ink3">{TEACHER[sub]} · {doneHere} of {lessons.length} lessons done</p></div>
          </div>
          <ol className="px-3 pb-3 flex flex-col gap-2">
            {lessons.map((l, i) => {
              const k = `${sub}|${l.id}`;
              const isDone = done.has(k);
              return (
                <li key={l.id}>
                  <button onClick={() => setOpen(l)} className="w-full flex items-center gap-3 rounded-2xl border border-line p-3.5 text-left hover:bg-sunken/50 transition">
                    <span className={cx('w-9 h-9 rounded-full grid place-items-center text-[13px] font-bold tnum shrink-0', isDone ? 'bg-ok/15 text-ok' : 'bg-brand/10 text-brand')}>{isDone ? <I.Check size={16} strokeWidth={3} /> : i + 1}</span>
                    <div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px]">{l.title}</p><p className="text-[12.5px] text-ink3">{l.ch} · {l.items.length} {l.items.length === 1 ? 'item' : 'items'}</p></div>
                    {!isDone && i === doneHere && <Pill tone="brand">Up next</Pill>}
                    <I.ChevronRight size={18} className="text-ink3" />
                  </button>
                </li>
              );
            })}
          </ol>
        </Card>
      </div>
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.title} sub={open ? `${sub} · ${open.ch} · ${TEACHER[sub]}` : ''}
        footer={open && <><Button variant="ghost" onClick={() => setOpen(null)}>Close</Button>
          <Button variant={done.has(`${sub}|${open.id}`) ? 'secondary' : 'primary'} icon={I.Check} onClick={() => { const k = `${sub}|${open.id}`; setDone((x) => { const y = new Set(x); y.has(k) ? y.delete(k) : y.add(k); return y; }); toast({ title: done.has(`${sub}|${open.id}`) ? 'Marked as not done' : `${open.title} done`, body: 'Your teacher can see your progress.' }); setOpen(null); }}>{done.has(`${sub}|${open.id}`) ? 'Mark as not done' : 'Mark as done'}</Button></>}>
        {open && (
          <ul className="flex flex-col gap-2">
            {open.items.map(([k, name, meta]) => (
              <li key={name} className="flex items-center gap-3 rounded-xl border border-line p-3">
                <span className={cx('w-10 h-10 rounded-xl grid place-items-center shrink-0', k === 'video' ? 'bg-bad/10 text-bad' : 'bg-sunken text-ink2')}><Icon name={ITEM_ICON[k]} size={19} /></span>
                <div className="min-w-0 flex-1"><p className="font-semibold text-[14px] truncate">{name}</p><p className="text-[12.5px] text-ink3">{meta}</p></div>
                <Button size="sm" variant="secondary" onClick={() => toast({ title: `Opening ${name}`, tone: 'info' })}>{k === 'video' ? 'Play' : 'Open'}</Button>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
    </div>
  );
}

/* =====================================================================
   4. Quizzes
   ===================================================================== */
const QUIZZES = [
  { id: 'QZ-31', date: '2026-10-08', title: 'Light and shadows', sub: 'Science', cls: '7 B', by: 'Ravi Teja', qs: 10, time: '15 min', tries: 1, taken: 27, avg: 7.4, status: 'Open', closes: 'today, 6:00 PM' },
  { id: 'QZ-30', date: '2026-10-07', title: 'Simple equations: quick check', sub: 'Mathematics', cls: '7 B', by: 'Imran Shaikh', qs: 8, time: '10 min', tries: 2, taken: 19, avg: 6.1, status: 'Open', closes: 'Sun 11 Oct, 8:00 PM' },
  { id: 'QZ-29', date: '2026-10-09', title: 'Half Yearly revision: algebra', sub: 'Mathematics', cls: '7 A', by: 'Imran Shaikh', qs: 15, time: '20 min', tries: 1, taken: 0, avg: null, status: 'Draft', closes: 'Not set' },
  { id: 'QZ-27', date: '2026-09-28', title: 'Integers', sub: 'Mathematics', cls: '7 A', by: 'Imran Shaikh', qs: 10, time: '10 min', tries: 1, taken: 40, avg: 8.2, status: 'Closed', closes: 'Closed 2 Oct' },
  { id: 'QZ-26', date: '2026-09-25', title: 'Fractions and decimals', sub: 'Mathematics', cls: '6 B', by: 'Imran Shaikh', qs: 10, time: '12 min', tries: 1, taken: 37, avg: 7.0, status: 'Closed', closes: 'Closed 30 Sep' },
  { id: 'QZ-25', date: '2026-09-24', title: 'Acids, bases and salts', sub: 'Science', cls: '7 A', by: 'Ravi Teja', qs: 10, time: '15 min', tries: 1, taken: 39, avg: 7.8, status: 'Closed', closes: 'Closed 29 Sep' },
  { id: 'QZ-24', date: '2026-09-21', title: 'Microorganisms', sub: 'Science', cls: '8 B', by: 'Ravi Teja', qs: 12, time: '15 min', tries: 1, taken: 38, avg: 8.9, status: 'Closed', closes: 'Closed 26 Sep' },
  { id: 'QZ-22', date: '2026-09-20', title: 'Tenses', sub: 'English', cls: '9 A', by: 'Sridevi Kulkarni', qs: 20, time: '20 min', tries: 2, taken: 34, avg: 15.2, status: 'Closed', closes: 'Closed 25 Sep' },
];
const QZ_TONE = { Open: 'ok', Draft: 'neutral', Closed: 'info' };
const LIGHT_QS = [
  ['Light travels in a ______ line.', ['Straight', 'Curved', 'Zigzag', 'Circular'], 0],
  ['The image in a plane mirror is:', ['Real and upside down', 'Virtual and upright', 'Real and upright', 'Virtual and upside down'], 1],
  ['Which mirror is used as the rear-view mirror of a vehicle?', ['Concave', 'Convex', 'Plane', 'None of these'], 1],
  ['A shadow forms when:', ['Light passes through glass', 'An opaque object blocks light', 'Light is reflected', 'Light bends'], 1],
  ['Which lens is used in a magnifying glass?', ['Concave', 'Convex', 'Plane glass', 'Any lens'], 1],
  ['Splitting white light into seven colours is called:', ['Reflection', 'Dispersion', 'Absorption', 'Shadow'], 1],
  ['In a plane mirror, your right hand appears as your:', ['Right hand', 'Left hand', 'Both hands', 'Neither'], 1],
  ['The inside of a shiny steel spoon acts like a:', ['Convex mirror', 'Concave mirror', 'Plane mirror', 'Lens'], 1],
  ['Which of these gives out its own light?', ['The Moon', 'The Sun', 'A mirror', 'A book'], 1],
  ['Newton’s disc, spun fast, looks:', ['Black', 'White', 'Red', 'Rainbow coloured'], 1],
];

const EQ_QS = [
  ['Solve: x + 7 = 15', ['x = 7', 'x = 8', 'x = 22', 'x = 15'], 1],
  ['If 3x = 21, then x is', ['7', '18', '24', '63'], 0],
  ['Solve: x ÷ 4 = 5', ['1.25', '9', '20', '1'], 2],
  ['Solve: 2x − 5 = 9', ['2', '7', '9', '14'], 1],
  ['Twice a number plus 3 is 17. The number is', ['5', '7', '10', '14'], 1],
  ['Which is the solution of 5y = 0?', ['y = 0', 'y = 5', 'y = 1', 'y = −5'], 0],
  ['Raju is 4 years older than Ravi. Their ages add up to 30. Ravi is', ['13', '17', '26', '15'], 0],
  ['True or false: x = 3 is the solution of 4x − 2 = 10', ['True', 'False'], 0],
];
const questionsOf = (z) => (z.id === 'QZ-31' ? LIGHT_QS : EQ_QS);

function QuizzesPage({ access }) {
  const sc = useScope(access);
  return sc.student ? <StudentQuizzes /> : <StaffQuizzes sc={sc} />;
}

function StaffQuizzes({ sc }) {
  const toast = useToast();
  const [list, setList] = useState(() => QUIZZES.filter((z) => !sc.own || z.by === sc.name));
  const [f, setF] = useState('all');
  const [q, setQ] = useState('');
  const [per, setPer] = useState(PERIODS.last30);
  const [add, setAdd] = useState(false);
  const [open, setOpen] = useState(null);
  const inP = list.filter((z) => inPer(z.date || '2026-10-09', per));
  const rows = inP.filter((z) => (f === 'all' || z.status === f) && (!q.trim() || z.title.toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <div>
      <ModuleHead sub={sc.own ? `Quizzes for your classes · they mark themselves` : 'Quizzes that mark themselves, for practice and class tests'} actions={sc.canEdit && <Button variant="primary" icon={I.Plus} onClick={() => setAdd(true)}>Create quiz</Button>} />
      <Card className="overflow-hidden">
        <Toolbar><SearchBox id="qz-search" value={q} onChange={setQ} placeholder="Search quizzes" /><DatePeriod id="qz-per" value={per} onChange={setPer} className="w-full @md:w-auto" /><ExportButton what="quiz results" /></Toolbar>
        <div className="px-3 pt-3"><Chips value={f} onChange={setF} options={[{ value: 'all', label: 'All', count: inP.length }, ...['Open', 'Draft', 'Closed'].map((s) => ({ value: s, label: s, count: inP.filter((z) => z.status === s).length }))]} /></div>
        <DataList rows={rows} onRow={(z) => setOpen(z)} minWidth={820} footer={`Showing: ${per.label} · ${fmtRange(per)} · ${rows.length} quizzes`}
          empty={<Empty icon={I.ListChecks} title="No quizzes in these dates" body="Pick other dates or another filter." />}
          columns={[
            { key: 't', label: 'Quiz', render: (z) => <div className="flex items-center gap-3"><SubIcon sub={z.sub} size={34} /><div><p className="font-semibold leading-tight">{z.title}</p><p className="text-[12.5px] text-ink3">{z.sub} · {z.cls}</p></div></div> },
            { key: 'q', label: 'Questions', align: 'right', render: (z) => z.qs },
            { key: 'l', label: 'Time limit', nowrap: true, render: (z) => z.time },
            { key: 'a', label: 'Attempts', align: 'right', render: (z) => z.tries },
            { key: 'k', label: 'Taken', render: (z) => <span className="tnum">{z.taken} of {STRENGTH[z.cls]}</span> },
            { key: 'v', label: 'Average', align: 'right', render: (z) => (z.avg != null ? `${z.avg} / ${z.qs}` : '—') },
            { key: 's', label: 'Status', render: (z) => <><Pill tone={QZ_TONE[z.status]}>{z.status}</Pill><span className="block text-[12px] text-ink3 mt-0.5 whitespace-nowrap">{z.closes}</span></> },
          ]}
          mobile={(z) => ({ icon: SUB_ICON[z.sub], iconTone: SUB_TONE[z.sub], title: z.title, sub: `${z.cls} · ${z.qs} questions · ${z.taken} taken`, pills: [<Pill key="s" tone={QZ_TONE[z.status]} className="!h-[22px] !text-[11.5px]">{z.status}</Pill>] })} />
      </Card>
      <QuizResults z={open} canEdit={sc.canEdit} onClose={() => setOpen(null)} onClose2={(z) => { setList((x) => x.map((y) => (y.id === z.id ? { ...y, status: 'Closed', closes: 'Closed today' } : y))); toast({ title: `${z.title} closed`, body: 'Students who did not take it can no longer start it.' }); }} />
      <CreateQuizSheet open={add} onClose={() => setAdd(false)} sc={sc} onSave={(z) => { setList((x) => [z, ...x]); toast({ title: z.status === 'Open' ? `${z.title} is open for ${z.cls}` : `${z.title} saved as a draft`, body: z.status === 'Open' ? `${STRENGTH[z.cls]} students notified. Closes ${z.closes}.` : 'Open it when you are ready.' }); }} />
    </div>
  );
}

function QuizResults({ z, canEdit, onClose, onClose2 }) {
  if (!z) return null;
  const r = roster(z.cls).slice(0, z.taken).map((s) => ({ s, sc: Math.max(2, Math.min(z.qs, Math.round(z.qs * (0.45 + (hash(s.name + z.id) % 55) / 100)))) }));
  const qPct = Array.from({ length: Math.min(z.qs, 10) }, (_, i) => ({ k: `Q${i + 1}`, v: z.id === 'QZ-31' && i === 6 ? 41 : 52 + (hash(z.id + i) % 46) }));
  return (
    <Sheet open={!!z} onClose={onClose} wide title={z.title} sub={`${z.sub} · ${z.cls} · ${z.qs} questions · ${z.time} · ${z.status === 'Open' ? `closes ${z.closes}` : z.closes}`}
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button>{z.status === 'Open' && canEdit && <Button variant="secondary" icon={I.Lock} onClick={() => { onClose2(z); onClose(); }}>Close quiz now</Button>}</>}>
      {z.taken === 0 ? <Empty icon={I.ListChecks} title="Nobody has taken it yet" body="This quiz is a draft. Open it to let students start." /> : (
        <div className="grid @md:grid-cols-2 gap-5">
          <div>
            <p className="text-[13px] font-semibold text-ink2 mb-2">Correct answers per question</p>
            <HBars rows={qPct} lowBelow={50} labelWidth={36} />
            <p className="text-[12.5px] text-ink3 mt-2">Questions below 50% show in amber. Worth going over in class.</p>
          </div>
          <div>
            <p className="text-[13px] font-semibold text-ink2 mb-2">{z.taken} students · average {z.avg} of {z.qs}</p>
            <ul className="max-h-[320px] overflow-y-auto scroll-thin divide-y divide-line/70">
              {r.map((x) => <li key={x.s.id} className="flex items-center gap-3 py-2"><Avatar name={x.s.name} size={30} /><span className="flex-1 text-[14px] truncate">{x.s.name}</span><b className="font-semibold tnum text-[14px]">{x.sc} / {z.qs}</b></li>)}
            </ul>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function CreateQuizSheet({ open, onClose, sc, onSave }) {
  const [title, setTitle] = useState('');
  const [cls, setCls] = useState(sc.classes.includes('7 B') ? '7 B' : sc.classes[0]);
  const [sub, setSub] = useState(sc.subs.includes('Mathematics') ? 'Mathematics' : sc.subs[0]);
  const [qs, setQs] = useState([['What is x if x + 7 = 15?', ['7', '8', '22', '15'], 1], ['True or false: 3x = 12 means x = 4.', ['True', 'False'], 0]]);
  const [time, setTime] = useState('10 min');
  const [tries, setTries] = useState('1');
  const [show, setShow] = useState(true);
  const [tried, setTried] = useState(false);
  const err = !title.trim() ? 'Give the quiz a title.' : '';
  const save = (status) => { setTried(true); if (err) return; onSave({ id: 'QZ-' + (32 + qs.length), date: '2026-10-09', title: title.trim(), sub, cls, by: sc.name, qs: qs.length, time, tries: Number(tries), taken: 0, avg: null, status, closes: status === 'Open' ? 'Fri 16 Oct, 8:00 PM' : 'Not set' }); setTitle(''); setTried(false); onClose(); };
  return (
    <Sheet open={open} onClose={onClose} wide title="Create quiz" sub="Multiple choice and true or false questions mark themselves"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="secondary" onClick={() => save('Draft')}>Save draft</Button><Button variant="primary" icon={I.Send} onClick={() => save('Open')}>Open for {cls}</Button></>}>
      <div className="flex flex-col gap-4">
        <Field label="Title" required id="cq-title" error={tried && err}><Input id="cq-title" value={title} onChange={(e) => setTitle(e.target.value)} error={tried && err} placeholder="Simple equations: practice 2" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Class and section" required id="cq-cls"><Select id="cq-cls" value={cls} onChange={setCls} options={sc.classes} /></Field>
          <Field label="Subject" required id="cq-sub"><Select id="cq-sub" value={sub} onChange={setSub} options={sc.subs} /></Field>
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between"><p className="text-[13px] font-semibold text-ink2">Questions · {qs.length}</p>
            <div className="flex gap-2"><Button size="sm" variant="ghost" icon={I.Library} onClick={() => setQs((x) => [...x, ['Solve: 2x − 5 = 9', ['x = 2', 'x = 7', 'x = 9', 'x = 14'], 1]])}>From question bank</Button><Button size="sm" variant="soft" icon={I.Plus} onClick={() => setQs((x) => [...x, ['New question', ['Option a', 'Option b', 'Option c', 'Option d'], 0]])}>Add</Button></div></div>
          <ol className="flex flex-col gap-2">
            {qs.map(([text, opts, right], i) => (
              <li key={i} className="rounded-xl border border-line p-3">
                <p className="text-[14px] font-semibold">{i + 1}. {text}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">{opts.map((o, j) => <span key={j} className={cx('h-7 px-2.5 rounded-lg text-[12.5px] inline-flex items-center gap-1', j === right ? 'bg-ok/10 text-ok font-semibold' : 'bg-sunken text-ink2')}>{j === right && <I.Check size={12} />}{o}</span>)}</div>
              </li>
            ))}
          </ol>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Opens and closes" hint="Default: now to 7 days"><Input value="Now → Fri 16 Oct, 8:00 PM" readOnly className="bg-sunken/50 !text-[14px]" /></Field>
          <Field label="Time limit" id="cq-time"><Select id="cq-time" value={time} onChange={setTime} options={['None', '10 min', '15 min', '20 min', '30 min']} /></Field>
          <Field label="Attempts" id="cq-tries"><Select id="cq-tries" value={tries} onChange={setTries} options={['1', '2', '3']} /></Field>
          <div className="rounded-xl border border-line px-3.5 py-3 flex items-center gap-3 self-end"><Switch id="cq-show" on={show} onChange={setShow} label="Show answers after" /><label htmlFor="cq-show" className="text-[13.5px] font-semibold">Show answers after</label></div>
        </div>
      </div>
    </Sheet>
  );
}

function StudentQuizzes() {
  const [taking, setTaking] = useState(null);
  const [done, setDone] = useState({ 'QZ-20': { score: 9, of: 10, title: 'Integers practice', sub: 'Mathematics', when: '2 Oct' }, 'QZ-18': { score: 8, of: 10, title: 'Nutrition in plants', sub: 'Science', when: '24 Sep' } });
  const [per, setPer] = useState(PERIODS.last30);
  const open = QUIZZES.filter((z) => z.cls === '7 B' && z.status === 'Open' && !done[z.id]);
  const doneRows = Object.entries(done).filter(([, d]) => inPer(d.when === 'Today' ? '2026-10-09' : isoOf(d.when), per));
  if (taking) return <TakeQuiz z={taking} onExit={() => setTaking(null)} onDone={(res) => { setDone((x) => ({ ...x, [taking.id]: res })); }} />;
  return (
    <div>
      <ModuleHead sub="Class 7 B · quizzes from your teachers. They mark themselves." />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Card>
          <CardHead title="Open now" sub={open.length ? 'Finish before they close' : 'Nothing open right now'} icon={I.ListChecks} />
          {open.length ? (
            <ul className="px-2 pb-2">
              {open.map((z) => (
                <li key={z.id} className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-sunken/60">
                  <SubIcon sub={z.sub} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[14.5px]">{z.title}</p>
                    <p className="text-[12.5px] text-ink3">{z.sub} · {z.qs} questions · {z.time} · {z.tries} {z.tries === 1 ? 'attempt' : 'attempts'}</p>
                    <p className={cx('text-[12.5px] font-semibold', z.closes.startsWith('today') ? 'text-warn' : 'text-ink3')}>Closes {z.closes}</p>
                  </div>
                  <Button size="sm" variant="primary" icon={I.CirclePlay} onClick={() => setTaking(z)}>Start</Button>
                </li>
              ))}
            </ul>
          ) : <Empty icon={I.PartyPopper} title="All quizzes done" body="New quizzes show here when a teacher opens one." />}
        </Card>
        <Card>
          <CardHead title="Done" sub={`Your scores · ${per.label} · ${fmtRange(per)}`} icon={I.Medal} />
          <div className="px-3 pb-2"><DatePeriod id="my-qz-per" value={per} onChange={setPer} className="w-full @md:w-auto" /></div>
          {!doneRows.length && <Empty icon={I.ListChecks} title="No quizzes done in these dates" body="Pick other dates to see earlier scores." />}
          <ul className="px-2 pb-2">
            {doneRows.map(([id, d]) => (
              <li key={id} className="flex items-center gap-3 px-3 py-3 rounded-xl">
                <SubIcon sub={d.sub || 'Science'} />
                <div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px]">{d.title}</p><p className="text-[12.5px] text-ink3">{d.sub} · {d.when}</p></div>
                <span className="font-display font-semibold text-[18px] tnum">{d.score}<span className="text-ink3 text-[13px] font-sans"> / {d.of}</span></span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function TakeQuiz({ z, onExit, onDone }) {
  const [i, setI] = useState(0);
  const [ans, setAns] = useState({});
  const [sure, setSure] = useState(false);
  const [result, setResult] = useState(null);
  const QS = questionsOf(z);
  const total = QS.length;
  const answered = Object.keys(ans).length;
  const submit = () => {
    const score = QS.filter((q, k) => ans[k] === q[2]).length;
    setResult(score);
    onDone({ score, of: total, title: z.title, sub: z.sub, when: 'Today' });
  };
  if (result != null) {
    return (
      <div className="max-w-2xl mx-auto">
        <BackLink label="Quizzes" onClick={onExit} />
        <Card className="p-6 flex flex-col items-center text-center">
          <Ring value={(result / total) * 100} size={110} stroke={10} tone={result / total >= 0.7 ? 'ok' : 'warn'}><span className="font-display text-[28px] font-semibold tnum">{result}<span className="text-[15px] text-ink3">/{total}</span></span></Ring>
          <h2 className="font-display text-[24px] font-semibold mt-4">{result / total >= 0.8 ? 'Very well done!' : result / total >= 0.5 ? 'Good try!' : 'Keep practising'}</h2>
          <p className="text-[14px] text-ink3 mt-1">{z.title} · {z.sub} · {z.by} can see your score</p>
        </Card>
        <Card className="mt-5">
          <CardHead title="Your answers" sub="Correct answers are shown because your teacher allowed it" icon={I.ListChecks} />
          <ol className="px-5 pb-5 flex flex-col gap-3">
            {QS.map(([q, opts, right], k) => {
              const ok = ans[k] === right;
              return (
                <li key={k} className="flex gap-3">
                  <span className={cx('w-6 h-6 rounded-full grid place-items-center shrink-0 mt-0.5', ok ? 'bg-ok/15 text-ok' : 'bg-bad/10 text-bad')}>{ok ? <I.Check size={14} strokeWidth={3} /> : <I.X size={14} strokeWidth={3} />}</span>
                  <div className="text-[14px]"><p className="font-semibold">{k + 1}. {q}</p><p className="text-ink2">{ans[k] != null ? `You: ${opts[ans[k]]}` : 'Not answered'}{!ok && <span className="text-ok"> · Answer: {opts[right]}</span>}</p></div>
                </li>
              );
            })}
          </ol>
        </Card>
      </div>
    );
  }
  const [q, opts] = QS[i];
  return (
    <div className="max-w-2xl mx-auto">
      <BackLink label="Quizzes" sub={z.title} onClick={onExit} />
      <Card className="p-5 @md:p-6">
        <div className="flex items-center justify-between gap-3 text-[13px]">
          <span className="font-semibold text-ink2">Question {i + 1} of {total}</span>
          <span className="inline-flex items-center gap-1.5 text-ink3 tnum"><I.Timer size={15} />{z.id === 'QZ-31' ? '12:40' : '8:15'} left</span>
        </div>
        <Progress value={((i + 1) / total) * 100} className="mt-2" />
        <p className="font-display text-[20px] @md:text-[22px] font-semibold leading-snug mt-5">{q}</p>
        <div className="flex flex-col gap-2 mt-4" role="radiogroup" aria-label={q}>
          {opts.map((o, j) => (
            <button key={o} role="radio" aria-checked={ans[i] === j} onClick={() => setAns((x) => ({ ...x, [i]: j }))}
              className={cx('flex items-center gap-3 p-3.5 rounded-2xl border text-left text-[15px] transition', ans[i] === j ? 'border-brand ring-1 ring-brand bg-brand/5 font-semibold' : 'border-line hover:border-ink3/40')}>
              <span className={cx('w-6 h-6 rounded-full border-2 grid place-items-center shrink-0 text-[11px] font-bold', ans[i] === j ? 'border-brand text-brand' : 'border-line text-ink3')}>{'abcd'[j]}</span>{o}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mt-5">
          <Button variant="secondary" icon={I.ChevronLeft} disabled={i === 0} onClick={() => setI(i - 1)} className="flex-1">Previous</Button>
          {i < total - 1 ? <Button variant="primary" iconRight={I.ChevronRight} onClick={() => setI(i + 1)} className="flex-1">Next</Button>
            : <Button variant="primary" icon={I.Send} onClick={() => setSure(true)} className="flex-1">Submit</Button>}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-4 justify-center">
          {QS.map((_, k) => <button key={k} onClick={() => setI(k)} aria-label={`Go to question ${k + 1}`} className={cx('w-8 h-8 rounded-lg text-[12.5px] font-semibold tnum', k === i ? 'bg-ink text-bg' : ans[k] != null ? 'bg-brand/12 text-brand' : 'bg-sunken text-ink3')}>{k + 1}</button>)}
        </div>
      </Card>
      <ConfirmSheet open={sure} onClose={() => setSure(false)} title="Submit your answers?" confirmLabel={`Submit ${answered} answers`} onConfirm={submit}>
        <p className="text-[14px] text-ink2">You answered {answered} of {total} questions.{answered < total ? ` ${total - answered} are blank and count as wrong.` : ''} {z.tries === 1 ? 'You have 1 attempt, so you cannot change them after this.' : `You have ${z.tries} attempts for this quiz.`}</p>
      </ConfirmSheet>
    </div>
  );
}

/* =====================================================================
   5. Discussions
   ===================================================================== */
const BOARDS = [
  { id: 'B1', title: 'Mathematics · 7 B', cls: '7 B', sub: 'Mathematics', owner: 'Imran Shaikh', who: 'Staff and students', topics: 12, posts: 84, active: true },
  { id: 'B2', title: 'Science · 7 B', cls: '7 B', sub: 'Science', owner: 'Ravi Teja', who: 'Staff and students', topics: 9, posts: 51, active: true },
  { id: 'B3', title: 'Half Yearly doubts · Class 7', cls: '7 B', sub: null, owner: 'Meena Pillai', who: 'Staff and students', topics: 18, posts: 132, active: true },
  { id: 'B4', title: 'Mathematics · 7 A', cls: '7 A', sub: 'Mathematics', owner: 'Imran Shaikh', who: 'Staff and students', topics: 7, posts: 39, active: true },
  { id: 'B5', title: 'Science · 8 B', cls: '8 B', sub: 'Science', owner: 'Ravi Teja', who: 'Staff and students', topics: 5, posts: 22, active: true },
  { id: 'B6', title: 'Mathematics teachers', cls: null, sub: 'Mathematics', owner: 'Meena Pillai', who: 'Staff only', topics: 6, posts: 27, active: true },
];
const TOPICS = {
  B1: [
    { id: 'T1', title: 'Half Yearly syllabus for Maths', by: 'Imran Shaikh', teacher: true, when: '2 Oct', pinned: true, locked: true, replies: [] , body: 'Chapters 1 to 7. Practice paper is in Homework. Paper on Wed 14 Oct, 9:00 AM.' },
    { id: 'T2', title: 'Q7 of Exercise 4.2: how do I start?', by: 'Navya Iyer', when: 'Today, 8:10 AM', body: 'Sir, in Q7 I don’t know what to take as x.', replies: [{ by: 'Kabir Singh', when: '8:20 AM', text: 'Take the smaller number as x, then the bigger one is x + 5.' }, { by: 'Imran Shaikh', teacher: true, when: '9:05 AM', text: 'Good hint, Kabir. Navya, write both numbers using x first, then add them.' }] },
    { id: 'T3', title: 'Is Data Handling in the Half Yearly?', by: 'Sahithi Rao', when: 'Yesterday', body: 'Is chapter 3 included?', replies: [{ by: 'Imran Shaikh', teacher: true, when: 'Yesterday', text: 'Yes, chapters 1 to 7 are all included.' }] },
    { id: 'T4', title: 'Can someone share the unit test answers?', by: 'Sai Das', when: '6 Oct', hidden: 'Answers to a test', body: '', replies: [] },
  ],
  B2: [
    { id: 'T1', title: 'Why is the image in a plane mirror reversed?', by: 'Aarav Sharma', when: '7 Oct', body: 'Left and right swap in the mirror, but up and down don’t. Why?', replies: [{ by: 'Ravi Teja', teacher: true, when: '7 Oct', text: 'Great question, Aarav. We will try it with a torch in the lab on Monday.' }] },
    { id: 'T2', title: 'Light chapter: which diagrams to learn?', by: 'Meera Das', when: '6 Oct', body: '', replies: [{ by: 'Ravi Teja', teacher: true, when: '6 Oct', text: 'All three ray diagrams from the homework.' }] },
  ],
  B3: [
    { id: 'T1', title: 'Reporting time and what to bring', by: 'Meena Pillai', teacher: true, when: '5 Oct', pinned: true, body: 'Report by 8:15 AM with your admit card, two pencils, a pen and a geometry box.', replies: [] },
    { id: 'T2', title: 'Social Studies map questions: how many?', by: 'Pranav Shetty', when: 'Yesterday', body: '', replies: [{ by: 'Venkat Rao', teacher: true, when: 'Yesterday', text: 'One map question for 5 marks.' }] },
  ],
};
const topicsFor = (b) => TOPICS[b.id] || [{ id: 'T1', title: `Welcome to ${b.title}`, by: b.owner, teacher: true, when: '1 Jun', pinned: true, body: 'Ask your questions here. Be kind and stay on the subject.', replies: [] }];

function DiscussionsPage({ access }) {
  const sc = useScope(access);
  const toast = useToast();
  const boards = BOARDS.filter((b) => (sc.student ? b.cls === '7 B' : sc.own ? b.owner === sc.name || b.id === 'B3' : true));
  const [bid, setBid] = useState(boards[0].id);
  const board = boards.find((b) => b.id === bid) || boards[0];
  const [topics, setTopics] = useState(() => ({}));
  const list = topics[board.id] || topicsFor(board);
  const setList = (fn) => setTopics((x) => ({ ...x, [board.id]: fn(x[board.id] || topicsFor(board)) }));
  const [tid, setTid] = useState(null);
  const [newTopic, setNewTopic] = useState(false);
  const [newBoard, setNewBoard] = useState(false);
  const [hide, setHide] = useState(null);
  const [reply, setReply] = useState('');
  const [nt, setNt] = useState({ title: '', body: '' });
  const topic = list.find((t) => t.id === tid);
  const me = sc.student ? FEATURED.name : sc.name;
  const canMod = !sc.student && sc.canEdit && (sc.full || board.owner === sc.name);
  const update = (id, fn) => setList((x) => x.map((t) => (t.id === id ? fn(t) : t)));
  const sorted = [...list].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  return (
    <div>
      <ModuleHead sub={sc.student ? 'Class 7 B boards · ask and answer questions with your class' : sc.own ? 'Boards for your classes · pin, lock or hide posts' : 'Class discussion boards for questions and answers'}
        actions={!sc.canEdit ? null : sc.student ? <Button variant="primary" icon={I.MessageSquarePlus} onClick={() => setNewTopic(true)}>Ask a question</Button> : <><Button variant="secondary" icon={I.Plus} onClick={() => setNewBoard(true)}>New board</Button><Button variant="primary" icon={I.MessageSquarePlus} onClick={() => setNewTopic(true)}>New topic</Button></>} />
      <div className="grid @xl:grid-cols-[300px_minmax(0,1fr)] gap-5 @lg:gap-6 items-start">
        <Card>
          <CardHead title="Boards" icon={I.MessagesSquare} />
          <ul className="px-2 pb-2">
            {boards.map((b) => (
              <li key={b.id}>
                <button onClick={() => { setBid(b.id); setTid(null); }} className={cx('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition', bid === b.id ? 'bg-brand/8' : 'hover:bg-sunken/70')}>
                  <span className={cx('w-9 h-9 rounded-xl grid place-items-center shrink-0', bid === b.id ? 'bg-brand text-brandink' : 'bg-sunken text-ink2')}><I.MessagesSquare size={17} /></span>
                  <div className="min-w-0 flex-1"><p className={cx('font-semibold text-[14px] truncate', bid === b.id && 'text-brand')}>{b.title}</p><p className="text-[12px] text-ink3">{b.topics} topics · {b.posts} posts</p></div>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          {!topic ? (
            <>
              <CardHead title={board.title} sub={`${board.who} · moderated by ${board.owner}`} icon={I.MessagesSquare} />
              <ul className="px-2 pb-2">
                {sorted.map((t) => (
                  <li key={t.id}>
                    <div className={cx('flex items-center gap-3 px-3 py-3 rounded-xl', t.hidden ? 'opacity-60' : 'hover:bg-sunken/70')}>
                      <Avatar name={t.by} size={36} />
                      <button disabled={!!t.hidden} onClick={() => setTid(t.id)} className="min-w-0 flex-1 text-left">
                        <p className="font-semibold text-[14.5px] leading-snug flex items-center gap-1.5 flex-wrap">{t.pinned && <I.Pin size={14} className="text-brand" />}{t.locked && <I.Lock size={13} className="text-ink3" />}{t.hidden ? <span className="italic font-normal text-ink3">Hidden by the teacher · {t.hidden}</span> : t.title}</p>
                        <p className="text-[12.5px] text-ink3">{t.by}{t.teacher ? ' · teacher' : ''} · {t.when} · {t.replies.length} {t.replies.length === 1 ? 'reply' : 'replies'}</p>
                      </button>
                      {canMod && (
                        <MoreMenu size="sm" items={t.hidden ? [['Eye', 'Unhide', () => { update(t.id, (x) => ({ ...x, hidden: null })); toast({ title: 'Post is visible again' }); }]] : [
                          [t.pinned ? 'PinOff' : 'Pin', t.pinned ? 'Unpin' : 'Pin to top', () => update(t.id, (x) => ({ ...x, pinned: !x.pinned }))],
                          [t.locked ? 'LockOpen' : 'Lock', t.locked ? 'Unlock replies' : 'Lock replies', () => { update(t.id, (x) => ({ ...x, locked: !x.locked })); toast({ title: t.locked ? 'Replies are open again' : 'Replies are locked', body: 'Everyone can still read it.' }); }],
                          ['EyeOff', 'Hide with a reason', () => setHide(t)],
                        ]} />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="p-4 @md:p-5">
              <BackLink label={board.title} onClick={() => setTid(null)} />
              <div className="flex items-start gap-3">
                <Avatar name={topic.by} size={40} />
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold text-[17px] leading-snug">{topic.title}</h2>
                  <p className="text-[12.5px] text-ink3">{topic.by}{topic.teacher && <Pill tone="brand" className="!h-5 !text-[11px] ml-1.5">Teacher</Pill>} · {topic.when}</p>
                  {topic.body && <p className="text-[14.5px] text-ink2 mt-2 leading-relaxed">{topic.body}</p>}
                </div>
              </div>
              <ul className="mt-4 flex flex-col gap-3 border-l-2 border-line pl-4 ml-5">
                {topic.replies.map((r, k) => (
                  <li key={k} className="flex items-start gap-2.5">
                    <Avatar name={r.by} size={30} />
                    <div className="min-w-0 flex-1 rounded-2xl bg-sunken/60 px-3.5 py-2.5">
                      <p className="text-[13px] font-semibold">{r.by}{r.teacher && <Pill tone="brand" className="!h-5 !text-[11px] ml-1.5">Teacher</Pill>} <span className="text-ink3 font-normal text-[12px]">· {r.when}</span></p>
                      <p className="text-[14px] text-ink2 mt-0.5">{r.text}</p>
                    </div>
                  </li>
                ))}
                {topic.replies.length === 0 && <li className="text-[13.5px] text-ink3">No replies yet.</li>}
              </ul>
              {topic.locked ? <Banner tone="info" icon="Lock" className="mt-4">Replies are locked on this topic.</Banner> : sc.canEdit && (
                <div className="flex gap-2 mt-4">
                  <Input value={reply} onChange={(e) => setReply(e.target.value)} placeholder={sc.student ? 'Write a reply to your class' : 'Write a reply'} aria-label="Write a reply" />
                  <Button variant="primary" icon={I.Send} disabled={!reply.trim()} onClick={() => { update(topic.id, (x) => ({ ...x, replies: [...x.replies, { by: me, teacher: !sc.student, when: 'just now', text: reply.trim() }] })); setReply(''); }}>Post</Button>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
      <FormSheet open={newTopic} onClose={() => setNewTopic(false)} title={sc.student ? 'Ask a question' : 'New topic'} sub={board.title} submitLabel="Post"
        onSubmit={() => { if (!nt.title.trim()) return false; const t = { id: 'T' + Date.now(), title: nt.title.trim(), body: nt.body.trim(), by: me, teacher: !sc.student, when: 'just now', replies: [] }; setList((x) => [t, ...x]); setTid(null); setNt({ title: '', body: '' }); toast({ title: 'Posted', body: `In ${board.title}. Your class can see it now.` }); }}>
        <Field label="Title" required id="nt-title" hint="One short line, like “Q3 of exercise 4.2”"><Input id="nt-title" value={nt.title} onChange={(e) => setNt({ ...nt, title: e.target.value })} /></Field>
        <Field label="Details" id="nt-body"><Textarea id="nt-body" value={nt.body} onChange={(v) => setNt({ ...nt, body: v })} /></Field>
      </FormSheet>
      <FormSheet open={newBoard} onClose={() => setNewBoard(false)} title="New board" submitLabel="Create board" onSubmit={() => toast({ title: 'Board created: Science · 7 A', body: 'Students of 7 A can see it now.' })}>
        <Field label="Title" required id="nb-title"><Input id="nb-title" defaultValue="Science · 7 A" /></Field>
        <Field label="Class and subject" id="nb-cls"><LSelect id="nb-cls" value="7 A|Science" options={[{ value: '7 A|Science', label: '7 A · Science' }, { value: '7 B|Science', label: '7 B · Science' }]} /></Field>
        <Field label="Description" id="nb-desc"><LTextarea id="nb-desc" value="Questions and answers about Science lessons." rows={2} /></Field>
        <Field label="Who can use it" required><LSegmented value="all" className="w-full" options={[{ value: 'all', label: 'Staff and students' }, { value: 'staff', label: 'Staff only' }]} /></Field>
        <div className="rounded-xl border border-line px-3.5 py-3 flex items-center gap-3"><LSwitch id="nb-active" on label="Active" /><label htmlFor="nb-active" className="text-[13.5px] font-semibold">Active</label></div>
      </FormSheet>
      <HideSheet t={hide} onClose={() => setHide(null)} onHide={(t, why) => { update(t.id, (x) => ({ ...x, hidden: why })); toast({ title: 'Post hidden', body: 'It is kept, not deleted. You can unhide it.', undo: () => update(t.id, (x) => ({ ...x, hidden: null })) }); }} />
    </div>
  );
}

function HideSheet({ t, onClose, onHide }) {
  const [why, setWhy] = useState('Not about the subject');
  if (!t) return null;
  return (
    <ConfirmSheet open={!!t} onClose={onClose} title="Hide this post?" confirmLabel="Hide post" onConfirm={() => onHide(t, why)}>
      <div className="flex flex-col gap-3">
        <p className="text-[14px] text-ink2">“{t.title}” by {t.by}. The class sees “Hidden by the teacher” with your reason. Nothing is deleted.</p>
        <Field label="Reason" required id="hd-why"><Select id="hd-why" value={why} onChange={setWhy} options={['Not about the subject', 'Unkind words', 'Personal details shared', 'Answers to a test']} /></Field>
      </div>
    </ConfirmSheet>
  );
}

/* =====================================================================
   6. Online Classes
   ===================================================================== */
const SESSIONS = [
  { id: 'OC-61', title: 'Maths doubt-clearing before the Half Yearly', sub: 'Mathematics', cls: '7 A, 7 B', by: 'Imran Shaikh', when: 'Sat 10 Oct, 5:00 PM', len: '40 min', status: 'Scheduled', link: 'meet.google.com/kxw-rbqe-tna', mine: true },
  { id: 'OC-62', title: 'Science revision: Light', sub: 'Science', cls: '7 B', by: 'Ravi Teja', when: 'Sun 11 Oct, 11:00 AM', len: '40 min', status: 'Scheduled', link: 'meet.google.com/pha-dmzk-ufy', mine: true },
  { id: 'OC-63', title: 'Social Studies revision (Dussehra break)', sub: 'Social Studies', cls: 'Class 8', by: 'Venkat Rao', when: 'Wed 21 Oct, 10:00 AM', len: '45 min', status: 'Scheduled', repeat: 'Weekly till 25 Oct', link: 'meet.google.com/tuv-hqpn-zsd' },
  { id: 'OC-58', title: 'Simple equations', sub: 'Mathematics', cls: '7 B', by: 'Imran Shaikh', when: 'Sun 4 Oct, 11:00 AM', len: '40 min', status: 'Done', joined: 31, of: 38, rec: 'Recording · 38 min', mine: true },
  { id: 'OC-57', title: 'Letter writing', sub: 'English', cls: '9 A', by: 'Sridevi Kulkarni', when: 'Sat 3 Oct, 5:00 PM', len: '40 min', status: 'Done', joined: 29, of: 36, rec: 'Recording · 41 min' },
  { id: 'OC-56', title: 'Hindi grammar: sandhi', sub: 'Hindi', cls: '9 C', by: 'Deepak Verma', when: 'Sat 3 Oct, 6:00 PM', len: '40 min', status: 'Cancelled', note: 'Teacher unwell. Moved to Sat 10 Oct.' },
  { id: 'OC-54', title: 'Acids, bases and salts', sub: 'Science', cls: '7 A', by: 'Ravi Teja', when: 'Sun 27 Sep, 11:00 AM', len: '40 min', status: 'Done', joined: 34, of: 40, rec: 'Recording · 36 min' },
];
const OC_TONE = { Scheduled: 'info', Live: 'bad', Done: 'ok', Cancelled: 'neutral' };

function OnlinePage({ access }) {
  const sc = useScope(access);
  return sc.student ? <StudentOnline /> : <StaffOnline sc={sc} />;
}

function StaffOnline({ sc }) {
  const toast = useToast();
  const [list, setList] = useState(() => SESSIONS.filter((x) => !sc.own || x.by === sc.name));
  const [f, setF] = useState('upcoming');
  const [per, setPer] = useState(PERIODS.acyear);
  const [add, setAdd] = useState(false);
  const [open, setOpen] = useState(null);
  const rows = list.filter((x) => inPer(isoOf(x.when), per) && (f === 'upcoming' ? x.status === 'Scheduled' || x.status === 'Live' : x.status === 'Done' || x.status === 'Cancelled'));
  return (
    <div>
      <ModuleHead sub={sc.own ? 'Your online classes · Google Meet is connected' : 'Online class schedule, attendance and recordings · Google Meet is connected'} actions={sc.canEdit && <Button variant="primary" icon={I.CalendarPlus} onClick={() => setAdd(true)}>Schedule a class</Button>} />
      <Card className="overflow-hidden">
        <div className="p-3 border-b border-line flex flex-col @md:flex-row @md:items-center gap-2.5"><Segmented value={f} onChange={setF} options={[{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }]} /><DatePeriod id="oc-per" future value={per} onChange={setPer} className="w-full @md:w-auto" /><span className="flex-1" /><ExportButton what="online class attendance" /></div>
        <DataList rows={rows} onRow={(x) => setOpen(x)} minWidth={760} footer={`Showing: ${per.label} · ${fmtRange(per)} · ${rows.length} online classes`}
          empty={<Empty icon={I.Video} title="No online classes here" body="Nothing in these dates. Pick other dates, or schedule one for doubt-clearing or the holidays." action={sc.canEdit && <Button variant="primary" icon={I.CalendarPlus} onClick={() => setAdd(true)}>Schedule a class</Button>} />}
          columns={[
            { key: 't', label: 'Class', render: (x) => <div className="flex items-center gap-3"><SubIcon sub={x.sub} size={34} /><div><p className="font-semibold leading-tight">{x.title}</p><p className="text-[12.5px] text-ink3">{x.sub} · {x.cls}{!sc.own && ` · ${x.by}`}</p></div></div> },
            { key: 'w', label: 'Date and time', nowrap: true, render: (x) => <span className="tnum">{x.when}<span className="block text-[12.5px] text-ink3">{x.len}{x.repeat ? ` · ${x.repeat}` : ''}</span></span> },
            { key: 'a', label: 'Joined', render: (x) => (x.joined ? <span className="tnum">{x.joined} of {x.of}</span> : <span className="text-ink3">—</span>) },
            { key: 's', label: 'Status', render: (x) => <Pill tone={OC_TONE[x.status]}>{x.status}</Pill> },
          ]}
          mobile={(x) => ({ icon: 'Video', iconTone: OC_TONE[x.status], title: x.title, sub: `${x.cls} · ${x.when}`, pills: [<Pill key="s" tone={OC_TONE[x.status]} className="!h-[22px] !text-[11.5px]">{x.status}</Pill>] })} />
      </Card>
      <SessionSheet x={open} canEdit={sc.canEdit} onClose={() => setOpen(null)} onCancel={(x) => { setList((l) => l.map((y) => (y.id === x.id ? { ...y, status: 'Cancelled', note: 'Cancelled by the teacher' } : y))); toast({ title: `Cancelled: ${x.title}`, body: 'Students and parents are told.', undo: () => setList((l) => l.map((y) => (y.id === x.id ? x : y))) }); }} />
      <FormSheet open={add} onClose={() => setAdd(false)} title="Schedule an online class" sub="The meeting link is made in Google Meet" submitLabel="Schedule"
        onSubmit={() => { setList((l) => [{ id: 'OC-64', title: 'Half Yearly revision: geometry', sub: sc.subs[0], cls: sc.classes.includes('7 B') ? '7 B' : sc.classes[0], by: sc.name, when: 'Sun 11 Oct, 5:00 PM', len: '40 min', status: 'Scheduled', link: 'meet.google.com/qzm-wrnv-pob' }, ...l]); setF('upcoming'); toast({ title: 'Online class scheduled for Sun 11 Oct, 5:00 PM', body: 'Students get a reminder 15 minutes before.' }); }}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Class and section" required id="oc-cls"><LSelect id="oc-cls" value={sc.classes.includes('7 B') ? '7 B' : sc.classes[0]} options={sc.classes} /></Field>
          <Field label="Subject" required id="oc-sub"><LSelect id="oc-sub" value={sc.subs[0]} options={sc.subs} /></Field>
        </div>
        <Field label="Title" id="oc-title"><Input id="oc-title" defaultValue="Half Yearly revision: geometry" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date and time" required id="oc-when" hint="DD-MM-YYYY, time"><Input id="oc-when" defaultValue="11-10-2026, 5:00 PM" className="tnum" /></Field>
          <Field label="Length" required id="oc-len"><LSelect id="oc-len" value="40 min" options={['30 min', '40 min', '45 min', '60 min']} /></Field>
        </div>
        <Field label="Meeting link" required hint="Made automatically because Google Meet is connected"><Input value="Made when you schedule" readOnly className="bg-sunken/50" /></Field>
        <div className="rounded-xl border border-line px-3.5 py-3 flex items-center gap-3"><LSwitch id="oc-rep" label="Repeat weekly" /><label htmlFor="oc-rep" className="text-[13.5px]"><b className="font-semibold block">Repeat every week</b><span className="text-ink3 text-[12.5px]">Same day and time until you stop it</span></label></div>
      </FormSheet>
    </div>
  );
}

function SessionSheet({ x, canEdit, onClose, onCancel }) {
  const toast = useToast();
  const [rec, setRec] = useState('');
  if (!x) return null;
  const cls = x.cls.includes(',') || x.cls.startsWith('Class') ? '7 B' : x.cls;
  const people = roster(cls).slice(0, x.of || 0);
  return (
    <Sheet open={!!x} onClose={onClose} wide title={x.title} sub={`${x.sub} · ${x.cls} · ${x.by} · ${x.when} · ${x.len}`}
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button>{x.status === 'Scheduled' && canEdit && <><Button variant="dangerSoft" onClick={() => { onCancel(x); onClose(); }}>Cancel class</Button><Button variant="primary" icon={I.Video} onClick={() => toast({ title: 'Opening Google Meet', body: x.link, tone: 'info' })}>Start</Button></>}</>}>
      {x.status === 'Scheduled' && (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-line p-3.5 flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-info/10 text-info grid place-items-center"><I.Video size={19} /></span>
            <div className="min-w-0 flex-1"><p className="font-semibold text-[14px]">Meeting link</p><p className="text-[13px] text-ink3 font-mono truncate">{x.link}</p></div>
            <Button size="sm" variant="secondary" icon={I.Copy} onClick={() => toast({ title: 'Link copied' })}>Copy</Button>
          </div>
          <DL rows={[['Reminder', '15 minutes before, to students and parents'], ['Attendance', 'Taken from Google Meet'], ['Materials', 'Light: notes.pdf'], ['Repeat', x.repeat || 'No']]} />
        </div>
      )}
      {x.status === 'Cancelled' && <Banner tone="warn" title="Cancelled.">{x.note}</Banner>}
      {x.status === 'Done' && (
        <div className="grid @md:grid-cols-2 gap-5">
          <div>
            <p className="text-[13px] font-semibold text-ink2 mb-2">Who joined · {x.joined} of {x.of}</p>
            <ul className="max-h-[300px] overflow-y-auto scroll-thin divide-y divide-line/70">
              {people.map((s, k) => <li key={s.id} className="flex items-center gap-3 py-2"><Avatar name={s.name} size={28} /><span className="flex-1 text-[14px] truncate">{s.name}</span>{(hash(s.name + x.id) % x.of) < x.joined ? <span className="text-[12px] text-ink3 tnum">{30 + (hash(s.name) % 10)} min</span> : <Pill tone="warn">Did not join</Pill>}</li>)}
            </ul>
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-[13px] font-semibold text-ink2">Recording and materials</p>
            <ul><FileRow name={x.rec} meta="Google Drive · visible to the class" onView={() => toast({ title: 'Opening the recording', tone: 'info' })} /><FileRow name="Simple equations: notes.pdf" meta="Shared in the class" onView={() => toast({ title: 'Opening the notes', tone: 'info' })} /></ul>
            {canEdit && <Field label="Add another recording link" id="rec-link"><div className="flex gap-2"><Input id="rec-link" value={rec} onChange={(e) => setRec(e.target.value)} placeholder="Paste a link" className="!h-10" /><Button variant="secondary" disabled={!rec.trim()} className="!h-10" onClick={() => { setRec(''); toast({ title: 'Recording link added', body: 'Students can watch it in Online Classes.' }); }}>Add</Button></div></Field>}
          </div>
        </div>
      )}
    </Sheet>
  );
}

function StudentOnline() {
  const toast = useToast();
  const [per, setPer] = useState(PERIODS.acyear);
  const mine = SESSIONS.filter((x) => x.cls.includes('7 B') && inPer(isoOf(x.when), per));
  const up = mine.filter((x) => x.status === 'Scheduled');
  const past = mine.filter((x) => x.status === 'Done');
  const [rem, setRem] = useState(new Set());
  return (
    <div>
      <ModuleHead sub="Class 7 B · online classes from your teachers" />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <div className="flex flex-col @md:flex-row @md:items-center gap-2.5"><DatePeriod id="my-oc-per" future value={per} onChange={setPer} className="w-full @md:w-auto" /><p className="text-[12.5px] text-ink3 tnum">{fmtRange(per)} · {up.length} coming up · {past.length} recordings</p></div>
        <Card>
          <CardHead title="Coming up" sub="Join opens 10 minutes before the start" icon={I.CalendarClock} />
          {!up.length && <Empty icon={I.Video} title="No online classes coming up in these dates" body="Pick other dates." />}
          <ul className="px-2 pb-2">
            {up.map((x) => (
              <li key={x.id} className="flex flex-col @md:flex-row @md:items-center gap-3 px-3 py-3 rounded-xl">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <SubIcon sub={x.sub} />
                  <div className="min-w-0"><p className="font-semibold text-[14.5px]">{x.title}</p><p className="text-[12.5px] text-ink3">{x.by} · {x.when} · {x.len}</p></div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant={rem.has(x.id) ? 'soft' : 'secondary'} icon={rem.has(x.id) ? I.Check : I.Bell} onClick={() => { setRem((s) => new Set([...s, x.id])); toast({ title: 'We will remind you', body: `15 minutes before, ${x.when}` }); }}>{rem.has(x.id) ? 'Reminder set' : 'Remind me'}</Button>
                  <Button size="sm" variant="primary" icon={I.Video} disabled title="Opens 10 minutes before the start">Join</Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHead title="Recordings" sub="Watch a class again" icon={I.CirclePlay} />
          {!past.length && <Empty icon={I.CirclePlay} title="No recordings in these dates" body="Pick other dates." />}
          <ul className="px-2 pb-2">
            {past.map((x) => (
              <li key={x.id} className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-sunken/60">
                <SubIcon sub={x.sub} />
                <div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px]">{x.title}</p><p className="text-[12.5px] text-ink3">{x.by} · {x.when} · you joined</p></div>
                <Button size="sm" variant="secondary" icon={I.CirclePlay} onClick={() => toast({ title: `Playing: ${x.title}`, body: x.rec, tone: 'info' })}>Watch</Button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

/* =====================================================================
   7. Learning Progress
   ===================================================================== */
function ProgressPage({ access }) {
  const sc = useScope(access);
  const toast = useToast();
  const { go } = useNav();
  const [cls, setCls] = useState(sc.classes.includes('7 B') ? '7 B' : sc.classes[0]);
  const [sub, setSub] = useState(sc.own ? sc.subs[0] : 'all');
  const [per, setPer] = useState(PERIODS.thismonth);
  const range = per.key + per.from;
  const [q, setQ] = useState('');
  const [cert, setCert] = useState(false);
  const [issued, setIssued] = useState(false);
  const pd = periodDays(per);
  const hwTotal = Math.max(1, Math.round(Math.min(pd, 30) * 1.33 + Math.max(0, pd - 30) * 0.15));
  const rows = roster(cls).map((s) => {
    const h = hash(s.name + cls + sub + range);
    const isA = s.id === FEATURED.id;
    const done = isA ? hwTotal - 1 : Math.max(Math.round(hwTotal * 0.5), hwTotal - (h % 6));
    return { s, done, score: isA ? 86 : 55 + (h % 40), quiz: isA ? 4 : 1 + (h % 4), quizAvg: isA ? 85 : 48 + ((h >> 3) % 47), lessons: isA ? 8 : 3 + ((h >> 5) % 7) };
  }).filter((r) => !q.trim() || r.s.name.toLowerCase().includes(q.trim().toLowerCase()));
  const all = roster(cls).length;
  const avgOf = (k) => Math.round(rows.reduce((a, r) => a + r[k], 0) / Math.max(1, rows.length));
  const subOpts = sc.own ? (sc.ct && cls === '7 B' ? [{ value: 'all', label: 'All subjects (class teacher)' }, ...sc.subs] : sc.subs) : [{ value: 'all', label: 'All subjects' }, ...SUBJECTS];
  return (
    <div>
      <ModuleHead sub={sc.own ? `Homework, quizzes and lessons for ${sc.classes.join(', ')}` : 'Homework done, quiz scores and lessons for each student'}
        actions={<ExportButton what="homework report" className="!inline-flex" />} />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <Card>
          <Toolbar>
            <Select id="lp-cls" value={cls} onChange={setCls} className="@md:w-40" options={sc.classes.map((c) => ({ value: c, label: `Class ${c}` }))} />
            <Select id="lp-sub" value={sub} onChange={setSub} className="@md:w-60" options={subOpts} />
            <DatePeriod id="lp-per" value={per} onChange={setPer} className="w-full @md:w-auto" />
          </Toolbar>
        </Card>
        <Stats items={[
          { label: 'Homework done', value: `${Math.round((avgOf('done') / hwTotal) * 100)}%`, sub: `${avgOf('done')} of ${hwTotal} per student`, icon: 'NotebookPen' },
          { label: 'Homework score', value: `${avgOf('score')}%`, sub: 'Average of checked work', icon: 'Calculator' },
          { label: 'Quizzes', value: `${avgOf('quizAvg')}%`, sub: `${avgOf('quiz')} taken per student`, icon: 'ListChecks' },
          { label: 'Lessons done', value: `${avgOf('lessons')} of 9`, sub: 'Study Material', icon: 'BookOpenCheck' },
        ]} />
        <Split side={380}>
          <Card className="overflow-hidden">
            <CardHead title={`Students · Class ${cls}`} sub="Tap a student to open their profile" icon={I.Users} />
            <div className="px-3 pb-3"><SearchBox id="lp-search" value={q} onChange={setQ} placeholder="Student name" /></div>
            <DataList rows={rows} rowKey={(r) => r.s.id} onRow={(r) => (CLASS_7B.some((s) => s.id === r.s.id) ? go('student', { id: r.s.id }) : toast({ title: r.s.name, body: `Homework ${r.done} of ${hwTotal} · quizzes ${r.quizAvg}%`, tone: 'info' }))} minWidth={700} footer={`Showing ${rows.length} of ${all}`}
              columns={[
                { key: 'n', label: 'Student', render: (r) => <span className="whitespace-nowrap"><span className="text-ink3 tnum inline-block w-6">{r.s.roll}</span><span className="font-semibold">{r.s.name}</span></span> },
                { key: 'h', label: 'Homework done', render: (r) => <div className="w-32"><Progress value={(r.done / hwTotal) * 100} tone={r.done / hwTotal < 0.75 ? 'warn' : 'brand'} /><span className="text-[12.5px] text-ink3 tnum">{r.done} of {hwTotal}</span></div> },
                { key: 's', label: 'Avg score', align: 'right', render: (r) => `${r.score}%` },
                { key: 'q', label: 'Quizzes', align: 'right', render: (r) => <span>{r.quiz} · {r.quizAvg}%</span> },
                { key: 'l', label: 'Lessons', align: 'right', render: (r) => `${r.lessons} of 9` },
              ]}
              mobile={(r) => ({ avatar: r.s.name, title: `${r.s.roll}. ${r.s.name}`, sub: `Homework ${r.done} of ${hwTotal} · quizzes ${r.quizAvg}%`, right: <span className={cx('font-semibold tnum text-[14px]', r.done / hwTotal < 0.75 && 'text-warn')}>{r.score}%</span> })} />
          </Card>
          <Col>
            <Card>
              <CardHead title="Where students struggle" sub={`Lowest correct answers · ${fmtRange(per)}`} icon={I.Lightbulb} />
              <div className="px-5 pb-5"><HBars rows={[{ k: 'Word problems (equations)', v: 48 }, { k: 'Plane mirror image', v: 52 }, { k: 'Median of data', v: 58 }, { k: 'Dividing fractions', v: 63 }, { k: 'Integer properties', v: 79 }]} lowBelow={60} labelWidth={150} /></div>
            </Card>
            <Card>
              <CardHead title="Course certificates" sub="For finishing a learning path" icon={I.Award} />
              <div className="px-5 pb-5 flex flex-col gap-3">
                <div className="rounded-2xl border border-line p-3.5">
                  <p className="font-semibold text-[14.5px]">Integers · Class {cls} {sc.subs[0] === 'Science' ? 'Science' : 'Maths'}</p>
                  <p className="text-[12.5px] text-ink3">{issued ? `Issued to 31 students today` : '31 students finished every lesson and quiz'}</p>
                  {sc.canEdit && !issued && <Button size="sm" variant="soft" icon={I.Award} className="mt-2" onClick={() => setCert(true)}>Issue 31 certificates</Button>}
                </div>
                <p className="text-[12.5px] text-ink3">Design from Settings, Document Designs. Students and parents can download them.</p>
              </div>
            </Card>
          </Col>
        </Split>
      </div>
      <ConfirmSheet open={cert} onClose={() => setCert(false)} title="Issue 31 course certificates?" confirmLabel="Issue 31 certificates"
        onConfirm={() => { setIssued(true); toast({ title: '31 certificates issued', body: 'They appear in each student’s Study Material. Parents get a message.' }); }}>
        <p className="text-[14px] text-ink2">For the Integers learning path, Class {cls}. Each student gets a PDF certificate and one message goes to each parent. Cost: 31 credits.</p>
      </ConfirmSheet>
    </div>
  );
}

/* =====================================================================
   8. Homework Settings
   ===================================================================== */
function SettingsPage() {
  const toast = useToast();
  const { go } = useNav();
  const { role } = useRole();
  const canMsgSettings = pagesFor('communication', role.access.communication, role.id).some((p) => p.id === 'settings');
  return (
    <div className="max-w-4xl">
      <ModuleHead sub="Submission rules, late marking, grading and who can see which course" />
      <div className="flex flex-col gap-5 @lg:gap-6">
        <SettingsCard title="Submission rules" icon={I.Upload} rows={[
          { title: 'Online submission', sub: 'Students with a login hand in photos or files', on: true },
          { title: 'Allowed files', sub: 'Photos, PDF and Word', value: 'Up to 10 MB each' },
          { title: 'Hand in again', sub: 'Teachers allow it for one student at a time', value: 'Per student' },
          { title: 'Discussion on each homework', sub: 'Comments between the teacher and the student', on: true },
        ]} />
        <SettingsCard title="Late marking" icon={I.Clock} rows={[
          { title: 'Counts as late after', value: 'Due date, 11:59 PM' },
          { title: 'Grace time', value: 'None' },
          { title: 'Missing after the due date', sub: 'Students who did not hand in show as Missing', on: true },
        ]} />
        <SettingsCard title="Grading" icon={I.Award} rows={[
          { title: 'Show', value: 'Score and grade' },
          { title: 'Default maximum marks', value: '100' },
          { title: 'Homework grades', sub: 'A 80% and above, B 60%, C 40%, D below', value: '4 grades' },
          { title: 'Students see the feedback', on: true },
        ]} />
        <Card>
          <CardHead title="Course access" sub="Who can see which course" icon={I.ShieldCheck} />
          <ul className="divide-y divide-line/70 border-t border-line/70">
            {[['Students', 'Only the courses of their own class and section'], ['Subject teachers', 'Their own classes and subjects'], ['Class teachers', 'All subjects of their class, to read'], ['Academic Head and Principal', 'All courses']].map(([k, v]) => (
              <li key={k} className="flex items-center gap-3 px-5 py-3.5 text-[14px]"><b className="font-semibold flex-1">{k}</b><span className="text-ink2 text-right">{v}</span></li>
            ))}
          </ul>
        </Card>
        <SettingsCard title="Display" icon={I.LayoutGrid} rows={[
          { title: 'Homework list shows as', value: 'Cards' },
          { title: 'Show “Seen by parent” on cards', on: true },
          { title: 'Show attachments count on cards', on: false },
        ]} />
        <Card>
          <CardHead title="Homework messages to parents" sub="Set in Communication, Message Settings" icon={I.MessageCircle} action={canMsgSettings && <Button size="sm" variant="ghost" iconRight={I.ArrowRight} onClick={() => go('communication', { page: 'settings' })}>Change</Button>} />
          <ul className="divide-y divide-line/70 border-t border-line/70">
            {[['When homework is given', 'On · WhatsApp'], ['Homework not handed in', 'On · 7:00 PM on the due date, once'], ['Teacher feedback', 'Off']].map(([k, v]) => (
              <li key={k} className="flex items-center gap-3 px-5 py-3.5 text-[14px]"><span className="flex-1">{k}</span><span className="text-ink2 font-semibold">{v}</span></li>
            ))}
          </ul>
        </Card>
        <SettingsCard title="Optional pages" sub="Turn off what your school does not use" icon={I.ToggleRight} rows={[
          { title: 'Study Material', on: true }, { title: 'Quizzes', on: true }, { title: 'Discussions', on: true }, { title: 'Online Classes', sub: 'Google Meet is connected', on: true },
        ]} />
        <Banner tone="brand" icon="Sparkles" title="AI teacher assistant is on." action={<Button size="sm" variant="secondary" onClick={() => toast({ title: 'Open Settings, Modules On/Off', body: 'Only the School Admin can switch it off.', tone: 'info' })}>Where to change</Button>}>Drafts for homework, feedback and remarks are always shown as suggestions for the teacher to edit.</Banner>
      </div>
    </div>
  );
}

/* =====================================================================
   Pages
   ===================================================================== */
export const HOMEWORK_PAGES = {
  homework: HomeworkPage,
  submissions: SubmissionsPage,
  material: MaterialPage,
  quizzes: QuizzesPage,
  discussions: DiscussionsPage,
  online: OnlinePage,
  progress: ProgressPage,
  settings: SettingsPage,
};
