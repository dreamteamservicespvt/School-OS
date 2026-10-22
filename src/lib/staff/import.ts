// Bulk staff import from a spreadsheet (09 Staff List, P10), through the one
// shared importer. Logins can be made for imported staff with the
// designation's default role; each gets an invite from their profile.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { defineImport, RowProblem } from "../importer";
import { writeAudit } from "../audit";
import { checkIndianMobile } from "../format";
import { namesAlike } from "../students/name-match";
import { checkAadhaar, createStaff, findDuplicates, StaffProblem, type StaffDetails } from "./staff";
import { campusLimitOf } from "./campus-logins";
import { EMPLOYMENT_TYPES, BLOOD_GROUPS, GENDERS, ensureHrDefaults } from "./settings";
import { day } from "./dates";

export function parseDateText(v: string): Date | null {
  const t = v.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(t);
  if (m) return valid(+m[3], +m[2], +m[1]);
  return null;
}
function valid(y: number, mo: number, d: number) {
  const date = day(`${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  return Number.isNaN(date.getTime()) || date.getUTCDate() !== d || date.getUTCMonth() + 1 !== mo ? null : date;
}

type Row = { details: StaffDetails; login: boolean; roleKey: string | null; linkLoginId: string | null };

/**
 * A person who already signs in to this school with this phone but has no
 * staff record yet, such as the Principal or School Admin made when the
 * school was set up. Their row in the old staff list becomes their staff
 * record, on the same login, when the names match.
 */
async function loginWithoutStaff(tx: Tx, ctx: SchoolContext, phone: string) {
  const logins = await tx.userLogin.findMany({ where: { phone: { in: [phone, `+91${phone}`, `+91 ${phone}`] }, archivedAt: null }, select: { id: true, displayName: true } });
  for (const l of logins) {
    const access = await tx.schoolAccess.findFirst({ where: { schoolId: ctx.schoolId, userLoginId: l.id, archivedAt: null }, select: { id: true } });
    if (!access) continue;
    const staff = await tx.staff.findFirst({ where: { userLoginId: l.id }, select: { id: true } });
    if (!staff) return l;
  }
  return null;
}

const pickOne = (list: readonly string[], v: string) => list.find((x) => x.toLowerCase() === v.trim().toLowerCase()) ?? null;

defineImport<Row>({
  key: "staff",
  label: "Staff",
  columns: [
    { key: "fullName", label: "Full name", required: true, example: "Meena Rao", aliases: ["name", "staff name"] },
    { key: "phone", label: "Phone", required: true, example: "9876543210", aliases: ["mobile", "phone number"] },
    { key: "designation", label: "Designation", required: true, example: "Teacher", aliases: ["post"] },
    { key: "department", label: "Department", example: "Science" },
    { key: "joiningDate", label: "Joining date", required: true, example: "01-06-2026", help: "DD-MM-YYYY", aliases: ["date of joining", "doj"] },
    { key: "gender", label: "Gender", example: "Female" },
    { key: "email", label: "Email", example: "meena.rao@example.com" },
    { key: "dateOfBirth", label: "Date of birth", example: "14-03-1990", aliases: ["dob"] },
    { key: "bloodGroup", label: "Blood group", example: "B+" },
    { key: "employmentType", label: "Employment type", example: "Permanent" },
    { key: "qualification", label: "Qualifications", example: "M.Sc, B.Ed", aliases: ["qualification"] },
    { key: "experienceYears", label: "Experience (years)", example: "6", aliases: ["experience"] },
    { key: "address", label: "Current address", example: "12-3 Ameerpet, Hyderabad", aliases: ["address"] },
    { key: "aadhaar", label: "Aadhaar", example: "" },
    { key: "createLogin", label: "Create login", example: "Yes", help: "Yes makes a login with the designation's default role" },
  ],
  async check(tx, ctx, row, seen) {
    await ensureHrDefaults(tx, ctx);
    const problems: string[] = [];
    const phoneProblem = checkIndianMobile(row.phone);
    const phone = row.phone.replace(/[^\d]/g, "").replace(/^91(?=\d{10}$)/, "");
    const email = row.email.trim().toLowerCase() || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push("Email does not look right.");
    else if (email && seen.has(`e:${email}`)) problems.push("This email is on another row of the file.");
    let linkLoginId: string | null = null;
    if (phoneProblem) problems.push(phoneProblem);
    else if (seen.has(`p:${phone}`)) problems.push("This phone is on another row of the file.");
    // The same checks as Add Staff: a phone or email on a staff record, or a phone that already signs in here.
    const self = phoneProblem ? null : await loginWithoutStaff(tx, ctx, phone);
    if (self && namesAlike(self.displayName, row.fullName)) linkLoginId = self.id;
    const dups = await findDuplicates(tx, ctx, { phone: phoneProblem ? null : phone, email });
    for (const d of dups) {
      if (linkLoginId && d.href === "/settings/users") continue;
      const message = d.href === "/settings/users" ? `${d.message} If it is the same person, write the name as on that login; otherwise fix the phone.` : d.message;
      if (!problems.includes(message)) problems.push(message);
    }
    const designation = await tx.designation.findFirst({ where: { schoolId: ctx.schoolId, archivedAt: null, name: { equals: row.designation.trim(), mode: "insensitive" } } });
    if (!designation) problems.push(`Designation "${row.designation}" is not in HR Settings. Add it there or use one from the list.`);
    let departmentId: string | null = designation?.defaultDepartmentId ?? null;
    if (row.department) {
      const d = await tx.department.findFirst({ where: { schoolId: ctx.schoolId, archivedAt: null, name: { equals: row.department.trim(), mode: "insensitive" } } });
      if (!d) problems.push(`Department "${row.department}" is not in HR Settings.`);
      departmentId = d?.id ?? null;
    }
    const joiningDate = parseDateText(row.joiningDate);
    if (!joiningDate) problems.push("Joining date is not a date like 01-06-2026.");
    const dateOfBirth = row.dateOfBirth ? parseDateText(row.dateOfBirth) : null;
    if (row.dateOfBirth && !dateOfBirth) problems.push("Date of birth is not a date like 14-03-1990.");
    const gender = row.gender ? pickOne(GENDERS, row.gender) : null;
    if (row.gender && !gender) problems.push("Gender must be Female, Male or Other.");
    const bloodGroup = row.bloodGroup ? pickOne(BLOOD_GROUPS, row.bloodGroup.replace(/\s/g, "")) : null;
    if (row.bloodGroup && !bloodGroup) problems.push("Blood group must be like A+, B-, O+ or AB+.");
    const employmentType = row.employmentType ? pickOne(EMPLOYMENT_TYPES, row.employmentType) : "Permanent";
    if (!employmentType) problems.push(`Employment type must be one of: ${EMPLOYMENT_TYPES.join(", ")}.`);
    const experienceYears = row.experienceYears ? Number(row.experienceYears) : null;
    if (row.experienceYears && !(Number.isInteger(experienceYears) && experienceYears! >= 0 && experienceYears! < 60)) problems.push("Experience must be a whole number of years.");
    const aadhaar = row.aadhaar.replace(/\s+/g, "") || null;
    if (aadhaar) { const p = checkAadhaar(aadhaar); if (p) problems.push(p); }
    const login = !linkLoginId && /^(y|yes|true|1)$/i.test(row.createLogin.trim());
    if (login && designation && !designation.defaultRoleKey) problems.push("This designation has no default role, so a login cannot be made. Set one in HR Settings or put No.");
    else if (login && designation?.defaultRoleKey) {
      const role = await tx.role.findFirst({ where: { schoolId: ctx.schoolId, key: designation.defaultRoleKey, isEnabled: true, archivedAt: null }, select: { id: true } });
      if (!role) problems.push(`The role for ${designation.name} is switched off in Users & Permissions, so a login cannot be made. Switch it on or put No.`);
    }
    if (problems.length) return { ok: false, problems };
    seen.add(`p:${phone}`);
    if (email) seen.add(`e:${email}`);
    return {
      ok: true,
      value: {
        login,
        linkLoginId,
        roleKey: designation!.defaultRoleKey,
        details: {
          fullName: row.fullName.trim(), phone, designation: designation!.name, departmentId, joiningDate: joiningDate!, gender, email,
          staffCode: null, dateOfBirth, bloodGroup, aadhaar, address: row.address.trim() || null, permanentAddress: null,
          qualification: row.qualification.trim() || null, experienceYears, employmentType: employmentType!, reportingToId: null, campusId: null,
          phoneVerified: false, emailVerified: false, photoFileId: null,
        },
      },
    };
  },
  async save(tx, ctx, value) {
    try {
      // One campus (src/lib/campus.ts): staff imported by someone limited to one campus join that campus, and their logins open it only.
      const campusLimit = await campusLimitOf(tx, ctx);
      if (value.linkLoginId) {
        // Their own login already signs in here: the staff record joins it (checked in the preview).
        const r = await createStaff(tx, ctx, value.details, null, [], { allowDuplicate: true, campusLimit });
        await tx.staff.update({ where: { id: r.staff.id }, data: { userLoginId: value.linkLoginId } });
        await writeAudit(tx, ctx, { action: "login-linked", recordType: "Staff", recordId: r.staff.id, after: { staff: r.staff.fullName, userLoginId: value.linkLoginId, from: "Import" } });
        return { id: r.staff.id, created: true };
      }
      const r = await createStaff(tx, ctx, value.details, value.login && value.roleKey ? { roleKeys: [value.roleKey], username: null, exceptions: {}, campusId: null } : null, [], { allowDuplicate: false, campusLimit });
      return { id: r.staff.id, created: true };
    } catch (e) {
      if (e instanceof StaffProblem) throw new RowProblem(`${value.details.fullName}: ${e.message}`);
      throw e;
    }
  },
  async undo(tx, ctx, ids) {
    const staff = await tx.staff.findMany({ where: { id: { in: ids }, archivedAt: null } });
    const now = new Date();
    for (const s of staff) {
      const login = s.userLoginId ? await tx.userLogin.findUnique({ where: { id: s.userLoginId }, select: { id: true, createdAt: true } }) : null;
      // A login made before the staff record (the Principal's own) was only joined to it: it keeps signing in.
      const joined = Boolean(login && login.createdAt < s.createdAt);
      await tx.staff.update({ where: { id: s.id }, data: { archivedAt: now, ...(joined ? { userLoginId: null } : {}) } });
      if (login && !joined) {
        await tx.schoolAccess.updateMany({ where: { schoolId: ctx.schoolId, userLoginId: login.id, archivedAt: null }, data: { archivedAt: now } });
        // The login the import made goes too, unless it works in another school, so the phone can sign in again after the corrected import.
        const elsewhere = await tx.schoolAccess.count({ where: { userLoginId: login.id, archivedAt: null } });
        if (elsewhere === 0) await tx.userLogin.update({ where: { id: login.id }, data: { archivedAt: now } });
      }
      await writeAudit(tx, ctx, { action: "archived", recordType: "Staff", recordId: s.id, after: { reason: "Import undone", login: login ? (joined ? "kept, unlinked" : "archived") : null } });
    }
  },
});
