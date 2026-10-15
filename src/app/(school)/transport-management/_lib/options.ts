// Choices offered in the Transport sheets, read on the server.
import "server-only";

import type { SchoolContext, Tx } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { currentYear } from "@/lib/academic/years";
import { STUDYING } from "@/lib/students/labels";
import { holdsSeat, routeSeats } from "@/lib/transport/places";
import { clockOf, rupeesShort, showPlate, vehicleType } from "@/lib/transport/words";

/** Vehicles free for a route (or already on it), drivers and attendants. */
export async function crewOptions(tx: Tx, routeId: string | null) {
  const [vehicles, routes, people] = await Promise.all([
    tx.vehicle.findMany({ where: { archivedAt: null, status: { not: "INACTIVE" } }, orderBy: [{ label: "asc" }, { number: "asc" }] }),
    tx.route.findMany({ where: { archivedAt: null }, select: { id: true, vehicleId: true } }),
    tx.driver.findMany({ where: { archivedAt: null, status: "ACTIVE" }, orderBy: { name: "asc" } }),
  ]);
  const taken = new Set(routes.filter((r) => r.id !== routeId && r.vehicleId).map((r) => r.vehicleId!));
  return {
    vehicles: vehicles.filter((v) => !taken.has(v.id)).map((v) => ({ value: v.id, label: `${v.label ?? vehicleType(v.type)} · ${showPlate(v.number)} · ${v.capacity} seats${v.status === "UNDER_REPAIR" ? " · under repair" : ""}` })),
    drivers: people.filter((d) => d.role === "DRIVER").map((d) => ({ value: d.id, label: `${d.name}${d.licenceExpiry ? ` · licence till ${formatDate(d.licenceExpiry)}` : ""}` })),
    attendants: people.filter((d) => d.role === "ATTENDANT").map((d) => ({ value: d.id, label: d.name })),
  };
}

/** Routes with free seats, and each route's stops with time and fee, for giving students transport. */
export async function placeOptions(tx: Tx, today: Date) {
  const routes = await tx.route.findMany({ where: { archivedAt: null }, orderBy: { number: "asc" }, include: { stops: { where: { archivedAt: null }, orderBy: { seq: "asc" } }, vehicle: { select: { label: true, number: true, capacity: true } } } });
  const seats = await routeSeats(tx, today, routes.map((r) => r.id));
  return routes.map((r) => {
    const used = seats.get(r.id)?.used ?? 0;
    const cap = r.vehicle?.capacity ?? null;
    return {
      id: r.id, number: r.number, name: r.name, used, capacity: cap, free: cap == null ? null : Math.max(0, cap - used),
      bus: r.vehicle ? r.vehicle.label ?? showPlate(r.vehicle.number) : null,
      stops: r.stops.map((s) => {
        const two = s.feeTwoWayPaise ?? r.feeTwoWayPaise;
        const oneWay = s.feeOneWayPaise ?? r.feeOneWayPaise ?? two;
        return { id: s.id, name: s.name, pickup: clockOf(s.pickupMin), two: two != null ? rupeesShort(two) : null, one: oneWay != null ? rupeesShort(oneWay) : null };
      }),
    };
  });
}

export type PlaceOption = Awaited<ReturnType<typeof placeOptions>>[number];

/**
 * Students who can be given a stop: studying, in this year's classes, with no
 * place on a bus now or waiting. One class at a time (bulk by class), or a
 * name search, or the one student opened from their profile.
 */
export async function assignCandidates(tx: Tx, ctx: SchoolContext, today: Date, f: { sectionId: string | null; q: string; studentId: string | null }) {
  const year = await currentYear(tx, ctx);
  if (!year) return { sections: [], students: [], year: null };
  const sections = await tx.section.findMany({ where: { academicYearId: year.id, archivedAt: null }, include: { schoolClass: { select: { name: true, sortOrder: true } } } });
  sections.sort((a, b) => a.schoolClass.sortOrder - b.schoolClass.sortOrder || a.name.localeCompare(b.name));
  const label = (s: (typeof sections)[number]) => `${s.schoolClass.name} ${s.name}`;
  const q = f.q.trim();
  const studentWhere = f.studentId ? { id: f.studentId } : q.length >= 2 ? { OR: [{ fullName: { contains: q, mode: "insensitive" as const } }, { admissionNo: { contains: q, mode: "insensitive" as const } }] } : null;
  const options = sections.map((s) => ({ value: s.id, label: label(s) }));
  if (!f.sectionId && !studentWhere) return { sections: options, students: [], year };
  const enr = await tx.enrolment.findMany({
    where: { academicYearId: year.id, archivedAt: null, ...(f.sectionId && !studentWhere ? { sectionId: f.sectionId } : {}), student: { archivedAt: null, status: { in: [...STUDYING] }, ...(studentWhere ?? {}) } },
    include: { student: { select: { id: true, fullName: true, admissionNo: true } } }, orderBy: [{ rollNo: "asc" }], take: 300,
  });
  const taken = new Set((await tx.transportAssignment.findMany({ where: { studentId: { in: enr.map((e) => e.studentId) }, OR: [holdsSeat(today), { status: "WAITING" }] }, select: { studentId: true } })).map((a) => a.studentId));
  const students = enr.map((e) => {
    const sec = sections.find((s) => s.id === e.sectionId);
    return { id: e.studentId, name: e.student.fullName, admissionNo: e.student.admissionNo, cls: sec ? label(sec).replace(/^Class\s+/i, "") : "", has: taken.has(e.studentId) };
  }).sort((a, b) => Number(a.has) - Number(b.has) || a.name.localeCompare(b.name));
  return { sections: options, students, year };
}

export type Candidate = Awaited<ReturnType<typeof assignCandidates>>["students"][number];
