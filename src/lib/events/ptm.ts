// PTM (18 §2): plan a parent-teacher meeting day for some classes; each class
// teacher (and subject teachers when asked) gets time slots; school staff book
// a slot for a parent (one parent per slot, checked on the server); the parent
// gets a confirmation and a reminder (automatic message rule "ptm"); on the
// day the teacher marks the parent arrived, sees the student's performance on
// one screen and records notes, which show on the student's profile.
import "server-only";

import type { Ptm, PtmSlot } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { assertYearOpen } from "../academic/years";
import { attendanceSummary } from "../attendance/summary";
import { homeworkDone } from "../homework/progress";
import { ruleStates, sendAutomatic, sendMessage } from "../messaging";
import { staffForUser } from "../people";
import { EventsProblem } from "./problem";
import { eventsSettings } from "./settings";
import { notWorkingDay, syncSourceEntry } from "./calendar";
import { placesOf } from "./places";
import { tellSafely, type Told } from "./tell";
import { classesWords, clock, dayOf, dmy, isoOf, niceDay } from "./words";

export type PtmStatus = "Booking open" | "Today" | "Done";
export const PTM_STATUS_TONE: Record<PtmStatus, "ok" | "brand" | "neutral"> = { "Booking open": "ok", Today: "brand", Done: "neutral" };

export function ptmStatus(p: Pick<Ptm, "date">, today: string): PtmStatus {
  const d = isoOf(p.date);
  return d === today ? "Today" : d < today ? "Done" : "Booking open";
}

export const SLOT_LENGTHS = [5, 10, 15, 20];
const MAX_SLOTS_PER_TEACHER = 72;

export type PlanInput = { date: string; classIds: string[]; startMin: number; endMin: number; slotMinutes: number; venue: string | null; subjectTeachers: boolean; breakStartMin?: number | null; breakEndMin?: number | null };

/** The slot start times of a PTM window, leaving out any slot that would run into the break. */
export function slotStarts(startMin: number, endMin: number, slotMinutes: number, breakStart?: number | null, breakEnd?: number | null) {
  const out: number[] = [];
  for (let m = startMin; m + slotMinutes <= endMin; ) {
    if (breakStart != null && breakEnd != null && m < breakEnd && m + slotMinutes > breakStart) { m = Math.max(m + slotMinutes, breakEnd); continue; }
    out.push(m);
    m += slotMinutes;
  }
  return out;
}

/** "Class teacher, 7 B" / "Mathematics, 6 A–7 B". */
function sectionsWords(labels: string[]) {
  if (labels.length <= 2) return labels.join(", ");
  return `${labels[0]}–${labels[labels.length - 1]}`;
}

