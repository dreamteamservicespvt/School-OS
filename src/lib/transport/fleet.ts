// Vehicles & Drivers (12 §2): vehicles with their papers and service
// schedule, drivers and conductors (staff or hired) with their driver app
// logins and phones, transport vendors, and fuel and repair costs that go to
// Finance as expenses.
import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { Driver, Vehicle } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { encryptField, maskLast4 } from "../crypto";
import { formatDate, formatRupees } from "../format";
import { DOCUMENT_TYPES, saveFile } from "../files";
import { inviteUser, resendInvite, suggestUsername, disableUser, enableUser } from "../settings/users";
import { setTemplateOn } from "../settings/roles";
import { createStaff } from "../staff/staff";
import { ensureFinanceDefaults } from "../finance/settings";
import { cancelExpense, recordExpense } from "../finance/expenses";
import { TransportProblem } from "./problem";
import { holdsSeat } from "./places";
import { normalPlate, plateLooksRight, showPlate, paperLabel } from "./words";
import { schoolRole } from "../school-roles";

/* ---------- Vehicles ---------- */

export type VehicleInput = {
  number: string;
  label: string | null;
  type: string;
  model: string | null;
  capacity: number;
  ownership: string;
  vendorId: string | null;
  status: string;
  gpsDeviceId: string | null;
  odometerKm: number | null;
  serviceEveryKm: number | null;
  serviceEveryDays: number | null;
};

async function checkVehicle(tx: Tx, input: VehicleInput, id: string | null) {
  const number = normalPlate(input.number);
  if (!number) throw new TransportProblem("Enter the vehicle number.", "number");
  if (!plateLooksRight(number)) throw new TransportProblem("This does not look like an Indian vehicle number, like TS 07 UB 2236.", "number");
  const dup = await tx.vehicle.findFirst({ where: { number, ...(id ? { id: { not: id } } : {}) } });
  if (dup) throw new TransportProblem(`${showPlate(number)} already added${dup.label ? ` as ${dup.label}` : ""}${dup.archivedAt ? " (archived)" : ""}.`, "number", { href: `/transport-management/vehicles?vehicle=${dup.id}`, label: "Open the existing vehicle" });
  if (!["BUS", "VAN", "CAR"].includes(input.type)) throw new TransportProblem("Choose the type.", "type");
  if (!Number.isInteger(input.capacity) || input.capacity < 1 || input.capacity > 100) throw new TransportProblem("Enter the number of seats (1 to 100).", "capacity");
  if (!["OWNED", "HIRED"].includes(input.ownership)) throw new TransportProblem("Choose owned or hired.", "ownership");
  if (input.ownership === "HIRED") {
    if (!input.vendorId) throw new TransportProblem("Choose the vendor this vehicle is hired from.", "vendorId");
    if (!(await tx.transportVendor.findFirst({ where: { id: input.vendorId, archivedAt: null } }))) throw new TransportProblem("Choose the vendor from the list.", "vendorId");
  }
  if (!["ACTIVE", "UNDER_REPAIR", "INACTIVE"].includes(input.status)) throw new TransportProblem("Choose the status.", "status");
  if (input.gpsDeviceId) {
    const g = await tx.vehicle.findFirst({ where: { gpsDeviceId: input.gpsDeviceId, archivedAt: null, ...(id ? { id: { not: id } } : {}) } });
    if (g) throw new TransportProblem(`GPS device ${input.gpsDeviceId} is already linked to ${g.label ?? showPlate(g.number)}.`, "gpsDeviceId");
  }
  return number;
}

