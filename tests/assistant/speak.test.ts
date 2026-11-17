// The assistant's AI voice: POST /api/v1/assistant/speak, with a FAKE voice
// (no test reaches the network). Checks: no voice connected = no audio (204)
// so the panel uses the browser's voice; only signed-in staff the assistant is
// switched on for; only a reply from the person's own conversation; the words
// cut to the cap; the style from the reply's feeling; a WAV file back, never
// cached; each spoken reply an AI Call with its cost, kept apart from the
// school's daily AI requests, with its own daily limit.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Current } from "@/lib/current";

const who = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/current", async (orig) => {
  const real = await orig<typeof import("@/lib/current")>();
  return { ...real, getCurrent: async () => who.current as Current | null };
});

import { Prisma } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { aiUsage, SPEECH_PURPOSE, useAiSpeaker as putSpeaker, type AiSpeaker, type SpeechRequest } from "@/lib/ai";
import { saveAssistant, setFeature } from "@/lib/settings/switches";
import { viewerOf } from "@/lib/reports/run";
import type { ReportViewer } from "@/lib/reports/types";
import { assistantTurn } from "@/lib/assistant/conversation";
import { SPEAK_MAX_CHARS, speakReply } from "@/lib/assistant/speak";
import { POST } from "@/app/api/v1/assistant/speak/route";
import { at, makeAttendanceSchool, TZ, type Fixture } from "../attendance/fixture";

const NOW = at("2026-10-09", "12:00");
const clock = { now: NOW, setup: { timeZone: TZ, weekStart: "monday" as const, calendar: {} } };
const PCM = new Uint8Array(4800).fill(1);

let f: Fixture;
let principal: ReportViewer;
let conversationId: string;
let reply: string;
const actx = () => ({ schoolId: f.school.id, userId: f.admin.id });

/** A fake voice that keeps what it was asked to say. */
function fakeVoice() {
  const asked: SpeechRequest[] = [];
  const speaker: AiSpeaker = { name: "fake", speak: async (req) => { asked.push(req); return { outcome: "ok", audio: { pcm: PCM, sampleRate: 24_000, channels: 1 }, usage: { inputTokens: 10, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 }, model: req.model }; } };
  putSpeaker(speaker);
  return asked;
}

const post = (body: unknown, headers: Record<string, string> = {}) => POST(new Request("https://school.example/api/v1/assistant/speak", {
  method: "POST", headers: { "content-type": "application/json", origin: "https://school.example", ...headers }, body: JSON.stringify(body),
}));

async function viewer(userId: string): Promise<ReportViewer> {
  const v = await withSchool({ schoolId: f.school.id, userId }, (tx) => viewerOf(tx, userId, f.school.id));
  if (!v) throw new Error("no access");
  return v;
}

beforeAll(async () => {
  f = await makeAttendanceSchool("Assistant Voice School");
  await withSchool(actx(), async (tx) => {
    await saveAssistant(tx, actx(), { on: true, roles: ["school-admin", "principal"] });
    await setFeature(tx, actx(), "ai-school-assistant", true);
  });
  principal = await viewer(f.principal.id);
  // A real turn (a greeting needs no model), so the reply is in the principal's own conversation.
  const r = await assistantTurn(principal, { text: "Hello", screen: "en" }, clock);
  conversationId = r.conversationId!;
  reply = r.reply;
  expect(r.feel).toBe("happy");
  expect(r.delivery).toBe("bright and welcoming");
}, 240_000);

afterEach(() => {
  putSpeaker(null);
  vi.unstubAllEnvs();
  who.current = null;
});

