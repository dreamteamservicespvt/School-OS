"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { resendCodeAction, verifyCodeAction, type CodeState } from "../actions";

export function CodeForm({ sentTo, trustDays }: { sentTo: string; trustDays: number }) {
  const [state, action, pending] = useActionState<CodeState, FormData>(verifyCodeAction, null);
  const [resent, setResent] = useState<CodeState>(null);
  const [sending, startSending] = useTransition();
  const shown = resent && (!state || resent.sent) ? resent : state;
  const restart = state?.restart || resent?.restart;

  if (restart) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">{shown?.message}</p>
        <Link href="/sign-in" className="flex h-11 w-full items-center justify-center rounded-lg bg-brand font-medium text-brand-ink">Sign in again</Link>
      </div>
    );
  }

  return (
    <form action={(fd) => { setResent(null); action(fd); }} className="space-y-4" noValidate>
      <p className="text-sm">We sent a 6-digit code to <span className="font-medium">{sentTo}</span>. It works for 10 minutes.</p>
      {shown?.message && (
        <p className={`rounded-lg px-3 py-2 text-sm ${shown.sent ? "bg-brand-soft text-ink" : "border border-danger/30 bg-danger-soft text-danger"}`} role={shown.sent ? "status" : "alert"}>{shown.message}</p>
      )}
      <div>
        <label htmlFor="code" className="mb-1 block text-sm font-medium">One-time code</label>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={7} required autoFocus
          aria-invalid={Boolean(state?.message && !shown?.sent)}
          className="h-12 w-full rounded-lg border border-line bg-surface px-3 text-center font-mono text-2xl tracking-[0.4em]" />
      </div>
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input type="checkbox" name="trust" className="mt-0.5 size-5 shrink-0 accent-brand" />
        <span>Trust this device for {trustDays} days. Only on your own phone or computer, never a shared one.</span>
      </label>
      <button type="submit" disabled={pending} className="h-11 w-full rounded-lg bg-brand font-medium text-brand-ink disabled:opacity-60">
        {pending ? "Checking…" : "Finish signing in"}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <button type="button" disabled={sending} className="min-h-11 font-medium text-brand-text hover:underline disabled:opacity-60"
          onClick={() => startSending(async () => setResent(await resendCodeAction()))}>
          {sending ? "Sending…" : "Send a new code"}
        </button>
        <Link href="/sign-in" className="min-h-11 content-center text-ink-2 hover:underline">Use another login</Link>
      </div>
      <p className="text-sm text-ink-2">Lost your phone or no access to your email? Another School Admin or the Principal can reset two-step login for you.</p>
    </form>
  );
}
