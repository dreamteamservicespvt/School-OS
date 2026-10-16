// Hostel Management's screen words (15, 00-global.md §9): statuses, their
// colours and small helpers shared by the server and the browser.

export const BASE = "/hostel-management";
export const MODULE = "hostel-management" as const;

export type Tone = "ok" | "warn" | "bad" | "info" | "brand" | "neutral";

export type Gender = "BOYS" | "GIRLS";
export const GENDER: Record<Gender, { label: string; student: string; short: string }> = {
  BOYS: { label: "Boys' hostel", student: "boys", short: "Boys" },
  GIRLS: { label: "Girls' hostel", student: "girls", short: "Girls" },
};

/** The student's gender as written on their record ("Male", "Female"...), as the hostel kind it fits. */
export function genderFits(studentGender: string | null | undefined): Gender | null {
  const g = (studentGender ?? "").trim().toLowerCase();
  if (["male", "m", "boy"].includes(g)) return "BOYS";
  if (["female", "f", "girl"].includes(g)) return "GIRLS";
  return null;
}

/** A resident's status on the residents list (15 §2 Allocation). */
export type ResidentStatus = "NOT_ARRIVED" | "IN" | "OUTING" | "LEAVE" | "LATE" | "OUT";
export const RESIDENT_STATUS: Record<ResidentStatus, { label: string; tone: Tone }> = {
  NOT_ARRIVED: { label: "Not arrived", tone: "warn" },
  IN: { label: "Checked in", tone: "ok" },
  OUTING: { label: "On outing", tone: "info" },
  LEAVE: { label: "On leave", tone: "brand" },
  LATE: { label: "Late back", tone: "bad" },
  OUT: { label: "Checked out", tone: "neutral" },
};

/** Gate Pass statuses for the Hostel Outing kind; LATE is shown when OUT past the back-by time. */
export type PassStatus = "WAITING" | "APPROVED" | "OUT" | "RETURNED" | "REJECTED" | "CANCELLED" | "LATE";
export const PASS_STATUS: Record<PassStatus, { label: string; tone: Tone }> = {
  WAITING: { label: "Waiting", tone: "warn" },
  APPROVED: { label: "Approved", tone: "info" },
  OUT: { label: "Out", tone: "brand" },
  LATE: { label: "Late", tone: "bad" },
  RETURNED: { label: "Returned", tone: "ok" },
  REJECTED: { label: "Rejected", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export type OutingType = "OUTING" | "LEAVE";
export const OUTING_TYPE: Record<OutingType, { label: string; help: string }> = {
  OUTING: { label: "Outing", help: "Same day" },
  LEAVE: { label: "Leave", help: "Overnight" },
};

export type RollSession = "MORNING" | "NIGHT";
export const SESSION: Record<RollSession, string> = { MORNING: "Morning", NIGHT: "Night" };

export type RollMark = "PRESENT" | "ABSENT" | "OUTING" | "LEAVE";
export const MARK: Record<RollMark, { label: string; short: string; tone: Tone }> = {
  PRESENT: { label: "Present", short: "P", tone: "ok" },
  ABSENT: { label: "Absent", short: "A", tone: "bad" },
  OUTING: { label: "On outing", short: "O", tone: "info" },
  LEAVE: { label: "On leave", short: "L", tone: "brand" },
};

export type IncidentType = "DISCIPLINE" | "MEDICAL" | "MAINTENANCE";
export const INCIDENT_TYPE: Record<IncidentType, { label: string; tone: Tone }> = {
  DISCIPLINE: { label: "Discipline", tone: "warn" },
  MEDICAL: { label: "Medical", tone: "info" },
  MAINTENANCE: { label: "Maintenance", tone: "neutral" },
};

export const ROOM_TYPES = ["Non-AC", "AC"] as const;
export const DEFAULT_MEALS = ["Breakfast", "Lunch", "Snacks", "Dinner"];
export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** Menu days run Monday (0) to Sunday (6). */
export const MENU_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Common mess expense items for the quick chips (the approved design). */
export const MESS_ITEMS = ["Vegetables", "Milk", "Rice and grains", "Gas cylinder", "Groceries", "Fruits", "Eggs", "Cleaning"];

/** Relations offered when a visitor or the person going with the student is not a guardian. */
export const RELATIONS = ["Father", "Mother", "Uncle", "Aunt", "Grandfather", "Grandmother", "Brother", "Sister", "Guardian", "Other"];

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

/** "6:00 PM" for a minute of the day. */
export function minuteWords(m: number) {
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(mm).padStart(2, "0")} ${ap}`;
}

/** "18:00" for a minute of the day (time boxes). */
export const minuteValue = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** "18:30" → 1110, or null. */
export function parseMinute(v: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((v ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

/** "2 h 20 min" / "45 min". */
export function lateWords(min: number) {
  if (min >= 60 * 24) return `${Math.floor(min / (60 * 24))} d ${Math.floor((min % (60 * 24)) / 60)} h`;
  return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
}

/** "Room B-12, Bed 3". */
export const bedWords = (roomNo: string, bedNo: number) => `Room ${roomNo}, Bed ${bedNo}`;
/** "Bed 3, Room 12" (the rule's words: "Ravi already has Bed 3, Room 12"). */
export const bedRoom = (roomNo: string, bedNo: number) => `Bed ${bedNo}, Room ${roomNo}`;

/** Paise as a plain rupee number for a form box: 2400000 → "24000". */
export function paiseToRupees(p: bigint | number | null | undefined) {
  if (p == null) return "";
  const n = Number(p);
  return n % 100 === 0 ? String(n / 100) : (n / 100).toFixed(2);
}

/** The Monday of the week a date (00:00 UTC) falls in. */
export function mondayOf(d: Date) {
  const dow = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - dow * 86_400_000);
}

export const isoOf = (d: Date) => d.toISOString().slice(0, 10);
