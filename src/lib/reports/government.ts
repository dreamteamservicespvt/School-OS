// Government Reports (19 §2): UDISE+, APAAR and PEN, the RTE 25% seats
// claim and the CBSE board returns, each in a named format version. A data
// check lists missing or wrong details in plain words, each with a link to
// the record that fixes it, before any file is made. A file can still be
// made "anyway", with the problems in a separate file. Every export is kept
// (version, who, when, the file) and written to the export log.
import "server-only";

import { randomUUID } from "node:crypto";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { buildExport, logExport } from "../exports";
import { formatDate } from "../format";
import { readPreferences } from "../settings/profile-rules";
import { fileStore } from "../storage";
import { makeZip } from "../zip";
import { currentYear } from "../academic/years";

export class GovProblem extends Error {}

export type ReturnKey = "udise" | "apaar" | "rte" | "cbse9" | "cbse10";
export type GovReturn = { key: ReturnKey; name: string; sub: string; icon: string; versions: string[]; ext: "zip" | "csv"; board?: "cbse" };

/** Format versions are kept up to date by DREAM TEAM SERVICES; the first is the latest. */
export const RETURNS: GovReturn[] = [
  { key: "udise", name: "UDISE+ school data", sub: "School, students and staff in the UDISE+ structure", icon: "Landmark", versions: ["2026-27 v2", "2026-27 v1"], ext: "zip" },
  { key: "apaar", name: "APAAR and PEN details", sub: "APAAR ID, PEN and consent status for every student", icon: "IdCard", versions: ["2026-27 v1"], ext: "csv" },
  { key: "rte", name: "RTE 25% seats claim", sub: "Students on RTE seats, for the fee reimbursement claim to the state", icon: "Scale", versions: ["2026-27 v1"], ext: "csv" },
  { key: "cbse9", name: "CBSE registration, Class 9", sub: "Registration data for the CBSE portal", icon: "BadgeCheck", versions: ["2026-27 v1"], ext: "csv", board: "cbse" },
  { key: "cbse10", name: "CBSE list of candidates, Class 10", sub: "Board exam candidates with subjects", icon: "ClipboardCheck", versions: ["2026-27 v1"], ext: "csv", board: "cbse" },
];
export const findReturn = (k: string) => RETURNS.find((r) => r.key === k) ?? null;

/** The returns this school files: CBSE ones only for a CBSE school. */
export async function returnsFor(tx: Tx, ctx: SchoolContext) {
  const s = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { board: true } });
  const cbse = /cbse/i.test(s.board ?? "");
  return RETURNS.filter((r) => !r.board || cbse);
}

/** The return, format version, academic year and campus chosen on the page (?return=&version=&year=&campus=), read the same way for the page and the export. */
export async function govChoice(tx: Tx, ctx: SchoolContext, sp: Record<string, string | string[] | undefined>, campusId: string | null) {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const uuid = (v: string) => (/^[0-9a-f-]{36}$/i.test(v) ? v : null);
  const returns = await returnsFor(tx, ctx);
  const ret = returns.find((r) => r.key === one(sp.return)) ?? returns[0];
  const version = ret.versions.includes(one(sp.version)) ? one(sp.version) : ret.versions[0];
  const years = await tx.academicYear.findMany({ where: { archivedAt: null, ...(campusId ? { campusId } : {}) }, orderBy: { startDate: "desc" }, select: { id: true, name: true, status: true, startDate: true, endDate: true } });
  const yearId = uuid(one(sp.year));
  const year = years.find((y) => y.id === yearId) ?? (await currentYear(tx, ctx, campusId)) ?? years[0] ?? null;
  const campusPick = uuid(one(sp.campus)) ?? campusId;
  const campus = campusPick ? await tx.campus.findFirst({ where: { id: campusPick, archivedAt: null }, select: { id: true, name: true } }) : null;
  return { returns, ret, version, years, year: year ? { id: year.id, name: year.name } : null, campus };
}

export type Who = "student" | "staff" | "school";
export type Problem = { key: string; text: string; who: Who; count: number; records: { id: string; name: string; where: string; field: string; href: string }[] };
export type Check = { ret: GovReturn; version: string; year: { id: string; name: string }; campus: { id: string; name: string } | null; rowsWords: string; rows: number; problems: Problem[] };

