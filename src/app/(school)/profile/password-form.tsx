"use client";

import { useActionState } from "react";
import { changePassword, type PasswordState } from "../actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePassword, null);
  const field = "h-11 w-full rounded-lg border border-line bg-surface px-3 text-base";
  return (
    <form action={action} className="max-w-md space-y-4">
      {state && (
        <p role={state.ok ? "status" : "alert"}
          className={`rounded-lg px-3 py-2 text-sm ${state.ok ? "bg-success-soft text-success" : "border border-danger/30 bg-danger-soft text-danger"}`}>
          {state.message}
        </p>
      )}
      <div>
        <label htmlFor="currentPassword" className="mb-1 block text-sm font-medium">Current password</label>
        <input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required className={field} />
      </div>
      <div>
        <label htmlFor="newPassword" className="mb-1 block text-sm font-medium">New password</label>
        <input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required aria-describedby="new-help" className={field} />
        <p id="new-help" className="mt-1 text-sm text-ink-2">At least 8 characters, with a letter and a number. Your other devices will be signed out.</p>
      </div>
      <div>
        <label htmlFor="confirmPassword" className="mb-1 block text-sm font-medium">Type the new password again</label>
        <input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required className={field} />
      </div>
      <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-brand px-5 font-medium text-brand-ink disabled:opacity-60">
        {pending ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}