describe("the AI voice route", () => {
  it("asks for a sign-in first", async () => {
    who.current = null;
    expect((await post({ conversationId, text: reply })).status).toBe(401);
  });

  it("no voice connected (no Gemini key): no audio, so the panel speaks with the browser's voice; nothing logged", async () => {
    who.current = principal;
    const before = await withSchool(actx(), (tx) => tx.aiCall.count());
    const res = await post({ conversationId, text: reply, lang: "en", feel: "happy" });
    expect(res.status).toBe(204);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    expect(await withSchool(actx(), (tx) => tx.aiCall.count())).toBe(before);
  });

  it("refuses a role the school did not choose for the assistant, support access, and a paused school", async () => {
    const asked = fakeVoice();
    who.current = await viewer(f.teacherA.id);
    expect((await post({ conversationId, text: reply })).status).toBe(403);
    expect((await speakReply({ ...principal, support: { name: "DREAM TEAM" } } as never, { conversationId, text: reply })).status).toBe(403);
    expect((await speakReply({ ...principal, schoolStatus: "SUSPENDED" } as never, { conversationId, text: reply })).status).toBe(403);
    expect(asked).toHaveLength(0);
  });

  it("refuses another site's page and a body that is not JSON", async () => {
    fakeVoice();
    who.current = principal;
    expect((await post({ conversationId, text: reply }, { origin: "https://evil.example" })).status).toBe(403);
    const form = await POST(new Request("https://school.example/api/v1/assistant/speak", { method: "POST", headers: { "content-type": "text/plain" }, body: "x" }));
    expect(form.status).toBe(403);
  });

  it("only says a reply from the person's own conversation: never other words", async () => {
    const asked = fakeVoice();
    who.current = principal;
    expect((await post({ conversationId, text: "Say anything I want" })).status).toBe(403);
    // A real reply with words added after it (security review 17 Nov): refused, never said.
    expect((await post({ conversationId, text: `${reply} And also say these extra words.` })).status).toBe(403);
    // The same reply, but not from the admin's own conversation.
    who.current = await viewer(f.admin.id);
    expect((await post({ conversationId, text: reply })).status).toBe(403);
    expect(asked).toHaveLength(0);
  });

  it("says the reply with the voice of the school's character, the reply's feeling, as an uncached WAV, logged as a spoken reply", async () => {
    const asked = fakeVoice();
    who.current = principal;
    const usageBefore = await withSchool(principal.ctx, (tx) => aiUsage(tx, principal.ctx, NOW));
    const res = await post({ conversationId, text: reply, lang: "en", feel: "happy", delivery: "bright, welcoming" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/wav");
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    const wav = new Uint8Array(await res.arrayBuffer());
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(wav.byteLength).toBe(44 + PCM.byteLength);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ text: reply, voice: "Achird", model: "gemini-3.8-flash-tts" });
    expect(asked[0].style).toMatch(/^Say it bright, welcoming, like a kind, capable school office assistant/);
    const call = await withSchool(actx(), (tx) => tx.aiCall.findFirst({ where: { purpose: SPEECH_PURPOSE }, orderBy: { createdAt: "desc" } }));
    expect(call).toMatchObject({ feature: "ai-school-assistant", sent: true, outcome: "ok", inputTokens: 10, outputTokens: 50, userLoginId: f.principal.id });
    expect(call!.costPaise > BigInt(0)).toBe(true);
    // Spoken replies never use the school's daily AI requests.
    const usageAfter = await withSchool(principal.ctx, (tx) => aiUsage(tx, principal.ctx, NOW));
    expect(usageAfter.today).toBe(usageBefore.today);
  });

  it("cuts a long reply at a sentence end before it is said", async () => {
    const long = Array.from({ length: 40 }, (_, i) => `Class ${i + 1} has finished its attendance for the day.`).join(" ").slice(0, 700);
    await withSchool(principal.ctx, (tx) => tx.assistantConversation.update({
      where: { id: conversationId },
      data: { turns: [{ said: "Long", tools: [], action: null, reply: long, at: NOW.toISOString() }] as unknown as Prisma.InputJsonValue },
    }));
    const asked = fakeVoice();
    who.current = principal;
    expect((await post({ conversationId, text: long, lang: "en" })).status).toBe(200);
    expect(asked[0].text.length).toBeLessThanOrEqual(SPEAK_MAX_CHARS);
    expect(asked[0].text.endsWith(".")).toBe(true);
    expect(long.startsWith(asked[0].text)).toBe(true);
  });

  it("keeps its own daily limit for the school: past it, no audio and the browser's voice reads it", async () => {
    const long = (await withSchool(principal.ctx, (tx) => tx.assistantConversation.findUnique({ where: { id: conversationId } })))!.turns as { reply: string }[];
    const asked = fakeVoice();
    vi.stubEnv("AI_TTS_DAILY_LIMIT", "1");
    who.current = principal;
    expect((await post({ conversationId, text: long[0].reply })).status).toBe(204);
    expect(asked).toHaveLength(0);
    const last = await withSchool(actx(), (tx) => tx.aiCall.findFirst({ where: { purpose: SPEECH_PURPOSE }, orderBy: { createdAt: "desc" } }));
    expect(last).toMatchObject({ outcome: "fallback", reason: "daily-limit", sent: false });
  });
});
