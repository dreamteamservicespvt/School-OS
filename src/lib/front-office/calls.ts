// Enquiries & Calls (16 §2): enquiries taken at the desk go straight to
// Admission Management (A3: an owner and a follow-up reminder at once), and
// every call is logged. A call about an admission makes the enquiry in the
// same step; a complaint becomes a query in Communication; a follow-up is a
// reminder (Task) to the person named.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { Current } from "../current";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { can } from "../permissions";
import { viewerFor } from "../admission/access";
import { admissionYear, loadSettings } from "../admission/settings";
import { createEnquiry, defaultFollowUp } from "../admission/enquiries";
import { ensureTopics, logQuery } from "../communication/queries";
import { FrontOfficeProblem } from "./problem";
import { frontOfficeSettings } from "./settings";
import { enrolmentsOf } from "./pickup";
import { handlerFor } from "./people";
import { clockAt, todayIso } from "./time";
import { mobileDigits, phoneProblem } from "./words";

export type KnownPhone = { kind: "parent" | "enquiry" | "caller"; name: string; who: string; guardianId: string | null };

/** Recognises a phone: a parent of the school, an open enquiry, or someone who called before. */
export async function recognisePhone(tx: Tx, ctx: SchoolContext, raw: string): Promise<KnownPhone | null> {
  const phone = mobileDigits(raw);
  if (!/^[6-9]\d{9}$/.test(phone)) return null;
  const guardians = await tx.guardian.findMany({
    where: { phone, archivedAt: null },
    include: { students: { where: { archivedAt: null, student: { archivedAt: null } }, include: { student: { select: { id: true, fullName: true } } }, take: 3 } },
    take: 1,
  });
  const g = guardians[0];
  if (g) {
    const labels = await enrolmentsOf(tx, ctx, g.students.map((s) => s.student.id));
    const kids = g.students.map((s) => `${s.student.fullName}${labels.get(s.student.id) ? `, ${labels.get(s.student.id)!.label}` : ""}`);
    const rel = g.students[0]?.relationship ?? g.relationship;
    return { kind: "parent", name: g.name, who: kids.length ? `${rel} of ${kids.join(" and ")}` : rel, guardianId: g.id };
  }
  const e = await tx.enquiry.findFirst({ where: { phone, archivedAt: null }, orderBy: { createdAt: "desc" }, select: { enquiryNo: true, parentName: true, childName: true, classId: true } });
  if (e) {
    const cls = e.classId ? await tx.schoolClass.findFirst({ where: { id: e.classId }, select: { name: true } }) : null;
    return { kind: "enquiry", name: e.parentName, who: `Enquiry ${e.enquiryNo ?? ""} · ${e.childName.split(" ")[0]}${cls ? `, ${cls.name}` : ""}`.replace("  ", " "), guardianId: null };
  }
  const c = await tx.callLogEntry.findFirst({ where: { phone, archivedAt: null }, orderBy: { at: "desc" }, select: { name: true, who: true } });
  if (c) return { kind: "caller", name: c.name, who: c.who ?? "Called before", guardianId: null };
  return null;
}

export type DeskEnquiryInput = { childName: string; parentName: string; phone: string; classId: string | null; source: "walk-in" | "phone"; note: string | null };

