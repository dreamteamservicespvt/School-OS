// The School OS Assistant's panel is mounted only when the school switched it
// on for this role (School Feature "ai-school-assistant", default off, and the
// AI assistant), never for DREAM TEAM support access or a paused school. The
// mascot's look (Robot or Cat) is the school's choice, Robot by default.
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { withSchool } from "@/lib/db";
import { saveAssistant, setFeature } from "@/lib/settings/switches";
import { viewerOf } from "@/lib/reports/run";
import type { ReportViewer } from "@/lib/reports/types";
import { assistantPanelFor } from "@/lib/assistant/panel";
import { makeAttendanceSchool, type Fixture } from "../attendance/fixture";

let f: Fixture;
const actx = () => ({ schoolId: f.school.id, userId: f.admin.id });
type Who = Parameters<typeof assistantPanelFor>[0];

async function viewer(userId: string): Promise<Who> {
  const v: ReportViewer | null = await withSchool({ schoolId: f.school.id, userId }, (tx) => viewerOf(tx, userId, f.school.id));
  if (!v) throw new Error("no access");
  return v as unknown as Who;
}

beforeAll(async () => {
  f = await makeAttendanceSchool("Assistant Panel School");
}, 240_000);

describe("the panel mounts only when the switches allow", () => {
  it("is not mounted while the School Feature is off (the default)", async () => {
    expect(assistantPanelFor(await viewer(f.principal.id), "en")).toBeNull();
    // The AI assistant on is not enough: the School assistant feature has its own switch.
    await withSchool(actx(), (tx) => saveAssistant(tx, actx(), { on: true, roles: ["school-admin", "principal"] }));
    expect(assistantPanelFor(await viewer(f.principal.id), "en")).toBeNull();
  });

  it("mounts for a chosen role once switched on, as a Robot, with the school's name and first chips in each language", async () => {
    await withSchool(actx(), (tx) => setFeature(tx, actx(), "ai-school-assistant", true));
    const p = assistantPanelFor(await viewer(f.principal.id), "te");
    expect(p).not.toBeNull();
    expect(p!.character).toBe("robot");
    expect(p!.screen).toBe("te");
    expect(p!.school.name).toBe(f.school.name);
    expect(Object.keys(p!.chips).sort()).toEqual(["en", "hi", "te"]);
    expect(p!.chips.en.length).toBeGreaterThan(0);
    expect(p!.chips.te.join(" ")).toMatch(/[ఀ-౿]/);
  });

  it("is not mounted for a role the school did not choose, for support access, or while the school is paused", async () => {
    expect(assistantPanelFor(await viewer(f.teacherA.id), "en")).toBeNull();
    const principal = await viewer(f.principal.id);
    expect(assistantPanelFor({ ...principal, support: { name: "DREAM TEAM" } }, "en")).toBeNull();
    expect(assistantPanelFor({ ...principal, schoolStatus: "SUSPENDED" }, "en")).toBeNull();
    expect(assistantPanelFor({ ...principal, schoolStatus: "CLOSED" }, "en")).toBeNull();
  });

  it("the kill switch takes the panel away from every school", async () => {
    process.env.ASSISTANT_OFF = "1";
    try {
      expect(assistantPanelFor(await viewer(f.principal.id), "en")).toBeNull();
    } finally {
      delete process.env.ASSISTANT_OFF;
    }
  });

  it("the school layout mounts the panel only through this check", () => {
    const layout = readFileSync(path.join(process.cwd(), "src/app/(school)/layout.tsx"), "utf8");
    expect(layout).toContain("assistantPanelFor(current, lang)");
    expect(layout.match(/<AssistantPanel\b/g)).toHaveLength(1);
    expect(layout).toMatch(/\{assistant && <AssistantPanel\b/);
  });
});

describe("Robot or Cat, the school's choice", () => {
  it("saves Cat, keeps it when the choice is not sent, and writes it in the Audit Log", async () => {
    await withSchool(actx(), (tx) => saveAssistant(tx, actx(), { on: true, roles: ["school-admin", "principal"], character: "cat" }));
    expect(assistantPanelFor(await viewer(f.principal.id), "en")!.character).toBe("cat");
    await withSchool(actx(), (tx) => saveAssistant(tx, actx(), { on: true, roles: ["school-admin", "principal"] }));
    expect(assistantPanelFor(await viewer(f.principal.id), "en")!.character).toBe("cat");
    const audit = await withSchool(actx(), (tx) => tx.auditLogEntry.findFirst({ where: { action: "changed-ai-assistant" }, orderBy: { at: "desc" } }));
    expect(audit?.after).toMatchObject({ character: "cat" });
    await withSchool(actx(), (tx) => saveAssistant(tx, actx(), { on: true, roles: ["school-admin", "principal"], character: "robot" }));
    expect(assistantPanelFor(await viewer(f.principal.id), "en")!.character).toBe("robot");
  });

  it("refuses anything but Robot or Cat", async () => {
    await expect(withSchool(actx(), (tx) => saveAssistant(tx, actx(), { on: true, roles: ["principal"], character: "dragon" }))).rejects.toThrow("Choose Robot or Cat.");
  });
});
