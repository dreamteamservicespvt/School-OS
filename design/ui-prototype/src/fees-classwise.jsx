// Fees by class: for people who look after the school's money (Accountant, Principal, School Admin, Vice Principal).
// Every section with what was due so far, what came in, what is still pending and who the class teacher is;
// tap a class for its students one by one. Teachers never see fee amounts (blueprint 05-roles.md).
import React, { useMemo, useState } from 'react';
import * as I from './icons.js';
import { inr, inrShort } from './data.js';
import { cx, Card, CardHead, Button, Pill, Empty, useToast } from './ui.jsx';
import { useNav, useRole, canDo, canOpen } from './shell.jsx';
import { Toolbar, Chips, Select, Progress, Stats, DatePeriod, PERIODS, fmtRange, DataList, SearchBox } from './kit.jsx';
import { SECTIONS, GROUPS, rosterOf, hsh } from './attendance.jsx';
import { DEFAULTERS } from './mod-fees.jsx';

// Yearly tuition by class group (scaled below so the school adds up to the Fee Dashboard), and the four instalments
const YEARLY = { pre: 21500, pri: 25000, mid: 30000, high: 35500 };
const INST = [
  { k: 'Q1', label: 'Q1 tuition', billed: '2026-04-01', due: '2026-04-10', share: 0.3 },
  { k: 'Q2', label: 'Q2 tuition', billed: '2026-07-01', due: '2026-07-10', share: 0.25 },
  { k: 'Q3', label: 'Q3 tuition', billed: '2026-10-01', due: '2026-10-10', share: 0.25 },
];
// The school's money so far this year: ₹2.84 Cr due, ₹2.33 Cr collected, ₹42.3 L of Q3 not paid yet (not late),
// and the Defaulters list (61 students, ₹8.4 L past the due date). Every screen reads these same numbers.
const TARGET_DUE = 28370000, Q3_PENDING = 4230000;
const TODAY_ISO = '2026-10-09';
const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const addDays = (s, n) => { const d = new Date(s); d.setDate(d.getDate() + n); return iso(d.getFullYear(), d.getMonth(), d.getDate()); };
const daysLate = (s) => Math.round((new Date(TODAY_ISO) - new Date(s)) / 864e5);
const label = (s) => (s.cls.length > 2 ? s.id : `Class ${s.id}`);
const r50 = (n) => Math.round(n / 50) * 50;

