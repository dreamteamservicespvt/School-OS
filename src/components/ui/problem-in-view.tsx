"use client";

// A form's problem box that brings itself into view (QA ADMIT-02). After a
// refused save on a long form the problem shows at the top while the person is
// at the Save button, so the press seemed to do nothing. When a new problem
// appears (a new `token`, e.g. the action's result), the box scrolls into view
// and takes the focus, so a screen reader reads it. A problem already on the
// page when it first loads is left where it is.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cx } from "./cx";

const noop = () => () => {};

export function ProblemInView({ token, className, children }: { token: unknown; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // True only while the page's first HTML is being brought to life.
  const hydrating = useSyncExternalStore(noop, () => false, () => true);
  const [onFirstLoad] = useState(hydrating);
  const first = useRef(token);
  useEffect(() => {
    if (onFirstLoad && token === first.current) return;
    const el = ref.current;
    if (!el) return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
    el.focus({ preventScroll: true });
  }, [token, onFirstLoad]);
  return <div ref={ref} tabIndex={-1} className={cx("outline-none scroll-mt-20", className)}>{children}</div>;
}