export async function planPtm(tx: Tx, ctx: SchoolContext, input: PlanInput, today: string) {
  if (input.date < today) throw new EventsProblem("Pick today or a later date.", "date");
  const year = await tx.academicYear.findFirst({ where: { archivedAt: null, startDate: { lte: dayOf(input.date) }, endDate: { gte: dayOf(input.date) } } });
  if (!year) throw new EventsProblem("Pick a date inside the school year.", "date");
  await assertYearOpen(tx, year.id);
  const off = await notWorkingDay(tx, ctx, input.date, null);
  if (off) throw new EventsProblem(`${off} Pick a working day.`, "date");
  if (!input.classIds.length) throw new EventsProblem("Choose the classes.", "classIds");
  if (!SLOT_LENGTHS.includes(input.slotMinutes)) throw new EventsProblem("Slot length is 5, 10, 15 or 20 minutes.", "slotMinutes");
  if (input.endMin <= input.startMin) throw new EventsProblem("The end time is before the start time.", "endTime");
  if (input.endMin - input.startMin < input.slotMinutes) throw new EventsProblem("The time window is shorter than one slot.", "endTime");
  const hasBreak = input.breakStartMin != null || input.breakEndMin != null;
  if (hasBreak) {
    if (input.breakStartMin == null) throw new EventsProblem("Enter when the break starts.", "breakStart");
    if (input.breakEndMin == null) throw new EventsProblem("Enter when the break ends.", "breakEnd");
    if (input.breakEndMin <= input.breakStartMin) throw new EventsProblem("The break ends before it starts.", "breakEnd");
    if (input.breakStartMin <= input.startMin || input.breakEndMin >= input.endMin) throw new EventsProblem("The break must be inside the time window, with slots before and after it.", "breakStart");
  }
  if ((input.endMin - input.startMin) / input.slotMinutes > MAX_SLOTS_PER_TEACHER) throw new EventsProblem(`That makes more than ${MAX_SLOTS_PER_TEACHER} slots per teacher. Use a shorter window or longer slots.`, "endTime");
  const classes = await tx.schoolClass.findMany({ where: { id: { in: input.classIds }, archivedAt: null }, select: { id: true, name: true, sortOrder: true }, orderBy: { sortOrder: "asc" } });
  if (classes.length !== input.classIds.length) throw new EventsProblem("Some of these classes were not found.", "classIds");
  const clash = await tx.ptm.findFirst({ where: { archivedAt: null, date: dayOf(input.date), classIds: { hasSome: input.classIds } } });
  if (clash) throw new EventsProblem(`There is already a PTM for ${clash.classesLabel} on ${dmy(input.date)}.`, "classIds");

  const sections = await tx.section.findMany({ where: { academicYearId: year.id, classId: { in: input.classIds }, archivedAt: null }, select: { id: true, name: true, classId: true, classTeacherId: true }, orderBy: { name: "asc" } });
  const cls = new Map(classes.map((c) => [c.id, c]));
  const label = (s: { classId: string; name: string }) => `${cls.get(s.classId)!.name.replace(/^Class /, "")} ${s.name}`;
  const ordered = [...sections].sort((a, b) => cls.get(a.classId)!.sortOrder - cls.get(b.classId)!.sortOrder || a.name.localeCompare(b.name));
  type T = { staffId: string; label: string; sectionIds: string[] };
  const teachers = new Map<string, T>();
  for (const s of ordered) {
    if (!s.classTeacherId) continue;
    const t = teachers.get(s.classTeacherId) ?? { staffId: s.classTeacherId, label: "", sectionIds: [] };
    t.sectionIds.push(s.id);
    teachers.set(s.classTeacherId, t);
  }
  for (const t of teachers.values()) t.label = `Class teacher, ${sectionsWords(t.sectionIds.map((id) => label(ordered.find((s) => s.id === id)!)))}`;
  if (input.subjectTeachers) {
    const allocs = await tx.teacherAllocation.findMany({ where: { academicYearId: year.id, sectionId: { in: sections.map((s) => s.id) }, archivedAt: null }, select: { staffId: true, sectionId: true, subject: { select: { name: true } } } });
    const subj = new Map<string, { names: Set<string>; sectionIds: string[] }>();
    for (const a of allocs) {
      if (teachers.has(a.staffId)) continue;
      const x = subj.get(a.staffId) ?? { names: new Set<string>(), sectionIds: [] };
      x.names.add(a.subject.name);
      if (!x.sectionIds.includes(a.sectionId)) x.sectionIds.push(a.sectionId);
      subj.set(a.staffId, x);
    }
    for (const [staffId, x] of subj) {
      const secs = ordered.filter((s) => x.sectionIds.includes(s.id));
      teachers.set(staffId, { staffId, label: `${[...x.names].slice(0, 2).join(" and ")}, ${sectionsWords(secs.map(label))}`, sectionIds: secs.map((s) => s.id) });
    }
  }
  const staff = await tx.staff.findMany({ where: { id: { in: [...teachers.keys()] }, archivedAt: null }, select: { id: true, fullName: true } });
  const live = [...teachers.values()].filter((t) => staff.some((s) => s.id === t.staffId));
  if (!live.length) throw new EventsProblem("No class teachers are set for these classes. Set them in Academic Management, Classes, then plan the PTM.", "classIds", { href: "/academic-management/classes", label: "Open Classes" });

  const classesLabel = classesWords(classes.map((c) => c.name));
  const ptm = await tx.ptm.create({
    data: { schoolId: ctx.schoolId, academicYearId: year.id, date: dayOf(input.date), classIds: classes.map((c) => c.id), classesLabel, startMin: input.startMin, endMin: input.endMin, slotMinutes: input.slotMinutes, venue: input.venue, createdById: ctx.userId,
      breakStartMin: hasBreak ? input.breakStartMin : null, breakEndMin: hasBreak ? input.breakEndMin : null },
  });
  let order = 0;
  for (const t of live) {
    await tx.ptmTeacher.create({ data: { schoolId: ctx.schoolId, ptmId: ptm.id, staffId: t.staffId, label: t.label, sectionIds: t.sectionIds, sortOrder: order++ } });
  }
  const starts = slotStarts(input.startMin, input.endMin, input.slotMinutes, hasBreak ? input.breakStartMin : null, hasBreak ? input.breakEndMin : null);
  if (!starts.length) throw new EventsProblem("No slot fits in this time window. Use a longer window or a shorter break.", "endTime");
  await tx.ptmSlot.createMany({ data: live.flatMap((t) => starts.map((startMin) => ({ schoolId: ctx.schoolId, ptmId: ptm.id, staffId: t.staffId, startMin }))) });
  const entry = await syncSourceEntry(tx, ctx, `ptm:${ptm.id}`, { academicYearId: year.id, type: "ptm", title: `PTM: ${classesLabel}`, date: input.date, classIds: ptm.classIds, details: `${clock(input.startMin)} – ${clock(input.endMin)}${input.venue ? `, ${input.venue}` : ""}` });
  await tx.ptm.update({ where: { id: ptm.id }, data: { calendarEntryId: entry?.id ?? null } });
  await writeAudit(tx, ctx, { action: "planned", recordType: "PTM", recordId: ptm.id, after: { date: dmy(input.date), classes: classesLabel, teachers: live.length, slots: live.length * starts.length, slotMinutes: input.slotMinutes, break: hasBreak ? `${clock(input.breakStartMin!)} – ${clock(input.breakEndMin!)}` : null } });
  return { ptm, teachers: live.length, slots: live.length * starts.length };
}

