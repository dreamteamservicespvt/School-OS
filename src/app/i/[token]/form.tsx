"use client";

// Step 1: send a code to the mobile on the invite. Step 2: the code and a new password.
import { useActionState, useState, useTransition } from "react";
import { Check, Circle, Eye, EyeOff, MessageSquareText } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { TestCodeNote, codeNotSent } from "@/components/console/test-code-note";
import { Button, ButtonLink } from "@/components/ui/button";
import { inputCls } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import { OtpBoxes } from "@/app/console/sign-in/form";
import { finishInviteAction, sendInviteCodeAction, type FinishState, type SendState } from "./actions";

export function SchoolInviteForm({ token, phoneMasked, reset }: { token: string; phoneMasked: string; reset: boolean }) {
  const [sent, setSent] = useState<SendState>(null);
  const [sending, startSending] = useTransition();
  const [state, action, pending] = useActionState<FinishState, FormData>(finishInviteAction.bind(null, token), null);
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const send = () => startSending(async () => setSent(await sendInviteCodeAction(token)));

  if (state?.restart) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="danger">{state.message}</Alert>
        <ButtonLink href="/sign-in" variant="primary" size="lg" className="w-full">Go to sign in</ButtonLink>
      </div>
    );
  }
  if (!sent?.ok) {
    return (
      <div className="flex flex-col gap-4">
        {sent && !sent.ok && <Alert tone="danger">{sent.message}</Alert>}
        <div className="rounded-xl bg-sunken p-3.5 flex items-center gap-3 text-[14px]">
          <MessageSquareText size={20} className="text-brand shrink-0" aria-hidden="true" />
          <span>First we send a 6-digit code by SMS to <b className="font-semibold tnum">+91 {phoneMasked}</b>, to check this is your phone.</span>
        </div>
        <Button variant="primary" size="lg" className="w-full" loading={sending} loadingText="Sending…" onClick={send}>Send the code</Button>
      </div>
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
    <form action={action} noValidate className="flex flex-col gap-4">
      {state?.message ? <Alert tone="danger">{state.message}</Alert> : !codeNotSent(sent.test) && <Alert tone="success">{sent.message}</Alert>}
      {sent.test && <TestCodeNote />}
      <OtpBoxes label={`6-digit code sent to +91 ${sent.sentTo}`} error={state?.field === "code"} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-[13px] font-semibold text-ink2">{reset ? "New password" : "Choose a password"}</label>
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
      <Button type="submit" variant="primary" size="lg" className="w-full mt-1" loading={pending} loadingText="Saving…" disabled={!ready}>Save password and sign in</Button>
      <button type="button" disabled={sending} onClick={send} className="h-10 self-start text-[14px] font-semibold text-brand hover:underline disabled:opacity-60">{sending ? "Sending…" : "Send a new code"}</button>
    </form>
  );
}
