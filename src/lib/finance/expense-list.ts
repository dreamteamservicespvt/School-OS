// The Expenses list (07 §2) as shown on screen and exported: the same filters
// read from the page address give the same rows, with the names filled in.
import "server-only";

import type { ExpenseStatus, Prisma } from "@prisma/client";
import type { Tx } from "../db";
import type { DayRange } from "../periods";
import { dateWhere } from "../periods";

const STATUSES = ["DRAFT", "WAITING", "APPROVED", "PAID", "CANCELLED"] as const;

export type ExpenseFilter = {
  q: string | null;
  range: DayRange | null;
  status: string | null;
  headId: string | null;
  costCentreId: string | null;
  /** Only amounts above this (paise). */
  abovePaise: bigint | null;
  vendorBills?: boolean;
  id?: string | null;
};

export const NO_FILTER: ExpenseFilter = { q: null, range: null, status: null, headId: null, costCentreId: null, abovePaise: null };

export function expenseWhere(f: ExpenseFilter): Prisma.ExpenseWhereInput {
  const q = f.q?.trim();
  return {
    ...(f.id ? { id: f.id } : {}),
    ...(f.range ? { date: dateWhere(f.range) } : {}),
    ...(f.status && (STATUSES as readonly string[]).includes(f.status) ? { status: f.status as ExpenseStatus } : {}),
    ...(f.headId ? { accountHeadId: f.headId } : {}),
    ...(f.costCentreId ? { costCentreId: f.costCentreId } : {}),
    ...(f.abovePaise ? { amountPaise: { gt: f.abovePaise } } : {}),
    ...(f.vendorBills ? { isVendorBill: true } : {}),
    ...(q ? { OR: [{ note: { contains: q, mode: "insensitive" } }, { number: { contains: q, mode: "insensitive" } }, { billNo: { contains: q, mode: "insensitive" } }] } : {}),
  };
}

/** A search also matches vendor names: their ids join the OR. */
async function withVendorSearch(tx: Tx, f: ExpenseFilter): Promise<Prisma.ExpenseWhereInput> {
  const where = expenseWhere(f);
  const q = f.q?.trim();
  if (!q) return where;
  const vendors = await tx.vendor.findMany({ where: { name: { contains: q, mode: "insensitive" } }, select: { id: true }, take: 50 });
  if (vendors.length && where.OR) where.OR = [...where.OR, { vendorId: { in: vendors.map((v) => v.id) } }];
  return where;
}

export async function expenseRows(tx: Tx, f: ExpenseFilter, take = 300) {
  const where = await withVendorSearch(tx, f);
  const [rows, count, paidSum] = await Promise.all([
    tx.expense.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take, include: { payments: { orderBy: { createdAt: "asc" } } } }),
    tx.expense.count({ where }),
    tx.expense.aggregate({ where: { ...where, status: { not: "CANCELLED" } }, _sum: { paidPaise: true } }),
  ]);
  const ids = (pick: (r: (typeof rows)[number]) => (string | null)[]) => [...new Set(rows.flatMap(pick).filter((x): x is string => Boolean(x)))];
  const [heads, vendors, centres, people, accounts] = await Promise.all([
    tx.accountHead.findMany({ where: { id: { in: ids((r) => [r.accountHeadId]) } }, select: { id: true, name: true, code: true } }),
    tx.vendor.findMany({ where: { id: { in: ids((r) => [r.vendorId]) } }, select: { id: true, name: true } }),
    tx.costCentre.findMany({ where: { id: { in: ids((r) => [r.costCentreId]) } }, select: { id: true, name: true } }),
    tx.userLogin.findMany({ where: { id: { in: ids((r) => [r.requestedById, r.approvedById, r.cancelledById, ...r.payments.map((p) => p.paidById)]) } }, select: { id: true, displayName: true } }),
    tx.bankAccount.findMany({ where: { id: { in: ids((r) => r.payments.map((p) => p.accountId)) } }, select: { id: true, name: true } }),
  ]);
  const head = new Map(heads.map((h) => [h.id, h]));
  const vendor = new Map(vendors.map((v) => [v.id, v.name]));
  const centre = new Map(centres.map((c) => [c.id, c.name]));
  const who = new Map(people.map((u) => [u.id, u.displayName]));
  const acc = new Map(accounts.map((a) => [a.id, a.name]));
  const name = (id: string | null) => (id && who.get(id)) || "";
  return {
    count,
    paid: paidSum._sum.paidPaise ?? BigInt(0),
    rows: rows.map((r) => {
      const live = r.payments.filter((p) => !p.cancelledAt);
      const last = live[live.length - 1] ?? null;
      return {
        ...r,
        headName: head.get(r.accountHeadId)?.name ?? "Expense",
        headCode: head.get(r.accountHeadId)?.code ?? "",
        vendorName: (r.vendorId && vendor.get(r.vendorId)) || "",
        costCentreName: (r.costCentreId && centre.get(r.costCentreId)) || "",
        requestedBy: name(r.requestedById),
        approvedBy: name(r.approvedById),
        cancelledBy: name(r.cancelledById),
        what: r.note || head.get(r.accountHeadId)?.name || "Expense",
        hasBill: Boolean(r.billFileId),
        lastPaid: last ? { date: last.date, mode: last.mode, reference: last.reference, account: acc.get(last.accountId) ?? "", by: name(last.paidById) } : null,
        payments: r.payments.map((p) => ({ ...p, account: acc.get(p.accountId) ?? "", by: name(p.paidById) })),
      };
    }),
  };
}
export type ExpenseRow = Awaited<ReturnType<typeof expenseRows>>["rows"][number];
