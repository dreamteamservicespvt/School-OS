// Reads the application form (02 §2 "Form fields: New application"), the same
// way at the counter and on the online form, so the checks never differ.
// Every problem is collected and shown at once, next to its field (PEOPLE-07).
import "server-only";

import { collector, dateOf, emailOf, id, maybe, mobileOf, need, str } from "./act";
import { CATEGORIES } from "./settings";
import { GENDERS, RELATIONS, type ApplicationInput } from "./applications";

/** `extra` adds the caller's own checks (consent, the sender's name) to the same list. */
export function readApplicationForm(fd: FormData, opts: { restricted: boolean; extra?: (c: ReturnType<typeof collector>) => void }): ApplicationInput {
  const c = collector();
  const t = c.take;
  const classId = t(() => id(fd, "classId", "class"), "");
  const yearId = t(() => id(fd, "yearId", "admission year"), "");
  const firstName = t(() => need(fd, "firstName", "Child's first name", 80), "");
  const lastName = t(() => maybe(fd, "lastName", "Last name", 80), null);
  const dateOfBirth = t(() => dateOf(fd, "dateOfBirth", "Date of birth"), new Date(0));
  const gender = str(fd, "gender");
  if (!(GENDERS as readonly string[]).includes(gender)) c.add("gender", "Choose the child's gender.");
  const fatherName = t(() => maybe(fd, "fatherName", "Father's name", 120), null);
  const motherName = t(() => maybe(fd, "motherName", "Mother's name", 120), null);
  const guardianName = t(() => maybe(fd, "guardianName", "Guardian's name", 120), null);
  if (!fatherName && !motherName && !guardianName && !c.errors.fatherName && !c.errors.motherName && !c.errors.guardianName) c.add("fatherName", "Give at least one parent's or guardian's name.");
  const relation = str(fd, "guardianRelation");
  if (guardianName && relation && !(RELATIONS as readonly string[]).includes(relation)) c.add("guardianRelation", "Choose the guardian's relation from the list.");
  const phone = t(() => mobileOf(fd, "phone", "Parent's phone"), "");
  const altPhone = str(fd, "altPhone") ? t(() => mobileOf(fd, "altPhone", "Other phone"), null) : null;
  const email = t(() => emailOf(fd, "email"), null);
  const address = t(() => need(fd, "address", "Address", 400), "");
  const category = str(fd, "category");
  if (category && !(CATEGORIES as readonly string[]).includes(category)) c.add("category", "Choose a category from the list.");
  const aadhaar = opts.restricted ? str(fd, "aadhaar").replace(/\s/g, "") : "";
  if (aadhaar && !/^\d{12}$/.test(aadhaar)) c.add("aadhaar", "Aadhaar has 12 digits.");
  const input: ApplicationInput = {
    classId,
    yearId,
    firstName,
    lastName,
    dateOfBirth,
    gender,
    fatherName,
    motherName,
    guardianName,
    guardianRelation: guardianName ? relation || "Guardian" : null,
    phone,
    altPhone,
    email,
    address,
    previousSchool: t(() => maybe(fd, "previousSchool", "Previous school", 150), null),
    previousClass: t(() => maybe(fd, "previousClass", "Last class", 40), null),
    previousMarks: t(() => maybe(fd, "previousMarks", "Marks or %", 40), null),
    preferences: {
      secondLanguage: t(() => maybe(fd, "secondLanguage", "Second language", 40), null),
      transportNeeded: str(fd, "transportNeeded") === "on",
      transportStop: t(() => maybe(fd, "transportStop", "Stop", 80), null),
      hostelNeeded: str(fd, "hostelNeeded") === "on",
    },
    category: category || null,
    religion: t(() => maybe(fd, "religion", "Religion", 40), null),
    motherTongue: t(() => maybe(fd, "motherTongue", "Mother tongue", 40), null),
    occupation: t(() => maybe(fd, "occupation", "Occupation", 80), null),
    aadhaar: aadhaar || null,
  };
  opts.extra?.(c);
  c.done();
  return input;
}
