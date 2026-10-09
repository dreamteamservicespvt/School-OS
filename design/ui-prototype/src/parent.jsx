import React, { useState } from 'react';
import * as I from './icons.js';
import { PARENT, SCHOOL, OCT_ATT, FEE_ROWS, inr } from './data.js';
import { cx, Button, Pill, Avatar, Sheet, useToast, Spinner } from './ui.jsx';
import { useNav } from './shell.jsx';

export function ParentLink() {
  const { go } = useNav();
  return (
    <div className="h-full overflow-y-auto scroll-thin bg-bg">
      <div className="@lg:py-8 @lg:px-6 flex flex-col @lg:flex-row @lg:items-start @lg:justify-center gap-8">
        <aside className="hidden @lg:flex flex-col gap-4 max-w-[300px] pt-10">
          <p className="eyebrow text-brand">Parent Link</p>
          <h1 className="font-display text-[30px] font-semibold leading-tight tracking-tight">What a parent sees on their phone</h1>
          <p className="text-[15px] text-ink2 leading-relaxed">Each parent gets one personal link on WhatsApp. No app and no password. The first time, a one-time code confirms it is really them.</p>
          <ul className="text-[14px] text-ink2 flex flex-col gap-2">
            {['Fees due, with a Pay button', 'Receipts to download', 'Attendance this month', 'Notices, datesheet and report cards'].map((x) => <li key={x} className="flex gap-2"><I.Check size={17} className="text-brand shrink-0 mt-0.5" />{x}</li>)}
          </ul>
          <Button variant="secondary" icon={I.ArrowLeft} className="self-start mt-2" onClick={() => go('dashboard')}>Back to School OS</Button>
        </aside>
        <div className="@lg:w-[400px] @lg:rounded-[40px] @lg:border-[10px] @lg:border-ink/90 @lg:shadow-pop @lg:overflow-hidden @lg:h-[820px] @lg:shrink-0 bg-bg">
          <div className="@lg:h-full @lg:overflow-y-auto scroll-thin">
            <ParentPage />
          </div>
        </div>
      </div>
    </div>
  );
}

