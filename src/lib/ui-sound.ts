"use client";

// Short, soft sounds for the moments people care about (owner, 14 Nov: "there are no interesting
// sound effects"; 15 Nov: "satisfying, not irritating"): something saved, money received, something
// sent, a problem, a new notification. Made in the browser with Web Audio, no sound files.
//
// What keeps them pleasant, not irritating:
// - warm, low-middle notes (a soft wooden-chime range, about 400-1,400 Hz), never thin high beeps;
// - a "pluck" shape: a few milliseconds to rise, then a natural fade, with a quiet lower partner note
//   that gives body;
// - everything passes one soft filter (cuts harshness), a light room echo and a limiter, at low volume;
// - plain information messages are silent, and the same sound never plays twice within 0.6 s (two
//   toasts at once make one sound).
// They follow the "Sound on / off" switch of the bell (bell panel and My profile); bell-watch.tsx
// keeps it up to date. Browsers allow sound only after the person has clicked or typed on the page.

export type UiSound = "saved" | "money" | "sent" | "problem" | "info" | "notify" | "big" | "logo";

let soundOn = false;
let ctx: AudioContext | null = null;
let out: AudioNode | null = null;
let unlockedOnce = false;
const lastPlayed = new Map<UiSound, number>();
let lastAny = 0;

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

/** The shared output: soft low-pass, a light room echo, a limiter, then the speakers. */
function output(c: AudioContext): AudioNode {
  if (out) return out;
  const soft = c.createBiquadFilter();
  soft.type = "lowpass";
  soft.frequency.value = 3200;
  soft.Q.value = 0.4;
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -18;
  limiter.knee.value = 12;
  limiter.ratio.value = 6;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.15;
  // A short, quiet echo: makes a dry beep sound like a small room.
  const delay = c.createDelay(0.5);
  delay.delayTime.value = 0.085;
  const feedback = c.createGain();
  feedback.gain.value = 0.22;
  const wet = c.createGain();
  wet.gain.value = 0.16;
  const dark = c.createBiquadFilter();
  dark.type = "lowpass";
  dark.frequency.value = 1800;
  soft.connect(limiter);
  soft.connect(delay);
  delay.connect(dark);
  dark.connect(feedback);
  feedback.connect(delay);
  dark.connect(wet);
  wet.connect(limiter);
  limiter.connect(c.destination);
  out = soft;
  return soft;
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

// THE SCHOOL OS SOUND (owner, 15 Nov: "create our own sound brand, so people know it is this software").
// One signature, "da-da-DING": C5, E5, A5 (Sa, Ga, Dha of the Mohanam family: bright and friendly),
// played on a soft wooden mallet (a warm marimba-like tone made in code). Every sound in the app is a
// piece of that signature, so even a short one sounds like School OS.
const C5 = 523.25, E5 = 659.25, A5 = 880, C6 = 1046.5, E6 = 1318.5, A6 = 1760, A4 = 440, E4 = 329.63;

/** One mallet note. `vol` scales the note; `soft` drops the click for a gentler touch. */
type Note = { f: number; at: number; len: number; vol?: number; soft?: boolean };

function play(notes: Note[], volume: number) {
  const c = audio();
  if (!c || c.state !== "running") return;
  const dest = output(c);
  const t0 = c.currentTime + 0.01;
  for (const n of notes) {
    const v = volume * (n.vol ?? 1);
    // The tone: a strong fundamental, a quiet octave below for body, and a very short high partial
    // (about 4x) that gives the soft "tok" of a wooden mallet, then fades at once.
    const parts: [number, number, number][] = [[1, 1, n.len], [0.5, 0.18, n.len * 0.8]];
    if (!n.soft) parts.push([3.93, 0.22, 0.05]);
    for (const [mult, share, len] of parts) {
      const g = c.createGain();
      g.connect(dest);
      g.gain.setValueAtTime(0.0001, t0 + n.at);
      g.gain.exponentialRampToValueAtTime(v * share, t0 + n.at + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + len);
      const o = c.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(n.f * mult, t0 + n.at);
      o.connect(g);
      o.start(t0 + n.at);
      o.stop(t0 + n.at + len + 0.03);
    }
  }
}

const SOUNDS: Record<UiSound, (() => void) | null> = {
  // The full signature with a soft shimmer: the School OS sound (welcome, the Assistant's hello).
  logo: () => play([{ f: C5, at: 0, len: 0.32, vol: 0.85 }, { f: E5, at: 0.12, len: 0.34, vol: 0.9 }, { f: A5, at: 0.24, len: 0.9 }, { f: A6, at: 0.26, len: 0.7, vol: 0.18, soft: true }], 0.06),
  // A big moment (results published, the day closed): the full signature, quicker.
  big: () => play([{ f: C5, at: 0, len: 0.26, vol: 0.8 }, { f: E5, at: 0.09, len: 0.28, vol: 0.85 }, { f: A5, at: 0.18, len: 0.7 }], 0.055),
  // Saved / done: the signature's last two notes.
  saved: () => play([{ f: E5, at: 0, len: 0.22, vol: 0.8 }, { f: A5, at: 0.085, len: 0.5 }], 0.05),
  // Money in: the whole signature an octave up and quick, like coins.
  money: () => play([{ f: C6, at: 0, len: 0.16, vol: 0.6 }, { f: E6, at: 0.06, len: 0.18, vol: 0.7 }, { f: A6, at: 0.12, len: 0.45, vol: 0.6 }], 0.035),
  // Sent: a leap from the first note to the last.
  sent: () => play([{ f: C5, at: 0, len: 0.18, vol: 0.75 }, { f: A5, at: 0.1, len: 0.5 }], 0.045),
  // Needs attention: the signature's step, low and falling, softly. Never a buzzer.
  problem: () => play([{ f: A4, at: 0, len: 0.24, soft: true }, { f: E4, at: 0.14, len: 0.42, soft: true }], 0.055),
  // Plain information makes no sound: it was the most frequent and least needed.
  info: null,
  // A new notification (the bell): the last two notes falling, like a gentle call.
  notify: () => play([{ f: A5, at: 0, len: 0.3, vol: 0.85 }, { f: E5, at: 0.13, len: 0.6 }], 0.045),
};

/** Which sound a screen message deserves. */
export function soundFor(tone: "success" | "info" | "danger", message: string): UiSound {
  if (tone === "danger") return "problem";
  if (tone === "info") return "info";
  if (/₹|\breceipt\b|\bcollected\b|\bpayment\b|\bpaid\b/i.test(message)) return "money";
  if (/\bresults? (are |were )?published\b|\bday (is |was )?closed\b|\bclosed the day\b|\ball done\b/i.test(message)) return "big";
  if (/\bsent\b|\bsend\b|\bshared\b|\bpublished\b|\bnotified\b/i.test(message)) return "sent";
  return "saved";
}

export function playUiSound(kind: UiSound) {
  if (!soundOn) return;
  const sound = SOUNDS[kind];
  if (!sound) return;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  // Two toasts at once, or a double click, make one sound.
  if (now - (lastPlayed.get(kind) ?? -1e9) < 600 || now - lastAny < 180) return;
  lastPlayed.set(kind, now);
  lastAny = now;
  try {
    const c = audio();
    if (c && c.state === "suspended") void c.resume();
    sound();
  } catch {
    // No sound on this device.
  }
}
