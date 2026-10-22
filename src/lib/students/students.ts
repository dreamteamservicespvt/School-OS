// Student records: add, check for duplicates, edit each section, change
// status and section. One lifelong record per child; each year's class is its
// own Enrolment and nothing is overwritten or deleted (04-data-model.md rules 1, 4, 21).
import "server-only";

import type { Prisma, StudentStatus } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { nextNumber } from "../sequences";
import { assertYearOpen, currentEnrolment, currentEnrolments, currentYear, studentYear } from "../academic/years";
import { mainCampus } from "../campus";
import { encryptField, maskLast4 } from "../crypto";
import { requestApproval } from "../approvals";
import { getStudentSettings } from "./settings";
import { PROFILE_CHANGES, STATUS_LABEL, type StudentStatusKey } from "./labels";
import { runEnrolled, runSectionChanged } from "./hooks";
import { namesAlike } from "./name-match";
// Fee Management gives the class fee plan to a student who joins a class (A2, A13).
import "../fees/enrolled";
// Examination & Results moves a student's marks and results with a section change (G23).
import "../exams/student-hooks";

export class StudentProblem extends Error {
  /** The form field the problem is about, so it shows next to that field. */
  field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.name = "StudentProblem";
    this.field = field;
  }
}

/** Splits "Arjun Rao" into first and last name; the full name is kept as typed. */
export function splitName(full: string) {
  const clean = full.trim().replace(/\s+/g, " ");
  const [first, ...rest] = clean.split(" ");
  return { firstName: first ?? clean, lastName: rest.length ? rest.join(" ") : null, fullName: clean };
}

export const sectionTitle = (e: { schoolClass?: { name: string } | null; section?: { name: string } | null } | null | undefined) =>
  e?.schoolClass && e.section ? `${e.schoolClass.name} ${e.section.name}` : "No class this year";

/** The format and next value of the admission number, without using it up. */
export async function admissionFormat(tx: Tx, ctx: SchoolContext, yearStart?: Date) {
  const s = await getStudentSettings(tx, ctx);
  const school = await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { code: true } });
  const year = (yearStart ?? new Date()).getUTCFullYear();
  const prefix = (s.admissionPrefix || `${school?.code ?? ""}/`) + (s.admissionUseYear ? `${year}/` : "");
  const key = s.admissionRestartYear ? `admission:${year}` : "admission";
  return { prefix, key, padding: s.admissionPadding };
}

/**
 * The admission number year is the current year of the campus the student
 * joins (each campus has its own school year); with no campus given, the main
 * campus's.
 */
async function admissionYear(tx: Tx, ctx: SchoolContext, campusId?: string | null) {
  return currentYear(tx, ctx, campusId ?? (await mainCampus(tx, ctx)));
}

export async function previewAdmissionNo(tx: Tx, ctx: SchoolContext, campusId?: string | null) {
  const year = await admissionYear(tx, ctx, campusId);
  const f = await admissionFormat(tx, ctx, year?.startDate);
  const seq = await tx.numberSequence.findUnique({ where: { schoolId_key: { schoolId: ctx.schoolId, key: f.key } } });
  for (let n = seq?.nextValue ?? 1, i = 0; i < 50; n++, i++) {
    const candidate = f.prefix + String(n).padStart(f.padding, "0");
    if (!(await tx.student.findFirst({ where: { admissionNo: candidate }, select: { id: true } }))) return candidate;
  }
  return f.prefix + "…";
}

/**
 * Takes the next free admission number; numbers typed in by hand are skipped, never reused.
 * (The running number also passes over numbers freed by an import undo, so it never gives one out twice.)
 */
export async function takeAdmissionNo(tx: Tx, ctx: SchoolContext, campusId?: string | null) {
  const year = await admissionYear(tx, ctx, campusId);
  const f = await admissionFormat(tx, ctx, year?.startDate);
  for (let i = 0; i < 200; i++) {
    const n = await nextNumber(tx, ctx, f.key);
    const candidate = f.prefix + String(n).padStart(f.padding, "0");
    if (!(await tx.student.findFirst({ where: { admissionNo: candidate }, select: { id: true } }))) return candidate;
  }
  throw new StudentProblem("Could not find a free admission number. Check the format in Student Settings.", "admissionNo");
}

/**
 * The student holding an admission number, if any. A number freed when its
 * import was undone (releasedAt) is held by nobody, so the corrected file can
 * use it again; any other student keeps their number, even once archived.
 */
export async function admissionHolder(tx: Tx, admissionNo: string, exceptStudentId?: string) {
  return tx.student.findFirst({
    where: { admissionNo: { equals: admissionNo.trim(), mode: "insensitive" }, releasedAt: null, ...(exceptStudentId ? { id: { not: exceptStudentId } } : {}) },
  }).then(async (s) => (s ? { ...s, enrolments: [await currentEnrolment(tx, s.id)].filter((e): e is NonNullable<typeof e> => Boolean(e)) } : null));
}

