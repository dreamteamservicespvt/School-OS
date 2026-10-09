// The ready roles and role templates, copied from docs/blueprint/05-roles.md.
// Each school gets its own copy of these when it is created, and can change
// them in Settings, Users & Permissions.

import { MODULE_KEYS, type ModuleKey } from "./modules";

export type AccessLevel = "full" | "view" | "own" | "none";
export type RolePermissions = Record<ModuleKey, AccessLevel>;

export type RoleTemplate = {
  key: string;
  name: string;
  /** Ready roles are on from the first day; templates start switched off. */
  kind: "READY" | "TEMPLATE";
  /** Two-step login (00-global.md §5): Principal, Accountant and School Admin. */
  requiresTwoStep: boolean;
  permissions: RolePermissions;
};

const MARK: Record<string, AccessLevel> = { Full: "full", View: "view", Own: "own", "-": "none" };

/** Turns one column of the 05-roles.md table (modules 1 to 20, in order) into permissions. */
function column(marks: string): RolePermissions {
  const cells = marks.trim().split(/\s+/);
  if (cells.length !== MODULE_KEYS.length) {
    throw new Error(`A role column needs ${MODULE_KEYS.length} marks, got ${cells.length}`);
  }
  return Object.fromEntries(MODULE_KEYS.map((key, i) => [key, MARK[cells[i]]])) as RolePermissions;
}

// Columns read top to bottom: modules 1 (Dashboard) to 20 (Settings).
export const READY_ROLES: readonly RoleTemplate[] = [
  { key: "principal", name: "Principal", kind: "READY", requiresTwoStep: true,
    permissions: column("Full Full Full Full Full Full Full Full Full Full Full Full Full Full Full Full Full Full Full Full") },
  { key: "school-admin", name: "School Admin", kind: "READY", requiresTwoStep: true,
    permissions: column("Full Full Full Full Full Full Full Full Full Full Full Full Full Full Full Full Full Full Full Full") },
  { key: "accountant", name: "Accountant", kind: "READY", requiresTwoStep: true,
    permissions: column("Own - View - - Full Full - Own Full Own - - View - - - View View -") },
  { key: "teacher", name: "Teacher", kind: "READY", requiresTwoStep: false,
    permissions: column("Own - Own Own Own - - Own Own Own Own - - - - - Own Own Own -") },
  { key: "class-teacher", name: "Class Teacher", kind: "READY", requiresTwoStep: false,
    permissions: column("Own - Own Own Own - - Own Own Own Own - - - - - Own Own Own -") },
  { key: "receptionist", name: "Receptionist / Front Office", kind: "READY", requiresTwoStep: false,
    permissions: column("Own Own View - - - - - Own Own Own - - - - Full - View - -") },
  { key: "transport-in-charge", name: "Transport In-charge", kind: "READY", requiresTwoStep: false,
    permissions: column("Own - - - - - - - Own Own Own Full - - - - - View - -") },
  { key: "librarian", name: "Librarian", kind: "READY", requiresTwoStep: false,
    permissions: column("Own - View - - - - - Own Own - - Full - - - - View - -") },
  { key: "hostel-warden", name: "Hostel Warden", kind: "READY", requiresTwoStep: false,
    permissions: column("Own - Own - - - - - Own Own - - - - Full - - View - -") },
  { key: "store-keeper", name: "Store Keeper", kind: "READY", requiresTwoStep: false,
    permissions: column("Own - - - - - - - Own Own - - - Full - - - View - -") },
];

export const ROLE_TEMPLATES: readonly RoleTemplate[] = [
  { key: "vice-principal", name: "Vice Principal", kind: "TEMPLATE", requiresTwoStep: false,
    permissions: column("Full View Full Full Full View View Full View Own Full View View View View View Full Full View -") },
  { key: "academic-head", name: "Academic Head", kind: "TEMPLATE", requiresTwoStep: false,
    permissions: column("Own - View Full View - - Full Own Own Own - - - - - Full View View -") },
  { key: "hr", name: "HR", kind: "TEMPLATE", requiresTwoStep: false,
    permissions: column("Own - - - Own - - - Full View Own - - - - - - View View -") },
  { key: "office-staff", name: "Office Staff", kind: "TEMPLATE", requiresTwoStep: false,
    permissions: column("Own Full Full Own Own - - Own Own Own Own - - - - View - View - -") },
  { key: "exam-in-charge", name: "Exam In-charge", kind: "TEMPLATE", requiresTwoStep: false,
    permissions: column("Own - View View - - - Full Own Own Own - - - - - - View View -") },
  { key: "admission-counsellor", name: "Admission Counsellor", kind: "TEMPLATE", requiresTwoStep: false,
    permissions: column("Own Full View - - View - - Own Own Own - - - - - - View View -") },
  { key: "counsellor", name: "Counsellor", kind: "TEMPLATE", requiresTwoStep: false,
    permissions: column("Own - Own - - - - - Own Own Own - - - - - - View - -") },
  { key: "gate-security", name: "Gate Security", kind: "TEMPLATE", requiresTwoStep: false,
    permissions: column("Own - View - - - - - Own Own - - - - - Own - View - -") },
  { key: "driver", name: "Driver", kind: "TEMPLATE", requiresTwoStep: false,
    permissions: column("- - - - - - - - - - - Own - - - - - - - -") },
  { key: "student", name: "Student", kind: "TEMPLATE", requiresTwoStep: false,
    permissions: column("- - - - - - - - - - - - - - - - Own - - -") },
];

export const ALL_ROLE_TEMPLATES: readonly RoleTemplate[] = [...READY_ROLES, ...ROLE_TEMPLATES];
