// Bus passes (12 §2 Student Transport): printed in the school's "Bus pass"
// design (Settings, Document Designs, with the ID cards), with route, stop,
// pickup time and the student's photo. Eight to an A4 page.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { OPEN_LINK } from "../students/guardian-access";
import { renderDocument } from "../documents";
import { currentDesign } from "../documents/designs";
import { formatDate } from "../format";
import { TransportProblem } from "./problem";
import { studentCards } from "./people";
import { eveningTimes } from "./routes";
import { assignType, clockOf } from "./words";

export const BUS_PASS_DOC = "bus-pass";
const PER_PAGE = 8;

/** Passes for students' places on a bus (now or from a later date). At most 200 at a time. */
export async function busPasses(tx: Tx, ctx: SchoolContext, assignmentIds: string[]) {
  const places = await tx.transportAssignment.findMany({ where: { id: { in: assignmentIds.slice(0, 200) }, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  if (!places.length) throw new TransportProblem("Choose students who have a place on a bus.");
  const [cards, routes, stops, years, guardians] = await Promise.all([
    studentCards(tx, places.map((p) => p.studentId)),
    tx.route.findMany({ where: { id: { in: [...new Set(places.map((p) => p.routeId))] } }, include: { stops: { where: { archivedAt: null }, select: { id: true, pickupMin: true } } } }),
    tx.stop.findMany({ where: { id: { in: [...new Set(places.map((p) => p.stopId))] } } }),
    tx.academicYear.findMany({ where: { id: { in: [...new Set(places.map((p) => p.academicYearId).filter((x): x is string => Boolean(x)))] } } }),
    tx.studentGuardian.findMany({ where: { studentId: { in: places.map((p) => p.studentId) }, ...OPEN_LINK }, include: { guardian: { select: { phone: true } } }, orderBy: { isPrimary: "desc" } }),
  ]);
  const students = await tx.student.findMany({ where: { id: { in: places.map((p) => p.studentId) } }, select: { id: true, bloodGroup: true, campusId: true } });
  const school = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { code: true } });
  const records = places.map((p) => {
    const card = cards.get(p.studentId)!;
    const route = routes.find((r) => r.id === p.routeId)!;
    const stop = stops.find((s) => s.id === p.stopId)!;
    const year = years.find((y) => y.id === p.academicYearId);
    const until = p.toDate ?? year?.endDate ?? null;
    const drop = stop.dropMin ?? eveningTimes(route.stops, route.schoolArrivalMin, route.eveningDepartMin ?? 15 * 60 + 30).get(stop.id) ?? null;
    return {
      fields: {
        student_name: card.name, admission_no: card.admissionNo, class_section: card.cls ? `Class ${card.cls}` : "",
        guardian_phone: guardians.find((g) => g.studentId === p.studentId)?.guardian.phone ?? null,
        blood_group: students.find((s) => s.id === p.studentId)?.bloodGroup ?? null,
        bus_pass_no: p.busPassNo ?? "", route: `Route ${route.number} · ${route.name}`, stop: stop.name,
        pickup_time: p.type === "DROP_ONLY" ? "—" : clockOf(stop.pickupMin), drop_time: p.type === "PICKUP_ONLY" ? "—" : clockOf(drop),
        bus_type: assignType(p.type), valid_until: until ? formatDate(until) : "",
        academic_year: year?.name ?? null,
      },
      photoFileId: card.photoFileId,
      campusId: card.campusId,
      verifyText: `${school.code}:${p.busPassNo ?? card.admissionNo}`,
    };
  });
  const design = await currentDesign(tx, BUS_PASS_DOC);
  const until = records[0]?.fields.valid_until ?? "";
  const options = { ...design.options, card: { ...design.options.card, validUntil: until } };
  const pages: string[] = [];
  for (let i = 0; i < records.length; i += PER_PAGE) pages.push((await renderDocument(tx, ctx, BUS_PASS_DOC, records.slice(i, i + PER_PAGE), { design: { base: design.base, options } })).html);
  const html = pages.length <= 1 ? pages[0] : `${pages[0].slice(0, pages[0].indexOf("<body>"))}<body>${pages.map((p) => p.slice(p.indexOf("<body>") + 6, p.lastIndexOf("</body>"))).join('<div style="break-before:page;page-break-before:always"></div>')}</body></html>`;
  return { html, count: records.length, first: records[0].fields };
}
