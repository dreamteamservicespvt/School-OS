// Attendance Settings (05 §6): the school's rules, its status list, and the
// optional parts switched on per school with School Feature records.
import "server-only";

import type { AttendanceSetting, AttendanceStatus } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";

/** Optional parts of Attendance Management, each a School Feature (P19). */
export const ATTENDANCE_FEATURES = [
  { key: "attendance-period-wise", label: "Period-wise attendance", about: "Take attendance in every period of the Time Table, not once a day." },
  { key: "attendance-offline", label: "Offline mode", about: "Teachers can take attendance without internet. It is kept on the phone and sent when online." },
  { key: "attendance-devices", label: "Attendance devices", about: "Face, fingerprint, RFID card and iris machines send punches to School OS." },
  { key: "attendance-qr", label: "QR check-in", about: "Staff and students scan a QR at the entrance with their phone." },
  { key: "attendance-mobile", label: "Mobile check-in", about: "Staff check in from their phone inside the campus area." },
  { key: "attendance-leave-quotas", label: "Student leave balances", about: "A limit of days per leave type for a term or year, like 6 medical days a term." },
  { key: "attendance-shifts", label: "Staff shifts", about: "Different working hours for groups of staff." },
  { key: "attendance-overtime", label: "Overtime", about: "Record extra hours staff worked, for salary." },
  { key: "attendance-absence-reasons", label: "Absence reasons", about: "Record why a student was absent: sick, family function, travel, fees dispute, not known yet or other. Shown in the register, reports and Early Warnings." },
] as const;
export type AttendanceFeature = (typeof ATTENDANCE_FEATURES)[number]["key"];

export async function attendanceFeatures(tx: Tx, ctx: SchoolContext): Promise<Set<AttendanceFeature>> {
  const rows = await tx.schoolFeature.findMany({ where: { schoolId: ctx.schoolId, isOn: true, featureKey: { in: ATTENDANCE_FEATURES.map((f) => f.key) } } });
  return new Set(rows.map((r) => r.featureKey as AttendanceFeature));
}

export async function setAttendanceFeature(tx: Tx, ctx: SchoolContext, key: AttendanceFeature, isOn: boolean) {
  if (!ATTENDANCE_FEATURES.some((f) => f.key === key)) throw new Error("Unknown feature");
  const before = await tx.schoolFeature.findUnique({ where: { schoolId_featureKey: { schoolId: ctx.schoolId, featureKey: key } } });
  if ((before?.isOn ?? false) === isOn) return false;
  await tx.schoolFeature.upsert({
    where: { schoolId_featureKey: { schoolId: ctx.schoolId, featureKey: key } },
    create: { schoolId: ctx.schoolId, featureKey: key, isOn },
    update: { isOn },
  });
  await writeAudit(tx, ctx, { action: isOn ? "switched-on" : "switched-off", recordType: "School Feature", recordId: null, before: { key, isOn: before?.isOn ?? false }, after: { key, isOn } });
  return true;
}

export type Tone = "success" | "danger" | "warning" | "info" | "brand" | "neutral";
export const TONES: { value: Tone; label: string }[] = [
  { value: "success", label: "Green" },
  { value: "danger", label: "Red" },
  { value: "warning", label: "Yellow" },
  { value: "info", label: "Light blue" },
  { value: "brand", label: "Blue" },
  { value: "neutral", label: "Grey" },
];
export const COUNTS = [
  { value: "present", label: "Counts as present" },
  { value: "absent", label: "Counts as absent" },
  { value: "half", label: "Counts as half a day" },
  { value: "not-counted", label: "Not counted" },
] as const;

