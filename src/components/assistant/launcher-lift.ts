// The assistant's round button floats at the bottom right of every screen. On a phone it sat on the right end of
// Take Attendance's Save button ("Save attendance: 26 present, 2 abs…", loop 17 Nov), and the same spot is where
// other pages keep their bottom bars (marks, report cards, approvals, the bulk-action bars). Every bar pinned to
// the bottom of a screen says so with data-action-bar (tests/assistant/launcher-lift.test.ts fails on one that
// does not), and the button moves up to sit just above whichever bar it would cover. It glides only when the
// person allows motion (the button's motion-safe classes); otherwise it jumps.
import { useEffect, type RefObject } from "react";

/** A box on the screen, in px from the top left of the window (what getBoundingClientRect gives). */
export type Box = { top: number; bottom: number; left: number; right: number };

/** Marks a bar pinned to the bottom of a screen, which the assistant button must not cover. */
export const ACTION_BAR = "[data-action-bar]";
/** The space kept between the button and the bar under it. */
export const LIFT_GAP = 12;
/** The button never rises into the top bar of the screen (64 px tall). */
const CEILING = 72;
/** A bar that moves this little in one frame of scrolling takes the button with it at once; a bigger move glides. */
const FOLLOW = 48;

/**
 * How many px the button at `home` (where its classes put it) must move up so it covers none of `bars`;
 * 0 when it covers none. Hidden bars (no size) and bars beside or above it don't count. Moving above one
 * bar can put it on another one stacked higher, so it keeps going until it is clear, but never above `ceiling`.
 */
export function launcherLift(home: Box, bars: readonly Box[], ceiling = CEILING, gap = LIFT_GAP): number {
  const shown = bars.filter((b) => b.bottom > b.top && b.right > b.left);
  let lift = 0;
  for (let round = 0; round <= shown.length; round++) {
    const top = home.top - lift, bottom = home.bottom - lift;
    const under = shown.filter((b) => b.left < home.right && b.right > home.left && b.top < bottom + gap && b.bottom > top);
    if (!under.length) break;
    lift = Math.max(lift, ...under.map((b) => home.bottom - b.top + gap));
  }
  return Math.round(Math.max(0, Math.min(lift, home.top - ceiling)));
}

/**
 * Keeps the button (while `shown`) clear of the screen's bottom bars: it looks again after every scroll, resize and
 * change on the page, at most once a frame, and moves the button with a transform (so nothing else moves).
 */
export function useLauncherLift(button: RefObject<HTMLElement | null>, shown: boolean) {
  useEffect(() => {
    const el = button.current;
    if (!shown || !el) return;
    let frame = 0, last = 0, scrolled = false;
    const place = () => {
      frame = 0;
      const following = scrolled;
      scrolled = false;
      const r = el.getBoundingClientRect();
      if (!r.width) return; // hidden (a number pad is on a phone's screen, or printing)
      // Where the button is now includes the lift it already has, part way through a glide too.
      const now = getComputedStyle(el).transform;
      const moved = now && now !== "none" ? new DOMMatrixReadOnly(now).m42 : 0;
      const home = { top: r.top - moved, bottom: r.bottom - moved, left: r.left, right: r.right };
      const lift = launcherLift(home, Array.from(document.querySelectorAll(ACTION_BAR), (b) => b.getBoundingClientRect()));
      if (lift === last) return;
      // At the end of a page a stuck bar scrolls up with the page: the button stays on it, with no glide lagging behind.
      el.style.transitionDuration = following && Math.abs(lift - last) <= FOLLOW ? "0s" : "";
      el.style.transform = lift ? `translateY(-${lift}px)` : "";
      last = lift;
    };
    const later = () => { if (!frame) frame = requestAnimationFrame(place); };
    const onScroll = () => { scrolled = true; later(); };
    const changes = new MutationObserver(later);
    changes.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class", "hidden", "open"] });
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", later, { passive: true });
    document.addEventListener("transitionend", later, true);
    document.addEventListener("animationend", later, true);
    later();
    return () => {
      cancelAnimationFrame(frame);
      changes.disconnect();
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", later);
      document.removeEventListener("transitionend", later, true);
      document.removeEventListener("animationend", later, true);
      el.style.transform = "";
      el.style.transitionDuration = "";
    };
  }, [button, shown]);
}
