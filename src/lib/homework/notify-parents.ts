// The one place Homework hands parent messages to Communication (17 §5,
// 11-communication §6): "Homework set" when a teacher sets homework,
// "Pending homework" once a day after the due date, and the teacher's
// "Resend to parents who have not seen it". Communication keeps the
// automation log, so the same event never reaches a parent twice.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate } from "../format";
import { MessagingProblem, planMessage, sendAutomatic, sendMessage, templateByKey, type Channel, type SendInput } from "../messaging";
import { onChannels } from "../messaging/channels";
import { HomeworkProblem } from "./access";
import { requireWork, type HomeworkScope } from "./scope";
import { seenFor } from "./homework";

type SetInput = { homeworkId: string; title: string; subject: string; sectionLabel: string; dueDate: Date; studentIds: string[] };

/** "Homework set": only when the school has switched the rule on (default off, 11 §6). Never blocks giving homework. */
export async function tellParentsHomeworkSet(tx: Tx, ctx: SchoolContext, input: SetInput) {
  if (!input.studentIds.length) return null;
  const message = `${input.subject}: ${input.title}. Due ${formatDate(input.dueDate, "UTC")}.`;
  try {
    const r = await sendAutomatic(tx, ctx, {
      rule: "homework-set",
      event: { key: `homework-set:${input.homeworkId}`, label: `${input.subject} homework for ${input.sectionLabel}` },
      to: { guardiansOf: input.studentIds },
      values: { class: input.sectionLabel, message, date: formatDate(input.dueDate, "UTC") },
      perStudent: Object.fromEntries(input.studentIds.map((id) => [id, { class: input.sectionLabel, message, date: formatDate(input.dueDate, "UTC") }])),
      source: { type: "Homework", id: input.homeworkId },
    });
    return r.status;
  } catch (e) {
    if (e instanceof MessagingProblem) return "no-channel";
    throw e;
  }
}

/** "Pending homework": to parents of students who have not handed in work due on that date. One message per homework and student, ever. */
export async function tellParentsPending(tx: Tx, ctx: SchoolContext, hw: { id: string; title: string; dueDate: Date }, studentIds: string[]) {
  if (!studentIds.length) return null;
  const date = formatDate(hw.dueDate, "UTC");
  try {
    const r = await sendAutomatic(tx, ctx, {
      rule: "homework-pending",
      event: { key: `homework-pending:${hw.id}`, label: `Homework not handed in: ${hw.title}` },
      to: { guardiansOf: studentIds },
      values: { date },
      perStudent: Object.fromEntries(studentIds.map((id) => [id, { date }])),
      source: { type: "Homework", id: hw.id },
    });
    return r.status;
  } catch (e) {
    if (e instanceof MessagingProblem) return "no-channel";
    throw e;
  }
}

/** Students given the homework whose parents have not opened any homework message yet. */
export async function unseenStudents(tx: Tx, homeworkId: string) {
  const [subs, seen] = await Promise.all([
    tx.submission.findMany({ where: { homeworkId, archivedAt: null, status: { not: "EXCUSED" } }, select: { studentId: true } }),
    seenFor(tx, [homeworkId]),
  ]);
  const m = seen.get(homeworkId) ?? new Map();
  return subs.map((s) => s.studentId).filter((id) => !m.has(id));
}

async function resendInput(tx: Tx, s: HomeworkScope, homeworkId: string) {
  const hw = await tx.homework.findFirst({ where: { id: homeworkId, archivedAt: null } });
  if (!hw) throw new HomeworkProblem("This homework was not found. It may have been archived.");
  requireWork(s, hw, "this homework");
  const students = await unseenStudents(tx, homeworkId);
  if (!students.length) throw new HomeworkProblem("Every parent has already seen this homework.");
  const [subject, section, first] = await Promise.all([
    tx.subject.findUnique({ where: { id: hw.subjectId }, select: { name: true } }),
    tx.section.findUnique({ where: { id: hw.sectionId }, include: { schoolClass: { select: { name: true } } } }),
    tx.message.findFirst({ where: { sourceType: "Homework", sourceId: homeworkId }, orderBy: { createdAt: "asc" }, select: { id: true } }),
  ]);
  const cls = section ? `${section.schoolClass.name} ${section.name}` : "";
  const message = `${subject?.name ?? "Homework"}: ${hw.title}. Due ${formatDate(hw.dueDate, "UTC")}.`;
  // WhatsApp if connected, else the parents' app; the Homework template for the app.
  const on = await onChannels(tx, s.ctx);
  const channel: Channel = on.has("whatsapp") ? "whatsapp" : on.has("sms") ? "sms" : "app";
  const template = await templateByKey(tx, s.ctx, "homework-set", channel);
  if (channel === "sms" && !template) throw new HomeworkProblem("SMS needs an approved template for homework. Add one in Communication, Templates, or connect WhatsApp.", undefined, { href: "/communication/templates", label: "Open Templates" });
  const input: SendInput = {
    to: { guardiansOf: students },
    channels: [channel],
    templates: template ? { [channel]: template.id } : undefined,
    text: template ? null : `Dear {guardian_name}, new homework for {class}: {message} - {school_name}`,
    title: "New homework",
    values: { class: cls, message },
    perStudent: Object.fromEntries(students.map((id) => [id, { class: cls, message }])),
    trigger: "Resent to parents who had not seen the homework",
    source: { type: "Homework", id: homeworkId },
    resendOfId: first?.id ?? null,
  };
  return { hw, students, input, channel };
}

