// The report catalogue (19 §2): every report of every built module, in the
// blueprint's categories. Each module's reports are listed here as that
// module is built; Inventory is not built, so it
// have none yet. Only reports the person may see are offered.
import "server-only";

import { CATEGORIES, CATEGORY_MODULE, type Category, type ReportEntry, type ReportViewer } from "../types";
import { moduleOpen, type ReportAccess } from "../access";
import { STUDENT_REPORTS } from "./students";
import { MONEY_REPORTS } from "./money";
import { ACADEMIC_REPORTS } from "./academic";
import { PEOPLE_REPORTS } from "./people";
import { TRANSPORT_REPORTS } from "./transport";
import { LIBRARY_REPORTS } from "./library";
import { HOSTEL_REPORTS } from "./hostel";

const ALL: ReportEntry[] = [...STUDENT_REPORTS, ...PEOPLE_REPORTS, ...ACADEMIC_REPORTS, ...MONEY_REPORTS, ...TRANSPORT_REPORTS, ...LIBRARY_REPORTS, ...HOSTEL_REPORTS];

/** Every report, in category order. */
export const CATALOGUE: readonly ReportEntry[] = CATEGORIES.flatMap((c) => ALL.filter((e) => e.category === c));

/** Reports inside an allowed category that are still not for a role (prototype ROLE_NOT): whole-school student reports are not for teachers. */
const ROLE_NOT: Record<string, string[]> = {
  "academic-head": ["at-staff", "at-overtime", "at-devices"],
};
/** HR sees only staff attendance in Attendance (prototype ROLE_ONLY). */
const ROLE_ONLY: Record<string, Partial<Record<Category, string[]>>> = {
  hr: { Attendance: ["at-staff", "at-overtime", "at-devices", "at-late"] },
};

export function findEntry(key: string) {
  return CATALOGUE.find((e) => e.key === key) ?? null;
}

/** May this person open this report? Checked on the server for the page, every file and every background run. */
export function entryAllowed(e: ReportEntry, a: ReportAccess, who: Pick<ReportViewer, "features" | "permissions" | "roles" | "modulesOn">) {
  if (!a.cats.includes(e.category)) return false;
  if (!moduleOpen(who, CATEGORY_MODULE[e.category])) return false;
  // Own reach: only reports that can be narrowed to the person's own classes.
  if (a.own && !e.own) return false;
  const roles = a.roleKeys;
  const wide = a.full || roles.some((k) => !ROLE_NOT[k] && !ROLE_ONLY[k]);
  if (!wide) {
    if (roles.every((k) => ROLE_NOT[k]?.includes(e.key))) return false;
    if (roles.every((k) => { const only = ROLE_ONLY[k]?.[e.category]; return only ? !only.includes(e.key) : false; })) return false;
  }
  return e.allowed ? e.allowed(a, who) : true;
}

export function catalogueFor(a: ReportAccess, who: Pick<ReportViewer, "features" | "permissions" | "roles" | "modulesOn">) {
  return CATALOGUE.filter((e) => entryAllowed(e, a, who));
}
