// The AI service layer (gap list G28): the one gateway every AI feature uses.
//
// aiTask() runs a task only when all of these hold, and otherwise says why in
// plain words so the caller carries on with its rule-based behaviour:
// 1. DREAM TEAM connected the AI service (a platform key in the secret store);
// 2. the school's AI assistant is on (Settings, Modules On/Off);
// 3. the feature is built and its own switch is on;
// 4. one of the person's roles is in the AI roles the school chose;
// 5. the request holds no restricted field (00-global.md §2.1 rule 7); phone
//    numbers, emails and long numbers are hidden unless the feature needs them;
// 6. the school has not used its requests for the day.
// Every request that gets that far is logged as an AI Call: what for, who,
// the token counts, the estimated cost, how long and how it ended. Never its
// content. The outside call is made between two short transactions, so no
// school transaction waits on it, and it gives up after a time limit.
//
// The answer is only ever a suggestion: the caller shows it labelled
// "Suggestion" and a person decides. When a person accepts it, the caller
// writes the Audit Log entry "prepared by AI, confirmed by <person>" (rule 6).
import "server-only";

import type * as z from "zod/v4";
import { withSchool, type SchoolContext, type Tx } from "../db";
import { dayStartUtc } from "../periods";
import { readPreferences } from "../settings/profile-rules";
import { AI_OFF_WORDS, aiAllowed, aiOffReason, aiRolesOf, type AiFeatureKey, type AiOff, type AiWho } from "../settings/switch-rules";
import { aiModel, aiPlatformDailyLimit, aiRupeesPerDollar, aiSpeechDailyLimit, aiTimeoutMs, aiTtsModel, fitModel } from "./config";
import { NO_USAGE, estimatePaise } from "./cost";
import { maskText, minimise, type DeclarableField } from "./minimise";
import { aiConnected, currentProvider, currentSpeaker, zodIssuePaths, type AiAnswer, type AiFailure, type AiImage, type SpeechAnswer } from "./provider";
import type { Pcm } from "./wav";

export { aiConnected, aiSpeechConnected, useAiProvider, useAiSpeaker, type AiProvider, type AiRequest, type AiAnswer, type AiImage, type AiSpeaker, type SpeechRequest, type SpeechAnswer } from "./provider";

export type AiReason = AiOff | "not-connected" | "daily-limit" | "restricted-data" | "refused" | AiFailure;

export type AiTask<T> = {
  feature: AiFeatureKey;
  /** What it is for, in fixed words from the code (it is logged, so never personal details). */
  purpose: string;
  /** The stable instructions; cached by the service between requests. */
  system: string;
  /** Only what the task needs. Hidden and checked again here before it leaves. */
  input: unknown;
  /** The shape of the answer. An answer that does not fit is a failure. */
  schema: z.ZodType<T>;
  images?: AiImage[];
  /** Personal details the feature truly needs (phone, email), and whether it sends pictures. Restricted fields can never be declared. */
  needs?: readonly (DeclarableField | "images")[];
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
  /** A longer time limit for a task that reads a picture (never more than 2 minutes); the platform setting when longer. */
  minTimeoutMs?: number;
  /** A model for this feature (from its own platform setting), else the platform's AI_MODEL. */
  model?: string;
};

export type AiResult<T> = { ok: true; data: T; callId: string } | { ok: false; reason: AiReason; words: string; callId: string | null };

const FAILED = "The AI service is not working right now. Carry on by hand; nothing was changed.";
export const AI_REASON_WORDS: Record<AiReason, string> = {
  ...AI_OFF_WORDS,
  "not-connected": "The AI service is not connected yet: DREAM TEAM connects it.",
  "daily-limit": "Your school has used today's AI requests. Carry on by hand, or try again tomorrow.",
  "restricted-data": "This needs private details that are never sent to the AI service.",
  refused: "The AI service did not answer this one. Carry on by hand; nothing was changed.",
  timeout: "The AI service took too long. Carry on by hand, or try again.",
  "rate-limited": "The AI service is busy. Try again in a minute, or carry on by hand.",
  unreachable: FAILED,
  "key-refused": FAILED,
  "service-error": FAILED,
  "cut-short": FAILED,
  unreadable: FAILED,
};

const no = <T>(reason: AiReason, callId: string | null = null): AiResult<T> => ({ ok: false, reason, words: AI_REASON_WORDS[reason], callId });

