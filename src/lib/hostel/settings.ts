// Hostel Settings (15 §6): hostel rules, roll call times, the outing back-by
// default, visiting hours, meals and the parent messages and alerts; the
// hostels themselves with their floors and wardens; and hostel fee plans,
// whose installments become the student's hostel fees in Fee Management.
// One settings row per school, made with the defaults on first use.
import "server-only";

import type { HostelSetting } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatRupees } from "../format";
import { assertYearOpen, currentYears } from "../academic/years";
import { HostelProblem } from "./problem";
import { DEFAULT_MEALS, GENDER, minuteWords, type Gender } from "./words";

export type HostelSettings = HostelSetting;

/** The school's Hostel Settings, made with the defaults the first time. */
export async function hostelSettings(tx: Tx, ctx: SchoolContext): Promise<HostelSettings> {
  const s = await tx.hostelSetting.findUnique({ where: { schoolId: ctx.schoolId } });
  if (s) return s;
  return tx.hostelSetting.upsert({ where: { schoolId: ctx.schoolId }, create: { schoolId: ctx.schoolId, meals: DEFAULT_MEALS }, update: {} });
}

async function saveSetting(tx: Tx, ctx: SchoolContext, what: string, data: Partial<Omit<HostelSetting, "schoolId" | "updatedAt">>) {
  const before = await hostelSettings(tx, ctx);
  const after = await tx.hostelSetting.update({ where: { schoolId: ctx.schoolId }, data: { ...data, updatedById: ctx.userId } });
  const pick = (o: object) => Object.fromEntries(Object.keys(data).map((k) => [k, (o as Record<string, unknown>)[k]]));
  await writeAudit(tx, ctx, { action: "changed-settings", recordType: "Hostel Setting", recordId: ctx.schoolId, before: { what, ...pick(before) }, after: pick(after) as never });
  return after;
}

export async function saveRules(tx: Tx, ctx: SchoolContext, rules: string) {
  if (rules.length > 4000) throw new HostelProblem("Hostel rules can be at most 4,000 characters.", "rules");
  return saveSetting(tx, ctx, "rules", { rules });
}

export type TimingsInput = { morningRollMinute: number; nightRollMinute: number; outingBackMinute: number; visitingDays: number[]; visitingFromMinute: number; visitingToMinute: number; lateAfterMinutes: number };

export async function saveTimings(tx: Tx, ctx: SchoolContext, t: TimingsInput) {
  if (t.morningRollMinute >= 12 * 60) throw new HostelProblem("Morning roll call must be before noon.", "morning");
  if (t.nightRollMinute < 17 * 60) throw new HostelProblem("Night roll call must be in the evening, after 5:00 PM.", "night");
  if (t.visitingToMinute <= t.visitingFromMinute) throw new HostelProblem(`Visiting hours must end after they start (${minuteWords(t.visitingFromMinute)}).`, "visitTo");
  if (!t.visitingDays.length) throw new HostelProblem("Choose at least one visiting day.", "visitingDays");
  if (t.lateAfterMinutes < 0 || t.lateAfterMinutes > 180) throw new HostelProblem("The late alert can wait 0 to 180 minutes.", "lateAfter");
  return saveSetting(tx, ctx, "timings", { ...t, visitingDays: [...new Set(t.visitingDays)].sort() });
}

export async function saveMeals(tx: Tx, ctx: SchoolContext, meals: string[]) {
  const clean = [...new Map(meals.map((m) => m.trim().replace(/\s+/g, " ")).filter(Boolean).map((m) => [m.toLowerCase(), m])).values()];
  if (!clean.length) throw new HostelProblem("Keep at least one meal.", "meals");
  if (clean.length > 8) throw new HostelProblem("At most 8 meals a day.", "meals");
  if (clean.some((m) => m.length > 30)) throw new HostelProblem("A meal name can be at most 30 characters.", "meals");
  return saveSetting(tx, ctx, "meals", { meals: clean });
}

export type MessagesInput = Pick<HostelSetting, "messageOnOut" | "messageOnReturn" | "messageOnLate" | "messageOnIncident" | "alertNightAbsent" | "alertLate">;
export async function saveMessages(tx: Tx, ctx: SchoolContext, m: MessagesInput) {
  return saveSetting(tx, ctx, "messages", m);
}

