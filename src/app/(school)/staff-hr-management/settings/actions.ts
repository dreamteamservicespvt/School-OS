"use server";

import type { Prisma } from "@prisma/client";
import { requireAction } from "@/lib/current";
import { withSchool, type Tx } from "@/lib/db";
import type { FormState } from "@/lib/forms";
import { writeAudit } from "@/lib/audit";
import { act, FieldProblem, optionalId, str } from "@/lib/staff/act";
import { HrOnlyError } from "@/lib/staff/access";
import { EMPLOYMENT_TYPES, HR_FEATURES, setHrFeature, USERNAME_FORMATS, type HrFeature } from "@/lib/staff/settings";
import { StaffProblem } from "@/lib/staff/staff";
import { schoolRole } from "@/lib/school-roles";

type Current = Awaited<ReturnType<typeof requireAction>>["current"];

async function hr<T>(work: (tx: Tx, current: Current) => Promise<T>) {
  const { current, reach } = await requireAction("staff-hr-management", "edit");
  if (reach !== "all") throw new HrOnlyError("HR Settings");
  return withSchool(current.ctx, (tx) => work(tx, current), { timeout: 30_000 });
}

const name = (fd: FormData, key = "name", max = 80) => {
  const v = str(fd, key).replace(/\s+/g, " ");
  if (v.length < 2) throw new FieldProblem("Name is needed.", key);
  return v.slice(0, max);
};
const yes = (fd: FormData, key: string) => str(fd, key) === "on";
const days = (fd: FormData, key: string, label: string, allowHalf = true) => {
  const raw = str(fd, key) || "0";
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 365 || (allowHalf ? Math.round(n * 2) !== n * 2 : !Number.isInteger(n))) throw new FieldProblem(`${label} must be a number of days from 0 to 365.`, key);
  return n;
};

// ---------------------------------------------------------------- departments

export async function saveDepartment(_: FormState<unknown>, fd: FormData) {
  return act(fd, () => hr(async (tx, c) => {
    const id = optionalId(fd, "id");
    const n = name(fd);
    const headStaffId = optionalId(fd, "headStaffId");
    const clash = await tx.department.findFirst({ where: { name: { equals: n, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) } });
    if (clash) throw new FieldProblem(`A department named ${clash.name} already exists${clash.archivedAt ? " (archived)" : ""}.`, "name");
    if (headStaffId && !(await tx.staff.findFirst({ where: { id: headStaffId, archivedAt: null, status: "ACTIVE" } }))) throw new FieldProblem("Choose an active staff member as head.", "headStaffId");
    if (id) {
      const before = await tx.department.findFirstOrThrow({ where: { id } });
      await tx.department.update({ where: { id }, data: { name: n, headStaffId } });
      await writeAudit(tx, c.ctx, { action: "changed", recordType: "Department", recordId: id, before: { name: before.name, headStaffId: before.headStaffId }, after: { name: n, headStaffId } });
    } else {
      const d = await tx.department.create({ data: { schoolId: c.ctx.schoolId, name: n, headStaffId } });
      await writeAudit(tx, c.ctx, { action: "created", recordType: "Department", recordId: d.id, after: { name: n, headStaffId } });
    }
    return n;
  }), (n) => `${n} saved.`);
}

export async function archiveDepartment(_: FormState<unknown>, fd: FormData) {
  return act(fd, () => hr(async (tx, c) => {
    const id = optionalId(fd, "id");
    const d = id ? await tx.department.findFirst({ where: { id, archivedAt: null } }) : null;
    if (!d) throw new StaffProblem("This department was not found.");
    const n = await tx.staff.count({ where: { departmentId: d.id, archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] } } });
    if (n) throw new StaffProblem(`${n} staff are in ${d.name}. Move them to another department first.`);
    await tx.department.update({ where: { id: d.id }, data: { archivedAt: new Date() } });
    await writeAudit(tx, c.ctx, { action: "archived", recordType: "Department", recordId: d.id, before: { name: d.name } });
    return d.name;
  }), (n) => `${n} archived.`);
}

// ---------------------------------------------------------------- designations

