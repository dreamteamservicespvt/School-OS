// Staff records: Add Staff (details, login and roles, classes and subjects),
// edits by section with before and after in the audit log, status changes,
// and duplicate checks (09 §2, §5).
import "server-only";

import type { Prisma, Staff, StaffStatus } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { nextNumber } from "../sequences";
import { encryptField, maskLast4, decryptField } from "../crypto";
import { randomUUID } from "node:crypto";
import { hashToken, newToken } from "../auth/tokens";
import { INVITE_VALID_MS } from "../auth/invites";
import { checkNewPassword, hashPassword } from "../auth/password";
import { inviteTokenFor } from "../parent-link/token";
import { sendInviteMessage, type InviteSent } from "../settings/invite-message";
import { assertYearOpen } from "../academic/years";
import { formatStaffId, hrSettings } from "./settings";
import { ensureBalances, leaveYearFor } from "./leave";
import type { AccessLevel } from "../roles";

export class StaffProblem extends Error {
  constructor(message: string, public field?: string, public link?: { href: string; label: string }) {
    super(message);
    this.name = "StaffProblem";
  }
}

// ---------------------------------------------------------------- checks

export function checkAadhaar(v: string): string | null {
  const d = v.replace(/\s+/g, "");
  if (!/^\d{12}$/.test(d)) return `Aadhaar has ${d.replace(/\D/g, "").length} digits. It must have 12 digits.`;
  if (/^[01]/.test(d)) return "Aadhaar numbers do not start with 0 or 1. Check the number.";
  return null;
}
export function checkPan(v: string): string | null {
  return /^[A-Z]{5}\d{4}[A-Z]$/.test(v.trim().toUpperCase()) ? null : "PAN should look like ABCDE1234F: 5 letters, 4 numbers, 1 letter.";
}
export function checkIfsc(v: string): string | null {
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v.trim().toUpperCase()) ? null : "IFSC should look like HDFC0001234: 4 letters, a zero, then 6 letters or numbers.";
}
export function checkBankAccount(v: string): string | null {
  const d = v.replace(/\s+/g, "");
  return /^\d{9,18}$/.test(d) ? null : "Bank account number should have 9 to 18 digits.";
}

export type Duplicate = { message: string; href: string };

/** Same person added twice (09 §5): phone or email already on a staff record or a login. */
export async function findDuplicates(tx: Tx, ctx: SchoolContext, input: { phone?: string | null; email?: string | null; excludeStaffId?: string | null }): Promise<Duplicate[]> {
  const out: Duplicate[] = [];
  const or: Prisma.StaffWhereInput[] = [];
  if (input.phone) or.push({ phone: input.phone });
  if (input.email) or.push({ email: { equals: input.email, mode: "insensitive" } });
  if (or.length === 0) return out;
  const staff = await tx.staff.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null, OR: or, ...(input.excludeStaffId ? { id: { not: input.excludeStaffId } } : {}) }, take: 3 });
  for (const s of staff) {
    const what = input.phone && s.phone === input.phone ? "phone" : "email";
    out.push({ message: `This ${what} belongs to ${s.fullName} (${s.designation}).`, href: `/staff-hr-management/${s.id}` });
  }
  if (input.phone && out.length === 0) {
    const login = await tx.userLogin.findFirst({ where: { phone: { in: [input.phone, `+91${input.phone}`] }, archivedAt: null }, select: { displayName: true, id: true } });
    if (login) {
      const inSchool = await tx.schoolAccess.findFirst({ where: { schoolId: ctx.schoolId, userLoginId: login.id } });
      if (inSchool) out.push({ message: `This phone belongs to the login of ${login.displayName}.`, href: "/settings/users" });
    }
  }
  return out;
}

