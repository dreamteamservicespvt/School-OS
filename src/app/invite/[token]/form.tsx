"use client";

import { useActionState } from "react";
import { acceptInviteAction, type InviteState } from "./actions";

export function InviteForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(acceptInviteAction.bind(null, token), null);
  return (
    <form action={action} className="space-y-4">
      {state?.message && (
        <p className="rounded-lg border border-danger/30 bg-red-50 px-3 py-2 text-sm text-danger" role="alert">{state.message}</p>
      )}
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium">New password</label>
        <input id="password" name="password" type="password" autoComplete="new-password" required aria-describedby="password-help"
          className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-base" />
        <p id="password-help" className="mt-1 text-sm text-ink-2">At least 8 characters, with a letter and a number.</p>
      </div>
      <div>
        <label htmlFor="confirm" className="mb-1 block text-sm font-medium">Type it again</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required
          className="h-11 w-full rounded-lg border border-line bg-surface px-3 text-base" />
      </div>
      <button type="submit" disabled={pending} className="h-11 w-full rounded-lg bg-brand font-medium text-brand-ink disabled:opacity-60">
        {pending ? "Saving…" : "Set my password"}
      </button>
    </form>
  );
}
