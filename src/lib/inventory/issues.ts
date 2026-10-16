// Issue Stock (14 §2): items given to a staff member, department or class,
// and books and uniforms sold to students at the store counter, where the
// charge is added to the student's fees in Fee Management (06 §4). A book
// set is issued in one step: every item's stock goes down and the set price
// goes to the fees; items out of stock are listed first and the set can go
// without them only when the person chooses (and the settings allow), to be
// given later. Nobody can issue more than the store holds. Returnable issues
// come back with a Return movement.
import "server-only";

import type { IssueTo, Prisma, StockIssue } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatRupees } from "../format";
import { nextNumber, formatNumber } from "../sequences";
import { addCharge } from "../fees/structure";
import { currentYear } from "../academic/years";
import { InventoryProblem } from "./problem";
import { inventorySettings } from "./settings";
import { balanceOf, move, notEnough, usableBatches } from "./stock";
import { itemLabel } from "./items";
import { qtyWords } from "./words";

export const STORE_FEE_HEAD_KEY = "store-charges";
/** Students who can be issued items (studying in the school). */
export const STUDYING: readonly string[] = ["ACTIVE", "ADMITTED", "PROMOTED"];
const ZERO = BigInt(0);

/** The "Books and uniforms" fee head store-counter charges go to (made the first time). */
export async function storeFeeHead(tx: Tx, ctx: SchoolContext) {
  const found = await tx.feeHead.findFirst({ where: { OR: [{ systemKey: STORE_FEE_HEAD_KEY }, { name: { equals: "Books and uniforms", mode: "insensitive" } }] } });
  if (found) {
    if (found.archivedAt || found.systemKey !== STORE_FEE_HEAD_KEY) await tx.feeHead.update({ where: { id: found.id }, data: { archivedAt: null, systemKey: STORE_FEE_HEAD_KEY } });
    return found;
  }
  return tx.feeHead.create({ data: { schoolId: ctx.schoolId, name: "Books and uniforms", kind: "miscellaneous", systemKey: STORE_FEE_HEAD_KEY, lateFeeApplies: false, sortOrder: 920, createdById: ctx.userId } });
}

export type IssueLine = { itemId: string; qty: number };
export type Recipient = { toKind: IssueTo; staffId?: string | null; departmentId?: string | null; sectionId?: string | null; studentId?: string | null };

/** The year a store charge belongs to: the student's enrolment in the current year (not a closed past year). */
async function chargeYear(tx: Tx, ctx: SchoolContext, studentId: string) {
  return (await studentSection(tx, ctx, studentId))?.academicYearId;
}

/** Who an issue is to, in words: "Kiran Rao (staff)", "Science department", "Class 5 A", "Meena Reddy, Class 5 A". */
export async function recipientWords(tx: Tx, r: Pick<StockIssue, "toKind" | "staffId" | "departmentId" | "sectionId" | "studentId" | "studentSectionId">) {
  if (r.toKind === "STAFF" && r.staffId) return (await tx.staff.findFirst({ where: { id: r.staffId }, select: { fullName: true } }))?.fullName ?? "Staff member";
  if (r.toKind === "DEPARTMENT" && r.departmentId) return `${(await tx.department.findFirst({ where: { id: r.departmentId }, select: { name: true } }))?.name ?? ""} department`.trim();
  if (r.toKind === "CLASS" && r.sectionId) {
    const s = await tx.section.findFirst({ where: { id: r.sectionId }, select: { name: true, schoolClass: { select: { name: true } } } });
    return s ? `${s.schoolClass.name} ${s.name}` : "Class";
  }
  if (r.toKind === "STUDENT" && r.studentId) {
    const st = await tx.student.findFirst({ where: { id: r.studentId }, select: { fullName: true } });
    const s = r.studentSectionId ? await tx.section.findFirst({ where: { id: r.studentSectionId }, select: { name: true, schoolClass: { select: { name: true } } } }) : null;
    return `${st?.fullName ?? "Student"}${s ? `, ${s.schoolClass.name} ${s.name}` : ""}`;
  }
  return "";
}

