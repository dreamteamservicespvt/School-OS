"use server";

// Attendance Settings (05 §6): four tabs, the status list, student leave
// types and quotas, and the optional parts switched on per school. Every
// change is audited with the values before and after.

import type { Prisma } from "@prisma/client";
import { requireAction } from "@/lib/current";
import { withSchool, type Tx } from "@/lib/db";
import type { FormState } from "@/lib/forms";
import { writeAudit } from "@/lib/audit";
import { FieldProblem, id, str } from "@/lib/staff/act";
import { act } from "@/lib/attendance/act";
import { actionContext } from "@/lib/attendance/page";
import { AttendanceProblem } from "@/lib/attendance/access";
import { ATTENDANCE_FEATURES, COUNTS, ensureAttendanceDefaults, setAttendanceFeature, TONES, type AttendanceFeature } from "@/lib/attendance/settings";
import { HHMM, minutesOf } from "@/lib/attendance/time";

const METHODS = ["register", "mobile", "qr", "device", "geo"];
const NOTIFY = ["parent", "class-teacher", "principal"];
const ROLE_KEYS = ["principal", "school-admin", "vice-principal", "class-teacher", "hr"];

async function admin() {
  const { current } = await requireAction("attendance-management", "edit");
  const { access } = await actionContext(current);
  if (!access.admin) throw new AttendanceProblem("Only the School Admin or the Principal can change Attendance Settings.");
  return current;
}

const on = (fd: FormData, k: string) => str(fd, k) === "on";
const many = (fd: FormData, k: string, allowed: string[]) => [...new Set(fd.getAll(k).map(String).filter((v) => allowed.includes(v)))];
function time(fd: FormData, k: string, label: string) {
  const v = str(fd, k);
  if (!HHMM.test(v)) throw new FieldProblem(`${label} must be a time like 08:45.`, k);
  return v;
}
function int(fd: FormData, k: string, label: string, min: number, max: number) {
  const n = Number.parseInt(str(fd, k), 10);
  if (!Number.isInteger(n) || n < min || n > max) throw new FieldProblem(`${label} must be a whole number from ${min} to ${max}.`, k);
  return n;
}

async function saveSetting(tx: Tx, ctx: { schoolId: string; userId: string | null }, data: Prisma.AttendanceSettingUpdateInput, tab: string) {
  const before = await ensureAttendanceDefaults(tx, ctx);
  const after = await tx.attendanceSetting.update({ where: { schoolId: ctx.schoolId }, data: { ...data, updatedById: ctx.userId } });
  const keys = Object.keys(data) as (keyof typeof before)[];
  const was = Object.fromEntries(keys.map((k) => [k, before[k]])) as Prisma.InputJsonValue;
  const now = Object.fromEntries(keys.map((k) => [k, after[k]])) as Prisma.InputJsonValue;
  await writeAudit(tx, ctx, { action: "changed", recordType: "Attendance Setting", recordId: before.id, before: was, after: { ...(now as object), tab } as Prisma.InputJsonValue });
}

export async function savePunchMethodsAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const current = await admin();
    const studentMethods = many(fd, "studentMethods", METHODS);
    const staffMethods = many(fd, "staffMethods", METHODS);
    if (studentMethods.length === 0) throw new FieldProblem("Choose at least one way to mark students, usually Register.", "studentMethods");
    if (staffMethods.length === 0) throw new FieldProblem("Choose at least one way to mark staff, usually Register.", "staffMethods");
    const punchWindowStart = time(fd, "punchWindowStart", "Window start");
    const punchWindowEnd = time(fd, "punchWindowEnd", "Window end");
    if (minutesOf(punchWindowEnd) <= minutesOf(punchWindowStart)) throw new FieldProblem("The window must end after it starts.", "punchWindowEnd");
    const data = {
      studentMethods, staffMethods, punchWindowStart, punchWindowEnd,
      repeatPunchMinutes: int(fd, "repeatPunchMinutes", "Repeat punch minutes", 1, 120),
      maxClockSkewMinutes: int(fd, "maxClockSkewMinutes", "Phone clock difference", 1, 240),
    };
    const wanted = new Map<AttendanceFeature, boolean>([
      ["attendance-period-wise", str(fd, "method") === "period"],
      ["attendance-offline", on(fd, "offline")],
      ["attendance-devices", staffMethods.includes("device") || studentMethods.includes("device")],
      ["attendance-qr", staffMethods.includes("qr") || studentMethods.includes("qr")],
      ["attendance-mobile", staffMethods.includes("mobile") || studentMethods.includes("mobile") || staffMethods.includes("geo")],
    ]);
    await withSchool(current.ctx, async (tx) => {
      if (wanted.get("attendance-period-wise")) {
        const periods = await tx.timetablePeriod.count({});
        if (periods === 0) throw new FieldProblem("Period-wise attendance needs a Time Table. Publish one in Time Table first.", "method");
      }
      await saveSetting(tx, current.ctx, data, "Punch methods");
      for (const [k, v] of wanted) await setAttendanceFeature(tx, current.ctx, k, v);
    });
    return {};
  }, () => "Punch methods saved.");
}

