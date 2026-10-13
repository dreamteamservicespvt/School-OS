// The menu of the approved design (design/ui-prototype/src/data.js NAV, config.js BOTTOM and
// QUICK_BY_ROLE): groups, icons, the phone bar and the "New" quick actions for each role.
import type { ModuleKey } from "@/lib/modules";

export type IconName =
  | "LayoutGrid" | "CalendarCheck2" | "IndianRupee" | "GraduationCap" | "UserPlus" | "MessagesSquare" | "BookOpen"
  | "ClipboardCheck" | "NotebookPen" | "CalendarDays" | "Users" | "Wallet" | "Landmark" | "DoorOpen" | "Bus" | "Library"
  | "Boxes" | "BedDouble" | "ChartColumn" | "Settings" | "House" | "UserX" | "CalendarRange" | "IdCard" | "Route" | "ListChecks"
  | "ArrowRightLeft" | "PackageMinus" | "ShoppingCart" | "PhoneIncoming" | "FileText" | "HeartHandshake" | "Award" | "Send"
  | "ReceiptText" | "FolderOpen" | "Video";

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

export const BOTTOM_BY_ROLE: Record<string, BarItem[]> = {
  principal: [HOME, b("/student-management", "student-management", "Students", "GraduationCap"), b("/fee-management", "fee-management", "Collect", "IndianRupee", true), b("/attendance-management", "attendance-management", "Attendance", "CalendarCheck2")],
  "school-admin": [HOME, b("/student-management", "student-management", "Students", "GraduationCap"), b("/fee-management", "fee-management", "Collect", "IndianRupee", true), b("/attendance-management", "attendance-management", "Attendance", "CalendarCheck2")],
  "vice-principal": [HOME, b("/student-management", "student-management", "Students", "GraduationCap"), b("/attendance-management", "attendance-management", "Attendance", "CalendarCheck2", true), b("/examination-results", "examination-results", "Exams", "ClipboardCheck")],
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
};

/** "New": the quick actions for each role. */
export type Quick = { href: string; module: ModuleKey; label: string; sub: string; icon: IconName };
const q = (href: string, module: ModuleKey, label: string, sub: string, icon: IconName): Quick => ({ href, module, label, sub, icon });

const LEADER: Quick[] = [
  q("/fee-management", "fee-management", "Collect fee", "Find a student and take payment", "IndianRupee"),
  q("/attendance-management", "attendance-management", "Take attendance", "Mark today's register for a section", "CalendarCheck2"),
  q("/student-management/new", "student-management", "Add student", "Name, class and parent phone is enough", "UserPlus"),
  q("/communication", "communication", "Send message", "WhatsApp, SMS or notice to parents", "Send"),
  q("/admission-management", "admission-management", "Add enquiry", "A parent asked about admission", "PhoneIncoming"),
  q("/finance-management/expenses?do=new", "finance-management", "Record expense", "Bills, purchases, petty cash", "ReceiptText"),
];

export const QUICK_BY_ROLE: Record<string, Quick[]> = {
  principal: LEADER,
  "school-admin": LEADER,
  "vice-principal": LEADER,
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
    q("/front-office/visitors", "front-office", "Add visitor", "Name, phone and who they meet", "IdCard"),
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
  "store-keeper": [q("/inventory-management", "inventory-management", "Issue stock", "Give items to a person or room", "PackageMinus")],
  "hostel-warden": [q("/hostel-management", "hostel-management", "Roll call", "Mark tonight's roll call", "ListChecks")],
  "transport-in-charge": [q("/transport-management", "transport-management", "Buses today", "Trips, delays and live buses", "Bus")],
  "gate-security": [q("/front-office/visitors", "front-office", "Add visitor", "Name, phone and who they meet", "IdCard")],
};
