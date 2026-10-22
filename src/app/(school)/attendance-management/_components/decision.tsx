"use client";

// Approve / Not approve / Withdraw for an attendance correction or a student
// leave, decided through the shared Approvals rules. "Not approve" and
// "Withdraw" ask for a reason; approval is one click (P4 is for risky actions).

import { TextArea } from "@/components/ui/field";
import { ActionButton, FormDialog, type Action } from "../../staff-hr-management/_components/forms";
import { Words } from "@/lib/i18n/client";

export function DecisionButtons({ hidden, approve, reject, withdraw, canDecide, canWithdraw, what, approveLabel = "Approve" }: {
  hidden: Record<string, string>; approve?: Action; reject?: Action; withdraw?: Action;
  canDecide: boolean; canWithdraw: boolean; what: string; approveLabel?: string;
}) {
  if (!canDecide && !canWithdraw) return null;
  return (
    <div className="flex flex-wrap items-start gap-2">
      {canDecide && approve && <ActionButton action={approve} hidden={hidden} variant="primary" size="md" pendingText="Approving…">{approveLabel}</ActionButton>}
      {canDecide && reject && (
        <FormDialog trigger="Not approve" triggerVariant="danger-outline" title={`Not approve this ${what}`} action={reject} hidden={hidden} submitLabel="Not approve" submitVariant="danger" pendingText="Saving…">
          {(f) => <TextArea label="Reason" name="note" required minLength={5} maxLength={500} error={f.err("note")} defaultValue={f.val("note")} help="The person who asked sees this reason." />}
        </FormDialog>
      )}
      {canWithdraw && withdraw && (
        <FormDialog trigger={`Withdraw`} triggerVariant="secondary" title={`Withdraw this ${what}`} action={withdraw} hidden={hidden} submitLabel="Withdraw" pendingText="Withdrawing…">
          {(f) => (
            <>
              <p className="text-ink-2"><Words k="The request is taken back from Approvals. Nothing in the register changes." /></p>
              <TextArea label="Reason (optional)" name="note" maxLength={500} error={f.err("note")} defaultValue={f.val("note")} />
            </>
          )}
        </FormDialog>
      )}
    </div>
  );
}
