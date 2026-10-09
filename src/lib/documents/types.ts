// The documents a school designs in Settings, Document Designs: what each
// one is, its merge fields with sample values, and its ready-made text.
// Other modules fill the same merge fields when they print a real document.

export type Family = "money" | "letter" | "card" | "admit" | "report";

export type MergeField = { key: string; label: string; sample: string };

export type TableColumn = { key: string; label: string; align?: "left" | "right" | "center" };

export type DocType = {
  key: string;
  label: string;
  group: "Fees" | "Certificates" | "ID cards" | "Exams" | "Staff" | "Front office" | "Letters";
  family: Family;
  /** Which module prints it. */
  usedBy: string;
  title: string;
  fields: MergeField[];
  /** Merge fields shown in the details block (money, card, admit, report) by default. */
  defaultFields: string[];
  /** Ready text for letters and certificates, with {{merge_field}} markers. */
  defaultBody?: string;
  /** For certificates like the TC: merge fields shown as numbered rows. */
  defaultTable?: string[];
  /** Columns of the marks or exam table (admit, report). */
  columns?: TableColumn[];
  sampleRows?: Record<string, string>[];
  sampleLines?: { label: string; amountPaise: number; note?: string; kind?: "earning" | "deduction" }[];
  /** QR or barcode content, from a merge field. */
  codeField?: string;
  defaultPaper: "A4" | "A5";
};

const f = (key: string, label: string, sample: string): MergeField => ({ key, label, sample });

/** Every document gets these. */
export const SCHOOL_FIELDS: MergeField[] = [
  f("school_name", "School name", "Sunrise Public School"),
  f("school_address", "School address", "Plot 12, Madhapur, Hyderabad, Telangana 500081"),
  f("school_phone", "School phone", "040 2345 6789"),
  f("school_email", "School email", "office@sunrise.school"),
  f("school_website", "School website", "sunrise.school"),
  f("board", "Board", "CBSE"),
  f("affiliation_number", "Affiliation number", "3630123"),
  f("school_code", "School code", "SPS"),
  f("gstin", "GSTIN", "36AABCS1234F1Z5"),
  f("campus_name", "Campus", "Main Campus"),
  f("academic_year", "Academic year", "2026-27"),
  f("today", "Today's date", "09-10-2026"),
];

const STUDENT: MergeField[] = [
  f("student_name", "Student name", "Aarav Sharma"),
  f("admission_no", "Admission number", "SPS/2021/0451"),
  f("class_section", "Class and section", "Class 5 A"),
  f("roll_no", "Roll number", "12"),
  f("date_of_birth", "Date of birth", "14-03-2016"),
  f("dob_in_words", "Date of birth in words", "Fourteenth March Two Thousand Sixteen"),
  f("gender", "Gender", "Male"),
  f("father_name", "Father's name", "Rajesh Sharma"),
  f("mother_name", "Mother's name", "Sunita Sharma"),
  f("guardian_name", "Guardian's name", "Rajesh Sharma"),
  f("guardian_phone", "Guardian's phone", "98765 43210"),
  f("address", "Address", "Flat 302, Lake View Apartments, Kondapur, Hyderabad"),
  f("blood_group", "Blood group", "B+"),
  f("admission_date", "Date of admission", "02-06-2021"),
  f("son_daughter", "son / daughter (from gender)", "son"),
  f("his_her", "his / her (from gender)", "his"),
  f("he_she", "he / she (from gender)", "he"),
];

const STAFF: MergeField[] = [
  f("staff_name", "Staff name", "Meena Iyer"),
  f("staff_code", "Staff ID", "SPS-T-024"),
  f("designation", "Designation", "TGT Mathematics"),
  f("department", "Department", "Mathematics"),
  f("joining_date", "Date of joining", "01-06-2019"),
  f("leaving_date", "Date of leaving", "31-03-2026"),
  f("blood_group", "Blood group", "O+"),
  f("staff_phone", "Phone", "98480 12345"),
];

const pick = (list: MergeField[], keys: string[]) => list.filter((x) => keys.includes(x.key));