/* ---------- Hostels and floors ---------- */

export type HostelInput = { name: string; gender: Gender; floors: string[]; note: string | null };

function cleanFloors(floors: string[]) {
  const out = [...new Map(floors.map((f) => f.trim().replace(/\s+/g, " ")).filter(Boolean).map((f) => [f.toLowerCase(), f])).values()];
  if (!out.length) throw new HostelProblem("Add at least one floor, such as Ground.", "floors");
  if (out.length > 20) throw new HostelProblem("At most 20 floors.", "floors");
  if (out.some((f) => f.length > 30)) throw new HostelProblem("A floor name can be at most 30 characters.", "floors");
  return out;
}

export async function addHostel(tx: Tx, ctx: SchoolContext, input: HostelInput) {
  const name = input.name.trim();
  const clash = await tx.hostel.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (clash) throw new HostelProblem(clash.archivedAt ? `“${clash.name}” was closed earlier. Choose another name.` : `There is already a hostel called “${clash.name}”.`, "name");
  const count = await tx.hostel.count();
  const h = await tx.hostel.create({ data: { schoolId: ctx.schoolId, name, gender: input.gender, floors: cleanFloors(input.floors), note: input.note, sortOrder: count + 1, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Hostel", recordId: h.id, after: { name: h.name, kind: GENDER[h.gender].label, floors: h.floors } });
  return h;
}

export async function updateHostel(tx: Tx, ctx: SchoolContext, hostelId: string, input: HostelInput) {
  const h = await tx.hostel.findFirst({ where: { id: hostelId, archivedAt: null } });
  if (!h) throw new HostelProblem("This hostel was not found.");
  const name = input.name.trim();
  const clash = await tx.hostel.findFirst({ where: { id: { not: h.id }, name: { equals: name, mode: "insensitive" } } });
  if (clash) throw new HostelProblem(`There is already a hostel called “${clash.name}”.`, "name");
  const floors = cleanFloors(input.floors);
  const used = await tx.hostelRoom.findMany({ where: { hostelId: h.id, archivedAt: null }, select: { floor: true }, distinct: ["floor"] });
  const lost = used.map((r) => r.floor).filter((f) => !floors.includes(f));
  if (lost.length) throw new HostelProblem(`Rooms are still on the ${lost.join(", ")} floor. Move or close those rooms first.`, "floors");
  if (input.gender !== h.gender) {
    const living = await tx.bedAllocation.count({ where: { hostelId: h.id, status: "ACTIVE" } });
    if (living) throw new HostelProblem(`Students live in ${h.name} now, so it cannot change from a ${GENDER[h.gender].label.toLowerCase()}.`, "gender");
  }
  const after = await tx.hostel.update({ where: { id: h.id }, data: { name, gender: input.gender, floors, note: input.note } });
  await writeAudit(tx, ctx, { action: "updated", recordType: "Hostel", recordId: h.id, before: { name: h.name, gender: h.gender, floors: h.floors }, after: { name: after.name, gender: after.gender, floors: after.floors } });
  return after;
}

/** Adds one floor at the top of a hostel (the warden may do this for their own hostel). */
export async function addFloor(tx: Tx, ctx: SchoolContext, hostelId: string, floor: string) {
  const h = await tx.hostel.findFirst({ where: { id: hostelId, archivedAt: null } });
  if (!h) throw new HostelProblem("This hostel was not found.");
  const name = floor.trim().replace(/\s+/g, " ");
  if (!name) throw new HostelProblem("Write the floor's name, such as Second.", "floor");
  if (name.length > 30) throw new HostelProblem("A floor name can be at most 30 characters.", "floor");
  if (h.floors.some((f) => f.toLowerCase() === name.toLowerCase())) throw new HostelProblem(`${h.name} already has a ${name} floor.`, "floor");
  const after = await tx.hostel.update({ where: { id: h.id }, data: { floors: [...h.floors, name] } });
  await writeAudit(tx, ctx, { action: "added-floor", recordType: "Hostel", recordId: h.id, after: { floor: name } });
  return after;
}

/** Closes a hostel (archived, never deleted). Only an empty hostel can close. */
export async function closeHostel(tx: Tx, ctx: SchoolContext, hostelId: string, reason: string) {
  const h = await tx.hostel.findFirst({ where: { id: hostelId, archivedAt: null } });
  if (!h) throw new HostelProblem("This hostel was not found.");
  if (reason.trim().length < 5) throw new HostelProblem("Give a reason of at least 5 characters.", "reason");
  const living = await tx.bedAllocation.count({ where: { hostelId: h.id, status: "ACTIVE" } });
  if (living) throw new HostelProblem(`${living} student${living === 1 ? " lives" : "s live"} in ${h.name}. Move or check them out first.`);
  const now = new Date();
  await tx.hostel.update({ where: { id: h.id }, data: { archivedAt: now } });
  await tx.hostelWarden.updateMany({ where: { hostelId: h.id, archivedAt: null }, data: { archivedAt: now, archivedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Hostel", recordId: h.id, before: { name: h.name }, after: { reason: reason.trim() } });
}

/* ---------- Wardens ---------- */

export type WardenInput = { staffId: string; title: string };

/** Sets a hostel's wardens: new ones are added from today, removed ones archived (the history stays). */
export async function setWardens(tx: Tx, ctx: SchoolContext, hostelId: string, wardens: WardenInput[], today: Date) {
  const h = await tx.hostel.findFirst({ where: { id: hostelId, archivedAt: null } });
  if (!h) throw new HostelProblem("This hostel was not found.");
  if (wardens.length > 6) throw new HostelProblem("At most 6 wardens for one hostel.", "wardens");
  const staff = await tx.staff.findMany({ where: { id: { in: wardens.map((w) => w.staffId) }, archivedAt: null }, select: { id: true, fullName: true } });
  if (staff.length !== new Set(wardens.map((w) => w.staffId)).size) throw new HostelProblem("Choose wardens from the staff list.", "wardens");
  const now = await tx.hostelWarden.findMany({ where: { hostelId: h.id, archivedAt: null } });
  const keep = new Set(wardens.map((w) => w.staffId));
  for (const w of now) {
    if (!keep.has(w.staffId)) await tx.hostelWarden.update({ where: { id: w.id }, data: { archivedAt: new Date(), archivedById: ctx.userId } });
  }
  for (const w of wardens) {
    const title = w.title.trim() || "Warden";
    const existing = now.find((x) => x.staffId === w.staffId);
    if (existing) {
      if (existing.title !== title) await tx.hostelWarden.update({ where: { id: existing.id }, data: { title } });
    } else {
      await tx.hostelWarden.create({ data: { schoolId: ctx.schoolId, hostelId: h.id, staffId: w.staffId, title, fromDate: today, createdById: ctx.userId } });
    }
  }
  const names = (ids: string[]) => ids.map((id) => staff.find((s) => s.id === id)?.fullName ?? id);
  await writeAudit(tx, ctx, { action: "changed-wardens", recordType: "Hostel", recordId: h.id, before: { wardens: now.map((w) => w.staffId) }, after: { wardens: names(wardens.map((w) => w.staffId)) } });
}

/** Each open hostel's current wardens, with their names and logins. */
export async function wardensByHostel(tx: Tx, hostelIds?: string[]) {
  const rows = await tx.hostelWarden.findMany({ where: { archivedAt: null, ...(hostelIds ? { hostelId: { in: hostelIds } } : {}) }, orderBy: [{ title: "desc" }, { createdAt: "asc" }] });
  const staff = await tx.staff.findMany({ where: { id: { in: rows.map((r) => r.staffId) } }, select: { id: true, fullName: true, phone: true, photoFileId: true, userLoginId: true, archivedAt: true } });
  const map = new Map<string, { id: string; staffId: string; name: string; title: string; phone: string | null; photoFileId: string | null; userLoginId: string | null }[]>();
  for (const r of rows) {
    const s = staff.find((x) => x.id === r.staffId);
    if (!s || s.archivedAt) continue;
    const list = map.get(r.hostelId) ?? [];
    list.push({ id: r.id, staffId: s.id, name: s.fullName, title: r.title, phone: s.phone, photoFileId: s.photoFileId, userLoginId: s.userLoginId });
    map.set(r.hostelId, list);
  }
  return map;
}

/** The logins of a hostel's wardens (approvals and alerts go to them). */
export async function wardenLogins(tx: Tx, hostelId: string) {
  const w = (await wardensByHostel(tx, [hostelId])).get(hostelId) ?? [];
  return [...new Set(w.map((x) => x.userLoginId).filter((x): x is string => Boolean(x)))];
}

/* ---------- Hostel fee plans ---------- */

const FEE_HEAD_KEY = "hostel-fee";

/** The Fee Management fee head hostel fees go under (made the first time). */
export async function hostelFeeHead(tx: Tx, ctx: SchoolContext) {
  const found = await tx.feeHead.findFirst({ where: { OR: [{ systemKey: FEE_HEAD_KEY }, { name: { equals: "Hostel fee", mode: "insensitive" } }] } });
  if (found) {
    if (found.archivedAt || found.systemKey !== FEE_HEAD_KEY) await tx.feeHead.update({ where: { id: found.id }, data: { archivedAt: null, systemKey: FEE_HEAD_KEY } });
    return found;
  }
  return tx.feeHead.create({ data: { schoolId: ctx.schoolId, name: "Hostel fee", kind: "hostel", systemKey: FEE_HEAD_KEY, lateFeeApplies: true, sortOrder: 900, createdById: ctx.userId } });
}

export type InstallmentInput = { label: string; dueDate: Date; amountPaise: bigint };
export type FeePlanInput = { academicYearId: string; name: string; hostelId: string | null; roomType: string | null; includesMess: boolean; note: string | null; installments: InstallmentInput[] };

/**
 * Adds a hostel fee plan, or changes one. A change applies to students given
 * a bed from now on; fees already added stay as they are (changed one by one
 * in Fee Management, with a reason).
 */
export async function saveFeePlan(tx: Tx, ctx: SchoolContext, planId: string | null, input: FeePlanInput) {
  await assertYearOpen(tx, input.academicYearId);
  const name = input.name.trim();
  if (!name) throw new HostelProblem("Give the plan a name, such as Non-AC rooms.", "name");
  if (!input.installments.length) throw new HostelProblem("Add at least one installment.", "installments");
  if (input.installments.length > 12) throw new HostelProblem("At most 12 installments.", "installments");
  for (const [i, x] of input.installments.entries()) {
    if (!x.label.trim()) throw new HostelProblem(`Installment ${i + 1} needs a name, such as Quarter 1.`, "installments");
    if (x.amountPaise <= BigInt(0)) throw new HostelProblem(`Installment ${i + 1} needs an amount more than ₹0.`, "installments");
  }
  if (input.hostelId && !(await tx.hostel.findFirst({ where: { id: input.hostelId, archivedAt: null } }))) throw new HostelProblem("Choose a hostel from the list.", "hostelId");
  const same = await tx.hostelFeePlan.findFirst({ where: { archivedAt: null, academicYearId: input.academicYearId, hostelId: input.hostelId, roomType: input.roomType, ...(planId ? { id: { not: planId } } : {}) } });
  if (same) throw new HostelProblem(`“${same.name}” already covers the same hostel and room type this year. Change that plan instead.`, "roomType");
  const head = await hostelFeeHead(tx, ctx);
  const sorted = [...input.installments].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  const total = sorted.reduce((t, x) => t + x.amountPaise, BigInt(0));
  if (planId) {
    const plan = await tx.hostelFeePlan.findFirst({ where: { id: planId, archivedAt: null }, include: { installments: { where: { archivedAt: null } } } });
    if (!plan) throw new HostelProblem("This fee plan was not found.");
    await tx.hostelFeePlan.update({ where: { id: plan.id }, data: { name, hostelId: input.hostelId, roomType: input.roomType, includesMess: input.includesMess, note: input.note } });
    await tx.hostelFeeInstallment.updateMany({ where: { planId: plan.id, archivedAt: null }, data: { archivedAt: new Date() } });
    await tx.hostelFeeInstallment.createMany({ data: sorted.map((x, i) => ({ schoolId: ctx.schoolId, planId: plan.id, label: x.label.trim(), dueDate: x.dueDate, amountPaise: x.amountPaise, seq: i + 1 })) });
    const before = plan.installments.reduce((t, x) => t + x.amountPaise, BigInt(0));
    await writeAudit(tx, ctx, { action: "updated", recordType: "Hostel Fee Plan", recordId: plan.id, before: { name: plan.name, total: formatRupees(before) }, after: { name, total: formatRupees(total), installments: sorted.length } });
    return plan.id;
  }
  const plan = await tx.hostelFeePlan.create({
    data: {
      schoolId: ctx.schoolId, academicYearId: input.academicYearId, name, hostelId: input.hostelId, roomType: input.roomType, feeHeadId: head.id, includesMess: input.includesMess, note: input.note, createdById: ctx.userId,
      installments: { create: sorted.map((x, i) => ({ schoolId: ctx.schoolId, label: x.label.trim(), dueDate: x.dueDate, amountPaise: x.amountPaise, seq: i + 1 })) },
    },
  });
  await writeAudit(tx, ctx, { action: "created", recordType: "Hostel Fee Plan", recordId: plan.id, after: { name, total: formatRupees(total), installments: sorted.length } });
  return plan.id;
}

export async function archiveFeePlan(tx: Tx, ctx: SchoolContext, planId: string) {
  const plan = await tx.hostelFeePlan.findFirst({ where: { id: planId, archivedAt: null } });
  if (!plan) throw new HostelProblem("This fee plan was not found.");
  await tx.hostelFeePlan.update({ where: { id: plan.id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Hostel Fee Plan", recordId: plan.id, before: { name: plan.name } });
}

/** This year's fee plans with their installments. */
export async function feePlans(tx: Tx, academicYearId: string) {
  return tx.hostelFeePlan.findMany({ where: { academicYearId, archivedAt: null }, include: { installments: { where: { archivedAt: null }, orderBy: { seq: "asc" } } }, orderBy: { createdAt: "asc" } });
}

export type FeePlan = Awaited<ReturnType<typeof feePlans>>[number];

/**
 * The fee plans of every campus's current year. A school's campuses can start
 * the year on different dates, so each campus has its own year and its own
 * plans; with more than one campus each plan carries its campus's name.
 */
export async function currentFeePlans(tx: Tx, ctx: SchoolContext) {
  const years = await currentYears(tx, ctx);
  const names = years.length > 1
    ? new Map((await tx.campus.findMany({ where: { id: { in: years.map((y) => y.campusId) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]))
    : null;
  const lists = await Promise.all(years.map(async (y) => (await feePlans(tx, y.id)).map((p) => ({ ...p, campusId: y.campusId, campusName: names?.get(y.campusId) ?? null }))));
  return lists.flat();
}

/**
 * The fee plans of every year still open for new beds (this year's and the
 * upcoming year's of each campus; closed years left out), each with its
 * year: a student admitted for next year gets next year's plan, and a
 * continuing boarder next year's plan when the year rolls over.
 */
export async function openFeePlans(tx: Tx, ctx: SchoolContext) {
  const years = await openYears(tx, ctx);
  const campusIds = [...new Set(years.map((y) => y.campusId))];
  const names = campusIds.length > 1
    ? new Map((await tx.campus.findMany({ where: { id: { in: campusIds } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]))
    : null;
  const lists = await Promise.all(years.map(async (y) => (await feePlans(tx, y.id)).map((p) => ({ ...p, campusId: y.campusId, campusName: names?.get(y.campusId) ?? null, yearName: y.name }))));
  return lists.flat();
}

/** The school years not closed, oldest first (hostel fee plans can be set for each). */
export function openYears(tx: Tx, ctx: SchoolContext, campusId?: string | null) {
  return tx.academicYear.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null, status: { not: "CLOSED" }, ...(campusId ? { campusId } : {}) }, orderBy: { startDate: "asc" } });
}

/** The plan for a bed: the one for this hostel and room type, else this hostel, else this room type, else every hostel. */
export function planForRoom(plans: FeePlan[], hostelId: string, roomType: string | null): FeePlan | null {
  const score = (p: FeePlan) => {
    if (p.hostelId && p.hostelId !== hostelId) return -1;
    if (p.roomType && p.roomType !== roomType) return -1;
    return (p.hostelId ? 2 : 0) + (p.roomType ? 1 : 0);
  };
  return plans.map((p) => ({ p, s: score(p) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s)[0]?.p ?? null;
}

export const planTotal = (p: Pick<FeePlan, "installments">) => p.installments.reduce((t, x) => t + x.amountPaise, BigInt(0));