/** The standard statuses every school starts with (05 §2, §6). */
export const SYSTEM_STATUSES: { key: string; name: string; letter: string; tone: Tone; counts: string; forWhom: string }[] = [
  { key: "present", name: "Present", letter: "P", tone: "success", counts: "present", forWhom: "both" },
  { key: "absent", name: "Absent", letter: "A", tone: "danger", counts: "absent", forWhom: "both" },
  { key: "late", name: "Late", letter: "L", tone: "warning", counts: "present", forWhom: "both" },
  { key: "half-day", name: "Half-day", letter: "H", tone: "warning", counts: "half", forWhom: "both" },
  { key: "excused", name: "Excused", letter: "E", tone: "neutral", counts: "not-counted", forWhom: "students" },
  { key: "leave", name: "Leave", letter: "LV", tone: "info", counts: "not-counted", forWhom: "both" },
  { key: "medical", name: "Medical", letter: "M", tone: "info", counts: "not-counted", forWhom: "students" },
];

/** Student leave types every school starts with: Medical, Emergency, Holiday (05 §3). */
const STUDENT_LEAVE_TYPES = [
  { code: "MED", name: "Medical" },
  { code: "EMG", name: "Emergency" },
  { code: "HOL", name: "Holiday" },
];

/** Makes the school's Attendance Settings, statuses and student leave types on first use. Safe to run twice. */
export async function ensureAttendanceDefaults(tx: Tx, ctx: SchoolContext): Promise<AttendanceSetting> {
  const existing = await tx.attendanceSetting.findUnique({ where: { schoolId: ctx.schoolId } });
  if (existing) return existing;
  await tx.attendanceStatus.createMany({
    data: SYSTEM_STATUSES.map((s, i) => ({ schoolId: ctx.schoolId, ...s, system: true, sortOrder: i })),
    skipDuplicates: true,
  });
  const have = await tx.leaveType.findMany({ where: { schoolId: ctx.schoolId, forWhom: "student" }, select: { code: true, name: true } });
  const names = new Set(have.map((t) => t.name.toLowerCase()));
  const codes = new Set(have.map((t) => t.code));
  const missing = STUDENT_LEAVE_TYPES.filter((t) => !codes.has(t.code) && !names.has(t.name.toLowerCase()));
  if (missing.length) {
    await tx.leaveType.createMany({ data: missing.map((t) => ({ schoolId: ctx.schoolId, forWhom: "student", code: t.code, name: t.name, daysPerYear: 0 })), skipDuplicates: true });
  }
  return tx.attendanceSetting.upsert({ where: { schoolId: ctx.schoolId }, create: { schoolId: ctx.schoolId }, update: {} });
}

export async function attendanceSettings(tx: Tx, ctx: SchoolContext) {
  return ensureAttendanceDefaults(tx, ctx);
}

export async function statusList(tx: Tx, ctx: SchoolContext, opts: { includeArchived?: boolean } = {}): Promise<AttendanceStatus[]> {
  await ensureAttendanceDefaults(tx, ctx);
  return tx.attendanceStatus.findMany({ where: { schoolId: ctx.schoolId, ...(opts.includeArchived ? {} : { archivedAt: null }) }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
}

export type StatusInfo = Pick<AttendanceStatus, "key" | "name" | "letter" | "tone" | "counts" | "forWhom">;

/** Weight of a status in the %: 1 present, 0.5 half, 0 absent; null when not counted. */
export function weightOf(status: Pick<StatusInfo, "counts"> | undefined): number | null {
  if (!status) return null;
  if (status.counts === "present") return 1;
  if (status.counts === "half") return 0.5;
  if (status.counts === "absent") return 0;
  return null;
}

export function statusMap(list: StatusInfo[]) {
  return new Map(list.map((s) => [s.key, s]));
}

/** For one side only: statuses for students or for staff. */
export function statusesFor(list: StatusInfo[], who: "students" | "staff") {
  return list.filter((s) => s.forWhom === "both" || s.forWhom === who);
}

export const METHOD_WORDS: Record<string, string> = {
  register: "Register",
  manual: "Manual",
  mobile: "Mobile",
  qr: "QR",
  face: "Face",
  fingerprint: "Fingerprint",
  rfid: "RFID card",
  iris: "Iris",
  offline: "Register (offline)",
};
