// School-wide choices kept on the School record, and their rules. No
// database here, so the browser can use the same lists and checks.
// Other modules read the school's choices with readPreferences(school.preferences).

export const BOARDS = [
  { value: "CBSE", label: "CBSE" },
  { value: "ICSE", label: "ICSE" },
  { value: "State Board", label: "State board" },
  { value: "IB", label: "IB" },
  { value: "Cambridge", label: "Cambridge" },
  { value: "Custom", label: "Custom" },
] as const;

export type BoardDefaults = { terms: string[]; gradeScale: string; reportCard: string } | null;

/** What each board sets as defaults; each module offers these and the school can still change them there (inferred). */
const BOARD_DEFAULTS: Record<string, BoardDefaults> = {
  CBSE: { terms: ["Term 1", "Term 2"], gradeScale: "CBSE 9-point grade scale", reportCard: "CBSE report card" },
  ICSE: { terms: ["Term 1", "Term 2"], gradeScale: "ICSE percentage and grade scale", reportCard: "ICSE report card" },
  "State Board": { terms: ["Term 1", "Term 2", "Term 3"], gradeScale: "State board grade scale", reportCard: "State board report card" },
  IB: { terms: ["Semester 1", "Semester 2"], gradeScale: "IB 1 to 7 scale", reportCard: "IB report" },
  Cambridge: { terms: ["Term 1", "Term 2", "Term 3"], gradeScale: "Cambridge A* to G grades", reportCard: "Cambridge report card" },
  Custom: null,
};

export function boardDefaults(board: string | null | undefined): BoardDefaults {
  return (board && BOARD_DEFAULTS[board]) || null;
}

/** "CBSE: 2 terms, CBSE 9-point grade scale, CBSE report card." */
export function boardDefaultsWords(board: string) {
  const d = boardDefaults(board);
  if (!d) return "Custom: nothing is filled in; set terms, the grade scale and the report card in each module.";
  return `${board}: ${d.terms.length} terms, ${d.gradeScale}, ${d.reportCard}.`;
}

export const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "te", label: "Telugu" },
  { value: "ta", label: "Tamil" },
  { value: "kn", label: "Kannada" },
  { value: "ml", label: "Malayalam" },
  { value: "mr", label: "Marathi" },
  { value: "bn", label: "Bengali" },
] as const;
export const languageLabel = (v: string) => LANGUAGES.find((l) => l.value === v)?.label ?? v;

export const TIME_ZONES = [
  { value: "Asia/Kolkata", label: "India (Asia/Kolkata)" },
  { value: "Asia/Kathmandu", label: "Nepal (Asia/Kathmandu)" },
  { value: "Asia/Dhaka", label: "Bangladesh (Asia/Dhaka)" },
  { value: "Asia/Dubai", label: "UAE (Asia/Dubai)" },
  { value: "Asia/Muscat", label: "Oman (Asia/Muscat)" },
  { value: "Asia/Qatar", label: "Qatar (Asia/Qatar)" },
  { value: "Asia/Riyadh", label: "Saudi Arabia (Asia/Riyadh)" },
  { value: "Asia/Singapore", label: "Singapore (Asia/Singapore)" },
] as const;

export const DOCUMENT_TYPES_VAULT = [
  "Registration",
  "Affiliation",
  "NOC",
  "Fire safety",
  "Building safety",
  "Sanitation and health",
  "Recognition",
  "Other",
] as const;

export const WEEK_STARTS = [
  { value: "monday", label: "Monday" },
  { value: "sunday", label: "Sunday" },
] as const;

export const ROLL_ORDERS = [
  { value: "name", label: "By name (A to Z)" },
  { value: "gender-name", label: "Girls first, then boys, each by name" },
  { value: "admission", label: "By admission number" },
] as const;

export type Preferences = {
  weekStart?: "monday" | "sunday";
  rollNumberOrder?: "name" | "gender-name" | "admission";
  /** Role keys allowed to use the AI assistant. */
  aiRoles?: string[];
  secondBoard?: string | null;
  boardDefaults?: BoardDefaults;
  compliance?: { udiseCode?: string | null; boardSchoolCode?: string | null; registrationNumber?: string | null; panNumber?: string | null };
  /** The school-type template last applied (Modules On/Off). */
  schoolTemplate?: string | null;
};

export function readPreferences(raw: unknown): Preferences {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Preferences) : {};
}

/** Week start and roll number order with their defaults filled in. */
export function systemPreferences(raw: unknown) {
  const p = readPreferences(raw);
  return { weekStart: p.weekStart ?? "monday", rollNumberOrder: p.rollNumberOrder ?? "name" } as const;
}

const GST_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * GSTIN: 15 characters, a 2-digit state code, the PAN, an entity number, Z,
 * and a check character. Returns a plain-words problem, or null.
 */
export function checkGstin(input: string): string | null {
  const v = input.trim().toUpperCase();
  if (v.length !== 15) return `GSTIN has ${v.length} characters. A GSTIN has 15.`;
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v)) return "This GSTIN does not look right. It should be like 36ABCDE1234F1Z5: state code, PAN, a number, Z and a check character.";
  const state = Number(v.slice(0, 2));
  if (!((state >= 1 && state <= 38) || state === 97 || state === 99)) return "The first 2 digits of the GSTIN are not an Indian state code.";
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = GST_CHARS.indexOf(v[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  const check = GST_CHARS[(36 - (sum % 36)) % 36];
  if (check !== v[14]) return "The last character of the GSTIN does not match. Check the GSTIN for a typing mistake.";
  return null;
}

/** Colours a school can pick for its branding (the hex is used on documents and the preview). */
export const BRAND_PRESETS = ["#1d4ed8", "#0f766e", "#6d28d9", "#be123c", "#b45309", "#15803d", "#0f172a", "#7c2d12"];
export const HEX = /^#[0-9a-f]{6}$/i;

/** Text colour that reads well on a brand colour, for the preview and documents. */
export function inkOn(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.4 ? "#111111" : "#ffffff";
}
