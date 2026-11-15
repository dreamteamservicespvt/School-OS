"use client";

// One place on the screen for every toast (the saved-message toast, a page's own notice,
// the profile page's toasts). Each used to be fixed at the same spot, so two at once sat
// on top of each other and neither could be read. Now they line up in one column,
// newest at the bottom, and each stays while the pointer is on it or it holds the focus.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const TOAST_STACK_ID = "sos-toasts";
/** Above the phone's bottom bar; on a computer near the bottom edge. */
export const TOAST_STACK_CLS = "no-print fixed z-[60] inset-x-0 bottom-24 lg:bottom-6 flex flex-col items-center gap-2 px-4 pointer-events-none";
/** The dark pill itself: slides up 8 px and fades in over 180 ms (globals.css --animate-toast). */
export const TOAST_PILL_CLS = "pointer-events-auto animate-toast flex gap-3 max-w-md w-full md:w-auto bg-ink text-bg rounded-2xl pl-4 pr-2 py-2.5 shadow-pop";

function stack(): HTMLElement {
  let el = document.getElementById(TOAST_STACK_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = TOAST_STACK_ID;
    el.className = TOAST_STACK_CLS;
    document.body.appendChild(el);
  }
  return el;
}

/** Draws its toast in the shared column (after the page has loaded in the browser). */
export function ToastSlot({ children }: { children: React.ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setHost(stack()));
    return () => cancelAnimationFrame(frame);
  }, []);
  return host ? createPortal(children, host) : null;
}

/**
 * Hides a toast after `ms`, counted again from the start once the pointer leaves it or the
 * focus moves out, so a person reading it or reaching for Undo never loses it.
 */
export function useAutoHide(shown: unknown, ms: number, hide: () => void) {
  // Held for one toast only: a toast closed while the pointer was on it never makes the next one stay for good.
  const [heldFor, setHeldFor] = useState<unknown>(null);
  const held = heldFor != null && heldFor === shown;
  const hideRef = useRef(hide);
  useEffect(() => { hideRef.current = hide; }, [hide]);
  useEffect(() => {
    if (!shown || held) return;
    const t = setTimeout(() => hideRef.current(), ms);
    return () => clearTimeout(t);
  }, [shown, held, ms]);
  return {
    onPointerEnter: () => setHeldFor(shown),
    onPointerLeave: () => setHeldFor(null),
    onFocus: () => setHeldFor(shown),
    onBlur: (e: React.FocusEvent<HTMLElement>) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHeldFor(null); },
  };
}
