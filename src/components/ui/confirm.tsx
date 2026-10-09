"use client";

// Confirmation before risky actions only (00-global.md P4). It says exactly
// what will happen, and the button repeats the action. For the most
// sensitive changes the person types a word to confirm.

import { useEffect, useId, useRef, useState } from "react";
import { Button, type ButtonVariant } from "./button";

type Props = {
  /** The button that opens the confirmation. */
  trigger: React.ReactNode;
  triggerVariant?: ButtonVariant;
  triggerClassName?: string;
  title: string;
  children: React.ReactNode;
  /** Repeats the action, e.g. "Archive 3 students". Never just "OK". */
  confirmLabel: string;
  confirmVariant?: ButtonVariant;
  /** For the most sensitive changes: the word the person must type. */
  typeToConfirm?: string;
  /** Runs the action; return a message to show if it failed. */
  onConfirm: () => Promise<string | void> | string | void;
};

export function ConfirmButton({ trigger, triggerVariant = "secondary", triggerClassName, title, children, confirmLabel, confirmVariant = "primary", typeToConfirm, onConfirm }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const reset = () => { setTyped(""); setError(null); };
    d.addEventListener("close", reset);
    return () => d.removeEventListener("close", reset);
  }, []);

  const ready = !typeToConfirm || typed.trim().toLowerCase() === typeToConfirm.toLowerCase();

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const problem = await onConfirm();
      if (problem) setError(problem);
      else ref.current?.close();
    } catch {
      setError("That did not work. Nothing was changed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant={triggerVariant} className={triggerClassName} onClick={() => ref.current?.showModal()}>{trigger}</Button>
      <dialog ref={ref} aria-labelledby={titleId}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-pop backdrop:bg-overlay">
        <div className="p-5">
          <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
          <div className="mt-2 text-ink-2">{children}</div>
          {typeToConfirm && (
            <label className="mt-4 block text-sm">
              Type <strong className="text-ink">{typeToConfirm}</strong> to confirm
              <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off"
                className="mt-1 h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-base" />
            </label>
          )}
          {error && <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-line p-4 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => ref.current?.close()} disabled={busy}>Cancel</Button>
          <Button variant={confirmVariant} onClick={confirm} loading={busy} disabled={!ready}>{confirmLabel}</Button>
        </div>
      </dialog>
    </>
  );
}
