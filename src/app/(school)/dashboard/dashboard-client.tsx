"use client";

// The Dashboard's moving parts: refresh with an adjustable interval, "Mark
// as seen" on Needs Attention, My Tasks with Add task and Undo, and Approve
// on requests waiting for the person. Every change is checked on the server.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, useSyncExternalStore, useTransition } from "react";
import * as I from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Pill } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/controls";
import { Dialog } from "@/components/ui/dialog";
import { TextField, SelectField, TextArea, CheckboxField } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { cx } from "@/components/ui/cx";
import type { FormState } from "@/lib/forms";
import type { AttentionItem } from "@/lib/dashboard/types";
import type { ApprovalCardRow, TaskCardRow } from "@/lib/dashboard/compose";
import { decideAction } from "../approvals/actions";
import { markSeenAction, saveTaskAction, setTaskStatusAction, showSeenAction } from "./actions";
import { useT } from "@/lib/i18n/client";
import { screenMessage } from "@/lib/i18n/messages";

const icon = (name: string): LucideIcon => ((I as unknown as Record<string, LucideIcon>)[name] ?? I.Circle);

/* ---------- Refresh: "Updated 10:42 AM", auto every 5 minutes by default ---------- */
const INTERVALS = [{ value: "1", label: "Every minute" }, { value: "5", label: "Every 5 minutes" }, { value: "15", label: "Every 15 minutes" }, { value: "off", label: "Off" }];
const REFRESH_KEY = "sos-dashboard-refresh";
// The chosen interval is kept in this browser; when storage is blocked it lasts until the page closes.
let memoryRefresh = "5";
const refreshListeners = new Set<() => void>();
function subscribeRefresh(l: () => void) {
  refreshListeners.add(l);
  window.addEventListener("storage", l);
  return () => { refreshListeners.delete(l); window.removeEventListener("storage", l); };
}
function readRefresh() {
  try {
    const v = localStorage.getItem(REFRESH_KEY);
    if (v && INTERVALS.some((i) => i.value === v)) return v;
  } catch { /* private window */ }
  return memoryRefresh;
}

export function RefreshControl({ updated }: { updated: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const every = useSyncExternalStore(subscribeRefresh, readRefresh, () => "5");
  useEffect(() => {
    if (every === "off") return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") start(() => router.refresh()); }, Number(every) * 60_000);
    return () => clearInterval(timer);
  }, [every, router]);
  const choose = (v: string) => {
    try { localStorage.setItem(REFRESH_KEY, v); } catch { /* not kept */ }
    memoryRefresh = v;
    refreshListeners.forEach((l) => l());
  };
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => start(() => router.refresh())}
        className="inline-flex items-center gap-1.5 text-[13px] text-ink3 hover:text-ink h-9 px-2 rounded-lg" aria-label={t("Refresh. Last refreshed {time}", { time: updated })}>
        <I.RefreshCw size={14} className={pending ? "animate-spin" : ""} aria-hidden="true" />{t("Updated {time}", { time: updated })}
      </button>
      <label className="sr-only" htmlFor="dash-refresh">{t("Refresh by itself")}</label>
      <select id="dash-refresh" value={every} onChange={(e) => choose(e.target.value)} title={t("Refresh by itself")}
        className="h-9 rounded-lg bg-transparent text-[13px] text-ink3 hover:text-ink pl-1 pr-1 border-0 focus-visible:outline-2 focus-visible:outline-brand cursor-pointer">
        {INTERVALS.map((i) => <option key={i.value} value={i.value}>{i.value === "off" ? t("Auto-refresh off") : t.any(i.label)}</option>)}
      </select>
    </div>
  );
}

/* ---------- Needs your attention ---------- */
const TONE_BG = { bad: "bg-bad/10 text-bad", warn: "bg-warn/12 text-warn", info: "bg-info/10 text-info" } as const;

