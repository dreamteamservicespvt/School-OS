import React, { useMemo, useState } from 'react';
import * as I from './icons.js';
import { CLASS_7B } from './data.js';
import { cx, Card, Button, Pill, Avatar, Tabs, Sheet, PageHead, useToast } from './ui.jsx';
import { ModuleHead } from './kit.jsx';
import { useRole } from './shell.jsx';

const ST = {
  P: { label: 'Present', short: 'P', on: 'bg-ok text-surface border-ok', soft: 'text-ok' },
  A: { label: 'Absent', short: 'A', on: 'bg-bad text-surface border-bad', soft: 'text-bad' },
  L: { label: 'Late', short: 'L', on: 'bg-warn text-surface border-warn', soft: 'text-warn' },
  V: { label: 'Leave', short: 'Leave', on: 'bg-info/15 text-info border-info/30', soft: 'text-info' },
};

const AttHead = () => {
  const { role } = useRole();
  const sub = role.id === 'teacher' ? 'Class 7 B · Period 2, Mathematics · Friday, 9 October · Imran Shaikh' : 'Class 7 B · Friday, 9 October · Class teacher Ravi Teja';
  return <ModuleHead title="Attendance" sub={sub} />;
};
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

function Register() {
  const days = Array.from({ length: 9 }, (_, i) => i + 1).filter((d) => new Date(2026, 9, d).getDay() !== 0);
  const mark = (s, d) => {
    if (d === 2) return 'H';
    const h = (s.roll * 7 + d * 13) % 41;
    if (s.roll === 23 && d >= 8) return 'V';
    return h === 3 ? 'A' : h === 11 ? 'L' : 'P';
  };
  const C = { P: 'bg-ok/15 text-ok', A: 'bg-bad text-surface', L: 'bg-warn/20 text-warn', H: 'bg-info/10 text-info', V: 'bg-info/15 text-info' };
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4 flex-wrap">
        <div><h3 className="font-semibold">October 2026</h3><p className="text-[13px] text-ink3">Class 7 B · 38 students · 7 school days so far</p></div>
        <div className="flex gap-3 text-[12px] text-ink2 flex-wrap">
          {[['P', 'Present'], ['A', 'Absent'], ['L', 'Late'], ['V', 'Leave'], ['H', 'Holiday']].map(([k, l]) => <span key={k} className="flex items-center gap-1.5"><span className={cx('w-4 h-4 rounded grid place-items-center text-[9px] font-bold', C[k])}>{k === 'V' ? 'Lv' : k}</span>{l}</span>)}
        </div>
      </div>
      <div className="overflow-x-auto scroll-thin">
        <table className="text-[13px] min-w-full">
          <thead>
            <tr className="border-y border-line text-ink3">
              <th className="sticky left-0 bg-surface text-left font-semibold px-4 py-2 min-w-[180px]">Student</th>
              {days.map((d) => <th key={d} className="font-semibold px-1 py-2 w-10 tnum">{d}<span className="block text-[10px] font-medium">{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][new Date(2026, 9, d).getDay()]}</span></th>)}
              <th className="font-semibold px-4 py-2 text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {CLASS_7B.map((s) => {
              const m = days.map((d) => mark(s, d));
              const sch = m.filter((x) => x !== 'H').length;
              const pr = m.filter((x) => x === 'P' || x === 'L').length;
              const pct = Math.round((pr / sch) * 100);
              return (
                <tr key={s.id} className="border-b border-line/60 last:border-0">
                  <td className="sticky left-0 bg-surface px-4 py-1.5 font-medium whitespace-nowrap"><span className="text-ink3 tnum mr-2 inline-block w-5">{s.roll}</span>{s.name}</td>
                  {m.map((x, i) => <td key={i} className="px-1 py-1.5 text-center"><span className={cx('inline-grid place-items-center w-7 h-7 rounded-md text-[10.5px] font-bold', C[x])}>{x === 'V' ? 'Lv' : x}</span></td>)}
                  <td className={cx('px-4 text-right font-semibold tnum', pct < 85 && 'text-warn')}>{pct}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
