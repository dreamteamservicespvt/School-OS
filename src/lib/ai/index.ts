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
import { aiModel, aiPlatformDailyLimit, aiRupeesPerDollar, aiTimeoutMs } from "./config";
import { NO_USAGE, estimatePaise } from "./cost";
import { minimise, type DeclarableField } from "./minimise";
import { aiConnected, currentProvider, type AiAnswer, type AiFailure, type AiImage } from "./provider";

export { aiConnected, useAiProvider, type AiProvider, type AiRequest, type AiAnswer } from "./provider";

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

/** Requests sent today (in the school's time zone), against the daily limit. */
async function sentToday(tx: Tx, timeZone: string, now: Date) {
  return tx.aiCall.count({ where: { sent: true, createdAt: { gte: dayStartUtc(todayIso(timeZone, now), timeZone) } } });
}

/** Runs one AI task for the person in ctx, or says why not. Never throws: a failure is a reason, and the screen carries on. */
export async function aiTask<T>(ctx: SchoolContext, task: AiTask<T>, now = new Date()): Promise<AiResult<T>> {
  const started = Date.now();
  const model = aiModel();
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
    }).catch((): AiAnswer => ({ outcome: "failed", error: "unreadable", usage: NO_USAGE, model }));

    // The answer must fit the shape asked for; anything else is a failure, never shown.
    let result: AiResult<T>;
    if (answer.outcome === "ok") {
      const parsed = task.schema.safeParse(answer.data);
      result = parsed.success ? { ok: true, data: parsed.data, callId: gate.id } : no<T>("unreadable", gate.id);
    } else result = no<T>(answer.outcome === "refused" ? "refused" : answer.error, gate.id);

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
