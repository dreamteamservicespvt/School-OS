// A school's WhatsApp as the console sees it (console school page and the
// Dashboard's "WhatsApp by school"): which number it sends from, whether it
// works, and how much it was used. Counts only, never a parent's number or a
// message (07-super-admin.md §1). measureSchool() writes it on the school's
// console card; no database here, so the screens and the tests can use it.

export type WhatsappMode = "dream-team" | "own" | "test";

export type WhatsappSummary = {
  mode: WhatsappMode;
  isOn: boolean;
  /** Sending for real (not test mode). */
  live: boolean;
  /** The number's IDs and token are all there. */
  ready: boolean;
  /** The 10-digit number parents see, when known. */
  number: string | null;
  sentToday: number;
  sentMonth: number;
  failedToday: number;
  failedMonth: number;
  creditsUsedMonth: number;
  creditsLeft: number;
  lastError: string | null;
  lastErrorAt: string | null;
  lastSentAt: string | null;
};

export const WHATSAPP_MODE_LABEL: Record<WhatsappMode, string> = {
  "dream-team": "DREAM TEAM's number",
  own: "School's own number",
  test: "Test mode, nothing is sent",
};

export type WhatsappHealth = { key: "working" | "failing" | "not-set-up" | "test" | "off" | "unknown"; label: string; tone: "success" | "danger" | "warning" | "neutral" };

/** The mode for a channel's provider key. */
export function whatsappMode(provider: string): WhatsappMode {
  return provider === "dream-team" ? "dream-team" : provider === "meta-cloud" ? "own" : "test";
}

/** Reads the card's JSON; null when the school has not been counted since this was added. */
export function readWhatsappSummary(raw: unknown): WhatsappSummary | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.mode !== "dream-team" && r.mode !== "own" && r.mode !== "test") return null;
  const n = (k: string) => (typeof r[k] === "number" && Number.isFinite(r[k]) ? (r[k] as number) : 0);
  const s = (k: string) => (typeof r[k] === "string" && r[k] ? (r[k] as string) : null);
  return {
    mode: r.mode, isOn: r.isOn === true, live: r.live === true, ready: r.ready === true, number: s("number"),
    sentToday: n("sentToday"), sentMonth: n("sentMonth"), failedToday: n("failedToday"), failedMonth: n("failedMonth"),
    creditsUsedMonth: n("creditsUsedMonth"), creditsLeft: n("creditsLeft"),
    lastError: s("lastError"), lastErrorAt: s("lastErrorAt"), lastSentAt: s("lastSentAt"),
  };
}

/**
 * Working, failing, not set up, test mode or off. Failing: today more
 * WhatsApp messages failed than went out (at least one failed).
 */
export function whatsappHealth(s: WhatsappSummary | null): WhatsappHealth {
  if (!s) return { key: "unknown", label: "Not counted yet", tone: "neutral" };
  if (!s.isOn) return { key: "off", label: "Off", tone: "neutral" };
  if (s.mode === "test" || !s.live) return { key: "test", label: "Test mode", tone: "warning" };
  if (!s.ready) return { key: "not-set-up", label: "Not set up", tone: "danger" };
  if (s.failedToday > 0 && s.failedToday >= s.sentToday) return { key: "failing", label: "Failing", tone: "danger" };
  return { key: "working", label: "Working", tone: "success" };
}

/** Midnight in India (IST, UTC+5:30) for the day and the month of `now`. */
export function istStarts(now: Date): { day: Date; month: Date } {
  const OFFSET = 330 * 60_000;
  const ist = new Date(now.getTime() + OFFSET);
  const day = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - OFFSET);
  const month = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - OFFSET);
  return { day, month };
}
