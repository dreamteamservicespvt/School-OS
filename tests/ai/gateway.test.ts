// The AI service layer (gap list G28) and the switches that tell the truth
// (G24): one check for every place AI appears, a gateway that runs only when
// the service is connected, the school's AI assistant and the feature are on
// and the person's role may use it; restricted data never leaves; every
// request is logged with no personal content; a daily limit. No test reaches
// the network: a fake provider answers.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import * as z from "zod/v4";
import { withSchool, type SchoolContext } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { aiTask, aiUsage, useAiProvider, type AiProvider, type AiRequest } from "@/lib/ai";
import { maskText, minimise } from "@/lib/ai/minimise";
import { estimatePaise } from "@/lib/ai/cost";
import { aiAllowed, aiOffReason, AI_FEATURES, SHOWN_AI_FEATURES } from "@/lib/settings/switch-rules";
import { saveAssistant, setFeature } from "@/lib/settings/switches";
import { SettingsProblem } from "@/lib/settings/common";
import { reportAccess } from "@/lib/reports/access";
import { teacherAssistantFor } from "@/lib/homework/settings";
import { makeSchool, makeUser } from "../helpers";

const schema = z.object({ answer: z.string() });
const USAGE = { inputTokens: 1200, outputTokens: 300, cacheReadTokens: 800, cacheWriteTokens: 0 };

/** A fake AI service that keeps what it was sent. */
function fake(answer: (req: AiRequest) => Awaited<ReturnType<AiProvider["ask"]>> = () => ({ outcome: "ok", data: { answer: "Fine" }, usage: USAGE, model: "claude-opus-5-5" })) {
  const sent: AiRequest[] = [];
  const provider: AiProvider = { name: "fake", ask: async (req) => { sent.push(req); return answer(req); } };
  return { provider, sent };
}

let school: Awaited<ReturnType<typeof makeSchool>>;
let principal: { id: string };
let teacher: { id: string };
let admin: { id: string };
let pctx: SchoolContext;

const task = (input: unknown = { heading: "Father Name" }) => ({ feature: "ai-smart-import" as const, purpose: "Match import columns", system: "You match columns.", input, schema });

beforeAll(async () => {
  school = await makeSchool("AI Gateway School");
  admin = await makeUser({ schools: [{ id: school.id, roleKeys: ["school-admin"] }], name: "Asha Admin" });
  principal = await makeUser({ schools: [{ id: school.id, roleKeys: ["principal"] }], name: "Prakash Principal" });
  teacher = await makeUser({ schools: [{ id: school.id, roleKeys: ["class-teacher"] }], name: "Tara Teacher" });
  pctx = { schoolId: school.id, userId: principal.id };
});

afterEach(() => useAiProvider(null));

const actx = () => ({ schoolId: school.id, userId: admin.id });
const calls = () => withSchool(actx(), (tx) => tx.aiCall.findMany({ orderBy: { createdAt: "asc" } }));

describe("one AI check for every place AI appears", () => {
  const who = (features: string[], roles: string[], aiRoles?: string[]) => ({ features: new Set(features), roles: roles.map((key) => ({ key })), aiRoles });

  it("needs the AI assistant, the feature, a built feature and a role chosen for AI", () => {
    expect(aiOffReason(who([], ["principal"]), "ai-smart-import")).toBe("assistant-off");
    expect(aiOffReason(who(["ai-assistant"], ["principal"]), "ai-smart-import")).toBe("feature-off");
    expect(aiOffReason(who(["ai-assistant", "ai-smart-import"], ["class-teacher"], ["principal"]), "ai-smart-import")).toBe("role-not-allowed");
    expect(aiOffReason(who(["ai-assistant", "ai-smart-import"], ["class-teacher"], ["class-teacher"]), "ai-smart-import")).toBeNull();
    // Without a saved choice, only the leaders who switch it on.
    expect(aiAllowed(who(["ai-assistant", "ai-smart-import"], ["principal"]), "ai-smart-import")).toBe(true);
    expect(aiAllowed(who(["ai-assistant", "ai-smart-import"], ["accountant"]), "ai-smart-import")).toBe(false);
  });

  it("never offers a feature that is not built, even with an old switch left on", () => {
    for (const key of ["ai-enquiry-reply", "ai-translation", "ai-question-papers"]) {
      expect(aiOffReason(who(["ai-assistant", key], ["principal"]), key)).toBe("not-built");
    }
  });

  it("hides AI question papers from Modules On/Off and lists the rest", () => {
    expect(SHOWN_AI_FEATURES.map((f) => f.key)).not.toContain("ai-question-papers");
    expect(AI_FEATURES.find((f) => f.key === "ai-question-papers")?.status).toBe("hidden");
    expect(AI_FEATURES.filter((f) => f.status === "coming-soon").map((f) => f.key).sort()).toEqual(["ai-enquiry-reply", "ai-translation"]);
  });

  it("shows forecasts and the teacher assistant only to the roles chosen for AI", async () => {
    await withSchool(actx(), async (tx) => {
      await saveAssistant(tx, actx(), { on: true, roles: ["school-admin"] });
      await setFeature(tx, actx(), "ai-forecasts", true);
      await setFeature(tx, actx(), "ai-teacher-assistant", true);
    });
    const p = (await accessIn(principal.id, school.id))!;
    const a = (await accessIn(admin.id, school.id))!;
    expect(p.aiRoles).toEqual(["school-admin"]);
    expect(reportAccess(p).ai.forecasts).toBe(false);
    expect(reportAccess(a).ai.forecasts).toBe(true);
    const t = (await accessIn(teacher.id, school.id))!;
    expect(teacherAssistantFor(t.features, t)).toBe(false);
    await withSchool(actx(), (tx) => saveAssistant(tx, actx(), { on: true, roles: ["school-admin", "principal", "class-teacher"] }));
    const t2 = (await accessIn(teacher.id, school.id))!;
    expect(teacherAssistantFor(t2.features, t2)).toBe(true);
  });

  it("refuses to switch on a feature that is coming soon or not built, and still lets one be switched off", async () => {
    await withSchool(actx(), (tx) => tx.schoolFeature.upsert({ where: { schoolId_featureKey: { schoolId: school.id, featureKey: "ai-translation" } }, create: { schoolId: school.id, featureKey: "ai-translation", isOn: true }, update: { isOn: true } }));
    await expect(withSchool(actx(), (tx) => setFeature(tx, actx(), "ai-enquiry-reply", true))).rejects.toThrow(/coming soon/);
    await expect(withSchool(actx(), (tx) => setFeature(tx, actx(), "ai-question-papers", true))).rejects.toThrow(SettingsProblem);
    expect(await withSchool(actx(), (tx) => setFeature(tx, actx(), "ai-translation", false))).toBe(true);
  });
});

