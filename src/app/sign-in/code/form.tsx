"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { KeepCheck } from "@/components/ui/keep-select";
import { resendCodeAction, verifyCodeAction, type CodeState } from "../actions";
import { useT } from "@/lib/i18n/client";

export function CodeForm({ sentTo, remembers, sharedDefault = false }: { sentTo: string; remembers: boolean; sharedDefault?: boolean }) {
  const t = useT();
  const [state, action, pending] = useActionState<CodeState, FormData>(verifyCodeAction, null);
  const [resent, setResent] = useState<CodeState>(null);
  // Held by React: a wrong code must not untick "Shared computer" (the device would then be remembered).
  const [shared, setShared] = useState(sharedDefault);
  const [sending, startSending] = useTransition();
  const shown = resent && (!state || resent.sent) ? resent : state;
  const restart = state?.restart || resent?.restart;
  const wrong = Boolean(state?.message && !shown?.sent);

  if (restart) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="danger">{shown?.message}</Alert>
        <ButtonLink href="/sign-in" variant="primary" size="lg" className="w-full">{t("Sign in again")}</ButtonLink>
      </div>
    );
  }

  return (
    <form action={(fd) => { setResent(null); action(fd); }} className="flex flex-col gap-4" noValidate>
      <p className="text-[15px] text-ink2">{t("We sent a 6-digit code to {to}. It works for 10 minutes.", { to: sentTo })}</p>
      {shown?.message && <Alert tone={shown.sent ? "success" : "danger"}>{shown.message}</Alert>}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="code" className="text-[13px] font-semibold text-ink2">{t("6-digit code")}</label>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={7} required autoFocus
          aria-invalid={wrong || undefined}
          className={cx("w-full h-14 rounded-xl border bg-surface text-center text-[24px] font-semibold tnum tracking-[0.5em] outline-none transition",
            wrong ? "border-bad ring-4 ring-bad/10" : "border-line focus:border-brand focus:ring-4 focus:ring-brand/15")} />
      </div>
      {remembers && (
        <label className="flex items-start gap-2.5 text-[14px] text-ink2 cursor-pointer select-none">
          <KeepCheck type="checkbox" name="shared" checked={shared} onChange={(e) => setShared(e.target.checked)} className="mt-0.5 size-5 shrink-0 rounded-md accent-brand" />
          <span>{t("Shared computer: ask for the code every time.")} <span className="text-ink3">{t("Otherwise this device is remembered and will not ask for a code until you sign out here.")}</span></span>
        </label>
      )}
      <Button type="submit" variant="primary" size="lg" className="w-full mt-1" loading={pending} loadingText={t("Checking…")}>{t("Verify and sign in")}</Button>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[14px]">
        <button type="button" disabled={sending} className="h-10 font-semibold text-brand hover:underline disabled:opacity-60"
          onClick={() => startSending(async () => setResent(await resendCodeAction()))}>
          {sending ? t("Sending…") : t("Send a new code")}
        </button>
        <Link href="/sign-in" className="h-10 content-center font-semibold text-ink2 hover:text-ink">{t("Use another login")}</Link>
      </div>
      <p className="text-[13px] text-ink3">{t("No access to your phone or email? Another School Admin or the Principal can reset two-step login for you.")}</p>
    </form>
  );
}
