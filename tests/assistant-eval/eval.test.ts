// The assistant's eval set (docs/assistant/plan.md §7), run against a FAKE
// model for structure. Each case in cases.jsonl says the conversation language
// expected, the tool (or the change, or the refusal) a correct model picks,
// and what must never appear (another school's data, an invented number).
// The fake planner answers as a correct model would; the fake composer
// always tries to slip in an invented number (987) and English words, so each
// case also proves the guard: the number never reaches the person and the
// reply is in the conversation's language. The live run with the real model
// is tests/assistant-eval/live.test.ts and waits for the owner's OK.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { useAiProvider, type AiProvider } from "@/lib/ai";
import { viewerOf } from "@/lib/reports/run";
import type { ReportViewer } from "@/lib/reports/types";
import { assistantTurn } from "@/lib/assistant/conversation";
import { detectLanguage, inLanguage, nextLanguage } from "@/lib/assistant/language";
import { offeredTools } from "@/lib/assistant/tools";
import { COMPOSER_SYSTEM, PLANNER_SYSTEM } from "@/lib/assistant/prompt";
import { makeUser } from "../helpers";
import { CASES, makeEvalSchools, EVAL_CLOCK, type EvalCase, type EvalSchools } from "./fixture";

let s: EvalSchools;
const users: Partial<Record<EvalCase["role"], ReportViewer>> = {};
const USAGE = { inputTokens: 900, outputTokens: 90, cacheReadTokens: 0, cacheWriteTokens: 0 };

/** What a correct model would answer for the case: the planner's pick, and a composer that tries to cheat. */
function correctModel(c: EvalCase): AiProvider {
  return {
    name: "fake-eval",
    ask: async (req) => {
      if (req.system === COMPOSER_SYSTEM) return { outcome: "ok", data: { reply: "Here you go: 987 records found.", chips: ["And 987 more?"] }, usage: USAGE, model: req.model };
      if (req.system !== PLANNER_SYSTEM) return { outcome: "failed", error: "unreadable", usage: USAGE, model: req.model };
      const base = { language: c.lang, tools: [], enquiry: null, text: null };
      const data = c.expect.action
        ? { ...base, kind: "action", enquiry: { childName: null, parentName: null, className: null, source: null, followUp: null, ...c.expect.fields } }
        : c.expect.kind === "cannot"
          ? { ...base, kind: "cannot", text: "I cannot do that here." }
          : { ...base, kind: "tools", tools: [{ tool: c.expect.tool, cls: null, when: null, amount: null, student: null, days: null, ...c.expect.args }] };
      return { outcome: "ok", data, usage: USAGE, model: req.model };
    },
  };
}

beforeAll(async () => {
  s = await makeEvalSchools();
  const teacher = await makeUser({ schools: [{ id: s.a.school.id, roleKeys: ["class-teacher"] }], name: "Eval Teacher" });
  for (const [role, id] of [["principal", s.a.principal.id], ["school-admin", s.a.admin.id], ["class-teacher", teacher.id]] as const) {
    users[role] = (await withSchool({ schoolId: s.a.school.id, userId: id }, (tx) => viewerOf(tx, id, s.a.school.id)))!;
  }
}, 240_000);

afterEach(() => useAiProvider(null));

describe("the eval set", () => {
  it("has at least 30 cases: 10 English, 10 Telugu script, 10 romanised or mixed, each with what must never appear", () => {
    expect(CASES.length).toBeGreaterThanOrEqual(30);
    expect(CASES.filter((c) => c.id.startsWith("en-")).length).toBeGreaterThanOrEqual(10);
    expect(CASES.filter((c) => c.id.startsWith("te-")).length).toBeGreaterThanOrEqual(10);
    expect(CASES.filter((c) => c.id.startsWith("rm-")).length).toBeGreaterThanOrEqual(10);
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
    for (const c of CASES) expect(c.mustNot.length, c.id).toBeGreaterThan(0);
  });

  it("the words alone (no model) find the language of every script and romanised case", () => {
    const missed = CASES.filter((c) => c.id.startsWith("te-") || c.id.startsWith("rm-")).filter((c) => detectLanguage(c.said).lang !== c.lang).map((c) => c.id);
    expect(missed).toEqual([]);
    // With the model's judgement as the tie-breaker, every case starts in its language.
    expect(CASES.filter((c) => nextLanguage(null, c.said, { model: c.lang }).lang !== c.lang).map((c) => c.id)).toEqual([]);
  });

  it("every tool a case expects is one the role is offered, unless the case expects a refusal", () => {
    for (const c of CASES.filter((x) => x.expect.tool)) {
      const offered = offeredTools(users[c.role]!).includes(c.expect.tool!);
      expect(offered, c.id).toBe(!c.expect.refused);
    }
  });
});

describe("each case, through the whole turn with a fake model", () => {
  for (const c of CASES) {
    it(`${c.id}: ${c.said}`, async () => {
      useAiProvider(correctModel(c));
      const r = await assistantTurn(users[c.role]!, { text: c.said, screen: "en" }, EVAL_CLOCK);
      expect(r.ok, c.id).toBe(true);
      expect(r.lang, c.id).toBe(c.lang);
      const shown = JSON.stringify({ reply: r.reply, chips: r.chips, card: r.card });
      for (const bad of c.mustNot) expect(shown, `${c.id} must never show "${bad}"`).not.toContain(bad);
      // The reply is in the conversation's language (names and numbers may sit inside).
      expect(inLanguage(r.reply, c.lang), `${c.id} reply language: ${r.reply}`).toBe(true);
      if (c.expect.refused) expect(r.sources, c.id).toEqual([]);
      if (c.expect.action) {
        expect(r.card?.ready, c.id).toBe(true);
        const enquiries = await withSchool(users[c.role]!.ctx, (tx) => tx.enquiry.count({ where: { childName: c.expect.fields!.childName } }));
        expect(enquiries, `${c.id}: nothing is added before Yes`).toBe(0);
      }
      if (c.expect.kind === "cannot") expect(r.card, c.id).toBeNull();
      if (c.expect.tool && !c.expect.refused) expect(r.sources.length, c.id).toBeGreaterThan(0);
    });
  }
});
