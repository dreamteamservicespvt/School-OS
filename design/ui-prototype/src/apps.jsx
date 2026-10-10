// The "other sides" of School OS, outside the school staff app:
// the Android driver app, Parent Link's first open on a new phone, the first School Admin's invite,
// the Suspended school, and the consent card that sits inside Parent Link.
import React, { useEffect, useRef, useState } from 'react';
import * as I from './icons.js';
import { SCHOOL, PARENT, inr } from './data.js';
import { cx, Button, Pill, Avatar, Card, CardHead, Field, Input, Checkbox, Switch, Segmented, Sheet, Spinner, useToast } from './ui.jsx';
import { PhoneFrame, Progress, ConfirmSheet } from './kit.jsx';
import { useNav, useRole, Logo } from './shell.jsx';

/* ---------- Shared pieces ---------- */
const CARD = 'rounded-3xl bg-surface border border-line shadow-card p-5';
const EMPTY6 = ['', '', '', '', '', ''];
const OFFICE = '040 2305 6678';
const DT_PHONE = '040 4852 1100';

// The School OS mark, as drawn in parent.jsx and signin.jsx
const Mark = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 14a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M12 3.5v2M4.6 6.6l1.4 1.4M19.4 6.6 18 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M3 17.5h18M6 21h12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

