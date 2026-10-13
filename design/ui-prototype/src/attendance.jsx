import React, { useMemo, useState } from 'react';
import * as I from './icons.js';
import { CLASS_7B } from './data.js';
import { cx, Card, CardHead, Button, Pill, Avatar, Sheet, Empty, Field, Segmented, useToast } from './ui.jsx';
import { ModuleHead, Legend, CalendarMonth, MONTH_NAMES, MARK_TONE, schoolDay, sampleMark, usePage, Textarea, Banner } from './kit.jsx';
import { useRole } from './shell.jsx';

const ST = {
  P: { label: 'Present', short: 'P', on: 'bg-ok text-surface border-ok', soft: 'text-ok' },
  A: { label: 'Absent', short: 'A', on: 'bg-bad text-surface border-bad', soft: 'text-bad' },
  L: { label: 'Late', short: 'L', on: 'bg-warn text-surface border-warn', soft: 'text-warn' },
  V: { label: 'Leave', short: 'Leave', on: 'bg-info/15 text-info border-info/30', soft: 'text-info' },
};

// People who look after the whole school (Principal, Vice Principal, School Admin, Academic Head) rather than one class
const useOversight = () => usePage().moduleAccess !== 'own';
const AttHead = () => {
  const { role } = useRole();
  const over = useOversight();
  const sub = role.id === 'teacher' ? 'Class 7 B · Period 2, Mathematics · Friday, 9 October · Imran Shaikh'
    : over ? `Whole school · Friday, 9 October · ${43 - NOT_MARKED.length} of 43 sections marked by 10:44 AM` : 'Class 7 B · Friday, 9 October · Class teacher Ravi Teja';
  return <ModuleHead title="Attendance" sub={sub} />;
};
// Sections whose attendance is not taken yet today (Fri 9 Oct, 10:44 AM). The same three show on Attendance Reports.
export const NOT_MARKED = [
  { cls: '8 A', n: 36, ct: 'Venkat Rao', note: 'Class teacher · Period 3 now, in 8 A' },
  { cls: '10 C', n: 30, ct: 'Farhana Begum', note: 'Class teacher · on exam duty in the hall' },
  { cls: '3 A', n: 28, ct: 'Kalyani Sastry', note: 'Covering for Sravanthi Rao, on medical leave' },
];
export const ATTENDANCE_BASE = {
  take: () => <div><AttHead /><Take /></div>,
  register: () => <div><AttHead /><Register /></div>,
};

