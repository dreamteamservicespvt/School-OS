// The shapes Reports & Analytics works with (19 §2). Every catalogue report,
// whichever module it comes from, is turned into one Table, so the screen,
// the Excel, CSV and PDF files, the background run and the scheduled email
// all come from the same rows.
import type { Viewer } from "../dashboard/types";
import type { ModuleKey } from "../modules";
import type { SchoolContext, Tx } from "../db";
import type { DayRange } from "../periods";

/** The signed-in person (Current satisfies it; jobs build it from accessIn()). */
export type ReportViewer = Viewer;

export type Cell = string | number | bigint | Date | null;
export type ColKind = "text" | "number" | "money" | "percent" | "date";
export type Column = { key: string; label: string; kind?: ColKind };
export type Row = Record<string, Cell>;

export type Table = {
  columns: Column[];
  rows: Row[];
  /** The total line, keyed like a row. */
  totals?: Row | null;
  /** One line under the table, such as "GSTIN 36AAACS4821K1Z5". */
  note?: string | null;
  /** Why there are no rows, when it is not simply "nothing matches". */
  empty?: string | null;
  /** Links under the table to the module's own page or files ("Open Defaulters to send reminders"). */
  links?: { label: string; href: string }[];
};

/** The report catalogue's categories, in the order of the blueprint (19 §2). */
export const CATEGORIES = [
  "Students", "Admissions", "Attendance", "Fees", "Finance", "Exams", "Staff and HR", "Salary", "Communication",
  "Transport", "Library", "Inventory", "Hostel", "Front Office", "Homework", "Events", "Tasks",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Money reports use the financial year (decided 9 October 2026). */
export const MONEY: readonly Category[] = ["Fees", "Finance", "Salary"];

/** The module each category comes from. Transport, Inventory and Hostel are not built yet. */
export const CATEGORY_MODULE: Record<Category, ModuleKey> = {
  Students: "student-management", Admissions: "admission-management", Attendance: "attendance-management", Fees: "fee-management",
  Finance: "finance-management", Exams: "examination-results", "Staff and HR": "staff-hr-management", Salary: "salary-management",
  Communication: "communication", Transport: "transport-management", Library: "library-management", Inventory: "inventory-management",
  Hostel: "hostel-management", "Front Office": "front-office", Homework: "homework-learning", Events: "events-calendar", Tasks: "dashboard",
};

/** The filters of one report run, read from the page address the same way for the screen and every file. */
export type ReportFilters = {
  /** The chosen dates for a dated report (default this month); null for an "as on today" report. */
  range: DayRange | null;
  from: Date;
  to: Date;
  /** The academic year (non-money reports). */
  year: { id: string; name: string; startDate: Date; endDate: Date } | null;
  /** The financial year (money reports). */
  fy: { id: string; name: string; startDate: Date; endDate: Date } | null;
  classId: string | null;
  sectionId: string | null;
  campusId: string | null;
  /** The report's own filters (exam, group, mode...), as page-address words. */
  extra: Record<string, string>;
  /** Sort by column key, and direction. */
  sort: string | null;
  dir: "asc" | "desc";
  today: Date;
};

/** What a report run gets: one transaction inside the person's school, the person and the filters. */
export type RunCtx = {
  tx: Tx;
  ctx: SchoolContext;
  who: ReportViewer;
  f: ReportFilters;
  tz: string;
  /** Own reach: the sections this person teaches or is class teacher of this year; null for the whole school. */
  sections: string[] | null;
  /** Read once and shared within the run. */
  memo: <T>(key: string, fn: () => Promise<T>) => Promise<T>;
};

/** One report in the catalogue. */
export type ReportEntry = {
  key: string;
  category: Category;
  name: string;
  /** One line on what it answers. */
  sub: string;
  money?: boolean;
  /** Has a date range (the shared date filter); otherwise "As on today" with a year. */
  dated?: boolean;
  /** The date filter's default when none is chosen. */
  fallback?: import("../periods").PeriodKey;
  /** Has a class column and filter. */
  byClass?: boolean;
  /** Works for own-reach people (their classes only). */
  own?: boolean;
  /** All classes runs in the background. */
  heavy?: boolean;
  /** Report-specific filters shown on the page. */
  options?: (rc: Omit<RunCtx, "f"> & { f?: ReportFilters }) => Promise<ReportOption[]>;
  /** Who may open it, beyond the category (a module's own page rule, a School Feature, the role's level). */
  allowed?: (a: import("./access").ReportAccess, who: Pick<ReportViewer, "features" | "permissions" | "roles">) => boolean;
  run: (rc: RunCtx) => Promise<Table>;
};

export type ReportOption = { param: string; label: string; options: { value: string; label: string }[]; value: string };
