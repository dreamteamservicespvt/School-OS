"use client";

import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/ui/confirm";
import { TextArea } from "@/components/ui/field";
import { FormDialog, err, v } from "../../academic-management/_components/form-dialog";
import { lockExamAction, lockPaperAction, reopenPaperAction } from "./actions";

export function LockExamButton({ examId, title }: { examId: string; title: string }) {
  const router = useRouter();
  return (
    <ConfirmButton trigger="Lock submitted marks" title={`Lock submitted marks of ${title}?`} confirmLabel="Lock marks"
      onConfirm={async () => { const e = await lockExamAction(examId); if (!e) router.refresh(); return e; }}>
      <p>Every submitted paper of {title} is locked. After this a change needs a reason and an approval, and the old mark is kept. Papers not yet submitted stay open.</p>
    </ConfirmButton>
  );
}

export function LockPaperButton({ entryId, sectionId, label }: { entryId: string; sectionId: string; label: string }) {
  const router = useRouter();
  return (
    <ConfirmButton trigger="Lock" title={`Lock ${label}?`} confirmLabel="Lock marks"
      onConfirm={async () => { const e = await lockPaperAction(entryId, sectionId); if (!e) router.refresh(); return e; }}>
      <p>After locking, a change needs a reason and an approval, and the old mark is kept in the history.</p>
    </ConfirmButton>
  );
}

export function ReopenButton({ entryId, sectionId, label }: { entryId: string; sectionId: string; label: string }) {
  return (
    <FormDialog trigger="Send back to teacher" title={`Send ${label} back`} action={reopenPaperAction} submitLabel="Send back" hidden={{ entryId, sectionId }}>
      {(state) => (
        <>
          <p className="text-ink-2">The teacher can change the marks again and submit once more. They are told why.</p>
          <TextArea label="Reason" name="reason" required rows={3} defaultValue={v(state, "reason")} error={err(state, "reason")} help="For example: Roll 12's internal marks are missing." />
        </>
      )}
    </FormDialog>
  );
}
