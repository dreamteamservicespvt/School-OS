// The Income list (07 §2) as shown on screen and exported: the same filters
// read from the page address give the same rows.
import "server-only";

import type { IncomeStatus, Prisma } from "@prisma/client";
import type { Tx } from "../db";
import type { DayRange } from "../periods";
import { dateWhere } from "../periods";

export type IncomeFilter = { q: string | null; range: DayRange | null; status: string | null; headId: string | null; mode: string | null; id?: string | null };

export function incomeWhere(f: IncomeFilter): Prisma.IncomeWhereInput {
  const q = f.q?.trim();
  return {
    ...(f.id ? { id: f.id } : {}),
    ...(f.range ? { date: dateWhere(f.range) } : {}),
    ...(f.status && ["DRAFT", "POSTED", "CANCELLED"].includes(f.status) ? { status: f.status as IncomeStatus } : {}),
    ...(f.headId ? { accountHeadId: f.headId } : {}),
    ...(f.mode ? { mode: f.mode } : {}),
    ...(q ? { OR: [{ receivedFrom: { contains: q, mode: "insensitive" } }, { receiptNo: { contains: q, mode: "insensitive" } }, { note: { contains: q, mode: "insensitive" } }] } : {}),
  };
}

export async function incomeRows(tx: Tx, f: IncomeFilter, take = 300) {
  const where = incomeWhere(f);
  const [rows, count, postedSum] = await Promise.all([
    tx.income.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take }),
    tx.income.count({ where }),
    tx.income.aggregate({ where: { ...where, status: "POSTED" }, _sum: { amountPaise: true } }),
  ]);
  const [heads, accounts, people] = await Promise.all([
    tx.accountHead.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.accountHeadId))] } }, select: { id: true, name: true, code: true } }),
    tx.bankAccount.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.accountId))] } }, select: { id: true, name: true } }),
    tx.userLogin.findMany({ where: { id: { in: [...new Set(rows.flatMap((r) => [r.recordedById, r.cancelledById]).filter((x): x is string => Boolean(x)))] } }, select: { id: true, displayName: true } }),
  ]);
  const head = new Map(heads.map((h) => [h.id, h]));
  const acc = new Map(accounts.map((a) => [a.id, a.name]));
  const who = new Map(people.map((u) => [u.id, u.displayName]));
  return {
    count,
    posted: postedSum._sum.amountPaise ?? BigInt(0),
    rows: rows.map((r) => ({
      ...r,
      headName: head.get(r.accountHeadId)?.name ?? "Income",
      headCode: head.get(r.accountHeadId)?.code ?? "",
      accountName: acc.get(r.accountId) ?? "",
      recordedBy: (r.recordedById && who.get(r.recordedById)) || "",
      cancelledBy: (r.cancelledById && who.get(r.cancelledById)) || "",
    })),
  };
}
export type IncomeRow = Awaited<ReturnType<typeof incomeRows>>["rows"][number];