/** Rule: admission number unique in the school. Says whose it is, in plain words. */
export async function admissionNoTaken(tx: Tx, admissionNo: string, exceptStudentId?: string) {
  const other = await admissionHolder(tx, admissionNo, exceptStudentId);
  if (!other) return null;
  const e = other.enrolments[0];
  const sec = e ? await tx.section.findUnique({ where: { id: e.sectionId }, include: { schoolClass: true } }) : null;
  const where = sec ? `, ${sec.schoolClass.name.replace(/^Class /, "")} ${sec.name}` : "";
  return `Admission number ${other.admissionNo} already belongs to ${other.fullName}${where}${other.archivedAt ? " (archived)" : ""}.`;
}

export type DuplicateMatch = {
  id: string; fullName: string; admissionNo: string; why: string;
  /** The class and section this year, for showing which child it is ("5 A"). */
  classSection: string | null;
  /** The child's main parent, to offer "same family". */
  primaryGuardianId: string | null;
};

/**
 * Duplicate check (03 §2): a student already on record with the same or a
 * similar name (another spelling, one letter apart, initials; see
 * name-match.ts) and the same date of birth or the same parent's phone.
 * Twins have different names, so they are never taken for one child.
 */
export async function findDuplicates(tx: Tx, q: { fullName: string; dateOfBirth?: Date | null; guardianPhone?: string | null; phones?: (string | null | undefined)[]; exceptId?: string }): Promise<DuplicateMatch[]> {
  const name = q.fullName.trim().replace(/\s+/g, " ");
  if (!name) return [];
  const phones = [...new Set([q.guardianPhone, ...(q.phones ?? [])].filter((p): p is string => Boolean(p)))];
  const or: Prisma.StudentWhereInput[] = [];
  if (q.dateOfBirth) or.push({ dateOfBirth: q.dateOfBirth });
  if (phones.length) or.push({ guardians: { some: { archivedAt: null, guardian: { archivedAt: null, phone: { in: phones } } } } });
  if (!or.length) return [];
  const found = await tx.student.findMany({
    where: { archivedAt: null, OR: or, ...(q.exceptId ? { id: { not: q.exceptId } } : {}) },
    include: {
      guardians: { where: { archivedAt: null }, include: { guardian: true }, orderBy: [{ isPrimary: "desc" }, { emergencyOrder: "asc" }] },
    },
    orderBy: { createdAt: "asc" },
    take: 300,
  });
  // Each match's class this year, in their own campus's current year.
  const current = await currentEnrolments(tx, found.map((s) => s.id));
  const day = q.dateOfBirth?.toISOString().slice(0, 10);
  const hits = found.flatMap((s) => {
    const like = namesAlike(name, s.fullName);
    if (!like) return [];
    const sameDob = Boolean(day && s.dateOfBirth && s.dateOfBirth.toISOString().slice(0, 10) === day);
    const samePhone = s.guardians.some((g) => phones.includes(g.guardian.phone));
    if (!sameDob && !samePhone) return [];
    const nameWords = like === "same" ? "same name" : "similar name";
    const why = sameDob ? `${nameWords} and date of birth` : `${nameWords} and parent's phone`;
    return [{ s, why: like === "same" ? why : why.replace(" and ", " and same ") }];
  });
  const sections = hits.length ? await tx.section.findMany({ where: { id: { in: hits.map((h) => current.get(h.s.id)?.sectionId).filter((x): x is string => Boolean(x)) } }, include: { schoolClass: true } }) : [];
  return hits.map(({ s, why }) => {
    const sec = sections.find((x) => x.id === current.get(s.id)?.sectionId);
    return {
      id: s.id, fullName: s.fullName, admissionNo: s.admissionNo, why,
      classSection: sec ? `${sec.schoolClass.name.replace(/^Class /, "")} ${sec.name}` : null,
      primaryGuardianId: s.guardians[0]?.guardianId ?? null,
    };
  });
}

export async function nextRollNo(tx: Tx, sectionId: string, academicYearId: string) {
  const top = await tx.enrolment.aggregate({ where: { sectionId, academicYearId, archivedAt: null }, _max: { rollNo: true } });
  return (top._max.rollNo ?? 0) + 1;
}

export async function seatsLeft(tx: Tx, sectionId: string) {
  const sec = await tx.section.findUnique({ where: { id: sectionId } });
  if (!sec) return 0;
  const used = await tx.enrolment.count({ where: { sectionId, academicYearId: sec.academicYearId, archivedAt: null, status: { not: "LEFT" } } });
  return sec.seats - used;
}

