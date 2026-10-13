"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Circle, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { inputCls } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import { StepDots } from "@/components/console/console-frame";
import { OtpBoxes } from "../../sign-in/form";
import { welcomeFinishAction, welcomeSendAction, type WelcomeSend, type WelcomeState } from "./actions";

export function WelcomeForm({ token, phoneMasked }: { token: string; phoneMasked: string }) {
  const [sent, setSent] = useState<WelcomeSend>(null);
  const [sending, startSending] = useTransition();
  const [state, action, pending] = useActionState<WelcomeState, FormData>(welcomeFinishAction.bind(null, token), null);
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const send = () => startSending(async () => setSent(await welcomeSendAction(token)));

  if (state?.restart) {
    return (
      <div className="mt-5 flex flex-col gap-4">
        <Alert tone="danger">{state.message}</Alert>
        <ButtonLink href="/console/sign-in" variant="primary" size="lg" className="w-full">Go to console sign in</ButtonLink>
      </div>
    );
  }
  if (!sent?.ok) {
    return (
      <>
        <StepDots step={1} labels={["Confirm your phone", "Set your password"]} />
        <div className="mt-5 flex flex-col gap-4">
          {sent && !sent.ok && <Alert tone="danger">{sent.message}</Alert>}
          <p className="text-[13.5px] text-ink2 rounded-xl bg-sunken p-3.5 flex gap-2.5">
            <ShieldCheck size={18} className="text-brand shrink-0 mt-0.5" aria-hidden="true" />
            <span>We send a 6-digit code by SMS to <b className="font-semibold tnum">+91 {phoneMasked}</b>. Two-step login stays on for every sign-in.</span>
          </p>
          <Button variant="primary" size="lg" className="w-full" loading={sending} loadingText="Sending…" onClick={send}>Send the code</Button>
        </div>
      </>
    );
  }
  const rules = [
    { ok: pw.length >= 8, label: "At least 8 characters" },
    { ok: /[a-z]/i.test(pw), label: "A letter" },
    { ok: /\d/.test(pw), label: "A number" },
  ];
  const mismatch = again.length > 0 && again !== pw;
  const ready = rules.every((r) => r.ok) && pw === again;
  return (
    <>
      <StepDots step={2} labels={["Confirm your phone", "Set your password"]} />
      <form action={action} noValidate className="mt-5 flex flex-col gap-4">
        {state?.message ? <Alert tone="danger">{state.message}</Alert> : <Alert tone="success">{sent.message}</Alert>}
        {sent.test && <Alert tone="info">No SMS provider is set up on this server, so the code was written to the server log.</Alert>}
        <OtpBoxes label={`6-digit code sent to +91 ${sent.sentTo}`} error={state?.field === "code"} />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-[13px] font-semibold text-ink2">Choose a password</label>
          <div className="relative">
            <input id="password" name="password" type={show ? "text" : "password"} autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)}
              aria-describedby="password-rules" aria-invalid={state?.field === "password" || undefined} className={cx(inputCls(state?.field === "password"), "h-11 pr-12")} />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center rounded-lg text-ink3 hover:bg-sunken">
              {show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
          <ul id="password-rules" className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
            {rules.map((r) => (
              <li key={r.label} className={cx("flex items-center gap-1.5", r.ok ? "text-ok" : "text-ink3")}>
                {r.ok ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : <Circle size={12} aria-hidden="true" />}
                {r.label}<span className="sr-only">{r.ok ? " (done)" : " (still needed)"}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="confirm" className="text-[13px] font-semibold text-ink2">Type it again</label>
          <input id="confirm" name="confirm" type={show ? "text" : "password"} autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)}
            aria-invalid={mismatch || undefined} aria-describedby={mismatch ? "confirm-error" : undefined} className={cx(inputCls(mismatch), "h-11")} />
          {mismatch && <p id="confirm-error" className="text-[12.5px] text-bad">The two passwords are not the same yet.</p>}
        </div>
        <Button type="submit" variant="primary" size="lg" className="w-full mt-1" loading={pending} loadingText="Saving…" disabled={!ready}>Save and open the console</Button>
        <button type="button" disabled={sending} onClick={send} className="h-10 self-start text-[14px] font-semibold text-brand hover:underline disabled:opacity-60">{sending ? "Sending…" : "Send a new code"}</button>
      </form>
    </>
  );
}
