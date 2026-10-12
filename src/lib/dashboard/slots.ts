// Registry slots for the modules being built at the same time as the
// Dashboard (none: Attendance, Fee and Finance Management are built; their widgets are in ./widgets).
// Their records do not exist yet
// in this branch, so these slots have no loader and draw nothing. When a
// module is merged, its loaders are written against its own records, added to
// src/lib/dashboard/registry.ts, and the slot below is removed.

import type { WidgetSlot } from "./types";

export const SLOTS: readonly WidgetSlot[] = [
];

/** Where "Take attendance" on a period goes: Attendance Management is built, so this lives with its widgets. */
export { attendanceTakeHref } from "./widgets/attendance";
