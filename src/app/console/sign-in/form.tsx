"use client";

import Link from "next/link";
import { useActionState, useRef, useState, useTransition } from "react";
import { ArrowRight, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { TestCodeNote } from "@/components/console/test-code-note";
import { FieldShell, inputCls } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import { consoleBackAction, consoleCodeAction, consolePasswordAction, consoleResendAction, type CodeState, type PasswordState } from "./actions";

export function PasswordStep({ notice }: { notice?: string }) {
  const [state, action, pending] = useActionState<PasswordState, FormData>(consolePasswordAction, null);
  const [show, setShow] = useState(false);
  const [missing, setMissing] = useState<{ login?: string; password?: string }>({});
  const errors = { ...state?.errors, ...missing };

  function check(e: React.FormEvent<HTMLFormElement>) {
    const fd = new FormData(e.currentTarget);
    const m: typeof missing = {};
    if (!String(fd.get("login") ?? "").trim()) m.login = "Enter your mobile number or email";
    if (!String(fd.get("password") ?? "")) m.password = "Enter your password";
    setMissing(m);
    if (Object.keys(m).length) e.preventDefault();
  }

  return (
    <form action={action} onSubmit={check} noValidate className="mt-5 flex flex-col gap-4">
      {notice && !state && <Alert tone="info">{notice}</Alert>}
      {state?.message && !state.errors && <Alert tone="danger">{state.message}</Alert>}
      <FieldShell label="Mobile number or email" id="login" error={errors.login}>
        <input id="login" name="login" autoComplete="username" autoCapitalize="none" spellCheck={false} defaultValue={state?.login ?? ""}
          onChange={() => setMissing({})} aria-invalid={errors.login ? true : undefined} aria-describedby={errors.login ? "login-error" : undefined}
          placeholder="98490 12345 or name@dreamteamservices.in" className={cx(inputCls(errors.login), "h-11")} />
      </FieldShell>
      <FieldShell label="Password" id="password" error={errors.password}>
        <div className="relative">
          <input id="password" name="password" type={show ? "text" : "password"} autoComplete="current-password" onChange={() => setMissing({})}
            aria-invalid={errors.password ? true : undefined} aria-describedby={errors.password ? "password-error" : undefined}
            placeholder="Your password" className={cx(inputCls(errors.password), "h-11 pr-12")} />
          <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center rounded-lg text-ink3 hover:bg-sunken">
            {show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        </div>
      </FieldShell>
      <p className="text-[13.5px] text-ink2 rounded-xl bg-sunken p-3.5 flex gap-2.5">
        <ShieldCheck size={18} className="text-brand shrink-0 mt-0.5" aria-hidden="true" />
        Two-step login is always on here. After your password, we send a one-time code to your phone.
      </p>
      <Button type="submit" variant="primary" size="lg" className="w-full mt-1" loading={pending} loadingText="Checking…">Continue</Button>
      <SchoolLink />
    </form>
  );
}

function SchoolLink() {
  return (
    <Link href="/sign-in" className="mt-1 w-full text-[13.5px] font-semibold text-ink2 hover:text-ink h-10 inline-flex items-center justify-center gap-1.5">
      Work in a school? Go to the school sign-in<ArrowRight size={15} aria-hidden="true" />
    </Link>
  );
}

/** Six boxes for the code; typing or pasting moves along by itself. */
export function OtpBoxes({ name = "code", error, label }: { name?: string; error?: boolean; label: string }) {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const set = (i: number, v: string) => {
    const typed = v.replace(/\D/g, "");
    if (typed.length > 1) {
      const next = [...digits];
      for (let k = 0; k < typed.length && i + k < 6; k++) next[i + k] = typed[k];
      setDigits(next);
      boxes.current[Math.min(i + typed.length, 5)]?.focus();
      return;
    }
    const next = [...digits];
    next[i] = typed;
    setDigits(next);
    if (typed && i < 5) boxes.current[i + 1]?.focus();
  };
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-[13px] font-semibold text-ink2 mb-1.5">{label}</legend>
      <div className="flex gap-2">
        {digits.map((d, i) => (
          <input key={i} id={i === 0 ? "otp-0" : undefined} ref={(el) => { boxes.current[i] = el; }} value={d} inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"}
            aria-label={`Digit ${i + 1}`} aria-invalid={error || undefined} autoFocus={i === 0}
            onChange={(e) => set(i, e.target.value)} onKeyDown={(e) => { if (e.key === "Backspace" && !d && i > 0) boxes.current[i - 1]?.focus(); }}
            className={cx("w-full min-w-0 h-14 rounded-xl border bg-surface text-center text-[22px] font-semibold tnum outline-none transition",
              error ? "border-bad" : "border-line focus:border-brand focus:ring-4 focus:ring-brand/15")} />
        ))}
      </div>
      <input type="hidden" name={name} value={digits.join("")} />
    </fieldset>
  );
}

export function CodeStep({ sentTo, name, trustDays, test, inLog, shownCode }: { sentTo: string; name: string; trustDays: number; test: boolean; inLog?: boolean; shownCode?: string | null }) {
  const [state, action, pending] = useActionState<CodeState, FormData>(consoleCodeAction, null);
  const [resent, setResent] = useState<CodeState>(null);
  const [sending, startSending] = useTransition();
  const shown = resent && (!state || resent.sent) ? resent : state;
  if (shown?.restart) {
    return (
      <div className="mt-5 flex flex-col gap-4">
        <Alert tone="danger">{shown.message}</Alert>
        <form action={consoleBackAction}><Button type="submit" variant="primary" size="lg" className="w-full">Start again</Button></form>
      </div>
    );
  }
  const wrong = Boolean(state?.message && !shown?.sent);
  return (
    <form action={(fd) => { setResent(null); action(fd); }} noValidate className="mt-5 flex flex-col gap-4">
      {shown?.message && <Alert tone={shown.sent ? "success" : "danger"}>{shown.message}</Alert>}
      {shownCode ? (
        <Alert tone="info">Test copy: no SMS is set up, so your code is <b className="font-semibold tracking-widest">{shownCode}</b>.</Alert>
      ) : (
        test && <TestCodeNote inLog={inLog} />
      )}
      <OtpBoxes label={`6-digit code sent to +91 ${sentTo}`} error={wrong} />
      <p className="text-[12.5px] text-ink3 -mt-2">It works for 10 minutes.</p>
      <label className="flex items-start gap-2.5 text-[14px] text-ink2 cursor-pointer select-none">
        <input type="checkbox" name="trust" className="mt-0.5 size-5 shrink-0 rounded-md accent-brand" />
        <span>Trust this device for {trustDays} days. Only on your own phone or computer.</span>
      </label>
      <p className="text-[13px] text-ink3">Signing in as <b className="font-semibold text-ink2">{name}</b>. The console signs you out after 30 minutes without use.</p>
      <Button type="submit" variant="primary" size="lg" className="w-full mt-1" loading={pending} loadingText="Checking…">Verify and open console</Button>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
        <button type="button" disabled={sending} className="h-10 font-semibold text-brand hover:underline disabled:opacity-60"
          onClick={() => startSending(async () => setResent(await consoleResendAction()))}>
          {sending ? "Sending…" : "Send a new code"}
        </button>
        <button type="submit" formAction={consoleBackAction} formNoValidate className="h-10 font-semibold text-ink2 hover:text-ink">Back to password</button>
      </div>
    </form>
  );
}

export function TimedOut() {
  return (
    <div className="mt-5 flex flex-col gap-4">
      <Alert tone="danger">Your sign-in has timed out, or the code was used up. Start again to get a new code.</Alert>
      <ButtonLink href="/console/sign-in" variant="primary" size="lg" className="w-full">Start again</ButtonLink>
    </div>
  );
}
