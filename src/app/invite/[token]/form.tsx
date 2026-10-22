"use client";

import { useActionState, useState } from "react";
import { Check, Circle, Eye, EyeOff } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import { acceptInviteAction, type InviteState } from "./actions";

export function InviteForm({ token, minLength = 8, rulesWords }: { token: string; /** The school's shortest password (Password Policy). */ minLength?: number; rulesWords?: string }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(acceptInviteAction.bind(null, token), null);
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  // The same rules the server checks, shown as the person types.
  const rules = [
    { ok: pw.length >= minLength, label: `At least ${minLength} characters` },
    { ok: /[a-z]/i.test(pw), label: "A letter" },
    { ok: /\d/.test(pw), label: "A number" },
  ];
  const ready = rules.every((r) => r.ok) && pw === again;
  const mismatch = again.length > 0 && again !== pw;
  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.message && <Alert tone="danger">{state.message}</Alert>}
      {rulesWords && <p className="text-[13px] text-ink2">{rulesWords}</p>}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-[13px] font-semibold text-ink2">New password</label>
        <div className="relative">
          <input id="password" name="password" type={show ? "text" : "password"} autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)}
            aria-describedby="password-rules" className={cx(inputCls(), "h-11 pr-12")} />
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
      <Button type="submit" variant="primary" size="lg" className="w-full mt-1" loading={pending} loadingText="Saving…" disabled={!ready}>Set my password</Button>
    </form>
  );
}
