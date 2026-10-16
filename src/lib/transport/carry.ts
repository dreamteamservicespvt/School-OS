// Bus places carry over into a new academic year (inferred, as Academic
// Management carries teacher allocations over when a new year opens, 04 §3;
// the review step follows Promotion's preview, workflow 11). A Transport
// Assignment belongs to one academic year, and its fees are that year's. When
// a new year becomes the active one, the Transport In-charge is told and
// reviews the places still open from the year before: each student keeps
// their route, stop and one-way or two-way choice from the new year's first
// day, with a new bus pass number and the stop's fee as it is now, and the
// new year's transport fee goes on their fees (A12). Last year's place ends on
// the day before. Students who left, places whose route or stop was closed,
// stops with no fee and changes waiting for approval cannot be carried over
// until sorted out; places of students not yet given a class in the new year
// are shown but not ticked. Places not coming back can be ended at year end.
import "server-only";

import type { AcademicYear, TransportAssignment } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { formatDate, formatRupees } from "../format";
import { nextNumber } from "../sequences";
import { STUDYING } from "../students/labels";
import { loginsWithRole } from "../front-office/people";
import { chargePlace } from "./fees";
import { monthlyFee } from "./places";
import { TransportProblem } from "./problem";
import { transportSettings } from "./settings";
import { BASE } from "./words";

const DAY = 86_400_000;

export type CarryRow = {
  place: TransportAssignment;
  fromYear: Pick<AcademicYear, "id" | "name" | "endDate">;
  toYear: Pick<AcademicYear, "id" | "name" | "startDate">;
  /** The fee a month the new place would carry (the stop's fee now). */
  newFeePaise: bigint | null;
  /** The student's class in the new year, when given. */
  newClass: string | null;
  /** Why it cannot be carried over (nothing = it can). */
  blocked: string | null;
  /** A note shown with a place that can be carried over but is not ticked by itself. */
  note: string | null;
  routeNumber: number | null;
  stopName: string | null;
};

/** The active year of each campus, the year a place moves into. */
async function activeYears(tx: Tx) {
  const years = await tx.academicYear.findMany({ where: { status: "ACTIVE", archivedAt: null } });
  return { byCampus: new Map(years.map((y) => [y.campusId, y])), any: years.sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0] ?? null };
}

/**
 * Places still open from an earlier year, with what carrying each over would
 * do. Optionally only the given place ids.
 */
