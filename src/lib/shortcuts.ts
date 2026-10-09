// Shortcuts shown in the empty Search box, by role (00-global.md §1.1).
// Inferred: the shortcut list per role. Each opens its module until the
// module's own pages are built.
import type { ModuleKey } from "./modules";
import type { PermissionMap } from "./permissions";

export type Shortcut = { label: string; href: string; module: ModuleKey };

const BY_ROLE: Record<string, Shortcut[]> = {
  principal: [
    { label: "Dashboard", href: "/dashboard", module: "dashboard" },
    { label: "Approvals", href: "/approvals", module: "dashboard" },
    { label: "Reports", href: "/reports-analytics", module: "reports-analytics" },
    { label: "Find a student", href: "/student-management", module: "student-management" },
  ],
  "school-admin": [
    { label: "Users & Permissions", href: "/settings", module: "settings" },
    { label: "School Profile", href: "/settings", module: "settings" },
    { label: "Add a student", href: "/student-management", module: "student-management" },
    { label: "Add staff", href: "/staff-hr-management/add", module: "staff-hr-management" },
  ],
  accountant: [
    { label: "Collect Fee", href: "/fee-management", module: "fee-management" },
    { label: "Defaulters", href: "/fee-management", module: "fee-management" },
    { label: "Day Book", href: "/finance-management", module: "finance-management" },
    { label: "Add expense", href: "/finance-management", module: "finance-management" },
  ],
  teacher: [
    { label: "Take Attendance", href: "/attendance-management", module: "attendance-management" },
    { label: "My Time Table", href: "/academic-management", module: "academic-management" },
    { label: "Give homework", href: "/homework-learning", module: "homework-learning" },
    { label: "Marks Entry", href: "/examination-results", module: "examination-results" },
  ],
  "class-teacher": [
    { label: "Take Attendance", href: "/attendance-management", module: "attendance-management" },
    { label: "My section", href: "/student-management", module: "student-management" },
    { label: "Marks Entry", href: "/examination-results", module: "examination-results" },
  ],
  receptionist: [
    { label: "New enquiry", href: "/admission-management", module: "admission-management" },
    { label: "Visitors", href: "/front-office", module: "front-office" },
    { label: "Find a student", href: "/student-management", module: "student-management" },
  ],
  "transport-in-charge": [{ label: "Buses today", href: "/transport-management", module: "transport-management" }],
  librarian: [{ label: "Issue a book", href: "/library-management", module: "library-management" }],
  "hostel-warden": [{ label: "Roll call", href: "/hostel-management", module: "hostel-management" }],
  "store-keeper": [{ label: "Stock", href: "/inventory-management", module: "inventory-management" }],
};

export function shortcutsFor(roleKeys: (string | null)[], permissions: PermissionMap, visible: Set<string>): Shortcut[] {
  const seen = new Set<string>();
  const list: Shortcut[] = [];
  for (const key of roleKeys) {
    for (const s of BY_ROLE[key ?? ""] ?? []) {
      if (seen.has(s.label) || permissions[s.module].see === "none" || !visible.has(s.module)) continue;
      seen.add(s.label);
      list.push(s);
    }
  }
  return list.slice(0, 6);
}
