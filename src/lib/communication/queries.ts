// Feedback & Queries (11-communication.md): queries and complaints from
// parents, students and staff, each with a ticket number, an owner and a
// status. Internal notes never leave the school; replies go to the requester
// by message.
import "server-only";

import type { Prisma, QueryStatus } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { formatNumber, nextNumber } from "../sequences";
import { sendMessage, MessagingProblem } from "../messaging/send";
import { channelSetups, type Channel } from "../messaging/channels";
import { messageSettings, type QueryType } from "../messaging/settings";
import { ensureReadyTemplates, templateByKey } from "../messaging/templates";
import type { AudienceRule } from "../messaging/recipients";

export const QUERY_TYPE_LABEL: Record<QueryType, string> = { query: "Query", complaint: "Complaint", suggestion: "Suggestion", feedback: "Feedback" };
export const QUERY_PRIORITIES = [
  { key: "low", label: "Low" },
  { key: "normal", label: "Normal" },
  { key: "high", label: "High" },
  { key: "urgent", label: "Urgent" },
] as const;
export const CAME_BY = [
  { key: "phone", label: "Phone" },
  { key: "visit", label: "Visit" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "email", label: "Email" },
  { key: "letter", label: "Letter" },
] as const;
export const QUERY_STATUS_LABEL: Record<QueryStatus, string> = { OPEN: "Open", IN_PROGRESS: "In progress", RESOLVED: "Resolved", CLOSED: "Closed" };
/** Topics a school starts with (inferred). */
export const READY_TOPICS = ["Fees", "Transport", "Teaching", "Food", "Facilities", "Admission", "Exams", "Other"];

export class QueryProblem extends Error {}

export async function ensureTopics(tx: Tx, ctx: SchoolContext) {
  const count = await tx.queryTopic.count({ where: { schoolId: ctx.schoolId } });
  if (count) return;
  await tx.queryTopic.createMany({ data: READY_TOPICS.map((name, i) => ({ schoolId: ctx.schoolId, name, sortOrder: i })), skipDuplicates: true });
}

/**
 * Which queries a person sees: everything with full access; otherwise their own, their department's and those they logged.
 * campusId: a person limited to one campus sees the queries about their campus's students, parents and staff, the ones
 * about nobody in particular, and their own.
 */
export async function queryWhere(tx: Tx, ctx: SchoolContext, reach: "all" | "own", campusId?: string | null): Promise<Prisma.QueryWhereInput> {
  const base = await reachWhere(tx, ctx, reach);
  return campusId ? { AND: [base, await queryCampusWhere(tx, ctx, campusId)] } : base;
}

async function reachWhere(tx: Tx, ctx: SchoolContext, reach: "all" | "own"): Promise<Prisma.QueryWhereInput> {
  if (reach === "all") return { schoolId: ctx.schoolId };
  const staff = ctx.userId ? await tx.staff.findFirst({ where: { schoolId: ctx.schoolId, userLoginId: ctx.userId }, select: { departmentId: true } }) : null;
  return {
    schoolId: ctx.schoolId,
    OR: [{ ownerId: ctx.userId }, { createdById: ctx.userId }, ...(staff?.departmentId ? [{ departmentId: staff.departmentId, ownerId: null }] : [])],
  };
}

/** Queries about one campus (see queryWhere). */
async function queryCampusWhere(tx: Tx, ctx: SchoolContext, campusId: string): Promise<Prisma.QueryWhereInput> {
  const [students, links, staff] = await Promise.all([
    tx.student.findMany({ where: { schoolId: ctx.schoolId, campusId }, select: { id: true } }),
    tx.studentGuardian.findMany({ where: { schoolId: ctx.schoolId, student: { campusId } }, select: { guardianId: true } }),
    tx.staff.findMany({ where: { schoolId: ctx.schoolId, campusId }, select: { id: true } }),
  ]);
  const studentIds = students.map((s) => s.id);
  return {
    OR: [
      ...(ctx.userId ? [{ ownerId: ctx.userId }, { createdById: ctx.userId }] : []),
      { aboutStudentId: { in: studentIds } },
      { studentId: { in: studentIds } },
      { guardianId: { in: [...new Set(links.map((l) => l.guardianId))] } },
      { staffId: { in: staff.map((s) => s.id) } },
      { aboutStudentId: null, studentId: null, guardianId: null, staffId: null },
    ],
  };
}

export type NewQuery = {
  fromType: "guardian" | "student" | "staff" | "other";
  fromId: string | null;
  fromName: string | null;
  fromPhone: string | null;
  aboutStudentId: string | null;
  type: QueryType;
  topicId: string | null;
  details: string;
  priority: string;
  ownerId: string | null;
  departmentId: string | null;
  cameBy: string;
};