export async function saveDisplayAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const current = await admin();
    const data = {
      defaultStatus: str(fd, "defaultStatus") === "none" ? "none" : "present",
      periodDayRule: str(fd, "periodDayRule") === "most" ? "most" : "any",
      registerOrder: str(fd, "registerOrder") === "name" ? "name" : "roll",
      showPhotos: on(fd, "showPhotos"),
    };
    await withSchool(current.ctx, (tx) => saveSetting(tx, current.ctx, data, "Display and register"));
    return {};
  }, () => "Display and register settings saved.");
}

export async function saveLateRulesAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const current = await admin();
    const half = str(fd, "staffHalfDayAfter");
    if (half && !HHMM.test(half)) throw new FieldProblem("Half-day time must be a time like 11:00, or empty.", "staffHalfDayAfter");
    const lockOverrideRoles = many(fd, "lockOverrideRoles", ROLE_KEYS);
    if (lockOverrideRoles.length === 0) throw new FieldProblem("Choose at least one role that may change attendance after the lock, usually the Principal.", "lockOverrideRoles");
    const data = {
      studentStartTime: time(fd, "studentStartTime", "Student start time"),
      studentLateAfterMin: int(fd, "studentLateAfterMin", "Student late after", 0, 240),
      staffStartTime: time(fd, "staffStartTime", "Staff start time"),
      staffLateAfterMin: int(fd, "staffLateAfterMin", "Staff late after", 0, 240),
      staffHalfDayAfter: half || null,
      lockTime: time(fd, "lockTime", "Lock time"),
      lockOverrideRoles,
    };
    if (minutesOf(data.lockTime) <= minutesOf(data.studentStartTime)) throw new FieldProblem("Lock time must be after the student start time, so there is time to take attendance.", "lockTime");
    await withSchool(current.ctx, (tx) => saveSetting(tx, current.ctx, data, "Late rules"));
    return {};
  }, () => "Late rules and lock time saved.");
}

export async function saveNotificationsAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const current = await admin();
    // The message's text and channels are Communication's "Absent today" message (one setting); only the switch and the wait are here.
    const data = {
      absenceAlertOn: on(fd, "absenceAlertOn"), absenceDelayMinutes: int(fd, "absenceDelayMinutes", "Wait before sending", 0, 240),
      lateAlertOn: on(fd, "lateAlertOn"),
      thresholdOn: on(fd, "thresholdOn"), thresholdPercent: int(fd, "thresholdPercent", "Threshold %", 1, 100), thresholdNotify: many(fd, "thresholdNotify", NOTIFY),
      chronicOn: on(fd, "chronicOn"), chronicDays: int(fd, "chronicDays", "Days in a row", 2, 30), chronicNotify: many(fd, "chronicNotify", NOTIFY),
    };
    await withSchool(current.ctx, (tx) => saveSetting(tx, current.ctx, data, "Notifications"));
    return {};
  }, () => "Alert settings saved.");
}

export async function saveFeatureAction(_: FormState<unknown>, fd: FormData) {
  const key = str(fd, "key") as AttendanceFeature;
  const turnOn = str(fd, "on") === "1";
  return act(fd, async () => {
    const current = await admin();
    if (!ATTENDANCE_FEATURES.some((f) => f.key === key)) throw new FieldProblem("Choose a feature.");
    await withSchool(current.ctx, (tx) => setAttendanceFeature(tx, current.ctx, key, turnOn));
    return {};
  }, () => `${ATTENDANCE_FEATURES.find((f) => f.key === key)?.label ?? "Feature"} switched ${turnOn ? "on" : "off"}.`);
}

