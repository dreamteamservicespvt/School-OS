// Bus messages to parents (12 §6, sent through Communication):
//   automatic: picked up, dropped and "bus arriving" (rules bus-pickup,
//   bus-drop and bus-arriving in Communication, switched on or off there and
//   on Transport Settings; one message per student per trip);
//   by a person, after they confirm: a delay or emergency message to the
//   parents of one route, or a typed message to a route.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { sendAutomatic } from "../messaging/automatic";
import { sendMessage, MessagingProblem } from "../messaging/send";
import { TransportProblem } from "./problem";
import { onBusOn } from "./places";
import { studyingIds } from "./people";
import { clockOf, tripKind } from "./words";

/** Students who ride this trip: on the route that day, the right way (pickup in the morning, drop in the evening). */
export async function riders(tx: Tx, routeId: string, kind: string, day: Date, stopId?: string) {
  const types = kind === "MORNING" ? ["TWO_WAY", "PICKUP_ONLY"] : ["TWO_WAY", "DROP_ONLY"];
  const places = await tx.transportAssignment.findMany({ where: { ...onBusOn(day), routeId, type: { in: types }, ...(stopId ? { stopId } : {}) }, select: { studentId: true, stopId: true } });
  const studying = await studyingIds(tx, places.map((p) => p.studentId));
  return places.filter((p) => studying.has(p.studentId));
}

/** Students on a route now (either way), for messages to the route's parents. */
export async function routeStudents(tx: Tx, routeId: string, day: Date) {
  const places = await tx.transportAssignment.findMany({ where: { ...onBusOn(day), routeId }, select: { studentId: true } });
  const studying = await studyingIds(tx, places.map((p) => p.studentId));
  return [...new Set(places.map((p) => p.studentId))].filter((id) => studying.has(id));
}

const busName = (v: { label: string | null; number: string } | null, routeNumber: number) => v?.label ?? `Bus ${routeNumber}`;

type TripLike = { id: string; routeId: string; kind: string; date: Date; vehicleId: string | null };

async function tripWords(tx: Tx, trip: TripLike) {
  const [route, vehicle] = await Promise.all([
    tx.route.findFirstOrThrow({ where: { id: trip.routeId }, select: { number: true, name: true } }),
    trip.vehicleId ? tx.vehicle.findFirst({ where: { id: trip.vehicleId }, select: { label: true, number: true } }) : Promise.resolve(null),
  ]);
  return { route, bus: busName(vehicle, route.number) };
}

/** "Aarav boarded Bus 4 at 7:43 AM" to the student's parents, once per trip (rule bus-pickup). */
export async function pickupMessage(tx: Tx, ctx: SchoolContext, trip: TripLike, studentId: string, atMin: number, stopName: string | null) {
  const { bus } = await tripWords(tx, trip);
  const s = await tx.student.findFirst({ where: { id: studentId }, select: { firstName: true } });
  return sendAutomatic(tx, ctx, {
    rule: "bus-pickup",
    event: { key: `bus-pickup:${trip.id}:${studentId}`, label: `Boarded ${bus}` },
    to: { guardiansOf: [studentId] },
    perStudent: { [studentId]: { message: `${s?.firstName ?? "Your child"} boarded ${bus}${stopName ? ` at ${stopName}` : ""} at ${clockOf(atMin)}.` } },
    source: { type: "Trip", id: trip.id },
  });
}

/** "Aarav reached school at 7:52 AM" (morning) or "got off at KPHB 6th Phase at 4:31 PM" (evening), once per trip (rule bus-drop). */
export async function dropMessage(tx: Tx, ctx: SchoolContext, trip: TripLike, studentIds: string[], atMin: number, stopName: string | null) {
  if (!studentIds.length) return null;
  const { bus } = await tripWords(tx, trip);
  const names = await tx.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, firstName: true } });
  const perStudent = Object.fromEntries(names.map((s) => [s.id, { message: trip.kind === "MORNING" ? `${s.firstName} reached school on ${bus} at ${clockOf(atMin)}.` : `${s.firstName} got off ${bus}${stopName ? ` at ${stopName}` : ""} at ${clockOf(atMin)}.` }]));
  return sendAutomatic(tx, ctx, {
    rule: "bus-drop",
    event: { key: `bus-drop:${trip.id}`, label: `${tripKind(trip.kind)}: dropped` },
    to: { guardiansOf: studentIds },
    perStudent,
    source: { type: "Trip", id: trip.id },
  });
}

