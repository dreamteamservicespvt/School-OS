// Reads the application form (02 §2 "Form fields: New application"), the same
// way at the counter and on the online form, so the checks never differ.
import "server-only";

import { AdmissionProblem, allProblems, dateOf, emailOf, id, maybe, mobileOf, need, str } from "./act";
import { CATEGORIES } from "./settings";
import { GENDERS, RELATIONS, type ApplicationInput } from "./applications";

export function readApplicationForm(fd: FormData, opts: { restricted: boolean }): ApplicationInput {
  // Every problem is collected and shown together (pattern P7, QA PEOPLE-07).
  const errors: Record<string, string> = {};
  const fail = (message: string, field: string) => { if (!errors[field]) errors[field] = message; };
  const read = <T,>(fn: () => T, fallback: T): T => {
    try { return fn(); } catch (e) {
      if (e instanceof AdmissionProblem && e.field) { fail(e.message, e.field); return fallback; }
      throw e;
    }
  };
  const gender = str(fd, "gender");
  if (!(GENDERS as readonly string[]).includes(gender)) fail("Choose the child's gender.", "gender");
  const fatherName = read(() => maybe(fd, "fatherName", "Father's name", 120), null);
  const motherName = read(() => maybe(fd, "motherName", "Mother's name", 120), null);
  const guardianName = read(() => maybe(fd, "guardianName", "Guardian's name", 120), null);
  if (!fatherName && !motherName && !guardianName) fail("Give at least one parent's or guardian's name.", "fatherName");
  const relation = str(fd, "guardianRelation");
  if (guardianName && relation && !(RELATIONS as readonly string[]).includes(relation)) fail("Choose the guardian's relation from the list.", "guardianRelation");
  const category = str(fd, "category");
  if (category && !(CATEGORIES as readonly string[]).includes(category)) fail("Choose a category from the list.", "category");
  const altPhone = str(fd, "altPhone") ? read(() => mobileOf(fd, "altPhone", "Other phone"), "") : null;
  const aadhaar = opts.restricted ? str(fd, "aadhaar").replace(/\s/g, "") : "";
  if (aadhaar && !/^\d{12}$/.test(aadhaar)) fail("Aadhaar has 12 digits.", "aadhaar");
  const classId = read(() => id(fd, "classId", "class"), "");
  const yearId = read(() => id(fd, "yearId", "admission year"), "");
  const firstName = read(() => need(fd, "firstName", "Child's first name", 80), "");
  const dateOfBirth = read(() => dateOf(fd, "dateOfBirth", "Date of birth"), new Date(NaN));
  if (dateOfBirth.getTime() > Date.now()) fail("Date of birth cannot be in the future.", "dateOfBirth");
  const phone = read(() => mobileOf(fd, "phone", "Parent's phone"), "");
  const address = read(() => need(fd, "address", "Address", 400), "");
  const out: ApplicationInput = {
    classId,
    yearId,
    firstName,
    lastName: read(() => maybe(fd, "lastName", "Last name", 80), null),
    dateOfBirth,
    gender,
    fatherName,
    motherName,
    guardianName,
    guardianRelation: guardianName ? relation || "Guardian" : null,
    phone,
    altPhone,
    email: read(() => emailOf(fd, "email"), null),
    address,
    previousSchool: read(() => maybe(fd, "previousSchool", "Previous school", 150), null),
    previousClass: read(() => maybe(fd, "previousClass", "Last class", 40), null),
    previousMarks: read(() => maybe(fd, "previousMarks", "Marks or %", 40), null),
    preferences: {
      secondLanguage: read(() => maybe(fd, "secondLanguage", "Second language", 40), null),
      transportNeeded: str(fd, "transportNeeded") === "on",
      transportStop: read(() => maybe(fd, "transportStop", "Stop", 80), null),
      hostelNeeded: str(fd, "hostelNeeded") === "on",
    },
    category: category || null,
    religion: read(() => maybe(fd, "religion", "Religion", 40), null),
    motherTongue: read(() => maybe(fd, "motherTongue", "Mother tongue", 40), null),
    occupation: read(() => maybe(fd, "occupation", "Occupation", 80), null),
    aadhaar: aadhaar || null,
  };
  if (Object.keys(errors).length) throw allProblems(errors);
  return out;
}
