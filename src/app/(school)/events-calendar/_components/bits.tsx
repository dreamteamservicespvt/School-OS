"use client";

// Small client pieces shared by the Events & Calendar pages.

import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { ChevronDown } from "lucide-react";
import { inputCls } from "@/components/ui/field";
import { useSheetResult } from "@/components/ui/url-sheet";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import type { FormState } from "@/lib/forms";
import { EvIcon } from "./icons";
import { Words } from "@/lib/i18n/client";

/** A select whose choices are page addresses (Jump to month, class, campus). */
export function JumpSelect({ value, options, label, id, className }: { value: string; options: { value: string; label: string; href: string }[]; label: string; id: string; className?: string }) {
  const router = useRouter();
  return (
    <div className={cx("relative", className)}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <select id={id} value={value} onChange={(e) => { const o = options.find((x) => x.value === e.target.value); if (o) router.push(o.href, { scroll: false }); }}
        className={cx(inputCls(false), "h-10 appearance-none pr-9 cursor-pointer text-[14px]")}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink3 pointer-events-none" aria-hidden="true" />
    </div>
  );
}

/**
 * After a warning the person may accept ("Make it a holiday anyway?"), the
 * next press of the same button sends `confirm` and saves anyway.
 */
export function WarningConfirm({ keyName }: { keyName: string }) {
  const state = useSheetResult() as FormState<{ warning?: string }>;
  const w = state && !state.ok ? (state.data as { warning?: string } | undefined)?.warning : undefined;
  if (w !== keyName) return null;
  return (
    <>
      <input type="hidden" name="confirm" value={w} />
      <p className="text-[12.5px] text-ink2 rounded-xl bg-warn/10 px-3 py-2"><Words k="Press the button again to save anyway." /></p>
    </>
  );
}

type Act = (s: FormState<unknown>, fd: FormData) => Promise<FormState<unknown>>;

/** A one-tap action (a small form) that shows its problem in place. */
export function ActButton({ action, fields, label, icon, variant = "secondary", size = "sm", className, pendingText }: { action: Act; fields: Record<string, string>; label: React.ReactNode; icon?: string; variant?: ButtonVariant; size?: "sm" | "md"; className?: string; pendingText?: string }) {
  const [state, run, pending] = useActionState<FormState<unknown>, FormData>(action, null);
  return (
    <form action={run} className={cx("relative z-[1] inline-flex flex-col items-start gap-1", className)}>
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Button type="submit" variant={variant} size={size} loading={pending} className={className?.includes("w-full") ? "w-full" : undefined}>
        {icon && !pending && <EvIcon name={icon} size={size === "sm" ? 15 : 17} />}{pending && pendingText ? pendingText : label}
      </Button>
      {state && !state.ok && <span className="text-[12px] text-bad max-w-[260px]" role="alert">{state.message}</span>}
    </form>
  );
}

/** Copies a link to the clipboard. */
export function CopyLink({ url, label = "Copy" }: { url: string; label?: string }) {
  return (
    <Button size="sm" variant="ghost" onClick={() => { void navigator.clipboard?.writeText(url); }}>
      <EvIcon name="Copy" size={15} />{label}
    </Button>
  );
}
