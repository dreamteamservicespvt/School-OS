// The Dashboard widget registry (01-dashboard.md §2, §4 "Receives").
// Each module registers the numbers, attention cards, agenda lines and
// panels it gives the Dashboard, with the homes that show them and a loader
// that reads real data within the person's reach. A widget is drawn only when
// its module is built (BUILT_MODULES), switched on for the school, and the
// person may open it; otherwise it is never loaded. Modules being built in
// parallel have a slot in ./slots.ts until they are merged.
import "server-only";

import { approvalsFor } from "../approvals";
import { reach, plural, n } from "./common";
import { setupProgress, setupSteps } from "./setup";
import type { Widget } from "./types";
import { ACADEMIC_WIDGETS } from "./widgets/academic";
import { STUDENT_WIDGETS } from "./widgets/students";
import { STAFF_WIDGETS } from "./widgets/staff";
import { COMMUNICATION_WIDGETS } from "./widgets/communication";
import { EXAM_WIDGETS } from "./widgets/exams";
import { ADMISSION_WIDGETS } from "./widgets/admissions";
import { ATTENDANCE_WIDGETS } from "./widgets/attendance";
import { MONEY_WIDGETS } from "./widgets/money";
import { SALARY_WIDGETS } from "./widgets/salary";
import { FRONT_OFFICE_WIDGETS } from "./widgets/front-office";
import { EVENTS_WIDGETS } from "./widgets/events";

/** Approvals waiting for this person, as the top bar and Approvals count them. */
const approvalsBand: Widget<"band"> = {
  id: "approvals.waiting",
  module: "dashboard",
  kind: "band",
  homes: ["leader"],
  async load(c) {
    const where = await approvalsFor(c.tx, c.viewer.ctx, c.viewer.roles.map((r) => r.key));
    const [count, overdue] = await Promise.all([
      c.tx.approval.count({ where }),
      c.tx.approval.count({ where: { AND: [where, { createdAt: { lt: new Date(c.now.getTime() - 2 * 86_400_000) } }] } }),
    ]);
    return { id: "approvals.waiting", label: "Waiting for you", big: n(count), foot: count ? (overdue ? `${n(overdue)} waiting over 2 days` : "Approvals to decide") : "Nothing to decide", href: "/approvals" };
  },
};

/** "Setup: 6 of 10 steps done" for the School Admin and the Principal, until it is complete. */
const setupAttention: Widget<"attention"> = {
  id: "settings.setup",
  module: "settings",
  kind: "attention",
  homes: ["leader"],
  allowed: (v) => reach(v, "settings", "edit") === "all",
  async load(c) {
    const steps = await setupSteps(c.tx, c.viewer.ctx, c.viewer);
    const p = setupProgress(steps);
    if (p.complete) return null;
    return {
      id: "settings.setup", tone: "info", icon: "ListChecks",
      title: `Setup: ${p.done} of ${plural(p.total, "step")} done`,
      detail: p.next ? `Next: ${p.next.label}` : "Finish the remaining steps",
      action: "Continue", href: "/dashboard/setup", value: String(p.done),
    };
  },
};

/** Every widget, in the order they fill each home (earlier = more important). */
export const WIDGETS: readonly Widget[] = [
  approvalsBand,
  setupAttention,
  ...ACADEMIC_WIDGETS,
  ...ATTENDANCE_WIDGETS,
  ...STUDENT_WIDGETS,
  ...STAFF_WIDGETS,
  ...COMMUNICATION_WIDGETS,
  ...EXAM_WIDGETS,
  ...ADMISSION_WIDGETS,
  ...MONEY_WIDGETS,
  ...SALARY_WIDGETS,
  ...FRONT_OFFICE_WIDGETS,
  ...EVENTS_WIDGETS,
];

export { SLOTS } from "./slots";
