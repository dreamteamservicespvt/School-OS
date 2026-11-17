// Whether the School OS Assistant's panel is mounted for this person, and what
// it starts with (the school layout). Only when the school switched on the
// School Feature "ai-school-assistant" and its AI assistant for this role
// (default off), never for DREAM TEAM support access or a paused school.
import "server-only";

import type { Viewer } from "../dashboard/types";
import { aiSpeechConnected } from "../ai";
import { assistantOff, startChips } from "./conversation";
import { ASSISTANT_LANGS, type AssistantLang } from "./language";
import { mascotCharacterOf, type MascotCharacter } from "./mascot-state";

export type AssistantPanelStart = {
  /** The person's screen language (the conversation starts in it unless they pick another). */
  screen: string;
  /** Shown next to the assistant in the panel header: "<School> assistant". */
  school: { name: string; logoUrl: string | null };
  character: MascotCharacter;
  /** The first question chips in each conversation language, for this person's role. */
  chips: Record<AssistantLang, string[]>;
  /** The AI voice is connected (a Gemini key): replies are said by it, with the browser's voice as the fallback. */
  voice: boolean;
};

type Who = Viewer & {
  support?: unknown;
  schoolStatus: string;
  school: { name: string; logoUrl: string | null; assistantCharacter?: MascotCharacter };
};

export function assistantPanelFor(who: Who, screen: string): AssistantPanelStart | null {
  if (who.support) return null;
  if (who.schoolStatus === "SUSPENDED" || who.schoolStatus === "CLOSED") return null;
  if (assistantOff(who) !== null) return null;
  return {
    screen,
    school: { name: who.school.name, logoUrl: who.school.logoUrl },
    character: mascotCharacterOf(who.school.assistantCharacter),
    chips: Object.fromEntries(ASSISTANT_LANGS.map((l) => [l, startChips(who, l)])) as Record<AssistantLang, string[]>,
    voice: aiSpeechConnected(),
  };
}