/** "Bus 4 is about 5 minutes from KPHB 6th Phase" to the parents at that stop, once per student per trip (Done when 6). */
export async function arrivingMessage(tx: Tx, ctx: SchoolContext, trip: TripLike, stop: { id: string; name: string }, minutes: number) {
  const eventKey = `bus-arriving:${trip.id}:${stop.id}`;
  if (await tx.automationLog.count({ where: { schoolId: ctx.schoolId, ruleKey: "bus-arriving", eventKey } })) return { status: "duplicate" as const };
  const students = (await riders(tx, trip.routeId, trip.kind, trip.date, stop.id)).map((r) => r.studentId);
  if (!students.length) return { status: "nobody" as const };
  const { bus, route } = await tripWords(tx, trip);
  const text = `${bus} (Route ${route.number}) is about ${Math.max(1, minutes)} minute${minutes === 1 ? "" : "s"} from ${stop.name}. Please be at the stop.`;
  return sendAutomatic(tx, ctx, {
    rule: "bus-arriving",
    event: { key: eventKey, label: `${bus} arriving at ${stop.name}` },
    to: { guardiansOf: students },
    perStudent: Object.fromEntries(students.map((id) => [id, { message: text }])),
    source: { type: "Trip", id: trip.id },
  });
}

export type RouteMessage = { routeId: string; text: string; kind: "delay" | "emergency" | "message"; alertId?: string | null; tripId?: string | null };

/**
 * A message to the parents of one route, sent only after a person confirms
 * ("Send to 38 parents"; 12 §5 Emergency message sent by mistake). An
 * emergency also reaches parents who opted out of messages.
 */
export async function messageRoute(tx: Tx, ctx: SchoolContext, m: RouteMessage, today: Date) {
  const text = m.text.trim();
  if (text.length < 10) throw new TransportProblem("Write the message (at least 10 characters).", "text");
  if (text.length > 600) throw new TransportProblem("Keep the message under 600 characters.", "text");
  const route = await tx.route.findFirst({ where: { id: m.routeId } });
  if (!route) throw new TransportProblem("Choose a route.", "routeId");
  const students = await routeStudents(tx, route.id, today);
  if (!students.length) throw new TransportProblem(`Route ${route.number} has no students now, so there is nobody to message.`);
  try {
    const r = await sendMessage(tx, ctx, {
      to: { guardiansOf: students },
      channels: "preferred",
      text,
      title: m.kind === "emergency" ? `Emergency: Route ${route.number}` : m.kind === "delay" ? `Bus delay: Route ${route.number}` : `Route ${route.number}`,
      emergency: m.kind === "emergency",
      scope: { sectionIds: "all", staff: false, label: `Parents of Route ${route.number}` },
      audienceLabel: `Parents of Route ${route.number} · ${route.name}`,
      trigger: m.kind === "emergency" ? "Transport emergency" : m.kind === "delay" ? "Bus delay" : "Message to a route",
      source: m.alertId ? { type: "Transport Alert", id: m.alertId } : m.tripId ? { type: "Trip", id: m.tripId } : { type: "Route", id: route.id },
      idempotencyKey: m.alertId ? `transport-alert:${m.alertId}` : m.kind === "delay" && m.tripId ? `transport-delay:${m.tripId}` : null,
    });
    if (m.alertId) await tx.transportAlert.updateMany({ where: { id: m.alertId }, data: { messageId: r.messageId } });
    await writeAudit(tx, ctx, { action: `route-${m.kind}-message`, recordType: "Route", recordId: route.id, after: { people: r.people, students: students.length, text, repeated: r.repeated } });
    return { ...r, route, students: students.length };
  } catch (e) {
    if (e instanceof MessagingProblem) throw new TransportProblem(e.message);
    throw e;
  }
}

/** The ready delay message, for the person to read before sending. */
export function delayText(bus: string, routeNumber: number, routeName: string, lateMin: number, schoolName: string) {
  return `Dear parent, ${bus} (Route ${routeNumber}, ${routeName}) is running about ${Math.max(5, lateMin)} minutes late today. Please keep your child at the stop. - ${schoolName}`;
}

/** The ready emergency message (12 §2 Emergency: "offers a ready emergency message"). */
export function emergencyText(bus: string, routeNumber: number, schoolName: string, schoolPhone: string | null) {
  return `Dear parent, ${bus} on Route ${routeNumber} has stopped because of an emergency. All children are being looked after and the school is with them. We will update you shortly.${schoolPhone ? ` For help call ${schoolPhone}.` : ""} - ${schoolName}`;
}

/** The ready breakdown message. */
export function breakdownText(bus: string, routeNumber: number, schoolName: string) {
  return `Dear parent, ${bus} on Route ${routeNumber} has broken down. Another bus is being sent and your child will be late today. - ${schoolName}`;
}