/** A walk-in or phone enquiry handed to Admission Management (A3). The person needs to be allowed to add enquiries there. */
export async function deskEnquiry(tx: Tx, ctx: SchoolContext, current: Pick<Current, "permissions" | "roles" | "user">, input: DeskEnquiryInput, opts: { timeZone: string; force?: boolean; siblingOfId?: string | null; visitorEntryId?: string | null; now?: Date }) {
  if (!can(current.permissions, "admission-management", "create")) throw new FrontOfficeProblem("Your role cannot add enquiries in Admission Management. Ask the School Admin.");
  const childName = input.childName.trim().replace(/\s+/g, " ");
  const parentName = input.parentName.trim().replace(/\s+/g, " ");
  if (childName.length < 2) throw new FrontOfficeProblem("Enter the child’s name.", "childName");
  if (parentName.length < 2) throw new FrontOfficeProblem("Enter the parent’s name.", "parentName");
  if (childName.length > 120 || parentName.length > 120) throw new FrontOfficeProblem("Names can be at most 120 characters.", childName.length > 120 ? "childName" : "parentName");
  const pp = phoneProblem(input.phone);
  if (pp) throw new FrontOfficeProblem(pp, "phone");
  if (!input.classId) throw new FrontOfficeProblem("Choose the class wanted.", "classId");
  const v = await viewerFor(tx, ctx, current);
  const s = await loadSettings(tx, ctx);
  const year = await admissionYear(tx, ctx, s);
  if (!year) throw new FrontOfficeProblem("Admissions have no open year. Set the admission year in Admission Management, Settings (the School Admin can).");
  const campus = await tx.campus.findFirst({ where: { archivedAt: null }, orderBy: [{ isMain: "desc" }, { createdAt: "asc" }], select: { id: true } });
  if (!campus) throw new FrontOfficeProblem("Add a campus in Settings first.");
  const e = await createEnquiry(tx, ctx, v, s, {
    childName, parentName, phone: mobileDigits(input.phone), email: null, classId: input.classId, source: input.source, ownerStaffId: null,
    nextFollowUpAt: await defaultFollowUp(tx, ctx, opts.timeZone, opts.now, campus.id), nextAction: input.source === "phone" ? "Call back" : "Follow up on the visit",
    childDob: null, currentSchool: null, referredBy: null, notes: input.note?.trim() || null,
  }, { yearId: year.id, campusId: campus.id, today: todayIso(opts.timeZone, opts.now), force: opts.force, siblingOfId: opts.siblingOfId ?? null, now: opts.now });
  if (opts.visitorEntryId) await tx.visitorEntry.updateMany({ where: { id: opts.visitorEntryId, enquiryId: null }, data: { enquiryId: e.id } });
  const owner = e.ownerStaffId ? await tx.staff.findFirst({ where: { id: e.ownerStaffId }, select: { fullName: true } }) : null;
  return { enquiry: e, owner: owner?.fullName ?? null };
}

export type CallInput = {
  direction: "IN" | "OUT";
  phone: string;
  name: string;
  purpose: string;
  note: string | null;
  /** Admission enquiry purpose: the enquiry made in the same step. */
  childName: string | null;
  classId: string | null;
  /** Follow-up (a reminder to the person named). */
  followUp: { at: Date; loginId: string } | null;
};

export const ENQUIRY_PURPOSE = "Admission enquiry";
export const COMPLAINT_PURPOSE = "Complaint";

