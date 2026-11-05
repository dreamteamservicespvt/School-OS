"use client";

// The bell, kept up to date while a page is open (00-global.md §4). Every 30
// seconds, only while the tab is in front, it asks /api/v1/me/notifications
// whether anything new came. When something did, the page's bell and list are
// refreshed, and a short sound plays if the person has the sound on (bell
// panel or My profile). Browsers allow sound only after the person has
// clicked, tapped or typed on the page, so nothing plays before that. A check
// that finds nothing new changes nothing and stays silent. The sound is made
// in the browser (Web Audio); there is no sound file.
import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const EVERY_MS = 30_000;
export const SOUND_EVENT = "sos:bell-sound";
const CHIMED_KEY = "sos:bell-chimed";

type Poll = { unread: number; stamp: string; sound: boolean };

/** Is the new stamp a notification that arrived (not one read or done)? Stamps are "total:newestId". */
export function arrived(before: string, after: string): boolean {
  if (!before || before === after) return false;
  const [bt, bid] = before.split(":");
  const [at, aid] = after.split(":");
  const b = Number(bt) || 0;
  const a = Number(at) || 0;
  return a > b || (a === b && Boolean(aid) && aid !== bid);
}

/** A short two-note chime, quiet, made in the browser. */
function chime(ctx: AudioContext) {
  const t = ctx.currentTime;
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  for (const [freq, at] of [[880, 0], [1320, 0.12]] as const) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(freq, t + at);
    o.connect(gain);
    o.start(t + at);
    o.stop(t + at + 0.33);
  }
}

export function BellWatch({ unread, sound }: { unread: number; sound: boolean }) {
  const router = useRouter();
  const stamp = useRef<string | null>(null);
  const shown = useRef(unread);
  const soundOn = useRef(sound);
  const audio = useRef<AudioContext | null>(null);
  const stopped = useRef(false);
  const asking = useRef(false);

  useEffect(() => { soundOn.current = sound; }, [sound]);
  useEffect(() => { shown.current = unread; }, [unread]);

  const play = useCallback((s: string) => {
    if (!soundOn.current || !audio.current) return;
    // One chime for one new notification, even with School OS open in several tabs.
    try {
      if (localStorage.getItem(CHIMED_KEY) === s) return;
      localStorage.setItem(CHIMED_KEY, s);
    } catch { /* storage blocked: chime anyway */ }
    try {
      if (audio.current.state === "suspended") void audio.current.resume();
      chime(audio.current);
    } catch { /* no sound on this device */ }
  }, []);

  useEffect(() => {
    // The sound may play only after the person has used the page (browser autoplay rules).
    let made: AudioContext | null = null;
    const unlock = () => {
      if (made) return;
      try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) { made = new Ctx(); audio.current = made; }
      } catch { made = null; }
    };
    const onSound = (e: Event) => { soundOn.current = Boolean((e as CustomEvent<boolean>).detail); };
    const check = async () => {
      if (stopped.current || asking.current || document.visibilityState !== "visible") return;
      asking.current = true;
      try {
        const res = await fetch("/api/v1/me/notifications", { cache: "no-store", headers: { Accept: "application/json" } });
        if (res.status === 401) { stopped.current = true; return; }
        if (!res.ok) return;
        const p = (await res.json()) as Poll;
        soundOn.current = p.sound;
        const before = stamp.current;
        stamp.current = p.stamp;
        if (before === null) {
          // The first check only learns where things stand, unless the bell on the page is already behind.
          if (p.unread !== shown.current) router.refresh();
          return;
        }
        if (before === p.stamp && p.unread === shown.current) return;
        router.refresh();
        if (arrived(before, p.stamp)) play(p.stamp);
      } catch { /* offline: try again next time */ } finally {
        asking.current = false;
      }
    };
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    for (const e of ["pointerdown", "keydown", "touchstart"] as const) window.addEventListener(e, unlock, { passive: true, capture: true });
    window.addEventListener(SOUND_EVENT, onSound);
    document.addEventListener("visibilitychange", onVisible);
    void check();
    const timer = window.setInterval(() => void check(), EVERY_MS);
    return () => {
      for (const e of ["pointerdown", "keydown", "touchstart"] as const) window.removeEventListener(e, unlock, { capture: true });
      window.removeEventListener(SOUND_EVENT, onSound);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
      void made?.close().catch(() => null);
      audio.current = null;
    };
  }, [router, play]);

  return null;
}
