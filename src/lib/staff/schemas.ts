// Form checks for staff records, in plain words (P3, P7). Shared by Add
// Staff, the profile's edit sections and their tests.
import { z } from "zod";
import { checkbox, dateField, indianMobile, optionalDate, optionalEmail, optionalText, text } from "../forms";
import { BLOOD_GROUPS, EMPLOYMENT_TYPES, GENDERS } from "./settings";

/** The same rule as checkAadhaar() in staff.ts, kept here so the form schema needs no server import. */
export function aadhaarProblem(v: string): string | null {
  const d = v.replace(/\s+/g, "");
  if (!/^\d{12}$/.test(d)) return `Aadhaar has ${d.replace(/\D/g, "").length} digits. It must have 12 digits.`;
  if (/^[01]/.test(d)) return "Aadhaar numbers do not start with 0 or 1. Check the number.";
  return null;
}

const optionalChoice = (list: readonly string[], label: string) =>
  z.string().trim().refine((v) => v === "" || list.includes(v), { message: `Choose a ${label.toLowerCase()} from the list.` }).transform((v) => (v === "" ? null : v));
const optionalUuid = z.string().trim().refine((v) => v === "" || /^[0-9a-f-]{36}$/i.test(v), { message: "Choose from the list." }).transform((v) => (v === "" ? null : v));
const optionalYears = z.string().trim().refine((v) => v === "" || (/^\d{1,2}$/.test(v) && Number(v) < 60), { message: "Experience must be whole years, like 6." }).transform((v) => (v === "" ? null : Number(v)));
const notFuture = () => (d: Date | null) => !d || d.getTime() <= Date.now();

export const detailsSchema = z.object({
  fullName: text("Full name", 120).refine((v) => /[A-Za-zऀ-෿]/.test(v), { message: "Full name must have letters." }),
  phone: indianMobile("Phone"),
  designation: text("Designation", 80),
  departmentId: optionalUuid,
  joiningDate: dateField("Joining date"),
  gender: optionalChoice(GENDERS, "gender").default(""),
  email: optionalEmail(),
  staffCode: optionalText("Staff ID", 30),
  dateOfBirth: optionalDate("Date of birth").refine(notFuture(), { message: "Date of birth cannot be in the future." }),
  bloodGroup: optionalChoice(BLOOD_GROUPS, "blood group").default(""),
  // Checked at step 1, not only at "Create staff" (CAMPUS2-03).
  aadhaar: optionalText("Aadhaar", 14).superRefine((v, c) => { const why = v ? aadhaarProblem(v) : null; if (why) c.addIssue({ code: "custom", message: why }); }),
  address: optionalText("Current address", 300),
  permanentAddress: optionalText("Permanent address", 300),
  qualification: optionalText("Qualifications", 200),
  experienceYears: optionalYears,
  employmentType: z.string().trim().refine((v) => (EMPLOYMENT_TYPES as readonly string[]).includes(v), { message: "Choose an employment type." }),
  reportingToId: optionalUuid,
  campusId: optionalUuid,
  phoneVerified: checkbox(),
  emailVerified: checkbox(),
}).superRefine((v, ctx) => {
  if (v.dateOfBirth && v.joiningDate && v.dateOfBirth >= v.joiningDate) ctx.addIssue({ code: "custom", path: ["dateOfBirth"], message: "Date of birth must be before the joining date." });
  if (v.dateOfBirth && Date.now() - v.dateOfBirth.getTime() < 16 * 365.25 * 864e5) ctx.addIssue({ code: "custom", path: ["dateOfBirth"], message: "Staff must be at least 16 years old. Check the date of birth." });
  if (v.emailVerified && !v.email) ctx.addIssue({ code: "custom", path: ["emailVerified"], message: "Add the email before marking it verified." });
});

export const personalSchema = z.object({
  fullName: text("Full name", 120),
  dateOfBirth: optionalDate("Date of birth").refine(notFuture(), { message: "Date of birth cannot be in the future." }),
  gender: optionalChoice(GENDERS, "gender").default(""),
  bloodGroup: optionalChoice(BLOOD_GROUPS, "blood group").default(""),
  address: optionalText("Current address", 300),
  permanentAddress: optionalText("Permanent address", 300),
  qualification: optionalText("Qualifications", 200),
  experienceYears: optionalYears,
});

export const contactSchema = z.object({
  phone: indianMobile("Phone"),
  email: optionalEmail(),
  phoneVerified: checkbox(),
  emailVerified: checkbox(),
  allowDuplicate: checkbox(),
});

export const employmentSchema = z.object({
  staffCode: text("Staff ID", 30),
  departmentId: optionalUuid,
  designation: text("Designation", 80),
  joiningDate: dateField("Joining date"),
  employmentType: z.string().trim().refine((v) => (EMPLOYMENT_TYPES as readonly string[]).includes(v), { message: "Choose an employment type." }),
  reportingToId: optionalUuid,
  campusId: optionalUuid,
});
