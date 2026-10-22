// Student Pickup (16 §2): find the student, show the approved pickup list
// from Student Management (restricted guardians in red, never selectable),
// verify the person collecting (photo match, and a one-time code to the
// guardian's registered mobile when the school switches it on), and make a
// Gate Pass of kind Pickup that Gate Security checks before the child leaves.
import "server-only";

import { createHash, randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { formatNumber, nextNumber } from "../sequences";
import { currentYearIds } from "../academic/years";
import { isSchoolDay } from "../calendar/school-days";
import { findStudents } from "../students/find";
import { inCampus, type CampusLimit } from "../campus";
import { FrontOfficeProblem } from "./problem";
import { messageVisitor } from "./notify";
import { channelInTestMode, logCodeSentBy } from "../dev-codes";
import { clockAt, instantOf, localOf, todayIso } from "./time";
import { maskPhone, NO_PHOTO_CHECKS, PICKUP_REASONS, type NoPhotoCheck } from "./words";

export type PickupStudent = { id: string; name: string; first: string; admissionNo: string; photoFileId: string | null; classSection: string | null; rollNo: number | null };

export async function enrolmentsOf(tx: Tx, ctx: SchoolContext, ids: string[]) {
  // Each student's class in their own campus's current year.
  const yearIds = await currentYearIds(tx, ctx);
  if (!ids.length || !yearIds.length) return new Map<string, { sectionId: string; classId: string; campusId: string; label: string; rollNo: number | null; classTeacherId: string | null }>();
  const rows = await tx.enrolment.findMany({ where: { studentId: { in: ids }, academicYearId: { in: yearIds }, archivedAt: null }, select: { studentId: true, sectionId: true, rollNo: true } });
  const sections = await tx.section.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.sectionId))] } }, select: { id: true, name: true, classTeacherId: true, schoolClass: { select: { id: true, name: true, campusId: true } } } });
  const byId = new Map(sections.map((s) => [s.id, s]));
  const out = new Map<string, { sectionId: string; classId: string; campusId: string; label: string; rollNo: number | null; classTeacherId: string | null }>();
  for (const r of rows) {
    const s = byId.get(r.sectionId);
    if (s) out.set(r.studentId, { sectionId: s.id, classId: s.schoolClass.id, campusId: s.schoolClass.campusId, label: `${s.schoolClass.name.replace(/^Class\s+/i, "")} ${s.name}`, rollNo: r.rollNo, classTeacherId: s.classTeacherId });
  }
  return out;
}

/** Students matching a search (the one student search), or a whole class like "7 B"; only the person's campus's when they are limited to one. */
export async function searchStudents(tx: Tx, ctx: SchoolContext, rawQ: string, take = 8, limit?: CampusLimit | null): Promise<PickupStudent[]> {
  const q = rawQ.trim().replace(/\s+/g, " ").slice(0, 60);
  if (q.length < 2) return [];
  const where: Prisma.StudentWhereInput = { archivedAt: null, status: "ACTIVE", ...inCampus(limit) };
  const cls = /^(?:class\s+)?([a-z0-9]+)\s*[- ]?\s*([a-z])$/i.exec(q);
  let ids: string[] | null = null;
  if (cls) {
    const yearIds = await currentYearIds(tx, ctx);
    const sections = yearIds.length ? await tx.section.findMany({
      where: { academicYearId: { in: yearIds }, archivedAt: null, name: { equals: cls[2], mode: "insensitive" }, schoolClass: { ...inCampus(limit), OR: [{ name: { equals: cls[1], mode: "insensitive" } }, { name: { equals: `Class ${cls[1]}`, mode: "insensitive" } }] } },
      select: { id: true },
    }) : [];
    if (sections.length) {
      ids = (await tx.enrolment.findMany({ where: { sectionId: { in: sections.map((s) => s.id) }, archivedAt: null }, select: { studentId: true }, orderBy: { rollNo: "asc" }, take: 80 })).map((e) => e.studentId);
    }
  }
  if (!ids) {
    // The one student search: name (one letter wrong allowed), admission or roll number, parent name or phone.
    const hits = await findStudents(tx, q, { scope: inCampus(limit), yearId: await currentYearIds(tx, ctx), statuses: ["ACTIVE"], take });
    return hits.map((h) => ({ id: h.id, name: h.name, first: h.firstName, admissionNo: h.admissionNo, photoFileId: h.photoFileId, classSection: h.classSection?.replace(/^Class\s+/i, "") ?? null, rollNo: h.rollNo }));
  }
  const rows = await tx.student.findMany({
    where: { ...where, id: { in: ids } },
    select: { id: true, fullName: true, firstName: true, admissionNo: true, photoFileId: true },
    orderBy: { fullName: "asc" },
    take: 80,
  });
  const enr = await enrolmentsOf(tx, ctx, rows.map((r) => r.id));
  return rows.map((r) => ({ id: r.id, name: r.fullName, first: r.firstName, admissionNo: r.admissionNo, photoFileId: r.photoFileId, classSection: enr.get(r.id)?.label ?? null, rollNo: enr.get(r.id)?.rollNo ?? null }));
}

