"use client";

// A button for a quick, safe change (no confirmation needed, P4). It shows
// it is working, cannot be pressed twice, and says in plain words if the
// change did not happen.
import { useState, useTransition } from "react";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";

export function ActionButton({ label, pendingLabel, run, variant = "secondary", size = "sm", className }: {
  label: React.ReactNode; pendingLabel?: string; run: () => Promise<string | void>; variant?: ButtonVariant; size?: ButtonSize; className?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <Button variant={variant} size={size} className={className} loading={pending} loadingText={pendingLabel}
        onClick={() => start(async () => {
          setError(null);
          try {
            const problem = await run();
            if (problem) setError(problem);
          } catch {
            setError("That did not work, and nothing was changed. Please try again.");
          }
        })}>
        {label}
      </Button>
      {error && <span role="alert" className="mt-1 max-w-xs text-sm text-danger">{error}</span>}
    </span>
  );
}
