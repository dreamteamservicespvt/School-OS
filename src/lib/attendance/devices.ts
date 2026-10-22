// Devices & QR (05 §2, 08-platform-security.md §7): each attendance device
// has its own key, stored only hashed and shown once. Each punch carries the
// device's unique number, so a punch sent twice counts once. A punch counts
// only if the device is active, the person is mapped and allowed on it, the
// time is inside the attendance window, it is not a repeat within a few
// minutes, and the day is not a holiday. Rejected punches are kept with the reason.
import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { AttendanceDevice, Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { AttendanceProblem, type AttendanceAccess } from "./access";
import { dayInfo } from "./calendar";
import { attendanceSettings } from "./settings";
import { clockMinutes, instantAt, minutesOf, schoolDateOf } from "./time";
import { isoDay } from "../staff/dates";
import { shiftsOn, statusFromInTime } from "./staff";
import { enrolmentOn } from "./student-leave";
import { lockState } from "./marks";
import { queueAfterSave, type AfterSaveTarget } from "./after-save";

export const DEVICE_TYPES = [
  { value: "face", label: "Face recognition" },
  { value: "rfid", label: "RFID card" },
  { value: "fingerprint", label: "Fingerprint" },
  { value: "iris", label: "Iris" },
] as const;
export const ALLOWED_USERS = [
  { value: "both", label: "Both students and staff" },
  { value: "students", label: "Students only" },
  { value: "staff", label: "Staff only" },
] as const;

export const REJECT_WORDS: Record<string, string> = {
  "unknown-user": "Unknown user (not mapped)",
  "inactive-device": "Device inactive",
  "not-allowed": "Person not allowed on this device",
  "outside-window": "Outside the attendance window",
  repeat: "Repeat punch within a few minutes",
  holiday: "Holiday or Sunday",
  future: "Time is in the future",
  "not-studying": "Student not in a class",
};

export const hashKey = (key: string) => createHash("sha256").update(key, "utf8").digest("hex");

/** A new device key: "sosd_" and 40 random characters. Shown once; only its hash is kept. */
export function newDeviceKey() {
  return `sosd_${randomBytes(30).toString("base64url")}`;
}

export type DeviceInput = { name: string; serialNo: string; location: string | null; campusId: string; deviceType: string; allowedUsers: string; ipAddress: string | null; connectionNote: string | null };

function requireAdmin(access: AttendanceAccess) {
  if (!access.admin) throw new AttendanceProblem("Only the School Admin or the Principal can change devices and QR check-in.");
}

function checkDevice(input: DeviceInput) {
  if (input.name.trim().length < 2) throw new AttendanceProblem("Device name is needed, for example \"Main gate scanner\".", "name");
  if (!/^[\w\-./: ]{2,60}$/.test(input.serialNo.trim())) throw new AttendanceProblem("Device ID or serial number is needed (letters, numbers, - and /).", "serialNo");
  if (!DEVICE_TYPES.some((t) => t.value === input.deviceType)) throw new AttendanceProblem("Choose the device type.", "deviceType");
  if (!ALLOWED_USERS.some((t) => t.value === input.allowedUsers)) throw new AttendanceProblem("Choose who may use this device.", "allowedUsers");
  if (input.ipAddress && !/^[\w.:\-]{3,100}$/.test(input.ipAddress)) throw new AttendanceProblem("IP address does not look right, for example 192.168.1.20.", "ipAddress");
}

export async function addDevice(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, input: DeviceInput) {
  requireAdmin(access);
  checkDevice(input);
  const campus = await tx.campus.findFirst({ where: { id: input.campusId, archivedAt: null } });
  if (!campus) throw new AttendanceProblem("Choose the campus.", "campusId");
  const dup = await tx.attendanceDevice.findFirst({ where: { schoolId: ctx.schoolId, serialNo: input.serialNo.trim() } });
  if (dup) throw new AttendanceProblem(`Device ID ${input.serialNo.trim()} is already added as "${dup.name}".`, "serialNo");
  const key = newDeviceKey();
  const device = await tx.attendanceDevice.create({
    data: {
      schoolId: ctx.schoolId, campusId: campus.id, name: input.name.trim(), serialNo: input.serialNo.trim(), location: input.location, deviceType: input.deviceType,
      allowedUsers: input.allowedUsers, ipAddress: input.ipAddress, connectionNote: input.connectionNote, keyHash: hashKey(key), keyLast4: key.slice(-4), createdById: ctx.userId,
    },
  });
  await writeAudit(tx, ctx, { action: "created", recordType: "Attendance Device", recordId: device.id, after: { name: device.name, serialNo: device.serialNo, type: device.deviceType, allowed: device.allowedUsers } });
  return { device, key };
}

export async function updateDevice(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, id: string, input: DeviceInput) {
  requireAdmin(access);
  checkDevice(input);
  const before = await tx.attendanceDevice.findFirst({ where: { id, archivedAt: null } });
  if (!before) throw new AttendanceProblem("This device was not found.");
  const dup = await tx.attendanceDevice.findFirst({ where: { schoolId: ctx.schoolId, serialNo: input.serialNo.trim(), id: { not: id } } });
  if (dup) throw new AttendanceProblem(`Device ID ${input.serialNo.trim()} is already added as "${dup.name}".`, "serialNo");
  const data = { name: input.name.trim(), serialNo: input.serialNo.trim(), location: input.location, campusId: input.campusId, deviceType: input.deviceType, allowedUsers: input.allowedUsers, ipAddress: input.ipAddress, connectionNote: input.connectionNote };
  await tx.attendanceDevice.update({ where: { id }, data });
  await writeAudit(tx, ctx, { action: "changed", recordType: "Attendance Device", recordId: id, before: { name: before.name, serialNo: before.serialNo, type: before.deviceType, allowed: before.allowedUsers, location: before.location }, after: data });
}

/** Replaces the device key. The old key stops working at once. */
export async function regenerateKey(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, id: string) {
  requireAdmin(access);
  const device = await tx.attendanceDevice.findFirst({ where: { id, archivedAt: null } });
  if (!device) throw new AttendanceProblem("This device was not found.");
  const key = newDeviceKey();
  await tx.attendanceDevice.update({ where: { id }, data: { keyHash: hashKey(key), keyLast4: key.slice(-4), keyCreatedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "device-key-regenerated", recordType: "Attendance Device", recordId: id, before: { keyEnding: device.keyLast4 }, after: { keyEnding: key.slice(-4) } });
  return { device, key };
}

export async function setDeviceState(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, id: string, change: "activate" | "deactivate" | "archive" | "restore") {
  requireAdmin(access);
  const device = await tx.attendanceDevice.findFirst({ where: { id } });
  if (!device) throw new AttendanceProblem("This device was not found.");
  const data: Prisma.AttendanceDeviceUpdateInput =
    change === "activate" ? { isActive: true } : change === "deactivate" ? { isActive: false } : change === "archive" ? { archivedAt: new Date(), isActive: false } : { archivedAt: null };
  await tx.attendanceDevice.update({ where: { id }, data });
  await writeAudit(tx, ctx, { action: `device-${change}`, recordType: "Attendance Device", recordId: id, before: { active: device.isActive, archived: Boolean(device.archivedAt) } });
  return device;
}

/** Active, Never connected, Offline (no punch for a day, inferred) or Inactive. */
export function deviceStatus(d: Pick<AttendanceDevice, "isActive" | "lastSyncAt" | "archivedAt">, now: Date): { label: string; tone: "success" | "neutral" | "warning" | "danger" } {
  if (!d.isActive || d.archivedAt) return { label: "Inactive", tone: "neutral" };
  if (!d.lastSyncAt) return { label: "Never connected", tone: "warning" };
  if (now.getTime() - d.lastSyncAt.getTime() > 24 * 3600 * 1000) return { label: "Offline", tone: "danger" };
  return { label: "Active", tone: "success" };
}

// ---------------------------------------------------------------- user mapping

/** Matches device user numbers to staff IDs and admission numbers (the ID card numbers). Only unmatched numbers are touched. */
export async function autoMatch(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, deviceId: string) {
  requireAdmin(access);
  const device = await tx.attendanceDevice.findFirst({ where: { id: deviceId, archivedAt: null } });
  if (!device) throw new AttendanceProblem("This device was not found.");
  const numbers = await tx.devicePunch.findMany({ where: { deviceId, rejectReason: "unknown-user" }, select: { deviceUserNo: true }, distinct: ["deviceUserNo"] });
  const mapped = new Set((await tx.deviceUserMap.findMany({ where: { deviceId, archivedAt: null }, select: { deviceUserNo: true } })).map((m) => m.deviceUserNo));
  let matched = 0;
  for (const { deviceUserNo } of numbers) {
    if (mapped.has(deviceUserNo)) continue;
    const found = await findPerson(tx, deviceUserNo, device.allowedUsers);
    if (!found) continue;
    await tx.deviceUserMap.create({ data: { schoolId: ctx.schoolId, deviceId, deviceUserNo, ...found, matchedBy: "auto", createdById: ctx.userId } });
    matched++;
  }
  await writeAudit(tx, ctx, { action: "device-users-auto-matched", recordType: "Attendance Device", recordId: deviceId, after: { matched } });
  return matched;
}

async function findPerson(tx: Tx, code: string, allowed: string): Promise<{ staffId?: string; studentId?: string } | null> {
  const c = code.trim();
  if (allowed !== "students") {
    const s = await tx.staff.findFirst({ where: { archivedAt: null, staffCode: { equals: c, mode: "insensitive" } }, select: { id: true } });
    if (s) return { staffId: s.id };
  }
  if (allowed !== "staff") {
    const st = await tx.student.findFirst({ where: { archivedAt: null, admissionNo: { equals: c, mode: "insensitive" } }, select: { id: true } });
    if (st) return { studentId: st.id };
  }
  return null;
}

export async function mapUser(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, input: { deviceId: string; deviceUserNo: string; who: string }) {
  requireAdmin(access);
  const device = await tx.attendanceDevice.findFirst({ where: { id: input.deviceId, archivedAt: null } });
  if (!device) throw new AttendanceProblem("This device was not found.");
  const no = input.deviceUserNo.trim();
  if (!/^[\w\-]{1,40}$/.test(no)) throw new AttendanceProblem("Device user number is needed (letters and numbers).", "deviceUserNo");
  const [kind, id] = input.who.split(":");
  let person: { staffId?: string; studentId?: string; name: string } | null = null;
  if (kind === "staff" && device.allowedUsers !== "students") {
    const s = await tx.staff.findFirst({ where: { id, archivedAt: null }, select: { id: true, fullName: true } });
    if (s) person = { staffId: s.id, name: s.fullName };
  } else if (kind === "student" && device.allowedUsers !== "staff") {
    const s = await tx.student.findFirst({ where: { id, archivedAt: null }, select: { id: true, fullName: true } });
    if (s) person = { studentId: s.id, name: s.fullName };
  }
  if (!person) throw new AttendanceProblem(`Choose a ${device.allowedUsers === "students" ? "student" : device.allowedUsers === "staff" ? "staff member" : "student or staff member"} allowed on this device.`, "who");
  const existing = await tx.deviceUserMap.findUnique({ where: { deviceId_deviceUserNo: { deviceId: device.id, deviceUserNo: no } } });
  const data = { staffId: person.staffId ?? null, studentId: person.studentId ?? null, matchedBy: "manual", archivedAt: null, createdById: ctx.userId };
  if (existing) await tx.deviceUserMap.update({ where: { id: existing.id }, data });
  else await tx.deviceUserMap.create({ data: { schoolId: ctx.schoolId, deviceId: device.id, deviceUserNo: no, ...data } });
  await writeAudit(tx, ctx, { action: "device-user-mapped", recordType: "Device User Map", recordId: device.id, before: existing ? { staffId: existing.staffId, studentId: existing.studentId } : null, after: { deviceUserNo: no, person: person.name } });
  return person;
}

export async function unmapUser(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, mapId: string) {
  requireAdmin(access);
  const m = await tx.deviceUserMap.findFirst({ where: { id: mapId, archivedAt: null } });
  if (!m) throw new AttendanceProblem("This mapping was not found.");
  await tx.deviceUserMap.update({ where: { id: mapId }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "device-user-unmapped", recordType: "Device User Map", recordId: mapId, before: { deviceUserNo: m.deviceUserNo } });
}

// ---------------------------------------------------------------- punches

export type PunchIn = { punchNo: string; userNo: string; time: string };
export type PunchOut = { punchNo: string; result: "accepted" | "rejected" | "duplicate"; reason?: string };

/**
 * Marks attendance for one accepted punch. Returns the mark id, and for a
 * student the section and day (A4 runs for them after the batch).
 */
async function markFromPunch(tx: Tx, ctx: SchoolContext, input: { staffId?: string | null; studentId?: string | null; at: Date; date: Date; method: string; timeZone: string; now: Date }): Promise<{ markId: string; sectionId: string | null } | null> {
  const settings = await attendanceSettings(tx, ctx);
  if (input.staffId) {
    const existing = await tx.attendanceMark.findFirst({ where: { staffId: input.staffId, date: input.date, periodNo: 0, archivedAt: null } });
    if (existing) {
      // A later punch is the out time; an earlier one corrects the in time.
      const data: Prisma.AttendanceMarkUpdateInput = {};
      if (!existing.inTime || input.at < existing.inTime) {
        const rule = (await shiftsOn(tx, ctx, [input.staffId], input.date)).get(input.staffId)!;
        const auto = statusFromInTime(input.at, input.date, rule, settings.staffHalfDayAfter, input.timeZone);
        // A mark a person made by hand, or a day already locked, keeps its status: a punch that
        // arrives late only adds the in time (rule 17). Changing it is a correction.
        const byHand = existing.method === "register" || Boolean(existing.markedById && !["qr", "mobile"].includes(existing.method));
        const locked = lockState(settings, input.date, input.now, input.timeZone).locked;
        const mayChange = !byHand && !locked && ["present", "late", "half-day", "absent"].includes(existing.statusKey);
        Object.assign(data, { inTime: input.at, ...(mayChange ? { lateMinutes: auto.lateMinutes, statusKey: auto.statusKey } : {}) });
        if (existing.inTime && (!existing.outTime || existing.inTime > existing.outTime)) data.outTime = existing.inTime;
        if (mayChange && auto.statusKey !== existing.statusKey) {
          await writeAudit(tx, ctx, {
            action: "device-punch-applied", recordType: "Attendance Mark", recordId: existing.id,
            before: { status: existing.statusKey, inTime: existing.inTime?.toISOString() ?? null },
            after: { status: auto.statusKey, inTime: input.at.toISOString(), lateMinutes: auto.lateMinutes, method: input.method },
          });
        }
      } else if (!existing.outTime || input.at > existing.outTime) data.outTime = input.at;
      if (Object.keys(data).length) await tx.attendanceMark.update({ where: { id: existing.id }, data });
      return { markId: existing.id, sectionId: null };
    }
    const rule = (await shiftsOn(tx, ctx, [input.staffId], input.date)).get(input.staffId)!;
    const auto = statusFromInTime(input.at, input.date, rule, settings.staffHalfDayAfter, input.timeZone);
    const year = await tx.academicYear.findFirst({ where: { schoolId: ctx.schoolId, startDate: { lte: input.date }, endDate: { gte: input.date }, archivedAt: null } });
    const mark = await tx.attendanceMark.create({ data: { schoolId: ctx.schoolId, academicYearId: year?.id ?? null, staffId: input.staffId, date: input.date, periodNo: 0, statusKey: auto.statusKey, lateMinutes: auto.lateMinutes, inTime: input.at, method: input.method, markedAt: new Date() } });
    return { markId: mark.id, sectionId: null };
  }
  const where = await enrolmentOn(tx, input.studentId!, input.date);
  if (!where) return null;
  const existing = await tx.attendanceMark.findFirst({ where: { studentId: input.studentId!, date: input.date, periodNo: 0, archivedAt: null } });
  if (existing) {
    if (!existing.outTime || input.at > existing.outTime) await tx.attendanceMark.update({ where: { id: existing.id }, data: existing.inTime ? { outTime: input.at } : { inTime: input.at } });
    return { markId: existing.id, sectionId: existing.sectionId ?? where.enrolment.sectionId };
  }
  const late = Math.floor((input.at.getTime() - instantAt(input.date, settings.studentStartTime, input.timeZone).getTime()) / 60000);
  const isLate = late > settings.studentLateAfterMin;
  const mark = await tx.attendanceMark.create({
    data: { schoolId: ctx.schoolId, academicYearId: where.year.id, studentId: input.studentId!, sectionId: where.enrolment.sectionId, date: input.date, periodNo: 0, statusKey: isLate ? "late" : "present", lateMinutes: isLate ? late : 0, inTime: input.at, method: input.method, markedAt: new Date() },
  });
  return { markId: mark.id, sectionId: where.enrolment.sectionId };
}

/**
 * Takes a batch of punches from a device (the device API). The same punch
 * number twice is counted once. Each punch is checked and either marks
 * attendance or is kept as rejected with the reason.
 */
export async function receivePunches(tx: Tx, ctx: SchoolContext, device: AttendanceDevice, punches: PunchIn[], now: Date, timeZone: string): Promise<PunchOut[]> {
  const settings = await attendanceSettings(tx, ctx);
  const out: PunchOut[] = [];
  const known = await tx.devicePunch.findMany({ where: { deviceId: device.id, punchNo: { in: punches.map((p) => String(p.punchNo)) } }, select: { punchNo: true } });
  const seen = new Set(known.map((k) => k.punchNo));
  const maps = await tx.deviceUserMap.findMany({ where: { deviceId: device.id, archivedAt: null } });
  const marked: AfterSaveTarget[] = [];
  for (const p of punches) {
    const punchNo = String(p.punchNo ?? "").trim().slice(0, 80);
    const userNo = String(p.userNo ?? "").trim().slice(0, 40);
    const at = new Date(p.time);
    if (!punchNo || !userNo || Number.isNaN(at.getTime())) {
      out.push({ punchNo: punchNo || "?", result: "rejected", reason: "A punch needs punchNo, userNo and time (ISO 8601)." });
      continue;
    }
    if (seen.has(punchNo)) {
      out.push({ punchNo, result: "duplicate" });
      continue;
    }
    seen.add(punchNo);
    const map = maps.find((m) => m.deviceUserNo === userNo);
    const verdict = await checkPunch(tx, ctx, device, map ?? null, at, now, timeZone, settings.repeatPunchMinutes, settings.punchWindowStart, settings.punchWindowEnd);
    let markId: string | null = null;
    let reason = verdict;
    if (!verdict) {
      const date = schoolDateOf(at, timeZone);
      const m = await markFromPunch(tx, ctx, { staffId: map!.staffId, studentId: map!.studentId, at, date, method: device.deviceType, timeZone, now });
      markId = m?.markId ?? null;
      if (!markId) reason = "not-studying";
      if (m?.sectionId) marked.push({ sectionId: m.sectionId, date });
    }
    await tx.devicePunch.create({
      data: { schoolId: ctx.schoolId, deviceId: device.id, punchNo, deviceUserNo: userNo, punchedAt: at, receivedAt: now, accepted: !reason, rejectReason: reason, staffId: map?.staffId ?? null, studentId: map?.studentId ?? null, markId },
    });
    out.push(reason ? { punchNo, result: "rejected", reason: REJECT_WORDS[reason] ?? reason } : { punchNo, result: "accepted" });
  }
  const lastPunch = punches.map((p) => new Date(p.time)).filter((d) => !Number.isNaN(d.getTime())).sort((a, b) => b.getTime() - a.getTime())[0];
  await tx.attendanceDevice.update({ where: { id: device.id }, data: { lastSyncAt: now, ...(lastPunch ? { lastPunchAt: lastPunch > (device.lastPunchAt ?? new Date(0)) ? lastPunch : device.lastPunchAt } : {}) } });
  // A4 for each class and day the punches completed (late messages, flags), once per batch.
  // A punch that reaches the school on a later day moves the flags on; no message goes for a past day.
  const today = schoolDateOf(now, timeZone);
  await queueAfterSave(tx, ctx, settings, marked.filter((t) => isoDay(t.date) === isoDay(today)), now);
  await queueAfterSave(tx, ctx, settings, marked.filter((t) => isoDay(t.date) !== isoDay(today)), now, { messages: false });
  return out;
}

async function checkPunch(tx: Tx, ctx: SchoolContext, device: AttendanceDevice, map: { staffId: string | null; studentId: string | null } | null, at: Date, now: Date, timeZone: string, repeatMinutes: number, windowStart: string, windowEnd: string): Promise<string | null> {
  if (!device.isActive || device.archivedAt) return "inactive-device";
  if (!map || (!map.staffId && !map.studentId)) return "unknown-user";
  if ((map.staffId && device.allowedUsers === "students") || (map.studentId && device.allowedUsers === "staff")) return "not-allowed";
  if (at.getTime() > now.getTime() + 5 * 60000) return "future";
  const mins = clockMinutes(at, timeZone);
  if (mins < minutesOf(windowStart) || mins > minutesOf(windowEnd)) return "outside-window";
  const date = schoolDateOf(at, timeZone);
  // A student's school day is their class's (a School Calendar entry may open a day for some classes only).
  const classId = map.studentId ? (await enrolmentOn(tx, map.studentId, date))?.enrolment.classId ?? null : null;
  const info = await dayInfo(tx, ctx, date, device.campusId, { classId });
  if (!info.on) return "holiday";
  const recent = await tx.devicePunch.findFirst({
    where: { accepted: true, punchedAt: { gte: new Date(at.getTime() - repeatMinutes * 60000), lte: new Date(at.getTime() + repeatMinutes * 60000) }, ...(map.staffId ? { staffId: map.staffId } : { studentId: map.studentId }) },
  });
  if (recent) return "repeat";
  return null;
}

/** "Re-run the sync": checks the punches rejected as unknown users again, after mapping (05 §5). */
export async function reprocessRejected(tx: Tx, ctx: SchoolContext, access: AttendanceAccess, deviceId: string, now: Date, timeZone: string) {
  requireAdmin(access);
  const device = await tx.attendanceDevice.findFirst({ where: { id: deviceId, archivedAt: null } });
  if (!device) throw new AttendanceProblem("This device was not found.");
  const settings = await attendanceSettings(tx, ctx);
  const rows = await tx.devicePunch.findMany({ where: { deviceId, accepted: false, rejectReason: { in: ["unknown-user", "not-allowed"] } }, orderBy: { punchedAt: "asc" }, take: 2000 });
  const maps = await tx.deviceUserMap.findMany({ where: { deviceId, archivedAt: null } });
  let accepted = 0;
  const marked: AfterSaveTarget[] = [];
  for (const p of rows) {
    const map = maps.find((m) => m.deviceUserNo === p.deviceUserNo) ?? null;
    const reason = await checkPunch(tx, ctx, device, map, p.punchedAt, now, timeZone, settings.repeatPunchMinutes, settings.punchWindowStart, settings.punchWindowEnd);
    if (reason) {
      if (reason !== p.rejectReason) await tx.devicePunch.update({ where: { id: p.id }, data: { rejectReason: reason } });
      continue;
    }
    const date = schoolDateOf(p.punchedAt, timeZone);
    const m = await markFromPunch(tx, ctx, { staffId: map!.staffId, studentId: map!.studentId, at: p.punchedAt, date, method: device.deviceType, timeZone, now });
    const markId = m?.markId ?? null;
    await tx.devicePunch.update({ where: { id: p.id }, data: { accepted: Boolean(markId), rejectReason: markId ? null : "not-studying", staffId: map!.staffId, studentId: map!.studentId, markId } });
    if (markId) accepted++;
    if (m?.sectionId) marked.push({ sectionId: m.sectionId, date });
  }
  // Punches let through on a later day: the flags follow; no message goes for a past day.
  const today = schoolDateOf(now, timeZone);
  await queueAfterSave(tx, ctx, settings, marked.filter((t) => isoDay(t.date) === isoDay(today)), now);
  await queueAfterSave(tx, ctx, settings, marked.filter((t) => isoDay(t.date) !== isoDay(today)), now, { messages: false });
  await writeAudit(tx, ctx, { action: "device-punches-reprocessed", recordType: "Attendance Device", recordId: deviceId, after: { checked: rows.length, accepted } });
  return { checked: rows.length, accepted };
}

/** Today's health of every device: punches received and rejected, and why. */
export async function deviceHealth(tx: Tx, ctx: SchoolContext, from: Date, to: Date) {
  const rows = await tx.devicePunch.groupBy({ by: ["deviceId", "accepted", "rejectReason"], where: { receivedAt: { gte: from, lt: to } }, _count: true });
  const out = new Map<string, { received: number; rejected: number; reasons: Record<string, number> }>();
  for (const r of rows) {
    const h = out.get(r.deviceId) ?? { received: 0, rejected: 0, reasons: {} };
    h.received += r._count;
    if (!r.accepted) {
      h.rejected += r._count;
      const k = r.rejectReason ?? "other";
      h.reasons[k] = (h.reasons[k] ?? 0) + r._count;
    }
    out.set(r.deviceId, h);
  }
  return out;
}

export function rejectedSummary(reasons: Record<string, number>) {
  const total = Object.values(reasons).reduce((s, n) => s + n, 0);
  if (total === 0) return null;
  const top = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0];
  return `${total} punch${total === 1 ? "" : "es"} rejected today: ${top[1]} ${REJECT_WORDS[top[0]]?.toLowerCase() ?? top[0]}`;
}

