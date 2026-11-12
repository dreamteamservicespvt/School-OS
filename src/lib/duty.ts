// Who does the desk work (owner's prototype changes of 13 and 14 Oct 2026,
// design/ui-prototype/src/config.js DUTY). The Principal and Vice Principal
// look after the whole school: they read the register, the fee pages and
// marks progress, see the gaps and send reminders, but they do not take a
// class register, sit at the fee counter or enter marks.
//
// The School Admin is not narrowed here (layman tests LA11 and LD6, 12 Nov
// 2026). docs/blueprint/05-roles.md gives the School Admin Full in every
// module ("Gets everything": the office head who runs the software), and
// Settings, Users & Permissions said "Full" and "Everything, in every module"
// while the screens said "View only" and hid Student Leave, so in a school
// without the Office Staff template nobody in the office could record a
// student's leave. The School Admin's screens now follow the blueprint: Full.
//
// This narrows what the screens offer. What the server allows still follows
// docs/blueprint/05-roles.md (a Principal has Full Attendance there), so a
// page or button hidden here stays allowed by requireAction(); pages hidden
// here send the person to the page they use instead. Settings shows the same
// narrowing in words (dutyNotes), so the two never disagree.
//
//   hide: pages of the module this role never uses (not in the tabs, the
//         address goes to the module's overview page)
//   view: pages they read but do not fill in (no doing-buttons)
//
// A person with another role that does the work (a Principal who is also a
// class teacher, an Accountant who is also School Admin) keeps it: the widest
// of their roles wins.
import { ALL_ROLE_TEMPLATES, type AccessLevel, type RolePermissions } from "./roles";
import type { ModuleKey } from "./modules";

export type PageMode = "full" | "view" | "hidden";
type Rule = { hide?: readonly string[]; view?: readonly string[] };

/** The roles that look after the whole school rather than one desk (homes, reminders). The School Admin is one, but its pages are not narrowed (see above). */
export const OVERSIGHT_ROLES = ["principal", "school-admin", "vice-principal"] as const;

/** Taking attendance and recording student leave belong to class teachers and the office. */
const ATTENDANCE_DESK = ["take", "student-leave"];

/** A teacher's desk in Homework & Learning: checking work, lessons, quizzes, boards and online classes. */
const TEACHING_DESK = ["submissions", "study-material", "quizzes", "discussions", "online-classes"];

/** Transport Management's pages (prototype config.js DUTY: the Principal reads them all). */
const TRANSPORT_PAGES = ["live", "routes", "vehicles", "students", "trips", "reports", "settings"];

/**
 * Page keys per module, as the module's own tabs name them:
 * Attendance: take, register, student-leave, staff, reports, devices, settings.
 * Fees: dashboard, collect, payments, ledger, documents, defaulters, structure, concessions, reports, settings.
 * Examination & Results: marks (Marks Entry).
 * Finance: day-book (Close the day), income, expenses, cash-bank, budget, accounts, reports, settings.
 * Staff & HR: add (Add Staff). Settings: school-profile, users, payment-gateways, messaging,
 * document-designs, forms-approvals, modules, data-security.
 * Homework & Learning: homework, submissions, study-material, quizzes, discussions,
 * online-classes, learning-progress, settings (src/lib/homework/access.ts).
 * Transport: live, routes, vehicles, students, trips, reports, settings (src/lib/transport/words.ts).
 * Library: issue, books, members, fines, reports, settings (src/lib/library/access.ts).
 * Hostel: rooms, allocation, rollcall, outings, mess, reports, settings (src/lib/hostel/access.ts).
 * Inventory: items, issue, purchases, assets, rooms, reports, settings (src/lib/inventory/access.ts).
 */
export const DUTY: Readonly<Record<string, Partial<Record<ModuleKey, Rule>>>> = {
  principal: {
    // Events & Calendar: the Principal, School Admin and VP plan events and PTMs (the
    // events team); only Daily Activities, which is not built yet, is theirs to watch.
    "events-calendar": { view: ["daily"] },
    // Attendance and Fee Settings stay full for the Principal: their forms have no read-only form yet.
    "attendance-management": { hide: ATTENDANCE_DESK, view: ["staff", "devices"] },
    "fee-management": { hide: ["collect"], view: ["dashboard", "payments", "documents", "ledger", "defaulters", "reports"] },
    // Finance: the Accountant counts the cash and closes the day; the Principal reads the Day Book and reminds (or reopens a day).
    "finance-management": { view: ["day-book"] },
    "examination-results": { view: ["marks"] },
    "staff-hr-management": { hide: ["add"] },
    // Settings: the Principal reads the school profile, logins and roles, document designs and
    // modules (the School Admin changes them), keeps Forms & Approvals, and never uses gateways,
    // message channels or backups (src/lib/settings/page-access.ts).
    settings: { hide: ["payment-gateways", "messaging", "data-security"], view: ["school-profile", "users", "document-designs", "modules"] },
    "homework-learning": { hide: TEACHING_DESK, view: ["homework", "learning-progress", "settings"] },
    // Early Warnings: class teachers review their students' flags; leaders watch every flag and Remind.
    "reports-analytics": { view: ["warnings"] },
    "transport-management": { view: TRANSPORT_PAGES },
    // Library: the Librarian runs the desk; the Principal watches overdue books and fines (with Remind) and never works Members & Cards.
    "library-management": { hide: ["members"], view: ["issue", "books", "fines", "reports", "settings"] },
    // Hostel: the Warden runs the hostel; the Principal reads every page (settings too) and reminds the warden.
    "hostel-management": { view: ["rooms", "allocation", "rollcall", "outings", "mess", "reports", "settings"] },
    // Inventory: the Store Keeper runs the store; the Principal approves and orders purchases and reads the rest (with Remind).
    "inventory-management": { view: ["items", "issue", "assets", "rooms", "reports", "settings"] },
  },
  "vice-principal": {
    "events-calendar": { view: ["daily"] },
    "attendance-management": { hide: ATTENDANCE_DESK, view: ["staff", "devices"] },
    "examination-results": { view: ["marks"] },
    "homework-learning": { view: ["homework", ...TEACHING_DESK] },
    "reports-analytics": { view: ["warnings"] },
  },
  "academic-head": { "examination-results": { view: ["marks"] }, "homework-learning": { view: ["homework", ...TEACHING_DESK] } },
  "exam-in-charge": { "examination-results": { view: ["marks"] } },
};