/** Staff IDs are unique in the school (typed ones are checked). */
export async function checkStaffCode(tx: Tx, ctx: SchoolContext, code: string, excludeStaffId?: string) {
  const clean = code.trim();
  if (!/^[A-Za-z0-9/_-]{1,30}$/.test(clean)) throw new StaffProblem("Staff ID can have letters, numbers, - and / only, up to 30 characters.", "staffCode");
  const used = await tx.staff.findFirst({ where: { schoolId: ctx.schoolId, staffCode: { equals: clean, mode: "insensitive" }, ...(excludeStaffId ? { id: { not: excludeStaffId } } : {}) } });
  if (used) throw new StaffProblem(`Staff ID ${clean} is used by ${used.fullName}. Leave it empty to use the next free ID.`, "staffCode", { href: `/staff-hr-management/${used.id}`, label: "Open existing" });
  return clean;
}

// ---------------------------------------------------------------- usernames and invites

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "");

export function usernameFor(format: string, s: { firstName: string; lastName: string | null; phone: string; staffCode: string }) {
  if (format === "phone") return s.phone;
  if (format === "staffid") return s.staffCode.toLowerCase().replace(/[^a-z0-9.-]/g, "");
  const first = slug(s.firstName) || "staff";
  const last = slug(s.lastName ?? "");
  return format === "firstlast" ? `${first}${last}` : last ? `${first}.${last}` : first;
}

export function checkUsername(u: string): string | null {
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(u)) return "Username must be 3 to 40 small letters, numbers, dots, - or _, starting with a letter or number.";
  return null;
}

/** A free username: the wanted one, or with 2, 3... added. */
export async function freeUsername(tx: Tx, wanted: string) {
  for (let i = 1; i < 200; i++) {
    const u = i === 1 ? wanted : `${wanted}${i}`;
    if (!(await tx.userLogin.findUnique({ where: { username: u }, select: { id: true } }))) return u;
  }
  throw new StaffProblem("Could not find a free username. Type one in.", "username");
}

/** A fresh invite secret for a login: the link's secret is worked out from the login's id and a nonce (src/lib/parent-link/token.ts). */
function inviteSecret(userLoginId: string) {
  const nonce = newToken().slice(0, 32);
  return { nonce, token: inviteTokenFor(userLoginId, nonce) };
}

/**
 * A new invite link (also used as "Reset password"): the person sets their own
 * password. The link is sent to them by WhatsApp or SMS and email as a School
 * OS system message (src/lib/settings/invite-message.ts); Message History keeps
 * only a placeholder. The old link stops working.
 */
export async function issueInvite(tx: Tx, ctx: SchoolContext, userLoginId: string, now = new Date()): Promise<{ link: string; sent: InviteSent }> {
  const { nonce, token } = inviteSecret(userLoginId);
  const login = await tx.userLogin.update({ where: { id: userLoginId }, data: { inviteTokenHash: hashToken(token), inviteExpiresAt: new Date(now.getTime() + INVITE_VALID_MS) } });
  const sent = await sendInviteMessage(tx, ctx, login, nonce);
  return { link: `/invite/${token}`, sent };
}

// ---------------------------------------------------------------- Add Staff

export type StaffDetails = {
  fullName: string;
  phone: string;
  designation: string;
  departmentId: string | null;
  joiningDate: Date;
  gender: string | null;
  email: string | null;
  staffCode: string | null;
  dateOfBirth: Date | null;
  bloodGroup: string | null;
  aadhaar: string | null;
  address: string | null;
  permanentAddress: string | null;
  qualification: string | null;
  experienceYears: number | null;
  employmentType: string;
  reportingToId: string | null;
  campusId: string | null;
  phoneVerified: boolean;
  emailVerified: boolean;
  photoFileId: string | null;
};

export type LoginChoice = {
  roleKeys: string[];
  username: string | null;
  exceptions: Record<string, AccessLevel>;
  campusId: string | null;
  /**
   * Instead of an invite: a temporary password HR types and hands over in
   * person (09 Add Staff step 2). Only its hash is kept; it is never shown
   * again or sent by message, and the person must choose their own password
   * at the first sign-in (08 §2).
   */
  temporaryPassword?: string | null;
} | null;

