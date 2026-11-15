// One turn of the School OS Assistant (docs/assistant/plan.md).
//
//  1. Switches: DREAM TEAM's kill switch (ASSISTANT_OFF), the school's AI
//     assistant, the School Feature "ai-school-assistant" (off until the school
//     switches it on) and the AI roles. Off = no answer at all.
//  2. Language (language.ts): the conversation's language, set by the first
//     message and kept until the person clearly switches.
//  3. Understand: words that name a ready-made question need no model (as
//     Search does); otherwise the planner (prompt.ts) picks the tools, the one
//     change it may prepare, a question back, or a chat line. It never sees a
//     record.
//  4. Read: each tool runs as the person, with their reach (tools.ts), each in
//     its own short transaction.
//  5. Reply: the composer writes a short, natural reply in the conversation's
//     language from the records. A reply with a number that is not in the
//     records is never shown (numbers.ts): the code's own sentences are.
//  6. Remember: the last few turns (for "and yesterday?"), the language, and
//     the card waiting for "Yes" are kept on the Assistant Conversation.
//  7. Log: every request to the AI service is an AI Call (aiTask), and every
//     turn an Audit Log entry with which lists were read, never the words or
//     the values (00-global.md §2.1 rule 6).
import "server-only";

import { Prisma } from "@prisma/client";
import { withSchool, type Tx } from "../db";
import type { Viewer } from "../dashboard/types";
import { aiConnected, aiTask } from "../ai";
import { writeAudit } from "../audit";
import { aiOffReason } from "../settings/switch-rules";
import { formatDate } from "../format";
import { todayFor } from "../periods";
import { offeredQuestions, readyMadeFor, type AskClock } from "../ask/answer";
import { matchIntent, type AskParams, type QuestionKey } from "../ask/questions";
import { questionTitleIn } from "../ask/titles";
import { makeT } from "../i18n/server";
import { ASSISTANT_FEATURE, assistantKilled, assistantModel, FRESH_AFTER_MS, KEEP_TURNS } from "./config";
import { inLanguage, isAssistantLang, nextLanguage, type AssistantLang, type LanguageState } from "./language";
import { allowedNumbers, inventedNumbers } from "./numbers";
import { COMPOSER_SYSTEM, PLANNER_SYSTEM, composerRequest, plannerRequest, planSchema, replySchema, type Plan } from "./prompt";
import { isToolName, offeredTools, QUESTION_TOOL, runTool, TOOLS, type ToolArgs, type ToolName, type ToolResult } from "./tools";
import { cardOf, ENQUIRY_FORM, mayAddEnquiry, newPrepared, planEnquiry, type Confirmed, type ConfirmCard, type EnquiryPlan, type Prepared } from "./enquiry";
import { words, type WordKey } from "./words";

export type StoredTurn = { said: string; tools: { tool: ToolName; args: ToolArgs }[]; action: string | null; reply: string; at: string };
export type TurnSource = { label: string; href: string; scope: string | null };

export type TurnReply = {
  /** False when the assistant could not be used at all (off, paused, not this role). */
  ok: boolean;
  conversationId: string | null;
  lang: AssistantLang;
  /** The conversation's language changed with this message. */
  switched: boolean;
  reply: string;
  /** "ai": written by the model from the records (shown as a Suggestion); "rules": the code's own words. */
  by: "ai" | "rules";
  sources: TurnSource[];
  chips: string[];
  card: ConfirmCard | null;
};

export type TurnInput = {
  conversationId?: string | null;
  text: string;
  /** The language picked before the first voice message, if any. */
  chosen?: AssistantLang | null;
  /** The person's screen language, used only when the first message says nothing. */
  screen?: string | null;
  via?: "typed" | "voice" | "chip";
};

type Convo = { id: string; state: LanguageState | null; turns: StoredTurn[]; prepared: Prepared | null };

const UUID = /^[0-9a-f-]{36}$/i;
const MAX_TOOLS = 3;
const AI_NOTE = "answer written by AI from the person's own lists";

