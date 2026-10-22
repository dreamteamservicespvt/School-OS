"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldShell, inputCls } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import { changePassword, type PasswordState } from "../actions";
import { Words } from "@/lib/i18n/client";

/** `withoutOld`: the person just signed in with a one-time code, so the old password is not asked for. */
export function PasswordForm({ withoutOld = false, minLength = 8, rulesWords }: { withoutOld?: boolean; /** The school's shortest password (Password Policy). */ minLength?: number; rulesWords?: string }) {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePassword, null);
  const [show, setShow] = useState(false);
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const rules = [
    { ok: pw.length >= minLength, text: `${minLength} or more characters` },
    { ok: /[a-z]/i.test(pw), text: "A letter" },
    { ok: /\d/.test(pw), text: "A number" },
  ];
  const ready = rules.every((r) => r.ok) && pw === again;
  if (state?.ok) return <p role="status" className="rounded-xl bg-ok/10 px-3.5 py-2.5 text-sm text-ok">{state.message}</p>;
  return (
    <form action={action} className="flex flex-col gap-4">
      {state && <p role="alert" className="rounded-xl bg-bad/10 px-3.5 py-2.5 text-sm text-bad">{state.message}</p>}
      {rulesWords && <p className="text-sm text-ink2">{rulesWords}</p>}
      {withoutOld ? (
        <p className="rounded-xl bg-sunken px-3.5 py-2.5 text-sm text-ink2"><Words k="You signed in with a one-time code, so your old password is not needed. Choose a new one." /></p>
      ) : (
        <FieldShell label="Current password" id="currentPassword" required>
          <input id="currentPassword" name="currentPassword" type={show ? "text" : "password"} autoComplete="current-password" required className={cx(inputCls(), "h-11")} />
        </FieldShell>
      )}
      <FieldShell label="New password" id="newPassword" required>
        <div className="relative">
          <input id="newPassword" name="newPassword" type={show ? "text" : "password"} autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} className={cx(inputCls(), "h-11 pr-12")} />
          <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide passwords" : "Show passwords"} className="absolute right-1 top-1 grid size-9 place-items-center rounded-lg text-ink3 hover:bg-sunken">
            {show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
          </button>
        </div>
      </FieldShell>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]" aria-label="Password rules">
        {rules.map((r) => <li key={r.text} className={r.ok ? "text-ok font-semibold" : "text-ink3"}>{r.ok ? "✓" : "○"} {r.text}</li>)}
      </ul>
      <FieldShell label="Type the new password again" id="confirmPassword" required error={again && pw !== again ? "The two passwords are not the same yet." : undefined}>
        <input id="confirmPassword" name="confirmPassword" type={show ? "text" : "password"} autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} className={cx(inputCls(again && pw !== again), "h-11")} />
      </FieldShell>
      <Button type="submit" loading={pending} loadingText="Changing…" disabled={!ready} className="self-start"><Words k="Change password" /></Button>
    </form>
  );
}
