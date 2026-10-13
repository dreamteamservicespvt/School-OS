"use client";

// Shared sheets on the Salary pages: a confirmation (send, approve, lock) and
// the link a problem may carry ("Open the existing one").

import Link from "next/link";
import { SheetForm, useSheetResult } from "@/components/ui/url-sheet";
import { buttonClass } from "@/components/ui/button";
import type { FormState } from "@/lib/forms";

type Act = (prev: unknown, fd: FormData) => Promise<FormState<unknown>>;

/** The link a refused save carries, such as "Open the existing one". */
export function ProblemLink() {
  const state = useSheetResult();
  const link = state && !state.ok ? (state.data as { link?: { href: string; label: string } } | undefined)?.link : undefined;
  if (!link) return null;
  return <Link href={link.href} scroll={false} className={buttonClass("secondary", "sm", "self-start")}>{link.label}</Link>;
}

export function ConfirmSheet({ closeHref, doneHref, title, sub, label, action, hidden, danger, children }: {
  closeHref: string; doneHref?: string; title: string; sub?: React.ReactNode; label: string; action: Act; hidden: Record<string, string>; danger?: boolean; children?: React.ReactNode;
}) {
  return (
    <SheetForm title={title} sub={sub} closeHref={closeHref} doneHref={doneHref} action={action} submitLabel={label} submitVariant={danger ? "danger" : "primary"} pendingText="Saving…" hidden={hidden}>
      {children}
      <ProblemLink />
    </SheetForm>
  );
}