export async function carryOverRows(tx: Tx, ids?: string[]): Promise<CarryRow[]> {
  const act = await activeYears(tx);
  if (!act.any) return [];
  const years = await tx.academicYear.findMany({ where: { archivedAt: null } });
  const yearOf = new Map(years.map((y) => [y.id, y]));
  const places = await tx.transportAssignment.findMany({
    where: { status: "ACTIVE", change: { not: "STOP" }, ...(ids ? { id: { in: ids } } : {}) },
    orderBy: [{ routeId: "asc" }, { createdAt: "asc" }],
  });
  const students = await tx.student.findMany({ where: { id: { in: [...new Set(places.map((p) => p.studentId))] } }, select: { id: true, fullName: true, status: true, campusId: true } });
  const studentOf = new Map(students.map((s) => [s.id, s]));
  const rows: Omit<CarryRow, "newClass" | "routeNumber" | "stopName">[] = [];
  for (const p of places) {
    const from = yearOf.get(p.academicYearId);
    const s = studentOf.get(p.studentId);
    const to = (s && act.byCampus.get(s.campusId)) ?? act.any;
    if (!from || !to || from.id === to.id || from.startDate >= to.startDate) continue;
    // Still open into the new year: no last day, or a last day after the new year starts.
    if (p.toDate && p.toDate < to.startDate) continue;
    rows.push({ place: p, fromYear: from, toYear: to, newFeePaise: null, blocked: null, note: null });
  }
  if (!rows.length) return [];
  const [routes, stops, waiting, enrolments] = await Promise.all([
    tx.route.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.place.routeId))] } } }),
    tx.stop.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.place.stopId))] } } }),
    tx.transportAssignment.findMany({ where: { status: "WAITING", studentId: { in: rows.map((r) => r.place.studentId) } }, select: { studentId: true } }),
    tx.enrolment.findMany({ where: { studentId: { in: rows.map((r) => r.place.studentId) }, academicYearId: { in: [...new Set(rows.map((r) => r.toYear.id))] }, archivedAt: null }, select: { studentId: true, academicYearId: true, sectionId: true } }),
  ]);
  const sections = await tx.section.findMany({ where: { id: { in: enrolments.map((e) => e.sectionId) } }, include: { schoolClass: { select: { name: true } } } });
  const waitingIds = new Set(waiting.map((w) => w.studentId));
  return rows.map((r) => {
    const s = studentOf.get(r.place.studentId);
    const route = routes.find((x) => x.id === r.place.routeId);
    const stop = stops.find((x) => x.id === r.place.stopId);
    const e = enrolments.find((x) => x.studentId === r.place.studentId && x.academicYearId === r.toYear.id);
    const sec = e ? sections.find((x) => x.id === e.sectionId) : null;
    const newClass = sec ? `${sec.schoolClass.name.replace(/^Class\s+/i, "")} ${sec.name}` : null;
    const fee = route && stop ? monthlyFee(route, stop, r.place.type) : null;
    let blocked: string | null = null;
    if (!s || !(STUDYING as readonly string[]).includes(s.status)) blocked = "Not studying here now. End the place at year end.";
    else if (!route || route.archivedAt) blocked = "The route is closed. Give a new stop instead.";
    else if (!stop || stop.archivedAt) blocked = "The stop is closed. Give a new stop instead.";
    else if (waitingIds.has(r.place.studentId)) blocked = "A transport change is waiting for approval. Decide it first.";
    else if (fee == null || fee <= BigInt(0)) blocked = `${stop.name} has no transport fee. Set it in Routes & Stops first.`;
    return { ...r, newFeePaise: fee, newClass, blocked, routeNumber: route?.number ?? null, stopName: stop?.name ?? null, note: !blocked && !newClass ? `No class in ${r.toYear.name} yet (not promoted).` : null };
  });
}

/** How many places wait to be carried over, for the notice when a year is opened. */
export async function carryOverCount(tx: Tx) {
  return (await carryOverRows(tx)).length;
}

export type CarryResult = { carried: number; feeRows: number; feePaise: bigint; year: string; skipped: { name: string; why: string }[] };

/**
 * Carries the chosen places over: last year's place ends the day before the
 * new year, and a new place on the same route, stop and type starts on the
 * new year's first day, with a new bus pass and the new year's fees (A12).
 */
