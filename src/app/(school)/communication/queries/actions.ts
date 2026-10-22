"use server";

// Feedback & Queries: log, assign, pick up, reply, internal notes, resolve, close.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { QueryStatus } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { flash } from "@/lib/flash";
import { commAction } from "@/lib/communication/access";
import { checkIndianMobile } from "@/lib/format";
import { addInternalNote, assignQuery, CAME_BY, logQuery, pickUp, QUERY_PRIORITIES, QueryProblem, queryWhere, recordRating, replyToQuery, setPriority, setQueryStatus } from "@/lib/communication/queries";
import { QUERY_TYPES, type QueryType } from "@/lib/messaging/settings";
import { MessagingProblem } from "@/lib/messaging/send";
import { isChannel } from "@/lib/messaging/channels";

export type QueryState = { ok: boolean; message?: string; errors?: Record<string, string> } | null;
const uuid = /^[0-9a-f-]{36}$/;
const optId = (v: FormDataEntryValue | null) => (typeof v === "string" && uuid.test(v) ? v : null);

export async function logQueryAction(_prev: QueryState, form: FormData): Promise<QueryState> {
  const { current } = await commAction("create");
  const errors: Record<string, string> = {};
  const fromKey = String(form.get("from") ?? "");
  const [fromTypeRaw, fromIdRaw] = fromKey.split(":");
  const fromType = (["guardian", "student", "staff"].includes(fromTypeRaw) && uuid.test(fromIdRaw ?? "") ? fromTypeRaw : "other") as "guardian" | "student" | "staff" | "other";
  const fromName = String(form.get("fromName") ?? "").trim();
  let fromPhone: string | null = String(form.get("fromPhone") ?? "").trim() || null;
  if (fromType === "other") {
    if (fromName.length < 2) errors.from = "Search for the parent, student or staff member, or type a name.";
    if (fromPhone) {
      const bad = checkIndianMobile(fromPhone);
      if (bad) errors.fromPhone = bad;
      else fromPhone = fromPhone.replace(/\D/g, "").slice(-10);
    }
  }
  const type = String(form.get("type") ?? "query");
  if (!(QUERY_TYPES as readonly string[]).includes(type)) errors.type = "Choose the type.";
  const details = String(form.get("details") ?? "").trim();
  if (details.length < 5) errors.details = "Write the details (at least 5 characters).";
  if (details.length > 3000) errors.details = "The details can be at most 3000 characters.";
  const priority = String(form.get("priority") ?? "normal");
  if (!QUERY_PRIORITIES.some((p) => p.key === priority)) errors.priority = "Choose a priority.";
  const owner = String(form.get("owner") ?? "");
  const [ownerKind, ownerId] = owner.split(":");
  const cameBy = String(form.get("cameBy") ?? "phone");
  if (Object.keys(errors).length) return { ok: false, message: Object.keys(errors).length === 1 ? Object.values(errors)[0] : `Please fix ${Object.keys(errors).length} things before saving.`, errors };
  let id: string, number: string, told: boolean;
  try {
    const r = await withSchool(current.ctx, (tx) => logQuery(tx, current.ctx, {
      fromType,
      fromId: fromType === "other" ? null : fromIdRaw,
      fromName: fromType === "other" ? fromName : null,
      fromPhone: fromType === "other" ? fromPhone : null,
      aboutStudentId: optId(form.get("aboutStudentId")) ?? (fromType === "student" ? fromIdRaw : null),
      type: type as QueryType,
      topicId: optId(form.get("topicId")),
      details,
      priority,
      ownerId: ownerKind === "user" && uuid.test(ownerId ?? "") ? ownerId : null,
      departmentId: ownerKind === "dept" && uuid.test(ownerId ?? "") ? ownerId : null,
      cameBy: CAME_BY.some((c) => c.key === cameBy) ? cameBy : "phone",
    }));
    id = r.query.id; number = r.query.number; told = r.told;
  } catch (e) {
    if (e instanceof QueryProblem) return { ok: false, message: e.message, errors: e.message.startsWith("Choose who owns") ? { owner: e.message } : undefined };
    throw e;
  }
  await flash({ message: `Logged as ${number}.${told ? " The parent was sent the ticket number on WhatsApp." : ""}`, tone: "success" });
  redirect(`/communication/queries/${id}`);
}

