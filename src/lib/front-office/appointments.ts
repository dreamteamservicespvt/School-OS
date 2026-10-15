// Appointments (16 §2): meetings with the Principal or staff, with no double
// booking. Booked times, leave and teaching (from the Time Table) are not
// offered, and the server checks again under a lock before saving.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { FrontOfficeProblem } from "./problem";
import { frontOfficeSettings, schoolDay } from "./settings";
import { staffDay, type Segment } from "./staff";
import { messageVisitor, sentWords } from "./notify";
import { registerVisitor } from "./visitors";
import { clockAt, minuteNow, shortDay, todayIso } from "./time";
import { APPOINTMENT_LENGTHS, clockOf, mobileDigits, phoneProblem } from "./words";

const dateOf = (iso: string) => new Date(`${iso}T00:00:00Z`);
const weekdayOf = (iso: string) => ((dateOf(iso).getUTCDay() + 6) % 7) + 1;

export type DayPlan = {
  staff: { id: string; fullName: string; designation: string };
  leave: string | null;
  start: number;
  end: number;
  slot: number;
  segments: Segment[];
  /** Free start minutes for a meeting of `slot` minutes. */
  free: number[];
};

/** One staff member's day with free slots (16 §2 Appointments: calendar by day). */
export async function dayPlan(tx: Tx, ctx: SchoolContext, staffId: string, dayIso: string, opts: { timeZone: string; now?: Date; length?: number; ignoreId?: string | null }): Promise<DayPlan | null> {
  const now = opts.now ?? new Date();
  const s = await frontOfficeSettings(tx, ctx);
  const day = await staffDay(tx, ctx, staffId, dateOf(dayIso));
  if (!day) return null;
  const { start, end } = await schoolDay(tx, ctx, weekdayOf(dayIso));
  const slot = s.slotMinutes;
  const length = opts.length ?? slot;
  const busy = day.segments.filter((x) => x.appointmentId !== opts.ignoreId && x.kind !== "noshow");
  const today = todayIso(opts.timeZone, now);
  const past = dayIso < today ? 24 * 60 : dayIso === today ? minuteNow(opts.timeZone, now) : -1;
  const free: number[] = [];
  if (!day.leave && dayIso >= today) {
    for (let m = start; m + length <= end; m += slot) {
      if (m < past) continue;
      if (busy.some((x) => x.start < m + length && m < x.end)) continue;
      free.push(m);
    }
  }
  return { staff: day.staff, leave: day.leave, start, end, slot, segments: day.segments, free };
}

export type BookInput = { staffId: string; dayIso: string; startMin: number; lengthMin: number; visitorName: string; visitorPhone: string; purpose: string; confirm: boolean };