export async function saveLeaveRulesAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const current = await admin();
    const data = { classTeacherLeaveDays: int(fd, "classTeacherLeaveDays", "Class teacher limit", 0, 30), quotaOverNeedsApproval: on(fd, "quotaOverNeedsApproval") };
    await withSchool(current.ctx, async (tx) => {
      await saveSetting(tx, current.ctx, data, "Student leave");
      await setAttendanceFeature(tx, current.ctx, "attendance-leave-quotas", on(fd, "quotasOn"));
    });
    return {};
  }, () => "Student leave rules saved.");
}

// ---------------------------------------------------------------- statuses

export async function saveStatusAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const current = await admin();
    const statusId = str(fd, "statusId");
    const name = str(fd, "name").slice(0, 30);
    const letter = str(fd, "letter").toUpperCase().slice(0, 3);
    const tone = str(fd, "tone");
    const counts = str(fd, "counts");
    const forWhom = str(fd, "forWhom");
    if (name.length < 2) throw new FieldProblem("Status name is needed.", "name");
    if (!/^[A-Z0-9]{1,3}$/.test(letter)) throw new FieldProblem("Letter must be 1 to 3 letters or numbers, like OD.", "letter");
    if (!TONES.some((t) => t.value === tone)) throw new FieldProblem("Choose a colour.", "tone");
    if (!COUNTS.some((c) => c.value === counts)) throw new FieldProblem("Choose how it counts.", "counts");
    if (!["both", "students", "staff"].includes(forWhom)) throw new FieldProblem("Choose who it is for.", "forWhom");
    return withSchool(current.ctx, async (tx) => {
      await ensureAttendanceDefaults(tx, current.ctx);
      const others = await tx.attendanceStatus.findMany({ where: { archivedAt: null, ...(statusId ? { id: { not: statusId } } : {}) } });
      if (others.some((s) => s.letter === letter)) throw new FieldProblem(`Letter ${letter} is already used by ${others.find((s) => s.letter === letter)!.name}. Choose another.`, "letter");
      if (others.some((s) => s.name.toLowerCase() === name.toLowerCase())) throw new FieldProblem(`A status called ${name} already exists.`, "name");
      if (statusId) {
        const before = await tx.attendanceStatus.findFirst({ where: { id: statusId } });
        if (!before) throw new AttendanceProblem("This status was not found.");
        // System statuses keep how they count and who they are for: the rules depend on them.
        const data = before.system ? { name, letter, tone } : { name, letter, tone, counts, forWhom };
        await tx.attendanceStatus.update({ where: { id: statusId }, data });
        await writeAudit(tx, current.ctx, { action: "changed", recordType: "Attendance Status", recordId: statusId, before: { name: before.name, letter: before.letter, tone: before.tone, counts: before.counts, forWhom: before.forWhom }, after: data });
        return { name };
      }
      const count = await tx.attendanceStatus.count();
      const key = `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24)}`;
      if (await tx.attendanceStatus.findFirst({ where: { key } })) throw new FieldProblem(`A status like ${name} existed before. Restore it from the archived list instead.`, "name");
      const row = await tx.attendanceStatus.create({ data: { schoolId: current.ctx.schoolId, key, name, letter, tone, counts, forWhom, sortOrder: count } });
      await writeAudit(tx, current.ctx, { action: "created", recordType: "Attendance Status", recordId: row.id, after: { name, letter, tone, counts, forWhom } });
      return { name };
    });
  }, (r) => `Status "${r.name}" saved.`);
}

export async function archiveStatusAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const current = await admin();
    const statusId = id(fd, "statusId", "status");
    const restore = str(fd, "restore") === "1";
    return withSchool(current.ctx, async (tx) => {
      const s = await tx.attendanceStatus.findFirst({ where: { id: statusId } });
      if (!s) throw new AttendanceProblem("This status was not found.");
      if (s.system) throw new AttendanceProblem(`${s.name} is one of the standard statuses and cannot be archived.`);
      await tx.attendanceStatus.update({ where: { id: statusId }, data: { archivedAt: restore ? null : new Date() } });
      await writeAudit(tx, current.ctx, { action: restore ? "restored" : "archived", recordType: "Attendance Status", recordId: statusId, before: { name: s.name } });
      return { name: s.name, restore };
    });
  }, (r) => (r.restore ? `${r.name} restored.` : `${r.name} archived. Past marks keep it; it is no longer offered.`));
}