/** The student's section this year (for reports by class), or their latest. */
async function studentSection(tx: Tx, ctx: SchoolContext, studentId: string) {
  const year = await currentYear(tx, ctx);
  const e = await tx.enrolment.findFirst({ where: { studentId, archivedAt: null, ...(year ? { academicYearId: year.id } : {}) }, orderBy: { createdAt: "desc" } })
    ?? await tx.enrolment.findFirst({ where: { studentId, archivedAt: null }, orderBy: { createdAt: "desc" } });
  return e;
}

async function checkRecipient(tx: Tx, ctx: SchoolContext, r: Recipient) {
  switch (r.toKind) {
    case "STAFF":
      if (!r.staffId || !(await tx.staff.findFirst({ where: { id: r.staffId, archivedAt: null } }))) throw new InventoryProblem("Choose the staff member.", "staffId");
      return { staffId: r.staffId };
    case "DEPARTMENT":
      if (!r.departmentId || !(await tx.department.findFirst({ where: { id: r.departmentId, archivedAt: null } }))) throw new InventoryProblem("Choose the department.", "departmentId");
      return { departmentId: r.departmentId };
    case "CLASS":
      if (!r.sectionId || !(await tx.section.findFirst({ where: { id: r.sectionId, archivedAt: null } }))) throw new InventoryProblem("Choose the class.", "sectionId");
      return { sectionId: r.sectionId };
    case "STUDENT": {
      const st = r.studentId ? await tx.student.findFirst({ where: { id: r.studentId, archivedAt: null } }) : null;
      if (!st) throw new InventoryProblem("Choose the student.", "studentId");
      if (!STUDYING.includes(st.status)) throw new InventoryProblem(`${st.fullName} is not studying in the school now.`, "studentId");
      const e = await studentSection(tx, ctx, st.id);
      return { studentId: st.id, studentSectionId: e?.sectionId ?? null };
    }
  }
}

/** Refuses a line that is more than the store holds (or expired), naming the item and the stock. */
async function checkStock(tx: Tx, locationId: string, l: IssueLine, today: Date) {
  const item = await tx.item.findFirst({ where: { id: l.itemId, archivedAt: null } });
  if (!item) throw new InventoryProblem("Choose the items from the list.", "lines");
  const have = item.tracksExpiry ? (await usableBatches(tx, item.id, locationId, today)).reduce((a, b) => a + b.qty, 0) : await balanceOf(tx, item.id, locationId);
  return { item, have, short: have < l.qty };
}

export type IssueInput = Recipient & { locationId: string; lines: IssueLine[]; chargeToFees: boolean; returnable: boolean; note: string | null; date: Date; today: Date };

/**
 * Issues items from one store. For a student with "Charge to student's fees"
 * on, the items' prices are added to their fees as one charge.
 */
