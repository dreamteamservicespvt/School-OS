// Where a file can be brought in (00-global.md P10, workflow 15). Every
// import in School OS runs on the one Switching to School OS engine
// (src/lib/move-in): the same column matching, tidy-ups, row-by-row check,
// fixes, rows left out, choices, background import, Undo and Audit Log. A
// "place" is the page a person starts from: Settings, Data Backup &
// Security, Switching to School OS, or the Import page of the module that
// owns the records (old dues on Fee Management, staff on Staff & HR...), so
// the person who does that work never needs Settings (05-roles.md).
import type { ModuleKey } from "../modules";

export type PlaceKey = "settings" | "fees" | "finance" | "events" | "staff" | "enquiries" | "library" | "inventory-items" | "inventory-assets" | "hostel" | "students" | "salary" | "attendance" | "academic";

export type ImportPlace = {
  key: PlaceKey;
  /** The module whose page this is ("settings" for Switching to School OS). */
  module: ModuleKey;
  /** The place's own page: upload, files being checked and earlier imports. */
  base: string;
  /** Where its downloads sit (the ready sheet and rows with problems); the page itself unless shared. */
  downloads?: string;
  /** The kinds brought in here; Settings takes every kind its person may bring in. */
  kinds: readonly string[] | null;
  /** The page's name, for links back to it. */
  name: string;
  /** Undo needs the module's "create" here, as bringing in does (the module's own rule); otherwise "archive". */
  undoAs?: "create";
};

export const PLACES: Record<PlaceKey, ImportPlace> = {
  settings: { key: "settings", module: "settings", base: "/settings/data-security/switching", kinds: null, name: "Switching to School OS" },
  fees: { key: "fees", module: "fee-management", base: "/fee-management/ledger/import", kinds: ["fee-old-dues", "fee-past-receipts"], name: "Import old dues and receipts" },
  finance: { key: "finance", module: "finance-management", base: "/finance-management/expenses/import", kinds: ["finance-past-expenses"], name: "Import past expenses" },
  events: { key: "events", module: "events-calendar", base: "/events-calendar/import", kinds: ["calendar-holidays"], name: "Import holidays" },
  staff: { key: "staff", module: "staff-hr-management", base: "/staff-hr-management/import", kinds: ["staff", "staff-pay-details", "staff-leave-balances"], name: "Import staff", undoAs: "create" },
  enquiries: { key: "enquiries", module: "admission-management", base: "/admission-management/enquiries/import", kinds: ["admission-enquiries"], name: "Import enquiries", undoAs: "create" },
  library: { key: "library", module: "library-management", base: "/library-management/books/import", kinds: ["library-catalogue"], name: "Import books" },
  "inventory-items": { key: "inventory-items", module: "inventory-management", base: "/inventory-management/items/import", downloads: "/inventory-management/import", kinds: ["inventory-items"], name: "Import items" },
  "inventory-assets": { key: "inventory-assets", module: "inventory-management", base: "/inventory-management/assets/import", downloads: "/inventory-management/import", kinds: ["inventory-assets"], name: "Import assets" },
  hostel: { key: "hostel", module: "hostel-management", base: "/hostel-management/rooms/import", kinds: ["hostel-rooms"], name: "Import rooms" },
  students: { key: "students", module: "student-management", base: "/student-management/import", kinds: ["students", "students-update"], name: "Import students" },
  salary: { key: "salary", module: "salary-management", base: "/salary-management/structures/import", kinds: ["salary-structures", "salary-to-date"], name: "Import salary" },
  attendance: { key: "attendance", module: "attendance-management", base: "/attendance-management/import", kinds: ["attendance-so-far"], name: "Import attendance so far" },
  academic: { key: "academic", module: "academic-management", base: "/academic-management/import", kinds: ["academic-allocations", "academic-timetable"], name: "Import from Excel" },
};

/**
 * Kinds listed for Switching to School OS that keep their own module page's
 * rules there too, because the module's own rule is narrower than "may add in
 * the module": attendance so far needs full Attendance Management (05-roles.md).
 */
export const OWN_RULES: Record<string, PlaceKey> = {
  "attendance-so-far": "attendance",
  // Leave balances: HR's work (full Staff & HR), as for adjusting a balance by hand.
  "staff-leave-balances": "staff",
  // Pay details are restricted fields: HR, the Principal and the School Admin only (09 §1).
  "staff-pay-details": "staff",
  // Salary to date: full Salary Management only, as for salary itself.
  "salary-to-date": "salary",
  // Academic Management: Teacher Allocation needs full Academic Management, as for Assign teacher.
  "academic-allocations": "academic",
  // The Time Table: the people who keep it (full Academic Management, or the Office Staff template).
  "academic-timetable": "academic",
};

