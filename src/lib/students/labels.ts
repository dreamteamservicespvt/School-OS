// Words for student records, shared by screens and rules (safe in the browser).
// Status changes follow 03-student-management.md §2 "Student status and allowed changes".

export const STUDENT_STATUSES = ["ADMITTED", "ACTIVE", "PROMOTED", "TRANSFERRED", "WITHDRAWN", "GRADUATED", "ALUMNI", "INACTIVE"] as const;
export type StudentStatusKey = (typeof STUDENT_STATUSES)[number];

export const STATUS_LABEL: Record<StudentStatusKey, string> = {
  ADMITTED: "Admitted",
  ACTIVE: "Active",
  PROMOTED: "Promoted",
  TRANSFERRED: "Transferred",
  WITHDRAWN: "Withdrawn",
  GRADUATED: "Graduated",
  ALUMNI: "Alumni",
  INACTIVE: "Inactive",
};

export const STATUS_TONE: Record<StudentStatusKey, "success" | "brand" | "neutral" | "warning" | "danger"> = {
  ADMITTED: "brand",
  ACTIVE: "success",
  PROMOTED: "brand",
  TRANSFERRED: "neutral",
  WITHDRAWN: "neutral",
  GRADUATED: "brand",
  ALUMNI: "neutral",
  INACTIVE: "warning",
};

/** Students who are still in school: they count in class strength and appear in the default list. */
export const STUDYING: readonly StudentStatusKey[] = ["ADMITTED", "ACTIVE", "PROMOTED"];

/**
 * Changes a person may make on the Student Profile. Promotion and leaving
 * happen only on their own pages; Admission makes Admitted students.
 * "approval" means the change waits in Approvals (re-admission).
 */
export const PROFILE_CHANGES: Record<StudentStatusKey, { to: StudentStatusKey; approval?: boolean }[]> = {
  ADMITTED: [],
  ACTIVE: [{ to: "INACTIVE" }],
  PROMOTED: [],
  INACTIVE: [{ to: "ACTIVE" }],
  TRANSFERRED: [{ to: "ACTIVE", approval: true }],
  WITHDRAWN: [{ to: "ACTIVE", approval: true }],
  GRADUATED: [],
  ALUMNI: [],
};

/** Where each change is made, for the read-only table in Student Settings. */
export const STATUS_RULES: { from: string; to: string; how: string }[] = [
  { from: "Lead, Applicant", to: "Admitted", how: "Admission Management only" },
  { from: "Admitted", to: "Active", how: "Automatically on the admission date" },
  { from: "Active", to: "Promoted, Transferred, Withdrawn, Graduated", how: "Promotion page or Leaving & Alumni page only" },
  { from: "Active", to: "Inactive", how: "Student Profile, with a reason" },
  { from: "Promoted", to: "Active (in the new year)", how: "Automatically when the new year starts" },
  { from: "Inactive", to: "Active", how: "Student Profile, with a reason" },
  { from: "Graduated", to: "Alumni", how: "Leaving & Alumni" },
  { from: "Transferred, Withdrawn", to: "Active (re-admission)", how: "Student Profile, with a reason and approval" },
];

export const GENDERS = ["Male", "Female", "Other"] as const;
export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
export const CATEGORIES = ["General", "OBC", "SC", "ST", "EWS"] as const;
export const RELATIONS = ["Father", "Mother", "Guardian", "Other"] as const;
export const LANGUAGES: { value: string; label: string }[] = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "te", label: "Telugu" },
  { value: "ta", label: "Tamil" },
  { value: "kn", label: "Kannada" },
  { value: "ml", label: "Malayalam" },
  { value: "mr", label: "Marathi" },
  { value: "bn", label: "Bengali" },
];
export const languageLabel = (code: string) => LANGUAGES.find((l) => l.value === code)?.label ?? code;

export const BEHAVIOUR_KINDS = ["incident", "warning", "suspension", "reward", "recognition"] as const;
export type BehaviourKind = (typeof BEHAVIOUR_KINDS)[number];
export const BEHAVIOUR_KIND_LABEL: Record<BehaviourKind, string> = {
  incident: "Incident",
  warning: "Warning",
  suspension: "Suspension",
  reward: "Reward",
  recognition: "Recognition",
};
export const isPositive = (kind: string) => kind === "reward" || kind === "recognition";