export type NewStudent = {
  fullName: string;
  sectionId: string;
  dateOfBirth: Date;
  gender: string;
  guardianName: string;
  guardianRelation?: string;
  guardianPhone: string;
  /** Link this existing parent instead of making a new one (sibling). */
  linkGuardianId?: string | null;
  admissionNo?: string | null;
  rollNo?: number | null;
  admissionDate: Date;
  applyFeePlan: boolean;
  /** "Save anyway" after a duplicate warning needs a reason. */
  duplicateReason?: string | null;
  bloodGroup?: string | null;
  category?: string | null;
  religion?: string | null;
  motherTongue?: string | null;
  address?: string | null;
  aadhaar?: string | null;
  previousSchool?: string | null;
  /** Last class and marks at the previous school (an admission form has them). */
  previousClass?: string | null;
  previousMarks?: string | null;
  how?: "added" | "imported";
};

export class DuplicateFound extends Error {
  constructor(public matches: DuplicateMatch[]) {
    super("This student may already be on record.");
    this.name = "DuplicateFound";
  }
}

export async function createStudent(tx: Tx, ctx: SchoolContext, input: NewStudent) {
  const section = await tx.section.findFirst({ where: { id: input.sectionId, archivedAt: null }, include: { schoolClass: true, academicYear: true } });
  if (!section) throw new StudentProblem("Choose the class and section.", "sectionId");
  await assertYearOpen(tx, section.academicYearId);
  if ((await seatsLeft(tx, section.id)) <= 0) {
    throw new StudentProblem(`${section.schoolClass.name} ${section.name} is full (${section.seats} seats). Choose another section, or add seats in Academic Management.`, "sectionId");
  }

  let admissionNo = input.admissionNo?.trim() || null;
  if (admissionNo) {
    const taken = await admissionNoTaken(tx, admissionNo);
    if (taken) throw new StudentProblem(`${taken} Use the next free number: ${await previewAdmissionNo(tx, ctx, section.academicYear.campusId)}.`, "admissionNo");
  }

  const dups = await findDuplicates(tx, { fullName: input.fullName, dateOfBirth: input.dateOfBirth, guardianPhone: input.guardianPhone });
  if (dups.length && !(input.duplicateReason && input.duplicateReason.trim().length >= 5)) throw new DuplicateFound(dups);

  const settings = await getStudentSettings(tx, ctx);
  for (const f of settings.requiredFields) {
    const v = (input as Record<string, unknown>)[f];
    if (v === undefined || v === null || v === "") {
      throw new StudentProblem(`${f === "aadhaar" ? "Aadhaar number" : f.replace(/([A-Z])/g, " $1").toLowerCase().replace(/^./, (c) => c.toUpperCase())} is required in this school (Student Settings).`, f);
    }
  }

  admissionNo ??= await takeAdmissionNo(tx, ctx, section.academicYear.campusId);
  const name = splitName(input.fullName);
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const status: StudentStatus = input.admissionDate > today ? "ADMITTED" : "ACTIVE";
  const aadhaar = input.aadhaar?.replace(/\s+/g, "") || null;

  const student = await tx.student.create({
    data: {
      schoolId: ctx.schoolId,
      campusId: section.academicYear.campusId,
      admissionNo,
      ...name,
      dateOfBirth: input.dateOfBirth,
      gender: input.gender,
      bloodGroup: input.bloodGroup ?? null,
      category: input.category ?? null,
      religion: input.religion ?? null,
      motherTongue: input.motherTongue ?? null,
      address: input.address ?? null,
      aadhaarEnc: aadhaar ? encryptField(aadhaar) : null,
      previousSchool: input.previousSchool ?? null,
      status,
      joiningDate: input.admissionDate,
      createdById: ctx.userId,
    },
  });
  if (input.previousSchool) {
    await tx.studentPreviousSchool.create({ data: { schoolId: ctx.schoolId, studentId: student.id, schoolName: input.previousSchool, lastClass: input.previousClass ?? null, marks: input.previousMarks ?? null, updatedById: ctx.userId } });
  }

  // The parent: an existing one (brother or sister already here) or a new record.
  let guardianId = input.linkGuardianId ?? null;
  if (guardianId) {
    const g = await tx.guardian.findFirst({ where: { id: guardianId, archivedAt: null } });
    if (!g) throw new StudentProblem("That parent record was not found. Add the parent again.", "guardianPhone");
  } else {
    const g = await tx.guardian.create({
      data: { schoolId: ctx.schoolId, name: input.guardianName.trim(), relationship: input.guardianRelation ?? "Father", phone: input.guardianPhone, createdById: ctx.userId },
    });
    guardianId = g.id;
  }
  await tx.studentGuardian.create({
    data: { schoolId: ctx.schoolId, studentId: student.id, guardianId, relationship: input.guardianRelation ?? "Father", isPrimary: true, emergencyOrder: 1 },
  });

  if (input.rollNo != null && (!Number.isInteger(input.rollNo) || input.rollNo < 1)) throw new StudentProblem("Roll number starts at 1.", "rollNo");
  const rollNo = input.rollNo ?? (await nextRollNo(tx, section.id, section.academicYearId));
  if (input.rollNo) {
    const clash = await tx.enrolment.findFirst({ where: { sectionId: section.id, academicYearId: section.academicYearId, rollNo: input.rollNo, archivedAt: null } });
    if (clash) throw new StudentProblem(`Roll number ${input.rollNo} is already used in ${section.schoolClass.name} ${section.name}. The next free number is ${await nextRollNo(tx, section.id, section.academicYearId)}.`, "rollNo");
  }
  const enrolment = await tx.enrolment.create({
    data: { schoolId: ctx.schoolId, studentId: student.id, academicYearId: section.academicYearId, classId: section.classId, sectionId: section.id, rollNo, createdById: ctx.userId },
  });
  await tx.studentStatusChange.create({
    data: { schoolId: ctx.schoolId, studentId: student.id, fromStatus: "NEW", toStatus: status, effectiveDate: input.admissionDate, reason: input.how === "imported" ? "Imported" : "Added", source: input.how ?? "added", createdById: ctx.userId },
  });
  await runEnrolled(tx, ctx, { studentId: student.id, enrolmentId: enrolment.id, academicYearId: section.academicYearId, classId: section.classId, sectionId: section.id, how: input.how ?? "added", applyFeePlan: input.applyFeePlan });
  await writeAudit(tx, ctx, {
    action: "created",
    recordType: "Student",
    recordId: student.id,
    after: { admissionNo, fullName: name.fullName, section: `${section.schoolClass.name} ${section.name}`, rollNo, guardianLinked: Boolean(input.linkGuardianId) },
    actorNote: dups.length ? `Saved anyway despite a possible duplicate (${dups.map((d) => d.admissionNo).join(", ")}): ${input.duplicateReason}` : null,
  });
  return { student, enrolment, section };
}

