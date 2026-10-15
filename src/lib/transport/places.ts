// Student Transport (12 §2): which student uses which route and stop, from
// which date, seat limits, approvals for changes, and the fee coverage check.
//   A Transport Assignment is a student's place on a route and stop. Giving
//   a place runs A12 (the stop's fee goes on the student's fees). A change
//   ends the old place the day before and starts a new one; stopping sets
//   the last day. When the school wants it (Transport Settings), changes
//   and stops wait in Approvals (status WAITING) until decided.
import "server-only";

import type { Prisma, Route, Stop, TransportAssignment } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatDate, formatRupees } from "../format";
import { requestApproval } from "../approvals";
import { nextNumber } from "../sequences";
import { STUDYING } from "../students/labels";
import { TransportProblem } from "./problem";
import { transportSettings, type TrSettings } from "./settings";
import { chargePlace, keptWords, removeFeesAfter, yearFor, type ChargeResult, type RemoveResult } from "./fees";
import { assignType, isOneWay } from "./words";

const DAY = 86_400_000;
export const dayBefore = (d: Date) => new Date(d.getTime() - DAY);

/** Places that hold a seat on or after `today`: active, not ended before today (future starts included). */
export const holdsSeat = (today: Date): Prisma.TransportAssignmentWhereInput => ({
  status: "ACTIVE", change: { not: "STOP" }, OR: [{ toDate: null }, { toDate: { gte: today } }],
});

/** Places in use on one day. */
export const onBusOn = (day: Date): Prisma.TransportAssignmentWhereInput => ({
  status: "ACTIVE", change: { not: "STOP" }, fromDate: { lte: day }, OR: [{ toDate: null }, { toDate: { gte: day } }],
});

/** Seats used on each route (students still studying), and the vehicle's seats. */
export async function routeSeats(tx: Tx, today: Date, routeIds?: string[]) {
  const places = await tx.transportAssignment.findMany({ where: { ...holdsSeat(today), ...(routeIds ? { routeId: { in: routeIds } } : {}) }, select: { routeId: true, studentId: true } });
  const studying = new Set((await tx.student.findMany({ where: { id: { in: [...new Set(places.map((p) => p.studentId))] }, archivedAt: null, status: { in: [...STUDYING] } }, select: { id: true } })).map((s) => s.id));
  const routes = await tx.route.findMany({ where: routeIds ? { id: { in: routeIds } } : { archivedAt: null }, include: { vehicle: { select: { capacity: true, label: true, number: true } } } });
  const out = new Map<string, { used: number; capacity: number | null; route: Route & { vehicle: { capacity: number; label: string | null; number: string } | null } }>();
  for (const r of routes) {
    const used = new Set(places.filter((p) => p.routeId === r.id && studying.has(p.studentId)).map((p) => p.studentId)).size;
    out.set(r.id, { used, capacity: r.vehicle?.capacity ?? null, route: r });
  }
  return out;
}

/** "Route 3 bus has 40 of 40 seats used" (12 §5 Bus over capacity). */
export function seatsWords(routeNumber: number, used: number, capacity: number) {
  return `Route ${routeNumber} bus has ${used} of ${capacity} seats used`;
}

/** The fee a month for a stop and type: the stop's own fee, else the route's. One-way uses the one-way fee. */
export function monthlyFee(route: Pick<Route, "feeTwoWayPaise" | "feeOneWayPaise">, stop: Pick<Stop, "feeTwoWayPaise" | "feeOneWayPaise">, type: string): bigint | null {
  const two = stop.feeTwoWayPaise ?? route.feeTwoWayPaise;
  const one = stop.feeOneWayPaise ?? route.feeOneWayPaise;
  if (isOneWay(type)) return one ?? two;
  return two;
}

async function routeAndStop(tx: Tx, routeId: string, stopId: string) {
  const route = await tx.route.findFirst({ where: { id: routeId, archivedAt: null } });
  if (!route) throw new TransportProblem("Choose a route.", "routeId");
  const stop = await tx.stop.findFirst({ where: { id: stopId, routeId, archivedAt: null } });
  if (!stop) throw new TransportProblem("Choose a stop on this route.", "stopId");
  return { route, stop };
}

