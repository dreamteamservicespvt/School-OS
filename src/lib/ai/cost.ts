// The estimated cost of one AI request, in whole paise, from the tokens the
// service reported. An estimate for the school's usage line, not a bill.

export type AiUsage = { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number };

export const NO_USAGE: AiUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

/** US dollars per million tokens: input, output, cache read, cache write. */
const PRICES: Record<string, [number, number, number, number]> = {
  "claude-opus-5-5": [4, 20, 0.2, 5],
  "claude-sonnet-5-5": [2, 10, 0.2, 2.5],
  "claude-haiku-5-5": [0.1, 0.5, 0.01, 0.125],
};

export function estimatePaise(model: string, usage: AiUsage, rupeesPerDollar: number): bigint {
  const [i, o, r, w] = PRICES[model] ?? PRICES["claude-opus-5-5"];
  const dollars = (usage.inputTokens * i + usage.outputTokens * o + usage.cacheReadTokens * r + usage.cacheWriteTokens * w) / 1_000_000;
  return BigInt(Math.ceil(dollars * rupeesPerDollar * 100));
}