/** Logs a call (16 §2 Log a call). */
export async function logCall(tx: Tx, ctx: SchoolContext, current: Pick<Current, "permissions" | "roles" | "user">, input: CallInput, opts: { timeZone: string; force?: boolean; now?: Date }) {
  const now = opts.now ?? new Date();
  const s = await frontOfficeSettings(tx, ctx);
  if (!["IN", "OUT"].includes(input.direction)) throw new FrontOfficeProblem("Choose Incoming or Outgoing.", "direction");
  const pp = phoneProblem(input.phone);
  if (pp) throw new FrontOfficeProblem(pp, "phone");
  const phone = mobileDigits(input.phone);
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) throw new FrontOfficeProblem("Enter the caller’s name.", "name");
  if (name.length > 120) throw new FrontOfficeProblem("Name can be at most 120 characters.", "name");
  if (!s.callPurposes.includes(input.purpose)) throw new FrontOfficeProblem("Choose the purpose.", "purpose");
  const note = input.note?.trim().slice(0, 1000) || null;
  if (input.followUp && input.followUp.at.getTime() < now.getTime() - 60_000) throw new FrontOfficeProblem("The follow-up must be later than now.", "followDate");
  const known = await recognisePhone(tx, ctx, phone);
  let who = known?.kind === "parent" ? known.who : known?.kind === "enquiry" ? known.who : null;
  let enquiryId: string | null = null;
  let enquiryNo: string | null = null;
  let owner: string | null = null;
  let queryId: string | null = null;
  let queryNo: string | null = null;
  let status = "CLOSED";

  if (input.purpose === ENQUIRY_PURPOSE) {
    const r = await deskEnquiry(tx, ctx, current, { childName: input.childName ?? "", parentName: name, phone, classId: input.classId, source: "phone", note }, { timeZone: opts.timeZone, force: opts.force, now });
    enquiryId = r.enquiry.id;
    enquiryNo = r.enquiry.enquiryNo;
    owner = r.owner;
    who = who ?? "New enquiry";
    status = "FOLLOW_UP";
  } else if (input.purpose === COMPLAINT_PURPOSE) {
    if (!note || note.length < 5) throw new FrontOfficeProblem("Write what the complaint is about in the note.", "note");
    await ensureTopics(tx, ctx);
    const topic = await tx.queryTopic.findFirst({ where: { name: "Other", archivedAt: null } });
    const handler = topic?.defaultOwnerId || topic?.defaultDepartmentId ? null : await handlerFor(tx, ctx, "Office");
    if (!topic?.defaultOwnerId && !topic?.defaultDepartmentId && !handler) throw new FrontOfficeProblem("Nobody can own the query yet. Set a default owner in Communication, Feedback & Queries (the School Admin can).");
    const r = await logQuery(tx, ctx, {
      fromType: known?.guardianId ? "guardian" : "other", fromId: known?.guardianId ?? null, fromName: known?.guardianId ? null : name, fromPhone: known?.guardianId ? null : phone,
      aboutStudentId: null, type: "complaint", topicId: topic?.id ?? null, details: note, priority: "normal", ownerId: handler?.loginId ?? null, departmentId: null, cameBy: "phone",
    }, now);
    queryId = r.query.id;
    queryNo = r.query.number;
    status = "QUERY";
  }
  let taskId: string | null = null;
  if (input.followUp) {
    const task = await tx.task.create({
      data: {
        schoolId: ctx.schoolId, title: `Call back ${name}${who ? ` (${who})` : ""}`.slice(0, 200), details: [`${input.purpose}.`, note].filter(Boolean).join(" "),
        assignedToId: input.followUp.loginId, givenById: ctx.userId!, dueAt: input.followUp.at,
      },
    });
    taskId = task.id;
    await writeAudit(tx, ctx, { action: "created", recordType: "Task", recordId: task.id, after: { title: task.title, assignedToId: input.followUp.loginId, dueAt: input.followUp.at.toISOString(), from: "call log" } });
    await notify(tx, ctx, { to: input.followUp.loginId, type: "task", text: `Follow-up: call ${name} back at ${clockAt(input.followUp.at, opts.timeZone)}.`, link: `/dashboard/tasks?task=${task.id}` }, now);
    if (status === "CLOSED") status = "FOLLOW_UP";
  }
  const c = await tx.callLogEntry.create({
    data: {
      schoolId: ctx.schoolId, at: now, direction: input.direction, phone, name, who: who ?? "Caller", isParent: known?.kind === "parent", guardianId: known?.guardianId ?? null,
      purpose: input.purpose, note, enquiryId, queryId, queryNo, followUpAt: input.followUp?.at ?? null, followUpLoginId: input.followUp?.loginId ?? null, taskId, status, createdById: ctx.userId,
    },
  });
  await writeAudit(tx, ctx, { action: "created", recordType: "Call Log Entry", recordId: c.id, after: { direction: c.direction, name, purpose: c.purpose, status, enquiryNo, queryNo } });
  return { call: c, enquiryNo, owner, queryNo };
}

