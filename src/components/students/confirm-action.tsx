"use client";

// A risky action behind a confirmation (P4), run by a server action. When a
// reason is needed, it is asked inside the confirmation and checked here and
// again on the server.

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/ui/confirm";
import type { ButtonVariant } from "@/components/ui/button";
import { Button } from "@/components/ui/button";

type ServerAction = (formData: FormData) => Promise<string | void>;

export function ConfirmAction({ action, fields = {}, trigger, triggerVariant, title, children, confirmLabel, confirmVariant, typeToConfirm, reason }: {
  action: ServerAction;
  fields?: Record<string, string>;
  trigger: React.ReactNode;
  triggerVariant?: ButtonVariant;
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  confirmVariant?: ButtonVariant;
  typeToConfirm?: string;
  /** Ask for a reason (at least `min` characters). */
  reason?: { label: string; min?: number; placeholder?: string };
}) {
  const [text, setText] = useState("");
  const id = useId();
  const router = useRouter();
  return (
    <ConfirmButton trigger={trigger} triggerVariant={triggerVariant} title={title} confirmLabel={confirmLabel} confirmVariant={confirmVariant} typeToConfirm={typeToConfirm}
      onConfirm={async () => {
        const min = reason?.min ?? 5;
        if (reason && text.trim().length < min) return `${reason.label} is needed (at least ${min} letters).`;
        const fd = new FormData();
        for (const [k, v] of Object.entries(fields)) fd.set(k, v);
        if (reason) fd.set("reason", text.trim());
        const problem = await action(fd);
        if (problem) return problem;
        setText("");
        router.refresh();
      }}>
      {children}
      {reason && (
        <div className="mt-3">
          <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">{reason.label}<span className="text-danger" aria-hidden="true"> *</span></label>
          <textarea id={id} rows={2} value={text} placeholder={reason.placeholder} onChange={(e) => setText(e.target.value)}
            className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-base text-ink" />
        </div>
      )}
    </ConfirmButton>
  );
}

/** A small button that runs a server action at once (for safe, undoable changes). */
export function ActionButton({ action, fields = {}, children, variant = "secondary", size = "sm", className }: {
  action: ServerAction; fields?: Record<string, string>; children: React.ReactNode; variant?: ButtonVariant; size?: "sm" | "md"; className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <span className="inline-flex flex-col items-start">
      <Button variant={variant} size={size} className={className} loading={busy} onClick={async () => {
        setBusy(true); setError(null);
        const fd = new FormData();
        for (const [k, v] of Object.entries(fields)) fd.set(k, v);
        try {
          const problem = await action(fd);
          if (problem) setError(problem); else router.refresh();
        } catch {
          setError("That did not work. Nothing was changed. Please try again.");
        } finally { setBusy(false); }
      }}>{children}</Button>
      {error && <span role="alert" className="mt-1 max-w-xs text-sm text-danger">{error}</span>}
    </span>
  );
}

/** A choice that saves as soon as it changes (for example an application's status). */
export function ActionSelect({ action, fields = {}, name, label, value, options }: {
  action: ServerAction; fields?: Record<string, string>; name: string; label: string; value: string; options: readonly string[];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <span className="inline-flex flex-col">
      <label className="sr-only" htmlFor={`${name}-${fields.id ?? ""}`}>{label}</label>
      <select id={`${name}-${fields.id ?? ""}`} defaultValue={value} disabled={busy} aria-busy={busy || undefined}
        onChange={async (e) => {
          setBusy(true); setError(null);
          const fd = new FormData();
          for (const [k, v] of Object.entries(fields)) fd.set(k, v);
          fd.set(name, e.target.value);
          const problem = await action(fd).catch(() => "That did not save. Please try again.");
          setBusy(false);
          if (problem) setError(problem); else router.refresh();
        }}
        className="h-11 rounded-lg border border-line-strong bg-surface px-2 text-[15px]">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {error && <span role="alert" className="mt-1 text-sm text-danger">{error}</span>}
    </span>
  );
}
