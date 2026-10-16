// The Inventory lists, shared by each page and its export so both show the
// same rows for the same search, filters and dates (P8): items with stock,
// stock movements, issues, purchase orders, bills, assets and maintenance
// requests. Every dated list takes the shared date filter.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "@/lib/db";
import { canDecide } from "@/lib/approvals";
import { dateWhere, momentWhere, type DayRange } from "@/lib/periods";
import { reorderOf } from "@/lib/inventory/stock";
import { billsWithState } from "@/lib/inventory/purchases";
import { placeNames } from "@/lib/inventory/assets";
import { billState, stockState, type MoveKind, type StockState } from "@/lib/inventory/words";

const ZERO = BigInt(0);
type Get = (k: string) => string;
const uuid = (v: string) => (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : "");

/** Login names for "by whom" columns. */
export async function whoNames(tx: Tx, ids: (string | null | undefined)[]) {
  const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (!list.length) return new Map<string, string>();
  const users = await tx.userLogin.findMany({ where: { id: { in: list } }, select: { id: true, displayName: true } });
  return new Map(users.map((u) => [u.id, u.displayName]));
}

/* ---------- Items ---------- */

export type ItemsFilter = { q: string; cat: string; state: "" | "low" | "out" | "ok"; store: string; lab: boolean; archived: boolean; range: DayRange | null };

export const readItemsFilter = (get: Get, range: DayRange | null): ItemsFilter => {
  const state = get("state");
  return { q: get("q").trim().slice(0, 80), cat: uuid(get("cat")), state: state === "low" || state === "out" || state === "ok" ? state : "", store: uuid(get("store")), lab: get("view") === "lab", archived: get("archived") === "1", range };
};

export type ItemRow = Awaited<ReturnType<typeof itemsList>>[number];

/** Items with their stock (all stores, or the chosen store), low and out of stock first. */
export async function itemsList(tx: Tx, f: ItemsFilter, tz: string) {
  const where: Prisma.ItemWhereInput = {
    archivedAt: f.archived ? { not: null } : null,
    ...(f.cat ? { categoryId: f.cat } : {}),
    ...(f.lab ? { category: { isLab: true } } : {}),
    ...(f.q ? { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { code: { contains: f.q, mode: "insensitive" } }, { size: { equals: f.q, mode: "insensitive" } }] } : {}),
    ...(f.range ? { createdAt: momentWhere(f.range, tz) } : {}),
  };
  const items = await tx.item.findMany({ where, include: { category: true }, orderBy: [{ name: "asc" }, { size: "asc" }], take: 5000 });
  const balances = items.length ? await tx.stockBalance.findMany({ where: { itemId: { in: items.map((i) => i.id) } } }) : [];
  const byItem = new Map<string, Map<string, number>>();
  for (const b of balances) {
    if (!byItem.has(b.itemId)) byItem.set(b.itemId, new Map());
    byItem.get(b.itemId)!.set(b.locationId, b.qty);
  }
  const rank: Record<StockState, number> = { OUT: 0, LOW: 1, OK: 2 };
  const rows = items.map((item) => {
    const stores = byItem.get(item.id) ?? new Map<string, number>();
    const total = [...stores.values()].reduce((a, q) => a + q, 0);
    const shown = f.store ? stores.get(f.store) ?? 0 : total;
    const reorder = reorderOf(item, item.category);
    const state = reorder > 0 || total <= 0 ? stockState(total, reorder) : "OK";
    return { item, stores, total, shown, reorder, state, value: (item.pricePaise ?? ZERO) * BigInt(Math.max(0, shown)) };
  });
  return rows
    .filter((r) => (!f.state ? true : f.state === "low" ? r.state !== "OK" : f.state === "out" ? r.state === "OUT" : r.state === "OK"))
    .filter((r) => !f.store || r.stores.has(f.store))
    .sort((a, b) => (f.archived ? 0 : rank[a.state] - rank[b.state]) || (a.state !== "OK" ? a.total - a.reorder - (b.total - b.reorder) : 0) || a.item.name.localeCompare(b.item.name));
}

/* ---------- Stock movements ---------- */