/** The school's daily limit: its own choice, never above DREAM TEAM's. */
export function dailyLimitOf(prefs: { aiDailyLimit?: number | null }) {
  const cap = aiPlatformDailyLimit();
  const own = prefs.aiDailyLimit;
  return typeof own === "number" && Number.isInteger(own) && own >= 1 ? Math.min(own, cap) : cap;
}

const todayIso = (timeZone: string, now: Date) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

/** The person as the AI checks see them, read from the database (never taken from the caller). */
async function whoFor(tx: Tx, ctx: SchoolContext, feature: string) {
  const [school, features, accesses] = await Promise.all([
    tx.school.findUnique({ where: { id: ctx.schoolId }, select: { preferences: true, timeZone: true } }),
    tx.schoolFeature.findMany({ where: { isOn: true, featureKey: { in: ["ai-assistant", feature] } }, select: { featureKey: true } }),
    ctx.userId ? tx.schoolAccess.findMany({ where: { schoolId: ctx.schoolId, userLoginId: ctx.userId, archivedAt: null }, include: { roles: { include: { role: true } } } }) : Promise.resolve([]),
  ]);
  const prefs = readPreferences(school?.preferences);
  const who: AiWho = {
    features: new Set(features.map((f) => f.featureKey)),
    roles: accesses.flatMap((a) => a.roles.map((r) => r.role)).filter((r) => r.isEnabled && !r.archivedAt).map((r) => ({ key: r.key })),
    aiRoles: aiRolesOf(prefs),
  };
  return { who, prefs, timeZone: school?.timeZone ?? "Asia/Kolkata" };
}

/** How long the voice may take: the panel stops waiting a little after this and the browser's voice reads the reply. */
const SPEECH_TIMEOUT_MS = 9_000;

/** The fixed purpose of a spoken reply: it counts against the speech limit, never the school's daily AI requests. */
export const SPEECH_PURPOSE = "Assistant: say the reply aloud";

/** Requests sent today (in the school's time zone), against the daily limit. Spoken replies have their own limit. */
async function sentToday(tx: Tx, timeZone: string, now: Date) {
  return tx.aiCall.count({ where: { sent: true, purpose: { not: SPEECH_PURPOSE }, createdAt: { gte: dayStartUtc(todayIso(timeZone, now), timeZone) } } });
}

/** Replies spoken aloud today, against the speech limit. */
async function spokenToday(tx: Tx, timeZone: string, now: Date) {
  return tx.aiCall.count({ where: { sent: true, purpose: SPEECH_PURPOSE, createdAt: { gte: dayStartUtc(todayIso(timeZone, now), timeZone) } } });
}

