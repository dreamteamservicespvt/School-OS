// The estimated cost of one AI request, in whole paise, from the tokens the
// service reported. An estimate for the school's usage line, not a bill.
//
// Gemini prices: Google's "Gemini Developer API pricing" page, Standard tier,
// https://aistudio.google.com/docs/pricing (read 17 Nov 2026). The free tier
// (a Google AI Studio key without billing) costs nothing; the estimate still
// uses the paid list price, so on the free key it is an upper estimate. Some
// prices double from 1 Jan 2027: both are written here with the date.
// Voice models are billed per token of audio (about 25 tokens a second).

export type AiUsage = { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };

export const NO_USAGE: AiUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

type Price = [input: number, output: number, cacheRead: number, cacheWrite: number];

/** US dollars per million tokens: input, output, cache read, cache write. */
const PRICES: Record<string, Price> = {
  "claude-opus-5-5": [4, 20, 0.2, 5],
  "claude-sonnet-5-5": [2, 10, 0.2, 2.5],
  "claude-haiku-5-5": [0.1, 0.5, 0.01, 0.125],
  // Gemini text (output includes thinking tokens).
  "gemini-3.8-flash": [0.75, 3.75, 0.075, 0],
  "gemini-3.6-flash": [0.75, 3.75, 0.075, 0],
  "gemini-3-flash-preview": [0.5, 3, 0.05, 0],
  "gemini-3.5-flash-lite": [0.3, 2.5, 0.03, 0],
  "gemini-3.1-flash-lite": [0.25, 1.5, 0.025, 0],
  // Gemini voice: text in, audio out.
  "gemini-3.8-flash-tts": [0.5, 9, 0, 0],
  "gemini-3.8-flash-lite-tts": [0.5, 6, 0, 0],
  "gemini-3.1-flash-tts-preview": [1, 20, 0, 0],
};

/** The list prices from 1 Jan 2027 (the same page). */
const FROM_2027 = Date.UTC(2027, 0, 1);
const PRICES_2027: Record<string, Price> = {
  "gemini-3.8-flash": [1.5, 7.5, 0.15, 0],
  "gemini-3.6-flash": [1.5, 7.5, 0.15, 0],
  "gemini-3.8-flash-tts": [1, 18, 0, 0],
  "gemini-3.8-flash-lite-tts": [1, 12, 0, 0],
};

/** The price of a model; an unknown one is priced like its family's dearest everyday model, so the estimate is never too low. */
export function priceOf(model: string, now: Date = new Date()): Price {
  const later = now.getTime() >= FROM_2027 ? PRICES_2027[model] : undefined;
  if (later) return later;
  if (PRICES[model]) return PRICES[model];
  if (/^gemini-/i.test(model)) return priceOf(/-tts/i.test(model) ? "gemini-3.8-flash-tts" : "gemini-3.8-flash", now);
  return PRICES["claude-opus-5-5"];
}

export function estimatePaise(model: string, usage: AiUsage, rupeesPerDollar: number, now: Date = new Date()): bigint {
  const [i, o, r, w] = priceOf(model, now);
  const dollars = (usage.inputTokens * i + usage.outputTokens * o + usage.cacheReadTokens * r + usage.cacheWriteTokens * w) / 1_000_000;
  return BigInt(Math.ceil(dollars * rupeesPerDollar * 100));
}
