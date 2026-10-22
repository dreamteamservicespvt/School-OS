// Understanding a file's columns (workflow 15, step 4: "the software matches
// the columns"). Old school software, UDISE+ downloads and hand-made Excel
// sheets name the same thing many ways ("Adm No", "SR No", "Father Mob",
// "D.O.B"). This finds the heading row, what the sheet holds, and which
// column is which: by name first (forgiving a typo or two), then by what the
// values look like. Fedena calls the class a "Batch", Entab writes "Stu Name"
// and "F Name"; those are listed below.

import type { ImportColumn } from "../importer";
import { classKey, plain, readDate, splitClassSection, tidyBloodGroup, tidyGender, tidyPhone } from "./tidy";

/** Columns School OS can put together from several columns of the file. */
export const PARTS: Record<string, { key: string; label: string; names: string[] }[]> = {
  fullName: [
    { key: "firstName", label: "First name", names: ["first name", "fname", "given name", "student first name", "first"] },
    { key: "middleName", label: "Middle name", names: ["middle name", "mname", "student middle name", "middle"] },
    { key: "lastName", label: "Last name", names: ["last name", "surname", "lname", "family name", "student last name", "last"] },
  ],
};

/** Headings other software uses, beyond each import's own column names and aliases. */
const SAME_AS: Record<string, Record<string, string[]>> = {
  students: {
    fullName: ["student name", "stu name", "studentname", "name of student", "name of the student", "students name", "student full name", "pupil name", "candidate name", "name", "full name", "student"],
    className: ["class", "standard", "std", "grade", "class name", "batch", "course", "present class", "current class", "class studying", "admitted class", "class admitted"],
    sectionName: ["section", "sec", "division", "div", "section name"],
    classSection: ["class section", "class and section", "class & section", "class/section", "class-section", "class sec", "class-sec", "std div", "standard division", "class div"],
    dateOfBirth: ["dob", "d o b", "date of birth", "birth date", "birthdate", "dob dd mm yyyy", "date of birth dd mm yyyy", "student dob"],
    gender: ["gender", "sex", "boy girl", "m f"],
    guardianName: ["father name", "fathername", "father s full name", "fathers name", "father", "name of father", "father guardian name", "guardian name", "parent name", "parents name", "guardian", "father s name"],
    guardianRelation: ["relation", "relationship", "guardian relation", "relation with student"],
    guardianPhone: ["father mobile", "father mobile no", "father phone", "father contact", "father mob", "fathers mobile", "parent mobile", "parent phone", "parent contact", "guardian mobile", "guardian phone", "mobile", "mobile no", "mobile number", "phone", "phone no", "phone number", "contact", "contact no", "contact number", "sms mobile", "sms number", "primary mobile", "whatsapp", "whatsapp number", "mob no", "cell"],
    motherName: ["mother name", "mothername", "mothers name", "mother", "name of mother", "mother s name"],
    motherPhone: ["mother mobile", "mother mobile no", "mother phone", "mother contact", "mother mob", "mothers mobile", "secondary mobile", "alternate mobile", "alternate number", "other mobile"],
    admissionNo: ["admission no", "admission number", "adm no.", "admission num", "stu adm no", "student admission no", "adm no", "admn no", "adm number", "admission id", "enrollment no", "enrolment no", "enrollment number", "sr no", "s r no", "scholar no", "scholar number", "gr no", "g r no", "general register no", "reg no", "registration no", "registration number", "student id", "student code", "admno"],
    rollNo: ["roll no", "roll number", "roll", "class roll no", "rollno"],
    admissionDate: ["admission date", "date of admission", "doa", "admitted on", "joining date", "date of joining"],
    bloodGroup: ["blood group", "blood", "bloodgroup", "b group"],
    category: ["category", "caste category", "social category", "caste"],
    religion: ["religion"],
    motherTongue: ["mother tongue", "language", "home language"],
    address: ["address", "residential address", "permanent address", "present address", "correspondence address", "full address", "home address"],
    aadhaar: ["aadhaar", "aadhar", "aadhaar no", "aadhar no", "aadhaar number", "aadhar number", "uid", "uid no", "student aadhaar", "aadhaar card no"],
    apaarId: ["apaar", "apaar id", "apaar no", "abc id"],
    pen: ["pen", "pen no", "student pen", "pen number"],
    previousSchool: ["previous school", "last school", "school last attended", "previous school name"],
    siblingAdmissionNo: ["sibling admission no", "sibling adm no", "sibling", "brother sister admission no"],
  },
  staff: {
    fullName: ["name", "staff name", "employee name", "emp name", "teacher name", "full name", "name of employee", "name of staff"],
    phone: ["mobile", "mobile no", "mobile number", "phone", "phone no", "contact", "contact no", "contact number", "mob no", "whatsapp"],
    designation: ["designation", "post", "role", "position", "job title", "desig"],
    department: ["department", "dept", "department name", "subject department"],
    joiningDate: ["joining date", "date of joining", "doj", "appointment date", "date of appointment", "joined on"],
    gender: ["gender", "sex"],
    email: ["email", "email id", "e mail", "mail id", "email address"],
    dateOfBirth: ["dob", "date of birth", "birth date", "d o b"],
    bloodGroup: ["blood group", "blood"],
    employmentType: ["employment type", "emp type", "type of employment", "nature of appointment", "staff type", "appointment type"],
    qualification: ["qualification", "qualifications", "education", "educational qualification"],
    experienceYears: ["experience", "exp", "years of experience", "total experience", "experience years"],
    address: ["address", "current address", "present address", "residential address"],
    aadhaar: ["aadhaar", "aadhar", "aadhaar no", "aadhar no", "uid"],
    createLogin: ["create login", "login", "give login"],
  },
  departments: {
    name: ["department", "department name", "dept", "dept name", "name"],
    head: ["hod", "head", "head of department", "hod staff id", "head staff id"],
  },
};

