// The one place School OS talks to an outside AI service. Everything else
// goes through aiTask() (words) or aiSpeech() (the assistant's voice) in
// ./index.ts, which check the switches, hide restricted data, keep the daily
// limit and log the call first. Claude or Google Gemini answers (config.ts);
// the voice is always Gemini's.
//
// Tests never reach the network: they put a fake provider in with
// useAiProvider() (and a fake voice with useAiSpeaker()); with no fake and no
// platform key, AI is not connected.
import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type * as z from "zod/v4";
import { aiFallbackModel, aiService, aiSpeechKey, aiTtsFallbackModel } from "./config";
import { NO_USAGE, type AiUsage } from "./cost";
import { geminiJsonSchema } from "./json-schema";
import { isWav, pcmOfWav, pcmSeconds, type Pcm } from "./wav";

/** A picture, or a PDF scan, sent for a task that declares it needs pictures. Base64. */
export type AiImage = { mediaType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"; data: string };

export type AiRequest = {
  model: string;
  /** The stable instructions, cached between requests. */
  system: string;
  /** The task's data, already minimised. */
  text: string;
  images: AiImage[];
  schema: z.ZodType;
  effort: "low" | "medium" | "high";
  maxTokens: number;
  timeoutMs: number;
  /** Which task asked ("feature · purpose"), for the server log only. */
  label?: string;
};

/** What came back. Never the request's content: only the parsed answer, the token counts and a short error code. */
export type AiAnswer =
  | { outcome: "ok"; data: unknown; usage: AiUsage; model: string }
  | { outcome: "refused"; usage: AiUsage; model: string }
  | { outcome: "failed"; error: AiFailure; usage: AiUsage; model: string };

export type AiFailure = "timeout" | "rate-limited" | "unreachable" | "key-refused" | "service-error" | "cut-short" | "unreadable";

export type AiProvider = { name: string; ask(req: AiRequest): Promise<AiAnswer> };

const usageOf = (u: { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } | null | undefined): AiUsage => ({
  inputTokens: u?.input_tokens ?? 0,
  outputTokens: u?.output_tokens ?? 0,
  cacheReadTokens: u?.cache_read_input_tokens ?? 0,
  cacheWriteTokens: u?.cache_creation_input_tokens ?? 0,
});

/** Claude, through the official SDK, with structured JSON output. */
export function anthropicProvider(apiKey: string): AiProvider {
  return {
    name: "anthropic",
    async ask(req) {
      const client = new Anthropic({ apiKey, timeout: req.timeoutMs, maxRetries: 2 });
      const content: Anthropic.Beta.BetaContentBlockParam[] = [
        ...req.images.map((img): Anthropic.Beta.BetaContentBlockParam => img.mediaType === "application/pdf"
          ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: img.data } }
          : { type: "image", source: { type: "base64", media_type: img.mediaType, data: img.data } }),
        { type: "text" as const, text: req.text },
      ];
      try {
        const response = await client.beta.messages.parse({
          model: req.model,
          max_tokens: req.maxTokens,
          system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content }],
          output_config: { format: betaZodOutputFormat(req.schema), effort: req.effort },
          // A request the model declines is tried once more on the service's own fallback model.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        });
        const usage = usageOf(response.usage);
        const model = response.model ?? req.model;
        if (response.stop_reason === "refusal") return { outcome: "refused", usage, model };
        if (response.stop_reason === "max_tokens") return { outcome: "failed", error: "cut-short", usage, model };
        if (response.parsed_output === null || response.parsed_output === undefined) return { outcome: "failed", error: "unreadable", usage, model };
        return { outcome: "ok", data: response.parsed_output, usage, model };
      } catch (e) {
        // Most specific first. Only a short code is kept: never the request or the answer.
        const error: AiFailure =
          e instanceof Anthropic.APIConnectionTimeoutError ? "timeout"
          : e instanceof Anthropic.APIConnectionError ? "unreachable"
          : e instanceof Anthropic.RateLimitError ? "rate-limited"
          : e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError ? "key-refused"
          : e instanceof Anthropic.APIError ? "service-error"
          : "unreadable";
        return { outcome: "failed", error, usage: NO_USAGE, model: req.model };
      }
    },
  };
}