async function checkSeats(tx: Tx, route: Route, today: Date, extra: number, allowOver: boolean) {
  const seats = (await routeSeats(tx, today, [route.id])).get(route.id);
  if (!seats || seats.capacity == null) return;
  if (seats.used + extra > seats.capacity && !allowOver) {
    const free = Math.max(0, seats.capacity - seats.used);
    throw new TransportProblem(`${seatsWords(route.number, seats.used, seats.capacity)}. ${extra > 1 ? `${extra} students need ${extra} seats and ${free} ${free === 1 ? "is" : "are"} free. ` : ""}Pick another route, or a bigger vehicle.`, "routeId");
  }
}

async function passNumber(tx: Tx, ctx: SchoolContext, yearName: string) {
  const n = await nextNumber(tx, ctx, `bus-pass:${yearName}`);
  return `BP/${yearName}/${String(n).padStart(4, "0")}`;
}

export type AssignInput = { studentIds: string[]; routeId: string; stopId: string; type: string; fromDate: Date; reason?: string | null };
export type AssignResult = { placed: { studentId: string; name: string; assignmentId: string; fee: ChargeResult }[]; monthlyPaise: bigint; route: Route; stop: Stop };

/**
 * Gives students a place on a route and stop from a date (A12): the seat is
 * counted at once, and the stop's transport fee goes on each student's fees
 * from that date. A full bus is refused (12 §5 Bus over capacity).
 */
export async function assignStudents(tx: Tx, ctx: SchoolContext, input: AssignInput, today: Date, opts: { allowOverCapacity?: boolean } = {}): Promise<AssignResult> {
  const ids = [...new Set(input.studentIds)];
  if (!ids.length) throw new TransportProblem("Choose at least one student.", "studentIds");
  if (ids.length > 200) throw new TransportProblem("Give transport to at most 200 students at a time.", "studentIds");
  if (!["TWO_WAY", "PICKUP_ONLY", "DROP_ONLY"].includes(input.type)) throw new TransportProblem("Choose one-way or two-way.", "type");
  const { route, stop } = await routeAndStop(tx, input.routeId, input.stopId);
  const fee = monthlyFee(route, stop, input.type);
  if (fee == null || fee <= BigInt(0)) throw new TransportProblem(`${stop.name} has no transport fee yet. Set the stop's fee (or one fee for the route) in Routes & Stops first.`, "stopId", { href: `/transport-management/routes/${route.id}`, label: `Open Route ${route.number}` });
  const students = await tx.student.findMany({ where: { id: { in: ids }, archivedAt: null }, select: { id: true, fullName: true, status: true, campusId: true } });
  if (students.length !== ids.length) throw new TransportProblem("One of the chosen students was not found. Reload and choose again.", "studentIds");
  const left = students.find((s) => !(STUDYING as readonly string[]).includes(s.status));
  if (left) throw new TransportProblem(`${left.fullName} is not studying here now, so cannot be given transport.`, "studentIds");
  const already = await tx.transportAssignment.findMany({ where: { studentId: { in: ids }, OR: [holdsSeat(today), { status: "WAITING" }] }, select: { studentId: true, routeId: true, status: true } });
  if (already.length) {
    const s = students.find((x) => x.id === already[0].studentId)!;
    const r = await tx.route.findFirst({ where: { id: already[0].routeId }, select: { number: true } });
    throw new TransportProblem(already[0].status === "WAITING" ? `${s.fullName} has a transport change waiting for approval.` : `${s.fullName} already has a place on Route ${r?.number ?? ""}. Use Change stop instead.`, "studentIds");
  }
  await checkSeats(tx, route, today, ids.length, Boolean(opts.allowOverCapacity));
  const settings = await transportSettings(tx, ctx);
  const result: AssignResult = { placed: [], monthlyPaise: fee, route, stop };
  for (const s of students) {
    const year = await yearFor(tx, input.fromDate, s.campusId);
    if (!year) throw new TransportProblem(`There is no academic year for ${formatDate(input.fromDate)}. Pick a date in this year.`, "fromDate");
    const a = await tx.transportAssignment.create({
      data: {
        schoolId: ctx.schoolId, studentId: s.id, academicYearId: year.id, routeId: route.id, stopId: stop.id, type: input.type,
        fromDate: input.fromDate, status: "ACTIVE", monthlyFeePaise: fee, busPassNo: await passNumber(tx, ctx, year.name),
        reason: input.reason ?? null, createdById: ctx.userId,
      },
    });
    await writeAudit(tx, ctx, { action: "assigned", recordType: "Transport Assignment", recordId: a.id, after: { student: s.fullName, route: route.number, stop: stop.name, type: assignType(input.type), from: formatDate(input.fromDate), fee: formatRupees(fee) } });
    const charged = await chargePlace(tx, ctx, a.id, settings);
    result.placed.push({ studentId: s.id, name: s.fullName, assignmentId: a.id, fee: charged });
  }
  return result;
}