export type DutyPerson = { roles: readonly { key: string | null; permissions?: RolePermissions | null }[] };

/** The role's own level for a module: what the school set on the role, else the ready template. */
function roleLevel(role: DutyPerson["roles"][number], module: ModuleKey): AccessLevel {
  const own = role.permissions?.[module];
  if (own) return own;
  const t = ALL_ROLE_TEMPLATES.find((r) => r.key === role.key);
  // A role the school made itself, with no level known here: treat it as doing the work.
  return t ? t.permissions[module] : "full";
}

const RANK: Record<PageMode, number> = { hidden: 0, view: 1, full: 2 };

/**
 * How this person uses one page of a module: "full" (does the work),
 * "view" (reads it) or "hidden" (never uses it). Only narrows; whether they may
 * open the module at all is still the module's own check.
 */
export function pageMode(person: DutyPerson, module: ModuleKey, page: string): PageMode {
  let best: PageMode | null = null;
  for (const role of person.roles) {
    if (roleLevel(role, module) === "none") continue;
    const rule = role.key ? DUTY[role.key]?.[module] : undefined;
    const mode: PageMode = rule?.hide?.includes(page) ? "hidden" : rule?.view?.includes(page) ? "view" : "full";
    if (best === null || RANK[mode] > RANK[best]) best = mode;
  }
  return best ?? "full";
}

/** Does this person do the work on that page (not only read it)? */
export const doesWork = (person: DutyPerson, module: ModuleKey, page: string) => pageMode(person, module, page) === "full";

/** Is the page one this person never uses? */
export const pageHidden = (person: DutyPerson, module: ModuleKey, page: string) => pageMode(person, module, page) === "hidden";

/** Holds one of the whole-school roles (Principal, School Admin, Vice Principal). */
export function oversees(person: DutyPerson) {
  return person.roles.some((r) => r.key !== null && (OVERSIGHT_ROLES as readonly string[]).includes(r.key));
}

/** Which whole-school home this person gets: the Principal's, the office's (School Admin) or the Vice Principal's. */
export type LeaderKind = "principal" | "office" | "vp";
export function leaderKind(person: DutyPerson): LeaderKind {
  const keys = person.roles.map((r) => r.key);
  if (keys.includes("principal")) return "principal";
  if (keys.includes("school-admin")) return "office";
  if (keys.includes("vice-principal")) return "vp";
  return "principal";
}

/** Plain names of the page keys in DUTY, for Settings (the module's own tab words). */
const PAGE_WORDS: Record<string, string> = {
  take: "Take Attendance", "student-leave": "Student Leave", staff: "Staff Attendance", devices: "Devices", register: "Attendance Register",
  collect: "Collect Fee", dashboard: "Fee dashboard", payments: "Payments", documents: "Documents", ledger: "Student ledger", defaulters: "Defaulters", concessions: "Concessions",
  "day-book": "Day Book", marks: "Marks Entry", add: "Add Staff", warnings: "Early Warnings", daily: "Daily Activities",
  "payment-gateways": "Payment gateways", messaging: "Messaging", "data-security": "Data & Security", "school-profile": "School profile", users: "Users & Permissions", "document-designs": "Document designs", modules: "Modules",
  homework: "Homework", submissions: "Submissions", "study-material": "Study material", quizzes: "Quizzes", discussions: "Discussions", "online-classes": "Online classes", "learning-progress": "Learning progress",
  live: "Live map", routes: "Routes", vehicles: "Vehicles", students: "Students", trips: "Trips", issue: "Issue & Return", books: "Books", members: "Members & Cards", fines: "Fines",
  rooms: "Rooms", allocation: "Allocation", rollcall: "Roll call", outings: "Outings", mess: "Mess", items: "Items & Stock", assets: "Assets", purchases: "Purchases", reports: "Reports", settings: "Settings",
};

/**
 * What the screens narrow for this person in a module, in words for Settings, Users & Permissions
 * ("Full" there, but these pages are only read or not shown), or null when nothing is narrowed.
 */
export function dutyNotes(person: DutyPerson, module: ModuleKey): { reads: string[]; notShown: string[] } | null {
  const pages = new Set<string>();
  for (const role of person.roles) {
    const rule = role.key ? DUTY[role.key]?.[module] : undefined;
    for (const p of [...(rule?.hide ?? []), ...(rule?.view ?? [])]) pages.add(p);
  }
  const reads: string[] = [];
  const notShown: string[] = [];
  for (const p of pages) {
    const mode = pageMode(person, module, p);
    if (mode === "view") reads.push(PAGE_WORDS[p] ?? p);
    else if (mode === "hidden") notShown.push(PAGE_WORDS[p] ?? p);
  }
  return reads.length || notShown.length ? { reads, notShown } : null;
}