export type MovesFilter = { item: string; kind: string; store: string; q: string; range: DayRange | null };
export const MOVE_GROUPS: Record<string, MoveKind[]> = {
  in: ["OPENING", "IN", "RECEIVED", "RETURN"],
  out: ["OUT", "ISSUE"],
  transfer: ["TRANSFER_IN", "TRANSFER_OUT"],
  loss: ["DAMAGED", "LOST", "EXPIRED"],
  audit: ["AUDIT"],
};
export const readMovesFilter = (get: Get, range: DayRange | null): MovesFilter => ({ item: uuid(get("item")), kind: get("kind") in MOVE_GROUPS ? get("kind") : "", store: uuid(get("store")), q: get("q").trim().slice(0, 80), range });

export function movesWhere(f: MovesFilter): Prisma.StockMovementWhereInput {
  return {
    ...(f.item ? { itemId: f.item } : {}),
    ...(f.kind ? { kind: { in: MOVE_GROUPS[f.kind] } } : {}),
    ...(f.store ? { locationId: f.store } : {}),
    ...(f.q ? { OR: [{ reference: { contains: f.q, mode: "insensitive" } }, { reason: { contains: f.q, mode: "insensitive" } }, { item: { name: { contains: f.q, mode: "insensitive" } } }, { item: { code: { contains: f.q, mode: "insensitive" } } }] } : {}),
    ...(f.range ? { date: dateWhere(f.range) } : {}),
  };
}

export async function movesList(tx: Tx, f: MovesFilter, page: { skip: number; take: number }) {
  const where = movesWhere(f);
  const [total, rows] = await Promise.all([
    tx.stockMovement.count({ where }),
    tx.stockMovement.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], ...page, include: { item: { select: { id: true, name: true, code: true, unit: true, size: true } } } }),
  ]);
  const who = await whoNames(tx, rows.map((r) => r.createdById));
  return { total, rows, who };
}

/* ---------- Issues ---------- */

export type IssuesFilter = { to: string; open: boolean; sets: boolean; q: string; range: DayRange | null };
export const readIssuesFilter = (get: Get, range: DayRange | null): IssuesFilter => ({ to: ["STAFF", "DEPARTMENT", "CLASS", "STUDENT"].includes(get("to")) ? get("to") : "", open: get("open") === "1", sets: get("sets") === "1", q: get("q").trim().slice(0, 80), range });

/** Who each issue went to, in a few queries for the whole list. */
export async function recipients(tx: Tx, issues: { id: string; toKind: string; staffId: string | null; departmentId: string | null; sectionId: string | null; studentId: string | null; studentSectionId: string | null }[]) {
  const ids = (k: "staffId" | "departmentId" | "studentId") => [...new Set(issues.map((i) => i[k]).filter((x): x is string => Boolean(x)))];
  const secIds = [...new Set(issues.flatMap((i) => [i.sectionId, i.studentSectionId]).filter((x): x is string => Boolean(x)))];
  const [staff, depts, students, sections] = await Promise.all([
    tx.staff.findMany({ where: { id: { in: ids("staffId") } }, select: { id: true, fullName: true } }),
    tx.department.findMany({ where: { id: { in: ids("departmentId") } }, select: { id: true, name: true } }),
    tx.student.findMany({ where: { id: { in: ids("studentId") } }, select: { id: true, fullName: true, admissionNo: true } }),
    tx.section.findMany({ where: { id: { in: secIds } }, select: { id: true, name: true, schoolClass: { select: { name: true } } } }),
  ]);
  const st = new Map(staff.map((s) => [s.id, s.fullName]));
  const dp = new Map(depts.map((d) => [d.id, d.name]));
  const su = new Map(students.map((s) => [s.id, s]));
  const se = new Map(sections.map((s) => [s.id, `${s.schoolClass.name} ${s.name}`]));
  const out = new Map<string, string>();
  for (const i of issues) {
    if (i.toKind === "STAFF") out.set(i.id, st.get(i.staffId ?? "") ?? "Staff member");
    else if (i.toKind === "DEPARTMENT") out.set(i.id, `${dp.get(i.departmentId ?? "") ?? ""} department`.trim());
    else if (i.toKind === "CLASS") out.set(i.id, se.get(i.sectionId ?? "") ?? "Class");
    else {
      const s = su.get(i.studentId ?? "");
      const c = se.get(i.studentSectionId ?? "");
      out.set(i.id, `${s?.fullName ?? "Student"}${c ? `, ${c}` : ""}`);
    }
  }
  return out;
}

