"use client";

// Approve, reject, ask for a change or withdraw. On phones the buttons sit in
// a bar at the bottom of the screen, within reach of the thumb.
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { TextArea } from "@/components/ui/field";
import type { Decision } from "@/lib/approvals";
import { decideAction } from "../actions";

export function DecisionBar({ id, summary, canDecide, canWithdraw }: { id: string; summary: string; canDecide: boolean; canWithdraw: boolean }) {
  const [asking, setAsking] = useState<null | "reject" | "ask-change">(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (d: Decision, n: string | null) => start(async () => {
    setError(null);
    try {
      const problem = await decideAction(id, d, n);
      if (problem) setError(problem); else setAsking(null);
    } catch {
      setError("That did not work, and nothing was changed. Please try again.");
    }
  });

  if (!canDecide && !canWithdraw) return null;
  return (
    <>
      <div className="fixed inset-x-0 bottom-14 z-20 border-t border-line bg-surface p-3 shadow-pop sm:static sm:z-auto sm:rounded-2xl sm:border sm:p-4 sm:shadow-none">
        {error && !asking && <p role="alert" className="mb-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex flex-wrap gap-2">
          {canDecide && (
            <>
              <Button className="flex-1 sm:flex-none" loading={pending && !asking} loadingText="Approving…" onClick={() => run("approve", null)}>Approve</Button>
              <Button variant="secondary" className="flex-1 sm:flex-none" onClick={() => { setNote(""); setNoteError(null); setError(null); setAsking("ask-change"); }}>Ask for a change</Button>
              <Button variant="danger-outline" className="flex-1 sm:flex-none" onClick={() => { setNote(""); setNoteError(null); setError(null); setAsking("reject"); }}>Reject</Button>
            </>
          )}
          {canWithdraw && (
            <ConfirmButton trigger="Withdraw my request" triggerVariant="secondary" title="Withdraw this request?" confirmLabel="Withdraw" onConfirm={() => decideAction(id, "withdraw", null)}>
              {summary} will no longer wait for a decision. You can ask again later.
            </ConfirmButton>
          )}
        </div>
      </div>
      <Dialog open={asking !== null} onClose={() => setAsking(null)} title={asking === "reject" ? "Reject this request" : "Ask for a change"}>
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          if (note.trim().length < 5) { setNoteError("Give a reason of at least 5 characters, so the person knows why."); return; }
          run(asking!, note.trim());
        }}>
          <p className="text-sm text-ink-2">{summary}</p>
          <TextArea label={asking === "reject" ? "Why is it not approved?" : "What should be changed?"} name="note" required rows={3} maxLength={1000} value={note}
            onChange={(e) => { setNote(e.target.value); if (noteError) setNoteError(null); }} error={noteError ?? undefined}
            help="The person who asked sees this." />
          {error && <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setAsking(null)}>Cancel</Button>
            <Button type="submit" variant={asking === "reject" ? "danger" : "primary"} loading={pending} loadingText="Sending…">{asking === "reject" ? "Reject" : "Send back for a change"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