export async function issueStock(tx: Tx, ctx: SchoolContext, input: IssueInput) {
  if (!input.lines.length) throw new InventoryProblem("Add at least one item.", "lines");
  const loc = await tx.storeLocation.findFirst({ where: { id: input.locationId, archivedAt: null } });
  if (!loc) throw new InventoryProblem("Choose the store the items come from.", "locationId");
  const who = await checkRecipient(tx, ctx, input);
  const checked = [];
  for (const l of input.lines) {
    const c = await checkStock(tx, loc.id, l, input.today);
    // 14 §5 "Issuing more than in stock": blocked, with the stock shown.
    if (c.short) throw new InventoryProblem(await notEnough(tx, c.item, loc.id, c.have, input.today), "lines");
    checked.push({ ...c, qty: l.qty });
  }
  const charging = input.toKind === "STUDENT" && input.chargeToFees;
  if (charging) {
    const free = checked.filter((c) => c.item.pricePaise === null || c.item.pricePaise <= ZERO);
    if (free.length) throw new InventoryProblem(`${itemLabel(free[0].item)} has no price. Set its price, or turn off “Charge to student's fees” for a free issue.`, "chargeToFees");
  }
  const total = charging ? checked.reduce((a, c) => a + (c.item.pricePaise ?? ZERO) * BigInt(c.qty), ZERO) : ZERO;
  const n = await nextNumber(tx, ctx, "inventory-issue");
  const issue = await tx.stockIssue.create({
    data: {
      schoolId: ctx.schoolId, number: formatNumber("ISS-", n, 5), date: input.date, toKind: input.toKind, ...who, locationId: loc.id, returnable: input.returnable && !charging,
      chargePaise: total, note: input.note?.trim() || null, createdById: ctx.userId,
      lines: { create: checked.map((c) => ({ schoolId: ctx.schoolId, itemId: c.item.id, qty: c.qty, unitPricePaise: c.item.pricePaise ?? ZERO })) },
    },
  });
  const to = await recipientWords(tx, issue);
  for (const c of checked) await move(tx, ctx, { itemId: c.item.id, locationId: loc.id, kind: "ISSUE", qty: -c.qty, date: input.date, reference: `${issue.number} to ${to}`, issueId: issue.id, unitCostPaise: c.item.pricePaise, today: input.today });
  let feeDueId: string | null = null;
  if (charging && total > ZERO) {
    const head = await storeFeeHead(tx, ctx);
    const words = checked.map((c) => `${itemLabel(c.item)} × ${c.qty}`).join(", ");
    const due = await addCharge(tx, ctx, {
      studentId: input.studentId!, feeHeadId: head.id, amountPaise: total, dueDate: input.date,
      label: `Store: ${words}`.slice(0, 120), reason: `Store counter issue ${issue.number}: ${words}`.slice(0, 300), academicYearId: await chargeYear(tx, ctx, input.studentId!),
    });
    feeDueId = due.id;
    await tx.stockIssue.update({ where: { id: issue.id }, data: { feeDueId } });
  }
  await writeAudit(tx, ctx, { action: "issued", recordType: "Stock Issue", recordId: issue.id, after: { number: issue.number, to, store: loc.name, lines: checked.map((c) => `${c.item.code} × ${c.qty}`), charge: total > ZERO ? formatRupees(total) : null, returnable: issue.returnable } });
  return { issue: { ...issue, feeDueId }, to, total };
}

/* ---------- Book sets ---------- */

export type SetInput = { id: string | null; name: string; classIds: string[]; items: IssueLine[]; pricePaise: bigint | null };

/** The total of the item prices in a set (the default set price). */
export async function setItemsTotal(tx: Tx, items: IssueLine[]) {
  const rows = await tx.item.findMany({ where: { id: { in: items.map((i) => i.itemId) } }, select: { id: true, pricePaise: true } });
  return items.reduce((a, i) => a + (rows.find((r) => r.id === i.itemId)?.pricePaise ?? ZERO) * BigInt(i.qty), ZERO);
}