/** Cancels a PTM day: booked parents are told, the calendar entry goes. */
export async function cancelPtm(tx: Tx, ctx: SchoolContext, ptmId: string, reason: string, today: string) {
  const p = await tx.ptm.findFirst({ where: { id: ptmId, archivedAt: null } });
  if (!p) throw new EventsProblem("This PTM was not found.");
  if (isoOf(p.date) < today) throw new EventsProblem("This PTM is over and cannot be cancelled.");
  const why = reason.trim().replace(/\s+/g, " ");
  if (why.length < 5) throw new EventsProblem("Say why, in a few words. Parents see it.", "reason");
  const booked = await tx.ptmSlot.findMany({ where: { ptmId, studentId: { not: null } }, select: { studentId: true } });
  await tx.ptm.update({ where: { id: p.id }, data: { archivedAt: new Date() } });
  await syncSourceEntry(tx, ctx, `ptm:${p.id}`, null);
  let told: Told | null = null;
  if (booked.length) {
    const school = (await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { name: true } }))?.name ?? "School";
    // Telling the booked parents never blocks the cancellation (ACADEMICS-21).
    told = await tellSafely(() => sendMessage(tx, ctx, { to: { guardiansOf: [...new Set(booked.map((b) => b.studentId!))] }, channels: "preferred", text: `Dear Parent, the parent-teacher meeting on ${niceDay(isoOf(p.date))} for ${p.classesLabel} is cancelled. ${why} - ${school}`, title: "Parent-teacher meeting cancelled", trigger: "PTM cancelled", source: { type: "PTM", id: p.id } }));
  }
  await writeAudit(tx, ctx, { action: "cancelled", recordType: "PTM", recordId: p.id, after: { reason: why, bookingsTold: told?.people ?? 0, notTold: told?.problem ?? null } });
  return { told };
}

/* ---------- Booking ---------- */

async function slotFor(tx: Tx, slotId: string) {
  const slot = await tx.ptmSlot.findFirst({ where: { id: slotId }, include: { ptm: true } });
  if (!slot || slot.ptm.archivedAt) throw new EventsProblem("This slot was not found. The PTM may have been cancelled.");
  return slot;
}