const cls = (name: string) => name.replace(/^Class\s+/i, "");
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
const studentHref = (id: string) => `/student-management/students/${id}`;
const staffHref = (id: string) => `/staff-hr-management/${id}`;
const ddmmyyyy = (d: Date | null) => (d ? formatDate(d, "UTC") : "");

async function schoolCodes(tx: Tx, ctx: SchoolContext) {
  const s = await tx.school.findUniqueOrThrow({ where: { id: ctx.schoolId }, select: { name: true, board: true, affiliationNumber: true, preferences: true, state: true, city: true } });
  const c = readPreferences(s.preferences).compliance ?? {};
  return { name: s.name, board: s.board, affiliation: s.affiliationNumber, udise: c.udiseCode ?? null, boardCode: c.boardSchoolCode ?? null, state: s.state, city: s.city };
}

/** The school codes card on the page. */
export async function codesCard(tx: Tx, ctx: SchoolContext, yearId: string | null) {
  const c = await schoolCodes(tx, ctx);
  const students = yearId ? await tx.enrolment.findMany({ where: { academicYearId: yearId, archivedAt: null, status: "STUDYING" }, select: { studentId: true } }) : [];
  const consent = students.length ? await tx.consentRecord.findMany({ where: { consentType: "apaar", withdrawnAt: null, studentId: { in: students.map((s) => s.studentId) } }, select: { studentId: true }, distinct: ["studentId"] }) : [];
  return [
    ["UDISE code", c.udise ?? "Not set"],
    ...(/cbse/i.test(c.board ?? "") ? [["CBSE affiliation", c.affiliation ?? "Not set"], ["CBSE school code", c.boardCode ?? "Not set"]] : c.board ? [["Board", c.board]] : []),
    ["APAAR consent", `${consent.length.toLocaleString("en-IN")} of ${students.length.toLocaleString("en-IN")} given`],
  ] as [string, string][];
}

type StudentRow = Awaited<ReturnType<typeof loadStudents>>[number];

async function loadStudents(tx: Tx, yearId: string, campusId: string | null, classMatch?: RegExp) {
  const enrol = await tx.enrolment.findMany({
    where: { academicYearId: yearId, archivedAt: null, status: "STUDYING", student: { archivedAt: null, ...(campusId ? { campusId } : {}) } },
    include: { student: { include: { guardians: { where: { archivedAt: null }, include: { guardian: { select: { name: true, relationship: true } } } } } } },
  });
  const sections = new Map((await tx.section.findMany({ where: { id: { in: [...new Set(enrol.map((e) => e.sectionId))] } }, include: { schoolClass: { select: { name: true, sortOrder: true } } } })).map((s) => [s.id, s]));
  return enrol
    .map((e) => {
      const sec = sections.get(e.sectionId);
      const g = e.student.guardians;
      const father = g.find((x) => /father/i.test(x.relationship) || /father/i.test(x.guardian.relationship))?.guardian.name ?? null;
      const mother = g.find((x) => /mother/i.test(x.relationship) || /mother/i.test(x.guardian.relationship))?.guardian.name ?? null;
      return { e, s: e.student, className: sec?.schoolClass.name ?? "", section: sec?.name ?? "", sort: (sec?.schoolClass.sortOrder ?? 0) * 1000 + (sec?.name.charCodeAt(0) ?? 0), father, mother, where: sec ? `${cls(sec.schoolClass.name)} ${sec.name}` : "" };
    })
    .filter((r) => !classMatch || classMatch.test(r.className))
    .sort((a, b) => a.sort - b.sort || a.s.fullName.localeCompare(b.s.fullName));
}

function missing(key: string, rows: StudentRow[], test: (r: StudentRow) => boolean, field: string, text: (n: number) => string): Problem | null {
  const bad = rows.filter(test);
  if (!bad.length) return null;
  return { key, who: "student", count: bad.length, text: text(bad.length), records: bad.map((r) => ({ id: r.s.id, name: r.s.fullName, where: r.where, field, href: studentHref(r.s.id) })) };
}

