"use client";

// Discussions' sheets and buttons (mod-homework.jsx DiscussionsPage and HideSheet).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Lock, LockOpen, Pin, PinOff, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented, Switch } from "@/components/ui/controls";
import { FieldShell, inputCls } from "@/components/ui/field";
import { SheetForm, useTyped } from "@/components/ui/url-sheet";
import { MoreMenu } from "@/components/ui/more-menu";
import { cx } from "@/components/ui/cx";
import { Text } from "../sheets";
import { createBoardAction, editBoardAction, hidePostAction, moderateAction, postTopicAction, replyAction } from "./actions";

export function TopicSheet({ closeHref, boardId, boardTitle, student }: { closeHref: string; boardId: string; boardTitle: string; student: boolean }) {
  return (
    <SheetForm title={student ? "Ask a question" : "New topic"} sub={boardTitle} closeHref={closeHref} action={postTopicAction} hidden={{ boardId, boardTitle }}
      submitLabel={<><Send size={16} aria-hidden="true" />Post</>} pendingText="Posting…">
      <Text name="title" label="Title" required help="One short line, like “Q3 of exercise 4.2”" />
      <Text name="body" label="Details" area rows={4} />
    </SheetForm>
  );
}

/** New board, or Edit board (owner only). */
export function BoardSheet({ closeHref, courses, start }: {
  closeHref: string; courses: { value: string; label: string }[];
  start?: { id: string; title: string; description: string; audience: string; active: boolean; course: string };
}) {
  const [audience, setAudience] = useState(useTyped("audience", start?.audience ?? "all").value || "all");
  const [active, setActive] = useState(start?.active ?? true);
  const course = useTyped("course", start?.course ?? courses[0]?.value ?? "");
  return (
    <SheetForm title={start ? `Edit: ${start.title}` : "New board"} closeHref={closeHref} action={(start ? editBoardAction : createBoardAction) as (p: unknown, fd: FormData) => Promise<{ ok: boolean; message?: string }>}
      hidden={{ audience, ...(start ? { id: start.id, course: start.course } : {}) }} submitLabel={start ? "Save changes" : "Create board"} pendingText="Saving…">
      <Text name="title" label="Title" required start={start?.title} placeholder="Science · 7 A" />
      {!start && (
        <FieldShell label="Class and subject" id="nb-cls" error={course.error} help={audience === "staff" ? "Optional for a staff board" : "Students of this class can use it"}>
          <select id="nb-cls" name="course" defaultValue={course.value} key={course.key} className={cx(inputCls(course.error), "h-11")}>
            <option value="">No class (school-wide)</option>
            {courses.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </FieldShell>
      )}
      <Text name="description" label="Description" area rows={2} start={start?.description} placeholder="Questions and answers about Science lessons." />
      <FieldShell label="Who can use it" id="nb-who" required>
        <Segmented value={audience} onChange={setAudience} className="w-full" label="Who can use it" options={[{ value: "all", label: "Staff and students" }, { value: "staff", label: "Staff only" }]} />
      </FieldShell>
      <div className="rounded-xl border border-line px-3.5 py-3 flex items-center gap-3">
        <Switch id="nb-active" on={active} onChange={setActive} label="Active" name="active" />
        <label htmlFor="nb-active" className="text-[13.5px]"><b className="font-semibold block">Active</b><span className="text-ink3 text-[12.5px]">{active ? "People can post" : "Posts can be read but not added"}</span></label>
      </div>
    </SheetForm>
  );
}

export function HideSheet({ closeHref, id, title, by, reasons }: { closeHref: string; id: string; title: string; by: string; reasons: readonly string[] }) {
  const r = useTyped("reason", reasons[0]);
  return (
    <SheetForm title="Hide this post?" closeHref={closeHref} action={hidePostAction} hidden={{ id }} submitLabel="Hide post" pendingText="Hiding…" submitVariant="danger">
      <p className="text-[14px] text-ink2">“{title}” by {by}. The class sees “Hidden by the teacher” with your reason. Nothing is deleted.</p>
      <FieldShell label="Reason" id="hd-why" required error={r.error}>
        <select id="hd-why" name="reason" defaultValue={r.value} key={r.key} className={cx(inputCls(r.error), "h-11")}>
          {reasons.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </FieldShell>
    </SheetForm>
  );
}

/** The moderator's "..." on a topic: pin, lock, hide with a reason, or unhide. */
export function ModMenu({ id, pinned, locked, hidden, hideHref, reply }: { id: string; pinned: boolean; locked: boolean; hidden: boolean; hideHref: string; reply?: boolean }) {
  const router = useRouter();
  const [problem, setProblem] = useState<string | null>(null);
  const run = (what: string) => async () => {
    const fd = new FormData();
    fd.set("id", id); fd.set("what", what);
    const r = await moderateAction(fd);
    if (r) setProblem(r); else { setProblem(null); router.refresh(); }
  };
  const items = hidden ? [{ icon: <Eye size={16} aria-hidden="true" />, label: "Unhide", onClick: run("unhide") }] : [
    ...(reply ? [] : [
      { icon: pinned ? <PinOff size={16} aria-hidden="true" /> : <Pin size={16} aria-hidden="true" />, label: pinned ? "Unpin" : "Pin to top", onClick: run(pinned ? "unpin" : "pin") },
      { icon: locked ? <LockOpen size={16} aria-hidden="true" /> : <Lock size={16} aria-hidden="true" />, label: locked ? "Unlock replies" : "Lock replies", onClick: run(locked ? "unlock" : "lock") },
    ]),
    { icon: <EyeOff size={16} aria-hidden="true" />, label: "Hide with a reason", href: hideHref, tone: "bad" as const },
  ];
  return (
    <span className="inline-flex flex-col items-end shrink-0">
      <MoreMenu size="sm" label={reply ? "Moderate this reply" : "Moderate this topic"} items={items} />
      {problem && <span role="alert" className="text-[12px] text-bad max-w-48">{problem}</span>}
    </span>
  );
}

export function ReplyBox({ topicId, student }: { topicId: string; student: boolean }) {
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();
  const send = () => start(async () => {
    const r = await replyAction(topicId, text);
    if (r.problem) setProblem(r.problem); else { setText(""); setProblem(null); router.refresh(); }
  });
  return (
    <div className="mt-4">
      <div className="flex gap-2">
        <label htmlFor="reply-box" className="sr-only">Write a reply</label>
        <input id="reply-box" value={text} onChange={(e) => setText(e.target.value)} placeholder={student ? "Write a reply to your class" : "Write a reply"} className={cx(inputCls(problem), "h-11")}
          onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { e.preventDefault(); send(); } }} aria-invalid={problem ? true : undefined} />
        <Button variant="primary" icon={Send} disabled={!text.trim()} loading={busy} onClick={send}>Post</Button>
      </div>
      {problem && <p className="text-[12.5px] text-bad mt-1" role="alert">{problem}</p>}
    </div>
  );
}