export async function saveBookSet(tx: Tx, ctx: SchoolContext, input: SetInput) {
  const s = await inventorySettings(tx, ctx);
  if (!s.bookSetsOn) throw new InventoryProblem("Book sets are switched off in Inventory Settings.");
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 3) throw new InventoryProblem("Give the set a name, for example “Class 5 book set 2026-27”.", "name");
  if (name.length > 80) throw new InventoryProblem("The name can be at most 80 characters.", "name");
  if (input.items.length < 2) throw new InventoryProblem("A set needs at least 2 items.", "lines");
  const found = await tx.item.findMany({ where: { id: { in: input.items.map((i) => i.itemId) }, archivedAt: null } });
  if (found.length !== input.items.length) throw new InventoryProblem("Choose the items from the list.", "lines");
  const classIds = [...new Set(input.classIds)];
  if (classIds.length && (await tx.schoolClass.count({ where: { id: { in: classIds } } })) !== classIds.length) throw new InventoryProblem("Choose the classes from the list.", "classIds");
  const price = input.pricePaise ?? (await setItemsTotal(tx, input.items));
  if (price <= ZERO) throw new InventoryProblem("The set price must be more than ₹0. Set the item prices, or type the set price.", "price");
  const clash = await tx.bookSet.findFirst({ where: { name: { equals: name, mode: "insensitive" }, archivedAt: null, ...(input.id ? { id: { not: input.id } } : {}) } });
  if (clash) throw new InventoryProblem(`There is already a set called ${clash.name}.`, "name");
  let set;
  if (input.id) {
    const before = await tx.bookSet.findFirst({ where: { id: input.id, archivedAt: null }, include: { items: true } });
    if (!before) throw new InventoryProblem("This set was not found.");
    set = await tx.bookSet.update({ where: { id: before.id }, data: { name, classIds, pricePaise: price } });
    // Items are kept as rows: changed by replacing the quantities (the set's issues keep their own lines).
    for (const old of before.items) if (!input.items.some((i) => i.itemId === old.itemId)) await tx.bookSetItem.update({ where: { id: old.id }, data: { qty: 0 } });
    for (const i of input.items) {
      await tx.bookSetItem.upsert({ where: { setId_itemId: { setId: set.id, itemId: i.itemId } }, create: { schoolId: ctx.schoolId, setId: set.id, itemId: i.itemId, qty: i.qty }, update: { qty: i.qty } });
    }
    await writeAudit(tx, ctx, { action: "updated", recordType: "Book Set", recordId: set.id, before: { name: before.name, price: formatRupees(before.pricePaise), items: before.items.filter((x) => x.qty > 0).length }, after: { name, price: formatRupees(price), items: input.items.length } });
  } else {
    set = await tx.bookSet.create({ data: { schoolId: ctx.schoolId, name, classIds, pricePaise: price, createdById: ctx.userId, items: { create: input.items.map((i) => ({ schoolId: ctx.schoolId, itemId: i.itemId, qty: i.qty })) } } });
    await writeAudit(tx, ctx, { action: "created", recordType: "Book Set", recordId: set.id, after: { name, price: formatRupees(price), items: input.items.length, classes: classIds.length } });
  }
  return set;
}