/** The RTE students: an approved scholarship or concession marked RTE this year. */
async function rteStudents(tx: Tx, yearId: string) {
  const c = await tx.concession.findMany({ where: { academicYearId: yearId, status: { in: ["APPROVED", "APPLIED"] }, OR: [{ scholarshipType: { contains: "RTE", mode: "insensitive" } }, { reason: { contains: "RTE", mode: "insensitive" } }] }, select: { studentId: true, appliedPaise: true, estimatedPaise: true } });
  const by = new Map<string, bigint>();
  for (const x of c) by.set(x.studentId, (by.get(x.studentId) ?? BigInt(0)) + (x.appliedPaise || x.estimatedPaise));
  return by;
}

const CLASS9 = /^(class\s+)?(9|ix)\b/i;
const CLASS10 = /^(class\s+)?(10|x)\b/i;

/** Runs the data check for one return. */
export async function checkReturn(tx: Tx, ctx: SchoolContext, ret: GovReturn, version: string, year: { id: string; name: string }, campus: { id: string; name: string } | null): Promise<Check> {
  const codes = await schoolCodes(tx, ctx);
  const problems: Problem[] = [];
  const schoolProblem = (key: string, text: string, field: string) => problems.push({ key, who: "school", count: 1, text, records: [{ id: ctx.schoolId, name: codes.name, where: "School Profile", field, href: "/settings/school-profile" }] });
  let rows = 0, words = "";
  if (ret.key === "udise") {
    const st = await loadStudents(tx, year.id, campus?.id ?? null);
    const staff = await tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] }, ...(campus ? { campusId: campus.id } : {}) }, orderBy: { fullName: "asc" } });
    rows = st.length + staff.length;
    words = `${plural(st.length, "student")} · ${plural(staff.length, "staff member", "staff")} · 1 school`;
    if (!codes.udise) schoolProblem("u0", "UDISE code of the school is not set", "UDISE code");
    for (const p of [
      missing("u1", st, (r) => !r.s.dateOfBirth, "Date of birth", (n) => `Date of birth missing for ${plural(n, "student")}`),
      missing("u2", st, (r) => !r.s.gender, "Gender", (n) => `Gender missing for ${plural(n, "student")}`),
      missing("u3", st, (r) => !r.s.category, "Social category", (n) => `Social category missing for ${plural(n, "student")}`),
      missing("u4", st, (r) => !r.s.aadhaarEnc, "Aadhaar", (n) => `Aadhaar not recorded for ${plural(n, "student")}`),
    ]) if (p) problems.push(p);
    const staffBad = (key: string, test: (s: (typeof staff)[number]) => boolean, field: string, text: (n: number) => string, list = staff) => {
      const bad = list.filter(test);
      if (bad.length) problems.push({ key, who: "staff", count: bad.length, text: text(bad.length), records: bad.map((s) => ({ id: s.id, name: s.fullName, where: s.designation, field, href: staffHref(s.id) })) });
    };
    staffBad("u5", (s) => !s.aadhaarEnc, "Aadhaar", (n) => `Aadhaar not recorded for ${plural(n, "staff member", "staff members")}`);
    staffBad("u6", (s) => !s.qualification, "Qualification", (n) => `Highest qualification missing for ${plural(n, "teacher")}`, staff.filter((s) => s.staffType === "Teaching"));
    staffBad("u7", (s) => !s.dateOfBirth || !s.gender, "Date of birth or gender", (n) => `Date of birth or gender missing for ${plural(n, "staff member", "staff members")}`);
  } else if (ret.key === "apaar") {
    const st = await loadStudents(tx, year.id, campus?.id ?? null);
    rows = st.length;
    words = plural(st.length, "student");
    const consent = new Set((await tx.consentRecord.findMany({ where: { consentType: "apaar", withdrawnAt: null, studentId: { in: st.map((r) => r.s.id) } }, select: { studentId: true } })).map((c) => c.studentId));
    for (const p of [
      missing("a1", st, (r) => !consent.has(r.s.id), "APAAR consent", (n) => `${plural(n, "student")} ${n === 1 ? "has" : "have"} no APAAR consent recorded`),
      missing("a2", st, (r) => !r.s.pen, "PEN", (n) => `PEN not recorded for ${plural(n, "student")}`),
      missing("a3", st, (r) => consent.has(r.s.id) && !r.s.apaarId, "APAAR ID", (n) => `APAAR ID not created yet for ${plural(n, "student")} with consent`),
      missing("a4", st, (r) => !r.s.dateOfBirth || !r.s.gender, "Date of birth or gender", (n) => `Date of birth or gender missing for ${plural(n, "student")}`),
    ]) if (p) problems.push(p);
  } else if (ret.key === "rte") {
    const rte = await rteStudents(tx, year.id);
    const st = (await loadStudents(tx, year.id, campus?.id ?? null)).filter((r) => rte.has(r.s.id));
    const amount = st.reduce((s, r) => s + (rte.get(r.s.id) ?? BigInt(0)), BigInt(0));
    rows = st.length;
    words = `${plural(st.length, "student")} · ${(Number(amount) / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })}`;
    if (!codes.udise) schoolProblem("r0", "UDISE code of the school is not set", "UDISE code");
    for (const p of [
      missing("r1", st, (r) => !r.s.dateOfBirth, "Date of birth", (n) => `Date of birth missing for ${plural(n, "RTE student")}`),
      missing("r2", st, (r) => !r.s.category, "Social category", (n) => `Social category missing for ${plural(n, "RTE student")}`),
      missing("r3", st, (r) => !r.father && !r.mother, "Parent name", (n) => `Parent name missing for ${plural(n, "RTE student")}`),
    ]) if (p) problems.push(p);
  } else {
    const st = await loadStudents(tx, year.id, campus?.id ?? null, ret.key === "cbse9" ? CLASS9 : CLASS10);
    rows = st.length;
    words = plural(st.length, "student");
    if (!codes.boardCode) schoolProblem("c0", "CBSE school code is not set", "Board school code");
    if (!codes.affiliation) schoolProblem("c00", "CBSE affiliation number is not set", "Affiliation number");
    for (const p of [
      missing("c1", st, (r) => !r.s.dateOfBirth, "Date of birth", (n) => `Date of birth missing for ${plural(n, "student")}`),
      missing("c2", st, (r) => !r.father || !r.mother, "Father's and mother's names", (n) => `Father's or mother's name missing for ${plural(n, "student")}`),
      missing("c3", st, (r) => !r.s.category || !r.s.gender, "Gender and category", (n) => `Gender or category missing for ${plural(n, "student")}`),
      ...(ret.key === "cbse10" ? [missing("c4", st, (r) => r.e.optionalSubjects.length === 0, "Subjects chosen", (n) => `Subjects (second language) missing for ${plural(n, "student")}`)] : []),
    ]) if (p) problems.push(p);
  }
  return { ret, version, year, campus, rows, rowsWords: words, problems };
}

