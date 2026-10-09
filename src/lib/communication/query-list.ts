import "server-only";

import type { Prisma, Query } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import type { ListParams } from "../list";

export const QUERY_FILTERS = ["status", "type", "priority", "owner", "overdue", "topic"] as const;

/** Default status filter: Open and In progress. */
export function queryListWhere(base: Prisma.QueryWhereInput, ctx: SchoolContext, p: ListParams, now = new Date()): Prisma.QueryWhereInput {
  const f = p.filters;
  const and: Prisma.QueryWhereInput[] = [base];
  if (p.q) and.push({ OR: [{ number: { contains: p.q, mode: "insensitive" } }, { fromName: { contains: p.q, mode: "insensitive" } }, { details: { contains: p.q, mode: "insensitive" } }, { fromPhone: { contains: p.q } }] });
  if (!f.status || f.status === "active") and.push({ status: { in: ["OPEN", "IN_PROGRESS"] } });
  else if (f.status !== "all") and.push({ status: f.status as Prisma.EnumQueryStatusFilter["equals"] });
  if (f.type) and.push({ type: f.type });
  if (f.priority) and.push({ priority: f.priority });
  if (f.topic) and.push({ topicId: f.topic });
  if (f.owner === "me") and.push({ ownerId: ctx.userId });
  else if (f.owner === "unassigned") and.push({ ownerId: null });
  else if (f.owner && /^[0-9a-f-]{36}$/.test(f.owner)) and.push({ OR: [{ ownerId: f.owner }, { departmentId: f.owner }] });
  if (f.overdue === "1") and.push({ dueBy: { lt: now }, status: { in: ["OPEN", "IN_PROGRESS"] } });
  return { AND: and };
}

/** Names for owners (people), departments, topics and the student a query is about. */
export async function queryLabels(tx: Tx, rows: Query[]) {
  const [users, depts, topics, students] = await Promise.all([
    tx.userLogin.findMany({ where: { id: { in: rows.map((r) => r.ownerId).filter(Boolean) as string[] } }, select: { id: true, displayName: true } }),
    tx.department.findMany({ where: { id: { in: rows.map((r) => r.departmentId).filter(Boolean) as string[] } }, select: { id: true, name: true } }),
    tx.queryTopic.findMany({ where: { id: { in: rows.map((r) => r.topicId).filter(Boolean) as string[] } }, select: { id: true, name: true } }),
    tx.student.findMany({ where: { id: { in: rows.map((r) => r.aboutStudentId).filter(Boolean) as string[] } }, select: { id: true, fullName: true } }),
  ]);
  const u = new Map(users.map((x) => [x.id, x.displayName]));
  const d = new Map(depts.map((x) => [x.id, x.name]));
  const t = new Map(topics.map((x) => [x.id, x.name]));
  const s = new Map(students.map((x) => [x.id, x.fullName]));
  return {
    owner: (q: Query) => (q.ownerId ? u.get(q.ownerId) ?? "Staff" : q.departmentId ? `${d.get(q.departmentId) ?? "Department"} (anyone)` : "Nobody"),
    topic: (q: Query) => (q.topicId ? t.get(q.topicId) ?? "" : ""),
    about: (q: Query) => (q.aboutStudentId ? s.get(q.aboutStudentId) ?? "" : ""),
  };
}

export function ageWords(from: Date, now = new Date()) {
  const h = Math.floor((now.getTime() - from.getTime()) / 3600_000);
  if (h < 1) return "Under an hour";
  if (h < 48) return `${h} ${h === 1 ? "hour" : "hours"}`;
  return `${Math.floor(h / 24)} days`;
}