export type AllocationPick = { sectionId: string; subjectId: string };

export function splitName(fullName: string) {
  const parts = fullName.trim().replace(/\s+/g, " ").split(" ");
  return { firstName: parts[0], lastName: parts.length > 1 ? parts.slice(1).join(" ") : null, fullName: parts.join(" ") };
}

/**
 * Adds a staff member. `campusLimit`: the campus the person adding is limited
 * to ("One campus"): the new staff member joins that campus, another campus is
 * refused, the reporting manager is one of that campus's staff (or the person
 * adding), and a login made here opens that campus only.
 */
export async function createStaff(tx: Tx, ctx: SchoolContext, details: StaffDetails, login: LoginChoice, allocations: AllocationPick[], opts: { allowDuplicate?: boolean; campusLimit?: string | null } = {}) {
  const settings = await hrSettings(tx, ctx);
  const dups = await findDuplicates(tx, ctx, { phone: details.phone, email: details.email });
  if (dups.length && !opts.allowDuplicate) throw new StaffProblem(dups[0].message, "phone", { href: dups[0].href, label: "Open existing" });
  const designation = await tx.designation.findFirst({ where: { schoolId: ctx.schoolId, name: details.designation, archivedAt: null } });
  if (!designation) throw new StaffProblem("Choose a designation from the list (HR Settings).", "designation");
  const limit = opts.campusLimit ?? null;
  if (limit && details.campusId && details.campusId !== limit) throw new StaffProblem("Choose a campus from the list.", "campusId");
  const campusId = details.campusId ?? limit;
  const campus = campusId
    ? await tx.campus.findFirst({ where: { id: campusId, archivedAt: null } })
    : await tx.campus.findFirst({ where: { schoolId: ctx.schoolId, archivedAt: null }, orderBy: [{ isMain: "desc" }, { createdAt: "asc" }] });
  if (!campus) throw new StaffProblem("Choose a campus.", "campusId");
  if (details.departmentId && !(await tx.department.findFirst({ where: { id: details.departmentId, archivedAt: null } }))) throw new StaffProblem("Choose a department from the list.", "departmentId");
  const managerScope: Prisma.StaffWhereInput = limit ? { OR: [{ campusId: limit }, { userLoginId: ctx.userId ?? "00000000-0000-0000-0000-000000000000" }] } : {};
  if (details.reportingToId && !(await tx.staff.findFirst({ where: { id: details.reportingToId, archivedAt: null, ...managerScope } }))) throw new StaffProblem("Choose the reporting manager from the list.", "reportingToId");
  // A login made by someone limited to one campus opens that campus only, never the whole school or another campus.
  if (limit && login?.campusId && login.campusId !== limit) throw new StaffProblem("Choose a campus from the list.", "accessCampusId");
  const loginChoice: LoginChoice = limit && login ? { ...login, campusId: limit } : login;
  if (details.aadhaar) { const p = checkAadhaar(details.aadhaar); if (p) throw new StaffProblem(p, "aadhaar"); }

  let staffCode: string;
  if (details.staffCode) staffCode = await checkStaffCode(tx, ctx, details.staffCode);
  else {
    // The running number never gives out an ID already typed in by hand.
    do staffCode = formatStaffId(settings.staffIdPrefix, settings.staffIdDigits, await nextNumber(tx, ctx, "staff"));
    while (await tx.staff.findFirst({ where: { schoolId: ctx.schoolId, staffCode }, select: { id: true } }));
  }
  return createWithCode(tx, ctx, staffCode, details, designation.staffType, campus.id, loginChoice, allocations, settings.usernameFormat);
}