async function requester(tx: Tx, ctx: SchoolContext, q: Pick<NewQuery, "fromType" | "fromId" | "fromName" | "fromPhone">) {
  if (q.fromType === "guardian" && q.fromId) {
    const g = await tx.guardian.findFirst({ where: { id: q.fromId, schoolId: ctx.schoolId } });
    if (!g) throw new QueryProblem("Choose the parent again.");
    return { name: g.name, phone: g.phone };
  }
  if (q.fromType === "student" && q.fromId) {
    const s = await tx.student.findFirst({ where: { id: q.fromId, schoolId: ctx.schoolId } });
    if (!s) throw new QueryProblem("Choose the student again.");
    return { name: s.fullName, phone: null };
  }
  if (q.fromType === "staff" && q.fromId) {
    const s = await tx.staff.findFirst({ where: { id: q.fromId, schoolId: ctx.schoolId } });
    if (!s) throw new QueryProblem("Choose the staff member again.");
    return { name: s.fullName, phone: s.phone };
  }
  if (!q.fromName) throw new QueryProblem("Type who the query is from, or search for them.");
  return { name: q.fromName, phone: q.fromPhone };
}

/** Log a query: gets a ticket number; the requester is sent the number (inferred). */
export async function logQuery(tx: Tx, ctx: SchoolContext, input: NewQuery, now = new Date()) {
  const from = await requester(tx, ctx, input);
  let ownerId = input.ownerId;
  let departmentId = input.departmentId;
  if (!ownerId && !departmentId && input.topicId) {
    const topic = await tx.queryTopic.findFirst({ where: { id: input.topicId, schoolId: ctx.schoolId } });
    ownerId = topic?.defaultOwnerId ?? null;
    departmentId = topic?.defaultDepartmentId ?? null;
  }
  if (!ownerId && !departmentId) throw new QueryProblem("Choose who owns this query: a staff member or a department.");
  const settings = await messageSettings(tx, ctx);
  const dueBy = settings.queryTargets.on ? new Date(now.getTime() + settings.queryTargets.hours[input.type] * 3600_000) : null;
  const number = formatNumber("Q-", await nextNumber(tx, ctx, "query"));
  const q = await tx.query.create({
    data: {
      schoolId: ctx.schoolId,
      number,
      fromType: input.fromType,
      guardianId: input.fromType === "guardian" ? input.fromId : null,
      studentId: input.fromType === "student" ? input.fromId : null,
      staffId: input.fromType === "staff" ? input.fromId : null,
      fromName: from.name,
      fromPhone: from.phone,
      aboutStudentId: input.aboutStudentId,
      type: input.type,
      topicId: input.topicId,
      details: input.details,
      priority: input.priority,
      ownerId,
      departmentId,
      cameBy: input.cameBy,
      dueBy,
      createdById: ctx.userId,
    },
  });
  await writeAudit(tx, ctx, { action: "created", recordType: "Query", recordId: q.id, after: { number, type: input.type, priority: input.priority, from: from.name } });
  if (ownerId) await notify(tx, ctx, { to: ownerId, type: "query", text: `Query ${number} is yours: ${input.details.slice(0, 120)}`, link: `/communication/queries/${q.id}` });
  else if (departmentId) {
    for (const person of await departmentLogins(tx, ctx, departmentId)) {
      await notify(tx, ctx, { to: person, type: "query", text: `New query ${number} for your department. Pick it up: ${input.details.slice(0, 100)}`, link: `/communication/queries/${q.id}` });
    }
  }
  let told = false;
  if (input.fromType === "guardian" && input.fromId) {
    try {
      await ensureReadyTemplates(tx, ctx);
      const setups = await channelSetups(tx, ctx);
      const t = setups.whatsapp.isOn ? await templateByKey(tx, ctx, "query-number", "whatsapp") : null;
      if (t) {
        await sendMessage(tx, ctx, { to: { guardianIds: [input.fromId] }, channels: ["whatsapp"], templates: { whatsapp: t.id }, values: { ticket_number: number, message: QUERY_TYPE_LABEL[input.type].toLowerCase() }, single: true, trigger: `Query ${number} logged`, source: { type: "Query", id: q.id } });
        told = true;
      }
    } catch (e) {
      if (!(e instanceof MessagingProblem)) throw e;
    }
  }
  return { query: q, told };
}

async function departmentLogins(tx: Tx, ctx: SchoolContext, departmentId: string) {
  const staff = await tx.staff.findMany({ where: { schoolId: ctx.schoolId, departmentId, archivedAt: null, userLoginId: { not: null } }, select: { userLoginId: true } });
  return staff.map((s) => s.userLoginId!).filter(Boolean);
}

