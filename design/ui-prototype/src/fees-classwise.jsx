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

// Yearly fee by class group, and the four instalments (share of the year, due date)
const YEARLY = { pre: 21500, pri: 25000, mid: 30000, high: 35500 };
const INST = [
  { k: 'Q1', label: 'Q1 tuition', billed: '2026-04-01', due: '2026-04-10', share: 0.3 },
  { k: 'Q2', label: 'Q2 tuition', billed: '2026-07-01', due: '2026-07-10', share: 0.25 },
  { k: 'Q3', label: 'Q3 tuition', billed: '2026-10-01', due: '2026-10-10', share: 0.25 },
  { k: 'Q4', label: 'Q4 tuition', billed: '2027-01-01', due: '2027-01-10', share: 0.2 },
];
const TODAY_ISO = '2026-10-09';
const addDays = (iso, n) => { const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const daysLate = (iso) => Math.round((new Date(TODAY_ISO) - new Date(iso)) / 864e5);
const label = (s) => (s.cls.length > 2 ? s.id : `Class ${s.id}`);

// One student's instalments: what was due, what was paid and when (example data, the same every time)
function feeOf(st, sec) {
  const yearly = YEARLY[sec.grp];
  const h = hsh(st.id) % 100, h3 = hsh(st.id + 'q3') % 100;
  const weak = sec.id === '9 B' ? 1.8 : 0.6 + (hsh(sec.id) % 9) / 10; // some classes pay later than others
  let behind = false; // a family behind on an earlier term has not paid the later ones either
  return INST.filter((x) => x.billed <= TODAY_ISO).map((x, i) => {
    const amt = Math.round((yearly * x.share) / 50) * 50;
    // Q3 is billed and due tomorrow, so many have not paid yet; a few families are behind on Q1 or Q2
    const unpaid = i === 0 ? h < 2.5 * weak : i === 1 ? h < 4.4 * weak : h3 < 60 * Math.min(1.25, weak);
    const was = behind, no = unpaid || was;
    if (no) behind = true;
    const part = no && !was && i === 2 && h3 % 3 === 0;
    const paid = no ? (part ? Math.round(amt / 2 / 50) * 50 : 0) : amt;
    return { ...x, amt, paid, on: paid ? (i === 2 ? addDays(x.billed, (h3 * 7) % 9) : addDays(x.due, (h * 7 + i * 11) % 38 - 6)) : null };
  });
}
function sumUp(rows) {
  const t = { due: 0, paid: 0, inPer: 0, owe: 0, late30: 0, overdue: 0 };
  rows.forEach((r) => { t.due += r.due; t.paid += r.paid; t.inPer += r.inPer; t.overdue += r.overdue; if (r.pending > 0) t.owe++; if (r.late > 30) t.late30++; });
  t.pending = t.due - t.paid;
  t.pct = t.due ? Math.round((t.paid / t.due) * 1000) / 10 : 100;
  return t;
}
function studentRows(sec, per) {
  return rosterOf(sec).map((st) => {
    const ins = feeOf(st, sec);
    const due = ins.reduce((a, x) => a + x.amt, 0), paid = ins.reduce((a, x) => a + x.paid, 0);
    const inPer = ins.reduce((a, x) => a + (x.on && x.on >= per.from && x.on <= per.to ? x.paid : 0), 0);
    const oldest = ins.find((x) => x.paid < x.amt);
    const overdue = ins.reduce((a, x) => a + (daysLate(x.due) > 30 ? x.amt - x.paid : 0), 0);
    return { ...st, ins, due, paid, inPer, overdue, pending: due - paid, late: oldest ? daysLate(oldest.due) : 0, oldest };
  });
}
const toneOf = (pct) => (pct >= 90 ? 'ok' : pct >= 80 ? 'warn' : 'bad');
const TXT = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad' };
const BG = { ok: 'bg-ok/12 text-ok', warn: 'bg-warn/12 text-warn', bad: 'bg-bad/10 text-bad' };
const money = (n) => (n >= 1e5 ? inrShort(n) : inr(n));

export function ClassFees() {
  const { role } = useRole();
  const toast = useToast();
  const [per, setPer] = useState(PERIODS.finyear);
  const [grp, setGrp] = useState('all');
  const [sort, setSort] = useState('overdue');
  const [open, setOpen] = useState(null);
  const data = useMemo(() => SECTIONS.map((s) => { const rows = studentRows(s, per); return { s, rows, t: sumUp(rows) }; }), [per.from, per.to]);
  const shown = data.filter((d) => grp === 'all' || d.s.grp === grp);
  const list = sort === 'class' ? shown : [...shown].sort((a, b) => (sort === 'pct' ? a.t.pct - b.t.pct : sort === 'overdue' ? b.t.overdue - a.t.overdue || b.t.pending - a.t.pending : b.t.pending - a.t.pending));
  const all = sumUp(shown.flatMap((d) => d.rows));
  const wholeYear = per.key === 'finyear';
  const ask = (d) => toast({ title: `Sent to ${d.s.ct}`, body: `Names of the ${d.t.owe} families in ${label(d.s)} who still owe, to remind at pickup or the PTM. Teachers do not see amounts.` });

  if (open) {
    const d = data.find((x) => x.s.id === open);
    return <ClassFeeDetail d={d} per={per} onBack={() => setOpen(null)} onPick={setOpen} onAsk={() => ask(d)} />;
  }
  return (
    <div className="flex flex-col gap-4">
      <Stats items={[
        { label: 'Due so far', value: money(all.due), sub: `Q1 to Q3 tuition · ${shown.reduce((a, d) => a + d.rows.length, 0).toLocaleString('en-IN')} students`, icon: 'FileText' },
        { label: 'Collected', value: money(all.paid), sub: `${all.pct}% of what is due`, icon: 'IndianRupee', tone: 'ok' },
        { label: 'Pending, not late', value: money(all.pending - all.overdue), sub: 'Q3 tuition · due 10 Oct', icon: 'Hourglass', tone: 'warn' },
        { label: 'Overdue', value: money(all.overdue), sub: `${all.late30} students · over 30 days`, icon: 'TriangleAlert', tone: all.overdue ? 'bad' : undefined },
        ...(wholeYear ? [] : [{ label: `Collected · ${per.label}`, value: money(all.inPer), sub: fmtRange(per), icon: 'CalendarDays' }]),
      ]} />
      <Card className="overflow-hidden">
        <CardHead title="Fees by class" sub={`Due and pending as of today · collected ${wholeYear ? 'this financial year' : `in ${per.label.toLowerCase()} (${fmtRange(per)})`} · tap a class for its students`} icon={I.LayoutGrid} />
        <Toolbar>
          <DatePeriod id="cf-per" value={per} onChange={setPer} className="w-full @md:w-auto" />
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
                  {t.owe ? `${t.owe} of ${s.n} owe${t.late30 ? ` · ${t.late30} overdue (${money(t.overdue)})` : ' · none overdue'}` : `All ${s.n} students paid`}
                  {!wholeYear && ` · ${money(t.inPer)} in ${per.label.toLowerCase()}`}
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

function ClassFeeDetail({ d, per, onBack, onPick, onAsk }) {
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
  const status = (r) => (r.pending === 0 ? <Pill tone="ok">Paid</Pill> : r.late > 30 ? <Pill tone="bad">{r.oldest.k} overdue · {r.late} days</Pill> : <Pill tone="warn">{r.oldest.paid ? 'Part paid' : 'Not paid'} · due 10 Oct</Pill>);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col @md:flex-row @md:items-center gap-2.5">
        <Button variant="secondary" icon={I.ArrowLeft} onClick={onBack} className="self-start">All classes</Button>
        <Select id="cf-sec" value={s.id} onChange={onPick} className="w-full @md:w-64" options={SECTIONS.map((x) => ({ value: x.id, label: `${label(x)} · ${x.ct}` }))} />
      </div>
      <Stats items={[
        { label: 'Due so far', value: money(t.due), sub: `${s.n} students · Q1 to Q3`, icon: 'FileText' },
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
            right: <><p className={cx('font-semibold tnum text-[14.5px]', r.pending ? 'text-bad' : 'text-ok')}>{r.pending ? inr(r.pending) : 'Paid'}</p>{r.pending > 0 && <p className={cx('text-[12px] tnum', r.late > 30 ? 'text-bad' : 'text-ink3')}>{r.late > 30 ? `${r.oldest.k} · ${r.late} days late` : 'Q3 · due 10 Oct'}</p>}</> })}
          empty={<Empty icon={show === 'owe' ? I.PartyPopper : I.SearchX} title={show === 'owe' && !q ? `Everyone in ${label(s)} has paid` : 'No student matches'} body={show === 'owe' && !q ? 'Nothing is pending for Q1 to Q3.' : 'Try another name or filter.'} />} />
      </Card>
    </div>
  );
}
