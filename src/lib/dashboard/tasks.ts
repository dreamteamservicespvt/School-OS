// My Tasks (01 §2): tasks given to staff, with due dates, reminders and
// status. "Full task manager" (full Dashboard access, set per role in
// Settings, Users & Permissions) gives tasks to anyone and sees every task;
// everyone else ("own tasks only") gives tasks only to themselves and sees
// the tasks given to or by them.
import "server-only";

import type { Prisma, TaskStatus } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { dayStartUtc } from "../periods";
import { formatDateTime } from "../format";
import type { PermissionMap } from "../permissions";

export type TaskAccess = "full" | "own";
export const taskAccess = (permissions: PermissionMap): TaskAccess => (permissions.dashboard.see === "all" ? "full" : "own");

export const TASK_STATUSES: { value: TaskStatus; label: string; tone: "neutral" | "brand" | "success" | "warning" }[] = [
  { value: "TODO", label: "To do", tone: "neutral" },
  { value: "IN_PROGRESS", label: "In progress", tone: "brand" },
  { value: "DONE", label: "Done", tone: "success" },
  { value: "CANCELLED", label: "Cancelled", tone: "warning" },
];
export const statusLabel = (s: TaskStatus) => TASK_STATUSES.find((x) => x.value === s)?.label ?? s;
export const OPEN_TASK: TaskStatus[] = ["TODO", "IN_PROGRESS"];

export const TITLE_MAX = 150;
export const DETAILS_MAX = 2000;

export class TaskProblem extends Error {
  constructor(message: string, readonly field?: string) {
    super(message);
    this.name = "TaskProblem";
  }
}

export type Who = { ctx: SchoolContext; access: TaskAccess };

/** People a task can be given to: every staff member with a login (full), or only oneself. */
export async function assignable(tx: Tx, who: Who) {
  const me = who.ctx.userId;
  const staff = await tx.staff.findMany({
    where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] }, userLoginId: who.access === "full" ? { not: null } : me ?? "" },
    select: { userLoginId: true, fullName: true, designation: true },
    orderBy: { fullName: "asc" },
  });
  const people = staff.map((s) => ({ id: s.userLoginId!, name: s.fullName, designation: s.designation }));
  if (me && !people.some((p) => p.id === me)) {
    const login = await tx.userLogin.findUnique({ where: { id: me }, select: { displayName: true } });
    people.unshift({ id: me, name: login?.displayName ?? "Me", designation: "" });
  }
  return people;
}

/** Which tasks a person sees in each tab. */
export function taskWhere(who: Who, view: "mine" | "given" | "all"): Prisma.TaskWhereInput {
  const me = who.ctx.userId ?? "";
  if (view === "mine") return { assignedToId: me };
  if (view === "given") return { givenById: me, assignedToId: { not: me } };
  return who.access === "full" ? {} : { OR: [{ assignedToId: me }, { givenById: me }] };
}

async function load(tx: Tx, who: Who, id: string) {
  const t = await tx.task.findFirst({ where: { id, archivedAt: null } });
  const me = who.ctx.userId;
  if (!t || (who.access !== "full" && t.assignedToId !== me && t.givenById !== me)) throw new TaskProblem("That task was not found, or it is not yours to change.");
  return t;
}

export type NewTask = { title: string; assignedToId: string | null; dueAt: Date | null; details: string | null; remind: boolean; confirmPast?: boolean };

/** Rules for a new or edited task; returns the cleaned values. */
export async function checkTask(tx: Tx, who: Who, input: NewTask, now = new Date()) {
  const title = input.title.trim().replace(/\s+/g, " ");
  if (!title) throw new TaskProblem("Write what needs doing.", "title");
  if (title.length > TITLE_MAX) throw new TaskProblem(`Keep the task to ${TITLE_MAX} characters. Put the rest under More details.`, "title");
  const details = input.details?.trim() ? input.details.trim().slice(0, DETAILS_MAX) : null;
  const to = input.assignedToId || who.ctx.userId;
  if (!to) throw new TaskProblem("Choose who does this task.", "assignedToId");
  const people = await assignable(tx, who);
  if (!people.some((p) => p.id === to)) {
    throw new TaskProblem(who.access === "full" ? "Choose a staff member who can sign in." : "You can give tasks only to yourself. Ask for full task-manager access to give tasks to others.", "assignedToId");
  }
  if (input.dueAt && input.dueAt < now && !input.confirmPast) throw new TaskProblem("Due date is before today. Save anyway?", "dueAt");
  return { title, details, assignedToId: to, dueAt: input.dueAt, remind: input.remind && Boolean(input.dueAt) };
}

