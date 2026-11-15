// The 20 modules of the School Master, in menu order (docs/blueprint/README.md,
// "The names used everywhere"). Names must match the blueprint exactly.

export type ModuleKey =
  | "dashboard"
  | "admission-management"
  | "student-management"
  | "academic-management"
  | "attendance-management"
  | "fee-management"
  | "finance-management"
  | "examination-results"
  | "staff-hr-management"
  | "salary-management"
  | "communication"
  | "transport-management"
  | "library-management"
  | "inventory-management"
  | "hostel-management"
  | "front-office"
  | "homework-learning"
  | "events-calendar"
  | "reports-analytics"
  | "settings";

export type SchoolModuleInfo = {
  key: ModuleKey;
  number: number;
  name: string;
  /**
   * The short label in the side menu, the phone's "Everything" sheet and the phone bar (owner decision 13,
   * 15 Nov 2026). Page titles, the blueprint and records keep the full name above.
   */
  short: string;
  /** Optional modules stay hidden until the school switches them on (P19). */
  optional: boolean;
  /** Build stage from docs/blueprint/06-build-order.md. */
  stage: 1 | 2 | 3 | 4;
  /** One line, in school words, shown before the module is built. */
  purpose: string;
};

export const MODULES: readonly SchoolModuleInfo[] = [
  { key: "dashboard", number: 1, name: "Dashboard", short: "Dashboard", optional: false, stage: 2, purpose: "What is happening in your school today, what needs your attention and what to do next." },
  { key: "admission-management", number: 2, name: "Admission Management", short: "Admissions", optional: false, stage: 2, purpose: "Enquiries, applications and admissions, from the first call to the first day." },
  { key: "student-management", number: 3, name: "Student Management", short: "Students", optional: false, stage: 1, purpose: "Every student and parent, the Student Profile, ID cards and certificates." },
  { key: "academic-management", number: 4, name: "Academic Management", short: "Academics", optional: false, stage: 1, purpose: "The academic year, classes, sections, subjects and the Time Table." },
  { key: "attendance-management", number: 5, name: "Attendance Management", short: "Attendance", optional: false, stage: 2, purpose: "Student and staff attendance, student leave and the School Calendar." },
  { key: "fee-management", number: 6, name: "Fee Management", short: "Fees", optional: false, stage: 2, purpose: "Fee structures, collecting fees at the counter and online, receipts and dues." },
  { key: "finance-management", number: 7, name: "Finance Management", short: "Finance", optional: false, stage: 2, purpose: "The Day Book, expenses, other income and the accounts by financial year." },
  { key: "examination-results", number: 8, name: "Examination & Results", short: "Exams", optional: false, stage: 2, purpose: "Datesheets, admit cards, marks entry, results and report cards." },
  { key: "staff-hr-management", number: 9, name: "Staff & HR Management", short: "Staff & HR", optional: false, stage: 1, purpose: "Every staff member, their documents, leave and the classes they teach." },
  { key: "salary-management", number: 10, name: "Salary Management", short: "Salary", optional: false, stage: 3, purpose: "Monthly salary with PF and ESI, and salary slips." },
  { key: "communication", number: 11, name: "Communication", short: "Communication", optional: false, stage: 2, purpose: "Messages and notices to parents and staff, and each parent's Parent Link." },
  { key: "transport-management", number: 12, name: "Transport Management", short: "Transport", optional: true, stage: 4, purpose: "Buses, routes, stops, drivers and live bus tracking." },
  { key: "library-management", number: 13, name: "Library Management", short: "Library", optional: true, stage: 4, purpose: "Books, issue and return, members and fines." },
  { key: "inventory-management", number: 14, name: "Inventory Management", short: "Inventory", optional: true, stage: 4, purpose: "Stock, issues, purchases and assets." },
  { key: "hostel-management", number: 15, name: "Hostel Management", short: "Hostel", optional: true, stage: 4, purpose: "Rooms, beds, roll call, outings, visitors and mess." },
  { key: "front-office", number: 16, name: "Front Office", short: "Front Office", optional: false, stage: 3, purpose: "Visitors, gate passes, pickups and appointments at the reception desk." },
  { key: "homework-learning", number: 17, name: "Homework & Learning", short: "Homework", optional: false, stage: 3, purpose: "Homework, study material and online classes." },
  { key: "events-calendar", number: 18, name: "Events & Calendar", short: "Events", optional: false, stage: 3, purpose: "Events, PTMs, the School Calendar and the photo gallery." },
  { key: "reports-analytics", number: 19, name: "Reports & Analytics", short: "Reports", optional: false, stage: 3, purpose: "Every report in one place, with early warnings and government reports." },
  { key: "settings", number: 20, name: "Settings", short: "Settings", optional: false, stage: 1, purpose: "School profile, users and roles, payment gateways, messaging and backups." },
] as const;

export const MODULE_KEYS = MODULES.map((m) => m.key) as readonly ModuleKey[];

export function findModule(key: string): SchoolModuleInfo | undefined {
  return MODULES.find((m) => m.key === key);
}

/** Modules whose screens are built so far. Grows one module at a time. */
export const BUILT_MODULES: ReadonlySet<ModuleKey> = new Set<ModuleKey>([
  "academic-management",
  "examination-results",
  "dashboard",
  "communication",
  "settings",
  "staff-hr-management",
  "admission-management",
  "student-management",
  "attendance-management",
  "fee-management",
  "finance-management",
  "salary-management",
  "homework-learning",
  "front-office",
  "events-calendar",
  "reports-analytics",
  "transport-management",
  "library-management",
  "hostel-management",
  "inventory-management",
]);

/**
 * Modules where "Own" means only the person's own record (their leave, profile
 * and salary slips). For them these are not a module to work in, so they are
 * left out of the menu and reached from My profile, "My work" (00-global.md §1.4).
 */
export const SELF_SERVICE_MODULES: ReadonlySet<ModuleKey> = new Set<ModuleKey>(["staff-hr-management", "salary-management"]);
