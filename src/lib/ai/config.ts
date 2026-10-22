// The AI service's platform settings. DREAM TEAM sets them in the hosting
// provider's secret store (08-platform-security.md §3); none is ever in the
// code. They are read each time they are needed, so setting or removing the
// key takes effect without a new release. With no key, AI is "not connected"
// and every feature keeps its rule-based behaviour.
import "server-only";

const num = (v: string | undefined, fallback: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.floor(n) : fallback;
};

/** The platform key, or null when DREAM TEAM has not connected the AI service (or switched it off for everyone). */
export function aiKey(): string | null {
  if (/^(1|on|true|yes)$/i.test(process.env.AI_GLOBAL_OFF ?? "")) return null;
  const key = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  return key || null;
}

/** The model asked. Exact id, no date suffix. */
export const aiModel = () => (process.env.AI_MODEL ?? "").trim() || "claude-opus-5-5";

/** How long one request may take before it is given up (the person carries on by hand). */
export const aiTimeoutMs = () => num(process.env.AI_TIMEOUT_MS, 20_000, 2_000, 120_000);

/** DREAM TEAM's limit on requests a day for any one school. A school may choose a lower one. */
export const aiPlatformDailyLimit = () => num(process.env.AI_DAILY_LIMIT, 100, 1, 100_000);

/** Rupees to a US dollar, for the estimated cost shown to the school. */
export const aiRupeesPerDollar = () => num(process.env.AI_INR_PER_USD, 88, 1, 1000);
