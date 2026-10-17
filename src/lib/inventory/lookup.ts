// Finding people and things at the store counter: students (the one student
// search, with their class this year), and the lists the issue and
// purchase forms offer. The store keeper has no Student Management access,
// so this reads only what the counter needs: name, admission number, class.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { currentYear } from "../academic/years";
import { findStudents } from "../students/find";
import { itemLabel } from "./items";
import { reorderOf, totalsFor } from "./stock";
import { qtyWords, stockState } from "./words";

export type CounterStudent = { id: string; name: string; admissionNo: string; cls: string; classId: string | null };

export async function studentsByIds(tx: Tx, ctx: SchoolContext, ids: string[]): Promise<CounterStudent[]> {
  if (!ids.length) return [];
  const year = await currentYear(tx, ctx);
  const students = await tx.student.findMany({ where: { id: { in: ids } }, select: { id: true, fullName: true, admissionNo: true } });
  const enrol = await tx.enrolment.findMany({ where: { studentId: { in: ids }, archivedAt: null, ...(year ? { academicYearId: year.id } : {}) }, select: { studentId: true, sectionId: true } });
  const sections = await tx.section.findMany({ where: { id: { in: enrol.map((e) => e.sectionId) } }, select: { id: true, name: true, classId: true, schoolClass: { select: { name: true } } } });
  return students.map((s) => {
    const e = enrol.find((x) => x.studentId === s.id);
    const sec = e ? sections.find((x) => x.id === e.sectionId) : null;
    return { id: s.id, name: s.fullName, admissionNo: s.admissionNo, cls: sec ? `${sec.schoolClass.name} ${sec.name}` : "", classId: sec?.classId ?? null };
  });
}

/**
 * Students studying now: the one student search (name with one letter wrong,
 * admission or roll number). Never by parents: the store keeper does not see them.
 */
export async function searchCounterStudents(tx: Tx, ctx: SchoolContext, q: string, take = 8) {
  const t = q.trim();
  if (t.length < 2) return [];
  const year = await currentYear(tx, ctx);
  const found = await findStudents(tx, t, { scope: {}, yearId: year?.id ?? null, byParent: false, take });
  const byId = new Map((await studentsByIds(tx, ctx, found.map((s) => s.id))).map((s) => [s.id, s]));
  return found.map((s) => byId.get(s.id)).filter((s): s is NonNullable<typeof s> => Boolean(s));
}

export type ItemOption = { value: string; label: string; code: string; unit: string; stock: number; price: string; lastPrice: string; state: string; tracksExpiry: boolean };

/** Every active item with its stock (all stores, or one), for the item pickers. */
export async function itemOptions(tx: Tx, locationId?: string | null): Promise<ItemOption[]> {
  const items = await tx.item.findMany({ where: { archivedAt: null }, include: { category: true }, orderBy: [{ name: "asc" }, { size: "asc" }] });
  const totals = locationId
    ? new Map((await tx.stockBalance.findMany({ where: { locationId } })).map((b) => [b.itemId, b.qty]))
    : await totalsFor(tx);
  const rupees = (p: bigint | null) => (p === null ? "" : (Number(p) / 100).toFixed(Number(p) % 100 ? 2 : 0));
  return items.map((i) => {
    const stock = totals.get(i.id) ?? 0;
    return { value: i.id, label: `${itemLabel(i)} (${i.code})`, code: i.code, unit: i.unit, stock, price: rupees(i.pricePaise), lastPrice: rupees(i.lastPricePaise ?? i.pricePaise), state: stockState(stock, reorderOf(i, i.category)), tracksExpiry: i.tracksExpiry };
  });
}

/** Stock by store for every item, for the issue form: itemId → { locationId: qty }. */
export async function stockByStore(tx: Tx) {
  const rows = await tx.stockBalance.findMany({ where: { qty: { gt: 0 } } });
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) (out[r.itemId] ??= {})[r.locationId] = r.qty;
  return out;
}

/** The sections of this year, as "Class 5 A", for the class pickers. */
export async function sectionOptions(tx: Tx, ctx: SchoolContext) {
  const year = await currentYear(tx, ctx);
  const sections = await tx.section.findMany({ where: { archivedAt: null, ...(year ? { academicYearId: year.id } : {}) }, select: { id: true, name: true, classId: true, schoolClass: { select: { name: true, sortOrder: true } } } });
  return sections
    .sort((a, b) => a.schoolClass.sortOrder - b.schoolClass.sortOrder || a.name.localeCompare(b.name))
    .map((s) => ({ value: s.id, label: `${s.schoolClass.name} ${s.name}`, classId: s.classId }));
}

export async function classOptions(tx: Tx, ctx: SchoolContext) {
  void ctx;
  const classes = await tx.schoolClass.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } });
  return classes.map((c) => ({ value: c.id, label: c.name }));
}

export async function staffOptions(tx: Tx) {
  const staff = await tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, designation: true } });
  return staff.map((s) => ({ value: s.id, label: `${s.fullName}${s.designation ? `, ${s.designation}` : ""}` }));
}

export async function departmentOptions(tx: Tx) {
  return (await tx.department.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } })).map((d) => ({ value: d.id, label: d.name }));
}

export async function roomOptions(tx: Tx) {
  const rooms = await tx.room.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return rooms.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map((r) => ({ value: r.id, label: r.name }));
}

export async function locationOptions(tx: Tx) {
  return (await tx.storeLocation.findMany({ where: { archivedAt: null }, orderBy: [{ isMain: "desc" }, { sortOrder: "asc" }, { name: "asc" }] })).map((l) => ({ value: l.id, label: l.name, isMain: l.isMain }));
}

export async function vendorOptions(tx: Tx) {
  return (await tx.vendor.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } })).map((v) => ({ value: v.id, label: v.name }));
}

export const stockWords = (o: Pick<ItemOption, "stock" | "unit">) => `${qtyWords(o.stock, o.unit)} in stock`;