/** A teacher with "own" reach may only work on their own slots. */
export async function assertOwnSlot(tx: Tx, ctx: SchoolContext, slot: Pick<PtmSlot, "staffId">) {
  const me = await staffForUser(tx, ctx);
  if (!me || me.id !== slot.staffId) throw new EventsProblem("This is another teacher's slot. You can work only on your own slots.");
}

async function studentFirst(tx: Tx, studentId: string) {
  return (await tx.student.findFirst({ where: { id: studentId }, select: { firstName: true, fullName: true } })) ?? { firstName: "This student", fullName: "This student" };
}

export async function bookSlot(tx: Tx, ctx: SchoolContext, slotId: string, studentId: string, today: string, opts: { own?: boolean } = {}) {
  const slot = await slotFor(tx, slotId);
  if (opts.own) await assertOwnSlot(tx, ctx, slot);
  if (isoOf(slot.ptm.date) < today) throw new EventsProblem("This PTM is over. Slots cannot be booked now.");
  const teacher = await tx.ptmTeacher.findFirst({ where: { ptmId: slot.ptmId, staffId: slot.staffId } });
  const staff = await tx.staff.findFirst({ where: { id: slot.staffId }, select: { fullName: true } });
  const tName = staff?.fullName ?? "this teacher";
  if (slot.studentId) {
    const who = await studentFirst(tx, slot.studentId);
    throw new EventsProblem(`Slot taken by ${who.firstName}'s parent. Pick another slot.`);
  }
  const enrol = await tx.enrolment.findFirst({ where: { studentId, academicYearId: slot.ptm.academicYearId, archivedAt: null, status: "STUDYING" }, select: { sectionId: true, classId: true } });
  if (!enrol || !slot.ptm.classIds.includes(enrol.classId)) throw new EventsProblem(`This student is not in ${slot.ptm.classesLabel}.`, "studentId");
  if (teacher && teacher.sectionIds.length && !teacher.sectionIds.includes(enrol.sectionId)) throw new EventsProblem(`${tName} does not teach this student's class. Pick their class or subject teacher.`, "studentId");
  const s = await studentFirst(tx, studentId);
  const already = await tx.ptmSlot.findFirst({ where: { ptmId: slot.ptmId, staffId: slot.staffId, studentId } });
  if (already) throw new EventsProblem(`${s.firstName}'s parent already has a slot with ${tName} at ${clock(already.startMin)}. Pick another student or slot.`, "studentId");
  const primary = await tx.studentGuardian.findFirst({ where: { studentId, archivedAt: null }, orderBy: [{ isPrimary: "desc" }, { emergencyOrder: "asc" }], select: { guardianId: true } });
  // One parent per slot: only a free slot is taken (another person booking the same slot at once gets 0 rows).
  const took = await tx.ptmSlot.updateMany({ where: { id: slot.id, studentId: null }, data: { studentId, guardianId: primary?.guardianId ?? null, bookedById: ctx.userId, bookedAt: new Date(), bookedVia: "office", arrivedAt: null, remindedAt: null } });
  if (took.count === 0) {
    const now = await tx.ptmSlot.findFirst({ where: { id: slot.id } });
    const who = now?.studentId ? await studentFirst(tx, now.studentId) : null;
    throw new EventsProblem(`Slot taken by ${who?.firstName ?? "another"}'s parent. Pick another slot.`);
  }
  await writeAudit(tx, ctx, { action: "booked", recordType: "PTM Slot", recordId: slot.id, after: { student: s.fullName, teacher: tName, time: clock(slot.startMin), date: dmy(isoOf(slot.ptm.date)) } });
  const confirm = await tellParent(tx, ctx, { ...slot, studentId }, tName, "confirm");
  return { student: s, teacher: tName, time: clock(slot.startMin), date: isoOf(slot.ptm.date), messaged: confirm };
}

