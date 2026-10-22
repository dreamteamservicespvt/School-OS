// Ask in plain words with the AI service (gap list G27, after G28's one
// gateway). Only when the rules found no ready-made question for the words,
// and only for a school that switched on the AI assistant and "Ask and Do"
// for the person's role. The AI never answers: it only picks which of the
// person's own ready-made questions the words mean, with the class, time and
// amount they named. The answer then comes from the rules, from the module's
// own list (./answer.ts). What is sent: the typed words (phone numbers,
// emails and long numbers hidden by the gateway) and the titles of the
// questions this person may ask. No record of the school is ever sent, and
// never a query: there is nothing the AI can run.
import "server-only";

import * as z from "zod/v4";
import type { SchoolContext } from "../db";
import { aiTask } from "../ai";
import { cleanParams, isQuestionKey, QUESTIONS, questionTitle, WHENS, type AskParams, type QuestionKey } from "./questions";

export const ASK_SYSTEM = [
  "You help staff of an Indian school find the right ready-made question in their school software.",
  "You are given what a staff member typed and the list of questions they may ask, each with a key.",
  "Pick the one question that means the same thing, or null when none does. Never make up a question.",
  "Fill cls only with a class the person named (as they wrote it, such as \"5 A\", \"VII\" or \"UKG\"), when only from the allowed words, amount only with a rupee amount they named, in whole rupees.",
  "Leave a field null when the person did not say it. You never answer the question yourself and never see any school record.",
].join(" ");

export const askAnswerSchema = z.object({
  key: z.string().max(40).nullable(),
  cls: z.string().max(20).nullable(),
  when: z.enum(WHENS).nullable(),
  amount: z.number().int().min(1).max(100_000_000).nullable(),
});

export type AiPick = { ok: true; key: QuestionKey; params: AskParams } | { ok: false; words: string };

/** What goes to the AI service: the words and the person's own question list. Nothing else. */
export function askRequest(text: string, offered: readonly QuestionKey[]) {
  return {
    typed: text.slice(0, 200),
    questions: offered.map((key) => ({ key, question: questionTitle(key), takes: QUESTIONS[key].takes, ...(QUESTIONS[key].whens ? { when: QUESTIONS[key].whens } : {}) })),
  };
}

/** Asks the AI service which of the person's questions the words mean. Never throws; "no" comes back in plain words. */
export async function aiPickQuestion(ctx: SchoolContext, text: string, offered: readonly QuestionKey[]): Promise<AiPick> {
  if (!offered.length) return { ok: false, words: "There are no questions for your role yet." };
  const r = await aiTask(ctx, { feature: "ai-ask-do", purpose: "Pick a ready-made question", system: ASK_SYSTEM, input: askRequest(text, offered), schema: askAnswerSchema, effort: "low", maxTokens: 400 });
  if (!r.ok) return { ok: false, words: r.words };
  const key = r.data.key;
  // Only one of the person's own questions; anything else is ignored.
  if (!isQuestionKey(key) || !offered.includes(key)) return { ok: false, words: "The AI assistant did not find one of your questions for these words." };
  return { ok: true, key, params: cleanParams(key, { cls: r.data.cls, when: r.data.when, amount: r.data.amount }) };
}