let MODEL = null;
function model() {
  if (MODEL) return MODEL;
  const DEF = Object.fromEntries(DEFAULTERS.map((d) => [d.id, d]));
  const overdueTotal = DEFAULTERS.reduce((a, d) => a + d.amount, 0);
  const all = SECTIONS.flatMap((sec) => rosterOf(sec).map((st) => ({ st, sec })));
  const k = (TARGET_DUE - overdueTotal) / all.reduce((a, x) => a + YEARLY[x.sec.grp] * 0.8, 0);
  const rows = all.map(({ st, sec }) => {
    const h = hsh(st.id);
    const ins = INST.map((x, i) => {
      const amt = r50(YEARLY[sec.grp] * k * x.share);
      return { ...x, amt, paid: amt, on: i === 2 ? addDays(x.billed, h % 8) : addDays(x.due, ((h * 7 + i * 11) % 38) - 6) };
    });
    const d = DEF[st.id];
    if (d) ins.push({ k: 'Other', label: d.head, amt: d.amount, paid: 0, due: iso(2026, d.since[0], d.since[1]), on: null });
    return { st, sec, ins };
  });
  // Q3 tuition is due tomorrow: some families have not paid it yet, more in classes that usually pay late
  const weak = (sec) => (sec.id === '9 B' ? 2 : 0.6 + (hsh(sec.id) % 9) / 10);
  const order = [...rows].sort((a, b) => (hsh(a.st.id + 'q3') % 1000) / weak(a.sec) - (hsh(b.st.id + 'q3') % 1000) / weak(b.sec));
  let left = Q3_PENDING;
  for (const r of order) {
    if (left <= 0) break;
    const q = r.ins[2];
    const owe = Math.min(q.amt, left);
    q.paid = q.amt - owe; if (!q.paid) q.on = null;
    left -= owe;
  }
  MODEL = Object.fromEntries(SECTIONS.map((sec) => [sec.id, rows.filter((r) => r.sec === sec)]));
  return MODEL;
}
function studentRows(sec, per) {
  return model()[sec.id].map(({ st, ins }) => {
    const due = ins.reduce((a, x) => a + x.amt, 0), paid = ins.reduce((a, x) => a + x.paid, 0);
    const inPer = ins.reduce((a, x) => a + (x.on && x.on >= per.from && x.on <= per.to ? x.paid : 0), 0);
    const open = ins.filter((x) => x.paid < x.amt);
    const late = open.filter((x) => x.due < TODAY_ISO);
    const oldest = late.sort((a, b) => (a.due < b.due ? -1 : 1))[0] || open[0];
    const overdue = late.reduce((a, x) => a + x.amt - x.paid, 0);
    return { ...st, ins, due, paid, inPer, overdue, pending: due - paid, late: late.length ? daysLate(oldest.due) : 0, oldest };
  });
}
function sumUp(rows) {
  const t = { due: 0, paid: 0, inPer: 0, owe: 0, late30: 0, overdue: 0, overdueN: 0 };
  rows.forEach((r) => { t.due += r.due; t.paid += r.paid; t.inPer += r.inPer; t.overdue += r.overdue; if (r.pending > 0) t.owe++; if (r.overdue > 0) t.overdueN++; if (r.late > 30) t.late30++; });
  t.pending = t.due - t.paid;
  t.notLate = t.pending - t.overdue;
  t.pct = t.due ? Math.round((t.paid / t.due) * 1000) / 10 : 100;
  return t;
}
const FY = PERIODS.finyear;
// Whole-school and class totals for this financial year, for the Fee Dashboard, home screens and reports
export function feeTotals() { return sumUp(SECTIONS.flatMap((s) => studentRows(s, FY))); }
export function feeByClass() {
  const out = {};
  SECTIONS.forEach((s) => { const t = sumUp(studentRows(s, FY)); const o = (out[s.cls] ||= { due: 0, paid: 0 }); o.due += t.due; o.paid += t.paid; });
  return out;
}
const toneOf = (pct) => (pct >= 90 ? 'ok' : pct >= 80 ? 'warn' : 'bad');
const TXT = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad' };
const BG = { ok: 'bg-ok/12 text-ok', warn: 'bg-warn/12 text-warn', bad: 'bg-bad/10 text-bad' };
const money = (n) => (n >= 1e5 ? inrShort(n) : inr(n));