/** The confirmation now, or the reminder before the day (automatic message rule "ptm"). */
export async function tellParent(tx: Tx, ctx: SchoolContext, slot: PtmSlot & { ptm: Ptm }, teacher: string, kind: "confirm" | "remind") {
  if (!slot.studentId) return false;
  const places = await placesOf(tx, [slot.studentId], slot.ptm.academicYearId);
  const place = places.get(slot.studentId);
  const r = await sendAutomatic(tx, ctx, {
    rule: "ptm",
    event: { key: `ptm-${kind}:${slot.id}:${slot.studentId}:${slot.bookedAt?.getTime() ?? 0}`, label: kind === "confirm" ? `PTM booked: ${niceDay(isoOf(slot.ptm.date))}` : `PTM reminder: ${niceDay(isoOf(slot.ptm.date))}` },
    to: slot.guardianId ? { guardianIds: [slot.guardianId] } : { guardiansOf: [slot.studentId] },
    perStudent: { [slot.studentId]: { class: `${place?.label ?? slot.ptm.classesLabel} with ${teacher} at ${clock(slot.startMin)}`, date: niceDay(isoOf(slot.ptm.date)) } },
    values: { class: `${place?.label ?? slot.ptm.classesLabel} with ${teacher} at ${clock(slot.startMin)}`, date: niceDay(isoOf(slot.ptm.date)) },
    source: { type: "PTM", id: slot.ptmId },
  });
  if (kind === "remind") await tx.ptmSlot.update({ where: { id: slot.id }, data: { remindedAt: new Date() } });
  return r.status === "sent";
}

export async function cancelBooking(tx: Tx, ctx: SchoolContext, slotId: string, today: string, opts: { own?: boolean } = {}) {
  const slot = await slotFor(tx, slotId);
  if (opts.own) await assertOwnSlot(tx, ctx, slot);
  if (!slot.studentId) throw new EventsProblem("This slot is not booked.");
  if (isoOf(slot.ptm.date) < today) throw new EventsProblem("This PTM is over.");
  if (await tx.ptmMeetingNote.findFirst({ where: { slotId } })) throw new EventsProblem("Notes are saved for this meeting, so the booking stays.");
  const s = await studentFirst(tx, slot.studentId);
  await tx.ptmSlot.update({ where: { id: slot.id }, data: { studentId: null, guardianId: null, bookedById: null, bookedAt: null, bookedVia: null, arrivedAt: null, remindedAt: null } });
  await writeAudit(tx, ctx, { action: "booking-cancelled", recordType: "PTM Slot", recordId: slot.id, before: { student: s.fullName, time: clock(slot.startMin) } });
  return { student: s, time: clock(slot.startMin) };
}

/* ---------- On the day ---------- */

export async function markArrived(tx: Tx, ctx: SchoolContext, slotId: string, arrived: boolean, today: string, opts: { own?: boolean } = {}) {
  const slot = await slotFor(tx, slotId);
  if (opts.own) await assertOwnSlot(tx, ctx, slot);
  if (!slot.studentId) throw new EventsProblem("This slot is not booked.");
  if (isoOf(slot.ptm.date) > today) throw new EventsProblem(`Parents are marked on the day, ${dmy(isoOf(slot.ptm.date))}.`);
  await tx.ptmSlot.update({ where: { id: slot.id }, data: { arrivedAt: arrived ? slot.arrivedAt ?? new Date() : null } });
  await writeAudit(tx, ctx, { action: arrived ? "arrived" : "arrived-undone", recordType: "PTM Slot", recordId: slot.id });
  return slot;
}

export async function setQueue(tx: Tx, ctx: SchoolContext, ptmId: string, open: boolean, today: string) {
  const p = await tx.ptm.findFirst({ where: { id: ptmId, archivedAt: null } });
  if (!p) throw new EventsProblem("This PTM was not found.");
  if (open && isoOf(p.date) !== today) throw new EventsProblem("The waiting queue opens on the day of the PTM.");
  await tx.ptm.update({ where: { id: p.id }, data: { queueOpen: open } });
  await writeAudit(tx, ctx, { action: open ? "queue-opened" : "queue-closed", recordType: "PTM", recordId: p.id });
  return p;
}

/** Parents waiting per teacher, in slot order: arrived, notes not yet saved. */
export async function waitingQueue(tx: Tx, ptmId: string) {
  const slots = await tx.ptmSlot.findMany({ where: { ptmId, arrivedAt: { not: null }, studentId: { not: null } }, orderBy: [{ startMin: "asc" }] });
  const noted = new Set((await tx.ptmMeetingNote.findMany({ where: { ptmId }, select: { slotId: true } })).map((n) => n.slotId));
  return slots.filter((s) => !noted.has(s.id));
}