export async function saveDesignation(_: FormState<unknown>, fd: FormData) {
  return act(fd, () => hr(async (tx, c) => {
    const id = optionalId(fd, "id");
    const n = name(fd);
    const staffType = str(fd, "staffType") === "Non-teaching" ? "Non-teaching" : "Teaching";
    const roleKey = str(fd, "defaultRoleKey") || null;
    if (roleKey && !(await schoolRole(tx, c.ctx, { where: { key: roleKey, archivedAt: null } }))) throw new FieldProblem("Choose a role from the list.", "defaultRoleKey");
    const data = { name: n, staffType, defaultDepartmentId: optionalId(fd, "defaultDepartmentId"), defaultRoleKey: roleKey };
    const clash = await tx.designation.findFirst({ where: { name: { equals: n, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) } });
    if (clash) throw new FieldProblem(`${clash.name} already exists${clash.archivedAt ? " (archived)" : ""}.`, "name");
    if (id) {
      const before = await tx.designation.findFirstOrThrow({ where: { id } });
      await tx.designation.update({ where: { id }, data });
      // Staff keep their designation words; a rename carries over to them.
      if (before.name !== n) await tx.staff.updateMany({ where: { designation: before.name }, data: { designation: n } });
      await writeAudit(tx, c.ctx, { action: "changed", recordType: "Designation", recordId: id, before: { name: before.name, staffType: before.staffType, defaultRoleKey: before.defaultRoleKey }, after: data });
    } else {
      const count = await tx.designation.count();
      const d = await tx.designation.create({ data: { schoolId: c.ctx.schoolId, ...data, sortOrder: count + 1 } });
      await writeAudit(tx, c.ctx, { action: "created", recordType: "Designation", recordId: d.id, after: data });
    }
    return n;
  }), (n) => `${n} saved.`);
}

export async function archiveDesignation(_: FormState<unknown>, fd: FormData) {
  return act(fd, () => hr(async (tx, c) => {
    const id = optionalId(fd, "id");
    const d = id ? await tx.designation.findFirst({ where: { id, archivedAt: null } }) : null;
    if (!d) throw new StaffProblem("This designation was not found.");
    const n = await tx.staff.count({ where: { designation: d.name, archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] } } });
    if (n) throw new StaffProblem(`${n} staff are ${d.name}. Change their designation first.`);
    await tx.designation.update({ where: { id: d.id }, data: { archivedAt: new Date() } });
    await writeAudit(tx, c.ctx, { action: "archived", recordType: "Designation", recordId: d.id, before: { name: d.name } });
    return d.name;
  }), (n) => `${n} archived.`);
}

// ---------------------------------------------------------------- leave types

export async function saveLeaveType(_: FormState<unknown>, fd: FormData) {
  return act(fd, () => hr(async (tx, c) => {
    const id = optionalId(fd, "id");
    const n = name(fd, "name", 60);
    const code = (str(fd, "code") || n.split(" ").map((w) => w[0]).join("")).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (code.length < 2) throw new FieldProblem("Short code is needed, like CL.", "code");
    const paid = yes(fd, "paid");
    const needsDoc = str(fd, "needsDocAfter");
    if (needsDoc && !/^\d{1,3}$/.test(needsDoc)) throw new FieldProblem("Document after must be a whole number of days, or empty.", "needsDocAfter");
    const type = {
      name: n, code, daysPerYear: paid ? days(fd, "daysPerYear", "Days a year") : 0, paid, carryForward: paid && yes(fd, "carryForward"),
      maxCarry: paid && yes(fd, "carryForward") ? days(fd, "maxCarry", "Most days carried") : 0, needsDocAfter: needsDoc ? Number(needsDoc) : null,
    };
    const quota: Record<string, number> = {};
    for (const g of EMPLOYMENT_TYPES) {
      const v = str(fd, `quota:${g}`);
      if (v) quota[g] = days(fd, `quota:${g}`, `${g} quota`);
    }
    const rule = { halfDayAllowed: yes(fd, "halfDayAllowed"), documentRequired: yes(fd, "documentRequired"), countsHolidays: yes(fd, "countsHolidays"), lossOfPay: paid && yes(fd, "lossOfPay"), sensitive: yes(fd, "sensitive"), quotaByGroup: quota as Prisma.InputJsonValue };
    const clash = await tx.leaveType.findFirst({ where: { forWhom: "staff", OR: [{ code }, { name: { equals: n, mode: "insensitive" } }], ...(id ? { id: { not: id } } : {}) } });
    if (clash) throw new FieldProblem(`${clash.name} (${clash.code}) already exists. Use another name and code.`, clash.code === code ? "code" : "name");
    let typeId: string;
    if (id) {
      const before = await tx.leaveType.findFirstOrThrow({ where: { id, forWhom: "staff" } });
      await tx.leaveType.update({ where: { id }, data: type });
      typeId = id;
      await writeAudit(tx, c.ctx, { action: "changed", recordType: "Leave Type", recordId: id, before: { name: before.name, daysPerYear: Number(before.daysPerYear), paid: before.paid, carryForward: before.carryForward }, after: { ...type, ...rule } as Prisma.InputJsonValue });
    } else {
      const t = await tx.leaveType.create({ data: { schoolId: c.ctx.schoolId, forWhom: "staff", ...type } });
      typeId = t.id;
      await writeAudit(tx, c.ctx, { action: "created", recordType: "Leave Type", recordId: t.id, after: { ...type, ...rule } as Prisma.InputJsonValue });
    }
    await tx.leaveTypeRule.upsert({ where: { leaveTypeId: typeId }, create: { leaveTypeId: typeId, schoolId: c.ctx.schoolId, ...rule }, update: rule });
    return n;
  }), (n) => `${n} saved. New balances use it; balances already given stay until adjusted.`);
}

