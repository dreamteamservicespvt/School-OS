"use client";

// A button that opens a sheet (dialog on a computer, bottom sheet on a phone)
// to confirm an action or fill a short form (P3, P4). The sheet says exactly
// what will happen; the main button repeats the action. Fields inside are
// sent to the server action as a form. A problem shows in the sheet and
// nothing is changed (P7).

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonClass, Button, type ButtonSize, type ButtonVariant } from "@/components/ui/button";
import { SheetHead, sheetCls } from "@/components/ui/dialog";
import { inputCls } from "@/components/ui/field";
import { cx } from "@/components/ui/cx";
import { ProblemInView } from "@/components/ui/problem-in-view";
import { Words } from "@/lib/i18n/client";

export type Trigger = { label: React.ReactNode; variant?: ButtonVariant; size?: ButtonSize; icon?: React.ReactNode; className?: string; ariaLabel?: string; disabled?: boolean };

type Props = {
  trigger?: Trigger;
  /** Opens without a trigger when true (controlled). */
  open?: boolean;
  onClose?: () => void;
  title: string;
  sub?: React.ReactNode;
  children?: React.ReactNode;
  confirmLabel: string;
  confirmVariant?: ButtonVariant;
  confirmIcon?: React.ReactNode;
  pendingText?: string;
  /** For the most sensitive changes: the word the person must type. */
  typeToConfirm?: string;
  wide?: boolean;
  /** The server action. Returns a message when it failed. */
  run: (fd: FormData) => Promise<string | undefined | void | null>;
  /** Where to go when it worked; by default the page reloads its data. */
  doneHref?: string;
  /** Hides the footer buttons (a form inside brings its own). */
  bare?: boolean;
};

export function TriggerButton({ t, onClick }: { t: Trigger; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={t.disabled} aria-label={t.ariaLabel} title={t.ariaLabel}
      className={buttonClass(t.variant ?? "secondary", t.size ?? "md", t.className)}>
      {t.icon && <span aria-hidden="true" className="contents">{t.icon}</span>}
      {t.label}
    </button>
  );
}

export function ActionSheet({ trigger, open: forced, onClose, title, sub, children, confirmLabel, confirmVariant = "primary", confirmIcon, pendingText, typeToConfirm, wide, run, doneHref, bare }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const formId = useId();
  const titleId = useId();
  const router = useRouter();
  const [self, setSelf] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const open = forced ?? self;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const close = () => {
    if (pending) return;
    setTyped("");
    setError(null);
    if (forced === undefined) setSelf(false);
    onClose?.();
  };
  const ready = !typeToConfirm || typed.trim().toLowerCase() === typeToConfirm.toLowerCase();

  const submit = (fd: FormData) => {
    setError(null);
    start(async () => {
      try {
        const problem = await run(fd);
        if (problem) { setError(problem); return; }
        if (forced === undefined) setSelf(false);
        onClose?.();
        setTyped("");
        if (doneHref) router.push(doneHref); else router.refresh();
      } catch {
        setError("That did not work and nothing was changed. Please try again.");
      }
    });
  };

  return (
    <>
      {trigger && <TriggerButton t={trigger} onClick={() => setSelf(true)} />}
      <dialog ref={ref} aria-labelledby={titleId} className={sheetCls(wide)} onClose={close}
        onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
        <div className="flex max-h-[inherit] flex-col">
          <SheetHead titleId={titleId} title={title} sub={sub} onClose={close} />
          <form id={formId} action={submit} noValidate className="overflow-y-auto scroll-thin px-5 pb-5 flex flex-col gap-4 text-[14.5px] text-ink2">
            {open && children}
            {typeToConfirm && (
              <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-ink2">
                <span><Words k="Type" /> <b className="text-ink">{typeToConfirm}</b> <Words k="to confirm" /></span>
                <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className={cx(inputCls(), "h-11")} />
              </label>
            )}
            {error && <ProblemInView token={error}><p role="alert" className="rounded-xl bg-bad/10 px-3.5 py-2.5 text-sm text-bad">{error}</p></ProblemInView>}
          </form>
          {!bare && (
            <div className="border-t border-line px-5 py-3.5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={close} disabled={pending}><Words k="Cancel" /></Button>
              <button type="submit" form={formId} disabled={!ready || pending} aria-busy={pending || undefined}
                className={buttonClass(confirmVariant, "md")}>
                {pending ? <Spinning /> : confirmIcon && <span aria-hidden="true" className="contents">{confirmIcon}</span>}
                {pending ? pendingText ?? "Working…" : confirmLabel}
              </button>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}

function Spinning() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" className="animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** A labelled switch that sends "on" with the form. */
export function SwitchField({ name, label, help, defaultOn = false }: { name: string; label: string; help?: React.ReactNode; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  const id = useId();
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line px-4 py-3">
      <label htmlFor={id} className="min-w-0 flex-1 text-[14px]">
        <b className="font-semibold block text-ink">{label}</b>
        {help && <span className="block text-[12.5px] text-ink3 mt-0.5">{help}</span>}
      </label>
      <button type="button" role="switch" id={id} aria-checked={on} onClick={() => setOn(!on)}
        className={cx("relative w-11 h-6 rounded-full transition shrink-0", on ? "bg-brand" : "bg-line")}>
        <span className={cx("absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform", on && "translate-x-5")} />
      </button>
      {on && <input type="hidden" name={name} value="on" />}
    </div>
  );
}