export function ClassFees() {
  const { role } = useRole();
  const toast = useToast();
  const [grp, setGrp] = useState('all');
  const [sort, setSort] = useState('overdue');
  const [open, setOpen] = useState(null);
  const data = useMemo(() => SECTIONS.map((s) => { const rows = studentRows(s, FY); return { s, rows, t: sumUp(rows) }; }), []);
  const shown = data.filter((d) => grp === 'all' || d.s.grp === grp);
  const list = sort === 'class' ? shown : [...shown].sort((a, b) => (sort === 'pct' ? a.t.pct - b.t.pct : sort === 'overdue' ? b.t.overdue - a.t.overdue || b.t.pending - a.t.pending : b.t.pending - a.t.pending));
  const all = sumUp(shown.flatMap((d) => d.rows));
  const ask = (d) => toast({ title: `Sent to ${d.s.ct}`, body: `Names of the ${d.t.owe} families in ${label(d.s)} who still owe, to remind at pickup or the PTM. Teachers do not see amounts.` });

  if (open) {
    const d = data.find((x) => x.s.id === open);
    return <ClassFeeDetail d={d} onBack={() => setOpen(null)} onPick={setOpen} onAsk={() => ask(d)} />;
  }
  return (
    <div className="flex flex-col gap-4">
      <Stats items={[
        { label: 'Due so far', value: money(all.due), sub: `Tuition Q1 to Q3 and other fees · ${shown.reduce((a, d) => a + d.rows.length, 0).toLocaleString('en-IN')} students`, icon: 'FileText' },
        { label: 'Collected', value: money(all.paid), sub: `${all.pct}% of what is due`, icon: 'IndianRupee', tone: 'ok' },
        { label: 'Pending, not late', value: money(all.notLate), sub: 'Q3 tuition · due 10 Oct', icon: 'Hourglass', tone: 'warn' },
        { label: 'Overdue', value: money(all.overdue), sub: `${all.overdueN} students · ${all.late30} over 30 days`, icon: 'TriangleAlert', tone: all.overdue ? 'bad' : undefined },
      ]} />
      <Card className="overflow-hidden">
        <CardHead title="Fees by class" sub="This financial year, as of today, Fri 9 Oct · tap a class for its students" icon={I.LayoutGrid} />
        <Toolbar>
          <Select id="cf-sort" value={sort} onChange={setSort} className="w-full @md:w-52" options={[{ value: 'overdue', label: 'Most overdue first' }, { value: 'pending', label: 'Most pending first' }, { value: 'pct', label: 'Lowest collected first' }, { value: 'class', label: 'Class order' }]} />
          <Chips value={grp} onChange={setGrp} className="@md:basis-full" options={[{ value: 'all', label: 'All classes' }, ...GROUPS.map(([value, l]) => ({ value, label: l }))]} />
        </Toolbar>
        <div className="grid @sm:grid-cols-2 @lg:grid-cols-3 @2xl:grid-cols-4 gap-2.5 p-3">
          {list.map(({ s, t }) => {
            const tone = toneOf(t.pct);
            return (
              <button key={s.id} type="button" onClick={() => setOpen(s.id)}
                className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-3.5 text-left hover:bg-sunken/60 hover:border-ink3/40 transition min-w-0">
                <span className="flex items-center gap-3 min-w-0">
                  <span className={cx('w-11 h-11 rounded-xl grid place-items-center shrink-0 text-[13px] font-bold', BG[tone])}>{s.id.replace('Nursery', 'Nur')}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-[14.5px] leading-snug truncate">{label(s)}</span>
                    <span className="block text-[12.5px] text-ink3 truncate">Class teacher {s.ct}</span>
                  </span>
                  <span className={cx('font-display text-[20px] font-semibold tnum shrink-0', TXT[tone])}>{Math.round(t.pct)}%</span>
                </span>
                <Progress value={t.pct} tone={tone} />
                <span className="grid grid-cols-2 gap-x-3 text-[12.5px]">
                  <span className="min-w-0"><span className="block text-ink3">Collected</span><span className="block font-semibold tnum truncate">{money(t.paid)}</span></span>
                  <span className="min-w-0 text-right"><span className="block text-ink3">Pending</span><span className={cx('block font-semibold tnum truncate', t.pending ? 'text-bad' : 'text-ok')}>{t.pending ? money(t.pending) : 'Nil'}</span></span>
                </span>
                <span className="text-[12.5px] text-ink2 truncate">
                  {t.owe ? `${t.owe} of ${s.n} owe${t.overdueN ? ` · ${t.overdueN} overdue (${money(t.overdue)})` : ' · none overdue'}` : `All ${s.n} students paid`}
                </span>
              </button>
            );
          })}
        </div>
        <p className="px-5 pb-4 text-[12.5px] text-ink3">Green is 90% or more collected, amber 80% to 90%, red below 80%. Q3 tuition was billed on 1 Oct and is due on 10 Oct, so many families still have it to pay.</p>
      </Card>
    </div>
  );
}