export type NotesInput = { remarks: string | null; feedback: string | null; followUp: string | null; arrived: boolean };

export async function saveNotes(tx: Tx, ctx: SchoolContext, slotId: string, input: NotesInput, today: string, opts: { own?: boolean } = {}) {
  const slot = await slotFor(tx, slotId);
  if (opts.own) await assertOwnSlot(tx, ctx, slot);
  if (!slot.studentId) throw new EventsProblem("This slot is not booked.");
  if (isoOf(slot.ptm.date) > today) throw new EventsProblem(`Notes are written on the day, ${dmy(isoOf(slot.ptm.date))}.`);
  if (!input.remarks && !input.feedback && !input.followUp) throw new EventsProblem("Write the teacher remarks, the parent feedback or a follow-up.", "remarks");
  const before = await tx.ptmMeetingNote.findFirst({ where: { slotId } });
  const note = before
    ? await tx.ptmMeetingNote.update({ where: { id: before.id }, data: { remarks: input.remarks, feedback: input.feedback, followUp: input.followUp, updatedById: ctx.userId } })
    : await tx.ptmMeetingNote.create({ data: { schoolId: ctx.schoolId, slotId, ptmId: slot.ptmId, studentId: slot.studentId, staffId: slot.staffId, remarks: input.remarks, feedback: input.feedback, followUp: input.followUp, createdById: ctx.userId } });
  if (input.arrived && !slot.arrivedAt) await tx.ptmSlot.update({ where: { id: slot.id }, data: { arrivedAt: new Date() } });
  if (!input.arrived && slot.arrivedAt) await tx.ptmSlot.update({ where: { id: slot.id }, data: { arrivedAt: null } });
  await writeAudit(tx, ctx, { action: before ? "notes-changed" : "notes-saved", recordType: "PTM Meeting Note", recordId: note.id, before: before ? { remarks: before.remarks, feedback: before.feedback, followUp: before.followUp } : undefined, after: { remarks: note.remarks, feedback: note.feedback, followUp: note.followUp } });
  const s = await studentFirst(tx, slot.studentId);
  return { note, student: s };
}

/* ---------- Performance view ---------- */

export type Performance = {
  attendance: number | null;
  homework: number | null;
  latest: { exam: string; percent: number | null; subjects: { name: string; marks: number | null; max: number | null; before: number | null; low: boolean }[]; previous: string | null } | null;
  behaviour: { date: string; kind: string; text: string }[];
};

type SubjectRow = { subjectId?: string; name?: string; max?: number | null; marks?: number | null; absent?: boolean; passed?: boolean };

/** The student's latest marks, attendance % and behaviour notes on one screen (18 §2, PTM). */
export async function performance(tx: Tx, ctx: SchoolContext, studentId: string, academicYearId: string, today: string): Promise<Performance> {
  const year = await tx.academicYear.findFirst({ where: { id: academicYearId } });
  let attendance: number | null = null;
  if (year) {
    const sum = await attendanceSummary(tx, ctx, { studentId, from: year.startDate, to: year.endDate, today: dayOf(today) });
    attendance = sum.people.get(studentId)?.percent ?? null;
  }
  const results = await tx.result.findMany({ where: { studentId, academicYearId, examId: { not: null } }, orderBy: { computedAt: "desc" }, take: 2 });
  let latest: Performance["latest"] = null;
  if (results.length) {
    const exams = await tx.exam.findMany({ where: { id: { in: results.map((r) => r.examId!) } }, select: { id: true, title: true } });
    const title = (id: string | null) => exams.find((e) => e.id === id)?.title ?? "Exam";
    const now = (results[0].subjects as SubjectRow[]) ?? [];
    const prev = results[1] ? ((results[1].subjects as SubjectRow[]) ?? []) : [];
    latest = {
      exam: title(results[0].examId),
      percent: results[0].percent != null ? Math.round(results[0].percent) : null,
      previous: results[1] ? title(results[1].examId) : null,
      subjects: now.map((s) => {
        const p = prev.find((x) => x.subjectId === s.subjectId);
        const marks = s.absent ? null : s.marks ?? null;
        return { name: s.name ?? "Subject", marks, max: s.max ?? null, before: p && !p.absent ? p.marks ?? null : null, low: s.passed === false || (marks != null && s.max ? marks / s.max < 0.4 : false) };
      }),
    };
  }
  const links = await tx.behaviourIncidentStudent.findMany({ where: { studentId }, select: { incidentId: true } });
  const incidents = links.length ? await tx.behaviourIncident.findMany({ where: { id: { in: links.map((l) => l.incidentId) }, archivedAt: null, academicYearId }, orderBy: { date: "desc" }, take: 3 }) : [];
  const homework = (await homeworkDone(tx, [studentId], academicYearId, dayOf(today))).get(studentId)?.pct ?? null;
  return {
    attendance,
    homework,
    latest,
    behaviour: incidents.map((i) => ({ date: isoOf(i.date), kind: i.kind, text: i.description })),
  };
}