export type PickupPerson = { guardianId: string; name: string; relationship: string; phone: string; photoFileId: string | null; restriction: string | null; allowed: boolean };

/**
 * The student, their class teacher, today's attendance, whether today is a
 * school day for their class (the one school-day rule, so a holiday is named
 * instead of "attendance not marked yet", QA FO-02) and the approved pickup list.
 */
export async function pickupStudent(tx: Tx, ctx: SchoolContext, studentId: string, today: Date) {
  const s = await tx.student.findFirst({
    where: { id: studentId, archivedAt: null },
    select: {
      id: true, fullName: true, firstName: true, admissionNo: true, photoFileId: true, status: true,
      guardians: {
        where: { archivedAt: null, guardian: { archivedAt: null } },
        orderBy: [{ emergencyOrder: { sort: "asc", nulls: "last" } }, { isPrimary: "desc" }],
        select: { relationship: true, canPickUp: true, restriction: true, guardian: { select: { id: true, name: true, phone: true, photoFileId: true } } },
      },
    },
  });
  if (!s) return null;
  const enr = (await enrolmentsOf(tx, ctx, [s.id])).get(s.id) ?? null;
  const [teacher, mark, day] = await Promise.all([
    enr?.classTeacherId ? tx.staff.findFirst({ where: { id: enr.classTeacherId }, select: { fullName: true, userLoginId: true } }) : null,
    tx.attendanceMark.findFirst({ where: { studentId: s.id, date: today, periodNo: 0, archivedAt: null }, select: { statusKey: true } }),
    isSchoolDay(tx, ctx, today, { campusId: enr?.campusId ?? null, classId: enr?.classId ?? null }),
  ]);
  const status = mark ? await tx.attendanceStatus.findFirst({ where: { key: mark.statusKey }, select: { name: true, tone: true } }) : null;
  const people: PickupPerson[] = s.guardians
    .filter((g) => g.canPickUp || g.restriction)
    .map((g) => ({ guardianId: g.guardian.id, name: g.guardian.name, relationship: g.relationship, phone: g.guardian.phone, photoFileId: g.guardian.photoFileId, restriction: g.restriction?.trim() || null, allowed: g.canPickUp && !g.restriction?.trim() }));
  return {
    student: { id: s.id, name: s.fullName, first: s.firstName, admissionNo: s.admissionNo, photoFileId: s.photoFileId, classSection: enr?.label ?? null, rollNo: enr?.rollNo ?? null, sectionId: enr?.sectionId ?? null },
    classTeacher: teacher?.fullName ?? null,
    classTeacherLogin: teacher?.userLoginId ?? null,
    attendance: status ? { label: status.name, tone: status.tone } : null,
    /** Null on a school day; else why the school is closed today for this student's class. */
    closed: day.on ? null : { reason: day.reason, title: day.title },
    people,
  };
}

const hashCode = (id: string, code: string) => createHash("sha256").update(`${id}:${code}`).digest("hex");
const CODE_MINUTES = 10;

