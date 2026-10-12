// Registry slots for the modules being built at the same time as the
// Dashboard (Fee Management, Attendance Management, Admission Management,
// Examination & Results, Finance Management). Their records do not exist yet
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
  // ------------------------------------------------ 06 Fee Management
  { id: "fees.collected-today", module: "fee-management", kind: "band", homes: ["leader", "accountant"], shows: "Fees collected today in rupees, foot 'N payments · M by UPI'. Opens Fee Dashboard, Recent Payments for today; matches the Day Book." },
  { id: "fees.cheques-to-verify", module: "fee-management", kind: "band", homes: ["accountant"], shows: "Cheques to verify: count, foot amount and oldest date. Opens the cheque list." },
  { id: "fees.defaulters", module: "fee-management", kind: "band", homes: ["accountant"], shows: "Defaulters count, foot overdue amount and 'over 30 days'. Opens Defaulters." },
  { id: "fees.overdue", module: "fee-management", kind: "attention", homes: ["leader", "accountant"], shows: "'₹X overdue from N students'. Opens Fee Management, Defaulters." },
  { id: "fees.failed-online", module: "fee-management", kind: "attention", homes: ["leader", "accountant"], shows: "Failed or unmatched online payments (A7, A8). Opens the payment list filtered to them." },
  { id: "fees.collection-chart", module: "fee-management", kind: "panel", homes: ["leader"], shows: "Panel 'Fee collection': collected against due by month this year, with the total and %." },
  { id: "fees.recent-payments", module: "fee-management", kind: "panel", homes: ["leader", "accountant"], shows: "Panel 'Recent payments' with 'Collect fee'; each row opens the receipt." },
  { id: "fees.setup-step", module: "fee-management", kind: "attention", homes: ["leader"], shows: "Setup checklist step 'Fee structure' (src/lib/dashboard/setup.ts FEE_STEP): done when a fee structure exists for the current year." },
  // ------------------------------------------------ 07 Finance Management
  { id: "finance.money-today", module: "finance-management", kind: "panel", homes: ["accountant"], shows: "Panel 'Money today': collected, cheques to verify, expenses paid, cash in hand, with Record expense, View payments, Fee reminder, Reports." },
  { id: "finance.day-book", module: "finance-management", kind: "band", homes: ["accountant"], shows: "Day Book: 'Not closed' with the date and cash to count, or 'Closed'. Opens the Day Book." },
  { id: "finance.day-book-open", module: "finance-management", kind: "attention", homes: ["accountant"], shows: "'Day Book for 8 Oct is not closed'. Opens the Day Book for that date." },
  { id: "finance.expenses", module: "finance-management", kind: "attention", homes: ["leader"], shows: "Expenses today, this month and pending approval; income vs expense this month. Opens Expenses with the same filters." },
  // ------------------------------------------------ 02 Admission Management
  { id: "admissions.new-enquiries", module: "admission-management", kind: "band", homes: ["leader", "receptionist", "admission"], shows: "New enquiries (today, or this week for the leader), foot 'N visits booked this week'. Opens Enquiries filtered to new." },
  { id: "admissions.pending-applications", module: "admission-management", kind: "attention", homes: ["leader", "admission", "office"], shows: "'N applications waiting for a decision'. Opens Applications filtered to waiting." },
  { id: "admissions.follow-ups", module: "admission-management", kind: "attention", homes: ["receptionist", "admission"], shows: "Enquiry follow-up calls due or overdue. Opens Enquiries filtered to follow-up due." },
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
