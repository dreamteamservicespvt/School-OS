"use client";

import { useEffect } from "react";

/**
 * When the School Admin chooses one colour for everyone, every page of the
 * school uses it, whatever the person picked. The cookie keeps the next
 * page load from showing the old colour first.
 */
export function SchoolColour({ accent }: { accent: string | null }) {
  useEffect(() => {
    if (!accent) return;
    const root = document.documentElement;
    if (root.getAttribute("data-accent") !== accent) root.setAttribute("data-accent", accent);
    if (!document.cookie.split("; ").includes(`sos_accent=${accent}`)) {
      document.cookie = `sos_accent=${accent}; path=/; max-age=31536000; samesite=lax`;
    }
  }, [accent]);
  return null;
}