export function importPlace(key: unknown): ImportPlace | null {
  return typeof key === "string" && Object.hasOwn(PLACES, key) ? PLACES[key as PlaceKey] : null;
}

/** Does this place bring in this kind of record? */
export const placeHolds = (place: ImportPlace, kind: string) => place.kinds === null || place.kinds.includes(kind);

const isSettings = (place: ImportPlace) => place.key === "settings";
const downloads = (place: ImportPlace) => place.downloads ?? place.base;

/** One file's pages: its check and review steps, and its rows with problems. */
// "review", not "file": a support browser takes /file/<id> for a download (src/lib/support-paths.ts).
export const fileHref = (place: ImportPlace, id: string) => (isSettings(place) ? `${place.base}/${id}` : `${place.base}/review/${id}`);
export const problemsHref = (place: ImportPlace, id: string) => `${fileHref(place, id)}/problems`;

/** The ready Excel sheet for one kind, made for this school. */
export const templateHref = (place: ImportPlace, kind: string) => (isSettings(place) ? `${place.base}/template/${kind}` : `${downloads(place)}/template?kind=${kind}`);

/** The rows an import left out with their problems, to fix and bring in again. */
export const errorsHref = (place: ImportPlace, batchId: string, kind: string) =>
  isSettings(place) ? `/settings/data-security/imports/${batchId}/errors` : `${downloads(place)}/errors/${batchId}?kind=${kind}`;

/** Where the records live once they are in, to look at them. */
export const HOME: Record<string, { href: string; label: string }> = {
  students: { href: "/student-management", label: "Open Student List" },
  "students-update": { href: "/student-management", label: "Open Student List" },
  "salary-structures": { href: "/salary-management/structures", label: "Open Salary Structures" },
  staff: { href: "/staff-hr-management", label: "Open Staff List" },
  departments: { href: "/staff-hr-management/settings", label: "Open HR Settings" },
  "fee-old-dues": { href: "/fee-management/ledger", label: "Open Student Fee Ledger" },
  "fee-past-receipts": { href: "/fee-management/ledger", label: "Open Student Fee Ledger" },
  "finance-past-expenses": { href: "/finance-management/expenses", label: "Open Expenses" },
  "calendar-holidays": { href: "/events-calendar", label: "Open School Calendar" },
  "admission-enquiries": { href: "/admission-management/enquiries", label: "Open Enquiries" },
  "library-catalogue": { href: "/library-management/books", label: "Open Books" },
  "inventory-items": { href: "/inventory-management/items", label: "Open Items & Stock" },
  "inventory-assets": { href: "/inventory-management/assets", label: "Open Assets" },
  "hostel-rooms": { href: "/hostel-management/rooms", label: "Open Rooms & Beds" },
  "attendance-so-far": { href: "/attendance-management/register", label: "Open Attendance Register" },
  "staff-leave-balances": { href: "/staff-hr-management/leave?view=balances", label: "Open leave balances" },
  "staff-pay-details": { href: "/staff-hr-management", label: "Open Staff List" },
  "salary-to-date": { href: "/salary-management/history", label: "Open Salary History" },
  "academic-allocations": { href: "/academic-management/teacher-allocation", label: "Open Teacher Allocation" },
  "academic-timetable": { href: "/academic-management/time-table?version=draft", label: "Open the draft Time Table" },
};

/** One record and many, in the words of each kind's own module. */
export const WORDS: Record<string, { one: string; many: string }> = {
  "fee-old-dues": { one: "old due", many: "old dues" },
  "fee-past-receipts": { one: "past receipt", many: "past receipts" },
  "finance-past-expenses": { one: "past expense", many: "past expenses" },
  "calendar-holidays": { one: "holiday", many: "holidays" },
  staff: { one: "staff member", many: "staff" },
  "admission-enquiries": { one: "enquiry", many: "enquiries" },
  "library-catalogue": { one: "book", many: "books" },
  "inventory-items": { one: "item", many: "items" },
  "inventory-assets": { one: "asset", many: "assets" },
  "hostel-rooms": { one: "room", many: "rooms" },
  students: { one: "student", many: "students" },
  "students-update": { one: "student's changes", many: "students' changes" },
  "salary-structures": { one: "salary structure", many: "salary structures" },
  "attendance-so-far": { one: "student's attendance so far", many: "students' attendance so far" },
  "staff-leave-balances": { one: "leave balance", many: "leave balances" },
  "staff-pay-details": { one: "staff member's pay details", many: "staff members' pay details" },
  "salary-to-date": { one: "staff member's salary to date", many: "staff members' salary to date" },
  "academic-allocations": { one: "teacher assignment", many: "teacher assignments" },
  "academic-timetable": { one: "period", many: "periods" },
};

export const wordsFor = (kind: string, label: string) => WORDS[kind] ?? { one: label.toLowerCase().replace(/s$/, ""), many: label.toLowerCase() };
