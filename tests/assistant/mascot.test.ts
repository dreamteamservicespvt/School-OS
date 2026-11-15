// The mascot's feelings follow the real conversation (docs/assistant/plan.md,
// mascot-live.html): listening while the mic is on, thinking while a turn
// runs, speaking while the reply is spoken or shown, done after a confirmed
// change, sorry on a refusal or a problem, surprised when the language changes.
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  AFTER_MS, CAT_MOUTHS, CAT_POSES, FEELINGS, LipSync, LOOK, ROBOT_POSES, SCREENS, feelingFor, fxFor, mascotCharacterOf, poseFor, speakMouth, superellipse, syllables,
  type ReplyMoment,
} from "@/lib/assistant/mascot-state";

const idle = { listening: false, busy: false, moment: null as ReplyMoment };

describe("the mascot's feeling from the conversation", () => {
  it("is idle with nothing going on", () => {
    expect(feelingFor(idle)).toBe("idle");
  });

  it("listens while the mic is on, even over a reply still showing", () => {
    expect(feelingFor({ ...idle, listening: true })).toBe("listening");
    expect(feelingFor({ listening: true, busy: true, moment: { feel: "answer", phase: "speaking" } })).toBe("listening");
  });

  it("thinks while a turn runs", () => {
    expect(feelingFor({ ...idle, busy: true })).toBe("thinking");
  });

  it("speaks while a plain answer is read aloud or shown, then rests", () => {
    expect(feelingFor({ ...idle, moment: { feel: "answer", phase: "speaking" } })).toBe("speaking");
    expect(feelingFor({ ...idle, moment: { feel: "answer", phase: "after" } })).toBe("idle");
    expect(AFTER_MS.answer).toBe(0);
  });

  it("is done (with sparkles) after a confirmed change", () => {
    expect(feelingFor({ ...idle, moment: { feel: "done", phase: "speaking" } })).toBe("speaking");
    expect(feelingFor({ ...idle, moment: { feel: "done", phase: "after" } })).toBe("done");
    expect(fxFor("robot", "done")).toBe("done");
    expect(fxFor("cat", "done")).toBe("done");
  });

  it("is sorry for the whole of a refusal or a problem, never a happy speaking face", () => {
    expect(feelingFor({ ...idle, moment: { feel: "sorry", phase: "speaking" } })).toBe("sorry");
    expect(feelingFor({ ...idle, moment: { feel: "sorry", phase: "after" } })).toBe("sorry");
    expect(AFTER_MS.sorry).toBeGreaterThan(0);
  });

  it("is surprised for a moment when the person switches language", () => {
    expect(feelingFor({ ...idle, moment: { feel: "answer", phase: "surprise" } })).toBe("surprised");
  });
});

describe("the art for each feeling", () => {
  it("every feeling has a robot pose, a cat pose and a face; every pose has its art in public/assistant", () => {
    for (const f of FEELINGS) {
      expect(ROBOT_POSES).toContain(LOOK[f].robot);
      expect(CAT_POSES).toContain(LOOK[f].cat);
    }
    for (const p of [...ROBOT_POSES, ...CAT_POSES, ...CAT_MOUTHS]) {
      expect(existsSync(path.join(process.cwd(), "public", "assistant", `${p}.webp`)), p).toBe(true);
    }
  });

  it("uses the approved page's poses", () => {
    expect(poseFor("robot", "listening")).toBe("r-listen");
    expect(poseFor("robot", "thinking")).toBe("r-think");
    expect(poseFor("robot", "done")).toBe("r-cheer");
    expect(poseFor("robot", "sorry")).toBe("r-sorry");
    expect(poseFor("cat", "surprised")).toBe("c-surprised");
    expect(poseFor("cat", "speaking")).toBe("c-idle");
    // Tapping the idle mascot: the robot waves, the cat beams.
    expect(poseFor("robot", "idle", true)).toBe("r-wave");
    expect(poseFor("cat", "idle", true)).toBe("c-done");
  });

  it("the robot thinks on its own screen, so only the cat gets the thinking dots", () => {
    expect(fxFor("robot", "thinking")).toBeNull();
    expect(fxFor("cat", "thinking")).toBe("think");
    expect(fxFor("robot", "listening")).toBe("listen");
  });

  it("every robot pose has a measured face screen", () => {
    for (const p of ROBOT_POSES) {
      const sc = SCREENS[p];
      expect(sc.w).toBeGreaterThan(400);
      expect(sc.h).toBeGreaterThan(260);
      expect(superellipse(sc.w, sc.h, sc.n)).toMatch(/^M.*Z$/);
    }
  });

  it("the school's choice is Robot unless it chose Cat", () => {
    expect(mascotCharacterOf(undefined)).toBe("robot");
    expect(mascotCharacterOf("dragon")).toBe("robot");
    expect(mascotCharacterOf("cat")).toBe("cat");
  });
});

describe("the mouth moves with the words", () => {
  it("counts syllables in English and in Telugu or Hindi script", () => {
    expect(syllables("students")).toBe(2);
    expect(syllables("ఈరోజు")).toBeGreaterThanOrEqual(1);
    expect(syllables("हाज़िरी")).toBeGreaterThanOrEqual(1);
  });

  it("opens while a word is said and closes after the reply", () => {
    const lip = new LipSync(() => 1);
    const ends = lip.text("Twelve students are absent today.", 0);
    expect(ends).toBeGreaterThan(1);
    expect(lip.level(0.08)).toBeGreaterThan(0.5);
    expect(lip.level(ends + 1)).toBe(0);
    expect(lip.busy(ends + 1)).toBe(false);
  });

  it("draws a wider mouth when more open", () => {
    const h = (d: string) => Math.max(...[...d.matchAll(/-?\d+(\.\d+)?/g)].map((m) => Number(m[0])));
    expect(h(speakMouth(1))).toBeGreaterThan(h(speakMouth(0)));
  });
});