/** Parents already on record with this phone, to offer "link the existing parent". */
export async function guardiansByPhone(tx: Tx, phone: string) {
  if (!/^\d{10}$/.test(phone)) return [];
  return tx.guardian.findMany({
    where: { phone, archivedAt: null },
    include: { students: { where: { archivedAt: null }, include: { student: { select: { fullName: true, status: true } } } } },
    take: 5,
  });
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

/** Changes some of a student's fields, writing the before and after to the audit log. */
async function changeStudent(tx: Tx, ctx: SchoolContext, studentId: string, section: string, data: Prisma.StudentUpdateInput, show: Record<string, unknown>) {
  const before = await tx.student.findUniqueOrThrow({ where: { id: studentId } });
  const keys = Object.keys(show);
  const prev: Record<string, unknown> = {};
  for (const k of keys) {
    const v = (before as Record<string, unknown>)[k];
    prev[k] = v instanceof Date ? iso(v) : v;
  }
  const changed = keys.filter((k) => JSON.stringify(prev[k] ?? null) !== JSON.stringify(show[k] ?? null));
  if (changed.length === 0) return { changed: 0 };
  await tx.student.update({ where: { id: studentId }, data: { ...data, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, {
    action: "changed",
    recordType: "Student",
    recordId: studentId,
    before: Object.fromEntries(changed.map((k) => [k, prev[k] ?? null])) as Prisma.InputJsonValue,
    after: { section, ...Object.fromEntries(changed.map((k) => [k, show[k] ?? null])) } as Prisma.InputJsonValue,
  });
  return { changed: changed.length };
}

export type PersonalInput = {
  fullName: string; dateOfBirth: Date; gender: string; bloodGroup: string | null; category: string | null;
  religion: string | null; motherTongue: string | null;
  /** Undefined = leave as it is (people who may not see it cannot change it). */
  aadhaar?: string | null;
};

export async function savePersonal(tx: Tx, ctx: SchoolContext, studentId: string, p: PersonalInput) {
  const name = splitName(p.fullName);
  const data: Prisma.StudentUpdateInput = { ...name, dateOfBirth: p.dateOfBirth, gender: p.gender, bloodGroup: p.bloodGroup, category: p.category, religion: p.religion, motherTongue: p.motherTongue };
  const show: Record<string, unknown> = { fullName: name.fullName, dateOfBirth: iso(p.dateOfBirth), gender: p.gender, bloodGroup: p.bloodGroup, category: p.category, religion: p.religion, motherTongue: p.motherTongue };
  const result = await changeStudent(tx, ctx, studentId, "Personal", data, show);
  if (p.aadhaar !== undefined) {
    const before = await tx.student.findUniqueOrThrow({ where: { id: studentId }, select: { aadhaarEnc: true } });
    const clean = p.aadhaar?.replace(/\s+/g, "") || null;
    await tx.student.update({ where: { id: studentId }, data: { aadhaarEnc: clean ? encryptField(clean) : null } });
    // The audit log keeps only the masked value of a restricted field.
    if (Boolean(before.aadhaarEnc) || clean) {
      await writeAudit(tx, ctx, { action: "changed", recordType: "Student", recordId: studentId, before: { aadhaar: before.aadhaarEnc ? "on record" : null }, after: { section: "Personal", aadhaar: clean ? maskLast4(clean) : null } });
    }
  }
  return result;
}

export async function saveContact(tx: Tx, ctx: SchoolContext, studentId: string, c: { address: string | null; city: string | null; state: string | null; pinCode: string | null; permanentAddress: string | null; studentPhone: string | null; studentEmail: string | null }) {
  const before = await tx.student.findUniqueOrThrow({ where: { id: studentId }, select: { customFields: true } });
  const extra = { ...((before.customFields as Record<string, unknown>) ?? {}), _permanentAddress: c.permanentAddress, _studentPhone: c.studentPhone, _studentEmail: c.studentEmail };
  return changeStudent(tx, ctx, studentId, "Contact",
    { address: c.address, city: c.city, state: c.state, pinCode: c.pinCode, customFields: extra as Prisma.InputJsonValue },
    { address: c.address, city: c.city, state: c.state, pinCode: c.pinCode, customFields: extra });
}

/** Enrolment: admission number (unique; change audited, "Done when" 10), admission date, roll number. */
export async function saveEnrolment(tx: Tx, ctx: SchoolContext, studentId: string, e: { admissionNo: string; admissionDate: Date | null; rollNo: number | null }) {
  const taken = await admissionNoTaken(tx, e.admissionNo, studentId);
  if (taken) throw new StudentProblem(taken, "admissionNo");
  // The roll number of this year's class: the student's own campus's current year.
  const year = await studentYear(tx, ctx, studentId);
  if (year && e.rollNo !== null) {
    const enr = await tx.enrolment.findFirst({ where: { studentId, academicYearId: year.id, archivedAt: null } });
    if (enr && enr.rollNo !== e.rollNo) {
      await assertYearOpen(tx, year.id);
      const clash = await tx.enrolment.findFirst({ where: { sectionId: enr.sectionId, academicYearId: year.id, rollNo: e.rollNo, archivedAt: null, id: { not: enr.id } } });
      if (clash) throw new StudentProblem(`Roll number ${e.rollNo} is already used in this section. The next free number is ${await nextRollNo(tx, enr.sectionId, year.id)}.`, "rollNo");
      await tx.enrolment.update({ where: { id: enr.id }, data: { rollNo: e.rollNo } });
      await writeAudit(tx, ctx, { action: "changed", recordType: "Enrolment", recordId: enr.id, before: { rollNo: enr.rollNo }, after: { rollNo: e.rollNo } });
    }
  }
  return changeStudent(tx, ctx, studentId, "Enrolment", { admissionNo: e.admissionNo.trim(), joiningDate: e.admissionDate }, { admissionNo: e.admissionNo.trim(), joiningDate: iso(e.admissionDate) });
}

/** The previous school is locked once the year the student joined is closed (03 §5 "Closed history edited"). */
export async function previousSchoolLocked(tx: Tx, studentId: string) {
  const first = await tx.enrolment.findFirst({ where: { studentId, archivedAt: null }, orderBy: { createdAt: "asc" }, include: { student: false } });
  if (!first) return null;
  const year = await tx.academicYear.findUnique({ where: { id: first.academicYearId } });
  return year?.status === "CLOSED" ? year.name : null;
}

export async function savePreviousSchool(tx: Tx, ctx: SchoolContext, studentId: string, p: { schoolName: string; board: string | null; lastClass: string | null; year: string | null; marks: string | null }, correction?: { allowed: boolean; reason: string | null }) {
  const locked = await previousSchoolLocked(tx, studentId);
  if (locked && !(correction?.allowed && correction.reason && correction.reason.trim().length >= 5)) {
    throw new StudentProblem(`Locked: ${locked} is closed. A School Admin or Principal can make an authorised correction with a reason.`, "schoolName");
  }
  const before = await tx.studentPreviousSchool.findUnique({ where: { studentId } });
  await tx.studentPreviousSchool.upsert({
    where: { studentId },
    create: { schoolId: ctx.schoolId, studentId, ...p, updatedById: ctx.userId },
    update: { ...p, updatedById: ctx.userId },
  });
  await tx.student.update({ where: { id: studentId }, data: { previousSchool: p.schoolName } });
  await writeAudit(tx, ctx, {
    action: locked ? "corrected" : "changed",
    recordType: "Student",
    recordId: studentId,
    before: before ? { schoolName: before.schoolName, board: before.board, lastClass: before.lastClass, year: before.year, marks: before.marks } : null,
    after: { section: "Previous school", ...p },
    actorNote: locked ? `Authorised correction: ${correction?.reason}` : null,
  });
}

export async function saveIdentifiers(tx: Tx, ctx: SchoolContext, studentId: string, ids: { apaarId: string | null; pen: string | null; others: Record<string, string | null> }) {
  await changeStudent(tx, ctx, studentId, "Identifiers", { apaarId: ids.apaarId, pen: ids.pen }, { apaarId: ids.apaarId ? maskLast4(ids.apaarId) : null, pen: ids.pen ? maskLast4(ids.pen) : null });
  for (const [typeKey, value] of Object.entries(ids.others)) {
    const existing = await tx.studentIdentifier.findUnique({ where: { studentId_typeKey: { studentId, typeKey } } });
    const clean = value?.trim() || null;
    if (!clean) {
      if (existing && !existing.archivedAt) {
        await tx.studentIdentifier.update({ where: { id: existing.id }, data: { archivedAt: new Date() } });
        await writeAudit(tx, ctx, { action: "archived", recordType: "Student Identifier", recordId: existing.id, before: { typeKey, value: maskLast4(existing.last4) } });
      }
      continue;
    }
    const last4 = clean.slice(-4);
    if (existing) {
      await tx.studentIdentifier.update({ where: { id: existing.id }, data: { valueEnc: encryptField(clean), last4, archivedAt: null } });
    } else {
      await tx.studentIdentifier.create({ data: { schoolId: ctx.schoolId, studentId, typeKey, valueEnc: encryptField(clean), last4, createdById: ctx.userId } });
    }
    await writeAudit(tx, ctx, { action: "changed", recordType: "Student Identifier", recordId: studentId, before: existing ? { typeKey, value: maskLast4(existing.last4) } : null, after: { typeKey, value: maskLast4(clean) } });
  }
}

export async function saveExtraFields(tx: Tx, ctx: SchoolContext, studentId: string, values: Record<string, string | null>) {
  const before = await tx.student.findUniqueOrThrow({ where: { id: studentId }, select: { customFields: true } });
  const merged = { ...((before.customFields as Record<string, unknown>) ?? {}), ...values };
  return changeStudent(tx, ctx, studentId, "Extra fields", { customFields: merged as Prisma.InputJsonValue }, { customFields: merged });
}

/**
 * Status change from the Student Profile: only the allowed changes, with an
 * effective date and a reason. Re-admission (Transferred or Withdrawn to
 * Active) waits for approval.
 */
export async function changeStatus(tx: Tx, ctx: SchoolContext, studentId: string, to: StudentStatusKey, effectiveDate: Date, reason: string) {
  const student = await tx.student.findUniqueOrThrow({ where: { id: studentId } });
  const allowed = PROFILE_CHANGES[student.status as StudentStatusKey]?.find((c) => c.to === to);
  if (!allowed) {
    throw new StudentProblem(`A ${STATUS_LABEL[student.status as StudentStatusKey].toLowerCase()} student cannot be made ${STATUS_LABEL[to].toLowerCase()} here. Promotion and leaving are done on their own pages.`, "to");
  }
  if (reason.trim().length < 5) throw new StudentProblem("Give a reason of at least 5 characters.", "reason");
  if (allowed.approval) {
    const waiting = await tx.approval.findFirst({ where: { type: "re-admission", recordId: studentId, status: { in: ["WAITING", "ESCALATED"] } } });
    if (waiting) throw new StudentProblem("A re-admission request for this student is already waiting in Approvals.", "to");
    await requestApproval(tx, ctx, {
      type: "re-admission",
      recordType: "Student",
      recordId: studentId,
      summary: `Re-admit ${student.fullName} (${student.admissionNo}) from ${formatIso(effectiveDate)}`,
      reason,
    });
    return { waiting: true };
  }
  await applyStatus(tx, ctx, studentId, to, effectiveDate, reason, "profile");
  return { waiting: false };
}

const formatIso = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("-");

/** Sets a status and keeps the change in the history. Used by profile, promotion, leaving and approvals. */
export async function applyStatus(tx: Tx, ctx: SchoolContext, studentId: string, to: StudentStatus, effectiveDate: Date, reason: string, source: string, extra: Prisma.StudentUpdateInput = {}) {
  const student = await tx.student.findUniqueOrThrow({ where: { id: studentId } });
  if (student.status === to && Object.keys(extra).length === 0) return student;
  const updated = await tx.student.update({ where: { id: studentId }, data: { status: to, updatedById: ctx.userId, ...extra } });
  await tx.studentStatusChange.create({
    data: { schoolId: ctx.schoolId, studentId, fromStatus: student.status, toStatus: to, effectiveDate, reason, source, createdById: ctx.userId },
  });
  await writeAudit(tx, ctx, { action: "status-changed", recordType: "Student", recordId: studentId, before: { status: student.status }, after: { status: to, effectiveDate: iso(effectiveDate), reason, source } });
  return updated;
}

/** Change section within the same class (keeps history). Returns the change, for Undo. */
export async function changeSection(tx: Tx, ctx: SchoolContext, studentId: string, toSectionId: string, reason: string | null) {
  // This year's class is in the student's own campus's current year.
  const year = await studentYear(tx, ctx, studentId);
  if (!year) throw new StudentProblem("No academic year is open. Open one in Academic Management.");
  await assertYearOpen(tx, year.id);
  const enr = await tx.enrolment.findFirst({ where: { studentId, academicYearId: year.id, archivedAt: null } });
  if (!enr) throw new StudentProblem("This student has no class this year.");
  if (enr.sectionId === toSectionId) throw new StudentProblem("The student is already in this section.", "sectionId");
  const to = await tx.section.findFirst({ where: { id: toSectionId, academicYearId: year.id, archivedAt: null }, include: { schoolClass: true } });
  if (!to) throw new StudentProblem("Choose a section of this year.", "sectionId");
  if (to.classId !== enr.classId) throw new StudentProblem("A section change stays in the same class. To move class, use Promotion.", "sectionId");
  if ((await seatsLeft(tx, to.id)) <= 0) throw new StudentProblem(`${to.schoolClass.name} ${to.name} is full (${to.seats} seats).`, "sectionId");
  const rollNo = await nextRollNo(tx, to.id, year.id);
  await tx.enrolment.update({ where: { id: enr.id }, data: { sectionId: to.id, rollNo } });
  const change = await tx.sectionChange.create({
    data: { schoolId: ctx.schoolId, studentId, enrolmentId: enr.id, fromSectionId: enr.sectionId, toSectionId: to.id, fromRollNo: enr.rollNo, toRollNo: rollNo, reason, createdById: ctx.userId },
  });
  const from = await tx.section.findUniqueOrThrow({ where: { id: enr.sectionId }, include: { schoolClass: true } });
  await runSectionChanged(tx, ctx, { studentId, academicYearId: year.id, fromSectionId: enr.sectionId, toSectionId: to.id });
  await writeAudit(tx, ctx, {
    action: "section-changed",
    recordType: "Enrolment",
    recordId: enr.id,
    before: { section: `${from.schoolClass.name} ${from.name}`, rollNo: enr.rollNo },
    after: { section: `${to.schoolClass.name} ${to.name}`, rollNo, reason },
  });
  return { change, label: `${to.schoolClass.name} ${to.name}` };
}

export async function undoSectionChange(tx: Tx, ctx: SchoolContext, changeId: string) {
  const ch = await tx.sectionChange.findUnique({ where: { id: changeId } });
  if (!ch || ch.undoneAt) throw new StudentProblem("This change was already undone.");
  const enr = await tx.enrolment.findUniqueOrThrow({ where: { id: ch.enrolmentId } });
  if (enr.sectionId !== ch.toSectionId) throw new StudentProblem("The student has moved again since, so this cannot be undone.");
  await assertYearOpen(tx, enr.academicYearId);
  const clash = ch.fromRollNo !== null && (await tx.enrolment.findFirst({ where: { sectionId: ch.fromSectionId, academicYearId: enr.academicYearId, rollNo: ch.fromRollNo, archivedAt: null } }));
  await tx.enrolment.update({ where: { id: enr.id }, data: { sectionId: ch.fromSectionId, rollNo: clash ? await nextRollNo(tx, ch.fromSectionId, enr.academicYearId) : ch.fromRollNo } });
  await tx.sectionChange.update({ where: { id: ch.id }, data: { undoneAt: new Date() } });
  await runSectionChanged(tx, ctx, { studentId: enr.studentId, academicYearId: enr.academicYearId, fromSectionId: ch.toSectionId, toSectionId: ch.fromSectionId });
  await writeAudit(tx, ctx, { action: "section-change-undone", recordType: "Enrolment", recordId: enr.id, before: { sectionId: ch.toSectionId }, after: { sectionId: ch.fromSectionId } });
}

export async function setPhoto(tx: Tx, ctx: SchoolContext, studentId: string, fileId: string | null) {
  const before = await tx.student.findUniqueOrThrow({ where: { id: studentId }, select: { photoFileId: true } });
  await tx.student.update({ where: { id: studentId }, data: { photoFileId: fileId, updatedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: before.photoFileId ? "photo-replaced" : "photo-added", recordType: "Student", recordId: studentId, before: { photoFileId: before.photoFileId }, after: { photoFileId: fileId } });
}

/** Places a student who has no class this year (for example after re-admission) in a section. */
export async function placeInSection(tx: Tx, ctx: SchoolContext, studentId: string, sectionId: string) {
  const section = await tx.section.findFirst({ where: { id: sectionId, archivedAt: null }, include: { schoolClass: true } });
  if (!section) throw new StudentProblem("Choose the class and section.", "sectionId");
  await assertYearOpen(tx, section.academicYearId);
  const existing = await tx.enrolment.findUnique({ where: { studentId_academicYearId: { studentId, academicYearId: section.academicYearId } } });
  if (existing && !existing.archivedAt && existing.status !== "LEFT") throw new StudentProblem("The student already has a class this year. Use Change section.", "sectionId");
  if ((await seatsLeft(tx, section.id)) <= 0) throw new StudentProblem(`${section.schoolClass.name} ${section.name} is full (${section.seats} seats).`, "sectionId");
  const rollNo = await nextRollNo(tx, section.id, section.academicYearId);
  const data = { classId: section.classId, sectionId: section.id, rollNo, status: "STUDYING" as const, archivedAt: null, createdById: ctx.userId };
  const enr = existing
    ? await tx.enrolment.update({ where: { id: existing.id }, data })
    : await tx.enrolment.create({ data: { schoolId: ctx.schoolId, studentId, academicYearId: section.academicYearId, ...data } });
  await runEnrolled(tx, ctx, { studentId, enrolmentId: enr.id, academicYearId: section.academicYearId, classId: section.classId, sectionId: section.id, how: "added", applyFeePlan: true });
  await writeAudit(tx, ctx, { action: "enrolled", recordType: "Enrolment", recordId: enr.id, after: { section: `${section.schoolClass.name} ${section.name}`, rollNo } });
  return enr;
}

/** Emergency contacts other than linked parents, in priority order. */
export async function addEmergencyContact(tx: Tx, ctx: SchoolContext, studentId: string, c: { name: string; relation: string; phone: string }) {
  const list = await emergencyList(tx, studentId);
  const priority = list.length + 1;
  const row = await tx.studentEmergencyContact.create({ data: { schoolId: ctx.schoolId, studentId, ...c, priority, createdById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "created", recordType: "Emergency Contact", recordId: row.id, after: { studentId, ...c, priority } });
  return row;
}

export async function archiveEmergencyContact(tx: Tx, ctx: SchoolContext, id: string) {
  const row = await tx.studentEmergencyContact.findFirst({ where: { id, archivedAt: null } });
  if (!row) throw new StudentProblem("This contact was already removed.");
  await tx.studentEmergencyContact.update({ where: { id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Emergency Contact", recordId: id, before: { name: row.name, phone: row.phone } });
}

export type EmergencyItem = { kind: "guardian" | "contact"; id: string; name: string; relation: string; phone: string; order: number; restricted: boolean };

/** Parents marked as emergency contacts and other contacts, as one list in priority order. */
export async function emergencyList(tx: Tx, studentId: string): Promise<EmergencyItem[]> {
  const [links, others] = await Promise.all([
    tx.studentGuardian.findMany({ where: { studentId, archivedAt: null, emergencyOrder: { not: null } }, include: { guardian: true } }),
    tx.studentEmergencyContact.findMany({ where: { studentId, archivedAt: null } }),
  ]);
  return [
    ...links.map((l) => ({ kind: "guardian" as const, id: l.id, name: l.guardian.name, relation: l.relationship, phone: l.guardian.phone, order: l.emergencyOrder!, restricted: Boolean(l.restriction) })),
    ...others.map((o) => ({ kind: "contact" as const, id: o.id, name: o.name, relation: o.relation, phone: o.phone, order: o.priority, restricted: false })),
  ].sort((a, b) => a.order - b.order);
}

/** Moves one emergency contact up or down; the list is renumbered 1, 2, 3... */
export async function moveEmergency(tx: Tx, ctx: SchoolContext, studentId: string, kind: "guardian" | "contact", id: string, direction: "up" | "down") {
  const list = await emergencyList(tx, studentId);
  const i = list.findIndex((x) => x.kind === kind && x.id === id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  for (const [n, item] of list.entries()) {
    if (item.kind === "guardian") await tx.studentGuardian.update({ where: { id: item.id }, data: { emergencyOrder: n + 1 } });
    else await tx.studentEmergencyContact.update({ where: { id: item.id }, data: { priority: n + 1 } });
  }
  await writeAudit(tx, ctx, { action: "emergency-order-changed", recordType: "Student", recordId: studentId, after: { order: list.map((x) => x.name) } });
}

/** Marks or unmarks a linked parent as an emergency contact. */
export async function setGuardianEmergency(tx: Tx, ctx: SchoolContext, linkId: string, on: boolean) {
  const link = await tx.studentGuardian.findFirst({ where: { id: linkId, archivedAt: null } });
  if (!link) throw new StudentProblem("This link was not found.");
  if (on && link.emergencyOrder) return;
  const list = await emergencyList(tx, link.studentId);
  await tx.studentGuardian.update({ where: { id: linkId }, data: { emergencyOrder: on ? list.length + 1 : null } });
  await writeAudit(tx, ctx, { action: on ? "emergency-added" : "emergency-removed", recordType: "Student", recordId: link.studentId, after: { guardianId: link.guardianId } });
}
