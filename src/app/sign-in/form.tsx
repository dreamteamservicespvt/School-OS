"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { FieldShell, inputCls } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import { KeepCheck } from "@/components/ui/keep-select";
import { codeSignInAction, signInAction, type SignInState } from "./actions";
import { useT } from "@/lib/i18n/client";

export function SignInForm({ notice, noticeTone = "success", startWithCode }: { notice?: string; noticeTone?: "success" | "info"; startWithCode?: boolean }) {
  const t = useT();
  const [mode, setMode] = useState<"password" | "code">(startWithCode ? "code" : "password");
  const [state, action, pending] = useActionState<SignInState, FormData>(signInAction, null);
  const [codeState, codeAction, codePending] = useActionState<SignInState, FormData>(codeSignInAction, null);
  const [show, setShow] = useState(false);
  const [login, setLogin] = useState("");
  // Held by React: a wrong password must not tick "Keep me signed in" again after it was taken off.
  const [remember, setRemember] = useState(true);
  const [missing, setMissing] = useState<{ login?: string; password?: string }>({});
  const current = mode === "password" ? state : codeState;
  const busy = mode === "password" ? pending : codePending;

  // Say what is missing before going to the server.
  function check(e: React.FormEvent<HTMLFormElement>) {
    const fd = new FormData(e.currentTarget);
    const m: typeof missing = {};
    if (!String(fd.get("username") ?? "").trim()) m.login = t("Enter your mobile number, email or username");
    if (mode === "password" && !String(fd.get("password") ?? "")) m.password = t("Enter your password");
    setMissing(m);
    if (Object.keys(m).length) e.preventDefault();
  }

  return (
    <form action={mode === "password" ? action : codeAction} onSubmit={check} noValidate className="flex flex-col gap-4">
      {notice && !current && <Alert tone={noticeTone}>{notice}</Alert>}
      {current?.message && <Alert tone="danger">{current.message}</Alert>}

      <FieldShell label={t("Mobile number, email or username")} id="username" error={missing.login}>
        <input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false}
          value={login} onChange={(e) => { setLogin(e.target.value); setMissing({}); }}
          aria-invalid={missing.login ? true : undefined} aria-describedby={missing.login ? "username-error" : undefined}
          placeholder={t("98480 12345 or name@school.in")} className={cx(inputCls(missing.login), "h-11")} />
      </FieldShell>

      {mode === "password" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-[13px] font-semibold text-ink2">{t("Password")}</label>
          <div className="relative">
            <input id="password" name="password" type={show ? "text" : "password"} autoComplete="current-password"
              onChange={() => setMissing({})} aria-invalid={missing.password ? true : undefined} aria-describedby={missing.password ? "password-error" : undefined}
              placeholder={t("Your password")} className={cx(inputCls(missing.password), "h-11 pr-12")} />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? t("Hide password") : t("Show password")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center rounded-lg text-ink3 hover:bg-sunken">
              {show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
          {missing.password && <p id="password-error" className="text-[12.5px] text-bad">{missing.password}</p>}
        </div>
      ) : (
        <p className="text-[14px] text-ink2 rounded-xl bg-sunken p-3.5 flex gap-2.5">
          <MessageSquareText size={18} className="text-brand shrink-0 mt-0.5" aria-hidden="true" />
          {t("We will send a 6-digit code to the mobile number or email on your login. If your role needs two-step login, a second code goes to your other contact. After signing in you can set a new password in My profile.")}
        </p>
      )}

      <label className="flex items-center gap-2.5 text-[14px] text-ink2 cursor-pointer select-none">
        <KeepCheck type="checkbox" name="remember" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-5 rounded-md accent-brand" />
        {t("Keep me signed in on this device")}
      </label>

      <Button type="submit" variant="primary" size="lg" className="w-full mt-1" loading={busy} loadingText={t("Checking…")}>
        {mode === "code" ? t("Send code") : t("Sign in")}
      </Button>
      {/* "Forgot password?" sits after Sign in, so Tab goes login, password, Sign in and a quick Tab and Enter cannot switch to the code flow (QA PLATFORM-16). */}
      <button type="button" onClick={() => { setMode(mode === "code" ? "password" : "code"); setMissing({}); }} className="text-[14px] font-semibold text-ink2 hover:text-ink h-10">
        {mode === "code" ? t("Use password instead") : t("Forgot password? Sign in with a one-time code")}
      </button>
    </form>
  );
}
