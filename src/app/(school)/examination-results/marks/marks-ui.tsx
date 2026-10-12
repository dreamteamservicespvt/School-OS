"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Lock, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { TextArea } from "@/components/ui/field";
import { SelectBar } from "@/components/ui/kit-client";
import { FormDialog, err, v } from "../../academic-management/_components/form-dialog";
import { ActionSheet } from "../_components/sheets";
import { lockExamAction, lockPaperAction, remindTeachersAction, reopenPaperAction } from "./actions";

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
  return (
    <ActionSheet trigger={{ label: "Lock", variant: "primary", icon: <Lock size={16} aria-hidden="true" /> }} title={`Lock ${label}?`} confirmLabel="Lock marks" pendingText="Locking…"
      run={() => lockPaperAction(entryId, sectionId)}>
      <p className="text-ink2">After locking, a change needs a reason and an approval, and the old mark is kept in the history.</p>
    </ActionSheet>
  );
}

export function ReopenButton({ entryId, sectionId, label }: { entryId: string; sectionId: string; label: string }) {
  return (
    <FormDialog trigger="Send back to teacher" title={`Send ${label} back`} action={reopenPaperAction} submitLabel="Send back" hidden={{ entryId, sectionId }}>
      {(state) => (
        <>
          <p className="text-ink-2"><Undo2 size={15} className="inline mr-1.5 -mt-0.5" aria-hidden="true" />The teacher can change the marks again and submit once more. They are told why.</p>
          <TextArea label="Reason" name="reason" required rows={3} defaultValue={v(state, "reason")} error={err(state, "reason")} help="For example: Roll 12's internal marks are missing." />
        </>
      )}
    </FormDialog>
  );
}

/** "Remind teachers" for every paper behind (not started, or past its due date). */
export function RemindButton({ keys, teachers, papers }: { keys: string[]; teachers: number; papers: number }) {
  return (
    <ActionSheet trigger={{ label: "Remind teachers", variant: "primary", icon: <BellRing size={16} aria-hidden="true" /> }}
      title="Remind teachers about marks?" confirmLabel={`Remind ${teachers} ${teachers === 1 ? "teacher" : "teachers"}`} pendingText="Sending…"
      run={() => remindTeachersAction(keys)}>
      <p className="text-[14px] text-ink2">{papers} {papers === 1 ? "paper is" : "papers are"} not started or past the due date. Each teacher gets one message in the app listing their own papers and the due date.</p>
    </ActionSheet>
  );
}

/** The bar shown when papers are ticked in the list. */
export function RemindBar({ form }: { form: string }) {
  const [keys, setKeys] = useState<string[] | null>(null);
  return (
    <>
      <SelectBar form={form}>
        {(ids) => <Button size="sm" variant="secondary" icon={BellRing} onClick={() => setKeys(ids)}>Remind their teachers</Button>}
      </SelectBar>
      <ActionSheet open={Boolean(keys)} onClose={() => setKeys(null)} title="Remind teachers about marks?" confirmLabel="Send reminder" pendingText="Sending…"
        run={() => remindTeachersAction(keys ?? [])}>
        <p className="text-[14px] text-ink2">{keys?.length ?? 0} {keys?.length === 1 ? "paper" : "papers"} chosen. Teachers of papers not yet submitted get one message each, listing their own papers. Submitted papers are skipped.</p>
      </ActionSheet>
    </>
  );
}