/** Runs one AI task for the person in ctx, or says why not. Never throws: a failure is a reason, and the screen carries on. */
export async function aiTask<T>(ctx: SchoolContext, task: AiTask<T>, now = new Date()): Promise<AiResult<T>> {
  const started = Date.now();
  // A model from the other service (an old setting) is never sent: the answering service's own default instead.
  const model = fitModel(task.model?.trim() || aiModel());
  const base = { schoolId: ctx.schoolId, feature: task.feature, purpose: task.purpose.slice(0, 120), userLoginId: ctx.userId, model };
  let callId: string | null = null;
  try {
    const gate = await withSchool(ctx, async (tx) => {
      const { who, prefs, timeZone } = await whoFor(tx, ctx, task.feature);
      const off = aiOffReason(who, task.feature);
      if (off) return { stop: off, id: null };
      const log = async (data: { outcome: string; reason?: string; sent?: boolean; masked?: number }) => (await tx.aiCall.create({ data: { ...base, ...data } })).id;
      const provider = currentProvider();
      if (!provider) return { stop: "not-connected" as const, id: await log({ outcome: "fallback", reason: "not-connected" }) };
      if (task.images?.length && !task.needs?.includes("images")) return { stop: "restricted-data" as const, id: await log({ outcome: "refused", reason: "restricted-data" }) };
      const m = minimise(task.input, new Set(task.needs?.filter((n): n is DeclarableField => n !== "images")));
      if (m.refused.length) return { stop: "restricted-data" as const, id: await log({ outcome: "refused", reason: "restricted-data", masked: m.masked }) };
      // One request at a time per school past this point, so two at once cannot both take the last one of the day.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ai-daily:${ctx.schoolId}`}))`;
      if ((await sentToday(tx, timeZone, now)) >= dailyLimitOf(prefs)) return { stop: "daily-limit" as const, id: await log({ outcome: "fallback", reason: "daily-limit" }) };
      const id = await log({ outcome: "pending", sent: true, masked: m.masked });
      return { stop: null, id, provider, text: JSON.stringify(m.value) };
    });
    callId = gate.id;
    if (gate.stop || !("provider" in gate) || !gate.provider) return no<T>(gate.stop ?? "service-error", gate.id);

    const answer: AiAnswer = await gate.provider.ask({
      model, system: task.system, text: gate.text, images: task.images ?? [], schema: task.schema,
      effort: task.effort ?? "low", maxTokens: task.maxTokens ?? 4000, timeoutMs: Math.min(Math.max(aiTimeoutMs(), task.minTimeoutMs ?? 0), 120_000),
      label: `${task.feature} · ${task.purpose.slice(0, 80)}`,
    }).catch((e): AiAnswer => {
      console.warn("[ai] provider threw", { feature: task.feature, purpose: task.purpose.slice(0, 80), model, error: e instanceof Error ? `${e.name}: ${e.message.slice(0, 200)}` : "unknown" });
      return { outcome: "failed", error: "unreadable", usage: NO_USAGE, model };
    });

    // The answer must fit the shape asked for; anything else is a failure, never shown.
    let result: AiResult<T>;
    let issues: string[] | undefined;
    if (answer.outcome === "ok") {
      const parsed = task.schema.safeParse(answer.data);
      if (!parsed.success) issues = zodIssuePaths(parsed.error);
      result = parsed.success ? { ok: true, data: parsed.data, callId: gate.id } : no<T>("unreadable", gate.id);
    } else result = no<T>(answer.outcome === "refused" ? "refused" : answer.error, gate.id);
    // Safe diagnostics (17 Nov): which task, model and outcome, and only the PATHS of a wrong shape. No content.
    if (!result.ok) console.warn("[ai] task failed", { feature: task.feature, purpose: task.purpose.slice(0, 80), model: answer.model, outcome: answer.outcome, error: result.reason, zodIssuePaths: issues });

    const usage = answer.usage;
    await withSchool(ctx, (tx) => tx.aiCall.update({
      where: { id: gate.id },
      data: {
        outcome: result.ok ? "ok" : answer.outcome === "refused" ? "refused" : "failed",
        reason: result.ok ? null : result.reason,
        model: answer.model.slice(0, 80),
        inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, cacheReadTokens: usage.cacheReadTokens, cacheWriteTokens: usage.cacheWriteTokens,
        costPaise: estimatePaise(answer.model, usage, aiRupeesPerDollar()),
        durationMs: Math.min(Date.now() - started, 2_000_000_000),
      },
    })).catch((e) => console.error(JSON.stringify({ level: "error", event: "ai-call-log-failed", schoolId: ctx.schoolId, error: e instanceof Error ? e.message : String(e) })));
    return result;
  } catch (e) {
    console.error(JSON.stringify({ level: "error", event: "ai-task-failed", schoolId: ctx.schoolId, feature: task.feature, error: e instanceof Error ? e.message : String(e) }));
    return no<T>("service-error", callId);
  }
}

export type AiSpeechTask = {
  feature: AiFeatureKey;
  /** Exactly the words to say. Checked for private details here before they leave. */
  text: string;
  /** How to say it, in plain words (voice.ts). Fixed words from the code, never the person's. */
  style: string;
  /** A prebuilt voice name. */
  voice: string;
};

export type AiSpeechResult = { ok: true; audio: Pcm; callId: string } | { ok: false; reason: AiReason; callId: string | null };

/**
 * Says one reply aloud with the AI voice (the assistant's speaking), or says
 * why not, so the panel uses the browser's own voice instead. The same checks
 * as aiTask(): the switches and the person's role, no private details
 * (a reply holding a phone, an email or a long number is never sent), and its
 * own daily limit for the school (AI_TTS_DAILY_LIMIT), kept apart from the
 * daily AI requests. Each request is logged as an AI Call ("Assistant: say the
 * reply aloud") with its token counts and estimated cost, never its words.
 * With no voice connected nothing is logged: no request was made.
 */
