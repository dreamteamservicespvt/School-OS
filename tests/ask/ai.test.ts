// Ask with the AI service (gap list G27, through G28's one gateway): only
// when the school switched on the AI assistant and "Ask and Do" for the
// person's role, the AI picks one of the person's own ready-made questions
// from their words. It is sent only the words (phones hidden) and the
// question titles, never a record; it cannot pick a question the person may
// not ask; the answer still comes from the rules. No test reaches the
// network: a fake service answers.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { useAiProvider, type AiProvider, type AiRequest } from "@/lib/ai";
import { saveAssistant, setFeature } from "@/lib/settings/switches";
import { aiPickQuestion } from "@/lib/ask/ai";
import { offeredQuestions } from "@/lib/ask/answer";
import { viewerOf } from "@/lib/reports/run";
import { makeUser } from "../helpers";
import { makeAttendanceSchool, type Fixture } from "../attendance/fixture";

const USAGE = { inputTokens: 300, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 };
function fake(data: Record<string, unknown>) {
  const sent: AiRequest[] = [];
  const provider: AiProvider = { name: "fake", ask: async (req) => { sent.push(req); return { outcome: "ok", data, usage: USAGE, model: "claude-opus-5-5" }; } };
  return { provider, sent };
}

let f: Fixture;
let admin: { id: string };
const actx = () => ({ schoolId: f.school.id, userId: admin.id });
const offeredTo = async (userId: string) => offeredQuestions((await withSchool({ schoolId: f.school.id, userId }, (tx) => viewerOf(tx, userId, f.school.id)))!);

beforeAll(async () => {
  f = await makeAttendanceSchool("Ask AI School");
  admin = await makeUser({ schools: [{ id: f.school.id, roleKeys: ["school-admin"] }], name: "Asha Admin" });
}, 120_000);

afterEach(() => useAiProvider(null));

describe("the AI only picks a question, and only when the school says yes", () => {
  it("with AI off nothing is sent and nothing AI happens", async () => {
    const svc = fake({ key: "absent-today", cls: null, when: null, amount: null });
    useAiProvider(svc.provider);
    const offered = await offeredTo(f.principal.id);
    const r = await aiPickQuestion({ schoolId: f.school.id, userId: f.principal.id }, "kaun kaun nahi dikha aaj", offered);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.words).toBe("The AI assistant is off for this school.");
    expect(svc.sent).toHaveLength(0);
  });

  it("with the AI assistant and Ask and Do on, picks one of the person's questions from the words only", async () => {
    await withSchool(actx(), async (tx) => {
      await saveAssistant(tx, actx(), { on: true, roles: ["school-admin", "principal", "class-teacher"] });
      await setFeature(tx, actx(), "ai-ask-do", true);
    });
    const svc = fake({ key: "absent-today", cls: "5 B", when: "yesterday", amount: null });
    useAiProvider(svc.provider);
    const offered = await offeredTo(f.principal.id);
    const r = await aiPickQuestion({ schoolId: f.school.id, userId: f.principal.id }, "which kids of 5 B did not turn up yesterday? call 9876543210", offered);
    expect(r).toEqual({ ok: true, key: "absent-today", params: { cls: "5 B", when: "yesterday" } });
    // Only the words (the phone hidden) and the person's own question titles went out: no record of the school.
    expect(svc.sent).toHaveLength(1);
    const text = svc.sent[0].text;
    expect(text).toContain("[phone hidden]");
    expect(text).not.toContain("9876543210");
    expect(text).toContain("Who is absent today?");
    expect(text).not.toMatch(/Aarav|Diya|Rohan|ADM-0/);
    // Logged as an AI Call with no content.
    const call = await withSchool(actx(), (tx) => tx.aiCall.findFirstOrThrow({ where: { feature: "ai-ask-do" }, orderBy: { createdAt: "desc" } }));
    expect(call).toMatchObject({ purpose: "Pick a ready-made question", outcome: "ok", userLoginId: f.principal.id, sent: true });
  });

  it("never gives a question the person may not ask, or one that does not exist", async () => {
    const offered = await offeredTo(f.teacherA.id);
    expect(offered).not.toContain("fees-overdue");
    useAiProvider(fake({ key: "fees-overdue", cls: null, when: null, amount: 10000 }).provider);
    const r = await aiPickQuestion({ schoolId: f.school.id, userId: f.teacherA.id }, "who has not paid", offered);
    expect(r.ok).toBe(false);
    useAiProvider(fake({ key: "DROP TABLE student", cls: null, when: null, amount: null }).provider);
    expect((await aiPickQuestion({ schoolId: f.school.id, userId: f.teacherA.id }, "something odd", offered)).ok).toBe(false);
  });

  it("a role the school did not choose for AI gets no AI", async () => {
    const svc = fake({ key: "late-staff", cls: null, when: null, amount: null });
    useAiProvider(svc.provider);
    const r = await aiPickQuestion({ schoolId: f.school.id, userId: f.hrLogin.id }, "who did not come on time", await offeredTo(f.hrLogin.id));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.words).toBe("Your role does not use the AI assistant in this school.");
    expect(svc.sent).toHaveLength(0);
  });
});