/** Does this change need approval, by the school's choice (Transport Settings)? */
export function needsApproval(s: Pick<TrSettings, "changeApproval">, what: "change-stop" | "change-route" | "stop") {
  if (s.changeApproval === "ALL") return true;
  if (s.changeApproval === "ROUTE") return what === "change-route";
  return false;
}

export type ChangeInput = { routeId: string; stopId: string; type: string; fromDate: Date; reason: string };
export type ChangeOutcome = { status: "done"; assignment: TransportAssignment; removed: RemoveResult; fee: ChargeResult } | { status: "waiting"; approvalId: string };

async function openPlace(tx: Tx, assignmentId: string, today: Date) {
  const a = await tx.transportAssignment.findFirst({ where: { id: assignmentId, ...holdsSeat(today) } });
  if (!a) throw new TransportProblem("This student has no transport place now. Reload the page.");
  const waiting = await tx.transportAssignment.findFirst({ where: { studentId: a.studentId, status: "WAITING" } });
  if (waiting) throw new TransportProblem("A change for this student is already waiting for approval.");
  return a;
}

/** Change of stop or route from a date (12 §2): the old place ends the day before; the fee follows from the next period. */
export async function changePlace(tx: Tx, ctx: SchoolContext, assignmentId: string, input: ChangeInput, today: Date): Promise<ChangeOutcome> {
  const old = await openPlace(tx, assignmentId, today);
  if (input.reason.trim().length < 3) throw new TransportProblem("Give the reason for the change.", "reason");
  if (input.fromDate < today) throw new TransportProblem("A change starts today or later.", "fromDate");
  if (old.toDate && input.fromDate > old.toDate) throw new TransportProblem(`This place already ends on ${formatDate(old.toDate)}.`, "fromDate");
  const { route, stop } = await routeAndStop(tx, input.routeId, input.stopId);
  if (route.id === old.routeId && stop.id === old.stopId && input.type === old.type) throw new TransportProblem("Choose a different stop, route or type.", "stopId");
  const fee = monthlyFee(route, stop, input.type);
  if (fee == null || fee <= BigInt(0)) throw new TransportProblem(`${stop.name} has no transport fee yet. Set it in Routes & Stops first.`, "stopId");
  if (route.id !== old.routeId) await checkSeats(tx, route, today, 1, false);
  const settings = await transportSettings(tx, ctx);
  const student = await tx.student.findFirstOrThrow({ where: { id: old.studentId }, select: { fullName: true, campusId: true } });
  const year = (await yearFor(tx, input.fromDate, student.campusId)) ?? (await tx.academicYear.findFirstOrThrow({ where: { id: old.academicYearId } }));
  const routeChange = route.id !== old.routeId;
  if (needsApproval(settings, routeChange ? "change-route" : "change-stop")) {
    const req = await tx.transportAssignment.create({
      data: {
        schoolId: ctx.schoolId, studentId: old.studentId, academicYearId: year.id, routeId: route.id, stopId: stop.id, type: input.type,
        fromDate: input.fromDate, status: "WAITING", monthlyFeePaise: fee, change: "CHANGE", replacesId: old.id, reason: input.reason.trim(), createdById: ctx.userId,
      },
    });
    const oldRoute = await tx.route.findFirst({ where: { id: old.routeId }, select: { number: true } });
    const approval = await requestApproval(tx, ctx, {
      type: "transport-change", recordType: "Transport Assignment", recordId: req.id,
      summary: `Transport change for ${student.fullName}: Route ${oldRoute?.number ?? ""} to Route ${route.number}, ${stop.name}, from ${formatDate(input.fromDate)}`,
      reason: input.reason.trim(), amountPaise: null,
    });
    await tx.transportAssignment.update({ where: { id: req.id }, data: { approvalId: approval.id } });
    await writeAudit(tx, ctx, { action: "change-requested", recordType: "Transport Assignment", recordId: req.id, after: { student: student.fullName, route: route.number, stop: stop.name, from: formatDate(input.fromDate), reason: input.reason } });
    return { status: "waiting", approvalId: approval.id };
  }
  return applyChange(tx, ctx, old, { routeId: route.id, stopId: stop.id, type: input.type, fromDate: input.fromDate, reason: input.reason.trim(), fee, yearId: year.id }, settings);
}

