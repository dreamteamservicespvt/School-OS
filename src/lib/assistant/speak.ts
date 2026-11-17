// The assistant's AI voice (owner, 17 Nov 2026): one reply, said aloud by
// Gemini's voice model with the reply's feeling, as a WAV file. Used by
// POST /api/v1/assistant/speak.
//
// Only for the signed-in staff member the assistant is switched on for (the
// same switches as a message), never for DREAM TEAM support access or a paused
// school. Only a reply that is in the person's own recent conversation is
// said: the voice is never a way to send other words out. The words are said
// the way a person says them (speech.ts), cut to SPEAK_MAX_CHARS at a sentence
// end. aiSpeech() keeps the speech limit and logs the AI Call. Anything that
// stops it answers "no audio" (204), and the panel uses the browser's voice.
import "server-only";

import { withSchool } from "../db";
import type { Viewer } from "../dashboard/types";
import { aiSpeech, aiSpeechConnected } from "../ai";
import { aiTtsVoice } from "../ai/config";
import { wavFromPcm } from "../ai/wav";
import { ASSISTANT_FEATURE, FRESH_AFTER_MS, KEEP_TURNS } from "./config";
import { assistantOff } from "./conversation";
import { isAssistantLang, type AssistantLang } from "./language";
import { mascotCharacterOf, type MascotCharacter, type ReplyFeel } from "./mascot-state";
import { spokenText } from "./speech";
import { styleFor } from "./voice";

/** The most a spoken reply may hold (letters). A reply is at most 700; most are far shorter. */
export const SPEAK_MAX_CHARS = 600;

/** The text cut to `max` letters: at the last sentence end when there is one late enough, else at a space. */
export function capSpoken(text: string, max = SPEAK_MAX_CHARS): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max);
  const ends = [...head.matchAll(/[.!?।](?=\s|$)/g)].map((m) => m.index! + 1);
  const end = ends.length ? ends[ends.length - 1] : -1;
  if (end >= max * 0.4) return head.slice(0, end).trim();
  const space = head.lastIndexOf(" ");
  return (space >= max * 0.4 ? head.slice(0, space) : head).trim();
}

const FEELS: readonly ReplyFeel[] = ["answer", "done", "happy", "sorry"];
const UUID = /^[0-9a-f-]{36}$/i;
const same = (a: string, b: string) => a.replace(/\s+/g, " ").trim() === b.replace(/\s+/g, " ").trim();

export type SpeakInput = { conversationId?: unknown; text?: unknown; lang?: unknown; feel?: unknown; delivery?: unknown };
export type SpeakResult = { status: 200; wav: Uint8Array } | { status: 204 | 400 | 403; problem?: string; why?: string };

type Who = Viewer & { support?: unknown; schoolStatus: string; school: { timeZone?: string; assistantCharacter?: MascotCharacter } };

/** The school's today as a local date, for "today" / "yesterday" in the spoken words. */
function schoolToday(timeZone: string, now: Date): Date {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export async function speakReply(who: Who, input: SpeakInput | null, now = new Date()): Promise<SpeakResult> {
  if (who.support) return { status: 403, problem: "DREAM TEAM support access does not use the school's assistant." };
  if (who.schoolStatus === "SUSPENDED" || who.schoolStatus === "CLOSED") return { status: 403, problem: "The school is paused." };
  if (assistantOff(who) !== null || !who.ctx.userId) return { status: 403, problem: "The assistant is not used by your role in this school." };
  // No voice connected (no Gemini key): the panel speaks with the browser's own voice.
  if (!aiSpeechConnected()) return { status: 204, why: "not-connected" };

  const text = typeof input?.text === "string" ? input.text.slice(0, 800) : "";
  const id = typeof input?.conversationId === "string" ? input.conversationId : "";
  if (!text.trim() || !UUID.test(id)) return { status: 400, problem: "Say which reply to read." };
  const lang: AssistantLang = isAssistantLang(input?.lang) ? input.lang : "en";
  const feel: ReplyFeel = FEELS.includes(input?.feel as ReplyFeel) ? (input!.feel as ReplyFeel) : "answer";

  // Only a reply from the person's own recent conversation.
  const userId = who.ctx.userId;
  const convo = await withSchool(who.ctx, (tx) => tx.assistantConversation.findFirst({ where: { id, userLoginId: userId, archivedAt: null }, select: { turns: true, updatedAt: true } }));
  const turns = convo && now.getTime() - convo.updatedAt.getTime() <= FRESH_AFTER_MS && Array.isArray(convo.turns) ? (convo.turns as { reply?: unknown }[]).slice(-KEEP_TURNS) : [];
  // The words said are always the STORED reply, never the text sent: the request only names which reply
  // (an exact match, so nothing can be added after a real reply's first letters; security review 17 Nov).
  const stored = turns.map((t) => t?.reply).find((r): r is string => typeof r === "string" && same(r, text));
  if (!stored) return { status: 403, problem: "That reply is not in your conversation." };

  const spoken = capSpoken(spokenText(stored, lang, schoolToday(who.school.timeZone ?? "Asia/Kolkata", now)));
  const character = mascotCharacterOf(who.school.assistantCharacter);
  const r = await aiSpeech(who.ctx, {
    feature: ASSISTANT_FEATURE,
    text: spoken,
    style: styleFor(feel, typeof input?.delivery === "string" ? input.delivery : null, lang),
    voice: aiTtsVoice(character, lang),
  }, now);
  if (!r.ok) return { status: 204, why: r.reason };
  return { status: 200, wav: wavFromPcm(r.audio.pcm, r.audio.sampleRate, r.audio.channels) };
}
