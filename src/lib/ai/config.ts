// The AI service's platform settings. DREAM TEAM sets them in the hosting
// provider's secret store (08-platform-security.md §3); none is ever in the
// code. They are read each time they are needed, so setting or removing the
// key takes effect without a new release. With no key, AI is "not connected"
// and every feature keeps its rule-based behaviour.
//
// Two services can answer: Claude (ANTHROPIC_API_KEY) or Google Gemini
// (GEMINI_API_KEY). AI_PROVIDER picks one: "auto" (the default) uses Claude
// when its key is set, else Gemini when its key is set; "gemini" or
// "anthropic" uses only that one. AI_GLOBAL_OFF stops both, and speech too.
// Speaking replies aloud (the assistant's voice) needs the Gemini key, because
// only Gemini has a voice model; it works whichever service writes the words.
import "server-only";

const num = (v: string | undefined, fallback: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? Math.floor(n) : fallback;
};

export type AiServiceName = "anthropic" | "gemini";

const globalOff = () => /^(1|on|true|yes)$/i.test(process.env.AI_GLOBAL_OFF ?? "");
const anthropicKey = () => (process.env.ANTHROPIC_API_KEY ?? "").trim() || null;
const geminiKey = () => (process.env.GEMINI_API_KEY ?? "").trim() || null;

/** Which service answers, with its key, or null when none is connected (or AI is switched off for everyone). */
export function aiService(): { name: AiServiceName; key: string } | null {
  if (globalOff()) return null;
  const wanted = (process.env.AI_PROVIDER ?? "").trim().toLowerCase();
  const a = anthropicKey(), g = geminiKey();
  if (wanted === "gemini") return g ? { name: "gemini", key: g } : null;
  if (wanted === "anthropic" || wanted === "claude") return a ? { name: "anthropic", key: a } : null;
  // auto: Claude when its key is set (as before), else Gemini.
  if (a) return { name: "anthropic", key: a };
  return g ? { name: "gemini", key: g } : null;
}

/** The platform key of the service that answers, or null when DREAM TEAM has not connected the AI service (or switched it off for everyone). */
export function aiKey(): string | null {
  return aiService()?.key ?? null;
}

/** The Gemini key for the voice, or null (no key, or AI switched off for everyone). */
export function aiSpeechKey(): string | null {
  if (globalOff()) return null;
  if (/^(off|none|0)$/i.test((process.env.AI_TTS_MODEL ?? "").trim())) return null;
  return geminiKey();
}

/** Each service's own model when AI_MODEL is not set. Exact ids, no date suffix. */
export const DEFAULT_MODEL: Record<AiServiceName, string> = { anthropic: "claude-opus-5-5", gemini: "gemini-3.8-flash" };
/** Gemini's second try when the first model is not offered to the key, busy or out of free requests. */
export const DEFAULT_GEMINI_FALLBACK = "gemini-3.1-flash-lite";
/** Gemini's voice models: the expressive one first, the lighter one when it is not offered or busy. */
export const DEFAULT_TTS_MODEL = "gemini-3.8-flash-tts";
export const DEFAULT_TTS_FALLBACK = "gemini-3.8-flash-lite-tts";

const isFor = (name: AiServiceName, model: string) => (name === "gemini" ? /^gemini-/i.test(model) : /^claude-/i.test(model));

/**
 * A model id that fits the service that answers: a Claude id is never sent to
 * Gemini, or the other way round (an AI_MODEL left over from the other service
 * falls back to the service's own default). With no service, the id as it is.
 */
export function fitModel(model: string): string {
  const name = aiService()?.name;
  if (!name) return model;
  return isFor(name, model) ? model : DEFAULT_MODEL[name];
}

/** The model asked. Exact id, no date suffix. */
export const aiModel = () => {
  const name = aiService()?.name ?? "anthropic";
  return fitModel((process.env.AI_MODEL ?? "").trim() || DEFAULT_MODEL[name]);
};

/** Gemini only: the model tried when the first one cannot answer (not offered to the key, busy, out of requests). */
export const aiFallbackModel = () => {
  const m = (process.env.AI_FALLBACK_MODEL ?? "").trim();
  return m && /^gemini-/i.test(m) ? m : DEFAULT_GEMINI_FALLBACK;
};

/** The voice model and its fallback. */
export const aiTtsModel = () => {
  const m = (process.env.AI_TTS_MODEL ?? "").trim();
  return m && /^gemini-/i.test(m) ? m : DEFAULT_TTS_MODEL;
};
export const aiTtsFallbackModel = () => {
  const m = (process.env.AI_TTS_FALLBACK_MODEL ?? "").trim();
  return m && /^gemini-/i.test(m) ? m : DEFAULT_TTS_FALLBACK;
};

/** The assistant characters' voices (Gemini prebuilt voice names): Achird "friendly" for the Robot, Leda "youthful" for the Cat. */
export const DEFAULT_VOICE: Record<"robot" | "cat", string> = { robot: "Achird", cat: "Leda" };

/**
 * The voice for an assistant character in a language: AI_TTS_VOICE_<CHARACTER>_<LANG>
 * (e.g. AI_TTS_VOICE_ROBOT_TE), else AI_TTS_VOICE_<CHARACTER>, else the default.
 * Only a plain voice name is used (letters, 2 to 40).
 */
export function aiTtsVoice(character: "robot" | "cat", lang: string): string {
  const C = character.toUpperCase(), L = lang.toUpperCase().replace(/[^A-Z]/g, "");
  const ok = (v: string | undefined) => { const t = (v ?? "").trim(); return /^[A-Za-z]{2,40}$/.test(t) ? t : null; };
  return ok(process.env[`AI_TTS_VOICE_${C}_${L}`]) ?? ok(process.env[`AI_TTS_VOICE_${C}`]) ?? DEFAULT_VOICE[character];
}

/** How long one request may take before it is given up (the person carries on by hand). */
export const aiTimeoutMs = () => num(process.env.AI_TIMEOUT_MS, 20_000, 2_000, 120_000);

/** DREAM TEAM's limit on requests a day for any one school. A school may choose a lower one. */
export const aiPlatformDailyLimit = () => num(process.env.AI_DAILY_LIMIT, 100, 1, 100_000);

/** DREAM TEAM's limit on replies spoken aloud a day for any one school (kept apart from the requests above). */
export const aiSpeechDailyLimit = () => num(process.env.AI_TTS_DAILY_LIMIT, 300, 1, 100_000);

/** Rupees to a US dollar, for the estimated cost shown to the school. */
export const aiRupeesPerDollar = () => num(process.env.AI_INR_PER_USD, 88, 1, 1000);