/* ---------- After the day ---------- */

/** Booked parents who did not come (no arrival, no notes). */
export async function absentParents(tx: Tx, ptmId: string) {
  const slots = await tx.ptmSlot.findMany({ where: { ptmId, studentId: { not: null }, arrivedAt: null } });
  const noted = new Set((await tx.ptmMeetingNote.findMany({ where: { ptmId }, select: { slotId: true } })).map((n) => n.slotId));
  return [...new Set(slots.filter((s) => !noted.has(s.id)).map((s) => s.studentId!))];
}

export async function sendSummary(tx: Tx, ctx: SchoolContext, ptmId: string, today: string) {
  const p = await tx.ptm.findFirst({ where: { id: ptmId, archivedAt: null } });
  if (!p) throw new EventsProblem("This PTM was not found.");
  if (isoOf(p.date) > today) throw new EventsProblem("The summary goes after the PTM.");
  if (p.summarySentAt) throw new EventsProblem(`The summary was already sent on ${dmy(isoOf(p.summarySentAt))}.`);
  const students = await absentParents(tx, ptmId);
  if (!students.length) throw new EventsProblem("Every booked parent came. There is no one to send the summary to.");
  const school = (await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { name: true } }))?.name ?? "School";
  const r = await sendMessage(tx, ctx, {
    to: { guardiansOf: students }, channels: "preferred",
    text: `Dear Parent, we missed you at the parent-teacher meeting on ${niceDay(isoOf(p.date))}. Please call the class teacher to talk about your child's progress. - ${school}`,
    trigger: "PTM summary", source: { type: "PTM", id: p.id },
  });
  await tx.ptm.update({ where: { id: p.id }, data: { summarySentAt: new Date() } });
  await writeAudit(tx, ctx, { action: "summary-sent", recordType: "PTM", recordId: p.id, after: { parents: r.people } });
  return { people: r.people, students: students.length };
}

/** The evening-before reminders (run by a schedule; each slot once). */
export async function sendPtmReminders(tx: Tx, ctx: SchoolContext, today: string, hour: number) {
  const s = await eventsSettings(tx, ctx);
  const rule = (await ruleStates(tx, ctx)).find((r) => r.key === "ptm");
  const daysBefore = Math.max(0, Math.min(7, Number(rule?.timing.daysBefore ?? 1) || 1));
  const target = isoOf(new Date(dayOf(today).getTime() + daysBefore * 86_400_000));
  if (hour < s.ptmReminderHour && daysBefore > 0) return 0;
  const ptms = await tx.ptm.findMany({ where: { archivedAt: null, date: { gt: dayOf(today), lte: dayOf(target) } } });
  let sent = 0;
  for (const p of ptms) {
    const slots = await tx.ptmSlot.findMany({ where: { ptmId: p.id, studentId: { not: null }, remindedAt: null } });
    const staff = await tx.staff.findMany({ where: { id: { in: [...new Set(slots.map((x) => x.staffId))] } }, select: { id: true, fullName: true } });
    for (const slot of slots) {
      if (await tellParent(tx, ctx, { ...slot, ptm: p }, staff.find((x) => x.id === slot.staffId)?.fullName ?? "the teacher", "remind")) sent++;
    }
  }
  return sent;
}