export async function archiveBookSet(tx: Tx, ctx: SchoolContext, setId: string) {
  const set = await tx.bookSet.findFirst({ where: { id: setId, archivedAt: null } });
  if (!set) throw new InventoryProblem("This set was not found.");
  await tx.bookSet.update({ where: { id: set.id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Book Set", recordId: set.id, before: { name: set.name } });
}

/** A set's items (quantity above 0) with the stock in one store. */
export async function setLines(tx: Tx, setId: string, locationId: string | null, today: Date) {
  const rows = await tx.bookSetItem.findMany({ where: { setId, qty: { gt: 0 } } });
  const items = await tx.item.findMany({ where: { id: { in: rows.map((r) => r.itemId) } } });
  const out = [];
  for (const r of rows) {
    const item = items.find((i) => i.id === r.itemId);
    if (!item) continue;
    let have = 0;
    if (locationId) have = item.tracksExpiry ? (await usableBatches(tx, item.id, locationId, today)).reduce((a, b) => a + b.qty, 0) : await balanceOf(tx, item.id, locationId);
    out.push({ item, qty: r.qty, have, short: have < r.qty });
  }
  return out.sort((a, b) => a.item.name.localeCompare(b.item.name));
}

/** How many full sets the stock in one store can make. */
export const fullSets = (lines: { qty: number; have: number }[]) => (lines.length ? Math.min(...lines.map((l) => Math.floor(l.have / l.qty))) : 0);

/**
 * Issues a book set to a student in one step (Done when 10). Items out of
 * stock are listed first: "2 of 9 items are out of stock". With "issue the
 * rest" chosen (and allowed in the settings) the set goes without them; they
 * are kept on the issue to give later. The set price goes to the fees.
 */
export async function issueBookSet(tx: Tx, ctx: SchoolContext, input: { setId: string; studentId: string; locationId: string; chargeToFees: boolean; allowMissing: boolean; note: string | null; date: Date; today: Date }) {
  const s = await inventorySettings(tx, ctx);
  if (!s.bookSetsOn) throw new InventoryProblem("Book sets are switched off in Inventory Settings.");
  const set = await tx.bookSet.findFirst({ where: { id: input.setId, archivedAt: null } });
  if (!set) throw new InventoryProblem("Choose the set.", "setId");
  const loc = await tx.storeLocation.findFirst({ where: { id: input.locationId, archivedAt: null } });
  if (!loc) throw new InventoryProblem("Choose the store the set comes from.", "locationId");
  const who = await checkRecipient(tx, ctx, { toKind: "STUDENT", studentId: input.studentId });
  const lines = await setLines(tx, set.id, loc.id, input.today);
  if (!lines.length) throw new InventoryProblem("This set has no items.", "setId");
  const missing = lines.filter((l) => l.short);
  if (missing.length) {
    const names = missing.map((l) => `${itemLabel(l.item)} (${l.have} of ${l.qty})`).join(", ");
    if (!input.allowMissing) throw new InventoryProblem(`${missing.length} of ${lines.length} items are out of stock: ${names}. Issue the rest and give the missing items later, or wait.`, "missing");
    if (!s.setsWithMissing) throw new InventoryProblem(`${missing.length} of ${lines.length} items are out of stock: ${names}. Inventory Settings do not allow a set to go with items missing.`, "missing");
    if (missing.length === lines.length) throw new InventoryProblem("Every item of this set is out of stock in this store.", "missing");
  }
  const giving = lines.filter((l) => !l.short);
  const n = await nextNumber(tx, ctx, "inventory-issue");
  const charge = input.chargeToFees ? set.pricePaise : ZERO;
  const issue = await tx.stockIssue.create({
    data: {
      schoolId: ctx.schoolId, number: formatNumber("ISS-", n, 5), date: input.date, toKind: "STUDENT", ...who, locationId: loc.id, bookSetId: set.id,
      missing: missing.map((l) => ({ itemId: l.item.id, qty: l.qty })) as Prisma.InputJsonValue, chargePaise: charge, note: input.note?.trim() || null, createdById: ctx.userId,
      lines: { create: giving.map((l) => ({ schoolId: ctx.schoolId, itemId: l.item.id, qty: l.qty, unitPricePaise: l.item.pricePaise ?? ZERO })) },
    },
  });
  const to = await recipientWords(tx, issue);
  for (const l of giving) await move(tx, ctx, { itemId: l.item.id, locationId: loc.id, kind: "ISSUE", qty: -l.qty, date: input.date, reference: `${issue.number}: ${set.name} to ${to}`, issueId: issue.id, today: input.today });
  let feeDueId: string | null = null;
  if (charge > ZERO) {
    const head = await storeFeeHead(tx, ctx);
    const due = await addCharge(tx, ctx, { studentId: input.studentId, feeHeadId: head.id, amountPaise: charge, dueDate: input.date, label: set.name.slice(0, 120), reason: `Book set issued at the store counter (${issue.number})`, academicYearId: await chargeYear(tx, ctx, input.studentId) });
    feeDueId = due.id;
    await tx.stockIssue.update({ where: { id: issue.id }, data: { feeDueId } });
  }
  await writeAudit(tx, ctx, { action: "issued-set", recordType: "Stock Issue", recordId: issue.id, after: { number: issue.number, set: set.name, to, charge: charge > ZERO ? formatRupees(charge) : null, missing: missing.map((l) => l.item.code) } });
  return { issue: { ...issue, feeDueId }, to, set, missing: missing.map((l) => l.item), given: giving.length };
}

/** Gives the items a set went without, now that they are in stock (no further charge). */
export async function giveMissing(tx: Tx, ctx: SchoolContext, issueId: string, today: Date) {
  const issue = await tx.stockIssue.findFirst({ where: { id: issueId } });
  if (!issue) throw new InventoryProblem("This issue was not found.");
  const missing = (issue.missing as IssueLine[]) ?? [];
  if (!missing.length) throw new InventoryProblem("Nothing is left to give on this issue.");
  const still: IssueLine[] = [];
  const given: IssueLine[] = [];
  for (const m of missing) {
    const c = await checkStock(tx, issue.locationId, m, today);
    if (c.short) still.push(m);
    else given.push(m);
  }
  if (!given.length) {
    const names = await tx.item.findMany({ where: { id: { in: missing.map((m) => m.itemId) } }, select: { name: true } });
    throw new InventoryProblem(`Still out of stock: ${names.map((x) => x.name).join(", ")}.`);
  }
  for (const g of given) {
    await tx.stockIssueLine.create({ data: { schoolId: ctx.schoolId, issueId: issue.id, itemId: g.itemId, qty: g.qty } });
    await move(tx, ctx, { itemId: g.itemId, locationId: issue.locationId, kind: "ISSUE", qty: -g.qty, date: today, reference: `${issue.number}: missing item given`, issueId: issue.id, today });
  }
  await tx.stockIssue.update({ where: { id: issue.id }, data: { missing: still as Prisma.InputJsonValue } });
  await writeAudit(tx, ctx, { action: "gave-missing", recordType: "Stock Issue", recordId: issue.id, after: { given: given.length, stillMissing: still.length } });
  return { given: given.length, still: still.length };
}

/** A returnable item came back (part or all of a line). */
export async function returnIssued(tx: Tx, ctx: SchoolContext, input: { lineId: string; qty: number; note: string | null; date: Date; today: Date }) {
  const line = await tx.stockIssueLine.findFirst({ where: { id: input.lineId }, include: { issue: true } });
  if (!line) throw new InventoryProblem("This issue was not found.");
  if (!line.issue.returnable) throw new InventoryProblem("This issue was not marked returnable. Record the items with Stock in instead.");
  const left = line.qty - line.returnedQty;
  if (left <= 0) throw new InventoryProblem("Everything on this line is already back.");
  if (!Number.isInteger(input.qty) || input.qty < 1) throw new InventoryProblem("The quantity must be at least 1.", "qty");
  if (input.qty > left) throw new InventoryProblem(`Only ${left} of this line ${left === 1 ? "is" : "are"} still out.`, "qty");
  await move(tx, ctx, { itemId: line.itemId, locationId: line.issue.locationId, kind: "RETURN", qty: input.qty, date: input.date, reference: `${line.issue.number} returned`, reason: input.note, issueId: line.issueId, today: input.today });
  await tx.stockIssueLine.update({ where: { id: line.id }, data: { returnedQty: { increment: input.qty } } });
  const item = await tx.item.findFirstOrThrow({ where: { id: line.itemId } });
  await writeAudit(tx, ctx, { action: "returned", recordType: "Stock Issue", recordId: line.issueId, after: { item: item.code, qty: input.qty, note: input.note } });
  return { item, qty: input.qty, left: left - input.qty, words: qtyWords(input.qty, item.unit) };
}

/** Returnable items still out with a person (for clearance): staff or student. */
export async function itemsHeldBy(tx: Tx, who: { staffId?: string; studentId?: string }) {
  const lines = await tx.stockIssueLine.findMany({ where: { issue: { returnable: true, ...(who.staffId ? { staffId: who.staffId } : { studentId: who.studentId }) } }, include: { issue: { select: { number: true } } } });
  return lines.filter((l) => l.qty > l.returnedQty);
}