describe("data minimisation", () => {
  it("hides Aadhaar-like numbers, phones, emails, account numbers and IFSC codes in text", () => {
    const m = maskText("Ravi 9876543210, +91 98765 43210, ravi@mail.com, Aadhaar 1234 5678 9012, a/c 123456789012345, IFSC SBIN0001234");
    expect(m.text).not.toMatch(/9876543210|98765 43210|ravi@mail\.com|1234 5678 9012|123456789012345|SBIN0001234/);
    expect(m.masked).toBe(6);
    expect(m.text).toContain("Ravi");
  });

  it("keeps phones or emails only when the feature declares it needs them, never Aadhaar", () => {
    const m = maskText("9876543210 and 1234 5678 9012", new Set(["phone"]));
    expect(m.text).toContain("9876543210");
    expect(m.text).not.toContain("1234 5678 9012");
  });

  it("refuses restricted and highly restricted fields by name, at any depth", () => {
    const r = minimise({ rows: [{ name: "A", aadhaarNumber: "x" }], staff: { basicPay: 1, counsellingNote: "x", bank_account_no: "1" } });
    expect(r.refused.sort()).toEqual(["Aadhaar", "bank details", "counselling notes", "salary"]);
    expect(JSON.stringify(r.value)).not.toMatch(/aadhaar|basicPay|counselling|bank_account/i);
    expect(minimise({ id: 123456789012 }).value).toEqual({ id: "[number hidden]" });
  });
});

