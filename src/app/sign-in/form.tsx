"use client";

import { useActionState } from "react";
import { signInAction, type SignInState } from "./actions";

export function SignInForm({ notice }: { notice?: string }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(signInAction, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      {notice && !state && (
        <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm text-ink" role="status">{notice}</p>
      )}
      {state?.message && (
        <p className="rounded-lg border border-danger/30 bg-red-50 px-3 py-2 text-sm text-danger" role="alert">{state.message}</p>
      )}
      <div>
        <label htmlFor="username" className="mb-1 block text-sm font-medium">Username</label>
        <input id="username" name="username" autoComplete="username" autoCapitalize="none" required defaultValue={state?.username}
          className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-base" />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required
          className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-base" />
      </div>
      <button type="submit" disabled={pending}
        className="h-11 w-full rounded-lg bg-brand font-medium text-brand-ink disabled:opacity-60">
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-sm text-ink-2">Forgot your password? Ask your School Admin to send you a new invite link.</p>
    </form>
  );
}