/* ---------- Google Gemini ---------- */

const GEMINI = "https://generativelanguage.googleapis.com/v1beta";
/** The Interactions API revision the voice request follows (aistudio.google.com/docs/speech-generation). */
const INTERACTIONS_REVISION = "2026-05-20";
/** Answers Gemini gives for a request it will not answer (prompt or answer blocked). */
const BLOCKED = /^(SAFETY|RECITATION|BLOCKLIST|PROHIBITED_CONTENT|SPII|IMAGE_SAFETY|IMAGE_PROHIBITED_CONTENT|LANGUAGE)$/;

type GeminiFail = { failed: AiFailure; status: number; message: string };
type GeminiOk = { json: Record<string, unknown> };

/** The request's time limit ran out (or it was stopped). */
const aborted = (e: unknown, signal: AbortSignal) => signal.aborted || /^(TimeoutError|AbortError)$/.test(String((e as { name?: unknown } | null)?.name ?? ""));

/** One HTTP call to Gemini: the JSON answer, or a short failure code (never the content). */
async function geminiCall(url: string, apiKey: string, body: unknown, signal: AbortSignal, headers: Record<string, string> = {}): Promise<GeminiOk | GeminiFail> {
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": apiKey, ...headers }, body: JSON.stringify(body), signal, cache: "no-store" });
  } catch (e) {
    return { failed: aborted(e, signal) ? "timeout" : "unreachable", status: 0, message: "" };
  }
  let json: Record<string, unknown> = {};
  try { json = (await res.json()) as Record<string, unknown>; } catch (e) {
    if (aborted(e, signal)) return { failed: "timeout", status: res.status, message: "" };
    if (res.ok) return { failed: "unreadable", status: res.status, message: "" };
  }
  if (res.ok) return { json };
  const err = (json.error ?? {}) as { message?: unknown; status?: unknown };
  const message = `${String(err.status ?? "")} ${String(err.message ?? "")}`.slice(0, 300);
  const failed: AiFailure =
    res.status === 401 || res.status === 403 || (res.status === 400 && /API[_ ]KEY|api key/i.test(message)) ? "key-refused"
    : res.status === 429 ? "rate-limited"
    : res.status === 408 || res.status === 504 ? "timeout"
    : "service-error";
  return { failed, status: res.status, message };
}

const isFail = (r: GeminiOk | GeminiFail): r is GeminiFail => "failed" in r;
/** Safe diagnostics for the server log (live AI failures were invisible, 17 Nov): the model, the HTTP status, the
 *  short code and Google's own error text. Never the request, the answer, the key or anyone's details. */
const warnFail = (what: string, model: string, r: GeminiFail, label?: string) =>
  console.warn(`[ai] ${what}`, { task: label, model, httpStatus: r.status, code: r.failed, google: r.message });
const warnStage = (stage: string, model: string, label?: string, more: Record<string, unknown> = {}) =>
  console.warn("[ai] gemini answer not used", { task: label, model, stage, ...more });
/** Zod issue paths and codes only ("reply: invalid_type"), never the values. */
export const zodIssuePaths = (e: z.ZodError) => e.issues.slice(0, 10).map((i) => `${i.path.map(String).join(".") || "(root)"}: ${i.code}`);
/** The first model cannot answer (not offered, out of free requests, busy, a request it will not take): worth one try
 *  on the fallback model. Never for a key problem: the same key would be refused again. */
const tryFallback = (f: GeminiFail) => f.failed !== "key-refused" && !/API[_ ]KEY/i.test(f.message) && (f.status === 400 || f.status === 404 || f.status === 429 || f.status >= 500);
/** Thinking off, else the low level, else the model's own default: newer models refuse a 0 budget and not every model
 *  knows every level (live 17 Nov: every Gemini text answer failed). */
const THINKING: (Record<string, unknown> | null)[] = [{ thinkingBudget: 0 }, { thinkingLevel: "low" }, null];
const thinkingRefused = (f: GeminiFail) => f.status === 400 && /thinking|budget|level/i.test(f.message);

