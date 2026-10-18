// Lists and checks for Modules On/Off, with no database, so the browser can
// use them too: AI features, school-type templates and integrations.
import type { ModuleKey } from "../modules";
import { publicUrlProblem } from "../net/public-address";

/**
 * AI features under the AI assistant (Modules On/Off). Each is a School Feature switch other modules read.
 * - ready: built; the school can switch it on.
 * - coming-soon: listed so the school knows it is planned, but it cannot be switched on until it is built.
 * - hidden: decided not to build (AI question papers, gap list 17 October 2026). The key is kept, never shown.
 */
export const AI_FEATURES = [
  { key: "ai-ask-do", label: "Ask and Do", status: "coming-soon", about: "Questions in plain words, and actions prepared as a filled form a person checks. Includes ready-made questions per role." },
  { key: "ai-smart-import", label: "Smart Import", status: "ready", about: "When importing a spreadsheet, suggests which column is which and likely fixes (dates, phone numbers, class names). With the AI service connected, it also suggests columns the rules could not match, from the headings only. You tick each suggestion before it is used." },
  { key: "ai-enquiry-reply", label: "AI auto-reply to enquiries", status: "coming-soon", about: "Suggests replies to admission enquiries; a person sends them." },
  { key: "ai-insights", label: "Student insights and early warnings", status: "ready", about: "Flags students whose attendance, marks or fees need attention." },
  { key: "ai-forecasts", label: "Forecasts", status: "ready", about: "Looking ahead from the school's own records: attendance and marks heading below the line, fees likely to come late, seats likely to stay empty, staff and cash." },
  { key: "ai-teacher-assistant", label: "Teacher assistant", status: "ready", about: "Drafts homework, feedback on submissions and report card remarks for the teacher to edit." },
  { key: "ai-question-papers", label: "AI question papers", status: "hidden", about: "Not built: free tools already do this." },
  { key: "ai-translation", label: "Translation of typed messages", status: "coming-soon", about: "Translates a typed message into each parent's language. The sender sees and can edit each translation; the parent's copy says \"Translated from English\"." },
] as const satisfies readonly { key: string; label: string; status: "ready" | "coming-soon" | "hidden"; about: string }[];

export type AiFeatureKey = (typeof AI_FEATURES)[number]["key"];

/** The AI features shown in Modules On/Off: every one except those decided not to build. */
export const SHOWN_AI_FEATURES = AI_FEATURES.filter((f) => f.status !== "hidden");

/** A feature can be switched on, and works, only once it is built. */
export const aiFeatureReady = (key: string) => AI_FEATURES.some((f) => f.key === key && f.status === "ready");

/** Who may use the AI assistant when the school has not chosen yet: the leaders who switch it on. */
export const DEFAULT_AI_ROLES: readonly string[] = ["school-admin", "principal"];

/** The roles the school chose for the AI assistant (Modules On/Off), or the default leaders when none was saved. */
export const aiRolesOf = (prefs: { aiRoles?: string[] | null }) => (Array.isArray(prefs.aiRoles) ? prefs.aiRoles : [...DEFAULT_AI_ROLES]);

/** What the AI checks need to know about a person: the school's switches, their roles and the AI roles. */
export type AiWho = { features: ReadonlySet<string>; roles: readonly { key: string | null }[]; aiRoles?: readonly string[] | null };

export type AiOff = "assistant-off" | "feature-off" | "not-built" | "role-not-allowed";

/** Plain words for why AI is not used here. */
export const AI_OFF_WORDS: Record<AiOff, string> = {
  "assistant-off": "The AI assistant is off for this school.",
  "feature-off": "This AI feature is off for this school.",
  "not-built": "This AI feature is not ready yet.",
  "role-not-allowed": "Your role does not use the AI assistant in this school.",
};

/**
 * Why AI may not be used by this person for this feature, or null when it may (00-global.md §2.1 rule 8):
 * the AI assistant is on, the feature is built and on, and one of the person's roles is in the AI roles.
 * Without a feature, only the assistant and the role are checked.
 */