async function guard(id: string) {
  const access = await commAction("edit");
  const ok = await withSchool(access.current.ctx, async (tx) => tx.query.findFirst({ where: { AND: [{ id }, await queryWhere(tx, access.current.ctx, access.full ? "all" : "own", access.scope.campusId)] }, select: { id: true } }));
  if (!ok) throw new QueryProblem("This query was not found, or it is not yours.");
  return access;
}

async function run(id: string, fn: (a: Awaited<ReturnType<typeof guard>>) => Promise<string | void>): Promise<string | void> {
  try {
    const a = await guard(id);
    const msg = await fn(a);
    if (msg) await flash({ message: msg, tone: "success" });
  } catch (e) {
    if (e instanceof QueryProblem || e instanceof MessagingProblem) return e.message;
    throw e;
  }
  revalidatePath(`/communication/queries/${id}`);
}

export async function pickUpAction(id: string) {
  return run(id, async ({ current }) => { await withSchool(current.ctx, (tx) => pickUp(tx, current.ctx, id)); return "You picked up this query. It is yours now."; });
}

export async function assignAction(id: string, owner: string, words: string) {
  return run(id, async ({ current }) => {
    const [kind, oid] = owner.split(":");
    if (!uuid.test(oid ?? "")) throw new QueryProblem("Choose a staff member or a department.");
    await withSchool(current.ctx, (tx) => assignQuery(tx, current.ctx, id, { ownerId: kind === "user" ? oid : null, departmentId: kind === "dept" ? oid : null }, words));
    return `Assigned to ${words}.`;
  });
}

export async function priorityAction(id: string, priority: string) {
  return run(id, async ({ current }) => { await withSchool(current.ctx, (tx) => setPriority(tx, current.ctx, id, priority)); });
}

export async function replyAction(id: string, text: string, channel: string) {
  return run(id, async ({ current }) => {
    const t = text.trim();
    if (t.length < 2) throw new QueryProblem("Write the reply.");
    if (t.length > 900) throw new QueryProblem("The reply can be at most 900 characters.");
    if (!isChannel(channel)) throw new QueryProblem("Choose how to send the reply.");
    await withSchool(current.ctx, (tx) => replyToQuery(tx, current.ctx, id, t, channel));
    return "Reply sent.";
  });
}

export async function noteAction(id: string, text: string) {
  return run(id, async ({ current }) => {
    const t = text.trim();
    if (t.length < 2) throw new QueryProblem("Write the note.");
    if (t.length > 2000) throw new QueryProblem("The note can be at most 2000 characters.");
    await withSchool(current.ctx, (tx) => addInternalNote(tx, current.ctx, id, t));
    return "Internal note added. Only staff can see it.";
  });
}

export async function statusAction(id: string, status: QueryStatus, resolution: string | null) {
  return run(id, async ({ current }) => {
    const r = await withSchool(current.ctx, (tx) => setQueryStatus(tx, current.ctx, id, status, resolution?.trim() || null));
    return { OPEN: "Reopened.", IN_PROGRESS: "Marked in progress.", RESOLVED: "Resolved.", CLOSED: r.ratingAsked ? "Closed. The parent was asked for a 1 to 5 rating." : "Closed." }[status];
  });
}

export async function ratingAction(id: string, rating: number) {
  return run(id, async ({ current }) => { await withSchool(current.ctx, (tx) => recordRating(tx, current.ctx, id, rating)); return `Rating ${rating} of 5 recorded.`; });
}

/** The children of a parent, for "About (student)". */
export async function childrenOfGuardian(guardianId: string): Promise<{ id: string; name: string }[]> {
  const { current, scope } = await commAction("create");
  if (!uuid.test(guardianId)) return [];
  return withSchool(current.ctx, async (tx) => {
    // Only the children at their campus for a person limited to one campus.
    const rows = await tx.studentGuardian.findMany({ where: { schoolId: current.ctx.schoolId, guardianId, archivedAt: null, student: { archivedAt: null, ...(scope.campusId ? { campusId: scope.campusId } : {}) } }, select: { student: { select: { id: true, fullName: true } } } });
    return rows.map((r) => ({ id: r.student.id, name: r.student.fullName }));
  });
}
