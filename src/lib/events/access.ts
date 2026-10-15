// Who may see and do what in Events & Calendar (05-roles.md and the approved
// design's role rules, config.js VIEW_BY_ROLE / OWN / LABELS_BY_ROLE of
// 13 Oct 2026):
// - Full (Principal, School Admin, Vice Principal, a school-made events role):
//   every page; they plan events and PTMs and keep the gallery.
// - Teachers and Class Teachers (Own): the School Calendar and PTM, with only
//   their own slots and notes.
// - The Accountant (View, with Fee Management in full): the School Calendar
//   and "Event Payments" (events with a fee, read only).
// - Every other role with View: the School Calendar only.
// - Daily Activities (the pre-primary diary): written only by the class
//   teacher of each pre-primary section; the Principal, School Admin and VP
//   read every class's diary and remind (14 Oct 2026 design change).
import type { Reach } from "../permissions";

export type EvLevel = "full" | "pay" | "own" | "view";

export type EvViewer = { userId: string; see: Reach; change: Reach; level: EvLevel | null; roleKeys: string[] };

type Source = { permissions: Record<string, { see: Reach; change: Reach }>; roles?: { key: string | null }[]; user: { id: string } };

export function evViewer(current: Source): EvViewer {
  const a = current.permissions["events-calendar"] ?? { see: "none", change: "none" };
  const fees = current.permissions["fee-management"] ?? { see: "none", change: "none" };
  const roleKeys = (current.roles ?? []).map((r) => r.key).filter((k): k is string => Boolean(k));
  let level: EvLevel | null = null;
  if (a.change === "all") level = "full";
  else if (a.change === "own") level = "own";
  else if (a.see !== "none") level = fees.change === "all" ? "pay" : "view";
  return { userId: current.user.id, see: a.see, change: a.change, level, roleKeys };
}

export const EV_PAGES = {
  calendar: ["full", "pay", "own", "view"],
  events: ["full", "pay"],
  ptm: ["full", "own"],
  cocurricular: ["full"],
  gallery: ["full"],
  // Teachers ("own") only when they are the class teacher of a pre-primary
  // section this year: the page checks that (src/lib/events/daily.ts).
  daily: ["full", "own"],
  settings: ["full"],
} as const satisfies Record<string, readonly EvLevel[]>;
export type EvPageKey = keyof typeof EV_PAGES;

export function evPageAllowed(v: Pick<EvViewer, "level">, page: EvPageKey) {
  return v.level !== null && (EV_PAGES[page] as readonly EvLevel[]).includes(v.level);
}

/** What each level may do, so buttons a role cannot use are hidden (and the server refuses them). */
export function evCan(v: EvViewer) {
  const full = v.level === "full";
  const own = v.level === "own";
  return {
    /** Add and remove School Calendar entries, import the holiday list. */
    calendar: full,
    /** Create, change and cancel events; registrations, attendance, seats, volunteers, reminders. */
    events: full,
    /** Fee amounts, collected and due (the Accountant reads them; the events team sees them too). */
    money: full || v.level === "pay",
    /** Plan PTM days, open the queue, send the summary. */
    ptmPlan: full,
    /** Book a slot for a parent: any teacher's (full) or only their own (teachers). */
    ptmBook: full || own,
    /** Record meeting notes: any (full) or at their own slots (teachers). */
    ptmNotes: full || own,
    /** Albums, uploads, tags, publish and share. */
    gallery: full,
    /** Achievements, certificates, activity credits, houses, clubs and sports teams. */
    cocurricular: full,
    /** Remind a pre-primary class teacher whose diary is behind (the diary itself is written only by its class teacher). */
    dailyRemind: full,
    /** Events Settings. */
    settings: full,
    /** Export what they can see. */
    export: v.see === "all",
    own,
  };
}

export type EvCan = ReturnType<typeof evCan>;
