// Fields the Student List can export (P8). Restricted ones only for those who see them.
export const EXPORT_FIELDS = [
  { key: "admissionNo", label: "Admission number", default: true },
  { key: "name", label: "Name", default: true },
  { key: "class", label: "Class and section", default: true },
  { key: "rollNo", label: "Roll number", default: true },
  { key: "dateOfBirth", label: "Date of birth", default: true },
  { key: "gender", label: "Gender", default: true },
  { key: "guardian", label: "Father's or guardian's name", default: true },
  { key: "phone", label: "Phone", default: true },
  { key: "status", label: "Status", default: true },
  { key: "category", label: "Category", default: false },
  { key: "bloodGroup", label: "Blood group", default: false },
  { key: "address", label: "Address", default: false },
  { key: "joiningDate", label: "Admission date", default: false },
  { key: "apaarId", label: "APAAR ID", default: false, restricted: true },
  { key: "pen", label: "PEN", default: false, restricted: true },
] as { key: string; label: string; default: boolean; restricted?: boolean }[];
