// Registry slots for the modules being built at the same time as the
// Dashboard (Fee Management, Finance Management). Attendance Management is
// built: its widgets are in ./widgets/attendance.ts.
// Their records do not exist yet
// in this branch, so these slots have no loader and draw nothing. When a
// module is merged, its loaders are written against its own records, added to
// src/lib/dashboard/registry.ts, and the slot below is removed.

import type { WidgetSlot } from "./types";

export const SLOTS: readonly WidgetSlot[] = [
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
];

/** Where "Take attendance" on a period goes: Attendance Management is built, so this lives with its widgets. */
export { attendanceTakeHref } from "./widgets/attendance";