const geminiUsage = (u: unknown): AiUsage => {
  const m = (u ?? {}) as Record<string, number | undefined>;
  const cached = m.cachedContentTokenCount ?? 0;
  return {
    inputTokens: Math.max(0, (m.promptTokenCount ?? 0) - cached),
    outputTokens: (m.candidatesTokenCount ?? 0) + (m.thoughtsTokenCount ?? 0),
    cacheReadTokens: cached,
    cacheWriteTokens: 0,
  };
};

/** The JSON in a text answer (a stray code fence around it is allowed). */
function parseJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(t); } catch { return undefined; }
}

/**
 * Gemini (generateContent), with structured JSON output: the answer shape is
 * the task's zod schema as JSON Schema, and the answer is parsed with the same
 * schema. Thinking is off (thinkingBudget 0) where the model allows it, so a short
 * answer is never cut by thinking tokens. When the first model cannot answer, the
 * fallback model (AI_FALLBACK_MODEL) is tried once, inside the same time limit.
 */
export function geminiProvider(apiKey: string, fallbackModel: string | null = null): AiProvider {
  return {
    name: "gemini",
    async ask(req) {
      const signal = AbortSignal.timeout(req.timeoutMs);
      const parts = [
        ...req.images.map((img) => ({ inlineData: { mimeType: img.mediaType, data: img.data } })),
        { text: req.text },
      ];
      let schema: Record<string, unknown>;
      try { schema = geminiJsonSchema(req.schema); } catch (e) {
        console.warn("[ai] gemini schema conversion failed", { task: req.label, model: req.model, error: e instanceof Error ? e.message.slice(0, 200) : "unknown" });
        return { outcome: "failed", error: "unreadable", usage: NO_USAGE, model: req.model };
      }
      const bodyFor = (thinking: Record<string, unknown> | null) => ({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: "user", parts }],
        generationConfig: { maxOutputTokens: req.maxTokens, responseMimeType: "application/json", responseJsonSchema: schema, ...(thinking ? { thinkingConfig: thinking } : {}) },
      });
      const once = async (model: string) => {
        const url = `${GEMINI}/models/${encodeURIComponent(model)}:generateContent`;
        let r = await geminiCall(url, apiKey, bodyFor(THINKING[0]), signal);
        // A model that refuses a thinking setting is asked with the next one down the ladder.
        for (let i = 1; i < THINKING.length && isFail(r) && thinkingRefused(r); i++) {
          warnFail(`gemini refused thinking setting ${i}`, model, r, req.label);
          r = await geminiCall(url, apiKey, bodyFor(THINKING[i]), signal);
        }
        return r;
      };
      let model = req.model;
      let r = await once(model);
      if (isFail(r)) warnFail("gemini failed", model, r, req.label);
      if (isFail(r) && fallbackModel && fallbackModel !== model && tryFallback(r)) {
        model = fallbackModel; r = await once(model);
        if (isFail(r)) warnFail("gemini fallback failed", model, r, req.label);
      }
      if (isFail(r)) return { outcome: "failed", error: r.failed, usage: NO_USAGE, model };

      const json = r.json;
      const usage = geminiUsage(json.usageMetadata);
      const answered = typeof json.modelVersion === "string" && json.modelVersion ? json.modelVersion : model;
      const blocked = (json.promptFeedback as { blockReason?: string } | undefined)?.blockReason;
      if (blocked) { warnStage("blocked", answered, req.label, { blockReason: String(blocked).slice(0, 60) }); return { outcome: "refused", usage, model: answered }; }
      const cand = (json.candidates as { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[] | undefined)?.[0];
      if (!cand) { warnStage("no-candidate", answered, req.label); return { outcome: "failed", error: "unreadable", usage, model: answered }; }
      const finish = cand.finishReason ?? "STOP";
      if (BLOCKED.test(finish)) { warnStage("finish-blocked", answered, req.label, { finishReason: finish.slice(0, 60) }); return { outcome: "refused", usage, model: answered }; }
      if (finish === "MAX_TOKENS") { warnStage("cut-short", answered, req.label, { outputTokens: usage.outputTokens }); return { outcome: "failed", error: "cut-short", usage, model: answered }; }
      const text = (cand.content?.parts ?? []).filter((p) => !p.thought && typeof p.text === "string").map((p) => p.text).join("");
      const data = parseJson(text);
      if (data === undefined) { warnStage("not-json", answered, req.label, { finishReason: finish.slice(0, 60), textLength: text.length }); return { outcome: "failed", error: "unreadable", usage, model: answered }; }
      const parsed = req.schema.safeParse(data);
      if (!parsed.success) warnStage("shape", answered, req.label, { zodIssuePaths: zodIssuePaths(parsed.error) });
      return parsed.success ? { outcome: "ok", data: parsed.data, usage, model: answered } : { outcome: "failed", error: "unreadable", usage, model: answered };
    },
  };
}

