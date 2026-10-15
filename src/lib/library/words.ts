// Library Management's screen words (13, 00-global.md §9): statuses, their
// colours, and small helpers shared by the server and the browser.

export const BASE = "/library-management";
export const MODULE = "library-management" as const;

export type Tone = "ok" | "warn" | "bad" | "info" | "brand" | "neutral";

export type CopyStatus = "AVAILABLE" | "ISSUED" | "RESERVED" | "LOST" | "DAMAGED" | "WITHDRAWN";
export const COPY_STATUS: Record<CopyStatus, { label: string; tone: Tone }> = {
  AVAILABLE: { label: "Available", tone: "ok" },
  ISSUED: { label: "Issued", tone: "info" },
  RESERVED: { label: "Reserved", tone: "brand" },
  LOST: { label: "Lost", tone: "bad" },
  DAMAGED: { label: "Damaged", tone: "warn" },
  WITHDRAWN: { label: "Withdrawn", tone: "neutral" },
};

export type FineStatus = "DUE" | "PAID" | "WAIVED" | "WAITING" | "NOT_APPROVED";
export const FINE_STATUS: Record<FineStatus, { label: string; tone: Tone }> = {
  DUE: { label: "Due", tone: "warn" },
  PAID: { label: "Paid", tone: "ok" },
  WAIVED: { label: "Waived", tone: "neutral" },
  WAITING: { label: "Waiting approval", tone: "info" },
  NOT_APPROVED: { label: "Not approved", tone: "neutral" },
};

export type FineReason = "LATE" | "LOST" | "DAMAGED";
export const FINE_REASON: Record<FineReason, string> = { LATE: "Late", LOST: "Lost", DAMAGED: "Damaged" };

/** Class groups for borrowing limits: the class's level (Academic Management). */
export const CLASS_LEVELS = ["Pre-primary", "Primary", "Middle", "Secondary", "Senior Secondary"] as const;
export type ClassLevel = (typeof CLASS_LEVELS)[number];

export type StudentRule = { level: string; books: number; loanDays: number };

/** Inferred defaults (13 §6 and the approved design): fewer books and shorter loans for the youngest. */
export const DEFAULT_STUDENT_RULES: StudentRule[] = [
  { level: "Pre-primary", books: 1, loanDays: 7 },
  { level: "Primary", books: 2, loanDays: 14 },
  { level: "Middle", books: 3, loanDays: 14 },
  { level: "Secondary", books: 3, loanDays: 14 },
  { level: "Senior Secondary", books: 3, loanDays: 14 },
];

export const QUEUE_ORDER = [
  { value: "fcfs", label: "First come, first served" },
  { value: "staff-first", label: "Staff first" },
] as const;

export const LABEL_TYPES = [
  { value: "barcode", label: "Barcode" },
  { value: "qr", label: "QR code" },
  { value: "rfid", label: "RFID" },
] as const;

export const LOST_CHARGE = [
  { value: "price", label: "Book price" },
  { value: "price-plus", label: "Price plus a fee" },
] as const;

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

/** "1 book" / "3 books". */
export const books = (n: number) => plural(n, "book");

/** Whole rupees typed in a form, as paise; null when empty or not a number. */
export function rupeesToPaise(v: string | null | undefined): bigint | null {
  const s = (v ?? "").replace(/[₹,\s]/g, "");
  if (!s) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [r, p = ""] = s.split(".");
  return BigInt(r) * BigInt(100) + BigInt((p + "00").slice(0, 2));
}

/** Paise as a plain rupee number for a form box: 54900 → "549". */
export function paiseToRupees(p: bigint | number | null | undefined) {
  if (p == null) return "";
  const n = Number(p);
  return n % 100 === 0 ? String(n / 100) : (n / 100).toFixed(2);
}

/** "S:uuid" / "T:uuid": a member in page addresses and forms. */
export type MemberKey = `S:${string}` | `T:${string}`;
