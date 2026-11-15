"use server";

// The School OS Assistant's two server actions (docs/assistant/plan.md): one
// message, and a press on the confirmation card. The person is always the
// signed-in session (requireCurrent), never something the browser sends; the
// conversation must be their own; the switches are checked again on the
// server for every message.
import { requireCurrent } from "@/lib/current";
import { hitLimit } from "@/lib/rate-limit";
import { periodSetup } from "@/lib/period-setup";
import { personLanguage } from "@/lib/i18n/server";
import { inSchool } from "@/lib/admission/server";
import { answerCard, assistantTurn, type TurnReply } from "@/lib/assistant/conversation";
import { confirmEnquiry } from "@/lib/assistant/enquiry";
import { PER_MINUTE } from "@/lib/assistant/config";
import { isAssistantLang, type AssistantLang } from "@/lib/assistant/language";
import { words } from "@/lib/assistant/words";

const lim = (s: unknown, n: number) => String(s ?? "").slice(0, n);

/** One message to the assistant: typed, spoken (already turned into words in the browser) or a tapped suggestion. */
export async function sendToAssistant(input: { conversationId?: string | null; text: string; chosen?: string | null; via?: "typed" | "voice" | "chip" }): Promise<TurnReply> {
  const current = await requireCurrent();
  const screen = personLanguage(current.user, current.school);
  const chosen: AssistantLang | null = isAssistantLang(input?.chosen) ? input.chosen : null;
  const lang: AssistantLang = chosen ?? (isAssistantLang(screen) ? screen : "en");
  const no = (reply: string): TurnReply => ({ ok: false, conversationId: input?.conversationId ?? null, lang, switched: false, reply, by: "rules", sources: [], chips: [], card: null });
  // DREAM TEAM support access looks only; it does not use the school's AI requests.
  if (current.support) return no(words(lang, "role"));
  if (!(await hitLimit(`assistant:${current.user.id}`, PER_MINUTE, 60)).ok) return { ...no(words(lang, "tooMany")), ok: true };
  try {
    const setup = await periodSetup(current);
    return await assistantTurn(current, {
      conversationId: lim(input?.conversationId, 40) || null, text: lim(input?.text, 500), chosen, screen,
      via: input?.via === "voice" || input?.via === "chip" ? input.via : "typed",
    }, { now: new Date(), setup });
  } catch (e) {
    console.error(JSON.stringify({ level: "error", event: "assistant-turn-failed", schoolId: current.school.id, error: e instanceof Error ? e.message : String(e) }));
    return { ...no(words(lang, "error")), ok: true };
  }
}

/** "Yes" or "No" on the assistant's card. "Yes" adds the enquiry through the same checks as the Enquiries form. */
export async function answerAssistantCard(input: { conversationId: string; cardId: string; yes: boolean }): Promise<TurnReply> {
  const current = await requireCurrent();
  try {
    return await answerCard(current, { conversationId: lim(input?.conversationId, 40), cardId: lim(input?.cardId, 40), yes: input?.yes === true },
      (plan, lang) => inSchool("create", (w) => confirmEnquiry(w, plan, lang)));
  } catch (e) {
    const screen = personLanguage(current.user, current.school);
    const lang: AssistantLang = isAssistantLang(screen) ? screen : "en";
    // The role may not add enquiries (or support access looks only): said plainly, nothing changed.
    const refused = e instanceof Error && /PermissionDenied|SupportLookOnly/.test(e.name);
    if (!refused) console.error(JSON.stringify({ level: "error", event: "assistant-card-failed", schoolId: current.school.id, error: e instanceof Error ? e.message : String(e) }));
    return { ok: true, conversationId: input?.conversationId ?? null, lang, switched: false, reply: words(lang, refused ? "notYourRole" : "error"), by: "rules", sources: [], chips: [], card: null };
  }
}