describe("the gateway", () => {
  it("does not run, and logs nothing, while the AI assistant is off", async () => {
    await withSchool(actx(), (tx) => saveAssistant(tx, actx(), { on: false, roles: ["principal"] }));
    const f = fake();
    useAiProvider(f.provider);
    const before = (await calls()).length;
    const r = await aiTask(pctx, task());
    expect(r).toMatchObject({ ok: false, reason: "assistant-off" });
    expect(f.sent).toHaveLength(0);
    expect((await calls()).length).toBe(before);
  });

  it("does not run while the feature is off, or for a role not chosen for AI", async () => {
    await withSchool(actx(), (tx) => saveAssistant(tx, actx(), { on: true, roles: ["principal"] }));
    const f = fake();
    useAiProvider(f.provider);
    expect(await aiTask(pctx, task())).toMatchObject({ ok: false, reason: "feature-off" });
    await withSchool(actx(), (tx) => setFeature(tx, actx(), "ai-smart-import", true));
    expect(await aiTask({ schoolId: school.id, userId: teacher.id }, task())).toMatchObject({ ok: false, reason: "role-not-allowed" });
    expect(await aiTask({ schoolId: school.id, userId: null }, task())).toMatchObject({ ok: false, reason: "role-not-allowed" });
    expect(f.sent).toHaveLength(0);
  });

  it("says the service is not connected when DREAM TEAM has set no key, and the caller carries on with its rules", async () => {
    expect(process.env.ANTHROPIC_API_KEY ?? "").toBe("");
    const r = await aiTask(pctx, task());
    expect(r).toMatchObject({ ok: false, reason: "not-connected" });
    if (!r.ok) expect(r.words).toMatch(/DREAM TEAM connects it/);
    const last = (await calls()).at(-1)!;
    expect(last).toMatchObject({ outcome: "fallback", reason: "not-connected", sent: false, feature: "ai-smart-import" });
    expect((await withSchool(actx(), (tx) => aiUsage(tx, actx()))).connected).toBe(false);
  });

  it("answers through the provider, sends only the hidden text, and logs metadata with no personal content", async () => {
    const f = fake();
    useAiProvider(f.provider);
    const r = await aiTask(pctx, task({ heading: "Father Mob", note: "call 9876543210 or ravi.kumar@mail.com" }));
    expect(r).toMatchObject({ ok: true, data: { answer: "Fine" } });
    expect(f.sent).toHaveLength(1);
    expect(f.sent[0].text).toContain("Father Mob");
    expect(f.sent[0].text).not.toMatch(/9876543210|ravi\.kumar@mail\.com/);
    expect(f.sent[0]).toMatchObject({ model: "claude-opus-5-5", effort: "low", system: "You match columns." });
    const row = (await calls()).at(-1)!;
    expect(row).toMatchObject({ outcome: "ok", sent: true, feature: "ai-smart-import", purpose: "Match import columns", userLoginId: principal.id, inputTokens: 1200, outputTokens: 300, cacheReadTokens: 800, masked: 2 });
    expect(row.costPaise).toBe(estimatePaise("claude-opus-5-5", USAGE, 88));
    expect(row.costPaise > BigInt(0)).toBe(true);
    // The log holds no content: neither the request nor the answer.
    expect(JSON.stringify(row, (_, v) => (typeof v === "bigint" ? String(v) : v))).not.toMatch(/Father|Mob|Fine|9876543210|ravi/);
  });

  it("never sends a request with a restricted field", async () => {
    const f = fake();
    useAiProvider(f.provider);
    const r = await aiTask(pctx, task({ student: "A", aadhaar: "1234 5678 9012" }));
    expect(r).toMatchObject({ ok: false, reason: "restricted-data" });
    expect(f.sent).toHaveLength(0);
    expect((await calls()).at(-1)).toMatchObject({ outcome: "refused", reason: "restricted-data", sent: false });
    expect(await aiTask(pctx, { ...task(), images: [{ mediaType: "image/jpeg", data: "AAAA" }] })).toMatchObject({ ok: false, reason: "restricted-data" });
  });

  it("treats a refusal, an answer of the wrong shape and a failure as no answer, and logs each", async () => {
    useAiProvider(fake(() => ({ outcome: "refused", usage: USAGE, model: "claude-opus-5-5" })).provider);
    expect(await aiTask(pctx, task())).toMatchObject({ ok: false, reason: "refused" });
    expect((await calls()).at(-1)).toMatchObject({ outcome: "refused", reason: "refused", sent: true });
    useAiProvider(fake(() => ({ outcome: "ok", data: { wrong: 1 }, usage: USAGE, model: "claude-opus-5-5" })).provider);
    expect(await aiTask(pctx, task())).toMatchObject({ ok: false, reason: "unreadable" });
    useAiProvider(fake(() => ({ outcome: "failed", error: "timeout", usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, model: "claude-opus-5-5" })).provider);
    const t = await aiTask(pctx, task());
    expect(t).toMatchObject({ ok: false, reason: "timeout" });
    expect((await calls()).at(-1)).toMatchObject({ outcome: "failed", reason: "timeout" });
    useAiProvider({ name: "broken", ask: async () => { throw new Error("boom"); } });
    expect(await aiTask(pctx, task())).toMatchObject({ ok: false });
  });

  it("stops at the school's daily limit and says so in plain words", async () => {
    await withSchool(actx(), (tx) => saveAssistant(tx, actx(), { on: true, roles: ["principal"], dailyLimit: 1 }));
    // Today's requests so far already reach a limit of 1.
    const f = fake();
    useAiProvider(f.provider);
    const r = await aiTask(pctx, task());
    expect(r).toMatchObject({ ok: false, reason: "daily-limit" });
    if (!r.ok) expect(r.words).toMatch(/today's AI requests/);
    expect(f.sent).toHaveLength(0);
    expect((await calls()).at(-1)).toMatchObject({ outcome: "fallback", reason: "daily-limit", sent: false });
    await expect(withSchool(actx(), (tx) => saveAssistant(tx, actx(), { on: true, roles: ["principal"], dailyLimit: 100_000 }))).rejects.toThrow(/whole number from 1 to/);
    const usage = await withSchool(actx(), (tx) => aiUsage(tx, actx()));
    expect(usage.dailyLimit).toBe(1);
    expect(usage.today).toBeGreaterThanOrEqual(1);
    expect(usage.month.requests).toBe(usage.today);
    // Back to DREAM TEAM's limit: requests go out again.
    await withSchool(actx(), (tx) => saveAssistant(tx, actx(), { on: true, roles: ["principal"], dailyLimit: null }));
    expect(await aiTask(pctx, task())).toMatchObject({ ok: true });
  });
});
