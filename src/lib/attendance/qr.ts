// QR check-in and mobile check-in (05 §2 Devices & QR). A QR session's code
// is made from a secret: a new code every day (default) or a fixed one. A
// scan is checked for the school, the session, the campus area when it is on,
// and blocked when the person is already marked that day.
import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { GeoFence, QrSession } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { decryptField, encryptField } from "../crypto";
import { formatTime } from "../format";
import { isoDay } from "../staff/dates";
import { AttendanceProblem, campusOpen, campusOrSchool, type AttendanceAccess } from "./access";
import { dayInfo } from "./calendar";
import { offDayWords } from "../calendar/school-days";
import { attendanceFeatures, attendanceSettings } from "./settings";
import { metresBetween, schoolDateOf } from "./time";
import { shiftsOn, statusFromInTime } from "./staff";
import { enrolmentOn } from "./student-leave";
import { queueAfterSave } from "./after-save";

export const POSTER_THEMES = [
  { value: "ocean", label: "Ocean Blue" },
  { value: "purple", label: "Royal Purple" },
  { value: "forest", label: "Forest Green" },
] as const;

export const MIN_RADIUS_M = 25;

/** The code printed in the QR for a date (daily) or for always (fixed). */
export function qrCode(session: Pick<QrSession, "id" | "rotation" | "secretEnc">, date: Date) {
  const secret = decryptField(session.secretEnc);
  const what = session.rotation === "fixed" ? "fixed" : isoDay(date);
  return createHmac("sha256", secret).update(`${session.id}:${what}`).digest("base64url").slice(0, 24);
}

/** The address inside the QR: opens Check-in on the phone. No personal data. */
export function qrLink(origin: string, schoolId: string, session: Pick<QrSession, "id" | "rotation" | "secretEnc">, date: Date) {
  return `${origin}/check-in?s=${schoolId}&q=${session.id}.${qrCode(session, date)}`;
}

function requireAdmin(access: AttendanceAccess) {
  if (!access.admin) throw new AttendanceProblem("Only the School Admin or the Principal can change QR check-in.");
}

export async function createQrSession(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, input: { name: string; forWhom: string; scope: string; campusId: string | null; rotation: string; expiresAt: Date | null; now: Date }) {
  requireAdmin(access);
  if (input.name.trim().length < 2) throw new AttendanceProblem("Name is needed, for example \"Main entrance\".", "name");
  if (!["students", "staff", "both"].includes(input.forWhom)) throw new AttendanceProblem("Choose who checks in with this QR.", "forWhom");
  if (!["daily", "fixed"].includes(input.rotation)) throw new AttendanceProblem("Choose a changing or fixed QR.", "rotation");
  // A person limited to one campus makes QR for that campus only (a whole-school QR is the school's).
  if (input.scope === "campus" && (!input.campusId || !campusOpen(access, input.campusId))) throw new AttendanceProblem("Choose the campus.", "campusId");
  if (input.expiresAt && input.expiresAt <= input.now) throw new AttendanceProblem("Expiry must be in the future.", "expiresAt");
  const row = await tx.qrSession.create({
    data: {
      schoolId: ctx.schoolId, name: input.name.trim(), forWhom: input.forWhom, scope: input.scope === "campus" ? "campus" : "school", campusId: input.scope === "campus" ? input.campusId : null,
      rotation: input.rotation, secretEnc: encryptField(randomBytes(32).toString("base64url")), expiresAt: input.expiresAt, createdById: ctx.userId,
    },
  });
  await writeAudit(tx, ctx, { action: "created", recordType: "QR Session", recordId: row.id, after: { name: row.name, forWhom: row.forWhom, scope: row.scope, rotation: row.rotation, expires: input.expiresAt?.toISOString() ?? null } });
  return row;
}

export async function setQrSessionState(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, id: string, change: "stop" | "start" | "archive" | "new-code") {
  requireAdmin(access);
  const row = await tx.qrSession.findFirst({ where: { id, archivedAt: null, ...campusOrSchool(access) } });
  if (!row) throw new AttendanceProblem("This QR was not found.");
  if (change === "new-code") await tx.qrSession.update({ where: { id }, data: { secretEnc: encryptField(randomBytes(32).toString("base64url")) } });
  else await tx.qrSession.update({ where: { id }, data: change === "archive" ? { archivedAt: new Date(), isActive: false } : { isActive: change === "start" } });
  await writeAudit(tx, ctx, { action: `qr-${change}`, recordType: "QR Session", recordId: id, before: { active: row.isActive } });
  return row;
}