async function createWithCode(tx: Tx, ctx: SchoolContext, staffCode: string, d: StaffDetails, staffType: string, campusId: string, login: LoginChoice, allocations: AllocationPick[], usernameFormat: string) {
  const name = splitName(d.fullName);
  const staff = await tx.staff.create({
    data: {
      schoolId: ctx.schoolId, campusId, staffCode, ...name,
      phone: d.phone, email: d.email, gender: d.gender, dateOfBirth: d.dateOfBirth,
      designation: d.designation, departmentId: d.departmentId, staffType, employmentType: d.employmentType,
      joiningDate: d.joiningDate, reportingToId: d.reportingToId, qualification: d.qualification, experienceYears: d.experienceYears,
      address: d.address, permanentAddress: d.permanentAddress, bloodGroup: d.bloodGroup,
      aadhaarEnc: d.aadhaar ? encryptField(d.aadhaar.replace(/\s+/g, "")) : null,
      phoneVerified: d.phoneVerified, emailVerified: d.emailVerified, photoFileId: d.photoFileId,
      createdById: ctx.userId, updatedById: ctx.userId, statusSince: d.joiningDate,
    },
  });
  await writeAudit(tx, ctx, {
    action: "created", recordType: "Staff", recordId: staff.id,
    after: { staffCode, fullName: staff.fullName, designation: staff.designation, phone: staff.phone, joiningDate: d.joiningDate.toISOString().slice(0, 10), aadhaar: d.aadhaar ? maskLast4(d.aadhaar) : null },
  });

  let username: string | null = null;
  let inviteLink: string | null = null;
  let sent: InviteSent | null = null;
  let temporary = false;
  let roleNames: string[] = [];
  if (login) {
    const r = await giveLogin(tx, ctx, staff, login, usernameFormat);
    username = r.username; inviteLink = r.inviteLink; sent = r.sent; temporary = r.temporary; roleNames = r.roleNames;
  }

  const year = await leaveYearFor(tx, ctx, d.joiningDate > new Date() ? d.joiningDate : new Date(), campusId);
  let allocated = 0;
  if (allocations.length) {
    if (!year) throw new StaffProblem("There is no current academic year to add classes to. Skip this step or open the year in Academic Management.");
    allocated = await saveAllocations(tx, ctx, staff.id, year.id, allocations, d.joiningDate);
  }
  if (year) await ensureBalances(tx, ctx, [staff.id], year.id);
  return { staff, username, inviteLink, sent, temporary, roleNames, allocated };
}

/**
 * Creates the staff login with School Access, roles and personal exceptions
 * (09 Add Staff step 2): either Invited, with an invite link sent to them by
 * message and shown once on screen, or Active with a temporary password they
 * must change at the first sign-in.
 */
