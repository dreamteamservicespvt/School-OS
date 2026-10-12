// Registry slots for the modules being built at the same time as the
// Dashboard (Attendance Management).
// Their records do not exist yet
// in this branch, so these slots have no loader and draw nothing. When a
// module is merged, its loaders are written against its own records, added to
// src/lib/dashboard/registry.ts, and the slot below is removed.

import type { WidgetSlot } from "./types";

export const SLOTS: readonly WidgetSlot[] = [
  // ------------------------------------------------ 05 Attendance Management
  { id: "attendance.students-present", module: "attendance-management", kind: "band", homes: ["leader"], shows: "Students present today, 'present / total', ring %, foot 'N absent, M late'. Opens the Attendance Register for today (and Absent filter from the foot)." },
  { id: "attendance.staff-present", module: "attendance-management", kind: "band", homes: ["leader", "hr"], shows: "Staff present today / staff expected, foot 'N on leave · M not in yet'. Opens Staff Attendance for today." },
  { id: "attendance.taken-today", module: "attendance-management", kind: "band", homes: ["teacher"], shows: "My periods with attendance taken / my periods today, foot 'X is waiting now'. Opens Take Attendance." },
  { id: "attendance.my-section-today", module: "attendance-management", kind: "band", homes: ["class-teacher"], shows: "My section today: 'Not taken' or 'present / total', foot 'N students · locks HH:MM'. Opens Take Attendance for the section." },
  { id: "attendance.student-leave", module: "attendance-management", kind: "band", homes: ["class-teacher", "office"], shows: "Student leave requests waiting for me. Opens Student Leave filtered to waiting." },
  { id: "attendance.absent-streak", module: "attendance-management", kind: "attention", homes: ["leader", "class-teacher"], shows: "'N students absent 3 days in a row' (days from Attendance Settings, chronic absenteeism alert). Opens the Attendance Register filtered to those students. Disappears when they are marked present." },
  { id: "attendance.below-threshold", module: "attendance-management", kind: "attention", homes: ["leader", "academic-head"], shows: "Risk signal: 'Class 9 B attendance fell below 80% this week'. Opens the register for that section and week." },
  { id: "attendance.not-taken", module: "attendance-management", kind: "attention", homes: ["class-teacher"], shows: "'Take attendance for 7 B · locks at 11:00 AM'. Opens Take Attendance." },
  { id: "attendance.week-by-class", module: "attendance-management", kind: "panel", homes: ["leader", "academic-head"], shows: "Panel 'Attendance this week': % by class group with the 90% goal line. Each bar opens the register for that class and week." },
  { id: "attendance.take-for-period", module: "attendance-management", kind: "panel", homes: ["teacher", "class-teacher"], shows: "The Take attendance button and 'Taken' mark on each row of 'My classes today' (attendanceTakeHref below)." },
];

/**
 * Where "Take attendance" on a period of "My classes today" goes. Null until
 * Attendance Management is merged; then it returns its Take Attendance page
 * for that section, period and date (slot "attendance.take-for-period").
 */
export function attendanceTakeHref(period: { sectionId: string; periodNo: number; date: Date }): string | null {
  void period;
  return null;
}
