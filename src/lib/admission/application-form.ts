// Reads the application form (02 §2 "Form fields: New application"), the same
// way at the counter and on the online form, so the checks never differ.
import "server-only";

import { AdmissionProblem, dateOf, emailOf, id, maybe, mobileOf, need, str } from "./act";
import { CATEGORIES } from "./settings";
import { GENDERS, RELATIONS, type ApplicationInput } from "./applications";

export function readApplicationForm(fd: FormData, opts: { restricted: boolean }): ApplicationInput {
  const gender = str(fd, "gender");
  if (!(GENDERS as readonly string[]).includes(gender)) throw new AdmissionProblem("Choose the child's gender.", "gender");
  const fatherName = maybe(fd, "fatherName", "Father's name", 120);
  const motherName = maybe(fd, "motherName", "Mother's name", 120);
  const guardianName = maybe(fd, "guardianName", "Guardian's name", 120);
  if (!fatherName && !motherName && !guardianName) throw new AdmissionProblem("Give at least one parent's or guardian's name.", "fatherName");
  const relation = str(fd, "guardianRelation");
  if (guardianName && relation && !(RELATIONS as readonly string[]).includes(relation)) throw new AdmissionProblem("Choose the guardian's relation from the list.", "guardianRelation");
  const category = str(fd, "category");
  if (category && !(CATEGORIES as readonly string[]).includes(category)) throw new AdmissionProblem("Choose a category from the list.", "category");
  const altPhone = str(fd, "altPhone") ? mobileOf(fd, "altPhone", "Other phone") : null;
  const aadhaar = opts.restricted ? str(fd, "aadhaar").replace(/\s/g, "") : "";
  if (aadhaar && !/^\d{12}$/.test(aadhaar)) throw new AdmissionProblem("Aadhaar has 12 digits.", "aadhaar");
  return {
    classId: id(fd, "classId", "class"),
    yearId: id(fd, "yearId", "admission year"),
    firstName: need(fd, "firstName", "Child's first name", 80),
    lastName: maybe(fd, "lastName", "Last name", 80),
    dateOfBirth: dateOf(fd, "dateOfBirth", "Date of birth"),
    gender,
    fatherName,
    motherName,
    guardianName,
    guardianRelation: guardianName ? relation || "Guardian" : null,
    phone: mobileOf(fd, "phone", "Parent's phone"),
    altPhone,
    email: emailOf(fd, "email"),
    address: need(fd, "address", "Address", 400),
    previousSchool: maybe(fd, "previousSchool", "Previous school", 150),
    previousClass: maybe(fd, "previousClass", "Last class", 40),
    previousMarks: maybe(fd, "previousMarks", "Marks or %", 40),
    preferences: {
      secondLanguage: maybe(fd, "secondLanguage", "Second language", 40),
      transportNeeded: str(fd, "transportNeeded") === "on",
      transportStop: maybe(fd, "transportStop", "Stop", 80),
      hostelNeeded: str(fd, "hostelNeeded") === "on",
    },
    category: category || null,
    religion: maybe(fd, "religion", "Religion", 40),
    motherTongue: maybe(fd, "motherTongue", "Mother tongue", 40),
    occupation: maybe(fd, "occupation", "Occupation", 80),
    aadhaar: aadhaar || null,
  };
}
