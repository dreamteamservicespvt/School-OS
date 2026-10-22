"use client";

// Every row that scrolls sideways with its scrollbar hidden (class
// "no-scrollbar": module tabs, page tabs, chips, segmented filters) gets the
// same help, on every page, without changing each one:
// - the selected item (aria-current) is brought into view when a page opens,
//   so a tab at the far end is never hidden;
// - the row is marked data-more="left" | "right" | "both" while it has more
//   to see, which globals.css shows as a fade and, on computers, a thin
//   scrollbar;
// - on a computer the mouse wheel scrolls the row sideways.
// It only adds a data attribute and listeners; it never changes what React draws.
//
// It touches a row only once React has taken it over (hydrated it). A page
// streams in before React hydrates it, and this ran in between: the Student
// list's tabs and class chips got data-more="right" before React reached them,
// and React warned "A tree hydrated but some attributes of the server rendered
// HTML didn't match the client properties" (QA HYDRATE-01). A row React has not
// reached yet is looked at again a moment later.

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const SELECTOR = ".no-scrollbar";
const seen = new WeakSet<HTMLElement>();
/** How long to keep looking again for rows React has not reached yet: every 100 ms, for up to 10 seconds. */
const RETRY_MS = 100;
const RETRIES = 100;

/**
 * The key React keeps on every element it has hydrated or drawn ("__reactFiber$…"), read from an
 * element React already owns (<body>). Null when React keeps no such key: then nothing waits.
 */
export function reactKeyOf(owned: object): string | null {
  return Object.keys(owned).find((k) => k.startsWith("__reactFiber$")) ?? null;
}

/** Has React taken this element over yet? Until then it must not be changed (HYDRATE-01). */
export const isHydrated = (el: object, reactKey: string | null) => reactKey === null || reactKey in el;

function mark(el: HTMLElement) {
  const max = el.scrollWidth - el.clientWidth;
  const left = el.scrollLeft > 2;
  const right = max > 2 && el.scrollLeft < max - 2;
  const more = left && right ? "both" : left ? "left" : right ? "right" : null;
  if (more) el.dataset.more = more;
  else delete el.dataset.more;
}

function bringSelectedIntoView(el: HTMLElement) {
  if (el.scrollWidth <= el.clientWidth) return;
  const on = el.querySelector<HTMLElement>('[aria-current="page"], [aria-current="true"], [aria-selected="true"], [aria-checked="true"]');
  if (!on) return;
  const box = el.getBoundingClientRect();
  const item = on.getBoundingClientRect();
  if (item.left >= box.left && item.right <= box.right) return;
  el.scrollLeft += item.left - box.left - (box.width - item.width) / 2;
}

function watch(el: HTMLElement) {
  if (seen.has(el)) return;
  seen.add(el);
  el.addEventListener("scroll", () => mark(el), { passive: true });
  el.addEventListener("wheel", (e) => {
    // Only a plain up/down wheel over a row that can still move that way.
    if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY) || el.scrollWidth <= el.clientWidth) return;
    const max = el.scrollWidth - el.clientWidth;
    if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max)) return;
    e.preventDefault();
    el.scrollLeft += e.deltaY;
  }, { passive: false });
}

export function ScrollHints() {
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    const all = () => Array.from(document.querySelectorAll<HTMLElement>(SELECTOR));
    // A new page (or filter): bring each row's selected item into view once.
    const placed = new WeakSet<HTMLElement>();
    let retries = 0;
    let retry = 0;
    const sweep = () => {
      const key = reactKeyOf(document.body);
      let waiting = false;
      for (const el of all()) {
        // Not yet React's (still streaming in): look again shortly; after 10 seconds, go ahead.
        if (!isHydrated(el, key) && retries < RETRIES) { waiting = true; continue; }
        watch(el);
        if (!placed.has(el)) { placed.add(el); bringSelectedIntoView(el); }
        mark(el);
      }
      if (waiting && !retry) {
        retries++;
        retry = window.setTimeout(() => { retry = 0; refresh(); }, RETRY_MS);
      }
    };
    let pending = 0;
    const refresh = () => {
      if (pending) return;
      pending = requestAnimationFrame(() => { pending = 0; sweep(); });
    };
    const frame = requestAnimationFrame(sweep);
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", refresh);
    return () => {
      cancelAnimationFrame(frame);
      if (pending) cancelAnimationFrame(pending);
      if (retry) window.clearTimeout(retry);
      observer.disconnect();
      window.removeEventListener("resize", refresh);
    };
  }, [pathname, search]);

  return null;
}