/* ---------- The files, in the portal format (plain CSV, no title lines) ---------- */

function csv(header: string[], rows: (string | number | null | undefined)[][]) {
  const cell = (v: unknown) => { const s = String(v ?? ""); const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };
  return Buffer.from([header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n", "utf8");
}

async function returnFile(tx: Tx, ctx: SchoolContext, c: Check) {
  const codes = await schoolCodes(tx, ctx);
  const v2 = c.version.endsWith("v2");
  const tag = `${c.year.name}`.replace(/\s+/g, "");
  if (c.ret.key === "udise") {
    const st = await loadStudents(tx, c.year.id, c.campus?.id ?? null);
    const staff = await tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] }, ...(c.campus ? { campusId: c.campus.id } : {}) }, include: { department: { select: { name: true } } }, orderBy: { fullName: "asc" } });
    const school = csv(["UDISE_CODE", "SCHOOL_NAME", "BOARD", "AFFILIATION_NO", "STATE", "DISTRICT_OR_CITY", "STUDENTS", "STAFF", "ACADEMIC_YEAR"], [[codes.udise, codes.name, codes.board, codes.affiliation, codes.state, codes.city, st.length, staff.length, c.year.name]]);
    const students = csv(
      ["UDISE_CODE", "ADMISSION_NO", "STUDENT_NAME", "GENDER", "DOB", "CLASS", "SECTION", "SOCIAL_CATEGORY", "RELIGION", "MOTHER_TONGUE", "FATHER_NAME", "MOTHER_NAME", "AADHAAR_ON_RECORD", ...(v2 ? ["APAAR_ID", "PEN"] : [])],
      st.map((r) => [codes.udise, r.s.admissionNo, r.s.fullName, r.s.gender, ddmmyyyy(r.s.dateOfBirth), cls(r.className), r.section, r.s.category, r.s.religion, r.s.motherTongue, r.father, r.mother, r.s.aadhaarEnc ? "Y" : "N", ...(v2 ? [r.s.apaarId, r.s.pen] : [])]),
    );
    const teachers = csv(
      ["UDISE_CODE", "STAFF_CODE", "NAME", "GENDER", "DOB", "DESIGNATION", "TYPE", "DEPARTMENT", "QUALIFICATION", "JOINING_DATE", "EMPLOYMENT", "AADHAAR_ON_RECORD"],
      staff.map((s) => [codes.udise, s.staffCode, s.fullName, s.gender, ddmmyyyy(s.dateOfBirth), s.designation, s.staffType, s.department?.name, s.qualification, ddmmyyyy(s.joiningDate), s.employmentType, s.aadhaarEnc ? "Y" : "N"]),
    );
    return { name: `UDISE-${codes.udise ?? "school"}-${tag}.zip`, type: "application/zip", body: makeZip([{ name: "school.csv", data: school }, { name: "students.csv", data: students }, { name: "staff.csv", data: teachers }]) };
  }
  if (c.ret.key === "apaar") {
    const st = await loadStudents(tx, c.year.id, c.campus?.id ?? null);
    const consent = new Map((await tx.consentRecord.findMany({ where: { consentType: "apaar", studentId: { in: st.map((r) => r.s.id) } }, orderBy: { givenAt: "desc" } })).map((x) => [x.studentId, x]));
    return { name: `APAAR-PEN-${tag}.csv`, type: "text/csv", body: csv(["UDISE_CODE", "ADMISSION_NO", "STUDENT_NAME", "GENDER", "DOB", "CLASS", "SECTION", "PEN", "APAAR_ID", "CONSENT", "CONSENT_DATE"], st.map((r) => { const k = consent.get(r.s.id); return [codes.udise, r.s.admissionNo, r.s.fullName, r.s.gender, ddmmyyyy(r.s.dateOfBirth), cls(r.className), r.section, r.s.pen, r.s.apaarId, k ? (k.withdrawnAt ? "WITHDRAWN" : "GIVEN") : "NOT RECORDED", k ? ddmmyyyy(k.givenAt) : ""]; })) };
  }
  if (c.ret.key === "rte") {
    const rte = await rteStudents(tx, c.year.id);
    const st = (await loadStudents(tx, c.year.id, c.campus?.id ?? null)).filter((r) => rte.has(r.s.id));
    return { name: `RTE-claim-${tag}.csv`, type: "text/csv", body: csv(["UDISE_CODE", "ADMISSION_NO", "STUDENT_NAME", "GENDER", "DOB", "CLASS", "SOCIAL_CATEGORY", "PARENT_NAME", "FEE_REIMBURSEMENT_RS"], st.map((r) => [codes.udise, r.s.admissionNo, r.s.fullName, r.s.gender, ddmmyyyy(r.s.dateOfBirth), cls(r.className), r.s.category, r.father ?? r.mother, (Number(rte.get(r.s.id) ?? 0) / 100).toFixed(2)])) };
  }
  const st = await loadStudents(tx, c.year.id, c.campus?.id ?? null, c.ret.key === "cbse9" ? CLASS9 : CLASS10);
  const subjects = new Map((await tx.subject.findMany({ select: { id: true, name: true, code: true } })).map((s) => [s.id, s]));
  const subj = (ids: string[]) => ids.map((id) => subjects.get(id)?.code ?? subjects.get(id)?.name ?? id).join("|");
  return {
    name: `CBSE-${c.ret.key === "cbse9" ? "REG-IX" : "LOC-X"}-${codes.boardCode ?? "school"}-${tag}.csv`, type: "text/csv",
    body: csv(["SCHOOL_CODE", "AFFILIATION_NO", "ROLL_REF", "CANDIDATE_NAME", "FATHER_NAME", "MOTHER_NAME", "DOB", "GENDER", "CATEGORY", "SECTION", "SUBJECTS"], st.map((r) => [codes.boardCode, codes.affiliation, r.s.admissionNo, r.s.fullName.toUpperCase(), r.father?.toUpperCase(), r.mother?.toUpperCase(), ddmmyyyy(r.s.dateOfBirth), r.s.gender, r.s.category, r.section, subj(r.e.optionalSubjects)])),
  };
}

