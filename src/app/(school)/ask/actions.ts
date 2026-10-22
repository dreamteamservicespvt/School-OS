"use server";

import { requireCurrent } from "@/lib/current";
import { hitLimit } from "@/lib/rate-limit";
import { aiAllowed } from "@/lib/settings/switch-rules";
import { offeredQuestions, readyMadeFor } from "@/lib/ask/answer";
import { aiPickQuestion } from "@/lib/ask/ai";
import { askHref, closestQuestions, matchIntent, questionTitle } from "@/lib/ask/questions";

export type AskInWordsResult = { href: string } | { problem: string; closest: { title: string; href: string }[] };

/**
 * A question in the person's own words (00-global.md §2 Ask, gap list G27).
 * The word table first; only when it finds nothing, and only when the school
 * switched on the AI assistant and "Ask and Do" for this person's role, the
 * AI service picks one of the person's own ready-made questions. It never
 * answers: the answer page works it out from the module's own list. With AI
 * off, or no pick, the closest questions are offered instead.
 */
export async function askInWords(text: string): Promise<AskInWordsResult> {
  const current = await requireCurrent();
  const words = String(text ?? "").trim().slice(0, 200);
  const offered = offeredQuestions(current);
  const closest = () => {
    const ready = readyMadeFor(current, offered).map((q) => q.key);
    return closestQuestions(words, offered, ready).map((k) => ({ title: questionTitle(k), href: askHref(k) }));
  };
  if (words.length < 2) return { problem: "Type a question first.", closest: [] };
  const match = matchIntent(words, offered)[0];
  if (match) return { href: match.href };
  if (!aiAllowed(current, "ai-ask-do")) return { problem: "No ready-made question matches these words. Try one of these.", closest: closest() };
  if (!(await hitLimit(`ask-ai:${current.user.id}`, 20, 60)).ok) return { problem: "Too many questions in a minute. Wait a moment, or pick one of these.", closest: closest() };
  const pick = await aiPickQuestion(current.ctx, words, offered);
  if (pick.ok) return { href: askHref(pick.key, pick.params, "ai") };
  return { problem: pick.words, closest: closest() };
}