/** What kind of value a column holds, for the tidy-ups and for matching by content. */
export type ValueType = "name" | "phone" | "date" | "gender" | "blood" | "digits" | "yesno" | "class" | "section" | "lookup" | "text";

const TYPES: Record<string, ValueType> = {
  fullName: "name", guardianName: "name", motherName: "name", firstName: "name", middleName: "name", lastName: "name",
  guardianPhone: "phone", motherPhone: "phone", phone: "phone",
  dateOfBirth: "date", admissionDate: "date", joiningDate: "date",
  gender: "gender", bloodGroup: "blood", aadhaar: "digits", pen: "digits", createLogin: "yesno",
  className: "class", sectionName: "section", designation: "lookup", department: "lookup",
};

export function valueType(kindKey: string, key: string): ValueType {
  if (kindKey === "departments") return key === "name" ? "text" : "text";
  if (TYPES[key]) return TYPES[key];
  const k = key.toLowerCase();
  if (k.includes("date")) return "date";
  if (k.includes("phone") || k.includes("mobile")) return "phone";
  return "text";
}

/** The names a column answers to: its label, key, aliases and the headings other software uses. */
export function namesFor(kindKey: string, col: { key: string; label: string; aliases?: string[] }): string[] {
  return [...new Set([col.label, col.key, ...(col.aliases ?? []), ...(SAME_AS[kindKey]?.[col.key] ?? [])].map(plain).filter(Boolean))];
}

type Target = { key: string; names: string[] };

function targets(kindKey: string, columns: ImportColumn[]): Target[] {
  const out: Target[] = columns.map((c) => ({ key: c.key, names: namesFor(kindKey, c) }));
  if (columns.some((c) => c.key === "fullName")) for (const p of PARTS.fullName) out.push({ key: p.key, names: p.names.map(plain) });
  if (columns.some((c) => c.key === "className") && SAME_AS[kindKey]?.classSection) out.push({ key: "classSection", names: SAME_AS[kindKey].classSection.map(plain) });
  return out;
}

/** Letters to add, drop, change or swap to turn one heading into another (two swapped letters count once). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** A heading with a typo or two ("Admision No", "Fathers Mobil") still fits: about one slip per six letters. */
export function closeEnough(h: string, n: string): boolean {
  if (n.length < 6 || h.length < 6) return false;
  return editDistance(h, n) <= Math.max(1, Math.floor(n.length / 6));
}

/** How well a heading fits a column: 3 for the same words, 2 when it starts with them, 1 when it contains them or is a near spelling. */
function fit(heading: string, names: string[]): number {
  const h = plain(heading);
  if (!h) return 0;
  let best = 0;
  for (const n of names) {
    if (h === n) return 3;
    if (n.length >= 4 && h.startsWith(n)) best = Math.max(best, 2);
    else if (n.length >= 5 && h.includes(n)) best = Math.max(best, 1);
    else if (closeEnough(h, n)) best = Math.max(best, 1);
  }
  return best;
}

/** The row (from 0) that holds the headings: old software often puts the school's name and a title above them. */
export function findHeaderRow(rows: string[][], kinds: { key: string; columns: ImportColumn[] }[]): number {
  let best = 0;
  let bestScore = 0;
  const all = kinds.flatMap((k) => targets(k.key, k.columns).map((t) => t.names));
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const cells = rows[r].filter((c) => c.trim());
    if (cells.length < 2) continue;
    const score = cells.filter((c) => all.some((names) => fit(c, names) >= 2)).length;
    if (score > bestScore) { best = r; bestScore = score; }
  }
  return bestScore >= 2 ? best : 0;
}

/** Which import a sheet is, from its headings: the one whose columns it matches best. */
export function guessKind(headers: string[], kinds: { key: string; columns: ImportColumn[] }[]): { key: string; score: number } | null {
  let best: { key: string; score: number } | null = null;
  for (const k of kinds) {
    const m = matchColumns(k.key, k.columns, headers, []);
    let score = 0;
    for (const c of k.columns) if (m[c.key]?.length) score += c.required ? 3 : 1;
    if (score > (best?.score ?? 0)) best = { key: k.key, score };
  }
  return best && best.score >= 3 ? best : null;
}

