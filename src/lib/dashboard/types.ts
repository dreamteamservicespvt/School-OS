// The shapes a Dashboard widget hands to the page (01-dashboard.md §2).
// Loaders return these plain objects; the page decides how they look.

import type { ModuleKey } from "../modules";
import type { Current } from "../current";
import type { Tx } from "../db";

/** The parts of the signed-in person the Dashboard needs. Current satisfies it; tests build it from accessIn(). */
export type Viewer = Pick<Current, "ctx" | "permissions" | "roles" | "modulesOn" | "features" | "school" | "scope" | "campusId"> & {
  /** The roles the school chose for the AI assistant; the default leaders when left out. */
  aiRoles?: readonly string[];
  user: { id: string; displayName: string };
};

/**
 * Which home a person sees (05-roles.md: each role gets its own home).
 * "leader" is the control centre of the Principal, School Admin and Vice Principal.
 * "staff" is the home of anyone whose roles name no other home.
 */
export const HOME_KINDS = [
  "leader", "accountant", "teacher", "class-teacher", "receptionist", "transport", "librarian", "warden", "store",
  "academic-head", "hr", "office", "exam", "admission", "counsellor", "gate", "staff",
] as const;
export type HomeKind = (typeof HOME_KINDS)[number];

export type Tone = "brand" | "ok" | "warn" | "bad" | "info";

/** Icons a widget may name; the page maps them to lucide icons. */
export type DashIcon =
  | "UserX" | "TriangleAlert" | "ListChecks" | "ArrowRightLeft" | "CalendarDays" | "FileWarning" | "BadgeCheck" | "MessagesSquare"
  | "HeartHandshake" | "Award" | "Users" | "TrendingDown" | "Settings" | "CreditCard" | "Send" | "UserCheck" | "ClipboardCheck"
  | "BookOpenCheck" | "Megaphone" | "Clock" | "ListTodo" | "Sparkles" | "BarChart3";

/** One number in the brand band at the top ("School today"). */
export type BandItem = {
  id: string;
  label: string;
  /** The big number or word. */
  big: string;
  /** Shown smaller after the number, such as "/ 86". */
  of?: string;
  foot?: string;
  /** The exact list behind the number. Absent when the person may not open it. */
  href?: string;
  /** A share (0 to 100) drawn as a ring on wide screens. */
  ring?: number;
};

/** One card of "Needs your attention". */
export type AttentionItem = {
  /** Stable key: the same thing on another day keeps its key, so "Seen" works and duplicates merge. */
  id: string;
  tone: Exclude<Tone, "brand" | "ok">;
  icon: DashIcon;
  title: string;
  detail: string;
  /** Button words, such as "Review". */
  action: string;
  href: string;
  /** The number the card is about; "Seen" hides the card until this changes. */
  value: string;
};

/** One line of "Today and next". */
export type AgendaItem = {
  id: string;
  /** "11:15", "Mon", "Sat 17". */
  time: string;
  title: string;
  where: string;
  tone: Tone;
  href?: string;
  /** Minutes from the start of today, for ordering (later days sort after today). */
  sort: number;
};

export type Birthday = { id: string; name: string; when: string; sort: number };

/** A period of the person's own Time Table today (teachers). */
export type ClassToday = {
  id: string;
  periodNo: number;
  time: string;
  className: string;
  subject: string;
  room: string;
  now: boolean;
  past: boolean;
  /** "Substitution for Anitha Kumari", or "Arranged: Imran S. takes it". */
  note: string | null;
  noteTone: "warn" | "neutral";
  sectionId: string;
  /** Where Take Attendance goes, once Attendance Management is built (registry slot "attendance.take-for-period"). */
  takeHref: string | null;
  taken: boolean;
};

export type BarRow = { key: string; label: string; value: number; href?: string };

export type ListRow = { id: string; title: string; sub: string; avatar?: string; href?: string; right?: string; rightTone?: "ok" | "warn" | "bad" | "info" | "neutral" };

/** A bigger card in the main or side column. */
export type Panel =
  | { kind: "classes-today"; title: string; sub: string; rows: ClassToday[]; timetableHref: string; off: string | null }
  | { kind: "bars"; title: string; sub: string; icon: DashIcon; rows: BarRow[]; goal?: number; lowBelow?: number; href?: string; linkLabel?: string; empty: string }
  | { kind: "classes-overview"; title: string; sub: string; total: number; classes: { id: string; name: string; total: number; href: string; sections: { id: string; name: string; count: number; href: string }[] }[]; href: string }
  | { kind: "list"; title: string; sub: string; icon: DashIcon; rows: ListRow[]; href?: string; linkLabel?: string; empty: string }
  | { kind: "my-class"; title: string; sub: string; stats: { label: string; value: string; href?: string }[]; rows: ListRow[]; href: string }
  /** Today's brief (Principal summary): short lines in sections, each with the list behind it; forecasts marked "Suggestion". */
  | { kind: "brief"; title: string; sub: string; sections: { heading: string; lines: { text: string; href?: string; suggestion?: boolean; basis?: string }[] }[]; note: string };

export type PanelSlot = "first" | "main" | "side";

/** What every loader gets: one transaction inside the person's school, and the day in the school's time zone. */
export type DashContext = {
  tx: Tx;
  viewer: Viewer;
  homes: readonly HomeKind[];
  /** Today at 00:00 UTC, in the school's zone. */
  today: Date;
  now: Date;
  /** Minutes since midnight in the school's zone. */
  minuteNow: number;
  tz: string;
  year: { id: string; name: string; startDate: Date; endDate: Date; status: string; campusId: string } | null;
  /** Read once and shared between loaders. */
  memo: <T>(key: string, fn: () => Promise<T>) => Promise<T>;
};

export type WidgetKind = "band" | "attention" | "agenda" | "birthdays" | "panel";

export type WidgetOutput = {
  band: BandItem;
  attention: AttentionItem;
  agenda: AgendaItem;
  birthdays: Birthday;
  panel: { slot: PanelSlot; panel: Panel };
};

/**
 * A Dashboard widget, registered by the module that owns the numbers.
 * Shown only when its module is built, switched on for the school, and allowed for the person.
 */
export type Widget<K extends WidgetKind = WidgetKind> = {
  id: string;
  module: ModuleKey;
  kind: K;
  /** The homes it appears on, or "any" for every home. */
  homes: readonly HomeKind[] | "any";
  /** Extra check on the person, beyond being able to see the module (for example: change rights, a role). */
  allowed?: (v: Viewer) => boolean;
  /** Reads real data with the person's reach. Null or [] when there is nothing to show. */
  load: (c: DashContext) => Promise<WidgetOutput[K] | WidgetOutput[K][] | null>;
};

/**
 * A place in the registry kept for a module another team is building. It has no
 * loader and no screen until that module is merged; then its loader is written
 * against the module's own records and the slot becomes a Widget.
 */
export type WidgetSlot = {
  id: string;
  module: ModuleKey;
  kind: WidgetKind;
  homes: readonly HomeKind[] | "any";
  /** What it shows and where its number opens (with filters), in plain words. */
  shows: string;
};
