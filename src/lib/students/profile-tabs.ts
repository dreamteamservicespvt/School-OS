// Tabs other modules add to the Student Profile (03 §2, Student Profile tabs).
// Attendance, Fees, Exams, Homework, Transport, Library, Activities and
// Communication each register one tab when their module is built:
//
//   registerProfileTab({ key: "fees", label: "Fees", module: "fee-management", order: 40,
//     load: async ({ current, studentId }) => <FeesTab ... /> });
//
// and add one import line to src/lib/students/profile-tab-modules.ts. A tab
// shows only when the person may view its module and the module is switched
// on (P19); nothing is shown for modules that are not built.
import "server-only";

import type { ReactNode } from "react";
import type { Current } from "../current";
import type { ModuleKey } from "../modules";
import { MODULES } from "../modules";
import { can, type Action } from "../permissions";

export type ProfileTabArgs = {
  current: Current;
  studentId: string;
  /** The academic year shown on the profile. */
  academicYearId: string | null;
  /** The page address's own values (for example ?month=2026-08 on a calendar), so a tab's view can be shared. */
  searchParams?: Record<string, string | undefined>;
};

export type SummaryItem = {
  label: string;
  value: string;
  /** One small line under the value, e.g. "This year" or "Overdue". */
  sub?: string;
  href?: string;
  tone?: "success" | "warning" | "danger" | "neutral";
};

export type ProfileTab = {
  key: string;
  label: string;
  module: ModuleKey;
  /** Place among the tabs, as in the spec's table: Overview 10, Academics 20, Attendance 30, Fees 40, Exams 50, Homework 60, Transport 70, Library 80, Activities 90, Behaviour 100, Documents 110, Communication 120. */
  order: number;
  /** The permission needed in the tab's own module (default "view"). */
  permission?: Action;
  /** The tab's content, a server component. */
  load: (args: ProfileTabArgs) => Promise<ReactNode>;
  /** Items for the summary strip (attendance %, fee status...). */
  summary?: (args: ProfileTabArgs) => Promise<SummaryItem[]>;
  /** Items for the Today panel (today's attendance, fees due today...). */
  today?: (args: ProfileTabArgs) => Promise<SummaryItem[]>;
  /** Optional narrower check than the module permission, e.g. a role that sees only part of the module. */
  allowed?: (current: Pick<Current, "permissions" | "modulesOn"> & Partial<Pick<Current, "roles">>) => boolean;
  /** Actions for the profile header ("Collect fee", "Mark attendance"). */
  headerActions?: (args: ProfileTabArgs) => Promise<{ label: string; href: string }[]>;
};

const tabs = new Map<string, ProfileTab>();

export function registerProfileTab(tab: ProfileTab) {
  tabs.set(tab.key, tab);
}

/** The registered tabs this person may open, in order. */
export function profileTabsFor(current: Pick<Current, "permissions" | "modulesOn"> & Partial<Pick<Current, "roles">>): ProfileTab[] {
  return [...tabs.values()]
    .filter((t) => {
      const info = MODULES.find((m) => m.key === t.module);
      if (info?.optional && !current.modulesOn.has(t.module)) return false;
      return can(current.permissions, t.module, t.permission ?? "view") && (t.allowed?.(current) ?? true);
    })
    .sort((a, b) => a.order - b.order);
}

/** For tests. */
export function clearProfileTabs() {
  tabs.clear();
}