export const CERTIFICATE_LABEL: Record<"TC" | "BONAFIDE" | "STUDY" | "CHARACTER" | "MIGRATION", string> = {
  TC: "Transfer certificate (TC)",
  BONAFIDE: "Bonafide certificate",
  STUDY: "Study certificate",
  CHARACTER: "Conduct / character certificate",
  MIGRATION: "Migration certificate",
};
export const CERTIFICATE_SHORT: Record<keyof typeof CERTIFICATE_LABEL, string> = {
  TC: "TC",
  BONAFIDE: "Bonafide",
  STUDY: "Study",
  CHARACTER: "Character",
  MIGRATION: "Migration",
};
export const CERT_STATUS_LABEL = { REQUESTED: "Requested", APPROVED: "Approved", ISSUED: "Issued", CANCELLED: "Cancelled" } as const;
export const CERT_STATUS_TONE = { REQUESTED: "warning", APPROVED: "brand", ISSUED: "success", CANCELLED: "neutral" } as const;

export const LEAVING_TYPE_LABEL = { TRANSFER: "Transfer", WITHDRAWAL: "Withdrawal", GRADUATION: "Graduation" } as const;
export const CLEARANCE_LABEL = { CLEAR: "Clear", PENDING: "Pending", WAIVER_ASKED: "Waiver asked", WAIVED: "Waived" } as const;
export const CLEARANCE_TONE = { CLEAR: "success", PENDING: "danger", WAIVER_ASKED: "warning", WAIVED: "brand" } as const;

export const DECISION_LABEL = { PROMOTE: "Promote", DETAIN: "Detain", LEAVING: "Leaving" } as const;

export const CONSENT_TYPES: { key: string; label: string }[] = [
  { key: "data", label: "Data consent" },
  { key: "photo", label: "Photo consent" },
];
export const CONSENT_STATUS_LABEL = { REQUESTED: "Requested", GIVEN: "Given", WITHDRAWN: "Withdrawn", NONE: "Not given" } as const;

export const CAREER_KINDS: { key: string; label: string }[] = [
  { key: "note", label: "Career counselling note" },
  { key: "entrance-exam", label: "Entrance-exam guidance" },
  { key: "college-application", label: "College application" },
  { key: "scholarship", label: "Scholarship information" },
  { key: "interest", label: "Interest and aptitude" },
];
export const APPLICATION_STATUSES = ["Planned", "Applied", "Admitted", "Not admitted", "Joined"] as const;

/** Fields a bulk field update may change (03 §2, Student List actions). */
export const BULK_FIELDS: { key: string; label: string; help: string }[] = [
  { key: "rollNo", label: "Roll number", help: "A whole number, unique in the section." },
  { key: "admissionNo", label: "Admission number", help: "Unique in the school; the old number is kept in the history." },
  { key: "phone", label: "Primary parent's phone", help: "10-digit Indian mobile number." },
  { key: "address", label: "Address", help: "House, street and locality." },
  { key: "bloodGroup", label: "Blood group", help: "For example B+." },
  { key: "category", label: "Category", help: "General, OBC, SC, ST, EWS or the school's own." },
  { key: "apaarId", label: "APAAR ID", help: "12 digits." },
  { key: "pen", label: "PEN", help: "11 digits." },
];

/** Columns the Student List can show (Student Settings, list display). */
export const LIST_COLUMNS: { key: string; label: string }[] = [
  { key: "photo", label: "Photo" },
  { key: "admissionNo", label: "Admission number" },
  { key: "classSection", label: "Class and section" },
  { key: "rollNo", label: "Roll number" },
  { key: "guardian", label: "Father's or guardian's name" },
  { key: "phone", label: "Phone" },
  { key: "status", label: "Status" },
  { key: "gender", label: "Gender" },
  { key: "category", label: "Category" },
  { key: "dateOfBirth", label: "Date of birth" },
];

/** Fields the school can make required on the student form (Student Settings). */
export const OPTIONAL_FORM_FIELDS: { key: string; label: string }[] = [
  { key: "bloodGroup", label: "Blood group" },
  { key: "category", label: "Category" },
  { key: "religion", label: "Religion" },
  { key: "motherTongue", label: "Mother tongue" },
  { key: "address", label: "Address" },
  { key: "aadhaar", label: "Aadhaar number" },
  { key: "previousSchool", label: "Previous school" },
];

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}