/** School OS column key → the file's column numbers (several when they are joined, as first, middle and last name). */
export type ColumnMatch = Record<string, number[]>;

/**
 * Matches the file's headings to the import's columns. Each heading is used
 * once, best fits first. Required columns still missing are then looked for
 * by their values: ten-digit mobiles, dates, Male and Female; then optional
 * ones whose kind of value nothing else in the import holds (a blood group).
 */
export function matchColumns(kindKey: string, columns: ImportColumn[], headers: string[], sample: string[][]): ColumnMatch {
  const ts = targets(kindKey, columns);
  const pairs: { key: string; col: number; score: number }[] = [];
  headers.forEach((h, col) => ts.forEach((t) => { const s = fit(h, t.names); if (s) pairs.push({ key: t.key, col, score: s }); }));
  pairs.sort((a, b) => b.score - a.score || a.col - b.col);
  const used = new Set<number>();
  const got: Record<string, number> = {};
  for (const p of pairs) {
    if (used.has(p.col) || got[p.key] !== undefined) continue;
    // A loose fit ("Contact address" for a phone) is kept only when the values agree.
    if (p.score < 3 && sample.length && !valuesAgree(valueType(kindKey, p.key), p.col, sample)) continue;
    got[p.key] = p.col;
    used.add(p.col);
  }
  const match: ColumnMatch = {};
  for (const c of columns) if (got[c.key] !== undefined) match[c.key] = [got[c.key]];
  // First, middle and last name in their own columns make the full name.
  if (!match.fullName && got.firstName !== undefined) {
    match.fullName = ["firstName", "middleName", "lastName"].filter((k) => got[k] !== undefined).map((k) => got[k]);
  }
  // One "Class & Section" column fills both.
  if (got.classSection !== undefined) {
    match.className ??= [got.classSection];
    match.sectionName ??= [got.classSection];
  }
  if (sample.length) {
    for (const c of columns) {
      if (match[c.key] || !c.required) continue;
      const col = byContent(valueType(kindKey, c.key), c.key, headers.length, sample, used);
      if (col !== null) { match[c.key] = [col]; used.add(col); }
    }
    // Optional columns too, by their values alone, but only where nothing else in this
    // import holds that kind of value (one gender, one blood group, one phone; never which
    // of two phones, and never a date) and nearly every value fits. The person still sees and checks it.
    const typeCount = new Map<ValueType, number>();
    for (const c of columns) typeCount.set(valueType(kindKey, c.key), (typeCount.get(valueType(kindKey, c.key)) ?? 0) + 1);
    for (const c of columns) {
      const type = valueType(kindKey, c.key);
      if (match[c.key] || c.required || !BY_VALUE_ALONE.has(type) || typeCount.get(type) !== 1) continue;
      const col = byContent(type, c.key, headers.length, sample, used, { share: 0.9, least: 3 });
      if (col !== null) { match[c.key] = [col]; used.add(col); }
    }
  }
  return match;
}

/** Kinds of value clear enough to match an optional column by its values alone (a date could be any date). */
const BY_VALUE_ALONE: ReadonlySet<ValueType> = new Set(["gender", "blood", "phone"]);

function testFor(type: ValueType): ((v: string) => boolean) | null {
  return type === "phone" ? (v) => /^[6-9]\d{9}$/.test(tidyPhone(v)) :
    type === "date" ? (v) => readDate(v) !== null :
    type === "gender" ? (v) => ["Male", "Female", "Other"].includes(tidyGender(v)) :
    type === "blood" ? (v) => /^(A|B|AB|O)[+-]$/.test(tidyBloodGroup(v)) :
    type === "class" ? (v) => classKey(v) !== null || splitClassSection(v) !== null : null;
}

function valuesAgree(type: ValueType, col: number, sample: string[][]) {
  const test = testFor(type);
  if (!test) return true;
  const vals = sample.map((r) => (r[col] ?? "").trim()).filter(Boolean);
  return vals.length < 3 || vals.filter(test).length / vals.length >= 0.3;
}

function byContent(type: ValueType, key: string, width: number, sample: string[][], used: Set<number>, need = { share: 0.7, least: 2 }): number | null {
  const test = testFor(type);
  if (!test) return null;
  let best: { col: number; share: number; year: number } | null = null;
  for (let col = 0; col < width; col++) {
    if (used.has(col)) continue;
    const vals = sample.map((r) => (r[col] ?? "").trim()).filter(Boolean);
    if (vals.length < need.least) continue;
    const share = vals.filter(test).length / vals.length;
    if (share < need.share) continue;
    // Of two date columns, the date of birth is the earlier one.
    const year = type === "date" ? Math.min(...vals.map((v) => readDate(v)?.getUTCFullYear() ?? 9999)) : 0;
    const better = !best || share > best.share + 0.05 || (type === "date" && key === "dateOfBirth" && year < best.year);
    if (better) best = { col, share, year };
  }
  return best?.col ?? null;
}