async function load(tx: Tx, ctx: SchoolContext, id: string) {
  const q = await tx.query.findFirst({ where: { id, schoolId: ctx.schoolId } });
  if (!q) throw new QueryProblem("This query was not found.");
  return q;
}

async function note(tx: Tx, ctx: SchoolContext, queryId: string, kind: "reply" | "internal" | "change", text: string, messageId: string | null = null) {
  return tx.queryNote.create({ data: { schoolId: ctx.schoolId, queryId, kind, text, messageId, createdById: ctx.userId } });
}

/** Assign to a staff member or a department. */
export async function assignQuery(tx: Tx, ctx: SchoolContext, id: string, to: { ownerId: string | null; departmentId: string | null }, words: string) {
  const q = await load(tx, ctx, id);
  if (!to.ownerId && !to.departmentId) throw new QueryProblem("Choose a staff member or a department.");
  await tx.query.update({ where: { id }, data: { ownerId: to.ownerId, departmentId: to.departmentId } });
  await note(tx, ctx, id, "change", `Assigned to ${words}`);
  await writeAudit(tx, ctx, { action: "assigned", recordType: "Query", recordId: id, before: { ownerId: q.ownerId, departmentId: q.departmentId }, after: to });
  if (to.ownerId) await notify(tx, ctx, { to: to.ownerId, type: "query", text: `Query ${q.number} is now yours.`, link: `/communication/queries/${id}` });
}

/** Anyone in the department can pick it up and becomes its owner (inferred). */
export async function pickUp(tx: Tx, ctx: SchoolContext, id: string) {
  const q = await load(tx, ctx, id);
  if (q.ownerId) throw new QueryProblem("Someone has already picked this up.");
  await tx.query.update({ where: { id }, data: { ownerId: ctx.userId, status: q.status === "OPEN" ? "IN_PROGRESS" : q.status } });
  await note(tx, ctx, id, "change", "Picked up");
  await writeAudit(tx, ctx, { action: "picked-up", recordType: "Query", recordId: id, before: { ownerId: null }, after: { ownerId: ctx.userId } });
}

export async function addInternalNote(tx: Tx, ctx: SchoolContext, id: string, text: string) {
  await load(tx, ctx, id);
  const n = await note(tx, ctx, id, "internal", text);
  await writeAudit(tx, ctx, { action: "internal-note", recordType: "Query", recordId: id });
  return n;
}

/** The channels a reply can go on for this requester. */
export function replyChannels(q: { fromType: string; cameBy: string }): Channel[] {
  if (q.fromType === "student") return ["app"];
  if (q.fromType === "staff") return ["app", "whatsapp", "email"];
  return q.cameBy === "email" ? ["email", "whatsapp"] : ["whatsapp", "email"];
}

/** Reply to the requester by message. Only the reply text is sent, never notes. */
export async function replyToQuery(tx: Tx, ctx: SchoolContext, id: string, text: string, channel: Channel) {
  const q = await load(tx, ctx, id);
  if (q.status === "CLOSED") throw new QueryProblem("This query is closed. Reopen it to reply.");
  let to: AudienceRule;
  if (q.guardianId) to = { guardianIds: [q.guardianId] };
  else if (q.staffId) to = { staffIds: [q.staffId] };
  else if (q.studentId) to = { studentIds: [q.studentId] };
  else throw new QueryProblem(`${q.fromName ?? "This person"} is not a parent, student or staff member in the school, so a reply cannot be sent by message.${q.fromPhone ? ` Call them on ${q.fromPhone}, then add a note here.` : " Add a note of how you replied."}`);
  const sent = await sendMessage(tx, ctx, {
    to,
    channels: [channel],
    text: `${text}\n\nTicket ${q.number}`,
    title: `Reply to your ${QUERY_TYPE_LABEL[q.type as QueryType].toLowerCase()} ${q.number}`,
    single: true,
    trigger: `Reply to query ${q.number}`,
    source: { type: "Query", id: q.id },
  });
  await note(tx, ctx, id, "reply", text, sent.messageId);
  if (q.status === "OPEN") await tx.query.update({ where: { id }, data: { status: "IN_PROGRESS" } });
  await writeAudit(tx, ctx, { action: "replied", recordType: "Query", recordId: id, after: { channel, message: sent.messageId } });
  return sent;
}

