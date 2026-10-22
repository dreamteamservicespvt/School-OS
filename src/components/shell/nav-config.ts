// The menu of the approved design (design/ui-prototype/src/data.js NAV, config.js BOTTOM and
// QUICK_BY_ROLE): groups, icons, the phone bar and the "New" quick actions for each role.
import type { ModuleKey } from "@/lib/modules";

export type IconName =
  | "LayoutGrid" | "CalendarCheck2" | "IndianRupee" | "GraduationCap" | "UserPlus" | "MessagesSquare" | "BookOpen"
  | "ClipboardCheck" | "NotebookPen" | "CalendarDays" | "Users" | "Wallet" | "Landmark" | "DoorOpen" | "Bus" | "Library"
  | "Boxes" | "BedDouble" | "ChartColumn" | "Settings" | "House" | "UserX" | "CalendarRange" | "IdCard" | "Route" | "ListChecks"
  | "ArrowRightLeft" | "PackageMinus" | "ShoppingCart" | "PhoneIncoming" | "FileText" | "HeartHandshake" | "Award" | "Send"
  | "ReceiptText" | "FolderOpen" | "Video" | "BadgeCheck";

export const NAV_GROUPS: { group: string | null; items: { key: ModuleKey; label: string; icon: IconName }[] }[] = [
  { group: null, items: [{ key: "dashboard", label: "Dashboard", icon: "LayoutGrid" }] },
  { group: "Daily work", items: [
    { key: "attendance-management", label: "Attendance", icon: "CalendarCheck2" },
    { key: "fee-management", label: "Fee Management", icon: "IndianRupee" },
    { key: "student-management", label: "Student Management", icon: "GraduationCap" },
    { key: "admission-management", label: "Admission Management", icon: "UserPlus" },
    { key: "communication", label: "Communication", icon: "MessagesSquare" },
  ] },
  { group: "Academics", items: [
    { key: "academic-management", label: "Academic Management", icon: "BookOpen" },
    { key: "examination-results", label: "Examination & Results", icon: "ClipboardCheck" },
    { key: "homework-learning", label: "Homework & Learning", icon: "NotebookPen" },
    { key: "events-calendar", label: "Events & Calendar", icon: "CalendarDays" },
  ] },
  { group: "Staff & money", items: [
    { key: "staff-hr-management", label: "Staff & HR Management", icon: "Users" },
    { key: "salary-management", label: "Salary Management", icon: "Wallet" },
    { key: "finance-management", label: "Finance Management", icon: "Landmark" },
  ] },
  { group: "Campus", items: [
    { key: "front-office", label: "Front Office", icon: "DoorOpen" },
    { key: "transport-management", label: "Transport Management", icon: "Bus" },
    { key: "library-management", label: "Library Management", icon: "Library" },
    { key: "inventory-management", label: "Inventory Management", icon: "Boxes" },
    { key: "hostel-management", label: "Hostel Management", icon: "BedDouble" },
  ] },
  { group: "Insights", items: [
    { key: "reports-analytics", label: "Reports & Analytics", icon: "ChartColumn" },
    { key: "settings", label: "Settings", icon: "Settings" },
  ] },
];

export const MODULE_ICON: Record<ModuleKey, IconName> = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.items.map((i) => [i.key, i.icon])),
) as Record<ModuleKey, IconName>;

/** A phone-bar item: [address, label, icon, big centre button]. The module decides who sees it. */
export type BarItem = { href: string; module: ModuleKey; label: string; icon: IconName; big?: boolean };
const b = (href: string, module: ModuleKey, label: string, icon: IconName, big?: boolean): BarItem => ({ href, module, label, icon, big });
const HOME = b("/dashboard", "dashboard", "Home", "House");
/** Approvals belongs to no module; it shows only to people who may approve something (src/lib/shell-data.ts). */
export const APPROVE = b("/approvals", "dashboard", "Approve", "BadgeCheck", true);

