"use client";

// Remind (owner's prototype changes of 13 Oct 2026): the person who looks
// after the whole school asks the one who owes the work, instead of doing it.
// Runs a server action; on success the page refreshes and shows the toast,
// and the button turns into "Reminded at 10:44 AM".

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellRing, Check } from "lucide-react";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";

export function RemindButton({ run, label = "Remind", done, doneLabel = "Reminded", size = "sm", variant = "secondary", all = false, className }: {
  /** A server action bound to what it reminds about; returns a problem in plain words, or null. */
  run: () => Promise<string | null>;
  label?: string;
  /** When a reminder already went out today, e.g. "10:44 AM". */
  done?: string | null;
  /** The word before the time once done ("Asked 10:44 AM"). */
  doneLabel?: string;
  size?: "sm" | "md";
  variant?: ButtonVariant;
  /** "Remind all" style (bell ringing). */
  all?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  if (done) return <Pill tone="ok" className={className}><Check size={13} strokeWidth={3} aria-hidden="true" />{doneLabel} {done}</Pill>;
  return (
    <span className={className}>
      <Button size={size} variant={variant} icon={all ? BellRing : Bell} loading={pending} loadingText="Sending…"
        onClick={() => start(async () => {
          setProblem(null);
          const p = await run();
          if (p) setProblem(p);
          else router.refresh();
        })}>
        {label}
      </Button>
      {problem && <span role="alert" className="block mt-1 text-[12.5px] text-bad max-w-[260px]">{problem}</span>}
    </span>
  );
}
