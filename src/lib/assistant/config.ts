// The School OS Assistant's switches (docs/assistant/plan.md §2 and §6).
// - The School Feature "ai-school-assistant" (Settings, Modules On/Off) is OFF
//   until a school switches it on; it works only while the school's AI
//   assistant is on, for the roles the school chose (aiOffReason()).
// - The kill switch ASSISTANT_OFF (DREAM TEAM, in the hosting provider's secret
//   store) stops the assistant for every school at once, with no new release.
//   AI_GLOBAL_OFF stops every AI feature, the assistant too.
// - ASSISTANT_AI_MODEL picks a cheaper model for the assistant than the
//   platform's AI_MODEL, when set.
// None of these holds a key. Read each time, so a change takes effect at once.
import "server-only";

import { aiModel } from "../ai/config";

/** The School Feature switch of the assistant (default off: no row means off). */
export const ASSISTANT_FEATURE = "ai-school-assistant" as const;

/** DREAM TEAM's kill switch for the assistant: on means no school can use it, not even its rule-based answers. */
export const assistantKilled = () => /^(1|on|true|yes)$/i.test((process.env.ASSISTANT_OFF ?? "").trim());

/** The model the assistant asks: ASSISTANT_AI_MODEL when set, else the platform's. Exact id, no date suffix. */
export const assistantModel = () => (process.env.ASSISTANT_AI_MODEL ?? "").trim() || aiModel();

/** Messages one person may send in a minute (the school's daily AI limit applies on top). */
export const PER_MINUTE = 12;

/** Turns kept on a conversation for follow-ups ("and yesterday?"). */
export const KEEP_TURNS = 6;

/** A conversation untouched this long starts again (and its language is set again by the next first message). */
export const FRESH_AFTER_MS = 6 * 60 * 60 * 1000;