export const DOC_TYPES: readonly DocType[] = [
  {
    key: "fee-receipt", label: "Fee receipt", group: "Fees", family: "money", usedBy: "Fee Management", title: "Fee Receipt", defaultPaper: "A5",
    fields: [...STUDENT, f("receipt_no", "Receipt number", "SPS/2026/00123"), f("receipt_date", "Receipt date", "09-10-2026"), f("payment_mode", "Payment mode", "UPI"), f("reference_no", "Reference number", "UPI 6281 4472 0193"), f("received_by", "Received by", "Priya Sharma"), f("balance_due", "Balance due", "₹12,500")],
    defaultFields: ["receipt_no", "receipt_date", "student_name", "admission_no", "class_section", "father_name", "payment_mode", "reference_no"],
    sampleLines: [{ label: "Tuition fee (Term 2)", amountPaise: 1850000 }, { label: "Computer lab fee", amountPaise: 150000 }, { label: "Late fee", amountPaise: 20000 }],
    codeField: "receipt_no",
  },
  {
    key: "fee-invoice", label: "Fee invoice", group: "Fees", family: "money", usedBy: "Fee Management", title: "Fee Invoice", defaultPaper: "A4",
    fields: [...STUDENT, f("invoice_no", "Invoice number", "INV/2026/00881"), f("invoice_date", "Invoice date", "01-10-2026"), f("due_date", "Due date", "15-10-2026")],
    defaultFields: ["invoice_no", "invoice_date", "due_date", "student_name", "admission_no", "class_section", "father_name"],
    sampleLines: [{ label: "Tuition fee (Term 2)", amountPaise: 1850000 }, { label: "Annual fee", amountPaise: 500000 }],
  },
  {
    key: "tax-invoice", label: "Tax invoice", group: "Fees", family: "money", usedBy: "Fee Management", title: "Tax Invoice", defaultPaper: "A4",
    fields: [...STUDENT, f("invoice_no", "Invoice number", "TI/2026/00042"), f("invoice_date", "Invoice date", "09-10-2026"), f("place_of_supply", "Place of supply", "Telangana (36)"), f("tax_total", "Tax included", "₹457.63")],
    defaultFields: ["invoice_no", "invoice_date", "gstin", "place_of_supply", "student_name", "admission_no", "class_section"],
    sampleLines: [{ label: "Uniform and kit (HSN 6211)", amountPaise: 300000, note: "GST 5% included: ₹142.86" }, { label: "Summer camp", amountPaise: 206700, note: "GST 18% included: ₹315.31" }],
  },
  {
    key: "fee-certificate", label: "Fee certificate", group: "Fees", family: "letter", usedBy: "Fee Management", title: "Fee Certificate", defaultPaper: "A4",
    fields: [...STUDENT, f("certificate_no", "Certificate number", "FC/2026/0017"), f("fees_paid", "Fees paid", "₹74,000"), f("tuition_paid", "Tuition fee paid", "₹62,000"), f("financial_year", "Financial year", "2025-26")],
    defaultFields: [],
    defaultBody: "This is to certify that {{student_name}}, {{son_daughter}} of {{father_name}}, admission number {{admission_no}}, is a student of {{class_section}} in this school.\n\nDuring the financial year {{financial_year}}, {{fees_paid}} was paid as school fees, of which {{tuition_paid}} was tuition fee.\n\nThis certificate is issued on the request of the parent for income tax purposes.",
  },
  {
    key: "salary-slip", label: "Salary slip", group: "Staff", family: "money", usedBy: "Salary Management", title: "Salary Slip", defaultPaper: "A4",
    fields: [...STAFF, f("slip_month", "Month", "September 2026"), f("bank_account", "Bank account (last 4)", "XXXX4321"), f("pan", "PAN (masked)", "XXXXX1234X"), f("uan", "UAN", "1009 8765 4321"), f("days_paid", "Days paid", "30 of 30"), f("net_pay_words", "Net pay in words", "")],
    defaultFields: ["slip_month", "staff_name", "staff_code", "designation", "department", "bank_account", "uan", "days_paid"],
    sampleLines: [
      { label: "Basic", amountPaise: 3200000, kind: "earning" }, { label: "Dearness allowance", amountPaise: 960000, kind: "earning" }, { label: "House rent allowance", amountPaise: 640000, kind: "earning" },
      { label: "Provident Fund", amountPaise: 180000, kind: "deduction" }, { label: "Professional tax", amountPaise: 20000, kind: "deduction" },
    ],
  },
  {
    key: "transfer-certificate", label: "Transfer certificate", group: "Certificates", family: "letter", usedBy: "Student Management", title: "Transfer Certificate", defaultPaper: "A4",
    fields: [...STUDENT, f("tc_no", "TC number", "TC/2026/0031"), f("nationality", "Nationality", "Indian"), f("category", "Category", "General"), f("class_last_studied", "Class last studied", "Class 5"), f("last_exam_result", "Last examination and result", "Annual 2025-26, Passed"), f("promoted_to", "Promoted to", "Class 6"), f("fees_paid_upto", "Fees paid up to", "March 2026"), f("leaving_date", "Date of leaving", "10-04-2026"), f("reason", "Reason for leaving", "Parent's transfer"), f("conduct", "Conduct", "Good"), f("remarks", "Remarks", "None"), f("pen", "PEN", "21360812345"), f("apaar_id", "APAAR ID", "1234 5678 9012")],
    defaultFields: [],
    defaultBody: "Certified that the particulars below are as per the school's admission register.",
    defaultTable: ["tc_no", "student_name", "father_name", "mother_name", "nationality", "category", "date_of_birth", "dob_in_words", "admission_no", "admission_date", "class_last_studied", "last_exam_result", "promoted_to", "fees_paid_upto", "leaving_date", "reason", "conduct", "pen", "apaar_id", "remarks"],
    codeField: "tc_no",
  },
  {
    key: "bonafide-certificate", label: "Bonafide certificate", group: "Certificates", family: "letter", usedBy: "Student Management", title: "Bonafide Certificate", defaultPaper: "A4",
    fields: [...STUDENT, f("certificate_no", "Certificate number", "BC/2026/0102"), f("purpose", "Purpose", "applying for a passport")],
    defaultFields: [],
    defaultBody: "This is to certify that {{student_name}}, {{son_daughter}} of {{father_name}}, is a bonafide student of this school, studying in {{class_section}} in the academic year {{academic_year}}. {{he_she}} was admitted on {{admission_date}} with admission number {{admission_no}}. {{his_her}} date of birth as per the school records is {{date_of_birth}}.\n\nThis certificate is issued on request for {{purpose}}.",
    codeField: "certificate_no",
  },
  {
    key: "study-certificate", label: "Study certificate", group: "Certificates", family: "letter", usedBy: "Student Management", title: "Study Certificate", defaultPaper: "A4",
    fields: [...STUDENT, f("certificate_no", "Certificate number", "SC/2026/0044"), f("from_class", "From class", "Class 1"), f("to_class", "To class", "Class 5"), f("from_year", "From year", "2021-22"), f("to_year", "To year", "2025-26")],
    defaultFields: [],
    defaultBody: "This is to certify that {{student_name}}, {{son_daughter}} of {{father_name}}, studied in this school from {{from_class}} to {{to_class}}, during the academic years {{from_year}} to {{to_year}}. Admission number: {{admission_no}}.",
    codeField: "certificate_no",
  },
  {
    key: "character-certificate", label: "Character certificate", group: "Certificates", family: "letter", usedBy: "Student Management", title: "Character Certificate", defaultPaper: "A4",
    fields: [...STUDENT, f("certificate_no", "Certificate number", "CC/2026/0019"), f("conduct", "Conduct", "good"), f("from_year", "From year", "2021-22"), f("to_year", "To year", "2025-26")],
    defaultFields: [],
    defaultBody: "This is to certify that {{student_name}}, {{son_daughter}} of {{father_name}}, was a student of this school from {{from_year}} to {{to_year}}. To the best of my knowledge, {{his_her}} conduct and character were {{conduct}}. I wish {{his_her}} every success in life.",
    codeField: "certificate_no",
  },
  {
    key: "experience-letter", label: "Experience letter", group: "Staff", family: "letter", usedBy: "Staff & HR Management", title: "Experience Letter", defaultPaper: "A4",
    fields: [...STAFF, f("letter_no", "Letter number", "HR/2026/0007")],
    defaultFields: [],
    defaultBody: "This is to certify that {{staff_name}} worked with {{school_name}} as {{designation}} in the {{department}} department from {{joining_date}} to {{leaving_date}}.\n\nDuring this period we found the work sincere and the conduct good. We wish every success in the years ahead.",
  },
  {
    key: "offer-letter", label: "Offer letter", group: "Staff", family: "letter", usedBy: "Staff & HR Management", title: "Offer Letter", defaultPaper: "A4",
    fields: [...STAFF, f("letter_no", "Letter number", "HR/2026/0011"), f("monthly_salary", "Monthly salary", "₹48,000"), f("reporting_to", "Reports to", "Lakshmi Rao, Principal"), f("accept_by", "Accept by", "20-10-2026")],
    defaultFields: [],
    defaultBody: "Dear {{staff_name}},\n\nWe are pleased to offer you the post of {{designation}} in the {{department}} department at {{school_name}}, from {{joining_date}}, at a monthly salary of {{monthly_salary}}. You will report to {{reporting_to}}.\n\nPlease sign and return a copy of this letter by {{accept_by}} to accept the offer.",
  },
  {
    key: "student-id-card", label: "Student ID card", group: "ID cards", family: "card", usedBy: "Student Management", title: "Student Identity Card", defaultPaper: "A4",
    fields: STUDENT, defaultFields: ["admission_no", "class_section", "date_of_birth", "blood_group", "father_name", "guardian_phone"],
    codeField: "admission_no",
  },
  {
    key: "staff-id-card", label: "Staff ID card", group: "ID cards", family: "card", usedBy: "Staff & HR Management", title: "Staff Identity Card", defaultPaper: "A4",
    fields: STAFF, defaultFields: ["staff_code", "designation", "department", "blood_group", "staff_phone"], codeField: "staff_code",
  },
  {
    key: "library-card", label: "Library card", group: "ID cards", family: "card", usedBy: "Library Management", title: "Library Card", defaultPaper: "A4",
    fields: [...pick(STUDENT, ["student_name", "admission_no", "class_section"]), f("member_no", "Member number", "LIB-2026-0042"), f("valid_until", "Valid until", "31-03-2027")],
    defaultFields: ["member_no", "class_section", "valid_until"], codeField: "member_no",
  },
  {
    key: "admit-card", label: "Admit card", group: "Exams", family: "admit", usedBy: "Examination & Results", title: "Admit Card", defaultPaper: "A4",
    fields: [...STUDENT, f("exam_name", "Exam", "Half-Yearly Examination 2026"), f("exam_centre", "Exam centre", "Main Campus, Block B")],
    defaultFields: ["exam_name", "student_name", "admission_no", "class_section", "roll_no", "exam_centre"],
    defaultBody: "Bring this admit card to every exam. Reach 15 minutes before the start. Mobile phones are not allowed in the exam hall.",
    columns: [{ key: "date", label: "Date" }, { key: "day", label: "Day" }, { key: "subject", label: "Subject" }, { key: "time", label: "Time" }],
    sampleRows: [
      { date: "21-10-2026", day: "Wednesday", subject: "English", time: "9:30 AM to 12:30 PM" },
      { date: "23-10-2026", day: "Friday", subject: "Mathematics", time: "9:30 AM to 12:30 PM" },
      { date: "26-10-2026", day: "Monday", subject: "Science", time: "9:30 AM to 12:30 PM" },
      { date: "28-10-2026", day: "Wednesday", subject: "Social Science", time: "9:30 AM to 12:30 PM" },
    ],
    codeField: "admission_no",
  },
  {
    key: "report-card", label: "Report card", group: "Exams", family: "report", usedBy: "Examination & Results", title: "Report Card", defaultPaper: "A4",
    fields: [...STUDENT, f("exam_name", "Exam or term", "Term 1, 2026-27"), f("attendance", "Attendance", "96 of 102 days"), f("total_marks", "Total", "437 / 500"), f("percentage", "Percentage", "87.4%"), f("overall_grade", "Overall grade", "A1"), f("rank", "Rank in section", "4"), f("class_teacher", "Class teacher", "Ravi Teja"), f("remarks", "Remarks", "Aarav is attentive in class and takes part well in group work.")],
    defaultFields: ["exam_name", "student_name", "admission_no", "class_section", "roll_no", "date_of_birth", "father_name", "attendance"],
    defaultBody: "Remarks: {{remarks}}",
    columns: [{ key: "subject", label: "Subject" }, { key: "max", label: "Max marks", align: "right" }, { key: "marks", label: "Marks", align: "right" }, { key: "grade", label: "Grade", align: "center" }],
    sampleRows: [
      { subject: "English", max: "100", marks: "88", grade: "A2" }, { subject: "Hindi", max: "100", marks: "81", grade: "A2" }, { subject: "Mathematics", max: "100", marks: "95", grade: "A1" },
      { subject: "Science", max: "100", marks: "90", grade: "A1" }, { subject: "Social Science", max: "100", marks: "83", grade: "A2" },
    ],
  },
  {
    key: "final-result", label: "Final result", group: "Exams", family: "report", usedBy: "Examination & Results", title: "Final Result", defaultPaper: "A4",
    fields: [...STUDENT, f("exam_name", "Year", "Annual 2025-26"), f("total_marks", "Total", "872 / 1000"), f("percentage", "Percentage", "87.2%"), f("overall_grade", "Overall grade", "A1"), f("result", "Result", "Passed"), f("promoted_to", "Promoted to", "Class 6"), f("remarks", "Remarks", "Promoted with distinction.")],
    defaultFields: ["exam_name", "student_name", "admission_no", "class_section", "roll_no", "result", "promoted_to"],
    defaultBody: "Result: {{result}}. Promoted to {{promoted_to}}. {{remarks}}",
    columns: [{ key: "subject", label: "Subject" }, { key: "term1", label: "Term 1", align: "right" }, { key: "term2", label: "Term 2", align: "right" }, { key: "grade", label: "Grade", align: "center" }],
    sampleRows: [
      { subject: "English", term1: "88", term2: "86", grade: "A2" }, { subject: "Mathematics", term1: "95", term2: "93", grade: "A1" }, { subject: "Science", term1: "90", term2: "88", grade: "A1" },
    ],
  },
  {
    key: "visitor-pass", label: "Visitor pass", group: "Front office", family: "card", usedBy: "Front Office", title: "Visitor Pass", defaultPaper: "A4",
    fields: [f("visitor_name", "Visitor name", "Kiran Kumar"), f("pass_no", "Pass number", "VP-1009-014"), f("purpose", "Purpose", "Meeting the class teacher"), f("to_meet", "To meet", "Ravi Teja"), f("visit_date", "Date", "09-10-2026"), f("time_in", "Time in", "10:42 AM"), f("visitor_phone", "Phone", "99887 66554")],
    defaultFields: ["pass_no", "purpose", "to_meet", "visit_date", "time_in"], codeField: "pass_no",
  },
  {
    key: "admission-offer-letter", label: "Admission offer letter", group: "Letters", family: "letter", usedBy: "Admission Management", title: "Offer of Admission", defaultPaper: "A4",
    fields: [f("letter_no", "Letter number", "SPS/OL/2026/0012"), f("student_name", "Child's name", "Aarav Sharma"), f("application_no", "Application number", "APP/2026/0042"), f("class_name", "Class offered", "Class 6"), f("academic_year", "Academic year", "2026-27"), f("parent_name", "Parent's name", "Rajesh Sharma"), f("address", "Address", "Flat 302, Lake View Apartments, Kondapur, Hyderabad"), f("accept_by", "Accept by", "20-10-2026")],
    defaultFields: [],
    defaultBody: "Dear {{parent_name}},\n\nWe are pleased to offer {{student_name}} admission to {{class_name}} for the academic year {{academic_year}} (application {{application_no}}).\n\nPlease visit the school office by {{accept_by}} with the original documents to accept this offer and complete the admission.",
    codeField: "letter_no",
  },
  {
    key: "letter", label: "Letter", group: "Letters", family: "letter", usedBy: "Every module", title: "", defaultPaper: "A4",
    fields: [f("letter_no", "Letter number", "SPS/2026/L/0058"), f("recipient_name", "To (name)", "The Parents of Class 5"), f("recipient_address", "To (address)", ""), f("subject", "Subject", "Annual Day on 14 November"), f("message", "Message", "We are happy to invite you to our Annual Day celebrations on Saturday, 14 November, at 5 PM in the school auditorium.")],
    defaultFields: [],
    defaultBody: "To,\n{{recipient_name}}\n{{recipient_address}}\n\nSubject: {{subject}}\n\n{{message}}",
  },
];

export function findDocType(key: string): DocType | undefined {
  return DOC_TYPES.find((d) => d.key === key);
}

export const GROUP_ORDER: DocType["group"][] = ["Fees", "Certificates", "ID cards", "Exams", "Staff", "Front office", "Letters"];

/** All merge fields of a document, school fields first. */
export function allFields(t: DocType): MergeField[] {
  const seen = new Set<string>();
  return [...SCHOOL_FIELDS, ...t.fields].filter((x) => (seen.has(x.key) ? false : (seen.add(x.key), true)));
}