/* ---------- The voice (text to speech) ---------- */

export type SpeechRequest = {
  model: string;
  /** Exactly the words to say (Gemini's voice models read the text as it is). */
  text: string;
  /** How to say it, in plain words: "warm and pleased, like a caring school office assistant". */
  style: string;
  /** A prebuilt voice name, e.g. "Achird". */
  voice: string;
  timeoutMs: number;
};

export type SpeechAnswer =
  | { outcome: "ok"; audio: Pcm; usage: AiUsage; model: string }
  | { outcome: "refused"; usage: AiUsage; model: string }
  | { outcome: "failed"; error: AiFailure; usage: AiUsage; model: string };

export type AiSpeaker = { name: string; speak(req: SpeechRequest): Promise<SpeechAnswer> };

type AudioBlock = { data: string; mime: string };

/** The last audio block in an Interactions answer (or a generateContent-shaped one), base64. */
function audioOf(json: Record<string, unknown>): AudioBlock | null {
  const found: AudioBlock[] = [];
  const look = (items: unknown) => {
    for (const c of Array.isArray(items) ? items : []) {
      const x = c as { type?: string; data?: string; mime_type?: string; inlineData?: { data?: string; mimeType?: string } };
      if (x.type === "audio" && typeof x.data === "string") found.push({ data: x.data, mime: x.mime_type ?? "" });
      else if (x.inlineData?.data) found.push({ data: x.inlineData.data, mime: x.inlineData.mimeType ?? "" });
    }
  };
  for (const st of Array.isArray(json.steps) ? json.steps : []) {
    const s = st as { type?: string; content?: unknown };
    if (!s.type || s.type === "model_output") look(s.content);
  }
  look(json.outputs);
  for (const c of Array.isArray(json.candidates) ? json.candidates : []) look((c as { content?: { parts?: unknown } }).content?.parts);
  return found.at(-1) ?? null;
}

/** Audio bytes to PCM: a WAV file is opened; raw PCM takes its rate from the type ("audio/l16; rate=24000"). */
function toPcm(bytes: Uint8Array, mime: string): Pcm | null {
  if (isWav(bytes)) return pcmOfWav(bytes);
  if (!bytes.byteLength) return null;
  const rate = Number(/rate=(\d+)/i.exec(mime)?.[1] ?? 24_000);
  return { pcm: bytes, sampleRate: rate >= 8_000 && rate <= 48_000 ? rate : 24_000, channels: 1 };
}

/**
 * Gemini's voice models through the Interactions API: the reply's words, a
 * style in plain words (speech_metadata.style), one prebuilt voice, and raw
 * 16-bit PCM at 24 kHz back (audio/l16). Nothing is stored at Google
 * (store: false). The fallback voice model is tried once when the first
 * cannot answer for this key.
 */
