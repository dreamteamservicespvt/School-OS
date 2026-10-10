import React, { useEffect, useMemo, useState } from 'react';
import * as I from './icons.js';
import { STUDENTS, CLASSES, FEATURED, STUDENT_PROFILE as P, FEE_ROWS, OCT_ATT, inr } from './data.js';
import { cx, Card, CardHead, Button, Pill, Avatar, Checkbox, Input, Field, Segmented, Tabs, Ring, Empty, Skel, Sheet, PageHead, useToast, feeTone, inputCls } from './ui.jsx';
import { useNav, useRole } from './shell.jsx';
import { ModuleHead, useCanEdit, usePage } from './kit.jsx';

// Which students a role sees in the list: teachers their own classes, the class teacher their section, the warden the boarders
export function studentScope(roleId) {
  if (roleId === 'teacher') return { list: STUDENTS.filter((s) => ['6', '7'].includes(s.clsId) && ['A', 'B'].includes(s.sec)), note: 'Your classes: 6 A, 6 B, 7 A, 7 B' };
  if (roleId === 'classteacher') return { list: STUDENTS.filter((s) => s.clsId === '7' && s.sec === 'B'), note: 'Your class: 7 B' };
  if (roleId === 'warden') return { list: STUDENTS.filter((s, i) => Number(s.clsId) >= 6 && !s.girl && i % 3 === 0), note: 'Boarders in the boys’ hostel' };
  return { list: STUDENTS, note: null };
}

export const StudentListPage = ({ onAddStudent }) => <Students onAddStudent={onAddStudent} />;

