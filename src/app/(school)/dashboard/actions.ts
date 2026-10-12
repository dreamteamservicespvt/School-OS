"use server";

// Dashboard changes: My Tasks, "Mark as seen" on Needs Attention, and the
// setup checklist. Every action checks the role on the server first.
import { revalidatePath } from "next/cache";
import type { TaskStatus } from "@prisma/client";
import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { flash } from "@/lib/flash";
import { writeAudit } from "@/lib/audit";
import { dayStartUtc } from "@/lib/periods";
import type { FormState } from "@/lib/forms";
import { formValues } from "@/lib/forms";
import { addComment, addTask, archiveTask, editTask, setTaskStatus, statusLabel, taskAccess, TaskProblem, type NewTask } from "@/lib/dashboard/tasks";
import { markStep, SetupProblem, SETUP_STEPS } from "@/lib/dashboard/setup";

const fail = (e: unknown, values?: Record<string, string>): FormState => {
  if (e instanceof TaskProblem || e instanceof SetupProblem) {
    const field = e instanceof TaskProblem ? e.field : undefined;
    return { ok: false, message: e.message, errors: field ? { [field]: e.message } : undefined, values };
  }
  console.error(JSON.stringify({ level: "error", event: "dashboard-action", error: e instanceof Error ? e.message : String(e) }));
  return { ok: false, message: "That did not work, and nothing was changed. Please try again.", values };
};

/** Reads the task form: the due date and time are in the school's zone. */
function readTask(fd: FormData, timeZone: string): NewTask | string {
  const v = formValues(fd);
  const date = (v.dueDate ?? "").trim();
  const time = (v.dueTime ?? "").trim();
  let dueAt: Date | null = null;
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "dueDate";
    const [h, m] = /^\d{2}:\d{2}$/.test(time) ? time.split(":").map(Number) : [17, 0];
    dueAt = new Date(dayStartUtc(date, timeZone).getTime() + (h * 60 + m) * 60_000);
    if (Number.isNaN(dueAt.getTime())) return "dueDate";
  } else if (time) return "dueDate";
  return { title: v.title ?? "", assignedToId: v.assignedToId || null, dueAt, details: v.details ?? null, remind: v.remind === "on", confirmPast: v.confirmPast === "1" };
}

export async function saveTaskAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { current } = await requireAction("dashboard", "create");
  const values = formValues(fd);
  const input = readTask(fd, current.school.timeZone);
  if (typeof input === "string") return { ok: false, message: "Choose a due date, or leave both date and time empty.", errors: { dueDate: "Choose a due date, or leave both date and time empty." }, values };
  const who = { ctx: current.ctx, access: taskAccess(current) };
  const id = values.id?.trim();
  try {
    const task = await withSchool(current.ctx, (tx) => (id ? editTask(tx, who, id, input) : addTask(tx, who, input, { timeZone: current.school.timeZone })));
    const forMe = task.assignedToId === current.user.id;
    await flash({
      message: id ? "Task saved." : forMe ? `Task added${task.dueAt && task.remind ? ". A reminder goes out the day before and on the morning it is due." : "."}` : "Task given. They have been told in the app.",
      link: { href: `/dashboard/tasks?task=${task.id}`, label: "Open task" },
    });
  } catch (e) {
    const state = fail(e, values);
    // A past due date is a question, not a stop: the form shows "Save anyway".
    if (e instanceof TaskProblem && e.field === "dueAt") return { ...state!, data: { confirmPast: true } };
    return state;
  }
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function setTaskStatusAction(id: string, status: TaskStatus): Promise<string | void> {
  const { current } = await requireAction("dashboard", "edit");
  try {
    const before = await withSchool(current.ctx, (tx) => setTaskStatus(tx, { ctx: current.ctx, access: taskAccess(current) }, String(id), status));
    if (before !== status) {
      await flash({ message: status === "DONE" ? "Task marked done." : `Task moved to ${statusLabel(status)}.`, undo: { kind: "task-status", id: `${id}~${before}` } });
    }
  } catch (e) {
    return fail(e)!.message;
  }
  revalidatePath("/dashboard", "layout");
}

