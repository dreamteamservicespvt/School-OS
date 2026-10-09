// Message History: one line per send, with delivered, read and failed counts.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import type { ListParams } from "../list";
import { localToUtc } from "./time";

export const HISTORY_FILTERS = ["channel", "status", "sender", "rule", "from", "to", "person"] as const;

export const MESSAGE_STATUS_LABEL: Record<string, string> = { SCHEDULED: "Scheduled", QUEUED: "Sending", SENT: "Sent", CANCELLED: "Cancelled" };
export const DELIVERY_LABEL: Record<string, string> = { QUEUED: "Queued", SENDING: "Queued", SENT: "Sent", DELIVERED: "Delivered", READ: "Read", FAILED: "Failed" };

/** Teachers and office staff with their own scope see what they sent; full access sees everything. */
export function historyWhere(ctx: SchoolContext, full: boolean, p: ListParams, timeZone: string): Prisma.MessageWhereInput {
  const f = p.filters;
  const and: Prisma.MessageWhereInput[] = [{ schoolId: ctx.schoolId }];
  if (!full) and.push({ sentById: ctx.userId });
  if (p.q) and.push({ OR: [{ title: { contains: p.q, mode: "insensitive" } }, { body: { contains: p.q, mode: "insensitive" } }, { audienceLabel: { contains: p.q, mode: "insensitive" } }, { trigger: { contains: p.q, mode: "insensitive" } }] });
  if (f.channel) and.push({ channels: { has: f.channel } });
  if (f.status === "failed") and.push({ recipients: { some: { status: "FAILED" } } });
  else if (f.status) and.push({ status: f.status as Prisma.EnumMessageStatusFilter["equals"] });
  if (f.sender === "me") and.push({ sentById: ctx.userId });
  if (f.sender === "rules") and.push({ ruleKey: { not: null } });
  if (f.sender === "people") and.push({ ruleKey: null, sourceType: null });
  if (f.sender === "notices") and.push({ sourceType: "Notice" });
  if (f.rule) and.push({ ruleKey: f.rule });
  const from = f.from ? localToUtc(`${f.from}T00:00`, timeZone) : null;
  const to = f.to ? localToUtc(`${f.to}T23:59`, timeZone) : null;
  if (from) and.push({ createdAt: { gte: from } });
  if (to) and.push({ createdAt: { lte: to } });
  if (f.person && /^(guardian|student|staff):[0-9a-f-]{36}$/.test(f.person)) {
    const [type, id] = f.person.split(":");
    and.push({ recipients: { some: type === "guardian" ? { guardianId: id } : type === "student" ? { studentId: id } : { staffId: id } } });
  }
  return { AND: and };
}

export type Counts = { total: number; delivered: number; read: number; failed: number; queued: number; backup: number };

/** Delivered counts include read; each person counted once per channel row. */
export async function countsFor(tx: Tx, ctx: SchoolContext, messageIds: string[]): Promise<Map<string, Counts>> {
  const rows = await tx.messageRecipient.groupBy({ by: ["messageId", "status", "isBackup"], where: { schoolId: ctx.schoolId, messageId: { in: messageIds } }, _count: { _all: true } });
  const out = new Map<string, Counts>();
  for (const id of messageIds) out.set(id, { total: 0, delivered: 0, read: 0, failed: 0, queued: 0, backup: 0 });
  for (const r of rows) {
    const c = out.get(r.messageId)!;
    const n = r._count._all;
    if (r.isBackup) { c.backup += n; continue; }
    c.total += n;
    if (r.status === "DELIVERED" || r.status === "READ") c.delivered += n;
    if (r.status === "READ") c.read += n;
    if (r.status === "FAILED") c.failed += n;
    if (r.status === "QUEUED" || r.status === "SENDING") c.queued += n;
  }
  return out;
}

export async function senderNames(tx: Tx, ids: (string | null)[]) {
  const list = [...new Set(ids.filter(Boolean) as string[])];
  const users = list.length ? await tx.userLogin.findMany({ where: { id: { in: list } }, select: { id: true, displayName: true } }) : [];
  return new Map(users.map((u) => [u.id, u.displayName]));
}
