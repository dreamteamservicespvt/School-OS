// What the guardian's Parent Link page shows, section by section.
//
// Each module adds its own section here (one call to registerSection in a
// file imported by ./section-list.ts):
//
//   registerSection({
//     key: "fees",                     // the switch in Message Settings, Parent Link
//     label: "Fees due",               // also the switch's label
//     order: 20,                       // lower comes first
//     load: async (tx, ctx, view) => { ...; return data or null },   // null: not shown
//     Render: FeesSection,             // a server component: ({ data, view }) => JSX
//   });
//
// Rules for a section (rule 31): read only the children in view.children
// (view.child is the one chosen), never anything of another family; return
// null when there is nothing to show (no empty boxes); read-only apart from
// paying and consent. Actions go through server actions that check the
// link, the phone and the section's switch again with guardianAccess() from
// ./links, and the child with ../students/guardian-access.ts. In a staff
// preview (view.preview), buttons must not act.
import "server-only";

import type { SchoolContext, Tx } from "../db";

export type ParentLinkChild = { id: string; name: string; firstName: string; classLabel: string; sectionId: string | null; classId: string | null; campusId: string | null; admissionNo: string; photoFileId: string | null };

export type GuardianView = {
  schoolId: string;
  schoolName: string;
  timeZone: string;
  linkId: string;
  guardianId: string;
  guardianName: string;
  language: string;
  children: ParentLinkChild[];
  child: ParentLinkChild;
  /** The link's token, for forms posting back to the page. Empty in a staff preview. */
  token: string;
  /** Shown to staff on the school's Parent Link page: nothing can be changed. */
  preview: boolean;
  academicYearId: string | null;
  /** The month a calendar section shows (?month=2026-08 in the page address); null for this month. */
  month?: string | null;
};

export type SectionDef<T = unknown> = {
  key: string;
  label: string;
  /** One line for Message Settings, e.g. "Each installment with the Pay button". */
  description: string;
  order: number;
  /** The switch that controls this section when it shares another section's switch. */
  switchKey?: string;
  /** Per child (the default) or for the guardian as a whole. */
  scope?: "child" | "family";
  load: (tx: Tx, ctx: SchoolContext, view: GuardianView) => Promise<T | null>;
  Render: (props: { data: T; view: GuardianView }) => React.ReactNode | Promise<React.ReactNode>;
};

const sections = new Map<string, SectionDef>();

export function registerSection<T>(def: SectionDef<T>) {
  sections.set(def.key, def as SectionDef);
}

export function allSections(): SectionDef[] {
  return [...sections.values()].sort((a, b) => a.order - b.order);
}

/** The sections the school has switched on (Message Settings, Parent Link). Missing switches are on. */
export function shownSections(shows: Record<string, boolean>): SectionDef[] {
  return allSections().filter((s) => shows[s.switchKey ?? s.key] !== false);
}

/** The switches for Message Settings, Parent Link: one per section with its own switch. */
export function sectionSwitches(): { key: string; label: string; description: string }[] {
  return allSections().filter((s) => !s.switchKey).map((s) => ({ key: s.key, label: s.label, description: s.description }));
}
