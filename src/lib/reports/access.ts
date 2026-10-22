// Who sees what in Reports & Analytics (05-roles.md column 19, the approved
// prototype's mod-reports.jsx ROLE_CATS and config.js VIEW / OWN):
//   Full (Principal, School Admin): every page and every report.
//   View, by role: the Accountant money reports only; the Vice Principal
//   everything but salary; the Academic Head academic reports; HR staff
//   reports; the Exam In-charge exam reports; the Admission Counsellor
//   admission reports.
//   Own (Teacher, Class Teacher): reports of their own classes, and the Early
//   Warnings of their students.
// On top of that each report needs the person to see its own module, with
// the same page rule the module uses (Fee Reports need Fee Management View or
// Full, salary amounts need Full Salary Management). Fee data never reaches a
// role without Fee Management. All of this is from the person alone, with no
// database, so menus and the server checks agree.
import { BUILT_MODULES, MODULES, type ModuleKey } from "../modules";
import type { Reach } from "../permissions";
import { feePageAllowedFor } from "../fees/access";
import { financeLevel, financePageAllowed } from "../finance/access";
import { salaryLevel } from "../salary/access";
import { attendancePages } from "../attendance/access";
import { pageMode } from "../duty";
import { aiAllowed } from "../settings/switch-rules";
import { taskAccess } from "../dashboard/tasks";
import { CATEGORIES, CATEGORY_MODULE, MONEY, type Category, type ReportViewer } from "./types";

export const MODULE = "reports-analytics" as const;
export const BASE = "/reports-analytics";

/** The categories each ready role may see (prototype ROLE_CATS). A role the school made itself is limited by its modules only. */
const ROLE_CATS: Record<string, readonly Category[]> = {
  principal: CATEGORIES,
  "school-admin": CATEGORIES,
  accountant: MONEY,
  teacher: ["Students", "Attendance", "Exams", "Homework", "Events"],
  "class-teacher": ["Students", "Attendance", "Exams", "Homework", "Events"],
  hr: ["Staff and HR", "Attendance"],
  "academic-head": ["Attendance", "Exams", "Homework", "Events"],
  "exam-in-charge": ["Exams"],
  "admission-counsellor": ["Admissions"],
  "vice-principal": CATEGORIES.filter((c) => c !== "Salary"),
};

/** The banner at the top of All Reports for a role that sees one kind of report (prototype ROLE_NOTE). */
export const ROLE_NOTE: Record<string, [string, string]> = {
  accountant: ["Money reports only.", "Fees, Finance and Salary, filtered by financial year (April to March)."],
  hr: ["Staff reports only.", "Staff list, leave, joiners and leavers, and staff attendance. Salary figures stay in Salary Management."],
  "academic-head": ["Academic reports only.", "Attendance, exams, homework and PTM, for every class."],
  "exam-in-charge": ["Exam reports only.", "Results, toppers and students below the pass mark, for every class."],
  "admission-counsellor": ["Admission reports only.", "Enquiries to admissions, and how each application is moving."],
  "vice-principal": ["Everything except salary.", "Salary reports stay with the Principal, School Admin and Accountant."],
};

export type PageKey = "all" | "analytics" | "warnings" | "government" | "custom";
export const PAGE_NAMES: Record<PageKey, string> = {
  all: "All Reports", analytics: "Analytics", warnings: "Early Warnings", government: "Government Reports", custom: "Custom & Scheduled Reports",
};
export const PAGE_HREF: Record<PageKey, string> = {
  all: BASE, analytics: `${BASE}/analytics`, warnings: `${BASE}/early-warnings`, government: `${BASE}/government`, custom: `${BASE}/custom`,
};

/** The School Feature that switches on the optional Custom & Scheduled Reports page. */
export const CUSTOM_FEATURE = "reports-custom";

export type ReportAccess = {
  see: Reach;
  /** Full Reports & Analytics: the Principal and School Admin. */
  full: boolean;
  /** Own reach: only their own classes. */
  own: boolean;
  roleKeys: string[];
  /** Categories this person may see, in order. */
  cats: Category[];
  pages: Record<PageKey, boolean>;
  /** Fee Reports (Fee Management View or Full). */
  fees: boolean;
  /** Finance Reports, and whether the full-only ones (Trial balance) show. */
  finance: "full" | "view" | null;
  /** Salary amounts (Full Salary Management). */
  salaryMoney: boolean;
  /** Staff attendance reports. */
  staffAttendance: boolean;
  /** Whole-school task reports. */
  tasks: boolean;
  /** Early Warnings: work on flags (review, plan) for whom; leaders watch and remind. */
  warnings: { on: boolean; review: "all" | "own" | "none"; fees: boolean; feeReview: boolean; rule: boolean };
  /** AI signals on Early Warnings (Settings, Modules On/Off). */
  /** forecastScope "own": a class teacher sees the Looking ahead items about students of their own sections only. */
  ai: { insights: boolean; forecasts: boolean; forecastScope: "all" | "own" };
  /** Results by teacher in Analytics: the Principal and Academic Head only (19 §10). */
  teacherResults: boolean;
};

