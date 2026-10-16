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

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const SELECTOR = ".no-scrollbar";
const seen = new WeakSet<HTMLElement>();

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
    const frame = requestAnimationFrame(() => {
      for (const el of all()) { watch(el); bringSelectedIntoView(el); mark(el); }
    });
    let pending = 0;
    const refresh = () => {
      if (pending) return;
      pending = requestAnimationFrame(() => { pending = 0; for (const el of all()) { watch(el); mark(el); } });
    };
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", refresh);
    return () => {
      cancelAnimationFrame(frame);
      if (pending) cancelAnimationFrame(pending);
      observer.disconnect();
      window.removeEventListener("resize", refresh);
    };
  }, [pathname, search]);

  return null;
}
