// School words and small rules for Front Office screens (16-front-office.md).
// Safe to use in the browser.

export const BASE = "/front-office";

export const ID_PROOF_TYPES = ["Aadhaar", "Driving licence", "Voter ID", "PAN card", "Office ID", "Passport"] as const;
export const PEOPLE_COUNTS = ["1", "2", "3", "4+"] as const;
export const PICKUP_REASONS = ["Doctor visit", "Unwell", "Family function", "Exam or competition", "Other"] as const;
export const GATE_KINDS = [
  { value: "vehicle", label: "Vehicle" },
  { value: "school-bus", label: "School bus" },
  { value: "delivery", label: "Delivery" },
  { value: "person", label: "Person" },
] as const;
export const GATE_KIND_PREFIX: Record<string, string> = { vehicle: "Vehicle", "school-bus": "School bus", delivery: "Delivery", person: "" };
export const POSTAL_TYPES = [
  { value: "LETTER", label: "Letter" },
  { value: "COURIER", label: "Courier" },
  { value: "PARCEL", label: "Parcel" },
] as const;
export const COURIERS = ["Speed Post", "India Post", "Blue Dart", "DTDC", "Delhivery", "Professional Couriers", "Hand delivery"] as const;
export const APPOINTMENT_LENGTHS = [15, 30, 45] as const;

/** Visitor status (16 §2 Visitors). */
export type VisitorStatus = "In" | "Out" | "Expired";
export const VISITOR_TONE: Record<VisitorStatus, "ok" | "neutral" | "bad"> = { In: "ok", Out: "neutral", Expired: "bad" };

export const REPLIES = [
  { key: "send-in", label: "Send in", tone: "ok" },
  { key: "wait", label: "Wait", tone: "warn" },
  { key: "not-available", label: "Not available", tone: "bad" },
] as const;
export type ReplyKey = (typeof REPLIES)[number]["key"];
export const replyOf = (key: string | null | undefined) => REPLIES.find((r) => r.key === key) ?? null;

export const REQUEST_STATUS: Record<string, { label: string; tone: "info" | "warn" | "ok" }> = {
  SENT: { label: "Sent", tone: "info" },
  IN_PROGRESS: { label: "In progress", tone: "warn" },
  DONE: { label: "Done", tone: "ok" },
};

export const CALL_STATUS: Record<string, { label: string; tone: "neutral" | "warn" | "info" }> = {
  CLOSED: { label: "Closed", tone: "neutral" },
  FOLLOW_UP: { label: "Follow-up", tone: "warn" },
  QUERY: { label: "Sent as query", tone: "info" },
};

export const APPOINTMENT_STATUS: Record<string, { label: string; tone: "info" | "brand" | "ok" | "neutral" | "bad" }> = {
  BOOKED: { label: "Booked", tone: "info" },
  ARRIVED: { label: "Arrived", tone: "brand" },
  DONE: { label: "Done", tone: "ok" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  NO_SHOW: { label: "No-show", tone: "bad" },
};

export const POSTAL_STATUS: Record<string, { label: string; tone: "warn" | "ok" | "info" }> = {
  AT_DESK: { label: "At desk", tone: "warn" },
  HANDED_OVER: { label: "Handed over", tone: "ok" },
  SENT: { label: "Sent", tone: "info" },
};

/** Optional parts a school switches on (School Feature). */
export const FRONT_OFFICE_FEATURES = [
  { key: "front-office-gate-log", label: "Gate log", about: "Entries and exits at the gate with vehicle numbers, for schools with gate security." },
  { key: "front-office-postal", label: "Postal & Deliveries", about: "A register of letters, couriers and parcels received and sent." },
] as const;
export type FrontOfficeFeature = (typeof FRONT_OFFICE_FEATURES)[number]["key"];

/** Only the digits of a phone number. */
export const digitsOf = (p: string | null | undefined) => String(p ?? "").replace(/\D/g, "");

/** A 10-digit Indian mobile, from "+91 98480 12345" or "098480 12345". */
export function mobileDigits(p: string | null | undefined) {
  const d = digitsOf(p);
  if (d.length === 12 && d.startsWith("91")) return d.slice(2);
  if (d.length === 11 && d.startsWith("0")) return d.slice(1);
  return d;
}

/** A plain-words problem with a typed mobile number, or "" when it is fine. */
export function phoneProblem(p: string | null | undefined) {
  const d = mobileDigits(p);
  if (!d) return "Enter the phone number";
  if (d.length !== 10 || !/^[6-9]/.test(d)) return "Enter a 10-digit Indian mobile number";
  return "";
}

/** "98480 55120". */
export const showPhone = (p: string) => (/^\d{10}$/.test(p) ? `${p.slice(0, 5)} ${p.slice(5)}` : p);

/** "••••••3210": what roles without the phone permission see. */
export const maskPhone = (p: string) => `••••••${digitsOf(p).slice(-4)}`;

/** Indian vehicle numbers like TS 08 EZ 4410, KA 01 AB 1234 or a BH series number. */
export const VEHICLE_RE = /^([A-Z]{2}\s?\d{1,2}\s?[A-Z]{0,3}\s?\d{1,4}|\d{2}\s?BH\s?\d{4}\s?[A-Z]{1,2})$/i;
export function vehicleProblem(v: string | null | undefined) {
  const t = String(v ?? "").trim();
  if (!t) return "";
  return VEHICLE_RE.test(t) ? "" : "This does not look like a vehicle number, like TS 08 EZ 4410";
}
/** "TS08EZ4410" → "TS 08 EZ 4410". */
export function tidyVehicle(v: string) {
  const t = v.toUpperCase().replace(/\s+/g, "");
  const m = /^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/.exec(t);
  if (!m) return v.toUpperCase().replace(/\s+/g, " ").trim();
  return [m[1], m[2].padStart(2, "0"), m[3], m[4]].filter(Boolean).join(" ");
}

/** "HH:MM" to minutes. */
export const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
/** Minutes to "10:30 AM". */
export function clockOf(min: number) {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
/** Minutes to "HH:MM". */
export const hhmmOf = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