export async function aiSpeech(ctx: SchoolContext, task: AiSpeechTask, now = new Date()): Promise<AiSpeechResult> {
  const started = Date.now();
  const speaker = currentSpeaker();
  if (!speaker) return { ok: false, reason: "not-connected", callId: null };
  const model = aiTtsModel();
  const base = { schoolId: ctx.schoolId, feature: task.feature, purpose: SPEECH_PURPOSE, userLoginId: ctx.userId, model };
  let callId: string | null = null;
  try {
    const gate = await withSchool(ctx, async (tx) => {
      const { who, timeZone } = await whoFor(tx, ctx, task.feature);
      const off = aiOffReason(who, task.feature);
      if (off) return { stop: off as AiReason, id: null };
      const log = async (data: { outcome: string; reason?: string; sent?: boolean; masked?: number }) => (await tx.aiCall.create({ data: { ...base, ...data } })).id;
      const m = maskText(task.text);
      if (m.masked) return { stop: "restricted-data" as const, id: await log({ outcome: "refused", reason: "restricted-data", masked: m.masked }) };
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ai-speech:${ctx.schoolId}`}))`;
      if ((await spokenToday(tx, timeZone, now)) >= aiSpeechDailyLimit()) return { stop: "daily-limit" as const, id: await log({ outcome: "fallback", reason: "daily-limit" }) };
      return { stop: null, id: await log({ outcome: "pending", sent: true }) };
    });
    callId = gate.id;
    if (gate.stop || !gate.id) return { ok: false, reason: gate.stop ?? "service-error", callId: gate.id };
    const id = gate.id;

    const answer: SpeechAnswer = await speaker.speak({ model, text: task.text, style: task.style, voice: task.voice, timeoutMs: SPEECH_TIMEOUT_MS })
      .catch((): SpeechAnswer => ({ outcome: "failed", error: "unreadable", usage: NO_USAGE, model }));
    const result: AiSpeechResult = answer.outcome === "ok" ? { ok: true, audio: answer.audio, callId: id }
      : { ok: false, reason: answer.outcome === "refused" ? "refused" : answer.error, callId: id };
    const usage = answer.usage;
    await withSchool(ctx, (tx) => tx.aiCall.update({
      where: { id },
      data: {
        outcome: result.ok ? "ok" : answer.outcome === "refused" ? "refused" : "failed",
        reason: result.ok ? null : result.reason,
        model: answer.model.slice(0, 80),
        inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, cacheReadTokens: 0, cacheWriteTokens: 0,
        costPaise: estimatePaise(answer.model, usage, aiRupeesPerDollar(), now),
        durationMs: Math.min(Date.now() - started, 2_000_000_000),
      },
    })).catch((e) => console.error(JSON.stringify({ level: "error", event: "ai-call-log-failed", schoolId: ctx.schoolId, error: e instanceof Error ? e.message : String(e) })));
    return result;
  } catch (e) {
    console.error(JSON.stringify({ level: "error", event: "ai-speech-failed", schoolId: ctx.schoolId, error: e instanceof Error ? e.message : String(e) }));
    return { ok: false, reason: "service-error", callId };
  }
}

/** Should a screen offer this AI feature to this person: allowed for them, and the AI service connected. */
export const aiReady = (who: AiWho, feature: AiFeatureKey) => aiAllowed(who, feature) && aiConnected();

/** The school's use of the AI service, for Settings, Modules On/Off. */
export async function aiUsage(tx: Tx, ctx: SchoolContext, now = new Date()) {
  const school = await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { preferences: true, timeZone: true } });
  const tz = school?.timeZone ?? "Asia/Kolkata";
  const today = todayIso(tz, now);
  const monthStart = dayStartUtc(`${today.slice(0, 7)}-01`, tz);
  const [month, todayCount] = await Promise.all([
    tx.aiCall.aggregate({ where: { sent: true, createdAt: { gte: monthStart } }, _count: { _all: true }, _sum: { costPaise: true } }),
    sentToday(tx, tz, now),
  ]);
  return {
    connected: aiConnected(),
    month: { requests: month._count._all, costPaise: month._sum.costPaise ?? BigInt(0) },
    today: todayCount,
    dailyLimit: dailyLimitOf(readPreferences(school?.preferences)),
    platformLimit: aiPlatformDailyLimit(),
  };
}