/** What a resend would do: how many parents, on which channel, and the credits. */
export async function previewResend(tx: Tx, s: HomeworkScope, homeworkId: string) {
  const { students, input, channel } = await resendInput(tx, s, homeworkId);
  const plan = await planMessage(tx, s.ctx, input);
  return { students: students.length, parents: plan.rows.length, channel, problem: plan.problems[0] ?? (plan.rows.length ? plan.creditProblem : "Nobody would get this message: no parent has a phone number or the app."), credits: plan.rows.reduce((a, r) => a + r.credits, 0) };
}

export async function resendToUnseen(tx: Tx, s: HomeworkScope, homeworkId: string) {
  const { hw, students, input, channel } = await resendInput(tx, s, homeworkId);
  try {
    const r = await sendMessage(tx, s.ctx, input);
    await writeAudit(tx, s.ctx, { action: "resent", recordType: "Homework", recordId: hw.id, after: { title: hw.title, students: students.length, channel } });
    return { students: students.length, messageId: r.messageId };
  } catch (e) {
    if (e instanceof MessagingProblem) throw new HomeworkProblem(e.message);
    throw e;
  }
}

/** "Remind parents" from Submissions: the students chosen who have not handed in. */
export async function remindParents(tx: Tx, s: HomeworkScope, homeworkId: string, studentIds: string[]) {
  const hw = await tx.homework.findFirst({ where: { id: homeworkId, archivedAt: null } });
  if (!hw) throw new HomeworkProblem("This homework was not found.");
  requireWork(s, hw, "this homework", "submissions");
  const subs = await tx.submission.findMany({ where: { homeworkId, studentId: { in: studentIds }, archivedAt: null, status: { in: ["ASSIGNED", "MISSING"] } }, select: { studentId: true } });
  if (!subs.length) throw new HomeworkProblem("Everyone chosen has already handed in. Reminders go only to parents of students who have not.");
  const on = await onChannels(tx, s.ctx);
  const channel: Channel = on.has("whatsapp") ? "whatsapp" : on.has("sms") ? "sms" : "app";
  const template = await templateByKey(tx, s.ctx, "homework-pending", channel);
  if (channel === "sms" && !template) throw new HomeworkProblem("SMS needs an approved template for homework reminders. Add one in Communication, Templates, or connect WhatsApp.", undefined, { href: "/communication/templates", label: "Open Templates" });
  const date = formatDate(hw.dueDate, "UTC");
  const ids = subs.map((x) => x.studentId);
  try {
    const r = await sendMessage(tx, s.ctx, {
      to: { guardiansOf: ids }, channels: [channel], templates: template ? { [channel]: template.id } : undefined,
      text: template ? null : "Dear {guardian_name}, {student_name} has not yet submitted homework due on {date}. - {school_name}",
      title: "Homework not handed in", values: { date }, perStudent: Object.fromEntries(ids.map((id) => [id, { date }])),
      trigger: "Teacher reminded parents about homework", source: { type: "Homework", id: hw.id },
    });
    await writeAudit(tx, s.ctx, { action: "reminded", recordType: "Homework", recordId: hw.id, after: { title: hw.title, students: ids.length, channel } });
    return { students: ids.length, messageId: r.messageId };
  } catch (e) {
    if (e instanceof MessagingProblem) throw new HomeworkProblem(e.message);
    throw e;
  }
}