export async function saveGeoFence(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, input: { campusId: string; latitude: number; longitude: number; radiusM: number; studentsOn: boolean; staffOn: boolean }) {
  requireAdmin(access);
  if (!Number.isFinite(input.latitude) || Math.abs(input.latitude) > 90) throw new AttendanceProblem("Latitude must be a number between -90 and 90, like 17.385044.", "latitude");
  if (!Number.isFinite(input.longitude) || Math.abs(input.longitude) > 180) throw new AttendanceProblem("Longitude must be a number between -180 and 180, like 78.486671.", "longitude");
  if (!Number.isInteger(input.radiusM) || input.radiusM < MIN_RADIUS_M || input.radiusM > 5000) throw new AttendanceProblem(`Radius must be between ${MIN_RADIUS_M} and 5000 metres.`, "radiusM");
  const campus = await tx.campus.findFirst({ where: { id: input.campusId, archivedAt: null } });
  if (!campus || !campusOpen(access, campus.id)) throw new AttendanceProblem("Choose the campus.", "campusId");
  const before = await tx.geoFence.findUnique({ where: { schoolId_campusId: { schoolId: ctx.schoolId, campusId: campus.id } } });
  const data = { latitude: input.latitude, longitude: input.longitude, radiusM: input.radiusM, studentsOn: input.studentsOn, staffOn: input.staffOn, updatedById: ctx.userId };
  await tx.geoFence.upsert({ where: { schoolId_campusId: { schoolId: ctx.schoolId, campusId: campus.id } }, create: { schoolId: ctx.schoolId, campusId: campus.id, ...data }, update: data });
  await writeAudit(tx, ctx, { action: before ? "changed" : "created", recordType: "Geo-fence", recordId: campus.id, before: before ? { lat: Number(before.latitude), lng: Number(before.longitude), radius: before.radiusM, students: before.studentsOn, staff: before.staffOn } : null, after: { lat: input.latitude, lng: input.longitude, radius: input.radiusM, students: input.studentsOn, staff: input.staffOn } });
}

// ---------------------------------------------------------------- checking in

export type CheckInInput = {
  /** "qr" with the scanned code, or "mobile". */
  method: "qr" | "mobile";
  code?: string | null;
  location?: { lat: number; lng: number; accuracy?: number | null } | null;
  now: Date;
  timeZone: string;
};

export type CheckInResult = { ok: true; message: string; at: Date; statusKey: string } | { ok: false; message: string };

function fenceCheck(fence: GeoFence | null, who: "student" | "staff", loc: CheckInInput["location"]): string | null {
  if (!fence) return null;
  const on = who === "student" ? fence.studentsOn : fence.staffOn;
  if (!on) return null;
  if (!loc) return "Allow location on your phone. Check-in needs to know you are at school.";
  const d = metresBetween({ lat: loc.lat, lng: loc.lng }, { lat: Number(fence.latitude), lng: Number(fence.longitude) });
  const slack = Math.min(Math.max(loc.accuracy ?? 0, 0), 50);
  if (d > fence.radiusM + slack) return `You are ${Math.round(d)} m from school. Check in from inside the campus.`;
  return null;
}

/**
 * Checks in the signed-in person (staff, or a student with a login) by QR or
 * mobile. Refuses scans from outside the campus area, wrong or expired codes,
 * holidays, and a second check-in the same day ("Already marked at 8:02 AM").
 */
