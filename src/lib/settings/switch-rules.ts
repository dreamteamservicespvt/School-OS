// Lists and checks for Modules On/Off, with no database, so the browser can
// use them too: AI features, school-type templates and integrations.
import type { ModuleKey } from "../modules";
import { publicUrlProblem } from "../net/public-address";

/** AI features under the AI assistant (Modules On/Off). Each is a School Feature switch other modules read. */
export const AI_FEATURES = [
  { key: "ai-ask-do", label: "Ask and Do", about: "Questions in plain words, and actions prepared as a filled form a person checks. Includes ready-made questions per role." },
  { key: "ai-smart-import", label: "Smart Import", about: "Suggests how columns of an Excel file match, when importing." },
  { key: "ai-enquiry-reply", label: "AI auto-reply to enquiries", about: "Suggests replies to admission enquiries; a person sends them." },
  { key: "ai-insights", label: "Student insights and early warnings", about: "Flags students whose attendance, marks or fees need attention." },
  { key: "ai-forecasts", label: "Forecasts", about: "Expected fee collection and admissions, from the school's own records." },
  { key: "ai-principal-summary", label: "Principal summary", about: "Today's brief for the Principal and School Admin each school morning, and the weekly brief on Monday: what happened, what may need them next and what waits for their decision. Every number is the school's own record, with a link to the list behind it." },
  { key: "ai-teacher-assistant", label: "Teacher assistant", about: "Helps teachers draft lesson plans and homework." },
  { key: "ai-question-papers", label: "AI question papers", about: "Drafts question papers from the syllabus for the teacher to edit." },
  { key: "ai-translation", label: "Translation of typed messages", about: "Translates a typed message into each parent's language. The sender sees and can edit each translation; the parent's copy says \"Translated from English\"." },
] as const;

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
