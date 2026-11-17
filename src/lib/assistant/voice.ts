// How the assistant's AI voice SOUNDS (owner, 17 Nov 2026: "speak like a real
// person with emotion", the bar is ChatGPT and Gemini Live voice). Every reply
// carries a feel (the mascot's ReplyFeel) and a short delivery note; the voice
// model is told, in plain words, to say the reply that way, as a kind and
// competent school office person would:
// - good news, a greeting, thanks: warm and pleased, brighter;
// - a confirmed change: bright, relieved;
// - a problem (a child absent, fees unpaid, attendance not taken): gentle, concerned, then calm about the next step;
// - instructions and plain answers: calm and clear;
// - a refusal or an error: gentle, kind, apologetic without drama.
// The words are never changed: Gemini's voice models read the text as it is
// and take the style separately. No database and no server code here.
import type { AssistantLang } from "./language";
import type { ReplyFeel } from "./mascot-state";

/** The delivery note when nothing more is known, per feel. */
export const DELIVERY: Record<ReplyFeel, string> = {
  answer: "calm and clear",
  happy: "warm and pleased",
  done: "bright and relieved",
  sorry: "gentle and kind",
};

/** Delivery notes the code itself uses for a kind of reply. */
export const DELIVERY_FOR = {
  greeting: "bright and welcoming",
  thanks: "warm and pleased",
  concern: "gentle and concerned",
  instructions: "calm, clear and helpful",
  question: "friendly and curious",
} as const;

/** A delivery note made safe: plain words only (letters in any script, spaces, commas, hyphens), short, lower case. */
export function cleanDelivery(note: unknown): string | null {
  const t = String(note ?? "").normalize("NFC").replace(/[^\p{L}\p{M}\s,-]/gu, " ").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 60).replace(/[\s,-]+$/, "");
  return t.length >= 3 ? t : null;
}

const SPEECH_OF: Record<AssistantLang, string> = {
  en: "natural Indian English",
  te: "natural everyday Telugu the way educated people in Andhra and Telangana talk, with the English school words said the English way",
  hi: "natural everyday Hindi the way people talk in an Indian school office, with the English school words said the English way",
};

/**
 * The style for the voice model: the feeling, the person it sounds like, and
 * how to speak. Never a trait such as age or gender (the voice gives those).
 */
export function styleFor(feel: ReplyFeel, delivery: string | null | undefined, lang: AssistantLang): string {
  const how = cleanDelivery(delivery) ?? DELIVERY[feel];
  return [
    `Say it ${how}, like a kind, capable school office assistant talking to a colleague.`,
    `Speak ${SPEECH_OF[lang]}, at a relaxed conversational pace, with natural rises and falls and short pauses between sentences.`,
    feel === "sorry" ? "Soft and sincere, never dramatic." : feel === "happy" || feel === "done" ? "Let the smile be heard." : "Warm, never flat or robotic.",
  ].join(" ");
}

/** A reply's feel and delivery from what the records showed (the code's own answers, when no AI wrote them). */
export function deliveryFor(feel: ReplyFeel, kind: "greeting" | "thanks" | "concern" | "instructions" | "question" | null = null): string {
  return kind ? DELIVERY_FOR[kind] : DELIVERY[feel];
}