async function lockStaffDay(tx: Tx, staffId: string, dayIso: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`appointment:${staffId}:${dayIso}`}))`;
}

/** The plain-words clash for a time, or null when it is free. */
function clashOf(plan: DayPlan, startMin: number, lengthMin: number, name: string, now: { today: string; minute: number }, dayIso: string) {
  if (plan.leave) return `${name} is not available on ${shortDay(dateOf(dayIso))} (${plan.leave.toLowerCase()}). Pick another day or person.`;
  if (dayIso < now.today || (dayIso === now.today && startMin < now.minute)) return "That time has passed. Pick a later slot.";
  if (startMin < plan.start || startMin + lengthMin > plan.end) return `Meetings are between ${clockOf(plan.start)} and ${clockOf(plan.end)}. Pick a slot in the school day.`;
  const hit = plan.segments.find((x) => x.kind !== "noshow" && x.start < startMin + lengthMin && startMin < x.end);
  if (!hit) return null;
  if (hit.kind === "teach") return `${name} is teaching at ${clockOf(hit.start)} (${hit.label.replace(/^Teaching /, "")}). Pick another slot.`;
  return `${name} already has a meeting at ${clockOf(hit.start)}. Pick another slot.`;
}

/** Books (or reschedules) an appointment: no double booking (16 Done when 6). */
export async function bookAppointment(tx: Tx, ctx: SchoolContext, input: BookInput, opts: { timeZone: string; rescheduleId?: string | null; now?: Date }) {
  const now = opts.now ?? new Date();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dayIso)) throw new FrontOfficeProblem("Choose the date.", "date");
  if (!(APPOINTMENT_LENGTHS as readonly number[]).includes(input.lengthMin)) throw new FrontOfficeProblem("Choose the length.", "lengthMin");
  if (!Number.isInteger(input.startMin) || input.startMin < 0 || input.startMin >= 24 * 60) throw new FrontOfficeProblem("Pick a free slot.", "startMin");
  const pp = phoneProblem(input.visitorPhone);
  if (pp) throw new FrontOfficeProblem(pp, "visitorPhone");
  const visitorName = input.visitorName.trim().replace(/\s+/g, " ");
  if (visitorName.length < 2) throw new FrontOfficeProblem("Enter the visitor’s name.", "visitorName");
  if (visitorName.length > 120) throw new FrontOfficeProblem("Name can be at most 120 characters.", "visitorName");
  const purpose = input.purpose.trim().replace(/\s+/g, " ");
  if (purpose.length < 3) throw new FrontOfficeProblem("What is the meeting about?", "purpose");
  if (purpose.length > 200) throw new FrontOfficeProblem("Keep the purpose to 200 characters.", "purpose");
  const old = opts.rescheduleId ? await tx.appointment.findFirst({ where: { id: opts.rescheduleId, archivedAt: null } }) : null;
  if (opts.rescheduleId && !old) throw new FrontOfficeProblem("This appointment was not found.");
  if (old && old.status !== "BOOKED") throw new FrontOfficeProblem("Only a booked appointment can be moved.");
  const limit = new Date(now.getTime() + 180 * 86_400_000).toISOString().slice(0, 10);
  if (input.dayIso > limit) throw new FrontOfficeProblem("Appointments can be booked up to 6 months ahead.", "date");
  await lockStaffDay(tx, input.staffId, input.dayIso);
  const plan = await dayPlan(tx, ctx, input.staffId, input.dayIso, { timeZone: opts.timeZone, now, length: input.lengthMin, ignoreId: old?.id ?? null });
  if (!plan) throw new FrontOfficeProblem("Choose who the meeting is with.", "staffId");
  const segments = plan.segments.filter((x) => x.appointmentId !== old?.id);
  const clash = clashOf({ ...plan, segments }, input.startMin, input.lengthMin, /^principal$/i.test(plan.staff.designation) ? "The Principal" : plan.staff.fullName, { today: todayIso(opts.timeZone, now), minute: minuteNow(opts.timeZone, now) }, input.dayIso);
  if (clash) throw new FrontOfficeProblem(clash, "startMin");
  const phone = mobileDigits(input.visitorPhone);
  const data = { staffId: input.staffId, date: dateOf(input.dayIso), startMin: input.startMin, lengthMin: input.lengthMin, visitorName, visitorPhone: phone, purpose };
  const a = old
    ? await tx.appointment.update({ where: { id: old.id }, data: { ...data, statusAt: now } })
    : await tx.appointment.create({ data: { ...data, schoolId: ctx.schoolId, createdById: ctx.userId } });
  await writeAudit(tx, ctx, old
    ? { action: "rescheduled", recordType: "Appointment", recordId: a.id, before: { staffId: old.staffId, date: old.date.toISOString().slice(0, 10), startMin: old.startMin }, after: { staffId: a.staffId, date: input.dayIso, startMin: a.startMin } }
    : { action: "created", recordType: "Appointment", recordId: a.id, after: { staffId: a.staffId, date: input.dayIso, start: clockOf(a.startMin), lengthMin: a.lengthMin, visitorName, purpose } });
  const staff = await tx.staff.findFirst({ where: { id: input.staffId }, select: { fullName: true, userLoginId: true } });
  const when = `${input.dayIso === todayIso(opts.timeZone, now) ? "today" : shortDay(dateOf(input.dayIso))}, ${clockOf(a.startMin)}`;
  if (staff?.userLoginId) {
    await notify(tx, ctx, { to: staff.userLoginId, type: "appointment", text: `${old ? "Appointment moved" : "New appointment"}: ${visitorName}, ${when} for ${a.lengthMin} minutes. ${purpose}`, link: "/dashboard" }, now);
  }
  let sent: string | null = null;
  if (input.confirm) {
    const school = await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { name: true } });
    const r = await messageVisitor(tx, ctx, {
      to: { name: visitorName, phone }, trigger: "Appointment confirmation",
      text: `Your appointment with ${staff?.fullName ?? "the school"} at ${school?.name ?? "school"} is ${old ? "moved to" : "on"} ${when} for ${a.lengthMin} minutes. Please come to the front desk 5 minutes early.`,
      about: { recordType: "Appointment", recordId: a.id },
    });
    sent = sentWords(r);
    if (r.status === "queued") await tx.appointment.update({ where: { id: a.id }, data: { confirmationSent: true } });
  }
  return { appointment: a, staffName: staff?.fullName ?? "", when, sent };
}

export const NEXT_STATUS: Record<string, string[]> = { BOOKED: ["ARRIVED", "DONE", "NO_SHOW", "CANCELLED"], ARRIVED: ["DONE"], DONE: [], NO_SHOW: [], CANCELLED: [] };

/** Marks done, no-show or cancelled (Mark arrived goes through arriveAppointment). */
export async function setAppointmentStatus(tx: Tx, ctx: SchoolContext, id: string, status: "DONE" | "NO_SHOW" | "CANCELLED", opts: { timeZone: string; now?: Date }) {
  const now = opts.now ?? new Date();
  const a = await tx.appointment.findFirst({ where: { id, archivedAt: null } });
  if (!a) throw new FrontOfficeProblem("This appointment was not found.");
  if (!NEXT_STATUS[a.status]?.includes(status)) throw new FrontOfficeProblem(`This appointment is already ${a.status.toLowerCase().replace("_", "-")}.`);
  await tx.appointment.update({ where: { id }, data: { status, statusAt: now } });
  await writeAudit(tx, ctx, { action: "status-changed", recordType: "Appointment", recordId: id, before: { status: a.status }, after: { status } });
  let sent: string | null = null;
  if (status === "CANCELLED") {
    const staff = await tx.staff.findFirst({ where: { id: a.staffId }, select: { fullName: true } });
    const r = await messageVisitor(tx, ctx, {
      to: { name: a.visitorName, phone: a.visitorPhone }, trigger: "Appointment cancelled",
      text: `Your appointment with ${staff?.fullName ?? "the school"} on ${shortDay(a.date)}, ${clockOf(a.startMin)} is cancelled. Please call the front desk to book another time.`,
      about: { recordType: "Appointment", recordId: a.id },
    });
    sent = sentWords(r);
  }
  return { appointment: a, sent };
}

/** Undo a status change within the undo window. */
export async function undoAppointmentStatus(tx: Tx, ctx: SchoolContext, id: string, previous: string) {
  const a = await tx.appointment.findFirst({ where: { id, archivedAt: null } });
  if (!a) throw new FrontOfficeProblem("This appointment was not found.");
  if (!["BOOKED", "ARRIVED"].includes(previous)) throw new FrontOfficeProblem("This cannot be undone.");
  await tx.appointment.update({ where: { id }, data: { status: previous } });
  await writeAudit(tx, ctx, { action: "status-undone", recordType: "Appointment", recordId: id, before: { status: a.status }, after: { status: previous } });
}

/** Mark arrived: the visitor entry is made with the details filled in (16 §2), when the school does not need a photo or ID first. */
export async function arriveAppointment(tx: Tx, ctx: SchoolContext, id: string, opts: { timeZone: string; now?: Date }) {
  const now = opts.now ?? new Date();
  const a = await tx.appointment.findFirst({ where: { id, archivedAt: null } });
  if (!a) throw new FrontOfficeProblem("This appointment was not found.");
  if (a.status !== "BOOKED") throw new FrontOfficeProblem(`This appointment is already ${a.status.toLowerCase().replace("_", "-")}.`);
  if (a.date.toISOString().slice(0, 10) !== todayIso(opts.timeZone, now)) throw new FrontOfficeProblem("Only today’s appointments can be marked arrived.");
  const s = await frontOfficeSettings(tx, ctx);
  const purpose = s.visitorPurposes.includes("Meeting") ? "Meeting" : s.visitorPurposes[0];
  const r = await registerVisitor(tx, ctx, {
    phone: a.visitorPhone, name: a.visitorName, purpose, meetStaffId: a.staffId, note: `${clockOf(a.startMin)} appointment: ${a.purpose}`.slice(0, 200),
    peopleCount: 1, photo: null, idProofType: null, idProofNo: null, vehicleNo: null, appointmentId: a.id,
  }, { timeZone: opts.timeZone, now });
  await writeAudit(tx, ctx, { action: "status-changed", recordType: "Appointment", recordId: id, before: { status: "BOOKED" }, after: { status: "ARRIVED", visitorEntryId: r.visitor.id } });
  return { appointment: a, visitor: r.visitor, meetName: r.meetName, at: clockAt(now, opts.timeZone) };
}

/** Sends the visitor a reminder of a booked appointment. */
export async function remindAppointment(tx: Tx, ctx: SchoolContext, id: string) {
  const a = await tx.appointment.findFirst({ where: { id, archivedAt: null } });
  if (!a) throw new FrontOfficeProblem("This appointment was not found.");
  if (a.status !== "BOOKED") throw new FrontOfficeProblem("Reminders go only for booked appointments.");
  const staff = await tx.staff.findFirst({ where: { id: a.staffId }, select: { fullName: true } });
  const r = await messageVisitor(tx, ctx, {
    to: { name: a.visitorName, phone: a.visitorPhone }, trigger: "Appointment reminder",
    text: `Reminder: your appointment with ${staff?.fullName ?? "the school"} is on ${shortDay(a.date)}, ${clockOf(a.startMin)}. Please come to the front desk 5 minutes early.`,
    about: { recordType: "Appointment", recordId: a.id },
  });
  if (r.status !== "queued") throw new FrontOfficeProblem(`The reminder was not sent: ${r.note ?? "messages are not set up"}.`);
  return { appointment: a, sent: sentWords(r), staffName: staff?.fullName ?? "" };
}