/** Sets (or moves) the follow-up on a call: a reminder to the person named. */
export async function setCallFollowUp(tx: Tx, ctx: SchoolContext, id: string, followUp: { at: Date; loginId: string }, opts: { timeZone: string; now?: Date }) {
  const now = opts.now ?? new Date();
  const c = await tx.callLogEntry.findFirst({ where: { id, archivedAt: null } });
  if (!c) throw new FrontOfficeProblem("This call was not found.");
  if (followUp.at.getTime() < now.getTime() - 60_000) throw new FrontOfficeProblem("The follow-up must be later than now.", "followDate");
  if (c.taskId) await tx.task.updateMany({ where: { id: c.taskId, status: { in: ["TODO", "IN_PROGRESS"] } }, data: { status: "CANCELLED", statusAt: now } });
  const task = await tx.task.create({
    data: { schoolId: ctx.schoolId, title: `Call back ${c.name}${c.who ? ` (${c.who})` : ""}`.slice(0, 200), details: [`${c.purpose}.`, c.note].filter(Boolean).join(" "), assignedToId: followUp.loginId, givenById: ctx.userId!, dueAt: followUp.at },
  });
  await tx.callLogEntry.update({ where: { id }, data: { followUpAt: followUp.at, followUpLoginId: followUp.loginId, taskId: task.id, status: c.status === "QUERY" ? "QUERY" : "FOLLOW_UP" } });
  await writeAudit(tx, ctx, { action: "follow-up-set", recordType: "Call Log Entry", recordId: id, before: { followUpAt: c.followUpAt?.toISOString() ?? null }, after: { followUpAt: followUp.at.toISOString(), loginId: followUp.loginId, taskId: task.id } });
  await notify(tx, ctx, { to: followUp.loginId, type: "task", text: `Follow-up: call ${c.name} back at ${clockAt(followUp.at, opts.timeZone)}.`, link: `/dashboard/tasks?task=${task.id}` }, now);
  return c;
}

/** Marks a call closed; an open follow-up reminder is cancelled. */
export async function closeCall(tx: Tx, ctx: SchoolContext, id: string, now = new Date()) {
  const c = await tx.callLogEntry.findFirst({ where: { id, archivedAt: null } });
  if (!c) throw new FrontOfficeProblem("This call was not found.");
  if (c.status === "CLOSED") throw new FrontOfficeProblem("This call is already closed.");
  if (c.taskId) await tx.task.updateMany({ where: { id: c.taskId, status: { in: ["TODO", "IN_PROGRESS"] } }, data: { status: "CANCELLED", statusAt: now } });
  await tx.callLogEntry.update({ where: { id }, data: { status: c.status === "QUERY" ? "QUERY" : "CLOSED", followUpAt: null, followUpLoginId: null } });
  await writeAudit(tx, ctx, { action: "closed", recordType: "Call Log Entry", recordId: id, before: { status: c.status }, after: { status: "CLOSED" } });
  return c;
}

/**
 * The call log's filter: dates, purpose and search (name, who, note; the
 * phone number only for people who see parents' numbers in full, so a masked
 * number cannot be found digit by digit).
 */
export function callLogWhere(opts: { from: Date; to: Date; purpose: string; q: string; phones: boolean }): Prisma.CallLogEntryWhereInput {
  const q = opts.q.trim().slice(0, 60);
  const or: Prisma.CallLogEntryWhereInput[] = [];
  if (q) {
    or.push({ name: { contains: q, mode: "insensitive" } }, { who: { contains: q, mode: "insensitive" } }, { note: { contains: q, mode: "insensitive" } }, { queryNo: { contains: q, mode: "insensitive" } });
    const d = q.replace(/\D/g, "");
    if (d.length >= 3) or.push(opts.phones ? { phone: { contains: d } } : { phone: { contains: d }, isParent: false });
  }
  return { AND: [{ archivedAt: null, at: { gte: opts.from, lt: opts.to } }, opts.purpose && opts.purpose !== "all" ? { purpose: opts.purpose } : {}, or.length ? { OR: or } : {}] };
}
