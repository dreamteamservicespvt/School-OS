"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Archive, Pencil, Plus, X } from "lucide-react";
import type { TaskStatus } from "@prisma/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { TextArea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmButton } from "@/components/ui/confirm";
import { cx } from "@/components/ui/cx";
import type { FormState } from "@/lib/forms";
import { TaskDialog, type Person } from "../dashboard-client";
import { archiveTaskAction, commentAction, setTaskStatusAction } from "../actions";

export function AddTaskButton({ access, people, meId, today }: { access: "full" | "own"; people: Person[]; meId: string; today: string }) {
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  return (
    <>
      <Button variant="primary" icon={Plus} onClick={() => { setRound((r) => r + 1); setOpen(true); }}>Add task</Button>
      <TaskDialog key={round} open={open} onClose={() => setOpen(false)} access={access} people={people} meId={meId} today={today} />
    </>
  );
}

const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "TODO", label: "To do" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "DONE", label: "Done" },
  { value: "CANCELLED", label: "Cancelled" },
];

type Detail = {
  id: string; title: string; details: string | null; status: TaskStatus; statusLabel: string; to: string; by: string; due: string; overdue: boolean; remind: boolean; archived: boolean; canEdit: boolean;
  form: { id: string; title: string; assignedToId: string; dueDate: string; dueTime: string; details: string; remind: boolean };
  comments: { id: string; who: string; when: string; text: string }[];
  history: { id: string; what: string; when: string; who: string }[];
};

export function TaskDetail({ task, access, people, meId, today, closeHref }: { task: Detail; access: "full" | "own"; people: Person[]; meId: string; today: string; closeHref: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [round, setRound] = useState(0);
  const [state, comment] = useActionState<FormState, FormData>(commentAction, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) { form.current?.reset(); router.refresh(); } }, [state, router]);
  const setStatus = (s: TaskStatus) => start(async () => { const p = await setTaskStatusAction(task.id, s); setProblem(p ?? null); });
  const statuses = STATUSES.filter((s) => s.value !== "CANCELLED" || task.canEdit);

  return (
    <Card className="mb-5" aria-labelledby="task-title">
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="task-title" className="font-semibold text-[17px] leading-snug">{task.title}</h2>
          <p className={cx("text-[13px] mt-0.5", task.overdue ? "text-bad font-semibold" : "text-ink3")}>
            {[task.overdue ? "Overdue" : null, `Due ${task.due}`, `Assigned to ${task.to}`, `Given by ${task.by}`, task.remind ? "Reminders on" : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Link href={closeHref} aria-label="Close task" className="w-9 h-9 grid place-items-center rounded-lg text-ink3 hover:bg-sunken shrink-0"><X size={18} aria-hidden="true" /></Link>
      </div>
      {task.archived && <div className="px-5 pb-3"><Alert tone="info">This task is archived.</Alert></div>}
      {problem && <div className="px-5 pb-3"><Alert tone="danger">{problem}</Alert></div>}
      {task.details && <p className="px-5 pb-3 text-[14px] text-ink2 whitespace-pre-line">{task.details}</p>}
      {!task.archived && (
        <div className="px-5 pb-4 flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Status" className="inline-flex p-1 rounded-xl bg-sunken gap-1 flex-wrap">
            {statuses.map((s) => (
              <button key={s.value} type="button" disabled={pending} aria-pressed={task.status === s.value} onClick={() => setStatus(s.value)}
                className={cx("h-8 px-3 rounded-lg text-[13px] font-semibold", task.status === s.value ? "bg-surface shadow-card text-ink" : "text-ink2 hover:text-ink")}>{s.label}</button>
            ))}
          </div>
          {task.canEdit && (
            <>
              <Button size="sm" variant="secondary" icon={Pencil} onClick={() => { setRound((r) => r + 1); setEdit(true); }}>Edit</Button>
              <ConfirmButton trigger={<><Archive size={15} aria-hidden="true" />Archive</>} triggerVariant="ghost" title="Archive this task?" confirmLabel="Archive"
                onConfirm={async () => { const p = await archiveTaskAction(task.id); if (p) return p; router.push(closeHref); }}>
                It leaves every list. You can undo for 10 seconds, or find it under Show archived.
              </ConfirmButton>
            </>
          )}
        </div>
      )}
      <div className="border-t border-line/70 px-5 py-4 grid gap-5 lg:grid-cols-2">
        <section aria-labelledby="task-comments">
          <h3 id="task-comments" className="text-[13px] font-semibold text-ink2 mb-2">Comments</h3>
          {task.comments.length === 0 ? <p className="text-[13.5px] text-ink3 mb-3">No comments yet.</p> : (
            <ul className="flex flex-col gap-3 mb-3">
              {task.comments.map((c) => (
                <li key={c.id} className="flex items-start gap-2.5">
                  <Avatar name={c.who} size={28} />
                  <div className="min-w-0"><p className="text-[12.5px] text-ink3"><b className="text-ink font-semibold">{c.who}</b> · {c.when}</p><p className="text-[14px] whitespace-pre-line">{c.text}</p></div>
                </li>
              ))}
            </ul>
          )}
          {!task.archived && (
            <form ref={form} action={comment} className="flex flex-col gap-2">
              <input type="hidden" name="id" value={task.id} />
              <TextArea label="Add a comment" name="text" rows={2} maxLength={1000} error={state?.errors?.text ?? (state && !state.ok && !state.errors ? state.message : undefined)} />
              <div><SubmitButton size="sm" variant="secondary" pendingText="Adding…">Add comment</SubmitButton></div>
            </form>
          )}
        </section>
        <section aria-labelledby="task-history">
          <h3 id="task-history" className="text-[13px] font-semibold text-ink2 mb-2">History</h3>
          <ol className="flex flex-col gap-1.5 text-[13px]">
            {task.history.map((h) => <li key={h.id} className="flex justify-between gap-3"><span className="min-w-0"><span className="capitalize">{h.what}</span> · {h.who}</span><span className="text-ink3 shrink-0 tnum">{h.when}</span></li>)}
          </ol>
          <p className="mt-3"><Pill tone="neutral">{task.statusLabel}</Pill></p>
        </section>
      </div>
      {task.canEdit && <TaskDialog key={round} open={edit} onClose={() => setEdit(false)} access={access} people={people} meId={meId} today={today} task={task.form} />}
    </Card>
  );
}
