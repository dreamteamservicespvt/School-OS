// The School OS Assistant's mascot (docs/assistant/mascot-live.html, approved by
// the owner): which feeling it shows, which piece of art each feeling uses, and
// the robot's face screen per pose, measured from the art. No browser and no
// server code here, so the panel, the mascot and the tests share it.

export type MascotCharacter = "robot" | "cat";
export const MASCOT_CHARACTERS: readonly MascotCharacter[] = ["robot", "cat"];
export const isMascotCharacter = (v: unknown): v is MascotCharacter => v === "robot" || v === "cat";
/** The school's choice (School preferences), Robot when none was made. */
export const mascotCharacterOf = (v: unknown): MascotCharacter => (v === "cat" ? "cat" : "robot");

export type Feeling = "idle" | "listening" | "thinking" | "speaking" | "done" | "sorry" | "surprised";
export const FEELINGS: readonly Feeling[] = ["idle", "listening", "thinking", "speaking", "done", "sorry", "surprised"];

/** How a reply ended, for the mascot: a plain answer, a confirmed change, or a refusal / problem. */
export type ReplyFeel = "answer" | "done" | "sorry";

/**
 * What the reply is doing right now: the moment after the language changed
 * ("surprise"), while it is read aloud or shown ("speaking"), and the short beat
 * after it ("after").
 */
export type ReplyMoment = { feel: ReplyFeel; phase: "surprise" | "speaking" | "after" } | null;

/**
 * The feeling from the real conversation: listening while the mic is on,
 * thinking while a turn runs, speaking while the reply is spoken or shown, done
 * after a confirmed change, sorry on a refusal or an error, surprised for a
 * moment when the person switches language. Otherwise idle.
 */
export function feelingFor(s: { listening: boolean; busy: boolean; moment: ReplyMoment }): Feeling {
  if (s.listening) return "listening";
  if (s.busy) return "thinking";
  const m = s.moment;
  if (!m) return "idle";
  if (m.phase === "surprise") return "surprised";
  if (m.feel === "sorry") return "sorry";
  if (m.phase === "speaking") return "speaking";
  return m.feel === "done" ? "done" : "idle";
}

/** How long the beat after a reply lasts before the mascot is idle again (ms). */
export const AFTER_MS: Record<ReplyFeel, number> = { answer: 0, done: 1700, sorry: 2200 };
export const SURPRISE_MS = 750;

export type RobotPose = "r-idle" | "r-wave" | "r-think" | "r-sorry" | "r-listen" | "r-cheer";
export type CatPose = "c-idle" | "c-listen" | "c-think" | "c-done" | "c-sorry" | "c-surprised";
export type Pose = RobotPose | CatPose;
export type RobotFace = "idle" | "listen" | "think" | "speak" | "done" | "sorry" | "surprised";

export const ROBOT_POSES: readonly RobotPose[] = ["r-idle", "r-wave", "r-think", "r-sorry", "r-listen", "r-cheer"];
export const CAT_POSES: readonly CatPose[] = ["c-idle", "c-listen", "c-think", "c-done", "c-sorry", "c-surprised"];
/** The cat's two speaking mouth frames, laid over c-idle. */
export const CAT_MOUTHS = ["c-speak-mid", "c-speak-open"] as const;

/** Each feeling's art and face (the approved page's table). */
export const LOOK: Record<Feeling, { robot: RobotPose; cat: CatPose; face: RobotFace; fx: "listen" | "think" | "done" | null }> = {
  idle: { robot: "r-idle", cat: "c-idle", face: "idle", fx: null },
  listening: { robot: "r-listen", cat: "c-listen", face: "listen", fx: "listen" },
  thinking: { robot: "r-think", cat: "c-think", face: "think", fx: "think" },
  speaking: { robot: "r-idle", cat: "c-idle", face: "speak", fx: null },
  done: { robot: "r-cheer", cat: "c-done", face: "done", fx: "done" },
  sorry: { robot: "r-sorry", cat: "c-sorry", face: "sorry", fx: null },
  surprised: { robot: "r-idle", cat: "c-surprised", face: "surprised", fx: null },
};

/** The pose for a feeling; the tap greeting waves (robot) or beams (cat). */
export function poseFor(character: MascotCharacter, feeling: Feeling, waving = false): Pose {
  if (waving) return character === "robot" ? "r-wave" : "c-done";
  return LOOK[feeling][character];
}

/** The effect around the head: the robot thinks on its own screen, so its thinking dots are not drawn. */
export function fxFor(character: MascotCharacter, feeling: Feeling, waving = false): "listen" | "think" | "done" | null {
  if (waving) return "done";
  const fx = LOOK[feeling].fx;
  return fx === "think" && character === "robot" ? null : fx;
}