/** Why the assistant cannot be used by this person now, or null. */
export function assistantOff(who: Pick<Viewer, "features" | "roles"> & { aiRoles?: readonly string[] | null }): "paused" | "off" | "role" | null {
  if (assistantKilled()) return "paused";
  const off = aiOffReason(who, ASSISTANT_FEATURE);
  if (!off) return null;
  return off === "role-not-allowed" ? "role" : "off";
}

const screenLang = (v: string | null | undefined): AssistantLang | undefined => (isAssistantLang(v) ? v : undefined);

/* ---------- The conversation record ---------- */

function readTurns(v: unknown): StoredTurn[] {
  return Array.isArray(v) ? (v as StoredTurn[]).filter((t) => t && typeof t.said === "string").slice(-KEEP_TURNS) : [];
}
function readPending(v: unknown): LanguageState["pending"] {
  const p = v as { lang?: unknown; count?: unknown } | null;
  return p && isAssistantLang(p.lang) && typeof p.count === "number" ? { lang: p.lang, count: p.count } : null;
}
function readPrepared(v: unknown): Prepared | null {
  const p = v as Prepared | null;
  return p && typeof p.id === "string" && p.kind === "add-enquiry" && p.plan ? p : null;
}

/** The person's own open conversation (never another person's), if it is recent. */
async function loadConvo(tx: Tx, who: Viewer, id: string | null | undefined, now: Date): Promise<Convo | null> {
  if (!id || !UUID.test(id) || !who.ctx.userId) return null;
  const c = await tx.assistantConversation.findFirst({ where: { id, userLoginId: who.ctx.userId, archivedAt: null } });
  if (!c || now.getTime() - c.updatedAt.getTime() > FRESH_AFTER_MS) return null;
  return { id: c.id, state: isAssistantLang(c.language) ? { lang: c.language, pending: readPending(c.pendingLanguage) } : null, turns: readTurns(c.turns), prepared: readPrepared(c.prepared) };
}

