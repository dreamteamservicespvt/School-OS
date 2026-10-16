"use server";

import { requireAction } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { PermissionDeniedError } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { addDays, todayIn } from "@/lib/staff/dates";
import { canSeeStudent, feeViewer } from "@/lib/fees/access";
import { addCallNote } from "@/lib/fees/defaulters";
import { previewReminders, sendReminders, type ReminderInput } from "@/lib/fees/reminders";
import { MoneyProblem } from "@/lib/fees/problem";
import { id, ids, optionalDateOf, optionalId, str, text, zonedToInstant } from "@/lib/fees/act";
import { feeAction } from "../_lib/action";

export type PreviewResult =
  | { ok: true; recipients: number; cost: number; skipped: { reason: string; count: number }[]; nothingDue: number; creditProblem: string | null; problems: string[]; sample: string | null; linkAvailable: boolean }
  | { ok: false; message: string };

function inputOf(fd: FormData, timeZone: string): ReminderInput {
  const when = str(fd, "when");
  const tomorrow = addDays(todayIn(timeZone), 1).toISOString().slice(0, 10);
  return {
    studentIds: ids(fd, "studentId"),
    channel: str(fd, "channel"),
    templateId: optionalId(fd, "templateId"),
    text: str(fd, "text") || null,
    includeLink: str(fd, "link") === "on",
    scheduledAt: when === "later" ? zonedToInstant(`${tomorrow}T09:00`, timeZone) : null,
    today: todayIn(timeZone),
  };
}

/** P4: who gets the reminder, who is skipped and why, and the credit cost. Saves nothing. */
export async function previewReminderAction(fd: FormData): Promise<PreviewResult> {
  let current;
  try {
    ({ current } = await requireAction("fee-management", "create"));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return { ok: false, message: "Your role cannot send fee reminders." };
    throw e;
  }
  try {
    return await withSchool(current.ctx, async (tx) => {
      const viewer = await feeViewer(tx, current.ctx, current);
      if (viewer.change !== "all") throw new MoneyProblem("Your role cannot send fee reminders.");
      const p = await previewReminders(tx, current.ctx, inputOf(fd, current.school.timeZone));
      return { ok: true as const, recipients: p.recipients, cost: p.cost, skipped: p.skipped.map((s) => ({ reason: s.reason, count: s.count })), nothingDue: p.skippedNothingDue, creditProblem: p.creditProblem, problems: p.problems, sample: p.sample, linkAvailable: p.linkAvailable };
    });
  } catch (e) {
    if (e instanceof MoneyProblem) return { ok: false, message: e.message };
    throw e;
  }
}

/** Sends (or schedules) the reminders. Each student's reminder goes in their reminder history. */
export async function sendReminderAction(_prev: unknown, fd: FormData) {
  return feeAction("create", fd, async (tx, ctx, _viewer, current) => {
    const r = await sendReminders(tx, ctx, inputOf(fd, current.school.timeZone));
    return r;
  }, (r) => {
    const skipped = r.skipped.reduce((s, g) => s + g.count, 0);
    const who = `${r.sent} ${r.sent === 1 ? "parent" : "parents"}`;
    return `${r.scheduled ? `Reminder scheduled for ${who} (tomorrow, 9 AM)` : `Reminder sent to ${who}`}.${skipped ? ` ${skipped} skipped.` : ""} Saved in each student’s reminder history.`;
  }, { staffOnly: "send fee reminders" });
}

/** A note of a call with the parent, with the date they promised to pay. */
export async function callNoteAction(_prev: unknown, fd: FormData) {
  return feeAction("edit", fd, async (tx, ctx, viewer) => {
    const studentId = id(fd, "studentId", "student");
    if (!(await canSeeStudent(tx, viewer, studentId))) throw new MoneyProblem("This student was not found.");
    const n = await addCallNote(tx, ctx, { studentId, note: text(fd, "note", "Note", { min: 3, max: 500 }), promisedOn: optionalDateOf(fd, "promisedOn", "Promised date") });
    return n.promisedOn;
  }, (d) => (d ? `Call note saved. Promised to pay by ${formatDate(d)}.` : "Call note saved."), { staffOnly: "add call notes" });
}