export async function commentAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const { current } = await requireAction("dashboard", "edit");
  const values = formValues(fd);
  try {
    await withSchool(current.ctx, (tx) => addComment(tx, { ctx: current.ctx, access: taskAccess(current) }, values.id ?? "", values.text ?? ""));
  } catch (e) {
    return fail(e, values);
  }
  revalidatePath("/dashboard/tasks");
  return { ok: true };
}

export async function archiveTaskAction(id: string): Promise<string | void> {
  const { current } = await requireAction("dashboard", "archive");
  try {
    await withSchool(current.ctx, (tx) => archiveTask(tx, { ctx: current.ctx, access: taskAccess(current) }, String(id)));
  } catch (e) {
    return fail(e)!.message;
  }
  await flash({ message: "Task archived.", undo: { kind: "task-archive", id: String(id) } });
  revalidatePath("/dashboard", "layout");
}

/** Hides one Needs Attention card for this person until its number changes. */
export async function markSeenAction(itemKey: string, value: string): Promise<string | void> {
  const { current } = await requireAction("dashboard", "view");
  const key = String(itemKey).slice(0, 200), val = String(value).slice(0, 100);
  if (!key) return "That card was not found.";
  const row = await withSchool(current.ctx, async (tx) => {
    const r = await tx.dashboardSeen.upsert({
      where: { schoolId_userLoginId_itemKey: { schoolId: current.ctx.schoolId, userLoginId: current.user.id, itemKey: key } },
      create: { schoolId: current.ctx.schoolId, userLoginId: current.user.id, itemKey: key, value: val },
      update: { value: val, seenAt: new Date(), archivedAt: null },
    });
    await writeAudit(tx, current.ctx, { action: "marked as seen", recordType: "Dashboard Seen", recordId: r.id, after: { item: key, value: val } });
    return r;
  });
  await flash({ message: "Marked as seen. It comes back if the number changes.", tone: "info", undo: { kind: "dashboard-seen", id: row.id } });
  revalidatePath("/dashboard");
}

/** Brings back every card this person marked as seen. */
export async function showSeenAction(): Promise<void> {
  const { current } = await requireAction("dashboard", "view");
  await withSchool(current.ctx, async (tx) => {
    const rows = await tx.dashboardSeen.findMany({ where: { userLoginId: current.user.id, archivedAt: null }, select: { id: true } });
    if (!rows.length) return;
    await tx.dashboardSeen.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { archivedAt: new Date() } });
    await writeAudit(tx, current.ctx, { action: "seen cards shown again", recordType: "Dashboard Seen", recordId: rows[0].id, after: { count: rows.length } });
  });
  revalidatePath("/dashboard");
}

/** Marks a setup step done, or skips an optional one (School Admin and Principal). */
export async function markStepAction(key: string, status: "DONE" | "SKIPPED"): Promise<string | void> {
  const { current, reach } = await requireAction("settings", "edit");
  if (reach !== "all") return "Only the School Admin or the Principal changes the setup checklist.";
  if (status !== "DONE" && status !== "SKIPPED") return "That is not a setup choice.";
  const step = SETUP_STEPS.find((s) => s.key === key);
  try {
    const row = await withSchool(current.ctx, (tx) => markStep(tx, current.ctx, String(key), status));
    await flash({
      message: status === "DONE" ? `Marked done: ${step?.label}.` : `${step?.label} skipped for now.${key === "gateway" ? " Parents pay at the counter until you connect it." : ""}`,
      tone: status === "DONE" ? "success" : "info",
      undo: { kind: "setup-step", id: row.id },
    });
  } catch (e) {
    return fail(e)!.message;
  }
  revalidatePath("/dashboard", "layout");
}