export async function checkIn(tx: Tx, ctx: SchoolContext, input: CheckInInput): Promise<CheckInResult> {
  if (!ctx.userId) return { ok: false, message: "Sign in first." };
  const features = await attendanceFeatures(tx, ctx);
  const settings = await attendanceSettings(tx, ctx);
  const staff = await tx.staff.findFirst({ where: { userLoginId: ctx.userId, archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] } } });
  const student = staff ? null : await tx.student.findFirst({ where: { userLoginId: ctx.userId, archivedAt: null, status: "ACTIVE" } });
  if (!staff && !student) return { ok: false, message: "Your login is not linked to a staff or student record, so you cannot check in. Ask the office." };
  const who = staff ? "staff" : "student";
  const campusId = staff?.campusId ?? student!.campusId;
  const date = schoolDateOf(input.now, input.timeZone);

  if (input.method === "qr") {
    if (!features.has("attendance-qr")) return { ok: false, message: "QR check-in is switched off for this school." };
    if (who === "staff" ? !settings.qrStaffOn : !settings.qrStudentsOn) return { ok: false, message: `QR check-in is not on for ${who === "staff" ? "staff" : "students"}.` };
    const [sessionId, code] = String(input.code ?? "").split(".");
    const session = /^[0-9a-f-]{36}$/i.test(sessionId ?? "") ? await tx.qrSession.findFirst({ where: { id: sessionId, archivedAt: null } }) : null;
    const expected = session ? qrCode(session, date) : "";
    const okCode = session && code && code.length === expected.length && timingSafeEqual(Buffer.from(code), Buffer.from(expected));
    if (!session || !okCode) return { ok: false, message: "This QR is not valid today. Scan the QR at the school entrance." };
    if (!session.isActive) return { ok: false, message: "This QR has been stopped. Ask the office." };
    if (session.expiresAt && session.expiresAt < input.now) return { ok: false, message: "This QR has expired. Ask the office for the new one." };
    if (session.forWhom !== "both" && session.forWhom !== (who === "staff" ? "staff" : "students")) return { ok: false, message: `This QR is for ${session.forWhom} only.` };
    if (session.scope === "campus" && session.campusId && session.campusId !== campusId) return { ok: false, message: "This QR is for another campus." };
  } else {
    if (!features.has("attendance-mobile") || who !== "staff") return { ok: false, message: "Mobile check-in is not on for you." };
    if (!settings.staffMethods.includes("mobile")) return { ok: false, message: "Mobile check-in is switched off for staff in Attendance Settings." };
  }

  const fence = await tx.geoFence.findUnique({ where: { schoolId_campusId: { schoolId: ctx.schoolId, campusId } } });
  if (input.method === "mobile" && !fence) return { ok: false, message: "The campus area is not set yet, so mobile check-in cannot work. Set it in Attendance Management, Devices & QR (the School Admin or Principal can)." };
  const far = fenceCheck(fence, who, input.location);
  if (far) return { ok: false, message: far };

  const classId = student ? (await enrolmentOn(tx, student.id, date))?.enrolment.classId ?? null : null;
  const info = await dayInfo(tx, ctx, date, campusId, { classId });
  if (!info.on) return { ok: false, message: `Today is ${offDayWords(info)}. No check-in needed.` };

  const existing = await tx.attendanceMark.findFirst({ where: { ...(staff ? { staffId: staff.id } : { studentId: student!.id }), date, periodNo: 0, archivedAt: null } });
  if (existing?.inTime) return { ok: false, message: `Already marked at ${formatTime(existing.inTime, input.timeZone)}.` };
  if (existing && existing.statusKey !== "absent") return { ok: false, message: "Your attendance for today is already marked." };

  let statusKey = "present";
  let lateMinutes = 0;
  if (staff) {
    const rule = (await shiftsOn(tx, ctx, [staff.id], date)).get(staff.id)!;
    const auto = statusFromInTime(input.now, date, rule, settings.staffHalfDayAfter, input.timeZone);
    statusKey = auto.statusKey;
    lateMinutes = auto.lateMinutes;
  } else {
    const auto = statusFromInTime(input.now, date, { startTime: settings.studentStartTime, lateAfterMin: settings.studentLateAfterMin }, null, input.timeZone);
    statusKey = auto.statusKey;
    lateMinutes = auto.lateMinutes;
  }
  const enrol = student ? await enrolmentOn(tx, student.id, date) : null;
  if (student && !enrol) return { ok: false, message: "You are not in a class today. Ask the office." };
  const year = enrol?.year ?? (await tx.academicYear.findFirst({ where: { schoolId: ctx.schoolId, campusId, startDate: { lte: date }, endDate: { gte: date }, archivedAt: null } }));
  const data = { statusKey, lateMinutes, inTime: input.now, method: input.method, markedById: ctx.userId, markedAt: input.now };
  const mark = existing
    ? await tx.attendanceMark.update({ where: { id: existing.id }, data })
    : await tx.attendanceMark.create({ data: { schoolId: ctx.schoolId, academicYearId: year?.id ?? null, ...(staff ? { staffId: staff.id } : { studentId: student!.id, sectionId: enrol!.enrolment.sectionId }), date, periodNo: 0, ...data } });
  await writeAudit(tx, ctx, { action: "checked-in", recordType: "Attendance Mark", recordId: mark.id, after: { method: input.method, status: statusKey, at: input.now.toISOString(), lateMinutes } });
  // A4 for the student's class: a late check-in tells the parent (when on), and the flags follow.
  if (student && enrol) await queueAfterSave(tx, ctx, settings, [{ sectionId: enrol.enrolment.sectionId, date }], input.now);
  const words = statusKey === "late" ? `Checked in at ${formatTime(input.now, input.timeZone)}, ${lateMinutes} minutes late.` : statusKey === "half-day" ? `Checked in at ${formatTime(input.now, input.timeZone)}. After the half-day time, so it is a half day.` : `Checked in at ${formatTime(input.now, input.timeZone)}. Have a good day.`;
  return { ok: true, message: words, at: input.now, statusKey };
}