export function aiOffReason(who: AiWho, feature?: string): AiOff | null {
  if (!who.features.has("ai-assistant")) return "assistant-off";
  if (feature) {
    if (!aiFeatureReady(feature)) return "not-built";
    if (!who.features.has(feature)) return "feature-off";
  }
  const allowed = new Set(who.aiRoles ?? DEFAULT_AI_ROLES);
  if (!who.roles.some((r) => r.key && allowed.has(r.key))) return "role-not-allowed";
  return null;
}

/** May this person use AI here: one check for every place AI appears. */
export const aiAllowed = (who: AiWho, feature?: string) => aiOffReason(who, feature) === null;

export type SchoolTemplate = {
  key: string;
  name: string;
  about: string;
  board: string;
  modulesOn: ModuleKey[];
  weekStart: "monday" | "sunday";
  rollNumberOrder: "name" | "gender-name" | "admission";
};

/** School-type templates (inferred names and contents). They only switch modules on, never off. */
export const SCHOOL_TEMPLATES: SchoolTemplate[] = [
  { key: "cbse-day", name: "CBSE day school", about: "A CBSE school where children go home each day, with a library and school buses.", board: "CBSE", modulesOn: ["library-management", "transport-management", "inventory-management"], weekStart: "monday", rollNumberOrder: "name" },
  { key: "state-day", name: "State board day school", about: "A state board school with a library.", board: "State Board", modulesOn: ["library-management"], weekStart: "monday", rollNumberOrder: "name" },
  { key: "boarding", name: "Boarding school", about: "Children live at school: hostel, library and store.", board: "CBSE", modulesOn: ["hostel-management", "library-management", "inventory-management"], weekStart: "monday", rollNumberOrder: "name" },
  { key: "pre-school", name: "Pre-school", about: "Nursery to UKG, with school vans.", board: "Custom", modulesOn: ["transport-management"], weekStart: "monday", rollNumberOrder: "gender-name" },
];

export type IntegrationField = { key: string; label: string; type: "text" | "url" | "secret" | "email" | "ip"; required: boolean; help?: string; placeholder?: string };
export type IntegrationDef = { key: string; name: string; about: string; fields: IntegrationField[] };

export const INTEGRATIONS: IntegrationDef[] = [
  { key: "google", name: "Google account", about: "Google Workspace for staff email, calendars and Classroom.", fields: [
    { key: "domain", label: "Google Workspace domain", type: "text", required: true, placeholder: "sunriseschool.edu.in" },
    { key: "adminEmail", label: "Admin email", type: "email", required: true },
    { key: "serviceKey", label: "Service account key (JSON)", type: "secret", required: true, help: "From Google Cloud, IAM, Service accounts. Stored encrypted; never shown again." },
  ] },
  { key: "microsoft", name: "Microsoft account", about: "Microsoft 365 for staff email and Teams.", fields: [
    { key: "tenantId", label: "Tenant ID", type: "text", required: true },
    { key: "clientId", label: "Application (client) ID", type: "text", required: true },
    { key: "clientSecret", label: "Client secret", type: "secret", required: true, help: "Stored encrypted; never shown again." },
  ] },
  { key: "tally", name: "Tally", about: "Sends the Day Book to Tally for the auditor.", fields: [
    { key: "address", label: "Tally server address", type: "url", required: true, placeholder: "https://tally.yourschool.in:9000", help: "Tally must be reachable from the internet for School OS to send entries." },
    { key: "company", label: "Company name in Tally", type: "text", required: true },
  ] },
  { key: "printers", name: "Printers and scanners", about: "Receipt and ID card printers on the school network.", fields: [
    { key: "name", label: "Printer name", type: "text", required: true, placeholder: "Front office receipt printer" },
    { key: "ip", label: "Printer network address (IP)", type: "ip", required: true, placeholder: "192.168.1.50" },
  ] },
  { key: "cctv", name: "CCTV links", about: "Opens camera views from the Front Office.", fields: [
    { key: "address", label: "Camera viewer address", type: "url", required: true },
    { key: "username", label: "Username", type: "text", required: false },
    { key: "password", label: "Password", type: "secret", required: false, help: "Stored encrypted; never shown again." },
  ] },
  { key: "lms", name: "Outside learning platform", about: "Moodle, Google Classroom or another LMS the school uses.", fields: [
    { key: "platform", label: "Platform name", type: "text", required: true, placeholder: "Moodle" },
    { key: "address", label: "Platform address", type: "url", required: true },
    { key: "apiKey", label: "API key", type: "secret", required: true, help: "Stored encrypted; never shown again." },
  ] },
  { key: "iot", name: "IoT devices", about: "Smart boards, sensors and other connected devices.", fields: [
    { key: "address", label: "Device hub address", type: "url", required: true },
    { key: "apiKey", label: "API key", type: "secret", required: true, help: "Stored encrypted; never shown again." },
  ] },
  { key: "webhooks", name: "Webhooks to other systems", about: "Tells another system when something happens in School OS.", fields: [
    { key: "address", label: "Webhook address", type: "url", required: true, placeholder: "https://example.com/school-os" },
    { key: "secret", label: "Signing secret", type: "secret", required: true, help: "Used to sign each call so the other system knows it came from School OS." },
  ] },
  { key: "gps", name: "GPS tracking provider", about: "Bus locations, for Transport.", fields: [
    { key: "provider", label: "Provider name", type: "text", required: true },
    { key: "address", label: "Provider API address", type: "url", required: true },
    { key: "apiKey", label: "API key", type: "secret", required: true, help: "Stored encrypted; never shown again." },
  ] },
  { key: "attendance-devices", name: "Attendance devices", about: "Biometric or card machines for staff and student attendance.", fields: [
    { key: "brand", label: "Device brand", type: "text", required: true, placeholder: "eSSL" },
    { key: "serials", label: "Device serial numbers", type: "text", required: true, help: "Separate several with commas." },
    { key: "location", label: "Where the devices are", type: "text", required: false, placeholder: "Main gate" },
  ] },
];

