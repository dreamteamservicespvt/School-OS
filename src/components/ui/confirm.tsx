"use client";

// Confirmation before risky actions only (00-global.md P4). It says exactly
// what will happen, and the button repeats the action. For the most
// sensitive changes the person types a word to confirm.

import { useEffect, useId, useRef, useState } from "react";
import { Button, type ButtonVariant } from "./button";
import { SheetHead, sheetCls } from "./dialog";
import { inputCls } from "./field";

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
      <dialog ref={ref} aria-labelledby={titleId} className={sheetCls()}
        onClick={(e) => { if (e.target === e.currentTarget && !busy) ref.current?.close(); }}>
        <SheetHead titleId={titleId} title={title} onClose={() => ref.current?.close()} />
        <div className="px-5 pb-5">
          <div className="text-[14.5px] text-ink2">{children}</div>
          {typeToConfirm && (
            <label className="mt-4 flex flex-col gap-1.5 text-[13px] font-semibold text-ink2">
              <span>Type <strong className="text-ink">{typeToConfirm}</strong> to confirm</span>
              <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className={`${inputCls()} h-11`} />
            </label>
          )}
          {error && <p role="alert" className="mt-3 rounded-xl bg-bad/10 px-3.5 py-2.5 text-sm text-bad">{error}</p>}
        </div>
        <div className="border-t border-line px-5 py-3.5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => ref.current?.close()} disabled={busy}>Cancel</Button>
          <Button variant={confirmVariant} onClick={confirm} loading={busy} disabled={!ready}>{confirmLabel}</Button>
        </div>
      </dialog>
    </>
  );
}