/** Sends a one-time 4-digit code to the guardian's registered mobile (kept only as a hash). */
export async function sendPickupCode(tx: Tx, ctx: SchoolContext, studentId: string, guardianId: string, now = new Date()) {
  const link = await tx.studentGuardian.findFirst({ where: { studentId, guardianId, archivedAt: null }, include: { guardian: true, student: { select: { firstName: true } } } });
  if (!link || !link.canPickUp || link.restriction?.trim()) throw new FrontOfficeProblem("This person is not on the student’s pickup list. Call a registered guardian.");
  const recent = await tx.pickupCode.count({ where: { studentId, guardianId, createdAt: { gte: new Date(now.getTime() - CODE_MINUTES * 60_000) } } });
  if (recent >= 3) throw new FrontOfficeProblem("Three codes were already sent in the last 10 minutes. Wait a little, or verify by calling the guardian.");
  const code = String(randomInt(0, 10_000)).padStart(4, "0");
  const row = await tx.pickupCode.create({ data: { schoolId: ctx.schoolId, studentId, guardianId, codeHash: "pending", expiresAt: new Date(now.getTime() + CODE_MINUTES * 60_000) } });
  await tx.pickupCode.update({ where: { id: row.id }, data: { codeHash: hashCode(row.id, code) } });
  const sent = await messageVisitor(tx, ctx, {
    to: { name: link.guardian.name, phone: link.guardian.phone }, trigger: "Pickup code",
    text: `Code ${code} to collect ${link.student.firstName} from school. Give it only to the front desk. It works for ${CODE_MINUTES} minutes.`,
    about: { recordType: "Student", recordId: studentId }, secret: true,
  });
  if (sent.status !== "queued") {
    throw new FrontOfficeProblem(`The code could not be sent: ${sent.note ?? "messages are not set up"}. Verify by calling the guardian instead.`);
  }
  const inLog = await logCodeSentBy(tx, ctx, sent.channel, { to: link.guardian.phone, purpose: "pickup", code });
  await writeAudit(tx, ctx, { action: "pickup-code-sent", recordType: "Student", recordId: studentId, after: { guardianId, to: maskPhone(link.guardian.phone) } });
  // Test mode only records the message, so the desk must not be told it was sent (QA ADMIT-03).
  return { to: maskPhone(link.guardian.phone), channel: sent.channel, testMode: await channelInTestMode(tx, ctx, sent.channel), inLog };
}

async function checkCode(tx: Tx, studentId: string, guardianId: string, code: string, now: Date) {
  if (!/^\d{4}$/.test(code)) throw new FrontOfficeProblem("Enter the 4-digit code the guardian received.", "code");
  const row = await tx.pickupCode.findFirst({ where: { studentId, guardianId, usedAt: null, expiresAt: { gt: now } }, orderBy: { createdAt: "desc" } });
  if (!row) throw new FrontOfficeProblem("The code has expired or was not sent. Send a new code.", "code");
  if (row.attempts >= 5) throw new FrontOfficeProblem("Too many wrong codes. Send a new code, or call the guardian.", "code");
  if (row.codeHash !== hashCode(row.id, code)) {
    await tx.pickupCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    throw new FrontOfficeProblem("That code is not right. Ask them to read it again.", "code");
  }
  await tx.pickupCode.update({ where: { id: row.id }, data: { usedAt: now } });
}

export type ReleaseInput = { studentId: string; guardianId: string; photoMatch: boolean; otherCheck?: NoPhotoCheck | null; code: string | null; reason: string; otherReason: string | null; minute: number | null };