function ClassFeeDetail({ d, onBack, onPick, onAsk }) {
  const { go } = useNav();
  const { role, modulesOn } = useRole();
  const toast = useToast();
  const [show, setShow] = useState('owe');
  const [q, setQ] = useState('');
  const { s, t } = d;
  const collect = canDo(role, 'fees.collect', modulesOn);
  const remind = canDo(role, 'fees.defaulters', modulesOn);
  const ledger = canOpen(role, 'fees.ledger', modulesOn);
  const owe = d.rows.filter((r) => r.pending > 0);
  const rows = d.rows.filter((r) => (show === 'all' || (show === 'owe' ? r.pending > 0 : r.pending === 0)) && (!q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase())))
    .sort((a, b) => (show === 'owe' ? b.late - a.late || b.pending - a.pending : a.roll - b.roll));
  const real = (r) => !String(r.id).startsWith('R-');
  const status = (r) => (r.pending === 0 ? <Pill tone="ok">Paid</Pill> : r.overdue > 0 ? <span className="inline-flex flex-col items-start gap-0.5"><Pill tone={r.late > 30 ? 'bad' : 'warn'}>Overdue · {r.late} {r.late === 1 ? 'day' : 'days'}</Pill><span className="text-[12px] text-ink3 max-w-[220px] truncate">{r.oldest.label}</span></span> : <Pill tone="warn">{r.ins[2].paid ? 'Part paid' : 'Not paid'} · due 10 Oct</Pill>);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col @md:flex-row @md:items-center gap-2.5">
        <Button variant="secondary" icon={I.ArrowLeft} onClick={onBack} className="self-start">All classes</Button>
        <Select id="cf-sec" value={s.id} onChange={onPick} className="w-full @md:w-64" options={SECTIONS.map((x) => ({ value: x.id, label: `${label(x)} · ${x.ct}` }))} />
      </div>
      <Stats items={[
        { label: 'Due so far', value: money(t.due), sub: `${s.n} students · tuition and other fees`, icon: 'FileText' },
        { label: 'Collected', value: money(t.paid), sub: `${t.pct}% of what is due`, icon: 'IndianRupee', tone: 'ok' },
        { label: 'Pending', value: t.pending ? money(t.pending) : 'Nil', sub: t.owe ? `${t.owe} students · ${money(t.overdue)} overdue` : 'Everyone has paid', icon: 'Hourglass', tone: t.overdue ? 'bad' : t.pending ? 'warn' : 'ok' },
        { label: 'Class teacher', value: s.ct, sub: `Manages ${label(s)}`, icon: 'UserRound' },
      ]} />
      <Card className="overflow-hidden">
        <CardHead title={`${label(s)} · students and fees`} sub="Pending as of today, Fri 9 Oct · overdue first" icon={I.Users}
 />
        {owe.length > 0 && (
          <div className="px-5 pb-3 -mt-1 flex gap-2 flex-wrap">
            <Button size="sm" variant="secondary" icon={I.UserRound} onClick={onAsk}>Ask {s.ct.split(' ')[0]} to follow up</Button>
            {remind && <Button size="sm" variant="soft" icon={I.Send} onClick={() => toast({ title: `Reminder sent to ${owe.length} parents`, body: `${label(s)} · WhatsApp with a payment link, SMS if not delivered.` })}>Remind {owe.length} parents</Button>}
          </div>
        )}
        <Toolbar>
          <SearchBox id="cf-q" value={q} onChange={setQ} placeholder="Student name" />
          <Chips value={show} onChange={setShow} options={[{ value: 'owe', label: `Owe (${owe.length})` }, { value: 'paid', label: `Paid (${d.rows.length - owe.length})` }, { value: 'all', label: `All (${d.rows.length})` }]} />
        </Toolbar>
        <DataList rows={rows} bp="md" minWidth={720}
          footer={`${rows.length} of ${d.rows.length} students · ${label(s)}`}
          columns={[
            { key: 'roll', label: 'Roll', render: (r) => <span className="tnum text-ink3">{r.roll}</span> },
            { key: 'name', label: 'Student', render: (r) => <><p className="font-semibold leading-tight">{r.name}</p><p className="text-[12.5px] text-ink3">{r.father} · {r.phone}</p></> },
            { key: 'due', label: 'Due', align: 'right', render: (r) => inr(r.due) },
            { key: 'paid', label: 'Paid', align: 'right', render: (r) => inr(r.paid) },
            { key: 'pending', label: 'Pending', align: 'right', render: (r) => <span className={cx('font-semibold', r.pending ? 'text-bad' : 'text-ink3')}>{r.pending ? inr(r.pending) : '—'}</span> },
            { key: 'st', label: 'Status', nowrap: true, render: status },
            ...(collect || ledger ? [{ key: 'act', label: '', align: 'right', nowrap: true, render: (r) => (
              <span className="inline-flex gap-1.5">
                {ledger && real(r) && <Button size="sm" variant="ghost" onClick={() => go('fees', { page: 'ledger', id: r.id })}>Ledger</Button>}
                {collect && r.pending > 0 && <Button size="sm" variant="soft" icon={I.IndianRupee} onClick={() => go('fees', real(r) ? { page: 'collect', student: r.id } : { page: 'collect' })}>Collect</Button>}
              </span>
            ) }] : []),
          ]}
          mobile={(r) => ({ title: r.name, sub: `Roll ${r.roll} · ${r.father} · ${r.phone}`, avatar: r.name,
            right: <><p className={cx('font-semibold tnum text-[14.5px]', r.pending ? 'text-bad' : 'text-ok')}>{r.pending ? inr(r.pending) : 'Paid'}</p>{r.pending > 0 && <p className={cx('text-[12px] tnum', r.overdue ? 'text-bad' : 'text-ink3')}>{r.overdue ? `Overdue · ${r.late} days` : 'Q3 · due 10 Oct'}</p>}</> })}
          empty={<Empty icon={show === 'owe' ? I.PartyPopper : I.SearchX} title={show === 'owe' && !q ? `Everyone in ${label(s)} has paid` : 'No student matches'} body={show === 'owe' && !q ? 'Nothing is pending.' : 'Try another name or filter.'} />} />
      </Card>
    </div>
  );
}
