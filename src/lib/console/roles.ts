// DREAM TEAM's own roles in the Super Admin console (07-super-admin.md §2).
// Every console page and action checks these on the server; buttons a role
// cannot use are hidden, never just greyed out.
import type { ConsoleRole } from "@prisma/client";

export const CONSOLE_ROLES: Record<ConsoleRole, { label: string; does: string }> = {
  OWNER: { label: "Owner", does: "Everything, including the Team page, closing a school, discounts and marking a bank transfer or cheque as paid." },
  ONBOARDING: { label: "Onboarding", does: "Adds schools, creates and resends School Admin invites, sees setup progress, starts trials. Cannot close a school." },
  SUPPORT: { label: "Support", does: "Sees schools and their admins, resends invites, resets an admin’s login. Cannot add or close schools." },
};

export const ROLE_ORDER: ConsoleRole[] = ["OWNER", "ONBOARDING", "SUPPORT"];

export type ConsoleAction =
  /** Add School. */
  | "add"
  /** Send, resend or cancel a School Admin invite; add another School Admin. */
  | "invite"
  /** Reset an admin's login; change an admin's mobile number. */
  | "reset"
  /** Disable a School Admin. */
  | "disable"
  /** Edit a school's details before its admin first signs in. */
  | "edit"
  /** Trial to Active, and Suspended to Active. */
  | "activate"
  /** Suspend, close and reopen a school. */
  | "status"
  /** Choose or change a school's plan and add-ons. */
  | "plan"
  /** Make, send and resend invoices. */
  | "invoice"
  /** Mark an invoice paid by bank transfer or cheque; cancel an invoice. */
  | "markPaid"
  /** OK a top-up invoice the software made. */
  | "approve"
  /** Group discount and founding school. */
  | "discount"
  /** The Team page. */
  | "team"
  /** Set a school's Group. */
  | "group"
  /** Make a top-up invoice for more students than paid for. */
  | "topup"
  /** Change the price list. */
  | "prices";

const ALL: ConsoleAction[] = ["add", "invite", "reset", "disable", "edit", "activate", "status", "plan", "invoice", "markPaid", "approve", "discount", "team", "group", "topup", "prices"];

export const CONSOLE_CAN: Record<ConsoleRole, ConsoleAction[]> = {
  OWNER: ALL,
  ONBOARDING: ["add", "invite", "edit", "activate", "plan", "invoice", "group", "topup"],
  SUPPORT: ["invite", "reset", "disable"],
};

export function consoleCan(role: ConsoleRole, action: ConsoleAction): boolean {
  return CONSOLE_CAN[role].includes(action);
}

export const roleLabel = (role: ConsoleRole) => CONSOLE_ROLES[role].label;