export async function giveLogin(tx: Tx, ctx: SchoolContext, staff: Staff, login: NonNullable<LoginChoice>, usernameFormat: string) {
  if (staff.userLoginId) throw new StaffProblem(`${staff.fullName} already has a login.`);
  if (login.roleKeys.length === 0) throw new StaffProblem("Choose at least one role, or skip the login.", "roleKeys");
  const roles = await tx.role.findMany({ where: { schoolId: ctx.schoolId, key: { in: login.roleKeys }, isEnabled: true, archivedAt: null } });
  if (roles.length !== new Set(login.roleKeys).size) throw new StaffProblem("One of the chosen roles is switched off. Choose from the list.", "roleKeys");
  let username: string;
  if (login.username) {
    const u = login.username.trim().toLowerCase();
    const p = checkUsername(u);
    if (p) throw new StaffProblem(p, "username");
    if (await tx.userLogin.findUnique({ where: { username: u } })) throw new StaffProblem(`Username ${u} is taken. Try ${await freeUsername(tx, u)}.`, "username");
    username = u;
  } else {
    username = await freeUsername(tx, usernameFor(usernameFormat, staff));
  }
  const temporary = Boolean(login.temporaryPassword);
  if (temporary) {
    const bad = checkNewPassword(login.temporaryPassword!);
    if (bad) throw new StaffProblem(`Temporary password: ${bad}`, "temporaryPassword");
  }
  const id = randomUUID();
  const invite = temporary ? null : inviteSecret(id);
  const user = await tx.userLogin.create({
    data: {
      id, username, displayName: staff.fullName, phone: staff.phone, email: staff.email,
      ...(invite
        ? { status: "INVITED" as const, inviteTokenHash: hashToken(invite.token), inviteExpiresAt: new Date(Date.now() + INVITE_VALID_MS) }
        : { status: "ACTIVE" as const, passwordHash: await hashPassword(login.temporaryPassword!), mustChangePassword: true }),
    },
  });
  await tx.schoolAccess.create({
    data: {
      schoolId: ctx.schoolId, userLoginId: user.id, campusId: login.campusId, scope: login.campusId ? "CAMPUS" : "WHOLE_SCHOOL",
      exceptions: login.exceptions, roles: { create: roles.map((r) => ({ roleId: r.id, schoolId: ctx.schoolId })) },
    },
  });
  await tx.staff.update({ where: { id: staff.id }, data: { userLoginId: user.id } });
  // The password itself is never written anywhere but as its hash on the login.
  await writeAudit(tx, ctx, {
    action: "login-created", recordType: "User Login", recordId: user.id,
    after: { staff: staff.fullName, username, roles: roles.map((r) => r.name), exceptions: login.exceptions, signIn: temporary ? "temporary password, to change at first sign-in" : "invite link" },
  });
  const sent = invite ? await sendInviteMessage(tx, ctx, user, invite.nonce) : null;
  return { userLoginId: user.id, username, inviteLink: invite ? `/invite/${invite.token}` : null, sent, temporary, roleNames: roles.map((r) => r.name) };
}

