"use client";

// A button that opens a short form in a dialog (P3). The form keeps what
// was typed when a check fails (P7) and closes itself when the save works.

import { useActionState, useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button, type ButtonVariant, type ButtonSize } from "@/components/ui/button";
import { ErrorSummary } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import type { FormState } from "@/lib/forms";
import { Words } from "@/lib/i18n/client";

export type ServerFormAction = (prev: FormState, formData: FormData) => Promise<FormState>;

type Props = {
  trigger?: React.ReactNode;
  triggerVariant?: ButtonVariant;
  triggerSize?: ButtonSize;
  triggerClassName?: string;
  triggerLabel?: string;
  title: string;
  action: ServerFormAction;
  submitLabel: string;
  pendingText?: string;
  wide?: boolean;
  /** Hidden values sent with the form. */
  hidden?: Record<string, string>;
  children: (state: FormState) => React.ReactNode;
  /** Opens without a trigger (controlled). */
  open?: boolean;
  onClose?: () => void;
  onDone?: (state: FormState) => void;
  danger?: boolean;
};

export function FormDialog(props: Props) {
  const controlled = props.open !== undefined;
  const [openSelf, setOpenSelf] = useState(false);
  const open = controlled ? props.open! : openSelf;
  const close = () => (controlled ? props.onClose?.() : setOpenSelf(false));
  return (
    <>
      {!controlled && (
        <Button variant={props.triggerVariant ?? "secondary"} size={props.triggerSize ?? "md"} className={props.triggerClassName} aria-label={props.triggerLabel} onClick={() => setOpenSelf(true)}>
          {props.trigger}
        </Button>
      )}
      <Dialog open={open} onClose={close} title={props.title} wide={props.wide}>
        <DialogForm {...props} onClose={close} />
      </Dialog>
    </>
  );
}

function DialogForm({ action, submitLabel, pendingText, hidden, children, onClose, onDone, danger }: Props) {
  const [state, formAction] = useActionState(action, null);
  useEffect(() => {
    if (state?.ok) {
      onDone?.(state);
      onClose?.();
    }
    // Only when a new result arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form action={formAction} className="space-y-4" noValidate>
      {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {state && !state.ok && (Object.keys(state.errors ?? {}).length > 1 ? <ErrorSummary errors={state.errors} /> : <FormMessage state={state} />)}
      {children(state)}
      <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose}><Words k="Cancel" /></Button>
        <SubmitButton pendingText={pendingText ?? "Saving…"} variant={danger ? "danger" : "primary"}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}

/** Value to show in a field: what was typed before a failed save, else the default. */
export function v(state: FormState, name: string, fallback: string | number | null | undefined = "") {
  return state?.values?.[name] ?? (fallback === null || fallback === undefined ? "" : String(fallback));
}

export function err(state: FormState, name: string) {
  return state?.errors?.[name];
}
