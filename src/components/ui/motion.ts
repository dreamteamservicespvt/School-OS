// Motion helpers for scripts. The CSS side lives in src/app/globals.css ("Motion" and the
// reduced-motion block); scripts that scroll or move things ask here, so the device's
// "reduce motion" setting is kept in one place.

/** True when the person's device asks for less motion. Safe on the server (false). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The scroll behaviour to pass to scrollIntoView / scrollTo / scrollBy: a glide, or a jump when motion is reduced. */
export function calmScroll(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}