function ParentPage() {
  const toast = useToast();
  const { go } = useNav();
  const [child, setChild] = useState(PARENT.children[0].id);
  const [pay, setPay] = useState(false);
  const [paid, setPaid] = useState(false);
  const c = PARENT.children.find((x) => x.id === child);
  const due = paid && c.id === 'c1' ? 0 : c.due;
  const rows = FEE_ROWS.filter((r) => r.status === 'Overdue' || r.status === 'Due');
  const lead = (new Date(2026, 9, 1).getDay() + 6) % 7;
  const crit = PARENT.notices.find((n) => n.critical);

  return (
    <div className="pb-10">
      {/* Header */}
      <div className="bg-brand text-brandink px-5 pt-5 pb-16 relative overflow-hidden">
        <div className="absolute inset-0 dotgrid opacity-50" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-white/15 grid place-items-center"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M5 14a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /><path d="M12 3.5v2M4.6 6.6l1.4 1.4M19.4 6.6 18 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /><path d="M3 17.5h18M6 21h12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg></span>
            <div><p className="font-display font-semibold text-[15px] leading-tight">{SCHOOL.name}</p><p className="text-[11.5px] opacity-75">Parent Link</p></div>
          </div>
          <button onClick={() => go('dashboard')} className="@lg:hidden text-[12px] font-semibold opacity-80 h-8 px-2.5 rounded-lg bg-white/10">Exit preview</button>
        </div>
        <p className="relative mt-5 text-[14px] opacity-80">Namaste,</p>
        <h1 className="relative font-display text-[26px] font-semibold leading-tight">{PARENT.name}</h1>
      </div>

      <div className="px-4 -mt-12 relative flex flex-col gap-4">
        {/* Child switcher */}
        <div className="grid grid-cols-2 gap-2.5">
          {PARENT.children.map((k) => (
            <button key={k.id} onClick={() => setChild(k.id)} aria-pressed={child === k.id}
              className={cx('rounded-2xl p-3 text-left bg-surface border-2 shadow-card transition', child === k.id ? 'border-brand' : 'border-transparent')}>
              <Avatar name={k.name} size={38} />
              <p className="font-semibold text-[14.5px] mt-2 leading-tight">{k.name.split(' ')[0]}</p>
              <p className="text-[12px] text-ink3">{k.cls} · Roll {k.roll}</p>
            </button>
          ))}
        </div>

        {/* Critical notice */}
        {crit && (
          <div className="rounded-2xl bg-warn/12 border border-warn/30 p-4 flex gap-3">
            <I.Megaphone size={20} className="text-warn shrink-0 mt-0.5" />
            <div><p className="font-semibold text-[14.5px] leading-snug">{crit.title}</p><p className="text-[13px] text-ink2 mt-1">{crit.body}</p></div>
          </div>
        )}

        {/* Fees */}
        <section className="rounded-3xl bg-surface border border-line shadow-card overflow-hidden" key={child + paid}>
          <div className="p-5">
            <p className="text-[13px] font-semibold text-ink3">Fees due for {c.name.split(' ')[0]}</p>
            {due > 0 ? (
              <>
                <p className="font-display text-[34px] font-semibold tnum leading-tight mt-1">{inr(due)}</p>
                <p className="text-[13px] text-bad font-semibold">{inr(10950)} is overdue since July</p>
                <ul className="mt-4 flex flex-col gap-2 text-[14px]">
                  {rows.map((r) => (
                    <li key={r.id} className="flex justify-between gap-3"><span className="text-ink2">{r.head} · {r.inst}</span><span className={cx('tnum font-medium', r.status === 'Overdue' && 'text-bad')}>{inr(r.amount - r.paid + r.late)}</span></li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="flex items-center gap-3 mt-2">
                <span className="w-11 h-11 rounded-full bg-ok/12 text-ok grid place-items-center"><I.Check size={22} strokeWidth={2.6} /></span>
                <div><p className="font-semibold text-[16px]">All paid. Thank you!</p><p className="text-[13px] text-ink3">Next fee is due on {paid && c.id === 'c1' ? '5 Nov' : c.nextDue}</p></div>
              </div>
            )}
          </div>
          {due > 0 && (
            <div className="px-5 pb-5">
              <Button variant="primary" size="lg" className="w-full !h-14 !text-[16px]" icon={I.ShieldCheck} onClick={() => setPay(true)}>Pay {inr(due)}</Button>
              <p className="text-[12px] text-ink3 text-center mt-2">UPI, card or net banking · Secure payment</p>
            </div>
          )}
        </section>

        {/* Attendance */}
        <section className="rounded-3xl bg-surface border border-line shadow-card p-5">
          <div className="flex items-center justify-between">
            <div><p className="font-semibold text-[15px]">Attendance in October</p><p className="text-[13px] text-ink3">{c.present} of {c.days} school days present</p></div>
            <Pill tone="ok">{c.att}% this year</Pill>
          </div>
          <div className="grid grid-cols-7 gap-1 mt-4 text-center">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="text-[11px] font-semibold text-ink3">{d}</span>)}
            {Array.from({ length: lead }).map((_, i) => <span key={'b' + i} />)}
            {OCT_ATT.map((d) => (
              <span key={d.d} className={cx('aspect-square rounded-lg grid place-items-center text-[12px] font-semibold tnum',
                { P: 'bg-ok/15 text-ok', L: 'bg-warn/15 text-warn', H: 'bg-info/10 text-info', W: 'text-ink3/50', F: 'text-ink3/50', A: 'bg-bad/15 text-bad' }[c.id === 'c2' && d.s === 'L' ? 'P' : d.s])}>{d.d}</span>
            ))}
          </div>
          <p className="text-[12px] text-ink3 mt-3">2 Oct: Gandhi Jayanti holiday{c.id === 'c1' ? ' · 6 Oct: late by 10 minutes' : ''}</p>
        </section>

        {/* Datesheet */}
        {c.id === 'c1' && (
          <section className="rounded-3xl bg-surface border border-line shadow-card p-5">
            <p className="font-semibold text-[15px]">Half-yearly exam datesheet</p>
            <ul className="mt-3 divide-y divide-line/70">
              {PARENT.datesheet.map((d) => <li key={d.day} className="flex justify-between py-2.5 text-[14px]"><span className="text-ink2 tnum">{d.day}</span><span className="font-semibold">{d.sub}</span></li>)}
            </ul>
          </section>
        )}

        {/* Report card */}
        <section className="rounded-3xl bg-surface border border-line shadow-card p-5 flex items-center gap-4">
          <span className="w-12 h-12 rounded-2xl bg-brand/10 text-brand grid place-items-center shrink-0"><I.Award size={22} /></span>
          <div className="flex-1 min-w-0"><p className="font-semibold text-[15px]">Unit Test 2 report card</p><p className="text-[13px] text-ink3">{c.id === 'c1' ? '131 of 150 · 87%' : 'Grade A · Excellent'}</p></div>
          <Button size="sm" variant="secondary" icon={I.Download} onClick={() => toast({ title: 'Report card downloaded' })}>PDF</Button>
        </section>

        {/* Notices */}
        <section className="rounded-3xl bg-surface border border-line shadow-card p-5">
          <p className="font-semibold text-[15px] mb-1">Notices</p>
          <ul className="divide-y divide-line/70">
            {PARENT.notices.filter((n) => !n.critical).map((n) => (
              <li key={n.id} className="py-3"><p className="font-semibold text-[14px]">{n.title}</p><p className="text-[13px] text-ink2 mt-0.5">{n.body}</p><p className="text-[12px] text-ink3 mt-1">{n.when}</p></li>
            ))}
          </ul>
        </section>

        {/* Receipts */}
        <section className="rounded-3xl bg-surface border border-line shadow-card p-5">
          <p className="font-semibold text-[15px] mb-1">Receipts</p>
          <ul className="divide-y divide-line/70">
            {(paid && c.id === 'c1' ? [{ no: 'R/26/05192', d: '9 Oct 2026', a: 30650 }] : []).concat(c.id === 'c1' ? [{ no: 'R/26/04412', d: '12 Jul 2026', a: 10000 }, { no: 'R/26/01208', d: '8 Apr 2026', a: 31700 }] : [{ no: 'R/26/04419', d: '12 Jul 2026', a: 14500 }, { no: 'R/26/01233', d: '8 Apr 2026', a: 28200 }]).map((r) => (
              <li key={r.no} className="flex items-center gap-3 py-2.5">
                <I.ReceiptText size={18} className="text-ink3" />
                <div className="flex-1 min-w-0"><p className="text-[14px] font-semibold tnum">{inr(r.a)}</p><p className="text-[12px] text-ink3"><span className="font-mono">{r.no}</span> · {r.d}</p></div>
                <button onClick={() => toast({ title: 'Receipt downloaded', body: r.no })} className="w-10 h-10 grid place-items-center rounded-xl text-brand hover:bg-brand/8" aria-label={`Download receipt ${r.no}`}><I.Download size={18} /></button>
              </li>
            ))}
          </ul>
        </section>

        <div className="text-center text-[12.5px] text-ink3 px-6 pt-2">
          Questions? Call the school office<br /><span className="font-semibold text-ink2 select-all tnum">040 2305 6678</span> · 8:30 AM to 4:30 PM
          <p className="mt-3 flex items-center justify-center gap-1.5"><I.Lock size={12} />Only you can see this page</p>
        </div>
      </div>

      <PaySheet open={pay} amount={c.due} onClose={() => setPay(false)} onPaid={() => { setPay(false); setPaid(true); toast({ title: `${inr(c.due)} paid. Thank you!`, body: 'Receipt R/26/05192 is ready below' }); }} />
    </div>
  );
}

function PaySheet({ open, amount, onClose, onPaid }) {
  const [m, setM] = useState('upi');
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open={open} onClose={() => !busy && onClose()} title={`Pay ${inr(amount)}`} sub="Sunrise Public School · Secured by Razorpay">
      <div className="flex flex-col gap-2">
        {[['upi', 'UPI app', 'PhonePe, Google Pay, Paytm, BHIM', I.Smartphone], ['card', 'Debit or credit card', 'Visa, Mastercard, RuPay', I.CreditCard], ['nb', 'Net banking', 'All major banks', I.Landmark]].map(([id, t, s, Ic]) => (
          <button key={id} onClick={() => setM(id)} role="radio" aria-checked={m === id}
            className={cx('flex items-center gap-3 p-3.5 rounded-2xl border text-left transition', m === id ? 'border-brand ring-1 ring-brand bg-brand/5' : 'border-line')}>
            <span className="w-10 h-10 rounded-xl bg-sunken grid place-items-center"><Ic size={19} /></span>
            <span className="flex-1"><span className="block font-semibold text-[14.5px]">{t}</span><span className="block text-[12.5px] text-ink3">{s}</span></span>
            <span className={cx('w-5 h-5 rounded-full border-2 grid place-items-center', m === id ? 'border-brand' : 'border-line')}>{m === id && <span className="w-2.5 h-2.5 rounded-full bg-brand" />}</span>
          </button>
        ))}
        <Button variant="primary" size="lg" className="w-full !h-14 mt-2" loading={busy} onClick={() => { setBusy(true); setTimeout(() => { setBusy(false); onPaid(); }, 1400); }}>
          {busy ? 'Waiting for your UPI app…' : `Pay ${inr(amount)}`}
        </Button>
      </div>
    </Sheet>
  );
}