export async function archiveLeaveType(_: FormState<unknown>, fd: FormData) {
  return act(fd, () => hr(async (tx, c) => {
    const id = optionalId(fd, "id");
    const t = id ? await tx.leaveType.findFirst({ where: { id, forWhom: "staff", archivedAt: null } }) : null;
    if (!t) throw new StaffProblem("This leave type was not found.");
    const waiting = await tx.leaveRequest.count({ where: { leaveTypeId: t.id, status: "WAITING", archivedAt: null } });
    if (waiting) throw new StaffProblem(`${waiting} ${t.name} request${waiting === 1 ? " is" : "s are"} waiting. Decide them first.`);
    await tx.leaveType.update({ where: { id: t.id }, data: { archivedAt: new Date() } });
    await writeAudit(tx, c.ctx, { action: "archived", recordType: "Leave Type", recordId: t.id, before: { name: t.name } });
    return t.name;
  }), (n) => `${n} archived. Past leave of this type stays in the history.`);
}

// ---------------------------------------------------------------- general

export async function saveGeneral(_: FormState<unknown>, fd: FormData) {
  return act(fd, () => hr(async (tx, c) => {
    const prefix = str(fd, "staffIdPrefix").toUpperCase();
    if (!/^[A-Z0-9/-]{0,12}$/.test(prefix)) throw new FieldProblem("Prefix can have letters, numbers, - and /, up to 12.", "staffIdPrefix");
    const digits = Number(str(fd, "staffIdDigits"));
    if (!Number.isInteger(digits) || digits < 1 || digits > 8) throw new FieldProblem("Digits must be from 1 to 8.", "staffIdDigits");
    const usernameFormat = str(fd, "usernameFormat");
    if (!USERNAME_FORMATS.some((u) => u.value === usernameFormat)) throw new FieldProblem("Choose a username format.", "usernameFormat");
    const noticeDays = Number(str(fd, "noticeDays"));
    if (!Number.isInteger(noticeDays) || noticeDays < 0 || noticeDays > 365) throw new FieldProblem("Notice period must be 0 to 365 days.", "noticeDays");
    const reminderDays = [...new Set(str(fd, "reminderDays").split(/[,\s]+/).filter(Boolean).map(Number))].sort((a, b) => b - a);
    if (reminderDays.length === 0 || reminderDays.some((d) => !Number.isInteger(d) || d < 1 || d > 365)) throw new FieldProblem("Reminder days must be numbers like 30, 7.", "reminderDays");
    const documentTypes = [...new Set(str(fd, "documentTypes").split("\n").map((s) => s.trim()).filter(Boolean))].slice(0, 30);
    if (documentTypes.length === 0) throw new FieldProblem("Add at least one document type.", "documentTypes");
    const requiredFields = fd.getAll("requiredFields").map(String).filter((f) => ["email", "dateOfBirth", "gender", "bloodGroup", "address", "qualification", "aadhaar", "photo"].includes(f));
    const data = { staffIdPrefix: prefix, staffIdDigits: digits, usernameFormat, noticeDays, reminderDays, documentTypes, requiredFields };
    const before = await tx.hrSetting.findUniqueOrThrow({ where: { schoolId: c.ctx.schoolId } });
    await tx.hrSetting.update({ where: { schoolId: c.ctx.schoolId }, data: { ...data, updatedById: c.user.id } });
    await writeAudit(tx, c.ctx, {
      action: "changed", recordType: "HR Setting", recordId: null,
      before: { staffIdPrefix: before.staffIdPrefix, staffIdDigits: before.staffIdDigits, usernameFormat: before.usernameFormat, noticeDays: before.noticeDays, reminderDays: before.reminderDays, documentTypes: before.documentTypes, requiredFields: before.requiredFields },
      after: data,
    });
  }), () => "HR Settings saved.");
}

export async function toggleFeature(_: FormState<unknown>, fd: FormData) {
  return act(fd, () => hr(async (tx, c) => {
    const key = str(fd, "key") as HrFeature;
    const f = HR_FEATURES.find((x) => x.key === key);
    if (!f) throw new FieldProblem("Choose a part to switch.");
    const on = str(fd, "on") === "yes";
    await setHrFeature(tx, c.ctx, key, on);
    return `${f.label} switched ${on ? "on" : "off"}.`;
  }), (m) => m);
}