async function saveConvo(tx: Tx, who: Viewer, convo: Convo | null, data: { state: LanguageState; turns: StoredTurn[]; prepared: Prepared | null }) {
  const json = {
    language: data.state.lang,
    pendingLanguage: data.state.pending ? (data.state.pending as Prisma.InputJsonValue) : Prisma.DbNull,
    turns: data.turns.slice(-KEEP_TURNS) as unknown as Prisma.InputJsonValue,
    prepared: data.prepared ? (data.prepared as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
  };
  if (convo) return (await tx.assistantConversation.update({ where: { id: convo.id }, data: json })).id;
  return (await tx.assistantConversation.create({ data: { schoolId: who.ctx.schoolId, userLoginId: who.ctx.userId!, ...json } })).id;
}

/* ---------- Helpers ---------- */

const todayWords = (clock: AskClock) => {
  const d = todayFor(clock.setup.timeZone, clock.now);
  return `${new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(d)}, ${formatDate(d, "UTC")} (${d.toISOString().slice(0, 10)})`;
};

/** Up to 3 of the person's ready-made questions, in the conversation language, as chips. */
function readyChips(who: Viewer, lang: AssistantLang, skip: ToolName[] = []): string[] {
  const t = makeT(lang);
  return readyMadeFor(who).filter((q) => !skip.includes(QUESTION_TOOL[q.key])).slice(0, 3).map((q) => questionTitleIn(t, q.key, paramsOfHref(q.href)));
}
const paramsOfHref = (href: string): AskParams => {
  const u = new URLSearchParams(href.split("?")[1] ?? "");
  const amount = Number(u.get("amount"));
  return { cls: u.get("cls"), when: (u.get("when") as AskParams["when"]) ?? null, amount: Number.isInteger(amount) && amount > 0 ? amount : null };
};

/** The rules' reading of the words, as a plan (no model). */
function rulesPlan(key: QuestionKey, p: AskParams, lang: AssistantLang): Plan {
  return { language: lang, kind: "tools", tools: [{ tool: QUESTION_TOOL[key], cls: p.cls ?? null, when: p.when ?? null, amount: p.amount ?? null, student: null, days: null }], enquiry: null, text: null };
}

/** The plan's tool calls the person may make, at most three, each once. */
function callsOf(plan: Plan, offered: ToolName[]): { tool: ToolName; args: ToolArgs }[] {
  const out: { tool: ToolName; args: ToolArgs }[] = [];
  for (const c of plan.tools) {
    if (!isToolName(c.tool) || !offered.includes(c.tool)) continue;
    const args: ToolArgs = { cls: c.cls, when: c.when, amount: c.amount, name: c.student, days: c.days };
    if (out.some((o) => o.tool === c.tool && JSON.stringify(o.args) === JSON.stringify(args))) continue;
    out.push({ tool: c.tool, args });
    if (out.length === MAX_TOOLS) break;
  }
  return out;
}

const sourcesOf = (results: ToolResult[]): TurnSource[] =>
  results.filter((r) => r.link).map((r) => ({ label: r.link!.label, href: r.link!.href, scope: r.scope }))
    .filter((s, i, all) => all.findIndex((x) => x.href === s.href) === i);

/* ---------- One turn ---------- */

/**
 * Answers one message for the person in `who` (built on the server from the
 * signed-in session, never from the caller's words). Never throws for a
 * problem the person can act on: it says it in their language.
 */
export async function assistantTurn(who: Viewer, input: TurnInput, clock: AskClock): Promise<TurnReply> {
  const screen = screenLang(input.screen);
  const first = input.chosen && isAssistantLang(input.chosen) ? input.chosen : screen ?? "en";
  const blocked = (key: WordKey, lang: AssistantLang = first): TurnReply => ({ ok: false, conversationId: input.conversationId ?? null, lang, switched: false, reply: words(lang, key), by: "rules", sources: [], chips: [], card: null });

  const stop = assistantOff(who);
  if (stop) return blocked(stop);
  if (!who.ctx.userId) return blocked("role");
  const said = String(input.text ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
  const now = clock.now;
  const convo = await withSchool(who.ctx, (tx) => loadConvo(tx, who, input.conversationId, now));
  if (!said) return { ...blocked("empty", convo?.state?.lang ?? first), ok: true };

  const state = convo?.state ?? null;
  const turns = convo?.turns ?? [];
  const chosen = input.chosen && isAssistantLang(input.chosen) ? input.chosen : null;
  const before = nextLanguage(state, said, { chosen, screen });
  const offered = offeredTools(who);
  const today = todayWords(clock);

  // 3. Understand: the rules first (no cost), then the model.
  let plan: Plan | null = null;
  let understoodBy: "rules" | "ai" | null = null;
  let aiProblem: string | null = null;
  const match = matchIntent(said, offeredQuestions(who))[0];
  if (match && match.score >= 3 && !convo?.prepared) {
    plan = rulesPlan(match.key, match.params, before.lang);
    understoodBy = "rules";
  } else {
    const r = await aiTask(who.ctx, {
      feature: ASSISTANT_FEATURE, purpose: "Assistant: understand the question", system: PLANNER_SYSTEM, schema: planSchema, model: assistantModel(), effort: "low", maxTokens: 700,
      input: plannerRequest({
        said, replyLanguage: before.lang, today, earlier: turns.map((t) => ({ said: t.said, tools: t.tools.map((x) => ({ tool: x.tool, args: x.args })), action: t.action })),
        tools: offered.map((n) => ({ tool: n, about: TOOLS[n].about, takes: TOOLS[n].takes, when: TOOLS[n].whens })),
        canAddEnquiry: mayAddEnquiry(who), enquiryOpen: Boolean(convo?.prepared),
      }),
    }, now);
    if (r.ok) { plan = r.data; understoodBy = "ai"; }
    else {
      aiProblem = r.reason;
      if (match) { plan = rulesPlan(match.key, match.params, before.lang); understoodBy = "rules"; }
    }
  }

  const after = nextLanguage(state, said, { model: understoodBy === "ai" ? plan?.language : null, chosen, screen });
  const lang = after.lang;
  const newState: LanguageState = { lang, pending: after.pending };

  let reply = "";
  let by: "ai" | "rules" = "rules";
  let chips: string[] = [];
  let card: ConfirmCard | null = null;
  let prepared = convo?.prepared ?? null;
  const results: ToolResult[] = [];
  let calls: { tool: ToolName; args: ToolArgs }[] = [];
  let action: string | null = null;
  let numberCheck: "passed" | "replaced" | null = null;

  if (!plan) {
    reply = words(lang, aiProblem === "daily-limit" ? "limit" : aiProblem && aiProblem !== "not-connected" ? "aiDown" : "notUnderstood");
    chips = readyChips(who, lang);
  } else if (plan.kind === "tools") {
    calls = callsOf(plan, offered);
    if (!calls.length) {
      // Named a list the person may not open, or none at all: say so, never guess.
      const named = plan.tools.some((c) => isToolName(c.tool));
      reply = words(lang, named ? "notYourRole" : "notUnderstood");
      chips = readyChips(who, lang);
    } else {
      // 4. Read, each list in its own short transaction, as the person.
      for (const c of calls) results.push(await withSchool(who.ctx, (tx) => runTool({ tx, who, clock, lang }, c.tool, c.args)));
      const plain = results.map((r) => r.sentence).join(" ");
      reply = plain;
      // 5. Reply in the person's language from the records, when the AI service is there.
      if (aiConnected() && aiProblem !== "daily-limit") {
        const r = await aiTask(who.ctx, {
          feature: ASSISTANT_FEATURE, purpose: "Assistant: write the reply", system: COMPOSER_SYSTEM, schema: replySchema, model: assistantModel(), effort: "low", maxTokens: 800,
          input: composerRequest({ said, replyLanguage: lang, today, earlier: turns.slice(-2).map((t) => ({ said: t.said, reply: t.reply })), records: results.map((x) => ({ tool: x.tool, found: x.ok, facts: x.facts, scope: x.scope, link: x.link?.label ?? null })) }),
        }, now);
        if (r.ok) {
          const allowed = allowedNumbers([...results.map((x) => x.facts), ...results.map((x) => x.sentence), said, ...turns.slice(-2).map((t) => t.reply)], todayFor(clock.setup.timeZone, now));
          // Shown only when every number is in the records and it is in the conversation's language.
          if (inventedNumbers(r.data.reply, allowed).length === 0 && inLanguage(r.data.reply, lang)) {
            reply = r.data.reply.trim();
            by = "ai";
            numberCheck = "passed";
            chips = r.data.chips.filter((c) => inventedNumbers(c, allowed).length === 0 && inLanguage(c, lang)).slice(0, 3);
          } else numberCheck = "replaced";
        }
      }
      if (by === "rules") chips = readyChips(who, lang, calls.map((c) => c.tool));
    }
  } else if (plan.kind === "action") {
    action = "add an enquiry";
    if (!mayAddEnquiry(who)) reply = words(lang, "notYourRole");
    else {
      const p: EnquiryPlan = await withSchool(who.ctx, (tx) => planEnquiry(tx, who, plan.enquiry ?? {}, said, prepared?.plan ?? null, now));
      prepared = newPrepared(p, now);
      card = cardOf(prepared, lang);
      reply = card.ready ? card.title : words(lang, "missing", { fields: card.missing.join(", ") });
    }
  } else {
    // clarify, chat, cannot: the planner's own short line, only when it is in the conversation's language and holds no number the person did not say.
    const text = (plan.text ?? "").trim();
    const fallback: WordKey = plan.kind === "clarify" ? "sayMore" : plan.kind === "chat" ? "hello" : "cantDo";
    const fits = Boolean(text) && inLanguage(text, lang) && inventedNumbers(text, allowedNumbers([said])).length === 0;
    reply = fits ? text : words(lang, fallback);
    by = fits ? "ai" : "rules";
    if (plan.kind !== "clarify") chips = readyChips(who, lang);
  }

  // 6. Remember, and 7. log (never the words or the values).
  const turn: StoredTurn = { said: said.slice(0, 300), tools: calls, action, reply: reply.slice(0, 700), at: now.toISOString() };
  const conversationId = await withSchool(who.ctx, async (tx) => {
    const id = await saveConvo(tx, who, convo, { state: newState, turns: [...turns, turn], prepared });
    await writeAudit(tx, who.ctx, {
      action: "asked the assistant", recordType: "Assistant Conversation", recordId: id,
      after: { via: input.via ?? "typed", understoodBy, kind: plan?.kind ?? "not-understood", tools: calls.map((c) => c.tool), rows: results.map((r) => r.total), language: lang, switched: after.switched, numberCheck, preparedChange: action },
      actorNote: by === "ai" ? AI_NOTE : null,
    });
    return id;
  });

  return { ok: true, conversationId, lang, switched: after.switched, reply, by, sources: sourcesOf(results), chips, card };
}

/* ---------- The card: "Yes" or "No" ---------- */

/**
 * The person pressed a button on the card. Only the card that is open on the
 * person's own conversation counts (an old or someone else's card does
 * nothing). "Yes" runs `confirm`, which the server action builds with
 * inSchool("create"), so the role is checked on the server first.
 */
export async function answerCard(who: Viewer, input: { conversationId: string; cardId: string; yes: boolean }, confirm: (plan: EnquiryPlan, lang: AssistantLang) => Promise<Confirmed>, now = new Date()): Promise<TurnReply> {
  const convo = await withSchool(who.ctx, (tx) => loadConvo(tx, who, input.conversationId, now));
  const lang = convo?.state?.lang ?? "en";
  const base: TurnReply = { ok: true, conversationId: convo?.id ?? null, lang, switched: false, reply: "", by: "rules", sources: [], chips: [], card: null };
  if (assistantOff(who)) return { ...base, ok: false, reply: words(lang, assistantOff(who)!) };
  if (!convo || !convo.prepared || convo.prepared.id !== input.cardId) return { ...base, reply: words(lang, "expired") };
  const prepared = convo.prepared;
  let reply: string;
  let keep: Prepared | null = null;
  let sources: TurnSource[] = [];
  let outcome: string;
  if (!input.yes) { reply = words(lang, "cancelled"); outcome = "no"; }
  else if (!cardOf(prepared, lang).ready) { reply = words(lang, "missing", { fields: cardOf(prepared, lang).missing.join(", ") }); keep = prepared; outcome = "not-ready"; }
  else {
    const done = await confirm(prepared.plan, lang);
    if (done.ok) {
      reply = words(lang, "added", { name: done.childName });
      sources = [{ label: words(lang, "linkEnquiries"), href: `${ENQUIRY_FORM}?id=${done.id}`, scope: null }];
      outcome = "added";
    } else {
      reply = done.problem;
      sources = [{ label: words(lang, "openForm"), href: ENQUIRY_FORM, scope: null }];
      keep = done.duplicate ? null : prepared;
      outcome = done.duplicate ? "duplicate" : "refused";
    }
  }
  const turn: StoredTurn = { said: input.yes ? "[Yes on the card]" : "[No on the card]", tools: [], action: "add an enquiry", reply, at: now.toISOString() };
  await withSchool(who.ctx, async (tx) => {
    await saveConvo(tx, who, convo, { state: convo.state ?? { lang, pending: null }, turns: [...convo.turns, turn], prepared: keep });
    await writeAudit(tx, who.ctx, { action: "answered an assistant card", recordType: "Assistant Conversation", recordId: convo.id, after: { change: "add an enquiry", outcome } });
  });
  return { ...base, reply, sources, card: keep ? cardOf(keep, lang) : null };
}