export const INTEGRATION_STATUS: Record<string, { label: string; tone: "success" | "danger" | "neutral" }> = {
  connected: { label: "Connected", tone: "success" },
  error: { label: "Error", tone: "danger" },
  "not-connected": { label: "Not connected", tone: "neutral" },
};

const IP = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

/** Tally's own server speaks plain http; every other address must be https. */
export const httpAllowed = (def: Pick<IntegrationDef, "key">) => def.key === "tally";

/** Checks the typed details. Secret fields may stay blank when a secret is already saved. */
export function checkIntegrationFields(def: IntegrationDef, values: Record<string, string>, opts: { secretsKept: boolean }) {
  const errors: Record<string, string> = {};
  for (const f of def.fields) {
    const v = (values[f.key] ?? "").trim();
    if (!v) {
      if (f.required && !(f.type === "secret" && opts.secretsKept)) errors[f.key] = `${f.label} is needed.`;
      continue;
    }
    if (v.length > 4000) errors[f.key] = `${f.label} is too long.`;
    else if (f.type === "url") {
      let u: URL | null = null;
      try { u = new URL(v); } catch { u = null; }
      if (!u || !["https:", "http:"].includes(u.protocol)) errors[f.key] = `${f.label} must be a full web address, like https://example.com.`;
      else if (u.protocol !== "https:" && !httpAllowed(def)) errors[f.key] = `${f.label} must start with https:// so the connection is encrypted.`;
      else {
        // School OS calls this address, so never one inside a private network (checked again after the name is looked up).
        const refused = publicUrlProblem(v, { allowHttp: httpAllowed(def) });
        if (refused) errors[f.key] = `${f.label}: ${refused}`;
      }
    } else if (f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) errors[f.key] = `${f.label} does not look right. It should be like name@example.com.`;
    else if (f.type === "ip" && !IP.test(v)) errors[f.key] = `${f.label} should be like 192.168.1.50.`;
    else if (def.key === "google" && f.key === "serviceKey" && v !== "kept") {
      try {
        const j = JSON.parse(v);
        if (!j.client_email || !j.private_key) errors[f.key] = "This is not a Google service account key. It should be the JSON file with client_email and private_key.";
      } catch {
        errors[f.key] = "Paste the whole JSON key file from Google Cloud.";
      }
    } else if (def.key === "microsoft" && (f.key === "tenantId" || f.key === "clientId") && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
      errors[f.key] = `${f.label} should look like 1a2b3c4d-1234-5678-9abc-1234567890ab (from the Azure portal).`;
    }
  }
  return errors;
}