/** Releases a student to a person on the approved list and makes the Pickup gate pass (16 Done when 3, 4, 12). */
export async function releaseStudent(tx: Tx, ctx: SchoolContext, input: ReleaseInput, opts: { timeZone: string; codeCheck: boolean; now?: Date }) {
  const now = opts.now ?? new Date();
  const day = todayIso(opts.timeZone, now);
  const today = new Date(`${day}T00:00:00Z`);
  const info = await pickupStudent(tx, ctx, input.studentId, today);
  if (!info) throw new FrontOfficeProblem("This student was not found.");
  const person = info.people.find((p) => p.guardianId === input.guardianId);
  if (!person || !person.allowed) {
    throw new FrontOfficeProblem(`Not on ${info.student.first}’s pickup list. Call a registered guardian.`, "guardianId");
  }
  // A photo on record is matched with the face; without one the desk checks ID proof or calls a guardian.
  const first = person.name.split(" ")[0];
  const checks: string[] = [];
  if (person.photoFileId) {
    if (!input.photoMatch) throw new FrontOfficeProblem(`Check that ${first}’s face matches the photo.`, "photoMatch");
    checks.push("photo");
  } else {
    if (!input.otherCheck) throw new FrontOfficeProblem(`No photo of ${first} on record. Check their ID proof, or call a registered parent or guardian.`, "photoMatch");
    checks.push(NO_PHOTO_CHECKS[input.otherCheck]);
  }
  if (opts.codeCheck) await checkCode(tx, input.studentId, input.guardianId, (input.code ?? "").trim(), now);
  let reason = input.reason;
  if (!(PICKUP_REASONS as readonly string[]).includes(reason)) throw new FrontOfficeProblem("Choose a reason.", "reason");
  if (reason === "Other") {
    reason = (input.otherReason ?? "").trim().replace(/\s+/g, " ");
    if (reason.length < 3) throw new FrontOfficeProblem("Type the reason.", "otherReason");
    if (reason.length > 120) throw new FrontOfficeProblem("Keep the reason to 120 characters.", "otherReason");
  }
  let timeOut = now;
  if (input.minute != null) {
    timeOut = instantOf(day, input.minute, opts.timeZone);
    if (Math.abs(timeOut.getTime() - now.getTime()) > 3 * 3600_000) throw new FrontOfficeProblem("The time must be today, within 3 hours of now.", "time");
  }
  const open = await tx.gatePass.findFirst({ where: { studentId: input.studentId, kind: "PICKUP", status: "ISSUED", archivedAt: null, timeOut: { gte: instantOf(day, 0, opts.timeZone) } } });
  if (open) throw new FrontOfficeProblem(`${info.student.first} already has gate pass ${open.passNo} waiting at the gate.`);
  const passNo = formatNumber(`GP-${day.slice(0, 4)}-`, await nextNumber(tx, ctx, `gate-pass-${day.slice(0, 4)}`), 4);
  if (opts.codeCheck) checks.push("code");
  const verification = checks.join(", ");
  const pass = await tx.gatePass.create({
    data: {
      schoolId: ctx.schoolId, passNo, kind: "PICKUP", studentId: input.studentId, sectionLabel: info.student.classSection, reason, timeOut,
      issuedById: ctx.userId, guardianId: person.guardianId, collectorName: person.name, collectorRelation: person.relationship, verification,
    },
  });
  // Attendance (open question 16 §10): the day's mark keeps its status; the time out and the pass are noted on it.
  const mark = await tx.attendanceMark.findFirst({ where: { studentId: input.studentId, date: today, periodNo: 0, archivedAt: null } });
  if (mark) {
    await tx.attendanceMark.update({ where: { id: mark.id }, data: { outTime: timeOut, note: [mark.note, `Early pickup ${clockAt(timeOut, opts.timeZone)} with ${person.name} (${passNo})`].filter(Boolean).join(" · ") } });
  }
  if (info.classTeacherLogin) {
    await notify(tx, ctx, { to: info.classTeacherLogin, type: "early-pickup", text: `${info.student.name} leaves early at ${clockAt(timeOut, opts.timeZone)} with ${person.name} (${person.relationship.toLowerCase()}): ${input.reason === "Other" ? reason : reason.toLowerCase()}. Gate pass ${passNo}.`, link: `/student-management/students/${input.studentId}` }, now);
  }
  await writeAudit(tx, ctx, {
    action: "created", recordType: "Gate Pass", recordId: pass.id,
    after: { passNo, kind: "Pickup", studentId: input.studentId, collector: person.name, relation: person.relationship, verification, reason, timeOut: timeOut.toISOString() },
  });
  return { pass, student: info.student, person, classTeacher: info.classTeacher };
}

