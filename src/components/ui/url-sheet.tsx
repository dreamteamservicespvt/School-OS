"use client";

// A sheet (dialog on a computer, bottom sheet on a phone) opened by the page's
// address, such as ?pay=<id>. The page decides on the server whether to show it,
// so it can be linked to, refreshed and shared; closing goes back to closeHref.

import { createContext, useActionState, useCallback, useContext, useEffect, useId, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, SheetHead, sheetCls } from "./dialog";
import { Button } from "./button";
import { SubmitButton } from "./submit-button";
import { ErrorSummary } from "./field";
import { Alert } from "./alert";
import type { FormState } from "@/lib/forms";

const CloseCtx = createContext<() => void>(() => {});
/** Closes the sheet this is inside (goes back to the page without the sheet). */
export const useCloseSheet = () => useContext(CloseCtx);

export function UrlSheet({ title, sub, wide, footer, closeHref, children }: { title: string; sub?: React.ReactNode; wide?: boolean; footer?: React.ReactNode; closeHref: string; children: React.ReactNode }) {
  const router = useRouter();
  const [, start] = useTransition();
  const close = useCallback(() => start(() => router.replace(closeHref, { scroll: false })), [router, closeHref]);
  return (
    <CloseCtx.Provider value={close}>
      <Dialog open onClose={close} title={title} sub={sub} wide={wide} footer={footer}>{children}</Dialog>
    </CloseCtx.Provider>
  );
}

/** A button that closes the sheet it is inside. */
export function CloseSheetButton({ children = "Cancel", variant = "ghost" }: { children?: React.ReactNode; variant?: "ghost" | "secondary" }) {
  const close = useCloseSheet();
  return <Button variant={variant} onClick={close}>{children}</Button>;
}

type Action<T> = (prev: FormState<T>, fd: FormData) => Promise<FormState<T>>;
const ResultCtx = createContext<FormState<unknown>>(null);
/** The last result of the form this is inside: each field reads its error and what was typed. */
export const useSheetResult = () => useContext(ResultCtx);

/**
 * A form in a sheet. On success the sheet closes (the toast says what happened),
 * or goes to `doneHref`. On a problem it stays open, keeps what was typed and
 * shows each problem next to its field.
 */
export function SheetForm<T>({ title, sub, wide, closeHref, doneHref, action, submitLabel, pendingText, submitVariant = "primary", children, hidden, extraButtons, submitDisabled }: {
  title: string;
  sub?: React.ReactNode;
  wide?: boolean;
  closeHref: string;
  doneHref?: string;
  action: Action<T>;
  submitLabel: React.ReactNode;
  pendingText?: string;
  submitVariant?: "primary" | "danger";
  children: React.ReactNode;
  hidden?: Record<string, string>;
  extraButtons?: React.ReactNode;
  submitDisabled?: boolean;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<FormState<T>, FormData>(action, null);
  const ref = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const titleId = useId();
  const close = useCallback(() => router.replace(closeHref, { scroll: false }), [router, closeHref]);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  useEffect(() => {
    if (state?.ok) router.replace(doneHref ?? closeHref, { scroll: false });
    else if (state) formRef.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
  }, [state, doneHref, closeHref, router]);
  const fieldErrors = Object.keys(state?.errors ?? {}).length;
  return (
    <CloseCtx.Provider value={close}>
      <ResultCtx.Provider value={state as FormState<unknown>}>
        <dialog ref={ref} aria-labelledby={titleId} onClose={close} className={sheetCls(wide)}
          onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
          <form ref={formRef} action={formAction} noValidate className="flex max-h-[inherit] flex-col">
            <SheetHead titleId={titleId} title={title} sub={sub} onClose={close} />
            <div className="overflow-y-auto scroll-thin px-5 pb-5 flex flex-col gap-4">
              {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
              <ErrorSummary errors={state?.errors} />
              {children}
              {state && !state.ok && state.message && fieldErrors === 0 && <Alert tone="danger">{state.message}</Alert>}
            </div>
            <div className="border-t border-line px-5 py-3.5 flex flex-wrap gap-2 justify-end">
              {extraButtons}
              <Button variant="ghost" onClick={close}>Cancel</Button>
              <SheetSubmit variant={submitVariant} pendingText={pendingText} disabled={submitDisabled}>{submitLabel}</SheetSubmit>
            </div>
          </form>
        </dialog>
      </ResultCtx.Provider>
    </CloseCtx.Provider>
  );
}

function SheetSubmit({ children, variant, pendingText, disabled }: { children: React.ReactNode; variant: "primary" | "danger"; pendingText?: string; disabled?: boolean }) {
  if (disabled) return <Button variant={variant} disabled>{children}</Button>;
  return <SubmitButton variant={variant} pendingText={pendingText}>{children}</SubmitButton>;
}

/** The value a field shows: what was typed last time (when a check failed), else the start value. */
export function useTyped(name: string, start?: string | number | null) {
  const state = useSheetResult();
  const typed = state && !state.ok ? state.values?.[name] : undefined;
  return { value: typed ?? (start == null ? "" : String(start)), error: state?.errors?.[name], key: state ? `${name}:${JSON.stringify(state.values?.[name] ?? "")}:${String(state.ok)}` : `${name}:first` };
}