export async function addTask(tx: Tx, who: Who, input: NewTask, opts: { now?: Date; timeZone?: string; link?: string } = {}) {
  const clean = await checkTask(tx, who, input, opts.now);
  const task = await tx.task.create({ data: { schoolId: who.ctx.schoolId, ...clean, givenById: who.ctx.userId! } });
  await writeAudit(tx, who.ctx, { action: "created", recordType: "Task", recordId: task.id, after: { title: task.title, assignedToId: task.assignedToId, dueAt: task.dueAt?.toISOString() ?? null } });
  const giver = await tx.userLogin.findUnique({ where: { id: who.ctx.userId! }, select: { displayName: true } });
  await notify(tx, who.ctx, {
    to: task.assignedToId, type: "task-assigned",
    text: `${giver?.displayName ?? "Someone"} gave you a task: ${task.title}${task.dueAt ? `, due ${formatDateTime(task.dueAt, opts.timeZone)}` : ""}`,
    link: opts.link ?? "/dashboard/tasks", groupKey: "task-assigned", mergedText: (n) => `${n} new tasks given to you`,
  });
  return task;
}

export async function editTask(tx: Tx, who: Who, id: string, input: NewTask, now = new Date()) {
  const t = await load(tx, who, id);
  if (who.access !== "full" && t.givenById !== who.ctx.userId) throw new TaskProblem("Only the person who gave this task can change it. You can change its status or add a comment.");
  const clean = await checkTask(tx, who, input, now);
  const reminders = clean.dueAt?.getTime() !== t.dueAt?.getTime() ? [] : t.remindersSent;
  const after = await tx.task.update({ where: { id }, data: { ...clean, remindersSent: reminders } });
  await writeAudit(tx, who.ctx, { action: "changed", recordType: "Task", recordId: id, before: { title: t.title, assignedToId: t.assignedToId, dueAt: t.dueAt?.toISOString() ?? null, details: t.details }, after: { title: after.title, assignedToId: after.assignedToId, dueAt: after.dueAt?.toISOString() ?? null, details: after.details } });
  if (after.assignedToId !== t.assignedToId) {
    await notify(tx, who.ctx, { to: after.assignedToId, type: "task-assigned", text: `A task was passed to you: ${after.title}`, link: "/dashboard/tasks", groupKey: "task-assigned", mergedText: (n) => `${n} new tasks given to you` });
  }
  return after;
}

/** Changes a task's status. Returns the status before, for Undo. */
export async function setTaskStatus(tx: Tx, who: Who, id: string, status: TaskStatus) {
  if (!TASK_STATUSES.some((s) => s.value === status)) throw new TaskProblem("That is not a task status.");
  const t = await load(tx, who, id);
  if (t.status === status) return t.status;
  if (status === "CANCELLED" && who.access !== "full" && t.givenById !== who.ctx.userId) throw new TaskProblem("Only the person who gave this task can cancel it.");
  const now = new Date();
  await tx.task.update({ where: { id }, data: { status, statusAt: now, doneAt: status === "DONE" ? now : null } });
  await writeAudit(tx, who.ctx, { action: "status changed", recordType: "Task", recordId: id, before: { status: t.status }, after: { status } });
  // The giver hears when a task they gave is done.
  if (status === "DONE" && t.givenById !== t.assignedToId) {
    const doer = await tx.userLogin.findUnique({ where: { id: t.assignedToId }, select: { displayName: true } });
    await notify(tx, who.ctx, { to: t.givenById, type: "task-done", text: `${doer?.displayName ?? "Someone"} finished: ${t.title}`, link: "/dashboard/tasks?view=given", groupKey: "task-done", mergedText: (n) => `${n} tasks you gave are done` });
  }
  return t.status;
}

export async function addComment(tx: Tx, who: Who, id: string, text: string) {
  const clean = text.trim();
  if (clean.length < 2) throw new TaskProblem("Write a few words.", "text");
  if (clean.length > 1000) throw new TaskProblem("Keep a comment under 1000 characters.", "text");
  const t = await load(tx, who, id);
  const c = await tx.taskComment.create({ data: { schoolId: who.ctx.schoolId, taskId: id, authorId: who.ctx.userId!, text: clean } });
  await writeAudit(tx, who.ctx, { action: "comment added", recordType: "Task", recordId: id, after: { comment: clean } });
  const other = who.ctx.userId === t.assignedToId ? t.givenById : t.assignedToId;
  await notify(tx, who.ctx, { to: other, type: "task-comment", text: `New comment on "${t.title}"`, link: `/dashboard/tasks?task=${t.id}`, groupKey: `task-comment:${t.id}`, mergedText: (n) => `${n} new comments on "${t.title}"` });
  return c;
}