// ---------------------------------------------------------------- student leave types and quotas

export async function saveLeaveTypeAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const current = await admin();
    const typeId = str(fd, "typeId");
    const name = str(fd, "name").slice(0, 40);
    if (name.length < 2) throw new FieldProblem("Leave type name is needed.", "name");
    const quotaDays = str(fd, "quotaDays");
    const quotaPeriod = str(fd, "quotaPeriod") === "year" ? "year" : "term";
    const days = quotaDays === "" ? null : Number(quotaDays);
    if (days !== null && (!Number.isFinite(days) || days < 0.5 || days > 200 || (days * 2) % 1 !== 0)) throw new FieldProblem("Days allowed must be a number like 6 or 2.5, or empty for no limit.", "quotaDays");
    return withSchool(current.ctx, async (tx) => {
      const dup = await tx.leaveType.findFirst({ where: { forWhom: "student", archivedAt: null, name: { equals: name, mode: "insensitive" }, ...(typeId ? { id: { not: typeId } } : {}) } });
      if (dup) throw new FieldProblem(`A student leave type called ${dup.name} already exists.`, "name");
      let type;
      if (typeId) {
        const before = await tx.leaveType.findFirst({ where: { id: typeId, forWhom: "student" } });
        if (!before) throw new AttendanceProblem("This leave type was not found.");
        type = await tx.leaveType.update({ where: { id: typeId }, data: { name } });
        await writeAudit(tx, current.ctx, { action: "changed", recordType: "Leave Type", recordId: typeId, before: { name: before.name }, after: { name } });
      } else {
        const base = name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "LV";
        let code = base;
        for (let i = 2; await tx.leaveType.findFirst({ where: { forWhom: "student", code } }); i++) code = `${base}${i}`;
        type = await tx.leaveType.create({ data: { schoolId: current.ctx.schoolId, forWhom: "student", name, code, daysPerYear: 0 } });
        await writeAudit(tx, current.ctx, { action: "created", recordType: "Leave Type", recordId: type.id, after: { name, code, for: "student" } });
      }
      const quota = await tx.studentLeaveQuota.findUnique({ where: { leaveTypeId: type.id } });
      if (days === null) {
        if (quota && !quota.archivedAt) {
          await tx.studentLeaveQuota.update({ where: { id: quota.id }, data: { archivedAt: new Date() } });
          await writeAudit(tx, current.ctx, { action: "archived", recordType: "Student Leave Quota", recordId: quota.id, before: { days: Number(quota.days), period: quota.period } });
        }
      } else if (!quota || quota.archivedAt || Number(quota.days) !== days || quota.period !== quotaPeriod) {
        const row = await tx.studentLeaveQuota.upsert({ where: { leaveTypeId: type.id }, create: { schoolId: current.ctx.schoolId, leaveTypeId: type.id, days, period: quotaPeriod }, update: { days, period: quotaPeriod, archivedAt: null } });
        await writeAudit(tx, current.ctx, { action: quota ? "changed" : "created", recordType: "Student Leave Quota", recordId: row.id, before: quota ? { days: Number(quota.days), period: quota.period } : null, after: { type: name, days, period: quotaPeriod } });
      }
      return { name };
    });
  }, (r) => `Leave type "${r.name}" saved.`);
}

export async function archiveLeaveTypeAction(_: FormState<unknown>, fd: FormData) {
  return act(fd, async () => {
    const current = await admin();
    const typeId = id(fd, "typeId", "leave type");
    return withSchool(current.ctx, async (tx) => {
      const t = await tx.leaveType.findFirst({ where: { id: typeId, forWhom: "student", archivedAt: null } });
      if (!t) throw new AttendanceProblem("This leave type was not found.");
      const left = await tx.leaveType.count({ where: { forWhom: "student", archivedAt: null } });
      if (left <= 1) throw new AttendanceProblem("Keep at least one student leave type.");
      await tx.leaveType.update({ where: { id: typeId }, data: { archivedAt: new Date() } });
      await writeAudit(tx, current.ctx, { action: "archived", recordType: "Leave Type", recordId: typeId, before: { name: t.name } });
      return { name: t.name };
    });
  }, (r) => `${r.name} archived. Leave already recorded keeps it.`);
}