export async function issuesWhere(tx: Tx, f: IssuesFilter): Promise<Prisma.StockIssueWhereInput> {
  const and: Prisma.StockIssueWhereInput[] = [];
  if (f.to) and.push({ toKind: f.to as "STAFF" });
  if (f.sets) and.push({ bookSetId: { not: null } });
  if (f.range) and.push({ date: dateWhere(f.range) });
  if (f.open) {
    const open = await tx.$queryRaw<{ id: string }[]>`SELECT DISTINCT i.id FROM stock_issue i JOIN stock_issue_line l ON l.issue_id = i.id WHERE i.returnable AND l.returned_qty < l.qty`;
    and.push({ id: { in: open.map((o) => o.id) } });
  }
  if (f.q) {
    const [students, staff] = await Promise.all([
      tx.student.findMany({ where: { OR: [{ fullName: { contains: f.q, mode: "insensitive" } }, { admissionNo: { contains: f.q, mode: "insensitive" } }] }, select: { id: true }, take: 200 }),
      tx.staff.findMany({ where: { fullName: { contains: f.q, mode: "insensitive" } }, select: { id: true }, take: 200 }),
    ]);
    and.push({ OR: [{ number: { contains: f.q, mode: "insensitive" } }, { studentId: { in: students.map((s) => s.id) } }, { staffId: { in: staff.map((s) => s.id) } }, { lines: { some: { itemId: { in: (await tx.item.findMany({ where: { name: { contains: f.q, mode: "insensitive" } }, select: { id: true }, take: 200 })).map((i) => i.id) } } } }] });
  }
  return and.length ? { AND: and } : {};
}

