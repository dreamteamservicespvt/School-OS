"use client";

// The school's session rules in the browser (Settings, Users & Permissions,
// "Password and session rules"). The server decides on every request
// (src/lib/auth/sessions.ts); this only makes an open page follow it: when
// the person has been away longer than the school allows, the page reloads and
// the server sends it to the sign-in page with "You were signed out because
// you were away". While the person types or taps on one page, it tells the
// server now and then, so a long form is not lost.
import { useEffect, useRef } from "react";
import { keepSignedIn } from "@/app/(school)/actions";

const CHECK_MS = 20_000;

export function AwayWatch({ idleMs, endsAt }: { idleMs: number; /** The longest sign-in's end (epoch ms), or null. */ endsAt: number | null }) {
  const last = useRef(0);
  const pinged = useRef(0);
  const asking = useRef(false);

  useEffect(() => {
    last.current = Date.now();
    pinged.current = Date.now();
    const pingEvery = Math.min(5 * 60_000, idleMs / 5);
    const reload = () => window.location.reload();
    const seen = () => { last.current = Date.now(); };
    const check = () => {
      const now = Date.now();
      if (now - last.current >= idleMs + 2_000 || (endsAt !== null && now >= endsAt + 2_000)) return reload();
      if (last.current > pinged.current && now - pinged.current >= pingEvery && !asking.current) {
        asking.current = true;
        pinged.current = now;
        keepSignedIn().then((live) => { if (!live) reload(); }).catch(() => null).finally(() => { asking.current = false; });
      }
    };
    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, seen, { passive: true, capture: true });
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(check, CHECK_MS);
    return () => {
      for (const e of events) window.removeEventListener(e, seen, { capture: true });
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [idleMs, endsAt]);

  return null;
}