function Take() {
  const toast = useToast();
  const initial = () => Object.fromEntries(CLASS_7B.map((s) => [s.id, s.roll === 23 ? 'V' : 'P']));
  const [marks, setMarks] = useState(initial);
  const [q, setQ] = useState('');
  const [saved, setSaved] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState(null);
  const [notes, setNotes] = useState({});
  const counts = useMemo(() => Object.values(marks).reduce((a, v) => ((a[v] = (a[v] || 0) + 1), a), {}), [marks]);
  const set = (id, v) => { setMarks((m) => ({ ...m, [id]: v })); setSaved(null); };
  const list = CLASS_7B.filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()) || String(s.roll) === q.trim());
  const changed = CLASS_7B.some((s) => marks[s.id] !== initial()[s.id]);

  const save = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setSaved('10:44 AM');
      const a = counts.A || 0;
      toast({ title: 'Attendance saved for Class 7 B', body: a ? `Parents of ${a} absent ${a === 1 ? 'student' : 'students'} get a WhatsApp message now.` : 'Everyone is in today.' });
    }, 800);
  };

  return (
    <div className="pb-24 relative">
      {/* Status banner */}
      <div className={cx('rounded-2xl px-4 py-3 flex items-center gap-3 mb-4 text-[14px]', saved ? 'bg-ok/10 text-ok' : 'bg-info/8 text-info')}>
        {saved ? <I.CircleCheck size={19} className="shrink-0" /> : <I.Info size={19} className="shrink-0" />}
        <p className="text-ink2">
          {saved ? <><b className="font-semibold text-ink">Saved at {saved}.</b> You can change it until 11:00 AM.</> : <><b className="font-semibold text-ink">Everyone starts as present.</b> Tap only the students who are absent or late.</>}
        </p>
      </div>

      {/* Counts + tools */}
      <div className="flex flex-col @md:flex-row gap-3 @md:items-center mb-4">
        <div className="grid grid-cols-4 gap-2 flex-1">
          {['P', 'A', 'L', 'V'].map((k) => (
            <div key={k} className="rounded-xl bg-surface border border-line px-3 py-2.5">
              <p className={cx('font-display text-[22px] font-semibold tnum leading-none', ST[k].soft)}>{counts[k] || 0}</p>
              <p className="text-[12px] text-ink3 font-semibold mt-1">{ST[k].label}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1 @md:w-56">
            <I.Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink3" />
            <input id="att-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or roll no." className="h-11 w-full rounded-xl bg-surface border border-line pl-9 pr-3 text-[14.5px] outline-none focus:border-brand focus:ring-4 focus:ring-brand/15" />
          </div>
          <Button variant="secondary" icon={I.CheckCheck} disabled={!changed} onClick={() => setConfirm(true)}>All present</Button>
        </div>
      </div>

      {/* Students */}
      <ul className="grid grid-cols-1 @xl:grid-cols-2 gap-2">
        {list.map((s) => {
          const v = marks[s.id];
          const leave = v === 'V';
          return (
            <li key={s.id} className={cx('min-w-0 flex items-center gap-2.5 @md:gap-3 rounded-2xl border bg-surface px-3 py-2.5 transition',
              v === 'A' ? 'border-bad/40 bg-bad/[.04]' : v === 'L' ? 'border-warn/40 bg-warn/[.04]' : 'border-line')}>
              <span className="w-6 text-center text-[13px] font-semibold text-ink3 tnum shrink-0">{s.roll}</span>
              <Avatar name={s.name} size={36} className="hidden @sm:inline-grid" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[14.5px] truncate">{s.name}</p>
                <p className="text-[12px] text-ink3 truncate">
                  {leave ? 'On approved leave · fever' : notes[s.id] ? notes[s.id] : <button onClick={() => setNote(s)} className="hover:text-brand">Add note</button>}
                </p>
              </div>
              {leave ? <Pill tone="info">Leave</Pill> : (
                <div className="flex gap-1" role="radiogroup" aria-label={`Attendance for ${s.name}`}>
                  {['P', 'A', 'L'].map((k) => (
                    <button key={k} role="radio" aria-checked={v === k} aria-label={ST[k].label} onClick={() => set(s.id, k)}
                      className={cx('w-10 h-10 @md:w-11 @md:h-11 rounded-xl border text-[14px] font-bold transition', v === k ? ST[k].on : 'border-line text-ink3 hover:border-ink3/60 hover:text-ink')}>
                      {ST[k].short}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {list.length === 0 && <p className="text-center text-ink3 py-10">No student called “{q}” in Class 7 B.</p>}

      {/* Save bar */}
      <div className="sticky bottom-0 mt-4 -mx-4 @md:mx-0 px-4 @md:px-0 pb-3 pt-3 bg-gradient-to-t from-bg via-bg to-bg/0">
        <Button variant="primary" size="lg" className="w-full !h-14 !text-[16px] shadow-pop" icon={saved ? I.Check : I.Save} loading={saving} onClick={save} disabled={!!saved}>
          {saving ? 'Saving…' : saved ? 'Saved' : `Save attendance: ${counts.P || 0} present, ${counts.A || 0} absent${counts.L ? `, ${counts.L} late` : ''}`}
        </Button>
      </div>

      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Mark everyone present again?" sub="The absent and late marks you made will be cleared. Students on leave stay on leave."
        footer={<><Button variant="ghost" onClick={() => setConfirm(false)}>Keep my marks</Button><Button variant="primary" onClick={() => { setMarks(initial()); setSaved(null); setConfirm(false); }}>Mark all present</Button></>}>
        <div />
      </Sheet>

      <NoteSheet s={note} onClose={() => setNote(null)} onSave={(t) => { setNotes({ ...notes, [note.id]: t }); setNote(null); }} />
    </div>
  );
}

function NoteSheet({ s, onClose, onSave }) {
  const [t, setT] = useState('');
  if (!s) return null;
  return (
    <Sheet open={!!s} onClose={onClose} title={`Note for ${s.name}`} sub="Only staff can see this"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!t.trim()} onClick={() => { onSave(t.trim()); setT(''); }}>Save note</Button></>}>
      <div className="flex flex-wrap gap-2 mb-3">
        {['Came at 9:20', 'Doctor visit', 'Left early, parent picked up', 'No uniform'].map((x) => (
          <button key={x} onClick={() => setT(x)} className="h-8 px-3 rounded-full bg-sunken text-[13px] font-medium hover:bg-line">{x}</button>
        ))}
      </div>
      <textarea id="att-note" value={t} onChange={(e) => setT(e.target.value)} rows={3} placeholder="Type a short note"
        className="w-full rounded-xl bg-surface border border-line p-3 text-[15px] outline-none focus:border-brand focus:ring-4 focus:ring-brand/15" />
    </Sheet>
  );
}

// Months the register can show: June 2025 (last school year) to this month
const REG_MONTHS = [];
for (let k = 2026 * 12 + 9; k >= 2025 * 12 + 5; k--) REG_MONTHS.push({ value: String(k), label: `${MONTH_NAMES[k % 12]} ${Math.floor(k / 12)}` });
const KIND_CODE = { present: 'P', absent: 'A', late: 'L', leave: 'V', holiday: 'H' };
const CODE_KIND = { P: 'present', A: 'absent', L: 'late', V: 'leave', H: 'holiday' };
// October 2026 keeps the hand-made marks; other months come from the shared example helper
const octMark = (s, d) => {
  if (d === 2) return 'H';
  const h = (s.roll * 7 + d * 13) % 41;
  if (s.roll === 23 && d >= 8) return 'V';
  return h === 3 ? 'A' : h === 11 ? 'L' : 'P';
};
const regMark = (s, y, m, d) => {
  if (y === 2026 && m === 9) { const k = schoolDay(y, m, d).kind; return k === 'school' || k === 'holiday' ? octMark(s, d) : null; }
  return KIND_CODE[sampleMark(s.id, y, m, d).kind] || null;
};
const regDays = (y, m) => {
  const last = new Date(y, m + 1, 0).getDate();
  return Array.from({ length: last }, (_, i) => i + 1).filter((d) => ['school', 'holiday'].includes(schoolDay(y, m, d).kind));
};
const studentCell = (s) => (y, m, d) => {
  const sd = schoolDay(y, m, d);
  if (sd.kind !== 'school' && sd.kind !== 'holiday') return { ...MARK_TONE[sd.kind], title: sd.title };
  const k = CODE_KIND[regMark(s, y, m, d)];
  return { ...MARK_TONE[k], title: k === 'holiday' ? sd.title : { present: 'Present', absent: 'Absent', late: 'Late', leave: 'On leave' }[k] };
};
const studentTotals = (s, y, m) => {
  const t = { present: 0, absent: 0, late: 0, leave: 0, school: 0 };
  regDays(y, m).forEach((d) => { const k = CODE_KIND[regMark(s, y, m, d)]; if (k in t) { t[k]++; t.school++; } });
  t.pct = t.school ? Math.round(((t.present + t.late) / t.school) * 1000) / 10 : 0;
  return t;
};
const MarkLegend = () => <Legend items={[['bg-ok/15', 'Present'], ['bg-bad/15', 'Absent'], ['bg-warn/15', 'Late'], ['bg-info/10', 'Leave or holiday']]} />;
function Totals({ t }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {[['Present', t.present + t.late], ['Absent', t.absent], ['Late', t.late], ['Leave', t.leave]].map(([k, v]) => (
        <div key={k} className="rounded-xl bg-sunken/70 px-3 py-2.5"><p className="font-display text-[20px] font-semibold tnum leading-none">{v}</p><p className="text-[12px] text-ink3 font-semibold mt-1">{k}</p></div>
      ))}
    </div>
  );
}

function NotMarked() {
  const toast = useToast();
  const [sent, setSent] = useState({});
  const left = NOT_MARKED.filter((c) => !sent[c.cls]);
  const remind = (list) => {
    setSent((x) => ({ ...x, ...Object.fromEntries(list.map((c) => [c.cls, '10:44 AM'])) }));
    toast({ title: list.length > 1 ? `Reminded ${list.length} class teachers` : `Reminded ${list[0].ct}`, body: list.length > 1 ? 'On the app and WhatsApp: please take today’s attendance before the 11:00 AM lock.' : `On the app and WhatsApp: please take today’s attendance for ${list[0].cls} before the 11:00 AM lock.` });
  };
  return (
    <Card>
      <CardHead title="Not marked yet" sub="Today, Fri 9 Oct · the app reminded these class teachers at 9:15 AM" icon={I.Hourglass}
        action={left.length > 1 ? <Button size="sm" variant="soft" icon={I.BellRing} onClick={() => remind(left)}>Remind all</Button> : <Pill tone="warn">{NOT_MARKED.length}</Pill>} />
      <ul className="px-2 pb-2">
        {NOT_MARKED.map((c) => (
          <li key={c.cls} className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
            <span className="w-10 h-10 rounded-xl bg-warn/12 text-warn grid place-items-center shrink-0 text-[13px] font-bold">{c.cls}</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[14.5px] leading-snug truncate">{c.ct}</p>
              <p className="text-[12.5px] text-ink3 truncate">{sent[c.cls] ? `Reminded again at ${sent[c.cls]}` : `${c.n} students · ${c.note}`}</p>
            </div>
            {sent[c.cls] ? <Pill tone="ok" className="shrink-0">Reminded</Pill> : <Button size="sm" variant="secondary" icon={I.Bell} onClick={() => remind([c])} className="shrink-0">Remind</Button>}
          </li>
        ))}
      </ul>
      <p className="px-5 pb-4 text-[12.5px] text-ink3">Marks lock at 11:00 AM. A class not marked by then shows as not taken, and no absence message goes to parents.</p>
    </Card>
  );
}

const MARK_OPTS = [{ value: 'P', label: 'Present' }, { value: 'A', label: 'Absent' }, { value: 'L', label: 'Late' }, { value: 'V', label: 'Leave' }];
const MARK_WORD = { P: 'Present', A: 'Absent', L: 'Late', V: 'Leave', H: 'Holiday' };
function CorrectMark({ c, onClose, onSave }) {
  const [to, setTo] = useState(null);
  const [why, setWhy] = useState('');
  const [tried, setTried] = useState(false);
  if (!c) return null;
  const v = to || c.was;
  const close = () => { onClose(); setTo(null); setWhy(''); setTried(false); };
  const err = !why.trim() ? 'A reason is needed for every change' : v === c.was ? 'Pick a different mark' : '';
  return (
    <Sheet open onClose={close} title={`Correct a mark · ${c.s.name}`} sub={`Class 7 B · Roll ${c.s.roll} · ${c.d} ${MONTH_NAMES[c.m]} ${c.y} · now ${MARK_WORD[c.was]}`}
      footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" icon={I.Check} onClick={() => { setTried(true); if (err) return; onSave(v, why.trim()); close(); }}>Save change</Button></>}>
      <div className="flex flex-col gap-4">
        <Field label="Change the mark to" id="cm-to"><Segmented value={v} onChange={setTo} options={MARK_OPTS} className="w-full" /></Field>
        <div className="flex flex-wrap gap-2 -mb-1">{['Came late, marked absent by mistake', 'Parent sent a leave note', 'Was on school duty'].map((x) => <button key={x} type="button" onClick={() => setWhy(x)} className="h-8 px-3 rounded-full bg-sunken text-[13px] font-medium hover:bg-line">{x}</button>)}</div>
        <Field label="Reason" id="cm-why" required error={tried && err}><Textarea id="cm-why" value={why} onChange={setWhy} rows={2} placeholder="Why the mark changes" /></Field>
        <Banner tone="info" title="Kept on record:">the original mark, your name and the reason stay in the audit log. Ravi Teja, the class teacher, is told.</Banner>
      </div>
    </Sheet>
  );
}

function Register() {
  const { access } = usePage();
  const over = useOversight();
  const toast = useToast();
  // The Principal and Vice Principal may correct a mark after the lock (Register is Full for them). School Admin and Academic Head only read it.
  const canCorrect = over && access === 'full';
  const [fixes, setFixes] = useState({});
  const [fix, setFix] = useState(null);
  const markOf = (s, yy, mm, d) => fixes[`${s.id}-${yy}-${mm}-${d}`] || regMark(s, yy, mm, d);
  const [k, setK] = useState(String(2026 * 12 + 9));
  const [stu, setStu] = useState(null);
  const y = Math.floor(Number(k) / 12), m = Number(k) % 12;
  const isOct = y === 2026 && m === 9;
  const days = regDays(y, m);
  const school = days.filter((d) => schoolDay(y, m, d).kind === 'school').length;
  const step = (n) => setK(String(Math.min(2026 * 12 + 9, Math.max(2025 * 12 + 5, Number(k) + n))));
  const C = { P: 'bg-ok/15 text-ok', A: 'bg-bad text-surface', L: 'bg-warn/20 text-warn', H: 'bg-info/10 text-info', V: 'bg-info/15 text-info' };
  const dayCell = (yy, mm, d) => {
    const sd = schoolDay(yy, mm, d);
    if (sd.kind !== 'school') return { ...MARK_TONE[sd.kind], title: sd.title };
    const ms = CLASS_7B.map((s) => regMark(s, yy, mm, d));
    const pr = ms.filter((x) => x === 'P' || x === 'L').length;
    const pct = Math.round((pr / CLASS_7B.length) * 1000) / 10;
    return { tone: pct >= 92 ? 'ok' : pct >= 85 ? 'warn' : 'bad', title: `${pr} of ${CLASS_7B.length} present · ${pct}%` };
  };
  const monthPct = (yy, mm) => {
    const ds = regDays(yy, mm).filter((d) => schoolDay(yy, mm, d).kind === 'school');
    if (!ds.length) return null;
    let pr = 0; ds.forEach((d) => CLASS_7B.forEach((s) => { const x = regMark(s, yy, mm, d); if (x === 'P' || x === 'L') pr++; }));
    return { n: ds.length, pct: Math.round((pr / (ds.length * CLASS_7B.length)) * 1000) / 10 };
  };
  return (
    <div className="flex flex-col gap-5 @lg:gap-6">
      {over && <NotMarked />}
      <Card className="overflow-hidden">
        <div className="flex flex-col @lg:flex-row @lg:items-center justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <h3 className="font-semibold">{MONTH_NAMES[m]} {y}</h3>
            <p className="text-[13px] text-ink3">Class 7 B · 38 students · {school} school {school === 1 ? 'day' : 'days'}{isOct ? ' so far' : ''} · tap a name for the month calendar{canCorrect ? ', or a mark to correct it' : ''}</p>
          </div>
          <div className="flex items-center gap-2 w-full @lg:w-72">
            <Button variant="secondary" size="sm" icon={I.ChevronLeft} aria-label="Earlier month" disabled={Number(k) <= 2025 * 12 + 5} onClick={() => step(-1)} className="!px-2.5 shrink-0" />
            <label htmlFor="reg-month" className="sr-only">Month</label>
            <div className="relative flex-1 min-w-0">
              <select id="reg-month" value={k} onChange={(e) => setK(e.target.value)} className="appearance-none w-full h-9 pl-3 pr-8 rounded-xl bg-sunken/70 hover:bg-sunken text-[14px] font-semibold text-center outline-none cursor-pointer">
                {REG_MONTHS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <I.ChevronDown size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink3 pointer-events-none" />
            </div>
            <Button variant="secondary" size="sm" icon={I.ChevronRight} aria-label="Later month" disabled={isOct} onClick={() => step(1)} className="!px-2.5 shrink-0" />
          </div>
        </div>
        <div className="flex gap-3 text-[12px] text-ink2 flex-wrap px-5 pb-3">
          {[['P', 'Present'], ['A', 'Absent'], ['L', 'Late'], ['V', 'Leave'], ['H', 'Holiday']].map(([x, l]) => <span key={x} className="flex items-center gap-1.5"><span className={cx('w-4 h-4 rounded grid place-items-center text-[9px] font-bold', C[x])}>{x === 'V' ? 'Lv' : x}</span>{l}</span>)}
        </div>
        {days.length === 0 ? (
          <Empty icon={I.CalendarX2} title={`No school days in ${MONTH_NAMES[m]} ${y}`} body={m === 4 || m === 3 ? 'Summer holidays. Pick another month.' : 'Pick another month.'} />
        ) : (
          <div className="overflow-x-auto scroll-thin">
            <table className="text-[13px] min-w-full">
              <thead>
                <tr className="border-y border-line text-ink3">
                  <th className="sticky left-0 bg-surface text-left font-semibold px-4 py-2 min-w-[180px]">Student</th>
                  {days.map((d) => <th key={d} className="font-semibold px-1 py-2 w-10 tnum">{d}<span className="block text-[10px] font-medium">{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][new Date(y, m, d).getDay()]}</span></th>)}
                  <th className="font-semibold px-4 py-2 text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {CLASS_7B.map((s) => {
                  const ms = days.map((d) => markOf(s, y, m, d));
                  const sch = ms.filter((x) => x !== 'H').length;
                  const pr = ms.filter((x) => x === 'P' || x === 'L').length;
                  const pct = sch ? Math.round((pr / sch) * 100) : 0;
                  return (
                    <tr key={s.id} className="border-b border-line/60 last:border-0">
                      <td className="sticky left-0 bg-surface px-4 py-1.5 font-medium whitespace-nowrap">
                        <button type="button" onClick={() => setStu(s)} className="hover:text-brand text-left"><span className="text-ink3 tnum mr-2 inline-block w-5">{s.roll}</span>{s.name}</button>
                      </td>
                      {ms.map((x, i) => {
                        const cell = <span className={cx('inline-grid place-items-center w-7 h-7 rounded-md text-[10.5px] font-bold', C[x], fixes[`${s.id}-${y}-${m}-${days[i]}`] && 'ring-2 ring-brand/50')}>{x === 'V' ? 'Lv' : x}</span>;
                        return <td key={i} className="px-1 py-1.5 text-center">{canCorrect && x && x !== 'H'
                          ? <button type="button" aria-label={`Correct ${s.name}, ${days[i]} ${MONTH_NAMES[m]}: ${MARK_WORD[x]}`} title="Correct this mark" onClick={() => setFix({ s, y, m, d: days[i], was: x })} className="rounded-md hover:ring-2 hover:ring-brand/40">{cell}</button> : cell}</td>;
                      })}
                      <td className={cx('px-4 text-right font-semibold tnum', sch && pct < 85 && 'text-warn')}>{sch ? `${pct}%` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="max-w-xl">
        <CardHead title="Class 7 B, day by day" sub="Share of the class present each school day" icon={I.CalendarDays} />
        <div className="px-5 pb-5 flex flex-col gap-3">
          <CalendarMonth id="reg-sec-cal" compact cell={dayCell}
            footer={(yy, mm) => { const t = monthPct(yy, mm); return <p className="text-[13px] text-ink2">{t ? <><b className="font-semibold text-ink tnum">{t.pct}%</b> present on average · {t.n} school days</> : 'No school days this month.'}</p>; }} />
          <Legend items={[['bg-ok/15', '92% or more'], ['bg-warn/15', '85% to 92%'], ['bg-bad/15', 'Below 85%'], ['bg-info/10', 'Holiday']]} />
        </div>
      </Card>

      <CorrectMark c={fix} onClose={() => setFix(null)} onSave={(to, why) => {
        const key = `${fix.s.id}-${fix.y}-${fix.m}-${fix.d}`; const before = fixes;
        setFixes({ ...fixes, [key]: to });
        toast({ title: `${fix.s.name}, ${fix.d} ${MONTH_NAMES[fix.m]}: ${MARK_WORD[fix.was]} → ${MARK_WORD[to]}`, body: `Reason: ${why}. The original stays in the audit log.`, undo: () => setFixes(before) });
      }} />
      <Sheet open={!!stu} onClose={() => setStu(null)} title={stu?.name || ''} sub={stu ? `Class 7 B · Roll ${stu.roll}` : ''}
        footer={<Button variant="ghost" onClick={() => setStu(null)}>Close</Button>}>
        {stu && (
          <div className="flex flex-col gap-4">
            <CalendarMonth key={stu.id + k} id="reg-stu-cal" compact start={[y, m]} cell={studentCell(stu)}
              footer={(yy, mm) => { const t = studentTotals(stu, yy, mm); return <div className="flex flex-col gap-3"><Totals t={t} /><p className="text-[12.5px] text-ink3">{t.school ? `${t.pct}% in ${MONTH_NAMES[mm]} · ${t.school} school days. Sundays and holidays are not counted.` : 'No school days this month.'}</p></div>; }} />
            <MarkLegend />
          </div>
        )}
      </Sheet>
    </div>
  );
}
