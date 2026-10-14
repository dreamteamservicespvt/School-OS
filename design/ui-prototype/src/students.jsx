import React, { useEffect, useMemo, useState } from 'react';
import * as I from './icons.js';
import { STUDENTS, CLASSES, FEATURED, STUDENT_PROFILE as P, FEE_ROWS, OCT_ATT, inr } from './data.js';
import { cx, Card, CardHead, Button, Pill, Avatar, Checkbox, Input, Field, Segmented, Tabs, Ring, Empty, Skel, Sheet, PageHead, useToast, feeTone, inputCls } from './ui.jsx';
import { useNav, useRole, canDo } from './shell.jsx';
import { ModuleHead, useCanEdit, usePage, CalendarMonth, sampleMark, monthTotals, MONTH_NAMES } from './kit.jsx';
import { inMenu, pagesFor, pageAccess } from './config.js';
import { INCIDENTS, CASES, ReportSheet } from './mod-students.jsx';

const labOf = (s) => (s.cls.startsWith('Class ') ? `${s.cls.slice(6)} ${s.sec}` : `${s.cls} ${s.sec}`);
// The counselling cases given to the counsellor (Sana Ali)
const CASE_IDS = new Set(CASES.map((c) => c.s.id));

// Which students a role sees: teachers their own classes, the class teacher their section, the warden the boarders, the counsellor their cases
export function studentScope(roleId) {
  if (roleId === 'teacher') return { list: STUDENTS.filter((s) => ['6', '7'].includes(s.clsId) && ['A', 'B'].includes(s.sec)), note: 'Your classes: 6 A, 6 B, 7 A, 7 B', why: 'You see only the students you teach: 6 A, 6 B, 7 A and 7 B.' };
  if (roleId === 'classteacher') return { list: STUDENTS.filter((s) => s.clsId === '7' && s.sec === 'B'), note: 'Your class: 7 B', why: 'You see only the students of your class, 7 B.' };
  if (roleId === 'warden') return { list: STUDENTS.filter((s, i) => Number(s.clsId) >= 6 && !s.girl && i % 3 === 0), note: 'Boarders in the boys’ hostel', why: 'You see only the boarders of the boys’ hostel.' };
  if (roleId === 'counsellor') return { list: STUDENTS.filter((s) => CASE_IDS.has(s.id)), note: 'Students with a counselling case given to you', why: 'You see only the students whose counselling case is given to you.' };
  return { list: STUDENTS, note: null };
}

// What each role sees in the Student List (05-roles.md notes). Hidden, never just greyed out.
const NO_ATT = ['accountant', 'receptionist', 'gatesecurity', 'librarian', 'admissioncounsellor'];
function listRules(role, access) {
  const id = role.id;
  return {
    fees: !!role.access.fees && id !== 'admissioncounsellor',
    att: !NO_ATT.includes(id),
    parent: !['librarian', 'gatesecurity'].includes(id),
    bulk: access === 'full' || ((id === 'teacher' || id === 'classteacher') && !!role.access.communication),
    ids: access === 'full',
    why: { accountant: 'Find a student to see their fees', receptionist: 'Find a student to check the approved pickup list', gatesecurity: 'Find a student to check the photo and the approved pickup list',
      librarian: 'Find a student to issue a book', admissioncounsellor: 'Find a student to check siblings and seats', academichead: 'Follow students across classes', examincharge: 'Students taking exams' }[id],
    placeholder: id === 'librarian' || id === 'gatesecurity' ? 'Student name, admission no. or class' : 'Name, admission no., parent name or phone',
  };
}

export const StudentListPage = ({ onAddStudent }) => <Students onAddStudent={onAddStudent} />;