// Brand header of a phone page (same as Parent Link)
function AppHead({ title, sub, right, children, pb = 'pb-16' }) {
  return (
    <div className={cx('bg-brand text-brandink px-5 pt-5 relative overflow-hidden', pb)}>
      <div className="absolute inset-0 dotgrid opacity-50" />
      <div className="relative flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-9 h-9 rounded-xl bg-white/15 grid place-items-center shrink-0"><Mark /></span>
          <div className="min-w-0"><p className="font-display font-semibold text-[15px] leading-tight truncate">{title}</p><p className="text-[11.5px] opacity-75 truncate">{sub}</p></div>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}
function ExitPreview() {
  const { go } = useNav();
  return <button onClick={() => go('dashboard')} className="@lg:hidden shrink-0 text-[12px] font-semibold opacity-80 h-8 px-2.5 rounded-lg bg-white/10">Exit preview</button>;
}

// Explanation next to the phone on computers (same as Parent Link)
function Aside({ eyebrow, title, body, points, children }) {
  const { go } = useNav();
  return (
    <>
      <p className="eyebrow text-brand">{eyebrow}</p>
      <h1 className="font-display text-[30px] font-semibold leading-tight tracking-tight">{title}</h1>
      <p className="text-[15px] text-ink2 leading-relaxed">{body}</p>
      <ul className="text-[14px] text-ink2 flex flex-col gap-2">
        {points.map((x) => <li key={x} className="flex gap-2"><I.Check size={17} className="text-brand shrink-0 mt-0.5" />{x}</li>)}
      </ul>
      {children}
      <Button variant="secondary" icon={I.ArrowLeft} className="self-start mt-2" onClick={() => go('dashboard')}>Back to School OS</Button>
    </>
  );
}

// Brand half of the sign-in layout (same as signin.jsx)
function BrandSide({ children }) {
  return (
    <div className="hidden @lg:flex relative overflow-hidden bg-brand text-brandink p-10 flex-col">
      <div className="absolute inset-0 dotgrid opacity-60" />
      <div className="absolute -left-24 -bottom-40 w-[520px] h-[520px] rounded-full border-[56px] border-white/[.07]" />
      <div className="relative flex items-center gap-3">
        <span className="w-11 h-11 rounded-xl bg-white/15 grid place-items-center"><Mark size={26} /></span>
        <span className="font-display font-semibold text-lg">School OS</span>
      </div>
      {children}
    </div>
  );
}

// Six code boxes, like Sign in. Pasting a whole code fills them all.
function CodeBoxes({ value, onChange, error, id, small }) {
  const boxes = useRef([]);
  const put = (i, raw) => {
    const d = raw.replace(/\D/g, '');
    const n = [...value];
    if (d.length > 1) {
      d.slice(0, 6 - i).split('').forEach((c, k) => { n[i + k] = c; });
      onChange(n);
      boxes.current[Math.min(5, i + d.length)]?.focus();
      return;
    }
    n[i] = d;
    onChange(n);
    if (d && i < 5) boxes.current[i + 1]?.focus();
  };
  return (
    <div className="flex gap-2">
      {value.map((d, i) => (
        <input key={i} id={i === 0 ? id : undefined} ref={(el) => (boxes.current[i] = el)} value={d} inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'} aria-label={`Digit ${i + 1}`}
          onChange={(e) => put(i, e.target.value)} onKeyDown={(e) => e.key === 'Backspace' && !d && i > 0 && boxes.current[i - 1]?.focus()}
          className={cx('w-full min-w-0 rounded-xl border bg-surface text-center text-[22px] font-semibold tnum outline-none transition',
            small ? 'h-12' : 'h-14', error ? 'border-bad ring-4 ring-bad/10' : 'border-line focus:border-brand focus:ring-4 focus:ring-brand/15')} />
      ))}
    </div>
  );
}
// The phone offers the code from the SMS, like the keyboard suggestion on Android
function SmsFill({ code, onFill }) {
  return (
    <button type="button" onClick={() => onFill(code.split(''))}
      className="self-start inline-flex items-center gap-2 h-9 pl-2.5 pr-3 rounded-xl bg-sunken hover:bg-line/60 text-[13px] font-semibold text-ink2 transition">
      <I.MessageSquareText size={16} className="text-brand" />Fill from SMS
      <span className="font-mono text-[12.5px] text-ink tnum">{code.slice(0, 3)} {code.slice(3)}</span>
    </button>
  );
}
function CodeError({ children }) {
  return children ? <p className="text-[12.5px] text-bad flex items-center gap-1.5" role="alert"><I.CircleAlert size={14} />{children}</p> : null;
}
function Resend({ to }) {
  const toast = useToast();
  const [left, setLeft] = useState(30);
  useEffect(() => {
    if (left <= 0) return undefined;
    const t = setTimeout(() => setLeft((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return left > 0
    ? <p className="text-[13px] text-ink3">Didn’t get it? Ask again in <span className="tnum">0:{String(left).padStart(2, '0')}</span></p>
    : <button type="button" onClick={() => { setLeft(30); toast({ title: 'New code sent', body: `To ${to}. The old code stops working.`, tone: 'info' }); }} className="self-start text-[13px] font-semibold text-brand hover:underline">Send the code again</button>;
}

// Razorpay checkout, as on Parent Link
function RazorpaySheet({ open, amount, sub, onClose, onPaid }) {
  const [m, setM] = useState('upi');
  const [busy, setBusy] = useState(false);
  return (
    <Sheet open={open} onClose={() => !busy && onClose()} title={`Pay ${inr(amount)}`} sub={sub}>
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
          {busy ? (m === 'upi' ? 'Waiting for your UPI app…' : 'Waiting for the bank…') : `Pay ${inr(amount)}`}
        </Button>
      </div>
    </Sheet>
  );
}

/* =====================================================================
   1. Driver app (small native Android app)
   ===================================================================== */
const DRIVER = { name: 'Mallesh Kumar', first: 'Mallesh', phone: '90004 52318', bus: 'Bus 4', reg: 'TS 07 UB 2236', route: 'Route 4 · Miyapur' };
const INCHARGE = { name: 'Venkatesh Goud', phone: '98852 30917' };
const START = 15 * 60 + 50; // afternoon drop leaves school at 3:50 PM
const clock = (m) => { const h = Math.floor(m / 60); return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
const kid = (n, c, absent) => ({ n, c, absent: !!absent });
// Route 4 · Miyapur: 10 stops, 49 students. `at` = minutes after leaving school.
const D_STOPS = [
  { name: 'KPHB 6th Phase', at: 12, kids: [kid('Aarav Sharma', '7 B'), kid('Anaya Sharma', 'UKG A'), kid('Ishaan Varma', '4 A'), kid('Lasya Reddy', '6 B')] },
  { name: 'Hydernagar', at: 18, kids: [kid('Charan Goud', '9 A'), kid('Meghana Rao', '5 B'), kid('Vihaan Jain', '2 A'), kid('Sri Varshini K.', '8 A'), kid('Nikhil Yadav', '10 B')] },
  { name: 'Allwyn Colony', at: 23, kids: [kid('Harshita Naidu', '3 B'), kid('Rohit Kumar', '5 A', true), kid('Pranav Chary', '7 A'), kid('Keerthi Reddy', '1 B'), kid('Aditya Rao', '6 A'), kid('Saanvi Gupta', 'LKG B')] },
  { name: 'Miyapur X Roads', at: 29, kids: [kid('Tejaswini M.', '9 B'), kid('Abhiram Reddy', '8 B'), kid('Sahasra Goud', '4 B'), kid('Rehan Khan', '7 B'), kid('Divya Sree P.', '2 B'), kid('Manish Patel', '10 A'), kid('Ananya Iyer', '3 A')] },
  { name: 'Miyapur Metro Station', at: 34, kids: [kid('Yashwanth S.', '6 B'), kid('Bhavya Reddy', 'UKG B'), kid('Krishna Teja', '9 A'), kid('Nandini Rao', '5 A'), kid('Arjun Nair', '8 A')] },
  { name: 'Mathrusri Nagar', at: 40, kids: [kid('Hamsini Varma', '2 A'), kid('Sai Kiran', '7 A'), kid('Pooja Agarwal', '10 B'), kid('Rishi Goud', '1 A')] },
  { name: 'Deepthisri Nagar', at: 45, kids: [kid('Shreya Reddy', '6 A'), kid('Vamshi Krishna', '9 B'), kid('Aadhya Rao', 'Nursery A'), kid('Kartik Sharma', '4 A'), kid('Mounika Yadav', '8 B'), kid('Zoya Fatima', '3 B', true)] },
  { name: 'Madinaguda', at: 51, kids: [kid('Siddharth Rao', '5 B'), kid('Likitha Goud', '7 B'), kid('Varun Teja', '2 B'), kid('Harini S.', '10 A'), kid('Dhruv Mehta', 'UKG A')] },
  { name: 'Hafeezpet', at: 57, kids: [kid('Akhil Kumar', '8 A'), kid('Navya Sri', '6 B'), kid('Rahul Varma', '3 A'), kid('Tanvi Joshi', '1 B')] },
  { name: 'Prashanth Nagar', at: 62, kids: [kid('Sathvik Reddy', '9 A'), kid('Pallavi Naidu', '4 B'), kid('Ayaan Siddiqui', '5 A')] },
].map((s, i) => ({ ...s, i, kids: s.kids.map((k, j) => ({ ...k, id: `${i}-${j}`, stop: s.name, small: /^(Nursery|LKG|UKG)/.test(k.c) })) }));
const ALL_KIDS = D_STOPS.flatMap((s) => s.kids);
const RIDING = ALL_KIDS.filter((k) => !k.absent); // 47 today
const ABSENT = ALL_KIDS.filter((k) => k.absent);

export function DriverApp() {
  const toast = useToast();
  const [screen, setScreen] = useState('signin');
  const [offline, setOffline] = useState(false);
  const [waiting, setWaiting] = useState(0);
  const [done, setDone] = useState(null);
  const [run, setRun] = useState(0);
  const setNet = (off) => {
    setOffline(off);
    if (off) setWaiting(3);
    else {
      if (waiting) toast({ title: 'Back online', body: `${waiting} saved updates sent to the school.` });
      setWaiting(0);
    }
  };
  const bump = () => offline && setWaiting((w) => w + 1);
  const restart = () => { setScreen('signin'); setDone(null); setRun((r) => r + 1); setOffline(false); setWaiting(0); };

  return (
    <PhoneFrame side={
      <Aside eyebrow="Driver app" title="What the bus driver sees on their phone"
        body="A small Android app from the Play Store. The driver signs in with their mobile number and a one-time code, and sees only their own bus and today’s trips."
        points={['One big button to start and end each trip', 'Tick each stop and each child who gets off', 'Sends the bus location only while a trip is running, even with the screen off', 'Keeps working without internet and sends when back online', 'A big red Emergency button']}>
        <div className="rounded-2xl border border-dashed border-line p-3.5 flex flex-col gap-3 text-[13px] text-ink3">
          <p className="font-semibold text-ink2">Design preview</p>
          <div className="flex items-center justify-between gap-3"><span>Phone has no internet</span><Switch on={offline} onChange={setNet} label="Phone has no internet" /></div>
          <button onClick={restart} className="self-start font-semibold text-brand hover:underline">Start again from sign in</button>
        </div>
      </Aside>
    }>
      {screen === 'signin' && <DriverSignIn onDone={() => setScreen('home')} />}
      {screen === 'home' && <DriverHome done={done} onStart={() => setScreen('run')} onSignOut={() => setScreen('signin')} />}
      {screen === 'run' && <DriverTrip key={run} offline={offline} waiting={waiting} setNet={setNet} bump={bump} onEnd={(s) => { setDone(s); setScreen('summary'); }} />}
      {screen === 'summary' && done && <DriverSummary sum={done} offline={offline} waiting={waiting} onBack={() => setScreen('home')} />}
    </PhoneFrame>
  );
}

function CallInCharge({ className }) {
  const toast = useToast();
  return (
    <div className={cx('text-center text-[12.5px] text-ink3 px-6 pt-2', className)}>
      Problem? Call the Transport In-charge<br />
      <button onClick={() => toast({ title: `Calling ${INCHARGE.name}`, body: `${INCHARGE.phone} · Transport In-charge`, tone: 'info' })} className="font-semibold text-ink2 hover:text-brand h-8">{INCHARGE.name} · <span className="tnum">{INCHARGE.phone}</span></button>
    </div>
  );
}

function DriverSignIn({ onDone }) {
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState(DRIVER.phone);
  const [code, setCode] = useState(EMPTY6);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const send = (e) => {
    e.preventDefault();
    if (phone.replace(/\D/g, '').length !== 10) { setErr('Enter your 10-digit mobile number'); return; }
    setBusy(true);
    setTimeout(() => { setBusy(false); setErr(''); setStep('code'); }, 800);
  };
  const verify = (e) => {
    e.preventDefault();
    if (code.join('').length < 6) { setErr('Enter all 6 digits'); return; }
    setBusy(true);
    setTimeout(() => { setBusy(false); onDone(); }, 800);
  };
  return (
    <div className="pb-10">
      <AppHead title="School OS Driver" sub={SCHOOL.name} right={<ExitPreview />}>
        <p className="relative mt-5 text-[14px] opacity-80">Namaste,</p>
        <h1 className="relative font-display text-[26px] font-semibold leading-tight">Sign in to see your trips</h1>
      </AppHead>
      <div className="px-4 -mt-12 relative flex flex-col gap-4">
        <section className={CARD}>
          {step === 'phone' ? (
            <form onSubmit={send} noValidate className="flex flex-col gap-4">
              <Field label="Your mobile number" id="drv-phone" error={err} hint="The number the school office has for you.">
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[16px] font-semibold text-ink3">+91</span>
                  <Input id="drv-phone" value={phone} inputMode="numeric" autoComplete="tel-national" error={!!err}
                    onChange={(e) => { setPhone(e.target.value); setErr(''); }} className="!h-14 !text-[16px] font-semibold tnum pl-14" />
                </div>
              </Field>
              <Button type="submit" variant="primary" size="lg" className="w-full !h-14 !text-[16px]" icon={I.MessageSquareText} loading={busy}>{busy ? 'Sending…' : 'Send code'}</Button>
            </form>
          ) : (
            <form onSubmit={verify} noValidate className="flex flex-col gap-3.5">
              <div>
                <label htmlFor="drv-code" className="font-semibold text-[15px]">Enter the code</label>
                <p className="text-[13px] text-ink3 mt-0.5">6-digit code sent by SMS to <span className="tnum font-semibold text-ink2">+91 {phone}</span></p>
              </div>
              <CodeBoxes id="drv-code" value={code} onChange={(c) => { setCode(c); setErr(''); }} error={!!err} />
              <CodeError>{err}</CodeError>
              <SmsFill code="604918" onFill={(c) => { setCode(c); setErr(''); }} />
              <Button type="submit" variant="primary" size="lg" className="w-full !h-14 !text-[16px]" icon={I.LogIn} loading={busy}>{busy ? 'Checking…' : 'Sign in'}</Button>
              <div className="flex items-center justify-between gap-3">
                <Resend to={`+91 ${phone}`} />
                <button type="button" onClick={() => { setStep('phone'); setCode(EMPTY6); setErr(''); }} className="text-[13px] font-semibold text-ink2 hover:text-ink shrink-0 h-8">Change number</button>
              </div>
            </form>
          )}
        </section>
        <div className="rounded-2xl bg-sunken/60 p-4 text-[13px] text-ink2 flex gap-3">
          <I.Info size={18} className="text-brand shrink-0 mt-0.5" />
          <p>Only drivers and conductors added by the school can sign in. You will see only your own bus and today’s trips.</p>
        </div>
        <CallInCharge />
      </div>
    </div>
  );
}

function TripRow({ icon: Ic, title, time, status, tone, detail, active }) {
  return (
    <li className={cx('rounded-2xl border p-3.5 flex items-start gap-3', active ? 'border-brand ring-1 ring-brand bg-brand/5' : 'border-line')}>
      <span className={cx('w-10 h-10 rounded-xl grid place-items-center shrink-0', active ? 'bg-brand/10 text-brand' : 'bg-sunken text-ink2')}><Ic size={19} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2"><p className="font-semibold text-[15px]">{title}</p><Pill tone={tone}>{status}</Pill></div>
        <p className="text-[13px] text-ink2 tnum mt-0.5">{time}</p>
        <p className="text-[12.5px] text-ink3 mt-0.5">{detail}</p>
      </div>
    </li>
  );
}

function DriverHome({ done, onStart, onSignOut }) {
  const papers = [
    ['Driving licence', 'Valid till 14 Mar 2028', 'ok'],
    ['Bus insurance', 'Valid till 30 Jun 2027', 'ok'],
    ['Fitness certificate', 'Valid till 12 Jan 2027', 'ok'],
    ['Pollution certificate', 'Ends 2 Nov 2026 · 24 days left', 'warn'],
  ];
  return (
    <div className="pb-10">
      <AppHead title="School OS Driver" sub={SCHOOL.name}
        right={<button onClick={onSignOut} className="shrink-0 text-[12px] font-semibold opacity-80 h-8 px-2.5 rounded-lg bg-white/10 inline-flex items-center gap-1.5"><I.LogOut size={14} />Sign out</button>}>
        <p className="relative mt-5 text-[14px] opacity-80">Namaste,</p>
        <h1 className="relative font-display text-[26px] font-semibold leading-tight">{DRIVER.name}</h1>
        <p className="relative text-[13px] opacity-80 mt-0.5">{DRIVER.bus} · <span className="tnum">{DRIVER.reg}</span> · {DRIVER.route}</p>
      </AppHead>
      <div className="px-4 -mt-12 relative flex flex-col gap-4">
        <section className={CARD}>
          <div className="flex items-center justify-between gap-3"><p className="font-semibold text-[15px]">Today’s trips</p><p className="text-[13px] text-ink3">Fri, 9 Oct</p></div>
          <ul className="mt-3 flex flex-col gap-2.5">
            <TripRow icon={I.Sunrise} title="Morning pickup" time="7:05 AM to 8:14 AM" status="Completed" tone="ok" detail="47 of 49 boarded · 2 absent · 10 stops" />
            {done
              ? <TripRow icon={I.Sunset} title="Afternoon drop" time={`3:50 PM to ${done.end}`} status="Completed" tone="ok" detail={`${done.dropped} dropped · ${done.stops} of 10 stops`} />
              : <TripRow icon={I.Sunset} title="Afternoon drop" time="Leaves school at 3:50 PM" status="Next" tone="brand" detail="47 children · 10 stops · 2 absent today" active />}
          </ul>
          {done ? (
            <div className="mt-4 rounded-2xl bg-ok/10 p-3.5 flex items-center gap-3 text-[14px]"><I.CircleCheck size={19} className="text-ok shrink-0" /><p className="text-ink2"><b className="font-semibold text-ink">All trips done for today.</b> Thank you, {DRIVER.first}.</p></div>
          ) : (
            <>
              <Button variant="primary" size="lg" className="w-full !h-16 !text-[16px] mt-4" icon={I.Play} onClick={onStart}>Start trip</Button>
              <p className="text-[12px] text-ink3 text-center mt-2 flex items-center justify-center gap-1.5"><I.MapPin size={13} />Your location is shared only while a trip is running</p>
            </>
          )}
        </section>

        <section className={CARD}>
          <p className="font-semibold text-[15px]">Not on the bus today</p>
          <p className="text-[13px] text-ink3">From this morning’s attendance</p>
          <ul className="mt-2 divide-y divide-line/70">
            {ABSENT.map((k) => (
              <li key={k.id} className="flex items-center gap-3 py-2.5">
                <Avatar name={k.n} size={36} />
                <div className="min-w-0 flex-1"><p className="font-semibold text-[14px] truncate">{k.n}</p><p className="text-[12.5px] text-ink3 truncate">Class {k.c} · {k.stop}</p></div>
                <Pill>Absent</Pill>
              </li>
            ))}
          </ul>
        </section>

        <section className={CARD}>
          <p className="font-semibold text-[15px] mb-1">Your papers</p>
          <ul className="divide-y divide-line/70">
            {papers.map(([t, s, tone]) => (
              <li key={t} className="flex items-center gap-3 py-2.5">
                <span className={cx('w-9 h-9 rounded-xl grid place-items-center shrink-0', tone === 'warn' ? 'bg-warn/12 text-warn' : 'bg-ok/10 text-ok')}>{tone === 'warn' ? <I.TriangleAlert size={17} /> : <I.FileCheck size={17} />}</span>
                <div className="min-w-0 flex-1"><p className="font-semibold text-[14px]">{t}</p><p className={cx('text-[12.5px]', tone === 'warn' ? 'text-warn font-semibold' : 'text-ink3')}>{s}</p></div>
              </li>
            ))}
          </ul>
        </section>
        <CallInCharge />
      </div>
    </div>
  );
}

// One child at a stop, with a big "Drop" button
function DropRow({ k, state, onDrop }) {
  return (
    <li className={cx('flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition', state === 'dropped' ? 'border-ok/40 bg-ok/[.05]' : 'border-line')}>
      <Avatar name={k.n} size={38} className="hidden @sm:inline-grid" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-[15px] truncate">{k.n}</p>
        <p className="text-[12.5px] text-ink3 truncate">Class {k.c}</p>
        {k.small && state !== 'absent' && <p className="text-[12px] text-warn font-semibold flex items-center gap-1 mt-0.5"><I.Hand size={13} />Hand over to a parent</p>}
      </div>
      {state === 'absent' ? <Pill>Absent today</Pill> : state === 'notboarded' ? <Pill tone="warn">Not on bus</Pill> : (
        <button onClick={onDrop} aria-pressed={state === 'dropped'} aria-label={`${state === 'dropped' ? 'Undo dropped for' : 'Dropped'} ${k.n}`}
          className={cx('h-12 min-w-[112px] px-3 rounded-xl border-2 font-bold text-[14.5px] inline-flex items-center justify-center gap-1.5 transition shrink-0',
            state === 'dropped' ? 'bg-ok border-ok text-surface' : 'border-line text-ink hover:border-ink3')}>
          {state === 'dropped' ? <><I.Check size={18} strokeWidth={3} />Dropped</> : 'Drop'}
        </button>
      )}
    </li>
  );
}

function DriverTrip({ offline, waiting, setNet, bump, onEnd }) {
  const toast = useToast();
  const [phase, setPhase] = useState('board');
  const [oneByOne, setOneByOne] = useState(false);
  const [board, setBoard] = useState({});
  const [cur, setCur] = useState(0);
  const [reached, setReached] = useState({});
  const [dropped, setDropped] = useState({});
  const [open, setOpen] = useState(null);
  const [sos, setSos] = useState(false);
  const [sent, setSent] = useState(null);
  const [brk, setBrk] = useState(false);
  const [why, setWhy] = useState('');
  const [endAsk, setEndAsk] = useState(false);

  const stop = D_STOPS[cur];
  const isOn = (k) => board[k.id] === 'B';
  const onBus = RIDING.filter((k) => isOn(k) && !dropped[k.id]);
  const droppedN = Object.keys(dropped).length;
  const boardedN = RIDING.filter(isOn).length;
  const notBoarded = RIDING.filter((k) => board[k.id] === 'N');
  const marked = RIDING.filter((k) => board[k.id]).length;
  const toDrop = stop ? stop.kids.filter(isOn) : [];
  const leftHere = toDrop.filter((k) => !dropped[k.id]);
  const atStop = stop && reached[cur] != null;
  const stopDone = atStop && leftHere.length === 0;
  const nowMin = phase === 'board' ? START : START + D_STOPS[Math.min(cur, 9)].at + (cur > 9 ? 4 : 0);
  const kidState = (k) => (k.absent ? 'absent' : board[k.id] === 'N' ? 'notboarded' : dropped[k.id] ? 'dropped' : 'onbus');

  const leave = (all) => {
    if (all) setBoard(Object.fromEntries(RIDING.map((k) => [k.id, 'B'])));
    const n = all ? RIDING.length : boardedN;
    setPhase('drive'); bump();
    toast({ title: `Left school at 3:50 PM with ${n} children`, body: offline ? 'Saved on this phone. Parents are told when it sends.' : 'Parents of Route 4 got “Bus has left school” on WhatsApp.' });
  };
  const reach = () => { setReached((r) => ({ ...r, [cur]: START + stop.at + 1 })); bump(); };
  const drop = (k) => { setDropped((d) => { const n = { ...d }; if (n[k.id]) delete n[k.id]; else n[k.id] = true; return n; }); bump(); };
  const dropAll = () => { setDropped((d) => ({ ...d, ...Object.fromEntries(toDrop.map((k) => [k.id, true])) })); bump(); };
  const next = () => {
    if (toDrop.length) toast({ title: `${toDrop.length} ${toDrop.length === 1 ? 'parent' : 'parents'} told`, body: `“Your child got off the bus at ${stop.name}, ${clock(reached[cur])}.”`, ms: 3000 });
    setCur(cur + 1); setOpen(null);
  };
  const finish = () => {
    const end = cur > 9 ? START + 67 : nowMin + 2;
    onEnd({ end: clock(end), mins: end - START, stops: Object.keys(reached).length, dropped: droppedN, notBoarded: notBoarded.length, onBus: onBus.length, sos: sent });
  };
  const endTrip = () => (onBus.length ? setEndAsk(true) : finish());
  const sendSos = () => {
    setSos(false); setSent(clock(nowMin + 1));
    toast({ tone: 'bad', title: 'Emergency alert sent', body: offline ? 'Sent by SMS with your last location.' : `${INCHARGE.name} and the school office have been alerted.` });
  };

  return (
    <div>
      <AppHead title="School OS Driver" sub={`${DRIVER.route} · ${DRIVER.bus}`} pb="pb-14"
        right={
          <button onClick={() => setNet(!offline)} title="Design preview: tap to switch the phone’s internet off or on" aria-label={offline ? 'Offline. Design preview: tap to go back online' : 'Live. Design preview: tap to go offline'}
            className={cx('shrink-0 inline-flex items-center gap-2 h-7 px-2.5 rounded-full text-[12px] font-semibold', offline ? 'bg-warn text-surface' : 'bg-white/15')}>
            {offline ? <><I.WifiOff size={13} />Offline</> : <><span className="relative flex w-2 h-2"><span className="absolute inset-0 rounded-full bg-current animate-ping opacity-75" /><span className="relative w-2 h-2 rounded-full bg-current" /></span>Live</>}
          </button>}>
        <p className="relative mt-5 text-[14px] opacity-80 tnum">Started 3:50 PM</p>
        <h1 className="relative font-display text-[26px] font-semibold leading-tight">Afternoon drop</h1>
        <p className="relative mt-1 text-[13px] opacity-85 flex items-center gap-1.5">
          {offline ? <><I.CloudOff size={14} />Offline: location saved on this phone</> : <><I.Navigation size={14} />Sending bus location · every 30 sec</>}
        </p>
      </AppHead>

      <div className="px-4 -mt-10 relative flex flex-col gap-4 pb-4">
        {offline && (
          <div className="rounded-2xl bg-surface border border-warn/40 shadow-card p-4 flex gap-3" role="status">
            <span className="w-10 h-10 rounded-xl bg-warn/12 text-warn grid place-items-center shrink-0"><I.WifiOff size={19} /></span>
            <div className="min-w-0"><p className="font-semibold text-[14.5px] leading-snug">Offline: saved on this phone, will send when online</p><p className="text-[13px] text-ink3 mt-0.5"><span className="tnum">{waiting}</span> updates waiting. Keep marking as usual.</p></div>
          </div>
        )}

        {sent && (
          <div className="rounded-3xl bg-surface border-2 border-bad shadow-card p-5" role="alert">
            <div className="flex gap-3">
              <span className="w-11 h-11 rounded-2xl bg-bad text-white grid place-items-center shrink-0"><I.Siren size={21} /></span>
              <div className="min-w-0"><p className="font-semibold text-[15px] text-bad">Emergency alert sent at {sent}</p><p className="text-[13.5px] text-ink2 mt-0.5">{INCHARGE.name} and the school office have your location. Stay with the children and keep this phone on.</p></div>
            </div>
            <div className="flex flex-col gap-2 mt-4">
              <Button variant="danger" size="lg" className="w-full" icon={I.PhoneCall} onClick={() => toast({ title: `Calling ${INCHARGE.name}`, body: INCHARGE.phone, tone: 'info' })}>Call {INCHARGE.name}</Button>
              <Button variant="secondary" className="w-full" onClick={() => { setSent(null); toast({ title: 'Alert closed', body: 'The school has been told everyone is safe.', tone: 'info' }); }}>All safe now: close the alert</Button>
            </div>
          </div>
        )}

        {phase === 'board' ? (
          <section className={CARD}>
            <p className="eyebrow text-brand">Before you leave school</p>
            <h2 className="font-display text-[26px] font-semibold leading-tight mt-1">Boarding at school</h2>
            <p className="text-[14px] text-ink2 mt-0.5">{RIDING.length} children go home on this bus today. {ABSENT.length} are absent.</p>
            {!oneByOne ? (
              <>
                <Button variant="primary" size="lg" className="w-full !h-14 !text-[16px] mt-4" icon={I.CheckCheck} onClick={() => leave(true)}>All {RIDING.length} boarded, leave school</Button>
                <Button variant="ghost" className="w-full mt-2" icon={I.ListChecks} onClick={() => setOneByOne(true)}>Someone missing? Mark one by one</Button>
              </>
            ) : (
              <>
                <div className="mt-4 flex items-center justify-between gap-3 text-[13px]">
                  <span className="text-ink3 tnum">{marked} of {RIDING.length} marked</span>
                  <button onClick={() => setBoard((b) => ({ ...Object.fromEntries(RIDING.map((k) => [k.id, 'B'])), ...b }))} className="font-semibold text-brand h-8">Mark the rest boarded</button>
                </div>
                <ul className="mt-1 flex flex-col gap-2">
                  {RIDING.map((k) => {
                    const v = board[k.id];
                    return (
                      <li key={k.id} className={cx('flex items-center gap-3 rounded-2xl border px-3 py-2', v === 'N' ? 'border-bad/40 bg-bad/[.04]' : v === 'B' ? 'border-ok/40 bg-ok/[.04]' : 'border-line')}>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[14.5px] truncate">{k.n}</p>
                          <p className={cx('text-[12.5px] truncate', v === 'N' ? 'text-bad font-semibold' : v === 'B' ? 'text-ok font-semibold' : 'text-ink3')}>{v === 'N' ? 'Not boarded' : v === 'B' ? 'Boarded' : `Class ${k.c} · ${k.stop}`}</p>
                        </div>
                        <div className="flex gap-1.5" role="radiogroup" aria-label={`Boarding for ${k.n}`}>
                          {[['B', 'Boarded', I.Check, 'bg-ok border-ok text-surface'], ['N', 'Not boarded', I.X, 'bg-bad border-bad text-surface']].map(([val, label, Ic, on]) => (
                            <button key={val} role="radio" aria-checked={v === val} aria-label={label} onClick={() => setBoard((b) => ({ ...b, [k.id]: val }))}
                              className={cx('w-12 h-12 rounded-xl border-2 grid place-items-center transition', v === val ? on : 'border-line text-ink3 hover:border-ink3')}>
                              <Ic size={20} strokeWidth={2.6} />
                            </button>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {notBoarded.length > 0 && <p className="text-[12.5px] text-ink3 mt-3">Not boarded: {notBoarded.map((k) => k.n).join(', ')}. {INCHARGE.name} is told when you leave.</p>}
                <Button variant="primary" size="lg" className="w-full !h-14 !text-[16px] mt-4" icon={I.Bus} disabled={marked < RIDING.length} onClick={() => leave(false)}>
                  {marked < RIDING.length ? `${RIDING.length - marked} still to mark` : `Leave school · ${boardedN} on the bus`}
                </Button>
              </>
            )}
          </section>
        ) : cur <= 9 ? (
          <section className={cx(CARD, '!p-0 overflow-hidden')}>
            <div className="p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="eyebrow text-brand">{atStop ? 'At stop' : 'Next stop'} · {cur + 1} of 10</p>
                <p className="text-[12.5px] text-ink3 tnum">{atStop ? `Reached ${clock(reached[cur])}` : `Around ${clock(START + stop.at)}`}</p>
              </div>
              <h2 className="font-display text-[26px] font-semibold leading-tight mt-1">{stop.name}</h2>
              <p className="text-[14px] text-ink2 mt-0.5">{toDrop.length ? `Drop ${toDrop.length} ${toDrop.length === 1 ? 'child' : 'children'}` : 'No one to drop here today'}{stop.kids.some((k) => k.absent) ? ` · ${stop.kids.filter((k) => k.absent).length} absent` : ''}</p>
              <Progress value={(droppedN / Math.max(1, boardedN)) * 100} className="mt-4" />
              <p className="text-[12px] text-ink3 mt-1.5 tnum">{droppedN} of {boardedN} children dropped</p>
            </div>
            {!atStop ? (
              <div className="px-5 pb-5">
                <Button variant="primary" size="lg" className="w-full !h-14 !text-[16px]" icon={I.MapPin} onClick={reach}>Reached this stop</Button>
                <p className="text-[12px] text-ink3 text-center mt-2">It also marks itself when the bus reaches the stop</p>
              </div>
            ) : (
              <>
                <ul className="px-3 flex flex-col gap-2">
                  {stop.kids.map((k) => <DropRow key={k.id} k={k} state={kidState(k)} onDrop={() => drop(k)} />)}
                </ul>
                <div className="p-5 pt-3 flex flex-col gap-2">
                  {!stopDone && leftHere.length > 1 && <Button variant="secondary" size="lg" className="w-full" icon={I.CheckCheck} onClick={dropAll}>All {leftHere.length} dropped</Button>}
                  {stopDone && (
                    <>
                      <Button variant="primary" size="lg" className="w-full !h-14 !text-[16px]" iconRight={I.ArrowRight} onClick={next}>{cur < 9 ? 'Go to next stop' : 'Last stop done'}</Button>
                      {cur < 9 && <p className="text-[12.5px] text-ink3 text-center">Next: {D_STOPS[cur + 1].name}, around {clock(START + D_STOPS[cur + 1].at)}</p>}
                    </>
                  )}
                </div>
              </>
            )}
          </section>
        ) : (
          <section className={cx(CARD, 'flex flex-col items-center text-center')}>
            <span className="w-14 h-14 rounded-full bg-ok text-surface grid place-items-center animate-pop"><I.Flag size={26} /></span>
            <h2 className="font-display text-[22px] font-semibold mt-3">All 10 stops done</h2>
            <p className="text-[14px] text-ink2 mt-1">{droppedN} children dropped. End the trip to stop sending the bus location.</p>
            <Button variant="primary" size="lg" className="w-full !h-14 !text-[16px] mt-4" icon={I.CircleStop} onClick={endTrip}>End trip</Button>
          </section>
        )}

        {phase === 'drive' && (
          <div className="grid grid-cols-3 rounded-3xl bg-surface border border-line shadow-card overflow-hidden divide-x divide-line/70">
            {[['On the bus', onBus.length], ['Dropped', droppedN], ['Stops left', Math.max(0, 10 - cur)]].map(([l, v]) => (
              <div key={l} className="px-4 py-3"><p className="font-display text-[26px] font-semibold tnum leading-none">{v}</p><p className="text-[12px] text-ink3 font-semibold mt-1">{l}</p></div>
            ))}
          </div>
        )}

        <section className={CARD}>
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-[15px]">All stops</p>
            <p className="text-[13px] text-ink3 tnum">{phase === 'board' ? '10 stops · 49 children' : `${Math.min(cur, 10)} of 10 done`}</p>
          </div>
          <ol className="mt-1 divide-y divide-line/70">
            {D_STOPS.map((s, i) => {
              const st = phase === 'board' ? 'next' : i < cur ? 'done' : i === cur ? 'now' : 'next';
              const n = s.kids.filter((k) => !k.absent).length;
              const dn = s.kids.filter((k) => dropped[k.id]).length;
              return (
                <li key={s.name}>
                  <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="w-full flex items-center gap-3 py-3 text-left">
                    <span className={cx('w-8 h-8 rounded-full grid place-items-center text-[13px] font-bold shrink-0 tnum',
                      st === 'done' ? 'bg-ok text-surface' : st === 'now' ? 'bg-brand text-brandink' : 'bg-sunken text-ink3')}>
                      {st === 'done' ? <I.Check size={16} strokeWidth={3} /> : i + 1}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={cx('block font-semibold text-[14.5px] truncate', st === 'done' && 'text-ink2')}>{s.name}</span>
                      <span className="block text-[12.5px] text-ink3 tnum">{st === 'done' ? `Reached ${clock(reached[i])} · ${dn} dropped` : `Around ${clock(START + s.at)} · ${n} ${n === 1 ? 'child' : 'children'}`}</span>
                    </span>
                    {st === 'now' && <Pill tone="brand">Now</Pill>}
                    <I.ChevronDown size={18} className={cx('text-ink3 transition shrink-0', open === i && 'rotate-180')} />
                  </button>
                  {open === i && (
                    <ul className="pb-3 pl-11 flex flex-col gap-1.5">
                      {s.kids.map((k) => {
                        const ks = kidState(k);
                        return (
                          <li key={k.id} className="flex items-center justify-between gap-2 text-[13.5px]">
                            <span className="truncate">{k.n} <span className="text-ink3">· {k.c}</span></span>
                            {ks === 'absent' ? <Pill>Absent</Pill> : ks === 'notboarded' ? <Pill tone="warn">Not on bus</Pill> : ks === 'dropped' ? <Pill tone="ok">Dropped</Pill> : <Pill tone="info">{phase === 'board' ? 'To board' : 'On bus'}</Pill>}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        <section className={CARD}>
          <p className="font-semibold text-[15px]">Need help?</p>
          <div className="flex flex-col gap-2 mt-3">
            <Button variant="secondary" size="lg" className="w-full !justify-start" icon={I.Wrench} onClick={() => setBrk(true)}>Report breakdown</Button>
            <Button variant="secondary" size="lg" className="w-full !justify-start" icon={I.Phone} onClick={() => toast({ title: `Calling ${INCHARGE.name}`, body: `${INCHARGE.phone} · Transport In-charge`, tone: 'info' })}>Call Transport In-charge</Button>
          </div>
        </section>

        <div className="@lg:hidden rounded-2xl border border-dashed border-line p-3.5 flex items-center justify-between gap-3 text-[13px] text-ink3">
          <span><b className="font-semibold text-ink2">Design preview:</b> phone has no internet</span>
          <Switch on={offline} onChange={setNet} label="Phone has no internet" />
        </div>
      </div>

      {/* Always within reach */}
      <div className="sticky bottom-0 z-10 px-4 pt-3 pb-4 bg-gradient-to-t from-bg via-bg to-bg/0 flex gap-2.5">
        <Button variant="danger" size="lg" className="flex-1 !h-14 !text-[16px] shadow-pop" icon={I.Siren} onClick={() => setSos(true)}>Emergency</Button>
        <Button variant="secondary" size="lg" className="!h-14 shadow-pop" icon={I.CircleStop} onClick={endTrip}>End trip</Button>
      </div>

      <Sheet open={sos} onClose={() => setSos(false)} title="Send an emergency alert?" sub="Press only if the children or the bus are in danger: an accident, a fire, a fight or a sick child."
        footer={<><Button variant="ghost" onClick={() => setSos(false)}>Cancel</Button><Button variant="danger" icon={I.Siren} onClick={sendSos}>Send emergency alert</Button></>}>
        <p className="text-[13px] font-semibold text-ink2 mb-3">What happens when you send it</p>
        <ul className="flex flex-col gap-3.5">
          {[
            [I.BellRing, `${INCHARGE.name} and the school are alerted at once`, `The Transport In-charge, the Principal and the school office get an alarm with the bus location and the ${onBus.length || RIDING.length} children on board.`],
            [I.PhoneCall, 'The school calls you back', `On ${DRIVER.phone}, within a minute. Keep this phone with you.`],
            [I.MessageSquareText, 'Parents of Route 4 are messaged', `A ready message goes to the parents of the children on the bus as soon as ${INCHARGE.name} checks it.`],
          ].map(([Ic, t, b]) => (
            <li key={t} className="flex gap-3">
              <span className="w-10 h-10 rounded-xl bg-bad/10 text-bad grid place-items-center shrink-0"><Ic size={19} /></span>
              <div><p className="font-semibold text-[14.5px] leading-snug">{t}</p><p className="text-[13px] text-ink3 mt-0.5">{b}</p></div>
            </li>
          ))}
        </ul>
        {offline && <p className="mt-4 rounded-xl bg-warn/12 p-3 text-[13px] text-ink2 flex gap-2"><I.WifiOff size={16} className="text-warn shrink-0 mt-0.5" />No internet: the alert goes by SMS instead, with your last known location.</p>}
      </Sheet>

      <Sheet open={brk} onClose={() => setBrk(false)} title="Report a breakdown" sub="Your bus location is sent with the report.">
        <div className="flex flex-col gap-4">
          <div role="radiogroup" aria-label="What happened" className="grid grid-cols-2 gap-2">
            {['Flat tyre', 'Engine trouble', 'Minor accident', 'Something else'].map((r) => (
              <button key={r} role="radio" aria-checked={why === r} onClick={() => setWhy(r)}
                className={cx('h-14 rounded-2xl border px-3 text-[14px] font-semibold transition', why === r ? 'border-brand ring-1 ring-brand bg-brand/5 text-ink' : 'border-line text-ink2 hover:border-ink3/50')}>{r}</button>
            ))}
          </div>
          <p className="text-[13px] text-ink3">{INCHARGE.name} will call you and send another bus if needed. Parents are messaged only after he confirms.</p>
          <Button variant="primary" size="lg" className="w-full !h-14" icon={I.Send} disabled={!why}
            onClick={() => { setBrk(false); bump(); toast({ title: 'Breakdown reported', body: `${why} · ${INCHARGE.name} will call you now.` }); setWhy(''); }}>Send to Transport In-charge</Button>
        </div>
      </Sheet>

      <ConfirmSheet open={endAsk} onClose={() => setEndAsk(false)} danger confirmLabel="End trip anyway" onConfirm={finish}
        title={`${onBus.length} ${onBus.length === 1 ? 'child is' : 'children are'} still on the bus`} sub="End the trip only when every child is off the bus.">
        <ul className="rounded-2xl border border-line divide-y divide-line/70 text-[14px]">
          {onBus.slice(0, 5).map((k) => <li key={k.id} className="flex justify-between gap-3 px-3.5 py-2.5"><span className="font-semibold truncate">{k.n}</span><span className="text-ink3 shrink-0">{k.stop}</span></li>)}
          {onBus.length > 5 && <li className="px-3.5 py-2.5 text-ink3">and {onBus.length - 5} more</li>}
        </ul>
        <p className="text-[13px] text-ink3 mt-3">If you end now, {INCHARGE.name} is told which children are still marked on the bus.</p>
      </ConfirmSheet>
    </div>
  );
}

function DriverSummary({ sum, offline, waiting, onBack }) {
  const dur = sum.mins >= 60 ? `${Math.floor(sum.mins / 60)} h ${sum.mins % 60} min` : `${sum.mins} min`;
  return (
    <div className="pb-10">
      <AppHead title="School OS Driver" sub={SCHOOL.name} right={<ExitPreview />}>
        <p className="relative mt-5 text-[14px] opacity-80">Afternoon drop</p>
        <h1 className="relative font-display text-[26px] font-semibold leading-tight">Trip ended</h1>
      </AppHead>
      <div className="px-4 -mt-12 relative flex flex-col gap-4">
        <section className={cx(CARD, 'flex flex-col items-center text-center')}>
          <span className="w-16 h-16 rounded-full bg-ok text-surface grid place-items-center animate-pop shadow-pop"><I.Check size={34} strokeWidth={3} /></span>
          <p className="font-display text-[22px] font-semibold mt-3">{sum.onBus ? 'Trip ended early' : `Well done, ${DRIVER.first}`}</p>
          <p className="text-[14px] text-ink3 mt-0.5 tnum">3:50 PM to {sum.end} · {dur}</p>
          <div className="grid grid-cols-2 gap-px bg-line/70 rounded-2xl overflow-hidden border border-line/70 w-full mt-5 text-left">
            {[['Stops reached', `${sum.stops} of 10`], ['Children dropped', sum.dropped], ['Not boarded', sum.notBoarded], ['Absent today', ABSENT.length]].map(([l, v]) => (
              <div key={l} className="bg-surface px-4 py-3"><p className="text-[12px] text-ink3 font-semibold">{l}</p><p className="font-display text-[22px] font-semibold tnum leading-tight">{v}</p></div>
            ))}
          </div>
          {sum.onBus > 0 && <p className="w-full mt-3 rounded-xl bg-warn/12 p-3 text-[13px] text-ink2 text-left flex gap-2"><I.TriangleAlert size={16} className="text-warn shrink-0 mt-0.5" />{sum.onBus} {sum.onBus === 1 ? 'child was' : 'children were'} still marked on the bus. {INCHARGE.name} has been told.</p>}
        </section>
        <section className={CARD}>
          <ul className="flex flex-col gap-3.5">
            {[
              offline ? [I.CloudOff, 'Saved on this phone', `${waiting} updates will be sent when the phone is online.`] : [I.MapPinOff, 'Bus location sharing stopped', 'Nothing is sent until you start your next trip.'],
              [I.Send, `Trip report sent to ${INCHARGE.name}`, 'Stops, times and every child dropped.'],
              ...(sum.dropped ? [[I.MessageSquareText, 'Parents were told', 'Each parent got a message when their child got off the bus.']] : []),
              ...(sum.sos ? [[I.Siren, `Emergency alert at ${sum.sos}`, 'Kept in the trip report.']] : []),
            ].map(([Ic, t, b]) => (
              <li key={t} className="flex gap-3">
                <span className="w-9 h-9 rounded-xl bg-sunken text-ink2 grid place-items-center shrink-0"><Ic size={17} /></span>
                <div><p className="font-semibold text-[14px]">{t}</p><p className="text-[13px] text-ink3">{b}</p></div>
              </li>
            ))}
          </ul>
        </section>
        <Button variant="primary" size="lg" className="w-full !h-14 !text-[16px]" icon={I.ArrowLeft} onClick={onBack}>Back to today’s trips</Button>
      </div>
    </div>
  );
}

/* =====================================================================
   2. Parent Link opened for the first time on a new phone
   ===================================================================== */
const PARENT_MASK = '+91 98XXX X0211';
const KEEPS = [
  [I.GraduationCap, 'Name, date of birth, class, photo and Aadhaar (shown masked)', 'For admission records, report cards and the returns the government asks for (UDISE+, APAAR).'],
  [I.CalendarCheck2, 'Attendance, marks and report cards', 'To teach your children and tell you how they are doing.'],
  [I.IndianRupee, 'Fees, payments and receipts', 'For the school accounts and your receipts. Online payments go through Razorpay.'],
  [I.Phone, 'Your phone number, email and address', 'To send absence alerts, fee reminders and notices.'],
  [I.Bus, 'Bus stop and who picks them up', 'To get your children home safely (Route 4 · KPHB 6th Phase).'],
  [I.HeartPulse, 'Blood group and allergies', 'To help them quickly in a medical emergency.'],
];

export function ParentFirstOpen() {
  return (
    <PhoneFrame side={
      <Aside eyebrow="Parent Link" title="The first time a parent opens their link"
        body="When the link is opened on a new phone, a one-time code to the parent’s registered mobile confirms it is really them. Then the parent agrees to how the school uses the children’s data, as India’s DPDP Act 2023 asks."
        points={['6-digit code to the mobile number on the school record', 'A plain list of what the school keeps and why', 'Photo consent asked separately, for each child', 'Staff can never tick consent for a parent', 'Saved with the consent text version and the date']} />
    }>
      <ParentFirst />
    </PhoneFrame>
  );
}

function ParentFirst() {
  const { go } = useNav();
  const toast = useToast();
  const [step, setStep] = useState('code');
  const [code, setCode] = useState(EMPTY6);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [agree, setAgree] = useState(false);
  const [photo, setPhoto] = useState({ c1: false, c2: false });
  const [cErr, setCErr] = useState('');
  const kids = PARENT.children;
  const first = (k) => k.name.split(' ')[0];
  const names = kids.map(first).join(' and ');

  const checkCode = (e) => {
    e.preventDefault();
    if (code.join('').length < 6) { setErr('Enter all 6 digits from the SMS'); return; }
    setBusy(true);
    setTimeout(() => { setBusy(false); setStep('consent'); }, 900);
  };
  const giveConsent = () => {
    if (!agree) { setCErr(`Please tick the first box to go on. Without it the school cannot use ${names}’s details on Parent Link.`); return; }
    setBusy(true);
    setTimeout(() => { setBusy(false); setStep('done'); }, 900);
  };
  const yes = kids.filter((k) => photo[k.id]).map(first);
  const no = kids.filter((k) => !photo[k.id]).map(first);
  const photoLine = !yes.length ? 'Not given. You can change this any time.' : !no.length ? `Yes for ${yes.join(' and ')}` : `Yes for ${yes.join(' and ')}, no for ${no.join(' and ')}`;
  const idx = step === 'code' ? 0 : 1;

  return (
    <div className="pb-10">
      <AppHead title={SCHOOL.name} sub="Parent Link" right={<ExitPreview />}>
        <p className="relative mt-5 text-[14px] opacity-80">{step === 'code' ? 'Welcome to' : 'Namaste,'}</p>
        <h1 className="relative font-display text-[26px] font-semibold leading-tight">{step === 'code' ? 'Your Parent Link' : PARENT.name}</h1>
        {step !== 'done' && (
          <div className="relative mt-3 flex items-center gap-2.5 text-[12px] font-semibold opacity-90">
            <span className="flex gap-1">{[0, 1].map((i) => <span key={i} className={cx('h-1.5 w-8 rounded-full', i <= idx ? 'bg-current' : 'bg-white/15')} />)}</span>
            Step {idx + 1} of 2 · {idx === 0 ? 'Confirm it’s you' : 'Your consent'}
          </div>
        )}
      </AppHead>

      <div className="px-4 -mt-12 relative flex flex-col gap-4">
        {step === 'code' && (
          <>
            <section className={CARD}>
              <span className="w-12 h-12 rounded-2xl bg-brand/10 text-brand grid place-items-center"><I.ShieldCheck size={22} /></span>
              <h2 className="font-display text-[22px] font-semibold leading-tight mt-3">Confirm it’s you</h2>
              <p className="text-[14px] text-ink2 mt-1">This link is being opened on a new phone. We sent a 6-digit code by SMS to <b className="font-semibold text-ink tnum whitespace-nowrap">{PARENT_MASK}</b>.</p>
              <form onSubmit={checkCode} noValidate className="mt-4 flex flex-col gap-3">
                <label htmlFor="pl-code" className="text-[13px] font-semibold text-ink2">6-digit code</label>
                <CodeBoxes id="pl-code" value={code} onChange={(c) => { setCode(c); setErr(''); }} error={!!err} />
                <CodeError>{err}</CodeError>
                <SmsFill code="482913" onFill={(c) => { setCode(c); setErr(''); }} />
                <Button type="submit" variant="primary" size="lg" className="w-full !h-14 !text-[16px] mt-1" loading={busy}>{busy ? 'Checking…' : 'Confirm'}</Button>
                <Resend to={PARENT_MASK} />
              </form>
            </section>
            <section className={cx(CARD, 'flex gap-4')}>
              <span className="w-12 h-12 rounded-2xl bg-sunken text-ink2 grid place-items-center shrink-0"><I.Lock size={21} /></span>
              <div className="min-w-0"><p className="font-semibold text-[15px]">Why this step?</p><p className="text-[13px] text-ink3 mt-0.5">Your link shows your children’s fees, attendance and report cards. The code makes sure only you can open it on a new phone. This phone is remembered after today.</p></div>
            </section>
          </>
        )}

        {step === 'consent' && (
          <>
            <section className={CARD}>
              <h2 className="font-display text-[22px] font-semibold leading-tight">Your consent for your children’s details</h2>
              <p className="text-[14px] text-ink2 mt-1">India’s data protection law (DPDP Act 2023) asks the school to get your permission before it keeps and uses your children’s details.</p>
              <div className="grid grid-cols-2 gap-2.5 mt-4">
                {kids.map((k) => (
                  <div key={k.id} className="flex items-center gap-2.5 rounded-2xl bg-sunken/60 p-2.5 min-w-0">
                    <Avatar name={k.name} size={34} />
                    <div className="min-w-0"><p className="font-semibold text-[14px] leading-tight truncate">{first(k)}</p><p className="text-[12px] text-ink3 truncate">{k.cls}</p></div>
                  </div>
                ))}
              </div>
            </section>

            <section className={CARD}>
              <p className="font-semibold text-[15px]">What the school keeps, and why</p>
              <ul className="mt-3 flex flex-col gap-3.5">
                {KEEPS.map(([Ic, what, why]) => (
                  <li key={what} className="flex gap-3">
                    <span className="w-9 h-9 rounded-xl bg-sunken text-ink2 grid place-items-center shrink-0"><Ic size={17} /></span>
                    <div className="min-w-0"><p className="font-semibold text-[14px] leading-snug">{what}</p><p className="text-[13px] text-ink3 mt-0.5">{why}</p></div>
                  </li>
                ))}
              </ul>
              <dl className="mt-4 pt-4 border-t border-line/70 flex flex-col gap-3 text-[13px]">
                {[
                  ['Who can see it', 'Only school staff who need it for their work. DREAM TEAM, who make School OS, keep it safely in India for the school and use it for nothing else. It is never sold or used for ads.'],
                  ['How long it is kept', 'While your children study here. After that, only what the law asks the school to keep, such as transfer certificates.'],
                  ['Your rights', `You can see and correct these details, and take back your consent at any time, here or at the school office. Questions: Anita Sharma, School Admin, ${OFFICE}.`],
                ].map(([k, v]) => <div key={k}><dt className="font-semibold text-ink2">{k}</dt><dd className="text-ink3 mt-0.5">{v}</dd></div>)}
              </dl>
            </section>

            <section className={CARD}>
              <p className="font-semibold text-[15px]">Your choices</p>
              <label htmlFor="pc-data" className={cx('mt-3 flex items-start gap-3 rounded-2xl border p-3.5 cursor-pointer select-none transition', cErr ? 'border-bad ring-4 ring-bad/10' : agree ? 'border-brand bg-brand/5' : 'border-line')}>
                <span className="mt-0.5"><Checkbox id="pc-data" checked={agree} onChange={(v) => { setAgree(v); setCErr(''); }} label="I agree to the school keeping and using my children’s details" /></span>
                <span className="text-[14px] text-ink"><b className="font-semibold">I agree</b> that {SCHOOL.name} may keep and use {names}’s details as listed above.<span className="block text-[12.5px] text-ink3 mt-0.5">Needed for school records, fees and Parent Link.</span></span>
              </label>
              {cErr && <p className="text-[12.5px] text-bad flex items-start gap-1.5 mt-2" role="alert"><I.CircleAlert size={14} className="shrink-0 mt-0.5" />{cErr}</p>}
              <p className="text-[13px] font-semibold text-ink2 mt-4">Photos <span className="font-normal text-ink3">(you can say no)</span></p>
              <p className="text-[12.5px] text-ink3">May the school use these children’s photos in the school gallery and on its social media pages?</p>
              <div className="mt-2 flex flex-col gap-2">
                {kids.map((k) => (
                  <label key={k.id} htmlFor={`pc-photo-${k.id}`} className="flex items-center gap-3 rounded-xl bg-sunken/60 px-3.5 h-12 cursor-pointer select-none">
                    <Checkbox id={`pc-photo-${k.id}`} checked={photo[k.id]} onChange={(v) => setPhoto((p) => ({ ...p, [k.id]: v }))} label={`Yes, photos of ${first(k)}`} />
                    <span className="text-[14px]">Yes, photos of {first(k)}</span>
                  </label>
                ))}
              </div>
              <Button variant="primary" size="lg" className="w-full !h-14 !text-[16px] mt-5" icon={I.Check} loading={busy} onClick={giveConsent}>{busy ? 'Saving…' : 'I agree'}</Button>
              <p className="text-[12px] text-ink3 mt-2.5 flex items-start gap-1.5"><I.ShieldCheck size={14} className="shrink-0 mt-px text-brand" />Confirmed with the one-time code you entered for {PARENT_MASK}. Kept with consent text version 3 and today’s date. You can take it back at any time.</p>
              <Button variant="ghost" className="w-full mt-2" icon={I.MessageCircle}
                onClick={() => toast({ title: 'The school office will call you', body: 'Anita Sharma will call you on 98495 60211 today, before 4:30 PM.', tone: 'info' })}>I have a question first</Button>
            </section>
          </>
        )}

        {step === 'done' && (
          <section className={cx(CARD, 'flex flex-col items-center text-center')}>
            <span className="w-16 h-16 rounded-full bg-ok text-surface grid place-items-center animate-pop shadow-pop"><I.Check size={34} strokeWidth={3} /></span>
            <h2 className="font-display text-[22px] font-semibold mt-4">All set, {PARENT.name.split(' ')[0]}</h2>
            <p className="text-[14px] text-ink3 mt-1">This phone is confirmed and your consent is saved.</p>
            <ul className="w-full mt-5 text-left rounded-2xl border border-line divide-y divide-line/70">
              {[[I.Smartphone, 'This phone', 'Confirmed · 9 Oct 2026, 10:44 AM'], [I.ShieldCheck, 'Data consent', `Given for ${names}`], [I.Camera, 'Photo consent', photoLine]].map(([Ic, t, v]) => (
                <li key={t} className="flex items-center gap-3 px-3.5 py-3">
                  <Ic size={18} className="text-ink3 shrink-0" />
                  <div className="min-w-0"><p className="text-[12.5px] text-ink3">{t}</p><p className="text-[14px] font-semibold">{v}</p></div>
                </li>
              ))}
            </ul>
            <Button variant="primary" size="lg" className="w-full !h-14 !text-[16px] mt-5" iconRight={I.ArrowRight} onClick={() => go('parent')}>Open my Parent Link</Button>
            <p className="text-[12.5px] text-ink3 mt-3">A copy of what you agreed to was sent to you on WhatsApp. Change it any time from the Consent section of your Parent Link.</p>
          </section>
        )}

        <div className="text-center text-[12.5px] text-ink3 px-6 pt-2">
          Not your number? Call the school office<br /><span className="font-semibold text-ink2 select-all tnum">{OFFICE}</span> · 8:30 AM to 4:30 PM
          <p className="mt-3 flex items-center justify-center gap-1.5"><I.Lock size={12} />Only you can see this page</p>
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   3. The first School Admin's invite (section 5 of the Super Admin spec)
   ===================================================================== */
const ADMIN_MASK = '98XXX XX223';
const INVITE_STEPS = [['msg', 'Open your invite'], ['code', 'Confirm it’s you'], ['pw', 'Set your password'], ['done', 'Open School OS']];

const InviteTitle = ({ children, className = 'mt-1' }) => <h2 className={cx('font-display text-[30px] font-semibold tracking-tight leading-tight', className)}>{children}</h2>;

export function AdminInvite() {
  const { go } = useNav();
  const { setRole } = useRole();
  const toast = useToast();
  const [step, setStep] = useState('msg');
  const [code, setCode] = useState(EMPTY6);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [keep, setKeep] = useState(true);
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);

  const rules = [
    ['At least 8 characters', pw.length >= 8],
    ['A letter and a number', /[a-z]/i.test(pw) && /\d/.test(pw)],
    ['Not your name, mobile number or the school’s name', !!pw && !/anita|sharma|sunrise|98490|11223/i.test(pw)],
    ['Not a common one like Password@123', !!pw && !/^(password|pass@|12345|qwerty|admin|school|welcome)/i.test(pw)],
  ];
  const passed = rules.filter((r) => r[1]).length;
  const score = !pw ? 0 : passed < 3 ? 1 : passed === 3 ? 2 : pw.length >= 12 && /[^a-z0-9]/i.test(pw) ? 4 : 3;
  const LEVEL = [['', ''], ['Weak', 'bad'], ['Fair', 'warn'], ['Good', 'info'], ['Strong', 'ok']][score];
  const BAR = { bad: 'bg-bad', warn: 'bg-warn', info: 'bg-info', ok: 'bg-ok' };
  const at = INVITE_STEPS.findIndex((s) => s[0] === step);

  const wait = (fn) => { setBusy(true); setTimeout(() => { setBusy(false); fn(); }, 900); };
  const confirmCode = (e) => {
    e.preventDefault();
    if (code.join('').length < 6) { setErr({ code: 'Enter all 6 digits from the SMS' }); return; }
    wait(() => { setErr({}); setStep('pw'); });
  };
  const savePw = (e) => {
    e.preventDefault();
    const er = {};
    if (!pw) er.pw = 'Choose a password';
    else if (passed < 4) er.pw = 'Choose a password that meets all four rules below';
    if (pw && pw2 !== pw) er.pw2 = 'The two passwords don’t match';
    setErr(er);
    if (Object.keys(er).length) return;
    wait(() => setStep('done'));
  };
  const openApp = () => { setRole('schooladmin'); go('setup'); };
  const back = (to, label) => <button type="button" onClick={() => { setErr({}); setStep(to); }} className="text-[13px] font-semibold text-ink3 hover:text-ink inline-flex items-center gap-1 mb-3 h-8"><I.ArrowLeft size={15} />{label}</button>;

  return (
    <div className="h-full overflow-y-auto grid @lg:grid-cols-[1.05fr_1fr] bg-surface">
      <BrandSide>
        <div className="relative mt-auto max-w-md">
          <h1 className="font-display text-[44px] font-semibold leading-[1.05] tracking-tight">Welcome, Anita. Let’s get your school ready.</h1>
          <p className="mt-4 text-[16px] opacity-80 leading-relaxed">You are the first School Admin of {SCHOOL.name}. Three short steps, about two minutes. Only you will know your password.</p>
        </div>
        <ol className="relative mt-10 flex flex-col gap-3 max-w-sm">
          {INVITE_STEPS.map(([id, l], i) => {
            const st = step === 'expired' ? (i === 0 ? 'now' : 'next') : i < at ? 'done' : i === at ? 'now' : 'next';
            return (
              <li key={id} className={cx('rounded-2xl bg-white/12 backdrop-blur px-4 py-3 flex items-center gap-3 text-[14px] transition', st === 'next' && 'opacity-60', st === 'now' && 'font-semibold')}>
                <span className="w-7 h-7 rounded-full bg-white/15 grid place-items-center text-[13px] font-bold tnum shrink-0">{st === 'done' ? <I.Check size={15} strokeWidth={3} /> : i + 1}</span>
                {l}{st === 'now' && <I.ChevronRight size={16} className="ml-auto opacity-70" />}
              </li>
            );
          })}
        </ol>
      </BrandSide>

      <div className="flex flex-col px-5 py-8 @md:px-12 min-h-full">
        <div className="flex items-center gap-3 @lg:hidden"><Logo size={40} /><span className="font-display font-semibold text-lg">School OS</span></div>
        <div className="my-auto w-full max-w-[400px] mx-auto py-10">
          {step === 'msg' && (
            <>
              <p className="text-[13px] font-semibold text-brand">{SCHOOL.name}</p>
              <InviteTitle>Your invite</InviteTitle>
              <p className="text-ink3 mt-1.5 text-[15px]">DREAM TEAM sent this to your WhatsApp. Tap the link to set up your login.</p>
              <div className="mt-7 rounded-2xl border border-line overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
                  <Avatar name="DREAM TEAM" size={38} />
                  <div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px] flex items-center gap-1.5">DREAM TEAM · School OS<I.BadgeCheck size={16} className="text-ok shrink-0" /></p><p className="text-[12px] text-ink3">Business account</p></div>
                  <I.MessageCircle size={18} className="text-ink3 shrink-0" />
                </div>
                <div className="bg-sunken p-3.5 flex flex-col gap-2.5">
                  <span className="self-center text-[11.5px] font-semibold text-ink3 bg-surface rounded-lg px-2.5 py-1 shadow-card">Today</span>
                  <div className="self-start max-w-[92%] bg-surface rounded-2xl rounded-tl-md shadow-card px-3.5 py-2.5 text-[14px] leading-relaxed">
                    <p>Welcome to School OS, <b className="font-semibold">{SCHOOL.name}</b>.</p>
                    <p className="mt-1.5">Anita Sharma, your School Admin login is ready.</p>
                    <p className="mt-1.5">Tap to set your password:<br />
                      <button onClick={() => setStep('code')} className="text-info font-semibold underline underline-offset-2 break-all text-left">https://schoolos.in/i/7KQ2-M9XA</button>
                    </p>
                    <p className="mt-1.5">Your username is your mobile number: <span className="tnum whitespace-nowrap">{ADMIN_MASK}</span>.</p>
                    <p className="mt-1.5">The link works for 3 days. Need help? Call DREAM TEAM on <span className="tnum whitespace-nowrap">{DT_PHONE}</span>.</p>
                    <p className="text-right text-[11.5px] text-ink3 mt-1 tnum">10:15 AM</p>
                  </div>
                </div>
              </div>
              <Button variant="primary" size="lg" className="w-full mt-5" icon={I.Link} onClick={() => setStep('code')}>Open the link</Button>
            </>
          )}

          {step === 'code' && (
            <>
              {back('msg', 'Back to the message')}
              <p className="text-[13px] font-semibold text-brand">{SCHOOL.name}</p>
              <InviteTitle>Confirm it’s you</InviteTitle>
              <p className="text-ink3 mt-1.5 text-[15px]">We sent a 6-digit code to <b className="font-semibold text-ink2 tnum whitespace-nowrap">{ADMIN_MASK}</b>, the mobile number DREAM TEAM has for you.</p>
              <form onSubmit={confirmCode} noValidate className="mt-7 flex flex-col gap-4">
                <Field label="6-digit code" id="inv-code" error={err.code} hint="Even if this link is forwarded, nobody can use it without this code.">
                  <CodeBoxes id="inv-code" value={code} onChange={(c) => { setCode(c); setErr({}); }} error={!!err.code} />
                </Field>
                <SmsFill code="519274" onFill={(c) => { setCode(c); setErr({}); }} />
                <Button type="submit" variant="primary" size="lg" className="w-full mt-1" loading={busy}>{busy ? 'Checking…' : 'Confirm'}</Button>
                <Resend to={ADMIN_MASK} />
              </form>
            </>
          )}

          {step === 'pw' && (
            <>
              {back('code', 'Back')}
              <p className="text-[13px] font-semibold text-brand">{SCHOOL.name}</p>
              <InviteTitle>Set your password</InviteTitle>
              <p className="text-ink3 mt-1.5 text-[15px]">Your username is your mobile number, <b className="font-semibold text-ink2 tnum whitespace-nowrap">98490 11223</b>. DREAM TEAM never sees your password.</p>
              <form onSubmit={savePw} noValidate className="mt-7 flex flex-col gap-4">
                <Field label="New password" id="inv-pw" error={err.pw} required>
                  <div className="relative">
                    <Input id="inv-pw" type={show ? 'text' : 'password'} value={pw} onChange={(e) => { setPw(e.target.value); setErr({}); }} error={err.pw} autoComplete="new-password" placeholder="At least 8 characters" className="pr-12" />
                    <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center rounded-lg text-ink3 hover:bg-sunken">
                      {show ? <I.EyeOff size={18} /> : <I.Eye size={18} />}
                    </button>
                  </div>
                </Field>
                <div>
                  <div className="flex items-center gap-1.5" aria-hidden="true">
                    {[1, 2, 3, 4].map((i) => <span key={i} className={cx('h-1.5 flex-1 rounded-full transition', i <= score ? BAR[LEVEL[1]] : 'bg-sunken')} />)}
                  </div>
                  <p className="text-[12.5px] mt-1.5 text-ink3" aria-live="polite">Strength: {score ? <b className={cx('font-semibold', { bad: 'text-bad', warn: 'text-warn', info: 'text-info', ok: 'text-ok' }[LEVEL[1]])}>{LEVEL[0]}</b> : 'type a password'}</p>
                  <ul className="mt-2.5 flex flex-col gap-1.5 text-[13px]">
                    {rules.map(([t, ok]) => (
                      <li key={t} className={cx('flex items-center gap-2', ok ? 'text-ink2' : 'text-ink3')}>
                        <span className={cx('w-4 h-4 rounded-full grid place-items-center shrink-0', ok ? 'bg-ok text-surface' : 'border-2 border-line')}>{ok && <I.Check size={11} strokeWidth={3.5} />}</span>{t}
                      </li>
                    ))}
                  </ul>
                  <button type="button" onClick={() => { setPw('Neem-Lotus-Kite-48'); setPw2('Neem-Lotus-Kite-48'); setShow(true); setErr({}); }} className="mt-2.5 text-[13px] font-semibold text-brand hover:underline inline-flex items-center gap-1.5 h-8">
                    <I.KeyRound size={14} />Use a suggested strong password
                  </button>
                </div>
                <Field label="Type it again" id="inv-pw2" error={err.pw2} required>
                  <Input id="inv-pw2" type={show ? 'text' : 'password'} value={pw2} onChange={(e) => { setPw2(e.target.value); setErr({}); }} error={err.pw2} autoComplete="new-password" placeholder="Same password again" />
                </Field>
                <label className="flex items-center gap-2.5 text-[14px] text-ink2 cursor-pointer select-none" htmlFor="inv-keep">
                  <Checkbox id="inv-keep" checked={keep} onChange={setKeep} label="Keep me signed in on this device" />Keep me signed in on this device
                </label>
                <Button type="submit" variant="primary" size="lg" className="w-full mt-1" loading={busy}>{busy ? 'Saving…' : 'Save password'}</Button>
              </form>
            </>
          )}

          {step === 'done' && (
            <div className="flex flex-col">
              <span className="w-16 h-16 rounded-full bg-ok text-surface grid place-items-center animate-pop shadow-pop"><I.Check size={34} strokeWidth={3} /></span>
              <InviteTitle className="mt-5">Your School OS login is ready</InviteTitle>
              <p className="text-ink3 mt-1.5 text-[15px]">Welcome, Anita. You are signed in as the School Admin of {SCHOOL.name}.</p>
              <dl className="mt-6 rounded-2xl border border-line divide-y divide-line/70 text-[14px]">
                {[['Username', '98490 11223'], ['School', `${SCHOOL.name} · SPS-HYD-001`], ['Your role', 'School Admin']].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 px-4 py-3"><dt className="text-ink3 shrink-0">{k}</dt><dd className="font-semibold text-right tnum">{v}</dd></div>
                ))}
              </dl>
              <p className="mt-4 rounded-xl bg-sunken p-3.5 text-[14px] text-ink2 flex gap-2.5"><I.ListChecks size={18} className="text-brand shrink-0 mt-0.5" />Next is the Setup checklist: school profile and logo, academic year, classes, staff and students. You can stop and carry on any time.</p>
              <Button variant="primary" size="lg" className="w-full mt-6" iconRight={I.ArrowRight} onClick={openApp}>Open School OS</Button>
            </div>
          )}

          {step === 'expired' && (
            <div className="flex flex-col">
              <span className="w-14 h-14 rounded-2xl bg-warn/12 text-warn grid place-items-center"><I.Link2Off size={26} /></span>
              <InviteTitle className="mt-5">This invite link has expired</InviteTitle>
              <p className="text-ink3 mt-1.5 text-[15px]">Invite links work for 3 days. This one was sent on Mon, 5 Oct and stopped working on Thu, 8 Oct at 10:15 AM.</p>
              <div className="mt-6 rounded-2xl border border-line p-4 flex gap-3">
                <span className="w-10 h-10 rounded-xl bg-brand/10 text-brand grid place-items-center shrink-0"><I.PhoneCall size={19} /></span>
                <div className="min-w-0 text-[14px]">
                  <p className="font-semibold">Call DREAM TEAM on <span className="tnum whitespace-nowrap">{DT_PHONE}</span></p>
                  <p className="text-ink3 mt-0.5">Mon to Sat, 9 AM to 7 PM. They send a fresh link to <span className="tnum whitespace-nowrap">{ADMIN_MASK}</span>, and this old link stays switched off.</p>
                </div>
              </div>
              <Button variant="primary" size="lg" className="w-full mt-5" icon={I.Phone} onClick={() => toast({ title: `Calling DREAM TEAM on ${DT_PHONE}`, body: 'Support · Mon to Sat, 9 AM to 7 PM', tone: 'info' })}>Call DREAM TEAM</Button>
              <Button variant="secondary" size="lg" className="w-full mt-2" icon={I.LogIn} onClick={() => go('signin')}>Already set a password? Sign in</Button>
              <button onClick={() => setStep('msg')} className="mt-4 text-[13px] font-semibold text-ink3 hover:text-ink h-8">Design preview: back to the working invite</button>
            </div>
          )}
        </div>
        {(step === 'msg' || step === 'code' || step === 'pw') && (
          <button onClick={() => { setErr({}); setStep('expired'); }} className="text-[12.5px] text-ink3 hover:text-ink2 text-center mb-3">
            This link expired? Call DREAM TEAM on <span className="tnum font-semibold whitespace-nowrap">{DT_PHONE}</span>
          </button>
        )}
        <p className="text-[12.5px] text-ink3 text-center flex items-center justify-center gap-1.5"><I.ShieldCheck size={14} />Protected sign-in · DREAM TEAM never sees your password</p>
      </div>
    </div>
  );
}

/* =====================================================================
   4. School paused (Suspended), section 7 of the Super Admin spec
   ===================================================================== */
const INV = {
  no: 'DT/26-27/0418', date: '1 Sep 2026', due: '15 Sep 2026',
  lines: [
    ['School OS Complete plan', '1,000 students × ₹200 a year · half year', 100000],
    ['Students above 1,000, at half price', '236 students × ₹100 a year · half year', 11800],
    ['Hostel add-on', 'Half year', 5000],
  ],
};
const INV_SUB = INV.lines.reduce((a, l) => a + l[2], 0); // 1,16,800
const INV_GST = Math.round(INV_SUB * 0.09); // 9% CGST and 9% SGST
const INV_TOTAL = INV_SUB + 2 * INV_GST; // 1,37,824

export function SchoolPaused() {
  const [view, setView] = useState('staff');
  return (
    <div className="h-full flex flex-col bg-bg">
      <div className="shrink-0 border-b border-line bg-surface px-4 py-2.5 flex flex-col @md:flex-row items-center justify-center gap-2 @md:gap-3">
        <p className="text-[12.5px] font-semibold text-ink3">When the school is Suspended, show:</p>
        <Segmented value={view} onChange={setView} options={[{ value: 'staff', label: 'Staff signing in', icon: I.Users }, { value: 'admin', label: 'School Admin', icon: I.ShieldCheck }]} />
      </div>
      <div className="flex-1 min-h-0">{view === 'staff' ? <PausedSignIn onAdmin={() => setView('admin')} /> : <PausedAdmin />}</div>
    </div>
  );
}

function PausedSignIn({ onAdmin }) {
  const [id, setId] = useState('imran.s@sunriseps.in');
  const [pw, setPw] = useState('maths@2026');
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(true);
  const submit = (e) => { e.preventDefault(); setShown(false); setBusy(true); setTimeout(() => { setBusy(false); setShown(true); }, 900); };
  return (
    <div className="h-full overflow-y-auto grid @lg:grid-cols-[1.05fr_1fr] bg-surface">
      <BrandSide>
        <div className="relative mt-auto max-w-md">
          <h1 className="font-display text-[44px] font-semibold leading-[1.05] tracking-tight">Your whole school, in one calm place.</h1>
          <p className="mt-4 text-[16px] opacity-80 leading-relaxed">Attendance, fees, students and parents. Everything you need today is on the first screen.</p>
        </div>
      </BrandSide>
      <div className="flex flex-col px-5 py-8 @md:px-12 min-h-full">
        <div className="flex items-center gap-3 @lg:hidden"><Logo size={40} /><span className="font-display font-semibold text-lg">School OS</span></div>
        <div className="my-auto w-full max-w-[400px] mx-auto py-10">
          <p className="text-[13px] font-semibold text-brand">{SCHOOL.name}</p>
          <h2 className="font-display text-[30px] font-semibold tracking-tight leading-tight mt-1">Sign in</h2>
          <p className="text-ink3 mt-1.5 text-[15px]">Welcome back. Use the details the school office gave you.</p>
          {shown && (
            <div role="alert" className="mt-6 rounded-2xl bg-warn/12 border border-warn/30 p-4 flex gap-3 animate-rise">
              <I.CirclePause size={22} className="text-warn shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-semibold text-[15px] leading-snug">Your School OS access is paused.</p>
                <p className="text-[14px] text-ink2 mt-0.5">Please contact your school office.</p>
                <p className="text-[13px] text-ink3 mt-2">School office · <span className="tnum font-semibold text-ink2 whitespace-nowrap">{OFFICE}</span> · 8:30 AM to 4:30 PM</p>
              </div>
            </div>
          )}
          <form onSubmit={submit} noValidate className="mt-6 flex flex-col gap-4">
            <Field label="Mobile number or email" id="ps-id"><Input id="ps-id" value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" /></Field>
            <Field label="Password" id="ps-pw"><Input id="ps-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></Field>
            <Button type="submit" variant="primary" size="lg" className="w-full mt-1" loading={busy}>{busy ? 'Checking…' : 'Sign in'}</Button>
          </form>
          <div className="mt-6 text-[12.5px] text-ink3 rounded-xl border border-dashed border-line p-3 flex flex-col gap-2">
            <p>Design preview: every staff member sees this after a correct password while the school is Suspended. Their work is kept safe; nothing is deleted. Only School Admins can still sign in, to pay or to download the school’s data.</p>
            <button onClick={onAdmin} className="self-start font-semibold text-brand hover:underline h-7">See what the School Admin sees</button>
          </div>
        </div>
        <p className="text-[12.5px] text-ink3 text-center flex items-center justify-center gap-1.5"><I.ShieldCheck size={14} />Protected sign-in · Works on phone, tablet and computer</p>
      </div>
    </div>
  );
}

function PausedAdmin() {
  const { go } = useNav();
  const { setRole } = useRole();
  const toast = useToast();
  const [pay, setPay] = useState(false);
  const [paid, setPaid] = useState(false);
  const [zip, setZip] = useState(null);
  const prepare = () => {
    setZip('busy');
    toast({ title: 'Preparing a ZIP of all the school’s data', body: 'About 10 minutes. The download link also goes to office@sunriseps.in.', tone: 'info' });
    setTimeout(() => setZip('ready'), 2600);
  };
  const effects = [
    [false, 'Staff cannot sign in', 'They see: “Your School OS access is paused. Please contact your school office.”'],
    [false, 'Nothing new goes to parents', 'No messages, fee reminders or new payment links.'],
    [true, 'Payment links already sent still work', 'Parents can still pay them, so no parent’s payment is lost. Receipts reach them as usual.'],
    [true, 'All the school’s data is kept safe', 'Nothing is deleted. Paying switches everything back on at once.'],
  ];

  return (
    <div className="h-full overflow-y-auto scroll-thin bg-bg">
      <header className="bg-surface border-b border-line">
        <div className="max-w-5xl mx-auto px-4 @md:px-6 h-16 flex items-center gap-3">
          <Logo size={36} />
          <div className="min-w-0 flex-1"><p className="font-display font-semibold text-[15px] leading-tight">School OS</p><p className="text-[12px] text-ink3 truncate">{SCHOOL.name}</p></div>
          <span className="hidden @md:flex items-center gap-2.5 mr-1"><Avatar name="Anita Sharma" size={32} /><span className="text-[13.5px] font-semibold">Anita Sharma</span></span>
          <Button variant="ghost" size="sm" icon={I.LogOut} onClick={() => go('signin')}>Sign out</Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 @md:px-6 py-6 @md:py-10">
        {paid ? (
          <div className="max-w-xl mx-auto flex flex-col items-center text-center pt-4">
            <span className="w-16 h-16 rounded-full bg-ok text-surface grid place-items-center animate-pop shadow-pop"><I.Check size={34} strokeWidth={3} /></span>
            <h1 className="font-display text-[26px] @md:text-[30px] font-semibold tracking-tight leading-tight mt-4">School OS is active again</h1>
            <p className="text-[15px] text-ink3 mt-1.5">Thank you, Anita. {inr(INV_TOTAL)} received at 10:45 AM.</p>
            <Card className="w-full mt-6 text-left">
              <ul className="divide-y divide-line/70 px-5">
                {[
                  ['Invoice marked paid', <><span className="font-mono text-[12.5px]">{INV.no}</span> · Razorpay <span className="font-mono text-[12.5px]">pay_P7x2KQ9mLz41Tc</span></>],
                  ['Everyone can sign in again', 'All 86 staff logins are switched back on.'],
                  ['Messages to parents start again', 'Fee reminders and absence messages go out from now.'],
                  ['Paid invoice sent', 'To office@sunriseps.in and Principal Lakshmi Rao.'],
                ].map(([t, b]) => (
                  <li key={t} className="flex gap-3 py-3.5">
                    <span className="w-8 h-8 rounded-full bg-ok/10 text-ok grid place-items-center shrink-0"><I.Check size={16} strokeWidth={2.6} /></span>
                    <div className="min-w-0"><p className="font-semibold text-[14px]">{t}</p><p className="text-[13px] text-ink3 break-words">{b}</p></div>
                  </li>
                ))}
              </ul>
            </Card>
            <div className="flex flex-col @md:flex-row gap-2 w-full mt-5">
              <Button variant="primary" size="lg" className="flex-1" iconRight={I.ArrowRight} onClick={() => { setRole('schooladmin'); go('dashboard'); }}>Go to Dashboard</Button>
              <Button variant="secondary" size="lg" icon={I.Download} onClick={() => toast({ title: 'Saved: DT-26-27-0418-paid.pdf' })}>Paid invoice</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <Pill tone="bad" dot className="self-start">Suspended since 1 Oct 2026</Pill>
              <h1 className="font-display text-[26px] @md:text-[30px] font-semibold tracking-tight leading-tight">School OS is paused for {SCHOOL.name}</h1>
              <p className="text-ink3 text-[15px] max-w-2xl">The invoice below was due on {INV.due}, and the 15 days of grace have ended. Pay it to switch everything back on at once. Nothing has been deleted.</p>
            </div>

            <div className="grid gap-5 @lg:gap-6 items-start @xl:grid-cols-[minmax(0,1fr)_340px] mt-6">
              <Card>
                <CardHead icon={I.ReceiptText} title={`GST invoice ${INV.no}`} sub="DREAM TEAM to Sunrise Public School" action={<Pill tone="bad">Unpaid</Pill>} />
                <div className="px-5 pb-5">
                  <div className="grid grid-cols-1 @sm:grid-cols-2 gap-4 text-[13px] rounded-2xl bg-sunken/60 p-4">
                    <div className="min-w-0"><p className="eyebrow text-ink3">From</p><p className="font-semibold text-[14px] mt-1">DREAM TEAM</p><p className="text-ink3">Madhapur, Hyderabad 500081, Telangana</p><p className="text-ink3">GSTIN <span className="font-mono text-[12.5px] text-ink2">36AAKFD4721M1ZQ</span></p></div>
                    <div className="min-w-0"><p className="eyebrow text-ink3">Bill to</p><p className="font-semibold text-[14px] mt-1">{SCHOOL.name}</p><p className="text-ink3">Kukatpally, Hyderabad 500072, Telangana</p><p className="text-ink3">School code <span className="font-mono text-[12.5px] text-ink2">SPS-HYD-001</span></p></div>
                  </div>
                  <dl className="grid grid-cols-2 @md:grid-cols-4 gap-x-4 gap-y-3 mt-4 text-[13px]">
                    {[['Invoice date', INV.date], ['Due date', INV.due], ['Place of supply', 'Telangana (36)'], ['SAC', '997331']].map(([k, v]) => (
                      <div key={k}><dt className="text-ink3">{k}</dt><dd className={cx('font-semibold mt-0.5 tnum', k === 'Due date' && 'text-bad')}>{v}</dd></div>
                    ))}
                  </dl>
                  <ul className="mt-5 divide-y divide-line/70 border-y border-line/70">
                    {INV.lines.map(([t, s, a]) => (
                      <li key={t} className="flex justify-between gap-4 py-3">
                        <div className="min-w-0"><p className="font-semibold text-[14px]">{t}</p><p className="text-[12.5px] text-ink3">{s}</p></div>
                        <span className="tnum font-medium text-[14px] shrink-0">{inr(a)}</span>
                      </li>
                    ))}
                  </ul>
                  <dl className="mt-3 text-[14px] flex flex-col gap-1.5">
                    {[['Subtotal', INV_SUB], ['CGST 9%', INV_GST], ['SGST 9%', INV_GST]].map(([k, v]) => <div key={k} className="flex justify-between gap-4 text-ink2"><dt>{k}</dt><dd className="tnum">{inr(v)}</dd></div>)}
                    <div className="flex justify-between items-baseline gap-4 border-t border-line pt-3 mt-1.5"><dt className="font-semibold">Total to pay</dt><dd className="font-display text-[26px] font-semibold tnum leading-none">{inr(INV_TOTAL)}</dd></div>
                  </dl>
                  <p className="text-[12.5px] text-ink3 mt-2">For 1 Oct 2026 to 31 Mar 2027, the second half of 2026–27. 1,236 active students counted on {INV.date}.</p>
                  <Button variant="primary" size="lg" className="w-full !h-14 !text-[16px] mt-5" icon={I.ShieldCheck} onClick={() => setPay(true)}>Pay {inr(INV_TOTAL)}</Button>
                  <p className="text-[12px] text-ink3 text-center mt-2">UPI, card or net banking · Secured by Razorpay · School OS switches back on at once</p>
                  <Button variant="secondary" className="w-full mt-4" icon={I.Download} onClick={() => toast({ title: 'Saved: DT-26-27-0418.pdf', body: 'GST invoice from DREAM TEAM' })}>Download invoice (PDF)</Button>
                  <p className="text-[12.5px] text-ink3 mt-3">Paid by bank transfer already? Call DREAM TEAM on <span className="tnum font-semibold text-ink2 whitespace-nowrap">{DT_PHONE}</span> with the UTR number and they will mark it paid.</p>
                </div>
              </Card>

              <div className="flex flex-col gap-5 @lg:gap-6 min-w-0">
                <Card>
                  <CardHead icon={I.FileArchive} title="Download all the school’s data" sub="Yours to keep, whether or not you pay" />
                  <div className="px-5 pb-5">
                    <p className="text-[14px] text-ink2">Students, parents, staff, fees and receipts, attendance, marks and report cards, as Excel and PDF files in one ZIP.</p>
                    {zip === null && <Button variant="secondary" className="w-full mt-4" icon={I.Download} onClick={prepare}>Download all data</Button>}
                    {zip === 'busy' && <div className="mt-4 rounded-xl bg-sunken/60 p-3.5 flex items-center gap-3 text-[13.5px] text-ink2" role="status"><Spinner />Preparing the ZIP · started 10:43 AM</div>}
                    {zip === 'ready' && (
                      <div className="mt-4 rounded-xl border border-line p-3 flex items-center gap-3">
                        <span className="w-10 h-10 rounded-xl bg-sunken text-ink2 grid place-items-center shrink-0"><I.FileArchive size={19} /></span>
                        <div className="min-w-0 flex-1"><p className="font-semibold text-[13.5px] truncate">SPS-HYD-001-all-data.zip</p><p className="text-[12.5px] text-ink3">286 MB · ready</p></div>
                        <Button size="sm" variant="secondary" icon={I.Download} onClick={() => toast({ title: 'Saved: SPS-HYD-001-all-data.zip', body: '286 MB · logged in the export log' })}>Save</Button>
                      </div>
                    )}
                  </div>
                </Card>
                <Card>
                  <CardHead title="While School OS is paused" />
                  <ul className="px-5 pb-5 flex flex-col gap-3.5">
                    {effects.map(([ok, t, b]) => (
                      <li key={t} className="flex gap-3">
                        <span className={cx('w-8 h-8 rounded-full grid place-items-center shrink-0', ok ? 'bg-ok/10 text-ok' : 'bg-bad/10 text-bad')}>{ok ? <I.Check size={16} strokeWidth={2.6} /> : <I.X size={16} strokeWidth={2.6} />}</span>
                        <div className="min-w-0"><p className="font-semibold text-[14px]">{t}</p><p className="text-[13px] text-ink3">{b}</p></div>
                      </li>
                    ))}
                  </ul>
                </Card>
                <p className="text-[12.5px] text-ink3 px-1 flex gap-2"><I.Phone size={14} className="shrink-0 mt-0.5" /><span>Questions about this invoice? Call DREAM TEAM on <span className="tnum font-semibold text-ink2 whitespace-nowrap">{DT_PHONE}</span>, Mon to Sat, 9 AM to 7 PM.</span></p>
              </div>
            </div>
          </>
        )}
      </main>

      <RazorpaySheet open={pay} amount={INV_TOTAL} sub={`DREAM TEAM · Invoice ${INV.no} · Secured by Razorpay`} onClose={() => setPay(false)}
        onPaid={() => { setPay(false); setPaid(true); toast({ title: 'School OS is active again', body: `${inr(INV_TOTAL)} paid. Everyone can sign in now.` }); }} />
    </div>
  );
}

/* =====================================================================
   5. Consent card for Parent Link (same section style as parent.jsx)
   ===================================================================== */
export function ConsentCard({ child = 'Aarav' }) {
  const toast = useToast();
  const [state, setState] = useState('ask'); // ask | otp | yes | no
  const [code, setCode] = useState(EMPTY6);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const details = [
    [I.MapPin, 'Wonderla Amusement Park, Raviryal, on the Outer Ring Road'],
    [I.Bus, 'School buses leave at 7:30 AM and are back by 6:30 PM'],
    [I.Users, 'With 8 teachers, led by Ravi Teja (class teacher, 7 B)'],
    [I.Utensils, 'Entry ticket, lunch and snacks included'],
    [I.IndianRupee, `₹1,200 is added to ${child}’s fees when you say yes. Pay it here like any fee.`],
  ];
  const confirmYes = () => {
    if (code.join('').length < 6) { setErr('Enter all 6 digits from the SMS'); return; }
    setBusy(true);
    setTimeout(() => { setBusy(false); setState('yes'); setCode(EMPTY6); toast({ title: `Consent given for ${child}`, body: 'Ravi Teja has been told. ₹1,200 added to fees due.' }); }, 900);
  };

  return (
    <section className="rounded-3xl bg-surface border border-line shadow-card p-5">
      <div className="flex items-start gap-4">
        <span className={cx('w-12 h-12 rounded-2xl grid place-items-center shrink-0', state === 'yes' ? 'bg-ok/10 text-ok' : state === 'no' ? 'bg-sunken text-ink3' : 'bg-brand/10 text-brand')}><I.FerrisWheel size={22} /></span>
        <div className="flex-1 min-w-0">
          {state === 'yes' ? <Pill tone="ok">Consent given</Pill> : state === 'no' ? <Pill>Not going</Pill> : <Pill tone="warn" dot>Consent needed</Pill>}
          <p className="font-semibold text-[15px] mt-1.5">Wonderla picnic</p>
          <p className="text-[13px] text-ink3">Sat, 24 Oct · Classes 5–7 · {inr(1200)}</p>
        </div>
      </div>

      {state === 'ask' && (
        <>
          <ul className="mt-4 flex flex-col gap-2.5 text-[14px]">
            {details.map(([Ic, t]) => <li key={t} className="flex gap-2.5 text-ink2"><Ic size={17} className="text-ink3 shrink-0 mt-0.5" />{t}</li>)}
          </ul>
          <p className="mt-3 text-[12.5px] text-ink3">This day is in the Dussehra holidays, so children who don’t go have no school that day. Please reply by Wed, 14 Oct.</p>
          <div className="grid grid-cols-2 gap-2.5 mt-4">
            <Button variant="primary" size="lg" className="w-full" icon={I.Check} onClick={() => { setErr(''); setState('otp'); }}>Give consent</Button>
            <Button variant="secondary" size="lg" className="w-full" onClick={() => { setState('no'); toast({ title: `You said no for ${child}`, body: 'Ravi Teja has been told. Nothing is charged.', undo: () => setState('ask') }); }}>Not this time</Button>
          </div>
        </>
      )}

      {state === 'otp' && (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-[14px] text-ink2">You are saying <b className="font-semibold text-ink">yes</b> for {child}. To confirm, enter the 6-digit code sent to <b className="font-semibold text-ink tnum whitespace-nowrap">{PARENT_MASK}</b>.</p>
          <CodeBoxes id="consent-code" value={code} onChange={(c) => { setCode(c); setErr(''); }} error={!!err} small />
          <CodeError>{err}</CodeError>
          <SmsFill code="736205" onFill={(c) => { setCode(c); setErr(''); }} />
          <div className="grid grid-cols-2 gap-2.5 mt-1">
            <Button variant="ghost" size="lg" className="w-full" onClick={() => { setState('ask'); setCode(EMPTY6); setErr(''); }}>Back</Button>
            <Button variant="primary" size="lg" className="w-full" loading={busy} onClick={confirmYes}>{busy ? 'Checking…' : 'Confirm'}</Button>
          </div>
        </div>
      )}

      {(state === 'yes' || state === 'no') && (
        <div className="mt-4">
          <div className={cx('rounded-2xl p-3.5 flex items-start gap-3', state === 'yes' ? 'bg-ok/10' : 'bg-sunken/60')}>
            <span className={cx('w-9 h-9 rounded-full grid place-items-center shrink-0', state === 'yes' ? 'bg-ok/15 text-ok' : 'bg-surface text-ink3')}>{state === 'yes' ? <I.Check size={18} strokeWidth={2.6} /> : <I.X size={18} strokeWidth={2.6} />}</span>
            <div className="min-w-0 text-[14px]">
              <p className="font-semibold">{state === 'yes' ? `${child} is going on the picnic` : `${child} is not going`}</p>
              <p className="text-[13px] text-ink3 mt-0.5">{state === 'yes' ? <>Confirmed with a one-time code · 9 Oct, 10:46 AM. {inr(1200)} is added to fees due above.</> : 'Saved · 9 Oct, 10:46 AM. Nothing is charged.'}</p>
            </div>
          </div>
          <button onClick={() => { setState('ask'); setErr(''); }} className="mt-3 text-[13px] font-semibold text-brand hover:underline h-8">Change my answer (until Wed, 14 Oct)</button>
        </div>
      )}
    </section>
  );
}