export const BOTTOM_BY_ROLE: Record<string, BarItem[]> = {
  // The Principal, School Admin and Vice Principal do no desk work (owner's changes of 13 Oct 2026): their big button
  // is Approve. Reports & Analytics is not built yet, so the Principal's fourth button is the Fee Dashboard.
  principal: [HOME, b("/attendance-management/register", "attendance-management", "Attendance", "CalendarCheck2"), APPROVE, b("/reports-analytics", "reports-analytics", "Reports", "ChartColumn")],
  "school-admin": [HOME, b("/student-management", "student-management", "Students", "GraduationCap"), APPROVE, b("/communication", "communication", "Messages", "Send")],
  "vice-principal": [HOME, b("/attendance-management/register", "attendance-management", "Attendance", "CalendarCheck2"), APPROVE, b("/academic-management/substitutions", "academic-management", "Substitutes", "ArrowRightLeft")],
  accountant: [HOME, b("/fee-management/defaulters", "fee-management", "Defaulters", "UserX"), b("/fee-management", "fee-management", "Collect", "IndianRupee", true), b("/finance-management/day-book", "finance-management", "Day Book", "BookOpen")],
  teacher: [HOME, b("/academic-management/time-table", "academic-management", "Time Table", "CalendarRange"), b("/attendance-management", "attendance-management", "Attendance", "CalendarCheck2", true), b("/homework-learning", "homework-learning", "Homework", "NotebookPen")],
  "class-teacher": [HOME, b("/student-management", "student-management", "My class", "GraduationCap"), b("/attendance-management", "attendance-management", "Attendance", "CalendarCheck2", true), b("/examination-results/marks", "examination-results", "Marks", "ClipboardCheck")],
  receptionist: [HOME, b("/front-office/visitors", "front-office", "Visitors", "IdCard"), b("/front-office", "front-office", "Desk", "DoorOpen", true), b("/front-office/pickup", "front-office", "Pickup", "Users")],
  "transport-in-charge": [HOME, b("/transport-management/routes", "transport-management", "Routes", "Route"), b("/transport-management", "transport-management", "Live", "Bus", true), b("/transport-management/trips", "transport-management", "Trips", "ListChecks")],
  librarian: [HOME, b("/library-management/books", "library-management", "Books", "BookOpen"), b("/library-management", "library-management", "Issue", "ArrowRightLeft", true), b("/library-management/fines", "library-management", "Fines", "IndianRupee")],
  "hostel-warden": [HOME, b("/hostel-management/rooms", "hostel-management", "Rooms", "BedDouble"), b("/hostel-management", "hostel-management", "Roll call", "ListChecks", true), b("/hostel-management/outings", "hostel-management", "Outings", "DoorOpen")],
  "store-keeper": [HOME, b("/inventory-management/items", "inventory-management", "Stock", "Boxes"), b("/inventory-management", "inventory-management", "Issue", "PackageMinus", true), b("/inventory-management/purchases", "inventory-management", "Purchases", "ShoppingCart")],
  "academic-head": [HOME, b("/academic-management/time-table", "academic-management", "Time Table", "CalendarRange"), b("/examination-results", "examination-results", "Exams", "ClipboardCheck", true), b("/homework-learning", "homework-learning", "Homework", "NotebookPen")],
  hr: [HOME, b("/staff-hr-management", "staff-hr-management", "Staff", "Users"), b("/staff-hr-management/leave", "staff-hr-management", "Leave", "CalendarDays", true), b("/attendance-management", "attendance-management", "Attendance", "CalendarCheck2")],
  "office-staff": [HOME, b("/student-management", "student-management", "Students", "GraduationCap"), b("/admission-management", "admission-management", "Admissions", "UserPlus", true), b("/attendance-management", "attendance-management", "Leave", "CalendarCheck2")],
  "exam-in-charge": [HOME, b("/examination-results", "examination-results", "Datesheet", "CalendarDays"), b("/examination-results/marks", "examination-results", "Marks", "ClipboardCheck", true), b("/examination-results/report-cards", "examination-results", "Reports", "Award")],
  "admission-counsellor": [HOME, b("/admission-management", "admission-management", "Enquiries", "PhoneIncoming"), b("/admission-management/applications", "admission-management", "Apply", "FileText", true), b("/admission-management/tests", "admission-management", "Tests", "ClipboardCheck")],
  counsellor: [HOME, b("/student-management/behaviour", "student-management", "Cases", "HeartHandshake", true), b("/communication", "communication", "Messages", "MessagesSquare"), b("/events-calendar", "events-calendar", "Calendar", "CalendarDays")],
  "gate-security": [HOME, b("/front-office/visitors", "front-office", "Visitors", "IdCard", true), b("/front-office/pickup", "front-office", "Pickup", "Users"), b("/events-calendar", "events-calendar", "Calendar", "CalendarDays")],
  // A student (schools giving students logins) has no Dashboard: Homework is their home.
  student: [b("/homework-learning", "homework-learning", "Homework", "NotebookPen", true), b("/homework-learning/quizzes", "homework-learning", "Quizzes", "ListChecks"), b("/homework-learning/study-material", "homework-learning", "Material", "FolderOpen"), b("/homework-learning/online-classes", "homework-learning", "Classes", "Video")],
};

