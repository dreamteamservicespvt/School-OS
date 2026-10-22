// Smart Import's use of the AI service: suggestions for the columns the rules
// could not match, from the headings and value descriptions only. Shown as a
// "Suggestion" the person ticks; nothing is used until they do.
import "server-only";

import type { SchoolContext } from "../db";
import { aiTask } from "./index";
import { COLUMN_MATCH_SYSTEM, columnAnswer, columnQuestion, readColumnAnswer, type AiColumnSuggestion } from "./import-columns";

export type AiColumnsResult = { ok: true; suggestions: AiColumnSuggestion[]; message: string } | { ok: false; suggestions: []; message: string };

export async function suggestColumnsByAi(ctx: SchoolContext, input: {
  importing: string;
  fields: { key: string; label: string }[];
  headers: string[];
  rows: string[][];
  matched: ReadonlySet<string>;
  used: ReadonlySet<number>;
}): Promise<AiColumnsResult> {
  // The rules found nothing at all: the heading row may be a row of records, so nothing is sent.
  if (input.matched.size === 0) return { ok: false, suggestions: [], message: "Match one column by hand first, so School OS knows which row holds the headings." };
  const q = columnQuestion(input);
  if (!q) return { ok: true, suggestions: [], message: "Every column that holds something is matched already." };
  const r = await aiTask(ctx, { feature: "ai-smart-import", purpose: "Match import columns", system: COLUMN_MATCH_SYSTEM, input: q, schema: columnAnswer, effort: "low", maxTokens: 3000 });
  if (!r.ok) return { ok: false, suggestions: [], message: r.words };
  const suggestions = readColumnAnswer(q, r.data, input.headers);
  return { ok: true, suggestions, message: suggestions.length ? "" : "The AI assistant found no sure match for the columns left. Match them by hand, or leave them out." };
}
