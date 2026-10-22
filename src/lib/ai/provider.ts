// The one place School OS talks to an outside AI service. Everything else
// goes through aiTask() in ./index.ts, which checks the switches, hides
// restricted data, keeps the daily limit and logs the call first.
//
// Tests never reach the network: they put a fake provider in with
// useAiProvider(); with no fake and no platform key, AI is not connected.
import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type * as z from "zod/v4";
import { aiKey } from "./config";
import { NO_USAGE, type AiUsage } from "./cost";

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

// The fake used by tests, kept on globalThis so every copy of this module sees it.
const slot = globalThis as unknown as { __schoolOsAiProvider?: AiProvider | null };

/** Only the test runner may put a fake in: a running school never answers from one, and never counts one as connected. */
const testing = () => process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);
const fakeIn = () => (testing() ? slot.__schoolOsAiProvider ?? null : null);

/** For tests only: answer every AI request with this provider (null puts the real one back). Refused outside the test runner. */
export function useAiProvider(p: AiProvider | null) {
  if (p && !testing()) throw new Error("A stand-in AI service can only be used by the tests.");
  slot.__schoolOsAiProvider = p;
}

/** The provider to use, or null when the AI service is not connected. */
export function currentProvider(): AiProvider | null {
  const fake = fakeIn();
  if (fake) return fake;
  const key = aiKey();
  return key ? anthropicProvider(key) : null;
}

/** Is the AI service connected (a platform key is set, or a test provider is in)? */
export const aiConnected = () => Boolean(fakeIn()) || aiKey() !== null;
