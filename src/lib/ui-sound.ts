"use client";

// Short, quiet sounds for the moments people care about (owner, 14 Nov: "there are no interesting
// sound effects"): something saved, money received, something sent, a problem. Made in the browser
// with Web Audio, no sound files. They follow the same "Sound on / off" switch as the bell
// (bell panel and My profile); bell-watch.tsx keeps soundOn up to date. Browsers allow sound only
// after the person has clicked or typed on the page, so the first page load stays silent.

export type UiSound = "saved" | "money" | "sent" | "problem" | "info";

let soundOn = false;
let ctx: AudioContext | null = null;
let unlockedOnce = false;

export function setUiSoundOn(on: boolean) {
  soundOn = on;
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      ctx = Ctx ? new Ctx() : null;
    } catch {
      ctx = null;
    }
  }
  return ctx;
}

/** Creates the sound engine on the person's first click or key press (browser autoplay rules). */
export function unlockUiSound() {
  if (unlockedOnce || typeof window === "undefined") return;
  unlockedOnce = true;
  const go = () => {
    const c = audio();
    if (c && c.state === "suspended") void c.resume();
  };
  window.addEventListener("pointerdown", go, { once: true, capture: true });
  window.addEventListener("keydown", go, { once: true, capture: true });
}

type Note = { f: number; at: number; len: number; type?: OscillatorType; to?: number };

function play(notes: Note[], volume: number) {
  const c = audio();
  if (!c || c.state !== "running") return;
  const t0 = c.currentTime + 0.01;
  for (const n of notes) {
    const g = c.createGain();
    g.connect(c.destination);
    g.gain.setValueAtTime(0.0001, t0 + n.at);
    g.gain.exponentialRampToValueAtTime(volume, t0 + n.at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.len);
    const o = c.createOscillator();
    o.type = n.type ?? "sine";
    o.frequency.setValueAtTime(n.f, t0 + n.at);
    if (n.to) o.frequency.exponentialRampToValueAtTime(n.to, t0 + n.at + n.len);
    o.connect(g);
    o.start(t0 + n.at);
    o.stop(t0 + n.at + n.len + 0.02);
  }
}

const SOUNDS: Record<UiSound, () => void> = {
  // A soft rising C-E-G: done.
  saved: () => play([{ f: 1046.5, at: 0, len: 0.16, type: "triangle" }, { f: 1318.5, at: 0.07, len: 0.16, type: "triangle" }, { f: 1568, at: 0.14, len: 0.3, type: "triangle" }], 0.07),
  // Two bright pings, like a coin: money in.
  money: () => play([{ f: 1975.5, at: 0, len: 0.09 }, { f: 2637, at: 0.08, len: 0.35 }, { f: 3951, at: 0.08, len: 0.2 }], 0.06),
  // A quick upward sweep: sent.
  sent: () => play([{ f: 520, to: 1560, at: 0, len: 0.18 }, { f: 1560, at: 0.17, len: 0.18, type: "triangle" }], 0.05),
  // A gentle low falling pair: something needs attention. Never harsh.
  problem: () => play([{ f: 392, at: 0, len: 0.16, type: "triangle" }, { f: 311, at: 0.13, len: 0.28, type: "triangle" }], 0.08),
  info: () => play([{ f: 1318.5, at: 0, len: 0.18 }], 0.04),
};

/** Which sound a screen message deserves. */
export function soundFor(tone: "success" | "info" | "danger", message: string): UiSound {
  if (tone === "danger") return "problem";
  if (tone === "info") return "info";
  if (/₹|\breceipt\b|\bcollected\b|\bpayment\b|\bpaid\b/i.test(message)) return "money";
  if (/\bsent\b|\bsend\b|\bshared\b|\bpublished\b|\bnotified\b/i.test(message)) return "sent";
  return "saved";
}

export function playUiSound(kind: UiSound) {
  if (!soundOn) return;
  try {
    SOUNDS[kind]();
  } catch {
    // No sound on this device.
  }
}
