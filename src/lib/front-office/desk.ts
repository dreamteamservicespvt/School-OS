// The Reception Desk's own records (16 §2): front-office notes and walk-in
// requests. A request gets a number (REQ-2026-0042) the person can ask
// about, and the department gets it as a Task for the person who handles it.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { formatNumber, nextNumber } from "../sequences";
import { FrontOfficeProblem } from "./problem";
import { frontOfficeSettings } from "./settings";
import { handlerFor } from "./people";
import { messageVisitor, sentWords } from "./notify";
import { todayIso } from "./time";
import { mobileDigits, phoneProblem } from "./words";

/* ---------- Front-office notes ---------- */

const noteText = (t: string) => {
  const v = t.trim().replace(/\s+/g, " ");
  if (v.length < 2) throw new FrontOfficeProblem("Type the note.", "text");
  if (v.length > 200) throw new FrontOfficeProblem("Keep the note to 200 characters.", "text");
  return v;
};

export async function addNote(tx: Tx, ctx: SchoolContext, text: string) {
  const open = await tx.frontOfficeNote.count({ where: { clearedAt: null } });
  if (open >= 20) throw new FrontOfficeProblem("There are 20 notes already. Clear old ones first.", "text");
  const n = await tx.frontOfficeNote.create({ data: { schoolId: ctx.schoolId, text: noteText(text), createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Front Office Note", recordId: n.id, after: { text: n.text } });
  return n;
}

export async function editNote(tx: Tx, ctx: SchoolContext, id: string, text: string) {
  const n = await tx.frontOfficeNote.findFirst({ where: { id, clearedAt: null } });
  if (!n) throw new FrontOfficeProblem("This note was cleared already.");
  const after = await tx.frontOfficeNote.update({ where: { id }, data: { text: noteText(text) } });
  await writeAudit(tx, ctx, { action: "changed", recordType: "Front Office Note", recordId: id, before: { text: n.text }, after: { text: after.text } });
  return after;
}

/** Clears a note (kept, not deleted); it can be brought back with Undo. */
export async function clearNote(tx: Tx, ctx: SchoolContext, id: string, now = new Date()) {
  const n = await tx.frontOfficeNote.findFirst({ where: { id, clearedAt: null } });
  if (!n) throw new FrontOfficeProblem("This note was cleared already.");
  await tx.frontOfficeNote.update({ where: { id }, data: { clearedAt: now, clearedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "cleared", recordType: "Front Office Note", recordId: id, before: { text: n.text } });
  return n;
}

export async function restoreNote(tx: Tx, ctx: SchoolContext, id: string) {
  const n = await tx.frontOfficeNote.findFirst({ where: { id, clearedAt: { not: null } } });
  if (!n) throw new FrontOfficeProblem("This note is already showing.");
  await tx.frontOfficeNote.update({ where: { id }, data: { clearedAt: null, clearedById: null } });
  await writeAudit(tx, ctx, { action: "restored", recordType: "Front Office Note", recordId: id, after: { text: n.text } });
}

/* ---------- Walk-in requests ---------- */

export type WalkInInput = {
  fromName: string;
  fromPhone: string | null;
  guardianId: string | null;
  studentId: string | null;
  request: string;
  department: string;
  note: string | null;
  givenBy: "whatsapp" | "slip";
};

export async function nextRequestNo(tx: Tx, ctx: SchoolContext, year: string) {
  return formatNumber(`REQ-${year}-`, await nextNumber(tx, ctx, `walk-in-${year}`), 4);
}

/** Peeks at the next request number without taking it (shown read-only on the form). */
export async function peekRequestNo(tx: Tx, ctx: SchoolContext, year: string) {
  const row = await tx.numberSequence.findUnique({ where: { schoolId_key: { schoolId: ctx.schoolId, key: `walk-in-${year}` } } });
  return formatNumber(`REQ-${year}-`, row?.nextValue ?? 1, 4);
}

/** Records a walk-in request and routes it to the department as a task (16 Done when 11). */
export async function addWalkIn(tx: Tx, ctx: SchoolContext, input: WalkInInput, opts: { timeZone: string; now?: Date }) {
  const now = opts.now ?? new Date();
  const s = await frontOfficeSettings(tx, ctx);
  if (!s.requestDepartments.includes(input.department)) throw new FrontOfficeProblem("Choose the department.", "department");
  const request = input.request.trim().replace(/\s+/g, " ");
  if (request.length < 3) throw new FrontOfficeProblem("What do they need?", "request");
  if (request.length > 300) throw new FrontOfficeProblem("Keep the request to 300 characters. Put more in the note.", "request");
  let fromName = input.fromName.trim().replace(/\s+/g, " ");
  let phone = input.fromPhone ? mobileDigits(input.fromPhone) : null;
  let about: string | null = null;
  let studentId = input.studentId;
  if (input.guardianId) {
    const g = await tx.guardian.findFirst({ where: { id: input.guardianId, archivedAt: null }, include: { students: { where: { archivedAt: null, ...(studentId ? { studentId } : {}) }, take: 1, include: { student: { select: { id: true, fullName: true } } } } } });
    if (!g) throw new FrontOfficeProblem("Choose the parent again.", "fromName");
    fromName = g.name;
    phone = g.phone;
    const link = g.students[0];
    if (link) {
      studentId = link.student.id;
      about = `${link.relationship} of ${link.student.fullName}`;
    }
  } else if (studentId) {
    const st = await tx.student.findFirst({ where: { id: studentId, archivedAt: null }, select: { fullName: true } });
    if (!st) throw new FrontOfficeProblem("Choose the student again.", "fromName");
    about = fromName && fromName !== st.fullName ? `For ${st.fullName}` : "Student";
  }
  if (fromName.length < 2) throw new FrontOfficeProblem("Search a parent or student, or type a name.", "fromName");
  if (fromName.length > 120) throw new FrontOfficeProblem("Name can be at most 120 characters.", "fromName");
  if (phone) {
    const pp = phoneProblem(phone);
    if (pp) throw new FrontOfficeProblem(pp, "fromPhone");
  }
  if (input.givenBy === "whatsapp" && !phone) throw new FrontOfficeProblem("Enter their phone to send the number on WhatsApp, or choose Slip.", "fromPhone");
  const note = input.note?.trim().slice(0, 500) || null;
  const handler = await handlerFor(tx, ctx, input.department);
  const year = todayIso(opts.timeZone, now).slice(0, 4);
  const requestNo = await nextRequestNo(tx, ctx, year);
  let taskId: string | null = null;
  if (handler) {
    const task = await tx.task.create({
      data: {
        schoolId: ctx.schoolId, title: `${requestNo}: ${request}`.slice(0, 200),
        details: [`Walk-in request from ${fromName}${about ? ` (${about.toLowerCase()})` : ""}${phone ? `, phone ${phone}` : ""}.`, note].filter(Boolean).join("\n"),
        assignedToId: handler.loginId, givenById: ctx.userId!, dueAt: new Date(now.getTime() + 3 * 86_400_000),
      },
    });
    taskId = task.id;
    await writeAudit(tx, ctx, { action: "created", recordType: "Task", recordId: task.id, after: { title: task.title, assignedToId: handler.loginId, from: "walk-in request" } });
    await notify(tx, ctx, { to: handler.loginId, type: "task", text: `Walk-in request ${requestNo} for ${input.department}: ${request}`, link: `/dashboard/tasks?task=${task.id}` }, now);
  }
  const r = await tx.walkInRequest.create({
    data: { schoolId: ctx.schoolId, requestNo, fromName, fromPhone: phone, guardianId: input.guardianId, studentId, about, request, department: input.department, note, givenBy: input.givenBy, taskId, handlerLoginId: handler?.loginId ?? null, createdById: ctx.userId },
  });
  await writeAudit(tx, ctx, { action: "created", recordType: "Walk-in Request", recordId: r.id, after: { requestNo, fromName, request, department: input.department, handler: handler?.name ?? null } });
  let sent: string | null = null;
  if (input.givenBy === "whatsapp" && phone) {
    const res = await messageVisitor(tx, ctx, {
      to: { name: fromName, phone }, trigger: "Walk-in request number",
      text: `Your request number is ${requestNo} (${request}). It has gone to ${input.department}. Quote this number when you ask about it.`,
      about: { recordType: "Walk-in Request", recordId: r.id },
    });
    sent = sentWords(res);
  }
  return { request: r, handler, sent };
}

/** The request's status follows its task: Sent until started, then In progress, then Done. */
export function requestStatus(r: { status: string }, task: { status: string } | null | undefined) {
  if (!task) return r.status;
  if (task.status === "DONE") return "DONE";
  if (task.status === "IN_PROGRESS") return "IN_PROGRESS";
  return r.status;
}

/** Marks a request done at the desk (for example when the certificate was handed over). */
export async function closeWalkIn(tx: Tx, ctx: SchoolContext, id: string, now = new Date()) {
  const r = await tx.walkInRequest.findFirst({ where: { id, archivedAt: null } });
  if (!r) throw new FrontOfficeProblem("This request was not found.");
  if (r.status === "DONE") throw new FrontOfficeProblem(`${r.requestNo} is already done.`);
  await tx.walkInRequest.update({ where: { id }, data: { status: "DONE", doneAt: now } });
  await writeAudit(tx, ctx, { action: "done", recordType: "Walk-in Request", recordId: id, before: { status: r.status }, after: { status: "DONE" } });
  return r;
}