/** Teacher Allocation from Add Staff step 3: stays from year to year until changed. Skips pairs already given. */
export async function saveAllocations(tx: Tx, ctx: SchoolContext, staffId: string, academicYearId: string, picks: AllocationPick[], fromDate: Date | null) {
  await assertYearOpen(tx, academicYearId);
  let made = 0;
  const seen = new Set<string>();
  for (const p of picks) {
    const key = `${p.sectionId}:${p.subjectId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const section = await tx.section.findFirst({ where: { id: p.sectionId, academicYearId, archivedAt: null } });
    if (!section) throw new StaffProblem("One of the chosen sections is not in this academic year. Choose again.", "allocations");
    const taught = await tx.subjectClass.findFirst({ where: { subjectId: p.subjectId, classId: section.classId, archivedAt: null } });
    if (!taught) throw new StaffProblem("One of the chosen subjects is not set for that class. Set it in Academic Management, Subjects.", "allocations");
    const mine = await tx.teacherAllocation.findFirst({ where: { staffId, sectionId: p.sectionId, subjectId: p.subjectId, academicYearId, archivedAt: null } });
    if (mine) continue;
    const main = await tx.teacherAllocation.findFirst({ where: { sectionId: p.sectionId, subjectId: p.subjectId, academicYearId, isMain: true, archivedAt: null } });
    const row = await tx.teacherAllocation.create({
      data: { schoolId: ctx.schoolId, academicYearId, staffId, sectionId: p.sectionId, subjectId: p.subjectId, isMain: !main, fromDate, createdById: ctx.userId },
    });
    await writeAudit(tx, ctx, { action: "created", recordType: "Teacher Allocation", recordId: row.id, after: { staffId, sectionId: p.sectionId, subjectId: p.subjectId, isMain: !main } });
    made++;
  }
  return made;
}

// ---------------------------------------------------------------- edits

const SECTION_FIELDS = {
  personal: ["fullName", "dateOfBirth", "gender", "bloodGroup", "address", "permanentAddress", "qualification", "experienceYears"],
  contact: ["phone", "email", "phoneVerified", "emailVerified"],
  employment: ["staffCode", "departmentId", "designation", "joiningDate", "employmentType", "reportingToId", "campusId"],
} as const;
export type EditSection = keyof typeof SECTION_FIELDS;

const iso = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v);

/** Saves one section of a staff record, with before and after values in the audit log. */
export async function updateStaffSection(tx: Tx, ctx: SchoolContext, staffId: string, section: EditSection, data: Record<string, unknown>) {
  const before = await tx.staff.findFirst({ where: { id: staffId, archivedAt: null } });
  if (!before) throw new StaffProblem("This staff member was not found.");
  const allowed = SECTION_FIELDS[section] as readonly string[];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if (k in data) patch[k] = data[k];
  if (section === "personal" && typeof patch.fullName === "string") Object.assign(patch, splitName(patch.fullName));
  if (section === "contact") {
    const dups = await findDuplicates(tx, ctx, { phone: patch.phone as string, email: patch.email as string | null, excludeStaffId: staffId });
    if (dups.length && !data.allowDuplicate) throw new StaffProblem(dups[0].message, "phone", { href: dups[0].href, label: "Open existing" });
    if (patch.phone !== before.phone) patch.phoneVerified = Boolean(data.phoneVerified);
  }
  if (section === "employment") {
    if (typeof patch.staffCode === "string" && patch.staffCode !== before.staffCode) patch.staffCode = await checkStaffCode(tx, ctx, patch.staffCode, staffId);
    const designation = await tx.designation.findFirst({ where: { schoolId: ctx.schoolId, name: String(patch.designation), archivedAt: null } });
    if (!designation && patch.designation !== before.designation) throw new StaffProblem("Choose a designation from the list (HR Settings).", "designation");
    if (designation) patch.staffType = designation.staffType;
    if (patch.reportingToId === staffId) throw new StaffProblem("A staff member cannot report to themselves.", "reportingToId");
    if (!patch.campusId) delete patch.campusId;
  }
  const after = await tx.staff.update({ where: { id: staffId }, data: { ...patch, updatedById: ctx.userId } as Prisma.StaffUpdateInput });
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};
  for (const k of Object.keys(patch)) {
    const b = iso((before as Record<string, unknown>)[k]);
    const a = iso((after as Record<string, unknown>)[k]);
    if (b !== a) { changedBefore[k] = b ?? null; changedAfter[k] = a ?? null; }
  }
  if (Object.keys(changedAfter).length) {
    await writeAudit(tx, ctx, { action: "changed", recordType: "Staff", recordId: staffId, before: changedBefore as Prisma.InputJsonValue, after: changedAfter as Prisma.InputJsonValue });
  }
  return { changed: Object.keys(changedAfter).length, staff: after };
}

export type RestrictedInput = { aadhaar: string | null; pan: string | null; bankAccount: string | null; bankIfsc: string | null; bankName: string | null; uan: string | null; esiNo: string | null };

/** Restricted fields: encrypted, and only masked values go to the audit log. Empty keeps the old value. */
export async function updateRestricted(tx: Tx, ctx: SchoolContext, staffId: string, input: RestrictedInput) {
  const before = await tx.staff.findFirstOrThrow({ where: { id: staffId, archivedAt: null } });
  const patch: Prisma.StaffUpdateInput = { updatedById: ctx.userId };
  const changed: string[] = [];
  if (input.aadhaar) { const p = checkAadhaar(input.aadhaar); if (p) throw new StaffProblem(p, "aadhaar"); patch.aadhaarEnc = encryptField(input.aadhaar.replace(/\s+/g, "")); changed.push(`Aadhaar ${maskLast4(input.aadhaar)}`); }
  if (input.pan) { const p = checkPan(input.pan); if (p) throw new StaffProblem(p, "pan"); patch.panEnc = encryptField(input.pan.trim().toUpperCase()); changed.push(`PAN ${maskLast4(input.pan)}`); }
  if (input.bankAccount) { const p = checkBankAccount(input.bankAccount); if (p) throw new StaffProblem(p, "bankAccount"); patch.bankAccountEnc = encryptField(input.bankAccount.replace(/\s+/g, "")); changed.push(`Bank account ${maskLast4(input.bankAccount)}`); }
  if (input.bankIfsc !== null && input.bankIfsc !== before.bankIfsc) { const p = checkIfsc(input.bankIfsc); if (p) throw new StaffProblem(p, "bankIfsc"); patch.bankIfsc = input.bankIfsc.trim().toUpperCase(); changed.push("IFSC"); }
  if (input.bankName !== null && input.bankName !== before.bankName) { patch.bankName = input.bankName; changed.push("Bank name"); }
  if (input.uan !== null && input.uan !== before.uan) { patch.uan = input.uan; changed.push("UAN"); }
  if (input.esiNo !== null && input.esiNo !== before.esiNo) { patch.esiNo = input.esiNo; changed.push("ESI number"); }
  if (changed.length === 0) return 0;
  await tx.staff.update({ where: { id: staffId }, data: patch });
  await writeAudit(tx, ctx, { action: "changed-restricted", recordType: "Staff", recordId: staffId, after: { changed } });
  return changed.length;
}

/** The value a viewer sees for a restricted field: full for those allowed, else the last 4 characters. */
export function showRestricted(enc: string | null, full: boolean): string | null {
  if (!enc) return null;
  try {
    const v = decryptField(enc);
    return full ? v : maskLast4(v);
  } catch {
    return "Cannot be read";
  }
}

/** Staff status: active, on leave, suspended. Leaving statuses go through Staff Exit. */
export async function changeStatus(tx: Tx, ctx: SchoolContext, staffId: string, status: StaffStatus, since: Date, reason: string) {
  if (["RESIGNED", "RETIRED", "TERMINATED"].includes(status)) {
    throw new StaffProblem("Resigned, retired and terminated go through Staff Exit, so the handover and clearance are not missed.", "status", { href: `/staff-hr-management/exit/new?staff=${staffId}`, label: "Start Staff Exit" });
  }
  if (reason.trim().length < 5) throw new StaffProblem("Give a reason of at least 5 characters.", "reason");
  const before = await tx.staff.findFirstOrThrow({ where: { id: staffId, archivedAt: null } });
  if (["RESIGNED", "RETIRED", "TERMINATED"].includes(before.status)) throw new StaffProblem(`${before.fullName} has left the school. Re-joining is done by adding them again.`, "status");
  if (before.status === status) throw new StaffProblem(`${before.fullName} is already ${status.toLowerCase().replace("_", " ")}.`, "status");
  await tx.staff.update({ where: { id: staffId }, data: { status, statusSince: since, statusReason: reason.trim(), updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "status-changed", recordType: "Staff", recordId: staffId, before: { status: before.status }, after: { status, since: since.toISOString().slice(0, 10), reason } });
}

/** Emergency contacts in priority order; the whole list is saved at once. */
export async function saveEmergencyContacts(tx: Tx, ctx: SchoolContext, staffId: string, contacts: { name: string; relation: string; phone: string }[]) {
  const before = await tx.emergencyContact.findMany({ where: { staffId, archivedAt: null }, orderBy: { priority: "asc" } });
  await tx.emergencyContact.updateMany({ where: { staffId, archivedAt: null }, data: { archivedAt: new Date() } });
  for (const [i, c] of contacts.entries()) {
    await tx.emergencyContact.create({ data: { schoolId: ctx.schoolId, staffId, name: c.name, relation: c.relation, phone: c.phone, priority: i + 1 } });
  }
  const first = contacts[0];
  await tx.staff.update({ where: { id: staffId }, data: { emergencyName: first?.name ?? null, emergencyPhone: first?.phone ?? null, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, {
    action: "changed", recordType: "Emergency Contact", recordId: staffId,
    before: before.map((c) => ({ name: c.name, relation: c.relation, phone: c.phone })), after: contacts,
  });
}