async function applyChange(tx: Tx, ctx: SchoolContext, old: TransportAssignment, n: { routeId: string; stopId: string; type: string; fromDate: Date; reason: string; fee: bigint; yearId: string; requestId?: string }, settings: TrSettings): Promise<ChangeOutcome & { status: "done" }> {
  const last = dayBefore(n.fromDate);
  // A change on or before the old place's first day replaces it completely.
  const replaced = n.fromDate <= old.fromDate;
  await tx.transportAssignment.update({ where: { id: old.id }, data: replaced ? { status: "CANCELLED", toDate: last, endReason: `Changed: ${n.reason}` } : { toDate: last, endReason: `Changed: ${n.reason}` } });
  const removed = await removeFeesAfter(tx, ctx, old.id, replaced ? dayBefore(old.fromDate) : last, `Transport changed from ${formatDate(n.fromDate)}: ${n.reason}`);
  const year = await tx.academicYear.findFirstOrThrow({ where: { id: n.yearId } });
  const data = { routeId: n.routeId, stopId: n.stopId, type: n.type, fromDate: n.fromDate, status: "ACTIVE", monthlyFeePaise: n.fee, change: "CHANGE", replacesId: old.id, reason: n.reason, academicYearId: n.yearId };
  const fresh = n.requestId
    ? await tx.transportAssignment.update({ where: { id: n.requestId }, data: { ...data, busPassNo: await passNumber(tx, ctx, year.name) } })
    : await tx.transportAssignment.create({ data: { ...data, schoolId: ctx.schoolId, studentId: old.studentId, busPassNo: await passNumber(tx, ctx, year.name), createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "changed", recordType: "Transport Assignment", recordId: fresh.id, before: { assignment: old.id, route: old.routeId, stop: old.stopId, type: old.type }, after: { route: n.routeId, stop: n.stopId, type: n.type, from: formatDate(n.fromDate), reason: n.reason } });
  const fee = await chargePlace(tx, ctx, fresh.id, settings);
  return { status: "done", assignment: fresh, removed, fee };
}

export type StopOutcome = { status: "done"; removed: RemoveResult } | { status: "waiting"; approvalId: string };

/** Stop transport after a last day (12 §2): the fee stops from the next period. */
export async function stopPlace(tx: Tx, ctx: SchoolContext, assignmentId: string, input: { lastDate: Date; reason: string }, today: Date): Promise<StopOutcome> {
  const a = await openPlace(tx, assignmentId, today);
  if (input.reason.trim().length < 3) throw new TransportProblem("Give the reason for stopping transport.", "reason");
  if (input.lastDate < dayBefore(today)) throw new TransportProblem("The last day can be yesterday at the earliest.", "lastDate");
  const settings = await transportSettings(tx, ctx);
  const student = await tx.student.findFirstOrThrow({ where: { id: a.studentId }, select: { fullName: true } });
  if (needsApproval(settings, "stop")) {
    const req = await tx.transportAssignment.create({
      data: {
        schoolId: ctx.schoolId, studentId: a.studentId, academicYearId: a.academicYearId, routeId: a.routeId, stopId: a.stopId, type: a.type,
        fromDate: input.lastDate, toDate: input.lastDate, status: "WAITING", monthlyFeePaise: a.monthlyFeePaise, change: "STOP", replacesId: a.id, reason: input.reason.trim(), createdById: ctx.userId,
      },
    });
    const approval = await requestApproval(tx, ctx, {
      type: "transport-change", recordType: "Transport Assignment", recordId: req.id,
      summary: `Stop transport for ${student.fullName} after ${formatDate(input.lastDate)}`, reason: input.reason.trim(),
    });
    await tx.transportAssignment.update({ where: { id: req.id }, data: { approvalId: approval.id } });
    await writeAudit(tx, ctx, { action: "stop-requested", recordType: "Transport Assignment", recordId: a.id, after: { student: student.fullName, last: formatDate(input.lastDate), reason: input.reason } });
    return { status: "waiting", approvalId: approval.id };
  }
  return applyStop(tx, ctx, a, input.lastDate, input.reason.trim(), today);
}

async function applyStop(tx: Tx, ctx: SchoolContext, a: TransportAssignment, lastDate: Date, reason: string, today: Date): Promise<StopOutcome & { status: "done" }> {
  const cancelled = lastDate < a.fromDate;
  await tx.transportAssignment.update({ where: { id: a.id }, data: { toDate: cancelled ? dayBefore(a.fromDate) : lastDate, status: cancelled ? "CANCELLED" : lastDate < today ? "ENDED" : "ACTIVE", endReason: reason } });
  const removed = await removeFeesAfter(tx, ctx, a.id, cancelled ? dayBefore(a.fromDate) : lastDate, `Transport stopped after ${formatDate(lastDate)}: ${reason}`);
  await writeAudit(tx, ctx, { action: "stopped", recordType: "Transport Assignment", recordId: a.id, after: { last: formatDate(lastDate), reason, removed: removed.removed, kept: removed.kept.length } });
  return { status: "done", removed };
}

/** What happens when a transport change is decided in Approvals (00-global §3.4). */
export async function onTransportDecision(tx: Tx, ctx: SchoolContext, approval: { recordType: string; recordId: string }, decision: string, today: Date) {
  if (approval.recordType !== "Transport Assignment") return;
  const req = await tx.transportAssignment.findFirst({ where: { id: approval.recordId, status: "WAITING" } });
  if (!req) return;
  if (decision !== "approve") {
    await tx.transportAssignment.update({ where: { id: req.id }, data: { status: "CANCELLED", endReason: decision === "withdraw" ? "Withdrawn" : "Not approved" } });
    await writeAudit(tx, ctx, { action: "change-not-approved", recordType: "Transport Assignment", recordId: req.id, after: { decision } });
    return;
  }
  const old = req.replacesId ? await tx.transportAssignment.findFirst({ where: { id: req.replacesId } }) : null;
  if (!old || old.status !== "ACTIVE") {
    await tx.transportAssignment.update({ where: { id: req.id }, data: { status: "CANCELLED", endReason: "The place it changed had already ended" } });
    return;
  }
  const settings = await transportSettings(tx, ctx);
  if (req.change === "STOP") {
    await tx.transportAssignment.update({ where: { id: req.id }, data: { status: "ENDED" } });
    await applyStop(tx, ctx, old, req.toDate ?? today, req.reason ?? "Approved", today);
    return;
  }
  // Seats are checked again: the bus may have filled while the request waited.
  if (req.routeId !== old.routeId) {
    const route = await tx.route.findFirstOrThrow({ where: { id: req.routeId } });
    await checkSeats(tx, route, today, 1, false);
  }
  const fromDate = req.fromDate < today ? today : req.fromDate;
  await applyChange(tx, ctx, old, { routeId: req.routeId, stopId: req.stopId, type: req.type, fromDate, reason: req.reason ?? "Approved", fee: req.monthlyFeePaise, yearId: req.academicYearId, requestId: req.id }, settings);
}

/** Ends places whose last day has passed (daily). */
export async function endFinishedPlaces(tx: Tx, today: Date) {
  const r = await tx.transportAssignment.updateMany({ where: { status: "ACTIVE", toDate: { lt: today } }, data: { status: "ENDED" } });
  return r.count;
}

/* ---------- Fee coverage (12 §2 Student Transport, Done when 3) ---------- */

export type Coverage = {
  /** On a bus with no transport fee on their fees this year. */
  noFee: { assignmentId: string; studentId: string; routeId: string; stopId: string; monthlyPaise: bigint }[];
  /** A transport fee still to come, but no place on a bus. */
  noStop: { studentId: string; openPaise: bigint; label: string }[];
};

export async function feeCoverage(tx: Tx, today: Date): Promise<Coverage> {
  const places = await tx.transportAssignment.findMany({ where: onBusOn(today), select: { id: true, studentId: true, routeId: true, stopId: true, academicYearId: true, monthlyFeePaise: true } });
  const studying = await tx.student.findMany({ where: { id: { in: places.map((p) => p.studentId) }, archivedAt: null, status: { in: [...STUDYING] } }, select: { id: true } });
  const live = places.filter((p) => studying.some((s) => s.id === p.studentId));
  const heads = await tx.feeHead.findMany({ where: { kind: "transport" }, select: { id: true } });
  const headIds = heads.map((h) => h.id);
  const dues = headIds.length ? await tx.studentFeeDue.findMany({ where: { feeHeadId: { in: headIds }, state: "OPEN" }, select: { studentId: true, academicYearId: true, balancePaise: true, dueDate: true, label: true } }) : [];
  const noFee = live.filter((p) => !dues.some((d) => d.studentId === p.studentId && d.academicYearId === p.academicYearId))
    .map((p) => ({ assignmentId: p.id, studentId: p.studentId, routeId: p.routeId, stopId: p.stopId, monthlyPaise: p.monthlyFeePaise }));
  // The reverse check: transport fee rows due from this month on, for students with no place now or later.
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const future = dues.filter((d) => d.dueDate >= monthStart && d.balancePaise > BigInt(0));
  const holders = new Set((await tx.transportAssignment.findMany({ where: { studentId: { in: [...new Set(future.map((d) => d.studentId))] }, OR: [holdsSeat(today), { status: "WAITING" }] }, select: { studentId: true } })).map((a) => a.studentId));
  const byStudent = new Map<string, { openPaise: bigint; label: string }>();
  for (const d of future) {
    if (holders.has(d.studentId)) continue;
    const v = byStudent.get(d.studentId) ?? { openPaise: BigInt(0), label: d.label };
    v.openPaise += d.balancePaise;
    byStudent.set(d.studentId, v);
  }
  const stillStudying = new Set((await tx.student.findMany({ where: { id: { in: [...byStudent.keys()] }, archivedAt: null, status: { in: [...STUDYING] } }, select: { id: true } })).map((s) => s.id));
  const noStop = [...byStudent.entries()].filter(([id]) => stillStudying.has(id)).map(([studentId, v]) => ({ studentId, ...v }));
  return { noFee, noStop };
}

/** "Add transport fee" for one listed student (12 §2 Fix fee coverage). */
export async function addMissingFee(tx: Tx, ctx: SchoolContext, assignmentId: string, today: Date) {
  const a = await tx.transportAssignment.findFirst({ where: { id: assignmentId, ...onBusOn(today) } });
  if (!a) throw new TransportProblem("This student is not on a bus now. Reload the page.");
  const settings = await transportSettings(tx, ctx);
  const r = await chargePlace(tx, ctx, a.id, settings, { reason: "Transport fee added from the fee coverage check" });
  if (!r.added.length) throw new TransportProblem("Every period of this place already has a transport fee row. If one was removed in Fee Management, add it back there.");
  return r;
}

export { keptWords };
