import React, { useRef, useState } from 'react';
import * as I from './icons.js';
import { SCHOOL } from './data.js';
import { cx, Button, Field, Input, Checkbox } from './ui.jsx';
import { useNav, useRole, Logo } from './shell.jsx';
import { ROLES } from './config.js';

export function SignIn() {
  const { go } = useNav();
  const { role, setRole } = useRole();
  const [mode, setMode] = useState('password');
  const [id, setId] = useState(role.person.email || role.person.phone);
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [err, setErr] = useState({});
  const [busy, setBusy] = useState(false);
  const [tries, setTries] = useState(5);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const boxes = useRef([]);

  const submit = (e) => {
    e.preventDefault();
    const er = {};
    if (!id.trim()) er.id = 'Enter your mobile number or email';
    if (mode === 'password' && !pw) er.pw = 'Enter your password';
    setErr(er);
    if (Object.keys(er).length) return;
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      if (mode === 'password' && pw.length < 6) {
        setTries((t) => t - 1);
        setErr({ pw: `That password doesn’t match. ${tries - 1} tries left, then a 15-minute pause keeps your account safe.` });
        return;
      }
      if (mode === 'otp' && !otpSent) { setOtpSent(true); setTimeout(() => boxes.current[0]?.focus(), 50); return; }
      if (mode === 'otp' && otp.join('').length < 6) { setErr({ otp: 'Enter all 6 digits' }); return; }
      go(role.id === 'student' ? 'homework' : 'dashboard');
    }, 900);
  };

  const setDigit = (i, v) => {
    const d = v.replace(/\D/g, '').slice(-1);
    const n = [...otp]; n[i] = d; setOtp(n); setErr({});
    if (d && i < 5) boxes.current[i + 1]?.focus();
  };

  return (
    <div className="h-full overflow-y-auto grid @lg:grid-cols-[1.05fr_1fr] bg-surface">
      {/* Brand side */}
      <div className="hidden @lg:flex relative overflow-hidden bg-brand text-brandink p-10 flex-col">
        <div className="absolute inset-0 dotgrid opacity-60" />
        <div className="absolute -left-24 -bottom-40 w-[520px] h-[520px] rounded-full border-[56px] border-white/[.07]" />
        <div className="relative flex items-center gap-3">
          <span className="w-11 h-11 rounded-xl bg-white/15 grid place-items-center">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M5 14a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /><path d="M12 3.5v2M4.6 6.6l1.4 1.4M19.4 6.6 18 8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /><path d="M3 17.5h18M6 21h12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
          </span>
          <span className="font-display font-semibold text-lg">School OS</span>
        </div>
        <div className="relative mt-auto max-w-md">
          <h1 className="font-display text-[44px] font-semibold leading-[1.05] tracking-tight">Your whole school, in one calm place.</h1>
          <p className="mt-4 text-[16px] opacity-80 leading-relaxed">Attendance, fees, students and parents. Everything you need today is on the first screen.</p>
        </div>
        {/* Floating previews */}
        <div className="relative mt-10 flex flex-col gap-3 max-w-sm">
          <div className="self-start rounded-2xl bg-white/12 backdrop-blur px-4 py-3 flex items-center gap-3 animate-rise" style={{ animationDelay: '.1s' }}>
            <I.CalendarCheck2 size={20} /><span className="text-[14px]"><b>1,184 of 1,236</b> students present</span>
          </div>
          <div className="self-end rounded-2xl bg-white/12 backdrop-blur px-4 py-3 flex items-center gap-3 animate-rise" style={{ animationDelay: '.25s' }}>
            <I.IndianRupee size={20} /><span className="text-[14px]"><b>₹1,42,500</b> collected today</span>
          </div>
          <div className="self-start rounded-2xl bg-white/12 backdrop-blur px-4 py-3 flex items-center gap-3 animate-rise" style={{ animationDelay: '.4s' }}>
            <I.CheckCheck size={20} /><span className="text-[14px]">Fee reminder <b>seen by parent</b></span>
          </div>
        </div>
      </div>

      {/* Form side */}
      <div className="flex flex-col px-5 py-8 @md:px-12 min-h-full">
        <div className="flex items-center gap-3 @lg:hidden"><Logo size={40} /><span className="font-display font-semibold text-lg">School OS</span></div>
        <div className="my-auto w-full max-w-[400px] mx-auto py-10">
          <p className="text-[13px] font-semibold text-brand">{SCHOOL.name}</p>
          <h2 className="font-display text-[30px] font-semibold tracking-tight leading-tight mt-1">Sign in</h2>
          <p className="text-ink3 mt-1.5 text-[15px]">Welcome back. Use the details the school office gave you.</p>

          <form onSubmit={submit} noValidate className="mt-7 flex flex-col gap-4">
            <Field label="Mobile number or email" id="si-id" error={err.id}>
              <Input id="si-id" value={id} onChange={(e) => { setId(e.target.value); setErr({}); }} error={err.id} autoComplete="username" placeholder="98480 12345 or name@school.in" />
            </Field>

            {mode === 'password' ? (
              <Field id="si-pw" error={err.pw} label={<span className="flex justify-between w-full">Password<button type="button" onClick={() => { setMode('otp'); setErr({}); }} className="text-brand font-semibold hover:underline">Forgot password?</button></span>}>
                <div className="relative">
                  <Input id="si-pw" type={show ? 'text' : 'password'} value={pw} onChange={(e) => { setPw(e.target.value); setErr({}); }} error={err.pw} autoComplete="current-password" placeholder="Your password" className="pr-12" />
                  <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center rounded-lg text-ink3 hover:bg-sunken">
                    {show ? <I.EyeOff size={18} /> : <I.Eye size={18} />}
                  </button>
                </div>
              </Field>
            ) : otpSent ? (
              <Field label="6-digit code sent to your mobile" id="otp-0" error={err.otp} hint="Didn’t get it? You can ask again in 30 seconds.">
                <div className="flex gap-2">
                  {otp.map((d, i) => (
                    <input key={i} id={`otp-${i}`} ref={(el) => (boxes.current[i] = el)} value={d} inputMode="numeric" maxLength={1} aria-label={`Digit ${i + 1}`}
                      onChange={(e) => setDigit(i, e.target.value)} onKeyDown={(e) => e.key === 'Backspace' && !d && i > 0 && boxes.current[i - 1]?.focus()}
                      className={cx('w-full h-14 rounded-xl border bg-surface text-center text-[22px] font-semibold tnum outline-none transition', err.otp ? 'border-bad' : 'border-line focus:border-brand focus:ring-4 focus:ring-brand/15')} />
                  ))}
                </div>
              </Field>
            ) : (
              <p className="text-[14px] text-ink2 rounded-xl bg-sunken p-3.5 flex gap-2.5"><I.MessageSquareText size={18} className="text-brand shrink-0 mt-0.5" />We will send a one-time code to the mobile number on your school record.</p>
            )}

            <label className="flex items-center gap-2.5 text-[14px] text-ink2 cursor-pointer select-none" htmlFor="si-remember">
              <Checkbox id="si-remember" checked={remember} onChange={setRemember} label="Keep me signed in on this device" />Keep me signed in on this device
            </label>

            <Button type="submit" variant="primary" size="lg" className="w-full mt-1" loading={busy}>
              {busy ? 'Checking…' : mode === 'otp' ? (otpSent ? 'Verify and sign in' : 'Send code') : 'Sign in'}
            </Button>
            <button type="button" onClick={() => { setMode(mode === 'otp' ? 'password' : 'otp'); setOtpSent(false); setErr({}); }} className="text-[14px] font-semibold text-ink2 hover:text-ink h-10">
              {mode === 'otp' ? 'Use password instead' : 'Sign in with a one-time code instead'}
            </button>
          </form>
          <div className="mt-6 text-[12.5px] text-ink3 rounded-xl border border-dashed border-line p-3 flex flex-col gap-2.5">
            <p className="text-center">Design preview: any password with 6 or more characters signs you in. A shorter one shows the wrong-password message.</p>
            <label htmlFor="si-as" className="font-semibold text-ink2">Sign in as</label>
            <div className="relative">
              <select id="si-as" value={role.id} onChange={(e) => { const r = ROLES.find((x) => x.id === e.target.value); setRole(r.id); setId(r.person.email || r.person.phone); setErr({}); }}
                className="h-10 w-full appearance-none rounded-lg bg-surface border border-line pl-3 pr-9 text-[13.5px] text-ink font-semibold outline-none focus:border-brand cursor-pointer">
                <optgroup label="Ready roles">{ROLES.filter((r) => r.group === 'ready').map((r) => <option key={r.id} value={r.id}>{r.label} · {r.person.name}</option>)}</optgroup>
                <optgroup label="Role templates">{ROLES.filter((r) => r.group === 'template').map((r) => <option key={r.id} value={r.id}>{r.label} · {r.person.name}</option>)}</optgroup>
              </select>
              <I.ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-ink3" />
            </div>
            <p>Each role sees only its own menu and home screen. Parents use Parent Link, drivers use the Android app, and DREAM TEAM uses its own console: pick them from <b className="font-semibold text-ink2">View as</b> in the dark bar above.</p>
          </div>
        </div>
        <p className="text-[12.5px] text-ink3 text-center flex items-center justify-center gap-1.5"><I.ShieldCheck size={14} />Protected sign-in · Works on phone, tablet and computer</p>
      </div>
    </div>
  );
}