export function AttentionCard({ items, hiddenSeen }: { items: AttentionItem[]; hiddenSeen: number }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const list = items.filter((n) => !gone.has(n.id));
  const seen = (n: AttentionItem) => {
    setGone((s) => new Set(s).add(n.id));
    start(async () => { const problem = await markSeenAction(n.id, n.value); if (problem) setGone((s) => { const x = new Set(s); x.delete(n.id); return x; }); });
  };
  return (
    <Card>
      <CardHeader title={t("Needs your attention")} description={t("Most urgent first. Each one opens the exact list behind it.")} icon={I.Flag}
        action={list.length ? <Pill tone={list.some((n) => n.tone === "bad") ? "bad" : "warn"}>{list.length === 1 ? t("1 item") : t("{n} items", { n: list.length })}</Pill> : null} />
      {list.length === 0 ? (
        <div className="px-5 pb-6 pt-1 text-center">
          <span className="mx-auto w-12 h-12 rounded-2xl bg-ok/10 text-ok grid place-items-center animate-pop"><I.Check size={24} strokeWidth={2.6} aria-hidden="true" /></span>
          <p className="font-semibold mt-2.5">{t("Nothing needs you right now")}</p>
          <p className="text-[13px] text-ink3">{t("New items show up here by themselves.")}</p>
        </div>
      ) : (
        <ul className="px-2 pb-2">
          {list.map((n) => {
            const Ic = icon(n.icon);
            return (
              <li key={n.id}>
                <div className="flex items-center gap-3.5 px-3 py-3 rounded-xl hover:bg-sunken/70 transition group">
                  <span className={cx("w-10 h-10 rounded-xl grid place-items-center shrink-0", TONE_BG[n.tone])}><Ic size={19} aria-hidden="true" /></span>
                  <Link href={n.href} className="min-w-0 flex-1">
                    <p className="font-semibold text-[14.5px] leading-snug">{t.any(n.title)}</p>
                    <p className="text-[13px] text-ink3 truncate">{t.any(n.detail)}</p>
                  </Link>
                  <button type="button" onClick={() => seen(n)} disabled={pending}
                    className="hidden md:grid w-8 h-8 place-items-center rounded-lg text-ink3 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-line/60 transition" aria-label={t("Mark as seen: {title}", { title: t.any(n.title) })} title={t("Mark as seen")}>
                    <I.EyeOff size={16} aria-hidden="true" />
                  </button>
                  <ButtonLink href={n.href} size="sm" variant="secondary" className="hidden sm:inline-flex shrink-0">{t.any(n.action)}</ButtonLink>
                  <Link href={n.href} className="sm:hidden w-9 h-9 grid place-items-center rounded-lg text-ink3 shrink-0" aria-label={t.any(n.action)}><I.ChevronRight size={20} aria-hidden="true" /></Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {hiddenSeen > 0 && (
        <div className="px-5 pb-4 -mt-1">
          <button type="button" onClick={() => start(() => showSeenAction())} className="text-[13px] font-semibold text-brand hover:underline">
            {t("Show {n} marked as seen", { n: hiddenSeen })}
          </button>
        </div>
      )}
    </Card>
  );
}

/* ---------- My tasks ---------- */
export type Person = { id: string; name: string };

export function TasksCard({ mine, given, left, access, people, meId, today }: { mine: TaskCardRow[]; given: TaskCardRow[]; left: number; access: "full" | "own"; people: Person[]; meId: string; today: string }) {
  const t = useT();
  const [tab, setTab] = useState<"mine" | "given">("mine");
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const [pending, start] = useTransition();
  const [flip, setFlip] = useState<Record<string, boolean>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const rows = tab === "mine" ? mine : given;
  const toggle = (task: TaskCardRow) => {
    const done = !(flip[task.id] ?? task.done);
    setFlip((f) => ({ ...f, [task.id]: done }));
    start(async () => {
      const p = await setTaskStatusAction(task.id, done ? "DONE" : "TODO");
      if (p) { setProblem(screenMessage(t, p)); setFlip((f) => { const x = { ...f }; delete x[task.id]; return x; }); }
    });
  };
  const tabs: [typeof tab, string, number][] = [["mine", t("My tasks"), mine.length], ...(access === "full" ? [["given", t("Given by me"), given.length] as [typeof tab, string, number]] : [])];
  return (
    <Card>
      <CardHeader title={t("My tasks")} description={left ? t("{n} to do · overdue ones on top", { n: left }) : t("All done for today")} icon={I.ListTodo}
        action={<Button size="sm" variant="soft" icon={I.Plus} onClick={() => { setRound((r) => r + 1); setOpen(true); }}>{t("Add task")}</Button>} />
      {tabs.length > 1 && (
        <div className="px-5 pb-2 flex items-center justify-between gap-2">
          <div role="tablist" aria-label={t("Tasks")} className="inline-flex p-1 rounded-xl bg-sunken gap-1">
            {tabs.map(([v, l, c]) => (
              <button key={v} type="button" role="tab" aria-selected={tab === v} onClick={() => setTab(v)}
                className={cx("h-8 px-3 rounded-lg text-[13px] font-semibold inline-flex items-center gap-1.5", tab === v ? "bg-surface shadow-card text-ink" : "text-ink2")}>
                {l}<span className="text-ink3 text-[11.5px] tnum">{c}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {problem && <div className="px-5 pb-2"><Alert tone="danger">{problem}</Alert></div>}
      {rows.length === 0 ? (
        <p className="px-5 pb-5 pt-2 text-[13.5px] text-ink3">
          {tab === "mine" ? t("No tasks for you. Use “Add task” to note something to do, with a reminder.") : t("You have not given anyone a task. Use “Add task” and pick a person.")}
        </p>
      ) : (
        <ul className="px-2 pb-2">
          {rows.map((task) => {
            const done = flip[task.id] ?? task.done;
            const over = task.overdue && !done;
            return (
              <li key={task.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/70">
                {tab === "mine" ? <Checkbox checked={done} onChange={() => toggle(task)} label={t("Done: {title}", { title: task.title })} /> : <Avatar name={task.to ?? "Staff"} size={30} />}
                <Link href={`/dashboard/tasks?task=${task.id}`} className="min-w-0 flex-1">
                  <p className={cx("text-[14.5px] font-semibold leading-snug", done && "line-through text-ink3 font-medium")}>{task.title}</p>
                  <p className={cx("text-[12.5px]", over ? "text-bad font-semibold" : "text-ink3")}>
                    {[over ? t("Overdue") : null, task.due ? t.any(task.due) : t("No due date"), task.by ? t("from {name}", { name: task.by }) : null, task.to ? t("given to {name}", { name: task.to }) : null, task.status === "IN_PROGRESS" && !done ? t("In progress") : null].filter(Boolean).join(" · ")}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <div className="px-5 pb-4">
        <Link href={tab === "given" ? "/dashboard/tasks?view=given" : "/dashboard/tasks"} className="text-[13px] font-semibold text-brand hover:underline">
          {tab === "given" ? t("All tasks given by me") : t("All my tasks and the task report")}
        </Link>
      </div>
      {pending && <span className="sr-only" role="status">{t("Saving")}</span>}
      <TaskDialog key={round} open={open} onClose={() => setOpen(false)} access={access} people={people} meId={meId} today={today} />
    </Card>
  );
}

export function TaskDialog({ open, onClose, access, people, meId, today, task }: {
  open: boolean; onClose: () => void; access: "full" | "own"; people: Person[]; meId: string; today: string;
  task?: { id: string; title: string; assignedToId: string; dueDate: string; dueTime: string; details: string; remind: boolean };
}) {
  const t = useT();
  const [state, action] = useActionState<FormState, FormData>(saveTaskAction, null);
  const router = useRouter();
  useEffect(() => { if (state?.ok) { onClose(); router.refresh(); } }, [state, onClose, router]);
  const v = (k: string, d = "") => state?.values?.[k] ?? d;
  const askPast = Boolean((state?.data as { confirmPast?: boolean } | undefined)?.confirmPast);
  const me = people.find((p) => p.id === meId);
  return (
    <Dialog open={open} onClose={onClose} title={task ? t("Edit task") : t("Add task")} sub={t("Only the task is needed. A reminder goes out before it is due.")}>
      <form action={action} className="space-y-4">
        {task && <input type="hidden" name="id" value={task.id} />}
        {askPast && <input type="hidden" name="confirmPast" value="1" />}
        {state && !state.ok && state.message && !askPast && <Alert tone="danger">{screenMessage(t, state.message)}</Alert>}
        <TextField label={t("Task")} name="title" required maxLength={150} defaultValue={v("title", task?.title)} error={screenMessage(t, state?.errors?.title)} placeholder={t("For example, check PTM slots for Saturday")} autoFocus />
        <SelectField label={t("Assign to")} name="assignedToId" defaultValue={v("assignedToId", task?.assignedToId ?? meId)}
          help={access === "full" ? t("You can give tasks to any staff member who can sign in.") : t("You can give tasks only to yourself.")}
          error={screenMessage(t, state?.errors?.assignedToId)}
          options={(access === "full" ? people : me ? [me] : [{ id: meId, name: t("Me") }]).map((p) => ({ value: p.id, label: p.id === meId ? t("Me ({name})", { name: p.name }) : p.name }))} />
        <div className="grid grid-cols-2 gap-4">
          <TextField label={t("Due date")} name="dueDate" type="date" min={askPast ? undefined : today} defaultValue={v("dueDate", task?.dueDate)} error={screenMessage(t, state?.errors?.dueDate ?? state?.errors?.dueAt)} />
          <TextField label={t("Time")} name="dueTime" type="time" defaultValue={v("dueTime", task?.dueTime ?? "17:00")} />
        </div>
        {askPast && (
          <Alert tone="warning" title={t("Due date is before today. Save anyway?")}>{t("Change the date, or press Save anyway to keep it. It will show as overdue.")}</Alert>
        )}
        <CheckboxField label={t("Remind before it is due (the day before and on the morning)")} name="remind" defaultChecked={state?.values ? state.values.remind === "on" : task?.remind ?? true} />
        <TextArea label={t("More details")} name="details" rows={3} maxLength={2000} defaultValue={v("details", task?.details)} />
        <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>{t("Cancel")}</Button>
          <SubmitButton pendingText={t("Saving…")}>{askPast ? t("Save anyway") : task ? t("Save task") : t("Add task")}</SubmitButton>
        </div>
      </form>
    </Dialog>
  );
}

/* ---------- Waiting for your approval ---------- */
export function ApprovalsCard({ count, rows }: { count: number; rows: ApprovalCardRow[] }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [problem, setProblem] = useState<string | null>(null);
  const list = rows.filter((a) => !gone.has(a.id));
  const left = Math.max(0, count - gone.size);
  const approve = (a: ApprovalCardRow) => {
    setGone((s) => new Set(s).add(a.id));
    start(async () => {
      const p = await decideAction(a.id, "approve", null);
      if (p) { setProblem(screenMessage(t, p)); setGone((s) => { const x = new Set(s); x.delete(a.id); return x; }); }
    });
  };
  return (
    <Card>
      <CardHeader title={t("Waiting for your approval")} icon={I.ListChecks}
        action={<Link href="/approvals" aria-label={t("{n} waiting. Open Approvals", { n: left })}><Pill tone="info">{left}</Pill></Link>} />
      {problem && <div className="px-5 pb-2"><Alert tone="danger">{problem}</Alert></div>}
      {left === 0 ? (
        <div className="px-5 pb-6 pt-1 text-center">
          <span className="mx-auto w-12 h-12 rounded-2xl bg-ok/10 text-ok grid place-items-center animate-pop"><I.Check size={24} strokeWidth={2.6} aria-hidden="true" /></span>
          <p className="font-semibold mt-2.5">{t("All done")}</p>
          <p className="text-[13px] text-ink3">{t("Nothing is waiting for you.")}</p>
        </div>
      ) : (
        <>
          <ul className="px-3 pb-2 flex flex-col gap-1">
            {list.map((a) => (
              <li key={a.id} className="p-2.5 rounded-xl hover:bg-sunken/70">
                <Link href={`/approvals/${a.id}`} className="flex items-start gap-3">
                  <Avatar name={a.who} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold leading-snug">{a.who}</p>
                    {a.as && <p className="text-[12px] text-ink2">{a.as}</p>}
                    <p className="text-[12.5px] text-ink3">{a.what}{a.amount ? ` · ${a.amount}` : ""}</p>
                    {a.why && <p className="text-[12.5px] text-ink2 line-clamp-2">“{a.why}”</p>}
                    <span className="inline-flex items-center gap-0.5 text-brand font-semibold text-[12px] mt-0.5">{t("See details")}<I.ChevronRight size={14} aria-hidden="true" /></span>
                  </div>
                </Link>
                <div className="flex gap-2 mt-2 pl-[46px]">
                  <Button size="sm" variant="soft" icon={I.Check} onClick={() => approve(a)} disabled={pending}>{t("Approve")}</Button>
                  <ButtonLink href={`/approvals/${a.id}`} size="sm" variant="ghost">{t("Decline")}</ButtonLink>
                </div>
              </li>
            ))}
          </ul>
          {left > list.length && (
            <div className="px-5 pb-4"><Link href="/approvals" className="text-[13px] font-semibold text-brand hover:underline">{t("See all {n} in Approvals", { n: left })}</Link></div>
          )}
        </>
      )}
    </Card>
  );
}
