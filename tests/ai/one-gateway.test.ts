// The AI service layer (gap list G28) has one door, and the switches tell the
// truth (G24). No database and no network: these read the source and the
// pure rules.
// - Only src/lib/ai/provider.ts talks to the outside AI service, and only
//   aiTask() in src/lib/ai/index.ts uses it, so every request passes the
//   switches, the hiding of private details, the daily limit and the log.
// - The platform key is read in one place, from the environment.
// - A stand-in AI service works only inside the test runner.
// - Every AI feature a school can switch on is read by some screen or rule.
// - Restricted fields never leave, whatever they are called.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { aiConnected, useAiProvider, type AiProvider } from "@/lib/ai";
import { minimise } from "@/lib/ai/minimise";
import { AI_FEATURES } from "@/lib/settings/switch-rules";
import { matchColumns } from "@/lib/move-in/match";
import type { ImportColumn } from "@/lib/importer";

const SRC = path.resolve(import.meta.dirname, "../../src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}
const rel = (p: string) => path.relative(SRC, p).split(path.sep).join("/");
const sources = files(SRC).map((p) => ({ file: rel(p), text: readFileSync(p, "utf8") }));

describe("one door to the AI service", () => {
  it("only the provider talks to the AI service", () => {
    const talking = sources.filter((s) => /@anthropic-ai\/sdk|api\.anthropic\.com|generativelanguage|api\.openai\.com/.test(s.text)).map((s) => s.file);
    expect(talking).toEqual(["lib/ai/provider.ts"]);
  });

  it("only aiTask() uses the provider", () => {
    const users = sources.filter((s) => s.file !== "lib/ai/provider.ts" && /from\s+["'](\.\/provider|@\/lib\/ai\/provider|\.\.\/ai\/provider)["']/.test(s.text)).map((s) => s.file);
    expect(users).toEqual(["lib/ai/index.ts"]);
    // Nothing outside the gateway asks the provider directly.
    const asking = sources.filter((s) => !s.file.startsWith("lib/ai/") && /currentProvider|anthropicProvider/.test(s.text)).map((s) => s.file);
    expect(asking).toEqual([]);
  });

  it("the platform key is read only from the environment, in one place, and never written in the code", () => {
    const reading = sources.filter((s) => /ANTHROPIC_API_KEY/.test(s.text)).map((s) => s.file);
    expect(reading).toEqual(["lib/ai/config.ts"]);
    expect(sources.filter((s) => /sk-ant-[A-Za-z0-9]/.test(s.text)).map((s) => s.file)).toEqual([]);
  });
});

describe("a stand-in AI service", () => {
  const fake: AiProvider = { name: "fake", ask: async () => ({ outcome: "refused", usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, model: "x" }) };
  afterEach(() => {
    vi.unstubAllEnvs();
    useAiProvider(null);
  });

  it("is used inside the test runner only: a running school never answers from one or counts it as connected", () => {
    expect(aiConnected()).toBe(false);
    useAiProvider(fake);
    expect(aiConnected()).toBe(true);
    vi.stubEnv("VITEST", "");
    vi.stubEnv("NODE_ENV", "production");
    // Left in by mistake, it is ignored outside the tests, and a new one is refused.
    expect(aiConnected()).toBe(false);
    expect(() => useAiProvider(fake)).toThrow(/only be used by the tests/);
  });
});

describe("AI switches tell the truth", () => {
  it("every AI feature a school can switch on is read outside the list of switches (no dead switch)", () => {
    const outside = sources.filter((s) => s.file !== "lib/settings/switch-rules.ts" && !s.file.startsWith("app/(school)/settings/modules/"));
    for (const f of AI_FEATURES.filter((x) => x.status === "ready")) {
      expect(outside.some((s) => s.text.includes(`"${f.key}"`)), `${f.key} is never read`).toBe(true);
    }
  });

  it("AI question papers is hidden and nothing offers it", () => {
    expect(AI_FEATURES.find((f) => f.key === "ai-question-papers")?.status).toBe("hidden");
    const offering = sources.filter((s) => s.file !== "lib/settings/switch-rules.ts" && s.text.includes("ai-question-papers")).map((s) => s.file);
    expect(offering).toEqual([]);
  });
});

describe("restricted fields never leave", () => {
  it("stops APAAR, PEN, private notes and passwords as well as Aadhaar, bank, salary and counselling notes", () => {
    const r = minimise({ student: { name: "A", apaarId: "x", pen: "y", privateNotes: "z" }, login: { password: "p", accessToken: "t" } });
    expect(r.refused.sort()).toEqual(["APAAR and PEN numbers", "passwords and keys", "private notes"]);
    expect(JSON.stringify(r.value)).not.toMatch(/apaar|"pen"|private|password|token/i);
  });

  it("does not stop ordinary fields that only look alike", () => {
    const r = minimise({ pending: 2, openedBy: "A", photo: true, spending: 3, heading: "Pen Pal Club", tokens: 5 });
    expect(r.refused).toEqual([]);
  });
});

describe("Smart Import's own rules match by values (G18), before any AI", () => {
  const cols: ImportColumn[] = [
    { key: "fullName", label: "Full name", required: true },
    { key: "bloodGroup", label: "Blood group", required: false },
    { key: "joiningDate", label: "Joining date", required: false },
    { key: "leavingDate", label: "Leaving date", required: false },
  ] as ImportColumn[];

  it("an optional column whose kind of value nothing else holds is matched by its values alone", () => {
    const headers = ["Name", "BG", "Remarks"];
    const rows = [["Asha", "B +ve", "ok"], ["Ravi", "O-", "good"], ["Meena", "AB+", "fine"], ["Kiran", "a positive", "ok"]];
    expect(matchColumns("staff", cols, headers, rows)).toMatchObject({ fullName: [0], bloodGroup: [1] });
  });

  it("never guesses a date column by its values alone, or a column with too few values", () => {
    const headers = ["Name", "Created", "X"];
    const rows = [["Asha", "01-06-2024", "B+"], ["Ravi", "02-06-2024", ""], ["Meena", "03-06-2024", ""]];
    const m = matchColumns("staff", cols, headers, rows);
    expect(m.joiningDate).toBeUndefined();
    expect(m.leavingDate).toBeUndefined();
    expect(m.bloodGroup).toBeUndefined();
  });
});