/**
 * The robot's face screen per pose, measured from the art (1024 px space):
 * centre, size, tilt in degrees and the superellipse power of its corners.
 */
export const SCREENS: Record<RobotPose, { cx: number; cy: number; w: number; h: number; rot: number; n: number }> = {
  "r-idle": { cx: 530.9, cy: 364.7, w: 453.7, h: 298.7, rot: 2.42, n: 2.88 },
  "r-wave": { cx: 525.2, cy: 363.1, w: 447.6, h: 296.6, rot: 2.11, n: 2.83 },
  "r-think": { cx: 533.9, cy: 354.5, w: 447.6, h: 288.7, rot: -5.47, n: 2.79 },
  "r-sorry": { cx: 561.7, cy: 384.5, w: 423.8, h: 288.6, rot: 10.99, n: 2.86 },
  "r-listen": { cx: 510.4, cy: 361.8, w: 421.0, h: 285.5, rot: 7.65, n: 2.86 },
  "r-cheer": { cx: 530.4, cy: 352.5, w: 416.8, h: 270.9, rot: -3.05, n: 2.75 },
};
export const BASE_SCREEN = { w: 453.7, h: 298.7 };
/** The cat's head (for the effects around it), in 1024 px space. */
export const CAT_HEAD = { cx: 505, cy: 350, hw: 330 };

/** The rounded-rectangle outline of the face screen. */
export function superellipse(w: number, h: number, n: number, steps = 96): string {
  let d = "";
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    const x = (w / 2) * Math.sign(c) * Math.abs(c) ** (2 / n);
    const y = (h / 2) * Math.sign(s) * Math.abs(s) ** (2 / n);
    d += (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
  }
  return d + "Z";
}

/* ---------- Lip sync: mouth pulses from the words being said ---------- */

export const MOUTH_Y = 58;
/** The robot's speaking mouth, 0 closed to 1 wide open (face units). */
export function speakMouth(o: number): string {
  const w = 38 - o * 3, y = MOUTH_Y - 6, top = y + 9 - o * 3, bot = y + 16 + o * 68;
  return `M${(-w).toFixed(1)} ${y} Q0 ${top.toFixed(1)} ${w.toFixed(1)} ${y} Q0 ${bot.toFixed(1)} ${(-w).toFixed(1)} ${y}Z`;
}

/** Syllables in a word: vowel groups for Latin letters; for Telugu and Hindi script, about one per two letters. */
export function syllables(word: string): number {
  const w = word.toLowerCase();
  if (/[a-z]/.test(w)) return Math.max(1, (w.match(/[aeiouy]+/g) ?? []).length);
  const letters = [...w].filter((ch) => /\p{L}/u.test(ch)).length;
  return Math.max(1, Math.round(letters / 2));
}

type Pulse = { t0: number; d: number; peak: number };

/** Mouth movement for a reply: scheduled from the text, or word by word from the voice's boundary events. */
export class LipSync {
  private pulses: Pulse[] = [];
  constructor(private random: () => number = Math.random) {}
  clear() { this.pulses = []; }
  /** A word starting at `at` seconds; returns when it ends. */
  word(word: string, at: number, rate = 1): number {
    const n = syllables(word), d = 0.165 / rate;
    this.pulses = this.pulses.filter((p) => p.t0 < at);
    for (let i = 0; i < n; i++) this.pulses.push({ t0: at + i * d, d: d * 0.95, peak: 0.55 + this.random() * 0.45 });
    return at + n * d;
  }
  /** The whole text from `at`; returns when it ends (seconds). */
  text(text: string, at: number): number {
    let t = at;
    for (const w of text.split(/\s+/).filter(Boolean)) {
      t = this.word(w.replace(/[^\p{L}\p{N}₹]/gu, ""), t) + 0.06;
      if (/[.,!?।]$/.test(w)) t += 0.22;
    }
    return t;
  }
  /** How open the mouth is at `now` (0 to 1). */
  level(now: number): number {
    let v = 0;
    this.pulses = this.pulses.filter((p) => p.t0 + p.d > now - 0.05);
    for (const p of this.pulses) {
      const ph = (now - p.t0) / p.d;
      if (ph >= 0 && ph <= 1) v = Math.max(v, Math.sin(Math.PI * ph) * p.peak);
    }
    return v;
  }
  /** Whether any pulse is still to come or running. */
  busy(now: number) { return this.pulses.some((p) => p.t0 + p.d >= now); }
}

/** How long a reply shown without a voice keeps the mouth moving (seconds): long replies do not talk silently for long. */
export const SILENT_SPEAK_MAX = 3.2;