export async function issuesList(tx: Tx, f: IssuesFilter, page: { skip: number; take: number }) {
  const where = await issuesWhere(tx, f);
  const [total, rows] = await Promise.all([
    tx.stockIssue.count({ where }),
    tx.stockIssue.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], ...page, include: { lines: true } }),
  ]);
  const items = new Map((await tx.item.findMany({ where: { id: { in: [...new Set(rows.flatMap((r) => r.lines.map((l) => l.itemId)))] } }, select: { id: true, name: true, size: true, unit: true } })).map((i) => [i.id, i]));
  const [to, who, sets] = await Promise.all([
    recipients(tx, rows),
    whoNames(tx, rows.map((r) => r.createdById)),
    tx.bookSet.findMany({ where: { id: { in: rows.map((r) => r.bookSetId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } }),
  ]);
  return { total, rows, items, to, who, sets: new Map(sets.map((s) => [s.id, s.name])) };
}

/* ---------- Purchase orders and bills ---------- */

export type OrdersFilter = { status: string; vendor: string; q: string; range: DayRange | null };
export const readOrdersFilter = (get: Get, range: DayRange | null): OrdersFilter => ({ status: get("status"), vendor: uuid(get("vendor")), q: get("q").trim().slice(0, 80), range });

export function ordersWhere(f: OrdersFilter): Prisma.PurchaseOrderWhereInput {
  const status = f.status === "open" ? { in: ["SENT", "PART_RECEIVED"] as ("SENT" | "PART_RECEIVED")[] } : ["WAITING", "SENT", "PART_RECEIVED", "RECEIVED", "CLOSED", "CANCELLED"].includes(f.status) ? (f.status as "SENT") : undefined;
  return { ...(status ? { status } : {}), ...(f.vendor ? { vendorId: f.vendor } : {}), ...(f.q ? { number: { contains: f.q, mode: "insensitive" } } : {}), ...(f.range ? { date: dateWhere(f.range) } : {}) };
}

export type BillsFilter = { status: string; vendor: string; range: DayRange | null };
export const readBillsFilter = (get: Get, range: DayRange | null): BillsFilter => ({ status: get("status"), vendor: uuid(get("vendor")), range });

export async function billsList(tx: Tx, f: BillsFilter) {
  const all = await billsWithState(tx, { vendorId: f.vendor || undefined, from: f.range ? new Date(`${f.range.from}T00:00:00Z`) : undefined, to: f.range ? new Date(`${f.range.to}T00:00:00Z`) : undefined });
  return all.filter((b) => {
    const st = b.expense ? billState(b.expense) : "CANCELLED";
    if (f.status === "unpaid") return st === "UNPAID" || st === "PART_PAID";
    if (f.status === "waiting") return st === "WAITING";
    if (f.status === "paid") return st === "PAID";
    if (f.status === "cancelled") return st === "CANCELLED";
    return true;
  });
}

/* ---------- Assets ---------- */

export type AssetsFilter = { q: string; type: string; status: string; room: string; cover: boolean; range: DayRange | null };
export const readAssetsFilter = (get: Get, range: DayRange | null): AssetsFilter => ({ q: get("q").trim().slice(0, 80), type: get("type").slice(0, 30), status: ["IN_USE", "IN_REPAIR", "DISPOSED"].includes(get("status")) ? get("status") : "", room: uuid(get("room")), cover: get("cover") === "ending", range });

export function assetsWhere(f: AssetsFilter, today: Date, days: number): Prisma.AssetWhereInput {
  const until = new Date(today.getTime() + days * 86_400_000);
  return {
    archivedAt: null,
    ...(f.q ? { OR: [{ tag: { contains: f.q, mode: "insensitive" } }, { name: { contains: f.q, mode: "insensitive" } }, { serialNo: { contains: f.q, mode: "insensitive" } }] } : {}),
    ...(f.type ? { type: f.type } : {}),
    ...(f.status ? { status: f.status as "IN_USE" } : {}),
    ...(f.room ? { roomId: f.room } : {}),
    ...(f.cover ? { status: { not: "DISPOSED" }, OR: [{ warrantyEnd: { gte: today, lte: until } }, { amcEnd: { gte: today, lte: until } }] } : {}),
    ...(f.range ? { purchaseDate: dateWhere(f.range) } : {}),
  };
}

export async function assetsList(tx: Tx, f: AssetsFilter, today: Date, days: number, page?: { skip: number; take: number }) {
  const where = assetsWhere(f, today, days);
  const [total, rows] = await Promise.all([
    tx.asset.count({ where }),
    tx.asset.findMany({ where, orderBy: [{ tag: "asc" }], ...(page ?? { skip: 0, take: 20000 }) }),
  ]);
  const places = await placeNames(tx, rows);
  return { total, rows, places };
}

/* ---------- Maintenance requests ---------- */

export type MaintFilter = { status: string; priority: string; room: string; range: DayRange | null };
export const readMaintFilter = (get: Get, range: DayRange | null): MaintFilter => ({ status: ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED", "open"].includes(get("status")) ? get("status") : "", priority: ["LOW", "NORMAL", "HIGH", "URGENT"].includes(get("priority")) ? get("priority") : "", room: uuid(get("room")), range });

export function maintWhere(f: MaintFilter, tz: string): Prisma.MaintenanceRequestWhereInput {
  return {
    ...(f.status === "open" ? { status: { in: ["OPEN", "IN_PROGRESS"] } } : f.status ? { status: f.status as "OPEN" } : {}),
    ...(f.priority ? { priority: f.priority as "LOW" } : {}),
    ...(f.room ? { roomId: f.room } : {}),
    ...(f.range ? { raisedAt: momentWhere(f.range, tz) } : {}),
  };
}

export async function maintList(tx: Tx, f: MaintFilter, tz: string, page?: { skip: number; take: number }) {
  const where = maintWhere(f, tz);
  const [total, rows] = await Promise.all([
    tx.maintenanceRequest.count({ where }),
    tx.maintenanceRequest.findMany({ where, orderBy: [{ raisedAt: "desc" }], ...(page ?? { skip: 0, take: 20000 }) }),
  ]);
  const [rooms, assets, techs, who] = await Promise.all([
    tx.room.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.roomId))] } }, select: { id: true, name: true } }),
    tx.asset.findMany({ where: { id: { in: rows.map((r) => r.assetId).filter((x): x is string => Boolean(x)) } }, select: { id: true, tag: true, name: true } }),
    tx.staff.findMany({ where: { id: { in: rows.map((r) => r.technicianStaffId).filter((x): x is string => Boolean(x)) } }, select: { id: true, fullName: true } }),
    whoNames(tx, rows.map((r) => r.raisedById)),
  ]);
  return { total, rows, rooms: new Map(rooms.map((r) => [r.id, r.name])), assets: new Map(assets.map((a) => [a.id, a])), techs: new Map(techs.map((t) => [t.id, t.fullName])), who };
}

/* ---------- Approvals this person decides ---------- */

/** Which of these approvals wait for this person (so the page shows Approve here). */
export async function decidable(tx: Tx, ctx: SchoolContext, ids: (string | null | undefined)[]) {
  const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const out = new Set<string>();
  if (!list.length || !ctx.userId) return out;
  const approvals = await tx.approval.findMany({ where: { id: { in: list } } });
  for (const a of approvals) if (await canDecide(tx, ctx, a)) out.add(a.id);
  return out;
}
