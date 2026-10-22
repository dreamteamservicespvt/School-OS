// The kinds of notification a person can choose channels for in My profile
// (00-global.md §1.4 and §4). Each kind groups the notification `type`s that
// modules write with notify(). No database here, so the browser can use it too.

export const NOTE_CHANNELS = ["app", "push", "whatsapp", "sms", "email"] as const;
export type NoteChannel = (typeof NOTE_CHANNELS)[number];
export const NOTE_CHANNEL_LABEL: Record<NoteChannel, string> = { app: "App", push: "Push", whatsapp: "WhatsApp", sms: "SMS", email: "Email" };

export type NoteKind = {
  key: string;
  label: string;
  types: string[];
  /** Always shown in the app; only the extra channels can be chosen. */
  locked?: boolean;
  defaults: NoteChannel[];
  /** Shown only to people who can get it (a module they can open). */
  module?: string;
};

export const NOTE_KINDS: NoteKind[] = [
  { key: "approvals", label: "Approvals waiting for me", types: ["approval"], locked: true, defaults: ["app", "push"] },
  { key: "tasks", label: "Tasks and questions for me", types: ["handover", "interview", "query", "counselling-referral", "task-assigned", "task-done", "task-comment", "task-due", "work-reminder", "fee-promise", "message-failed"], defaults: ["app", "push"] },
  { key: "substitutions", label: "Substitutions I must take", types: ["substitution", "timetable-published"], defaults: ["app"], module: "academic-management" },
  { key: "staff", label: "My leave and staff matters", types: ["staff-leave", "appraisal", "staff-exit", "settlement"], defaults: ["app"], module: "staff-hr-management" },
  { key: "transport", label: "Bus alerts, trips and vehicle papers", types: ["transport-alert", "transport-trip", "transport-reminder"], defaults: ["app"], module: "transport-management" },
  { key: "transport-emergency", label: "Bus emergency button pressed", types: ["transport-emergency"], locked: true, defaults: ["app", "push", "whatsapp"], module: "transport-management" },
  { key: "looking-ahead", label: "Looking ahead: what may happen next", types: ["looking-ahead"], defaults: ["app", "push"], module: "reports-analytics" },
  { key: "management-brief", label: "Today's brief (school mornings) and the weekly brief (Mondays)", types: ["management-brief"], defaults: ["app"], module: "reports-analytics" },
  { key: "documents", label: "Documents running out", types: ["document-expiry"], defaults: ["app"] },
  { key: "notices", label: "Notices from the school", types: ["notice", "staff-message"], defaults: ["app"] },
  { key: "security", label: "Security alerts (new sign-in, password changed)", types: ["security", "privacy"], locked: true, defaults: ["app", "email"] },
];

export type NotePrefs = Record<string, NoteChannel[]>;

/** The person's saved choices with defaults filled in; the app is always on for locked kinds. */
export function readNotePrefs(raw: unknown): NotePrefs {
  const saved = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: NotePrefs = {};
  for (const k of NOTE_KINDS) {
    const v = saved[k.key];
    const list = Array.isArray(v) ? (v.filter((c) => (NOTE_CHANNELS as readonly string[]).includes(c)) as NoteChannel[]) : k.defaults;
    out[k.key] = k.locked && !list.includes("app") ? ["app", ...list] : list;
  }
  return out;
}

/** The channels a person chose for one notification `type`. Types not listed go to the app only. */
export function channelsForType(raw: unknown, type: string): NoteChannel[] {
  const kind = NOTE_KINDS.find((k) => k.types.includes(type));
  return kind ? readNotePrefs(raw)[kind.key] : ["app"];
}
