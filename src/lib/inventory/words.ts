// Inventory Management's screen words (14, 00-global.md §9): statuses, their
// colours, defaults and small helpers shared by the server and the browser.

export const BASE = "/inventory-management";
export const MODULE = "inventory-management" as const;

export type Tone = "ok" | "warn" | "bad" | "info" | "brand" | "neutral";

/** Inferred defaults (14 §6). */
export const DEFAULT_UNITS = ["piece", "box", "packet", "kg", "litre", "set", "pair", "ream", "bottle", "dozen"];
export const DEFAULT_ASSET_TYPES = ["Furniture", "IT", "Lab", "Sports", "Vehicles", "Others"];
export const DEFAULT_DEPRECIATION: Record<string, number> = { Furniture: 10, IT: 40, Lab: 15, Sports: 20, Vehicles: 15, Others: 10 };
export const DEFAULT_CATEGORIES: { name: string; isLab?: boolean; reorder: number; head: string }[] = [
  { name: "Stationery", reorder: 20, head: "Stationery" },
  { name: "Cleaning", reorder: 10, head: "Housekeeping" },
  { name: "Lab", isLab: true, reorder: 5, head: "Lab consumables" },
  { name: "Sports", reorder: 5, head: "Miscellaneous" },
  { name: "Uniforms", reorder: 10, head: "Miscellaneous" },
  { name: "Books", reorder: 10, head: "Library books" },
];
export const DEFAULT_LOCATIONS = ["Main store", "Lab store", "Sports room"];

export const FACILITY_TYPES = ["Classroom", "Lab", "Hall", "Ground", "Office", "Store", "Other"] as const;
/** The Time Table's room kind for each facility type (src/lib/academic/rooms.ts). */
export const ROOM_KIND_OF: Record<string, string> = { Classroom: "classroom", Lab: "lab", Hall: "activity", Ground: "activity", Office: "activity", Store: "activity", Other: "activity" };
export const facilityTypeOfRoom = (kind: string) => (kind === "lab" ? "Lab" : kind === "classroom" ? "Classroom" : "Hall");

export const CONDITIONS = ["Good", "Fair", "Poor"] as const;

export type MoveKind = "OPENING" | "IN" | "RECEIVED" | "OUT" | "ISSUE" | "RETURN" | "TRANSFER_OUT" | "TRANSFER_IN" | "DAMAGED" | "LOST" | "EXPIRED" | "AUDIT";
export const MOVE_KIND: Record<MoveKind, { label: string; tone: Tone }> = {
  OPENING: { label: "Opening stock", tone: "neutral" },
  IN: { label: "Stock in", tone: "ok" },
  RECEIVED: { label: "Goods received", tone: "ok" },
  OUT: { label: "Stock out", tone: "info" },
  ISSUE: { label: "Issued", tone: "info" },
  RETURN: { label: "Returned", tone: "ok" },
  TRANSFER_OUT: { label: "Transfer out", tone: "brand" },
  TRANSFER_IN: { label: "Transfer in", tone: "brand" },
  DAMAGED: { label: "Damaged", tone: "bad" },
  LOST: { label: "Lost", tone: "bad" },
  EXPIRED: { label: "Expired", tone: "warn" },
  AUDIT: { label: "Audit adjustment", tone: "warn" },
};
export const WRITE_OFF_KINDS = ["DAMAGED", "LOST", "EXPIRED"] as const;

export type StockState = "OK" | "LOW" | "OUT";
export const STOCK_STATE: Record<StockState, { label: string; tone: Tone }> = {
  OK: { label: "OK", tone: "ok" },
  LOW: { label: "Low", tone: "warn" },
  OUT: { label: "Out of stock", tone: "bad" },
};
/** OK, Low (at or below the reorder level) or Out of stock. A level of 0 never alerts. */
export function stockState(qty: number, reorder: number): StockState {
  if (qty <= 0) return "OUT";
  if (reorder > 0 && qty <= reorder) return "LOW";
  return "OK";
}

export const ISSUE_TO: Record<"STAFF" | "DEPARTMENT" | "CLASS" | "STUDENT", string> = { STAFF: "Staff member", DEPARTMENT: "Department", CLASS: "Class", STUDENT: "Student" };

