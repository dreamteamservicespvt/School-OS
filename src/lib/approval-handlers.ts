// What happens to the record behind each kind of request once it is decided
// (00-global.md §3.4), and where each request's record opens (§3.3). One
// explicit list, not a side effect of some other import: decide() in
// ./approvals.ts loads it itself, so a decision made anywhere (a module's own
// screen, Approvals, bulk approve, escalation) always moves the record on,
// even on a server that has just started. TypeScript refuses the list when a
// request type that can be asked for (AskableType) has no follow-up.
//
// A module that asks for approvals exports `followUps` (and `approvalLinks`)
// from its handlers file, and adds one line to each list below.
import "server-only";

import type { AskableType, FollowUp } from "./approvals";
import type { LinkMaker } from "./approval-links";
import { followUps as privacy } from "./data-security/privacy";
import { followUps as staff } from "./staff/handlers";
import { followUps as exams, approvalLinks as examLinks } from "./exams/handlers";
import { followUps as admission, approvalLinks as admissionLinks } from "./admission/handlers";
import { followUps as communication, approvalLinks as communicationLinks } from "./communication/handlers";
import { followUps as students } from "./students/handlers";
import { followUps as attendance, approvalLinks as attendanceLinks } from "./attendance/handlers";
import { followUps as fees, approvalLinks as feeLinks } from "./fees/handlers";
import { followUps as finance, approvalLinks as financeLinks } from "./finance/handlers";
import { followUps as salary, approvalLinks as salaryLinks } from "./salary/handlers";
import { followUps as transport, approvalLinks as transportLinks } from "./transport/handlers";
import { followUps as library, approvalLinks as libraryLinks } from "./library/handlers";
import { followUps as hostel, approvalLinks as hostelLinks } from "./hostel/handlers";
import { followUps as inventory, approvalLinks as inventoryLinks } from "./inventory/handlers";

// Built on first use: the modules' files import ./approvals.ts, which may still be loading when this file is.
function build() {
  const followUps = {
    ...privacy, ...staff, ...exams, ...admission, ...communication, ...students, ...attendance,
    ...fees, ...finance, ...salary, ...transport, ...library, ...hostel, ...inventory,
  } satisfies Record<AskableType, FollowUp>;
  const links = {
    ...examLinks, ...admissionLinks, ...communicationLinks, ...attendanceLinks, ...feeLinks, ...financeLinks,
    ...salaryLinks, ...transportLinks, ...libraryLinks, ...hostelLinks, ...inventoryLinks,
  } satisfies Partial<Record<AskableType, LinkMaker>>;
  return { followUps: followUps as Partial<Record<string, FollowUp>>, links: links as Partial<Record<string, LinkMaker>> };
}
let lists: ReturnType<typeof build> | null = null;
const all = () => (lists ??= build());

/** The follow-up for a request type; null for a type nothing can ask for (or an unknown one). */
export function followUpOf(type: string): FollowUp | null {
  return Object.hasOwn(all().followUps, type) ? (all().followUps[type] ?? null) : null;
}

/** Where a request type's record opens, if it has a page. */
export function approvalLinkOf(type: string): LinkMaker | null {
  return Object.hasOwn(all().links, type) ? (all().links[type] ?? null) : null;
}
