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
import type { StillWaiting } from "./approval-waiting";
import { followUps as privacy, unfinished as privacyWaiting } from "./data-security/privacy";
import { followUps as staff, unfinished as staffWaiting } from "./staff/handlers";
import { followUps as exams, approvalLinks as examLinks, unfinished as examsWaiting } from "./exams/handlers";
import { followUps as admission, approvalLinks as admissionLinks, unfinished as admissionWaiting } from "./admission/handlers";
import { followUps as communication, approvalLinks as communicationLinks, unfinished as communicationWaiting } from "./communication/handlers";
import { followUps as students, unfinished as studentsWaiting } from "./students/handlers";
import { followUps as attendance, approvalLinks as attendanceLinks, unfinished as attendanceWaiting } from "./attendance/handlers";
import { followUps as fees, approvalLinks as feeLinks, unfinished as feesWaiting } from "./fees/handlers";
import { followUps as finance, approvalLinks as financeLinks, unfinished as financeWaiting } from "./finance/handlers";
import { followUps as salary, approvalLinks as salaryLinks, unfinished as salaryWaiting } from "./salary/handlers";
import { followUps as transport, approvalLinks as transportLinks, unfinished as transportWaiting } from "./transport/handlers";
import { followUps as library, approvalLinks as libraryLinks, unfinished as libraryWaiting } from "./library/handlers";
import { followUps as hostel, approvalLinks as hostelLinks, unfinished as hostelWaiting } from "./hostel/handlers";
import { followUps as inventory, approvalLinks as inventoryLinks, unfinished as inventoryWaiting } from "./inventory/handlers";

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
  // Which decided requests still have a record waiting (Approvals, "Approved, but not finished"): one check per type that can be asked for.
  const waiting = {
    ...privacyWaiting, ...staffWaiting, ...examsWaiting, ...admissionWaiting, ...communicationWaiting, ...studentsWaiting, ...attendanceWaiting,
    ...feesWaiting, ...financeWaiting, ...salaryWaiting, ...transportWaiting, ...libraryWaiting, ...hostelWaiting, ...inventoryWaiting,
  } satisfies Record<AskableType, StillWaiting>;
  return { followUps: followUps as Partial<Record<string, FollowUp>>, links: links as Partial<Record<string, LinkMaker>>, waiting: waiting as Partial<Record<string, StillWaiting>> };
}
let lists: ReturnType<typeof build> | null = null;
const all = () => (lists ??= build());

/** The follow-up for a request type; null for a type nothing can ask for (or an unknown one). */
export function followUpOf(type: string): FollowUp | null {
  return Object.hasOwn(all().followUps, type) ? (all().followUps[type] ?? null) : null;
}

/** The check for decided requests of a type whose record still waits on them; null for a type nothing can ask for. */
export function unfinishedOf(type: string): StillWaiting | null {
  return Object.hasOwn(all().waiting, type) ? (all().waiting[type] ?? null) : null;
}

/** Every request type's check, for the Approvals page. */
export function unfinishedChecks(): [string, StillWaiting][] {
  return Object.entries(all().waiting).filter((e): e is [string, StillWaiting] => typeof e[1] === "function");
}

/** Where a request type's record opens, if it has a page. */
export function approvalLinkOf(type: string): LinkMaker | null {
  return Object.hasOwn(all().links, type) ? (all().links[type] ?? null) : null;
}
