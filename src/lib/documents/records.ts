// Merge fields from real records, for "Preview with a real record" and for
// modules that print a student's or staff member's document. Restricted
// numbers (Aadhaar, PAN, bank account) are never put on a document in full.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { formatDate } from "../format";
import { numberInWords } from "./words";
import { sampleData, type DocumentData } from "./render";
import { findDocType } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RecordRef = { kind: "student" | "staff"; id: string } | null;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ORDINAL = ["", "First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth", "Eleventh", "Twelfth", "Thirteenth", "Fourteenth", "Fifteenth", "Sixteenth", "Seventeenth", "Eighteenth", "Nineteenth", "Twentieth", "Twenty First", "Twenty Second", "Twenty Third", "Twenty Fourth", "Twenty Fifth", "Twenty Sixth", "Twenty Seventh", "Twenty Eighth", "Twenty Ninth", "Thirtieth", "Thirty First"];

/** 14-03-2016 -> "Fourteenth March Two Thousand Sixteen", as TCs write it. */
export function dateInWords(d: Date): string {
  return `${ORDINAL[d.getUTCDate()]} ${MONTHS[d.getUTCMonth()]} ${numberInWords(d.getUTCFullYear())}`;
}

export async function studentRecord(tx: Tx, ctx: SchoolContext, studentId: string, tz = "Asia/Kolkata"): Promise<DocumentData | null> {
  const s = await tx.student.findUnique({
    where: { id: studentId },
    include: { enrolments: { where: { archivedAt: null }, orderBy: { createdAt: "desc" }, take: 1 }, guardians: { where: { archivedAt: null }, include: { guardian: true }, orderBy: [{ isPrimary: "desc" }, { emergencyOrder: "asc" }] } },
  });
  if (!s) return null;
  const e = s.enrolments[0];
  const section = e ? await tx.section.findUnique({ where: { id: e.sectionId }, include: { schoolClass: true, academicYear: true } }) : null;
  const father = s.guardians.find((g) => /father/i.test(g.relationship))?.guardian;
  const mother = s.guardians.find((g) => /mother/i.test(g.relationship))?.guardian;
  const primary = s.guardians[0]?.guardian;
  return {
    campusId: s.campusId,
    photoFileId: s.photoFileId,
    fields: {
      student_name: s.fullName,
      admission_no: s.admissionNo,
      class_section: section ? `${section.schoolClass.name} ${section.name}` : "",
      roll_no: e?.rollNo ?? "",
      date_of_birth: s.dateOfBirth ? formatDate(s.dateOfBirth, tz) : "",
      dob_in_words: s.dateOfBirth ? dateInWords(s.dateOfBirth) : "",
      gender: s.gender ?? "",
      father_name: father?.name ?? "",
      mother_name: mother?.name ?? "",
      guardian_name: primary?.name ?? "",
      guardian_phone: primary?.phone ?? "",
      address: [s.address, s.city, s.state, s.pinCode].filter(Boolean).join(", "),
      blood_group: s.bloodGroup ?? "",
      admission_date: s.joiningDate ? formatDate(s.joiningDate, tz) : "",
      category: s.category ?? "",
      pen: s.pen ?? "",
      apaar_id: s.apaarId ?? "",
      ...(section ? { academic_year: section.academicYear.name } : {}),
    },
  };
}

export async function staffRecord(tx: Tx, _ctx: SchoolContext, staffId: string, tz = "Asia/Kolkata"): Promise<DocumentData | null> {
  const s = await tx.staff.findUnique({ where: { id: staffId }, include: { department: true } });
  if (!s) return null;
  return {
    campusId: s.campusId,
    photoFileId: s.photoFileId,
    fields: {
      staff_name: s.fullName,
      staff_code: s.staffCode,
      designation: s.designation,
      department: s.department?.name ?? "",
      joining_date: formatDate(s.joiningDate, tz),
      leaving_date: s.leavingDate ? formatDate(s.leavingDate, tz) : "",
      blood_group: s.bloodGroup ?? "",
      staff_phone: s.phone,
      gender: s.gender ?? "",
    },
  };
}

/** Sample values, with a real record's values on top when one is chosen. */
export async function recordData(tx: Tx, ctx: SchoolContext, docType: string, record: RecordRef, tz: string) {
  const t = findDocType(docType)!;
  const sample = sampleData(t);
  if (!record || !UUID.test(record.id)) return sample;
  const real = record.kind === "student" ? await studentRecord(tx, ctx, record.id, tz) : await staffRecord(tx, ctx, record.id, tz);
  if (!real) return sample;
  const fields = { ...sample.fields } as Record<string, unknown>;
  for (const [k, v] of Object.entries(real.fields)) if (v !== "" && v !== null && v !== undefined) fields[k] = v;
  return { ...sample, ...real, fields: fields as typeof sample.fields };
}