export async function carryOver(tx: Tx, ctx: SchoolContext, placeIds: string[]): Promise<CarryResult> {
  const ids = [...new Set(placeIds)];
  if (!ids.length) throw new TransportProblem("Tick the places to carry over.", "placeIds");
  if (ids.length > 2000) throw new TransportProblem("Carry over at most 2,000 places at a time.", "placeIds");
  const rows = await carryOverRows(tx, ids);
  if (!rows.length) throw new TransportProblem("These places were carried over or changed already. Refresh the page.");
  const names = new Map((await tx.student.findMany({ where: { id: { in: rows.map((r) => r.place.studentId) } }, select: { id: true, fullName: true } })).map((s) => [s.id, s.fullName]));
  const settings = await transportSettings(tx, ctx);
  const out: CarryResult = { carried: 0, feeRows: 0, feePaise: BigInt(0), year: rows[0].toYear.name, skipped: [] };
  for (const r of rows) {
    const name = names.get(r.place.studentId) ?? "A student";
    if (r.blocked) { out.skipped.push({ name, why: r.blocked }); continue; }
    const start = r.place.fromDate > r.toYear.startDate ? r.place.fromDate : r.toYear.startDate;
    const lastDay = new Date(start.getTime() - DAY);
    await tx.transportAssignment.update({ where: { id: r.place.id }, data: { toDate: lastDay < r.place.fromDate ? r.place.fromDate : lastDay, endReason: `Carried over to ${r.toYear.name}` } });
    const n = await nextNumber(tx, ctx, `bus-pass:${r.toYear.name}`);
    const fresh = await tx.transportAssignment.create({
      data: {
        schoolId: ctx.schoolId, studentId: r.place.studentId, academicYearId: r.toYear.id, routeId: r.place.routeId, stopId: r.place.stopId, type: r.place.type,
        fromDate: start, status: "ACTIVE", monthlyFeePaise: r.newFeePaise!, busPassNo: `BP/${r.toYear.name}/${String(n).padStart(4, "0")}`, change: "ASSIGN",
        reason: `Carried over from ${r.fromYear.name}`, createdById: ctx.userId,
      },
    });
    await writeAudit(tx, ctx, {
      action: "carried-over", recordType: "Transport Assignment", recordId: fresh.id,
      before: { place: r.place.id, year: r.fromYear.name, fee: formatRupees(r.place.monthlyFeePaise) },
      after: { student: name, year: r.toYear.name, from: formatDate(start), fee: formatRupees(r.newFeePaise!), busPass: fresh.busPassNo },
    });
    const fee = await chargePlace(tx, ctx, fresh.id, settings, { reason: `Transport ${r.toYear.name}, carried over from ${r.fromYear.name}` });
    out.carried++;
    out.feeRows += fee.added.length;
    out.feePaise += fee.totalPaise;
  }
  if (!out.carried) throw new TransportProblem(out.skipped.length === 1 ? `${out.skipped[0].name}: ${out.skipped[0].why}` : "None of the ticked places can be carried over yet. See the reason on each.");
  return out;
}

/** Ends the chosen places on the last day of their year (students not coming back on the bus). */
export async function endAtYearEnd(tx: Tx, ctx: SchoolContext, placeIds: string[]) {
  const ids = [...new Set(placeIds)];
  if (!ids.length) throw new TransportProblem("Tick the places to end.", "placeIds");
  const rows = await carryOverRows(tx, ids);
  if (!rows.length) throw new TransportProblem("These places were carried over or changed already. Refresh the page.");
  for (const r of rows) {
    const last = r.fromYear.endDate < r.toYear.startDate ? r.fromYear.endDate : new Date(r.toYear.startDate.getTime() - DAY);
    const toDate = last < r.place.fromDate ? r.place.fromDate : last;
    await tx.transportAssignment.update({ where: { id: r.place.id }, data: { toDate, endReason: `Not carried over to ${r.toYear.name}` } });
    await writeAudit(tx, ctx, { action: "ended", recordType: "Transport Assignment", recordId: r.place.id, before: { toDate: r.place.toDate ? formatDate(r.place.toDate) : null }, after: { toDate: formatDate(toDate), reason: `Not carried over to ${r.toYear.name}` } });
  }
  return { ended: rows.length, year: rows[0].toYear.name };
}

/**
 * Academic Management opened a new year: the Transport In-charge is told how
 * many bus places wait to be carried over. Returns the count.
 */
export async function noticeNewYear(tx: Tx, ctx: SchoolContext, year: Pick<AcademicYear, "name">) {
  const n = await carryOverCount(tx);
  if (!n) return 0;
  for (const to of await loginsWithRole(tx, ctx, "transport-in-charge")) {
    await notify(tx, ctx, { to, type: "transport-trip", text: `${year.name} is open: ${n} bus place${n === 1 ? "" : "s"} to carry over. Review them in Student Transport.`, link: `${BASE}/students?do=carry`, groupKey: `transport-carry-${year.name}` });
  }
  return n;
}
