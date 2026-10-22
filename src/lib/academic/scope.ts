// Who may see and change what in Academic Management (05-roles.md):
// Principal and School Admin: everything. Teacher and Class Teacher (Own):
// their own sections, Time Table, syllabus progress and lesson plans.
// Office Staff (Own): arranging substitutions and keeping the Time Table.
import "server-only";

import type { Tx } from "../db";
import type { Current } from "../current";
import { reachFor } from "../permissions";
import { ownSectionIds, staffForUser } from "../people";
import { narrowSections } from "../campus";

export type AcademicScope = {
  /** "all" or "own". */
  see: "all" | "own";
  /** Can set up classes, subjects, allocations and settings. */
  manage: boolean;
  /** Can edit the Time Table and arrange substitutions. */
  arrange: boolean;
  /** The person's Staff record, if any. */
  staffId: string | null;
  /** Sections the person may see, or null for every section (never null for a person limited to one campus). */
  sectionIds: string[] | null;
  /** May make authorised corrections in a closed year. */
  canCorrect: boolean;
};

/**
 * Arranges substitutions and keeps the Time Table: full Academic Management,
 * or the Office Staff template's Own (05-roles.md). Needs no database.
 */
export function arrangesTimetable(current: Pick<Current, "permissions" | "roles">): boolean {
  const change = reachFor(current.permissions, "academic-management", "edit");
  return change === "all" || (change === "own" && current.roles.some((r) => r.key === "office-staff"));
}

/**
 * Where a page sends a person on Own reach (05-roles.md): teachers have their
 * own Time Table and Syllabus only, so other pages send them home or to No
 * access. Pages marked `arrangerOk` (Classes & Sections to see, Substitutions)
 * stay open to the Office Staff template, who arrange substitutions.
 */
export function ownPageRedirect(current: Pick<Current, "permissions" | "roles">, opts: { notForOwn?: "home" | "no-access"; arrangerOk?: boolean }): "home" | "no-access" | null {
  if (!opts.notForOwn || reachFor(current.permissions, "academic-management", "view") !== "own") return null;
  if (opts.arrangerOk && arrangesTimetable(current)) return null;
  return opts.notForOwn;
}

export async function academicScope(tx: Tx, current: Current, yearId: string | null): Promise<AcademicScope> {
  const see = reachFor(current.permissions, "academic-management", "view");
  const change = reachFor(current.permissions, "academic-management", "edit");
  const staff = await staffForUser(tx, current.ctx);
  const office = change === "own" && arrangesTimetable(current);
  const own = see !== "all";
  const allowed = own && !office ? (yearId ? await ownSectionIds(tx, current.ctx, yearId) : []) : null;
  return {
    see: own ? "own" : "all",
    manage: change === "all",
    arrange: arrangesTimetable(current),
    staffId: staff?.id ?? null,
    // One campus (05-roles.md): "every section" becomes every section of that campus (all its years).
    sectionIds: await narrowSections(tx, current, allowed),
    canCorrect: change === "all" && current.roles.some((r) => r.key === "principal" || r.key === "school-admin"),
  };
}

/** Optional parts of the module, switched on in Academic Settings (P19). */
export const ACADEMIC_FEATURES = [
  { key: "academic-streams", label: "Streams", help: "Science, Commerce, Arts... for higher-secondary sections." },
  { key: "academic-boards", label: "Board per class", help: "For schools running two boards, such as State board up to class 8 and CBSE for 9 to 12." },
  { key: "academic-electives", label: "Elective and language choices", help: "Students choose optional subjects or a second language, with seats." },
  { key: "academic-rooms", label: "Rooms and lab bookings", help: "A Time Table for each room or lab, and booking a lab for a period." },
] as const;

export type AcademicFeature = (typeof ACADEMIC_FEATURES)[number]["key"];

export function featureOn(current: Current, key: AcademicFeature) {
  return current.features.has(key);
}