type Who = Pick<ReportViewer, "permissions" | "roles" | "modulesOn" | "features" | "aiRoles">;

/** Is this module built, switched on and open to the person? */
export function moduleOpen(who: Who, key: ModuleKey) {
  const info = MODULES.find((m) => m.key === key);
  if (!info) return false;
  if (key !== "dashboard" && !BUILT_MODULES.has(key)) return false;
  if (info.optional && !who.modulesOn.has(key)) return false;
  return (who.permissions[key]?.see ?? "none") !== "none";
}

export function reportAccess(who: Who): ReportAccess {
  const p = who.permissions[MODULE] ?? { see: "none", change: "none" };
  const roleKeys = who.roles.map((r) => r.key).filter((k): k is string => Boolean(k));
  const full = p.change === "all";
  const own = p.see === "own";
  const fees = feePageAllowedFor(who, "reports") && who.permissions["fee-management"].see === "all";
  const finance = financePageAllowed(who.permissions, "reports") ? financeLevel(who.permissions) : null;
  const salary = salaryLevel(who.permissions);
  const salaryMoney = salary === "full";
  const att = who.permissions["attendance-management"];
  const isHr = roleKeys.includes("hr");
  const staffAttendance = (att.see === "all" || (att.see === "own" && isHr)) && attendancePages(who).staff !== "hidden";

  // Categories: the roles' lists (widest wins), each module open to the person, and the module's own report rule.
  const allowedByRole = new Set<Category>();
  for (const k of roleKeys.length ? roleKeys : ["none"]) for (const c of ROLE_CATS[k] ?? (k === "none" ? [] : CATEGORIES)) allowedByRole.add(c);
  const tasks = moduleOpen(who, "dashboard") && taskAccess(who) === "full";
  const cats = p.see === "none" ? [] : CATEGORIES.filter((c) => {
    if (!allowedByRole.has(c)) return false;
    if (!moduleOpen(who, CATEGORY_MODULE[c])) return false;
    if (c === "Fees") return fees;
    if (c === "Finance") return finance !== null;
    if (c === "Salary") return salaryMoney;
    if (c === "Tasks") return tasks;
    if (c === "Admissions") return who.permissions["admission-management"].see === "all";
    if (c === "Staff and HR") return who.permissions["staff-hr-management"].see === "all";
    if (c === "Communication" || c === "Front Office") return who.permissions[CATEGORY_MODULE[c]].see === "all";
    return true;
  });

  const vpOrAh = roleKeys.some((k) => k === "vice-principal" || k === "academic-head");
  const warningsOn = p.see !== "none" && (full || own || vpOrAh) && moduleOpen(who, "student-management");
  // Fee signals: only roles with the whole school's fees; never the Academic Head or a teacher.
  const feeSignals = fees && !own && !(roleKeys.includes("academic-head") && !full && !roleKeys.includes("vice-principal"));
  const leader = full || roleKeys.includes("vice-principal");
  const review: "all" | "own" | "none" = own ? "own" : full && pageMode(who, MODULE, "warnings") === "full" ? "all" : "none";
  // AI only for the roles the school chose for the AI assistant (00-global.md §2.1 rule 8): leaders see all of it.
  const ai = aiAllowed(who) && leader;
  // A class teacher sees the forecasts about their own students (19 Early Warnings: "A class teacher sees
  // only their students"; TEACHING-15), when their role is chosen for AI. Never the money ones: fee signals stay with the school's money roles.
  const ownForecasts = !ai && aiAllowed(who) && own && warningsOn;

  return {
    see: p.see, full, own, roleKeys, cats,
    pages: {
      all: p.see !== "none",
      analytics: p.see === "all",
      warnings: warningsOn,
      government: full && moduleOpen(who, "student-management"),
      custom: full && who.features.has(CUSTOM_FEATURE),
    },
    fees, finance, salaryMoney, staffAttendance, tasks,
    warnings: {
      on: warningsOn,
      review,
      fees: feeSignals && warningsOn,
      // Fee flags are reviewed by the people who decide about fees: Full Reports and Full Fee Management (Principal, School Admin).
      feeReview: feeSignals && warningsOn && full && who.permissions["fee-management"].change === "all",
      rule: roleKeys.includes("principal") && full,
    },
    ai: { insights: ai && aiAllowed(who, "ai-insights"), forecasts: (ai || ownForecasts) && aiAllowed(who, "ai-forecasts"), forecastScope: ai ? "all" : "own" },
    teacherResults: roleKeys.includes("principal") || roleKeys.includes("academic-head"),
  };
}

/** The page tabs this person may open, in the prototype's order. */
export function reportTabs(a: ReportAccess) {
  return (Object.keys(PAGE_NAMES) as PageKey[]).filter((k) => a.pages[k]).map((k) => ({ href: PAGE_HREF[k], label: PAGE_NAMES[k], exact: k === "all", also: k === "all" ? [`${BASE}/r`] : undefined }));
}