export async function archiveTask(tx: Tx, who: Who, id: string) {
  const t = await load(tx, who, id);
  if (who.access !== "full" && t.givenById !== who.ctx.userId) throw new TaskProblem("Only the person who gave this task can archive it.");
  await tx.task.update({ where: { id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, who.ctx, { action: "archived", recordType: "Task", recordId: id, before: { title: t.title, status: t.status } });
}

export async function restoreTask(tx: Tx, who: Who, id: string) {
  const t = await tx.task.findFirst({ where: { id, archivedAt: { not: null } } });
  if (!t || (who.access !== "full" && t.givenById !== who.ctx.userId)) throw new TaskProblem("That task cannot be brought back.");
  await tx.task.update({ where: { id }, data: { archivedAt: null } });
  await writeAudit(tx, who.ctx, { action: "restored", recordType: "Task", recordId: id, after: { title: t.title } });
}

/** Overdue: still open after its due time. */
export const isOverdue = (t: { status: TaskStatus; dueAt: Date | null }, now = new Date()) => OPEN_TASK.includes(t.status) && Boolean(t.dueAt && t.dueAt < now);

/**
 * Task reminders (01 §2, Done when 7): one day before it is due and on the
 * due morning (8:00 in the school's zone). Each goes once; a task done,
 * cancelled or archived gets none. Safe to run again.
 */
export async function sendTaskReminders(tx: Tx, ctx: SchoolContext, now = new Date()) {
  const school = await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { timeZone: true } });
  const tz = school?.timeZone ?? "Asia/Kolkata";
  const tasks = await tx.task.findMany({
    where: { archivedAt: null, remind: true, status: { in: OPEN_TASK }, dueAt: { gt: now, lte: new Date(now.getTime() + 26 * 3_600_000) } },
  });
  let sent = 0;
  for (const t of tasks) {
    const due = t.dueAt!;
    const keys: string[] = [];
    if (!t.remindersSent.includes("day-before") && due.getTime() - now.getTime() <= 24 * 3_600_000) keys.push("day-before");
    const dueDay = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(due);
    const morning = new Date(dayStartUtc(dueDay, tz).getTime() + 8 * 3_600_000);
    if (!t.remindersSent.includes("due-morning") && now >= morning && morning < due) keys.push("due-morning");
    if (!keys.length) continue;
    await tx.task.update({ where: { id: t.id }, data: { remindersSent: [...t.remindersSent, ...keys] } });
    await notify(tx, { schoolId: ctx.schoolId, userId: null }, {
      to: t.assignedToId, type: "task-due",
      text: `Task due ${formatDateTime(due, tz)}: ${t.title}`,
      link: `/dashboard/tasks?task=${t.id}`, groupKey: "task-due", mergedText: (n) => `${n} tasks are due soon`,
    }, now);
    sent++;
  }
  return sent;
}

/** Task reports (01 §7): by person and status, overdue, and average days to close. */
export async function taskReport(tx: Tx, where: Prisma.TaskWhereInput, now = new Date()) {
  const rows = await tx.task.findMany({ where: { AND: [where, { archivedAt: null }] }, select: { assignedToId: true, status: true, dueAt: true, createdAt: true, doneAt: true } });
  const people = new Map((await tx.userLogin.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.assignedToId))] } }, select: { id: true, displayName: true } })).map((p) => [p.id, p.displayName]));
  const by = new Map<string, { id: string; name: string; open: number; done: number; overdue: number; cancelled: number; closeDays: number[] }>();
  for (const r of rows) {
    const p = by.get(r.assignedToId) ?? { id: r.assignedToId, name: people.get(r.assignedToId) ?? "Someone", open: 0, done: 0, overdue: 0, cancelled: 0, closeDays: [] };
    if (OPEN_TASK.includes(r.status)) p.open++;
    if (r.status === "DONE") { p.done++; if (r.doneAt) p.closeDays.push((r.doneAt.getTime() - r.createdAt.getTime()) / 86_400_000); }
    if (r.status === "CANCELLED") p.cancelled++;
    if (isOverdue(r, now)) p.overdue++;
    by.set(r.assignedToId, p);
  }
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);
  const all = [...by.values()];
  return {
    people: all.map((p) => ({ ...p, avgDays: avg(p.closeDays) })).sort((a, b) => b.overdue - a.overdue || b.open - a.open || a.name.localeCompare(b.name)),
    totals: {
      total: rows.length,
      open: all.reduce((s, p) => s + p.open, 0),
      done: all.reduce((s, p) => s + p.done, 0),
      overdue: all.reduce((s, p) => s + p.overdue, 0),
      avgDays: avg(all.flatMap((p) => p.closeDays)),
    },
  };
}