/* ======================= Student List ======================= */
export function Students({ onAddStudent }) {
  const { go } = useNav();
  const toast = useToast();
  const { role } = useRole();
  const { access, moduleAccess } = usePage();
  const canEdit = useCanEdit();
  const R = listRules(role, access);
  const scope = useMemo(() => studentScope(role.id), [role.id]);
  const POOL = scope.list;
  const classes = CLASSES.filter((c) => POOL.some((s) => s.clsId === c.id));
  const [cls, setCls] = useState('all');
  const [sec, setSec] = useState('all');
  const [q, setQ] = useState('');
  const [fee, setFee] = useState('all');
  const [sel, setSel] = useState(new Set());
  const [limit, setLimit] = useState(20);
  const [loading, setLoading] = useState(true);
  useEffect(() => { const t = setTimeout(() => setLoading(false), 500); return () => clearTimeout(t); }, []);
  const bulk = R.bulk && canEdit;

  const counts = useMemo(() => {
    const m = {};
    POOL.forEach((s) => (m[s.clsId] = (m[s.clsId] || 0) + 1));
    return m;
  }, [POOL]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const d = t.replace(/\s/g, '');
    return POOL.filter((s) =>
      (cls === 'all' || s.clsId === cls) && (sec === 'all' || s.sec === sec) &&
      (!R.fees || fee === 'all' || (fee === 'dues' ? s.due > 0 : s.feeState === 'Overdue')) &&
      (!t || s.name.toLowerCase().includes(t) || s.adm.toLowerCase().includes(t) || (R.parent ? s.father.toLowerCase().includes(t) || (d.length >= 3 && s.phone.replace(' ', '').includes(d)) : `${s.cls} ${s.sec}`.toLowerCase().includes(t)))
    ).sort((a, b) => (a.clsId === b.clsId ? a.sec.localeCompare(b.sec) || a.roll - b.roll : 0));
  }, [cls, sec, q, fee, POOL, R.fees, R.parent]);
  const shown = rows.slice(0, limit);
  const curClass = CLASSES.find((c) => c.id === cls);
  const allOn = shown.length > 0 && shown.every((s) => sel.has(s.id));
  const toggle = (id) => setSel((x) => { const n = new Set(x); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clear = () => { setQ(''); setCls('all'); setSec('all'); setFee('all'); };
  const sub = scope.note ? `${scope.note} · ${POOL.length} students` : R.why ? `${R.why} · ${STUDENTS.length} students in 2026–27` : `${STUDENTS.length} studying in 2026–27 · example records`;

  return (
    <div>
      <ModuleHead title="Students" sub={sub}
        actions={access === 'full' ? <>
          <Button variant="secondary" icon={I.Upload} className="hidden @md:inline-flex" onClick={() => toast({ title: 'Import from Excel', body: 'Pick a file. We check every row before adding anything.', tone: 'info' })}>Import</Button>
          <Button variant="secondary" icon={I.Download} className="hidden @md:inline-flex" onClick={() => toast({ title: `Exported ${rows.length} students`, body: 'students-2026-27.xlsx is ready in Downloads' })}>Export</Button>
          <Button variant="primary" icon={I.UserPlus} onClick={onAddStudent}>Add student</Button>
        </> : moduleAccess === 'full' && <Button variant="secondary" icon={I.Download} onClick={() => toast({ title: `Exported ${rows.length} students`, body: 'students-2026-27.xlsx is ready in Downloads' })}>Export</Button>} />

      {/* Class picker */}
      <div className="-mx-4 px-4 @md:mx-0 @md:px-0 overflow-x-auto no-scrollbar">
        <div className="flex gap-2 w-max pb-1">
          {[{ id: 'all', name: classes.length === 1 ? 'My class' : 'All classes' }, ...classes].map((c) => {
            const on = cls === c.id;
            return (
              <button key={c.id} onClick={() => { setCls(c.id); setSec('all'); setLimit(20); }}
                className={cx('h-10 px-3.5 rounded-xl text-[13.5px] font-semibold border transition inline-flex items-center gap-2',
                  on ? 'bg-ink text-bg border-ink' : 'bg-surface border-line text-ink2 hover:border-ink3/50 hover:text-ink')}>
                {c.name}
                <span className={cx('text-[11.5px] tnum', on ? 'opacity-90' : 'text-ink3')}>{c.id === 'all' ? POOL.length : counts[c.id] || 0}</span>
              </button>
            );
          })}
        </div>
      </div>
      {curClass && (
        <div className="flex gap-2 mt-3 items-center flex-wrap animate-rise">
          <span className="text-[13px] text-ink3 font-medium mr-1">Section</span>
          <Segmented size="sm" value={sec} onChange={setSec} options={[{ value: 'all', label: 'All' }, ...curClass.sections.filter((x) => POOL.some((s) => s.clsId === curClass.id && s.sec === x)).map((s) => ({ value: s, label: s }))]} />
        </div>
      )}

      <Card className="mt-4 overflow-hidden">
        {/* Filters */}
        <div className="flex flex-col @md:flex-row gap-2.5 p-3 border-b border-line">
          <div className="relative flex-1">
            <I.Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3" />
            <input id="student-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={R.placeholder}
              className={cx(inputCls(false), 'pl-10')} />
            {q && <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center rounded-lg text-ink3 hover:bg-sunken" aria-label="Clear search"><I.X size={16} /></button>}
          </div>
          {R.fees && <Segmented value={fee} onChange={setFee} options={[{ value: 'all', label: 'Everyone' }, { value: 'dues', label: 'Has dues' }, { value: 'over', label: 'Overdue' }]} />}
        </div>

        {/* Bulk bar */}
        {bulk && sel.size > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-brand/8 border-b border-brand/20 animate-fade flex-wrap">
            <p className="text-[13.5px] font-semibold text-brand mr-2">{sel.size} selected</p>
            {role.access.communication && <Button size="sm" variant="secondary" icon={I.Send} onClick={() => { toast({ title: `Message ready for ${sel.size} families`, body: 'Opening Send message…', tone: 'info' }); }}>Message parents</Button>}
            {R.ids && <Button size="sm" variant="secondary" icon={I.IdCard} onClick={() => toast({ title: `${sel.size} ID cards ready to print` })}>ID cards</Button>}
            <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>Clear</Button>
          </div>
        )}

        {loading ? (
          <div className="p-4 flex flex-col gap-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="flex gap-3 items-center"><Skel className="w-10 h-10 !rounded-full" /><div className="flex-1 flex flex-col gap-2"><Skel className="h-3.5 w-1/3" /><Skel className="h-3 w-1/2" /></div></div>)}</div>
        ) : rows.length === 0 ? (
          <Empty icon={I.SearchX} title="No students match" body={q ? `Nobody called “${q}” in ${curClass ? curClass.name : scope.note ? 'your list' : 'any class'}. Try the admission number${R.parent ? ' or the parent’s phone' : ''}.` : `Try a different class${R.fees ? ' or fee filter' : ''}.`}
            action={<Button variant="secondary" onClick={clear}>Clear filters</Button>} />
        ) : (
          <>
            {/* Computer: table */}
            <div className="hidden @lg:block overflow-x-auto">
              <table className="w-full text-left text-[14px]">
                <thead>
                  <tr className="text-[12px] text-ink3 font-semibold border-b border-line">
                    {bulk && <th className="pl-4 pr-2 py-3 w-10"><Checkbox label="Select all" checked={allOn} indeterminate={!allOn && shown.some((s) => sel.has(s.id))} onChange={() => setSel(allOn ? new Set() : new Set(shown.map((s) => s.id)))} /></th>}
                    <th className={cx('px-3 py-3', !bulk && 'pl-5')}>Student</th>
                    <th className="px-3 py-3">Class</th>
                    {R.parent && <th className="px-3 py-3">Parent</th>}
                    {R.att && <th className="px-3 py-3">Attendance</th>}
                    {R.fees && <th className="px-3 py-3">Fees</th>}
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((s) => (
                    <tr key={s.id} onClick={() => go('student', { id: s.id })} className={cx('border-b border-line/70 last:border-0 cursor-pointer transition group', sel.has(s.id) ? 'bg-brand/5' : 'hover:bg-sunken/60')}>
                      {bulk && <td className="pl-4 pr-2 py-3" onClick={(e) => e.stopPropagation()}><Checkbox label={`Select ${s.name}`} checked={sel.has(s.id)} onChange={() => toggle(s.id)} /></td>}
                      <td className={cx('px-3 py-2.5', !bulk && 'pl-5')}>
                        <div className="flex items-center gap-3">
                          <Avatar name={s.name} size={38} />
                          <div className="min-w-0">
                            <p className="font-semibold leading-tight flex items-center gap-2">{s.name}{s.status !== 'Active' && <Pill tone={s.status === 'New' ? 'info' : 'neutral'} className="!h-5 !text-[11px]">{s.status}</Pill>}</p>
                            <p className="text-[12.5px] text-ink3 font-mono">{s.adm}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap"><span className="font-medium">{s.cls} {s.sec}</span><span className="text-ink3 text-[12.5px]"> · Roll {s.roll}</span></td>
                      {R.parent && <td className="px-3 py-2.5"><p className="leading-tight">{s.father}</p><p className="text-[12.5px] text-ink3 tnum">{s.phone}</p></td>}
                      {R.att && (
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2.5 w-28">
                            <span className="flex-1 h-1.5 rounded-full bg-sunken overflow-hidden"><span className={cx('block h-full rounded-full', s.att < 85 ? 'bg-warn' : 'bg-ok')} style={{ width: `${s.att}%` }} /></span>
                            <span className={cx('text-[13px] font-semibold tnum', s.att < 85 && 'text-warn')}>{s.att}%</span>
                          </div>
                        </td>
                      )}
                      {R.fees && <td className="px-3 py-2.5">{s.due ? <Pill tone={feeTone(s.feeState)}>{inr(s.due)} {s.feeState === 'Overdue' ? 'overdue' : 'due'}</Pill> : <Pill tone="ok" dot>Paid</Pill>}</td>}
                      <td className="pr-3"><I.ChevronRight size={18} className="text-ink3 opacity-0 group-hover:opacity-100 transition" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Phone and tablet: cards */}
            <ul className="@lg:hidden divide-y divide-line/70">
              {shown.map((s) => (
                <li key={s.id}>
                  <button onClick={() => go('student', { id: s.id })} className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-sunken">
                    <Avatar name={s.name} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[15px] truncate">{s.name}</p>
                      <p className="text-[13px] text-ink3 truncate">{s.cls} {s.sec} · Roll {s.roll}{R.parent ? ` · ${s.father}` : ` · ${s.adm}`}</p>
                      {(R.fees || R.att) && (
                        <div className="flex gap-1.5 mt-1.5">
                          {R.fees && (s.due ? <Pill tone={feeTone(s.feeState)} className="!h-[22px] !text-[11.5px]">{inr(s.due)} {s.feeState === 'Overdue' ? 'overdue' : 'due'}</Pill> : <Pill tone="ok" className="!h-[22px] !text-[11.5px]">Fees paid</Pill>)}
                          {R.att && <Pill tone={s.att < 85 ? 'warn' : 'neutral'} className="!h-[22px] !text-[11.5px]">{s.att}% present</Pill>}
                        </div>
                      )}
                    </div>
                    <I.ChevronRight size={18} className="text-ink3" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-line text-[13px] text-ink3">
              <span className="tnum">Showing {shown.length} of {rows.length}</span>
              {shown.length < rows.length && <Button size="sm" variant="secondary" onClick={() => setLimit((l) => l + 20)}>Show more</Button>}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

/* ======================= Add student (short form) ======================= */
export function AddStudentSheet({ open, onClose }) {
  const toast = useToast();
  const { go } = useNav();
  const empty = { name: '', cls: '', sec: 'A', gender: 'Boy', dob: '', parent: '', phone: '' };
  const [f, setF] = useState(empty);
  const [touched, setTouched] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setF(empty); setTouched({}); } }, [open]);
  const digits = f.phone.replace(/\D/g, '');
  const err = {
    name: !f.name.trim() ? 'Enter the student’s full name' : f.name.trim().length < 3 ? 'Name looks too short' : '',
    cls: !f.cls ? 'Choose a class' : '',
    parent: !f.parent.trim() ? 'Enter a parent or guardian name' : '',
    phone: !digits ? 'Parents get the Parent Link on this number' : digits.length !== 10 || !/^[6-9]/.test(digits) ? 'Enter a 10-digit Indian mobile number' : '',
  };
  const show = (k) => touched[k] && err[k];
  const valid = !Object.values(err).some(Boolean);
  const set = (k) => (e) => setF({ ...f, [k]: e.target ? e.target.value : e });
  const submit = (e) => {
    e.preventDefault();
    setTouched({ name: 1, cls: 1, parent: 1, phone: 1 });
    if (!valid) return;
    setSaving(true);
    setTimeout(() => {
      setSaving(false); onClose();
      toast({ title: `${f.name.trim()} added to ${CLASSES.find((c) => c.id === f.cls).name} ${f.sec}`, body: 'Admission no. SPS/2026/0913 · Parent Link sent to ' + f.phone });
    }, 900);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Add student" sub="Only these details are needed now. Add the rest from the profile any time.">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Field label="Student’s full name" required id="as-name" error={show('name')}>
          <Input id="as-name" value={f.name} onChange={set('name')} onBlur={() => setTouched({ ...touched, name: 1 })} error={show('name')} placeholder="As on birth certificate" autoComplete="off" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Class" required id="as-class" error={show('cls')}>
            <select id="as-class" value={f.cls} onChange={set('cls')} onBlur={() => setTouched({ ...touched, cls: 1 })} className={inputCls(show('cls'))}>
              <option value="">Choose</option>
              {CLASSES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Section" id="as-sec">
            <select id="as-sec" value={f.sec} onChange={set('sec')} className={inputCls(false)}>
              {(CLASSES.find((c) => c.id === f.cls)?.sections || ['A']).map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Gender" id="as-g"><Segmented value={f.gender} onChange={set('gender')} options={['Boy', 'Girl', 'Other']} className="w-full" size="sm" /></Field>
          <Field label="Date of birth" id="as-dob"><Input id="as-dob" type="date" value={f.dob} onChange={set('dob')} max="2024-12-31" /></Field>
        </div>
        <Field label="Parent or guardian name" required id="as-parent" error={show('parent')}>
          <Input id="as-parent" value={f.parent} onChange={set('parent')} onBlur={() => setTouched({ ...touched, parent: 1 })} error={show('parent')} placeholder="Father, mother or guardian" />
        </Field>
        <Field label="Parent mobile number" required id="as-phone" error={show('phone')} hint={!show('phone') && (digits.length === 10 && !err.phone ? '✓ Looks right. Parent Link goes to this number.' : 'Used for Parent Link and fee receipts')}>
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink3 text-[15px]">+91</span>
            <Input id="as-phone" inputMode="numeric" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/[^\d ]/g, '').slice(0, 11) })} onBlur={() => setTouched({ ...touched, phone: 1 })} error={show('phone')} className="pl-12 tnum" placeholder="98480 12345" />
          </div>
        </Field>
        <div className="flex gap-2 justify-end pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" icon={I.Check} loading={saving}>{saving ? 'Adding…' : 'Add student'}</Button>
        </div>
      </form>
    </Sheet>
  );
}

/* ======================= Student Profile ======================= */
// What each role may see on a student's profile (05-roles.md notes). Anything not listed is hidden, never greyed out.
const TABS_BY_ROLE = {
  principal: ['overview', 'attendance', 'fees', 'exams', 'behaviour', 'documents', 'timeline'],
  schooladmin: ['overview', 'attendance', 'fees', 'exams', 'behaviour', 'documents', 'timeline'],
  vp: ['overview', 'attendance', 'fees', 'exams', 'behaviour', 'documents', 'timeline'],
  officestaff: ['overview', 'attendance', 'behaviour', 'documents', 'timeline'],
  accountant: ['overview', 'fees'],
  teacher: ['overview', 'attendance', 'exams', 'behaviour'],
  classteacher: ['overview', 'attendance', 'exams', 'behaviour', 'timeline'],
  warden: ['overview', 'attendance'],
  counsellor: ['overview', 'attendance', 'counselling'],
  academichead: ['overview', 'attendance', 'exams'],
  examincharge: ['overview', 'attendance', 'exams'],
  admissioncounsellor: ['overview'],
};
const IN = (ids) => (id) => ids.includes(id);
const FULL_ROLES = ['principal', 'schooladmin', 'vp', 'officestaff'];
function profileRules(role) {
  const id = role.id, acc = role.access;
  if (id === 'receptionist' || id === 'gatesecurity') return { mode: 'pickup' };
  if (id === 'librarian') return { mode: 'library' };
  const full = FULL_ROLES.includes(id) || acc.students === 'full';
  const tabs = TABS_BY_ROLE[id] || (full ? TABS_BY_ROLE.principal : ['overview']);
  return {
    mode: 'profile', full, tabs,
    fees: tabs.includes('fees'),
    personal: !IN(['accountant', 'admissioncounsellor'])(id),
    address: full || IN(['classteacher', 'warden', 'counsellor'])(id),
    parents: full || IN(['accountant', 'teacher', 'classteacher', 'warden', 'counsellor', 'admissioncounsellor'])(id),
    emergency: full || IN(['teacher', 'classteacher', 'warden', 'counsellor'])(id),
    today: tabs.includes('attendance') && id !== 'counsellor',
    suggest: tabs.includes('exams'),
    siblings: full || id === 'admissioncounsellor',
    pickup: full || id === 'classteacher',
    transport: full || IN(['accountant', 'classteacher', 'warden'])(id),
    library: full || id === 'classteacher',
    report: full || IN(['teacher', 'classteacher'])(id),
    oneSubject: id === 'teacher' ? 'Mathematics' : null,
  };
}
const pickupOf = (s, featured) => (featured
  ? [{ n: 'Priya Sharma', r: 'Mother', p: '98495 60211' }, { n: 'Rajesh Sharma', r: 'Father', p: '98490 31277' }, { n: 'Kamala Sharma', r: 'Grandmother', p: '90002 11843' }]
  : [{ n: s.father, r: 'Father', p: s.phone }, { n: `Lakshmi ${s.last}`, r: 'Mother', p: P.motherPhone }]);

export function StudentProfile({ id }) {
  const { go } = useNav();
  const toast = useToast();
  const { role } = useRole();
  const acc = role.access;
  const scope = useMemo(() => studentScope(role.id), [role.id]);
  // With no student picked, open the first one this person may see
  const pickId = id || (scope.list.some((x) => x.id === FEATURED.id) ? FEATURED.id : scope.list[0]?.id);
  const base = STUDENTS.find((x) => x.id === pickId) || FEATURED;
  const s = base.id === FEATURED.id ? FEATURED : base;
  const featured = s.id === FEATURED.id;
  const R = profileRules(role);
  const yearOpen = useCanEdit();
  // The record is changed only by people whose Student List page is Full (the office); the Principal reads it
  const listFull = pageAccess(role.id, 'students', 'list', acc.students) === 'full';
  const behFull = pageAccess(role.id, 'students', 'behaviour', acc.students) !== 'view';
  const canEdit = yearOpen && R.full && listFull;
  const [tab, setTab] = useState('overview');
  const [more, setMore] = useState(false);
  const [report, setReport] = useState(false);
  const [added, setAdded] = useState([]);
  const docsDone = P.docs.filter((d) => d.ok).length;
  const counsellorOnly = role.id === 'counsellor';
  const backTo = counsellorOnly ? () => go('students', { page: 'behaviour' }) : () => go('students');
  const backLabel = counsellorOnly ? 'My counselling cases' : 'Students';
  const back = (
    <button onClick={backTo} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink mb-3 -ml-1 h-8 px-1 rounded-lg">
      <I.ArrowLeft size={17} />{backLabel} <span className="text-ink3 font-normal">/ {s.cls} {s.sec}</span>
    </button>
  );

  // Own roles open only their own students; anyone else's profile shows a lock, not the details
  if (scope.note && !scope.list.some((x) => x.id === s.id)) {
    return (
      <div>
        {back}
        <Card><Empty icon={I.Lock} title="This student is not in your list" body={scope.why} action={<Button variant="secondary" icon={I.ArrowLeft} onClick={backTo}>{backLabel}</Button>} /></Card>
      </div>
    );
  }
  if (R.mode === 'pickup') return <PickupView s={s} featured={featured} back={back} />;
  if (R.mode === 'library') return <LibraryView s={s} featured={featured} back={back} />;

  const caseOf = CASES.find((c) => c.s.id === s.id);
  const incidents = [...added, ...INCIDENTS.filter((i) => i.kids.some((k) => k.id === s.id))];
  const tabs = R.tabs;
  const strip = [
    tabs.includes('attendance') && { k: 'Attendance', v: `${s.att}%`, sub: 'This year', tone: s.att < 85 ? 'warn' : 'ok', icon: I.CalendarCheck2, tab: 'attendance' },
    tabs.includes('exams') && { k: R.oneSubject ? 'Mathematics' : 'Exam average', v: R.oneSubject ? '25 / 25' : '87%', sub: 'Unit Test 2', tone: 'ok', icon: I.Award, tab: 'exams' },
    R.fees && { k: 'Fees', v: s.due ? inr(s.due) : 'Paid', sub: s.due ? (s.feeState === 'Overdue' ? 'Overdue' : 'Due') : 'Nothing due', tone: s.due ? feeTone(s.feeState) : 'ok', icon: I.IndianRupee, tab: 'fees' },
    tabs.includes('counselling') && caseOf && { k: 'Counselling', v: caseOf.status, sub: caseOf.next ? `Next ${caseOf.next.split(',')[0]}` : 'Case closed', icon: I.HeartHandshake, tab: 'counselling' },
    R.transport && { k: 'Transport', v: featured ? 'Route 4' : 'Parent drop', sub: featured ? 'KPHB 6th Phase' : 'No bus', icon: I.Bus },
    tabs.includes('documents') && { k: 'Documents', v: `${docsDone} of ${P.docs.length}`, sub: '1 missing', tone: 'warn', icon: I.FolderOpen, tab: 'documents' },
    R.library && { k: 'Library', v: featured ? '1 book' : 'No books', sub: featured ? 'Due 14 Oct' : 'Nothing out', icon: I.BookOpen },
  ].filter(Boolean);
  const XL = ['', '@xl:grid-cols-1', '@xl:grid-cols-2', '@xl:grid-cols-3', '@xl:grid-cols-4', '@xl:grid-cols-5', '@xl:grid-cols-6', '@xl:grid-cols-7'][strip.length];
  const MD = strip.length >= 3 ? '@md:grid-cols-3' : strip.length === 2 ? '@md:grid-cols-2' : '@md:grid-cols-1';
  const TAB_LABEL = { overview: 'Overview', attendance: 'Attendance', fees: 'Fees', exams: R.oneSubject ? 'Marks' : 'Exams', behaviour: 'Behaviour', counselling: 'Counselling', documents: 'Documents', timeline: 'Timeline' };
  const collect = canDo(role, 'fees.collect');
  const message = !!acc.communication && R.parents;
  const reportOn = R.report && tabs.includes('behaviour') && yearOpen && behFull;

  return (
    <div>
      {back}

      {/* Header */}
      <Card className="overflow-hidden">
        <div className="h-16 @md:h-20 bg-gradient-to-r from-brand to-brand/60 relative"><div className="absolute inset-0 dotgrid opacity-50" /></div>
        <div className="relative px-4 @md:px-6 pb-5 flex flex-col @lg:flex-row @lg:items-end gap-4">
          <div className="flex items-end gap-4 min-w-0 flex-1">
            <div className="rounded-full p-1 bg-surface shrink-0 -mt-10 @md:-mt-12"><Avatar name={s.name} size={88} /></div>
            <div className="min-w-0 pt-3">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display text-[24px] @md:text-[28px] font-semibold tracking-tight leading-tight">{s.name}</h1>
                <Pill tone="ok" dot>{s.status === 'Active' ? 'Studying' : s.status}</Pill>
                {!canEdit && <Pill tone="neutral"><I.Eye size={13} />View only</Pill>}
              </div>
              <p className="text-[13.5px] text-ink3 mt-0.5">{s.cls} {s.sec} · Roll {s.roll} · <span className="font-mono text-[12.5px]">{s.adm}</span>{featured && R.personal && ` · ${P.house}`}</p>
            </div>
          </div>
          {(collect || message || (reportOn && !canEdit) || canEdit) && (
            <div className="flex flex-wrap gap-2 relative">
              {collect && <Button variant="primary" icon={I.IndianRupee} className="flex-1 @lg:flex-none" onClick={() => go('fees', { student: s.id })}>Collect fee</Button>}
              {reportOn && !canEdit && <Button variant="secondary" icon={I.TriangleAlert} className="flex-1 @lg:flex-none" onClick={() => setReport(true)}>Report incident</Button>}
              {message && <Button variant={collect || (reportOn && !canEdit) ? 'secondary' : 'primary'} icon={I.MessageCircle} className="flex-1 @lg:flex-none" onClick={() => toast({ title: `Message to ${s.father}`, body: 'Opening WhatsApp message with the school template', tone: 'info' })}>Message<span className="hidden @sm:inline">&nbsp;parent</span></Button>}
              {canEdit && <Button variant="secondary" icon={I.Ellipsis} aria-label="More actions" onClick={() => setMore(!more)} className="!px-3" />}
              {more && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMore(false)} />
                  <div className="absolute right-0 top-12 z-40 w-56 bg-surface border border-line rounded-2xl shadow-pop p-1.5 animate-rise">
                    {[...(reportOn ? [[I.TriangleAlert, 'Report incident', () => setReport(true)]] : []), [I.IdCard, 'Print ID card'], [I.FileText, 'Bonafide certificate'], [I.FileOutput, 'Transfer certificate (TC)'], [I.ArrowRightLeft, 'Change section'], [I.Pencil, 'Edit details']].map(([Ic, l, run]) => (
                      <button key={l} onClick={() => { setMore(false); run ? run() : toast({ title: l, body: `For ${s.name}`, tone: 'info' }); }} className="w-full flex items-center gap-2.5 h-10 px-3 rounded-xl hover:bg-sunken text-[14px] text-left"><Ic size={17} className="text-ink3" />{l}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        {/* Summary strip: only what this person may see */}
        {strip.length > 0 && (
          <div className={cx('grid grid-cols-2 border-t border-line -mr-px -mb-px', MD, XL)}>
            {strip.map((m) => {
              const on = m.tab && tabs.includes(m.tab);
              const Tag = on ? 'button' : 'div';
              return (
                <Tag key={m.k} {...(on ? { onClick: () => setTab(m.tab) } : {})}
                  className={cx('text-left px-4 @md:px-5 py-3.5 border-line border-r border-b transition', on && 'hover:bg-sunken/60')}>
                  <p className="text-[12px] text-ink3 font-semibold flex items-center gap-1.5"><m.icon size={14} />{m.k}</p>
                  <p className={cx('font-semibold text-[17px] tnum mt-0.5', m.tone === 'bad' && 'text-bad', m.tone === 'warn' && m.k !== 'Documents' && 'text-warn')}>{m.v}</p>
                  <p className="text-[12px] text-ink3">{m.sub}</p>
                </Tag>
              );
            })}
          </div>
        )}
      </Card>

      {tabs.length > 1 && <Tabs className="mt-5" value={tab} onChange={setTab} tabs={tabs.map((t) => ({ id: t, label: TAB_LABEL[t] }))} />}

      <div className="mt-5 animate-rise" key={tab}>
        {tab === 'overview' && <Overview s={s} featured={featured} R={R} edit={canEdit} />}
        {tab === 'attendance' && tabs.includes('attendance') && <AttendanceTab s={s} featured={featured} />}
        {tab === 'fees' && R.fees && <FeesTab s={s} />}
        {tab === 'exams' && tabs.includes('exams') && <ExamsTab s={s} subject={R.oneSubject} />}
        {tab === 'behaviour' && tabs.includes('behaviour') && <BehaviourTab s={s} list={incidents} caseOf={caseOf} onReport={reportOn ? () => setReport(true) : null} />}
        {tab === 'counselling' && tabs.includes('counselling') && <CounsellingTab s={s} c={caseOf} />}
        {tab === 'documents' && tabs.includes('documents') && <DocsTab edit={canEdit} />}
        {tab === 'timeline' && tabs.includes('timeline') && <TimelineTab hide={[...(R.fees ? [] : ['fee', 'msg']), ...(tabs.includes('exams') ? [] : ['exam'])]} />}
      </div>
      {report && <ReportSheet preset={s} scope={role.id === 'teacher' ? ['6 A', '6 B', '7 A', '7 B'] : role.id === 'classteacher' ? ['7 B'] : null} onClose={() => setReport(false)}
        onSave={(n) => { setAdded((l) => [n, ...l]); setTab('behaviour'); toast({ title: `${n.type} saved for ${n.kids.map((k) => k.name.split(' ')[0]).join(', ')}`, body: n.informed ? 'Parent informed on WhatsApp.' : `${n.id} · ${n.pts > 0 ? '+' : ''}${n.pts} points` }); }} />}
    </div>
  );
}

/* Receptionist and Gate Security: photo and the approved pickup list, nothing else */
function PickupView({ s, featured, back }) {
  const { go } = useNav();
  const { role } = useRole();
  const showPhone = role.id === 'receptionist';
  const canPickup = inMenu(role, 'frontoffice') && pagesFor('frontoffice', role.access.frontoffice, role.id).some((p) => p.id === 'pickup');
  const list = pickupOf(s, featured);
  return (
    <div>
      {back}
      <div className="flex flex-col gap-5 max-w-3xl">
        <Card className="p-5 flex flex-col @md:flex-row @md:items-center gap-4">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <Avatar name={s.name} size={88} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap"><h1 className="font-display text-[24px] @md:text-[28px] font-semibold tracking-tight leading-tight">{s.name}</h1><Pill tone="neutral"><I.Eye size={13} />View only</Pill></div>
              <p className="text-[13.5px] text-ink3 mt-0.5">{s.cls} {s.sec} · Roll {s.roll} · <span className="font-mono text-[12.5px]">{s.adm}</span></p>
              <p className="text-[13.5px] mt-1.5 flex flex-wrap items-center gap-x-1.5"><I.CircleCheck size={16} className="text-ok" /><span>In school today</span><span className="text-ink3">· goes home {featured ? 'by Bus 4, Route 4' : 'with a parent'}</span></p>
            </div>
          </div>
          {canPickup && <Button variant="primary" icon={I.DoorOpen} onClick={() => go('frontoffice', { page: 'pickup' })}>{role.id === 'receptionist' ? 'Pickup gate pass' : 'Open Student Pickup'}</Button>}
        </Card>
        <Card>
          <CardHead title="Approved pickup list" sub={`Only these people may take ${s.first || s.name.split(' ')[0]} home. For anyone else, call the parent first.`} icon={I.ShieldCheck} />
          <ul className="px-3 pb-3">
            {list.map((g) => (
              <li key={g.n} className="flex items-center gap-3 px-2 py-2.5 rounded-xl">
                <Avatar name={g.n} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[15px] leading-tight">{g.n}</p>
                  <p className="text-[12.5px] text-ink3">{g.r}{showPhone && <> · <span className="tnum">+91 {g.p}</span></>}</p>
                </div>
                <Pill tone="ok" dot>Photo on file</Pill>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

/* Librarian: name, photo and class, to issue a book */
function LibraryView({ s, featured, back }) {
  const { go } = useNav();
  const { role } = useRole();
  return (
    <div>
      {back}
      <div className="flex flex-col gap-5 max-w-3xl">
        <Card className="p-5 flex flex-col @md:flex-row @md:items-center gap-4">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <Avatar name={s.name} size={72} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap"><h1 className="font-display text-[24px] @md:text-[28px] font-semibold tracking-tight leading-tight">{s.name}</h1><Pill tone="neutral"><I.Eye size={13} />View only</Pill></div>
              <p className="text-[13.5px] text-ink3 mt-0.5">{s.cls} {s.sec} · Roll {s.roll}</p>
            </div>
          </div>
          {inMenu(role, 'library') && <Button variant="primary" icon={I.ArrowRightLeft} onClick={() => go('library', { page: 'issue' })}>Issue a book</Button>}
        </Card>
        <Card>
          <CardHead title="Library" icon={I.BookOpen} />
          <dl className="grid @sm:grid-cols-3 gap-x-6 gap-y-3.5 px-5 pb-5">
            {[['Library card', `LIB-${s.adm.slice(-4)}`], ['Books out', featured ? '1 · “Wings of Fire”, due 14 Oct' : 'None'], ['Fines', 'Nothing due']].map(([k, v]) => (
              <div key={k} className="min-w-0"><dt className="text-[12px] text-ink3 font-semibold">{k}</dt><dd className="text-[14.5px] mt-0.5 break-words">{v}</dd></div>
            ))}
          </dl>
        </Card>
      </div>
    </div>
  );
}

function DL({ rows }) {
  return (
    <dl className="grid @sm:grid-cols-2 gap-x-6 gap-y-3.5 px-5 pb-5">
      {rows.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[12px] text-ink3 font-semibold">{k}</dt>
          <dd className="text-[14.5px] mt-0.5 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
const EditBtn = ({ what, on }) => {
  const toast = useToast();
  if (!on) return null;
  return <button onClick={() => toast({ title: `Editing ${what}`, body: 'Each section saves on its own. No long forms.', tone: 'info' })} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand h-8 px-2 rounded-lg hover:bg-brand/8"><I.Pencil size={14} />Edit</button>;
};

function Overview({ s, featured, R, edit }) {
  const personal = [['Date of birth', featured ? `${P.dob} (${P.age} years)` : '22 August 2015'], ['Gender', s.girl ? 'Girl' : 'Boy'], ['Blood group', P.blood], ['Admitted on', P.admitted], ...(R.address ? [['Home address', P.address]] : []), ['House', P.house]];
  const parents = [{ n: s.father, r: 'Father', p: s.phone, j: P.fatherJob }, { n: featured ? P.mother : `Lakshmi ${s.last}`, r: 'Mother · Parent Link', p: P.motherPhone, j: 'Teacher' }];
  const side = R.today || R.suggest || R.siblings || R.pickup;
  return (
    <div className={cx('grid gap-5 items-start', side && '@xl:grid-cols-[minmax(0,1fr)_340px]')}>
      <div className="flex flex-col gap-5 min-w-0">
        {R.personal && (
          <Card>
            <CardHead title="Personal details" action={<EditBtn what="personal details" on={edit} />} />
            <DL rows={personal} />
          </Card>
        )}
        {R.parents && (
          <Card>
            <CardHead title="Parents" sub={R.fees ? 'Fee receipts and Parent Link go to the mother’s number' : 'Parent Link goes to the mother’s number'} action={<EditBtn what="parents" on={edit} />} />
            <div className="grid @sm:grid-cols-2 gap-3 px-5 pb-5">
              {parents.map((g) => (
                <div key={g.r} className="rounded-xl border border-line p-3.5 flex items-start gap-3">
                  <Avatar name={g.n} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[14.5px] leading-tight">{g.n}</p>
                    <p className="text-[12.5px] text-ink3">{g.r}{R.personal && ` · ${g.j}`}</p>
                    <p className="text-[14px] tnum mt-1.5 select-all">+91 {g.p}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
        {R.emergency && (
          <Card>
            <CardHead title="Emergency contacts" sub="Called in this order" action={<EditBtn what="emergency contacts" on={edit} />} />
            <ol className="px-5 pb-4">
              {(featured ? P.emergency : [{ name: `Lakshmi ${s.last}`, rel: 'Mother', phone: P.motherPhone }, { name: s.father, rel: 'Father', phone: s.phone }]).map((e, i) => (
                <li key={e.name} className="flex items-center gap-3 py-2 border-b border-line/70 last:border-0">
                  <span className="w-6 h-6 rounded-full bg-sunken text-[12px] font-bold grid place-items-center tnum">{i + 1}</span>
                  <span className="flex-1 min-w-0 text-[14px]"><b className="font-semibold">{e.name}</b> <span className="text-ink3">· {e.rel}</span></span>
                  <span className="text-[14px] tnum select-all">{e.phone}</span>
                </li>
              ))}
            </ol>
          </Card>
        )}
        {!R.personal && !R.parents && <Card><Empty icon={I.Lock} title="Nothing more to show" body="Your role sees only the student’s name and class here." /></Card>}
      </div>
      {side && (
        <div className="flex flex-col gap-5 min-w-0">
          {R.today && (
            <Card>
              <CardHead title="Today" icon={I.Sun} />
              <ul className="px-5 pb-5 flex flex-col gap-3 text-[14px]">
                <li className="flex gap-3"><I.CircleCheck size={18} className="text-ok shrink-0 mt-0.5" /><span><b className="font-semibold">Present</b> · marked 8:52 AM{featured ? ' by Ravi Teja' : ''}</span></li>
                <li className="flex gap-3"><I.Clock size={18} className="text-ink3 shrink-0 mt-0.5" /><span>Now: <b className="font-semibold">Science</b>, period 3 (10:30–11:15)</span></li>
                <li className="flex gap-3"><I.NotebookPen size={18} className="text-ink3 shrink-0 mt-0.5" /><span>Homework due: Maths, exercise 4.2</span></li>
                {R.fees && <li className="flex gap-3"><I.IndianRupee size={18} className="text-bad shrink-0 mt-0.5" /><span>Tuition Q3 due tomorrow, plus ₹10,950 overdue</span></li>}
              </ul>
            </Card>
          )}
          {R.suggest && (
            <Card className="border-brand/25">
              <CardHead title="Suggestions" sub="From marks and attendance. Nothing changes on the record." icon={I.Sparkles} />
              <ul className="px-5 pb-4 flex flex-col gap-3 text-[14px] leading-relaxed">
                <li><b className="font-semibold">Strong in Maths:</b> 24 and 25 of 25 in both unit tests. Consider the Maths Olympiad.</li>
                {!R.oneSubject && <li><b className="font-semibold">Social Studies is lowest</b> at 17 of 25 in UT1, improving to 20 in UT2.</li>}
              </ul>
              <div className="px-5 pb-4 text-[12px] text-ink3">Based on Unit Test 1 and 2 marks, attendance Apr–Oct</div>
            </Card>
          )}
          {R.pickup && (
            <Card>
              <CardHead title="Approved pickup list" sub="Shown at the gate and the front desk" icon={I.ShieldCheck} />
              <ul className="px-5 pb-4 flex flex-col gap-2.5">
                {pickupOf(s, featured).map((g) => <li key={g.n} className="flex items-center gap-3 text-[14px]"><Avatar name={g.n} size={30} /><span className="flex-1 min-w-0 truncate"><b className="font-semibold">{g.n}</b> <span className="text-ink3">· {g.r}</span></span></li>)}
              </ul>
            </Card>
          )}
          {R.siblings && (
            <Card>
              <CardHead title="Brothers and sisters here" sub="Found from the parents’ phone numbers" icon={I.Users} />
              <div className="px-5 pb-4 text-[14px]">{featured ? <p className="flex items-center gap-3"><Avatar name="Anaya Sharma" size={30} /><span><b className="font-semibold">Anaya Sharma</b> <span className="text-ink3">· UKG A</span></span></p> : <p className="text-ink3">None found</p>}</div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// October 2026 uses the hand-made record; earlier months come from the sample helpers
const OCT_CELL = { P: { tone: 'ok', title: 'Present' }, A: { tone: 'bad', title: 'Absent' }, L: { tone: 'warn', title: 'Late' }, H: { tone: 'info', title: 'Holiday: Gandhi Jayanti' }, W: { tone: 'muted', title: 'Sunday' }, F: { tone: 'muted', title: '' } };
const MARK = { present: 'ok', absent: 'bad', late: 'warn', leave: 'info', holiday: 'info', off: 'muted', future: 'muted' };
function octTotals() {
  const t = { present: 0, absent: 0, late: 0, leave: 0, school: 0 };
  OCT_ATT.forEach((d) => { const k = { P: 'present', A: 'absent', L: 'late' }[d.s]; if (k) { t[k]++; t.school++; } });
  t.pct = t.school ? Math.round(((t.present + t.late) / t.school) * 1000) / 10 : 0;
  return t;
}
function AttendanceTab({ s, featured }) {
  const seed = s.id;
  const cell = (y, m, d) => {
    if (y === 2026 && m === 9) { const c = OCT_CELL[OCT_ATT[d - 1].s]; return { tone: c.tone, title: c.title }; }
    const k = sampleMark(seed, y, m, d);
    return { tone: MARK[k.kind], title: k.title };
  };
  const totals = (y, m) => (y === 2026 && m === 9 ? octTotals() : monthTotals(seed, y, m));
  return (
    <div className="grid @xl:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
      <Card>
        <CardHead title="Month by month" sub="Use the arrows or pick a month to see earlier months" icon={I.CalendarDays} />
        <div className="px-5 pb-5">
          <CalendarMonth id={`stu-att-${s.id}`} cell={cell} footer={(y, m) => {
            const t = totals(y, m);
            return (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-[12.5px] text-ink2">
                  {[['bg-ok/15', 'Present'], ['bg-bad/15', 'Absent'], ['bg-warn/15', 'Late'], ['bg-info/10', 'Leave or holiday']].map(([c, l]) => <span key={l} className="flex items-center gap-1.5"><span className={cx('w-3 h-3 rounded', c)} />{l}</span>)}
                </div>
                <div className="flex items-center gap-3 flex-wrap rounded-xl bg-sunken/60 px-3.5 py-2.5 text-[13.5px] tnum">
                  <b className="font-semibold">{MONTH_NAMES[m]} {y}</b>
                  <span>{t.present} present</span><span>{t.absent} absent</span><span>{t.late} late</span>{t.leave > 0 && <span>{t.leave} leave</span>}
                  <Pill tone={t.pct < 85 ? 'warn' : 'ok'} className="ml-auto">{t.school ? `${t.pct}%` : 'No school days'}</Pill>
                </div>
              </div>
            );
          }} />
        </div>
      </Card>
      <Card>
        <CardHead title="This year" sub="1 Jun 2026 to today" />
        <div className="px-5 pb-5 flex items-center gap-5">
          <Ring value={s.att} size={96} stroke={10} tone="ok"><span className="font-display text-xl font-semibold tnum">{s.att}%</span></Ring>
          <ul className="text-[13.5px] flex flex-col gap-1.5 tnum">
            <li><b className="font-semibold">98</b> <span className="text-ink3">present</span></li>
            <li><b className="font-semibold">4</b> <span className="text-ink3">absent</span></li>
            <li><b className="font-semibold">2</b> <span className="text-ink3">late</span></li>
            <li><b className="font-semibold">1</b> <span className="text-ink3">approved leave</span></li>
          </ul>
        </div>
      </Card>
    </div>
  );
}

function FeesTab({ s }) {
  const { go } = useNav();
  const { role } = useRole();
  const total = FEE_ROWS.reduce((a, r) => a + r.amount, 0);
  const paid = FEE_ROWS.reduce((a, r) => a + r.paid, 0);
  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5 flex flex-col @md:flex-row @md:items-center gap-5">
        <Ring value={(paid / total) * 100} size={88} stroke={10}><span className="text-[15px] font-bold tnum">{Math.round((paid / total) * 100)}%</span></Ring>
        <div className="flex-1 grid grid-cols-3 gap-4">
          <div><p className="text-[12px] text-ink3 font-semibold">Year total</p><p className="text-[18px] font-semibold tnum">{inr(total)}</p></div>
          <div><p className="text-[12px] text-ink3 font-semibold">Paid</p><p className="text-[18px] font-semibold tnum text-ok">{inr(paid)}</p></div>
          <div><p className="text-[12px] text-ink3 font-semibold">Balance</p><p className="text-[18px] font-semibold tnum text-bad">{inr(total - paid)}</p></div>
        </div>
        {canDo(role, 'fees.collect') && <Button variant="primary" icon={I.IndianRupee} onClick={() => go('fees', { student: s.id })}>Collect fee</Button>}
      </Card>
      <Card className="overflow-hidden">
        <CardHead title="Installments" sub="Oldest first" />
        <div className="overflow-x-auto">
          <table className="w-full text-[14px] min-w-[560px]">
            <thead><tr className="text-[12px] text-ink3 text-left border-y border-line"><th className="px-5 py-2.5 font-semibold">Fee</th><th className="px-3 py-2.5 font-semibold">Due date</th><th className="px-3 py-2.5 font-semibold text-right">Amount</th><th className="px-3 py-2.5 font-semibold text-right">Paid</th><th className="px-5 py-2.5 font-semibold text-right">Status</th></tr></thead>
            <tbody>
              {FEE_ROWS.map((r) => (
                <tr key={r.id} className="border-b border-line/70 last:border-0">
                  <td className="px-5 py-3"><p className="font-semibold">{r.head}</p><p className="text-[12.5px] text-ink3">{r.inst}</p></td>
                  <td className="px-3 py-3 tnum">{r.due}</td>
                  <td className="px-3 py-3 text-right tnum">{inr(r.amount)}</td>
                  <td className="px-3 py-3 text-right tnum">{r.paid ? inr(r.paid) : '—'}</td>
                  <td className="px-5 py-3 text-right"><Pill tone={feeTone(r.status)}>{r.status}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ExamsTab({ s, subject }) {
  const toast = useToast();
  const rows = subject ? P.exams.filter((e) => e.sub === subject) : P.exams;
  const t1 = rows.reduce((a, e) => a + e.ut1, 0), t2 = rows.reduce((a, e) => a + e.ut2, 0), max = rows.length * 25;
  return (
    <Card className="overflow-hidden">
      <CardHead title={subject ? `${subject}, 2026–27` : 'Unit tests, 2026–27'} sub={subject ? `Only the subject you teach · UT1 ${t1}/${max} · UT2 ${t2}/${max}` : `UT1 ${t1}/${max} (${Math.round((t1 / max) * 100)}%) · UT2 ${t2}/${max} (${Math.round((t2 / max) * 100)}%)`}
        action={subject ? null : <Button size="sm" variant="secondary" icon={I.Download} onClick={() => toast({ title: 'Report card downloaded', body: `${s.name.replace(' ', '-')}-UT2.pdf` })}>Report card</Button>} />
      <ul className="px-5 pb-5 flex flex-col gap-3.5">
        {rows.map((e) => (
          <li key={e.sub} className="grid grid-cols-[110px_1fr_70px] @md:grid-cols-[150px_1fr_90px] items-center gap-3 text-[14px]">
            <span className="font-semibold truncate">{e.sub}</span>
            <span className="flex flex-col gap-1">
              <span className="h-2 rounded-full bg-sunken overflow-hidden"><span className="block h-full rounded-full bg-ink3/40" style={{ width: `${(e.ut1 / e.max) * 100}%` }} /></span>
              <span className="h-2 rounded-full bg-sunken overflow-hidden"><span className="block h-full rounded-full bg-brand" style={{ width: `${(e.ut2 / e.max) * 100}%` }} /></span>
            </span>
            <span className="text-right tnum text-[13px]"><span className="text-ink3">{e.ut1} →</span> <b className="font-semibold">{e.ut2}</b></span>
          </li>
        ))}
      </ul>
      <div className="flex gap-4 px-5 pb-4 text-[12.5px] text-ink2"><span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-ink3/40" />Unit Test 1</span><span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-brand" />Unit Test 2</span></div>
    </Card>
  );
}

const TYPE_TONE = { Incident: 'warn', Warning: 'bad', Suspension: 'bad', Reward: 'ok', Recognition: 'ok' };
function BehaviourTab({ s, list, caseOf, onReport }) {
  const pts = list.reduce((a, i) => a + i.pts, 0);
  return (
    <div className="flex flex-col gap-5">
      <Card className="overflow-hidden">
        <CardHead title="Incidents and rewards" sub={`${list.length} this year · ${pts > 0 ? '+' : ''}${pts} points`} icon={I.Medal}
          action={onReport ? <Button size="sm" variant="soft" icon={I.Plus} onClick={onReport}>Report incident</Button> : null} />
        {list.length ? (
          <ul className="divide-y divide-line/70 border-t border-line/70">
            {list.map((i) => (
              <li key={i.id + i.date} className="flex items-start gap-3 px-4 @md:px-5 py-3">
                <span className={cx('w-9 h-9 rounded-xl grid place-items-center shrink-0', i.pts > 0 ? 'bg-ok/10 text-ok' : 'bg-warn/12 text-warn')}>{i.pts > 0 ? <I.Trophy size={17} /> : <I.TriangleAlert size={17} />}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] leading-snug">{i.what}</p>
                  <p className="text-[12.5px] text-ink3 mt-0.5">{i.date} · reported by {i.by}{i.action && i.action !== '—' ? ` · ${i.action}` : ''}</p>
                </div>
                <Pill tone={TYPE_TONE[i.type]} className="shrink-0">{i.type}</Pill>
              </li>
            ))}
          </ul>
        ) : <Empty icon={I.Medal} title="Nothing recorded" body={`No incidents or rewards for ${s.name.split(' ')[0]} this year.`} />}
      </Card>
      {caseOf && (
        <Card>
          <CardHead title="Counselling" icon={I.Lock} />
          <p className="px-5 pb-5 text-[13.5px] text-ink3 italic flex items-center gap-1.5"><I.Lock size={13} className="shrink-0 not-italic" />Private: counselling notes stay with the counsellor, Sana Ali.</p>
        </Card>
      )}
    </div>
  );
}

/* Counsellor only: their own case for this student */
function CounsellingTab({ s, c }) {
  const { go } = useNav();
  if (!c) return <Card><Empty icon={I.HeartHandshake} title="No case for this student" body="Only students with a case given to you show here." /></Card>;
  return (
    <Card>
      <CardHead title={`Case ${c.id}`} sub={`Opened ${c.opened} · from ${c.from}`} icon={I.HeartHandshake}
        action={<Button size="sm" variant="ghost" iconRight={I.ChevronRight} onClick={() => go('students', { page: 'behaviour' })}>My cases</Button>} />
      <div className="px-5 pb-5 flex flex-col gap-4">
        <div className="rounded-xl bg-brand/8 px-3.5 py-2.5 flex items-center gap-2.5 text-[13px]"><I.Lock size={15} className="text-brand shrink-0" /><span className="text-ink2"><b className="font-semibold text-ink">Highly restricted.</b> Only you can read this. Others see “Private”.</span></div>
        <div className="grid @md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-line p-3.5"><p className="text-[12px] text-ink3 font-semibold">Next session</p><p className="font-semibold text-[15px] tnum">{c.next || 'None, case closed'}</p></div>
          <div className="rounded-xl border border-line p-3.5"><p className="text-[12px] text-ink3 font-semibold">Outside referral</p><p className="text-[14px]">{c.referral || 'None'}</p></div>
        </div>
        <div><p className="text-[13px] font-semibold text-ink2 mb-1.5">Confidential notes</p><p className="rounded-xl bg-sunken/70 p-3.5 text-[14px] leading-relaxed">{c.notes}</p></div>
        <div><p className="text-[13px] font-semibold text-ink2 mb-1.5">Action plan</p><p className="text-[14px] leading-relaxed">{c.plan}</p></div>
        <div><p className="text-[13px] font-semibold text-ink2 mb-2">Sessions</p>
          <ol className="flex flex-col gap-2">{c.sessions.map(([when, what]) => <li key={when} className="rounded-xl border border-line px-3.5 py-2.5"><p className="text-[14px]">{what}</p><p className="text-[12px] text-ink3 mt-0.5">{when}</p></li>)}</ol>
        </div>
      </div>
    </Card>
  );
}

function DocsTab({ edit }) {
  const toast = useToast();
  return (
    <Card>
      <CardHead title="Documents" sub="5 of 6 collected" action={edit ? <Button size="sm" variant="soft" icon={I.Upload} onClick={() => toast({ title: 'Choose a file or take a photo', tone: 'info' })}>Upload</Button> : null} />
      <ul className="px-3 pb-3">
        {P.docs.map((d) => (
          <li key={d.name} className="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-sunken/60">
            <span className={cx('w-10 h-10 rounded-xl grid place-items-center shrink-0', d.ok ? 'bg-sunken text-ink2' : 'bg-warn/12 text-warn')}>{d.ok ? <I.FileText size={19} /> : <I.FileWarning size={19} />}</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[14px] truncate">{d.name}</p>
              <p className="text-[12.5px] text-ink3">{d.ok ? `${d.kind} · ${d.size} · added ${d.date}` : 'Not collected yet'}</p>
            </div>
            {d.ok ? <Button size="sm" variant="ghost" icon={I.Eye} onClick={() => toast({ title: `Opening ${d.name}`, tone: 'info' })}>View</Button>
              : edit ? <Button size="sm" variant="secondary" icon={I.Upload} onClick={() => toast({ title: 'Ask the parent on WhatsApp?', body: 'A request with an upload link can go out now', tone: 'info' })}>Add</Button> : <Pill tone="warn">Missing</Pill>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TimelineTab({ hide = [] }) {
  const ic = { att: I.CalendarCheck2, msg: I.MessageCircle, exam: I.Award, award: I.Trophy, fee: I.IndianRupee, promo: I.ArrowUpRight };
  const items = P.timeline.filter((t) => !hide.includes(t.kind));
  return (
    <Card className="p-5">
      <ol className="flex flex-col">
        {items.map((t, i) => {
          const Ic = ic[t.kind];
          return (
            <li key={i} className="grid grid-cols-[36px_1fr] gap-3">
              <span className="flex flex-col items-center">
                <span className="w-9 h-9 rounded-full bg-sunken text-ink2 grid place-items-center"><Ic size={16} /></span>
                {i < items.length - 1 && <span className="w-px flex-1 bg-line my-1" />}
              </span>
              <div className="pb-5 pt-1.5">
                <p className="text-[14.5px] leading-snug">{t.what}</p>
                <p className="text-[12.5px] text-ink3 mt-0.5">{t.when}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