export const REQUEST_STATUS: Record<"WAITING" | "APPROVED" | "REJECTED" | "ORDERED" | "CANCELLED", { label: string; tone: Tone }> = {
  WAITING: { label: "Waiting", tone: "info" },
  APPROVED: { label: "Approved", tone: "ok" },
  REJECTED: { label: "Rejected", tone: "bad" },
  ORDERED: { label: "Ordered", tone: "brand" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};
export const ORDER_STATUS: Record<"WAITING" | "SENT" | "PART_RECEIVED" | "RECEIVED" | "CLOSED" | "CANCELLED", { label: string; tone: Tone }> = {
  WAITING: { label: "Waiting approval", tone: "info" },
  SENT: { label: "Sent", tone: "brand" },
  PART_RECEIVED: { label: "Part received", tone: "warn" },
  RECEIVED: { label: "Received", tone: "ok" },
  CLOSED: { label: "Closed", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};
export type BillState = "UNPAID" | "PART_PAID" | "PAID" | "WAITING" | "CANCELLED";
export const BILL_STATUS: Record<BillState, { label: string; tone: Tone }> = {
  WAITING: { label: "Waiting approval", tone: "info" },
  UNPAID: { label: "Unpaid", tone: "warn" },
  PART_PAID: { label: "Part paid", tone: "brand" },
  PAID: { label: "Paid", tone: "ok" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};
/** A bill's state from its Finance expense. */
export function billState(e: { status: string; amountPaise: bigint; paidPaise: bigint }): BillState {
  if (e.status === "CANCELLED") return "CANCELLED";
  if (e.status === "WAITING" || e.status === "DRAFT") return "WAITING";
  if (e.paidPaise >= e.amountPaise) return "PAID";
  return e.paidPaise > BigInt(0) ? "PART_PAID" : "UNPAID";
}

export const ASSET_STATUS: Record<"IN_USE" | "IN_REPAIR" | "DISPOSED", { label: string; tone: Tone }> = {
  IN_USE: { label: "In use", tone: "ok" },
  IN_REPAIR: { label: "In repair", tone: "warn" },
  DISPOSED: { label: "Disposed", tone: "neutral" },
};
export const DISPOSAL_METHOD: Record<string, string> = { SOLD: "Sold", SCRAPPED: "Scrapped", DONATED: "Donated" };
export const APPROVAL_STATUS: Record<"WAITING" | "APPROVED" | "REJECTED" | "CANCELLED", { label: string; tone: Tone }> = {
  WAITING: { label: "Waiting approval", tone: "info" },
  APPROVED: { label: "Approved", tone: "ok" },
  REJECTED: { label: "Not approved", tone: "bad" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};
export const AUDIT_STATUS: Record<"OPEN" | "WAITING" | "APPROVED" | "REJECTED", { label: string; tone: Tone }> = {
  OPEN: { label: "Counting", tone: "brand" },
  WAITING: { label: "Waiting approval", tone: "info" },
  APPROVED: { label: "Approved", tone: "ok" },
  REJECTED: { label: "Not approved", tone: "neutral" },
};
export const MAINT_STATUS: Record<"OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED", { label: string; tone: Tone }> = {
  OPEN: { label: "Open", tone: "warn" },
  IN_PROGRESS: { label: "In progress", tone: "info" },
  DONE: { label: "Done", tone: "ok" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};
export const PRIORITY: Record<"LOW" | "NORMAL" | "HIGH" | "URGENT", { label: string; tone: Tone }> = {
  LOW: { label: "Low", tone: "neutral" },
  NORMAL: { label: "Normal", tone: "info" },
  HIGH: { label: "High", tone: "warn" },
  URGENT: { label: "Urgent", tone: "bad" },
};

/** The default checklist for a lab safety check (inferred). */
export const LAB_CHECKLIST = [
  "Fire extinguisher filled and in date",
  "First-aid box stocked",
  "Eye-wash station working",
  "Gas taps and pipes without leaks",
  "Chemicals labelled and locked",
  "Electrical points and wiring safe",
  "Exits clear",
];

export const PAY_MODES = [
  { value: "CASH", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CHEQUE", label: "Cheque" },
] as const;

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;
export const qtyWords = (n: number, unit: string) => `${n.toLocaleString("en-IN")} ${unit === "piece" ? (n === 1 ? "piece" : "pieces") : unit}`;

/** Rupees typed in a cell or field ("1,250.50", "₹ 40") as paise, or null when it is not an amount. */
export function rupeesToPaise(raw: string): bigint | null {
  const v = raw.replace(/[₹,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  const [r, p = ""] = v.split(".");
  return BigInt(r) * BigInt(100) + BigInt((p + "00").slice(0, 2));
}

/** Paise as a plain rupee number for a form field ("1250.5" → "1250.50"). */
export const paiseToField = (p: bigint | null | undefined) => (p === null || p === undefined ? "" : (Number(p) / 100).toFixed(Number(p) % 100 ? 2 : 0));
