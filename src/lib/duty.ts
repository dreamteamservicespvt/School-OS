// Who does the desk work (owner's prototype changes of 13 and 14 Oct 2026,
// design/ui-prototype/src/config.js DUTY). The Principal, School Admin and
// Vice Principal look after the whole school: they read the register, the
// fee pages and marks progress, see the gaps and send reminders, but they do
// not take a class register, sit at the fee counter or enter marks.
//
// This narrows what the screens offer. What the server allows still follows
// docs/blueprint/05-roles.md (a Principal has Full Attendance there), so a
// page or button hidden here stays allowed by requireAction(); pages hidden
// here send the person to the page they use instead.
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

/** The roles that look after the whole school rather than one desk. */
export const OVERSIGHT_ROLES = ["principal", "school-admin", "vice-principal"] as const;

/** Taking attendance and recording student leave belong to class teachers and the office. */
const ATTENDANCE_DESK = ["take", "student-leave"];

/** A teacher's desk in Homework & Learning: checking work, lessons, quizzes, boards and online classes. */
const TEACHING_DESK = ["submissions", "study-material", "quizzes", "discussions", "online-classes"];

/**
 * Page keys per module, as the module's own tabs name them:
 * Attendance: take, register, student-leave, staff, reports, devices, settings.
 * Fees: dashboard, collect, payments, ledger, documents, defaulters, structure, concessions, reports, settings.
 * Examination & Results: marks (Marks Entry).
 * Staff & HR: add (Add Staff). Settings: payment-gateways, messaging, data-security.
 * Homework & Learning: homework, submissions, study-material, quizzes, discussions,
 * online-classes, learning-progress, settings (src/lib/homework/access.ts).
 */
export const DUTY: Readonly<Record<string, Partial<Record<ModuleKey, Rule>>>> = {
  principal: {
    // Attendance and Fee Settings stay full for the Principal: their forms have no read-only form yet.
    "attendance-management": { hide: ATTENDANCE_DESK, view: ["staff", "devices"] },
    "fee-management": { hide: ["collect"], view: ["dashboard", "payments", "documents", "ledger", "defaulters", "reports"] },
    "examination-results": { view: ["marks"] },
    "staff-hr-management": { hide: ["add"] },
    settings: { hide: ["payment-gateways", "messaging", "data-security"] },
    "homework-learning": { hide: TEACHING_DESK, view: ["homework", "learning-progress", "settings"] },
  },
  "school-admin": {
    "attendance-management": { hide: ATTENDANCE_DESK, view: ["register"] },
    "fee-management": { hide: ["collect"], view: ["dashboard", "payments", "documents", "ledger", "defaulters", "concessions", "reports"] },
    "examination-results": { view: ["marks"] },
    "homework-learning": { hide: TEACHING_DESK, view: ["homework", "learning-progress"] },
  },
  "vice-principal": {
    "attendance-management": { hide: ATTENDANCE_DESK, view: ["staff", "devices"] },
    "examination-results": { view: ["marks"] },
    "homework-learning": { view: ["homework", ...TEACHING_DESK] },
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