/** "New": the quick actions for each role. */
export type Quick = { href: string; module: ModuleKey; label: string; sub: string; icon: IconName };
const q = (href: string, module: ModuleKey, label: string, sub: string, icon: IconName): Quick => ({ href, module, label, sub, icon });

// The Principal, School Admin and Vice Principal: summaries, gaps and approvals, never desk work such as Collect fee
// or Take attendance (owner's prototype changes of 13 Oct 2026, config.js QUICK_BY_ROLE).
const APPROVALS_QUICK = q("/approvals", "dashboard", "Approvals", "Leave, discounts and expenses waiting", "BadgeCheck");
export const QUICK_BY_ROLE: Record<string, Quick[]> = {
  principal: [
    APPROVALS_QUICK,
    q("/communication", "communication", "Send a notice", "To parents, staff or a class", "Send"),
    q("/attendance-management/register", "attendance-management", "Who is absent today", "And which classes are not marked yet", "UserX"),
    q("/fee-management/defaulters", "fee-management", "Fee defaulters", "Who owes fees and for how long", "IndianRupee"),
    q("/examination-results/marks", "examination-results", "Marks progress", "Which teachers have not entered marks", "ClipboardCheck"),
    q("/reports-analytics", "reports-analytics", "Reports", "Fees, attendance, results and more", "ChartColumn"),
  ],
  "school-admin": [
    q("/student-management/new", "student-management", "Add student", "Name, class and parent phone is enough", "UserPlus"),
    q("/admission-management", "admission-management", "Add enquiry", "A parent asked about admission", "PhoneIncoming"),
    q("/communication", "communication", "Send a notice", "To parents, staff or a class", "Send"),
    q("/staff-hr-management/add", "staff-hr-management", "Add staff", "Name, role and phone to start", "UserPlus"),
    q("/attendance-management/register", "attendance-management", "Who has not marked attendance", "Remind the class teacher", "CalendarCheck2"),
    q("/settings/users", "settings", "Users & permissions", "Who can sign in and what they see", "Users"),
  ],
  "vice-principal": [
    q("/attendance-management/register", "attendance-management", "Who has not marked attendance", "Remind the class teacher", "CalendarCheck2"),
    { ...APPROVALS_QUICK, label: "Approve leave", sub: "Student and staff leave waiting" },
    q("/communication", "communication", "Send message", "WhatsApp, SMS or notice to parents", "Send"),
    q("/academic-management/substitutions", "academic-management", "Arrange substitute", "Periods with no teacher today", "ArrowRightLeft"),
    q("/examination-results/marks", "examination-results", "Marks progress", "Which teachers have not entered marks", "ClipboardCheck"),
  ],
  accountant: [
    q("/fee-management", "fee-management", "Collect fee", "Find a student and take payment", "IndianRupee"),
    q("/finance-management/expenses?do=new", "finance-management", "Record expense", "Bills, purchases, petty cash", "ReceiptText"),
    q("/fee-management/defaulters", "fee-management", "Send fee reminders", "Families with overdue fees", "Send"),
    q("/finance-management/day-book", "finance-management", "Day Book", "Today's money in and out", "BookOpen"),
  ],
  teacher: [
    q("/attendance-management", "attendance-management", "Take attendance", "Your classes today", "CalendarCheck2"),
    q("/homework-learning", "homework-learning", "Give homework", "Class, subject, due date and done", "NotebookPen"),
    q("/examination-results/marks", "examination-results", "Enter marks", "Marks for your subjects", "ClipboardCheck"),
    q("/communication", "communication", "Message parents", "Only parents of your classes", "Send"),
  ],
  "class-teacher": [
    q("/attendance-management", "attendance-management", "Take attendance", "Your section today", "CalendarCheck2"),
    q("/homework-learning", "homework-learning", "Give homework", "Class, subject, due date and done", "NotebookPen"),
    q("/examination-results/marks", "examination-results", "Enter marks", "Marks for your subjects", "ClipboardCheck"),
    q("/communication", "communication", "Message parents", "Only parents of your classes", "Send"),
  ],
  receptionist: [
    q("/front-office/visitors?do=visitor", "front-office", "Add visitor", "Name, phone and who they meet", "IdCard"),
    q("/admission-management", "admission-management", "Add enquiry", "A parent asked about admission", "PhoneIncoming"),
    q("/front-office/pickup", "front-office", "Early pickup", "A parent is taking a child home", "Users"),
    q("/fee-management", "fee-management", "Collect fee", "Find a student and take payment", "IndianRupee"),
  ],
  hr: [
    q("/staff-hr-management/add", "staff-hr-management", "Add staff", "Name, phone and role to begin", "UserPlus"),
    q("/staff-hr-management/leave", "staff-hr-management", "Leave requests", "Approve or decline leave", "CalendarDays"),
  ],
  "office-staff": [
    q("/student-management/new", "student-management", "Add student", "Name, class and parent phone is enough", "UserPlus"),
    q("/admission-management", "admission-management", "Add enquiry", "A parent asked about admission", "PhoneIncoming"),
  ],
  "admission-counsellor": [
    q("/admission-management", "admission-management", "Add enquiry", "A parent asked about admission", "PhoneIncoming"),
    q("/admission-management/applications", "admission-management", "New application", "Fill the form with the parent", "FileText"),
  ],
  "exam-in-charge": [
    q("/examination-results/marks", "examination-results", "Enter marks", "Marks entry for any exam", "ClipboardCheck"),
    q("/examination-results/report-cards", "examination-results", "Report cards", "Make and publish report cards", "Award"),
  ],
  librarian: [q("/library-management", "library-management", "Issue a book", "Scan the book and the member", "ArrowRightLeft")],
  "store-keeper": [
    q("/inventory-management", "inventory-management", "Issue stock", "Give items to a person or room", "PackageMinus"),
    q("/inventory-management/items?state=low", "inventory-management", "Low stock", "Items at or below the reorder level", "Boxes"),
    q("/inventory-management/purchases?tab=orders&status=open", "inventory-management", "Goods received", "Orders waiting for delivery", "ShoppingCart"),
    q("/inventory-management/rooms?status=open", "inventory-management", "Maintenance requests", "Open problems reported by staff", "ListChecks"),
  ],
  "hostel-warden": [q("/hostel-management", "hostel-management", "Roll call", "Mark tonight's roll call", "ListChecks")],
  "transport-in-charge": [
    q("/transport-management/trips", "transport-management", "Buses today", "Trips, delays and live buses", "Bus"),
    q("/transport-management/students?do=assign", "transport-management", "Give a bus stop", "Route, stop and the stop's fee", "Route"),
    q("/transport-management/vehicles?view=costs&do=cost&ck=FUEL", "transport-management", "Record fuel", "Fuel bill for a vehicle", "ReceiptText"),
  ],
  "gate-security": [q("/front-office/visitors?do=visitor", "front-office", "Add visitor", "Name, phone and who they meet", "IdCard")],
};
