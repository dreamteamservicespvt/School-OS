import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as I from './icons.js';
import { STUDENTS, FEATURED, FEE_ROWS, ME, inr } from './data.js';
import { cx, Card, CardHead, Button, Pill, Avatar, Checkbox, Input, Field, Ring, Sheet, PageHead, useToast, feeTone, inputCls, Empty } from './ui.jsx';
import { useNav, useRole } from './shell.jsx';
import { ModuleHead, useCanEdit, Banner } from './kit.jsx';

export const FEES_BASE = { collect: ({ params }) => <CollectFee studentId={params?.student} /> };

const MODES = [
  { id: 'Cash', icon: I.Banknote },
  { id: 'UPI', icon: I.Smartphone },
  { id: 'Card', icon: I.CreditCard },
  { id: 'Cheque', icon: I.FileSignature },
  { id: 'Bank transfer', icon: I.Landmark },
];

export function CollectFee({ studentId }) {
  const { go } = useNav();
  const [picked, setPicked] = useState(studentId || null);
  useEffect(() => setPicked(studentId || null), [studentId]);
  if (!picked) return <FindStudent onPick={setPicked} />;
  return <Collect key={picked} id={picked} onChange={() => setPicked(null)} />;
}

/* Step 1: find the student */
function FindStudent({ onPick }) {
  const [q, setQ] = useState('');
  const inp = useRef(null);
  useEffect(() => { setTimeout(() => inp.current?.focus(), 50); }, []);
  const t = q.trim().toLowerCase();
  const res = t ? STUDENTS.filter((s) => s.name.toLowerCase().includes(t) || s.adm.toLowerCase().includes(t) || s.phone.replace(' ', '').includes(t.replace(/\s/g, ''))).slice(0, 8) : [];
  const dueToday = [FEATURED, ...STUDENTS.filter((s) => s.feeState === 'Overdue' && s.id !== FEATURED.id).slice(0, 5)];
  return (
    <div>
      <ModuleHead title="Collect fee" sub="Find the student. Their dues show up ready to collect." />
      <div className="max-w-3xl">
      <div className="relative">
        <I.Search size={22} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink3" />
        <input ref={inp} id="fee-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Student name, admission no. or parent phone"
          className="w-full h-14 rounded-2xl bg-surface border border-line pl-12 pr-4 text-[16px] outline-none focus:border-brand focus:ring-4 focus:ring-brand/15 shadow-card placeholder:text-ink3" />
      </div>
      <Card className="mt-4 overflow-hidden">
        {t && res.length === 0 ? (
          <Empty icon={I.SearchX} title={`No student called “${q}”`} body="Try the admission number (like SPS/2021/0417) or the parent’s mobile number." />
        ) : (
          <>
            <p className="eyebrow text-ink3 px-5 pt-4 pb-1">{t ? `${res.length} found` : 'Overdue, most likely at the counter today'}</p>
            <ul className="p-2">
              {(t ? res : dueToday).map((s) => (
                <li key={s.id}>
                  <button onClick={() => onPick(s.id)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken text-left group">
                    <Avatar name={s.name} size={42} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[15px] truncate">{s.name}</p>
                      <p className="text-[13px] text-ink3 truncate">{s.cls} {s.sec} · Roll {s.roll} · {s.father}</p>
                    </div>
                    {s.due ? <span className="text-right"><span className="block font-semibold tnum">{inr(s.due)}</span><span className={cx('text-[12px] font-semibold', s.feeState === 'Overdue' ? 'text-bad' : 'text-warn')}>{s.feeState === 'Overdue' ? 'Overdue' : 'Due'}</span></span> : <Pill tone="ok">No dues</Pill>}
                    <I.ChevronRight size={18} className="text-ink3 group-hover:translate-x-0.5 transition" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
      </div>
    </div>
  );
}

/* Step 2: dues + payment */
function Collect({ id, onChange }) {
  const toast = useToast();
  const { go } = useNav();
  const { role } = useRole();
  const canEdit = useCanEdit();
  const base = STUDENTS.find((s) => s.id === id) || FEATURED;
  const [rows, setRows] = useState(() => FEE_ROWS.map((r) => ({ ...r })));
  const open = rows.filter((r) => r.status !== 'Paid');
  const [ticked, setTicked] = useState(() => new Set(FEE_ROWS.filter((r) => r.status === 'Overdue' || r.status === 'Due').map((r) => r.id)));
  const [showPaid, setShowPaid] = useState(false);
  const bal = (r) => r.amount - r.paid + r.late;
  const selTotal = rows.filter((r) => ticked.has(r.id)).reduce((a, r) => a + bal(r), 0);
  const [amount, setAmount] = useState(String(selTotal));
  const [edited, setEdited] = useState(false);
  useEffect(() => { if (!edited) setAmount(String(selTotal)); }, [selTotal, edited]);
  const [mode, setMode] = useState('Cash');
  const [ref, setRef] = useState('');
  const [chq, setChq] = useState({ no: '', bank: '' });
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [qr, setQr] = useState(false);

  const total = rows.reduce((a, r) => a + r.amount, 0);
  const paid = rows.reduce((a, r) => a + r.paid, 0);
  const amt = Number(String(amount).replace(/[^\d]/g, '')) || 0;
  const errAmt = amt <= 0 ? 'Enter an amount' : amt > selTotal ? `More than the ${inr(selTotal)} ticked. Tick more rows, or advance payment is off for this school.` : '';
  const needRef = ['UPI', 'Card', 'Bank transfer'].includes(mode);
  const errRef = needRef && !/^[A-Za-z0-9]{6,22}$/.test(ref.trim()) ? (ref.trim() ? 'This doesn’t look like a transaction number. It has 6 to 22 letters or digits.' : `Enter the ${mode === 'UPI' ? 'UPI transaction (UTR) number' : 'transaction number'}`) : '';
  const errChq = mode === 'Cheque' && (!/^\d{6}$/.test(chq.no) ? 'Cheque number has 6 digits' : !chq.bank.trim() ? 'Enter the bank name' : '');
  const valid = selTotal > 0 && !errAmt && !errRef && !errChq;
  const partial = amt > 0 && amt < selTotal;

  const collect = () => {
    setTried(true);
    if (!valid) return;
    setBusy(true);
    setTimeout(() => {
      // Apply oldest ticked row first
      let left = amt;
      const applied = [];
      const next = rows.map((r) => {
        if (!ticked.has(r.id) || left <= 0) return r;
        const b = bal(r);
        const pay = Math.min(b, left);
        left -= pay;
        applied.push({ head: r.head, inst: r.inst, amt: pay });
        const fully = pay === b;
        return { ...r, paid: r.paid + pay - (fully ? r.late : 0), late: fully ? 0 : r.late, status: fully ? 'Paid' : r.status, amount: r.amount };
      });
      setRows(next.map((r) => (r.status === 'Paid' ? { ...r, paid: r.amount } : r)));
      setTicked(new Set());
      setEdited(false);
      setBusy(false);
      setReceipt({ no: 'R/26/05191', amt, mode, ref: mode === 'Cheque' ? `Cheque ${chq.no}, ${chq.bank}` : ref, items: applied, when: '9 Oct 2026, 10:44 AM' });
      setRef(''); setTried(false);
    }, 1100);
  };

  const toggle = (rid) => { setEdited(false); setTicked((x) => { const n = new Set(x); n.has(rid) ? n.delete(rid) : n.add(rid); return n; }); };
  const visible = rows.filter((r) => showPaid || r.status !== 'Paid');
  const paidCount = rows.filter((r) => r.status === 'Paid').length;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <button onClick={onChange} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink h-8 px-1 -ml-1 rounded-lg"><I.ArrowLeft size={17} />Collect fee</button>
        <span className="text-[13px] text-ink3 hidden @md:inline">{canEdit ? `Collecting as ${role.person?.name || ME.name} · Counter 1` : 'Past year · read only'}</span>
      </div>

      <div className="grid @xl:grid-cols-[minmax(0,1fr)_380px] gap-5 items-start">
        <div className="flex flex-col gap-5 min-w-0">
          {/* Student card */}
          <Card className="p-4 @md:p-5 flex items-center gap-4">
            <Avatar name={base.name} size={56} />
            <div className="min-w-0 flex-1">
              <button onClick={() => role.access.students && go('student', { id: base.id })} className="font-display font-semibold text-[19px] leading-tight hover:underline text-left">{base.name}</button>
              <p className="text-[13px] text-ink3 truncate">{base.cls} {base.sec} · Roll {base.roll}<span className="hidden @md:inline"> · {base.father} · <span className="tnum">{base.phone}</span></span></p>
              <div className="flex gap-x-4 gap-y-0.5 mt-2 text-[13px] tnum flex-wrap">
                <span><span className="text-ink3">Year </span><b className="font-semibold">{inr(total)}</b></span>
                <span><span className="text-ink3">Paid </span><b className="font-semibold text-ok">{inr(paid)}</b></span>
                <span><span className="text-ink3">Left this year </span><b className="font-semibold text-bad">{inr(total - paid + rows.reduce((a, r) => a + r.late, 0))}</b></span>
              </div>
            </div>
            <div className="hidden @sm:block"><Ring value={(paid / total) * 100} size={64} stroke={7}><span className="text-[13px] font-bold tnum">{Math.round((paid / total) * 100)}%</span></Ring></div>
          </Card>

          {/* Dues */}
          <Card className="overflow-hidden">
            <CardHead title="What is being paid" sub="Overdue and due rows are ticked for you" action={
              paidCount > 0 && <button onClick={() => setShowPaid(!showPaid)} className="text-[13px] font-semibold text-brand h-8 px-2 rounded-lg hover:bg-brand/8">{showPaid ? 'Hide' : 'Show'} {paidCount} paid</button>
            } />
            {open.length === 0 ? (
              <Empty icon={I.PartyPopper} title="All fees paid for this year" body={`${base.first} has nothing due. Next installment is in January.`} />
            ) : (
              <ul className="border-t border-line">
                {visible.map((r) => {
                  const isPaid = r.status === 'Paid';
                  const on = ticked.has(r.id);
                  return (
                    <li key={r.id}>
                      <div onClick={() => !isPaid && toggle(r.id)} role={isPaid ? undefined : 'button'}
                        className={cx('flex items-center gap-3.5 px-4 @md:px-5 py-3 border-b border-line/70 transition', isPaid ? 'opacity-60' : 'cursor-pointer hover:bg-sunken/60', on && 'bg-brand/5', r.status === 'Overdue' && 'shadow-[inset_3px_0_0_rgb(var(--bad))]')}>
                        {isPaid ? <span className="w-5 h-5 rounded-md bg-ok/15 text-ok grid place-items-center"><I.Check size={13} strokeWidth={3} /></span> : <Checkbox checked={on} onChange={() => toggle(r.id)} label={`${r.head} ${r.inst}`} />}
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[14.5px]">{r.head} <span className="text-ink3 font-normal">· {r.inst}</span></p>
                          <p className="text-[12.5px] text-ink3">Due {r.due}{r.paid > 0 && !isPaid ? ` · ${inr(r.paid)} already paid` : ''}{r.late ? <span className="text-bad"> · late fee {inr(r.late)}</span> : ''}</p>
                        </div>
                        <Pill tone={feeTone(r.status)} className="hidden @sm:inline-flex">{r.status}</Pill>
                        <span className="w-24 text-right font-semibold tnum text-[15px]">{inr(isPaid ? r.amount : bal(r))}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        {/* Payment panel (hidden in a closed year: nothing can be collected there) */}
        {!canEdit ? (
          <Banner tone="info" icon={I.Lock} title="This year is closed.">Fees for a past year cannot be collected here. Switch to the current year to take a payment.</Banner>
        ) : (
        <Card className="@xl:sticky @xl:top-0 overflow-hidden">
          <div className="p-5 flex flex-col gap-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold text-[15px]">Payment</h2>
              <span className="text-[13px] text-ink3 tnum">{ticked.size} {ticked.size === 1 ? 'row' : 'rows'} · {inr(selTotal)}</span>
            </div>
            <Field label="Amount received" id="pay-amt" error={tried && errAmt} hint={partial ? `Part payment. ${inr(selTotal - amt)} stays due on the latest row.` : 'Change it for a part payment'}>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[22px] font-semibold text-ink3">₹</span>
                <input id="pay-amt" inputMode="numeric" value={amt ? amt.toLocaleString('en-IN') : ''} onChange={(e) => { setEdited(true); setAmount(e.target.value); }}
                  className={cx(inputCls(tried && errAmt), '!h-14 pl-10 !text-[24px] font-semibold tnum font-display')} placeholder="0" />
              </div>
            </Field>
            <div>
              <p className="text-[13px] font-semibold text-ink2 mb-1.5">How is it paid?</p>
              <div className="grid grid-cols-3 gap-1.5" role="radiogroup">
                {MODES.map((m) => (
                  <button key={m.id} role="radio" aria-checked={mode === m.id} onClick={() => { setMode(m.id); setTried(false); }}
                    className={cx('h-[58px] rounded-xl border flex flex-col items-center justify-center gap-1 text-[12.5px] font-semibold transition',
                      mode === m.id ? 'border-brand bg-brand/8 text-brand ring-1 ring-brand' : 'border-line text-ink2 hover:border-ink3/50')}>
                    <m.icon size={18} />{m.id}
                  </button>
                ))}
                <button onClick={() => setQr(true)} className="h-[58px] rounded-xl border border-dashed border-line flex flex-col items-center justify-center gap-1 text-[12.5px] font-semibold text-ink2 hover:border-brand hover:text-brand">
                  <I.QrCode size={18} />Show QR
                </button>
              </div>
            </div>
            {needRef && (
              <Field label={mode === 'UPI' ? 'UPI transaction number (UTR)' : 'Transaction number'} required id="pay-ref" error={tried && errRef}>
                <Input id="pay-ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder={mode === 'UPI' ? '12-digit UTR, like 428391027714' : 'From the card machine slip'} error={tried && errRef} className="font-mono" />
              </Field>
            )}
            {mode === 'Cheque' && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Cheque no." required id="chq-no" error={tried && errChq && errChq.startsWith('Cheque') && errChq}>
                  <Input id="chq-no" inputMode="numeric" value={chq.no} onChange={(e) => setChq({ ...chq, no: e.target.value.replace(/\D/g, '').slice(0, 6) })} placeholder="004512" className="font-mono" error={tried && errChq.startsWith('Cheque')} />
                </Field>
                <Field label="Bank" required id="chq-bank" error={tried && errChq && !errChq.startsWith('Cheque') && errChq}>
                  <Input id="chq-bank" value={chq.bank} onChange={(e) => setChq({ ...chq, bank: e.target.value })} placeholder="SBI, Kukatpally" error={tried && errChq && !errChq.startsWith('Cheque')} />
                </Field>
              </div>
            )}
            {mode === 'Cheque' && <p className="text-[12.5px] text-ink3 -mt-2 flex gap-1.5"><I.Info size={14} className="shrink-0 mt-0.5" />Cheques wait for the accountant to verify before the receipt is final.</p>}
          </div>
          <div className="border-t border-line p-4 bg-sunken/50 flex flex-col gap-2">
            <Button variant="primary" size="lg" className="w-full !h-14 !text-[16px]" icon={I.Check} loading={busy} onClick={collect} disabled={selTotal === 0}>
              {busy ? 'Saving payment…' : `Collect ${inr(amt || 0)}`}
            </Button>
            <Button variant="ghost" className="w-full" icon={I.Send} disabled={selTotal === 0} onClick={() => toast({ title: `Payment link sent to ${base.father}`, body: `${inr(selTotal)} · WhatsApp, with SMS backup. Valid 7 days.` })}>Send payment link instead</Button>
          </div>
        </Card>
        )}
      </div>

      {/* UPI QR */}
      <Sheet open={qr} onClose={() => setQr(false)} title={`Scan to pay ${inr(selTotal)}`} sub="Any UPI app works. The payment shows up here by itself.">
        <div className="flex flex-col items-center gap-4 pb-2">
          <FakeQR />
          <p className="text-[13px] text-ink3 flex items-center gap-2"><I.LoaderCircle size={15} className="animate-spin" />Waiting for {base.father} to pay…</p>
        </div>
      </Sheet>

      {/* Receipt */}
      <Sheet open={!!receipt} onClose={() => setReceipt(null)} title="" wide>
        {receipt && (
          <div className="flex flex-col items-center text-center pt-6">
            <span className="w-16 h-16 rounded-full bg-ok text-surface grid place-items-center animate-pop shadow-pop"><I.Check size={34} strokeWidth={3} /></span>
            <h2 className="font-display text-[26px] font-semibold mt-4 tnum">{inr(receipt.amt)} received</h2>
            <p className="text-ink3 text-[14px] mt-1">{base.name}’s parents got the receipt on WhatsApp.</p>
            <div className="w-full mt-5 text-left rounded-2xl border border-line overflow-hidden">
              <div className="flex justify-between items-center px-4 py-3 bg-sunken/60 text-[13px]">
                <span className="font-mono font-semibold">{receipt.no}</span><span className="text-ink3">{receipt.when}</span>
              </div>
              <ul className="px-4 py-2 text-[14px]">
                {receipt.items.map((it, i) => (
                  <li key={i} className="flex justify-between py-1.5 gap-3"><span>{it.head} <span className="text-ink3">· {it.inst}</span></span><span className="tnum font-medium">{inr(it.amt)}</span></li>
                ))}
              </ul>
              <div className="flex justify-between px-4 py-3 border-t border-line text-[14px]">
                <span className="text-ink3">{receipt.mode}{receipt.ref ? ` · ${receipt.ref}` : ''}</span><b className="tnum">{inr(receipt.amt)}</b>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 w-full mt-4">
              <Button variant="secondary" icon={I.Printer} onClick={() => toast({ title: 'Sent to the counter printer', body: 'Office copy and parent copy' })}>Print</Button>
              <Button variant="secondary" icon={I.Download} onClick={() => toast({ title: 'Receipt saved', body: `${receipt.no.replace(/\//g, '-')}.pdf` })}>PDF</Button>
              <Button variant="secondary" icon={I.MessageCircle} onClick={() => toast({ title: 'Sent again on WhatsApp' })}>Resend</Button>
            </div>
            <div className="flex gap-2 w-full mt-2">
              <Button variant="primary" className="flex-1" onClick={() => { setReceipt(null); onChange(); }}>Collect another fee</Button>
              <Button variant="ghost" onClick={() => setReceipt(null)}>Done</Button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function FakeQR() {
  // Decorative QR-like pattern for the prototype
  const cells = useMemo(() => {
    let s = 11; const r = () => ((s = (s * 48271) % 2147483647) / 2147483647);
    return Array.from({ length: 25 * 25 }, () => r() > 0.52);
  }, []);
  const finder = (x, y) => (x < 7 && y < 7) || (x > 17 && y < 7) || (x < 7 && y > 17);
  return (
    <div className="p-4 rounded-2xl bg-white shadow-card border border-line">
      <svg width="200" height="200" viewBox="0 0 25 25" shapeRendering="crispEdges" aria-label="UPI QR code">
        {cells.map((on, i) => { const x = i % 25, y = Math.floor(i / 25); return !finder(x, y) && on ? <rect key={i} x={x} y={y} width="1" height="1" fill="#0f1715" /> : null; })}
        {[[0, 0], [18, 0], [0, 18]].map(([x, y]) => (
          <g key={x + '-' + y}><rect x={x} y={y} width="7" height="7" fill="#0f1715" /><rect x={x + 1} y={y + 1} width="5" height="5" fill="#fff" /><rect x={x + 2} y={y + 2} width="3" height="3" fill="#0f1715" /></g>
        ))}
      </svg>
    </div>
  );
}