export async function setQueryStatus(tx: Tx, ctx: SchoolContext, id: string, status: QueryStatus, resolution: string | null) {
  const q = await load(tx, ctx, id);
  if (q.status === status) throw new QueryProblem(`This query is already ${QUERY_STATUS_LABEL[status].toLowerCase()}.`);
  if (status === "RESOLVED" && (!resolution || resolution.trim().length < 5)) throw new QueryProblem("Write the resolution notes (at least 5 characters), so everyone knows what was done.");
  const now = new Date();
  const data: Prisma.QueryUpdateInput = { status };
  if (status === "RESOLVED") { data.resolution = resolution; data.resolvedAt = now; }
  if (status === "CLOSED") { data.closedAt = now; if (!q.resolvedAt) data.resolvedAt = now; }
  if (status === "OPEN" || status === "IN_PROGRESS") { data.closedAt = null; }
  await tx.query.update({ where: { id }, data });
  await note(tx, ctx, id, "change", status === "RESOLVED" ? `Resolved: ${resolution}` : `Marked ${QUERY_STATUS_LABEL[status].toLowerCase()}`);
  await writeAudit(tx, ctx, { action: `query-${status.toLowerCase()}`, recordType: "Query", recordId: id, before: { status: q.status }, after: { status, resolution } });
  // Satisfaction rating after closing (optional).
  let ratingAsked = false;
  if (status === "CLOSED" && q.guardianId) {
    const settings = await messageSettings(tx, ctx);
    if (settings.queryRating) {
      try {
        const t = await templateByKey(tx, ctx, "query-rating", "whatsapp");
        if (t) {
          await sendMessage(tx, ctx, { to: { guardianIds: [q.guardianId] }, channels: ["whatsapp"], templates: { whatsapp: t.id }, values: { ticket_number: q.number }, single: true, trigger: `Rating request for ${q.number}`, source: { type: "Query", id: q.id }, idempotencyKey: `query-rating:${q.id}` });
          ratingAsked = true;
        }
      } catch (e) {
        if (!(e instanceof MessagingProblem)) throw e;
      }
    }
  }
  return { ratingAsked };
}

export async function recordRating(tx: Tx, ctx: SchoolContext, id: string, rating: number) {
  const q = await load(tx, ctx, id);
  if (q.status !== "CLOSED" && q.status !== "RESOLVED") throw new QueryProblem("A rating can be recorded once the query is resolved or closed.");
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new QueryProblem("Choose a rating from 1 to 5.");
  await tx.query.update({ where: { id }, data: { rating } });
  await note(tx, ctx, id, "change", `Rated ${rating} out of 5`);
  await writeAudit(tx, ctx, { action: "rated", recordType: "Query", recordId: id, before: { rating: q.rating }, after: { rating } });
}

export async function setPriority(tx: Tx, ctx: SchoolContext, id: string, priority: string) {
  const q = await load(tx, ctx, id);
  if (!QUERY_PRIORITIES.some((p) => p.key === priority)) throw new QueryProblem("Choose a priority.");
  await tx.query.update({ where: { id }, data: { priority } });
  await note(tx, ctx, id, "change", `Priority set to ${priority}`);
  await writeAudit(tx, ctx, { action: "changed", recordType: "Query", recordId: id, before: { priority: q.priority }, after: { priority } });
}

/** Overdue queries move to the escalation person (or the Principal), who is told (optional, larger schools). */
export async function escalateQueries(tx: Tx, ctx: SchoolContext, now = new Date()) {
  const settings = await messageSettings(tx, ctx);
  if (!settings.queryTargets.on) return 0;
  const overdue = await tx.query.findMany({ where: { schoolId: ctx.schoolId, status: { in: ["OPEN", "IN_PROGRESS"] }, dueBy: { lt: now }, escalatedAt: null } });
  if (!overdue.length) return 0;
  let to = settings.queryTargets.escalateToId;
  if (!to) {
    const p = await tx.schoolAccess.findFirst({ where: { schoolId: ctx.schoolId, archivedAt: null, roles: { some: { role: { key: "principal" } } } }, select: { userLoginId: true } });
    to = p?.userLoginId ?? null;
  }
  if (!to) return 0;
  for (const q of overdue) {
    await tx.query.update({ where: { id: q.id }, data: { escalatedAt: now, ownerId: to } });
    await tx.queryNote.create({ data: { schoolId: ctx.schoolId, queryId: q.id, kind: "change", text: "Escalated: past its reply time limit" } });
    await notify(tx, ctx, { to, type: "query", text: `Overdue query ${q.number} moved to you: ${q.details.slice(0, 100)}`, link: `/communication/queries/${q.id}` });
    if (q.ownerId && q.ownerId !== to) await notify(tx, ctx, { to: q.ownerId, type: "query", text: `Query ${q.number} was past its time limit and moved on.`, link: `/communication/queries/${q.id}` });
    await writeAudit(tx, ctx, { action: "escalated", recordType: "Query", recordId: q.id, before: { ownerId: q.ownerId }, after: { ownerId: to } });
  }
  return overdue.length;
}