/** Gate Security lets the child out on a checked pass: recorded in the gate log. */
export async function letOut(tx: Tx, ctx: SchoolContext, gatePassId: string, opts: { timeZone: string; now?: Date }) {
  const now = opts.now ?? new Date();
  const g = await tx.gatePass.findFirst({ where: { id: gatePassId, archivedAt: null } });
  if (!g) throw new FrontOfficeProblem("This gate pass was not found.");
  if (g.status === "LEFT") throw new FrontOfficeProblem(`Already used at ${g.leftAt ? clockAt(g.leftAt, opts.timeZone) : "an earlier time"}. Do not let the child out again on this pass.`);
  if (localOf(g.timeOut, opts.timeZone).slice(0, 10) !== todayIso(opts.timeZone, now)) throw new FrontOfficeProblem(`Gate pass ${g.passNo} was for another day. Send them to the front desk.`);
  const student = await tx.student.findFirst({ where: { id: g.studentId }, select: { fullName: true } });
  await tx.gatePass.update({ where: { id: g.id }, data: { status: "LEFT", leftAt: now, gateCheckedById: ctx.userId } });
  await tx.gateEntry.create({
    data: { schoolId: ctx.schoolId, at: now, direction: "OUT", kind: "person", who: `${student?.fullName ?? "Student"}${g.sectionLabel ? `, ${g.sectionLabel}` : ""}, with ${g.collectorRelation?.toLowerCase() ?? "guardian"} ${g.collectorName ?? ""}`.trim(), purpose: `Pickup gate pass ${g.passNo} checked`, gatePassId: g.id, recordedById: ctx.userId },
  });
  await writeAudit(tx, ctx, { action: "left", recordType: "Gate Pass", recordId: g.id, before: { status: "ISSUED" }, after: { status: "LEFT", leftAt: now.toISOString() } });
  return { pass: g, student: student?.fullName ?? "Student" };
}

/** "Someone not on this list is here": kept with the student's record and the class teacher is told. */
export async function refusedPickup(tx: Tx, ctx: SchoolContext, studentId: string, who: string, opts: { timeZone: string; now?: Date }) {
  const now = opts.now ?? new Date();
  const info = await pickupStudent(tx, ctx, studentId, new Date(`${todayIso(opts.timeZone, now)}T00:00:00Z`));
  if (!info) throw new FrontOfficeProblem("This student was not found.");
  const name = who.trim().replace(/\s+/g, " ").slice(0, 120) || "Someone not on the list";
  await writeAudit(tx, ctx, { action: "pickup-refused", recordType: "Student", recordId: studentId, after: { who: name, at: now.toISOString() } });
  if (info.classTeacherLogin) {
    await notify(tx, ctx, { to: info.classTeacherLogin, type: "pickup-refused", text: `${name} came to collect ${info.student.name} at ${clockAt(now, opts.timeZone)} and is not on the pickup list. ${info.student.first} stays in class.`, link: `/student-management/students/${studentId}` }, now);
  }
  return { student: info.student, classTeacher: info.classTeacher, told: Boolean(info.classTeacherLogin) };
}

/** Today's early pickups, newest first. */
export async function pickupsOn(tx: Tx, from: Date, to: Date) {
  const rows = await tx.gatePass.findMany({ where: { kind: "PICKUP", archivedAt: null, timeOut: { gte: from, lt: to } }, orderBy: { timeOut: "desc" }, take: 200 });
  const [students, issuers, checkers] = await Promise.all([
    tx.student.findMany({ where: { id: { in: rows.map((r) => r.studentId) } }, select: { id: true, fullName: true, photoFileId: true } }),
    tx.userLogin.findMany({ where: { id: { in: rows.map((r) => r.issuedById).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } }),
    tx.userLogin.findMany({ where: { id: { in: rows.map((r) => r.gateCheckedById).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } }),
  ]);
  return rows.map((r) => ({
    ...r,
    student: students.find((s) => s.id === r.studentId)?.fullName ?? "Student",
    studentPhotoFileId: students.find((s) => s.id === r.studentId)?.photoFileId ?? null,
    issuedBy: issuers.find((u) => u.id === r.issuedById)?.displayName ?? null,
    checkedBy: checkers.find((u) => u.id === r.gateCheckedById)?.displayName ?? null,
  }));
}
export type PickupRow = Awaited<ReturnType<typeof pickupsOn>>[number];