export function geminiSpeaker(apiKey: string, fallbackModel: string | null = null): AiSpeaker {
  return {
    name: "gemini",
    async speak(req) {
      const signal = AbortSignal.timeout(req.timeoutMs);
      const body = (model: string) => ({
        model,
        input: [{ type: "user_input", content: [{ type: "text", text: req.text, annotations: req.style ? [{ type: "speech_metadata", style: req.style }] : [] }] }],
        response_format: { type: "audio", mime_type: "audio/l16", sample_rate: 24_000 },
        generation_config: { speech_config: [{ voice: req.voice }] },
        store: false,
      });
      const call = (model: string) => geminiCall(`${GEMINI}/interactions`, apiKey, body(model), signal, { "Api-Revision": INTERACTIONS_REVISION });
      let model = req.model;
      let r = await call(model);
      if (isFail(r) && fallbackModel && fallbackModel !== model && tryFallback(r)) { model = fallbackModel; r = await call(model); }
      if (isFail(r)) return { outcome: "failed", error: r.failed, usage: NO_USAGE, model };
      const json = r.json;
      const u = (json.usage ?? {}) as { total_input_tokens?: number; total_output_tokens?: number };
      const found = audioOf(json);
      let audio: Pcm | null = null;
      if (found) { try { audio = toPcm(new Uint8Array(Buffer.from(found.data, "base64")), found.mime); } catch { audio = null; } }
      // When the answer gives no token counts, they are estimated: about 4 letters a token in, 25 audio tokens a second out.
      const usage: AiUsage = {
        inputTokens: u.total_input_tokens ?? Math.ceil(req.text.length / 4),
        outputTokens: u.total_output_tokens ?? (audio ? Math.ceil(pcmSeconds(audio) * 25) : 0),
        cacheReadTokens: 0, cacheWriteTokens: 0,
      };
      if (!audio || !audio.pcm.byteLength) {
        const said = JSON.stringify(json.status ?? "") + JSON.stringify(json.error ?? "");
        return /block|safety|prohibit/i.test(said) ? { outcome: "refused", usage, model } : { outcome: "failed", error: "unreadable", usage, model };
      }
      return { outcome: "ok", audio, usage, model };
    },
  };
}

/* ---------- Which service answers ---------- */

// The fakes used by tests, kept on globalThis so every copy of this module sees them.
const slot = globalThis as unknown as { __schoolOsAiProvider?: AiProvider | null; __schoolOsAiSpeaker?: AiSpeaker | null };

/** Only the test runner may put a fake in: a running school never answers from one, and never counts one as connected. */
const testing = () => process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);
const fakeIn = () => (testing() ? slot.__schoolOsAiProvider ?? null : null);
const fakeSpeakerIn = () => (testing() ? slot.__schoolOsAiSpeaker ?? null : null);

/** For tests only: answer every AI request with this provider (null puts the real one back). Refused outside the test runner. */
export function useAiProvider(p: AiProvider | null) {
  if (p && !testing()) throw new Error("A stand-in AI service can only be used by the tests.");
  slot.__schoolOsAiProvider = p;
}

/** For tests only: speak every reply with this stand-in voice (null puts the real one back). Refused outside the test runner. */
export function useAiSpeaker(p: AiSpeaker | null) {
  if (p && !testing()) throw new Error("A stand-in AI voice can only be used by the tests.");
  slot.__schoolOsAiSpeaker = p;
}

/** The provider to use, or null when the AI service is not connected. */
export function currentProvider(): AiProvider | null {
  const fake = fakeIn();
  if (fake) return fake;
  const service = aiService();
  if (!service) return null;
  return service.name === "gemini" ? geminiProvider(service.key, aiFallbackModel()) : anthropicProvider(service.key);
}

/** The voice to use, or null when there is none (no Gemini key). */
export function currentSpeaker(): AiSpeaker | null {
  const fake = fakeSpeakerIn();
  if (fake) return fake;
  const key = aiSpeechKey();
  return key ? geminiSpeaker(key, aiTtsFallbackModel()) : null;
}

/** Is the AI service connected (a platform key is set, or a test provider is in)? */
export const aiConnected = () => Boolean(fakeIn()) || aiService() !== null;

/** Can replies be spoken by the AI voice (a Gemini key is set, or a test voice is in)? */
export const aiSpeechConnected = () => Boolean(fakeSpeakerIn()) || aiSpeechKey() !== null;