export async function addVehicle(tx: Tx, ctx: SchoolContext, input: VehicleInput, papers: { kind: string; expiresOn: Date }[] = []) {
  const number = await checkVehicle(tx, input, null);
  const v = await tx.vehicle.create({
    data: {
      schoolId: ctx.schoolId, number, label: input.label, type: input.type, model: input.model, capacity: input.capacity, ownership: input.ownership,
      vendorId: input.ownership === "HIRED" ? input.vendorId : null, status: input.status, gpsDeviceId: input.gpsDeviceId, odometerKm: input.odometerKm,
      serviceEveryKm: input.serviceEveryKm, serviceEveryDays: input.serviceEveryDays, createdById: ctx.userId,
    },
  });
  for (const p of papers) await tx.vehicleDocument.create({ data: { schoolId: ctx.schoolId, vehicleId: v.id, kind: p.kind, expiresOn: p.expiresOn, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Vehicle", recordId: v.id, after: { number: showPlate(number), type: input.type, seats: input.capacity, ownership: input.ownership, papers: papers.map((p) => `${paperLabel(p.kind)} ${formatDate(p.expiresOn)}`) } });
  return v;
}

export async function editVehicle(tx: Tx, ctx: SchoolContext, id: string, input: VehicleInput, today: Date) {
  const before = await tx.vehicle.findFirst({ where: { id, archivedAt: null } });
  if (!before) throw new TransportProblem("This vehicle was not found.");
  const number = await checkVehicle(tx, input, id);
  const route = await tx.route.findFirst({ where: { vehicleId: id, archivedAt: null } });
  if (route && input.capacity < before.capacity) {
    const used = await tx.transportAssignment.count({ where: { routeId: route.id, ...holdsSeat(today) } });
    if (used > input.capacity) throw new TransportProblem(`Route ${route.number} has ${used} students, more than ${input.capacity} seats. Move students first, or keep more seats.`, "capacity");
  }
  const after = await tx.vehicle.update({
    where: { id },
    data: { number, label: input.label, type: input.type, model: input.model, capacity: input.capacity, ownership: input.ownership, vendorId: input.ownership === "HIRED" ? input.vendorId : null, status: input.status, gpsDeviceId: input.gpsDeviceId, odometerKm: input.odometerKm, serviceEveryKm: input.serviceEveryKm, serviceEveryDays: input.serviceEveryDays },
  });
  await writeAudit(tx, ctx, { action: "updated", recordType: "Vehicle", recordId: id, before: vehicleAudit(before), after: vehicleAudit(after) });
  return after;
}

const vehicleAudit = (v: Vehicle) => ({ number: showPlate(v.number), label: v.label, type: v.type, seats: v.capacity, ownership: v.ownership, vendorId: v.vendorId, status: v.status, gps: v.gpsDeviceId, odometer: v.odometerKm });

export async function archiveVehicle(tx: Tx, ctx: SchoolContext, id: string) {
  const v = await tx.vehicle.findFirst({ where: { id, archivedAt: null } });
  if (!v) throw new TransportProblem("This vehicle was not found.");
  const route = await tx.route.findFirst({ where: { vehicleId: id, archivedAt: null } });
  if (route) throw new TransportProblem(`${v.label ?? showPlate(v.number)} runs Route ${route.number}. Give the route another vehicle first.`);
  await tx.vehicle.update({ where: { id }, data: { archivedAt: new Date(), status: "INACTIVE" } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Vehicle", recordId: id, before: { number: showPlate(v.number) } });
}

/** Upload papers with expiry dates (12 §2). A renewed paper replaces the old one, which stays on record. */
export async function savePaper(tx: Tx, ctx: SchoolContext, input: { vehicleId: string; kind: string; number: string | null; expiresOn: Date; file: File | null }, today: Date) {
  const v = await tx.vehicle.findFirst({ where: { id: input.vehicleId, archivedAt: null } });
  if (!v) throw new TransportProblem("Choose the vehicle.", "vehicleId");
  if (!["INSURANCE", "FITNESS", "PERMIT", "POLLUTION"].includes(input.kind)) throw new TransportProblem("Choose the paper.", "kind");
  if (input.expiresOn <= today) throw new TransportProblem("The new expiry must be after today.", "expiresOn");
  const file = input.file ? await saveFile(tx, ctx, { file: input.file, purpose: "vehicle-paper", allowed: DOCUMENT_TYPES, maxImageWidth: 1600 }) : null;
  const old = await tx.vehicleDocument.findFirst({ where: { vehicleId: v.id, kind: input.kind, replacedAt: null }, orderBy: { expiresOn: "desc" } });
  if (old) await tx.vehicleDocument.update({ where: { id: old.id }, data: { replacedAt: new Date() } });
  const doc = await tx.vehicleDocument.create({ data: { schoolId: ctx.schoolId, vehicleId: v.id, kind: input.kind, number: input.number, expiresOn: input.expiresOn, fileId: file?.id ?? null, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: old ? "renewed" : "added", recordType: "Vehicle Document", recordId: doc.id, before: old ? { expires: formatDate(old.expiresOn) } : null, after: { vehicle: showPlate(v.number), paper: paperLabel(input.kind), expires: formatDate(input.expiresOn), file: Boolean(file) } });
  return { doc, vehicle: v };
}

/* ---------- Vendors ---------- */

export type VendorInput = { name: string; contactName: string | null; phone: string | null; email: string | null; address: string | null; gstin: string | null; bankName: string | null; bankAccountNo: string | null; ifsc: string | null; monthlyChargePaise: bigint | null; contractEnd: Date | null };

function checkVendor(input: VendorInput) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) throw new TransportProblem("Enter the company name.", "name");
  if (input.phone && !/^[6-9]\d{9}$/.test(input.phone)) throw new TransportProblem("Enter a 10-digit mobile number.", "phone");
  if (input.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(input.gstin)) throw new TransportProblem("This GSTIN does not look right. It has 15 characters, like 36ABCFS1234K1Z5.", "gstin");
  if (input.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(input.ifsc)) throw new TransportProblem("This IFSC does not look right, like HDFC0001234.", "ifsc");
  if (input.bankAccountNo && !/^\d{9,18}$/.test(input.bankAccountNo)) throw new TransportProblem("The account number has 9 to 18 digits.", "bankAccountNo");
  return name;
}

export async function saveVendor(tx: Tx, ctx: SchoolContext, id: string | null, input: VendorInput) {
  const name = checkVendor(input);
  const clash = await tx.transportVendor.findFirst({ where: { archivedAt: null, name: { equals: name, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) } });
  if (clash) throw new TransportProblem(`${name} is already added.`, "name");
  const bank = input.bankAccountNo ? { bankAccountNo: encryptField(input.bankAccountNo), bankLast4: input.bankAccountNo.slice(-4) } : {};
  const data = { name, contactName: input.contactName, phone: input.phone, email: input.email, address: input.address, gstin: input.gstin, bankName: input.bankName, ifsc: input.ifsc, monthlyChargePaise: input.monthlyChargePaise, contractEnd: input.contractEnd, ...bank };
  const before = id ? await tx.transportVendor.findFirst({ where: { id, archivedAt: null } }) : null;
  if (id && !before) throw new TransportProblem("This vendor was not found.");
  const v = id ? await tx.transportVendor.update({ where: { id }, data }) : await tx.transportVendor.create({ data: { ...data, schoolId: ctx.schoolId, createdById: ctx.userId } });
  const audit = (x: typeof v | null) => (x ? { name: x.name, phone: x.phone, gstin: x.gstin, bank: x.bankLast4 ? maskLast4(x.bankLast4) : null, monthly: x.monthlyChargePaise != null ? formatRupees(x.monthlyChargePaise) : null } : null);
  await writeAudit(tx, ctx, { action: id ? "updated" : "created", recordType: "Transport Vendor", recordId: v.id, before: audit(before), after: audit(v) });
  return v;
}

export async function archiveVendor(tx: Tx, ctx: SchoolContext, id: string) {
  const v = await tx.transportVendor.findFirst({ where: { id, archivedAt: null } });
  if (!v) throw new TransportProblem("This vendor was not found.");
  const used = (await tx.vehicle.count({ where: { vendorId: id, archivedAt: null } })) + (await tx.driver.count({ where: { vendorId: id, archivedAt: null, status: "ACTIVE" } }));
  if (used) throw new TransportProblem(`${v.name} still has vehicles or drivers linked. Change them first.`);
  await tx.transportVendor.update({ where: { id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Transport Vendor", recordId: id, before: { name: v.name } });
}

/* ---------- Drivers and attendants ---------- */

export type DriverInput = {
  name: string;
  phone: string;
  role: string;
  employment: string;
  vendorId: string | null;
  licenceNo: string | null;
  licenceExpiry: Date | null;
  /** Send the driver app invite (a User Login with the Driver role). */
  invite: boolean;
};

function checkDriver(input: DriverInput) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) throw new TransportProblem("Enter the full name.", "name");
  if (!/^[6-9]\d{9}$/.test(input.phone)) throw new TransportProblem("Enter a 10-digit Indian mobile number.", "phone");
  if (!["DRIVER", "ATTENDANT"].includes(input.role)) throw new TransportProblem("Choose driver or attendant.", "role");
  if (!["STAFF", "HIRED"].includes(input.employment)) throw new TransportProblem("Choose staff or hired.", "employment");
  if (input.role === "DRIVER") {
    if (!input.licenceNo || input.licenceNo.trim().length < 6) throw new TransportProblem("A driver needs a licence number.", "licenceNo");
    if (!input.licenceExpiry) throw new TransportProblem("Enter the licence expiry date.", "licenceExpiry");
  }
  return name;
}

/** The Driver role template, switched on when the first driver gets an app login. */
async function driverRole(tx: Tx, ctx: SchoolContext) {
  const role = await schoolRole(tx, ctx, { where: { key: "driver", archivedAt: null } });
  if (!role) throw new TransportProblem("The Driver role was not found. Ask the School Admin to restore it in Settings, Users & Permissions.");
  if (!role.isEnabled) await setTemplateOn(tx, ctx, role.id, true);
  return role;
}

async function inviteDriver(tx: Tx, ctx: SchoolContext, d: Driver, staffId: string | null) {
  const role = await driverRole(tx, ctx);
  const username = await suggestUsername(tx, d.name);
  const r = await inviteUser(tx, ctx, { displayName: d.name, phone: d.phone, email: null, username, roleIds: [role.id], scope: "WHOLE_SCHOOL", campusId: null, staffId });
  await tx.driver.update({ where: { id: d.id }, data: { userLoginId: r.login.id } });
  return r;
}

/**
 * Adds a driver or attendant (12 §2). A driver on the staff is linked to (or
 * added as) a Staff record in Staff & HR; a hired one comes from a vendor.
 * Either way the Driver record gets its own User Login for the driver app.
 */
export async function addDriver(tx: Tx, ctx: SchoolContext, input: DriverInput) {
  const name = checkDriver(input);
  const dup = await tx.driver.findFirst({ where: { phone: input.phone, archivedAt: null } });
  if (dup) throw new TransportProblem(`This number belongs to ${dup.name} (${dup.role === "DRIVER" ? "driver" : "attendant"}). Open the existing record instead.`, "phone", { href: `/transport-management/vehicles?view=people&driver=${dup.id}`, label: `Open ${dup.name}` });
  if (input.employment === "HIRED" && input.vendorId && !(await tx.transportVendor.findFirst({ where: { id: input.vendorId, archivedAt: null } }))) throw new TransportProblem("Choose the vendor from the list.", "vendorId");
  let staffId: string | null = null;
  let staffNote: string | null = null;
  let staffLogin: string | null = null;
  if (input.employment === "STAFF") {
    // Duplicate check with staff: the same phone is the same person.
    const staff = await tx.staff.findFirst({ where: { phone: input.phone, archivedAt: null } });
    if (staff) {
      staffId = staff.id;
      staffLogin = staff.userLoginId;
      staffNote = `Linked to ${staff.fullName}'s Staff & HR record`;
    } else {
      const designation = input.role === "DRIVER" ? ["Driver", "Bus Driver"] : ["Attendant", "Bus Attendant", "Conductor"];
      const found = await tx.designation.findFirst({ where: { archivedAt: null, name: { in: designation, mode: "insensitive" } } });
      if (!found) throw new TransportProblem(`Staff & HR has no "${designation[0]}" designation, so ${name} cannot be added to the staff. Ask HR to add it, or choose Hired.`, "employment");
      const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
      const made = await createStaff(tx, ctx, {
        fullName: name, phone: input.phone, designation: found.name, departmentId: (await tx.department.findFirst({ where: { archivedAt: null, name: { equals: "Transport", mode: "insensitive" } } }))?.id ?? null,
        joiningDate: today, gender: null, email: null, staffCode: null, dateOfBirth: null, bloodGroup: null, aadhaar: null, address: null, permanentAddress: null,
        qualification: null, experienceYears: null, employmentType: "Permanent", reportingToId: null, campusId: null, phoneVerified: false, emailVerified: false, photoFileId: null,
      }, null, []);
      staffId = made.staff.id;
      staffNote = `Added to Staff & HR as ${made.staff.staffCode}`;
    }
  }
  const d = await tx.driver.create({
    data: {
      schoolId: ctx.schoolId, name, phone: input.phone, role: input.role, employment: input.employment, staffId,
      vendorId: input.employment === "HIRED" ? input.vendorId : null, licenceNo: input.role === "DRIVER" ? input.licenceNo!.trim().toUpperCase() : null,
      licenceExpiry: input.role === "DRIVER" ? input.licenceExpiry : null, userLoginId: staffLogin, createdById: ctx.userId,
    },
  });
  await writeAudit(tx, ctx, { action: "created", recordType: "Driver", recordId: d.id, after: { name, role: input.role, employment: input.employment, licence: d.licenceNo ? maskLast4(d.licenceNo) : null, expires: d.licenceExpiry ? formatDate(d.licenceExpiry) : null, staff: staffNote } });
  let invite: Awaited<ReturnType<typeof inviteDriver>> | null = null;
  if (input.invite && !staffLogin) invite = await inviteDriver(tx, ctx, d, staffId);
  return { driver: d, staffNote, invite, usedStaffLogin: Boolean(staffLogin) };
}

export async function editDriver(tx: Tx, ctx: SchoolContext, id: string, input: Omit<DriverInput, "invite">) {
  const before = await tx.driver.findFirst({ where: { id, archivedAt: null } });
  if (!before) throw new TransportProblem("This driver was not found.");
  const name = checkDriver({ ...input, invite: false });
  const dup = await tx.driver.findFirst({ where: { phone: input.phone, archivedAt: null, id: { not: id } } });
  if (dup) throw new TransportProblem(`This number belongs to ${dup.name}.`, "phone");
  const after = await tx.driver.update({ where: { id }, data: { name, phone: input.phone, role: input.role, employment: input.employment, vendorId: input.employment === "HIRED" ? input.vendorId : null, licenceNo: input.role === "DRIVER" ? input.licenceNo!.trim().toUpperCase() : null, licenceExpiry: input.role === "DRIVER" ? input.licenceExpiry : null } });
  await writeAudit(tx, ctx, { action: "updated", recordType: "Driver", recordId: id, before: { name: before.name, phone: before.phone, licenceExpiry: before.licenceExpiry ? formatDate(before.licenceExpiry) : null }, after: { name: after.name, phone: after.phone, licenceExpiry: after.licenceExpiry ? formatDate(after.licenceExpiry) : null } });
  return after;
}

/** Driver app login state: Active, Invited, Disabled or none (12 §2). */
export async function appStates(tx: Tx, drivers: Pick<Driver, "id" | "userLoginId">[]) {
  const ids = drivers.map((d) => d.userLoginId).filter((x): x is string => Boolean(x));
  const [logins, access] = await Promise.all([
    tx.userLogin.findMany({ where: { id: { in: ids } }, select: { id: true, status: true, username: true } }),
    tx.schoolAccess.findMany({ where: { userLoginId: { in: ids }, archivedAt: null }, select: { userLoginId: true } }),
  ]);
  const live = new Set(access.map((a) => a.userLoginId));
  return new Map(drivers.map((d) => {
    const l = logins.find((x) => x.id === d.userLoginId);
    const state = !l ? "None" : !live.has(l.id) || l.status === "DISABLED" ? "Disabled" : l.status === "INVITED" ? "Invited" : "Active";
    return [d.id, { state: state as "Active" | "Invited" | "Disabled" | "None", username: l?.username ?? null }];
  }));
}

export async function sendAppInvite(tx: Tx, ctx: SchoolContext, driverId: string) {
  const d = await tx.driver.findFirst({ where: { id: driverId, archivedAt: null } });
  if (!d) throw new TransportProblem("This driver was not found.");
  if (!d.userLoginId) return { kind: "new" as const, ...(await inviteDriver(tx, ctx, d, d.staffId && !(await tx.staff.findFirst({ where: { id: d.staffId, userLoginId: { not: null } } })) ? d.staffId : null)) };
  const r = await resendInvite(tx, ctx, d.userLoginId);
  return { kind: "again" as const, ...r };
}

/** Turn the driver app login off (signed out at once, phones' keys stop working) or back on. */
export async function setAppLogin(tx: Tx, ctx: SchoolContext, driverId: string, on: boolean, otherSchoolIds: string[]) {
  const d = await tx.driver.findFirst({ where: { id: driverId } });
  if (!d || !d.userLoginId) throw new TransportProblem("This driver has no app login.");
  if (on) await enableUser(tx, ctx, d.userLoginId);
  else {
    await disableUser(tx, ctx, d.userLoginId, otherSchoolIds);
    await tx.driverDevice.updateMany({ where: { driverId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  await writeAudit(tx, ctx, { action: on ? "app-login-on" : "app-login-off", recordType: "Driver", recordId: driverId, after: { name: d.name } });
  return d;
}

/** A driver leaves: their login is turned off and they drop out of lists. Trip history stays. */
export async function archiveDriver(tx: Tx, ctx: SchoolContext, id: string, otherSchoolIds: string[]) {
  const d = await tx.driver.findFirst({ where: { id, archivedAt: null } });
  if (!d) throw new TransportProblem("This driver was not found.");
  const route = await tx.route.findFirst({ where: { archivedAt: null, OR: [{ driverId: id }, { attendantId: id }] } });
  if (route) throw new TransportProblem(`${d.name} is on Route ${route.number}. Give the route someone else first.`);
  if (d.userLoginId && d.employment === "HIRED") {
    const live = await tx.schoolAccess.count({ where: { userLoginId: d.userLoginId, archivedAt: null } });
    if (live) await disableUser(tx, ctx, d.userLoginId, otherSchoolIds);
  }
  await tx.driverDevice.updateMany({ where: { driverId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  await tx.driver.update({ where: { id }, data: { archivedAt: new Date(), status: "INACTIVE" } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Driver", recordId: id, before: { name: d.name } });
}

/* ---------- Driver phones (keys for the Android app) ---------- */

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");
export const newDriverKey = () => `sosdrv_${randomBytes(24).toString("base64url")}`;

/** A key for one phone, shown once; only its hash is kept (like attendance device keys). */
export async function issueDriverKey(tx: Tx, ctx: SchoolContext, driverId: string, name: string) {
  const d = await tx.driver.findFirst({ where: { id: driverId, archivedAt: null, status: "ACTIVE" } });
  if (!d) throw new TransportProblem("This driver was not found.");
  const label = name.trim() || `${d.name}'s phone`;
  const key = newDriverKey();
  const device = await tx.driverDevice.create({ data: { schoolId: ctx.schoolId, driverId, name: label.slice(0, 60), keyHash: hashKey(key), keyLast4: key.slice(-4), createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "key-issued", recordType: "Driver Device", recordId: device.id, after: { driver: d.name, phone: device.name, key: `…${device.keyLast4}` } });
  return { device, key };
}

export async function revokeDriverKey(tx: Tx, ctx: SchoolContext, deviceId: string) {
  const dev = await tx.driverDevice.findFirst({ where: { id: deviceId, revokedAt: null } });
  if (!dev) throw new TransportProblem("This phone was not found, or its key is already turned off.");
  await tx.driverDevice.update({ where: { id: deviceId }, data: { revokedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "key-revoked", recordType: "Driver Device", recordId: deviceId, after: { phone: dev.name } });
}

/* ---------- Fuel and repairs (to Finance as expenses) ---------- */

export type CostInput = { vehicleId: string; kind: "FUEL" | "REPAIR" | "SERVICE"; date: Date; amountPaise: bigint; litres: number | null; odometerKm: number | null; what: string | null; bill: File | null };

/** Records a fuel fill or a repair (12 §2); it goes to Finance, Expenses under Transport fuel or Vehicle repairs. */
export async function recordCost(tx: Tx, ctx: SchoolContext, input: CostInput, today: Date) {
  const v = await tx.vehicle.findFirst({ where: { id: input.vehicleId, archivedAt: null } });
  if (!v) throw new TransportProblem("Choose the vehicle.", "vehicleId");
  if (input.amountPaise <= BigInt(0)) throw new TransportProblem("Enter the amount on the bill.", "amount");
  if (input.date > today) throw new TransportProblem("The date cannot be in the future.", "date");
  if (input.kind !== "FUEL" && (!input.what || input.what.trim().length < 3)) throw new TransportProblem("Say what was repaired or serviced.", "what");
  if (input.odometerKm != null && v.odometerKm != null && input.odometerKm < v.odometerKm - 50_000) throw new TransportProblem(`The odometer reading looks wrong: the last one was ${v.odometerKm.toLocaleString("en-IN")} km.`, "odometerKm");
  const bill = input.bill ? await saveFile(tx, ctx, { file: input.bill, purpose: "transport-bill", allowed: DOCUMENT_TYPES, maxImageWidth: 1600 }) : null;
  await ensureFinanceDefaults(tx, ctx);
  const headName = input.kind === "FUEL" ? "Transport fuel" : "Vehicle repairs";
  const head = await tx.accountHead.findFirst({ where: { kind: "EXPENSE", archivedAt: null, name: headName } }) ?? await tx.accountHead.findFirst({ where: { kind: "EXPENSE", archivedAt: null, groupName: "Transport" } });
  if (!head) throw new TransportProblem(`Finance has no "${headName}" expense head. Ask the Accountant to add it.`);
  const what = input.kind === "FUEL" ? [input.litres ? `${input.litres} L` : null, input.what].filter(Boolean).join(" · ") || "Fuel" : input.what!.trim();
  const note = `${v.label ?? showPlate(v.number)}: ${what}${input.odometerKm != null ? ` · odometer ${input.odometerKm.toLocaleString("en-IN")} km` : ""}`;
  const exp = await recordExpense(tx, ctx, { date: input.date, accountHeadId: head.id, amountPaise: input.amountPaise, vendorId: null, costCentreId: null, billFileId: bill?.id ?? null, note, isVendorBill: false, billNo: null, billDueDate: null, duplicateReason: null }, null);
  const base = { schoolId: ctx.schoolId, vehicleId: v.id, date: input.date, amountPaise: input.amountPaise, odometerKm: input.odometerKm, billFileId: bill?.id ?? null, expenseId: exp.expense.id, createdById: ctx.userId };
  const log = input.kind === "FUEL"
    ? await tx.fuelLog.create({ data: { ...base, litres: input.litres, note: input.what } })
    : await tx.maintenanceLog.create({ data: { ...base, kind: input.kind, what } });
  const vehicleData: Record<string, unknown> = {};
  if (input.odometerKm != null && (v.odometerKm == null || input.odometerKm > v.odometerKm)) vehicleData.odometerKm = input.odometerKm;
  if (input.kind === "SERVICE") { vehicleData.lastServiceOn = input.date; vehicleData.lastServiceKm = input.odometerKm ?? v.odometerKm; }
  if (Object.keys(vehicleData).length) await tx.vehicle.update({ where: { id: v.id }, data: vehicleData });
  await writeAudit(tx, ctx, { action: "cost-recorded", recordType: input.kind === "FUEL" ? "Fuel Log" : "Maintenance Log", recordId: log.id, after: { vehicle: showPlate(v.number), amount: formatRupees(input.amountPaise), date: formatDate(input.date), expense: exp.expense.number, outcome: exp.outcome } });
  return { log, vehicle: v, expense: exp.expense, outcome: exp.outcome };
}

/** Cancels a fuel or repair entry with a reason; the expense in Finance is cancelled too (never deleted). */
export async function cancelCost(tx: Tx, ctx: SchoolContext, kind: "fuel" | "repair", id: string, reason: string, today: Date) {
  if (reason.trim().length < 5) throw new TransportProblem("Give a reason of at least 5 characters.", "reason");
  const row = kind === "fuel" ? await tx.fuelLog.findFirst({ where: { id, cancelledAt: null } }) : await tx.maintenanceLog.findFirst({ where: { id, cancelledAt: null } });
  if (!row) throw new TransportProblem("This entry was not found, or is already cancelled.");
  if (row.expenseId) {
    const e = await tx.expense.findFirst({ where: { id: row.expenseId } });
    if (e && e.status !== "CANCELLED") await cancelExpense(tx, ctx, e.id, `Transport entry cancelled: ${reason.trim()}`, today);
  }
  const data = { cancelledAt: new Date(), cancelReason: reason.trim() };
  if (kind === "fuel") await tx.fuelLog.update({ where: { id }, data });
  else await tx.maintenanceLog.update({ where: { id }, data });
  await writeAudit(tx, ctx, { action: "cancelled", recordType: kind === "fuel" ? "Fuel Log" : "Maintenance Log", recordId: id, after: { reason: reason.trim() } });
}

/** Service due: km or days since the last service against the schedule. */
export function serviceDue(v: Pick<Vehicle, "odometerKm" | "serviceEveryKm" | "serviceEveryDays" | "lastServiceOn" | "lastServiceKm">, today: Date) {
  const kmLeft = v.serviceEveryKm != null && v.odometerKm != null ? (v.lastServiceKm ?? 0) + v.serviceEveryKm - v.odometerKm : null;
  const daysLeft = v.serviceEveryDays != null && v.lastServiceOn ? Math.round((v.lastServiceOn.getTime() + v.serviceEveryDays * 86_400_000 - today.getTime()) / 86_400_000) : null;
  const due = (kmLeft != null && kmLeft <= 0) || (daysLeft != null && daysLeft <= 0);
  const soon = !due && ((kmLeft != null && kmLeft < 1000) || (daysLeft != null && daysLeft <= 7));
  return { kmLeft, daysLeft, due, soon };
}
