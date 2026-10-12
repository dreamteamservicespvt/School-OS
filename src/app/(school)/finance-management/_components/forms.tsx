"use client";

// Shared forms on the Finance pages: a confirmation that needs a reason
// (cancel, reject), and a one-tap action button that shows its problem.

import { useActionState } from "react";
import { Ban, Check, CircleCheck, Copy, Send, Undo2, Wallet, type LucideIcon } from "lucide-react";
import { SheetForm, useSheetResult } from "@/components/ui/url-sheet";
import { SArea } from "@/components/ui/sheet-fields";
import { Button, type ButtonVariant } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";

/** Icons by name: a server page cannot pass an icon component to this client file. */
const ICONS = { check: Check, approve: CircleCheck, pay: Wallet, send: Send, undo: Undo2, copy: Copy, stop: Ban } satisfies Record<string, LucideIcon>;
export type ActIcon = keyof typeof ICONS;

type Act = (prev: unknown, fd: FormData) => Promise<FormState<unknown>>;

export function ReasonSheet({ closeHref, title, sub, label, placeholder, action, hidden, danger = true, children }: {
  closeHref: string; title: string; sub?: React.ReactNode; label: string; placeholder?: string; action: Act; hidden: Record<string, string>; danger?: boolean; children?: React.ReactNode;
}) {
  return (
    <SheetForm title={title} sub={sub} closeHref={closeHref} action={action} submitLabel={label} submitVariant={danger ? "danger" : "primary"} pendingText="Saving…" hidden={hidden}>
      {children}
      <SArea name="reason" label="Reason" required rows={3} placeholder={placeholder} help="Kept with the record and in the audit log." />
    </SheetForm>
  );
}

/** A button that runs one server action (Post, Approve, Mark paid...). */
export function ActButton({ action, fields, label, icon, variant = "primary", size = "md" }: { action: Act; fields: Record<string, string>; label: string; icon?: ActIcon; variant?: ButtonVariant; size?: "sm" | "md" }) {
  const [state, run, pending] = useActionState<FormState<unknown>, FormData>(action as never, null);
  if (state?.ok) return null;
  return (
    <form action={run} className="relative z-10 inline-flex flex-col items-start gap-1">
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Button type="submit" variant={variant} size={size} icon={icon ? ICONS[icon] : undefined} loading={pending}>{label}</Button>
      {state && !state.ok && <span className="text-[12px] text-bad max-w-[240px]" role="alert">{state.message}</span>}
    </form>
  );
}

/** After the server warned about a likely mistake on one field: a box to confirm and save again. */
export function WarnCheck({ field, name, title, sub }: { field: string; name: string; title: string; sub?: string }) {
  const state = useSheetResult();
  const warned = state && !state.ok && (state.data as { warning?: boolean } | undefined)?.warning && state.errors?.[field];
  if (!warned) return null;
  return (
    <label className="flex items-center gap-3 rounded-xl bg-sunken/70 px-3.5 py-3 text-[14px]">
      <input type="checkbox" name={name} className="w-5 h-5 accent-[var(--color-brand)]" />
      <span><b className="font-semibold">{title}</b>{sub && <span className="block text-[12.5px] text-ink3">{sub}</span>}</span>
    </label>
  );
}