/* ======================= Student List ======================= */
export function Students({ onAddStudent }) {
  const { go } = useNav();
  const toast = useToast();
  const { role } = useRole();
  const { access } = usePage();
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

  const counts = useMemo(() => {
    const m = {};
    POOL.forEach((s) => (m[s.clsId] = (m[s.clsId] || 0) + 1));
    return m;
  }, [POOL]);
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return POOL.filter((s) =>
      (cls === 'all' || s.clsId === cls) && (sec === 'all' || s.sec === sec) &&
      (fee === 'all' || (fee === 'dues' ? s.due > 0 : s.feeState === 'Overdue')) &&
      (!t || s.name.toLowerCase().includes(t) || s.adm.toLowerCase().includes(t) || s.father.toLowerCase().includes(t) || s.phone.replace(' ', '').includes(t.replace(/\s/g, '')))
    ).sort((a, b) => (a.clsId === b.clsId ? a.sec.localeCompare(b.sec) || a.roll - b.roll : 0));
  }, [cls, sec, q, fee, POOL]);
  const shown = rows.slice(0, limit);
  const curClass = CLASSES.find((c) => c.id === cls);
  const allOn = shown.length > 0 && shown.every((s) => sel.has(s.id));
  const toggle = (id) => setSel((x) => { const n = new Set(x); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clear = () => { setQ(''); setCls('all'); setSec('all'); setFee('all'); };

  return (
    <div>
      <ModuleHead title="Students" sub={scope.note ? `${scope.note} · ${POOL.length} students` : `${STUDENTS.length} studying in 2026–27 · example records`}
        actions={access === 'full' && <>
          <Button variant="secondary" icon={I.Upload} className="hidden @md:inline-flex" onClick={() => toast({ title: 'Import from Excel', body: 'Pick a file. We check every row before adding anything.', tone: 'info' })}>Import</Button>
          <Button variant="secondary" icon={I.Download} className="hidden @md:inline-flex" onClick={() => toast({ title: `Exported ${rows.length} students`, body: 'students-2026-27.xlsx is ready in Downloads' })}>Export</Button>
          <Button variant="primary" icon={I.UserPlus} onClick={onAddStudent}>Add student</Button>
        </>} />

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
                <span className={cx('text-[11.5px] tnum', on ? 'opacity-70' : 'text-ink3')}>{c.id === 'all' ? POOL.length : counts[c.id] || 0}</span>
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
            <input id="student-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, admission no., parent name or phone"
              className={cx(inputCls(false), 'pl-10')} />
            {q && <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 grid place-items-center rounded-lg text-ink3 hover:bg-sunken" aria-label="Clear search"><I.X size={16} /></button>}
          </div>
          <Segmented value={fee} onChange={setFee} options={[{ value: 'all', label: 'Everyone' }, { value: 'dues', label: 'Has dues' }, { value: 'over', label: 'Overdue' }]} />
        </div>

        {/* Bulk bar */}
        {sel.size > 0 && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-brand/8 border-b border-brand/20 animate-fade flex-wrap">
            <p className="text-[13.5px] font-semibold text-brand mr-2">{sel.size} selected</p>
            <Button size="sm" variant="secondary" icon={I.Send} onClick={() => { toast({ title: `Message ready for ${sel.size} families`, body: 'Opening Send message…', tone: 'info' }); }}>Message parents</Button>
            <Button size="sm" variant="secondary" icon={I.IdCard} onClick={() => toast({ title: `${sel.size} ID cards ready to print` })}>ID cards</Button>
            <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>Clear</Button>
          </div>
        )}

        {loading ? (
          <div className="p-4 flex flex-col gap-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="flex gap-3 items-center"><Skel className="w-10 h-10 !rounded-full" /><div className="flex-1 flex flex-col gap-2"><Skel className="h-3.5 w-1/3" /><Skel className="h-3 w-1/2" /></div></div>)}</div>
        ) : rows.length === 0 ? (
          <Empty icon={I.SearchX} title="No students match" body={q ? `Nobody called “${q}” in ${curClass ? curClass.name : 'any class'}. Try the admission number or the parent's phone.` : 'Try a different class or fee filter.'}
            action={<Button variant="secondary" onClick={clear}>Clear filters</Button>} />
        ) : (
          <>
            {/* Computer: table */}
            <div className="hidden @lg:block overflow-x-auto">
              <table className="w-full text-left text-[14px]">
                <thead>
                  <tr className="text-[12px] text-ink3 font-semibold border-b border-line">
                    <th className="pl-4 pr-2 py-3 w-10"><Checkbox label="Select all" checked={allOn} indeterminate={!allOn && shown.some((s) => sel.has(s.id))} onChange={() => setSel(allOn ? new Set() : new Set(shown.map((s) => s.id)))} /></th>
                    <th className="px-3 py-3">Student</th>
                    <th className="px-3 py-3">Class</th>
                    <th className="px-3 py-3">Parent</th>
                    <th className="px-3 py-3">Attendance</th>
                    <th className="px-3 py-3">Fees</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((s) => (
                    <tr key={s.id} onClick={() => go('student', { id: s.id })} className={cx('border-b border-line/70 last:border-0 cursor-pointer transition group', sel.has(s.id) ? 'bg-brand/5' : 'hover:bg-sunken/60')}>
                      <td className="pl-4 pr-2 py-3"><Checkbox label={`Select ${s.name}`} checked={sel.has(s.id)} onChange={() => toggle(s.id)} /></td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-3">
                          <Avatar name={s.name} size={38} />
                          <div className="min-w-0">
                            <p className="font-semibold leading-tight flex items-center gap-2">{s.name}{s.status !== 'Active' && <Pill tone={s.status === 'New' ? 'info' : 'neutral'} className="!h-5 !text-[11px]">{s.status}</Pill>}</p>
                            <p className="text-[12.5px] text-ink3 font-mono">{s.adm}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap"><span className="font-medium">{s.cls} {s.sec}</span><span className="text-ink3 text-[12.5px]"> · Roll {s.roll}</span></td>
                      <td className="px-3 py-2.5"><p className="leading-tight">{s.father}</p><p className="text-[12.5px] text-ink3 tnum">{s.phone}</p></td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5 w-28">
                          <span className="flex-1 h-1.5 rounded-full bg-sunken overflow-hidden"><span className={cx('block h-full rounded-full', s.att < 85 ? 'bg-warn' : 'bg-ok')} style={{ width: `${s.att}%` }} /></span>
                          <span className={cx('text-[13px] font-semibold tnum', s.att < 85 && 'text-warn')}>{s.att}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">{s.due ? <Pill tone={feeTone(s.feeState)}>{inr(s.due)} {s.feeState === 'Overdue' ? 'overdue' : 'due'}</Pill> : <Pill tone="ok" dot>Paid</Pill>}</td>
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
                      <p className="text-[13px] text-ink3 truncate">{s.cls} {s.sec} · Roll {s.roll} · {s.father}</p>
                      <div className="flex gap-1.5 mt-1.5">
                        {s.due ? <Pill tone={feeTone(s.feeState)} className="!h-[22px] !text-[11.5px]">{inr(s.due)} {s.feeState === 'Overdue' ? 'overdue' : 'due'}</Pill> : <Pill tone="ok" className="!h-[22px] !text-[11.5px]">Fees paid</Pill>}
                        <Pill tone={s.att < 85 ? 'warn' : 'neutral'} className="!h-[22px] !text-[11.5px]">{s.att}% present</Pill>
                      </div>
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
export function StudentProfile({ id }) {
  const { go } = useNav();
  const toast = useToast();
  const base = STUDENTS.find((s) => s.id === id) || FEATURED;
  const s = base.id === FEATURED.id ? FEATURED : base;
  const featured = s.id === FEATURED.id;
  const [tab, setTab] = useState('overview');
  const [more, setMore] = useState(false);
  const docsDone = P.docs.filter((d) => d.ok).length;
  const { role } = useRole();
  const acc = role.access;
  // Which profile tabs each role may open (05-roles.md): the accountant sees fees, front desk and library only the overview
  const TABS = { accountant: ['overview', 'fees'], receptionist: ['overview'], librarian: ['overview'], gatesecurity: ['overview'], admissioncounsellor: ['overview', 'documents'] }[role.id]
    || (acc.fees ? ['overview', 'attendance', 'fees', 'exams', 'documents', 'timeline'] : ['overview', 'attendance', 'exams', 'documents', 'timeline']);
  const canCollect = acc.fees === 'full';
  const canAdmin = acc.students === 'full';

  return (
    <div>
      <button onClick={() => go('students')} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink mb-3 -ml-1 h-8 px-1 rounded-lg">
        <I.ArrowLeft size={17} />Students <span className="text-ink3 font-normal">/ {s.cls} {s.sec}</span>
      </button>

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
              </div>
              <p className="text-[13.5px] text-ink3 mt-0.5">{s.cls} {s.sec} · Roll {s.roll} · <span className="font-mono text-[12.5px]">{s.adm}</span>{featured && ` · ${P.house}`}</p>
            </div>
          </div>
          <div className="flex gap-2 relative">
            {canCollect && <Button variant="primary" icon={I.IndianRupee} className="flex-1 @lg:flex-none" onClick={() => go('fees', { student: s.id })}>Collect fee</Button>}
            {acc.communication && <Button variant={canCollect ? 'secondary' : 'primary'} icon={I.MessageCircle} className="flex-1 @lg:flex-none" onClick={() => toast({ title: `Message to ${s.father}`, body: 'Opening WhatsApp message with the school template', tone: 'info' })}>Message<span className="hidden @sm:inline">&nbsp;parent</span></Button>}
            {canAdmin && <Button variant="secondary" icon={I.Ellipsis} aria-label="More actions" onClick={() => setMore(!more)} className="!px-3" />}
            {more && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMore(false)} />
                <div className="absolute right-0 top-12 z-40 w-56 bg-surface border border-line rounded-2xl shadow-pop p-1.5 animate-rise">
                  {[[I.IdCard, 'Print ID card'], [I.FileText, 'Bonafide certificate'], [I.FileOutput, 'Transfer certificate (TC)'], [I.ArrowRightLeft, 'Change section'], [I.Pencil, 'Edit details']].map(([Ic, l]) => (
                    <button key={l} onClick={() => { setMore(false); toast({ title: l, body: `For ${s.name}`, tone: 'info' }); }} className="w-full flex items-center gap-2.5 h-10 px-3 rounded-xl hover:bg-sunken text-[14px] text-left"><Ic size={17} className="text-ink3" />{l}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        {/* Summary strip */}
        <div className="grid grid-cols-2 @md:grid-cols-3 @xl:grid-cols-6 border-t border-line">
          {[
            { k: 'Attendance', v: `${s.att}%`, sub: 'This year', tone: s.att < 85 ? 'warn' : 'ok', icon: I.CalendarCheck2, tab: 'attendance' },
            { k: 'Exam average', v: '87%', sub: 'Unit Test 2', tone: 'ok', icon: I.Award, tab: 'exams' },
            { k: 'Fees', v: s.due ? inr(s.due) : 'Paid', sub: s.due ? (s.feeState === 'Overdue' ? 'Overdue' : 'Due') : 'Nothing due', tone: s.due ? feeTone(s.feeState) : 'ok', icon: I.IndianRupee, tab: 'fees' },
            { k: 'Transport', v: 'Route 4', sub: 'KPHB 6th Phase', icon: I.Bus },
            { k: 'Documents', v: `${docsDone} of ${P.docs.length}`, sub: '1 missing', tone: 'warn', icon: I.FolderOpen, tab: 'documents' },
            { k: 'Library', v: '1 book', sub: 'Due 14 Oct', icon: I.BookOpen },
          ].map((m, i) => (
            <button key={m.k} onClick={() => m.tab && setTab(m.tab)} disabled={!m.tab || !TABS.includes(m.tab)}
              className={cx('text-left px-4 @md:px-5 py-3.5 border-line enabled:hover:bg-sunken/60 transition', 'border-b @xl:border-b-0', i % 2 === 0 && 'border-r', '@md:border-r @xl:border-r', i === 5 && '@xl:border-r-0')}>
              <p className="text-[12px] text-ink3 font-semibold flex items-center gap-1.5"><m.icon size={14} />{m.k}</p>
              <p className={cx('font-semibold text-[17px] tnum mt-0.5', m.tone === 'bad' && 'text-bad', m.tone === 'warn' && m.k !== 'Documents' && 'text-warn')}>{m.v}</p>
              <p className="text-[12px] text-ink3">{m.sub}</p>
            </button>
          ))}
        </div>
      </Card>

      <Tabs className="mt-5" value={tab} onChange={setTab} tabs={[
        { id: 'overview', label: 'Overview' }, { id: 'attendance', label: 'Attendance' }, { id: 'fees', label: 'Fees' },
        { id: 'exams', label: 'Exams' }, { id: 'documents', label: 'Documents' }, { id: 'timeline', label: 'Timeline' },
      ].filter((t) => TABS.includes(t.id))} />

      <div className="mt-5 animate-rise" key={tab}>
        {tab === 'overview' && <Overview s={s} featured={featured} />}
        {tab === 'attendance' && <AttendanceTab s={s} />}
        {tab === 'fees' && <FeesTab s={s} />}
        {tab === 'exams' && <ExamsTab />}
        {tab === 'documents' && <DocsTab />}
        {tab === 'timeline' && <TimelineTab />}
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
const EditBtn = ({ what }) => {
  const toast = useToast();
  return <button onClick={() => toast({ title: `Editing ${what}`, body: 'Each section saves on its own. No long forms.', tone: 'info' })} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand h-8 px-2 rounded-lg hover:bg-brand/8"><I.Pencil size={14} />Edit</button>;
};

function Overview({ s, featured }) {
  return (
    <div className="grid @xl:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
      <div className="flex flex-col gap-5 min-w-0">
        <Card>
          <CardHead title="Personal details" action={<EditBtn what="personal details" />} />
          <DL rows={[['Date of birth', featured ? `${P.dob} (${P.age} years)` : '22 August 2015'], ['Gender', s.girl ? 'Girl' : 'Boy'], ['Blood group', P.blood], ['Admitted on', P.admitted], ['Home address', P.address], ['House', P.house]]} />
        </Card>
        <Card>
          <CardHead title="Parents" sub="Fee receipts and Parent Link go to the mother's number" action={<EditBtn what="parents" />} />
          <div className="grid @sm:grid-cols-2 gap-3 px-5 pb-5">
            {[{ n: s.father, r: 'Father', p: s.phone, j: P.fatherJob }, { n: featured ? P.mother : `Lakshmi ${s.last}`, r: 'Mother · Parent Link', p: P.motherPhone, j: 'Teacher' }].map((g) => (
              <div key={g.r} className="rounded-xl border border-line p-3.5 flex items-start gap-3">
                <Avatar name={g.n} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[14.5px] leading-tight">{g.n}</p>
                  <p className="text-[12.5px] text-ink3">{g.r} · {g.j}</p>
                  <p className="text-[14px] tnum mt-1.5 select-all">+91 {g.p}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHead title="Emergency contacts" sub="Called in this order" action={<EditBtn what="emergency contacts" />} />
          <ol className="px-5 pb-4">
            {P.emergency.map((e, i) => (
              <li key={e.name} className="flex items-center gap-3 py-2 border-b border-line/70 last:border-0">
                <span className="w-6 h-6 rounded-full bg-sunken text-[12px] font-bold grid place-items-center tnum">{i + 1}</span>
                <span className="flex-1 min-w-0 text-[14px]"><b className="font-semibold">{e.name}</b> <span className="text-ink3">· {e.rel}</span></span>
                <span className="text-[14px] tnum select-all">{e.phone}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
      <div className="flex flex-col gap-5 min-w-0">
        <Card>
          <CardHead title="Today" icon={I.Sun} />
          <ul className="px-5 pb-5 flex flex-col gap-3 text-[14px]">
            <li className="flex gap-3"><I.CircleCheck size={18} className="text-ok shrink-0 mt-0.5" /><span><b className="font-semibold">Present</b> · marked 8:52 AM by Ravi Teja</span></li>
            <li className="flex gap-3"><I.Clock size={18} className="text-ink3 shrink-0 mt-0.5" /><span>Now: <b className="font-semibold">Science</b>, period 3 (10:30–11:15)</span></li>
            <li className="flex gap-3"><I.NotebookPen size={18} className="text-ink3 shrink-0 mt-0.5" /><span>Homework due: Maths, exercise 4.2</span></li>
            <li className="flex gap-3"><I.IndianRupee size={18} className="text-bad shrink-0 mt-0.5" /><span>Tuition Q3 due tomorrow, plus ₹10,950 overdue</span></li>
          </ul>
        </Card>
        <Card className="border-brand/25">
          <CardHead title="Suggestions" sub="From marks and attendance. Nothing changes on the record." icon={I.Sparkles} />
          <ul className="px-5 pb-4 flex flex-col gap-3 text-[14px] leading-relaxed">
            <li><b className="font-semibold">Strong in Maths:</b> 24 and 25 of 25 in both unit tests. Consider the Maths Olympiad.</li>
            <li><b className="font-semibold">Social Studies is lowest</b> at 17 of 25 in UT1, improving to 20 in UT2.</li>
          </ul>
          <div className="px-5 pb-4 text-[12px] text-ink3">Based on Unit Test 1 and 2 marks, attendance Apr–Oct</div>
        </Card>
      </div>
    </div>
  );
}

function AttendanceTab({ s }) {
  const C = { P: 'bg-ok/15 text-ok', A: 'bg-bad/15 text-bad', L: 'bg-warn/15 text-warn', H: 'bg-info/10 text-info', W: 'text-ink3/60', F: 'text-ink3/60' };
  const lead = (new Date(2026, 9, 1).getDay() + 6) % 7;
  return (
    <div className="grid @xl:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
      <Card>
        <CardHead title="October 2026" sub="7 of 7 school days present so far" action={<Pill tone="ok">100% this month</Pill>} />
        <div className="px-5 pb-5">
          <div className="grid grid-cols-7 gap-1.5 text-center text-[11.5px] font-semibold text-ink3 mb-1.5">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <span key={d}>{d}</span>)}</div>
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: lead }).map((_, i) => <span key={'x' + i} />)}
            {OCT_ATT.map((d) => (
              <span key={d.d} title={{ P: 'Present', A: 'Absent', L: 'Late', H: 'Holiday: Gandhi Jayanti', W: 'Sunday', F: '' }[d.s]}
                className={cx('aspect-square rounded-xl grid place-items-center text-[13.5px] font-semibold tnum max-h-14', C[d.s], d.d === 9 && 'ring-2 ring-brand')}>
                {d.d}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 text-[12.5px] text-ink2">
            {[['bg-ok/15', 'Present'], ['bg-bad/15', 'Absent'], ['bg-warn/15', 'Late'], ['bg-info/10', 'Holiday']].map(([c, l]) => <span key={l} className="flex items-center gap-1.5"><span className={cx('w-3 h-3 rounded', c)} />{l}</span>)}
          </div>
        </div>
      </Card>
      <Card>
        <CardHead title="This year" />
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
        {useRole().role.access.fees === 'full' && <Button variant="primary" icon={I.IndianRupee} onClick={() => go('fees', { student: s.id })}>Collect fee</Button>}
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

function ExamsTab() {
  const toast = useToast();
  const t1 = P.exams.reduce((a, e) => a + e.ut1, 0), t2 = P.exams.reduce((a, e) => a + e.ut2, 0), max = P.exams.length * 25;
  return (
    <Card className="overflow-hidden">
      <CardHead title="Unit tests, 2026–27" sub={`UT1 ${t1}/${max} (${Math.round((t1 / max) * 100)}%) · UT2 ${t2}/${max} (${Math.round((t2 / max) * 100)}%)`}
        action={<Button size="sm" variant="secondary" icon={I.Download} onClick={() => toast({ title: 'Report card downloaded', body: 'Aarav-Sharma-UT2.pdf' })}>Report card</Button>} />
      <ul className="px-5 pb-5 flex flex-col gap-3.5">
        {P.exams.map((e) => (
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

function DocsTab() {
  const toast = useToast();
  return (
    <Card>
      <CardHead title="Documents" sub="5 of 6 collected" action={<Button size="sm" variant="soft" icon={I.Upload} onClick={() => toast({ title: 'Choose a file or take a photo', tone: 'info' })}>Upload</Button>} />
      <ul className="px-3 pb-3">
        {P.docs.map((d) => (
          <li key={d.name} className="flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-sunken/60">
            <span className={cx('w-10 h-10 rounded-xl grid place-items-center shrink-0', d.ok ? 'bg-sunken text-ink2' : 'bg-warn/12 text-warn')}>{d.ok ? <I.FileText size={19} /> : <I.FileWarning size={19} />}</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[14px] truncate">{d.name}</p>
              <p className="text-[12.5px] text-ink3">{d.ok ? `${d.kind} · ${d.size} · added ${d.date}` : 'Not collected yet'}</p>
            </div>
            {d.ok ? <Button size="sm" variant="ghost" icon={I.Eye} onClick={() => toast({ title: `Opening ${d.name}`, tone: 'info' })}>View</Button>
              : <Button size="sm" variant="secondary" icon={I.Upload} onClick={() => toast({ title: 'Ask the parent on WhatsApp?', body: 'A request with an upload link can go out now', tone: 'info' })}>Add</Button>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TimelineTab() {
  const ic = { att: I.CalendarCheck2, msg: I.MessageCircle, exam: I.Award, award: I.Trophy, fee: I.IndianRupee, promo: I.ArrowUpRight };
  return (
    <Card className="p-5">
      <ol className="flex flex-col">
        {P.timeline.map((t, i) => {
          const Ic = ic[t.kind];
          return (
            <li key={i} className="grid grid-cols-[36px_1fr] gap-3">
              <span className="flex flex-col items-center">
                <span className="w-9 h-9 rounded-full bg-sunken text-ink2 grid place-items-center"><Ic size={16} /></span>
                {i < P.timeline.length - 1 && <span className="w-px flex-1 bg-line my-1" />}
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
