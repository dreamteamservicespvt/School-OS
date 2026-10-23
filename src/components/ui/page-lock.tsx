"use client";

// While any panel covers the page, the page behind it stays still, on every
// page, without each panel doing it itself. On a phone, scrolling a form sheet
// moved the page behind it (the sheet's scroll ran on to the page, and a swipe
// on the shaded part scrolled the page), because no sheet, dialog or menu
// locked the page.
//
// A panel counts while it is open as a modal <dialog> (showModal(): every
// Dialog, SheetForm, UrlSheet and Confirm), or while an element marked
// aria-modal="true" or data-scroll-lock is on the page (the menu drawer,
// search, notifications, the profile menu). Then <html> gets data-locked, which
// globals.css turns into overflow: hidden. The page keeps its place, so nothing
// jumps when the panel closes, and sticky headers stay where they were.
// The scroll inside the panel itself stops at its ends (overscroll-behavior,
// globals.css) instead of passing on.

import { useEffect } from "react";

export const LOCKING = '[aria-modal="true"], [data-scroll-lock]';

/** Is a panel open that should keep the page behind it still? */
export function panelOpen(doc: Pick<Document, "querySelector">): boolean {
  if (doc.querySelector(LOCKING)) return true;
  try {
    return doc.querySelector("dialog:modal") !== null;
  } catch {
    // A browser without :modal: any open <dialog> (ours are all modal).
    return doc.querySelector("dialog[open]") !== null;
  }
}

export function PageLock() {
  useEffect(() => {
    const html = document.documentElement;
    const update = () => {
      const lock = panelOpen(document);
      if (lock === html.hasAttribute("data-locked")) return;
      if (!lock) { html.removeAttribute("data-locked"); return; }
      // A computer's scrollbar disappears with overflow: hidden; keep its room so nothing shifts.
      html.setAttribute("data-locked", window.innerWidth > html.clientWidth ? "gutter" : "");
    };
    const watcher = new MutationObserver(update);
    watcher.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["open", "aria-modal", "data-scroll-lock"] });
    update();
    return () => { watcher.disconnect(); html.removeAttribute("data-locked"); };
  }, []);
  return null;
}