async function keep(tx: Tx, ctx: SchoolContext, file: { name: string; type: string; body: Buffer }, purpose: string) {
  const id = randomUUID();
  const key = `${ctx.schoolId}/government/${id}`;
  await fileStore().put(key, file.body, file.type);
  await tx.storedFile.create({ data: { id, schoolId: ctx.schoolId, storageKey: key, fileName: file.name, contentType: file.type, sizeBytes: file.body.length, purpose, uploadedById: ctx.userId } });
  return id;
}

/** Makes the return's file. With problems it needs "anyway", and the problems go in a separate file. */
export async function exportReturn(tx: Tx, ctx: SchoolContext, c: Check, opts: { anyway: boolean; exportedBy: string; timeZone: string; schoolName: string }) {
  if (c.problems.length && !opts.anyway) throw new GovProblem(`Format ${c.version}. ${plural(c.problems.length, "problem")} found. Fix them and check again, or export anyway.`);
  const file = await returnFile(tx, ctx, c);
  const fileId = await keep(tx, ctx, file, "government-export");
  let problemFileId: string | null = null;
  if (c.problems.length) {
    const rows = c.problems.flatMap((p) => p.records.map((r) => ({ problem: p.text, name: r.name, where: r.where, field: r.field })));
    const pf = await buildExport("xlsx", [
      { label: "Problem", value: (r: (typeof rows)[number]) => r.problem }, { label: "Record", value: (r) => r.name }, { label: "Class or role", value: (r) => r.where }, { label: "Missing or wrong", value: (r) => r.field },
    ], rows, { title: `${c.ret.name}: problems`, schoolName: opts.schoolName, filters: `Format ${c.version} · ${c.year.name}${c.campus ? ` · ${c.campus.name}` : ""}`, exportedBy: opts.exportedBy, timeZone: opts.timeZone });
    problemFileId = await keep(tx, ctx, { ...pf, name: file.name.replace(/\.\w+$/, "-problems.xlsx") }, "government-problems");
  }
  const g = await tx.governmentExport.create({
    data: { schoolId: ctx.schoolId, returnKey: c.ret.key, title: c.ret.name, version: c.version, academicYearId: c.year.id, campusId: c.campus?.id ?? null, rows: c.rows, problems: c.problems.length, anyway: c.problems.length > 0, fileId, problemFileId, exportedById: ctx.userId! },
  });
  await logExport(tx, ctx, { title: `${c.ret.name} (${c.version})`, format: c.ret.ext === "zip" ? "csv" : "csv", filters: `${c.year.name}${c.campus ? ` · ${c.campus.name}` : ""}${c.problems.length ? ` · exported anyway with ${plural(c.problems.length, "problem")}` : ""}`, rows: c.rows });
  await writeAudit(tx, ctx, { action: "government-export", recordType: "Government Export", recordId: g.id, after: { returnKey: c.ret.key, version: c.version, rows: c.rows, problems: c.problems.length } });
  return { export: g, file };
}

/** Past exports, newest first, in the dates chosen. */
export async function pastExports(tx: Tx, range: { gte: Date; lt: Date } | null) {
  const list = await tx.governmentExport.findMany({ where: range ? { createdAt: range } : {}, orderBy: { createdAt: "desc" }, take: 200 });
  const people = new Map((await tx.userLogin.findMany({ where: { id: { in: [...new Set(list.map((x) => x.exportedById))] } }, select: { id: true, displayName: true } })).map((u) => [u.id, u.displayName]));
  return list.map((x) => ({ ...x, by: people.get(x.exportedById) ?? "Someone", note: x.anyway ? `Exported anyway, ${plural(x.problems, "problem")} in a separate file` : `${plural(x.rows, "row")}, no problems` }));
}
