"use client";
// Puts the record's name in front of the browser-tab title ("Gitanjali · Book · Library
// Management"), so several open tabs can be told apart. It is drawn inside the page, after the
// page's own access checks, so the name never shows to someone the page refuses.
import { useLayoutEffect } from "react";

export function RecordTitle({ name }: { name: string | null | undefined }) {
  useLayoutEffect(() => {
    const n = (name ?? "").trim().slice(0, 60);
    if (!n) return;
    const prefix = `${n} · `;
    const apply = () => { if (!document.title.startsWith(prefix)) document.title = prefix + document.title; };
    apply();
    // The page's own title can arrive a moment later (streamed metadata): put the name back in front.
    const watch = new MutationObserver(apply);
    watch.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => {
      watch.disconnect();
      if (document.title.startsWith(prefix)) document.title = document.title.slice(prefix.length);
    };
  }, [name]);
  return null;
}
